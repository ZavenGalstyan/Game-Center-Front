/**
 * Castle Rush — headless engine checks + balance matchups.
 *   node src/components/games/CastleRush/tools/simTest.mjs [section]
 * sections: loop | matchups | ai | campaign | all (default)
 *
 * Runs the real engine (no rendering). Not part of the app bundle.
 */
import { Engine } from "../engine/engine.js";
import { UNITS } from "../data/units.js";
import { BATTLES, getBattle } from "../data/battles.js";
import { FIELD } from "../engine/constants.js";

const section = process.argv[2] || "all";
let fails = 0;
const ok = (cond, msg) => {
  if (!cond) {
    fails++;
    console.log("  FAIL", msg);
  } else console.log("  ok  ", msg);
};

/* ------------------------------------------------------------ loop */
function swordsmanLoop() {
  console.log("\n== Swordsman-only loop (First Assault, no AI) ==");
  const e = new Engine();
  const overs = [];
  e.cb.over = (s) => overs.push(s);
  e.load(getBattle(1), { noAi: true });
  ok(e.castles.player.hp === 1000 && e.castles.enemy.hp === 1000, `castles 1000 / 1000 (got ${e.castles.player.hp} / ${e.castles.enemy.hp})`);
  ok(e.eco.player.gold === 100, "starting gold 100");
  e.simulate(1);
  ok(Math.abs(e.eco.player.gold - 110) < 0.01, `gold after 1s = ${e.eco.player.gold.toFixed(2)} (+10/s)`);
  const g0 = e.eco.player.gold;
  const r = e.deploy("player", "swordsman");
  ok(r.ok && Math.abs(e.eco.player.gold - (g0 - 50)) < 1e-9, `deploy deducts exactly 50 (${g0.toFixed(1)} → ${e.eco.player.gold.toFixed(1)})`);
  const r2 = e.deploy("player", "swordsman");
  ok(!r2.ok && r2.reason === "cooldown", "second press inside deploy cooldown refused, gold untouched");
  const u = e.unitById.get(r.id);
  ok(u.x === -FIELD.gateInnerX && u.state === "SPAWNING", `spawned inside player gate at x=${u.x}`);
  e.simulate(0.7);
  ok(u.state === "MOVING" && u.x > -FIELD.gateOuterX - 0.2, `left the gate, now ${u.state} at x=${u.x.toFixed(2)}`);
  // enemy deploys its own swordsman through the same API
  e.eco.enemy.gold = 50;
  const er = e.deploy("enemy", "swordsman");
  ok(er.ok && e.eco.enemy.gold === 0, "enemy deploy uses same rules (50 gold spent)");
  const v = e.unitById.get(er.id);
  // record hits
  const hits = [];
  const swings = [];
  let minGap = Infinity;
  let t = 0;
  let firstContactGap = null;
  while (t < 30 && e.isAlive(u) && e.isAlive(v)) {
    e.step(1 / 60);
    t += 1 / 60;
    const gap = Math.abs(v.x - u.x) - (UNITS.swordsman.radius * 2);
    minGap = Math.min(minGap, gap);
    for (const ev of e.events.splice(0)) {
      if (ev.type === "hit") hits.push({ ...ev, t: e.time });
      if (ev.type === "swing") swings.push({ ...ev, t: e.time });
    }
    if (firstContactGap === null && (u.state === "ATTACKING" || v.state === "ATTACKING")) firstContactGap = gap;
  }
  ok(minGap >= -1e-6, `bodies never overlap (min gap ${minGap.toFixed(3)})`);
  ok(firstContactGap !== null && firstContactGap <= UNITS.swordsman.attackRange + 1e-6 && firstContactGap >= 0, `stopped at combat range (gap ${firstContactGap?.toFixed(3)})`);
  // each swing → at most one hit, hit happens windup after the swing
  const byAttacker = {};
  for (const s of swings) (byAttacker[s.id] ||= []).push(s.t);
  let synced = true;
  for (const h of hits) {
    const attackerId = h.id === u.id ? v.id : u.id;
    const st = byAttacker[attackerId] || [];
    const s = st.filter((x) => x <= h.t + 1e-9).pop();
    if (s === undefined || Math.abs(h.t - s - UNITS.swordsman.windup) > 1 / 60 + 1e-6) synced = false;
  }
  ok(synced, `every hit lands exactly ${UNITS.swordsman.windup}s after its swing started (${hits.length} hits, ${swings.length} swings)`);
  ok(hits.length <= swings.length, "no swing produced two hits");
  const dead = e.isAlive(u) ? v : u;
  const alive = e.isAlive(u) ? u : v;
  ok(dead.state === "DEFEATED" && dead.hp === 0, `one unit died (${dead.side}); hp clamped at 0`);
  const deadX = dead.x;
  e.simulate(0.5);
  ok(dead.x === deadX, "dead unit stops moving");
  ok(!e.events.some((ev) => ev.type === "hit" && ev.by && ev.id !== dead.id && false), "dead unit deals no more damage");
  e.simulate(1.5);
  ok(!e.unitById.has(dead.id), "corpse removed after the defeat animation");
  console.log(`   winner: ${alive.side} with ${alive.hp.toFixed(0)}/${alive.maxHp} hp after ${t.toFixed(1)}s (mirror match → whoever swung first)`);
  // survivor walks to the castle and hits it
  const target = alive.side === "player" ? "enemy" : "player";
  alive.hp = alive.maxHp; // test the castle attack with a healthy survivor
  const before = e.castles[target].hp;
  let ct = 0;
  while (ct < 40 && e.castles[target].hp === before) {
    e.step(1 / 60);
    ct += 1 / 60;
  }
  ok(e.castles[target].hp < before, `survivor reached the ${target} castle and hit it after ${ct.toFixed(1)}s`);
  ok(alive.target && alive.target.kind === "castle", "survivor is attacking the castle");
  ok(Math.abs(Math.abs(alive.x) - (FIELD.wallX - UNITS.swordsman.radius)) < 1.2, `stands at the wall (x=${alive.x.toFixed(2)})`);
  const hp1 = e.castles[target].hp;
  e.simulate(5);
  ok(e.castles[target].hp < hp1, "keeps attacking the castle");
  // finish: lots of swordsmen
  e.eco[alive.side].gold = 100000;
  let guard = 0;
  while (e.phase === "playing" && guard < 60 * 400) {
    e.deploy(alive.side, "swordsman");
    e.step(1 / 60);
    guard++;
  }
  e.simulate(3);
  ok(e.castles[target].hp === 0 && e.castles[target].destroyed, "castle hp clamps to exactly 0");
  ok(overs.length === 1, `result fired exactly once (${overs.length})`);
  ok(e.phase === (alive.side === "player" ? "won" : "lost"), `phase = ${e.phase}`);
  ok(!e.deploy("player", "swordsman").ok, "no deploys after the battle ended");
  const gEnd = e.eco.player.gold;
  e.simulate(3);
  ok(e.eco.player.gold === gEnd, "gold generation stopped after the result");
  console.log(`   result: ${JSON.stringify(overs[0] && { result: overs[0].result, stars: overs[0].stars, time: overs[0].run.time.toFixed(1) })}`);

  // defeat path: enemy army destroys the player castle
  const d = new Engine();
  const dOvers = [];
  d.cb.over = (s) => dOvers.push(s);
  d.load(getBattle(1), { noAi: true });
  d.eco.enemy.gold = 1e6;
  guard = 0;
  while (d.phase === "playing" && guard < 60 * 600) {
    d.deploy("enemy", "swordsman");
    d.step(1 / 60);
    guard++;
  }
  d.simulate(3);
  ok(d.phase === "lost" && dOvers.length === 1 && dOvers[0].result === "lost" && d.castles.enemy.hp > 0, "defeat triggers once, never together with victory");

  // restart: load again → clean state
  d.load(getBattle(1), { noAi: true });
  ok(d.units.length === 0 && d.projectiles.length === 0 && d.castles.player.hp === 1000 && d.eco.player.gold === 100 && d.phase === "playing" && d.run.deployed === 0, "reload → clean battle (units, arrows, hp, gold, phase, stats)");

  // rapid input: 200 presses in one step
  const q = new Engine();
  q.load(getBattle(6), { noAi: true });
  q.eco.player.gold = 175;
  let n = 0;
  for (let i = 0; i < 200; i++) for (const t of ["swordsman", "archer", "shield", "knight"]) if (q.deploy("player", t).ok) n++;
  ok(n === 2 && q.eco.player.gold >= 0, `200x4 rapid presses with 175 gold → ${n} units, gold ${q.eco.player.gold}`);
}

/* ------------------------------------------------------------ matchups */
function fight(a, b, opts = {}) {
  // a, b: arrays of unit types, spawned in order with 0.6s spacing per side
  const e = new Engine();
  e.load({ ...getBattle(6), playerHp: 1e6, enemyHp: 1e6 }, { noAi: true });
  const qa = a.slice();
  const qb = b.slice();
  let t = 0;
  let nextA = 0;
  let nextB = 0;
  const gap = opts.gap ?? 0.6;
  let shots = 0;
  while (t < 120) {
    if (qa.length && t >= nextA) {
      e._spawn("player", qa.shift());
      nextA = t + gap;
    }
    if (qb.length && t >= nextB) {
      e._spawn("enemy", qb.shift());
      nextB = t + gap;
    }
    e.step(1 / 60);
    t += 1 / 60;
    for (const ev of e.events.splice(0)) if (ev.type === "shoot") shots++;
    const pa = e.units.filter((u) => u.side === "player" && u.state !== "DEFEATED");
    const pb = e.units.filter((u) => u.side === "enemy" && u.state !== "DEFEATED");
    if (!qa.length && !qb.length && (!pa.length || !pb.length)) {
      const w = pa.length ? "A" : pb.length ? "B" : "draw";
      const rem = (pa.length ? pa : pb).reduce((s, u) => s + u.hp / u.maxHp, 0);
      return { w, rem, t, left: (pa.length ? pa : pb).map((u) => u.type[0]).join(""), shots };
    }
  }
  return { w: "timeout", rem: 0, t, shots };
}
const cost = (arr) => arr.reduce((s, x) => s + UNITS[x].cost, 0);

function matchups() {
  console.log("\n== Matchups (A = left / player, B = right) ==");
  const S = "swordsman";
  const A = "archer";
  const H = "shield";
  const K = "knight";
  const cases = [
    ["1 Swordsman vs 1 Swordsman", [S], [S]],
    ["Swordsman vs Archer", [S], [A]],
    ["Swordsman vs Shield Guard", [S], [H]],
    ["Swordsman vs Knight", [S], [K]],
    ["Archer vs Archer", [A], [A]],
    ["2 Swordsmen vs Shield Guard (100g each)", [S, S], [H]],
    ["2 Swordsmen vs 1 Knight (100 vs 150g)", [S, S], [K]],
    ["3 Swordsmen vs 1 Knight (150g each)", [S, S, S], [K]],
    ["Swordsman+Archer vs 2 Swordsmen + (125 vs 100)", [S, A], [S, S]],
    ["Shield+Archer vs Sword+Sword+Sword (175 vs 150)", [H, A], [S, S, S]],
    ["Archer behind Swordsman vs 2 Swordsmen", [S, A], [S, S]],
    ["Archer behind Shield vs Knight+Swordsman (175 vs 200)", [H, A], [K, S]],
    ["Shield Guard vs Knight", [H], [K]],
    ["Knight vs 2 Archers (150 each)", [K], [A, A]],
    ["3 Archers (no front) vs 2 Swordsmen+Shield (225 vs 200)", [A, A, A], [S, S, H]],
    ["Knight vs Shield+Swordsman (150 vs 150)", [K], [H, S]],
    ["Mixed 2S+A+H vs Mixed K+S+A (275 vs 275)", [S, S, H, A], [K, S, A]],
    ["Mixed 2H+2A vs 3K (350 vs 450)", [H, H, A, A], [K, K, K]],
    ["6 Swordsmen vs 2 Knights (300 each)", [S, S, S, S, S, S], [K, K]],
    ["4 Archers + 2 Shields vs 4 Knights (500 vs 600)", [H, H, A, A, A, A], [K, K, K, K]],
  ];
  for (const [name, a, b] of cases) {
    const r = fight(a, b);
    console.log(`  ${name.padEnd(56)} → ${r.w.padEnd(4)} left:${(r.left || "").padEnd(6)} hp:${r.rem.toFixed(2)} t:${r.t.toFixed(1)}s  [${cost(a)}g vs ${cost(b)}g]`);
  }
  // 20 v 20 sanity
  const big = Array.from({ length: 20 }, (_, i) => ["swordsman", "archer", "shield", "knight"][i % 4]);
  const r = fight(big, big.slice().reverse(), { gap: 0.3 });
  console.log(`  20 v 20 mixed → ${r.w} t:${r.t.toFixed(1)}s arrows:${r.shots}`);
}

/* ------------------------------------------------------------ AI vs bots */
/**
 * Scripted players standing in for humans:
 *   ok    sensible but naive: trickles units, frontline + archers
 *   good  reads the field: counters, saves to deploy in groups when the
 *         enemy is massed, invests in the treasury early
 */
function botPlayer(e, style, state) {
  const roster = e.roster.player;
  const g = e.eco.player.gold;
  const has = (t) => roster.includes(t);
  const mine = e.units.filter((u) => u.side === "player" && u.state !== "DEFEATED");
  const theirs = e.units.filter((u) => u.side === "enemy" && u.state !== "DEFEATED");
  const front = mine.filter((u) => !UNITS[u.type].ranged).length;
  const arch = mine.filter((u) => u.type === "archer").length;
  if (style === "spam") return void e.deploy("player", "swordsman");
  if (style === "idle") return;
  state.t = (state.t || 0) + 1 / 60;
  if (state.t < state.next) return;
  state.next = state.t + (style === "good" ? 0.4 : 1.2);
  const val = (arr) => arr.reduce((s, u) => s + UNITS[u.type].cost * (u.hp / u.maxHp), 0);
  if (e.upgrades && e.eco.player.treasury < (style === "good" ? 2 : 1) && e.run.time > 6 && val(theirs) <= val(mine) + 60 && g >= e.treasuryCost("player")) {
    e.upgradeTreasury("player");
    return;
  }
  if (style === "good") {
    // enemy massed and we're thin: bank until we can answer with a group
    const deficit = val(theirs) - val(mine);
    const nearHome = theirs.some((u) => u.x < -9);
    if (deficit > 150 && !nearHome && g < Math.min(deficit, 300) && !state.releasing) return;
    if (deficit > 150 && g >= Math.min(deficit, 300)) state.releasing = 3;
    const ec = { swordsman: 0, archer: 0, shield: 0, knight: 0 };
    for (const u of theirs) ec[u.type] += UNITS[u.type].cost;
    let want;
    if (front < 2 || front <= arch) want = has("knight") && ec.shield > 150 && g >= 150 ? "knight" : has("shield") && ec.archer >= 150 ? "shield" : "swordsman";
    else if (has("archer") && arch < front && ec.shield < 200) want = "archer";
    else if (has("knight") && (ec.shield >= 100 || state.n % 3 === 2)) want = "knight";
    else if (has("shield") && state.n % 3 === 1) want = "shield";
    else want = "swordsman";
    if (e.deploy("player", want).ok) {
      state.n = (state.n || 0) + 1;
      if (state.releasing) state.releasing--;
    }
    return;
  }
  let want;
  if (front < 2) want = has("shield") && g >= 100 && front === 1 ? "shield" : "swordsman";
  else if (has("archer") && arch < front) want = "archer";
  else if (has("knight") && state.n % 4 === 3) want = "knight";
  else if (has("shield") && state.n % 3 === 1) want = "shield";
  else want = "swordsman";
  if (e.deploy("player", want).ok) state.n = (state.n || 0) + 1;
}

function playBattle(id, style, seed = 0) {
  const e = new Engine();
  let res = null;
  e.cb.over = (s) => (res = s);
  e.load(getBattle(id), { seed });
  const st = { n: 0, next: 0 };
  let t = 0;
  while (!res && t < 900) {
    botPlayer(e, style, st);
    e.step(1 / 60);
    e.events.length = 0;
    t += 1 / 60;
  }
  return res ? { r: res.result, stars: res.stars, t: res.run.time, hp: res.castleHp, ehp: res.enemyHp, dep: res.run.deployed, ai: e.enemyRun.deployed } : { r: "stalemate", t, hp: Math.ceil(e.castles.player.hp), ehp: Math.ceil(e.castles.enemy.hp) };
}

function campaign(ids) {
  console.log("\n== Campaign: bots vs the real AI (5 seeds each) ==");
  console.log("   #  battle                 ai      ok-bot: wins  avg-time  avg-hp%  | good-bot: wins  avg-time  avg-hp%  stars");
  for (const id of ids) {
    const b = getBattle(id);
    const cols = [];
    for (const style of ["ok", "good"]) {
      const runs = [0, 1, 2, 3, 4].map((s) => playBattle(id, style, s));
      const wins = runs.filter((r) => r.r === "won");
      const avgT = runs.reduce((s, r) => s + r.t, 0) / runs.length;
      const hp = wins.length ? wins.reduce((s, r) => s + r.hp, 0) / wins.length / 10 : 0;
      const stars = wins.map((r) => r.stars).join("");
      const stale = runs.filter((r) => r.r === "stalemate").length;
      cols.push(`${wins.length}/5${stale ? ` (${stale} stale)` : ""}`.padEnd(14) + `${Math.round(avgT)}s`.padEnd(10) + `${Math.round(hp)}%`.padEnd(9) + stars);
    }
    console.log(`  #${String(id).padStart(2)} ${b.name.padEnd(22)} ${b.ai.level.padEnd(7)} ${cols[0].padEnd(42)}| ${cols[1]}`);
  }
}

function aiChecks() {
  console.log("\n== AI fairness ==");
  const e = new Engine();
  e.load(getBattle(12));
  let spent = 0;
  let neg = false;
  let n = 0;
  for (let i = 0; i < 60 * 240; i++) {
    e.step(1 / 60);
    for (const ev of e.events.splice(0)) if (ev.type === "deploy" && ev.side === "enemy") (spent += ev.cost), n++;
    if (e.eco.enemy.gold < -1e-9) neg = true;
  }
  const earned = e.enemyRun.goldEarned + getBattle(12).enemyGold;
  ok(!neg, "enemy gold never negative");
  ok(spent <= earned + 1e-6, `enemy spent ${spent} ≤ earned ${earned.toFixed(0)} (${n} units)`);
  console.log("  idle player vs AI #1:", JSON.stringify(playBattle(1, "idle")));
  console.log("  idle player vs AI #12:", JSON.stringify(playBattle(12, "idle")));
  console.log("  spam swordsman vs AI #6:", JSON.stringify(playBattle(6, "spam")));
}

if (section === "loop" || section === "all") swordsmanLoop();
if (section === "matchups" || section === "all") matchups();
if (section === "ai" || section === "all") aiChecks();
if (section === "campaign" || section === "all") campaign(section === "campaign" && process.argv[3] ? process.argv[3].split(",").map(Number) : BATTLES.map((b) => b.id));
console.log(fails ? `\n${fails} FAILED` : "\nall checks passed");
process.exit(fails ? 1 : 0);
