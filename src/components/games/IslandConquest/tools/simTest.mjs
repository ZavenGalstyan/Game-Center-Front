/**
 * Island Conquest — headless rules/engine/AI test suite (Node, no browser).
 *
 *   node src/components/games/IslandConquest/tools/simTest.mjs [all|rules|ai|levels|balance]
 *
 * Runs the REAL engine (engine/engine.js + engine/ai.js) with the real level
 * data. Exits non-zero on any failure.
 */
import { Engine, resolveCombat, sendAmount } from "../engine/engine.js";
import { createAI } from "../engine/ai.js";
import { STEP, MAX_FRAME, PLAYER, NEUTRAL, isEnemy } from "../engine/constants.js";
import { LEVELS, getLevel } from "../data/levels.js";
import { validateLevels } from "../data/validate.js";
import { play } from "./balance.mjs";

let pass = 0;
let fail = 0;
const fails = [];
function ok(cond, msg) {
  if (cond) pass++;
  else {
    fail++;
    fails.push(msg);
    console.log("  FAIL", msg);
  }
}
const eq = (a, b, msg) => ok(a === b, `${msg} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`);
const section = (s) => console.log(`\n== ${s}`);

/** run the engine for `sec` seconds of game time in fixed steps */
function runFor(e, sec) {
  const n = Math.round(sec / STEP);
  for (let i = 0; i < n && e.active; i++) e.step(STEP);
}
function drain(e) {
  return e.events.splice(0, e.events.length);
}
/** load a level with its AI(s) switched off */
function quiet(level) {
  const e = new Engine();
  e.load(level);
  e.ais = [];
  return e;
}
function invariants(e, tag) {
  let bad = null;
  for (const i of e.islands) {
    if (i.troops < 0 || !Number.isInteger(i.troops)) bad = `island ${i.id} troops ${i.troops}`;
    if (![PLAYER, NEUTRAL, "red", "purple"].includes(i.owner)) bad = `island ${i.id} owner ${i.owner}`;
  }
  for (const f of e.fleets) if (f.troops < 1 || f.resolved) bad = `fleet ${f.id} bad`;
  if (bad) ok(false, `${tag}: ${bad}`);
  return !bad;
}

const mode = process.argv[2] || "all";

/* ====================================================================== rules */
if (mode === "all" || mode === "rules") {
  section("combat math");
  let c = resolveCombat(30, 20);
  ok(c.captured && c.remaining === 10, "30 vs 20 captures with 10");
  c = resolveCombat(15, 25);
  ok(!c.captured && c.remaining === 10, "15 vs 25 holds with 10");
  c = resolveCombat(20, 20);
  ok(!c.captured && c.remaining === 0, "tie holds with 0");
  c = resolveCombat(1, 0);
  ok(c.captured && c.remaining === 1, "1 vs 0 captures");
  c = resolveCombat(15, 10, 1.5);
  ok(!c.captured && c.remaining === 0, "fortress: 15 vs 10×1.5 is a tie");
  c = resolveCombat(16, 10, 1.5);
  ok(c.captured && c.remaining === 1, "fortress: 16 vs 10×1.5 captures with 1");
  c = resolveCombat(14, 10, 1.5);
  ok(!c.captured && c.remaining === 1, "fortress: 14 vs 10×1.5 leaves 1 defender");
  c = resolveCombat(30, 12, 1.25);
  ok(c.captured && c.remaining === 15, "capital: 30 vs 12×1.25 captures with 15");
  for (let a = 0; a < 80; a++)
    for (let d = 0; d < 80; d++)
      for (const m of [1, 1.25, 1.5]) {
        const r = resolveCombat(a, d, m);
        if (r.remaining < 0 || r.attackerLost < 0 || r.defenderLost < 0 || r.attackerLost > a || r.defenderLost > d) {
          ok(false, `combat sanity ${a} ${d} ${m}`);
          a = d = 999;
        }
      }
  ok(true, "combat never negative over 0..79²×3");

  section("send amounts");
  eq(sendAmount(40, 0.5), 20, "50% of 40");
  eq(sendAmount(40, 0.25), 10, "25% of 40");
  eq(sendAmount(40, 1), 40, "100% of 40");
  eq(sendAmount(3, 0.25), 1, "25% of 3 rounds up to 1");
  eq(sendAmount(1, 0.5), 1, "50% of 1");
  eq(sendAmount(0, 1), 0, "nothing from 0");

  section("level 1 setup + production");
  const L1 = getLevel(1);
  let e = quiet(L1);
  eq(e.islands.length, 3, "3 islands");
  eq(e.island("a").owner, "player", "left is player");
  eq(e.island("b").owner, "neutral", "centre is neutral");
  eq(e.island("c").owner, "red", "right is enemy");
  eq(e.island("a").troops, 20, "player 20");
  eq(e.island("b").troops, 8, "neutral 8");
  eq(e.island("c").troops, 16, "enemy 16");
  runFor(e, 10);
  eq(e.island("a").troops, 28, "medium island +1 every 1.25 s → 28 after 10 s");
  eq(e.island("c").troops, 24, "enemy produces at the same rate");
  eq(e.island("b").troops, 8, "neutral does not produce");
  runFor(e, 200);
  eq(e.island("a").troops, 60, "production stops at the cap");

  section("sending");
  e = quiet(L1);
  drain(e);
  let r = e.send(PLAYER, "a", "b", { fraction: 0.5 });
  ok(r.ok && r.amount === 10, "50% of 20 = 10");
  eq(e.island("a").troops, 10, "source deducted once");
  eq(e.fleets.length, 1, "one fleet");
  eq(drain(e).filter((x) => x.type === "launch").length, 1, "one launch event");
  // rapid clicking: many sends in the same instant
  let sent = 0;
  for (let k = 0; k < 20; k++) {
    const q = e.send(PLAYER, "a", "b", { fraction: 1 });
    if (q.ok) sent += q.amount;
  }
  eq(sent, 10, "rapid 100% sends move exactly what was there");
  eq(e.island("a").troops, 0, "no negative troops");
  eq(e.fleets.length, 2, "one extra fleet, not twenty");
  eq(e.send(PLAYER, "a", "b", { fraction: 1 }).reason, "empty", "send from empty island fails");
  eq(e.send(PLAYER, "c", "b", { fraction: 0.5 }).reason, "owner", "cannot send from an enemy island");
  eq(e.send(PLAYER, "b", "a", { fraction: 0.5 }).reason, "owner", "cannot send from a neutral island");
  eq(e.send(PLAYER, "a", "a", { fraction: 0.5 }).reason, "same", "cannot send to self");
  eq(e.send(PLAYER, "a", "zz", { fraction: 0.5 }).reason, "missing", "unknown target fails");
  e.setPaused(true);
  e.island("a").troops = 5;
  eq(e.send(PLAYER, "a", "b", { fraction: 0.5 }).reason, "paused", "no orders while paused");
  e.setPaused(false);

  section("travel, arrival, neutral capture");
  e = quiet(L1);
  r = e.send(PLAYER, "a", "b", { fraction: 0.5 });
  const fl = r.fleet;
  const eta = fl.len / fl.speed;
  ok(eta > 1.5 && eta < 4, `travel time to centre is sensible (${eta.toFixed(2)} s)`);
  runFor(e, eta - 0.1);
  eq(e.fleets.length, 1, "still at sea just before arrival");
  eq(e.island("b").owner, "neutral", "not captured early");
  runFor(e, 0.2);
  eq(e.fleets.length, 0, "fleet removed on arrival");
  eq(e.island("b").owner, "player", "10 vs 8 captures the neutral");
  eq(e.island("b").troops, 2, "2 survivors defend it");
  const capEv = drain(e).filter((x) => x.type === "capture");
  eq(capEv.length, 1, "one capture event");
  runFor(e, 0.5);
  eq(e.island("b").troops, 2, "capture grace: no production for 0.6 s");
  runFor(e, 2.0);
  ok(e.island("b").troops >= 3, "captured island starts producing");

  section("friendly reinforcement");
  const before = e.island("b").troops;
  r = e.send(PLAYER, "a", "b", { fraction: 0.5 });
  const n = r.amount;
  runFor(e, r.fleet.len / r.fleet.speed + 0.05);
  const ev = drain(e).filter((x) => x.type === "arrive");
  eq(ev.length, 1, "one arrival");
  eq(ev[0].kind, "reinforce", "arrival is a reinforcement, no combat");
  ok(e.island("b").troops >= before + n && e.island("b").troops <= before + n + 3, "reinforcement adds the troops");

  section("failed attack, then capture of the enemy");
  e = quiet(L1);
  e.island("a").troops = 20;
  e.island("c").troops = 16;
  e.island("c").rate = 0; // freeze defenders for exact maths
  r = e.send(PLAYER, "a", "c", { fraction: 0.5 });
  runFor(e, r.fleet.len / r.fleet.speed + 0.05);
  eq(e.island("c").owner, "red", "10 vs 16: enemy holds");
  eq(e.island("c").troops, 6, "defenders 16 − 10 = 6");
  e.island("a").troops = 20;
  r = e.send(PLAYER, "a", "c", { fraction: 1 });
  runFor(e, r.fleet.len / r.fleet.speed + 0.05);
  eq(e.island("c").owner, "player", "20 vs 6 captures");
  eq(e.island("c").troops, 14, "14 survivors");

  section("target changes owner while a fleet is at sea");
  e = quiet(L1);
  e.island("a").troops = 40;
  const f1 = e.send(PLAYER, "a", "b", { fraction: 0.5 }).fleet; // 20 → captures
  runFor(e, 0.4);
  const f2 = e.send(PLAYER, "a", "b", { fraction: 0.5 }).fleet; // 10, launched as an attack
  eq(f2.hostileTo, "neutral", "second fleet launched against a neutral island");
  runFor(e, 10);
  const arr = drain(e).filter((x) => x.type === "arrive");
  eq(arr.find((x) => x.fleet === f1.id).kind, "capture", "first fleet captures");
  eq(arr.find((x) => x.fleet === f2.id).kind, "reinforce", "second fleet becomes a reinforcement");

  section("enemy captures a selected source island before the order");
  e = quiet(L1);
  e.island("a").troops = 3;
  e.island("c").troops = 50;
  r = e.send("red", "c", "a", { fraction: 1 });
  runFor(e, r.fleet.len / r.fleet.speed + 0.05);
  eq(e.island("a").owner, "red", "enemy took the player's island");
  eq(e.send(PLAYER, "a", "b", { fraction: 0.5 }).reason, "owner", "stale selection cannot send");

  section("simultaneous arrivals (deterministic, exactly-once)");
  const sim = () => {
    const s = quiet(L1);
    s.island("a").troops = 60;
    s.island("c").troops = 60;
    const ids = [];
    for (let k = 0; k < 5; k++) ids.push(s.send(PLAYER, "a", "b", { count: 7 }).fleet.id);
    for (let k = 0; k < 5; k++) ids.push(s.send("red", "c", "b", { count: 7 }).fleet.id);
    const seen = new Map();
    for (let t = 0; t < 400 && s.active; t++) {
      s.step(STEP);
      for (const x of drain(s)) if (x.type === "arrive") seen.set(x.fleet, (seen.get(x.fleet) || 0) + 1);
      if (!invariants(s, "invariants during 10-fleet pile-up")) break;
    }
    return { s, seen, ids };
  };
  const A = sim();
  const B = sim();
  ok(true, "invariants held through the pile-up");
  ok(A.ids.every((id) => A.seen.get(id) === 1), "each of 10 fleets resolved exactly once");
  eq(A.s.fleets.length, 0, "no fleet left at sea");
  eq(JSON.stringify(A.s.islands.map((i) => [i.owner, i.troops])), JSON.stringify(B.s.islands.map((i) => [i.owner, i.troops])), "identical outcome on rerun");
  // conservation: 70 troops each way into 8 neutral defenders
  const own = A.s.island("b");
  ok(own.owner !== "neutral", `centre ends owned (${own.owner}, ${own.troops})`);

  section("100% send then incoming capture");
  e = quiet(L1);
  e.island("a").troops = 30;
  e.island("c").troops = 40;
  r = e.send(PLAYER, "a", "b", { fraction: 1 });
  eq(e.island("a").troops, 0, "100% leaves 0 at home");
  const er = e.send("red", "c", "a", { count: 5 });
  runFor(e, er.fleet.len / er.fleet.speed + 0.1);
  eq(e.island("a").owner, "red", "undefended home island falls");
  ok(e.island("a").troops >= 0, "never negative");

  section("victory waits for enemy fleets at sea");
  e = quiet(L1);
  e.island("c").troops = 10;
  e.island("c").rate = 0;
  e.island("b").troops = 30; // the enemy's last fleet will die on the neutral
  e.island("a").troops = 60;
  // enemy launches everything at the neutral, then we take its only island
  const ef = e.send("red", "c", "b", { count: 10 }).fleet;
  const pf = e.send(PLAYER, "a", "c", { count: 30 }).fleet;
  let gotOver = 0;
  e.cb.over = () => gotOver++;
  const tCap = pf.len / pf.speed;
  const tEnemy = ef.len / ef.speed;
  ok(tEnemy > tCap === false || true, "timings computed");
  runFor(e, tCap + 0.05);
  eq(e.island("c").owner, "player", "last enemy island captured");
  eq(e.fleets.some((f) => f.owner === "red"), tEnemy > tCap + 0.05, "enemy fleet state as expected");
  if (e.fleets.some((f) => f.owner === "red")) {
    ok(!e.ended, "no victory while an enemy fleet is still sailing");
  }
  runFor(e, 15);
  ok(e.ended && e.result === "won", "victory once the enemy has nothing left");
  eq(gotOver, 1, "over fired exactly once");
  runFor(e, 5);
  eq(gotOver, 1, "still once after more steps");

  section("defeat waits for player fleets at sea");
  e = quiet(L1);
  e.island("a").troops = 30;
  e.island("c").troops = 60;
  e.island("c").cap = 60;
  const pf2 = e.send(PLAYER, "a", "b", { count: 25 }).fleet; // still sailing
  const ef2 = e.send("red", "c", "a", { count: 50 }).fleet;
  runFor(e, Math.min(ef2.len / ef2.speed, pf2.len / pf2.speed) + 0.02);
  if (e.island("a").owner === "red" && e.fleets.some((f) => f.owner === PLAYER)) ok(!e.ended, "no defeat while the player's fleet sails");
  runFor(e, 4);
  ok(!e.ended || e.result !== "lost" || !e.alive(PLAYER), "defeat only when nothing is left");
  ok(e.island("b").owner === "player", "player fleet captured the centre: game goes on");
  eq(e.ended, false, "battle continues");

  section("frame(): clamp, pause, hidden, speed");
  e = quiet(L1);
  e.frame(30); // returning from a hidden tab after 30 s
  ok(e.run.time <= MAX_FRAME + 1e-9, `huge frame clamped (advanced ${e.run.time.toFixed(3)} s)`);
  eq(e.island("a").troops, 20, "no troop burst after a long gap");
  e.setPaused(true);
  const t0 = e.run.time;
  e.island("a").troops = 20;
  const pfx = e.send(PLAYER, "a", "b", { fraction: 0.5 });
  eq(pfx.ok, false, "paused: no orders");
  e.setPaused(false);
  const moving = e.send(PLAYER, "a", "b", { fraction: 0.5 }).fleet;
  e.setPaused(true);
  for (let k = 0; k < 60; k++) e.frame(1 / 60);
  eq(e.run.time, t0, "paused: clock frozen");
  eq(moving.d, 0, "paused: fleet frozen");
  e.setPaused(false);
  e.setHidden(true);
  for (let k = 0; k < 60; k++) e.frame(1 / 60);
  eq(e.run.time, t0, "hidden tab: clock frozen");
  e.setHidden(false);
  const t1 = e.run.time;
  for (let k = 0; k < 60; k++) e.frame(1 / 60);
  ok(Math.abs(e.run.time - t1 - 1) < 0.05, "1x: 60 frames ≈ 1 s");
  e.setSpeed(2);
  const t2 = e.run.time;
  const d2 = moving.d;
  for (let k = 0; k < 30; k++) e.frame(1 / 60);
  ok(Math.abs(e.run.time - t2 - 1) < 0.05, "2x: 30 frames ≈ 1 s of battle");
  ok(Math.abs(moving.d - d2 - moving.speed) < 0.1 || moving.resolved, "2x: fleet covered 1 s of sea");

  section("restart mid-battle");
  e = new Engine();
  e.load(L1);
  e.island("a").troops = 40;
  e.send(PLAYER, "a", "b", { fraction: 0.5 });
  e.send(PLAYER, "a", "c", { fraction: 0.5 });
  runFor(e, 1);
  e.load(L1);
  eq(e.fleets.length, 0, "old fleets gone");
  eq(e.ais.length, 1, "exactly one AI");
  eq(e.run.time, 0, "clock reset");
  eq(e.island("a").troops, 20, "troops reset");
  eq(e.ended, false, "result reset");
}

/* ====================================================================== AI */
function playMatch(level, botLevel = "hard", maxT = 900) {
  const e = new Engine();
  e.load(level);
  if (botLevel) e.ais.push(createAI(PLAYER, { level: botLevel, delay: 0.5 }, () => 0.5));
  let res = null;
  e.cb.over = (s) => (res = s);
  const stats = { sends: { player: [], red: [], purple: [] }, captures: { red: 0, purple: 0 }, neutralTaken: { red: 0, purple: 0 }, attacksOnPlayer: 0, failedSends: 0 };
  const realSend = e.send.bind(e);
  e.send = (owner, a, b, opt) => {
    const before = e.island(a)?.owner;
    const r = realSend(owner, a, b, opt);
    if (r.ok) {
      stats.sends[owner].push(r.amount);
      if (owner !== PLAYER && e.island(b).owner === PLAYER) stats.attacksOnPlayer++;
      if (before !== owner) stats.failedSends = -999; // sent from a non-owned island
    } else stats.failedSends++;
    return r;
  };
  let bad = null;
  for (let t = 0; t < maxT / STEP && !e.ended; t++) {
    e.step(STEP);
    for (const x of drain(e)) {
      if (x.type === "capture" && isEnemy(x.to)) {
        stats.captures[x.to]++;
        if (x.from === NEUTRAL) stats.neutralTaken[x.to]++;
      }
    }
    for (const i of e.islands) if (i.troops < 0) bad = `negative troops on ${i.id}`;
  }
  return { res, e, stats, bad };
}

if (mode === "all" || mode === "ai") {
  section("AI behaviour (enemy vs a passive player)");
  const L1 = getLevel(1);
  // passive player: the AI must expand and then attack
  let m = playMatch(L1, null, 240);
  ok(!m.bad, m.bad || "no negative troops");
  ok(m.stats.neutralTaken.red >= 1, "enemy captures the neutral island");
  ok(m.stats.attacksOnPlayer >= 1, "enemy attacks the player");
  ok(m.res && m.res.result === "lost", `passive player eventually loses (${m.res?.result})`);
  const tiny = m.stats.sends.red.filter((x) => x < 3).length;
  ok(tiny === 0, `enemy never sends 1–2 troop attacks (${tiny})`);
  ok(m.stats.failedSends >= 0, "AI never sends from an island it does not own");

  section("AI vs AI (bot plays the player side)");
  for (const lvl of ["easy", "normal", "hard"]) {
    const lv = { ...L1, ai: { level: lvl } };
    const r = playMatch(lv, "normal", 900);
    console.log(`   normal bot vs ${lvl}: ${r.res?.result} ${r.res?.time.toFixed(0)}s sends P${r.stats.sends.player.length} R${r.stats.sends.red.length}`);
    ok(r.res, `normal bot vs ${lvl} enemy finishes (${r.res?.result} in ${r.res?.time.toFixed(0)} s)`);
    ok(!r.bad, r.bad || `no negatives vs ${lvl}`);
  }
}

/* ====================================================================== levels */
if (mode === "all" || mode === "levels") {
  section("level validation");
  const issues = validateLevels(LEVELS);
  ok(issues.length === 0, `all ${LEVELS.length} levels valid${issues.length ? ":\n    " + issues.join("\n    ") : ""}`);
}

if (mode === "all" || mode === "balance") {
  section("balance: an expert bot plays every level (5 seeds)");
  for (const L of LEVELS) {
    const rs = [1, 2, 3, 4, 5].map((sd) => play(L, "expert", sd));
    const w = rs.filter((r) => r.result === "won");
    ok(w.length >= 4, `L${L.id} ${L.name}: expert wins ${w.length}/5`);
    ok(w.every((r) => r.time > 5), `L${L.id}: no instant results`);
  }
}



console.log(`\n${pass} passed, ${fail} failed`);
if (fail) {
  console.log(fails.map((f) => " - " + f).join("\n"));
  process.exit(1);
}
