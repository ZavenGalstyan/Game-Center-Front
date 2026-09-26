/**
 * Farm Life — the starting farm's handcrafted layout (spec: "large
 * handcrafted / semi-procedural countryside region with clearly designed
 * areas", "do NOT make an infinite world").
 *
 * This is the single source of truth for where everything sits: field,
 * farmhouse, barn, coop, pond, well, fences, and the boundary treeline that
 * rings the playable core. The render/*.js drawing functions read these
 * constants to place top-down sprites; engine/collision.js resolves player
 * movement against the collider list built here. Positions are in world
 * units (1 unit = 1 tile = the same grid the 2D renderer draws in pixels-
 * per-unit).
 */

export const FIELD_ORIGIN = { x: 1, z: 2 };
export const FIELD_WIDTH = 10; // tiles, X
export const FIELD_DEPTH = 6; // tiles, Z
export const TILE_SIZE = 1;

export function fieldTileCenter(col, row) {
  return {
    x: FIELD_ORIGIN.x + col * TILE_SIZE + TILE_SIZE / 2,
    z: FIELD_ORIGIN.z + row * TILE_SIZE + TILE_SIZE / 2,
  };
}

export const FARMHOUSE = { minX: -8.5, maxX: -3.5, minZ: -7.5, maxZ: -3.5, doorZ: -3.5, doorX: -6 };
export const STORAGE_SHED = { minX: -8.5, maxX: -6.5, minZ: -2.5, maxZ: -0.8 };
export const BARN = { minX: 8, maxX: 12, minZ: -7, maxZ: -3.2 };
export const COOP = { minX: 6.2, maxX: 8.4, minZ: -2.6, maxZ: -0.6 };
export const COOP_PEN = { minX: 5.4, maxX: 9.2, minZ: -3.4, maxZ: 0.4, gateX: [6.8, 7.6], gateSide: "south" };
export const SHIPPING_BOX = { x: -4.6, z: -1.6 };
export const SEED_STAND = { x: -0.6, z: 0.4 };
export const WELL = { x: -3.2, z: -0.4, r: 0.55 };
export const POND = { x: -5, z: 5, r: 2 };
export const MAILBOX = { x: -1.4, z: -9.2 };
export const SIGNPOST = { x: 0.4, z: -9.2 };
export const WINDMILL = { x: -19, z: 13 };

export const FIELD_FENCE = {
  minX: FIELD_ORIGIN.x - 0.6,
  maxX: FIELD_ORIGIN.x + FIELD_WIDTH + 0.6,
  minZ: FIELD_ORIGIN.z - 0.6,
  maxZ: FIELD_ORIGIN.z + FIELD_DEPTH + 0.6,
  gate: { side: "south", from: FIELD_ORIGIN.x + 3.5, to: FIELD_ORIGIN.x + 5.5 },
};

export const PLAYER_SPAWN = { x: -3, z: 1.6, yaw: 0 };

// --- Boundary treeline -----------------------------------------------------
// Rings the handcrafted play area so the world reads as a real (if compact)
// countryside plot rather than a bounded box — the trees are both real
// scenery AND the actual collision boundary, never an invisible wall.
function mulberry32(seed) {
  let a = seed;
  return function rand() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Tight on purpose: sized to hug the handcrafted content (farmhouse, barn,
// coop, field, pond) with a modest grass margin, not the empty "big lawn"
// a much larger radius produced — every part of the playable area should be
// within sight of something designed, per the spec's "must feel alive"
// requirement.
export const BOUNDARY_RADIUS_X = 16;
export const BOUNDARY_RADIUS_Z = 13;
export const WORLD_CENTER = { x: 3, z: 0 };

export function buildBoundaryTrees() {
  const rand = mulberry32(1337);
  const trees = [];
  const count = 46;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + rand() * 0.12;
    const jitter = 0.85 + rand() * 0.3;
    const x = WORLD_CENTER.x + Math.cos(a) * BOUNDARY_RADIUS_X * jitter;
    const z = WORLD_CENTER.z + Math.sin(a) * BOUNDARY_RADIUS_Z * jitter;
    trees.push({ x, z, r: 0.55 + rand() * 0.25, variant: i % 3, scale: 0.9 + rand() * 0.4, id: `bt${i}` });
  }
  return trees;
}

// --- Scatter decoration (bushes, rocks, wildflower clumps) -----------------
// Purely visual — no colliders — placed in the yard/meadow between the
// buildings so the farm reads as "alive" rather than empty grass (spec's
// "starting farm environment" list). Kept clear of the field, paths and
// building footprints.
function insideAnyBox(x, z, boxes, pad = 0.6) {
  return boxes.some((b) => x > b.minX - pad && x < b.maxX + pad && z > b.minZ - pad && z < b.maxZ + pad);
}

export function buildScatterDecor() {
  const rand = mulberry32(4242);
  const avoid = [FARMHOUSE, STORAGE_SHED, BARN, COOP, COOP_PEN, FIELD_FENCE];
  const bushes = [];
  const rocks = [];
  const flowers = [];
  let guard = 0;
  while (bushes.length < 20 && guard++ < 1200) {
    const x = WORLD_CENTER.x + (rand() * 2 - 1) * (BOUNDARY_RADIUS_X - 2);
    const z = WORLD_CENTER.z + (rand() * 2 - 1) * (BOUNDARY_RADIUS_Z - 2);
    if (insideAnyBox(x, z, avoid, 1.1)) continue;
    if (Math.hypot(x - POND.x, z - POND.z) < POND.r + 1.4) continue;
    bushes.push({ x, z, scale: 0.7 + rand() * 0.5, id: `bu${bushes.length}` });
  }
  guard = 0;
  while (rocks.length < 14 && guard++ < 1200) {
    const x = WORLD_CENTER.x + (rand() * 2 - 1) * (BOUNDARY_RADIUS_X - 2);
    const z = WORLD_CENTER.z + (rand() * 2 - 1) * (BOUNDARY_RADIUS_Z - 2);
    if (insideAnyBox(x, z, avoid, 1.0)) continue;
    if (Math.hypot(x - POND.x, z - POND.z) < POND.r + 1.2) continue;
    rocks.push({ x, z, scale: 0.5 + rand() * 0.6, rot: rand() * Math.PI, id: `ro${rocks.length}` });
  }
  guard = 0;
  while (flowers.length < 40 && guard++ < 1600) {
    const x = WORLD_CENTER.x + (rand() * 2 - 1) * (BOUNDARY_RADIUS_X - 2);
    const z = WORLD_CENTER.z + (rand() * 2 - 1) * (BOUNDARY_RADIUS_Z - 2);
    if (insideAnyBox(x, z, avoid, 0.7)) continue;
    if (Math.hypot(x - POND.x, z - POND.z) < POND.r + 0.8) continue;
    flowers.push({ x, z, hue: rand(), scale: 0.7 + rand() * 0.6, id: `fl${flowers.length}` });
  }
  const grassTufts = [];
  guard = 0;
  while (grassTufts.length < 340 && guard++ < 4000) {
    const x = WORLD_CENTER.x + (rand() * 2 - 1) * (BOUNDARY_RADIUS_X - 1.5);
    const z = WORLD_CENTER.z + (rand() * 2 - 1) * (BOUNDARY_RADIUS_Z - 1.5);
    if (insideAnyBox(x, z, avoid, 0.5)) continue;
    if (Math.hypot(x - POND.x, z - POND.z) < POND.r + 0.6) continue;
    grassTufts.push({ x, z, s: 0.6 + rand() * 0.7, r: rand() * Math.PI, id: `gt${grassTufts.length}` });
  }
  return { bushes, rocks, flowers, grassTufts };
}

export function buildStaticColliders() {
  const colliders = [];
  const box = (b) => colliders.push({ type: "box", minX: b.minX, maxX: b.maxX, minZ: b.minZ, maxZ: b.maxZ });
  box(FARMHOUSE);
  box(STORAGE_SHED);
  box(BARN);
  box(COOP);
  box(SHIPPING_BOX_COLLIDER());
  box(SEED_STAND_COLLIDER());

  colliders.push({ type: "circle", x: WELL.x, z: WELL.z, r: WELL.r });
  colliders.push({ type: "circle", x: POND.x, z: POND.z, r: POND.r });
  colliders.push({ type: "circle", x: MAILBOX.x, z: MAILBOX.z, r: 0.3 });
  colliders.push({ type: "circle", x: SIGNPOST.x, z: SIGNPOST.z, r: 0.25 });

  // Field perimeter fence, split into 4 walls with a gate gap on the south wall.
  const f = FIELD_FENCE;
  const wallThickness = 0.18;
  colliders.push({ type: "box", minX: f.minX, maxX: f.maxX, minZ: f.minZ - wallThickness, maxZ: f.minZ }); // north
  colliders.push({ type: "box", minX: f.minX - wallThickness, maxX: f.minX, minZ: f.minZ, maxZ: f.maxZ }); // west
  colliders.push({ type: "box", minX: f.maxX, maxX: f.maxX + wallThickness, minZ: f.minZ, maxZ: f.maxZ }); // east
  // south wall, split around the gate
  colliders.push({ type: "box", minX: f.minX, maxX: f.gate.from, minZ: f.maxZ, maxZ: f.maxZ + wallThickness });
  colliders.push({ type: "box", minX: f.gate.to, maxX: f.maxX, minZ: f.maxZ, maxZ: f.maxZ + wallThickness });

  // Coop pen fence, gate on south side.
  const p = COOP_PEN;
  colliders.push({ type: "box", minX: p.minX, maxX: p.maxX, minZ: p.minZ - wallThickness, maxZ: p.minZ });
  colliders.push({ type: "box", minX: p.minX - wallThickness, maxX: p.minX, minZ: p.minZ, maxZ: p.maxZ });
  colliders.push({ type: "box", minX: p.maxX, maxX: p.maxX + wallThickness, minZ: p.minZ, maxZ: p.maxZ });
  colliders.push({ type: "box", minX: p.minX, maxX: p.gateX[0], minZ: p.maxZ, maxZ: p.maxZ + wallThickness });
  colliders.push({ type: "box", minX: p.gateX[1], maxX: p.maxX, minZ: p.maxZ, maxZ: p.maxZ + wallThickness });

  for (const t of buildBoundaryTrees()) colliders.push({ type: "circle", x: t.x, z: t.z, r: t.r });

  return colliders;
}

function SHIPPING_BOX_COLLIDER() {
  return { minX: SHIPPING_BOX.x - 0.5, maxX: SHIPPING_BOX.x + 0.5, minZ: SHIPPING_BOX.z - 0.4, maxZ: SHIPPING_BOX.z + 0.4 };
}
function SEED_STAND_COLLIDER() {
  return { minX: SEED_STAND.x - 0.5, maxX: SEED_STAND.x + 0.5, minZ: SEED_STAND.z - 0.4, maxZ: SEED_STAND.z + 0.4 };
}
