/** Jump Ball — print the solver's route for one level hop by hop (debug aid).
 *   node tools/route.mjs <levelId> [ctrl] [stars]  */
import { getLevel } from "../data/levels.js";
import { solve } from "../engine/bot.js";
import { Sim } from "../engine/sim.js";
const L = getLevel(+process.argv[2]);
const ctrl = +(process.argv[3] || 1);
const r = solve(L, { ctrl, needStars: process.argv[4] === "stars", maxNodes: 14000 });
if (!r.ok) { console.log("no route:", r.reason, r.nodes); process.exit(1); }
const sim = new Sim(L, { ctrl });
let last = 0;
for (const d of r.inputs) {
  sim.setInput(d); sim.step();
  for (const e of sim.events) if (e.type === "land" || e.type === "finish" || e.type === "star")
    { console.log(`${sim.t.toFixed(2).padStart(6)}s  ${e.type.padEnd(6)} ${e.platform || "star" + e.id}  (+${(sim.t - last).toFixed(2)}s)`); if (e.type !== "star") last = sim.t; }
  sim.events.length = 0;
}
