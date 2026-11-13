import type { AgentEvent, Project, ProviderStatus, Run, Task } from "@merge/core";

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
  runs: {
    /** Runs the task with Claude Code. Resolves when the run ends; rejects if the provider is unavailable. */
    start(taskId: string): Promise<Run>;
    /** Stops the task's running process, if any. */
    cancel(taskId: string): Promise<void>;
    /** Past runs of a task, oldest first, with the cost recorded in their events. */
    list(taskId: string): Promise<RunSummary[]>;
    /** The events recorded for a run, in order. */
    events(runId: string): Promise<AgentEvent[]>;
    /** Subscribes to live events of every run. Returns the unsubscribe function. */
    onEvent(listener: (message: RunEventMessage) => void): () => void;
  };
}

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
  runsStart: "runs:start",
  runsCancel: "runs:cancel",
  runsList: "runs:list",
  runsEvents: "runs:events",
  /** Main → renderer push, not a request/response call. */
  runsEvent: "runs:event",
} as const;
