/** Provider-agnostic events. Every adapter translates its CLI output into these. */
export type AgentEvent =
  | { type: "session.started"; sessionId?: string }
  /** Emitted by the runner when the run executes in an isolated git worktree. */
  | { type: "workspace.created"; path: string; branch: string; baseCommit: string }
  | { type: "message"; role: "assistant" | "user"; text: string }
  | { type: "tool.call"; callId: string; name: string; input: unknown }
  | { type: "tool.result"; callId: string; output: string; isError?: boolean }
  /** The agent paused and waits for the user to allow or deny an action. Answer through RunInput.onPermissionRequest. */
  | {
      type: "permission.requested";
      requestId: string;
      /** Same id as the matching tool.call, when the provider knows it. */
      callId?: string;
      tool: string;
      input: unknown;
      description?: string;
    }
  | { type: "permission.resolved"; requestId: string; decision: "allow" | "deny"; reason?: string }
  | { type: "run.finished"; ok: boolean; summary?: string; costUsd?: number }
  | { type: "error"; message: string };
