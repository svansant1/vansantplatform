"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { OFFLINE_TEXT, createChatCircuitBreaker, isBackendUnavailable } = require("../electron/chat-fallback.cjs");

test("Render-style service failures activate Roblox-only fallback", () => {
  let time = 1_000;
  const breaker = createChatCircuitBreaker({ retryMs: 120_000, now: () => time });
  const error = Object.assign(new Error("SVANS request failed (503)."), { status: 503 });
  assert.equal(breaker.markFailure(error), true);
  assert.equal(breaker.shouldSkip(), true);
  assert.equal(breaker.response().text, OFFLINE_TEXT);
  assert.equal(breaker.response().localMode, "roblox");
  time += 120_001;
  assert.equal(breaker.shouldSkip(), false);
});

test("ordinary application errors do not falsely disable conversation", () => {
  const breaker = createChatCircuitBreaker();
  assert.equal(isBackendUnavailable(Object.assign(new Error("Bad request"), { status: 400 })), false);
  assert.equal(breaker.markFailure(new Error("Bad request")), false);
  assert.equal(breaker.shouldSkip(), false);
});
