/**
 * Element Merge — localStorage persistence. One namespaced key:
 * `element-merge-progress`. Every read is sanitized against the CURRENT
 * element/recipe registry, so an older save never crashes a newer build —
 * an invalid workspace entry (element id no longer exists, or a corrupt
 * position) is simply dropped, never the whole save.
 *
 * Writes are explicit (see the exported mutators below) and callers debounce
 * high-frequency ones (workspace drag) themselves — nothing here writes on
 * every pointer move.
 */
import { ELEMENT_INDEX, STARTER_IDS } from "../data/elements.js";
import { ELEMENTS } from "../data/elements.js";

const KEY = "element-merge-progress";
const SAVE_VERSION = 1;
const RECENT_CAP = 16;
const WORKSPACE_CAP = 30;

export const DEFAULT_SETTINGS = {
  sound: true,
  music: true,
  particles: true,
  graphics: "medium", // low | medium | high
  reducedMotion: false,
  discoveryAnimation: true,
  autoSaveWorkspace: true,
};

export function defaultState() {
  return {
    saveVersion: SAVE_VERSION,
    discovered: [...STARTER_IDS],
    discoveredRecipes: [], // "a|b" keys the player has personally found
    workspace: [],
    recent: [],
    favorites: [],
    settings: { ...DEFAULT_SETTINGS },
    achievements: [],
    statistics: {
      totalDiscoveries: STARTER_IDS.length,
      totalCombinations: 0,
      successfulCombinations: 0,
      failedCombinations: 0,
      uniqueRecipesFound: 0,
      hintsUsed: 0,
      playTimeMs: 0,
      elementUsage: {},
    },
  };
}

function readJSON() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "null");
  } catch {
    return null;
  }
}
function writeJSON(v) {
  try {
    localStorage.setItem(KEY, JSON.stringify(v));
  } catch {
    /* storage unavailable — session just won't persist */
  }
}

function sanitizeSettings(raw) {
  const s = { ...DEFAULT_SETTINGS, ...(raw || {}) };
  if (!["low", "medium", "high"].includes(s.graphics)) s.graphics = "medium";
  for (const k of ["sound", "music", "particles", "reducedMotion", "discoveryAnimation", "autoSaveWorkspace"]) {
    s[k] = Boolean(s[k]);
  }
  return s;
}

function clamp01(n) {
  return Math.min(1, Math.max(0, Number.isFinite(n) ? n : 0.5));
}

/** Loads and repairs a save. Never throws; never wipes progress over one bad field. */
export function loadState() {
  const raw = readJSON();
  const def = defaultState();
  if (!raw || typeof raw !== "object") return def;

  const discovered = Array.isArray(raw.discovered)
    ? raw.discovered.filter((id) => ELEMENT_INDEX.has(id))
    : [];
  for (const s of STARTER_IDS) if (!discovered.includes(s)) discovered.push(s);

  const discoveredSet = new Set(discovered);
  const workspace = Array.isArray(raw.workspace)
    ? raw.workspace
        .filter((t) => t && typeof t === "object" && ELEMENT_INDEX.has(t.elementId) && typeof t.uid === "string")
        .slice(0, WORKSPACE_CAP)
        .map((t) => ({ uid: t.uid, elementId: t.elementId, x: clamp01(t.x), y: clamp01(t.y) }))
    : [];

  const recent = Array.isArray(raw.recent)
    ? raw.recent.filter((id) => discoveredSet.has(id)).slice(0, RECENT_CAP)
    : [];

  const favorites = Array.isArray(raw.favorites)
    ? raw.favorites.filter((id) => discoveredSet.has(id))
    : [];

  const discoveredRecipes = Array.isArray(raw.discoveredRecipes)
    ? raw.discoveredRecipes.filter((k) => typeof k === "string")
    : [];

  const achievements = Array.isArray(raw.achievements)
    ? raw.achievements.filter((id) => typeof id === "string")
    : [];

  const rawStats = raw.statistics && typeof raw.statistics === "object" ? raw.statistics : {};
  const statistics = {
    ...def.statistics,
    ...rawStats,
    elementUsage:
      rawStats.elementUsage && typeof rawStats.elementUsage === "object" ? { ...rawStats.elementUsage } : {},
  };
  for (const k of ["totalDiscoveries", "totalCombinations", "successfulCombinations", "failedCombinations", "uniqueRecipesFound", "hintsUsed", "playTimeMs"]) {
    statistics[k] = Number.isFinite(statistics[k]) ? Math.max(0, Math.floor(statistics[k])) : 0;
  }
  statistics.totalDiscoveries = Math.max(statistics.totalDiscoveries, discovered.length);

  return {
    saveVersion: SAVE_VERSION,
    discovered,
    discoveredRecipes,
    workspace,
    recent,
    favorites,
    settings: sanitizeSettings(raw.settings),
    achievements,
    statistics,
  };
}

export function saveState(state) {
  writeJSON(state);
}

export function resetAllProgress() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* noop */
  }
  return defaultState();
}

export function totalElementCount() {
  return ELEMENTS.length;
}
