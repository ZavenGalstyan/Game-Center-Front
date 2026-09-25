/**
 * Bottle Flip — one level attempt as plain mutable state (no React, no DOM).
 *
 * The gameplay screen and the node simulation harness (tools/simTest.mjs)
 * drive this exact code, so every tuning number is checked by both.
 *
 * States:
 *   idle      standing on a platform, locked to it, ready to throw
 *   flight    thrown, no contact yet
 *   contact   touched something — settling, wobbling or falling
 *   failed    short beat before respawn (no modal)
 *   respawn   pop-in at the latest checkpoint
 *   complete  finish platform held — level done (fires once)
 *
 * Events are pushed to `session.events` and drained by the caller
 * (audio / particles / HUD). Nothing here reads the clock: time only moves
 * through `update(dt)`, in fixed PHYS.dt steps.
 */
import { PHYS, BOTTLE, TAU, wrap, SURFACES } from "../physics/constants.js";
import { makeBody, stepBody, launchVelocity } from "../physics/bottlePhysics.js";
import { buildSolids, placeSolids, platformTop } from "../physics/solids.js";

const DEG = Math.PI / 180;
export const TIMING = {
  settle: 0.32, // must stay upright & still this long to count (s)
  failDelay: 0.42, // beat after a failure before the respawn
  respawn: 0.22, // pop-in duration
  contactTimeout: 4, // never wobble forever
  flightTimeout: 6,
};

export function createSession(level, opts = {}) {
  const solids = buildSolids(level);
  // the floor ends every attempt it touches
  solids.push({
    x0: -4000, x1: 8000, y0: -60, y1: 0, bx0: -4000, bx1: 8000, by0: -60, by1: 0,
    px0: -4000, px1: 8000, py0: -60, py1: 0, vx: 0, vy: 0,
    landable: false, floor: true, pid: "floor", pIndex: -1, surface: level.floorSurface || "floor", moving: false,
  });
  const diff = level.difficulty || {};
  const s = {
    level,
    solids,
    t: 0, // simulation time (drives moving platforms)
    acc: 0,
    body: makeBody(),
    state: "idle",
    stateT: 0,
    platformIndex: 0, // platform the bottle stands on (idle)
    localX: 0,
    checkpoint: 0, // platform index to respawn on
    checkpointX: 0,
    progress: 0, // furthest platform index landed on
    finishIndex: level.platforms.length - 1,
    collected: new Set(opts.collected || []),
    falls: 0,
    flips: 0,
    landings: 0,
    perfects: 0,
    streak: 0,
    bestStreak: 0,
    events: [],
    tolerance: (diff.tolerance ?? 16) * DEG,
    assist: diff.assist ?? 1,
    grip: diff.grip ?? 1,
    wind: level.wind || 0,
    // per-throw tracking
    throwInfo: null,
    completeFired: false,
    facing: 1,
  };
  placeSolids(solids, 0);
  placeSolids(solids, 0);
  const start = level.platforms[0];
  const spawnX = level.spawnX ?? start.w * 0.7;
  s.checkpointX = spawnX;
  standOn(s, 0, spawnX);
  return s;
}

function emit(s, type, data = {}) {
  s.events.push({ type, ...data });
}

function standOn(s, index, localX) {
  const p = s.level.platforms[index];
  s.platformIndex = index;
  s.localX = Math.max(BOTTLE.w / 2 + 0.5, Math.min(p.w - BOTTLE.w / 2 - 0.5, localX));
  const tp = platformTop(p, s.t);
  const b = s.body;
  b.x = tp.x0 + s.localX;
  b.y = tp.top + BOTTLE.com;
  b.a = 0;
  b.vx = 0;
  b.vy = 0;
  b.w = 0;
  s.state = "idle";
  s.stateT = 0;
  s.facing = nextFacing(s, index);
}

/** Which way the next goal lies (for vertical-throw spin direction). */
function nextFacing(s, index) {
  const ps = s.level.platforms;
  const cur = ps[index];
  const nxt = ps[Math.min(ps.length - 1, Math.max(index, s.progress) + 1)];
  if (!nxt || nxt === cur) return s.facing || 1;
  return nxt.x + nxt.w / 2 >= cur.x + cur.w / 2 ? 1 : -1;
}

export function canThrow(s) {
  return s.state === "idle";
}

/** Throw from idle. angle in radians (π/2 = up), power 0..1. */
export function launch(s, angle, power) {
  if (s.state !== "idle") return false;
  const p = s.level.platforms[s.platformIndex];
  const tp = platformTop(p, s.t);
  const v = launchVelocity(angle, power, s.facing);
  const b = s.body;
  b.vx = v.vx + tp.vx;
  b.vy = v.vy + Math.max(0, tp.vy);
  b.w = v.w;
  s.state = "flight";
  s.stateT = 0;
  s.flips += 1;
  s.throwInfo = {
    from: s.platformIndex,
    startA: b.a,
    firstContact: null,
    maxTiltAfter: 0,
    bounces: 0,
    lastHalf: 0,
    power,
    env: { wind: s.wind, assist: s.assist, grip: s.grip, tolerance: s.tolerance, airborne: true, caught: false },
  };
  emit(s, "launch", { power });
  return true;
}

/** Positions of collectibles at time t (static for now). */
function checkCollectibles(s) {
  const list = s.level.collectibles;
  if (!list || !list.length) return;
  const b = s.body;
  for (let i = 0; i < list.length; i++) {
    if (s.collected.has(i)) continue;
    const c = list[i];
    // bottle as a short capsule along its axis
    const ax = -Math.sin(b.a);
    const ay = Math.cos(b.a);
    const rx = c.x - b.x;
    const ry = c.y - b.y;
    let along = rx * ax + ry * ay;
    along = Math.max(-BOTTLE.com, Math.min(BOTTLE.h - BOTTLE.com, along));
    const dx = rx - ax * along;
    const dy = ry - ay * along;
    if (dx * dx + dy * dy < (c.r ?? 9) ** 2) {
      s.collected.add(i);
      emit(s, "collect", { index: i, x: c.x, y: c.y });
    }
  }
}

function fail(s, reason) {
  if (s.state === "failed" || s.state === "respawn" || s.state === "complete") return;
  s.state = "failed";
  s.stateT = 0;
  s.falls += 1;
  s.streak = 0;
  emit(s, "fail", { reason, x: s.body.x, y: s.body.y });
}

/** Is the bottle's base resting on the top of one landable rect? */
function supportOf(s) {
  const b = s.body;
  const c = Math.cos(b.a);
  const sn = Math.sin(b.a);
  const by = -BOTTLE.com;
  const lx = -BOTTLE.w / 2;
  const rx = BOTTLE.w / 2;
  const L = [b.x + lx * c - by * sn, b.y + lx * sn + by * c];
  const R = [b.x + rx * c - by * sn, b.y + rx * sn + by * c];
  const midX = b.x - by * sn;
  for (const sd of s.solids) {
    if (!sd.landable) continue;
    if (Math.abs(L[1] - sd.y1) > 0.9 || Math.abs(R[1] - sd.y1) > 0.9) continue;
    // centre of the base must be over the top face (both corners at least touching)
    if (midX < sd.x0 || midX > sd.x1) continue;
    if (Math.max(L[0], R[0]) < sd.x0 || Math.min(L[0], R[0]) > sd.x1) continue;
    return sd;
  }
  return null;
}

function stepOnce(s) {
  const b = s.body;
  s.t += PHYS.dt;
  s.stateT += PHYS.dt;
  placeSolids(s.solids, s.t);

  if (s.state === "idle") {
    const p = s.level.platforms[s.platformIndex];
    const tp = platformTop(p, s.t);
    b.x = tp.x0 + s.localX;
    b.y = tp.top + BOTTLE.com;
    return;
  }
  if (s.state === "failed") {
    // let it keep tumbling briefly, then respawn
    if (s.stateT < TIMING.failDelay) {
      if (b.y > -40) stepBody(b, s.solids, { wind: 0, assist: 0, tolerance: 0, airborne: false });
    } else {
      s.state = "respawn";
      s.stateT = 0;
      const cp = s.checkpoint;
      standOn(s, cp, s.checkpointX);
      s.state = "respawn";
      emit(s, "respawn", {});
    }
    return;
  }
  if (s.state === "respawn") {
    const p = s.level.platforms[s.platformIndex];
    const tp = platformTop(p, s.t);
    b.x = tp.x0 + s.localX;
    b.y = tp.top + BOTTLE.com;
    if (s.stateT >= TIMING.respawn) {
      s.state = "idle";
      s.stateT = 0;
    }
    return;
  }
  if (s.state === "complete") {
    const p = s.level.platforms[s.platformIndex];
    const tp = platformTop(p, s.t);
    b.x = tp.x0 + s.localX;
    b.y = tp.top + BOTTLE.com;
    return;
  }

  // flight / contact
  const prevA = b.a;
  const ti = s.throwInfo;
  const env = ti.env;
  env.airborne = s.state === "flight";
  const contacts = stepBody(b, s.solids, env);

  // swish per half turn
  const turned = Math.abs(b.a - ti.startA);
  const half = Math.floor(turned / Math.PI);
  if (half > ti.lastHalf) {
    ti.lastHalf = half;
    emit(s, "swish", { half });
  }

  checkCollectibles(s);

  // bounds
  const bd = s.level.bounds;
  if (b.y < (bd?.y0 ?? -30) || b.x < (bd?.x0 ?? -200) - 40 || b.x > (bd?.x1 ?? 2000) + 40) {
    fail(s, "out");
    return;
  }

  if (contacts.length) {
    let hitFloor = false;
    let maxImpact = 0;
    let surface = "wood";
    let baseTop = false;
    for (const ct of contacts) {
      if (ct.s.floor) hitFloor = true;
      if (-ct.vn0 > maxImpact) {
        maxImpact = -ct.vn0;
        surface = ct.s.surface;
      }
      if (ct.top && ct.point <= 1) baseTop = true;
    }
    if (maxImpact > 35) emit(s, "impact", { speed: maxImpact, surface, x: b.x, y: b.y - BOTTLE.com, base: baseTop });
    if (s.state === "flight") {
      s.state = "contact";
      s.stateT = 0;
      ti.firstContact = {
        a: wrap(prevA),
        w: b.w,
        base: baseTop,
        x: b.x,
      };
    } else if (maxImpact > 60) {
      ti.bounces += 1;
    }
    if (hitFloor) {
      fail(s, "floor");
      return;
    }
  }

  if (s.state === "contact") {
    const aw = wrap(b.a);
    ti.maxTiltAfter = Math.max(ti.maxTiltAfter, Math.abs(aw));
    if (Math.abs(aw) > 72 * DEG && s.stateT > 0.08) {
      fail(s, "tipped");
      return;
    }
    const sup = Math.abs(aw) < 8 * DEG ? supportOf(s) : null;
    // "still" is measured relative to the surface — riding a moving drawer counts
    const slow = sup && Math.abs(b.w) < 0.6 && Math.hypot(b.vx - sup.vx, b.vy - sup.vy) < 12;
    if (sup && slow) {
      ti.settleT = (ti.settleT || 0) + PHYS.dt;
    } else {
      ti.settleT = 0;
    }
    if (sup && ti.settleT >= TIMING.settle) {
      land(s, sup);
      return;
    }
    // wobble cue while balancing near an edge
    if (sup === null && Math.abs(aw) < 30 * DEG && Math.abs(b.w) > 0.8 && contacts.length && !ti.wobbled) {
      ti.wobbled = true;
      emit(s, "wobble", {});
    }
    if (s.stateT > TIMING.contactTimeout) fail(s, "stuck");
  } else if (s.state === "flight" && s.stateT > TIMING.flightTimeout) {
    fail(s, "out");
  }
}

function land(s, sup) {
  const b = s.body;
  const ti = s.throwInfo;
  const index = sup.pIndex;
  const p = s.level.platforms[index];
  const tp = platformTop(p, s.t);
  const localX = b.x - tp.x0;
  const fc = ti.firstContact || { a: 0, w: 0 };
  const centerErr = Math.abs(localX - p.w / 2) / (p.w / 2);
  const turns = Math.abs(b.a - ti.startA) / TAU;
  const flipped = turns > 0.75;
  const perfect =
    flipped &&
    Math.abs(fc.a) < 4 * DEG &&
    ti.maxTiltAfter < 5 * DEG &&
    ti.bounces === 0 &&
    centerErr < 0.45;
  // normalise the rotation (keeps the angle small forever)
  b.a = wrap(b.a);
  s.landings += 1;
  if (flipped) {
    s.streak += 1;
    s.bestStreak = Math.max(s.bestStreak, s.streak);
  }
  if (perfect) s.perfects += 1;
  const progressed = index > s.progress;
  if (progressed) s.progress = index;
  // every landing is a checkpoint — respawn where you last stood
  s.checkpoint = index;
  s.checkpointX = localX;
  const isFinish = index === s.finishIndex;
  emit(s, "land", {
    perfect,
    flipped,
    turns: Math.round(turns),
    platform: index,
    progressed,
    streak: s.streak,
    surface: sup.surface,
    x: b.x,
    y: tp.top,
    finish: isFinish,
  });
  standOn(s, index, localX);
  if (isFinish && !s.completeFired) {
    s.completeFired = true;
    s.state = "complete";
    emit(s, "complete", {});
  }
}

/** Advance by a real frame delta (seconds). Clamped; fixed sub-steps. */
export function update(s, dt) {
  s.acc += Math.min(Math.max(dt, 0), PHYS.maxFrame);
  let n = 0;
  while (s.acc >= PHYS.dt && n < 40) {
    stepOnce(s);
    s.acc -= PHYS.dt;
    n += 1;
  }
}

/** Quick retry (R): a throw in progress counts as a fall and respawns now. */
export function quickRetry(s) {
  if (s.state !== "flight" && s.state !== "contact") return false;
  fail(s, "retry");
  s.stateT = TIMING.failDelay;
  return true;
}

/** Instant retry of the whole level (keeps collected stars for this run). */
export function resetToCheckpoint(s) {
  if (s.state === "complete") return;
  standOn(s, s.checkpoint, s.checkpointX);
}

export function drainEvents(s) {
  const e = s.events;
  s.events = [];
  return e;
}

/** How far into the level: landings made toward the finish. */
export function progressInfo(s) {
  return { done: s.progress, total: s.finishIndex };
}

export { SURFACES };
