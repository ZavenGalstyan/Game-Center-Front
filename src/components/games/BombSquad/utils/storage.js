/**
 * Bomb Squad — localStorage persistence. One namespaced key,
 * `bomb-squad-progress`. Every read merges onto the defaults and
 * re-validates every field, so a save from an older build never crashes a
 * newer one. Writes happen only on meaningful events (finishing/failing a
 * mission, changing a setting) — never once per timer tick.
 *
 * Nothing here touches the keys used by any other Game Center game.
 */
import { TOTAL_MISSIONS, getMission } from "../data/missions.js";
import { MODULE_TYPES } from "../data/moduleConfigs.js";
import { starsForRun, isPerfectDisarm } from "../systems/scoringSystem.js";

const KEY = "bomb-squad-progress";
const KNOWN_MODULE_TYPES = new Set(MODULE_TYPES.map((m) => m.type));

export const DEFAULT_SETTINGS = {
  graphics: "high", // low | medium | high
  sound: true,
  music: true,
  screenEffects: true,
  timerWarning: true,
  reducedMotion: false,
};

export const DEFAULT_STATISTICS = {
  missionsCompleted: 0,
  totalStars: 0,
  perfectDisarms: 0,
  modulesSolved: 0,
  strikes: 0,
  bestTimeElapsed: null, // seconds, fastest successful clear; null until first clear
  totalDefusalTime: 0,
  wireModulesSolved: 0,
  memoryModulesSolved: 0,
  timingModulesSolved: 0,
};

const DEFAULT_STATE = {
  unlockedMission: 1,
  missions: {}, // { [id]: { completed, stars, bestTimeRemaining, perfect } }
  discoveredModules: [],
  settings: { ...DEFAULT_SETTINGS },
  statistics: { ...DEFAULT_STATISTICS },
};

const GRAPHICS_OPT = ["low", "medium", "high"];

function readJSON() {
  try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch { return null; }
}
function writeJSON(v) {
  try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* storage unavailable */ }
}

export function sanitizeSettings(raw) {
  const s = { ...DEFAULT_SETTINGS, ...(raw || {}) };
  if (!GRAPHICS_OPT.includes(s.graphics)) s.graphics = "high";
  s.sound = Boolean(s.sound);
  s.music = Boolean(s.music);
  s.screenEffects = Boolean(s.screenEffects);
  s.timerWarning = Boolean(s.timerWarning);
  s.reducedMotion = Boolean(s.reducedMotion);
  return s;
}

export function loadState() {
  const raw = readJSON() || {};
  const state = {
    ...DEFAULT_STATE,
    ...raw,
    settings: sanitizeSettings(raw.settings),
    statistics: { ...DEFAULT_STATISTICS, ...(raw.statistics || {}) },
  };

  let unlocked = Number.isInteger(raw.unlockedMission) ? raw.unlockedMission : 1;
  state.unlockedMission = Math.min(TOTAL_MISSIONS, Math.max(1, unlocked));

  state.missions = {};
  if (raw.missions && typeof raw.missions === "object") {
    for (const [k, v] of Object.entries(raw.missions)) {
      const id = Number(k);
      if (!Number.isInteger(id) || id < 1 || id > TOTAL_MISSIONS || !v || !getMission(id)) continue;
      state.missions[id] = {
        completed: Boolean(v.completed),
        stars: [0, 1, 2, 3].includes(v.stars) ? v.stars : 0,
        bestTimeRemaining: Number.isFinite(v.bestTimeRemaining) ? Math.max(0, v.bestTimeRemaining) : 0,
        perfect: Boolean(v.perfect),
      };
    }
  }

  state.discoveredModules = Array.isArray(raw.discoveredModules)
    ? [...new Set(raw.discoveredModules.filter((t) => KNOWN_MODULE_TYPES.has(t)))]
    : [];

  for (const key of Object.keys(state.statistics)) {
    if (key === "bestTimeElapsed") {
      const v = state.statistics[key];
      state.statistics[key] = Number.isFinite(v) && v >= 0 ? v : null;
      continue;
    }
    const v = state.statistics[key];
    state.statistics[key] = Number.isFinite(v) ? Math.max(0, v) : 0;
  }

  return state;
}

export function saveState(state) {
  writeJSON({
    unlockedMission: state.unlockedMission,
    missions: state.missions,
    discoveredModules: state.discoveredModules,
    settings: state.settings,
    statistics: state.statistics,
  });
}

const CATEGORY_KEY = {
  colorWires: "wireModulesSolved",
  memoryLights: "memoryModulesSolved",
  pressureBar: "timingModulesSolved",
};

/**
 * Fold a finished attempt (success or failure) into persistent state. Pure
 * — returns a new object. `run` comes from DefusalScreen's summary of the
 * finished missionEngine state. Replaying a mission can only raise its
 * stars/best time, never lower them.
 */
export function applyMissionResult(state, run) {
  const next = {
    ...state,
    missions: { ...state.missions },
    statistics: { ...state.statistics },
    discoveredModules: [...state.discoveredModules],
  };
  const st = next.statistics;

  st.strikes += run.strikes;
  st.modulesSolved += run.solvedTypes.length;
  for (const type of run.solvedTypes) {
    if (!next.discoveredModules.includes(type)) next.discoveredModules.push(type);
    const key = CATEGORY_KEY[type];
    if (key) st[key] += 1;
  }

  if (!run.success) return next;

  const elapsed = Math.max(0, run.timer - run.timeRemaining);
  st.totalDefusalTime += elapsed;
  st.bestTimeElapsed = st.bestTimeElapsed == null ? elapsed : Math.min(st.bestTimeElapsed, elapsed);

  const stars = starsForRun(run);
  const perfect = isPerfectDisarm(run);
  const prev = state.missions[run.missionId] || { completed: false, stars: 0, bestTimeRemaining: 0, perfect: false };
  const wasCompleted = prev.completed;

  next.missions[run.missionId] = {
    completed: true,
    stars: Math.max(prev.stars, stars),
    bestTimeRemaining: Math.max(prev.bestTimeRemaining, run.timeRemaining),
    perfect: prev.perfect || perfect,
  };

  if (!wasCompleted) {
    st.missionsCompleted += 1;
    next.unlockedMission = Math.min(TOTAL_MISSIONS, Math.max(state.unlockedMission, run.missionId + 1));
  }
  if (!prev.perfect && perfect) st.perfectDisarms += 1;

  st.totalStars = Object.values(next.missions).reduce((s, m) => s + (m.stars || 0), 0);

  return next;
}

export function updateSettings(state, settings) {
  return { ...state, settings: sanitizeSettings(settings) };
}

export function missionBest(state, id) {
  return state.missions[id] || { completed: false, stars: 0, bestTimeRemaining: 0, perfect: false };
}
