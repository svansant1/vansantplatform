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
const fs = require("node:fs");
const { createActionEngine } = require("./action-engine.cjs");

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
const SPEECH_ENDPOINT = "https://api.openai.com/v1/audio/speech";
const IMAGE_ENDPOINT = "https://api.openai.com/v1/images/generations";
const SPEECH_INSTRUCTIONS = "Speak like a real person in a calm, warm, intelligent and confident conversational tone. Pronounce the assistant name S-Vans exactly as two connected parts: the letter S, then Vans. Keep pauses at commas and sentence endings brief and fluid, maintaining the natural momentum of a live conversation. Use subtle emotional inflection and an American English accent. Sound like a trusted personal assistant speaking directly to Shawn. Never use an announcer voice, exaggerated drama, drawn-out punctuation pauses or robotic cadence.";

let mainWindow = null;
let tray = null;
let previousCpuSample = null;
let actionEngine = null;
const authorizedContents = new Set();
const authAttempts = new Map();
const pendingSpeech = new Map();
const launchHidden = process.argv.includes("--hidden");
const hasSingleInstanceLock = app.requestSingleInstanceLock();

app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");

if (!hasSingleInstanceLock) app.quit();
app.on("second-instance", () => {
  if (!mainWindow) return;
  mainWindow.show();
  mainWindow.focus();
});

function readEnvValue(filePath, key) {
  try {
    const line = fs.readFileSync(filePath, "utf8").split(/\r?\n/).find((entry) => entry.trim().startsWith(`${key}=`));
    if (!line) return "";
    return line.slice(line.indexOf("=") + 1).trim().replace(/^(['"])(.*)\1$/, "$2");
  } catch {
    return "";
  }
}

function openAiApiKey() {
  if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY;
  const repositoryRoot = path.resolve(__dirname, "..", "..");
  const developmentFiles = [
    path.join(repositoryRoot, "svansai_parent", "backend", "app", "node-api", ".env"),
    path.join(repositoryRoot, "svansai_parent", "frontend", ".env.local"),
  ];
  for (const filePath of developmentFiles) {
    const key = readEnvValue(filePath, "OPENAI_API_KEY");
    if (key) return key;
  }
  return "";
}

function spokenLoginGreeting() {
  const hour = new Date().getHours();
  const period = hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
  return `Good ${period}, Shawn. Welcome back. S-Vans is online, the command deck is ready, and I am standing by.`;
}

function isSpokenLoginGreeting(input) {
  return /^Good (?:morning|afternoon|evening), Shawn\. Welcome back\. S-Vans is online, the command deck is ready, and I am standing by\.$/i.test(input);
}

function userExplicitlyRequestedSources(text) {
  return /\b(?:sources?|citations?|cite|references?|links?|research|look (?:it )?up|search (?:the )?(?:web|internet)|verify online)\b/i.test(text);
}

function userRequestedExtendedAnswer(text) {
  return /\b(?:explain|elaborate|expand|in detail|detailed|thorough|deep dive|break (?:it )?down|step[- ]by[- ]step|walk me through|show your work|full answer|long answer|write|draft|compose|build|create|generate|code|script|essay|report|discussion post|outline|list all|everything)\b/i.test(text);
}

function removeUnrequestedSources(text) {
  return text
    .replace(/\n*\s*(?:#{1,4}\s*)?(?:Sources?|References?):\s*[\s\S]*$/i, "")
    .replace(/\s*\[\d+\](?=[\s.,;:!?]|$)/g, "")
    .replace(/[ \t]+([.,;:!?])/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function synthesizeNeuralSpeech(input, cacheGreeting = false) {
  const apiKey = openAiApiKey();
  if (!apiKey) return { available: false };
  const cacheKey = crypto.createHash("sha256").update(`cedar-v2:${input}`).digest("hex");
  const cacheDirectory = path.join(app.getPath("userData"), "speech-cache");
  const cachePath = path.join(cacheDirectory, `${cacheKey}.wav`);
  if (cacheGreeting) {
    try {
      const cached = fs.readFileSync(cachePath);
      if (cached.length) return { available: true, mimeType: "audio/wav", audio: cached.toString("base64"), voice: "cedar", cached: true };
    } catch {
      // A cache miss continues to neural synthesis.
    }
  }
  if (pendingSpeech.has(cacheKey)) return pendingSpeech.get(cacheKey);
  const request = (async () => {
    try {
      const response = await fetch(SPEECH_ENDPOINT, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "gpt-4o-mini-tts", voice: "cedar", input, instructions: SPEECH_INSTRUCTIONS, response_format: "wav" }),
        signal: AbortSignal.timeout(60_000),
      });
      if (!response.ok) return { available: false };
      const audio = Buffer.from(await response.arrayBuffer());
      if (!audio.length) return { available: false };
      if (cacheGreeting) {
        fs.mkdirSync(cacheDirectory, { recursive: true });
        fs.writeFileSync(cachePath, audio);
      }
      return { available: true, mimeType: "audio/wav", audio: audio.toString("base64"), voice: "cedar", cached: false };
    } catch {
      return { available: false };
    }
  })();
  pendingSpeech.set(cacheKey, request);
  try {
    return await request;
  } finally {
    pendingSpeech.delete(cacheKey);
  }
}

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
  mainWindow.once("ready-to-show", () => {
    if (!launchHidden) mainWindow?.show();
  });
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

function enableWindowsStartup() {
  if (process.platform !== "win32") return;
  const startup = { openAtLogin: true, enabled: true };
  if (process.defaultApp) {
    startup.path = process.execPath;
    startup.args = [path.resolve(__dirname, "main.cjs"), "--hidden"];
  } else {
    startup.path = process.execPath;
    startup.args = ["--hidden"];
  }
  app.setLoginItemSettings(startup);
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

  ipcMain.handle("computer:status", (event) => {
    assertAuthorized(event);
    return {
      permissions: actionEngine.permissionSnapshot(),
      roots: actionEngine.allowedRoots(),
    };
  });

  ipcMain.handle("computer:permission", (event, request) => {
    assertAuthorized(event);
    const capability = String(request?.capability || "");
    const enabled = Boolean(request?.enabled);
    if (capability === "admin" && enabled && request?.confirmation !== "ENABLE_ADMIN_GUARDIAN") {
      throw new Error("Administrator Guardian confirmation is required.");
    }
    return actionEngine.setPermission(capability, enabled);
  });

  ipcMain.handle("computer:execute", async (event, action) => {
    assertAuthorized(event);
    return actionEngine.execute(action);
  });

  ipcMain.handle("computer:emergency-stop", (event) => {
    assertAuthorized(event);
    return actionEngine.cancelAll();
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
    const latestUserIndex = messages.findLastIndex((message) => message.role === "user");
    const latestUserText = messages[latestUserIndex].content;
    const communicationProfile = typeof payload?.communicationProfile === "string"
      ? payload.communicationProfile.trim().slice(0, 1200)
      : "Shawn prefers natural, direct conversation.";
    const codingCoachMode = Boolean(payload?.codingCoachMode);
    const extendedAnswer = userRequestedExtendedAnswer(latestUserText);
    messages[latestUserIndex] = {
      ...messages[latestUserIndex],
      content: `${latestUserText}\n\n[Private SVANS conversation direction: ${communicationProfile} Respond like a familiar, intelligent human assistant speaking naturally with Shawn. Match his level of formality and directness without copying misspellings. Lead with the actual answer. ${extendedAnswer ? "Shawn requested an expanded response, so use the space genuinely needed." : "Default to only two or three short sentences. Do not add extra explanation, background, examples, headings, or a list unless they are required to answer."} ${codingCoachMode ? "CODING COACH MODE IS ACTIVE. Help Shawn learn to code independently. Teach one concept or give one small exercise at a time, ask him to write or predict the code first, offer a hint before a solution, review his attempt, and explain errors plainly. Do not write the complete solution unless he explicitly asks after attempting it. Never answer a personal learning question by discussing how to redesign SVANS-AI, conversation-state architecture, routing layers, or memory systems." : ""} Avoid canned introductions, corporate phrasing, repetitive summaries, rigid AI-style headings, and unnecessary bullet lists. Use dry humor or light sarcasm when it fits naturally, but never force it. Do not display sources, citations, reference numbers, or a Sources section unless Shawn explicitly asks for them.]`,
    };

    const response = await fetch(CHAT_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages,
        sessionId: typeof payload?.sessionId === "string" ? payload.sessionId : undefined,
        responseMode: codingCoachMode ? "tutor" : extendedAnswer ? "auto" : "direct",
      }),
      signal: AbortSignal.timeout(60000),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.error || `SVANS request failed (${response.status}).`);
    const text = data?.text ?? data?.response ?? data?.answer ?? data?.message;
    if (typeof text !== "string" || !text.trim()) throw new Error("SVANS returned an empty response.");
    let conversationalText = userExplicitlyRequestedSources(latestUserText) ? text.trim() : removeUnrequestedSources(text);
    if (
      codingCoachMode &&
      !/\bSVANS(?:-AI)?\b/i.test(latestUserText) &&
      /\b(?:SVANS-AI needs|conversation-state layer|memory gate|route-specific prompts|redesign SVANS)\b/i.test(conversationalText)
    ) {
      conversationalText = "That answer drifted away from your coding lesson, so I stopped it. Show me what you are trying to code, and I will help you understand the first step without writing it for you.";
    }
    return { text: conversationalText, orchestration: data?.orchestration ?? null };
  });

  ipcMain.handle("speech:synthesize", async (event, rawText) => {
    assertAuthorized(event);
    const input = String(rawText ?? "").trim().slice(0, 6000);
    if (!input) throw new Error("Speech text is required.");
    return synthesizeNeuralSpeech(input, isSpokenLoginGreeting(input));
  });

  ipcMain.handle("hologram:generate", async (event, rawSubject) => {
    assertAuthorized(event);
    const subject = String(rawSubject ?? "").trim().replace(/[\r\n]+/g, " ").slice(0, 120);
    if (!subject) throw new Error("A hologram subject is required.");
    const apiKey = openAiApiKey();
    if (!apiKey) return { available: false, reason: "Image generation is not connected." };
    const cacheDirectory = path.join(app.getPath("userData"), "hologram-cache");
    const cacheName = crypto.createHash("sha256").update(subject.toLowerCase()).digest("hex");
    const cachePath = path.join(cacheDirectory, `${cacheName}.png`);
    try {
      const cached = fs.readFileSync(cachePath);
      if (cached.length) return { available: true, mimeType: "image/png", image: cached.toString("base64"), cached: true };
    } catch {
      // A cache miss continues to generation.
    }
    const prompt = [
      `Create a highly detailed, immediately recognizable visual model of: ${subject}.`,
      "Show the real subject, not an abstract orb, generic sphere, icon, symbol, or text label.",
      "Use an isolated three-quarter technical display composition suitable for a futuristic desktop hologram.",
      "Preserve accurate anatomy or mechanical structure when applicable, with layered cyan and electric-blue luminous surfaces, fine wireframe edges, internal detail, and subtle volumetric glow.",
      "Transparent background. No frame, no interface, no writing, no watermark, and no decorative objects.",
    ].join(" ");
    try {
      const response = await fetch(IMAGE_ENDPOINT, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "gpt-image-1", prompt, size: "1024x1024", quality: "medium", background: "transparent", output_format: "png" }),
        signal: AbortSignal.timeout(120_000),
      });
      const payload = await response.json().catch(() => ({}));
      const image = payload?.data?.[0]?.b64_json;
      if (!response.ok || typeof image !== "string" || !image) return { available: false, reason: "A detailed model could not be generated for this subject." };
      const buffer = Buffer.from(image, "base64");
      fs.mkdirSync(cacheDirectory, { recursive: true });
      fs.writeFileSync(cachePath, buffer);
      return { available: true, mimeType: "image/png", image, cached: false };
    } catch {
      return { available: false, reason: "The visual generation link is currently unavailable." };
    }
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

if (hasSingleInstanceLock) app.whenReady().then(() => {
  if (process.platform === "win32") app.setAppUserModelId("com.vansantplatform.svans.holographic");
  enableWindowsStartup();
  void synthesizeNeuralSpeech(spokenLoginGreeting(), true);
  actionEngine = createActionEngine({
    workspaceRoot: path.resolve(__dirname, "..", ".."),
    onAudit: (entry) => mainWindow?.webContents.send("computer:audit", entry),
  });
  registerIpc();
  createWindow();
  globalShortcut.register("CommandOrControl+Space", toggleWindow);
  globalShortcut.register("CommandOrControl+Alt+Shift+Escape", () => {
    const result = actionEngine.cancelAll();
    mainWindow?.webContents.send("computer:emergency-stopped", result);
  });

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
