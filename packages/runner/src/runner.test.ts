import assert from "node:assert/strict";
import { test } from "node:test";
import type { AgentEvent, AgentProvider } from "@merge/core";
import { SqliteStore } from "@merge/store";
import { Runner } from "./runner.js";

function fakeProvider(
  events: AgentEvent[],
  opts: { throwAfter?: boolean; available?: boolean } = {},
): AgentProvider {
  return {
    id: "fake",
    displayName: "Fake",
    check: async () =>
      opts.available === false ? { available: false, reason: "nope" } : { available: true },
    async *run() {
      for (const e of events) yield e;
      if (opts.throwAfter) throw new Error("boom");
    },
  };
}

function setup(provider: AgentProvider) {
  const store = new SqliteStore(":memory:");
  const project = store.createProject({ name: "p", path: process.cwd() });
  const task = store.createTask({ projectId: project.id, title: "t", prompt: "hi" });
  return { store, task, runner: new Runner(store, [provider]) };
}

test("successful run persists events and marks task done", async () => {
  const { store, task, runner } = setup(
    fakeProvider([
      { type: "message", role: "assistant", text: "hi" },
      { type: "run.finished", ok: true },
    ]),
  );
  const seen: string[] = [];
  const run = await runner.runTask(task.id, { providerId: "fake", onEvent: (e) => seen.push(e.type) });
  assert.equal(run.status, "succeeded");
  assert.deepEqual(seen, ["message", "run.finished"]);
  assert.equal(store.listEvents(run.id).length, 2);
  assert.equal(store.getTask(task.id)?.status, "done");
});

test("provider exception becomes a failed run with an error event", async () => {
  const { store, task, runner } = setup(fakeProvider([], { throwAfter: true }));
  const run = await runner.runTask(task.id, { providerId: "fake" });
  assert.equal(run.status, "failed");
  assert.deepEqual(store.listEvents(run.id), [{ type: "error", message: "boom" }]);
  assert.equal(store.getTask(task.id)?.status, "failed");
});

test("aborted run is cancelled and task returns to todo", async () => {
  const { store, task, runner } = setup(fakeProvider([{ type: "error", message: "cancelled" }]));
  const ctrl = new AbortController();
  ctrl.abort();
  const run = await runner.runTask(task.id, { providerId: "fake", signal: ctrl.signal });
  assert.equal(run.status, "cancelled");
  assert.equal(store.getTask(task.id)?.status, "todo");
});

test("rejects unknown provider and unavailable provider", async () => {
  const { task, runner } = setup(fakeProvider([], { available: false }));
  await assert.rejects(runner.runTask(task.id, { providerId: "other" }), /Unknown provider/);
  await assert.rejects(runner.runTask(task.id, { providerId: "fake" }), /unavailable: nope/);
});
