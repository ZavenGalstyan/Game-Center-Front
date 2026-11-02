/**
 * Headless checks for the Midnight Shift simulation.
 *   node src/components/games/MidnightShift/tools/simTest.mjs [one|core|fuzz|balance|all]
 */
import { createNight } from "../sim.js";
import { playNight } from "./bot.mjs";
import { NIGHTS, GRAPH, NIGHT_SECONDS, DOOR_NODE, CAMS, ROBOT_IDS, JUMPSCARE_SECONDS } from "../data.js";

let pass = 0, fail = 0;
const ok = (c, msg) => {
  if (c) pass++;
  else {
    fail++;
    console.log("  FAIL:", msg);
  }
};
const run = (g, seconds, dt = 1 / 30, each) => {
  const all = [];
  for (let s = 0; s < seconds && g.phase !== "won" && g.phase !== "lost"; s += dt) {
    g.step(dt);
    const e = g.takeEvents();
    all.push(...e);
    each?.(e);
  }
  return all;
};
const only = (g, ...ids) => {
  for (const id of ROBOT_IDS) if (!ids.includes(id)) g.robots[id].level = 0;
  return g;
};

function suiteOne() {
  console.log("[one] Night 1 with only Rustjaw");
  // idle player: Rustjaw must eventually reach the left doorway and attack — only from the left, only via its route
  let losses = 0, wins = 0, wrongPath = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const g = only(createNight(0, { seed, skipIntro: true }), "rustjaw");
    let prev = g.robots.rustjaw.node;
    run(g, 400, 1 / 30, (ev) => {
      for (const e of ev) if (e.type === "move") {
        if (!GRAPH[e.from].includes(e.to)) wrongPath++;
        prev = e.to;
      }
    });
    if (g.phase === "lost") {
      losses++;
      ok(g.killer === "rustjaw", "killer is rustjaw");
      ok(prev === "leftDoor", "attacked from the left doorway");
    } else wins++;
  }
  ok(wrongPath === 0, "moves only along graph edges");
  console.log(`  idle player vs Rustjaw only: ${losses} losses / ${wins} wins (expect mostly losses)`);
  ok(losses > 120, "idle player usually loses on night 1");

  // smart player beats a Rustjaw-only night 1 basically always
  let w = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const g = playNightOnly(seed);
    if (g.phase === "won") w++;
  }
  console.log(`  bot vs Rustjaw only: ${w}/200 wins`);
  ok(w >= 195, "Rustjaw-only night 1 is beatable");
}
function playNightOnly(seed) {
  const g0 = createNight;
  return playNight((i, o) => only(g0(i, o), "rustjaw"), 0, { seed, skill: 0.6 });
}

function suiteCore() {
  console.log("[core] doors, attacks, power, win");
  // door closed → no entry, robot retreats
  {
    const g = only(createNight(2, { seed: 7, skipIntro: true }), "rustjaw");
    g.robots.rustjaw.node = "westHall";
    g.robots.rustjaw.timer = 0;
    g.robots.rustjaw.level = 20;
    g.toggleDoor("L");
    const ev = run(g, 20);
    ok(ev.some((e) => e.type === "arrive" && e.side === "L"), "arrives at left door");
    ok(ev.some((e) => e.type === "blocked" && e.id === "rustjaw"), "closed door blocks rustjaw");
    ok(!ev.some((e) => e.type === "jumpscare"), "no jumpscare through a closed door");
    ok(g.robots.rustjaw.node !== "leftDoor", "rustjaw walked away");
  }
  // door open → attack after doorWait, exactly one jumpscare, then lost
  {
    const g = only(createNight(0, { seed: 3, skipIntro: true }), "velvet");
    g.robots.velvet.level = 20;
    g.robots.velvet.node = "eastHall";
    g.robots.velvet.timer = 0;
    let arriveT = null, jumpT = null;
    const ev = [];
    for (let i = 0; i < 30 * 30 && g.phase !== "lost"; i++) {
      g.step(1 / 30);
      for (const e of g.takeEvents()) {
        ev.push(e);
        if (e.type === "arrive") arriveT = g.t;
        if (e.type === "jumpscare") jumpT = g.t;
      }
    }
    ok(arriveT !== null && jumpT !== null, "velvet arrives then attacks an open door");
    const wait = jumpT - arriveT;
    ok(wait >= NIGHTS[0].doorWait * 0.85 * 0.9 - 0.05, `doorway wait respected (${wait.toFixed(2)}s)`);
    ok(ev.filter((e) => e.type === "jumpscare").length === 1, "one jumpscare");
    ok(g.phase === "lost" && g.killer === "velvet", "lost to velvet");
  }
  // closing the door during the doorway wait saves you
  {
    const g = only(createNight(4, { seed: 11, skipIntro: true }), "velvet");
    g.robots.velvet.node = "eastHall";
    g.robots.velvet.timer = 0;
    g.robots.velvet.level = 20;
    let closedAt = null;
    run(g, 30, 1 / 30, (ev) => {
      for (const e of ev) if (e.type === "arrive" && !g.doors.R) g.toggleDoor("R"), (closedAt = g.t);
    });
    ok(closedAt !== null && g.phase !== "lost", "closing the door after arrival prevents the attack");
  }
  // two robots expiring on the same frame → one jumpscare only
  {
    const g = createNight(4, { seed: 5, skipIntro: true });
    g.robots.rustjaw.node = "leftDoor";
    g.robots.rustjaw.wait = 0.01;
    g.robots.velvet.node = "rightDoor";
    g.robots.velvet.wait = 0.01;
    const ev = run(g, 5);
    ok(ev.filter((e) => e.type === "jumpscare").length === 1, "simultaneous attackers produce one jumpscare");
    ok(g.phase === "lost", "lost after jumpscare");
  }
  // jumpscare duration
  {
    const g = createNight(0, { seed: 5, skipIntro: true });
    g.robots.rustjaw.node = "leftDoor";
    g.robots.rustjaw.wait = 0.001;
    g.step(1 / 60);
    ok(g.phase === "jumpscare", "jumpscare phase");
    g.toggleDoor("L");
    ok(!g.doors.L, "cannot act during jumpscare");
    let t = 0;
    while (g.phase === "jumpscare") g.step(1 / 60), (t += 1 / 60);
    ok(Math.abs(t - JUMPSCARE_SECONDS) < 0.05, `jumpscare lasts ${t.toFixed(2)}s`);
  }
  // power usage
  {
    const g = only(createNight(0, { seed: 1, skipIntro: true }));
    ok(g.usage() === 1, "base usage 1");
    g.toggleDoor("L");
    g.toggleDoor("R");
    g.setMonitor(true);
    ok(g.usage() === 4, "doors + cams usage 4");
    ok(!g.setLight("L", true), "cannot use lights with the monitor up");
    g.setMonitor(false);
    g.setLight("L", true);
    g.setLight("R", true);
    ok(g.usage() === 5, "all on = usage 5 (monitor down)");
    const p0 = g.power;
    run(g, 10);
    const used = p0 - g.power;
    ok(Math.abs(used - NIGHTS[0].drain * 5 * 10) < 0.2, `drain math (${used.toFixed(2)}% in 10s)`);
  }
  // power-out: doors open, controls dead, eventual attack (no robots active)
  {
    const g = only(createNight(0, { seed: 9, skipIntro: true }));
    g.toggleDoor("L");
    g.power = 0.01;
    const ev = run(g, 1);
    ok(g.phase === "powerout", "power out phase");
    ok(!g.doors.L && !g.doors.R, "doors forced open");
    ok(ev.some((e) => e.type === "doorOpen" && e.forced), "forced door-open event");
    ok(!g.toggleDoor("L") && !g.setLight("R", true) && !g.setMonitor(true), "controls dead at 0%");
    const ev2 = run(g, 60);
    ok(ev2.some((e) => e.type === "tune"), "power-out tune plays");
    ok(g.phase === "lost" || g.phase === "jumpscare", "power-out ends in an attack");
  }
  // power-out close to 6 AM → you can still survive
  {
    const g = only(createNight(0, { seed: 9, skipIntro: true }));
    g.t = NIGHT_SECONDS - 3;
    g.power = 0.01;
    run(g, 10);
    ok(g.phase === "won", "6 AM arrives before the power-out attack");
  }
  // 6 AM victory with nobody active
  {
    const g = only(createNight(0, { seed: 2, skipIntro: true }));
    const ev = run(g, NIGHT_SECONDS + 5);
    ok(g.phase === "won", "6 AM wins");
    ok(ev.filter((e) => e.type === "hour").length === 6, "six hour chimes");
    ok(g.power > 50, `idle power left ${g.power.toFixed(1)}%`);
  }
  // intro holds the clock
  {
    const g = createNight(0, { seed: 2 });
    run(g, 2);
    ok(g.phase === "intro" && g.t === 0, "intro holds the clock");
    run(g, 1);
    ok(g.phase === "play", "intro ends");
  }
  // Hollow Watcher freezes while watched
  {
    const g = only(createNight(4, { seed: 4, skipIntro: true }), "hollow");
    g.robots.hollow.level = 20;
    g.robots.hollow.timer = 0;
    g.setMonitor(true);
    g.setCam("dock");
    g.power = 1e9;
    const ev = run(g, 60);
    ok(!ev.some((e) => e.type === "move"), "watched Hollow Watcher never moves");
    ok(ev.some((e) => e.type === "stare"), "stare events");
    g.setMonitor(false);
    const ev2 = run(g, 30);
    ok(ev2.some((e) => e.type === "move"), "moves again once unwatched");
  }
  // Hollow Watcher drains power in a doorway
  {
    const g = only(createNight(2, { seed: 4, skipIntro: true }), "hollow");
    const base = g.drainRate();
    g.robots.hollow.node = "rightDoor";
    g.robots.hollow.wait = 99;
    ok(g.drainRate() > base, "hollow at a doorway drains extra power");
  }
  // camera interface
  {
    const g = createNight(0, { seed: 2, skipIntro: true });
    ok(!g.setCam("paint"), "no cam switch with monitor down");
    g.setMonitor(true);
    ok(g.setCam("paint") && g.cam === "paint", "switch cam");
    ok(!g.setCam("leftDoor"), "doorways are not cameras");
    ok(CAMS.length === 8, "8 cameras");
    const at = g.at("showroom");
    ok(at.includes("rustjaw") && at.includes("velvet"), "showroom shows rustjaw + velvet at start");
    ok(g.at("dock").includes("hollow"), "dock shows hollow at start");
  }
}

function suiteFuzz() {
  console.log("[fuzz] random players, all nights");
  let bad = 0, jumps = 0;
  for (let n = 0; n < 5; n++)
    for (let seed = 1; seed <= 150; seed++) {
      const g = createNight(n, { seed, skipIntro: true });
      let r = seed * 77;
      const rnd = () => ((r = (Math.imul(r, 1664525) + 1013904223) >>> 0) / 4294967296);
      const pos = Object.fromEntries(ROBOT_IDS.map((id) => [id, g.robots[id].node]));
      let jc = 0;
      while (g.phase !== "won" && g.phase !== "lost") {
        const x = rnd();
        if (x < 0.02) g.toggleDoor(rnd() < 0.5 ? "L" : "R");
        else if (x < 0.04) g.toggleLight(rnd() < 0.5 ? "L" : "R");
        else if (x < 0.05) g.toggleMonitor();
        else if (x < 0.07) g.setCam(CAMS[Math.floor(rnd() * 8)].id);
        g.step(1 / 30);
        for (const e of g.takeEvents()) {
          if (e.type === "move") {
            if (pos[e.id] !== e.from || !GRAPH[e.from].includes(e.to)) bad++;
            pos[e.id] = e.to;
          }
          if (e.type === "jumpscare") {
            jc++;
            const k = e.id;
            const side = { leftDoor: "L", rightDoor: "R" }[g.robots[k].node];
            // a regular attack only comes from an open doorway (power-out attack is the Watcher in the dark)
            if (!g.out && side && g.doors[side]) bad++;
            if (!g.out && !side) bad++;
          }
          if (e.type === "arrive" && !["leftDoor", "rightDoor"].includes(g.robots[e.id].node)) bad++;
        }
        if (g.power < 0 || g.power > 100) bad++;
      }
      if (jc > 1) bad++;
      jumps += jc;
    }
  ok(bad === 0, `invariants (${bad} violations)`);
  console.log(`  ${jumps} jumpscares across 750 random runs, ${bad} violations`);
}

function suiteBalance() {
  console.log("[balance] win rates per night (smart bot skill .5/.75/.95, idle, door camper)");
  const N = 200;
  const rate = {};
  for (let n = 0; n < 5; n++) {
    const row = [];
    for (const skill of [0.5, 0.75, 0.95]) {
      let w = 0, out = 0, minP = 0;
      for (let seed = 1; seed <= N; seed++) {
        const g = playNight(createNight, n, { seed: seed * 31 + n, skill });
        if (g.phase === "won") w++;
        if (g.out) out++;
        minP += g.stats.minPower;
      }
      rate[`${n}:${skill}`] = w / N;
      row.push(`skill ${skill}: ${((100 * w) / N).toFixed(0)}% win, ${out} powerouts, avg min power ${(minP / N).toFixed(0)}%`);
    }
    let idle = 0, camp = 0, campOut = 0;
    for (let seed = 1; seed <= N; seed++) {
      if (playNight(createNight, n, { seed, bot: "idle" }).phase === "won") idle++;
      const c = playNight(createNight, n, { seed, bot: "camper" });
      if (c.phase === "won") camp++;
      if (c.out) campOut++;
    }
    rate[`${n}:camp`] = camp / N;
    rate[`${n}:idle`] = idle / N;
    console.log(`  N${n + 1}: ${row.join(" | ")} | idle ${((100 * idle) / N).toFixed(0)}% | camper ${((100 * camp) / N).toFixed(0)}% (${campOut} powerouts)`);
  }
  for (let n = 0; n < 5; n++) {
    ok(rate[`${n}:idle`] < 0.05, `N${n + 1}: doing nothing loses`);
    ok(rate[`${n}:0.95`] >= 0.9, `N${n + 1}: an attentive player can win`);
    if (n >= 2) ok(rate[`${n}:camp`] < 0.05, `N${n + 1}: camping both doors runs out of power`);
  }
  ok(rate["0:0.5"] > rate["4:0.5"] + 0.15, "Night 5 is clearly harder than Night 1");
}

const which = process.argv[2] || "all";
if (which === "one" || which === "all") suiteOne();
if (which === "core" || which === "all") suiteCore();
if (which === "fuzz" || which === "all") suiteFuzz();
if (which === "balance" || which === "all") suiteBalance();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
