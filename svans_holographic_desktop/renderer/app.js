(() => {
  "use strict";

  const desktop = window.svansDesktop ?? {
    async login(username, password) {
      return username.trim().toLowerCase() === "admin" && /^\d{5}$/.test(password)
        ? { ok: true, username: "admin", role: "Administrator" }
        : { ok: false, attemptsRemaining: 4 };
    },
    async logout() { return true; },
    async systemSnapshot() {
      return {
        cpu: 27,
        memory: 54,
        memoryUsedGb: 8.6,
        memoryTotalGb: 16,
        uptimeSeconds: 19342,
        hostname: "SVANS-PREVIEW",
        platform: "Browser preview",
        processors: 12,
        networkAdapters: 2,
        timestamp: new Date().toISOString(),
      };
    },
    async computerStatus() {
      return { permissions: { files: true, apps: true, browser: true, processes: true, admin: false, research: false, social: false }, roots: [] };
    },
    async setComputerPermission(capability, enabled) {
      return { files: true, apps: true, browser: true, processes: true, admin: false, research: false, social: false, [capability]: enabled };
    },
    async executeComputerAction(action) {
      return { message: `Desktop preview accepted ${action.type}.`, title: "COMPUTER ACTION PREVIEW", lines: [JSON.stringify(action.payload ?? {})] };
    },
    async emergencyStop() { return { message: "Emergency stop activated.", title: "EMERGENCY STOP", lines: ["Preview helper queue cleared"] }; },
    onComputerAudit() { return () => {}; },
    onEmergencyStop() { return () => {}; },
    async chat() {
      return { text: "The live conversational bridge activates inside the Electron desktop app. The holographic interface is running in visual preview mode." };
    },
    async synthesizeSpeech() { return { available: false }; },
    async generateHologram() { return { available: false, reason: "Image generation is available in the desktop app." }; },
    async openDestination(destination) {
      window.open(destination === "svansai" ? "https://svansai.com" : "https://vansantplatform.com", "_blank", "noopener");
      return true;
    },
    windowAction() {},
    async setAlwaysOnTop(enabled) { return enabled; },
    async setCompact(enabled) { return enabled; },
    async saveSecret() { return { ok: true }; },
    async deleteSecret() { return { ok: true }; },
    async connectorStatus() { return { search: false, reddit: false, x: false, discord: false, facebook: false, instagram: false, threads: false, youtube: false, tiktok: false, hologram: false, roblox: false }; },
    async planAgentTask(goal) {
      return { id: "preview", goal, steps: [], cursor: 0, status: "awaiting_start", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    },
    async startAgentTask() { return null; },
    async approveAgentStep() { return null; },
    async rejectAgentStep() { return null; },
    async cancelAgentTask() { return null; },
    async listAgentTasks() { return []; },
    onAgentUpdate() { return () => {}; },
    async generateHologram3D() { return { available: false, reason: "Online 3D library search is available in the desktop app." }; },
    async loadHologramFromUrl() { return { available: false, reason: "Model loading is available in the desktop app." }; },
    onHologramProgress() { return () => {}; },
    async robloxConfig() { return { universeId: "", placeId: "", publishCapability: false }; },
    async configureRoblox(config) { return { ...config, publishCapability: false }; },
    async buildRobloxGame(description) { return { name: "Preview Roblox Game", description, placePath: "preview.rbxlx", publishCapability: false }; },
    async updateRobloxGame(description) { return { name: "Preview Roblox Game", description, placePath: "preview.rbxlx", buildingCount: 1, characterCount: 1, publishCapability: false }; },
    async buildInsideRobloxProject() { return { available: false, reason: "Live Studio building is unavailable in preview mode." }; },
    async analyzeRobloxReferences() { return { blueprint: "Preview reference blueprint", viewCount: 5, roles: ["front", "back", "left", "right", "top"] }; },
    async launchRobloxProject() { return { ok: true, publishCapability: false }; },
    async openRobloxStudio() { return { ok: true, message: "Opening Roblox Studio.", publishCapability: false }; },
    async robloxStudioContext() { return { running: false, projectName: null, recentProjects: [] }; },
    async inspectRobloxProject() { return { available: false, opened: false, reason: "Studio inspection is unavailable in preview mode." }; },
    async fixRobloxProject() { return { available: false, reason: "Live Studio control is unavailable in preview mode." }; },
    async listRobloxProjects() { return []; },
    async refreshRobloxStats() { return { configured: false, publishCapability: false }; },
    onRobloxStats() { return () => {}; },
  };

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const sessionId = crypto.randomUUID();

  function loadCommunicationProfile() {
    const fallback = { messageCount: 0, totalWords: 0, shortMessages: 0, casualMessages: 0, directMessages: 0, correctionMessages: 0 };
    try {
      const saved = JSON.parse(localStorage.getItem("svans.communicationProfile") || "null");
      return saved && typeof saved === "object" ? { ...fallback, ...saved } : fallback;
    } catch {
      return fallback;
    }
  }

  const defaultConversationContext = () => ({ domain: "general", intent: "greeting", topic: "SVANS desktop", subject: null, unresolved: null, lastUserText: "", lastAssistantText: "", entities: [], updatedAt: Date.now() });

  function loadConversationMemory() {
    try {
      const saved = JSON.parse(localStorage.getItem("svans.conversationMemory") || "null");
      const messages = Array.isArray(saved?.messages)
        ? saved.messages.filter((message) => ["user", "assistant"].includes(message?.role) && typeof message?.content === "string").slice(-50)
        : [];
      const context = saved?.context && typeof saved.context === "object" ? { ...defaultConversationContext(), ...saved.context } : defaultConversationContext();
      const pendingRobloxAction = saved?.pendingRobloxAction?.type === "live_build" ? saved.pendingRobloxAction : null;
      return { messages, context, pendingRobloxAction };
    } catch {
      return { messages: [], context: defaultConversationContext(), pendingRobloxAction: null };
    }
  }

  const restoredConversation = loadConversationMemory();

  const state = {
    messages: restoredConversation.messages.length ? restoredConversation.messages : [{ role: "assistant", content: "Holographic interface online. What are we building today, Shawn?" }],
    busy: false,
    voiceEnabled: true,
    speechOutputEnabled: true,
    speechRate: Math.min(1.3, Math.max(0.7, Number(localStorage.getItem("svans.speechRate")) || 1)),
    speechVolume: Math.min(1, Math.max(0.08, Number(localStorage.getItem("svans.speechVolume")) || 1)),
    listening: false,
    recognition: null,
    pinned: false,
    compact: false,
    snapshot: null,
    toastTimer: null,
    authenticated: false,
    telemetryTimer: null,
    lockoutTimer: null,
    voice: null,
    audio: null,
    speechAnimationFrame: null,
    speechHighlighter: null,
    speechRequestId: 0,
    operationGeneration: 0,
    conversationContext: restoredConversation.context,
    computerPermissions: { files: true, apps: true, browser: true, processes: true, admin: true, research: true, social: true, screen: true },
    lastFileResults: [],
    confirmationResolver: null,
    globe: null,
    universalHologram: null,
    communicationProfile: loadCommunicationProfile(),
    codingCoachMode: localStorage.getItem("svans.codingCoachMode") === "true",
    agentTasks: [],
    robloxProjects: [],
    robloxStats: null,
    pendingRobloxAction: restoredConversation.pendingRobloxAction,
    lastRobloxBuildBrief: localStorage.getItem("svans.lastRobloxBuildBrief") || "",
    robloxReferenceBlueprint: localStorage.getItem("svans.robloxReferenceBlueprint") || "",
    robloxReferenceViews: {},
  };

  function persistConversationMemory() {
    try {
      const messages = state.messages.slice(-50).map((message) => ({ role: message.role, content: String(message.content || "").slice(0, 12000) }));
      const pendingRobloxAction = state.pendingRobloxAction ? { ...state.pendingRobloxAction, description: String(state.pendingRobloxAction.description || "").slice(0, 16000) } : null;
      localStorage.setItem("svans.conversationMemory", JSON.stringify({ messages, context: state.conversationContext, pendingRobloxAction }));
    } catch {
      // Local memory is best-effort; a full storage quota must not break chat.
    }
  }

  const elements = {
    activityList: $("#activity-list"),
    commandForm: $("#command-form"),
    commandInput: $("#command-input"),
    connectionLabel: $("#connection-label"),
    core: $("#svans-core"),
    coreLoad: $("#core-load-label"),
    coreState: $("#core-state"),
    cpuRing: $("#cpu-ring"),
    cpuValue: $("#cpu-value"),
    date: $("#date-label"),
    host: $("#host-value"),
    memoryRing: $("#memory-ring"),
    memoryValue: $("#memory-value"),
    messageStream: $("#message-stream"),
    microphone: $("#microphone-button"),
    network: $("#network-value"),
    permissionDrawer: $("#permission-drawer"),
    processor: $("#processor-value"),
    taskList: $("#task-list"),
    toast: $("#toast"),
    uptime: $("#uptime-value"),
    voiceLink: $("#voice-link-label"),
    voiceSpectrum: $("#voice-spectrum"),
    voiceProfile: $("#voice-profile"),
    voiceSpeed: $("#voice-speed"),
    voiceSpeedValue: $("#voice-speed-value"),
    hud: $("#hud-shell"),
    loginGate: $("#login-gate"),
    loginForm: $("#login-form"),
    loginUsername: $("#login-username"),
    loginPassword: $("#login-password"),
    loginStatus: $("#login-status"),
    loginTerminal: $(".login-terminal"),
    authorizeButton: $("#authorize-button"),
    actionConfirmation: $("#action-confirmation"),
    actionConfirmTitle: $("#action-confirm-title"),
    actionConfirmDescription: $("#action-confirm-description"),
    actionConfirmTarget: $("#action-confirm-target"),
    actionConfirmLevel: $("#action-confirm-level"),
    robloxReferenceModal: $("#roblox-reference-modal"),
    robloxReferenceStatus: $("#roblox-reference-status"),
    robloxReferenceButton: $("#roblox-reference-button"),
  };

  function closeActionConfirmation(approved = false) {
    elements.actionConfirmation.classList.remove("open");
    elements.actionConfirmation.setAttribute("aria-hidden", "true");
    const resolve = state.confirmationResolver;
    state.confirmationResolver = null;
    resolve?.(approved);
  }

  function confirmComputerAction({ title, description, target, level = "OWNER CONFIRMATION" }) {
    if (state.confirmationResolver) closeActionConfirmation(false);
    elements.actionConfirmTitle.textContent = title;
    elements.actionConfirmDescription.textContent = description;
    elements.actionConfirmTarget.textContent = target;
    elements.actionConfirmLevel.textContent = level;
    elements.actionConfirmation.classList.add("open");
    elements.actionConfirmation.setAttribute("aria-hidden", "false");
    return new Promise((resolve) => {
      state.confirmationResolver = resolve;
      $("#action-confirm-cancel").focus();
    });
  }

  function setLoginStatus(message, mode = "") {
    elements.loginStatus.textContent = message;
    elements.loginStatus.className = `login-status ${mode}`.trim();
  }

  function loginGreeting() {
    const hour = new Date().getHours();
    const period = hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
    return `Good ${period}, Shawn. Welcome back. SVANS is online, the command deck is ready, and I am standing by.`;
  }

  function denyAccess(message) {
    setLoginStatus(message, "error");
    elements.loginTerminal.classList.remove("denied");
    void elements.loginTerminal.offsetWidth;
    elements.loginTerminal.classList.add("denied");
    elements.loginPassword.select();
  }

  function beginLockout(lockedUntil) {
    window.clearInterval(state.lockoutTimer);
    elements.authorizeButton.disabled = true;
    const update = () => {
      const seconds = Math.max(0, Math.ceil((lockedUntil - Date.now()) / 1000));
      if (seconds > 0) {
        setLoginStatus(`ACCESS LOCKED · RETRY IN ${seconds} SECONDS`, "error");
        return;
      }
      window.clearInterval(state.lockoutTimer);
      state.lockoutTimer = null;
      elements.authorizeButton.disabled = false;
      setLoginStatus("LOCKOUT CLEARED · ENCRYPTED CHANNEL READY");
    };
    update();
    state.lockoutTimer = window.setInterval(update, 250);
  }

  function startAuthenticatedHud() {
    if (state.authenticated) return;
    state.authenticated = true;
    elements.loginTerminal.classList.add("authorized");
    setLoginStatus("IDENTITY CONFIRMED · WELCOME, ADMIN", "success");
    const greeting = loginGreeting();
    state.messages.push({ role: "assistant", content: greeting });
    appendMessage("assistant", greeting);
    void speak(greeting);
    window.setTimeout(() => {
      document.body.classList.remove("auth-locked");
      elements.loginGate.classList.add("unlocked");
      elements.loginGate.setAttribute("aria-hidden", "true");
      elements.hud.setAttribute("aria-hidden", "false");
      void refreshTelemetry();
      void refreshComputerStatus();
      state.telemetryTimer = window.setInterval(() => void refreshTelemetry(), 2500);
      logActivity("Administrator identity confirmed");
      showToast("WELCOME, ADMIN · SVANS COMMAND DECK ONLINE");
    }, 180);
  }

  async function submitLogin() {
    if (elements.authorizeButton.disabled) return;
    const username = elements.loginUsername.value;
    const password = elements.loginPassword.value;
    if (!username.trim() || !password) {
      denyAccess("OPERATOR AND ACCESS CODE REQUIRED");
      return;
    }
    elements.authorizeButton.disabled = true;
    setLoginStatus("ANALYZING IDENTITY SIGNATURE…");
    try {
      const result = await desktop.login(username, password);
      elements.loginPassword.value = "";
      if (result.ok) {
        startAuthenticatedHud();
        return;
      }
      elements.authorizeButton.disabled = false;
      if (result.lockedUntil) {
        beginLockout(result.lockedUntil);
        return;
      }
      denyAccess(`ACCESS DENIED · ${result.attemptsRemaining ?? 0} ATTEMPTS REMAINING`);
    } catch {
      elements.authorizeButton.disabled = false;
      denyAccess("AUTHENTICATION CHANNEL UNAVAILABLE");
    }
  }

  function bindAuthentication() {
    elements.loginForm.addEventListener("submit", (event) => {
      event.preventDefault();
      void submitLogin();
    });
    $("#login-minimize-button").addEventListener("click", () => desktop.windowAction("minimize"));
    $("#login-close-button").addEventListener("click", () => desktop.windowAction("close"));
    $("#logout-button").addEventListener("click", async () => {
      stopRecognition();
      window.speechSynthesis?.cancel();
      window.clearInterval(state.telemetryTimer);
      await desktop.logout();
      window.location.reload();
    });
  }

  function timeLabel(date = new Date()) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
  }

  function showToast(message) {
    elements.toast.textContent = message;
    elements.toast.classList.add("visible");
    window.clearTimeout(state.toastTimer);
    state.toastTimer = window.setTimeout(() => elements.toast.classList.remove("visible"), 2800);
  }

  function logActivity(message) {
    const item = document.createElement("li");
    const time = document.createElement("time");
    const text = document.createElement("span");
    time.textContent = timeLabel();
    text.textContent = message;
    item.append(time, text);
    elements.activityList.prepend(item);
    while (elements.activityList.children.length > 12) elements.activityList.lastElementChild?.remove();
  }

  function updateClock() {
    const now = new Date();
    $("#clock").textContent = now.toLocaleTimeString([], { hour12: false });
    elements.date.textContent = now.toLocaleDateString([], {
      weekday: "short",
      month: "short",
      day: "2-digit",
    }).toUpperCase();
  }

  function formatUptime(seconds) {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return days ? `${days}D ${hours}H` : `${hours}H ${minutes}M`;
  }

  async function refreshTelemetry() {
    try {
      const snapshot = await desktop.systemSnapshot();
      state.snapshot = snapshot;
      elements.cpuValue.textContent = `${snapshot.cpu}%`;
      elements.memoryValue.textContent = `${snapshot.memory}%`;
      elements.cpuRing.style.setProperty("--value", snapshot.cpu);
      elements.memoryRing.style.setProperty("--value", snapshot.memory);
      elements.host.textContent = snapshot.hostname;
      elements.processor.textContent = `${snapshot.processors} LOGICAL CORES`;
      elements.network.textContent = `${snapshot.networkAdapters} ACTIVE`;
      elements.uptime.textContent = formatUptime(snapshot.uptimeSeconds);
      elements.coreLoad.textContent = snapshot.cpu > 80 ? "ELEVATED" : "NOMINAL";
      elements.connectionLabel.textContent = "SYSTEM LINK ACTIVE";
    } catch (error) {
      elements.connectionLabel.textContent = "SYSTEM LINK DEGRADED";
      elements.connectionLabel.style.color = "var(--amber)";
      logActivity(`Telemetry error: ${error instanceof Error ? error.message : "unknown"}`);
    }
  }

  function appendInlineContent(parent, content) {
    const text = String(content || "");
    const tokenPattern = /(\*\*[^*]+\*\*|`[^`]+`)/g;
    let cursor = 0;
    for (const match of text.matchAll(tokenPattern)) {
      if (match.index > cursor) parent.append(document.createTextNode(text.slice(cursor, match.index)));
      const token = match[0];
      const element = document.createElement(token.startsWith("**") ? "strong" : "code");
      element.textContent = token.startsWith("**") ? token.slice(2, -2) : token.slice(1, -1);
      parent.append(element);
      cursor = match.index + token.length;
    }
    if (cursor < text.length) parent.append(document.createTextNode(text.slice(cursor)));
  }

  function assistantResponseLines(content) {
    return String(content || "")
      .replace(/\r/g, "")
      .replace(/[ \t]+(?=\*\*(?:overall|overall assessment|strongest areas|important risks|most important risks|next three improvements|what these structural facts[^*]*)\s*:?\*\*)/gi, "\n")
      .replace(/[ \t]+(?=\d+\.\s+\*\*)/g, "\n")
      .replace(/[ \t]+(?=\*\s+\*\*)/g, "\n")
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean);
  }

  function renderAssistantResponse(body, content) {
    const lines = assistantResponseLines(content);
    for (const line of lines) {
      const numbered = line.match(/^(\d+)\.\s+(.+)$/);
      const bullet = line.match(/^(?:[-•*])\s+(.+)$/);
      const heading = line.match(/^\*\*([^*]{2,90}):?\*\*\s*(.*)$/);
      if (numbered) {
        const item = document.createElement("div");
        const index = document.createElement("b");
        const copy = document.createElement("div");
        item.className = "response-list-item numbered";
        index.textContent = numbered[1];
        appendInlineContent(copy, numbered[2]);
        item.append(index, copy);
        body.append(item);
      } else if (bullet) {
        const item = document.createElement("div");
        const marker = document.createElement("i");
        const copy = document.createElement("div");
        item.className = "response-list-item";
        marker.setAttribute("aria-hidden", "true");
        appendInlineContent(copy, bullet[1]);
        item.append(marker, copy);
        body.append(item);
      } else if (heading) {
        const section = document.createElement("section");
        const title = document.createElement("h4");
        title.textContent = heading[1].replace(/:$/, "");
        section.className = "response-section";
        section.append(title);
        if (heading[2]) {
          const paragraph = document.createElement("p");
          appendInlineContent(paragraph, heading[2]);
          section.append(paragraph);
        }
        body.append(section);
      } else {
        const paragraph = document.createElement("p");
        appendInlineContent(paragraph, line.replace(/^---+$/, ""));
        if (paragraph.textContent.trim()) body.append(paragraph);
      }
    }
  }

  function appendMessage(role, content) {
    const wrapper = document.createElement("div");
    const label = document.createElement("span");
    const body = document.createElement(role === "user" ? "p" : "div");
    wrapper.className = `message ${role === "user" ? "user-message" : "svans-message"}`;
    wrapper.svansRawContent = String(content);
    body.className = "message-body";
    label.textContent = role === "user" ? "SHAWN" : "SVANS";
    if (role === "user") body.textContent = content;
    else renderAssistantResponse(body, content);
    if (role === "user") {
      state.conversationContext.lastUserText = String(content).slice(0, 800);
      state.conversationContext.updatedAt = Date.now();
    } else {
      state.conversationContext.lastAssistantText = String(content).slice(0, 1200);
      state.conversationContext.unresolved = /\?\s*$/.test(String(content)) ? String(content).slice(0, 800) : null;
      state.conversationContext.updatedAt = Date.now();
    }
    wrapper.append(label, body);
    elements.messageStream.append(wrapper);
    queueMicrotask(persistConversationMemory);
    if (role === "user") {
      elements.messageStream.scrollTop = elements.messageStream.scrollHeight;
      return;
    }
    requestAnimationFrame(() => {
      const panel = $("#conversation-panel");
      const chromeHeight = 30 + elements.commandForm.offsetHeight + 22;
      const desiredHeight = Math.max(170, wrapper.scrollHeight + chromeHeight);
      const maximumHeight = Math.max(220, Math.floor(window.innerHeight * 0.46));
      panel.style.height = `${Math.min(desiredHeight, maximumHeight)}px`;
      elements.messageStream.scrollTop = Math.max(0, wrapper.offsetTop - elements.messageStream.offsetTop - 8);
    });
    return wrapper;
  }

  function learnCommunicationStyle(text) {
    const profile = state.communicationProfile;
    const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
    profile.messageCount += 1;
    profile.totalWords += wordCount;
    if (wordCount <= 12) profile.shortMessages += 1;
    if (/\b(?:yeah|nah|okay|good|kinda|basically|wanna|gonna|not sure|i want)\b/i.test(text)) profile.casualMessages += 1;
    if (/^(?:can you|could you|i want|go ahead|make|add|remove|open|show|tell|give)\b/i.test(text.trim())) profile.directMessages += 1;
    if (/\b(?:not what i meant|isn't right|is not right|doesn't|wrong|actually|i meant|that is not|that's not)\b/i.test(text)) profile.correctionMessages += 1;
    localStorage.setItem("svans.communicationProfile", JSON.stringify(profile));
  }

  function communicationStyleSummary() {
    const profile = state.communicationProfile;
    if (!profile.messageCount) return "Shawn prefers direct, relaxed, natural conversation.";
    const averageWords = Math.max(1, Math.round(profile.totalWords / profile.messageCount));
    const usuallyShort = profile.shortMessages / profile.messageCount > 0.45;
    const oftenCasual = profile.casualMessages / profile.messageCount > 0.18;
    const oftenDirect = profile.directMessages / profile.messageCount > 0.28;
    return [
      `Shawn's messages average about ${averageWords} words and are ${usuallyShort ? "usually concise" : "sometimes detailed"}.`,
      oftenCasual ? "His tone is conversational and informal." : "Keep the tone relaxed rather than formal.",
      oftenDirect ? "He prefers direct answers and action-oriented wording." : "Answer his actual intent without unnecessary setup.",
      "Interpret informal spelling and fragments by context. Treat corrections as durable preferences and adapt without over-apologizing.",
    ].join(" ");
  }

  function codingCoachPreference(text) {
    if (/\b(?:turn off|disable|stop|exit) (?:the )?(?:coding )?coach(?: mode)?\b/i.test(text)) return false;
    if (/\b(?:coding coach|teach me (?:how )?to code|learn (?:how )?to code|code (?:things )?on my own|without relying on (?:an? )?ai|help me learn programming)\b/i.test(text)) return true;
    return null;
  }

  function voiceVolumePreference(text) {
    if (/\b(?:keep it down|keep (?:your|the) voice down|speak (?:more )?quietly|lower (?:your|the) voice|quiet voice|family is sleeping|people are sleeping|whisper)\b/i.test(text)) return 0.18;
    if (/\b(?:normal volume|regular volume|speak normally|turn (?:your|the) voice back up|you can speak up|louder now)\b/i.test(text)) return 1;
    return null;
  }

  function setCodingCoachMode(enabled) {
    state.codingCoachMode = Boolean(enabled);
    localStorage.setItem("svans.codingCoachMode", String(state.codingCoachMode));
    const control = $("#coding-coach-mode");
    if (control) control.checked = state.codingCoachMode;
  }

  function setCoreState(label, mode = "ready") {
    elements.coreState.textContent = label;
    document.body.classList.toggle("thinking", mode === "thinking");
    document.body.classList.toggle("voice-active", mode === "listening" || mode === "speaking");
    elements.voiceSpectrum.classList.toggle("active", mode === "listening" || mode === "speaking");
  }

  function voiceScore(voice, preferredName) {
    const name = voice.name.toLowerCase();
    const language = voice.lang.toLowerCase();
    let score = voice.name === preferredName ? 10000 : 0;
    if (name.includes("natural")) score += 900;
    if (name.includes("online")) score += 500;
    if (name.includes("microsoft")) score += 180;
    if (/guy|andrew|ryan|brian|christopher|davis|james/.test(name)) score += 140;
    if (/aria|jenny|ava|sonia|emma/.test(name)) score += 110;
    if (language.startsWith("en-us")) score += 100;
    else if (language.startsWith("en")) score += 70;
    if (voice.localService) score += 15;
    return score;
  }

  function loadVoiceProfiles() {
    if (!("speechSynthesis" in window)) return;
    const voices = window.speechSynthesis.getVoices().filter((voice) => voice.lang.toLowerCase().startsWith("en"));
    if (!voices.length) return;
    const preferredName = localStorage.getItem("svans.voice") ?? "";
    voices.sort((a, b) => voiceScore(b, preferredName) - voiceScore(a, preferredName));
    state.voice = voices[0];
    elements.voiceProfile.innerHTML = "";
    voices.forEach((voice) => {
      const option = document.createElement("option");
      option.value = voice.name;
      option.textContent = `${voice.name} · ${voice.lang}`;
      option.selected = voice.name === state.voice.name;
      elements.voiceProfile.append(option);
    });
  }

  function conversationalText(text) {
    return text
      .replace(/[*_#`]/g, "")
      .replace(/\s*[-•]\s+/g, ". ")
      .replace(/\bSVANS\b/gi, "S-Vans")
      .replace(/\s+/g, " ")
      .trim();
  }

  function clearSpeechHighlight() {
    if (state.speechAnimationFrame) cancelAnimationFrame(state.speechAnimationFrame);
    state.speechAnimationFrame = null;
    state.speechHighlighter?.clear?.();
    state.speechHighlighter = null;
  }

  function speechMessageFor(text) {
    const messages = [...elements.messageStream.querySelectorAll(".svans-message")].reverse();
    return messages.find((message) => message.svansRawContent === String(text)) || messages[0] || null;
  }

  function createSpeechHighlighter(text) {
    clearSpeechHighlight();
    const message = speechMessageFor(text);
    const body = message?.querySelector(".message-body");
    if (!body) return null;
    const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
    const textNodes = [];
    while (walker.nextNode()) textNodes.push(walker.currentNode);
    const words = [];
    for (const node of textNodes) {
      if (!node.nodeValue?.trim()) continue;
      const fragment = document.createDocumentFragment();
      let cursor = 0;
      for (const match of node.nodeValue.matchAll(/\S+/g)) {
        if (match.index > cursor) fragment.append(document.createTextNode(node.nodeValue.slice(cursor, match.index)));
        const word = document.createElement("span");
        word.className = "spoken-word";
        word.textContent = match[0];
        words.push(word);
        fragment.append(word);
        cursor = match.index + match[0].length;
      }
      if (cursor < node.nodeValue.length) fragment.append(document.createTextNode(node.nodeValue.slice(cursor)));
      node.replaceWith(fragment);
    }
    if (!words.length) return null;
    message.classList.add("voice-reading");
    let activeIndex = -1;
    const setProgress = (progress) => {
      const nextIndex = Math.min(words.length - 1, Math.max(0, Math.floor(progress * words.length)));
      if (nextIndex === activeIndex) return;
      if (activeIndex >= 0) {
        const previousWord = words[activeIndex];
        previousWord.classList.remove("active");
        previousWord.classList.add("read", "leaving");
        window.setTimeout(() => previousWord.classList.remove("leaving"), 260);
      }
      activeIndex = nextIndex;
      words[activeIndex].classList.remove("read", "leaving");
      words[activeIndex].classList.add("active");
      if (activeIndex % 7 === 0) words[activeIndex].scrollIntoView({ block: "nearest", behavior: "smooth" });
    };
    const clear = () => {
      message.classList.remove("voice-reading");
      words.forEach((word) => word.classList.remove("active", "read", "leaving", "approaching"));
    };
    state.speechHighlighter = { setProgress, clear };
    return state.speechHighlighter;
  }

  function speechChunks(text, limit = 900) {
    const sentences = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map((sentence) => sentence.trim()).filter(Boolean) ?? [text];
    const chunks = [];
    let current = "";
    for (const sentence of sentences) {
      const combined = current ? `${current} ${sentence}` : sentence;
      if (combined.length <= limit) {
        current = combined;
        continue;
      }
      if (current) chunks.push(current);
      current = "";
      if (sentence.length <= limit) {
        current = sentence;
        continue;
      }
      const words = sentence.split(/\s+/);
      for (const word of words) {
        if (current && `${current} ${word}`.length > limit) {
          chunks.push(current);
          current = word;
        } else {
          current = current ? `${current} ${word}` : word;
        }
      }
    }
    if (current) chunks.push(current);
    return chunks.length ? chunks : [text];
  }

  function finishSpeaking(preview = false) {
    state.audio = null;
    clearSpeechHighlight();
    setCoreState("READY");
    elements.voiceLink.textContent = state.voiceEnabled ? "CHANNEL READY" : "OUTPUT READY";
    if (!preview) startRecognition();
  }

  function stopSpeaking({ quiet = false } = {}) {
    const wasSpeaking = Boolean(state.audio) || Boolean(window.speechSynthesis?.speaking) || /(?:VOICE|SPEAKING|FORMING)/i.test(elements.voiceLink.textContent);
    if (!wasSpeaking) return false;
    state.speechRequestId += 1;
    clearSpeechHighlight();
    if (state.audio) {
      state.audio.onended = null;
      state.audio.onerror = null;
      state.audio.pause();
      state.audio.currentTime = 0;
      state.audio = null;
    }
    window.speechSynthesis?.cancel();
    setCoreState("READY");
    elements.voiceLink.textContent = state.voiceEnabled ? "CHANNEL READY" : "OUTPUT READY";
    if (!quiet) {
      showToast("SVANS VOICE STOPPED");
      logActivity("Spoken response stopped by owner");
    }
    if (state.voiceEnabled) window.setTimeout(startRecognition, 120);
    return true;
  }

  function stopCurrentOperation() {
    const loadingHologram = Boolean(state.universalHologram?.panel?.querySelector(".universal-loading"));
    const wasActive = state.busy || loadingHologram || Boolean(state.audio) || Boolean(window.speechSynthesis?.speaking) || /(?:VOICE|SPEAKING|FORMING|PROCESSING|BUILDING|SEARCHING|GENERATING)/i.test(elements.voiceLink.textContent);
    if (!wasActive) return false;

    state.operationGeneration += 1;
    state.busy = false;
    stopSpeaking({ quiet: true });
    if (loadingHologram) state.universalHologram?.close?.();
    void desktop.cancelCurrentOperation?.().catch(() => {});
    setCoreState("READY");
    elements.voiceLink.textContent = state.voiceEnabled ? "CHANNEL READY" : "OUTPUT READY";
    showToast("CURRENT OPERATION STOPPED");
    logActivity("Current conversation operation stopped by owner");
    if (state.voiceEnabled) window.setTimeout(startRecognition, 120);
    return true;
  }

  function speakWithWindowsVoice(text, preview = false, highlighter = null) {
    if (!("speechSynthesis" in window)) {
      finishSpeaking(preview);
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.voice = state.voice;
    utterance.rate = state.speechRate;
    utterance.pitch = 0.98;
    utterance.volume = state.speechVolume;
    utterance.onboundary = (event) => {
      if (event.name === "word" && text.length) highlighter?.setProgress(event.charIndex / text.length);
    };
    utterance.onend = () => finishSpeaking(preview);
    utterance.onerror = utterance.onend;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }

  function playNeuralSegment(generated, requestId, onProgress = null) {
    return new Promise((resolve, reject) => {
      if (requestId !== state.speechRequestId) {
        resolve(false);
        return;
      }
      const audio = new Audio(`data:${generated.mimeType ?? "audio/wav"};base64,${generated.audio}`);
      audio.playbackRate = state.speechRate;
      audio.volume = state.speechVolume;
      state.audio = audio;
      const alignedWords = (Array.isArray(generated.words) ? generated.words : [])
        .filter((word) => Number.isFinite(Number(word?.start)) && Number.isFinite(Number(word?.end)))
        .map((word) => ({ start: Number(word.start), end: Number(word.end) }));
      let alignedIndex = 0;
      const trackProgress = () => {
        if (requestId !== state.speechRequestId || audio.paused || audio.ended) return;
        if (alignedWords.length) {
          while (alignedIndex + 1 < alignedWords.length && audio.currentTime >= alignedWords[alignedIndex + 1].start) alignedIndex += 1;
          if (audio.currentTime >= alignedWords[0].start) onProgress?.((alignedIndex + 0.01) / alignedWords.length);
        } else if (Number.isFinite(audio.duration) && audio.duration > 0) {
          onProgress?.(audio.currentTime / audio.duration);
        }
        state.speechAnimationFrame = requestAnimationFrame(trackProgress);
      };
      audio.onplay = trackProgress;
      audio.onended = () => {
        if (state.speechAnimationFrame) cancelAnimationFrame(state.speechAnimationFrame);
        state.speechAnimationFrame = null;
        onProgress?.(1);
        resolve(true);
      };
      audio.onerror = () => reject(new Error("Neural audio playback failed."));
      audio.play().catch(reject);
    });
  }

  async function speak(text, { preview = false } = {}) {
    if (!preview && !state.speechOutputEnabled) {
      setCoreState("READY");
      return;
    }
    stopRecognition();
    setCoreState("SPEAKING", "speaking");
    elements.voiceLink.textContent = "NEURAL VOICE · FORMING";
    const spokenText = conversationalText(text);
    const chunks = speechChunks(spokenText);
    const highlighter = preview ? null : createSpeechHighlighter(text);
    const chunkWordCounts = chunks.map((chunk) => chunk.match(/\S+/g)?.length || 1);
    const totalSpeechWords = Math.max(1, chunkWordCounts.reduce((total, count) => total + count, 0));
    const requestId = ++state.speechRequestId;
    state.audio?.pause();
    state.audio = null;
    window.speechSynthesis.cancel();
    try {
      const requestAudio = (chunk) => desktop.synthesizeSpeech(chunk).catch(() => ({ available: false }));
      let pendingAudio = requestAudio(chunks[0]);
      let spokenWords = 0;
      for (let index = 0; index < chunks.length; index += 1) {
        const generated = await pendingAudio;
        if (requestId !== state.speechRequestId) return;
        if (!generated?.available || !generated.audio) throw new Error("Neural voice unavailable.");
        pendingAudio = index + 1 < chunks.length ? requestAudio(chunks[index + 1]) : null;
        elements.voiceLink.textContent = "NEURAL VOICE";
        const chunk = chunks[index];
        const played = await playNeuralSegment(generated, requestId, (segmentProgress) => {
          highlighter?.setProgress((spokenWords + (chunkWordCounts[index] * segmentProgress)) / totalSpeechWords);
        });
        if (!played || requestId !== state.speechRequestId) return;
        spokenWords += chunkWordCounts[index];
      }
      finishSpeaking(preview);
    } catch {
      if (requestId !== state.speechRequestId) return;
      elements.voiceLink.textContent = "WINDOWS FALLBACK";
      speakWithWindowsVoice(spokenText, preview, highlighter);
    }
  }

  function createIntelPanel(title, lines, accent = "cyan") {
    document.querySelector(".floating-intel")?.remove();
    const panel = document.createElement("section");
    panel.className = `floating-intel accent-${accent}`;
    const header = document.createElement("header");
    const heading = document.createElement("strong");
    const close = document.createElement("button");
    const content = document.createElement("div");
    heading.textContent = title;
    close.textContent = "×";
    close.setAttribute("aria-label", `Close ${title}`);
    close.addEventListener("click", () => panel.remove());
    header.append(heading, close);
    for (const line of lines) {
      const row = document.createElement("p");
      row.textContent = line;
      content.append(row);
    }
    panel.append(header, content);
    $(".hologram-stage").append(panel);
    requestAnimationFrame(() => panel.classList.add("visible"));
    logActivity(`${title} hologram generated`);
  }

  const globeContinents = [
    [[-168, 66], [-145, 70], [-125, 55], [-123, 40], [-106, 24], [-96, 18], [-84, 22], [-81, 30], [-66, 44], [-55, 52], [-74, 60], [-100, 72], [-140, 72], [-168, 66]],
    [[-81, 12], [-70, 8], [-61, -5], [-52, -20], [-58, -35], [-69, -55], [-76, -35], [-81, -5], [-81, 12]],
    [[-18, 36], [2, 44], [25, 39], [36, 31], [51, 12], [43, -12], [31, -34], [18, -35], [5, -18], [-10, 5], [-18, 36]],
    [[-10, 36], [5, 58], [28, 71], [60, 72], [90, 65], [126, 50], [145, 48], [155, 28], [121, 20], [104, 8], [78, 7], [57, 24], [38, 35], [20, 42], [-10, 36]],
    [[112, -11], [145, -12], [154, -28], [137, -43], [116, -35], [112, -11]],
    [[-52, 60], [-30, 72], [-20, 82], [-48, 84], [-62, 74], [-52, 60]],
  ];

  function createHolographicGlobe() {
    state.universalHologram?.close?.();
    if (state.globe?.panel?.isConnected) {
      state.globe.panel.classList.remove("globe-pulse");
      requestAnimationFrame(() => state.globe.panel.classList.add("globe-pulse"));
      return;
    }
    const panel = document.createElement("section");
    panel.className = "globe-hologram";
    panel.innerHTML = `
      <header><div><small>SVANS GEOSPATIAL MODULE</small><strong>HOLOGRAPHIC EARTH</strong></div><button data-globe="close" aria-label="Close holographic globe">×</button></header>
      <div class="globe-viewport"><canvas aria-label="Interactive rotating holographic globe"></canvas><div class="globe-scan"></div><div class="globe-reticle"></div><span class="globe-readout">PLANETARY LINK · LIVE</span></div>
      <footer><span>DRAG TO ROTATE · SCROLL TO ZOOM</span><div><button data-globe="zoom-out">−</button><button data-globe="pause">PAUSE</button><button data-globe="reset">RESET</button><button data-globe="zoom-in">＋</button></div></footer>`;
    $(".hologram-stage").append(panel);
    const canvas = panel.querySelector("canvas");
    const context = canvas.getContext("2d");
    const globe = { panel, canvas, context, yaw: -0.55, pitch: -0.16, zoom: 1, spinning: true, dragging: false, lastX: 0, lastY: 0, frame: 0 };
    state.globe = globe;

    const resize = () => {
      const bounds = canvas.getBoundingClientRect();
      const ratio = Math.min(devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(bounds.width * ratio));
      canvas.height = Math.max(1, Math.round(bounds.height * ratio));
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    };
    const project = (longitude, latitude, radius, centerX, centerY) => {
      const lon = longitude * Math.PI / 180 + globe.yaw;
      const lat = latitude * Math.PI / 180;
      const x = Math.cos(lat) * Math.sin(lon);
      const baseY = -Math.sin(lat);
      const baseZ = Math.cos(lat) * Math.cos(lon);
      const y = baseY * Math.cos(globe.pitch) - baseZ * Math.sin(globe.pitch);
      const z = baseY * Math.sin(globe.pitch) + baseZ * Math.cos(globe.pitch);
      return { x: centerX + x * radius, y: centerY + y * radius, visible: z >= -0.015, depth: z };
    };
    const drawLine = (points, radius, centerX, centerY, color, width = 1) => {
      let drawing = false;
      context.beginPath();
      for (const [lon, lat] of points) {
        const point = project(lon, lat, radius, centerX, centerY);
        if (!point.visible) { drawing = false; continue; }
        if (!drawing) context.moveTo(point.x, point.y);
        else context.lineTo(point.x, point.y);
        drawing = true;
      }
      context.strokeStyle = color;
      context.lineWidth = width;
      context.stroke();
    };
    const draw = () => {
      if (!panel.isConnected) return;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      context.clearRect(0, 0, width, height);
      const centerX = width / 2;
      const centerY = height / 2;
      const radius = Math.min(width, height) * 0.34 * globe.zoom;
      const glow = context.createRadialGradient(centerX - radius * 0.22, centerY - radius * 0.25, radius * 0.05, centerX, centerY, radius * 1.12);
      glow.addColorStop(0, "rgba(65, 235, 255, .2)");
      glow.addColorStop(.72, "rgba(0, 112, 170, .08)");
      glow.addColorStop(1, "rgba(0, 212, 255, 0)");
      context.fillStyle = glow;
      context.beginPath();
      context.arc(centerX, centerY, radius * 1.14, 0, Math.PI * 2);
      context.fill();
      context.strokeStyle = "rgba(80, 232, 255, .86)";
      context.lineWidth = 1.5;
      context.shadowColor = "#00d4ff";
      context.shadowBlur = 12;
      context.beginPath();
      context.arc(centerX, centerY, radius, 0, Math.PI * 2);
      context.stroke();
      context.shadowBlur = 0;
      for (let latitude = -75; latitude <= 75; latitude += 15) {
        const points = [];
        for (let longitude = -180; longitude <= 180; longitude += 4) points.push([longitude, latitude]);
        drawLine(points, radius, centerX, centerY, "rgba(57, 197, 230, .27)");
      }
      for (let longitude = -180; longitude < 180; longitude += 15) {
        const points = [];
        for (let latitude = -90; latitude <= 90; latitude += 3) points.push([longitude, latitude]);
        drawLine(points, radius, centerX, centerY, "rgba(57, 197, 230, .22)");
      }
      for (const continent of globeContinents) drawLine(continent, radius, centerX, centerY, "rgba(132, 246, 255, .95)", 1.8);
      context.strokeStyle = "rgba(0, 212, 255, .2)";
      context.beginPath();
      context.ellipse(centerX, centerY + radius * 1.1, radius * 1.25, radius * .16, 0, 0, Math.PI * 2);
      context.stroke();
      if (globe.spinning && !globe.dragging) globe.yaw += 0.0022;
      globe.frame = requestAnimationFrame(draw);
    };
    let observer;
    const close = () => {
      cancelAnimationFrame(globe.frame);
      observer?.disconnect();
      panel.remove();
      if (state.globe === globe) state.globe = null;
      logActivity("Holographic Earth closed");
    };
    panel.addEventListener("click", (event) => {
      const action = event.target.closest("[data-globe]")?.dataset.globe;
      if (!action) return;
      if (action === "close") close();
      if (action === "pause") {
        globe.spinning = !globe.spinning;
        event.target.textContent = globe.spinning ? "PAUSE" : "RESUME";
      }
      if (action === "reset") Object.assign(globe, { yaw: -0.55, pitch: -0.16, zoom: 1, spinning: true });
      if (action === "zoom-in") globe.zoom = Math.min(1.35, globe.zoom + 0.1);
      if (action === "zoom-out") globe.zoom = Math.max(0.7, globe.zoom - 0.1);
    });
    canvas.addEventListener("pointerdown", (event) => {
      globe.dragging = true; globe.lastX = event.clientX; globe.lastY = event.clientY; canvas.setPointerCapture(event.pointerId);
    });
    canvas.addEventListener("pointermove", (event) => {
      if (!globe.dragging) return;
      globe.yaw += (event.clientX - globe.lastX) * 0.008;
      globe.pitch = Math.max(-1.1, Math.min(1.1, globe.pitch + (event.clientY - globe.lastY) * 0.006));
      globe.lastX = event.clientX; globe.lastY = event.clientY;
    });
    canvas.addEventListener("pointerup", () => { globe.dragging = false; });
    canvas.addEventListener("wheel", (event) => {
      event.preventDefault();
      globe.zoom = Math.max(0.7, Math.min(1.35, globe.zoom - Math.sign(event.deltaY) * 0.08));
    }, { passive: false });
    observer = new ResizeObserver(resize);
    observer.observe(canvas);
    panel.addEventListener("transitionend", resize, { once: true });
    requestAnimationFrame(() => { panel.classList.add("visible"); resize(); draw(); });
    logActivity("Holographic Earth generated");
  }

  function createUniversalHologram(rawSubject) {
    state.globe?.panel?.querySelector('[data-globe="close"]')?.click();
    state.universalHologram?.close?.();
    const subject = rawSubject.trim().replace(/[.!?]+$/, "").slice(0, 90) || "unknown object";
    const panel = document.createElement("section");
    panel.className = "universal-hologram";
    panel.innerHTML = `
      <header><div><small>SVANS UNIVERSAL HOLOGRAM ENGINE</small><strong></strong></div><button data-hologram="close" aria-label="Close hologram">×</button></header>
      <div class="universal-viewport"><canvas></canvas><div class="hologram3d-mount"></div><div class="globe-scan"></div><div class="universal-reticle"></div><div class="universal-loading"><i></i><span>CHECKING 3D MODEL SOURCES</span></div><div class="universal-label"><span>AI HOLOGRAPHIC MODEL</span><strong></strong><small>MODEL REQUEST · PENDING</small></div></div>
      <footer><span>MODEL CONTROLS ACTIVATE WHEN READY</span><div><button data-hologram="zoom-out" disabled>−</button><button data-hologram="pause" disabled>PAUSE</button><button data-hologram="explode" disabled>EXPLODE</button><button data-hologram="xray" disabled>X-RAY</button><button data-hologram="reset" disabled>RESET</button><button data-hologram="zoom-in" disabled>＋</button></div></footer>`;
    panel.querySelector("header strong").textContent = subject.toUpperCase();
    panel.querySelector(".universal-label strong").textContent = subject;
    $(".hologram-stage").append(panel);
    const canvas = panel.querySelector("canvas");
    const context = canvas.getContext("2d");
    const points = [];
    const networkEdges = [];
    const pointCount = 560;
    let seed = 0;
    for (const character of subject) seed = (Math.imul(seed, 31) + character.charCodeAt(0)) >>> 0;
    const heartMode = /\b(heart|cardiac)\b/i.test(subject);
    const dnaMode = /\b(dna|helix|genetic|genome)\b/i.test(subject);
    const networkMode = /\b(network|connection|topology|router|internet|lan|wi-?fi)\b/i.test(subject);
    canvas.style.opacity = networkMode ? "1" : "0";
    if (networkMode) {
      points.push({ x: 0, y: 0, z: 0, role: "core", label: "ROUTER" });
      for (let hub = 0; hub < 6; hub += 1) {
        const angle = hub / 6 * Math.PI * 2;
        const hubIndex = points.length;
        points.push({ x: Math.cos(angle) * 0.62, y: Math.sin(angle) * 0.5, z: Math.sin(angle * 2) * 0.25, role: "hub", label: `NODE ${String(hub + 1).padStart(2, "0")}` });
        networkEdges.push([0, hubIndex]);
        for (let device = 0; device < 4; device += 1) {
          const spread = angle + (device - 1.5) * 0.22;
          const deviceIndex = points.length;
          points.push({ x: Math.cos(spread) * (0.92 + device % 2 * 0.12), y: Math.sin(spread) * (0.72 + (device + hub) % 2 * 0.1), z: Math.cos(angle + device * 1.7) * 0.38, role: "device" });
          networkEdges.push([hubIndex, deviceIndex]);
        }
      }
    } else {
      for (let index = 0; index < pointCount; index += 1) {
        const progress = index / pointCount;
        if (heartMode) {
          const angle = progress * Math.PI * 2;
          const depth = ((index * 37) % 29) / 28 - 0.5;
          points.push({ x: Math.sin(angle) ** 3 * 0.85, y: -(0.68 * Math.cos(angle) - 0.28 * Math.cos(2 * angle) - 0.14 * Math.cos(3 * angle) - 0.07 * Math.cos(4 * angle)), z: depth * 0.5 * Math.sin(angle) });
        } else if (dnaMode) {
          const strand = index % 2 ? 1 : -1;
          const y = progress * 2 - 1;
          const angle = y * Math.PI * 4 + (strand > 0 ? 0 : Math.PI);
          points.push({ x: Math.cos(angle) * 0.48, y, z: Math.sin(angle) * 0.48 });
        } else {
          const y = 1 - (index / (pointCount - 1)) * 2;
          const radius = Math.sqrt(1 - y * y);
          const angle = Math.PI * (3 - Math.sqrt(5)) * index;
          const distortion = 1 + 0.14 * Math.sin(angle * (2 + seed % 5)) * Math.cos(y * Math.PI * (2 + seed % 4));
          points.push({ x: Math.cos(angle) * radius * distortion, y: y * (0.78 + seed % 17 / 100), z: Math.sin(angle) * radius * distortion });
        }
      }
    }
    const model = { panel, points, yaw: -0.45, pitch: -0.2, zoom: 1, spinning: true, dragging: false, lastX: 0, lastY: 0, frame: 0, observer: null, close: null, asset: null, viewer3D: null, has3D: false, xray: false, exploded: false, fallbackStarted: false, resultAnnounced: false };
    state.universalHologram = model;
    const setControls = (mode) => {
      const enabled = new Set(mode === "3d" ? ["zoom-out", "pause", "explode", "xray", "reset", "zoom-in"] : mode === "flat" || mode === "network" ? ["zoom-out", "pause", "reset", "zoom-in"] : []);
      panel.querySelectorAll("footer [data-hologram]").forEach((button) => { button.disabled = !enabled.has(button.dataset.hologram); });
      panel.querySelector("footer > span").textContent = mode === "3d"
        ? "DRAG TO ROTATE · SCROLL TO ZOOM · EXPLODE / X-RAY AVAILABLE"
        : mode === "flat" ? "DRAG TO TILT · SCROLL TO ZOOM · 2D VISUAL FALLBACK"
          : mode === "network" ? "DRAG TO ROTATE · SCROLL TO ZOOM · LIVE DATA FLOW"
            : "MODEL UNAVAILABLE · SEARCH VERIFIED LIBRARIES AGAIN";
    };
    const announceResult = (message, { speakResult = true } = {}) => {
      if (model.resultAnnounced || !panel.isConnected) return;
      model.resultAnnounced = true;
      state.messages.push({ role: "assistant", content: message });
      appendMessage("assistant", message);
      if (speakResult) void speak(message);
    };
    const resize = () => {
      const bounds = canvas.getBoundingClientRect();
      const ratio = Math.min(devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(bounds.width * ratio));
      canvas.height = Math.max(1, Math.round(bounds.height * ratio));
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    };
    const draw = () => {
      if (!panel.isConnected) return;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      const centerX = width / 2;
      const centerY = height / 2 - 5;
      const scale = Math.min(width, height) * 0.28 * model.zoom;
      context.clearRect(0, 0, width, height);
      if (model.asset) {
        const turn = Math.sin(model.yaw) * 11;
        model.asset.style.transform = `translate(-50%, -50%) perspective(900px) rotateX(${model.pitch * 14}deg) rotateY(${turn}deg) scale(${model.zoom})`;
      }
      const cy = Math.cos(model.yaw); const sy = Math.sin(model.yaw);
      const cx = Math.cos(model.pitch); const sx = Math.sin(model.pitch);
      const projected = points.map((point) => {
        const x1 = point.x * cy - point.z * sy;
        const z1 = point.x * sy + point.z * cy;
        const y2 = point.y * cx - z1 * sx;
        const z2 = point.y * sx + z1 * cx;
        const perspective = 1 / (2.8 - z2 * 0.42);
        return { x: centerX + x1 * scale * perspective * 2.45, y: centerY + y2 * scale * perspective * 2.45, z: z2, perspective, role: point.role, label: point.label };
      });
      const depthSorted = [...projected].sort((a, b) => a.z - b.z);
      context.globalCompositeOperation = "lighter";
      if (networkMode) {
        const packetTime = performance.now() / 1400;
        networkEdges.forEach(([fromIndex, toIndex], edgeIndex) => {
          const from = projected[fromIndex];
          const to = projected[toIndex];
          const gradient = context.createLinearGradient(from.x, from.y, to.x, to.y);
          gradient.addColorStop(0, "rgba(0, 212, 255, .28)");
          gradient.addColorStop(0.5, "rgba(103, 241, 255, .9)");
          gradient.addColorStop(1, "rgba(0, 139, 190, .24)");
          context.strokeStyle = gradient;
          context.lineWidth = from.role === "core" ? 1.6 : 0.9;
          context.beginPath(); context.moveTo(from.x, from.y); context.lineTo(to.x, to.y); context.stroke();
          const progress = (packetTime + edgeIndex * 0.137) % 1;
          const packetX = from.x + (to.x - from.x) * progress;
          const packetY = from.y + (to.y - from.y) * progress;
          context.fillStyle = "rgba(186, 251, 255, .95)";
          context.shadowColor = "#52eaff"; context.shadowBlur = 9;
          context.beginPath(); context.arc(packetX, packetY, 2.1, 0, Math.PI * 2); context.fill();
        });
      } else {
        for (let index = 1; index < depthSorted.length; index += 1) {
          const point = depthSorted[index];
          const prior = depthSorted[index - 1];
          if (Math.hypot(point.x - prior.x, point.y - prior.y) < scale * 0.18) {
            context.strokeStyle = `rgba(30, 190, 235, ${0.025 + point.perspective * 0.08})`;
            context.beginPath(); context.moveTo(prior.x, prior.y); context.lineTo(point.x, point.y); context.stroke();
          }
        }
      }
      for (const point of depthSorted) {
        const light = Math.max(0.2, Math.min(1, (point.z + 1.2) / 2.1));
        context.fillStyle = `rgba(${Math.round(70 + light * 90)}, ${Math.round(190 + light * 60)}, 255, ${0.3 + light * 0.65})`;
        context.shadowColor = "#00d4ff"; context.shadowBlur = light * 7;
        const size = point.role === "core" ? 12 : point.role === "hub" ? 7 : point.role === "device" ? 4 : 0.7 + light * 1.4;
        context.beginPath(); context.arc(point.x, point.y, size, 0, Math.PI * 2); context.fill();
        if (point.role === "core" || point.role === "hub") {
          context.strokeStyle = point.role === "core" ? "rgba(168, 250, 255, .95)" : "rgba(74, 218, 255, .72)";
          context.lineWidth = 1;
          context.beginPath(); context.arc(point.x, point.y, size + 5, 0, Math.PI * 2); context.stroke();
          context.shadowBlur = 0;
          context.fillStyle = "rgba(157, 239, 255, .86)";
          context.font = `${point.role === "core" ? 8 : 6}px Consolas, monospace`;
          context.textAlign = "center";
          context.fillText(point.label, point.x, point.y - size - 9);
        }
      }
      context.shadowBlur = 0; context.globalCompositeOperation = "source-over";
      context.strokeStyle = "rgba(0, 212, 255, .2)";
      context.beginPath(); context.ellipse(centerX, centerY + scale * 1.12, scale * 1.35, scale * .16, 0, 0, Math.PI * 2); context.stroke();
      if (model.spinning && !model.dragging) model.yaw += 0.003;
      model.frame = requestAnimationFrame(draw);
    };
    model.close = () => {
      cancelAnimationFrame(model.frame);
      model.observer?.disconnect();
      model.viewer3D?.dispose?.();
      model.stopHologramProgress?.();
      panel.remove();
      if (state.universalHologram === model) state.universalHologram = null;
      logActivity(`${subject} hologram closed`);
    };
    panel.addEventListener("click", (event) => {
      const action = event.target.closest("[data-hologram]")?.dataset.hologram;
      if (action === "close") model.close();
      if (action === "retry") {
        model.close();
        createUniversalHologram(subject);
      }
      if (action === "pause") {
        model.spinning = !model.spinning;
        model.viewer3D?.setSpinning?.(model.spinning);
        event.target.textContent = model.spinning ? "PAUSE" : "RESUME";
      }
      if (action === "reset") {
        Object.assign(model, { yaw: -0.45, pitch: -0.2, zoom: 1, spinning: true, exploded: false, xray: false });
        panel.querySelector('[data-hologram="pause"]').textContent = "PAUSE";
        model.viewer3D?.reset?.();
      }
      if (action === "zoom-in") model.zoom = Math.min(1.45, model.zoom + 0.1);
      if (action === "zoom-out") model.zoom = Math.max(0.65, model.zoom - 0.1);
      if (action === "explode") {
        if (!model.has3D) { showToast("EXPLODE VIEW NEEDS A REAL 3D MODEL"); return; }
        model.exploded = !model.exploded;
        model.viewer3D?.explode?.(model.exploded ? 0.6 : 0);
        event.target.textContent = model.exploded ? "COLLAPSE" : "EXPLODE";
      }
      if (action === "xray") {
        if (!model.has3D) { showToast("X-RAY VIEW NEEDS A REAL 3D MODEL"); return; }
        model.xray = !model.xray;
        model.viewer3D?.setTransparent?.("", model.xray ? 0.28 : 1);
        event.target.textContent = model.xray ? "SOLID" : "X-RAY";
      }
    });
    canvas.addEventListener("pointerdown", (event) => { model.dragging = true; model.lastX = event.clientX; model.lastY = event.clientY; canvas.setPointerCapture(event.pointerId); });
    canvas.addEventListener("pointermove", (event) => {
      if (!model.dragging) return;
      model.yaw += (event.clientX - model.lastX) * 0.008;
      model.pitch = Math.max(-1.1, Math.min(1.1, model.pitch + (event.clientY - model.lastY) * 0.006));
      model.lastX = event.clientX; model.lastY = event.clientY;
    });
    canvas.addEventListener("pointerup", () => { model.dragging = false; });
    canvas.addEventListener("wheel", (event) => { event.preventDefault(); model.zoom = Math.max(0.65, Math.min(1.45, model.zoom - Math.sign(event.deltaY) * 0.08)); }, { passive: false });
    model.observer = new ResizeObserver(resize);
    model.observer.observe(canvas);
    requestAnimationFrame(() => { panel.classList.add("visible"); resize(); draw(); });

    function fallbackToFlatImage() {
      if (model.fallbackStarted) return;
      model.fallbackStarted = true;
      const pendingLoading = panel.querySelector(".universal-loading span");
      if (pendingLoading) pendingLoading.textContent = "NO VERIFIED 3D MATCH · CREATING DETAILED VISUAL";
      void desktop.generateHologram(subject).then((result) => {
        if (!panel.isConnected) return;
        const loading = panel.querySelector(".universal-loading");
        const status = panel.querySelector(".universal-label small");
        if (!result?.available || !result.image) {
          loading?.classList.add("failed");
          if (loading) loading.innerHTML = `<i></i><span></span><button type="button" data-hologram="retry">SEARCH AGAIN</button>`;
          if (loading) loading.querySelector("span").textContent = result?.reason || "DETAILED MODEL UNAVAILABLE";
          status.textContent = "NO MATCHING 3D ASSET OR VISUAL AVAILABLE";
          setControls("failed");
          announceResult(`I searched the available 3D libraries, but I could not find a trustworthy model or create a detailed visual of ${subject}.`);
          return;
        }
        const asset = new Image();
        asset.className = "generated-hologram-asset";
        asset.alt = `Generated holographic model of ${subject}`;
        asset.addEventListener("load", () => {
          loading?.remove();
          status.textContent = result.cached ? "CACHED MODEL · INTERACTIVE · LIVE" : "NEW MODEL · INTERACTIVE · LIVE";
          asset.classList.add("visible");
          setControls("flat");
          announceResult(`Here it is—your holographic model of ${subject} is ready. You can tilt it or zoom in for a closer look.`);
          logActivity(`${subject} holographic visual ready`);
        });
        asset.src = `data:${result.mimeType || "image/png"};base64,${result.image}`;
        model.asset = asset;
        panel.querySelector(".universal-viewport").prepend(asset);
      }).catch(() => {
        const loading = panel.querySelector(".universal-loading");
        loading?.classList.add("failed");
        if (loading) loading.innerHTML = `<i></i><span>VISUAL GENERATION LINK UNAVAILABLE</span><button type="button" data-hologram="retry">SEARCH AGAIN</button>`;
        panel.querySelector(".universal-label small").textContent = "MODEL NOT CREATED · ONLINE SEARCH UNAVAILABLE";
        setControls("failed");
        announceResult(`I opened the hologram workspace, but the model generator is unavailable, so I did not create a substitute shape for ${subject}.`);
      });
    }

    if (networkMode) {
      panel.querySelector(".universal-loading")?.remove();
      panel.querySelector(".universal-label span").textContent = "LIVE NETWORK TOPOLOGY";
      panel.querySelector(".universal-label small").textContent = "ROUTER · HUBS · ENDPOINTS · DATA FLOW";
      setControls("network");
      announceResult("The live network topology is ready. The center is the router, the larger points are hubs, the outer points are connected devices, and the moving lights represent data flow.");
      logActivity("Live network topology ready");
    } else if (window.SvansHologram3D && typeof desktop.generateHologram3D === "function") {
      // Try real geometry first. This is the actual "universal hologram engine"
      // capability — genuine mesh you can explode, cross-section, and X-ray —
      // not the flat-image fallback below, which only exists for subjects or
      // setups where 3D generation isn't available.
      const loading = panel.querySelector(".universal-loading");
      const status = panel.querySelector(".universal-label small");
      model.stopHologramProgress = desktop.onHologramProgress((update) => {
        if (update.subject !== subject || !panel.isConnected) return;
        if (loading) loading.querySelector("span").textContent = `${String(update.status || update.stage).toUpperCase()} · ${update.progress ?? 0}%`;
      });
      void desktop.generateHologram3D(subject).then((result) => {
        model.stopHologramProgress?.();
        if (!panel.isConnected) return;
        if (!result?.available || !result.glbBase64) {
          if (loading) loading.querySelector("span").textContent = result?.reason || "REAL GEOMETRY UNAVAILABLE";
          fallbackToFlatImage();
          return;
        }
        const mount = panel.querySelector(".hologram3d-mount");
        const viewer = window.SvansHologram3D.mount(mount);
        model.viewer3D = viewer;
        viewer.loadGlbFromBase64(result.glbBase64, {
          onLoaded: () => {
            if (!panel.isConnected) return;
            loading?.remove();
            mount.classList.add("visible");
            model.has3D = true;
            status.textContent = `${result.title || result.source || "VERIFIED ONLINE LIBRARY"} · REAL GEOMETRY`;
            setControls("3d");
            const foundTitle = result.title && result.title.toLowerCase() !== subject.toLowerCase() ? ` called ${result.title}` : "";
            announceResult(`I found a verified 3D model${foundTitle} online and loaded it for ${subject}. You can rotate it, zoom in, use X-ray, or explode the assembly.`);
            logActivity(`${subject} 3D hologram ready`);
          },
          onError: () => {
            if (loading) loading.querySelector("span").textContent = "MODEL FAILED TO LOAD";
            fallbackToFlatImage();
          },
        });
      }).catch(() => {
        model.stopHologramProgress?.();
        fallbackToFlatImage();
      });
    } else {
      fallbackToFlatImage();
    }
    logActivity(`${subject} hologram requested`);
  }

  function parseHologramCommand(rawText) {
    const text = rawText.trim()
      .replace(/^svans[,.]?\s*/i, "")
      .replace(/^please\s+/i, "")
      .replace(/^(?:(?:can|could|would) you|i want you to)\s+/i, "");
    if (/^(?:close|hide|dismiss|remove)(?: the)? (?:current |active )?(?:hologram|holographic display)(?: of .+)?[.!?]*$/i.test(text)) return { type: "close_hologram" };
    const match = text.match(/^(?:(?:open|show|display|launch|start|create|generate|bring up)(?: me)?\s+)?(?:a |an |the )?(?:3d |interactive )?(?:hologram(?: of)?|holographic(?: model|display|image|view)?(?: of)?)\s+(.+?)[.!?]*$/i);
    if (match) {
      const subject = match[1].trim().replace(/^(?:a|an|the)\s+/i, "");
      return { type: /^(?:globe|earth)$/i.test(subject) ? "open_globe" : "open_universal", subject };
    }
    if (/^(?:open|show|display|launch|start|create|generate|bring up)(?: me)? (?:a |the )?(?:holographic |3d |interactive )?(?:globe|earth)(?: hologram)?[.!?]*$/i.test(text)) return { type: "open_globe", subject: "Earth" };
    if (/^(?:close|hide|dismiss|remove)(?: the)? (?:holographic |3d )?(?:globe|earth)(?: hologram)?[.!?]*$/i.test(text)) return { type: "close_hologram" };

    if (/^(?:explode|separate|blow apart)(?: the)?(?: model| assembly| hologram)?(?: view)?[.!?]*$/i.test(text)) return { type: "hologram3d_explode", value: true };
    if (/^(?:collapse|reassemble|un-?explode|put (?:it|the model) back together)(?: the)?(?: model)?[.!?]*$/i.test(text)) return { type: "hologram3d_explode", value: false };
    if (/^(?:x-?ray|show (?:me )?(?:an? )?x-?ray|make (?:it|the model) transparent|see through it)(?: view)?[.!?]*$/i.test(text)) return { type: "hologram3d_xray", value: true };
    if (/^(?:solid(?:ify)?|turn off x-?ray|make (?:it|the model) solid again)[.!?]*$/i.test(text)) return { type: "hologram3d_xray", value: false };
    let holoMatch = text.match(/^(?:highlight|glow|flash|point out)(?: the)?\s+(.+?)[.!?]*$/i);
    if (holoMatch) return { type: "hologram3d_highlight", target: holoMatch[1].trim() };
    holoMatch = text.match(/^(?:isolate|show only|focus on)(?: the)?\s+(.+?)[.!?]*$/i);
    if (holoMatch) return { type: "hologram3d_isolate", target: holoMatch[1].trim() };
    holoMatch = text.match(/^(?:hide|remove)(?: the)?\s+(.+?)[.!?]*$/i);
    if (holoMatch && !/hologram|holographic display/i.test(holoMatch[1])) return { type: "hologram3d_layer", target: holoMatch[1].trim(), visible: false };
    holoMatch = text.match(/^show(?: the)?\s+(.+?)(?: again)?[.!?]*$/i);
    if (holoMatch && /^(?:everything|all|all parts|all components)$/i.test(holoMatch[1].trim())) return { type: "hologram3d_showall" };
    if (holoMatch) return { type: "hologram3d_layer", target: holoMatch[1].trim(), visible: true };
    if (/^(?:reset|restore)(?: the)?(?: model| hologram| view)?[.!?]*$/i.test(text)) return { type: "hologram3d_reset" };

    return null;
  }

  function executeHologramCommand(command) {
    if (command.type === "open_globe") {
      createHolographicGlobe();
      return "Holographic Earth is online. You can drag it to rotate, use the mouse wheel to zoom, or use the controls beneath it.";
    }
    if (command.type === "open_universal") {
      createUniversalHologram(command.subject);
      return `I’m opening the hologram workspace and generating ${command.subject}. I’ll tell you when the model is actually ready.`;
    }
    if (command.type === "close_hologram") {
      state.globe?.panel?.querySelector('[data-globe="close"]')?.click();
      state.universalHologram?.close?.();
      return "The active hologram is closed.";
    }

    const model = state.universalHologram;
    if (!model) return "There's no active hologram to work with. Open one first.";
    if (!model.has3D) return "This hologram is the flat-image fallback, not real geometry, so I can't explode, cross-section, or isolate parts of it — only a real generated model supports that.";
    const viewer = model.viewer3D;

    if (command.type === "hologram3d_explode") {
      model.exploded = command.value;
      viewer.explode(command.value ? 0.6 : 0);
      model.panel.querySelector('[data-hologram="explode"]').textContent = command.value ? "COLLAPSE" : "EXPLODE";
      return command.value ? "Exploding the assembly so you can see how the parts relate." : "Reassembling the model.";
    }
    if (command.type === "hologram3d_xray") {
      model.xray = command.value;
      viewer.setTransparent("", command.value ? 0.28 : 1);
      model.panel.querySelector('[data-hologram="xray"]').textContent = command.value ? "SOLID" : "X-RAY";
      return command.value ? "Switching to an X-ray view." : "Back to a solid view.";
    }
    if (command.type === "hologram3d_highlight") {
      const count = viewer.highlight(command.target);
      return count ? `Highlighting ${command.target}.` : `I don't see a component matching "${command.target}" in this model's parts list.`;
    }
    if (command.type === "hologram3d_isolate") {
      const count = viewer.isolate(command.target);
      return count ? `Isolating ${command.target} and hiding the rest.` : `I don't see a component matching "${command.target}" — try "show everything" and I'll list what's visible instead.`;
    }
    if (command.type === "hologram3d_layer") {
      const count = viewer.setLayerVisibility(command.target, command.visible);
      return count ? `${command.visible ? "Showing" : "Hiding"} ${command.target}.` : `I don't see a component matching "${command.target}" in this model.`;
    }
    if (command.type === "hologram3d_showall") {
      viewer.showAll();
      return "Showing every component again.";
    }
    if (command.type === "hologram3d_reset") {
      viewer.reset();
      model.exploded = false;
      model.xray = false;
      model.panel.querySelector('[data-hologram="explode"]').textContent = "EXPLODE";
      model.panel.querySelector('[data-hologram="xray"]').textContent = "X-RAY";
      return "Resetting the hologram to its original view.";
    }
    return "That holographic module is not available yet.";
  }

  function markActiveModule(command) {
    $$(".module-dock [data-command]").forEach((button) => {
      button.classList.toggle("active", button.dataset.command === command);
    });
  }

  function openPermissions() {
    elements.permissionDrawer.classList.add("open");
    elements.permissionDrawer.setAttribute("aria-hidden", "false");
    logActivity("Permission center opened");
  }

  function closePermissions() {
    elements.permissionDrawer.classList.remove("open");
    elements.permissionDrawer.setAttribute("aria-hidden", "true");
  }

  function runWalkthrough() {
    const steps = [
      ["SYSTEM VITALS", ".telemetry-panel"],
      ["SVANS CONVERSATION CORE", "#orbital-system"],
      ["GUARDIAN PERMISSIONS", "#shield-panel"],
      ["MODULE COMMAND DOCK", ".module-dock"],
    ];
    let index = 0;
    const advance = () => {
      document.querySelector(".walkthrough-focus")?.classList.remove("walkthrough-focus");
      if (index >= steps.length) {
        showToast("WALKTHROUGH COMPLETE");
        logActivity("Interface walkthrough completed");
        return;
      }
      const [label, selector] = steps[index++];
      document.querySelector(selector)?.classList.add("walkthrough-focus");
      showToast(`${String(index).padStart(2, "0")} · ${label}`);
      window.setTimeout(advance, 2200);
    };
    logActivity("Interface walkthrough started");
    advance();
  }

  async function runLocalCommand(command, spokenText = "") {
    markActiveModule(command);
    if (command === "system") {
      const snapshot = state.snapshot ?? (await desktop.systemSnapshot());
      createIntelPanel("SYSTEM ANALYSIS", [
        `CPU utilization: ${snapshot.cpu}% across ${snapshot.processors} logical cores`,
        `Memory utilization: ${snapshot.memory}% (${snapshot.memoryUsedGb} of ${snapshot.memoryTotalGb} GB)`,
        `Host: ${snapshot.hostname} · ${snapshot.platform}`,
        `Uptime: ${formatUptime(snapshot.uptimeSeconds)} · Network links: ${snapshot.networkAdapters}`,
      ]);
      return true;
    }
    if (command === "projects") {
      createIntelPanel("PROJECT CONSTELLATION", [
        "VOS · Local operating and execution environment",
        "SVANSAI · Intelligence, memory and orchestration service",
        "Shield · Permission, security and audit layer",
        "Vansant Platform · Operational command center",
        "SVANS Desktop · Conversational holographic interface",
      ]);
      return true;
    }
    if (command === "roblox") {
      openRobloxPanel();
      await refreshRobloxStats();
      showToast("ROBLOX OPERATIONS OPEN");
      return true;
    }
    if (command === "shield") {
      createIntelPanel("GUARDIAN POSTURE", [
        "Threat state: no active local alerts",
        "External actions: ASK before execution",
        "Workspace access: not connected",
        "Camera gestures: disabled",
        "Audit trail: active",
      ], "green");
      return true;
    }
    if (command === "debugger") {
      createIntelPanel("DIAGNOSTIC CHANNEL", [
        "Desktop shell: responsive",
        "SVANSAI link: available on demand",
        "Local telemetry bridge: active",
        "No diagnostic session is currently running",
      ], "amber");
      return true;
    }
    if (command === "permissions") {
      openPermissions();
      return true;
    }
    if (command === "browser") {
      await desktop.openDestination("platform");
      logActivity("Vansant Platform opened in default browser");
      return true;
    }
    if (/\b(walk me through|walkthrough|tour)\b/i.test(spokenText)) {
      runWalkthrough();
      return true;
    }
    return false;
  }

  function parseComputerCommand(rawText) {
    const text = rawText.trim().replace(/^svans[,.]?\s*/i, "").replace(/^please\s+/i, "").replace(/^(?:(?:can|could|would|will) you|i (?:need|want) you to)\s+/i, "");
    const contextualSubject = Date.now() - state.conversationContext.updatedAt < 30 * 60 * 1000 ? state.conversationContext.subject : null;
    const folderPattern = "desktop|documents|downloads|pictures|music|videos|onedrive|workspace";
    const siteAliases = {
      youtube: "https://youtube.com",
      gmail: "https://mail.google.com",
      email: "https://mail.google.com",
      facebook: "https://facebook.com",
      instagram: "https://instagram.com",
      linkedin: "https://linkedin.com",
      github: "https://github.com",
      google: "https://google.com",
    };
    let match;

    match = text.match(/^(?:open|launch|start)(?: the)?\s+(first|second|third|fourth)(?: one| result| app| application| file| project)?[.!?]*$/i);
    if (match) {
      const index = { first: 0, second: 1, third: 2, fourth: 3 }[match[1].toLowerCase()];
      const entity = state.conversationContext.entities?.[index];
      if (entity?.path) return { type: "open_path", payload: { path: entity.path } };
      if (entity?.url) return { type: "open_url", payload: { url: entity.url } };
      if (entity?.name || typeof entity === "string") return { type: "launch_app", payload: { name: entity.name || entity } };
    }

    if (/^(?:emergency stop|stop all actions|cancel all actions)$/i.test(text)) {
      return { type: "emergency_stop", payload: {} };
    }
    if (/^(?:show|list)(?: me)? (?:the )?(?:running apps|running applications|processes)$/i.test(text)) {
      return { type: "list_processes", payload: {} };
    }
    if (/^(?:show|list)(?: me)? (?:the )?(?:installed apps|installed applications|games)$/i.test(text)) {
      return { type: "list_apps", payload: {} };
    }
    if (
      /\b(?:which|what|list|show|see)\b.{0,45}\b(?:sites?|tabs?|pages?)\b.{0,35}\b(?:open|opened|viewing|on)\b/i.test(text) ||
      /\b(?:can you|do you|are you able to|acknowledge)\b.{0,60}\b(?:edge|browser)\b.{0,60}\b(?:open|site|tab|page)\b/i.test(text) ||
      /\b(?:what site|which site|current site|active tab|browser context)\b/i.test(text)
    ) {
      return { type: "browser_context", payload: {} };
    }
    match = text.match(new RegExp(`^(?:show|list)(?: me)? (?:what(?:'s| is) in )?(?:my )?(${folderPattern})(?: folder)?$`, "i"));
    if (match) return { type: "list_directory", payload: { folder: match[1].toLowerCase() } };
    match = text.match(new RegExp(`^(?:open|show)(?: me)? (?:my )?(${folderPattern})(?: folder)?$`, "i"));
    if (match) return { type: "open_folder", payload: { folder: match[1].toLowerCase() } };
    match = text.match(/^(?:find|search for|look for)(?: a)? (?:file|folder)(?: named| called)?\s+(.+)$/i);
    if (match) return { type: "search_files", payload: { query: match[1].trim() } };
    match = text.match(/^open (?:the )?(\d+)(?:st|nd|rd|th)? (?:file|result)$/i);
    if (match) {
      const result = state.lastFileResults[Number(match[1]) - 1];
      return result ? { type: "open_path", payload: { path: result.path } } : null;
    }
    if (/^open (?:the )?first (?:file|result)$/i.test(text) && state.lastFileResults[0]) {
      return { type: "open_path", payload: { path: state.lastFileResults[0].path } };
    }
    match = text.match(/^(?:close|quit|stop) (?:the )?(.+)$/i);
    if (match && !/all actions/i.test(match[1])) {
      const requestedTarget = match[1].trim();
      const target = /^(?:it|that|this|the app|the application)$/i.test(requestedTarget) && contextualSubject ? contextualSubject : requestedTarget;
      return {
        type: "close_app",
        payload: { name: target },
        confirmation: {
          title: "Close this application?",
          description: "Unsaved work in this application could be lost.",
          target,
          level: "PROCESS CONTROL · CONFIRM",
        },
      };
    }
    if (/^lock (?:my |the )?(?:computer|pc|workstation)$/i.test(text)) {
      return {
        type: "lock_computer",
        payload: {},
        confirmation: {
          title: "Lock the owner session?",
          description: "The Windows sign-in screen will appear immediately.",
          target: "Current Windows session",
          level: "SESSION CONTROL · CONFIRM",
        },
      };
    }
    if (/^(?:flush|clear) (?:the )?dns(?: cache)?$/i.test(text)) {
      return {
        type: "flush_dns",
        payload: {},
        confirmation: {
          title: "Run an administrator action?",
          description: "Windows will request UAC approval before clearing the DNS resolver cache.",
          target: "Allowlisted operation · ipconfig /flushdns",
          level: "ADMINISTRATOR GUARDIAN · UAC",
        },
      };
    }
    match = text.match(/^(?:open(?: up)?|bring up|go to|browse to)\s+(.+)$/i);
    if (match) {
      const requestedTarget = match[1].trim().replace(/[.?!]+$/, "");
      const target = /^(?:it|that|this|the app|the application|the same one)$/i.test(requestedTarget) && contextualSubject ? contextualSubject : requestedTarget;
      const alias = siteAliases[target.toLowerCase()];
      if (alias) return { type: "open_url", payload: { url: alias } };
      if (/^https?:\/\//i.test(target) || /^[a-z0-9.-]+\.[a-z]{2,}(?:\/\S*)?$/i.test(target)) {
        return { type: "open_url", payload: { url: target } };
      }
      return { type: "launch_app", payload: { name: target } };
    }
    match = text.match(/^(?:launch|start|run)\s+(.+)$/i);
    if (match) return { type: "launch_app", payload: { name: match[1].trim() } };

    match = text.match(/^(?:search (?:the )?web for|web search|google|look up)\s+(.+)$/i);
    if (match) return { type: "web_search", payload: { query: match[1].trim() } };

    match = text.match(/^(?:read|summarize|what does it say on)\s+(?:the page at |this page:?\s*)?(https?:\/\/\S+)$/i);
    if (match) return { type: "fetch_page", payload: { url: match[1].trim() } };
    match = text.match(/^(?:fetch|read|open and summarize)\s+(?:the page\s+)?([a-z0-9.-]+\.[a-z]{2,}(?:\/\S*)?)$/i);
    if (match && !siteAliases[match[1].toLowerCase()]) return { type: "fetch_page", payload: { url: match[1].trim() } };

    match = text.match(/^(?:read|open and read|summarize)(?: the)?(?: file)?\s+(.+)$/i);
    if (match && state.lastFileResults.length) {
      const needle = match[1].trim().toLowerCase();
      const found = state.lastFileResults.find((entry) => entry.name?.toLowerCase().includes(needle));
      if (found) return { type: "read_file", payload: { path: found.path } };
    }

    match = text.match(/^(?:check|show)(?: my)? reddit (?:inbox|messages)$/i);
    if (match) return { type: "social:reddit.checkInbox", payload: {} };

    match = text.match(/^(?:post|tweet)(?: on x| on twitter)?\s*[:\-]?\s*(.+)$/i);
    if (match) {
      return {
        type: "social:x.postUpdate",
        payload: { text: match[1].trim() },
        confirmation: {
          title: "Post this publicly on X?",
          description: "This will publish immediately to your connected account.",
          target: match[1].trim().slice(0, 80),
          level: "SOCIAL POST · CONFIRM",
        },
      };
    }

    match = text.match(/^post (?:on |to )?facebook\s*[:\-]?\s*(.+)$/i);
    if (match) {
      return {
        type: "social:facebook.postToPage",
        payload: { text: match[1].trim() },
        confirmation: {
          title: "Post this to your Facebook Page?",
          description: "This will publish immediately to the connected Page.",
          target: match[1].trim().slice(0, 80),
          level: "SOCIAL POST · CONFIRM",
        },
      };
    }

    match = text.match(/^post (?:on |to )?threads\s*[:\-]?\s*(.+)$/i);
    if (match) {
      return {
        type: "social:threads.postText",
        payload: { text: match[1].trim() },
        confirmation: {
          title: "Post this to Threads?",
          description: "This will publish immediately to your connected account.",
          target: match[1].trim().slice(0, 80),
          level: "SOCIAL POST · CONFIRM",
        },
      };
    }

    match = text.match(/^(?:post|share) (?:image|photo)(?: on| to)? instagram\s+(\S+)\s*[:\-]?\s*(.*)$/i);
    if (match) {
      return {
        type: "social:instagram.postImage",
        payload: { imageUrl: match[1].trim(), caption: match[2].trim() },
        confirmation: {
          title: "Post this image to Instagram?",
          description: "This will publish immediately to your connected account.",
          target: match[2].trim().slice(0, 80) || match[1].trim(),
          level: "SOCIAL POST · CONFIRM",
        },
      };
    }

    match = text.match(/^(?:post|share) (?:video )?(?:on |to )?tiktok\s+(\S+)\s*[:\-]?\s*(.*)$/i);
    if (match) {
      return {
        type: "social:tiktok.postVideoFromUrl",
        payload: { videoUrl: match[1].trim(), title: match[2].trim() },
        confirmation: {
          title: "Submit this video to TikTok?",
          description: "Posts from unaudited apps publish as private-only until TikTok reviews the client.",
          target: match[2].trim().slice(0, 80) || match[1].trim(),
          level: "SOCIAL POST · CONFIRM",
        },
      };
    }

    match = text.match(/^(?:show|check)(?: my)? youtube (?:stats|channel)$/i);
    if (match) return { type: "social:youtube.channelStats", payload: {} };
    match = text.match(/^(?:show|check)(?: my)? youtube comments(?: on video\s+(\S+))?$/i);
    if (match) return { type: "social:youtube.recentComments", payload: { videoId: match[1] || "" } };

    match = text.match(/^(?:send|message)\s+(?:to\s+)?discord(?:\s+channel\s+(\S+))?\s*[:\-]?\s*(.+)$/i);
    if (match) {
      return {
        type: "social:discord.sendMessage",
        payload: { channelId: match[1] || "", text: match[2].trim() },
        confirmation: {
          title: "Send this message on Discord?",
          description: "This will post immediately to the connected channel.",
          target: match[2].trim().slice(0, 80),
          level: "SOCIAL POST · CONFIRM",
        },
      };
    }

    match = text.match(/^add(?: a)? lead\s+(.+?)(?:\s+from\s+(.+?))?(?:\s+(?:worth|valued at)\s+\$?(\d+(?:\.\d+)?))?$/i);
    if (match) return { type: "business:addLead", payload: { name: match[1].trim(), source: match[2]?.trim() || "", value: match[3] ? Number(match[3]) : 0 } };

    match = text.match(/^(?:mark|move|update)\s+(.+?)\s+(?:to|as)\s+(new|contacted|qualified|won|lost)$/i);
    if (match) return { type: "business:updateLeadStatus", payload: { name: match[1].trim(), status: match[2].toLowerCase() } };

    match = text.match(/^(?:show|list|check)(?: my)? leads$/i);
    if (match) return { type: "business:listLeads", payload: {} };

    match = text.match(/^log\s+(?:revenue|income)\s+(?:of\s+)?\$?(\d+(?:\.\d+)?)\s*(?:from\s+(.+?))?(?:\s+for\s+(.+))?$/i);
    if (match) return { type: "business:logRevenue", payload: { amount: Number(match[1]), source: match[2]?.trim() || "", category: match[3]?.trim() || "" } };

    match = text.match(/^(?:show|check)(?: my)? revenue(?: (?:for|over) the last (\d+) days)?$/i);
    if (match) return { type: "business:revenueSummary", payload: { days: match[1] ? Number(match[1]) : 30 } };

    match = text.match(/^set(?: a)? kpi\s+(.+?)\s+target\s+(\d+(?:\.\d+)?)(?:\s+current\s+(\d+(?:\.\d+)?))?$/i);
    if (match) return { type: "business:setKpi", payload: { name: match[1].trim(), target: Number(match[2]), current: match[3] ? Number(match[3]) : undefined } };

    match = text.match(/^(?:show|check)(?: my)? kpis?$/i);
    if (match) return { type: "business:listKpis", payload: {} };

    match = text.match(/^(?:draft|write|generate)(?: a)? proposal for\s+(.+?)(?:\s*[:\-]\s*(.+))?$/i);
    if (match) return { type: "business:generateProposal", payload: { clientName: match[1].trim(), brief: match[2]?.trim() || match[1].trim() } };

    match = text.match(/^(?:show|list) proposals$/i);
    if (match) return { type: "business:listProposals", payload: {} };

    match = text.match(/^(?:show|give me)(?: my|the)? business (?:summary|overview|status)$/i);
    if (match) return { type: "business:summary", payload: {} };

    return null;
  }

  async function executeComputerCommand(action) {
    if (action.confirmation) {
      const approved = await confirmComputerAction(action.confirmation);
      if (!approved) {
        return { message: "Action cancelled. I did not make any changes.", title: "ACTION CANCELLED", lines: [action.confirmation.target] };
      }
    }
    const result = await desktop.executeComputerAction({ type: action.type, payload: action.payload });
    if (Array.isArray(result?.results)) state.lastFileResults = result.results;
    if (result) {
      const entities = Array.isArray(result.results) ? result.results : Array.isArray(result.lines) ? result.lines.map((name) => ({ name })) : state.conversationContext.entities;
      rememberConversationContext(state.conversationContext.domain, action.type, {
        subject: action.payload?.name || action.payload?.path || action.payload?.url || action.payload?.folder || state.conversationContext.subject,
        entities,
      });
    }
    if (result?.title && Array.isArray(result?.lines)) createIntelPanel(result.title, result.lines.slice(0, 35), action.type === "emergency_stop" ? "amber" : "cyan");
    if (action.type.startsWith("business:")) void refreshBusinessSummary();

    // read_file / fetch_page hand back raw extracted text. Don't dump it into
    // the transcript — route it through SVANS so it comes back as an actual
    // spoken-style summary, same voice as the rest of the conversation.
    if ((action.type === "read_file" || action.type === "fetch_page") && typeof result?.content === "string" && result.content.trim()) {
      try {
        const summaryPrompt = `Summarize the following for me in your own words, a few sentences unless I asked for more detail:\n\n${result.content.slice(0, 12000)}`;
        const summary = await desktop.chat(
          [...state.messages, { role: "user", content: summaryPrompt }],
          sessionId,
          communicationStyleSummary(),
          state.codingCoachMode,
          conversationContextSummary(),
        );
        return { ...result, message: summary.text };
      } catch {
        // If the summarization call fails, fall back to the raw result message.
        return result;
      }
    }
    return result;
  }

  function inferCommand(text) {
    if (/\b(cpu|memory|ram|system|computer|status|telemetry)\b/i.test(text)) return "system";
    if (/\b(project|ecosystem|relationship|architecture)\b/i.test(text)) return "projects";
    if (/\b(shield|security|threat|permission|guardian)\b/i.test(text)) return "shield";
    if (/\b(debug|diagnos|error|issue|problem)\b/i.test(text)) return "debugger";
    if (/\b(browser|platform|website)\b/i.test(text)) return "browser";
    return "conversation";
  }

  function isLocalSystemHealthRequest(text) {
    return /\b(?:how (?:are|is) (?:my |the )?(?:systems?|computer|pc)(?: doing| looking| running)?|systems? health|systems? status|status report|health report|computer health|pc health|local systems?|system telemetry)\b/i.test(text);
  }

  async function localSystemHealthReport() {
    await refreshTelemetry();
    const snapshot = state.snapshot ?? (await desktop.systemSnapshot());
    const cpuCondition = snapshot.cpu < 70 ? "normal" : snapshot.cpu < 85 ? "elevated" : "high";
    const memoryCondition = snapshot.memory < 75 ? "normal" : snapshot.memory < 90 ? "elevated" : "high";
    const stable = snapshot.cpu < 85 && snapshot.memory < 90;
    await runLocalCommand("system");
    return [
      `Your local systems are looking ${stable ? "stable" : "busy"}.`,
      `CPU usage is ${snapshot.cpu} percent, which is ${cpuCondition}, and memory usage is ${snapshot.memory} percent, which is ${memoryCondition}.`,
      `${snapshot.hostname} has ${snapshot.processors} logical cores, ${snapshot.networkAdapters} active network links, and an uptime of ${formatUptime(snapshot.uptimeSeconds)}; the SVANS desktop and telemetry link are operational.`,
    ].join(" ");
  }

  function parseRobloxCommand(rawText) {
    const originalText = rawText.trim();
    if (originalText.length >= 350 && /\b(?:roblox|elemental realms?|game overview|progression|ascension|gameplay|open-world)\b/i.test(originalText)) {
      state.lastRobloxBuildBrief = originalText.slice(0, 5000);
      localStorage.setItem("svans.lastRobloxBuildBrief", state.lastRobloxBuildBrief);
    }
    const text = originalText
      .replace(/^svans[,.]?\s*/i, "")
      .replace(/^please\s+/i, "")
      .replace(/^(?:go ahead and\s+)?(?:(?:can|could|would|will)\s+you|(?:i\s+)?(?:need|want|wan)\s+(?:for\s+)?you\s+to)\s+/i, "")
      .replace(/\bcaslte\b/gi, "castle");
    const recentConversation = state.messages.slice(-30).map((message) => message.content).join(" ");
    const recentRobloxContext = /\b(?:roblox studio|roblox (?:game|project|experience)|elemental realms?|ascension islands?|water castle|fire castle|earth castle|wind castle)\b/i.test(`${originalText} ${recentConversation}`);
    const robloxContextActive = (state.conversationContext.domain === "roblox" && Date.now() - state.conversationContext.updatedAt < 30 * 60 * 1000) || recentRobloxContext;
    const recoveredProject = window.svansRobloxIntent?.inferProject(`${originalText} ${recentConversation}`, state.conversationContext.subject || "") || "";
    const compiledRobloxIntent = window.svansRobloxIntent?.compileRobloxIntent(text, {
      robloxActive: robloxContextActive,

      currentProject:
        state.conversationContext.robloxProject ||
        recoveredProject ||
        state.conversationContext.subject ||
        null,

      currentSubject:
        state.conversationContext.robloxSubject ||
        null,

      previousSubject:
        state.conversationContext.previousRobloxSubject ||
        null,

      currentCastleRequested:
        Boolean(state.conversationContext.robloxCastleRequested),

      currentSettlementRequested:
        Boolean(state.conversationContext.robloxSettlementRequested),

      currentStyles:
        Array.isArray(state.conversationContext.robloxStyle)
          ? state.conversationContext.robloxStyle
          : [],

      knownProjects:
        Array.isArray(state.robloxProjects)
        ? state.robloxProjects
        : [],
  }) || null;
    const expandBuildReference = (description) => {
      const clean = String(description || "").trim();
      const referencesEarlierBrief = /\b(?:that|this|the)\s+(?:game|overview|plan|concept|description)\b|\bbased on (?:that|this|the|my)\b|^(?:it|that|this|now)$/i.test(clean);
      if (!referencesEarlierBrief || !state.lastRobloxBuildBrief || clean.includes(state.lastRobloxBuildBrief.slice(0, 120))) return clean;
      return `${clean}\n\nUse this complete owner-provided build overview:\n${state.lastRobloxBuildBrief}`.slice(0, 5000);
    };
    // ============================================================
// PHASE 2 — STRUCTURED ROBLOX INTENT ROUTING
// ============================================================

if (
  compiledRobloxIntent?.action === "create" &&
  compiledRobloxIntent.scope === "new-project"
) {
  const projectDescription =
    text.match(
      /\b(?:roblox\s+)?(?:game|experience|project)\b(?:\s+(?:where|about|based on|with|that|using)\s+|\s*[:\-]\s*)?([\s\S]*)$/i
    )?.[1]?.trim() || text;

  return {
    type: "build",
    description: expandBuildReference(projectDescription),
    newProject: true,
    intent: compiledRobloxIntent,
  };
}

if (
  state.robloxReferenceBlueprint &&
  compiledRobloxIntent?.referenceRequested &&
  ["create", "modify"].includes(compiledRobloxIntent.action)
) {
  const subject =
    compiledRobloxIntent.targetProject ||
    recoveredProject ||
    state.conversationContext.robloxProject ||
    state.conversationContext.subject ||
    "current Roblox project";

  return {
    type: "live_build",
    target: subject,
    useReferences: true,
    description: `${text} in ${subject}`,
    intent: compiledRobloxIntent,
  };
}

if (
  compiledRobloxIntent?.related &&
  ["create", "modify"].includes(compiledRobloxIntent.action) &&
  compiledRobloxIntent.scope !== "new-project"
) {
  const subject =
    compiledRobloxIntent.targetProject ||
    recoveredProject ||
    state.conversationContext.robloxProject ||
    state.conversationContext.subject ||
    "current Roblox project";

  return {
    type: "live_build",
    target: subject,
    description: `${expandBuildReference(text)} in ${subject}`,
    followUp: compiledRobloxIntent.followUp,
    intent: compiledRobloxIntent,
  };
}
    const compoundStudioBuild = text.match(/^(?:open(?: up)?|bring up|launch|start|run)(?: the)?\s+roblox studio\s*,?\s*(?:and then|and|then)\s+(?:create|build|make|construct|add|design)\s+([\s\S]+)$/i);
    if (compoundStudioBuild?.[1] && !/^\s*(?:a\s+)?new\s+roblox\s+(?:game|experience)\b/i.test(compoundStudioBuild[1])) {
      const subject = recoveredProject || state.conversationContext.subject || "current Roblox project";
      return { type: "live_build", target: subject, description: `${expandBuildReference(compoundStudioBuild[1].trim())} in ${subject}`, openStudio: true, intent: compiledRobloxIntent };
    }
    const directRobloxObjectBuild = text.match(/^(?:create|build|make|construct|add|design)(?: me)?\s+([\s\S]+?)\s+(?:in|inside|for)\s+roblox(?: studio)?[.!?]*$/i);
    if (directRobloxObjectBuild?.[1]) {
      const subject = recoveredProject || state.conversationContext.subject || "current Roblox project";
      return { type: "live_build", target: subject, description: `${expandBuildReference(directRobloxObjectBuild[1].trim())} in ${subject}`, intent: compiledRobloxIntent };
    }
    const pendingRobloxAction = state.pendingRobloxAction;
    if (pendingRobloxAction && robloxContextActive) {
      if (/^(?:never mind|cancel|stop|forget it|discard (?:that|the update))[.!?]*$/i.test(text)) {
        state.pendingRobloxAction = null;
        return null;
      }
      if (/\b(?:i (?:know|said).{0,45}(?:want|need) you to (?:change|update|do)|resume|continue|try again|do it|do that|make the changes?|start the changes?|go ahead(?: and (?:do|change|update) it)?)\b/i.test(text)) {
        return { ...pendingRobloxAction, type: "live_build", resumed: true };
      }
      if (/^(?:use\s+)?this overview\b/i.test(text) && text.length > 80) {
        const target = recoveredProject || pendingRobloxAction.target || state.conversationContext.subject || "current Roblox project";
        return { type: "live_build", target, description: `${text} in ${target}`, resumed: true, intent: compiledRobloxIntent };
      }
    }
    if (robloxContextActive && state.conversationContext.intent === "awaiting_build_description") {
      if (/^(?:never mind|cancel|stop|forget it)[.!?]*$/i.test(text)) {
        state.conversationContext.intent = "cancelled";
        return null;
      }
      if (text.length >= 3) return { type: "build", description: text };
    }
    if (robloxContextActive && /\b(?:take control|handle it|fix it|fix the (?:game|project)|apply (?:the|those) fixes|make (?:the|those) fixes|start (?:the )?(?:edits|updates|changes)|begin (?:the )?(?:edits|updates|changes)|get started(?: on (?:the )?(?:edits|updates|changes))?|go ahead and (?:start|begin)(?: the)? (?:edits|updates|changes))\b/i.test(text)) {
      return { type: "control_fix", query: `${state.conversationContext.subject || recoveredProject || "current Roblox project"} ${text}` };
    }
    if (robloxContextActive) {
      const liveBuild = text.match(/^(?:and\s+then\s+|then\s+|and\s+)?(?:add|create|build|make|implement|write|design|place|construct|update|modify|change|edit|improve|expand)(?:\s+and\s+(?:add|create|build|make|implement|write|design|place|construct|update|modify|change|edit|improve|expand))?(?:\s+(?:it|that|this))?\s+([\s\S]+)$/i);
      if (liveBuild?.[1]?.trim()) {
        const subject = recoveredProject || state.conversationContext.subject || "current Roblox project";
        const description = expandBuildReference(liveBuild[1].trim());
        if (/^(?:now|it|that|this)$/i.test(description) && !state.lastRobloxBuildBrief) return { type: "build_prompt", openStudio: false };
        return { type: "live_build", target: subject, description: `${description} in ${subject}`, intent: compiledRobloxIntent };
      }
    }
    if (/\bpublish\b.{0,50}\broblox\b|\broblox\b.{0,50}\bpublish\b/i.test(text)) return { type: "publish_blocked" };
    if (/\b(?:assess|assessment|review|analy[sz]e|take a look|look over|inspect|evaluate)\b/i.test(text) && /\b(?:roblox|studio|game|experience|project|elemental)\b/i.test(text)) return { type: "assess_project", query: text };
    if (/\b(?:show|check|refresh|monitor|view|what are|how are)\b.{0,60}\b(?:roblox|game)\b.{0,35}\b(?:stats|statistics|players|visits|robux|revenue|activity|doing)\b/i.test(text) || /^(?:roblox stats|game stats)$/i.test(text)) return { type: "stats" };
    if (
      /\b(?:see|read|identify|tell|know|what(?:'s| is))\b.{0,65}\b(?:title|name)\b.{0,65}\b(?:roblox|game|project|experience)\b/i.test(text) ||
      /\b(?:roblox|game|project|experience)\b.{0,65}\b(?:title|name)\b/i.test(text) ||
      /\brecent\b.{0,45}\b(?:roblox\s+)?(?:experiences?|games?|projects?)\b/i.test(text) ||
      /\b(?:experiences?|games?|projects?)\b.{0,45}\brecent\b/i.test(text) ||
      /^(?:what|which|show|list|tell me)(?: are| me)?(?: the| my| your)?\s*(?:recent\s+)?(?:roblox\s+)?(?:experiences?|games?|projects?)(?: do you see| are there| have I worked on)?[.!?]*$/i.test(text)
    ) return { type: "studio_context", query: text };
    const openAndBuild = text.match(/^(?:open(?: up)?|bring up|launch|start|run)(?: the)?\s+roblox studio\s*(?:,?\s*(?:and|then|and then)\s+)(?:build|create|make|develop)(?: me)?(?: a| an| the)?\s*(?:new\s+)?(?:roblox\s+)?(?:game|experience)(?:\s+(?:where|about|based on|with|that|using)\s+|\s*[:\-]\s*)?([\s\S]*)$/i);
    if (openAndBuild) return openAndBuild[1].trim() ? { type: "build", description: openAndBuild[1].trim() } : { type: "build_prompt", openStudio: true };
    if (/^(?:(?:open(?: up)?|bring up|launch|start|run)(?: the)?\s+)?roblox studio[.!?]*$/i.test(text)) return { type: "open_studio" };
    if (/^(?:open|launch)(?: the)?(?: latest| last)? roblox (?:game|project|studio project)$/i.test(text)) return { type: "launch_latest" };
    const updateMatch = text.match(/^(?:update|modify|change|edit|improve|expand|add to)(?: my| the)?(?: latest| current| existing)?\s*roblox (?:game|experience|project)(?:\s+(?:by|to|with|so|and|based on)\s+|\s*[:\-]\s*)([\s\S]+)$/i);
    if (updateMatch) {
      if (robloxContextActive) {
        const subject = recoveredProject || state.conversationContext.subject || "current Roblox project";
        return { type: "live_build", target: subject, description: `${expandBuildReference(updateMatch[1].trim())} in ${subject}`, intent: compiledRobloxIntent };
      }
      return { type: "update", description: updateMatch[1].trim() };
    }
    const buildMatch = text.match(/^(?:build|create|make|develop)(?: me)?(?: a| an| the)?\s+(?:new\s+)?roblox (?:game|experience)(?:\s+(?:where|about|based on|with|that|using)\s+|\s*[:\-]\s*)?([\s\S]*)$/i);
    if (buildMatch) return buildMatch[1].trim() ? { type: "build", description: buildMatch[1].trim() } : { type: "build_prompt" };
    if (robloxContextActive) {
      const contextualBuild = text.match(/^(?:and\s+then\s+|then\s+|and\s+)?(?:build|create|make|develop)(?: me)?(?: a| an| the)?\s*(?:new\s+)?(?:game|experience)(?:\s+(?:where|about|based on|with|that|using)\s+|\s*[:\-]\s*)?([\s\S]*)$/i);
      if (contextualBuild) return contextualBuild[1].trim() ? { type: "build", description: contextualBuild[1].trim() } : { type: "build_prompt" };
      const contextualUpdate = text.match(/^(?:and\s+then\s+|then\s+|and\s+)?(?:add|put|include|change|update|modify|edit|improve|expand|make|build|create)(?:\s+(?:it|that|the game|the project))?\s*(?:by|to|with|so|and|:|-)?\s+([\s\S]+)$/i);
      if (contextualUpdate) return { type: "update", description: contextualUpdate[1].trim() };
      if (/^(?:open|launch|start)(?: it| that| the game| the project)[.!?]*$/i.test(text)) return { type: "launch_latest" };
    }
    return null;
  }

  function rememberConversationContext(domain, intent, details = {}) {
    const switchedDomain = domain && domain !== state.conversationContext.domain;
    state.conversationContext = {
      ...state.conversationContext,
      ...(switchedDomain ? { entities: [], unresolved: null, subject: null } : {}),
      ...details,
      domain: domain || state.conversationContext.domain || "general",
      intent: intent || state.conversationContext.intent || "discussion",
      updatedAt: Date.now(),
    };
    persistConversationMemory();
  }

  function isContextualFollowUp(text) {
    const compact = String(text || "").trim();
    if (compact.split(/\s+/).length > 12) return false;
    return /^(?:yes|yeah|yep|no|nope|exactly|right|okay|ok|sure|why|why not|how|how so|what do you mean|do it|do that|try it|open it|close it|change it|update it|add that|the first one|the second one|that one|this one|what about that|and then|continue|go on)[.!?]*$/i.test(compact) || /\b(?:it|that|this|those|them|one|ones|same thing|as before)\b/i.test(compact);
  }

  function conversationContextSummary() {
    const context = state.conversationContext;
    const entities = (Array.isArray(context.entities) ? context.entities : []).slice(0, 8).map((entry) => typeof entry === "string" ? entry : entry?.name || entry?.title || "").filter(Boolean);
    return [
      `Active domain: ${context.domain || "general"}.`,
      `Current intent: ${context.intent || "discussion"}.`,
      context.topic ? `Topic: ${context.topic}.` : "",
      context.subject ? `Current subject: ${context.subject}.` : "",
      entities.length ? `Referenced items, in order: ${entities.join("; ")}.` : "",
      context.unresolved ? `SVANS last asked: ${context.unresolved}` : "",
      context.lastUserText ? `Shawn's last message: ${context.lastUserText}` : "",
      context.lastAssistantText ? `SVANS's last answer: ${context.lastAssistantText}` : "",
    ].filter(Boolean).join(" ").slice(0, 2200);
  }

  async function executeRobloxCommand(command) {
    if (command.type === "publish_blocked") return "Publishing is owner-only, so I cannot publish or make a Roblox game public. I can finish, test, save, and prepare it for you.";
    if (command.type === "stats") {
      const stats = await refreshRobloxStats();
      if (!stats?.configured) return "Add the game’s Universe ID in Roblox Operations first, and then I can monitor its public activity.";
      const publicStats = stats.public;
      const analytics = stats.analytics;
      if (!publicStats) return stats.publicError || "Roblox statistics are unavailable right now.";
      const revenue = analytics?.connected && !analytics.empty ? ` The SVANS tracker has recorded ${Number(analytics.totalRobuxSpent || 0).toLocaleString()} Robux across ${Number(analytics.totalPurchases || 0).toLocaleString()} purchases.` : " Private purchase tracking is not connected yet.";
      return `${publicStats.name} currently has ${Number(publicStats.playing || 0).toLocaleString()} players online and ${Number(publicStats.visits || 0).toLocaleString()} total visits.${revenue}`;
    }
    if (command.type === "control_fix") {
      const approved = await confirmComputerAction({
        title: "Apply safe fixes inside Roblox Studio?",
        description: "SVANS will enable Workspace streaming and anchor clearly static geometry while excluding characters, tools, vehicles, projectiles, doors, moving objects, and VFX. Studio Undo remains available, and nothing will be published.",
        target: state.conversationContext.subject || "Current Roblox project",
        level: "LIVE STUDIO CHANGE · CONFIRM",
      });
      if (!approved) return "Understood. I did not change the Roblox project.";
      const fixed = await desktop.fixRobloxProject(command.query);
      if (!fixed.available) return `I opened ${fixed.project?.name || "the Roblox project"}, but ${fixed.reason}`;
      rememberConversationContext("roblox", "live_fix", {
        topic: "Roblox Studio live project fixes",
        subject: fixed.project?.name || state.conversationContext.subject,
        entities: fixed.project ? [fixed.project] : state.conversationContext.entities,
      });
      return `I took control of ${fixed.project.name} inside Studio. I enabled streaming and anchored ${Number(fixed.result?.anchored || 0).toLocaleString()} clearly static parts while leaving protected dynamic objects alone. The changes are not published, and you can undo the complete operation in Studio if anything needs to be reversed.`;
    }
    if (command.type === "live_build") {
      const buildDescription = command.useReferences && state.robloxReferenceBlueprint
        ? `${command.description}\n\n[SVANS MULTI-VIEW REFERENCE BLUEPRINT]\n${state.robloxReferenceBlueprint}`
        : command.description;
      state.pendingRobloxAction = {
  type: "live_build",

  target:
    command.target ||
    state.conversationContext.robloxProject ||
    state.conversationContext.subject ||
    "Current Roblox project",

  description: buildDescription,

  // Preserve Phase 2 interpretation if Shawn pauses/resumes
  // the operation through the authorization gate.
  intent: command.intent || null,
};
      persistConversationMemory();
      const confirmationSummary = String(command.description || "Create the requested Roblox content")
        .replace(/\s+/g, " ")
        .replace(/\s+in\s+[^.]{1,100}$/i, "")
        .trim();
      const approved = await confirmComputerAction({
        title: "Build this visibly inside Roblox Studio?",
        description: `${/\b(?:castle|citadel|fortress|palace)\b[^.]{0,100}\b(?:town|village|kingdom)\b/i.test(command.description) ? "SVANS will create the castle and its surrounding settlement together at the current Studio camera location." : /\b(?:town|village)\b/i.test(command.description) ? "SVANS will place this expansion around the most recent SVANS structure in the open place." : "Point the Studio camera at the ground where this should be built."} SVANS will shape terrain and construct the requested detailed models for: “${confirmationSummary.slice(0, 270)}${confirmationSummary.length > 270 ? "…" : ""}” Nothing will be saved or published automatically, and Studio Undo remains available.`,
        target: command.target || state.conversationContext.subject || "Current Roblox project",
        level: "LIVE STUDIO BUILD · CONFIRM",
      });
      if (!approved) {
        rememberConversationContext("roblox", "awaiting_live_build_confirmation", {
          topic: "Pending Roblox Studio update",
          subject: command.target || state.conversationContext.subject || "Current Roblox project",
          unresolved: "Authorize the pending live Studio update?",
        });
        return `I paused the requested ${command.target || "Roblox Studio"} update. Nothing changed. Say “resume the update” when you are ready, then press AUTHORIZE ACTION in the confirmation window.`;
      }
      const built = await desktop.buildInsideRobloxProject({
  description: buildDescription,
  intent: command.intent || null,
});
      if (!built.available) return `I opened ${built.project?.name || "the Roblox project"}, but ${built.reason}`;
      state.pendingRobloxAction = null;
      persistConversationMemory();
      const previousRobloxSubject =
  state.conversationContext.robloxSubject || null;

const nextRobloxSubject =
  command.intent?.currentSubject &&
  command.intent.currentSubject !== "unspecified"
    ? command.intent.currentSubject
    : command.intent?.primarySubject &&
        command.intent.primarySubject !== "unspecified"
      ? command.intent.primarySubject
      : previousRobloxSubject;

rememberConversationContext("roblox", "live_build", {
  topic: "Visible Roblox Studio building",

  // Keep the existing general subject for compatibility.
  subject:
    built.project?.name ||
    state.conversationContext.subject,

  // Phase 2 separates project from object/subject.
  robloxProject:
    built.project?.name ||
    command.intent?.targetProject ||
    state.conversationContext.robloxProject ||
    state.conversationContext.subject ||
    null,

  previousRobloxSubject:
    nextRobloxSubject &&
    previousRobloxSubject &&
    nextRobloxSubject !== previousRobloxSubject
      ? previousRobloxSubject
      : state.conversationContext.previousRobloxSubject || null,

  robloxSubject:
    nextRobloxSubject,

  robloxAction:
    command.intent?.action || "modify",

  robloxCastleRequested:
    Boolean(command.intent?.castleRequested),

  robloxSettlementRequested:
    Boolean(command.intent?.settlementRequested),

  robloxStyle:
    Array.isArray(command.intent?.styles)
      ? command.intent.styles
      : [],

  robloxBehaviors:
    Array.isArray(command.intent?.behaviors)
      ? command.intent.behaviors
      : [],

  robloxRestrictions:
    Array.isArray(command.intent?.restrictions)
      ? command.intent.restrictions
      : [],

  entities:
    built.project
      ? [built.project]
      : state.conversationContext.entities,
});
      const reused = Number(built.result?.createdObjects || 0);
      const skipped = Number(built.result?.skippedObjects || 0);
      const reuseReport = reused || skipped ? ` It placed ${reused.toLocaleString()} approved reusable objects${skipped ? ` and skipped ${skipped.toLocaleString()} unmatched library requests` : ""}.` : "";
      const architectureReport = built.architecturalPipeline
        ? ` The architecture pipeline passed ${Number(built.architectureReport?.checks?.length || 0)} checks with ${Number(built.refinementPasses || 0)} refinement pass${Number(built.refinementPasses || 0) === 1 ? "" : "es"}, and loaded ${Number(built.result?.validatedCameraViews || 0)} ground-level review views.`
        : "";
      const scriptCount = Number(built.result?.createdScripts || 0);
      const scriptReport = scriptCount ? ` It also verified ${scriptCount.toLocaleString()} complete scripts containing ${Number(built.result?.verifiedScriptCharacters || 0).toLocaleString()} characters across ${Number(built.result?.verifiedScriptLines || 0).toLocaleString()} actual lines of code.` : "";
      const placementReport = built.additiveExpansion ? " The expansion was anchored around the most recent SVANS build instead of replacing or repeating the castle." : "";
      const compoundReport = built.compoundBuild ? " The castle and surrounding town were created as one coordinated kingdom; neither portion was omitted." : "";
      const referenceReport = built.referenceDriven ? " The geometry was planned from your uploaded front, back, left, right, top, and optional interior reference blueprint." : "";
      const directorReport = built.gameDirector ? ` Game Director completed this playable vertical-slice manifest: ${(built.directorPhases || []).join(", ")}.` : "";
      return `Done inside ${built.project.name}: Studio shaped ${Number(built.result?.createdTerrain || 0).toLocaleString()} terrain features, created ${Number(built.result?.createdParts || 0).toLocaleString()} structural parts and ${Number(built.result?.createdCharacters || 0).toLocaleString()} R15 characters.${scriptReport}${placementReport}${compoundReport}${referenceReport}${directorReport}${reuseReport}${architectureReport} I did not save or publish it; review it, then save when you are satisfied. The full operation is available in Studio Undo.`;
    }
    if (command.type === "assess_project") {
      const inspection = await desktop.inspectRobloxProject(command.query);
      rememberConversationContext("roblox", "assessment", {
        topic: "Roblox project assessment",
        subject: inspection.project?.name || "Roblox project",
        entities: inspection.project ? [inspection.project] : state.conversationContext.entities,
      });
      if (!inspection.available) return `I opened ${inspection.project?.name || "the matching Roblox project"}, but ${inspection.reason}`;
      const snapshot = inspection.snapshot;
      const assessmentPrompt = [
        `Assess Shawn's Roblox project ${inspection.project.name} using only this live Studio inspection snapshot.`,
        "Start immediately with the assessment. Do not apologize, mention an earlier answer, narrate a correction, or add a generic introduction. Use these exact short sections: **Overall**, **Strongest Areas**, **Important Risks**, and **Next Three Improvements**. Keep paragraphs short, use numbered items where useful, remain under 450 words, and be specific, practical, and honest about what these structural facts cannot reveal about moment-to-moment gameplay.",
        JSON.stringify(snapshot),
      ].join("\n\n").slice(0, 24000);
      const assessment = await desktop.chat(
        [...state.messages, { role: "user", content: assessmentPrompt }].slice(-30),
        sessionId,
        communicationStyleSummary(),
        state.codingCoachMode,
        conversationContextSummary(),
      );
      return `I opened ${inspection.project.name} and inspected the live Studio project. ${assessment.text}`;
    }
    if (command.type === "open_studio") {
      const studio = await desktop.openRobloxStudio();
      return studio?.alreadyOpen ? studio.message : "Roblox Studio is opening now.";
    }
    if (command.type === "build_prompt") {
      if (command.openStudio) await desktop.openRobloxStudio();
      rememberConversationContext("roblox", "awaiting_build_description");
      return "Absolutely. What kind of game do you want me to create—what is the world, objective, and basic gameplay?";
    }
    if (command.type === "studio_context") {
      const context = await desktop.robloxStudioContext(command.query || "");
      rememberConversationContext("roblox", "studio_context", {
        topic: "Roblox Studio projects",
        subject: context.projectName || context.recentProjects?.[0]?.name || "Roblox Studio Home",
        entities: (context.recentProjects || []).map((project) => ({ name: project.name, path: project.path })),
      });
      if (!context.running) return "Roblox Studio is not open right now.";
      const sessionDescriptions = (context.sessions || []).map((session) => session.projectName ? `${session.projectName} (${session.state})` : `Studio Home (${session.state})`);
      if (context.sessionCount > 1) return `I can see ${context.sessionCount} Roblox Studio sessions: ${sessionDescriptions.join(", ")}. The selected editing target is ${context.projectName || "Studio Home"}.`;
      if (context.projectName) return `The Roblox project open in Studio is ${context.projectName}. Its session state is ${context.state || "place"}.`;
      const recent = context.recentProjects || [];
      if (recent.length) {
        const others = recent.slice(1, 3).map((project) => project.name);
        return `Studio is on its Home screen, so no game is currently open. Your most recent local project is ${recent[0].name}${others.length ? `; I also see ${others.join(" and ")}` : ""}.`;
      }
      return "Roblox Studio is open on its Home screen, but I do not see a loaded or recent local project title.";
    }
    if (command.type === "launch_latest") {
      const projects = await desktop.listRobloxProjects();
      if (!projects.length) return "There is no SVANS Roblox project yet. Describe the game you want and I’ll build the first version.";
      await desktop.launchRobloxProject(projects[0].placePath);
      rememberConversationContext("roblox", "launch_project", { topic: "Roblox project", subject: projects[0].name, entities: projects.slice(0, 8) });
      return `I opened ${projects[0].name} in Roblox Studio. Publishing remains locked to you.`;
    }
    if (command.type === "build") {
      const project = await desktop.buildRobloxGame({
        description: command.description,
        intent: command.intent || null,
      });
      await desktop.launchRobloxProject(project.placePath);
      state.robloxProjects = await desktop.listRobloxProjects();
      syncRobloxAvailability({ announce: true });
      rememberConversationContext("roblox", "build", { topic: "Roblox game creation", subject: project.name, entities: [project] });
      return `I built ${project.name} with ${project.buildingCount || 0} structured building models and ${project.characterCount || 0} humanoid characters, then opened it in Roblox Studio. The project is saved locally, analytics are installed, and only you can publish it.`;
    }
    if (command.type === "update") {
      const project = await desktop.updateRobloxGame(command.description);
      await desktop.launchRobloxProject(project.placePath);
      state.robloxProjects = await desktop.listRobloxProjects();
      syncRobloxAvailability();
      rememberConversationContext("roblox", "update", { topic: "Roblox game revision", subject: project.name, entities: [project] });
      return `I updated ${project.name}, preserved a backup, and reopened it in Roblox Studio. It now contains ${project.buildingCount || 0} building models and ${project.characterCount || 0} humanoid characters.`;
    }
    return "The Roblox development agent is ready.";
  }

  async function sendMessage(rawText) {
    const text = rawText.trim();
    if (!text || state.busy) return;
    state.busy = true;
    const operationGeneration = ++state.operationGeneration;
    const operationIsCurrent = () => operationGeneration === state.operationGeneration;
    elements.commandInput.value = "";
    elements.commandInput.style.height = "33px";
    appendMessage("user", text);
    learnCommunicationStyle(text);
    state.messages.push({ role: "user", content: text });
    setCoreState("THINKING", "thinking");
    elements.voiceLink.textContent = "PROCESSING";
    logActivity(`Conversation request: ${text.slice(0, 48)}`);

    const coachPreference = codingCoachPreference(text);
    if (coachPreference !== null) {
      setCodingCoachMode(coachPreference);
      const reply = coachPreference
        ? "Coding Coach mode is on. You will write the code first; I will teach the concept, give hints, review your attempt, and explain what went wrong without taking the work away from you."
        : "Coding Coach mode is off. I can return to giving direct coding help and complete solutions when you ask for them.";
      state.messages.push({ role: "assistant", content: reply });
      appendMessage("assistant", reply);
      elements.voiceLink.textContent = coachPreference ? "COACH MODE" : "CHANNEL READY";
      showToast(coachPreference ? "CODING COACH MODE ENABLED" : "CODING COACH MODE DISABLED");
      state.busy = false;
      void speak(reply);
      return;
    }

    const volumePreference = voiceVolumePreference(text);
    if (volumePreference !== null) {
      state.speechVolume = volumePreference;
      localStorage.setItem("svans.speechVolume", String(state.speechVolume));
      const reply = volumePreference < 0.5
        ? "Absolutely. I lowered my voice, and I’ll keep it quiet until you tell me otherwise."
        : "Normal voice level restored.";
      state.messages.push({ role: "assistant", content: reply });
      appendMessage("assistant", reply);
      elements.voiceLink.textContent = volumePreference < 0.5 ? "QUIET VOICE" : "CHANNEL READY";
      state.busy = false;
      void speak(reply);
      return;
    }

    const robloxCommand = parseRobloxCommand(text);
    if (robloxCommand) {
      rememberConversationContext("roblox", robloxCommand.type, { topic: "Roblox Studio and game development", subject: robloxCommand.target || state.conversationContext.subject });
      try {
        elements.voiceLink.textContent = robloxCommand.type === "build" ? "BUILDING ROBLOX GAME" : "ROBLOX LINK ACTIVE";
        const reply = await executeRobloxCommand(robloxCommand);
        if (!operationIsCurrent()) return;
        state.messages.push({ role: "assistant", content: reply });
        appendMessage("assistant", reply);
        logActivity(`Roblox agent · ${robloxCommand.type}`);
        void speak(reply);
      } catch (error) {
        if (!operationIsCurrent()) return;
        const reply = `The Roblox agent ran into a problem: ${error instanceof Error ? error.message : "unknown error"}`;
        state.messages.push({ role: "assistant", content: reply });
        appendMessage("assistant", reply);
        void speak(reply);
      } finally {
        if (operationIsCurrent()) {
          state.busy = false;
          elements.voiceLink.textContent = "CHANNEL READY";
        }
      }
      return;
    }

    const hologramCommand = parseHologramCommand(text);
    if (hologramCommand) {
      rememberConversationContext("hologram", hologramCommand.type, { topic: "interactive hologram", subject: hologramCommand.subject || state.universalHologram?.panel?.querySelector("header strong")?.textContent || "active hologram" });
      const reply = executeHologramCommand(hologramCommand);
      state.messages.push({ role: "assistant", content: reply });
      appendMessage("assistant", reply);
      elements.voiceLink.textContent = "HOLOGRAM ONLINE";
      state.busy = false;
      void speak(reply);
      return;
    }

    const agentGoalMatch = text.match(/^(?:give (?:yourself|svans) a task to|start (?:an? )?(?:agent )?task(?: to)?|handle this while I(?:'m| am) away\s*[:\-]?)\s*(.+)$/i);
    if (agentGoalMatch) {
      const goal = agentGoalMatch[1].trim();
      rememberConversationContext("agent", "task", { topic: goal, subject: goal });
      let reply;
      try {
        const task = await desktop.planAgentTask(goal);
        if (!operationIsCurrent()) return;
        upsertAgentTask(task);
        logActivity(`Agent task planned: ${goal.slice(0, 48)}`);
        const started = await desktop.startAgentTask(task.id);
        if (!operationIsCurrent()) return;
        if (started) upsertAgentTask(started);
        reply = started?.status === "awaiting_approval"
          ? `I've planned that out and I'm ready to start, but the first sensitive step needs your approval in the Agent Tasks panel first.`
          : `I've planned that out and I'm working through it now. You'll see it in the Agent Tasks panel.`;
      } catch (error) {
        if (!operationIsCurrent()) return;
        reply = `I couldn't plan that task: ${error instanceof Error ? error.message : "unknown planning error"}`;
      }
      if (!operationIsCurrent()) return;
      state.messages.push({ role: "assistant", content: reply });
      appendMessage("assistant", reply);
      elements.voiceLink.textContent = "TASK QUEUED";
      state.busy = false;
      void speak(reply);
      return;
    }

    const computerAction = parseComputerCommand(text);
    if (computerAction) {
      rememberConversationContext(computerAction.type.startsWith("business:") ? "business" : "computer", computerAction.type, {
        topic: computerAction.type.replace(/[_:]/g, " "),
        subject: computerAction.payload?.name || computerAction.payload?.path || computerAction.payload?.url || computerAction.payload?.folder || null,
      });
      try {
        const result = await executeComputerCommand(computerAction);
        if (!operationIsCurrent()) return;
        const reply = result?.message || "The computer action completed.";
        state.messages.push({ role: "assistant", content: reply });
        appendMessage("assistant", reply);
        logActivity(`Computer action · ${computerAction.type}`);
        elements.voiceLink.textContent = "ACTION COMPLETE";
        void speak(reply);
      } catch (error) {
        if (!operationIsCurrent()) return;
        const message = error instanceof Error ? error.message : "The computer action was blocked.";
        const reply = message.includes("PERMISSION_REQUIRED")
          ? "That capability is disabled. You can enable it in the SVANS Shield permissions panel."
          : `Guardian blocked that action: ${message}`;
        state.messages.push({ role: "assistant", content: reply });
        appendMessage("assistant", reply);
        logActivity(reply);
        setCoreState("READY");
        void speak(reply);
      } finally {
        if (operationIsCurrent()) state.busy = false;
      }
      return;
    }

    if (isLocalSystemHealthRequest(text)) {
      try {
        const reply = await localSystemHealthReport();
        if (!operationIsCurrent()) return;
        state.messages.push({ role: "assistant", content: reply });
        appendMessage("assistant", reply);
        logActivity("Local system health report generated");
        elements.voiceLink.textContent = "SYSTEMS NOMINAL";
        void speak(reply);
      } catch (error) {
        if (!operationIsCurrent()) return;
        const reply = `I could not read the local telemetry: ${error instanceof Error ? error.message : "unknown system error"}`;
        state.messages.push({ role: "assistant", content: reply });
        appendMessage("assistant", reply);
        setCoreState("STANDBY");
        void speak(reply);
      } finally {
        if (operationIsCurrent()) state.busy = false;
      }
      return;
    }

    const command = inferCommand(text);
    await runLocalCommand(command, text);

    try {
      if (!isContextualFollowUp(text)) rememberConversationContext("conversation", "discussion", { topic: text.slice(0, 280), subject: null, entities: [] });
      const response = await desktop.chat(state.messages.slice(-30), sessionId, communicationStyleSummary(), state.codingCoachMode, conversationContextSummary());
      if (!operationIsCurrent()) return;
      state.messages.push({ role: "assistant", content: response.text });
      appendMessage("assistant", response.text);
      logActivity(`SVANS responded${response.orchestration?.route ? ` · route ${response.orchestration.route}` : ""}`);
      if (response.offline && response.localMode === "roblox") {
        elements.voiceLink.textContent = "ROBLOX LOCAL MODE";
        setCoreState("LOCAL", "ready");
        showToast("SVANSAI OFFLINE · ROBLOX EDITING AVAILABLE");
      } else {
        elements.voiceLink.textContent = "CHANNEL READY";
      }
      void speak(response.text);
    } catch (error) {
      if (!operationIsCurrent()) return;
      const message = error instanceof Error ? error.message : "The intelligence link was interrupted.";
      appendMessage("assistant", message);
      state.messages.push({ role: "assistant", content: message });
      elements.voiceLink.textContent = "LINK DEGRADED";
      setCoreState("STANDBY");
      logActivity(`SVANSAI connection error: ${message}`);
    } finally {
      if (operationIsCurrent()) state.busy = false;
    }
  }

  function recognitionConstructor() {
    return window.SpeechRecognition ?? window.webkitSpeechRecognition;
  }

  function stopRecognition() {
    state.recognition?.abort();
    state.recognition = null;
    state.listening = false;
    elements.microphone.classList.remove("active");
  }

  function startRecognition() {
    if (!state.voiceEnabled || state.busy || state.recognition) return;
    const Recognition = recognitionConstructor();
    if (!Recognition) {
      state.voiceEnabled = false;
      showToast("VOICE RECOGNITION IS NOT AVAILABLE IN THIS BUILD");
      return;
    }
    const recognition = new Recognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = navigator.language || "en-US";
    state.recognition = recognition;
    recognition.onstart = () => {
      state.listening = true;
      elements.microphone.classList.add("active");
      elements.voiceLink.textContent = "LISTENING";
      setCoreState("LISTENING", "listening");
    };
    recognition.onresult = (event) => {
      let interim = "";
      let finalText = "";
      for (let index = 0; index < event.results.length; index += 1) {
        const result = event.results[index];
        const phrase = result?.[0]?.transcript ?? "";
        if (result.isFinal) finalText += `${phrase} `;
        else interim += `${phrase} `;
      }
      if (interim.trim()) elements.commandInput.value = interim.trim();
      if (finalText.trim()) {
        elements.commandInput.value = "";
        elements.commandInput.style.height = "33px";
        recognition.stop();
        void sendMessage(finalText.trim());
      }
    };
    recognition.onerror = (event) => {
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        state.voiceEnabled = false;
        $("#microphone-permission").checked = false;
        showToast("MICROPHONE PERMISSION IS REQUIRED");
      } else if (event.error === "network" || event.error === "audio-capture") {
        state.voiceEnabled = false;
        $("#microphone-permission").checked = false;
        elements.voiceLink.textContent = "VOICE INPUT OFFLINE";
        showToast("VOICE INPUT CONNECTION INTERRUPTED · TAP THE CORE TO RETRY");
      }
    };
    recognition.onend = () => {
      state.recognition = null;
      state.listening = false;
      elements.microphone.classList.remove("active");
      if (state.voiceEnabled && !state.busy && !speechSynthesis.speaking) {
        window.setTimeout(startRecognition, 500);
      }
    };
    try {
      recognition.start();
    } catch {
      state.recognition = null;
    }
  }

  function toggleVoice() {
    state.voiceEnabled = !state.voiceEnabled;
    $("#microphone-permission").checked = state.voiceEnabled;
    if (state.voiceEnabled) {
      logActivity("Voice conversation enabled");
      startRecognition();
    } else {
      stopRecognition();
      state.speechRequestId += 1;
      state.audio?.pause();
      state.audio = null;
      speechSynthesis?.cancel();
      setCoreState("READY");
      elements.voiceLink.textContent = "STANDBY";
      logActivity("Voice conversation disabled");
    }
  }

  function addTask() {
    const task = window.prompt("Add a priority task for SVANS:");
    if (!task?.trim()) return;
    const item = document.createElement("li");
    const complete = document.createElement("button");
    const label = document.createElement("span");
    const time = document.createElement("time");
    complete.setAttribute("aria-label", "Complete task");
    label.textContent = task.trim();
    time.textContent = "NEW";
    item.append(complete, label, time);
    elements.taskList.append(item);
    logActivity(`Priority task added: ${task.trim().slice(0, 44)}`);
  }

  // --- Agent orchestrator panel ---
  function stepStatusLabel(task) {
    const step = task.steps?.[task.cursor];
    if (!step) return task.status === "completed" ? "All steps complete." : "";
    return `${task.cursor + 1}/${task.steps.length} · ${step.description}`;
  }

  function renderAgentTasks() {
    const list = $("#agent-task-list");
    if (!list) return;
    if (!state.agentTasks.length) {
      list.innerHTML = `<li class="agent-task-empty">No agent tasks yet. Tap ＋ to give SVANS a multi-step goal.</li>`;
      return;
    }
    list.innerHTML = "";
    for (const task of state.agentTasks) {
      const item = document.createElement("li");
      item.className = "agent-task";
      item.dataset.taskId = task.id;

      const goal = document.createElement("span");
      goal.className = "agent-task-goal";
      goal.textContent = task.goal;

      const meta = document.createElement("div");
      meta.className = "agent-task-meta";
      const status = document.createElement("span");
      status.className = `agent-task-status status-${task.status}`;
      status.textContent = task.status.replace(/_/g, " ");
      meta.append(status);

      const stepLine = document.createElement("div");
      stepLine.className = "agent-task-step";
      stepLine.textContent = stepStatusLabel(task);

      item.append(goal, meta, stepLine);

      if (task.status === "awaiting_approval") {
        const currentStep = task.steps?.[task.cursor];
        const actions = document.createElement("div");
        actions.className = "agent-task-actions";
        const approve = document.createElement("button");
        approve.textContent = "APPROVE";
        approve.addEventListener("click", () => approveAgentStep(task.id));
        const reject = document.createElement("button");
        reject.className = "reject";
        reject.textContent = "SKIP";
        reject.addEventListener("click", () => rejectAgentStep(task.id));
        actions.append(approve, reject);
        item.append(actions);
        if (currentStep) {
          const pending = document.createElement("div");
          pending.className = "agent-task-step";
          pending.textContent = `Waiting on approval: ${currentStep.description}`;
          item.append(pending);
        }
      } else if (["awaiting_start", "scheduled", "paused"].includes(task.status)) {
        const actions = document.createElement("div");
        actions.className = "agent-task-actions";
        const start = document.createElement("button");
        start.textContent = task.status === "paused" ? "RESUME" : "START";
        start.addEventListener("click", () => startAgentTask(task.id));
        const cancel = document.createElement("button");
        cancel.className = "reject";
        cancel.textContent = "CANCEL";
        cancel.addEventListener("click", () => cancelAgentTask(task.id));
        actions.append(start, cancel);
        item.append(actions);
      } else if (task.status === "running") {
        const actions = document.createElement("div");
        actions.className = "agent-task-actions";
        const cancel = document.createElement("button");
        cancel.className = "reject";
        cancel.textContent = "CANCEL";
        cancel.addEventListener("click", () => cancelAgentTask(task.id));
        actions.append(cancel);
        item.append(actions);
      }

      list.append(item);
    }
  }

  function upsertAgentTask(task) {
    if (!task?.id) return;
    const index = state.agentTasks.findIndex((entry) => entry.id === task.id);
    if (index === -1) state.agentTasks.unshift(task);
    else state.agentTasks[index] = task;
    renderAgentTasks();
  }

  async function addAgentTask() {
    const goal = window.prompt("What should SVANS accomplish? Describe the goal in a sentence or two:");
    if (!goal?.trim()) return;
    showToast("PLANNING TASK…");
    try {
      const task = await desktop.planAgentTask(goal.trim());
      upsertAgentTask(task);
      logActivity(`Agent task planned: ${goal.trim().slice(0, 48)}`);
      const started = await desktop.startAgentTask(task.id);
      if (started) upsertAgentTask(started);
    } catch (error) {
      showToast(error instanceof Error ? error.message.toUpperCase() : "COULD NOT PLAN TASK");
    }
  }

  async function startAgentTask(taskId) {
    try {
      const task = await desktop.startAgentTask(taskId);
      if (task) upsertAgentTask(task);
    } catch (error) {
      showToast(error instanceof Error ? error.message.toUpperCase() : "COULD NOT START TASK");
    }
  }

  async function approveAgentStep(taskId) {
    try {
      const task = await desktop.approveAgentStep(taskId);
      if (task) upsertAgentTask(task);
      logActivity("Agent step approved");
    } catch (error) {
      showToast(error instanceof Error ? error.message.toUpperCase() : "COULD NOT APPROVE STEP");
    }
  }

  async function rejectAgentStep(taskId) {
    try {
      const task = await desktop.rejectAgentStep(taskId, "Skipped by owner from the Agent Tasks panel.");
      if (task) upsertAgentTask(task);
      logActivity("Agent step skipped by owner");
    } catch (error) {
      showToast(error instanceof Error ? error.message.toUpperCase() : "COULD NOT SKIP STEP");
    }
  }

  async function cancelAgentTask(taskId) {
    try {
      const task = await desktop.cancelAgentTask(taskId);
      if (task) upsertAgentTask(task);
      logActivity("Agent task cancelled");
    } catch (error) {
      showToast(error instanceof Error ? error.message.toUpperCase() : "COULD NOT CANCEL TASK");
    }
  }

  async function bindAgentPanel() {
    $("#add-agent-task-button")?.addEventListener("click", addAgentTask);
    desktop.onAgentUpdate((task) => upsertAgentTask(task));
    try {
      state.agentTasks = await desktop.listAgentTasks();
      renderAgentTasks();
    } catch {
      // No persisted tasks yet, or the desktop bridge is unavailable in preview mode.
    }
  }

  // --- Roblox development and live operations ---
  function compactMetric(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return "—";
    return Intl.NumberFormat("en-US", { notation: number >= 10000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(number);
  }

  function syncRobloxAvailability({ announce = false } = {}) {
    const projects = Array.isArray(state.robloxProjects) ? state.robloxProjects : [];
    const available = projects.length > 0;
    const tab = $("#roblox-context-tab");
    const panel = $("#roblox-panel");
    tab.hidden = !available;
    panel.classList.toggle("available", available);
    if (!available) panel.classList.remove("open");
    panel.setAttribute("aria-hidden", String(!available || !panel.classList.contains("open")));
    $("#roblox-project-badge").textContent = String(Math.min(projects.length, 99));
    $("#roblox-project-summary").textContent = available
      ? `${projects[0].name} · ${projects.length} LOCAL ${projects.length === 1 ? "PROJECT" : "PROJECTS"}`
      : "INTERNAL TRACKING READY";
    if (announce && available) {
      tab.classList.add("newly-available");
      window.setTimeout(() => tab.classList.remove("newly-available"), 1800);
      showToast("ROBLOX TAB ADDED · PROJECT TRACKING ACTIVE");
    }
  }

  function openRobloxPanel() {
    if (!state.robloxProjects.length) return false;
    const panel = $("#roblox-panel");
    panel.classList.add("open");
    panel.setAttribute("aria-hidden", "false");
    return true;
  }

  function closeRobloxPanel() {
    const panel = $("#roblox-panel");
    panel.classList.remove("open");
    panel.setAttribute("aria-hidden", "true");
    document.querySelector('[data-command="roblox"]')?.classList.remove("active");
  }

  function renderRobloxStats(stats) {
    state.robloxStats = stats;
    const publicStats = stats?.public;
    const analytics = stats?.analytics;
    $("#roblox-playing").textContent = compactMetric(publicStats?.playing);
    $("#roblox-visits").textContent = compactMetric(publicStats?.visits);
    $("#roblox-players").textContent = compactMetric(analytics?.totalUniquePlayers);
    $("#roblox-robux").textContent = compactMetric(analytics?.totalRobuxSpent);
    const status = $("#roblox-agent-status");
    if (!stats?.configured) status.textContent = "ADD UNIVERSE ID";
    else if (stats.publicError) status.textContent = "ROBLOX LINK DEGRADED";
    else status.textContent = `${publicStats?.name || "GAME"} · MONITORING`;
  }

  async function refreshRobloxStats() {
    try {
      const stats = await desktop.refreshRobloxStats();
      renderRobloxStats(stats);
      return stats;
    } catch (error) {
      $("#roblox-agent-status").textContent = "MONITOR UNAVAILABLE";
      logActivity(`Roblox monitoring error: ${error instanceof Error ? error.message : "unknown"}`);
      return null;
    }
  }

  async function saveRobloxConfiguration() {
    const universeId = $("#roblox-universe-id").value.trim();
    if (!/^\d+$/.test(universeId)) { showToast("ENTER A VALID UNIVERSE ID"); return; }
    try {
      await desktop.configureRoblox({ universeId });
      showToast("ROBLOX GAME LINKED · PUBLISHING DISABLED");
      logActivity(`Roblox Universe ${universeId} linked for monitoring`);
      await refreshRobloxStats();
    } catch (error) {
      showToast(error instanceof Error ? error.message.toUpperCase() : "COULD NOT LINK ROBLOX GAME");
    }
  }

  async function buildRobloxFromPanel() {
    const description = window.prompt("Describe the Roblox game SVANS should build. Include the gameplay, world, objectives, and style:");
    if (!description?.trim()) return;
    $("#roblox-agent-status").textContent = "DESIGNING AND BUILDING";
    showToast("SVANS ROBLOX AGENT BUILDING…");
    try {
      const project = await desktop.buildRobloxGame(description.trim());
      await desktop.launchRobloxProject(project.placePath);
      state.robloxProjects = await desktop.listRobloxProjects();
      syncRobloxAvailability({ announce: true });
      $("#roblox-agent-status").textContent = "PROJECT OPEN IN STUDIO";
      logActivity(`Roblox project built · ${project.name}`);
      const reply = `I built ${project.name} with ${project.buildingCount || 0} structured buildings and ${project.characterCount || 0} humanoid characters, then opened it in Roblox Studio. It is saved locally and publishing is still yours alone.`;
      state.messages.push({ role: "assistant", content: reply });
      appendMessage("assistant", reply);
      void speak(reply);
    } catch (error) {
      $("#roblox-agent-status").textContent = "BUILD NEEDS ATTENTION";
      showToast(error instanceof Error ? error.message.toUpperCase() : "ROBLOX BUILD FAILED");
    }
  }

  async function bindRobloxPanel() {
    $("#refresh-roblox-button")?.addEventListener("click", refreshRobloxStats);
    $("#close-roblox-button")?.addEventListener("click", closeRobloxPanel);
    $("#save-roblox-config")?.addEventListener("click", saveRobloxConfiguration);
    $("#build-roblox-button")?.addEventListener("click", buildRobloxFromPanel);
    desktop.onRobloxStats((stats) => renderRobloxStats(stats));
    try {
      const config = await desktop.robloxConfig();
      $("#roblox-universe-id").value = config.universeId || "";
      state.robloxProjects = await desktop.listRobloxProjects();
      syncRobloxAvailability();
    } catch {
      // Preview mode has no local Roblox bridge.
    }
    await refreshRobloxStats();
  }

  // --- Business Ops panel ---
  async function refreshBusinessSummary() {
    const list = $("#business-summary-list");
    if (!list) return;
    try {
      const result = await desktop.executeComputerAction({ type: "business:summary", payload: {} });
      const lines = result?.lines || [];
      if (!lines.length) {
        list.innerHTML = `<li class="business-empty">No business data yet. Try "add lead", "log revenue", or "show business summary".</li>`;
        return;
      }
      list.innerHTML = "";
      for (const line of lines) {
        const [label, value] = line.split(/:\s*(?=[^:]+$)/);
        const item = document.createElement("li");
        const labelSpan = document.createElement("span");
        labelSpan.textContent = label;
        const valueStrong = document.createElement("strong");
        valueStrong.textContent = value ?? "";
        item.append(labelSpan, valueStrong);
        list.append(item);
      }
    } catch {
      list.innerHTML = `<li class="business-empty">Business data unavailable in this preview.</li>`;
    }
  }

  function bindBusinessPanel() {
    $("#refresh-business-button")?.addEventListener("click", refreshBusinessSummary);
    void refreshBusinessSummary();
  }

  async function toggleCompact() {
    state.compact = !state.compact;
    const applied = await desktop.setCompact(state.compact);
    document.body.classList.toggle("compact", Boolean(applied));
    showToast(applied ? "AMBIENT ORB MODE" : "COMMAND DECK RESTORED");
    logActivity(applied ? "Ambient orb mode enabled" : "Command deck restored");
  }

  async function refreshComputerStatus() {
    try {
      const status = await desktop.computerStatus();
      state.computerPermissions = status.permissions;
      $$('[data-computer-permission]').forEach((input) => {
        input.checked = Boolean(status.permissions[input.dataset.computerPermission]);
      });
      const rootNames = (status.roots ?? []).map((root) => root.name).join(", ");
      logActivity(`Computer action engine online${rootNames ? ` · ${rootNames}` : ""}`);
    } catch (error) {
      logActivity(`Computer action engine unavailable: ${error instanceof Error ? error.message : "unknown"}`);
    }
  }

  async function refreshConnectorStatus() {
    try {
      const status = await desktop.connectorStatus();
      $$("[data-connector-status]").forEach((el) => {
        const key = el.dataset.connectorStatus;
        const platform = key.split(":")[0];
        const connected = Boolean(status[platform]);
        el.textContent = connected ? "Connected" : "Not connected";
        el.classList.toggle("connected", connected);
      });
    } catch (error) {
      logActivity(`Connector status unavailable: ${error instanceof Error ? error.message : "unknown"}`);
    }
  }

  function bindConnectorPanel() {
    $$("[data-connector-save]").forEach((button) => {
      button.addEventListener("click", async () => {
        const key = button.dataset.connectorSave;
        const input = $(`[data-connector-input="${key}"]`);
        const value = input?.value.trim();
        if (!value) {
          showToast("ENTER A KEY OR TOKEN FIRST");
          return;
        }
        try {
          await desktop.saveSecret(key, value);
          input.value = "";
          showToast(`${key.split(":")[0].toUpperCase()} CONNECTED`);
          logActivity(`Connector credential saved for ${key.split(":")[0]}`);
          await refreshConnectorStatus();
        } catch (error) {
          showToast(error instanceof Error ? error.message.toUpperCase() : "COULD NOT SAVE CREDENTIAL");
        }
      });
    });
    void refreshConnectorStatus();
  }

  function bindComputerControl() {
    $("#action-confirm-cancel").addEventListener("click", () => closeActionConfirmation(false));
    $("#action-confirm-approve").addEventListener("click", () => closeActionConfirmation(true));
    $$('[data-computer-permission]').forEach((input) => {
      input.addEventListener("change", async (event) => {
        const capability = event.target.dataset.computerPermission;
        const enabled = event.target.checked;
        let confirmation;
        if (capability === "admin" && enabled) {
          const approved = await confirmComputerAction({
            title: "Enable Administrator Guardian?",
            description: "This permits only named, hard-coded administrator actions. Every execution still requires confirmation and Windows UAC approval.",
            target: "Administrator Guardian · allowlisted operations only",
            level: "ELEVATED CAPABILITY · OWNER APPROVAL",
          });
          if (!approved) {
            event.target.checked = false;
            return;
          }
          confirmation = "ENABLE_ADMIN_GUARDIAN";
        }
        try {
          state.computerPermissions = await desktop.setComputerPermission(capability, enabled, confirmation);
          event.target.checked = Boolean(state.computerPermissions[capability]);
          logActivity(`${capability} capability ${enabled ? "enabled" : "disabled"}`);
          showToast(`${capability.toUpperCase()} CONTROL ${enabled ? "ENABLED" : "DISABLED"}`);
        } catch (error) {
          event.target.checked = !enabled;
          showToast(error instanceof Error ? error.message.toUpperCase() : "PERMISSION CHANGE BLOCKED");
        }
      });
    });

    $("#emergency-stop-button").addEventListener("click", async () => {
      const result = await desktop.emergencyStop();
      createIntelPanel(result.title, result.lines, "amber");
      logActivity("Emergency stop activated by owner");
      showToast("ALL SVANS HELPER OPERATIONS STOPPED");
    });

    bindConnectorPanel();

    desktop.onComputerAudit((entry) => {
      if (!state.authenticated) return;
      logActivity(`${entry.action} · ${entry.detail}`);
    });
    desktop.onEmergencyStop((result) => {
      if (!state.authenticated) return;
      state.busy = false;
      stopRecognition();
      state.audio?.pause();
      state.audio = null;
      createIntelPanel(result.title, result.lines, "amber");
      showToast("EMERGENCY STOP ACTIVATED");
    });
  }

  function closeRobloxReferenceModal() {
    elements.robloxReferenceModal.classList.remove("open");
    elements.robloxReferenceModal.setAttribute("aria-hidden", "true");
  }

  function openRobloxReferenceModal() {
    elements.robloxReferenceModal.classList.add("open");
    elements.robloxReferenceModal.setAttribute("aria-hidden", "false");
  }

  async function optimizedReferenceImage(file) {
    if (!file?.type?.startsWith("image/")) throw new Error("Choose a PNG, JPEG, or WebP image.");
    if (file.size > 12 * 1024 * 1024) throw new Error("Each source image must be under 12 MB.");
    const source = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("The image could not be read."));
      reader.readAsDataURL(file);
    });
    const image = await new Promise((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("The image format could not be decoded."));
      element.src = source;
    });
    const scale = Math.min(1, 1536 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    canvas.getContext("2d", { alpha: false }).drawImage(image, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.86);
    return { mimeType: "image/jpeg", data: dataUrl.split(",")[1], preview: dataUrl, name: file.name };
  }

  function updateReferenceStatus() {
    const required = ["front", "back", "left", "right", "top"];
    const loaded = required.filter((role) => state.robloxReferenceViews[role]).length;
    const interior = state.robloxReferenceViews.interior ? " · INTERIOR LOADED" : "";
    elements.robloxReferenceStatus.textContent = `${loaded} OF 5 REQUIRED VIEWS LOADED${interior}`;
  }

  function bindRobloxReferenceUpload() {
    elements.robloxReferenceButton.addEventListener("click", openRobloxReferenceModal);
    $("#roblox-reference-close").addEventListener("click", closeRobloxReferenceModal);
    $("#roblox-reference-cancel").addEventListener("click", closeRobloxReferenceModal);
    $$("[data-reference-role]").forEach((label) => {
      const input = label.querySelector("input");
      input.addEventListener("change", async () => {
        const file = input.files?.[0];
        if (!file) return;
        try {
          const view = await optimizedReferenceImage(file);
          const role = label.dataset.referenceRole;
          state.robloxReferenceViews[role] = { role, name: view.name, mimeType: view.mimeType, data: view.data };
          label.querySelector("img").src = view.preview;
          label.classList.add("loaded");
          updateReferenceStatus();
        } catch (error) {
          showToast(error instanceof Error ? error.message.toUpperCase() : "IMAGE COULD NOT BE LOADED");
        }
      });
    });
    $("#roblox-reference-analyze").addEventListener("click", async () => {
      const required = ["front", "back", "left", "right", "top"];
      const missing = required.filter((role) => !state.robloxReferenceViews[role]);
      if (missing.length) {
        showToast(`ADD ${missing.join(", ").toUpperCase()} VIEW${missing.length === 1 ? "" : "S"}`);
        return;
      }
      const button = $("#roblox-reference-analyze");
      button.disabled = true;
      button.textContent = "ANALYZING VIEWS…";
      elements.robloxReferenceStatus.textContent = "RECONCILING GEOMETRY ACROSS ALL CAMERA ANGLES";
      try {
        const result = await desktop.analyzeRobloxReferences({ views: Object.values(state.robloxReferenceViews), brief: elements.commandInput.value });
        state.robloxReferenceBlueprint = String(result.blueprint || "").slice(0, 16000);
        localStorage.setItem("svans.robloxReferenceBlueprint", state.robloxReferenceBlueprint);
        elements.robloxReferenceButton.classList.add("ready");
        elements.commandInput.value = "Build the uploaded multi-view reference in Elemental Realm";
        elements.commandInput.dispatchEvent(new Event("input"));
        rememberConversationContext("roblox", "reference_ready", { topic: "Multi-view Roblox reference build", subject: "Elemental Realm", entities: result.roles || [] });
        closeRobloxReferenceModal();
        appendMessage("assistant", `I reconciled ${result.viewCount} reference views into one Roblox construction blueprint. Review the prepared command, then transmit it when you want me to build it visibly in Studio.`);
        showToast("MULTI-VIEW ROBLOX BLUEPRINT READY");
      } catch (error) {
        elements.robloxReferenceStatus.textContent = error instanceof Error ? error.message.toUpperCase() : "REFERENCE ANALYSIS FAILED";
      } finally {
        button.disabled = false;
        button.textContent = "ANALYZE REFERENCES";
      }
    });
    updateReferenceStatus();
    if (state.robloxReferenceBlueprint) elements.robloxReferenceButton.classList.add("ready");
  }

  function bindEvents() {
    bindRobloxReferenceUpload();
    elements.commandForm.addEventListener("submit", (event) => {
      event.preventDefault();
      void sendMessage(elements.commandInput.value);
    });
    elements.commandInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
        event.preventDefault();
        elements.commandForm.requestSubmit();
      }
    });
    elements.commandInput.addEventListener("input", () => {
      elements.commandInput.style.height = "auto";
      elements.commandInput.style.height = `${Math.min(elements.commandInput.scrollHeight, 76)}px`;
    });
    elements.core.addEventListener("click", toggleVoice);
    elements.microphone.addEventListener("click", toggleVoice);
    $("#microphone-permission").addEventListener("change", (event) => {
      state.voiceEnabled = event.target.checked;
      if (state.voiceEnabled) startRecognition();
      else stopRecognition();
    });
    $("#spoken-output-permission").addEventListener("change", (event) => {
      state.speechOutputEnabled = event.target.checked;
      if (!state.speechOutputEnabled) {
        state.speechRequestId += 1;
        state.audio?.pause();
        state.audio = null;
        window.speechSynthesis?.cancel();
        setCoreState("READY");
        elements.voiceLink.textContent = state.voiceEnabled ? "LISTENING" : "OUTPUT MUTED";
      } else {
        elements.voiceLink.textContent = state.voiceEnabled ? "CHANNEL READY" : "OUTPUT READY";
        showToast("SVANS SPOKEN RESPONSES ENABLED");
      }
    });
    elements.voiceProfile.addEventListener("change", (event) => {
      state.voice = window.speechSynthesis.getVoices().find((voice) => voice.name === event.target.value) ?? state.voice;
      if (state.voice) localStorage.setItem("svans.voice", state.voice.name);
      showToast("SVANS VOICE PROFILE UPDATED");
    });
    elements.voiceSpeed.addEventListener("input", (event) => {
      state.speechRate = Math.min(1.3, Math.max(0.7, Number(event.target.value) || 1));
      elements.voiceSpeedValue.textContent = `${state.speechRate.toFixed(2)}×`;
      localStorage.setItem("svans.speechRate", String(state.speechRate));
    });
    elements.voiceSpeed.addEventListener("change", () => {
      showToast(`SVANS SPEAKING SPEED · ${state.speechRate.toFixed(2)}×`);
    });
    $("#coding-coach-mode").addEventListener("change", (event) => {
      setCodingCoachMode(event.target.checked);
      showToast(state.codingCoachMode ? "CODING COACH MODE ENABLED" : "CODING COACH MODE DISABLED");
    });
    $("#voice-preview-button").addEventListener("click", () => {
      void speak("Good evening, Shawn. SVANS is online and ready when you are.", { preview: true });
    });
    $("#stop-voice-button").addEventListener("click", stopCurrentOperation);

    $$('[data-command]').forEach((button) => {
      button.addEventListener("click", () => void runLocalCommand(button.dataset.command));
    });
    $$('[data-panel]').forEach((button) => {
      button.addEventListener("click", () => void runLocalCommand(button.dataset.panel));
    });

    $("#permission-button").addEventListener("click", openPermissions);
    $("#permission-close").addEventListener("click", closePermissions);
    $("#add-task-button").addEventListener("click", addTask);
    $("#compact-button").addEventListener("click", () => void toggleCompact());
    $("#ambient-restore-button").addEventListener("click", () => void toggleCompact());
    $("#clear-chat-button").addEventListener("click", () => {
      state.messages = [];
      state.conversationContext = defaultConversationContext();
      state.pendingRobloxAction = null;
      elements.messageStream.innerHTML = "";
      $("#conversation-panel").style.height = "";
      persistConversationMemory();
      logActivity("Conversation display cleared");
    });

    $("#pin-button").addEventListener("click", async (event) => {
      state.pinned = await desktop.setAlwaysOnTop(!state.pinned);
      event.currentTarget.classList.toggle("active", state.pinned);
      showToast(state.pinned ? "SVANS PINNED ABOVE OTHER WINDOWS" : "ALWAYS-ON-TOP DISABLED");
      logActivity(state.pinned ? "Always-on-top enabled" : "Always-on-top disabled");
    });
    $("#minimize-button").addEventListener("click", () => desktop.windowAction("minimize"));
    $("#maximize-button").addEventListener("click", () => desktop.windowAction("maximize"));
    $("#close-button").addEventListener("click", () => desktop.windowAction("close"));

    elements.taskList.addEventListener("click", (event) => {
      if (event.target.matches("li button")) event.target.closest("li")?.classList.toggle("completed");
    });
    window.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        if (stopCurrentOperation()) {
          event.preventDefault();
          return;
        }
        if (state.confirmationResolver) {
          closeActionConfirmation(false);
          return;
        }
        if (state.compact) {
          void toggleCompact();
          return;
        }
        if ($("#roblox-panel")?.classList.contains("open")) {
          closeRobloxPanel();
          return;
        }
        closePermissions();
        document.querySelector(".floating-intel")?.remove();
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        elements.commandInput.focus();
      }
    });
  }

  function createParticleField() {
    const canvas = $("#particle-field");
    const context = canvas.getContext("2d");
    const particles = Array.from({ length: 72 }, () => ({
      x: Math.random(),
      y: Math.random(),
      vx: (Math.random() - 0.5) * 0.00012,
      vy: (Math.random() - 0.5) * 0.00012,
      size: Math.random() * 1.4 + 0.3,
    }));
    const resize = () => {
      const ratio = Math.min(devicePixelRatio || 1, 2);
      canvas.width = Math.floor(innerWidth * ratio);
      canvas.height = Math.floor(innerHeight * ratio);
      canvas.style.width = `${innerWidth}px`;
      canvas.style.height = `${innerHeight}px`;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    };
    const draw = () => {
      context.clearRect(0, 0, innerWidth, innerHeight);
      for (const particle of particles) {
        particle.x += particle.vx;
        particle.y += particle.vy;
        if (particle.x < 0 || particle.x > 1) particle.vx *= -1;
        if (particle.y < 0 || particle.y > 1) particle.vy *= -1;
        context.fillStyle = "rgba(88, 220, 255, 0.44)";
        context.beginPath();
        context.arc(particle.x * innerWidth, particle.y * innerHeight, particle.size, 0, Math.PI * 2);
        context.fill();
      }
      for (let first = 0; first < particles.length; first += 1) {
        for (let second = first + 1; second < particles.length; second += 1) {
          const a = particles[first];
          const b = particles[second];
          const dx = (a.x - b.x) * innerWidth;
          const dy = (a.y - b.y) * innerHeight;
          const distance = Math.hypot(dx, dy);
          if (distance > 125) continue;
          context.strokeStyle = `rgba(0, 212, 255, ${0.08 * (1 - distance / 125)})`;
          context.beginPath();
          context.moveTo(a.x * innerWidth, a.y * innerHeight);
          context.lineTo(b.x * innerWidth, b.y * innerHeight);
          context.stroke();
        }
      }
      requestAnimationFrame(draw);
    };
    resize();
    window.addEventListener("resize", resize);
    requestAnimationFrame(draw);
  }

  function initialize() {
    if (restoredConversation.messages.length) {
      elements.messageStream.innerHTML = "";
      for (const message of state.messages) appendMessage(message.role, message.content);
    }
    elements.voiceSpeed.value = String(state.speechRate);
    elements.voiceSpeedValue.textContent = `${state.speechRate.toFixed(2)}×`;
    $("#coding-coach-mode").checked = state.codingCoachMode;
    updateClock();
    window.setInterval(updateClock, 1000);
    bindEvents();
    bindAuthentication();
    bindComputerControl();
    void bindAgentPanel();
    void bindRobloxPanel();
    bindBusinessPanel();
    createParticleField();
    loadVoiceProfiles();
    if ("speechSynthesis" in window) window.speechSynthesis.addEventListener("voiceschanged", loadVoiceProfiles);
    window.setTimeout(() => elements.loginPassword.focus(), 350);
  }

  initialize();
})();
