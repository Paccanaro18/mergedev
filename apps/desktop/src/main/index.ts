import { writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { app, BrowserWindow, dialog, ipcMain } from "electron";
import { ClaudeCodeProvider } from "@merge/providers";
import { Runner } from "@merge/runner";
import { SqliteStore } from "@merge/store";
import { Channels } from "../shared/api";

function registerIpc(store: SqliteStore, runner: Runner): void {
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
  ipcMain.handle(Channels.providersList, async () =>
    Promise.all(
      runner.listProviders().map(async (p) => ({
        id: p.id,
        displayName: p.displayName,
        status: await p.check(),
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
  const runner = new Runner(store, [new ClaudeCodeProvider()]);
  registerIpc(store, runner);

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
    store.close();
    app.quit();
  });
});
