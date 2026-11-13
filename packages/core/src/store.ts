import type { AgentEvent } from "./events.js";
import type { Id, Project, Run, Task } from "./entities.js";

export interface Store {
  createProject(input: { name: string; path: string }): Project;
  getProject(id: Id): Project | undefined;
  listProjects(): Project[];

  createTask(input: { projectId: Id; title: string; prompt: string }): Task;
  getTask(id: Id): Task | undefined;
  listTasks(projectId: Id): Task[];
  updateTaskStatus(taskId: Id, status: Task["status"]): void;

  createRun(input: { taskId: Id; providerId: string }): Run;
  listRuns(taskId: Id): Run[];
  finishRun(runId: Id, status: Exclude<Run["status"], "running">): void;

  appendEvent(runId: Id, event: AgentEvent): void;
  listEvents(runId: Id): AgentEvent[];
}
