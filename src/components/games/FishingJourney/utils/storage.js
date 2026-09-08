/**
 * Fishing Journey — localStorage persistence.
 *
 * Two keys, both namespaced to this game so nothing here can touch Classic
 * Chess (`gc_chess_settings`) or any other Game Center storage:
 *
 *   gc_fishing_journey    progress   (coins, rods, locations, collection)
 *   gc_fishing_settings   options    (graphics, sound, animations)
 *
 * Every read is defensive: missing / corrupt / partial data falls back to the
 * defaults and is merged, so an old save never crashes a newer build.
 */

import { RODS } from "../data/rods.js";
import { LOCATIONS } from "../data/locations.js";

const PROGRESS_KEY = "gc_fishing_journey";
const SETTINGS_KEY = "gc_fishing_settings";

export const DEFAULT_PROGRESS = {
  coins: 0,
  equippedRod: "wooden",
  ownedRods: ["wooden"],
  currentLocation: "crystal-lake",
  unlockedLocations: ["crystal-lake"],
  caughtFish: {}, // { [fishId]: { count: number, best: number } }
  totalFishCaught: 0,
  bestCatch: null, // { fishId, name, weight, rarity }
};

export const DEFAULT_SETTINGS = {
  graphics: "high", // low | medium | high
  sound: true,
  animations: true,
};

const ROD_IDS = new Set(RODS.map((r) => r.id));
const LOCATION_IDS = new Set(LOCATIONS.map((l) => l.id));

function readJSON(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || "null");
  } catch {
    return null;
  }
}

function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable (private mode / quota) — progress just won't persist */
  }
}

export function loadProgress() {
  const raw = readJSON(PROGRESS_KEY) || {};
  const p = { ...DEFAULT_PROGRESS, ...raw };

  // sanitise collections so a bad save can't break the UI
  p.ownedRods = Array.isArray(raw.ownedRods)
    ? raw.ownedRods.filter((id) => ROD_IDS.has(id))
    : [];
  if (!p.ownedRods.includes("wooden")) p.ownedRods.unshift("wooden");
  if (!ROD_IDS.has(p.equippedRod) || !p.ownedRods.includes(p.equippedRod)) {
    p.equippedRod = "wooden";
  }

  p.unlockedLocations = Array.isArray(raw.unlockedLocations)
    ? raw.unlockedLocations.filter((id) => LOCATION_IDS.has(id))
    : [];
  if (!p.unlockedLocations.includes("crystal-lake")) {
    p.unlockedLocations.unshift("crystal-lake");
  }
  if (
    !LOCATION_IDS.has(p.currentLocation) ||
    !p.unlockedLocations.includes(p.currentLocation)
  ) {
    p.currentLocation = "crystal-lake";
  }

  p.caughtFish =
    raw.caughtFish && typeof raw.caughtFish === "object" ? raw.caughtFish : {};
  p.coins = Number.isFinite(raw.coins) ? Math.max(0, Math.floor(raw.coins)) : 0;
  p.totalFishCaught = Number.isFinite(raw.totalFishCaught)
    ? Math.max(0, Math.floor(raw.totalFishCaught))
    : 0;
  p.bestCatch = raw.bestCatch && typeof raw.bestCatch === "object" ? raw.bestCatch : null;

  return p;
}

export function saveProgress(progress) {
  writeJSON(PROGRESS_KEY, progress);
}

export function loadSettings() {
  const raw = readJSON(SETTINGS_KEY) || {};
  const s = { ...DEFAULT_SETTINGS, ...raw };
  if (!["low", "medium", "high"].includes(s.graphics)) s.graphics = "high";
  s.sound = Boolean(s.sound);
  s.animations = Boolean(s.animations);
  return s;
}

export function saveSettings(settings) {
  writeJSON(SETTINGS_KEY, settings);
}
