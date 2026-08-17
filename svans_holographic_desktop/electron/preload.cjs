const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("svansDesktop", {
  login: (username, password) => ipcRenderer.invoke("auth:login", { username, password }),
  logout: () => ipcRenderer.invoke("auth:logout"),
  systemSnapshot: () => ipcRenderer.invoke("system:snapshot"),
  computerStatus: () => ipcRenderer.invoke("computer:status"),
  setComputerPermission: (capability, enabled, confirmation) => ipcRenderer.invoke("computer:permission", { capability, enabled, confirmation }),
  executeComputerAction: (action) => ipcRenderer.invoke("computer:execute", action),
  emergencyStop: () => ipcRenderer.invoke("computer:emergency-stop"),
  onComputerAudit: (callback) => {
    const listener = (_event, entry) => callback(entry);
    ipcRenderer.on("computer:audit", listener);
    return () => ipcRenderer.removeListener("computer:audit", listener);
  },
  onEmergencyStop: (callback) => {
    const listener = (_event, result) => callback(result);
    ipcRenderer.on("computer:emergency-stopped", listener);
    return () => ipcRenderer.removeListener("computer:emergency-stopped", listener);
  },
  chat: (messages, sessionId) => ipcRenderer.invoke("chat:send", { messages, sessionId }),
  synthesizeSpeech: (text) => ipcRenderer.invoke("speech:synthesize", text),
  generateHologram: (subject) => ipcRenderer.invoke("hologram:generate", subject),
  openDestination: (destination) => ipcRenderer.invoke("destination:open", destination),
  windowAction: (action) => ipcRenderer.send("window:action", action),
  setAlwaysOnTop: (enabled) => ipcRenderer.invoke("window:always-on-top", enabled),
  setCompact: (enabled) => ipcRenderer.invoke("window:compact", enabled),
});
