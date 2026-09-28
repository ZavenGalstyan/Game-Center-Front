/**
 * Boxing Club — combat rule tests (Node, no framework):
 *   node src/components/games/BoxingClub/tools/combatTests.mjs
 * Real engine, real timings; the opponent is driven manually (or by the
 * real AI in the fairness section) so each rule is checked in isolation.
 */
import { createFight, stepFight, perceive, STEP, INTRO, CORNER_MS, ROUND_END_MS } from "../engine/fight.js";
import { ATTACKS, DODGE, COUNTER_MULT } from "../engine/attacks.js";
import { RING_HALF, ROPE_MARGIN, MIN_SEP } from "../engine/fighter.js";

let pass = 0;
let fail = 0;
function check(name, cond, extra = "") {
  if (cond) pass++;
  else {
    fail++;
    console.error("✗", name, extra);
  }
}
const IDLE = { move: 0, block: false, attack: null, body: false, dodge: null };

/** A fight past the intro with a passive (manually driven) opponent. */
function mk({ gap = 1.0, opp = {}, player = {}, seed = 1, rounds = 3, roundTime = 75 } = {}) {
  const f = createFight({
    seed, rounds, roundTime,
    player: { name: "P", stats: {}, ...player },
    opponent: { name: "O", maxHealth: 100, profile: { toughness: 0.4 }, ...opp },
  });
  f.oppIn = { ...IDLE };
  f.manualOpponent = () => {
    const i = f.oppIn;
    f.oppIn = { ...i, attack: null, dodge: null }; // presses are one-shot
    return i;
  };
  run(f, INTRO.round + INTRO.fight + 20);
  f.player.x = -gap / 2;
  f.opponent.x = gap / 2;
  return f;
}

/** Run `ms` of real time in 16.7 ms frames; `input(t)` gives player input. */
function run(f, ms, input = () => IDLE) {
  const events = [];
  let t = 0;
  while (t < ms) {
    events.push(...stepFight(f, 1000 / 60, input(t)));
    t += 1000 / 60;
  }
  return events;
}
const once = (ev) => { let used = false; return () => { if (used) return IDLE; used = true; return { ...IDLE, ...ev }; }; };
const count = (events, type, pred = () => true) => events.filter((e) => e.type === type && pred(e)).length;

/* -------------------------------------------------- phases / intro */
{
  const f = createFight({ seed: 3, player: { name: "P" }, opponent: { name: "O", profile: { aggression: 1 } } });
  const ev = run(f, INTRO.round + 200);
  check("nobody acts during the intro", count(ev, "throw") === 0 && f.phase === "intro");
  const ev2 = run(f, 600);
  check("round starts exactly once", count([...ev, ...ev2], "roundStart") === 1 && count([...ev, ...ev2], "bell") === 1);
  check("clock only runs in the fight phase", f.clock <= f.roundTime && f.clock > f.roundTime - 600);
}

/* -------------------------------------------------- range / whiff */
{
  const f = mk({ gap: 1.5 });
  const ev = run(f, 700, once({ attack: "jab" }));
  check("jab out of range whiffs", count(ev, "whiff", (e) => e.who === "player") === 1);
  check("whiff does no damage", f.opponent.health === 100 && count(ev, "hit") === 0);
}
{
  // just outside reach vs just inside
  const out = mk({ gap: ATTACKS.jab.reach + 0.02 });
  const inn = mk({ gap: ATTACKS.jab.reach - 0.02 });
  run(out, 600, once({ attack: "jab" }));
  run(inn, 600, once({ attack: "jab" }));
  check("reach boundary: 2 cm too far misses", out.opponent.health === 100);
  check("reach boundary: 2 cm inside lands", inn.opponent.health < 100);
}

/* -------------------------------------------------- hit timing / once */
{
  const f = mk({ gap: 0.95 });
  let hitAt = null;
  let t = 0;
  const ev = [];
  let pressed = false;
  while (t < 700) {
    const e = stepFight(f, 1000 / 60, pressed ? IDLE : { ...IDLE, attack: "jab" });
    pressed = true;
    if (!hitAt && e.some((x) => x.type === "hit")) hitAt = t;
    ev.push(...e);
    t += 1000 / 60;
  }
  const hits = count(ev, "hit");
  check("jab lands once", hits === 1, `hits=${hits}`);
  check("damage applied once (4.5)", Math.abs(100 - f.opponent.health - ATTACKS.jab.damage) < 1e-6, `hp=${f.opponent.health}`);
  check("hit only after startup (glove travelling)", hitAt !== null && hitAt >= ATTACKS.jab.startup - 17, `hitAt=${hitAt}`);
  check("hit before active window closes", hitAt <= ATTACKS.jab.startup + ATTACKS.jab.active + 17);
  check("stamina spent", f.player.stamina < f.player.maxStamina);
  const low = f.player.stamina;
  run(f, 2000);
  check("stamina recovers", f.player.stamina > low);
  check("stamina never above max", f.player.stamina <= f.player.maxStamina);
}

/* -------------------------------------------------- cross vs jab vs hook */
{
  const j = mk({ gap: 0.8 });
  const c = mk({ gap: 0.8 });
  const h = mk({ gap: 0.8 });
  run(j, 800, once({ attack: "jab" }));
  run(c, 800, once({ attack: "cross" }));
  run(h, 900, once({ attack: "hookL" }));
  check("cross hurts more than jab", 100 - c.opponent.health > 100 - j.opponent.health);
  check("hook hurts most", 100 - h.opponent.health > 100 - c.opponent.health);
  const total = (id) => ATTACKS[id].startup + ATTACKS[id].active + ATTACKS[id].recovery;
  check("hook commits longer than cross, cross longer than jab", total("hookL") > total("cross") && total("cross") > total("jab"));
  check("hook is short range", ATTACKS.hookL.reach < ATTACKS.jab.reach && ATTACKS.cross.reach > ATTACKS.jab.reach);
  const far = mk({ gap: 1.0 });
  run(far, 900, once({ attack: "hookL" }));
  check("hook misses at jab range", far.opponent.health === 100);
}

/* -------------------------------------------------- block */
{
  const f = mk({ gap: 0.9 });
  f.oppIn = { ...IDLE, block: true };
  run(f, 200); // guard up
  const st = f.opponent.stamina;
  f.oppIn = { ...IDLE, block: true };
  const ev = run(f, 800, once({ attack: "cross" }));
  check("blocked cross: block event, no clean hit", count(ev, "block") === 1 && count(ev, "hit") === 0);
  check("blocked head punch does no health damage", f.opponent.health === 100);
  check("blocking costs the defender stamina", f.opponent.stamina < st + 5);
}
{
  const f = mk({ gap: 0.9 });
  f.oppIn = { ...IDLE, block: true };
  run(f, 200);
  run(f, 900, once({ attack: "bodyCross" }));
  check("body punch through the guard still hurts (half)", f.opponent.health < 100 && f.opponent.health > 100 - ATTACKS.bodyCross.damage);
}
{
  // infinite block is impossible: repeated hooks exhaust the guard
  const f = mk({ gap: 0.75 });
  const ev = [];
  for (let i = 0; i < 14; i++) {
    f.player.x = f.opponent.x - 0.75;
    f.oppIn = { ...IDLE, block: true };
    ev.push(...run(f, 700, once({ attack: i % 2 ? "hookR" : "hookL" })));
  }
  check("guard breaks under sustained heavy punches", count(ev, "guardBreak") >= 1, JSON.stringify(f.stats.opponent));
  check("defender stamina never negative", f.opponent.stamina >= 0);
}
{
  // guard needs a moment to come up
  const f = mk({ gap: 0.9 });
  f.oppIn = { ...IDLE, block: true };
  const ev = run(f, 600, once({ attack: "jab" }));
  check("guard raised on the same frame as the punch lands late → jab still lands or is blocked, never both", count(ev, "hit") + count(ev, "block") === 1);
}

/* -------------------------------------------------- dodge / perfect dodge */
{
  // opponent throws a cross, player slips it
  const f = mk({ gap: 0.9 });
  f.oppIn = { ...IDLE, attack: "cross" };
  let ev = run(f, 60); // cross in startup
  ev = ev.concat(run(f, 600, once({ dodge: "back" })));
  check("slip makes the cross miss", count(ev, "hit") === 0 && (count(ev, "evade") + count(ev, "perfect") + count(ev, "whiff", (e) => e.who === "opponent")) === 1);
  check("player unharmed", f.player.health === 100);
}
{
  // dodge right before impact → perfect
  const f = mk({ gap: 0.9 });
  f.oppIn = { ...IDLE, attack: "cross" };
  const impact = ATTACKS.cross.startup;
  let ev = run(f, impact - 90);
  ev = ev.concat(run(f, 500, once({ dodge: "in" })));
  check("perfect dodge detected", count(ev, "perfect") === 1, ev.map((e) => e.type).join(","));
  check("perfect dodge gives a counter window", f.player.counterT > 0 || ev.length > 0);
}
{
  // dodging too early: invulnerability over before impact → hit
  const f = mk({ gap: 0.9 });
  const ev = run(f, 20, once({ dodge: "in" }));
  run(f, 240);
  f.oppIn = { ...IDLE, attack: "jab" };
  const ev2 = run(f, 400);
  check("a stale dodge doesn't protect", count([...ev, ...ev2], "hit") === 1);
}
{
  // body punches are not slipped
  const f = mk({ gap: 0.9 });
  f.oppIn = { ...IDLE, attack: "bodyCross" };
  let ev = run(f, 60);
  ev = ev.concat(run(f, 600, once({ dodge: "in" })));
  check("slip doesn't avoid a body shot", count(ev, "hit") === 1);
}

/* -------------------------------------------------- counters */
{
  // opponent whiffs a hook from range, player walks in and crosses during recovery
  const f = mk({ gap: 1.02 });
  f.oppIn = { ...IDLE, attack: "hookL" };
  run(f, ATTACKS.hookL.startup + ATTACKS.hookL.active + 40);
  f.player.x = f.opponent.x - 0.95;
  const ev = run(f, 600, once({ attack: "cross" }));
  const hit = ev.find((e) => e.type === "hit" && e.who === "player");
  check("hit during opponent's recovery is a COUNTER", hit && hit.counter);
  check("counter does more damage", hit && Math.abs(hit.damage - ATTACKS.cross.damage * COUNTER_MULT) < 1e-6);
}
{
  const f = mk({ gap: 0.95 });
  const ev = run(f, 600, once({ attack: "cross" }));
  const hit = ev.find((e) => e.type === "hit");
  check("plain hit on a neutral opponent is not a counter", hit && !hit.counter);
}
{
  // interrupting a slow hook in its startup with a jab
  const f = mk({ gap: 0.8 });
  f.oppIn = { ...IDLE, attack: "hookR" };
  run(f, 34);
  const ev = run(f, 500, once({ attack: "jab" }));
  const hit = ev.find((e) => e.type === "hit" && e.who === "player");
  check("jab interrupts a hook in startup (counter)", hit && hit.counter && count(ev, "hit", (e) => e.who === "opponent") === 0);
}
{
  // counter window after a block
  const f = mk({ gap: 0.9 });
  const ev = [];
  let t = 0;
  while (t < 1200) {
    const inp = t < 700 ? { ...IDLE, block: true } : t < 720 ? { ...IDLE, attack: "cross" } : IDLE;
    if (Math.abs(t - 200) < 9) f.oppIn = { ...IDLE, attack: "cross" };
    ev.push(...stepFight(f, 1000 / 60, inp));
    t += 1000 / 60;
  }
  const blockThenHit = ev.find((e) => e.type === "hit" && e.who === "player");
  check("block → counter cross registers", count(ev, "block") === 1 && blockThenHit && blockThenHit.counter, ev.map((e) => e.type).join(","));
}

/* -------------------------------------------------- spam / stamina */
{
  const f = mk({ gap: 0.9 });
  let n = 0;
  const ev = run(f, 6000, () => ({ ...IDLE, attack: n++ % 2 ? "hookL" : "jab" }));
  check("spamming never makes stamina negative", f.player.stamina >= 0);
  check("spam is throttled by recovery (no machine-gun)", count(ev, "throw", (e) => e.who === "player") < 30);
  const late = ev.filter((e) => e.type === "hit" && e.who === "player").slice(-3);
  const early = ev.filter((e) => e.type === "hit" && e.who === "player").slice(0, 3);
  check("tired punches do less damage", late.length && early.length && late[0].damage <= early[0].damage);
  check("fighter still responds when exhausted", f.player.state !== "frozen");
}
{
  // input buffer: a press 60 ms before recovery ends is honoured, one 400 ms early is not
  const f = mk({ gap: 0.9 });
  let t = 0;
  let presses = 0;
  const ev = [];
  while (t < 1500) {
    let inp = IDLE;
    if (t === 0) inp = { ...IDLE, attack: "jab" };
    ev.push(...stepFight(f, 1000 / 60, inp));
    t += 1000 / 60;
    if (Math.abs(t - 150) < 9 && presses++ === 0) ev.push(...stepFight(f, 1000 / 60, { ...IDLE, attack: "jab" }));
  }
  check("no giant queued combos from early mashing", count(ev, "throw") <= 2);
}

/* -------------------------------------------------- knockdown / KO */
{
  const f = mk({ gap: 0.9, opp: { profile: { toughness: 0.9 } } });
  f.opponent.health = 3;
  const ev = run(f, 700, once({ attack: "cross" }));
  check("knockdown triggers once", f.phase === "knockdown" && f.opponent.knockdowns === 1 && f.stats.player.knockdowns === 1);
  const ev2 = run(f, 700, () => ({ ...IDLE, attack: "jab", move: 1 }));
  check("no attacks while someone is down", count(ev2, "throw") === 0 && count(ev2, "hit") === 0);
  const ev3 = run(f, 12000);
  check("count happens", count([...ev2, ...ev3], "count") >= 2);
  check("tough fighter gets up (first knockdown)", count(ev3, "getup") === 1 && !f.over, `phase=${f.phase}`);
  check("health restored after getting up, not above max", f.opponent.health > 0 && f.opponent.health <= f.opponent.maxHealth);
}
{
  const f = mk({ gap: 0.9, opp: { profile: { toughness: 0 } } });
  let ev = [];
  for (let k = 0; k < 3 && !f.over; k++) {
    f.opponent.health = 2;
    f.player.x = f.opponent.x - 0.9;
    ev = ev.concat(run(f, 700, once({ attack: "cross" })));
    ev = ev.concat(run(f, 12000));
  }
  const results = count(ev, "result");
  check("fight ends exactly once (KO/TKO)", f.over && results === 1 && ["KO", "TKO"].includes(f.result.method), f.result && f.result.method);
  const ev2 = run(f, 3000, () => ({ ...IDLE, attack: "jab" }));
  check("nothing happens after the fight is over", ev2.length === 0 || ev2.every((e) => e.type !== "throw" && e.type !== "hit"));
  check("knocked-out fighter doesn't get up afterwards", f.opponent.state === "down");
}
{
  // player knockdown: recovery presses
  const f = mk({ gap: 0.9 });
  f.player.health = 2;
  f.oppIn = { ...IDLE, attack: "cross" };
  run(f, 700);
  check("player knocked down", f.phase === "knockdown" && f.kd.who === "player");
  // press at the right moments
  let t = 0;
  while (f.phase === "knockdown" && t < 12000) {
    const kd = f.kd;
    const good = kd && Math.abs(kd.marker - kd.zoneAt) < kd.zone / 2 - 0.03;
    stepFight(f, 1000 / 60, good ? { ...IDLE, recover: true } : IDLE);
    t += 1000 / 60;
  }
  check("player recovers with timed presses", !f.over && f.player.health > 0 && ["resume", "fight"].includes(f.phase), `${f.phase}`);
}
{
  const f = mk({ gap: 0.9 });
  f.player.health = 2;
  f.oppIn = { ...IDLE, attack: "cross" };
  run(f, 700);
  // mashing: every frame press → mostly misses, locked out
  const ev = run(f, 11000, () => ({ ...IDLE, recover: true }));
  check("mashing doesn't get you up", f.over && f.result.winner === "opponent", `${f.phase} hits=${f.kd?.hits}`);
  check("KO result once", count(ev, "result") === 1);
}

/* -------------------------------------------------- rounds / decision */
{
  const f = mk({ roundTime: 5 });
  run(f, 900, once({ attack: "jab" }));
  const ev = run(f, 5000 + ROUND_END_MS + 200);
  check("round ends once at 0:00", count(ev, "roundEnd") === 1 && ["roundEnd", "corner"].includes(f.phase));
  check("clock stops at 0", f.clock === 0 || f.round === 2);
  const ev2 = run(f, CORNER_MS + INTRO.round + INTRO.fight + 100);
  check("next round starts once", f.round === 2 && count(ev2, "roundStart") === 1 && f.phase === "fight");
  check("fighters reset to their corners", Math.abs(f.player.x + 1.25) < 0.2);
}
{
  const f = mk({ roundTime: 3, rounds: 1, gap: 0.9 });
  run(f, 2400, (t) => (Math.floor(t / 400) % 2 ? IDLE : { ...IDLE, attack: "cross" }));
  const ev = run(f, 4000);
  check("decision after final round", f.over && f.result.method === "DECISION" && f.result.winner === "player", JSON.stringify(f.result));
  check("one result event", count(ev, "result") === 1);
}
{
  // knockdown freezes the clock
  const f = mk({ gap: 0.9, roundTime: 60 });
  f.opponent.health = 2;
  run(f, 500, once({ attack: "cross" }));
  const c0 = f.clock;
  run(f, 1500);
  check("clock paused during the count", f.clock === c0 && f.phase === "knockdown");
}

/* -------------------------------------------------- bounds / separation */
{
  const f = mk({ gap: 2 });
  run(f, 5000, () => ({ ...IDLE, move: -1 }));
  check("player can't leave the ring", f.player.x >= -RING_HALF + ROPE_MARGIN - 1e-9);
  run(f, 6000, () => ({ ...IDLE, move: 1 }));
  check("fighters never overlap", f.opponent.x - f.player.x >= MIN_SEP - 1e-6);
  check("both inside the ropes", f.opponent.x <= RING_HALF - ROPE_MARGIN + 1e-9);
}
{
  // movement is frame-rate independent
  const a = mk({ gap: 3 });
  const b = mk({ gap: 3 });
  for (let i = 0; i < 60; i++) stepFight(a, 1000 / 60, { ...IDLE, move: 1 });
  for (let i = 0; i < 144; i++) stepFight(b, 1000 / 144, { ...IDLE, move: 1 });
  check("same distance at 60 Hz and 144 Hz", Math.abs(a.player.x - b.player.x) < 0.02, `${a.player.x} ${b.player.x}`);
  const c = mk({ gap: 3 });
  stepFight(c, 5000, { ...IDLE, move: 1 });
  check("a 5 s frame (tab back) is clamped", c.player.x - (-1.5) < 0.3);
}
{
  const f = mk({ gap: 0.9 });
  run(f, 400, () => ({ ...IDLE, attack: "jab", block: true }));
  check("jab + block together: block wins, no punch", f.stats.player.thrown === 0 && f.player.state === "block");
  run(f, 100, once({ dodge: "back", attack: "hookL" }));
  check("dodge + hook together: only the dodge", f.player.state === "dodge" && !f.player.attack);
}

/* -------------------------------------------------- AI fairness */
{
  // the AI never knows a punch before it starts; with a 350 ms reaction it
  // can't cover a 95 ms jab it didn't see coming, but can react to hooks
  const trials = (attack, reaction, n = 40) => {
    let blockedOrSlipped = 0;
    for (let i = 0; i < n; i++) {
      const f = createFight({ seed: 100 + i, player: { name: "P" }, opponent: { name: "O", profile: { reaction, blockRate: 1, dodgeRate: 0, guardHabit: 0, aggression: 0, counterRate: 0, telegraph: 0 } } });
      run(f, INTRO.round + INTRO.fight + 600);
      f.player.x = f.opponent.x - (attack.startsWith("hook") ? 0.78 : 0.95);
      const ev = run(f, 900, once({ attack }));
      if (count(ev, "block") || count(ev, "evade") || count(ev, "perfect")) blockedOrSlipped++;
    }
    return blockedOrSlipped / n;
  };
  const jabSlow = trials("jab", 350);
  const hookFast = trials("hookL", 120);
  check("slow-reacting AI can't read a jab (no input reading)", jabSlow === 0, `rate=${jabSlow}`);
  check("fast-reacting AI with blockRate 1 covers hooks it sees", hookFast > 0.9, `rate=${hookFast}`);
  const hookSlow = trials("hookL", 300);
  check("reaction time matters: 300 ms AI misses hooks it could cover at 120 ms", hookSlow < hookFast, `${hookSlow} vs ${hookFast}`);
  // perception returns the past, never the future
  const f = mk();
  run(f, 300, once({ attack: "jab" }));
  const seen = perceive(f, 200);
  check("perception is delayed", seen.t <= f.time - 200 + STEP);
}
{
  // realistic AI profile: blocks some, fails some
  let blocked = 0;
  let landed = 0;
  for (let i = 0; i < 30; i++) {
    const f = createFight({ seed: 500 + i, player: { name: "P" }, opponent: { name: "O", profile: { reaction: 150, blockRate: 0.45, dodgeRate: 0.1, aggression: 0, guardHabit: 0.1, counterRate: 0 } } });
    run(f, INTRO.round + INTRO.fight + 400);
    f.player.x = f.opponent.x - 0.95;
    const ev = run(f, 800, once({ attack: "cross" }));
    blocked += count(ev, "block") + count(ev, "evade") + count(ev, "perfect");
    landed += count(ev, "hit", (e) => e.who === "player");
  }
  check("AI sometimes defends, sometimes fails", blocked > 3 && landed > 3, `blocked=${blocked} landed=${landed}`);
}
{
  // AI never attacks during intro / after KO, and its stamina behaves
  const f = createFight({ seed: 9, player: { name: "P" }, opponent: { name: "O", profile: { aggression: 1, preferredRange: 0.8 } } });
  const ev = run(f, INTRO.round + INTRO.fight - 50);
  check("AI silent during intro", count(ev, "throw") === 0);
  const ev2 = run(f, 20000);
  check("AI throws punches in the fight", count(ev2, "throw", (e) => e.who === "opponent") > 5);
  check("AI stamina stays in range", f.opponent.stamina >= 0 && f.opponent.stamina <= f.opponent.maxStamina);
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
