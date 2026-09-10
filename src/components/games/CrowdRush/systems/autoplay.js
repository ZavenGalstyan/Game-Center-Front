/**
 * Crowd Rush — a headless "good player" that drives the real engine. Used only
 * by the sim test (npm-less: `node systems/simTest.js`) to prove every level is
 * completable through the actual simulation, not just the abstract validator.
 *
 * Strategy each frame: aim for the better gate of the next choice, but if an
 * obstacle slice is close, pick the x in a small scan that avoids the most
 * predicted hits while staying nearest that aim.
 */

import { bestGateIndex } from "./gateMath.js";
import { hitsRunner } from "./obstacleCollision.js";
import { createRun, tick, setDragTarget } from "../game/engine.js";

function nextGateX(run) {
  for (const g of run.gates) {
    if (g.consumed || run.z > g.s.z + 1) continue;
    if (g.s.z - run.z > 46) break;
    const idx = bestGateIndex(g.s.gates, run.count);
    return g.s.gates[idx].x;
  }
  return 0;
}

function inNarrow(run) {
  for (const nr of run.narrows) {
    if (run.z > nr.s.z - 10 && run.z < nr.s.z + nr.s.length) return nr.s.width;
  }
  return null;
}

function dodgeX(run, aim) {
  const narrowW = inNarrow(run);
  if (narrowW != null) aim = 0;
  let best = aim;
  let bestCost = Infinity;
  const lim = narrowW != null ? Math.max(0.4, narrowW - 0.6) : run.trackHalf - 0.6;
  for (let x = -lim; x <= lim; x += 0.3) {
    let hits = 0;
    for (const ob of run.obstacles) {
      const dz = run.z - ob.s.z;
      if (dz < -14 || dz > 4) continue;
      for (let dtp = 0; dtp < 1.1; dtp += 0.08) {
        const futureRz = dz + run.speed * dtp;
        if (Math.abs(futureRz) > 3) continue;
        // sample a few points across the would-be crowd, not just its centre
        for (const off of [-1.1, -0.4, 0, 0.4, 1.1]) {
          if (hitsRunner(ob.s, ob.tLocal + dtp, x + off, futureRz)) hits++;
        }
      }
    }
    const cost = hits * 6 + Math.abs(x - aim) * 1.2 + Math.abs(x) * 0.05;
    if (cost < bestCost) { bestCost = cost; best = x; }
  }
  return best;
}

export function autoPlay(level, { maxSeconds = 60, colorHex = "#3d8bff" } = {}) {
  const run = createRun(level, { colorHex, onEvent: () => {} });
  const dt = 1 / 60;
  let steps = 0;
  const limit = maxSeconds * 60;

  while (!run.result && steps < limit) {
    const aim = nextGateX(run);
    setDragTarget(run, dodgeX(run, aim));
    tick(run, dt);
    steps++;
  }

  return {
    id: level.id,
    finished: !!run.result,
    success: run.result?.success ?? false,
    reason: run.result?.reason ?? "timeout",
    finalCrowd: run.result?.finalCrowd ?? run.count,
    stars: run.result?.stars ?? 0,
    score: run.result?.score ?? 0,
    enemiesDefeated: run.stats.enemiesDefeated,
    seconds: (steps / 60).toFixed(1),
  };
}
