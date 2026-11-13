import type { AgentEvent, Project, ProviderSettings, ProviderStatus, Run, Task } from "@merge/core";

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
    /** Every provider with its status, checked with its global settings (e.g. the binary path). */
    list(): Promise<Array<{ id: string; displayName: string; status: ProviderStatus }>>;
    /**
     * Checks one provider with the settings that would apply to a run: the project's over the
     * global ones when `projectId` is given, otherwise the global ones. It only confirms that the
     * command runs (`--version`); it does not tell whether the user is logged in.
     */
    check(providerId: string, projectId?: string): Promise<ProviderStatus>;
  };
  settings: {
    /** The settings saved for exactly one scope: a project when `projectId` is given, otherwise global. */
    get(providerId: string, projectId?: string): Promise<ProviderSettings>;
    /** Replaces the settings of one scope. `{}` clears it. Applies from the next run. */
    set(providerId: string, settings: ProviderSettings, projectId?: string): Promise<void>;
  };
  runs: {
    /**
     * Runs the task with Claude Code. Resolves when the run ends; rejects if the provider is unavailable.
     *
     * `isolate` (default true) runs it in an isolated git worktree. That needs the project folder to be
     * a git repository with at least one commit; otherwise it runs in the folder itself, with a notice.
     * With `isolate: false` the agent works directly in the project folder.
     *
     * With `followUp` it instead continues the conversation of an earlier run of the task with a
     * new instruction. The agent keeps that run's context, and an isolated run continues in its own
     * worktree (`isolate` is ignored), so it is refused once that worktree was kept or discarded.
     */
    start(taskId: string, options?: StartOptions): Promise<Run>;
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
    /**
     * What an isolated run changed: files and patch while the worktree exists, or the final result
     * (kept or discarded) once it was removed. State "none" means the run was not isolated.
     */
    changes(taskId: string, runId: string): Promise<RunChanges>;
    /** Commits pending changes to the run's branch and removes the worktree folder; the branch stays. */
    keepChanges(taskId: string, runId: string): Promise<{ branch: string; committed: boolean }>;
    /** Removes the worktree folder and deletes the run's branch. */
    discardChanges(taskId: string, runId: string): Promise<void>;
    /** Subscribes to warnings about a run that is about to start (e.g. it will not be isolated). */
    onNotice(listener: (message: RunNoticeMessage) => void): () => void;
    /** Subscribes to live events of every run. Returns the unsubscribe function. */
    onEvent(listener: (message: RunEventMessage) => void): () => void;
  };
}

export interface StartOptions {
  isolate?: boolean;
  followUp?: { resumeFromRunId: string; prompt: string };
}

export interface RunSummary extends Run {
  costUsd?: number;
}

export interface ChangedFile {
  path: string;
  status: "added" | "modified" | "deleted" | "renamed" | "other";
}

export type RunChanges =
  | { state: "none" }
  | { state: "running" }
  | { state: "pending"; branch: string; files: ChangedFile[]; patch: string }
  | { state: "kept"; branch: string }
  | { state: "discarded"; branch: string };

export interface RunNoticeMessage {
  taskId: string;
  message: string;
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
  providersCheck: "providers:check",
  settingsGet: "settings:get",
  settingsSet: "settings:set",
  runsStart: "runs:start",
  runsCancel: "runs:cancel",
  runsRespondPermission: "runs:respondPermission",
  runsChanges: "runs:changes",
  runsKeepChanges: "runs:keepChanges",
  runsDiscardChanges: "runs:discardChanges",
  runsList: "runs:list",
  runsEvents: "runs:events",
  /** Main → renderer push, not a request/response call. */
  runsEvent: "runs:event",
  /** Main → renderer push: a warning about a run that is starting. */
  runsNotice: "runs:notice",
} as const;
