/**
 * Parking Jam — persistence, stars and progression.
 *
 * One namespaced key, `parking-jam-progress`, versioned. Loading sanitises
 * field by field, so a damaged or outdated field falls back to its default
 * without wiping the rest of the save. Saves happen on real events (move,
 * undo, completion, settings/skin change) — never per animation frame.
 */
import { TOTAL_LEVELS } from "../data/index.js";
import { WORLDS, worldLevelIds } from "../data/worlds.js";
import { SKINS, skinUnlocked } from "../data/skins.js";

const KEY = "parking-jam-progress";
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
  moveAssist: false,
  reducedMotion: false,
};

export const DEFAULT_STATS = {
  carsCleared: 0,
  blockedAttempts: 0,
  hintsUsed: 0,
  undoUsed: 0,
  restarts: 0,
  playTimeMs: 0,
};

export function defaultProgress() {
  return {
    version: SAVE_VERSION,
    unlockedLevel: 1,
    completedLevels: [],
    starsByLevel: {},
    bestResults: {}, // id → { mistakes, timeMs, hints }
    selectedVehicleSkin: "classic",
    unlockedSkins: ["classic"],
    settings: { ...DEFAULT_SETTINGS, reducedMotion: prefersReducedMotion() },
    statistics: { ...DEFAULT_STATS },
    current: null, // { levelId, order: [vehicle index…], mistakes, hints } — resume
  };
}

const nat = (v, d = 0) => (Number.isFinite(v) && v >= 0 ? Math.floor(v) : d);
const validId = (id) => Number.isInteger(id) && id >= 1 && id <= TOTAL_LEVELS;

function sanitizeSettings(raw) {
  const s = { ...DEFAULT_SETTINGS };
  if (!raw || typeof raw !== "object") return s;
  for (const k of ["sound", "music", "particles", "moveAssist", "reducedMotion"]) {
    if (typeof raw[k] === "boolean") s[k] = raw[k];
  }
  if (["low", "medium", "high"].includes(raw.graphics)) s.graphics = raw.graphics;
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

  // Future versions migrate here; unknown fields are ignored, missing ones defaulted.
  p.unlockedLevel = Math.min(TOTAL_LEVELS, Math.max(1, nat(raw.unlockedLevel, 1)));
  if (Array.isArray(raw.completedLevels)) {
    p.completedLevels = [...new Set(raw.completedLevels.filter(validId))].sort((a, b) => a - b);
  }
  // A completed level always unlocks the next, even if `unlockedLevel` was damaged.
  for (const id of p.completedLevels) p.unlockedLevel = Math.min(TOTAL_LEVELS, Math.max(p.unlockedLevel, id + 1));
  if (raw.starsByLevel && typeof raw.starsByLevel === "object") {
    for (const [k, v] of Object.entries(raw.starsByLevel)) {
      const id = Number(k);
      if (validId(id) && [1, 2, 3].includes(v) && p.completedLevels.includes(id)) p.starsByLevel[id] = v;
    }
  }
  if (raw.bestResults && typeof raw.bestResults === "object") {
    for (const [k, v] of Object.entries(raw.bestResults)) {
      const id = Number(k);
      if (!validId(id) || !v || typeof v !== "object") continue;
      p.bestResults[id] = { mistakes: nat(v.mistakes, 0), timeMs: nat(v.timeMs, 0), hints: nat(v.hints, 0) };
    }
  }
  p.settings = sanitizeSettings(raw.settings);
  if (raw.statistics && typeof raw.statistics === "object") {
    for (const k of Object.keys(DEFAULT_STATS)) p.statistics[k] = nat(raw.statistics[k], 0);
  }
  // Skins are always re-derived from real milestones, so a damaged or edited
  // `unlockedSkins` list can neither lose nor invent a style.
  p.unlockedSkins = refreshSkins(p).unlockedSkins;
  if (typeof raw.selectedVehicleSkin === "string" && p.unlockedSkins.includes(raw.selectedVehicleSkin)) {
    p.selectedVehicleSkin = raw.selectedVehicleSkin;
  }
  const c = raw.current;
  if (c && typeof c === "object" && validId(c.levelId) && c.levelId <= p.unlockedLevel && Array.isArray(c.order)) {
    p.current = { levelId: c.levelId, order: c.order.filter(Number.isInteger), mistakes: nat(c.mistakes, 0), hints: nat(c.hints, 0) };
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

/* ------------------------------------------------------------ stars */

/**
 * Stars never depend on move count (every car leaves exactly once, so moves
 * always equal the car count). Instead:
 *   ★★★  no hints, and at most a small allowance of blocked taps
 *   ★★   a moderate number of blocked taps (hints allowed)
 *   ★    cleared
 * The allowances grow with the lot, so perfection is never required.
 */
export function starRules(level) {
  const n = level.vehicles.length;
  const three = level.stars?.three ?? Math.max(1, Math.floor(n / 8));
  const two = level.stars?.two ?? Math.max(3, Math.floor(n / 3));
  return { three, two };
}

export function starsFor(level, mistakes, hints) {
  const r = starRules(level);
  if (hints === 0 && mistakes <= r.three) return 3;
  if (mistakes <= r.two) return 2;
  return 1;
}

/* ------------------------------------------------------ progression */

export function summary(p) {
  const completed = p.completedLevels.length;
  let stars = 0;
  let perfect = 0;
  for (const s of Object.values(p.starsByLevel)) {
    stars += s;
    if (s === 3) perfect++;
  }
  const worldsCompleted = WORLDS.filter((w) => worldLevelIds(w.id).every((id) => p.completedLevels.includes(id))).length;
  return { completed, stars, perfect, worldsCompleted };
}

function refreshSkins(p) {
  const s = summary(p);
  const unlocked = new Set(p.unlockedSkins);
  for (const skin of SKINS) if (skinUnlocked(skin, s)) unlocked.add(skin.id);
  return { ...p, unlockedSkins: SKINS.filter((k) => unlocked.has(k.id)).map((k) => k.id) };
}

/**
 * Fold a finished level in. Pure and idempotent for the same result:
 * never lowers stars, never re-locks anything. Returns { progress, newSkins }.
 */
export function applyComplete(p, levelId, { stars, mistakes, timeMs, hints }) {
  const completedLevels = p.completedLevels.includes(levelId)
    ? p.completedLevels
    : [...p.completedLevels, levelId].sort((a, b) => a - b);
  const prevBest = p.bestResults[levelId];
  const better = !prevBest || mistakes < prevBest.mistakes || (mistakes === prevBest.mistakes && timeMs < prevBest.timeMs);
  const next = {
    ...p,
    unlockedLevel: Math.min(TOTAL_LEVELS, Math.max(p.unlockedLevel, levelId + 1)),
    completedLevels,
    starsByLevel: { ...p.starsByLevel, [levelId]: Math.max(p.starsByLevel[levelId] || 0, stars) },
    bestResults: better ? { ...p.bestResults, [levelId]: { mistakes, timeMs, hints } } : p.bestResults,
    current: null,
  };
  const refreshed = refreshSkins(next);
  const newSkins = refreshed.unlockedSkins.filter((id) => !p.unlockedSkins.includes(id));
  return { progress: refreshed, newSkins };
}

export function bump(p, key, by = 1) {
  return { ...p, statistics: { ...p.statistics, [key]: Math.max(0, (p.statistics[key] || 0) + by) } };
}

export function isWorldUnlocked(p, worldId) {
  return worldLevelIds(worldId)[0] <= p.unlockedLevel;
}

export function worldSummary(p, worldId) {
  const ids = worldLevelIds(worldId);
  let completed = 0;
  let stars = 0;
  for (const id of ids) {
    if (p.completedLevels.includes(id)) completed++;
    stars += p.starsByLevel[id] || 0;
  }
  return { completed, stars, total: ids.length };
}

/** First not-yet-completed unlocked level — what PLAY opens. */
export function nextPlayable(p) {
  for (let id = 1; id <= p.unlockedLevel; id++) if (!p.completedLevels.includes(id)) return id;
  return Math.min(p.unlockedLevel, TOTAL_LEVELS);
}
