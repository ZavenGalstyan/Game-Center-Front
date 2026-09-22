/**
 * Rooftop Sniper — localStorage persistence. One namespaced key,
 * `rooftop-sniper-progress`. Every read merges onto the defaults and
 * re-validates every field, so a save from an older build never crashes a
 * newer build. Writes happen on meaningful events only (finishing/failing a
 * mission, changing a setting, switching rifle) — never once per frame.
 *
 * Nothing here touches the keys used by any other Game Center game.
 */
import { TOTAL_MISSIONS, getMission } from "../data/missions.js";
import { RIFLES } from "../data/rifles.js";

const KEY = "rooftop-sniper-progress";
const KNOWN_RIFLES = new Set(RIFLES.map((r) => r.id));
const GRAPHICS_OPT = ["low", "medium", "high"];

export const DEFAULT_SETTINGS = {
  sfx: 0.8,
  sensitivity: 1,
  scopeSensitivity: 0.6,
  graphics: "high",
  invertY: false,
};

export const DEFAULT_STATISTICS = {
  missionsCompleted: 0,
  totalStars: 0,
  shotsFired: 0,
  hits: 0,
  misses: 0,
  bestAccuracyEver: 0,
};

const DEFAULT_STATE = {
  unlockedMission: 1,
  missions: {}, // { [id]: { completed, stars, bestAccuracy, bestTimeElapsed } }
  unlockedRifles: ["trainee-m1"],
  selectedRifle: "trainee-m1",
  settings: { ...DEFAULT_SETTINGS },
  statistics: { ...DEFAULT_STATISTICS },
};

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
    /* storage unavailable */
  }
}

export function sanitizeSettings(raw) {
  const s = { ...DEFAULT_SETTINGS, ...(raw || {}) };
  if (!GRAPHICS_OPT.includes(s.graphics)) s.graphics = "high";
  s.sfx = Number.isFinite(s.sfx) ? Math.min(1, Math.max(0, s.sfx)) : DEFAULT_SETTINGS.sfx;
  s.sensitivity = Number.isFinite(s.sensitivity) ? Math.min(2, Math.max(0.2, s.sensitivity)) : 1;
  s.scopeSensitivity = Number.isFinite(s.scopeSensitivity)
    ? Math.min(2, Math.max(0.1, s.scopeSensitivity))
    : 0.6;
  s.invertY = Boolean(s.invertY);
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
        bestAccuracy: Number.isFinite(v.bestAccuracy) ? Math.min(1, Math.max(0, v.bestAccuracy)) : 0,
        bestTimeElapsed: Number.isFinite(v.bestTimeElapsed) ? Math.max(0, v.bestTimeElapsed) : null,
      };
    }
  }

  state.unlockedRifles = Array.isArray(raw.unlockedRifles)
    ? [...new Set(raw.unlockedRifles.filter((id) => KNOWN_RIFLES.has(id)))]
    : [];
  if (!state.unlockedRifles.includes("trainee-m1")) state.unlockedRifles.unshift("trainee-m1");
  state.selectedRifle = KNOWN_RIFLES.has(raw.selectedRifle) && state.unlockedRifles.includes(raw.selectedRifle)
    ? raw.selectedRifle
    : "trainee-m1";

  for (const key of Object.keys(state.statistics)) {
    const v = state.statistics[key];
    state.statistics[key] = Number.isFinite(v) ? Math.max(0, v) : 0;
  }
  state.statistics.bestAccuracyEver = Math.min(1, state.statistics.bestAccuracyEver);

  return state;
}

export function saveState(state) {
  writeJSON({
    unlockedMission: state.unlockedMission,
    missions: state.missions,
    unlockedRifles: state.unlockedRifles,
    selectedRifle: state.selectedRifle,
    settings: state.settings,
    statistics: state.statistics,
  });
}

/**
 * Fold a finished attempt (success or failure) into persistent state. Pure —
 * returns a new object. Replaying a mission can only raise its stars/best
 * accuracy, never lower them. Unlocks the next mission (and any rifle whose
 * unlockMission was just reached) only on a first-time success.
 */
export function applyMissionResult(state, run) {
  const next = {
    ...state,
    missions: { ...state.missions },
    statistics: { ...state.statistics },
    unlockedRifles: [...state.unlockedRifles],
  };
  const st = next.statistics;

  st.shotsFired += run.shotsFired;
  st.hits += run.hits;
  st.misses += run.misses;
  const accuracy = run.shotsFired > 0 ? run.hits / run.shotsFired : 0;
  st.bestAccuracyEver = Math.max(st.bestAccuracyEver, accuracy);

  if (!run.success) return next;

  const prev = state.missions[run.missionId] || {
    completed: false,
    stars: 0,
    bestAccuracy: 0,
    bestTimeElapsed: null,
  };
  const wasCompleted = prev.completed;

  next.missions[run.missionId] = {
    completed: true,
    stars: Math.max(prev.stars, run.stars),
    bestAccuracy: Math.max(prev.bestAccuracy, accuracy),
    bestTimeElapsed:
      prev.bestTimeElapsed == null ? run.timeElapsed : Math.min(prev.bestTimeElapsed, run.timeElapsed),
  };

  if (!wasCompleted) {
    st.missionsCompleted += 1;
    next.unlockedMission = Math.min(TOTAL_MISSIONS, Math.max(state.unlockedMission, run.missionId + 1));
    for (const rifle of RIFLES) {
      if (rifle.unlockMission <= next.unlockedMission && !next.unlockedRifles.includes(rifle.id)) {
        next.unlockedRifles.push(rifle.id);
      }
    }
  }

  st.totalStars = Object.values(next.missions).reduce((s, m) => s + (m.stars || 0), 0);

  return next;
}

export function updateSettings(state, settings) {
  return { ...state, settings: sanitizeSettings(settings) };
}

export function selectRifle(state, rifleId) {
  if (!state.unlockedRifles.includes(rifleId)) return state;
  return { ...state, selectedRifle: rifleId };
}

export function missionBest(state, id) {
  return state.missions[id] || { completed: false, stars: 0, bestAccuracy: 0, bestTimeElapsed: null };
}
