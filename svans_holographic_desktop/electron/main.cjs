const {
  app,
  BrowserWindow,
  Menu,
  Tray,
  globalShortcut,
  ipcMain,
  nativeImage,
  shell,
} = require("electron");
const os = require("node:os");
const path = require("node:path");

const CHAT_ENDPOINT = process.env.SVANSAI_CHAT_ENDPOINT || "https://svansai.com/api/chat";
const SAFE_DESTINATIONS = Object.freeze({
  platform: "https://vansantplatform.com",
  svansai: "https://svansai.com",
});

let mainWindow = null;
let tray = null;
let previousCpuSample = null;

function createTrayIcon() {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
      <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#00d4ff"/><stop offset="1" stop-color="#287bff"/></linearGradient></defs>
      <rect x="3" y="3" width="58" height="58" rx="18" fill="#050a12" stroke="url(#g)" stroke-width="4"/>
      <circle cx="32" cy="32" r="20" fill="none" stroke="#00d4ff" stroke-opacity=".35"/>
      <text x="32" y="39" fill="url(#g)" font-family="Arial" font-size="20" font-weight="900" text-anchor="middle">SV</text>
    </svg>`;
  return nativeImage.createFromDataURL(
    `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`,
  );
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1460,
    height: 920,
    minWidth: 1040,
    minHeight: 680,
    frame: false,
    show: false,
    backgroundColor: "#050a12",
    backgroundMaterial: process.platform === "win32" ? "mica" : undefined,
    title: "SVANS Holographic Desktop",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: true,
    },
  });

  mainWindow.loadFile(path.join(__dirname, "..", "renderer", "index.html"));
  mainWindow.once("ready-to-show", () => mainWindow?.show());
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function toggleWindow() {
  if (!mainWindow) {
    createWindow();
    return;
  }
  if (mainWindow.isVisible()) {
    mainWindow.hide();
  } else {
    mainWindow.show();
    mainWindow.focus();
  }
}

function readCpuPercent() {
  const current = os.cpus().reduce(
    (totals, cpu) => {
      const idle = cpu.times.idle;
      const total = Object.values(cpu.times).reduce((sum, value) => sum + value, 0);
      return { idle: totals.idle + idle, total: totals.total + total };
    },
    { idle: 0, total: 0 },
  );

  if (!previousCpuSample) {
    previousCpuSample = current;
    return 0;
  }
  const idleDelta = current.idle - previousCpuSample.idle;
  const totalDelta = current.total - previousCpuSample.total;
  previousCpuSample = current;
  return totalDelta > 0 ? Math.max(0, Math.min(100, Math.round((1 - idleDelta / totalDelta) * 100))) : 0;
}

function systemSnapshot() {
  const totalMemory = os.totalmem();
  const usedMemory = totalMemory - os.freemem();
  const networkAdapters = Object.values(os.networkInterfaces())
    .flat()
    .filter((adapter) => adapter && !adapter.internal && adapter.family === "IPv4").length;
  return {
    cpu: readCpuPercent(),
    memory: Math.round((usedMemory / totalMemory) * 100),
    memoryUsedGb: Number((usedMemory / 1024 ** 3).toFixed(1)),
    memoryTotalGb: Number((totalMemory / 1024 ** 3).toFixed(1)),
    uptimeSeconds: os.uptime(),
    hostname: os.hostname(),
    platform: `${os.type()} ${os.release()}`,
    processors: os.cpus().length,
    networkAdapters,
    timestamp: new Date().toISOString(),
  };
}

function registerIpc() {
  ipcMain.handle("system:snapshot", () => systemSnapshot());

  ipcMain.handle("chat:send", async (_event, payload) => {
    const messages = (Array.isArray(payload?.messages) ? payload.messages : [])
      .filter(
        (message) =>
          message &&
          (message.role === "user" || message.role === "assistant") &&
          typeof message.content === "string",
      )
      .slice(-40)
      .map((message) => ({
        role: message.role,
        content: message.content.trim().slice(0, 30000),
      }));

    if (!messages.some((message) => message.role === "user")) {
      throw new Error("A user message is required.");
    }

    const response = await fetch(CHAT_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages,
        sessionId: typeof payload?.sessionId === "string" ? payload.sessionId : undefined,
        responseMode: "auto",
      }),
      signal: AbortSignal.timeout(60000),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.error || `SVANS request failed (${response.status}).`);
    const text = data?.text ?? data?.response ?? data?.answer ?? data?.message;
    if (typeof text !== "string" || !text.trim()) throw new Error("SVANS returned an empty response.");
    return { text: text.trim(), orchestration: data?.orchestration ?? null };
  });

  ipcMain.handle("destination:open", async (_event, destination) => {
    const url = SAFE_DESTINATIONS[destination];
    if (!url) return false;
    await shell.openExternal(url);
    return true;
  });

  ipcMain.on("window:action", (_event, action) => {
    if (!mainWindow) return;
    if (action === "minimize") mainWindow.minimize();
    if (action === "close") mainWindow.hide();
    if (action === "maximize") {
      if (mainWindow.isMaximized()) mainWindow.unmaximize();
      else mainWindow.maximize();
    }
  });

  ipcMain.handle("window:always-on-top", (_event, enabled) => {
    if (!mainWindow) return false;
    mainWindow.setAlwaysOnTop(Boolean(enabled), "floating");
    return mainWindow.isAlwaysOnTop();
  });

  ipcMain.handle("window:compact", (_event, enabled) => {
    if (!mainWindow) return false;
    if (enabled) {
      mainWindow.setResizable(false);
      mainWindow.setAlwaysOnTop(true, "floating");
      mainWindow.setSize(340, 340, true);
      mainWindow.center();
    } else {
      mainWindow.setResizable(true);
      mainWindow.setAlwaysOnTop(false);
      mainWindow.setSize(1460, 920, true);
      mainWindow.center();
    }
    return enabled;
  });
}

app.whenReady().then(() => {
  registerIpc();
  createWindow();
  globalShortcut.register("CommandOrControl+Space", toggleWindow);

  tray = new Tray(createTrayIcon());
  tray.setToolTip("SVANS Holographic Desktop");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Show or hide SVANS", click: toggleWindow },
      { type: "separator" },
      { label: "Quit SVANS", click: () => app.quit() },
    ]),
  );
  tray.on("double-click", toggleWindow);
});

app.on("window-all-closed", (event) => event.preventDefault());
app.on("will-quit", () => globalShortcut.unregisterAll());
