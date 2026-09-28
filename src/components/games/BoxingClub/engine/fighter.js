/**
 * Boxing Club — one fighter's state machine. Pure data + functions, no DOM.
 * The player and every AI opponent run through exactly these rules; the AI
 * only produces the same `input` object a keyboard would.
 *
 * States (one at a time, explicit transitions):
 *   neutral   standing / moving, can do anything
 *   attack    startup → active → recovery (see attacks.js)
 *   block     guard up (effective after BLOCK.raise); may be in block-stun
 *   dodge     slip (back or in); head punches pass during the invuln window
 *   hitstun   reeling from a clean hit; cannot act
 *   down      knocked down / getting up / KO'd (driven by fight.js)
 *   frozen    round intro, corner, fight over
 *
 * Priority when several inputs arrive together: an active state finishes
 * first; from neutral, DODGE > ATTACK > BLOCK. Holding block suppresses
 * punches (you can't hook and cover up at once).
 */
import { ATTACKS, BODY_OF, DODGE, BLOCK } from "./attacks.js";

export const RING_HALF = 3.1; // metres from centre to the ropes
export const ROPE_MARGIN = 0.32; // a fighter's centre can't get closer to the ropes
export const MIN_SEP = 0.56; // centres never closer than this
export const BUFFER_MS = 140; // a punch pressed this early is remembered, no longer

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/** Attribute levels 1–10 → small multipliers (skill must still matter more). */
export function statMods(stats = {}) {
  const lv = (k) => clamp(Math.round(stats[k] ?? 1), 1, 10) - 1;
  return {
    power: 1 + lv("power") * 0.025, // +22.5% at 10
    speed: 1 - lv("speed") * 0.012, // timings −10.8% at 10
    move: 1 + lv("speed") * 0.015,
    stamina: 100 + lv("stamina") * 4, // max stamina
    regen: 1 + lv("recovery") * 0.04,
    getUp: lv("recovery"),
  };
}

export function createFighter({ id, name, side, x, facing, maxHealth = 100, stats, profile = {} }) {
  const mods = statMods(stats);
  const maxStamina = Math.round(mods.stamina * (profile.staminaMul ?? 1));
  return {
    id,
    name,
    side, // "player" | "opponent"
    x,
    facing,
    speedX: 0,
    maxHealth,
    health: maxHealth,
    maxStamina,
    stamina: maxStamina,
    mods,
    timeMul: mods.speed * (profile.timeMul ?? 1),
    moveMul: mods.move * (profile.moveMul ?? 1),
    powerMul: mods.power * (profile.powerMul ?? 1),
    state: "neutral",
    attack: null, // { id, def, t, su, ac, rc, extra, resolved, hit, blocked, whiff, uid, dmgMul }
    dodge: null, // { dir, t, evaded, perfect }
    guardT: 0, // how long the guard has been up
    blockStunT: 0,
    stunT: 0,
    react: null, // { kind, t, dur, strength, body }
    counterT: 0, // time left in which a landed punch counts as a counter
    regenDelay: 0,
    bodyPenaltyT: 0,
    buffer: null, // { id, age }
    down: null, // fight.js owns this while knocked down
    stepPhase: 0, // footwork clock for the renderer
    moving: 0, // -1 back, 0, +1 forward (relative to facing), for animation
    breath: Math.random() * 10,
    uidCounter: 0,
    knockdowns: 0,
    exhaustedFlag: false,
  };
}

export const isDown = (f) => f.state === "down";
export const isExhausted = (f) => f.stamina < 12;
export const isTired = (f) => f.stamina < 28;

/** Timing multiplier right now (speed stat, profile, fatigue). */
export function timing(f) {
  const tired = isExhausted(f) ? 1.32 : isTired(f) ? 1.14 : 1;
  return f.timeMul * tired;
}

export function canAct(f) {
  if (f.state === "neutral") return true;
  if (f.state === "block") return f.blockStunT <= 0;
  if (f.state === "attack") {
    const a = f.attack;
    const recStart = a.su + a.ac;
    return (a.hit || a.blocked) && !a.whiff && a.t >= recStart + a.rc * a.def.cancelAt;
  }
  return false;
}

function spend(f, amount) {
  f.stamina = Math.max(0, f.stamina - amount);
  f.regenDelay = 620;
}

export function startAttack(f, id, events) {
  const def = ATTACKS[id];
  if (!def) return false;
  const tm = timing(f);
  const dmgMul = (isExhausted(f) ? 0.62 : isTired(f) ? 0.86 : 1) * f.powerMul;
  f.attack = {
    id, def, t: 0,
    su: def.startup * tm, ac: def.active, rc: def.recovery * tm, extra: 0,
    resolved: false, hit: false, blocked: false, whiff: false, swung: false,
    uid: ++f.uidCounter, dmgMul,
    // thrown inside a counter window (after a slip or a block) → counts as a counter
    fromCounter: f.counterT > 0,
  };
  f.counterT = 0;
  f.state = "attack";
  f.guardT = 0;
  f.blockStunT = 0;
  spend(f, def.stamina);
  events?.push({ type: "throw", who: f.side, attack: id });
  return true;
}

export function startDodge(f, dir, events) {
  if (f.stamina < 2) return false;
  f.dodge = { dir, t: 0, evaded: false, perfect: false };
  f.state = "dodge";
  f.attack = null;
  f.guardT = 0;
  spend(f, DODGE.stamina);
  events?.push({ type: "dodge", who: f.side, dir });
  return true;
}

/** Is the defender currently slipping head punches? */
export function headInvulnerable(f) {
  return f.state === "dodge" && f.dodge.t >= DODGE.invulnFrom && f.dodge.t <= DODGE.invulnTo;
}

export function guardUp(f) {
  return f.state === "block" && f.guardT >= BLOCK.raise;
}

/**
 * Apply one tick of input + time to a fighter (not hit resolution — that is
 * fight.js, which sees both fighters). `input`:
 *   { move: -1|0|1 (screen dir), block: bool, attack: id|null (fresh press),
 *     body: bool, dodge: null|"back"|"in" (fresh press) }
 */
export function updateFighter(f, dt, input, events) {
  f.breath += dt / 1000;
  if (f.react) {
    f.react.t += dt;
    if (f.react.t >= f.react.dur) f.react = null;
  }
  if (f.counterT > 0) f.counterT = Math.max(0, f.counterT - dt);
  if (f.bodyPenaltyT > 0) f.bodyPenaltyT = Math.max(0, f.bodyPenaltyT - dt);

  if (f.state === "down" || f.state === "frozen") {
    f.buffer = null;
    f.moving = 0;
    return;
  }

  // punch buffer: remember a fresh press briefly
  if (input.attack) {
    const id = input.body ? BODY_OF[input.attack] || input.attack : input.attack;
    f.buffer = { id, age: 0 };
  } else if (f.buffer) {
    f.buffer.age += dt;
    if (f.buffer.age > BUFFER_MS) f.buffer = null;
  }

  // ---- timed states
  if (f.state === "hitstun") {
    f.stunT -= dt;
    if (f.stunT <= 0) f.state = "neutral";
  } else if (f.state === "attack") {
    const a = f.attack;
    a.t += dt;
    const end = a.su + a.ac + a.rc + a.extra;
    if (a.t >= end) {
      f.attack = null;
      f.state = "neutral";
    }
  } else if (f.state === "dodge") {
    const d = f.dodge;
    const prev = d.t;
    d.t += dt;
    // slip travel (eased), in the fighter's own backwards/forwards direction
    const dist = d.dir === "back" ? -DODGE.backDistance : DODGE.inDistance;
    const e = (t) => {
      const k = Math.min(1, t / (DODGE.duration * 0.7));
      return 1 - (1 - k) * (1 - k);
    };
    f.x += f.facing * dist * (e(d.t) - e(prev));
    if (d.t >= DODGE.duration) {
      if (d.evaded) f.counterT = Math.max(f.counterT, d.perfect ? DODGE.perfectCounterWindow : DODGE.counterWindow);
      f.dodge = null;
      f.state = "neutral";
    }
  }

  if (f.state === "block") {
    f.guardT += dt;
    if (f.blockStunT > 0) f.blockStunT = Math.max(0, f.blockStunT - dt);
    if (!input.block && f.blockStunT <= 0) {
      f.state = "neutral";
      f.guardT = 0;
    }
  }

  // ---- new actions (priority: dodge > attack > block)
  if (canAct(f)) {
    const fromBlock = f.state === "block";
    if (input.dodge && (!fromBlock || f.blockStunT <= 0)) {
      startDodge(f, input.dodge, events);
    } else if (f.buffer && !input.block) {
      const id = f.buffer.id;
      f.buffer = null;
      startAttack(f, id, events);
    } else if (input.block && f.state === "neutral") {
      f.state = "block";
      f.guardT = 0;
    }
  }

  // ---- movement (only while free or guarding)
  let want = 0;
  if (f.state === "neutral" || f.state === "block") want = input.move || 0;
  const base = (want * f.facing > 0 ? 1.75 : 1.55) * f.moveMul * (f.state === "block" ? 0.5 : 1) * (isExhausted(f) ? 0.8 : 1);
  const target = want * base;
  const k = Math.min(1, dt / 90); // smooth start/stop, no instant sliding
  f.speedX += (target - f.speedX) * k;
  if (Math.abs(f.speedX) < 0.002 && want === 0) f.speedX = 0;
  f.x += f.speedX * (dt / 1000);
  f.moving = Math.abs(f.speedX) > 0.05 ? Math.sign(f.speedX * f.facing) : 0;
  f.stepPhase += Math.abs(f.speedX) * (dt / 1000) * 3.2;

  // ---- stamina recovery
  if (f.regenDelay > 0) f.regenDelay = Math.max(0, f.regenDelay - dt);
  else if (f.state === "neutral" || f.state === "block") {
    let rate = 17 * f.mods.regen;
    if (f.state === "block") rate *= 0.35;
    if (f.bodyPenaltyT > 0) rate *= 0.5;
    f.stamina = Math.min(f.maxStamina, f.stamina + rate * (dt / 1000));
  }
  const ex = isExhausted(f);
  if (ex && !f.exhaustedFlag) events?.push({ type: "exhausted", who: f.side });
  f.exhaustedFlag = ex;
}

/** Reaction pose (renderer) + stun. */
export function applyHitReaction(f, def, counter, body) {
  const kind = body ? "body" : def.react;
  const dur = { light: 230, medium: 320, heavy: 430, body: 360 }[kind] + (counter ? 80 : 0);
  f.react = { kind, t: 0, dur, strength: (counter ? 1.35 : 1) * (kind === "heavy" ? 1 : kind === "medium" ? 0.75 : 0.5), side: def.hand };
}
