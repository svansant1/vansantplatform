const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("ipcRenderer", {
  send: (channel, ...args) => ipcRenderer.send(channel, ...args),
  on: (channel, func) =>
    ipcRenderer.on(channel, (_event, ...args) => func(...args)),
  invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
});