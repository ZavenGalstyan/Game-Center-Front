/**
 * Dimension Dash — headless checks.
 *   node src/components/games/DimensionDash/tools/simTest.mjs [core|levels|bot <id>|all]
 *
 * core    controller numbers (accel curve, jump arc, variable jump, coyote,
 *         slopes, side-plane constraint, loop traversal / fall-off, rails,
 *         zones 2.5D⇄3D, damage + ring scatter, spin dash, homing)
 * levels  every built level: data sanity + the bot plays it to the goal
 */
import { createBuilder } from "../engine/builder.js";
import { createWorld, step, restartWorld, killPlayer } from "../engine/world.js";
import { insideTerrain } from "../engine/geom.js";
import { STEP, P } from "../engine/config.js";
import { createBot, botInput } from "../engine/bot.js";
import { levelById, BUILT } from "../data/levels/index.js";
import { updateCamera } from "../engine/camera.js";

let fails = 0;
let passes = 0;
function ok(cond, msg, extra = "") {
  if (cond) passes++;
  else {
    fails++;
    console.log(`  FAIL ${msg} ${extra}`);
  }
}

const IDLE = { mx: 0, my: 0, camYaw: Math.PI / 2, sprint: false };
function run(W, inp, secs, each) {
  const n = Math.round(secs / STEP);
  for (let i = 0; i < n; i++) {
    step(W, { ...IDLE, ...inp, jump: !!inp.jump && i === 0, attack: !!inp.attack && i === 0 }, STEP);
    if (each && each(W, i) === false) break;
  }
}

function sideFlat(len = 200, extra) {
  const L = createBuilder({ id: 99, theme: "green" });
  L.moveTo(0, 0, 0, Math.PI / 2);
  L.spawn({ side: true, zone: 0 });
  L.side({ openStart: false, openEnd: true }, (S) => {
    if (extra) extra(S);
    else S.run(len);
  });
  L.road(40);
  return createWorld(L.done());
}

function core() {
  console.log("core: controller");
  {
    const W = sideFlat();
    ok(W.player.mode === "side" && W.player.grounded, "spawns grounded in side mode");
    // acceleration: not instant, reaches top in ~1.5-3 s
    let t1 = -1;
    let t2 = -1;
    run(W, { mx: 1 }, 4, (w, i) => {
      const v = w.player.speed;
      if (t1 < 0 && v > 10) t1 = i * STEP;
      if (t2 < 0 && v > P.topSpeed - 0.5) t2 = i * STEP;
    });
    ok(t1 > 0.3 && t1 < 1.0, "reaches 10 m/s in 0.3-1.0 s", t1.toFixed(2));
    ok(t2 > 1.2 && t2 < 3.2, "reaches top speed in 1.2-3.2 s", t2.toFixed(2));
    ok(Math.abs(W.player.z) < 0.05, "stays on the plane (z≈0)", W.player.z.toFixed(3));
    ok(Math.abs(W.player.speed - P.topSpeed) < 0.6, "capped at top speed without sprint", W.player.speed.toFixed(2));
    run(W, { mx: 1, sprint: true }, 3);
    ok(W.player.speed > P.topSpeed + 4, "sprint raises top speed", W.player.speed.toFixed(2));
    // skid / reverse
    run(W, { mx: -1 }, 0.4);
    ok(W.player.speed < 10, "reversing skids quickly", W.player.speed.toFixed(2));
  }
  {
    const W = sideFlat();
    run(W, {}, 0.2);
    let peak = 0;
    run(W, { jump: true, jumpHeld: true }, 1.4, (w) => {
      peak = Math.max(peak, w.player.y);
    });
    ok(peak > 3.1 && peak < 4.0, "full jump ~3.5 m", peak.toFixed(2));
    ok(W.player.grounded, "lands");
    let hop = 0;
    run(W, { jump: true, jumpHeld: false }, 1.2, (w) => {
      hop = Math.max(hop, w.player.y);
    });
    ok(hop > 0.5 && hop < 1.7, "tap = short hop", hop.toFixed(2));
  }
  {
    // coyote time: jump shortly after running off a ledge
    const W = sideFlat(0, (S) => {
      S.run(10);
      S.gap(30);
      S.run(30);
    });
    W.player.x = 8.6;
    run(W, { mx: 1 }, 0.5, (w) => !(w.player.x > 10.05));
    ok(!W.player.grounded && W.player.coyote > 0, "coyote window after ledge");
    run(W, { mx: 1, jump: true, jumpHeld: true }, 0.05);
    ok(W.player.vy > 10, "coyote jump works", W.player.vy.toFixed(1));
  }
  {
    // slopes: downhill speeds you up, uphill slows you
    const W = sideFlat(0, (S) => {
      S.run(10);
      S.run(40, { dh: -14, shape: "line" });
      S.run(20);
      S.run(40, { dh: 14, shape: "line" });
      S.run(60);
    });
    run(W, {}, 0.3);
    let vmax = 0;
    W.player.x = 10.6;
    W.player.vx = 3;
    run(W, {}, 4, (w) => {
      vmax = Math.max(vmax, w.player.speed);
      return w.player.x < 55;
    });
    ok(vmax > 12, "rolling downhill gains speed with no input", vmax.toFixed(1));
    run(W, {}, 6);
    ok(W.player.x < 120 && W.player.x > 40, "uphill stops an unpowered run", W.player.x.toFixed(1));
  }
  {
    // loop: fast entry → full traversal; slow entry → falls off / rolls back
    const mk = () =>
      sideFlat(0, (S) => {
        S.run(10);
        S.loop(4.6, { boost: false, lead: 10 });
        S.run(60);
      });
    let W = mk();
    W.player.vx = 26;
    let topY = 0;
    let rode = false;
    run(W, { mx: 1 }, 4, (w) => {
      if (w.player.mode === "ride") rode = true;
      topY = Math.max(topY, w.player.y);
    });
    ok(rode && topY > 8.5, "fast loop entry goes all the way round", `top=${topY.toFixed(2)}`);
    ok(W.player.mode === "side" && W.player.x > 30 && W.player.grounded, "exits the loop running on", `x=${W.player.x.toFixed(1)} mode=${W.player.mode}`);
    W = mk();
    W.player.vx = 13;
    topY = 0;
    let fell = false;
    run(W, {}, 3, (w) => {
      topY = Math.max(topY, w.player.y);
      if (w.events.some((e) => e.type === "rideFall")) fell = true;
      w.events.length = 0;
    });
    ok(topY < 9 && (fell || W.player.x < 22), "slow entry can't complete the loop", `top=${topY.toFixed(2)} fell=${fell}`);
    ok(W.player.grounded && W.player.mode === "side", "slow loop attempt ends safely on the ground", W.player.mode);
  }
  {
    // zones: running out of a side section switches to free 3D, and back in
    const L = createBuilder({ id: 98, theme: "green" });
    L.moveTo(0, 0, 0, Math.PI / 2);
    L.spawn({ side: true, zone: 0 });
    L.side({ openStart: false }, (S) => S.run(40));
    L.road(40);
    L.side({}, (S) => S.run(40));
    L.road(30);
    const W = createWorld(L.done());
    const modes = [];
    run(W, { mx: 1 }, 2.6, (w) => {
      for (const e of w.events) if (e.type === "mode") modes.push(e.mode);
      w.events.length = 0;
    });
    ok(modes[0] === "free", "leaving the side zone → free 3D", modes.join(","));
    // keep holding D: carry-over keeps running forward in 3D
    const vx = W.player.vx;
    ok(vx > 15 && Math.abs(W.player.vz) < 1, "holding D through the gate keeps the run going forward", `${vx.toFixed(1)},${W.player.vz.toFixed(2)}`);
    run(W, { my: 1, camYaw: Math.PI / 2 }, 3, (w) => {
      for (const e of w.events) if (e.type === "mode") modes.push(e.mode);
      w.events.length = 0;
    });
    ok(modes.includes("side") && W.player.mode === "side", "entering the second zone → side", modes.join(","));
    ok(W.player.speed > 15, "no speed loss through the transitions", W.player.speed.toFixed(1));
    // the camera blends without snapping
    const W2 = createWorld(W.level);
    let maxJump = 0;
    let prev = null;
    let sawBlend = false;
    for (let i = 0; i < 480; i++) {
      step(W2, { ...IDLE, mx: 1 }, STEP);
      if (i % 2 === 0) {
        updateCamera(W2, STEP * 2, { dx: 0, dy: 0 }, {});
        const c = W2.cam;
        if (c.label === "CINEMATIC_TRANSITION") sawBlend = true;
        if (prev) maxJump = Math.max(maxJump, Math.hypot(c.px - prev[0], c.py - prev[1], c.pz - prev[2]) - W2.player.speed * STEP * 2);
        prev = [c.px, c.py, c.pz];
      }
    }
    ok(sawBlend, "camera goes through CINEMATIC_TRANSITION");
    ok(maxJump < 0.9, "camera never snaps (per-frame move beyond player motion < 0.9 m)", maxJump.toFixed(2));
  }
  {
    // damage: rings scatter, invulnerability, and death with no rings
    const W = sideFlat(80);
    W.rings = 12;
    W.enemies.push({ kind: "patrol", x: 6, y: 0, z: 0, hx: 6, hz: 0, hy0: 0, ax: 1, az: 0, range: 0.01, r: 0.75, hy: 0.55, speed: 0, dir: 1, facing: 0, state: "turn", t: 0, dead: false, deadT: 0, flash: 0 });
    run(W, { mx: 1 }, 1.2, (w) => w.stats.hits === 0);
    ok(W.rings === 0 && W.loose.length === 12, "hit drops and scatters rings", `${W.rings} ${W.loose.length}`);
    ok(W.player.invuln > 0 || W.player.action === "hurt" || W.stats.hits === 1, "short invulnerability after a hit");
    ok(W.player.action !== "dead", "still alive after the ring hit");
  }
  {
    // spin dash from standstill
    const W = sideFlat(200);
    run(W, {}, 0.2);
    run(W, { my: -1 }, 0.1);
    run(W, { my: -1, jump: true }, 0.05);
    run(W, { my: -1, jump: true }, 0.05);
    run(W, { my: -1, jump: true }, 0.4);
    ok(W.player.action === "charge", "S + Space charges a spin dash", W.player.action);
    run(W, {}, 0.1);
    ok(W.player.speed > P.dashMin && W.player.action === "roll", "release launches a damaging roll", `${W.player.speed.toFixed(1)} ${W.player.action}`);
  }
  {
    // homing attack: locks a fly bot ahead and bounces off it
    const W = sideFlat(80);
    W.enemies.push({ kind: "fly", x: 9, y: 3.4, z: 0, hx: 9, hz: 0, hy0: 3.4, ax: 1, az: 0, range: 0.01, r: 0.7, hy: 0, speed: 0, dir: 1, facing: 0, state: "move", t: 0, dead: false, deadT: 0, flash: 0, homable: true, bob: 0 });
    W.targets = [...W.enemies];
    run(W, { mx: 1 }, 0.25);
    run(W, { mx: 1, jump: true, jumpHeld: true }, 0.12);
    const locked = !!W.player.lock;
    run(W, { mx: 1, attack: true }, 0.6, (w) => !w.enemies[w.enemies.length - 1].dead);
    ok(locked, "airborne lock-on to a target in range");
    ok(W.enemies[W.enemies.length - 1].dead, "homing attack defeats the target");
    ok(W.player.vy > 5, "bounces up after the hit", W.player.vy.toFixed(1));
    // no target → no dash into empty space
    const W2 = sideFlat(80);
    run(W2, { mx: 1 }, 0.3);
    run(W2, { mx: 1, jump: true, jumpHeld: true }, 0.15);
    const vx = W2.player.vx;
    run(W2, { mx: 1, attack: true }, 0.05);
    ok(W2.player.action !== "homing" && Math.abs(W2.player.vx - vx) < 3, "no homing without a target");
  }
  {
    // rails: land on a rail from a jump, grind, jump off
    const L = createBuilder({ id: 97, theme: "green" });
    L.moveTo(0, 0, 0, Math.PI / 2);
    L.spawn();
    L.road(20);
    const R = L.rails({ len: 40, start: 0.6, lead: 2 });
    void R;
    L.road(40);
    const W = createWorld(L.done());
    let grind = 0;
    run(W, { my: 1, camYaw: Math.PI / 2 }, 5.5, (w) => {
      if (w.player.mode === "rail") grind++;
    });
    ok(grind > 60, "grinds the rail", grind);
    ok(W.player.grounded && W.player.mode === "free" && W.player.x > 60, "lands safely after the rail", `${W.player.x.toFixed(1)} ${W.player.mode}`);
  }
}

function levels(only) {
  const ids = only ? [only] : BUILT;
  for (const id of ids) {
    const L = levelById(id);
    console.log(`level ${id}: ${L.meta.name} — rings ${L.rings.length}, enemies ${L.enemies.length}, zones ${L.zones.length}, rides ${L.rides.length}, rails ${L.rails.length}, route ${L.route.length}`);
    ok((L.goal && Number.isFinite(L.goal.y)) || L.boss, `L${id} has a goal (or a boss)`);
    ok(L.zones.length >= 1 && L.ribbons.length + L.discs.length + L.boxes.length > 0, `L${id} mixes 2.5D and 3D geometry`);
    for (const t of [...L.enemies, ...L.monitors, ...L.springs, ...L.checkpoints, ...L.redStars]) if (!Number.isFinite(t.y)) ok(false, `L${id} entity with NaN height`, JSON.stringify(t).slice(0, 80));
    ok(L.redStars.length === 3, `L${id} has 3 red stars`, L.redStars.length);
    ok(L.checkpoints.length >= 1, `L${id} has a checkpoint`);
    for (const r of L.rings) if (!Number.isFinite(r[1])) ok(false, `L${id} ring with NaN height`);
    const W = createWorld(L);
    ok(W.player.grounded, `L${id} spawn grounded`);
    const bot = createBot();
    const n = Math.round(240 / STEP);
    const modes = new Set();
    let rode = 0;
    let railT = 0;
    let lastI = 0;
    let lastLog = 0;
    let tunnel = 0;
    for (let i = 0; i < n; i++) {
      const inp = botInput(W, bot, STEP);
      step(W, inp, STEP);
      if (i % 4 === 0) updateCamera(W, STEP * 4, { dx: 0, dy: 0 }, {});
      modes.add(W.player.mode);
      if (W.player.mode === "ride") rode++;
      if (W.player.mode === "rail") railT++;
      if (W.player.action !== "dead" && W.player.vy <= 0.5 && insideTerrain(W.geom, W.player.x, W.player.y + 0.5, W.player.z)) tunnel++;
      for (const e of W.events) {
        if (e.type === "die") console.log(`    died (${e.why}) at t=${W.time.toFixed(1)} route ${bot.i}/${L.route.length} pos ${W.player.x.toFixed(1)},${W.player.y.toFixed(1)},${W.player.z.toFixed(1)} mode ${W.player.mode}`);
      }
      W.events.length = 0;
      if (process.env.TRACE && W.time - lastLog > 1) {
        lastLog = W.time;
        console.log(`    t=${W.time.toFixed(1)} i=${bot.i} p=${W.player.x.toFixed(1)},${W.player.y.toFixed(1)},${W.player.z.toFixed(1)} v=${W.player.speed.toFixed(1)} ${W.player.mode}/${W.player.action} g=${W.player.grounded}`);
      }
      if (W.state === "complete" || W.state === "gameover") break;
      lastI = bot.i;
    }
    ok(W.state === "complete", `L${id} bot reaches the goal`, `state=${W.state} t=${W.time.toFixed(1)} route ${lastI}/${L.route.length} deaths=${W.stats.deaths}`);
    ok(W.stats.deaths === 0, `L${id} bot run without deaths`, W.stats.deaths);
    ok(modes.has("side") && modes.has("free"), `L${id} uses both 2.5D and 3D`);
    console.log(`    time ${W.time.toFixed(1)}s rings ${W.ringsTotalGot}/${W.ringTotal} enemies ${W.stats.enemies}/${W.enemies.length} hits ${W.stats.hits} rideSteps ${rode} railSteps ${railT} shifts ${W.stats.shifts} top ${W.stats.topSpeed.toFixed(1)}`);
    ok(tunnel === 0, `L${id} never inside terrain`, tunnel);
    // restart restores everything
    restartWorld(W);
    ok(W.state === "play" && W.time === 0 && W.rings === 0 && W.player.mode === L.spawn.mode, `L${id} restart resets`);
    // forced deaths: respawn at the checkpoint (right mode + camera) and still finish
    {
      const W2 = createWorld(L);
      W2.lives = 6; // this check is about respawn correctness, not survival
      const bot2 = createBot();
      const kills = [Math.floor(L.route.length * 0.3), Math.floor(L.route.length * 0.7)];
      let modeOk = true;
      for (let i = 0; i < Math.round(300 / STEP); i++) {
        const inp = botInput(W2, bot2, STEP);
        step(W2, inp, STEP);
        if (i % 4 === 0) updateCamera(W2, STEP * 4, { dx: 0, dy: 0 }, {});
        for (const e of W2.events) {
          if (e.type === "respawn") {
            const c = W2.checkpoint;
            const want = c.mode === "side" ? "side" : "free";
            if (W2.player.mode !== want || W2.cam.mode !== (want === "side" ? "side" : "third")) modeOk = false;
          }
        }
        W2.events.length = 0;
        if (kills.length && bot2.i >= kills[0] && W2.player.grounded && W2.player.mode !== "rail") {
          kills.shift();
          killPlayer(W2, W2.player, "test");
        }
        if (W2.state !== "play" && W2.state !== "goal") break;
      }
      ok(W2.state === "complete", `L${id} finishes after 2 forced deaths`, `state=${W2.state} route ${bot2.i}/${L.route.length}`);
      ok(modeOk, `L${id} respawn restores the checkpoint's mode + camera`);
    }
  }
}

const arg = process.argv[2] || "all";
if (arg === "core" || arg === "all") core();
if (arg === "levels" || arg === "all") levels();
if (arg === "bot") levels(Number(process.argv[3]));
console.log(`\n${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
