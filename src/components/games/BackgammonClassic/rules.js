/**
 * Backgammon Classic — pure short-backgammon rules (no React).
 *
 * Position: `pts[1..24]` signed counts (+ = player 0 / You, − = player 1 / AI),
 * `bar[pl]`, `off[pl]`. Player 0 moves 24 → 1 (home 1–6); player 1 moves
 * 1 → 24 (home 19–24).
 *
 * Moves are `{ from, to, die, hit }` in point numbers, where the bar and the
 * bear-off tray sit just outside the board on each player's path:
 *   player 0: bar = 25, off = 0      player 1: bar = 0, off = 25
 * so every move is simply `to = from + DIR[pl] * die` (clamped for bear-off).
 */
export const DIR = [-1, 1];
export const BAR = [25, 0];
export const OFF = [0, 25];

export function initialPosition() {
  const pts = Array(26).fill(0);
  pts[24] = 2; pts[13] = 5; pts[8] = 3; pts[6] = 5;
  pts[1] = -2; pts[12] = -5; pts[17] = -3; pts[19] = -5;
  return { pts, bar: [0, 0], off: [0, 0] };
}

export const rollDie = () => 1 + Math.floor(Math.random() * 6);
export const diceToPlay = (a, b) => (a === b ? [a, a, a, a] : [a, b]);

const own = (pos, pl, p) => (pl === 0 ? Math.max(pos.pts[p], 0) : Math.max(-pos.pts[p], 0));
const opp = (pos, pl, p) => own(pos, 1 - pl, p);
/** Pips a checker on point p still has to travel (bar = 25). */
export const dist = (pl, p) => (pl === 0 ? p : 25 - p);

export function allHome(pos, pl) {
  if (pos.bar[pl]) return false;
  for (let p = 1; p <= 24; p++) if (own(pos, pl, p) && dist(pl, p) > 6) return false;
  return true;
}

export function pipCount(pos, pl) {
  let n = pos.bar[pl] * 25;
  for (let p = 1; p <= 24; p++) n += own(pos, pl, p) * dist(pl, p);
  return n;
}

/** Every legal single move for one die value, ignoring the rest of the turn. */
export function singleMoves(pos, pl, die) {
  const out = [];
  const tryPoint = (from) => {
    const to = from + DIR[pl] * die;
    if (to >= 1 && to <= 24) {
      const o = opp(pos, pl, to);
      if (o < 2) out.push({ from, to, die, hit: o === 1 });
      return;
    }
    if (!allHome(pos, pl)) return;
    const d = dist(pl, from);
    if (die === d) return out.push({ from, to: OFF[pl], die, hit: false });
    // Oversized die: only from the farthest-back checker.
    for (let p = 1; p <= 24; p++) if (own(pos, pl, p) && dist(pl, p) > d) return;
    out.push({ from, to: OFF[pl], die, hit: false });
  };
  if (pos.bar[pl]) tryPoint(BAR[pl]);
  else for (let p = 1; p <= 24; p++) if (own(pos, pl, p)) tryPoint(p);
  return out;
}

export function applyMove(pos, pl, m) {
  const pts = pos.pts.slice(), bar = pos.bar.slice(), off = pos.off.slice();
  const s = pl === 0 ? 1 : -1;
  if (m.from === BAR[pl]) bar[pl]--;
  else pts[m.from] -= s;
  if (m.to === OFF[pl]) off[pl]++;
  else {
    if (m.hit) { pts[m.to] = 0; bar[1 - pl]++; }
    pts[m.to] += s;
  }
  return { pts, bar, off };
}

const keyOf = (pos, dice) => pos.pts.join(",") + "|" + pos.bar + "|" + pos.off + "|" + dice;
const without = (dice, v) => { const i = dice.indexOf(v); return dice.slice(0, i).concat(dice.slice(i + 1)); };
const uniq = (dice) => [...new Set(dice)];

/** The most dice that can still be played from here. */
function maxPlayable(pos, pl, dice, memo) {
  if (!dice.length || pos.off[pl] === 15) return 0;
  const k = keyOf(pos, dice);
  if (memo.has(k)) return memo.get(k);
  let best = 0;
  for (const v of uniq(dice)) {
    for (const m of singleMoves(pos, pl, v)) {
      best = Math.max(best, 1 + maxPlayable(applyMove(pos, pl, m), pl, without(dice, v), memo));
      if (best === dice.length) break;
    }
    if (best === dice.length) break;
  }
  memo.set(k, best);
  return best;
}

/**
 * Legal next moves given the dice still to play, honouring the whole turn:
 * the player must use as many dice as possible, and if only one of two
 * different dice can be used, the higher one when either is playable.
 */
export function legalMoves(pos, pl, dice) {
  const memo = new Map();
  const total = maxPlayable(pos, pl, dice, memo);
  if (!total) return [];
  let moves = [];
  for (const v of uniq(dice)) {
    for (const m of singleMoves(pos, pl, v)) {
      if (1 + maxPlayable(applyMove(pos, pl, m), pl, without(dice, v), memo) === total) moves.push(m);
    }
  }
  if (total === 1 && dice.length === 2 && dice[0] !== dice[1]) {
    const hi = Math.max(...dice);
    if (moves.some((m) => m.die === hi)) moves = moves.filter((m) => m.die === hi);
  }
  return moves;
}

/**
 * Where the checker on `from` can end up this turn — by one die or by
 * chaining dice through legal intermediate points. Returns Map(to → moves[]),
 * keeping the shortest path to each destination.
 */
export function destinations(pos, pl, dice, from) {
  const out = new Map();
  const walk = (p, d, at, path) => {
    for (const m of legalMoves(p, pl, d)) {
      if (m.from !== at) continue;
      const next = path.concat(m);
      if (!out.has(m.to) || out.get(m.to).length > next.length) out.set(m.to, next);
      if (m.to !== OFF[pl] && d.length > 1) walk(applyMove(p, pl, m), without(d, m.die), m.to, next);
    }
  };
  walk(pos, dice, from, []);
  return out;
}

/** All distinct end positions of a full legal turn: [{ moves, pos }]. */
export function allTurns(pos, pl, dice) {
  const first = legalMoves(pos, pl, dice);
  if (!first.length) return [{ moves: [], pos }];
  const seen = new Map();
  const visited = new Set();
  const walk = (p, d, path) => {
    const ms = path.length ? legalMoves(p, pl, d) : first;
    if (!ms.length) {
      const k = keyOf(p, "");
      if (!seen.has(k)) seen.set(k, { moves: path, pos: p });
      return;
    }
    for (const m of ms) {
      const np = applyMove(p, pl, m);
      const k = keyOf(np, without(d, m.die));
      if (visited.has(k)) continue; // same node reached by another move order
      visited.add(k);
      walk(np, without(d, m.die), path.concat(m));
    }
  };
  walk(pos, dice, []);
  return [...seen.values()];
}

export const winner = (pos) => (pos.off[0] === 15 ? 0 : pos.off[1] === 15 ? 1 : -1);
