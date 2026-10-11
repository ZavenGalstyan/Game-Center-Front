/**
 * Urban Skate Rush — Level Data Index
 *
 * Exports all district levels
 */

import { DOWNTOWN_LEVEL } from "./downtown.js";
import { INDUSTRIAL_LEVEL } from "./industrial.js";
import { BEACH_LEVEL } from "./beach.js";
import { NEON_LEVEL } from "./neon.js";
import { MEGA_LEVEL } from "./mega.js";

// All levels indexed by district ID
export const LEVELS = {
  downtown: DOWNTOWN_LEVEL,
  industrial: INDUSTRIAL_LEVEL,
  beach: BEACH_LEVEL,
  neon: NEON_LEVEL,
  mega: MEGA_LEVEL,
};

// Levels indexed by district number (1-5)
export const LEVELS_BY_DISTRICT = {
  1: DOWNTOWN_LEVEL,
  2: INDUSTRIAL_LEVEL,
  3: BEACH_LEVEL,
  4: NEON_LEVEL,
  5: MEGA_LEVEL,
};

// Get level for a specific mission
export function getLevelForMission(missionId) {
  const missionNum = parseInt(missionId.replace("mission", ""), 10);

  // District 1: Missions 1-6
  if (missionNum >= 1 && missionNum <= 6) {
    return DOWNTOWN_LEVEL;
  }
  // District 2: Missions 7-12
  if (missionNum >= 7 && missionNum <= 12) {
    return INDUSTRIAL_LEVEL;
  }
  // District 3: Missions 13-18
  if (missionNum >= 13 && missionNum <= 18) {
    return BEACH_LEVEL;
  }
  // District 4: Missions 19-24
  if (missionNum >= 19 && missionNum <= 24) {
    return NEON_LEVEL;
  }
  // District 5: Missions 25-30
  if (missionNum >= 25 && missionNum <= 30) {
    return MEGA_LEVEL;
  }

  // Default to downtown
  return DOWNTOWN_LEVEL;
}

// Get level by district ID or number
export function getLevel(districtIdOrNum) {
  if (typeof districtIdOrNum === "number") {
    return LEVELS_BY_DISTRICT[districtIdOrNum] || DOWNTOWN_LEVEL;
  }
  return LEVELS[districtIdOrNum] || DOWNTOWN_LEVEL;
}

// Export individual levels for direct import
export {
  DOWNTOWN_LEVEL,
  INDUSTRIAL_LEVEL,
  BEACH_LEVEL,
  NEON_LEVEL,
  MEGA_LEVEL,
};
