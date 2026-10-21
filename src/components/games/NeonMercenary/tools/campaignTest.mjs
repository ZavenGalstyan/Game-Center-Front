/**
 * Full-campaign bot run (node): a fresh profile plays contracts 1 → 20 through
 * the real simulation, shopping / levelling between contracts and taking the
 * Maglev when a contract is in another district.
 *
 *   node src/components/games/NeonMercenary/tools/campaignTest.mjs [fromId] [toId] [--verbose]
 */
import { Game } from "../engine/game.js";
import { newProfile } from "../engine/profile.js";
import { CONTRACT_BY_ID } from "../data/contracts.js";
import { createBot } from "./bot.mjs";

const args = process.argv.slice(2);
const verbose = args.includes("--verbose");
const nums = args.filter((a) => /^\d+$/.test(a)).map(Number);
const from = nums[0] || 1;
const to = nums[1] || 20;
const DT = 1 / 60;
const MAX_MISSION_S = 60 * 9; // game seconds per contract before giving up

const P = newProfile({ body: "m" });
// skip ahead: mark earlier contracts done (unlocks / flags) when starting mid-campaign
for (let id = 1; id < from; id++) {
  P.story.done.push(id);
  P.story.flags[`c${id}`] = true;
  for (const f of CONTRACT_BY_ID[id].flags || []) P.story.flags[f] = true;
  if (CONTRACT_BY_ID[id].unlock) P.unlocked[CONTRACT_BY_ID[id].unlock] = true;
}
if (from > 7) P.story.flags.razorDown = true;
if (from > 14) P.story.flags.ironjawDown = true;
if (from > 13) P.story.flags.hatchFound = true;
if (from > 1) {
  // a mid-campaign character roughly where a player would be
  const lvl = { 1: 1, 8: 9, 15: 15 }[from] || Math.round(1 + from * 1.05);
  P.level = lvl;
  P.sp = lvl - 1;
  P.credits = 3000 + from * 900;
}
const G = new Game(P, { seed: 11, district: CONTRACT_BY_ID[from].district });
let deaths = 0;
const bot = createBot(G, { onDeath: () => deaths++ });
const results = [];
const t0 = Date.now();
let frames = 0;
for (let id = from; id <= to; id++) {
  const c = CONTRACT_BY_ID[id];
  if (G.districtId !== c.district) {
    if (!G.P.unlocked[c.district]) {
      results.push({ id, title: c.title, ok: false, why: `district ${c.district} locked` });
      break;
    }
    G.loadDistrict(c.district, "arrive");
  }
  bot.prepare();
  const r = G.missions.start(id);
  if (!r.ok) {
    results.push({ id, title: c.title, ok: false, why: r.msg });
    break;
  }
  const d0 = deaths;
  let fails = 0;
  let t = 0;
  let done = false;
  let lastStep = -1;
  let stepT = 0;
  while (t < MAX_MISSION_S) {
    const inp = bot.step();
    G.step(DT, inp);
    frames++;
    t += DT;
    for (const ev of G.drain()) {
      if (ev.type === "missionComplete" && ev.id === id) done = true;
      if (ev.type === "missionFailed") fails++;
      if (verbose && ["missionFailed", "death", "bossDown", "checkpoint"].includes(ev.type)) console.log(`   [${t.toFixed(0)}s] ${ev.type} ${ev.reason || ev.boss || ""}`);
    }
    const A = G.missions.active;
    if (A && A.stepI !== lastStep) {
      if (verbose) console.log(`  c${id} step ${A.stepI} (${A.step.type}) "${A.step.text || ""}" @${t.toFixed(0)}s`);
      lastStep = A.stepI;
      stepT = 0;
    }
    stepT += DT;
    if (done) break;
  }
  const A = G.missions.active;
  results.push({ id, title: c.title, ok: done, time: Math.round(t), deaths: deaths - d0, fails, level: G.P.level, credits: G.P.credits, stuckAt: done ? null : A ? `step ${A.stepI} ${A.step.type} "${A.step.text}"` : "?" });
  console.log(`${done ? "✓" : "✗"} #${id} ${c.title.padEnd(22)} ${String(Math.round(t)).padStart(4)} s  deaths ${deaths - d0}  fails ${fails}  lvl ${G.P.level}  ¢${G.P.credits}${done ? "" : `  STUCK: ${results[results.length - 1].stuckAt}`}`);
  if (!done) break;
  // let things settle
  for (let i = 0; i < 120; i++) {
    G.step(DT, bot.step());
    G.drain();
  }
}
const ok = results.filter((r) => r.ok).length;
console.log(`\n${ok}/${to - from + 1} contracts completed · ${deaths} deaths · level ${G.P.level} · ${(frames / 60 / 60).toFixed(1)} game-min · ${((Date.now() - t0) / 1000).toFixed(0)} s wall · ending: ${G.P.ending || "-"}`);
process.exit(ok === to - from + 1 ? 0 : 1);
