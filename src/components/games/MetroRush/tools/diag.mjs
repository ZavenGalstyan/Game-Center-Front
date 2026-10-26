// node tools/diag.mjs <seed> [power] — replays a bot run and dumps the crash surroundings
import { createRun, stepRun } from "../engine/run.js";
import { createBot } from "./bot.mjs";
const seed = +process.argv[2], power = process.argv[3] === "power";
const run = createRun({ seed, noPower: !power });
const bot = createBot();
const log = [];
while (!run.over && run.dist < 30000) {
  const a = bot(run);
  if (a.length) log.push(`${run.dist.toFixed(1)} lane=${run.p.tlane} ${a.join(",")} v=${run.speed.toFixed(1)}`);
  for (const e of run.events) if (e.type !== "coin") log.push(`${run.dist.toFixed(1)} ev ${e.type} ${e.kind || ""}`);
  run.events.length = 0;
  stepRun(run, 1 / 120, a);
}
console.log(JSON.stringify(run.crash), "t", run.t.toFixed(1), "v", run.speed.toFixed(2), "p", JSON.stringify(run.p));
const ch = run.chunks.find((c) => run.dist >= c.z0 && run.dist < c.z0 + c.len);
console.log("chunk z0", ch.z0.toFixed(1), "len", ch.len.toFixed(1), "v", ch.v.toFixed(1), "botPlan", ch.botPlan, "boost", ch.boost);
for (const it of ch.items) console.log("  ", it.kind, "lane", it.lane, "z", (it.z0 + ch.z0).toFixed(1), (it.z1 + ch.z0).toFixed(1), it.ramp ? "ramp" : "", it.moving ? "moving u=" + it.u.toFixed(1) : "");
console.log(log.slice(-14).join("\n"));
