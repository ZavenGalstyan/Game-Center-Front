/**
 * Tomb Raiders: Pharaoh's Revenge — local persistence (localStorage, like the other games).
 *   tomb-raiders-progress  { v, unlocked, done: { [id]: { time, kills } }, last, xp, rank, points, up: {…}, relics: [] }
 *   tomb-raiders-settings  { sens, invertY, fov, quality, volume, mute, hints }
 * XP and artifacts are committed as they are earned; each rank-up grants one upgrade point.
 */
import { LEVEL_COUNT } from "./engine/levels.js";
import { UPGRADES, UPGRADE_ORDER, RELICS, xpForRank } from "./engine/constants.js";

export const PROGRESS_KEY = "tomb-raiders-progress";
export const SETTINGS_KEY = "tomb-raiders-settings";

export const DEFAULT_SETTINGS = { sens: 1, invertY: false, fov: 78, quality: "high", volume: 0.8, mute: false, hints: true };

const emptyUp = () => Object.fromEntries(UPGRADE_ORDER.map((k) => [k, 0]));

function read(key) {
  try {
    return JSON.parse(localStorage.getItem(key));
  } catch {
    return null;
  }
}
function write(key, v) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* storage blocked — progress lives for this session only */
  }
}

export function emptyProgress() {
  return { v: 1, unlocked: 1, done: {}, last: 1, xp: 0, rank: 1, points: 0, up: emptyUp(), relics: [] };
}

const int = (v, lo, hi, d) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d;
};

export function loadProgress() {
  const p = read(PROGRESS_KEY);
  if (!p || typeof p !== "object") return emptyProgress();
  const unlocked = int(p.unlocked, 1, LEVEL_COUNT, 1);
  const done = {};
  if (p.done && typeof p.done === "object") {
    for (const [k, v] of Object.entries(p.done)) {
      const id = Number(k);
      if (id >= 1 && id <= LEVEL_COUNT && v && Number.isFinite(v.time)) done[id] = { time: v.time, kills: int(v.kills, 0, 999, 0) };
    }
  }
  const up = {};
  for (const k of UPGRADE_ORDER) up[k] = int(p.up?.[k], 0, UPGRADES[k].max, 0);
  const xp = int(p.xp, 0, 1e7, 0);
  const rank = rankFor(xp).rank;
  let spent = Object.values(up).reduce((a, b) => a + b, 0);
  // a tampered save can't spend more points than its rank earned
  if (spent > rank - 1) {
    for (const k of UPGRADE_ORDER) up[k] = 0;
    spent = 0;
  }
  const points = Math.max(0, rank - 1 - spent);
  const relics = Array.isArray(p.relics) ? [...new Set(p.relics.filter((r) => RELICS[r]))] : [];
  return { v: 1, unlocked, done, last: int(p.last, 1, unlocked, 1), xp, rank, points, up, relics };
}

export function saveProgress(p) {
  write(PROGRESS_KEY, p);
}

/** Rank for a total XP, plus progress inside the current rank. */
export function rankFor(xp) {
  let rank = 1,
    left = xp;
  while (left >= xpForRank(rank)) {
    left -= xpForRank(rank);
    rank++;
  }
  return { rank, into: left, need: xpForRank(rank) };
}

/** Add XP; returns the new progress and how many ranks were gained. */
export function addXp(p, amount) {
  const xp = p.xp + amount;
  const { rank } = rankFor(xp);
  const gained = rank - p.rank;
  const next = { ...p, xp, rank, points: p.points + Math.max(0, gained) };
  saveProgress(next);
  return { progress: next, gained };
}

export function addRelic(p, id) {
  if (!RELICS[id] || p.relics.includes(id)) return p;
  const next = { ...p, relics: [...p.relics, id] };
  saveProgress(next);
  return next;
}

export function buyUpgrade(p, key) {
  const cur = p.up[key] || 0;
  if (p.points <= 0 || cur >= UPGRADES[key].max) return p;
  const next = { ...p, points: p.points - 1, up: { ...p.up, [key]: cur + 1 } };
  saveProgress(next);
  return next;
}

export function refundUpgrades(p) {
  const spent = Object.values(p.up).reduce((a, b) => a + b, 0);
  const next = { ...p, points: p.points + spent, up: emptyUp() };
  saveProgress(next);
  return next;
}

/** Record a finished level; returns the new progress and whether it is a new best time. */
export function recordCompletion(p, id, time, kills) {
  const prev = p.done[id];
  const best = !prev || time < prev.time;
  const done = { ...p.done, [id]: best ? { time, kills } : { ...prev, kills: Math.max(prev.kills || 0, kills) } };
  const next = { ...p, done, unlocked: Math.max(p.unlocked, Math.min(LEVEL_COUNT, id + 1)), last: Math.min(LEVEL_COUNT, id + 1) };
  saveProgress(next);
  return { progress: next, best, prev, first: !prev };
}

export function hasProgress(p) {
  return p.unlocked > 1 || Object.keys(p.done).length > 0 || p.xp > 0;
}

export function loadSettings() {
  const s = read(SETTINGS_KEY) || {};
  const num = (v, lo, hi, d) => (Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d);
  return {
    sens: num(s.sens, 0.2, 3, DEFAULT_SETTINGS.sens),
    invertY: !!s.invertY,
    fov: num(s.fov, 60, 100, DEFAULT_SETTINGS.fov),
    quality: s.quality === "low" ? "low" : "high",
    volume: num(s.volume, 0, 1, DEFAULT_SETTINGS.volume),
    mute: !!s.mute,
    hints: s.hints !== false,
  };
}

export function saveSettings(s) {
  write(SETTINGS_KEY, s);
}
