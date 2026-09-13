/**
 * Stonewild — world list + settings persistence.
 *
 * Two namespaced localStorage keys, touching nothing any other Game Center
 * game uses:
 *  - `stonewild-worlds`: small metadata for every saved world (name, seed,
 *    difficulty, timestamps, play time). Cheap, so localStorage is fine here
 *    per the spec ("localStorage only for small settings / metadata").
 *  - `stonewild-settings`: the small settings panel (render distance,
 *    graphics, FOV, sensitivity).
 *
 * The actual per-world voxel data (placed/removed blocks, inventory, chest
 * contents...) is NOT stored yet — that lands in Phase 41 (IndexedDB world
 * persistence) once there is anything to persist beyond generated terrain.
 * Every world with the same seed regenerates identical terrain today, so
 * "losing" unsaved chunk edits isn't possible yet: there are none.
 */

const WORLDS_KEY = "stonewild-worlds";
const SETTINGS_KEY = "stonewild-settings";
const SAVE_VERSION = 1;

export const DIFFICULTIES = ["peaceful", "survival", "hard"];

export const DEFAULT_SETTINGS = {
  renderDistance: "medium", // low | medium | high — see RENDER_DISTANCE in game/constants.js
  graphics: "high", // low | medium | high
  fov: 75,
  sensitivity: 1, // multiplier
  showTutorial: true,
};

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
    /* storage unavailable (private mode / quota) — play continues, just unsaved */
  }
}

export function sanitizeSettings(raw) {
  const s = { ...DEFAULT_SETTINGS, ...(raw || {}) };
  if (!["low", "medium", "high"].includes(s.renderDistance)) s.renderDistance = "medium";
  if (!["low", "medium", "high"].includes(s.graphics)) s.graphics = "high";
  s.fov = Number.isFinite(s.fov) ? Math.min(100, Math.max(60, s.fov)) : 75;
  s.sensitivity = Number.isFinite(s.sensitivity) ? Math.min(3, Math.max(0.2, s.sensitivity)) : 1;
  s.showTutorial = Boolean(s.showTutorial);
  return s;
}

export function loadSettings() {
  return sanitizeSettings(readJSON(SETTINGS_KEY));
}
export function saveSettings(settings) {
  writeJSON(SETTINGS_KEY, sanitizeSettings(settings));
}

function makeId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `world-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function sanitizeWorld(raw) {
  if (!raw || typeof raw !== "object") return null;
  if (typeof raw.id !== "string" || !raw.id) return null;
  return {
    id: raw.id,
    name: typeof raw.name === "string" && raw.name.trim() ? raw.name.trim().slice(0, 40) : "New World",
    seed: typeof raw.seed === "string" ? raw.seed : String(raw.seed ?? ""),
    difficulty: DIFFICULTIES.includes(raw.difficulty) ? raw.difficulty : "survival",
    createdAt: Number.isFinite(raw.createdAt) ? raw.createdAt : Date.now(),
    lastPlayedAt: Number.isFinite(raw.lastPlayedAt) ? raw.lastPlayedAt : raw.createdAt || Date.now(),
    playTimeSec: Number.isFinite(raw.playTimeSec) ? Math.max(0, raw.playTimeSec) : 0,
    version: SAVE_VERSION,
  };
}

export function loadWorlds() {
  const raw = readJSON(WORLDS_KEY);
  if (!Array.isArray(raw)) return [];
  return raw.map(sanitizeWorld).filter(Boolean);
}

function saveWorlds(list) {
  writeJSON(WORLDS_KEY, list);
}

export function createWorld({ name, seed, difficulty }) {
  const worlds = loadWorlds();
  const now = Date.now();
  const world = sanitizeWorld({
    id: makeId(),
    name,
    seed: seed && String(seed).trim() ? String(seed).trim() : String(Math.floor(Math.random() * 1e9)),
    difficulty,
    createdAt: now,
    lastPlayedAt: now,
    playTimeSec: 0,
  });
  worlds.unshift(world);
  saveWorlds(worlds);
  return world;
}

export function deleteWorld(id) {
  saveWorlds(loadWorlds().filter((w) => w.id !== id));
}

export function renameWorld(id, name) {
  const worlds = loadWorlds();
  const world = worlds.find((w) => w.id === id);
  if (!world) return worlds;
  world.name = name.trim().slice(0, 40) || world.name;
  saveWorlds(worlds);
  return worlds;
}

/** Called on leaving gameplay (pause/quit/unmount) — folds session play time in. */
export function touchWorld(id, addPlaySeconds = 0) {
  const worlds = loadWorlds();
  const world = worlds.find((w) => w.id === id);
  if (!world) return worlds;
  world.lastPlayedAt = Date.now();
  world.playTimeSec += Math.max(0, addPlaySeconds);
  saveWorlds(worlds);
  return worlds;
}
