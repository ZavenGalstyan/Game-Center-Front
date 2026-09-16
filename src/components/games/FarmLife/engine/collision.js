/**
 * Farm Life — XZ-plane collision against static world colliders.
 *
 * Farm Life's player never falls or jumps (spec's control scheme has no
 * jump): `y` is always a deterministic function of terrain height (see
 * terrain.js), so "player falls through the world" is impossible by
 * construction rather than something to patch with a safety net. Only X/Z
 * needs real collision, against two collider shapes:
 *
 *   { type: "box",    minX, maxX, minZ, maxZ }   buildings, fences, coop
 *   { type: "circle", x, z, r }                   trees, rocks, pond, well
 *
 * Resolved per-axis, same technique as Supermarket Rush's engine/player.js
 * (box only) and Stonewild's PlayerController.js — detection uses the
 * player's true radius, but the post-collision snap uses a strictly larger
 * RESPONSE_GAP so the resolved footprint no longer touches the collider at
 * all; otherwise the very next axis's sweep re-discovers the same collider
 * and yanks the player sideways in response to a collision that has nothing
 * to do with that axis (documented at length in Stonewild — same bug class
 * applies here).
 */
const RESPONSE_GAP = 0.004;

/**
 * Resolves one axis against a circle collider. `cross` is the OTHER axis's
 * already-fixed coordinate (e.g. resolving Z, `cross` is the player's
 * current X); `comp` is the axis being resolved (Z). Only pushes back when
 * the two are genuinely within `rr` of the circle in BOTH dimensions — a
 * previous version here only checked the cross-axis reach and then applied
 * the push unconditionally whenever `comp <= centerComp`, which fired for
 * every circle collider anywhere near the player's path regardless of
 * whether they actually overlapped it, flinging the player far past where
 * any real collision occurred.
 */
function resolveCircleAxis(comp, cross, centerComp, centerCross, rr, delta) {
  const crossDist = Math.abs(cross - centerCross);
  if (crossDist >= rr) return comp; // out of reach on the other axis — no overlap possible
  const half = Math.sqrt(rr * rr - crossDist * crossDist);
  if (comp <= centerComp - half || comp >= centerComp + half) return comp; // not actually overlapping
  return delta > 0 ? centerComp - half - RESPONSE_GAP : centerComp + half + RESPONSE_GAP;
}

function moveAxis(pos, axis, delta, radius, colliders) {
  if (delta === 0) return;
  let x = pos.x + (axis === "x" ? delta : 0);
  let z = pos.z + (axis === "z" ? delta : 0);

  for (const c of colliders) {
    if (c.type === "box") {
      if (x + radius <= c.minX || x - radius >= c.maxX || z + radius <= c.minZ || z - radius >= c.maxZ) continue;
      if (axis === "x") x = delta > 0 ? c.minX - radius - RESPONSE_GAP : c.maxX + radius + RESPONSE_GAP;
      else z = delta > 0 ? c.minZ - radius - RESPONSE_GAP : c.maxZ + radius + RESPONSE_GAP;
    } else if (c.type === "circle") {
      const rr = c.r + radius;
      if (axis === "x") x = resolveCircleAxis(x, z, c.x, c.z, rr, delta);
      else z = resolveCircleAxis(z, x, c.z, c.x, rr, delta);
    }
  }
  pos.x = x;
  pos.z = z;
}

/** Mutates `pos` ({x,z}), resolving a proposed (dx, dz) move against colliders one axis at a time. */
export function resolveMove(pos, dx, dz, radius, colliders) {
  moveAxis(pos, "x", dx, radius, colliders);
  moveAxis(pos, "z", dz, radius, colliders);
}

/** True if a point (with radius) overlaps any collider — used to validate spawn/placement points. */
export function pointBlocked(x, z, colliders, radius) {
  for (const c of colliders) {
    if (c.type === "box") {
      if (x + radius > c.minX && x - radius < c.maxX && z + radius > c.minZ && z - radius < c.maxZ) return true;
    } else if (c.type === "circle") {
      const rr = c.r + radius;
      if ((x - c.x) * (x - c.x) + (z - c.z) * (z - c.z) < rr * rr) return true;
    }
  }
  return false;
}
