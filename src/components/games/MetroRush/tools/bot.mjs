/**
 * Metro Rush — route-following bot. For each chunk it asks the fairness
 * validator for a route from the lane the runner is actually in (at the
 * runner's actual speed) and presses the route's inputs at their spots.
 * Jumps and slides are timed to put the obstacle mid-window, the way a
 * player aims them. If the validator is sound w.r.t. the real physics, the
 * bot never crashes.
 *
 *   const bot = createBot({ late });  each step: actions = bot(run)
 *   late: metres of extra input delay (robustness tests)
 */
import { CELL } from "../engine/config.js";
import { validate } from "../engine/validator.js";

function centre(steps, res) {
  const { raster: R, spans: sp } = res;
  for (const s of steps) {
    if (s.act !== "jump" && s.act !== "slide") continue;
    const flags = s.act === "jump" ? R.jump[s.lane] : R.slide[s.lane];
    const [lo, hi, span] = s.act === "jump" ? [sp.w0, sp.w1, sp.J] : [sp.s0, sp.S, sp.S];
    let first = -1;
    let last = -1;
    for (let k = 1; k <= span; k++) {
      if (!flags[s.i + k]) continue;
      if (first < 0) first = k;
      last = k;
    }
    if (first < 0) continue;
    // shift the start earlier so the obstacle sits mid-window, as long as
    // the cells we now leave from are plain running track
    const want = Math.floor((lo + hi) / 2) - Math.floor((first + last) / 2);
    let shift = 0;
    while (shift < want) {
      const c = s.i - shift - 1;
      if (c < 0 || R.block[s.lane][c] || R.jump[s.lane][c] || R.slide[s.lane][c] || R.ramp[s.lane][c]) break;
      if (last + shift + 1 > hi - 1) break;
      shift++;
    }
    s.z -= shift * CELL;
  }
}

export function createBot({ late = 0 } = {}) {
  let chunk = null;
  let steps = [];
  let k = 0;
  return function bot(run) {
    const out = [];
    const z = run.dist;
    const ch = run.chunks.find((c) => z >= c.z0 && z < c.z0 + c.len);
    if (ch && ch !== chunk) {
      chunk = ch;
      k = 0;
      steps = [];
      if (ch.items.length && run.p.ground) {
        const lane = run.p.tlane;
        const v = run.speed / (run.power.boost > 0 ? 1.75 : 1);
        // validate the remainder from where we are (try a couple of grid alignments)
        for (const extra of [0, CELL / 2, CELL / 4]) {
          const off = z - ch.z0 + extra;
          const items = ch.items.map((it) => ({ ...it, z0: it.z0 - off, z1: it.z1 - off }));
          const res = validate(items, ch.len - off, v);
          const plan = res.plan(lane);
          if (!plan) continue;
          const acts = plan.filter((s) => s.act !== "run" && s.act !== "rampUp" && s.act !== "fall").map((s) => ({ ...s }));
          centre(acts, res);
          steps = acts.map((s) => ({ ...s, z: s.z + off }));
          break;
        }
        chunk.botPlan = steps.length > 0 || ch.items.length === 0;
      }
    }
    while (chunk && k < steps.length && z >= chunk.z0 + steps[k].z + late) {
      const a = steps[k++].act;
      out.push(a === "jump" ? "up" : a === "slide" ? "down" : a === "left" || a === "topLeft" ? "left" : "right");
    }
    return out;
  };
}
