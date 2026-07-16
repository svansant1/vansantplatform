importScripts("diagnostic-rules.js");

const DEFAULT_API_BASE_URL = "https://vansant-backend.onrender.com";
const SYNC_ALARM = "svansai-telemetry-sync";
const MAX_EVENTS_PER_TAB = 100;
const tabTelemetry = new Map();
const deepAttachedTabs = new Set();
const requestStartedAt = new Map();
let monitoringEnabled = false;

function now() {
  return new Date().toISOString();
}

function normalizeUrl(value) {
  return (value || DEFAULT_API_BASE_URL).trim().replace(/\/+$/, "");
}

const { redactUrl } = globalThis.SVANSAIDiagnosticRules;

async function getSettings() {
  const settings = await chrome.storage.local.get({
    enabled: false,
    sessionCode: "",
    apiBaseUrl: DEFAULT_API_BASE_URL,
    deviceId: "",
    deepInspection: false,
  });

  let deviceId = String(settings.deviceId || "");
  if (!deviceId) {
    deviceId = crypto.randomUUID();
    await chrome.storage.local.set({ deviceId });
  }

  return {
    enabled: Boolean(settings.enabled),
    sessionCode: String(settings.sessionCode || "").trim().toUpperCase(),
    apiBaseUrl: normalizeUrl(String(settings.apiBaseUrl || DEFAULT_API_BASE_URL)),
    deviceId,
    deepInspection: Boolean(settings.deepInspection),
  };
}

function telemetryFor(tabId) {
  const existing = tabTelemetry.get(tabId);
  if (existing) return existing;
  const created = { events: [], page: {}, status: "detected", navigation_error: "" };
  tabTelemetry.set(tabId, created);
  return created;
}

function addEvent(tabId, event) {
  if (!monitoringEnabled || tabId < 0) return;
  const telemetry = telemetryFor(tabId);
  telemetry.events.push({ ...event, timestamp: event.timestamp || now() });
  if (telemetry.events.length > MAX_EVENTS_PER_TAB) {
    telemetry.events.splice(0, telemetry.events.length - MAX_EVENTS_PER_TAB);
  }
}

async function updateBadge() {
  const settings = await getSettings();
  const active = settings.enabled && settings.sessionCode;
  await chrome.action.setBadgeText({ text: active ? "ON" : "OFF" });
  await chrome.action.setBadgeBackgroundColor({ color: active ? "#16a34a" : "#64748b" });
  await chrome.action.setTitle({
    title: active
      ? `SVANSAI Site Monitor: ${settings.sessionCode}`
      : "SVANSAI Site Monitor: off",
  });
}

async function collectTabs() {
  const tabs = await chrome.tabs.query({});
  return tabs
    .filter((tab) => tab.id !== undefined && /^https?:/i.test(tab.url || ""))
    .map((tab) => {
      const telemetry = telemetryFor(tab.id);
      return {
        id: tab.id,
        title: String(tab.title || "").slice(0, 300),
        url: redactUrl(tab.url),
        active: Boolean(tab.active),
        discarded: Boolean(tab.discarded),
        status: telemetry.status,
        navigation_error: telemetry.navigation_error,
        page: telemetry.page,
        events: telemetry.events,
      };
    });
}

async function sendTabs(reason = "scheduled") {
  const settings = await getSettings();
  await updateBadge();
  if (!settings.enabled) return { ok: false, error: "Site monitoring is disabled." };
  if (!settings.sessionCode) return { ok: false, error: "Session code is required." };

  try {
    const tabs = await collectTabs();
    const response = await fetch(`${settings.apiBaseUrl}/browser/tabs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_code: settings.sessionCode,
        device_id: settings.deviceId,
        source: "svansai-site-monitor-v2",
        reason,
        updated_at: now(),
        tabs,
      }),
    });
    if (!response.ok) {
      const message = response.status === 401
        ? "Debugger session expired. Generate and enter a new pair code."
        : `Backend returned ${response.status}.`;
      return { ok: false, error: message, tabCount: tabs.length };
    }
    return { ok: true, tabCount: tabs.length };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Sync failed." };
  }
}

async function maybeSendTabs(reason) {
  const settings = await getSettings();
  if (!settings.enabled || !settings.sessionCode) return updateBadge();
  return sendTabs(reason);
}

async function detachDeepInspection() {
  for (const tabId of Array.from(deepAttachedTabs)) {
    try {
      await chrome.debugger.detach({ tabId });
    } catch {
      // Tab or debugger session may already be gone.
    }
    deepAttachedTabs.delete(tabId);
  }
}

async function refreshDeepInspection() {
  const settings = await getSettings();
  if (!settings.enabled || !settings.deepInspection) {
    await detachDeepInspection();
    return;
  }
  const hasPermission = await chrome.permissions.contains({ permissions: ["debugger"] });
  if (!hasPermission) return;

  const activeTabs = await chrome.tabs.query({ active: true });
  const desired = new Set(
    activeTabs
      .filter((tab) => tab.id !== undefined && /^https?:/i.test(tab.url || ""))
      .map((tab) => tab.id),
  );

  for (const tabId of Array.from(deepAttachedTabs)) {
    if (!desired.has(tabId)) {
      try { await chrome.debugger.detach({ tabId }); } catch { /* already detached */ }
      deepAttachedTabs.delete(tabId);
    }
  }
  for (const tabId of desired) {
    if (deepAttachedTabs.has(tabId)) continue;
    try {
      await chrome.debugger.attach({ tabId }, "1.3");
      await chrome.debugger.sendCommand({ tabId }, "Runtime.enable");
      await chrome.debugger.sendCommand({ tabId }, "Network.enable");
      await chrome.debugger.sendCommand({ tabId }, "Log.enable");
      deepAttachedTabs.add(tabId);
    } catch {
      // DevTools or another debugger may already own the tab.
    }
  }
}

chrome.debugger.onEvent.addListener((source, method, params) => {
  const tabId = source.tabId;
  if (tabId === undefined || !deepAttachedTabs.has(tabId)) return;
  if (method === "Runtime.exceptionThrown") {
    addEvent(tabId, {
      kind: "page-error",
      error: String(params?.exceptionDetails?.text || params?.exceptionDetails?.exception?.description || "Runtime exception").slice(0, 300),
    });
  } else if (method === "Log.entryAdded" && ["error", "warning"].includes(params?.entry?.level)) {
    addEvent(tabId, {
      kind: "page-error",
      url: redactUrl(params?.entry?.url),
      error: String(params?.entry?.text || "Browser log error").slice(0, 300),
    });
  } else if (method === "Network.loadingFailed") {
    addEvent(tabId, {
      kind: "request-error",
      error: String(params?.errorText || "Network loading failed").slice(0, 300),
      resource_type: String(params?.type || "").slice(0, 40),
    });
  } else if (method === "Network.responseReceived" && Number(params?.response?.status || 0) >= 400) {
    addEvent(tabId, {
      kind: "request-complete",
      url: redactUrl(params?.response?.url),
      status_code: Number(params.response.status),
      resource_type: String(params?.type || "").slice(0, 40),
    });
  }
});

chrome.debugger.onDetach.addListener((source) => {
  if (source.tabId !== undefined) deepAttachedTabs.delete(source.tabId);
});

chrome.webNavigation.onCommitted.addListener((details) => {
  if (!monitoringEnabled || details.frameId !== 0) return;
  const telemetry = telemetryFor(details.tabId);
  telemetry.status = "loading";
  telemetry.navigation_error = "";
  addEvent(details.tabId, { kind: "navigation-start", url: redactUrl(details.url) });
});

chrome.webNavigation.onCompleted.addListener((details) => {
  if (!monitoringEnabled || details.frameId !== 0) return;
  telemetryFor(details.tabId).status = "complete";
  addEvent(details.tabId, { kind: "navigation-complete", url: redactUrl(details.url) });
  void maybeSendTabs("navigation-complete");
});

chrome.webNavigation.onErrorOccurred.addListener((details) => {
  if (!monitoringEnabled || details.frameId !== 0) return;
  const telemetry = telemetryFor(details.tabId);
  telemetry.status = "failed";
  telemetry.navigation_error = String(details.error || "Navigation failed").slice(0, 300);
  addEvent(details.tabId, {
    kind: "navigation-error",
    url: redactUrl(details.url),
    error: telemetry.navigation_error,
  });
  void maybeSendTabs("navigation-error");
});

chrome.webRequest.onCompleted.addListener((details) => {
  if (!monitoringEnabled || details.tabId < 0) return;
  const durationMs = requestStartedAt.has(details.requestId)
    ? Math.max(0, details.timeStamp - requestStartedAt.get(details.requestId))
    : null;
  if (details.statusCode < 400 && details.type !== "main_frame" && Number(durationMs || 0) < 5000) {
    requestStartedAt.delete(details.requestId);
    return;
  }
  addEvent(details.tabId, {
    kind: "request-complete",
    url: redactUrl(details.url),
    method: details.method,
    status_code: details.statusCode,
    resource_type: details.type,
    duration_ms: durationMs,
  });
  requestStartedAt.delete(details.requestId);
});

chrome.webRequest.onErrorOccurred.addListener((details) => {
  if (!monitoringEnabled || details.tabId < 0) return;
  addEvent(details.tabId, {
    kind: "request-error",
    url: redactUrl(details.url),
    method: details.method,
    error: details.error,
    resource_type: details.type,
    duration_ms: requestStartedAt.has(details.requestId)
      ? Math.max(0, details.timeStamp - requestStartedAt.get(details.requestId))
      : null,
  });
  requestStartedAt.delete(details.requestId);
});

chrome.webRequest.onBeforeRequest.addListener((details) => {
  if (monitoringEnabled && details.tabId >= 0) requestStartedAt.set(details.requestId, details.timeStamp);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "page-health" && sender.tab?.id !== undefined) {
    if (!monitoringEnabled) return false;
    const telemetry = telemetryFor(sender.tab.id);
    telemetry.page = { ...telemetry.page, ...message.payload };
    addEvent(sender.tab.id, { kind: "page-health", url: redactUrl(sender.tab.url) });
    return false;
  }
  if (message?.type === "page-error" && sender.tab?.id !== undefined) {
    if (!monitoringEnabled) return false;
    addEvent(sender.tab.id, {
      kind: message.payload?.resource ? "resource-error" : "page-error",
      url: redactUrl(message.payload?.url || sender.tab.url),
      error: String(message.payload?.message || "Page error").slice(0, 300),
      resource_type: String(message.payload?.resource || "").slice(0, 40),
    });
    return false;
  }
  if (message?.type === "settings-updated") {
    void updateBadge().then(() => sendResponse({ ok: true }));
    return true;
  }
  if (message?.type === "sync-tabs-now") {
    void sendTabs("manual").then(sendResponse);
    return true;
  }
  return false;
});

chrome.tabs.onRemoved.addListener((tabId) => tabTelemetry.delete(tabId));
chrome.tabs.onCreated.addListener(() => void maybeSendTabs("tab-created"));
chrome.tabs.onUpdated.addListener(() => void maybeSendTabs("tab-updated"));
chrome.tabs.onActivated.addListener(() => void maybeSendTabs("tab-activated"));
chrome.tabs.onActivated.addListener(() => void refreshDeepInspection());
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === SYNC_ALARM) void maybeSendTabs("interval");
});
chrome.runtime.onInstalled.addListener(async () => {
  await chrome.storage.local.set({ enabled: false, apiBaseUrl: DEFAULT_API_BASE_URL });
  await chrome.alarms.create(SYNC_ALARM, { periodInMinutes: 0.5 });
  await updateBadge();
});
chrome.runtime.onStartup.addListener(async () => {
  await chrome.alarms.create(SYNC_ALARM, { periodInMinutes: 0.5 });
  await updateBadge();
});

chrome.storage.onChanged.addListener((changes) => {
  if (changes.enabled) monitoringEnabled = Boolean(changes.enabled.newValue);
  if (!monitoringEnabled) tabTelemetry.clear();
  if (changes.deepInspection || changes.enabled) void refreshDeepInspection();
});

void getSettings().then((settings) => {
  monitoringEnabled = settings.enabled;
});
void chrome.alarms.create(SYNC_ALARM, { periodInMinutes: 0.5 });
void updateBadge();
void refreshDeepInspection();
