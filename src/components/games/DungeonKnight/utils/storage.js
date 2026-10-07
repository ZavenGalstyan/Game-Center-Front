/**
 * Dungeon Knight — saved progress in localStorage under ONE key,
 * `dungeon-knight-progress` (never touches any other game's keys).
 *
 * Versioned and sanitised field by field: a missing save, corrupt JSON, an
 * old version, missing fields, unknown item ids or negative numbers all fall
 * back to safe defaults — a bad save can never crash the Game Center.
 *
 * Mid-run state is saved only at stable checkpoints (room entry, room clear,
 * chest / shrine use, equipment changes): which dungeon, which step, HP and
 * potions, and whether the current room was already won. Attack animations,
 * enemy AI and positions are never saved — a resumed room restarts from its
 * entry state (or stands cleared, if it was).
 */
import { itemById, STARTER, BAG_SIZE, ALL_ITEMS } from "../data/items.js";
import { DUNGEONS, dungeonById, stepRooms } from "../data/dungeons.js";
import { UPGRADES, upgradeMax, MAX_LEVEL } from "../engine/progression.js";

export const STORAGE_KEY = "dungeon-knight-progress";
export const SAVE_VERSION = 1;

export const DEFAULT_SETTINGS = {
  master: 0.8,
  music: 0.5,
  sfx: 0.9,
  graphics: "medium",
  shadows: "low",
  particles: "normal",
  cameraShake: "normal",
  mouseSensitivity: 1,
  cameraDistance: "normal",
  reducedMotion: false,
  controlHelp: true,
  damageNumbers: true,
  invertY: false,
};

export const STAT_KEYS = [
  "dungeonsEntered", "dungeonsCompleted", "roomsCleared", "enemiesDefeated", "slimesDefeated", "skeletonsDefeated",
  "elitesDefeated", "bossesDefeated", "swordAttacks", "successfulHits", "damageDealt", "damageTaken", "blocks",
  "damageBlocked", "dodges", "potionsUsed", "chestsOpened", "goldCollected", "equipmentFound", "rareItemsFound",
  "epicItemsFound", "deaths", "highestLevel", "playTimeMs",
];

export function defaultProgress() {
  return {
    version: SAVE_VERSION,
    unlockedDungeons: 1,
    completedDungeons: [],
    bossesDefeated: [],
    knightLevel: 1,
    xp: 0,
    gold: 0,
    upgrades: Object.fromEntries(UPGRADES.map((u) => [u.id, 0])),
    inventory: [],
    equipped: { ...STARTER },
    unlockedEquipment: [STARTER.weapon, STARTER.armor, STARTER.shield],
    settings: { ...DEFAULT_SETTINGS },
    statistics: { ...Object.fromEntries(STAT_KEYS.map((k) => [k, 0])), highestLevel: 1 },
    best: {},
    run: null,
    seenIntro: false,
  };
}

const int = (v, d = 0, lo = 0, hi = Number.MAX_SAFE_INTEGER) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.floor(v))) : d);
const num = (v, d, lo, hi) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
const pick = (v, list, d) => (list.includes(v) ? v : d);
const bool = (v, d) => (typeof v === "boolean" ? v : d);

function sanitizeSettings(s) {
  const D = DEFAULT_SETTINGS;
  if (!s || typeof s !== "object") return { ...D };
  return {
    master: num(s.master, D.master, 0, 1),
    music: num(s.music, D.music, 0, 1),
    sfx: num(s.sfx, D.sfx, 0, 1),
    graphics: pick(s.graphics, ["low", "medium", "high"], D.graphics),
    shadows: pick(s.shadows, ["off", "low", "high"], D.shadows),
    particles: pick(s.particles, ["low", "normal"], D.particles),
    cameraShake: pick(s.cameraShake, ["off", "low", "normal"], D.cameraShake),
    mouseSensitivity: num(s.mouseSensitivity, D.mouseSensitivity, 0.3, 2.5),
    cameraDistance: pick(s.cameraDistance, ["near", "normal", "far"], D.cameraDistance),
    reducedMotion: bool(s.reducedMotion, D.reducedMotion),
    controlHelp: bool(s.controlHelp, D.controlHelp),
    damageNumbers: bool(s.damageNumbers, D.damageNumbers),
    invertY: bool(s.invertY, D.invertY),
  };
}

function sanitizeRun(r, p) {
  if (!r || typeof r !== "object") return null;
  const d = dungeonById(r.dungeonId);
  if (!d || r.dungeonId > p.unlockedDungeons) return null;
  if (!Number.isInteger(r.step) || r.step < 0 || r.step >= d.steps.length) return null;
  const step = r.step;
  const rooms = stepRooms(d, step);
  return {
    dungeonId: d.id,
    step,
    choice: int(r.choice, 0, 0, rooms.length - 1),
    hp: int(r.hp, 1, 1, 100000),
    potions: int(r.potions, 0, 0, 9),
    seed: int(r.seed, 1, 1, 2 ** 31),
    cleared: bool(r.cleared, false),
    chestOpened: bool(r.chestOpened, false),
    shrineUsed: bool(r.shrineUsed, false),
    time: num(r.time, 0, 0, 1e7),
    roomsCleared: int(r.roomsCleared, 0, 0, 99),
    enemies: int(r.enemies, 0, 0, 9999),
    gold: int(r.gold, 0, 0, 1e9),
    xp: int(r.xp, 0, 0, 1e9),
    deaths: int(r.deaths, 0, 0, 9999),
    items: Array.isArray(r.items) ? r.items.filter((id) => itemById(id)).slice(0, 30) : [],
  };
}

export function sanitizeProgress(raw) {
  const D = defaultProgress();
  if (!raw || typeof raw !== "object") return D;
  const p = { ...D };
  p.unlockedDungeons = int(raw.unlockedDungeons, 1, 1, DUNGEONS.length);
  p.completedDungeons = Array.isArray(raw.completedDungeons) ? [...new Set(raw.completedDungeons.filter((id) => dungeonById(id)))] : [];
  p.bossesDefeated = Array.isArray(raw.bossesDefeated) ? [...new Set(raw.bossesDefeated.filter((x) => typeof x === "string" && DUNGEONS.some((d) => d.boss === x)))] : [];
  // a completed dungeon always unlocks the next one
  for (const id of p.completedDungeons) p.unlockedDungeons = Math.max(p.unlockedDungeons, Math.min(DUNGEONS.length, id + 1));
  p.knightLevel = int(raw.knightLevel, 1, 1, MAX_LEVEL);
  p.xp = int(raw.xp, 0, 0, 1e9);
  p.gold = int(raw.gold, 0, 0, 1e9);
  p.upgrades = { ...D.upgrades };
  if (raw.upgrades && typeof raw.upgrades === "object") for (const u of UPGRADES) p.upgrades[u.id] = int(raw.upgrades[u.id], 0, 0, upgradeMax(u));
  // equipment: every id must exist and sit in the right slot
  const eq = raw.equipped && typeof raw.equipped === "object" ? raw.equipped : {};
  p.equipped = {};
  for (const slot of ["weapon", "armor", "shield"]) {
    const it = itemById(eq[slot]);
    p.equipped[slot] = it && it.slot === slot ? it.id : STARTER[slot];
  }
  const equippedIds = new Set(Object.values(p.equipped));
  p.inventory = Array.isArray(raw.inventory) ? [...new Set(raw.inventory.filter((id) => itemById(id) && !equippedIds.has(id)))].slice(0, BAG_SIZE) : [];
  // starter gear is never lost: if it isn't equipped it stays in the bag (when there's room)
  for (const slot of ["weapon", "armor", "shield"]) {
    const sid = STARTER[slot];
    if (!equippedIds.has(sid) && !p.inventory.includes(sid) && p.inventory.length < BAG_SIZE) p.inventory.push(sid);
  }
  const seen = Array.isArray(raw.unlockedEquipment) ? raw.unlockedEquipment.filter((id) => itemById(id)) : [];
  p.unlockedEquipment = [...new Set([...seen, ...equippedIds, ...p.inventory])];
  p.settings = sanitizeSettings(raw.settings);
  p.statistics = { ...D.statistics };
  if (raw.statistics && typeof raw.statistics === "object") for (const k of STAT_KEYS) p.statistics[k] = int(raw.statistics[k], 0, 0, 1e12);
  p.statistics.highestLevel = Math.max(p.knightLevel, p.statistics.highestLevel, 1);
  p.best = {};
  if (raw.best && typeof raw.best === "object") {
    for (const d of DUNGEONS) {
      const b = raw.best[d.id];
      if (b && typeof b === "object" && b.time > 0) p.best[d.id] = { time: num(b.time, 0, 0, 1e7), deaths: int(b.deaths, 0, 0, 9999), level: int(b.level, 1, 1, MAX_LEVEL) };
    }
  }
  p.run = sanitizeRun(raw.run, p);
  p.seenIntro = bool(raw.seenIntro, false);
  return p;
}

/** Older versions migrate forward here (v1 is the first). */
function migrate(raw) {
  if (!raw || typeof raw !== "object") return null;
  const v = Number(raw.version) || 0;
  if (v > SAVE_VERSION) return raw; // newer save: sanitise what we understand
  return raw;
}

export function loadProgress() {
  try {
    const s = window.localStorage.getItem(STORAGE_KEY);
    if (!s) return defaultProgress();
    return sanitizeProgress(migrate(JSON.parse(s)));
  } catch {
    return defaultProgress();
  }
}

export function saveProgress(p) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...p, version: SAVE_VERSION }));
    return true;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ helpers */
export const bump = (p, key, by = 1) => ({ ...p, statistics: { ...p.statistics, [key]: (p.statistics[key] || 0) + by } });
export function bumpMany(p, obj) {
  const s = { ...p.statistics };
  for (const k in obj) s[k] = (s[k] || 0) + obj[k];
  return { ...p, statistics: s };
}

/** Put a found item somewhere safe. Returns { progress, placed: "bag" | "full" | "dupe" }. */
export function addItem(p, id) {
  const it = itemById(id);
  if (!it) return { progress: p, placed: "dupe" };
  const owned = Object.values(p.equipped).includes(id) || p.inventory.includes(id);
  if (owned) return { progress: p, placed: "dupe" };
  if (p.inventory.length >= BAG_SIZE) return { progress: p, placed: "full" };
  return {
    progress: { ...p, inventory: [...p.inventory, id], unlockedEquipment: [...new Set([...p.unlockedEquipment, id])] },
    placed: "bag",
  };
}

/** Equip an item that is in the bag (the old one goes back to the bag). */
export function equipItem(p, id) {
  const it = itemById(id);
  if (!it || !p.inventory.includes(id)) return p;
  const old = p.equipped[it.slot];
  const inv = p.inventory.filter((x) => x !== id);
  if (old && itemById(old)) inv.push(old);
  return { ...p, equipped: { ...p.equipped, [it.slot]: id }, inventory: inv.slice(0, BAG_SIZE + 1) };
}

/** Discard a bag item (never an equipped one; starter gear can't be thrown away). */
export function discardItem(p, id) {
  if (!p.inventory.includes(id)) return p;
  if (Object.values(STARTER).includes(id)) return p;
  return { ...p, inventory: p.inventory.filter((x) => x !== id) };
}

export const allItemIds = () => ALL_ITEMS.map((i) => i.id);
