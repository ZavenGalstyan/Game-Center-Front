/**
 * Jump Ball — persistence under ONE namespaced, versioned key:
 * `jump-ball-progress`. Nothing else in localStorage is touched.
 *
 * Loading sanitises field by field: a missing / corrupt field falls back to
 * its default without wiping the rest. Saves happen on discrete events only
 * (attempt end, skin / setting change) — never per frame. Restart never
 * touches this.
 */
import { SKINS } from "../data/skins.js";
import { LEVELS } from "../data/levels.js";

const KEY = "jump-ball-progress";
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
  graphics: "medium",
  particles: true,
  cameraMotion: true,
  controlHelp: true,
  reducedMotion: false,
};

const STAT_KEYS = ["bounces", "perfects", "bestStreak", "falls", "moving", "springs", "breaks", "endlessRuns", "bestEndless", "playMs", "attempts"];

export function defaultProgress() {
  return {
    version: SAVE_VERSION,
    levels: {}, // id → { stars, bestTime }
    selectedSkin: "classic",
    stats: Object.fromEntries(STAT_KEYS.map((k) => [k, 0])),
    settings: { ...DEFAULT_SETTINGS, reducedMotion: prefersReducedMotion() },
  };
}

const int = (v, d = 0) => (Number.isFinite(v) && v >= 0 ? Math.floor(v) : d);
const num = (v, d = 0) => (Number.isFinite(v) && v >= 0 ? v : d);
const bool = (v, d) => (typeof v === "boolean" ? v : d);

export function sanitize(raw) {
  const p = defaultProgress();
  if (!raw || typeof raw !== "object") return p;
  if (raw.levels && typeof raw.levels === "object") {
    for (const L of LEVELS) {
      const r = raw.levels[L.id];
      if (!r || typeof r !== "object") continue;
      p.levels[L.id] = { stars: Math.min(3, int(r.stars)), bestTime: num(r.bestTime, 0) };
    }
  }
  const st = raw.stats && typeof raw.stats === "object" ? raw.stats : {};
  for (const k of STAT_KEYS) p.stats[k] = int(st[k]);
  const s = raw.settings && typeof raw.settings === "object" ? raw.settings : {};
  p.settings = {
    sound: bool(s.sound, p.settings.sound),
    music: bool(s.music, p.settings.music),
    graphics: ["low", "medium", "high"].includes(s.graphics) ? s.graphics : p.settings.graphics,
    particles: bool(s.particles, p.settings.particles),
    cameraMotion: bool(s.cameraMotion, p.settings.cameraMotion),
    controlHelp: bool(s.controlHelp, p.settings.controlHelp),
    reducedMotion: bool(s.reducedMotion, p.settings.reducedMotion),
  };
  p.selectedSkin = unlockedSkins(p).includes(raw.selectedSkin) ? raw.selectedSkin : "classic";
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
    window.localStorage.setItem(KEY, JSON.stringify({ ...p, version: SAVE_VERSION }));
  } catch {
    /* storage full / blocked — progress simply isn't persisted */
  }
}

/* ------------------------------------------------------------ derived */

export const levelsDone = (p) => LEVELS.filter((L) => p.levels[L.id]).length;
export const totalStars = (p) => LEVELS.reduce((a, L) => a + (p.levels[L.id]?.stars || 0), 0);

/** Level N is playable once N-1 is complete (level 1 always). */
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

export function skinUnlocked(p, skin) {
  const u = skin.unlock;
  if (!u) return true;
  if (u.kind === "levels") return levelsDone(p) >= u.n;
  if (u.kind === "stars") return totalStars(p) >= u.n;
  if (u.kind === "endless") return p.stats.bestEndless >= u.n;
  if (u.kind === "perfect") return p.stats.bestStreak >= u.n;
  return false;
}

export const unlockedSkins = (p) => SKINS.filter((s) => skinUnlocked(p, s)).map((s) => s.id);

/**
 * Fold one finished / failed / abandoned attempt into progress.
 * r = engine.result(). Returns { progress, firstClear, newSkins, record }.
 * Idempotency is the caller's job (each attempt is applied once).
 */
export function applyAttempt(prev, r) {
  const before = new Set(unlockedSkins(prev));
  const p = { ...prev, levels: { ...prev.levels }, stats: { ...prev.stats } };
  const s = p.stats;
  s.attempts += 1;
  s.bounces += r.bounces;
  s.perfects += r.perfects;
  s.bestStreak = Math.max(s.bestStreak, r.bestStreak);
  s.moving += r.moving;
  s.springs += r.springs;
  s.breaks += r.breaks;
  s.playMs += Math.max(0, r.playMs);
  if (r.cause) s.falls += 1;
  let firstClear = false;
  let record = null;
  if (r.mode === "endless") {
    s.endlessRuns += 1;
    s.bestEndless = Math.max(s.bestEndless, r.height);
  } else if (r.finished && r.levelId != null) {
    const old = p.levels[r.levelId];
    firstClear = !old;
    const stars = Math.min(3, r.stars);
    const bestTime = old?.bestTime ? Math.min(old.bestTime, r.time) : r.time;
    record = { stars: Math.max(old?.stars || 0, stars), bestTime: Math.round(bestTime * 100) / 100 };
    p.levels[r.levelId] = record;
  }
  const newSkins = unlockedSkins(p).filter((id) => !before.has(id));
  return { progress: p, firstClear, newSkins, record };
}
