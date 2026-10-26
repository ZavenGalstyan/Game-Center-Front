/**
 * Shadow Warriors — one fighter: state machine, movement, stamina and pose.
 *
 * The player and every AI drive a fighter through the same input object
 * ({l, r, u, d, p, k, w, b, s} booleans), so the AI obeys exactly the same
 * rules. Hit resolution between fighters lives in fight.js.
 *
 * Exploit guards:
 *  - attacks can only chain into the move's own `next` entry, and only after
 *    its active frames end (no cancelling into block, jump or dash);
 *  - each attack instance has an id and can hit a target once (or `multi`
 *    times with a gap);
 *  - knockdown → lying → get-up is fully invulnerable, so there is no
 *    juggle or wake-up loop; air hits always knock down.
 */
import {
  DT, GRAVITY, JUMP_VY, JUMP_VX, WALK, WALK_BACK, DASH_V, DASH_F, BACKDASH_V, BACKDASH_F,
  DOUBLE_TAP_F, BUFFER_F, STAMINA_REGEN, STAMINA_DELAY, WALL, clamp,
} from "./constants.js";
import { buildMoveset, pickMove, crouchFor, airFor, guardFor } from "./moves.js";
import { pose, blendPose, samplePose, solve, makeJoints, hurtCapsules, HIP_H } from "./skeleton.js";
import { armorStats, weaponPower, abilityById, abilityPower } from "../data/gear.js";

export const BLANK = { l: false, r: false, u: false, d: false, p: false, k: false, w: false, b: false, s: false };
const NEUTRAL = new Set(["idle", "walk", "crouch", "block", "cblock"]);

export function createFighter(cfg, x, facing) {
  const w = cfg.weapon;
  const ar = armorStats(cfg.armor, cfg.armorLvl || 0);
  const maxHp = Math.round((100 + ar.hp) * (cfg.hpMul || 1));
  const maxSt = 100 + ar.stam;
  const ab = cfg.ability ? abilityById(cfg.ability) : null;
  const f = {
    cfg,
    w,
    wdim: { len: w.len, back: w.back, dual: !!w.dual },
    set: buildMoveset(w),
    x,
    y: 0,
    vx: 0,
    vy: 0,
    f: facing,
    state: "intro",
    t: 0,
    move: null,
    mf: 0,
    atkId: 0,
    multiLeft: 0,
    multiGap: 0,
    hp: maxHp,
    maxHp,
    st: maxSt,
    maxSt,
    stDelay: 0,
    meter: 0,
    ability: ab,
    abilityPow: abilityPower(cfg.abilityLvl || 0),
    combo: 0,
    stun: 0,
    landLock: 0,
    invuln: 0,
    hitstop: 0,
    inp: { ...BLANK },
    prev: { ...BLANK },
    buf: null,
    tap: { dir: 0, t: -99 },
    clock: 0,
    airUsed: false,
    def: ar.def,
    regen: ar.regen * (cfg.regenMul || 1),
    speed: ar.speed * (cfg.speedMul || 1),
    power: weaponPower(cfg.weaponLvl || 0) * (cfg.dmgMul || 1),
    bodyPower: (1 + 0.04 * (cfg.weaponLvl || 0)) * (cfg.dmgMul || 1),
    buffs: { iron: 0, vamp: 0, armor: 0, frost: 0 },
    blockAge: 99,
    walkPhase: 0,
    wind: 0,
    alpha: 1,
    tired: 0,
    poseKey: "",
    pose: pose({}),
    poseFrom: pose({}),
    blendT: 1,
    blendN: 1,
    J: makeJoints(),
    hurt: [],
    stats: { hits: 0, landed: 0, blocked: 0, parries: 0, dmg: 0, taken: 0, maxCombo: 0 },
  };
  computePose(f);
  return f;
}

export const isGrounded = (f) => f.y <= 0 && f.state !== "air" && f.state !== "fall" && !(f.state === "attack" && f.move?.air);
export const isNeutral = (f) => NEUTRAL.has(f.state);
export const isInvuln = (f) => f.invuln > 0 || f.state === "fall" || f.state === "down" || f.state === "getup" || f.state === "ko" || f.state === "vanish" || f.state === "intro";
export const isBlocking = (f) => f.state === "block" || f.state === "cblock" || (f.state === "blockstun" && f.inp.b);
export const isCrouching = (f) => f.state === "crouch" || f.state === "cblock" || (f.state === "blockstun" && f.inp.d) || (f.state === "attack" && f.move?.crouch);
export const isAirborne = (f) => f.y > 0.5 || f.state === "air" || f.state === "prejump";

/** Phase of the current attack: 'startup' | 'active' | 'recovery' | null */
export function movePhase(f) {
  if (f.state !== "attack" || !f.move) return null;
  const m = f.move;
  if (f.mf < m.s) return "startup";
  if (f.mf < m.s + m.a) return "active";
  return "recovery";
}

function setState(f, s) {
  if (f.state !== s) {
    f.state = s;
    f.t = 0;
  }
}

function spend(f, n) {
  f.st -= n;
  f.stDelay = STAMINA_DELAY;
}

export function startMove(F, f, m) {
  f.state = "attack";
  f.t = 0;
  f.move = m;
  f.mf = 0;
  f.atkId = ++F.seq;
  f.multiLeft = m.multi || 1;
  f.multiGap = 0;
  f.landed = false;
  if (m.stam) spend(f, m.stam);
  if (m.air) f.airUsed = true;
  if (!m.air && !m.lunge) f.vx *= 0.3;
  F.events.push({ type: "swing", who: f, move: m.id, sfx: m.sfx });
}

/** Try to start an attack from a buffered press. Returns true if started. */
function tryAttack(F, f, b) {
  let m;
  if (b.btn === "s") {
    const ab = f.ability;
    if (!ab || f.meter < ab.cost) {
      F.events.push({ type: "nometer", who: f });
      return false;
    }
    m = f.set[ab.id];
    if (!m) return false;
    f.meter -= ab.cost;
    F.events.push({ type: "special", who: f, name: ab.name });
  } else {
    const air = f.state === "air";
    m = pickMove(f.set, b.btn, { air, down: b.down && !air, fwd: b.fwd && !air });
    if (!m) return false;
    if (f.st < m.stam) {
      if (f.tired <= 0) F.events.push({ type: "tired", who: f });
      f.tired = 30;
      return false;
    }
  }
  startMove(F, f, m);
  return true;
}

/** Bosses start their special moves through here (same state rules). */
export function tryBossMove(F, f, id) {
  const m = f.set[id];
  if (!m || !(isNeutral(f) || (f.state === "land" && f.t >= f.landLock))) return false;
  startMove(F, f, m);
  return true;
}

// ------------------------------------------------------------------ per-frame step
export function stepFighter(F, f, opp) {
  const inp = f.inp;
  const prev = f.prev;
  f.clock++;
  const press = (k) => inp[k] && !prev[k];
  const fwdKey = f.f > 0 ? "r" : "l";
  const backKey = f.f > 0 ? "l" : "r";
  if (f.tired > 0) f.tired--;
  f.blockAge = press("b") ? 0 : f.blockAge + 1;

  // input buffer (attacks + special)
  for (const btn of ["p", "k", "w", "s"]) {
    if (press(btn)) f.buf = { btn, age: 0, down: inp.d, fwd: inp[fwdKey] };
  }
  if (f.buf) {
    f.buf.age++;
    const keep = f.state === "attack" ? 22 : BUFFER_F;
    if (f.buf.age > keep) f.buf = null;
  }

  // dash detection (double tap)
  let dash = 0;
  for (const [key, dir] of [["l", -1], ["r", 1]]) {
    if (press(key)) {
      if (f.tap.dir === dir && f.clock - f.tap.t <= DOUBLE_TAP_F) {
        dash = dir;
        f.tap.dir = 0;
      } else {
        f.tap.dir = dir;
        f.tap.t = f.clock;
      }
    }
  }

  if (f.invuln > 0) f.invuln--;
  for (const k in f.buffs) if (f.buffs[k] > 0) f.buffs[k]--;

  const neutralGround = () => {
    if (f.buf) {
      const ok = tryAttack(F, f, f.buf);
      f.buf = null; // a refused press (no stamina / meter) is dropped, not retried
      if (ok) return;
    }
    if (dash && f.st >= 8) {
      spend(f, 8);
      const fwd = dash === f.f;
      setState(f, fwd ? "dash" : "backdash");
      f.vx = dash * (fwd ? DASH_V : BACKDASH_V) * f.speed;
      F.events.push({ type: "dash", who: f });
      return;
    }
    if (press("u") && f.st >= 4) {
      spend(f, 4);
      setState(f, "prejump");
      return;
    }
    if (inp.b) {
      setState(f, inp.d ? "cblock" : "block");
      f.vx = 0;
      return;
    }
    if (inp.d) {
      setState(f, "crouch");
      f.vx = 0;
      return;
    }
    const dir = (inp.r ? 1 : 0) - (inp.l ? 1 : 0);
    if (dir) {
      setState(f, "walk");
      const fwd = dir === f.f;
      f.vx = dir * (fwd ? WALK : WALK_BACK) * f.speed;
      return;
    }
    setState(f, "idle");
    f.vx = 0;
  };

  f.t++;
  switch (f.state) {
    case "intro":
    case "win":
      f.vx = 0;
      break;
    case "idle":
    case "walk":
    case "crouch":
    case "block":
    case "cblock":
      f.combo = 0;
      neutralGround();
      break;
    case "prejump":
      f.vx *= 0.5;
      if (f.t >= 3) {
        const dir = (inp.r ? 1 : 0) - (inp.l ? 1 : 0);
        setState(f, "air");
        f.vy = JUMP_VY;
        f.vx = dir * JUMP_VX * f.speed;
        f.airUsed = false;
        F.events.push({ type: "jump", who: f });
      }
      break;
    case "air":
      if (f.buf && !f.airUsed && f.buf.btn !== "s") {
        tryAttack(F, f, f.buf);
        f.buf = null;
      }
      break;
    case "land":
      f.vx *= 0.7;
      if (f.t >= f.landLock) neutralGround();
      break;
    case "dash":
    case "backdash": {
      const n = f.state === "dash" ? DASH_F : BACKDASH_F;
      if (f.state === "dash" && f.t >= 6 && f.buf && f.buf.btn !== "s") {
        const v = f.vx;
        if (tryAttack(F, f, f.buf)) {
          f.buf = null;
          f.vx = v * 0.45;
          break;
        }
      }
      if (f.t >= n) {
        f.vx *= 0.3;
        setState(f, "idle");
        neutralGround();
      }
      break;
    }
    case "attack": {
      const m = f.move;
      f.mf++;
      if (m.lunge && f.mf >= m.lunge.from && f.mf < m.lunge.to) f.vx = f.f * m.lunge.v * (m.effect === "rush" ? 1 : f.speed);
      else if (!m.air) f.vx *= 0.8;
      if (m.effect && f.mf === m.s) F.effect(f, opp, m);
      // multi-hit moves re-arm after a short gap
      if (m.multi && f.multiGap > 0 && --f.multiGap === 0) f.atkId = ++F.seq;
      // chain into the move's follow-up only after the active frames
      const end = m.s + m.a;
      if (f.buf && m.next && m.next[f.buf.btn] && f.mf >= end && f.mf <= end + Math.floor(m.r * 0.75)) {
        const nx = f.set[m.next[f.buf.btn]];
        if (nx && f.st >= nx.stam) {
          f.buf = null;
          startMove(F, f, nx);
          F.events.push({ type: "chain", who: f });
          break;
        }
      }
      if (f.mf >= m.total) {
        f.move = null;
        if (m.air && f.y > 0) setState(f, "air");
        else {
          setState(f, inp.d && m.crouch ? "crouch" : "idle");
          neutralGround();
        }
      }
      break;
    }
    case "hit":
    case "blockstun":
      f.vx *= 0.86;
      if (f.t >= f.stun) {
        if (f.state === "blockstun" && inp.b) setState(f, inp.d ? "cblock" : "block");
        else setState(f, "idle");
        neutralGround();
      }
      break;
    case "parried":
    case "guardbreak":
      f.vx *= 0.85;
      if (f.t >= f.stun) {
        setState(f, "idle");
        neutralGround();
      }
      break;
    case "fall":
      break;
    case "down":
      f.vx *= 0.8;
      if (f.t >= 30 && f.hp > 0) setState(f, "getup");
      if (f.hp <= 0) setState(f, "ko");
      break;
    case "getup":
      f.vx = 0;
      if (f.t >= 22) {
        setState(f, "idle");
        f.invuln = 4;
        f.combo = 0;
      }
      break;
    case "ko":
      f.vx *= 0.85;
      break;
    case "vanish":
      f.vx = 0;
      f.alpha = Math.max(0, 1 - f.t / 10);
      break;
    case "appear":
      f.alpha = Math.min(1, f.t / 8);
      if (f.t >= 12) {
        f.alpha = 1;
        setState(f, "idle");
      }
      break;
  }

  // stamina
  if (f.stDelay > 0) f.stDelay--;
  else if (f.st < f.maxSt) {
    const frost = f.buffs.frost > 0 ? 0.8 : 1;
    f.st = Math.min(f.maxSt, f.st + STAMINA_REGEN * f.regen * DT * (isBlocking(f) ? 0.55 : 1) * frost);
  }

  // physics
  const airborne = f.state === "air" || f.state === "fall" || (f.state === "attack" && f.move?.air) || f.y > 0;
  if (airborne) {
    f.vy -= GRAVITY * DT;
    f.y += f.vy * DT;
    if (f.y <= 0) {
      f.y = 0;
      f.vy = 0;
      if (f.state === "fall") {
        setState(f, "down");
        F.events.push({ type: "thud", who: f });
      } else if (f.state === "attack" || f.state === "air") {
        const wasAttack = f.state === "attack";
        f.move = null;
        setState(f, "land");
        f.landLock = wasAttack ? 8 : 4;
        F.events.push({ type: "land", who: f });
      }
    }
  }
  if (f.state !== "vanish") {
    f.x += (f.vx + f.wind) * DT;
    if (f.x < -WALL) f.x = -WALL;
    if (f.x > WALL) f.x = WALL;
  }

  // walk cycle
  if (f.state === "walk") f.walkPhase += (f.vx * f.f * DT) / 34;
}

// ------------------------------------------------------------------ hit reactions (called by fight.js)
export function applyHitReaction(F, f, att, m, { stun, knockdown, kbx, kby, pushV }) {
  f.move = null;
  f.buf = null;
  if (knockdown || f.y > 0.5) {
    f.state = "fall";
    f.t = 0;
    f.vx = kbx;
    f.vy = Math.max(kby, f.y > 0.5 ? 260 : 300);
    f.y = Math.max(f.y, 1);
    return;
  }
  f.state = "hit";
  f.t = 0;
  f.stun = stun;
  f.vx = pushV;
  f.hitLow = m.height === "low";
}

// ------------------------------------------------------------------ poses
const BLOCK_ARMS = {
  fists: { aF: 74, eF: 112, aB: 62, eB: 124, t: 2, h: 8 },
  blade: { aF: 62, eF: 56, wF: 54, aB: 54, eB: 100, t: 2, h: 6 },
  dual: { aF: 70, eF: 88, wF: 6, aB: 66, eB: 100, wB: 20, t: 2, h: 6 },
  pole: { aF: 66, eF: 64, wF: 36, aB: 42, eB: 90, t: 0, h: 6 },
  heavy: { aF: 64, eF: 70, wF: 38, aB: 50, eB: 100, t: 0, h: 6 },
  chain: { aF: 72, eF: 104, wF: 10, wl: 0.16, aB: 62, eB: 120, t: 2, h: 8 },
};
const LYING = pose({ rot: -88, hx: -10, hy: -HIP_H + 12, t: 0, h: 6, aF: 150, eF: 20, aB: 120, eB: 30, lF: 14, kF: 10, lB: 4, kB: 26 });
const KNEEL = pose({ hy: -30, t: 30, h: -6, lF: 70, kF: 100, lB: 0, kB: 110, aF: 30, eF: 50, aB: 10, eB: 40 });

const tmpA = {};
const tmpB = {};

function targetPose(f, out) {
  const fam = f.w.family;
  const G = guardFor(fam);
  const s = f.state;
  const breathe = Math.sin(f.clock * 0.07);
  switch (s) {
    case "idle":
    case "intro":
      return Object.assign(out, G, { hy: G.hy + breathe * 1.6, t: G.t + breathe * 1.2, aF: G.aF + breathe * 2 });
    case "walk": {
      const ph = f.walkPhase;
      const sw = Math.sin(ph) * 20;
      return Object.assign(out, G, { lF: G.lF + sw, kF: G.kF + Math.max(0, Math.cos(ph)) * 24, lB: G.lB - sw, kB: G.kB + Math.max(0, -Math.cos(ph)) * 24, hy: G.hy + Math.abs(Math.cos(ph)) * 2 });
    }
    case "crouch":
      return Object.assign(out, crouchFor(fam));
    case "block":
    case "blockstun": {
      Object.assign(out, G, BLOCK_ARMS[fam]);
      if (s === "blockstun" && f.inp.d) Object.assign(out, crouchFor(fam), BLOCK_ARMS[fam], { t: 18 });
      if (s === "blockstun") out.hx = -4;
      return out;
    }
    case "cblock":
      return Object.assign(out, crouchFor(fam), BLOCK_ARMS[fam], { t: 18 });
    case "prejump":
      return Object.assign(out, G, { hy: -14, t: 18, lF: 50, kF: 70, lB: 10, kB: 60 });
    case "land":
      return Object.assign(out, G, { hy: -18, t: 20, lF: 50, kF: 80, lB: 6, kB: 70 });
    case "air": {
      const A = airFor(fam);
      Object.assign(out, A);
      if (f.vy > 300) Object.assign(out, { lF: 40, kF: 60, lB: -10, kB: 50 });
      return out;
    }
    case "dash":
      return Object.assign(out, G, { t: 26, lF: 60, kF: 40, lB: -40, kB: 30, hy: -8 });
    case "backdash":
      return Object.assign(out, G, { t: -14, lF: 40, kF: 20, lB: -20, kB: 40, hy: -6 });
    case "attack":
      return samplePose(f.move.keys, f.mf, out);
    case "hit": {
      const k = 1 - Math.min(1, f.t / Math.max(1, f.stun));
      const p = f.hitLow
        ? { t: 34, h: 10, aF: 20, eF: 50, aB: 10, eB: 50, hx: -4, lF: 30, lB: -10, kB: 30 }
        : { t: -20, h: -16, aF: 26, eF: 60, aB: 4, eB: 64, hx: -8, lF: 30, lB: -26 };
      return blendPose(G, { ...G, ...p }, 0.35 + 0.65 * k, out);
    }
    case "parried":
    case "guardbreak":
      return Object.assign(out, G, { t: -26, h: -18, aF: 150, eF: 20, aB: 130, eB: 30, hx: -6, lF: 30, lB: -30, wF: 20 });
    case "fall": {
      const k = Math.min(1, f.t / 22);
      return blendPose(pose({ t: -30, h: -20, aF: 150, eF: 20, aB: 120, eB: 30, lF: 40, kF: 40, lB: 10, kB: 50 }), LYING, k * 0.8, out);
    }
    case "down":
    case "ko":
      return Object.assign(out, LYING);
    case "getup":
      return samplePose(GETUP_KEYS, f.t, out);
    case "win":
      return Object.assign(out, G, { aF: 168, eF: 10, wF: 0, t: -4, h: -10, aB: 20, eB: 60 });
    case "vanish":
    case "appear":
      return Object.assign(out, crouchFor(fam));
    default:
      return Object.assign(out, G);
  }
}
const GETUP_KEYS = [
  [0, LYING],
  [12, KNEEL],
  [22, pose({})],
];

const NO_SNAP = new Set(["fall", "down", "ko", "air"]);

export function computePose(f) {
  const key = f.state === "attack" ? `a:${f.atkId}` : f.state;
  if (key !== f.poseKey) {
    // blend out of whatever we were showing
    Object.assign(f.poseFrom, f.pose);
    f.blendT = 0;
    f.blendN = f.state === "attack" ? 2 : f.state === "hit" || f.state === "blockstun" ? 1 : f.state === "walk" || f.state === "idle" ? 6 : 4;
    f.poseKey = key;
  }
  targetPose(f, tmpA);
  if (f.blendT < f.blendN) {
    f.blendT++;
    blendPose(f.poseFrom, tmpA, f.blendT / f.blendN, tmpB);
    Object.assign(f.pose, tmpB);
  } else Object.assign(f.pose, tmpA);
  const airborne = f.y > 0.5 || NO_SNAP.has(f.state) || (f.state === "attack" && f.move?.air);
  solve(f.pose, f.x, f.y, f.f, f.wdim, !airborne, f.J);
  if (f.state === "down" || f.state === "ko") {
    // lying: keep the body on the floor
    let low = Infinity;
    for (const k of ["hip", "neck", "head", "knF", "knB", "ftF", "ftB"]) low = Math.min(low, f.J[k].y - (k === "head" ? 13 : k === "hip" || k === "neck" ? 12 : 6));
    if (low !== 0) for (const k in f.J) if (f.J[k] && typeof f.J[k] === "object") f.J[k].y -= low;
  }
  hurtCapsules(f.J, f.hurt);
  return f.J;
}

export const clampMeter = (f) => (f.meter = clamp(f.meter, 0, 100));
