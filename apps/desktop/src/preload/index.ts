import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";
import { Channels, type MergeApi, type RunEventMessage, type RunNoticeMessage } from "../shared/api";

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
    check: (providerId, projectId) => ipcRenderer.invoke(Channels.providersCheck, providerId, projectId),
  },
  settings: {
    get: (providerId, projectId) => ipcRenderer.invoke(Channels.settingsGet, providerId, projectId),
    set: (providerId, settings, projectId) => ipcRenderer.invoke(Channels.settingsSet, providerId, settings, projectId),
  },
  runs: {
    start: (taskId, followUp) => ipcRenderer.invoke(Channels.runsStart, taskId, followUp),
    cancel: (taskId) => ipcRenderer.invoke(Channels.runsCancel, taskId),
    respondPermission: (requestId, decision, reason) =>
      ipcRenderer.invoke(Channels.runsRespondPermission, requestId, decision, reason),
    changes: (taskId, runId) => ipcRenderer.invoke(Channels.runsChanges, taskId, runId),
    keepChanges: (taskId, runId) => ipcRenderer.invoke(Channels.runsKeepChanges, taskId, runId),
    discardChanges: (taskId, runId) => ipcRenderer.invoke(Channels.runsDiscardChanges, taskId, runId),
    onNotice: (listener) => {
      const handler = (_e: IpcRendererEvent, message: RunNoticeMessage) => listener(message);
      ipcRenderer.on(Channels.runsNotice, handler);
      return () => ipcRenderer.removeListener(Channels.runsNotice, handler);
    },
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
