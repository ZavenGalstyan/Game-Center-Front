/**
 * AI fighter — a utility-based decision maker with human-like perception.
 *
 * Fairness rules:
 *  • No input reading. The AI sees the opponent's state through a perception
 *    buffer delayed by its reaction time; it can only react to a strike once
 *    that strike has visibly started, and only if it's still in its startup
 *    after the delay (fast jabs are hard to read, slow head kicks are not).
 *  • It drives the SAME semantic buttons as the player (match.setButtons);
 *    damage, health and speed are never boosted by difficulty.
 *  • Difficulty changes decision quality only: reaction time, how often it
 *    re-plans, how well it picks a defence, combo use, stamina management,
 *    mistakes, submission struggle timing and how fast it adapts.
 *
 * Adaptation: an opponent model counts the strikes / grappling the opponent
 * repeats. Patterns lower the effective reaction time against them ("reads"),
 * shift guard targeting (a high-guard turtle eats body shots and low kicks)
 * and raise sprawl readiness against a takedown-happy opponent.
 */
import { MOVES } from "./moves.js";
import { clamp, SHOOT_RANGE } from "./constants.js";
import { blankButtons } from "./match.js";
import { overallHealth, staMax, dist, cageGap } from "./fighter.js";
import { groundOptions, clinchDom } from "./grapple.js";

export const AI_LEVELS = {
  easy: { reaction: 0.46, think: 0.42, defend: 0.24, counter: 0.15, combo: 0.15, mistakes: 0.3, adapt: 0.15, staMgmt: 0.2, tapRate: 4.2, tapAcc: 0.32, aggression: 0.75 },
  normal: { reaction: 0.3, think: 0.26, defend: 0.48, counter: 0.35, combo: 0.4, mistakes: 0.15, adapt: 0.45, staMgmt: 0.55, tapRate: 5.8, tapAcc: 0.5, aggression: 0.95 },
  hard: { reaction: 0.21, think: 0.17, defend: 0.68, counter: 0.55, combo: 0.62, mistakes: 0.07, adapt: 0.7, staMgmt: 0.8, tapRate: 7.0, tapAcc: 0.66, aggression: 1.05 },
  champion: { reaction: 0.16, think: 0.11, defend: 0.84, counter: 0.72, combo: 0.8, mistakes: 0.025, adapt: 0.95, staMgmt: 0.95, tapRate: 8.0, tapAcc: 0.8, aggression: 1.12 },
};

const RANGE = { boxer: 1.0, kickboxer: 1.3, muaythai: 1.18, wrestler: 1.25, bjj: 1.2, mma: 1.15 };
const STRIKES = ["jab", "cross", "hookL", "hookR", "uppercut", "bodyJab", "bodyCross", "bodyHook", "kickLow", "kickBody", "kickHead", "kickFront"];
/** Effective reach of a move (distance between centres at which it lands), metres. */
export function moveReach(f, id) {
  const m = MOVES[id];
  return m.path[1][2] * f.reachK + 0.12;
}

export function createAI(match, side, level = "normal", opts = {}) {
  const P = { ...AI_LEVELS[level], ...(opts.tune || {}) };
  const me = () => match.f[side];
  const them = () => match.f[1 - side];
  const rng = match.rng;
  const pers = me().data.ai;
  const style = me().data.style;
  const dummy = opts.dummy || null; // training dummy behaviour
  const S = {
    hist: [], // perception buffer of opponent snapshots
    thinkT: 0,
    plan: [], // queued strikes (combos / counters)
    move: { mx: 0, mz: 0 },
    guardT: 0,
    guardLow: false,
    seen: new Set(), // opponent attack ids already reacted to
    model: { strikes: {}, total: 0, guardTime: 0, time: 0, shots: 0, dodges: 0 },
    tapT: 0,
    entry: null,
    lastOppAttackKey: null,
    wantRange: RANGE[style] || 1.15,
    circle: rng.chance(0.5) ? 1 : -1,
    circleT: 0,
  };

  function snapshot(o) {
    return { t: match.time, type: o.act.type, move: o.act.move, at: o.act.t, sf: o.act.sf || 1, guard: o.guard, key: o.act.type === "attack" ? `${o.act.move}@${Math.round((match.time - o.act.t) * 20)}` : null };
  }
  function perceived(delay) {
    const h = S.hist;
    for (let i = h.length - 1; i >= 0; i--) if (h[i].t <= match.time - delay) return h[i];
    return h[0];
  }

  /** Update the opponent model (what they keep doing). */
  function learn(o, dt) {
    const M = S.model;
    M.time += dt;
    if (o.guard === "high") M.guardTime += dt;
    if (o.act.type === "attack") {
      const k = `${o.act.move}@${Math.round((match.time - o.act.t) * 20)}`;
      if (k !== S.lastOppAttackKey) {
        S.lastOppAttackKey = k;
        M.strikes[o.act.move] = (M.strikes[o.act.move] || 0) + 1;
        M.total++;
      }
    }
    if (o.act.type === "shoot" && o.act.t < 0.02) M.shots++;
  }
  const freq = (id) => (S.model.total > 4 ? (S.model.strikes[id] || 0) / S.model.total : 0);
  const guardRatio = () => (S.model.time > 6 ? S.model.guardTime / S.model.time : 0);

  /* ------------------------------------------------------------ standing */
  function chooseDefense(m, o, seen) {
    const move = MOVES[seen.move];
    const read = clamp(P.defend + freq(seen.move) * P.adapt * 0.8, 0, 0.97);
    if (!rng.chance(read)) return null;
    const lowSta = m.sta < 10;
    if (move.zone === "legs") return rng.chance(0.6) ? { guard: true, low: true } : { dodge: "back" };
    if (move.zone === "body") return rng.chance(0.75) ? { guard: true, low: true } : { dodge: "back" };
    // head strikes
    if (move.kind === "kick") return rng.chance(0.55) ? { dodge: "back" } : rng.chance(0.6) ? { dodge: "duck" } : { guard: true };
    if (lowSta || rng.chance(0.55 - (m.A.footwork - 60) / 200)) return { guard: true };
    if (move.arc) return { dodge: rng.chance(0.7) ? "duck" : "back" };
    return { dodge: move.limb === "lh" ? (rng.chance(0.7) ? "right" : "duck") : rng.chance(0.7) ? "left" : "duck" };
  }

  function pickStrike(m, o, d) {
    const stam = m.sta / staMax(m);
    const gr = guardRatio();
    const cands = [];
    for (const id of STRIKES) {
      const mv = MOVES[id];
      const reach = moveReach(m, id);
      if (d > reach + 0.05 || d < reach - 0.55) continue;
      let w = 1;
      if (mv.kind === "kick") w *= 0.4 + pers.kicks * 1.6;
      else w *= 1.3 - pers.kicks * 0.6;
      if (mv.zone === "body") w *= 0.5 + pers.body * 1.4 + gr * P.adapt * 1.5;
      if (mv.zone === "legs") w *= 0.6 + (style === "muaythai" || style === "kickboxer" ? 0.8 : 0) + gr * P.adapt;
      if (mv.zone === "head") w *= 1 + (o.daze > 40 ? 0.8 : 0) - gr * P.adapt * 0.6 + (o.guard === "body" ? 0.8 : 0);
      if (id === "jab") w *= 1.6;
      if (id === "kickHead") w *= o.daze > 50 ? 1.6 : 0.5;
      if (id === "kickFront" && d > 1.2) w *= 1.4;
      // stamina management: big strikes only when fresh
      if (stam < 0.3) w *= mv.sta <= 4 ? 1.4 : 0.3 + (1 - P.staMgmt) * 0.7;
      if (m.sta < mv.sta) w *= 0.15;
      cands.push([id, Math.max(0.01, w)]);
    }
    if (!cands.length) return null;
    let r = rng() * cands.reduce((a, c) => a + c[1], 0);
    for (const [id, w] of cands) if ((r -= w) <= 0) return id;
    return cands[0][0];
  }

  function comboFor(m, first) {
    if (!rng.chance(P.combo) || m.sta < 25) return [];
    const sig = m.data.combos || [];
    const all = {
      "1-2": ["cross"],
      "1-1-2": ["jab2", "cross"],
      "1-2-3": ["cross", "hookL"],
      "2-lk": ["kickLow"],
      "body-head": ["kickHead"],
      "jab-body-head": ["bodyJab", "kickHead"],
      "3-2": ["cross"],
      "2-3-2": ["hookL", "cross"],
      "1-2-up": ["cross", "uppercut"],
      "2-3-lk": ["hookL", "kickLow"],
      "1-2-bk": ["cross", "kickBody"],
    };
    const starts = { "1-2": "jab", "1-1-2": "jab", "1-2-3": "jab", "2-lk": "cross", "body-head": "bodyJab", "jab-body-head": "jab", "3-2": "hookL", "2-3-2": "cross", "1-2-up": "jab", "2-3-lk": "cross", "1-2-bk": "jab" };
    const opts2 = Object.keys(all).filter((k) => starts[k] === first);
    if (!opts2.length) return [];
    const pref = opts2.filter((k) => sig.includes(k));
    const pick = pref.length && rng.chance(0.7) ? rng.pick(pref) : rng.pick(opts2);
    return [...all[pick]];
  }

  function standing(B, m, o, dt) {
    const d = dist(m, o);
    const hpK = overallHealth(m) / 100;
    const hurt = m.daze > 45 || hpK < 0.35;
    const stam = m.sta / staMax(m);
    const seenDelay = P.reaction;
    // ---- 1. react to a visible incoming strike (perceived with delay)
    const seen = perceived(seenDelay);
    if (seen && seen.type === "attack" && !S.seen.has(seen.key)) {
      const mv = MOVES[seen.move];
      const now = o.act.type === "attack" && o.act.move === seen.move ? o.act.t : 99;
      const adaptDelay = freq(seen.move) * P.adapt * 0.12; // patterns are read earlier
      const stillComing = now < mv.startup + 0.02 + adaptDelay;
      if (d < moveReach(o, seen.move) + 0.45 && (m.act.type === "idle" || m.act.type === "move" || m.act.type === "block")) {
        S.seen.add(seen.key);
        if (stillComing) {
          const def = chooseDefense(m, o, seen);
          if (def?.dodge) B.dodge = def.dodge;
          else if (def?.guard) {
            S.guardT = 0.45;
            S.guardLow = !!def.low;
          }
          if (def && rng.chance(P.counter * (0.6 + pers.patience))) S.plan = [rng.pick(["cross", "hookL", "hookR", "uppercut", "bodyHook"])];
        }
      }
    }
    // ---- 2. sprawl on a perceived shot
    const seenShot = seen && seen.type === "shoot";
    if (seenShot && o.act.type === "shoot" && d < 2.5) {
      const ready = P.defend * (0.45 + m.A.tdd / 160) + Math.min(0.25, S.model.shots * 0.05 * P.adapt);
      if (!S.seen.has("shot" + Math.round((match.time - o.act.t) * 10)) && rng.chance(ready)) {
        B.dodge = "back";
        B.action = "sprawl";
      }
      S.seen.add("shot" + Math.round((match.time - o.act.t) * 10));
    }
    // front headlock → guillotine (submission hunters)
    if (m.act.type === "sprawl" && m.act.headlock && o.act.type === "stuffed" && rng.chance(pers.subHunt * P.defend * 0.08)) B.action = "guillotine";
    // ---- 3. pounce on a downed opponent
    if ((o.act.type === "down" || o.act.type === "getup") && d < 2.2 && rng.chance(0.02 + pers.grapple * 0.05 + (style === "wrestler" ? 0.05 : 0))) B.action = "grab";
    // ---- guard hold timer
    if (S.guardT > 0) {
      S.guardT -= dt;
      B.guard = true;
      B.low = S.guardLow;
    }
    // ---- 4. think: movement + offence
    S.thinkT -= dt;
    S.circleT -= dt;
    if (S.circleT <= 0) {
      S.circle = rng.chance(0.5) ? 1 : -1;
      S.circleT = rng.range(1.2, 3);
    }
    // execute queued plan when possible (combo continuation / counters)
    if (S.plan.length && (m.act.type === "attack" || m.act.type === "idle" || m.act.type === "move" || m.act.type === "block")) {
      const nxt = S.plan[0];
      let ready = m.act.type !== "attack";
      if (!ready) {
        const cur = MOVES[m.act.move];
        ready = m.act.t >= cur.startup + cur.active + cur.recovery * cur.cancel - 0.02;
      }
      if (d > moveReach(m, nxt) + 0.35) S.plan = [];
      else if (ready) {
        B.attack = nxt;
        S.plan.shift();
      }
    }
    // stepping in to land a chosen strike
    if (S.entry) {
      S.entry.t -= dt;
      const reach = moveReach(m, S.entry.id);
      if (S.entry.t <= 0 || m.act.type === "hit" || m.act.type === "rocked") S.entry = null;
      else if (d <= reach - 0.08) {
        B.attack = S.entry.id;
        S.plan = comboFor(m, S.entry.id);
        S.entry = null;
      } else {
        B.mz = 1;
        B.mx = S.move.mx * 0.3;
        return;
      }
    }
    if (S.thinkT > 0) {
      B.mx = S.move.mx;
      B.mz = S.move.mz;
      return;
    }
    S.thinkT = P.think * rng.range(0.7, 1.3);
    if (rng.chance(P.mistakes)) {
      // a human-ish lapse: wander or throw something out of range
      S.move = { mx: rng.range(-1, 1), mz: rng.range(-0.5, 1) };
      if (rng.chance(0.4)) B.attack = rng.pick(["jab", "cross", "kickBody"]);
      B.mx = S.move.mx;
      B.mz = S.move.mz;
      return;
    }
    // distance management
    const aggr = clamp(pers.aggression * P.aggression + (match.clock < 30 && behindOnCards() ? 0.3 : 0) - (hurt ? 0.6 : 0) - (stam < 0.25 ? 0.35 * P.staMgmt : 0), 0.05, 1.2);
    let want = S.wantRange * (hurt ? 1.5 : 1) + (1 - aggr) * 0.3;
    if (dummy) want = dummy.range ?? 1.3;
    let mz = clamp((d - want) * 2.2, -1, 1);
    let mx = S.circle * (0.35 + (1 - aggr) * 0.4);
    // don't get trapped on the fence: circle out
    if (cageGap(m.pos.x, m.pos.z) < 0.9) {
      mx = S.circle;
      mz = Math.min(mz, 0.2);
    }
    if (hurt && d < 1.4) {
      mz = -1;
      if (rng.chance(0.5)) {
        S.guardT = 0.6;
        S.guardLow = false;
      }
    }
    S.move = { mx, mz };
    B.mx = mx;
    B.mz = mz;
    // keep the hands up inside the opponent's range (more often when hurt / skilled)
    if (S.guardT <= 0 && d < moveReach(o, "cross") + 0.25 && rng.chance((0.12 + P.defend * 0.3 + (hurt ? 0.25 : 0)) * (0.7 + m.A.defense / 300))) {
      S.guardT = rng.range(0.35, 0.8);
      S.guardLow = rng.chance(0.2 + guardRatio() * 0.2);
    }
    if (dummy && !dummy.attacks) return grappleOrIdle(B, m, o, d, true);
    // offence
    const canStrike = m.act.type === "idle" || m.act.type === "move" || m.act.type === "block";
    if (!canStrike || S.plan.length) return;
    const wantGrapple = grappleUtility(m, o, d);
    if (wantGrapple && !dummy?.noGrapple) {
      B.action = wantGrapple;
      return;
    }
    const pAttack = clamp(0.25 + aggr * 0.55 - (hurt ? 0.25 : 0) + (o.daze > 50 ? 0.3 : 0) - pers.patience * 0.2, 0.05, 0.92) * (dummy ? dummy.rate ?? 0.5 : 1);
    if (rng.chance(pAttack)) {
      // pick for the range we can reach with one step, then step in if needed
      const id = pickStrike(m, o, Math.max(0.7, d - 0.45 * (0.5 + aggr * 0.5)));
      if (id) {
        if (d <= moveReach(m, id) - 0.05) {
          B.attack = id;
          S.plan = comboFor(m, id);
        } else S.entry = { id, t: 0.55 };
      }
    }
  }

  function grappleOrIdle(B, m, o, d) {
    if (dummy?.grapple && rng.chance(0.08)) B.action = d < 1.05 ? "clinch" : "shoot";
  }

  function grappleUtility(m, o, d) {
    if (m.sta < 25) return null;
    const edge = (m.A.grappling - o.A.tdd) / 100;
    const appetite = pers.grapple * (0.5 + edge * 1.5 + (o.sta < staMax(o) * 0.3 ? 0.3 : 0) + (match.clock < 25 && behindOnCards() ? 0.3 : 0));
    if (d >= SHOOT_RANGE[0] + 0.1 && d <= 1.9 && rng.chance(appetite * 0.18)) return "shoot";
    if (d < 1.05 && rng.chance(pers.clinch * 0.22)) return "clinch";
    return null;
  }

  function behindOnCards() {
    const s = match.stats[match.round - 1];
    return s[side].dmg + s[side].td * 5 < s[1 - side].dmg + s[1 - side].td * 5;
  }

  /* ------------------------------------------------------------ clinch */
  function clinchMode(B, m, o, dt) {
    S.thinkT -= dt;
    if (S.thinkT > 0) return;
    S.thinkT = P.think * rng.range(0.8, 1.4);
    const dom = clinchDom(match, m);
    const r = rng();
    if (dom < -0.3 && r < 0.3 + (1 - pers.clinch) * 0.4) B.dodge = "back"; // break
    else if (r < 0.2 + pers.grapple * 0.25 && dom > -0.2 && m.sta > 20) B.btn = "grab"; // takedown
    else if (r < 0.45 && dom < 0.4) B.btn = "grapple"; // pummel
    else if (r < 0.92) B.attack = rng.pick(pers.clinch > 0.5 ? ["knee", "knee", "elbow", "shortPunch"] : ["shortPunch", "shortPunch", "knee"]);
    // defend a perceived trip
    const seen = perceived(P.reaction);
    if (seen && seen.type === "clinchTd" && rng.chance(P.defend)) B.action = "sprawl";
  }

  /* ------------------------------------------------------------ ground */
  function groundMode(B, m, o, dt) {
    const g = match.ground;
    const top = g.top === side;
    // cover up against perceived ground strikes
    const seenStrike = g.acts[1 - side]?.kind === "gstrike" && g.acts[1 - side].t > P.reaction * 0.6;
    if (!top && seenStrike && rng.chance(P.defend)) S.guardT = 0.5;
    // turtle up under heavy positions between own actions
    if (!top && S.guardT <= 0 && (g.pos === "mount" || g.pos === "side" || m.daze > 40) && rng.chance(0.04 + P.defend * 0.06)) S.guardT = 0.7;
    if (S.guardT > 0) {
      S.guardT -= dt;
      B.guard = true;
    }
    if (g.acts[side]) return;
    S.thinkT -= dt;
    if (S.thinkT > 0) return;
    S.thinkT = P.think * rng.range(1.0, 1.8);
    if (dummy && !dummy.attacks) return;
    const opts = groundOptions(match, m).map((x) => x.action);
    const w = {};
    const striker = style === "boxer" || style === "kickboxer" || style === "muaythai";
    if (top) {
      // respect a dangerous guard: get out of it (pass or stand) — skill-dependent
      const danger = g.pos === "guard" ? (o.A.subs / 100) * P.defend : 0;
      w.gstrike = 1.2 + (style === "wrestler" ? 0.8 : 0) + (o.daze > 40 ? 1.2 : 0) - danger * 0.8;
      w.advance = g.pos === "back" ? 0 : 0.6 + pers.grapple * 1.2 + pers.subHunt * 0.6 + danger * 1.2;
      w.sub = (g.pos === "back" || g.pos === "mount" ? 1 : 0) * (0.3 + pers.subHunt * 2.2);
      w.standup = (striker ? 0.35 : 0.05) + danger * (m.A.subs < o.A.subs ? 1.2 : 0.3);
    } else {
      w.gstrike = 0.4;
      w.escape = 0.9 + (g.pos === "mount" || g.pos === "back" || g.pos === "side" ? 1.2 : 0);
      w.sub = g.pos === "guard" ? pers.subHunt * 1.6 : 0;
      w.sub2 = g.pos === "guard" ? pers.subHunt * 0.9 : 0;
      w.standup = striker ? 1.1 : 0.4;
      if (m.sta < 15) w.escape *= 0.5;
    }
    let total = 0;
    for (const k of Object.keys(w)) if (!opts.includes(k)) w[k] = 0;
    for (const k of Object.keys(w)) total += w[k];
    if (total <= 0) return;
    let r = rng() * total;
    for (const [k, v] of Object.entries(w)) {
      if ((r -= v) <= 0) {
        if (k === "gstrike") B.attack = "gstrike";
        else B.action = k;
        return;
      }
    }
  }

  /* ------------------------------------------------------------ submissions */
  function subMode(B, m, dt) {
    const s = match.sub;
    S.tapT -= dt;
    if (S.tapT > 0) return;
    const z = s.zones[side];
    const inZone = Math.abs(s.marker - z.c) <= z.w / 2;
    const rate = P.tapRate * (0.75 + 0.5 * (m.sta / staMax(m)));
    // timing skill: hold fire until the marker is in the zone (sometimes)
    if (!inZone && rng.chance(P.tapAcc)) {
      S.tapT = 0.03;
      return;
    }
    B.struggle = true;
    S.tapT = 1 / rate;
  }

  return {
    level,
    P,
    /** Called once per sim step BEFORE match.step(); writes the AI's buttons. */
    update(dt) {
      const m = me();
      const o = them();
      S.hist.push(snapshot(o));
      if (S.hist.length > 90) S.hist.shift();
      learn(o, dt);
      const B = blankButtons();
      if (match.phase === "fight" && !match.transition) {
        if (match.sub) subMode(B, m, dt);
        else if (match.ground) groundMode(B, m, o, dt);
        else if (match.clinch) clinchMode(B, m, o, dt);
        else if (!(m.act.type === "down" || m.act.type === "getup" || m.act.type === "ko")) standing(B, m, o, dt);
      }
      if (dummy?.passive) {
        Object.assign(B, blankButtons());
        if (dummy.block) {
          B.guard = true;
          B.low = dummy.block === "body";
        }
      }
      match.setButtons(side, B);
      if (S.seen.size > 200) S.seen = new Set([...S.seen].slice(-50));
    },
    model: S.model,
  };
}
