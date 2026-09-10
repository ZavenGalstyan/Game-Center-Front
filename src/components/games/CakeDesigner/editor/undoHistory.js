/**
 * Cake Designer — tiny undo/redo ring for the editor & Free Design.
 *
 * Immutable: every operation returns a new history object. Snapshots are the
 * whole cake config (small, plain JSON) so undo is a straight swap. Capped so
 * a long Free Design session can't grow without bound.
 */

const LIMIT = 40;

export function initHistory(present) {
  return { past: [], present, future: [] };
}

/** Record a new state. Drops the redo stack, like every editor. */
export function pushHistory(history, next) {
  if (next === history.present) return history;
  const past = [...history.past, history.present].slice(-LIMIT);
  return { past, present: next, future: [] };
}

export function undo(history) {
  if (!history.past.length) return history;
  const previous = history.past[history.past.length - 1];
  return {
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future].slice(0, LIMIT),
  };
}

export function redo(history) {
  if (!history.future.length) return history;
  const [nextPresent, ...rest] = history.future;
  return {
    past: [...history.past, history.present].slice(-LIMIT),
    present: nextPresent,
    future: rest,
  };
}

/** Swap the present without recording history (used mid-drag). */
export function replacePresent(history, next) {
  return { ...history, present: next };
}

/** Commit `next` while pushing an explicit "before" snapshot onto the past. */
export function commitFrom(history, before, next) {
  if (next === before) return replacePresent(history, next);
  const past = [...history.past, before].slice(-LIMIT);
  return { past, present: next, future: [] };
}

export const canUndo = (h) => h.past.length > 0;
export const canRedo = (h) => h.future.length > 0;
