/**
 * Darts Championship 3D — x01 match rules, checkout table and AI (pure).
 * Straight-in, double-out: a leg ends on exactly zero with a double or the
 * inner bull. Going below zero, leaving 1, or reaching zero any other way is
 * a bust — the turn ends and the score returns to its turn-start value.
 */
import { scoreAt, targetPoint, R } from "./board.js";

export const DIFFICULTY = {
  easy: { name: "Easy", sigma: 30, drift: 3, release: 2 },
  medium: { name: "Medium", sigma: 18, drift: 7, release: 3.5 },
  hard: { name: "Hard", sigma: 11, drift: 12, release: 5 },
};

/* ---------------------------------------------------------------- rules */

/** Outcome of one dart from `rem` points left: { type: ok|bust|win, rem } */
export function evaluate(rem, hit) {
  const left = rem - hit.score;
  if (left < 0 || left === 1 || (left === 0 && !hit.double)) return { type: "bust", rem };
  if (left === 0) return { type: "win", rem: 0 };
  return { type: "ok", rem: left };
}

export function newMatch(start, first = 0) {
  return { start, rem: [start, start], player: first, turnStart: start, darts: [], over: false, winner: -1, thrown: [0, 0], scored: [0, 0], best: [0, 0], checkout: 0, turns: [[], []] };
}

/**
 * Apply a dart (a scoreAt() result) to the match. Returns a new match and the
 * outcome: { type, turnOver, turnScore }. The turn ends on 3 darts, bust or win.
 */
export function applyDart(m, hit) {
  if (m.over || m.darts.length >= 3) throw new Error("no dart to throw");
  const p = m.player;
  const ev = evaluate(m.rem[p], hit);
  const n = { ...m, rem: [...m.rem], darts: [...m.darts, { ...hit, bust: ev.type === "bust" }], thrown: [...m.thrown], scored: [...m.scored], best: [...m.best], turns: m.turns.map((t) => [...t]) };
  n.thrown[p]++;
  if (ev.type === "bust") n.rem[p] = m.turnStart;
  else n.rem[p] = ev.rem;
  const turnScore = m.turnStart - n.rem[p];
  const turnOver = ev.type !== "ok" || n.darts.length === 3;
  if (turnOver) {
    n.scored[p] += turnScore;
    n.best[p] = Math.max(n.best[p], turnScore);
    n.turns[p].push(ev.type === "bust" ? "BUST" : turnScore);
  }
  if (ev.type === "win") {
    n.over = true;
    n.winner = p;
    n.checkout = m.turnStart;
  }
  return { m: n, outcome: { type: ev.type, turnOver, turnScore } };
}

/** Hand the oche to the other player (after a finished turn). */
export function nextTurn(m) {
  const player = 1 - m.player;
  return { ...m, player, turnStart: m.rem[player], darts: [] };
}

export const average = (m, p) => (m.thrown[p] ? (m.scored[p] / m.thrown[p]) * 3 : 0);

/* ---------------------------------------------------------------- checkouts */

/** Every distinct aimable bed. */
export const TARGETS = (() => {
  const t = [];
  for (let n = 1; n <= 20; n++) {
    t.push({ label: `S${n}`, score: n, double: false, kind: "S" });
    t.push({ label: `D${n}`, score: 2 * n, double: true, kind: "D" });
    t.push({ label: `T${n}`, score: 3 * n, double: false, kind: "T" });
  }
  t.push({ label: "25", score: 25, double: false, kind: "B" });
  t.push({ label: "BULL", score: 50, double: true, kind: "D" });
  return t;
})();

const MAX = 501;
/** FIN[n] = fewest darts to check out n with perfect aim (Infinity for 1). */
export const FIN = (() => {
  const f = new Array(MAX + 1).fill(Infinity);
  f[0] = 0;
  for (let n = 2; n <= MAX; n++) {
    for (const t of TARGETS) {
      const left = n - t.score;
      if (left === 0 && t.double) f[n] = 1;
      else if (left >= 2 && f[left] + 1 < f[n]) f[n] = f[left] + 1;
    }
  }
  return f;
})();

// favourite finishing doubles, best first (halve cleanly after a miss)
const PREF = [40, 32, 16, 36, 24, 20, 8, 50, 12, 28, 4, 2];

function cost(rem, t) {
  const left = rem - t.score;
  if (left < 0 || left === 1 || (left === 0 && !t.double)) return Infinity;
  const pref = left === 0 ? 0 : PREF.includes(left) ? PREF.indexOf(left) * 0.4 : 6;
  return FIN[left] * 100 + pref + (t.kind === "T" ? 3 : t.kind === "D" ? 7 : t.kind === "B" ? 9 : 0) + (t.label === "BULL" ? 4 : 0) - t.score * 0.01;
}

/** Best bed to aim at with `rem` left. */
export function chooseTarget(rem) {
  if (rem > 170) return "T20";
  let best = null;
  let bc = Infinity;
  for (const t of TARGETS) {
    const c = cost(rem, t);
    if (c < bc) [best, bc] = [t, c];
  }
  return best ? best.label : "T20";
}

/** Suggested route (labels) when rem can be finished in `dartsLeft`, else null. */
export function checkoutRoute(rem, dartsLeft = 3) {
  if (rem > 170 || FIN[rem] > dartsLeft) return null;
  const route = [];
  let r = rem;
  while (r > 0 && route.length < dartsLeft) {
    const label = chooseTarget(r);
    const t = TARGETS.find((x) => x.label === label);
    route.push(label === "BULL" ? "Bull" : label.startsWith("S") ? label.slice(1) : label);
    r -= t.score;
  }
  return r === 0 ? route : null;
}

/* ---------------------------------------------------------------- throw models */

/** Standard normal sample. */
export function gauss(rand = Math.random) {
  let u = 0;
  while (u === 0) u = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
}

/** AI throw: aims at the chosen bed with difficulty scatter. → { target, x, y, hit } */
export function aiThrow(rem, level, rand = Math.random) {
  const target = chooseTarget(rem);
  const p = targetPoint(target);
  const s = DIFFICULTY[level].sigma;
  const x = p.x + gauss(rand) * s;
  const y = p.y + gauss(rand) * s;
  return { target, aim: p, x, y, hit: scoreAt(x, y) };
}

/** Sweet spot of the player's power meter; off-power throws land high/low. */
export const IDEAL_POWER = 0.72;
export const POWER_MM = 170;
export const powerOffset = (power) => (power - IDEAL_POWER) * POWER_MM;
export const isOnBoard = (x, y) => Math.hypot(x, y) <= R.board;
