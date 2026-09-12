/**
 * Bomb Squad — 60 data-driven missions across 6 operations (10 each). Built
 * once at module load by a small deterministic generator (no hand-written
 * 60-entry literal, no runtime randomness): Operation 1 is hand-authored
 * per the exact teaching curve it needs (module-by-module introduction);
 * Operations 2-6 are produced by buildOperationMissions() from a per-
 * operation module pool + difficulty curve. A mission's *puzzle* content is
 * generated later, from this config, by systems/moduleFactory.js (seeded by
 * mission id — see utils/random.js) — this file only decides shape:
 * timer, strikes, which module types, dependencies, and bonus objective.
 */
import { OPERATIONS } from "./operations.js";
import { makeRng, sample, randInt } from "../utils/random.js";

const POOL_TRAINING = ["colorWires", "symbolMatch", "switchOrder", "memoryLights", "rotaryDial"];
const POOL_CITY = POOL_TRAINING;
const POOL_UNDERGROUND = [...POOL_CITY, "signalRouter"];
const POOL_INDUSTRIAL = [...POOL_UNDERGROUND, "codeChip", "pressureBar"];
const POOL_ARCTIC = [...POOL_INDUSTRIAL, "gridLink"];
const POOL_BLACKSITE = [...POOL_ARCTIC, "sequenceLock"];
const POOLS = [POOL_TRAINING, POOL_CITY, POOL_UNDERGROUND, POOL_INDUSTRIAL, POOL_ARCTIC, POOL_BLACKSITE];

// Local-index (0-based within its operation) slots that must introduce a
// brand-new module type, so the player meets it before it's mixed in.
const INTRODUCE_AT = {
  2: { 0: ["signalRouter"] },
  3: { 0: ["codeChip"], 1: ["pressureBar"] },
  4: { 0: ["gridLink"] },
  5: { 0: ["sequenceLock"] },
};

const round5 = (n) => Math.round(n / 5) * 5;
const mod = (type, difficulty, dependsOn) => ({ type, difficulty, ...(dependsOn != null ? { dependsOn } : {}) });

function bonusFor(id) {
  return id % 3 === 0 ? { type: "time-bonus", threshold: 0.35 } : { type: "no-strikes" };
}

/* --------------------------------------------------- Operation 1 (hand-authored) */

const TRAINING_MISSIONS = [
  { id: 1, timer: 90, maxStrikes: 3, modules: [mod("colorWires", 1)] },
  { id: 2, timer: 90, maxStrikes: 3, modules: [mod("colorWires", 1), mod("symbolMatch", 1)] },
  { id: 3, timer: 85, maxStrikes: 3, modules: [mod("colorWires", 1), mod("switchOrder", 1)] },
  { id: 4, timer: 85, maxStrikes: 3, modules: [mod("symbolMatch", 1), mod("memoryLights", 1)] },
  { id: 5, timer: 85, maxStrikes: 3, modules: [mod("colorWires", 1), mod("symbolMatch", 1), mod("switchOrder", 1)] },
  { id: 6, timer: 80, maxStrikes: 3, modules: [mod("switchOrder", 1), mod("memoryLights", 1), mod("colorWires", 2)] },
  { id: 7, timer: 80, maxStrikes: 3, modules: [mod("colorWires", 2), mod("symbolMatch", 2), mod("memoryLights", 1)] },
  { id: 8, timer: 80, maxStrikes: 3, modules: [mod("colorWires", 1), mod("symbolMatch", 2), mod("switchOrder", 2), mod("rotaryDial", 1)] },
  { id: 9, timer: 75, maxStrikes: 3, modules: [mod("symbolMatch", 2), mod("switchOrder", 2), mod("memoryLights", 2), mod("rotaryDial", 1)] },
  {
    id: 10,
    timer: 75,
    maxStrikes: 3,
    label: "CERTIFICATION DEVICE",
    special: "Clear all 4 modules to graduate.",
    modules: [mod("colorWires", 2), mod("symbolMatch", 2), mod("switchOrder", 2), mod("memoryLights", 2)],
  },
].map((m) => ({ ...m, operation: "training-facility", strikePenalty: 0, bonus: bonusFor(m.id) }));

/* --------------------------------------------------------- Operations 2-6 */

const OP_TUNING = [
  null, // index 0 is training, handled above
  { countRange: [3, 4], strikePenalty: 3, timerBase: 75, timerStep: 2, timerFloor: 55, strikes: (li) => (li < 5 ? 3 : 2), depFrom: 4, depChance: 0.5 },
  { countRange: [3, 5], strikePenalty: 4, timerBase: 70, timerStep: 2, timerFloor: 50, strikes: () => 2, depFrom: 2, depChance: 0.65 },
  { countRange: [4, 5], strikePenalty: 5, timerBase: 65, timerStep: 2, timerFloor: 45, strikes: (li) => (li < 8 ? 2 : 1), depFrom: 1, depChance: 0.7 },
  { countRange: [4, 6], strikePenalty: 5, timerBase: 60, timerStep: 2, timerFloor: 40, strikes: (li) => (li < 6 ? 2 : 1), depFrom: 1, depChance: 0.75 },
  { countRange: [5, 6], strikePenalty: 6, timerBase: 65, timerStep: 2, timerFloor: 45, strikes: () => 1, depFrom: 0, depChance: 0.8 },
];

function moduleCountFor(opIndex, li, tuning) {
  const [lo, hi] = tuning.countRange;
  const span = hi - lo;
  if (!span) return lo;
  // roughly linear ramp across the operation's 10 missions
  return lo + Math.min(span, Math.floor((li / 9) * span + 0.5));
}

function difficultyFor(opIndex, li) {
  return Math.min(4, 1 + Math.floor(li / 3) + Math.floor(opIndex / 2));
}

function buildOperationMissions(opIndex) {
  const op = OPERATIONS[opIndex];
  const tuning = OP_TUNING[opIndex];
  const pool = POOLS[opIndex];
  const introduce = INTRODUCE_AT[opIndex] || {};
  const missions = [];

  for (let li = 0; li < 10; li++) {
    const id = op.range[0] + li;
    const rng = makeRng("mission-shape", id);
    const count = Math.max(1, moduleCountFor(opIndex, li, tuning));
    const forced = introduce[li] || [];
    const rest = pool.filter((t) => !forced.includes(t));
    const picked = [...forced, ...sample(rng, rest, Math.max(0, count - forced.length))].slice(0, count);
    const difficulty = difficultyFor(opIndex, li);

    const modules = picked.map((type) => mod(type, difficulty));

    let special = null;
    if (li >= tuning.depFrom && modules.length >= 2 && rng() < tuning.depChance) {
      const b = randInt(rng, 1, modules.length - 1);
      const a = randInt(rng, 0, b - 1);
      modules[b] = { ...modules[b], dependsOn: a };
      special = `${moduleDisplayName(modules[a].type)} must be solved first.`;
    }

    const timer = round5(Math.max(tuning.timerFloor, tuning.timerBase - tuning.timerStep * li));

    missions.push({
      id,
      operation: op.id,
      timer,
      maxStrikes: tuning.strikes(li),
      strikePenalty: tuning.strikePenalty,
      modules,
      special,
      bonus: bonusFor(id),
    });
  }
  return missions;
}

function moduleDisplayName(type) {
  const names = {
    colorWires: "Color Wires",
    symbolMatch: "Symbol Match",
    switchOrder: "Switch Order",
    memoryLights: "Memory Lights",
    rotaryDial: "Rotary Dial",
    signalRouter: "Signal Router",
    codeChip: "Code Chip",
    pressureBar: "Pressure Bar",
    gridLink: "Grid Link",
    sequenceLock: "Sequence Lock",
  };
  return names[type] || type;
}

/* ------------------------------------------------------------ Mission 60 */

// Final Protocol — hand-authored per the suggested order, overriding
// whatever the generic op-5 generator would have produced for id 60.
const FINAL_PROTOCOL = {
  id: 60,
  operation: "black-site",
  timer: 100,
  maxStrikes: 2,
  strikePenalty: 6,
  label: "FINAL PROTOCOL",
  special: "Signal Router must be solved first. Sequence Lock unlocks Pressure Bar.",
  modules: [
    mod("signalRouter", 4),
    mod("colorWires", 4, 0),
    mod("memoryLights", 4, 0),
    mod("rotaryDial", 4, 0),
    mod("sequenceLock", 4, 0),
    mod("pressureBar", 4, 4),
  ],
  bonus: { type: "no-strikes" },
};

/* ------------------------------------------------------------------ build */

export const TOTAL_MISSIONS = 60;

export const MISSIONS = [
  ...TRAINING_MISSIONS,
  ...buildOperationMissions(1),
  ...buildOperationMissions(2),
  ...buildOperationMissions(3),
  ...buildOperationMissions(4),
  ...buildOperationMissions(5).slice(0, 9),
  FINAL_PROTOCOL,
];

const BY_ID = new Map(MISSIONS.map((m) => [m.id, m]));

export function getMission(id) {
  return BY_ID.get(id) || null;
}

export function missionsForOperation(opId) {
  return MISSIONS.filter((m) => m.operation === opId).sort((a, b) => a.id - b.id);
}

export { moduleDisplayName };
