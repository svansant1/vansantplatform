console.log("SVANSAI Site Bridge starting...");

const DEFAULT_API_BASE_URL = "https://vansant-backend.onrender.com";
const SYNC_INTERVAL_MS = 15000;

function normalizeUrl(value) {
  return (value || DEFAULT_API_BASE_URL).trim().replace(/\/+$/, "");
}

async function getSettings() {
  const settings = await chrome.storage.local.get({
    enabled: false,
    sessionCode: "",
    apiBaseUrl: DEFAULT_API_BASE_URL,
  });

  return {
    enabled: Boolean(settings.enabled),
    sessionCode: String(settings.sessionCode || "").trim().toUpperCase(),
    apiBaseUrl: normalizeUrl(String(settings.apiBaseUrl || DEFAULT_API_BASE_URL)),
  };
}

async function updateBadge() {
  const settings = await getSettings();

  if (settings.enabled && settings.sessionCode) {
    await chrome.action.setBadgeText({ text: "ON" });
    await chrome.action.setBadgeBackgroundColor({ color: "#16a34a" });
    await chrome.action.setTitle({
      title: `SVANSAI Site Bridge: sharing for ${settings.sessionCode}`,
    });
    return;
  }

  await chrome.action.setBadgeText({ text: "OFF" });
  await chrome.action.setBadgeBackgroundColor({ color: "#64748b" });
  await chrome.action.setTitle({ title: "SVANSAI Site Bridge: sync off" });
}

async function collectTabs() {
  const tabs = await chrome.tabs.query({});

  return tabs
    .filter((tab) => tab.url && /^https?:/i.test(tab.url))
    .map((tab) => ({
      id: tab.id,
      title: tab.title || "",
      url: tab.url || "",
    }));
}

async function sendTabs(reason = "scheduled") {
  const settings = await getSettings();
  await updateBadge();

  if (!settings.enabled) {
    return { ok: false, error: "Tab sync is disabled." };
  }

  if (!settings.sessionCode) {
    return { ok: false, error: "Session code is required before syncing tabs." };
  }

  try {
    const filteredTabs = await collectTabs();
    const response = await fetch(`${settings.apiBaseUrl}/browser/tabs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        session_code: settings.sessionCode,
        source: "svansai-debugger-site-bridge",
        reason,
        updated_at: new Date().toISOString(),
        tabs: filteredTabs,
      }),
    });

    console.log("POST /browser/tabs:", response.status, filteredTabs.length);

    if (!response.ok) {
      return {
        ok: false,
        error: `Backend returned ${response.status}.`,
        tabCount: filteredTabs.length,
      };
    }

    return { ok: true, tabCount: filteredTabs.length };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Extension sync failed.";
    console.error("Extension error:", err);
    return { ok: false, error: message };
  }
}

async function maybeSendTabs(reason) {
  const settings = await getSettings();
  if (!settings.enabled || !settings.sessionCode) {
    await updateBadge();
    return;
  }

  await sendTabs(reason);
}

setInterval(() => {
  void maybeSendTabs("interval");
}, SYNC_INTERVAL_MS);

chrome.runtime.onInstalled.addListener(() => {
  void chrome.storage.local.set({
    enabled: false,
    apiBaseUrl: DEFAULT_API_BASE_URL,
  });
  void updateBadge();
});

chrome.runtime.onStartup.addListener(() => {
  void updateBadge();
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
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

chrome.tabs.onCreated.addListener(() => void maybeSendTabs("tab-created"));
chrome.tabs.onUpdated.addListener(() => void maybeSendTabs("tab-updated"));
chrome.tabs.onRemoved.addListener(() => void maybeSendTabs("tab-removed"));
chrome.tabs.onActivated.addListener(() => void maybeSendTabs("tab-activated"));

void updateBadge();
