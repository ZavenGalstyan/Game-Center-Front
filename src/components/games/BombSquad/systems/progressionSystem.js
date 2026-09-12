/**
 * Bomb Squad — unlock / progress helpers shared by Mission Select, the Main
 * Menu summary and the Device Archive. Reads a loaded state (utils/storage.js)
 * plus static data (data/missions.js, data/operations.js); never mutates.
 */
import { TOTAL_MISSIONS, missionsForOperation } from "../data/missions.js";

export function isMissionUnlocked(state, id) {
  return id <= state.unlockedMission;
}

export function isOperationUnlocked(state, op) {
  return isMissionUnlocked(state, op.range[0]);
}

export function operationProgress(state, op) {
  const missions = missionsForOperation(op.id);
  let completed = 0;
  let stars = 0;
  for (const m of missions) {
    const rec = state.missions[m.id];
    if (rec?.completed) completed += 1;
    stars += rec?.stars || 0;
  }
  return { completed, total: missions.length, stars, maxStars: missions.length * 3 };
}

export function totalPossibleStars() {
  return TOTAL_MISSIONS * 3;
}
