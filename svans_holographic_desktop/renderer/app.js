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
    async chat() {
      return { text: "The live conversational bridge activates inside the Electron desktop app. The holographic interface is running in visual preview mode." };
    },
    async openDestination(destination) {
      window.open(destination === "svansai" ? "https://svansai.com" : "https://vansantplatform.com", "_blank", "noopener");
      return true;
    },
    windowAction() {},
    async setAlwaysOnTop(enabled) { return enabled; },
    async setCompact(enabled) { return enabled; },
  };

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const sessionId = crypto.randomUUID();
  const state = {
    messages: [
      { role: "assistant", content: "Holographic interface online. What are we building today, Shawn?" },
    ],
    busy: false,
    voiceEnabled: false,
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
  };

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
    hud: $("#hud-shell"),
    loginGate: $("#login-gate"),
    loginForm: $("#login-form"),
    loginUsername: $("#login-username"),
    loginPassword: $("#login-password"),
    loginStatus: $("#login-status"),
    loginTerminal: $(".login-terminal"),
    authorizeButton: $("#authorize-button"),
  };

  function setLoginStatus(message, mode = "") {
    elements.loginStatus.textContent = message;
    elements.loginStatus.className = `login-status ${mode}`.trim();
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
    window.setTimeout(() => {
      document.body.classList.remove("auth-locked");
      elements.loginGate.classList.add("unlocked");
      elements.loginGate.setAttribute("aria-hidden", "true");
      elements.hud.setAttribute("aria-hidden", "false");
      void refreshTelemetry();
      state.telemetryTimer = window.setInterval(() => void refreshTelemetry(), 2500);
      logActivity("Administrator identity confirmed");
      showToast("WELCOME, ADMIN · SVANS COMMAND DECK ONLINE");
    }, 620);
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

  function appendMessage(role, content) {
    const wrapper = document.createElement("div");
    const label = document.createElement("span");
    const body = document.createElement("p");
    wrapper.className = `message ${role === "user" ? "user-message" : "svans-message"}`;
    label.textContent = role === "user" ? "SHAWN" : "SVANS";
    body.textContent = content;
    wrapper.append(label, body);
    elements.messageStream.append(wrapper);
    elements.messageStream.scrollTop = elements.messageStream.scrollHeight;
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
      .replace(/\s+/g, " ")
      .trim();
  }

  function speak(text) {
    if (!state.voiceEnabled || !("speechSynthesis" in window)) {
      setCoreState("READY");
      return;
    }
    stopRecognition();
    setCoreState("SPEAKING", "speaking");
    elements.voiceLink.textContent = "OUTPUT ACTIVE";
    const utterance = new SpeechSynthesisUtterance(conversationalText(text));
    utterance.voice = state.voice;
    utterance.rate = 0.96;
    utterance.pitch = 0.98;
    utterance.volume = 1;
    utterance.onend = () => {
      setCoreState("READY");
      startRecognition();
    };
    utterance.onerror = utterance.onend;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
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

  function inferCommand(text) {
    if (/\b(cpu|memory|ram|system|computer|status|telemetry)\b/i.test(text)) return "system";
    if (/\b(project|ecosystem|relationship|architecture)\b/i.test(text)) return "projects";
    if (/\b(shield|security|threat|permission|guardian)\b/i.test(text)) return "shield";
    if (/\b(debug|diagnos|error|issue|problem)\b/i.test(text)) return "debugger";
    if (/\b(browser|platform|website)\b/i.test(text)) return "browser";
    return "conversation";
  }

  async function sendMessage(rawText) {
    const text = rawText.trim();
    if (!text || state.busy) return;
    state.busy = true;
    elements.commandInput.value = "";
    appendMessage("user", text);
    state.messages.push({ role: "user", content: text });
    setCoreState("THINKING", "thinking");
    elements.voiceLink.textContent = "PROCESSING";
    logActivity(`Conversation request: ${text.slice(0, 48)}`);

    const command = inferCommand(text);
    await runLocalCommand(command, text);

    try {
      const response = await desktop.chat(state.messages.slice(-30), sessionId);
      state.messages.push({ role: "assistant", content: response.text });
      appendMessage("assistant", response.text);
      logActivity(`SVANS responded${response.orchestration?.route ? ` · route ${response.orchestration.route}` : ""}`);
      elements.voiceLink.textContent = "CHANNEL READY";
      speak(response.text);
    } catch (error) {
      const message = error instanceof Error ? error.message : "The intelligence link was interrupted.";
      appendMessage("assistant", message);
      state.messages.push({ role: "assistant", content: message });
      elements.voiceLink.textContent = "LINK DEGRADED";
      setCoreState("STANDBY");
      logActivity(`SVANSAI connection error: ${message}`);
    } finally {
      state.busy = false;
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
        recognition.stop();
        void sendMessage(finalText.trim());
      }
    };
    recognition.onerror = (event) => {
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        state.voiceEnabled = false;
        $("#microphone-permission").checked = false;
        showToast("MICROPHONE PERMISSION IS REQUIRED");
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

  async function toggleCompact() {
    state.compact = !state.compact;
    const applied = await desktop.setCompact(state.compact);
    document.body.classList.toggle("compact", Boolean(applied));
    showToast(applied ? "AMBIENT ORB MODE" : "COMMAND DECK RESTORED");
    logActivity(applied ? "Ambient orb mode enabled" : "Command deck restored");
  }

  function bindEvents() {
    elements.commandForm.addEventListener("submit", (event) => {
      event.preventDefault();
      void sendMessage(elements.commandInput.value);
    });
    elements.core.addEventListener("click", toggleVoice);
    elements.microphone.addEventListener("click", toggleVoice);
    $("#microphone-permission").addEventListener("change", (event) => {
      state.voiceEnabled = event.target.checked;
      if (state.voiceEnabled) startRecognition();
      else stopRecognition();
    });
    elements.voiceProfile.addEventListener("change", (event) => {
      state.voice = window.speechSynthesis.getVoices().find((voice) => voice.name === event.target.value) ?? state.voice;
      if (state.voice) localStorage.setItem("svans.voice", state.voice.name);
      showToast("SVANS VOICE PROFILE UPDATED");
    });
    $("#voice-preview-button").addEventListener("click", () => {
      const wasEnabled = state.voiceEnabled;
      state.voiceEnabled = true;
      speak("Good evening, Shawn. SVANS is online and ready when you are.");
      state.voiceEnabled = wasEnabled;
    });

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
    $("#clear-chat-button").addEventListener("click", () => {
      state.messages = [];
      elements.messageStream.innerHTML = "";
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
    updateClock();
    window.setInterval(updateClock, 1000);
    bindEvents();
    bindAuthentication();
    createParticleField();
    loadVoiceProfiles();
    if ("speechSynthesis" in window) window.speechSynthesis.addEventListener("voiceschanged", loadVoiceProfiles);
    window.setTimeout(() => elements.loginPassword.focus(), 350);
  }

  initialize();
})();
