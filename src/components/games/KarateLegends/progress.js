/**
 * Karate Legends save data (localStorage key karate-legends-progress).
 * Pure helpers — every mutation returns a new object so React state and the
 * Node tests share one implementation.
 */
import { BATTLES, UPGRADES, UPGRADE_MAX, UPGRADE_COSTS } from "./data.js";

export const STORAGE_KEY = "karate-legends-progress";
const LAST = BATTLES.length;

export function freshProgress() {
  return { v: 1, cleared: [], coins: 0, upgrades: { hp: 0, atk: 0, energy: 0 }, champion: false };
}

/** Coerce anything (corrupt JSON, old shapes, tampering) into a valid save. */
export function sanitize(raw) {
  const p = freshProgress();
  if (!raw || typeof raw !== "object") return p;
  const ids = Array.isArray(raw.cleared) ? raw.cleared : [];
  const set = new Set(ids.map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= LAST));
  // keep only a contiguous prefix: battles unlock strictly in order
  for (let id = 1; id <= LAST && set.has(id); id++) p.cleared.push(id);
  p.coins = Math.max(0, Math.floor(Number(raw.coins) || 0));
  for (const u of UPGRADES) {
    const lv = Math.floor(Number(raw.upgrades?.[u.id]) || 0);
    p.upgrades[u.id] = Math.min(UPGRADE_MAX, Math.max(0, lv));
  }
  p.champion = p.cleared.length === LAST;
  return p;
}

export function loadProgress() {
  try {
    const txt = window.localStorage.getItem(STORAGE_KEY);
    return sanitize(txt ? JSON.parse(txt) : null);
  } catch {
    return freshProgress();
  }
}

export function saveProgress(p) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch {
    /* storage full or blocked — progress stays in memory */
  }
}

/** Highest playable battle id. */
export const unlockedUpTo = (p) => Math.min(LAST, p.cleared.length + 1);
export const isUnlocked = (p, id) => id >= 1 && id <= unlockedUpTo(p);
export const isCleared = (p, id) => p.cleared.includes(id);

/**
 * Apply a finished battle. Returns { progress, coins, firstClear, champion }.
 * First clear pays the full reward, a replay 30%, a defeat 10%.
 */
export function applyResult(p, battleId, won) {
  const b = BATTLES.find((x) => x.id === battleId);
  if (!b || !isUnlocked(p, battleId)) return { progress: p, coins: 0, firstClear: false, champion: false };
  const firstClear = won && !isCleared(p, battleId);
  const coins = won ? (firstClear ? b.reward : Math.round(b.reward * 0.3)) : Math.round(b.reward * 0.1);
  const cleared = firstClear ? [...p.cleared, battleId] : p.cleared;
  const champion = cleared.length === LAST;
  return {
    progress: { ...p, cleared, coins: p.coins + coins, champion },
    coins,
    firstClear,
    champion: firstClear && champion,
  };
}

export const upgradeCost = (p, id) => (p.upgrades[id] >= UPGRADE_MAX ? null : UPGRADE_COSTS[p.upgrades[id]]);

export function buyUpgrade(p, id) {
  const cost = upgradeCost(p, id);
  if (cost == null || p.coins < cost) return p;
  return { ...p, coins: p.coins - cost, upgrades: { ...p.upgrades, [id]: p.upgrades[id] + 1 } };
}
