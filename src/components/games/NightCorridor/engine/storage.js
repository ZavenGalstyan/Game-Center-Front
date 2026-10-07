/**
 * Night Corridor — durable progress under one versioned localStorage key.
 *
 * Only progression, statistics and settings are saved. A section attempt
 * (player position, chase state, checkpoints) is never persisted: a reload
 * always restarts the section cleanly instead of resuming mid-jumpscare.
 */
import { TOTAL_SECTIONS } from "../data/sections.js";

export const STORAGE_KEY = "night-corridor-progress";
const VERSION = 1;

export function defaultSettings() {
  return {
    master: 0.9,
    music: 0.7,
    sfx: 0.9,
    sensitivity: 1,
    graphics: "medium", // low | medium | high
    shadows: "medium", // off | medium | high
    flashlight: "medium", // low | medium | high
    cameraBob: 1,
    reducedMotion: false,
  };
}

function defaultState() {
  return {
    version: VERSION,
    unlocked: 1,
    completed: {}, // { [id]: true }
    bestTime: {}, // { [id]: seconds }
    settings: defaultSettings(),
    stats: {
      sectionsCompleted: 0,
      deaths: 0,
      chasesSurvived: 0,
      keysFound: 0,
      distance: 0,
      playtime: 0,
      hides: 0,
    },
  };
}

export function loadState() {
  if (typeof window === "undefined") return defaultState();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    const base = defaultState();
    if (!parsed || typeof parsed !== "object") return base;
    return {
      ...base,
      ...parsed,
      version: VERSION,
      unlocked: Math.max(1, Math.min(TOTAL_SECTIONS, Number(parsed.unlocked) || 1)),
      completed: { ...(parsed.completed || {}) },
      bestTime: { ...(parsed.bestTime || {}) },
      settings: { ...base.settings, ...(parsed.settings || {}) },
      stats: { ...base.stats, ...(parsed.stats || {}) },
    };
  } catch {
    return defaultState();
  }
}

export function saveState(state) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* storage unavailable — play on without persistence */
  }
}

/** Folds a section attempt's counters into lifetime statistics (called on complete and on leaving). */
export function addRunStats(state, run) {
  const s = state.stats;
  return {
    ...state,
    stats: {
      ...s,
      deaths: s.deaths + (run.deaths || 0),
      chasesSurvived: s.chasesSurvived + (run.chases || 0),
      keysFound: s.keysFound + (run.keys || 0),
      distance: s.distance + (run.distance || 0),
      playtime: s.playtime + (run.time || 0),
      hides: s.hides + (run.hides || 0),
    },
  };
}

export function completeSection(state, id, timeSec) {
  const prevBest = state.bestTime[id];
  const firstTime = !state.completed[id];
  return {
    ...state,
    unlocked: Math.max(state.unlocked, Math.min(TOTAL_SECTIONS, id + 1)),
    completed: { ...state.completed, [id]: true },
    bestTime: { ...state.bestTime, [id]: prevBest == null ? timeSec : Math.min(prevBest, timeSec) },
    stats: { ...state.stats, sectionsCompleted: state.stats.sectionsCompleted + (firstTime ? 1 : 0) },
  };
}

export function updateSettings(state, patch) {
  return { ...state, settings: { ...state.settings, ...patch } };
}
