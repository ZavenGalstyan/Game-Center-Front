/**
 * Dimension Dash — versioned localStorage save (`dimension-dash-progress`).
 *
 * Every load goes through `sanitize`, so a missing, corrupt, partial or
 * hand-edited save always becomes a valid one: unknown keys dropped, numbers
 * clamped, NaN / negatives discarded, ids range-checked. Nothing here throws.
 * Unlocks are DERIVED from completions (never trusted from disk):
 *   level 1 is open; finishing a level opens the next one.
 */
import { rankValue } from "./rank.js";

export const SAVE_KEY = "dimension-dash-progress";
export const SAVE_VERSION = 1;
export const LEVEL_COUNT = 30;
export const PER_WORLD = 6;

export const DEFAULT_SETTINGS = {
  master: 0.85,
  music: 0.55,
  sfx: 0.9,
  graphics: "medium",
  sensitivity: 1,
  invertY: false,
  camDistance: 7.6,
  camAssist: true,
  reducedMotion: false,
  showHints: true,
};

export const STAT_KEYS = ["levelsPlayed", "completions", "jumps", "enemies", "rings", "deaths", "falls", "hits", "homing", "grinds", "spinDashes", "loops", "redStars", "monitors", "shifts", "bossesDefeated", "playTime", "distance", "topSpeed"];

export function defaultProgress() {
  const statistics = {};
  for (const k of STAT_KEYS) statistics[k] = 0;
  return {
    version: SAVE_VERSION,
    completedLevels: {},
    bestTimes: {},
    bestRanks: {},
    bestScores: {},
    redStars: {},
    totalRings: 0,
    unlockedLevels: [1],
    statistics,
    settings: { ...DEFAULT_SETTINGS },
    lastLevel: 1,
  };
}

const num = (v, lo, hi, d) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
const bool = (v, d) => (typeof v === "boolean" ? v : d);
const oneOf = (v, list, d) => (list.includes(v) ? v : d);
const validId = (k) => {
  const n = Number(k);
  return Number.isInteger(n) && n >= 1 && n <= LEVEL_COUNT;
};
const isObj = (o) => o && typeof o === "object" && !Array.isArray(o);

export function sanitize(raw) {
  const p = defaultProgress();
  if (!isObj(raw)) return p;
  if (isObj(raw.completedLevels)) for (const [k, v] of Object.entries(raw.completedLevels)) if (validId(k) && v === true) p.completedLevels[k] = true;
  if (isObj(raw.bestTimes)) for (const [k, v] of Object.entries(raw.bestTimes)) if (validId(k) && typeof v === "number" && Number.isFinite(v) && v > 1 && v < 36000) p.bestTimes[k] = Math.round(v * 100) / 100;
  if (isObj(raw.bestRanks)) for (const [k, v] of Object.entries(raw.bestRanks)) if (validId(k) && rankValue(v) >= 0) p.bestRanks[k] = v;
  if (isObj(raw.bestScores)) for (const [k, v] of Object.entries(raw.bestScores)) if (validId(k)) p.bestScores[k] = Math.round(num(v, 0, 1e8, 0));
  if (isObj(raw.redStars)) {
    for (const [k, v] of Object.entries(raw.redStars)) {
      if (!validId(k) || !Array.isArray(v)) continue;
      const f = [0, 1, 2].map((i) => v[i] === true);
      if (f.some(Boolean)) p.redStars[k] = f;
    }
  }
  // a time / rank only exists for completed levels
  for (const k of Object.keys(p.bestTimes)) if (!p.completedLevels[k]) delete p.bestTimes[k];
  for (const k of Object.keys(p.bestRanks)) if (!p.completedLevels[k]) delete p.bestRanks[k];
  p.totalRings = Math.round(num(raw.totalRings, 0, 1e9, 0));
  const st = isObj(raw.statistics) ? raw.statistics : {};
  for (const k of STAT_KEYS) p.statistics[k] = num(st[k], 0, 1e12, 0);
  const s = isObj(raw.settings) ? raw.settings : {};
  p.settings = {
    master: num(s.master, 0, 1, DEFAULT_SETTINGS.master),
    music: num(s.music, 0, 1, DEFAULT_SETTINGS.music),
    sfx: num(s.sfx, 0, 1, DEFAULT_SETTINGS.sfx),
    graphics: oneOf(s.graphics, ["low", "medium", "high"], DEFAULT_SETTINGS.graphics),
    sensitivity: num(s.sensitivity, 0.2, 3, DEFAULT_SETTINGS.sensitivity),
    invertY: bool(s.invertY, false),
    camDistance: num(s.camDistance, 5, 11, DEFAULT_SETTINGS.camDistance),
    camAssist: bool(s.camAssist, true),
    reducedMotion: bool(s.reducedMotion, false),
    showHints: bool(s.showHints, true),
  };
  p.lastLevel = validId(raw.lastLevel) ? Number(raw.lastLevel) : 1;
  derive(p);
  if (!isUnlocked(p, p.lastLevel)) p.lastLevel = 1;
  return p;
}

export function derive(p) {
  p.unlockedLevels = [];
  for (let i = 1; i <= LEVEL_COUNT; i++) if (isUnlocked(p, i)) p.unlockedLevels.push(i);
  return p;
}

export function loadProgress() {
  try {
    const s = window.localStorage.getItem(SAVE_KEY);
    if (!s) return defaultProgress();
    return sanitize(JSON.parse(s));
  } catch {
    return defaultProgress();
  }
}
export function saveProgress(p) {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(p));
    return true;
  } catch {
    return false;
  }
}

export function isUnlocked(p, id) {
  if (id === 1) return true;
  return !!p.completedLevels[id - 1] || !!p.completedLevels[id];
}
export function redStarCount(p, id) {
  const f = p.redStars[id];
  return f ? f.filter(Boolean).length : 0;
}
export function totalRedStars(p) {
  let n = 0;
  for (const k of Object.keys(p.redStars)) n += redStarCount(p, k);
  return n;
}
export function worldProgress(p, w) {
  let done = 0;
  let stars = 0;
  let s = 0;
  for (let i = (w - 1) * PER_WORLD + 1; i <= w * PER_WORLD; i++) {
    if (p.completedLevels[i]) done++;
    stars += redStarCount(p, i);
    if (p.bestRanks[i] === "S") s++;
  }
  return { done, stars, sRanks: s, total: PER_WORLD, unlocked: isUnlocked(p, (w - 1) * PER_WORLD + 1) };
}
export function nextUnlockedLevel(p, built) {
  for (let i = 1; i <= LEVEL_COUNT; i++) if (!p.completedLevels[i] && isUnlocked(p, i) && (!built || built.includes(i))) return i;
  return built && built.length ? built[built.length - 1] : 1;
}

/**
 * Apply a finished level. run = { id, time, rank, score, redStars:[b,b,b] }
 * Returns { progress, unlocked: [ids], newBestTime, newBestRank, firstClear }
 */
export function applyRun(p, run) {
  const id = String(run.id);
  const n = {
    ...p,
    completedLevels: { ...p.completedLevels, [id]: true },
    bestTimes: { ...p.bestTimes },
    bestRanks: { ...p.bestRanks },
    bestScores: { ...p.bestScores },
    redStars: { ...p.redStars },
    statistics: { ...p.statistics },
  };
  let newBestTime = false;
  if (typeof run.time === "number" && run.time > 1 && (!(p.bestTimes[id] > 0) || run.time < p.bestTimes[id])) {
    newBestTime = p.bestTimes[id] > 0;
    n.bestTimes[id] = Math.round(run.time * 100) / 100;
  }
  let newBestRank = false;
  if (!p.bestRanks[id] || rankValue(run.rank) > rankValue(p.bestRanks[id])) {
    newBestRank = !!p.bestRanks[id];
    n.bestRanks[id] = run.rank;
  }
  n.bestScores[id] = Math.max(p.bestScores[id] || 0, Math.round(run.score || 0));
  const old = p.redStars[id] || [false, false, false];
  n.redStars[id] = [0, 1, 2].map((i) => !!old[i] || !!(run.redStars && run.redStars[i]));
  n.statistics.completions += 1;
  if (run.boss && !p.completedLevels[id]) n.statistics.bossesDefeated += 1;
  const unlocked = [];
  const nid = Number(id) + 1;
  if (nid <= LEVEL_COUNT && !isUnlocked(p, nid)) unlocked.push(nid);
  n.lastLevel = nid <= LEVEL_COUNT ? nid : Number(id);
  derive(n);
  return { progress: n, unlocked, newBestTime, newBestRank, firstClear: !p.completedLevels[id] };
}

/** add one run's counters (on finish, quit, restart or game over) */
export function addRunStats(p, s) {
  const st = { ...p.statistics };
  for (const k of ["jumps", "enemies", "rings", "deaths", "falls", "hits", "homing", "grinds", "spinDashes", "loops", "redStars", "monitors", "shifts", "playTime", "distance"]) {
    const v = s[k];
    if (typeof v === "number" && Number.isFinite(v) && v > 0) st[k] += v;
  }
  if (typeof s.topSpeed === "number" && Number.isFinite(s.topSpeed)) st.topSpeed = Math.max(st.topSpeed, s.topSpeed);
  st.levelsPlayed += 1;
  return { ...p, statistics: st, totalRings: p.totalRings + Math.max(0, s.rings | 0) };
}
