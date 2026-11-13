import type { Project, ProviderStatus, Task } from "@merge/core";

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
}

/** IPC channel names, one per API method. */
export const Channels = {
  projectsList: "projects:list",
  projectsAdd: "projects:add",
  tasksList: "tasks:list",
  tasksCreate: "tasks:create",
  providersList: "providers:list",
} as const;
