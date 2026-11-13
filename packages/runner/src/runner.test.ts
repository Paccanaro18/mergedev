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

test("isolated run executes in the workspace folder and records workspace.created", async () => {
  const cwds: string[] = [];
  const provider: AgentProvider = {
    id: "fake",
    displayName: "Fake",
    check: async () => ({ available: true }),
    async *run({ cwd }) {
      cwds.push(cwd);
      yield { type: "run.finished", ok: true };
    },
  };
  const store = new SqliteStore(":memory:");
  const project = store.createProject({ name: "p", path: "/original" });
  const task = store.createTask({ projectId: project.id, title: "t", prompt: "hi" });
  const created: { repoPath: string; runId: string }[] = [];
  const runner = new Runner(store, [provider], {
    create: async (input) => {
      created.push(input);
      return { path: "/isolated", branch: "merge/run-x", baseCommit: "abc" };
    },
  });

  const run = await runner.runTask(task.id, { providerId: "fake", isolate: true });
  assert.deepEqual(cwds, ["/isolated"]);
  assert.deepEqual(created, [{ repoPath: "/original", runId: run.id }]);
  assert.deepEqual(store.listEvents(run.id)[0], {
    type: "workspace.created",
    path: "/isolated",
    branch: "merge/run-x",
    baseCommit: "abc",
  });

  // Without isolate the original folder is used, even when a workspace provider exists.
  await runner.runTask(task.id, { providerId: "fake" });
  assert.equal(cwds[1], "/original");
  assert.equal(created.length, 1);
});

test("workspace creation failure fails the run; isolate without a provider is rejected", async () => {
  const { store, task, runner: plain } = setup(fakeProvider([{ type: "run.finished", ok: true }]));
  await assert.rejects(plain.runTask(task.id, { providerId: "fake", isolate: true }), /workspace provider/);

  const runner = new Runner(store, [fakeProvider([{ type: "run.finished", ok: true }])], {
    create: async () => {
      throw new Error("not a git repo");
    },
  });
  const run = await runner.runTask(task.id, { providerId: "fake", isolate: true });
  assert.equal(run.status, "failed");
  assert.deepEqual(store.listEvents(run.id), [{ type: "error", message: "not a git repo" }]);
});

test("saved settings (project over provider) are passed to the provider and checked", async () => {
  const seen: unknown[] = [];
  const checked: unknown[] = [];
  const provider: AgentProvider = {
    id: "fake",
    displayName: "Fake",
    check: async (s) => {
      checked.push(s);
      return { available: true };
    },
    async *run({ settings }) {
      seen.push(settings);
      yield { type: "run.finished", ok: true };
    },
  };
  const store = new SqliteStore(":memory:");
  const project = store.createProject({ name: "p", path: process.cwd() });
  const task = store.createTask({ projectId: project.id, title: "t", prompt: "hi" });
  const runner = new Runner(store, [provider]);

  store.setProviderSettings("fake", { permissionMode: "plan", command: "/bin/fake" });
  await runner.runTask(task.id, { providerId: "fake" });
  store.setProviderSettings("fake", { permissionMode: "bypassPermissions" }, project.id);
  await runner.runTask(task.id, { providerId: "fake" });

  assert.deepEqual(seen, [
    { permissionMode: "plan", command: "/bin/fake" },
    { permissionMode: "bypassPermissions", command: "/bin/fake" },
  ]);
  assert.deepEqual(checked, seen);
});

test("onPermissionRequest reaches the provider with the run, and its events are persisted", async () => {
  const provider: AgentProvider = {
    id: "fake",
    displayName: "Fake",
    check: async () => ({ available: true }),
    async *run({ onPermissionRequest }) {
      yield { type: "permission.requested", requestId: "r1", tool: "Bash", input: { command: "npm i" } };
      const d = await onPermissionRequest!({ requestId: "r1", tool: "Bash", input: { command: "npm i" } });
      yield { type: "permission.resolved", requestId: "r1", decision: d.decision };
      yield { type: "run.finished", ok: true };
    },
  };
  const store = new SqliteStore(":memory:");
  const project = store.createProject({ name: "p", path: process.cwd() });
  const task = store.createTask({ projectId: project.id, title: "t", prompt: "hi" });
  const runner = new Runner(store, [provider]);

  const asked: string[] = [];
  const run = await runner.runTask(task.id, {
    providerId: "fake",
    onPermissionRequest: async (req, r) => {
      asked.push(`${req.tool}:${r.id}`);
      return { decision: "deny" };
    },
  });
  assert.deepEqual(asked, [`Bash:${run.id}`]);
  assert.deepEqual(store.listEvents(run.id).map((e) => e.type), ["permission.requested", "permission.resolved", "run.finished"]);
  assert.equal(store.listEvents(run.id)[1]?.type === "permission.resolved" && (store.listEvents(run.id)[1] as { decision: string }).decision, "deny");
});

/** Provider that records what it was asked and reports a session id. */
function sessionProvider() {
  const calls: { prompt: string; cwd: string; resumeSessionId?: string }[] = [];
  const provider: AgentProvider = {
    id: "fake",
    displayName: "Fake",
    check: async () => ({ available: true }),
    async *run({ prompt, cwd, resumeSessionId }) {
      calls.push({ prompt, cwd, resumeSessionId });
      yield { type: "session.started", sessionId: "sess-1" };
      yield { type: "run.finished", ok: true };
    },
  };
  return { provider, calls };
}

test("follow-up resumes the previous session with a new prompt and records it", async () => {
  const { provider, calls } = sessionProvider();
  const { store, task, runner } = setup(provider);
  const first = await runner.runTask(task.id, { providerId: "fake" });
  const second = await runner.runTask(task.id, { providerId: "fake", resumeFromRunId: first.id, prompt: "now do more" });

  assert.deepEqual(calls.map((c) => [c.prompt, c.resumeSessionId]), [
    ["hi", undefined],
    ["now do more", "sess-1"],
  ]);
  assert.deepEqual(store.listEvents(second.id)[0], { type: "message", role: "user", text: "now do more" });
  assert.equal(store.listRuns(task.id).length, 2);
});

test("follow-up of an isolated run continues in the same worktree", async () => {
  const { provider, calls } = sessionProvider();
  const store = new SqliteStore(":memory:");
  const project = store.createProject({ name: "p", path: process.cwd() });
  const task = store.createTask({ projectId: project.id, title: "t", prompt: "hi" });
  let created = 0;
  const runner = new Runner(store, [provider], {
    create: async () => {
      created++;
      return { path: process.cwd(), branch: "merge/run-x", baseCommit: "abc" }; // a folder that exists
    },
  });
  const first = await runner.runTask(task.id, { providerId: "fake", isolate: true });
  const second = await runner.runTask(task.id, { providerId: "fake", isolate: true, resumeFromRunId: first.id, prompt: "more" });

  assert.equal(created, 1, "no second worktree");
  assert.equal(calls[1]?.cwd, process.cwd());
  assert.equal(store.listEvents(second.id).some((e) => e.type === "workspace.created"), true);
});

test("follow-up is rejected when it cannot be resumed", async () => {
  const { provider } = sessionProvider();
  const { store, task, runner } = setup(provider);
  const first = await runner.runTask(task.id, { providerId: "fake" });
  const opts = { providerId: "fake", resumeFromRunId: first.id };
  await assert.rejects(runner.runTask(task.id, opts), /new instruction/);
  await assert.rejects(runner.runTask(task.id, { ...opts, resumeFromRunId: "nope", prompt: "x" }), /Run not found/);

  const noSession = store.createRun({ taskId: task.id, providerId: "fake" });
  await assert.rejects(runner.runTask(task.id, { ...opts, resumeFromRunId: noSession.id, prompt: "x" }), /no session/);

  const gone = store.createRun({ taskId: task.id, providerId: "fake" });
  store.appendEvent(gone.id, { type: "session.started", sessionId: "s" });
  store.appendEvent(gone.id, { type: "workspace.created", path: "/does/not/exist", branch: "b", baseCommit: "c" });
  await assert.rejects(runner.runTask(task.id, { ...opts, resumeFromRunId: gone.id, prompt: "x" }), /no longer exists/);
  assert.equal(store.listRuns(task.id).length, 3, "failed validations create no run");
});
