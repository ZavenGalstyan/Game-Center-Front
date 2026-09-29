/**
 * Arena Gladiator — melee AI controller.
 *
 * FAIRNESS: the AI never sees the player's inputs. Everything it knows about
 * its opponent comes from perceive(fight, id, reaction) — a snapshot of what
 * was VISIBLE `reaction` seconds ago (position, stance, which phase of which
 * attack). A light attack therefore only exists for the AI once its wind-up
 * has been on screen for `reaction` seconds, and its defensive timing is an
 * estimate from that stale picture — fast profiles parry, slow ones guess.
 *
 * Output is the same intent object the keyboard produces, fed into the same
 * fighter state machine as the player.
 *
 * profile: {
 *   reaction      s      perception delay
 *   aggression    0..1   how often it commits to an attack
 *   blockRate     0..1   chance to guard a readable attack
 *   parryRate     0..1   chance to time a parry instead
 *   dodgeRate     0..1   chance to side-step / back-step instead
 *   counterRate   0..1   chance to punish an opening (whiff, stagger)
 *   kickRate      0..1   chance to kick a turtling guard
 *   distance      m      preferred circling distance
 *   strafe        0..1   lateral speed while circling
 *   turn          rad/s  how quickly it re-faces the player (flanking window)
 *   patience      s      base gap between offensives
 *   guardUp       0..1   keeps the guard up while circling (shield types)
 *   combos        [["L","L"], ["H"], ...]
 * }
 */
import { perceive, reachOf } from "./fight.js";
import { wrap, clamp } from "./math.js";

const NONE = { mx: 0, mz: 0, yaw: null, turn: 0, sprint: false, block: false, light: false, heavy: false, dodge: false, kick: false };

export function createAI(profile, rng) {
  const P = {
    reaction: 0.4, aggression: 0.5, blockRate: 0.4, parryRate: 0.05, dodgeRate: 0.1, counterRate: 0.4, kickRate: 0.1,
    distance: 2.3, strafe: 0.55, turn: 8, patience: 1.6, guardUp: 0, combos: [["L"], ["L", "L"], ["H"]], ...profile,
  };
  const S = {
    mode: "circle",
    strafeDir: rng() < 0.5 ? -1 : 1,
    strafeSwitchAt: 0,
    nextAttackAt: 1.0 + rng() * 1.2 * (1.4 - P.aggression),
    plan: null, // { moves, i }
    defSeq: 0,
    def: null, // { kind, from, until, pressAt, dir }
    punishKey: null,
    retreatUntil: 0,
    guardCircleUntil: 0,
    lastSeenBlocking: 0,
    thinkAt: 0,
  };

  function controller(fight, me) {
    const now = fight.time;
    const oid = me.id === "p" ? "o" : "p";
    const opp = perceive(fight, oid, P.reaction);
    if (!opp) return NONE;
    const out = { ...NONE };
    const dx = opp.x - me.x;
    const dz = opp.z - me.z;
    const dist = Math.hypot(dx, dz) || 1e-3;
    const ux = dx / dist;
    const uz = dz / dist;
    out.yaw = Math.atan2(dx, dz);
    out.turn = P.turn;
    S.debug = S.mode;

    const myReach = reachOf(me);
    const act = me.act;
    const busy = act && act.type !== "blockstun";

    // ------------------------------------------------------------ defence
    // react once per visible enemy attack
    if (opp.act === "attack" && opp.seq !== S.defSeq && (opp.phase === "startup" || (opp.phase === "active" && opp.at - opp.startup < 0.03))) {
      S.defSeq = opp.seq;
      const facingMe = Math.abs(wrap(Math.atan2(me.x - opp.x, me.z - opp.z) - opp.yaw)) < 1.0;
      const threat = facingMe && dist < opp.reach + 0.9;
      S.def = null;
      if (threat && !(act && act.type === "attack" && act.phase !== "startup")) {
        // time until that blade arrives, estimated from a picture `reaction` old
        const remaining = opp.startup - opp.at - P.reaction + 0.03;
        const heavy = opp.kind === "heavy";
        const kick = opp.kind === "kick";
        const lowSta = me.stamina < (heavy ? 30 : 16);
        let r = rng();
        let parry = P.parryRate * (kick ? 0 : 1);
        let dodge = P.dodgeRate * (heavy || lowSta ? 1.6 : 1) * (kick ? 2 : 1);
        let block = P.blockRate * (kick ? 0.4 : 1) * (lowSta && heavy ? 0.4 : 1);
        if (r < parry) {
          const lead = 0.03 + rng() * 0.13; // good profiles land inside the window
          S.def = { kind: "parry", pressAt: now + Math.max(0, remaining - lead), until: now + Math.max(0, remaining) + 0.3 };
        } else if ((r -= parry) < dodge) {
          const side = rng() < 0.5 ? -1 : 1;
          const back = rng() < 0.35;
          S.def = { kind: "dodge", pressAt: now + Math.max(0, remaining - 0.1 - rng() * 0.06), until: now + remaining + 0.45, back, side };
        } else if ((r -= dodge) < block) {
          S.def = { kind: "block", pressAt: now + Math.min(0.05, Math.max(0, remaining - 0.3)), until: now + Math.max(0, remaining) + opp.active + 0.3 };
        }
      }
    }
    const D = S.def;
    if (D && now > D.until) S.def = null;

    // ------------------------------------------------------------ offence bookkeeping
    if (opp.blocking) S.lastSeenBlocking = now;
    const oppOpen = (opp.act === "stagger" && opp.reason !== "clash") || (opp.act === "attack" && opp.phase === "recovery") || opp.act === "hurt";
    const lowStamina = me.stamina < 24 || me.exhausted;
    const pressure = opp.exhausted || opp.stamina < 22;

    // punish openings (rolled once per opening)
    if (!S.plan && !busy && oppOpen && dist < myReach + 0.55 && !lowStamina) {
      const key = `${opp.act}:${opp.seq}:${Math.round(opp.t * 4)}`;
      if (key !== S.punishKey) {
        S.punishKey = key;
        if (rng() < P.counterRate) {
          const big = opp.act === "stagger" && me.stamina > 40 && rng() < 0.55;
          S.plan = { moves: big ? ["H"] : rng() < 0.5 ? ["L", "L"] : ["L"], i: 0, punish: true };
          S.mode = "punish";
        }
      }
    }

    // choose an offensive
    if (!S.plan && !busy && !lowStamina && now >= S.nextAttackAt && !(D && now >= D.pressAt)) {
      const eager = P.aggression + (pressure ? 0.3 : 0) + (me.hp < me.maxHp * 0.3 ? 0.1 : 0);
      if (rng() < clamp(eager, 0.05, 0.98)) {
        let moves = P.combos[Math.floor(rng() * P.combos.length)].slice();
        // a guard that keeps turtling gets kicked or hammered
        if (now - S.lastSeenBlocking < 0.6 && rng() < P.kickRate) moves = ["K", ...(rng() < 0.6 ? ["H"] : ["L"])];
        S.plan = { moves, i: 0 };
        S.mode = "approach";
      } else {
        S.nextAttackAt = now + 0.5 + rng() * 0.8;
      }
    }

    // ------------------------------------------------------------ movement
    let mx = 0;
    let mz = 0;
    const R = fight.arena.radius;
    const rFromCenter = Math.hypot(me.x, me.z);
    const tx = -uz * S.strafeDir; // tangential (circle around the player)
    const tz = ux * S.strafeDir;

    if (S.plan) {
      const move = S.plan.moves[S.plan.i];
      const need = move === "K" ? 1.3 : move === "H" ? myReach + 0.35 : myReach + 0.2;
      if (dist > need) {
        mx = ux;
        mz = uz;
        out.sprint = dist > 5;
        if (!S.plan.punish && now - (S.plan.startedAt || now) > 3.5) S.plan = null; // gave up the chase
        S.plan && (S.plan.startedAt = S.plan.startedAt || now);
      } else {
        // in range: press when able (chained presses land in the recovery window)
        const canChain = !act || (act.type === "attack" && act.phase === "recovery" && act.t - act.startup - act.active >= (act.atk.chainAt || 0.1));
        if (canChain && !me.buffer) {
          if (act && act.type === "attack" && act.bounced && rng() < 0.6) {
            S.plan = null; // blocked — back off rather than keep hammering the shield
          } else {
            if (move === "L") out.light = true;
            else if (move === "H") out.heavy = true;
            else if (move === "K") out.kick = true;
            S.plan.i++;
            if (S.plan.i >= S.plan.moves.length) {
              S.plan = null;
              S.nextAttackAt = now + P.patience * (1.6 - P.aggression) * (0.6 + rng() * 0.8);
              if (rng() < 0.55) S.retreatUntil = now + 0.5 + rng() * 0.5;
              S.mode = "recover";
            }
          }
        }
      }
      if (act && (act.type === "hurt" || act.type === "stagger")) S.plan = null;
    } else if (lowStamina) {
      S.mode = "lowStamina";
      const want = Math.max(P.distance + 0.9, 3.2);
      const radial = clamp((dist - want) * 1.2, -1, 1);
      mx = ux * radial + tx * 0.6;
      mz = uz * radial + tz * 0.6;
    } else if (now < S.retreatUntil) {
      S.mode = "retreat";
      mx = -ux + tx * 0.4;
      mz = -uz + tz * 0.4;
    } else {
      S.mode = "circle";
      const radial = clamp((dist - P.distance) * 1.4, -1, 1);
      mx = ux * radial + tx * P.strafe;
      mz = uz * radial + tz * P.strafe;
      if (now >= S.strafeSwitchAt) {
        S.strafeDir = -S.strafeDir;
        S.strafeSwitchAt = now + 1.2 + rng() * 2.2;
        if (rng() < P.guardUp) S.guardCircleUntil = now + 1 + rng() * 2;
      }
    }
    // stay off the wall: steer inward, and flip the strafe if it's walking us into it
    if (rFromCenter > R - 1.7) {
      const inward = clamp((rFromCenter - (R - 1.7)) / 1.2, 0, 1);
      mx += (-me.x / rFromCenter) * inward * 1.2;
      mz += (-me.z / rFromCenter) * inward * 1.2;
      if (tx * me.x + tz * me.z > 0 && now >= S.strafeSwitchAt - 1) {
        S.strafeDir = -S.strafeDir;
        S.strafeSwitchAt = now + 1.5;
      }
    }
    const m = Math.hypot(mx, mz);
    if (m > 1) {
      mx /= m;
      mz /= m;
    }
    out.mx = mx;
    out.mz = mz;

    // ------------------------------------------------------------ defence output
    if (D) {
      if (D.kind === "parry" || D.kind === "block") {
        if (now >= D.pressAt) {
          out.block = true;
          out.light = out.heavy = out.kick = false;
        }
      } else if (D.kind === "dodge" && now >= D.pressAt && !D.done) {
        D.done = true;
        out.dodge = true;
        out.mx = D.back ? -ux : tx * D.side;
        out.mz = D.back ? -uz : tz * D.side;
      }
    } else if (!S.plan && now < S.guardCircleUntil && !lowStamina) {
      out.block = true; // shield types walk behind their guard
    }
    return out;
  }
  controller.state = S;
  controller.profile = P;
  return controller;
}
