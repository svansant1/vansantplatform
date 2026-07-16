(function installDiagnosticRules(root) {
  const errorSignatures = [
    /upstream connect error/i,
    /remote connection failure/i,
    /this site can(?:'|’)t be reached/i,
    /server error/i,
    /service unavailable/i,
    /bad gateway/i,
    /gateway timeout/i,
    /something went wrong/i,
    /network error/i,
    /access denied/i,
    /too many requests/i,
    /checking your browser/i,
  ];

  function redactUrl(value) {
    try {
      const url = new URL(String(value || ""));
      if (!/^https?:$/.test(url.protocol)) return "";
      url.username = "";
      url.password = "";
      url.search = "";
      url.hash = "";
      return url.toString();
    } catch {
      return "";
    }
  }

  function detectVisibleError(text) {
    const safeText = String(text || "").slice(0, 100000);
    const match = errorSignatures.find((pattern) => pattern.test(safeText));
    return match ? String(safeText.match(match)?.[0] || "Recognized error message").slice(0, 300) : "";
  }

  function classifyBrowserSignals(signals) {
    if (signals.online === false) return { health: "failed", cause: "offline", confidence: 0.98 };
    if (signals.navigationError) return { health: "failed", cause: "navigation", confidence: 0.98 };
    if (signals.visibleError || signals.blankPage || Number(signals.serverErrors || 0) > 0) {
      return { health: "failed", cause: signals.visibleError ? "visible-error" : "page-request", confidence: signals.visibleError ? 0.97 : 0.9 };
    }
    if (Number(signals.requestErrors || 0) >= 3 || Number(signals.runtimeErrors || 0) >= 3) {
      return { health: "degraded", cause: "runtime-request", confidence: 0.86 };
    }
    if (signals.cookiesEnabled === false && (signals.authRedirect || signals.loginDetected)) {
      return { health: "degraded", cause: "authentication-cookie", confidence: 0.94 };
    }
    if (Number(signals.heartbeatAgeMs || 0) > 45000) {
      return { health: "degraded", cause: "page-heartbeat", confidence: 0.82 };
    }
    if (signals.authRedirect || signals.loginDetected) {
      return { health: "detected", cause: "authentication", confidence: 0.72 };
    }
    if (signals.navigationComplete && signals.readyState === "complete") {
      return { health: "healthy", cause: "verified-page-state", confidence: 0.8 };
    }
    return { health: "detected", cause: "insufficient-evidence", confidence: 0.6 };
  }

  const api = { redactUrl, detectVisibleError, classifyBrowserSignals };
  root.SVANSAIDiagnosticRules = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(globalThis);
