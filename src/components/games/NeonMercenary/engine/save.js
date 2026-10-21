/**
 * Versioned localStorage persistence.
 *
 *   neon-mercenary-save      { v, savedAt, profile }
 *   neon-mercenary-settings  { quality, sens, invertY, master, music, sfx, fov }
 *
 * Loading never throws: unreadable JSON is backed up under
 * `neon-mercenary-save-corrupt` and reported; older versions are migrated;
 * every load is passed through profile.sanitize() so a hand-edited or
 * half-written save can't create invalid inventory / equipment / quest states.
 */
import { SAVE_VERSION, newProfile, sanitize } from "./profile.js";
import { CONTRACT_BY_ID } from "../data/contracts.js";

export const SAVE_KEY = "neon-mercenary-save";
export const SETTINGS_KEY = "neon-mercenary-settings";

export const DEFAULT_SETTINGS = { quality: "medium", sens: 1, invertY: false, master: 0.8, music: 0.55, sfx: 0.8, showHints: true };

function migrate(p) {
  // v1 → v2: story.active was an id; v2 → v3: unlocked map + stats.crits
  if ((p.v | 0) < 2 && p.story && typeof p.story.active === "number") p.story.active = { id: p.story.active, checkpoint: 0, items: {} };
  if ((p.v | 0) < 3) {
    p.unlocked = { market: true, industrial: !!p.story?.flags?.razorDown, corporate: !!p.story?.flags?.ironjawDown, ...(p.unlocked || {}) };
    p.stats = { kills: 0, deaths: 0, time: 0, shots: 0, hits: 0, crits: 0, ...(p.stats || {}) };
  }
  p.v = SAVE_VERSION;
  return p;
}

/** Fill any missing structure from a fresh profile and repair story state. */
function repair(p) {
  const base = newProfile({ body: p.look?.body, skin: p.look?.skin, hair: p.look?.hair, accent: p.look?.accent, name: p.name });
  const out = { ...base, ...p };
  out.look = { ...base.look, ...(p.look || {}) };
  out.story = { ...base.story, ...(p.story || {}) };
  out.story.flags = { ...(p.story?.flags || {}) };
  out.story.done = [...new Set((p.story?.done || []).filter((id) => CONTRACT_BY_ID[id]))].sort((a, b) => a - b);
  // contracts are sequential: keep the longest valid prefix
  const done = [];
  for (const id of out.story.done) if (id === done.length + 1) done.push(id);
  out.story.done = done;
  for (const id of done) out.story.flags[`c${id}`] = true;
  const a = out.story.active;
  if (a && (!CONTRACT_BY_ID[a.id] || done.includes(a.id) || a.id !== done.length + 1)) out.story.active = null;
  else if (a) out.story.active = { id: a.id, checkpoint: Math.max(0, Math.min(CONTRACT_BY_ID[a.id].steps.length - 1, a.checkpoint | 0)), items: a.items || {} };
  out.story.bosses = { ...(p.story?.bosses || {}) };
  out.unlocked = { market: true, industrial: done.includes(7) || !!out.unlocked?.industrial, corporate: done.includes(14) || !!out.unlocked?.corporate };
  if (!out.unlocked[out.district]) out.district = "market";
  if (!["market", "industrial", "corporate"].includes(out.district)) out.district = "market";
  if (out.pos && (out.pos.district !== out.district || !Number.isFinite(out.pos.x) || !Number.isFinite(out.pos.z))) out.pos = null;
  return sanitize(out);
}

export function loadSave(store = typeof localStorage !== "undefined" ? localStorage : null) {
  const status = { found: false, corrupt: false, migrated: false };
  if (!store) return { profile: null, status };
  let raw = null;
  try {
    raw = store.getItem(SAVE_KEY);
  } catch {
    return { profile: null, status };
  }
  if (!raw) return { profile: null, status };
  status.found = true;
  try {
    const data = JSON.parse(raw);
    if (!data || typeof data !== "object" || !data.profile || typeof data.profile !== "object") throw new Error("bad shape");
    let p = data.profile;
    if ((p.v | 0) !== SAVE_VERSION) {
      p = migrate(p);
      status.migrated = true;
    }
    return { profile: repair(p), status, savedAt: data.savedAt || 0 };
  } catch {
    status.corrupt = true;
    try {
      store.setItem(`${SAVE_KEY}-corrupt`, raw);
      store.removeItem(SAVE_KEY);
    } catch {
      /* ignore */
    }
    return { profile: null, status };
  }
}

export function writeSave(profile, store = typeof localStorage !== "undefined" ? localStorage : null) {
  if (!store || !profile) return false;
  try {
    store.setItem(SAVE_KEY, JSON.stringify({ v: SAVE_VERSION, savedAt: Date.now(), profile }));
    return true;
  } catch {
    return false;
  }
}

export function clearSave(store = typeof localStorage !== "undefined" ? localStorage : null) {
  try {
    store?.removeItem(SAVE_KEY);
  } catch {
    /* ignore */
  }
}

export function loadSettings(store = typeof localStorage !== "undefined" ? localStorage : null) {
  try {
    const s = JSON.parse(store?.getItem(SETTINGS_KEY) || "null");
    if (!s || typeof s !== "object") return { ...DEFAULT_SETTINGS };
    const out = { ...DEFAULT_SETTINGS, ...s };
    if (!["low", "medium", "high"].includes(out.quality)) out.quality = "medium";
    out.sens = Math.max(0.2, Math.min(3, +out.sens || 1));
    for (const k of ["master", "music", "sfx"]) out[k] = Math.max(0, Math.min(1, +out[k] || 0));
    return out;
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}
export function writeSettings(s, store = typeof localStorage !== "undefined" ? localStorage : null) {
  try {
    store?.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}
