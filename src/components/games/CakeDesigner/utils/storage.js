/**
 * Cake Designer — localStorage persistence.
 *
 * One namespaced key: `cake-designer-progress`. Every read merges onto the
 * defaults and re-validates each field, so a save from an older build can
 * never crash a newer one. Nothing here touches the keys used by Classic
 * Chess, Fishing Journey, Mini Golf Journey, Delivery Rush or Parking Master.
 *
 * Writes happen only on meaningful events: finishing an order, changing a
 * setting, buying a shop item, leaving the editor. Never inside a frame or a
 * pointer-move handler.
 *
 * COIN REPLAY RULE (documented):
 *   - First time an order is completed  -> full payout for the stars earned.
 *   - Replaying and beating your best star count -> you're paid the DIFFERENCE
 *     between the new payout and the old one.
 *   - Replaying with the same or fewer stars -> no additional campaign coins.
 *   Best stars and best score are never downgraded.
 */

import { TOTAL_LEVELS } from "../data/collections.js";
import { coinsFor } from "./scoring.js";

const KEY = "cake-designer-progress";

export const DEFAULT_SETTINGS = {
  graphics: "high", // low | medium | high
  sound: true,
  music: true,
  animations: true,
};

export const DEFAULT_STATE = {
  unlockedLevel: 1,
  currentLevel: 1,
  coins: 0,
  levels: {}, // { [id]: { completed, stars, bestScore } }
  purchased: [], // coin-shop catalogue keys
  freeDesign: null, // last Free Design draft (cake config)
  freeDesignPrefs: { background: "studio" },
  settings: { ...DEFAULT_SETTINGS },
  statistics: {
    ordersCompleted: 0,
    stars: 0,
    coinsEarned: 0,
    perfectOrders: 0,
    cakesCreated: 0,
    freeDesignCakes: 0,
    decorationsPlaced: 0,
    bestScore: 0,
  },
};

const GRAPHICS = ["low", "medium", "high"];

function readJSON() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "null");
  } catch {
    return null;
  }
}
function writeJSON(v) {
  try {
    localStorage.setItem(KEY, JSON.stringify(v));
  } catch {
    /* storage unavailable — session just won't persist */
  }
}

export function sanitizeSettings(raw) {
  const s = { ...DEFAULT_SETTINGS, ...(raw || {}) };
  if (!GRAPHICS.includes(s.graphics)) s.graphics = "high";
  s.sound = Boolean(s.sound);
  s.music = Boolean(s.music);
  s.animations = Boolean(s.animations);
  return s;
}

export function loadState() {
  const raw = readJSON() || {};
  const state = {
    ...DEFAULT_STATE,
    ...raw,
    settings: sanitizeSettings(raw.settings),
    statistics: { ...DEFAULT_STATE.statistics, ...(raw.statistics || {}) },
    freeDesignPrefs: { ...DEFAULT_STATE.freeDesignPrefs, ...(raw.freeDesignPrefs || {}) },
  };

  let unlocked = Number.isInteger(raw.unlockedLevel) ? raw.unlockedLevel : 1;
  state.unlockedLevel = Math.min(TOTAL_LEVELS, Math.max(1, unlocked));
  state.currentLevel = Math.min(
    TOTAL_LEVELS,
    Math.max(1, Number.isInteger(raw.currentLevel) ? raw.currentLevel : 1),
  );

  state.coins = Number.isFinite(raw.coins) ? Math.max(0, Math.floor(raw.coins)) : 0;
  state.purchased = Array.isArray(raw.purchased) ? raw.purchased.filter((x) => typeof x === "string") : [];

  state.levels = {};
  if (raw.levels && typeof raw.levels === "object") {
    for (const [k, l] of Object.entries(raw.levels)) {
      const id = Number(k);
      if (!Number.isInteger(id) || id < 1 || id > TOTAL_LEVELS || !l) continue;
      state.levels[id] = {
        completed: Boolean(l.completed),
        stars: [0, 1, 2, 3].includes(l.stars) ? l.stars : 0,
        bestScore: Number.isFinite(l.bestScore) ? Math.max(0, Math.min(100, Math.floor(l.bestScore))) : 0,
      };
    }
  }

  state.freeDesign = raw.freeDesign && typeof raw.freeDesign === "object" ? raw.freeDesign : null;

  for (const key of Object.keys(state.statistics)) {
    const v = state.statistics[key];
    state.statistics[key] = Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0;
  }
  return state;
}

export function saveState(state) {
  writeJSON({
    unlockedLevel: state.unlockedLevel,
    currentLevel: state.currentLevel,
    coins: state.coins,
    levels: state.levels,
    purchased: state.purchased,
    freeDesign: state.freeDesign,
    freeDesignPrefs: state.freeDesignPrefs,
    settings: state.settings,
    statistics: state.statistics,
  });
}

/**
 * Fold a finished campaign order into the persistent state. Pure.
 * `score` is the object returned by scoreCake().
 */
export function applyResult(state, order, score) {
  const id = order.id;
  const prev = state.levels[id] || { completed: false, stars: 0, bestScore: 0 };
  const firstClear = !prev.completed && score.stars >= 1;
  const improvedStars = score.stars > prev.stars;

  let coinsAwarded = 0;
  if (score.stars >= 1) {
    if (!prev.completed) coinsAwarded = coinsFor(order, score.stars);
    else if (improvedStars) coinsAwarded = Math.max(0, coinsFor(order, score.stars) - coinsFor(order, prev.stars));
  }

  const next = {
    ...state,
    levels: { ...state.levels },
    statistics: { ...state.statistics },
  };

  next.levels[id] = {
    completed: prev.completed || score.stars >= 1,
    stars: Math.max(prev.stars, score.stars), // never downgrade
    bestScore: Math.max(prev.bestScore, score.total),
  };

  next.coins = state.coins + coinsAwarded;

  if (firstClear) {
    next.unlockedLevel = Math.min(TOTAL_LEVELS, Math.max(state.unlockedLevel, id + 1));
    next.currentLevel = Math.min(TOTAL_LEVELS, id + 1);
    next.statistics.ordersCompleted += 1;
  }

  // lifetime stats
  next.statistics.stars = Object.values(next.levels).reduce((s, l) => s + (l.stars || 0), 0);
  next.statistics.coinsEarned = state.statistics.coinsEarned + coinsAwarded;
  next.statistics.bestScore = Math.max(state.statistics.bestScore, score.total);
  if (score.perfect && (firstClear || improvedStars)) next.statistics.perfectOrders += 1;
  next.statistics.cakesCreated += 1;
  next.statistics.decorationsPlaced += score._placed || 0;

  return { state: next, coinsAwarded, firstClear, improvedStars };
}

export function buyItem(state, key, price) {
  if ((state.purchased || []).includes(key)) return state;
  if (state.coins < price) return state;
  return {
    ...state,
    coins: state.coins - price,
    purchased: [...(state.purchased || []), key],
  };
}

export function recordFreeDesign(state, cake, placed) {
  return {
    ...state,
    freeDesign: cake,
    statistics: {
      ...state.statistics,
      freeDesignCakes: state.statistics.freeDesignCakes + 1,
      cakesCreated: state.statistics.cakesCreated + 1,
      decorationsPlaced: state.statistics.decorationsPlaced + (placed || 0),
    },
  };
}
