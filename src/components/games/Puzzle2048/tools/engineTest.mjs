/** Headless rules tests: `node src/components/games/Puzzle2048/tools/engineTest.mjs` */
import { move, spawn, canMove, newGame, reduce, restore, serialize, SIZE } from "../engine.js";

let fails = 0;
const check = (name, ok) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}`);
  if (!ok) fails++;
};
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** 4x4 number grid <-> tile list */
let id = 1000;
const tilesOf = (g) => g.flatMap((row, r) => row.map((v, c) => v && { id: id++, v, r, c }).filter(Boolean));
const gridOf = (tiles) => {
  const g = Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
  for (const t of tiles) if (!t.gone) g[t.r][t.c] = t.v;
  return g;
};
const row = (vals, dir) => gridOf(move(tilesOf([vals, [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]), dir).tiles)[0];

// --- merging rules (left)
check("[2,2,2,2] -> [4,4,0,0]", eq(row([2, 2, 2, 2], "left"), [4, 4, 0, 0]));
check("[2,2,4,0] -> [4,4,0,0] (no chain merge)", eq(row([2, 2, 4, 0], "left"), [4, 4, 0, 0]));
check("[4,2,2,0] -> [4,4,0,0]", eq(row([4, 2, 2, 0], "left"), [4, 4, 0, 0]));
check("[2,0,0,2] -> [4,0,0,0]", eq(row([2, 0, 0, 2], "left"), [4, 0, 0, 0]));
check("[2,2,2,0] -> [4,2,0,0]", eq(row([2, 2, 2, 0], "left"), [4, 2, 0, 0]));
check("[4,4,8,8] -> [8,16,0,0]", eq(row([4, 4, 8, 8], "left"), [8, 16, 0, 0]));
check("[2,2,2,2] right -> [0,0,4,4]", eq(row([2, 2, 2, 2], "right"), [0, 0, 4, 4]));
check("[2,2,2,0] right -> [0,0,2,4]", eq(row([2, 2, 2, 0], "right"), [0, 0, 2, 4]));

// --- all four directions
const g = [
  [2, 0, 0, 2],
  [0, 4, 0, 0],
  [0, 0, 0, 0],
  [2, 0, 4, 0],
];
check("left", eq(gridOf(move(tilesOf(g), "left").tiles), [[4, 0, 0, 0], [4, 0, 0, 0], [0, 0, 0, 0], [2, 4, 0, 0]]));
check("right", eq(gridOf(move(tilesOf(g), "right").tiles), [[0, 0, 0, 4], [0, 0, 0, 4], [0, 0, 0, 0], [0, 0, 2, 4]]));
check("up", eq(gridOf(move(tilesOf(g), "up").tiles), [[4, 4, 4, 2], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]));
check("down", eq(gridOf(move(tilesOf(g), "down").tiles), [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [4, 4, 4, 2]]));
check("score = merged values", move(tilesOf([[4, 4, 8, 8], [2, 2, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]), "left").gained === 8 + 16 + 4);

// --- invalid moves
const stuck = tilesOf([[2, 4, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]);
check("blocked move reports moved=false", !move(stuck, "left").moved && !move(stuck, "up").moved);
const s0 = { ...newGame(0), tiles: stuck };
check("invalid move returns same state (no spawn)", reduce(s0, { type: "move", dir: "left" }) === s0);
const s1 = reduce(s0, { type: "move", dir: "right" });
check("valid move spawns exactly one tile", s1.tiles.filter((t) => !t.gone).length === 3 && s1.tiles.filter((t) => t.isNew).length === 1);

// --- start state
const fresh = newGame(50);
check("new game starts with two tiles of 2/4", fresh.tiles.length === 2 && fresh.tiles.every((t) => t.v === 2 || t.v === 4) && fresh.best === 50);
check("two start tiles on different cells", fresh.tiles[0].r * 4 + fresh.tiles[0].c !== fresh.tiles[1].r * 4 + fresh.tiles[1].c);
let spawnStats = { 2: 0, 4: 0 };
for (let k = 0; k < 2000; k++) spawnStats[spawn([])[0].v]++;
check(`spawn ~90% twos (${spawnStats[2]}/2000)`, spawnStats[2] > 1700 && spawnStats[2] < 1900);

// --- score, best, undo
const a = { ...newGame(10), tiles: tilesOf([[8, 8, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]), score: 4 };
const b = reduce(a, { type: "move", dir: "left" });
check("score adds merge value", b.score === 20 && b.best === 20);
const u = reduce(b, { type: "undo" });
check("undo restores board and score", eq(gridOf(u.tiles), gridOf(a.tiles)) && u.score === 4 && u.prev === null);
check("best survives undo", u.best === 20);
check("undo is one step only", reduce(u, { type: "undo" }) === u);
check("new game keeps best, resets score", (() => { const n = reduce(b, { type: "new" }); return n.score === 0 && n.best === 20 && n.tiles.length === 2; })());

// --- win
const w = { ...newGame(0), tiles: tilesOf([[1024, 1024, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]) };
const w1 = reduce(w, { type: "move", dir: "left" });
check("reaching 2048 sets won", w1.won && !w1.keep && w1.sound === "win");
check("moves blocked while win overlay shows", reduce(w1, { type: "move", dir: "right" }) === w1);
const w2 = reduce(w1, { type: "keep" });
const w3 = reduce(w2, { type: "move", dir: "right" });
check("keep playing allows moves", w3 !== w2 && w3.won);
check("undo of the winning move clears won", reduce(w1, { type: "undo" }).won === false);

// --- game over
const full = [[2, 4, 2, 4], [4, 2, 4, 2], [2, 4, 2, 4], [4, 2, 4, 0]];
check("canMove true with an empty cell", canMove(tilesOf(full)));
const dead = [[2, 4, 2, 4], [4, 2, 4, 2], [2, 4, 2, 4], [4, 2, 4, 2]];
check("canMove false on locked board", !canMove(tilesOf(dead)));
check("canMove true with adjacent pair", canMove(tilesOf([[2, 2, 4, 8], [4, 8, 16, 32], [8, 16, 32, 64], [16, 32, 64, 128]])));
// one move left: sliding fills the last gap; rng forces the spawn value
const o = { ...newGame(0), tiles: tilesOf([[2, 4, 2, 4], [4, 2, 4, 2], [2, 4, 2, 4], [8, 0, 16, 32]]) };
const o1 = reduce(o, { type: "move", dir: "right", rng: () => 0.95 }); // spawns a 4 at (3,0)
check("game over detected after last move", o1.over && o1.sound === "over");
check("moves blocked when over", reduce(o1, { type: "move", dir: "left" }) === o1);
check("undo from game over", !reduce(o1, { type: "undo" }).over);

// --- save / restore
const r = restore(JSON.parse(JSON.stringify(serialize(b))));
check("restore keeps board, score, best, undo", eq(gridOf(r.tiles), gridOf(b.tiles)) && r.score === 20 && r.best === 20 && r.prev);
check("restore strips animation flags", r.tiles.every((t) => !t.isNew && !t.merged && !t.gone));
check("restore garbage -> fresh game", restore({ tiles: "x", best: 7 }).tiles.length === 2 && restore({ best: 7 }).best === 7);
const after = reduce(r, { type: "move", dir: "down" });
const ids = after.tiles.map((t) => t.id);
check("ids stay unique after restore", new Set(ids).size === ids.length);

// --- random play never breaks invariants
let ok = true;
for (let game = 0; game < 50 && ok; game++) {
  let s = newGame(0);
  for (let k = 0; k < 2000 && !s.over; k++) {
    s = reduce(s, { type: "move", dir: ["left", "right", "up", "down"][k % 4 === 0 ? 3 : Math.floor(Math.random() * 4)] });
    if (s.won && !s.keep) s = reduce(s, { type: "keep" });
    const cells = s.tiles.filter((t) => !t.gone).map((t) => t.r * 4 + t.c);
    if (new Set(cells).size !== cells.length || cells.length > 16) ok = false;
  }
  if (!s.over) ok = false;
}
check("50 random games end in game over with no overlapping tiles", ok);

console.log(fails ? `\n${fails} FAILED` : "\nall passed");
process.exit(fails ? 1 : 0);
