/**
 * Delivery Rush — localStorage persistence.
 *
 * One namespaced key, `gc_delivery_rush`. Every read merges onto the defaults
 * and re-validates each field, so a save written by an older build (or a
 * hand-edited one) can never crash a newer build — the worst case is a field
 * quietly reverting to its default.
 *
 * Writes only happen on meaningful progression events: finishing a delivery,
 * buying or equipping a vehicle, changing a setting. Never inside a frame.
 *
 * Nothing here touches the keys used by Classic Chess, Fishing Journey or
 * Mini Golf Journey.
 */

import { VEHICLES, PAINTS, getVehicle } from "../data/vehicles.js";
import { TOTAL_MISSIONS } from "../data/missions.js";

const KEY = "gc_delivery_rush";

export const DEFAULT_SETTINGS = {
  graphics: "high", // low | medium | high
  sound: true,
  music: true,
  trafficDensity: "medium", // low | medium | high
  cameraShake: true,
  minimap: true,
  invertLook: false,
};

export const DEFAULT_STATE = {
  selectedVehicle: "city-runner",
  ownedVehicles: ["city-runner"],
  vehicleColors: {},
  coins: 0,
  lastZone: "central-city",
  missions: {}, // { [id]: { completed, stars, bestTime, bestCoins, attempts } }
  settings: { ...DEFAULT_SETTINGS },
  stats: {
    deliveries: 0,
    successfulDeliveries: 0,
    failedDeliveries: 0,
    totalCoinsEarned: 0,
    totalDistance: 0,
    collisions: 0,
    threeStars: 0,
    bestStreak: 0,
  },
};

function readJSON() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "null");
  } catch {
    return null;
  }
}

function writeJSON(value) {
  try {
    localStorage.setItem(KEY, JSON.stringify(value));
  } catch {
    /* storage unavailable — the session just will not persist */
  }
}

const VEHICLE_IDS = new Set(VEHICLES.map((v) => v.id));
const PAINT_IDS = new Set(PAINTS.map((p) => p.id));

export function sanitizeSettings(raw) {
  const s = { ...DEFAULT_SETTINGS, ...(raw || {}) };
  if (!["low", "medium", "high"].includes(s.graphics)) s.graphics = "high";
  if (!["low", "medium", "high"].includes(s.trafficDensity)) s.trafficDensity = "medium";
  s.sound = Boolean(s.sound);
  s.music = Boolean(s.music);
  s.cameraShake = Boolean(s.cameraShake);
  s.minimap = Boolean(s.minimap);
  s.invertLook = Boolean(s.invertLook);
  return s;
}

export function loadState() {
  const raw = readJSON() || {};
  const state = {
    ...DEFAULT_STATE,
    ...raw,
    settings: sanitizeSettings(raw.settings),
    stats: { ...DEFAULT_STATE.stats, ...(raw.stats || {}) },
  };

  state.ownedVehicles = Array.isArray(raw.ownedVehicles)
    ? [...new Set(raw.ownedVehicles.filter((id) => VEHICLE_IDS.has(id)))]
    : [];
  if (!state.ownedVehicles.includes("city-runner")) state.ownedVehicles.unshift("city-runner");

  state.selectedVehicle = state.ownedVehicles.includes(raw.selectedVehicle)
    ? raw.selectedVehicle
    : "city-runner";

  state.vehicleColors = {};
  if (raw.vehicleColors && typeof raw.vehicleColors === "object") {
    for (const [vid, pid] of Object.entries(raw.vehicleColors)) {
      if (VEHICLE_IDS.has(vid) && PAINT_IDS.has(pid)) state.vehicleColors[vid] = pid;
    }
  }

  state.coins = Number.isFinite(raw.coins) ? Math.max(0, Math.floor(raw.coins)) : 0;

  state.missions = {};
  if (raw.missions && typeof raw.missions === "object") {
    for (const [k, m] of Object.entries(raw.missions)) {
      const id = Number(k);
      if (!Number.isInteger(id) || id < 1 || id > TOTAL_MISSIONS || !m) continue;
      state.missions[id] = {
        completed: Boolean(m.completed),
        stars: [0, 1, 2, 3].includes(m.stars) ? m.stars : 0,
        bestTime: Number.isFinite(m.bestTime) ? Math.max(0, m.bestTime) : null,
        bestCoins: Number.isFinite(m.bestCoins) ? Math.max(0, Math.floor(m.bestCoins)) : 0,
        attempts: Number.isFinite(m.attempts) ? Math.max(0, Math.floor(m.attempts)) : 0,
      };
    }
  }

  for (const k of Object.keys(state.stats)) {
    const v = state.stats[k];
    state.stats[k] = Number.isFinite(v) ? Math.max(0, v) : 0;
  }

  return state;
}

export function saveState(state) {
  writeJSON({
    selectedVehicle: state.selectedVehicle,
    ownedVehicles: state.ownedVehicles,
    vehicleColors: state.vehicleColors,
    coins: state.coins,
    lastZone: state.lastZone,
    missions: state.missions,
    settings: state.settings,
    stats: state.stats,
  });
}

/** The paint the player has chosen for a vehicle, or its factory colour. */
export function paintFor(state, vehicleId) {
  return state.vehicleColors[vehicleId] || getVehicle(vehicleId).defaultPaint;
}
