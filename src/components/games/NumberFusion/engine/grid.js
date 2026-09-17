/**
 * Number Fusion — the core 2048-style grid engine. Pure and framework-free
 * (no React, no DOM): a `cells` value is a `size x size` array of array,
 * each entry either `null` or `{ id, value }`. `id` is a stable per-tile
 * identity used only for animation (React key / slide-from-to), never for
 * game logic — merges and game-over checks look only at `value`.
 *
 * `move()` handles all four directions with one algorithm: it builds a list
 * of "lines" (the rows/columns in the order tiles slide toward), compacts
 * and merges each line independently, then writes the result back. This is
 * the standard, well-tested approach to a 2048 board and keeps the four
 * directions from ever drifting out of sync with each other.
 */

let uidCounter = 0;
const newId = () => `n${Date.now().toString(36)}${(uidCounter++).toString(36)}`;

export function emptyCells(size) {
  return Array.from({ length: size }, () => Array.from({ length: size }, () => null));
}

export function cloneCells(cells) {
  return cells.map((row) => row.slice());
}

function buildLines(size, direction) {
  const lines = [];
  if (direction === "left") {
    for (let r = 0; r < size; r++) lines.push(Array.from({ length: size }, (_, c) => [r, c]));
  } else if (direction === "right") {
    for (let r = 0; r < size; r++) lines.push(Array.from({ length: size }, (_, c) => [r, size - 1 - c]));
  } else if (direction === "up") {
    for (let c = 0; c < size; c++) lines.push(Array.from({ length: size }, (_, r) => [r, c]));
  } else if (direction === "down") {
    for (let c = 0; c < size; c++) lines.push(Array.from({ length: size }, (_, r) => [size - 1 - r, c]));
  } else {
    throw new Error(`Unknown direction: ${direction}`);
  }
  return lines;
}

/**
 * Slide + merge the whole board one step in `direction`.
 * Returns:
 *   cells       — the new size x size board
 *   moved       — whether anything actually changed (UI/game-loop should
 *                 only spawn a new tile and count the move when this is true)
 *   scoreGained — sum of every newly-created merged tile's value
 *   movements   — [{ id, from:[r,c], to:[r,c], merged }] — one entry per
 *                 SOURCE tile (a merge contributes two, both landing on the
 *                 same `to`), for the UI to animate sliding + a merge "pop"
 */
export function move(cells, size, direction) {
  const lines = buildLines(size, direction);
  const nextCells = emptyCells(size);
  const movements = [];
  let scoreGained = 0;

  for (const line of lines) {
    const present = line.map(([r, c]) => ({ coord: [r, c], tile: cells[r][c] })).filter((x) => x.tile);

    const resultTiles = [];
    let i = 0;
    while (i < present.length) {
      const cur = present[i];
      const next = present[i + 1];
      if (next && next.tile.value === cur.tile.value) {
        const value = cur.tile.value * 2;
        resultTiles.push({ tile: { id: newId(), value }, sourceCoords: [cur.coord, next.coord] });
        scoreGained += value;
        i += 2;
      } else {
        resultTiles.push({ tile: cur.tile, sourceCoords: [cur.coord] });
        i += 1;
      }
    }

    for (let pos = 0; pos < line.length; pos++) {
      const [r, c] = line[pos];
      const entry = resultTiles[pos];
      if (!entry) continue;
      nextCells[r][c] = entry.tile;
      const merged = entry.sourceCoords.length > 1;
      for (const src of entry.sourceCoords) {
        movements.push({ id: entry.tile.id, from: src, to: [r, c], merged });
      }
    }
  }

  let moved = false;
  for (let r = 0; r < size && !moved; r++) {
    for (let c = 0; c < size; c++) {
      const a = cells[r][c];
      const b = nextCells[r][c];
      if ((a?.value || 0) !== (b?.value || 0)) { moved = true; break; }
    }
  }

  return { cells: moved ? nextCells : cells, moved, scoreGained, movements: moved ? movements : [] };
}

/** Places one new tile (90% a 2, 10% a 4) in a random empty cell. */
export function spawnRandomTile(cells, size, rng = Math.random) {
  const empties = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (!cells[r][c]) empties.push([r, c]);
    }
  }
  if (!empties.length) return { cells, spawned: null };
  const [r, c] = empties[Math.floor(rng() * empties.length)];
  const value = rng() < 0.9 ? 2 : 4;
  const id = newId();
  const next = cloneCells(cells);
  next[r][c] = { id, value };
  return { cells: next, spawned: { id, at: [r, c], value } };
}

/** No empty cell AND no adjacent equal pair in any direction. */
export function isGameOver(cells, size) {
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const cell = cells[r][c];
      if (!cell) return false;
      if (c + 1 < size && cells[r][c + 1] && cells[r][c + 1].value === cell.value) return false;
      if (r + 1 < size && cells[r + 1][c] && cells[r + 1][c].value === cell.value) return false;
    }
  }
  return true;
}

export function hasTileAtLeast(cells, size, target) {
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (cells[r][c] && cells[r][c].value >= target) return true;
    }
  }
  return false;
}

export function emptyCellCount(cells, size) {
  let n = 0;
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (!cells[r][c]) n++;
  return n;
}

export function sumOfValues(cells, size) {
  let sum = 0;
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (cells[r][c]) sum += cells[r][c].value;
  return sum;
}

export const DIRECTIONS = ["left", "right", "up", "down"];
