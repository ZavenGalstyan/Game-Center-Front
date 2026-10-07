/**
 * Pirate Cove — durable progress under one versioned localStorage key.
 *
 * Saved: unlocked/completed adventures, best times, gold, ships owned +
 * upgrades + current ship + cosmetics, lifetime statistics, settings.
 * Never saved: anything mid-adventure (ships, cannonballs, foes, checkpoints) —
 * a reload restarts the adventure cleanly.
 *
 * Rewards are granted exactly once per adventure (first completion); replays
 * keep the gold actually collected on the run, never the completion bonus again.
 */
import { TOTAL_ADVENTURES, getAdventure } from "../data/adventures.js";
import { MAX_UPGRADE, upgradeCost, SHIP_UNLOCK } from "../data/ships.js";

export const STORAGE_KEY = "pirate-cove-progress";
const VERSION = 1;

export function defaultSettings() {
  return {
    master: 0.85,
    music: 0.6,
    sfx: 0.9,
    graphics: "medium", // low | medium | high
    shadows: "medium", // off | medium | high
    water: "medium", // low | medium | high
    particles: "medium", // low | medium | high
    sensitivity: 1,
    cameraShake: 1,
    reducedMotion: false,
  };
}

const ZERO_UP = () => ({ hull: 0, speed: 0, cannons: 0 });

function defaultState() {
  return {
    version: VERSION,
    unlocked: 1,
    completed: {},
    bestTime: {},
    gold: 0,
    ship: "sloop",
    ships: { sloop: true, brig: false, galleon: false },
    upgrades: { sloop: ZERO_UP(), brig: ZERO_UP(), galleon: ZERO_UP() },
    look: { sail: "#f3ecdc", accent: "#2f6f8f" },
    lastAdventure: 1,
    settings: defaultSettings(),
    stats: {
      adventures: 0,
      treasures: 0,
      shipsSunk: 0,
      foes: 0,
      goldCollected: 0,
      distance: 0,
      shots: 0,
      hits: 0,
      islands: [],
      playtime: 0,
      bestBattle: null,
    },
  };
}

export function loadState() {
  if (typeof window === "undefined") return defaultState();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const p = JSON.parse(raw);
    const base = defaultState();
    if (!p || typeof p !== "object") return base;
    const up = { ...base.upgrades };
    for (const k of Object.keys(up)) up[k] = { ...ZERO_UP(), ...(p.upgrades?.[k] || {}) };
    for (const k of Object.keys(up)) for (const a of Object.keys(up[k])) up[k][a] = Math.max(0, Math.min(MAX_UPGRADE, Number(up[k][a]) || 0));
    const ships = { ...base.ships, ...(p.ships || {}), sloop: true };
    const state = {
      ...base,
      ...p,
      version: VERSION,
      unlocked: Math.max(1, Math.min(TOTAL_ADVENTURES, Number(p.unlocked) || 1)),
      completed: { ...(p.completed || {}) },
      bestTime: { ...(p.bestTime || {}) },
      gold: Math.max(0, Number(p.gold) || 0),
      ships,
      upgrades: up,
      ship: ships[p.ship] ? p.ship : "sloop",
      look: { ...base.look, ...(p.look || {}) },
      settings: { ...base.settings, ...(p.settings || {}) },
      stats: { ...base.stats, ...(p.stats || {}), islands: Array.isArray(p.stats?.islands) ? p.stats.islands : [] },
    };
    return applyShipUnlocks(state);
  } catch {
    return defaultState();
  }
}

export function saveState(state) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* storage unavailable — play on without persistence */
  }
}

function applyShipUnlocks(state) {
  const ships = { ...state.ships };
  for (const [id, req] of Object.entries(SHIP_UNLOCK)) if (req && state.completed[req.adventure]) ships[id] = true;
  return { ...state, ships };
}

/** Folds an attempt's activity counters into lifetime stats (quit, death-quit or completion). */
export function addRunStats(state, run, { completed = false } = {}) {
  const s = state.stats;
  const islands = Array.from(new Set([...(s.islands || []), ...(run.islands || []).map((i) => `${run.region}:${i}`)]));
  return {
    ...state,
    stats: {
      ...s,
      shots: s.shots + (run.shots || 0),
      hits: s.hits + (run.hits || 0),
      distance: s.distance + (run.distance || 0),
      playtime: s.playtime + (run.playtime || 0),
      islands,
      // outcome counters only count on completion so a quit can't be farmed
      treasures: s.treasures + (completed ? run.treasures || 0 : 0),
      shipsSunk: s.shipsSunk + (completed ? run.shipsSunk || 0 : 0),
      foes: s.foes + (completed ? run.foes || 0 : 0),
      goldCollected: s.goldCollected + (completed ? run.goldCollected || 0 : 0),
      bestBattle: run.bestBattle != null && completed ? (s.bestBattle == null ? run.bestBattle : Math.min(s.bestBattle, run.bestBattle)) : s.bestBattle,
    },
  };
}

/**
 * Banks a completed adventure. Returns { state, reward } — the bonus is paid
 * only on the first completion; run gold is always banked.
 */
export function completeAdventure(state, id, run, timeSec) {
  const A = getAdventure(id);
  const first = !state.completed[id];
  const bonus = first ? A?.reward?.gold || 0 : 0;
  const prevBest = state.bestTime[id];
  let next = {
    ...state,
    unlocked: Math.max(state.unlocked, Math.min(TOTAL_ADVENTURES, id + 1)),
    completed: { ...state.completed, [id]: true },
    bestTime: { ...state.bestTime, [id]: prevBest == null ? timeSec : Math.min(prevBest, timeSec) },
    gold: state.gold + (run.gold || 0) + bonus,
    lastAdventure: Math.min(TOTAL_ADVENTURES, id + 1),
    stats: { ...state.stats, adventures: state.stats.adventures + (first ? 1 : 0) },
  };
  const before = { ...next.ships };
  next = applyShipUnlocks(next);
  const newShips = Object.keys(next.ships).filter((k) => next.ships[k] && !before[k]);
  return { state: next, reward: { bonus, gold: run.gold || 0, first, newShips } };
}

export function buyUpgrade(state, shipId, key) {
  if (!state.ships[shipId]) return state;
  const lvl = state.upgrades[shipId][key];
  const cost = upgradeCost(shipId, lvl);
  if (cost == null || state.gold < cost) return state;
  return {
    ...state,
    gold: state.gold - cost,
    upgrades: { ...state.upgrades, [shipId]: { ...state.upgrades[shipId], [key]: lvl + 1 } },
  };
}

export function selectShip(state, shipId) {
  if (!state.ships[shipId]) return state;
  return { ...state, ship: shipId };
}

export function updateSettings(state, patch) {
  return { ...state, settings: { ...state.settings, ...patch } };
}

export function updateLook(state, patch) {
  return { ...state, look: { ...state.look, ...patch } };
}
