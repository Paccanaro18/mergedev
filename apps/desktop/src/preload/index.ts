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
  workspace: {
    status: (runId) => ipcRenderer.invoke(Channels.workspaceStatus, runId),
    diff: (runId) => ipcRenderer.invoke(Channels.workspaceDiff, runId),
    keep: (runId) => ipcRenderer.invoke(Channels.workspaceKeep, runId),
    discard: (runId) => ipcRenderer.invoke(Channels.workspaceDiscard, runId),
  },
  settings: {
    get: (providerId, projectId) => ipcRenderer.invoke(Channels.settingsGet, providerId, projectId),
    resolve: (providerId, projectId) => ipcRenderer.invoke(Channels.settingsResolve, providerId, projectId),
    set: (providerId, settings, projectId) =>
      ipcRenderer.invoke(Channels.settingsSet, providerId, settings, projectId),
  },
  runs: {
    start: (taskId, options) => ipcRenderer.invoke(Channels.runsStart, taskId, options),
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
