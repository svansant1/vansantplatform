let pageErrorCount = 0;
let resourceErrorCount = 0;
let healthTimer = 0;
let monitoringEnabled = false;
let longTaskCount = 0;
let maxEventLoopLagMs = 0;
let expectedHeartbeat = performance.now() + 1000;

chrome.storage.local.get({ enabled: false }).then((settings) => {
  monitoringEnabled = Boolean(settings.enabled);
});
chrome.storage.onChanged.addListener((changes) => {
  if (changes.enabled) monitoringEnabled = Boolean(changes.enabled.newValue);
});

function send(type, payload) {
  if (!monitoringEnabled) return;
  try {
    chrome.runtime.sendMessage({ type, payload });
  } catch {
    // Extension context may have reloaded; the next page load reconnects it.
  }
}

function findVisibleError() {
  const text = String(document.body?.innerText || "").slice(0, 100000);
  return globalThis.SVANSAIDiagnosticRules.detectVisibleError(text);
}

function collectHealth() {
  const bodyText = String(document.body?.innerText || "").trim();
  const navigation = performance.getEntriesByType("navigation")[0];
  const loadDuration = navigation && "loadEventEnd" in navigation
    ? Math.max(0, Math.round(navigation.loadEventEnd || performance.now()))
    : null;
  const passwordInput = Boolean(document.querySelector('input[type="password"]'));
  const loginForm = Boolean(document.querySelector('form[action*="login" i], form[action*="auth" i]'));
  const authPath = /\/(login|signin|sign-in|auth)(\/|$)/i.test(location.pathname);

  send("page-health", {
    observed_at: new Date().toISOString(),
    ready_state: document.readyState,
    load_duration_ms: loadDuration,
    blank_page: document.readyState === "complete" && bodyText.length < 3,
    visible_error: findVisibleError(),
    login_detected: passwordInput || loginForm,
    auth_redirect: authPath,
    online: navigator.onLine,
    cookies_enabled: navigator.cookieEnabled,
    service_worker_controlled: Boolean(navigator.serviceWorker?.controller),
    long_task_count: longTaskCount,
    max_event_loop_lag_ms: Math.round(maxEventLoopLagMs),
    error_count: pageErrorCount,
    resource_error_count: resourceErrorCount,
  });
}

function scheduleHealth() {
  clearTimeout(healthTimer);
  healthTimer = setTimeout(collectHealth, 750);
}

window.addEventListener("error", (event) => {
  if (event.target && event.target !== window) {
    resourceErrorCount += 1;
    const target = event.target;
    send("page-error", {
      resource: String(target.tagName || "resource").toLowerCase(),
      url: target.src || target.href || location.href,
      message: "Resource failed to load",
    });
  } else {
    pageErrorCount += 1;
  }
  scheduleHealth();
}, true);

window.addEventListener("message", (event) => {
  if (event.source !== window || event.data?.source !== "svansai-page-observer") return;
  pageErrorCount += 1;
  send("page-error", { message: event.data.message, url: location.href });
  scheduleHealth();
});

const observerScript = document.createElement("script");
observerScript.src = chrome.runtime.getURL("page-observer.js");
observerScript.onload = () => observerScript.remove();
(document.documentElement || document.head).appendChild(observerScript);

document.addEventListener("DOMContentLoaded", () => {
  const observer = new MutationObserver(scheduleHealth);
  if (document.body) observer.observe(document.body, { childList: true, subtree: true });
  scheduleHealth();
});
window.addEventListener("load", scheduleHealth);
try {
  const longTaskObserver = new PerformanceObserver((list) => {
    longTaskCount += list.getEntries().length;
    scheduleHealth();
  });
  longTaskObserver.observe({ type: "longtask", buffered: true });
} catch {
  // Long-task timing is not available in every browser/page.
}
setInterval(() => {
  const current = performance.now();
  maxEventLoopLagMs = Math.max(maxEventLoopLagMs, current - expectedHeartbeat);
  expectedHeartbeat = current + 1000;
}, 1000);
setInterval(collectHealth, 15000);
