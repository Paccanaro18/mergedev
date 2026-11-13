import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { WorktreeManager } from "./worktree.js";

const root = mkdtempSync(join(tmpdir(), "merge-ws-"));
after(() => rmSync(root, { recursive: true, force: true }));

const git = (cwd: string, ...args: string[]) =>
  execFileSync("git", args, { cwd, encoding: "utf8" }).trim();

let n = 0;
/** A real git repo with one commit, plus a manager writing to a separate folder. */
function setup() {
  const dir = join(root, `case-${n++}`);
  const repo = join(dir, "repo");
  execFileSync("git", ["init", "-q", repo]);
  git(repo, "config", "user.name", "Test");
  git(repo, "config", "user.email", "test@example.com");
  writeFileSync(join(repo, "a.txt"), "one\n");
  git(repo, "add", "-A");
  git(repo, "commit", "-q", "-m", "init");
  return { dir, repo, mgr: new WorktreeManager(join(dir, "worktrees")) };
}

test("create makes an isolated worktree and leaves the original folder intact", async () => {
  const { repo, mgr } = setup();
  const ws = await mgr.create({ repoPath: repo, runId: "abcdef12-0000" });
  assert.equal(ws.branch, "merge/run-abcdef12");
  assert.ok(existsSync(join(ws.path, "a.txt")));

  writeFileSync(join(ws.path, "a.txt"), "changed\n");
  writeFileSync(join(ws.path, "new.txt"), "new\n");

  assert.equal(readFileSync(join(repo, "a.txt"), "utf8"), "one\n");
  assert.equal(existsSync(join(repo, "new.txt")), false);
  assert.equal(git(repo, "status", "--porcelain"), "");
});

test("diff reports modified and new files", async () => {
  const { repo, mgr } = setup();
  const ws = await mgr.create({ repoPath: repo, runId: "diff0001" });
  writeFileSync(join(ws.path, "a.txt"), "changed\n");
  writeFileSync(join(ws.path, "new.txt"), "new\n");
  const { files, patch } = await mgr.diff(ws);
  assert.deepEqual(
    files.sort((x, y) => x.path.localeCompare(y.path)),
    [
      { path: "a.txt", status: "modified" },
      { path: "new.txt", status: "added" },
    ],
  );
  assert.match(patch, /\+changed/);
  assert.match(patch, /\+new/);
});

test("diff is empty when nothing changed", async () => {
  const { repo, mgr } = setup();
  const ws = await mgr.create({ repoPath: repo, runId: "empty001" });
  assert.deepEqual(await mgr.diff(ws), { files: [], patch: "" });
});

test("list returns only Merge worktrees", async () => {
  const { dir, repo, mgr } = setup();
  git(repo, "worktree", "add", "-q", "-b", "other", join(dir, "other-wt"));
  assert.deepEqual(await mgr.list(repo), []);
  const ws = await mgr.create({ repoPath: repo, runId: "list0001" });
  const listed = await mgr.list(repo);
  assert.equal(listed.length, 1);
  assert.equal(listed[0]?.branch, ws.branch);
  assert.equal(listed[0]?.baseCommit, ws.baseCommit);
});

test("keep commits pending changes, removes the folder and keeps the branch", async () => {
  const { repo, mgr } = setup();
  const ws = await mgr.create({ repoPath: repo, runId: "keep0001" });
  writeFileSync(join(ws.path, "new.txt"), "new\n");
  const res = await mgr.keep(ws);
  assert.deepEqual(res, { branch: ws.branch, committed: true });
  assert.equal(existsSync(ws.path), false);
  assert.equal(git(repo, "show", `${ws.branch}:new.txt`), "new");
  assert.equal(existsSync(join(repo, "new.txt")), false);
});

test("discard removes the folder and the branch", async () => {
  const { repo, mgr } = setup();
  const ws = await mgr.create({ repoPath: repo, runId: "drop0001" });
  writeFileSync(join(ws.path, "new.txt"), "new\n");
  await mgr.discard(ws);
  assert.equal(existsSync(ws.path), false);
  assert.equal(git(repo, "branch", "--list", ws.branch), "");
  assert.deepEqual(await mgr.list(repo), []);
});

test("create fails clearly in a repo without commits and outside a git repo", async () => {
  const mgr = new WorktreeManager(join(root, "wt-none"));
  const empty = join(root, "empty-repo");
  execFileSync("git", ["init", "-q", empty]);
  await assert.rejects(mgr.create({ repoPath: empty, runId: "x" }), /git rev-parse failed/);
  const notRepo = mkdtempSync(join(root, "nogit-"));
  await assert.rejects(mgr.create({ repoPath: notRepo, runId: "y" }), /git rev-parse failed/);
});
