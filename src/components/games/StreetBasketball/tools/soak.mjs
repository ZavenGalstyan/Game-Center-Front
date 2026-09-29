/** Soak test: many randomized AI-vs-AI matches; reports stalls and outliers. node tools/soak.mjs [n] */
import { createGame, setController, step, drainEvents, enableAsserts } from "../engine/match.js";
import { createAI, wrapAI } from "../engine/ai.js";
import { createRng } from "../engine/rng.js";
import { PHYS_DT } from "../engine/constants.js";
import { OPPONENTS } from "../data/opponents.js";
enableAsserts(true);
const N = +process.argv[2] || 150;
const rng = createRng(4242);
let fails = 0;
let totalMin = 0;
let maxMin = 0;
const agg = { blocks: 0, steals: 0, dunks: 0, stuck: 0, oob: 0, fga: 0, fgm: 0 };
for (let m = 0; m < N; m++) {
  const A = OPPONENTS[Math.floor(rng.next() * 25)];
  const B = OPPONENTS[Math.floor(rng.next() * 25)];
  const seed = 5000 + m;
  const g = createGame({ mode: "match", seed, target: 11, player: { ratings: A.ratings, look: {} }, opponent: { ratings: B.ratings, look: {}, dunks: ["one", "two"] }, firstOffense: m % 2 ? "o" : "p" });
  setController(g, "p", wrapAI(createAI(A.ai, createRng(seed + 1))));
  setController(g, "o", wrapAI(createAI(B.ai, createRng(seed + 2))));
  let ends = 0;
  let i = 0;
  for (; i < 240 * 60 * 15 && !g.over; i++) {
    step(g, PHYS_DT);
    for (const e of drainEvents(g)) {
      if (e.type === "matchEnd") ends++;
      if (e.type === "stuckBall") agg.stuck++;
      if (e.type === "outOfBounds") agg.oob++;
    }
  }
  const min = g.time / 60;
  totalMin += min;
  maxMin = Math.max(maxMin, min);
  for (const k of ["blocks", "steals", "dunks", "fga", "fgm"]) agg[k] += g.stats.p[k] + g.stats.o[k];
  if (!g.over || ends !== 1) {
    fails++;
    console.log(`FAIL ${A.id} v ${B.id} seed ${seed} ${g.score.p}-${g.score.o} t=${g.time.toFixed(0)} bmode=${g.bmode} ball=${g.ball.p.x.toFixed(2)},${g.ball.p.y.toFixed(2)},${g.ball.p.z.toFixed(2)}`);
  }
}
console.log(`SOAK: ${N} matches, ${fails} failures, avg ${(totalMin / N).toFixed(1)} min, max ${maxMin.toFixed(1)} min`);
console.log(`  per match: FG ${(agg.fgm / N).toFixed(1)}/${(agg.fga / N).toFixed(1)} (${((agg.fgm / agg.fga) * 100).toFixed(0)}%), blocks ${(agg.blocks / N).toFixed(1)}, steals ${(agg.steals / N).toFixed(1)}, dunks ${(agg.dunks / N).toFixed(1)}, OOB ${(agg.oob / N).toFixed(1)}, stuck balls ${agg.stuck}`);
