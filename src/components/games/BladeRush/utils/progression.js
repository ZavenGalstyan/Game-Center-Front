import { TOTAL_STAGES } from "../data/stages.js";
import { WORLDS } from "../data/worlds.js";

export function isStageUnlocked(state, stageId) {
  return stageId <= state.unlockedStage;
}

export function nextPlayableStage(state) {
  return Math.min(TOTAL_STAGES, Math.max(1, state.unlockedStage));
}

export function worldStars(state, world) {
  let stars = 0;
  for (let id = world.range[0]; id <= world.range[1]; id++) stars += state.stages[id]?.stars || 0;
  return stars;
}

export function worldCompletedCount(state, world) {
  let n = 0;
  for (let id = world.range[0]; id <= world.range[1]; id++) if (state.stages[id]?.completed) n += 1;
  return n;
}

export function isWorldUnlocked(state, world) {
  return state.unlockedStage >= world.range[0];
}

export function totalPossibleStars() {
  return TOTAL_STAGES * 3;
}

export const isBossStage = (stageId) => stageId % 10 === 0;
export const isMiniBossStage = (stageId) => {
  const w = WORLDS.find((w) => stageId >= w.range[0] && stageId <= w.range[1]);
  return Boolean(w) && stageId === w.range[0] + 9;
};
