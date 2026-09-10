/**
 * Crowd Rush — progression / unlock helpers. Pure reads over the progress
 * object; nothing here writes storage.
 *
 * Level 1 is unlocked at the start. Finishing a level unlocks the next.
 * Finishing level 10 therefore unlocks level 11 — the first level of World 2 —
 * so "world unlocked" is just "its first level is <= unlockedLevel".
 */

import { LEVELS, TOTAL_LEVELS } from "../data/levels.js";
import { WORLDS } from "../data/worlds.js";

export function isLevelUnlocked(state, id) {
  return id <= state.unlockedLevel && id >= 1 && id <= TOTAL_LEVELS;
}

export function isWorldUnlocked(state, worldId) {
  const w = WORLDS.find((x) => x.id === worldId);
  return !!w && state.unlockedLevel >= w.range[0];
}

export function worldProgress(state, worldId) {
  const w = WORLDS.find((x) => x.id === worldId);
  if (!w) return { done: 0, total: 10, stars: 0, unlocked: false };
  const levels = LEVELS.filter((l) => l.world === worldId);
  let done = 0;
  let stars = 0;
  for (const l of levels) {
    const rec = state.levels[l.id];
    if (rec?.completed) done += 1;
    stars += rec?.stars || 0;
  }
  return { done, total: levels.length, stars, maxStars: levels.length * 3, unlocked: isWorldUnlocked(state, worldId) };
}

export function nextLevelId(state) {
  return Math.min(TOTAL_LEVELS, state.unlockedLevel);
}

export function overallProgress(state) {
  return {
    completed: state.statistics.levelsCompleted,
    total: TOTAL_LEVELS,
    stars: state.statistics.totalStars,
    maxStars: TOTAL_LEVELS * 3,
    bestCrowd: state.statistics.bestCrowd,
  };
}
