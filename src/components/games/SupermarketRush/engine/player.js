/**
 * Supermarket Rush — first-person player movement.
 *
 * Framework-agnostic, like Stonewild's PlayerController: `stepPlayer`
 * mutates a plain player-state object given the shared input object and a
 * list of static axis-aligned colliders (shelves, walls, counters,
 * pallets — everything the layout builder emits). There's no vertical
 * physics here — an employee doesn't jump or fall — so collision only
 * needs to resolve on the X/Z plane, one axis at a time, which keeps this
 * a lot simpler than a voxel world's Y-inclusive sweep.
 *
 * `player.x/z` is the body center; `player.yaw` is set by the scene from
 * mouse movement before calling this (movement is relative to facing).
 */
import { PLAYER_RADIUS, WALK_SPEED, SPRINT_MULT, GROUND_ACCEL } from "./constants.js";

export function createPlayer(spawn) {
  return {
    x: spawn.x,
    z: spawn.z,
    vx: 0,
    vz: 0,
    yaw: spawn.yaw || 0,
    pitch: 0,
    sprinting: false,
    moving: false,
    distanceWalked: 0,
  };
}

function moveTowards(current, target, maxDelta) {
  const diff = target - current;
  if (diff > maxDelta) return current + maxDelta;
  if (diff < -maxDelta) return current - maxDelta;
  return target;
}

const RESPONSE_GAP = 0.002;

/** Resolves one axis of movement against every collider, clamping on the first overlap found. */
function moveAxis(player, axis, delta, colliders) {
  if (delta === 0) return;
  const r = PLAYER_RADIUS;
  let x = player.x + (axis === "x" ? delta : 0);
  let z = player.z + (axis === "z" ? delta : 0);

  for (const c of colliders) {
    if (x + r <= c.minX || x - r >= c.maxX || z + r <= c.minZ || z - r >= c.maxZ) continue;
    if (axis === "x") {
      x = delta > 0 ? c.minX - r - RESPONSE_GAP : c.maxX + r + RESPONSE_GAP;
    } else {
      z = delta > 0 ? c.minZ - r - RESPONSE_GAP : c.maxZ + r + RESPONSE_GAP;
    }
    if (axis === "x") player.vx = 0;
    else player.vz = 0;
  }
  if (axis === "x") player.x = x;
  else player.z = z;
}

/** Advances the player by one fixed physics step. `speedMult` folds in the Movement Speed upgrade. */
export function stepPlayer(player, input, dt, colliders, speedMult = 1) {
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

  player.sprinting = Boolean(input.sprint) && (fIn !== 0 || rIn !== 0);
  player.moving = wishLen > 1e-5;
  const targetSpeed = WALK_SPEED * speedMult * (player.sprinting ? SPRINT_MULT : 1);
  const accel = GROUND_ACCEL * dt;

  player.vx = moveTowards(player.vx, wishX * targetSpeed, accel);
  player.vz = moveTowards(player.vz, wishZ * targetSpeed, accel);

  moveAxis(player, "x", player.vx * dt, colliders);
  moveAxis(player, "z", player.vz * dt, colliders);

  player.distanceWalked += Math.hypot(player.vx, player.vz) * dt;
}

/** True if a point (with the player's radius) would overlap any collider — used to keep spawn points clear. */
export function pointBlocked(x, z, colliders, radius = PLAYER_RADIUS) {
  return colliders.some((c) => x + radius > c.minX && x - radius < c.maxX && z + radius > c.minZ && z - radius < c.maxZ);
}
