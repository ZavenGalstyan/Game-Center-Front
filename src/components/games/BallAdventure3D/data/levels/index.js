import { GREEN_HILLS_LEVELS } from "./greenHills.js";
import { LEVEL_NAMES } from "./generatedNames.js";
import { generateLevel } from "../../engine/levelGenerator.js";
import { getWorldForLevel } from "../worlds.js";

/** Levels 1-3 are hand-authored (the mandated pre-expansion checkpoint).
 * Levels 4-100 are generated on demand (deterministic, cached) from each
 * world's mechanic/theme config — see engine/levelGenerator.js. */
const HAND_AUTHORED = new Map(GREEN_HILLS_LEVELS.map((lvl) => [lvl.id, lvl]));
const MIN_GENERATED_ID = 4;
const MAX_LEVEL_ID = 100;

const generatedCache = new Map();

function difficultyFor(id, world) {
  const within = id - world.levelStart; // 0-9
  const base = 0.04 + 0.90 * ((id - MIN_GENERATED_ID) / (MAX_LEVEL_ID - MIN_GENERATED_ID));
  return Math.max(0.04, Math.min(0.97, base)) + (within === 0 ? -0.03 : 0); // ease into each new world
}

function buildGenerated(id) {
  const world = getWorldForLevel(id);
  if (!world) return null;
  const within = id - world.levelStart; // 0-9
  const isFinale = id === MAX_LEVEL_ID;
  const name = LEVEL_NAMES[id] || `${world.name} ${within + 1}`;
  const tutorial = within === 0
    ? [{ key: "mechanic", text: world.mechanic.toUpperCase(), trigger: "start" }]
    : [];

  return generateLevel({
    id,
    world: world.id,
    name,
    difficulty: isFinale ? 0.98 : difficultyFor(id, world),
    segmentCount: isFinale ? 15 : undefined,
    mechanicSurface: world.mechanicSurface,
    hazardStyle: world.hazardStyle,
    groundTint: world.groundTint,
    stoneTint: world.stoneTint,
    decorSet: world.decorSet,
    gravity: world.gravity,
    lavaTheme: world.lavaTheme,
    windMechanic: world.windMechanic,
    tutorial,
  });
}

export function getLevel(id) {
  if (HAND_AUTHORED.has(id)) return HAND_AUTHORED.get(id);
  if (id < MIN_GENERATED_ID || id > MAX_LEVEL_ID) return null;
  if (!generatedCache.has(id)) generatedCache.set(id, buildGenerated(id));
  return generatedCache.get(id);
}

export function levelExists(id) {
  return HAND_AUTHORED.has(id) || (id >= MIN_GENERATED_ID && id <= MAX_LEVEL_ID);
}

export function levelsForWorld(world) {
  const ids = [];
  for (let id = world.levelStart; id <= world.levelEnd; id++) ids.push(id);
  return ids.map(getLevel).filter(Boolean);
}
