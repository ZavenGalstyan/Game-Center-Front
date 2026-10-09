/**
 * Mountain Journey — durable progress under one versioned localStorage key.
 *
 * Saved: unlocked / completed levels, best times, badges found (per level,
 * per badge), viewpoints discovered, explorer look, lifetime statistics,
 * settings. Never saved: anything mid-level (position, checkpoints, puzzle
 * state) — a reload restarts the level cleanly.
 *
 * Every write is a pure function returning a new state, and every reward is
 * idempotent: completing a level twice, re-collecting a badge on a replay or
 * restarting after a pickup can never count anything twice.
 */
import { TOTAL_LEVELS } from "../data/levels.js";
import { COSMETICS, isUnlocked } from "../data/cosmetics.js";

export const STORAGE_KEY = "mountain-journey-progress";
const VERSION = 1;

export function defaultSettings() {
  return {
    master: 0.85,
    music: 0.55,
    sfx: 0.9,
    graphics: "medium", // low | medium | high
    shadows: "medium", // off | medium | high
    sensitivity: 1,
    cameraBob: true,
    reducedMotion: false,
  };
}

export function defaultState() {
  return {
    version: VERSION,
    unlocked: 1,
    completed: {},
    bestTime: {},
    badges: {},
    viewpoints: {},
    lastLevel: 1,
    look: { jacket: "#c8452f", pack: "#4b5a3a", hat: "beanie", hatColor: "#c8452f" },
    settings: defaultSettings(),
    stats: { distance: 0, jumps: 0, falls: 0, playtime: 0, summit: false },
  };
}

const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);

export function sanitize(p) {
  const base = defaultState();
  if (!p || typeof p !== "object") return base;
  const completed = {};
  for (const [k, v] of Object.entries(p.completed || {})) if (v && +k >= 1 && +k <= TOTAL_LEVELS) completed[k] = true;
  const bestTime = {};
  for (const [k, v] of Object.entries(p.bestTime || {})) if (num(v, -1) > 0) bestTime[k] = num(v);
  const badges = {};
  for (const [k, v] of Object.entries(p.badges || {})) if (Array.isArray(v)) badges[k] = [0, 1, 2].map((i) => (v[i] === 1 || v[i] === true ? 1 : 0));
  const viewpoints = {};
  for (const [k, v] of Object.entries(p.viewpoints || {})) if (v) viewpoints[k] = true;
  const s = { ...base.stats, ...(p.stats || {}) };
  const state = {
    ...base,
    version: VERSION,
    unlocked: Math.max(1, Math.min(TOTAL_LEVELS, Math.round(num(p.unlocked, 1)))),
    completed,
    bestTime,
    badges,
    viewpoints,
    lastLevel: Math.max(1, Math.min(TOTAL_LEVELS, Math.round(num(p.lastLevel, 1)))),
    look: { ...base.look, ...(p.look || {}) },
    settings: { ...base.settings, ...(p.settings || {}) },
    stats: {
      distance: Math.max(0, num(s.distance)),
      jumps: Math.max(0, Math.round(num(s.jumps))),
      falls: Math.max(0, Math.round(num(s.falls))),
      playtime: Math.max(0, num(s.playtime)),
      summit: !!s.summit,
    },
  };
  // unlocked must cover every completed level's successor
  for (const k of Object.keys(completed)) state.unlocked = Math.max(state.unlocked, Math.min(TOTAL_LEVELS, +k + 1));
  // a locked cosmetic in the save falls back to the default
  const prog = progressOf(state);
  for (const slot of Object.keys(COSMETICS)) {
    const item = COSMETICS[slot].find((c) => c.id === state.look[slot]);
    if (!item || !isUnlocked(item.req, prog)) state.look[slot] = base.look[slot];
  }
  return state;
}

export function loadState() {
  if (typeof window === "undefined") return defaultState();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    return sanitize(JSON.parse(raw));
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

export function progressOf(state) {
  let badges = 0;
  for (const v of Object.values(state.badges)) badges += v.reduce((a, b) => a + b, 0);
  return { levels: Object.keys(state.completed).length, badges, viewpoints: Object.keys(state.viewpoints).length };
}

export function foundBadges(state, id) {
  const v = state.badges[id] || [0, 0, 0];
  return v.map((b, i) => (b ? i : -1)).filter((i) => i >= 0);
}

/** A badge picked up (saved at once, so quitting keeps it). Idempotent. */
export function recordBadge(state, id, idx) {
  const cur = state.badges[id] || [0, 0, 0];
  if (cur[idx]) return state;
  const next = cur.slice();
  next[idx] = 1;
  return { ...state, badges: { ...state.badges, [id]: next } };
}

export function recordViewpoint(state, id) {
  if (state.viewpoints[id]) return state;
  return { ...state, viewpoints: { ...state.viewpoints, [id]: true } };
}

/** Folds one attempt's counters into lifetime stats (quit, restart or completion). */
export function addRunStats(state, run) {
  const s = state.stats;
  return {
    ...state,
    stats: {
      ...s,
      distance: s.distance + Math.max(0, run.distance || 0),
      jumps: s.jumps + Math.max(0, run.jumps || 0),
      falls: s.falls + Math.max(0, run.falls || 0),
      playtime: s.playtime + Math.max(0, run.playtime || 0),
    },
  };
}

/**
 * Banks a completed level: unlocks the next, keeps the best time.
 * Returns { state, reward: { first, best, newCosmetics } }.
 */
export function completeLevel(state, id, timeSec) {
  const first = !state.completed[id];
  const prevBest = state.bestTime[id];
  const before = progressOf(state);
  const next = {
    ...state,
    unlocked: Math.max(state.unlocked, Math.min(TOTAL_LEVELS, id + 1)),
    completed: { ...state.completed, [id]: true },
    bestTime: { ...state.bestTime, [id]: prevBest == null ? timeSec : Math.min(prevBest, timeSec) },
    lastLevel: Math.min(TOTAL_LEVELS, id + 1),
    stats: { ...state.stats, summit: state.stats.summit || id === TOTAL_LEVELS },
  };
  const after = progressOf(next);
  const newCosmetics = [];
  for (const [slot, list] of Object.entries(COSMETICS)) {
    for (const c of list) if (c.req && !isUnlocked(c.req, before) && isUnlocked(c.req, after)) newCosmetics.push({ slot, ...c });
  }
  return { state: next, reward: { first, best: prevBest == null || timeSec < prevBest, prevBest: prevBest ?? null, newCosmetics } };
}

export function updateSettings(state, patch) {
  return { ...state, settings: { ...state.settings, ...patch } };
}

export function updateLook(state, patch) {
  return { ...state, look: { ...state.look, ...patch } };
}
