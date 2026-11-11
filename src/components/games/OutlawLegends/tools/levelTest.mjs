/**
 * Plays every mission with the bot through the real sim:
 *   node src/components/games/OutlawLegends/tools/levelTest.mjs [ids|a-b] [--sharp] [--hard|--easy] [--fresh] [--verbose]
 * A mission passes when the sim reports "complete" within the time limit.
 * Deaths respawn at the last checkpoint (like the game's Retry button).
 * Player stats follow a typical campaign (weapons from earlier missions,
 * upgrades a player could afford by then); --noshop keeps weapons and level
 * but buys nothing; --fresh is a brand-new character.
 */
import { MISSIONS } from "../engine/missions.js";
import { createSim, step, respawn, objectiveMarkers } from "../engine/sim.js";
import { playerStats, WEAPON_UNLOCK } from "../engine/data.js";
import { createBot } from "./bot.mjs";

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith("--")));
let ids = MISSIONS.map((m) => m.id);
const sel = args.find((a) => !a.startsWith("--"));
if (sel) {
  if (/^\d+-\d+$/.test(sel)) {
    const [a, b] = sel.split("-").map(Number);
    ids = ids.filter((i) => i >= a && i <= b);
  } else ids = sel.split(",").map(Number);
}
const difficulty = flags.has("--hard") ? "hard" : flags.has("--easy") ? "easy" : "normal";

function campaignProgress(id) {
  if (flags.has("--fresh")) return { xp: 0, weapons: ["revolver"], upgrades: {}, abilities: {} };
  const weapons = Object.entries(WEAPON_UNLOCK).filter(([, m]) => m < id).map(([w]) => w);
  if (flags.has("--noshop")) return { xp: 220 * (id - 1) * (1 + id * 0.12), weapons, upgrades: {}, abilities: {} };
  const lv = Math.min(3, Math.floor((id - 1) / 5));
  const up = {};
  for (const w of weapons) up[w] = { dmg: Math.min(lv, 2), acc: Math.min(lv, 2), rel: Math.min(lv, 1) };
  up.char = { health: Math.min(5, Math.floor(id / 4)), melee: Math.min(4, Math.floor(id / 5)), stamina: Math.min(3, Math.floor(id / 7)) };
  return { xp: 220 * (id - 1) * (1 + id * 0.12), weapons, upgrades: up, abilities: { deadEye: id > 5, counter: id > 7 } };
}

const SEED = Number((args.find((a) => a.startsWith("--seed=")) || "--seed=7").slice(7));
let fails = 0;
const t0 = Date.now();
for (const id of ids) {
  const stats = playerStats(campaignProgress(id));
  const S = createSim(id, { stats, difficulty, seed: id * 31 + SEED });
  const bot = createBot({ skill: flags.has("--sharp") ? "sharp" : "human", seed: id });
  const dt = 1 / 60;
  const LIMIT = 60 * 60 * 12; // 12 sim minutes
  let f = 0, deaths = 0, lastStep = -1;
  const log = [];
  while (f < LIMIT && S.status !== "complete") {
    if (S.status === "dead" || S.status === "failed") {
      deaths++;
      log.push(`    ${S.status} at step ${S.stepI} (${S.step?.text}) t=${S.t.toFixed(0)}s`);
      if (deaths > 12) break;
      respawn(S);
    }
    const inp = bot(S, dt);
    step(S, dt, inp);
    if (flags.has("--trace") && f % 600 === 0)
      console.log(
        `    ${S.t.toFixed(0)}s st${S.stepI} P(${S.P.x.toFixed(1)},${S.P.z.toFixed(1)}) hp${S.P.hp | 0} ${S.P.w} ${S.P.ammo[S.P.w].mag}/${S.P.ammo[S.P.w].res} in(${inp.mx.toFixed(1)},${inp.mz.toFixed(1)})${inp.fire ? "F" : ""} | ${objectiveMarkers(S).slice(0, 3).map((m) => m.map((v) => v.toFixed(0)).join(",")).join(" ")} | ${S.enemies.filter((e) => e.alive).slice(0, 5).map((e) => `${e.type}@${e.x.toFixed(0)},${e.z.toFixed(0)}${e.alert ? "!" : ""}${e.crouch ? "c" : ""}${e.cover ? "C" : ""}`).join(" ")}`,
      );
    if (S.stepI !== lastStep) {
      lastStep = S.stepI;
      if (flags.has("--verbose")) log.push(`    step ${S.stepI}: ${S.step?.text} @${S.t.toFixed(1)}s`);
    }
    f++;
  }
  const ok = S.status === "complete";
  if (!ok) fails++;
  const c = S.counters;
  console.log(`${ok ? "✓" : "✗"} M${String(id).padStart(2)} ${S.M.name.padEnd(26)} ${ok ? "complete" : `stuck at step ${S.stepI}: ${S.step?.text}`} · ${S.t.toFixed(0)}s · deaths ${deaths} · kills ${c.kills} · acc ${c.shots ? Math.round((c.hits / c.shots) * 100) : 0}% · xp ${S.earn.xp} · $${S.earn.money}`);
  if (!ok || flags.has("--verbose")) for (const l of log.slice(-12)) console.log(l);
}
console.log(`\n${ids.length - fails}/${ids.length} missions completed (${difficulty}, ${((Date.now() - t0) / 1000).toFixed(1)}s)`);
process.exit(fails ? 1 : 0);
