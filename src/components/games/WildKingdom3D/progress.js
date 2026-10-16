/**
 * Wild Kingdom 3D — localStorage save. One key holds the selected species,
 * settings, the shared world clock/weather and a separate progression record
 * per animal. Everything is validated field by field on load: a corrupt or
 * hand-edited save falls back to defaults for just the broken parts.
 */
import { SPECIES, SPECIES_ORDER, UPGRADES, MAX_RANK, MAX_LEVEL, TERRITORIES, MISSIONS, xpToNext } from "./data.js";
import { HALF } from "./terrain.js";

export const SAVE_KEY = "wild-kingdom-3d-save";
export const SAVE_VERSION = 1;

export const DEFAULT_SETTINGS = { sens: 1, invertY: false, camDist: 1, quality: "high", hints: true, volume: 0.8 };

const num = (v, d, lo = -Infinity, hi = Infinity) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
const int = (v, d, lo, hi) => Math.round(num(v, d, lo, hi));
const bool = (v, d) => (typeof v === "boolean" ? v : d);
const strIn = (v, list, d) => (list.includes(v) ? v : d);
const idList = (v, valid) => (Array.isArray(v) ? [...new Set(v.filter((x) => valid.has(x)))] : []);

const TERR_IDS = new Set(TERRITORIES.map((t) => t.id));

export function newAnimal(species) {
  const up = {};
  for (const u of UPGRADES) up[u.id] = 0;
  return {
    level: 1,
    xp: 0,
    sp: 0,
    up,
    perks: [],
    pos: null,
    meters: null,
    missions: [],
    stats: { biomesSeen: [], landmarksSeen: [] },
    family: [],
    nest: null,
    found: [],
    owned: [],
    rivalsBeaten: [],
    lastBirth: -10,
    deaths: 0,
    playTime: 0,
    species,
  };
}

export function newSave() {
  const animals = {};
  for (const s of SPECIES_ORDER) animals[s] = newAnimal(s);
  return { v: SAVE_VERSION, selected: null, settings: { ...DEFAULT_SETTINGS }, world: { time: 0.3, day: 1, weather: "clear" }, animals };
}

function validAnimal(a, species) {
  const d = newAnimal(species);
  if (!a || typeof a !== "object") return d;
  const out = d;
  out.level = int(a.level, 1, 1, MAX_LEVEL);
  out.xp = num(a.xp, 0, 0, xpToNext(out.level));
  out.sp = int(a.sp, 0, 0, 200);
  for (const u of UPGRADES) out.up[u.id] = int(a.up?.[u.id], 0, 0, MAX_RANK);
  const perkIds = new Set(SPECIES[species].perks.map((p) => p.id));
  out.perks = idList(a.perks, perkIds).filter((id) => SPECIES[species].perks.find((p) => p.id === id).lvl <= out.level);
  if (a.pos && typeof a.pos === "object") {
    const x = num(a.pos.x, NaN, -HALF + 5, HALF - 5);
    const z = num(a.pos.z, NaN, -HALF + 5, HALF - 5);
    if (Number.isFinite(x) && Number.isFinite(z)) out.pos = { x, y: num(a.pos.y, 0, -10, 500), z, yaw: num(a.pos.yaw, 0, -100, 100) };
  }
  if (a.meters && typeof a.meters === "object") {
    out.meters = {
      hp: num(a.meters.hp, 1, 0.05, 1),
      hunger: num(a.meters.hunger, 80, 0, 100),
      thirst: num(a.meters.thirst, 80, 0, 100),
      stamina: num(a.meters.stamina, 1, 0, 1),
    };
  }
  const missionIds = new Set(MISSIONS[species].map((m) => m.id));
  out.missions = idList(a.missions, missionIds);
  if (a.stats && typeof a.stats === "object") {
    for (const [k, v] of Object.entries(a.stats)) {
      if (k === "biomesSeen" || k === "landmarksSeen") continue;
      if (typeof k === "string" && k.length < 40 && typeof v === "number" && Number.isFinite(v) && v >= 0) out.stats[k] = Math.min(v, 1e9);
    }
    out.stats.biomesSeen = Array.isArray(a.stats.biomesSeen) ? [...new Set(a.stats.biomesSeen.filter((b) => typeof b === "string" && b.length < 20))] : [];
    out.stats.landmarksSeen = Array.isArray(a.stats.landmarksSeen) ? [...new Set(a.stats.landmarksSeen.filter((b) => typeof b === "string" && b.length < 20))] : [];
  }
  if (Array.isArray(a.family)) {
    out.family = a.family
      .filter((f) => f && typeof f === "object" && ["adult", "mate", "cub"].includes(f.role))
      .slice(0, 8)
      .map((f, i) => ({
        id: typeof f.id === "string" ? f.id.slice(0, 24) : `f${i}`,
        role: f.role,
        name: typeof f.name === "string" ? f.name.slice(0, 20) : "Companion",
        growth: num(f.growth, f.role === "cub" ? 0 : 1, 0, 1),
        hp: num(f.hp, 1, 0, 1),
        home: f.home === true,
      }));
  }
  if (a.nest && typeof a.nest === "object" && TERR_IDS.has(a.nest.t)) out.nest = { t: a.nest.t, cond: num(a.nest.cond, 100, 0, 100) };
  out.found = idList(a.found, TERR_IDS);
  out.owned = idList(a.owned, TERR_IDS).filter((id) => TERRITORIES.find((t) => t.id === id).species.includes(species));
  for (const id of out.owned) if (!out.found.includes(id)) out.found.push(id);
  out.rivalsBeaten = idList(a.rivalsBeaten, TERR_IDS);
  out.lastBirth = num(a.lastBirth, -10, -10, 1e6);
  out.deaths = int(a.deaths, 0, 0, 1e6);
  out.playTime = num(a.playTime, 0, 0, 1e9);
  return out;
}

/** Validate any parsed object into a well-formed save. */
export function validateSave(raw) {
  const s = newSave();
  if (!raw || typeof raw !== "object" || raw.v !== SAVE_VERSION) return s;
  s.selected = SPECIES_ORDER.includes(raw.selected) ? raw.selected : null;
  const st = raw.settings || {};
  s.settings = {
    sens: num(st.sens, 1, 0.2, 3),
    invertY: bool(st.invertY, false),
    camDist: num(st.camDist, 1, 0.6, 1.6),
    quality: strIn(st.quality, ["low", "medium", "high"], "high"),
    hints: bool(st.hints, true),
    volume: num(st.volume, 0.8, 0, 1),
  };
  const w = raw.world || {};
  s.world = { time: num(w.time, 0.3, 0, 1), day: int(w.day, 1, 1, 1e6), weather: strIn(w.weather, ["clear", "rain", "fog", "storm"], "clear") };
  for (const sp of SPECIES_ORDER) s.animals[sp] = validAnimal(raw.animals?.[sp], sp);
  return s;
}

export function loadSave(storage) {
  try {
    const txt = storage?.getItem(SAVE_KEY);
    if (!txt) return newSave();
    return validateSave(JSON.parse(txt));
  } catch {
    return newSave();
  }
}

export function writeSave(storage, save) {
  try {
    storage?.setItem(SAVE_KEY, JSON.stringify(save));
    return true;
  } catch {
    return false;
  }
}

/** Has this animal ever been played? */
export const animalStarted = (a) => !!a && (a.pos != null || a.level > 1 || a.xp > 0 || a.missions.length > 0);
