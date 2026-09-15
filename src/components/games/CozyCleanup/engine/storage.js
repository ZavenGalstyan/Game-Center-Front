/**
 * Cozy Cleanup — localStorage persistence. One namespaced key,
 * `cozy-cleanup-progress`. Every read merges onto the defaults and
 * re-validates every field, so a save from an older build never crashes a
 * newer one. Writes happen only on meaningful events (finishing a room,
 * changing a setting, picking a cosmetic) — never once per cleaning stroke.
 *
 * Nothing here touches the keys used by any other Game Center game.
 */
import { TOTAL_LEVELS, getRoom } from "../data/rooms.js";

const KEY = "cozy-cleanup-progress";

export const DEFAULT_SETTINGS = {
  sound: true,
  music: true,
  graphics: "high", // low | medium | high
  particles: true,
  cleaningAssist: true,
  toolSmoothing: true,
  reducedMotion: false,
};

export const DEFAULT_STATISTICS = {
  roomsCleaned: 0,
  trashCollected: 0,
  dustCleaned: 0,
  floorAreaCleaned: 0,
  windowsCleaned: 0,
  itemsOrganized: 0,
  clothesFolded: 0,
  dishesWashed: 0,
  bedsMade: 0,
  hintsUsed: 0,
  totalPlayTimeSec: 0,
};

const DEFAULT_COSMETICS = {
  vacuum: "cream",
  mop: "classic",
  cloth: "plain",
  unlocked: { vacuum: ["cream"], mop: ["classic"], cloth: ["plain"] },
};

const DEFAULT_STATE = {
  unlockedLevel: 1,
  rooms: {}, // { [id]: { completed, stars, cleanliness, organization, hintsUsed, bestTimeSec } }
  settings: { ...DEFAULT_SETTINGS },
  statistics: { ...DEFAULT_STATISTICS },
  cosmetics: { ...DEFAULT_COSMETICS, unlocked: { vacuum: ["cream"], mop: ["classic"], cloth: ["plain"] } },
  tutorialSeen: false,
};

const GRAPHICS_OPT = ["low", "medium", "high"];

function readJSON() {
  try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch { return null; }
}
function writeJSON(v) {
  try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* storage unavailable */ }
}

export function sanitizeSettings(raw) {
  const s = { ...DEFAULT_SETTINGS, ...(raw || {}) };
  if (!GRAPHICS_OPT.includes(s.graphics)) s.graphics = "high";
  s.sound = Boolean(s.sound);
  s.music = Boolean(s.music);
  s.particles = Boolean(s.particles);
  s.cleaningAssist = Boolean(s.cleaningAssist);
  s.toolSmoothing = Boolean(s.toolSmoothing);
  s.reducedMotion = Boolean(s.reducedMotion);
  return s;
}

function sanitizeStatistics(raw) {
  const s = { ...DEFAULT_STATISTICS, ...(raw || {}) };
  for (const k of Object.keys(DEFAULT_STATISTICS)) {
    const n = Number(s[k]);
    s[k] = Number.isFinite(n) && n >= 0 ? n : 0;
  }
  return s;
}

function sanitizeCosmetics(raw) {
  const c = { ...DEFAULT_COSMETICS, ...(raw || {}) };
  c.unlocked = {
    vacuum: Array.from(new Set(["cream", ...(raw?.unlocked?.vacuum || [])])),
    mop: Array.from(new Set(["classic", ...(raw?.unlocked?.mop || [])])),
    cloth: Array.from(new Set(["plain", ...(raw?.unlocked?.cloth || [])])),
  };
  if (!c.unlocked.vacuum.includes(c.vacuum)) c.vacuum = "cream";
  if (!c.unlocked.mop.includes(c.mop)) c.mop = "classic";
  if (!c.unlocked.cloth.includes(c.cloth)) c.cloth = "plain";
  return c;
}

function sanitizeRooms(raw) {
  const out = {};
  const rooms = raw && typeof raw === "object" ? raw : {};
  for (let id = 1; id <= TOTAL_LEVELS; id++) {
    const r = rooms[id];
    if (!r) continue;
    out[id] = {
      completed: Boolean(r.completed),
      stars: Math.max(0, Math.min(3, Number(r.stars) || 0)),
      cleanliness: Math.max(0, Math.min(100, Number(r.cleanliness) || 0)),
      organization: Math.max(0, Math.min(100, Number(r.organization) || 0)),
      hintsUsed: Math.max(0, Number(r.hintsUsed) || 0),
      bestTimeSec: r.bestTimeSec != null ? Math.max(0, Number(r.bestTimeSec)) : null,
    };
  }
  return out;
}

export function loadState() {
  const raw = readJSON();
  // By request, every level is open in this game from the start — stars,
  // cleanliness and statistics still track and save normally per room, only
  // the sequential-unlock gate is disabled. Scoped to Cozy Cleanup's own
  // storage key; no other game is affected.
  const unlockedLevel = TOTAL_LEVELS;
  return {
    unlockedLevel,
    rooms: sanitizeRooms(raw?.rooms),
    settings: sanitizeSettings(raw?.settings),
    statistics: sanitizeStatistics(raw?.statistics),
    cosmetics: sanitizeCosmetics(raw?.cosmetics),
    tutorialSeen: Boolean(raw?.tutorialSeen),
  };
}

export function saveState(state) {
  writeJSON(state);
}

/**
 * Applies a finished room's run to state: records stars/cleanliness (best
 * kept), unlocks the next room, folds run stats into lifetime statistics.
 * Idempotent-ish per call — callers must invoke this exactly once per
 * completion (Gameplay guards this with a `completedRef`).
 */
export function applyRoomResult(state, run) {
  const prev = state.rooms[run.id];
  const stars = Math.max(prev?.stars || 0, run.stars);
  const rooms = {
    ...state.rooms,
    [run.id]: {
      completed: true,
      stars,
      cleanliness: Math.max(prev?.cleanliness || 0, run.cleanliness),
      organization: Math.max(prev?.organization || 0, run.organization),
      hintsUsed: (prev?.hintsUsed || 0) + run.hintsUsed,
      bestTimeSec: prev?.bestTimeSec != null ? Math.min(prev.bestTimeSec, run.timeSec) : run.timeSec,
    },
  };
  const unlockedLevel = Math.max(state.unlockedLevel, Math.min(TOTAL_LEVELS, run.id + 1));
  const stat = { ...state.statistics };
  stat.roomsCleaned += prev?.completed ? 0 : 1;
  stat.trashCollected += run.trashCollected || 0;
  stat.dustCleaned += run.dustCleaned || 0;
  stat.floorAreaCleaned += run.floorAreaCleaned || 0;
  stat.windowsCleaned += run.windowsCleaned || 0;
  stat.itemsOrganized += run.itemsOrganized || 0;
  stat.clothesFolded += run.clothesFolded || 0;
  stat.dishesWashed += run.dishesWashed || 0;
  stat.bedsMade += run.bedsMade || 0;
  stat.hintsUsed += run.hintsUsed || 0;
  stat.totalPlayTimeSec += run.timeSec || 0;

  const totalStars = Object.values(rooms).reduce((a, r) => a + r.stars, 0);
  let cosmetics = state.cosmetics;
  const grant = (slot, id) => {
    if (!cosmetics.unlocked[slot]?.includes(id)) {
      cosmetics = { ...cosmetics, unlocked: { ...cosmetics.unlocked, [slot]: [...cosmetics.unlocked[slot], id] } };
    }
  };
  if (totalStars >= 3) grant("vacuum", "sage");
  if (totalStars >= 8) grant("vacuum", "pink");
  if (totalStars >= 15) grant("vacuum", "lavender");
  if (stat.roomsCleaned >= 2) grant("mop", "flower");
  if (stat.roomsCleaned >= 5) grant("mop", "modern");
  if (stat.clothesFolded >= 4) grant("cloth", "dots");
  if (stat.itemsOrganized >= 20) grant("cloth", "floral");

  return { ...state, rooms, unlockedLevel, statistics: stat, cosmetics };
}

export function updateSettings(state, next) {
  return { ...state, settings: sanitizeSettings({ ...state.settings, ...next }) };
}

export function setCosmetic(state, slot, id) {
  if (!["vacuum", "mop", "cloth"].includes(slot)) return state;
  if (!state.cosmetics.unlocked[slot]?.includes(id)) return state;
  return { ...state, cosmetics: { ...state.cosmetics, [slot]: id } };
}

export function unlockCosmetic(state, slot, id) {
  if (!["vacuum", "mop", "cloth"].includes(slot)) return state;
  const list = state.cosmetics.unlocked[slot] || [];
  if (list.includes(id)) return state;
  return { ...state, cosmetics: { ...state.cosmetics, unlocked: { ...state.cosmetics.unlocked, [slot]: [...list, id] } } };
}

export function isRoomUnlocked(state, id) {
  return id <= state.unlockedLevel;
}

export function markTutorialSeen(state) {
  if (state.tutorialSeen) return state;
  return { ...state, tutorialSeen: true };
}

export { getRoom };
