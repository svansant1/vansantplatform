const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("svansDesktop", {
  login: (username, password) => ipcRenderer.invoke("auth:login", { username, password }),
  logout: () => ipcRenderer.invoke("auth:logout"),
  systemSnapshot: () => ipcRenderer.invoke("system:snapshot"),
  chat: (messages, sessionId) => ipcRenderer.invoke("chat:send", { messages, sessionId }),
  synthesizeSpeech: (text) => ipcRenderer.invoke("speech:synthesize", text),
  openDestination: (destination) => ipcRenderer.invoke("destination:open", destination),
  windowAction: (action) => ipcRenderer.send("window:action", action),
  setAlwaysOnTop: (enabled) => ipcRenderer.invoke("window:always-on-top", enabled),
  setCompact: (enabled) => ipcRenderer.invoke("window:compact", enabled),
});
