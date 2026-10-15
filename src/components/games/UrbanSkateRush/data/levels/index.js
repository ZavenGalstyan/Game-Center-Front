/**
 * Urban Skate Rush — level lookup.
 *
 * Every level is a compact indoor skate room (data/rooms.js): one theme per
 * district, and each level number gets its own layout variant. Rooms are
 * cached so React re-renders and the physics share one object.
 */
import { buildRoom } from "../rooms.js";

const cache = new Map();
function room(district, variant) {
  const key = `${district}:${variant}`;
  if (!cache.has(key)) cache.set(key, buildRoom(district, variant));
  return cache.get(key);
}

const DISTRICT_IDS = { downtown: 1, industrial: 2, beach: 3, neon: 4, mega: 5 };

/** Level for "missionN": district = ceil(N / 6), layout variant = N. */
export function getLevelForMission(missionId) {
  const n = parseInt(String(missionId).replace("mission", ""), 10) || 1;
  return room(Math.min(5, Math.max(1, Math.ceil(n / 6))), n);
}

/** Free-skate room for a district id (number or old name). */
export function getLevel(districtIdOrNum) {
  const d = typeof districtIdOrNum === "number" ? districtIdOrNum : DISTRICT_IDS[districtIdOrNum] || 1;
  return room(Math.min(5, Math.max(1, d)), 0);
}
