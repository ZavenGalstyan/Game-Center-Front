// dev helper (run once after editing maps): for every level find the smallest
// handicap k (player islands +3k troops, enemy opening delay +0.8k s) at which
// the expert bot wins ≥4/5 seeds, write it INTO data/levels.js, and set the
// star times from the measured winning times:
//   3★ = 1.25 × average win time, 2★ = max(1.6 × 3★, 1.3 × slowest win)
import fs from "fs";
import { LEVELS } from "../data/levels.js";
import { play } from "./balance.mjs";
const file = new URL("../data/levels.js", import.meta.url);
let src = fs.readFileSync(file, "utf8");
const up5 = (v) => Math.ceil(v / 5) * 5;
const variant = (L, k) => {
  const islands = L.islands.map((i) => (i.owner === "player" ? { ...i, troops: i.troops + 3 * k } : i));
  const bump = (a) => ({ ...a, delay: +((a.delay ?? 2) + k * 0.8).toFixed(1) });
  const ai = L.ai.red || L.ai.purple ? Object.fromEntries(Object.entries(L.ai).map(([f, a]) => [f, bump(a)])) : bump(L.ai);
  return { ...L, islands, ai };
};
for (const L of LEVELS) {
  let k = 0;
  let wins = [];
  for (; k <= 10; k++) {
    wins = [1, 2, 3, 4, 5].map((s) => play(variant(L, k), "expert", s)).filter((r) => r.result === "won");
    if (wins.length >= 4) break;
  }
  if (wins.length < 4) throw new Error(`L${L.id} not winnable`);
  const avg = wins.reduce((a, r) => a + r.time, 0) / wins.length;
  const max = Math.max(...wins.map((r) => r.time));
  const three = Math.max(30, up5(avg * 1.25));
  const two = Math.max(up5(three * 1.6), up5(max * 1.3));
  // rewrite this level's block
  const start = src.indexOf(`    id: ${L.id},\n`);
  const end = src.indexOf("\n  },", start);
  let block = src.slice(start, end);
  if (k > 0) {
    const V = variant(L, k);
    for (const i of V.islands.filter((x) => x.owner === "player")) {
      const re = new RegExp(String.raw`I\("${i.id}", (-?[\d.]+), (-?[\d.]+), "${i.type}", "P", \d+\)`);
      block = block.replace(re, `I("${i.id}", $1, $2, "${i.type}", "P", ${i.troops})`);
    }
    block = block.replace(/delay: ([\d.]+)/g, (_, d) => `delay: ${+(+d + k * 0.8).toFixed(1)}`);
  }
  block = block.replace(/stars: \[[^\]]*\]/, `stars: [${two}, ${three}]`);
  src = src.slice(0, start) + block + src.slice(end);
  console.log(`L${L.id} k=${k} wins=${wins.length}/5 avg=${Math.round(avg)} max=${Math.round(max)} → stars ${two}/${three}`);
}
fs.writeFileSync(file, src);
