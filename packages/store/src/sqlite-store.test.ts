import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { MIGRATIONS } from "./schema.js";
import { SqliteStore } from "./sqlite-store.js";

test("persists projects, tasks, runs and ordered events", () => {
  const store = new SqliteStore(":memory:");
  const project = store.createProject({ name: "demo", path: "/tmp/demo" });
  const task = store.createTask({ projectId: project.id, title: "t", prompt: "do it" });
  assert.equal(task.status, "todo");
  assert.deepEqual(store.getTask(task.id), task);
  assert.equal(store.listTasks(project.id).length, 1);

  const run = store.createRun({ taskId: task.id, providerId: "claude-code" });
  store.appendEvent(run.id, { type: "message", role: "assistant", text: "a" });
  store.appendEvent(run.id, { type: "run.finished", ok: true });
  store.finishRun(run.id, "succeeded");

  assert.deepEqual(store.listEvents(run.id).map((e) => e.type), ["message", "run.finished"]);
  const [saved] = store.listRuns(task.id);
  assert.equal(saved?.status, "succeeded");
  assert.ok(saved?.finishedAt);
});

test("getters return undefined for unknown ids", () => {
  const store = new SqliteStore(":memory:");
  assert.equal(store.getProject("nope"), undefined);
  assert.equal(store.getTask("nope"), undefined);
});

test("provider settings: scopes, project override and clearing", () => {
  const store = new SqliteStore(":memory:");
  const project = store.createProject({ name: "demo", path: "/tmp/demo" });
  assert.deepEqual(store.getProviderSettings("claude-code"), {});

  store.setProviderSettings("claude-code", {
    permissionMode: "plan",
    allowedTools: ["Bash(npm test)"],
    command: "claude",
  });
  store.setProviderSettings("claude-code", { permissionMode: "acceptEdits" }, project.id);

  assert.deepEqual(store.getProviderSettings("claude-code", project.id), { permissionMode: "acceptEdits" });
  assert.deepEqual(store.resolveProviderSettings("claude-code", project.id), {
    permissionMode: "acceptEdits",
    allowedTools: ["Bash(npm test)"],
    command: "claude",
  });
  assert.deepEqual(store.resolveProviderSettings("codex", project.id), {});

  store.setProviderSettings("claude-code", {}, project.id);
  assert.equal(store.resolveProviderSettings("claude-code", project.id).permissionMode, "plan");
});

test("migration v2 upgrades an existing v1 database and keeps its data", () => {
  const dir = mkdtempSync(join(tmpdir(), "merge-store-"));
  const file = join(dir, "merge.db");
  try {
    const old = new DatabaseSync(file);
    old.exec(MIGRATIONS[0]!);
    old.exec("PRAGMA user_version = 1");
    old.prepare("INSERT INTO projects (id, name, path, created_at) VALUES ('p1', 'old', '/old', 1)").run();
    old.close();

    const store = new SqliteStore(file);
    assert.equal(store.getProject("p1")?.name, "old");
    store.setProviderSettings("claude-code", { command: "claude" }, "p1");
    assert.deepEqual(store.getProviderSettings("claude-code", "p1"), { command: "claude" });
    store.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
