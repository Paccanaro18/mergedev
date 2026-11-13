import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import type {
  AgentEvent,
  Id,
  PermissionMode,
  Project,
  ProviderSettings,
  Run,
  Store,
  Task,
} from "@merge/core";
import { MIGRATIONS } from "./schema.js";

type Row = Record<string, unknown>;

const toProject = (r: Row): Project => ({
  id: r.id as string,
  name: r.name as string,
  path: r.path as string,
  createdAt: r.created_at as number,
});

const toTask = (r: Row): Task => ({
  id: r.id as string,
  projectId: r.project_id as string,
  title: r.title as string,
  prompt: r.prompt as string,
  status: r.status as Task["status"],
  createdAt: r.created_at as number,
});

const toRun = (r: Row): Run => ({
  id: r.id as string,
  taskId: r.task_id as string,
  providerId: r.provider_id as string,
  status: r.status as Run["status"],
  startedAt: r.started_at as number,
  finishedAt: (r.finished_at as number | null) ?? undefined,
});

/** SQLite-backed Store. Pass ":memory:" for tests or a file path for real use. */
export class SqliteStore implements Store {
  private readonly db: DatabaseSync;

  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
    this.migrate();
  }

  close(): void {
    this.db.close();
  }

  private migrate(): void {
    const row = this.db.prepare("PRAGMA user_version").get() as { user_version: number };
    for (let v = row.user_version; v < MIGRATIONS.length; v++) {
      this.db.exec("BEGIN");
      try {
        this.db.exec(MIGRATIONS[v]!);
        this.db.exec(`PRAGMA user_version = ${v + 1}`);
        this.db.exec("COMMIT");
      } catch (err) {
        this.db.exec("ROLLBACK");
        throw err;
      }
    }
  }

  createProject({ name, path }: { name: string; path: string }): Project {
    const project: Project = { id: randomUUID(), name, path, createdAt: Date.now() };
    this.db
      .prepare("INSERT INTO projects (id, name, path, created_at) VALUES (?, ?, ?, ?)")
      .run(project.id, name, path, project.createdAt);
    return project;
  }

  getProject(id: Id): Project | undefined {
    const row = this.db.prepare("SELECT * FROM projects WHERE id = ?").get(id);
    return row ? toProject(row) : undefined;
  }

  listProjects(): Project[] {
    return this.db.prepare("SELECT * FROM projects ORDER BY created_at").all().map(toProject);
  }

  createTask(input: { projectId: Id; title: string; prompt: string }): Task {
    const task: Task = { id: randomUUID(), ...input, status: "todo", createdAt: Date.now() };
    this.db
      .prepare(
        "INSERT INTO tasks (id, project_id, title, prompt, status, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(task.id, task.projectId, task.title, task.prompt, task.status, task.createdAt);
    return task;
  }

  getTask(id: Id): Task | undefined {
    const row = this.db.prepare("SELECT * FROM tasks WHERE id = ?").get(id);
    return row ? toTask(row) : undefined;
  }

  listTasks(projectId: Id): Task[] {
    return this.db
      .prepare("SELECT * FROM tasks WHERE project_id = ? ORDER BY created_at")
      .all(projectId)
      .map(toTask);
  }

  updateTaskStatus(taskId: Id, status: Task["status"]): void {
    this.db.prepare("UPDATE tasks SET status = ? WHERE id = ?").run(status, taskId);
  }

  createRun({ taskId, providerId }: { taskId: Id; providerId: string }): Run {
    const run: Run = { id: randomUUID(), taskId, providerId, status: "running", startedAt: Date.now() };
    this.db
      .prepare("INSERT INTO runs (id, task_id, provider_id, status, started_at) VALUES (?, ?, ?, ?, ?)")
      .run(run.id, taskId, providerId, run.status, run.startedAt);
    return run;
  }

  listRuns(taskId: Id): Run[] {
    return this.db
      .prepare("SELECT * FROM runs WHERE task_id = ? ORDER BY started_at")
      .all(taskId)
      .map(toRun);
  }

  finishRun(runId: Id, status: Exclude<Run["status"], "running">): void {
    this.db
      .prepare("UPDATE runs SET status = ?, finished_at = ? WHERE id = ?")
      .run(status, Date.now(), runId);
  }

  getProviderSettings(providerId: string, projectId?: Id): ProviderSettings {
    const row = this.db
      .prepare("SELECT * FROM provider_settings WHERE provider_id = ? AND project_id = ?")
      .get(providerId, projectId ?? "");
    if (!row) return {};
    const settings: ProviderSettings = {};
    if (row.permission_mode != null) settings.permissionMode = row.permission_mode as PermissionMode;
    if (row.allowed_tools != null) settings.allowedTools = JSON.parse(row.allowed_tools as string);
    if (row.command != null) settings.command = row.command as string;
    return settings;
  }

  setProviderSettings(providerId: string, settings: ProviderSettings, projectId?: Id): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO provider_settings
         (provider_id, project_id, permission_mode, allowed_tools, command) VALUES (?, ?, ?, ?, ?)`,
      )
      .run(
        providerId,
        projectId ?? "",
        settings.permissionMode ?? null,
        settings.allowedTools ? JSON.stringify(settings.allowedTools) : null,
        settings.command ?? null,
      );
  }

  resolveProviderSettings(providerId: string, projectId: Id): ProviderSettings {
    const defined = (s: ProviderSettings) => Object.fromEntries(Object.entries(s).filter(([, v]) => v !== undefined));
    return {
      ...defined(this.getProviderSettings(providerId)),
      ...defined(this.getProviderSettings(providerId, projectId)),
    };
  }

  appendEvent(runId: Id, event: AgentEvent): void {
    this.db.prepare("INSERT INTO events (run_id, data) VALUES (?, ?)").run(runId, JSON.stringify(event));
  }

  listEvents(runId: Id): AgentEvent[] {
    return this.db
      .prepare("SELECT data FROM events WHERE run_id = ? ORDER BY seq")
      .all(runId)
      .map((r) => JSON.parse(r.data as string) as AgentEvent);
  }
}
