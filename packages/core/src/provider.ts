import type { AgentEvent } from "./events.js";

export interface PermissionRequest {
  requestId: string;
  callId?: string;
  tool: string;
  input: unknown;
  description?: string;
}

export interface PermissionDecision {
  decision: "allow" | "deny";
  /** Shown to the agent when denied, so it can adapt. */
  reason?: string;
}

export type PermissionMode = "default" | "acceptEdits" | "plan" | "bypassPermissions";

/** User configuration for a provider. Every field is optional; unset means "use the default". */
export interface ProviderSettings {
  permissionMode?: PermissionMode;
  /** Tools allowed without prompting, e.g. ["Bash(npm test)"]. */
  allowedTools?: string[];
  /** Path or name of the CLI binary. */
  command?: string;
}

export interface RunInput {
  prompt: string;
  /** Working directory the agent operates in. */
  cwd: string;
  signal?: AbortSignal;
  /** Effective settings (project over provider). Overrides the provider's constructor options. */
  settings?: ProviderSettings;
  /** Continue the conversation of this earlier session (its id comes from `session.started`). */
  resumeSessionId?: string;
  /**
   * Makes the run interactive: actions outside the allowed list pause the run and
   * call this. Without it the provider keeps the non-interactive behavior.
   * Rejecting counts as a denial.
   */
  onPermissionRequest?: (request: PermissionRequest) => Promise<PermissionDecision>;
}

export interface ProviderStatus {
  available: boolean;
  /** Why it is unavailable (not installed, not logged in...). */
  reason?: string;
}

export interface AgentProvider {
  /** Stable identifier, e.g. "claude-code", "codex". */
  readonly id: string;
  readonly displayName: string;
  check(settings?: ProviderSettings): Promise<ProviderStatus>;
  run(input: RunInput): AsyncIterable<AgentEvent>;
}
