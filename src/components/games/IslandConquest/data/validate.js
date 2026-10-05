/**
 * Island Conquest — development validation for the handcrafted maps.
 * Returns a list of human-readable problems (empty = all good). Run by
 * tools/simTest.mjs and, in dev builds, once when the game first loads.
 */
import { ISLAND_TYPES, MAP_W, MAP_H, PLAYER, NEUTRAL, ENEMIES } from "../engine/constants.js";
import { AI_LEVELS } from "../engine/ai.js";
import { buildRoute } from "../engine/engine.js";
import { REGIONS } from "./regions.js";

const OWNERS = [PLAYER, NEUTRAL, ...ENEMIES];
/** water kept between two shorelines so boats, labels and foam stay readable */
const MIN_GAP = 1.6;

function checkAI(cfg) {
  return cfg && AI_LEVELS[cfg.level] && (cfg.delay == null || cfg.delay >= 0) && (cfg.think == null || (cfg.think >= 0.8 && cfg.think <= 6)) && (cfg.aggr == null || (cfg.aggr > 0 && cfg.aggr <= 2));
}

export function validateLevels(levels) {
  const out = [];
  const seen = new Set();
  levels.forEach((L, n) => {
    const tag = `L${L.id ?? "?"}`;
    if (L.id !== n + 1) out.push(`${tag}: ids must run 1..N in order (index ${n})`);
    if (seen.has(L.id)) out.push(`${tag}: duplicate level id`);
    seen.add(L.id);
    if (!L.name) out.push(`${tag}: missing name`);
    if (!REGIONS.some((r) => r.id === L.region)) out.push(`${tag}: bad region ${L.region}`);
    if (!Array.isArray(L.stars) || L.stars.length !== 2 || !(L.stars[0] > L.stars[1] && L.stars[1] > 0)) out.push(`${tag}: stars must be [twoStar > threeStar > 0]`);
    const isl = L.islands || [];
    if (isl.length < 3 || isl.length > 12) out.push(`${tag}: ${isl.length} islands (3–12 allowed)`);
    const ids = new Set();
    for (const i of isl) {
      if (!i.id || ids.has(i.id)) out.push(`${tag}: duplicate/missing island id ${i.id}`);
      ids.add(i.id);
      const T = ISLAND_TYPES[i.type];
      if (!T) {
        out.push(`${tag}/${i.id}: unknown type ${i.type}`);
        continue;
      }
      if (!OWNERS.includes(i.owner)) out.push(`${tag}/${i.id}: bad owner ${i.owner}`);
      if (!Number.isInteger(i.troops) || i.troops < 0 || i.troops > 150) out.push(`${tag}/${i.id}: bad troops ${i.troops}`);
      if (!Number.isFinite(i.x) || !Number.isFinite(i.z)) out.push(`${tag}/${i.id}: bad position`);
      const r = T.r * (i.scale || 1);
      if (Math.abs(i.x) + r > MAP_W || Math.abs(i.z) + r > MAP_H) out.push(`${tag}/${i.id}: outside the map (${i.x}, ${i.z})`);
      if (i.rate != null && !(i.rate > 0 && i.rate < 3)) out.push(`${tag}/${i.id}: bad production rate`);
    }
    for (let a = 0; a < isl.length; a++)
      for (let b = a + 1; b < isl.length; b++) {
        const A = isl[a];
        const B = isl[b];
        if (!ISLAND_TYPES[A.type] || !ISLAND_TYPES[B.type]) continue;
        const gap = Math.hypot(A.x - B.x, A.z - B.z) - ISLAND_TYPES[A.type].r * (A.scale || 1) - ISLAND_TYPES[B.type].r * (B.scale || 1);
        if (gap < MIN_GAP) out.push(`${tag}: ${A.id}/${B.id} too close (gap ${gap.toFixed(2)})`);
      }
    if (!isl.some((i) => i.owner === PLAYER)) out.push(`${tag}: no player island`);
    const enemies = ENEMIES.filter((e) => isl.some((i) => i.owner === e));
    if (!enemies.length) out.push(`${tag}: no enemy island`);
    // AI config: one block, or one per enemy faction present
    const per = L.ai && (L.ai.red || L.ai.purple);
    if (per) for (const e of enemies) (checkAI(L.ai[e]) ? null : out.push(`${tag}: bad AI settings for ${e}`));
    else if (!checkAI(L.ai)) out.push(`${tag}: bad AI settings`);
    // every pair must have a sea route that clears every other island
    const rt = isl.filter((i) => ISLAND_TYPES[i.type]).map((i) => ({ ...i, r: ISLAND_TYPES[i.type].r * (i.scale || 1) }));
    for (const a of rt)
      for (const b of rt) {
        if (a === b) continue;
        const r = buildRoute(a, b, rt);
        if (!r.clear) out.push(`${tag}: no clear sea route ${a.id}→${b.id}`);
      }
  });
  return out;
}
