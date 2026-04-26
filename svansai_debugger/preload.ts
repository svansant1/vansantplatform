import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("scanner", {
  apps: () => ipcRenderer.invoke("scan:apps"),
  network: () => ipcRenderer.invoke("scan:network"),
  files: (dir?: string) => ipcRenderer.invoke("scan:files", dir),
  sites: () => ipcRenderer.invoke("scan:sites"),
  pickFolder: () => ipcRenderer.invoke("dialog:pick-folder"),
});
