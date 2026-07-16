import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const rules = require("../browser_extension/diagnostic-rules.js");

test("redacts credentials, queries, and fragments", () => {
  assert.equal(
    rules.redactUrl("https://user:pass@example.com/path?token=secret#private"),
    "https://example.com/path",
  );
});

test("detects the upstream error that previously produced a false healthy result", () => {
  assert.equal(
    rules.detectVisibleError("upstream connect error or disconnect/reset before headers"),
    "upstream connect error",
  );
});

test("classifies navigation and server failures as failed", () => {
  assert.equal(rules.classifyBrowserSignals({ navigationError: "net::ERR_FAILED" }).health, "failed");
  assert.equal(rules.classifyBrowserSignals({ serverErrors: 1 }).health, "failed");
});

test("does not call an observed login page healthy", () => {
  assert.equal(
    rules.classifyBrowserSignals({ navigationComplete: true, readyState: "complete", loginDetected: true }).health,
    "detected",
  );
});

test("requires completed navigation and ready state for basic page health", () => {
  assert.equal(
    rules.classifyBrowserSignals({ navigationComplete: true, readyState: "complete" }).health,
    "healthy",
  );
  assert.equal(rules.classifyBrowserSignals({ navigationComplete: true }).health, "detected");
});

test("detects offline, cookie-auth, and frozen-heartbeat scenarios", () => {
  assert.equal(rules.classifyBrowserSignals({ online: false }).health, "failed");
  assert.equal(
    rules.classifyBrowserSignals({ cookiesEnabled: false, loginDetected: true }).cause,
    "authentication-cookie",
  );
  assert.equal(rules.classifyBrowserSignals({ heartbeatAgeMs: 60000 }).cause, "page-heartbeat");
});
