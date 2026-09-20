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
  chat: (messages, sessionId, communicationProfile, codingCoachMode, conversationContext) => ipcRenderer.invoke("chat:send", { messages, sessionId, communicationProfile, codingCoachMode, conversationContext }),
  cancelCurrentOperation: () => ipcRenderer.invoke("operation:cancel"),
  synthesizeSpeech: (text) => ipcRenderer.invoke("speech:synthesize", text),
  generateHologram: (subject) => ipcRenderer.invoke("hologram:generate", subject),
  openDestination: (destination) => ipcRenderer.invoke("destination:open", destination),
  windowAction: (action) => ipcRenderer.send("window:action", action),
  setAlwaysOnTop: (enabled) => ipcRenderer.invoke("window:always-on-top", enabled),
  setCompact: (enabled) => ipcRenderer.invoke("window:compact", enabled),
  saveSecret: (key, value) => ipcRenderer.invoke("secrets:set", { key, value }),
  deleteSecret: (key) => ipcRenderer.invoke("secrets:delete", { key }),
  connectorStatus: () => ipcRenderer.invoke("secrets:status"),
  planAgentTask: (goal, runAt) => ipcRenderer.invoke("agent:plan", { goal, runAt }),
  startAgentTask: (taskId) => ipcRenderer.invoke("agent:start", { taskId }),
  approveAgentStep: (taskId) => ipcRenderer.invoke("agent:approve", { taskId }),
  rejectAgentStep: (taskId, reason) => ipcRenderer.invoke("agent:reject", { taskId, reason }),
  cancelAgentTask: (taskId) => ipcRenderer.invoke("agent:cancel", { taskId }),
  listAgentTasks: () => ipcRenderer.invoke("agent:list"),
  onAgentUpdate: (callback) => {
    const listener = (_event, task) => callback(task);
    ipcRenderer.on("agent:update", listener);
    return () => ipcRenderer.removeListener("agent:update", listener);
  },
  generateHologram3D: (subject) => ipcRenderer.invoke("hologram:generate3d", { subject }),
  loadHologramFromUrl: (url) => ipcRenderer.invoke("hologram:loadFromUrl", { url }),
  onHologramProgress: (callback) => {
    const listener = (_event, update) => callback(update);
    ipcRenderer.on("hologram:progress", listener);
    return () => ipcRenderer.removeListener("hologram:progress", listener);
  },
  robloxConfig: () => ipcRenderer.invoke("roblox:config"),
  configureRoblox: (config) => ipcRenderer.invoke("roblox:configure", config),
  buildRobloxGame: (request) => ipcRenderer.invoke("roblox:build", typeof request === "string" ? { description: request } : request),
  updateRobloxGame: (description) => ipcRenderer.invoke("roblox:update", { description }),
  buildInsideRobloxProject: (request) => ipcRenderer.invoke("roblox:buildInsideProject", typeof request === "string" ? { description: request } : request),
  analyzeRobloxReferences: (request) => ipcRenderer.invoke("roblox:analyzeReferences", request),
  launchRobloxProject: (placePath) => ipcRenderer.invoke("roblox:launch", { placePath }),
  openRobloxStudio: () => ipcRenderer.invoke("roblox:openStudio"),
  robloxStudioContext: (query = "") => ipcRenderer.invoke("roblox:studioContext", { query }),
  inspectRobloxProject: (query) => ipcRenderer.invoke("roblox:inspectProject", { query }),
  fixRobloxProject: (query) => ipcRenderer.invoke("roblox:fixProject", { query }),
  listRobloxProjects: () => ipcRenderer.invoke("roblox:projects"),
  refreshRobloxStats: () => ipcRenderer.invoke("roblox:stats"),
  onRobloxStats: (callback) => {
    const listener = (_event, stats) => callback(stats);
    ipcRenderer.on("roblox:stats-update", listener);
    return () => ipcRenderer.removeListener("roblox:stats-update", listener);
  },
});
