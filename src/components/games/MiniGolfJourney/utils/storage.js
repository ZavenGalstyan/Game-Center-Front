/**
 * Mini Golf Journey — localStorage persistence.
 *
 * One namespaced key, `gc_minigolf_journey`, holding progression, per-level
 * results, settings and lifetime stats. Every read is defensive: missing /
 * corrupt / partial data merges onto the defaults so an old save never breaks
 * a newer build. Nothing here touches Classic Chess or Fishing Journey storage.
 *
 * Writes happen only on meaningful events (level complete, settings change) —
 * never inside an animation frame.
 */

import { LEVELS, getLevel } from "../data/levels.js";
import { WORLDS } from "../data/worlds.js";
import { starsFor } from "./scoring.js";

const KEY = "gc_minigolf_journey";
const MAX_LEVEL = LEVELS.length; // 50

export const DEFAULT_SETTINGS = {
  graphics: "high", // low | medium | high
  sound: true,
  animations: true,
  aimGuide: true,
};

export const DEFAULT_STATE = {
  currentLevel: 1,
  unlockedLevels: [1],
  unlockedWorlds: [1],
  results: {}, // { [levelId]: { completed, bestStrokes, stars, holeInOne } }
  settings: { ...DEFAULT_SETTINGS },
  stats: {
    totalShots: 0,
    levelsCompleted: 0,
    starsEarned: 0,
    holeInOnes: 0,
    worldsCompleted: 0,
    bestScore: null, // best strokes-vs-par on a single hole (most under par)
    attempts: 0,
  },
};

function readJSON() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "null");
  } catch {
    return null;
  }
}
function writeJSON(value) {
  try {
    localStorage.setItem(KEY, JSON.stringify(value));
  } catch {
    /* storage unavailable — progress just won't persist */
  }
}

function cleanIntList(list, min, max) {
  if (!Array.isArray(list)) return [];
  return [...new Set(list.map((n) => Math.floor(Number(n))).filter((n) => n >= min && n <= max))].sort(
    (a, b) => a - b,
  );
}

export function loadState() {
  const raw = readJSON() || {};
  const state = {
    ...DEFAULT_STATE,
    ...raw,
    settings: sanitizeSettings(raw.settings),
    stats: { ...DEFAULT_STATE.stats, ...(raw.stats || {}) },
  };

  state.unlockedLevels = cleanIntList(raw.unlockedLevels, 1, MAX_LEVEL);
  if (!state.unlockedLevels.includes(1)) state.unlockedLevels.unshift(1);
  state.unlockedWorlds = cleanIntList(raw.unlockedWorlds, 1, WORLDS.length);
  if (!state.unlockedWorlds.includes(1)) state.unlockedWorlds.unshift(1);

  state.results = {};
  if (raw.results && typeof raw.results === "object") {
    for (const [id, r] of Object.entries(raw.results)) {
      const lid = Number(id);
      if (!Number.isInteger(lid) || lid < 1 || lid > MAX_LEVEL || !r) continue;
      const best = Number.isFinite(r.bestStrokes) ? Math.max(1, Math.floor(r.bestStrokes)) : null;
      state.results[lid] = {
        completed: Boolean(r.completed),
        bestStrokes: best,
        stars: [0, 1, 2, 3].includes(r.stars) ? r.stars : 0,
        holeInOne: Boolean(r.holeInOne),
      };
    }
  }

  state.currentLevel =
    Number.isFinite(raw.currentLevel) && raw.currentLevel >= 1 && raw.currentLevel <= MAX_LEVEL
      ? Math.floor(raw.currentLevel)
      : 1;

  return recomputeStats(state);
}

export function sanitizeSettings(raw) {
  const s = { ...DEFAULT_SETTINGS, ...(raw || {}) };
  if (!["low", "medium", "high"].includes(s.graphics)) s.graphics = "high";
  s.sound = Boolean(s.sound);
  s.animations = Boolean(s.animations);
  s.aimGuide = Boolean(s.aimGuide);
  return s;
}

export function saveState(state) {
  writeJSON(state);
}

/** derive all aggregate stats from `results` so they can never drift */
export function recomputeStats(state) {
  let levelsCompleted = 0;
  let starsEarned = 0;
  let holeInOnes = 0;
  let bestScore = null;
  for (const [id, r] of Object.entries(state.results)) {
    if (!r.completed) continue;
    levelsCompleted += 1;
    starsEarned += r.stars || 0;
    if (r.holeInOne) holeInOnes += 1;
    const par = getLevel(id).par;
    if (r.bestStrokes != null) {
      const rel = r.bestStrokes - par;
      if (bestScore === null || rel < bestScore) bestScore = rel;
    }
  }
  let worldsCompleted = 0;
  for (const w of WORLDS) {
    const all = LEVELS.filter((l) => l.worldId === w.id).every(
      (l) => state.results[l.id] && state.results[l.id].completed,
    );
    if (all) worldsCompleted += 1;
  }
  state.stats = {
    ...state.stats,
    levelsCompleted,
    starsEarned,
    holeInOnes,
    worldsCompleted,
    bestScore,
  };
  return state;
}

/**
 * Record the outcome of a level. A worse replay never lowers best strokes or
 * stars. Returns { state, stars, best, firstClear, worldCleared }.
 */
export function applyResult(prevState, level, strokes, holeInOne) {
  const state = {
    ...prevState,
    results: { ...prevState.results },
    unlockedLevels: [...prevState.unlockedLevels],
    unlockedWorlds: [...prevState.unlockedWorlds],
    stats: { ...prevState.stats },
  };
  const stars = starsFor(strokes, level.par);
  const prev = state.results[level.id];
  const firstClear = !prev || !prev.completed;
  const best = prev && prev.bestStrokes != null ? Math.min(prev.bestStrokes, strokes) : strokes;
  const bestStars = Math.max(prev?.stars || 0, stars);

  state.results[level.id] = {
    completed: true,
    bestStrokes: best,
    stars: bestStars,
    holeInOne: Boolean(prev?.holeInOne) || Boolean(holeInOne),
  };

  state.stats.totalShots = (state.stats.totalShots || 0) + strokes;
  state.stats.attempts = (state.stats.attempts || 0) + 1;

  const nextId = level.id + 1;
  if (nextId <= MAX_LEVEL && !state.unlockedLevels.includes(nextId)) {
    state.unlockedLevels.push(nextId);
    state.unlockedLevels.sort((a, b) => a - b);
  }

  let worldCleared = false;
  if (level.levelNumber === 10 && level.worldId < WORLDS.length) {
    const nw = level.worldId + 1;
    if (!state.unlockedWorlds.includes(nw)) {
      state.unlockedWorlds.push(nw);
      state.unlockedWorlds.sort((a, b) => a - b);
    }
    worldCleared = true;
  }

  state.currentLevel = Math.max(state.currentLevel, Math.min(nextId, MAX_LEVEL));

  recomputeStats(state);
  return { state, stars: bestStars, thisStars: stars, best, firstClear, worldCleared };
}
