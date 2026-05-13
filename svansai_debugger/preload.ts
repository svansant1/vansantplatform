import { contextBridge, ipcRenderer } from "electron";

function optionalString(value?: string): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function requiredString(value: string): string {
  return typeof value === "string" ? value : "";
}

contextBridge.exposeInMainWorld("scanner", {
  apps: () => ipcRenderer.invoke("scan:apps"),
  network: () => ipcRenderer.invoke("scan:network"),
  files: (dir?: string) => ipcRenderer.invoke("scan:files", optionalString(dir)),
  sites: () => ipcRenderer.invoke("scan:sites"),
  pickFolder: () => ipcRenderer.invoke("dialog:pick-folder"),
  saveReport: (content: string, defaultName: string) =>
    ipcRenderer.invoke(
      "export:save-report",
      requiredString(content),
      requiredString(defaultName),
    ),
});
