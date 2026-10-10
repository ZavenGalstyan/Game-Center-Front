/**
 * Dimension Dash — level catalogue. Level geometry is built on demand (and
 * cached) from the recipe modules; `BUILT` lists ids whose recipe exists.
 */
import greenShift from "./greenShift.js";
import * as W1 from "./world1.js";
import * as W2 from "./world2.js";
import * as W3 from "./world3.js";
import * as W4 from "./world4.js";
import * as W5 from "./world5.js";
import { worldById } from "../worlds.js";

export const PER_WORLD = 6;
export const LEVEL_COUNT = 30;

/** id → { name, recipe, par, objective, boss } */
const META = {
  1: { name: "Green Shift", recipe: greenShift, par: 70, objective: "Reach the Goal Ring" },
  2: { name: "Palm Rush", recipe: W1.palmRush, par: 75, objective: "Reach the Goal Ring" },
  3: { name: "Waterfall Way", recipe: W1.waterfallWay, par: 80, objective: "Reach the Goal Ring" },
  4: { name: "Twin Loop Hills", recipe: W1.twinLoopHills, par: 80, objective: "Reach the Goal Ring" },
  5: { name: "Velocity Valley", recipe: W1.velocityValley, par: 85, objective: "Reach the Goal Ring" },
  6: { name: "Drill Crawler", recipe: W1.drillCrawler, par: 75, objective: "Defeat the Drill Crawler", boss: true },
  7: { name: "Dune Dash", recipe: W2.duneDash, par: 85, objective: "Reach the Goal Ring" },
  8: { name: "Canyon Corkscrew", recipe: W2.canyonCorkscrew, par: 85, objective: "Reach the Goal Ring" },
  9: { name: "Ruins Rally", recipe: W2.ruinsRally, par: 95, objective: "Reach the Goal Ring" },
  10: { name: "Sandstorm Shift", recipe: W2.sandstormShift, par: 95, objective: "Reach the Goal Ring" },
  11: { name: "Mirage Mesa", recipe: W2.mirageMesa, par: 100, objective: "Reach the Goal Ring" },
  12: { name: "Sand Scorpion", recipe: W2.sandScorpion, par: 80, objective: "Defeat the Sand Scorpion", boss: true },
  13: { name: "Coral Coast", recipe: W3.coralCoast, par: 90, objective: "Reach the Goal Ring" },
  14: { name: "Bridge Breeze", recipe: W3.bridgeBreeze, par: 95, objective: "Reach the Goal Ring" },
  15: { name: "Tidal Tubes", recipe: W3.tidalTubes, par: 90, objective: "Reach the Goal Ring" },
  16: { name: "Island Hopper", recipe: W3.islandHopper, par: 105, objective: "Reach the Goal Ring" },
  17: { name: "Skyway Surge", recipe: W3.skywaySurge, par: 110, objective: "Reach the Goal Ring" },
  18: { name: "Hydro Wing", recipe: W3.hydroWing, par: 90, objective: "Defeat the Hydro Wing", boss: true },
  19: { name: "Neon Nights", recipe: W4.neonNights, par: 100, objective: "Reach the Goal Ring" },
  20: { name: "Laser Lane", recipe: W4.laserLane, par: 100, objective: "Reach the Goal Ring" },
  21: { name: "Rail City", recipe: W4.railCity, par: 105, objective: "Reach the Goal Ring" },
  22: { name: "Circuit Grid", recipe: W4.circuitGrid, par: 110, objective: "Reach the Goal Ring" },
  23: { name: "Overdrive Tower", recipe: W4.overdriveTower, par: 120, objective: "Reach the Goal Ring" },
  24: { name: "Volt Sentinel", recipe: W4.voltSentinel, par: 95, objective: "Defeat the Volt Sentinel", boss: true },
  25: { name: "Rift Ruins", recipe: W5.riftRuins, par: 110, objective: "Reach the Goal Ring" },
  26: { name: "Shatter Path", recipe: W5.shatterPath, par: 115, objective: "Reach the Goal Ring" },
  27: { name: "Prism Falls", recipe: W5.prismFalls, par: 115, objective: "Reach the Goal Ring" },
  28: { name: "Void Rails", recipe: W5.voidRails, par: 120, objective: "Reach the Goal Ring" },
  29: { name: "Dimension Gate", recipe: W5.dimensionGate, par: 130, objective: "Reach the Goal Ring" },
  30: { name: "Dimension Core", recipe: W5.dimensionCore, par: 120, objective: "Defeat the Dimension Core", boss: true },
};

export const BUILT = Object.keys(META).map(Number).sort((a, b) => a - b);
export const BUILT_COUNT = BUILT.length;

const cache = new Map();

export function levelMeta(id) {
  const m = META[id];
  const world = Math.ceil(id / PER_WORLD);
  const num = ((id - 1) % PER_WORLD) + 1;
  return {
    id,
    world,
    num,
    name: m ? m.name : "Coming soon",
    theme: worldById(world).key,
    par: m ? m.par : 120,
    objective: m ? m.objective : "",
    boss: !!(m && m.boss),
    built: !!m,
  };
}

export function levelById(id) {
  if (!META[id]) return null;
  if (!cache.has(id)) {
    const meta = levelMeta(id);
    const data = META[id].recipe(meta);
    data.meta = { ...meta, ...data.meta };
    cache.set(id, data);
  }
  return cache.get(id);
}
