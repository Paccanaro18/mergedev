// Manual end-to-end check of follow-ups: real Claude Code -> Runner (isolated worktree) -> SQLite.
// Run 1 creates a file in a worktree and learns a secret word; run 2 (follow-up) must remember
// the word and see the file, in the same worktree.
// Usage: node scripts/e2e-resume.mjs
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ClaudeCodeProvider } from "@merge/providers";
import { Runner } from "@merge/runner";
import { SqliteStore } from "@merge/store";
import { WorktreeManager } from "@merge/workspace";

const root = mkdtempSync(join(tmpdir(), "merge-resume-"));
const repo = join(root, "repo");
const git = (...a) => execFileSync("git", a, { cwd: repo, encoding: "utf8" });
execFileSync("git", ["init", "-q", repo]);
git("config", "user.name", "t"); git("config", "user.email", "t@example.com");
writeFileSync(join(repo, "README.md"), "demo\n");
git("add", "-A"); git("commit", "-q", "-m", "init");

const store = new SqliteStore(":memory:");
const project = store.createProject({ name: "e2e", path: repo });
const task = store.createTask({
  projectId: project.id,
  title: "resume",
  prompt: "Create a file named notes.txt containing the word hello, and remember this secret word: banana. Reply only: ok",
});
const runner = new Runner(store, [new ClaudeCodeProvider()], new WorktreeManager(join(root, "wt")));
const answer = (runId) => store.listEvents(runId).filter((e) => e.type === "run.finished").map((e) => e.summary).join();

const first = await runner.runTask(task.id, { providerId: "claude-code", isolate: true });
console.log("run 1:", first.status, "| reply:", answer(first.id));

const second = await runner.runTask(task.id, {
  providerId: "claude-code",
  isolate: true,
  resumeFromRunId: first.id,
  prompt: "What was the secret word? Also read notes.txt. Reply as: <word> <content of notes.txt>",
});
console.log("run 2:", second.status, "| reply:", answer(second.id));

const ws = (id) => store.listEvents(id).find((e) => e.type === "workspace.created");
console.log("same worktree:", ws(first.id)?.path === ws(second.id)?.path, "| worktrees created:", execFileSync("git", ["worktree", "list"], { cwd: repo, encoding: "utf8" }).trim().split("\n").length - 1);
console.log("session ids:", store.listEvents(first.id).find((e) => e.type === "session.started")?.sessionId, "->", store.listEvents(second.id).find((e) => e.type === "session.started")?.sessionId);
console.log("run 2 events:", store.listEvents(second.id).map((e) => e.type).join(", "));
console.log("original folder untouched:", git("status", "--porcelain").trim() === "");
store.close();
