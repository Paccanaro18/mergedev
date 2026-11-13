import { writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { app, BrowserWindow, dialog, ipcMain } from "electron";
import { ClaudeCodeProvider } from "@merge/providers";
import type { PermissionDecision } from "@merge/core";
import { Runner } from "@merge/runner";
import { SqliteStore } from "@merge/store";
import { WorktreeManager } from "@merge/workspace";
import { Channels, type RunSummary, type StartRunOptions } from "../shared/api";
import { registerSettingsIpc } from "./settings-ipc";
import { registerWorkspaceIpc } from "./workspace-ipc";

/** Active runs by task id, so they can be cancelled. */
const running = new Map<string, AbortController>();

/** Permission requests waiting for the user, by request id. Resolving one resumes the paused run. */
const pendingPermissions = new Map<string, (decision: PermissionDecision) => void>();

function registerIpc(store: SqliteStore, runner: Runner, worktrees: WorktreeManager): void {
  registerWorkspaceIpc(store, worktrees, running);
  registerSettingsIpc(store, () => runner.listProviders().map((p) => p.id));

  ipcMain.handle(Channels.projectsList, () => store.listProjects());
  ipcMain.handle(Channels.projectsAdd, async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const options = { properties: ["openDirectory" as const], title: "Escolha a pasta do projeto" };
    const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
    const path = result.filePaths[0];
    if (result.canceled || !path) return null;
    if (store.listProjects().some((p) => p.path === path)) {
      throw new Error("Essa pasta já está cadastrada como projeto.");
    }
    return store.createProject({ name: basename(path), path });
  });

  ipcMain.handle(Channels.tasksList, (_e, projectId: string) => store.listTasks(projectId));
  ipcMain.handle(
    Channels.tasksCreate,
    (_e, input: { projectId: string; title: string; prompt: string }) => {
      const title = input.title.trim();
      const prompt = input.prompt.trim();
      if (!title) throw new Error("Informe um título para a tarefa.");
      if (!prompt) throw new Error("Informe o que o agente deve fazer.");
      if (!store.getProject(input.projectId)) throw new Error("Projeto não encontrado.");
      return store.createTask({ projectId: input.projectId, title, prompt });
    },
  );
  ipcMain.handle(Channels.runsStart, async (event, taskId: string, options: StartRunOptions = {}) => {
    if (running.has(taskId)) throw new Error("Esta tarefa já está em execução.");
    const controller = new AbortController();
    running.set(taskId, controller);
    try {
      return await runner.runTask(taskId, {
        providerId: "claude-code",
        isolate: options.isolate === true,
        resumeFromRunId: options.resumeFromRunId,
        prompt: options.prompt,
        signal: controller.signal,
        // Pauses the run until the user answers through runs:respondPermission.
        // On cancel the adapter stops waiting by itself (it watches the signal); we only drop the entry.
        onPermissionRequest: ({ requestId }) =>
          new Promise<PermissionDecision>((resolve) => {
            if (controller.signal.aborted) return;
            const forget = () => pendingPermissions.delete(requestId);
            pendingPermissions.set(requestId, (decision) => {
              controller.signal.removeEventListener("abort", forget);
              forget();
              resolve(decision);
            });
            controller.signal.addEventListener("abort", forget, { once: true });
          }),
        onEvent: (e, run) => {
          if (!event.sender.isDestroyed()) {
            event.sender.send(Channels.runsEvent, { taskId, runId: run.id, event: e });
          }
        },
      });
    } finally {
      running.delete(taskId);
    }
  });
  ipcMain.handle(Channels.runsCancel, (_e, taskId: string) => {
    running.get(taskId)?.abort();
  });
  ipcMain.handle(
    Channels.runsRespondPermission,
    (_e, requestId: string, decision: "allow" | "deny", reason?: string) => {
      const answer = pendingPermissions.get(requestId);
      if (!answer) throw new Error("Este pedido de permissão não está mais aguardando resposta.");
      answer({ decision, reason });
    },
  );
  ipcMain.handle(Channels.runsList, (_e, taskId: string): RunSummary[] =>
    store.listRuns(taskId).map((run) => {
      const finished = store.listEvents(run.id).find((e) => e.type === "run.finished");
      return { ...run, costUsd: finished?.type === "run.finished" ? finished.costUsd : undefined };
    }),
  );
  ipcMain.handle(Channels.runsEvents, (_e, runId: string) => store.listEvents(runId));

  ipcMain.handle(Channels.providersList, async () =>
    Promise.all(
      runner.listProviders().map(async (p) => ({
        id: p.id,
        displayName: p.displayName,
        status: await p.check(store.getProviderSettings(p.id)),
      })),
    ),
  );
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1100,
    height: 720,
    show: false,
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  win.once("ready-to-show", () => win.show());
  // Never open new windows or navigate away from the app itself.
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (e) => e.preventDefault());

  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void win.loadFile(join(__dirname, "../renderer/index.html"));
  }
  return win;
}

void app.whenReady().then(() => {
  const dbPath = process.env.MERGE_DB_PATH ?? join(app.getPath("userData"), "merge.db");
  const store = new SqliteStore(dbPath);
  const worktrees = new WorktreeManager(join(app.getPath("userData"), "worktrees"));
  const runner = new Runner(store, [new ClaudeCodeProvider()], worktrees);
  registerIpc(store, runner, worktrees);

  const win = createWindow();

  // Dev/CI aid: MERGE_SMOKE_SHOT=<file.png> saves a screenshot once rendered, then quits.
  const shot = process.env.MERGE_SMOKE_SHOT;
  if (shot) {
    win.webContents.once("did-finish-load", () => {
      setTimeout(async () => {
        writeFileSync(shot, (await win.webContents.capturePage()).toPNG());
        app.quit();
      }, 1500);
    });
  }

  app.on("window-all-closed", () => {
    for (const controller of running.values()) controller.abort();
    pendingPermissions.clear();
    store.close();
    app.quit();
  });
});
