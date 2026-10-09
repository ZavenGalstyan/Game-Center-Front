/**
 * Kart Legends — persistent progress under its own versioned key
 * `kart-legends-progress` (no other game's keys are touched).
 *
 *   stars      best stars per track (1st 3 · 2nd 2 · 3rd 1 · 4th 0) — a
 *              worse retry never lowers them
 *   best       best place / race time / lap per track
 *   kart       the selected kart (only ever an unlocked one)
 *   stats      lifetime statistics
 *   settings   audio / graphics / camera shake / units / music
 *   seen       unlocks already announced (so each toast shows once)
 * Pure functions: every update returns a new state object.
 */
import { KARTS } from "../data/karts.js";
import { WORLDS } from "../data/worlds.js";
import { TOTAL_TRACKS } from "../data/tracks.js";

export const STORAGE_KEY = "kart-legends-progress";
const VERSION = 1;

export const DEFAULT_SETTINGS = {
  master: 0.85,
  music: 0.5,
  sfx: 0.9,
  musicOn: true,
  graphics: "medium", // low | medium | high
  shadows: true,
  effects: true,
  shake: 1, // 0 | 0.5 | 1
  units: "kmh", // kmh | mph
  minimap: true,
};

const blankStats = () => ({
  races: 0,
  wins: 0,
  podiums: 0,
  drifts: 0,
  miniTurbos: 0,
  boosts: 0,
  distance: 0, // metres
  playTime: 0, // seconds racing
  bestLaps: {}, // trackId → seconds
});

export function defaultState() {
  return {
    v: VERSION,
    stars: {},
    best: {},
    kart: "rookie",
    lastTrack: 1,
    stats: blankStats(),
    settings: { ...DEFAULT_SETTINGS },
    seen: [],
  };
}

const num = (v, d) => (typeof v === "number" && Number.isFinite(v) ? v : d);

/** Validates / migrates anything found under the key; never throws. */
export function sanitize(raw) {
  const d = defaultState();
  if (!raw || typeof raw !== "object") return d;
  const s = { ...d };
  s.stars = {};
  if (raw.stars && typeof raw.stars === "object") {
    for (const [k, v] of Object.entries(raw.stars)) {
      const id = Number(k);
      if (id >= 1 && id <= TOTAL_TRACKS) s.stars[id] = Math.max(0, Math.min(3, Math.round(num(v, 0))));
    }
  }
  s.best = {};
  if (raw.best && typeof raw.best === "object") {
    for (const [k, v] of Object.entries(raw.best)) {
      const id = Number(k);
      if (id >= 1 && id <= TOTAL_TRACKS && v && typeof v === "object") s.best[id] = { place: Math.max(1, Math.min(4, num(v.place, 4))), time: num(v.time, null), lap: num(v.lap, null) };
    }
  }
  const st = raw.stats && typeof raw.stats === "object" ? raw.stats : {};
  s.stats = { ...blankStats() };
  for (const k of ["races", "wins", "podiums", "drifts", "miniTurbos", "boosts", "distance", "playTime"]) s.stats[k] = Math.max(0, num(st[k], 0));
  s.stats.bestLaps = {};
  if (st.bestLaps && typeof st.bestLaps === "object") for (const [k, v] of Object.entries(st.bestLaps)) if (num(v, 0) > 0) s.stats.bestLaps[k] = v;
  const se = raw.settings && typeof raw.settings === "object" ? raw.settings : {};
  s.settings = {
    master: Math.max(0, Math.min(1, num(se.master, d.settings.master))),
    music: Math.max(0, Math.min(1, num(se.music, d.settings.music))),
    sfx: Math.max(0, Math.min(1, num(se.sfx, d.settings.sfx))),
    musicOn: se.musicOn !== false,
    graphics: ["low", "medium", "high"].includes(se.graphics) ? se.graphics : d.settings.graphics,
    shadows: se.shadows !== false,
    effects: se.effects !== false,
    shake: [0, 0.5, 1].includes(se.shake) ? se.shake : 1,
    units: se.units === "mph" ? "mph" : "kmh",
    minimap: se.minimap !== false,
  };
  s.seen = Array.isArray(raw.seen) ? raw.seen.filter((x) => typeof x === "string").slice(0, 64) : [];
  s.lastTrack = Math.max(1, Math.min(TOTAL_TRACKS, Math.round(num(raw.lastTrack, 1))));
  s.kart = typeof raw.kart === "string" && KARTS.some((k) => k.id === raw.kart) ? raw.kart : "rookie";
  if (!isKartUnlocked(s, s.kart)) s.kart = "rookie";
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
export const starsForPlace = (place) => (place === 1 ? 3 : place === 2 ? 2 : place === 3 ? 1 : 0);
export const totalStars = (s) => Object.values(s.stars).reduce((a, b) => a + b, 0);
export const winsOf = (s) => s.stats.wins;

/** A world is complete when every one of its tracks has a podium (≥1 star). */
export function worldComplete(s, worldId) {
  const w = WORLDS.find((x) => x.id === worldId);
  if (!w) return false;
  for (let id = w.tracks[0]; id <= w.tracks[1]; id++) if (!(s.stars[id] >= 1)) return false;
  return true;
}

export function isWorldUnlocked(s, worldId) {
  const w = WORLDS.find((x) => x.id === worldId);
  if (!w) return false;
  if (!w.unlock) return true;
  return totalStars(s) >= (w.unlock.stars || 0);
}

/** Track N is open when its world is open and the previous track in that world has been finished. */
export function isTrackUnlocked(s, id, available = () => true) {
  const w = WORLDS.find((x) => id >= x.tracks[0] && id <= x.tracks[1]);
  if (!w || !available(id) || !isWorldUnlocked(s, w.id)) return false;
  if (id === w.tracks[0]) return true;
  return !!s.best[id - 1];
}

export function isKartUnlocked(s, kartId) {
  const k = KARTS.find((x) => x.id === kartId);
  if (!k) return false;
  const u = k.unlock;
  if (!u) return true;
  if (u.stars != null) return totalStars(s) >= u.stars;
  if (u.wins != null) return s.stats.wins >= u.wins;
  if (u.world != null) return worldComplete(s, u.world);
  return false;
}

/** Progress toward a kart / world unlock, for the UI (0..1 and a label). */
export function unlockProgress(s, u) {
  if (!u) return { done: true, frac: 1, label: "" };
  if (u.stars != null) {
    const n = totalStars(s);
    return { done: n >= u.stars, frac: Math.min(1, n / u.stars), label: `${Math.min(n, u.stars)} / ${u.stars} ★` };
  }
  if (u.wins != null) return { done: s.stats.wins >= u.wins, frac: Math.min(1, s.stats.wins / u.wins), label: `${Math.min(s.stats.wins, u.wins)} / ${u.wins} wins` };
  if (u.world != null) {
    const w = WORLDS.find((x) => x.id === u.world);
    let n = 0;
    for (let id = w.tracks[0]; id <= w.tracks[1]; id++) if (s.stars[id] >= 1) n++;
    return { done: n >= 6, frac: n / 6, label: `${n} / 6 podiums in ${w.name}` };
  }
  return { done: false, frac: 0, label: "" };
}

/** Everything currently unlocked, as ids ("kart:spark", "world:2"). */
export function unlockedIds(s) {
  const out = [];
  for (const k of KARTS) if (k.unlock && isKartUnlocked(s, k.id)) out.push(`kart:${k.id}`);
  for (const w of WORLDS) if (w.unlock && isWorldUnlocked(s, w.id)) out.push(`world:${w.id}`);
  return out;
}

// --- updates -------------------------------------------------------------------------------
/**
 * Records a finished race. Returns { state, earned, newBest, newUnlocks }.
 * Stars and bests only ever improve.
 */
export function recordRace(s, trackId, res, raceStats) {
  const place = res.place;
  const stars = starsForPlace(place);
  const prevStars = s.stars[trackId] || 0;
  const prev = s.best[trackId];
  const best = {
    place: prev ? Math.min(prev.place, place) : place,
    time: prev && prev.time != null ? Math.min(prev.time, res.time) : res.time,
    lap: prev && prev.lap != null && res.bestLap != null ? Math.min(prev.lap, res.bestLap) : (res.bestLap ?? prev?.lap ?? null),
  };
  const st = { ...s.stats, bestLaps: { ...s.stats.bestLaps } };
  st.races += 1;
  if (place === 1) st.wins += 1;
  if (place <= 3) st.podiums += 1;
  if (raceStats) {
    st.drifts += raceStats.drifts || 0;
    st.miniTurbos += raceStats.miniTurbos || 0;
    st.boosts += raceStats.boosts || 0;
    st.distance += raceStats.distance || 0;
    st.playTime += raceStats.time || 0;
  }
  if (res.bestLap != null && (!st.bestLaps[trackId] || res.bestLap < st.bestLaps[trackId])) st.bestLaps[trackId] = res.bestLap;
  const before = new Set(unlockedIds(s));
  const next = {
    ...s,
    stars: { ...s.stars, [trackId]: Math.max(prevStars, stars) },
    best: { ...s.best, [trackId]: best },
    stats: st,
    lastTrack: trackId,
  };
  const newUnlocks = unlockedIds(next).filter((id) => !before.has(id) && !s.seen.includes(id));
  next.seen = [...s.seen, ...newUnlocks];
  return {
    state: next,
    earned: stars,
    prevStars,
    improved: stars > prevStars,
    newBestTime: !prev || prev.time == null || res.time < prev.time,
    newUnlocks,
  };
}

export function selectKart(s, id) {
  if (!isKartUnlocked(s, id) || s.kart === id) return s;
  return { ...s, kart: id };
}

export function updateSettings(s, patch) {
  return { ...s, settings: { ...s.settings, ...patch } };
}

/** The next track to play: the first unlocked one without 3 stars after lastTrack, else lastTrack. */
export function continueTrack(s, available = () => true) {
  for (let id = 1; id <= TOTAL_TRACKS; id++) {
    if (!isTrackUnlocked(s, id, available)) continue;
    if (!s.best[id]) return id;
  }
  return isTrackUnlocked(s, s.lastTrack, available) ? s.lastTrack : 1;
}
