/**
 * Oceanbound — local persistence.
 *
 * oceanbound-save      the run (sim/game.js serialize()), versioned
 * oceanbound-save-bak  the previous good save (written before every save,
 *                      used if the main one is unreadable)
 * oceanbound-settings  graphics / audio / controls
 *
 * Every read is validated; a corrupt or future-version save is never
 * overwritten blindly — it is kept in the backup slot.
 */
import { SAVE_VERSION } from "./sim/game.js";

export const SAVE_KEY = "oceanbound-save";
const BAK_KEY = "oceanbound-save-bak";
const SET_KEY = "oceanbound-settings";

export const DEFAULT_SETTINGS = {
  quality: "auto",
  fov: 72,
  sens: 1,
  touchSens: 1,
  invert: false,
  bob: true,
  master: 0.8,
  music: 0.45,
  sfx: 0.85,
  amb: 0.7,
  showFps: false,
  difficulty: "normal",
};

const read = (k) => {
  try {
    const raw = localStorage.getItem(k);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};
const valid = (d) => d && typeof d === "object" && Number.isFinite(d.seed) && (d.v | 0) >= 1 && (d.v | 0) <= SAVE_VERSION && d.raft && Array.isArray(d.inv);

export function loadSave() {
  const main = read(SAVE_KEY);
  if (valid(main)) return main;
  const bak = read(BAK_KEY);
  return valid(bak) ? bak : null;
}
export function hasSave() {
  return !!loadSave();
}
export function saveInfo() {
  const s = loadSave();
  if (!s) return null;
  return { day: s.day || 1, cells: Array.isArray(s.raft?.cells) ? s.raft.cells.length : 4, savedAt: s.savedAt || 0, done: Array.isArray(s.done) ? s.done.length : 0 };
}
export function writeSave(data) {
  try {
    const prev = localStorage.getItem(SAVE_KEY);
    if (prev) {
      try {
        if (valid(JSON.parse(prev))) localStorage.setItem(BAK_KEY, prev);
      } catch {
        /* unreadable main save: leave the backup alone */
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
  out.fov = Math.min(95, Math.max(55, out.fov));
  return out;
}
export function storeSettings(s) {
  try {
    localStorage.setItem(SET_KEY, JSON.stringify(s));
  } catch {
    /* storage blocked */
  }
}
