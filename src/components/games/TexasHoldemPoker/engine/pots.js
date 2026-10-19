/**
 * Pot manager — main pot / side pots and their distribution.
 *
 * Pots are built from each player's total contribution to the hand
 * (`total`). Every distinct contribution level forms a layer; a layer's chips
 * come from everyone who reached it (folded players included — their chips
 * stay in) and it can only be won by non-folded players who reached it.
 * Consecutive layers with the same eligible set merge into one pot.
 *
 * Uncalled bets are returned before pots are built (see table.js), so the
 * top layer always has an eligible player; as a defensive fallback a layer
 * with no eligible player is merged into the pot below it.
 *
 * ODD CHIP RULE: when a pot splits unevenly, each leftover chip goes, one at
 * a time, to the winners in seat order starting from the first seat to the
 * left of the dealer button (the standard casino rule).
 */

/**
 * @param {{total:number, folded:boolean}[]} players indexed by seat
 * @returns {{amount:number, eligible:number[]}[]} main pot first
 */
export function buildPots(players) {
  const levels = [...new Set(players.map((p) => p.total).filter((t) => t > 0))].sort((a, b) => a - b);
  const pots = [];
  let prev = 0;
  for (const level of levels) {
    let amount = 0;
    const eligible = [];
    players.forEach((p, i) => {
      amount += Math.max(0, Math.min(p.total, level) - prev);
      if (!p.folded && p.total >= level) eligible.push(i);
    });
    prev = level;
    if (amount <= 0) continue;
    const last = pots[pots.length - 1];
    if (!eligible.length) {
      if (last) last.amount += amount;
      else pots.push({ amount, eligible });
      continue;
    }
    if (last && (last.eligible.length === 0 || sameSet(last.eligible, eligible))) {
      last.amount += amount;
      if (!last.eligible.length) last.eligible = eligible;
    } else {
      pots.push({ amount, eligible });
    }
  }
  return pots;
}

const sameSet = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

/** Seats ordered clockwise starting left of the dealer (for odd chips). */
export function seatOrderFromDealer(n, dealer) {
  return Array.from({ length: n }, (_, k) => (dealer + 1 + k) % n);
}

/**
 * Award pots.
 * @param pots      from buildPots
 * @param scores    seat → hand score (only needed for contested pots)
 * @param n         number of seats
 * @param dealer    dealer seat (for the odd-chip rule)
 * @returns {{pots: {amount, eligible, winners, shares}[], awards: number[]}}
 */
export function distribute(pots, scores, n, dealer) {
  const awards = new Array(n).fill(0);
  const order = seatOrderFromDealer(n, dealer);
  const out = pots.map((pot) => {
    let winners;
    if (pot.eligible.length <= 1) winners = pot.eligible.slice();
    else {
      const best = Math.max(...pot.eligible.map((i) => scores[i]));
      winners = pot.eligible.filter((i) => scores[i] === best);
    }
    const shares = {};
    if (!winners.length) return { ...pot, winners, shares };
    const base = Math.floor(pot.amount / winners.length);
    let odd = pot.amount - base * winners.length;
    const ordered = order.filter((i) => winners.includes(i));
    for (const i of ordered) {
      shares[i] = base + (odd > 0 ? 1 : 0);
      if (odd > 0) odd--;
      awards[i] += shares[i];
    }
    return { ...pot, winners: ordered, shares };
  });
  return { pots: out, awards };
}
