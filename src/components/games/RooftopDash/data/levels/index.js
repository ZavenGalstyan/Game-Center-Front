/**
 * Rooftop Dash — all levels, in play order. Each level is plain data built
 * with the course kit (../kit.js); `world` picks the district theme.
 * Target times come from targets.js (baked by tools/bakeTargets.mjs from the
 * route bot's safe-route time — a mastery goal, never required to progress).
 */
import level01 from "./level01.js";
import world1 from "./world1.js";
import world2 from "./world2.js";
import world3 from "./world3.js";
import world4 from "./world4.js";
import world5 from "./world5.js";
import { TARGETS } from "./targets.js";

const ALL = [level01, ...world1, ...world2, ...world3, ...world4, ...world5];

export const LEVELS = ALL.map((l) => ({ ...l, targetTime: TARGETS[l.id] ?? l.targetTime ?? 60 }));

export const levelById = (id) => LEVELS.find((l) => l.id === id) || null;
