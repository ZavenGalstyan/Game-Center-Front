/**
 * Train Commander — headless engine checks + campaign balance.
 *   node src/components/games/TrainCommander/tools/simTest.mjs [section]
 * sections: loop | combat | campaign | stress | all (default)
 *
 * Runs the real engine (no rendering). Not part of the app bundle.
 */
import { Engine } from "../engine/engine.js";
import { ROUTES, getRoute } from "../data/routes.js";
import { MODULES, EMERGENCY } from "../data/modules.js";
import { ENEMIES } from "../data/enemies.js";
import { HALF_W } from "../engine/constants.js";
import { sanitize } from "../utils/storage.js";

const NODE = typeof process !== "undefined" && process.argv;
const section = (NODE && process.argv[2]) || "all";
let fails = 0;
const ok = (cond, msg) => {
  if (!cond) {
    fails++;
    console.log("  FAIL", msg);
  } else console.log("  ok  ", msg);
};
const drain = (e) => e.events.splice(0, e.events.length);

/* ------------------------------------------------------------ bot */
export function bot(e, style = "smart") {
  if (!e.canAct()) return;
  const cars = e.cars;
  const has = (t) => e.modules.includes(t);
  const counts = { raider: 0, scout: 0, armored: 0, ranged: 0, vehicle: 0 };
  for (const en of e.enemies) if (!en.boss && en.state !== "DYING") counts[en.type]++;
  // emergency repair: locomotive first
  const loco = cars[0];
  if (loco.hp / loco.maxHp < 0.55 && e.emergencyCd <= 0 && e.scrap >= EMERGENCY.cost) e.emergencyRepair(0);
  const wagons = cars.slice(1);
  // bring an armed, destroyed wagon back online
  if (style === "smart" && loco.hp / loco.maxHp > 0.6 && e.emergencyCd <= 0 && e.scrap >= EMERGENCY.cost + 30) {
    const dead = wagons.find((c) => c.disabled && c.module && c.module.type !== "repair");
    if (dead) e.emergencyRepair(dead.index);
  }
  // desired layout by wagon count
  const plan = [];
  const n = wagons.length;
  for (let i = 0; i < n; i++) plan.push("gunner");
  if (has("cannon")) plan[0] = "cannon";
  if (has("lancer") && n >= 3) plan[2] = "lancer";
  if (has("repair") && n >= 4) plan[n - 1] = "repair";
  if (has("cannon") && n >= 5) plan[3] = "cannon";
  if (style === "gunners") plan.fill("gunner");
  // build missing: front first, then the rear, then fill the middle
  const order = [0, n - 1];
  for (let i = 1; i < n - 1; i++) order.push(i);
  for (const i of style === "smart" ? order : wagons.map((_, k) => k)) {
    const c = wagons[i];
    if (!c.module) {
      const t = has(plan[i]) ? plan[i] : "gunner";
      if (e.scrap >= MODULES[t].cost) e.buildModule(c.index, t);
    }
  }
  if (wagons.some((c) => !c.module)) return; // save for missing builds first
  // upgrade the cheapest upgradable module
  let best = null;
  for (const c of wagons) {
    const m = c.module;
    if (!m || m.level >= 3 || c.disabled) continue;
    const cost = MODULES[m.type].upgradeCost[m.level - 1];
    if (!best || cost < best.cost) best = { c, cost };
  }
  if (best && e.scrap >= best.cost + (loco.hp < loco.maxHp * 0.7 ? EMERGENCY.cost : 0)) e.upgradeModule(best.c.index);
}

function playRoute(id, style = "smart", maxT = 900) {
  const e = new Engine();
  let summary = null;
  e.cb.over = (s) => (summary = s);
  e.load(getRoute(id));
  let t = 0;
  let minLoco = 1;
  let lowScrapT = 0;
  const by = {};
  while (!summary && t < maxT) {
    bot(e, style);
    e.simulate(0.25);
    for (const ev of drain(e)) if (ev.type === "carHit" && ev.car === 0) by[ev.by] = (by[ev.by] || 0) + ev.dmg;
    if (e.checkpoint && e.checkpoint.arrived) e.depart();
    t += 0.25;
    minLoco = Math.min(minLoco, e.cars[0].hp / e.cars[0].maxHp);
    if (e.scrap < 40) lowScrapT += 0.25;
  }
  return { id, summary, t, minLoco, e, lowScrapT, by };
}

/* ------------------------------------------------------------ loop */
function firstPlayable() {
  console.log("\n== First playable: route 1 mechanics ==");
  const e = new Engine();
  const overs = [];
  e.cb.over = (s) => overs.push(s);
  e.load(getRoute(1));
  ok(e.cars.length === 4 && e.cars[0].kind === "loco", "locomotive + 3 wagons");
  const START = getRoute(1).startScrap;
  const GC = MODULES.gunner.cost;
  ok(e.scrap === START, `starting Scrap ${START} (got ${e.scrap})`);
  const d0 = e.d;
  e.simulate(1);
  const SP = getRoute(1).speed;
  ok(Math.abs(e.d - d0 - SP) < 0.01, `train travels ${SP} u in 1 s (got ${(e.d - d0).toFixed(3)})`);
  ok(e.progress() > 0, `route progress > 0 (${(e.progress() * 100).toFixed(2)}%)`);
  // build
  const r1 = e.buildModule(1, "gunner");
  ok(r1.ok && e.scrap === START - GC, `Gunner deducts exactly ${GC} (${e.scrap})`);
  const r2 = e.buildModule(1, "gunner");
  ok(!r2.ok && r2.reason === "occupied" && e.scrap === START - GC, "rapid second build on same wagon refused, Scrap untouched");
  e.scrap = 20;
  const r3 = e.buildModule(2, "gunner");
  ok(!r3.ok && r3.reason === "scrap" && e.scrap === 20, "unaffordable build refused, Scrap never negative");
  ok(!e.buildModule(0, "gunner").ok, "locomotive has no module slot");
  ok(!e.buildModule(2, "cannon").ok, "locked module refused");
  // force a raider at the right side
  const en = e._spawnEnemy("raider", "right", "mid");
  ok(en.z > 20, `raider spawns out at z=${en.z.toFixed(1)}`);
  drain(e);
  let fired = 0;
  let impacts = 0;
  let kills = 0;
  let scrapEv = 0;
  let firstFireT = -1;
  let yawOk = false;
  for (let i = 0; i < 60 * 12 && en.state !== "DYING"; i++) {
    e.step(1 / 60);
    for (const ev of drain(e)) {
      if (ev.type === "fire") {
        fired++;
        if (firstFireT < 0) {
          firstFireT = e.time;
          const m = e.cars[1].module;
          const want = Math.atan2(-en.z, en.x - e.cars[1].x);
          yawOk = Math.abs(m.yaw - want) < 0.2;
        }
      }
      if (ev.type === "impact") impacts++;
      if (ev.type === "kill") kills++;
      if (ev.type === "scrap") scrapEv += ev.amount;
    }
  }
  ok(fired > 0 && yawOk, `gunner aimed (yaw within 0.2 rad) and fired ${fired} shots`);
  ok(impacts > 0 && en.state === "DYING", `${impacts} impacts killed the raider`);
  const s0 = e.scrap;
  for (let i = 0; i < 120; i++) {
    e.step(1 / 60);
    for (const ev of drain(e)) if (ev.type === "kill") kills++;
  }
  const RW = ENEMIES.raider.reward;
  ok(kills === 1 && scrapEv === RW && e.scrap === s0, `killed once, rewarded ${RW} once (kills=${kills}, scrap+${scrapEv})`);
  ok(!e.enemyById.has(en.id) && !e.enemies.includes(en), "wreck removed after its defeat effect");
  // a dead target: projectile fizzles
  const en2 = e._spawnEnemy("raider", null, null, { x: e.cars[1].x + 3, z: 6 });
  let p = null;
  for (let i = 0; i < 120 && !p; i++) {
    e.step(1 / 60);
    p = e.projectiles.find((q) => q.target === en2.id);
  }
  if (p) {
    e._kill(en2, "test");
    let fz = 0;
    let im = 0;
    for (let i = 0; i < 60; i++) {
      e.step(1 / 60);
      for (const ev of drain(e)) {
        if (ev.type === "fizzle") fz++;
        if (ev.type === "impact" && ev.enemy === en2.id) im++;
      }
    }
    ok(fz >= 1 && im === 0, `projectile at a dead target fizzles (fizzles=${fz}, impacts=${im})`);
  } else ok(false, "no projectile launched at second raider");

  // enemy attacks a wagon: damage only at impact frames
  console.log("\n== Enemy attacking the train ==");
  const e2 = new Engine();
  e2.load(getRoute(1));
  e2.timeline = [];
  const rd = e2._spawnEnemy("raider", null, null, { x: e2.cars[2].x, z: 8 });
  drain(e2);
  let swings = 0;
  let hits = 0;
  let dmgOutsideImpact = 0;
  let lastHp = e2.cars.map((c) => c.hp);
  for (let i = 0; i < 60 * 15; i++) {
    e2.step(1 / 60);
    const ev = drain(e2);
    const hitNow = ev.filter((x) => x.type === "carHit");
    swings += ev.filter((x) => x.type === "enemySwing").length;
    hits += hitNow.length;
    e2.cars.forEach((c, k) => {
      if (c.hp < lastHp[k] && !hitNow.some((h) => h.car === k)) dmgOutsideImpact++;
    });
    lastHp = e2.cars.map((c) => c.hp);
  }
  ok(swings > 3 && hits > 3 && hits <= swings, `raider swung ${swings}×, landed ${hits}×`);
  ok(dmgOutsideImpact === 0, "no HP lost outside impact events");
  ok(Math.abs(rd.z) >= HALF_W + rd.radius - 1e-6, `raider never inside the train (|z|=${Math.abs(rd.z).toFixed(2)})`);
  ok(Math.abs(rd.vx) < 0.2, `pacing beside the train: relative vx≈0 (${rd.vx.toFixed(3)}), ground speed ${rd.gvx.toFixed(2)}`);

  // locomotive destroyed → defeat once
  console.log("\n== Defeat ==");
  const e3 = new Engine();
  const o3 = [];
  e3.cb.over = (s) => o3.push(s);
  e3.load(getRoute(1));
  let defeats = 0;
  e3._damageCar(e3.cars[0], 9999, "test");
  e3._damageCar(e3.cars[0], 9999, "test");
  for (let i = 0; i < 400; i++) {
    e3.step(1 / 60);
    for (const ev of drain(e3)) if (ev.type === "defeat") defeats++;
  }
  ok(defeats === 1 && o3.length === 1 && o3[0].result === "lost", `defeat fires once (events=${defeats}, over=${o3.length})`);
  ok(e3.cars[0].hp === 0, "locomotive HP clamped at 0");
  ok(!e3.buildModule(1, "gunner").ok, "no building after defeat");
  const sc = e3.scrap;
  e3._gain(0, "x");
  ok(e3._damageEnemy(e3._spawnEnemy("raider", "left", "mid"), 999, "t") === 0 && e3.scrap === sc, "no kills/rewards after the route ended");

  // restart = reload clears everything
  console.log("\n== Restart ==");
  const e4 = new Engine();
  e4.load(getRoute(1));
  e4.buildModule(1, "gunner");
  e4.simulate(60);
  const hadStuff = e4.enemies.length + e4.schedule.length + e4.projectiles.length;
  e4.load(getRoute(1));
  ok(e4.enemies.length === 0 && e4.projectiles.length === 0 && e4.schedule.length === 0 && e4.markers.length === 0, `reload clears enemies/projectiles/schedule (had ${hadStuff})`);
  ok(e4.d === 0 && e4.scrap === getRoute(1).startScrap && e4.cars.every((c) => c.hp === c.maxHp && !c.module), "distance, Scrap, HP, modules reset");

  // speed: 2x = same state in half the real time
  console.log("\n== Game speed ==");
  const a = new Engine();
  const b = new Engine();
  a.load(getRoute(1));
  b.load(getRoute(1));
  b.setSpeed(2);
  for (let i = 0; i < 600; i++) a.frame(1 / 60);
  for (let i = 0; i < 300; i++) b.frame(1 / 60);
  ok(Math.abs(a.d - b.d) < 1e-6 && a.enemies.length === b.enemies.length, `2x reaches identical state in half the frames (d ${a.d.toFixed(3)} vs ${b.d.toFixed(3)})`);
  const c = new Engine();
  c.load(getRoute(1));
  c.frame(20);
  ok(c.d <= getRoute(1).speed * 0.1 + 1e-6, `a 20 s frame is clamped to 0.1 s (moved ${c.d.toFixed(3)} u)`);
  c.setPaused(true);
  const dp = c.d;
  c.frame(0.05);
  ok(c.d === dp, "paused engine does not advance");

  c.setPaused(false);
  c.setHidden(true);
  const dh = c.d;
  for (let i = 0; i < 60; i++) c.frame(0.5);
  ok(c.d === dh, "hidden tab: no simulation while hidden");
  c.setHidden(false);
  c.frame(25);
  ok(c.d - dh <= getRoute(1).speed * 0.1 + 1e-6, `returning from a hidden tab advances at most one clamped step (${(c.d - dh).toFixed(2)} u)`);

  // save validation
  console.log("\n== Save sanitising ==");
  const def = sanitize(null);
  ok(def.unlockedRoute === 1 && def.version === 1, "missing save → defaults");
  const bad = sanitize({ unlockedRoute: "x", routeStars: { 1: 9, 2: -1, 99: 3, 3: "a" }, settings: { graphics: "ultra", speed: 5, sound: "yes" }, statistics: { enemiesDefeated: -5, distance: 1e3 }, selectedCosmetic: "royal", lastRoute: 77 });
  ok(bad.routeStars[1] === 3 && !bad.routeStars[2] && !bad.routeStars[99] && !bad.routeStars[3], "stars clamped 0–3, unknown routes dropped");
  ok(bad.unlockedRoute === 2, `unlocked route follows proven clears (${bad.unlockedRoute})`);
  ok(bad.settings.graphics === "medium" && bad.settings.speed === 1 && bad.settings.sound === true, "invalid settings fall back field by field");
  ok(bad.statistics.enemiesDefeated === 0 && bad.statistics.distance === 1000, "negative stats reset, valid kept");
  ok(bad.selectedCosmetic === "classic" && bad.lastRoute === 1, "locked livery / unknown last route rejected");
  const good = sanitize({ version: 1, unlockedRoute: 7, routeStars: { 1: 3, 2: 2, 3: 1, 4: 2, 5: 3, 6: 2 }, selectedCosmetic: "forest", settings: { graphics: "high" } });
  ok(good.unlockedRoute === 7 && good.selectedCosmetic === "forest" && good.settings.graphics === "high" && good.unlockedModules.length === 4, "valid save preserved");

  // upgrade / emergency
  console.log("\n== Upgrade / repair ==");
  const u = new Engine();
  u.load(getRoute(4));
  u.scrap = 1000;
  u.buildModule(1, "cannon");
  const s1 = u.scrap;
  const UC = MODULES.cannon.upgradeCost[0];
  ok(u.upgradeModule(1).ok && u.scrap === s1 - UC && u.cars[1].module.level === 2, `upgrade L2 costs ${UC}`);
  ok(u.upgradeModule(1).ok && u.cars[1].module.level === 3, "upgrade L3");
  const s3 = u.scrap;
  ok(!u.upgradeModule(1).ok && u.scrap === s3, "no upgrade past max level, no charge");
  u.cars[2].hp = 0;
  u.cars[2].disabled = true;
  ok(u.emergencyRepair(2).ok && u.cars[2].hp === 220 * EMERGENCY.share && !u.cars[2].disabled, "emergency repair heals 40% and restores a disabled wagon");
  ok(!u.emergencyRepair(2).ok, "emergency repair on cooldown");
  u.buildModule(3, "repair");
  u.cars[2].hp = 200;
  u.cars[4].hp = 100;
  u.timeline = [];
  u.simulate(40);
  ok(u.cars.every((c) => c.hp <= c.maxHp), "repair never exceeds max HP");
  ok(u.cars[4].hp === 220 && u.cars[2].hp === 220, `repair wagon welded both neighbours to full (${u.cars[2].hp}, ${u.cars[4].hp})`);

  // splash once
  console.log("\n== Cannon splash ==");
  const s = new Engine();
  s.load(getRoute(4));
  s.timeline = [];
  const group = [0, 1, 2].map((k) => s._spawnEnemy("armored", null, null, { x: 0 + k * 0.5, z: 7 + k * 0.3 }));
  group.forEach((g) => {
    g.def = { ...g.def, speed: 0, accel: 0 };
  });
  drain(s);
  s._launch({ kind: "shell", owner: 1, x: 0, y: 2.4, z: 0, tx: 0.5, ty: 0.3, tz: 7.3, flight: 0.5, damage: 40, splash: 2.2, level: 1 });
  const hp0 = group.map((g) => g.hp);
  let explodes = 0;
  for (let i = 0; i < 60; i++) {
    s.step(1 / 60);
    for (const ev of drain(s)) if (ev.type === "explode") explodes++;
  }
  const lost = group.map((g, k) => hp0[k] - g.hp);
  ok(explodes === 1 && lost.every((x) => x > 0 && x <= 40 - ENEMIES.armored.armor), `one explosion, each enemy hit once (${lost.map((x) => x.toFixed(1)).join(", ")})`);
}

/* ------------------------------------------------------------ combat */
function combat() {
  console.log("\n== Module matchups (single wagon, 20 s) ==");
  const runCase = (mod, level, enemy, n, zs = 8) => {
    const e = new Engine();
    e.load(getRoute(5));
    e.timeline = [];
    e.cars.forEach((c) => (c.maxHp = c.hp = 1e6));
    e.cars[2].module = e._newModule(mod, level, e.cars[2]);
    const list = [];
    for (let k = 0; k < n; k++) list.push(e._spawnEnemy(enemy, null, null, { x: e.cars[2].x + (k % 3) * 0.8 - 0.8, z: zs + Math.floor(k / 3) * 1.2 }));
    let t = 0;
    while (t < 20 && list.some((x) => x.state !== "DYING")) {
      e.simulate(0.1);
      t += 0.1;
    }
    const dead = list.filter((x) => x.state === "DYING").length;
    return `${dead}/${n} in ${t.toFixed(1)}s`;
  };
  console.log("  gunner L1 vs 6 raiders:", runCase("gunner", 1, "raider", 6));
  console.log("  cannon L1 vs 6 raiders:", runCase("cannon", 1, "raider", 6));
  console.log("  gunner L1 vs 3 armored:", runCase("gunner", 1, "armored", 3));
  console.log("  cannon L1 vs 3 armored:", runCase("cannon", 1, "armored", 3));
  console.log("  lancer L1 vs 3 armored:", runCase("lancer", 1, "armored", 3));
  console.log("  gunner L1 vs 2 ranged (hold 10.5):", runCase("gunner", 1, "ranged", 2, 14));
  console.log("  lancer L1 vs 2 ranged:", runCase("lancer", 1, "ranged", 2, 14));
  console.log("  cannon L1 vs 1 vehicle:", runCase("cannon", 1, "vehicle", 1));
  console.log("  gunner L1 vs 1 vehicle:", runCase("gunner", 1, "vehicle", 1));
}

/* ------------------------------------------------------------ campaign */
function campaign() {
  console.log("\n== Bot campaign (smart bot / gunner-only bot) ==");
  console.log("  id  name                      smart: res  stars loco%  min%  time  kills  lowScrap |  gunners: res stars");
  for (const r of ROUTES) {
    const a = playRoute(r.id, "smart");
    const b = playRoute(r.id, "gunners");
    const sa = a.summary;
    const sb = b.summary;
    console.log(
      `  ${String(r.id).padStart(2)}  ${r.name.padEnd(25)} ${(sa ? sa.result : "TIMEOUT").padEnd(5)} ${String(sa?.stars ?? 0).padStart(3)}  ${String(Math.round((sa ? sa.locoHp / sa.locoMax : 0) * 100)).padStart(4)}  ${String(Math.round(a.minLoco * 100)).padStart(4)}  ${String(Math.round(a.t)).padStart(4)}  ${String(sa?.run.kills ?? 0).padStart(5)}  ${String(Math.round(a.lowScrapT)).padStart(7)} |  ${(sb ? sb.result : "TIMEOUT").padEnd(5)} ${sb?.stars ?? 0}`
    );
    if (sa?.result !== "won") console.log("        loco damage by:", Object.entries(a.by).map(([k, v]) => `${k} ${Math.round(v)}`).join(", "), "| at d", Math.round(a.e.d), "of", a.e.route.length);
    if (r.id === 1) ok(sa && sa.result === "won", "route 1 beatable by the bot");
  }
}

/* ------------------------------------------------------------ stress */
function stress() {
  console.log("\n== Stress: 40 enemies, 6 wagons all armed, 2x ==");
  const e = new Engine();
  e.load(getRoute(25));
  e.timeline = [];
  e.cars.forEach((c) => (c.maxHp = c.hp = 1e7));
  ["gunner", "cannon", "lancer", "repair", "cannon", "gunner"].forEach((t, i) => (e.cars[i + 1].module = e._newModule(t, 3, e.cars[i + 1])));
  const types = Object.keys(ENEMIES);
  for (let k = 0; k < 40; k++) e._spawnEnemy(types[k % types.length], k % 2 ? "left" : "right", ["front", "mid", "rear"][k % 3]);
  e.setSpeed(2);
  const t0 = performance.now();
  let maxProj = 0;
  let killed = 0;
  for (let i = 0; i < 60 * 30; i++) {
    e.frame(1 / 60);
    maxProj = Math.max(maxProj, e.projectiles.length);
    for (const ev of drain(e)) if (ev.type === "kill") killed++;
  }
  const ms = performance.now() - t0;
  ok(ms / 1800 < 2, `engine cost ${(ms / 1800).toFixed(3)} ms per frame at 2x with 40 enemies`);
  console.log(`  killed ${killed}, peak projectiles ${maxProj}, alive ${e.enemies.length}`);
  ok(e.enemies.every((x) => Number.isFinite(x.x) && Number.isFinite(x.z)), "all positions finite");
}

const MAIN = NODE && import.meta.url === `file://${process.argv[1]}`;
if (MAIN) {
  if (section === "loop" || section === "all") firstPlayable();
  if (section === "combat" || section === "all") combat();
  if (section === "campaign" || section === "all") campaign();
  if (section === "stress" || section === "all") stress();
  console.log(fails ? `\n${fails} FAILED` : "\nall checks passed");
  process.exitCode = fails ? 1 : 0;
}
