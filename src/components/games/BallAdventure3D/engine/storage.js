/**
 * Ball Adventure 3D — localStorage persistence.
 *
 * One namespaced key, `ball-adventure-3d-progress`. Every read merges onto
 * defaults and re-validates each field so an older/hand-edited save can never
 * crash a newer build. Writes only happen on meaningful progression events
 * (level complete, settings change, skin change) — never inside a frame.
 *
 * Per-frame data (ball transform, velocity, particle state) is NEVER saved.
 */
import { WORLDS } from "../data/worlds.js";
import { BALL_SKINS } from "../data/skins.js";

const KEY = "ball-adventure-3d-progress";
export const TOTAL_LEVELS = 100;

export const DEFAULT_SETTINGS = {
  sound: true,
  music: true,
  graphics: "high", // low | medium | high
  camSensitivity: 0.75,
  camDistance: 1,
  screenShake: true,
  particles: true,
  reducedMotion: false,
};

const DEFAULT_STATS = {
  levelsCompleted: 0,
  worldsCompleted: 0,
  crystalsCollected: 0,
  totalFalls: 0,
  totalJumps: 0,
  checkpointsActivated: 0,
  totalPlayTimeSec: 0,
  distanceRolled: 0,
};

const DEFAULT_STATE = {
  highestUnlockedLevel: 1,
  levels: {}, // { [levelId]: { completed, crystals (0-3), stars (0-3), bestTime (sec|null) } }
  selectedSkin: "classic",
  settings: { ...DEFAULT_SETTINGS },
  stats: { ...DEFAULT_STATS },
};

const SKIN_IDS = new Set(BALL_SKINS.map((s) => s.id));

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
    /* storage unavailable — session just won't persist */
  }
}

export function sanitizeSettings(raw) {
  const s = { ...DEFAULT_SETTINGS, ...(raw || {}) };
  if (!["low", "medium", "high"].includes(s.graphics)) s.graphics = "high";
  s.sound = Boolean(s.sound);
  s.music = Boolean(s.music);
  s.screenShake = Boolean(s.screenShake);
  s.particles = Boolean(s.particles);
  s.reducedMotion = Boolean(s.reducedMotion);
  s.camSensitivity = Number.isFinite(s.camSensitivity) ? Math.min(1.8, Math.max(0.15, s.camSensitivity)) : 1;
  s.camDistance = Number.isFinite(s.camDistance) ? Math.min(1.5, Math.max(0.6, s.camDistance)) : 1;
  return s;
}

export function loadState() {
  const raw = readJSON() || {};
  const state = {
    ...DEFAULT_STATE,
    ...raw,
    settings: sanitizeSettings(raw.settings),
    stats: { ...DEFAULT_STATS, ...(raw.stats || {}) },
  };

  state.highestUnlockedLevel = Number.isInteger(raw.highestUnlockedLevel)
    ? Math.min(TOTAL_LEVELS, Math.max(1, raw.highestUnlockedLevel))
    : 1;

  state.levels = {};
  if (raw.levels && typeof raw.levels === "object") {
    for (const [k, v] of Object.entries(raw.levels)) {
      const id = Number(k);
      if (!Number.isInteger(id) || id < 1 || id > TOTAL_LEVELS || !v) continue;
      state.levels[id] = {
        completed: Boolean(v.completed),
        crystals: [0, 1, 2, 3].includes(v.crystals) ? v.crystals : 0,
        stars: [0, 1, 2, 3].includes(v.stars) ? v.stars : 0,
        bestTime: Number.isFinite(v.bestTime) ? Math.max(0, v.bestTime) : null,
      };
    }
  }

  state.selectedSkin = SKIN_IDS.has(raw.selectedSkin) ? raw.selectedSkin : "classic";

  for (const k of Object.keys(state.stats)) {
    const v = state.stats[k];
    state.stats[k] = Number.isFinite(v) ? Math.max(0, v) : 0;
  }

  return state;
}

export function saveState(state) {
  writeJSON({
    highestUnlockedLevel: state.highestUnlockedLevel,
    levels: state.levels,
    selectedSkin: state.selectedSkin,
    settings: state.settings,
    stats: state.stats,
  });
}

/** Total stars across every completed level — drives world/skin unlocks. */
export function totalStars(state) {
  let sum = 0;
  for (const rec of Object.values(state.levels)) sum += rec.stars || 0;
  return sum;
}

export function totalCrystals(state) {
  let sum = 0;
  for (const rec of Object.values(state.levels)) sum += rec.crystals || 0;
  return sum;
}

export function worldsCompleted(state) {
  let count = 0;
  for (const w of WORLDS) {
    if (!w.built) continue;
    let allDone = true;
    for (let id = w.levelStart; id <= w.levelEnd; id++) {
      if (!state.levels[id]?.completed) { allDone = false; break; }
    }
    if (allDone) count++;
  }
  return count;
}

/**
 * Records the result of a level attempt. Best time only improves (never
 * overwritten by a slower run); stars/crystals only improve too, so a replay
 * can never take progress away.
 */
export function recordLevelResult(state, levelId, { crystals, stars, timeSec }) {
  const prev = state.levels[levelId] || { completed: false, crystals: 0, stars: 0, bestTime: null };
  const nextRec = {
    completed: true,
    crystals: Math.max(prev.crystals, crystals),
    stars: Math.max(prev.stars, stars),
    bestTime: prev.bestTime == null ? timeSec : Math.min(prev.bestTime, timeSec),
  };
  const nextLevels = { ...state.levels, [levelId]: nextRec };
  const nextHighest = Math.max(state.highestUnlockedLevel, Math.min(TOTAL_LEVELS, levelId + 1));
  const wasCompleted = Boolean(prev.completed);
  return {
    ...state,
    levels: nextLevels,
    highestUnlockedLevel: nextHighest,
    stats: {
      ...state.stats,
      levelsCompleted: state.stats.levelsCompleted + (wasCompleted ? 0 : 1),
      crystalsCollected: state.stats.crystalsCollected + Math.max(0, crystals - prev.crystals),
    },
  };
}

export function bumpStat(state, key, amount = 1) {
  return { ...state, stats: { ...state.stats, [key]: (state.stats[key] || 0) + amount } };
}
