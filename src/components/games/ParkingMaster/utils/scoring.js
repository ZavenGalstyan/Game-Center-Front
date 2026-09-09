/**
 * Parking Master — star rating and precision scoring.
 *
 * Precision is computed by the parking validator from how centred and how
 * aligned the car finished (0–100). Stars combine precision, collisions and
 * time-vs-par. The bars are deliberately reachable: a clean, unhurried park
 * that is reasonably centred earns 3 stars.
 */

export function ratePark({ precision, collisions, time, parTime }) {
  const p = clamp(precision, 0, 100);
  const overPar = parTime ? time / parTime : 1;

  let stars = 1;
  // 3 stars: tidy park, at most a light touch, roughly on par
  if (p >= 88 && collisions <= 1 && overPar <= 1.35) stars = 3;
  else if (p >= 72 && collisions <= 2 && overPar <= 1.9) stars = 2;
  else stars = 1;

  // a genuinely messy run can still only be 1 even if fast
  if (p < 60 || collisions >= 4) stars = 1;

  const perfect = p >= 98 && collisions === 0;

  // score: precision-weighted, small time bonus, collision penalty
  const timeBonus = Math.max(0, Math.round((parTime - time) * 6));
  const score = Math.max(
    0,
    Math.round(p * 20 + timeBonus - collisions * 120 + (perfect ? 500 : 0)),
  );

  return { stars, perfect, score };
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function formatTime(seconds) {
  const s = Math.max(0, seconds);
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}
