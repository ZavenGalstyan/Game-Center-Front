/**
 * Parking Master — localStorage persistence.
 *
 * One namespaced key, `parking-master-progress`. Every read merges onto the
 * defaults and re-validates each field so a save from an older build (or a
 * hand-edited one) can never crash a newer build.
 *
 * Writes happen only on meaningful events: finishing a level, changing a
 * setting, picking a car colour. Never inside a frame.
 *
 * Nothing here touches the keys used by Classic Chess, Fishing Journey,
 * Mini Golf Journey or Delivery Rush.
 */

import { TOTAL_LEVELS } from "../data/levels.js";

const KEY = "parking-master-progress";

export const CAR_COLORS = [
  { id: "white", hex: "#e9edf2", name: "Alpine White" },
  { id: "black", hex: "#1c2026", name: "Obsidian" },
  { id: "blue", hex: "#2f6fd6", name: "Marina Blue" },
  { id: "red", hex: "#d23b32", name: "Rosso" },
  { id: "silver", hex: "#a8b0b8", name: "Titanium Silver" },
];

export const CAR_BODIES = [
  { id: "compact", name: "Compact" },
  { id: "sedan", name: "Sedan" },
  { id: "suv", name: "SUV" },
];

export const DEFAULT_SETTINGS = {
  graphics: "high", // low | medium | high
  sound: true,
  music: true,
  camera: "default", // default | high
  steeringSensitivity: "medium", // low | medium | high
};

export const DEFAULT_STATE = {
  currentLevel: 1,
  unlockedLevel: 1,
  levels: {}, // { [id]: { completed, stars, bestTime, bestPrecision, bestScore } }
  selectedColor: "white",
  selectedBody: "compact",
  settings: { ...DEFAULT_SETTINGS },
  statistics: {
    levelsCompleted: 0,
    totalStars: 0,
    attempts: 0,
    collisions: 0,
    perfectParks: 0,
    drivingTime: 0, // seconds
    bestPrecision: 0,
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
    /* storage unavailable — session just will not persist */
  }
}

const COLOR_IDS = new Set(CAR_COLORS.map((c) => c.id));
const BODY_IDS = new Set(CAR_BODIES.map((b) => b.id));
const OPT = {
  graphics: ["low", "medium", "high"],
  camera: ["default", "high"],
  steeringSensitivity: ["low", "medium", "high"],
};

export function sanitizeSettings(raw) {
  const s = { ...DEFAULT_SETTINGS, ...(raw || {}) };
  if (!OPT.graphics.includes(s.graphics)) s.graphics = "high";
  if (!OPT.camera.includes(s.camera)) s.camera = "default";
  if (!OPT.steeringSensitivity.includes(s.steeringSensitivity)) s.steeringSensitivity = "medium";
  s.sound = Boolean(s.sound);
  s.music = Boolean(s.music);
  return s;
}

export function loadState() {
  const raw = readJSON() || {};
  const state = {
    ...DEFAULT_STATE,
    ...raw,
    settings: sanitizeSettings(raw.settings),
    statistics: { ...DEFAULT_STATE.statistics, ...(raw.statistics || {}) },
  };

  state.selectedColor = COLOR_IDS.has(raw.selectedColor) ? raw.selectedColor : "white";
  state.selectedBody = BODY_IDS.has(raw.selectedBody) ? raw.selectedBody : "compact";

  let unlocked = Number.isInteger(raw.unlockedLevel) ? raw.unlockedLevel : 1;
  unlocked = Math.min(TOTAL_LEVELS, Math.max(1, unlocked));

  state.levels = {};
  if (raw.levels && typeof raw.levels === "object") {
    for (const [k, l] of Object.entries(raw.levels)) {
      const id = Number(k);
      if (!Number.isInteger(id) || id < 1 || id > TOTAL_LEVELS || !l) continue;
      state.levels[id] = {
        completed: Boolean(l.completed),
        stars: [0, 1, 2, 3].includes(l.stars) ? l.stars : 0,
        bestTime: Number.isFinite(l.bestTime) ? Math.max(0, l.bestTime) : null,
        bestPrecision: Number.isFinite(l.bestPrecision) ? clamp(l.bestPrecision, 0, 100) : 0,
        bestScore: Number.isFinite(l.bestScore) ? Math.max(0, Math.floor(l.bestScore)) : 0,
      };
    }
  }
  state.unlockedLevel = unlocked;
  state.currentLevel = Math.min(
    TOTAL_LEVELS,
    Math.max(1, Number.isInteger(raw.currentLevel) ? raw.currentLevel : 1),
  );

  for (const key of Object.keys(state.statistics)) {
    const v = state.statistics[key];
    state.statistics[key] = Number.isFinite(v) ? Math.max(0, v) : 0;
  }

  return state;
}

export function saveState(state) {
  writeJSON({
    currentLevel: state.currentLevel,
    unlockedLevel: state.unlockedLevel,
    levels: state.levels,
    selectedColor: state.selectedColor,
    selectedBody: state.selectedBody,
    settings: state.settings,
    statistics: state.statistics,
  });
}

/**
 * Fold a finished run into the persistent state. Pure — returns a new object.
 * `run` = { success, time, precision, collisions, stars, score, perfect }
 */
export function applyRun(state, levelId, run) {
  const next = {
    ...state,
    levels: { ...state.levels },
    statistics: { ...state.statistics },
  };

  next.statistics.attempts += 1;
  next.statistics.collisions += run.collisions || 0;
  next.statistics.drivingTime += Math.round(run.time || 0);

  if (!run.success) return next;

  const prev = state.levels[levelId] || {
    completed: false,
    stars: 0,
    bestTime: null,
    bestPrecision: 0,
    bestScore: 0,
  };

  const wasCompleted = prev.completed;
  const entry = {
    completed: true,
    stars: Math.max(prev.stars, run.stars),
    bestTime:
      prev.bestTime == null ? run.time : Math.min(prev.bestTime, run.time),
    bestPrecision: Math.max(prev.bestPrecision, run.precision),
    bestScore: Math.max(prev.bestScore, run.score),
  };
  next.levels[levelId] = entry;

  if (!wasCompleted) {
    next.statistics.levelsCompleted += 1;
    next.unlockedLevel = Math.min(TOTAL_LEVELS, Math.max(state.unlockedLevel, levelId + 1));
  }
  // total stars = sum of best stars across levels
  next.statistics.totalStars = Object.values(next.levels).reduce(
    (sum, l) => sum + (l.stars || 0),
    0,
  );
  next.statistics.bestPrecision = Math.max(next.statistics.bestPrecision, run.precision);
  if (run.perfect) next.statistics.perfectParks += 1;

  next.currentLevel = Math.min(TOTAL_LEVELS, levelId + (wasCompleted ? 0 : 1)) || levelId;

  return next;
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}
