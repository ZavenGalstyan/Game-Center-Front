/**
 * Highway Racer — saved progress in localStorage under ONE key,
 * `highway-racer-progress` (never touches any other game's keys).
 *
 * Versioned and sanitised field by field: a missing save, corrupt JSON, an
 * older version, an unknown car, negative coins or junk statistics all fall
 * back to safe defaults — a bad save can never crash the Game Center.
 *
 * Only permanent progress is stored (records, coins, cars, theme, stats,
 * settings). Nothing about a run in progress is ever written.
 */
import { CARS, STARTER_CAR } from "../data/cars.js";
import { ENVIRONMENTS } from "../data/environments.js";

export const STORAGE_KEY = "highway-racer-progress";
export const SAVE_VERSION = 1;

export const DEFAULT_SETTINGS = {
  sound: 0.8,
  music: 0.45,
  sfx: 0.9,
  graphics: "medium",
  shadows: "low",
  particles: "normal",
  cameraShake: "normal",
  speedEffects: true,
  reducedMotion: false,
  controlHelp: true,
};

export const STAT_KEYS = [
  "runs", "totalDistance", "bestDistance", "bestScore", "highestSpeed", "carsPassed", "nearMisses", "bestCombo",
  "coinsCollected", "boostsUsed", "crashes", "longestRun", "playTime",
];

export function defaultProgress() {
  return {
    version: SAVE_VERSION,
    bestDistance: 0,
    bestScore: 0,
    coins: 0,
    unlockedCars: [STARTER_CAR],
    selectedCar: STARTER_CAR,
    selectedEnvironment: ENVIRONMENTS[0].id,
    statistics: Object.fromEntries(STAT_KEYS.map((k) => [k, 0])),
    settings: { ...DEFAULT_SETTINGS },
  };
}

const num = (v, d = 0, lo = 0, hi = 1e12) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
const int = (v, d = 0, lo = 0, hi = 1e12) => Math.floor(num(v, d, lo, hi));
const pick = (v, list, d) => (list.includes(v) ? v : d);
const bool = (v, d) => (typeof v === "boolean" ? v : d);

function sanitizeSettings(s) {
  const D = DEFAULT_SETTINGS;
  if (!s || typeof s !== "object") return { ...D };
  return {
    sound: num(s.sound, D.sound, 0, 1),
    music: num(s.music, D.music, 0, 1),
    sfx: num(s.sfx, D.sfx, 0, 1),
    graphics: pick(s.graphics, ["low", "medium", "high"], D.graphics),
    shadows: pick(s.shadows, ["off", "low", "high"], D.shadows),
    particles: pick(s.particles, ["low", "normal"], D.particles),
    cameraShake: pick(s.cameraShake, ["off", "low", "normal"], D.cameraShake),
    speedEffects: bool(s.speedEffects, D.speedEffects),
    reducedMotion: bool(s.reducedMotion, D.reducedMotion),
    controlHelp: bool(s.controlHelp, D.controlHelp),
  };
}

export function sanitize(raw) {
  const d = defaultProgress();
  if (!raw || typeof raw !== "object") return d;
  // (version 1 is the first format; future migrations go here, keyed on raw.version)
  const ids = CARS.map((c) => c.id);
  const unlocked = Array.isArray(raw.unlockedCars) ? [...new Set(raw.unlockedCars.filter((id) => ids.includes(id)))] : [];
  if (!unlocked.includes(STARTER_CAR)) unlocked.unshift(STARTER_CAR);
  const selected = unlocked.includes(raw.selectedCar) ? raw.selectedCar : STARTER_CAR;
  const st = raw.statistics && typeof raw.statistics === "object" ? raw.statistics : {};
  const statistics = {};
  for (const k of STAT_KEYS) statistics[k] = k === "bestCombo" ? int(st[k], 0, 0, 4) : num(st[k], 0, 0);
  for (const k of ["runs", "carsPassed", "nearMisses", "coinsCollected", "boostsUsed", "crashes"]) statistics[k] = Math.floor(statistics[k]);
  const bestDistance = Math.max(num(raw.bestDistance, 0), statistics.bestDistance);
  const bestScore = Math.max(int(raw.bestScore, 0), statistics.bestScore);
  statistics.bestDistance = bestDistance;
  statistics.bestScore = bestScore;
  const envIds = ENVIRONMENTS.map((e) => e.id);
  let env = pick(raw.selectedEnvironment, envIds, d.selectedEnvironment);
  const envDef = ENVIRONMENTS.find((e) => e.id === env);
  if (envDef && bestDistance < envDef.unlockKm * 1000) env = d.selectedEnvironment;
  return {
    version: SAVE_VERSION,
    bestDistance,
    bestScore,
    coins: int(raw.coins, 0, 0),
    unlockedCars: unlocked,
    selectedCar: selected,
    selectedEnvironment: env,
    statistics,
    settings: sanitizeSettings(raw.settings),
  };
}

export function loadProgress() {
  try {
    const text = window.localStorage.getItem(STORAGE_KEY);
    if (!text) return defaultProgress();
    return sanitize(JSON.parse(text));
  } catch {
    return defaultProgress();
  }
}

export function saveProgress(p) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitize(p)));
    return true;
  } catch {
    return false;
  }
}

/** Fold a finished run into permanent progress. Returns { next, records }. */
export function applyRun(p, summary) {
  const st = { ...p.statistics };
  st.runs += 1;
  st.crashes += 1;
  st.totalDistance += summary.distance;
  st.carsPassed += summary.passed;
  st.nearMisses += summary.nearMisses;
  st.bestCombo = Math.max(st.bestCombo, summary.bestCombo);
  st.coinsCollected += summary.coins;
  st.boostsUsed += summary.boostsUsed;
  st.highestSpeed = Math.max(st.highestSpeed, summary.topSpeedKmh);
  st.longestRun = Math.max(st.longestRun, summary.time);
  st.playTime += summary.time;
  // no "NEW BEST" fanfare for the very first run — there was nothing to beat
  const hadRuns = p.statistics.runs > 0;
  const records = {
    distance: hadRuns && summary.distance > p.bestDistance + 0.5,
    score: hadRuns && summary.score > p.bestScore,
  };
  const bestDistance = Math.max(p.bestDistance, summary.distance);
  const bestScore = Math.max(p.bestScore, summary.score);
  st.bestDistance = bestDistance;
  st.bestScore = bestScore;
  return {
    next: { ...p, bestDistance, bestScore, coins: p.coins + summary.coins, statistics: st },
    records,
  };
}
