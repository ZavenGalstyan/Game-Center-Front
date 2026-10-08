/**
 * Police Escape 3D — persistent progress under its own versioned key
 * `police-escape-3d-progress` (no other game's keys are touched). Nothing
 * from a mission in progress (positions, police, traffic, timers) is saved.
 *
 *   best      per mission: best time, best stars (0–3), escapes — a worse
 *             retry never lowers either
 *   car       the selected car (only ever an unlocked one)
 *   stats     lifetime statistics
 *   settings  audio / graphics / shadows / camera shake / reduced motion
 *   seen      unlocks already announced (each toast shows once)
 *
 * Mission N opens when mission N−1 has been completed. Cars unlock by
 * completed missions, stars, or completed worlds (data/cars.js).
 * Pure functions: every update returns a new state object.
 */
import { CARS } from "../data/cars.js";
import { WORLDS } from "../data/worlds.js";
import { TOTAL_MISSIONS } from "../data/missions.js";

export const STORAGE_KEY = "police-escape-3d-progress";
const VERSION = 1;

export const DEFAULT_SETTINGS = {
  master: 0.85,
  music: 0.4,
  sfx: 0.9,
  graphics: "medium", // low | medium | high
  shadows: "medium", // off | low | medium | high
  shake: 1, // 0 | 0.5 | 1
  reducedMotion: false,
};

const blankStats = () => ({
  escapes: 0,
  busted: 0,
  distance: 0,
  evaded: 0,
  roadblocksAvoided: 0,
  nitroUsed: 0,
  playTime: 0,
  bestEscape: 0, // fastest escape time (s), 0 = none
});

export function defaultState() {
  return { v: VERSION, best: {}, car: "shadow", lastMission: 1, stats: blankStats(), settings: { ...DEFAULT_SETTINGS }, seen: [] };
}

const num = (v, d) => (typeof v === "number" && Number.isFinite(v) ? v : d);

export function sanitize(raw) {
  const d = defaultState();
  if (!raw || typeof raw !== "object") return d;
  const s = { ...d, best: {} };
  if (raw.best && typeof raw.best === "object") {
    for (const [k, v] of Object.entries(raw.best)) {
      const id = Number(k);
      if (!(id >= 1 && id <= TOTAL_MISSIONS) || !v || typeof v !== "object") continue;
      const time = num(v.time, null);
      if (time == null || time <= 0) continue;
      s.best[id] = { time, stars: Math.max(1, Math.min(3, Math.round(num(v.stars, 1)))), escapes: Math.max(1, Math.round(num(v.escapes, 1))) };
    }
  }
  const st = raw.stats && typeof raw.stats === "object" ? raw.stats : {};
  s.stats = blankStats();
  for (const k of Object.keys(s.stats)) s.stats[k] = Math.max(0, num(st[k], 0));
  const se = raw.settings && typeof raw.settings === "object" ? raw.settings : {};
  s.settings = {
    master: Math.max(0, Math.min(1, num(se.master, d.settings.master))),
    music: Math.max(0, Math.min(1, num(se.music, d.settings.music))),
    sfx: Math.max(0, Math.min(1, num(se.sfx, d.settings.sfx))),
    graphics: ["low", "medium", "high"].includes(se.graphics) ? se.graphics : d.settings.graphics,
    shadows: ["off", "low", "medium", "high"].includes(se.shadows) ? se.shadows : d.settings.shadows,
    shake: [0, 0.5, 1].includes(se.shake) ? se.shake : 1,
    reducedMotion: se.reducedMotion === true,
  };
  s.seen = Array.isArray(raw.seen) ? raw.seen.filter((x) => typeof x === "string").slice(0, 64) : [];
  s.lastMission = Math.max(1, Math.min(TOTAL_MISSIONS, Math.round(num(raw.lastMission, 1))));
  s.car = typeof raw.car === "string" && CARS.some((c) => c.id === raw.car) ? raw.car : "shadow";
  if (!isCarUnlocked(s, s.car)) s.car = "shadow";
  return s;
}

export function loadState() {
  try {
    const txt = window.localStorage.getItem(STORAGE_KEY);
    if (!txt) return defaultState();
    return sanitize(JSON.parse(txt));
  } catch {
    return defaultState();
  }
}

export function saveState(s) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* storage full / blocked: play on without saving */
  }
}

// --- derived progress ---------------------------------------------------------------
export const completedCount = (s) => Object.keys(s.best).length;
export const starCount = (s) => Object.values(s.best).reduce((n, b) => n + b.stars, 0);
export function worldDone(s, worldId) {
  const w = WORLDS.find((x) => x.id === worldId);
  for (let id = w.missions[0]; id <= w.missions[1]; id++) if (!s.best[id]) return false;
  return true;
}
export const worldsDone = (s) => WORLDS.filter((w) => worldDone(s, w.id)).length;
export function worldStars(s, worldId) {
  const w = WORLDS.find((x) => x.id === worldId);
  let n = 0;
  for (let id = w.missions[0]; id <= w.missions[1]; id++) n += s.best[id] ? s.best[id].stars : 0;
  return n;
}

export function isMissionUnlocked(s, id, available = () => true) {
  if (id < 1 || id > TOTAL_MISSIONS || !available(id)) return false;
  return id === 1 || !!s.best[id - 1];
}
export const isWorldUnlocked = (s, worldId, available) => isMissionUnlocked(s, WORLDS.find((w) => w.id === worldId).missions[0], available);

export function unlockProgress(s, u) {
  if (!u) return { done: true, frac: 1, label: "", need: "" };
  const make = (n, need, what) => ({ done: n >= need, frac: Math.min(1, n / need), label: `${Math.min(n, need)} / ${need} ${what}`, need: `${need} ${what}` });
  if (u.missions != null) return make(completedCount(s), u.missions, "missions completed");
  if (u.stars != null) return make(starCount(s), u.stars, "stars earned");
  if (u.worlds != null) return make(worldsDone(s), u.worlds, "districts cleared");
  return { done: false, frac: 0, label: "", need: "" };
}
export function isCarUnlocked(s, carId) {
  const c = CARS.find((x) => x.id === carId);
  return !!c && unlockProgress(s, c.unlock).done;
}

export function unlockedIds(s) {
  const out = [];
  for (const c of CARS) if (c.unlock && isCarUnlocked(s, c.id)) out.push(`car:${c.id}`);
  for (const w of WORLDS) if (w.id > 1 && isWorldUnlocked(s, w.id)) out.push(`world:${w.id}`);
  return out;
}

// --- updates --------------------------------------------------------------------------
/** A completed mission. res = { time, stars, stats }. */
export function recordEscape(s, id, res) {
  const prev = s.best[id];
  const best = { time: prev ? Math.min(prev.time, res.time) : res.time, stars: Math.max(prev ? prev.stars : 0, res.stars), escapes: ((prev && prev.escapes) || 0) + 1 };
  const before = new Set(unlockedIds(s));
  const wasNextOpen = isMissionUnlocked(s, id + 1);
  const st = addStats(s.stats, res.stats || {});
  st.escapes += 1;
  st.bestEscape = st.bestEscape ? Math.min(st.bestEscape, res.time) : res.time;
  const next = { ...s, best: { ...s.best, [id]: best }, lastMission: id, stats: st };
  const newUnlocks = unlockedIds(next).filter((u) => !before.has(u) && !s.seen.includes(u));
  next.seen = [...s.seen, ...newUnlocks];
  return {
    state: next,
    prevStars: prev ? prev.stars : 0,
    bestStars: best.stars,
    newBestTime: !prev || res.time < prev.time,
    prevTime: prev ? prev.time : null,
    newUnlocks,
    nextUnlocked: !wasNextOpen && id < TOTAL_MISSIONS && isMissionUnlocked(next, id + 1),
  };
}

/** Busted / quit / restarted attempts still count toward lifetime stats. */
export function recordAttempt(s, stats, busted = false) {
  if (!stats || !(stats.time > 0.5)) return s;
  const st = addStats(s.stats, stats);
  if (busted) st.busted += 1;
  return { ...s, stats: st };
}

function addStats(st0, r) {
  const st = { ...st0 };
  st.distance += r.distance || 0;
  st.evaded += r.evaded || 0;
  st.roadblocksAvoided += r.roadblocksAvoided || 0;
  st.nitroUsed += r.nitroUsed || 0;
  st.playTime += r.time || 0;
  return st;
}

export function selectCar(s, id) {
  if (!isCarUnlocked(s, id) || s.car === id) return s;
  return { ...s, car: id };
}

export function updateSettings(s, patch) {
  return { ...s, settings: { ...s.settings, ...patch } };
}

export function continueMission(s, available = () => true) {
  for (let id = 1; id <= TOTAL_MISSIONS; id++) {
    if (!isMissionUnlocked(s, id, available)) continue;
    if (!s.best[id]) return id;
  }
  return isMissionUnlocked(s, s.lastMission, available) ? s.lastMission : 1;
}
