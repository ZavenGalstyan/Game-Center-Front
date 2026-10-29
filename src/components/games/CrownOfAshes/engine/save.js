/**
 * Persistence (localStorage): one campaign slot + settings.
 *
 *   crown-of-ashes-save        { v, savedAt, profile }
 *   crown-of-ashes-settings    { quality, sens, invertY, master, music, sfx, hints, touch, … }
 *
 * Loading migrates older versions forward and fills any field a newer build
 * added (so old saves never crash a new build). A save that fails to parse
 * is moved aside to `…-corrupt` instead of being overwritten silently.
 */
import { newProfile, SAVE_VERSION } from "./profile.js";
import { HEROES } from "../data/heroes.js";

export const SAVE_KEY = "crown-of-ashes-save";
export const SETTINGS_KEY = "crown-of-ashes-settings";
export const DEFAULT_SETTINGS = { quality: "medium", sens: 1, invertY: false, master: 0.8, music: 0.55, sfx: 0.9, hints: true, touch: "auto", markers: true, dayLength: 1, shake: true, autoQuality: true };

const ls = (s) => s || (typeof localStorage !== "undefined" ? localStorage : null);

/** Bring an older profile up to SAVE_VERSION. */
export function migrate(P) {
  const out = { ...P };
  if (!out.v || out.v < 2) {
    // v1 stored reputation as a flat number per faction under `factions`
    if (out.factions && !out.rep) out.rep = { wardens: out.factions.wardens || 0, ember: out.factions.ember || 0, marches: out.factions.marches || 0 };
    delete out.factions;
  }
  if (out.v < 3) {
    // v2 kept interacted ids in world.interacted
    out.world = { ...(out.world || {}) };
    if (out.world.interacted && !out.world.used) out.world.used = out.world.interacted;
    delete out.world?.interacted;
  }
  // fill anything missing from a fresh profile of the same hero
  const hero = HEROES[out.hero] ? out.hero : "knight";
  const fresh = newProfile(hero, out.body);
  for (const k of Object.keys(fresh)) if (out[k] === undefined) out[k] = fresh[k];
  out.world = { ...fresh.world, ...(out.world || {}) };
  out.rep = { ...fresh.rep, ...(out.rep || {}) };
  out.stats = { ...fresh.stats, ...(out.stats || {}) };
  out.equip = { ...fresh.equip, ...(out.equip || {}) };
  out.hero = hero;
  out.v = SAVE_VERSION;
  return out;
}

export function loadSave(store) {
  const S = ls(store);
  const status = { corrupt: false, migrated: false };
  if (!S) return { profile: null, status };
  let raw = null;
  try {
    raw = S.getItem(SAVE_KEY);
  } catch {
    return { profile: null, status };
  }
  if (!raw) return { profile: null, status };
  try {
    const data = JSON.parse(raw);
    if (!data || !data.profile || typeof data.profile !== "object") throw new Error("bad save");
    let P = data.profile;
    if ((P.v || 1) < SAVE_VERSION) status.migrated = true;
    P = migrate(P);
    return { profile: P, savedAt: data.savedAt || 0, status };
  } catch {
    try {
      S.setItem(`${SAVE_KEY}-corrupt`, raw);
      S.removeItem(SAVE_KEY);
    } catch {
      /* storage unavailable */
    }
    status.corrupt = true;
    return { profile: null, status };
  }
}

export function writeSave(P, store) {
  const S = ls(store);
  if (!S || !P) return false;
  try {
    S.setItem(SAVE_KEY, JSON.stringify({ v: SAVE_VERSION, savedAt: Date.now(), profile: P }));
    return true;
  } catch {
    return false;
  }
}
export function clearSave(store) {
  const S = ls(store);
  try {
    S?.removeItem(SAVE_KEY);
  } catch {
    /* ignore */
  }
}
export function loadSettings(store) {
  const S = ls(store);
  try {
    const raw = S?.getItem(SETTINGS_KEY);
    return { ...DEFAULT_SETTINGS, ...(raw ? JSON.parse(raw) : {}) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}
export function writeSettings(s, store) {
  try {
    ls(store)?.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}
