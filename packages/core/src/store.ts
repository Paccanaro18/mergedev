import type { AgentEvent } from "./events.js";
import type { Id, Project, Run, Task } from "./entities.js";

export interface Store {
  createProject(input: { name: string; path: string }): Project;
  listProjects(): Project[];

  createTask(input: { projectId: Id; title: string; prompt: string }): Task;
  listTasks(projectId: Id): Task[];
  updateTaskStatus(taskId: Id, status: Task["status"]): void;

  createRun(input: { taskId: Id; providerId: string }): Run;
  finishRun(runId: Id, status: Exclude<Run["status"], "running">): void;

  appendEvent(runId: Id, event: AgentEvent): void;
  listEvents(runId: Id): AgentEvent[];
}
