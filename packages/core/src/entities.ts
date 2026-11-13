export type Id = string;

export interface Project {
  id: Id;
  name: string;
  /** Absolute path of the project directory on disk. */
  path: string;
  createdAt: number;
}

export type TaskStatus = "todo" | "running" | "done" | "failed";

export interface Task {
  id: Id;
  projectId: Id;
  title: string;
  prompt: string;
  status: TaskStatus;
  createdAt: number;
}

export type RunStatus = "running" | "succeeded" | "failed" | "cancelled";

/** One execution of a Task by a provider. A task can have several runs. */
export interface Run {
  id: Id;
  taskId: Id;
  providerId: string;
  status: RunStatus;
  startedAt: number;
  finishedAt?: number;
}
