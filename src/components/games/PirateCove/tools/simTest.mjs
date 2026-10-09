/**
 * Pirate Cove — headless test suite. Run from the repo root:
 *
 *   node src/components/games/PirateCove/tools/simTest.mjs [all|data|units|bot|torture] [adventureId]
 *
 *   data     static validation of every region + adventure (docks, markers,
 *            spawns in open water; items/foes on walkable ground; reachability)
 *   units    ship feel, cannon reload authority, once-only damage / sinking /
 *            loot / chest / dig / completion, transition locks, projectile
 *            cleanup, checkpoint restore without duplicates
 *   bot      the autopilot plays every adventure to completion through the
 *            real input path
 *   torture  repeated naval fights, restarts mid-fight, AI leash/stuck checks
 */
import { ADVENTURES, getAdventure } from "../data/adventures.js";
import { REGIONS, REGION_BY_ID } from "../data/regions.js";
import { createGame, MODE } from "../engine/game.js";
import { createBot } from "../engine/bot.js";
import { buildWorld } from "../engine/world.js";
import { SHIP_DRAFT } from "../engine/terrain.js";
import { groundAt, pushOut, PIRATE_R } from "../engine/onfoot.js";
import { caveSDF } from "../engine/cave.js";
import { createShip, stepShip } from "../engine/ship.js";
import { tryBroadside, createProjectilePool, updatePending, stepProjectiles, applyDamage, activeBalls, gunRange } from "../engine/cannons.js";
import { createEnemyShip, thinkShip } from "../engine/shipAI.js";
import { SHIP_CLASSES, playerShipStats } from "../data/ships.js";

const mode = process.argv[2] || "all";
const only = process.argv[3] ? Number(process.argv[3]) : null;
let pass = 0;
let fail = 0;
const fails = [];
function ok(cond, msg) {
  if (cond) pass++;
  else {
    fail++;
    fails.push(msg);
    if (fails.length < 80) console.log("  ✗ " + msg);
  }
}

const NOINPUT = { ship: {}, foot: {}, take: () => false, consumeLook: () => [0, 0] };

// ================================================================= data
function dataTests() {
  console.log("— data");
  for (const R of REGIONS) {
    const W = buildWorld(R, { beam: 7.2 });
    const T = W.terrain;
    for (const isl of W.islands) {
      const d = isl.dock;
      ok(T.height(d.land.x, d.land.z) > -0.2, `R${R.id} ${isl.id}: dock land end on land (${T.height(d.land.x, d.land.z).toFixed(2)})`);
      ok(T.height(d.end.x, d.end.z) < -1.5, `R${R.id} ${isl.id}: dock sea end in water (${T.height(d.end.x, d.end.z).toFixed(2)})`);
      for (const beam of [4.2, 5.4, 7.2]) {
        const W2 = beam === 7.2 ? W : null;
        const b = (W2 || buildWorld(R, { beam })).byId.get(isl.id).dock.berth;
        let worst = -99;
        const half = { 4.2: 6.5, 5.4: 9, 7.2: 12.5 }[beam];
        for (let a = -half; a <= half + 0.01; a += half / 4) {
          const fx = Math.sin(b.heading);
          const fz = Math.cos(b.heading);
          worst = Math.max(worst, T.height(b.x + fx * a, b.z + fz * a));
        }
        ok(worst < SHIP_DRAFT - 0.2, `R${R.id} ${isl.id}: berth (beam ${beam}) in open water (max ${worst.toFixed(2)})`);
      }
      // island overlap
      for (const o of W.islands) {
        if (o === isl) continue;
        ok(Math.hypot(o.I.x - isl.I.x, o.I.z - isl.I.z) > o.I.maxR + isl.I.maxR + 30, `R${R.id} ${isl.id}/${o.id}: islands apart`);
      }
      // props on land
      for (const p of isl.props) ok(p.y > -0.1 || p.t === "rowboat", `R${R.id} ${isl.id}: prop ${p.t}@${p.key} on land (${p.y.toFixed(2)})`);
      for (const [k, v] of Object.entries(isl.pois)) ok(T.height(v.x, v.z) > 0.25, `R${R.id} ${isl.id}: poi ${k} on land (${T.height(v.x, v.z).toFixed(2)})`);
      // spawn on the deck and walkable
      const land = W.landFor(isl.id);
      const sp = isl.dock.spawn;
      const g = groundAt(land, "out", sp.x, sp.z, 5);
      ok(!g.water && g.h > 0.5, `R${R.id} ${isl.id}: dock spawn stands on the deck`);
      if (isl.cave) {
        const C = isl.cave;
        ok(caveSDF(C, C.entry[0], C.entry[1]) < -1, `R${R.id} ${isl.id}: cave entry open`);
        const m = isl.caveMouth;
        const gm = groundAt(land, "out", m.x, m.z, 20);
        ok(!gm.water, `R${R.id} ${isl.id}: cave mouth on land`);
      }
    }
  }
  for (const A of ADVENTURES) {
    if (only && A.id !== only) continue;
    const R = REGION_BY_ID.get(A.region);
    const W = buildWorld(R, { beam: 7.2 });
    const T = W.terrain;
    const water = (x, z, r = 0) => {
      let m = T.height(x, z);
      if (r) for (let a = 0; a < 6.28; a += 0.8) m = Math.max(m, T.height(x + Math.cos(a) * r, z + Math.sin(a) * r));
      return m;
    };
    for (const m of A.markers || []) ok(water(m.x, m.z, 10) < -3, `A${A.id}: marker ${m.id} in open water`);
    for (const f of A.floats || []) ok(water(f.x, f.z, 3) < -2, `A${A.id}: float ${f.id} in water`);
    for (const s of A.ships || []) {
      ok(water(s.x, s.z, 14) < -2.5, `A${A.id}: ship ${s.id} spawns in open water (${water(s.x, s.z, 14).toFixed(1)})`);
      ok(Math.hypot(s.x, s.z) < R.radius - 120, `A${A.id}: ship ${s.id} well inside the sea`);
    }
    if (A.start.x != null) ok(water(A.start.x, A.start.z, 14) < -2.5 && Math.hypot(A.start.x, A.start.z) < R.radius - 90, `A${A.id}: sea start in open water inside the sea`);
    for (const st of A.steps) {
      if (st.k === "dock" || st.k === "enter" || (st.k === "reach" && st.island)) ok(W.byId.has(st.island), `A${A.id}: step island ${st.island} exists`);
      if (st.k === "enter") ok(!!W.byId.get(st.island)?.cave, `A${A.id}: ${st.island} has a cave`);
    }
    const posOk = (spec, island, what) => {
      const p = W.resolve(spec, island);
      const land = W.landFor(island);
      if (!land) return ok(false, `A${A.id}: ${what} island ${island}`);
      if (p.area !== "out") {
        const C = land.caves[p.area];
        ok(caveSDF(C, p.x - C.origin.x, p.z - C.origin.z) < -0.6, `A${A.id}: ${what} inside open cave`);
      } else {
        const g = groundAt(land, "out", p.x, p.z, 50);
        ok(!g.water && g.h > 0.1, `A${A.id}: ${what} on land (${g.h.toFixed(2)})`);
      }
      return p;
    };
    for (const it of A.land || []) posOk(it.pos, it.island, `${it.kind} ${it.id}`);
    for (const f of A.foes || []) posOk(f.pos, f.island, `foe ${f.id}`);
  }
}

// ================================================================= units
function unitTests() {
  console.log("— units");
  const R = REGION_BY_ID.get(1);
  const W = buildWorld(R);
  const env = { terrain: W.terrain, time: 0, waveAmp: 0.8, boundary: W.boundary };
  // ship feel: acceleration takes seconds, turning has inertia, stops are gradual
  const s = createShip(playerShipStats("sloop"), { team: "player", x: 0, z: -400, heading: 0 });
  let t = 0;
  let reachHalf = null;
  for (let i = 0; i < 60 * 15; i++) {
    env.time = t += 1 / 60;
    stepShip(s, { throttleDelta: 1 }, env, 1 / 60);
    if (reachHalf == null && s.speed > s.stats.maxSpeed * 0.5) reachHalf = t;
  }
  ok(reachHalf > 1.2 && reachHalf < 6, `sloop reaches half speed in a few seconds (${reachHalf?.toFixed(2)}s)`);
  ok(Math.abs(s.speed - s.stats.maxSpeed) < 0.6, `sloop reaches full speed (${s.speed.toFixed(2)})`);
  const h0 = s.heading;
  stepShip(s, { steer: 1 }, env, 1 / 60);
  ok(Math.abs(wrap(s.heading - h0)) < 0.01, "no instant rotation on the first steering frame");
  for (let i = 0; i < 60; i++) stepShip(s, { steer: 1 }, env, 1 / 60);
  const turned = Math.abs(wrap(s.heading - h0));
  ok(turned > 0.12 && turned < 0.9, `1s of full rudder turns a sensible amount (${turned.toFixed(2)} rad)`);
  for (let i = 0; i < 60 * 2; i++) stepShip(s, { steer: 0 }, env, 1 / 60);
  const av = Math.abs(s.angVel);
  ok(av < 0.08, `turn settles when the rudder is released (${av.toFixed(3)})`);
  s.throttle = 0;
  const v0 = s.speed;
  for (let i = 0; i < 60; i++) stepShip(s, { throttleDelta: 0 }, env, 1 / 60);
  ok(s.speed > v0 * 0.55 && s.speed < v0, `ship coasts down gradually (${v0.toFixed(1)} → ${s.speed.toFixed(1)})`);
  // galleon heavier than sloop
  const g = createShip(playerShipStats("galleon"), { x: 0, z: 0 });
  const sl = createShip(playerShipStats("sloop"), { x: 0, z: 0 });
  for (let i = 0; i < 120; i++) {
    stepShip(g, { throttleDelta: 1, steer: 1 }, env, 1 / 60);
    stepShip(sl, { throttleDelta: 1, steer: 1 }, env, 1 / 60);
  }
  ok(Math.abs(sl.heading) > Math.abs(g.heading), "sloop turns faster than galleon");

  // rocks: hitting one slows and damages but doesn't destroy
  const rockShip = createShip(playerShipStats("sloop"), { x: 30, z: -230, heading: 0, speed: 15, throttle: 1 });
  let impacts = 0;
  env.time = 0;
  for (let i = 0; i < 60 * 8; i++) {
    env.time += 1 / 60;
    const imp = stepShip(rockShip, { throttleDelta: 1 }, env, 1 / 60);
    if (imp) impacts++;
  }
  ok(impacts >= 1, `ramming a rock registers an impact (${impacts})`);
  ok(W.terrain.height(rockShip.x, rockShip.z) < SHIP_DRAFT + 0.4, "ship never ends up embedded in a rock");

  // cannon reload authority: spam 100 presses → exactly one broadside per reload
  const pool = createProjectilePool();
  const c = createShip(playerShipStats("sloop"), { x: 0, z: 0 });
  let fired = 0;
  for (let i = 0; i < 100; i++) if (tryBroadside(c, "left", 0.001 * i)) fired++;
  ok(fired === 1, `spamming fire bypasses nothing (${fired} broadsides)`);
  ok(tryBroadside(c, "right", 0.1), "other side has its own reload");
  ok(!tryBroadside(c, "left", c.stats.reload - 0.01), "left still reloading just before reload time");
  ok(tryBroadside(c, "left", c.stats.reload + 0.01), "left ready after reload time");
  // pending shots launch, then die (water) — no leaks
  const out = [];
  for (let i = 0; i < 60 * 8; i++) {
    const tt = i / 60;
    updatePending(c, tt, pool, out);
    stepProjectiles(pool, [c], { terrain: W.terrain, time: tt, waveAmp: 0.8 }, 1 / 60, out);
  }
  ok(out.filter((e) => e.type === "muzzle").length === c.stats.perSide * 3, "every queued cannon fires once");
  ok(activeBalls(pool) === 0, "all cannonballs cleaned up after flight");
  ok(out.filter((e) => e.type === "splash").length === c.stats.perSide * 3, "each ball ends in exactly one splash");

  // damage once per ball, sink once, loot once (heading 0 → starboard/right is −x)
  const shooter = createShip(playerShipStats("sloop"), { team: "player", x: 0, z: 0, heading: 0 });
  const target = createEnemyShip({ type: "pirateSloop", x: -45, z: 0, heading: 0, group: "t" }, {}, 0);
  const pool2 = createProjectilePool();
  const ev = [];
  let hits = 0;
  let sunkEvents = 0;
  let tt = 0;
  for (let k = 0; k < 12; k++) {
    tryBroadside(shooter, "right", tt, { dist: 45 });
    for (let i = 0; i < 60 * 3; i++) {
      tt += 1 / 60;
      updatePending(shooter, tt, pool2, ev);
      const o2 = [];
      stepProjectiles(pool2, [shooter, target], { terrain: W.terrain, time: tt, waveAmp: 0 }, 1 / 60, o2);
      for (const e of o2) {
        if (e.type !== "hit") continue;
        hits++;
        const r = applyDamage(e.ship, e.dmg, tt);
        if (r === "sunk") sunkEvents++;
      }
    }
  }
  ok(hits > 0, `broadside at 45 m hits a ship abeam (${hits} hits)`);
  ok(sunkEvents === 1, `ship sinks exactly once (${sunkEvents})`);
  ok(applyDamage(target, 50, tt) === null, "a sunk ship takes no more damage");

  // ---- full-game once-only + transition tests (adventure 1)
  const A1 = getAdventure(1);
  const game = createGame(A1, REGION_BY_ID.get(1), { ship: "sloop" });
  ok(game.mode === MODE.ISLAND && !!game.pirate, "A1 starts on foot at Palm Cove");
  // board: spam interact during the transition
  const isl = game.island;
  game.pirate.x = isl.dock.board.x;
  game.pirate.z = isl.dock.board.z;
  let boardStarts = 0;
  for (let i = 0; i < 50; i++) {
    const before = game.trans;
    game.tick(1 / 60, { ...NOINPUT, take: (k) => k === "interact" });
    if (!before && game.trans) boardStarts++;
  }
  for (let i = 0; i < 60; i++) game.tick(1 / 60, NOINPUT);
  ok(boardStarts === 1, `board triggers exactly one transition under spam (${boardStarts})`);
  ok(game.mode === MODE.SAILING && game.pirate === null, "after boarding: sailing, no pirate controller");
  ok(game.ships.filter((s) => s.team === "player").length === 1, "exactly one player ship");
  // the berth we just left stays quiet until we sail off…
  game.tick(1 / 60, NOINPUT);
  ok(!game.dockable, "no dock prompt for the berth we just cast off from");
  game.leftDock = null; // …as if we'd sailed away and come back
  // dock: spam at Palm Cove berth
  game.player.speed = 0;
  let dockStarts = 0;
  for (let i = 0; i < 60 * 2.3; i++) {
    const before = game.trans;
    game.tick(1 / 60, { ...NOINPUT, take: (k) => k === "interact" });
    if (!before && game.trans && game.trans.kind === "dock") dockStarts++;
  }
  for (let i = 0; i < 60; i++) game.tick(1 / 60, NOINPUT);
  ok(dockStarts === 1, `dock triggers exactly one transition under spam (${dockStarts})`);
  ok(game.mode === MODE.ISLAND && !!game.pirate && game.player.docked, "docked: one pirate, ship moored");
  // chest once: force-open the buried chest path
  const chest = game.itemById.get("a1chest");
  const dig = game.itemById.get("a1dig");
  game.items.maps.add("a1");
  const g0 = game.run.gold;
  dig.state = "digging";
  game.digging = dig;
  game.finishDig();
  game.finishDig();
  ok(chest.state === "rising", "digging raises the chest once");
  for (let i = 0; i < 120; i++) game.tick(1 / 60, NOINPUT);
  game.openChest(chest);
  game.openChest(chest);
  game.openChest(chest);
  ok(game.run.gold - g0 === 150, `chest rewards exactly once (+${game.run.gold - g0})`);
  // completion once
  game.complete();
  const evs = game.drainEvents().filter((e) => e.type === "complete");
  game.complete();
  ok(evs.length === 1 && game.drainEvents().filter((e) => e.type === "complete").length === 0, "adventure completes once");

  // checkpoint restore: no duplicated ships / foes
  const A2 = getAdventure(2);
  const g2 = createGame(A2, REGION_BY_ID.get(1), { ship: "sloop" });
  g2.player.x = 95;
  g2.player.z = 125;
  for (let i = 0; i < 10; i++) g2.tick(1 / 60, NOINPUT);
  ok(g2.ships.filter((s) => s.team === "enemy").length === 1, "A2: enemy sloop spawned once");
  for (let i = 0; i < 5; i++) g2.restartCheckpoint();
  ok(g2.ships.filter((s) => s.team === "enemy").length === 1, "A2: restarting 5× never duplicates the enemy");
  ok(g2.ships.filter((s) => s.team === "player").length === 1, "A2: restarting never duplicates the player");
  ok(activeBalls(g2.pool) === 0, "A2: restart clears cannonballs");
}

function wrap(a) {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

// ================================================================= bot
function botRun(A, opts = {}) {
  const R = REGION_BY_ID.get(A.region);
  const game = createGame(A, R, { ship: opts.ship || "sloop", upgrades: opts.upgrades || {} });
  const bot = createBot(game, { block: true });
  const limit = (opts.minutes || 25) * 60 * 60;
  let lastStep = -1;
  let stepStart = 0;
  let deaths = 0;
  const stepLog = [];
  for (let i = 0; i < limit; i++) {
    const inp = bot.tick();
    game.tick(1 / 60, inp);
    if (game.prog.step !== lastStep) {
      if (lastStep >= 0) stepLog.push(`${A.steps[lastStep].k}:${(game.time - stepStart).toFixed(0)}s`);
      lastStep = game.prog.step;
      stepStart = game.time;
    }
    if (game.mode === MODE.SHIP_DESTROYED || game.mode === MODE.DEFEATED) {
      if (game.deathT > 2) {
        deaths++;
        if (deaths > 6) break;
        game.restartCheckpoint();
      }
    }
    if (game.completed) break;
    if (game.time - stepStart > 300) break;
  }
  game.drainEvents();
  return { game, deaths, stepLog, bot };
}

function botTests() {
  console.log("— bot walkthroughs");
  for (const A of ADVENTURES) {
    if (only && A.id !== only) continue;
    const ship = A.id >= 16 ? "galleon" : A.id >= 9 ? "brig" : "sloop";
    const up = A.id >= 6 ? { [ship]: { hull: Math.min(4, Math.floor(A.id / 5)), speed: 1, cannons: Math.min(4, Math.floor(A.id / 5)) } } : {};
    const t0 = performance.now();
    const r = botRun(A, { ship, upgrades: up });
    const ms = performance.now() - t0;
    const g = r.game;
    const st = g.currentStep();
    ok(g.completed, `A${A.id} ${A.name}: completed by bot (stuck at step ${g.prog.step} "${st?.text || st?.k}", mode ${g.mode}, deaths ${r.deaths})`);
    console.log(
      `  A${String(A.id).padStart(2)} ${A.name.padEnd(22)} ${g.completed ? "✓" : "✗"} ${(g.time / 60).toFixed(1)}min deaths:${r.deaths} gold:${g.run.gold} sunk:${g.run.shipsSunk} foes:${g.run.foes} hull:${Math.round(g.player.hull)}/${g.player.maxHull}  (${(ms / 1000).toFixed(1)}s)  ${r.stepLog.join(" ")}`,
    );
    if (!g.completed) {
      const p = g.pirate;
      console.log("     at", g.mode, p ? `pirate ${p.x.toFixed(1)},${p.z.toFixed(1)} area ${g.area}` : `ship ${g.player.x.toFixed(0)},${g.player.z.toFixed(0)}`, "target", JSON.stringify(g.objectivePos())?.slice(0, 120), r.bot.state.log.slice(-3));
    }
  }
}

// ================================================================= torture
function tortureTests() {
  console.log("— torture");
  // naval fight many times with different seeds/angles; restart mid-fight
  const A = getAdventure(2);
  const R = REGION_BY_ID.get(1);
  let wins = 0;
  for (let k = 0; k < 12; k++) {
    const game = createGame(A, R, { ship: "sloop" });
    game.player.x = 95 + (k % 3) * 20;
    game.player.z = 125 - (k % 4) * 15;
    game.player.heading = k * 0.7;
    const bot = createBot(game, {});
    let restarted = false;
    for (let i = 0; i < 60 * 60 * 6; i++) {
      game.tick(1 / 60, bot.tick());
      if (!restarted && k % 3 === 0 && game.time > 40) {
        game.restartCheckpoint();
        restarted = true;
      }
      if (game.mode === MODE.SHIP_DESTROYED && game.deathT > 2) game.restartCheckpoint();
      if (game.prog.step >= 2) break;
    }
    const enemies = game.ships.filter((s) => s.team === "enemy");
    ok(enemies.length <= 1, `fight ${k}: never more than one enemy sloop (${enemies.length})`);
    const sunk = game.prog.sets.sunk.has("a2s1");
    if (sunk) wins++;
    const lootIds = game.floats.map((f) => f.id);
    ok(new Set(lootIds).size === lootIds.length, `fight ${k}: no duplicated loot`);
    ok(game.run.shipsSunk <= 1, `fight ${k}: ship sunk counted once (${game.run.shipsSunk})`);
  }
  ok(wins >= 10, `bot wins the first broadside reliably (${wins}/12)`);

  // AI sanity: an enemy vs a circling player for 3 minutes
  const W = buildWorld(R);
  const env = { terrain: W.terrain, time: 0, waveAmp: 0.8, boundary: W.boundary, playerAtSea: true, ships: [], emit: () => {} };
  const player = createShip(playerShipStats("sloop"), { team: "player", x: 60, z: 120, heading: 0, throttle: 0.7 });
  const enemy = createEnemyShip({ type: "pirateBrig", x: 0, z: 200, heading: 3, group: "x", patrol: 60, aggro: true }, {}, 0);
  env.ships = [player, enemy];
  const pool = createProjectilePool();
  let fired = 0;
  let maxHome = 0;
  let revs = 0;
  let lastH = enemy.heading;
  let spinAcc = 0;
  for (let i = 0; i < 60 * 180; i++) {
    env.time += 1 / 60;
    stepShip(player, { throttleDelta: 0.2, steer: 0.35 }, env, 1 / 60);
    const ctl = thinkShip(enemy, player, env, 1 / 60);
    stepShip(enemy, ctl, env, 1 / 60);
    const before = enemy.pending.length;
    const out = [];
    updatePending(enemy, env.time, pool, out);
    fired += out.length;
    stepProjectiles(pool, [player, enemy], env, 1 / 60, []);
    maxHome = Math.max(maxHome, Math.hypot(enemy.x - enemy.ai.home.x, enemy.z - enemy.ai.home.z));
    spinAcc += wrap(enemy.heading - lastH);
    lastH = enemy.heading;
    if (Math.abs(spinAcc) > Math.PI * 2) {
      revs++;
      spinAcc = 0;
    }
    void before;
  }
  ok(fired > 10, `enemy engages and fires at a circling player (${fired} balls)`);
  ok(maxHome < enemy.ai.leash + 80, `enemy stays leashed (${maxHome.toFixed(0)} m from home)`);
  ok(revs < 30, `enemy doesn't spin endlessly (${revs} revolutions in 3 min)`);
  ok(Math.hypot(enemy.x, enemy.z) < W.boundary.r, "enemy stays inside the sea");
  ok(gunRange(SHIP_CLASSES.sloop) > 60, `gun range sensible (${gunRange(SHIP_CLASSES.sloop).toFixed(0)} m)`);
}

if (mode === "all" || mode === "data") dataTests();
if (mode === "all" || mode === "units") unitTests();
if (mode === "all" || mode === "torture") tortureTests();
if (mode === "all" || mode === "bot") botTests();
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) {
  console.log(fails.slice(0, 40).join("\n"));
  process.exitCode = 1;
}
