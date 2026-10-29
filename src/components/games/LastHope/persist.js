/**
 * Last Hope — local persistence.
 *
 * last-hope-save      the run (engine/game.js serialize()), versioned
 * last-hope-save-bak  the previous good save (written before each save, used
 *                     if the main one is unreadable)
 * last-hope-settings  graphics / audio / controls / difficulty
 */
import { SAVE_VERSION } from "./engine/game.js";
import { LOCATIONS } from "./data/locations/index.js";

export const SAVE_KEY = "last-hope-save";
const BAK_KEY = "last-hope-save-bak";
const SET_KEY = "last-hope-settings";

export const DEFAULT_SETTINGS = {
  quality: "auto",
  master: 0.8,
  music: 0.4,
  sfx: 0.85,
  amb: 0.6,
  zoom: 18,
  showFps: false,
  difficulty: "normal",
  aimAssist: true,
  damageNumbers: true,
};

const read = (k) => {
  try {
    const raw = localStorage.getItem(k);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};
const valid = (d) => d && typeof d === "object" && Number.isFinite(d.seed) && (d.v | 0) >= 1 && (d.v | 0) <= SAVE_VERSION && d.P && Array.isArray(d.inv);

export function loadSave() {
  const main = read(SAVE_KEY);
  if (valid(main)) return main;
  const bak = read(BAK_KEY);
  return valid(bak) ? bak : null;
}
export function saveInfo() {
  const s = loadSave();
  if (!s) return null;
  return { day: s.day || 1, level: s.P?.level || 1, loc: LOCATIONS[s.loc]?.name || "Survivor's Camp", savedAt: s.savedAt || 0, done: Array.isArray(s.done) ? s.done.length : 0, difficulty: s.difficulty || "normal" };
}
export function writeSave(data) {
  try {
    const prev = localStorage.getItem(SAVE_KEY);
    if (prev) {
      try {
        if (valid(JSON.parse(prev))) localStorage.setItem(BAK_KEY, prev);
      } catch {
        /* unreadable main save: keep the backup */
      }
    }
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}
export function clearSave() {
  try {
    const prev = localStorage.getItem(SAVE_KEY);
    if (prev) localStorage.setItem(BAK_KEY, prev);
    localStorage.removeItem(SAVE_KEY);
  } catch {
    /* storage blocked */
  }
}
export function loadSettings() {
  const s = read(SET_KEY);
  const out = { ...DEFAULT_SETTINGS };
  if (s && typeof s === "object") for (const k in out) if (typeof s[k] === typeof out[k]) out[k] = s[k];
  if (!["auto", "low", "medium", "high"].includes(out.quality)) out.quality = "auto";
  if (!["easy", "normal", "hard"].includes(out.difficulty)) out.difficulty = "normal";
  out.zoom = Math.min(30, Math.max(12, out.zoom));
  return out;
}
export function storeSettings(s) {
  try {
    localStorage.setItem(SET_KEY, JSON.stringify(s));
  } catch {
    /* storage blocked */
  }
}
