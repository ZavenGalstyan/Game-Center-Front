/**
 * Lightweight Classic Chess AI. Reuses the real rule engine — never generates
 * an illegal move. Not a serious engine: it looks one ply ahead, values
 * material, likes safe captures / checks / the centre, and adds a little
 * randomness so it isn't perfectly predictable.
 */

import {
  WHITE,
  BLACK,
  isAttacked,
  inCheck,
  legalMovesFrom,
  applyMove,
} from "./engine.js";

const VALUE = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
const CENTER = new Set(["3,3", "3,4", "4,3", "4,4"]);

/** Every fully-legal move for `color` in the given position. */
export function collectMoves(state, color) {
  const moves = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = state.board[r][c];
      if (!piece || piece.color !== color) continue;
      for (const m of legalMovesFrom(state, { r, c })) {
        moves.push({
          from: { r, c },
          to: { r: m.r, c: m.c },
          promotion: Boolean(m.promotion),
          enPassant: Boolean(m.enPassant),
        });
      }
    }
  }
  return moves;
}

/** Pick a move for the side to move, or null if there are none (mate/stalemate). */
export function pickAIMove(state) {
  const me = state.turn;
  const opponent = me === WHITE ? BLACK : WHITE;
  const moves = collectMoves(state, me);
  if (moves.length === 0) return null;

  let bestScore = -Infinity;
  let bestMoves = [];

  for (const mv of moves) {
    const target = state.board[mv.to.r][mv.to.c];
    const mover = state.board[mv.from.r][mv.from.c];
    let score = 0;

    if (target) score += VALUE[target.type];
    if (mv.enPassant) score += VALUE.p;
    if (mv.promotion) score += VALUE.q - VALUE.p;

    const next = applyMove(state, mv.from, mv.to, "q");

    // Avoid parking a piece where the opponent can just take it.
    if (isAttacked(next.board, mv.to.r, mv.to.c, opponent)) {
      score -= VALUE[mv.promotion ? "q" : mover.type] * 0.9;
    }
    // Checks are good.
    if (inCheck(next.board, opponent)) score += 40;
    // Mild pull toward the centre.
    if (CENTER.has(`${mv.to.r},${mv.to.c}`)) score += 15;

    score += Math.random() * 20;

    if (score > bestScore) {
      bestScore = score;
      bestMoves = [mv];
    } else if (score === bestScore) {
      bestMoves.push(mv);
    }
  }

  return bestMoves[Math.floor(Math.random() * bestMoves.length)];
}
