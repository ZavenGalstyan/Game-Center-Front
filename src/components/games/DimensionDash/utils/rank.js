/**
 * Dimension Dash — end-of-level ranking (S / A / B / C) and bonus points.
 *
 * Each factor is normalised to 0‥1, then weighted:
 *   time     1 at/under par, falling to 0 at 2× par
 *   rings    collected / 60 % of the level's rings
 *   enemies  defeated / 70 % of the robots
 *   secrets  red star rings found / 3
 *   no-hit   bonus for a clean run; each hit / death subtracts
 * Boss levels weigh time and a clean fight more heavily.
 */
export const RANK_ORDER = ["C", "B", "A", "S"];
export const rankValue = (r) => RANK_ORDER.indexOf(r);

export function computeRank(s) {
  const clamp = (v) => Math.max(0, Math.min(1, v));
  const time = clamp(1 - (s.time - s.par) / s.par);
  const rings = clamp(s.ringsCollected / Math.max(1, s.ringTotal * 0.6));
  const enemies = s.enemyTotal ? clamp(s.enemies / Math.max(1, s.enemyTotal * 0.7)) : 1;
  const secrets = s.redStarTotal ? s.redStars / s.redStarTotal : 1;
  const clean = s.hits === 0 && s.deaths === 0 ? 1 : 0;
  const penalty = s.hits * 0.06 + s.deaths * 0.12;
  let total;
  if (s.boss) total = 0.45 * time + 0.15 * rings + 0.1 * secrets + 0.3 * clean - penalty * 0.8 + 0.05;
  else total = 0.36 * time + 0.2 * rings + 0.14 * enemies + 0.18 * secrets + 0.12 * clean - penalty;
  total = Math.max(0, Math.min(1, total));
  const rank = total >= 0.8 ? "S" : total >= 0.62 ? "A" : total >= 0.42 ? "B" : "C";
  const timeBonus = Math.round((time * 5000) / 100) * 100;
  const ringBonus = s.rings * 100;
  const secretBonus = s.redStars * 1000;
  const cleanBonus = clean ? 2000 : 0;
  const final = s.score + timeBonus + ringBonus + cleanBonus;
  return {
    rank,
    total,
    parts: { time, rings, enemies, secrets, clean },
    bonus: { time: timeBonus, rings: ringBonus, secrets: secretBonus, clean: cleanBonus },
    score: final,
  };
}
