"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { classifyStudioWindow, inspectorPluginXml, selectStudioSession, studioLaunchDecision } = require("../electron/roblox-agent.cjs");

test("an existing Roblox Studio window is reused", () => {
  assert.equal(studioLaunchDecision({ running: true, projectName: "Elemental Realm" }), "reuse");
});

test("Roblox Studio is launched only when no session is running", () => {
  assert.equal(studioLaunchDecision({ running: false }), "launch");
});

test("Studio windows are classified as home, saved place, unsaved place, or playtest", () => {
  assert.equal(classifyStudioWindow("Roblox Studio", 1).state, "home");
  assert.deepEqual(classifyStudioWindow("Elemental Realm.rbxl - MovementAndFly.client.lua - Roblox Studio", 2), {
    processId: 2,
    windowTitle: "Elemental Realm.rbxl - MovementAndFly.client.lua - Roblox Studio",
    state: "place",
    projectName: "Elemental Realm",
    fileName: "Elemental Realm.rbxl",
    playtesting: false,
    saved: true,
  });
  assert.equal(classifyStudioWindow("Baseplate - Roblox Studio", 3).state, "unsaved");
  assert.equal(classifyStudioWindow("Elemental Realm.rbxl - Test - Roblox Studio", 4).state, "playtest");
});

test("the session manager targets the named editable project instead of the first Studio window", () => {
  const sessions = [
    classifyStudioWindow("Roblox Studio", 11),
    classifyStudioWindow("Other Game.rbxl - Roblox Studio", 12),
    classifyStudioWindow("Elemental Realm.rbxl - Roblox Studio", 13),
  ];
  assert.equal(selectStudioSession(sessions, "add a town in Elemental Realm")?.processId, 13);
});

test("generated Studio bridge does not place a raw newline inside the line counter string", () => {
  const xml = inspectorPluginXml();
  assert.match(xml, /#string\.split\(source, string\.char\(10\)\)/);
  assert.doesNotMatch(xml, /string\.gsub\(source, "\r?\n/);
});

test("generated Studio bridge supports additive placement around the latest SVANS build", () => {
  const xml = inspectorPluginXml();
  assert.match(xml, /around_latest_svans_build/);
  assert.match(xml, /bridgeVersion = 9/);
  assert.match(xml, /placeId = game\.PlaceId/);
  assert.match(xml, /command\.type == "inspect"/);
  assert.match(xml, /containerBounds\(buildFolder\)/);
});
