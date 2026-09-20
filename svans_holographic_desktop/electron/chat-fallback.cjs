"use strict";

const OFFLINE_TEXT = "SVANSAI is offline right now. Local Roblox Studio editing is still available—tell me what to build, modify, inspect, or fix in the open project. General AI conversation will return automatically when the backend reconnects.";

function isBackendUnavailable(error) {
  const status = Number(error?.status || 0);
  if ([429, 502, 503, 504].includes(status)) return true;
  return /(?:fetch failed|network|econnrefused|enotfound|timed? out|request failed \((?:429|502|503|504)\))/i.test(String(error?.message || error || ""));
}

function createChatCircuitBreaker({ retryMs = 120_000, now = () => Date.now() } = {}) {
  let offlineUntil = 0;
  return {
    shouldSkip() { return now() < offlineUntil; },
    markFailure(error) {
      if (!isBackendUnavailable(error)) return false;
      offlineUntil = now() + retryMs;
      return true;
    },
    markSuccess() { offlineUntil = 0; },
    response() {
      return { text: OFFLINE_TEXT, offline: true, localMode: "roblox", retryAfterMs: Math.max(0, offlineUntil - now()) };
    },
  };
}

module.exports = { OFFLINE_TEXT, createChatCircuitBreaker, isBackendUnavailable };
