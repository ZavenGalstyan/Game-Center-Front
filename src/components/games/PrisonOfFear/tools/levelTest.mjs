/**
 * Plays levels with the test bot through the sim.
 *   node src/components/games/PrisonOfFear/tools/levelTest.mjs [ids…] [--human] [--hard|--easy] [--seed=N] [--trace]
 */
import { LEVELS } from "../engine/levels.js";
import { createSim, step, objectiveInfo, levelReport } from "../engine/sim.js";
import { createBot } from "./bot.mjs";

const args = process.argv.slice(2);
const ids = args.filter((a) => /^\d+$/.test(a)).map(Number);
const human = args.includes("--human");
const difficulty = args.includes("--hard") ? "hard" : args.includes("--easy") ? "easy" : "normal";
const seed = Number((args.find((a) => a.startsWith("--seed=")) || "--seed=1").slice(7));
const trace = args.includes("--trace");
let fails = 0;
for (const L of LEVELS) {
  if (ids.length && !ids.includes(L.id)) continue;
  let res = null, deaths = 0;
  for (let attempt = 0; attempt < 3 && !res; attempt++) {
    const S = createSim(L.id, { difficulty, seed: seed + attempt * 101 });
    const bot = createBot({ human, seed: seed + attempt });
    const dt = 1 / 60;
    let lastStep = -1;
    for (let f = 0; f < 60 * 60 * 6; f++) {
      step(S, dt, bot(S, dt));
      if (trace && S.step !== lastStep) {
        lastStep = S.step;
        console.log(`  t=${S.t.toFixed(1)} step ${S.step}: ${objectiveInfo(S)?.text || "-"} hp=${Math.round(S.P.hp)}`);
      }
      if (S.status === "complete") {
        res = levelReport(S);
        break;
      }
      if (S.status === "dead") {
        deaths++;
        if (trace) console.log(`  died at t=${S.t.toFixed(1)} step ${S.step} (${objectiveInfo(S)?.text})`);
        break;
      }
    }
    if (!res && S.status === "play") {
      console.log(`  timeout L${L.id} at step ${S.step} "${objectiveInfo(S)?.text}" pos c${Math.floor(S.P.x / 2)} r${Math.floor(S.P.z / 2)} alive=${S.E.filter((e) => e.alive).map((e) => `${e.type[0]}@c${Math.floor(e.x / 2)}r${Math.floor(e.z / 2)}:${e.state}`).join(" ")}`);
      break;
    }
  }
  if (!res) fails++;
  console.log(res ? `L${L.id} ${L.name}: OK in ${res.time.toFixed(0)}s, kills ${res.kills}, acc ${res.accuracy}%, dmg taken ${res.dmgTaken}, hp left ${res.hp}, deaths ${deaths}` : `L${L.id} ${L.name}: FAILED (deaths ${deaths})`);
}
console.log(fails ? `${fails} level(s) failed` : "all levels completed");
process.exit(fails ? 1 : 0);
