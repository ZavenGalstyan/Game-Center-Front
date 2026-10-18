/**
 * Vice Streets 3D — play one story mission / activity headlessly with the bot.
 *   node tools/runMission.mjs 3          (mission 3)
 *   node tools/runMission.mjs taxi       (an activity, started in free roam)
 * Prints the outcome, time and the stage it ended on. Exported `playMission`
 * / `playActivity` are reused by simTest.mjs.
 */
import { Sim, STEP, missionSpawn } from "../engine/sim.js";
import { freshProgress, addCar, xpForLevel } from "../engine/progress.js";
import { MISSIONS, missionById } from "../data/missions.js";
import { getCity } from "../engine/city.js";
import { createBot } from "./bot.mjs";

/** a save that satisfies a mission's requirements (everything before it done) */
export function progFor(id) {
  const p = freshProgress();
  for (const m of MISSIONS) if (m.id < id) p.completed.push(m.id);
  if (id > 2) addCar(p, "compact");
  // by mid-game a player has earned enough for a better, tuned car
  if (id >= 11) {
    p.garage.up.capacity = 1;
    const c = addCar(p, id >= 16 ? "muscle" : "sedan");
    Object.assign(c.up, id >= 16 ? { engine: 2, accel: 2, armor: 2, handling: 2 } : { engine: 1, armor: 1 });
    p.garage.active = c.gid;
  }
  p.rep = Math.max(...MISSIONS.filter((m) => m.id <= id).map((m) => m.req.rep || 0));
  let xp = 0;
  const lvl = Math.max(...MISSIONS.filter((m) => m.id <= id).map((m) => m.req.level || 1));
  for (let L = 1; L < lvl; L++) xp += xpForLevel(L);
  p.xp = xp;
  if (id > 9) p.districts.push("docks");
  if (id > 13) p.districts.push("hills");
  p.money = 5000;
  return p;
}

export function playMission(id, { seed = 1, maxT = 900, log = false, prog } = {}) {
  const def = missionById(id);
  const P = prog || progFor(id);
  const sim = new Sim({ prog: P, seed, spawn: missionSpawn(getCity(), def), clock: 10 });
  sim.startMission(def);
  const bot = createBot();
  let lastIdx = -1;
  const t0 = performance.now();
  while (!sim.run.result && sim.t < maxT) {
    if (sim.ending && sim.ending.t > 2) break;
    sim.step(STEP, bot(sim));
    if (log && sim.run.idx !== lastIdx) {
      lastIdx = sim.run.idx;
      console.log(`  t=${sim.t.toFixed(1)} stage ${sim.run.idx} ${sim.run.stage?.type} ${sim.run.stage?.text || ""}`);
    }
  }
  const r = sim.run.result || { win: false, reason: sim.ending ? sim.ending.kind : "timeout (bot)" };
  return { id, win: r.win, reason: r.reason, t: sim.t, stage: sim.run.idx, type: sim.run.stage?.type, ms: performance.now() - t0, sim };
}

export function playActivity(id, { seed = 1, maxT = 700, log = false } = {}) {
  const P = progFor(10);
  const sim = new Sim({ prog: P, seed, spawn: { x: 0, z: 0, h: 0 }, clock: 10 });
  const place = sim.city.places[{ taxi: "taxiDepot", delivery: "postDepot", race: "raceFlag", parking: "parkingLot", trial: "trialFlag" }[id]];
  sim.player.x = place.x;
  sim.player.z = place.z + 2;
  sim.startActivity(id);
  const bot = createBot();
  let lastIdx = -1;
  while (!sim.run.result && sim.t < maxT) {
    if (sim.ending && sim.ending.t > 2) break;
    sim.step(STEP, bot(sim));
    if (log && sim.run.idx !== lastIdx) {
      lastIdx = sim.run.idx;
      console.log(`  t=${sim.t.toFixed(1)} stage ${sim.run.idx} ${sim.run.stage?.type} ${sim.run.stage?.text || ""}`);
    }
  }
  const r = sim.run.result || { win: false, reason: sim.ending ? sim.ending.kind : "timeout (bot)" };
  return { id, win: r.win, reason: r.reason, t: sim.t, earned: sim.run.earned, stage: sim.run.idx, type: sim.run.stage?.type, sim };
}

const arg = process.argv[2];
if (arg && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/").split("/").pop())) {
  const seed = +(process.argv[3] || 1);
  const r = /^\d+$/.test(arg) ? playMission(+arg, { log: true, seed }) : playActivity(arg, { log: true, seed });
  const s = r.sim;
  console.log(`${r.id}: ${r.win ? "WIN" : "FAIL"} ${r.reason || ""} t=${r.t.toFixed(1)} stage=${r.stage} (${r.type}) wanted=${s.police.wanted} hp=${s.player.hp.toFixed(0)} pos=${s.player.x.toFixed(1)},${s.player.z.toFixed(1)} mode=${s.player.mode}${r.earned != null ? ` earned=${r.earned}` : ""}`);
}
