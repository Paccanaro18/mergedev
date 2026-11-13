import { useEffect, useState } from "react";
import type { ChangedFile, RunChanges } from "../../shared/api";

const STATUS_LABEL: Record<ChangedFile["status"], string> = {
  added: "novo",
  modified: "modificado",
  deleted: "removido",
  renamed: "renomeado",
  other: "alterado",
};

/** Patches can be huge; past this many lines only the start is rendered. */
const MAX_PATCH_LINES = 3000;

/** Electron wraps errors thrown in the main process; show only the original message. */
function errorMessage(err: unknown): string {
  const text = err instanceof Error ? err.message : String(err);
  return text.replace(/^Error invoking remote method '[^']*': (Error: )?/, "");
}

function lineClass(line: string): string {
  if (line.startsWith("+++") || line.startsWith("---") || line.startsWith("diff ") || line.startsWith("index ")) return "meta";
  if (line.startsWith("@@")) return "hunk";
  if (line.startsWith("+")) return "add";
  if (line.startsWith("-")) return "del";
  return "";
}

function Patch({ patch }: { patch: string }) {
  if (!patch.trim()) return <p className="muted">Nenhuma alteração nos arquivos.</p>;
  const lines = patch.split("\n");
  const shown = lines.slice(0, MAX_PATCH_LINES);
  return (
    <pre className="patch">
      {shown.map((line, i) => (
        <div key={i} className={`patch-line ${lineClass(line)}`}>
          {line || " "}
        </div>
      ))}
      {lines.length > shown.length && (
        <div className="patch-line muted">… mais {lines.length - shown.length} linhas não exibidas</div>
      )}
    </pre>
  );
}

/**
 * What an isolated run changed, with the buttons to keep or discard the branch.
 * After keeping or discarding the worktree folder is gone, so only the final result is shown.
 */
export function Changes(props: {
  taskId: string;
  runId: string;
  reloadKey?: unknown;
  /** Called after the branch was kept or discarded. */
  onFinished?: () => void;
}) {
  const { taskId, runId, reloadKey, onFinished } = props;
  const [changes, setChanges] = useState<RunChanges | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stale = false;
    setChanges(null);
    setNote(null);
    setError(null);
    setConfirmingDiscard(false);
    window.merge.runs
      .changes(taskId, runId)
      .then((c) => !stale && setChanges(c))
      .catch((err) => !stale && setError(errorMessage(err)));
    return () => {
      stale = true;
    };
  }, [taskId, runId, reloadKey]);

  async function finish(action: "keep" | "discard") {
    setBusy(true);
    setError(null);
    try {
      if (action === "keep") {
        const result = await window.merge.runs.keepChanges(taskId, runId);
        setNote(result.committed ? "As alterações pendentes foram commitadas na branch." : "Não havia alterações pendentes para commitar.");
      } else {
        await window.merge.runs.discardChanges(taskId, runId);
      }
      setChanges(await window.merge.runs.changes(taskId, runId));
      onFinished?.();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
      setConfirmingDiscard(false);
    }
  }

  if (error && !changes) {
    return (
      <section className="changes">
        <h3>Alterações</h3>
        <p className="bad">Não foi possível ler as alterações: {error}</p>
      </section>
    );
  }
  if (!changes || changes.state === "none" || changes.state === "running") return null;

  return (
    <section className="changes">
      <h3>
        Alterações <code className="muted">{changes.branch}</code>
      </h3>
      {changes.state === "pending" ? (
        <>
          {changes.files.length === 0 ? (
            <p className="muted">O agente não alterou nenhum arquivo.</p>
          ) : (
            <ul className="files">
              {changes.files.map((f) => (
                <li key={f.path}>
                  <span className={`file-status ${f.status}`}>{STATUS_LABEL[f.status]}</span>
                  <code>{f.path}</code>
                </li>
              ))}
            </ul>
          )}
          <Patch patch={changes.patch} />
          <div className="changes-actions">
            <button className="primary" disabled={busy} onClick={() => void finish("keep")}>
              Manter branch
            </button>
            {confirmingDiscard ? (
              <>
                <button className="danger" disabled={busy} onClick={() => void finish("discard")}>
                  Confirmar: apagar pasta e branch
                </button>
                <button disabled={busy} onClick={() => setConfirmingDiscard(false)}>
                  Voltar
                </button>
              </>
            ) : (
              <button disabled={busy} onClick={() => setConfirmingDiscard(true)}>
                Descartar
              </button>
            )}
          </div>
        </>
      ) : changes.state === "kept" ? (
        <>
          <p className="ok">Branch mantida. A pasta isolada foi removida e o projeto original não foi alterado.</p>
          {note && <p className="muted">{note}</p>}
          <div className="changes-actions">
            <button className="primary" disabled>
              Manter branch
            </button>
            <button disabled>Descartar</button>
          </div>
        </>
      ) : (
        <>
          <p className="muted">Descartado: a pasta isolada e a branch foram removidas.</p>
          <div className="changes-actions">
            <button className="primary" disabled>
              Manter branch
            </button>
            <button disabled>Descartar</button>
          </div>
        </>
      )}
      {error && <p className="bad">{error}</p>}
    </section>
  );
}
