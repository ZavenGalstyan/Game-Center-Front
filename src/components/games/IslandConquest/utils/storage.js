/**
 * Island Conquest — persistence under ONE key: `island-conquest-progress`.
 *
 *   { version, unlockedLevel, levelStars, settings, statistics,
 *     lastPlayedLevel, tutorialDone }
 *
 * Versioned; every field is sanitised on load so a corrupted or hand-edited
 * save falls back field by field and never crashes the Game Center. Written
 * only on discrete events (battle finished, settings changed, level started).
 * The Game Center Restart never touches it.
 */
import { LEVELS } from "../data/levels.js";

const KEY = "island-conquest-progress";
export const SAVE_VERSION = 1;
const LAST = () => LEVELS.length;

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
  water: "medium",
  particles: true,
  shadows: true,
  cameraMotion: true,
  reducedMotion: false,
  speed: 1,
};

export const STAT_KEYS = [
  "levelsPlayed",
  "levelsWon",
  "levelsLost",
  "islandsCaptured",
  "islandsLost",
  "troopsGenerated",
  "troopsSent",
  "troopsLost",
  "enemyDefeated",
  "neutralCaptured",
  "enemyCaptured",
  "reinforcements",
  "largestArmy",
  "fastestVictory",
  "perfectVictories",
  "playTime",
];

export function defaultProgress() {
  return {
    version: SAVE_VERSION,
    unlockedLevel: 1,
    levelStars: {},
    settings: { ...DEFAULT_SETTINGS, reducedMotion: prefersReducedMotion() },
    statistics: Object.fromEntries(STAT_KEYS.map((k) => [k, 0])),
    lastPlayedLevel: 1,
    tutorialDone: false,
  };
}

const int = (v, d = 0) => (Number.isFinite(v) && v >= 0 ? Math.floor(v) : d);
const bool = (v, d) => (typeof v === "boolean" ? v : d);
const pick = (v, list, d) => (list.includes(v) ? v : d);

export function sanitize(raw) {
  const p = defaultProgress();
  if (!raw || typeof raw !== "object") return p;
  if (raw.levelStars && typeof raw.levelStars === "object") {
    for (const l of LEVELS) {
      const s = Math.min(3, int(raw.levelStars[l.id]));
      if (s >= 1) p.levelStars[l.id] = s;
    }
  }
  // the unlocked level can never be behind what the stars prove was cleared
  let cleared = 0;
  for (const l of LEVELS) if (p.levelStars[l.id]) cleared = Math.max(cleared, l.id);
  p.unlockedLevel = Math.max(1, Math.min(LAST(), Math.max(int(raw.unlockedLevel, 1), cleared + 1)));
  const st = raw.statistics && typeof raw.statistics === "object" ? raw.statistics : {};
  for (const k of STAT_KEYS) p.statistics[k] = int(st[k]);
  const s = raw.settings && typeof raw.settings === "object" ? raw.settings : {};
  p.settings = {
    sound: bool(s.sound, true),
    music: bool(s.music, true),
    graphics: pick(s.graphics, ["low", "medium", "high"], "medium"),
    water: pick(s.water, ["low", "medium", "high"], "medium"),
    particles: bool(s.particles, true),
    shadows: bool(s.shadows, true),
    cameraMotion: bool(s.cameraMotion, true),
    reducedMotion: bool(s.reducedMotion, p.settings.reducedMotion),
    speed: pick(s.speed, [1, 2], 1),
  };
  p.lastPlayedLevel = LEVELS.some((l) => l.id === raw.lastPlayedLevel) && raw.lastPlayedLevel <= p.unlockedLevel ? raw.lastPlayedLevel : 1;
  p.tutorialDone = bool(raw.tutorialDone, false);
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

export const isUnlocked = (p, id) => id >= 1 && id <= p.unlockedLevel && id <= LAST();
export const totalStars = (p) => Object.values(p.levelStars).reduce((a, s) => a + s, 0);
export const regionStars = (p, region) => LEVELS.filter((l) => l.region === region).reduce((a, l) => a + (p.levelStars[l.id] || 0), 0);

/** the level PLAY should start: first unlocked level without a win, else the last played */
export function nextLevelId(p) {
  for (const l of LEVELS) if (isUnlocked(p, l.id) && !p.levelStars[l.id]) return l.id;
  return p.lastPlayedLevel || 1;
}

/** Fold a finished (or abandoned) battle into the save. Pure. */
export function applyResult(prev, summary) {
  const p = JSON.parse(JSON.stringify(prev));
  const r = summary.run;
  const s = p.statistics;
  s.levelsPlayed++;
  s.islandsCaptured += r.islandsCaptured;
  s.islandsLost += r.islandsLost;
  s.troopsGenerated += r.troopsGenerated;
  s.troopsSent += r.troopsSent;
  s.troopsLost += r.troopsLost;
  s.enemyDefeated += r.enemyDefeated;
  s.neutralCaptured += r.neutralCaptured;
  s.enemyCaptured += r.enemyCaptured;
  s.reinforcements += r.reinforcements;
  s.largestArmy = Math.max(s.largestArmy, r.largestArmy);
  s.playTime += Math.round(r.time);
  p.lastPlayedLevel = summary.levelId;
  let firstClear = false;
  let improved = false;
  if (summary.result === "won") {
    s.levelsWon++;
    if (r.islandsLost === 0) s.perfectVictories++;
    const t = Math.max(1, Math.round(r.time));
    s.fastestVictory = s.fastestVictory ? Math.min(s.fastestVictory, t) : t;
    const old = p.levelStars[summary.levelId] || 0;
    firstClear = !old;
    improved = summary.stars > old;
    p.levelStars[summary.levelId] = Math.max(old, summary.stars);
    if (summary.levelId + 1 <= LAST() && p.unlockedLevel < summary.levelId + 1) p.unlockedLevel = summary.levelId + 1;
  } else if (summary.result === "lost") s.levelsLost++;
  return { progress: p, firstClear, improved };
}
