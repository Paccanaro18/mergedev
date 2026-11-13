import type { AgentEvent, Project, Task } from "@merge/core";
import { useEffect, useState, type FormEvent } from "react";
import type { MergeApi } from "../../shared/api";
import { RunView } from "./RunView";

type ProviderInfo = Awaited<ReturnType<MergeApi["providers"]["list"]>>[number];

/** Electron wraps errors thrown in the main process; show only the original message. */
function errorMessage(err: unknown): string {
  const text = err instanceof Error ? err.message : String(err);
  return text.replace(/^Error invoking remote method '[^']*': (Error: )?/, "");
}

export function App() {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Live events by task id, kept while the app is open. */
  const [live, setLive] = useState<Record<string, AgentEvent[]>>({});
  const [active, setActive] = useState<Set<string>>(new Set());
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);

  const fail = (err: unknown) => setError(errorMessage(err));

  useEffect(() => {
    void window.merge.projects
      .list()
      .then((list) => {
        setProjects(list);
        setSelectedId((cur) => cur ?? list[0]?.id ?? null);
      })
      .catch(fail);
    void window.merge.providers.list().then(setProviders).catch(fail);
    return window.merge.runs.onEvent(({ taskId, event }) =>
      setLive((cur) => ({ ...cur, [taskId]: [...(cur[taskId] ?? []), event] })),
    );
  }, []);

  useEffect(() => {
    setTasks(null);
    if (!selectedId) return;
    let stale = false;
    void window.merge.tasks
      .list(selectedId)
      .then((list) => !stale && setTasks(list))
      .catch(fail);
    return () => {
      stale = true;
    };
  }, [selectedId]);

  async function runTask(taskId: string) {
    setError(null);
    setLive((cur) => ({ ...cur, [taskId]: [] }));
    setOpenTaskId(taskId);
    setActive((cur) => new Set(cur).add(taskId));
    setTasks((cur) => cur?.map((t) => (t.id === taskId ? { ...t, status: "running" } : t)) ?? cur);
    try {
      await window.merge.runs.start(taskId);
    } catch (err) {
      fail(err);
    } finally {
      setActive((cur) => {
        const next = new Set(cur);
        next.delete(taskId);
        return next;
      });
      // Status is updated by the runner; reload it.
      if (selectedId) void window.merge.tasks.list(selectedId).then(setTasks).catch(fail);
    }
  }

  async function addProject() {
    setError(null);
    try {
      const project = await window.merge.projects.add();
      if (!project) return;
      setProjects((cur) => [...(cur ?? []), project]);
      setSelectedId(project.id);
    } catch (err) {
      fail(err);
    }
  }

  const selected = projects?.find((p) => p.id === selectedId) ?? null;

  return (
    <div className="app">
      <aside className="sidebar">
        <h1>Merge</h1>
        <h2>Projetos</h2>
        {projects === null ? (
          <p className="muted">Carregando…</p>
        ) : projects.length === 0 ? (
          <p className="muted">Nenhum projeto ainda.</p>
        ) : (
          <ul>
            {projects.map((p) => (
              <li key={p.id}>
                <button
                  className={`project${p.id === selectedId ? " selected" : ""}`}
                  onClick={() => setSelectedId(p.id)}
                >
                  <strong>{p.name}</strong>
                  <span className="muted path">{p.path}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <button className="primary" onClick={() => void addProject()}>
          Adicionar projeto
        </button>
        <h2>Providers</h2>
        <ul>
          {providers.map((p) => (
            <li key={p.id}>
              <strong>{p.displayName}</strong>{" "}
              <span className={p.status.available ? "ok" : "bad"}>
                {p.status.available ? "disponível" : `indisponível: ${p.status.reason ?? "?"}`}
              </span>
            </li>
          ))}
        </ul>
      </aside>
      <main className="content">
        {error && (
          <div className="error" role="alert">
            {error}
            <button onClick={() => setError(null)}>fechar</button>
          </div>
        )}
        {selected ? (
          <TaskPanel
            project={selected}
            tasks={tasks}
            canRun={providers.some((p) => p.id === "claude-code" && p.status.available)}
            active={active}
            openTaskId={openTaskId}
            events={openTaskId ? (live[openTaskId] ?? []) : []}
            onOpen={setOpenTaskId}
            onRun={(id) => void runTask(id)}
            onCancel={(id) => void window.merge.runs.cancel(id)}
            onCreated={(task) => setTasks((cur) => [...(cur ?? []), task])}
            onError={fail}
          />
        ) : (
          <p className="muted">
            {projects?.length === 0
              ? "Adicione um projeto (uma pasta no disco) para começar."
              : "Selecione um projeto."}
          </p>
        )}
      </main>
    </div>
  );
}

function TaskPanel(props: {
  project: Project;
  tasks: Task[] | null;
  canRun: boolean;
  active: Set<string>;
  openTaskId: string | null;
  events: AgentEvent[];
  onOpen: (taskId: string) => void;
  onRun: (taskId: string) => void;
  onCancel: (taskId: string) => void;
  onCreated: (task: Task) => void;
  onError: (err: unknown) => void;
}) {
  const { project, tasks, canRun, active, openTaskId, events, onOpen, onRun, onCancel, onCreated, onError } = props;
  const [title, setTitle] = useState("");
  const [prompt, setPrompt] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const task = await window.merge.tasks.create({ projectId: project.id, title, prompt });
      onCreated(task);
      setTitle("");
      setPrompt("");
    } catch (err) {
      onError(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <h2>{project.name}</h2>
      <p className="muted path">{project.path}</p>

      <h2>Tarefas</h2>
      {tasks === null ? (
        <p className="muted">Carregando…</p>
      ) : tasks.length === 0 ? (
        <p className="muted">Nenhuma tarefa neste projeto ainda.</p>
      ) : (
        <ul>
          {tasks.map((t) => (
            <li key={t.id}>
              <strong>{t.title}</strong> <span className="badge">{t.status}</span>{" "}
              {active.has(t.id) ? (
                <button onClick={() => onCancel(t.id)}>Cancelar</button>
              ) : (
                <button disabled={!canRun} title={canRun ? "" : "Claude Code indisponível"} onClick={() => onRun(t.id)}>
                  Executar
                </button>
              )}{" "}
              <button onClick={() => onOpen(t.id)}>Ver execução</button>
              <span className="muted prompt">{t.prompt}</span>
              {openTaskId === t.id && <RunView events={events} running={active.has(t.id)} />}
            </li>
          ))}
        </ul>
      )}

      <form className="task-form" onSubmit={(e) => void submit(e)}>
        <h2>Nova tarefa</h2>
        <input placeholder="Título" value={title} onChange={(e) => setTitle(e.target.value)} />
        <textarea
          placeholder="O que o agente deve fazer?"
          rows={4}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
        />
        <button className="primary" type="submit" disabled={saving}>
          Criar tarefa
        </button>
      </form>
    </>
  );
}
