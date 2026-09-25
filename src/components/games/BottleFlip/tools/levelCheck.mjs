/**
 * Bottle Flip — headless level validator.
 *
 *   node src/components/games/BottleFlip/tools/levelCheck.mjs [fromId] [toId]
 *
 * For every level and every hop (platform i → any later platform) it sweeps
 * a grid of throws (angle × power, and launch timing for moving platforms)
 * through the REAL session code and counts landings that make progress.
 * It also proves each bonus star can be collected by a throw that lands.
 *
 * A hop fails the check if its best timing has fewer than MIN_CELLS winning
 * throws — i.e. there is no learnable window. Exit code 1 on any failure.
 */
import { LEVELS } from "../levels/levels.js";
import { simulateThrow, DEG } from "./sim.mjs";

const args = process.argv.slice(2).map(Number);
const from = args[0] || 1;
const to = args[1] || LEVELS.length;
const MIN_CELLS = 6;

function period(level) {
  const ps = level.platforms.filter((p) => p.move).map((p) => p.move.period);
  return ps.length ? Math.max(...ps) : 0;
}

function sweepHop(level, i, localX, t0) {
  const wins = [];
  let perfect = 0;
  for (let a = 16; a <= 164; a += 3) {
    for (let p = 0; p <= 1.0001; p += 0.025) {
      const o = simulateThrow(level, { from: i, localX, t0, angle: a * DEG, power: p });
      if (o.result === "land" && o.platform > i) {
        wins.push({ a, p, to: o.platform, collected: o.collected });
        if (o.perfect) perfect++;
      }
    }
  }
  return { wins, perfect };
}

let bad = 0;
for (const level of LEVELS.slice(from - 1, to)) {
  const per = period(level);
  const phases = per ? [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875].map((f) => f * per) : [0];
  const lines = [];
  const starFound = new Set();
  for (let i = 0; i < level.platforms.length - 1; i++) {
    const p = level.platforms[i];
    const spots = i === 0 ? [level.spawnX ?? p.w * 0.7] : [p.w / 2, Math.max(6, p.w * 0.25), Math.min(p.w - 6, p.w * 0.75)];
    let worst = Infinity;
    let best = 0;
    let perf = 0;
    const perPhase = [];
    for (const lx of spots) {
      let bestPhase = 0;
      for (const t0 of phases) {
        const r = sweepHop(level, i, lx, t0);
        for (const w of r.wins) for (const c of w.collected) starFound.add(c);
        bestPhase = Math.max(bestPhase, r.wins.length);
        perf += r.perfect;
        if (lx === spots[0]) perPhase.push(r.wins.length);
        best = Math.max(best, r.wins.length);
      }
      worst = Math.min(worst, bestPhase);
    }
    const nextOnly = level.platforms.length - 1;
    const ok = worst >= MIN_CELLS;
    if (!ok) bad++;
    lines.push(
      `  hop ${i}→  best ${String(best).padStart(3)}  worst-spot ${String(worst).padStart(3)}${per ? `  phases [${perPhase.join(",")}]` : ""}  perfect ${perf}${ok ? "" : "   <-- NO WINDOW"}`,
    );
    void nextOnly;
  }
  const nStars = level.collectibles.length;
  const missing = [];
  for (let k = 0; k < nStars; k++) if (!starFound.has(k)) missing.push(k);
  if (missing.length) bad++;
  console.log(
    `L${level.id} ${level.name}  [w${level.world}] tol ${level.difficulty.tolerance} wind ${level.wind}${nStars ? `  stars ${nStars - missing.length}/${nStars}` : ""}${missing.length ? `  <-- UNREACHABLE STAR ${missing.join(",")}` : ""}`,
  );
  console.log(lines.join("\n"));
}
console.log(bad ? `\n${bad} problem(s)` : "\nall levels OK");
process.exit(bad ? 1 : 0);
