import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/** Branches created by Merge all start with this prefix. */
const BRANCH_PREFIX = "merge/run-";

export interface Workspace {
  /** The original repository the worktree was created from. */
  repoPath: string;
  /** Directory of the isolated worktree. */
  path: string;
  branch: string;
  /** Commit the worktree started from; the diff is computed against it. */
  baseCommit: string;
}

export interface DiffFile {
  path: string;
  status: "added" | "modified" | "deleted" | "renamed" | "other";
}

export interface WorkspaceDiff {
  files: DiffFile[];
  /** Unified diff of everything the run changed, including new files. */
  patch: string;
}

async function git(cwd: string, args: string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync("git", args, { cwd, maxBuffer: 64 * 1024 * 1024 });
    return stdout;
  } catch (err) {
    const e = err as { stderr?: string; message: string };
    const cmd = args.find((a) => !a.startsWith("-")) ?? args[0];
    throw new Error(`git ${cmd} failed: ${(e.stderr || e.message).trim()}`);
  }
}

const STATUS: Record<string, DiffFile["status"]> = {
  A: "added",
  M: "modified",
  D: "deleted",
  R: "renamed",
};

/**
 * Creates one git worktree (and branch) per run, so the agent never touches
 * the project's main folder. Uses the system `git`.
 */
export class WorktreeManager {
  /** @param baseDir folder where worktrees are created, one subfolder per run. */
  constructor(private readonly baseDir: string) {}

  /** Creates `merge/run-<id>` from the repo's current HEAD in `<baseDir>/<runId>`. */
  async create({ repoPath, runId }: { repoPath: string; runId: string }): Promise<Workspace> {
    const repo = resolve(repoPath);
    const baseCommit = (await git(repo, ["rev-parse", "--verify", "HEAD"])).trim();
    const path = resolve(this.baseDir, runId);
    const branch = `${BRANCH_PREFIX}${runId.slice(0, 8)}`;
    await git(repo, ["worktree", "add", "-b", branch, path, baseCommit]);
    return { repoPath: repo, path, branch, baseCommit };
  }

  /** Worktrees of this repo that Merge created and that still exist. */
  async list(repoPath: string): Promise<Workspace[]> {
    const repo = resolve(repoPath);
    const out = await git(repo, ["worktree", "list", "--porcelain"]);
    const result: Workspace[] = [];
    for (const block of out.split(/\r?\n\r?\n/)) {
      const lines = block.split(/\r?\n/);
      const path = lines.find((l) => l.startsWith("worktree "))?.slice("worktree ".length);
      const branch = lines.find((l) => l.startsWith("branch refs/heads/"))?.slice("branch refs/heads/".length);
      if (!path || !branch?.startsWith(BRANCH_PREFIX)) continue;
      const baseCommit = (await git(repo, ["merge-base", "HEAD", branch])).trim();
      result.push({ repoPath: repo, path: resolve(path), branch, baseCommit });
    }
    return result;
  }

  /** Everything the run changed relative to where it started (committed or not). */
  async diff(ws: Workspace): Promise<WorkspaceDiff> {
    // Stage inside the run's own worktree so new files show up in the diff.
    await git(ws.path, ["add", "-A"]);
    const names = await git(ws.path, ["diff", "--cached", "--name-status", ws.baseCommit]);
    const patch = await git(ws.path, ["diff", "--cached", ws.baseCommit]);
    const files = names
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line): DiffFile => {
        const [status = "", ...paths] = line.split("\t");
        return { path: paths[paths.length - 1] ?? "", status: STATUS[status[0] ?? ""] ?? "other" };
      });
    return { files, patch };
  }

  /** Commits pending changes to the branch and removes the worktree folder; the branch stays. */
  async keep(ws: Workspace): Promise<{ branch: string; committed: boolean }> {
    await git(ws.path, ["add", "-A"]);
    const pending = (await git(ws.path, ["status", "--porcelain"])).trim() !== "";
    if (pending) {
      const hasIdentity = await git(ws.path, ["config", "user.name"]).then(
        (n) => n.trim() !== "",
        () => false,
      );
      const identity = hasIdentity ? [] : ["-c", "user.name=Merge", "-c", "user.email=merge@localhost"];
      await git(ws.path, [...identity, "commit", "-m", `Merge run ${ws.branch}`]);
    }
    await git(ws.repoPath, ["worktree", "remove", "--force", ws.path]);
    return { branch: ws.branch, committed: pending };
  }

  /** Removes the worktree folder and deletes the branch. */
  async discard(ws: Workspace): Promise<void> {
    await git(ws.repoPath, ["worktree", "remove", "--force", ws.path]);
    await git(ws.repoPath, ["branch", "-D", ws.branch]);
  }
}
