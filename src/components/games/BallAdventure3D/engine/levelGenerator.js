/**
 * Ball Adventure 3D — procedural level generator.
 *
 * Levels 4-100 are generated from a small config object (id, world, name,
 * difficulty, mechanic) rather than hand-authored — this is the "ONE
 * reusable level engine, data-driven" approach at 100-level scale. Every
 * generated level is deterministic (seeded by id, see rng.js) and passes
 * through `validateLevel` (connectivity / reachability) before being used;
 * see scripts intent in data/levels/index.js.
 *
 * All platforms are STATIC — no moving platforms anywhere in this game
 * (removed after playtesting: jumping off one mid-move threw the player
 * into the void). "Movement" mechanics from the original brief (conveyors,
 * wind, low gravity) are implemented instead as: a continuous push while
 * standing on a static conveyor-surfaced platform, a static area force
 * zone, and a per-level gravity override — the platforms themselves never
 * move.
 */
import { makeRng, rngRange, rngPick } from "./rng.js";
import { level, platform, crystal, checkpoint, decor } from "./levelKit.js";

/** Scatters decorations from a world's `decorSet` along the interior route,
 * plus a few sky-floating clouds — used by every generated world instead of
 * a bespoke decoration list per level. */
function scatterDecorations(flatCenters, rng, decorSet) {
  if (!decorSet?.length) return [];
  const totalWeight = decorSet.reduce((s, d) => s + d.weight, 0);
  const pick = () => {
    let r = rng() * totalWeight;
    for (const d of decorSet) { r -= d.weight; if (r <= 0) return d; }
    return decorSet[decorSet.length - 1];
  };
  const out = [];
  const interior = flatCenters.slice(1, -1);
  for (const c of interior) {
    if (rng() > 0.45) continue;
    const d = pick();
    if (d.type === "cloud") continue; // clouds are placed separately, in the sky
    const side = rng() < 0.5 ? -1 : 1;
    const offset = c[3] / 2 + rngRange(rng, 0.4, 1.1);
    out.push(decor(d.type, [c[0] + side * offset, c[1], c[2] + rngRange(rng, -c[4] / 3, c[4] / 3)], { ...d.props, scale: rngRange(rng, 0.8, 1.2), rot: rngRange(rng, 0, Math.PI * 2) }));
    if (out.length >= 12) break;
  }
  const cloudTemplate = decorSet.find((d) => d.type === "cloud");
  if (cloudTemplate) {
    const first = flatCenters[0], last = flatCenters[flatCenters.length - 1];
    for (let i = 0; i < 3; i++) {
      const z = first[2] + ((last[2] - first[2]) * (i + 0.5)) / 3;
      out.push(decor("cloud", [rngRange(rng, -14, 14), rngRange(rng, 8, 11), z + rngRange(rng, -6, 6)], { ...cloudTemplate.props, scale: rngRange(rng, 1.1, 1.9) }));
    }
  }
  return out;
}

const TOP_Y = 0.6;
const HEIGHT = 1.2;
const START_SIZE = [11, HEIGHT, 11];
const FINISH_SIZE = [11, HEIGHT, 11];

function seg(rng, difficulty, mechanicSurface, hazardStyle) {
  const roll = rng();
  const weights = [
    ["safe", 1 - difficulty * 0.35],
    ["gap", 0.5 + difficulty * 0.5],
    ["narrow", 0.15 + difficulty * 0.55],
    ["stones", 0.25 + difficulty * 0.35],
    ["hazard", mechanicSurface ? 0.35 + difficulty * 0.55 : 0],
    ["sidestep", 0.2 + difficulty * 0.45],
  ];
  const total = weights.reduce((s, [, w]) => s + w, 0);
  let acc = 0;
  let type = "safe";
  for (const [t, w] of weights) {
    acc += w;
    if (roll * total <= acc) { type = t; break; }
  }

  if (type === "safe") {
    return [{ size: [rngRange(rng, 6, 9), HEIGHT, rngRange(rng, 5, 8)], gap: rngRange(rng, 0.5, 1.5), drift: rngRange(rng, -1, 1), style: "ground" }];
  }
  if (type === "gap") {
    return [{ size: [rngRange(rng, 4, 6.5), HEIGHT, rngRange(rng, 4, 6)], gap: rngRange(rng, 2 + difficulty * 1.2, 3.2 + difficulty * 1.8), drift: rngRange(rng, -1.5, 1.5), style: "stone" }];
  }
  if (type === "narrow") {
    return [{ size: [rngRange(rng, 2.6, 3.6), HEIGHT, rngRange(rng, 4.5, 6.5)], gap: rngRange(rng, 1, 2.4), drift: rngRange(rng, -0.8, 0.8), style: "stone" }];
  }
  if (type === "stones") {
    const n = rng() < 0.5 ? 2 : 3;
    const out = [];
    for (let i = 0; i < n; i++) {
      out.push({ size: [rngRange(rng, 2.2, 2.8), HEIGHT, rngRange(rng, 2.2, 2.8)], gap: rngRange(rng, 1, 2), drift: rngRange(rng, -1.4, 1.4), style: "stone" });
    }
    return out;
  }
  if (type === "hazard") {
    return [{ size: [rngRange(rng, 6, 10), HEIGHT, rngRange(rng, 6, 9)], gap: rngRange(rng, 0.5, 1.4), drift: rngRange(rng, -1, 1), style: hazardStyle, surface: mechanicSurface, isHazard: true }];
  }
  // sidestep
  const sign = rng() < 0.5 ? -1 : 1;
  return [{ size: [rngRange(rng, 4, 6), HEIGHT, rngRange(rng, 4, 6)], gap: rngRange(rng, 1, 2.3), drift: sign * rngRange(rng, 2, 3.6), style: "stone" }];
}

/**
 * @param {object} cfg
 * @param {number} cfg.id - level id (1-100), used as the RNG seed
 * @param {string} cfg.world - world id
 * @param {string} cfg.name
 * @param {number} cfg.difficulty - 0..1, drives gap size / narrowness / hazard density
 * @param {number} cfg.segmentCount - how many path segments to generate
 * @param {string|null} cfg.mechanicSurface - surface id (sand/ice/mud/boost/bounce/conveyor) tagged onto "hazard" segments, or null
 * @param {string} cfg.hazardStyle - visual style key for hazard-surfaced platforms
 * @param {number} [cfg.gravity] - per-level gravity override (Cosmic Void)
 * @param {Array} [cfg.windZones] - [{min:[x,z], max:[x,z], force:[fx,fz]}] area force zones
 * @param {boolean} [cfg.lavaTheme] - render a decorative lava plane below the route
 * @param {(pos:number[]) => object[]} [cfg.decorate] - world-specific decoration generator
 */
export function generateLevel(cfg) {
  const rng = makeRng(cfg.id * 7919 + 13);

  let cursorX = 0;
  let cursorZ = 0;
  let prevHalfW = START_SIZE[0] / 2;
  let prevHalfD = START_SIZE[2] / 2;

  const groundTint = cfg.groundTint || null;
  const stoneTint = cfg.stoneTint || null;

  const platforms = [platform([0, 0, 0], START_SIZE, { style: "ground", tint: groundTint })];
  const flatCenters = [[0, TOP_Y, 0, START_SIZE[0], START_SIZE[2]]]; // x,y,z,w,d — for crystal/checkpoint placement
  const windGapCandidates = [];

  const n = cfg.segmentCount ?? (7 + Math.round(cfg.difficulty * 5));
  for (let i = 0; i < n; i++) {
    const parts = seg(rng, cfg.difficulty, cfg.mechanicSurface, cfg.hazardStyle);
    for (const p of parts) {
      const newHalfW = p.size[0] / 2;
      const newHalfD = p.size[2] / 2;
      const maxDrift = Math.max(0, prevHalfW + newHalfW - 1.1);
      const drift = Math.max(-maxDrift, Math.min(maxDrift, p.drift));
      const newX = cursorX + drift;
      const newZ = cursorZ + prevHalfD + p.gap + newHalfD;

      let conveyorDir = null;
      if (p.surface === "conveyor") {
        const dx = newX - cursorX, dz = newZ - cursorZ;
        const dlen = Math.hypot(dx, dz) || 1;
        conveyorDir = [dx / dlen, dz / dlen];
      }
      const tint = p.style === "ground" ? groundTint : (p.isHazard ? null : stoneTint);
      platforms.push(platform([newX, 0, newZ], p.size, { style: p.style, surface: p.surface, tint, conveyorDir }));
      flatCenters.push([newX, TOP_Y, newZ, p.size[0], p.size[2]]);
      if (p.gap > 2.2) windGapCandidates.push({ prevZ: cursorZ + prevHalfD, nextZ: newZ - newHalfD, x: (cursorX + newX) / 2 });
      cursorX = newX;
      cursorZ = newZ;
      prevHalfW = newHalfW;
      prevHalfD = newHalfD;
    }
  }

  // finish platform
  const finishGap = rngRange(rng, 0.5, 1.2);
  const finishX = cursorX + Math.max(-1.5, Math.min(1.5, rngRange(rng, -1, 1)));
  const finishZ = cursorZ + prevHalfD + finishGap + FINISH_SIZE[2] / 2;
  platforms.push(platform([finishX, 0, finishZ], FINISH_SIZE, { style: "ground", tint: groundTint }));
  flatCenters.push([finishX, TOP_Y, finishZ, FINISH_SIZE[0], FINISH_SIZE[2]]);

  const finish = [finishX, TOP_Y, finishZ];
  const start = [0, 1.15, 0];

  // crystals at ~25% / 55% / 85% progress through the interior route (never on start/finish)
  const interior = flatCenters.slice(1, -1);
  const pickAt = (frac) => interior[Math.max(0, Math.min(interior.length - 1, Math.round(frac * (interior.length - 1))))];
  const c1 = pickAt(0.22);
  const c2 = pickAt(0.55);
  const c3 = pickAt(0.85);
  const crystals = [
    crystal([c1[0], c1[1] + 0.7, c1[2]]),
    crystal([c2[0] + Math.min(c2[3] / 2 - 0.6, 1.2), c2[1] + 0.7, c2[2]]),
    crystal([c3[0] - Math.min(c3[3] / 2 - 0.6, 1.3), c3[1] + 0.7, c3[2]]),
  ];

  // one checkpoint near the midpoint for longer levels
  const checkpoints = [];
  if (interior.length >= 6) {
    const mid = pickAt(0.5);
    checkpoints.push(checkpoint([mid[0], mid[1], mid[2]]));
  }

  const decorations = cfg.decorate ? cfg.decorate(flatCenters, rng) : scatterDecorations(flatCenters, rng, cfg.decorSet);

  // wind zones: a static area force over the widest gap(s) — never a moving
  // platform, just a push while airborne/crossing, with a visible streak
  // indicator (WindZone.jsx) so the force is never invisible
  const windZones = [];
  if (cfg.windMechanic && windGapCandidates.length) {
    const sorted = [...windGapCandidates].sort((a, b) => (b.nextZ - b.prevZ) - (a.nextZ - a.prevZ));
    const picks = sorted.slice(0, Math.min(2, sorted.length));
    for (const g of picks) {
      const sign = rng() < 0.5 ? -1 : 1;
      windZones.push({
        min: [g.x - 5, TOP_Y - 0.5, g.prevZ],
        max: [g.x + 5, TOP_Y + 4, g.nextZ],
        force: [sign * rngRange(rng, 2.5, 4), 0],
      });
    }
  }

  return level({
    id: cfg.id,
    world: cfg.world,
    name: cfg.name,
    start,
    startYaw: Math.PI,
    finish,
    fallY: -12,
    platforms,
    crystals,
    checkpoints,
    decorations,
    gravity: cfg.gravity,
    windZones: cfg.windZones || windZones,
    lavaTheme: Boolean(cfg.lavaTheme),
    tutorial: cfg.tutorial || [],
  });
}

/**
 * Geometric sanity check for a generated (or hand-authored) level: start/
 * finish sit on a real platform, every consecutive platform along the route
 * has a jumpable gap, and crystals/checkpoints sit on/near a platform.
 * Returns a list of problem strings — empty means the level is sound.
 */
export function validateLevel(lvl) {
  const problems = [];
  const aabb = (p) => ({
    minX: p.pos[0] - p.size[0] / 2, maxX: p.pos[0] + p.size[0] / 2,
    minZ: p.pos[2] - p.size[2] / 2, maxZ: p.pos[2] + p.size[2] / 2,
    topY: p.pos[1] + p.size[1] / 2,
  });
  const boxes = lvl.platforms.map(aabb);

  const onAny = (pos, margin = 0.3) => boxes.some((b) => pos[0] >= b.minX - margin && pos[0] <= b.maxX + margin && pos[2] >= b.minZ - margin && pos[2] <= b.maxZ + margin);
  if (!onAny(lvl.start)) problems.push(`start ${JSON.stringify(lvl.start)} not on any platform`);
  if (!onAny(lvl.finish, 0.6)) problems.push(`finish ${JSON.stringify(lvl.finish)} not on any platform`);

  // route order == platforms array order for generated levels
  for (let i = 0; i < boxes.length - 1; i++) {
    const a = boxes[i], b = boxes[i + 1];
    const gapZ = b.minZ - a.maxZ;
    const overlapX = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX);
    if (gapZ > 5.5) problems.push(`platform[${i}]->[${i + 1}] gap too large (${gapZ.toFixed(2)})`);
    if (gapZ > 0.05 && overlapX < -2.5) problems.push(`platform[${i}]->[${i + 1}] disjoint jump (gapZ=${gapZ.toFixed(2)}, xOverlap=${overlapX.toFixed(2)})`);
  }

  if (lvl.crystals.length !== 3) problems.push(`expected 3 crystals, got ${lvl.crystals.length}`);
  for (const [i, c] of lvl.crystals.entries()) {
    if (!onAny(c.pos, 2.5)) problems.push(`crystal[${i}] unreachable`);
  }
  for (const [i, cp] of lvl.checkpoints.entries()) {
    if (!onAny(cp.pos, 0.6)) problems.push(`checkpoint[${i}] not on a platform`);
  }
  return problems;
}
