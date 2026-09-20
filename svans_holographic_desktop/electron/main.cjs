const {
  app,
  BrowserWindow,
  Menu,
  Tray,
  globalShortcut,
  ipcMain,
  nativeImage,
  shell,
  safeStorage,
} = require("electron");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const fs = require("node:fs");
const { createActionEngine } = require("./action-engine.cjs");
const { createSocialConnectors } = require("./social-connectors.cjs");
const { createAgentOrchestrator } = require("./agent-orchestrator.cjs");
const { createBusinessOps } = require("./business-ops.cjs");
const { createHologramEngine } = require("./hologram-engine.cjs");
const { createRobloxAgent } = require("./roblox-agent.cjs");
const { createChatCircuitBreaker } = require("./chat-fallback.cjs");

const CHAT_ENDPOINT = process.env.SVANSAI_CHAT_ENDPOINT || "https://svansai.com/api/chat";
const chatCircuitBreaker = createChatCircuitBreaker();
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
const TRANSCRIPTION_ENDPOINT = "https://api.openai.com/v1/audio/transcriptions";
const IMAGE_ENDPOINT = "https://api.openai.com/v1/images/generations";
const RESPONSES_ENDPOINT = "https://api.openai.com/v1/responses";
const SPEECH_INSTRUCTIONS = "Speak like a real person in a calm, warm, intelligent and confident conversational tone. Pronounce the assistant name S-Vans exactly as two connected parts: the letter S, then Vans. Keep pauses at commas and sentence endings brief and fluid, maintaining the natural momentum of a live conversation. Use subtle emotional inflection and an American English accent. Sound like a trusted personal assistant speaking directly to Shawn. Never use an announcer voice, exaggerated drama, drawn-out punctuation pauses or robotic cadence.";

let mainWindow = null;
let tray = null;
let previousCpuSample = null;
let actionEngine = null;
let secretStore = null;
let agentOrchestrator = null;
let hologramEngine = null;
let robloxAgent = null;
const authorizedContents = new Set();
const authAttempts = new Map();
const pendingSpeech = new Map();
const activeOperations = new Map();
const launchHidden = process.argv.includes("--hidden");
const hasSingleInstanceLock = app.requestSingleInstanceLock();

function combinedSignal(signal, timeoutMs) {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;
}

function beginCancelableOperation(event, timeoutMs) {
  const senderId = event.sender.id;
  const controller = new AbortController();
  const operations = activeOperations.get(senderId) || new Set();
  operations.add(controller);
  activeOperations.set(senderId, operations);
  const timer = setTimeout(() => controller.abort(new Error("Operation timed out.")), timeoutMs);
  const finish = () => {
    clearTimeout(timer);
    operations.delete(controller);
    if (!operations.size) activeOperations.delete(senderId);
  };
  return { signal: controller.signal, finish };
}

function cancelOperations(senderId) {
  const operations = activeOperations.get(senderId);
  if (!operations?.size) return 0;
  const count = operations.size;
  for (const controller of operations) controller.abort(new Error("Operation stopped by owner."));
  activeOperations.delete(senderId);
  return count;
}

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

// Encrypted-at-rest token store for social/search connectors, backed by the
// OS keychain via Electron's safeStorage. Same trust boundary as the local
// password check below — nothing here is readable outside this machine/user.
function createSecretStore() {
  const secretsPath = path.join(app.getPath("userData"), "secrets.json");

  function readStore() {
    try {
      return JSON.parse(fs.readFileSync(secretsPath, "utf8"));
    } catch {
      return {};
    }
  }

  function writeStore(store) {
    fs.mkdirSync(path.dirname(secretsPath), { recursive: true });
    fs.writeFileSync(secretsPath, JSON.stringify(store));
  }

  return {
    async get(key) {
      if (!safeStorage.isEncryptionAvailable()) return null;
      const store = readStore();
      const encrypted = store[key];
      if (!encrypted) return null;
      try {
        return safeStorage.decryptString(Buffer.from(encrypted, "base64"));
      } catch {
        return null;
      }
    },
    async set(key, value) {
      if (!safeStorage.isEncryptionAvailable()) throw new Error("OS-level secret encryption is not available on this device.");
      const store = readStore();
      store[key] = safeStorage.encryptString(String(value ?? "")).toString("base64");
      writeStore(store);
      return true;
    },
    async delete(key) {
      const store = readStore();
      delete store[key];
      writeStore(store);
      return true;
    },
    async listKeys() {
      return Object.keys(readStore());
    },
  };
}

function searchApiKey() {
  if (process.env.SVANS_SEARCH_API_KEY) return process.env.SVANS_SEARCH_API_KEY;
  const repositoryRoot = path.resolve(__dirname, "..", "..");
  const developmentFiles = [
    path.join(repositoryRoot, "svansai_parent", "backend", "app", "node-api", ".env"),
    path.join(repositoryRoot, "svansai_parent", "frontend", ".env.local"),
  ];
  for (const filePath of developmentFiles) {
    const key = readEnvValue(filePath, "SVANS_SEARCH_API_KEY");
    if (key) return key;
  }
  return "";
}

// A single-turn, no-history call to the same SVANS chat backend used by the
// UI. Used by the agent orchestrator for task planning and "chat" steps —
// deliberately independent of any renderer's conversation state, since a
// scheduled task can run with no window open.
async function plainChatCompletion(promptText, { signal, responseMode = "direct" } = {}) {
  const response = await fetch(CHAT_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: [{ role: "user", content: String(promptText || "").slice(0, 30000) }],
      responseMode,
    }),
    signal: combinedSignal(signal, 60000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || `SVANS request failed (${response.status}).`);
  const text = data?.text ?? data?.response ?? data?.answer ?? data?.message;
  if (typeof text !== "string" || !text.trim()) throw new Error("SVANS returned an empty response.");
  return text.trim();
}

function responseOutputText(payload) {
  if (typeof payload?.output_text === "string" && payload.output_text.trim()) return payload.output_text.trim();
  return (Array.isArray(payload?.output) ? payload.output : [])
    .flatMap((item) => Array.isArray(item?.content) ? item.content : [])
    .map((item) => typeof item?.text === "string" ? item.text : "")
    .filter(Boolean)
    .join("\n")
    .trim();
}

function validRobloxPlanText(value) {
  if (typeof value !== "string" || !value.trim()) return false;
  try {
    const parsed = JSON.parse(value.replace(/```json|```/gi, "").trim());
    return parsed && typeof parsed === "object" && !Array.isArray(parsed);
  } catch {
    return false;
  }
}

function referencePlanMetrics(value) {
  const parsed = typeof value === "string" ? JSON.parse(value.replace(/```json|```/gi, "").trim()) : value;
  const buildings = Array.isArray(parsed?.buildings) ? parsed.buildings : [];
  const allParts = [...(Array.isArray(parsed?.parts) ? parsed.parts : []), ...buildings.flatMap((building) => Array.isArray(building?.parts) ? building.parts : [])];
  const expandedParts = allParts.reduce((total, item) => {
    const repeat = Array.isArray(item) ? item[9] : item?.repeat;
    const count = Array.isArray(repeat) ? Math.max(1, Math.min(40, Math.round(Number(repeat[0]) || 1))) : 1;
    return total + count;
  }, 0);
  return { buildings: buildings.length, seedParts: allParts.length, expandedParts };
}

async function localOpenAiBuildCompletion(promptText, { signal } = {}) {
  const key = openAiApiKey();
  if (!key) throw new Error("The hosted SVANSAI planner is offline and no local OpenAI API key is configured.");
  const referenceConversion = String(promptText || "").includes("[SVANS MULTI-VIEW REFERENCE BLUEPRINT]");
  const response = await fetch(RESPONSES_ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4.1-mini",
      input: [{ role: "user", content: [{ type: "input_text", text: String(promptText || "").slice(0, 50000) }] }],
      max_output_tokens: referenceConversion ? 4000 : 12000,
    }),
    signal: combinedSignal(signal, referenceConversion ? 60_000 : 150_000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error?.message || `Local Roblox planning failed (${response.status}).`);
  const text = responseOutputText(payload);
  if (!text) throw new Error("The local Roblox planner returned no construction specification.");
  return text;
}

async function robloxPlanningCompletion(promptText, options = {}) {
  let hostedError = new Error("The hosted SVANSAI planner is currently marked offline.");
  try {
    if (!chatCircuitBreaker.shouldSkip()) {
      const hostedText = await plainChatCompletion(promptText, { ...options, signal: combinedSignal(options.signal, 8_000) });
      if (!validRobloxPlanText(hostedText)) throw new Error("The hosted SVANSAI planner returned conversation text instead of a Roblox construction plan.");
      chatCircuitBreaker.markSuccess();
      return hostedText;
    }
  } catch (error) {
    hostedError = error;
    chatCircuitBreaker.markFailure(error?.name === "AbortError" ? new Error("Hosted planner timed out.") : error);
  }
  try {
    const localText = await localOpenAiBuildCompletion(promptText, options);
    if (!validRobloxPlanText(localText)) throw new Error("The local OpenAI planner returned incomplete or invalid construction JSON.");
    return localText;
  } catch (localError) {
    throw new Error(`Hosted planner unavailable: ${hostedError instanceof Error ? hostedError.message : "unknown error"}. Local fallback failed: ${localError instanceof Error ? localError.message : "unknown error"}.`);
  }
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

function conversationQualityRepairWasRequested(text) {
  return /\b(?:svans(?:-ai)?|ai|assistant|your)\b.{0,100}\b(?:response|answer|conversation|repetitive|repeating|fake|drift|off[ -]topic)\b/i.test(text) ||
    /\b(?:response|answer|conversation|repetitive|repeating|fake|drift|off[ -]topic)\b.{0,100}\b(?:svans(?:-ai)?|ai|assistant|your)\b/i.test(text);
}

function isUnrelatedConversationArchitectureDraft(userText, draftText) {
  if (conversationQualityRepairWasRequested(userText)) return false;
  return /\b(?:the real fix is engineering|conversation-state layer|follow-up resolver|repetition critic|memory gate|route-specific prompts|redesign svans)\b/i.test(draftText);
}

function isDesktopCapabilityQuestion(text) {
  return /\b(?:what (?:is it )?(?:can|could) you (?:help with|do)|what can svans do|how (?:can|could) you help(?: me)?|what are you capable of)\b/i.test(text);
}

function pastedDiscussionReplyContext(text, previousAssistantText) {
  const assistantAskedForPost = /\b(?:draft|write|help).{0,60}\breply\b/i.test(previousAssistantText) &&
    /\b(?:paste|send|provide).{0,50}\b(?:post|discussion|classmate)\b/i.test(previousAssistantText);
  const looksLikeDiscussionPost = text.length > 140 &&
    (/\b(?:professor and class|hello class|good (?:morning|afternoon|evening) class|discussion post)\b/i.test(text) ||
      /^[A-Z][A-Za-z'-]+(?:\s+[A-Z][A-Za-z'-]+)?\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}\b/i.test(text));
  if (!assistantAskedForPost || !looksLikeDiscussionPost) return null;
  const headerName = text.match(/^([A-Z][A-Za-z'-]+)(?:\s+[A-Z][A-Za-z'-]+)?\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}\b/i)?.[1];
  return { classmateName: headerName || "your classmate" };
}

async function alignSpeechWords(audio, input, apiKey) {
  try {
    const form = new FormData();
    form.append("file", new Blob([audio], { type: "audio/wav" }), "svans-speech.wav");
    form.append("model", "whisper-1");
    form.append("response_format", "verbose_json");
    form.append("timestamp_granularities[]", "word");
    form.append("language", "en");
    form.append("prompt", String(input || "").slice(0, 1000));
    const response = await fetch(TRANSCRIPTION_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      signal: AbortSignal.timeout(45_000),
    });
    if (!response.ok) return [];
    const data = await response.json().catch(() => ({}));
    return (Array.isArray(data?.words) ? data.words : [])
      .map((entry) => ({ word: String(entry?.word || "").trim(), start: Number(entry?.start), end: Number(entry?.end) }))
      .filter((entry) => entry.word && Number.isFinite(entry.start) && Number.isFinite(entry.end) && entry.end >= entry.start)
      .slice(0, 4000);
  } catch {
    return [];
  }
}

async function synthesizeNeuralSpeech(input, cacheGreeting = false) {
  const apiKey = openAiApiKey();
  if (!apiKey) return { available: false };
  const cacheKey = crypto.createHash("sha256").update(`cedar-v2:${input}`).digest("hex");
  const cacheDirectory = path.join(app.getPath("userData"), "speech-cache");
  const cachePath = path.join(cacheDirectory, `${cacheKey}.wav`);
  const timingPath = path.join(cacheDirectory, `${cacheKey}.words.json`);
  if (cacheGreeting) {
    try {
      const cached = fs.readFileSync(cachePath);
      if (cached.length) {
        let words = [];
        try { words = JSON.parse(fs.readFileSync(timingPath, "utf8")); } catch { /* The first aligned replay creates this sidecar. */ }
        if (!words.length) {
          void alignSpeechWords(cached, input, apiKey).then((aligned) => {
            if (!aligned.length) return;
            fs.mkdirSync(cacheDirectory, { recursive: true });
            fs.writeFileSync(timingPath, JSON.stringify(aligned), "utf8");
          });
        }
        return { available: true, mimeType: "audio/wav", audio: cached.toString("base64"), words, voice: "cedar", cached: true };
      }
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
      const words = await alignSpeechWords(audio, input, apiKey);
      if (cacheGreeting) {
        fs.mkdirSync(cacheDirectory, { recursive: true });
        fs.writeFileSync(cachePath, audio);
        if (words.length) fs.writeFileSync(timingPath, JSON.stringify(words), "utf8");
      }
      return { available: true, mimeType: "audio/wav", audio: audio.toString("base64"), words, voice: "cedar", cached: false };
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
    cancelOperations(event.sender.id);
    authorizedContents.delete(event.sender.id);
    return true;
  });

  ipcMain.handle("operation:cancel", (event) => {
    assertAuthorized(event);
    return { stopped: cancelOperations(event.sender.id) };
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

  // --- Connector credentials (search + social) ---
  // These never round-trip through the renderer's normal state; they're
  // written straight to the encrypted store and only ever reported back as
  // "connected: true/false", never as the raw token.
  ipcMain.handle("secrets:set", async (event, request) => {
    assertAuthorized(event);
    const key = String(request?.key || "").trim();
    const value = String(request?.value || "").trim();
    if (!key || !value) throw new Error("A key and value are required.");
    await secretStore.set(key, value);
    return { ok: true, key };
  });

  ipcMain.handle("secrets:delete", async (event, request) => {
    assertAuthorized(event);
    const key = String(request?.key || "").trim();
    if (!key) throw new Error("A key is required.");
    await secretStore.delete(key);
    return { ok: true, key };
  });

  ipcMain.handle("secrets:status", async (event) => {
    assertAuthorized(event);
    const keys = await secretStore.listKeys();
    const has = (key) => keys.includes(key);
    return {
      search: has("search:api_key") || Boolean(searchApiKey()),
      reddit: has("reddit:access_token"),
      x: has("x:access_token"),
      discord: has("discord:bot_token"),
      facebook: has("facebook:page_id") && has("facebook:page_access_token"),
      instagram: has("instagram:ig_user_id") && has("instagram:access_token"),
      threads: has("threads:user_id") && has("threads:access_token"),
      youtube: has("youtube:access_token"),
      tiktok: has("tiktok:access_token"),
      hologram: true,
      roblox: has("roblox:open_cloud_key"),
    };
  });

  // --- Agent orchestrator ---
  ipcMain.handle("agent:plan", async (event, request) => {
    assertAuthorized(event);
    const goal = String(request?.goal || "");
    const runAt = request?.runAt ? String(request.runAt) : null;
    return agentOrchestrator.planTask(goal, { runAt });
  });

  ipcMain.handle("agent:start", async (event, request) => {
    assertAuthorized(event);
    return agentOrchestrator.runTask(String(request?.taskId || ""));
  });

  ipcMain.handle("agent:approve", async (event, request) => {
    assertAuthorized(event);
    return agentOrchestrator.approveStep(String(request?.taskId || ""));
  });

  ipcMain.handle("agent:reject", async (event, request) => {
    assertAuthorized(event);
    return agentOrchestrator.rejectStep(String(request?.taskId || ""), request?.reason);
  });

  ipcMain.handle("agent:cancel", async (event, request) => {
    assertAuthorized(event);
    return agentOrchestrator.cancelTask(String(request?.taskId || ""));
  });

  ipcMain.handle("agent:list", async (event) => {
    assertAuthorized(event);
    return agentOrchestrator.listTasks();
  });

  // --- Roblox development agent (publishing intentionally has no IPC route) ---
  ipcMain.handle("roblox:config", async (event) => {
    assertAuthorized(event);
    return robloxAgent.getConfig();
  });

  ipcMain.handle("roblox:configure", async (event, request) => {
    assertAuthorized(event);
    return robloxAgent.saveConfig(request || {});
  });

  ipcMain.handle("roblox:build", async (event, request) => {
    assertAuthorized(event);
    const operation = beginCancelableOperation(event, 90_000);
    try {
      return await robloxAgent.buildProject(String(request?.description || ""), {
        signal: operation.signal,
        intent: request?.intent || null,
      });
    } finally {
      operation.finish();
    }
  });

  ipcMain.handle("roblox:update", async (event, request) => {
    assertAuthorized(event);
    const operation = beginCancelableOperation(event, 90_000);
    try {
      return await robloxAgent.updateProject(String(request?.description || ""), { signal: operation.signal });
    } finally {
      operation.finish();
    }
  });

  ipcMain.handle("roblox:buildInsideProject", async (event, request) => {
    assertAuthorized(event);
    const operation = beginCancelableOperation(event, 260_000);
    try {
      return await robloxAgent.buildInsideProject(String(request?.description || ""), { signal: operation.signal, intent: request?.intent || null });
    } finally {
      operation.finish();
    }
  });

  ipcMain.handle("roblox:analyzeReferences", async (event, request) => {
    assertAuthorized(event);
    const requiredRoles = ["front", "back", "left", "right", "top"];
    const allowedRoles = new Set([...requiredRoles, "interior"]);
    const views = (Array.isArray(request?.views) ? request.views : []).filter((view) => allowedRoles.has(String(view?.role || "")));
    const present = new Set(views.map((view) => view.role));
    const missing = requiredRoles.filter((role) => !present.has(role));
    if (missing.length) throw new Error(`Add the ${missing.join(", ")} reference view${missing.length === 1 ? "" : "s"} first.`);
    const key = openAiApiKey();
    if (!key) throw new Error("Photo analysis needs the local OpenAI API key configured on this PC.");
    let totalBytes = 0;
    const imageContent = views.map((view) => {
      const mimeType = ["image/png", "image/jpeg", "image/webp"].includes(view?.mimeType) ? view.mimeType : "image/jpeg";
      const data = String(view?.data || "").replace(/^data:image\/[a-z0-9.+-]+;base64,/i, "");
      const bytes = Buffer.byteLength(data, "base64");
      if (!data || bytes > 6 * 1024 * 1024) throw new Error(`${view.role} reference must be a valid image under 6 MB.`);
      totalBytes += bytes;
      return [
        { type: "input_text", text: `REFERENCE VIEW: ${String(view.role).toUpperCase()}` },
        { type: "input_image", image_url: `data:${mimeType};base64,${data}`, detail: "high" },
      ];
    }).flat();
    if (totalBytes > 24 * 1024 * 1024) throw new Error("The combined reference set is too large. Use images under roughly 4 MB each.");
    const prompt = [
      "You are the visual architecture and construction-planning stage for a Roblox Studio agent.",
      "All supplied images show the same subject from labeled angles. Reconcile them into one consistent, buildable design; do not describe them as separate objects.",
      "Return ONLY valid JSON for a ready-to-build specification with: name, relativePlacement, lighting, terrain, parts, buildings, objects, characters, scripts, cameraChecks.",
      "Use 4-8 named buildings/structural sections and only 16-36 carefully chosen seed parts total. Encode every part as [name,[sizeX,sizeY,sizeZ],[posX,posY,posZ],[rotX,rotY,rotZ],shape,color,material,transparency,canCollide,repeat].",
      "repeat is optional [count,[offsetX,offsetY,offsetZ],[rotationStepX,rotationStepY,rotationStepZ]]. Use it for windows, facade bays, trim, stairs, columns, roof ribs, battlements, and other repetition so the specification expands locally to 180-260 real Parts without listing them individually. Keep repeat count at most 40.",
      "Allowed shapes are Block, Ball, Cylinder, Wedge, CornerWedge. Use ordinary Parts for structure and collision. Match the reconciled silhouette, dimensions, facade differences, roofline, openings, colors, materials, terrain, and visible interior. Infer unseen structural details in the same style.",
      "Preserve avatar-scale doors, stairs, corridors, rooms, and floor openings. Leave objects, characters, and scripts empty unless visually essential; do not use asset IDs. Include four cameraChecks for front, side, rear, and interior review.",
      request?.brief ? `OWNER BRIEF: ${String(request.brief).slice(0, 1500)}` : "",
    ].filter(Boolean).join("\n");
    const operation = beginCancelableOperation(event, 120_000);
    try {
      const response = await fetch(RESPONSES_ENDPOINT, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "gpt-4.1-mini", input: [{ role: "user", content: [{ type: "input_text", text: prompt }, ...imageContent] }], max_output_tokens: 4000 }),
        signal: combinedSignal(operation.signal, 110_000),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error?.message || `Reference analysis failed (${response.status}).`);
      const planText = responseOutputText(payload);
      if (!validRobloxPlanText(planText)) throw new Error("SVANS could not derive a valid compact construction plan from those views. Try the analysis once more.");
      const metrics = referencePlanMetrics(planText);
      if (metrics.buildings < 4 || metrics.expandedParts < 160) {
        throw new Error(`The visual plan was incomplete (${metrics.buildings} structural sections and ${metrics.expandedParts} expanded parts). Analyze the views once more; SVANS will not mark an incomplete plan ready.`);
      }
      const normalizedPlan = planText.replace(/```json|```/gi, "").trim();
      const blueprint = `[SVANS READY PHOTO CONSTRUCTION SPEC]\n${normalizedPlan}`;
      return { blueprint: blueprint.slice(0, 16000), readyToBuild: true, metrics, viewCount: views.length, roles: views.map((view) => view.role), model: "gpt-4.1-mini" };
    } finally {
      operation.finish();
    }
  });

  ipcMain.handle("roblox:launch", async (event, request) => {
    assertAuthorized(event);
    return robloxAgent.launchProject(String(request?.placePath || ""));
  });

  ipcMain.handle("roblox:openStudio", async (event) => {
    assertAuthorized(event);
    return robloxAgent.launchStudio();
  });

  ipcMain.handle("roblox:studioContext", async (event, request) => {
    assertAuthorized(event);
    return robloxAgent.studioContext(String(request?.query || ""));
  });

  ipcMain.handle("roblox:inspectProject", async (event, request) => {
    assertAuthorized(event);
    const operation = beginCancelableOperation(event, 45_000);
    try {
      return await robloxAgent.inspectProject(String(request?.query || ""), { signal: operation.signal });
    } finally {
      operation.finish();
    }
  });

  ipcMain.handle("roblox:fixProject", async (event, request) => {
    assertAuthorized(event);
    const operation = beginCancelableOperation(event, 100_000);
    try {
      return await robloxAgent.applySafeFixes(String(request?.query || ""), { signal: operation.signal });
    } finally {
      operation.finish();
    }
  });

  ipcMain.handle("roblox:projects", async (event) => {
    assertAuthorized(event);
    return robloxAgent.listProjects();
  });

  ipcMain.handle("roblox:stats", async (event) => {
    assertAuthorized(event);
    return robloxAgent.refreshStats();
  });

  // --- 3D hologram generation ---
  ipcMain.handle("hologram:generate3d", async (event, request) => {
    assertAuthorized(event);
    const subject = String(request?.subject || "");
    const operation = beginCancelableOperation(event, 90_000);
    try {
      return await hologramEngine.generate3D(subject, {
        signal: operation.signal,
        onProgress: (update) => mainWindow?.webContents.send("hologram:progress", { subject, ...update }),
      });
    } finally {
      operation.finish();
    }
  });

  ipcMain.handle("hologram:loadFromUrl", async (event, request) => {
    assertAuthorized(event);
    return hologramEngine.loadFromUrl(String(request?.url || ""));
  });

  ipcMain.handle("chat:send", async (event, payload) => {
    assertAuthorized(event);
    const operation = beginCancelableOperation(event, 65_000);
    try {
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
    if (chatCircuitBreaker.shouldSkip()) return chatCircuitBreaker.response();
    const latestUserIndex = messages.findLastIndex((message) => message.role === "user");
    const latestUserText = messages[latestUserIndex].content;
    const previousAssistantText = messages.slice(0, latestUserIndex).reverse().find((message) => message.role === "assistant")?.content || "";
    const discussionReply = pastedDiscussionReplyContext(latestUserText, previousAssistantText);
    const communicationProfile = typeof payload?.communicationProfile === "string"
      ? payload.communicationProfile.trim().slice(0, 1200)
      : "Shawn prefers natural, direct conversation.";
    const conversationContext = typeof payload?.conversationContext === "string"
      ? payload.conversationContext.trim().slice(0, 2400)
      : "No additional desktop context is active.";
    const codingCoachMode = Boolean(payload?.codingCoachMode);
    const extendedAnswer = userRequestedExtendedAnswer(latestUserText);
    const semanticMessages = messages.map((message, index) => (
      index === latestUserIndex && discussionReply
        ? {
            ...message,
            content: `Shawn pasted ${discussionReply.classmateName}'s class discussion post after you asked him for it. Draft Shawn's reply to ${discussionReply.classmateName}. Start exactly with "Good afternoon ${discussionReply.classmateName}," then write one natural paragraph that responds to the classmate's points and adds one useful thought. Do not rewrite the original post, do not speak as the classmate, do not address the professor or class, and do not add commentary before or after the reply.\n\nClassmate's original post:\n${latestUserText}`.slice(0, 30000),
          }
        : index === latestUserIndex && isDesktopCapabilityQuestion(latestUserText)
        ? {
            ...message,
            content: "Answer Shawn directly in two natural sentences, without introducing or quoting the reply. He casually asked what you can help him with. Mention open conversation, planning projects, everyday computer tasks, coding, and interactive visual models. Sound like a familiar, capable assistant rather than a product description.",
          }
        : message
    ));
    const conversationDirection = [
      `Desktop conversation guidance: Speak naturally with Shawn and answer his current meaning directly. ${communicationProfile}`,
      `Live conversation state: ${conversationContext}`,
      "Resolve short replies and references such as it, that, the second one, why, exactly, do that, or change it against the live state and recent messages. Continue the current subject instead of restarting it. Ask one brief clarification only when acting on the wrong referent would materially matter.",
      "When the live state says Roblox is active, never claim that SVANS cannot open, inspect, or control Roblox Studio and never replace a requested action with generic step-by-step instructions. The desktop Roblox route handles supported actions; answer only about the result or ask for the one missing detail.",
      "Never say that you are planning, working, getting started, making progress, or that you will keep Shawn updated unless the recent messages contain a real action result or task status supplied by the desktop. If no action actually started, say so plainly without inventing background work.",
      extendedAnswer
        ? "He asked for depth, so use the space genuinely needed."
        : "For an ordinary exchange, use only two or three short sentences unless more is necessary.",
      codingCoachMode
        ? "Coding Coach mode is active: teach one concept at a time, let Shawn attempt the code first, then give a hint and review his attempt before offering a complete solution."
        : "Give direct help and complete requested work.",
      "Avoid corporate phrasing and unnecessary headings or lists. Light dry humor is welcome when it fits. Omit citations unless Shawn asks for them.",
    ].join(" ").slice(0, 4800);
    const outboundMessages = [
      { role: "assistant", content: conversationDirection },
      ...semanticMessages,
    ];
    const requestChat = async (requestMessages, requestSessionId) => {
      const response = await fetch(CHAT_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: requestMessages,
          sessionId: requestSessionId,
          responseMode: codingCoachMode ? "tutor" : extendedAnswer ? "auto" : "direct",
        }),
        signal: operation.signal,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const error = new Error(data?.error || `SVANS request failed (${response.status}).`);
        error.status = response.status;
        throw error;
      }
      const text = data?.text ?? data?.response ?? data?.answer ?? data?.message;
      if (typeof text !== "string" || !text.trim()) throw new Error("SVANS returned an empty response.");
      return { data, text: text.trim() };
    };

    const originalSessionId = typeof payload?.sessionId === "string" ? payload.sessionId : undefined;
    let { data, text } = await requestChat(outboundMessages, originalSessionId);
    if (isUnrelatedConversationArchitectureDraft(latestUserText, text)) {
      const recoveryMessages = [
        { role: "assistant", content: conversationDirection },
        { role: "user", content: "Stay with the present exchange and answer the final message directly. Ignore unrelated earlier topics." },
        { role: "assistant", content: "Understood. I will stay with the current exchange." },
        ...semanticMessages.slice(-12),
      ];
      const recovered = await requestChat(
        recoveryMessages,
        originalSessionId ? `${originalSessionId}:recovery:${crypto.randomUUID()}` : undefined,
      );
      data = recovered.data;
      text = recovered.text;
    }
    let conversationalText = userExplicitlyRequestedSources(latestUserText) ? text.trim() : removeUnrequestedSources(text);
    if (
      codingCoachMode &&
      !/\bSVANS(?:-AI)?\b/i.test(latestUserText) &&
      /\b(?:SVANS-AI needs|conversation-state layer|memory gate|route-specific prompts|redesign SVANS)\b/i.test(conversationalText)
    ) {
      conversationalText = "That answer drifted away from your coding lesson, so I stopped it. Show me what you are trying to code, and I will help you understand the first step without writing it for you.";
    }
    chatCircuitBreaker.markSuccess();
    return { text: conversationalText, orchestration: data?.orchestration ?? null, offline: false };
    } catch (error) {
      if (chatCircuitBreaker.markFailure(error)) return chatCircuitBreaker.response();
      throw error;
    } finally {
      operation.finish();
    }
  });

  ipcMain.handle("speech:synthesize", async (event, rawText) => {
    assertAuthorized(event);
    const input = String(rawText ?? "").trim().slice(0, 6000);
    if (!input) throw new Error("Speech text is required.");
    return synthesizeNeuralSpeech(input, isSpokenLoginGreeting(input));
  });

  ipcMain.handle("hologram:generate", async (event, rawSubject) => {
    assertAuthorized(event);
    const operation = beginCancelableOperation(event, 125_000);
    try {
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
        signal: operation.signal,
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
    } finally {
      operation.finish();
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

if (hasSingleInstanceLock) app.whenReady().then(async () => {
  if (process.platform === "win32") app.setAppUserModelId("com.vansantplatform.svans.holographic");
  enableWindowsStartup();
  void synthesizeNeuralSpeech(spokenLoginGreeting(), true);
  secretStore = createSecretStore();
  const resolvedSearchKey = searchApiKey() || (await secretStore.get("search:api_key")) || "";
  actionEngine = createActionEngine({
    workspaceRoot: path.resolve(__dirname, "..", ".."),
    onAudit: (entry) => mainWindow?.webContents.send("computer:audit", entry),
    searchApiKey: resolvedSearchKey,
    socialConnectors: createSocialConnectors({ secretStore }),
    businessOps: createBusinessOps({
      storagePath: path.join(app.getPath("userData"), "business-ops.json"),
      chatFn: plainChatCompletion,
    }),
  });
  agentOrchestrator = createAgentOrchestrator({
    actionEngine,
    chatFn: plainChatCompletion,
    storagePath: path.join(app.getPath("userData"), "agent-tasks.json"),
    onUpdate: (task) => mainWindow?.webContents.send("agent:update", task),
    onAudit: (entry) => mainWindow?.webContents.send("computer:audit", entry),
  });
  hologramEngine = createHologramEngine({ cacheDirectory: path.join(app.getPath("userData"), "hologram-asset-cache") });
  robloxAgent = createRobloxAgent({
    projectsRoot: path.join(app.getPath("documents"), "SVANS", "Roblox Projects"),
    storagePath: path.join(app.getPath("userData"), "roblox-agent.json"),
    secretStore,
    chatFn: robloxPlanningCompletion,
    onStats: (stats) => mainWindow?.webContents.send("roblox:stats-update", stats),
    onAudit: (entry) => mainWindow?.webContents.send("computer:audit", entry),
  });
  registerIpc();
  createWindow();
  robloxAgent.startMonitoring();
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

  // Checks for scheduled agent tasks whose runAt time has arrived. This is
  // what lets a task actually start "while the owner is away" rather than
  // only when someone is sitting at the app — but every sensitive step
  // inside it still pauses for approval per the orchestrator's own rules.
  setInterval(() => agentOrchestrator?.tickScheduler(), 30_000);
});

app.on("window-all-closed", (event) => event.preventDefault());
app.on("will-quit", () => globalShortcut.unregisterAll());
