import type { AgentEvent } from "./events.js";

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
