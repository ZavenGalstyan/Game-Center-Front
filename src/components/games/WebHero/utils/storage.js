/**
 * Web Hero — progress persistence (localStorage `web-hero-city-defender-progress`).
 *
 * Shape (v1):
 *   completed   { [missionId]: { score, grade, time, tokens: [bool,bool,bool] } }
 *   xp / xpTotal  spendable / lifetime experience
 *   upgrades    { punch, swing, range, dodge, health, cooldown, air }  (levels)
 *   suit        cosmetic suit id
 *   lastMission last mission played
 *   stats       lifetime counters
 *   settings    audio / camera / graphics / accessibility
 *
 * Everything read back is sanitised: unknown keys dropped, numbers clamped,
 * a corrupted or foreign value falls back to defaults — never a crash.
 */
import { UPGRADES, UPGRADE_IDS, ABILITY_UNLOCK } from "../engine/config.js";
import { MISSION_COUNT } from "../data/missions.js";
import { SUITS } from "../data/suits.js";

export const STORAGE_KEY = "web-hero-city-defender-progress";
const VERSION = 1;

export const DEFAULT_SETTINGS = {
  master: 0.85,
  music: 0.5,
  sfx: 0.9,
  sensitivity: 1,
  invertY: false,
  camDistance: 6,
  camAssist: true,
  graphics: "medium",
  reducedMotion: false,
  showHints: true,
};

const STAT_KEYS = ["defeated", "rescues", "swings", "webs", "perfect", "storms", "tokens", "playTime", "distance", "missions"];

export function defaultProgress() {
  return {
    v: VERSION,
    completed: {},
    xp: 0,
    xpTotal: 0,
    upgrades: Object.fromEntries(UPGRADE_IDS.map((k) => [k, 0])),
    suit: "classic",
    lastMission: 1,
    stats: Object.fromEntries(STAT_KEYS.map((k) => [k, 0])),
    settings: { ...DEFAULT_SETTINGS },
  };
}

const num = (v, lo, hi, d) => (typeof v === "number" && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d);
const bool = (v, d) => (typeof v === "boolean" ? v : d);

function sanitize(raw) {
  const p = defaultProgress();
  if (!raw || typeof raw !== "object") return p;
  if (raw.completed && typeof raw.completed === "object") {
    for (const [k, c] of Object.entries(raw.completed)) {
      const id = Number(k);
      if (!Number.isInteger(id) || id < 1 || id > MISSION_COUNT || !c || typeof c !== "object") continue;
      p.completed[id] = {
        score: Math.round(num(c.score, 0, 1e7, 0)),
        grade: ["S", "A", "B", "C"].includes(c.grade) ? c.grade : "C",
        time: num(c.time, 0, 36000, 0),
        tokens: [0, 1, 2].map((i) => !!(Array.isArray(c.tokens) && c.tokens[i])),
      };
    }
  }
  p.xp = Math.round(num(raw.xp, 0, 1e7, 0));
  p.xpTotal = Math.round(num(raw.xpTotal, 0, 1e8, p.xp));
  if (raw.upgrades && typeof raw.upgrades === "object") for (const k of UPGRADE_IDS) p.upgrades[k] = Math.round(num(raw.upgrades[k], 0, UPGRADES[k].max, 0));
  if (typeof raw.suit === "string" && SUITS.some((s) => s.id === raw.suit)) p.suit = raw.suit;
  p.lastMission = Math.round(num(raw.lastMission, 1, MISSION_COUNT, 1));
  if (raw.stats && typeof raw.stats === "object") for (const k of STAT_KEYS) p.stats[k] = num(raw.stats[k], 0, 1e9, 0);
  const s = raw.settings && typeof raw.settings === "object" ? raw.settings : {};
  p.settings = {
    master: num(s.master, 0, 1, DEFAULT_SETTINGS.master),
    music: num(s.music, 0, 1, DEFAULT_SETTINGS.music),
    sfx: num(s.sfx, 0, 1, DEFAULT_SETTINGS.sfx),
    sensitivity: num(s.sensitivity, 0.3, 2.5, DEFAULT_SETTINGS.sensitivity),
    invertY: bool(s.invertY, false),
    camDistance: num(s.camDistance, 4.5, 9, DEFAULT_SETTINGS.camDistance),
    camAssist: bool(s.camAssist, true),
    graphics: ["low", "medium", "high"].includes(s.graphics) ? s.graphics : DEFAULT_SETTINGS.graphics,
    reducedMotion: bool(s.reducedMotion, false),
    showHints: bool(s.showHints, true),
  };
  // a suit the token count no longer covers falls back
  if (tokenCount(p) < (SUITS.find((x) => x.id === p.suit) || SUITS[0]).need) p.suit = "classic";
  return p;
}

export function loadProgress() {
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    if (!s) return defaultProgress();
    return sanitize(JSON.parse(s));
  } catch {
    return defaultProgress();
  }
}

export function saveProgress(p) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
    return true;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ queries */
export const isCompleted = (p, id) => !!p.completed[id];
export const isUnlocked = (p, id) => id === 1 || !!p.completed[id - 1];
export function tokenCount(p) {
  let n = 0;
  for (const c of Object.values(p.completed)) n += c.tokens.filter(Boolean).length;
  return n;
}
export function completedCount(p) {
  return Object.keys(p.completed).length;
}
export function nextMission(p) {
  for (let id = 1; id <= MISSION_COUNT; id++) if (!p.completed[id]) return id;
  return MISSION_COUNT;
}
/** web abilities available on a mission (unlocked by finishing the one before the unlock mission) */
export function abilitiesFor(p, missionId) {
  const out = {};
  for (const [k, need] of Object.entries(ABILITY_UNLOCK)) out[k] = missionId >= need || !!p.completed[need - 1];
  return out;
}

/* ------------------------------------------------------------------ writes */
/** commit a finished mission; returns { progress, newBest, unlocked: [ids], xpGained } */
export function applyRun(p, { id, score, grade, time, tokens, xp }) {
  const prev = p.completed[id];
  const firstClear = !prev;
  const merged = {
    score: Math.max(score, prev ? prev.score : 0),
    grade: prev && "SABC".indexOf(prev.grade) < "SABC".indexOf(grade) ? prev.grade : grade,
    time: prev && prev.time > 0 ? Math.min(prev.time, time) : time,
    tokens: [0, 1, 2].map((i) => !!(tokens[i] || (prev && prev.tokens[i]))),
  };
  // XP: full on first clear, a quarter on replays (tokens only count once)
  // (token pickups already pay XP inside the run)
  const gained = Math.round(firstClear ? xp : xp * 0.25);
  const next = {
    ...p,
    completed: { ...p.completed, [id]: merged },
    xp: p.xp + gained,
    xpTotal: p.xpTotal + gained,
    lastMission: Math.min(MISSION_COUNT, firstClear ? id + 1 : id),
  };
  const unlocked = firstClear && id < MISSION_COUNT ? [id + 1] : [];
  return { progress: next, newBest: !prev || score > prev.score, unlocked, xpGained: gained, firstClear };
}

export function addRunStats(p, s) {
  const stats = { ...p.stats };
  for (const k of STAT_KEYS) if (typeof s[k] === "number") stats[k] = (stats[k] || 0) + s[k];
  return { ...p, stats };
}

export function buyUpgrade(p, id) {
  const U = UPGRADES[id];
  const lvl = p.upgrades[id] || 0;
  if (!U || lvl >= U.max) return null;
  const cost = U.cost[lvl];
  if (p.xp < cost) return null;
  return { ...p, xp: p.xp - cost, upgrades: { ...p.upgrades, [id]: lvl + 1 } };
}
