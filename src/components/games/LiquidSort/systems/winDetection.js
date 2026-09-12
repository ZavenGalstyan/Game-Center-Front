/**
 * Liquid Sort — win detection. Kept pure and separate from rendering so it is
 * trivially testable: a level is solved when EVERY bottle is resolved (empty,
 * or full with one uniform color). Partial same-color stacks split across
 * several incomplete bottles do NOT count, even if no bottle is "mixed".
 */
import { isBottleResolved, CAPACITY } from "./pourRules.js";

export function isSolved(board, capacity = CAPACITY) {
  return board.every((bottle) => isBottleResolved(bottle, capacity));
}

/** True once every unit of every color has landed in a completed bottle. */
export function countCompletedColors(board, capacity = CAPACITY) {
  return board.filter((b) => b.length === capacity && b.every((c) => c === b[0])).length;
}
