/**
 * Throw Masters — saved progress (localStorage `throw-masters-progress`):
 * coins, unlocked fighters, selected fighter, owned / equipped weapon skins,
 * tournament progress, best Target Challenge score and settings.
 */
import { CHAR_BY_ID, SKIN_BY_ID, STARTER_CHARS, TOURNAMENT } from "./data.js";

export const SAVE_KEY = "throw-masters-progress";

export function defaultProgress() {
  return {
    v: 1,
    coins: 0,
    unlocked: [...STARTER_CHARS],
    selected: STARTER_CHARS[0],
    skins: ["classic"],
    skin: "classic",
    tournament: 0, // number of battles cleared (next playable index)
    bestTarget: 0,
    wins: 0,
    tutorialDone: false,
    settings: { aim: "pull", preview: true, shake: true },
  };
}

/** Validate anything read from storage so a broken save can't crash the game. */
export function sanitize(raw) {
  const d = defaultProgress();
  if (!raw || typeof raw !== "object") return d;
  const p = { ...d };
  p.coins = Number.isFinite(raw.coins) ? Math.max(0, Math.floor(raw.coins)) : 0;
  p.unlocked = Array.isArray(raw.unlocked) ? [...new Set([...STARTER_CHARS, ...raw.unlocked.filter((id) => CHAR_BY_ID[id])])] : d.unlocked;
  p.selected = p.unlocked.includes(raw.selected) ? raw.selected : p.unlocked[0];
  p.skins = Array.isArray(raw.skins) ? [...new Set(["classic", ...raw.skins.filter((id) => SKIN_BY_ID[id])])] : d.skins;
  p.skin = p.skins.includes(raw.skin) ? raw.skin : "classic";
  p.tournament = Number.isFinite(raw.tournament) ? Math.max(0, Math.min(TOURNAMENT.length, Math.floor(raw.tournament))) : 0;
  p.bestTarget = Number.isFinite(raw.bestTarget) ? Math.max(0, raw.bestTarget) : 0;
  p.wins = Number.isFinite(raw.wins) ? Math.max(0, raw.wins) : 0;
  p.tutorialDone = !!raw.tutorialDone;
  const s = raw.settings || {};
  p.settings = {
    aim: s.aim === "point" ? "point" : "pull",
    preview: s.preview !== false,
    shake: s.shake !== false,
  };
  return p;
}

export function loadProgress() {
  try {
    const s = localStorage.getItem(SAVE_KEY);
    return sanitize(s ? JSON.parse(s) : null);
  } catch {
    return defaultProgress();
  }
}

export function saveProgress(p) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(p));
  } catch {
    /* storage unavailable — progress lasts for this session only */
  }
}
