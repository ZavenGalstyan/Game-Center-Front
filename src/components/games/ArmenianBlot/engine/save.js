/**
 * SaveManager + settings + statistics.
 *
 * One versioned localStorage record: { v, settings, stats, match }. The
 * match is the engine's authoritative state (never an animation frame); it
 * is validated on load — a damaged match is dropped rather than repaired, so
 * Continue can never show duplicated or regenerated cards.
 */
import { validateMatch } from "./match.js";
import { PRESET_IDS, VARIANT_OPTIONS } from "./rules.js";

export const SAVE_KEY = "armenian-blot-heritage-save";
export const SAVE_VERSION = 1;

export const THEMES = ["heritage", "emerald", "burgundy", "walnut"];
export const BACKS = ["ornament", "pomegranate", "burgundy", "geometric"];
export const LANGS = ["hy", "en", "ru"];
export const SPEEDS = ["slow", "normal", "fast"];
export const TARGETS = ["quick", "standard", "long"];

export const defaultSettings = () => ({
  lang: "hy",
  difficulty: "medium",
  speed: "normal",
  volume: 0.7,
  ambience: true,
  back: "ornament",
  theme: "heritage",
  target: "standard",
  preset: "armenianClassic",
  variants: {},
  reducedMotion: false,
  hints: true,
});

export const defaultStats = () => ({
  matchesPlayed: 0,
  matchesWon: 0,
  matchesLost: 0,
  handsPlayed: 0,
  tricksWon: 0, // tricks taken by your side
  myTricks: 0, // tricks you won yourself
  contractsWon: 0, // contracts your side bid and made
  contractsFailed: 0,
  highestScore: 0,
  streak: 0,
  bestStreak: 0,
});

const pick = (v, list, d) => (list.includes(v) ? v : d);

export function sanitizeSettings(s) {
  const d = defaultSettings();
  if (!s || typeof s !== "object") return d;
  const variants = {};
  if (s.variants && typeof s.variants === "object") {
    for (const [k, v] of Object.entries(s.variants)) if (VARIANT_OPTIONS[k] && VARIANT_OPTIONS[k].includes(v)) variants[k] = v;
  }
  return {
    lang: pick(s.lang, LANGS, d.lang),
    difficulty: pick(s.difficulty, ["easy", "medium", "hard"], d.difficulty),
    speed: pick(s.speed, SPEEDS, d.speed),
    volume: Number.isFinite(s.volume) ? Math.min(1, Math.max(0, s.volume)) : d.volume,
    ambience: typeof s.ambience === "boolean" ? s.ambience : d.ambience,
    back: pick(s.back, BACKS, d.back),
    theme: pick(s.theme, THEMES, d.theme),
    target: pick(s.target, TARGETS, d.target),
    preset: pick(s.preset, PRESET_IDS, d.preset),
    variants,
    reducedMotion: typeof s.reducedMotion === "boolean" ? s.reducedMotion : d.reducedMotion,
    hints: typeof s.hints === "boolean" ? s.hints : d.hints,
  };
}

export function sanitizeStats(s) {
  const d = defaultStats();
  if (!s || typeof s !== "object") return d;
  const out = {};
  for (const k of Object.keys(d)) out[k] = Number.isFinite(s[k]) && s[k] >= 0 ? Math.floor(s[k]) : d[k];
  return out;
}

export function loadSave(storage) {
  const fresh = { settings: defaultSettings(), stats: defaultStats(), match: null, note: null };
  if (!storage) return fresh;
  try {
    const raw = storage.getItem(SAVE_KEY);
    if (!raw) return fresh;
    const data = JSON.parse(raw);
    if (!data || data.v !== SAVE_VERSION) return { ...fresh, note: "version" };
    const settings = sanitizeSettings(data.settings);
    const stats = sanitizeStats(data.stats);
    let match = data.match || null;
    let note = null;
    if (match) {
      const err = validateMatch(match);
      if (err) { match = null; note = "damaged"; }
    }
    return { settings, stats, match, note };
  } catch {
    return { ...fresh, note: "unreadable" };
  }
}

export function writeSave(storage, { settings, stats, match }) {
  if (!storage) return false;
  try {
    storage.setItem(SAVE_KEY, JSON.stringify({ v: SAVE_VERSION, settings, stats, match: match || null }));
    return true;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------ statistics */

/** Stats after a hand has been scored (`m` is the match right after collect()). */
export function recordHand(stats, m) {
  const h = m.hand;
  const s = { ...stats };
  s.handsPlayed++;
  s.tricksWon += h.won[0];
  s.myTricks += h.tricks.filter((t) => t.winner === 0).length;
  if (h.contract && h.contract.team === 0) {
    if (h.result.made) s.contractsWon++;
    else s.contractsFailed++;
  }
  return s;
}

/** Stats after a match has finished. */
export function recordMatch(stats, m) {
  const s = { ...stats };
  s.matchesPlayed++;
  const won = m.over.winner === 0;
  if (won) {
    s.matchesWon++;
    s.streak++;
    s.bestStreak = Math.max(s.bestStreak, s.streak);
  } else {
    s.matchesLost++;
    s.streak = 0;
  }
  s.highestScore = Math.max(s.highestScore, m.scores[0]);
  return s;
}
