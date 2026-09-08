/**
 * Mini Golf Journey — scoring & star rules.
 *
 *   3 stars  → par or better
 *   2 stars  → par + 1
 *   1 star   → par + 2 or worse  (still a completion)
 *
 * `strokes` here is the total shot count including water penalties.
 */

export function starsFor(strokes, par) {
  if (strokes <= par) return 3;
  if (strokes === par + 1) return 2;
  return 1;
}

export function resultLabel(strokes, par) {
  if (strokes === 1) return "Hole in One";
  const d = strokes - par;
  if (d <= -3) return "Albatross";
  if (d === -2) return "Eagle";
  if (d === -1) return "Birdie";
  if (d === 0) return "Par";
  if (d === 1) return "Bogey";
  if (d === 2) return "Double Bogey";
  return `+${d}`;
}

export function isHoleInOne(strokes) {
  return strokes === 1;
}
