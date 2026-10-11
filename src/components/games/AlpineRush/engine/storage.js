/**
 * Alpine Rush — persistent progress under its own versioned key
 * `alpine-rush-progress` (no other game's keys are touched). Nothing from a
 * race in progress is ever saved, so Restart never touches progress.
 *
 *   best      per level: best medal, best adjusted time (+ raw / penalty of
 *             that run), best place, finishes — a worse retry never lowers
 *             any of them
 *   ski       the selected ski set (only ever an unlocked one)
 *   custom    jacket / pants / helmet colours, goggles, ski design
 *   stats     lifetime statistics
 *   settings  graphics, camera, audio, hints, reduced effects, units
 *   seen      unlocks already announced (each toast shows once)
 *
 * Unlocks: level 1 is open; every other level opens when the one before it
 * earned a medal. A world opens with its first level. Skis unlock by medal
 * count or gold medals. Pure functions: every update returns a new object.
 */
import { SKIS, JACKETS, PANTS, HELMETS, GOGGLES, SKI_DESIGNS, DEFAULT_CUSTOM } from "../data/skis.js";
import { WORLDS } from "../data/worlds.js";
import { TOTAL_LEVELS } from "../data/courses.js";

export const STORAGE_KEY = "alpine-rush-progress";
const VERSION = 1;
const MEDAL_RANK = { gold: 3, silver: 2, bronze: 1 };
const rankOf = (m) => MEDAL_RANK[m] || 0;

export const DEFAULT_SETTINGS = {
  master: 0.85,
  music: 0.45,
  sfx: 0.9,
  graphics: "medium", // low | medium | high
  camDist: "normal", // near | normal | far
  camSens: 0.5, // camera follow stiffness 0..1
  hints: true,
  reducedFx: false,
  units: "kmh",
};

const blankStats = () => ({
  races: 0,
  wins: 0,
  golds: 0,
  medals: 0,
  distance: 0,
  topSpeed: 0, // m/s
  jumps: 0,
  airTime: 0,
  gatesPassed: 0,
  gatesMissed: 0,
  falls: 0,
  playTime: 0,
  freeSkiTime: 0,
});

export function defaultState() {
  return { v: VERSION, best: {}, ski: "starter", custom: { ...DEFAULT_CUSTOM }, lastLevel: 1, stats: blankStats(), settings: { ...DEFAULT_SETTINGS }, seen: [] };
}

const num = (v, d) => (typeof v === "number" && Number.isFinite(v) ? v : d);
const hex = (v, list, d) => (typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v) && (!list || list.includes(v)) ? v : d);

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
      if (time == null || time <= 0 || time > 3600) continue;
      s.best[id] = {
        medal: MEDAL_RANK[v.medal] ? v.medal : null,
        time,
        raw: Math.max(0, num(v.raw, time)),
        penalty: Math.max(0, num(v.penalty, 0)),
        place: Math.max(1, Math.min(4, Math.round(num(v.place, 1)))),
        finishes: Math.max(1, Math.round(num(v.finishes, 1))),
      };
    }
  }
  const st = raw.stats && typeof raw.stats === "object" ? raw.stats : {};
  s.stats = blankStats();
  for (const k of Object.keys(s.stats)) s.stats[k] = Math.max(0, num(st[k], 0));
  const se = raw.settings && typeof raw.settings === "object" ? raw.settings : {};
  const unit = (v, dd) => Math.max(0, Math.min(1, num(v, dd)));
  s.settings = {
    master: unit(se.master, d.settings.master),
    music: unit(se.music, d.settings.music),
    sfx: unit(se.sfx, d.settings.sfx),
    graphics: ["low", "medium", "high"].includes(se.graphics) ? se.graphics : d.settings.graphics,
    camDist: ["near", "normal", "far"].includes(se.camDist) ? se.camDist : "normal",
    camSens: unit(se.camSens, 0.5),
    hints: se.hints !== false,
    reducedFx: se.reducedFx === true,
    units: se.units === "mph" ? "mph" : "kmh",
  };
  const c = raw.custom && typeof raw.custom === "object" ? raw.custom : {};
  s.custom = {
    jacket: hex(c.jacket, JACKETS, DEFAULT_CUSTOM.jacket),
    pants: hex(c.pants, PANTS, DEFAULT_CUSTOM.pants),
    helmet: hex(c.helmet, HELMETS, DEFAULT_CUSTOM.helmet),
    goggles: GOGGLES[c.goggles] ? c.goggles : DEFAULT_CUSTOM.goggles,
    design: SKI_DESIGNS[c.design] ? c.design : DEFAULT_CUSTOM.design,
  };
  s.seen = Array.isArray(raw.seen) ? raw.seen.filter((x) => typeof x === "string").slice(0, 64) : [];
  s.lastLevel = Math.max(1, Math.min(TOTAL_LEVELS, Math.round(num(raw.lastLevel, 1))));
  s.ski = typeof raw.ski === "string" && SKIS.some((k) => k.id === raw.ski) ? raw.ski : "starter";
  if (!isSkiUnlocked(s, s.ski)) s.ski = "starter";
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
    /* storage full / blocked: keep skiing without saving */
  }
}

// --- derived progress ---------------------------------------------------------------------
export const medalOf = (s, id) => s.best[id]?.medal || null;
export const medalCount = (s) => Object.values(s.best).filter((b) => b.medal).length;
export const goldCount = (s) => Object.values(s.best).filter((b) => b.medal === "gold").length;
export const worldOf = (id) => WORLDS.find((w) => id >= w.levels[0] && id <= w.levels[1]);

export function worldMedals(s, worldId) {
  const w = WORLDS.find((x) => x.id === worldId);
  const out = { gold: 0, silver: 0, bronze: 0, done: 0 };
  for (let id = w.levels[0]; id <= w.levels[1]; id++) {
    const b = s.best[id];
    if (!b) continue;
    out.done++;
    if (b.medal) out[b.medal]++;
  }
  return out;
}
export const worldComplete = (s, worldId) => {
  const m = worldMedals(s, worldId);
  return m.gold + m.silver + m.bronze >= 6;
};

/** Level N is open when N = 1 or level N−1 earned a medal (and N has data). */
export function isLevelUnlocked(s, id, available = () => true) {
  if (id < 1 || id > TOTAL_LEVELS || !available(id)) return false;
  if (id === 1) return true;
  return !!s.best[id - 1]?.medal;
}
export const isWorldUnlocked = (s, worldId, available) => isLevelUnlocked(s, WORLDS.find((w) => w.id === worldId).levels[0], available);

export function isSkiUnlocked(s, skiId) {
  const k = SKIS.find((x) => x.id === skiId);
  if (!k) return false;
  const u = k.unlock;
  if (!u) return true;
  if (u.medals != null) return medalCount(s) >= u.medals;
  if (u.golds != null) return goldCount(s) >= u.golds;
  if (u.world != null) return worldComplete(s, u.world);
  return false;
}

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
  return { done: false, frac: 0, label: "" };
}

export function unlockedIds(s, available) {
  const out = [];
  for (const k of SKIS) if (k.unlock && isSkiUnlocked(s, k.id)) out.push(`ski:${k.id}`);
  for (const w of WORLDS) if (w.id > 1 && isWorldUnlocked(s, w.id, available)) out.push(`world:${w.id}`);
  return out;
}

// --- updates ---------------------------------------------------------------------------------
/**
 * Records a finished race. Returns { state, medal, prevMedal, improved,
 * newBestTime, newUnlocks, nextUnlocked }. Bests only ever improve. A
 * disqualified run counts toward statistics but never sets a best.
 */
export function recordRace(s, levelId, res, raceStats = {}) {
  const prev = s.best[levelId];
  const prevMedal = prev?.medal || null;
  const medal = res.dsq ? null : res.medal || null;
  let best = prev;
  if (!res.dsq) {
    const better = !prev || res.adjusted < prev.time;
    best = {
      medal: rankOf(medal) > rankOf(prevMedal) ? medal : prevMedal,
      time: better ? res.adjusted : prev.time,
      raw: better ? res.time : prev.raw,
      penalty: better ? res.penalty : prev.penalty,
      place: prev ? Math.min(prev.place, res.place || 1) : res.place || 1,
      finishes: (prev ? prev.finishes : 0) + 1,
    };
  }
  const st = { ...s.stats };
  st.races += 1;
  if (res.mode === "rival" && res.place === 1 && !res.dsq) st.wins += 1;
  if (medal && rankOf(medal) > rankOf(prevMedal)) {
    if (!prevMedal) st.medals += 1;
    if (medal === "gold") st.golds += 1;
  }
  st.distance += raceStats.distance || 0;
  st.topSpeed = Math.max(st.topSpeed, raceStats.topSpeed || 0);
  st.jumps += raceStats.jumps || 0;
  st.airTime += raceStats.airTime || 0;
  st.gatesPassed += raceStats.gatesPassed || 0;
  st.gatesMissed += raceStats.gatesMissed || 0;
  st.falls += raceStats.falls || 0;
  st.playTime += raceStats.time || 0;
  const before = new Set(unlockedIds(s));
  const wasNextOpen = isLevelUnlocked(s, levelId + 1);
  const next = { ...s, best: best ? { ...s.best, [levelId]: best } : s.best, stats: st, lastLevel: levelId };
  const newUnlocks = unlockedIds(next).filter((id) => !before.has(id) && !s.seen.includes(id));
  next.seen = [...s.seen, ...newUnlocks];
  return {
    state: next,
    medal,
    prevMedal,
    improved: rankOf(medal) > rankOf(prevMedal),
    newBestTime: !res.dsq && (!prev || res.adjusted < prev.time),
    newUnlocks,
    nextUnlocked: !wasNextOpen && levelId < TOTAL_LEVELS && isLevelUnlocked(next, levelId + 1),
  };
}

/** Unfinished attempts (quit / restart) and free skiing still count toward statistics. */
export function addPlayTime(s, seconds, raceStats = {}, free = false) {
  if (!(seconds > 0)) return s;
  const st = { ...s.stats, playTime: s.stats.playTime + seconds };
  if (free) st.freeSkiTime += seconds;
  st.distance += raceStats.distance || 0;
  st.falls += raceStats.falls || 0;
  st.jumps += raceStats.jumps || 0;
  st.airTime += raceStats.airTime || 0;
  st.topSpeed = Math.max(st.topSpeed, raceStats.topSpeed || 0);
  return { ...s, stats: st };
}

export function selectSki(s, id) {
  if (!isSkiUnlocked(s, id) || s.ski === id) return s;
  return { ...s, ski: id };
}

export function updateSettings(s, patch) {
  return sanitize({ ...s, settings: { ...s.settings, ...patch } });
}

export function updateCustom(s, patch) {
  return sanitize({ ...s, custom: { ...s.custom, ...patch } });
}

/** The next level to ski: the first unlocked one without a medal, else the last skied. */
export function continueLevel(s, available = () => true) {
  for (let id = 1; id <= TOTAL_LEVELS; id++) {
    if (!isLevelUnlocked(s, id, available)) continue;
    if (!s.best[id]?.medal) return id;
  }
  return isLevelUnlocked(s, s.lastLevel, available) ? s.lastLevel : 1;
}
