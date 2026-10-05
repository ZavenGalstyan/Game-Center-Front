/**
 * Tower Defense Mini — headless checks (node, no browser):
 *
 *   node src/components/games/TowerDefenseMini/tools/simTest.mjs [levelId]
 *
 * 1. geometry of every level (pads off the road, inside the field, apart,
 *    actually covering road; ponds clear of road/pads; gate outside, base inside)
 * 2. engine rules (transactions, damage, rewards, leaks, waves, restart, 2x)
 * 3. every level played by bots: a "smart" bot that counters the next wave
 *    and a naive "archers only" bot — the smart one must win.
 */
import { Engine, parseWave, STEP } from "../engine/engine.js";
import { LEVELS, MAP } from "../data/levels.js";
import { TOWERS, towerStats, sellValue } from "../data/towers.js";
import { ENEMIES } from "../data/enemies.js";
import { buildPath, distToPath, coverage } from "../engine/path.js";
import { play } from "./bot.mjs";

let fails = 0;
const ok = (cond, msg) => {
  if (!cond) {
    fails++;
    console.log("  FAIL", msg);
  }
};
const only = process.argv[2] ? +process.argv[2] : null;

/* ------------------------------------------------------------ geometry */
const ROAD_CLEAR = 1.6; // road half-width 0.75 + pad radius 0.8 + a sliver
function checkGeometry(L) {
  const paths = L.paths.map(buildPath);
  const end = L.paths[0][L.paths[0].length - 1];
  for (const wps of L.paths) {
    const s = wps[0];
    ok(s[0] < MAP.minX || s[0] > MAP.maxX || s[1] < MAP.minZ || s[1] > MAP.maxZ, `L${L.id} road starts outside the field`);
    const e = wps[wps.length - 1];
    ok(e[0] === end[0] && e[1] === end[1], `L${L.id} every road ends at the base`);
  }
  ok(end[0] > MAP.minX + 1.5 && end[0] < MAP.maxX - 1.5 && end[1] > MAP.minZ + 1.5 && end[1] < MAP.maxZ - 1.5, `L${L.id} base inside the field`);
  ok(L.spots.length >= 6, `L${L.id} has >= 6 pads (${L.spots.length})`);
  L.spots.forEach(([x, z], i) => {
    ok(x >= MAP.minX + 0.9 && x <= MAP.maxX - 0.9 && z >= MAP.minZ + 0.9 && z <= MAP.maxZ - 0.9, `L${L.id} pad ${i} inside the field`);
    for (const p of paths) ok(distToPath(p, x, z) >= ROAD_CLEAR, `L${L.id} pad ${i} clear of the road (${distToPath(p, x, z).toFixed(2)})`);
    const cov = paths.reduce((a, p) => a + coverage(p, x, z, 3.6), 0);
    ok(cov >= 4, `L${L.id} pad ${i} covers road with an archer (${cov.toFixed(1)})`);
    ok(Math.hypot(x - end[0], z - end[1]) >= 2.4, `L${L.id} pad ${i} not inside the base`);
    L.spots.forEach(([x2, z2], j) => {
      if (j > i) ok(Math.hypot(x - x2, z - z2) >= 1.9, `L${L.id} pads ${i}/${j} apart`);
    });
  });
  for (const [wx, wz, rx, rz] of L.water) {
    for (const p of paths) ok(distToPath(p, wx, wz) >= Math.max(rx, rz) + 1, `L${L.id} pond (${wx},${wz}) clear of road`);
    L.spots.forEach(([x, z], i) => {
      const k = ((x - wx) / (rx + 1)) ** 2 + ((z - wz) / (rz + 1)) ** 2;
      ok(k >= 1, `L${L.id} pond (${wx},${wz}) clear of pad ${i}`);
    });
    ok(Math.hypot(wx - end[0], wz - end[1]) > Math.max(rx, rz) + 2.5, `L${L.id} pond clear of base`);
  }
  for (const w of L.waves) parseWave(w);
  return paths;
}

/* ------------------------------------------------------------ helpers */
function drain(eng) {
  const ev = eng.events.slice();
  eng.events.length = 0;
  return ev;
}
function runSteps(eng, n) {
  for (let i = 0; i < n; i++) eng.step(STEP);
}
function untilPhase(eng, phases, maxSec = 400) {
  for (let i = 0; i < maxSec * 60; i++) {
    if (phases.includes(eng.phase)) return true;
    eng.step(STEP);
  }
  return false;
}

/* ------------------------------------------------------------ rules */
function rules() {
  console.log("== engine rules");
  const L1 = LEVELS[0];
  const eng = new Engine();
  let overs = 0;
  eng.cb.over = () => overs++;
  eng.load(L1);
  ok(eng.coins === L1.coins, "starting coins");
  ok(eng.lives === 20, "starting lives");
  const c0 = eng.coins;
  const r1 = eng.build(0, "archer");
  const r2 = eng.build(0, "archer"); // double click
  ok(r1.ok && !r2.ok && r2.reason === "occupied", "second build on same pad refused");
  ok(eng.coins === c0 - TOWERS.archer.levels[0].cost, "coins deducted exactly once");
  ok(eng.towers.length === 1, "exactly one tower");
  ok(!eng.build(99, "archer").ok, "bad pad refused");
  ok(!eng.build(1, "nope").ok, "bad tower type refused");
  const poor = new Engine();
  poor.load({ ...L1, coins: 10 });
  ok(!poor.build(0, "archer").ok && poor.coins === 10 && poor.towers.length === 0, "cannot build without coins");

  // upgrade
  const t = eng.towers[0];
  const before = eng.coins;
  const u1 = eng.upgrade(t.id);
  ok(u1.ok && t.level === 2 && eng.coins === before - TOWERS.archer.levels[1].cost, "upgrade charges once");
  ok(t.stats.damage === towerStats("archer", 2).damage && t.stats.range > towerStats("archer", 1).range, "upgrade changes stats");
  eng.coins = 1000;
  ok(eng.upgrade(t.id).ok && t.level === 3, "upgrade to 3");
  const c3 = eng.coins;
  ok(!eng.upgrade(t.id).ok && eng.coins === c3, "max level refused, no charge");
  // sell
  const inv = t.invested;
  const s1 = eng.sell(t.id);
  const s2 = eng.sell(t.id);
  ok(s1.ok && !s2.ok, "second sell refused");
  ok(eng.coins === c3 + sellValue(inv), `refund once = ${sellValue(inv)}`);
  ok(!eng.spots[0].tower && eng.towers.length === 0, "pad free again");
  ok(eng.build(0, "archer").ok, "rebuild on same pad");

  // wave 1 with one archer: enemies follow road, archer kills, rewards once
  eng.load(L1);
  eng.build(1, "archer");
  ok(eng.startWave() && !eng.startWave(), "wave starts once");
  let kills = 0;
  let rewardSum = 0;
  let leaks = 0;
  const seenKill = new Set();
  let maxOff = 0;
  let backwards = false;
  const lastDist = new Map();
  for (let i = 0; i < 200 * 60 && eng.phase === "wave"; i++) {
    eng.step(STEP);
    for (const e of eng.enemies) {
      if (e.state !== "walk") continue;
      const p = eng.paths[e.path];
      const off = distToPath(p, e.x, e.z);
      if (e.dist > 0.2) maxOff = Math.max(maxOff, off);
      const ld = lastDist.get(e.id);
      if (ld !== undefined && e.dist < ld) backwards = true;
      lastDist.set(e.id, e.dist);
    }
    for (const ev of drain(eng)) {
      if (ev.type === "kill") {
        ok(!seenKill.has(ev.id), "enemy killed once");
        seenKill.add(ev.id);
        kills++;
        rewardSum += ev.reward;
      }
      if (ev.type === "leak") leaks++;
      if (ev.type === "dmg") ok(ev.amount >= 0 && Number.isFinite(ev.amount), "damage finite & >= 0");
    }
    for (const e of eng.enemies) ok(e.hp >= 0 && e.hp <= e.maxHp, "hp clamped");
  }
  ok(maxOff <= 0.5, `enemies stay on the road (max off-centre ${maxOff.toFixed(2)})`);
  ok(!backwards, "enemies never walk backwards");
  ok(kills + leaks === 6, `wave 1 resolves all 6 (kills ${kills} leaks ${leaks})`);
  ok(eng.lives === 20 - leaks, "lives lost once per leak");
  ok(eng.phase === "build", "wave 1 complete → build phase");
  ok(eng.run.coinsEarned === rewardSum + 8 + 2, `rewards + wave bonus counted once (${eng.run.coinsEarned})`);

  // leak test: no towers, one wave → lives drop by exactly 6
  const e2 = new Engine();
  e2.load(L1);
  e2.startWave();
  untilPhase(e2, ["build", "lost"]);
  ok(e2.lives === 14 && e2.run.leaks === 6, `undefended wave 1 leaks 6 (lives ${e2.lives})`);

  // defeat: no towers, all waves
  const e3 = new Engine();
  let o3 = 0;
  e3.cb.over = (s) => {
    o3++;
    ok(s.result === "lost", "defeat summary");
  };
  e3.load(L1);
  for (let w = 0; w < 10 && e3.phase !== "lost"; w++) {
    e3.startWave();
    untilPhase(e3, ["build", "lost", "won"]);
  }
  ok(e3.phase === "lost" && e3.lives === 0 && o3 === 1, "undefended level is lost exactly once, lives 0");
  ok(e3.projectiles.length === 0, "no projectiles after defeat");
  const enemiesAtLoss = e3.enemies.filter((e) => e.state === "walk").map((e) => e.dist).join();
  runSteps(e3, 300);
  ok(e3.enemies.filter((e) => e.state === "walk").map((e) => e.dist).join() === enemiesAtLoss, "battle frozen after defeat");
  ok(!e3.startWave() && !e3.build(0, "archer").ok, "no actions after defeat");

  // restart = load again: clean slate, new ids
  const idsBefore = new Set(e3.enemies.map((e) => e.id));
  e3.load(L1);
  ok(e3.enemies.length === 0 && e3.projectiles.length === 0 && e3.towers.length === 0, "restart clears entities");
  ok(e3.coins === L1.coins && e3.lives === 20 && e3.waveNo === 0 && e3.phase === "build", "restart restores start state");
  e3.build(0, "archer");
  e3.startWave();
  runSteps(e3, 60 * 4);
  ok(e3.enemies.every((e) => !idsBefore.has(e.id)), "no recycled ids after restart");

  // frost: slow never stacks, expires
  const e4 = new Engine();
  e4.load(L1);
  e4.startWave();
  runSteps(e4, 60 * 2);
  const v = e4.enemies[0];
  const p = { kind: "frost", dmg: 0, slow: 0.4, slowDur: 1.6, splash: 0, armorEff: 0.5, towerType: "frost", x: v.x, y: 0.5, z: v.z, level: 1 };
  e4._hit(p, v);
  e4._hit(p, v);
  e4._hit({ ...p, slow: 0.6, slowDur: 1 }, v);
  ok(v.slow === 0.6 && Math.abs(v.slowT - 1.6) < 1e-9, "slow keeps strongest, never stacks");
  runSteps(e4, 60 * 2);
  ok(v.state !== "walk" || (v.slow === 0 && v.slowT === 0), "slow expires");

  // armour: mage ignores, archer is reduced
  const e5 = new Engine();
  e5.load({ ...L1, waves: ["1A"] });
  e5.startWave();
  runSteps(e5, 5);
  const a = e5.enemies[0];
  const dArrow = e5.damage(a, 100, 0, "archer");
  const dMagic = e5.damage(a, 100, 1, "mage");
  ok(Math.abs(dArrow - 35) < 1e-6 && Math.abs(dMagic - 100) < 1e-6, `armour math (arrow ${dArrow}, magic ${dMagic})`);
  e5.damage(a, 1e9, 1, "mage");
  ok(a.state === "dead" && a.hp === 0, "overkill clamps to 0");
  const coins = e5.coins;
  e5.damage(a, 50, 1, "mage");
  e5._kill(a);
  ok(e5.coins === coins, "dead enemy gives no second reward");

  // cannon: one blast damages each enemy once
  const e6 = new Engine();
  e6.load({ ...L1, waves: ["5W/0.01"] });
  e6.startWave();
  runSteps(e6, 60);
  const pack = e6.enemies.filter((e) => e.state === "walk");
  const hpBefore = pack.map((e) => e.hp);
  drain(e6);
  e6._explode({ kind: "cannonball", tx: pack[0].x, tz: pack[0].z, splash: 2, dmg: 5, armorEff: 0.5, towerType: "cannon", level: 1 });
  const dmgEv = drain(e6).filter((x) => x.type === "dmg");
  ok(new Set(dmgEv.map((d) => d.id)).size === dmgEv.length && dmgEv.length === pack.length, `blast hits each once (${dmgEv.length}/${pack.length})`);
  ok(pack.every((e, i) => Math.abs(hpBefore[i] - e.hp - 5) < 1e-6), "blast damage applied once each");

  // projectile at a removed target fizzles, no crash, no damage
  const e7 = new Engine();
  e7.load(L1);
  e7.build(1, "mage");
  e7.startWave();
  let fired = false;
  for (let i = 0; i < 60 * 40 && !fired; i++) {
    e7.step(STEP);
    if (e7.projectiles.length) fired = true;
  }
  const pr = e7.projectiles[0];
  const tgt = e7.enemyById.get(pr.targetId);
  e7.damage(tgt, 1e9, 1, "mage"); // dies before impact
  drain(e7);
  runSteps(e7, 120);
  const ev7 = drain(e7);
  ok(ev7.some((x) => x.type === "fizzle") && !ev7.some((x) => x.type === "hit" && x.id === tgt.id), "orphan projectile fizzles, no hit");

  // 2x equals two 1x frames (deterministic)
  const A = new Engine();
  const B = new Engine();
  for (const E of [A, B]) {
    E.load(L1);
    E.build(0, "archer");
    E.build(1, "cannon");
    E.startWave();
  }
  B.setSpeed(2);
  for (let i = 0; i < 600; i++) A.frame(1 / 60);
  for (let i = 0; i < 300; i++) B.frame(1 / 60);
  const sig = (E) => E.enemies.map((e) => `${e.id % 1000}:${e.dist.toFixed(4)}:${e.hp.toFixed(3)}`).join("|") + `#${E.coins}`;
  ok(sig(A).replace(/\d+:/g, "") === sig(B).replace(/\d+:/g, ""), "2x == 1x over the same game time");
  // huge frame is clamped
  const C = new Engine();
  C.load(L1);
  C.startWave();
  C.frame(30); // returned from a background tab
  ok(C.time <= 0.1 + 1e-9, `giant delta clamped (sim advanced ${C.time.toFixed(3)} s)`);
  C.setPaused(true);
  const tp = C.time;
  C.frame(0.05);
  ok(C.time === tp, "paused: no simulation");
  ok(overs === 0, "no stray over() callbacks");
}

/* ------------------------------------------------------------ main */
const levels = only ? LEVELS.filter((l) => l.id === only) : LEVELS;
console.log(`== geometry (${levels.length} levels)`);
for (const L of levels) checkGeometry(L);
if (!only) rules();
console.log("== bots");
for (const L of levels) {
  const s = play(L, "smart");
  const a = play(L, "archers");
  const totalHp = L.waves.reduce((acc, w) => acc + parseWave(w).spawns.reduce((x, sp) => x + ENEMIES[sp.type].hp * (L.hpScale || 1), 0), 0);
  console.log(
    `L${String(L.id).padStart(2)} W${L.world} ${L.name.padEnd(20)} smart: ${s.result.padEnd(4)} ${String(s.lives).padStart(2)}/${L.lives} ★${s.stars || 0}` +
      `   archers: ${a.result.padEnd(4)} ${String(a.lives).padStart(2)} (w${a.wave})   waves ${L.waves.length} hp ${Math.round(totalHp)}`
  );
  ok(s.result === "won", `L${L.id} winnable by the smart bot`);
}
console.log(fails ? `\n${fails} FAILURE(S)` : "\nALL OK");
process.exit(fails ? 1 : 0);
