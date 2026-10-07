/**
 * Night Corridor — first-person player body: grounded walk / sprint /
 * crouch with smooth acceleration, a short stamina bar and a forgiving
 * flashlight battery. Framework-free; the scene applies mouse look to
 * yaw/pitch each render frame and calls stepPlayer on the fixed step.
 */
import {
  PLAYER_R, WALK_SPEED, SPRINT_SPEED, CROUCH_SPEED, ACCEL, DECEL,
  STAMINA_DRAIN, STAMINA_REGEN, STAMINA_DELAY, STAMINA_RESTART,
  BATTERY_DRAIN, BATTERY_RECOVER, BATTERY_FLOOR,
} from "./constants.js";
import { moveBody } from "./collision.js";

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export function createPlayer(start) {
  return {
    x: start.x,
    z: start.z,
    yaw: start.yaw,
    pitch: -0.04,
    vx: 0,
    vz: 0,
    speed: 0,
    stamina: 1,
    exhausted: false,
    staminaDelay: 0,
    crouch: 0,
    crouching: false,
    sprinting: false,
    moving: false,
    flashlight: true,
    battery: 1,
    bobPhase: 0,
    stepAcc: 0,
    stepSide: 0,
    distance: 0,
  };
}

/** Moves the body one fixed step. Returns a footstep descriptor when a foot lands, else null. */
export function stepPlayer(p, input, dt, level, opts = {}) {
  const fIn = clamp((input.forward ? 1 : 0) - (input.back ? 1 : 0) + (input.touchY || 0), -1, 1);
  const rIn = clamp((input.right ? 1 : 0) - (input.left ? 1 : 0) + (input.touchX || 0), -1, 1);

  const fx = -Math.sin(p.yaw);
  const fz = -Math.cos(p.yaw);
  const rx = Math.cos(p.yaw);
  const rz = -Math.sin(p.yaw);
  let wx = fx * fIn + rx * rIn;
  let wz = fz * fIn + rz * rIn;
  const wl = Math.hypot(wx, wz);
  const mag = Math.min(1, wl);
  if (wl > 1e-5) {
    wx /= wl;
    wz /= wl;
  }

  p.crouching = Boolean(input.crouch) && !opts.forceStand;
  p.crouch += ((p.crouching ? 1 : 0) - p.crouch) * Math.min(1, dt * 9);

  const wantsSprint = Boolean(input.sprint) && fIn > 0.2 && !p.crouching && opts.allowSprint !== false;
  if (p.exhausted && p.stamina >= STAMINA_RESTART) p.exhausted = false;
  p.sprinting = wantsSprint && !p.exhausted && p.stamina > 0 && wl > 1e-5;

  if (p.sprinting) {
    p.stamina = Math.max(0, p.stamina - STAMINA_DRAIN * dt);
    p.staminaDelay = STAMINA_DELAY;
    if (p.stamina <= 0) {
      p.exhausted = true;
      p.sprinting = false;
    }
  } else if (p.staminaDelay > 0) {
    p.staminaDelay -= dt;
  } else {
    p.stamina = Math.min(1, p.stamina + STAMINA_REGEN * dt * (p.moving ? 0.75 : 1));
  }

  const target = (p.sprinting ? SPRINT_SPEED : p.crouching ? CROUCH_SPEED : WALK_SPEED) * mag * (opts.speedMult ?? 1);
  const tvx = wx * target;
  const tvz = wz * target;
  const rate = (target > Math.hypot(p.vx, p.vz) ? ACCEL : DECEL) * dt;
  const dvx = tvx - p.vx;
  const dvz = tvz - p.vz;
  const dl = Math.hypot(dvx, dvz);
  if (dl <= rate) {
    p.vx = tvx;
    p.vz = tvz;
  } else {
    p.vx += (dvx / dl) * rate;
    p.vz += (dvz / dl) * rate;
  }

  const ox = p.x;
  const oz = p.z;
  moveBody(level, p, PLAYER_R, p.vx * dt, p.vz * dt);
  const moved = Math.hypot(p.x - ox, p.z - oz);
  // Bleed velocity into walls so you don't "stick" at full speed against them.
  if (dt > 0) {
    const real = moved / dt;
    const want = Math.hypot(p.vx, p.vz);
    if (want > 0.01 && real < want * 0.5) {
      p.vx *= 0.85;
      p.vz *= 0.85;
    }
  }
  p.speed = dt > 0 ? moved / dt : 0;
  p.moving = p.speed > 0.25;
  p.distance += moved;

  // Flashlight battery — drains while on, recovers while off, never fully dies.
  if (p.flashlight) p.battery = Math.max(BATTERY_FLOOR, p.battery - BATTERY_DRAIN * dt);
  else p.battery = Math.min(1, p.battery + BATTERY_RECOVER * dt);

  // Footsteps
  const stride = p.sprinting ? 1.45 : p.crouching ? 0.7 : 0.95;
  p.bobPhase += (moved / stride) * Math.PI;
  p.stepAcc += moved;
  if (p.stepAcc >= stride) {
    p.stepAcc -= stride;
    p.stepSide ^= 1;
    return { run: p.sprinting, crouch: p.crouching, side: p.stepSide };
  }
  if (!p.moving) p.stepAcc = Math.min(p.stepAcc, stride * 0.6);
  return null;
}
