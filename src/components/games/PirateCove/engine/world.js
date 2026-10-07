/**
 * Pirate Cove — the static sea region: terrain, islands with their resolved
 * points of interest, props, vegetation, paths, docks and caves, plus the
 * on-foot collision world for each island (built lazily on first landing).
 *
 * Position specs used throughout the data files:
 *   [a, t]          polar on an island: angle (deg), fraction of that angle's
 *                   own shoreline radius (so t = 0.9 is always "on the beach")
 *   { at:[lx,lz] }  island-local metres
 *   { cave:[x,z] }  cave-local metres (the island's cave)
 *   { x, z }        world metres (sea)
 * Everything here is deterministic: the renderer and the engine see the same
 * palms in the same places.
 */
import { createTerrain, radiusAt, localHeight } from "./terrain.js";
import { prepareCave, toCaveWorld, caveFloor, caveSDF } from "./cave.js";
import { PROP_TYPES, propColliders } from "./props.js";
import { createLand, addArea } from "./onfoot.js";
import { mulberry32, smoothstep, clamp } from "./rng.js";

const DEG = Math.PI / 180;

export function polarLocal(I, a, t) {
  const ang = a * DEG;
  const R = radiusAt(I, ang);
  return { lx: Math.cos(ang) * R * t, lz: Math.sin(ang) * R * t };
}

export function buildWorld(region, opts = {}) {
  const terrain = createTerrain(region);
  const beam = opts.beam ?? 4.2;
  let caveIndex = 0;
  const islands = terrain.islands.map((I) => {
    const isl = { I, id: I.id, name: I.name, safe: !!I.safe, biome: I.biome || "tropic" };
    isl.dock = terrain.dockFor(I, beam);
    const dl = isl.dock.land;
    const landH = terrain.height(dl.x, dl.z);
    isl.dock.deckY = clamp(landH + 0.3, 0.8, 1.05);
    isl.pois = {};
    for (const [k, v] of Object.entries(I.pois || {})) isl.pois[k] = resolveIslandPos(isl, v);
    isl.cave = I.cave ? prepareCave({ ...I.cave, id: `cave:${I.id}` }, caveIndex++) : null;
    isl.props = (I.props || []).map((p, i) => resolveProp(isl, p, i, terrain));
    if (isl.cave) {
      const m = resolveIslandPos(isl, I.cave.mouth.p);
      const rot = resolveRot(isl, I.cave.mouth.rot ?? "dock", m);
      isl.props.push({ t: "caveMouth", x: m.x, z: m.z, y: terrain.height(m.x, m.z), rot, scale: I.cave.mouth.scale || 1, key: "caveMouth" });
      // the arch opens toward local +z; the trigger stands in the opening
      isl.caveMouth = { x: m.x + Math.sin(rot) * 0.8, z: m.z + Math.cos(rot) * 0.8, rot };
      const e = toCaveWorld(isl.cave, isl.cave.entry);
      isl.caveEntry = { x: e.x, z: e.z, yaw: isl.cave.entryYaw ?? 0 };
      isl.cave.props = (I.cave.props || []).map((p, i) => {
        const w = toCaveWorld(isl.cave, p.at);
        return { ...p, key: `cv${i}`, x: w.x, z: w.z, y: caveFloor(isl.cave, p.at[0], p.at[1]), rot: (p.rot || 0) * DEG };
      });
    }
    isl.paths = buildPaths(isl, terrain);
    isl.veg = scatterVegetation(isl, terrain);
    isl.land = null;
    return isl;
  });
  const byId = new Map(islands.map((i) => [i.id, i]));
  const world = {
    region,
    terrain,
    islands,
    byId,
    radius: region.radius,
    boundary: { r: region.radius, warn: region.radius - 90, cx: 0, cz: 0 },
    landFor: (id) => landFor(byId.get(id), terrain),
    resolve: (spec, islandId) => resolvePos(world, spec, islandId),
  };
  return world;
}

function resolveIslandPos(isl, v) {
  const I = isl.I;
  if (Array.isArray(v)) {
    const p = polarLocal(I, v[0], v[1]);
    return { x: I.x + p.lx, z: I.z + p.lz };
  }
  if (v && Array.isArray(v.at)) return { x: I.x + v.at[0], z: I.z + v.at[1] };
  if (v && typeof v === "string" && isl.pois?.[v]) return isl.pois[v];
  if (v && v.x != null) return { x: v.x, z: v.z };
  return { x: I.x, z: I.z };
}

/** Resolves any position spec. `islandId` gives context for polar / local / cave specs. */
export function resolvePos(world, spec, islandId) {
  if (spec && typeof spec === "object" && !Array.isArray(spec) && spec.x != null && spec.z != null && !spec.cave) return { x: spec.x, z: spec.z, area: "sea" };
  const isl = world.byId.get(spec?.island || islandId);
  if (!isl) return { x: 0, z: 0, area: "sea" };
  if (spec && Array.isArray(spec.cave)) {
    const w = toCaveWorld(isl.cave, spec.cave);
    return { x: w.x, z: w.z, area: isl.cave.id, island: isl.id };
  }
  let v = spec;
  if (spec?.p) v = spec.p;
  else if (Array.isArray(spec?.at)) v = { at: spec.at };
  else if (spec?.poi) v = spec.poi;
  const p = resolveIslandPos(isl, v);
  return { x: p.x, z: p.z, area: "out", island: isl.id };
}

function resolveRot(isl, rot, pos) {
  if (typeof rot === "number") return rot * DEG;
  const I = isl.I;
  if (rot === "center") return Math.atan2(I.x - pos.x, I.z - pos.z);
  if (rot === "out") return Math.atan2(pos.x - I.x, pos.z - I.z);
  if (rot === "dock") return Math.atan2(isl.dock.land.x - pos.x, isl.dock.land.z - pos.z);
  if (rot && rot.face) {
    const f = resolveIslandPos(isl, rot.face);
    return Math.atan2(f.x - pos.x, f.z - pos.z);
  }
  return 0;
}

function resolveProp(isl, p, i, terrain) {
  const pos = resolveIslandPos(isl, p.p ?? (Array.isArray(p.at) ? { at: p.at } : p.poi));
  const rot = resolveRot(isl, p.rot ?? 0, pos);
  return { ...p, key: `p${i}`, x: pos.x, z: pos.z, y: terrain.height(pos.x, pos.z), rot };
}

// ------------------------------------------------------------------ paths

function buildPaths(isl, terrain) {
  const segs = [];
  const start = isl.dock.land;
  const targets = [];
  for (const p of isl.props) if (p.path) targets.push({ x: p.x, z: p.z });
  if (isl.caveMouth) targets.push(isl.caveMouth);
  for (const t of targets) segs.push(...bentPath(start, t, terrain, isl));
  for (const pair of isl.I.paths || []) {
    const a = resolveIslandPos(isl, pair[0]);
    const b = resolveIslandPos(isl, pair[1]);
    segs.push(...bentPath(a, b, terrain, isl));
  }
  return segs;
}

/** A path gently bends so it doesn't look ruled; two segments via a jittered midpoint. */
function bentPath(a, b, terrain, isl) {
  const rand = mulberry32(Math.round(a.x * 3 + b.z * 7 + isl.I.seed * 11));
  const mx = (a.x + b.x) / 2;
  const mz = (a.z + b.z) / 2;
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const L = Math.hypot(dx, dz) || 1;
  const off = (rand() - 0.5) * Math.min(10, L * 0.18);
  const m = { x: mx + (-dz / L) * off, z: mz + (dx / L) * off };
  return [
    { a, b: m, w: 1.6 },
    { a: m, b, w: 1.6 },
  ];
}

export function distToSeg(px, pz, s) {
  const abx = s.b.x - s.a.x;
  const abz = s.b.z - s.a.z;
  const t = clamp(((px - s.a.x) * abx + (pz - s.a.z) * abz) / (abx * abx + abz * abz || 1), 0, 1);
  return Math.hypot(px - (s.a.x + abx * t), pz - (s.a.z + abz * t));
}

export function pathWeight(isl, x, z) {
  let w = 0;
  for (const s of isl.paths) {
    const d = distToSeg(x, z, s);
    if (d < s.w + 1.2) w = Math.max(w, smoothstep(s.w + 1.2, s.w * 0.4, d));
  }
  return w;
}

// ------------------------------------------------------------- vegetation

const BIOMES = {
  tropic: { palm: 0.3, bush: 0.24, rock: 0.05, tree: 0, dead: 0, flower: 0.2 },
  reef: { palm: 0.22, bush: 0.2, rock: 0.14, tree: 0, dead: 0, flower: 0.08 },
  misty: { palm: 0.05, bush: 0.24, rock: 0.14, tree: 0.26, dead: 0.03, flower: 0.04 },
  storm: { palm: 0.22, bush: 0.2, rock: 0.24, tree: 0.06, dead: 0.04, flower: 0 },
  cursed: { palm: 0.04, bush: 0.16, rock: 0.2, tree: 0, dead: 0.22, flower: 0 },
};

function scatterVegetation(isl, terrain) {
  const I = isl.I;
  const B = BIOMES[isl.biome] || BIOMES.tropic;
  const dens = I.veg ?? 1;
  const rand = mulberry32(I.seed * 1013 + 7);
  const out = { palms: [], trees: [], dead: [], bushes: [], rocks: [], flowers: [] };
  const clears = [];
  for (const p of isl.props) clears.push({ x: p.x, z: p.z, r: (PROP_TYPES[p.t]?.clear ?? 3) * (p.scale || 1) });
  for (const v of Object.values(isl.pois)) clears.push({ x: v.x, z: v.z, r: 3.5 });
  for (const c of I.clear || []) {
    const p = resolveIslandPos(isl, c[0]);
    clears.push({ x: p.x, z: p.z, r: c[1] });
  }
  const dock = isl.dock;
  const step = 3.6;
  const R = I.maxR;
  for (let gx = -R; gx <= R; gx += step) {
    for (let gz = -R; gz <= R; gz += step) {
      const lx = gx + (rand() - 0.5) * step * 0.9;
      const lz = gz + (rand() - 0.5) * step * 0.9;
      const r0 = rand();
      const r1 = rand();
      const r2 = rand();
      const h = localHeight(I, lx, lz);
      if (h < 0.45) continue;
      const x = I.x + lx;
      const z = I.z + lz;
      const e = 0.8;
      const sx = (localHeight(I, lx + e, lz) - localHeight(I, lx - e, lz)) / (2 * e);
      const sz = (localHeight(I, lx, lz + e) - localHeight(I, lx, lz - e)) / (2 * e);
      const slope = Math.hypot(sx, sz);
      let blocked = false;
      for (const c of clears) {
        if ((x - c.x) ** 2 + (z - c.z) ** 2 < c.r * c.r) {
          blocked = true;
          break;
        }
      }
      if (blocked) continue;
      if (distToSeg(x, z, { a: dock.land, b: dock.end }) < 3.2) continue;
      let onPath = false;
      for (const s of isl.paths) {
        if (distToSeg(x, z, s) < s.w + 1.4) {
          onPath = true;
          break;
        }
      }
      const angR = Math.atan2(lz, lx);
      const t = Math.hypot(lx, lz) / radiusAt(I, angR);
      if (onPath) {
        if (r0 < 0.05 && slope < 0.5) out.flowers.push({ x, z, y: h, s: 0.7 + r1 * 0.5, r: r2 * 6.28 });
        continue;
      }
      const steep = slope > 0.85;
      if (steep) {
        if (r0 < B.rock + 0.35) out.rocks.push({ x, z, y: h, s: 0.7 + r1 * 1.4, r: r2 * 6.28, tilt: rand() });
        continue;
      }
      let acc = 0;
      const pPalm = B.palm * dens * (h < 5 ? 1 : 0.45) * (t > 0.95 ? 0.5 : 1);
      if (r0 < (acc += pPalm)) {
        out.palms.push({ x, z, y: h, s: 0.8 + r1 * 0.5, r: r2 * 6.28, lean: 0.08 + rand() * 0.28 });
        continue;
      }
      if (r0 < (acc += B.tree * dens)) {
        out.trees.push({ x, z, y: h, s: 0.8 + r1 * 0.6, r: r2 * 6.28 });
        continue;
      }
      if (r0 < (acc += B.dead * dens)) {
        out.dead.push({ x, z, y: h, s: 0.8 + r1 * 0.5, r: r2 * 6.28 });
        continue;
      }
      if (r0 < (acc += B.bush * dens)) {
        out.bushes.push({ x, z, y: h, s: 0.7 + r1 * 0.8, r: r2 * 6.28 });
        continue;
      }
      if (r0 < (acc += B.rock)) {
        out.rocks.push({ x, z, y: h, s: 0.5 + r1 * 0.9, r: r2 * 6.28, tilt: rand() });
        continue;
      }
      if (r0 < (acc += B.flower)) out.flowers.push({ x, z, y: h, s: 0.7 + r1 * 0.6, r: r2 * 6.28 });
    }
  }
  return out;
}

// --------------------------------------------------------------- landing

function landFor(isl, terrain) {
  if (!isl) return null;
  if (isl.land) return isl.land;
  const land = createLand(terrain);
  const A = land.areas.out;
  for (const p of isl.props) {
    const c = propColliders(p, p.y);
    A.circles.push(...c.circles);
    A.boxes.push(...c.boxes);
  }
  for (const v of isl.veg.palms) A.circles.push({ x: v.x, z: v.z, r: 0.34 * v.s });
  for (const v of isl.veg.trees) A.circles.push({ x: v.x, z: v.z, r: 0.5 * v.s });
  for (const v of isl.veg.dead) A.circles.push({ x: v.x, z: v.z, r: 0.3 * v.s });
  for (const v of isl.veg.rocks) if (v.s > 1.1) A.circles.push({ x: v.x, z: v.z, r: 0.55 * v.s });
  // dock deck: one walkable box from the beach out to the sea end
  const d = isl.dock;
  const cx = (d.land.x + d.end.x) / 2;
  const cz = (d.land.z + d.end.z) / 2;
  const len = Math.hypot(d.end.x - d.land.x, d.end.z - d.land.z);
  d.deck = { x: cx, z: cz, hw: 1.6, hd: len / 2, rot: Math.atan2(d.dir.x, d.dir.z), top: d.deckY, prop: "dock" };
  A.boxes.push(d.deck);
  if (isl.cave) {
    addArea(land, isl.cave.id, isl.cave);
    const CA = land.areas[isl.cave.id];
    for (const p of isl.cave.props) {
      const c = propColliders(p, p.y);
      CA.circles.push(...c.circles);
      CA.boxes.push(...c.boxes);
    }
  }
  isl.land = land;
  return land;
}

/** Is a cave-local point open floor (used by validators). */
export function caveOpen(C, lx, lz, margin = 0.5) {
  return caveSDF(C, lx, lz) < -margin;
}
