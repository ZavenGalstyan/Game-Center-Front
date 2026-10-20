// Haunted Mansion Escape — headless checks: full walkthrough, clue
// reachability, wrong answers, save/load, hints and a random-play softlock fuzz.
// node src/components/games/HauntedMansionEscape/tools/simTest.mjs
import { ITEMS, CLUES, ROOMS, ROOM_ORDER, HOTSPOTS, PUZZLES, STEPS, CIRCUIT, CIRCUIT_SOLUTION, GEAR_START, GEAR_TARGET, BOOKS_START, GALLERY_START, LULLABY } from "../data.js";
import { newState, interact, travel, combine, solve, puzzleReady, CHECKS, circuitFlow, gearsAfter, takeHint, currentStep, objective, serialize, deserialize, unlockedRooms } from "../engine.js";

let pass = 0, fail = 0;
const ok = (c, msg) => (c ? pass++ : (fail++, console.log("FAIL:", msg)));

const ANSWERS = {
  clock: { h: 9, m: 15 },
  books: ["red", "blue", "green", "gold", "black"],
  dining: { crown: "goblet", rose: "bell", moon: "teacup", star: "candlestick" },
  musicbox: ["moon", "rose", "bird"],
  safe: "1864",
  piano: ["D", "F", ...LULLABY],
  circuit: CIRCUIT_SOLUTION,
  gallery: ["wedding", "cradle", "three", "seven", "chair"],
  gears: GEAR_TARGET,
  altar: { crown: "signetRing", rose: "roseBrooch", moon: "locket", star: "compass" },
  exit: "clara",
};
// the clues a fair player needs before each puzzle can be reasoned out
const NEEDS = {
  clock: ["hallNote", "portraitPlaque"], books: ["libPoem"], dining: ["crest", "menuCard"], musicbox: ["mirrorMsg"],
  safe: ["mendedNote", "mantel"], piano: ["sheet", "metronome"], gallery: ["galleryPlaque"], gears: ["drawing", "gearPlate"],
  altar: ["crest", "altarText"], exit: ["mirrorMsg", "doorText"],
};

/* ---------------------------------------------------------- static data */
for (const [id, h] of Object.entries(HOTSPOTS)) ok(ROOMS[h.room], `hotspot ${id} room`);
for (const r of ROOM_ORDER) for (const p of ROOMS[r].props) if (p.hs) ok(HOTSPOTS[p.hs]?.room === r, `prop hotspot ${p.hs} in ${r}`);
for (const [id, h] of Object.entries(HOTSPOTS)) ok(ROOMS[h.room].props.some((p) => p.hs === id), `hotspot ${id} has a prop`);
for (const p of Object.values(PUZZLES)) for (const i of [...(p.reward?.give || []), ...(p.reward?.take || []), ...(p.needs || [])]) ok(ITEMS[i], `puzzle item ${i}`);
for (const [pz, cl] of Object.entries(NEEDS)) for (const c of cl) ok(ROOM_ORDER.indexOf(CLUES[c].room) <= ROOM_ORDER.indexOf(PUZZLES[pz].room), `clue ${c} reachable no later than ${pz}`);

/* ---------------------------------------------------- puzzle mechanics */
ok(!circuitFlow(CIRCUIT.start).done, "circuit starts unsolved");
ok(circuitFlow(CIRCUIT_SOLUTION).done, "circuit solution connects");
const gp = [];
{
  let r = [...GEAR_START];
  for (let lever = 0; lever < 3; lever++) while (r[lever] !== GEAR_TARGET[lever] && gp.length < 50) (gp.push(lever), (r = gearsAfter(GEAR_START, gp)));
  ok(String(gearsAfter(GEAR_START, gp)) === String(GEAR_TARGET), `gears solvable with levers (${gp.length} presses)`);
}
ok(!CHECKS.books(BOOKS_START), "books start unsolved");
ok(!CHECKS.gallery(GALLERY_START), "gallery start unsolved");
ok(!CHECKS.gears(GEAR_START), "gears start unsolved");
ok(CHECKS.clock({ h: 21, m: 15 }) && !CHECKS.clock({ h: 9, m: 45 }) && !CHECKS.clock({ h: 3, m: 15 }), "clock check");
ok(!CHECKS.piano(["C", "E", "G", "A", "G", "E"]) && CHECKS.piano(["E", ...LULLABY]), "piano sliding window");
ok(!CHECKS.dining({ crown: "goblet", rose: "teacup", moon: "bell", star: "candlestick" }), "dining wrong placement rejected");
ok(!CHECKS.altar({ crown: "roseBrooch", rose: "signetRing", moon: "locket", star: "compass" }), "altar wrong placement rejected");

/* ------------------------------------------------------- fair player */
// Explores every hotspot of the current room (reading clues), combines,
// tries every held item on every hotspot, and solves ready puzzles — but
// only once every clue a fair player needs is already in the journal.
function step(s, fair = true) {
  const before = serialize(s);
  const here = s.room;
  const spots = Object.keys(HOTSPOTS).filter((h) => HOTSPOTS[h].room === here);
  for (const h of spots) {
    for (const item of [null, ...s.inv]) {
      if (s.room !== here) ({ state: s } = travel(s, here));
      const r = interact(s, h, item);
      if (!r.result.ok) continue;
      s = r.state;
      if (r.result.travel) return { s, moved: true };
      if (r.result.puzzle && puzzleReady(s, r.result.puzzle)) {
        const pz = r.result.puzzle;
        if (fair && !(NEEDS[pz] || []).every((c) => s.clues.includes(c))) continue; // come back once the clues are read
        const w = solve(s, pz, ANSWERS[pz]);
        ok(w.result.ok, `solve ${pz}`);
        s = w.state;
      }
    }
  }
  for (const a of s.inv) for (const b of s.inv) if (a < b) { const c = combine(s, a, b); if (c.result.ok) s = c.state; }
  return { s, moved: false, progressed: serialize(s) !== before };
}
function play(s, fair = true, limit = 400) {
  for (let i = 0; i < limit && !s.won; i++) {
    const r = step(s, fair);
    s = r.s;
    if (r.moved || r.progressed) continue;
    // nothing left here — walk to the room the walkthrough points at
    const st = currentStep(s);
    if (!st || !unlockedRooms(s).includes(st.room)) return s;
    s = travel(s, st.room).state;
  }
  return s;
}

const order = [];
{
  let s = newState();
  ok(objective(s).length > 0, "has an objective at start");
  let rooms = new Set([s.room]);
  for (let i = 0; i < 400 && !s.won; i++) {
    const r = step(s);
    s = r.s;
    if (!rooms.has(s.room)) (rooms.add(s.room), order.push(s.room));
    if (!r.moved && !r.progressed) {
      const st = currentStep(s);
      if (!st) break;
      s = travel(s, st.room).state;
    }
  }
  ok(s.won, "fair walkthrough escapes the mansion");
  ok(rooms.size === 10, `visited all 10 rooms (${rooms.size})`);
  ok(Object.keys(PUZZLES).filter((p) => p !== "mirror").every((p) => s.solved[p]), "every puzzle solved");
  ok(s.f.mirrorRead, "mirror message revealed");
  ok(STEPS.every((st) => st.done(s)), "every walkthrough step done");
  ok(s.inv.every((i) => !["clockKey", "libraryKey", "goblet", "fuse", "signetRing"].includes(i)), "used items consumed");
  console.log("room order:", ["hall", ...order].join(" → "));
}

/* ----------------------------------------------- locks & wrong answers */
{
  let s = newState();
  ok(!interact(s, "libraryDoor").result.travel, "library door locked at start");
  ok(interact(s, "clock").result.puzzle == null, "clock locked before winding");
  ok(!solve(s, "clock", ANSWERS.clock).result.ok, "cannot solve clock before winding");
  ok(!interact(s, "clock", "clockKey").state.f.clockWound, "unheld item ignored");
  s = interact(s, "rug").state;
  ok(s.inv.includes("clockKey"), "rug gives winding key");
  ok(interact(s, "rug").state.inv.length === 1, "rug gives key once");
  const wrong = interact(s, "portrait", "clockKey");
  ok(wrong.result.wrongItem && wrong.state.inv.includes("clockKey"), "wrong item use keeps the item");
  s = interact(s, "clock", "clockKey").state;
  ok(!solve(s, "clock", { h: 3, m: 40 }).result.ok, "wrong clock time rejected");
  ok(!travel(s, "library").result.ok, "map cannot reach locked room");
  s = solve(s, "clock", ANSWERS.clock).state;
  ok(!solve(s, "clock", ANSWERS.clock).result.ok, "puzzle cannot be solved twice");
  ok(s.inv.includes("libraryKey"), "clock gives library key");

  // hints escalate and cap
  const h1 = takeHint(s);
  const h2 = takeHint(h1.state);
  const h3 = takeHint(h2.state);
  const h4 = takeHint(h3.state);
  ok(h1.hint.level === 1 && h2.hint.level === 2 && h3.hint.level === 3 && h4.hint.level === 3, "hints escalate to 3 and cap");
  ok(h4.state.hintsUsed === 3, "hint count counts reveals only");

  // save / load
  const back = deserialize(serialize(h4.state));
  ok(back && serialize(back) === serialize(h4.state), "save/load round trip");
  ok(deserialize("garbage") === null && deserialize({ v: 99 }) === null, "bad saves rejected");
  ok(deserialize({ ...h4.state, room: "attic" }).room === "hall", "save in a locked room falls back to the hall");
  ok(deserialize({ ...h4.state, inv: ["libraryKey", "nope"] }).inv.length === 1, "unknown items dropped on load");
}
{
  // dining needs all four objects; altar needs all relics
  let s = play(newState(), false, 400);
  ok(s.won, "unfair solver also escapes");
}

/* ------------------------------------------------- softlock fuzzing */
function rng(seed) {
  let x = seed >>> 0;
  return () => (x = (x * 1664525 + 1013904223) >>> 0) / 4294967296;
}
const pick = (r, a) => a[Math.floor(r() * a.length)];
let fuzzWins = 0;
const RUNS = 300;
for (let run = 0; run < RUNS; run++) {
  const r = rng(run + 1);
  let s = newState();
  const n = 20 + Math.floor(r() * 400);
  for (let i = 0; i < n && !s.won; i++) {
    const roll = r();
    if (roll < 0.55) {
      const spots = Object.keys(HOTSPOTS).filter((h) => HOTSPOTS[h].room === s.room);
      const item = r() < 0.5 && s.inv.length ? pick(r, s.inv) : null;
      const res = interact(s, pick(r, spots), item);
      s = res.state;
      if (res.result.puzzle && puzzleReady(s, res.result.puzzle)) s = solve(s, res.result.puzzle, r() < 0.4 ? ANSWERS[res.result.puzzle] : "junk").state;
    } else if (roll < 0.8) s = travel(s, pick(r, unlockedRooms(s))).state;
    else if (roll < 0.9 && s.inv.length > 1) s = combine(s, pick(r, s.inv), pick(r, s.inv)).state;
    else s = takeHint(s).state;
    if (i % 37 === 0) s = deserialize(serialize(s)); // random save/reload
  }
  const end = play(s, false, 600);
  if (end.won) fuzzWins++;
  else console.log("softlock from seed", run + 1, "step", currentStep(end)?.id, end.inv);
}
ok(fuzzWins === RUNS, `no softlocks in ${RUNS} random-play states (${fuzzWins} recovered)`);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
