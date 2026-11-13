import type { AgentEvent } from "@merge/core";
import { useEffect, useState, type FormEvent } from "react";
import { Changes } from "./Changes";

/** Whether the run recorded a session id, which is what a follow-up resumes. */
export function hasSession(events: AgentEvent[]): boolean {
  return events.some((e) => e.type === "session.started" && !!e.sessionId);
}

/** A new instruction for a finished run; the agent keeps the context of that run's conversation. */
function FollowUp(props: {
  taskId: string;
  runId: string;
  /** Bumped when the worktree was kept or discarded, so the check below runs again. */
  reloadKey: unknown;
  onSend: (runId: string, prompt: string) => void;
}) {
  const { taskId, runId, reloadKey, onSend } = props;
  const [prompt, setPrompt] = useState("");
  /** Why a follow-up is not possible any more (the isolated folder is gone), if so. */
  const [blocked, setBlocked] = useState<string | null>(null);

  useEffect(() => {
    let stale = false;
    setBlocked(null);
    window.merge.runs
      .changes(taskId, runId)
      .then((c) => {
        if (stale) return;
        if (c.state === "kept" || c.state === "discarded") {
          setBlocked(
            `A branch deste run já foi ${c.state === "kept" ? "mantida" : "descartada"} e a pasta isolada não existe mais, então não dá para continuar esta conversa. Crie uma nova tarefa.`,
          );
        }
      })
      .catch(() => {});
    return () => {
      stale = true;
    };
  }, [taskId, runId, reloadKey]);

  function submit(e: FormEvent) {
    e.preventDefault();
    const text = prompt.trim();
    if (!text) return;
    setPrompt("");
    onSend(runId, text);
  }

  if (blocked) return <p className="muted follow-up">{blocked}</p>;
  return (
    <form className="follow-up" onSubmit={submit}>
      <label>
        Nova instrução
        <textarea
          rows={3}
          value={prompt}
          placeholder="Peça um ajuste ou a próxima etapa. O agente lembra desta conversa."
          onChange={(e) => setPrompt(e.target.value)}
        />
      </label>
      <button className="primary" type="submit" disabled={!prompt.trim()}>
        Enviar
      </button>
    </form>
  );
}

/** What follows a finished run: its worktree changes (keep or discard) and the follow-up field. */
export function RunFooter(props: {
  taskId: string;
  runId: string;
  events: AgentEvent[];
  /** True while the task is running; nothing is offered then. */
  running: boolean;
  reloadKey?: unknown;
  onFollowUp?: (runId: string, prompt: string) => void;
}) {
  const { taskId, runId, events, running, reloadKey, onFollowUp } = props;
  const [finishedVersion, setFinishedVersion] = useState(0);
  return (
    <>
      <Changes taskId={taskId} runId={runId} reloadKey={reloadKey} onFinished={() => setFinishedVersion((v) => v + 1)} />
      {!running && onFollowUp && hasSession(events) && (
        <FollowUp taskId={taskId} runId={runId} reloadKey={`${String(reloadKey)}:${finishedVersion}`} onSend={onFollowUp} />
      )}
    </>
  );
}
