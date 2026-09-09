/**
 * Delivery Rush — career progression, economy and scoring.
 *
 * Unlocks are *derived* from the mission record rather than stored as their own
 * list, so a save can never end up with a district unlocked that the player has
 * not earned (or, worse, locked out of one they have). Stars are the currency
 * of progression; coins are the currency of the garage.
 */

import { ZONES, getZone } from "../data/zones.js";
import { getMission, getMissions, missionsForZone, TOTAL_MISSIONS } from "../data/missions.js";
import { getVehicle, VEHICLES } from "../data/vehicles.js";

/* --------------------------------------------------------------- unlocks */

export function totalStars(state) {
  let n = 0;
  for (const m of Object.values(state.missions)) n += m.stars || 0;
  return n;
}

export function zoneStars(state, zoneId) {
  let n = 0;
  for (const m of missionsForZone(zoneId)) n += state.missions[m.id]?.stars || 0;
  return n;
}

export function zoneCompleted(state, zoneId) {
  return missionsForZone(zoneId).filter((m) => state.missions[m.id]?.completed).length;
}

export function isZoneUnlocked(state, zoneId) {
  const zone = getZone(zoneId);
  return totalStars(state) >= zone.starsRequired;
}

export function unlockedZones(state) {
  return ZONES.filter((z) => isZoneUnlocked(state, z.id)).map((z) => z.id);
}

/** A mission opens when its district is open and the run before it is done. */
export function isMissionUnlocked(state, mission) {
  if (!mission) return false;
  if (!isZoneUnlocked(state, mission.zone)) return false;
  if (mission.index === 1) return true;
  const prev = getMissions().find((m) => m.zone === mission.zone && m.index === mission.index - 1);
  return Boolean(prev && state.missions[prev.id]?.completed);
}

/** The run the PLAY button should start. */
export function nextMission(state) {
  const all = getMissions();
  for (const m of all) {
    if (!state.missions[m.id]?.completed && isMissionUnlocked(state, m)) return m;
  }
  // everything cleared: offer the last mission again
  return all[all.length - 1];
}

export function zoneProgress(state, zoneId) {
  const list = missionsForZone(zoneId);
  return {
    completed: zoneCompleted(state, zoneId),
    total: list.length,
    stars: zoneStars(state, zoneId),
    maxStars: list.length * 3,
    unlocked: isZoneUnlocked(state, zoneId),
    required: getZone(zoneId).starsRequired,
  };
}

/* --------------------------------------------------------------- scoring */

/**
 * Turn a finished run into stars and a coin breakdown.
 *
 * Stars are deliberately readable: finish inside the limit and you have two,
 * finish with time to spare and a clean sheet and you have three, scrape in
 * with a battered package and you have one.
 */
export function scoreDelivery(mission, run, vehicle, streak) {
  const remaining = Math.max(0, mission.timeLimit - run.time);
  const timeFrac = remaining / mission.timeLimit;
  const clean = run.collisions === 0;
  const condition = run.condition ?? 100;

  let stars = 1;
  if (timeFrac >= 0.32 && run.collisions <= 1 && condition >= 70) stars = 3;
  else if (timeFrac >= 0.12 && run.collisions <= 5 && condition >= 40) stars = 2;

  const base = mission.reward;
  const timeBonus = Math.round(base * 0.45 * Math.min(1, timeFrac / 0.5));
  const cleanBonus = clean ? Math.round(base * 0.22) : run.collisions <= 2 ? Math.round(base * 0.08) : 0;
  const conditionPenalty = mission.fragile ? Math.round(base * 0.5 * (1 - condition / 100)) : 0;
  const cargoBonus = vehicle?.cargoBonus ? Math.round(base * vehicle.cargoBonus) : 0;
  const streakMul = 1 + Math.min(0.4, Math.max(0, streak - 1) * 0.1);

  const subtotal = Math.max(
    Math.round(base * 0.35),
    base + timeBonus + cleanBonus + cargoBonus - conditionPenalty,
  );
  const streakBonus = Math.round(subtotal * (streakMul - 1));
  const total = subtotal + streakBonus;

  return {
    stars,
    base,
    timeBonus,
    cleanBonus,
    cargoBonus,
    conditionPenalty,
    streakBonus,
    streakMul,
    total,
    remaining,
    clean,
    condition,
  };
}

/* ------------------------------------------------------------- mutations */

/** Record a completed delivery. A worse replay never lowers a best. */
export function applyDelivery(state, mission, run, score, streak) {
  const missions = { ...state.missions };
  const prev = missions[mission.id];
  const wasThreeStar = prev?.stars === 3;

  missions[mission.id] = {
    completed: true,
    stars: Math.max(prev?.stars || 0, score.stars),
    bestTime: prev?.bestTime != null ? Math.min(prev.bestTime, run.time) : run.time,
    bestCoins: Math.max(prev?.bestCoins || 0, score.total),
    attempts: (prev?.attempts || 0) + 1,
  };

  const stats = { ...state.stats };
  stats.deliveries += 1;
  stats.successfulDeliveries += 1;
  stats.totalCoinsEarned += score.total;
  stats.totalDistance += run.distance || 0;
  stats.collisions += run.collisions || 0;
  stats.bestStreak = Math.max(stats.bestStreak, streak);
  if (score.stars === 3 && !wasThreeStar) stats.threeStars += 1;

  return {
    ...state,
    missions,
    stats,
    coins: state.coins + score.total,
    lastZone: mission.zone,
  };
}

export function applyFailure(state, mission, run) {
  const missions = { ...state.missions };
  const prev = missions[mission.id];
  missions[mission.id] = {
    completed: Boolean(prev?.completed),
    stars: prev?.stars || 0,
    bestTime: prev?.bestTime ?? null,
    bestCoins: prev?.bestCoins || 0,
    attempts: (prev?.attempts || 0) + 1,
  };
  const stats = { ...state.stats };
  stats.deliveries += 1;
  stats.failedDeliveries += 1;
  stats.totalDistance += run.distance || 0;
  stats.collisions += run.collisions || 0;
  return { ...state, missions, stats, lastZone: mission.zone };
}

/* ---------------------------------------------------------------- garage */

export function canAfford(state, vehicleId) {
  return state.coins >= getVehicle(vehicleId).price;
}

export function buyVehicle(state, vehicleId) {
  const v = getVehicle(vehicleId);
  if (state.ownedVehicles.includes(vehicleId)) return state;
  if (state.coins < v.price) return state;
  return {
    ...state,
    coins: state.coins - v.price,
    ownedVehicles: [...state.ownedVehicles, vehicleId],
    selectedVehicle: vehicleId,
  };
}

export function equipVehicle(state, vehicleId) {
  if (!state.ownedVehicles.includes(vehicleId)) return state;
  return { ...state, selectedVehicle: vehicleId };
}

export function paintVehicle(state, vehicleId, paintId) {
  return { ...state, vehicleColors: { ...state.vehicleColors, [vehicleId]: paintId } };
}

/** Everything the statistics screen shows, derived so it can never drift. */
export function careerSummary(state) {
  const missions = getMissions();
  const completed = missions.filter((m) => state.missions[m.id]?.completed).length;
  return {
    completed,
    total: TOTAL_MISSIONS,
    stars: totalStars(state),
    maxStars: TOTAL_MISSIONS * 3,
    zonesUnlocked: unlockedZones(state).length,
    vehiclesOwned: state.ownedVehicles.length,
    vehiclesTotal: VEHICLES.length,
    ...state.stats,
  };
}
