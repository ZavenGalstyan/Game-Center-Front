/**
 * Difficulty report: fires the first bird of each level over the solver's
 * aim grid (no taps) and prints how often one random shot wins outright and
 * the mean share of Mokos it defeats. Used to keep later levels harder.
 *   node src/components/games/FeatherFury/tools/difficulty.mjs [ids…]
 */
import { LEVELS } from "../data/levels.js";
import { play } from "./replay.mjs";

const ids = process.argv.slice(2).map(Number).filter(Boolean);
for (const def of LEVELS.filter((l) => !ids.length || ids.includes(l.id))) {
  let n = 0, wins = 0, kf = 0, best = 0, total = 0;
  for (let a = -6; a <= 75; a += 3) {
    for (const p of [0.5, 0.6, 0.7, 0.8, 0.88, 0.94, 1]) {
      const r = play(def, [{ a, p, tap: -1 }]);
      n++;
      total = r.total;
      if (r.won) wins++;
      kf += r.kills / r.total;
      best = Math.max(best, r.kills);
    }
  }
  console.log(`${String(def.id).padStart(2)} ${def.name.padEnd(22)} one-shot win ${((100 * wins) / n).toFixed(1).padStart(5)}%  mean kills ${((100 * kf) / n).toFixed(0).padStart(3)}%  best single shot ${best}/${total}  birds ${def.birds.length}`);
}
