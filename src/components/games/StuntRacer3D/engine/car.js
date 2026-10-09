/**
 * Stunt Racer 3D — the arcade car controller (framework-free, fixed step).
 *
 * GROUND  the car lives in the track's own frame: distance s along it,
 *         lateral offset lat (+ = left), heading psi relative to the track
 *         tangent and a velocity split into vs (along T) and vl (along N).
 *         Gravity is projected onto T and N, so climbs slow you, descents
 *         speed you up and banks hold you — and because the frame follows
 *         the surface, a loop is just more track: the car stays glued while
 *         the normal force   n = ṡ²·kv + g·U.y   is positive (with a grip
 *         assist in loops), and detaches when it is not. Ramps launch
 *         naturally where the road ends at a lip.
 * AIR     plain ballistics in world space with limited steering (air
 *         control) — no free flight, no tumbling. Landing re-projects the
 *         car onto the track; a clean landing keeps the speed.
 * FALL    off the edge / missed landing / fell out of a loop: the car
 *         tumbles out of control until the run respawns it at a checkpoint.
 *
 * Inputs per step: throttle, brake, steer (−1..1, + = left), handbrake,
 * nitro (held). Everything is delta-time based (fixed 120 Hz from the run).
 */
import { G, LOOP_ASSIST, RAIL_H, COAST_C0, COAST_C2, locate, roadAt } from "./track.js";
import { clamp, wrapAngle, approach } from "./util.js";

export const CAR_HW = 1.0; // half width of the body (m)
export const CAR_HL = 2.15; // half length
const REVERSE_MAX = 11;

/** Physics parameters from the four 1..10 stats a car shows in the garage. */
export function paramsFor(stats) {
  const { speed = 5, accel = 5, handling = 5, stability = 5 } = stats;
  return {
    vmax: 34 + speed * 1.4,
    accel: 8 + accel * 1.3,
    yawMax: 1.45 + handling * 0.12,
    grip: 5 + handling * 0.7,
    airCtl: 0.55 + stability * 0.07,
    knock: 1.15 - stability * 0.06, // obstacle knock-back multiplier
    landTol: 0.4 + stability * 0.035, // radians off the flight path a landing tolerates before scrubbing speed
    nitroV: 10,
    nitroA: 14,
    boostV: 8,
  };
}

export function createCar(T, p, s = 10, lat = 0) {
  const car = {
    p,
    mode: "ground",
    s,
    lat,
    psi: 0,
    vs: 0,
    vl: 0,
    x: 0,
    y: 0,
    z: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    h: 0,
    pitch: 0,
    roll: 0,
    fwd: 0,
    side: 0,
    // render basis
    F: { x: 0, y: 0, z: 1 },
    U: { x: 0, y: 1, z: 0 },
    airT: 0,
    hint: Math.floor(s),
    steerVis: 0,
    compress: 0,
    compressV: 0,
    nitro: 0.5,
    nitroOn: false,
    boostT: 0,
    handbrake: false,
    braking: false,
    throttle: 0,
    slip: 0,
    tumble: { x: 0, y: 0, z: 0, ax: 0, ay: 0, az: 0 },
    fallT: 0,
    fallWhy: null,
    inLoop: false,
    ghostT: 0, // obstacle immunity after a respawn
    lastLand: null,
    wheelSpin: 0,
  };
  placeOnTrack(car, T, s, lat, 0);
  return car;
}

/** Puts the car on the road at (s, lat), at rest, facing along the track. */
export function placeOnTrack(car, T, s, lat = 0, speed = 0) {
  car.mode = "ground";
  car.s = s;
  car.lat = lat;
  car.psi = 0;
  car.vs = speed;
  car.vl = 0;
  car.fwd = speed;
  car.side = 0;
  car.slip = 0;
  car.airT = 0;
  car.hint = Math.floor(s);
  car.compress = 0;
  car.compressV = 0;
  car.boostT = 0;
  car.nitroOn = false;
  car.steerVis = 0;
  car.fallT = 0;
  car.fallWhy = null;
  car.inLoop = false;
  car.pitch = 0;
  car.roll = 0;
  car.tumble = { x: 0, y: 0, z: 0, ax: 0, ay: 0, az: 0 };
  syncGround(car, T.frameAt(s));
}

function syncGround(car, f) {
  car.hint = f.i; // keeps the airborne track search anchored where we are
  const c = Math.cos(car.psi);
  const sn = Math.sin(car.psi);
  car.x = f.x + f.nx * car.lat;
  car.y = f.y + f.ny * car.lat;
  car.z = f.z + f.nz * car.lat;
  car.vx = f.tx * car.vs + f.nx * car.vl;
  car.vy = f.ty * car.vs + f.ny * car.vl;
  car.vz = f.tz * car.vs + f.nz * car.vl;
  car.F = { x: f.tx * c + f.nx * sn, y: f.ty * c + f.ny * sn, z: f.tz * c + f.nz * sn };
  car.U = { x: f.ux, y: f.uy, z: f.uz };
  car.h = Math.atan2(car.F.x, car.F.z);
  car.pitch = Math.asin(clamp(car.F.y, -1, 1));
}

/** Detach from the road with the current world velocity. */
function launch(car, why) {
  car.mode = "air";
  car.airT = 0;
  car.launchWhy = why;
  car.launchY = car.y;
  car.airPitch = car.pitch;
  if (why === "ramp" || why === "edge") car.events.push({ type: "takeoff", why, speed: Math.hypot(car.vx, car.vy, car.vz) });
}

function startFall(car, why) {
  car.mode = "fall";
  car.fallT = 0;
  car.fallWhy = why;
  car.nitroOn = false;
  const r = (k) => (Math.sin(car.s * 12.9898 + k * 78.233) * 43758.5453) % 1;
  car.tumble = { x: 0, y: 0, z: 0, ax: 1.6 + Math.abs(r(1)) * 2, ay: (r(2) - 0.5) * 2, az: (r(3) - 0.5) * 3 };
  car.events.push({ type: "fall", why });
}

/**
 * One fixed step. `inp` = { throttle, brake, steer, handbrake, nitro };
 * `env` = { dropped(s) → bool, events: [] }. Pushes events onto car.events.
 */
export function stepCar(car, T, inp, dt, env) {
  car.events = env.events;
  const p = car.p;
  car.ghostT = Math.max(0, car.ghostT - dt);
  car.boostT = Math.max(0, car.boostT - dt);
  // nitro: held, needs fuel; burns ~3 s per full tank
  const wantNitro = !!inp.nitro && car.mode !== "fall";
  if (wantNitro && car.nitro > 0.01) {
    if (!car.nitroOn) car.events.push({ type: "nitroOn" });
    car.nitroOn = true;
    car.nitro = Math.max(0, car.nitro - dt / 3);
    car.nitroUsed = (car.nitroUsed || 0) + dt;
  } else {
    if (car.nitroOn) car.events.push({ type: "nitroOff" });
    car.nitroOn = false;
  }
  const steerIn = clamp(inp.steer || 0, -1, 1);
  const rate = Math.abs(steerIn) > Math.abs(car.steerVis) && Math.sign(steerIn) === Math.sign(car.steerVis || steerIn) ? 4.5 : 8;
  car.steerVis = approach(car.steerVis, steerIn, rate * dt);
  car.handbrake = !!inp.handbrake;
  car.throttle = car.nitroOn ? 1 : inp.throttle || 0;
  car.wheelSpin += (car.mode === "ground" ? car.fwd : car.fwd * 0.98) * dt / 0.36;

  if (car.mode === "ground") stepGround(car, T, inp, dt, env);
  else if (car.mode === "air") stepAir(car, T, inp, dt, env);
  else stepFall(car, T, dt);

  // suspension spring (visual only)
  car.compressV += (-car.compress * 140 - car.compressV * 14) * dt;
  car.compress = clamp(car.compress + car.compressV * dt, -0.25, 0.35);
}

function stepGround(car, T, inp, dt, env) {
  const p = car.p;
  let f = T.frameAt(car.s);
  const f0 = f;
  const s0 = car.s;
  const inLoop = f.a.kind === "loop" || f.b.kind === "loop";
  car.inLoop = inLoop;
  const cps = Math.cos(car.psi);
  const sps = Math.sin(car.psi);
  let fwd = car.vs * cps + car.vl * sps;
  let side = -car.vs * sps + car.vl * cps;

  // --- engine / brakes ------------------------------------------------------------
  const vmaxEff = p.vmax + (car.nitroOn ? p.nitroV : 0) + (car.boostT > 0 ? p.boostV : 0);
  const accelEff = p.accel + (car.nitroOn ? p.nitroA : 0);
  let a = 0;
  car.braking = false;
  if (car.throttle > 0 && !(inp.brake && fwd > 1)) {
    if (fwd < 0) a = 22; // throttle while rolling back = brake first
    else if (fwd < vmaxEff) a = accelEff * car.throttle * (1 - Math.pow(Math.max(0, fwd) / vmaxEff, 2.4) * 0.92);
    else a = -(fwd - vmaxEff) * 1.6;
  } else if (inp.brake) {
    if (fwd > 0.8) {
      a = -27;
      car.braking = true;
    } else if (fwd > -REVERSE_MAX) a = -9;
  } else {
    const drag = COAST_C0 + COAST_C2 * fwd * fwd;
    a = -Math.sign(fwd) * Math.min(drag, Math.abs(fwd) / dt);
  }
  if (car.boostT > 0 && fwd < p.vmax + p.boostV) a = Math.max(a, 24);
  if (fwd > vmaxEff + 0.5 && !car.nitroOn && car.boostT <= 0) a = Math.min(a, -(fwd - vmaxEff) * 1.6);
  if (car.handbrake && Math.abs(fwd) > 1) a -= 6 * Math.sign(fwd);
  // traction needs load: on a loop wall / ceiling the tyres can only push
  // (or brake) as hard as the road presses on them
  if (inLoop && a > 0) {
    const sd0 = car.vs;
    const load = clamp((sd0 * sd0 * f.kv + G * f.uy) / G, 0, 1);
    a *= 0.3 * load; // a loop is climbed on momentum, not on the engine
  }
  fwd += a * dt;

  // --- steering + grip -------------------------------------------------------------
  const av = Math.abs(fwd);
  const steerGain = clamp(av / 5, 0, 1) * (1 - 0.5 * clamp(av / p.vmax, 0, 1.3));
  let yaw = car.steerVis * p.yawMax * steerGain * Math.sign(fwd || 1) * (car.handbrake ? 1.65 : 1);
  if (inLoop) yaw *= 0.25;
  const gripK = p.grip * (car.handbrake ? 0.16 : 1);
  side *= Math.exp(-gripK * dt);
  fwd *= 1 - Math.min(0.6, Math.abs(side) * 0.025) * dt;
  car.slip = side;
  car.fwd = fwd;
  car.side = side;
  car.vs = fwd * cps - side * sps;
  car.vl = fwd * sps + side * cps;

  // --- gravity along the surface, inertia through curves ------------------------------
  car.vs += -G * f.ty * dt;
  if (!inLoop) car.vl += -G * f.ny * dt;
  const sdot = car.vs / Math.max(0.3, 1 - f.kh * car.lat);
  const rot = f.kh * sdot * dt;
  if (!inLoop) {
    // the road turns under the car: its velocity has to be turned by grip
    const vs0 = car.vs;
    car.vs += rot * car.vl;
    car.vl -= rot * vs0;
  }
  car.psi = wrapAngle(car.psi + yaw * dt - rot);
  if (inLoop) {
    // track-constrained: in a loop the car is held straight and centred
    const k = Math.exp(-5 * dt);
    car.psi *= k;
    car.vl *= Math.exp(-3 * dt);
    car.lat += -car.lat * Math.min(1, 0.9 * dt);
  }
  car.s += sdot * dt;
  car.lat += car.vl * dt;

  // --- ends of the course ------------------------------------------------------------
  if (car.s < 1) {
    car.s = 1;
    if (car.vs < 0) car.vs = 0;
  }
  if (car.s > T.L - 2) {
    car.s = T.L - 2;
    if (car.vs > 0) {
      car.vs = -car.vs * 0.15;
      env.events.push({ type: "wall", hard: 1 });
    }
  }

  // --- ran off the end of the road (ramp lip / gap / crumbled tile): launch
  // with the frame we were driving on, so a ramp throws at its own angle
  if (!roadAt(T, car.s, car.lat) || (env.dropped && env.dropped(car.s))) {
    const ds = car.s - s0;
    syncGround(car, f0);
    car.x += f0.tx * ds;
    car.y += f0.ty * ds;
    car.z += f0.tz * ds;
    launch(car, f0.a.kind === "ramp" ? "ramp" : "gap");
    return;
  }
  f = T.frameAt(car.s);
  // --- rails / edges ------------------------------------------------------------------------
  const hw = f.w * 0.5;
  const sideIdx = car.lat >= 0 ? 1 : -1;
  const railed = sideIdx > 0 ? f.a.railL : f.a.railR;
  if (Math.abs(car.lat) > hw - CAR_HW) {
    if (railed || f.a.kind === "loop") {
      car.lat = sideIdx * (hw - CAR_HW);
      const out = car.vl * sideIdx;
      if (out > 0) {
        if (out > 3) env.events.push({ type: "wall", hard: clamp(out / 14, 0.2, 1) });
        car.vl = -sideIdx * out * 0.2;
        car.vs *= 1 - clamp(out / 40, 0, 0.3);
        car.psi *= 0.85;
      }
    }
  }
  // --- adhesion: does the surface still hold the car? --------------------------------------
  const sd = car.vs / Math.max(0.3, 1 - f.kh * car.lat);
  const n = sd * sd * f.kv + G * f.uy;
  const loopNow = f.a.kind === "loop" || f.b.kind === "loop";
  syncGround(car, f);
  // suspension: load above 1 g squats the car
  car.compress += clamp((n / G - 1) * 0.004, -0.01, 0.02);

  if (loopNow && n < -G * LOOP_ASSIST && f.uy < 0.7) {
    startFall(car, "loop");
    return;
  }
  if (!loopNow && n < -2.5 && Math.abs(car.vs) > 4) {
    launch(car, f.a.kind === "ramp" || f.b.kind === "gap" ? "ramp" : "crest");
    return;
  }
  if (Math.abs(car.lat) > hw + 0.25) {
    // drove off an unguarded edge
    car.vx += f.nx * sideIdx * 1.5;
    car.vz += f.nz * sideIdx * 1.5;
    launch(car, "edge");
    return;
  }
}

function stepAir(car, T, inp, dt, env) {
  const p = car.p;
  car.airT += dt;
  car.braking = false;
  // limited air control: turn the car, bend the flight path a little
  const turn = car.steerVis * p.airCtl * dt;
  car.h = wrapAngle(car.h + turn);
  const bend = turn * 0.55;
  const c = Math.cos(bend);
  const s = Math.sin(bend);
  const vx = car.vx * c + car.vz * s;
  const vz = -car.vx * s + car.vz * c;
  car.vx = vx;
  car.vz = vz;
  if (car.nitroOn) {
    car.vx += Math.sin(car.h) * 4 * dt;
    car.vz += Math.cos(car.h) * 4 * dt;
  }
  car.vy -= G * dt;
  const ox = car.x;
  const oy = car.y;
  const oz = car.z;
  car.x += car.vx * dt;
  car.y += car.vy * dt;
  car.z += car.vz * dt;
  const hs = Math.hypot(car.vx, car.vz);
  car.fwd = hs;
  // nose follows the flight path, gently
  const pitchT = clamp(Math.atan2(car.vy, Math.max(4, hs)) * 0.75, -0.6, 0.55);
  car.pitch += (pitchT - car.pitch) * Math.min(1, dt * 2.2);
  car.roll += (-car.steerVis * 0.14 - car.roll) * Math.min(1, dt * 4);
  const cp = Math.cos(car.pitch);
  car.F = { x: Math.sin(car.h) * cp, y: Math.sin(car.pitch), z: Math.cos(car.h) * cp };
  car.U = { x: -Math.sin(car.h) * Math.sin(car.pitch), y: cp, z: -Math.cos(car.h) * Math.sin(car.pitch) };

  const q = locate(T, car.x, car.y, car.z, car.hint, 30, 140);
  car.hint = q.i;
  car.s = q.s;
  car.lat = q.lat;
  const f = q.f;
  const vU = car.vx * f.ux + car.vy * f.uy + car.vz * f.uz;
  const hw = f.w * 0.5;
  const onRoad = roadAt(T, q.s, q.lat) && !(env.dropped && env.dropped(q.s));
  // landing: crossed the surface from above, over drivable road
  if (onRoad && car.airT > 0.05 && q.h <= 0.02 && q.h > -2.2 + Math.min(0, vU * dt * 2) && vU < 0.5) {
    if (f.uy < 0.3) {
      startFall(car, "flip");
      return;
    }
    land(car, T, q, vU, env);
    return;
  }
  // under a deck going up → bounce off its underside
  if (onRoad && q.h < 0 && q.h > -3 && vU > 0) {
    car.vx -= f.ux * vU * 1.3;
    car.vy -= f.uy * vU * 1.3;
    car.vz -= f.uz * vU * 1.3;
  }
  // rails catch a low car that drifts across them
  if (q.h > -0.6 && q.h < RAIL_H + 0.3 && Math.abs(q.lat) > hw - CAR_HW && Math.abs(q.lat) < hw + 0.8) {
    const side = q.lat >= 0 ? 1 : -1;
    const railed = side > 0 ? f.a.railL : f.a.railR;
    const vN = car.vx * f.nx + car.vy * f.ny + car.vz * f.nz;
    if (railed && f.a.road && vN * side > 0) {
      car.vx -= f.nx * vN * 1.25;
      car.vy -= f.ny * vN * 1.25;
      car.vz -= f.nz * vN * 1.25;
      car.x = ox;
      car.y = oy;
      car.z = oz;
      env.events.push({ type: "wall", hard: clamp(Math.abs(vN) / 14, 0.2, 1) });
    }
  }
  // falling: well below the road, or out to the side of it and dropping
  const below = f.y - car.y;
  if ((below > 9 && (Math.abs(q.lat) > hw + 0.5 || q.h < -2.5)) || below > 22 || car.airT > 7 || car.y < T.minY - 50) {
    startFall(car, "fell");
  }
}

function land(car, T, q, vU, env) {
  const f = q.f;
  const vT = car.vx * f.tx + car.vy * f.ty + car.vz * f.tz;
  const vN = car.vx * f.nx + car.vy * f.ny + car.vz * f.nz;
  const fx = Math.sin(car.h);
  const fz = Math.cos(car.h);
  const ft = fx * f.tx + fz * f.tz;
  const fn = fx * f.nx + fz * f.nz;
  car.mode = "ground";
  car.s = q.s;
  car.lat = q.lat;
  car.psi = Math.atan2(fn, ft);
  car.vs = vT;
  car.vl = vN;
  const impact = Math.max(0, -vU);
  const travel = Math.hypot(vT, vN) > 4 ? Math.atan2(vN, vT) : car.psi;
  const sideways = Math.abs(wrapAngle(car.psi - travel));
  const airT = car.airT;
  let quality = "ok";
  if (sideways > car.p.landTol) {
    // sideways landing: scrub a lot of speed, straighten up a bit
    car.vs *= 0.55;
    car.vl *= 0.35;
    car.psi *= 0.6;
    quality = "sketchy";
  } else if (Math.abs(car.psi) < 0.38 && sideways < 0.38 && airT > 0.45) quality = "clean";
  car.compressV -= Math.min(6, impact * 0.32);
  car.airT = 0;
  car.lastLand = { airT, impact, quality };
  env.events.push({ type: "land", airT, impact, quality, hard: clamp(impact / 16, 0, 1), why: car.launchWhy, tiny: airT < 0.18 });
  syncGround(car, T.frameAt(car.s));
}

function stepFall(car, T, dt) {
  car.fallT += dt;
  car.vy -= G * dt;
  car.vx *= 1 - 0.3 * dt;
  car.vz *= 1 - 0.3 * dt;
  car.x += car.vx * dt;
  car.y += car.vy * dt;
  car.z += car.vz * dt;
  const tb = car.tumble;
  tb.x += tb.ax * dt;
  tb.y += tb.ay * dt;
  tb.z += tb.az * dt;
  car.fwd = Math.hypot(car.vx, car.vz);
}

/** Speed shown on the HUD (km/h). */
export const kmh = (car) => Math.round(Math.abs(car.mode === "ground" ? car.fwd : Math.hypot(car.vx, car.vy, car.vz)) * 3.6);
