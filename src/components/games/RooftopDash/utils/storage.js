/**
 * Rooftop Dash — versioned localStorage save (`rooftop-dash-progress`).
 *
 * Every load goes through `sanitize`, so a missing, corrupt, partial or
 * older save always becomes a valid one (unknown keys dropped, numbers
 * clamped, NaN / negative times discarded). Nothing here ever throws.
 *
 * Progression: Level 1 is open; each level unlocks the next. A district's
 * first level therefore opens when the previous district's last level is
 * cleared. Cosmetics unlock from the total star count (no currency).
 */
import { OUTFITS } from "../three/runner.js";
import { TRAILS } from "../three/effects.js";

export const SAVE_KEY = "rooftop-dash-progress";
export const SAVE_VERSION = 1;
export const LEVEL_COUNT = 50;

export const DEFAULT_SETTINGS = {
  master: 0.85,
  music: 0.55,
  sfx: 0.9,
  graphics: "medium",
  cameraShake: "low",
  sensitivity: 1,
  invertY: false,
  fov: 72,
  motion: true,
  reducedMotion: false,
  controlHelp: true,
  assist: false,
};

const STAT_KEYS = ["runs", "completions", "falls", "jumps", "vaults", "slides", "wallRuns", "wallJumps", "dashes", "checkpoints", "ledges", "distance", "playTime", "longestFlow", "perfectLevels"];
export const TUTORIAL_KEYS = ["move", "jump", "vault", "slide", "sprint", "wallrun", "walljump", "dash"];

export function defaultProgress() {
  const stats = {};
  for (const k of STAT_KEYS) stats[k] = 0;
  return {
    version: SAVE_VERSION,
    completed: {},
    stars: {},
    best: {},
    target: {},
    perfect: {},
    cosmetics: { outfit: "street", trail: "wind" },
    unlockedCosmetics: { outfits: ["street"], trails: ["wind"] },
    settings: { ...DEFAULT_SETTINGS },
    stats,
    fastest: null,
    tutorial: {},
    lastLevel: 1,
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
  const d = defaultProgress();
  if (!raw || typeof raw !== "object") return d;
  const p = d;
  const src = migrate(raw);
  if (src.completed && typeof src.completed === "object") for (const [k, v] of Object.entries(src.completed)) if (validId(k) && v === true) p.completed[k] = true;
  if (src.stars && typeof src.stars === "object") {
    for (const [k, v] of Object.entries(src.stars)) {
      if (!validId(k) || !Array.isArray(v)) continue;
      p.stars[k] = [0, 1, 2].map((i) => v[i] === true);
    }
  }
  if (src.best && typeof src.best === "object") {
    for (const [k, v] of Object.entries(src.best)) {
      if (!validId(k)) continue;
      if (typeof v === "number" && Number.isFinite(v) && v > 0.5 && v < 36000) p.best[k] = Math.round(v * 1000) / 1000;
    }
  }
  for (const key of ["target", "perfect"]) {
    if (src[key] && typeof src[key] === "object") for (const [k, v] of Object.entries(src[key])) if (validId(k) && v === true) p[key][k] = true;
  }
  const outfitIds = OUTFITS.map((o) => o.id);
  const trailIds = TRAILS.map((t) => t.id);
  if (src.cosmetics && typeof src.cosmetics === "object") {
    p.cosmetics.outfit = oneOf(src.cosmetics.outfit, outfitIds, "street");
    p.cosmetics.trail = oneOf(src.cosmetics.trail, trailIds, "wind");
  }
  const s = src.settings && typeof src.settings === "object" ? src.settings : {};
  p.settings = {
    master: num(s.master, 0, 1, DEFAULT_SETTINGS.master),
    music: num(s.music, 0, 1, DEFAULT_SETTINGS.music),
    sfx: num(s.sfx, 0, 1, DEFAULT_SETTINGS.sfx),
    graphics: oneOf(s.graphics, ["low", "medium", "high"], DEFAULT_SETTINGS.graphics),
    cameraShake: oneOf(s.cameraShake, ["off", "low", "normal"], DEFAULT_SETTINGS.cameraShake),
    sensitivity: num(s.sensitivity, 0.2, 3, DEFAULT_SETTINGS.sensitivity),
    invertY: bool(s.invertY, false),
    fov: num(s.fov, 62, 86, DEFAULT_SETTINGS.fov),
    motion: bool(s.motion, true),
    reducedMotion: bool(s.reducedMotion, false),
    controlHelp: bool(s.controlHelp, true),
    assist: bool(s.assist, false),
  };
  const st = src.stats && typeof src.stats === "object" ? src.stats : {};
  for (const k of STAT_KEYS) p.stats[k] = num(st[k], 0, 1e12, 0);
  if (src.fastest && typeof src.fastest === "object" && validId(src.fastest.id) && typeof src.fastest.time === "number" && Number.isFinite(src.fastest.time) && src.fastest.time > 0.5) {
    p.fastest = { id: Number(src.fastest.id), time: src.fastest.time };
  }
  if (src.tutorial && typeof src.tutorial === "object") for (const k of TUTORIAL_KEYS) if (src.tutorial[k] === true) p.tutorial[k] = true;
  p.lastLevel = validId(src.lastLevel) ? Number(src.lastLevel) : 1;
  // a level can't be "completed" without its predecessor chain being reachable; keep as saved,
  // but never let lastLevel point at a locked level
  if (!isUnlocked(p, p.lastLevel)) p.lastLevel = 1;
  p.unlockedCosmetics = unlockedCosmetics(p);
  if (!p.unlockedCosmetics.outfits.includes(p.cosmetics.outfit)) p.cosmetics.outfit = "street";
  if (!p.unlockedCosmetics.trails.includes(p.cosmetics.trail)) p.cosmetics.trail = "wind";
  return p;
}

/** older save shapes → current (v0 = an unversioned prototype save) */
function migrate(raw) {
  const v = typeof raw.version === "number" ? raw.version : 0;
  if (v === SAVE_VERSION) return raw;
  const out = { ...raw };
  if (v < 1) {
    // v0 kept best times under "bestTimes" and stars as counts
    if (raw.bestTimes && !raw.best) out.best = raw.bestTimes;
    if (raw.starsByLevel && !raw.stars) {
      out.stars = {};
      for (const [k, n] of Object.entries(raw.starsByLevel)) out.stars[k] = [n > 0, n > 1, n > 2];
    }
    if (Array.isArray(raw.completedLevels) && !raw.completed) {
      out.completed = {};
      for (const id of raw.completedLevels) out.completed[id] = true;
    }
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

/* ------------------------------------------------------------------ derived */
export function isUnlocked(p, id) {
  if (id === 1) return true;
  return !!p.completed[id - 1] || !!p.completed[id];
}
export function starCount(p, id) {
  const s = p.stars[id];
  return s ? s.filter(Boolean).length : 0;
}
export function totalStars(p) {
  let n = 0;
  for (const k of Object.keys(p.stars)) n += starCount(p, k);
  return n;
}
export function completedCount(p) {
  return Object.keys(p.completed).length;
}
export function unlockedCosmetics(p) {
  const s = totalStars(p);
  return { outfits: OUTFITS.filter((o) => s >= o.stars).map((o) => o.id), trails: TRAILS.filter((t) => s >= t.stars).map((t) => t.id) };
}
export function nextUnlockedLevel(p) {
  for (let i = 1; i <= LEVEL_COUNT; i++) if (!p.completed[i] && isUnlocked(p, i)) return i;
  return LEVEL_COUNT;
}

/**
 * Apply a finished run. Returns { progress, newBest, unlocked: [ids], cosmetics: [names] }.
 * `run` = { id, time, stars: bool[3], falls, target, flowBest, stats }
 */
export function applyRun(p, run) {
  const id = String(run.id);
  const prevCos = unlockedCosmetics(p);
  const n = {
    ...p,
    completed: { ...p.completed, [id]: true },
    stars: { ...p.stars },
    best: { ...p.best },
    target: { ...p.target },
    perfect: { ...p.perfect },
    stats: { ...p.stats },
  };
  const old = p.stars[id] || [false, false, false];
  n.stars[id] = [0, 1, 2].map((i) => !!old[i] || !!run.stars[i]);
  const t = run.time;
  let newBest = false;
  if (typeof t === "number" && Number.isFinite(t) && t > 0.5) {
    if (!(p.best[id] > 0) || t < p.best[id]) {
      n.best[id] = Math.round(t * 1000) / 1000;
      newBest = p.best[id] > 0; // improved on an existing best (first clear just sets it)
    }
    if (!n.fastest || t < n.fastest.time) n.fastest = { id: Number(id), time: t };
  }
  if (run.targetBeaten) n.target[id] = true;
  const perfectNow = run.stars.every(Boolean) && run.targetBeaten && run.falls === 0;
  if (perfectNow && !p.perfect[id]) {
    n.perfect[id] = true;
    n.stats.perfectLevels = (n.stats.perfectLevels || 0) + 1;
  }
  n.stats.completions += 1;
  n.stats.longestFlow = Math.max(n.stats.longestFlow, run.flowBest || 0);
  const unlocked = [];
  if (!p.completed[id] && Number(id) < LEVEL_COUNT && !isUnlocked(p, Number(id) + 1)) unlocked.push(Number(id) + 1);
  n.lastLevel = Math.min(LEVEL_COUNT, Number(id) + (Number(id) < LEVEL_COUNT ? 1 : 0));
  n.unlockedCosmetics = unlockedCosmetics(n);
  const cos = [];
  for (const o of OUTFITS) if (n.unlockedCosmetics.outfits.includes(o.id) && !prevCos.outfits.includes(o.id)) cos.push(o.name);
  for (const tr of TRAILS) if (n.unlockedCosmetics.trails.includes(tr.id) && !prevCos.trails.includes(tr.id)) cos.push(tr.name);
  return { progress: n, newBest, unlocked, cosmetics: cos };
}

/** add one run's movement counters (called at finish AND when a run is abandoned) */
export function addRunStats(p, s) {
  const st = { ...p.stats };
  st.falls += s.falls || 0;
  st.jumps += s.jumps || 0;
  st.vaults += s.vaults || 0;
  st.slides += s.slides || 0;
  st.wallRuns += s.wallRuns || 0;
  st.wallJumps += s.wallJumps || 0;
  st.dashes += s.dashes || 0;
  st.checkpoints += s.checkpoints || 0;
  st.ledges += s.ledges || 0;
  st.distance += s.distance || 0;
  return { ...p, stats: st };
}
