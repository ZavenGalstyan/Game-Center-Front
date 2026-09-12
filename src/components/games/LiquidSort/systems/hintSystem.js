/**
 * Liquid Sort — hint suggestions. Kept separate from rendering: returns
 * `{ from, to }` (bottle indices) or null when nothing useful is found.
 *
 * Strategy:
 *  1. Try a bounded BFS solve of the CURRENT board (cheap by the time a
 *     player asks for a hint — most bottles are usually already sorted).
 *     If it finds a solution, the hint is simply its first move.
 *  2. If the search budget runs out (large mid-game boards), fall back to a
 *     greedy heuristic that never freezes the UI: prefer a move that
 *     completes a bottle, then one that stacks onto a matching color, then
 *     one that unburies a currently-blocked color into a free empty bottle.
 */
import { legalMoves, solve } from "./puzzleSolver.js";
import { getPourAmount, getFreeCapacity, CAPACITY } from "./pourRules.js";

function heuristicHint(board, capacity) {
  const moves = legalMoves(board, capacity);
  if (moves.length === 0) return null;

  let best = null;
  let bestScore = -Infinity;
  for (const [from, to] of moves) {
    const amount = getPourAmount(board[from], board[to], capacity);
    const destWasEmpty = board[to].length === 0;
    const resultLen = board[to].length + amount;
    const sourceBecomesEmpty = board[from].length === amount;

    let score = 0;
    if (resultLen === capacity) score += 100; // completes a bottle
    if (!destWasEmpty) score += 25; // consolidating same color
    score += amount * 3;
    if (destWasEmpty && sourceBecomesEmpty) score -= 40; // pointless relocation
    if (destWasEmpty && !sourceBecomesEmpty) score += 8; // frees a buried color
    if (getFreeCapacity(board[to], capacity) - amount === 0) score += 5; // fills dest exactly

    if (score > bestScore) {
      bestScore = score;
      best = { from, to };
    }
  }
  return best;
}

export function getHint(board, { capacity = CAPACITY, maxExpanded = 40000 } = {}) {
  const result = solve(board, { capacity, maxExpanded });
  if (result.solved && result.moves.length > 0) {
    const [from, to] = result.moves[0];
    return { from, to };
  }
  return heuristicHint(board, capacity);
}
