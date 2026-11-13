import type { Project } from "@merge/core";
import { useEffect, useState } from "react";
import type { MergeApi } from "../../shared/api";

type ProviderInfo = Awaited<ReturnType<MergeApi["providers"]["list"]>>[number];

export function App() {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [providers, setProviders] = useState<ProviderInfo[]>([]);

  useEffect(() => {
    void window.merge.projects.list().then(setProjects);
    void window.merge.providers.list().then(setProviders);
  }, []);

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
                <strong>{p.name}</strong>
                <span className="muted path">{p.path}</span>
              </li>
            ))}
          </ul>
        )}
      </aside>
      <main className="content">
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
      </main>
    </div>
  );
}
