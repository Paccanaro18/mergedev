import type { AgentEvent } from "./events.js";

export interface RunInput {
  prompt: string;
  /** Working directory the agent operates in. */
  cwd: string;
  signal?: AbortSignal;
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
  check(): Promise<ProviderStatus>;
  run(input: RunInput): AsyncIterable<AgentEvent>;
}
