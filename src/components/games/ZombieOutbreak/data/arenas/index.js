/** Zombie Outbreak — the five arenas. */
import { CITY } from "./city.js";
import { WAREHOUSE } from "./warehouse.js";
import { HOSPITAL } from "./hospital.js";
import { LAB } from "./lab.js";
import { MILITARY } from "./military.js";

export const ARENAS = { city: CITY, warehouse: WAREHOUSE, hospital: HOSPITAL, lab: LAB, military: MILITARY };

export const ARENA_ORDER = ["city", "warehouse", "hospital", "lab", "military"];

export function getArena(id) {
  return ARENAS[id] || CITY;
}
