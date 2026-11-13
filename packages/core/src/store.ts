import type { AgentEvent } from "./events.js";
import type { Id, Project, Run, Task } from "./entities.js";
import type { ProviderSettings } from "./provider.js";

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

  /** Settings saved for exactly one scope: a project when `projectId` is given, otherwise the provider globally. */
  getProviderSettings(providerId: string, projectId?: Id): ProviderSettings;
  /** Replaces the settings of one scope. Passing `{}` clears it. */
  setProviderSettings(providerId: string, settings: ProviderSettings, projectId?: Id): void;
  /** Effective settings: the project's values override the provider's global ones, field by field. */
  resolveProviderSettings(providerId: string, projectId: Id): ProviderSettings;

  appendEvent(runId: Id, event: AgentEvent): void;
  listEvents(runId: Id): AgentEvent[];
}
