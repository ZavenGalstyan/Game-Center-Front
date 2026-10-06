/**
 * Color Platforms — persistence under ONE namespaced, versioned key:
 * `color-platforms-progress`. Nothing else in localStorage is touched.
 *
 * Loading sanitises field by field: a missing / corrupt / partial field falls
 * back to its default without wiping the rest; unknown future fields are
 * ignored. Saves happen on discrete events only (attempt end, setting /
 * cosmetic change) — never per frame. Restart never touches this.
 *
 * Stars are stored per level as a 3-bit mask (union of every run), best time
 * per level in seconds; a level is "perfect" once finished with 3 stars and
 * no falls in a single run.
 */
import { LEVELS } from "../data/levels/index.js";
import { COSMETICS } from "../data/cosmetics.js";

const KEY = "color-platforms-progress";
export const SAVE_VERSION = 1;

const prefersReducedMotion = () => {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
};

export const DEFAULT_SETTINGS = {
  master: 0.8,
  music: true,
  sfx: true,
  graphics: "medium",
  particles: "normal",
  shake: "low",
  assist: true,
  controlHelp: true,
  reducedMotion: false,
};

export const STAT_KEYS = ["jumps", "switches", "BLUE", "RED", "YELLOW", "falls", "checkpoints", "moving", "fades", "bounces", "playMs", "attempts"];
const TUTORIAL_KEYS = ["basics", "moving", "fading", "bounce", "spikes"];

export function defaultProgress() {
  return {
    version: SAVE_VERSION,
    completed: {},
    unlocked: 1,
    stars: {},
    bestTimes: {},
    perfect: {},
    unlockedCosmetics: ["classic"],
    selectedCosmetic: "classic",
    tutorial: Object.fromEntries(TUTORIAL_KEYS.map((k) => [k, false])),
    settings: { ...DEFAULT_SETTINGS, reducedMotion: prefersReducedMotion() },
    stats: Object.fromEntries(STAT_KEYS.map((k) => [k, 0])),
  };
}

const int = (v, d = 0) => (Number.isFinite(v) && v >= 0 ? Math.floor(v) : d);
const time = (v) => (Number.isFinite(v) && v > 0 && v < 36000 ? v : null);
const bool = (v, d) => (typeof v === "boolean" ? v : d);
const pick = (v, list, d) => (list.includes(v) ? v : d);
const obj = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});

export function sanitize(raw) {
  const p = defaultProgress();
  if (!raw || typeof raw !== "object") return p;
  const completed = obj(raw.completed);
  const stars = obj(raw.stars);
  const best = obj(raw.bestTimes);
  const perfect = obj(raw.perfect);
  for (const L of LEVELS) {
    if (completed[L.id] === true) p.completed[L.id] = true;
    const m = int(stars[L.id]) & 7;
    if (m) p.stars[L.id] = m;
    const t = time(best[L.id]);
    if (t !== null && p.completed[L.id]) p.bestTimes[L.id] = t;
    if (perfect[L.id] === true && p.completed[L.id]) p.perfect[L.id] = true;
  }
  p.unlocked = Math.min(LEVELS.length, Math.max(1, int(raw.unlocked, 1), highestCompleted(p) + 1));
  const st = obj(raw.stats);
  for (const k of STAT_KEYS) p.stats[k] = int(st[k]);
  const tu = obj(raw.tutorial);
  for (const k of TUTORIAL_KEYS) p.tutorial[k] = bool(tu[k], false);
  const s = obj(raw.settings);
  p.settings = {
    master: Number.isFinite(s.master) ? Math.max(0, Math.min(1, s.master)) : p.settings.master,
    music: bool(s.music, p.settings.music),
    sfx: bool(s.sfx, p.settings.sfx),
    graphics: pick(s.graphics, ["low", "medium", "high"], p.settings.graphics),
    particles: pick(s.particles, ["low", "normal"], p.settings.particles),
    shake: pick(s.shake, ["off", "low"], p.settings.shake),
    assist: bool(s.assist, p.settings.assist),
    controlHelp: bool(s.controlHelp, p.settings.controlHelp),
    reducedMotion: bool(s.reducedMotion, p.settings.reducedMotion),
  };
  p.unlockedCosmetics = cosmeticsFor(p);
  p.selectedCosmetic = p.unlockedCosmetics.includes(raw.selectedCosmetic) ? raw.selectedCosmetic : "classic";
  return p;
}

export function loadProgress() {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return defaultProgress();
    return sanitize(JSON.parse(raw));
  } catch {
    return defaultProgress();
  }
}

export function saveProgress(p) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* storage full / blocked — the game keeps running */
  }
}

/* ------------------------------------------------------------ queries */

export const starMask = (p, id) => p.stars[id] || 0;
export const starCount = (mask) => (mask & 1) + ((mask >> 1) & 1) + ((mask >> 2) & 1);
export const totalStars = (p) => Object.values(p.stars).reduce((n, m) => n + starCount(m), 0);
export const levelsDone = (p) => Object.keys(p.completed).length;
export const isUnlocked = (p, id) => id >= 1 && id <= LEVELS.length && id <= p.unlocked;
export const highestUnlocked = (p) => Math.min(LEVELS.length, p.unlocked);
export function highestCompleted(p) {
  let h = 0;
  for (const k of Object.keys(p.completed)) h = Math.max(h, Number(k) || 0);
  return h;
}
export const cosmeticsFor = (p) => COSMETICS.filter((c) => totalStars(p) >= c.stars).map((c) => c.id);

/** Next level to "continue" with: first unlocked level not yet completed, else the last unlocked. */
export function continueLevel(p) {
  for (let id = 1; id <= highestUnlocked(p); id++) if (!p.completed[id]) return id;
  return highestUnlocked(p);
}

/* ------------------------------------------------------------ attempts */

function foldStats(stats, s, ms) {
  const out = { ...stats };
  for (const k of ["jumps", "switches", "BLUE", "RED", "YELLOW", "falls", "checkpoints", "moving", "fades", "bounces"]) out[k] += int(s[k]);
  out.playMs += int(ms);
  out.attempts += 1;
  return out;
}

/**
 * Fold one attempt (finished or abandoned) into progress. Pure.
 * summary: { levelId, time, stars: bool[3], falls, finished, stats }
 */
export function applyAttempt(prev, summary) {
  const id = summary.levelId;
  const p = {
    ...prev,
    completed: { ...prev.completed },
    stars: { ...prev.stars },
    bestTimes: { ...prev.bestTimes },
    perfect: { ...prev.perfect },
  };
  const t = Number.isFinite(summary.time) && summary.time > 0 ? summary.time : 0;
  p.stats = foldStats(prev.stats, summary.stats || {}, t * 1000);
  let firstClear = false;
  let record = false;
  let prevBest = prev.bestTimes[id] ?? null;
  if (summary.finished) {
    firstClear = !prev.completed[id];
    p.completed[id] = true;
    let mask = starMask(prev, id);
    summary.stars.forEach((g, i) => {
      if (g) mask |= 1 << i;
    });
    if (mask) p.stars[id] = mask;
    if (t > 0 && (prevBest === null || t < prevBest)) {
      p.bestTimes[id] = t;
      record = prevBest !== null;
    }
    if (summary.falls === 0 && summary.stars.every(Boolean)) p.perfect[id] = true;
    p.unlocked = Math.min(LEVELS.length, Math.max(p.unlocked, id + 1));
  }
  const before = new Set(prev.unlockedCosmetics);
  p.unlockedCosmetics = cosmeticsFor(p);
  const newCosmetics = p.unlockedCosmetics.filter((c) => !before.has(c));
  return { progress: p, firstClear, record, prevBest, newCosmetics };
}
