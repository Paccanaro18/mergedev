import type { AgentEvent } from "@merge/core";

type Json = Record<string, unknown>;

const isObj = (v: unknown): v is Json => typeof v === "object" && v !== null;

/** Tool results come either as a string or as a list of content blocks. */
function stringifyContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((b) => (isObj(b) && typeof b.text === "string" ? b.text : JSON.stringify(b)))
      .join("\n");
  }
  return content == null ? "" : JSON.stringify(content);
}

/**
 * Translate one line of `claude -p --output-format stream-json` into zero or
 * more normalized events. Unknown or irrelevant lines (hooks, rate limits,
 * state changes) are ignored on purpose.
 */
export function parseClaudeLine(line: string): AgentEvent[] {
  let raw: unknown;
  try {
    raw = JSON.parse(line);
  } catch {
    return [];
  }
  if (!isObj(raw)) return [];

  switch (raw.type) {
    case "system": {
      if (raw.subtype !== "init") return [];
      const sessionId = typeof raw.session_id === "string" ? raw.session_id : undefined;
      return [{ type: "session.started", sessionId }];
    }
    case "assistant":
    case "user": {
      const message = isObj(raw.message) ? raw.message : undefined;
      const content = message?.content;
      if (typeof content === "string") {
        return [{ type: "message", role: raw.type, text: content }];
      }
      if (!Array.isArray(content)) return [];
      const events: AgentEvent[] = [];
      for (const block of content) {
        if (!isObj(block)) continue;
        if (block.type === "text" && typeof block.text === "string" && raw.type === "assistant") {
          events.push({ type: "message", role: "assistant", text: block.text });
        } else if (block.type === "tool_use") {
          events.push({
            type: "tool.call",
            callId: String(block.id),
            name: String(block.name),
            input: block.input,
          });
        } else if (block.type === "tool_result") {
          events.push({
            type: "tool.result",
            callId: String(block.tool_use_id),
            output: stringifyContent(block.content),
            isError: block.is_error === true ? true : undefined,
          });
        }
      }
      return events;
    }
    case "result": {
      const ok = raw.is_error !== true && raw.subtype === "success";
      return [
        {
          type: "run.finished",
          ok,
          summary: typeof raw.result === "string" ? raw.result : undefined,
          costUsd: typeof raw.total_cost_usd === "number" ? raw.total_cost_usd : undefined,
        },
      ];
    }
    default:
      return [];
  }
}
