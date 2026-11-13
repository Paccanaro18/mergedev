import type { Project, Task } from "@merge/core";
import type { MergeApi } from "../../shared/api";
import { ChevronIcon, FolderIcon, GearIcon, PlusIcon } from "./Icons";

type ProviderInfo = Awaited<ReturnType<MergeApi["providers"]["list"]>>[number];

/** Last two path segments, so projects with the same folder name stay distinguishable. */
function shortPath(path: string): string {
  const parts = path.split(/[\/]+/).filter(Boolean);
  return parts.length <= 2 ? path : `…/${parts.slice(-2).join("/")}`;
}

export function Sidebar(props: {
  projects: Project[] | null;
  selectedId: string | null;
  tasks: Task[] | null;
  openTaskId: string | null;
  active: Set<string>;
  providers: ProviderInfo[];
  settingsOpen: boolean;
  onSelectProject: (id: string) => void;
  onOpenTask: (id: string) => void;
  onAddProject: () => void;
  onOpenSettings: () => void;
}) {
  const { projects, selectedId, tasks, openTaskId, active, providers, settingsOpen } = props;
  return (
    <aside className="sidebar">
      <header className="brand">
        <span className="brand-mark" aria-hidden="true" />
        <h1>Merge</h1>
      </header>

      <nav className="sidebar-scroll" aria-label="Projetos">
        <div className="section-head">
          <h2>Projetos</h2>
        </div>
        {projects === null ? (
          <p className="muted side-note">Carregando…</p>
        ) : projects.length === 0 ? (
          <p className="muted side-note">Nenhum projeto ainda.</p>
        ) : (
          <ul className="project-list">
            {projects.map((p) => {
              const selected = p.id === selectedId && !settingsOpen;
              const expanded = p.id === selectedId;
              return (
                <li key={p.id}>
                  <button
                    className={`project${selected ? " selected" : ""}`}
                    aria-expanded={expanded}
                    title={p.path}
                    onClick={() => props.onSelectProject(p.id)}
                  >
                    <span className={`chevron${expanded ? " open" : ""}`}>
                      <ChevronIcon />
                    </span>
                    <FolderIcon />
                    <span className="project-text">
                      <strong>{p.name}</strong>
                      <span className="path">{shortPath(p.path)}</span>
                    </span>
                  </button>
                  {expanded && tasks && tasks.length > 0 && (
                    <ul className="task-nav">
                      {tasks.map((t) => (
                        <li key={t.id}>
                          <button
                            className={`task-link${t.id === openTaskId ? " selected" : ""}`}
                            onClick={() => props.onOpenTask(t.id)}
                          >
                            <span className={`dot ${active.has(t.id) ? "running" : t.status}`} aria-hidden="true" />
                            <span className="task-link-title">{t.title}</span>
                            <span className="sr-only">{t.status}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <button className="add-project" onClick={props.onAddProject}>
          <PlusIcon /> Adicionar projeto
        </button>
      </nav>

      <footer className="sidebar-foot">
        <h2>Providers</h2>
        <ul className="provider-list">
          {providers.map((p) => (
            <li key={p.id}>
              <span className={`dot ${p.status.available ? "done" : "failed"}`} aria-hidden="true" />
              <strong>{p.displayName}</strong>{" "}
              <span className={p.status.available ? "ok" : "bad"}>
                {p.status.available ? "instalado" : `indisponível: ${p.status.reason ?? "?"}`}
              </span>
            </li>
          ))}
        </ul>
        <button className={`settings-link${settingsOpen ? " selected" : ""}`} onClick={props.onOpenSettings}>
          <GearIcon /> Configurações
        </button>
      </footer>
    </aside>
  );
}
