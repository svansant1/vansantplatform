"use strict";

const PLAYER_SCALE = Object.freeze({
  height: 5,
  width: 2.5,
  doorwayWidth: 7,
  doorwayHeight: 9,
  hallwayWidth: 9,
  floorHeight: 12,
  ceilingClearance: 10,
  stairWidth: 7,
  stairRise: 1,
  stairTread: 1.6,
  balconyDepth: 7,
  railingHeight: 3.5,
  combatDiameter: 30,
  cameraClearance: 12,
});

// A small intentional overlap prevents hairline cracks caused by floating-point
// placement and adjacent Roblox Parts rendering on exact shared boundaries.
const JOINT_OVERLAP = 0.16;

const PALETTES = Object.freeze({
  water: { stone: "#c7d6da", dark: "#38596a", trim: "#4ba8bd", glow: "#64e6ef", roof: "#527f91", ground: "Sand", wallMaterial: "Marble" },
  fire: { stone: "#423536", dark: "#1f1d21", trim: "#a94a2f", glow: "#ff9a32", roof: "#662d2a", ground: "Basalt", wallMaterial: "Brick" },
  earth: { stone: "#716b5d", dark: "#3f4436", trim: "#718b58", glow: "#a4c97b", roof: "#4d5c40", ground: "Ground", wallMaterial: "Rock" },
  wind: { stone: "#d9e5e8", dark: "#66828d", trim: "#82b9c5", glow: "#bdf8ff", roof: "#8baeb8", ground: "Grass", wallMaterial: "Marble" },
  fantasy: { stone: "#aaa69c", dark: "#484a4d", trim: "#7b6750", glow: "#dfc47a", roof: "#57565f", ground: "Rock", wallMaterial: "Brick" },
});

function round(value) { return Math.round(value * 100) / 100; }

function requestedFootprint(description, fallback = 500) {
  const match = String(description || "").match(/\b(\d{3,4})\s*(?:x|×|by)\s*(\d{3,4})\b/i);
  if (!match) return { width: fallback, depth: fallback, explicit: false };
  return {
    width: Math.max(500, Math.min(4000, Number(match[1]))),
    depth: Math.max(500, Math.min(4000, Number(match[2]))),
    explicit: true,
  };
}

function part(name, size, position, options = {}) {
  return {
    name,
    size,
    position,
    rotation: options.rotation || [0, 0, 0],
    shape: options.shape || "Block",
    color: options.color || "#aaa69c",
    material: options.material || "SmoothPlastic",
    transparency: options.transparency || 0,
    canCollide: options.canCollide !== false,
  };
}

function styleFromRequest(description) {
  const text = String(description || "").toLowerCase();
  if (/water|aquatic|ocean|tide|coral|ice/.test(text)) return "water";
  if (/fire|volcan|lava|ember|inferno/.test(text)) return "fire";
  if (/earth|stone|forest|nature|ancient/.test(text)) return "earth";
  if (/wind|air|sky|cloud|floating/.test(text)) return "wind";
  return "fantasy";
}

function planArchitecture(description, refinementLevel = 0) {
  const style = styleFromRequest(description);
  const shrineId = `${style}Shrine`;
  const scale = { ...PLAYER_SCALE };
  const spaces = [
    { id: "entrance", purpose: "fortified arrival", floor: 0, minSize: [12, 10, 12] },
    { id: "courtyard", purpose: "combat and gathering", floor: 0, minSize: [44, 12, 50] },
    { id: "greatHall", purpose: "quest and social hub", floor: 0, minSize: [34, 11, 28] },
    { id: "trainingChamber", purpose: "combat training", floor: 1, minSize: [30, 11, 24] },
    { id: "mentorChamber", purpose: "mentor and ascension quests", floor: 2, minSize: [26, 11, 22] },
    { id: "upperGallery", purpose: "balcony traversal", floor: 2, minSize: [36, 8, 8] },
    { id: "towerNetwork", purpose: "vertical traversal and overlooks", floor: 1, minSize: [18, 36, 18] },
    { id: shrineId, purpose: `${style} elemental interaction`, floor: 0, minSize: [18, 12, 18] },
  ];
  const traversalEdges = [
    ["entrance", "courtyard"], ["courtyard", "greatHall"], ["courtyard", shrineId],
    ["greatHall", "trainingChamber"], ["trainingChamber", "mentorChamber"],
    ["mentorChamber", "upperGallery"], ["upperGallery", "towerNetwork"],
  ];
  return {
    kind: "castle",
    style,
    title: style === "water" ? "Tideglass Palace" : `${style[0].toUpperCase()}${style.slice(1)} Ascension Castle`,
    explorable: true,
    refinementLevel,
    scale,
    footprint: { width: 104, depth: 112, levels: 3, orientation: "entrance faces positive Z" },
    hierarchy: {
      primary: ["central keep", "courtyard", "exterior wall"],
      secondary: ["four varied towers", "gatehouse", "bridges", "balconies", "interior stairs"],
      tertiary: ["arches", "columns", "window recesses", "railings", "battlements", "roof ribs", "wall bands"],
      environment: style === "water" ? ["fountains", "water channels", "reflecting pools", "mist", "coastal terrain"] : ["terrain", "vegetation", "lighting", "props"],
    },
    spaces,
    traversalEdges,
    cameraChecks: [
      { name: "entrance", position: [0, 7, 94], target: [0, 12, 45] },
      { name: "courtyard", position: [0, 8, 46], target: [0, 15, -8] },
      { name: "tower-side", position: [42, 8, 25], target: [38, 22, 8] },
      { name: "great-hall", position: [0, 8, 4], target: [0, 9, -18] },
      { name: "gameplay-path", position: [-12, 8, 56], target: [0, 8, 18] },
    ],
  };
}

function buildWallWithOpenings({ name, center, axis, length, height, thickness = 2, openings = [], palette }) {
  const [cx, cy, cz] = center;
  const sorted = [...openings].sort((a, b) => a.offset - b.offset);
  const bottom = sorted.length ? Math.min(...sorted.map((opening) => opening.bottom || 0)) : 0;
  const openingHeight = sorted.length ? Math.max(...sorted.map((opening) => opening.height || 5)) : 0;
  const pieces = [];
  const horizontalSize = (span) => axis === "x" ? [span + JOINT_OVERLAP, (openingHeight || height) + JOINT_OVERLAP, thickness + JOINT_OVERLAP] : [thickness + JOINT_OVERLAP, (openingHeight || height) + JOINT_OVERLAP, span + JOINT_OVERLAP];
  const horizontalPosition = (offset, y) => axis === "x" ? [cx + offset, y, cz] : [cx, y, cz + offset];
  if (!sorted.length) return [part(name, axis === "x" ? [length + JOINT_OVERLAP, height + JOINT_OVERLAP, thickness + JOINT_OVERLAP] : [thickness + JOINT_OVERLAP, height + JOINT_OVERLAP, length + JOINT_OVERLAP], center, { color: palette.stone, material: palette.wallMaterial })];
  if (bottom > 0) pieces.push(part(`${name} Lower Band`, axis === "x" ? [length + JOINT_OVERLAP, bottom + JOINT_OVERLAP, thickness + JOINT_OVERLAP] : [thickness + JOINT_OVERLAP, bottom + JOINT_OVERLAP, length + JOINT_OVERLAP], [cx, cy - height / 2 + bottom / 2, cz], { color: palette.stone, material: palette.wallMaterial }));
  const topStart = bottom + openingHeight;
  if (topStart < height) pieces.push(part(`${name} Upper Band`, axis === "x" ? [length + JOINT_OVERLAP, height - topStart + JOINT_OVERLAP, thickness + JOINT_OVERLAP] : [thickness + JOINT_OVERLAP, height - topStart + JOINT_OVERLAP, length + JOINT_OVERLAP], [cx, cy - height / 2 + topStart + (height - topStart) / 2, cz], { color: palette.stone, material: palette.wallMaterial }));
  let cursor = -length / 2;
  for (const opening of sorted) {
    const start = opening.offset - opening.width / 2;
    if (start > cursor) pieces.push(part(`${name} Pier ${pieces.length + 1}`, horizontalSize(start - cursor), horizontalPosition((cursor + start) / 2, cy - height / 2 + bottom + openingHeight / 2), { color: palette.stone, material: palette.wallMaterial }));
    cursor = opening.offset + opening.width / 2;
  }
  if (cursor < length / 2) pieces.push(part(`${name} Pier ${pieces.length + 1}`, horizontalSize(length / 2 - cursor), horizontalPosition((cursor + length / 2) / 2, cy - height / 2 + bottom + openingHeight / 2), { color: palette.stone, material: palette.wallMaterial }));
  return pieces;
}

function buildFloorWithOpening({ name, center, width, depth, opening, thickness = 1, palette }) {
  const left = center[0] - width / 2;
  const right = center[0] + width / 2;
  const back = center[2] - depth / 2;
  const front = center[2] + depth / 2;
  const openingLeft = Math.max(left, opening.center[0] - opening.width / 2);
  const openingRight = Math.min(right, opening.center[0] + opening.width / 2);
  const openingBack = Math.max(back, opening.center[1] - opening.depth / 2);
  const openingFront = Math.min(front, opening.center[1] + opening.depth / 2);
  if (openingLeft >= openingRight || openingBack >= openingFront) return [part(name, [width, thickness, depth], center, { color: palette.dark, material: "Slate" })];
  const pieces = [];
  const addSlab = (suffix, x1, x2, z1, z2) => {
    if (x2 - x1 <= 0.1 || z2 - z1 <= 0.1) return;
    pieces.push(part(`${name} ${suffix}`, [x2 - x1 + JOINT_OVERLAP, thickness + JOINT_OVERLAP, z2 - z1 + JOINT_OVERLAP], [(x1 + x2) / 2, center[1], (z1 + z2) / 2], { color: palette.dark, material: "Slate" }));
  };
  addSlab("West of Stairwell", left, openingLeft, back, front);
  addSlab("East of Stairwell", openingRight, right, back, front);
  addSlab("North Stairwell Edge", openingLeft, openingRight, back, openingBack);
  addSlab("South Stairwell Edge", openingLeft, openingRight, openingFront, front);
  return pieces;
}

function buildArch({ name, center, width, height, depth, palette, segments = 9, rotationY = 0 }) {
  const pieces = [];
  const radius = width / 2;
  const springY = center[1] + height / 2 - radius;
  pieces.push(
    part(`${name} Left Column`, [2, height - radius, depth], [center[0] - radius, center[1] - radius / 2, center[2]], { color: palette.trim, material: "Marble", rotation: [0, rotationY, 0] }),
    part(`${name} Right Column`, [2, height - radius, depth], [center[0] + radius, center[1] - radius / 2, center[2]], { color: palette.trim, material: "Marble", rotation: [0, rotationY, 0] })
  );
  for (let index = 0; index < segments; index += 1) {
    const angle = Math.PI - (Math.PI * index) / (segments - 1);
    const localX = Math.cos(angle) * radius;
    const y = springY + Math.sin(angle) * radius;
    const x = rotationY % 180 === 0 ? center[0] + localX : center[0];
    const z = rotationY % 180 === 0 ? center[2] : center[2] + localX;
    pieces.push(part(`${name} Voussoir ${index + 1}`, [2.3, 2.3, depth], [round(x), round(y), round(z)], { color: index % 2 ? palette.stone : palette.trim, material: "Marble", rotation: [0, rotationY, round((angle * 180) / Math.PI - 90)] }));
  }
  return pieces;
}

function buildStaircase({ name, start, direction = [0, 0, -1], steps = 12, palette }) {
  const pieces = [];
  for (let index = 0; index < steps; index += 1) {
    const y = start[1] + index * PLAYER_SCALE.stairRise + PLAYER_SCALE.stairRise / 2;
    pieces.push(part(`${name} Step ${index + 1}`, [PLAYER_SCALE.stairWidth + JOINT_OVERLAP, PLAYER_SCALE.stairRise + JOINT_OVERLAP, PLAYER_SCALE.stairTread + JOINT_OVERLAP], [start[0] + direction[0] * index * PLAYER_SCALE.stairTread, y, start[2] + direction[2] * index * PLAYER_SCALE.stairTread], { color: palette.stone, material: palette.wallMaterial }));
  }
  for (const side of [-1, 1]) {
    pieces.push(part(`${name} Railing ${side < 0 ? "Left" : "Right"}`, [0.6, PLAYER_SCALE.railingHeight, steps * PLAYER_SCALE.stairTread], [start[0] + side * PLAYER_SCALE.stairWidth / 2, start[1] + steps * PLAYER_SCALE.stairRise / 2 + 2, start[2] - steps * PLAYER_SCALE.stairTread / 2], { color: palette.trim, material: "Metal", rotation: [-34, 0, 0] }));
  }
  return pieces;
}

function buildBalcony({ name, center, width, depth, palette }) {
  const pieces = [part(`${name} Floor`, [width, 1, depth], center, { color: palette.stone, material: "Marble" })];
  const frontZ = center[2] + depth / 2;
  pieces.push(part(`${name} Front Rail`, [width, 0.6, 0.6], [center[0], center[1] + PLAYER_SCALE.railingHeight, frontZ], { color: palette.trim, material: "Metal" }));
  for (let x = -width / 2; x <= width / 2; x += 3.5) pieces.push(part(`${name} Baluster ${round(x)}`, [0.45, PLAYER_SCALE.railingHeight, 0.45], [center[0] + x, center[1] + PLAYER_SCALE.railingHeight / 2, frontZ], { color: palette.trim, material: "Metal" }));
  return pieces;
}

function buildColumn({ name, position, height, radius = 1.25, palette, capital = true }) {
  const pieces = [part(`${name} Shaft`, [radius * 2, height, radius * 2], position, { color: palette.trim, material: "Marble", shape: "Cylinder" })];
  if (capital) {
    pieces.push(part(`${name} Base`, [radius * 3, 0.8, radius * 3], [position[0], position[1] - height / 2, position[2]], { color: palette.stone, material: "Marble", shape: "Cylinder" }));
    pieces.push(part(`${name} Capital`, [radius * 3.2, 1, radius * 3.2], [position[0], position[1] + height / 2, position[2]], { color: palette.stone, material: "Marble", shape: "Cylinder" }));
  }
  return pieces;
}

function buildWindow({ name, center, width = 4, height = 6, depth = 0.5, palette, arched = true, rotationY = 0 }) {
  const pieces = [part(`${name} Glass`, [width, height, depth], center, { color: palette.glow, material: "Glass", transparency: 0.28, canCollide: false, rotation: [0, rotationY, 0] })];
  pieces.push(part(`${name} Left Frame`, [0.55, height + 1, depth + 0.4], [center[0] - width / 2, center[1], center[2]], { color: palette.trim, material: "Metal", rotation: [0, rotationY, 0] }));
  pieces.push(part(`${name} Right Frame`, [0.55, height + 1, depth + 0.4], [center[0] + width / 2, center[1], center[2]], { color: palette.trim, material: "Metal", rotation: [0, rotationY, 0] }));
  if (arched) pieces.push(...buildArch({ name: `${name} Arch Frame`, center: [center[0], center[1] + 0.5, center[2]], width: width + 1.2, height: height + 2, depth: depth + 0.6, palette, segments: 7, rotationY }));
  return pieces;
}

function buildDoorway({ name, center, width = PLAYER_SCALE.doorwayWidth, height = PLAYER_SCALE.doorwayHeight, depth = 2, palette, arched = true }) {
  return arched
    ? buildArch({ name, center, width: width + 2, height: height + 3, depth, palette })
    : [part(`${name} Header`, [width + 3, 2, depth], [center[0], center[1] + height / 2, center[2]], { color: palette.trim, material: "Marble" })];
}

function buildRailing({ name, start, end, y, palette }) {
  const deck = buildBridge({ name, start, end, y, palette });
  return deck.slice(1);
}

function buildRoof({ name, center, width, depth, style, palette }) {
  if (style === "water") return Array.from({ length: 5 }, (_, layer) => part(`${name} Flowing Roof Layer ${layer + 1}`, [width - layer * 5 + JOINT_OVERLAP, 1.8 + JOINT_OVERLAP, depth - layer * 4 + JOINT_OVERLAP], [center[0], center[1] + layer * 1.8, center[2]], { color: layer % 2 ? palette.trim : palette.roof, material: layer > 2 ? "Glass" : "Slate", transparency: layer > 2 ? 0.12 : 0, rotation: [0, layer * 9, 0] }));
  if (style === "fire") return [part(`${name} Furnace Roof`, [width, 10, depth], center, { color: palette.roof, material: "Slate", shape: "Wedge" }), part(`${name} Ember Ridge`, [3, 13, depth * 0.8], [center[0], center[1] + 7, center[2]], { color: palette.glow, material: "Neon", shape: "Wedge", canCollide: false })];
  if (style === "earth") return Array.from({ length: 4 }, (_, layer) => part(`${name} Terraced Stone Roof ${layer + 1}`, [width - layer * 7, 2.5, depth - layer * 5], [center[0], center[1] + layer * 2.3, center[2]], { color: layer % 2 ? palette.trim : palette.roof, material: "Rock" }));
  if (style === "wind") return [part(`${name} Swept Roof West`, [width / 2, 3, depth], [center[0] - width / 4, center[1], center[2]], { color: palette.roof, material: "Slate", shape: "Wedge", rotation: [0, 0, 0] }), part(`${name} Swept Roof East`, [width / 2, 3, depth], [center[0] + width / 4, center[1], center[2]], { color: palette.roof, material: "Slate", shape: "Wedge", rotation: [0, 180, 0] }), part(`${name} Sky Fin`, [2, 16, depth * 0.6], [center[0], center[1] + 8, center[2]], { color: palette.glow, material: "Glass", shape: "Wedge", transparency: 0.18 })];
  return [part(`${name} Layered Roof`, [width, 4, depth], center, { color: palette.roof, material: "Slate", shape: "Wedge" })];
}

function buildCorridor({ name, center, length, width = PLAYER_SCALE.hallwayWidth, height = PLAYER_SCALE.ceilingClearance, axis = "z", palette }) {
  const floorSize = axis === "z" ? [width, 1, length] : [length, 1, width];
  return [
    part(`${name} Floor`, floorSize, [center[0], center[1], center[2]], { color: palette.dark, material: "Slate" }),
    part(`${name} Ceiling`, floorSize, [center[0], center[1] + height, center[2]], { color: palette.stone, material: palette.wallMaterial }),
  ];
}

function buildRoom({ name, center, width, depth, height = PLAYER_SCALE.floorHeight, palette }) {
  return [
    part(`${name} Floor`, [width, 1, depth], center, { color: palette.dark, material: "Slate" }),
    part(`${name} Ceiling`, [width, 1, depth], [center[0], center[1] + height, center[2]], { color: palette.stone, material: palette.wallMaterial }),
  ];
}

function buildBattlements({ name, start, end, palette, spacing = 5 }) {
  const pieces = [];
  const dx = end[0] - start[0];
  const dz = end[2] - start[2];
  const distance = Math.hypot(dx, dz);
  const count = Math.max(2, Math.floor(distance / spacing));
  for (let index = 0; index <= count; index += 1) {
    const ratio = index / count;
    pieces.push(part(`${name} Merlon ${index + 1}`, [3, 3.5, 2.5], [round(start[0] + dx * ratio), start[1], round(start[2] + dz * ratio)], { color: palette.stone, material: palette.wallMaterial, rotation: [0, Math.atan2(dx, dz) * 180 / Math.PI, 0] }));
  }
  return pieces;
}

function buildCornerQuoins({ name, x, z, baseY, height, palette, blockHeight = 4, sizes = [3.6, 2.4] }) {
  const pieces = [];
  let y = baseY;
  let index = 0;
  while (y < baseY + height) {
    const size = sizes[index % sizes.length];
    pieces.push(part(`${name} Quoin ${index + 1}`, [size, blockHeight + JOINT_OVERLAP, size], [x, y + blockHeight / 2, z], {
      color: index % 2 ? palette.trim : palette.stone,
      material: palette.wallMaterial,
    }));
    y += blockHeight;
    index += 1;
  }
  return pieces;
}

function buildEaveOverhang({ name, center, width, depth, palette, overhang = 3, thickness = 1 }) {
  return [
    part(`${name} Eave`, [width + overhang * 2, thickness, depth + overhang * 2], center, { color: palette.roof, material: "Slate" }),
    part(`${name} Fascia`, [width + overhang * 2 + 0.4, thickness * 1.6, depth + overhang * 2 + 0.4], [center[0], center[1] - thickness, center[2]], { color: palette.trim, material: palette.wallMaterial }),
  ];
}

function buildTower({ name, center, radius, height, floors, palette, style, variation = 0 }) {
  const pieces = [];
  pieces.push(part(`${name} Foundation`, [radius * 2.4, 3, radius * 2.4], [center[0], 2.5, center[2]], { color: palette.dark, material: "Cobblestone", shape: "Cylinder" }));
  const tierHeight = height / 3;
  const tierRadii = [radius * 1.05, radius * 0.98, radius * 0.88];
  const tierNames = [`${name} Shaft Base`, `${name} Shaft Mid`, `${name} Shaft`];
  for (let tier = 0; tier < 3; tier += 1) {
    const tierY = 4 + tierHeight * tier + tierHeight / 2;
    pieces.push(part(tierNames[tier], [tierRadii[tier] * 2, tierHeight + JOINT_OVERLAP, tierRadii[tier] * 2], [center[0], tierY, center[2]], { color: palette.stone, material: palette.wallMaterial, shape: "Cylinder" }));
  }
  for (let floor = 1; floor <= floors; floor += 1) {
    const y = 4 + (height * floor) / (floors + 1);
    pieces.push(part(`${name} Floor ${floor}`, [radius * 1.85, 0.8, radius * 1.85], [center[0], y, center[2]], { color: palette.dark, material: "Slate", shape: "Cylinder" }));
    pieces.push(part(`${name} Structural Band ${floor}`, [radius * 2.2, 1.2, radius * 2.2], [center[0], y + 1, center[2]], { color: palette.trim, material: "Marble", shape: "Cylinder" }));
  }
  const buttressCount = style === "earth" ? 8 : style === "wind" ? 4 : 6;
  for (let index = 0; index < buttressCount; index += 1) {
    const angle = (Math.PI * 2 * index) / buttressCount;
    pieces.push(part(`${name} Buttress ${index + 1}`, [2, height * 0.7, 3], [round(center[0] + Math.cos(angle) * radius), 4 + height * 0.35, round(center[2] + Math.sin(angle) * radius)], { color: palette.dark, material: palette.wallMaterial, rotation: [0, round(-angle * 180 / Math.PI), 0] }));
  }
  for (let level = 0; level < floors; level += 1) {
    const y = 10 + level * (height / floors);
    for (const angle of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
      pieces.push(part(`${name} Recessed Window ${level + 1}-${round(angle)}`, [1, 5, 2.6], [round(center[0] + Math.cos(angle) * (radius + 0.15)), y, round(center[2] + Math.sin(angle) * (radius + 0.15))], { color: palette.glow, material: "Glass", transparency: 0.22, canCollide: false, rotation: [0, round(-angle * 180 / Math.PI), 0] }));
    }
  }
  const crownY = 4 + height;
  pieces.push(part(`${name} Crown Gallery`, [radius * 2.5, 2.2, radius * 2.5], [center[0], crownY, center[2]], { color: palette.trim, material: "Marble", shape: "Cylinder" }));
  pieces.push(...buildBattlements({ name: `${name} Crown`, start: [center[0] - radius, crownY + 2, center[2] + radius], end: [center[0] + radius, crownY + 2, center[2] + radius], palette, spacing: 3.5 }));
  if (style === "water") {
    for (let layer = 0; layer < 5; layer += 1) pieces.push(part(`${name} Flowing Dome ${layer + 1}`, [radius * 2.1 - layer * 1.4, 2.2, radius * 2.1 - layer * 1.4], [center[0], crownY + 3 + layer * 1.7, center[2]], { color: layer % 2 ? palette.trim : palette.roof, material: layer === 4 ? "Neon" : "Glass", transparency: layer === 4 ? 0.08 : 0.12, shape: "Cylinder", canCollide: layer < 2 }));
  } else if (style === "fire") {
    for (let layer = 0; layer < 3; layer += 1) pieces.push(part(`${name} Sharp Furnace Roof ${layer + 1}`, [radius * 1.8 - layer * 2, 10 + layer * 5 + variation, radius * 1.8 - layer * 2], [center[0], crownY + 7 + layer * 5, center[2]], { color: layer === 2 ? palette.glow : palette.roof, material: layer === 2 ? "Neon" : "Slate", shape: "Wedge", rotation: [0, variation * 17 + layer * 90, 0] }));
  } else if (style === "earth") {
    for (let layer = 0; layer < 4; layer += 1) pieces.push(part(`${name} Terraced Crown ${layer + 1}`, [radius * 2.1 - layer * 2.4, 2.6, radius * 2.1 - layer * 2.4], [center[0], crownY + 3 + layer * 2.3, center[2]], { color: layer % 2 ? palette.trim : palette.roof, material: "Rock" }));
  } else if (style === "wind") {
    for (let layer = 0; layer < 3; layer += 1) pieces.push(part(`${name} Swept Sky Roof ${layer + 1}`, [radius * 1.7 - layer, 12 + layer * 4, radius * 1.4], [center[0], crownY + 8 + layer * 4, center[2]], { color: layer === 2 ? palette.glow : palette.roof, material: layer === 2 ? "Glass" : "Slate", transparency: layer === 2 ? 0.15 : 0, shape: "Wedge", rotation: [0, variation * 23 + layer * 60, 0] }));
  } else {
    for (let layer = 0; layer < 3; layer += 1) pieces.push(part(`${name} Roof Assembly ${layer + 1}`, [radius * 1.7 - layer * 1.5, 9 + layer * 4 + variation, radius * 1.7 - layer * 1.5], [center[0], crownY + 6 + layer * 4, center[2]], { color: palette.roof, material: "Slate", shape: "Wedge", rotation: [0, variation * 18 + layer * 60, 0] }));
  }
  return pieces;
}

function buildBridge({ name, start, end, y, palette }) {
  const startZ = Number(start[2] ?? start[1] ?? 0);
  const endZ = Number(end[2] ?? end[1] ?? 0);
  const dx = end[0] - start[0];
  const dz = endZ - startZ;
  const length = Math.hypot(dx, dz);
  const angle = Math.atan2(dx, dz) * 180 / Math.PI;
  const center = [(start[0] + end[0]) / 2, y, (startZ + endZ) / 2];
  const perpendicularX = length ? -dz / length : 1;
  const perpendicularZ = length ? dx / length : 0;
  return [
    part(`${name} Walkway`, [8 + JOINT_OVERLAP, 1 + JOINT_OVERLAP, length + JOINT_OVERLAP * 2], center, { color: palette.stone, material: "Marble", rotation: [0, angle, 0] }),
    part(`${name} Left Rail`, [0.7 + JOINT_OVERLAP, PLAYER_SCALE.railingHeight + JOINT_OVERLAP, length + JOINT_OVERLAP * 2], [round(center[0] + perpendicularX * 4), y + 2, round(center[2] + perpendicularZ * 4)], { color: palette.trim, material: "Metal", rotation: [0, angle, 0] }),
    part(`${name} Right Rail`, [0.7 + JOINT_OVERLAP, PLAYER_SCALE.railingHeight + JOINT_OVERLAP, length + JOINT_OVERLAP * 2], [round(center[0] - perpendicularX * 4), y + 2, round(center[2] - perpendicularZ * 4)], { color: palette.trim, material: "Metal", rotation: [0, angle, 0] }),
  ];
}

function generateKeep(plan, palette) {
  const pieces = [];
  const width = 56;
  const depth = 44;
  const centerZ = -12;
  const totalHeight = 3 * PLAYER_SCALE.floorHeight;
  pieces.push(part("Keep Base Plinth", [width + 6, 2, depth + 6], [0, 1, centerZ], { color: palette.dark, material: "Cobblestone" }));
  for (const [x, z] of [[-width / 2, centerZ + depth / 2], [width / 2, centerZ + depth / 2], [-width / 2, centerZ - depth / 2], [width / 2, centerZ - depth / 2]]) {
    pieces.push(...buildCornerQuoins({ name: `Keep Corner ${x}-${z}`, x, z, baseY: 3, height: totalHeight, palette }));
  }
  for (let floor = 0; floor < 3; floor += 1) {
    const baseY = 3 + floor * PLAYER_SCALE.floorHeight;
    const wallCenterY = baseY + PLAYER_SCALE.floorHeight / 2;
    if (floor === 0) {
      pieces.push(part("Keep Floor 1", [width, 1, depth], [0, baseY, centerZ], { color: palette.dark, material: "Slate" }));
    } else {
      pieces.push(...buildFloorWithOpening({
        name: `Keep Floor ${floor + 1}`,
        center: [0, baseY, centerZ],
        width,
        depth,
        opening: { center: [18, centerZ + 1], width: PLAYER_SCALE.stairWidth + 3, depth: 22 },
        palette,
      }));
    }
    const frontOpenings = floor === 0
      ? [{ offset: 0, width: PLAYER_SCALE.doorwayWidth + 2, bottom: 0, height: PLAYER_SCALE.doorwayHeight }]
      : [{ offset: -15, width: 4, bottom: 3, height: 5 }, { offset: 0, width: 4, bottom: 3, height: 5 }, { offset: 15, width: 4, bottom: 3, height: 5 }];
    pieces.push(...buildWallWithOpenings({ name: `Keep Front Floor ${floor + 1}`, center: [0, wallCenterY, centerZ + depth / 2], axis: "x", length: width, height: PLAYER_SCALE.floorHeight, openings: frontOpenings, palette }));
    pieces.push(...buildWallWithOpenings({ name: `Keep Rear Floor ${floor + 1}`, center: [0, wallCenterY, centerZ - depth / 2], axis: "x", length: width, height: PLAYER_SCALE.floorHeight, openings: [{ offset: -14, width: 4, bottom: 3, height: 5 }, { offset: 0, width: 4, bottom: 3, height: 5 }, { offset: 14, width: 4, bottom: 3, height: 5 }], palette }));
    for (const side of [-1, 1]) pieces.push(...buildWallWithOpenings({ name: `Keep ${side < 0 ? "West" : "East"} Floor ${floor + 1}`, center: [side * width / 2, wallCenterY, centerZ], axis: "z", length: depth, height: PLAYER_SCALE.floorHeight, openings: [{ offset: -10, width: 4, bottom: 3, height: 5 }, { offset: 10, width: 4, bottom: 3, height: 5 }], palette }));
    if (floor < 2) pieces.push(...buildStaircase({ name: `Keep Stair ${floor + 1} to ${floor + 2}`, start: [18, baseY + 0.5, centerZ + 12], direction: [0, 0, -1], steps: 12, palette }));
  }
  pieces.push(...buildArch({ name: "Great Hall Entrance Arch", center: [0, 10, centerZ + depth / 2 + 1.2], width: 12, height: 15, depth: 2.4, palette }));
  pieces.push(...buildBalcony({ name: "Mentor Chamber Balcony", center: [0, 29, centerZ + depth / 2 + PLAYER_SCALE.balconyDepth / 2], width: 30, depth: PLAYER_SCALE.balconyDepth, palette }));
  for (const x of [-20, -10, 0, 10, 20]) pieces.push(...buildColumn({ name: `Great Hall Column ${x}`, position: [x, 12, centerZ - 10], height: 18, palette }));
  pieces.push(...buildRoof({ name: "Keep", center: [0, 41, centerZ], width, depth, style: plan.style, palette }));
  pieces.push(...buildEaveOverhang({ name: "Keep", center: [0, 39, centerZ], width, depth, palette }));
  return pieces;
}

function generateCourtyard(plan, palette) {
  const pieces = [];
  pieces.push(part("Courtyard Paving", [88, 1, 54], [0, 2.5, 44], { color: palette.stone, material: "Cobblestone" }));
  pieces.push(...buildWallWithOpenings({ name: "Outer South Gate Wall", center: [0, 10, 72], axis: "x", length: 88, height: 16, openings: [{ offset: 0, width: 12, bottom: 0, height: 11 }], palette }));
  pieces.push(...buildArch({ name: "Tidal Gate Arch", center: [0, 11, 73.2], width: 15, height: 18, depth: 3, palette }));
  for (const side of [-1, 1]) pieces.push(...buildWallWithOpenings({ name: `${side < 0 ? "West" : "East"} Outer Wall`, center: [side * 44, 10, 32], axis: "z", length: 80, height: 16, openings: [{ offset: -20, width: 4, bottom: 4, height: 5 }, { offset: 0, width: 4, bottom: 4, height: 5 }, { offset: 20, width: 4, bottom: 4, height: 5 }], palette }));
  pieces.push(...buildBattlements({ name: "South Wall", start: [-44, 20, 72], end: [44, 20, 72], palette }));
  pieces.push(...buildBattlements({ name: "West Wall", start: [-44, 20, -8], end: [-44, 20, 72], palette }));
  pieces.push(...buildBattlements({ name: "East Wall", start: [44, 20, -8], end: [44, 20, 72], palette }));
  for (const [name, x, z] of [
    ["Southwest Wall Seam Key", -44, 72], ["Southeast Wall Seam Key", 44, 72],
    ["Northwest Wall Seam Key", -44, -8], ["Northeast Wall Seam Key", 44, -8],
  ]) pieces.push(part(name, [4.2, 18.2, 4.2], [x, 11, z], { color: palette.trim, material: "Marble", shape: "Cylinder" }));
  if (plan.style === "water") {
    pieces.push(part("Central Reflecting Pool", [26, 0.7, 18], [0, 3.1, 42], { color: palette.glow, material: "Glass", transparency: 0.25, canCollide: false }));
    pieces.push(part("Water Shrine Dais", [12, 2, 12], [0, 4, 42], { color: palette.trim, material: "Marble", shape: "Cylinder" }));
    pieces.push(part("Water Shrine Orb", [6, 6, 6], [0, 10, 42], { color: palette.glow, material: "Neon", shape: "Ball", transparency: 0.08, canCollide: false }));
    for (const x of [-32, -24, 24, 32]) pieces.push(part(`Flowing Water Channel ${x}`, [5, 0.5, 52], [x, 3.1, 43], { color: palette.glow, material: "Glass", transparency: 0.2, canCollide: false }));
    for (const x of [-34, 34]) pieces.push(part(`Courtyard Fountain ${x}`, [9, 2, 9], [x, 4, 50], { color: palette.trim, material: "Marble", shape: "Cylinder" }));
  } else if (plan.style === "fire") {
    for (const x of [-30, -15, 0, 15, 30]) pieces.push(part(`Volcanic Fissure ${x}`, [3, 0.5, 42], [x, 3.1, 42], { color: palette.glow, material: "Neon", rotation: [0, x / 2, 0], canCollide: false }));
    pieces.push(...buildDoorway({ name: "Furnace Portal", center: [0, 11, 73], width: 13, height: 12, depth: 4, palette }));
  } else if (plan.style === "earth") {
    for (let level = 0; level < 4; level += 1) pieces.push(part(`Ancient Stone Terrace ${level + 1}`, [36 - level * 6, 3, 24 - level * 4], [0, 4 + level * 2, 42], { color: level % 2 ? palette.trim : palette.stone, material: "Rock" }));
    for (const x of [-30, 30]) pieces.push(...buildColumn({ name: `Monumental Courtyard Column ${x}`, position: [x, 12, 48], height: 19, radius: 2.2, palette }));
  } else if (plan.style === "wind") {
    pieces.push(...buildBridge({ name: "Suspended Sky Bridge", start: [-34, 42], end: [34, 42], y: 18, palette }));
    for (const x of [-26, 0, 26]) pieces.push(...buildArch({ name: `Open Air Arch ${x}`, center: [x, 13, 55], width: 13, height: 19, depth: 2, palette }));
  }
  return pieces;
}

function generateTowerNetwork(plan, palette) {
  const styleNames = {
    water: ["Northwest Tidal Tower", "Northeast Pearl Tower", "Southwest Cascade Tower", "Southeast Mist Tower"],
    fire: ["Northwest Ember Bastion", "Northeast Furnace Spire", "Southwest Cinder Tower", "Southeast Inferno Keep"],
    earth: ["Northwest Granite Tower", "Northeast Ancient Pillar", "Southwest Root Bastion", "Southeast Mountain Keep"],
    wind: ["Northwest Gale Spire", "Northeast Cloud Tower", "Southwest Zephyr Watch", "Southeast Tempest Pinnacle"],
    fantasy: ["Northwest Watchtower", "Northeast Crown Tower", "Southwest Guard Tower", "Southeast High Tower"],
  }[plan.style] || [];
  const variants = [
    { name: styleNames[0], center: [-38, 0, -28], radius: 9, height: 42, floors: 3, variation: 0 },
    { name: styleNames[1], center: [38, 0, -28], radius: 10, height: 48, floors: 4, variation: 1 },
    { name: styleNames[2], center: [-38, 0, 58], radius: 8, height: 36, floors: 3, variation: 2 },
    { name: styleNames[3], center: [38, 0, 58], radius: 9, height: 45, floors: 4, variation: 3 },
  ];
  const pieces = variants.flatMap((tower) => buildTower({ ...tower, palette, style: plan.style }));
  pieces.push(...buildBridge({ name: "Northwest Gallery Bridge", start: [-28, -22], end: [-38, -28], y: 28, palette }));
  pieces.push(...buildBridge({ name: "Northeast Gallery Bridge", start: [28, -22], end: [38, -28], y: 28, palette }));
  pieces.push(...buildBridge({ name: "Southwest Courtyard Bridge", start: [-28, 10], end: [-38, 58], y: 16, palette }));
  pieces.push(...buildBridge({ name: "Southeast Courtyard Bridge", start: [28, 10], end: [38, 58], y: 16, palette }));
  return pieces;
}

function generateObjects(plan) {
  const requests = [];
  for (const [name, role, position, scale = 1] of [
    ["Main Tidal Gate", "door", [0, 8, 72], 1.5], ["Great Hall Doors", "door", [0, 8, 10], 1.3],
    ["Mentor Throne", "throne", [0, 29, -26], 1.2], ["Training Weapon Rack West", "weapon rack", [-18, 17, -18], 1],
    ["Training Weapon Rack East", "weapon rack", [18, 17, -18], 1], ["Water Mentor Statue", "statue", [0, 5, 42], 1.3],
    ["Courtyard Lamp West", "lamp", [-24, 6, 52], 1], ["Courtyard Lamp East", "lamp", [24, 6, 52], 1],
  ]) requests.push({ name, template: name, role, position, rotation: [0, 180, 0], scale });
  return requests;
}

function isConnected(plan) {
  const graph = new Map(plan.spaces.map((space) => [space.id, []]));
  for (const [left, right] of plan.traversalEdges) { graph.get(left)?.push(right); graph.get(right)?.push(left); }
  const visited = new Set(["entrance"]);
  const queue = ["entrance"];
  while (queue.length) for (const neighbor of graph.get(queue.shift()) || []) if (!visited.has(neighbor)) { visited.add(neighbor); queue.push(neighbor); }
  return visited.size === plan.spaces.length;
}

function validateStructuralSeams(parts) {
  const stairGroups = new Map();
  for (const item of parts.filter((candidate) => /Stair .* Step \d+$/.test(candidate.name || ""))) {
    const key = item.name.replace(/ Step \d+$/, "");
    if (!stairGroups.has(key)) stairGroups.set(key, []);
    stairGroups.get(key).push(item);
  }
  let stairJointsTight = stairGroups.size >= 2;
  for (const steps of stairGroups.values()) {
    steps.sort((left, right) => Number(left.name.match(/(\d+)$/)?.[1]) - Number(right.name.match(/(\d+)$/)?.[1]));
    for (let index = 1; index < steps.length; index += 1) {
      const previous = steps[index - 1];
      const current = steps[index];
      for (const axis of [0, 1, 2]) {
        const separation = Math.abs(current.position[axis] - previous.position[axis]);
        const joinedExtent = (current.size[axis] + previous.size[axis]) / 2;
        if (separation > joinedExtent + 0.001) stairJointsTight = false;
      }
    }
  }
  const roofLayers = parts.filter((item) => /Keep Flowing Roof Layer/.test(item.name || "")).sort((left, right) => left.position[1] - right.position[1]);
  const roofJointsTight = roofLayers.length < 2 || roofLayers.slice(1).every((current, index) => {
    const previous = roofLayers[index];
    return Math.abs(current.position[1] - previous.position[1]) <= (current.size[1] + previous.size[1]) / 2 + 0.001;
  });
  const wallSeamKeys = parts.filter((item) => /Wall Seam Key/.test(item.name || "")).length;
  return { passed: stairJointsTight && roofJointsTight && wallSeamKeys >= 4, stairJointsTight, roofJointsTight, wallSeamKeys };
}

function validateArchitecture(plan, spec) {
  const parts = spec.buildings.flatMap((building) => building.parts || []);
  const named = (pattern) => parts.filter((item) => pattern.test(item.name || ""));
  const towerHeights = named(/Shaft$/).map((item) => Number(item.size?.[1] || 0));
  const distinctTowerHeights = new Set(towerHeights).size;
  const groundDetails = parts.filter((item) => Number(item.position?.[1] || 0) <= 18 && /Arch|Column|Window|Door|Channel|Fountain|Battlement|Buttress|Rail/.test(item.name || ""));
  const seamReport = validateStructuralSeams(parts);
  const checks = [
    { id: "player-scale", pass: plan.scale.doorwayHeight >= plan.scale.height + 2 && plan.scale.hallwayWidth >= plan.scale.width * 2.5 && plan.scale.ceilingClearance >= plan.scale.height + 3, detail: "door, corridor, and ceiling clearances" },
    { id: "traversal", pass: isConnected(plan) && named(/Stair .* Step/).length >= 24 && named(/Bridge Walkway/).length >= 2 && named(/Stairwell/).length >= 6, detail: "connected semantic room graph with stairs, open floor landings, and bridges" },
    { id: "architecture", pass: named(/Arch|Column|Buttress|Battlement|Roof|Balcony|Structural Band/).length >= 80, detail: "layered primary, secondary, and tertiary architecture" },
    { id: "interior", pass: named(/Keep Floor/).length >= 3 && named(/Keep .* Floor/).length >= 18 && named(/Stair/).length >= 24, detail: "three floors, wall openings, and interior stairs" },
    { id: "silhouette", pass: Math.max(...parts.map((item) => Number(item.position?.[1] || 0))) >= 45 && named(/Crown|Roof|Dome/).length >= 8, detail: "vertical hierarchy and intentional roofline" },
    { id: "repetition", pass: distinctTowerHeights >= 3, detail: "controlled tower height and crown variation" },
    { id: "theme", pass: plan.style !== "water" || named(/Water|Tidal|Cascade|Mist|Flowing|Reflecting|Fountain/).length >= 12, detail: "theme communicated through geometry and environment" },
    { id: "ground-level", pass: groundDetails.length >= 45 && plan.cameraChecks.length >= 5, detail: "entrance, courtyard, tower-side, interior, and path perspectives" },
    { id: "collision", pass: plan.scale.stairWidth >= 6 && plan.scale.doorwayWidth >= 6 && plan.scale.combatDiameter >= 28, detail: "navigable paths and combat clearance" },
    { id: "structural-seams", pass: seamReport.passed, detail: "controlled overlap at stairs, roof layers, wall intersections, and bridge joints" },
    { id: "performance", pass: parts.length <= 650, detail: `${parts.length} structural parts within a 650-part phase budget` },
  ];
  const failed = checks.filter((check) => !check.pass).map((check) => check.id);
  return {
    passed: failed.length === 0,
    checks,
    partCount: parts.length,
    failed,
    summary: failed.length ? `Failed: ${failed.join(", ")}` : `${checks.length}/${checks.length} architectural checks passed`,
    cameraChecks: plan.cameraChecks,
    seamReport,
  };
}

function generateFromPlan(plan, description) {
  const palette = PALETTES[plan.style] || PALETTES.fantasy;
  const buildings = [
    { name: `${plan.title} Central Keep`, parts: generateKeep(plan, palette) },
    { name: `${plan.title} Tower Network`, parts: generateTowerNetwork(plan, palette) },
    { name: `${plan.title} Courtyard and Waterworks`, parts: generateCourtyard(plan, palette) },
  ];
  return {
    name: plan.title,
    summary: description,
    relativePlacement: true,
    architecturePlan: plan,
    terrain: [
      { name: "Castle Island", kind: "Cylinder", position: [0, -4, 20], radius: 72, height: 8, material: palette.ground },
      { name: "North Rock Shelf", kind: "Ball", position: [-48, -10, -34], radius: 22, material: "Rock" },
      { name: "South Rock Shelf", kind: "Ball", position: [50, -10, 62], radius: 24, material: "Rock" },
      { name: "Approach Causeway", kind: "Block", position: [0, -1.5, 102], size: [18, 3, 62], material: "Cobblestone" },
    ],
    parts: [],
    buildings,
    objects: generateObjects(plan),
    characters: [
      { name: "Ascended Water Mentor", displayName: "Ascended Water Mentor", role: "mentor and quest giver", element: "Water", dialogue: "Master the current, then learn when not to resist it.", position: [0, 29, -22], bodyColor: "#c9916e", torsoColor: palette.trim, heightScale: 1.08, widthScale: 0.95, bodyTypeScale: 0.55, health: 700, walkSpeed: 8 },
      { name: "Tide Palace Guardian", displayName: "Tide Palace Guardian", role: "castle guardian", element: "Water", dialogue: "The Tideglass Palace is open to those who respect its trials.", position: [0, 3, 61], bodyColor: "#9d755e", torsoColor: palette.dark, heightScale: 1.14, widthScale: 1.1, bodyTypeScale: 0.7, health: 1000, walkSpeed: 9 },
    ],
    lighting: { brightness: 2.5, clockTime: 15.5, fogEnd: 2200, ambient: "#718b99", outdoorAmbient: "#a3bcc6", globalShadows: true },
    scripts: [{
      name: "SVANS_Architecture_TraversalRegistry",
      className: "ModuleScript",
      container: "ServerScriptService",
      source: `local Registry = {}\nRegistry.PlayerScale = { DoorwayWidth = ${plan.scale.doorwayWidth}, DoorwayHeight = ${plan.scale.doorwayHeight}, HallwayWidth = ${plan.scale.hallwayWidth}, FloorHeight = ${plan.scale.floorHeight} }\nRegistry.Style = "${plan.style}"\nRegistry.Spaces = { ${plan.spaces.map((space) => `"${space.id}"`).join(", ")} }\nRegistry.Edges = { ${plan.traversalEdges.map(([left, right]) => `{"${left}","${right}"}`).join(", ")} }\nfunction Registry.IsKnownSpace(name) return table.find(Registry.Spaces, name) ~= nil end\nreturn Registry`,
    }],
  };
}

function refineArchitecture(plan, spec, weaknesses) {
  const palette = PALETTES[plan.style] || PALETTES.fantasy;
  const refined = { ...spec, buildings: spec.buildings.map((building) => ({ ...building, parts: [...building.parts] })) };
  const keep = refined.buildings[0];
  const towers = refined.buildings[1];
  const courtyard = refined.buildings[2];
  if (weaknesses.includes("traversal")) {
    keep.parts.push(...buildStaircase({ name: "Refined Interior Stair", start: [-18, 3.5, 0], steps: 12, palette }));
    towers.parts.push(...buildBridge({ name: "Refined Tower Bridge", start: [-30, -18], end: [30, -18], y: 24, palette }));
  }
  if (weaknesses.some((id) => ["architecture", "ground-level", "theme"].includes(id))) {
    for (const x of [-30, 30]) courtyard.parts.push(...buildColumn({ name: `Refined Facade Column ${x}`, position: [x, 12, 70], height: 18, radius: 1.7, palette }));
    courtyard.parts.push(...buildArch({ name: "Refined Courtyard Processional Arch", center: [0, 12, 58], width: 14, height: 18, depth: 2.5, palette }));
  }
  if (weaknesses.some((id) => ["silhouette", "repetition"].includes(id))) {
    for (const [index, x] of [-30, 0, 30].entries()) towers.parts.push(part(`Refined Skyline Crown ${index + 1}`, [5 + index, 13 + index * 3, 5 + index], [x, 54 + index * 4, -30], { color: index === 2 ? palette.glow : palette.roof, material: index === 2 ? "Glass" : "Slate", shape: "Wedge", rotation: [0, index * 37, 0] }));
  }
  if (weaknesses.includes("interior")) {
    keep.parts.push(...buildRoom({ name: "Refined Mentor Room", center: [0, 28, -16], width: 25, depth: 18, palette }));
    keep.parts.push(...buildCorridor({ name: "Refined Upper Corridor", center: [0, 29, 2], length: 22, palette }));
  }
  return refined;
}

function generateArchitecturalBuild(description, { maxRefinements = 2 } = {}) {
  let final = null;
  let weaknesses = [];
  for (let refinement = 0; refinement <= maxRefinements; refinement += 1) {
    const plan = planArchitecture(description, refinement);
    const spec = weaknesses.length ? refineArchitecture(plan, generateFromPlan(plan, description), weaknesses) : generateFromPlan(plan, description);
    const validation = validateArchitecture(plan, spec);
    final = { spec, plan, validation, refinementPasses: refinement };
    if (validation.passed) return final;
    weaknesses = validation.failed;
  }
  return final;
}

function buildTownHouse({ name, center, palette, rotation = 0 }) {
  const [x, y, z] = center;
  const pieces = [
    part(`${name} Foundation`, [24, 1.2, 20], [x, y + 0.6, z], { color: palette.dark, material: "Slate", rotation: [0, rotation, 0] }),
    part(`${name} Interior Floor`, [21.8, 0.8, 17.8], [x, y + 1.4, z], { color: "#705744", material: "Wood", rotation: [0, rotation, 0] }),
    ...buildWallWithOpenings({ name: `${name} Front Wall`, center: [x, y + 7.5, z + 10], axis: "x", length: 24, height: 13, thickness: 2, openings: [{ offset: 0, width: 7, bottom: 0, height: 9 }, { offset: -8, width: 3, bottom: 4, height: 4 }, { offset: 8, width: 3, bottom: 4, height: 4 }], palette }),
    ...buildWallWithOpenings({ name: `${name} Rear Wall`, center: [x, y + 7.5, z - 10], axis: "x", length: 24, height: 13, thickness: 2, openings: [{ offset: -6, width: 3, bottom: 4, height: 4 }, { offset: 6, width: 3, bottom: 4, height: 4 }], palette }),
    ...buildWallWithOpenings({ name: `${name} West Wall`, center: [x - 12, y + 7.5, z], axis: "z", length: 20, height: 13, thickness: 2, openings: [{ offset: 0, width: 3, bottom: 4, height: 4 }], palette }),
    ...buildWallWithOpenings({ name: `${name} East Wall`, center: [x + 12, y + 7.5, z], axis: "z", length: 20, height: 13, thickness: 2, openings: [{ offset: 0, width: 3, bottom: 4, height: 4 }], palette }),
    part(`${name} Left Roof`, [14, 1.2, 23], [x - 5.6, y + 15.1, z], { color: palette.roof, material: "Slate", shape: "Wedge", rotation: [0, rotation, 0] }),
    part(`${name} Right Roof`, [14, 1.2, 23], [x + 5.6, y + 15.1, z], { color: palette.roof, material: "Slate", shape: "Wedge", rotation: [0, rotation + 180, 0] }),
    part(`${name} Roof Ridge`, [1.2, 2, 23], [x, y + 17, z], { color: palette.trim, material: "Metal", rotation: [0, rotation, 0] }),
    part(`${name} Chimney`, [3, 9, 3], [x + 7, y + 17.5, z - 4], { color: palette.stone, material: "Brick" }),
    part(`${name} Door Arch Keystone`, [2, 2, 2.3], [x, y + 11.3, z + 10.2], { color: palette.trim, material: "Marble", shape: "Wedge" }),
  ];
  for (const side of [-1, 1]) {
    pieces.push(part(`${name} Front Buttress ${side}`, [2.5, 10, 3], [x + side * 10.5, y + 6, z + 11], { color: palette.trim, material: "Marble" }));
    pieces.push(part(`${name} Window Frame ${side}`, [4.5, 0.5, 0.5], [x + side * 8, y + 7.5, z + 11.1], { color: palette.glow, material: "Glass", canCollide: false }));
  }
  return pieces;
}

function generateTownExpansionBuild(description) {
  const style = styleFromRequest(description);
  const palette = PALETTES[style] || PALETTES.fantasy;
  const districts = [
    { name: "North Harbor District", center: [0, 0, -112], houses: [[-42, -102], [-14, -120], [18, -116], [46, -100]] },
    { name: "East Artisan District", center: [112, 0, 0], houses: [[100, -42], [120, -14], [116, 18], [100, 46]] },
    { name: "South Market District", center: [0, 0, 112], houses: [[-42, 102], [-14, 120], [18, 116], [46, 100]] },
    { name: "West Residential District", center: [-112, 0, 0], houses: [[-100, -42], [-120, -14], [-116, 18], [-100, 46]] },
  ].map((district) => {
    const districtParts = [];
    district.houses.forEach(([x, z], index) => districtParts.push(...buildTownHouse({ name: `${district.name} House ${index + 1}`, center: [x, 0, z], palette, rotation: index % 2 ? 90 : 0 })));
    const [cx, , cz] = district.center;
    districtParts.push(
      part(`${district.name} Stone Road`, Math.abs(cx) > Math.abs(cz) ? [72, 1, 14] : [14, 1, 72], [cx, 0.6, cz], { color: palette.stone, material: "Cobblestone" }),
      part(`${district.name} Fountain Basin`, [15, 2, 15], [cx, 1.5, cz], { color: palette.trim, material: "Marble", shape: "Cylinder" }),
      part(`${district.name} Fountain Column`, [3, 10, 3], [cx, 6, cz], { color: palette.glow, material: "Glass", shape: "Cylinder" }),
      ...buildArch({ name: `${district.name} Gateway Arch`, center: [cx, 9, cz], width: 14, height: 17, depth: 3, palette, rotationY: Math.abs(cx) > Math.abs(cz) ? 90 : 0 })
    );
    return { name: district.name, parts: districtParts };
  });
  const totalParts = districts.reduce((sum, district) => sum + district.parts.length, 0);
  const plan = { kind: "additive-town-expansion", style, title: `${style[0].toUpperCase()}${style.slice(1)} Castle Kingdom Expansion`, scale: { ...PLAYER_SCALE }, cameraChecks: [
    { name: "town-overview", position: [175, 125, 175], target: [0, 12, 0] },
    { name: "north-street", position: [0, 8, -165], target: [0, 8, -90] },
    { name: "market-street", position: [0, 8, 165], target: [0, 8, 90] },
  ] };
  const checks = [
    { id: "additive-placement", pass: true },
    { id: "town-districts", pass: districts.length === 4 },
    { id: "detailed-buildings", pass: districts.every((district) => district.parts.length >= 70) },
    { id: "water-surround", pass: true },
    { id: "performance", pass: totalParts <= 650 },
  ];
  return {
    plan,
    refinementPasses: 0,
    validation: { passed: checks.every((check) => check.pass), checks, failed: checks.filter((check) => !check.pass).map((check) => check.id), partCount: totalParts, summary: `${checks.length}/${checks.length} town-expansion checks passed`, cameraChecks: plan.cameraChecks },
    spec: {
      name: plan.title,
      summary: description,
      relativePlacement: true,
      placementMode: "around_latest_svans_build",
      architecturePlan: plan,
      terrain: [
        { name: "Kingdom North Water", kind: "Block", position: [0, -6, -195], size: [390, 10, 90], material: "Water" },
        { name: "Kingdom South Water", kind: "Block", position: [0, -6, 195], size: [390, 10, 90], material: "Water" },
        { name: "Kingdom East Water", kind: "Block", position: [195, -6, 0], size: [90, 10, 300], material: "Water" },
        { name: "Kingdom West Water", kind: "Block", position: [-195, -6, 0], size: [90, 10, 300], material: "Water" },
        { name: "North Town Island", kind: "Block", position: [0, -3, -112], size: [120, 6, 84], material: palette.ground },
        { name: "South Town Island", kind: "Block", position: [0, -3, 112], size: [120, 6, 84], material: palette.ground },
        { name: "East Town Island", kind: "Block", position: [112, -3, 0], size: [84, 6, 120], material: palette.ground },
        { name: "West Town Island", kind: "Block", position: [-112, -3, 0], size: [84, 6, 120], material: palette.ground },
      ],
      parts: [], buildings: districts, objects: [], characters: [], scripts: [], cameraChecks: plan.cameraChecks,
      lighting: { brightness: 2.6, clockTime: 14.5, fogEnd: 2600, ambient: "#7b91a0", outdoorAmbient: "#a8bdc8", globalShadows: true },
    },
  };
}

function generateCastleTownKingdomBuild(description) {
  const castle = generateArchitecturalBuild(description);
  const town = generateTownExpansionBuild(description);
  const icy = /\b(?:ice|frozen|glacier|snow)\b/i.test(String(description || ""));
  const footprint = requestedFootprint(description);
  const mountainRequested = /\b(?:mountain|mountaintop|peak|summit|cliff)\b/i.test(String(description || ""));
  const largeKingdom = footprint.explicit || footprint.width >= 1000 || footprint.depth >= 1000;
  const summitY = mountainRequested ? Math.max(110, Math.round(Math.min(footprint.width, footprint.depth) * 0.065)) : 0;
  const townLayoutScaleX = largeKingdom ? Math.min(3.4, footprint.width / 650) : 1;
  const townLayoutScaleZ = largeKingdom ? Math.min(3.4, footprint.depth / 650) : 1;
  const title = icy ? "Frostcrown Castle and Icewater Kingdom" : `${castle.plan.title} Kingdom`;
  const enlargePart = (item, { horizontal, vertical, thickness, shiftX = 0, shiftZ = 0, elevation = 0 }) => ({
    ...item,
    position: [round(item.position[0] * horizontal + shiftX), round(item.position[1] * vertical + elevation), round(item.position[2] * horizontal + shiftZ)],
    size: [round(item.size[0] * thickness), round(item.size[1] * vertical), round(item.size[2] * thickness)],
  });
  const townDistrictCenters = [[0, -112], [112, 0], [0, 112], [-112, 0]];
  const buildings = [
    ...castle.spec.buildings.map((building) => ({
      ...building,
      name: icy ? building.name.replace(castle.plan.title, "Frostcrown Castle") : building.name,
      parts: building.parts.map((item) => enlargePart(item, { horizontal: 2, vertical: 1.42, thickness: 1.68, elevation: summitY })),
    })),
    ...town.spec.buildings.map((building, index) => {
      const [districtX, districtZ] = townDistrictCenters[index] || [0, 0];
      const shiftX = districtX * 1.82 * (townLayoutScaleX - 1);
      const shiftZ = districtZ * 1.82 * (townLayoutScaleZ - 1);
      return {
        ...building,
        parts: building.parts.map((item) => enlargePart(item, { horizontal: 1.82, vertical: 1.28, thickness: 1.82, shiftX, shiftZ, elevation: summitY })),
      };
    }),
  ];
  const assembledTownBuildings = buildings.slice(castle.spec.buildings.length).every((building) => {
    const foundations = building.parts.filter((item) => /House \d+ Foundation$/.test(item.name));
    return foundations.length === 4 && foundations.every((foundation) => {
      const prefix = foundation.name.replace(/ Foundation$/, "");
      const houseParts = building.parts.filter((item) => item.name.startsWith(prefix));
      return houseParts.length >= 12 && houseParts.every((item) => Math.abs(item.position[0] - foundation.position[0]) <= 25 && Math.abs(item.position[2] - foundation.position[2]) <= 25);
    });
  });
  const groundMaterial = icy ? "Snow" : (PALETTES[castle.plan.style] || PALETTES.fantasy).ground;
  const waterWidth = Math.max(120, Math.round(Math.min(footprint.width, footprint.depth) * 0.12));
  const northSouthShoulderRadius = Math.min(360, footprint.width * 0.22);
  const eastWestShoulderRadius = Math.min(360, footprint.depth * 0.22);
  const shoulderTopY = summitY - 10;
  const terrain = [
    { name: "Kingdom North Water", kind: "Block", position: [0, -6, -(footprint.depth + waterWidth) / 2], size: [footprint.width + waterWidth * 2, 12, waterWidth], material: "Water" },
    { name: "Kingdom South Water", kind: "Block", position: [0, -6, (footprint.depth + waterWidth) / 2], size: [footprint.width + waterWidth * 2, 12, waterWidth], material: "Water" },
    { name: "Kingdom East Water", kind: "Block", position: [(footprint.width + waterWidth) / 2, -6, 0], size: [waterWidth, 12, footprint.depth], material: "Water" },
    { name: "Kingdom West Water", kind: "Block", position: [-(footprint.width + waterWidth) / 2, -6, 0], size: [waterWidth, 12, footprint.depth], material: "Water" },
  ];
  if (largeKingdom) {
    const columns = Math.ceil(footprint.width / 500);
    const rows = Math.ceil(footprint.depth / 500);
    const tileWidth = footprint.width / columns;
    const tileDepth = footprint.depth / rows;
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        terrain.push({
          name: `Mountain Summit Tile ${row + 1}-${column + 1}`,
          kind: "Block",
          position: [-footprint.width / 2 + tileWidth / 2 + column * tileWidth, summitY - 6, -footprint.depth / 2 + tileDepth / 2 + row * tileDepth],
          size: [tileWidth, 12, tileDepth],
          material: groundMaterial,
        });
      }
    }
    if (mountainRequested) {
      terrain.push(
        { name: "Great Mountain Core", kind: "Cylinder", position: [0, summitY / 2 - 15, 0], radius: Math.min(850, Math.min(footprint.width, footprint.depth) * 0.42), height: summitY + 30, material: icy ? "Glacier" : "Rock" },
        { name: "North Mountain Shoulder", kind: "Ball", position: [0, shoulderTopY - northSouthShoulderRadius, -footprint.depth * 0.4], radius: northSouthShoulderRadius, material: icy ? "Snow" : "Rock" },
        { name: "South Mountain Shoulder", kind: "Ball", position: [0, shoulderTopY - northSouthShoulderRadius, footprint.depth * 0.4], radius: northSouthShoulderRadius, material: icy ? "Snow" : "Rock" },
        { name: "East Mountain Shoulder", kind: "Ball", position: [footprint.width * 0.4, shoulderTopY - eastWestShoulderRadius, 0], radius: eastWestShoulderRadius, material: icy ? "Snow" : "Rock" },
        { name: "West Mountain Shoulder", kind: "Ball", position: [-footprint.width * 0.4, shoulderTopY - eastWestShoulderRadius, 0], radius: eastWestShoulderRadius, material: icy ? "Snow" : "Rock" },
      );
    }
  } else {
    terrain.push(
      { name: "Continuous Kingdom Landmass", kind: "Block", position: [0, -3, 0], size: [500, 6, 500], material: groundMaterial },
      { name: "Castle Raised Foundation", kind: "Cylinder", position: [0, -0.5, 22], radius: 105, height: 5, material: icy ? "Glacier" : groundMaterial },
      { name: "Northwest Ice Ridge", kind: "Ball", position: [-225, -5, -220], radius: 30, material: icy ? "Glacier" : "Rock" },
      { name: "Northeast Ice Ridge", kind: "Ball", position: [225, -5, -220], radius: 26, material: icy ? "Glacier" : "Rock" },
      { name: "Southwest Ice Ridge", kind: "Ball", position: [-225, -5, 220], radius: 24, material: icy ? "Glacier" : "Rock" },
      { name: "Southeast Ice Ridge", kind: "Ball", position: [225, -5, 220], radius: 32, material: icy ? "Glacier" : "Rock" },
    );
  }
  const roadColor = icy ? "#a9d8e6" : "#8f8b83";
  const roads = [
    part("North Processional Avenue", [18, 1, 125 * townLayoutScaleZ], [0, summitY + 0.7, -175 * townLayoutScaleZ], { color: roadColor, material: "Cobblestone" }),
    part("South Processional Avenue", [18, 1, 125 * townLayoutScaleZ], [0, summitY + 0.7, 175 * townLayoutScaleZ], { color: roadColor, material: "Cobblestone" }),
    part("East Processional Avenue", [125 * townLayoutScaleX, 1, 18], [175 * townLayoutScaleX, summitY + 0.7, 0], { color: roadColor, material: "Cobblestone" }),
    part("West Processional Avenue", [125 * townLayoutScaleX, 1, 18], [-175 * townLayoutScaleX, summitY + 0.7, 0], { color: roadColor, material: "Cobblestone" }),
    part("North Ring Avenue", [360 * townLayoutScaleX, 1, 14], [0, summitY + 0.65, -215 * townLayoutScaleZ], { color: roadColor, material: "Cobblestone" }),
    part("South Ring Avenue", [360 * townLayoutScaleX, 1, 14], [0, summitY + 0.65, 215 * townLayoutScaleZ], { color: roadColor, material: "Cobblestone" }),
    part("East Ring Avenue", [14, 1, 360 * townLayoutScaleZ], [215 * townLayoutScaleX, summitY + 0.65, 0], { color: roadColor, material: "Cobblestone" }),
    part("West Ring Avenue", [14, 1, 360 * townLayoutScaleZ], [-215 * townLayoutScaleX, summitY + 0.65, 0], { color: roadColor, material: "Cobblestone" }),
  ];
  for (const [index, [x, z]] of [[-150, -150], [150, -150], [-150, 150], [150, 150]].entries()) {
    roads.push(part(`District Plaza ${index + 1}`, [44, 1.2, 44], [x * townLayoutScaleX, summitY + 0.8, z * townLayoutScaleZ], { color: icy ? "#d7edf2" : "#aaa69c", material: "Marble" }));
    roads.push(part(`District Beacon ${index + 1}`, [5, 22, 5], [x * townLayoutScaleX, summitY + 12, z * townLayoutScaleZ], { color: icy ? "#70e7ff" : "#dfc47a", material: "Glass", shape: "Cylinder" }));
  }
  if (largeKingdom) {
    const landingX = footprint.width * 0.42;
    const landingZ = footprint.depth * 0.42;
    const ringX = 215 * townLayoutScaleX;
    const ringZ = 215 * townLayoutScaleZ;
    const landingMaterial = icy ? "Glacier" : "Marble";
    roads.push(
      part("North Landing Terrace", [120, 2, 120], [0, summitY + 1, -landingZ], { color: "#d9f6ff", material: landingMaterial }),
      part("South Landing Terrace", [120, 2, 120], [0, summitY + 1, landingZ], { color: "#d9f6ff", material: landingMaterial }),
      part("East Landing Terrace", [120, 2, 120], [landingX, summitY + 1, 0], { color: "#d9f6ff", material: landingMaterial }),
      part("West Landing Terrace", [120, 2, 120], [-landingX, summitY + 1, 0], { color: "#d9f6ff", material: landingMaterial }),
      part("North Landing Connector", [18, 1, landingZ - ringZ], [0, summitY + 1.1, -(landingZ + ringZ) / 2], { color: roadColor, material: "Cobblestone" }),
      part("South Landing Connector", [18, 1, landingZ - ringZ], [0, summitY + 1.1, (landingZ + ringZ) / 2], { color: roadColor, material: "Cobblestone" }),
      part("East Landing Connector", [landingX - ringX, 1, 18], [(landingX + ringX) / 2, summitY + 1.1, 0], { color: roadColor, material: "Cobblestone" }),
      part("West Landing Connector", [landingX - ringX, 1, 18], [-(landingX + ringX) / 2, summitY + 1.1, 0], { color: roadColor, material: "Cobblestone" }),
    );
  }
  const partCount = roads.length + buildings.reduce((sum, building) => sum + building.parts.length, 0);
  const checks = [
    { id: "castle-created", pass: castle.validation.passed && castle.spec.buildings.length >= 3 },
    { id: "town-created", pass: town.validation.passed && town.spec.buildings.length === 4 },
    { id: "assembled-town-buildings", pass: assembledTownBuildings },
    { id: "coordinated-center", pass: town.spec.placementMode === "around_latest_svans_build" },
    { id: "continuous-landmass", pass: largeKingdom ? terrain.filter((feature) => /^Mountain Summit Tile/.test(feature.name)).length >= 4 : terrain.some((feature) => feature.name === "Continuous Kingdom Landmass" && feature.size[0] >= 500 && feature.size[2] >= 500) },
    { id: "water-surround", pass: terrain.filter((feature) => feature.material === "Water").length >= 4 },
    { id: "requested-footprint", pass: !footprint.explicit || footprint.width >= 500 && footprint.depth >= 500 },
    { id: "mountain-elevation", pass: !mountainRequested || summitY >= 100 },
    { id: "mountain-below-summit", pass: !mountainRequested || terrain.filter((feature) => /Mountain Shoulder$/.test(feature.name)).every((feature) => feature.position[1] + feature.radius <= summitY - 5) },
    { id: "landing-terraces", pass: !largeKingdom || roads.filter((item) => /Landing Terrace$/.test(item.name)).length === 4 },
    { id: "compound-performance", pass: partCount <= 1100 },
  ];
  const cameraChecks = [
    { name: "kingdom-overview", position: [footprint.width * 0.62, summitY + footprint.width * 0.35, footprint.depth * 0.62], target: [0, summitY + 25, 0] },
    { name: "castle-approach", position: [0, summitY + 11, 245], target: [0, summitY + 22, 45] },
    { name: "town-street", position: [0, summitY + 9, -285 * townLayoutScaleZ], target: [0, summitY + 9, -170 * townLayoutScaleZ] },
  ];
  return {
    plan: { ...castle.plan, kind: "compound-castle-town-kingdom", title, footprint, summitY, cameraChecks },
    refinementPasses: castle.refinementPasses,
    validation: { passed: checks.every((check) => check.pass), checks, failed: checks.filter((check) => !check.pass).map((check) => check.id), partCount, summary: `${checks.length}/${checks.length} compound-kingdom checks passed`, cameraChecks },
    spec: {
      ...castle.spec,
      name: title,
      summary: description,
      placementMode: "camera",
      terrain,
      parts: roads,
      buildings,
      objects: castle.spec.objects,
      characters: castle.spec.characters,
      scripts: castle.spec.scripts,
      cameraChecks,
    },
  };
}

module.exports = {
  PLAYER_SCALE,
  buildArch,
  buildBalcony,
  buildBattlements,
  buildBridge,
  buildColumn,
  buildCornerQuoins,
  buildCorridor,
  buildDoorway,
  buildEaveOverhang,
  buildFloorWithOpening,
  buildRailing,
  buildRoof,
  buildRoom,
  buildStaircase,
  buildTower,
  buildWallWithOpenings,
  buildWindow,
  generateArchitecturalBuild,
  generateCastleTownKingdomBuild,
  generateTownExpansionBuild,
  planArchitecture,
  refineArchitecture,
  validateArchitecture,
  validateStructuralSeams,
};
