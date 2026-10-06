/**
 * Lost Toy — versioned localStorage save (`lost-toy-progress`).
 *
 * Every load goes through `sanitize`, so a missing, corrupt, partial or older
 * save always becomes a valid one (unknown keys dropped, numbers clamped,
 * NaN / negative values discarded). Nothing here ever throws, and nothing
 * wipes progress that can be kept.
 *
 * Progression: Level 1 is open; each completed level unlocks the next (a
 * world's first level opens when the previous world's last level is done).
 * Memory Buttons are never required to progress. Memories and cosmetics
 * unlock from the total buttons found / worlds completed (no currency).
 */
import { COSMETICS } from "../data/cosmetics.js";
import { unlockedMemories } from "../data/memories.js";

export const SAVE_KEY = "lost-toy-progress";
export const SAVE_VERSION = 1;
export const LEVEL_COUNT = 50;
export const LEVELS_PER_WORLD = 10;

export const DEFAULT_SETTINGS = {
  master: 0.85,
  music: 0.55,
  sfx: 0.9,
  graphics: "medium",
  sensitivity: 1,
  cameraShake: "low",
  invertY: false,
  reducedMotion: false,
  controlHelp: true,
  showTimer: false,
  assist: false,
};

export const STAT_KEYS = ["levelRuns", "completions", "jumps", "falls", "ledgeSaves", "pushes", "bounces", "rides", "petEncounters", "checkpoints", "distance", "interacts", "climbs", "playTime"];
export const TUTORIAL_KEYS = ["move", "camera", "jump", "bounce", "push", "ledge", "interact", "ride", "climb", "balance", "sprint", "explore", "pet", "water", "wind"];

export function defaultProgress() {
  const statistics = {};
  for (const k of STAT_KEYS) statistics[k] = 0;
  return {
    version: SAVE_VERSION,
    completedLevels: {},
    unlockedLevels: [1],
    memoryButtonsByLevel: {},
    totalMemoryButtons: 0,
    unlockedMemories: [],
    unlockedCosmetics: ["classic"],
    selectedCosmetic: "classic",
    bestTimes: {},
    settings: { ...DEFAULT_SETTINGS },
    statistics,
    tutorialFlags: {},
    lastLevel: 1,
    seenIntro: false,
    seenEnding: false,
    newMemories: [],
  };
}

const num = (v, lo, hi, d) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
const bool = (v, d) => (typeof v === "boolean" ? v : d);
const oneOf = (v, list, d) => (list.includes(v) ? v : d);
const validId = (k) => {
  const n = Number(k);
  return Number.isInteger(n) && n >= 1 && n <= LEVEL_COUNT;
};

export function sanitize(raw) {
  const p = defaultProgress();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return p;
  const src = migrate(raw);
  if (src.completedLevels && typeof src.completedLevels === "object") {
    for (const [k, v] of Object.entries(src.completedLevels)) if (validId(k) && v === true) p.completedLevels[k] = true;
  }
  if (src.memoryButtonsByLevel && typeof src.memoryButtonsByLevel === "object") {
    for (const [k, v] of Object.entries(src.memoryButtonsByLevel)) {
      if (!validId(k) || !Array.isArray(v)) continue;
      p.memoryButtonsByLevel[k] = [0, 1, 2].map((i) => v[i] === true);
    }
  }
  if (src.bestTimes && typeof src.bestTimes === "object") {
    for (const [k, v] of Object.entries(src.bestTimes)) {
      if (validId(k) && typeof v === "number" && Number.isFinite(v) && v > 1 && v < 36000) p.bestTimes[k] = Math.round(v * 100) / 100;
    }
  }
  const s = src.settings && typeof src.settings === "object" ? src.settings : {};
  p.settings = {
    master: num(s.master, 0, 1, DEFAULT_SETTINGS.master),
    music: num(s.music, 0, 1, DEFAULT_SETTINGS.music),
    sfx: num(s.sfx, 0, 1, DEFAULT_SETTINGS.sfx),
    graphics: oneOf(s.graphics, ["low", "medium", "high"], DEFAULT_SETTINGS.graphics),
    sensitivity: num(s.sensitivity, 0.2, 3, DEFAULT_SETTINGS.sensitivity),
    cameraShake: oneOf(s.cameraShake, ["off", "low", "normal"], DEFAULT_SETTINGS.cameraShake),
    invertY: bool(s.invertY, false),
    reducedMotion: bool(s.reducedMotion, false),
    controlHelp: bool(s.controlHelp, true),
    showTimer: bool(s.showTimer, false),
    assist: bool(s.assist, false),
  };
  const st = src.statistics && typeof src.statistics === "object" ? src.statistics : {};
  for (const k of STAT_KEYS) p.statistics[k] = num(st[k], 0, 1e12, 0);
  if (src.tutorialFlags && typeof src.tutorialFlags === "object") for (const k of TUTORIAL_KEYS) if (src.tutorialFlags[k] === true) p.tutorialFlags[k] = true;
  p.lastLevel = validId(src.lastLevel) ? Number(src.lastLevel) : 1;
  p.seenIntro = bool(src.seenIntro, false);
  p.seenEnding = bool(src.seenEnding, false);
  p.newMemories = Array.isArray(src.newMemories) ? src.newMemories.filter((x) => typeof x === "string").slice(0, 10) : [];
  derive(p);
  const cosIds = COSMETICS.map((c) => c.id);
  p.selectedCosmetic = oneOf(src.selectedCosmetic, cosIds, "classic");
  if (!p.unlockedCosmetics.includes(p.selectedCosmetic)) p.selectedCosmetic = "classic";
  if (!isUnlocked(p, p.lastLevel)) p.lastLevel = 1;
  p.newMemories = p.newMemories.filter((id) => p.unlockedMemories.includes(id));
  return p;
}

/** recompute everything that is derived from completions + buttons (never trusted from disk) */
export function derive(p) {
  let total = 0;
  for (const k of Object.keys(p.memoryButtonsByLevel)) total += p.memoryButtonsByLevel[k].filter(Boolean).length;
  p.totalMemoryButtons = total;
  p.unlockedLevels = [];
  for (let i = 1; i <= LEVEL_COUNT; i++) if (isUnlocked(p, i)) p.unlockedLevels.push(i);
  p.unlockedMemories = unlockedMemories(total);
  p.unlockedCosmetics = COSMETICS.filter((c) => cosmeticUnlocked(p, c)).map((c) => c.id);
  return p;
}

/** older save shapes → current (v0 = an unversioned prototype save) */
function migrate(raw) {
  const v = typeof raw.version === "number" ? raw.version : 0;
  if (v === SAVE_VERSION) return raw;
  const out = { ...raw };
  if (v < 1) {
    if (Array.isArray(raw.completed) && !raw.completedLevels) {
      out.completedLevels = {};
      for (const id of raw.completed) out.completedLevels[id] = true;
    }
    if (raw.buttons && !raw.memoryButtonsByLevel) out.memoryButtonsByLevel = raw.buttons;
    if (raw.stats && !raw.statistics) out.statistics = raw.stats;
    if (raw.cosmetic && !raw.selectedCosmetic) out.selectedCosmetic = raw.cosmetic;
  }
  out.version = SAVE_VERSION;
  return out;
}

export function loadProgress() {
  try {
    const s = window.localStorage.getItem(SAVE_KEY);
    if (!s) return defaultProgress();
    return sanitize(JSON.parse(s));
  } catch {
    return defaultProgress();
  }
}

export function saveProgress(p) {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(p));
    return true;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ derived helpers */
export function isUnlocked(p, id) {
  if (id === 1) return true;
  return !!p.completedLevels[id - 1] || !!p.completedLevels[id];
}
export function buttonsIn(p, id) {
  const b = p.memoryButtonsByLevel[id];
  return b ? b.filter(Boolean).length : 0;
}
export function completedCount(p) {
  return Object.keys(p.completedLevels).length;
}
export function worldDone(p, w) {
  for (let i = (w - 1) * LEVELS_PER_WORLD + 1; i <= w * LEVELS_PER_WORLD; i++) if (!p.completedLevels[i]) return false;
  return true;
}
export function worldsCompleted(p) {
  let n = 0;
  for (let w = 1; w <= 5; w++) if (worldDone(p, w)) n++;
  return n;
}
export function cosmeticUnlocked(p, c) {
  if (!c.need) return true;
  if (c.need.buttons != null) return p.totalMemoryButtons >= c.need.buttons;
  if (c.need.world != null) return worldDone(p, c.need.world);
  return true;
}
export function nextUnlockedLevel(p) {
  for (let i = 1; i <= LEVEL_COUNT; i++) if (!p.completedLevels[i] && isUnlocked(p, i)) return i;
  return LEVEL_COUNT;
}

/**
 * Apply a finished level. Buttons merge with what was already saved (never
 * lost, never duplicated). Returns { progress, newBest, unlocked: [ids],
 * memories: [ids], cosmetics: [names], firstClear }.
 * run = { id, buttons: bool[3], time, falls }
 */
export function applyRun(p, run) {
  const id = String(run.id);
  const prevMem = p.unlockedMemories.slice();
  const prevCos = p.unlockedCosmetics.slice();
  const n = {
    ...p,
    completedLevels: { ...p.completedLevels, [id]: true },
    memoryButtonsByLevel: { ...p.memoryButtonsByLevel },
    bestTimes: { ...p.bestTimes },
    statistics: { ...p.statistics },
  };
  const old = p.memoryButtonsByLevel[id] || [false, false, false];
  n.memoryButtonsByLevel[id] = [0, 1, 2].map((i) => !!old[i] || !!(run.buttons && run.buttons[i]));
  let newBest = false;
  const t = run.time;
  if (typeof t === "number" && Number.isFinite(t) && t > 1) {
    if (!(p.bestTimes[id] > 0) || t < p.bestTimes[id]) {
      newBest = p.bestTimes[id] > 0;
      n.bestTimes[id] = Math.round(t * 100) / 100;
    }
  }
  n.statistics.completions = (n.statistics.completions || 0) + 1;
  const unlocked = [];
  const nid = Number(id) + 1;
  if (!p.completedLevels[id] && nid <= LEVEL_COUNT && !isUnlocked(p, nid)) unlocked.push(nid);
  n.lastLevel = Math.min(LEVEL_COUNT, nid <= LEVEL_COUNT ? nid : LEVEL_COUNT);
  derive(n);
  const memories = n.unlockedMemories.filter((m) => !prevMem.includes(m));
  n.newMemories = [...new Set([...(p.newMemories || []), ...memories])];
  const cosmetics = COSMETICS.filter((c) => n.unlockedCosmetics.includes(c.id) && !prevCos.includes(c.id)).map((c) => c.name);
  return { progress: n, newBest, unlocked, memories, cosmetics, firstClear: !p.completedLevels[id] };
}

/** add one run's movement counters (at the finish AND when a run is abandoned) */
export function addRunStats(p, s) {
  const st = { ...p.statistics };
  for (const k of ["jumps", "falls", "ledgeSaves", "pushes", "bounces", "rides", "petEncounters", "checkpoints", "distance", "interacts", "climbs"]) {
    const v = s[k];
    if (typeof v === "number" && Number.isFinite(v) && v > 0) st[k] += v;
  }
  return { ...p, statistics: st };
}
