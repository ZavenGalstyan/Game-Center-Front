/**
 * Supermarket Rush — save system. Everything lives under one localStorage
 * key; restarting the browser (or the GamePlayer Restart button, which only
 * remounts the current shift) never touches unlocked levels, stars, money,
 * upgrades, settings or lifetime statistics.
 */
import { TOTAL_LEVELS } from "../data/levels.js";
import { UPGRADES, upgradeCost, getUpgrade } from "../data/upgrades.js";

const KEY = "supermarket-rush-progress";
const VERSION = 1;

function defaultState() {
  return {
    version: VERSION,
    unlockedLevel: 1,
    money: 0,
    stars: {}, // { [levelId]: 0-3 }
    bestTimeSec: {}, // { [levelId]: seconds }
    upgrades: Object.fromEntries(UPGRADES.map((u) => [u.id, 0])),
    settings: {
      graphics: "medium", // low | medium | high
      shadows: true,
      music: 0.6,
      sfx: 0.85,
      sensitivity: 1,
      reducedMotion: false,
    },
    stats: {
      shiftsCompleted: 0,
      productsRestocked: 0,
      customersServed: 0,
      itemsScanned: 0,
      cartsCollected: 0,
      moneyEarned: 0,
      bestShiftTimeSec: null,
    },
  };
}

export function loadState() {
  if (typeof window === "undefined") return defaultState();
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== VERSION) return { ...defaultState(), ...parsed, version: VERSION };
    const base = defaultState();
    return {
      ...base,
      ...parsed,
      settings: { ...base.settings, ...(parsed.settings || {}) },
      stats: { ...base.stats, ...(parsed.stats || {}) },
      upgrades: { ...base.upgrades, ...(parsed.upgrades || {}) },
    };
  } catch {
    return defaultState();
  }
}

export function saveState(state) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* storage unavailable — play on without persistence */
  }
}

/** Current effective value of an upgrade (1 if never bought — a no-op multiplier). */
export function upgradeValue(state, id) {
  const upgrade = getUpgrade(id);
  if (!upgrade) return 1;
  const level = state.upgrades[id] || 0;
  return upgrade.effect(level);
}

export function buyUpgrade(state, id) {
  const upgrade = getUpgrade(id);
  if (!upgrade) return state;
  const level = state.upgrades[id] || 0;
  const cost = upgradeCost(upgrade, level);
  if (cost == null || state.money < cost) return state;
  return {
    ...state,
    money: state.money - cost,
    upgrades: { ...state.upgrades, [id]: level + 1 },
  };
}

export function updateSettings(state, patch) {
  return { ...state, settings: { ...state.settings, ...patch } };
}

/**
 * Folds a finished shift's results into progress: money, unlock, best
 * stars/time, and lifetime statistics.
 */
export function applyShiftResult(state, result) {
  const prevStars = state.stars[result.levelId] || 0;
  const stars = Math.max(prevStars, result.stars);
  const prevBest = state.bestTimeSec[result.levelId];
  const bestTime = prevBest == null ? result.timeSec : Math.min(prevBest, result.timeSec);
  const unlockedLevel = Math.max(state.unlockedLevel, Math.min(TOTAL_LEVELS, result.levelId + 1));

  return {
    ...state,
    money: state.money + result.totalPay,
    unlockedLevel,
    stars: { ...state.stars, [result.levelId]: stars },
    bestTimeSec: { ...state.bestTimeSec, [result.levelId]: bestTime },
    stats: {
      ...state.stats,
      shiftsCompleted: state.stats.shiftsCompleted + 1,
      productsRestocked: state.stats.productsRestocked + result.productsRestocked,
      customersServed: state.stats.customersServed + result.customersServed,
      itemsScanned: state.stats.itemsScanned + result.itemsScanned,
      cartsCollected: state.stats.cartsCollected + result.cartsCollected,
      moneyEarned: state.stats.moneyEarned + result.totalPay,
      bestShiftTimeSec:
        state.stats.bestShiftTimeSec == null ? result.timeSec : Math.min(state.stats.bestShiftTimeSec, result.timeSec),
    },
  };
}
