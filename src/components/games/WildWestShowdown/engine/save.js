/**
 * Local save (versioned, validated on load; anything unreadable falls back
 * to a fresh career instead of crashing).
 *
 *   progress: { v, unlocked, completed: { [stageId]: { wins, bestHands, place } },
 *               winnings, matchesPlayed, current: Match | null, seenIntro }
 *   settings: { quality, volume, music, ambience, cardAssist, speed, camera }
 *
 * All chips are fictional tournament chips; nothing is bought or sold.
 */
import { STAGE_COUNT, stageById } from "./stages.js";
import { validateMatch } from "./match.js";

export const SAVE_KEY = "wild-west-showdown-save";
export const SETTINGS_KEY = "wild-west-showdown-settings";
export const SAVE_VERSION = 1;

export const DEFAULT_SETTINGS = { quality: "auto", volume: 0.8, music: 0.6, ambience: 0.7, cardAssist: true, speed: "normal", motion: true };
export const QUALITY_IDS = ["auto", "high", "medium", "low"];
export const SPEED_IDS = ["slow", "normal", "fast"];

export const freshProgress = () => ({ v: SAVE_VERSION, unlocked: 1, completed: {}, winnings: 0, matchesPlayed: 0, current: null });

export function sanitizeProgress(raw) {
  const p = freshProgress();
  if (!raw || typeof raw !== "object" || raw.v !== SAVE_VERSION) return p;
  const int = (x, lo, hi, d) => (Number.isInteger(x) && x >= lo && x <= hi ? x : d);
  p.unlocked = int(raw.unlocked, 1, STAGE_COUNT, 1);
  if (raw.completed && typeof raw.completed === "object") {
    for (const [k, v] of Object.entries(raw.completed)) {
      const id = Number(k);
      if (!stageById(id) || !v || typeof v !== "object") continue;
      p.completed[id] = { wins: int(v.wins, 1, 1e6, 1), bestHands: int(v.bestHands, 1, 1e4, null), place: 1 };
    }
  }
  // a completed stage always unlocks the next one
  for (const id of Object.keys(p.completed).map(Number)) p.unlocked = Math.max(p.unlocked, Math.min(STAGE_COUNT, id + 1));
  p.winnings = int(raw.winnings, 0, 1e12, 0);
  p.matchesPlayed = int(raw.matchesPlayed, 0, 1e9, 0);
  if (raw.current && !validateMatch(raw.current) && !raw.current.done && raw.current.stageId <= p.unlocked) p.current = raw.current;
  return p;
}

export function sanitizeSettings(raw) {
  const s = { ...DEFAULT_SETTINGS };
  if (!raw || typeof raw !== "object") return s;
  if (QUALITY_IDS.includes(raw.quality)) s.quality = raw.quality;
  if (SPEED_IDS.includes(raw.speed)) s.speed = raw.speed;
  for (const k of ["volume", "music", "ambience"]) if (Number.isFinite(raw[k])) s[k] = Math.max(0, Math.min(1, raw[k]));
  for (const k of ["cardAssist", "motion"]) if (typeof raw[k] === "boolean") s[k] = raw[k];
  return s;
}

/** Records a finished match; returns the new progress. */
export function recordResult(prog, match) {
  const p = { ...prog, completed: { ...prog.completed }, current: null, matchesPlayed: prog.matchesPlayed + 1 };
  if (match?.result?.won) {
    const id = match.stageId;
    const prev = p.completed[id];
    const hands = match.handsPlayed;
    p.completed[id] = { wins: (prev?.wins || 0) + 1, bestHands: prev?.bestHands ? Math.min(prev.bestHands, hands) : hands, place: 1 };
    p.unlocked = Math.max(p.unlocked, Math.min(STAGE_COUNT, id + 1));
    p.winnings += stageById(id).purse;
  }
  return p;
}

export const completedCount = (p) => Object.keys(p.completed).length;

function store(storage) {
  return storage || (typeof localStorage !== "undefined" ? localStorage : null);
}
export function readJSON(key, storage) {
  try {
    const raw = store(storage)?.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
export function writeJSON(key, value, storage) {
  try {
    const s = store(storage);
    if (!s) return false;
    if (value == null) s.removeItem(key);
    else s.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false; // storage full or blocked: play continues unsaved
  }
}
export const loadProgress = (storage) => sanitizeProgress(readJSON(SAVE_KEY, storage));
export const loadSettings = (storage) => sanitizeSettings(readJSON(SETTINGS_KEY, storage));
