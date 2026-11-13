import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import type { AgentEvent, AgentProvider, ProviderStatus, RunInput } from "@merge/core";
import { parseClaudeLine } from "./parser.js";

export interface ClaudeCodeOptions {
  /** Path or name of the CLI binary. Defaults to "claude". */
  command?: string;
  /** Passed to --permission-mode. Headless runs cannot prompt, so default to acceptEdits. */
  permissionMode?: "default" | "acceptEdits" | "plan" | "bypassPermissions";
  /** Extra tools allowed without prompting, e.g. ["Bash(npm test)"]. */
  allowedTools?: string[];
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

  check(): Promise<ProviderStatus> {
    return new Promise((resolve) => {
      const child = spawn(this.command, ["--version"], { stdio: "ignore" });
      child.on("error", () =>
        resolve({ available: false, reason: `"${this.command}" not found in PATH` }),
      );
      child.on("exit", (code) =>
        resolve(code === 0 ? { available: true } : { available: false, reason: `exit code ${code}` }),
      );
    });
  }

  async *run({ prompt, cwd, signal }: RunInput): AsyncIterable<AgentEvent> {
    const args = [
      "-p",
      "--output-format", "stream-json",
      "--verbose",
      "--permission-mode", this.options.permissionMode ?? "acceptEdits",
    ];
    if (this.options.allowedTools?.length) {
      args.push("--allowedTools", ...this.options.allowedTools);
    }

    const child = spawn(this.command, args, { cwd, signal, stdio: ["pipe", "pipe", "pipe"] });
    // The prompt goes through stdin to avoid shell quoting problems.
    child.stdin.end(prompt);

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
        if (event.type === "run.finished") finished = true;
        yield event;
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
