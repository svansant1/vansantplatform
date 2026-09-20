"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { rankAssets, resolveObjects } = require("../electron/roblox-assets.cjs");
const assets = [
  { name: "Ice Gate", path: "ServerStorage.Assets.Ice Gate", partCount: 30, tags: "castle entrance" },
  { name: "Car", path: "ServerStorage.Assets.Car", partCount: 20 },
];
test("library ranking selects relevant inspected geometry", () => {
  assert.equal(rankAssets("castle entrance", assets)[0].name, "Ice Gate");
  assert.deepEqual(rankAssets("dragon", assets), []);
});
test("object resolution pins an exact template and rejects missing or ambiguous names", () => {
  assert.equal(resolveObjects([{ template: "Ice Gate" }], assets)[0].templatePath, assets[0].path);
  assert.throws(() => resolveObjects([{ template: "Dragon" }], assets), /not found/);
  const duplicates = [...assets, { ...assets[0], path: "Workspace.Assets.Ice Gate" }];
  assert.throws(() => resolveObjects([{ template: "Ice Gate" }], duplicates), /ambiguous/);
  assert.equal(resolveObjects([{ templatePath: assets[0].path }], duplicates)[0].templatePath, assets[0].path);
});
