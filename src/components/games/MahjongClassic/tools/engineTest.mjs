/** Headless rules tests: `node src/components/games/MahjongClassic/tools/engineTest.mjs` */
import { LAYOUTS, DIFFICULTIES, FAMILIES, newGame, match, undo, shuffle, hint, availablePairs, freeTile, remaining, neighbours, isFree, canMatch, pause, resume, timeOf } from "../engine.js";

let fails = 0;
const check = (name, ok) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}`);
  if (!ok) fails++;
};

// independent free-tile check straight from the rules (no neighbour cache)
function freeRef(s, i) {
  const a = s.tiles[i];
  const live = s.tiles.map((t, j) => ({ ...t, j })).filter((t) => t.j !== i && !s.gone[t.j]);
  if (live.some((b) => b.z > a.z && Math.abs(b.x - a.x) < 2 && Math.abs(b.y - a.y) < 2)) return false;
  const side = (dx) => live.some((b) => b.z === a.z && b.x === a.x + dx && Math.abs(b.y - a.y) < 2);
  return !side(-2) || !side(2);
}
const play = (s, [a, b]) => match(s, a, b, (s.lastMatch || 1000) + 10000);
const greedyUntilStuck = (s) => {
  for (;;) {
    const p = availablePairs(s);
    if (!p.length) return s;
    s = play(s, p[Math.floor(Math.random() * p.length)]);
  }
};

// --- fixtures: free-tile and stacking rules
{
  const cells = [{ x: 0, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }, { x: 1, y: 1, z: 1 }];
  const nb = neighbours(cells);
  const alive = () => true;
  check("row of three: ends free when nothing on top", isFree(nb, 2, alive));
  check("tile half-covered from above is blocked", !isFree(nb, 0, alive) && !isFree(nb, 1, alive));
  check("middle tile with both sides taken is blocked", !isFree(neighbours(cells.slice(0, 3)), 1, alive));
  check("removing the cover frees the tile below", isFree(nb, 0, (j) => j !== 3));
  check("tile on top is free", isFree(nb, 3, alive));
  const offRow = neighbours([{ x: 0, y: 0, z: 0 }, { x: 2, y: 1, z: 0 }, { x: 4, y: 2, z: 0 }]);
  check("half-row offset neighbour still blocks a side", !isFree(offRow, 1, alive));
  const far = neighbours([{ x: 0, y: 0, z: 0 }, { x: 2, y: 2, z: 0 }, { x: 4, y: 0, z: 0 }]);
  check("tile a full row away does not block", isFree(far, 1, alive));
  const twoUp = neighbours([{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 2 }]);
  check("a tile two layers up still blocks", !isFree(twoUp, 0, alive));
}

// --- pair matching
check("identical suit tiles match", canMatch("d5", "d5"));
check("different numbers don't match", !canMatch("d5", "d6") && !canMatch("b5", "s5"));
check("any flower matches any flower, seasons likewise", canMatch("f1", "f4") && canMatch("x2", "x3") && !canMatch("f1", "x1"));
check("36 match families", FAMILIES.length === 36);

// --- layouts + solvable generation
const expect = { turtle: 144, pyramid: 108, bridge: 98, fortress: 78, compact: 62 };
for (const [id, L] of Object.entries(LAYOUTS)) {
  const keys = new Set(L.cells.map((c) => c.join(",")));
  check(`${id}: ${L.cells.length} tiles, even, no duplicate cells`, L.cells.length === expect[id] && keys.size === L.cells.length);
  const sameLayerOverlap = L.cells.some((a, i) => L.cells.some((b, j) => j > i && a[2] === b[2] && Math.abs(a[0] - b[0]) < 2 && Math.abs(a[1] - b[1]) < 2));
  check(`${id}: no overlapping tiles on one layer`, !sameLayerOverlap);
  for (const lv of Object.keys(DIFFICULTIES)) {
    let ok = true, t0 = Date.now();
    for (let n = 0; n < 15; n++) {
      let s = newGame(id, lv);
      const counts = {};
      s.faces.forEach((f) => (counts[f[0] === "f" || f[0] === "x" ? f[0] : f] = (counts[f[0] === "f" || f[0] === "x" ? f[0] : f] || 0) + 1));
      if (Object.values(counts).some((c) => c % 2)) ok = false;
      if (s.tiles.some((_, i) => freeTile(s, i) !== freeRef(s, i))) ok = false;
      if (!availablePairs(s).length) ok = false;
      // play the generated solution through the real rules
      for (const pr of s.solution) {
        const next = play(s, pr);
        if (!next) { ok = false; break; }
        s = next;
        if (n === 0 && s.tiles.some((_, i) => !s.gone[i] && freeTile(s, i) !== freeRef(s, i))) ok = false;
      }
      if (!s.won || remaining(s)) ok = false;
    }
    check(`${id}/${lv}: 15 deals, all clear by their solution (${Date.now() - t0} ms)`, ok);
  }
}
const easyKinds = new Set(newGame("compact", "easy").faces).size;
const hardKinds = new Set(newGame("compact", "hard").faces).size;
check(`difficulty changes tile variety (compact easy ${easyKinds} faces < hard ${hardKinds})`, easyKinds < hardKinds);

// --- hints
{
  let ok = true;
  for (let n = 0; n < 20; n++) {
    let s = newGame("turtle", "medium");
    for (let k = 0; k < 30; k++) {
      const h = hint(s);
      if (!h) break;
      if (!freeTile(s, h[0]) || !freeTile(s, h[1]) || !canMatch(s.faces[h[0]], s.faces[h[1]])) ok = false;
      s = play(s, h);
    }
  }
  check("hints are always legal free matching pairs", ok);
  let s = newGame("fortress", "hard");
  while (!s.won) s = play(s, hint(s));
  check("following hints alone from the deal clears the board", s.won);
}

// --- illegal moves
{
  const s = newGame("turtle", "easy");
  const blocked = s.tiles.findIndex((_, i) => !freeTile(s, i));
  const mate = s.faces.findIndex((f, j) => j !== blocked && canMatch(f, s.faces[blocked]));
  check("matching a blocked tile is rejected", match(s, blocked, mate) === null);
  const free = s.tiles.map((_, i) => i).filter((i) => freeTile(s, i));
  const [a, b] = [free[0], free.find((j) => !canMatch(s.faces[j], s.faces[free[0]]))];
  check("matching different faces is rejected", match(s, a, b) === null);
  check("a tile can't match itself", match(s, a, a) === null);
}

// --- undo
{
  let s = newGame("pyramid", "medium");
  const s0 = s;
  s = play(s, s.solution[0]);
  s = play(s, s.solution[1]);
  const u = undo(undo(s));
  check("undo twice restores tiles, moves and score", u.gone.every((g, i) => g === s0.gone[i]) && u.moves === 0 && u.score === 0 && !u.history.length);
  check("undo on a fresh board is a no-op", undo(s0) === s0);
}

// --- shuffle keeps the face multiset and makes the board solvable
{
  let ok = true, rewinds = 0;
  for (let n = 0; n < 40; n++) {
    let s = greedyUntilStuck(newGame(Object.keys(LAYOUTS)[n % 5], "hard"));
    if (s.won) continue;
    const before = s.faces.filter((_, i) => !s.gone[i]).map((f) => f[0] === "f" || f[0] === "x" ? f[0] : f).sort().join();
    const { state, rewound } = shuffle(s);
    rewinds += rewound > 0;
    const after = state.faces.filter((_, i) => !state.gone[i]).map((f) => f[0] === "f" || f[0] === "x" ? f[0] : f).sort().join();
    if (!rewound && before !== after) ok = false;
    let t = state;
    for (const pr of t.solution) t = play(t, pr) || t;
    if (!t.won) ok = false;
    if (undo(state).faces !== (rewound ? state.history.at(-1).faces : s.faces)) ok = false;
  }
  check(`40 stuck boards: shuffle restores a clearable board (${rewinds} needed a rewind)`, ok);
  // structurally dead position: lone 2-stack -> must rewind
  let s = newGame("compact", "easy");
  const stack = s.tiles.map((t, i) => [t, i]).filter(([t]) => t.z === 2);
  const below = s.tiles.findIndex((t) => t.z === 1 && t.x === stack[0][0].x && t.y === stack[0][0].y);
  const keep = new Set([stack[0][1], below]);
  const hist = { ...s, history: [{ faces: s.faces, gone: s.gone, score: 0, moves: 0, combo: 0, solution: s.solution }], gone: s.gone.map((_, i) => !keep.has(i)) };
  const r = shuffle(hist);
  check("a dead structure (lone stack of two) rewinds before reshuffling", r.rewound === 1 && remaining(r.state) === s.tiles.length);
}

// --- win + pause timer
{
  let s = newGame("compact", "medium");
  const p = pause({ ...s, since: 0 }, 5000);
  check("pause freezes the clock", p.paused && p.elapsed === 5000 && timeOf(p, 99999) === 5000);
  check("resume restarts it", timeOf(resume(p, 10000), 12000) === 7000);
  check("no matches while paused", match(p, ...s.solution[0]) === null);
  for (const pr of s.solution) s = play(s, pr);
  check("win detected when the last pair goes, with time bonus", s.won && remaining(s) === 0 && s.timeBonus >= 0 && s.since === null);
  check("restart deals a fresh board", newGame("compact", "medium").key !== s.key);
}

console.log(fails ? `\n${fails} FAILED` : "\nall passed");
process.exit(fails ? 1 : 0);
