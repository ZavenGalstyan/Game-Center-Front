/**
 * RPG progression + save. One JSON blob in localStorage holds the hunter's
 * level/XP, Soul Shards, talents, deck, card collection, battle records, the
 * battle in progress (so Continue resumes mid-fight) and settings.
 */
import { STARTER_DECK, STARTER_UNLOCKS, CARDS, RARITY_PRICE, cardStats } from "./cards.js";
import { BATTLES, BATTLE_BY_ID } from "./battles.js";

export const SAVE_KEY = "deck-of-shadows-save";
export const MAX_LEVEL = 15;
export const DECK_MIN = 8;
export const DECK_MAX = 30;

export const TALENTS = {
  vitality: { name: "Vitality", desc: "+8 maximum HP.", max: 3, cost: 1, req: 1 },
  bulwark: { name: "Bulwark", desc: "Start every battle with 5 Block.", max: 2, cost: 1, req: 2 },
  insight: { name: "Insight", desc: "Draw 1 extra card each turn.", max: 1, cost: 2, req: 4 },
  might: { name: "Hunter's Might", desc: "Start every battle with 1 Strength.", max: 2, cost: 1, req: 5 },
  reserves: { name: "Dark Reserves", desc: "+1 Energy every turn.", max: 1, cost: 2, req: 8 },
};

export const DEFAULT_SETTINGS = { quality: "auto", volume: 0.8, music: 0.6, shake: true, brightness: 1, fast: false };

export function freshProgress() {
  return {
    v: 1,
    level: 1,
    xp: 0,
    sp: 0,
    shards: 0,
    talents: { vitality: 0, bulwark: 0, insight: 0, might: 0, reserves: 0 },
    deck: [...STARTER_DECK],
    collection: [...STARTER_UNLOCKS],
    battles: {},
    unlocked: 1,
    current: null,
    tutorialDone: false,
    settings: { ...DEFAULT_SETTINGS },
  };
}

export function xpForLevel(level) {
  return 60 + 40 * (level - 1);
}

export function profileOf(p) {
  return {
    deck: p.deck,
    maxHp: 60 + (p.level - 1) * 4 + p.talents.vitality * 8,
    energy: 3 + p.talents.reserves,
    drawBonus: p.talents.insight,
    startBlock: p.talents.bulwark * 5,
    startStr: p.talents.might,
  };
}

function valid(p) {
  return p && typeof p === "object" && p.v === 1 && Array.isArray(p.deck) && Array.isArray(p.collection) && p.talents && typeof p.level === "number";
}

export function loadProgress(store) {
  try {
    const raw = store?.getItem(SAVE_KEY);
    if (!raw) return freshProgress();
    const p = JSON.parse(raw);
    if (!valid(p)) return freshProgress();
    const f = freshProgress();
    const out = { ...f, ...p, talents: { ...f.talents, ...p.talents }, settings: { ...f.settings, ...(p.settings || {}) } };
    out.deck = out.deck.filter((r) => cardStats(r));
    out.collection = out.collection.filter((id) => CARDS[id]);
    if (out.deck.length < DECK_MIN) out.deck = [...STARTER_DECK];
    if (out.current && !BATTLE_BY_ID[out.current.battleId]) out.current = null;
    out.unlocked = Math.max(1, Math.min(BATTLES.length, out.unlocked | 0));
    return out;
  } catch {
    return freshProgress();
  }
}

export function saveProgress(p, store) {
  try {
    store?.setItem(SAVE_KEY, JSON.stringify(p));
  } catch {
    /* storage full or blocked — progress stays in memory */
  }
}

/**
 * Apply a won battle. Returns { p, report } where report lists what was
 * gained (for the victory screen).
 */
export function applyVictory(p0, battleId, stars, rng = Math.random) {
  const p = JSON.parse(JSON.stringify(p0));
  const B = BATTLE_BY_ID[battleId];
  const prev = p.battles[battleId];
  const first = !prev;
  const xp = first ? B.xp : Math.round(B.xp * 0.4);
  const shards = (first ? B.shards : Math.round(B.shards * 0.5)) + stars * 5;
  p.battles[battleId] = { stars: Math.max(stars, prev?.stars || 0), wins: (prev?.wins || 0) + 1 };
  p.shards += shards;
  p.xp += xp;
  const levelsGained = [];
  while (p.level < MAX_LEVEL && p.xp >= xpForLevel(p.level)) {
    p.xp -= xpForLevel(p.level);
    p.level += 1;
    p.sp += 1;
    levelsGained.push(p.level);
  }
  if (p.level >= MAX_LEVEL) p.xp = Math.min(p.xp, xpForLevel(MAX_LEVEL));
  let unlocked = null;
  if (first && B.unlock && !p.collection.includes(B.unlock)) {
    p.collection.push(B.unlock);
    if (p.deck.length < DECK_MAX) p.deck.push(B.unlock);
    unlocked = B.unlock;
  }
  if (battleId >= p.unlocked && battleId < BATTLES.length) p.unlocked = battleId + 1;
  p.current = null;
  // three card choices from the collection to add (the player may skip)
  const pool = p.collection.filter((id) => id !== unlocked);
  const choices = [];
  while (choices.length < 3 && pool.length) choices.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  return { p, report: { battleId, first, xp, shards, stars, levelsGained, unlocked, choices, final: !!B.final } };
}

/* ------------------------------------------------------------------ sanctum */
export function upgradeCost(ref) {
  const c = cardStats(ref);
  return c ? Math.round(RARITY_PRICE[c.rarity] * 0.9) + 20 : 0;
}
export const REMOVE_COST = 45;
export const buyCost = (id) => RARITY_PRICE[CARDS[id].rarity];

export function canUpgrade(p, i) {
  const r = p.deck[i];
  if (!r || r.endsWith("+") || !CARDS[r]?.up) return "no";
  if (p.shards < upgradeCost(r)) return "shards";
  return null;
}
export function upgradeCard(p, i) {
  if (canUpgrade(p, i)) return p;
  const q = { ...p, deck: [...p.deck] };
  q.shards -= upgradeCost(p.deck[i]);
  q.deck[i] = `${p.deck[i]}+`;
  return q;
}
export function canRemove(p, i) {
  if (!p.deck[i]) return "no";
  if (p.deck.length <= DECK_MIN) return "min";
  if (p.shards < REMOVE_COST) return "shards";
  return null;
}
export function removeCard(p, i) {
  if (canRemove(p, i)) return p;
  const q = { ...p, deck: [...p.deck] };
  q.deck.splice(i, 1);
  q.shards -= REMOVE_COST;
  return q;
}
export function canBuy(p, id) {
  if (!p.collection.includes(id)) return "locked";
  if (p.deck.length >= DECK_MAX) return "max";
  if (p.shards < buyCost(id)) return "shards";
  return null;
}
export function buyCard(p, id) {
  if (canBuy(p, id)) return p;
  return { ...p, deck: [...p.deck, id], shards: p.shards - buyCost(id) };
}
/** Add a reward card for free (post-battle choice). */
export function takeReward(p, id) {
  if (!id || p.deck.length >= DECK_MAX || !p.collection.includes(id)) return p;
  return { ...p, deck: [...p.deck, id] };
}
export function canTalent(p, k) {
  const T = TALENTS[k];
  if (!T) return "no";
  if (p.talents[k] >= T.max) return "max";
  if (p.level < T.req) return "level";
  if (p.sp < T.cost) return "sp";
  return null;
}
export function buyTalent(p, k) {
  if (canTalent(p, k)) return p;
  return { ...p, sp: p.sp - TALENTS[k].cost, talents: { ...p.talents, [k]: p.talents[k] + 1 } };
}
