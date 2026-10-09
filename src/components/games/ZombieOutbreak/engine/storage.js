/**
 * Zombie Outbreak — durable progress under one versioned localStorage key.
 *
 * Saved: unlocked / completed stages, best stars and scores, unlocked
 * weapons, the selected loadout, lifetime statistics and settings. A stage
 * attempt (zombies, positions, ammo) is never saved — a reload always
 * restarts the stage cleanly. Missing or corrupt data falls back to defaults
 * field by field.
 */
import { TOTAL_STAGES } from "../data/stages.js";
import { WEAPONS } from "../data/weapons.js";

export const STORAGE_KEY = "zombie-outbreak-progress";
const VERSION = 1;

export function defaultSettings() {
  return {
    master: 0.85,
    music: 0.6,
    sfx: 0.9,
    sensitivity: 1,
    fov: 74,
    invertY: false,
    graphics: "medium", // low | medium | high
    shadows: "medium", // off | medium | high
    cameraBob: 1,
    cameraShake: 1,
    reducedMotion: false,
  };
}

export function defaultStats() {
  return {
    stagesCompleted: 0,
    waves: 0,
    kills: 0,
    headshots: 0,
    shots: 0,
    hits: 0,
    bosses: 0,
    time: 0,
    bestScore: 0,
    deaths: 0,
    attempts: 0,
  };
}

export function defaultState() {
  return {
    version: VERSION,
    unlocked: 1,
    completed: {},
    stars: {},
    best: {},
    weapons: ["pistol"],
    loadout: ["pistol"],
    seen: ["pistol"],
    settings: defaultSettings(),
    stats: defaultStats(),
  };
}

const num = (v, d = 0) => (typeof v === "number" && Number.isFinite(v) ? v : d);
const obj = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});

export function sanitize(parsed) {
  const base = defaultState();
  if (!parsed || typeof parsed !== "object") return base;
  const weapons = Array.isArray(parsed.weapons) ? parsed.weapons.filter((w) => WEAPONS[w]) : ["pistol"];
  if (!weapons.includes("pistol")) weapons.unshift("pistol");
  let loadout = Array.isArray(parsed.loadout) ? parsed.loadout.filter((w) => weapons.includes(w)) : ["pistol"];
  loadout = [...new Set(loadout)].slice(0, 3);
  if (!loadout.length) loadout = ["pistol"];
  const stars = {};
  for (const [k, v] of Object.entries(obj(parsed.stars))) stars[k] = Math.max(0, Math.min(3, Math.round(num(v))));
  const best = {};
  for (const [k, v] of Object.entries(obj(parsed.best))) best[k] = Math.max(0, Math.round(num(v)));
  const completed = {};
  for (const [k, v] of Object.entries(obj(parsed.completed))) if (v) completed[k] = true;
  const settings = { ...base.settings };
  for (const [k, v] of Object.entries(obj(parsed.settings))) if (k in settings && typeof v === typeof settings[k]) settings[k] = v;
  const stats = { ...base.stats };
  for (const [k, v] of Object.entries(obj(parsed.stats))) if (k in stats) stats[k] = Math.max(0, num(v));
  return {
    version: VERSION,
    unlocked: Math.max(1, Math.min(TOTAL_STAGES, Math.round(num(parsed.unlocked, 1)))),
    completed,
    stars,
    best,
    weapons,
    loadout,
    seen: Array.isArray(parsed.seen) ? parsed.seen.filter((w) => WEAPONS[w]) : [...weapons],
    settings,
    stats,
  };
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

export function updateSettings(state, patch) {
  return { ...state, settings: { ...state.settings, ...patch } };
}
