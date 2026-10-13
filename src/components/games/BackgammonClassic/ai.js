/**
 * Backgammon Classic — lightweight heuristic AI. Every candidate is a full
 * legal turn from rules.allTurns, so the AI plays by exactly the player's rules;
 * the levels differ only in how the end positions are scored.
 */
import { allTurns } from "./rules.js";

/** The position from `pl`'s seat: I move toward point 1, the opponent toward 24. */
function seat(pos, pl) {
  const me = Array(25).fill(0), op = Array(25).fill(0);
  for (let p = 1; p <= 24; p++) {
    const v = pl === 0 ? pos.pts[p] : -pos.pts[25 - p];
    if (v > 0) me[p] = v; else op[p] = -v;
  }
  return { me, op, meBar: pos.bar[pl], opBar: pos.bar[1 - pl], meOff: pos.off[pl], opOff: pos.off[1 - pl] };
}

function evaluate(pos, pl, hard) {
  const { me, op, meBar, opBar, meOff, opOff } = seat(pos, pl);
  let myPip = meBar * 25, opPip = opBar * 25, myBack = meBar ? 25 : 0, opBack = opBar ? 25 : 0;
  for (let p = 1; p <= 24; p++) {
    myPip += me[p] * p;
    opPip += op[p] * (25 - p);
    if (me[p]) myBack = Math.max(myBack, p);
    if (op[p] && !opBack) opBack = 25 - p;
  }
  let s = (opPip - myPip) * 0.6 + meOff * 4 - opOff * 4;

  // No contact left: a pure race — just run and bear off.
  if (myBack < 25 - opBack) return s * 2 + meOff * 6;

  s += opBar * (hard ? 14 : 10) - meBar * (hard ? 12 : 8);

  let made = 0, run = 0, prime = 0, homeMade = 0;
  for (let p = 1; p <= 24; p++) {
    if (me[p] >= 2) {
      made++;
      run++;
      prime = Math.max(prime, run);
      if (p <= 6) homeMade++;
      s += p <= 7 ? 3 : p >= 19 ? 1.5 : 1.2;
      if (hard && me[p] > 3) s -= (me[p] - 3) * 0.6; // stacking wastes checkers
    } else run = 0;
  }
  s += made * 1.5;

  // Blots: weighted by how many opponent checkers (incl. the bar) can reach them.
  for (let p = 1; p <= 24; p++) {
    if (me[p] !== 1) continue;
    if (!hard) { s -= p <= 6 ? 3 : 2; continue; }
    let shots = 0;
    for (let q = 0; q < p; q++) {
      const n = q === 0 ? opBar : op[q];
      const d = p - q;
      if (n && d <= 12) shots += d <= 6 ? 2 : 1;
    }
    if (shots) s -= (3 + shots * 1.4) * (0.4 + (25 - p) / 24);
    else s -= 0.5;
  }

  if (hard) {
    s += prime * prime * 0.8;
    s += homeMade * homeMade * 0.5 * (1 + opBar);
    // Opponent blots I can hit next turn are pressure, too.
    for (let q = 1; q <= 24; q++) if (op[q] === 1 && me.some((n, p) => n && p > q && p - q <= 6)) s += 1.2;
  }
  return s;
}

export function chooseTurn(pos, pl, dice, level = "medium") {
  const turns = allTurns(pos, pl, dice);
  if (turns.length === 1 || (level === "easy" && Math.random() < 0.75)) {
    return turns[Math.floor(Math.random() * turns.length)].moves;
  }
  const hard = level === "hard";
  let best = turns[0], bestScore = -Infinity;
  for (const t of turns) {
    const sc = evaluate(t.pos, pl, hard) + (hard ? 0 : Math.random() * 0.8);
    if (sc > bestScore) { bestScore = sc; best = t; }
  }
  return best.moves;
}
