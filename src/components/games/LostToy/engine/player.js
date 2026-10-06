/**
 * Lost Toy — the toy's kinematic character controller.
 *
 * Pure JS (no Three, no DOM). One central state machine; every transition goes
 * through `setState`, so two movement modes can never be active together
 * (push + jump, ride + ledge grab, respawn + move, finished + fall …).
 *
 * Collider: a vertical cylinder (radius R, height HEIGHT) with the position at
 * the FEET. Movement is integrated in sub-steps that never exceed
 * MAX_SUBSTEP_MOVE, so even a long fall can't tunnel through a thin shelf:
 * the cylinder centre never gets inside a box, and resolution always pushes
 * it back out of the side it came from.
 *
 * Per sub-step:  horizontal move → push out of walls (records wall contacts)
 *                vertical move   → land on tops / bonk on ceilings
 *                ground probe    → step up rug edges, follow the ground, detect edges
 *
 * Inputs (already camera-relative, see world.js):
 *   { mx, mz, mag, sprint, jumpPressed, jumpHeld, interactPressed }
 */
import { STATES as S } from "./config.js";
import { queryRect, rectClosest, cylinderBlocked, groundBelow } from "./collision.js";

const SUPPORT = 0.78; // fraction of the radius that must be over a top to stand on it
const AIR_EDGE = 0.08; // tops this close above the feet are "landable", not walls
const tmp = [0, 0];

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const wrapAngle = (a) => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};

export function createPlayer(spawn) {
  return {
    x: spawn.x,
    y: spawn.y,
    z: spawn.z,
    vx: 0,
    vy: 0,
    vz: 0,
    yaw: spawn.yaw || 0,
    state: S.GROUND,
    stateT: 0,
    prevState: S.GROUND,
    grounded: true,
    groundBox: null,
    groundMat: "wood",
    airT: 0,
    leftBy: "none", // jump | walk | bounce | ledge | climb | knock
    coyote: 0,
    jumpBuffer: 0,
    jumpHeld: false,
    interactBuffer: 0,
    ledge: null,
    climb: null,
    push: null,
    pushLean: 0,
    pushBox: null,
    landT: 0,
    landHard: false,
    lastImpact: 0,
    stumbleT: 0,
    hurtT: 0,
    stride: 0, // gait cycle phase (two steps per cycle), driven by distance
    peakY: spawn.y,
    speedH: 0,
    sprinting: false,
    balance: false,
    riding: false,
    rideBox: null,
    inShallow: false,
    walls: [], // wall contacts from the last sub-step (box, nx, nz)
    finished: false,
    idleT: 0,
  };
}

/* ======================================================================== helpers */

function ev(W, type, data) {
  W.events.push(data ? { type, ...data } : { type });
}

export function setState(P, W, next) {
  if (P.state === next) return;
  P.prevState = P.state;
  P.state = next;
  P.stateT = 0;
  if (next !== S.PUSH) {
    P.push = null;
  }
  if (next !== S.LEDGE) P.ledge = null;
  if (next !== S.CLIMB) P.climb = null;
}

export function fitsAt(P, W, x = P.x, y = P.y, z = P.z) {
  return !cylinderBlocked(W.C, x, y, z, W.T.RADIUS, W.T.HEIGHT);
}

function horizSpeed(P) {
  return Math.hypot(P.vx, P.vz);
}

function moveTowards2(P, tx, tz, maxDelta) {
  const dx = tx - P.vx;
  const dz = tz - P.vz;
  const d = Math.hypot(dx, dz);
  if (d <= maxDelta || d < 1e-6) {
    P.vx = tx;
    P.vz = tz;
  } else {
    P.vx += (dx / d) * maxDelta;
    P.vz += (dz / d) * maxDelta;
  }
}

function faceTowards(P, dx, dz, rate, dt) {
  if (dx * dx + dz * dz < 1e-4) return;
  const target = Math.atan2(dx, dz);
  const d = wrapAngle(target - P.yaw);
  P.yaw = wrapAngle(P.yaw + d * (1 - Math.exp(-rate * dt)));
}

/**
 * Gait: one cycle = two steps. MUST match three/toy.js (strideLength) so the
 * planted foot moves exactly with the ground — no foot sliding.
 */
export function strideLength(speed) {
  return 0.5 + Math.min(speed, 5) * 0.11;
}
function advanceStride(P, W, moved, speed, mat) {
  if (moved <= 0) return;
  const before = P.stride;
  P.stride += moved / strideLength(speed);
  const a = Math.floor(before * 2);
  const b = Math.floor(P.stride * 2);
  if (b !== a) ev(W, "step", { sprint: P.sprinting, mat: mat || P.groundMat, foot: b & 1, speed, x: P.x, y: P.y, z: P.z });
  if (P.stride > 1000) P.stride -= 1000;
}

/* ======================================================================== collision core */

/**
 * Move by (vx,vy,vz)·dt in safe sub-steps. Mode:
 *  ground — no vertical integration; follows the ground (step up / step down)
 *  air    — vertical integration with landing / ceiling
 * Returns a small result record (reused object).
 */
const RES = { landed: false, landVy: 0, bonked: false, leftGround: false, blocked: false, moved: 0, landBox: null };

function supportRadius(P, W, b) {
  const R = W.T.RADIUS * SUPPORT;
  return b && b.dynamic ? R + (W.T.ASSIST_LAND || 0) + 0.04 : R;
}

function moveAndCollide(P, W, dt, mode, ox = 0, oz = 0) {
  const T = W.T;
  const C = W.C;
  const R = T.RADIUS;
  RES.landed = false;
  RES.landVy = 0;
  RES.bonked = false;
  RES.leftGround = false;
  RES.blocked = false;
  RES.moved = 0;
  RES.landBox = null;
  P.walls.length = 0;

  // ox/oz: extra displacement this step (conveyor belts) — not part of the toy's own velocity
  const dx = P.vx * dt + ox;
  const dz = P.vz * dt + oz;
  const dy = mode === "air" ? P.vy * dt : 0;
  const dist = Math.max(Math.hypot(dx, dz), Math.abs(dy));
  const n = Math.max(1, Math.ceil(dist / T.MAX_SUBSTEP_MOVE));
  const sx = dx / n;
  const sz = dz / n;
  const sy = dy / n;

  for (let i = 0; i < n; i++) {
    const px = P.x;
    const pz = P.z;
    P.x += sx;
    P.z += sz;
    resolveHorizontal(P, W, mode === "ground" ? T.STEP_UP : AIR_EDGE);
    RES.moved += Math.hypot(P.x - px, P.z - pz);

    if (mode === "air") {
      const oldY = P.y;
      P.y += sy;
      if (sy < 0) {
        // landing: highest top crossed this sub-step under the support circle
        const list = queryRect(C, P.x - R, P.z - R, P.x + R, P.z + R);
        let best = null;
        for (let k = 0; k < list.length; k++) {
          const b = list[k];
          if (!b.solid) continue;
          const top = b.max[1];
          if (top > oldY + AIR_EDGE || top < P.y - 1e-4) continue;
          if (b.min[1] > top - 0.01) continue;
          const sr = supportRadius(P, W, b);
          if (rectClosest(b, P.x, P.z, tmp) >= sr * sr) continue;
          if (!best || top > best.max[1]) best = b;
        }
        if (best) {
          P.y = best.max[1];
          RES.landed = true;
          RES.landVy = P.vy;
          RES.landBox = best;
          P.vy = 0;
          break;
        }
      } else if (sy > 0) {
        const head = oldY + T.HEIGHT;
        const list = queryRect(C, P.x - R, P.z - R, P.x + R, P.z + R);
        const rr = (R - 0.04) * (R - 0.04);
        let low = Infinity;
        for (let k = 0; k < list.length; k++) {
          const b = list[k];
          if (!b.solid) continue;
          const bot = b.min[1];
          if (bot < head - 0.05 || bot > P.y + T.HEIGHT) continue;
          if (rectClosest(b, P.x, P.z, tmp) >= rr) continue;
          if (bot < low) low = bot;
        }
        if (low !== Infinity) {
          P.y = low - T.HEIGHT;
          P.vy = 0;
          RES.bonked = true;
        }
      }
    } else if (mode === "ground") {
      const g = groundBelow(C, P.x, P.y, P.z, supportRadius(P, W, P.groundBox), 0.2, T.STEP_UP + 0.001);
      if (g) {
        if (g.max[1] > P.y + 0.001 && cylinderBlocked(C, P.x, g.max[1], P.z, R * 0.92, T.HEIGHT, g)) {
          // stepping up would put our head into something: stay put
          P.x = px;
          P.z = pz;
          RES.blocked = true;
          continue;
        }
        P.y = g.max[1];
        P.groundBox = g;
      } else {
        RES.leftGround = true;
        P.groundBox = null;
        break;
      }
    }
  }
  return RES;
}

const NX = [0, 0];
function resolveHorizontal(P, W, edgeAllowance) {
  const C = W.C;
  const R = P.state === S.LEDGE || P.state === S.CLIMB ? W.T.RADIUS * 0.9 : W.T.RADIUS;
  const feet = P.y + edgeAllowance;
  const head = P.y + W.T.HEIGHT - 0.02;
  for (let iter = 0; iter < 3; iter++) {
    const list = queryRect(C, P.x - R, P.z - R, P.x + R, P.z + R);
    let pushed = false;
    for (let k = 0; k < list.length; k++) {
      const b = list[k];
      if (!b.solid) continue;
      if (b.max[1] <= feet || b.min[1] >= head) continue;
      const d2 = rectClosest(b, P.x, P.z, NX);
      if (d2 >= R * R) continue;
      let nx;
      let nz;
      let pen;
      if (d2 > 1e-10) {
        const d = Math.sqrt(d2);
        nx = (P.x - NX[0]) / d;
        nz = (P.z - NX[1]) / d;
        pen = R - d;
      } else {
        // centre inside the footprint (only possible after a mover push) → shortest exit
        const ex = [P.x - b.min[0], b.max[0] - P.x, P.z - b.min[2], b.max[2] - P.z];
        let m = 0;
        for (let q = 1; q < 4; q++) if (ex[q] < ex[m]) m = q;
        nx = m === 0 ? -1 : m === 1 ? 1 : 0;
        nz = m === 2 ? -1 : m === 3 ? 1 : 0;
        pen = ex[m] + R;
      }
      P.x += nx * (pen + 1e-4);
      P.z += nz * (pen + 1e-4);
      const vn = P.vx * nx + P.vz * nz;
      if (vn < 0) {
        P.vx -= vn * nx;
        P.vz -= vn * nz;
        if (-vn > 1) RES.blocked = true;
      }
      if (P.walls.length < 6) P.walls.push({ box: b, nx, nz });
      pushed = true;
    }
    if (!pushed) break;
  }
}

/* ======================================================================== transitions */

function landOn(P, W, landVy, box) {
  const T = W.T;
  const impact = -landVy;
  const fallH = P.peakY - P.y;
  P.groundBox = box;
  P.groundMat = (box && box.mat) || "wood";
  P.airT = 0;
  P.lastImpact = impact;

  // soft surfaces send you back up (fixed launch speed — it can never accumulate)
  if (box && box.bounce > 0 && impact >= T.BOUNCE_MIN_IMPACT) {
    const held = P.keyJumpHeld || P.jumpBuffer > 0;
    // held: the full, fixed launch (never grows). loose: decays with each landing so the toy settles.
    P.vy = held ? box.bounce * T.BOUNCE_HELD_MULT : Math.min(box.bounce * T.BOUNCE_LOOSE_MULT, impact * T.BOUNCE_DECAY);
    P.jumpBuffer = 0;
    P.coyote = 0;
    P.grounded = false;
    P.groundBox = null;
    P.leftBy = "bounce";
    P.peakY = P.y;
    P.landT = 0;
    if (box.dynamic) {
      P.vx += box.vel[0];
      P.vz += box.vel[2];
    }
    setState(P, W, S.AIR);
    ev(W, "bounce", { box: box.id, held, strength: P.vy, x: P.x, y: P.y, z: P.z, mat: P.groundMat });
    return;
  }

  P.grounded = true;
  const hard = impact >= T.HARD_LAND_VEL;
  P.landHard = hard;
  P.landT = hard ? T.HARD_LAND_TIME : T.SOFT_LAND_TIME;
  if (hard) {
    P.vx *= T.HARD_LAND_SPEED_MULT;
    P.vz *= T.HARD_LAND_SPEED_MULT;
  }
  setState(P, W, S.GROUND);
  ev(W, "land", { hard, impact, fallH, mat: P.groundMat, x: P.x, y: P.y, z: P.z, box: box ? box.id : 0 });
  // jump buffer: pressed shortly before touching down → jump now
  if (P.jumpBuffer > 0 && fitsAt(P, W)) doJump(P, W);
}

function leaveGround(P, W, by) {
  P.grounded = false;
  P.groundBox = null;
  P.leftBy = by;
  P.airT = 0;
  P.peakY = P.y;
  P.airMax = Math.max(horizSpeed(P), W.T.AIR_MAX_GAIN);
  P.coyote = by === "walk" ? W.T.COYOTE : 0;
  P.riding = false;
  P.balance = false;
}

function doJump(P, W) {
  const T = W.T;
  const gb = P.groundBox;
  const sp = horizSpeed(P);
  let vy = T.JUMP_VEL + T.JUMP_SPRINT_BONUS * clamp(sp / T.SPRINT_SPEED, 0, 1);
  if (gb && gb.bounce > 0) vy *= T.BOUNCE_JUMP_MULT;
  P.vy = vy;
  // keep the platform's motion so jumping off a toy car isn't a yank backwards
  // (added ONCE here; while riding the carry is positional, never velocity → no doubling)
  if (gb && gb.dynamic) {
    P.vx += gb.vel[0];
    P.vz += gb.vel[2];
    if (gb.vel[1] > 0) P.vy += gb.vel[1];
  }
  P.jumpBuffer = 0;
  P.coyote = 0;
  P.jumpHeld = true;
  leaveGround(P, W, "jump");
  P.airMax = Math.max(horizSpeed(P), T.AIR_MAX_GAIN);
  setState(P, W, S.AIR);
  ev(W, "jump", { sprint: P.sprinting, x: P.x, y: P.y, z: P.z, soft: !!(gb && gb.bounce) });
}

/** knockback from a pet / bump: horizontal push + small hop; controls off briefly */
export function knock(P, W, nx, nz, strength = 1) {
  if (P.state === S.FINISHED || P.state === S.FALLING_OUT || P.state === S.RESPAWN || P.state === S.HURT) return false;
  const T = W.T;
  P.vx = nx * T.KNOCKBACK * strength;
  P.vz = nz * T.KNOCKBACK * strength;
  P.vy = 3.2 * strength;
  if (P.grounded) leaveGround(P, W, "knock");
  P.grounded = false;
  P.groundBox = null;
  P.stumbleT = T.STUMBLE_TIME;
  P.leftBy = "knock";
  setState(P, W, S.STUMBLE);
  ev(W, "stumble", { x: P.x, y: P.y, z: P.z });
  return true;
}

/** a hazard got the toy: short "oops" reaction, then the world fades + respawns */
export function hurt(P, W, nx, nz, kind) {
  if (P.state === S.FINISHED || P.state === S.FALLING_OUT || P.state === S.RESPAWN || P.state === S.HURT) return false;
  P.vx = nx * 1.6;
  P.vz = nz * 1.6;
  P.vy = 3.4;
  P.grounded = false;
  P.groundBox = null;
  P.hurtT = 0;
  setState(P, W, S.HURT);
  ev(W, "hurt", { kind, x: P.x, y: P.y, z: P.z });
  return true;
}

/* ======================================================================== detection */

/** First solid box face hit going from the player's centre along (dx,dz). */
function probeFace(P, W, dx, dz, maxT, yLo, yHi, filter) {
  const C = W.C;
  const ex = P.x + dx * maxT;
  const ez = P.z + dz * maxT;
  const list = queryRect(C, Math.min(P.x, ex) - 0.05, Math.min(P.z, ez) - 0.05, Math.max(P.x, ex) + 0.05, Math.max(P.z, ez) + 0.05);
  let best = null;
  let bestT = maxT;
  let bestNx = 0;
  let bestNz = 0;
  for (let k = 0; k < list.length; k++) {
    const b = list[k];
    if (!b.solid) continue;
    if (filter && !filter(b)) continue;
    if (b.max[1] <= yLo || b.min[1] >= yHi) continue;
    let t0 = -Infinity;
    let t1 = Infinity;
    let nx = 0;
    let nz = 0;
    let ok = true;
    for (let a = 0; a < 2 && ok; a++) {
      const o = a === 0 ? P.x : P.z;
      const d = a === 0 ? dx : dz;
      const lo = a === 0 ? b.min[0] : b.min[2];
      const hi = a === 0 ? b.max[0] : b.max[2];
      if (Math.abs(d) < 1e-9) {
        if (o <= lo || o >= hi) ok = false;
      } else {
        let ta = (lo - o) / d;
        let tb = (hi - o) / d;
        let sign = -1;
        if (ta > tb) {
          const t = ta;
          ta = tb;
          tb = t;
          sign = 1;
        }
        if (ta > t0) {
          t0 = ta;
          nx = a === 0 ? sign : 0;
          nz = a === 1 ? sign : 0;
        }
        if (tb < t1) t1 = tb;
        if (t0 > t1) ok = false;
      }
    }
    if (!ok || t0 < 0 || t0 > bestT) continue;
    best = b;
    bestT = t0;
    bestNx = nx;
    bestNz = nz;
  }
  // also catch faces the centre ray misses but the cylinder body touches
  if (!best) {
    for (let i = 0; i < P.walls.length; i++) {
      const w = P.walls[i];
      const b = w.box;
      if (filter && !filter(b)) continue;
      if (b.max[1] <= yLo || b.min[1] >= yHi) continue;
      if (-(w.nx * dx + w.nz * dz) < 0.75) continue;
      // contact normals from a corner are diagonal; snap to the dominant face
      const ax = Math.abs(w.nx) >= Math.abs(w.nz);
      best = b;
      bestT = W.T.RADIUS;
      bestNx = ax ? Math.sign(w.nx) : 0;
      bestNz = ax ? 0 : Math.sign(w.nz);
      break;
    }
  }
  if (!best) return null;
  return { box: best, t: bestT, nx: bestNx, nz: bestNz };
}

function faceSpan(b, nx) {
  return nx !== 0 ? [b.min[2], b.max[2]] : [b.min[0], b.max[0]];
}

function tryLedge(P, W, I) {
  const T = W.T;
  const R = T.RADIUS;
  if (P.vy > 2.2) return false;
  if (P.leftBy === "ledge" && P.airT < 0.25) return false;
  let dx;
  let dz;
  if (I.mag > 0.3) {
    dx = I.mx / I.mag;
    dz = I.mz / I.mag;
  } else {
    const sp = horizSpeed(P);
    if (sp < 0.8) return false;
    dx = P.vx / sp;
    dz = P.vz / sp;
  }
  const hit = probeFace(P, W, dx, dz, R + T.LEDGE_REACH, P.y + 0.12, P.y + T.HEIGHT + T.LEDGE_MAX);
  if (!hit) return false;
  const b = hit.box;
  if (b.noLedge || (b.dynamic && b.kind !== "pushable") || !b.solid || b.bounce > 0) return false;
  if (b.kind === "pushable" && W.pushables[b.pushIndex] && W.pushables[b.pushIndex].falling) return false;
  const top = b.max[1];
  const rel = top - P.y;
  // a near miss just below the lip = quick mantle (no hang)
  const mantle = rel >= T.MANTLE_MIN && rel < T.LEDGE_MIN && P.vy <= 0.6;
  if ((rel < T.LEDGE_MIN && !mantle) || rel > T.LEDGE_MAX) return false;
  // a lip needs some body: decorative slivers are not grabbable
  if (b.max[1] - b.min[1] < 0.12) return false;
  if (-(dx * hit.nx + dz * hit.nz) < 0.55) return false;
  const span = faceSpan(b, hit.nx);
  const lat = hit.nx !== 0 ? P.z : P.x;
  if (lat < span[0] + 0.1 || lat > span[1] - 0.1) return false;
  // standing room on top just past the edge (also rejects the underside of overhangs:
  // anything sitting on that top would block it)
  const inX = hit.nx !== 0 ? (hit.nx > 0 ? b.max[0] : b.min[0]) - hit.nx * (R + 0.1) : P.x;
  const inZ = hit.nz !== 0 ? (hit.nz > 0 ? b.max[2] : b.min[2]) - hit.nz * (R + 0.1) : P.z;
  if (cylinderBlocked(W.C, inX, top + 0.02, inZ, R, T.HEIGHT)) return false;
  // the top must actually be a surface we can stand on at that point
  const onTop = groundBelow(W.C, inX, top + 0.01, inZ, R * SUPPORT, 0.05, 0.02);
  if (!onTop || Math.abs(onTop.max[1] - top) > 0.03) return false;
  // nothing overhead between the toy and the lip (no grabbing through a shelf above)
  if (top + 0.3 - P.y > 0.05 && cylinderBlocked(W.C, P.x, P.y + 0.05, P.z, R * 0.85, top + 0.3 - P.y, b)) return false;
  // hang position: pressed against the face, hands at the lip
  const faceX = hit.nx !== 0 ? (hit.nx > 0 ? b.max[0] : b.min[0]) + hit.nx * (R + 0.03) : P.x;
  const faceZ = hit.nz !== 0 ? (hit.nz > 0 ? b.max[2] : b.min[2]) + hit.nz * (R + 0.03) : P.z;
  P.ledge = {
    phase: mantle ? "climb" : "hang",
    mantle,
    t: 0,
    x0: faceX,
    y0: mantle ? P.y : top - 1.08,
    z0: faceZ,
    x1: inX,
    y1: top + 0.01,
    z1: inZ,
    nx: hit.nx,
    nz: hit.nz,
    top,
    box: b,
    fromX: P.x,
    fromY: P.y,
    fromZ: P.z,
  };
  P.vx = 0;
  P.vy = 0;
  P.vz = 0;
  P.yaw = Math.atan2(-hit.nx, -hit.nz);
  const L = P.ledge;
  setState(P, W, S.LEDGE);
  P.ledge = L;
  // a real save = caught a lip we were falling past, not a hop-up
  ev(W, "ledge", { x: P.x, y: P.y, z: P.z, mantle, save: !mantle && P.airT > 0.2 });
  if (mantle) ev(W, "pullup", { x: P.x, y: P.y, z: P.z, mantle: true });
  return true;
}

function tryClimb(P, W, I) {
  const T = W.T;
  const R = T.RADIUS;
  if (I.mag < 0.35) return false;
  if (P.leftBy === "climb" && P.airT < 0.3) return false;
  const dx = I.mx / I.mag;
  const dz = I.mz / I.mag;
  const hit = probeFace(P, W, dx, dz, R + T.CLIMB_REACH, P.y + 0.2, P.y + T.HEIGHT - 0.1, (b) => b.climb);
  if (!hit) return false;
  if (-(dx * hit.nx + dz * hit.nz) < 0.6) return false;
  const b = hit.box;
  if (b.max[1] - P.y < 0.5) return false; // that's a ledge, not a wall
  const span = faceSpan(b, hit.nx);
  const lat = hit.nx !== 0 ? P.z : P.x;
  if (lat < span[0] + 0.12 || lat > span[1] - 0.12) return false;
  const plane = hit.nx !== 0 ? (hit.nx > 0 ? b.max[0] : b.min[0]) : hit.nz > 0 ? b.max[2] : b.min[2];
  const C = { box: b, nx: hit.nx, nz: hit.nz, plane, span };
  setState(P, W, S.CLIMB);
  P.climb = C;
  P.vx = P.vy = P.vz = 0;
  P.grounded = false;
  P.groundBox = null;
  P.yaw = Math.atan2(-hit.nx, -hit.nz);
  pinToFace(P, W, C);
  ev(W, "climbStart", { x: P.x, y: P.y, z: P.z, mat: b.mat });
  return true;
}

function pinToFace(P, W, c) {
  const R = W.T.RADIUS;
  if (c.nx !== 0) P.x = c.plane + c.nx * (R + 0.02);
  else P.z = c.plane + c.nz * (R + 0.02);
}

/** a pushable block the toy is leaning into (from the last collision pass) */
function pushContact(P, W, I) {
  if (I.mag < 0.5) return null;
  const dx = I.mx / I.mag;
  const dz = I.mz / I.mag;
  for (let i = 0; i < P.walls.length; i++) {
    const w = P.walls[i];
    const b = w.box;
    if (!b.pushable) continue;
    // pushing roughly straight at one face, along an axis the block can move on
    const ax = Math.abs(w.nx) >= Math.abs(w.nz);
    const nx = ax ? Math.sign(w.nx) : 0;
    const nz = ax ? 0 : Math.sign(w.nz);
    if (-(dx * nx + dz * nz) < 0.72) continue;
    const pb = W.pushables[b.pushIndex];
    if (!pb) continue;
    if (pb.axis === "x" && nx === 0) continue;
    if (pb.axis === "z" && nz === 0) continue;
    // only from beside it (not from on top / below)
    if (P.y > b.max[1] - 0.15 || P.y + W.T.HEIGHT < b.min[1] + 0.1) continue;
    return { box: b, pb, nx, nz };
  }
  return null;
}

/* ======================================================================== per-state steps */

function groundStep(P, W, I, dt) {
  const T = W.T;
  P.grounded = true;
  P.airT = 0;
  P.coyote = T.COYOTE;
  if (P.landT > 0) P.landT -= dt;

  if (P.jumpBuffer > 0 && fitsAt(P, W)) {
    doJump(P, W);
    return airStep(P, W, I, dt, true);
  }

  const gb = P.groundBox;
  const slip = !!(gb && gb.slip);
  // narrow beams (pencil, ruler, rail): balancing — slower, wobbly, never a fail state
  P.balance = !!(gb && !gb.dynamic && (gb.max[0] - gb.min[0] < T.BALANCE_WIDTH || gb.max[2] - gb.min[2] < T.BALANCE_WIDTH));
  P.riding = !!(gb && gb.dynamic && gb.kind === "mover");

  // desired velocity
  const mag = I.mag;
  let target = 0;
  let dirX = 0;
  let dirZ = 0;
  if (mag > 0.05) {
    dirX = I.mx / mag;
    dirZ = I.mz / mag;
    const runT = clamp((mag - 0.35) / 0.4, 0, 1);
    target = lerp(T.WALK_SPEED, T.RUN_SPEED, runT);
    P.sprinting = I.sprint && mag >= T.SPRINT_MIN_INPUT && !P.balance;
    if (P.sprinting) target = T.SPRINT_SPEED;
    if (P.landT > 0 && P.landHard) target *= T.HARD_LAND_SPEED_MULT;
    if (P.balance) target *= T.BALANCE_SPEED_MULT;
    if (P.inShallow) target *= T.SHALLOW_WATER_MULT;
  } else {
    P.sprinting = false;
  }
  const tx = dirX * target;
  const tz = dirZ * target;
  const sp = horizSpeed(P);
  const dot = P.vx * tx + P.vz * tz;
  let accel;
  if (target < 0.01) accel = T.GROUND_DECEL;
  else if (dot < 0) accel = T.TURN_DECEL;
  else if (target > sp) accel = sp > T.RUN_SPEED - 0.2 ? T.SPRINT_ACCEL : T.GROUND_ACCEL;
  else accel = T.GROUND_DECEL * 0.6;
  if (slip) accel *= T.SLIP_ACCEL_MULT;
  moveTowards2(P, tx, tz, accel * dt);
  P.vy = 0;

  // conveyor belts carry by displacement (never folded into the toy's velocity)
  const cvx = gb && gb.conveyor ? gb.conveyor[0] * dt : 0;
  const cvz = gb && gb.conveyor ? gb.conveyor[1] * dt : 0;
  const res = moveAndCollide(P, W, dt, "ground", cvx, cvz);
  P.speedH = horizSpeed(P);
  if (P.speedH > 0.3) faceTowards(P, P.vx, P.vz, T.ROT_SPEED, dt);
  else if (mag > 0.05) faceTowards(P, dirX, dirZ, T.ROT_SPEED * 0.6, dt);
  if (P.groundBox) P.groundMat = P.groundBox.mat || "wood";
  advanceStride(P, W, Math.min(res.moved, P.speedH * dt + 1e-4), P.speedH);
  if (P.speedH < 0.1 && mag < 0.05) P.idleT += dt;
  else P.idleT = 0;

  if (res.leftGround) {
    leaveGround(P, W, "walk");
    setState(P, W, S.AIR);
    return;
  }

  // leaning into a pushable block → start pushing after a short beat
  const pc = pushContact(P, W, I);
  if (pc && !P.balance) {
    if (P.pushBox !== pc.box) {
      P.pushBox = pc.box;
      P.pushLean = 0;
    }
    P.pushLean += dt;
    if (P.pushLean >= T.PUSH_DELAY) {
      setState(P, W, S.PUSH);
      P.push = { box: pc.box, pb: pc.pb, nx: pc.nx, nz: pc.nz, moved: 0, blocked: false };
      P.pushLean = 0;
      P.yaw = Math.atan2(-pc.nx, -pc.nz);
      ev(W, "pushStart", { x: P.x, y: P.y, z: P.z });
    }
  } else {
    P.pushBox = null;
    P.pushLean = 0;
  }
}

function pushStep(P, W, I, dt) {
  const T = W.T;
  const pu = P.push;
  P.grounded = true;
  P.sprinting = false;
  P.coyote = T.COYOTE;
  const into = I.mag > 0.05 ? -(I.mx * pu.nx + I.mz * pu.nz) / Math.max(I.mag, 1e-6) : 0;
  // jumping or letting go ends the push first (never PUSH + JUMP together)
  if (P.jumpBuffer > 0 || into < 0.5 || I.mag < 0.3) {
    setState(P, W, S.GROUND);
    ev(W, "pushEnd", { moved: pu.moved });
    return groundStep(P, W, I, dt);
  }
  const speed = T.PUSH_SPEED * clamp(I.mag, 0.4, 1);
  const ddx = -pu.nx * speed * dt;
  const ddz = -pu.nz * speed * dt;
  // the world moves the block first (it clamps to its rail, stops at walls)
  const moved = W.movePushable(pu.pb, ddx, ddz);
  pu.blocked = moved < Math.hypot(ddx, ddz) * 0.5;
  pu.moved += moved;
  P.vx = moved > 0 ? (-pu.nx * moved) / dt : 0;
  P.vz = moved > 0 ? (-pu.nz * moved) / dt : 0;
  const res = moveAndCollide(P, W, dt, "ground");
  P.speedH = horizSpeed(P);
  advanceStride(P, W, res.moved, Math.max(P.speedH, 1.2));
  P.yaw = Math.atan2(-pu.nx, -pu.nz);
  if (res.leftGround) {
    leaveGround(P, W, "walk");
    setState(P, W, S.AIR);
    return;
  }
  // lost contact (block slid away from us / fell off its edge)
  const b = pu.box;
  const R = T.RADIUS;
  const d2 = rectClosest(b, P.x, P.z, tmp);
  if (d2 > (R + 0.08) * (R + 0.08) || !b.active) {
    setState(P, W, S.GROUND);
    ev(W, "pushEnd", { moved: pu.moved });
  }
}

function airStep(P, W, I, dt, justJumped = false) {
  const T = W.T;
  P.grounded = false;
  P.airT += dt;
  P.riding = false;
  P.balance = false;
  if (P.coyote > 0) P.coyote -= dt;
  if (!I.jumpHeld) P.jumpHeld = false;

  // coyote jump (only after walking off an edge — never a second jump in the air)
  if (!justJumped && P.jumpBuffer > 0 && P.coyote > 0 && P.leftBy === "walk" && fitsAt(P, W)) {
    doJump(P, W);
    ev(W, "coyote");
  }

  // air control
  const mag = I.mag;
  if (mag > 0.05) {
    const dX = I.mx / mag;
    const dZ = I.mz / mag;
    const cap = Math.max(P.airMax || 0, T.AIR_MAX_GAIN);
    moveTowards2(P, dX * cap * Math.min(1, mag * 1.2), dZ * cap * Math.min(1, mag * 1.2), T.AIR_ACCEL * dt);
  } else {
    const k = 1 - T.AIR_DRAG * dt;
    P.vx *= k;
    P.vz *= k;
  }
  // gravity (heavier falling; extra while rising after an early release = variable jump)
  let g = T.GRAVITY;
  if (P.vy < 0) g *= T.FALL_MULT;
  else if (!P.jumpHeld && P.leftBy === "jump") g *= T.JUMP_CUT_MULT;
  P.vy = Math.max(P.vy - g * dt, -T.MAX_FALL);

  const res = moveAndCollide(P, W, dt, "air");
  P.speedH = horizSpeed(P);
  if (P.y > P.peakY) P.peakY = P.y;
  if (P.speedH > 0.6) faceTowards(P, P.vx, P.vz, T.ROT_SPEED * 0.45, dt);

  if (res.landed) {
    landOn(P, W, res.landVy, res.landBox);
    return;
  }
  if (tryClimb(P, W, I)) return;
  if (tryLedge(P, W, I)) return;
}

function ledgeStep(P, W, I, dt) {
  const T = W.T;
  const L = P.ledge;
  L.t += dt;
  P.grounded = false;
  P.vx = 0;
  P.vy = 0;
  P.vz = 0;
  if (L.phase === "hang") {
    const u = clamp(L.t / 0.08, 0, 1);
    P.x = lerp(L.fromX, L.x0, u);
    P.y = lerp(L.fromY, L.y0, u);
    P.z = lerp(L.fromZ, L.z0, u);
    // pulling back drops off
    const back = I.mag > 0.4 && (I.mx * L.nx + I.mz * L.nz) / I.mag > 0.7;
    if (back && L.t > 0.1) {
      P.vx = L.nx * 1.4;
      P.vz = L.nz * 1.4;
      leaveGround(P, W, "ledge");
      setState(P, W, S.AIR);
      return;
    }
    if (L.t >= T.LEDGE_HANG_TIME) {
      L.phase = "climb";
      L.t = 0;
      ev(W, "pullup", { x: P.x, y: P.y, z: P.z });
    }
    return;
  }
  // pull up: up first, then over (a mantle is a quicker, smaller version)
  const u = clamp(L.t / (L.mantle ? 0.22 : T.LEDGE_CLIMB_TIME), 0, 1);
  const up = clamp(u / 0.62, 0, 1);
  const over = clamp((u - 0.38) / 0.62, 0, 1);
  const e = (k) => k * k * (3 - 2 * k);
  P.y = lerp(L.y0, L.y1, e(up));
  P.x = lerp(L.x0, L.x1, e(over));
  P.z = lerp(L.z0, L.z1, e(over));
  if (u >= 1) {
    P.x = L.x1;
    P.y = L.y1;
    P.z = L.z1;
    P.vx = -L.nx * 1.5;
    P.vz = -L.nz * 1.5;
    P.grounded = true;
    P.groundBox = L.box;
    P.peakY = P.y;
    setState(P, W, S.GROUND);
  }
}

function climbStep(P, W, I, dt) {
  const T = W.T;
  const c = P.climb;
  const b = c.box;
  P.grounded = false;
  P.airT = 0;
  // jump: kick away from the cloth
  if (P.jumpBuffer > 0) {
    P.jumpBuffer = 0;
    P.vx = c.nx * T.CLIMB_JUMP_OUT;
    P.vz = c.nz * T.CLIMB_JUMP_OUT;
    P.vy = T.CLIMB_JUMP_UP;
    P.jumpHeld = true;
    leaveGround(P, W, "climb");
    P.airMax = Math.max(horizSpeed(P), T.AIR_MAX_GAIN);
    setState(P, W, S.AIR);
    ev(W, "jump", { x: P.x, y: P.y, z: P.z, climb: true });
    return;
  }
  // input: "into the face" = up, "away" = down, sideways along the face
  let up = 0;
  let side = 0;
  const tx = c.nz;
  const tz = -c.nx; // face tangent
  if (I.mag > 0.1) {
    up = -(I.mx * c.nx + I.mz * c.nz);
    side = I.mx * tx + I.mz * tz;
  }
  P.vy = clamp(up, -1, 1) * T.CLIMB_SPEED;
  const sv = clamp(side, -1, 1) * T.CLIMB_SPEED * 0.75;
  P.vx = tx * sv;
  P.vz = tz * sv;
  const oy = P.y;
  P.y += P.vy * dt;
  P.x += P.vx * dt;
  P.z += P.vz * dt;
  // stay within the face
  const lat = c.nx !== 0 ? P.z : P.x;
  const lc = clamp(lat, c.span[0] + 0.12, c.span[1] - 0.12);
  if (c.nx !== 0) P.z = lc;
  else P.x = lc;
  pinToFace(P, W, c);
  // don't climb into things (shelf above, side boxes)
  if (!fitsAt(P, W)) {
    P.y = oy;
    if (!fitsAt(P, W)) {
      P.x -= P.vx * dt;
      P.z -= P.vz * dt;
      pinToFace(P, W, c);
    }
    P.vy = 0;
  }
  const moved = Math.abs(P.y - oy) + Math.abs(sv * dt);
  if (moved > 0) advanceStride(P, W, moved * 1.4, 1.2, b.mat);
  // reached the top → pull up onto it (when there's room), like a ledge
  const top = b.max[1];
  if (P.y + 0.95 >= top && up > 0.2) {
    const R = T.RADIUS;
    const inX = c.nx !== 0 ? c.plane - c.nx * (R + 0.1) : P.x;
    const inZ = c.nz !== 0 ? c.plane - c.nz * (R + 0.1) : P.z;
    if (!cylinderBlocked(W.C, inX, top + 0.02, inZ, R, T.HEIGHT) && groundBelow(W.C, inX, top + 0.01, inZ, R * SUPPORT, 0.05, 0.02)) {
      P.ledge = { phase: "climb", mantle: false, t: 0, x0: P.x, y0: P.y, z0: P.z, x1: inX, y1: top + 0.01, z1: inZ, nx: c.nx, nz: c.nz, top, box: b, fromX: P.x, fromY: P.y, fromZ: P.z };
      const L = P.ledge;
      setState(P, W, S.LEDGE);
      P.ledge = L;
      ev(W, "pullup", { x: P.x, y: P.y, z: P.z });
      return;
    }
    P.y = Math.min(P.y, top - 0.95);
  }
  // climbed down to the ground
  if (up < -0.2) {
    const g = groundBelow(W.C, P.x, P.y, P.z, T.RADIUS * SUPPORT, 0.04, 0.02);
    if (g) {
      P.y = g.max[1];
      P.groundBox = g;
      P.grounded = true;
      P.vx = P.vy = P.vz = 0;
      setState(P, W, S.GROUND);
      return;
    }
  }
  // the face ended below us (climbed off the bottom of a hanging cloth)
  if (P.y + W.T.HEIGHT * 0.9 < b.min[1]) {
    leaveGround(P, W, "climb");
    setState(P, W, S.AIR);
  }
}

function stumbleStep(P, W, I, dt) {
  const T = W.T;
  P.stumbleT -= dt;
  P.airT += dt;
  if (!P.grounded) {
    const g = T.GRAVITY * (P.vy < 0 ? T.FALL_MULT : 1);
    P.vy = Math.max(P.vy - g * dt, -T.MAX_FALL);
  }
  const k = 1 - 2.2 * dt;
  P.vx *= k;
  P.vz *= k;
  if (P.grounded) {
    P.vy = 0;
    const res = moveAndCollide(P, W, dt, "ground");
    if (res.leftGround) {
      leaveGround(P, W, "knock");
      P.leftBy = "knock";
    }
  } else {
    const res = moveAndCollide(P, W, dt, "air");
    if (res.landed) {
      P.grounded = true;
      P.groundBox = res.landBox;
      P.groundMat = res.landBox.mat || "wood";
      P.vy = 0;
      ev(W, "land", { hard: false, impact: -res.landVy, fallH: 0, mat: P.groundMat, x: P.x, y: P.y, z: P.z, box: res.landBox.id, stumble: true });
    }
  }
  if (P.stumbleT <= 0) {
    if (P.grounded) {
      P.landT = 0.1;
      P.landHard = false;
      setState(P, W, S.GROUND);
    } else {
      P.leftBy = "knock";
      setState(P, W, S.AIR);
    }
  }
}

function hurtStep(P, W, dt) {
  const T = W.T;
  P.hurtT += dt;
  P.vy = Math.max(P.vy - T.GRAVITY * T.FALL_MULT * dt, -T.MAX_FALL);
  const k = 1 - 3 * dt;
  P.vx *= k;
  P.vz *= k;
  const res = moveAndCollide(P, W, dt, P.grounded ? "ground" : "air");
  if (res.landed) {
    P.grounded = true;
    P.groundBox = res.landBox;
  }
  if (res.leftGround) P.grounded = false;
}

function finishedStep(P, W, dt) {
  const T = W.T;
  const k = Math.max(0, 1 - 5 * dt);
  P.vx *= k;
  P.vz *= k;
  if (P.grounded) {
    P.vy = 0;
    const res = moveAndCollide(P, W, dt, "ground");
    advanceStride(P, W, res.moved, horizSpeed(P));
    if (res.leftGround) P.grounded = false;
  } else {
    P.vy = Math.max(P.vy - T.GRAVITY * T.FALL_MULT * dt, -T.MAX_FALL);
    const res = moveAndCollide(P, W, dt, "air");
    if (res.landed) {
      P.grounded = true;
      P.groundBox = res.landBox;
    }
  }
  P.speedH = horizSpeed(P);
}

/* ======================================================================== main step */

export function stepPlayer(P, W, I, dt) {
  const T = W.T;
  P.stateT += dt;
  if (P.jumpBuffer > 0) P.jumpBuffer -= dt;
  if (P.interactBuffer > 0) P.interactBuffer -= dt;
  if (I.jumpPressed) {
    P.jumpBuffer = T.JUMP_BUFFER;
    P.jumpHeld = true;
  }
  if (!I.jumpHeld) P.jumpHeld = false;
  P.keyJumpHeld = !!I.jumpHeld;

  switch (P.state) {
    case S.GROUND:
      groundStep(P, W, I, dt);
      break;
    case S.AIR:
      airStep(P, W, I, dt);
      break;
    case S.PUSH:
      pushStep(P, W, I, dt);
      break;
    case S.LEDGE:
      ledgeStep(P, W, I, dt);
      break;
    case S.CLIMB:
      climbStep(P, W, I, dt);
      break;
    case S.STUMBLE:
      stumbleStep(P, W, I, dt);
      break;
    case S.HURT:
      hurtStep(P, W, dt);
      break;
    case S.FINISHED:
      finishedStep(P, W, dt);
      break;
    case S.FALLING_OUT: {
      // keep sinking/falling (no control) while the screen fades
      P.vy = Math.max(P.vy - T.GRAVITY * dt, -T.MAX_FALL * 0.6);
      P.vx *= 0.96;
      P.vz *= 0.96;
      P.x += P.vx * dt;
      P.y += P.vy * dt;
      P.z += P.vz * dt;
      break;
    }
    case S.RESPAWN:
    default:
      P.vx = 0;
      P.vy = 0;
      P.vz = 0;
      break;
  }
  if (!Number.isFinite(P.x + P.y + P.z + P.vx + P.vy + P.vz)) {
    // never let NaN escape into the renderer — put the toy back at its checkpoint
    resetPlayerAt(P, W, W.checkpoint);
    ev(W, "nanGuard");
  }
}

/** Teleport to a checkpoint with every transient cleared. */
export function resetPlayerAt(P, W, cp) {
  P.x = cp.x;
  P.y = cp.y;
  P.z = cp.z;
  P.vx = 0;
  P.vy = 0;
  P.vz = 0;
  P.yaw = cp.yaw || 0;
  P.ledge = null;
  P.climb = null;
  P.push = null;
  P.pushBox = null;
  P.pushLean = 0;
  P.jumpBuffer = 0;
  P.interactBuffer = 0;
  P.jumpHeld = false;
  P.coyote = 0;
  P.landT = 0;
  P.landHard = false;
  P.stumbleT = 0;
  P.hurtT = 0;
  P.grounded = true;
  P.groundBox = null;
  P.airT = 0;
  P.peakY = cp.y;
  P.speedH = 0;
  P.sprinting = false;
  P.balance = false;
  P.riding = false;
  P.rideBox = null;
  P.inShallow = false;
  P.leftBy = "none";
  P.walls.length = 0;
  P.idleT = 0;
  P.state = S.GROUND;
  P.prevState = S.GROUND;
  P.stateT = 0;
  // settle onto whatever is under the checkpoint (never respawn floating or inside)
  const g = groundBelow(W.C, P.x, P.y + 0.3, P.z, W.T.RADIUS * SUPPORT, 1.5, 0.3);
  if (g) {
    P.y = g.max[1];
    P.groundBox = g;
  }
}
