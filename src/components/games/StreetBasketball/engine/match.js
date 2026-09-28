/**
 * Street Basketball — the authoritative game engine (no Three.js, no DOM).
 *
 * One engine runs every mode: a 1v1 match, Free Shoot and the other training
 * drills. It owns ONE ball and ONE possession record:
 *
 *   g.owner  — "p" | "o" | null   (who holds / dribbles the ball)
 *   g.bmode  — held | dribble | cross | flight | loose | dunk | dead
 *
 * and those two fields are only ever changed by the possession functions
 * below (giveBall / releaseShot / makeBallFree / setDead / resetPossession),
 * which keep them consistent: a non-null owner ⇔ a carried mode.
 *
 * Time advances in fixed 1/240 s steps (frame time is accumulated, clamped
 * and never "caught up" after a tab switch), so a shot behaves the same at
 * any frame rate. Controllers (keyboard/touch for the player, ai.js for the
 * opponent) feed the SAME intent format — the AI can do nothing the player
 * can't, and never sees the player's inputs (it reads delayed snapshots).
 */
import {
  RIM_Y, BALL_R, BODY_R, PHYS_DT, MAX_FRAME_DT, CHECK_SPOT, COURT_HALF_W, COURT_FAR_Z,
  BASELINE_Z, ARC_R, pointsFrom,
} from "./constants.js";
import { makeBall, stepBall } from "./ballPhysics.js";
import { planShot, meterZone, METER_TIME, launchTo } from "./shot.js";
import { createRng } from "./rng.js";
import {
  BODY, ARM_REACH, ATHLETE_G, createAthlete, local, handSign, angleTo, wrap, turnToward,
  integrateMove, clampToCourt, separate, fwd, maxSpeed,
} from "./athlete.js";

export const MODES = ["match", "free", "three", "dunk", "dribble", "defense"];

const STAT_KEYS = ["points", "fga", "fgm", "twoA", "twoM", "perfect", "layups", "dunks", "blocks", "steals", "rebounds", "crossovers", "swishes", "turnovers"];
const newStats = () => Object.fromEntries(STAT_KEYS.map((k) => [k, 0]));

const LAYUP_RANGE = 3.3;
const DUNK_MAX = 3.1;
const DUNK_MIN = 1.1;

/* ================================================================ create */

/**
 * cfg: {
 *   mode, seed, target,
 *   player:   { ratings, look, dunks: [styleIds] },
 *   opponent: { ratings, look, dunks } | null,
 *   firstOffense: "p" | "o",
 * }
 */
export function createGame(cfg) {
  const rng = createRng(cfg.seed || 1);
  const P = createAthlete("p", cfg.player.ratings, cfg.player.look);
  P.dunks = cfg.player.dunks?.length ? cfg.player.dunks : ["one"];
  const O = cfg.opponent ? createAthlete("o", cfg.opponent.ratings, cfg.opponent.look) : null;
  if (O) O.dunks = cfg.opponent.dunks?.length ? cfg.opponent.dunks : ["one"];
  const g = {
    cfg,
    mode: cfg.mode || "match",
    rng,
    time: 0,
    acc: 0,
    alpha: 0,
    P,
    O,
    ath: O ? [P, O] : [P],
    ball: makeBall(),
    owner: null,
    bmode: "dead",
    lastTouch: null,
    offense: cfg.firstOffense || "p",
    phase: "check",
    phaseT: 0,
    score: { p: 0, o: 0 },
    target: cfg.target || 11,
    stats: { p: newStats(), o: newStats() },
    events: [],
    shotSeq: 0,
    snaps: [],
    controllers: {},
    paused: false,
    over: false,
    result: null,
    drill: null,
    looseT: 0,
    deadT: 0,
    possession: 0,
    streak: 0,
    bestStreak: 0,
    shake: 0,
  };
  g.byId = (id) => (id === "p" ? g.P : g.O);
  g.other = (id) => (id === "p" ? g.O : g.P);
  setupDrill(g);
  resetPossession(g, g.offense, true);
  return g;
}

export function setController(g, id, ctl) {
  g.controllers[id] = ctl;
}

function emit(g, type, data = {}) {
  g.events.push({ type, t: g.time, ...data });
}

export function drainEvents(g) {
  const e = g.events;
  g.events = [];
  return e;
}

/* ===================================================== possession system */

/** The only way an athlete gains the ball. */
export function giveBall(g, a, how = "held") {
  const prevOwner = g.owner;
  g.owner = a.id;
  g.bmode = how;
  g.lastTouch = a.id;
  const b = g.ball;
  b.v.x = 0; b.v.y = 0; b.v.z = 0;
  b.shot = null;
  b.pass = false;
  b.poke = null;
  a.drib = null;
  a.holdT = 0;
  a.cd.pickup = 0;
  g.looseT = 0;
  return prevOwner;
}

/** Detach the ball as a live shot. */
function releaseShot(g, a, v, shot) {
  g.owner = null;
  g.bmode = "flight";
  const b = g.ball;
  b.v.x = v.x; b.v.y = v.y; b.v.z = v.z;
  // backspin, like a real release
  const h = Math.hypot(v.x, v.z) || 1;
  b.w.x = (-v.z / h) * 16;
  b.w.y = 0;
  b.w.z = (v.x / h) * 16;
  b.shot = shot;
  b.belowEntry = false;
  g.lastTouch = a.id;
  a.drib = null;
  a.cd.pickup = 0.45;
}

/** Ball becomes a live loose ball (rebound, poke, block, pass). */
export function makeBallFree(g, v = null) {
  g.owner = null;
  g.bmode = "loose";
  if (v) {
    g.ball.v.x = v.x; g.ball.v.y = v.y; g.ball.v.z = v.z;
  }
  g.looseT = 0;
}

function setDead(g) {
  g.owner = null;
  g.bmode = "dead";
  g.deadT = 0;
  g.looseT = 0;
}

/** Clear-out and check: offense at the top with the ball, defense in front. */
export function resetPossession(g, offenseId, first = false) {
  g.offense = offenseId;
  g.possession += 1;
  const off = g.byId(offenseId);
  const def = g.O ? g.other(offenseId) : null;
  const spot = g.drill?.spawn ? g.drill.spawn(g) : CHECK_SPOT;
  for (const a of g.ath) {
    a.act = null;
    a.vx = 0; a.vz = 0; a.y = 0; a.vy = 0; a.air = false;
    a.slow = 0;
    a.ctl = { shoot: false, drive: false };
    a.driving = false;
    a.hands.L = null; a.hands.R = null;
  }
  off.x = spot.x; off.z = spot.z;
  off.facing = angleTo(off, 0, 0);
  if (def) {
    const d = Math.hypot(off.x, off.z) || 1;
    def.x = off.x - (off.x / d) * 1.7;
    def.z = off.z - (off.z / d) * 1.7;
    def.facing = angleTo(def, off.x, off.z);
  }
  for (const a of g.ath) { a.prevX = a.x; a.prevZ = a.z; a.prevY = 0; a.prevFacing = a.facing; }
  giveBall(g, off, "held");
  carryBall(g, 0);
  const b = g.ball;
  b.prev = { ...b.p };
  b.belowEntry = false;
  g.phase = g.mode === "match" || g.mode === "defense" ? "check" : "live";
  g.phaseT = 0;
  if (!first) emit(g, "possession", { offense: offenseId });
  if (g.phase === "check") emit(g, "check", { offense: offenseId });
}

function changeOffense(g, id) {
  if (g.offense === id) return;
  g.offense = id;
  emit(g, "turnover", { offense: id });
}

/* =================================================================== step */

/** Advance by one rendered frame (seconds). */
export function advance(g, frameDt) {
  if (g.paused || g.freeze) return; // freeze: test-only hook (dev harness)
  const dt = Math.min(Math.max(frameDt, 0), MAX_FRAME_DT);
  g.acc += dt;
  let n = 0;
  while (g.acc >= PHYS_DT && n < 40) {
    g.acc -= PHYS_DT;
    step(g, PHYS_DT);
    n++;
  }
  if (n >= 40) g.acc = 0;
  g.alpha = g.acc / PHYS_DT;
}

export function step(g, dt) {
  g.time += dt;
  g.phaseT += dt;
  g.shake = Math.max(0, g.shake - dt * 3);
  const b = g.ball;
  b.prev = { x: b.p.x, y: b.p.y, z: b.p.z };
  for (const a of g.ath) {
    a.prevX = a.x; a.prevZ = a.z; a.prevY = a.y; a.prevFacing = a.facing;
    for (const k in a.cd) a.cd[k] = Math.max(0, a.cd[k] - dt);
    if (a.slow > 0) a.slow = Math.max(0, a.slow - dt);
    if (a.celebrate > 0) a.celebrate = Math.max(0, a.celebrate - dt);
  }
  recordSnapshot(g);
  phaseLogic(g, dt);

  // controllers → intents
  for (const a of g.ath) {
    const ctl = g.controllers[a.id];
    const intent = ctl ? ctl.intent(g, a, dt) : null;
    applyIntent(g, a, intent || NO_INTENT, dt);
  }
  for (const a of g.ath) updateAction(g, a, dt);
  for (const a of g.ath) moveAthlete(g, a, dt);
  if (g.O) separate(g.P, g.O);
  for (const a of g.ath) clampToCourt(a);

  updateBall(g, dt);
  for (const a of g.ath) computeHands(g, a);
  checkBlocks(g);
  checkSteals(g);
  checkPickups(g);
  drillLogic(g, dt);
  for (const a of g.ath) a.anim = animLabel(g, a);
  if (DEV_ASSERT) assertInvariants(g);
}

const NO_INTENT = { mx: 0, mz: 0, sprint: false, events: [] };
let DEV_ASSERT = false;
export function enableAsserts(v) {
  DEV_ASSERT = v;
}

/* ============================================================ phases */

function phaseLogic(g, dt) {
  if (g.phase === "check") {
    if (g.phaseT > 1.0) {
      g.phase = "live";
      g.phaseT = 0;
      emit(g, "live");
    }
  } else if (g.phase === "scored") {
    if (g.phaseT > 1.45) {
      if (g.mode === "match") {
        if (g.pendingOver) finishMatch(g);
        else resetPossession(g, g.other(g.lastScorer).id);
      } else if (g.mode === "defense") {
        nextDefenseRep(g);
      }
    }
  } else if (g.phase === "reset") {
    if (g.phaseT > 0.9) {
      if (g.mode === "defense") nextDefenseRep(g);
      else resetPossession(g, g.pendingOffense || g.offense);
    }
  }
  // Stuck ball (wedged on the hoop): after 3 s it's dead, defense's ball
  if (g.O && g.phase === "live" && g.bmode === "loose" && g.ball.p.y > RIM_Y - 0.3 && Math.hypot(g.ball.v.x, g.ball.v.y, g.ball.v.z) < 0.8) {
    g.stuckT = (g.stuckT || 0) + dt;
    if (g.stuckT > 3) {
      g.stuckT = 0;
      const to = g.offense === "p" ? "o" : "p";
      setDead(g);
      g.pendingOffense = to;
      g.phase = "reset";
      g.phaseT = 0;
      emit(g, "stuckBall", { to });
    }
  } else g.stuckT = 0;
  // Ball stuck / out of reach in solo modes → rebounder passes it back
  if (!g.O || g.mode === "dunk" || g.mode === "three") {
    if (g.bmode === "loose" || g.bmode === "dead") {
      g.looseT += dt;
      const b = g.ball;
      const settled = b.p.y < 1.4 && Math.hypot(b.v.x, b.v.z) < 3.5;
      const wait = g.bmode === "dead" ? 0.75 : g.mode === "free" ? 2.4 : 1.2;
      if (g.looseT > wait && settled && !b.pass && g.mode !== "dribble") reboundPass(g);
    }
  }
}

/** The rebounder machine: a real, physical pass back to the player's hands. */
function reboundPass(g) {
  const P = g.P;
  const b = g.ball;
  const target = local(P, 0, 1.2, 0.35, false);
  const d = Math.hypot(target.x - b.p.x, target.z - b.p.z);
  let v = launchTo(b.p, target, d < 2 ? 0.9 : 0.62);
  if (!v) v = { x: 0, y: 4, z: 0 };
  // a flat pass should not be faster than a real chest pass
  if (v.speed > 11) v = launchTo(b.p, target, 0.9) || v;
  makeBallFree(g, v);
  b.pass = true;
  b.shot = null;
  g.looseT = 0;
  emit(g, "pass");
}

/* ============================================================ intents */

function applyIntent(g, a, it, dt) {
  a.move = { x: it.mx || 0, z: it.mz || 0 };
  const ml = Math.hypot(a.move.x, a.move.z);
  if (ml > 1) { a.move.x /= ml; a.move.z /= ml; }
  a.wantSprint = !!it.sprint;
  if (g.phase === "check") { a.move.x = 0; a.move.z = 0; }
  if (g.phase !== "live" || g.over) {
    a.ctl.shoot = false;
    a.ctl.drive = false;
    // shots already in the air finish naturally; nothing new starts
    return;
  }
  for (const e of it.events || []) {
    switch (e) {
      case "shootDown":
        a.ctl.shoot = true;
        tryShoot(g, a);
        break;
      case "shootUp":
        a.ctl.shoot = false;
        if (a.act && a.act.kind === "shoot" && !a.act.released) a.act.releaseReq = true;
        break;
      case "cross":
        tryCross(g, a);
        break;
      case "driveDown":
        a.ctl.drive = true;
        tryDrive(g, a);
        break;
      case "driveUp":
        a.ctl.drive = false;
        break;
      case "jump":
        tryJump(g, a);
        break;
      case "steal":
        trySteal(g, a);
        break;
      default:
        break;
    }
  }
  // holding L while driving finishes automatically once in range
  if (a.driving && !a.ctl.drive) a.driving = false;
  if (a.driving && g.owner === a.id && !a.act && distRim(a) < 2.35) tryFinish(g, a);
}

const hasBall = (g, a) => g.owner === a.id && (g.bmode === "held" || g.bmode === "dribble");
const busy = (a) => a.act && a.act.kind !== "land";
export const distRim = (a) => Math.hypot(a.x, a.z);

function tryShoot(g, a) {
  if (!hasBall(g, a) || busy(a) || a.air) return;
  if (g.mode === "dribble") return;
  a.driving = false;
  a.act = {
    kind: "shoot",
    t: 0,
    pressT: g.time,
    released: false,
    releaseReq: false,
    relT: 0,
    launched: false,
    jumped: false,
    from: { ...g.ball.p },
    moveSpeed: Math.hypot(a.vx, a.vz),
    feet: { x: a.x, z: a.z },
  };
  g.bmode = "held";
  a.drib = null;
  emit(g, "shotStart", { id: a.id });
}

function tryCross(g, a) {
  if (g.owner !== a.id || g.bmode !== "dribble" || busy(a) || a.cd.cross > 0 || a.air) return;
  const s = handSign(a.hand);
  const newHand = a.hand === "R" ? "L" : "R";
  const recent = g.time - (a.lastCross || -9) < 1.3;
  const f = fwd(a);
  const rx = -f.z;
  const rz = f.x;
  // burst toward the new hand's side (−s = opposite side)
  const burst = (2.1 + (a.r.handle - 5) * 0.08 + (a.r.speed - 5) * 0.05) * (recent ? 0.55 : 1);
  a.vx += rx * -s * burst;
  a.vz += rz * -s * burst;
  const sp = Math.hypot(a.vx, a.vz);
  const cap = maxSpeed(a, { sprint: true, withBall: true }) * 1.05;
  if (sp > cap) { a.vx *= cap / sp; a.vz *= cap / sp; }
  const floor = local(a, 0, BALL_R, 0.4, false);
  floor.x += a.vx * 0.13;
  floor.z += a.vz * 0.13;
  a.act = { kind: "cross", t: 0, from: { ...g.ball.p }, floor, newHand, bounced: false, dir: -s };
  g.bmode = "cross";
  a.cd.cross = 0.55;
  a.stamina = Math.max(0, a.stamina - (recent ? 0.06 : 0.035));
  a.lastCross = g.time;
  g.stats[a.id].crossovers += 1;
  emit(g, "cross", { id: a.id });
  squeak(g, a, 1);
}

function tryDrive(g, a) {
  if (!hasBall(g, a) || busy(a) || a.air) return;
  if (distRim(a) < LAYUP_RANGE) tryFinish(g, a);
  else a.driving = true;
}

/** Choose dunk or layup for a finish attempt from here. */
export function finishKind(g, a) {
  const d = distRim(a);
  if (d > LAYUP_RANGE || a.z < -0.25) return null;
  const sp = Math.hypot(a.vx, a.vz);
  const toward = sp > 0.1 ? (-(a.x * a.vx + a.z * a.vz) / (d || 1)) / sp : 0;
  const dunkReach = DUNK_MAX + (a.r.finishing - 5) * 0.05;
  // dunks need a real head of steam, a sane angle (not from under the
  // baseline) and a clear lane — otherwise it's a layup
  const angleOk = a.z > 0.35 && Math.abs(Math.atan2(a.x, a.z)) < 1.15;
  const momentum = sp > 4.35 - (a.r.finishing - 5) * 0.05 && a.r.finishing >= 4;
  if (d <= dunkReach && d >= DUNK_MIN && momentum && toward > 0.6 && angleOk && a.stamina >= 0.22 && laneClear(g, a) && g.mode !== "three") return "dunk";
  return "layup";
}

function laneClear(g, a) {
  const d = g.other(a.id);
  if (!d || !g.O) return true;
  // defender close to the segment athlete→rim blocks the dunk lane
  const ax = a.x;
  const az = a.z;
  const L = Math.hypot(ax, az) || 1;
  const t = Math.max(0, Math.min(1, ((d.x - ax) * -ax + (d.z - az) * -az) / (L * L)));
  const px = ax + -ax * t;
  const pz = az + -az * t;
  return Math.hypot(d.x - px, d.z - pz) > 0.85;
}

function tryFinish(g, a) {
  if (!hasBall(g, a) || busy(a) || a.air) return;
  const kind = finishKind(g, a);
  if (!kind) return;
  a.driving = false;
  const d = distRim(a) || 1;
  const ux = -a.x / d;
  const uz = -a.z / d;
  if (kind === "layup") {
    a.act = { kind: "layup", t: 0, from: { ...g.ball.p }, jumped: false, launched: false, ux, uz, hand: layupHand(g, a) };
    emit(g, "layupStart", { id: a.id });
  } else {
    const style = a.dunks[Math.floor(g.rng.next() * a.dunks.length)] || "one";
    a.act = { kind: "dunk", t: 0, from: { ...g.ball.p }, stage: "gather", ux, uz, style };
    a.stamina = Math.max(0, a.stamina - 0.12);
    emit(g, "dunkStart", { id: a.id, style });
  }
  g.bmode = "held";
  a.drib = null;
}

/** Finish with the hand away from the defender (body shields the ball). */
function layupHand(g, a) {
  const d = g.O ? g.other(a.id) : null;
  if (d && Math.hypot(d.x - a.x, d.z - a.z) < 2.2) return sideOf(a, { x: d.x, z: d.z }) > 0 ? "L" : "R";
  return a.x > 0.25 ? "L" : a.x < -0.25 ? "R" : a.hand;
}

function tryJump(g, a) {
  if (g.owner === a.id || busy(a) || a.air || a.cd.jump > 0 || a.slow > 0.2) return;
  const rebound = g.bmode === "loose" || g.bmode === "flight";
  const skill = rebound ? a.r.rebound : a.r.block;
  a.act = { kind: "jump", t: 0, rebound };
  a.vy = 3.35 + (skill - 5) * 0.06;
  a.air = true;
  a.stamina = Math.max(0, a.stamina - 0.03);
  emit(g, "jump", { id: a.id });
}

function trySteal(g, a) {
  if (g.owner === a.id || busy(a) || a.air || a.cd.steal > 0 || a.slow > 0.2) return;
  const h = g.owner ? g.byId(g.owner) : null;
  const target = h ? { ...g.ball.p } : local(a, 0, 1, 0.8);
  const hand = h ? (sideOf(a, g.ball.p) >= 0 ? "R" : "L") : "R";
  a.act = { kind: "steal", t: 0, target, hand, resolved: false, success: false };
  a.cd.steal = 0.9;
  emit(g, "stealTry", { id: a.id });
}

/** +1 if point is on the athlete's right, −1 on the left. */
function sideOf(a, p) {
  const f = fwd(a);
  return (p.x - a.x) * -f.z + (p.z - a.z) * f.x >= 0 ? 1 : -1;
}

/* ============================================================ actions */

function updateAction(g, a, dt) {
  const act = a.act;
  if (!act) return;
  act.t += dt;
  switch (act.kind) {
    case "shoot": return actShoot(g, a, act, dt);
    case "layup": return actLayup(g, a, act, dt);
    case "dunk": return actDunk(g, a, act, dt);
    case "cross": return actCross(g, a, act, dt);
    case "steal": return actSteal(g, a, act, dt);
    case "jump":
      if (!a.air && act.t > 0.05) {
        a.act = { kind: "land", t: 0, dur: 0.12 };
        a.cd.jump = 0.3;
        emit(g, "land", { id: a.id, soft: true });
      }
      return undefined;
    case "land":
      if (act.t >= (act.dur || 0.14)) a.act = null;
      return undefined;
    case "fumble":
      if (act.t >= 0.4) a.act = null;
      return undefined;
    default:
      return undefined;
  }
}

function actShoot(g, a, act, dt) {
  turnToward(a, angleTo(a, 0, 0), 14, dt);
  if (!act.jumped && act.t >= 0.2) {
    act.jumped = true;
    a.vy = 3.1 + (a.r.shooting - 5) * 0.02;
    a.air = true;
    a.vx *= 0.55;
    a.vz *= 0.55;
    act.feet = { x: a.x, z: a.z };
  }
  const meter = (g.time - act.pressT) / METER_TIME;
  if (!act.released && (act.releaseReq || meter >= 1) && act.t >= 0.1) {
    act.released = true;
    act.meter = Math.min(1, meter);
    act.zone = meterZone(act.meter, a.r.shooting);
    emit(g, "meterRelease", { id: a.id, meter: act.meter, zone: act.zone });
  }
  if (act.released && !act.launched) {
    act.relT += dt;
    if (act.relT >= 0.06 && g.owner === a.id) {
      act.launched = true;
      launchJumpShot(g, a, act);
    }
  }
  // lost the ball mid-shot (strip block): the jump still plays out
  if (act.launched || g.owner !== a.id) {
    if (!a.air && act.jumped) {
      a.act = { kind: "land", t: 0, dur: 0.14 };
      emit(g, "land", { id: a.id });
    }
  }
}

function launchJumpShot(g, a, act) {
  const b = g.ball;
  const from = { ...b.p };
  const contest = contestOn(g, a);
  const feet = act.feet || { x: a.x, z: a.z };
  const pts = pointsFrom(feet.x, feet.z);
  const plan = planShot({
    from,
    kind: "jump",
    zone: act.zone,
    meter: act.meter,
    speed: act.moveSpeed * 0.8 + Math.hypot(a.vx, a.vz) * 0.4,
    contest,
    stamina: a.stamina,
    rating: a.r.shooting,
  }, g.rng);
  const shot = newShot(g, a, "jump", pts, { zone: act.zone, meter: act.meter, contest, bank: plan.bank, dist: Math.hypot(feet.x, feet.z) });
  releaseShot(g, a, plan.v, shot);
  const st = g.stats[a.id];
  st.fga += 1;
  if (pts === 2) st.twoA += 1;
  if (act.zone === "perfect") st.perfect += 1;
  a.stamina = Math.max(0, a.stamina - 0.02);
  emit(g, "release", { id: a.id, zone: act.zone, meter: act.meter, contest, pts, bank: plan.bank });
}

function newShot(g, a, kind, pts, extra = {}) {
  g.shotSeq += 1;
  return { id: g.shotSeq, shooter: a.id, kind, points: pts, rim: false, board: false, scored: false, blocked: false, t0: g.time, ...extra };
}

function actLayup(g, a, act, dt) {
  const d = distRim(a) || 1;
  if (!act.jumped) {
    turnToward(a, angleTo(a, 0, 0), 12, dt);
    // gather steps toward the takeoff spot: a real layup leaves the floor
    // ~1.4–1.9 m out (further when running), never from under the rim
    const sp0 = Math.hypot(a.vx, a.vz);
    const takeoffD = 1.4 + Math.min(0.5, sp0 * 0.08);
    const sp = Math.max(2.6, Math.min(4.6, sp0));
    const tx = -a.x / d;
    const tz = -a.z / d;
    const slow = d < takeoffD + 0.35 ? 0.5 : 1; // chop steps if already close
    a.vx += (tx * sp * slow - a.vx) * Math.min(1, dt * 10);
    a.vz += (tz * sp * slow - a.vz) * Math.min(1, dt * 10);
    if (act.t >= 0.26 || d <= takeoffD) {
      act.jumped = true;
      act.jumpT = act.t;
      a.vy = 3.45 + (a.r.finishing - 5) * 0.03;
      a.air = true;
      // carry to ~1 m from the rim at release
      const carry = Math.max(0, d - 1.0);
      const hsp = Math.min(2.6, carry / 0.3);
      a.vx = tx * hsp;
      a.vz = tz * hsp;
      a.hand = act.hand;
      act.approach = sp0;
      emit(g, "takeoff", { id: a.id });
    }
    return;
  }
  const since = act.t - act.jumpT;
  if (!act.launched && since >= 0.3 && g.owner === a.id) {
    act.launched = true;
    const b = g.ball;
    const contest = contestOn(g, a) * 0.9;
    const plan = planShot({
      from: { ...b.p },
      kind: "layup",
      zone: "good",
      speed: (act.approach || 3) * 0.32,
      contest,
      stamina: a.stamina,
      rating: a.r.finishing,
    }, g.rng);
    const shot = newShot(g, a, "layup", 1, { contest, bank: plan.bank, dist: d });
    releaseShot(g, a, plan.v, shot);
    g.stats[a.id].fga += 1;
    emit(g, "release", { id: a.id, zone: "layup", contest, pts: 1, bank: plan.bank });
  }
  if (!a.air && act.jumped && since > 0.1) {
    a.act = { kind: "land", t: 0, dur: 0.16 };
    emit(g, "land", { id: a.id });
  }
}

/* Dunk: controlled, animation-driven flight — never a snap to the rim. */
const DUNK_GATHER = 0.16;
const DUNK_FLIGHT = 0.44;
const DUNK_SLAM = 0.12;
const DUNK_HANG = 0.17;

function actDunk(g, a, act, dt) {
  const T = act.t;
  if (act.stage === "gather") {
    turnToward(a, angleTo(a, 0, 0), 14, dt);
    const d = distRim(a) || 1;
    const sp = Math.max(3.6, Math.hypot(a.vx, a.vz));
    a.vx += ((-a.x / d) * sp - a.vx) * Math.min(1, dt * 12);
    a.vz += ((-a.z / d) * sp - a.vz) * Math.min(1, dt * 12);
    if (T >= DUNK_GATHER) {
      act.stage = "flight";
      act.t0 = T;
      act.start = { x: a.x, z: a.z };
      const d2 = distRim(a) || 1;
      act.ux = -a.x / d2;
      act.uz = -a.z / d2;
      // finish point: just in front of the rim along the approach
      act.end = { x: -act.ux * 0.5, z: -act.uz * 0.5 };
      if (act.end.z < 0.3) act.end.z = 0.3;
      a.air = true;
      a.vy = 0;
      emit(g, "takeoff", { id: a.id, dunk: true });
    }
    return;
  }
  if (act.stage === "flight") {
    const s = Math.min(1, (T - act.t0) / DUNK_FLIGHT);
    const e = 1 - (1 - s) * (1 - s);
    const nx = act.start.x + (act.end.x - act.start.x) * e;
    const nz = act.start.z + (act.end.z - act.start.z) * e;
    const ny = 1.02 * (1 - (1 - s) * (1 - s) * (1 - s)) + 0.12 * Math.sin(Math.PI * s);
    a.vx = (nx - a.x) / dt;
    a.vz = (nz - a.z) / dt;
    a.vy = (ny - a.y) / dt;
    a.x = nx; a.z = nz; a.y = ny;
    a.facing = Math.atan2(-a.x, -a.z) + (act.style === "reverse" ? Math.PI * Math.min(1, s * 1.3) : 0);
    if (s >= 1) {
      act.stage = "slam";
      act.t0 = T;
    }
    return;
  }
  if (act.stage === "slam") {
    const s = Math.min(1, (T - act.t0) / DUNK_SLAM);
    a.vx = 0; a.vz = 0; a.vy = 0;
    if (s >= 1 && g.owner === a.id) {
      // hand the ball through the ring: released just above the rim plane
      const b = g.ball;
      b.p.x = 0; b.p.y = RIM_Y + 0.06; b.p.z = 0.02;
      b.prev = { ...b.p };
      const shot = newShot(g, a, "dunk", 1, { dist: 0.5, style: act.style });
      releaseShot(g, a, { x: 0, y: -4.6, z: 0.15 }, shot);
      g.stats[a.id].fga += 1;
      act.stage = "hang";
      act.t0 = T;
      g.shake = Math.max(g.shake, 0.6);
      emit(g, "slam", { id: a.id, style: act.style });
    } else if (s >= 1) {
      act.stage = "drop";
      act.t0 = T;
    }
    return;
  }
  if (act.stage === "hang") {
    a.vx = 0; a.vz = 0; a.vy = 0;
    if (T - act.t0 >= DUNK_HANG) {
      act.stage = "drop";
      act.t0 = T;
      a.vy = 0;
      a.vx = -act.ux * 0.6;
      a.vz = -act.uz * 0.6;
    }
    return;
  }
  if (act.stage === "drop") {
    if (!a.air) {
      a.act = { kind: "land", t: 0, dur: 0.22 };
      emit(g, "land", { id: a.id, hard: true });
    }
  }
}

function actCross(g, a, act) {
  if (!act.bounced && act.t >= 0.14) {
    act.bounced = true;
    a.hand = act.newHand;
    emit(g, "dribble", { id: a.id, cross: true, x: act.floor.x, z: act.floor.z });
    crossEffect(g, a, act);
  }
  if (act.t >= 0.3) {
    a.act = null;
    if (g.owner === a.id && g.bmode === "cross") {
      g.bmode = "dribble";
      a.drib = { phase: 0.02, T: 0.46, start: null, floor: null };
    }
  }
}

/**
 * A crossover only beats a defender who is moving (or leaning) the wrong
 * way at the moment the ball changes hands. No dice: the stagger is a pure
 * function of the defender's momentum against the new direction.
 */
function crossEffect(g, a, act) {
  const d = g.other(a.id);
  if (!d || !g.O) return;
  const dx = d.x - a.x;
  const dz = d.z - a.z;
  const dist = Math.hypot(dx, dz);
  if (dist > 2.3) return;
  const f = fwd(a);
  // the defender must be roughly in front
  if ((dx * f.x + dz * f.z) / (dist || 1) < 0.2) return;
  const rx = -f.z * act.dir;
  const rz = f.x * act.dir;
  const wrongWay = -(d.vx * rx + d.vz * rz); // defender velocity away from the new direction
  if (wrongWay > 0.6 && !d.air) {
    const sev = Math.min(1, (wrongWay - 0.6) / 2.4) * (1.05 - (d.r.defense - 5) * 0.05);
    const dur = 0.18 + 0.42 * Math.max(0, sev);
    d.slow = Math.max(d.slow, dur);
    d.slowK = 0.35;
    if (sev > 0.62) emit(g, "shook", { id: d.id, sev });
  }
}

function actSteal(g, a, act, dt) {
  // lunge toward the ball during the reach
  if (act.t < 0.2) {
    // a committed step-in: that's what makes a whiff costly
    const d = Math.hypot(act.target.x - a.x, act.target.z - a.z) || 1;
    const lunge = 2.3 + (a.r.steal - 5) * 0.08;
    a.vx += ((act.target.x - a.x) / d * lunge - a.vx) * Math.min(1, dt * 18);
    a.vz += ((act.target.z - a.z) / d * lunge - a.vz) * Math.min(1, dt * 18);
    turnToward(a, angleTo(a, act.target.x, act.target.z), 10, dt);
  }
  if (act.t >= 0.42) {
    if (!act.success) {
      // whiffed: off balance for a moment — steal spam is punished
      a.slow = 0.5;
      a.slowK = 0.4;
      emit(g, "stealMiss", { id: a.id });
    }
    a.act = null;
  }
}

/* ============================================================ movement */

function moveAthlete(g, a, dt) {
  const act = a.act;
  const controlled = act && act.kind === "dunk" && act.stage !== "drop" && act.stage !== "gather";
  if (!controlled) {
    const withBall = g.owner === a.id;
    const defending = !!g.O && g.offense !== a.id && !withBall;
    let mx = a.move.x;
    let mz = a.move.z;
    let mag = Math.hypot(mx, mz);
    // driving steers toward the rim (the stick can still bend the path)
    if (a.driving && withBall && !act) {
      const d = distRim(a) || 1;
      mx = mx * 0.45 + (-a.x / d) * 0.8;
      mz = mz * 0.45 + (-a.z / d) * 0.8;
      const l = Math.hypot(mx, mz) || 1;
      mx /= l; mz /= l;
      mag = 1;
    }
    if (mag > 0) { mx /= Math.max(mag, 1e-6); mz /= Math.max(mag, 1e-6); }
    const lockedFeet = act && (act.kind === "shoot" || act.kind === "layup" || act.kind === "dunk" || act.kind === "fumble");
    const landing = act && act.kind === "land";
    const canSprint = a.wantSprint && a.stamina > 0.06 && !lockedFeet;
    const sprint = canSprint;
    a.sprinting = sprint && mag > 0.2 && !a.air;
    if (lockedFeet) {
      if (!a.air && act.kind === "shoot") {
        const k = Math.exp(-9 * dt);
        a.vx *= k; a.vz *= k;
      }
    } else {
      integrateMove(a, mx, mz, landing ? mag * 0.5 : mag, { sprint, withBall, defending, drive: a.driving && withBall }, dt);
    }
    // stamina: light touch
    const sp = Math.hypot(a.vx, a.vz);
    if (a.sprinting && sp > 3) a.stamina = Math.max(0, a.stamina - dt * (0.13 - (a.r.stamina - 5) * 0.012));
    else a.stamina = Math.min(1, a.stamina + dt * (0.075 + (a.r.stamina - 5) * 0.006));
    // hard cuts squeak
    if (!a.air && sp > 2.6 && mag > 0.5) {
      const dot = (a.vx * mx + a.vz * mz) / sp;
      if (dot < -0.25) squeak(g, a, 0.8);
    }
    if (!a.air && sp < 0.6 && a.lastSp > 4.4) squeak(g, a, 0.7);
    a.lastSp = sp;
    faceLogic(g, a, mx, mz, mag, dt);
    a.x += a.vx * dt;
    a.z += a.vz * dt;
    if (a.air) {
      a.vy -= ATHLETE_G * dt;
      a.y += a.vy * dt;
      if (a.y <= 0) {
        a.y = 0;
        a.vy = 0;
        a.air = false;
      }
    }
    // layups/dunks never carry the body under the rim
    if (a.air && act && (act.kind === "layup" || act.kind === "dunk")) {
      const d = distRim(a);
      const minD = act.kind === "layup" ? 0.85 : 0.42;
      if (d < minD && d > 1e-6) {
        a.x *= minD / d;
        a.z *= minD / d;
        const inward = -(a.vx * a.x + a.vz * a.z) / minD;
        if (inward > 0) { a.vx += (a.x / minD) * inward; a.vz += (a.z / minD) * inward; }
      }
    }
  }
  // defensive stance smoothing (visual + contest)
  const defending = !!g.O && g.offense !== a.id && g.owner !== a.id && g.phase !== "scored";
  const want = defending && !a.air ? (Math.hypot(a.vx, a.vz) > 4.6 ? 0.4 : 1) : 0;
  a.stance += (want - a.stance) * Math.min(1, dt * 6);
}

function faceLogic(g, a, mx, mz, mag, dt) {
  const act = a.act;
  if (act && (act.kind === "shoot" || act.kind === "layup" || act.kind === "dunk" || act.kind === "steal")) return;
  const sp = Math.hypot(a.vx, a.vz);
  const withBall = g.owner === a.id;
  const opp = g.O ? g.other(a.id) : null;
  let target = null;
  if (withBall) {
    const toHoop = angleTo(a, 0, 0);
    if (sp > 1.0) {
      const dir = Math.atan2(a.vx, a.vz);
      const dh = Math.cos(wrap(dir - toHoop));
      // backing out / sliding sideways while sizing up keeps eyes on the rim
      target = !a.sprinting && dh < 0.35 ? toHoop + Math.max(-1.1, Math.min(1.1, wrap(dir - toHoop))) * 0.5 : dir;
    } else target = toHoop;
  } else if (g.O && g.offense !== a.id && g.phase !== "scored" && (g.bmode === "dribble" || g.bmode === "held" || g.bmode === "cross") && opp) {
    target = sp > 5.0 ? Math.atan2(a.vx, a.vz) : angleTo(a, opp.x, opp.z);
  } else if (g.bmode === "loose" || g.bmode === "flight") {
    target = sp > 1.5 ? Math.atan2(a.vx, a.vz) : angleTo(a, g.ball.p.x, g.ball.p.z);
  } else if (sp > 0.8) target = Math.atan2(a.vx, a.vz);
  if (target !== null) turnToward(a, target, withBall ? 8.5 : 9.5, dt);
  if (mag > 0.1) a.lastMoveDir = { x: mx, z: mz };
}

function squeak(g, a, vol) {
  if (a.cd.squeak > 0 || a.air) return;
  a.cd.squeak = 0.45;
  emit(g, "squeak", { id: a.id, vol });
}

/* ============================================================ the ball */

/** Hand anchor for the dribble. */
function dribbleAnchor(g, a) {
  const s = handSign(a.hand);
  const sp = Math.hypot(a.vx, a.vz);
  const opp = g.O ? g.other(a.id) : null;
  const pressured = opp && Math.hypot(opp.x - a.x, opp.z - a.z) < 1.5;
  const yh = pressured ? 0.84 : 0.97;
  // local() is facing-relative; add a little lead in the velocity direction
  const p = local(a, 0.36 * s, yh, 0.2 + Math.min(0.15, sp * 0.03), false);
  p.x += a.vx * 0.05;
  p.z += a.vz * 0.05;
  return p;
}

function carryBall(g, dt) {
  const a = g.owner ? g.byId(g.owner) : null;
  if (!a) return;
  const b = g.ball;
  const act = a.act;
  let target = null;
  if (g.bmode === "dribble") {
    target = dribblePos(g, a, dt);
  } else if (g.bmode === "cross" && act && act.kind === "cross") {
    const T = act.t;
    if (T < 0.14) {
      const s = T / 0.14;
      target = {
        x: act.from.x + (act.floor.x - act.from.x) * s,
        z: act.from.z + (act.floor.z - act.from.z) * s,
        y: act.from.y + (BALL_R - act.from.y) * Math.pow(s, 1.5),
      };
    } else {
      const s = Math.min(1, (T - 0.14) / 0.16);
      const saved = a.hand;
      a.hand = act.newHand;
      const anc = dribbleAnchor(g, a);
      a.hand = saved;
      target = {
        x: act.floor.x + (anc.x - act.floor.x) * s,
        z: act.floor.z + (anc.z - act.floor.z) * s,
        y: BALL_R + (anc.y - BALL_R) * (1 - Math.pow(1 - s, 1.6)),
      };
    }
  } else if (act && act.kind === "shoot") {
    const s = handSign(a.hand) * 0.09;
    const set = local(a, s, 2.02, 0.17);
    const rel = local(a, s * 0.8, 2.36, 0.27);
    if (!act.released || act.relT <= 0) {
      const k = smooth(Math.min(1, act.t / 0.2));
      target = lerp3(act.from, set, k);
    } else {
      const k = smooth(Math.min(1, act.relT / 0.06));
      target = lerp3(set, rel, k);
    }
  } else if (act && act.kind === "layup") {
    const s = handSign(act.hand) * 0.16;
    if (!act.jumped) {
      const chest = local(a, 0.05, 1.18, 0.3);
      target = lerp3(act.from, chest, smooth(Math.min(1, act.t / 0.2)));
    } else {
      const since = act.t - act.jumpT;
      const chest = local(a, 0.05, 1.2, 0.3);
      const up = local(a, s, 2.42, 0.34);
      target = lerp3(chest, up, smooth(Math.min(1, since / 0.3)));
    }
  } else if (act && act.kind === "dunk") {
    const over = local(a, 0, 2.5, 0.22);
    if (act.stage === "gather") target = lerp3(act.from, local(a, 0, 1.25, 0.3), smooth(Math.min(1, act.t / DUNK_GATHER)));
    else if (act.stage === "flight") {
      const s = Math.min(1, (act.t - act.t0) / DUNK_FLIGHT);
      const chest = local(a, 0, 1.25, 0.3);
      const windmill = act.style === "windmill" ? Math.sin(s * Math.PI * 2) * 0.5 : 0;
      target = lerp3(chest, over, smooth(Math.min(1, s * 1.4)));
      if (windmill) {
        const f = fwd(a);
        target.x -= f.x * windmill * 0.4;
        target.z -= f.z * windmill * 0.4;
        target.y -= Math.abs(windmill) * 0.6;
      }
    } else {
      const s = Math.min(1, (act.t - act.t0) / DUNK_SLAM);
      const top = { x: 0, y: RIM_Y + 0.32, z: 0.08 };
      const low = { x: 0, y: RIM_Y + 0.06, z: 0.02 };
      target = s < 0.35 ? lerp3(over, top, smooth(s / 0.35)) : lerp3(top, low, smooth((s - 0.35) / 0.65));
    }
  } else {
    // held (triple threat / check)
    target = local(a, 0.04, 1.08, 0.33);
    a.holdT = (a.holdT || 0) + dt;
    const sp = Math.hypot(a.vx, a.vz);
    if (g.phase === "live" && (sp > 0.35 || a.holdT > 0.55) && g.bmode === "held" && !act) {
      g.bmode = "dribble";
      a.drib = { phase: 0, T: 0.5, start: null, floor: null };
    }
  }
  if (target) {
    b.p.x = target.x; b.p.y = target.y; b.p.z = target.z;
    if (dt > 0) {
      b.v.x = (b.p.x - b.prev.x) / dt;
      b.v.y = (b.p.y - b.prev.y) / dt;
      b.v.z = (b.p.z - b.prev.z) / dt;
    }
  }
}

/**
 * The dribble: hand → floor → hand. The floor contact point is fixed in the
 * world when the ball is pushed (predicted from the carrier's velocity), and
 * the ball comes back up to wherever the hand is now — so moving, stopping
 * and cutting all look like a real bounce, never a ball glued to a hand.
 */
function dribblePos(g, a, dt) {
  const D = a.drib || (a.drib = { phase: 0, T: 0.5, start: null, floor: null });
  const sp = Math.hypot(a.vx, a.vz);
  const anc = dribbleAnchor(g, a);
  if (!D.start) {
    D.start = { ...g.ball.p };
    D.floor = predictFloor(a, anc, D.T);
  }
  const prevPhase = D.phase;
  D.phase += dt / D.T;
  if (prevPhase < 0.5 && D.phase >= 0.5) emit(g, "dribble", { id: a.id, x: D.floor.x, z: D.floor.z, speed: sp });
  if (D.phase >= 1) {
    D.phase -= 1;
    D.T = 0.54 - Math.min(0.16, sp * 0.028);
    D.start = { ...anc };
    D.floor = predictFloor(a, anc, D.T);
  }
  const ph = D.phase;
  if (ph < 0.5) {
    const s = ph / 0.5;
    const k = Math.pow(s, 1.55);
    return {
      x: D.start.x + (D.floor.x - D.start.x) * s,
      z: D.start.z + (D.floor.z - D.start.z) * s,
      y: D.start.y + (BALL_R - D.start.y) * k,
    };
  }
  const s = (ph - 0.5) / 0.5;
  const k = 1 - Math.pow(1 - s, 1.55);
  return {
    x: D.floor.x + (anc.x - D.floor.x) * s,
    z: D.floor.z + (anc.z - D.floor.z) * s,
    y: BALL_R + (anc.y - BALL_R) * k,
  };
}

function predictFloor(a, anc, T) {
  const f = fwd(a);
  return {
    x: anc.x + a.vx * T * 0.36 + f.x * 0.05,
    y: BALL_R,
    z: anc.z + a.vz * T * 0.36 + f.z * 0.05,
  };
}

function updateBall(g, dt) {
  const b = g.ball;
  if (g.owner) {
    carryBall(g, dt);
    return;
  }
  // free ball: real physics
  const ev = [];
  b.rimHit = false;
  b.boardHit = false;
  stepBall(b, dt, ev);
  if (b.rimHit || b.boardHit) {
    // any touch at all (even a silent kiss) means "not a swish"
    if (b.shot) {
      if (b.rimHit) b.shot.rim = true;
      if (b.boardHit) b.shot.board = true;
    }
    if (g.bmode === "flight") g.bmode = "loose";
  }
  // ball vs players' bodies (vertical capsules) so it can't pass through them
  for (const a of g.ath) bodyBump(g, a, ev);
  if (g.bmode === "flight") {
    const s = b.shot;
    // a shot that is coming down low without touching anything is a live ball
    if (b.v.y < 0 && b.p.y < 2.2 && Math.hypot(b.p.x, b.p.z) > 0.6) g.bmode = "loose";
    if (s && g.time - s.t0 > 4) g.bmode = "loose";
  }
  for (const e of ev) handleBallEvent(g, e);
  if (g.bmode === "loose") g.looseT += dt;
  // escaped the playable area → dead ball
  if ((g.bmode === "loose" || g.bmode === "flight") && (Math.abs(b.p.x) > 11 || b.p.z > 15 || b.p.z < -4.5 || b.p.y < -1)) outOfBounds(g);
}

function bodyBump(g, a, ev) {
  const b = g.ball;
  if (a.cd.pickup > 0.3 && g.bmode === "flight") return; // own release
  const top = a.y + 1.75;
  const bot = a.y + 0.15;
  const cy = Math.max(bot, Math.min(top, b.p.y));
  const dx = b.p.x - a.x;
  const dy = b.p.y - cy;
  const dz = b.p.z - a.z;
  const d = Math.hypot(dx, dy, dz);
  const lim = BALL_R + 0.24;
  if (d >= lim || d < 1e-6) return;
  const nx = dx / d;
  const ny = dy / d;
  const nz = dz / d;
  b.p.x += nx * (lim - d);
  b.p.y += ny * (lim - d);
  b.p.z += nz * (lim - d);
  const rvx = b.v.x - a.vx;
  const rvz = b.v.z - a.vz;
  const vn = rvx * nx + b.v.y * ny + rvz * nz;
  if (vn < 0) {
    b.v.x -= 1.4 * vn * nx;
    b.v.y -= 1.4 * vn * ny;
    b.v.z -= 1.4 * vn * nz;
    if (-vn > 1.2 && ev) ev.push({ type: "body", speed: -vn });
  }
  if (g.bmode === "flight") g.bmode = "loose";
  g.lastTouch = a.id;
}

function handleBallEvent(g, e) {
  const b = g.ball;
  const s = b.shot;
  switch (e.type) {
    case "rim":
      if (s) s.rim = true;
      if (g.bmode === "flight") g.bmode = "loose";
      emit(g, "rim", { side: e.side, speed: e.speed, x: e.x, y: e.y, z: e.z });
      break;
    case "board":
      if (s) s.board = true;
      if (g.bmode === "flight") g.bmode = "loose";
      emit(g, "board", { speed: e.speed, x: e.x, y: e.y, z: e.z });
      break;
    case "pole":
      if (g.bmode === "flight") g.bmode = "loose";
      emit(g, "pole", { speed: e.speed });
      break;
    case "body":
      emit(g, "ballBody", { speed: e.speed });
      break;
    case "floor": {
      const wasFlight = g.bmode === "flight";
      if (wasFlight) g.bmode = "loose";
      if (s && !s.rim && !s.board && !s.scored && !s.airballed && !s.blocked) {
        s.airballed = true;
        emit(g, "airball", { shooter: s.shooter });
      }
      emit(g, "bounce", { speed: e.speed, x: e.x, z: e.z });
      if (Math.abs(e.x) > COURT_HALF_W + 0.1 || e.z > COURT_FAR_Z + 0.1 || e.z < BASELINE_Z - 0.1) {
        if (g.bmode === "loose") outOfBounds(g);
      }
      break;
    }
    case "basket":
      onBasket(g);
      break;
    default:
      break;
  }
}

function onBasket(g) {
  const b = g.ball;
  const s = b.shot;
  b.netT = 0;
  b.netHit = g.time;
  emit(g, "net", {});
  if (!s || s.scored || s.blocked) return;
  if (g.bmode !== "flight" && g.bmode !== "loose") return;
  if (g.phase !== "live") return;
  s.scored = true;
  const id = s.shooter;
  const st = g.stats[id];
  const swish = !s.rim && !s.board;
  st.fgm += 1;
  st.points += s.points;
  if (s.points === 2) st.twoM += 1;
  if (s.kind === "layup") st.layups += 1;
  if (s.kind === "dunk") st.dunks += 1;
  if (swish && s.kind === "jump") st.swishes += 1;
  g.score[id] += s.points;
  g.lastScorer = id;
  setDead(g);
  if (id === "p") {
    g.streak += 1;
    g.bestStreak = Math.max(g.bestStreak, g.streak);
  }
  const winning = g.mode === "match" && g.score[id] >= g.target;
  emit(g, "score", { id, points: s.points, kind: s.kind, swish, bank: !!s.bank && s.board && !s.rim, zone: s.zone, winning, score: { ...g.score } });
  if (swish && s.kind === "jump") emit(g, "swish", {});
  if (winning) {
    g.pendingOver = true;
    g.shake = Math.max(g.shake, 0.5);
  }
  if (g.drill && g.drill.onScore) g.drill.onScore(g, s);
  if (g.mode === "match" || g.mode === "defense") {
    g.phase = "scored";
    g.phaseT = 0;
    const scorer = g.byId(id);
    scorer.celebrate = 1.0;
  }
}

function outOfBounds(g) {
  if (g.phase !== "live") return;
  if (!g.O) {
    // solo modes: the rebounder just fetches it
    setDead(g);
    g.looseT = 0;
    emit(g, "outOfBounds", {});
    const b = g.ball;
    b.p.x = Math.max(-COURT_HALF_W, Math.min(COURT_HALF_W, b.p.x));
    b.p.z = Math.max(BASELINE_Z, Math.min(COURT_FAR_Z, b.p.z));
    b.p.y = Math.max(BALL_R, Math.min(2, b.p.y));
    b.v.x = 0; b.v.z = 0;
    return;
  }
  const last = g.lastTouch || g.offense;
  setDead(g);
  g.pendingOffense = last === "p" ? "o" : "p";
  g.phase = "reset";
  g.phaseT = 0;
  emit(g, "outOfBounds", { to: g.pendingOffense });
}

/* ============================================================ contest / hands */

/**
 * How well the defender is contesting a shooter RIGHT NOW (0 … ~1.2).
 * Requires the defender to be close, facing the shooter, on the rim side,
 * and actively up (jumping) — mere proximity barely counts.
 */
export function contestOn(g, shooter) {
  const d = g.O ? g.other(shooter.id) : null;
  if (!d) return 0;
  const dx = d.x - shooter.x;
  const dz = d.z - shooter.z;
  const dist = Math.hypot(dx, dz);
  if (dist > 2.3) return 0;
  const f = fwd(d);
  const facing = (-dx * f.x + -dz * f.z) / (dist || 1);
  const facingF = facing > 0.25 ? 1 : 0.3;
  const hd = Math.hypot(shooter.x, shooter.z) || 1;
  const between = ((dx * -shooter.x) + (dz * -shooter.z)) / ((dist || 1) * hd);
  const betweenF = Math.max(0, Math.min(1, (between + 0.25) / 0.85));
  let active = 0.12;
  if (d.air && d.act && d.act.kind === "jump") active = 1;
  else if (d.stance > 0.6 && dist < 1.45) active = 0.42;
  if (d.slow > 0) active *= 0.4;
  const close = Math.max(0, Math.min(1, (2.3 - dist) / 1.5));
  return Math.min(1.2, active * close * (0.3 + 0.7 * betweenF) * facingF * (0.8 + d.r.defense * 0.04));
}

/** Gameplay hand points (the renderer IKs the arms onto these). */
function computeHands(g, a) {
  a.hands.L = null;
  a.hands.R = null;
  const b = g.ball;
  const act = a.act;
  if (g.owner === a.id) {
    const mode = g.bmode;
    if (mode === "dribble" && a.drib) {
      const ph = a.drib.phase;
      const anc = dribbleAnchor(g, a);
      const onBall = ph < 0.13 || ph > 0.87;
      const top = { x: b.p.x, y: b.p.y + BALL_R * 0.9, z: b.p.z };
      const hover = { x: anc.x, y: anc.y + 0.06, z: anc.z };
      a.hands[a.hand] = onBall ? top : ph < 0.5 ? lerp3(top, hover, Math.min(1, (ph - 0.13) / 0.15)) : lerp3(hover, top, Math.max(0, (ph - 0.72) / 0.15));
    } else if (mode === "cross" && act && act.kind === "cross") {
      const top = { x: b.p.x, y: b.p.y + BALL_R * 0.9, z: b.p.z };
      if (act.t < 0.06) a.hands[a.hand] = top;
      if (act.t > 0.22) a.hands[act.newHand] = top;
    } else {
      // two hands on the ball (held / shot set / dunk), one for a release
      const f = fwd(a);
      const rx = -f.z;
      const rz = f.x;
      const side = (s) => ({ x: b.p.x + rx * s * (BALL_R + 0.02) - f.x * 0.05, y: b.p.y - 0.02, z: b.p.z + rz * s * (BALL_R + 0.02) - f.z * 0.05 });
      const under = { x: b.p.x - f.x * (BALL_R + 0.02), y: b.p.y - 0.04, z: b.p.z - f.z * (BALL_R + 0.02) };
      if (act && act.kind === "shoot") {
        const shootHand = a.hand;
        a.hands[shootHand] = under;
        if (!act.released) a.hands[shootHand === "R" ? "L" : "R"] = side(shootHand === "R" ? -1 : 1);
      } else if (act && act.kind === "layup" && act.jumped) {
        a.hands[act.hand] = under;
      } else if (act && act.kind === "dunk" && act.style === "one" && act.stage !== "gather") {
        a.hands.R = { x: b.p.x, y: b.p.y + BALL_R, z: b.p.z };
      } else {
        a.hands.R = side(1);
        a.hands.L = side(-1);
      }
    }
    return;
  }
  // after a dunk: hands on the rim
  if (act && act.kind === "dunk" && act.stage === "hang") {
    a.hands.R = { x: -0.12, y: RIM_Y + 0.02, z: 0.2 };
    a.hands.L = { x: 0.12, y: RIM_Y + 0.02, z: 0.2 };
    return;
  }
  if (act && act.kind === "jump") {
    // arms up; reach toward the ball if it is within arm's length
    const lS = local(a, -BODY.shoulderHalf, BODY.shoulderY, 0);
    const rS = local(a, BODY.shoulderHalf, BODY.shoulderY, 0);
    // Arms go straight up (slightly forward). A hand may only bend a short
    // way toward the ball — timing and position make the block, not a magnet.
    const dev = 0.1 + (a.r.block - 5) * 0.015;
    const up = (sh, s) => {
      const base = local(a, s * 0.15, BODY.shoulderY + ARM_REACH - 0.05, 0.14);
      let dx = b.p.x - base.x;
      let dy = b.p.y - base.y;
      let dz = b.p.z - base.z;
      const dl = Math.hypot(dx, dy, dz);
      if (dl > 1e-6 && dl < 0.7) {
        const k = Math.min(dev, dl) / dl;
        dx *= k; dy *= k; dz *= k;
        const h = { x: base.x + dx, y: base.y + dy, z: base.z + dz };
        // never beyond arm's length from the shoulder
        const sx = h.x - sh.x;
        const sy = h.y - sh.y;
        const sz = h.z - sh.z;
        const sl = Math.hypot(sx, sy, sz);
        if (sl > ARM_REACH) {
          const m = ARM_REACH / sl;
          return { x: sh.x + sx * m, y: sh.y + sy * m, z: sh.z + sz * m };
        }
        return h;
      }
      return base;
    };
    a.hands.R = up(rS, 1);
    a.hands.L = up(lS, -1);
    return;
  }
  if (act && act.kind === "steal") {
    const hs = act.hand === "R" ? 1 : -1;
    const sh = local(a, hs * BODY.shoulderHalf, BODY.shoulderY, 0);
    const reach = act.t < 0.1 ? act.t / 0.1 * 0.5 : act.t < 0.24 ? 1 : Math.max(0, 1 - (act.t - 0.24) / 0.18);
    const tgt = g.owner ? g.ball.p : act.target;
    const dx = tgt.x - sh.x;
    const dy = tgt.y - sh.y;
    const dz = tgt.z - sh.z;
    const dl = Math.hypot(dx, dy, dz) || 1;
    const k = Math.min(dl, ARM_REACH) * reach;
    a.hands[act.hand] = { x: sh.x + (dx / dl) * k, y: sh.y + (dy / dl) * k, z: sh.z + (dz / dl) * k };
    act.handPos = a.hands[act.hand];
  }
}

/* ============================================================ blocks / steals / pickups */

function checkBlocks(g) {
  if (!g.O || g.phase !== "live") return;
  const b = g.ball;
  for (const d of g.ath) {
    if (!(d.air && d.act && d.act.kind === "jump")) continue;
    if (g.owner === d.id) continue;
    const hands = [d.hands.R, d.hands.L].filter(Boolean);
    let blocked = false;
    if (g.bmode === "flight" && b.shot && !b.shot.blocked && b.shot.shooter !== d.id) {
      // legal block: ball on the way up (or right at the top), not at the rim
      const nearRim = Math.hypot(b.p.x, b.p.z) < 0.75 && b.p.y > RIM_Y - 0.2;
      if (b.v.y > -1.2 && !nearRim) {
        for (const h of hands) {
          const dist = Math.hypot(h.x - b.p.x, h.y - b.p.y, h.z - b.p.z);
          if (dist > BALL_R + 0.065) continue;
          // the hand must be in the ball's path (no swats from behind)
          const vh = Math.hypot(b.v.x, b.v.z) || 1;
          const ahead = ((h.x - b.p.x) * b.v.x + (h.z - b.p.z) * b.v.z) / vh;
          if (ahead < -0.05) continue;
          blocked = true;
          break;
        }
      }
    } else if (g.owner && g.owner !== d.id) {
      // stripping a ball that is up high in the shooter's hands
      const s = g.byId(g.owner);
      const sa = s.act;
      const exposed = sa && ((sa.kind === "shoot" && sa.t > 0.12) || (sa.kind === "layup" && sa.jumped) || (sa.kind === "dunk" && sa.stage === "flight"));
      if (exposed) {
        for (const h of hands) {
          if (Math.hypot(h.x - b.p.x, h.y - b.p.y, h.z - b.p.z) < BALL_R + 0.055) {
            // the blocker must come from the front
            const f = fwd(s);
            if ((d.x - s.x) * f.x + (d.z - s.z) * f.z > 0.1) {
              blocked = true;
              break;
            }
          }
        }
      }
    }
    if (!blocked) continue;
    const shooterId = b.shot ? b.shot.shooter : g.owner;
    g.byId(shooterId).cd.pickup = 0.5;
    if (b.shot) b.shot.blocked = true;
    else {
      const shooter = g.byId(g.owner);
      const kind = shooter.act?.kind === "dunk" ? "dunk" : shooter.act?.kind === "layup" ? "layup" : "jump";
      g.stats[shooter.id].fga += 1;
      b.shot = newShot(g, shooter, kind, 1, { blocked: true });
      if (shooter.act?.kind === "dunk") shooter.act.stage = "drop";
      if (shooter.act?.kind === "shoot") shooter.act.launched = true;
      if (shooter.act?.kind === "layup") shooter.act.launched = true;
    }
    // swat: away from the blocker's side, down and out
    let nx = b.p.x - d.x;
    let nz = b.p.z - d.z;
    const nl = Math.hypot(nx, nz) || 1;
    nx /= nl; nz /= nl;
    const power = 3.2 + d.r.block * 0.15;
    makeBallFree(g, { x: nx * power + (g.rng.next() - 0.5) * 1.2, y: 0.6 + g.rng.next() * 1.4, z: nz * power + (g.rng.next() - 0.5) * 1.2 });
    g.ball.poke = null;
    g.lastTouch = d.id;
    g.stats[d.id].blocks += 1;
    g.shake = Math.max(g.shake, 0.35);
    emit(g, "block", { id: d.id, shooter: shooterId });
    return;
  }
}

function checkSteals(g) {
  if (!g.O || g.phase !== "live") return;
  for (const d of g.ath) {
    const act = d.act;
    if (!act || act.kind !== "steal" || act.resolved) continue;
    if (act.t < 0.1 || act.t > 0.26) continue;
    if (!g.owner || g.owner === d.id) continue;
    const h = g.byId(g.owner);
    if (g.bmode !== "dribble" && g.bmode !== "cross" && g.bmode !== "held") continue;
    const hand = act.handPos;
    if (!hand) continue;
    const b = g.ball.p;
    const dist = Math.hypot(hand.x - b.x, hand.y - b.y, hand.z - b.z);
    if (dist > BALL_R + 0.13) continue;
    // body shield: the handler's torso between the defender and the ball
    const sx = d.x;
    const sz = d.z;
    const ex = b.x;
    const ez = b.z;
    const L = Math.hypot(ex - sx, ez - sz) || 1;
    const t = Math.max(0, Math.min(1, ((h.x - sx) * (ex - sx) + (h.z - sz) * (ez - sz)) / (L * L)));
    const px = sx + (ex - sx) * t;
    const pz = sz + (ez - sz) * t;
    const shielded = Math.hypot(h.x - px, h.z - pz) < 0.22 && t < 0.92;
    if (shielded) continue;
    // exposure: ball in the air between hand and floor, or mid-crossover
    let exposure = 0.3;
    if (g.bmode === "cross") exposure = 1.15;
    else if (g.bmode === "dribble" && h.drib) {
      const ph = h.drib.phase;
      exposure = ph > 0.13 && ph < 0.87 ? 0.95 : 0.34;
    } else if (g.bmode === "held") exposure = 0.22;
    const q = exposure * (0.74 + d.r.steal * 0.05) - (h.r.handle - 5) * 0.03;
    act.resolved = true;
    if (q < 0.62) {
      emit(g, "stealTouch", { id: d.id });
      continue;
    }
    // poke it loose toward the defender's side — a live ball, not a teleport
    act.success = true;
    const f = fwd(d);
    const kx = (b.x - h.x) * 0.5 - f.x * 0.6;
    const kz = (b.z - h.z) * 0.5 - f.z * 0.6;
    const kl = Math.hypot(kx, kz) || 1;
    makeBallFree(g, { x: (kx / kl) * 2.4 + d.vx * 0.3, y: 1.4, z: (kz / kl) * 2.4 + d.vz * 0.3 });
    g.ball.shot = null;
    g.ball.poke = { by: d.id, from: h.id };
    g.lastTouch = d.id;
    h.cd.pickup = 0.4;
    h.act = { kind: "fumble", t: 0 };
    h.drib = null;
    h.driving = false;
    h.slow = 0.35;
    h.slowK = 0.5;
    emit(g, "steal", { id: d.id, from: h.id });
    return;
  }
}

/** Loose ball: whoever physically reaches it first — resolved atomically. */
function checkPickups(g) {
  if (g.bmode !== "loose") return;
  if (g.phase === "scored" || g.phase === "reset" || g.phase === "over") return;
  const b = g.ball;
  const cands = [];
  for (const a of g.ath) {
    if (a.cd.pickup > 0) continue;
    // mid-shot / mid-finish / stripped athletes can't snatch a loose ball
    if (a.act && (a.act.kind === "fumble" || a.act.kind === "dunk" || a.act.kind === "shoot" || a.act.kind === "layup")) continue;
    const dh = Math.hypot(b.p.x - a.x, b.p.z - a.z);
    const jumping = a.air && a.act && a.act.kind === "jump";
    const reachTop = a.y + (jumping ? BODY.shoulderY + ARM_REACH + 0.06 : 2.2);
    const lowOk = b.p.y >= 0 && b.p.y <= reachTop;
    const rel = Math.hypot(b.v.x - a.vx, b.v.y - a.vy, b.v.z - a.vz);
    const reachH = 0.6 + (jumping ? 0.12 : 0);
    // goaltending: nobody grabs a ball that is still over the ring
    const overRim = Math.hypot(b.p.x, b.p.z) < 0.45 && b.p.y > RIM_Y - 0.25;
    if (dh < reachH && lowOk && rel < 11 && !overRim) cands.push({ a, dh });
  }
  if (!cands.length) return;
  let win = cands[0];
  if (cands.length > 1) {
    const score = (c) => (1 / (c.dh + 0.15)) * (1 + c.a.r.rebound * 0.05) + (c.a.air ? 0.4 : 0) + g.rng.next() * 0.35;
    win = score(cands[0]) >= score(cands[1]) ? cands[0] : cands[1];
  }
  const a = win.a;
  const shot = b.shot;
  const poke = b.poke;
  const wasShot = shot && !shot.scored;
  giveBall(g, a, "held");
  if (wasShot && !shot.blockedRecovered) {
    g.stats[a.id].rebounds += 1;
    emit(g, "rebound", { id: a.id, offensive: g.offense === a.id });
  } else if (!b.pass) emit(g, "recover", { id: a.id });
  else emit(g, "catch", { id: a.id });
  if (poke && poke.by === a.id) g.stats[a.id].steals += 1;
  if (poke && poke.from !== a.id && poke.by === a.id) emit(g, "stealWon", { id: a.id });
  if (g.O && g.offense !== a.id) {
    g.stats[g.other(a.id).id].turnovers += poke ? 1 : 0;
    changeOffense(g, a.id);
    if (g.drill && g.drill.onStop) g.drill.onStop(g, a);
  }
  if (!a.air) a.holdT = 0.3;
}

/* ============================================================ anim labels */

function animLabel(g, a) {
  const act = a.act;
  if (a.celebrate > 0 && !act) return "CELEBRATE";
  if (act) {
    switch (act.kind) {
      case "shoot": return "SHOOT";
      case "layup": return "LAYUP";
      case "dunk": return "DUNK";
      case "cross": return "CROSSOVER";
      case "steal": return "STEAL";
      case "jump": return act.rebound ? "REBOUND" : "BLOCK";
      case "land": return "LAND";
      case "fumble": return "IDLE";
      default: break;
    }
  }
  const sp = Math.hypot(a.vx, a.vz);
  const withBall = g.owner === a.id && (g.bmode === "dribble" || g.bmode === "held");
  if (withBall && g.bmode === "dribble") return a.hand === "R" ? "DRIBBLE_RIGHT" : "DRIBBLE_LEFT";
  if (sp < 0.3) return a.stance > 0.5 ? "DEFENSIVE_STANCE" : "IDLE";
  const f = fwd(a);
  const along = (a.vx * f.x + a.vz * f.z) / sp;
  if (along < -0.45) return "BACKPEDAL";
  if (Math.abs(along) < 0.55) return "STRAFE";
  return "RUN";
}

/* ============================================================ perception */

/**
 * Snapshots of what is VISIBLE (positions, velocities, visible action), kept
 * for ~0.8 s. The AI reads them through a reaction delay — it never sees the
 * player's key presses, only their visible consequences some ms later.
 */
function recordSnapshot(g) {
  g.snapTick = (g.snapTick || 0) + 1;
  if (g.snapTick % 4) return;
  const pick = (a) => a && ({ x: a.x, z: a.z, vx: a.vx, vz: a.vz, y: a.y, air: a.air, act: a.act ? a.act.kind : null, actT: a.act ? a.act.t : 0, hand: a.hand, facing: a.facing, slow: a.slow });
  const b = g.ball;
  g.snaps.push({
    t: g.time,
    p: pick(g.P),
    o: pick(g.O),
    ball: { x: b.p.x, y: b.p.y, z: b.p.z, vx: b.v.x, vy: b.v.y, vz: b.v.z, mode: g.bmode, owner: g.owner, drib: g.owner && g.byId(g.owner).drib ? g.byId(g.owner).drib.phase : 0 },
  });
  if (g.snaps.length > 60) g.snaps.shift();
}

export function perceive(g, delay) {
  const t = g.time - delay;
  const s = g.snaps;
  for (let i = s.length - 1; i >= 0; i--) if (s[i].t <= t) return s[i];
  return s[0] || null;
}

/* ============================================================ result */

function finishMatch(g) {
  if (g.over) return;
  g.over = true;
  g.phase = "over";
  g.phaseT = 0;
  const winner = g.score.p >= g.target ? "p" : "o";
  g.byId(winner).celebrate = 99;
  g.result = { winner, score: { ...g.score }, stats: { p: { ...g.stats.p }, o: { ...g.stats.o } }, time: g.time };
  emit(g, "matchEnd", { winner });
}

/* ============================================================ drills */

const THREE_SPOTS = [
  { x: -6.35, z: 0.9 }, { x: -4.75, z: 4.6 }, { x: 0, z: 6.55 }, { x: 4.75, z: 4.6 }, { x: 6.35, z: 0.9 },
];
const CONES = [
  { x: 3.2, z: 9.6 }, { x: -3.0, z: 8.2 }, { x: 3.2, z: 6.6 }, { x: -3.0, z: 5.0 }, { x: 2.6, z: 3.4 }, { x: 0, z: 1.6 },
];

function setupDrill(g) {
  const m = g.mode;
  if (m === "three") {
    g.drill = {
      kind: "three",
      spot: 0,
      shotAt: 0,
      points: 0,
      makes: 0,
      timeLeft: 70,
      done: false,
      spots: THREE_SPOTS,
      spawn: () => ({ ...THREE_SPOTS[0], z: THREE_SPOTS[0].z + 0.35 }),
      onScore(gg, s) {
        const d = gg.drill;
        if (s.drillCounted) {
          const money = s.drillMoney;
          d.makes += 1;
          d.points += money ? 3 : 2;
          emit(gg, "drillPoint", { points: money ? 3 : 2 });
        }
      },
    };
  } else if (m === "dunk") {
    g.drill = {
      kind: "dunk", points: 0, dunks: 0, layups: 0, timeLeft: 60, done: false,
      spawn: () => ({ x: 3.4, z: 7.6 }),
      onScore(gg, s) {
        const d = gg.drill;
        if (s.kind === "dunk") { d.dunks += 1; d.points += 3; emit(gg, "drillPoint", { points: 3 }); }
        else if (s.kind === "layup") { d.layups += 1; d.points += 1; emit(gg, "drillPoint", { points: 1 }); }
      },
    };
  } else if (m === "dribble") {
    g.drill = { kind: "dribble", cones: CONES, gate: 0, time: 0, done: false, crosses: 0, spawn: () => ({ x: 0, z: 11 }) };
  } else if (m === "defense") {
    g.drill = {
      kind: "defense", rep: 0, reps: 8, stops: 0, allowed: 0, done: false, resolved: false,
      spawn: () => CHECK_SPOT,
      onScore(gg) { gg.drill.allowed += 1; gg.drill.resolved = true; },
      onStop(gg, a) {
        const d = gg.drill;
        if (a.id === "p" && !d.resolved) {
          d.stops += 1;
          d.resolved = true;
          emit(gg, "drillPoint", { points: 1 });
          gg.phase = "reset";
          gg.phaseT = 0;
        }
      },
    };
  }
}

function nextDefenseRep(g) {
  const d = g.drill;
  d.rep += 1;
  if (d.rep >= d.reps) {
    d.done = true;
    finishDrill(g);
    setDead(g);
    g.phase = "over";
    return;
  }
  d.resolved = false;
  resetPossession(g, "o");
}

function finishDrill(g) {
  if (g.over) return;
  g.over = true;
  g.phase = "over";
  const d = g.drill;
  g.result = { drill: d.kind, ...summarizeDrill(g) };
  emit(g, "drillEnd", g.result);
}

function summarizeDrill(g) {
  const d = g.drill;
  if (d.kind === "three") return { score: d.points, makes: d.makes };
  if (d.kind === "dunk") return { score: d.points, dunks: d.dunks, layups: d.layups };
  if (d.kind === "dribble") return { score: Math.round(d.time * 100) / 100, time: d.time, crosses: d.crosses };
  if (d.kind === "defense") return { score: d.stops, stops: d.stops, allowed: d.allowed };
  return {};
}

function drillLogic(g, dt) {
  const d = g.drill;
  if (!d || d.done || g.phase === "over") return;
  if (d.kind === "three") {
    d.timeLeft -= dt;
    // tag each new jump shot with its spot (must be behind the arc, near the rack)
    const b = g.ball;
    if (b.shot && !b.shot.drillTagged) {
      b.shot.drillTagged = true;
      const spot = d.spots[d.spot];
      const shooterFeet = { x: g.P.x, z: g.P.z };
      const near = Math.hypot(shooterFeet.x - spot.x, shooterFeet.z - spot.z) < 1.6;
      if (near && Math.hypot(shooterFeet.x, shooterFeet.z) > ARC_R - 0.3 && b.shot.kind === "jump") {
        b.shot.drillCounted = true;
        b.shot.drillMoney = d.shotAt === 2;
        d.shotAt += 1;
        if (d.shotAt >= 3) {
          d.shotAt = 0;
          d.spot += 1;
          emit(g, "drillSpot", { spot: d.spot });
        }
      }
    }
    if (d.spot >= d.spots.length && (g.bmode !== "flight")) {
      if (!d.endT) d.endT = g.time;
      if (g.time - d.endT > 1.2) { d.done = true; finishDrill(g); }
    }
    if (d.timeLeft <= 0) { d.timeLeft = 0; d.done = true; finishDrill(g); }
  } else if (d.kind === "dunk") {
    d.timeLeft -= dt;
    if (d.timeLeft <= 0) { d.timeLeft = 0; d.done = true; finishDrill(g); }
  } else if (d.kind === "dribble") {
    if (g.owner === "p") d.started = true;
    if (d.started) d.time += dt;
    const c = d.cones[d.gate];
    if (c && g.owner === "p" && Math.hypot(g.P.x - c.x, g.P.z - c.z) < 0.95) {
      d.gate += 1;
      emit(g, "drillPoint", { points: 1, gate: d.gate });
      if (d.gate >= d.cones.length) { d.done = true; finishDrill(g); }
    }
    if (g.stats.p.crossovers !== d.crosses) d.crosses = g.stats.p.crossovers;
  }
}

/* ============================================================ helpers */

function lerp3(a, b, t) {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t };
}
function smooth(t) {
  return t * t * (3 - 2 * t);
}

/* ============================================================ invariants */

export function assertInvariants(g) {
  const carried = ["held", "dribble", "cross", "dunk"].includes(g.bmode);
  if (carried !== !!g.owner) throw new Error(`ownership mismatch: owner=${g.owner} mode=${g.bmode} t=${g.time.toFixed(3)}`);
  if (g.owner && !g.byId(g.owner)) throw new Error("owner does not exist");
  const b = g.ball.p;
  if (!Number.isFinite(b.x + b.y + b.z)) throw new Error("ball NaN");
  if (b.y < BALL_R - 0.02 && !g.owner) throw new Error(`ball below floor y=${b.y}`);
  if (g.score.p < 0 || g.score.o < 0) throw new Error("negative score");
  for (const a of g.ath) {
    if (!Number.isFinite(a.x + a.z + a.y)) throw new Error("athlete NaN");
    if (a.y < -1e-6) throw new Error("athlete below floor");
  }
  if (g.O) {
    const d = Math.hypot(g.P.x - g.O.x, g.P.z - g.O.z);
    if (d < BODY_R * 2 - 0.05) throw new Error(`bodies overlap ${d.toFixed(3)}`);
  }
}

export { BODY, local };
