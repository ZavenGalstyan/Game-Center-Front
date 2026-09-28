/**
 * Boxing Club — training drills. Pure simulations (Node-testable) built on
 * the same fighter rules as a real fight, so what you practise is exactly
 * what you'll use: same punch timings, reach, stamina and dodge windows.
 *
 *   heavy  — heavy bag: a damped pendulum; power, combos, accuracy, stamina
 *   speed  — speed bag: punch on the beat as the tempo rises
 *   dodge  — coach signals, then really throws: slip, duck or block
 *   combo  — land the prompted combination, in order, on the pads
 */
import { ATTACKS } from "./attacks.js";
import { createFighter, updateFighter, RING_HALF, ROPE_MARGIN, clamp } from "./fighter.js";
import { createFight, stepFight, STEP } from "./fight.js";
import { rng } from "./rng.js";

export const DRILLS = {
  heavy: { id: "heavy", name: "Heavy Bag", blurb: "Power, combinations and stamina control.", duration: 40000, medals: [600, 1100, 1550] },
  speed: { id: "speed", name: "Speed Bag", blurb: "Hit on the beat as the rhythm speeds up.", duration: 40000, medals: [45, 75, 100] },
  dodge: { id: "dodge", name: "Dodge Trainer", blurb: "Read the coach's signal, then slip, duck or block.", count: 16, medals: [900, 1300, 1700] },
  combo: { id: "combo", name: "Combo Trainer", blurb: "Land each combination in order on the pads.", count: 8, duration: 60000, medals: [700, 1150, 1550] },
};

export function medalFor(drill, score) {
  const m = DRILLS[drill].medals;
  return score >= m[2] ? 3 : score >= m[1] ? 2 : score >= m[0] ? 1 : 0;
}

const IDLE = { move: 0, block: false, attack: null, body: false, dodge: null };

/* ============================================================ bag drills */

export function createBagDrill(kind, stats) {
  const fighter = createFighter({ id: "p", side: "player", name: "You", x: -0.35, facing: 1, stats });
  const d = {
    kind,
    t: 0,
    acc: 0,
    over: false,
    duration: DRILLS[kind].duration,
    fighter,
    pending: { attack: null, dodge: null },
    bag: { pivotX: 0.68, pivotY: 2.55, L: 1.3, theta: 0, omega: 0, r: 0.21, flash: 0 },
    speedBag: { x: 0.52, y: 1.66, spin: 0, lastHit: -1 },
    stats: { thrown: 0, hits: 0, power: 0, lastPower: 0, combo: 0, bestCombo: 0, comboT: 0, fresh: 0, samples: 0, onBeat: 0, perfect: 0, misses: 0, streak: 0, bestStreak: 0 },
    beat: { bpm: 96, next: 1200, index: 0, used: new Set(), times: [] },
    score: 0,
  };
  return d;
}

export function bagCenterX(d) {
  return d.bag.pivotX + Math.sin(d.bag.theta) * d.bag.L;
}

function heavyStep(d, dt, input, events) {
  const f = d.fighter;
  updateFighter(f, dt, input, events);
  const b = d.bag;
  // pendulum
  const alpha = -(9.8 / b.L) * Math.sin(b.theta) - 1.1 * b.omega;
  b.omega += alpha * (dt / 1000);
  b.theta += b.omega * (dt / 1000);
  b.flash = Math.max(0, b.flash - dt);
  const cx = bagCenterX(d);
  // the bag swings back into you: gentle push
  if (cx - f.x < 0.6) {
    f.x = cx - 0.6;
    if (b.omega < 0) b.omega *= -0.3;
  }
  f.x = clamp(f.x, -RING_HALF + ROPE_MARGIN, RING_HALF - ROPE_MARGIN);
  const a = f.attack;
  const s = d.stats;
  if (f.state === "attack" && a && !a.resolved) {
    if (a.t >= a.su && a.t < a.su + a.ac && cx - f.x <= a.def.reach + 0.04) {
      a.resolved = true;
      a.hit = true;
      const power = a.def.damage * a.dmgMul;
      b.omega += power * 0.075 * (a.def.target === "body" ? 0.8 : 1);
      b.flash = 160;
      s.hits++;
      s.comboT = 900;
      s.combo++;
      s.bestCombo = Math.max(s.bestCombo, s.combo);
      const comboBonus = 1 + Math.min(4, s.combo - 1) * 0.12;
      const pts = power * 10 * comboBonus;
      s.power += pts;
      s.lastPower = Math.round(Math.min(100, power * 14 * (a.def.kind === "hook" ? 1 : 1.15)));
      events.push({ type: "bag", attack: a.id, power: s.lastPower, combo: s.combo });
    } else if (a.t >= a.su + a.ac) {
      a.resolved = true;
      a.whiff = true;
      a.extra += a.def.whiffRecovery;
      s.combo = 0;
      events.push({ type: "whiff", who: "player", attack: a.id });
    }
  }
  if (s.comboT > 0) {
    s.comboT -= dt;
    if (s.comboT <= 0) s.combo = 0;
  }
  s.samples++;
  if (f.stamina > f.maxStamina * 0.25) s.fresh++;
}

function speedStep(d, dt, input, events) {
  const f = d.fighter;
  f.x = -0.35;
  updateFighter(f, dt, input, events);
  f.x = -0.35;
  const bt = d.beat;
  const s = d.stats;
  // tempo rises from 96 to 156 bpm over the drill
  bt.bpm = 96 + 60 * Math.min(1, d.t / d.duration);
  if (d.t >= bt.next) {
    bt.times.push({ t: bt.next, i: bt.index });
    events.push({ type: "beat", i: bt.index });
    bt.index++;
    bt.next += 60000 / bt.bpm;
    if (bt.times.length > 6) bt.times.shift();
  }
  // a punch that just started counts at the moment it was thrown
  for (const e of events) {
    if (e.type !== "throw" || e._sb) continue;
    e._sb = true;
    const now = d.t;
    let best = null;
    for (const b of [...bt.times, { t: bt.next, i: bt.index }]) {
      const dd = Math.abs(now - b.t);
      if (!best || dd < best.dd) best = { dd, i: b.i };
    }
    if (best && best.dd <= 120 && !bt.used.has(best.i)) {
      bt.used.add(best.i);
      const perfect = best.dd <= 50;
      s.onBeat++;
      if (perfect) s.perfect++;
      s.streak++;
      s.bestStreak = Math.max(s.bestStreak, s.streak);
      d.speedBag.spin = 1;
      d.speedBag.lastHit = now;
      events.push({ type: "sbHit", perfect, streak: s.streak });
    } else {
      s.misses++;
      s.streak = 0;
      events.push({ type: "sbMiss" });
    }
  }
  d.speedBag.spin = Math.max(0, d.speedBag.spin - dt / 260);
  // punches never "whiff" into recovery on the speed bag — it's rhythm, not reach
  const a = f.attack;
  if (a && !a.resolved && a.t >= a.su) {
    a.resolved = true;
    a.hit = true;
  }
}

export function stepBagDrill(d, realDt, input = IDLE) {
  const events = [];
  if (d.over) return events;
  if (input.attack) d.pending.attack = input.attack;
  let dt = Math.min(100, Math.max(0, realDt));
  d.acc += dt;
  while (d.acc >= STEP) {
    d.acc -= STEP;
    d.t += STEP;
    const inp = { ...IDLE, move: input.move || 0, block: Boolean(input.block), body: Boolean(input.body), attack: d.pending.attack };
    d.pending.attack = null;
    if (d.kind === "heavy") heavyStep(d, STEP, inp, events);
    else speedStep(d, STEP, inp, events);
    for (const e of events) if (e.type === "throw" && !e._c) {
      e._c = true;
      d.stats.thrown++;
    }
    if (d.t >= d.duration) {
      d.over = true;
      d.score = scoreBag(d);
      events.push({ type: "drillOver", score: d.score });
      break;
    }
  }
  return events;
}

export function scoreBag(d) {
  const s = d.stats;
  if (d.kind === "heavy") {
    const acc = s.thrown ? s.hits / s.thrown : 0;
    const stam = s.samples ? s.fresh / s.samples : 0;
    return Math.round(s.power * (0.6 + 0.4 * acc) * (0.7 + 0.3 * stam));
  }
  return s.onBeat + s.perfect + Math.floor(s.bestStreak / 4) - Math.floor(s.misses / 2);
}

/* ============================================================ pad drills */

const COMBOS = [
  ["jab", "cross"],
  ["jab", "jab", "cross"],
  ["jab", "cross", "hookL"],
  ["jab", "bodyCross"],
  ["cross", "hookL", "cross"],
  ["jab", "bodyJab", "hookL"],
  ["jab", "cross", "hookL", "cross"],
  ["bodyJab", "bodyCross", "hookL"],
];

const DODGE_SEQ = [
  { attack: "jab", want: "block" },
  { attack: "cross", want: "slip" },
  { attack: "hookL", want: "duck" },
  { attack: "cross", want: "slip" },
  { attack: "bodyCross", want: "block" },
  { attack: "hookR", want: "duck" },
];

/**
 * The coach: a pad-holder driven directly (no AI), who keeps a working
 * distance and — in the dodge drill — signals, waits, then throws.
 */
export function createPadDrill(kind, stats, seed = 1) {
  const fight = createFight({
    seed, training: true,
    player: { name: "You", stats },
    opponent: { name: "Coach", maxHealth: 100, stats: { power: 1, speed: 2, stamina: 10, recovery: 10 }, profile: { telegraph: 0 } },
  });
  fight.player.x = -0.5;
  fight.opponent.x = 0.48;
  const r = rng(seed * 7 + 3);
  const d = {
    kind, fight, t: 0, over: false, score: 0,
    prompt: null, // { text, want, until }
    results: [],
    // dodge
    queue: [], nextAt: 1500, current: null, count: DRILLS[kind].count ?? 0, thrownByCoach: 0,
    // combo
    combos: [], comboIdx: 0, step: 0, stepT: 0, comboStart: 0,
  };
  if (kind === "dodge") {
    for (let i = 0; i < d.count; i++) d.queue.push(DODGE_SEQ[i < 6 ? i : Math.floor(r() * DODGE_SEQ.length)]);
  } else {
    d.combos = COMBOS.slice(0, d.count ?? 8);
    d.comboStart = 0;
  }
  let coachIn = { ...IDLE };
  fight.manualOpponent = (f) => {
    // keep a working distance from the player
    const gap = f.opponent.x - f.player.x;
    const want = kind === "dodge" ? 0.8 : 0.9;
    const out = { ...coachIn };
    out.move = gap > want + 0.06 ? -1 : gap < want - 0.06 ? 1 : 0;
    if (f.opponent.state === "attack") out.move = 0;
    coachIn = { ...coachIn, attack: null };
    return out;
  };
  d.throwCoach = (attack) => {
    coachIn = { ...coachIn, attack };
  };
  return d;
}

export function stepPadDrill(d, realDt, input = IDLE) {
  if (d.over) return [];
  const f = d.fight;
  const events = stepFight(f, realDt, input);
  d.t += Math.min(100, realDt);
  if (d.kind === "dodge") dodgeLogic(d, events);
  else comboLogic(d, events);
  return events;
}

function dodgeLogic(d, events) {
  // outcomes of the coach's current punch
  if (d.current) {
    for (const e of events) {
      if (e.type === "throw" && e.who === "opponent") d.current.thrown = true;
      if (e.who === "player" && (e.type === "perfect" || e.type === "evade")) finishDodge(d, e.type === "perfect" ? "perfect" : "evade", events);
      else if (e.type === "block" && e.target === "player") finishDodge(d, "block", events);
      else if (e.type === "hit" && e.target === "player") finishDodge(d, "hit", events);
      else if (e.type === "whiff" && e.who === "opponent") finishDodge(d, "distance", events);
    }
  }
  if (!d.current && d.queue.length && d.t >= d.nextAt) {
    const item = d.queue.shift();
    d.current = { ...item, signalAt: d.t, throwAt: d.t + 650 + (d.results.length < 4 ? 250 : 0), thrown: false };
    const text = { block: "BLOCK!", slip: "SLIP!", duck: "DUCK!" }[item.want];
    d.prompt = { text, want: item.want, until: d.current.throwAt + 500 };
    events.push({ type: "signal", want: item.want });
  }
  if (d.current && !d.current.fired && d.t >= d.current.throwAt) {
    d.current.fired = true;
    d.throwCoach(d.current.attack);
  }
  if (!d.current && !d.queue.length && !d.over) {
    d.over = true;
    d.score = d.results.reduce((a, r) => a + r.pts, 0);
    events.push({ type: "drillOver", score: d.score });
  }
}

function finishDodge(d, outcome, events) {
  const c = d.current;
  if (!c) return;
  const good = outcome === "perfect" ? 150 : outcome === "evade" ? (c.want === "block" ? 70 : 110) : outcome === "block" ? (c.want === "block" ? 110 : 50) : outcome === "distance" ? 25 : 0;
  d.results.push({ want: c.want, outcome, pts: good });
  d.score += good;
  d.current = null;
  d.prompt = null;
  d.nextAt = d.t + 900 + (d.results.length % 3) * 250;
  events.push({ type: "drillResult", outcome, pts: good });
}

function comboLogic(d, events) {
  const combo = d.combos[d.comboIdx];
  if (!combo || d.t >= DRILLS.combo.duration) {
    if (!d.over) {
      d.over = true;
      events.push({ type: "drillOver", score: d.score });
    }
    return;
  }
  if (!d.prompt) {
    d.prompt = { combo, step: 0 };
    d.comboStart = d.t;
    d.stepT = d.t;
  }
  for (const e of events) {
    if (e.who !== "player") continue;
    if (e.type === "throw") {
      const want = combo[d.step];
      if (e.attack !== want) {
        d.step = 0;
        d.prompt = { combo, step: 0, wrong: true };
        d.comboStart = d.t;
        events.push({ type: "comboWrong" });
      }
    } else if (e.type === "hit" && e.attack === combo[d.step]) {
      d.step++;
      d.stepT = d.t;
      d.prompt = { combo, step: d.step };
      events.push({ type: "comboStep", step: d.step });
      if (d.step >= combo.length) {
        const secs = (d.t - d.comboStart) / 1000;
        const pts = Math.round(60 * combo.length + Math.max(0, 80 - secs * 25));
        d.score += pts;
        d.results.push({ combo, pts, secs });
        events.push({ type: "comboDone", pts });
        d.comboIdx++;
        d.step = 0;
        d.prompt = null;
      }
    } else if (e.type === "whiff") {
      d.step = 0;
      d.prompt = { combo, step: 0, wrong: true };
      events.push({ type: "comboWrong" });
    }
  }
  // too slow between punches → start again
  if (d.step > 0 && d.t - d.stepT > 1400) {
    d.step = 0;
    d.prompt = { combo, step: 0, wrong: true };
  }
}

export const attackLabel = (id) => ATTACKS[id]?.label?.toUpperCase() ?? id;
