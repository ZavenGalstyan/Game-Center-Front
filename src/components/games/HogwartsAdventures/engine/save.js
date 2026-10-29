/**
 * localStorage persistence. One campaign slot + settings. A damaged save is
 * moved aside (never silently deleted) and the menu says so.
 */
import { SAVE_VERSION, newHeroState } from "./profile.js";
import { HERO_IDS } from "../data/heroes.js";

export const SAVE_KEY = "hogwarts-adventures-save";
export const SETTINGS_KEY = "hogwarts-adventures-settings";

export const DEFAULT_SETTINGS = { quality: "auto", master: 0.8, music: 0.55, sfx: 0.9, sens: 1, invertY: false, shake: true, hints: true, touch: "auto", autoQuality: true };

const ls = (s) => s || (typeof localStorage !== "undefined" ? localStorage : null);

function migrate(P) {
  if (!P || typeof P !== "object" || !P.heroes || !P.quests) throw new Error("bad save");
  P.v = P.v || 1;
  for (const h of HERO_IDS) if (!P.heroes[h]) P.heroes[h] = newHeroState();
  P.flags = P.flags || {};
  P.objs = P.objs || {};
  P.discovered = P.discovered || {};
  P.inv = P.inv || {};
  P.stats = { time: 0, kills: 0, casts: 0, deaths: 0, pages: 0, chests: 0, ...(P.stats || {}) };
  if (!HERO_IDS.includes(P.hero)) P.hero = "harry";
  return P;
}

export function loadSave(store) {
  const s = ls(store);
  const status = { corrupt: false, migrated: false };
  if (!s) return { profile: null, status };
  let raw = null;
  try {
    raw = s.getItem(SAVE_KEY);
  } catch {
    return { profile: null, status };
  }
  if (!raw) return { profile: null, status };
  try {
    const P = JSON.parse(raw);
    const before = P.v;
    migrate(P);
    if (before !== SAVE_VERSION) status.migrated = true;
    return { profile: P, status };
  } catch {
    try {
      s.setItem(`${SAVE_KEY}-damaged-${Date.now()}`, raw);
      s.removeItem(SAVE_KEY);
    } catch {
      /* ignore */
    }
    status.corrupt = true;
    return { profile: null, status };
  }
}
export function writeSave(P, store) {
  const s = ls(store);
  if (!s) return false;
  try {
    s.setItem(SAVE_KEY, JSON.stringify({ ...P, v: SAVE_VERSION, saved: Date.now() }));
    return true;
  } catch {
    return false;
  }
}
export function clearSave(store) {
  const s = ls(store);
  try {
    s?.removeItem(SAVE_KEY);
  } catch {
    /* ignore */
  }
}
export function loadSettings(store) {
  const s = ls(store);
  try {
    const raw = s?.getItem(SETTINGS_KEY);
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : { ...DEFAULT_SETTINGS };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}
export function writeSettings(v, store) {
  try {
    ls(store)?.setItem(SETTINGS_KEY, JSON.stringify(v));
  } catch {
    /* ignore */
  }
}
