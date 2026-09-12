/**
 * Blade Rush — angular collision. Everything about "did this throw hit an
 * embedded blade" happens in the TARGET's own rotating frame, never in
 * screen space, so it stays correct at any rotation speed or direction and
 * across the 359°/1° wrap.
 */
import { normalizeAngle, shortestAngleDiff } from "./rotationSystem.js";

/** World-space angle (canvas convention, 0 = +x, clockwise) the blade always
 *  lands at: straight down from the target's center, where the waiting blade
 *  sits below it. */
export const IMPACT_WORLD_ANGLE = Math.PI / 2;

/** The target-local angle a blade landing RIGHT NOW would embed at. */
export function localAngleForImpact(rotation) {
  return normalizeAngle(IMPACT_WORLD_ANGLE - rotation);
}

/** Convert a stored local angle back to world space for rendering. */
export function worldAngleOf(localAngle, rotation) {
  return normalizeAngle(rotation + localAngle);
}

/** Half-width (radians) a blade occupies on the rim — tuned against the
 *  blade's visual width at the default target radius. Two blades whose
 *  centers are closer than 2x this overlap visually. */
export const COLLISION_THRESHOLD = 0.30;
export const SHARD_THRESHOLD = 0.24;

export function findCollision(localAngle, embedded, threshold = COLLISION_THRESHOLD) {
  let closest = null;
  let best = Infinity;
  for (const b of embedded) {
    const d = shortestAngleDiff(localAngle, b.angle);
    if (d < threshold && d < best) { best = d; closest = b; }
  }
  return closest;
}

export function findShardHit(localAngle, shards, threshold = SHARD_THRESHOLD) {
  for (const s of shards) {
    if (s.collected) continue;
    if (shortestAngleDiff(localAngle, s.angle) < threshold) return s;
  }
  return null;
}

/** True if every angle in the list is pairwise clear of every other. */
export function allClear(angles, threshold = COLLISION_THRESHOLD) {
  for (let i = 0; i < angles.length; i++) {
    for (let j = i + 1; j < angles.length; j++) {
      if (shortestAngleDiff(angles[i], angles[j]) < threshold) return false;
    }
  }
  return true;
}
