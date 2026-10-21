/**
 * Stand-up combat: starting strikes, defensive actions, hit detection and
 * damage resolution.
 *
 * Hit detection is geometric. Every strike has a hit-volume path (moves.js)
 * in the attacker's local space; during the active frames the tip sweeps from
 * the path's start to its end and is tested (as a swept sphere) against the
 * defender's hurt volumes — head sphere, torso capsule and a legs capsule —
 * which themselves move with the defender's state (a slip shifts the head
 * sideways, a duck drops it, a backstep pulls it out of range). Nothing
 * connects just because a button was pressed: distance, facing, timing and
 * defence all matter.
 */
import { MOVES, COMBOS, moveDuration } from "./moves.js";
import { clamp } from "./constants.js";
import { toWorld, fatigue, spend, canAct, overallHealth } from "./fighter.js";

/** Global damage scale (tuned with tools/simTest.mjs balance runs). */
export const DMG_K = 0.66;
export const POOL_K = { head: 0.5, body: 0.5, legs: 0.9 };

/* ------------------------------------------------------------ hurt volumes */
const HEAD = { x: 0, y: 1.56, z: 0.04, r: 0.125 };
const DODGE_HEAD = {
  left: [0.28, -0.16, 0],
  right: [-0.28, -0.16, 0],
  duck: [0, -0.34, -0.02],
  back: [0, -0.02, -0.32],
};

/** World-space hurt volumes of a standing fighter right now. */
export function hurtVolumes(f) {
  const s = f.scale;
  let hx = HEAD.x;
  let hy = HEAD.y;
  let hz = HEAD.z;
  let ty = 0;
  let tz = 0;
  const a = f.act;
  if (a.type === "dodge") {
    // dodge offsets follow the clip's ease-in (full displacement after ~0.1 s)
    const k = clamp(a.t / 0.1, 0, 1) * (a.t > a.dur - 0.15 ? clamp((a.dur - a.t) / 0.15, 0, 1) : 1);
    const o = DODGE_HEAD[a.dir] || [0, 0, 0];
    hx += o[0] * k;
    hy += o[1] * k;
    hz += o[2] * k;
    if (a.dir === "duck") ty = -0.16 * k;
    if (a.dir === "back") tz = -0.28 * k;
  } else if (a.type === "hit" && a.zone === "head") {
    hz -= 0.06;
  } else if (a.type === "attack") {
    const m = MOVES[a.move];
    if (m.zone === "body" && m.kind === "punch") {
      hy -= 0.18;
      ty -= 0.1;
    }
    if (m.kind === "kick") hz -= 0.06;
  } else if (a.type === "block" && f.guard === "body") {
    hy -= 0.06;
    ty -= 0.06;
  } else if (a.type === "shoot") {
    hy -= 0.6;
    hz += 0.2;
    ty -= 0.45;
  }
  return {
    head: { ...toWorld(f, hx * s, hy * s, hz * s), r: HEAD.r * s },
    torso: { a: toWorld(f, 0, (1.0 + ty) * s, tz * s), b: toWorld(f, 0, (1.36 + ty) * s, (tz + 0.02) * s), r: 0.17 * s },
    legs: { a: toWorld(f, 0.13 * s, 0.52 * s, 0.17 * s), b: toWorld(f, -0.14 * s, 0.52 * s, -0.2 * s), r: 0.13 * s },
  };
}

function segPointDist(p, a, b) {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const abz = b.z - a.z;
  const l2 = abx * abx + aby * aby + abz * abz || 1e-9;
  const t = clamp(((p.x - a.x) * abx + (p.y - a.y) * aby + (p.z - a.z) * abz) / l2, 0, 1);
  return Math.hypot(p.x - (a.x + abx * t), p.y - (a.y + aby * t), p.z - (a.z + abz * t));
}

/** Closest distance between segments p0p1 and q0q1 (sampled — segments are short). */
function segSegDist(p0, p1, q0, q1) {
  let best = Infinity;
  for (let i = 0; i <= 6; i++) {
    const k = i / 6;
    const p = { x: p0.x + (p1.x - p0.x) * k, y: p0.y + (p1.y - p0.y) * k, z: p0.z + (p1.z - p0.z) * k };
    best = Math.min(best, segPointDist(p, q0, q1));
  }
  return best;
}

/** Strike tip in world space at path parameter k (0 = active start, 1 = end). */
export function strikeTip(f, move, k, aim = 0) {
  const [s0, s1] = move.path;
  const r = f.reachK;
  const s = f.scale;
  // hooks / kicks travel on an arc: bow the straight path outward
  const bow = move.arc ? Math.sin(k * Math.PI) * 0.12 : 0;
  const x = (s0[0] + (s1[0] - s0[0]) * k) * s + aim;
  const y = (s0[1] + (s1[1] - s0[1]) * k) * s;
  const z = (s0[2] + (s1[2] - s0[2]) * k) * r + bow;
  return toWorld(f, x, y, z);
}

/* ------------------------------------------------------------ starting actions */
export function speedFactor(f) {
  return (0.86 + 0.28 * (f.A.speed / 100)) * fatigue(f);
}

/** Try to start a strike. Returns true if started. */
export function startAttack(m, f, id) {
  const move = MOVES[id];
  if (!move) return false;
  const a = f.act;
  let comboStep = false;
  const clinchReady = move.clinch && a.type === "clinch" && !(a.cool > 0);
  // a dodge can be cancelled into a counter once the head is out of the way
  const dodgeCancel = a.type === "dodge" && !move.clinch && (a.evaded || a.t >= 0.24);
  if (!canAct(f) && !clinchReady && !dodgeCancel) {
    // cancel the recovery of a landed/thrown strike into a listed follow-up
    if (a.type === "attack" && !move.clinch) {
      const prev = MOVES[a.move];
      const recStart = prev.startup + prev.active;
      if (a.t >= recStart + prev.recovery * prev.cancel && prev.next.includes(id)) comboStep = true;
      else return false;
    } else return false;
  }
  if (move.clinch && f.act.type !== "clinch" && !(a.type === "attack" && MOVES[a.move]?.clinch)) return false;
  const counter = f.counterT > 0;
  const sf = speedFactor(f) * (counter ? 1.12 : 1);
  // aim error: well-rested, accurate fighters land flush; tired ones spray
  const err = (1 - move.acc) * 0.22 + (1 - fatigue(f)) * 0.18 + (1 - f.A.speed / 100) * 0.04;
  const chain = comboStep ? [...f.combo.chain, id] : [id];
  f.combo = { chain, t: 0 };
  f.act = { type: "attack", move: id, t: 0, sf, hit: false, counter, aim: m.rng.gauss() * err * 0.5, comboStep, prevClinch: !!move.clinch, inClinch: !!move.clinch };
  f.counterT = 0;
  spend(f, move.sta * (f.sta < 15 ? 1.2 : 1));
  m.emit({ type: "swing", side: f.side, move: id });
  if (comboStep) m.noteCombo(f);
  return true;
}

export function startDodge(m, f, dir) {
  if (!canAct(f) || f.sta < 4) return false;
  const foot = 0.85 + 0.3 * (f.A.footwork / 100);
  f.act = { type: "dodge", dir, t: 0, dur: dir === "back" ? 0.4 : 0.5, evaded: false };
  spend(f, 4);
  if (dir === "back") {
    const fw = { x: Math.sin(f.yaw), z: Math.cos(f.yaw) };
    f.vel.x -= fw.x * 2.4 * foot;
    f.vel.z -= fw.z * 2.4 * foot;
  }
  m.emit({ type: "dodge", side: f.side, dir });
  return true;
}

/* ------------------------------------------------------------ per-step update */
/** Advance a fighter's standing action. Returns nothing; may trigger hits. */
export function stepAction(m, f, opp, dt) {
  const a = f.act;
  f.combo.t += dt;
  if (f.counterT > 0) f.counterT -= dt;
  f.lastHitT += dt;
  switch (a.type) {
    case "attack": {
      const move = MOVES[a.move];
      const prevT = a.t;
      a.t += dt * a.sf;
      const s = move.startup;
      const e = s + move.active;
      if (!a.hit && a.t >= s && prevT < e + 1e-6) {
        const k0 = clamp((prevT - s) / move.active, 0, 1);
        const k1 = clamp((a.t - s) / move.active, 0, 1);
        tryHit(m, f, opp, move, k0, k1);
      }
      if (!a.hit && prevT < e && a.t >= e) {
        // whiffed: costs a little extra stamina, credits a dodging opponent
        spend(f, move.sta * 0.3);
        if (opp.act.type === "dodge" && !opp.act.evaded) {
          opp.act.evaded = true;
          opp.counterT = 0.55;
          m.emit({ type: "evade", side: opp.side, move: a.move });
        }
      }
      if (a.t >= moveDuration(move)) f.act = a.inClinch ? { type: "clinch", t: 0 } : { type: "idle", t: 0 };
      break;
    }
    case "dodge":
      a.t += dt;
      if (a.t >= a.dur) f.act = { type: "idle", t: 0 };
      break;
    case "hit":
    case "blockHit":
      a.t += dt;
      if (a.t >= a.dur) {
        f.act = { type: m.clinch ? "clinch" : a.type === "blockHit" ? "block" : f.daze > 55 ? "rocked" : "idle", t: 0, dur: 1.4 };
        if (a.type === "blockHit") f.counterT = 0.45;
      }
      break;
    case "rocked":
      a.t += dt;
      if (a.t >= a.dur || f.daze < 30) f.act = { type: m.clinch ? "clinch" : "idle", t: 0 };
      break;
    default:
      break;
  }
}

/* ------------------------------------------------------------ hit resolution */
function tryHit(m, att, def, move, k0, k1) {
  if (def.act.type === "down" || def.act.type === "ko" || def.act.type === "getup") return;
  const p0 = strikeTip(att, move, k0, att.act.aim);
  const p1 = strikeTip(att, move, k1, att.act.aim);
  const hv = hurtVolumes(def);
  const rad = move.rad;
  // test the intended zone first, then anything else the swing passes through
  const order = [move.zone, ...["head", "torso", "legs"].filter((z) => z !== move.zone && !(z === "torso" && move.zone === "body"))];
  let zoneHit = null;
  let depth = 0;
  for (const z0 of order) {
    const z = z0 === "body" ? "torso" : z0;
    const v = hv[z];
    const d = z === "head" ? segPointDist(v, p0, p1) : segSegDist(p0, p1, v.a, v.b);
    if (d < v.r + rad) {
      // a straight head punch passing over a ducking torso shouldn't count as a body shot
      if (z === "torso" && move.zone === "head" && move.kind !== "kick") continue;
      if (z === "legs" && move.zone !== "legs") continue;
      zoneHit = z === "torso" ? "body" : z;
      depth = 1 - d / (v.r + rad);
      break;
    }
  }
  if (!zoneHit) return;
  att.act.hit = true;
  resolveHit(m, att, def, move, zoneHit, depth);
}

/** Apply a landed strike (or a blocked one). Exposed for tests. */
export function resolveHit(m, att, def, move, zone, depth = 0.6) {
  const rng = m.rng;
  const A = att.A;
  const D = def.A;
  const counterHit = def.act.type === "attack" && def.act.t < MOVES[def.act.move].startup + MOVES[def.act.move].active;
  // ---- defence
  let blocked = 0;
  if (def.act.type === "block" || def.act.type === "blockHit") {
    const g = def.guard;
    if (zone === "head" && g === "high") blocked = move.kind === "kick" ? 0.62 : move.arc ? 0.72 : 0.86;
    else if (zone === "body" && g === "body") blocked = move.kind === "kick" ? 0.68 : 0.82;
    else if (zone === "legs" && g === "body") blocked = 0.55; // checked kick
    else if (zone === "body" && g === "high" && move.kind === "kick") blocked = 0.3; // arms absorb some
    if (blocked && def.sta < 12) blocked *= 0.55; // exhausted guard collapses
    blocked *= 0.85 + 0.15 * (D.defense / 100);
  }
  // ---- damage
  const power = (0.78 + 0.5 * (A.power / 100)) * (0.72 + 0.28 * fatigue(att));
  const flush = 0.72 + 0.28 * clamp(depth * 1.6, 0, 1);
  let combo = 1;
  const named = att.act.comboName ? COMBOS.find((c) => c.id === att.act.comboName) : null;
  if (named) combo += named.bonus + (att.data.combos?.includes(named.id) ? 0.1 : 0);
  const counterK = att.act.counter ? 1.3 : counterHit ? 1.25 : 1;
  const resist = zone === "head" ? 1.05 - D.defense / 1000 : 1;
  let dmg = DMG_K * move.dmg * power * flush * combo * counterK * resist * rng.range(0.92, 1.08);
  if (zone !== move.zone) dmg *= 0.75;
  const taken = dmg * (1 - blocked);
  const pool = zone === "head" ? "head" : zone === "body" ? "body" : "legs";
  // pools wear slower than the impact: KOs come from daze spikes, not chip damage
  def.hp[pool] = Math.max(0, def.hp[pool] - taken * POOL_K[pool]);
  // ---- secondary effects
  const fw = { x: Math.sin(att.yaw), z: Math.cos(att.yaw) };
  const push = move.push * (blocked ? 0.6 : 1) * (1.1 - D.power / 400);
  def.vel.x += fw.x * push;
  def.vel.z += fw.z * push;
  if (blocked) {
    spend(def, taken * 0.4 + move.sta * 0.35);
    def.act = { type: "blockHit", t: 0, dur: move.bstun, zone };
    att.hitstop = 0.04;
    m.emit({ type: "block", side: def.side, by: att.side, zone, move: move.id, dmg: taken, pos: hurtVolumes(def)[zone === "body" ? "torso" : zone] });
    m.stat(att, "thrownSig");
    return;
  }
  if (zone === "body") spend(def, taken * 1.1);
  if (zone === "legs") spend(def, taken * 0.3);
  let stun = move.stun * (counterK > 1 ? 1.2 : 1) * (0.9 + 0.2 * (A.power / 100));
  // head trauma → rocked / knockdown / knockout
  let kd = false;
  let ko = false;
  if (zone === "head") {
    const chinK = 1.5 - D.chin / 100 * 0.8;
    const lowHead = 1 + (1 - def.hp.head / 100) * 0.9;
    def.daze += taken * (0.6 + move.ko) * 1.5 * chinK * lowHead;
    if (def.hp.head <= 0) ko = true;
    else if (def.daze > 72 && move.ko > 0.2) {
      const p = clamp((def.daze - 72) / 30, 0, 1) * (0.45 + move.ko * 0.35) + (def.act.type === "rocked" ? 0.2 : 0);
      if (rng.chance(p)) {
        kd = true;
        if (def.daze > 102 || (def.hp.head < 22 && rng.chance(0.35 + move.ko * 0.2))) ko = true;
      }
    }
  } else if (zone === "body" && def.hp.body < 22 && ["kickBody", "bodyHook", "knee"].includes(move.id)) {
    if (rng.chance((22 - def.hp.body) / 45)) kd = true; // liver shot folds him
  } else if (zone === "legs" && def.hp.legs < 22 && rng.chance((22 - def.hp.legs) / 30)) {
    kd = true; // leg buckles
  }
  att.hitstop = taken > 9 ? 0.09 : 0.05;
  def.hitstop = att.hitstop;
  def.lastHitT = 0;
  m.stat(att, "landedSig", taken, zone);
  m.emit({
    type: "hit",
    side: def.side,
    by: att.side,
    zone,
    move: att.act.move,
    kind: move.kind,
    dmg: taken,
    counter: att.act.counter || counterHit,
    combo: named ? named.name : null,
    pos: hurtVolumes(def)[zone === "body" ? "torso" : zone],
    heavy: taken > 9,
  });
  if (ko) {
    m.knockout(att, def, "KO", move);
    return;
  }
  if (kd) {
    m.knockdown(att, def, move, zone);
    return;
  }
  def.act = { type: "hit", t: 0, dur: stun, zone, move: att.act.move, dir: move.limb === "lh" || move.limb === "lf" ? "fromLeft" : "fromRight", upper: move === MOVES.uppercut };
  // interrupting a strike resets the defender's combo
  def.combo.chain = [];
}

/** Low-level helper: health for HUD (0–100). */
export const healthPct = (f) => Math.round(overallHealth(f));
