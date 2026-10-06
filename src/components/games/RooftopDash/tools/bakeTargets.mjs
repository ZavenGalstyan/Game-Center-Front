/**
 * Rooftop Dash — bakes each level's TARGET time (a mastery goal shown on the
 * results / level select; never needed to progress) from the route bot's
 * SAFE-route time: a clean run with no shortcuts beats it, a run with a fall
 * or two usually doesn't.
 *
 *   node src/components/games/RooftopDash/tools/bakeTargets.mjs   → rewrites data/levels/targets.js
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { LEVELS } from "../data/levels/index.js";
import { playLevel } from "./levelBot.mjs";

const out = {};
for (const L of LEVELS) {
  const r = playLevel(L, "safe");
  if (!r.ok) {
    console.error(`L${L.id} did not finish — target not baked`);
    continue;
  }
  // +30% and a little slack, rounded up to whole seconds
  out[L.id] = Math.ceil(r.time * 1.3 + 2);
  console.log(`L${L.id} ${L.name}: bot ${r.time.toFixed(1)}s → target ${out[L.id]}s`);
}
const file = fileURLToPath(new URL("../data/levels/targets.js", import.meta.url));
writeFileSync(file, `/** Baked by tools/bakeTargets.mjs — do not hand-edit. */\nexport const TARGETS = ${JSON.stringify(out, null, 0).replace(/,/g, ", ")};\n`);
console.log("wrote", file);
