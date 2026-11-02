/**
 * Progress persistence (localStorage key `iron-fist-arena-progress`).
 * Pure helpers: every value read back is sanitised, so a hand-edited or
 * corrupted save can't unlock out-of-range battles or crash the menus.
 */
import { BATTLES, starsFor } from "./arcade.js";
import { FIGHTER_BY_ID } from "./fighters.js";

export const SAVE_KEY = "iron-fist-arena-progress";
const ARENAS = ["temple", "rooftop", "underground", "grand"];
const QUALITIES = ["low", "medium", "high"];

export function defaultSave() {
  return { v: 1, unlocked: 1, best: {}, selected: "ryuzen", vs: { p1: "ryuzen", p2: "blaze", arena: "temple" }, quality: "high", champion: false, champions: [] };
}

export function sanitize(raw) {
  const d = defaultSave();
  if (!raw || typeof raw !== "object") return d;
  const out = { ...d };
  const n = Math.floor(Number(raw.unlocked));
  out.unlocked = Number.isFinite(n) ? Math.max(1, Math.min(BATTLES.length, n)) : 1;
  out.best = {};
  if (raw.best && typeof raw.best === "object")
    for (const [k, v] of Object.entries(raw.best)) {
      const id = Number(k);
      if (!BATTLES[id - 1] || !v || typeof v !== "object") continue;
      out.best[id] = {
        stars: Math.max(0, Math.min(3, Math.floor(Number(v.stars) || 0))),
        hp: Math.max(0, Math.min(1, Number(v.hp) || 0)),
        time: Math.max(0, Number(v.time) || 0),
        fighter: FIGHTER_BY_ID[v.fighter] ? v.fighter : null,
      };
    }
  out.selected = FIGHTER_BY_ID[raw.selected] ? raw.selected : d.selected;
  const vs = raw.vs && typeof raw.vs === "object" ? raw.vs : {};
  out.vs = { p1: FIGHTER_BY_ID[vs.p1] ? vs.p1 : d.vs.p1, p2: FIGHTER_BY_ID[vs.p2] ? vs.p2 : d.vs.p2, arena: ARENAS.includes(vs.arena) ? vs.arena : d.vs.arena };
  out.quality = QUALITIES.includes(raw.quality) ? raw.quality : d.quality;
  out.champion = !!raw.champion;
  out.champions = Array.isArray(raw.champions) ? [...new Set(raw.champions.filter((f) => FIGHTER_BY_ID[f]))] : [];
  return out;
}

export function loadSave(store) {
  try {
    const s = store?.getItem(SAVE_KEY);
    if (!s) return { save: defaultSave(), corrupt: false };
    return { save: sanitize(JSON.parse(s)), corrupt: false };
  } catch {
    return { save: defaultSave(), corrupt: true };
  }
}

export function writeSave(save, store) {
  try {
    store?.setItem(SAVE_KEY, JSON.stringify(save));
    return true;
  } catch {
    return false;
  }
}

/**
 * Apply an arcade result. Returns a NEW save. A win unlocks the next battle;
 * best stars / hp / fastest time are kept per battle; winning battle 30 marks
 * the player champion (and records which fighter did it).
 */
export function applyResult(save, battleId, fighter, result, fightTime = 0) {
  const s = sanitize(save);
  if (!result || result.winner !== 0 || !BATTLES[battleId - 1]) return s;
  const stars = starsFor(result);
  const prev = s.best[battleId];
  s.best = {
    ...s.best,
    [battleId]: {
      stars: Math.max(prev?.stars || 0, stars),
      hp: Math.max(prev?.hp || 0, result.hpLeft[0]),
      time: prev?.time ? Math.min(prev.time, fightTime || prev.time) : fightTime,
      fighter: stars >= (prev?.stars || 0) ? fighter : prev?.fighter || fighter,
    },
  };
  s.unlocked = Math.max(s.unlocked, Math.min(BATTLES.length, battleId + 1));
  if (battleId === BATTLES.length) {
    s.champion = true;
    if (!s.champions.includes(fighter)) s.champions = [...s.champions, fighter];
  }
  return s;
}
