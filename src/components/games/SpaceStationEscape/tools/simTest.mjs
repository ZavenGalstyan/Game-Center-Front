// Space Station Escape — headless checks: full walkthrough, clue reachability,
// wrong answers, oxygen drain/restore/retry, save/load, hints and a
// random-play softlock fuzz.
// node src/components/games/SpaceStationEscape/tools/simTest.mjs
import { ITEMS, CLUES, ROOMS, ROOM_ORDER, HOTSPOTS, PUZZLES, STEPS, CIRCUIT, CIRCUIT_SOLUTION, GRID_PRESSES, VALVES, O2 } from "../data.js";
import { newState, interact, travel, consume, solve, puzzleReady, CHECKS, circuitFlow, pressures, gridAfter, GRID_START, takeHint, currentStep, objective, serialize, deserialize, unlockedRooms, tickO2, retry, drainRate } from "../engine.js";

let pass = 0, fail = 0;
const ok = (c, msg) => (c ? pass++ : (fail++, console.log("FAIL:", msg)));

const ANSWERS = {
  terminal: "orbit7",
  circuit: CIRCUIT_SOLUTION,
  symbols: ["◆", "▲", "●", "■"],
  pressure: [4, 2, 3],
  grid: GRID_PRESSES,
  launch: "2497",
};
const NEEDS = {
  terminal: ["stickyNote", "catPhoto", "deckSign"],
  circuit: [],
  symbols: ["medLog", "bioMonitor"],
  pressure: ["pressureManual"],
  grid: ["secLog"],
  launch: ["engLog", "recorder", "techLog", "secLog", "launchSign"],
};

/* ---------------------------------------------------------- static data */
for (const [id, h] of Object.entries(HOTSPOTS)) ok(ROOMS[h.room]?.props.some((p) => p.hs === id), `hotspot ${id} has a prop in its room`);
for (const r of ROOM_ORDER) for (const p of ROOMS[r].props) if (p.hs) ok(HOTSPOTS[p.hs]?.room === r, `prop hotspot ${p.hs} in ${r}`);
for (const p of Object.values(PUZZLES)) for (const i of [...(p.reward?.give || []), ...(p.reward?.take || [])]) ok(ITEMS[i], `puzzle item ${i}`);
for (const [pz, cl] of Object.entries(NEEDS)) for (const c of cl) ok(ROOM_ORDER.indexOf(CLUES[c].room) <= ROOM_ORDER.indexOf(PUZZLES[pz].room), `clue ${c} reachable no later than ${pz}`);

/* ---------------------------------------------------- puzzle mechanics */
ok(!circuitFlow(CIRCUIT.start).done, "circuit starts unsolved");
ok(circuitFlow(CIRCUIT_SOLUTION).done, "circuit solution reaches both outputs");
ok(!CHECKS.circuit(CIRCUIT_SOLUTION.map((row, r) => row.map((x, c) => (r === 3 && c === 4 ? x + 1 : x)))), "one output alone is not enough");
ok(String(pressures([4, 2, 3])) === String(VALVES.targets), "pressure solution hits targets");
let pSolutions = 0;
for (let a = 0; a <= VALVES.max; a++) for (let b = 0; b <= VALVES.max; b++) for (let c = 0; c <= VALVES.max; c++) if (CHECKS.pressure([a, b, c])) pSolutions++;
ok(pSolutions === 1, `pressure has exactly one solution (${pSolutions})`);
ok(!CHECKS.pressure([0, 0, 0]) && !CHECKS.pressure([4.5, 2, 3]) && !CHECKS.pressure([9, 2, 3]), "pressure rejects bad input");
ok(GRID_START.flat().some(Boolean), "grid starts with emitters on");
ok(gridAfter(GRID_PRESSES).flat().every((x) => !x), "grid presses clear every emitter");
ok(!CHECKS.grid([]) && !CHECKS.grid([[0, 0]]), "grid rejects incomplete presses");
ok(CHECKS.terminal(" Orbit7 ") && !CHECKS.terminal("ORBIT") && !CHECKS.terminal("NOVA7"), "terminal check");
ok(!CHECKS.symbols(["▲", "◆", "●", "■"]) && !CHECKS.launch("7942"), "wrong orders rejected");

/* ------------------------------------------------------- fair player */
function step(s, fair = true) {
  const before = serialize(s);
  const here = s.room;
  for (const h of Object.keys(HOTSPOTS).filter((k) => HOTSPOTS[k].room === here)) {
    for (const item of [null, ...s.inv]) {
      if (s.room !== here) ({ state: s } = travel(s, here));
      const r = interact(s, h, item);
      if (!r.result.ok) continue;
      s = r.state;
      if (r.result.travel) return { s, moved: true, progressed: serialize({ ...s, room: here }) !== before };
      const pz = r.result.puzzle;
      if (pz && puzzleReady(s, pz)) {
        if (fair && !(NEEDS[pz] || []).every((c) => s.clues.includes(c))) continue;
        const w = solve(s, pz, ANSWERS[pz]);
        ok(w.result.ok, `solve ${pz}`);
        s = w.state;
      }
    }
  }
  return { s, moved: false, progressed: serialize(s) !== before };
}
function play(s, fair = true, limit = 300) {
  for (let i = 0; i < limit && !s.won; i++) {
    if (s.o2 <= 0) s = retry(s);
    const r = step(s, fair);
    s = tickO2(r.s, 5);
    if (r.moved || r.progressed || s.o2 <= 0) continue;
    const st = currentStep(s);
    if (st && st.room !== s.room && unlockedRooms(s).includes(st.room)) {
      s = travel(s, st.room).state;
      continue;
    }
    {
      // walk back through every unlocked sector looking for what's missing
      const back = unlockedRooms(s).find((rm) => rm !== s.room && step(travel(s, rm).state, fair).progressed);
      if (!back) return s;
      s = travel(s, back).state;
      continue;
    }
  }
  return s;
}

{
  let s = newState();
  ok(objective(s).length > 0, "objective at start");
  const rooms = new Set([s.room]);
  for (let i = 0; i < 300 && !s.won; i++) {
    const r = step(s);
    s = r.s;
    rooms.add(s.room);
    if (!r.moved && !r.progressed) {
      const st = currentStep(s);
      if (!st) break;
      s = travel(s, st.room).state;
    }
  }
  ok(s.won, "fair walkthrough escapes the station");
  ok(rooms.size === 6, `visited all 6 sectors (${rooms.size})`);
  ok(Object.keys(PUZZLES).every((p) => s.solved[p]), "every puzzle solved " + Object.keys(s.solved));
  ok(STEPS.every((st) => st.done(s)), "every walkthrough step done " + STEPS.filter((st) => !st.done(s)).map((x) => x.id));
  ok(Object.keys(CLUES).every((c) => s.clues.includes(c)), "every clue found");
}

/* ----------------------------------------------- locks & wrong answers */
{
  let s = newState();
  ok(!interact(s, "engDoor").result.travel, "engineering sealed at start");
  ok(!solve(s, "terminal", "ORBIT8").result.ok, "wrong password rejected");
  s = solve(s, "terminal", "ORBIT7").state;
  ok(s.f.termOK, "terminal unlocks engineering");
  ok(!travel(s, "engineering").result.ok, "map can't reach engineering before passing the door");
  s = interact(s, "engDoor").state;
  ok(s.room === "engineering", "door travel");
  ok(!interact(s, "junction").result.puzzle, "junction closed without tool");
  ok(!solve(s, "circuit", CIRCUIT_SOLUTION).result.ok, "circuit gated before panel opens");
  ok(!interact(s, "junction", "multitool").state.f.panelOpen, "unheld item ignored");
  s = travel(s, "command").state;
  s = interact(s, "locker").state;
  const w = interact(s, "photo", "multitool");
  ok(w.result.wrongItem && w.state.inv.includes("multitool"), "wrong use keeps item");
  s = travel(s, "engineering").state;
  s = interact(s, "junction", "multitool").state;
  ok(s.f.panelOpen && s.inv.includes("multitool"), "multitool opens panel and is kept");
  ok(!interact(s, "medDoor").result.travel, "medical needs power");

  // oxygen
  const full = newState();
  ok(Math.abs(tickO2(full, 10).o2 - (100 - O2.drain * 10)) < 1e-9, "oxygen drains");
  const minutes = O2.start / O2.drain / 60;
  ok(minutes > 12, `forgiving oxygen timer (${minutes.toFixed(1)} min)`);
  const dead = tickO2(full, 100000);
  ok(dead.o2 === 0, "oxygen depletes to zero");
  ok(!interact({ ...dead }, "photo").result.ok && !solve(dead, "terminal", "ORBIT7").result.ok, "no actions at zero oxygen");
  const back = retry({ ...dead, inv: ["multitool"], f: { termOK: 1 } });
  ok(back.o2 === 100 && back.depleted === 1 && back.f.termOK && back.inv.includes("multitool"), "retry refills and keeps progress");
  let c = { ...newState(), o2: 40, inv: ["o2CanA"] };
  c = consume(c, "o2CanA").state;
  ok(c.o2 === 75 && !c.inv.includes("o2CanA"), "canister restores 35%");
  ok(!consume({ ...newState(), inv: ["o2CanA"] }, "o2CanA").result.ok, "canister not wasted at full oxygen");
  ok(!consume({ ...newState(), inv: ["multitool"] }, "multitool").result.ok, "tools can't be consumed");
  const ls = { ...newState(), f: { lifeSupport: 1 } };
  ok(drainRate(ls) < drainRate(newState()), "life support slows the drain");

  // hints
  const h1 = takeHint(s), h2 = takeHint(h1.state), h3 = takeHint(h2.state), h4 = takeHint(h3.state);
  ok(h1.hint.level === 1 && h3.hint.level === 3 && h4.hint.level === 3 && h4.state.hintsUsed === 3, "hints escalate and cap");
  ok(takeHint(travel(s, "command").state).hint.level === 0, "hint points to the right sector when elsewhere");

  // save / load
  const back2 = deserialize(serialize(s));
  ok(back2 && serialize(back2) === serialize(s), "save/load round trip");
  ok(deserialize("junk") === null && deserialize({ v: 9 }) === null, "bad saves rejected");
  ok(deserialize({ ...s, room: "podbay" }).room === "command", "locked-room save falls back");
  ok(deserialize({ ...s, o2: "x" }).o2 === 100 && deserialize({ ...s, o2: 500 }).o2 === 100, "o2 sanitised on load");
}
{
  // pressure reward refills oxygen
  let s = play(newState(), false);
  ok(s.won, "unfair solver also escapes");
}

/* ------------------------------------------------- softlock fuzzing */
function rng(seed) {
  let x = seed >>> 0;
  return () => (x = (x * 1664525 + 1013904223) >>> 0) / 4294967296;
}
const pick = (r, a) => a[Math.floor(r() * a.length)];
let wins = 0;
const RUNS = 300;
for (let run = 0; run < RUNS; run++) {
  const r = rng(run + 7);
  let s = newState();
  const n = 20 + Math.floor(r() * 400);
  for (let i = 0; i < n && !s.won; i++) {
    const roll = r();
    if (roll < 0.55) {
      const spots = Object.keys(HOTSPOTS).filter((h) => HOTSPOTS[h].room === s.room);
      const res = interact(s, pick(r, spots), r() < 0.5 && s.inv.length ? pick(r, s.inv) : null);
      s = res.state;
      if (res.result.puzzle && puzzleReady(s, res.result.puzzle)) s = solve(s, res.result.puzzle, r() < 0.4 ? ANSWERS[res.result.puzzle] : "junk").state;
    } else if (roll < 0.75) s = travel(s, pick(r, unlockedRooms(s))).state;
    else if (roll < 0.85 && s.inv.length) s = consume(s, pick(r, s.inv)).state;
    else if (roll < 0.95) s = tickO2(s, r() * 300);
    else s = takeHint(s).state;
    if (s.o2 <= 0 && r() < 0.7) s = retry(s);
    if (i % 41 === 0) s = deserialize(serialize(s));
  }
  const end = play(s, false);
  if (end.won) wins++;
  else console.log("softlock seed", run + 7, currentStep(end)?.id, end.room, end.inv, end.o2, JSON.stringify(end.f), unlockedRooms(end));
}
ok(wins === RUNS, `no softlocks in ${RUNS} random-play states (${wins} recovered)`);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
