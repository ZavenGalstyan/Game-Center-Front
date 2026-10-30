/**
 * Headless rule / physics checks for Flame & Aqua.
 *   node src/components/games/FlameAqua/tools/simTest.mjs [core|fuzz|input|save|all]
 * Level solvability lives in tools/levelTest.mjs.
 */
import { T, DT, COLS, ROWS, TILE, step, tileAt } from "../engine/sim.js";
import { buildLevel, validateLevel } from "../engine/level.js";
import { LEVELS } from "../data/levels.js";
import { createInput } from "../ui/input.js";
import { loadProgress, saveProgress, recordWin, SAVE_KEY } from "../engine/save.js";
import { createBot } from "./bot.mjs";
import { ROUTES } from "./routes.mjs";

let pass = 0;
let fail = 0;
const ok = (cond, msg) => {
  if (cond) pass++;
  else {
    fail++;
    console.log("  FAIL", msg);
  }
};
const section = (n) => console.log(`\n# ${n}`);

/** small test room: rows are drawn bottom-up over a bordered 32×18 grid */
function room(rows, objects = [], extra = {}) {
  const map = Array.from({ length: ROWS }, (_, y) => (y === 0 || y === ROWS - 1 ? "#".repeat(COLS) : "#" + ".".repeat(COLS - 2) + "#"));
  rows.forEach((r, i) => {
    const y = ROWS - rows.length + i;
    map[y] = r.padEnd(COLS, "#").slice(0, COLS);
  });
  return { id: 99, world: 0, name: "test", map, objects, ...extra };
}
const run = (s, secs, inp = {}) => {
  for (let i = 0; i < secs / DT; i++) step(s, typeof inp === "function" ? inp(s) : inp);
};
const F = (o) => ({ flame: o });
const A = (o) => ({ aqua: o });
const cxT = (p) => (p.x + p.w / 2) / T;

/* ===================================================================== core */
function core() {
  section("hazard immunity");
  {
    const s = buildLevel(room(["#1.2...........R.B............#", "#fffwww#########################"]));
    run(s, 0.1);
    ok(!s.players[0].dead, "Flame survives standing on fire");
    ok(s.players[1].dead && s.players[1].cause === "fire", "Aqua dies standing on fire");
  }
  {
    const s = buildLevel(room(["#.2..1.........R.B............#", "#####www########################"]));
    run(s, 0.1);
    ok(!s.players[1].dead, "Aqua survives standing on water");
    ok(s.players[0].dead && s.players[0].cause === "water", "Flame dies standing on water");
  }
  for (const who of ["flame", "aqua"]) {
    const s = buildLevel(room([who === "flame" ? "#1..2..........R.B............#" : "#2..1..........R.B............#", "#ggg############################"]));
    run(s, 0.1);
    ok(s.players.find((p) => p.id === who).dead, `${who} dies in toxic goo`);
  }
  {
    // a pool edge needs ≥4 px of foot cover; brushing the rim is safe
    const s = buildLevel(room(["#1...2.........R.B............#", "#####www########################"]));
    s.players[0].x = 5 * T - s.players[0].w + 3; // 3 px over the water tile
    run(s, 0.1);
    ok(!s.players[0].dead, "3 px over a pool edge is forgiven");
    s.players[0].x = 5 * T - s.players[0].w + 6;
    run(s, 0.1);
    ok(s.players[0].dead, "6 px into a pool kills");
  }
  section("moving hazards");
  {
    const s = buildLevel(room(["#1.2...........R.B............#", "################################"], [{ t: "fire", x: 3.5, y: 16.5 }]));
    run(s, 0.05);
    ok(!s.players[0].dead && s.players[1].dead, "fire orb kills Aqua only");
    const s2 = buildLevel(room(["#1.2...........R.B............#", "################################"], [{ t: "water", x: 1.5, y: 16.5 }]));
    run(s2, 0.05);
    ok(s2.players[0].dead && !s2.players[1].dead, "water orb kills Flame only");
    const s3 = buildLevel(room(["#1............2R.B............#", "################################"], [{ t: "saw", x: 1.5, y: 16.5 }]));
    run(s3, 0.05);
    ok(s3.players[0].dead && s3.players[0].cause === "saw", "saw kills Flame");
  }

  section("gems belong to one hero");
  {
    const s = buildLevel(room(["#2.r.b..1......R.B............#", "################################"]));
    run(s, 1.2, A({ r: true }));
    ok(s.players[1].gems === 1 && s.gems.find((g) => g.el === "fire").taken === false, "Aqua walks through a red gem without taking it, takes the blue one");
    run(s, 1.5, F({ l: true }));
    ok(s.players[0].gems === 1 && s.gems.find((g) => g.el === "water").taken, "Flame takes red gem; blue stays taken by Aqua");
  }

  section("both exits required");
  {
    const s = buildLevel(room(["#.1R....2B.....................#", "################################"]));
    run(s, 0.12, F({ r: true }));
    run(s, 0.4);
    ok(s.players[0].atExit && s.status === "playing", "only Flame at its exit: level continues");
    run(s, 0.12, A({ r: true }));
    run(s, 0.3);
    ok(s.status === "won", "both at matching exits: level complete");
    const s2 = buildLevel(room(["#.1B....2R.....................#", "################################"]));
    run(s2, 0.12, { flame: { r: true }, aqua: { r: true } });
    run(s2, 0.5);
    ok(s2.status === "playing" && !s2.players[0].atExit, "standing in the other hero's door does not count");
  }

  section("jump + collisions");
  {
    const s = buildLevel(room(["#.............................#", "#.....##.......................#", "#1.2..##.......R.B.............#", "################################"]));
    let maxUp = 0;
    const y0 = s.players[0].y;
    run(s, 0.02, F({ jp: true }));
    run(s, 0.6, (st) => {
      maxUp = Math.max(maxUp, y0 - st.players[0].y);
      return {};
    });
    ok(maxUp > 75 && maxUp < 82, `jump height ≈ 2.6 tiles (got ${(maxUp / T).toFixed(2)})`);
    run(s, 1.5, F({ r: true }));
    ok(s.players[0].x + s.players[0].w <= 6 * T + 1e-6, "running into a 2-high wall stops at its face");
    run(s, 0.02, F({ r: true, jp: true }));
    run(s, 0.45, F({ r: true }));
    ok(s.players[0].y + s.players[0].h <= 15 * T + 1e-6 && s.players[0].x > 6 * T - 5, "a 2-tile ledge can be climbed by jumping");
  }
  {
    // jump buffer: a press just before landing still jumps
    const s = buildLevel(room(["#1.2...........R.B............#", "################################"]));
    run(s, 0.02, F({ jp: true }));
    run(s, 0.6);
    const before = s.players[0].jumps;
    // falling now; press 0.08 s before touching down
    while (!(s.players[0].vy > 0 && s.players[0].y + s.players[0].h > 17 * T - 12)) step(s, {});
    step(s, F({ jp: true }));
    run(s, 0.2);
    ok(s.players[0].jumps === before + 1, "jump pressed shortly before landing is buffered");
  }

  section("boxes");
  {
    const s = buildLevel(room(["#1..X..................#R.B.2.#", "################################"]));
    const b = s.boxes[0];
    run(s, 1, F({ r: true }));
    ok(b.x > 4 * T + 5, "walking into a box pushes it");
    ok(s.players[0].x + s.players[0].w <= b.x + 1e-6, "hero never overlaps the box");
    run(s, 6, F({ r: true }));
    ok(Math.abs(b.x + b.w - 23 * T) < 1e-6 || b.x + b.w <= 23 * T, "box stops at a wall");
  }
  {
    // box drops into a one-tile pit and becomes a floor
    const s = buildLevel(room(["#1.X....2......R.B.............#", "#####.##########################"]));
    run(s, 2.5, F({ r: true }));
    const b = s.boxes[0];
    ok(Math.abs(b.x - (5 * T + 1)) < 2.5 && b.y + b.h === 18 * T, "box falls into the pit");
    ok(s.players[0].x > 6 * T, "hero walks over the filled pit (steps up the 2 px lip)");
  }
  {
    // a box presses a plate; heroes stand on boxes
    const s = buildLevel(room(["#1X.....#2.....R.B............#", "################################"], [{ t: "plate", x: 7, y: 16, ch: "a" }, { t: "door", x: 20, y: 14, h: 3, ch: "a" }]));
    run(s, 2, F({ r: true }));
    ok(s.plates[0].down || s.ch.a, "a box on a plate holds it down");
  }
  {
    const s = buildLevel(room(["#.X1.2.........R.B............#", "################################"]));
    run(s, 0.02, F({ l: true, jp: true }));
    run(s, 0.1, F({ l: true }));
    run(s, 0.6);
    ok(Math.abs(s.players[0].y + s.players[0].h - s.boxes[0].y) < 0.01 && s.players[0].ground, "hero can stand on a box");
  }

  section("doors");
  {
    const s = buildLevel(room(["#1..........2..R.B............#", "################################"], [{ t: "lever", x: 4, y: 16, ch: "a" }, { t: "door", x: 8, y: 14, h: 3, ch: "a" }]));
    run(s, 0.8, F({ r: true }));
    ok(s.levers[0].on && s.ch.a, "walking right through a lever switches it on");
    run(s, 0.6);
    ok(s.doors[0].open === 1 && !s.doors[0].solid, "linked door opens");
    run(s, 2, F({ r: true }));
    ok(s.players[0].x > 9 * T, "hero walks through the open door");
    run(s, 3, F({ l: true }));
    ok(!s.levers[0].on, "walking left through the lever switches it off");
  }
  {
    // a closing door waits while a hero stands in it
    const s = buildLevel(room(["#.1.2..........R.B............#", "################################"], [{ t: "plate", x: 2, y: 16, ch: "a" }, { t: "door", x: 8, y: 15, h: 2, ch: "a" }]));
    run(s, 0.5);
    ok(s.ch.a, "plate pressed");
    run(s, 1);
    // move aqua into the doorway, then flame off the plate
    run(s, 3, (st) => (cxT(st.players[1]) < 8.5 ? A({ r: true }) : {}));
    run(s, 1, F({ l: true }));
    ok(!s.ch.a && s.doors[0].open > 0.4 && !s.players[1].dead, "closing door stops on Aqua's head (no crush)");
    const p = s.players[1];
    ok(!(s.doors[0].solid && p.x < s.doors[0].solid.x + s.doors[0].solid.w && p.x + p.w > s.doors[0].solid.x && p.y < s.doors[0].solid.y + s.doors[0].solid.h), "door never overlaps Aqua");
    run(s, 2, A({ r: true }));
    run(s, 1);
    ok(s.doors[0].open === 0, "door closes once the way is clear");
  }
  {
    // timed gate: stays open `hold` seconds after the plate is released
    const s = buildLevel(room(["#1.2...........R.B............#", "################################"], [{ t: "plate", x: 1, y: 16, ch: "a", hold: 2 }, { t: "door", x: 10, y: 15, h: 2, ch: "a" }]));
    run(s, 0.5);
    ok(s.ch.a, "timed plate on");
    run(s, 0.5, F({ r: true }));
    run(s, 1.2);
    ok(s.ch.a, "still on 1.2 s after release");
    run(s, 1);
    ok(!s.ch.a, "off after the hold time");
  }
  {
    // AND door needs both channels
    const s = buildLevel(room(["#1.2...........R.B............#", "################################"], [{ t: "plate", x: 1, y: 16, ch: "a" }, { t: "plate", x: 6, y: 16, ch: "b" }, { t: "door", x: 10, y: 15, h: 2, ch: "a+b" }]));
    run(s, 0.6);
    ok(s.ch.a && !s.ch.b && s.doors[0].open === 0, "AND door stays shut with one plate");
    run(s, 3, (st) => (cxT(st.players[1]) < 6.5 ? A({ r: true }) : {}));
    run(s, 0.6);
    ok(s.ch.a && s.ch.b && s.doors[0].open === 1, "AND door opens with both plates");
  }

  section("platforms");
  {
    // elevator lifts a hero
    const s = buildLevel(room(["#1.2.....................R..B#", "################################"], [{ t: "plat", x: 5, y: 16.5, w: 3, to: [5, 12.5], ch: "a" }, { t: "lever", x: 10, y: 11, ch: "a", on: true }]));
    const p = s.players[0];
    const pl = s.platforms[0];
    p.x = 6 * T;
    p.y = pl.y - p.h;
    run(s, 0.5);
    ok(p.x > 5 * T && Math.abs(p.y + p.h - pl.y) < 0.01, "hero rides on the platform");
    run(s, 3);
    ok(Math.abs(pl.y - 12.5 * T) < 0.01 && Math.abs(p.y + p.h - pl.y) < 0.01, "elevator carried the hero to the top");
  }
  {
    // a descending platform stops on a hero instead of crushing
    const s = buildLevel(room(["#1.2...........R.B............#", "################################"], [{ t: "plat", x: 1, y: 13, w: 3, to: [1, 16.8] }]));
    s.platforms[0].goal = s.platforms[0].b;
    s.platforms[0].mode = "loop";
    run(s, 4);
    const p = s.players[0];
    const pl = s.platforms[0];
    ok(pl.y + pl.h <= p.y + 1e-6, "platform rests on the hero's head, no overlap");
    ok(!p.dead, "hero not crushed");
    run(s, 1, F({ r: true }));
    ok(p.x > 4 * T, "hero can walk out from under it");
  }
  {
    // horizontal mover carries a rider
    const s = buildLevel(room(["#.............................#", "#.............................#", "#1.2...........R.B............#", "################################"], [{ t: "plat", x: 1, y: 14.5, w: 2, to: [10, 14.5], mode: "loop" }]));
    s.players[0].y = 14.5 * T - s.players[0].h;
    s.players[0].x = 1.5 * T;
    run(s, 2);
    ok(s.players[0].x > 4 * T && Math.abs(s.players[0].y + s.players[0].h - s.platforms[0].y) < 0.01, "rider moves with a horizontal platform");
  }

  section("light");
  {
    const s = buildLevel(room(["#..............................#", "#..............................#", "#1.2...........R.B.............#", "################################"], [
      { t: "emit", x: 1, y: 14, dir: "r" }, { t: "mirror", x: 8, y: 14, o: "/" }, { t: "sensor", x: 8, y: 1, ch: "a" }, { t: "sensor", x: 20, y: 14, ch: "b" },
    ]));
    run(s, 0.1);
    ok(s.sensors[0].lit && !s.sensors[1].lit, "beam reflects up off '/' into the sensor");
    ok(s.beams.length === 2, "two beam segments");
  }
  {
    const s = buildLevel(room(["#..............................#", "#..............................#", "#1.2...........R.B.............#", "################################"], [
      { t: "emit", x: 1, y: 14, dir: "r" }, { t: "mirror", x: 8, y: 14, o: "/", ch: "a" }, { t: "sensor", x: 8, y: 16, ch: "c" }, { t: "lever", x: 3, y: 16, ch: "a" },
    ]));
    run(s, 0.1);
    ok(!s.sensors[0].lit, "unflipped mirror points away from the floor sensor");
    run(s, 0.5, F({ r: true }));
    run(s, 0.1);
    ok(s.ch.a && s.sensors[0].lit, "lever flips the mirror; beam now goes down into the sensor");
  }
  {
    // pushable mirror box
    const s = buildLevel(room(["#..............................#", "#..............................#", "#1\\...........2R.B.............#", "################################"], [{ t: "emit", x: 12, y: 16, dir: "l" }, { t: "sensor", x: 2, y: 13, ch: "a" }]));
    run(s, 0.1);
    ok(s.sensors[0].lit, "beam bounces off the mirror box up into a sensor");
    run(s, 0.6, F({ r: true }));
    run(s, 0.1);
    ok(!s.sensors[0].lit, "pushing the mirror box away breaks the light path");
    ok(s.beams.length >= 2, "beam still reflects off the moved box");
  }
  {
    // boxes and closed doors block light
    const s = buildLevel(room(["#1.2...........R.B.............#", "################################"], [{ t: "emit", x: 25, y: 16, dir: "l" }, { t: "sensor", x: 20, y: 16, ch: "a" }, { t: "door", x: 22, y: 16, ch: "b" }]));
    run(s, 0.1);
    ok(!s.sensors[0].lit, "closed door blocks the beam");
  }

  section("restart resets everything");
  for (const def of LEVELS.slice(0, Math.min(LEVELS.length, 40))) {
    const fresh = JSON.stringify(strip(buildLevel(def)));
    const s = buildLevel(def);
    const bot = createBot(ROUTES[def.id - 1] || { f: [], a: [] });
    for (let i = 0; i < 1200; i++) step(s, bot(s));
    const again = JSON.stringify(strip(buildLevel(def)));
    ok(fresh === again, `L${def.id}: rebuilding after play gives the identical initial state`);
  }

  section("determinism");
  for (const def of LEVELS.slice(0, 5)) {
    const r1 = playOnce(def);
    const r2 = playOnce(def);
    ok(r1 === r2, `L${def.id}: same inputs → same result (${r1})`);
  }
}

function strip(s) {
  const { def, ...rest } = s;
  return { ...rest, tiles: [...s.tiles], doors: s.doors.map(({ solid, ...d }) => ({ ...d, solid: solid && { ...solid, door: null } })) };
}
function playOnce(def) {
  const s = buildLevel(def);
  const bot = createBot(ROUTES[def.id - 1]);
  while (s.status === "playing" && s.time < 200 && !bot.stuck().length) step(s, bot(s));
  return `${s.status}@${s.tick}`;
}

/* ===================================================================== fuzz */
function solidOverlap(s, b) {
  const x0 = Math.floor(b.x / T);
  const x1 = Math.floor((b.x + b.w - 1e-3) / T);
  const y0 = Math.floor(b.y / T);
  const y1 = Math.floor((b.y + b.h - 1e-3) / T);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (tileAt(s, x, y) !== TILE.EMPTY) {
    const ix = Math.min(b.x + b.w, (x + 1) * T) - Math.max(b.x, x * T);
    const iy = Math.min(b.y + b.h, (y + 1) * T) - Math.max(b.y, y * T);
    if (ix > 0.01 && iy > 0.01) return `tile ${x},${y}`;
  }
  const rects = [...s.platforms, ...s.doors.filter((d) => d.solid).map((d) => d.solid), ...s.boxes.filter((o) => o !== b)];
  for (const r of rects) {
    const ix = Math.min(b.x + b.w, r.x + r.w) - Math.max(b.x, r.x);
    const iy = Math.min(b.y + b.h, r.y + r.h) - Math.max(b.y, r.y);
    if (ix > 0.05 && iy > 0.05) return `${r.kind} at ${(r.x / T).toFixed(1)},${(r.y / T).toFixed(1)}`;
  }
  return null;
}

function fuzz() {
  section("random-input fuzz: no tunnelling, no overlaps, no NaN");
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
  for (const def of LEVELS) {
    let bad = null;
    for (let run = 0; run < 3 && !bad; run++) {
      const s = buildLevel(def);
      // heroes become immortal so they keep exploring
      const keep = {};
      let held = { flame: {}, aqua: {} };
      for (let i = 0; i < 120 * 40 && !bad; i++) {
        if (i % 24 === 0) for (const k of ["flame", "aqua"]) held[k] = { l: rnd() < 0.4, r: rnd() < 0.45, jp: rnd() < 0.35 };
        step(s, { flame: { ...held.flame, jp: held.flame.jp && i % 24 === 0 }, aqua: { ...held.aqua, jp: held.aqua.jp && i % 24 === 0 } });
        if (s.status === "dead") {
          for (const p of s.players) p.dead = false;
          s.status = "playing";
        }
        if (s.status === "won") break;
        for (const b of [...s.players, ...s.boxes]) {
          if (![b.x, b.y, b.vx ?? 0, b.vy].every(Number.isFinite)) bad = `NaN on ${b.kind}`;
          const o = solidOverlap(s, b);
          if (o) bad = `${b.id || "box"} overlaps ${o} at ${(b.x / T).toFixed(2)},${(b.y / T).toFixed(2)} tick ${s.tick}`;
        }
        keep.t = s.tick;
      }
    }
    ok(!bad, `L${def.id} ${def.name}: ${bad || "clean"}`);
  }
}

/* ===================================================================== input */
function input() {
  section("keyboard model");
  const inp = createInput();
  const ev = (code, extra = {}) => ({ code, prevented: false, preventDefault() { this.prevented = true; }, target: null, ...extra });
  const d = (code, extra) => {
    const e = ev(code, extra);
    inp.down(e);
    return e;
  };
  const u = (code) => inp.up(ev(code));
  ok(!d("KeyD").prevented, "keys are ignored while the game is not in play");
  inp.setEnabled(true);
  const all = ["KeyA", "KeyD", "KeyW", "ArrowLeft", "ArrowRight", "ArrowUp"].map((k) => d(k));
  ok(all.every((e) => e.prevented), "all six hero keys preventDefault (no scrolling)");
  let s1 = inp.sample();
  ok(s1.flame.l && s1.flame.r && s1.flame.jp && s1.aqua.l && s1.aqua.r && s1.aqua.jp, "all six keys held at once register for both heroes");
  const s2 = inp.sample();
  ok(!s2.flame.jp && !s2.aqua.jp && s2.flame.l && s2.aqua.r, "jump press is latched for one tick; holds persist");
  d("KeyW", { repeat: true });
  ok(!inp.sample().flame.jp, "auto-repeat of a held jump key does not re-jump");
  u("KeyW");
  d("KeyW");
  u("KeyW");
  const s3 = inp.sample();
  ok(s3.flame.jp && !inp.held.has("KeyW"), "a tap shorter than a frame still jumps");
  ok(d("ArrowDown").prevented && d("Space").prevented, "ArrowDown / Space are swallowed too");
  ok(!d("KeyD", { target: { closest: () => true } }).prevented, "typing in a text field is left alone");
  ok(!d("KeyD", { ctrlKey: true }).prevented, "browser shortcuts (Ctrl+D) pass through");
  inp.clear();
  s1 = inp.sample();
  ok(!s1.flame.l && !s1.aqua.r, "blur/clear releases every key");
  d("KeyD");
  inp.setEnabled(false);
  ok(!inp.sample().flame.r, "leaving play releases held keys");
}

/* ===================================================================== save */
function save() {
  section("save / load");
  const mem = { d: {}, getItem(k) { return this.d[k] ?? null; }, setItem(k, v) { this.d[k] = String(v); } };
  let p = loadProgress(mem);
  ok(p.unlocked === 1 && !Object.keys(p.best).length, "fresh save starts at level 1");
  p = recordWin(p, 1, 12.345, 6);
  saveProgress(p, mem);
  let q = loadProgress(mem);
  ok(q.unlocked === 2 && q.best[1] === 12.35 && q.gems[1] === 6, "win unlocks the next level and stores time + gems");
  q = recordWin(q, 1, 20, 2);
  ok(q.best[1] === 12.35 && q.gems[1] === 6 && q.unlocked === 2, "a slower replay keeps the best time and gem haul");
  q = recordWin(q, 1, 9, 3);
  ok(q.best[1] === 9, "a faster replay replaces the best time");
  q = recordWin(q, 40, 50, 1);
  ok(q.unlocked === 40, "unlock caps at 40");
  mem.d[SAVE_KEY] = "{not json";
  ok(loadProgress(mem).unlocked === 1, "corrupt save falls back to fresh");
  mem.d[SAVE_KEY] = JSON.stringify({ unlocked: 999, best: { 3: -5, 4: "x", 5: 7 }, sound: false });
  const r = loadProgress(mem);
  ok(r.unlocked === 40 && !r.best[3] && !r.best[4] && r.best[5] === 7 && r.sound === false, "out-of-range values are sanitised");
  ok(loadProgress(null).unlocked === 1, "no storage available → fresh progress");
  section("level structure");
  ok(LEVELS.length === 40, `40 levels defined (got ${LEVELS.length})`);
  const sigs = new Set(LEVELS.map((l) => l.map.join("")));
  ok(sigs.size === LEVELS.length, "every level layout is unique");
  for (const def of LEVELS) {
    const errs = validateLevel(def);
    ok(!errs.length, `L${def.id} structure ${errs.join("; ")}`);
  }
}

const mode = process.argv[2] || "all";
if (mode === "core" || mode === "all") core();
if (mode === "fuzz" || mode === "all") fuzz();
if (mode === "input" || mode === "all") input();
if (mode === "save" || mode === "all") save();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
