import assert from "node:assert/strict";
import { test } from "node:test";
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
