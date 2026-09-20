"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  compileRobloxIntent,
  isExplicitModification,
  inferProject,
  isNewProjectRequest,
  isReferenceBuildRequest,
} = require("../renderer/roblox-intent.js");

test("natural Water Castle follow-ups route as modifications", () => {
  assert.equal(isExplicitModification("Keep the current Water Castle architectural style, but upscale the overall structure substantially."), true);
  assert.equal(isExplicitModification("Increase the Elemental Realms castle footprint while preserving player-scale doors."), true);
  assert.equal(isExplicitModification("Tighten the gaps in the current Roblox build."), true);
});

test("Ice Castle creation routes locally without requiring the remote chat backend", () => {
  assert.equal(isExplicitModification("Create an Ice Castle, and a huge kingdom over water"), true);
  assert.equal(isExplicitModification("Build a storm palace with an arena"), true);
});

test("questions about the Roblox build remain conversational", () => {
  assert.equal(isExplicitModification("What upgrades did you make to the Water Castle?"), false);
  assert.equal(isExplicitModification("How does the current Roblox build validator work?"), false);
});

test("Elemental Realms is recovered as the project subject", () => {
  assert.equal(inferProject("Upscale the Water Castle for Elemental Realms"), "Elemental Realm");
});

test("ordinary create-it wording cannot hijack a saved photo blueprint", () => {
  const kingdom = "create an ice kingdom on top of a mountain surrounded by water, with buildings and the castle in the middle. use 2000 x 2000 to create it";
  assert.equal(isReferenceBuildRequest(kingdom), false);
  assert.equal(isReferenceBuildRequest("Build the uploaded multi-view reference in Elemental Realm"), true);
  assert.equal(isReferenceBuildRequest("Recreate the design from my reference pictures"), true);
});

test("new Roblox games remain new projects even while Studio is already open", () => {
  assert.equal(isNewProjectRequest("create a new Roblox game about space racing"), true);
  assert.equal(isNewProjectRequest("open Roblox Studio and create a new game about dinosaurs"), true);
  assert.equal(isNewProjectRequest("create a fire castle in Elemental Realm"), false);
});

test("structured intent separates the requested object from the destination project", () => {
  const intent = compileRobloxIntent("Create a realistic red sports car in Elemental Realm", {
    robloxActive: true,
    knownProjects: [{ name: "Elemental Realm" }],
  });
  assert.equal(intent.action, "create");
  assert.equal(intent.scope, "named-project");
  assert.equal(intent.targetProject, "Elemental Realm");
  assert.equal(intent.primarySubject, "vehicle");
  assert.deepEqual(intent.styles, ["realistic"]);
  assert.equal(intent.castleRequested, false);
  assert.ok(intent.forbiddenFallbacks.includes("castle"));
});

test("structured intent classifies characters, interfaces, behavior, and broad worlds independently", () => {
  const character = compileRobloxIntent("Add an R15 fire mentor near the current spawn", { robloxActive: true });
  assert.equal(character.primarySubject, "character");
  assert.equal(character.castleRequested, false);

  const interfaceIntent = compileRobloxIntent("Implement a functional inventory HUD in this game", { robloxActive: true });
  assert.equal(interfaceIntent.primarySubject, "interface");
  assert.ok(interfaceIntent.subjects.includes("gameplay-system"));
  assert.ok(interfaceIntent.behaviors.includes("functional"));

  const city = compileRobloxIntent("Create a futuristic city with roads in Elemental Realm", { robloxActive: true });
  assert.equal(city.broadWorldBuild, true);
  assert.equal(city.settlementRequested, true);
  assert.equal(city.castleRequested, false);
});

test("structured intent resolves short follow-ups without changing their subject", () => {
  const intent = compileRobloxIntent("Make it larger and keep the current materials", {
    robloxActive: true,
    currentProject: "Elemental Realm",
    currentSubject: "architecture",
    currentCastleRequested: true,
    currentStyles: ["fantasy", "ice"],
  });
  assert.equal(intent.action, "modify");
  assert.equal(intent.targetProject, "Elemental Realm");
  assert.equal(intent.primarySubject, "architecture");
  assert.equal(intent.resolvedFromContext, true);
  assert.equal(intent.castleRequested, true);
  assert.deepEqual(intent.styles, ["fantasy", "ice"]);
  assert.ok(intent.behaviors.includes("increase-size"));
  assert.deepEqual(intent.preservation, ["the current materials"]);
});

test("castle routing only activates for an explicit castle-family subject", () => {
  assert.equal(compileRobloxIntent("Create a fantasy castle in Elemental Realm", { robloxActive: true }).castleRequested, true);
  assert.equal(compileRobloxIntent("Create a dragon and forest in Elemental Realm", { robloxActive: true }).castleRequested, false);
});

test("ordinary non-Roblox creation requests are not hijacked by the Studio router", () => {
  const intent = compileRobloxIntent("Create a red sports car");
  assert.equal(intent.primarySubject, "vehicle");
  assert.equal(intent.related, false);
});

test("Phase 2 carries structured intent through desktop IPC and has no generic scaffold fallback", () => {
  const root = path.resolve(__dirname, "..");
  const app = fs.readFileSync(path.join(root, "renderer", "app.js"), "utf8");
  const preload = fs.readFileSync(path.join(root, "electron", "preload.cjs"), "utf8");
  const main = fs.readFileSync(path.join(root, "electron", "main.cjs"), "utf8");
  const agent = fs.readFileSync(path.join(root, "electron", "roblox-agent.cjs"), "utf8");

  assert.match(app, /compileRobloxIntent/);
  assert.match(app, /buildInsideRobloxProject\(\{[\s\S]{0,180}intent:/);
  assert.match(app, /buildRobloxGame\(\{[\s\S]{0,180}intent:/);
  assert.match(preload, /typeof request === "string"/);
  assert.match(main, /intent: request\?\.intent \|\| null/);
  assert.match(agent, /planLiveBuild\(requested, snapshot, \{ signal, intent \}\)/);
  assert.match(agent, /Do not create, substitute, or fall back to a castle/);
  assert.doesNotMatch(agent, /function fallbackSpec\(/);
  assert.doesNotMatch(agent, /proceduralFallback: true/);
});
