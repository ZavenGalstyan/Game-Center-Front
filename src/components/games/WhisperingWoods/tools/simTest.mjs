/**
 * Headless checks for Whispering Woods (node, no browser):
 *   node src/components/games/WhisperingWoods/tools/simTest.mjs [layout|move|win|monster|all]
 */
import { LAYOUT, createGame, resolve, lineBlocked, clearance, flowField, cellOf, UNREACHED, TUNING } from "../sim.js";
import { HALF, START, GATE, PLAYER_R, LANDMARKS } from "../data.js";
import { createBot, nearestOrder } from "./bot.mjs";

let pass = 0, fail = 0;
const ok = (cond, msg) => {
  if (cond) pass++;
  else {
    fail++;
    console.log("  FAIL:", msg);
  }
};
const section = (s) => console.log(`\n== ${s}`);
const run = (g, frames, inputFn) => {
  for (let i = 0; i < frames && g.state === "play"; i++) {
    const inp = inputFn ? inputFn(i) : {};
    if (inp && inp.stuck) return inp.stuck;
    g.update(1 / 60, inp);
  }
  return null;
};

function testLayout() {
  section("layout");
  const L = LAYOUT;
  console.log(`  colliders=${L.colliders.length} trees=${L.trees.length} (inside ${L.trees.filter((t) => t.inside).length}) rocks=${L.rocks.length} parts=${L.parts.length}`);
  ok(L.trees.filter((t) => t.inside).length > 150, "enough trees inside the map");
  ok(L.notes.length === 8, "8 notes");
  ok(new Set(L.notes.map((n) => n.lm)).size === 8, "notes are at 8 distinct landmarks");
  ok(clearance(START.x, START.z) > 2, "start is clear");
  const field = flowField(cellOf(START.x, START.z));
  for (const n of L.notes) {
    ok(clearance(n.stand.x, n.stand.z) > PLAYER_R + 0.05, `note ${n.i} (${n.place}) stand point is clear (${clearance(n.stand.x, n.stand.z).toFixed(2)})`);
    ok(field[cellOf(n.stand.x, n.stand.z)] < UNREACHED, `note ${n.i} (${n.place}) reachable from start`);
    ok(!lineBlocked(n.stand.x, n.stand.z, n.x + n.nx * 0.3, n.z + n.nz * 0.3), `note ${n.i} visible from its stand point`);
  }
  ok(field[cellOf(GATE.x, GATE.z + 3)] < UNREACHED, "gate reachable from start");
  for (const p of L.nav) ok(clearance(p.x, p.z) > 0.5, `nav point ${p.x},${p.z} clear (${clearance(p.x, p.z).toFixed(2)})`);
  let t0 = performance.now();
  for (let i = 0; i < 10; i++) flowField(cellOf(i * 5 - 25, 0));
  const ms = (performance.now() - t0) / 10;
  console.log(`  flowField ${ms.toFixed(1)} ms`);
  ok(ms < 25, "flow field is fast enough");
}

function testMove() {
  section("movement & collision");
  // walking forward from start for 2 s moves ~6.6 m north
  let g = createGame({ seed: 1, noMonster: true });
  run(g, 120, () => ({ f: true }));
  const d = START.z - g.player.z;
  ok(d > 5.5 && d < 7, `walk 2 s ≈ 6.6 m (got ${d.toFixed(2)})`);
  // sprint drains stamina; exhaustion stops sprint
  g = createGame({ seed: 1, noMonster: true });
  run(g, 60, () => ({ f: true, sprint: true }));
  ok(g.player.sprinting && g.player.stamina < 90, `sprinting drains stamina (${g.player.stamina.toFixed(0)})`);
  for (let i = 0; i < 600 && !g.player.exhausted; i++) g.update(1 / 60, { f: true, sprint: true });
  ok(g.player.exhausted, "stamina runs out while sprinting");
  run(g, 20, () => ({ f: true, sprint: true }));
  ok(!g.player.sprinting && g.player.speed < 3.5, "cannot sprint while exhausted");
  run(g, 300, () => ({ f: true }));
  ok(g.player.stamina > 50 && !g.player.exhausted, `stamina regenerates while walking (${g.player.stamina.toFixed(0)})`);

  // every collider: walking into it from 8 directions never ends inside
  let inside = 0, tests = 0;
  for (const c of LAYOUT.colliders) {
    if (c.gate) continue;
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      const p = { x: c.x + Math.sin(a) * (c.br + 2), z: c.z + Math.cos(a) * (c.br + 2) };
      resolve(p, PLAYER_R);
      for (let s = 0; s < 60; s++) {
        p.x += -Math.sin(a) * 0.2;
        p.z += -Math.cos(a) * 0.2;
        resolve(p, PLAYER_R);
      }
      tests++;
      for (const c2 of LAYOUT.colliders) {
        if (c2.gate) continue;
        if (c2.t === "c" ? Math.hypot(p.x - c2.x, p.z - c2.z) < c2.r + PLAYER_R - 0.02 : false) {
          inside++;
          break;
        }
      }
    }
  }
  ok(inside === 0, `pushed into no circle collider (${inside}/${tests})`);

  // cabin walls: cannot walk through the west wall from outside
  const cab = LANDMARKS.find((l) => l.id === "cabin");
  g = createGame({ seed: 1, noMonster: true });
  g.player.x = cab.x - 6;
  g.player.z = cab.z - 1;
  g.player.yaw = -Math.PI / 2; // face +x (east)
  run(g, 240, () => ({ f: true }));
  ok(g.player.x < cab.x - 3.5 - PLAYER_R + 0.02, `west cabin wall blocks (x=${g.player.x.toFixed(2)})`);
  // but the door lets you in
  g.player.x = cab.x + 6;
  g.player.z = cab.z;
  g.player.yaw = Math.PI / 2; // face -x
  run(g, 150, () => ({ f: true }));
  ok(g.player.x < cab.x + 2, `door lets the player in (x=${(g.player.x - cab.x).toFixed(2)})`);
  // map bounds
  g.player.x = 0;
  g.player.z = 40;
  g.player.yaw = -Math.PI / 2;
  for (let i = 0; i < 60 * 30 && g.player.x < HALF - 0.01; i++) g.update(1 / 60, { f: true, r: i % 200 < 100 });
  ok(Math.abs(g.player.x) <= HALF + 1e-6 && Math.abs(g.player.z) <= HALF + 1e-6, "player stays inside bounds");
  // the closed gate blocks
  g = createGame({ seed: 1, noMonster: true });
  g.player.x = 0;
  g.player.z = GATE.z + 4;
  g.player.yaw = 0;
  run(g, 240, () => ({ f: true }));
  ok(g.state === "play" && g.player.z > GATE.z, `closed gate blocks the exit (z=${g.player.z.toFixed(2)})`);
  g.interact();
  ok(g.events.some((e) => e.type === "gateLocked"), "pressing E at the locked gate explains it");
  // fast-diagonal tunnelling check against the fence (thin)
  const fence = LANDMARKS.find((l) => l.id === "fence");
  g.player.x = fence.x - 3;
  g.player.z = fence.z - 8;
  g.player.yaw = -Math.PI / 2;
  run(g, 240, () => ({ f: true, sprint: true }));
  ok(g.player.x < fence.x, `thin fence blocks a sprint (x=${(g.player.x - fence.x).toFixed(2)})`);
}

function testWin() {
  section("winning playthrough (no creature)");
  for (const seed of [1, 2]) {
    const g = createGame({ seed, noMonster: true });
    const order = seed === 1 ? nearestOrder(g) : nearestOrder(g).reverse();
    const bot = createBot(g, { order });
    const counts = [];
    let last = 0;
    const err = run(g, 60 * 600, () => {
      if (g.collected !== last) {
        last = g.collected;
        counts.push(last);
      }
      return bot();
    });
    if (err) console.log("  bot:", err);
    ok(!err, `bot did not get stuck (seed ${seed})`);
    ok(g.collected === 8, `collected 8/8 (seed ${seed}, got ${g.collected})`);
    ok(g.gateOpen, "gate opened after 8 notes");
    ok(g.state === "won", `escaped through the gate (state ${g.state}, t=${g.t.toFixed(0)}s)`);
    console.log(`  seed ${seed}: won in ${g.t.toFixed(0)} s of game time`);
  }
  // gate only opens on the 8th
  const g = createGame({ seed: 3, noMonster: true });
  for (let i = 0; i < 7; i++) g.notes[i].taken = true;
  g.collected = 7;
  ok(!g.gateOpen, "gate closed at 7/8");
}

function testMonster() {
  section("creature AI");
  // 1) spawns are never in front of the player
  let bad = 0, total = 0;
  for (let seed = 1; seed <= 60; seed++) {
    const g = createGame({ seed });
    g.player.x = (seed * 13) % 100 - 50;
    g.player.z = (seed * 29) % 100 - 50;
    resolve(g.player, PLAYER_R);
    g.player.yaw = seed * 0.7;
    g.collected = seed % 9;
    g.awake = true;
    g._spawn();
    if (g.monster.mode === "hidden") continue;
    total++;
    const fx = -Math.sin(g.player.yaw), fz = -Math.cos(g.player.yaw);
    const dx = g.monster.x - g.player.x, dz = g.monster.z - g.player.z, d = Math.hypot(dx, dz);
    if ((dx * fx + dz * fz) / d > Math.cos((79 * Math.PI) / 180)) bad++;
  }
  ok(total > 45, `creature spawned in ${total}/60 trials`);
  ok(bad === 0, `never spawned in front of the player (${bad} bad)`);

  // 2) dormant until the first note (or 75 s)
  let g = createGame({ seed: 5 });
  run(g, 60 * 60);
  ok(g.monster.mode === "hidden", "dormant before the first note");
  run(g, 60 * 40);
  ok(g.monster.mode !== "hidden" || g.monster.appearances > 0, "wakes up after 75 s even with no notes");

  // 3) a standing player gets caught; game over
  let caught = 0;
  for (let seed = 1; seed <= 6; seed++) {
    g = createGame({ seed });
    g.collected = 4;
    g.awake = true;
    g.monster.timer = 0.1;
    run(g, 60 * 90);
    if (g.state === "caught") caught++;
  }
  ok(caught >= 5, `idle player is caught (${caught}/6)`);
  ok(g.events.some((e) => e.type === "caught") || caught === 6, "caught event emitted");

  // 4) states seen across a long session with a wandering player
  const seen = new Set();
  let catches = 0;
  for (let seed = 1; seed <= 4; seed++) {
    g = createGame({ seed: seed * 7 });
    g.collected = 2;
    g.awake = true;
    g.monster.timer = 1;
    let turn = 0;
    run(g, 60 * 240, (i) => {
      seen.add(g.monster.mode);
      if (i % 90 === 0) turn = (Math.random() - 0.5) * 0.06;
      g.player.yaw += turn;
      return { f: true };
    });
    if (g.state === "caught") catches++;
  }
  for (const m of ["hidden", "stalk", "chase"]) ok(seen.has(m), `creature used state '${m}'`);
  console.log(`  states seen: ${[...seen].join(", ")}; wandering player caught ${catches}/4`);

  // 5) a sprinting player escapes a low-threat chase
  g = createGame({ seed: 11 });
  g.awake = true;
  g.player.x = 0;
  g.player.z = 50;
  g.player.yaw = Math.PI; // facing south toward the start clearing
  g._appear("chase", { x: 0, z: 40 }, 0);
  let minD = Infinity;
  run(g, 60 * 6, () => {
    minD = Math.min(minD, g.monster.dist);
    return { f: true, sprint: true };
  });
  ok(g.state === "play", `sprinting player outruns a 0-note chase (min dist ${minD.toFixed(1)})`);
  // 6) at 8 notes, chase speed is higher
  ok(3.5 + 1.9 * 1 < TUNING.sprint, "max chase speed is still below sprint speed");

  // 7) wander state appears at low threat
  let wander = 0;
  for (let seed = 1; seed <= 20; seed++) {
    g = createGame({ seed });
    g.awake = true;
    g._spawn();
    if (g.monster.mode === "wander") wander++;
  }
  ok(wander > 3, `wander used at low threat (${wander}/20)`);

  // 8) glimpse after note 3
  g = createGame({ seed: 4 });
  g.awake = true;
  g.pendingGlimpse = true;
  g._spawn();
  ok(g.monster.mode === "watch" || g.monster.mode === "stalk" || g.monster.mode === "wander", `glimpse spawn (${g.monster.mode})`);

  // 9) caught freezes the run
  g = createGame({ seed: 2 });
  g.awake = true;
  g._appear("chase", { x: g.player.x, z: g.player.z - 1.0 }, 0);
  g.update(1 / 60, {});
  ok(g.state === "caught", "touching the creature ends the run");
  const px = g.player.x;
  g.update(1 / 60, { f: true });
  ok(g.player.x === px, "player frozen after being caught");

  // 10) full win with the creature active (bot ignores it; several seeds — at least one win shows the loop is fair)
  let wins = 0, deaths = 0;
  for (let seed = 1; seed <= 8; seed++) {
    g = createGame({ seed: seed * 101 });
    const bot = createBot(g);
    run(g, 60 * 600, () => bot());
    if (g.state === "won") wins++;
    else if (g.state === "caught") deaths++;
  }
  console.log(`  blind route bot with creature active: ${wins} wins, ${deaths} deaths / 8`);
  ok(deaths >= 2, "creature is a real threat to a careless player");
  // evasive bot (flees when hunted, then resumes) — should usually survive
  let ew = 0, ed = 0, times = [];
  const modes = new Set();
  for (let seed = 1; seed <= 12; seed++) {
    g = createGame({ seed: seed * 37 });
    const bot = createBot(g, { evade: true });
    run(g, 60 * 900, () => {
      modes.add(g.monster.mode);
      return bot();
    });
    if (g.state === "won") {
      ew++;
      times.push(g.t.toFixed(0));
    } else if (g.state === "caught") ed++;
  }
  console.log(`  evasive bot: ${ew} wins, ${ed} deaths / 12 (win times ${times.join(",")}s); states ${[...modes].join(",")}`);
  ok(ew >= 6, "an evasive player usually wins");
  ok(modes.has("retreat"), "creature retreats after losing a chase");
}

const which = process.argv[2] || "all";
if (which === "layout" || which === "all") testLayout();
if (which === "move" || which === "all") testMove();
if (which === "win" || which === "all") testWin();
if (which === "monster" || which === "all") testMonster();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
