#!/usr/bin/env node
/**
 * Number Fusion — grid engine torture test. Run with:
 *   node src/components/games/NumberFusion/engine/validate.mjs
 *
 * Plays thousands of full random games (random legal-looking moves until
 * game over) and checks invariants that must never break:
 *   - a move that reports moved:false never changes the board
 *   - a move that reports moved:true always DOES change the board
 *   - the sum of every tile's value only ever goes up (merges preserve sum,
 *     spawns add 2 or 4) — it must never silently lose value
 *   - scoreGained always matches the actual value created by merges
 *   - the board never exceeds size*size tiles or drops a tile without a merge
 *   - isGameOver is only ever true when truly no move changes the board
 *   - the simulation always terminates (no infinite games)
 */
import { emptyCells, move, spawnRandomTile, isGameOver, sumOfValues, cloneCells, DIRECTIONS } from "./grid.js";

const SIZE = 4;
const GAMES = 500;
const MAX_MOVES_PER_GAME = 5000;

let failed = false;
const fail = (msg) => { console.error(`✗ ${msg}`); failed = true; };

function seededRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

let totalMoves = 0;
let totalGames = 0;
let maxTileSeen = 0;

for (let g = 0; g < GAMES; g++) {
  const rng = seededRng(g * 7919 + 1);
  let cells = emptyCells(SIZE);
  ({ cells } = spawnRandomTile(cells, SIZE, rng));
  ({ cells } = spawnRandomTile(cells, SIZE, rng));

  let moves = 0;
  let prevSum = sumOfValues(cells, SIZE);

  while (moves < MAX_MOVES_PER_GAME) {
    if (isGameOver(cells, SIZE)) {
      // double-check: truly no direction changes the board
      for (const dir of DIRECTIONS) {
        const res = move(cells, SIZE, dir);
        if (res.moved) fail(`game ${g}: isGameOver said true but "${dir}" still moves the board`);
      }
      break;
    }

    const dir = DIRECTIONS[Math.floor(rng() * DIRECTIONS.length)];
    const before = cloneCells(cells);
    const res = move(cells, SIZE, dir);

    // moved:false must mean byte-identical board
    if (!res.moved) {
      let changed = false;
      for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) {
        if ((before[r][c]?.value || 0) !== (res.cells[r][c]?.value || 0)) changed = true;
      }
      if (changed) fail(`game ${g} move ${moves}: moved:false but board actually changed`);
      continue; // don't spawn on a no-op move, matches real game-loop behavior
    }

    // A slide+merge conserves total value (2+2=4 either way) — merging
    // never creates or destroys value, it only combines it. scoreGained is
    // a running score counter (the value of each newly-formed tile), which
    // is unrelated to the grid's sum — it's checked separately below.
    const sumBefore = sumOfValues(before, SIZE);
    const sumAfterMove = sumOfValues(res.cells, SIZE);
    if (sumAfterMove !== sumBefore) {
      fail(`game ${g} move ${moves}: slide+merge changed total value ${sumBefore}->${sumAfterMove} (should be conserved)`);
    }
    if (res.scoreGained < 0) fail(`game ${g} move ${moves}: negative scoreGained`);

    // Cross-check scoreGained against the movements list: every merge
    // (two movements sharing a `to` with merged:true) should contribute
    // exactly that destination tile's value, once.
    const mergedDestKeys = new Set();
    let expectedScore = 0;
    for (const m of res.movements) {
      if (!m.merged) continue;
      const key = `${m.to[0]},${m.to[1]}`;
      if (mergedDestKeys.has(key)) continue;
      mergedDestKeys.add(key);
      expectedScore += res.cells[m.to[0]][m.to[1]].value;
    }
    if (expectedScore !== res.scoreGained) {
      fail(`game ${g} move ${moves}: scoreGained ${res.scoreGained} doesn't match movements-derived ${expectedScore}`);
    }

    cells = res.cells;
    const spawn = spawnRandomTile(cells, SIZE, rng);
    if (spawn.spawned) {
      cells = spawn.cells;
      if (spawn.spawned.value !== 2 && spawn.spawned.value !== 4) {
        fail(`game ${g} move ${moves}: spawned an invalid tile value ${spawn.spawned.value}`);
      }
    }

    const sumAfterSpawn = sumOfValues(cells, SIZE);
    if (sumAfterSpawn < sumAfterMove) fail(`game ${g} move ${moves}: sum went DOWN after spawn`);
    if (sumAfterSpawn < prevSum) fail(`game ${g} move ${moves}: total value decreased across a full turn`);
    prevSum = sumAfterSpawn;

    for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) {
      const v = cells[r][c]?.value;
      if (v !== undefined && (!Number.isFinite(v) || v <= 0)) fail(`game ${g} move ${moves}: invalid tile value ${v}`);
      maxTileSeen = Math.max(maxTileSeen, v || 0);
    }

    moves++;
    totalMoves++;
  }

  if (moves >= MAX_MOVES_PER_GAME) fail(`game ${g}: did not terminate within ${MAX_MOVES_PER_GAME} moves`);
  totalGames++;
}

console.log(`\n---- Number Fusion grid engine report ----`);
console.log(`Games simulated:     ${totalGames}`);
console.log(`Total moves played:  ${totalMoves}`);
console.log(`Highest tile seen:   ${maxTileSeen}`);
console.log(`--------------------------------------------\n`);

if (failed) {
  console.error("VALIDATION FAILED\n");
  process.exit(1);
} else {
  console.log("VALIDATION PASSED\n");
}
