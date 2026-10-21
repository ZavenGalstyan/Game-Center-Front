/**
 * Versioned localStorage persistence. Only this game's keys are touched.
 *
 *   ultimate-mma-3d-save      { v, career, tournament, records, unlocks }
 *   ultimate-mma-3d-settings  { v, difficulty, quality, roundTime, master, sfx, crowd, hints, touch }
 *
 * Corrupted JSON is moved aside to `<key>-corrupt` (so nothing is silently
 * destroyed) and the game starts from defaults; outdated versions are migrated
 * or dropped section by section. Every access is wrapped — private mode or
 * blocked storage just means nothing persists.
 */
import { sanitizeCareer } from "./career.js";
import { sanitizeTournament } from "./tournament.js";

export const SAVE_KEY = "ultimate-mma-3d-save";
export const SETTINGS_KEY = "ultimate-mma-3d-settings";
export const SAVE_VERSION = 1;

export const DEFAULT_SETTINGS = { v: 1, difficulty: "normal", quality: "high", roundTime: 120, master: 0.9, sfx: 1, crowd: 0.8, hints: true, touch: "auto" };
const DEFAULT_SAVE = () => ({ v: SAVE_VERSION, career: null, tournament: null, records: { qfWins: 0, qfLosses: 0, tournaments: 0, trainingDone: [] }, lastQuick: null });

function read(key, storage) {
  try {
    const raw = storage.getItem(key);
    if (raw == null) return { ok: true, value: null };
    return { ok: true, value: JSON.parse(raw), raw };
  } catch (e) {
    return { ok: false, error: e };
  }
}

export function loadSave(storage = globalThis.localStorage) {
  const status = { corrupt: false, migrated: false };
  if (!storage) return { save: DEFAULT_SAVE(), status };
  const r = read(SAVE_KEY, storage);
  if (!r.ok || (r.value !== null && typeof r.value !== "object")) {
    status.corrupt = true;
    try {
      storage.setItem(SAVE_KEY + "-corrupt", storage.getItem(SAVE_KEY) ?? "");
      storage.removeItem(SAVE_KEY);
    } catch {
      /* storage unavailable */
    }
    return { save: DEFAULT_SAVE(), status };
  }
  if (!r.value) return { save: DEFAULT_SAVE(), status };
  const s = r.value;
  const out = DEFAULT_SAVE();
  if (s.v !== SAVE_VERSION) status.migrated = true;
  out.career = sanitizeCareer(s.career ?? null);
  if (s.career && !out.career) status.corrupt = true;
  out.tournament = sanitizeTournament(s.tournament ?? null);
  out.records = { ...out.records, ...(s.records && typeof s.records === "object" ? s.records : {}) };
  if (!Array.isArray(out.records.trainingDone)) out.records.trainingDone = [];
  out.lastQuick = s.lastQuick && typeof s.lastQuick === "object" ? s.lastQuick : null;
  return { save: out, status };
}

export function writeSave(save, storage = globalThis.localStorage) {
  try {
    storage?.setItem(SAVE_KEY, JSON.stringify({ ...save, v: SAVE_VERSION }));
    return true;
  } catch {
    return false;
  }
}

export function loadSettings(storage = globalThis.localStorage) {
  const r = storage ? read(SETTINGS_KEY, storage) : { ok: true, value: null };
  const s = r.ok && r.value && typeof r.value === "object" ? r.value : {};
  const out = { ...DEFAULT_SETTINGS, ...s, v: 1 };
  if (!["easy", "normal", "hard", "champion"].includes(out.difficulty)) out.difficulty = "normal";
  if (!["low", "medium", "high"].includes(out.quality)) out.quality = "high";
  if (![60, 90, 120, 180, 300].includes(out.roundTime)) out.roundTime = 120;
  for (const k of ["master", "sfx", "crowd"]) out[k] = Math.min(1, Math.max(0, Number(out[k]) || 0));
  return out;
}

export function writeSettings(s, storage = globalThis.localStorage) {
  try {
    storage?.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}
