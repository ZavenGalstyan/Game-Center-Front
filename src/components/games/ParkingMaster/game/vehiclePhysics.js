/**
 * Parking Master — arcade vehicle physics, tuned for precision not speed.
 *
 * The model is the classic arcade one: the car has a heading, the heading turns
 * at a rate set by the front-wheel angle and the forward speed, and the
 * velocity is split into a forward part (engine + brakes) and a lateral part
 * (grip eats it almost entirely — this car does not drift). Top speed is low
 * (~32 km/h), acceleration is gentle so a feather-touch creeps the car forward,
 * and the brakes are strong and predictable.
 *
 * Fixed 120 Hz sub-steps: identical behaviour on 60 and 144 Hz displays, and no
 * tunnelling through a wall between frames.
 */

const FIXED_DT = 1 / 120;
const MAX_STEPS = 8;
const WHEELBASE = 2.4;

export const TUNING = {
  compact: { maxSpeed: 9.0, reverse: 4.4, accel: 6.4, brake: 17, mass: 1, steerLock: 0.62, wheelR: 0.33 },
  sedan: { maxSpeed: 9.4, reverse: 4.4, accel: 6.0, brake: 16, mass: 1.1, steerLock: 0.58, wheelR: 0.34 },
  suv: { maxSpeed: 9.0, reverse: 4.2, accel: 5.6, brake: 15, mass: 1.25, steerLock: 0.55, wheelR: 0.36 },
};

const STEER_RESPONSE = { low: 4.2, medium: 6.0, high: 8.5 };
const STEER_LOCK_MUL = { low: 0.85, medium: 1.0, high: 1.12 };

export function createVehicleState(spawn, body = "compact") {
  return {
    x: spawn.pos[0],
    z: spawn.pos[1],
    y: 0.0,
    yaw: spawn.heading ?? 0,
    vx: 0,
    vz: 0,
    speed: 0, // signed forward speed, m/s
    lateral: 0,
    steer: 0, // smoothed steering input -1..1
    steerAngle: 0, // radians, front wheels
    yawRate: 0,
    accelG: 0,
    wheelSpin: 0,
    pitch: 0,
    roll: 0,
    bump: 0,
    braking: false,
    reversing: false,
    tuning: TUNING[body] || TUNING.compact,
  };
}

/**
 * Advance the car by `dt` seconds.
 *   input = { throttle:-1..1, steer:-1..1, handbrake:bool }
 *   ctx   = { world, grip, sensitivity, onCollision }
 */
export function stepVehicle(s, input, ctx, dt) {
  if (!(dt > 0)) return s;
  const steps = Math.min(MAX_STEPS, Math.max(1, Math.round(dt / FIXED_DT)));
  const h = dt / steps;
  for (let i = 0; i < steps; i++) subStep(s, input, ctx, h);

  const targetPitch = clamp(-s.accelG * 0.012, -0.05, 0.05);
  const targetRoll = clamp(s.yawRate * s.speed * 0.006, -0.07, 0.07);
  s.pitch += (targetPitch - s.pitch) * Math.min(1, dt * 8);
  s.roll += (targetRoll - s.roll) * Math.min(1, dt * 7);
  s.bump *= Math.max(0, 1 - dt * 6);
  s.wheelSpin += (s.speed / Math.max(0.2, s.tuning.wheelR)) * dt;
  return s;
}

function subStep(s, input, ctx, dt) {
  const d = s.tuning;
  const grip = clamp(ctx.grip ?? 1, 0.5, 1.2);
  const sens = ctx.sensitivity || "medium";

  /* ---------------------------------------------------------- steering */

  const steerTarget = clamp(input.steer, -1, 1);
  const rate = (Math.abs(steerTarget) > Math.abs(s.steer)
    ? STEER_RESPONSE[sens]
    : STEER_RESPONSE[sens] * 1.6);
  s.steer += (steerTarget - s.steer) * Math.min(1, dt * rate);
  if (Math.abs(steerTarget) < 0.01 && Math.abs(s.steer) < 0.02) s.steer = 0;

  const spd = Math.abs(s.speed);
  const speedFrac = Math.min(1, spd / Math.max(4, d.maxSpeed));
  // strong lock at crawl, softer at speed — but never dead
  const lockScale = (1 - 0.42 * speedFrac) * (STEER_LOCK_MUL[sens] || 1);
  // negative so a "steer right" (D / +1) input turns the car right on screen,
  // where the chase camera looks toward +Z and world +X is screen-left
  s.steerAngle = -s.steer * d.steerLock * lockScale;

  let yawRate = 0;
  if (spd > 0.04) {
    yawRate = (s.speed / WHEELBASE) * Math.tan(s.steerAngle);
    const cap = (9.0 * grip) / Math.max(2.0, spd);
    yawRate = clamp(yawRate, -cap, cap);
  }
  s.yawRate = yawRate;
  s.yaw += yawRate * dt;

  /* ------------------------------------------------------ engine/brakes */

  const fx = Math.sin(s.yaw);
  const fz = Math.cos(s.yaw);
  const rx = fz;
  const rz = -fx;

  let forward = s.vx * fx + s.vz * fz;
  let lat = s.vx * rx + s.vz * rz;
  const prevForward = forward;

  const throttle = clamp(input.throttle, -1, 1);
  s.braking = false;
  s.reversing = false;
  const brakeMul = 0.7 + 0.3 * grip;

  if (throttle > 0.02) {
    if (forward < -0.3) {
      forward += d.brake * brakeMul * throttle * dt;
      s.braking = true;
    } else {
      const headroom = 1 - Math.min(1, forward / d.maxSpeed);
      // eased throttle — a small press produces a small force
      const t = throttle * throttle * Math.sign(throttle);
      forward += d.accel * t * headroom * dt;
    }
  } else if (throttle < -0.02) {
    if (forward > 0.3) {
      forward += d.brake * brakeMul * throttle * dt;
      s.braking = true;
    } else {
      s.reversing = true;
      const headroom = 1 - Math.min(1, -forward / d.reverse);
      forward += d.accel * 0.6 * throttle * headroom * dt;
    }
  } else {
    const drag = 3.2;
    forward -= Math.sign(forward) * Math.min(Math.abs(forward), drag * dt);
  }

  if (input.handbrake) {
    forward -= Math.sign(forward) * Math.min(Math.abs(forward), d.brake * 0.7 * dt);
    s.braking = true;
  }

  if (forward > d.maxSpeed) forward = d.maxSpeed;
  if (forward < -d.reverse) forward = -d.reverse;

  /* ------------------------------------------------------------- grip */

  const latFriction = input.handbrake ? 5.5 * grip : 14 * grip;
  lat *= Math.exp(-latFriction * dt);

  s.speed = forward;
  s.lateral = lat;
  s.vx = fx * forward + rx * lat;
  s.vz = fz * forward + rz * lat;
  s.accelG = dt > 0 ? (forward - prevForward) / dt : 0;

  s.x += s.vx * dt;
  s.z += s.vz * dt;

  /* -------------------------------------------------------- collision */

  const world = ctx.world;
  if (world) resolve(s, world, ctx, fx, fz, rx, rz);
}

const FRONT = 1.3;
const REAR = -1.3;
const AXLE_R = 1.02;

function resolve(s, world, ctx, fx, fz, rx, rz) {
  let impact = 0;
  let soft = 1;
  for (const off of [FRONT, REAR]) {
    const cx = s.x + fx * off;
    const cz = s.z + fz * off;
    const hit = world.resolveCircle(cx, cz, AXLE_R);
    if (!hit) continue;
    s.x += hit.px;
    s.z += hit.pz;

    const vn = s.vx * hit.nx + s.vz * hit.nz;
    if (vn < 0) {
      const bounce = 0.06 + hit.soft * 0.1;
      s.vx -= hit.nx * vn * (1 + bounce);
      s.vz -= hit.nz * vn * (1 + bounce);
      impact = Math.max(impact, -vn);
      soft = Math.min(soft, hit.soft);
    }
    const loss = 1 - Math.min(0.6, hit.depth * (0.55 - hit.soft * 0.35));
    const f = s.vx * fx + s.vz * fz;
    const l = s.vx * rx + s.vz * rz;
    s.speed = f * loss;
    s.lateral = l * loss;
    s.vx = fx * s.speed + rx * s.lateral;
    s.vz = fz * s.speed + rz * s.lateral;
  }
  if (impact > 0.8) {
    s.bump = Math.min(1.5, s.bump + impact * 0.12);
    ctx.onCollision?.(impact, soft);
  }
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function kmh(state) {
  return Math.abs(state.speed) * 3.6;
}
