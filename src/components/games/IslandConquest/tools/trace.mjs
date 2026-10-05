// dev helper: print a match's events (node tools/trace.mjs <level> <botLevel> [enemyLevel])
import { Engine } from "../engine/engine.js";
import { createAI } from "../engine/ai.js";
import { STEP } from "../engine/constants.js";
import { getLevel } from "../data/levels.js";
const [lv = 1, bot = "normal", en] = process.argv.slice(2);
const L = { ...getLevel(+lv) };
if (en) L.ai = { level: en };
const e = new Engine();
e.load(L);
if (bot !== "none") e.ais.push(createAI("player", { level: bot, delay: 0.5 }, () => 0.5));
const own = () => e.islands.map((i) => `${i.id}:${i.owner[0]}${i.troops}`).join(" ");
for (let t = 0; t < 600 / STEP && !e.ended; t++) {
  e.step(STEP);
  for (const x of e.events.splice(0)) {
    if (x.type === "launch") console.log(e.run.time.toFixed(1), "LAUNCH", x.owner, x.from, "->", x.to, x.troops, "|", own());
    else if (x.type === "arrive") console.log(e.run.time.toFixed(1), "ARRIVE", x.kind, x.owner, x.island, x.troops, "|", own());
    else if (x.type === "over") console.log(e.run.time.toFixed(1), "OVER", x.result);
  }
}
