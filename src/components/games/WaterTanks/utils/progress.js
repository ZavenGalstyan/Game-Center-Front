/**
 * Water Tanks — persistence, stars and progression.
 *
 * One namespaced key, `water-tanks-progress`, versioned. Loading sanitises
 * field by field, so a damaged or outdated field falls back to its default
 * without wiping the rest of the save. Never saved: selection, pour/animation
 * state, the in-progress puzzle — a reload always lands on a stable menu.
 */
import { TOTAL_LEVELS } from "../data/index.js";
import { CHAPTERS, chapterLevelIds } from "../data/chapters.js";
import { STYLES } from "../data/styles.js";

export const STORAGE_KEY = "water-tanks-progress";
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
  pourSpeed: "normal", // normal | fast
  graphics: "high", // low | medium | high
  waterEffects: true,
  particles: true,
  reducedMotion: false,
  measureLabels: true,
  controlHelp: true,
};

export const DEFAULT_STATS = {
  puzzlesSolved: 0, // includes replays
  totalPours: 0,
  totalFills: 0,
  totalDrains: 0,
  totalMoves: 0,
  litersTransferred: 0,
  hintsUsed: 0,
  undoUses: 0,
  restarts: 0,
  optimalSolves: 0,
  invalidActions: 0,
  playTimeMs: 0,
};

export function defaultProgress() {
  return {
    version: SAVE_VERSION,
    highestUnlockedLevel: 1,
    completedLevels: [],
    starsByLevel: {},
    bestMovesByLevel: {},
    selectedTankStyle: "classic",
    settings: { ...DEFAULT_SETTINGS, reducedMotion: prefersReducedMotion() },
    statistics: { ...DEFAULT_STATS },
  };
}

const nat = (v, d = 0) => (Number.isFinite(v) && v >= 0 ? Math.floor(v) : d);
const validId = (id) => Number.isInteger(id) && id >= 1 && id <= TOTAL_LEVELS;

function sanitizeSettings(raw) {
  const s = { ...DEFAULT_SETTINGS };
  if (!raw || typeof raw !== "object") return s;
  for (const k of ["sound", "music", "waterEffects", "particles", "reducedMotion", "measureLabels", "controlHelp"]) {
    if (typeof raw[k] === "boolean") s[k] = raw[k];
  }
  if (["normal", "fast"].includes(raw.pourSpeed)) s.pourSpeed = raw.pourSpeed;
  if (["low", "medium", "high"].includes(raw.graphics)) s.graphics = raw.graphics;
  return s;
}

/** Old shapes → current shape. v1 is the first; future migrations go here. */
function migrate(raw) {
  if (!raw || typeof raw !== "object") return null;
  if (!Number.isInteger(raw.version) || raw.version > SAVE_VERSION) {
    // unknown/newer save: keep what can be read field by field
  }
  return raw;
}

export function sanitizeProgress(input) {
  const raw = migrate(input);
  const p = defaultProgress();
  if (!raw) return p;
  p.highestUnlockedLevel = Math.min(TOTAL_LEVELS, Math.max(1, nat(raw.highestUnlockedLevel, 1)));
  if (Array.isArray(raw.completedLevels)) {
    p.completedLevels = [...new Set(raw.completedLevels.filter(validId))].sort((a, b) => a - b);
  }
  for (const id of p.completedLevels) p.highestUnlockedLevel = Math.min(TOTAL_LEVELS, Math.max(p.highestUnlockedLevel, id + 1));
  if (raw.starsByLevel && typeof raw.starsByLevel === "object") {
    for (const [k, v] of Object.entries(raw.starsByLevel)) {
      const id = Number(k);
      if (validId(id) && [1, 2, 3].includes(v) && p.completedLevels.includes(id)) p.starsByLevel[id] = v;
    }
  }
  if (raw.bestMovesByLevel && typeof raw.bestMovesByLevel === "object") {
    for (const [k, v] of Object.entries(raw.bestMovesByLevel)) {
      const id = Number(k);
      if (validId(id) && p.completedLevels.includes(id) && Number.isInteger(v) && v > 0) p.bestMovesByLevel[id] = v;
    }
  }
  p.settings = sanitizeSettings(raw.settings);
  if (raw.statistics && typeof raw.statistics === "object") {
    for (const k of Object.keys(DEFAULT_STATS)) p.statistics[k] = nat(raw.statistics[k], 0);
  }
  if (typeof raw.selectedTankStyle === "string" && styleUnlocked(p, raw.selectedTankStyle)) p.selectedTankStyle = raw.selectedTankStyle;
  return p;
}

export function loadProgress() {
  let raw = null;
  try {
    raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
  } catch {
    raw = null;
  }
  try {
    return sanitizeProgress(raw);
  } catch {
    return defaultProgress();
  }
}

export function saveProgress(p) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...p, version: SAVE_VERSION }));
  } catch {
    /* storage unavailable — the session simply won't persist */
  }
}

/* ------------------------------------------------------------ stars */

/** ★★★ at the BFS optimum, ★★ within a small allowance, ★ for any solve. Hints cap at ★★. */
export function starRule(optimal) {
  return { three: optimal, two: optimal + Math.max(2, Math.ceil(optimal * 0.4)) };
}

export function starsFor(level, moves, hints = 0) {
  const r = starRule(level.optimalMoves);
  let s = moves <= r.three ? 3 : moves <= r.two ? 2 : 1;
  if (hints > 0) s = Math.min(s, 2);
  return s;
}

/* ------------------------------------------------------ progression */

export function summary(p) {
  let stars = 0;
  let perfect = 0;
  for (const s of Object.values(p.starsByLevel)) {
    stars += s;
    if (s === 3) perfect++;
  }
  const chaptersCompleted = CHAPTERS.filter((c) => chapterLevelIds(c.id).every((id) => p.completedLevels.includes(id))).length;
  return { completed: p.completedLevels.length, stars, perfect, chaptersCompleted };
}

export function styleUnlocked(p, styleId) {
  const st = STYLES.find((s) => s.id === styleId);
  return Boolean(st) && summary(p).stars >= st.stars;
}

/**
 * Fold a finished level in. Pure; never lowers stars or best moves, never
 * re-locks anything. Returns { progress, stars, newBest, newStyles }.
 */
export function applyComplete(p, level, { moves, hints }) {
  const id = level.id;
  const stars = starsFor(level, moves, hints);
  const before = summary(p).stars;
  const prevBest = p.bestMovesByLevel[id];
  const newBest = !prevBest || moves < prevBest;
  const next = {
    ...p,
    highestUnlockedLevel: Math.min(TOTAL_LEVELS, Math.max(p.highestUnlockedLevel, id + 1)),
    completedLevels: p.completedLevels.includes(id) ? p.completedLevels : [...p.completedLevels, id].sort((a, b) => a - b),
    starsByLevel: { ...p.starsByLevel, [id]: Math.max(p.starsByLevel[id] || 0, stars) },
    bestMovesByLevel: newBest ? { ...p.bestMovesByLevel, [id]: moves } : p.bestMovesByLevel,
    statistics: {
      ...p.statistics,
      puzzlesSolved: p.statistics.puzzlesSolved + 1,
      optimalSolves: p.statistics.optimalSolves + (moves <= level.optimalMoves ? 1 : 0),
    },
  };
  const after = summary(next).stars;
  const newStyles = STYLES.filter((s) => s.stars > before && s.stars <= after);
  return { progress: next, stars, newBest: newBest && Boolean(prevBest), prevBest: prevBest ?? null, newStyles };
}

export function bump(p, key, by = 1) {
  return { ...p, statistics: { ...p.statistics, [key]: Math.max(0, (p.statistics[key] || 0) + by) } };
}

export function chapterSummary(p, chapterId) {
  const ids = chapterLevelIds(chapterId).filter((id) => id <= TOTAL_LEVELS);
  let completed = 0;
  let stars = 0;
  for (const id of ids) {
    if (p.completedLevels.includes(id)) completed++;
    stars += p.starsByLevel[id] || 0;
  }
  return { completed, stars, total: ids.length, unlocked: ids.length > 0 && ids[0] <= p.highestUnlockedLevel };
}

/** First not-yet-completed unlocked level — what CONTINUE opens. */
export function nextPlayable(p) {
  for (let id = 1; id <= p.highestUnlockedLevel; id++) if (!p.completedLevels.includes(id)) return id;
  return Math.min(p.highestUnlockedLevel, TOTAL_LEVELS);
}
