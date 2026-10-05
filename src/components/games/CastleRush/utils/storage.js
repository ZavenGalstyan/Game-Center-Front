/**
 * Castle Rush — persistence under ONE key: `castle-rush-progress`.
 *
 *   { version, unlockedBattle, battleStars, unlockedUnits, settings,
 *     statistics, lastBattle }
 *
 * Versioned; every field is sanitised on load, so a corrupted or hand-edited
 * save falls back field by field and never crashes the Game Center. Written
 * only on discrete events (battle finished, settings changed). The Game
 * Center Restart never touches it.
 */
import { BATTLES, unitsForBattle } from "../data/battles.js";
import { UNIT_IDS } from "../data/units.js";

const KEY = "castle-rush-progress";
export const SAVE_VERSION = 1;
const LAST = BATTLES.length;

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
  shadows: true,
  cameraMotion: true,
  damageNumbers: true,
  reducedMotion: false,
  speed: 1,
};

export const STAT_KEYS = [
  "battlesPlayed",
  "battlesWon",
  "battlesLost",
  "unitsDeployed",
  "enemiesDefeated",
  "castlesDestroyed",
  "goldEarned",
  "goldSpent",
  "swordsmen",
  "archers",
  "shields",
  "knights",
  "highestArmy",
  "fastestVictory",
  "perfectVictories",
  "playTime",
];

const TYPE_STAT = { swordsman: "swordsmen", archer: "archers", shield: "shields", knight: "knights" };

export function defaultProgress() {
  return {
    version: SAVE_VERSION,
    unlockedBattle: 1,
    battleStars: {},
    unlockedUnits: unitsForBattle(1),
    settings: { ...DEFAULT_SETTINGS, reducedMotion: prefersReducedMotion() },
    statistics: Object.fromEntries(STAT_KEYS.map((k) => [k, 0])),
    lastBattle: 1,
    tutorialDone: false,
  };
}

const int = (v, d = 0) => (Number.isFinite(v) && v >= 0 ? Math.floor(v) : d);
const bool = (v, d) => (typeof v === "boolean" ? v : d);
const pick = (v, list, d) => (list.includes(v) ? v : d);

export function sanitize(raw) {
  const p = defaultProgress();
  if (!raw || typeof raw !== "object") return p;
  if (raw.battleStars && typeof raw.battleStars === "object") {
    for (const b of BATTLES) {
      const s = Math.min(3, int(raw.battleStars[b.id]));
      if (s >= 1) p.battleStars[b.id] = s;
    }
  }
  // unlocked battle can never be behind what the stars prove was cleared
  let cleared = 0;
  for (const b of BATTLES) if (p.battleStars[b.id]) cleared = Math.max(cleared, b.id);
  p.unlockedBattle = Math.max(1, Math.min(LAST, Math.max(int(raw.unlockedBattle, 1), cleared + 1)));
  p.unlockedUnits = unitsForBattle(p.unlockedBattle);
  const st = raw.statistics && typeof raw.statistics === "object" ? raw.statistics : {};
  for (const k of STAT_KEYS) p.statistics[k] = int(st[k]);
  const s = raw.settings && typeof raw.settings === "object" ? raw.settings : {};
  p.settings = {
    sound: bool(s.sound, true),
    music: bool(s.music, true),
    graphics: pick(s.graphics, ["low", "medium", "high"], "medium"),
    particles: bool(s.particles, true),
    shadows: bool(s.shadows, true),
    cameraMotion: bool(s.cameraMotion, true),
    damageNumbers: bool(s.damageNumbers, true),
    reducedMotion: bool(s.reducedMotion, p.settings.reducedMotion),
    speed: pick(s.speed, [1, 2], 1),
  };
  p.lastBattle = BATTLES.some((b) => b.id === raw.lastBattle) && raw.lastBattle <= p.unlockedBattle ? raw.lastBattle : 1;
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

export const isUnlocked = (p, id) => id >= 1 && id <= p.unlockedBattle && id <= LAST;
export const totalStars = (p) => Object.values(p.battleStars).reduce((a, s) => a + s, 0);
export const kingdomStars = (p, k) => BATTLES.filter((b) => b.kingdom === k).reduce((a, b) => a + (p.battleStars[b.id] || 0), 0);
/** the battle PLAY should start: first unlocked battle without a win, else the last played */
export function nextBattleId(p) {
  for (const b of BATTLES) if (isUnlocked(p, b.id) && !p.battleStars[b.id]) return b.id;
  return p.lastBattle || 1;
}

/** Fold a finished (or abandoned) battle into the save. Pure. */
export function applyResult(prev, summary) {
  const p = JSON.parse(JSON.stringify(prev));
  const r = summary.run;
  const s = p.statistics;
  s.battlesPlayed++;
  s.unitsDeployed += r.deployed;
  s.enemiesDefeated += r.kills;
  s.goldEarned += Math.round(r.goldEarned);
  s.goldSpent += Math.round(r.goldSpent);
  for (const t of UNIT_IDS) s[TYPE_STAT[t]] += r.deployedByType[t] || 0;
  s.highestArmy = Math.max(s.highestArmy, r.maxArmy);
  s.playTime += Math.round(r.time);
  p.lastBattle = summary.battleId;
  let firstClear = false;
  let improved = false;
  let unlockedNew = null;
  if (summary.result === "won") {
    s.battlesWon++;
    s.castlesDestroyed++;
    if (summary.castleHp >= summary.castleMax) s.perfectVictories++;
    const t = Math.max(1, Math.round(r.time));
    s.fastestVictory = s.fastestVictory ? Math.min(s.fastestVictory, t) : t;
    const old = p.battleStars[summary.battleId] || 0;
    firstClear = !old;
    improved = summary.stars > old;
    p.battleStars[summary.battleId] = Math.max(old, summary.stars);
    if (summary.battleId + 1 <= LAST && p.unlockedBattle < summary.battleId + 1) {
      p.unlockedBattle = summary.battleId + 1;
      const before = new Set(p.unlockedUnits);
      p.unlockedUnits = unitsForBattle(p.unlockedBattle);
      unlockedNew = p.unlockedUnits.find((u) => !before.has(u)) || null;
    }
  } else if (summary.result === "lost") s.battlesLost++;
  return { progress: p, firstClear, improved, unlockedNew };
}
