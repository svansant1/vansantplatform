const DEFAULT_API_BASE_URL = "https://vansant-backend.onrender.com";

const enabledInput = document.getElementById("enabled");
const deepInspectionInput = document.getElementById("deepInspection");
const sessionCodeInput = document.getElementById("sessionCode");
const apiBaseUrlInput = document.getElementById("apiBaseUrl");
const saveButton = document.getElementById("save");
const syncNowButton = document.getElementById("syncNow");
const statusText = document.getElementById("status");

function normalizeUrl(value) {
  return (value || DEFAULT_API_BASE_URL).trim().replace(/\/+$/, "");
}

function setStatus(message) {
  statusText.textContent = message;
}

async function loadSettings() {
  const settings = await chrome.storage.local.get({
    enabled: false,
    sessionCode: "",
    apiBaseUrl: DEFAULT_API_BASE_URL,
    deepInspection: false,
  });

  enabledInput.checked = Boolean(settings.enabled);
  deepInspectionInput.checked = Boolean(settings.deepInspection);
  sessionCodeInput.value = settings.sessionCode || "";
  apiBaseUrlInput.value = settings.apiBaseUrl || DEFAULT_API_BASE_URL;
  setStatus(settings.enabled ? "Sync is on." : "Sync is off.");
}

async function saveSettings() {
  const sessionCode = sessionCodeInput.value.trim().toUpperCase();
  const enabled = enabledInput.checked;
  let deepInspection = deepInspectionInput.checked;
  const apiBaseUrl = normalizeUrl(apiBaseUrlInput.value);

  if (enabled && !sessionCode) {
    enabledInput.checked = false;
    await chrome.storage.local.set({
      enabled: false,
      sessionCode: "",
      apiBaseUrl,
      deepInspection: false,
    });
    setStatus("Enter a session code before enabling sync.");
    return;
  }

  if (deepInspection && !enabled) {
    deepInspection = false;
    deepInspectionInput.checked = false;
  }

  if (deepInspection) {
    const granted = await chrome.permissions.request({ permissions: ["debugger"] });
    if (!granted) {
      deepInspection = false;
      deepInspectionInput.checked = false;
      setStatus("Deep inspection permission was not granted; standard monitoring remains available.");
    }
  }

  await chrome.storage.local.set({
    enabled,
    sessionCode,
    apiBaseUrl,
    deepInspection,
  });

  setStatus(enabled ? "Saved. Sync is on." : "Saved. Sync is off.");
  await chrome.runtime.sendMessage({ type: "settings-updated" });
}

async function syncNow() {
  await saveSettings();
  const response = await chrome.runtime.sendMessage({ type: "sync-tabs-now" });

  if (response?.ok) {
    setStatus(`Synced ${response.tabCount} tab(s).`);
  } else {
    setStatus(response?.error || "Sync did not run.");
  }
}

saveButton.addEventListener("click", () => {
  void saveSettings();
});

syncNowButton.addEventListener("click", () => {
  void syncNow();
});

sessionCodeInput.addEventListener("input", () => {
  sessionCodeInput.value = sessionCodeInput.value.toUpperCase();
});

void loadSettings();
