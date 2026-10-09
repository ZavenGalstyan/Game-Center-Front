/**
 * Police Escape 3D — all 30 missions (5 worlds × 6). Star target times come
 * from data/targets.js (generated from the bot's reference runs:
 * tools/simTest.mjs targets --write).
 */
import { MISSIONS_DOWNTOWN } from "./missionsDowntown.js";
import { MISSIONS_INDUSTRIAL, MISSIONS_COASTAL, MISSIONS_RAIN, MISSIONS_METRO } from "./missionsMore.js";
import { TARGETS } from "./targets.js";

const RAW = [...MISSIONS_DOWNTOWN, ...MISSIONS_INDUSTRIAL, ...MISSIONS_COASTAL, ...MISSIONS_RAIN, ...MISSIONS_METRO];

export const MISSIONS = RAW.map((m) => (TARGETS[m.id] ? { ...m, stars: { ...m.stars, time: TARGETS[m.id] } } : m));
export const TOTAL_MISSIONS = 30;
const BY_ID = new Map(MISSIONS.map((m) => [m.id, m]));
export const getMission = (id) => BY_ID.get(id) || null;
export const missionAvailable = (id) => BY_ID.has(id);
