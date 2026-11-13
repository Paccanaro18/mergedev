import type { PermissionMode, Project, ProviderSettings, ProviderStatus } from "@merge/core";
import { useEffect, useState } from "react";

type ProviderInfo = { id: string; displayName: string; status: ProviderStatus };

/** What the run uses when nothing is saved: the Claude Code adapter defaults to acceptEdits. */
const DEFAULT_MODE: PermissionMode = "acceptEdits";

const MODES: Array<{ value: PermissionMode; label: string; help: string }> = [
  { value: "default", label: "Pedir aprovação", help: "Edições e comandos fora da lista permitida pausam o run até você decidir." },
  { value: "acceptEdits", label: "Aceitar edições", help: "Edita arquivos sem perguntar. Comandos fora da lista ainda pedem aprovação." },
  { value: "plan", label: "Somente planejar", help: "O agente lê e propõe um plano, sem alterar nada." },
  { value: "bypassPermissions", label: "Não perguntar nada", help: "Executa tudo sem pedir aprovação. Use só em pastas descartáveis." },
];

const modeLabel = (mode: PermissionMode | undefined) => MODES.find((m) => m.value === (mode ?? DEFAULT_MODE))?.label ?? "";

/** Electron wraps errors thrown in the main process; show only the original message. */
function errorMessage(err: unknown): string {
  const text = err instanceof Error ? err.message : String(err);
  return text.replace(/^Error invoking remote method '[^']*': (Error: )?/, "");
}

const toToolsText = (tools: string[] | undefined) => (tools ?? []).join("\n");
const toToolsList = (text: string) => text.split("\n").map((t) => t.trim()).filter(Boolean);

/** Provider settings, global or for one project. The project's values override the global ones. */
export function Settings(props: {
  projects: Project[];
  providers: ProviderInfo[];
  /** Called after a save so the rest of the app can refresh the provider status. */
  onSaved: () => void;
  onError: (err: unknown) => void;
}) {
  const { projects, providers, onSaved, onError } = props;
  const [providerId, setProviderId] = useState(providers[0]?.id ?? "claude-code");
  /** "" is the global scope; otherwise a project id. */
  const [scope, setScope] = useState("");
  const [saved, setSaved] = useState<ProviderSettings | null>(null);
  const [globalSaved, setGlobalSaved] = useState<ProviderSettings>({});
  const [mode, setMode] = useState<PermissionMode | "">("");
  const [toolsText, setToolsText] = useState("");
  const [command, setCommand] = useState("");
  const [status, setStatus] = useState<ProviderStatus | "checking">("checking");
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  const projectId = scope || undefined;
  const provider = providers.find((p) => p.id === providerId);

  function load(settings: ProviderSettings) {
    setSaved(settings);
    setMode(settings.permissionMode ?? "");
    setToolsText(toToolsText(settings.allowedTools));
    setCommand(settings.command ?? "");
  }

  useEffect(() => {
    let stale = false;
    setSaved(null);
    setJustSaved(false);
    void Promise.all([
      window.merge.settings.get(providerId, projectId),
      window.merge.settings.get(providerId),
    ])
      .then(([own, global]) => {
        if (stale) return;
        load(own);
        setGlobalSaved(global);
      })
      .catch(onError);
    return () => {
      stale = true;
    };
  }, [providerId, projectId]);

  async function recheck() {
    setStatus("checking");
    try {
      setStatus(await window.merge.providers.check(providerId, projectId));
    } catch (err) {
      onError(err);
    }
  }
  useEffect(() => {
    void recheck();
  }, [providerId, projectId]);

  const draft: ProviderSettings = {
    permissionMode: mode || undefined,
    allowedTools: toToolsList(toolsText).length > 0 ? toToolsList(toolsText) : undefined,
    command: command.trim() || undefined,
  };
  const dirty =
    saved !== null &&
    (draft.permissionMode !== saved.permissionMode ||
      toToolsText(draft.allowedTools) !== toToolsText(saved.allowedTools) ||
      (draft.command ?? "") !== (saved.command ?? ""));

  async function save(settings: ProviderSettings) {
    setSaving(true);
    try {
      await window.merge.settings.set(providerId, settings, projectId);
      const fresh = await window.merge.settings.get(providerId, projectId);
      load(fresh);
      if (!projectId) setGlobalSaved(fresh);
      setJustSaved(true);
      onSaved();
      void recheck();
    } catch (err) {
      onError(err);
    } finally {
      setSaving(false);
    }
  }

  const inherits = projectId !== undefined;
  const effectiveMode = mode || globalSaved.permissionMode;

  return (
    <div className="settings">
      <h2>Configurações</h2>

      <div className="settings-scope">
        {providers.length > 1 && (
          <label>
            Provider
            <select value={providerId} onChange={(e) => setProviderId(e.target.value)}>
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.displayName}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          Escopo
          <select value={scope} onChange={(e) => setScope(e.target.value)}>
            <option value="">Global (todos os projetos)</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                Projeto: {p.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {inherits && (
        <p className="muted">Campos em branco usam o valor global. O que você preencher aqui vale só para este projeto.</p>
      )}

      <section className="settings-block">
        <h3>Status de {provider?.displayName ?? providerId}</h3>
        <p>
          {status === "checking" ? (
            <span className="muted">Verificando…</span>
          ) : status.available ? (
            <span className="ok">instalado</span>
          ) : (
            <span className="bad">indisponível: {status.reason ?? "motivo desconhecido"}</span>
          )}{" "}
          <button onClick={() => void recheck()}>Verificar de novo</button>
        </p>
        <p className="muted">A verificação só confirma que o comando executa. Ela não diz se você está logado.</p>
      </section>

      <section className="settings-block">
        <h3>Modo de permissão</h3>
        <div className="mode-list" role="radiogroup" aria-label="Modo de permissão">
          {inherits && (
            <label className="mode">
              <input type="radio" name="mode" checked={mode === ""} onChange={() => setMode("")} />
              <span>
                <strong>Usar o global</strong>
                <span className="muted"> ({modeLabel(globalSaved.permissionMode)}{globalSaved.permissionMode ? "" : ", padrão do Merge"})</span>
              </span>
            </label>
          )}
          {MODES.map((m) => (
            <label key={m.value} className="mode">
              <input type="radio" name="mode" checked={mode === m.value} onChange={() => setMode(m.value)} />
              <span>
                <strong>{m.label}</strong>
                <span className="muted mode-help">{m.help}</span>
              </span>
            </label>
          ))}
          {!inherits && (
            <label className="mode">
              <input type="radio" name="mode" checked={mode === ""} onChange={() => setMode("")} />
              <span>
                <strong>Padrão do Merge</strong>
                <span className="muted"> ({modeLabel(undefined)})</span>
              </span>
            </label>
          )}
        </div>
        {effectiveMode === "bypassPermissions" && (
          <p className="warn">Neste modo o agente executa comandos sem pedir sua aprovação.</p>
        )}
      </section>

      <section className="settings-block">
        <h3>Ferramentas permitidas</h3>
        <p className="muted">
          Uma por linha. Rodam sem pedir aprovação, por exemplo <code>Bash(npm test)</code> ou <code>Read</code>.
          {inherits && globalSaved.allowedTools?.length ? " Preencher aqui substitui a lista global." : ""}
        </p>
        <textarea
          rows={5}
          value={toolsText}
          placeholder={inherits ? toToolsText(globalSaved.allowedTools) || "Nenhuma" : "Nenhuma"}
          onChange={(e) => setToolsText(e.target.value)}
        />
      </section>

      <section className="settings-block">
        <h3>Caminho do binário</h3>
        <p className="muted">Em branco, o Merge usa o comando do PATH (<code>claude</code>).</p>
        <input
          value={command}
          placeholder={inherits ? (globalSaved.command ?? "claude") : "claude"}
          onChange={(e) => setCommand(e.target.value)}
        />
      </section>

      <div className="settings-actions">
        <button className="primary" disabled={!dirty || saving} onClick={() => void save(draft)}>
          Salvar
        </button>
        <button disabled={saving || saved === null || Object.keys(saved).length === 0} onClick={() => void save({})}>
          {inherits ? "Remover as configurações deste projeto" : "Restaurar o padrão"}
        </button>
        {justSaved && !dirty && <span className="ok">Salvo. Vale a partir do próximo run.</span>}
      </div>
    </div>
  );
}
