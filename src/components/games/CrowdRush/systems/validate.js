/**
 * Crowd Rush — level validator (dev / test only, not in the render path).
 *
 * Replays the BEST line through every tuned level using the same crowd model as
 * the tuner, and asserts the crowd that reaches the finish clears the finale
 * with the designed margin. Also reports the WEAK line (always the additive
 * gate) so we can see which levels demand a real decision.
 */

import { applyOp } from "./gateMath.js";
import { LEVELS } from "../data/levels.js";
import { simulateBestLine, obstacleLoss } from "../data/tuning.js";

function weakLine(level) {
  let crowd = level.startCount;
  for (const s of level.sections) {
    if (crowd <= 0) return { crowd: 0, dead: true };
    if (s.type === "gateChoice") {
      const add = s.gates.filter((g) => g.operation === "add");
      const pick = add.length
        ? add.reduce((a, b) => (b.value > a.value ? b : a))
        : s.gates.reduce((a, b) => (applyOp(b.operation, b.value, crowd) < applyOp(a.operation, a.value, crowd) ? b : a));
      crowd = applyOp(pick.operation, pick.value, crowd);
    } else if (s.type === "obstacle") {
      crowd = Math.max(0, Math.round(crowd * (1 - obstacleLoss(s) * 2.4)));
    } else if (s.type === "narrow") {
      crowd = Math.max(0, Math.round(crowd * 0.9));
    } else if (s.type === "enemy") {
      if (crowd > s.count) crowd -= s.count;
      else return { crowd: 0, dead: true };
    } else if (s.type === "pickup") {
      crowd += s.amount;
    }
  }
  const fin = level.finish;
  const need = fin.strength || fin.count || 0;
  if (need && crowd <= need) return { crowd, dead: true };
  return { crowd: crowd - need, dead: false };
}

export function validateAll({ log = false } = {}) {
  const problems = [];
  for (const level of LEVELS) {
    const best = simulateBestLine(level).crowd;
    const fin = level.finish;
    const need = fin.strength || fin.count || 0;

    if (fin.type !== "staircase") {
      if (best <= need) {
        problems.push(`L${level.id}: BEST line fails finale (${need} vs ${best})`);
      } else if (best - need < 5) {
        problems.push(`L${level.id}: BEST line margin only ${best - need}`);
      }
    }
    if (best < 4) problems.push(`L${level.id}: BEST line arrives with ${best}`);

    if (log) {
      const w = weakLine(level);
      console.log(
        `L${String(level.id).padStart(2)} ${level.world.padEnd(14)} ` +
        `start ${String(level.startCount).padStart(3)} | par ${String(level.par).padStart(3)} | ` +
        `finale ${fin.type}${need ? " " + need : ""} | ` +
        `weak: ${w.dead ? "FAIL (must choose well)" : "clears +" + w.crowd}`,
      );
    }
  }
  if (log) {
    console.log("\n" + (problems.length ? problems.join("\n") : "All 50 levels beatable on the best line with margin ✓"));
  }
  return problems;
}

if (process.argv[1]?.endsWith("validate.js")) {
  const p = validateAll({ log: true });
  process.exit(p.length ? 1 : 0);
}
