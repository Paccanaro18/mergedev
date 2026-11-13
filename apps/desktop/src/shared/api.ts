import type { Project, ProviderStatus } from "@merge/core";

/** Contract between the renderer and the main process. Add new calls here first. */
export interface MergeApi {
  projects: {
    list(): Promise<Project[]>;
  };
  providers: {
    list(): Promise<Array<{ id: string; displayName: string; status: ProviderStatus }>>;
  };
}

/** IPC channel names, one per API method. */
export const Channels = {
  projectsList: "projects:list",
  providersList: "providers:list",
} as const;
