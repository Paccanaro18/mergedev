import { existsSync } from "node:fs";
import type {
  AgentEvent,
  AgentProvider,
  Id,
  PermissionDecision,
  PermissionRequest,
  Run,
  Store,
} from "@merge/core";

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
  /** Instruction to send instead of the task's prompt. Required with `resumeFromRunId`. */
  prompt?: string;
  /** Continue the conversation of this earlier run of the same task (a follow-up). */
  resumeFromRunId?: Id;
  signal?: AbortSignal;
  /** Makes the run interactive: called when the agent needs approval. Resolve to allow or deny. */
  onPermissionRequest?: (request: PermissionRequest, run: Run) => Promise<PermissionDecision>;
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

  async runTask(
    taskId: Id,
    { providerId, isolate, prompt, resumeFromRunId, signal, onEvent, onPermissionRequest }: RunTaskOptions,
  ): Promise<Run> {
    const task = this.store.getTask(taskId);
    if (!task) throw new Error(`Task not found: ${taskId}`);
    const project = this.store.getProject(task.projectId);
    if (!project) throw new Error(`Project not found: ${task.projectId}`);
    const provider = this.providers.get(providerId);
    if (!provider) throw new Error(`Unknown provider: ${providerId}`);
    if (isolate && !this.workspaces) throw new Error("Isolated runs need a workspace provider");

    // Follow-up: continue the conversation of a previous run of this task.
    let resumeSessionId: string | undefined;
    let previousWorkspace: Extract<AgentEvent, { type: "workspace.created" }> | undefined;
    if (resumeFromRunId) {
      if (!prompt?.trim()) throw new Error("A follow-up needs a new instruction (prompt)");
      const previous = this.store.listRuns(taskId).find((r) => r.id === resumeFromRunId);
      if (!previous) throw new Error(`Run not found in this task: ${resumeFromRunId}`);
      if (previous.providerId !== providerId) {
        throw new Error(`Cannot resume a "${previous.providerId}" run with "${providerId}"`);
      }
      const previousEvents = this.store.listEvents(previous.id);
      for (const e of previousEvents) {
        if (e.type === "session.started" && e.sessionId) resumeSessionId = e.sessionId;
        if (e.type === "workspace.created") previousWorkspace = e;
      }
      if (!resumeSessionId) throw new Error("The previous run has no session to resume");
      if (previousWorkspace && !existsSync(previousWorkspace.path)) {
        throw new Error(`The previous run's workspace no longer exists: ${previousWorkspace.path}`);
      }
    }

    const settings = this.store.resolveProviderSettings(providerId, project.id);
    const status = await provider.check(settings);
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
      if (previousWorkspace) {
        // The agent keeps working on its own changes, in the same worktree.
        cwd = previousWorkspace.path;
        emit({ ...previousWorkspace });
      } else if (isolate && this.workspaces) {
        const ws = await this.workspaces.create({ repoPath: project.path, runId: run.id });
        cwd = ws.path;
        emit({ type: "workspace.created", ...ws });
      }
      // The follow-up instruction is not part of the task, so record it in the run's history.
      if (resumeSessionId && prompt) emit({ type: "message", role: "user", text: prompt });
      for await (const event of provider.run({
        prompt: prompt ?? task.prompt,
        cwd,
        signal,
        settings,
        resumeSessionId,
        onPermissionRequest: onPermissionRequest && ((req) => onPermissionRequest(req, run)),
      })) {
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
