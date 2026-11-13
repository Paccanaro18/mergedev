/** Provider-agnostic events. Every adapter translates its CLI output into these. */
export type AgentEvent =
  | { type: "session.started"; sessionId?: string }
  | { type: "message"; role: "assistant" | "user"; text: string }
  | { type: "tool.call"; callId: string; name: string; input: unknown }
  | { type: "tool.result"; callId: string; output: string; isError?: boolean }
  | { type: "run.finished"; ok: boolean; summary?: string; costUsd?: number }
  | { type: "error"; message: string };
