/**
 * Simplified ten-point-must judging.
 *
 * Each of three judges scores every round from the round's statistics with
 * their own emphasis (a striking judge, a grappling judge, a balanced one):
 *   effective striking  (damage dealt, significant strikes landed)
 *   effective grappling (takedowns, positional advances, submission threats)
 *   control             (top / clinch control time)
 *   aggression          (forward pressure — only as a tie-breaker weight)
 * Knockdowns weigh heavily. A clear winner gets 10-9; a dominant round
 * (knockdown + big margin, or a huge margin) is 10-8; a genuinely even round
 * can be 10-10.
 */
const JUDGES = [
  { name: "Judge Sal D'Amato", strike: 1.2, grap: 0.85 },
  { name: "Judge Lena Cruz", strike: 0.85, grap: 1.3 },
  { name: "Judge Ken Hollis", strike: 1.0, grap: 1.0 },
];
export const JUDGE_NAMES = JUDGES.map((j) => j.name);

export function roundPoints(s, j) {
  const striking = s.dmg * 1.0 + s.landedSig * 0.45 + s.headDmg * 0.25;
  const grappling = s.td * 5 + s.advance * 1.6 + s.subProg * 9 + s.subAtt * 1.2;
  return striking * j.strike + grappling * j.grap + s.ctrl * 0.14 + s.kd * 16 + s.aggr * 0.025;
}

/** stats = [statsA, statsB] for one round → { judges: [[a,b]×3], pts } */
export function scoreRound(stats, rng) {
  const judges = JUDGES.map((j) => {
    // each judge sees the round slightly differently (±4 %)
    const a = roundPoints(stats[0], j) * (1 + (rng ? rng.gauss() * 0.04 : 0));
    const b = roundPoints(stats[1], j) * (1 + (rng ? rng.gauss() * 0.04 : 0));
    const diff = a - b;
    const total = Math.max(1, a + b);
    if (Math.abs(diff) < 1.2 && Math.abs(diff) / total < 0.06) return [10, 10];
    const win = diff > 0 ? 0 : 1;
    const ws = stats[win];
    const ls = stats[1 - win];
    const dominant = (ws.kd >= 1 && Math.abs(diff) > 22) || ws.kd >= 2 || Math.abs(diff) > 55 || (ws.kd >= 1 && ls.kd === 0 && ws.dmg > ls.dmg * 2.5);
    const lose = dominant ? 8 : 9;
    return win === 0 ? [10, lose] : [lose, 10];
  });
  return { judges };
}

/** Totals the cards: unanimous / split / majority decision or draw. */
export function decide(cards) {
  const totals = JUDGES.map((_, j) => cards.reduce((acc, c) => [acc[0] + c.judges[j][0], acc[1] + c.judges[j][1]], [0, 0]));
  const votes = totals.map(([a, b]) => (a > b ? 0 : b > a ? 1 : -1));
  const w0 = votes.filter((v) => v === 0).length;
  const w1 = votes.filter((v) => v === 1).length;
  let winner = -1;
  let label = "Draw";
  if (w0 > w1 && w0 >= 2) winner = 0;
  else if (w1 > w0 && w1 >= 2) winner = 1;
  if (winner >= 0) {
    const wv = winner === 0 ? w0 : w1;
    const lv = winner === 0 ? w1 : w0;
    label = wv === 3 ? "Unanimous Decision" : lv === 1 ? "Split Decision" : "Majority Decision";
  } else if (w0 === 1 && w1 === 1) label = "Split Draw";
  else if (w0 + w1 === 1) label = "Majority Draw";
  return { winner, label, totals, judgeNames: JUDGE_NAMES };
}
