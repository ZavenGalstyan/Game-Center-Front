/**
 * Boxing Club — one fight. Pure simulation, no DOM, deterministic for a seed.
 *
 *   createFight(opts)                → fight state
 *   stepFight(fight, realDt, input)  → events[]  (call once per frame)
 *
 * Time runs on a fixed 120 Hz sub-step, so attack windows, AI reaction time,
 * the round clock and stamina never depend on the monitor refresh rate.
 * Frame time is clamped (a tab returning from the background cannot make
 * fighters teleport or the clock jump). Hit-stop freezes the simulation for
 * a few tens of ms; a perfect dodge briefly slows it.
 *
 * Phases: intro → fight ⇄ knockdown → roundEnd → corner → intro … → over
 * Only `fight` lets anyone move or punch, so nobody can attack during the
 * intro, the count, between rounds or after the result.
 */
import { ATTACKS, COUNTER_MULT, COUNTER_STUN, DODGE, BLOCK } from "./attacks.js";
import {
  createFighter, updateFighter, headInvulnerable, guardUp, applyHitReaction, clamp,
  RING_HALF, ROPE_MARGIN, MIN_SEP,
} from "./fighter.js";
import { createAI, aiThink } from "./ai.js";
import { rng } from "./rng.js";

export const STEP = 1000 / 120;
export const MAX_FRAME = 100; // ms of real time processed per frame at most

export const INTRO = { round: 1100, fight: 700 };
export const ROUND_END_MS = 1700;
export const CORNER_MS = 5200;
export const COUNT_EVERY = 800;
export const FALL_MS = 900;
export const GETUP_MS = 850;
export const RESUME_MS = 700;

const EMPTY_INPUT = { move: 0, block: false, attack: null, body: false, dodge: null };

function emptyRound() {
  return {
    player: { damage: 0, landed: 0, knockdowns: 0 },
    opponent: { damage: 0, landed: 0, knockdowns: 0 },
  };
}

function emptyStats() {
  return {
    thrown: 0, landed: 0, jab: 0, cross: 0, hook: 0, body: 0, blocked: 0, blocks: 0,
    dodges: 0, evades: 0, perfect: 0, counters: 0, knockdowns: 0, damage: 0,
    whiffs: 0, hooksWhiffed: 0, guardBreaks: 0,
  };
}

/**
 * opts: { player: {name, stats, maxHealth}, opponent: {name, maxHealth, stats, profile},
 *         rounds, roundTime (s), seed, training? }
 */
export function createFight(opts) {
  const seed = opts.seed ?? 1;
  const player = createFighter({ id: "p", side: "player", x: -1.25, facing: 1, name: opts.player.name, stats: opts.player.stats, maxHealth: opts.player.maxHealth ?? 100 });
  const op = opts.opponent;
  const opponent = createFighter({ id: "o", side: "opponent", x: 1.25, facing: -1, name: op.name, stats: op.stats, maxHealth: op.maxHealth ?? 100, profile: op.profile });
  player.breath = 0;
  opponent.breath = 1.7;
  const fight = {
    seed,
    rand: rng(seed),
    time: 0,
    acc: 0,
    player,
    opponent,
    rounds: opts.rounds ?? 3,
    roundTime: (opts.roundTime ?? 75) * 1000,
    round: 1,
    clock: (opts.roundTime ?? 75) * 1000,
    phase: "intro",
    phaseT: 0,
    hitstop: 0,
    slowmo: 0,
    shake: 0,
    kd: null,
    over: false,
    result: null,
    roundLog: [],
    roundStats: emptyRound(),
    stats: { player: emptyStats(), opponent: emptyStats() },
    history: [],
    ai: createAI(op.profile || {}, seed * 31 + 7),
    notes: { oppLanded: {}, oppWhiffHooks: 0, playerLowStamina: false, playerBodyTaken: 0, playerBlocks: 0, playerLanded: 0, oppDropsAfterHook: Boolean(op.profile?.dropsGuardAfterHook) },
    paused: false,
    pending: { attack: null, dodge: null },
    opponentProfile: op.profile || {},
    training: Boolean(opts.training),
  };
  if (fight.training) {
    // training drills: straight into action, no clock, nobody gets hurt
    fight.phase = "fight";
    return fight;
  }
  freezeBoth(fight);
  return fight;
}

function freezeBoth(fight) {
  for (const f of [fight.player, fight.opponent]) {
    if (f.state !== "down") {
      f.state = "frozen";
      f.attack = null;
      f.dodge = null;
      f.stunT = 0;
      f.blockStunT = 0;
      f.speedX = 0;
      f.buffer = null;
    }
  }
}

function unfreezeBoth(fight) {
  for (const f of [fight.player, fight.opponent]) if (f.state === "frozen") f.state = "neutral";
}

const other = (fight, f) => (f === fight.player ? fight.opponent : fight.player);

/* ------------------------------------------------------------- snapshots */

function snapshot(fight) {
  const p = fight.player;
  const a = p.attack;
  fight.history.push({
    t: fight.time,
    x: p.x,
    state: p.state,
    guard: guardUp(p),
    atk: a ? {
      id: a.id, uid: a.uid, t: a.t, su: a.su, ac: a.ac,
      phase: a.t < a.su ? "startup" : a.t < a.su + a.ac ? "active" : "recovery",
      whiff: a.whiff, hit: a.hit, blocked: a.blocked,
    } : null,
    stamina: p.stamina,
    health: p.health,
  });
  // keep ~1.5 s — the slowest reaction time is well under that
  while (fight.history.length > 200) fight.history.shift();
}

/** What the opponent can know about the player: the world `delay` ms ago. */
export function perceive(fight, delay) {
  const h = fight.history;
  if (!h.length) return null;
  const want = fight.time - delay;
  for (let i = h.length - 1; i >= 0; i--) if (h[i].t <= want) return h[i];
  return h[0];
}

/* ------------------------------------------------------------ resolution */

function inActive(f) {
  const a = f.attack;
  return f.state === "attack" && a && !a.resolved && a.t >= a.su && a.t < a.su + a.ac;
}

function resolve(fight, A, a, events) {
  const B = other(fight, A);
  const def = a.def;
  const d = Math.abs(B.x - A.x);
  if (B.state === "down" || B.state === "frozen") return;
  if (d > def.reach) return; // glove hasn't reached anything yet
  a.resolved = true;
  const sA = fight.stats[A.side];
  const sB = fight.stats[B.side];
  const head = def.target === "head";

  // ---- slipped
  if (head && headInvulnerable(B)) {
    a.whiff = true;
    a.extra += def.whiffRecovery;
    B.dodge.evaded = true;
    sB.evades++;
    sA.whiffs++;
    if (def.kind === "hook") sA.hooksWhiffed++;
    if (B.dodge.t <= DODGE.perfectWindow) {
      B.dodge.perfect = true;
      a.extra += DODGE.perfectRecoveryPenalty;
      sB.perfect++;
      fight.slowmo = Math.max(fight.slowmo, 190);
      events.push({ type: "perfect", who: B.side, attack: def.id });
    } else {
      events.push({ type: "evade", who: B.side, attack: def.id });
    }
    return;
  }

  // ---- blocked
  if (guardUp(B)) {
    a.blocked = true;
    sA.blocked++;
    sB.blocks++;
    const through = head ? BLOCK.headChip : BLOCK.bodyThrough;
    const dmg = def.damage * a.dmgMul * through;
    if (dmg > 0) dealDamage(fight, A, B, dmg);
    B.stamina = Math.max(0, B.stamina - def.blockStamina - (head ? 0 : (def.bodyDrain || 0) * 0.5));
    B.regenDelay = Math.max(B.regenDelay, 500);
    B.counterT = Math.max(B.counterT, BLOCK.counterWindow);
    if (B.stamina <= 0) {
      // guard broken: an opening, not a free knockout
      B.state = "hitstun";
      B.stunT = BLOCK.breakStun;
      B.guardT = 0;
      B.blockStunT = 0;
      applyHitReaction(B, def, false, false);
      sB.guardBreaks++;
      events.push({ type: "guardBreak", who: B.side, attack: def.id });
    } else {
      B.blockStunT = def.blockStun;
      B.react = { kind: "block", t: 0, dur: 180, strength: def.kind === "hook" ? 1 : 0.6 };
      events.push({ type: "block", who: A.side, target: B.side, attack: def.id, body: !head });
    }
    if (!fight.training) B.x = clampX(B.x + A.facing * def.push * 0.5);
    if (B === fight.player) fight.notes.playerBlocks++;
    return;
  }

  // ---- clean hit
  const ba = B.attack;
  const counter = a.fromCounter || (B.state === "attack" && ba && (ba.t < ba.su || ba.t >= ba.su + ba.ac || ba.whiff));
  const dmg = def.damage * a.dmgMul * (counter ? COUNTER_MULT : 1);
  a.hit = true;
  sA.landed++;
  sA[def.kind === "hook" ? "hook" : def.id === "cross" || def.id === "bodyCross" ? "cross" : "jab"]++;
  if (!head) {
    sA.body++;
    B.stamina = Math.max(0, B.stamina - (def.bodyDrain || 0));
    B.bodyPenaltyT = 2600;
    if (B === fight.player) fight.notes.playerBodyTaken++;
  }
  if (counter) sA.counters++;
  if (A === fight.opponent) fight.notes.oppLanded[def.id] = (fight.notes.oppLanded[def.id] || 0) + 1;
  else fight.notes.playerLanded++;
  fight.roundStats[A.side].landed++;
  // interrupt whatever B was doing
  B.attack = null;
  B.dodge = null;
  B.state = "hitstun";
  B.stunT = def.hitStun + (counter ? COUNTER_STUN : 0);
  B.guardT = 0;
  B.blockStunT = 0;
  B.buffer = null;
  if (!fight.training) B.x = clampX(B.x + A.facing * def.push);
  applyHitReaction(B, def, counter, !head);
  fight.hitstop = Math.max(fight.hitstop, def.hitStop + (counter ? 25 : 0));
  fight.shake = Math.max(fight.shake, def.shake * (counter ? 1.4 : 1));
  events.push({ type: "hit", who: A.side, target: B.side, attack: def.id, counter, body: !head, damage: dmg });
  dealDamage(fight, A, B, dmg);
}

function dealDamage(fight, A, B, dmg) {
  if (fight.training) {
    fight.stats[A.side].damage += dmg;
    return;
  }
  const before = B.health;
  B.health = clamp(B.health - dmg, 0, B.maxHealth);
  const real = before - B.health;
  fight.stats[A.side].damage += real;
  fight.roundStats[A.side].damage += real;
  if (B.health <= 0 && !fight.kd && !fight.over) startKnockdown(fight, B);
}

const clampX = (x) => clamp(x, -RING_HALF + ROPE_MARGIN, RING_HALF - ROPE_MARGIN);

/* ------------------------------------------------------------- knockdown */

function startKnockdown(fight, B) {
  const A = other(fight, B);
  B.knockdowns++;
  fight.stats[A.side].knockdowns++;
  fight.roundStats[B.side].knockdowns++;
  B.state = "down";
  B.attack = null;
  B.dodge = null;
  B.react = null;
  B.speedX = 0;
  B.down = { phase: "fall", t: 0 };
  A.state = "frozen";
  A.attack = null;
  A.dodge = null;
  A.speedX = 0;
  const n = B.knockdowns;
  const kd = { who: B.side, t: 0, count: 0, nextCountAt: FALL_MS, recovered: false, number: n, tko: n >= 3 };
  if (B.side === "player") {
    // timed-press recovery: harder each time
    kd.need = [2, 3, 4][Math.min(n, 3) - 1];
    kd.hits = 0;
    kd.zone = [0.26, 0.2, 0.15][Math.min(n, 3) - 1];
    kd.zoneAt = 0.35 + fight.rand() * 0.3;
    kd.speed = [1.05, 1.3, 1.55][Math.min(n, 3) - 1];
    kd.lock = 0;
    kd.marker = 0;
  } else {
    const p = fight.opponentProfile || {};
    const toughness = p.toughness ?? 0.4;
    // deterministic: tougher, fresher fighters rise sooner; repeated knockdowns hurt
    const at = Math.max(2, Math.round(3 + (n - 1) * 2.5 + (fight.round - 1) * 0.6 - toughness * 3));
    kd.getUpAt = at;
  }
  fight.kd = kd;
  fight.phase = "knockdown";
  fight.shake = Math.max(fight.shake, 1.2);
  fight.hitstop = Math.max(fight.hitstop, 90);
  return kd;
}

/** Player recovery press (any punch key / block) while knocked down. */
export function recoveryPress(fight, events) {
  const kd = fight.kd;
  if (!kd || kd.who !== "player" || kd.recovered || fight.over || kd.tko) return;
  if (kd.t < FALL_MS || kd.lock > 0) return;
  const inZone = Math.abs(kd.marker - kd.zoneAt) <= kd.zone / 2;
  if (inZone) {
    kd.hits++;
    events.push({ type: "recoverHit", who: "player", hits: kd.hits, need: kd.need });
    kd.zoneAt = 0.2 + fight.rand() * 0.6;
    if (kd.hits >= kd.need) kd.recovered = true;
  } else {
    // a mistimed press costs progress: mashing can't get you up
    kd.hits = Math.max(0, kd.hits - 1);
    kd.lock = 650;
    events.push({ type: "recoverMiss", who: "player" });
  }
}

function stepKnockdown(fight, dt, events) {
  const kd = fight.kd;
  const B = kd.who === "player" ? fight.player : fight.opponent;
  const A = other(fight, B);
  kd.t += dt;
  B.down.t += dt;
  if (kd.lock > 0) kd.lock = Math.max(0, kd.lock - dt);
  if (kd.who === "player") {
    // marker sweeps 0→1→0
    const ph = (kd.t / 1000) * kd.speed;
    kd.marker = 1 - Math.abs(((ph % 2) + 2) % 2 - 1);
  }
  // standing fighter walks to a neutral distance
  const home = A.side === "player" ? -2.1 : 2.1;
  A.x += clamp(home - A.x, -1, 1) * Math.min(1, dt / 400);
  A.moving = Math.abs(home - A.x) > 0.05 ? Math.sign((home - A.x) * A.facing) : 0;
  A.stepPhase += Math.abs(home - A.x) * dt / 400 * 3;

  if (B.down.phase === "fall" && B.down.t >= 600) B.down.phase = "floor";
  if (B.down.phase === "getup") {
    if (B.down.t >= GETUP_MS) {
      const restore = kd.who === "player"
        ? [0.42, 0.3, 0.2][Math.min(kd.number, 3) - 1] * (1 + B.mods.getUp * 0.03)
        : [0.4, 0.28, 0.18][Math.min(kd.number, 3) - 1] * (0.8 + (fight.opponentProfile?.toughness ?? 0.4) * 0.5);
      B.health = clamp(Math.round(B.maxHealth * restore), 1, B.maxHealth);
      B.stamina = Math.max(B.stamina, B.maxStamina * 0.45);
      B.down = null;
      B.state = "frozen";
      fight.kd = null;
      fight.phase = "resume";
      fight.phaseT = 0;
      events.push({ type: "getup", who: B.side });
    }
    return;
  }
  if (kd.t >= kd.nextCountAt && !fight.over) {
    if (kd.tko && kd.count === 0) {
      // third knockdown: the referee waves it off
      kd.count = 1;
      finish(fight, kd.who === "player" ? "opponent" : "player", "TKO", events);
      return;
    }
    kd.count++;
    kd.nextCountAt += COUNT_EVERY;
    events.push({ type: "count", n: kd.count, who: kd.who });
    const up = kd.who === "player" ? kd.recovered : kd.count >= kd.getUpAt && kd.getUpAt <= 9;
    if (up && kd.count < 10) {
      B.down.phase = "getup";
      B.down.t = 0;
    } else if (kd.count >= 10) {
      finish(fight, kd.who === "player" ? "opponent" : "player", "KO", events);
    }
  }
}

/* ---------------------------------------------------------------- rounds */

function scoreRound(fight) {
  const r = fight.roundStats;
  let p = 10;
  let o = 10;
  const diff = r.player.damage - r.opponent.damage;
  if (diff >= 5) o = 9;
  else if (diff <= -5) p = 9;
  p -= r.player.knockdowns;
  o -= r.opponent.knockdowns;
  // a round with a knockdown but otherwise even still goes to the other fighter
  const res = p > o ? "won" : p < o ? "lost" : "even";
  const entry = { round: fight.round, player: p, opponent: o, result: res, stats: r };
  fight.roundLog.push(entry);
  return entry;
}

function finish(fight, winner, method, events) {
  if (fight.over) return;
  fight.over = true;
  fight.phase = "over";
  fight.phaseT = 0;
  const w = winner === "player" ? fight.player : fight.opponent;
  const l = other(fight, w);
  if (w.state !== "down") w.state = "frozen";
  w.attack = null;
  w.dodge = null;
  if (l.state !== "down") l.state = "frozen";
  fight.result = { winner, method, round: fight.round, clock: fight.clock, rounds: fight.roundLog.slice() };
  events.push({ type: "result", winner, method });
}

function decide(fight, events) {
  const sum = (k) => fight.roundLog.reduce((a, r) => a + r[k], 0);
  const p = sum("player");
  const o = sum("opponent");
  if (p === o) finish(fight, "draw", "DRAW", events);
  else finish(fight, p > o ? "player" : "opponent", "DECISION", events);
  fight.result.cards = { player: p, opponent: o };
}

/* ------------------------------------------------------------------ step */

function simStep(fight, dt, input, events) {
  fight.time += dt;
  fight.phaseT += dt;
  const P = fight.player;
  const O = fight.opponent;

  switch (fight.phase) {
    case "intro": {
      if (fight.phaseT >= INTRO.round && !fight.introBell) {
        fight.introBell = true;
        events.push({ type: "bell", kind: "start" });
      }
      if (fight.phaseT >= INTRO.round + INTRO.fight) {
        fight.phase = "fight";
        fight.phaseT = 0;
        fight.introBell = false;
        unfreezeBoth(fight);
        events.push({ type: "roundStart", round: fight.round });
      }
      break;
    }
    case "resume": {
      if (fight.phaseT >= RESUME_MS) {
        fight.phase = "fight";
        fight.phaseT = 0;
        unfreezeBoth(fight);
      }
      break;
    }
    case "fight": {
      // tests (and training) may drive the opponent directly instead of the AI
      const oppInput = fight.manualOpponent ? fight.manualOpponent(fight, dt) : aiThink(fight.ai, fight, dt);
      updateFighter(P, dt, input, events);
      updateFighter(O, dt, oppInput, events);
      // hit resolution — both sides see the world as it was this tick (trades)
      const pa = inActive(P) ? P.attack : null;
      const oa = inActive(O) ? O.attack : null;
      if (pa) resolve(fight, P, pa, events);
      if (oa && !fight.kd && !fight.over) resolve(fight, O, oa, events);
      // the active window closed without touching anything → whiff
      for (const F of [P, O]) {
        const a = F.attack;
        if (F.state === "attack" && a && !a.resolved && a.t >= a.su + a.ac) {
          a.resolved = true;
          a.whiff = true;
          a.extra += a.def.whiffRecovery;
          fight.stats[F.side].whiffs++;
          if (a.def.kind === "hook") fight.stats[F.side].hooksWhiffed++;
          if (F === O && a.def.kind === "hook") fight.notes.oppWhiffHooks++;
          events.push({ type: "whiff", who: F.side, attack: a.id });
        }
      }
      // throws counted for stats
      for (const e of events) if (e.type === "throw" && !e._counted) {
        e._counted = true;
        fight.stats[e.who].thrown++;
      }
      if (fight.phase !== "fight") break; // a knockdown happened
      separate(fight, events);
      if (P.stamina < 15) fight.notes.playerLowStamina = true;
      if (fight.training) break;
      fight.clock -= dt;
      if (fight.clock <= 0) {
        fight.clock = 0;
        fight.phase = "roundEnd";
        fight.phaseT = 0;
        freezeBoth(fight);
        const entry = scoreRound(fight);
        events.push({ type: "bell", kind: "end" }, { type: "roundEnd", round: fight.round, result: entry.result });
      }
      break;
    }
    case "knockdown":
      stepKnockdown(fight, dt, events);
      break;
    case "roundEnd": {
      if (fight.phaseT >= ROUND_END_MS) {
        if (fight.round >= fight.rounds) decide(fight, events);
        else {
          fight.phase = "corner";
          fight.phaseT = 0;
          fight.cornerTip = coachTip(fight);
          for (const f of [P, O]) {
            f.health = Math.min(f.maxHealth, f.health + f.maxHealth * 0.12);
            f.stamina = f.maxStamina;
            f.bodyPenaltyT = 0;
          }
          events.push({ type: "corner" });
        }
      }
      break;
    }
    case "corner": {
      if (fight.phaseT >= CORNER_MS || fight.skipCorner) nextRound(fight, events);
      break;
    }
    default:
      break;
  }
  if (fight.phase === "fight" || fight.phase === "knockdown") snapshot(fight);
  else if (fight.history.length && fight.phase !== "resume") fight.history.length = 0;
}

function nextRound(fight, events) {
  fight.skipCorner = false;
  fight.round++;
  fight.clock = fight.roundTime;
  fight.roundStats = emptyRound();
  fight.phase = "intro";
  fight.phaseT = 0;
  fight.player.x = -1.25;
  fight.opponent.x = 1.25;
  freezeBoth(fight);
  fight.ai.reset?.();
  events.push({ type: "roundIntro", round: fight.round });
}

/** Keep fighters inside the ropes and apart, gently. */
function separate(fight, events) {
  const P = fight.player;
  const O = fight.opponent;
  for (const f of [P, O]) {
    const lo = -RING_HALF + ROPE_MARGIN;
    const hi = RING_HALF - ROPE_MARGIN;
    if (f.x < lo || f.x > hi) {
      if (Math.abs(f.speedX) > 0.6 && !f.onRopes) events.push({ type: "rope", who: f.side });
      f.onRopes = true;
      f.x = clamp(f.x, lo, hi);
      f.speedX = 0;
    } else if (f.x > lo + 0.05 && f.x < hi - 0.05) f.onRopes = false;
  }
  const gap = O.x - P.x;
  if (gap < MIN_SEP) {
    const push = (MIN_SEP - gap) / 2;
    const lo = -RING_HALF + ROPE_MARGIN;
    const hi = RING_HALF - ROPE_MARGIN;
    let px = P.x - push;
    let ox = O.x + push;
    if (px < lo) { ox += lo - px; px = lo; }
    if (ox > hi) { px -= ox - hi; ox = hi; }
    P.x = px;
    O.x = ox;
    if (P.speedX > 0) P.speedX *= 0.5;
    if (O.speedX < 0) O.speedX *= 0.5;
  }
}

/** Corner advice built from what actually happened this fight. */
export function coachTip(fight) {
  const n = fight.notes;
  const landed = Object.entries(n.oppLanded).sort((a, b) => b[1] - a[1]);
  const O = fight.opponent;
  const tips = [];
  if (n.oppWhiffHooks >= 2 || (n.oppDropsAfterHook && (n.oppLanded.hookL || n.oppLanded.hookR || n.oppWhiffHooks))) tips.push("He drops his guard after hooks. Slip it and fire back.");
  if (landed[0] && landed[0][1] >= 3) {
    const [id] = landed[0];
    if (id === "cross" || id === "bodyCross") tips.push("Watch his right hand — block or slip the cross.");
    else if (id.startsWith("hook") || id === "bodyHook") tips.push("His hooks are hurting you. Step back out of range.");
    else if (id === "jab") tips.push("He's living on the jab. Slip it and counter.");
    else tips.push("He keeps going to the body. Keep your distance.");
  }
  if (n.playerLowStamina) tips.push("Don't waste stamina — every punch you miss costs you.");
  if (O.stamina < O.maxStamina * 0.35) tips.push("He's getting tired. Attack the body.");
  if (n.playerBodyTaken >= 3) tips.push("He's hunting the body. Dodge back or tie him up with jabs.");
  if (n.playerLanded < 4) tips.push("Use your jab to find the range, then follow with the cross.");
  if (n.playerBlocks >= 6) tips.push("Blocking all day drains you. Slip and counter instead.");
  if (!tips.length) tips.push("Good round. Keep your guard up and your jab busy.");
  return tips[Math.floor(fight.rand() * Math.min(2, tips.length))];
}

/** Main entry. `input` is the player's input for this frame. */
export function stepFight(fight, realDt, input = EMPTY_INPUT) {
  const events = [];
  if (fight.paused) return events;
  let dt = Math.min(Math.max(0, realDt), MAX_FRAME);
  fight.shake = Math.max(0, fight.shake - dt / 260);
  if (fight.kd) fight.kd.markerDirty = true;
  // edge-triggered presses wait in `pending` until a simulation sub-step runs
  // (a press during hit-stop is not lost; a stale one is dropped by the buffer)
  if (input.attack) fight.pending.attack = input.attack;
  if (input.dodge) fight.pending.dodge = input.dodge;
  const held = { move: input.move || 0, block: Boolean(input.block), body: Boolean(input.body), attack: null, dodge: null };
  if (input.recover && fight.phase === "knockdown") recoveryPress(fight, events);
  if (input.skip && fight.phase === "corner") fight.skipCorner = true;
  while (dt > 0) {
    if (fight.hitstop > 0) {
      const h = Math.min(dt, fight.hitstop);
      fight.hitstop -= h;
      dt -= h;
      continue;
    }
    let scale = 1;
    if (fight.slowmo > 0) {
      scale = 0.35;
      fight.slowmo = Math.max(0, fight.slowmo - Math.min(dt, STEP));
    }
    fight.acc += Math.min(dt, STEP) * scale;
    dt -= Math.min(dt, STEP);
    while (fight.acc >= STEP) {
      fight.acc -= STEP;
      const inp = { ...held, attack: fight.pending.attack, dodge: fight.pending.dodge };
      fight.pending.attack = null;
      fight.pending.dodge = null;
      simStep(fight, STEP, inp, events);
      if (fight.hitstop > 0) break;
    }
  }
  return events;
}
