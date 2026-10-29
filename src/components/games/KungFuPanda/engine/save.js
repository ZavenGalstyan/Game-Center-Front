/**
 * localStorage persistence: unlocked heroes, completed missions, best times,
 * last hero and settings. Every read is defensive — a corrupt or missing
 * save falls back to a fresh one.
 */
import { STARTING_HEROES, HERO_ORDER } from "../data/heroes.js";
import { MISSIONS, MISSION_BY_ID } from "../data/missions.js";

const KEY = "kung-fu-panda-progress";
export const DEFAULT_SETTINGS = { sens: 1, invertY: false, sound: true, touch: "auto" };

const fresh = () => ({ v: 1, unlocked: [...STARTING_HEROES], completed: [], best: {}, hero: "po", settings: { ...DEFAULT_SETTINGS } });

export function loadProgress(store = globalThis.localStorage) {
  try {
    const raw = store?.getItem(KEY);
    if (!raw) return fresh();
    const d = JSON.parse(raw);
    const p = fresh();
    if (Array.isArray(d.unlocked)) p.unlocked = HERO_ORDER.filter((h) => d.unlocked.includes(h) || STARTING_HEROES.includes(h));
    if (Array.isArray(d.completed)) p.completed = MISSIONS.map((m) => m.id).filter((id) => d.completed.includes(id));
    if (d.best && typeof d.best === "object") for (const [k, v] of Object.entries(d.best)) if (MISSION_BY_ID[k] && Number.isFinite(v)) p.best[k] = v;
    if (p.unlocked.includes(d.hero)) p.hero = d.hero;
    if (d.settings && typeof d.settings === "object") {
      const s = d.settings;
      if (Number.isFinite(s.sens)) p.settings.sens = Math.max(0.3, Math.min(2.5, s.sens));
      p.settings.invertY = !!s.invertY;
      p.settings.sound = s.sound !== false;
      if (["auto", "on", "off"].includes(s.touch)) p.settings.touch = s.touch;
    }
    return p;
  } catch {
    return fresh();
  }
}

export function saveProgress(p, store = globalThis.localStorage) {
  try {
    store?.setItem(KEY, JSON.stringify(p));
  } catch {
    /* storage full / blocked — progress just isn't kept */
  }
}

/** Returns a new progress object with the mission marked done + its reward. */
export function completeMission(p, missionId, secs) {
  const M = MISSION_BY_ID[missionId];
  const n = { ...p, unlocked: [...p.unlocked], completed: [...p.completed], best: { ...p.best } };
  if (!n.completed.includes(missionId)) n.completed.push(missionId);
  if (M?.reward && !n.unlocked.includes(M.reward)) n.unlocked.push(M.reward);
  if (missionId === "arena") for (const h of HERO_ORDER) if (!n.unlocked.includes(h)) n.unlocked.push(h);
  n.unlocked = HERO_ORDER.filter((h) => n.unlocked.includes(h));
  if (Number.isFinite(secs) && (!n.best[missionId] || secs < n.best[missionId])) n.best[missionId] = Math.round(secs);
  return n;
}

/** A mission is playable when it's the first or the one before it is done. */
export function missionUnlocked(p, missionId) {
  const i = MISSIONS.findIndex((m) => m.id === missionId);
  return i === 0 || (i > 0 && p.completed.includes(MISSIONS[i - 1].id));
}

export function resetProgress(store = globalThis.localStorage) {
  try {
    store?.removeItem(KEY);
  } catch {
    /* ignore */
  }
  return fresh();
}
