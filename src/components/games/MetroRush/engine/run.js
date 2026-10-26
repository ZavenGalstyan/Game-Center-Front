/**
 * Metro Rush — one run of the endless runner as plain data + functions.
 * No Three.js, no DOM: the renderer mirrors this state every frame, the
 * headless tests drive it directly.
 *
 *   createRun(opts)            new run
 *   stepRun(run, dt, actions)  advance (fixed 1/120 s sub-steps); actions is
 *                              a list of 'left' | 'right' | 'up' | 'down' | 'board'
 *   reviveRun(run)             continue after a crash (clears nearby danger)
 *
 * run.events collects what happened since the consumer last cleared it
 * (coin, jump, land, slide, bump, crash, power, smash, horn, theme…).
 */
import {
  BARRIER_H, BARRIER_L, BOOST_MUL, CAR_L, COIN_R, DESPAWN_BEHIND, FAST_FALL_V, GEN_AHEAD, GRACE_T, INPUT_BUFFER_T,
  LANES, LAT_SPEED, LW, MAGNET_RX, MAGNET_RZ, MOVING_ACT, OB_HALF_W, OVERHEAD_TOP, OVERHEAD_Y, P_HALF_L, P_HALF_W,
  P_SLIDE_H, P_STAND_H, POWER_T, RAMP_L, SLIDE_T, SPEED_START, STEP, STEP_UP, TRAIN_H, TRAIN_HALF_W,
  clamp, difficultyAt, gravityAt, jumpVel, laneX, speedAt,
} from "./config.js";
import { rngNext, rngWeighted } from "./rng.js";
import { boostChunk, dressChunk, makeChunk, startChunk } from "./generator.js";

export const THEME_LEG = 1500; // metres per city on a World Tour
const TRAIN_HIT_TOP = TRAIN_H - 0.4; // ramp tops arrive at ~2.9 m, so the body box stops below

export function newStats() {
  return {
    dist: 0, coins: 0, score: 0, jumps: 0, slides: 0, lanes: 0, barriersJumped: 0, overheadsSlid: 0,
    trainsDodged: 0, trainsPassed: 0, roofDist: 0, ramps: 0, powerups: 0, magnets: 0, mults: 0, shields: 0,
    boards: 0, boosts: 0, smashed: 0, stumbles: 0, revives: 0, time: 0, maxSpeed: 0, closeCalls: 0,
  };
}

export function createRun(opts = {}) {
  const run = {
    seed: opts.seed ?? ((Math.random() * 2 ** 31) | 0),
    rng: { s: (opts.seed ?? ((Math.random() * 2 ** 31) | 0)) | 0 },
    t: 0,
    acc: 0,
    dist: 0,
    speed: SPEED_START,
    baseMult: Math.max(1, opts.baseMult || 1),
    over: false,
    crash: null,
    themeStart: opts.themeIndex ?? 0,
    tour: !!opts.tour,
    themeIndex: opts.themeIndex ?? 0,
    boardsLeft: Math.max(0, opts.boards ?? 0),
    p: {
      lane: 1, tlane: 1, x: 0, y: 0, vy: 0, ground: true, slideT: 0, jumpBuf: 0, slideBuf: 0,
      stumbleT: 0, graceT: 0, lean: 0, lastBump: -9, airT: 0, onRoof: false, prevZ: 0,
    },
    power: { magnet: 0, mult: 0, shield: 0, board: 0, boost: 0 },
    obs: [],
    coins: [],
    pickups: [],
    chunks: [],
    nextId: 1,
    frontier: 0,
    exitLane: 1,
    lastPowerZ: 0,
    powerGap: 260,
    stats: newStats(),
    events: [],
    noPower: !!opts.noPower,
    powerT: { ...POWER_T, ...(opts.powerT || {}) },
  };
  addChunk(run, startChunk(SPEED_START));
  run.powerGap = 220 + rngNext(run.rng) * 160;
  fillAhead(run);
  return run;
}

/* ------------------------------------------------------------------ generation */
function addChunk(run, ch) {
  const z0 = run.frontier;
  const chunk = { z0, len: ch.len, items: ch.items, v: ch.v, fallback: !!ch.fallback, boost: !!ch.boost };
  run.chunks.push(chunk);
  for (const it of ch.items) {
    const o = {
      id: run.nextId++, kind: it.kind, lane: it.lane, x: laneX(it.lane), z0: z0 + it.z0, z1: z0 + it.z1,
      ramp: !!it.ramp, moving: !!it.moving, u: it.u || 0, cars: it.cars || 0, active: false, hit: false, passed: false,
    };
    if (o.moving) o.trig = o.z0 - MOVING_ACT;
    run.obs.push(o);
  }
  for (const c of ch.coins) run.coins.push({ id: run.nextId++, x: c.x, y: c.y, z: z0 + c.z, taken: false, fly: 0 });
  if (ch.pickup) run.pickups.push({ id: run.nextId++, kind: ch.pickup.kind, x: ch.pickup.x, y: ch.pickup.y, z: z0 + ch.pickup.z, taken: false });
  run.exitLane = ch.exitLane ?? run.exitLane;
  run.frontier = z0 + ch.len;
  if (run.chunks.length > 40) run.chunks.shift();
}

function pickPower(run) {
  const d = difficultyAt(run.frontier);
  return rngWeighted(run.rng, [
    ["magnet", 3],
    ["mult", 2.4],
    ["shield", 2],
    ["board", 1.4],
    ["boost", d > 0.04 ? 1.1 : 0],
  ]);
}

function fillAhead(run) {
  let guard = 0;
  while (run.frontier < run.dist + GEN_AHEAD && guard++ < 20) {
    const v = speedAt(run.t);
    const boosting = run.power.boost > 0 && run.frontier < run.dist + run.power.boost * v * BOOST_MUL + v * 3;
    if (boosting) {
      const ch = boostChunk(run.rng, Math.max(v, SPEED_START), run.exitLane);
      ch.boost = true;
      addChunk(run, ch);
      continue;
    }
    // speed estimate on arrival and on exit
    const tArr = run.t + Math.max(0, run.frontier - run.dist) / Math.max(v, 1);
    const vA = speedAt(tArr);
    const d = difficultyAt(run.frontier);
    const ch = makeChunk(run.rng, vA, speedAt(tArr + 14) * 1.03, d, run.exitLane);
    let power = null;
    if (!run.noPower && run.frontier - run.lastPowerZ > run.powerGap) power = pickPower(run);
    const dressed = dressChunk(run.rng, ch, { power, entry: run.exitLane });
    if (dressed.pickup) {
      run.lastPowerZ = run.frontier + dressed.pickup.z;
      run.powerGap = 320 + rngNext(run.rng) * 320;
    }
    addChunk(run, { ...ch, coins: dressed.coins, pickup: dressed.pickup, exitLane: dressed.exitLane });
  }
}

/* ------------------------------------------------------------------ queries */
const invulnerable = (run) => run.power.shield > 0 || run.power.boost > 0 || run.p.graceT > 0;

/** walkable height under (x, z) */
export function surfaceAt(run, x, z) {
  let h = 0;
  for (const o of run.obs) {
    if (o.kind !== "train" || o.hit) continue;
    if (Math.abs(x - o.x) > LW / 2 + 0.01) continue;
    if (z >= o.z0 && z <= o.z1) h = Math.max(h, TRAIN_H);
    else if (o.ramp && z >= o.z0 - RAMP_L && z < o.z0) h = Math.max(h, (TRAIN_H * (z - (o.z0 - RAMP_L))) / RAMP_L);
  }
  return h;
}

function boxOf(o) {
  if (o.kind === "barrier") return [o.x - OB_HALF_W, o.x + OB_HALF_W, 0, BARRIER_H, o.z0, o.z1];
  if (o.kind === "overhead") return [o.x - OB_HALF_W, o.x + OB_HALF_W, OVERHEAD_Y, OVERHEAD_TOP, o.z0, o.z1];
  return [o.x - TRAIN_HALF_W, o.x + TRAIN_HALF_W, 0, TRAIN_HIT_TOP, o.z0, o.z1];
}
const playerH = (p) => (p.slideT > 0 ? P_SLIDE_H : P_STAND_H);

function overlapping(o, x, y, h, z) {
  const b = boxOf(o);
  return x + P_HALF_W > b[0] && x - P_HALF_W < b[1] && y + h > b[2] && y < b[3] && z + P_HALF_L > b[4] && z - P_HALF_L < b[5];
}
const zOverlap = (o, z) => z + P_HALF_L > o.z0 && z - P_HALF_L < o.z1;

/* ------------------------------------------------------------------ actions */
function doJump(run) {
  const p = run.p;
  const g = gravityAt(run.speed);
  p.vy = jumpVel(g) * (run.power.board > 0 ? 1.08 : 1);
  p.ground = false;
  p.slideT = 0;
  p.jumpBuf = 0;
  run.stats.jumps++;
  run.events.push({ type: "jump" });
}
function doSlide(run) {
  const p = run.p;
  if (p.slideT <= 0) run.stats.slides++;
  p.slideT = SLIDE_T;
  p.slideBuf = 0;
  run.events.push({ type: "slide" });
}

export function applyAction(run, a) {
  if (run.over) return;
  const p = run.p;
  if (a === "left" || a === "right") {
    const t = clamp(p.tlane + (a === "left" ? -1 : 1), 0, LANES - 1);
    if (t === p.tlane) {
      run.events.push({ type: "edge" });
      return;
    }
    p.tlane = t;
    run.stats.lanes++;
    run.events.push({ type: "lane", dir: a === "left" ? -1 : 1 });
  } else if (a === "up") {
    if (p.ground) doJump(run);
    else p.jumpBuf = INPUT_BUFFER_T;
  } else if (a === "down") {
    if (p.ground) doSlide(run);
    else {
      p.vy = Math.min(p.vy, FAST_FALL_V);
      p.slideBuf = INPUT_BUFFER_T + 0.3;
    }
  } else if (a === "board") {
    activateBoard(run);
  }
}

export function activateBoard(run) {
  if (run.over || run.power.board > 0 || run.boardsLeft <= 0) return false;
  run.boardsLeft--;
  run.power.board = run.powerT.board;
  run.stats.boards++;
  run.events.push({ type: "power", kind: "board", fromInventory: true });
  return true;
}

function grantPower(run, kind) {
  run.stats.powerups++;
  if (kind === "magnet") run.stats.magnets++;
  else if (kind === "mult") run.stats.mults++;
  else if (kind === "shield") run.stats.shields++;
  else if (kind === "boost") run.stats.boosts++;
  else if (kind === "board") run.stats.boards++;
  run.power[kind] = Math.max(run.power[kind], run.powerT[kind]);
  if (kind === "boost") {
    // the boosted stretch is obstacle-free: regenerate everything not yet in view
    const keep = run.dist + 70;
    run.obs = run.obs.filter((o) => o.z0 < keep || o.active);
    run.coins = run.coins.filter((c) => c.z < keep);
    run.pickups = run.pickups.filter((c) => c.z < keep);
    run.chunks = run.chunks.filter((c) => c.z0 < keep);
    for (const c of run.chunks) if (c.z0 + c.len > keep) c.len = keep - c.z0;
    run.frontier = Math.max(keep, run.dist + 20);
  }
  run.events.push({ type: "power", kind });
}

/* ------------------------------------------------------------------ crash / revive */
function crash(run, o, how) {
  const p = run.p;
  if (run.power.board > 0) {
    // the hoverboard takes the hit
    run.power.board = 0;
    p.graceT = GRACE_T;
    o.hit = true;
    run.stats.smashed++;
    run.events.push({ type: "boardBreak", id: o.id, kind: o.kind });
    return;
  }
  run.over = true;
  run.crash = { kind: o.kind, how, id: o.id, x: p.x, y: p.y, z: run.dist, moving: o.moving };
  run.events.push({ type: "crash", kind: o.kind, how, moving: o.moving });
}

/** continue after a crash: clear what's around the runner, short grace */
export function reviveRun(run) {
  if (!run.over) return;
  const p = run.p;
  const z = run.dist;
  const reach = run.speed * 2.2;
  for (const o of run.obs) {
    if (o.z1 > z - 4 && o.z0 < z + reach) o.hit = true;
    if (o.moving && o.z0 < z + MOVING_ACT + 40) o.hit = true;
  }
  run.over = false;
  run.crash = null;
  p.graceT = GRACE_T + 1;
  p.y = 0;
  p.vy = 0;
  p.ground = true;
  p.slideT = 0;
  p.tlane = p.lane = clamp(Math.round(p.x / LW) + 1, 0, 2);
  p.x = laneX(p.lane);
  run.stats.revives++;
  run.events.push({ type: "revive" });
}

/* ------------------------------------------------------------------ step */
export function stepRun(run, dt, actions) {
  if (actions && actions.length) for (const a of actions) applyAction(run, a);
  if (run.over) return;
  run.acc = Math.min(run.acc + dt, 0.1);
  while (run.acc >= STEP && !run.over) {
    run.acc -= STEP;
    sub(run, STEP);
  }
}

function sub(run, dt) {
  const p = run.p;
  const S = run.stats;
  run.t += dt;
  S.time = run.t;

  /* ---------------- timers */
  for (const k in run.power) if (run.power[k] > 0) run.power[k] = Math.max(0, run.power[k] - dt);
  if (run.power.boost <= 0 && run._boosting) {
    run._boosting = false;
    p.graceT = Math.max(p.graceT, GRACE_T);
    run.events.push({ type: "boostEnd" });
  }
  if (run.power.boost > 0) run._boosting = true;
  p.graceT = Math.max(0, p.graceT - dt);
  p.stumbleT = Math.max(0, p.stumbleT - dt);
  p.jumpBuf = Math.max(0, p.jumpBuf - dt);
  p.slideBuf = Math.max(0, p.slideBuf - dt);
  if (p.slideT > 0) p.slideT = Math.max(0, p.slideT - dt);

  /* ---------------- speed */
  const base = speedAt(run.t);
  const v = base * (p.stumbleT > 0 ? 0.82 : 1) * (run.power.boost > 0 ? BOOST_MUL : 1);
  run.speed = v;
  S.maxSpeed = Math.max(S.maxSpeed, v);
  const prevZ = run.dist;
  run.dist += v * dt;
  const z = run.dist;
  const dz = z - prevZ;
  S.dist = z;

  /* ---------------- moving trains */
  for (const o of run.obs) {
    if (!o.moving) continue;
    if (!o.active && z >= o.trig) {
      o.active = true;
      run.events.push({ type: "horn", id: o.id });
    }
    if (o.active) {
      o.z0 -= o.u * dt;
      o.z1 -= o.u * dt;
    }
  }

  /* ---------------- lateral */
  const tx = laneX(p.tlane);
  if (Math.abs(tx - p.x) > 1e-4) {
    const nx = p.x + clamp(tx - p.x, -LAT_SPEED * dt, LAT_SPEED * dt);
    let blocked = null;
    const h = playerH(p);
    for (const o of run.obs) {
      if (o.hit || Math.abs(o.z0 - z) > 40) continue;
      if (overlapping(o, nx, p.y, h, z) && !overlapping(o, p.x, p.y, h, z) && zOverlap(o, prevZ)) {
        blocked = o;
        break;
      }
    }
    // stepping sideways onto a ramp that's already higher than a step
    if (!blocked && p.ground) {
      const sNew = surfaceAt(run, nx, z);
      if (sNew > p.y + STEP_UP) blocked = { kind: "ramp" };
    }
    if (blocked && invulnerable(run) && blocked.id) {
      blocked.hit = true;
      S.smashed++;
      run.events.push({ type: "smash", id: blocked.id, kind: blocked.kind });
      blocked = null;
    }
    if (blocked) {
      // side bump: bounce back to the lane we came from
      const back = clamp(Math.round(p.x / LW) + 1, 0, 2);
      p.tlane = back === p.tlane ? clamp(p.tlane - Math.sign(tx - p.x), 0, 2) : back;
      if (run.t - p.lastBump > 0.25) {
        p.stumbleT = 0.6;
        S.stumbles++;
        run.events.push({ type: "bump", kind: blocked.kind });
      }
      p.lastBump = run.t;
    } else {
      p.lean = clamp((nx - p.x) / (LAT_SPEED * dt), -1, 1);
      p.x = nx;
    }
  } else p.lean *= 0.85;
  p.lane = clamp(Math.round(p.x / LW) + 1, 0, 2);

  /* ---------------- vertical */
  const g = gravityAt(base);
  const surf = surfaceAt(run, p.x, z);
  const prevY = p.y;
  if (p.ground) {
    if (surf > p.y && surf - p.y <= STEP_UP) p.y = surf;
    else if (surf < p.y - 0.02) {
      p.ground = false;
      p.vy = 0;
    }
  }
  if (!p.ground) {
    p.vy -= g * (run.power.board > 0 ? 0.92 : 1) * dt;
    p.y += p.vy * dt;
    p.airT += dt;
    if (p.y <= surf && prevY >= surf - STEP_UP) {
      p.y = surf;
      const hard = p.vy < -14;
      p.vy = 0;
      p.ground = true;
      p.airT = 0;
      run.events.push({ type: "land", hard });
      if (p.slideBuf > 0) doSlide(run);
      else if (p.jumpBuf > 0) doJump(run);
    }
  }
  const roofNow = p.ground && p.y >= TRAIN_H - 0.05;
  if (roofNow) S.roofDist += dz;
  if (roofNow && !p.onRoof) {
    p.onRoof = true;
    S.ramps++;
    run.events.push({ type: "roof" });
  } else if (!roofNow && p.ground) p.onRoof = false;

  /* ---------------- obstacle collisions */
  const h = playerH(p);
  for (const o of run.obs) {
    if (o.hit) continue;
    if (o.z0 > z + 2 || o.z1 < z - 2) {
      // passing bookkeeping
      if (!o.passed && o.z1 < z - P_HALF_L) passObstacle(run, o);
      continue;
    }
    if (!overlapping(o, p.x, p.y, h, z)) continue;
    if (invulnerable(run)) {
      o.hit = true;
      S.smashed++;
      run.events.push({ type: "smash", id: o.id, kind: o.kind });
      continue;
    }
    // side contact while already alongside → bump; otherwise a head-on crash
    if (!o.moving && zOverlap(o, prevZ) && Math.abs(p.x - o.x) > 0.3) {
      const side = Math.sign(p.x - o.x);
      p.tlane = clamp(o.lane + side, 0, 2);
      p.x = o.x + side * ((o.kind === "train" ? TRAIN_HALF_W : OB_HALF_W) + P_HALF_W + 0.01);
      if (run.t - p.lastBump > 0.25) {
        p.stumbleT = 0.6;
        S.stumbles++;
        run.events.push({ type: "bump", kind: o.kind });
      }
      p.lastBump = run.t;
      continue;
    }
    crash(run, o, o.kind === "barrier" ? "trip" : o.kind === "overhead" ? "head" : "front");
    if (run.over) return;
  }

  /* ---------------- coins + pickups */
  const magnet = run.power.magnet > 0 || run.power.boost > 0;
  const py = p.y + (p.slideT > 0 ? 0.45 : 0.95);
  for (const c of run.coins) {
    if (c.taken) continue;
    const dzc = c.z - z;
    if (dzc < -3) continue;
    if (dzc > MAGNET_RZ + 2) break;
    if (magnet && dzc < MAGNET_RZ && Math.abs(c.x - p.x) < MAGNET_RX) c.fly = Math.min(1, c.fly + dt * 4.5);
    if (c.fly > 0) {
      const k = Math.min(1, dt * (8 + c.fly * 18));
      c.x += (p.x - c.x) * k;
      c.y += (py - c.y) * k;
      c.z += (z - c.z) * k + dz;
    }
    const dx = c.x - p.x;
    const dy = c.y - py;
    const dd = c.z - z;
    if (dx * dx + dy * dy + dd * dd < COIN_R * COIN_R * (c.fly > 0 ? 2.2 : 1)) {
      c.taken = true;
      S.coins++;
      run.events.push({ type: "coin", x: c.x, y: c.y, z: c.z });
    }
  }
  for (const u of run.pickups) {
    if (u.taken) continue;
    const dx = u.x - p.x;
    const dy = u.y - py;
    const dd = u.z - z;
    if (dx * dx + dy * dy + dd * dd < 1.3 * 1.3) {
      u.taken = true;
      grantPower(run, u.kind);
    }
  }

  /* ---------------- score */
  const mult = run.baseMult * (run.power.mult > 0 ? 2 : 1);
  run.mult = mult;
  run.scoreF = (run.scoreF || 0) + dz * mult;
  S.score = Math.floor(run.scoreF + S.coins * 5);

  /* ---------------- theme leg */
  if (run.tour) {
    const idx = (run.themeStart + Math.floor(z / THEME_LEG)) % 5;
    if (idx !== run.themeIndex) {
      run.themeIndex = idx;
      run.events.push({ type: "theme", index: idx });
    }
  }

  /* ---------------- recycle */
  if (run._recycleT === undefined || run.t - run._recycleT > 0.25) {
    run._recycleT = run.t;
    const cut = z - DESPAWN_BEHIND;
    for (const o of run.obs) if (!o.passed && o.z1 < z - P_HALF_L) passObstacle(run, o);
    if (run.obs.length && run.obs.some((o) => o.z1 < cut)) run.obs = run.obs.filter((o) => o.z1 >= cut);
    if (run.coins.length && run.coins[0].z < cut) run.coins = run.coins.filter((c) => c.z >= cut && !(c.taken && c.z < z));
    else if (run.coins.length > 400) run.coins = run.coins.filter((c) => !c.taken || c.z > z);
    if (run.pickups.length && run.pickups.some((u) => u.z < cut)) run.pickups = run.pickups.filter((u) => u.z >= cut);
  }
  fillAhead(run);
}

function passObstacle(run, o) {
  o.passed = true;
  if (o.hit) return;
  const p = run.p;
  const S = run.stats;
  const sameLane = Math.abs(p.x - o.x) < 1.2;
  if (o.kind === "train") {
    if (o.moving) S.trainsDodged++;
    else S.trainsPassed++;
    if (!sameLane && Math.abs(p.x - o.x) < LW * 1.2 && p.y < 1) {
      S.closeCalls++;
      run.events.push({ type: "whoosh", moving: o.moving });
    }
  } else if (sameLane && o.kind === "barrier" && p.y > 0.5) S.barriersJumped++;
  else if (sameLane && o.kind === "overhead") S.overheadsSlid++;
}

/** obstacles cost nothing to clone — used by bots that look ahead */
export function cloneRun(run) {
  return structuredClone({ ...run, events: [] });
}

export const RUN_CONST = { CAR_L, BARRIER_L };
