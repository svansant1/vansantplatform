const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("svansDesktop", {
  systemSnapshot: () => ipcRenderer.invoke("system:snapshot"),
  chat: (messages, sessionId) => ipcRenderer.invoke("chat:send", { messages, sessionId }),
  openDestination: (destination) => ipcRenderer.invoke("destination:open", destination),
  windowAction: (action) => ipcRenderer.send("window:action", action),
  setAlwaysOnTop: (enabled) => ipcRenderer.invoke("window:always-on-top", enabled),
  setCompact: (enabled) => ipcRenderer.invoke("window:compact", enabled),
});
