/**
 * Rooftop Dash — the runner's kinematic character controller.
 *
 * Pure JS (no Three, no DOM). One central state machine; every transition goes
 * through `setState`, so two movement modes can never be active together
 * (slide + wall run, vault + fall, dash + respawn …).
 *
 * Collider: a vertical cylinder (radius R, height HEIGHT or SLIDE_HEIGHT) with
 * the position at the FEET. Movement is integrated in sub-steps that never
 * exceed MAX_SUBSTEP_MOVE, so even a dash can't tunnel through a thin wall:
 * the cylinder centre never gets inside a box, and resolution always pushes
 * it back out of the side it came from.
 *
 * Per sub-step:  horizontal move → push out of walls (records wall contacts)
 *                vertical move   → land on tops / bonk on ceilings
 *                ground probe    → step up kerbs, follow the ground, detect edges
 *
 * Inputs (already camera-relative, see world.js):
 *   { mx, mz, mag, sprint, jumpPressed, jumpHeld, dashPressed, slidePressed, slideHeld }
 */
import { STATES as S } from "./config.js";
import { queryRect, rectClosest, cylinderBlocked, groundBelow } from "./collision.js";

const SUPPORT = 0.8; // fraction of the radius that must be over a top to stand on it
const AIR_EDGE = 0.12; // tops this close above the feet are "landable", not walls
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
    height: 1.78,
    grounded: true,
    groundBox: null,
    groundMat: "concrete",
    airT: 0,
    leftBy: "none", // jump | walk | walljump | vault | dash | ledge | knock
    coyote: 0,
    jumpBuffer: 0,
    jumpHeld: false,
    dashBuffer: 0,
    slideBuffer: 0,
    airDash: true,
    dashCooldown: 0,
    dashT: 0,
    dashDirX: 0,
    dashDirZ: 1,
    dashAir: false,
    dashStartSpeed: 0,
    slideT: 0,
    slideDirX: 0,
    slideDirZ: 1,
    slideSpeed: 0,
    vault: null,
    wall: null,
    wallLockId: 0,
    wallLockN: 0,
    wallRuns: 0,
    wallJumpLock: 0,
    ledge: null,
    landT: 0,
    landHard: false,
    stumbleT: 0,
    airMax: 0,
    stride: 0, // gait cycle phase 0..1 (two steps per cycle), driven by distance
    dist: 0,
    lastImpact: 0,
    peakY: spawn.y,
    speedH: 0,
    sprinting: false,
    walls: [], // wall contacts from the last sub-step (box, nx, nz)
    finished: false,
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
  if (next !== S.SLIDE && next !== S.CROUCH) {
    // restoring full height is only legal where it fits; callers check first
    P.height = W.T.HEIGHT;
  }
}

export function fitsStanding(P, W, x = P.x, y = P.y, z = P.z) {
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

/** gait: one cycle = two steps; cycle length grows with speed */
function advanceStride(P, W, moved, speed, matOverride) {
  if (moved <= 0) return;
  // must match the renderer's gait (three/runner.js locoPose) so planted feet don't slide
  const cycle = 0.9 + speed * 0.37;
  const before = P.stride;
  P.stride += moved / cycle;
  // footfalls at phase 0 and 0.5
  const a = Math.floor(before * 2);
  const b = Math.floor(P.stride * 2);
  if (b !== a) ev(W, "step", { sprint: P.sprinting, mat: matOverride || P.groundMat, wall: P.state === S.WALLRUN, foot: b & 1 });
  if (P.stride > 1000) P.stride -= 1000;
}

/* ======================================================================== collision core */

/**
 * Move by (vx,vy,vz)·dt in safe sub-steps. Mode:
 *  ground — no vertical integration; follows the ground (step up / step down)
 *  air    — vertical integration with landing / ceiling
 * Returns a small result record (reused object).
 */
const RES = { landed: false, landVy: 0, bonked: false, leftGround: false, blocked: false, blockNx: 0, blockNz: 0, moved: 0, landBox: null };

function moveAndCollide(P, W, dt, mode) {
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

  const dx = P.vx * dt;
  const dz = P.vz * dt;
  const dy = mode === "air" ? P.vy * dt : 0;
  const dist = Math.max(Math.hypot(dx, dz), Math.abs(dy));
  const n = Math.max(1, Math.ceil(dist / T.MAX_SUBSTEP_MOVE));
  const sx = dx / n;
  const sz = dz / n;
  const sy = dy / n;

  for (let i = 0; i < n; i++) {
    const ox = P.x;
    const oz = P.z;
    P.x += sx;
    P.z += sz;
    resolveHorizontal(P, W, mode === "ground" ? T.STEP_UP : AIR_EDGE);
    RES.moved += Math.hypot(P.x - ox, P.z - oz);

    if (mode === "air") {
      const oldY = P.y;
      P.y += sy;
      if (sy < 0) {
        // landing: highest top crossed this sub-step under the support circle
        const list = queryRect(C, P.x - R, P.z - R, P.x + R, P.z + R);
        const rr = (R * SUPPORT) * (R * SUPPORT);
        let best = null;
        for (let k = 0; k < list.length; k++) {
          const b = list[k];
          if (!b.solid) continue;
          const top = b.max[1];
          if (top > oldY + AIR_EDGE || top < P.y - 1e-4) continue;
          if (b.min[1] > top - 0.01) continue;
          if (rectClosest(b, P.x, P.z, tmp) >= rr) continue;
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
        const head = oldY + P.height;
        const list = queryRect(C, P.x - R, P.z - R, P.x + R, P.z + R);
        const rr = (R - 0.05) * (R - 0.05);
        let low = Infinity;
        for (let k = 0; k < list.length; k++) {
          const b = list[k];
          if (!b.solid) continue;
          const bot = b.min[1];
          if (bot < head - 0.06 || bot > P.y + P.height) continue;
          if (rectClosest(b, P.x, P.z, tmp) >= rr) continue;
          if (bot < low) low = bot;
        }
        if (low !== Infinity) {
          P.y = low - P.height;
          P.vy = 0;
          RES.bonked = true;
        }
      }
    } else if (mode === "ground") {
      const g = groundBelow(C, P.x, P.y, P.z, R * SUPPORT, 0.36, T.STEP_UP + 0.001);
      if (g) {
        P.y = g.max[1];
        P.groundBox = g;
      } else {
        RES.leftGround = true;
        // finish the remaining sub-steps as air so the edge isn't overshot
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
  const R = P.state === S.LEDGE ? W.T.RADIUS * 0.9 : W.T.RADIUS;
  const feet = P.y + edgeAllowance;
  const head = P.y + P.height - 0.02;
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
        // centre inside the footprint (only possible after a teleport / mover push) → shortest exit
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
        if (-vn > 2) {
          RES.blocked = true;
          RES.blockNx = nx;
          RES.blockNz = nz;
        }
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
  P.grounded = true;
  P.groundBox = box;
  P.groundMat = (box && box.mat) || "concrete";
  P.airDash = true;
  P.wallRuns = 0;
  P.wallLockId = 0;
  P.wallJumpLock = 0;
  P.airT = 0;
  P.lastImpact = impact;
  const hard = impact >= T.HARD_LAND_VEL;
  P.landHard = hard;
  P.landT = hard ? T.HARD_LAND_TIME : T.SOFT_LAND_TIME;
  if (hard) {
    P.vx *= T.HARD_LAND_SPEED_MULT;
    P.vz *= T.HARD_LAND_SPEED_MULT;
  }
  setState(P, W, S.GROUND);
  ev(W, "land", { hard, impact, fallH, mat: P.groundMat, x: P.x, y: P.y, z: P.z });
  // jump buffer: pressed shortly before touching down → jump now
  if (P.jumpBuffer > 0 && fitsStanding(P, W)) doJump(P, W);
}

function leaveGround(P, W, by) {
  P.grounded = false;
  P.groundBox = null;
  P.leftBy = by;
  P.airT = 0;
  P.peakY = P.y;
  P.airMax = Math.max(horizSpeed(P), W.T.AIR_MAX_GAIN);
  P.coyote = by === "walk" ? W.T.COYOTE : 0;
}

function doJump(P, W) {
  const T = W.T;
  const gb = P.groundBox;
  const sp = horizSpeed(P);
  P.vy = T.JUMP_VEL + T.JUMP_SPRINT_BONUS * clamp(sp / T.SPRINT_SPEED, 0, 1);
  // keep the platform's motion so jumping off a mover isn't a yank backwards
  if (gb && gb.dynamic) {
    P.vx += gb.vel[0];
    P.vz += gb.vel[2];
    if (gb.vel[1] > 0) P.vy += gb.vel[1];
  }
  P.jumpBuffer = 0;
  P.coyote = 0;
  P.jumpHeld = true;
  leaveGround(P, W, "jump");
  setState(P, W, S.AIR);
  ev(W, "jump", { sprint: P.sprinting, x: P.x, y: P.y, z: P.z });
}

function startDash(P, W, I) {
  const T = W.T;
  if (!fitsStanding(P, W)) return false;
  let dx;
  let dz;
  if (I.mag > 0.2) {
    dx = I.mx / I.mag;
    dz = I.mz / I.mag;
  } else {
    dx = Math.sin(P.yaw);
    dz = Math.cos(P.yaw);
  }
  const air = !P.grounded;
  if (air) {
    if (!P.airDash) return false;
    P.airDash = false;
  } else {
    if (P.dashCooldown > 0) return false;
    P.dashCooldown = T.DASH_GROUND_COOLDOWN;
  }
  P.dashBuffer = 0;
  P.dashT = 0;
  P.dashDirX = dx;
  P.dashDirZ = dz;
  P.dashAir = air;
  P.dashStartSpeed = horizSpeed(P);
  P.vx = dx * T.DASH_SPEED;
  P.vz = dz * T.DASH_SPEED;
  P.vy = air ? T.DASH_LIFT : 0;
  P.yaw = Math.atan2(dx, dz);
  if (air) P.peakY = Math.max(P.peakY, P.y);
  setState(P, W, S.DASH);
  ev(W, "dash", { air, x: P.x, y: P.y, z: P.z, dx, dz });
  return true;
}

function startSlide(P, W) {
  const T = W.T;
  const sp = horizSpeed(P);
  if (sp < T.SLIDE_MIN_SPEED) return false;
  P.slideBuffer = 0;
  P.slideDirX = P.vx / sp;
  P.slideDirZ = P.vz / sp;
  P.slideSpeed = Math.min(sp + T.SLIDE_BOOST, T.SLIDE_MAX_SPEED);
  P.slideT = 0;
  setState(P, W, S.SLIDE);
  P.height = T.SLIDE_HEIGHT;
  P.yaw = Math.atan2(P.slideDirX, P.slideDirZ);
  ev(W, "slide", { x: P.x, y: P.y, z: P.z });
  return true;
}

/** knockback from a hazard: horizontal push + small hop; controls off briefly */
export function knock(P, W, nx, nz, strength = 1) {
  if (P.state === S.FINISHED || P.state === S.FALLING_OUT || P.state === S.RESPAWN) return;
  const T = W.T;
  const fits = fitsStanding(P, W);
  P.vx = nx * T.KNOCKBACK * strength;
  P.vz = nz * T.KNOCKBACK * strength;
  P.vy = 4.5 * strength;
  P.vault = null;
  P.wall = null;
  P.ledge = null;
  if (P.grounded) leaveGround(P, W, "knock");
  P.grounded = false;
  P.groundBox = null;
  P.stumbleT = T.STUMBLE_TIME;
  setState(P, W, S.STUMBLE);
  if (!fits) P.height = T.SLIDE_HEIGHT;
  ev(W, "stumble", { x: P.x, y: P.y, z: P.z });
}

/* ======================================================================== detection */

/** First solid box face hit going from the player's centre along (dx,dz). */
function probeFace(P, W, dx, dz, maxT, yLo, yHi) {
  const C = W.C;
  const R = W.T.RADIUS;
  const ex = P.x + dx * maxT;
  const ez = P.z + dz * maxT;
  const list = queryRect(C, Math.min(P.x, ex) - 0.1, Math.min(P.z, ez) - 0.1, Math.max(P.x, ex) + 0.1, Math.max(P.z, ez) + 0.1);
  let best = null;
  let bestT = maxT;
  let bestNx = 0;
  let bestNz = 0;
  for (let k = 0; k < list.length; k++) {
    const b = list[k];
    if (!b.solid) continue;
    if (b.max[1] <= yLo || b.min[1] >= yHi) continue;
    // 2D slab test on the box inflated by nothing (centre ray vs face planes);
    // a box the centre is already inside (shouldn't happen) is ignored.
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
  // also catch faces the centre ray misses but the cylinder body touches:
  // the wall contacts recorded by the last collision pass.
  if (!best && R > 0) {
    for (let i = 0; i < P.walls.length; i++) {
      const w = P.walls[i];
      const b = w.box;
      if (b.max[1] <= yLo || b.min[1] >= yHi) continue;
      if (-(w.nx * dx + w.nz * dz) < 0.75) continue;
      best = b;
      bestT = R;
      bestNx = w.nx;
      bestNz = w.nz;
      break;
    }
  }
  if (!best) return null;
  return { box: best, t: bestT, nx: bestNx, nz: bestNz };
}

/** along-face coordinate range for a face with normal (nx,nz) */
function faceSpan(b, nx) {
  return nx !== 0 ? [b.min[2], b.max[2]] : [b.min[0], b.max[0]];
}

function tryVault(P, W, I) {
  const T = W.T;
  const R = T.RADIUS;
  const sp = horizSpeed(P);
  if (sp < T.VAULT_MIN_SPEED || I.mag < 0.4) return false;
  const dx = P.vx / sp;
  const dz = P.vz / sp;
  // intent: input roughly along travel
  if ((I.mx * dx + I.mz * dz) / I.mag < 0.6) return false;
  const hit = probeFace(P, W, dx, dz, R + T.VAULT_REACH, P.y + 0.05, P.y + T.HEIGHT);
  if (!hit) return false;
  const b = hit.box;
  if (b.noVault || b.dynamic) return false;
  const h = b.max[1] - P.y;
  if (h < T.VAULT_MIN_H || h > T.VAULT_HIGH_MAX) return false;
  if (b.min[1] > P.y + 0.3) return false; // floating obstacle = slide under it, not vault
  // approach roughly perpendicular to the face
  const nx = hit.nx;
  const nz = hit.nz;
  if (-(dx * nx + dz * nz) < 0.72) return false;
  // must be over the obstacle laterally
  const span = faceSpan(b, nx);
  const lat = nx !== 0 ? P.z : P.x;
  if (lat < span[0] + 0.08 || lat > span[1] - 0.08) return false;
  // depth along the vault direction
  const depth = nx !== 0 ? b.max[0] - b.min[0] : b.max[2] - b.min[2];
  if (depth > T.VAULT_MAX_DEPTH) return false;
  const vdx = -nx;
  const vdz = -nz;
  // far face position
  const far = nx !== 0 ? (vdx > 0 ? b.max[0] : b.min[0]) : vdz > 0 ? b.max[2] : b.min[2];
  const endX = nx !== 0 ? far + vdx * (R + 0.08) : P.x;
  const endZ = nx !== 0 ? P.z : far + vdz * (R + 0.08);
  const top = b.max[1];
  const endY = top + 0.02;
  // clear above the obstacle while crossing (crouched clearance) and standing room at the exit
  const midX = (P.x + endX) / 2;
  const midZ = (P.z + endZ) / 2;
  if (cylinderBlocked(W.C, midX, top + 0.01, midZ, R * 0.85, 1.05)) return false;
  if (cylinderBlocked(W.C, endX, endY, endZ, R, T.HEIGHT)) return false;
  // a safe landing exists below the exit (never vault blindly into a gap)
  const g = groundBelow(W.C, endX, endY, endZ, R * SUPPORT, 2.6, 0.01);
  if (!g) return false;
  const low = h <= T.VAULT_LOW_MAX;
  const dur = low ? T.VAULT_LOW_TIME : T.VAULT_HIGH_TIME;
  const exitSpeed = Math.max(sp, T.RUN_SPEED * 0.95);
  P.vault = {
    t: 0,
    T: dur,
    x0: P.x,
    y0: P.y,
    z0: P.z,
    x1: endX,
    y1: endY,
    z1: endZ,
    peak: top + (low ? 0.16 : 0.24),
    dirX: vdx,
    dirZ: vdz,
    exitSpeed,
    low,
    box: b,
  };
  P.vx = 0;
  P.vz = 0;
  P.vy = 0;
  P.yaw = Math.atan2(vdx, vdz);
  P.grounded = false;
  P.groundBox = null;
  setState(P, W, S.VAULT);
  ev(W, "vault", { low, x: P.x, y: P.y, z: P.z, h });
  return true;
}

function tryLedge(P, W, I) {
  const T = W.T;
  const R = T.RADIUS;
  if (P.vy > 3.2) return false;
  // grab direction: input if pressing, else travel direction
  let dx;
  let dz;
  if (I.mag > 0.3) {
    dx = I.mx / I.mag;
    dz = I.mz / I.mag;
  } else {
    const sp = horizSpeed(P);
    if (sp < 1.5) return false;
    dx = P.vx / sp;
    dz = P.vz / sp;
  }
  const hit = probeFace(P, W, dx, dz, R + T.LEDGE_REACH, P.y + 0.3, P.y + T.HEIGHT + T.LEDGE_MAX);
  if (!hit) return false;
  const b = hit.box;
  if (b.noLedge || b.dynamic || !b.solid) return false;
  const top = b.max[1];
  const rel = top - P.y;
  // 0.25–LEDGE_MIN below the lip = a near miss: "mantle" straight up (no hang)
  const mantle = rel >= 0.25 && rel < T.LEDGE_MIN && P.vy <= 0.5;
  if ((rel < T.LEDGE_MIN && !mantle) || rel > T.LEDGE_MAX) return false;
  if (-(dx * hit.nx + dz * hit.nz) < 0.6) return false;
  const span = faceSpan(b, hit.nx);
  const lat = hit.nx !== 0 ? P.z : P.x;
  if (lat < span[0] + 0.12 || lat > span[1] - 0.12) return false;
  // standing room on top just past the edge (also rejects the underside of overhangs:
  // a box sitting on that top would block it)
  const inX = hit.nx !== 0 ? (hit.nx > 0 ? b.max[0] : b.min[0]) - hit.nx * (R + 0.12) : P.x;
  const inZ = hit.nz !== 0 ? (hit.nz > 0 ? b.max[2] : b.min[2]) - hit.nz * (R + 0.12) : P.z;
  if (cylinderBlocked(W.C, inX, top + 0.02, inZ, R, T.HEIGHT)) return false;
  // nothing overhead between the runner and the lip (no grabbing through a roof)
  if (cylinderBlocked(W.C, P.x, P.y + 0.05, P.z, R * 0.9, top + 0.35 - P.y, b)) return false;
  // hang position: pressed against the face, hands at the lip
  const faceX = hit.nx !== 0 ? (hit.nx > 0 ? b.max[0] : b.min[0]) + hit.nx * (R + 0.04) : P.x;
  const faceZ = hit.nz !== 0 ? (hit.nz > 0 ? b.max[2] : b.min[2]) + hit.nz * (R + 0.04) : P.z;
  P.ledge = {
    phase: mantle ? "climb" : "hang",
    mantle,
    t: 0,
    x0: faceX,
    y0: mantle ? P.y : top - 1.32,
    z0: faceZ,
    x1: inX,
    y1: top + 0.02,
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
  setState(P, W, S.LEDGE);
  ev(W, "ledge", { x: P.x, y: P.y, z: P.z, mantle });
  if (mantle) ev(W, "climb", { x: P.x, y: P.y, z: P.z, mantle: true });
  return true;
}

function tryWallRun(P, W, I) {
  const T = W.T;
  const R = T.RADIUS;
  if (P.wallRuns >= T.WALLRUN_MAX_PER_AIR) return false;
  if (P.airT < 0.06) return false;
  if (P.vy < T.WALLRUN_ENTRY_VY_MIN) return false;
  if (I.mag < 0.3) return false;
  const sp = horizSpeed(P);
  if (sp < T.WALLRUN_MIN_SPEED) return false;
  const vdx = P.vx / sp;
  const vdz = P.vz / sp;
  // must be clear of the ground (no wall running off a kerb hop)
  if (groundBelow(W.C, P.x, P.y, P.z, R * SUPPORT, 1.5, 0.01)) return false;
  const reach = R + T.WALLRUN_REACH;
  const list = queryRect(W.C, P.x - reach, P.z - reach, P.x + reach, P.z + reach);
  const sinMax = Math.sin(T.WALLRUN_MAX_ANGLE);
  let best = null;
  let bestD = Infinity;
  for (let k = 0; k < list.length; k++) {
    const b = list[k];
    if (!b.wr || !b.solid || b.dynamic) continue;
    if (b.min[1] > P.y + 0.25 || b.max[1] < P.y + T.HEIGHT + 0.1) continue;
    for (let f = 0; f < 4; f++) {
      const nx = f === 0 ? -1 : f === 1 ? 1 : 0;
      const nz = f === 2 ? -1 : f === 3 ? 1 : 0;
      const plane = f === 0 ? b.min[0] : f === 1 ? b.max[0] : f === 2 ? b.min[2] : b.max[2];
      const d = nx !== 0 ? (P.x - plane) * nx : (P.z - plane) * nz;
      if (d < R - 0.06 || d > reach) continue;
      // travel mostly parallel to the face, and not peeling away from it
      const vn = vdx * nx + vdz * nz;
      if (Math.abs(vn) > sinMax) continue;
      // input not pushing away from the wall
      if ((I.mx * nx + I.mz * nz) / I.mag > 0.5) continue;
      if (P.wallLockId === b.id && P.wallLockN === f) continue;
      // tangent in travel direction and remaining run length
      let tx = nz;
      let tz = -nx;
      if (tx * vdx + tz * vdz < 0) {
        tx = -tx;
        tz = -tz;
      }
      const along = nx !== 0 ? P.z : P.x;
      const span = nx !== 0 ? [b.min[2], b.max[2]] : [b.min[0], b.max[0]];
      const dirA = nx !== 0 ? tz : tx;
      const remaining = dirA > 0 ? span[1] - along : along - span[0];
      if (remaining < 1.4) continue;
      if (along < span[0] - 0.05 || along > span[1] + 0.05) continue;
      if (d < bestD) {
        bestD = d;
        best = { box: b, f, nx, nz, tx, tz, plane };
      }
    }
  }
  if (!best) return false;
  // which side is the wall on? right of travel = (-tz, tx) in this engine's yaw convention
  const rx = -best.tz;
  const rz = best.tx;
  const side = -(best.nx * rx + best.nz * rz) > 0 ? "right" : "left";
  const speed = clamp(Math.max(sp, T.WALLRUN_SPEED), T.WALLRUN_SPEED, T.WALLRUN_SPEED + 2.5);
  P.wall = { ...best, side, t: 0, speed };
  // pin to the wall
  if (best.nx !== 0) P.x = best.plane + best.nx * (R + 0.03);
  else P.z = best.plane + best.nz * (R + 0.03);
  P.vy = clamp(P.vy * 0.35 + T.WALLRUN_LIFT, 0.8, 3.2);
  P.vx = best.tx * speed;
  P.vz = best.tz * speed;
  P.wallRuns += 1;
  // a jump pressed BEFORE touching the wall must not become an instant wall jump
  P.jumpBuffer = 0;
  P.yaw = Math.atan2(best.tx, best.tz);
  setState(P, W, S.WALLRUN);
  ev(W, "wallrun", { side, x: P.x, y: P.y, z: P.z });
  return true;
}

/* ======================================================================== per-state steps */

function groundStep(P, W, I, dt) {
  const T = W.T;
  P.grounded = true;
  P.airT = 0;
  P.coyote = T.COYOTE;
  if (P.landT > 0) P.landT -= dt;

  // dash / slide / jump (buffered edges)
  if (P.dashBuffer > 0 && startDash(P, W, I)) return dashStep(P, W, I, dt);
  if (P.slideBuffer > 0 && startSlide(P, W)) return slideStep(P, W, I, dt);
  if (P.jumpBuffer > 0) {
    doJump(P, W);
    return airStep(P, W, I, dt, true);
  }

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
    P.sprinting = I.sprint && mag >= T.SPRINT_MIN_INPUT;
    if (P.sprinting) target = T.SPRINT_SPEED;
    if (P.landT > 0 && P.landHard) target *= T.HARD_LAND_SPEED_MULT;
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
  else accel = T.GROUND_DECEL * 0.6; // easing down from sprint / dash / slide exit speed
  moveTowards2(P, tx, tz, accel * dt);
  P.vy = 0;

  // vault check before moving into the obstacle
  if (tryVault(P, W, I)) return;

  const res = moveAndCollide(P, W, dt, "ground");
  P.speedH = horizSpeed(P);
  if (P.speedH > 0.4) faceTowards(P, P.vx, P.vz, T.ROT_SPEED, dt);
  else if (mag > 0.05) faceTowards(P, dirX, dirZ, T.ROT_SPEED * 0.6, dt);
  if (P.groundBox) P.groundMat = P.groundBox.mat || "concrete";
  advanceStride(P, W, res.moved, P.speedH);

  if (res.leftGround) {
    leaveGround(P, W, "walk");
    setState(P, W, S.AIR);
  }
}

function airStep(P, W, I, dt, justJumped = false) {
  const T = W.T;
  P.grounded = false;
  P.airT += dt;
  if (P.coyote > 0) P.coyote -= dt;
  if (P.wallJumpLock > 0) P.wallJumpLock -= dt;
  if (!I.jumpHeld) P.jumpHeld = false;

  // coyote jump
  if (!justJumped && P.jumpBuffer > 0 && P.coyote > 0 && P.leftBy === "walk" && fitsStanding(P, W)) {
    if (P.height < T.HEIGHT) P.height = T.HEIGHT;
    doJump(P, W);
    ev(W, "coyote");
  }
  if (P.dashBuffer > 0 && P.airDash && startDash(P, W, I)) return dashStep(P, W, I, dt);

  // crouched in the air (slid off an edge) → stand when there's room
  if (P.height < T.HEIGHT && fitsStanding(P, W)) P.height = T.HEIGHT;

  // air control
  const mag = I.mag;
  const ctl = P.wallJumpLock > 0 ? 0.25 : 1;
  if (mag > 0.05) {
    const dX = I.mx / mag;
    const dZ = I.mz / mag;
    const cap = Math.max(P.airMax, T.AIR_MAX_GAIN);
    moveTowards2(P, dX * cap * Math.min(1, mag * 1.2), dZ * cap * Math.min(1, mag * 1.2), T.AIR_ACCEL * ctl * dt);
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
  if (P.speedH > 1) faceTowards(P, P.vx, P.vz, T.ROT_SPEED * 0.5, dt);

  if (res.landed) {
    landOn(P, W, res.landVy, res.landBox);
    return;
  }
  // signature moves, most specific first
  if (tryWallRun(P, W, I)) return;
  // about to touch down in front of a low obstacle (e.g. vault → vault chains): vault it
  if (P.vy <= 0.5 && P.airT > 0.05 && groundBelow(W.C, P.x, P.y, P.z, T.RADIUS * SUPPORT, 0.7, 0.01) && tryVault(P, W, I)) return;
  if (tryLedge(P, W, I)) return;
}

function dashStep(P, W, I, dt) {
  const T = W.T;
  P.dashT += dt;
  if (!P.dashAir) P.grounded = true;
  // no gravity for the burst; a ground dash hugs the ground
  if (P.dashAir) P.vy = Math.max(P.vy - T.GRAVITY * 0.3 * dt, -2);
  const mode = P.grounded && !P.dashAir ? "ground" : "air";
  const res = moveAndCollide(P, W, dt, mode);
  P.speedH = horizSpeed(P);
  if (mode === "ground") advanceStride(P, W, res.moved, P.speedH);
  if (mode === "ground" && res.leftGround) {
    // dashed off an edge: finish the dash in the air, with a coyote window
    leaveGround(P, W, "dash");
    P.coyote = T.COYOTE;
    P.leftBy = "walk";
    P.dashAir = true;
  }
  if (res.landed) {
    landOn(P, W, res.landVy, res.landBox);
    return;
  }
  const blocked = res.blocked && -(res.blockNx * P.dashDirX + res.blockNz * P.dashDirZ) > 0.7;
  if (P.dashT >= T.DASH_TIME || blocked) {
    const keep = Math.max(T.DASH_EXIT_SPEED, P.dashStartSpeed);
    const sp = horizSpeed(P);
    if (sp > keep) {
      P.vx *= keep / sp;
      P.vz *= keep / sp;
    }
    P.airMax = Math.max(horizSpeed(P), T.AIR_MAX_GAIN);
    if (P.grounded && !P.dashAir) setState(P, W, S.GROUND);
    else {
      P.grounded = false;
      if (P.leftBy !== "walk") P.leftBy = "dash";
      setState(P, W, S.AIR);
    }
    return;
  }
  if (P.dashAir && tryWallRun(P, W, I)) return;
}

function slideStep(P, W, I, dt) {
  const T = W.T;
  P.slideT += dt;
  P.height = T.SLIDE_HEIGHT;
  P.grounded = true;
  P.sprinting = false;
  // slight steering
  if (I.mag > 0.2) {
    const want = Math.atan2(I.mx, I.mz);
    const cur = Math.atan2(P.slideDirX, P.slideDirZ);
    const d = clamp(wrapAngle(want - cur), -T.SLIDE_STEER * dt, T.SLIDE_STEER * dt);
    const a = cur + d;
    P.slideDirX = Math.sin(a);
    P.slideDirZ = Math.cos(a);
  }
  P.slideSpeed = Math.max(0, P.slideSpeed - T.SLIDE_FRICTION * dt);
  P.vx = P.slideDirX * P.slideSpeed;
  P.vz = P.slideDirZ * P.slideSpeed;
  P.vy = 0;
  const canStand = fitsStanding(P, W);
  // slide-jump keeps the momentum
  if (P.jumpBuffer > 0 && canStand) {
    P.height = T.HEIGHT;
    doJump(P, W);
    return;
  }
  if (P.dashBuffer > 0 && canStand && startDash(P, W, I)) return;

  const res = moveAndCollide(P, W, dt, "ground");
  P.speedH = horizSpeed(P);
  P.slideSpeed = Math.min(P.slideSpeed, P.speedH + 0.01);
  P.yaw = Math.atan2(P.slideDirX, P.slideDirZ);
  if (res.leftGround) {
    leaveGround(P, W, "walk");
    P.airMax = Math.max(P.speedH, T.AIR_MAX_GAIN);
    // stay crouch-height until there's room (airStep stands up when it fits)
    P.state = S.AIR;
    P.prevState = S.SLIDE;
    P.stateT = 0;
    return;
  }
  const done = (P.slideT >= T.SLIDE_MIN_TIME && (!I.slideHeld || P.slideSpeed < T.SLIDE_END_SPEED)) || P.slideT >= T.SLIDE_MAX_TIME || P.slideSpeed < 0.8;
  if (done) {
    if (fitsStanding(P, W)) setState(P, W, S.GROUND);
    else {
      setState(P, W, S.CROUCH);
      P.height = T.SLIDE_HEIGHT;
    }
  }
}

function crouchStep(P, W, I, dt) {
  const T = W.T;
  P.height = T.SLIDE_HEIGHT;
  P.grounded = true;
  P.sprinting = false;
  const mag = I.mag;
  const tx = mag > 0.05 ? (I.mx / mag) * T.CROUCH_SPEED : 0;
  const tz = mag > 0.05 ? (I.mz / mag) * T.CROUCH_SPEED : 0;
  moveTowards2(P, tx, tz, T.GROUND_DECEL * dt);
  const res = moveAndCollide(P, W, dt, "ground");
  P.speedH = horizSpeed(P);
  if (P.speedH > 0.3) faceTowards(P, P.vx, P.vz, T.ROT_SPEED, dt);
  advanceStride(P, W, res.moved, P.speedH);
  if (res.leftGround) {
    leaveGround(P, W, "walk");
    P.state = S.AIR;
    P.stateT = 0;
    return;
  }
  if (fitsStanding(P, W)) setState(P, W, S.GROUND);
}

function vaultStep(P, W, I, dt) {
  const T = W.T;
  const V = P.vault;
  V.t += dt;
  const u = clamp(V.t / V.T, 0, 1);
  // horizontal: ease-in-out-ish but never stalls; vertical: arc over the obstacle
  const hu = u * u * (3 - 2 * u) * 0.5 + u * 0.5;
  const nx = lerp(V.x0, V.x1, hu);
  const nz = lerp(V.z0, V.z1, hu);
  const base = lerp(V.y0, V.y1, Math.min(1, u * 1.6));
  const arc = Math.sin(Math.PI * u) * Math.max(0, V.peak - Math.max(V.y0, V.y1));
  const ny = Math.max(base + arc, u > 0.25 ? V.y1 - 0.02 + Math.sin(Math.PI * u) * 0.12 : base);
  const moved = Math.hypot(nx - P.x, nz - P.z);
  P.x = nx;
  P.y = ny;
  P.z = nz;
  P.vx = V.dirX * V.exitSpeed;
  P.vz = V.dirZ * V.exitSpeed;
  advanceStride(P, W, moved * 0.6, V.exitSpeed);
  if (u >= 1) {
    P.x = V.x1;
    P.y = V.y1;
    P.z = V.z1;
    P.vy = 0;
    P.vault = null;
    leaveGround(P, W, "vault");
    P.airMax = Math.max(V.exitSpeed, T.AIR_MAX_GAIN);
    // still a jump-able moment: a short coyote window after the vault
    P.coyote = T.COYOTE;
    P.leftBy = "walk";
    setState(P, W, S.AIR);
  }
}

function wallRunStep(P, W, I, dt) {
  const T = W.T;
  const R = T.RADIUS;
  const w = P.wall;
  w.t += dt;
  P.airT += dt;
  P.grounded = false;
  // wall jump
  if (P.jumpBuffer > 0) {
    P.jumpBuffer = 0;
    const fwd = Math.max(T.WALLJUMP_FORWARD, w.speed * 0.85);
    P.vx = w.nx * T.WALLJUMP_OUT + w.tx * fwd;
    P.vz = w.nz * T.WALLJUMP_OUT + w.tz * fwd;
    P.vy = T.WALLJUMP_UP;
    P.wallLockId = w.box.id;
    P.wallLockN = w.f;
    P.wallJumpLock = T.WALLJUMP_LOCK;
    P.jumpHeld = true;
    P.leftBy = "walljump";
    P.peakY = P.y;
    P.airMax = Math.max(horizSpeed(P), T.AIR_MAX_GAIN);
    P.wall = null;
    setState(P, W, S.AIR);
    ev(W, "walljump", { side: w.side, x: P.x, y: P.y, z: P.z });
    return;
  }
  if (P.dashBuffer > 0 && P.airDash) {
    P.wallLockId = w.box.id;
    P.wallLockN = w.f;
    P.wall = null;
    P.grounded = false;
    if (startDash(P, W, I)) return;
    setState(P, W, S.AIR);
    return;
  }
  // peel off: input pushing away from the wall, slide key, or out of time
  const away = I.mag > 0.3 && (I.mx * w.nx + I.mz * w.nz) / I.mag > 0.6;
  if (away || P.slideBuffer > 0 || w.t >= T.WALLRUN_TIME) {
    P.slideBuffer = 0;
    P.vx = w.tx * w.speed * 0.9 + w.nx * 1.4;
    P.vz = w.tz * w.speed * 0.9 + w.nz * 1.4;
    P.wallLockId = w.box.id;
    P.wallLockN = w.f;
    P.airMax = Math.max(horizSpeed(P), T.AIR_MAX_GAIN);
    P.leftBy = "wallrun";
    P.wall = null;
    setState(P, W, S.AIR);
    ev(W, "wallrunEnd", { reason: away ? "away" : "time" });
    return;
  }
  P.vx = w.tx * w.speed;
  P.vz = w.tz * w.speed;
  P.vy -= T.WALLRUN_GRAVITY * dt;
  const res = moveAndCollide(P, W, dt, "air");
  // stay pinned to the wall plane
  if (w.nx !== 0) P.x = w.plane + w.nx * (R + 0.03);
  else P.z = w.plane + w.nz * (R + 0.03);
  P.speedH = horizSpeed(P);
  advanceStride(P, W, res.moved, w.speed, w.box.mat || "concrete");
  if (res.landed) {
    P.wall = null;
    landOn(P, W, res.landVy, res.landBox);
    return;
  }
  // wall ended, or something in the way
  const b = w.box;
  const along = w.nx !== 0 ? P.z : P.x;
  const span = w.nx !== 0 ? [b.min[2], b.max[2]] : [b.min[0], b.max[0]];
  const dirA = w.nx !== 0 ? w.tz : w.tx;
  const past = dirA > 0 ? along > span[1] + 0.05 : along < span[0] - 0.05;
  const lowWall = b.max[1] < P.y + 1.2 || b.min[1] > P.y + 0.3;
  if (past || lowWall || P.speedH < w.speed * 0.5) {
    P.wallLockId = b.id;
    P.wallLockN = w.f;
    P.airMax = Math.max(P.speedH, T.AIR_MAX_GAIN);
    P.leftBy = "wallrun";
    P.wall = null;
    setState(P, W, S.AIR);
    ev(W, "wallrunEnd", { reason: past ? "end" : "blocked" });
  }
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
    // snap into the hang quickly
    const u = clamp(L.t / 0.08, 0, 1);
    P.x = lerp(L.fromX, L.x0, u);
    P.y = lerp(L.fromY, L.y0, u);
    P.z = lerp(L.fromZ, L.z0, u);
    // pulling back drops off
    const back = I.mag > 0.4 && (I.mx * L.nx + I.mz * L.nz) / I.mag > 0.7;
    if (back && L.t > 0.1) {
      P.vx = L.nx * 2;
      P.vz = L.nz * 2;
      P.ledge = null;
      leaveGround(P, W, "ledge");
      P.wallLockId = 0;
      setState(P, W, S.AIR);
      return;
    }
    if (L.t >= T.LEDGE_HANG_TIME) {
      L.phase = "climb";
      L.t = 0;
      ev(W, "climb", { x: P.x, y: P.y, z: P.z });
    }
    return;
  }
  // climb: up first, then over (a mantle is a quicker, smaller version)
  const u = clamp(L.t / (L.mantle ? 0.24 : T.LEDGE_CLIMB_TIME), 0, 1);
  const up = clamp(u / 0.6, 0, 1);
  const over = clamp((u - 0.35) / 0.65, 0, 1);
  const e = (k) => k * k * (3 - 2 * k);
  P.y = lerp(L.y0, L.y1, e(up));
  P.x = lerp(L.x0, L.x1, e(over));
  P.z = lerp(L.z0, L.z1, e(over));
  if (u >= 1) {
    P.x = L.x1;
    P.y = L.y1;
    P.z = L.z1;
    P.vx = -L.nx * 3.5;
    P.vz = -L.nz * 3.5;
    P.ledge = null;
    P.grounded = true;
    P.groundBox = L.box;
    P.airDash = true;
    P.wallRuns = 0;
    P.wallLockId = 0;
    P.peakY = P.y;
    setState(P, W, S.GROUND);
  }
}

function stumbleStep(P, W, I, dt) {
  const T = W.T;
  P.stumbleT -= dt;
  P.airT += dt;
  let g = T.GRAVITY * (P.vy < 0 ? T.FALL_MULT : 1);
  P.vy = Math.max(P.vy - g * dt, -T.MAX_FALL);
  const k = 1 - 1.5 * dt;
  P.vx *= k;
  P.vz *= k;
  const res = moveAndCollide(P, W, dt, "air");
  if (P.height < T.HEIGHT && fitsStanding(P, W)) P.height = T.HEIGHT;
  if (res.landed) {
    P.grounded = true;
    P.groundBox = res.landBox;
    P.vy = 0;
    if (P.stumbleT <= 0) landOn(P, W, res.landVy, res.landBox);
    return;
  }
  if (P.grounded) {
    // sliding along the ground while stumbling
    const g2 = groundBelow(W.C, P.x, P.y, P.z, T.RADIUS * SUPPORT, 0.2, 0.05);
    if (!g2) P.grounded = false;
    if (P.stumbleT <= 0 && P.grounded) {
      setState(P, W, S.GROUND);
      return;
    }
  }
  if (P.stumbleT <= 0 && !P.grounded) {
    P.leftBy = "knock";
    setState(P, W, S.AIR);
  }
}

function finishedStep(P, W, dt) {
  const T = W.T;
  // coast to a stop on whatever we're standing on; never re-trigger anything
  const k = Math.max(0, 1 - 4 * dt);
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
  if (P.dashCooldown > 0) P.dashCooldown -= dt;
  if (P.jumpBuffer > 0) P.jumpBuffer -= dt;
  if (P.dashBuffer > 0) P.dashBuffer -= dt;
  if (P.slideBuffer > 0) P.slideBuffer -= dt;
  if (I.jumpPressed) {
    P.jumpBuffer = T.JUMP_BUFFER;
    P.jumpHeld = true;
  }
  if (!I.jumpHeld) P.jumpHeld = false;
  if (I.dashPressed) P.dashBuffer = 0.1;
  if (I.slidePressed) P.slideBuffer = 0.14;

  switch (P.state) {
    case S.GROUND:
      groundStep(P, W, I, dt);
      break;
    case S.AIR:
      airStep(P, W, I, dt);
      break;
    case S.DASH:
      dashStep(P, W, I, dt);
      break;
    case S.SLIDE:
      slideStep(P, W, I, dt);
      break;
    case S.CROUCH:
      crouchStep(P, W, I, dt);
      break;
    case S.VAULT:
      vaultStep(P, W, I, dt);
      break;
    case S.WALLRUN:
      wallRunStep(P, W, I, dt);
      break;
    case S.LEDGE:
      ledgeStep(P, W, I, dt);
      break;
    case S.STUMBLE:
      stumbleStep(P, W, I, dt);
      break;
    case S.FINISHED:
      finishedStep(P, W, dt);
      break;
    case S.FALLING_OUT: {
      // keep falling (no control) while the screen fades
      P.vy = Math.max(P.vy - T.GRAVITY * T.FALL_MULT * dt, -T.MAX_FALL);
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
  // a dash press that couldn't fire is dropped once its buffer ends; jump buffer survives for landing
  if (!Number.isFinite(P.x + P.y + P.z + P.vx + P.vy + P.vz)) {
    // never let NaN escape into the renderer — treat as a fall
    P.x = W.checkpoint.x;
    P.y = W.checkpoint.y;
    P.z = W.checkpoint.z;
    P.vx = P.vy = P.vz = 0;
    setState(P, W, S.GROUND);
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
  P.vault = null;
  P.wall = null;
  P.ledge = null;
  P.wallLockId = 0;
  P.wallRuns = 0;
  P.wallJumpLock = 0;
  P.airDash = true;
  P.dashCooldown = 0;
  P.jumpBuffer = 0;
  P.dashBuffer = 0;
  P.slideBuffer = 0;
  P.jumpHeld = false;
  P.coyote = 0;
  P.landT = 0;
  P.landHard = false;
  P.stumbleT = 0;
  P.slideT = 0;
  P.grounded = true;
  P.groundBox = null;
  P.airT = 0;
  P.peakY = cp.y;
  P.speedH = 0;
  P.sprinting = false;
  P.height = W.T.HEIGHT;
  P.walls.length = 0;
  P.state = S.GROUND;
  P.prevState = S.GROUND;
  P.stateT = 0;
}
