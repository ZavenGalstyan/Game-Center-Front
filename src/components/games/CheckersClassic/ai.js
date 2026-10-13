/**
 * Checkers Classic — AI. Every level picks from legalMoves(), so it plays by
 * exactly the player's rules (forced captures, full sequences, flying kings).
 *  easy   — random legal move
 *  medium — one-ply heuristic: captures, promotions, avoid hanging pieces
 *  hard   — iterative-deepening negamax with alpha-beta and a capture
 *           extension, capped by a small time budget
 */
import { legalMoves, applyMove, promoRow, WHITE } from "./rules.js";

const MAN = 100, KING = 320, WIN = 100000;
const value = (v) => (Math.abs(v) === 2 ? KING : MAN);

/** Static evaluation from the point of view of the side to move. */
export function evaluate(pos) {
  const { b } = pos;
  let s = 0;
  for (let i = 0; i < 64; i++) {
    const v = b[i];
    if (!v) continue;
    const side = Math.sign(v), r = i >> 3, c = i & 7;
    let x = value(v);
    if (Math.abs(v) === 1) {
      const adv = side === WHITE ? 7 - r : r; // rows advanced towards promotion
      x += adv * 6 + (adv >= 5 ? 12 : 0);
      if (r === promoRow(-side)) x += 10; // back-rank guard
      if (c === 0 || c === 7) x -= 4;
    } else if (r === 7 - c) x += 14; // king on the main road a1–h8
    if (r >= 2 && r <= 5 && c >= 2 && c <= 5) x += 6; // centre control
    s += side * x;
  }
  return s * pos.side;
}

/** Material the opponent can win right away after `pos` (its best capture). */
function threat(pos) {
  let best = 0;
  for (const m of legalMoves(pos)) {
    if (!m.caps.length) break;
    best = Math.max(best, m.caps.reduce((a, e) => a + value(pos.b[e]), 0));
  }
  return best;
}

function medium(pos, moves) {
  let best = null, bestScore = -Infinity;
  for (const m of moves) {
    const next = applyMove(pos, m);
    let s = m.caps.reduce((a, e) => a + value(pos.b[e]), 0);
    if (m.king && Math.abs(pos.b[m.from]) === 1) s += 150;
    s -= threat(next) * 0.9;
    s += -evaluate(next) * 0.05 + Math.random() * 12;
    if (s > bestScore) { bestScore = s; best = m; }
  }
  return best;
}

const STOP = Symbol("stop");

function hard(pos, moves, budget = 350) {
  const deadline = performance.now() + budget;
  let nodes = 0;
  const order = (ms) => ms.slice().sort((a, b) => b.caps.length - a.caps.length || Number(b.king) - Number(a.king));
  const search = (p, depth, alpha, beta, ply) => {
    if ((++nodes & 1023) === 0 && performance.now() > deadline) throw STOP;
    const ms = legalMoves(p);
    if (!ms.length) return -WIN + ply;
    const forced = ms[0].caps.length > 0;
    if (depth <= 0 && (!forced || depth < -8)) return evaluate(p);
    for (const m of order(ms)) {
      const sc = -search(applyMove(p, m), depth - 1, -beta, -alpha, ply + 1);
      if (sc > alpha) alpha = sc;
      if (alpha >= beta) break;
    }
    return alpha;
  };
  let root = order(moves.slice().sort(() => Math.random() - 0.5));
  let best = root[0];
  for (let depth = 1; depth <= 12; depth++) {
    try {
      let alpha = -Infinity, pick = root[0];
      const scored = [];
      for (const m of root) {
        const sc = -search(applyMove(pos, m), depth - 1, -Infinity, -alpha, 1);
        scored.push([sc, m]);
        if (sc > alpha) { alpha = sc; pick = m; }
      }
      best = pick;
      root = scored.sort((a, b) => b[0] - a[0]).map((x) => x[1]); // best-first for the next depth
      if (Math.abs(alpha) > WIN / 2) break; // forced win/loss found
    } catch (e) {
      if (e !== STOP) throw e;
      break;
    }
  }
  return best;
}

export function chooseMove(pos, level) {
  const moves = legalMoves(pos);
  if (!moves.length) return null;
  if (moves.length === 1) return moves[0];
  if (level === "easy") return moves[Math.floor(Math.random() * moves.length)];
  if (level === "medium") return medium(pos, moves);
  return hard(pos, moves);
}
