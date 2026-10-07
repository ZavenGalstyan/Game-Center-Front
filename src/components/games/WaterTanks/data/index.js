/** Water Tanks — compiled campaign access. */
import { LEVELS } from "./levels.js";
import { LEVELS_PER_CHAPTER } from "./chapters.js";
import { compileCampaignLevel } from "../engine/level.js";

export const TOTAL_LEVELS = LEVELS.length;

export function getLevel(id) {
  const raw = LEVELS[id - 1];
  if (!raw) return null;
  return compileCampaignLevel(raw, id, Math.ceil(id / LEVELS_PER_CHAPTER));
}
