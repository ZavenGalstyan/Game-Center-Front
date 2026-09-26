/**
 * Laser Maze — persistence, stars and progression. One namespaced key:
 * `laser-maze-progress`, versioned. Loading sanitizes field by field, so a
 * malformed or outdated field falls back to its default without wiping the
 * rest of the save. Nothing here touches another game's storage.
 */
import { TOTAL_LEVELS } from "../data/index.js";
import { WORLDS, worldLevelIds } from "../data/worlds.js";

const KEY = "laser-maze-progress";
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
  music: true,
  graphics: "medium", // low | medium | high
  particles: true,
  beamGlow: "normal", // soft | normal | intense
  reducedMotion: false,
};

const DEFAULT_STATS = {
  totalMoves: 0,
  hintsUsed: 0,
  resets: 0,
  undos: 0,
  playTimeMs: 0,
};

export function defaultProgress() {
  return {
    version: SAVE_VERSION,
    unlocked: 1,
    levels: {},
    settings: { ...DEFAULT_SETTINGS, reducedMotion: prefersReducedMotion() },
    stats: { ...DEFAULT_STATS },
    current: null, // { levelId, state, moves } — resume an unfinished puzzle
  };
}

const nat = (v, d = 0) => (Number.isFinite(v) && v >= 0 ? Math.floor(v) : d);
const pick = (v, list, d) => (list.includes(v) ? v : d);

function sanitizeSettings(raw) {
  const s = { ...DEFAULT_SETTINGS };
  if (!raw || typeof raw !== "object") return s;
  if (typeof raw.sound === "boolean") s.sound = raw.sound;
  if (typeof raw.music === "boolean") s.music = raw.music;
  if (typeof raw.particles === "boolean") s.particles = raw.particles;
  if (typeof raw.reducedMotion === "boolean") s.reducedMotion = raw.reducedMotion;
  s.graphics = pick(raw.graphics, ["low", "medium", "high"], s.graphics);
  s.beamGlow = pick(raw.beamGlow, ["soft", "normal", "intense"], s.beamGlow);
  return s;
}

export function loadProgress() {
  let raw = null;
  try {
    raw = JSON.parse(localStorage.getItem(KEY) || "null");
  } catch {
    raw = null;
  }
  const p = defaultProgress();
  if (!raw || typeof raw !== "object") return p;

  // Future versions migrate here; unknown newer versions still load field-wise.
  p.unlocked = Math.min(TOTAL_LEVELS, Math.max(1, nat(raw.unlocked, 1)));

  if (raw.levels && typeof raw.levels === "object") {
    for (const [k, l] of Object.entries(raw.levels)) {
      const id = Number(k);
      if (!Number.isInteger(id) || id < 1 || id > TOTAL_LEVELS || !l || typeof l !== "object") continue;
      const bestMoves = Number.isFinite(l.bestMoves) && l.bestMoves >= 0 ? Math.floor(l.bestMoves) : null;
      p.levels[id] = {
        completed: Boolean(l.completed),
        stars: [0, 1, 2, 3].includes(l.stars) ? l.stars : 0,
        bestMoves,
      };
      // A completed level always unlocks the next one, even if `unlocked` was damaged.
      if (p.levels[id].completed) p.unlocked = Math.min(TOTAL_LEVELS, Math.max(p.unlocked, id + 1));
    }
  }
  p.settings = sanitizeSettings(raw.settings);
  if (raw.stats && typeof raw.stats === "object") {
    for (const k of Object.keys(DEFAULT_STATS)) p.stats[k] = nat(raw.stats[k], 0);
  }
  if (raw.current && typeof raw.current === "object" && Number.isInteger(raw.current.levelId)) {
    p.current = { levelId: raw.current.levelId, state: raw.current.state, moves: nat(raw.current.moves, 0) };
  }
  return p;
}

export function saveProgress(p) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...p, version: SAVE_VERSION }));
  } catch {
    /* storage unavailable — the session simply won't persist */
  }
}

/**
 * Stars. `par` is the validator's PROVEN shortest solution, so matching it
 * (or somehow beating it) is always 3 stars — a better solution is never
 * penalised.
 */
export function starThresholds(par) {
  if (!Number.isFinite(par)) return { three: Infinity, two: Infinity };
  return { three: par, two: par + Math.max(2, Math.ceil(par * 0.5)) };
}

export function starsFor(moves, par) {
  const t = starThresholds(par);
  if (moves <= t.three) return 3;
  if (moves <= t.two) return 2;
  return 1;
}

/** Fold a finished level in. Pure. Never lowers stars or best moves. */
export function applyComplete(p, levelId, moves, stars) {
  const prev = p.levels[levelId] || { completed: false, stars: 0, bestMoves: null };
  const bestMoves = prev.bestMoves == null ? moves : Math.min(prev.bestMoves, moves);
  return {
    ...p,
    unlocked: Math.min(TOTAL_LEVELS, Math.max(p.unlocked, levelId + 1)),
    levels: {
      ...p.levels,
      [levelId]: { completed: true, stars: Math.max(prev.stars, stars), bestMoves },
    },
    current: null,
  };
}

export function bump(p, key, by = 1) {
  return { ...p, stats: { ...p.stats, [key]: (p.stats[key] || 0) + by } };
}

export function isWorldUnlocked(p, worldId) {
  return worldLevelIds(worldId)[0] <= p.unlocked;
}

export function worldSummary(p, worldId) {
  const ids = worldLevelIds(worldId);
  let completed = 0;
  let stars = 0;
  for (const id of ids) {
    const l = p.levels[id];
    if (l?.completed) completed++;
    stars += l?.stars || 0;
  }
  return { completed, stars, total: ids.length };
}

export function overall(p) {
  let completed = 0;
  let stars = 0;
  let perfect = 0;
  for (const l of Object.values(p.levels)) {
    if (l.completed) completed++;
    stars += l.stars;
    if (l.stars === 3) perfect++;
  }
  const worldsCompleted = WORLDS.filter((w) => worldSummary(p, w.id).completed === 10).length;
  return { completed, stars, perfect, worldsCompleted };
}

/** First not-yet-completed unlocked level — what "Play" should open. */
export function nextPlayable(p) {
  for (let id = 1; id <= p.unlocked; id++) if (!p.levels[id]?.completed) return id;
  return Math.min(p.unlocked, TOTAL_LEVELS);
}
