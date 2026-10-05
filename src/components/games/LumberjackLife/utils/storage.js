/**
 * Lumberjack Life — persistence under ONE key: `lumberjack-life-progress`.
 *
 * Versioned (SAVE_VERSION). `loadProgress` runs `migrate` on older saves and
 * then sanitises every field independently: a missing or corrupted field
 * falls back to its default without wiping the rest of the career. Only plain
 * data is stored (world snapshots are plain objects from worldSnapshot) —
 * never live engine/Three.js references.
 */
import { REGIONS } from "../data/regions.js";
import { TOOLS, VEHICLES, UPGRADES } from "../data/equipment.js";
import { SPECIES } from "../data/species.js";
import { TUTORIAL_STEPS } from "../engine/career.js";

export const SAVE_KEY = "lumberjack-life-progress";
export const SAVE_VERSION = 2;

const prefersReducedMotion = () => {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
};

export const DEFAULT_SETTINGS = {
  master: 0.85,
  music: 0.5,
  sfx: 0.9,
  graphics: "medium", // low | medium | high
  shadows: true,
  particles: true,
  sensitivity: 1,
  invertY: false,
  cameraShake: true,
  reducedMotion: false,
  controlHelp: true,
};

export const STAT_KEYS = [
  "treesCut", "axeSwings", "chainsawTime", "logsCollected", "logsTransported", "planksProduced", "planksSold",
  "ordersCompleted", "moneyEarned", "distanceWalked", "distanceDriven", "playTime",
];

export function defaultProgress() {
  return {
    version: SAVE_VERSION,
    started: false,
    money: 0,
    level: 1,
    currentRegion: REGIONS[0].id,
    unlockedRegions: [REGIONS[0].id],
    unlockedTools: ["old-axe"],
    selectedTool: "old-axe",
    unlockedVehicles: [],
    selectedVehicle: null,
    sawmillUpgrades: Object.fromEntries(UPGRADES.map((u) => [u.id, 0])),
    completedOrders: [],
    orders: {},
    tutorial: { done: false, skipped: false },
    statistics: { ...Object.fromEntries(STAT_KEYS.map((k) => [k, 0])), toolUse: {}, speciesCut: {} },
    settings: { ...DEFAULT_SETTINGS, reducedMotion: prefersReducedMotion() },
    worlds: {},
  };
}

const num = (v, d, min = -Infinity, max = Infinity) => (Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : d);
const int = (v, d, min = 0, max = 1e12) => (Number.isFinite(v) ? Math.floor(Math.min(max, Math.max(min, v))) : d);
const bool = (v, d) => (typeof v === "boolean" ? v : d);
const pick = (v, list, d) => (list.includes(v) ? v : d);
const ids = (v, valid, d) => (Array.isArray(v) ? [...new Set(v.filter((x) => valid.includes(x)))] : d);

/** older save shapes → current shape (never discards progression) */
export function migrate(raw) {
  const r = { ...raw };
  const v = Number.isFinite(r.version) ? r.version : 1;
  if (v < 2) {
    // v1 stored the tool as `tool` and the tutorial as a step index
    if (typeof r.tool === "string" && !r.selectedTool) r.selectedTool = r.tool;
    if (Number.isFinite(r.tutorialStep)) {
      r.tutorial = {};
      TUTORIAL_STEPS.forEach((s, i) => {
        if (i < r.tutorialStep) r.tutorial[s.id] = true;
      });
      r.tutorial.done = r.tutorialStep >= TUTORIAL_STEPS.length;
    }
    if (r.stats && !r.statistics) r.statistics = r.stats;
  }
  r.version = SAVE_VERSION;
  return r;
}

export function sanitize(input) {
  const d = defaultProgress();
  if (!input || typeof input !== "object") return d;
  const raw = migrate(input);
  const regionIds = REGIONS.map((x) => x.id);
  const toolIds = TOOLS.map((x) => x.id);
  const vehIds = VEHICLES.map((x) => x.id);
  const p = { ...d };
  p.started = bool(raw.started, false);
  p.money = int(raw.money, 0, 0);
  p.level = int(raw.level, 1, 1, 999);
  p.unlockedRegions = ids(raw.unlockedRegions, regionIds, d.unlockedRegions);
  if (!p.unlockedRegions.includes(REGIONS[0].id)) p.unlockedRegions.unshift(REGIONS[0].id);
  p.currentRegion = pick(raw.currentRegion, p.unlockedRegions, REGIONS[0].id);
  p.unlockedTools = ids(raw.unlockedTools, toolIds, d.unlockedTools);
  if (!p.unlockedTools.includes("old-axe")) p.unlockedTools.unshift("old-axe");
  p.selectedTool = pick(raw.selectedTool, p.unlockedTools, "old-axe");
  p.unlockedVehicles = ids(raw.unlockedVehicles, vehIds, []);
  p.selectedVehicle = pick(raw.selectedVehicle, p.unlockedVehicles, p.unlockedVehicles[0] || null);
  p.sawmillUpgrades = Object.fromEntries(UPGRADES.map((u) => [u.id, int(raw.sawmillUpgrades?.[u.id], 0, 0, u.prices.length)]));
  p.completedOrders = Array.isArray(raw.completedOrders) ? [...new Set(raw.completedOrders.filter((x) => typeof x === "string"))] : [];
  p.orders = {};
  if (raw.orders && typeof raw.orders === "object") {
    for (const rid of regionIds) {
      const o = raw.orders[rid];
      if (!o || typeof o !== "object") continue;
      p.orders[rid] = {
        index: int(o.index, 0, 0, 999),
        seq: int(o.seq, 0, 0, 1e6),
        counters: Array.isArray(o.counters) ? o.counters.slice(0, 8).map((c) => int(c, 0, 0, 1e6)) : [],
      };
    }
  }
  const t = raw.tutorial && typeof raw.tutorial === "object" ? raw.tutorial : {};
  p.tutorial = { done: bool(t.done, false), skipped: bool(t.skipped, false) };
  for (const s of TUTORIAL_STEPS) if (t[s.id] === true) p.tutorial[s.id] = true;
  const st = raw.statistics && typeof raw.statistics === "object" ? raw.statistics : {};
  p.statistics = { ...d.statistics };
  for (const k of STAT_KEYS) p.statistics[k] = num(st[k], 0, 0);
  p.statistics.toolUse = {};
  if (st.toolUse && typeof st.toolUse === "object") for (const [k, v] of Object.entries(st.toolUse)) if (toolIds.includes(k)) p.statistics.toolUse[k] = num(v, 0, 0);
  p.statistics.speciesCut = {};
  if (st.speciesCut && typeof st.speciesCut === "object") for (const [k, v] of Object.entries(st.speciesCut)) if (SPECIES[k]) p.statistics.speciesCut[k] = int(v, 0, 0);
  const s = raw.settings && typeof raw.settings === "object" ? raw.settings : {};
  p.settings = {
    master: num(s.master, d.settings.master, 0, 1),
    music: num(s.music, d.settings.music, 0, 1),
    sfx: num(s.sfx, d.settings.sfx, 0, 1),
    graphics: pick(s.graphics, ["low", "medium", "high"], d.settings.graphics),
    shadows: bool(s.shadows, d.settings.shadows),
    particles: bool(s.particles, d.settings.particles),
    sensitivity: num(s.sensitivity, 1, 0.3, 2.5),
    invertY: bool(s.invertY, false),
    cameraShake: bool(s.cameraShake, true),
    reducedMotion: bool(s.reducedMotion, d.settings.reducedMotion),
    controlHelp: bool(s.controlHelp, true),
  };
  p.worlds = {};
  if (raw.worlds && typeof raw.worlds === "object") {
    for (const rid of regionIds) {
      const w = raw.worlds[rid];
      if (w && typeof w === "object" && Array.isArray(w.trees)) p.worlds[rid] = w;
    }
  }
  p.version = SAVE_VERSION;
  return p;
}

export function loadProgress() {
  try {
    const txt = window.localStorage.getItem(SAVE_KEY);
    if (!txt) return defaultProgress();
    return sanitize(JSON.parse(txt));
  } catch {
    return defaultProgress();
  }
}

export function saveProgress(p) {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(p));
    return true;
  } catch {
    return false;
  }
}

/** fresh career, but keep the player's settings */
export function newCareer(prev) {
  const p = defaultProgress();
  if (prev && prev.settings) p.settings = { ...prev.settings };
  p.started = true;
  return p;
}
