/**
 * Liquid Sort — lightweight BFS solver with state deduplication.
 *
 * Used two ways:
 *  1. Dev-time (Node, via scripts/generateLevels.mjs) to double-check every
 *     generated level and to compute an optimal move count for star tuning.
 *  2. Runtime, by systems/hintSystem.js, to suggest the next move — bounded
 *     by MAX_EXPANDED_STATES so it can never freeze the UI. Gameplay states
 *     are usually far smaller than worst-case generation states (many
 *     bottles are already sorted by the time a hint is requested).
 *
 * Board states are canonicalised with serializeBoard() so transposing two
 * interchangeable empty bottles never explodes the visited set.
 */
import { canPour, getPourAmount, getTopColor, serializeBoard, CAPACITY } from "./pourRules.js";
import { isSolved } from "./winDetection.js";

/** All legal (from, to) moves for a board, deduped (identical empty dests collapse). */
export function legalMoves(board, capacity = CAPACITY) {
  const moves = [];
  const seenEmptyDest = new Set();
  for (let i = 0; i < board.length; i++) {
    if (board[i].length === 0) continue;
    const topColor = getTopColor(board[i]);
    for (let j = 0; j < board.length; j++) {
      if (i === j) continue;
      const dest = board[j];
      if (dest.length === 0) {
        // pouring into interchangeable empty bottles is the same move
        const key = `${topColor}->empty`;
        if (seenEmptyDest.has(key)) continue;
      }
      if (!canPour(board[i], dest, capacity)) continue;
      if (dest.length === 0) seenEmptyDest.add(`${topColor}->empty`);
      moves.push([i, j]);
    }
    seenEmptyDest.clear();
  }
  return moves;
}

function applyMove(board, from, to, capacity) {
  const amount = getPourAmount(board[from], board[to], capacity);
  const color = getTopColor(board[from]);
  const next = board.map((b) => b.slice());
  next[from] = next[from].slice(0, next[from].length - amount);
  next[to] = next[to].concat(Array(amount).fill(color));
  return next;
}

/**
 * Move ordering heuristic: prefer moves that complete a bottle, then moves
 * that merge onto an already-matching non-empty bottle, then moves into an
 * empty bottle. Cuts the search tree dramatically without sacrificing
 * correctness (used only for ordering, not for pruning).
 */
function scoreMove(board, from, to, capacity) {
  const amount = getPourAmount(board[from], board[to], capacity);
  const destWasEmpty = board[to].length === 0;
  const resultLen = board[to].length + amount;
  let score = 0;
  if (resultLen === capacity) score += 100; // completes a bottle
  if (!destWasEmpty) score += 20; // consolidating is usually productive
  score += amount; // bigger transfers first
  if (destWasEmpty && board[from].length === amount) score -= 30; // pure relocation, rarely useful
  return score;
}

/**
 * Bounded BFS/best-first search for a solution.
 * Returns { solved, moves: [[from,to], ...], expanded } — `moves` is the
 * full solution path (only present when solved), `expanded` is a diagnostic.
 */
export function solve(board, { capacity = CAPACITY, maxExpanded = 60000 } = {}) {
  const startKey = serializeBoard(board);
  if (isSolved(board, capacity)) return { solved: true, moves: [], expanded: 0 };

  const visited = new Set([startKey]);
  // Plain FIFO queue, read via an advancing index rather than Array#shift —
  // every move has equal weight (depth +1), so pure insertion order already
  // gives real breadth-first (shortest-path-optimal) traversal. The move
  // heuristic below only orders SIBLINGS, which speeds up finding *a*
  // solution sooner within the same depth layer, without affecting
  // optimality (BFS still exhausts an entire depth before the next).
  let frontier = [{ board, path: [] }];
  let head = 0;
  let expanded = 0;

  while (head < frontier.length && expanded < maxExpanded) {
    const current = frontier[head++];
    expanded++;

    const moves = legalMoves(current.board, capacity);
    moves.sort((a, b) => scoreMove(current.board, b[0], b[1], capacity) - scoreMove(current.board, a[0], a[1], capacity));

    for (const [from, to] of moves) {
      const nextBoard = applyMove(current.board, from, to, capacity);
      const key = serializeBoard(nextBoard);
      if (visited.has(key)) continue;
      visited.add(key);
      const path = current.path.concat([[from, to]]);
      if (isSolved(nextBoard, capacity)) {
        return { solved: true, moves: path, expanded };
      }
      frontier.push({ board: nextBoard, path });
    }
  }

  return { solved: false, moves: null, expanded };
}

/** Convenience: just the length of an optimal-ish solution, or null. */
export function estimateOptimalMoves(board, opts) {
  const result = solve(board, opts);
  return result.solved ? result.moves.length : null;
}
