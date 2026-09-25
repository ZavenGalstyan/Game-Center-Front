/**
 * Bottle Flip — physics tuning table (authoring only).
 *   node tools/reach.mjs [targetWidth]
 * Winning-throw counts for gap (rows) × height change (columns): the curve
 * the level designs were built against.
 */
import { finalize } from "../levels/levels.js";
import { simulateThrow, DEG } from "./sim.mjs";
const W = Number(process.argv[2] || 50);
const dys = [-40, -20, 0, 20, 40, 70];
const dxs = [40, 80, 120, 160, 200, 240, 280];
console.log("gap\\dy " + dys.join("\t"));
for (const dx of dxs) {
  const row = [];
  for (const dy of dys) {
    const L = finalize({ id: 1, platforms: [{ kind: "cabinet", x: 0, w: 60, top: 80 }, { kind: "cabinet", x: 60 + dx, w: W, top: 80 + dy }], spawnX: 45 });
    let n = 0;
    for (let a = 20; a <= 90; a += 2) for (let p = 0; p <= 1.0001; p += 0.025) {
      const o = simulateThrow(L, { from: 0, localX: 45, angle: a * DEG, power: p });
      if (o.result === "land" && o.platform === 1) n++;
    }
    row.push(n);
  }
  console.log(dx + "\t" + row.join("\t"));
}
