/**
 * Downhill Riders — persistent progress under its own versioned key
 * `downhill-riders-progress` (no other game's keys are touched). Nothing
 * from a race in progress (physics, positions) is ever saved.
 *
 *   best      per track: best place, best time, best trick score, finishes —
 *             a worse retry never lowers any of them (best medal is kept)
 *   bike      the selected bike (only ever an unlocked one)
 *   stats     lifetime statistics
 *   settings  audio / graphics / shadows / camera shake / reduced motion
 *   seen      unlocks already announced (so each toast shows once)
 *
 * Unlocks: track 1 is open; every other track opens when the one before it
 * earned a medal (top 3). Bikes unlock by medals, gold medals or by
 * completing a region (a medal on all six of its tracks).
 * Pure functions: every update returns a new state object.
 */
import { BIKES } from "../data/bikes.js";
import { REGIONS } from "../data/regions.js";
import { TOTAL_TRACKS } from "../data/tracks.js";

export const STORAGE_KEY = "downhill-riders-progress";
const VERSION = 1;
export const MEDAL_OF_PLACE = ["gold", "silver", "bronze", null];

export const DEFAULT_SETTINGS = {
  master: 0.85,
  music: 0.5,
  sfx: 0.9,
  musicOn: true,
  graphics: "medium", // low | medium | high
  shadows: true,
  effects: true,
  shake: 1, // 0 | 0.5 | 1
  reducedMotion: false,
  units: "kmh", // kmh | mph
};

const blankStats = () => ({
  races: 0,
  wins: 0,
  podiums: 0,
  distance: 0, // metres
  jumps: 0,
  tricks: 0,
  trickScore: 0,
  crashes: 0,
  boosts: 0,
  playTime: 0, // seconds racing
  bestCombo: 0,
});

export function defaultState() {
  return { v: VERSION, best: {}, bike: "trailblazer", lastTrack: 1, stats: blankStats(), settings: { ...DEFAULT_SETTINGS }, seen: [] };
}

const num = (v, d) => (typeof v === "number" && Number.isFinite(v) ? v : d);

/** Validates / migrates anything found under the key; never throws. */
export function sanitize(raw) {
  const d = defaultState();
  if (!raw || typeof raw !== "object") return d;
  const s = { ...d };
  s.best = {};
  if (raw.best && typeof raw.best === "object") {
    for (const [k, v] of Object.entries(raw.best)) {
      const id = Number(k);
      if (!(id >= 1 && id <= TOTAL_TRACKS) || !v || typeof v !== "object") continue;
      const time = num(v.time, null);
      if (time == null || time <= 0) continue;
      s.best[id] = {
        place: Math.max(1, Math.min(4, Math.round(num(v.place, 4)))),
        time,
        trickScore: Math.max(0, Math.round(num(v.trickScore, 0))),
        finishes: Math.max(1, Math.round(num(v.finishes, 1))),
      };
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
    effects: se.effects !== false,
    shake: [0, 0.5, 1].includes(se.shake) ? se.shake : 1,
    reducedMotion: se.reducedMotion === true,
    units: se.units === "mph" ? "mph" : "kmh",
  };
  s.seen = Array.isArray(raw.seen) ? raw.seen.filter((x) => typeof x === "string").slice(0, 64) : [];
  s.lastTrack = Math.max(1, Math.min(TOTAL_TRACKS, Math.round(num(raw.lastTrack, 1))));
  s.bike = typeof raw.bike === "string" && BIKES.some((b) => b.id === raw.bike) ? raw.bike : "trailblazer";
  if (!isBikeUnlocked(s, s.bike)) s.bike = "trailblazer";
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
    /* storage full / blocked: ride on without saving */
  }
}

// --- derived progress ------------------------------------------------------------------
export const medalOf = (s, id) => (s.best[id] ? MEDAL_OF_PLACE[s.best[id].place - 1] : null);
export const medalCount = (s) => Object.values(s.best).filter((b) => b.place <= 3).length;
export const goldCount = (s) => Object.values(s.best).filter((b) => b.place === 1).length;
export const regionOf = (id) => REGIONS.find((r) => id >= r.tracks[0] && id <= r.tracks[1]);

export function regionMedals(s, regionId) {
  const r = REGIONS.find((x) => x.id === regionId);
  let n = 0;
  for (let id = r.tracks[0]; id <= r.tracks[1]; id++) if (s.best[id] && s.best[id].place <= 3) n++;
  return n;
}
export const regionComplete = (s, regionId) => regionMedals(s, regionId) >= 6;

/** Track N is open when N = 1 or track N−1 earned a medal (and N has data). */
export function isTrackUnlocked(s, id, available = () => true) {
  if (id < 1 || id > TOTAL_TRACKS || !available(id)) return false;
  if (id === 1) return true;
  const prev = s.best[id - 1];
  return !!prev && prev.place <= 3;
}
export const isRegionUnlocked = (s, regionId) => isTrackUnlocked(s, REGIONS.find((r) => r.id === regionId).tracks[0]);

export function isBikeUnlocked(s, bikeId) {
  const b = BIKES.find((x) => x.id === bikeId);
  if (!b) return false;
  const u = b.unlock;
  if (!u) return true;
  if (u.medals != null) return medalCount(s) >= u.medals;
  if (u.golds != null) return goldCount(s) >= u.golds;
  if (u.region != null) return regionComplete(s, u.region);
  return false;
}

/** Progress toward a bike unlock, for the UI (0..1 and a label). */
export function unlockProgress(s, u) {
  if (!u) return { done: true, frac: 1, label: "" };
  if (u.medals != null) {
    const n = medalCount(s);
    return { done: n >= u.medals, frac: Math.min(1, n / u.medals), label: `${Math.min(n, u.medals)} / ${u.medals} medals` };
  }
  if (u.golds != null) {
    const n = goldCount(s);
    return { done: n >= u.golds, frac: Math.min(1, n / u.golds), label: `${Math.min(n, u.golds)} / ${u.golds} golds` };
  }
  if (u.region != null) {
    const n = regionMedals(s, u.region);
    const r = REGIONS.find((x) => x.id === u.region);
    return { done: n >= 6, frac: n / 6, label: `${n} / 6 medals in ${r.name}` };
  }
  return { done: false, frac: 0, label: "" };
}

/** Everything currently unlocked, as ids ("bike:swift", "region:2"). */
export function unlockedIds(s) {
  const out = [];
  for (const b of BIKES) if (b.unlock && isBikeUnlocked(s, b.id)) out.push(`bike:${b.id}`);
  for (const r of REGIONS) if (r.id > 1 && isRegionUnlocked(s, r.id)) out.push(`region:${r.id}`);
  return out;
}

// --- updates ---------------------------------------------------------------------------------
/**
 * Records a finished race. Returns { state, medal, prevMedal, improved,
 * newBestTime, newUnlocks, nextUnlocked }. Bests only ever improve.
 */
export function recordRace(s, trackId, res, raceStats = {}) {
  const place = res.place;
  const prev = s.best[trackId];
  const prevMedal = prev ? MEDAL_OF_PLACE[prev.place - 1] : null;
  const best = {
    place: prev ? Math.min(prev.place, place) : place,
    time: prev ? Math.min(prev.time, res.time) : res.time,
    trickScore: Math.max(prev ? prev.trickScore : 0, res.trickScore || 0),
    finishes: (prev ? prev.finishes : 0) + 1,
  };
  const st = { ...s.stats };
  st.races += 1;
  if (place === 1) st.wins += 1;
  if (place <= 3) st.podiums += 1;
  st.distance += raceStats.distance || 0;
  st.jumps += raceStats.jumps || 0;
  st.tricks += raceStats.tricks || 0;
  st.trickScore += raceStats.trickScore || 0;
  st.crashes += raceStats.crashes || 0;
  st.boosts += raceStats.boosts || 0;
  st.playTime += raceStats.time || 0;
  st.bestCombo = Math.max(st.bestCombo, raceStats.bestCombo || 0);
  const before = new Set(unlockedIds(s));
  const wasNextOpen = isTrackUnlocked(s, trackId + 1);
  const next = { ...s, best: { ...s.best, [trackId]: best }, stats: st, lastTrack: trackId };
  const newUnlocks = unlockedIds(next).filter((id) => !before.has(id) && !s.seen.includes(id));
  next.seen = [...s.seen, ...newUnlocks];
  return {
    state: next,
    medal: MEDAL_OF_PLACE[place - 1],
    prevMedal,
    improved: !prev || place < prev.place,
    newBestTime: !prev || res.time < prev.time,
    newUnlocks,
    nextUnlocked: !wasNextOpen && trackId < TOTAL_TRACKS && isTrackUnlocked(next, trackId + 1),
  };
}

/** Lifetime "playtime" also counts unfinished attempts (quit / restart). */
export function addPlayTime(s, seconds, raceStats = {}) {
  if (!(seconds > 0)) return s;
  const st = { ...s.stats, playTime: s.stats.playTime + seconds };
  st.distance += raceStats.distance || 0;
  st.crashes += raceStats.crashes || 0;
  st.jumps += raceStats.jumps || 0;
  return { ...s, stats: st };
}

export function selectBike(s, id) {
  if (!isBikeUnlocked(s, id) || s.bike === id) return s;
  return { ...s, bike: id };
}

export function updateSettings(s, patch) {
  return { ...s, settings: { ...s.settings, ...patch } };
}

/** The next track to ride: the first unlocked one not yet finished, else the last ridden. */
export function continueTrack(s, available = () => true) {
  for (let id = 1; id <= TOTAL_TRACKS; id++) {
    if (!isTrackUnlocked(s, id, available)) continue;
    if (!s.best[id]) return id;
  }
  return isTrackUnlocked(s, s.lastTrack, available) ? s.lastTrack : 1;
}
