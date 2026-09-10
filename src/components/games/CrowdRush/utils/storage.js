/**
 * Crowd Rush — localStorage persistence.
 *
 * One namespaced key, `crowd-rush-progress`. Every read merges onto the defaults
 * and re-validates every field, so a save from an older build (or a hand-edited
 * one) can never crash a newer build. Writes happen only on meaningful events
 * (finishing a level, changing a setting, picking a colour) — never in a frame.
 *
 * Nothing here touches the keys used by Classic Chess, Fishing Journey,
 * Mini Golf Journey, Delivery Rush, Parking Master or Cake Designer.
 */

import { TOTAL_LEVELS } from "../data/levels.js";
import { WORLDS } from "../data/worlds.js";

const KEY = "crowd-rush-progress";

export const CROWD_COLORS = [
  { id: "blue", hex: "#3d8bff", glow: "#8fc0ff", name: "Cobalt" },
  { id: "green", hex: "#2fbf6b", glow: "#8ff0b8", name: "Clover" },
  { id: "orange", hex: "#ff8a2b", glow: "#ffc48f", name: "Ember" },
  { id: "purple", hex: "#9b5cff", glow: "#d0b0ff", name: "Amethyst" },
  { id: "red", hex: "#ff4d4d", glow: "#ff9e9e", name: "Crimson" },
  { id: "cyan", hex: "#1fd3d3", glow: "#9ff2f2", name: "Lagoon" },
];
// enemies are ALWAYS this colour, so the player colour never confuses the fight
export const ENEMY_HEX = "#455063";
export const ENEMY_GLOW = "#8b97a8";

export const TRAILS = [
  { id: "none", name: "None", cost: 0 },
  { id: "spark", name: "Spark", cost: 60 },
  { id: "comet", name: "Comet", cost: 120 },
  { id: "confetti", name: "Confetti", cost: 200 },
];

export const DEFAULT_SETTINGS = {
  graphics: "high", // low | medium | high
  sound: true,
  music: true,
  vibration: true,
  sensitivity: "medium", // low | medium | high
};

export const DEFAULT_STATE = {
  unlockedLevel: 1,
  levels: {}, // { [id]: { completed, stars, bestCrowd, bestScore } }
  selectedColor: "blue",
  selectedTrail: "none",
  ownedTrails: ["none"],
  coins: 0,
  settings: { ...DEFAULT_SETTINGS },
  statistics: {
    levelsCompleted: 0,
    totalStars: 0,
    bestCrowd: 0,
    runnersCollected: 0,
    runnersLost: 0,
    enemyCrowdsDefeated: 0,
    bossesDefeated: 0,
    totalRuns: 0,
  },
};

const OPT = {
  graphics: ["low", "medium", "high"],
  sensitivity: ["low", "medium", "high"],
};
const COLOR_IDS = new Set(CROWD_COLORS.map((c) => c.id));
const TRAIL_IDS = new Set(TRAILS.map((t) => t.id));

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
  if (!OPT.graphics.includes(s.graphics)) s.graphics = "high";
  if (!OPT.sensitivity.includes(s.sensitivity)) s.sensitivity = "medium";
  s.sound = Boolean(s.sound);
  s.music = Boolean(s.music);
  s.vibration = Boolean(s.vibration);
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

  state.selectedColor = COLOR_IDS.has(raw.selectedColor) ? raw.selectedColor : "blue";
  state.ownedTrails = Array.isArray(raw.ownedTrails)
    ? raw.ownedTrails.filter((t) => TRAIL_IDS.has(t))
    : ["none"];
  if (!state.ownedTrails.includes("none")) state.ownedTrails.push("none");
  state.selectedTrail =
    TRAIL_IDS.has(raw.selectedTrail) && state.ownedTrails.includes(raw.selectedTrail)
      ? raw.selectedTrail
      : "none";
  state.coins = Number.isFinite(raw.coins) ? Math.max(0, Math.floor(raw.coins)) : 0;

  let unlocked = Number.isInteger(raw.unlockedLevel) ? raw.unlockedLevel : 1;
  state.unlockedLevel = Math.min(TOTAL_LEVELS, Math.max(1, unlocked));

  state.levels = {};
  if (raw.levels && typeof raw.levels === "object") {
    for (const [k, l] of Object.entries(raw.levels)) {
      const id = Number(k);
      if (!Number.isInteger(id) || id < 1 || id > TOTAL_LEVELS || !l) continue;
      state.levels[id] = {
        completed: Boolean(l.completed),
        stars: [0, 1, 2, 3].includes(l.stars) ? l.stars : 0,
        bestCrowd: Number.isFinite(l.bestCrowd) ? Math.max(0, Math.floor(l.bestCrowd)) : 0,
        bestScore: Number.isFinite(l.bestScore) ? Math.max(0, Math.floor(l.bestScore)) : 0,
      };
    }
  }

  for (const key of Object.keys(state.statistics)) {
    const v = state.statistics[key];
    state.statistics[key] = Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0;
  }
  return state;
}

export function saveState(state) {
  writeJSON({
    unlockedLevel: state.unlockedLevel,
    levels: state.levels,
    selectedColor: state.selectedColor,
    selectedTrail: state.selectedTrail,
    ownedTrails: state.ownedTrails,
    coins: state.coins,
    settings: state.settings,
    statistics: state.statistics,
  });
}

export const colorOf = (id) => CROWD_COLORS.find((c) => c.id === id) || CROWD_COLORS[0];

export function worldUnlocked(state, worldId) {
  const w = WORLDS.find((x) => x.id === worldId);
  if (!w) return false;
  return state.unlockedLevel >= w.range[0];
}

/**
 * Fold a finished run into the persistent state. Pure — returns a new object.
 * run = { levelId, success, finalCrowd, score, stars, runnersCollected,
 *         runnersLost, enemiesDefeated, bossDefeated }
 */
export function applyRun(state, run) {
  const next = {
    ...state,
    levels: { ...state.levels },
    statistics: { ...state.statistics },
  };
  const st = next.statistics;

  st.totalRuns += 1;
  st.runnersCollected += run.runnersCollected || 0;
  st.runnersLost += run.runnersLost || 0;
  st.enemyCrowdsDefeated += run.enemiesDefeated || 0;
  if (run.bossDefeated) st.bossesDefeated += 1;
  st.bestCrowd = Math.max(st.bestCrowd, run.finalCrowd || 0);

  if (!run.success) return next;

  const prev = state.levels[run.levelId] || { completed: false, stars: 0, bestCrowd: 0, bestScore: 0 };
  const wasCompleted = prev.completed;
  next.levels[run.levelId] = {
    completed: true,
    stars: Math.max(prev.stars, run.stars),
    bestCrowd: Math.max(prev.bestCrowd, run.finalCrowd || 0),
    bestScore: Math.max(prev.bestScore, run.score || 0),
  };

  if (!wasCompleted) {
    st.levelsCompleted += 1;
    next.unlockedLevel = Math.min(TOTAL_LEVELS, Math.max(state.unlockedLevel, run.levelId + 1));
  }
  st.totalStars = Object.values(next.levels).reduce((s, l) => s + (l.stars || 0), 0);
  next.coins = Math.max(0, state.coins + (run.coins || 0));

  return next;
}

export function prevBest(state, levelId) {
  return state.levels[levelId] || { completed: false, stars: 0, bestCrowd: 0, bestScore: 0 };
}
