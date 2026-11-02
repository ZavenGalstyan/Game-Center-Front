/**
 * Arcade opponent. Produces the SAME input frame a keyboard does
 * (`{ held, pressed }`) and feeds it to the shared fight engine — it has no
 * other way to influence the fight.
 *
 * Fairness rules:
 *  • it perceives the opponent only through a history buffer delayed by its
 *    reaction time (≥ 0.2 s): it can't react to a move before a human could;
 *  • it never reads the other side's input;
 *  • decisions are re-thought on a jittered cadence, with a mistake rate.
 * Own state (position, cooldowns, whether its last hit connected) is known
 * instantly — a human knows that too.
 */
import { moveTimes, isBlocking, specialReady } from "./fight.js";
import { ARENA_HALF } from "./constants.js";

export const AI_TIERS = {
  easy: { reaction: 0.42, block: 0.22, dodge: 0.04, combo: 0.25, aggression: 0.34, special: 0.12, jump: 0.04, punish: 0.2, think: [0.2, 0.34], mistake: 0.25 },
  medium: { reaction: 0.3, block: 0.42, dodge: 0.09, combo: 0.5, aggression: 0.5, special: 0.2, jump: 0.06, punish: 0.45, think: [0.13, 0.25], mistake: 0.12 },
  hard: { reaction: 0.22, block: 0.56, dodge: 0.15, combo: 0.74, aggression: 0.6, special: 0.28, jump: 0.07, punish: 0.68, think: [0.09, 0.17], mistake: 0.05 },
};
const MIN_REACTION = 0.2;

export function rng(seed = 1) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Blend a tier with per-battle overrides; clamps reaction to the human floor. */
export function aiParams(tier = "medium", over = {}) {
  const p = { ...(AI_TIERS[tier] || AI_TIERS.medium), ...over };
  p.reaction = Math.max(MIN_REACTION, p.reaction);
  return p;
}

function snapshot(m, side) {
  const O = m.f[1 - side];
  const me = m.f[side];
  let phase = null;
  let reach = 0;
  if (O.state === "attack" && O.move) {
    const { S, A } = moveTimes(O);
    phase = O.mt < S ? "startup" : O.mt < S + A ? "active" : "recovery";
    reach = O.move.reach || (O.move.type === "projectile" ? 6 : 0);
  }
  let proj = null;
  for (const p of m.projectiles)
    if (p.owner !== side) {
      const d = (me.x - p.x) * Math.sign(p.vx);
      if (d > -0.3 && (!proj || d < proj.d)) proj = { d, x: p.x };
    }
  const bolt = m.bolts.find((b) => b.owner !== side) || null;
  return { t: m.time, x: O.x, y: O.y, state: O.state, move: O.move?.id || null, kind: O.move?.kind || null, phase, reach, blocking: isBlocking(O, me.x), hp: O.hp / O.maxHp, proj, bolt: bolt ? { x: bolt.x } : null };
}

export function createAI(params = aiParams(), seed = 7) {
  const P = params;
  const R = rng(seed);
  const hist = [];
  let nextThink = 0;
  let hold = { left: false, right: false, up: false, down: false };
  let holdUntil = 0;
  const presses = []; // { btn, at }
  let chainedSeq = -1;
  let lastHitSeq = 0;
  const log = []; // reactive decisions { t, kind } — read by the fairness test

  const press = (btn, at) => presses.push({ btn, at });
  const setHold = (h, dur, now) => {
    hold = { left: false, right: false, up: false, down: false, ...h };
    holdUntil = now + dur;
  };

  function view(now) {
    const want = now - P.reaction;
    let v = null;
    for (let i = hist.length - 1; i >= 0; i--)
      if (hist[i].t <= want) {
        v = hist[i];
        break;
      }
    return v;
  }

  function think(m, me, now) {
    const v = view(now);
    if (!v) return;
    const toward = Math.sign(v.x - me.x) || me.facing;
    const fwd = toward > 0 ? { right: true } : { left: true };
    const back = toward > 0 ? { left: true } : { right: true };
    const dist = Math.abs(v.x - me.x);
    const sp = me.special;
    const myReach = 1.05;
    const r = R();
    const mistake = R() < P.mistake;

    if (!(me.state === "idle" || me.state === "walk" || me.state === "block")) return;

    // ---------------------------------------------------------- defence
    const threat = v.state === "attack" && (v.phase === "startup" || v.phase === "active") && dist < v.reach + 0.45;
    if (threat && !mistake) {
      if (r < P.block) {
        log.push({ t: now, kind: "guard", seen: v.t });
        return setHold({ down: true }, 0.32 + R() * 0.2, now);
      }
      if (r < P.block + P.dodge && me.cdDodge <= 0) {
        press("dodge", now);
        return setHold({}, 0.1, now);
      }
    }
    if (v.proj && v.proj.d < 3.2 && !mistake) {
      const q = R();
      if (q < P.block + 0.1) return setHold({ down: true }, 0.45, now);
      if (q < P.block + 0.1 + P.dodge + 0.1) {
        if (me.cdDodge <= 0) press("dodge", now);
        else press("jump", now);
        return setHold({}, 0.2, now);
      }
    }
    if (v.bolt && Math.abs(v.bolt.x - me.x) < 0.9 && !mistake && R() < P.block + 0.15) {
      if (me.cdDodge <= 0 && R() < 0.5) {
        press("dodge", now);
        return setHold({}, 0.15, now);
      }
      return setHold(Math.abs(me.x) > ARENA_HALF - 0.8 ? fwd : back, 0.35, now);
    }

    // ---------------------------------------------------------- punish whiffs
    if (v.state === "attack" && v.phase === "recovery" && dist < myReach + 0.1 && R() < P.punish) {
      press(R() < 0.55 ? "punch" : "kick", now);
      return setHold({}, 0.08, now);
    }
    // knocked-down / getting-up opponent: reset spacing
    if (v.state === "knockdown" || v.state === "getup") {
      if (dist < 1.1) return setHold(back, 0.2, now);
      return setHold(dist > 1.6 ? fwd : {}, 0.2, now);
    }

    // ---------------------------------------------------------- special
    if (specialReady(me) && R() < P.special) {
      const ok = sp.type === "projectile" ? dist > 1.4 : sp.type === "bolt" ? dist > 1.1 : sp.type === "slam" ? dist < 2.1 : sp.type === "rush" ? dist < 3.2 && dist > 0.8 : dist < 3.5;
      if (ok && !v.blocking) {
        press("special", now);
        return setHold({}, 0.1, now);
      }
    }

    // ---------------------------------------------------------- spacing & attacks
    const lowHp = me.hp / me.maxHp < 0.3 && v.hp > me.hp / me.maxHp + 0.2;
    if (lowHp && R() < 0.3 && dist < 1.6 && Math.abs(me.x) < ARENA_HALF - 0.7) return setHold(back, 0.3, now);
    if (dist > myReach + 0.2) {
      if (dist > 1.5 && dist < 2.5 && R() < P.jump) {
        setHold(fwd, 0.25, now);
        press("jump", now);
        press(R() < 0.5 ? "kick" : "punch", now + 0.22);
        return;
      }
      return setHold(fwd, 0.12 + R() * 0.12, now);
    }
    if (R() < P.aggression || mistake) {
      if (v.blocking && R() < 0.35) {
        // a blocker gets walked back from rather than hammered
        return setHold(back, 0.18, now);
      }
      press(dist < 0.95 && R() < 0.6 ? "punch" : "kick", now);
      return setHold({}, 0.06, now);
    }
    if (R() < 0.35) return setHold({ down: true }, 0.25, now);
    return setHold(R() < 0.5 ? back : {}, 0.12 + R() * 0.1, now);
  }

  return {
    params: P,
    log,
    /** Called once per sim step for `side`; returns that side's input frame. */
    update(m, side, dt) {
      const me = m.f[side];
      const now = m.time;
      hist.push(snapshot(m, side));
      while (hist.length && hist[0].t < now - P.reaction - 0.5) hist.shift();
      if (m.phase !== "fight") {
        presses.length = 0;
        return { held: { left: false, right: false, up: false, down: false }, pressed: { punch: false, kick: false, special: false, dodge: false, jump: false } };
      }
      // continue a combo after contact (only once per move)
      if (me.state === "attack" && me.connected && me.chain >= 0 && me.chain < 2 && chainedSeq !== me.moveSeq) {
        chainedSeq = me.moveSeq;
        if (R() < P.combo) {
          const { S, A } = moveTimes(me);
          const btn = R() < 0.5 ? "punch" : "kick";
          press(btn, now + Math.max(0, S + A - me.mt) * 0.5);
        }
      }
      // being hit interrupts any plan
      if (me.hitSeq !== lastHitSeq) {
        lastHitSeq = me.hitSeq;
        holdUntil = 0;
        presses.length = 0;
      }
      if (now >= nextThink) {
        nextThink = now + P.think[0] + R() * (P.think[1] - P.think[0]);
        if (now >= holdUntil) think(m, me, now);
      }
      if (now >= holdUntil) hold = { left: false, right: false, up: false, down: false };
      const pressed = { punch: false, kick: false, special: false, dodge: false, jump: false };
      for (let i = presses.length - 1; i >= 0; i--)
        if (presses[i].at <= now + dt * 0.5) {
          pressed[presses[i].btn] = true;
          presses.splice(i, 1);
        }
      void dt;
      return { held: { ...hold }, pressed };
    },
  };
}

