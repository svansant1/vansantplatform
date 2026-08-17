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
const crypto = require("node:crypto");

const CHAT_ENDPOINT = process.env.SVANSAI_CHAT_ENDPOINT || "https://svansai.com/api/chat";
const SAFE_DESTINATIONS = Object.freeze({
  platform: "https://vansantplatform.com",
  svansai: "https://svansai.com",
});
const AUTH_USERNAME = "admin";
const AUTH_SALT = "svans-desktop-admin-v1";
const AUTH_DIGEST = "38d25a5cce7a9bb87200a49a32d41f441d938c3a591f61526b2ede25cbdf6332";
const MAX_AUTH_ATTEMPTS = 5;
const LOCKOUT_MS = 30_000;

let mainWindow = null;
let tray = null;
let previousCpuSample = null;
const authorizedContents = new Set();
const authAttempts = new Map();

function authorizationState(senderId) {
  return authAttempts.get(senderId) ?? { failures: 0, lockedUntil: 0 };
}

function assertAuthorized(event) {
  if (!authorizedContents.has(event.sender.id)) throw new Error("AUTH_REQUIRED");
}

function verifyPassword(password) {
  const supplied = crypto.scryptSync(String(password ?? ""), AUTH_SALT, 32);
  const expected = Buffer.from(AUTH_DIGEST, "hex");
  return supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
}

function createTrayIcon() {
  const iconPath = path.join(__dirname, "assets", "svans-app-icon.png");
  return nativeImage.createFromPath(iconPath);
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
    icon: createTrayIcon(),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: true,
    },
  });

  mainWindow.loadFile(path.join(__dirname, "..", "renderer", "index.html"));
  const contentsId = mainWindow.webContents.id;
  mainWindow.webContents.once("destroyed", () => {
    authorizedContents.delete(contentsId);
    authAttempts.delete(contentsId);
  });
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
  ipcMain.handle("auth:login", (event, credentials) => {
    const senderId = event.sender.id;
    const now = Date.now();
    const state = authorizationState(senderId);
    if (state.lockedUntil > now) {
      return { ok: false, lockedUntil: state.lockedUntil, attemptsRemaining: 0 };
    }

    const username = String(credentials?.username ?? "").trim().toLowerCase();
    if (username === AUTH_USERNAME && verifyPassword(credentials?.password)) {
      authorizedContents.add(senderId);
      authAttempts.delete(senderId);
      return { ok: true, username: AUTH_USERNAME, role: "Administrator" };
    }

    const failures = state.failures + 1;
    if (failures >= MAX_AUTH_ATTEMPTS) {
      const lockedUntil = now + LOCKOUT_MS;
      authAttempts.set(senderId, { failures: 0, lockedUntil });
      return { ok: false, lockedUntil, attemptsRemaining: 0 };
    }
    authAttempts.set(senderId, { failures, lockedUntil: 0 });
    return { ok: false, attemptsRemaining: MAX_AUTH_ATTEMPTS - failures };
  });

  ipcMain.handle("auth:logout", (event) => {
    authorizedContents.delete(event.sender.id);
    return true;
  });

  ipcMain.handle("system:snapshot", (event) => {
    assertAuthorized(event);
    return systemSnapshot();
  });

  ipcMain.handle("chat:send", async (event, payload) => {
    assertAuthorized(event);
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

  ipcMain.handle("destination:open", async (event, destination) => {
    assertAuthorized(event);
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

  ipcMain.handle("window:always-on-top", (event, enabled) => {
    assertAuthorized(event);
    if (!mainWindow) return false;
    mainWindow.setAlwaysOnTop(Boolean(enabled), "floating");
    return mainWindow.isAlwaysOnTop();
  });

  ipcMain.handle("window:compact", (event, enabled) => {
    assertAuthorized(event);
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
  if (process.platform === "win32") app.setAppUserModelId("com.vansantplatform.svans.holographic");
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
