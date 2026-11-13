import type { AgentEvent } from "@merge/core";

type Item =
  | { kind: "message"; role: "assistant" | "user"; text: string }
  | { kind: "tool"; name: string; input: unknown; output?: string; isError?: boolean }
  | { kind: "finished"; ok: boolean; summary?: string; costUsd?: number }
  | { kind: "error"; message: string };

/** Pairs each tool call with its result (by callId) and drops events that are not shown. */
export function toItems(events: AgentEvent[]): Item[] {
  const items: Item[] = [];
  const toolByCall = new Map<string, Extract<Item, { kind: "tool" }>>();
  for (const e of events) {
    switch (e.type) {
      case "message":
        items.push({ kind: "message", role: e.role, text: e.text });
        break;
      case "tool.call": {
        const tool = { kind: "tool" as const, name: e.name, input: e.input };
        toolByCall.set(e.callId, tool);
        items.push(tool);
        break;
      }
      case "tool.result": {
        const tool = toolByCall.get(e.callId);
        if (tool) {
          tool.output = e.output;
          tool.isError = e.isError;
        }
        break;
      }
      case "run.finished":
        items.push({ kind: "finished", ok: e.ok, summary: e.summary, costUsd: e.costUsd });
        break;
      case "error":
        items.push({ kind: "error", message: e.message });
        break;
      default:
        break;
    }
  }
  return items;
}

const pretty = (v: unknown) => (typeof v === "string" ? v : JSON.stringify(v, null, 2));

export function RunView({ events, running }: { events: AgentEvent[]; running: boolean }) {
  const items = toItems(events);
  return (
    <div className="run">
      {items.length === 0 && <p className="muted">{running ? "Iniciando…" : "Sem eventos."}</p>}
      {items.map((item, i) => {
        switch (item.kind) {
          case "message":
            return (
              <p key={i} className={`msg ${item.role}`}>
                {item.text}
              </p>
            );
          case "tool":
            return (
              <details key={i} className="tool">
                <summary>
                  <strong>{item.name}</strong>
                  {item.output === undefined ? (
                    <span className="muted"> executando…</span>
                  ) : item.isError ? (
                    <span className="bad"> erro</span>
                  ) : (
                    <span className="ok"> ok</span>
                  )}
                </summary>
                <pre>{pretty(item.input)}</pre>
                {item.output !== undefined && <pre className={item.isError ? "bad" : ""}>{item.output}</pre>}
              </details>
            );
          case "finished":
            return (
              <p key={i} className={item.ok ? "ok" : "bad"}>
                {item.ok ? "Concluído" : "Falhou"}
                {item.costUsd !== undefined && ` · US$ ${item.costUsd.toFixed(4)}`}
              </p>
            );
          case "error":
            return (
              <p key={i} className="bad">
                {item.message}
              </p>
            );
        }
      })}
      {running && items.length > 0 && <p className="muted">Em execução…</p>}
    </div>
  );
}
