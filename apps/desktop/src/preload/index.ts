import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";
import { Channels, type MergeApi, type RunEventMessage } from "../shared/api";

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
  runs: {
    start: (taskId) => ipcRenderer.invoke(Channels.runsStart, taskId),
    cancel: (taskId) => ipcRenderer.invoke(Channels.runsCancel, taskId),
    respondPermission: (requestId, decision, reason) =>
      ipcRenderer.invoke(Channels.runsRespondPermission, requestId, decision, reason),
    list: (taskId) => ipcRenderer.invoke(Channels.runsList, taskId),
    events: (runId) => ipcRenderer.invoke(Channels.runsEvents, runId),
    onEvent: (listener) => {
      const handler = (_e: IpcRendererEvent, message: RunEventMessage) => listener(message);
      ipcRenderer.on(Channels.runsEvent, handler);
      return () => ipcRenderer.removeListener(Channels.runsEvent, handler);
    },
  },
};

contextBridge.exposeInMainWorld("merge", api);
