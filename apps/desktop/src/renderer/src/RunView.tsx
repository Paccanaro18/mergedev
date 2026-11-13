import type { AgentEvent } from "@merge/core";
import { useState } from "react";

type Item =
  | { kind: "message"; role: "assistant" | "user"; text: string }
  | { kind: "tool"; name: string; input: unknown; output?: string; isError?: boolean }
  | {
      kind: "permission";
      requestId: string;
      tool: string;
      input: unknown;
      description?: string;
      /** Unset while waiting for the user. */
      decision?: "allow" | "deny";
      reason?: string;
    }
  | { kind: "finished"; ok: boolean; summary?: string; costUsd?: number }
  | { kind: "error"; message: string };

/** Pairs each tool call with its result (by callId) and drops events that are not shown. */
export function toItems(events: AgentEvent[]): Item[] {
  const items: Item[] = [];
  const toolByCall = new Map<string, Extract<Item, { kind: "tool" }>>();
  const permissionByRequest = new Map<string, Extract<Item, { kind: "permission" }>>();
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
      case "permission.requested": {
        const item = {
          kind: "permission" as const,
          requestId: e.requestId,
          tool: e.tool,
          input: e.input,
          description: e.description,
        };
        permissionByRequest.set(e.requestId, item);
        items.push(item);
        break;
      }
      case "permission.resolved": {
        const item = permissionByRequest.get(e.requestId);
        if (item) {
          item.decision = e.decision;
          item.reason = e.reason;
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

/** True while the run is paused waiting for the user to allow or deny something. */
export function hasPendingPermission(events: AgentEvent[]): boolean {
  return toItems(events).some((i) => i.kind === "permission" && i.decision === undefined);
}

/** The command a tool wants to run (Bash), or its whole input as JSON. */
function commandOf(input: unknown): string {
  if (typeof input === "object" && input !== null && "command" in input && typeof input.command === "string") {
    return input.command;
  }
  return pretty(input);
}

function PermissionCard(props: {
  item: Extract<Item, { kind: "permission" }>;
  /** True while the run is alive, so an unanswered request can still be answered. */
  running: boolean;
  onRespond?: (requestId: string, decision: "allow" | "deny") => Promise<void>;
}) {
  const { item, running, onRespond } = props;
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const waiting = item.decision === undefined && running && onRespond !== undefined;

  async function answer(decision: "allow" | "deny") {
    if (!onRespond) return;
    setSending(true);
    setFailed(null);
    try {
      await onRespond(item.requestId, decision);
    } catch (err) {
      const text = err instanceof Error ? err.message : String(err);
      setFailed(text.replace(/^Error invoking remote method '[^']*': (Error: )?/, ""));
      setSending(false);
    }
  }

  return (
    <div className={`permission${waiting ? " waiting" : ""}`} role={waiting ? "alert" : undefined}>
      <div className="permission-head">
        <strong>{waiting ? "O agente quer usar uma ferramenta" : "Pedido de permissão"}</strong>
        {waiting ? (
          <span className="warn">aguardando você</span>
        ) : item.decision === "allow" ? (
          <span className="ok">permitido</span>
        ) : item.decision === "deny" ? (
          <span className="bad">negado</span>
        ) : (
          <span className="muted">encerrado sem resposta</span>
        )}
      </div>
      <div className="permission-row">
        <span className="muted">Ferramenta</span>
        <strong>{item.tool}</strong>
      </div>
      {item.description && item.description !== commandOf(item.input) && (
        <div className="permission-row">
          <span className="muted">Descrição</span>
          <span>{item.description}</span>
        </div>
      )}
      <pre className="permission-input">{commandOf(item.input)}</pre>
      {item.decision === "deny" && item.reason && <p className="muted">Motivo: {item.reason}</p>}
      {waiting && (
        <div className="permission-actions">
          <button disabled={sending} onClick={() => void answer("allow")}>
            Permitir
          </button>
          <button disabled={sending} onClick={() => void answer("deny")}>
            Negar
          </button>
        </div>
      )}
      {failed && <p className="bad">{failed}</p>}
    </div>
  );
}

export function RunView({
  events,
  running,
  onRespondPermission,
}: {
  events: AgentEvent[];
  running: boolean;
  /** Present only for a live run; past runs show the permission requests read-only. */
  onRespondPermission?: (requestId: string, decision: "allow" | "deny") => Promise<void>;
}) {
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
          case "permission":
            return <PermissionCard key={item.requestId} item={item} running={running} onRespond={onRespondPermission} />;
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
      {running && items.length > 0 && !hasPendingPermission(events) && <p className="muted">Em execução…</p>}
    </div>
  );
}
