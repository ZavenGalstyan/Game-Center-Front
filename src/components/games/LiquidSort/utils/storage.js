/**
 * Liquid Sort — localStorage persistence. One namespaced key:
 * `liquid-sort-progress`. Every read merges onto defaults and re-validates
 * each field, so an older save can never crash a newer build. Nothing here
 * touches any other game's storage key.
 *
 * Writes happen on meaningful events only (level complete, settings change,
 * cosmetic pick, leaving gameplay) — never inside an animation frame.
 */
import { TOTAL_LEVELS } from "../data/chapters.js";
import { betterOf } from "./progression.js";

const KEY = "liquid-sort-progress";

export const DEFAULT_SETTINGS = {
  graphics: "high", // low | medium | high
  sound: true,
  music: true,
  animations: true,
  colorAssist: false,
};

export const DEFAULT_STATE = {
  unlockedLevel: 1,
  currentLevel: 1,
  levels: {}, // { [id]: { completed, stars, bestMoves } }
  cosmetics: { bottleStyle: "classic", theme: "soft-lab" },
  settings: { ...DEFAULT_SETTINGS },
  savedPuzzle: null, // { levelId, board, moves, history } — resume-on-refresh
  statistics: {
    totalMoves: 0,
    totalPours: 0,
    perfectSolves: 0,
    hintsUsed: 0,
    undoesUsed: 0,
    levelsCompleted: 0,
    totalStars: 0,
  },
};

const GRAPHICS = ["low", "medium", "high"];

function readJSON() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "null");
  } catch {
    return null;
  }
}
function writeJSON(v) {
  try {
    localStorage.setItem(KEY, JSON.stringify(v));
  } catch {
    /* storage unavailable — session just won't persist */
  }
}

export function sanitizeSettings(raw) {
  const s = { ...DEFAULT_SETTINGS, ...(raw || {}) };
  if (!GRAPHICS.includes(s.graphics)) s.graphics = "high";
  s.sound = Boolean(s.sound);
  s.music = Boolean(s.music);
  s.animations = Boolean(s.animations);
  s.colorAssist = Boolean(s.colorAssist);
  return s;
}

export function loadState() {
  const raw = readJSON() || {};
  const state = {
    ...DEFAULT_STATE,
    ...raw,
    settings: sanitizeSettings(raw.settings),
    statistics: { ...DEFAULT_STATE.statistics, ...(raw.statistics || {}) },
    cosmetics: { ...DEFAULT_STATE.cosmetics, ...(raw.cosmetics || {}) },
  };

  const unlocked = Number.isInteger(raw.unlockedLevel) ? raw.unlockedLevel : 1;
  state.unlockedLevel = Math.min(TOTAL_LEVELS, Math.max(1, unlocked));
  state.currentLevel = Math.min(
    TOTAL_LEVELS,
    Math.max(1, Number.isInteger(raw.currentLevel) ? raw.currentLevel : 1),
  );

  state.levels = {};
  if (raw.levels && typeof raw.levels === "object") {
    for (const [k, l] of Object.entries(raw.levels)) {
      const id = Number(k);
      if (!Number.isInteger(id) || id < 1 || id > TOTAL_LEVELS || !l) continue;
      state.levels[id] = {
        completed: Boolean(l.completed),
        stars: [0, 1, 2, 3].includes(l.stars) ? l.stars : 0,
        bestMoves: Number.isFinite(l.bestMoves) ? Math.max(0, Math.floor(l.bestMoves)) : null,
      };
    }
  }

  state.savedPuzzle =
    raw.savedPuzzle && typeof raw.savedPuzzle === "object" && Array.isArray(raw.savedPuzzle.board)
      ? raw.savedPuzzle
      : null;

  for (const key of Object.keys(state.statistics)) {
    const v = state.statistics[key];
    state.statistics[key] = Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0;
  }
  return state;
}

export function saveState(state) {
  writeJSON({
    unlockedLevel: state.unlockedLevel,
    currentLevel: state.currentLevel,
    levels: state.levels,
    cosmetics: state.cosmetics,
    settings: state.settings,
    savedPuzzle: state.savedPuzzle,
    statistics: state.statistics,
  });
}

/**
 * Fold a completed level into persistent state. Pure — returns a new state.
 * Never downgrades bestMoves/stars; unlocks the next level on first clear.
 */
export function applyLevelComplete(state, levelId, moves, stars) {
  const prev = state.levels[levelId] || { completed: false, stars: 0, bestMoves: null };
  const firstClear = !prev.completed;
  const { stars: bestStars, bestMoves } = betterOf(prev.stars, prev.bestMoves, stars, moves);
  const improved = bestStars > prev.stars;

  const next = {
    ...state,
    levels: { ...state.levels, [levelId]: { completed: true, stars: bestStars, bestMoves } },
    statistics: { ...state.statistics },
    savedPuzzle: null,
  };

  if (firstClear) {
    next.unlockedLevel = Math.min(TOTAL_LEVELS, Math.max(state.unlockedLevel, levelId + 1));
    next.statistics.levelsCompleted += 1;
  }
  if (stars === 3 && (firstClear || prev.stars < 3)) next.statistics.perfectSolves += 1;

  const starDelta = bestStars - prev.stars;
  if (starDelta > 0) next.statistics.totalStars += starDelta;
  else if (!prev.completed) next.statistics.totalStars += bestStars;

  next.statistics.totalMoves += moves;

  return { state: next, firstClear, improved };
}

export function recordPour(state) {
  return { ...state, statistics: { ...state.statistics, totalPours: state.statistics.totalPours + 1 } };
}
export function recordHint(state) {
  return { ...state, statistics: { ...state.statistics, hintsUsed: state.statistics.hintsUsed + 1 } };
}
export function recordUndo(state) {
  return { ...state, statistics: { ...state.statistics, undoesUsed: state.statistics.undoesUsed + 1 } };
}

export function setCosmetic(state, key, value) {
  return { ...state, cosmetics: { ...state.cosmetics, [key]: value } };
}

export function saveCurrentPuzzle(state, levelId, board, moves) {
  return { ...state, savedPuzzle: { levelId, board, moves } };
}
export function clearCurrentPuzzle(state) {
  return { ...state, savedPuzzle: null };
}
