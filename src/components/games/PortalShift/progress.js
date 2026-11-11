/**
 * Portal Shift — local persistence (localStorage, like the other games).
 *   portal-shift-progress  { v, unlocked, done: { [id]: { time, portals } }, last }
 *   portal-shift-settings  { sens, invertY, fov, quality, volume, mute }
 */
import { LEVEL_COUNT } from "./engine/levels.js";

export const PROGRESS_KEY = "portal-shift-progress";
export const SETTINGS_KEY = "portal-shift-settings";

export const DEFAULT_SETTINGS = { sens: 1, invertY: false, fov: 80, quality: "high", volume: 0.8, mute: false };

function read(key) {
  try {
    return JSON.parse(localStorage.getItem(key));
  } catch {
    return null;
  }
}
function write(key, v) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* storage blocked — progress lives for this session only */
  }
}

export function emptyProgress() {
  return { v: 1, unlocked: 1, done: {}, last: 1 };
}

export function loadProgress() {
  const p = read(PROGRESS_KEY);
  if (!p || typeof p !== "object") return emptyProgress();
  const unlocked = Math.max(1, Math.min(LEVEL_COUNT, Math.floor(Number(p.unlocked) || 1)));
  const done = {};
  if (p.done && typeof p.done === "object") {
    for (const [k, v] of Object.entries(p.done)) {
      const id = Number(k);
      if (id >= 1 && id <= LEVEL_COUNT && v && Number.isFinite(v.time)) done[id] = { time: v.time, portals: Number(v.portals) || 0 };
    }
  }
  const last = Math.max(1, Math.min(unlocked, Math.floor(Number(p.last) || 1)));
  return { v: 1, unlocked, done, last };
}

export function saveProgress(p) {
  write(PROGRESS_KEY, p);
}

/** Record a finished chamber; returns the new progress and whether it is a new best. */
export function recordCompletion(p, id, time, portals) {
  const prev = p.done[id];
  const best = !prev || time < prev.time;
  const done = { ...p.done, [id]: best ? { time, portals } : prev };
  const next = { ...p, done, unlocked: Math.max(p.unlocked, Math.min(LEVEL_COUNT, id + 1)), last: Math.min(LEVEL_COUNT, id + 1) };
  if (id === LEVEL_COUNT) next.last = LEVEL_COUNT;
  saveProgress(next);
  return { progress: next, best, prev };
}

export function hasProgress(p) {
  return p.unlocked > 1 || Object.keys(p.done).length > 0;
}

export function loadSettings() {
  const s = read(SETTINGS_KEY) || {};
  return {
    sens: Number.isFinite(s.sens) ? Math.max(0.2, Math.min(3, s.sens)) : DEFAULT_SETTINGS.sens,
    invertY: !!s.invertY,
    fov: Number.isFinite(s.fov) ? Math.max(60, Math.min(100, s.fov)) : DEFAULT_SETTINGS.fov,
    quality: s.quality === "low" ? "low" : "high",
    volume: Number.isFinite(s.volume) ? Math.max(0, Math.min(1, s.volume)) : DEFAULT_SETTINGS.volume,
    mute: !!s.mute,
  };
}

export function saveSettings(s) {
  write(SETTINGS_KEY, s);
}
