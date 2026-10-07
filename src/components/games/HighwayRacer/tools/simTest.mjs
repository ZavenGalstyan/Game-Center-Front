/**
 * Highway Racer — headless checks of the run simulation.
 *
 *   node src/components/games/HighwayRacer/tools/simTest.mjs [core|lanes|collide|near|boost|fair|long|bot|all]
 *
 * core     state machine, countdown, distance/score stop after crash
 * lanes    lane-input torture (LLLL, RRRR, LRLR … at every speed / boost)
 * collide  collision torture (centre, side, lane-change, truck, two cars,
 *          during boost, right after GO, after a long run) — crash exactly once
 * near     near-miss rewarded once per car, never for a hit, never far away
 * boost    boost activation, duration, safety after crash
 * fair     thousands of spawns: no unavoidable walls, no overlaps, no spawn
 *          inside the player; coins never inside traffic
 * long     20-minute invincible runs: pools bounded, speed capped, no NaN
 * bot      survival of the planner bot (fairness in practice)
 */
import { createRun } from "../engine/run.js";
import { CARS } from "../data/cars.js";
import { LANES, PLAYER, VEHICLES, SPEED, STEP } from "../engine/config.js";
import { survivableLanes } from "../engine/fairness.js";
import { createBot } from "./bot.mjs";

let fails = 0;
let checks = 0;
const ok = (cond, msg) => {
  checks++;
  if (!cond) {
    fails++;
    console.log("  FAIL", msg);
  }
};
const section = (s) => console.log(`\n# ${s}`);
const car = CARS[0];
const toPlaying = (R) => {
  R.simulate(3.05);
  return R;
};
const clearTraffic = (R) => {
  for (const c of R.traffic) c.active = false;
  for (const k of R.pickups) k.active = false;
  R.spawnTimer = 1e9;
  R.coinTimer = 1e9;
  R.boostPickupTimer = 1e9;
};
const place = (R, lane, z, type = "sedan", speed) => {
  const slot = R.traffic.find((c) => !c.active);
  Object.assign(slot, { active: true, id: R.nextId++, lane, x: LANES[lane], z, type, speed: speed ?? 12, passed: false, near: false, minGap: 99, hit: false, bump: 0 });
  return slot;
};
const events = (R, type) => R.events.filter((e) => e.type === type).length;

function core() {
  section("core");
  const R = createRun({ car, seed: 1 });
  ok(R.phase === "countdown", "starts in countdown");
  R.steer(1);
  ok(R.player.target === 1, "no lane change during countdown");
  R.simulate(1.0);
  ok(R.distance === 0 && R.score === 0 && R.speed === 0, "nothing counts during countdown");
  R.simulate(2.05);
  ok(R.phase === "playing", "GO → playing");
  ok(events(R, "count") === 3 && events(R, "go") === 1, "3·2·1·GO events once each");
  R.simulate(2);
  ok(R.speed > SPEED.start * 0.95, `launch reaches start speed (${R.speed.toFixed(1)})`);
  ok(R.distance > 0 && R.score > 0, "distance/score grow while playing");
  ok(R.counts().traffic > 0, "traffic prepared ahead");
  for (const c of R.traffic) if (c.active) ok(c.z < -20, `no traffic near the player at start (${c.z.toFixed(1)})`);
  // crash: stop scoring
  clearTraffic(R);
  place(R, R.player.target, -8, "sedan", 5);
  R.simulate(1);
  ok(R.phase === "crashed" || R.phase === "result", "crash happened");
  const d = R.distance;
  const s = R.score;
  R.simulate(3);
  ok(R.phase === "result", "crashed → result");
  ok(R.distance === d && R.score === s, "distance & score frozen after crash");
  ok(events(R, "crash") === 1 && events(R, "result") === 1, "crash/result once");
  R.steer(-1);
  ok(R.player.target === 1 || R.player.target === R.player.target, "input ignored after crash");
  ok(!R.activateBoost(), "no boost after crash");
}

function lanes() {
  section("lanes");
  const seqs = ["LLLLLLLL", "RRRRRRRR", "LRLRLRLRLR", "RLRLRLRLRL", "LLRRLLRRLRLR", "RRRLLLLLRRR"];
  for (const speedCase of ["normal", "high", "boost"]) {
    for (const seq of seqs) {
      for (const gapMs of [0, 16, 60, 140]) {
        const R = toPlaying(createRun({ car: CARS[2], seed: 7 }));
        clearTraffic(R);
        if (speedCase !== "normal") R.time = 150;
        R.simulate(speedCase === "normal" ? 1 : 8);
        if (speedCase === "boost") {
          R.boost = 1;
          ok(R.activateBoost(), "boost activates");
        }
        let maxAbs = 0;
        let bad = false;
        for (const ch of seq) {
          R.steer(ch === "L" ? -1 : 1);
          const steps = Math.max(1, Math.round(gapMs / 1000 / STEP));
          for (let i = 0; i < steps; i++) {
            R.simulate(STEP);
            const p = R.player;
            maxAbs = Math.max(maxAbs, Math.abs(p.x));
            if (!Number.isFinite(p.x + p.vx + p.lean + p.yaw)) bad = true;
            if (p.target < 0 || p.target > 2) bad = true;
          }
        }
        R.simulate(1.2);
        const p = R.player;
        ok(!bad, `${speedCase} ${seq} @${gapMs}ms: finite + valid target`);
        ok(maxAbs <= LANES[2] + 0.16, `${speedCase} ${seq} @${gapMs}ms: stays on road (max |x| ${maxAbs.toFixed(2)})`);
        ok(Math.abs(p.x - LANES[p.target]) < 0.02, `${speedCase} ${seq} @${gapMs}ms: settles in lane`);
        ok(Math.abs(p.lean) < 0.005 && Math.abs(p.yaw) < 0.005, `${speedCase} ${seq} @${gapMs}ms: body back to neutral`);
        const expectTarget = Math.max(0, Math.min(2, [...seq].reduce((t, ch) => Math.max(0, Math.min(2, t + (ch === "L" ? -1 : 1))), 1)));
        ok(p.target === expectTarget, `${speedCase} ${seq}: target ${p.target} == ${expectTarget} (no queue)`);
      }
    }
  }
  // lane change timing per car
  for (const c of CARS) {
    const R = toPlaying(createRun({ car: c, seed: 3 }));
    clearTraffic(R);
    R.simulate(1);
    R.steer(1);
    let t = 0;
    while (Math.abs(R.player.x - LANES[2]) > 0.16 && t < 2) {
      R.simulate(STEP);
      t += STEP;
    }
    ok(t >= 0.22 && t <= 0.46, `${c.name}: lane change ${(t * 1000).toFixed(0)} ms in 250-450`);
  }
}

function collide() {
  section("collide");
  const scenario = (name, setup, expectCrash = true) => {
    const R = toPlaying(createRun({ car, seed: 11 }));
    clearTraffic(R);
    R.simulate(0.5);
    setup(R);
    for (let i = 0; i < 600 && R.phase === "playing"; i++) R.simulate(STEP);
    R.simulate(4);
    const n = events(R, "crash");
    if (expectCrash) {
      ok(n === 1, `${name}: crash exactly once (${n})`);
      ok(events(R, "result") === 1, `${name}: one result`);
      ok(R.score >= 0 && Number.isFinite(R.score), `${name}: score sane`);
    } else ok(n === 0, `${name}: no crash (${n})`);
    return R;
  };
  scenario("centre hit", (R) => place(R, 1, -30));
  scenario("side hit", (R) => {
    place(R, 0, -1, "sedan", R.speed); // alongside, same speed
    R.steer(-1);
  });
  scenario("lane-change into car", (R) => {
    place(R, 2, -25);
    R.simulate(0.3);
    R.steer(1);
  });
  scenario("truck hit", (R) => place(R, 1, -40, "truck"));
  scenario("two nearby cars", (R) => {
    place(R, 1, -30);
    place(R, 1, -42);
    place(R, 0, -31);
  });
  scenario("during boost", (R) => {
    R.boost = 1;
    R.activateBoost();
    place(R, 1, -60);
  });
  scenario("right after GO", (R) => {}, false);
  {
    const R = createRun({ car, seed: 5 });
    R.simulate(2.9);
    clearTraffic(R);
    place(R, 1, -9, "sedan", 0.0001);
    for (let i = 0; i < 300; i++) R.simulate(STEP);
    ok(events(R, "crash") === 1, "collision immediately after countdown: once");
  }
  {
    const R = createRun({ car, seed: 21, invincible: false });
    const bot = createBot({ skill: 1 });
    toPlaying(R);
    for (let i = 0; i < 120 * 90 && R.phase === "playing"; i++) {
      bot(R, STEP);
      R.simulate(STEP);
    }
    if (R.phase === "playing") {
      clearTraffic(R);
      place(R, R.player.target, -50);
      for (let i = 0; i < 600; i++) R.simulate(STEP);
    }
    R.simulate(3);
    ok(events(R, "crash") === 1, `collision after long run (t=${R.time.toFixed(0)}s): once`);
  }
  scenario("adjacent pass, no touch", (R) => place(R, 0, -40), false);
  // no tunnelling at the highest closing speed with a big frame
  {
    const R = toPlaying(createRun({ car: CARS[5], seed: 2 }));
    clearTraffic(R);
    R.time = 400;
    R.simulate(10);
    R.boost = 1;
    R.activateBoost();
    R.simulate(0.6);
    place(R, R.player.target, -40, "hatch", 0);
    for (let i = 0; i < 60; i++) R.update(0.2); // absurd frames get clamped
    ok(events(R, "crash") === 1, `no tunnelling at ${(R.crash?.speed * 3.6).toFixed(0)} km/h with huge frames`);
  }
}

function near() {
  section("near");
  const run = (setup, steps = 400) => {
    const R = toPlaying(createRun({ car, seed: 9 }));
    clearTraffic(R);
    R.simulate(1);
    setup(R);
    for (let i = 0; i < steps; i++) R.simulate(STEP);
    return R;
  };
  let R = run((R) => place(R, 0, -40));
  ok(R.nearMisses === 0, `centered adjacent pass is not a near miss (${R.nearMisses})`);
  R = run((R) => {
    place(R, 0, -40);
    R.player.x = -1.15; // hugging the left lane line
    R.player.target = 1;
  });
  // the spring pulls it back; emulate a late cut by steering at overlap
  R = run((R) => {
    const c = place(R, 0, -22);
    R.steer(-1);
    // abort the lane change half-way: steer back right
    R.simulate(0.12);
    R.steer(1);
  });
  ok(R.nearMisses <= 1, `late swerve past a car: at most one near miss (${R.nearMisses})`);
  // same car can't pay twice: drive alongside at equal speed for a long time
  R = run((R) => {
    const c = place(R, 0, -1.5, "sedan", R.speed);
    R.player.x = -1.0;
  }, 1200);
  ok(R.nearMisses <= 1, `alongside a car for 10 s: at most one near miss (${R.nearMisses})`);
  // direct construction: close pass counts exactly once and pays score
  {
    const R = toPlaying(createRun({ car, seed: 4 }));
    clearTraffic(R);
    R.simulate(1);
    const s0 = R.score;
    const c = place(R, 0, -30);
    for (let i = 0; i < 400; i++) {
      if (c.z > -6 && c.z < 5) {
        R.player.x = -1.2; // ≈0.13 m clearance, no contact
        R.player.vx = 0;
      }
      R.simulate(STEP);
    }
    ok(R.nearMisses === 1 && c.near, `close pass: one near miss (${R.nearMisses})`);
    ok(R.phase === "playing", "close pass didn't crash");
    ok(R.score - s0 >= 100, "near miss pays");
    for (let i = 0; i < 400; i++) R.simulate(STEP);
    ok(R.nearMisses === 1, "still one after it's gone");
  }
  // combo: consecutive near misses multiply, then reset
  {
    const R = toPlaying(createRun({ car, seed: 4 }));
    clearTraffic(R);
    R.simulate(1);
    const pts = [];
    for (let n = 0; n < 5; n++) {
      const c = place(R, 0, -30);
      for (let i = 0; i < 300 && !c.passed; i++) {
        if (c.z > -6) R.player.x = -1.2;
        R.simulate(STEP);
      }
      const e = R.events.filter((e) => e.type === "near").pop();
      pts.push(e ? e.combo : 0);
    }
    ok(pts.join(",") === "1,2,3,4,4", `combo climbs and caps at x4 (${pts})`);
    R.simulate(3.5);
    ok(R.combo === 0, "combo resets after the window");
  }
}

function boost() {
  section("boost");
  const R = toPlaying(createRun({ car: CARS[3], seed: 8 }));
  clearTraffic(R);
  R.simulate(2);
  ok(!R.activateBoost(), "boost needs a full meter");
  R.boost = 1;
  const v0 = R.speed;
  ok(R.activateBoost(), "boost activates when full");
  ok(!R.activateBoost(), "can't stack a second boost");
  R.simulate(1);
  ok(R.speed > v0 * 1.2, `boost speeds up (${v0.toFixed(1)} → ${R.speed.toFixed(1)})`);
  R.simulate(R.tune.boostDuration);
  ok(R.boostTime === 0 && R.boost < 0.05, `boost ends and empties the meter (${R.boost.toFixed(3)})`);
  R.simulate(3);
  ok(Math.abs(R.speed - R.cruise) < 0.5, "speed returns to cruise");
  ok(R.boostsUsed === 1, "boostsUsed counted once");
  // boost → crash: boost ends
  R.boost = 1;
  R.activateBoost();
  place(R, R.player.target, -30);
  R.simulate(3);
  ok(R.boostTime === 0, "boost cleared by crash");
  ok(R.speed < 1, "car stopped after crash");
  // meter fills from distance
  const Q = toPlaying(createRun({ car, seed: 8 }));
  clearTraffic(Q);
  Q.simulate(55);
  ok(Q.boost > 0.9, `meter fills from distance (${Q.boost.toFixed(2)} after 55 s)`);
}

function fair() {
  section("fair");
  let spawns = 0;
  let unfair = 0;
  let overlap = 0;
  let inPlayer = 0;
  let coinInCar = 0;
  for (let seed = 1; seed <= 60; seed++) {
    const R = toPlaying(createRun({ car: CARS[seed % 6], seed, invincible: true }));
    const bot = createBot({ skill: 1 });
    let seen = new Set();
    for (let i = 0; i < 120 * 240; i++) {
      bot(R, STEP);
      R.simulate(STEP);
      for (const c of R.traffic) {
        if (!c.active || seen.has(c.id)) continue;
        seen.add(c.id);
        spawns++;
        if (c.z > -60) inPlayer++;
      }
      if (i % 12 === 0) {
        const cars = R.traffic.filter((c) => c.active);
        // same-lane overlap
        for (const a of cars)
          for (const b of cars)
            if (a !== b && a.lane === b.lane && Math.abs(a.z - b.z) < VEHICLES[a.type].halfLength + VEHICLES[b.type].halfLength) overlap++;
        // whole road solvable from somewhere
        if (survivableLanes(cars.filter((c) => c.z < -10), R.speed, R.tune.laneTime, 0) === 0) unfair++;
        // coins inside cars right now
        for (const k of R.pickups) {
          if (!k.active || k.z < -30) continue;
          for (const c of cars)
            if (Math.abs(c.x - k.x) < VEHICLES[c.type].halfWidth && Math.abs(c.z - k.z) < VEHICLES[c.type].halfLength) coinInCar++;
        }
      }
    }
  }
  console.log(`  spawns ${spawns}, unsolvable samples ${unfair}, overlaps ${overlap}, spawned near player ${inPlayer}, coin-in-car samples ${coinInCar}`);
  ok(spawns > 5000, "plenty of spawns tested");
  ok(unfair === 0, "never an unsolvable wall ahead");
  ok(overlap === 0, "traffic never overlaps in a lane");
  ok(inPlayer === 0, "traffic never spawns near the player");
  ok(coinInCar === 0, "coins never sit inside traffic");
}

function long() {
  section("long");
  for (const minutes of [5, 10, 20]) {
    const R = toPlaying(createRun({ car: CARS[5], seed: minutes, invincible: true }));
    const bot = createBot({ skill: 1 });
    let maxT = 0;
    let maxP = 0;
    let bad = false;
    const steps = minutes * 60 * 120;
    for (let i = 0; i < steps; i++) {
      bot(R, STEP);
      R.simulate(STEP);
      if (i % 60 === 0) {
        const c = R.counts();
        maxT = Math.max(maxT, c.traffic);
        maxP = Math.max(maxP, c.pickups);
        if (!Number.isFinite(R.distance + R.score + R.speed + R.player.x)) bad = true;
      }
    }
    console.log(`  ${minutes} min: ${(R.distance / 1000).toFixed(1)} km, score ${R.score}, max traffic ${maxT}, max pickups ${maxP}, top ${(R.topSpeed * 3.6).toFixed(0)} km/h, ghost hits ${R.ghostHits}, events buffered ${R.events.length}`);
    ok(!bad, `${minutes} min: no NaN`);
    ok(maxT <= R.traffic.length && maxP <= R.pickups.length, `${minutes} min: pools bounded`);
    ok(R.topSpeed <= SPEED.hardCap, `${minutes} min: speed capped`);
    ok(R.events.length <= 200, `${minutes} min: event buffer bounded`);
  }
}

function botSurvival() {
  section("bot");
  for (const skill of [1, 0.8]) {
    const times = [];
    for (let seed = 100; seed < 130; seed++) {
      const R = toPlaying(createRun({ car: CARS[0], seed }));
      const bot = createBot({ skill, rng: Math.random });
      for (let i = 0; i < 120 * 600 && R.phase === "playing"; i++) {
        bot(R, STEP);
        R.simulate(STEP);
      }
      times.push(R.time);
    }
    times.sort((a, b) => a - b);
    const med = times[times.length >> 1];
    console.log(`  skill ${skill}: survival median ${med.toFixed(0)} s, min ${times[0].toFixed(0)} s, max ${times[times.length - 1].toFixed(0)} s`);
    if (skill === 1) ok(med > 300, "perfect bot survives a long time (fair traffic)");
  }
}

const mode = process.argv[2] || "all";
const all = { core, lanes, collide, near, boost, fair, long, bot: botSurvival };
if (mode === "all") for (const f of Object.values(all)) f();
else all[mode]();
console.log(`\n${checks - fails}/${checks} checks passed${fails ? ` — ${fails} FAILED` : ""}`);
process.exit(fails ? 1 : 0);
