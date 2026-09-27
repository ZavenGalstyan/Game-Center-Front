/**
 * Dentist Studio — persistence, stars and progression.
 *
 * One namespaced, versioned key: `dentist-studio-progress`. Loading
 * sanitizes field by field, so one malformed field falls back to its
 * default without wiping the rest. Stars only ever go up; replaying can
 * never lower a best result or re-award anything. The mid-treatment save
 * (`current`) is a compact RLE snapshot written only at checkpoints.
 */
import { TOTAL_LEVELS, getLevel, LEVELS, CHAPTERS } from "../data/levels.js";
import { TOOL_SETS } from "../data/cosmetics.js";
import { TOOLS } from "../engine/defs.js";

const KEY = "dentist-studio-progress";
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
  smoothing: true,
  assist: true,
  reducedMotion: false,
};

export const DEFAULT_STATS = {
  patientsTreated: 0,
  teethCleaned: 0,
  plaqueRemoved: 0,
  stainsCleaned: 0,
  foodRemoved: 0,
  teethPolished: 0,
  flossing: 0,
  cavitiesTreated: 0,
  bracesCleaned: 0,
  perfectTreatments: 0,
  hintsUsed: 0,
  playTimeMs: 0,
};

export function defaultProgress() {
  return {
    version: SAVE_VERSION,
    unlocked: 1,
    levels: {},
    settings: { ...DEFAULT_SETTINGS, reducedMotion: prefersReducedMotion() },
    stats: { ...DEFAULT_STATS },
    toolSet: "mint",
    current: null,
  };
}

const num = (v, d = 0) => (Number.isFinite(v) && v >= 0 ? v : d);
const pick = (v, list, d) => (list.includes(v) ? v : d);

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
        bestClean: Math.min(1, num(v.bestClean)),
      };
    }
  }
  const s = raw.settings || {};
  for (const k of ["sound", "music", "particles", "smoothing", "assist", "reducedMotion"]) if (typeof s[k] === "boolean") p.settings[k] = s[k];
  p.settings.graphics = pick(s.graphics, ["low", "medium", "high"], p.settings.graphics);
  const st = raw.stats || {};
  for (const k of Object.keys(DEFAULT_STATS)) p.stats[k] = num(st[k]);
  p.toolSet = TOOL_SETS.some((c) => c.id === raw.toolSet) ? raw.toolSet : "mint";
  const c = raw.current;
  if (c && typeof c === "object" && getLevel(c.levelId) && c.levelId <= p.unlocked && c.data && typeof c.data === "object") {
    p.current = { levelId: c.levelId, data: c.data };
  }
  return p;
}

export function loadProgress() {
  try {
    const raw = window.localStorage.getItem(KEY);
    return sanitize(raw ? JSON.parse(raw) : null);
  } catch {
    return defaultProgress();
  }
}

export function saveProgress(p) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // storage full / blocked — try again without the mid-treatment snapshot
    try {
      window.localStorage.setItem(KEY, JSON.stringify({ ...p, current: null }));
    } catch {
      /* give up quietly */
    }
  }
}

export function totalStars(p) {
  return Object.values(p.levels).reduce((a, l) => a + l.stars, 0);
}

export function completedCount(p) {
  return Object.values(p.levels).filter((l) => l.completed > 0).length;
}

/** A chapter is complete when every one of its levels has been completed. */
export function chapterComplete(p, ch) {
  const list = LEVELS.filter((l) => l.chapter === ch);
  return list.length > 0 && list.every((l) => p.levels[l.id]?.completed > 0);
}

export function chapterUnlocked(p, ch) {
  const first = LEVELS.find((l) => l.chapter === ch);
  return !!first && first.id <= p.unlocked;
}

/** Highest chapter reached (for tool unlocks). */
export function reachedChapter(p) {
  let ch = 1;
  for (const c of CHAPTERS) if (chapterUnlocked(p, c.id)) ch = c.id;
  return ch;
}

export function toolUnlocked(p, toolId) {
  return (TOOLS[toolId]?.chapter || 1) <= reachedChapter(p);
}

/**
 * Stars never depend on speed:
 *   1 — treatment complete
 *   2 — good real cleanliness (≥ 85%)
 *   3 — plus every optional detail, with at most three hints
 */
export function computeStars(result) {
  let s = 1;
  if (result.cleanliness >= 0.85) s = 2;
  if (s === 2 && result.optDone >= result.optTotal && result.hints <= 3) s = 3;
  return s;
}

export function applyComplete(p, levelId, result) {
  const stars = computeStars(result);
  const prev = p.levels[levelId] || { stars: 0, completed: 0, bestClean: 0 };
  const levels = {
    ...p.levels,
    [levelId]: {
      stars: Math.max(prev.stars, stars),
      completed: prev.completed + 1,
      bestClean: Math.max(prev.bestClean, result.cleanliness),
    },
  };
  const c = result.counts;
  const st = { ...p.stats };
  st.patientsTreated += 1;
  st.teethCleaned += c.teethCleaned;
  st.plaqueRemoved += c.plaque + c.tartar;
  st.stainsCleaned += c.stains;
  st.teethPolished += c.polished;
  st.flossing += c.flossed;
  st.cavitiesTreated += c.cavities;
  st.bracesCleaned += c.braces;
  if (stars === 3) st.perfectTreatments += 1;
  return {
    ...p,
    levels,
    stats: st,
    unlocked: Math.min(TOTAL_LEVELS, Math.max(p.unlocked, levelId + 1)),
    current: p.current && p.current.levelId === levelId ? null : p.current,
  };
}

export function addStats(p, delta) {
  const st = { ...p.stats };
  for (const [k, v] of Object.entries(delta)) if (k in st && Number.isFinite(v)) st[k] += v;
  return { ...p, stats: st };
}
