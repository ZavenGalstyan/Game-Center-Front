/**
 * Water Tanks — the pure puzzle rules. No React, no DOM, no randomness:
 * the same state + the same move always gives the same result, and the
 * BFS solver (solver.js) walks exactly these transitions.
 *
 * A *compiled* level (see level.js) is the input everywhere:
 *   tanks[i]  { id, capacity, initial, shape, fill, drain, lock, pourOut }
 *             fill / drain: 0 = none, n = uses, Infinity = unlimited
 *             lock: null | { tank: index, amount }  (unlocks for good once
 *                   that tank holds exactly `amount` litres)
 *             pourOut: false = inlet-only tank
 *   valves    [{ from, to }]  one-way pipe: from → to only, never back
 *   targets   [{ tank: index | null, amount }]
 *
 * A puzzle *state* is plain data:
 *   { amounts: int[], unlocked: bool[], fillLeft: number[], drainLeft: number[] }
 *
 * Moves:
 *   { kind: "pour", from, to }   — the core rule: transfer = min(source, free space)
 *   { kind: "fill", tank }       — fill valve: top the tank up to capacity
 *   { kind: "drain", tank }      — drain: empty the tank
 */

/** Litres a pour would move. Never negative, never more than either side allows. */
export function calculateTransfer(sourceAmount, destAmount, destCapacity) {
  const available = Math.max(0, sourceAmount);
  const freeSpace = Math.max(0, destCapacity - destAmount);
  return Math.min(available, freeSpace);
}

export function initialState(level) {
  return {
    amounts: level.tanks.map((t) => t.initial),
    unlocked: level.tanks.map((t) => !t.lock),
    fillLeft: level.tanks.map((t) => t.fill),
    drainLeft: level.tanks.map((t) => t.drain),
  };
}

export const cloneState = (s) => ({
  amounts: s.amounts.slice(),
  unlocked: s.unlocked.slice(),
  fillLeft: s.fillLeft.slice(),
  drainLeft: s.drainLeft.slice(),
});

/** Deterministic key — "8,0,0" for plain levels, extra sections only when they matter. */
export function serializeState(s) {
  let k = s.amounts.join(",");
  if (s.unlocked.some((u) => !u)) k += "|" + s.unlocked.map((u) => (u ? 1 : 0)).join("");
  if (s.fillLeft.some((n) => n > 0 && n !== Infinity)) k += "|f" + s.fillLeft.join(",");
  if (s.drainLeft.some((n) => n > 0 && n !== Infinity)) k += "|d" + s.drainLeft.join(",");
  return k;
}

export const totalWater = (s) => s.amounts.reduce((a, b) => a + b, 0);

/** Is `from → to` blocked by a one-way valve pointing the other way? */
export function valveBlocks(level, from, to) {
  return level.valves.some((v) => v.from === to && v.to === from);
}

/**
 * Why a pour is not allowed, or null when it is. Order matters: the most
 * useful explanation for the player comes first.
 */
export function pourBlockReason(level, s, from, to) {
  if (from === to) return "same";
  if (from < 0 || to < 0 || from >= level.tanks.length || to >= level.tanks.length) return "missing";
  if (!s.unlocked[from]) return "locked-source";
  if (!s.unlocked[to]) return "locked-dest";
  if (level.tanks[from].pourOut === false) return "inlet";
  if (valveBlocks(level, from, to)) return "valve";
  if (s.amounts[from] <= 0) return "empty";
  if (s.amounts[to] >= level.tanks[to].capacity) return "full";
  return null;
}

export const isValidPour = (level, s, from, to) => pourBlockReason(level, s, from, to) === null;

export function fillBlockReason(level, s, i) {
  const t = level.tanks[i];
  if (!t || !t.fill) return "no-fill";
  if (!s.unlocked[i]) return "locked-dest";
  if (s.fillLeft[i] <= 0) return "no-uses";
  if (s.amounts[i] >= t.capacity) return "full";
  return null;
}

export function drainBlockReason(level, s, i) {
  const t = level.tanks[i];
  if (!t || !t.drain) return "no-drain";
  if (!s.unlocked[i]) return "locked-source";
  if (s.drainLeft[i] <= 0) return "no-uses";
  if (s.amounts[i] <= 0) return "empty";
  return null;
}

export function moveBlockReason(level, s, m) {
  if (m.kind === "pour") return pourBlockReason(level, s, m.from, m.to);
  if (m.kind === "fill") return fillBlockReason(level, s, m.tank);
  if (m.kind === "drain") return drainBlockReason(level, s, m.tank);
  return "unknown";
}

/** Locks open (permanently) the moment their condition holds. */
function refreshLocks(level, s) {
  for (let i = 0; i < level.tanks.length; i++) {
    const lock = level.tanks[i].lock;
    if (!s.unlocked[i] && lock && s.amounts[lock.tank] === lock.amount) s.unlocked[i] = true;
  }
}

/**
 * Apply one move. Returns { state, amount, unlockedNow } with a NEW state, or
 * null for an illegal move (the old state is never mutated either way).
 * `amount` is the litres moved (poured, filled or drained).
 */
export function applyMove(level, s, m) {
  if (moveBlockReason(level, s, m) !== null) return null;
  const next = cloneState(s);
  let amount = 0;
  if (m.kind === "pour") {
    amount = calculateTransfer(s.amounts[m.from], s.amounts[m.to], level.tanks[m.to].capacity);
    next.amounts[m.from] -= amount;
    next.amounts[m.to] += amount;
  } else if (m.kind === "fill") {
    amount = level.tanks[m.tank].capacity - s.amounts[m.tank];
    next.amounts[m.tank] = level.tanks[m.tank].capacity;
    next.fillLeft[m.tank] -= 1;
  } else {
    amount = s.amounts[m.tank];
    next.amounts[m.tank] = 0;
    next.drainLeft[m.tank] -= 1;
  }
  if (amount <= 0) return null;
  refreshLocks(level, next);
  const unlockedNow = [];
  for (let i = 0; i < next.unlocked.length; i++) if (next.unlocked[i] && !s.unlocked[i]) unlockedNow.push(i);
  return { state: next, amount, unlockedNow };
}

/** Convenience for the plain two-tank case and tests. */
export function applyPour(level, s, from, to) {
  return applyMove(level, s, { kind: "pour", from, to });
}

/** Every legal move from `s`, in a fixed order (pours, then fills, then drains). */
export function legalMoves(level, s) {
  const out = [];
  const n = level.tanks.length;
  for (let from = 0; from < n; from++) {
    for (let to = 0; to < n; to++) {
      if (from !== to && pourBlockReason(level, s, from, to) === null) out.push({ kind: "pour", from, to });
    }
  }
  for (let i = 0; i < n; i++) if (fillBlockReason(level, s, i) === null) out.push({ kind: "fill", tank: i });
  for (let i = 0; i < n; i++) if (drainBlockReason(level, s, i) === null) out.push({ kind: "drain", tank: i });
  return out;
}

/** All successor states (no-change moves are already excluded by the rules). */
export function generateNextStates(level, s) {
  const out = [];
  for (const m of legalMoves(level, s)) {
    const r = applyMove(level, s, m);
    if (r) out.push({ move: m, state: r.state });
  }
  return out;
}

/**
 * Which targets are met. Tank-bound targets check their tank; free targets
 * ("any tank") must each be satisfied by a DIFFERENT tank, not already used
 * by a tank-bound target — a tiny backtracking match (≤ 6 tanks).
 */
export function targetStatus(level, s) {
  const met = level.targets.map(() => false);
  const used = new Set();
  level.targets.forEach((t, k) => {
    if (t.tank !== null && s.amounts[t.tank] === t.amount) {
      met[k] = true;
      used.add(t.tank);
    }
  });
  const free = level.targets.map((t, k) => k).filter((k) => level.targets[k].tank === null);
  // greedy is enough for a per-target "lit" indicator; isSolved does the exact match
  for (const k of free) {
    const i = s.amounts.findIndex((a, idx) => a === level.targets[k].amount && !used.has(idx));
    if (i >= 0) {
      met[k] = true;
      used.add(i);
    }
  }
  return met;
}

export function isSolved(level, s) {
  const used = new Set();
  for (const t of level.targets) {
    if (t.tank === null) continue;
    if (s.amounts[t.tank] !== t.amount) return false;
    used.add(t.tank);
  }
  const free = level.targets.filter((t) => t.tank === null).map((t) => t.amount);
  const match = (k) => {
    if (k === free.length) return true;
    for (let i = 0; i < s.amounts.length; i++) {
      if (used.has(i) || s.amounts[i] !== free[k]) continue;
      used.add(i);
      if (match(k + 1)) return true;
      used.delete(i);
    }
    return false;
  };
  return match(0);
}

/** Tanks that currently satisfy a target (for the success glow). */
export function satisfiedTanks(level, s) {
  const out = new Set();
  level.targets.forEach((t) => {
    if (t.tank !== null) {
      if (s.amounts[t.tank] === t.amount) out.add(t.tank);
    } else {
      s.amounts.forEach((a, i) => {
        if (a === t.amount) out.add(i);
      });
    }
  });
  return out;
}

/** Development guard: an ordinary pour must never create or destroy water. */
export function assertConservation(level, before, after, move) {
  if (move.kind !== "pour") return true;
  const ok = totalWater(before) === totalWater(after)
    && after.amounts.every((a, i) => Number.isInteger(a) && a >= 0 && a <= level.tanks[i].capacity);
  if (!ok && typeof console !== "undefined") {
    console.error("[Water Tanks] conservation violated", { before: before.amounts, after: after.amounts, move });
  }
  return ok;
}

export const sameMove = (a, b) => Boolean(a && b) && a.kind === b.kind
  && (a.kind === "pour" ? a.from === b.from && a.to === b.to : a.tank === b.tank);
