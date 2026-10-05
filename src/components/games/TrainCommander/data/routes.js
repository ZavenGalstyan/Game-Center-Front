/**
 * Train Commander — the 30-route campaign (5 regions × 6 routes).
 *
 * A route is a JOURNEY measured in distance (world units along the line):
 *
 *   events (sorted by `at`):
 *     wave        groups of enemies; each group spawns `count` enemies from a
 *                 side ("left" | "right" | "ahead" | "behind") with `interval`
 *                 seconds between them, `delay` s after the wave triggers.
 *                 pos ("front" | "mid" | "rear") picks where along the train
 *                 side attackers come in.
 *     checkpoint  the train brakes into a station; the field must be clear
 *                 for the departure countdown to run. Optional Scrap bonus
 *                 and module unlock ("supply drop").
 *     final       the last threat (boss and/or escorts) — the destination
 *                 only opens once it is resolved and the field is clear.
 *     bridge / tunnel  scenery set-pieces; the engine defers them until the
 *                 field is calm and suppresses spawns while crossing.
 *
 * Route 1 is hand-written (it is the tutorial). Routes 2–30 come from a
 * deterministic builder with a per-route table below, so balance can be
 * tuned in one place and replays are always identical.
 */
import { MODULE_IDS } from "./modules.js";

/* ------------------------------------------------------------ route 1 */
const R1 = {
  id: 1,
  region: 1,
  name: "Green Valley Run",
  from: "Meadowford",
  to: "Hollin Station",
  wagons: 3,
  startScrap: 100,
  modules: ["gunner"],
  speed: 10,
  hpScale: 1,
  rewardScale: 1,
  length: 2350,
  tutorial: true,
  intro: "raider",
  events: [
    { type: "wave", at: 140, name: "Raiders", groups: [{ enemy: "raider", count: 3, side: "right", pos: "mid", interval: 1.8, delay: 0 }] },
    {
      type: "wave",
      at: 430,
      name: "Raiders from both sides",
      groups: [
        { enemy: "raider", count: 3, side: "left", pos: "front", interval: 1.6, delay: 0 },
        { enemy: "raider", count: 2, side: "right", pos: "rear", interval: 1.8, delay: 4 },
      ],
    },
    { type: "checkpoint", at: 820, name: "Brookside Halt", bonus: 50 },
    { type: "tunnel", at: 990, len: 80 },
    {
      type: "wave",
      at: 1080,
      name: "Scout riders",
      intro: "scout",
      groups: [
        { enemy: "scout", count: 4, side: "behind", pos: "rear", interval: 0.9, delay: 0 },
        { enemy: "raider", count: 3, side: "left", pos: "mid", interval: 1.6, delay: 3 },
      ],
    },
    {
      type: "wave",
      at: 1380,
      name: "Mixed attack",
      groups: [
        { enemy: "raider", count: 4, side: "right", pos: "front", interval: 1.3, delay: 0 },
        { enemy: "raider", count: 3, side: "left", pos: "rear", interval: 1.4, delay: 2 },
        { enemy: "scout", count: 4, side: "ahead", pos: "front", interval: 0.8, delay: 6 },
      ],
    },
    { type: "checkpoint", at: 1680, name: "Windmill Crossing", bonus: 70, unlock: "cannon" },
    { type: "bridge", at: 1850, len: 80 },
    {
      type: "final",
      at: 1950,
      name: "Rustjaw Hauler",
      boss: "hauler",
      side: "right",
      groups: [
        { enemy: "raider", count: 3, side: "left", pos: "mid", interval: 1.5, delay: 4 },
        { enemy: "scout", count: 2, side: "behind", pos: "rear", interval: 1, delay: 12 },
      ],
    },
  ],
};

/* ------------------------------------------------------------ table */
// enemy cost in wave "points"
const COST = { raider: 1, scout: 0.75, armored: 2.4, ranged: 2.1, vehicle: 5.5 };

// [name, from, to, finale, intro]
const TABLE = [
  null,
  ["Millbrook Line", "Hollin Station", "Millbrook", "assault", "armored"],
  ["Riverside Express", "Millbrook", "Otterbank", "hauler", "ranged"],
  ["Old Orchard Junction", "Otterbank", "Orchard Jct.", "assault", "vehicle"],
  ["Windmill Ridge", "Orchard Jct.", "Ridgemoor", "assault", null],
  ["Valley Gate", "Ridgemoor", "Valley Gate", "warwagon", null],
  ["Dust Devil Run", "Valley Gate", "Dustwell", "assault", null],
  ["Red Mesa Pass", "Dustwell", "Red Mesa", "assault", null],
  ["Trestle Canyon", "Red Mesa", "High Trestle", "hauler", null],
  ["Sunscorch Flats", "High Trestle", "Scorch Wells", "assault", null],
  ["Vulture Rock", "Scorch Wells", "Vulture Rock", "assault", null],
  ["Canyon Gauntlet", "Vulture Rock", "Canyon Fort", "captain", null],
  ["Frostline", "Canyon Fort", "Frostline", "assault", null],
  ["Pinewood Climb", "Frostline", "Pinehold", "assault", null],
  ["Frozen Lake Crossing", "Pinehold", "Icemere", "hauler", null],
  ["Avalanche Shelf", "Icemere", "Shelf Post", "assault", null],
  ["Glacier Gate", "Shelf Post", "Glacier Gate", "assault", null],
  ["Summit Fortress", "Glacier Gate", "Summit", "walker", null],
  ["Ashen Approach", "Summit", "Ashby", "assault", null],
  ["Crystal Hollow", "Ashby", "Glimmerhole", "assault", null],
  ["Dead Forest Line", "Glimmerhole", "Blackbough", "hauler", null],
  ["Ruined Works", "Blackbough", "Old Works", "assault", null],
  ["Stormspire", "Old Works", "Stormspire", "assault", null],
  ["Shadow Citadel", "Stormspire", "The Citadel", "warwagon", null],
  ["Foundry Row", "The Citadel", "Foundry Row", "assault", null],
  ["Iron Bridge", "Foundry Row", "Span Gate", "assault", null],
  ["Furnace Gate", "Span Gate", "Furnace Gate", "hauler", null],
  ["Bastion Line", "Furnace Gate", "Bastion", "assault", null],
  ["Rustjaw Yards", "Bastion", "The Yards", "assault", null],
  ["Final Run", "The Yards", "Liberty Terminal", "leviathan", null],
];

/** which enemy types a route may field (unlocks follow the intro table) */
function enemyPool(id, region) {
  const pool = { raider: 3, scout: 1.4 };
  if (id >= 2) pool.armored = 1;
  if (id >= 3) pool.ranged = 0.9;
  if (id >= 4) pool.vehicle = 0.35;
  // regional flavour
  if (region === 2) Object.assign(pool, { scout: 2.2, vehicle: 0.6, ranged: 1.3 });
  if (region === 3) Object.assign(pool, { armored: 1.8, scout: 1.0 });
  if (region === 4) Object.assign(pool, { armored: 1.5, ranged: 1.5, vehicle: 0.55 });
  if (region === 5) Object.assign(pool, { raider: 2.4, armored: 1.7, ranged: 1.4, vehicle: 0.8 });
  return pool;
}

export function modulesForRoute(id) {
  if (id >= 4) return MODULE_IDS.slice();
  if (id >= 3) return ["gunner", "cannon", "lancer"];
  if (id >= 2) return ["gunner", "cannon"];
  return ["gunner"];
}

const wagonsFor = (id) => (id <= 2 ? 3 : id <= 6 ? 4 : id <= 14 ? 5 : 6);

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function pickWeighted(r, pool, allow) {
  const keys = Object.keys(pool).filter((k) => !allow || allow(k));
  let total = 0;
  for (const k of keys) total += pool[k];
  let x = r() * total;
  for (const k of keys) {
    x -= pool[k];
    if (x <= 0) return k;
  }
  return keys[keys.length - 1];
}

const SIDES = ["left", "right"];
const POS = ["front", "mid", "rear"];

function makeWave(r, id, region, budget, idx, name) {
  const pool = enemyPool(id, region);
  const groups = [];
  let left = budget;
  let delay = 0;
  let sideFlip = r() < 0.5 ? 0 : 1;
  let posAt = Math.floor(r() * 3); // positions rotate so a wave spreads along the train
  let guard = 0;
  while (left > 0.7 && guard++ < 8) {
    const type = pickWeighted(r, pool, (k) => COST[k] <= left + 0.3 && !(k === "vehicle" && groups.some((g) => g.enemy === "vehicle")));
    const c = COST[type];
    const maxN = type === "vehicle" ? 1 + (id >= 20 ? 1 : 0) : type === "armored" || type === "ranged" ? 3 : 5;
    const n = Math.max(1, Math.min(maxN, Math.floor((left * (0.45 + r() * 0.35)) / c) || 1));
    let side;
    const roll = r();
    if (type === "scout" && roll < 0.45) side = r() < 0.5 ? "behind" : "ahead";
    else if (roll < 0.12 && idx > 0) side = "ahead";
    else if (roll < 0.2 && idx > 0) side = "behind";
    else side = SIDES[(sideFlip++) % 2];
    groups.push({
      enemy: type,
      count: n,
      side,
      pos: POS[posAt++ % 3],
      interval: type === "scout" ? 0.8 : type === "vehicle" ? 3.5 : type === "armored" ? 2.2 : 1.5,
      delay: Math.round(delay * 10) / 10,
    });
    left -= n * c;
    delay += 2.5 + r() * 4 + n * 0.6;
  }
  return { type: "wave", name, groups };
}

const WAVE_NAMES = ["Raid", "Ambush", "Flank attack", "Pincer", "Running fight", "Rush", "Heavy raid", "Assault"];

function buildRoute(id) {
  const [name, from, to, finale, intro] = TABLE[id - 1];
  const region = Math.ceil(id / 6);
  const r = rng(id * 7919 + 17);
  const wagons = wagonsFor(id);
  const length = 2300 + id * 22;
  const speed = 9.6 + region * 0.35;
  // difficulty: tougher enemies AND bigger waves, while rewards grow slower
  const hpScale = 1 + (id - 1) * 0.035;
  const rewardScale = 1 + (id - 1) * 0.03;
  const events = [];
  // layout: W W CP W W CP (W) FINAL
  const legs = id >= 16 ? [2, 2, 1] : [2, 2];
  let at = 150;
  let waveIdx = 0;
  const base = 3.6 + id * 0.42 + (wagons - 3) * 1.2;
  const featureKinds = region === 3 ? ["tunnel", "bridge", "tunnel"] : region === 2 || region === 4 ? ["bridge", "tunnel", "bridge"] : ["bridge", "tunnel", "bridge"];
  let featureN = 0;
  const unlockAt = id === 2 ? null : null;
  legs.forEach((n, leg) => {
    for (let i = 0; i < n; i++) {
      // the opening wave is a warm-up; later waves ramp up
      let budget = base * (waveIdx === 0 ? 0.55 : 0.72 + waveIdx * 0.12) * (i === n - 1 ? 1.12 : 1);
      const introCount = intro === "vehicle" ? 1 : 2;
      if (waveIdx === 0 && intro) budget = Math.max(1.5, budget - COST[intro] * introCount);
      const w = makeWave(r, id, region, budget, waveIdx, WAVE_NAMES[(waveIdx + id) % WAVE_NAMES.length]);
      w.at = Math.round(at);
      if (waveIdx === 0 && intro) w.intro = intro;
      if (waveIdx === 0 && intro && !w.groups.some((g) => g.enemy === intro)) {
        w.groups.push({ enemy: intro, count: introCount, side: w.groups[0].side === "left" ? "right" : "left", pos: "mid", interval: 2, delay: 3 });
      }
      events.push(w);
      waveIdx++;
      at += 280 + r() * 60;
    }
    if (leg < legs.length) {
      const cpAt = Math.round(at + 40);
      if (leg < 2) {
        events.push({ type: "checkpoint", at: cpAt, name: leg === 0 ? `${from} Sidings` : `${to} Outer Halt`, bonus: 50 + id * 3, unlock: leg === 1 ? unlockAt : null });
        const kind = featureKinds[featureN++ % featureKinds.length];
        // set pieces sit just past the station: they commit as the train departs
        events.push({ type: kind, at: cpAt + 170, len: kind === "tunnel" ? 80 + (region === 5 ? 40 : 0) : 80 });
        at = cpAt + 250;
      } else at += 40;
    }
  });

  const finalAt = Math.max(at + 40, length - 420);
  const fin = { type: "final", at: Math.round(finalAt), name: finale === "assault" ? "Final assault" : null, side: r() < 0.5 ? "left" : "right", groups: [] };
  if (finale !== "assault") {
    fin.boss = finale;
    const esc = makeWave(r, id, region, base * (finale === "hauler" ? 0.6 : 0.8), 3, "");
    fin.groups = esc.groups.map((g) => ({ ...g, delay: g.delay + 5 }));
  } else {
    const w = makeWave(r, id, region, base * 1.7, 4, "");
    fin.groups = w.groups;
    if (id >= 4 && !fin.groups.some((g) => g.enemy === "vehicle")) fin.groups.push({ enemy: "vehicle", count: id >= 18 ? 2 : 1, side: fin.side, pos: "front", interval: 4, delay: 6 });
  }
  events.push(fin);
  events.sort((a, b) => a.at - b.at);
  return {
    id,
    region,
    name,
    from,
    to,
    wagons,
    startScrap: 150 + (wagons - 3) * 40 + (id - 1) * 6,
    modules: modulesForRoute(id),
    speed,
    hpScale,
    rewardScale,
    length: Math.max(length, fin.at + 400),
    intro,
    final: id === 30,
    events,
  };
}

/**
 * Atmosphere per route (visual only — never a hidden gameplay penalty):
 * time: morning | day | sunset | dusk | night · weather: clear | rain | snow
 * | dust | fog | storm
 */
const ATMO = {
  1: ["day", "clear"], 2: ["morning", "clear"], 3: ["day", "clear"], 4: ["day", "rain"], 5: ["sunset", "clear"], 6: ["day", "clear"],
  7: ["day", "clear"], 8: ["morning", "clear"], 9: ["sunset", "clear"], 10: ["day", "dust"], 11: ["day", "clear"], 12: ["sunset", "dust"],
  13: ["day", "snow"], 14: ["morning", "snow"], 15: ["day", "clear"], 16: ["day", "snow"], 17: ["night", "clear"], 18: ["dusk", "snow"],
  19: ["dusk", "fog"], 20: ["night", "clear"], 21: ["dusk", "fog"], 22: ["night", "rain"], 23: ["dusk", "storm"], 24: ["night", "fog"],
  25: ["sunset", "clear"], 26: ["day", "clear"], 27: ["night", "clear"], 28: ["sunset", "dust"], 29: ["night", "rain"], 30: ["sunset", "storm"],
};

export const ROUTES = [R1];
for (let i = 2; i <= 30; i++) ROUTES.push(buildRoute(i));
for (const r of ROUTES) [r.time, r.weather] = ATMO[r.id] || ["day", "clear"];

export const getRoute = (id) => ROUTES.find((r) => r.id === id) || null;
export const routesInRegion = (region) => ROUTES.filter((r) => r.region === region);

/** short label for the finale on cards / the map */
export function finaleLabel(route) {
  const f = route.events.find((e) => e.type === "final");
  if (!f) return "";
  if (f.boss === "hauler") return "Mini-boss";
  if (f.boss) return "Boss";
  return "Final assault";
}
