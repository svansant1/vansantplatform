"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  PLAYER_SCALE,
  buildArch,
  buildCornerQuoins,
  buildEaveOverhang,
  buildFloorWithOpening,
  buildStaircase,
  buildWallWithOpenings,
  generateArchitecturalBuild,
  generateCastleTownKingdomBuild,
  generateTownExpansionBuild,
  planArchitecture,
  refineArchitecture,
  validateStructuralSeams,
} = require("../electron/roblox-architecture.cjs");

const root = path.resolve(__dirname, "..");

const WATER_PROMPT = "Build an explorable fantasy water castle in Roblox";

test("player scale provides Roblox-avatar clearances", () => {
  assert.ok(PLAYER_SCALE.doorwayHeight >= PLAYER_SCALE.height + 2);
  assert.ok(PLAYER_SCALE.hallwayWidth >= PLAYER_SCALE.width * 2.5);
  assert.ok(PLAYER_SCALE.ceilingClearance >= PLAYER_SCALE.height + 3);
  assert.ok(PLAYER_SCALE.stairWidth >= 6);
});

test("blueprint defines purpose-built rooms and a connected traversal graph", () => {
  const plan = planArchitecture(WATER_PROMPT);
  assert.equal(plan.style, "water");
  assert.ok(plan.spaces.length >= 8);
  assert.ok(plan.spaces.every((space) => space.purpose && space.minSize));
  assert.ok(plan.traversalEdges.length >= plan.spaces.length - 1);
  assert.equal(plan.cameraChecks.length, 5);
});

test("reusable procedural components create openings, arches, and avatar stairs", () => {
  const palette = { stone: "#aaaaaa", trim: "#eeeeee", wallMaterial: "Brick" };
  const wall = buildWallWithOpenings({ name: "Test Wall", center: [0, 6, 0], axis: "x", length: 30, height: 12, openings: [{ offset: 0, width: 7, bottom: 0, height: 9 }], palette });
  const arch = buildArch({ name: "Test Arch", center: [0, 8, 0], width: 12, height: 15, depth: 2, palette });
  const stairs = buildStaircase({ name: "Test Stair", start: [0, 1, 0], steps: 12, palette });
  assert.ok(wall.length >= 3);
  assert.ok(arch.length >= 11);
  assert.equal(stairs.filter((part) => /Step/.test(part.name)).length, 12);
  assert.ok(stairs.every((part) => part.size.every(Number.isFinite)));
});

test("masonry articulation adds tapered towers, corner quoins, and style-aware eaves", () => {
  const palette = { stone: "#aaaaaa", dark: "#222222", trim: "#eeeeee", roof: "#445566", wallMaterial: "Marble" };
  const quoins = buildCornerQuoins({ name: "Test Corner", x: 10, z: 10, baseY: 0, height: 16, palette });
  const eaves = buildEaveOverhang({ name: "Test Roof", center: [0, 20, 0], width: 30, depth: 20, palette });
  assert.equal(quoins.length, 4);
  assert.deepEqual(quoins.map((item) => item.size[0]), [3.6, 2.4, 3.6, 2.4]);
  assert.equal(eaves.length, 2);
  assert.equal(eaves[0].material, "Slate");
  assert.notEqual(eaves[0].material, "Wood");
  const castle = generateArchitecturalBuild(WATER_PROMPT);
  const names = castle.spec.buildings.flatMap((building) => building.parts).map((item) => item.name);
  assert.ok(names.some((name) => /Shaft Base$/.test(name)));
  assert.ok(names.some((name) => /Shaft Mid$/.test(name)));
  assert.ok(names.some((name) => /Keep Corner .* Quoin/.test(name)));
  assert.ok(names.includes("Keep Eave"));
});

test("upper floors leave a physical opening over the staircase", () => {
  const palette = { dark: "#222222" };
  const slabs = buildFloorWithOpening({ name: "Upper Floor", center: [0, 15, 0], width: 40, depth: 30, opening: { center: [10, 0], width: 8, depth: 16 }, palette });
  assert.equal(slabs.length, 4);
  for (const slab of slabs) {
    const coversOpeningCenterX = Math.abs(10 - slab.position[0]) < slab.size[0] / 2;
    const coversOpeningCenterZ = Math.abs(0 - slab.position[2]) < slab.size[2] / 2;
    assert.equal(coversOpeningCenterX && coversOpeningCenterZ, false, `${slab.name} covers the stairwell`);
  }
  const castle = generateArchitecturalBuild(WATER_PROMPT);
  assert.equal(castle.validation.passed, true, castle.validation.summary);
  assert.ok(castle.spec.buildings.flatMap((building) => building.parts).filter((item) => /Stairwell/.test(item.name)).length >= 6);
});

test("structural seam pass closes unintended cracks without sealing openings", () => {
  const castle = generateArchitecturalBuild(WATER_PROMPT);
  const parts = castle.spec.buildings.flatMap((building) => building.parts);
  const report = validateStructuralSeams(parts);
  assert.equal(report.passed, true);
  assert.equal(report.stairJointsTight, true);
  assert.equal(report.roofJointsTight, true);
  assert.equal(report.wallSeamKeys, 4);
  const steps = parts.filter((item) => /Keep Stair 1 to 2 Step/.test(item.name));
  for (let index = 1; index < steps.length; index += 1) {
    const separation = Math.abs(steps[index].position[2] - steps[index - 1].position[2]);
    const joinedDepth = (steps[index].size[2] + steps[index - 1].size[2]) / 2;
    assert.ok(joinedDepth > separation, "adjacent stair treads should overlap slightly");
  }
});

test("Water Castle acceptance build passes architecture and performance gates", () => {
  const build = generateArchitecturalBuild(WATER_PROMPT);
  assert.equal(build.validation.passed, true, build.validation.summary);
  assert.equal(build.validation.failed.length, 0);
  assert.ok(build.validation.partCount >= 300);
  assert.ok(build.validation.partCount <= 650);
  assert.ok(build.spec.buildings.length >= 3);
  assert.ok(build.spec.buildings.every((building) => building.parts.length >= 70));
  assert.ok(build.spec.buildings.flatMap((building) => building.parts).every((item) => item.position.every(Number.isFinite)));
});

test("Water style is expressed by geometry, not recolor alone", () => {
  const { spec } = generateArchitecturalBuild(WATER_PROMPT);
  const names = spec.buildings.flatMap((building) => building.parts).map((item) => item.name);
  assert.ok(names.filter((name) => /Flowing Dome|Water Channel|Reflecting Pool|Fountain|Tidal/.test(name)).length >= 20);
  assert.ok(names.filter((name) => /Arch|Buttress|Battlement|Balcony|Column|Window/.test(name)).length >= 80);
});

test("elemental styles produce different structural geometry", () => {
  const signatures = ["fire", "water", "earth", "wind"].map((style) => {
    const build = generateArchitecturalBuild(`Build an explorable fantasy ${style} castle in Roblox`);
    assert.equal(build.validation.passed, true, `${style}: ${build.validation.summary}`);
    return build.spec.buildings.flatMap((building) => building.parts).map((item) => `${item.name}:${item.shape}`).join("|");
  });
  assert.equal(new Set(signatures).size, 4);
});

test("refinement pass adds targeted corrective geometry", () => {
  const original = generateArchitecturalBuild(WATER_PROMPT).spec;
  const before = original.buildings.reduce((total, building) => total + building.parts.length, 0);
  const refined = refineArchitecture(planArchitecture(WATER_PROMPT, 1), original, ["traversal", "silhouette"]);
  const after = refined.buildings.reduce((total, building) => total + building.parts.length, 0);
  assert.ok(after > before);
  assert.ok(refined.buildings.flatMap((building) => building.parts).some((item) => /Refined Skyline Crown/.test(item.name)));
});

test("town follow-up generates an additive kingdom around the latest castle", () => {
  const build = generateTownExpansionBuild("add a town around the castle and surround that by water");
  assert.equal(build.validation.passed, true, build.validation.summary);
  assert.equal(build.spec.placementMode, "around_latest_svans_build");
  assert.equal(build.spec.buildings.length, 4);
  assert.ok(build.spec.buildings.every((district) => district.parts.length >= 70));
  assert.ok(build.validation.partCount >= 300 && build.validation.partCount <= 650);
  assert.equal(build.spec.terrain.filter((feature) => feature.material === "Water").length, 4);
  assert.equal(build.spec.scripts.length, 0, "an architectural expansion should not duplicate project scripts");
});

test("compound ice-castle prompt creates both the castle and surrounding town", () => {
  const build = generateCastleTownKingdomBuild("Create a huge ice castle with a whole town around it, surrounded by water");
  assert.equal(build.validation.passed, true, build.validation.summary);
  assert.equal(build.plan.kind, "compound-castle-town-kingdom");
  assert.equal(build.spec.placementMode, "camera");
  assert.equal(build.spec.buildings.length, 7);
  assert.ok(build.validation.partCount >= 800 && build.validation.partCount <= 1000);
  assert.match(build.spec.name, /Frostcrown/);
  assert.ok(build.spec.terrain.filter((feature) => feature.material === "Water").length >= 4);
  const landmass = build.spec.terrain.find((feature) => feature.name === "Continuous Kingdom Landmass");
  assert.deepEqual(landmass.size, [500, 6, 500]);
  const farthestPart = Math.max(...build.spec.buildings.flatMap((building) => building.parts).map((item) => Math.max(Math.abs(item.position[0]), Math.abs(item.position[2]))));
  assert.ok(farthestPart >= 210, "the town must occupy a kingdom-scale footprint");
});

test("2000 by 2000 mountain kingdom is generated locally at the requested scale", () => {
  const prompt = "create an ice kingdom on top of a mountain surrounded by water, with buildings and the castle in the middle. use 2000 x 2000 to create it";
  const build = generateCastleTownKingdomBuild(prompt);
  assert.equal(build.validation.passed, true, build.validation.summary);
  assert.deepEqual(build.plan.footprint, { width: 2000, depth: 2000, explicit: true });
  assert.ok(build.plan.summitY >= 100);
  assert.equal(build.spec.terrain.filter((feature) => /^Mountain Summit Tile/.test(feature.name)).length, 16);
  assert.equal(build.spec.terrain.filter((feature) => feature.material === "Water").length, 4);
  assert.ok(build.spec.terrain.some((feature) => feature.name === "Great Mountain Core"));
  const shoulders = build.spec.terrain.filter((feature) => /Mountain Shoulder$/.test(feature.name));
  assert.equal(shoulders.length, 4);
  assert.ok(shoulders.every((feature) => feature.position[1] + feature.radius <= build.plan.summitY - 5), "mountain slopes must remain beneath the playable summit");
  const landingTerraces = build.spec.parts.filter((item) => /Landing Terrace$/.test(item.name));
  assert.equal(landingTerraces.length, 4);
  assert.ok(landingTerraces.every((item) => item.position[1] > build.plan.summitY && item.canCollide !== false));
  const castleParts = build.spec.buildings.slice(0, 3).flatMap((building) => building.parts);
  assert.ok(Math.min(...castleParts.map((item) => item.position[1])) >= build.plan.summitY);
  for (const district of build.spec.buildings.slice(3)) {
    const foundations = district.parts.filter((item) => /House \d+ Foundation$/.test(item.name));
    assert.equal(foundations.length, 4);
    for (const foundation of foundations) {
      const prefix = foundation.name.replace(/ Foundation$/, "");
      const houseParts = district.parts.filter((item) => item.name.startsWith(prefix));
      assert.ok(houseParts.length >= 12);
      assert.ok(houseParts.every((item) => Math.abs(item.position[0] - foundation.position[0]) <= 25 && Math.abs(item.position[2] - foundation.position[2]) <= 25), `${prefix} must remain assembled around its foundation`);
    }
  }
  const agent = fs.readFileSync(path.join(root, "electron", "roblox-agent.cjs"), "utf8");
  assert.match(agent, /const compoundKingdom/);
});
