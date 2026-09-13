/**
 * Stonewild — first-person player physics.
 *
 * Framework-agnostic: `stepPlayer` mutates a plain player-state object given
 * the shared input object and a voxel `isSolid(wx, wy, wz)` predicate. Kept
 * separate from any React/R3F code so it's trivially unit-testable and so
 * PlayerRig.jsx stays a thin adapter.
 *
 * `player.x/y/z` is the feet position (y = bottom of the collision box, at
 * the center of the box on x/z). Collision is resolved per-axis against the
 * voxel grid — standard for a body this small relative to block size and a
 * per-frame delta well under one block, so no continuous/swept test is
 * needed (see constants.js for the fixed/clamped timestep that keeps that
 * assumption true even after a lag spike).
 */

import {
  PLAYER_HEIGHT,
  PLAYER_RADIUS,
  WALK_SPEED,
  SPRINT_MULT,
  JUMP_SPEED,
  GRAVITY,
  MAX_FALL_SPEED,
  AIR_CONTROL,
  GROUND_ACCEL,
} from "./constants.js";

export function createPlayer(spawn) {
  return {
    x: spawn.x,
    y: spawn.y,
    z: spawn.z,
    vx: 0,
    vy: 0,
    vz: 0,
    yaw: 0,
    pitch: 0,
    onGround: false,
    sprinting: false,
    fallStartY: null,
    lastFallDistance: 0,
  };
}

function moveTowards(current, target, maxDelta) {
  const diff = target - current;
  if (diff > maxDelta) return current + maxDelta;
  if (diff < -maxDelta) return current - maxDelta;
  return target;
}

/** Inclusive integer range from `lo` to `hi`, walked starting from whichever
 *  end is CLOSER to where the mover is arriving FROM — i.e. the end nearest
 *  the direction of travel comes last, so the first solid cell found is
 *  always the one nearest the mover's previous position, never one buried
 *  behind it. `nearFirst` true walks lo->hi, false walks hi->lo. */
function orderedRange(lo, hi, nearFirst) {
  const out = [];
  if (nearFirst) for (let i = lo; i <= hi; i++) out.push(i);
  else for (let i = hi; i >= lo; i--) out.push(i);
  return out;
}

// Detection uses a hair-thin inset (`r`) so the sweep is essentially the
// player's true footprint. The RESPONSE distance after a hit is snapped
// further back than that — see the cross-axis re-trigger bug described
// below for why the two must differ.
const RESPONSE_GAP = PLAYER_RADIUS + 0.002;

/**
 * Resolves movement along one axis against the voxel grid, clamping on
 * collision.
 *
 * TWO fall-through bugs lived here, both now fixed:
 *
 * 1. Wrong-layer resolution: when the swept range spans more than one block
 *    along the moving axis (routine for Y — a 1.8-tall player always
 *    straddles two layers) and more than one of them is solid (e.g. falling
 *    into a tree log with canopy leaves directly above it), the old scan
 *    order picked whichever solid cell it happened to visit FIRST — for a
 *    fall, that could be the LOWER of two solid layers, snapping the player
 *    to just above it while still embedded in the layer above, which then
 *    ejected them again next frame. Fixed by `orderedRange`: always scan
 *    starting from the cell nearest the player's previous position, so a
 *    fall resolves against the TOPMOST solid layer in the stack.
 *
 * 2. Cross-axis re-trigger (the actually-reproduced bug — see the stress
 *    test in the audit): resolving a hit by snapping to exactly
 *    `wallEdge ± r` leaves the player's edge sitting precisely ON that
 *    block's boundary. `Math.floor()` on an exact integer boundary still
 *    counts as being inside the far cell, so the very NEXT axis's sweep
 *    (same tick, e.g. Z right after X) would re-discover that same
 *    neighboring column, find it solid (genuine terrain, just irrelevant to
 *    the axis now being resolved), and yank the player a full block
 *    sideways in response to a collision that had nothing to do with that
 *    axis's actual motion. Compounded across ticks this is what produced
 *    the "climbing/ejecting through open air" trace during the audit
 *    (positions moving whole integer blocks in one physics tick, `onGround`
 *    staying true over terrain the pure sampler reports as air). Fixed by
 *    giving the response a strictly larger margin (`RESPONSE_GAP`) than the
 *    detection inset, so the post-snap footprint provably no longer
 *    touches the wall's column.
 */
function moveAxis(player, axis, delta, isSolid) {
  if (delta === 0) return;
  const r = PLAYER_RADIUS - 0.001; // tiny inset avoids catching on exact-seam floating error
  let x = player.x, y = player.y, z = player.z;
  if (axis === "x") x += delta;
  else if (axis === "y") y += delta;
  else z += delta;

  const x0 = Math.floor(x - r), x1 = Math.floor(x + r);
  const y0 = Math.floor(y), y1 = Math.floor(y + PLAYER_HEIGHT - 0.001);
  const z0 = Math.floor(z - r), z1 = Math.floor(z + r);

  // Only the axis actually being resolved needs direction-aware ordering —
  // the other two dimensions of the sweep don't have a "direction of
  // travel." Moving in the positive direction means the mover arrived FROM
  // the lower end of the range, so that end is nearest and must be checked
  // first (nearFirst = delta > 0); moving negative, the higher end is nearest.
  const byOrder = axis === "y" ? orderedRange(y0, y1, delta > 0) : orderedRange(y0, y1, true);
  const bxOrder = axis === "x" ? orderedRange(x0, x1, delta > 0) : orderedRange(x0, x1, true);
  const bzOrder = axis === "z" ? orderedRange(z0, z1, delta > 0) : orderedRange(z0, z1, true);

  for (const by of byOrder) {
    for (const bz of bzOrder) {
      for (const bx of bxOrder) {
        if (!isSolid(bx, by, bz)) continue;
        if (axis === "y") {
          if (delta > 0) {
            player.y = by - PLAYER_HEIGHT;
          } else {
            player.y = by + 1;
            player.onGround = true;
          }
          player.vy = 0;
        } else if (axis === "x") {
          // RESPONSE_GAP (not `r`) here on purpose — see this function's
          // header. Snapping by exactly `r` leaves the player's edge sitting
          // precisely ON the wall's boundary; the *next* axis's sweep then
          // re-floor()s that same boundary into the wall's column again and
          // reacts to it as if it were a collision on ITS axis, yanking the
          // player a full block sideways in a direction with no real
          // obstruction. The extra margin guarantees the post-snap footprint
          // no longer touches the wall column at all.
          player.x = delta > 0 ? bx - RESPONSE_GAP : bx + 1 + RESPONSE_GAP;
          player.vx = 0;
        } else {
          player.z = delta > 0 ? bz - RESPONSE_GAP : bz + 1 + RESPONSE_GAP;
          player.vz = 0;
        }
        return;
      }
    }
  }
  player.x = x;
  player.y = y;
  player.z = z;
}

/**
 * Advances the player by one fixed physics step. `player.yaw` must already
 * reflect the current mouse look (PlayerRig applies mouse delta before
 * calling this) — movement is relative to where the player is facing.
 */
export function stepPlayer(player, input, dt, isSolid, sprintAllowed = true) {
  const wasOnGround = player.onGround;

  player.vy += GRAVITY * dt;
  if (player.vy < MAX_FALL_SPEED) player.vy = MAX_FALL_SPEED;

  const forwardX = -Math.sin(player.yaw);
  const forwardZ = -Math.cos(player.yaw);
  const rightX = Math.cos(player.yaw);
  const rightZ = -Math.sin(player.yaw);

  const fIn = (input.forward ? 1 : 0) - (input.back ? 1 : 0);
  const rIn = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  let wishX = forwardX * fIn + rightX * rIn;
  let wishZ = forwardZ * fIn + rightZ * rIn;
  const wishLen = Math.hypot(wishX, wishZ);
  if (wishLen > 1e-5) {
    wishX /= wishLen;
    wishZ /= wishLen;
  }

  player.sprinting = Boolean(input.sprint) && sprintAllowed && (fIn !== 0 || rIn !== 0);
  const targetSpeed = WALK_SPEED * (player.sprinting ? SPRINT_MULT : 1);
  const accel = (wasOnGround ? GROUND_ACCEL : GROUND_ACCEL * AIR_CONTROL) * dt;

  player.vx = moveTowards(player.vx, wishX * targetSpeed, accel);
  player.vz = moveTowards(player.vz, wishZ * targetSpeed, accel);

  if (input.jump && wasOnGround) {
    player.vy = JUMP_SPEED;
  }

  player.onGround = false;
  moveAxis(player, "y", player.vy * dt, isSolid);
  moveAxis(player, "x", player.vx * dt, isSolid);
  moveAxis(player, "z", player.vz * dt, isSolid);

  // Fall-distance bookkeeping — health/fall-damage lands in a later phase,
  // but tracking it now means that phase only reads `lastFallDistance`.
  if (player.onGround) {
    if (player.fallStartY != null) {
      player.lastFallDistance = Math.max(0, player.fallStartY - player.y);
      player.fallStartY = null;
    }
  } else if (player.vy < 0 && player.fallStartY == null) {
    player.fallStartY = player.y;
  }
}
