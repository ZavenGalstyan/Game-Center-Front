/**
 * localStorage persistence: Arcade progress, win stats and settings. Reads
 * are defensive — a corrupt or missing save falls back to a fresh one. VS
 * mode needs nothing from here beyond the settings.
 */
import { FIGHTER_BY_ID, ROUND_TIMES } from "./data.js";

export const SAVE_KEY = "shadow-arena-save";
export const BATTLE_TOTAL = 30;

export const fresh = () => ({
  v: 1,
  settings: { sound: true, roundTime: 60 },
  arcade: { unlocked: 1, cleared: [], fighter: "flame", completions: 0 },
  stats: { vsMatches: 0, vsP1: 0, vsP2: 0, vsDraws: 0, arcadeWins: 0, arcadeLosses: 0 },
});

const int = (v, lo, hi, dflt) => (Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.floor(v))) : dflt);

export function loadSave(store = globalThis.localStorage) {
  try {
    const raw = store?.getItem(SAVE_KEY);
    if (!raw) return fresh();
    const d = JSON.parse(raw);
    const p = fresh();
    p.settings.sound = d.settings?.sound !== false;
    if (ROUND_TIMES.includes(d.settings?.roundTime)) p.settings.roundTime = d.settings.roundTime;
    p.arcade.unlocked = int(d.arcade?.unlocked, 1, BATTLE_TOTAL, 1);
    if (Array.isArray(d.arcade?.cleared)) p.arcade.cleared = [...new Set(d.arcade.cleared.filter((n) => Number.isInteger(n) && n >= 1 && n <= BATTLE_TOTAL))].sort((a, b) => a - b);
    if (FIGHTER_BY_ID[d.arcade?.fighter]) p.arcade.fighter = d.arcade.fighter;
    p.arcade.completions = int(d.arcade?.completions, 0, 1e6, 0);
    for (const k of Object.keys(p.stats)) p.stats[k] = int(d.stats?.[k], 0, 1e9, 0);
    return p;
  } catch {
    return fresh();
  }
}

export function writeSave(p, store = globalThis.localStorage) {
  try {
    store?.setItem(SAVE_KEY, JSON.stringify(p));
  } catch {
    /* storage full / blocked — progress just isn't kept this session */
  }
}

/** save after an arcade battle `id` ended; `won` true/false */
export function recordArcade(p, id, won) {
  const n = { ...p, arcade: { ...p.arcade }, stats: { ...p.stats } };
  if (won) {
    n.stats.arcadeWins++;
    if (!n.arcade.cleared.includes(id)) n.arcade.cleared = [...n.arcade.cleared, id].sort((a, b) => a - b);
    n.arcade.unlocked = Math.max(n.arcade.unlocked, Math.min(BATTLE_TOTAL, id + 1));
    if (id === BATTLE_TOTAL) n.arcade.completions++;
  } else n.stats.arcadeLosses++;
  return n;
}

/** save after a VS match; winner 0 | 1 | -1 */
export function recordVs(p, winner) {
  const s = { ...p.stats, vsMatches: p.stats.vsMatches + 1 };
  if (winner === 0) s.vsP1++;
  else if (winner === 1) s.vsP2++;
  else s.vsDraws++;
  return { ...p, stats: s };
}
