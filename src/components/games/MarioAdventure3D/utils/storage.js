/**
 * Mario Adventure 3D — versioned localStorage save (`mario-adventure-3d-progress`).
 *
 * Every load goes through `sanitize`, so a missing, corrupt, partial or
 * hand-edited save always becomes a valid one: unknown keys dropped, numbers
 * clamped, NaN / negatives discarded, ids range-checked. Nothing here throws.
 * Unlocks are DERIVED from completions (never trusted from disk):
 *   level 1 is open; finishing a level opens the next; a world opens when
 *   its first level does (i.e. the previous world's boss is beaten).
 * Stars per level are three independent flags merged across runs:
 *   clear · coin goal reached · hidden star found.
 */
export const SAVE_KEY = "mario-adventure-3d-progress";
export const SAVE_VERSION = 1;
export const LEVEL_COUNT = 30;
export const PER_WORLD = 6;

export const DEFAULT_SETTINGS = {
  master: 0.85,
  music: 0.6,
  sfx: 0.9,
  graphics: "medium",
  sensitivity: 1,
  invertY: false,
  camDistance: 7.4,
  camAssist: true,
  reducedMotion: false,
  showHints: true,
};

export const STAT_KEYS = ["levelsPlayed", "completions", "jumps", "stomps", "enemies", "coins", "deaths", "falls", "hits", "powerups", "secrets", "blocks", "bossesDefeated", "playTime", "distance"];

export function defaultProgress() {
  const statistics = {};
  for (const k of STAT_KEYS) statistics[k] = 0;
  return {
    version: SAVE_VERSION,
    completedLevels: {},
    stars: {},
    bestCoins: {},
    bestTimes: {},
    totalCoins: 0,
    unlockedLevels: [1],
    unlockedWorlds: [1],
    statistics,
    settings: { ...DEFAULT_SETTINGS },
    lastLevel: 1,
    seenIntro: false,
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
  if (isObj(raw.stars)) {
    for (const [k, v] of Object.entries(raw.stars)) {
      if (!validId(k) || !isObj(v)) continue;
      const s = { clear: v.clear === true || !!p.completedLevels[k], coins: v.coins === true, hidden: v.hidden === true };
      if (s.clear || s.coins || s.hidden) p.stars[k] = s;
    }
  }
  // a cleared level always has its first star
  for (const k of Object.keys(p.completedLevels)) p.stars[k] = { coins: false, hidden: false, ...(p.stars[k] || {}), clear: true };
  if (isObj(raw.bestCoins)) for (const [k, v] of Object.entries(raw.bestCoins)) if (validId(k)) p.bestCoins[k] = Math.round(num(v, 0, 999, 0));
  if (isObj(raw.bestTimes)) for (const [k, v] of Object.entries(raw.bestTimes)) if (validId(k) && typeof v === "number" && Number.isFinite(v) && v > 1 && v < 36000) p.bestTimes[k] = Math.round(v * 100) / 100;
  p.totalCoins = Math.round(num(raw.totalCoins, 0, 1e9, 0));
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
    camDistance: num(s.camDistance, 4.6, 11, DEFAULT_SETTINGS.camDistance),
    camAssist: bool(s.camAssist, true),
    reducedMotion: bool(s.reducedMotion, false),
    showHints: bool(s.showHints, true),
  };
  p.seenIntro = bool(raw.seenIntro, false);
  p.lastLevel = validId(raw.lastLevel) ? Number(raw.lastLevel) : 1;
  derive(p);
  if (!isUnlocked(p, p.lastLevel)) p.lastLevel = 1;
  return p;
}

export function derive(p) {
  p.unlockedLevels = [];
  for (let i = 1; i <= LEVEL_COUNT; i++) if (isUnlocked(p, i)) p.unlockedLevels.push(i);
  p.unlockedWorlds = [];
  for (let w = 1; w <= 5; w++) if (isUnlocked(p, (w - 1) * PER_WORLD + 1)) p.unlockedWorlds.push(w);
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

/* ------------------------------------------------------------------ derived helpers */
export function isUnlocked(p, id) {
  if (id === 1) return true;
  return !!p.completedLevels[id - 1] || !!p.completedLevels[id];
}
export function starCount(p, id) {
  const s = p.stars[id];
  return s ? (s.clear ? 1 : 0) + (s.coins ? 1 : 0) + (s.hidden ? 1 : 0) : 0;
}
export function totalStars(p) {
  let n = 0;
  for (const k of Object.keys(p.stars)) n += starCount(p, k);
  return n;
}
export function worldProgress(p, w) {
  let done = 0;
  let stars = 0;
  for (let i = (w - 1) * PER_WORLD + 1; i <= w * PER_WORLD; i++) {
    if (p.completedLevels[i]) done++;
    stars += starCount(p, i);
  }
  return { done, stars, total: PER_WORLD, maxStars: PER_WORLD * 3, unlocked: isUnlocked(p, (w - 1) * PER_WORLD + 1) };
}
export function nextUnlockedLevel(p) {
  for (let i = 1; i <= LEVEL_COUNT; i++) if (!p.completedLevels[i] && isUnlocked(p, i)) return i;
  return LEVEL_COUNT;
}

/**
 * Apply a finished level. run = { id, stars:{clear,coins,hidden}, coins, time, boss }
 * Returns { progress, unlocked: [ids], newStars: n, newBest: bool, firstClear }
 */
export function applyRun(p, run) {
  const id = String(run.id);
  const old = p.stars[id] || { clear: false, coins: false, hidden: false };
  const merged = { clear: true, coins: old.coins || !!run.stars.coins, hidden: old.hidden || !!run.stars.hidden };
  const n = {
    ...p,
    completedLevels: { ...p.completedLevels, [id]: true },
    stars: { ...p.stars, [id]: merged },
    bestCoins: { ...p.bestCoins, [id]: Math.max(p.bestCoins[id] || 0, run.coins | 0) },
    bestTimes: { ...p.bestTimes },
    statistics: { ...p.statistics },
  };
  let newBest = false;
  if (typeof run.time === "number" && run.time > 1 && (!(p.bestTimes[id] > 0) || run.time < p.bestTimes[id])) {
    newBest = p.bestTimes[id] > 0;
    n.bestTimes[id] = Math.round(run.time * 100) / 100;
  }
  n.statistics.completions += 1;
  if (run.boss && !p.completedLevels[id]) n.statistics.bossesDefeated += 1;
  const unlocked = [];
  const nid = Number(id) + 1;
  if (nid <= LEVEL_COUNT && !isUnlocked(p, nid)) unlocked.push(nid);
  n.lastLevel = nid <= LEVEL_COUNT ? nid : Number(id);
  derive(n);
  const before = (old.clear ? 1 : 0) + (old.coins ? 1 : 0) + (old.hidden ? 1 : 0);
  const after = 1 + (merged.coins ? 1 : 0) + (merged.hidden ? 1 : 0);
  return { progress: n, unlocked, newStars: after - before, newBest, firstClear: !p.completedLevels[id] };
}

/** add one run's counters (on finish, quit, restart or game over) */
export function addRunStats(p, s) {
  const st = { ...p.statistics };
  for (const k of ["jumps", "stomps", "enemies", "coins", "falls", "hits", "powerups", "secrets", "blocks", "distance", "playTime", "deaths"]) {
    const v = s[k];
    if (typeof v === "number" && Number.isFinite(v) && v > 0) st[k] += v;
  }
  st.levelsPlayed += 1;
  return { ...p, statistics: st, totalCoins: p.totalCoins + Math.max(0, s.coins | 0) };
}
