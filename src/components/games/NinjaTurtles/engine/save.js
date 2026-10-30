/**
 * localStorage persistence: completed missions, best times, the last turtle,
 * unlocked content (Hard difficulty after beating the Shredder, a badge per
 * turtle that has beaten him) and settings. Every read is defensive — a
 * corrupt or missing save falls back to a fresh one.
 */
import { TURTLE_ORDER } from "../data/turtles.js";
import { MISSIONS, MISSION_BY_ID } from "../data/missions.js";

export const SAVE_KEY = "ninja-turtles-shadow-strike-progress";
export const DEFAULT_SETTINGS = { sens: 1, invertY: false, sound: true, touch: "auto", difficulty: "normal" };

const fresh = () => ({ v: 1, completed: [], best: {}, hero: "leo", champions: [], hardUnlocked: false, settings: { ...DEFAULT_SETTINGS } });

export function loadProgress(store = globalThis.localStorage) {
  try {
    const raw = store?.getItem(SAVE_KEY);
    if (!raw) return fresh();
    const d = JSON.parse(raw);
    const p = fresh();
    if (Array.isArray(d.completed)) p.completed = MISSIONS.map((m) => m.id).filter((id) => d.completed.includes(id));
    if (d.best && typeof d.best === "object") for (const [k, v] of Object.entries(d.best)) if (MISSION_BY_ID[k] && Number.isFinite(v) && v >= 0) p.best[k] = v;
    if (TURTLE_ORDER.includes(d.hero)) p.hero = d.hero;
    if (Array.isArray(d.champions)) p.champions = TURTLE_ORDER.filter((t) => d.champions.includes(t));
    p.hardUnlocked = !!d.hardUnlocked || p.completed.includes("boss");
    if (d.settings && typeof d.settings === "object") {
      const s = d.settings;
      if (Number.isFinite(s.sens)) p.settings.sens = Math.max(0.3, Math.min(2.5, s.sens));
      p.settings.invertY = !!s.invertY;
      p.settings.sound = s.sound !== false;
      if (["auto", "on", "off"].includes(s.touch)) p.settings.touch = s.touch;
      if (["easy", "normal"].includes(s.difficulty) || (s.difficulty === "hard" && p.hardUnlocked)) p.settings.difficulty = s.difficulty;
    }
    return p;
  } catch {
    return fresh();
  }
}

export function saveProgress(p, store = globalThis.localStorage) {
  try {
    store?.setItem(SAVE_KEY, JSON.stringify(p));
  } catch {
    /* storage full / blocked — progress just isn't kept */
  }
}

/** Returns a new progress object with the mission marked done. */
export function completeMission(p, missionId, secs, heroId) {
  const n = { ...p, completed: [...p.completed], best: { ...p.best }, champions: [...p.champions] };
  if (!n.completed.includes(missionId)) n.completed.push(missionId);
  n.completed = MISSIONS.map((m) => m.id).filter((id) => n.completed.includes(id));
  if (missionId === "boss") {
    n.hardUnlocked = true;
    if (TURTLE_ORDER.includes(heroId) && !n.champions.includes(heroId)) n.champions = TURTLE_ORDER.filter((t) => t === heroId || n.champions.includes(t));
  }
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
    store?.removeItem(SAVE_KEY);
  } catch {
    /* ignore */
  }
  return fresh();
}
