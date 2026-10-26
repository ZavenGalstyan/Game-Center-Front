import { createFight, stepFight } from "../engine/fight.js";
import { BATTLES } from "../data/campaign.js";
import { fightConfig } from "../data/loadout.js";
import { freshSave, applyResult } from "../progress.js";
import { shopBot } from "./campaignSim.mjs";
import { BOSSES } from "../engine/bosses.js";
if (process.env.DROP) for (const b of Object.values(BOSSES)) b.specials = b.specials.filter((x) => !process.env.DROP.split(",").includes(x.id));
const id = Number(process.argv[2] || 10), level = Number(process.argv[3] || 0.7), n = Number(process.argv[4] || 8);
let s = freshSave();
if (process.env.SAVE) s = JSON.parse((await import("node:fs")).readFileSync(process.env.SAVE, "utf8"));
else {
  for (let i = 1; i < id; i++) s = applyResult(s, i, { won: true, perfect: false, time: 40 }).save;
  s = shopBot(s);
}
let wins = 0;
for (let k = 0; k < n; k++) {
  const cfg = fightConfig(s, BATTLES[id - 1], Number(process.env.SEED0 || 500) + k); cfg.playerAI = { style: "duelist", level };
  if (process.env.NOBOSS) cfg.boss = null;
  if (process.env.ELEVEL) cfg.ai.level = Number(process.env.ELEVEL);
  const F = createFight(cfg);
  const dmgBy = [{}, {}]; const blocks=[0,0];
  while (F.phase !== "over" && F.frame < 60*400) {
    stepFight(F);
    for (const e of F.events) {
      if (e.type === "hit") { const src = e.by.side; const key = e.by.move?.id || "proj"; dmgBy[src][key] = (dmgBy[src][key] || 0) + Math.round(e.dmg); }
      if (e.type === "block") blocks[e.who.side]++;
    }
    F.events.length = 0;
  }
  if (F.winner === F.p1) wins++;
  const top = (o) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => k + ":" + v).join(" ");
  console.log(`seed ${k}: ${F.winner === F.p1 ? "WIN " : "LOSS"} t=${(F.frame/60)|0}s hp ${F.p1.hp|0}/${F.p1.maxHp} vs ${F.p2.hp|0}/${F.p2.maxHp} blocks p1 ${blocks[0]} p2 ${blocks[1]} parries ${F.p1.stats.parries}/${F.p2.stats.parries}\n   p1 dmg: ${top(dmgBy[0])}\n   p2 dmg: ${top(dmgBy[1])}`);
}
console.log("gear", s.eq, s.lv.weapon, "wins", wins, "/", n);
