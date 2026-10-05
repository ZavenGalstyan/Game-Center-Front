/**
 * Tower Defense Mini — persistence under ONE key: `tower-defense-mini-progress`.
 * Versioned; every field is sanitised on load, so a corrupted or hand-edited
 * save falls back field by field and never crashes the Game Center. Written
 * only on discrete events (level finished, settings changed). The Game Center
 * Restart never touches it.
 */
import { LEVELS } from "../data/levels.js";
import { TOWER_IDS } from "../data/towers.js";

const KEY = "tower-defense-mini-progress";
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
  reducedMotion: false,
  damageNumbers: true,
  speed: 1,
};

export const STAT_KEYS = [
  "levelsCompleted",
  "enemiesDefeated",
  "towersBuilt",
  "towerUpgrades",
  "coinsEarned",
  "coinsSpent",
  "wavesSurvived",
  "bossesDefeated",
  "perfectLevels",
  "playMs",
  "victories",
  "defeats",
];

export function defaultProgress() {
  return {
    version: SAVE_VERSION,
    levels: {}, // id → { stars, bestLives, wins }
    settings: { ...DEFAULT_SETTINGS, reducedMotion: prefersReducedMotion() },
    stats: Object.fromEntries(STAT_KEYS.map((k) => [k, 0])),
    towerUse: Object.fromEntries(TOWER_IDS.map((k) => [k, 0])),
    lastPlayed: 1,
  };
}

const int = (v, d = 0) => (Number.isFinite(v) && v >= 0 ? Math.floor(v) : d);
const bool = (v, d) => (typeof v === "boolean" ? v : d);
const pick = (v, list, d) => (list.includes(v) ? v : d);

export function sanitize(raw) {
  const p = defaultProgress();
  if (!raw || typeof raw !== "object") return p;
  if (raw.levels && typeof raw.levels === "object") {
    for (const L of LEVELS) {
      const r = raw.levels[L.id];
      if (!r || typeof r !== "object") continue;
      const stars = Math.min(3, int(r.stars));
      if (stars < 1) continue;
      p.levels[L.id] = { stars, bestLives: Math.min(L.lives, int(r.bestLives)), wins: Math.max(1, int(r.wins, 1)) };
    }
  }
  const st = raw.stats && typeof raw.stats === "object" ? raw.stats : {};
  for (const k of STAT_KEYS) p.stats[k] = int(st[k]);
  const tu = raw.towerUse && typeof raw.towerUse === "object" ? raw.towerUse : {};
  for (const k of TOWER_IDS) p.towerUse[k] = int(tu[k]);
  const s = raw.settings && typeof raw.settings === "object" ? raw.settings : {};
  p.settings = {
    sound: bool(s.sound, true),
    music: bool(s.music, true),
    graphics: pick(s.graphics, ["low", "medium", "high"], "medium"),
    particles: bool(s.particles, true),
    cameraMotion: bool(s.cameraMotion, true),
    reducedMotion: bool(s.reducedMotion, p.settings.reducedMotion),
    damageNumbers: bool(s.damageNumbers, true),
    speed: pick(s.speed, [1, 2], 1),
  };
  p.lastPlayed = LEVELS.some((l) => l.id === raw.lastPlayed) ? raw.lastPlayed : 1;
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
    window.localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* storage full / blocked — the game keeps working without saving */
  }
}

export const isCleared = (p, id) => !!p.levels[id];
export function isUnlocked(p, id) {
  const L = LEVELS.find((l) => l.id === id);
  if (!L) return false;
  const req = L.unlock === undefined ? id - 1 : L.unlock;
  return !req || isCleared(p, req);
}
export const totalStars = (p) => Object.values(p.levels).reduce((a, l) => a + l.stars, 0);
export function nextLevelId(p) {
  for (const L of LEVELS) if (isUnlocked(p, L.id) && !isCleared(p, L.id)) return L.id;
  return p.lastPlayed || 1;
}
export function favoriteTower(p) {
  let best = null;
  let n = 0;
  for (const k of TOWER_IDS)
    if (p.towerUse[k] > n) {
      n = p.towerUse[k];
      best = k;
    }
  return best;
}

/** Fold a finished (or abandoned) battle into the save. Pure. */
export function applyRun(prev, summary) {
  const p = JSON.parse(JSON.stringify(prev));
  const r = summary.run;
  const s = p.stats;
  s.enemiesDefeated += r.kills;
  s.towersBuilt += r.towersBuilt;
  s.towerUpgrades += r.upgrades;
  s.coinsEarned += r.coinsEarned;
  s.coinsSpent += r.coinsSpent;
  s.wavesSurvived += r.wavesCleared;
  s.bossesDefeated += r.bosses;
  s.playMs += Math.round(r.playMs);
  for (const k of TOWER_IDS) p.towerUse[k] += r.towerUse[k] || 0;
  p.lastPlayed = summary.levelId;
  let firstClear = false;
  let improved = false;
  if (summary.result === "won") {
    s.victories++;
    const old = p.levels[summary.levelId];
    if (!old) {
      firstClear = true;
      s.levelsCompleted++;
    }
    if (summary.lives === summary.maxLives && (!old || old.bestLives < summary.maxLives)) s.perfectLevels++;
    improved = !old || summary.stars > old.stars;
    p.levels[summary.levelId] = {
      stars: Math.max(old ? old.stars : 0, summary.stars),
      bestLives: Math.max(old ? old.bestLives : 0, summary.lives),
      wins: (old ? old.wins : 0) + 1,
    };
  } else if (summary.result === "lost") s.defeats++;
  return { progress: p, firstClear, improved };
}
