import type { AgentEvent, AgentProvider, Id, Run, Store } from "@merge/core";

/** Creates an isolated working copy for a run. `WorktreeManager` from @merge/workspace fits this. */
export interface WorkspaceProvider {
  create(input: {
    repoPath: string;
    runId: string;
  }): Promise<{ path: string; branch: string; baseCommit: string }>;
}

export interface RunTaskOptions {
  providerId: string;
  /** Run in an isolated worktree instead of the project folder. Needs a workspace provider. */
  isolate?: boolean;
  signal?: AbortSignal;
  /** Called for every event as it is produced (after being persisted). */
  onEvent?: (event: AgentEvent, run: Run) => void;
}

/**
 * Executes a Task with a provider inside the project directory, persisting
 * the run and every event. Knows nothing about specific providers.
 */
export class Runner {
  private readonly providers = new Map<string, AgentProvider>();

  constructor(
    private readonly store: Store,
    providers: AgentProvider[],
    private readonly workspaces?: WorkspaceProvider,
  ) {
    for (const p of providers) this.providers.set(p.id, p);
  }

  listProviders(): AgentProvider[] {
    return [...this.providers.values()];
  }

  async runTask(taskId: Id, { providerId, isolate, signal, onEvent }: RunTaskOptions): Promise<Run> {
    const task = this.store.getTask(taskId);
    if (!task) throw new Error(`Task not found: ${taskId}`);
    const project = this.store.getProject(task.projectId);
    if (!project) throw new Error(`Project not found: ${task.projectId}`);
    const provider = this.providers.get(providerId);
    if (!provider) throw new Error(`Unknown provider: ${providerId}`);
    if (isolate && !this.workspaces) throw new Error("Isolated runs need a workspace provider");

    const status = await provider.check();
    if (!status.available) {
      throw new Error(`Provider "${providerId}" unavailable: ${status.reason ?? "unknown reason"}`);
    }

    const run = this.store.createRun({ taskId, providerId });
    this.store.updateTaskStatus(taskId, "running");

    const emit = (event: AgentEvent) => {
      this.store.appendEvent(run.id, event);
      onEvent?.(event, run);
    };

    let ok = false;
    try {
      let cwd = project.path;
      if (isolate && this.workspaces) {
        const ws = await this.workspaces.create({ repoPath: project.path, runId: run.id });
        cwd = ws.path;
        emit({ type: "workspace.created", ...ws });
      }
      for await (const event of provider.run({ prompt: task.prompt, cwd, signal })) {
        emit(event);
        if (event.type === "run.finished") ok = event.ok;
      }
    } catch (err) {
      emit({ type: "error", message: err instanceof Error ? err.message : String(err) });
    }

    const cancelled = signal?.aborted === true;
    const finalStatus = cancelled ? "cancelled" : ok ? "succeeded" : "failed";
    this.store.finishRun(run.id, finalStatus);
    this.store.updateTaskStatus(taskId, cancelled ? "todo" : ok ? "done" : "failed");
    return { ...run, status: finalStatus, finishedAt: Date.now() };
  }
}
