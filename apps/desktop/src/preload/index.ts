import { contextBridge, ipcRenderer } from "electron";
import { Channels, type MergeApi } from "../shared/api";

const api: MergeApi = {
  projects: {
    list: () => ipcRenderer.invoke(Channels.projectsList),
  },
  providers: {
    list: () => ipcRenderer.invoke(Channels.providersList),
  },
};

contextBridge.exposeInMainWorld("merge", api);
