/**
 * Water Tanks — one play session as a pure reducer.
 *
 * This is the single authoritative copy of the puzzle: tank amounts, locks,
 * fixture uses, move count, history, selection and the running pour. Visual
 * components only read it.
 *
 * Pour transaction (atomic):
 *   TAP source → TAP destination
 *     → validate → snapshot to history → commit the resulting state and
 *       moves + 1 in ONE reducer step → `pour` is set (input locked)
 *   the view animates `pour.before → state.amounts` through PHASE / TICK
 *   END(token) → `pour` cleared (input unlocked) → solved check
 * Every timed action carries the pour's token; a stale timer from an older
 * pour, a restart or an undo can never touch the current state.
 *
 * States of the interaction: IDLE (selected=null, pour=null) · SOURCE_SELECTED ·
 * POURING (pour.phase lift|move|flow|return) · COMPLETE_CHECK (END) · solved.
 */
import { applyMove, cloneState, initialState, isSolved, moveBlockReason, pourBlockReason, assertConservation } from "./rules.js";
import { hintMove } from "./solver.js";

export function createSession(level) {
  return {
    level,
    state: initialState(level),
    moves: 0,
    history: [],
    selected: null,
    pour: null,
    seq: 0,
    status: "playing",
    hint: null, // { move } | { none: true }
    hintsUsed: 0,
    undos: 0,
    feedback: null, // { seq, tank, reason }
  };
}

const busy = (s) => s.pour !== null || s.status !== "playing";

function reject(s, tank, reason) {
  return { ...s, feedback: { seq: s.seq + 1, tank, reason }, seq: s.seq + 1 };
}

function sourceReason(s, i) {
  const { level, state } = s;
  if (!state.unlocked[i]) return "locked-source";
  if (level.tanks[i].pourOut === false) return "inlet";
  if (state.amounts[i] <= 0) return "empty";
  return null;
}

function start(s, move) {
  const reason = moveBlockReason(s.level, s.state, move);
  const focus = move.kind === "pour" ? move.to : move.tank;
  if (reason) return reject(s, focus, reason);
  const r = applyMove(s.level, s.state, move);
  if (!r) return reject(s, focus, "invalid");
  if (import.meta.env?.DEV) assertConservation(s.level, s.state, r.state, move);
  const token = s.seq + 1;
  return {
    ...s,
    seq: token,
    history: [...s.history, { state: s.state, moves: s.moves }],
    state: r.state,
    moves: s.moves + 1,
    selected: null,
    hint: null,
    pour: {
      token,
      ...move,
      amount: r.amount,
      before: s.state.amounts.slice(),
      unlockedNow: r.unlockedNow,
      phase: "lift",
      k: 0,
    },
  };
}

export function sessionReducer(s, a) {
  switch (a.type) {
    case "TAP": {
      if (busy(s)) return s;
      const i = a.tank;
      if (s.selected === null) {
        const why = sourceReason(s, i);
        if (why) return reject(s, i, why);
        return { ...s, selected: i, hint: s.hint && !s.hint.none ? s.hint : null };
      }
      if (s.selected === i) return { ...s, selected: null };
      const why = pourBlockReason(s.level, s.state, s.selected, i);
      if (why) return reject(s, i, why);
      return start(s, { kind: "pour", from: s.selected, to: i });
    }
    case "FIXTURE":
      if (busy(s)) return s;
      return start({ ...s, selected: null }, { kind: a.kind, tank: a.tank });
    case "DESELECT":
      if (s.selected === null) return s;
      return { ...s, selected: null };
    case "PHASE":
      if (!s.pour || s.pour.token !== a.token || s.pour.phase === a.phase) return s;
      return { ...s, pour: { ...s.pour, phase: a.phase } };
    case "TICK":
      if (!s.pour || s.pour.token !== a.token) return s;
      return { ...s, pour: { ...s.pour, k: Math.min(s.pour.amount, a.k) } };
    case "END": {
      if (!s.pour || s.pour.token !== a.token) return s;
      const solved = isSolved(s.level, s.state);
      return { ...s, pour: null, status: solved ? "solved" : "playing" };
    }
    case "UNDO": {
      if (busy(s) || !s.history.length) return s;
      const prev = s.history[s.history.length - 1];
      return {
        ...s,
        state: cloneState(prev.state),
        moves: prev.moves,
        history: s.history.slice(0, -1),
        selected: null,
        hint: null,
        undos: s.undos + 1,
        seq: s.seq + 1,
      };
    }
    case "HINT": {
      if (busy(s)) return s;
      const move = hintMove(s.level, s.state);
      if (!move) return { ...s, selected: null, hint: { none: true } };
      return { ...s, selected: null, hint: { move }, hintsUsed: s.hintsUsed + 1 };
    }
    case "CLEAR_HINT":
      return s.hint ? { ...s, hint: null } : s;
    case "RESET":
      return createSession(s.level);
    default:
      return s;
  }
}

/**
 * Amount to SHOW for tank i right now: the committed amount, except while a
 * pour is animating, where it steps from `before` toward the result in sync
 * with the visual flow (pour.k litres moved so far).
 */
export function shownAmount(s, i) {
  const p = s.pour;
  if (!p) return s.state.amounts[i];
  if (p.phase === "lift" || p.phase === "move") return p.before[i];
  if (p.phase === "return") return s.state.amounts[i];
  const k = p.k;
  if (p.kind === "pour") {
    if (i === p.from) return p.before[i] - k;
    if (i === p.to) return p.before[i] + k;
  } else if (i === p.tank) {
    return p.kind === "fill" ? p.before[i] + k : p.before[i] - k;
  }
  return s.state.amounts[i];
}
