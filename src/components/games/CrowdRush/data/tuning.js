/**
 * Crowd Rush — difficulty tuning pass.
 *
 * The level files author the *shape* of a level: where the gate choices are,
 * which obstacles appear and in what order, how many enemy walls there are and
 * where the finale sits. This pass sets the *numbers* — enemy counts and finale
 * strength — from a difficulty curve, measured against the crowd the best line
 * actually produces at that point in that level.
 *
 * That is what guarantees the Fairness Rule: every level is beatable on the best
 * line and clears its finale with a healthy margin, and the difficulty ramps
 * smoothly 1 -> 50, without a human re-solving 50 arithmetic chains by hand
 * every time a gate value changes.
 */

import { applyOp } from "../systems/gateMath.js";
import { WORLDS } from "./worlds.js";

/** crowd fraction a fresh obstacle removes on a clean line (shared with validator) */
export function obstacleLoss(section) {
  const twin = section.twin ? 1.6 : 1;
  const heavy = section.heavy ? 1.35 : 1;
  return Math.min(0.34, 0.055 * twin * heavy);
}

export function bestGate(gates, crowd) {
  let idx = 0;
  let best = -Infinity;
  gates.forEach((g, i) => {
    const r = applyOp(g.operation, g.value, crowd);
    if (r > best) {
      best = r;
      idx = i;
    }
  });
  return applyOp(gates[idx].operation, gates[idx].value, crowd);
}

/** difficulty fractions for a level, from its world + position in that world */
export function curve(levelId) {
  const w = WORLDS.find((x) => levelId >= x.range[0] && levelId <= x.range[1]) || WORLDS[0];
  const t = (levelId - w.range[0]) / 9; // 0..1 across the world
  const base = [0.2, 0.27, 0.32, 0.36, 0.4][w.index];
  const span = [0.1, 0.11, 0.11, 0.12, 0.13][w.index];
  const enemy = base + t * span;
  return {
    enemy,
    movingEnemy: enemy + 0.05,
    finalFoe: Math.min(0.8, enemy + 0.14),
    boss: Math.min(0.82, enemy + 0.2),
    fortress: Math.min(0.8, enemy + 0.16),
  };
}

/**
 * Walk the best line through a level's sections. `enemyCounts` may be supplied
 * (already tuned) or left null to have this compute them from the curve — the
 * tuner uses the second form, the validator the first.
 */
export function simulateBestLine(level, { computeEnemies = false } = {}) {
  const f = curve(level.id);
  let crowd = level.startCount;
  const enemyCounts = [];
  let enemiesDefeated = 0;

  for (const s of level.sections) {
    if (crowd <= 0) crowd = 1;
    if (s.type === "gateChoice") {
      crowd = bestGate(s.gates, crowd);
    } else if (s.type === "obstacle") {
      crowd = Math.max(1, Math.round(crowd * (1 - obstacleLoss(s))));
    } else if (s.type === "narrow") {
      crowd = Math.max(1, Math.round(crowd * 0.96));
    } else if (s.type === "enemy") {
      const count = computeEnemies
        ? Math.max(3, Math.round(crowd * (s.moving ? f.movingEnemy : f.enemy)))
        : s.count;
      enemyCounts.push(count);
      if (crowd > count) {
        crowd -= count;
        enemiesDefeated += 1;
      } else {
        crowd = 1; // the tuner never lets this happen; guard anyway
      }
    } else if (s.type === "pickup") {
      crowd += s.amount;
    }
  }
  return { crowd, enemyCounts, enemiesDefeated };
}

/**
 * Returns a NEW level with tuned enemy counts + finish, plus:
 *   par        — best-line crowd at the finish line (3-star reference)
 *   minClear   — smallest crowd that still clears the finale (1-star floor)
 */
export function tuneLevel(level) {
  const f = curve(level.id);
  const sim = simulateBestLine(level, { computeEnemies: true });

  let ei = 0;
  const sections = level.sections.map((s) => {
    if (s.type !== "enemy") return { ...s };
    return { ...s, count: sim.enemyCounts[ei++] };
  });

  const par = sim.crowd; // crowd at the finish line on the best line
  // finale must leave at least max(6, 16% of par) runners standing
  const margin = Math.max(6, Math.round(par * 0.16));
  const cap = Math.max(1, par - margin);
  const need = (frac) => Math.max(4, Math.min(Math.round(par * frac), cap));

  const finish = { ...level.finish };
  if (finish.type === "boss") finish.strength = need(f.boss);
  else if (finish.type === "enemy") finish.count = need(f.finalFoe);
  else if (finish.type === "fortress") finish.strength = need(f.fortress);

  const req =
    finish.type === "boss" ? finish.strength :
    finish.type === "enemy" ? finish.count :
    finish.type === "fortress" ? finish.strength : 0;

  return { ...level, sections, finish, par, minClear: req + 1 };
}
