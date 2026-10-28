/**
 * Last Shelter — local persistence.
 *
 * last-shelter-save      the run in progress: { phase: "house" | "bunker",
 *                        house (scavenge state) | shelter (day state), savedAt }
 * last-shelter-save-bak  the previous good save, used if the main one is unreadable
 * last-shelter-settings  audio / graphics / camera shake
 * last-shelter-endings   endings discovered across runs (survives New Game)
 */
import { validShelter, sanitize, SAVE_VERSION } from "./engine/shelter.js";
import { restoreScavenge } from "./engine/scavenge.js";

export const SAVE_KEY = "last-shelter-save";
const BAK_KEY = "last-shelter-save-bak";
const SET_KEY = "last-shelter-settings";
const END_KEY = "last-shelter-endings";

export const DEFAULT_SETTINGS = { master: 0.8, music: 0.45, sfx: 0.85, quality: "auto", shake: true, zoom: 1 };

const read = (k) => {
  try {
    const raw = localStorage.getItem(k);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};
const write = (k, v) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
    return true;
  } catch {
    return false;
  }
};

function validSave(d) {
  if (!d || typeof d !== "object" || d.v !== SAVE_VERSION) return false;
  if (d.phase === "house") return !!(d.house && d.house.P && Array.isArray(d.house.items));
  if (d.phase === "bunker") return validShelter(d.shelter);
  return false;
}
/** A playable save (already repaired), or null. */
export function loadSave() {
  for (const k of [SAVE_KEY, BAK_KEY]) {
    const d = read(k);
    if (!validSave(d)) continue;
    if (d.phase === "house") {
      const h = restoreScavenge(d.house);
      if (h) return { phase: "house", house: h, savedAt: d.savedAt };
    } else return { phase: "bunker", shelter: sanitize(d.shelter), savedAt: d.savedAt };
  }
  return null;
}
export function saveInfo() {
  const s = loadSave();
  if (!s) return null;
  if (s.phase === "house") return { phase: "house", label: `Scavenging — ${Math.ceil(Math.max(0, s.house.limit - s.house.t))}s left`, savedAt: s.savedAt };
  const alive = Object.values(s.shelter.fam).filter((m) => m.alive).length;
  return { phase: "bunker", label: `Day ${s.shelter.day} · ${alive} survivor${alive === 1 ? "" : "s"}`, savedAt: s.savedAt, ended: !!s.shelter.ending };
}
export function writeSave(phase, data) {
  const prev = read(SAVE_KEY);
  if (validSave(prev)) write(BAK_KEY, prev);
  return write(SAVE_KEY, { v: SAVE_VERSION, phase, [phase === "house" ? "house" : "shelter"]: data, savedAt: Date.now() });
}
export function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
    localStorage.removeItem(BAK_KEY);
  } catch {
    /* storage unavailable */
  }
}
export function loadSettings() {
  const s = read(SET_KEY);
  return { ...DEFAULT_SETTINGS, ...(s && typeof s === "object" ? s : {}) };
}
export const storeSettings = (s) => write(SET_KEY, s);
export function loadEndings() {
  const e = read(END_KEY);
  return e && typeof e === "object" ? e : {};
}
export function recordEnding(id, day) {
  const e = loadEndings();
  const prev = e[id];
  e[id] = { first: prev?.first || Date.now(), count: (prev?.count || 0) + 1, best: Math.max(prev?.best || 0, day || 0) };
  write(END_KEY, e);
  return e;
}
