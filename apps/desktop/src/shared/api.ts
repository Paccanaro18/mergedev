import type { AgentEvent, Project, ProviderSettings, ProviderStatus, Run, Task } from "@merge/core";
import type { WorkspaceDiff } from "@merge/workspace";

/** Contract between the renderer and the main process. Add new calls here first. */
export interface MergeApi {
  projects: {
    list(): Promise<Project[]>;
    /** Opens the native folder picker and registers the chosen folder. Resolves to null if the user cancels. */
    add(): Promise<Project | null>;
  };
  tasks: {
    list(projectId: string): Promise<Task[]>;
    create(input: { projectId: string; title: string; prompt: string }): Promise<Task>;
  };
  providers: {
    list(): Promise<Array<{ id: string; displayName: string; status: ProviderStatus }>>;
  };
  /** Isolated git worktree of a run (see `StartRunOptions.isolate`). Addressed by run id. */
  workspace: {
    status(runId: string): Promise<WorkspaceStatus>;
    /** Everything the run changed, committed or not. Rejects unless the worktree is `active`. */
    diff(runId: string): Promise<WorkspaceDiff>;
    /** Commits pending changes and removes the worktree folder; the branch stays. Rejects unless `active`. */
    keep(runId: string): Promise<{ branch: string; committed: boolean }>;
    /** Removes the worktree folder and deletes the branch. Rejects unless `active`. */
    discard(runId: string): Promise<void>;
  };
  /** Per-provider settings, global or for one project. */
  settings: {
    /** Only what is saved in that scope (global when `projectId` is omitted). */
    get(providerId: string, projectId?: string): Promise<ProviderSettings>;
    /** What the next run will use: the project's values over the global ones. */
    resolve(providerId: string, projectId: string): Promise<ProviderSettings>;
    /** Replaces the scope's settings; empty or missing fields are cleared. */
    set(providerId: string, settings: ProviderSettings, projectId?: string): Promise<void>;
  };
  runs: {
    /**
     * Runs the task with Claude Code. Resolves when the run ends; rejects if the provider is unavailable.
     * With `resumeFromRunId` it is a follow-up and `prompt` (the new instruction) is required.
     */
    start(taskId: string, options?: StartRunOptions): Promise<Run>;
    /** Stops the task's running process, if any. */
    cancel(taskId: string): Promise<void>;
    /** Past runs of a task, oldest first, with the cost recorded in their events. */
    list(taskId: string): Promise<RunSummary[]>;
    /**
     * Answers a `permission.requested` event, resuming the paused run. Rejects if the request
     * is no longer waiting (already answered, or the run ended).
     */
    respondPermission(requestId: string, decision: "allow" | "deny", reason?: string): Promise<void>;
    /** The events recorded for a run, in order. */
    events(runId: string): Promise<AgentEvent[]>;
    /** Subscribes to live events of every run. Returns the unsubscribe function. */
    onEvent(listener: (message: RunEventMessage) => void): () => void;
  };
}

export interface StartRunOptions {
  /**
   * Run in its own git worktree and branch instead of the project folder. If the project is not a
   * git repo with at least one commit, `start` still resolves, but the run is `failed` and its
   * events hold an `error` (e.g. "git rev-parse failed: ...").
   */
  isolate?: boolean;
  /** Continue the conversation of this earlier run of the same task. */
  resumeFromRunId?: string;
  /** The new instruction for a follow-up. */
  prompt?: string;
}

/**
 * - `none`: the run was not isolated.
 * - `active`: the worktree folder exists; diff, keep and discard are available.
 * - `kept`: the folder was removed and the branch stays.
 * - `discarded`: the folder and the branch are gone.
 */
export type WorkspaceStatus =
  | { state: "none" }
  | { state: "active" | "kept" | "discarded"; path: string; branch: string; baseCommit: string };

export interface RunSummary extends Run {
  costUsd?: number;
}

export interface RunEventMessage {
  taskId: string;
  runId: string;
  event: AgentEvent;
}

/** IPC channel names, one per API method. */
export const Channels = {
  projectsList: "projects:list",
  projectsAdd: "projects:add",
  tasksList: "tasks:list",
  tasksCreate: "tasks:create",
  providersList: "providers:list",
  workspaceStatus: "workspace:status",
  workspaceDiff: "workspace:diff",
  workspaceKeep: "workspace:keep",
  workspaceDiscard: "workspace:discard",
  settingsGet: "settings:get",
  settingsResolve: "settings:resolve",
  settingsSet: "settings:set",
  runsStart: "runs:start",
  runsCancel: "runs:cancel",
  runsRespondPermission: "runs:respondPermission",
  runsList: "runs:list",
  runsEvents: "runs:events",
  /** Main → renderer push, not a request/response call. */
  runsEvent: "runs:event",
} as const;
