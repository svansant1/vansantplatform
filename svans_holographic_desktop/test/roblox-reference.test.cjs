"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

test("multi-view uploader requires four sides and a top view with optional interior", () => {
  const html = fs.readFileSync(path.join(root, "renderer", "index.html"), "utf8");
  for (const role of ["front", "back", "left", "right", "top", "interior"]) assert.match(html, new RegExp(`data-reference-role="${role}"`));
  assert.match(html, /Multi-View Roblox Reference/);
});

test("Elemental Realms full-game requests use the local Game Director manifest", () => {
  const agent = fs.readFileSync(path.join(root, "electron", "roblox-agent.cjs"), "utf8");
  assert.match(agent, /proceduralElementalFullGameSpec/);
  assert.match(agent, /SVANS_Game_CombatService/);
  assert.match(agent, /SVANS_Game_QuestService/);
  assert.match(agent, /SVANS_Game_HUDController/);
  assert.match(agent, /fullGameRequested/);
  assert.match(agent, /allowScriptUpdates: true/);
  assert.match(agent, /bridgeVersion = 9/);
  assert.match(agent, /playable-vertical-slice-built/);
  assert.match(agent, /lastSelectedRobloxProject/);
});

test("reference images are analyzed locally into a labeled visual blueprint", () => {
  const main = fs.readFileSync(path.join(root, "electron", "main.cjs"), "utf8");
  assert.match(main, /roblox:analyzeReferences/);
  assert.match(main, /REFERENCE VIEW:/);
  assert.match(main, /input_image/);
  assert.match(main, /front", "back", "left", "right", "top/);
  assert.match(main, /SVANS READY PHOTO CONSTRUCTION SPEC/);
  assert.match(main, /readyToBuild: true/);
  assert.match(main, /referencePlanMetrics/);
  assert.match(main, /will not mark an incomplete plan ready/);
});

test("photo-derived Roblox plans use the dedicated non-generic planning route", () => {
  const agent = fs.readFileSync(path.join(root, "electron", "roblox-agent.cjs"), "utf8");
  assert.match(agent, /SVANS MULTI-VIEW REFERENCE BLUEPRINT/);
  assert.match(agent, /Do not replace it with a generic castle template/);
  assert.match(agent, /photo-derived parts \(minimum 180\)/);
  assert.match(agent, /compact tuples/);
  assert.match(agent, /repeat groups/);
  assert.match(agent, /expanded into real individual Parts/);
  assert.match(agent, /preplannedReference: true/);
  assert.match(agent, /readyMarker/);
  assert.match(agent, /No generic placeholder or unrelated fallback was created/);
  const main = fs.readFileSync(path.join(root, "electron", "main.cjs"), "utf8");
  assert.match(main, /robloxPlanningCompletion/);
  assert.match(main, /localOpenAiBuildCompletion/);
  assert.match(main, /validRobloxPlanText/);
  assert.match(main, /conversation text instead of a Roblox construction plan/);
  assert.match(main, /combinedSignal\(options\.signal, 8_000\)/);
});
