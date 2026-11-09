/**
 * Pharaoh's Secret — local persistence (localStorage, like the other games).
 *   pharaohs-secret-progress  { v, unlocked, done: { [id]: { time } }, last }
 *   pharaohs-secret-settings  { sens, invertY, fov, quality, volume, mute, hints }
 */
import { LEVEL_COUNT } from "./engine/levels.js";

export const PROGRESS_KEY = "pharaohs-secret-progress";
export const SETTINGS_KEY = "pharaohs-secret-settings";

export const DEFAULT_SETTINGS = { sens: 1, invertY: false, fov: 75, quality: "high", volume: 0.8, mute: false, hints: true };

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
      if (id >= 1 && id <= LEVEL_COUNT && v && Number.isFinite(v.time)) done[id] = { time: v.time };
    }
  }
  const last = Math.max(1, Math.min(unlocked, Math.floor(Number(p.last) || 1)));
  return { v: 1, unlocked, done, last };
}

export function saveProgress(p) {
  write(PROGRESS_KEY, p);
}

/** Record a finished level; returns the new progress and whether it is a new best time. */
export function recordCompletion(p, id, time) {
  const prev = p.done[id];
  const best = !prev || time < prev.time;
  const done = { ...p.done, [id]: best ? { time } : prev };
  const next = { ...p, done, unlocked: Math.max(p.unlocked, Math.min(LEVEL_COUNT, id + 1)), last: Math.min(LEVEL_COUNT, id + 1) };
  saveProgress(next);
  return { progress: next, best, prev };
}

export function hasProgress(p) {
  return p.unlocked > 1 || Object.keys(p.done).length > 0;
}

export function loadSettings() {
  const s = read(SETTINGS_KEY) || {};
  const num = (v, lo, hi, d) => (Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d);
  return {
    sens: num(s.sens, 0.2, 3, DEFAULT_SETTINGS.sens),
    invertY: !!s.invertY,
    fov: num(s.fov, 60, 100, DEFAULT_SETTINGS.fov),
    quality: s.quality === "low" ? "low" : "high",
    volume: num(s.volume, 0, 1, DEFAULT_SETTINGS.volume),
    mute: !!s.mute,
    hints: s.hints !== false,
  };
}

export function saveSettings(s) {
  write(SETTINGS_KEY, s);
}
