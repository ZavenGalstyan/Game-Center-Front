/**
 * Delivery Rush — arcade vehicle physics.
 *
 * Not a simulator. The model is the classic arcade one: the car has a heading,
 * the heading turns at a rate limited by grip, and the velocity is split into a
 * forward component (engine and brakes act on it) and a lateral one (grip eats
 * it). Lower the lateral friction and the car slides; that single number is
 * what makes snow feel like snow and the handbrake feel like a handbrake.
 *
 * Everything runs on a fixed 120 Hz sub-step so behaviour is identical on a
 * 60 Hz laptop and a 144 Hz monitor, and so a car at 34 m/s cannot tunnel
 * through a wall between frames.
 */

const FIXED_DT = 1 / 120;
const MAX_STEPS = 8;
const WHEELBASE = 2.65;
const MAX_STEER = 0.62; // radians at full lock

export function createVehicleState(spawn, drive) {
  return {
    x: spawn.x,
    z: spawn.z,
    y: 0.02,
    yaw: spawn.yaw ?? 0,
    vx: 0,
    vz: 0,
    speed: 0, // signed forward speed, m/s
    lateral: 0, // signed slip speed, m/s
    steer: 0, // smoothed steering input
    steerAngle: 0,
    yawRate: 0,
    accelG: 0,
    wheelSpin: 0,
    pitch: 0,
    roll: 0,
    bump: 0,
    braking: false,
    reversing: false,
    sliding: 0,
    airborne: false,
    surface: "road",
    distance: 0,
    lastImpact: 0,
    drive,
  };
}

/**
 * Advance the car. `input` is { throttle, steer, handbrake } with throttle and
 * steer in -1..1. `ctx` carries the world index, the surface modifiers coming
 * from weather, and a collision callback for sound/camera/scoring.
 */
export function stepVehicle(s, input, ctx, dt) {
  // The very first frame can arrive with delta 0; dividing by it would poison
  // the whole state with NaN and the car would silently stop rendering.
  if (!(dt > 0)) return s;
  const steps = Math.min(MAX_STEPS, Math.max(1, Math.round(dt / FIXED_DT)));
  const h = dt / steps;
  for (let i = 0; i < steps; i++) subStep(s, input, ctx, h);

  // visual-only body attitude, damped so it never feels rubbery
  const d = s.drive;
  const targetPitch = clamp(-s.accelG * 0.010, -0.055, 0.055);
  const targetRoll = clamp(s.yawRate * s.speed * 0.0055, -0.09, 0.09);
  s.pitch += (targetPitch - s.pitch) * Math.min(1, dt * 7);
  s.roll += (targetRoll - s.roll) * Math.min(1, dt * 6);
  s.bump *= Math.max(0, 1 - dt * 6);
  s.wheelSpin += (s.speed / Math.max(0.2, d.wheelR ?? 0.35)) * dt;
  return s;
}

function subStep(s, input, ctx, dt) {
  const d = s.drive;
  const world = ctx.world;

  /* ------------------------------------------------------------- surface */

  const surf = world ? world.surfaceAt(s.x, s.z) : DEFAULT_SURFACE;
  s.surface = surf;
  const wx = ctx.weather || NO_WEATHER;
  const zoneSurf = ctx.zoneSurface || NO_ZONE;
  const grip = surf.grip * d.grip * wx.grip * zoneSurf.grip;
  const brakeMul = wx.brake * zoneSurf.brake * (surf.grip > 0.9 ? 1 : surf.grip + 0.1);
  const power = surf.accel;

  /* ------------------------------------------------------------ steering */

  const steerTarget = clamp(input.steer, -1, 1);
  // steering input is smoothed, and gets less eager the faster you go — but
  // never so much that low-speed manoeuvring feels dead
  const rate = Math.abs(steerTarget) > Math.abs(s.steer) ? 6.5 : 9.5;
  s.steer += (steerTarget - s.steer) * Math.min(1, dt * rate);

  const spd = Math.abs(s.speed);
  const speedFrac = Math.min(1, spd / Math.max(6, d.maxSpeed));
  const lockScale = (1 - 0.5 * speedFrac) * d.steer;
  s.steerAngle = s.steer * MAX_STEER * lockScale;

  let yawRate = 0;
  if (spd > 0.05) {
    yawRate = (s.speed / WHEELBASE) * Math.tan(s.steerAngle);
    // cap by available lateral grip so top-speed cornering stays believable
    const maxLat = 15.5 * grip;
    const cap = maxLat / Math.max(2.5, spd);
    if (yawRate > cap) yawRate = cap;
    else if (yawRate < -cap) yawRate = -cap;
  }
  s.yawRate = yawRate;
  s.yaw += yawRate * dt;

  /* -------------------------------------------------------- engine/brakes */

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

  if (throttle > 0.02) {
    if (forward < -0.4) {
      forward += d.brake * brakeMul * throttle * dt; // braking out of reverse
      s.braking = true;
    } else {
      const headroom = 1 - Math.min(1, forward / d.maxSpeed);
      forward += d.accel * power * throttle * headroom * dt;
    }
  } else if (throttle < -0.02) {
    if (forward > 0.4) {
      forward += d.brake * brakeMul * throttle * dt;
      s.braking = true;
    } else {
      s.reversing = true;
      const headroom = 1 - Math.min(1, -forward / d.reverseSpeed);
      forward += d.accel * 0.55 * power * throttle * headroom * dt;
    }
  } else {
    // engine braking + rolling resistance
    const drag = 2.6 + (surf.grip < 0.95 ? 4.5 : 0);
    forward -= Math.sign(forward) * Math.min(Math.abs(forward), drag * dt);
  }

  if (input.handbrake) {
    forward -= Math.sign(forward) * Math.min(Math.abs(forward), d.brake * 0.55 * brakeMul * dt);
    s.braking = true;
  }

  // aerodynamic drag keeps a real top speed without a hard clamp
  forward -= forward * Math.abs(forward) * (0.00072 / Math.max(0.4, d.mass)) * dt * 60;
  const cap = d.maxSpeed * (surf.accel < 0.7 ? 0.62 : 1);
  if (forward > cap) forward = cap;
  if (forward < -d.reverseSpeed) forward = -d.reverseSpeed;

  /* ---------------------------------------------------------------- grip */

  const latFriction = input.handbrake ? d.handbrakeGrip * 2.6 : 9.0 * grip;
  lat *= Math.exp(-latFriction * dt);
  s.sliding = Math.min(1, Math.abs(lat) / 5.5);

  s.speed = forward;
  s.lateral = lat;
  s.vx = fx * forward + rx * lat;
  s.vz = fz * forward + rz * lat;

  s.accelG = dt > 0 ? (forward - prevForward) / dt : 0;

  /* ------------------------------------------------------------- integrate */

  const nx = s.x + s.vx * dt;
  const nz = s.z + s.vz * dt;
  s.x = nx;
  s.z = nz;
  s.distance += Math.abs(forward) * dt;

  /* ------------------------------------------------------------ collision */

  if (world) {
    resolve(s, world, ctx, fx, fz, rx, rz);
    const target = surf.y ?? 0;
    // ride height eases onto kerbs instead of snapping, and a step up gives a
    // small bump the camera can feel
    const dy = target - s.y;
    if (Math.abs(dy) > 0.005) {
      s.bump = Math.min(1, s.bump + Math.abs(dy) * 2.2 * Math.min(1, spd / 8));
      s.y += dy * Math.min(1, dt * 14);
    } else {
      s.y = target;
    }
    if (surf.rough > 0 && spd > 3) {
      s.bump = Math.min(1, s.bump + surf.rough * dt * Math.min(1.5, spd / 12));
    }
  }
}

const FRONT = 1.25;
const REAR = -1.25;
const R = 1.02;

function resolve(s, world, ctx, fx, fz, rx, rz) {
  let impact = 0;
  let hitSoft = 1;
  for (const off of [FRONT, REAR]) {
    const cx = s.x + fx * off;
    const cz = s.z + fz * off;
    const hit = world.resolveCircle(cx, cz, R);
    if (!hit) continue;
    s.x += hit.px;
    s.z += hit.pz;

    // kill the velocity going into the obstacle, keep what slides along it
    const vn = s.vx * hit.nx + s.vz * hit.nz;
    if (vn < 0) {
      const bounce = 0.12 + hit.soft * 0.15;
      s.vx -= hit.nx * vn * (1 + bounce);
      s.vz -= hit.nz * vn * (1 + bounce);
      impact = Math.max(impact, -vn);
      hitSoft = Math.min(hitSoft, hit.soft);
    }
    // scrubbing along a wall costs speed
    const loss = 1 - Math.min(0.55, hit.depth * (0.5 - hit.soft * 0.32));
    const f = s.vx * fx + s.vz * fz;
    const l = s.vx * rx + s.vz * rz;
    s.speed = f * loss;
    s.lateral = l * loss;
    s.vx = fx * s.speed + rx * s.lateral;
    s.vz = fz * s.speed + rz * s.lateral;
  }
  if (impact > 1.4) {
    s.lastImpact = impact;
    s.bump = Math.min(1.4, s.bump + impact * 0.1);
    ctx.onCollision?.(impact, hitSoft);
  }
}

const DEFAULT_SURFACE = { grip: 1, accel: 1, y: 0.02, rough: 0 };
const NO_WEATHER = { grip: 1, brake: 1 };
const NO_ZONE = { grip: 1, brake: 1 };

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Speed in km/h for the HUD. */
export function kmh(state) {
  return Math.abs(state.speed) * 3.6;
}
