/**
 * 2048 Puzzle — pure game logic (no React, no DOM), so it can be tested in
 * Node: `node src/components/games/Puzzle2048/tools/engineTest.mjs`.
 *
 * A tile is `{ id, v, r, c }`. After a move the list may also carry
 * animation-only flags: `gone` (slid into a merge and will disappear),
 * `merged` (the doubled result) and `isNew` (the spawned tile).
 */
export const SIZE = 4;
export const WIN = 2048;

let uid = 0;
const nextId = () => ++uid;

const live = (tiles) => tiles.filter((t) => !t.gone);
const clean = (tiles) => live(tiles).map(({ id, v, r, c }) => ({ id, v, r, c }));

/** Cells of line `i`, ordered from the edge the tiles slide towards. */
function lineCells(dir, i) {
  return [0, 1, 2, 3].map((k) => {
    const j = dir === "right" || dir === "down" ? SIZE - 1 - k : k;
    return dir === "left" || dir === "right" ? [i, j] : [j, i];
  });
}

/** Slide every tile towards `dir`; each tile merges at most once per move. */
export function move(tiles, dir) {
  const at = new Map(live(tiles).map((t) => [t.r * SIZE + t.c, t]));
  const out = [];
  let gained = 0;
  let moved = false;
  for (let i = 0; i < SIZE; i++) {
    const cells = lineCells(dir, i);
    const placed = [];
    for (const [r, c] of cells) {
      const t = at.get(r * SIZE + c);
      if (!t) continue;
      const top = placed[placed.length - 1];
      if (top && !top.merged && top.v === t.v) {
        top.v *= 2;
        top.merged = true;
        top.parts.push(t);
      } else {
        placed.push({ v: t.v, merged: false, parts: [t] });
      }
    }
    placed.forEach((p, k) => {
      const [r, c] = cells[k];
      if (p.merged) {
        moved = true;
        gained += p.v;
        for (const s of p.parts) out.push({ id: s.id, v: s.v, r, c, gone: true });
        out.push({ id: nextId(), v: p.v, r, c, merged: true });
      } else {
        const s = p.parts[0];
        if (s.r !== r || s.c !== c) moved = true;
        out.push({ id: s.id, v: s.v, r, c });
      }
    });
  }
  return moved ? { tiles: out, moved, gained } : { tiles, moved, gained: 0 };
}

/** Add a 2 (90%) or 4 (10%) on a random empty cell. */
export function spawn(tiles, rng = Math.random) {
  const taken = new Set(live(tiles).map((t) => t.r * SIZE + t.c));
  const empty = [];
  for (let k = 0; k < SIZE * SIZE; k++) if (!taken.has(k)) empty.push(k);
  if (!empty.length) return tiles;
  const k = empty[Math.floor(rng() * empty.length)];
  const v = rng() < 0.9 ? 2 : 4;
  return [...tiles, { id: nextId(), v, r: Math.floor(k / SIZE), c: k % SIZE, isNew: true }];
}

export function canMove(tiles) {
  const grid = Array(SIZE * SIZE).fill(0);
  for (const t of live(tiles)) grid[t.r * SIZE + t.c] = t.v;
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const v = grid[r * SIZE + c];
      if (!v) return true;
      if (c < SIZE - 1 && v === grid[r * SIZE + c + 1]) return true;
      if (r < SIZE - 1 && v === grid[(r + 1) * SIZE + c]) return true;
    }
  }
  return false;
}

export function newGame(best = 0, rng = Math.random) {
  return {
    tiles: spawn(spawn([], rng), rng),
    score: 0,
    best,
    won: false, // 2048 reached in this game
    keep: false, // player chose Keep Playing
    over: false,
    prev: null, // one-step undo snapshot
    gain: 0,
    seq: 0, // bumps on every change; drives sounds / score pop
    sound: "new",
  };
}

/** Rebuild a state from storage; anything malformed starts a fresh game. */
export function restore(saved) {
  const okTiles = (ts) =>
    Array.isArray(ts) &&
    ts.every((t) => t && Number.isInteger(t.r) && Number.isInteger(t.c) && t.r >= 0 && t.r < SIZE && t.c >= 0 && t.c < SIZE && t.v >= 2);
  const best = Number(saved?.best) || 0;
  if (!saved || !okTiles(saved.tiles) || !saved.tiles.length) return { ...newGame(best), sound: null };
  for (const t of [...saved.tiles, ...(saved.prev?.tiles || [])]) uid = Math.max(uid, Number(t.id) || 0);
  const prev = saved.prev && okTiles(saved.prev.tiles) ? saved.prev : null;
  const tiles = clean(saved.tiles);
  return {
    tiles,
    score: Number(saved.score) || 0,
    best,
    won: Boolean(saved.won),
    keep: Boolean(saved.keep),
    over: !canMove(tiles),
    prev,
    gain: 0,
    seq: 0,
    sound: null,
  };
}

/** What gets written to localStorage (no animation flags). */
export function serialize(s) {
  return { tiles: clean(s.tiles), score: s.score, best: s.best, won: s.won, keep: s.keep, prev: s.prev };
}

export function reduce(s, a) {
  switch (a.type) {
    case "move": {
      if (s.over || (s.won && !s.keep)) return s;
      const res = move(s.tiles, a.dir);
      if (!res.moved) return s; // invalid move: nothing changes, nothing spawns
      const tiles = spawn(res.tiles, a.rng);
      const score = s.score + res.gained;
      const reached = !s.won && tiles.some((t) => t.merged && t.v >= WIN);
      const over = !canMove(tiles);
      return {
        ...s,
        tiles,
        score,
        best: Math.max(s.best, score),
        won: s.won || reached,
        over,
        prev: { tiles: clean(s.tiles), score: s.score, won: s.won },
        gain: res.gained,
        seq: s.seq + 1,
        sound: reached ? "win" : over ? "over" : res.gained ? "merge" : "move",
      };
    }
    case "undo":
      if (!s.prev) return s;
      return { ...s, tiles: s.prev.tiles, score: s.prev.score, won: s.prev.won, over: false, prev: null, gain: 0, seq: s.seq + 1, sound: "undo" };
    case "keep":
      return { ...s, keep: true, seq: s.seq + 1, sound: null };
    case "new":
      return { ...newGame(s.best, a.rng), seq: s.seq + 1 };
    default:
      return s;
  }
}
