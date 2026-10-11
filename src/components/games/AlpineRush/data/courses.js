/**
 * Alpine Rush — every course (5 worlds × 6), authored per world. Each def:
 * id, name, mode (time | slalom | rival), seed, heading, width (piste
 * half-width, m), grade (descent per metre), difficulty (0..1, rivals),
 * blurb, segs, optional wind / surface. Gold / silver / bronze times come
 * from data/medals.js (generated + verified by tools/simTest.mjs medals).
 */
import { SUNNY } from "./coursesSunny.js";
import { PINE } from "./coursesPine.js";
import { FROZEN } from "./coursesFrozen.js";
import { BLIZZARD } from "./coursesBlizzard.js";
import { SUMMIT } from "./coursesSummit.js";
import { worldOfLevel } from "./worlds.js";
import { MEDALS } from "./medals.js";

const ALL = [...SUNNY, ...PINE, ...FROZEN, ...BLIZZARD, ...SUMMIT];

export const COURSES = ALL.map((c) => {
  const w = worldOfLevel(c.id);
  return { ...c, world: w.id, surface: c.surface || w.surface, medals: MEDALS[c.id] || null };
}).sort((a, b) => a.id - b.id);

export const TOTAL_LEVELS = 30;
const BY_ID = new Map(COURSES.map((c) => [c.id, c]));
export const getCourse = (id) => BY_ID.get(id) || null;
