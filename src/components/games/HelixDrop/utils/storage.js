/**
 * Helix Drop — persistence under ONE key: `helix-drop-progress`.
 * Field-by-field sanitising; saves only on discrete events; Restart never
 * touches it.
 */
import { SKINS } from "../data/skins.js";
import { LEVELS } from "../data/levels.js";

const KEY = "helix-drop-progress";
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
  sens: "medium",
  graphics: "medium",
  shadows: true,
  particles: true,
  shake: true,
  reducedMotion: false,
  controlHelp: true,
};

const STAT_KEYS = ["drops", "floors", "bounces", "smashes", "destroyed", "bestStreak", "fails", "bestDepth", "endlessRuns", "playMs", "attempts"];

export function defaultProgress() {
  return {
    version: SAVE_VERSION,
    levels: {}, // id → { stars, bestTime, bestStreak }
    selectedBall: "classic",
    stats: Object.fromEntries(STAT_KEYS.map((k) => [k, 0])),
    settings: { ...DEFAULT_SETTINGS, reducedMotion: prefersReducedMotion() },
  };
}

const int = (v, d = 0) => (Number.isFinite(v) && v >= 0 ? Math.floor(v) : d);
const num = (v, d = 0) => (Number.isFinite(v) && v >= 0 ? v : d);
const bool = (v, d) => (typeof v === "boolean" ? v : d);
const pick = (v, list, d) => (list.includes(v) ? v : d);

export function sanitize(raw) {
  const p = defaultProgress();
  if (!raw || typeof raw !== "object") return p;
  if (raw.levels && typeof raw.levels === "object") {
    for (const L of LEVELS) {
      const r = raw.levels[L.id];
      if (!r || typeof r !== "object") continue;
      p.levels[L.id] = { stars: Math.min(3, Math.max(1, int(r.stars, 1))), bestTime: num(r.bestTime), bestStreak: int(r.bestStreak) };
    }
  }
  const st = raw.stats && typeof raw.stats === "object" ? raw.stats : {};
  for (const k of STAT_KEYS) p.stats[k] = int(st[k]);
  const s = raw.settings && typeof raw.settings === "object" ? raw.settings : {};
  p.settings = {
    sound: bool(s.sound, p.settings.sound),
    music: bool(s.music, p.settings.music),
    sens: pick(s.sens, ["low", "medium", "high"], "medium"),
    graphics: pick(s.graphics, ["low", "medium", "high"], "medium"),
    shadows: bool(s.shadows, true),
    particles: bool(s.particles, true),
    shake: bool(s.shake, true),
    reducedMotion: bool(s.reducedMotion, p.settings.reducedMotion),
    controlHelp: bool(s.controlHelp, true),
  };
  p.selectedBall = unlockedSkins(p).includes(raw.selectedBall) ? raw.selectedBall : "classic";
  return p;
}

export function loadProgress() {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? sanitize(JSON.parse(raw)) : defaultProgress();
  } catch {
    return defaultProgress();
  }
}

export function saveProgress(p) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ ...p, version: SAVE_VERSION }));
  } catch {
    /* storage full / blocked */
  }
}

export const levelsDone = (p) => LEVELS.filter((L) => p.levels[L.id]).length;
export const totalStars = (p) => LEVELS.reduce((a, L) => a + (p.levels[L.id]?.stars || 0), 0);
export const perfectLevels = (p) => LEVELS.filter((L) => p.levels[L.id]?.stars === 3).length;

export function isUnlocked(p, id) {
  const i = LEVELS.findIndex((L) => L.id === id);
  if (i <= 0) return i === 0;
  return !!p.levels[LEVELS[i - 1].id];
}

export function highestUnlocked(p) {
  let best = LEVELS[0].id;
  for (const L of LEVELS) if (isUnlocked(p, L.id)) best = L.id;
  return best;
}

export function skinUnlocked(p, s) {
  const u = s.unlock;
  if (!u) return true;
  if (u.kind === "levels") return levelsDone(p) >= u.n;
  if (u.kind === "stars") return totalStars(p) >= u.n;
  if (u.kind === "depth") return p.stats.bestDepth >= u.n;
  if (u.kind === "perfect") return perfectLevels(p) >= u.n;
  return false;
}
export const unlockedSkins = (p) => SKINS.filter((s) => skinUnlocked(p, s)).map((s) => s.id);

/** Stars for a finished level run: ★ finish · ★★ ≤ target time · ★★★ also a Smash-level streak. */
export function starsFor(level, r) {
  if (!r.finished) return 0;
  let s = 1;
  if (r.time <= level.targetTime) s = 2;
  if (s === 2 && r.maxStreak >= level.streakGoal) s = 3;
  return s;
}

/** Fold one attempt (finished / failed / abandoned) into progress, exactly once. */
export function applyAttempt(prev, r, level) {
  const before = new Set(unlockedSkins(prev));
  const p = { ...prev, levels: { ...prev.levels }, stats: { ...prev.stats } };
  const s = p.stats;
  s.attempts += 1;
  s.drops += r.drops;
  s.floors += r.floors;
  s.bounces += r.bounces;
  s.smashes += r.smashes;
  s.destroyed += r.destroyed;
  s.bestStreak = Math.max(s.bestStreak, r.maxStreak);
  s.playMs += Math.max(0, r.playMs);
  if (r.failed) s.fails += 1;
  let record = null;
  let firstClear = false;
  let stars = 0;
  if (r.mode === "endless") {
    s.endlessRuns += 1;
    s.bestDepth = Math.max(s.bestDepth, r.depth);
  } else if (r.finished && level) {
    const old = p.levels[level.id];
    firstClear = !old;
    stars = starsFor(level, r);
    record = {
      stars: Math.max(old?.stars || 0, stars),
      bestTime: old?.bestTime ? Math.min(old.bestTime, Math.round(r.time * 100) / 100) : Math.round(r.time * 100) / 100,
      bestStreak: Math.max(old?.bestStreak || 0, r.maxStreak),
    };
    p.levels[level.id] = record;
  }
  const newSkins = unlockedSkins(p).filter((id) => !before.has(id));
  return { progress: p, record, firstClear, stars, newSkins };
}
