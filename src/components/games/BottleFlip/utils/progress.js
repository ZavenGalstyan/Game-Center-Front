/**
 * Bottle Flip — persistence, stars, unlocks.
 *
 * One namespaced, versioned localStorage key: `bottle-flip-progress`.
 * Loading sanitises field by field (a broken field falls back to its default
 * without wiping the rest). Best results only ever improve; replays can't
 * lower stars or award them twice. Active physics is never saved.
 */
import { TOTAL_LEVELS, getLevel } from "../levels/levels.js";
import { SKINS } from "../data/skins.js";

const KEY = "bottle-flip-progress";
export const SAVE_VERSION = 1;

const prefersReducedMotion = () => {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
};

export const DEFAULT_SETTINGS = {
  sound: true,
  music: false,
  graphics: "medium",
  particles: true,
  shake: true,
  aimGuide: true,
  reducedMotion: false,
};

export const DEFAULT_STATS = {
  levelsCompleted: 0,
  flips: 0,
  landings: 0,
  perfects: 0,
  fails: 0,
  bestStreak: 0,
  attempts: 0,
  playTimeMs: 0,
};

export function defaultProgress() {
  return {
    version: SAVE_VERSION,
    unlocked: 1,
    levels: {},
    skin: "classic",
    skins: ["classic"],
    settings: { ...DEFAULT_SETTINGS, reducedMotion: prefersReducedMotion() },
    stats: { ...DEFAULT_STATS },
  };
}

const num = (v, d = 0) => (Number.isFinite(v) && v >= 0 ? v : d);
const bool = (v, d) => (typeof v === "boolean" ? v : d);

function sanitize(raw) {
  const p = defaultProgress();
  if (!raw || typeof raw !== "object") return p;
  p.unlocked = Math.min(TOTAL_LEVELS, Math.max(1, Math.floor(num(raw.unlocked, 1))));
  if (raw.levels && typeof raw.levels === "object") {
    for (const [k, v] of Object.entries(raw.levels)) {
      const id = Number(k);
      if (!getLevel(id) || !v || typeof v !== "object") continue;
      p.levels[id] = {
        stars: Math.min(3, Math.floor(num(v.stars))),
        completed: Math.floor(num(v.completed)),
        bestFalls: Number.isFinite(v.bestFalls) && v.bestFalls >= 0 ? Math.floor(v.bestFalls) : null,
        bestPerfects: Math.floor(num(v.bestPerfects)),
        allStars: bool(v.allStars, false),
      };
    }
  }
  // every completed level unlocks the next one (repairs a corrupted counter)
  for (const id of Object.keys(p.levels).map(Number)) {
    if (p.levels[id].completed > 0) p.unlocked = Math.max(p.unlocked, Math.min(TOTAL_LEVELS, id + 1));
  }
  const s = raw.settings || {};
  const d = p.settings;
  p.settings = {
    sound: bool(s.sound, d.sound),
    music: bool(s.music, d.music),
    graphics: ["low", "medium", "high"].includes(s.graphics) ? s.graphics : d.graphics,
    particles: bool(s.particles, d.particles),
    shake: bool(s.shake, d.shake),
    aimGuide: bool(s.aimGuide, d.aimGuide),
    reducedMotion: bool(s.reducedMotion, d.reducedMotion),
  };
  const st = raw.stats || {};
  for (const k of Object.keys(DEFAULT_STATS)) p.stats[k] = num(st[k], 0);
  const ids = new Set(SKINS.map((x) => x.id));
  p.skins = Array.isArray(raw.skins) ? [...new Set(["classic", ...raw.skins.filter((x) => ids.has(x))])] : ["classic"];
  p.skin = ids.has(raw.skin) && p.skins.includes(raw.skin) ? raw.skin : "classic";
  return refreshSkins(p);
}

export function loadProgress() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? sanitize(JSON.parse(raw)) : defaultProgress();
  } catch {
    return defaultProgress();
  }
}

export function saveProgress(p) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* storage full / blocked — the game keeps running */
  }
}

/** The level PLAY continues with: the first unlocked level not yet cleared. */
export function nextLevelId(p) {
  let id = 1;
  while (id < p.unlocked && p.levels[id]?.completed) id += 1;
  return Math.min(id, TOTAL_LEVELS);
}

export function totalStars(p) {
  return Object.values(p.levels).reduce((a, l) => a + (l.stars || 0), 0);
}

export function highestCompleted(p) {
  let m = 0;
  for (const [k, v] of Object.entries(p.levels)) if (v.completed > 0) m = Math.max(m, Number(k));
  return m;
}

export function skinUnlocked(p, skin) {
  const u = skin.unlock;
  switch (u.type) {
    case "default":
      return true;
    case "level":
      return (p.levels[u.value]?.completed || 0) > 0;
    case "stars":
      return totalStars(p) >= u.value;
    case "perfects":
      return p.stats.perfects >= u.value;
    case "streak":
      return p.stats.bestStreak >= u.value;
    default:
      return false;
  }
}

/** Unlocks are derived from progress and only ever added. */
export function refreshSkins(p) {
  const have = new Set(p.skins);
  let changed = false;
  for (const s of SKINS) {
    if (!have.has(s.id) && skinUnlocked(p, s)) {
      have.add(s.id);
      changed = true;
    }
  }
  return changed ? { ...p, skins: SKINS.map((s) => s.id).filter((id) => have.has(id)) } : p;
}

/**
 * Stars for one run:
 *   ★ finish   ★ falls ≤ par   ★ every bonus star (or a PERFECT when the
 *   level has none)
 */
export function computeStars(level, run) {
  const total = level.collectibles?.length || 0;
  const s1 = true;
  const s2 = run.falls <= level.par;
  const s3 = total > 0 ? run.collected >= total : run.perfects > 0;
  return { stars: (s1 ? 1 : 0) + (s2 ? 1 : 0) + (s3 ? 1 : 0), s1, s2, s3 };
}

export function applyComplete(p, level, run) {
  const { stars } = computeStars(level, run);
  const prev = p.levels[level.id] || { stars: 0, completed: 0, bestFalls: null, bestPerfects: 0, allStars: false };
  const total = level.collectibles?.length || 0;
  const next = {
    ...p,
    unlocked: Math.min(TOTAL_LEVELS, Math.max(p.unlocked, level.id + 1)),
    levels: {
      ...p.levels,
      [level.id]: {
        stars: Math.max(prev.stars, stars),
        completed: prev.completed + 1,
        bestFalls: prev.bestFalls == null ? run.falls : Math.min(prev.bestFalls, run.falls),
        bestPerfects: Math.max(prev.bestPerfects, run.perfects),
        allStars: prev.allStars || (total > 0 && run.collected >= total),
      },
    },
    stats: {
      ...p.stats,
      levelsCompleted: p.stats.levelsCompleted + (prev.completed ? 0 : 1),
    },
  };
  return refreshSkins(next);
}

export function addStats(p, d) {
  const stats = { ...p.stats };
  for (const [k, v] of Object.entries(d)) {
    if (k === "bestStreak") stats.bestStreak = Math.max(stats.bestStreak, v);
    else stats[k] = (stats[k] || 0) + v;
  }
  return refreshSkins({ ...p, stats });
}
