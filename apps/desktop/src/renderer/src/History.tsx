import type { AgentEvent } from "@merge/core";
import { useEffect, useState } from "react";
import type { RunSummary } from "../../shared/api";
import { Changes } from "./Changes";
import { RunView } from "./RunView";

const STATUS_LABEL: Record<RunSummary["status"], string> = {
  running: "em execução",
  succeeded: "sucesso",
  failed: "falhou",
  cancelled: "cancelado",
};

function duration(run: RunSummary): string {
  if (!run.finishedAt) return "—";
  const s = Math.max(0, Math.round((run.finishedAt - run.startedAt) / 1000));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}min ${s % 60}s`;
}

/** Past runs of a task. Click one to reread the events that were recorded. */
export function History({ taskId, reloadKey }: { taskId: string; reloadKey: unknown }) {
  const [runs, setRuns] = useState<RunSummary[] | null>(null);
  const [openRunId, setOpenRunId] = useState<string | null>(null);
  const [events, setEvents] = useState<AgentEvent[]>([]);

  useEffect(() => {
    let stale = false;
    void window.merge.runs.list(taskId).then((list) => !stale && setRuns(list));
    return () => {
      stale = true;
    };
  }, [taskId, reloadKey]);

  useEffect(() => {
    if (!openRunId) return;
    let stale = false;
    void window.merge.runs.events(openRunId).then((list) => !stale && setEvents(list));
    return () => {
      stale = true;
    };
  }, [openRunId]);

  if (runs === null) return <p className="muted">Carregando…</p>;
  if (runs.length === 0) return <p className="muted">Nenhuma execução ainda.</p>;

  return (
    <div className="history">
      {[...runs].reverse().map((run) => (
        <div key={run.id}>
          <button
            className={`run-row${run.id === openRunId ? " selected" : ""}`}
            onClick={() => setOpenRunId(run.id === openRunId ? null : run.id)}
          >
            <span>{new Date(run.startedAt).toLocaleString()}</span>
            <span className="badge">{STATUS_LABEL[run.status]}</span>
            <span className="muted">{duration(run)}</span>
            <span className="muted">{run.costUsd !== undefined ? `US$ ${run.costUsd.toFixed(4)}` : "—"}</span>
          </button>
          {run.id === openRunId && (
            <>
              <RunView events={events} running={false} />
              <Changes taskId={taskId} runId={run.id} reloadKey={reloadKey} />
            </>
          )}
        </div>
      ))}
    </div>
  );
}
