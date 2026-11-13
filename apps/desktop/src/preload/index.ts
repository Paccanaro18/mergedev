import { contextBridge, ipcRenderer } from "electron";
import { Channels, type MergeApi } from "../shared/api";

const api: MergeApi = {
  projects: {
    list: () => ipcRenderer.invoke(Channels.projectsList),
    add: () => ipcRenderer.invoke(Channels.projectsAdd),
  },
  tasks: {
    list: (projectId) => ipcRenderer.invoke(Channels.tasksList, projectId),
    create: (input) => ipcRenderer.invoke(Channels.tasksCreate, input),
  },
  providers: {
    list: () => ipcRenderer.invoke(Channels.providersList),
  },
};

contextBridge.exposeInMainWorld("merge", api);
