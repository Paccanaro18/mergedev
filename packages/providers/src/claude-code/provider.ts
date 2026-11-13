import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import type {
  AgentEvent,
  AgentProvider,
  PermissionDecision,
  ProviderSettings,
  ProviderStatus,
  RunInput,
} from "@merge/core";
import { parseClaudeLine } from "./parser.js";
import { permissionResponseLine, userMessageLine } from "./protocol.js";

export interface ClaudeCodeOptions {
  /** Path or name of the CLI binary. Defaults to "claude". */
  command?: string;
  /** Passed to --permission-mode. Headless runs cannot prompt, so default to acceptEdits. */
  permissionMode?: "default" | "acceptEdits" | "plan" | "bypassPermissions";
  /** Extra tools allowed without prompting, e.g. ["Bash(npm test)"]. */
  allowedTools?: string[];
}

const definedOnly = (s: ProviderSettings = {}): ProviderSettings =>
  Object.fromEntries(Object.entries(s).filter(([, v]) => v !== undefined));

/** CLI arguments for a run. Pure so it can be tested without spawning `claude`. */
export function buildClaudeArgs(options: ClaudeCodeOptions, { interactive = false } = {}): string[] {
  const args = ["-p"];
  // Interactive runs read stream-json from stdin and ask the host (us) about permissions.
  if (interactive) args.push("--input-format", "stream-json", "--permission-prompt-tool", "stdio");
  args.push(
    "--output-format", "stream-json",
    "--verbose",
    "--permission-mode", options.permissionMode ?? "acceptEdits",
  );
  if (options.allowedTools?.length) {
    args.push("--allowedTools", ...options.allowedTools);
  }
  return args;
}

/** Asks the user. Errors count as a denial; cancelling the run stops the wait. */
async function askUser(
  handler: NonNullable<RunInput["onPermissionRequest"]>,
  request: Extract<AgentEvent, { type: "permission.requested" }>,
  signal?: AbortSignal,
): Promise<PermissionDecision> {
  const aborted = new Promise<PermissionDecision>((resolve) => {
    signal?.addEventListener("abort", () => resolve({ decision: "deny", reason: "cancelled" }), { once: true });
  });
  const answer = handler({
    requestId: request.requestId,
    callId: request.callId,
    tool: request.tool,
    input: request.input,
    description: request.description,
  }).catch((err): PermissionDecision => ({
    decision: "deny",
    reason: err instanceof Error ? err.message : String(err),
  }));
  return signal?.aborted ? { decision: "deny", reason: "cancelled" } : Promise.race([answer, aborted]);
}

/**
 * Drives the official Claude Code CLI, so it uses whatever login the user
 * already has (e.g. a Pro subscription). No API key is involved.
 */
export class ClaudeCodeProvider implements AgentProvider {
  readonly id = "claude-code";
  readonly displayName = "Claude Code";
  private readonly command: string;

  constructor(private readonly options: ClaudeCodeOptions = {}) {
    this.command = options.command ?? "claude";
  }

  check(settings?: ProviderSettings): Promise<ProviderStatus> {
    const command = settings?.command ?? this.command;
    return new Promise((resolve) => {
      const child = spawn(command, ["--version"], { stdio: "ignore" });
      child.on("error", () =>
        resolve({ available: false, reason: `"${command}" not found in PATH` }),
      );
      child.on("exit", (code) =>
        resolve(code === 0 ? { available: true } : { available: false, reason: `exit code ${code}` }),
      );
    });
  }

  async *run({ prompt, cwd, signal, settings, onPermissionRequest }: RunInput): AsyncIterable<AgentEvent> {
    const interactive = onPermissionRequest !== undefined;
    const args = buildClaudeArgs({ ...this.options, ...definedOnly(settings) }, { interactive });
    const command = settings?.command ?? this.command;

    const child = spawn(command, args, { cwd, signal, stdio: ["pipe", "pipe", "pipe"] });
    // The prompt goes through stdin to avoid shell quoting problems.
    child.stdin.on("error", () => {}); // the process may die while we write (e.g. cancelled)
    if (interactive) {
      // Keep stdin open: permission answers go through it. Closed after the final result.
      child.stdin.write(userMessageLine(prompt));
    } else {
      child.stdin.end(prompt);
    }

    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (d: string) => (stderr += d));

    const exited = new Promise<number | null>((resolve) => {
      child.on("error", (err) => {
        stderr += err.message;
        resolve(null);
      });
      child.on("close", (code) => resolve(code));
    });

    let finished = false;
    for await (const line of createInterface({ input: child.stdout })) {
      for (const event of parseClaudeLine(line)) {
        if (event.type === "run.finished") {
          finished = true;
          if (interactive) child.stdin.end();
        }
        yield event;
        if (event.type === "permission.requested" && onPermissionRequest) {
          // The CLI is paused until we answer, so there is nothing else to read meanwhile.
          const decision = await askUser(onPermissionRequest, event, signal);
          if (signal?.aborted) continue;
          child.stdin.write(permissionResponseLine(event.requestId, event.input, decision));
          yield {
            type: "permission.resolved",
            requestId: event.requestId,
            decision: decision.decision,
            reason: decision.reason,
          };
        }
      }
    }

    const code = await exited;
    if (signal?.aborted) {
      yield { type: "error", message: "cancelled" };
    } else if (!finished) {
      yield { type: "error", message: stderr.trim() || `claude exited with code ${code}` };
    }
  }
}
