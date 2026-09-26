/**
 * Farm Life — top-down player movement.
 *
 * Framework-agnostic: `stepPlayer` mutates a plain state object given input
 * and a static collider list. Full 2D top-down (spec: "make this game full
 * 2D") — WASD maps directly to world axes (no camera-relative math, since
 * the camera never rotates), and `facing` is just the last movement angle,
 * used both for the little directional wedge on the player sprite and for
 * "which tile is in front of me" interaction targeting.
 */
import { PLAYER_RADIUS, WALK_SPEED, SPRINT_MULT, GROUND_ACCEL } from "./constants.js";
import { resolveMove } from "./collision.js";

export function createPlayerState(spawn) {
  return {
    x: spawn.x,
    z: spawn.z,
    facing: spawn.yaw || 0,
    vx: 0,
    vz: 0,
    sprinting: false,
    moving: false,
    toolBusyUntil: 0, // nowSeconds()-scale; see engine/player.js#nowSeconds
  };
}

function moveTowards(current, target, maxDelta) {
  const diff = target - current;
  if (diff > maxDelta) return current + maxDelta;
  if (diff < -maxDelta) return current - maxDelta;
  return target;
}

/** Advances the player one step. Mutates `player` in place. */
export function stepPlayer(player, input, dt, colliders, nowSec) {
  const busy = nowSec < player.toolBusyUntil;

  const fIn = busy ? 0 : (input.forward ? 1 : 0) - (input.back ? 1 : 0);
  const rIn = busy ? 0 : (input.right ? 1 : 0) - (input.left ? 1 : 0);
  let wishX = rIn;
  let wishZ = fIn;
  const wishLen = Math.hypot(wishX, wishZ);
  if (wishLen > 1e-5) {
    wishX /= wishLen;
    wishZ /= wishLen;
  }

  player.sprinting = Boolean(input.sprint) && !busy && (fIn !== 0 || rIn !== 0);
  player.moving = wishLen > 1e-5;
  const targetSpeed = WALK_SPEED * (player.sprinting ? SPRINT_MULT : 1);
  const accel = GROUND_ACCEL * dt;

  player.vx = moveTowards(player.vx, wishX * targetSpeed, accel);
  player.vz = moveTowards(player.vz, wishZ * targetSpeed, accel);

  const pos = { x: player.x, z: player.z };
  resolveMove(pos, player.vx * dt, player.vz * dt, PLAYER_RADIUS, colliders);
  player.x = pos.x;
  player.z = pos.z;

  if (player.moving && !busy) {
    const targetFacing = Math.atan2(wishX, wishZ);
    let d = targetFacing - player.facing;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    player.facing += d * Math.min(1, dt * 14);
  }
}

/** A single wall-clock time source (seconds) shared by the render loop AND
 *  Gameplay's DOM keypress handler. */
export function nowSeconds() {
  return performance.now() / 1000;
}

export function beginToolUse(player, nowSec, durationSec) {
  player.toolBusyUntil = nowSec + durationSec;
  player.vx = 0;
  player.vz = 0;
}

export function isToolBusy(player, nowSec) {
  return nowSec < player.toolBusyUntil;
}
