/**
 * Arena Gladiator — the combat engine. One fight = two fighters in one arena,
 * advanced in fixed SIM_DT steps. No three.js, no DOM: the renderer and the
 * headless tests (tools/simTest.mjs) drive the exact same code.
 *
 * Every fighter (player, enemy, training partner) is the same state machine:
 *
 *   act = null                        free: move / guard / start actions
 *       | attack  {startup → active → recovery}
 *       | dodge   (short i-frame slice in the middle)
 *       | hurt | stagger | blockstun
 *       | defeated
 *
 * Controllers only produce INTENTS (move vector, desired yaw, held guard,
 * pressed buttons). The AI controller cannot see the player's intents — it
 * only reads delayed snapshots of what is visible (see perceive()).
 *
 * Weapon hits are swept: during the ACTIVE phase the blade is re-posed at
 * several sub-times inside every step and each segment is tested against the
 * target's hurt capsules, so a fast swing can't tunnel and a blade can only
 * hurt while it is actually passing through the body. One swing resolves each
 * target at most once.
 */
import { SIM_DT, MAX_FRAME_DT, BODY, FIGHTER_GAP, HURTBOXES, STAMINA, TIMING, HITSTOP, MOVE } from "./constants.js";
import { clamp, wrap, turnToward, localToWorld, segSegDist2, v3 } from "./math.js";
import { bladeSegment, kickSegment, shieldCenter } from "./pose.js";
import { KICK, weaponById, armorById } from "../data/weapons.js";

const NEUTRAL = Object.freeze({ mx: 0, mz: 0, yaw: null, turn: 0, sprint: false, block: false, light: false, heavy: false, dodge: false, kick: false });

export const STAT_KEYS = [
  "lightAttacks", "heavyAttacks", "kicks", "hitsLanded", "damageDealt", "damageTaken", "blocks",
  "parries", "dodges", "evades", "counters", "guardBreaks", "hitsTaken", "clashes",
];
const blankStats = () => Object.fromEntries(STAT_KEYS.map((k) => [k, 0]));

let fighterSeq = 0;

/**
 * cfg: { id, name, weapon, armor, hp, stamina, damageMul, tempo (startup
 *        multiplier — enemies telegraph more), moveMul, x, z, yaw }
 */
export function createFighter(cfg) {
  const weapon = typeof cfg.weapon === "string" ? weaponById(cfg.weapon) : cfg.weapon;
  const armor = typeof cfg.armor === "string" ? armorById(cfg.armor) : cfg.armor || armorById("balanced");
  return {
    uid: ++fighterSeq,
    id: cfg.id,
    name: cfg.name || cfg.id,
    weapon,
    armor,
    x: cfg.x || 0,
    z: cfg.z || 0,
    yaw: cfg.yaw || 0,
    vx: 0,
    vz: 0,
    maxHp: cfg.hp || 100,
    hp: cfg.hp || 100,
    maxStamina: cfg.stamina || STAMINA.max,
    stamina: cfg.stamina || STAMINA.max,
    exhausted: false,
    lastSpend: -10,
    damageMul: cfg.damageMul || 1,
    tempo: cfg.tempo || 1, // >1 = slower startups (clearer telegraphs)
    recoveryMul: cfg.recoveryMul || 1,
    moveMul: cfg.moveMul || 1,
    act: null,
    blockHeld: false,
    blocking: false,
    blockUpAt: -10,
    blockDownAt: -10,
    parryArmed: false,
    guardBlend: 0,
    sprintBlend: 0,
    sprinting: false,
    moving: 0,
    buffer: null, // { type, t }
    chain: null, // { index, until }
    counterUntil: -1,
    parryCounterUntil: -1,
    dodgeReadyAt: 0,
    attackSeq: 0,
    lastHitAt: -10,
    invulnerable: false, // training dummy
    immobile: false,
    defeated: false,
    stats: blankStats(),
  };
}

/**
 * arena: { radius, pillars: [{x, z, r}] }
 * controllers: { p: fn(fight, fighter, dt) → intent, o: fn(...) }
 */
export function createFight({ player, enemy, arena, controllers = {}, introDur = 2.6, seed = 1, training = false }) {
  const P = createFighter({ ...player, id: "p" });
  const O = createFighter({ ...enemy, id: "o" });
  P.x = 0;
  P.z = -2.6;
  P.yaw = 0;
  O.x = 0;
  O.z = 2.6;
  O.yaw = Math.PI;
  const fight = {
    time: 0,
    phase: introDur > 0 ? "intro" : "fight",
    phaseT: 0,
    introDur,
    arena,
    P,
    O,
    controllers,
    events: [],
    hitstop: 0,
    acc: 0,
    winner: null,
    ended: false,
    seed,
    training,
    history: [], // visible snapshots of both fighters (AI perception)
    elapsed: 0, // fight clock (only while phase === "fight")
  };
  if (introDur <= 0) emit(fight, { type: "fightStart" });
  return fight;
}

export const other = (fight, f) => (f === fight.P ? fight.O : fight.P);
function emit(fight, e) {
  e.t = fight.time;
  fight.events.push(e);
}
export function drainEvents(fight) {
  const e = fight.events;
  fight.events = [];
  return e;
}

/* ================================================================== timing */

/** Advance by a real frame delta (clamped) in fixed steps. */
export function advance(fight, frameDt) {
  fight.acc += clamp(frameDt, 0, MAX_FRAME_DT);
  let n = 0;
  while (fight.acc >= SIM_DT && n < 16) {
    fight.acc -= SIM_DT;
    step(fight, SIM_DT);
    n++;
  }
  if (n >= 16) fight.acc = 0;
}

export function step(fight, dt) {
  if (fight.hitstop > 0) {
    fight.hitstop = Math.max(0, fight.hitstop - dt);
    return;
  }
  fight.time += dt;
  fight.phaseT += dt;
  if (fight.phase === "intro" && fight.phaseT >= fight.introDur) {
    fight.phase = "fight";
    fight.phaseT = 0;
    emit(fight, { type: "fightStart" });
  }
  if (fight.phase === "fight") fight.elapsed += dt;
  if (fight.phase === "ko" && fight.phaseT >= 2.4 && !fight.ended) {
    fight.phase = "over";
    fight.ended = true;
    emit(fight, { type: "end", winner: fight.winner });
  }

  const live = fight.phase === "fight";
  for (const f of [fight.P, fight.O]) {
    if (f.act && f.act.type === "attack") f.act.prevT = f.act.t;
    const ctrl = fight.controllers[f.id];
    let intent = NEUTRAL;
    if (live && !f.defeated && ctrl) intent = ctrl(fight, f, dt) || NEUTRAL;
    updateFighter(fight, f, intent, dt);
  }
  separate(fight);
  resolveAttacks(fight, dt);
  record(fight);
}

/* ================================================================ fighters */

function spend(fight, f, amount) {
  if (amount <= 0) return;
  f.stamina = Math.max(0, f.stamina - amount);
  f.lastSpend = fight.time;
  if (f.stamina <= 0.001) {
    f.stamina = 0;
    if (!f.exhausted) {
      f.exhausted = true;
      emit(fight, { type: "exhausted", id: f.id });
    }
  }
}

function startAttack(fight, f, atk, opts = {}) {
  const startMul = (opts.startMul || 1) * (atk.kind === "kick" ? 1 : f.tempo);
  f.act = {
    type: "attack",
    atk,
    kind: atk.kind,
    t: 0,
    prevT: 0,
    phase: "startup",
    startup: atk.startup * startMul,
    active: atk.active,
    recovery: atk.recovery * f.recoveryMul,
    hit: new Set(),
    evaded: false,
    bounced: false,
    counter: !!opts.counter,
    seq: ++f.attackSeq,
    chainIndex: opts.chainIndex ?? -1,
  };
  f.blocking = false;
  spend(fight, f, Math.min(f.stamina, atk.stamina));
  const s = f.stats;
  if (atk.kind === "light") s.lightAttacks++;
  else if (atk.kind === "heavy") s.heavyAttacks++;
  else s.kicks++;
  emit(fight, { type: "attackStart", id: f.id, kind: atk.kind, atk: atk.id, seq: f.act.seq });
}

function tryStartBuffered(fight, f) {
  const b = f.buffer;
  if (!b) return;
  if (fight.time - b.t > TIMING.inputBuffer) {
    f.buffer = null;
    return;
  }
  const act = f.act;
  // may we act now? free, or chaining out of a light attack's recovery
  let chainFrom = null;
  if (act) {
    if (act.type === "attack" && act.phase === "recovery" && act.kind === "light" && (b.type === "light" || b.type === "heavy") && !act.bounced) {
      const rt = act.t - act.startup - act.active;
      if (rt >= (act.atk.chainAt || 0.1)) chainFrom = act;
      else return;
    } else if (act.type === "attack" && act.phase === "recovery" && b.type === "dodge") {
      // dodge may cancel the tail of a recovery, never the swing itself
      const rt = act.t - act.startup - act.active;
      if (rt < act.recovery * 0.55) return;
    } else return;
  }
  const W = f.weapon;
  const counter = fight.time <= f.counterUntil;
  if (b.type === "light") {
    if (f.stamina < 3) return; // keep the press buffered a moment
    const idx = chainFrom ? (chainFrom.chainIndex + 1) % W.light.length : 0;
    startAttack(fight, f, { ...W.light[idx], kind: "light" }, { chainIndex: idx, counter });
  } else if (b.type === "heavy") {
    if (f.exhausted || f.stamina < STAMINA.heavyMin) {
      f.buffer = null;
      emit(fight, { type: "denied", id: f.id, what: "heavy" });
      return;
    }
    // a heavy out of a light chain or right after a parry winds up faster
    const startMul = f.parryCounterUntil >= fight.time ? 0.62 : chainFrom ? 0.82 : 1;
    startAttack(fight, f, { ...W.heavy, kind: "heavy" }, { startMul, counter });
  } else if (b.type === "kick") {
    if (f.stamina < 8) return;
    startAttack(fight, f, { ...KICK }, { counter: false });
  } else if (b.type === "dodge") {
    if (fight.time < f.dodgeReadyAt) return;
    if (f.exhausted || f.stamina < STAMINA.dodgeMin) {
      f.buffer = null;
      emit(fight, { type: "denied", id: f.id, what: "dodge" });
      return;
    }
    const cost = 20;
    const scale = clamp(f.stamina / cost, 0.55, 1);
    let dx = b.mx;
    let dz = b.mz;
    const m = Math.hypot(dx, dz);
    if (m < 0.2) {
      dx = -Math.sin(f.yaw);
      dz = -Math.cos(f.yaw);
    } else {
      dx /= m;
      dz /= m;
    }
    const dist = 2.35 * f.armor.dodgeMul * scale;
    // side / back / forward relative to facing (drives the animation)
    const fwd = dx * Math.sin(f.yaw) + dz * Math.cos(f.yaw);
    const right = dx * -Math.cos(f.yaw) + dz * Math.sin(f.yaw);
    const dirName = Math.abs(fwd) > Math.abs(right) ? (fwd > 0 ? "fwd" : "back") : right > 0 ? "right" : "left";
    f.act = { type: "dodge", t: 0, dur: TIMING.dodgeDur, dx, dz, dist, dir: dirName };
    f.blocking = false;
    spend(fight, f, Math.min(f.stamina, cost));
    f.stats.dodges++;
    emit(fight, { type: "dodge", id: f.id, dir: dirName });
  }
  f.buffer = null;
}

function updateFighter(fight, f, I, dt) {
  const t = fight.time;
  // ---------------------------------------------------------------- act clock
  const act = f.act;
  if (act) {
    act.t += dt;
    if (act.type === "attack") {
      const prev = act.phase;
      if (act.t < act.startup) act.phase = "startup";
      else if (act.t < act.startup + act.active) act.phase = "active";
      else if (act.t < act.startup + act.active + act.recovery) act.phase = "recovery";
      else act.phase = "done";
      if (prev === "startup" && act.phase !== "startup") emit(fight, { type: "swing", id: f.id, kind: act.kind, atk: act.atk.id });
      // judged one step after the active phase closed (its last sub-samples resolve first)
      if (!act.judged && act.prevT >= act.startup + act.active) {
        act.judged = true;
        if (act.hit.size === 0 && !act.bounced) emit(fight, { type: "whiff", id: f.id, kind: act.kind });
      }
      if (act.phase === "done") f.act = null;
    } else if (act.type === "dodge") {
      if (act.t >= act.dur) {
        f.act = null;
        f.dodgeReadyAt = t + TIMING.dodgeCooldown;
      }
    } else if (act.type === "hurt" || act.type === "stagger" || act.type === "blockstun") {
      if (act.t >= act.dur) f.act = null;
    }
  }
  f.invulnerableNow = !!(f.act && f.act.type === "dodge" && f.act.t >= TIMING.dodgeIFrames[0] && f.act.t <= TIMING.dodgeIFrames[1]);

  if (f.defeated) {
    f.blocking = false;
    f.guardBlend = Math.max(0, f.guardBlend - dt * 6);
    f.vx *= Math.max(0, 1 - dt * 6);
    f.vz *= Math.max(0, 1 - dt * 6);
    f.x += f.vx * dt;
    f.z += f.vz * dt;
    return;
  }

  // ---------------------------------------------------------------- presses
  if (I.light) f.buffer = { type: "light", t };
  if (I.heavy) f.buffer = { type: "heavy", t };
  if (I.kick) f.buffer = { type: "kick", t };
  if (I.dodge) f.buffer = { type: "dodge", t, mx: I.mx, mz: I.mz };

  // ---------------------------------------------------------------- guard
  f.blockHeld = !!I.block;
  const a = f.act;
  let canGuard = !a || a.type === "blockstun";
  if (a && a.type === "attack" && a.phase === "recovery" && !f.buffer) {
    const rt = a.t - a.startup - a.active;
    if (rt >= a.recovery * 0.6) canGuard = true;
  }
  const want = f.blockHeld && canGuard && !f.immobile;
  if (want && !f.blocking) {
    if (a && a.type === "attack") f.act = null; // guard cancels the tail of a recovery
    f.blocking = true;
    f.parryArmed = t - f.blockDownAt >= TIMING.parryRearm;
    f.blockUpAt = t;
    emit(fight, { type: "guardUp", id: f.id });
  } else if (!want && f.blocking) {
    f.blocking = false;
    f.blockDownAt = t;
  }
  if (f.blocking && f.act && f.act.type !== "blockstun") {
    f.blocking = false;
    f.blockDownAt = t;
  }

  // buffered actions (attacks drop the guard) — only while the bout is live
  if (fight.phase !== "fight") f.buffer = null;
  if (f.buffer && !f.immobile) tryStartBuffered(fight, f);

  // ---------------------------------------------------------------- facing
  const cur = f.act;
  let turn = I.turn || MOVE.turn;
  if (cur) {
    if (cur.type === "attack") turn = cur.phase === "startup" ? 6 : cur.phase === "active" ? 2.2 : 4;
    else if (cur.type === "dodge") turn = 3;
    else if (cur.type === "blockstun") turn = 6;
    else turn = 1.2;
  } else if (f.blocking) turn = Math.min(turn, 12);
  if (I.yaw != null && !f.immobile) f.yaw = turnToward(f.yaw, I.yaw, turn * dt);

  // ---------------------------------------------------------------- movement
  let tvx = 0;
  let tvz = 0;
  const im = Math.min(1, Math.hypot(I.mx, I.mz));
  f.sprinting = false;
  if (!f.immobile && (!cur || cur.type === "blockstun")) {
    let speed = MOVE.walk;
    if (I.sprint && im > 0.3 && !f.blocking && f.stamina > 1 && !f.exhausted) {
      const fwdDot = (I.mx * Math.sin(f.yaw) + I.mz * Math.cos(f.yaw)) / Math.max(im, 1e-3);
      if (fwdDot > -0.2) {
        speed = MOVE.sprint;
        f.sprinting = true;
      }
    }
    if (f.blocking) speed *= MOVE.blockMul;
    if (cur && cur.type === "blockstun") speed *= 0.3;
    if (f.exhausted) speed *= MOVE.exhaustedMul;
    speed *= f.armor.moveMul * f.moveMul;
    tvx = I.mx * speed;
    tvz = I.mz * speed;
  } else if (cur && cur.type === "attack") {
    // small steering + the attack's committed lunge
    tvx = I.mx * MOVE.walk * MOVE.attackMul;
    tvz = I.mz * MOVE.attackMul * MOVE.walk;
    const l0 = cur.startup * 0.55;
    const l1 = cur.startup + cur.active;
    if (cur.t >= l0 && cur.t <= l1) {
      const o = other(fight, f);
      const d = Math.hypot(o.x - f.x, o.z - f.z);
      const room = clamp((d - FIGHTER_GAP - 0.1) / 0.5, 0, 1); // don't shove into the opponent
      const v = ((cur.atk.lunge || 0) / (l1 - l0)) * room;
      tvx += Math.sin(f.yaw) * v;
      tvz += Math.cos(f.yaw) * v;
    }
  }
  if (cur && cur.type === "dodge") {
    const p = clamp(cur.t / cur.dur, 0, 1);
    const v = ((2 * cur.dist) / cur.dur) * (1 - p);
    f.vx = cur.dx * v;
    f.vz = cur.dz * v;
  } else if (cur && (cur.type === "hurt" || cur.type === "stagger")) {
    const k = Math.max(0, 1 - dt * 7);
    f.vx *= k;
    f.vz *= k;
  } else {
    const k = Math.min(1, dt * MOVE.accel);
    f.vx += (tvx - f.vx) * k;
    f.vz += (tvz - f.vz) * k;
  }
  f.x += f.vx * dt;
  f.z += f.vz * dt;
  f.moving = Math.hypot(f.vx, f.vz);

  // ---------------------------------------------------------------- stamina
  if (f.sprinting) spend(fight, f, STAMINA.sprint * dt);
  const attacking = f.act && f.act.type === "attack";
  if (!f.sprinting && !attacking && t - f.lastSpend >= STAMINA.regenDelay) {
    const mul = (f.blocking ? STAMINA.regenBlocking : 1) * f.armor.regenMul;
    f.stamina = Math.min(f.maxStamina, f.stamina + STAMINA.regen * mul * dt);
  }
  if (f.exhausted && f.stamina >= STAMINA.exhaustedUntil) {
    f.exhausted = false;
    emit(fight, { type: "recovered", id: f.id });
  }

  // ---------------------------------------------------------------- visual blends (shared by the hitbox pose)
  f.guardBlend = clamp(f.guardBlend + (f.blocking ? 1 : -1) * dt * 14, 0, 1);
  f.sprintBlend = clamp(f.sprintBlend + (f.sprinting ? 1 : -1) * dt * 6, 0, 1);
}

/* ================================================================ collision */

function constrain(arena, f) {
  const R = arena.radius - BODY.radius;
  const d = Math.hypot(f.x, f.z);
  if (d > R) {
    f.x *= R / d;
    f.z *= R / d;
    // kill the outward velocity component
    const nx = f.x / R;
    const nz = f.z / R;
    const vn = f.vx * nx + f.vz * nz;
    if (vn > 0) {
      f.vx -= vn * nx;
      f.vz -= vn * nz;
    }
  }
  for (const p of arena.pillars || []) {
    const dx = f.x - p.x;
    const dz = f.z - p.z;
    const min = p.r + BODY.radius;
    const dd = Math.hypot(dx, dz);
    if (dd < min && dd > 1e-6) {
      f.x = p.x + (dx / dd) * min;
      f.z = p.z + (dz / dd) * min;
    }
  }
}

function separate(fight) {
  const { P, O, arena } = fight;
  for (let i = 0; i < 2; i++) {
    const dx = O.x - P.x;
    const dz = O.z - P.z;
    let d = Math.hypot(dx, dz);
    if (d < FIGHTER_GAP) {
      let nx;
      let nz;
      if (d < 1e-5) {
        nx = Math.sin(P.yaw);
        nz = Math.cos(P.yaw);
        d = 0;
      } else {
        nx = dx / d;
        nz = dz / d;
      }
      const push = FIGHTER_GAP - d;
      const wp = P.immobile || P.defeated ? 0 : O.immobile || O.defeated ? 1 : 0.5;
      const wo = 1 - wp;
      P.x -= nx * push * wp;
      P.z -= nz * push * wp;
      O.x += nx * push * wo;
      O.z += nz * push * wo;
    }
    constrain(arena, P);
    constrain(arena, O);
  }
}

/* ================================================================ hits */

const segA = v3();
const segB = v3();
const segC = v3();
const segD = v3();
const cp = v3();
const hbA = [v3(), v3(), v3()];
const hbB = [v3(), v3(), v3()];
const shieldP = v3();

function hurtWorld(f) {
  for (let i = 0; i < HURTBOXES.length; i++) {
    const h = HURTBOXES[i];
    localToWorld(hbA[i], f.x, f.z, f.yaw, h.a[0], h.a[1], h.a[2]);
    localToWorld(hbB[i], f.x, f.z, f.yaw, h.b[0], h.b[1], h.b[2]);
  }
}

/** Sub-sample count for the part of [t0, t1] that overlaps the active phase. */
function activeSpan(act, t0, t1) {
  const a0 = Math.max(t0, act.startup);
  const a1 = Math.min(t1, act.startup + act.active);
  return a1 >= a0 ? [a0, a1] : null;
}

/** Test one blade/kick sample against the target. Returns {part, point} or null. */
function sampleHit(B, radius, A0, A1, useShield) {
  let best = null;
  let bestD = Infinity;
  for (let i = 0; i < HURTBOXES.length; i++) {
    const h = HURTBOXES[i];
    const d2 = segSegDist2(A0, A1, hbA[i], hbB[i], cp);
    const r = h.r + radius;
    if (d2 <= r * r && d2 < bestD) {
      bestD = d2;
      best = { part: h.part, point: { x: cp.x, y: cp.y, z: cp.z } };
    }
  }
  if (useShield && shieldCenter(B, shieldP)) {
    // the raised shield disc (approximated by a sphere) also stops blades
    const d2 = segSegDist2(A0, A1, shieldP, shieldP, cp);
    const r = B.weapon.shield.radius + radius;
    if (d2 <= r * r) best = { part: "shield", point: { x: shieldP.x, y: shieldP.y, z: shieldP.z } };
  }
  return best;
}

function inFront(B, A) {
  const ang = Math.atan2(A.x - B.x, A.z - B.z);
  return Math.abs(wrap(ang - B.yaw)) <= B.weapon.blockArc;
}

function resolveAttacks(fight, dt) {
  const { P, O } = fight;
  if (fight.phase !== "fight" && fight.phase !== "ko") return;
  // blade-vs-blade clash: both swinging live at once and the blades cross
  if (clashCheck(fight, P, O, dt)) return;
  for (const A of [P, O]) {
    const B = other(fight, A);
    const act = A.act;
    if (!act || act.type !== "attack" || B.defeated) continue;
    if (act.hit.has(B.uid)) continue;
    const span = activeSpan(act, act.prevT, act.t);
    if (!span) continue;
    hurtWorld(B);
    const N = 7;
    const saveT = act.t;
    let result = null;
    for (let s = 0; s <= N && !result; s++) {
      const ts = span[0] + ((span[1] - span[0]) * s) / N;
      act.t = ts;
      if (act.kind === "kick") {
        kickSegment(A, act.atk, ts, segA, segB);
        const r = sampleHit(B, act.atk.foot.radius, segA, segB, B.blocking);
        if (r) result = r;
      } else {
        for (const side of ["R", "L"]) {
          if (!act.atk[side]) continue;
          if (!bladeSegment(A, side, segA, segB)) continue;
          const r = sampleHit(B, A.weapon.blades[side].radius, segA, segB, B.blocking);
          if (r) {
            result = r;
            break;
          }
        }
      }
    }
    act.t = saveT;
    if (!result) continue;
    if (B.invulnerableNow) {
      if (!act.evaded) {
        act.evaded = true;
        B.stats.evades++;
        emit(fight, { type: "evade", id: B.id, by: A.id });
      }
      continue;
    }
    act.hit.add(B.uid);
    applyContact(fight, A, B, act, result);
  }
}

function clashCheck(fight, P, O) {
  const a = P.act;
  const b = O.act;
  if (!a || !b || a.type !== "attack" || b.type !== "attack" || a.kind === "kick" || b.kind === "kick") return false;
  if (a.phase !== "active" || b.phase !== "active" || a.hit.has(O.uid) || b.hit.has(P.uid)) return false;
  for (const sa of ["R", "L"]) {
    if (!a.atk[sa] || !bladeSegment(P, sa, segA, segB, true)) continue;
    for (const sb of ["R", "L"]) {
      if (!b.atk[sb] || !bladeSegment(O, sb, segC, segD, true)) continue;
      const r = P.weapon.blades[sa].radius + O.weapon.blades[sb].radius + 0.03;
      if (segSegDist2(segA, segB, segC, segD, cp) <= r * r) {
        a.hit.add(O.uid);
        b.hit.add(P.uid);
        for (const f of [P, O]) {
          f.act = { type: "stagger", t: 0, dur: TIMING.clash, reason: "clash" };
          f.stats.clashes++;
          const o = other(fight, f);
          const dx = f.x - o.x;
          const dz = f.z - o.z;
          const d = Math.hypot(dx, dz) || 1;
          f.vx = (dx / d) * 1.6;
          f.vz = (dz / d) * 1.6;
        }
        fight.hitstop = Math.max(fight.hitstop, HITSTOP.clash);
        emit(fight, { type: "clash", point: { x: cp.x, y: cp.y, z: cp.z } });
        return true;
      }
    }
  }
  return false;
}

function knock(A, B, speed) {
  const dx = B.x - A.x;
  const dz = B.z - A.z;
  const d = Math.hypot(dx, dz) || 1;
  B.vx = (dx / d) * speed;
  B.vz = (dz / d) * speed;
}

function applyContact(fight, A, B, act, hit) {
  const t = fight.time;
  const kind = act.kind;
  const front = inFront(B, A);
  const guarded = B.blocking && front;

  if (guarded) {
    const window = t - B.blockUpAt;
    if (kind === "kick") {
      // a kick into a raised guard breaks it
      B.blocking = false;
      B.blockDownAt = t;
      B.act = { type: "stagger", t: 0, dur: TIMING.guardBreak, reason: "guardBreak" };
      spend(fight, B, 12);
      knock(A, B, 2.4);
      A.stats.guardBreaks++;
      A.counterUntil = t + TIMING.counterWindow;
      fight.hitstop = Math.max(fight.hitstop, HITSTOP.guardBreak);
      emit(fight, { type: "guardBreak", id: B.id, by: A.id, point: hit.point, kind });
      return;
    }
    if (B.parryArmed && window <= TIMING.parryWindow) {
      // ---- PARRY: deflected, attacker thrown off-balance, defender gets the opening
      A.act = { type: "stagger", t: 0, dur: TIMING.parried * (kind === "heavy" ? 1.15 : 1), reason: "parried" };
      knock(B, A, 1.2);
      B.counterUntil = t + TIMING.counterWindow;
      B.parryCounterUntil = t + TIMING.counterWindow;
      B.stamina = Math.min(B.maxStamina, B.stamina + 8);
      B.parryArmed = false;
      B.stats.parries++;
      fight.hitstop = Math.max(fight.hitstop, HITSTOP.parry);
      emit(fight, { type: "parry", id: B.id, by: A.id, point: hit.point, kind });
      return;
    }
    // ---- BLOCK
    const cost = (kind === "heavy" ? 26 : 12) * B.weapon.blockCost;
    if (kind === "heavy" && B.stamina < cost) {
      B.blocking = false;
      B.blockDownAt = t;
      B.act = { type: "stagger", t: 0, dur: TIMING.guardBreak, reason: "guardBreak" };
      spend(fight, B, B.stamina);
      knock(A, B, 2.2);
      A.stats.guardBreaks++;
      A.counterUntil = t + TIMING.counterWindow;
      fight.hitstop = Math.max(fight.hitstop, HITSTOP.guardBreak);
      emit(fight, { type: "guardBreak", id: B.id, by: A.id, point: hit.point, kind });
      return;
    }
    spend(fight, B, cost);
    B.act = { type: "blockstun", t: 0, dur: TIMING.blockStun * (kind === "heavy" ? 1.5 : 1) };
    B.counterUntil = t + TIMING.counterWindow * 0.6;
    knock(A, B, kind === "heavy" ? 1.8 : 0.9);
    // the attacker's weapon rebounds and its recovery drags a little
    act.bounced = true;
    act.recovery += kind === "heavy" ? 0.08 : 0.12;
    B.stats.blocks++;
    fight.hitstop = Math.max(fight.hitstop, HITSTOP.block);
    emit(fight, { type: "block", id: B.id, by: A.id, point: hit.point, kind, shield: !!B.weapon.shield });
    return;
  }

  // ---- HIT
  const counter = t <= A.counterUntil || (B.act && B.act.type === "stagger" && B.act.reason !== "clash");
  let dmg = kind === "kick" ? act.atk.damage : act.atk.damage * A.damageMul;
  if (counter && kind !== "kick") dmg *= 1.3;
  if (hit.part === "head") dmg *= 1.15;
  dmg *= 1 - B.armor.defense;
  dmg = Math.max(1, Math.round(dmg));
  if (B.invulnerable) dmg = 0;
  dmg = Math.min(dmg, B.hp); // no overkill in the stats
  B.hp = Math.max(0, B.hp - dmg);
  B.lastHitAt = t;
  const heavy = kind === "heavy";
  B.blocking = false;
  if (B.guardBlend > 0) B.blockDownAt = t;
  if (!B.immobile) {
    B.act = { type: "hurt", t: 0, dur: heavy ? TIMING.hurtHeavy : kind === "kick" ? 0.34 : TIMING.hurtLight, heavy, dir: Math.atan2(B.x - A.x, B.z - A.z) };
    knock(A, B, heavy ? 3.0 : kind === "kick" ? 2.4 : 1.5);
  }
  A.stats.hitsLanded++;
  A.stats.damageDealt += dmg;
  B.stats.damageTaken += dmg;
  B.stats.hitsTaken++;
  if (counter && kind !== "kick") {
    A.stats.counters++;
    A.counterUntil = -1;
  }
  const armored = hit.part === "body" && B.armor.defense >= 0.1;
  fight.hitstop = Math.max(fight.hitstop, heavy ? HITSTOP.heavy : kind === "kick" ? HITSTOP.kick : HITSTOP.light);
  emit(fight, {
    type: "hit", id: B.id, by: A.id, kind, dmg, part: hit.part, point: hit.point, counter: counter && kind !== "kick",
    flank: B.guardBlend > 0.5 && !front, armored,
  });
  if (B.hp <= 0 && !B.invulnerable) defeat(fight, B, A);
}

function defeat(fight, B, A) {
  if (B.defeated) return;
  B.defeated = true;
  B.blocking = false;
  B.act = { type: "defeated", t: 0, dir: Math.atan2(B.x - A.x, B.z - A.z) };
  if (fight.phase === "fight") {
    fight.phase = "ko";
    fight.phaseT = 0;
    fight.winner = A.id;
    emit(fight, { type: "ko", id: B.id, winner: A.id });
  }
}

/** Forfeit / time-out helpers for training & tests. */
export function endFight(fight, winner) {
  if (fight.ended) return;
  fight.winner = winner;
  fight.phase = "over";
  fight.ended = true;
  emit(fight, { type: "end", winner });
}

/* ================================================================ perception */

const HISTORY_SEC = 1.4;

/**
 * Store what an observer could SEE this step: body, stance, and which part
 * of which attack is being performed — never the controller intents.
 */
function record(fight) {
  const snap = { t: fight.time };
  for (const f of [fight.P, fight.O]) {
    const a = f.act;
    snap[f.id] = {
      x: f.x,
      z: f.z,
      yaw: f.yaw,
      vx: f.vx,
      vz: f.vz,
      act: a ? a.type : null,
      kind: a && a.type === "attack" ? a.kind : null,
      phase: a && a.type === "attack" ? a.phase : null,
      at: a ? a.t : 0,
      startup: a && a.type === "attack" ? a.startup : 0,
      active: a && a.type === "attack" ? a.active : 0,
      seq: a && a.type === "attack" ? a.seq : 0,
      reason: a && a.type === "stagger" ? a.reason : null,
      blocking: f.blocking,
      stamina: f.stamina,
      exhausted: f.exhausted,
      hp: f.hp,
      maxHp: f.maxHp,
      reach: reachOf(f),
    };
  }
  fight.history.push(snap);
  const cut = fight.time - HISTORY_SEC;
  let i = 0;
  while (i < fight.history.length - 1 && fight.history[i].t < cut) i++;
  if (i > 0) fight.history.splice(0, i);
}

/** Approximate reach of a fighter's weapon (for AI spacing). */
export function reachOf(f) {
  const b = f.weapon.blades.R || f.weapon.blades.L;
  return 0.55 + b.grip + b.length;
}

/** Snapshot of fighter `id` as it looked `delay` seconds ago. */
export function perceive(fight, id, delay) {
  const h = fight.history;
  if (!h.length) return null;
  const want = fight.time - delay;
  let s = h[0];
  for (let i = h.length - 1; i >= 0; i--) {
    if (h[i].t <= want) {
      s = h[i];
      break;
    }
  }
  return { t: s.t, ...s[id] };
}
