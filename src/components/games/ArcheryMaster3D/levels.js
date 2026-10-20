/**
 * Archery Master 3D — the five worlds and all 50 levels as plain data.
 *
 * Coordinates are metres. The archer stands at the origin facing −z, so a
 * target "25 m out" sits at z = −25. Compact specs below are expanded by
 * `build()` into full level objects; nothing here touches Three.js, so the
 * Node validator (tools/simTest.mjs) plays every level with the same data.
 *
 * Target spec   [x, y, dist, radius, motion?]
 * Obstacle spec [x, y, dist, width, height, depth, motion?]   (box centre)
 * Motion        { k: "slide" | "bob" | "circle" | "eight", a: amplitude m, s: rad/s, p: phase }
 * Wind          { s: m/s, d: degrees (0 → blows right, 90 → downrange, 180 → left), shift?: degrees of per-arrow swing }
 * Objective     { score?: points, gold?: arrows scoring 9+, all?: hit every target }
 * Stars         [two-star score, three-star score] — one star = objective met.
 */

export const WORLDS = [
  {
    id: 0,
    name: "Forest Training",
    blurb: "Static targets in a quiet woodland range. Learn to draw, hold and release.",
    accent: "#7bd36a",
    icon: "🌲",
  },
  {
    id: 1,
    name: "Castle Grounds",
    blurb: "Targets on rails and swinging shields behind stone battlements.",
    accent: "#e9a15b",
    icon: "🏰",
  },
  {
    id: 2,
    name: "Desert Winds",
    blurb: "Long shots across the dunes. Read the wind and aim upwind.",
    accent: "#f2c45a",
    icon: "🏜️",
  },
  {
    id: 3,
    name: "Frozen Peaks",
    blurb: "Smaller, faster targets and shifting mountain gusts.",
    accent: "#8fd3ff",
    icon: "🏔️",
  },
  {
    id: 4,
    name: "Champion's Temple",
    blurb: "Everything at once. Only true precision earns the crown.",
    accent: "#ffcf5a",
    icon: "🏛️",
  },
];

const sl = (a, s, p = 0) => ({ k: "slide", a, s, p });
const bob = (a, s, p = 0) => ({ k: "bob", a, s, p });
const circ = (a, s, p = 0) => ({ k: "circle", a, s, p });
const eight = (a, s, p = 0) => ({ k: "eight", a, s, p });
const W = (s, d, shift = 0) => ({ s, d, shift });

/* prettier-ignore */
const SPECS = [
  // ---------------------------------------------------------------- Forest Training (static, no wind)
  { n: "First Arrow", t: [[0, 1.5, 12, 0.6]], a: 5, o: { score: 20 }, st: [32, 42] },
  { n: "Steady Hands", t: [[0, 1.5, 15, 0.6]], a: 5, o: { score: 25 }, st: [34, 42] },
  { n: "Twin Targets", t: [[-2, 1.5, 16, 0.55], [2.2, 1.5, 18, 0.55]], a: 5, o: { all: true }, st: [32, 40] },
  { n: "Into the Gold", t: [[0, 1.5, 20, 0.55]], a: 5, o: { gold: 2 }, st: [34, 42] },
  { n: "Three in a Row", t: [[-3, 1.4, 18, 0.5], [0, 1.6, 22, 0.5], [3, 1.4, 18, 0.5]], a: 6, o: { all: true }, st: [38, 48] },
  { n: "High Perch", t: [[0, 3.4, 22, 0.5]], a: 5, o: { score: 28 }, st: [34, 41] },
  { n: "Clearing Pair", t: [[-4, 1.5, 24, 0.5], [4, 1.5, 26, 0.5]], a: 5, o: { score: 28 }, st: [33, 40] },
  { n: "Long Shot", t: [[0, 1.5, 30, 0.55]], a: 6, o: { gold: 2 }, st: [38, 47] },
  { n: "Woodland Trail", t: [[-5, 1.5, 20, 0.45], [0, 2.4, 26, 0.45], [5, 1.5, 30, 0.45]], a: 6, o: { all: true }, st: [36, 46] },
  { n: "Ranger's Test", t: [[-2.5, 1.5, 30, 0.45], [2.5, 2.8, 33, 0.45]], a: 6, o: { all: true, score: 30 }, st: [37, 46] },

  // ---------------------------------------------------------------- Castle Grounds (moving targets, obstacles)
  { n: "Moving Mark", t: [[0, 1.6, 20, 0.6, sl(2, 0.8)]], a: 5, o: { score: 22 }, st: [32, 40] },
  { n: "Arrow Slit", t: [[0, 1.6, 24, 0.5]], ob: [[-2.6, 1.6, 17, 4, 3.2, 0.6], [2.6, 1.6, 17, 4, 3.2, 0.6]], a: 5, o: { score: 26 }, st: [34, 41] },
  { n: "Crossing Rails", t: [[0, 1.5, 22, 0.55, sl(2.2, 0.9)], [0, 3.2, 26, 0.55, sl(2.2, 0.9, Math.PI)]], a: 6, o: { all: true }, st: [36, 45] },
  { n: "Over the Wall", t: [[0, 2.3, 22, 0.55, bob(0.5, 1.1)]], ob: [[0, 0.65, 15, 7, 1.3, 0.6]], a: 5, o: { score: 26 }, st: [33, 40] },
  { n: "Battlements", t: [[-3, 5.2, 30, 0.55], [2.5, 1.6, 24, 0.55, sl(1.8, 1)]], ob: [[-3, 2.25, 30.9, 6, 4.5, 1.2]], a: 6, o: { all: true, score: 26 }, st: [36, 45] },
  { n: "Guard Shield", t: [[0, 1.6, 26, 0.5]], ob: [[0, 1.6, 18, 1.4, 2.2, 0.3, sl(2.4, 0.9)]], a: 5, o: { score: 24 }, st: [33, 40] },
  { n: "Courtyard Drill", t: [[-4, 1.5, 22, 0.5], [0, 1.6, 26, 0.5, sl(2, 1.1)], [4, 2, 24, 0.5, bob(0.6, 1.3)]], a: 6, o: { all: true }, st: [36, 46] },
  { n: "Pillar Hall", t: [[-2.5, 1.6, 28, 0.5], [0, 2.2, 30, 0.5], [2.5, 1.6, 28, 0.5]], ob: [[-3, 1.8, 20, 0.8, 3.6, 0.8], [-1, 1.8, 20, 0.8, 3.6, 0.8], [1, 1.8, 20, 0.8, 3.6, 0.8], [3, 1.8, 20, 0.8, 3.6, 0.8]], a: 6, o: { all: true }, st: [34, 44] },
  { n: "Gallop", t: [[0, 1.6, 24, 0.55, sl(3, 1.4)]], a: 6, o: { gold: 2 }, st: [36, 45] },
  { n: "Siege Master", t: [[-1, 4.8, 32, 0.5, sl(1.5, 1)], [3, 1.8, 26, 0.5, bob(0.6, 1.4)]], ob: [[-1, 1.6, 20, 1.6, 2.4, 0.3, sl(2.2, 1.1, 1)]], a: 6, o: { all: true, score: 28 }, st: [36, 45] },

  // ---------------------------------------------------------------- Desert Winds (wind, longer distances)
  { n: "First Breeze", t: [[0, 1.6, 30, 0.6]], w: W(2, 0), a: 5, o: { score: 24 }, st: [43, 47] },
  { n: "Crosswind", t: [[0, 1.6, 34, 0.6]], w: W(3, 180), a: 5, o: { score: 24 }, st: [40, 45] },
  { n: "Dune Pair", t: [[-3, 1.6, 32, 0.55], [3, 2.6, 38, 0.55]], w: W(3, 45), a: 5, o: { all: true }, st: [41, 46] },
  { n: "Mirage", t: [[0, 1.6, 40, 0.6]], w: W(4, 160), a: 6, o: { gold: 2 }, st: [43, 54] },
  { n: "Caravan", t: [[0, 1.6, 36, 0.6, sl(2.2, 0.8)]], w: W(3, 20), a: 6, o: { score: 28 }, st: [47, 54] },
  { n: "Oasis Row", t: [[-4, 1.6, 35, 0.55], [0, 1.6, 40, 0.55], [4, 1.6, 45, 0.55]], w: W(4.5, 200), a: 6, o: { all: true }, st: [46, 54] },
  { n: "Rock Garden", t: [[0, 1.8, 42, 0.55]], ob: [[-1.8, 1.4, 30, 1.6, 2.8, 1.6], [1.8, 1.4, 30, 1.6, 2.8, 1.6]], w: W(5, 0), a: 5, o: { score: 24 }, st: [35, 43] },
  { n: "Dune Crest", t: [[2, 4.2, 48, 0.6], [-3, 1.6, 36, 0.55]], w: W(4, 120), a: 6, o: { all: true }, st: [47, 54] },
  { n: "Sandstorm", t: [[0, 1.8, 50, 0.6]], w: W(5.5, 190), a: 6, o: { gold: 1 }, st: [41, 51] },
  { n: "Sultan's Range", t: [[-4, 1.6, 40, 0.55], [0, 2.4, 48, 0.55, sl(2, 0.8)], [4, 1.6, 55, 0.6]], w: W(6, 10), a: 7, o: { all: true, score: 34 }, st: [50, 61] },

  // ---------------------------------------------------------------- Frozen Peaks (smaller, faster)
  { n: "Ice Sight", t: [[0, 1.6, 30, 0.4]], a: 5, o: { score: 26 }, st: [36, 44] },
  { n: "Sled Run", t: [[0, 1.6, 28, 0.42, sl(2.6, 1.7)]], a: 6, o: { score: 28 }, st: [41, 51] },
  { n: "Snow Halo", t: [[0, 2.2, 30, 0.4, circ(1.2, 1.4)]], a: 6, o: { score: 26 }, st: [41, 50] },
  { n: "Bouncing Pair", t: [[-2.5, 2.2, 28, 0.4, bob(0.9, 2)], [2.5, 2.2, 32, 0.4, bob(0.9, 2, Math.PI)]], a: 6, o: { all: true }, st: [43, 52] },
  { n: "Mountain Gusts", t: [[0, 1.6, 36, 0.38]], w: W(2.5, 0, 140), a: 6, o: { score: 28 }, st: [42, 51] },
  { n: "Aurora Loop", t: [[0, 2.4, 32, 0.38, eight(1.6, 1.3)]], a: 6, o: { score: 26 }, st: [34, 48] },
  { n: "Glacier Gate", t: [[0, 1.8, 34, 0.4, sl(2.4, 1.6)]], ob: [[-2.5, 1.6, 24, 2.6, 3.2, 1.2], [2.5, 1.6, 24, 2.6, 3.2, 1.2]], a: 6, o: { score: 20 }, st: [21, 34] },
  { n: "Frost Quartet", t: [[-4.5, 1.6, 30, 0.34], [-1.5, 2.6, 34, 0.34], [1.5, 1.6, 34, 0.34], [4.5, 2.6, 30, 0.34]], w: W(2, 180), a: 7, o: { all: true }, st: [47, 60] },
  { n: "Needle Point", t: [[0, 1.8, 40, 0.38]], w: W(2, 30), a: 7, o: { gold: 2 }, st: [42, 57] },
  { n: "Peak Champion", t: [[-2.5, 2.4, 34, 0.35, circ(1.1, 1.6)], [2.5, 1.6, 38, 0.35, sl(2.2, 2)]], w: W(3, 200, 60), a: 7, o: { all: true, score: 34 }, st: [37, 54] },

  // ---------------------------------------------------------------- Champion's Temple (combined, precision)
  { n: "Temple Steps", t: [[0, 1.8, 34, 0.42, sl(1.8, 1.2)]], ob: [[0, 1.8, 24, 1.4, 2.4, 0.3, sl(2.2, 1.3, 1.6)]], w: W(3, 0), a: 6, o: { score: 28 }, st: [35, 48] },
  { n: "Golden Focus", t: [[0, 2, 40, 0.42, bob(0.35, 0.7)]], w: W(2, 170), a: 8, o: { gold: 3 }, st: [47, 68] },
  { n: "Hall of Columns", t: [[-4, 1.6, 30, 0.38], [-2, 2.6, 36, 0.38], [0, 1.6, 40, 0.38], [2, 2.6, 36, 0.38], [4, 1.6, 30, 0.38]], ob: [[-4.1, 2, 22, 0.9, 4, 0.9], [-2.1, 2, 22, 0.9, 4, 0.9], [2.1, 2, 22, 0.9, 4, 0.9], [4.1, 2, 22, 0.9, 4, 0.9]], a: 8, o: { all: true }, st: [56, 69] },
  { n: "Twin Guardians", t: [[0, 2, 36, 0.4, circ(0.9, 1.2)]], ob: [[0, 1.8, 22, 1.2, 2.6, 0.3, sl(2, 1.4)], [0, 1.8, 27, 1.2, 2.6, 0.3, sl(2, 1.4, Math.PI)]], a: 6, o: { score: 22 }, st: [24, 37] },
  { n: "Shifting Sands", t: [[0, 2.2, 45, 0.42, bob(0.9, 1.5)]], w: W(3.5, 10, 150), a: 6, o: { score: 26 }, st: [36, 49] },
  { n: "Stairway to Sky", t: [[-3, 3, 35, 0.4], [0, 5, 45, 0.42], [3, 7, 55, 0.45]], w: W(3, 160), a: 6, o: { all: true }, st: [38, 49] },
  { n: "Serpent Dance", t: [[0, 2.4, 34, 0.32, eight(1.8, 1.6)]], w: W(2, 20), a: 7, o: { score: 30 }, st: [38, 53] },
  { n: "Eye of the Storm", t: [[0, 1.8, 45, 0.42, sl(0.8, 0.6)]], w: W(4, 180, 120), a: 8, o: { gold: 2 }, st: [47, 65] },
  { n: "Gauntlet", t: [[-3, 1.8, 34, 0.38, sl(1.4, 1.6)], [3, 2.2, 38, 0.38, bob(0.8, 1.8)], [-1, 3.2, 44, 0.38, circ(0.8, 1.4)], [2, 1.6, 48, 0.4, sl(1.6, 1.3, 2)]], ob: [[0, 1.6, 26, 1.4, 2.4, 0.3, sl(2.6, 1.2)]], w: W(4, 0, 50), a: 8, o: { all: true }, st: [51, 66] },
  { n: "Champion's Trial", t: [[-3, 2, 38, 0.38, sl(1.5, 1.5)], [3, 2.6, 42, 0.38, circ(1, 1.5)], [0, 1.8, 60, 0.42]], ob: [[-3, 1.8, 28, 1.4, 2.6, 0.3, sl(1.8, 1.7, 1)]], w: W(5, 190, 80), a: 8, o: { all: true, score: 40, gold: 1 }, st: [41, 62] },
];

const motionOf = (m) => (m ? { k: m.k, a: m.a, s: m.s, p: m.p || 0 } : null);

function build(spec, i) {
  const world = Math.floor(i / 10);
  return {
    id: i + 1,
    world,
    name: spec.n,
    targets: spec.t.map(([x, y, d, r, m]) => ({ x, y, z: -d, r, motion: motionOf(m) })),
    obstacles: (spec.ob || []).map(([x, y, d, w, h, dd, m]) => ({ x, y, z: -d, w, h, d: dd, motion: motionOf(m) })),
    wind: spec.w ? { ...spec.w } : { s: 0, d: 0, shift: 0 },
    arrows: spec.a,
    objective: { ...spec.o },
    stars: spec.st,
  };
}

export const LEVELS = SPECS.map(build);
export const LEVEL_COUNT = LEVELS.length;
export const getLevel = (id) => LEVELS[Math.max(1, Math.min(LEVEL_COUNT, id)) - 1];

/** Deterministic per-arrow wind (levels with `shift` swing a little each arrow). */
export function windFor(level, shot) {
  const w = level.wind;
  if (!w.s) return { s: 0, d: 0, x: 0, z: 0 };
  let s = w.s;
  let d = w.d;
  if (w.shift) {
    const h1 = Math.sin(level.id * 12.9898 + shot * 78.233) * 43758.5453;
    const h2 = Math.sin(level.id * 39.346 + shot * 11.135) * 24634.6345;
    const f1 = h1 - Math.floor(h1);
    const f2 = h2 - Math.floor(h2);
    s = Math.round(w.s * (0.6 + 0.6 * f1) * 10) / 10;
    d = Math.round(w.d + (f2 - 0.5) * w.shift);
  }
  const rad = (d * Math.PI) / 180;
  return { s, d, x: Math.cos(rad) * s, z: -Math.sin(rad) * s };
}

/** Human-readable objective lines for the HUD and level cards. */
export function objectiveLines(level) {
  const o = level.objective;
  const out = [];
  if (o.all) out.push(level.targets.length > 1 ? `Hit all ${level.targets.length} targets` : "Hit the target");
  if (o.score) out.push(`Score ${o.score}+ points`);
  if (o.gold) out.push(`${o.gold} gold hit${o.gold > 1 ? "s" : ""} (9+)`);
  return out;
}

/** Short tags describing what's special about a level (level cards / intro). */
export function levelTags(level) {
  const tags = [];
  const moving = level.targets.some((t) => t.motion);
  if (moving) tags.push("Moving");
  if (level.obstacles.length) tags.push("Obstacles");
  if (level.wind.s) tags.push(level.wind.shift ? "Gusts" : "Wind");
  const far = Math.max(...level.targets.map((t) => -t.z));
  if (far >= 45) tags.push("Long range");
  if (Math.min(...level.targets.map((t) => t.r)) <= 0.36) tags.push("Precision");
  return tags;
}
