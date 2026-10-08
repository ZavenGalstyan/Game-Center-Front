/**
 * Stunt Racer 3D — persistent progress under its own versioned key
 * `stunt-racer-3d-progress` (no other game's keys are touched). Nothing from
 * a run in progress (physics, positions, timers) is ever saved.
 *
 *   best      per level: best time, best medal, stars ever collected on a
 *             finished run (union), finishes — a worse retry never lowers any
 *   car       the selected car (only ever an unlocked one)
 *   stats     lifetime statistics
 *   settings  audio / graphics / shadows / camera shake / reduced motion
 *   seen      unlocks already announced (so each toast shows once)
 *
 * Level N opens when level N−1 has been completed. Cars unlock by completed
 * levels, collected stars or gold medals (data/cars.js). Pure functions:
 * every update returns a new state object.
 */
import { CARS } from "../data/cars.js";
import { WORLDS } from "../data/worlds.js";
import { TOTAL_LEVELS } from "../data/levels.js";

export const STORAGE_KEY = "stunt-racer-3d-progress";
const VERSION = 1;
const MEDAL_RANK = { gold: 3, silver: 2, bronze: 1 };

export const DEFAULT_SETTINGS = {
  master: 0.85,
  music: 0.45,
  sfx: 0.9,
  musicOn: true,
  graphics: "medium", // low | medium | high
  shadows: true,
  shake: 1, // 0 | 0.5 | 1
  reducedMotion: false,
};

const blankStats = () => ({
  finishes: 0,
  jumps: 0,
  landings: 0,
  crashes: 0,
  distance: 0, // metres
  nitroUsed: 0, // seconds
  playTime: 0, // seconds
  bestAir: 0,
});

export function defaultState() {
  return { v: VERSION, best: {}, car: "blaze", lastLevel: 1, stats: blankStats(), settings: { ...DEFAULT_SETTINGS }, seen: [] };
}

const num = (v, d) => (typeof v === "number" && Number.isFinite(v) ? v : d);

/** Validates / migrates anything found under the key; never throws. */
export function sanitize(raw) {
  const d = defaultState();
  if (!raw || typeof raw !== "object") return d;
  const s = { ...d, best: {} };
  if (raw.best && typeof raw.best === "object") {
    for (const [k, v] of Object.entries(raw.best)) {
      const id = Number(k);
      if (!(id >= 1 && id <= TOTAL_LEVELS) || !v || typeof v !== "object") continue;
      const time = num(v.time, null);
      if (time == null || time <= 0) continue;
      const stars = Array.isArray(v.stars) ? [...new Set(v.stars.filter((x) => Number.isInteger(x) && x >= 0 && x < 3))].sort() : [];
      s.best[id] = { time, medal: MEDAL_RANK[v.medal] ? v.medal : "bronze", stars, finishes: Math.max(1, Math.round(num(v.finishes, 1))) };
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
    musicOn: se.musicOn !== false,
    graphics: ["low", "medium", "high"].includes(se.graphics) ? se.graphics : d.settings.graphics,
    shadows: se.shadows !== false,
    shake: [0, 0.5, 1].includes(se.shake) ? se.shake : 1,
    reducedMotion: se.reducedMotion === true,
  };
  s.seen = Array.isArray(raw.seen) ? raw.seen.filter((x) => typeof x === "string").slice(0, 64) : [];
  s.lastLevel = Math.max(1, Math.min(TOTAL_LEVELS, Math.round(num(raw.lastLevel, 1))));
  s.car = typeof raw.car === "string" && CARS.some((c) => c.id === raw.car) ? raw.car : "blaze";
  if (!isCarUnlocked(s, s.car)) s.car = "blaze";
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
export const goldCount = (s) => Object.values(s.best).filter((b) => b.medal === "gold").length;
export const starCount = (s) => Object.values(s.best).reduce((n, b) => n + b.stars.length, 0);
export const medalOf = (s, id) => (s.best[id] ? s.best[id].medal : null);

export function isLevelUnlocked(s, id, available = () => true) {
  if (id < 1 || id > TOTAL_LEVELS || !available(id)) return false;
  return id === 1 || !!s.best[id - 1];
}
export const isWorldUnlocked = (s, worldId, available) => isLevelUnlocked(s, WORLDS.find((w) => w.id === worldId).levels[0], available);
export function worldStars(s, worldId) {
  const w = WORLDS.find((x) => x.id === worldId);
  let n = 0;
  for (let id = w.levels[0]; id <= w.levels[1]; id++) n += s.best[id] ? s.best[id].stars.length : 0;
  return n;
}

export function isCarUnlocked(s, carId) {
  const c = CARS.find((x) => x.id === carId);
  if (!c) return false;
  return unlockProgress(s, c.unlock).done;
}

/** Progress toward a car unlock, for the UI (0..1 and a label). */
export function unlockProgress(s, u) {
  if (!u) return { done: true, frac: 1, label: "" };
  const make = (n, need, what) => ({ done: n >= need, frac: Math.min(1, n / need), label: `${Math.min(n, need)} / ${need} ${what}`, need: `${need} ${what}` });
  if (u.levels != null) return make(completedCount(s), u.levels, "levels completed");
  if (u.stars != null) return make(starCount(s), u.stars, "stars collected");
  if (u.golds != null) return make(goldCount(s), u.golds, "gold medals");
  return { done: false, frac: 0, label: "" };
}

/** Everything currently unlocked, as ids ("car:comet", "world:2"). */
export function unlockedIds(s) {
  const out = [];
  for (const c of CARS) if (c.unlock && isCarUnlocked(s, c.id)) out.push(`car:${c.id}`);
  for (const w of WORLDS) if (w.id > 1 && isWorldUnlocked(s, w.id)) out.push(`world:${w.id}`);
  return out;
}

// --- updates --------------------------------------------------------------------------
/**
 * Records a finished level. res = { time, stars: [indices], medal, stats }.
 * Returns { state, medal, prevMedal, bestMedal, newBestTime, prevTime,
 * newStars, newUnlocks, nextUnlocked }.
 */
export function recordFinish(s, id, res) {
  const prev = s.best[id];
  const stars = [...new Set([...(prev ? prev.stars : []), ...(res.stars || [])])].sort();
  const medal = !prev || MEDAL_RANK[res.medal] > MEDAL_RANK[prev.medal] ? res.medal : prev.medal;
  const best = { time: prev ? Math.min(prev.time, res.time) : res.time, medal, stars, finishes: (prev ? prev.finishes : 0) + 1 };
  const before = new Set(unlockedIds(s));
  const wasNextOpen = isLevelUnlocked(s, id + 1);
  const next = { ...s, best: { ...s.best, [id]: best }, lastLevel: id, stats: addStats(s.stats, res.stats || {}, true) };
  const newUnlocks = unlockedIds(next).filter((u) => !before.has(u) && !s.seen.includes(u));
  next.seen = [...s.seen, ...newUnlocks];
  return {
    state: next,
    medal: res.medal,
    prevMedal: prev ? prev.medal : null,
    bestMedal: medal,
    newBestTime: !prev || res.time < prev.time,
    prevTime: prev ? prev.time : null,
    newStars: stars.length - (prev ? prev.stars.length : 0),
    newUnlocks,
    nextUnlocked: !wasNextOpen && id < TOTAL_LEVELS && isLevelUnlocked(next, id + 1),
  };
}

function addStats(st0, r, finished) {
  const st = { ...st0 };
  if (finished) st.finishes += 1;
  st.jumps += r.jumps || 0;
  st.landings += r.landings || 0;
  st.crashes += r.crashes || 0;
  st.distance += r.distance || 0;
  st.nitroUsed += r.nitroUsed || 0;
  st.playTime += r.time || 0;
  st.bestAir = Math.max(st.bestAir, r.bestAir || 0);
  return st;
}

/** Unfinished attempts (quit / restart) still count toward lifetime stats. */
export function addAttempt(s, r) {
  if (!r || !(r.time > 0.5)) return s;
  return { ...s, stats: addStats(s.stats, r, false) };
}

export function selectCar(s, id) {
  if (!isCarUnlocked(s, id) || s.car === id) return s;
  return { ...s, car: id };
}

export function updateSettings(s, patch) {
  return { ...s, settings: { ...s.settings, ...patch } };
}

/** The level to continue: the first unlocked one not yet completed, else the last played. */
export function continueLevel(s, available = () => true) {
  for (let id = 1; id <= TOTAL_LEVELS; id++) {
    if (!isLevelUnlocked(s, id, available)) continue;
    if (!s.best[id]) return id;
  }
  return isLevelUnlocked(s, s.lastLevel, available) ? s.lastLevel : 1;
}
