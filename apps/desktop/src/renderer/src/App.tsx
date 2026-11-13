import type { Project, Task } from "@merge/core";
import { useEffect, useState, type FormEvent } from "react";
import type { MergeApi } from "../../shared/api";

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
  onCreated: (task: Task) => void;
  onError: (err: unknown) => void;
}) {
  const { project, tasks, onCreated, onError } = props;
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
              <strong>{t.title}</strong> <span className="badge">{t.status}</span>
              <span className="muted prompt">{t.prompt}</span>
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
