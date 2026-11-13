import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { promisify } from "node:util";
import { ipcMain } from "electron";
import type { Store } from "@merge/core";
import { WorktreeManager, type Workspace } from "@merge/workspace";
import { Channels, type WorkspaceStatus } from "../shared/api";

const execFileAsync = promisify(execFile);

/** The run, its task and project, found from the run id alone. */
function findRun(store: Store, runId: string) {
  for (const project of store.listProjects()) {
    for (const task of store.listTasks(project.id)) {
      if (store.listRuns(task.id).some((r) => r.id === runId)) return { project, task };
    }
  }
  return undefined;
}

async function branchExists(repoPath: string, branch: string): Promise<boolean> {
  try {
    await execFileAsync("git", ["rev-parse", "--verify", "--quiet", `refs/heads/${branch}`], { cwd: repoPath });
    return true;
  } catch {
    return false;
  }
}

export function registerWorkspaceIpc(
  store: Store,
  worktrees: WorktreeManager,
  /** Active runs by task id. */
  running: Map<string, unknown>,
): void {
  async function describe(runId: string) {
    const found = findRun(store, runId);
    if (!found) throw new Error("Run não encontrada.");
    const created = store.listEvents(runId).find((e) => e.type === "workspace.created");
    if (created?.type !== "workspace.created") {
      return { found, workspace: undefined, status: { state: "none" } as WorkspaceStatus };
    }
    const workspace: Workspace = {
      repoPath: found.project.path,
      path: created.path,
      branch: created.branch,
      baseCommit: created.baseCommit,
    };
    const state = existsSync(workspace.path)
      ? "active"
      : (await branchExists(workspace.repoPath, workspace.branch))
        ? "kept"
        : "discarded";
    const { path, branch, baseCommit } = workspace;
    return { found, workspace, status: { state, path, branch, baseCommit } as WorkspaceStatus };
  }

  /** The worktree of a run, only while its folder still exists. */
  async function active(runId: string) {
    const { found, workspace, status } = await describe(runId);
    if (!workspace) throw new Error("Esta run não usou um worktree isolado.");
    if (status.state !== "active") throw new Error("O worktree desta run não existe mais.");
    return { found, workspace };
  }

  ipcMain.handle(Channels.workspaceStatus, async (_e, runId: string) => (await describe(runId)).status);
  ipcMain.handle(Channels.workspaceDiff, async (_e, runId: string) => {
    const { workspace } = await active(runId);
    return worktrees.diff(workspace);
  });
  ipcMain.handle(Channels.workspaceKeep, async (_e, runId: string) => {
    const { found, workspace } = await active(runId);
    if (running.has(found.task.id)) throw new Error("A run ainda está em execução.");
    return worktrees.keep(workspace);
  });
  ipcMain.handle(Channels.workspaceDiscard, async (_e, runId: string) => {
    const { found, workspace } = await active(runId);
    if (running.has(found.task.id)) throw new Error("A run ainda está em execução.");
    await worktrees.discard(workspace);
  });
}
