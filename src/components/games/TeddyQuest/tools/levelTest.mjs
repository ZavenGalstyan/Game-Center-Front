/**
 * Headless proof that every level is well-formed and finishable.
 *
 *   node src/components/games/TeddyQuest/tools/levelTest.mjs [ids|a-b] [--god] [--verbose]
 *
 * Structure checks: no overlapping platforms, every coin / enemy / chest /
 * checkpoint / portal / friend stands on solid ground, coins aren't buried.
 * Play check: the route bot plays the level through the real simulation and
 * must reach the portal (with the friend freed / boss beaten) without a game
 * over. Reports time, coins, chests, damage taken.
 */
import { Game } from "../engine/game.js";
import { getLevel, LEVEL_COUNT } from "../data/levels.js";
import { createBot } from "./bot.mjs";

const args = process.argv.slice(2);
const god = args.includes("--god");
const verbose = args.includes("--verbose");
let ids = [];
for (const a of args.filter((x) => !x.startsWith("--"))) {
  if (a.includes("-")) {
    const [s, e] = a.split("-").map(Number);
    for (let k = s; k <= e; k++) ids.push(k);
  } else ids.push(...a.split(",").map(Number));
}
if (!ids.length) ids = Array.from({ length: LEVEL_COUNT }, (_, k) => k + 1);

const overlap = (a, b, m = 0.02) => a.x0 < b.x1 - m && a.x1 > b.x0 + m && a.z0 < b.z1 - m && a.z1 > b.z0 + m && a.y0 < b.y1 - m && a.y1 > b.y0 + m;
const onTop = (L, x, y, z, r = 0.2) => L.boxes.some((b) => b.kind !== "gate" && Math.abs(b.y1 - y) < 0.06 && x > b.x0 - r && x < b.x1 + r && z > b.z0 - r && z < b.z1 + r);

function structure(L) {
  const errs = [];
  const B = L.boxes;
  for (let i = 0; i < B.length; i++)
    for (let j = i + 1; j < B.length; j++) {
      const a = B[i], b = B[j];
      if (a.m || b.m) continue;
      if (a.look === "wall" && b.look === "wall") continue;
      if (a.kind === "gate" || b.kind === "gate") continue;
      if (overlap(a, b)) errs.push(`boxes ${i}(${a.look || a.kind}) & ${j}(${b.look || b.kind}) overlap`);
    }
  // moving platforms must not sweep through other boxes
  for (const m of B.filter((b) => b.m)) {
    const hx = (m.x1 - m.x0) / 2, hy = (m.y1 - m.y0) / 2, hz = (m.z1 - m.z0) / 2;
    const sweep = { x0: Math.min(m.m.ax, m.m.bx) - hx, x1: Math.max(m.m.ax, m.m.bx) + hx, y0: Math.min(m.m.ay, m.m.by) - hy, y1: Math.max(m.m.ay, m.m.by) + hy, z0: Math.min(m.m.az, m.m.bz) - hz, z1: Math.max(m.m.az, m.m.bz) + hz };
    for (const b of B) if (b !== m && !b.m && overlap(sweep, b, 0.05)) errs.push(`mover sweep hits box (${b.look || b.kind})`);
  }
  const need = (what, list, fn = (o) => onTop(L, o.x, o.y, o.z)) => list.forEach((o, k) => !fn(o) && errs.push(`${what} ${k} not on ground (${o.x},${o.y},${o.z})`));
  need("enemy", L.enemies);
  need("chest", L.chests);
  need("checkpoint", L.checkpoints);
  need("spring", L.springs);
  need("portal", [L.portal]);
  if (L.friend) need("friend", [L.friend]);
  need("honey", L.honey, (o) => onTop(L, o.x, o.y - 0.5, o.z));
  for (const [k, c] of L.coins.entries()) {
    if (B.some((b) => c.x > b.x0 && c.x < b.x1 && c.z > b.z0 && c.z < b.z1 && c.y > b.y0 - 0.1 && c.y < b.y1 + 0.35)) errs.push(`coin ${k} buried (${c.x},${c.y},${c.z})`);
  }
  for (const e of L.enemies) {
    const [x0, x1, z0, z1] = e.bounds;
    if (!(x0 <= x1 && z0 <= z1)) errs.push("enemy bounds empty");
  }
  if (!onTop(L, L.start.x, L.start.y, L.start.z)) errs.push("start not on ground");
  return errs;
}

function play(id) {
  const L = getLevel(id);
  const g = new Game(L, { god });
  const logs = [];
  const bot = createBot(L.route, { log: (s) => logs.push(`t=${g.t.toFixed(1)} ${s}`) });
  const dt = 1 / 60;
  let continues = 0;
  let maxFrames = 60 * 60 * 8;
  let stuckFor = 0;
  for (let f = 0; f < maxFrames; f++) {
    const inp = bot(g);
    g.frame(dt, inp);
    for (const e of g.frameEvents) if (e.type === "hurt" || e.type === "fall") logs.push(`t=${g.t.toFixed(1)} ${e.type} ${e.kind} at step ${bot.index()} (${L.route[bot.index()]?.join(" ")}) pos ${g.player.x.toFixed(1)},${g.player.y.toFixed(1)},${g.player.z.toFixed(1)}`);
    if (g.status === "over") {
      continues++;
      logs.push(`t=${g.t.toFixed(1)} GAME OVER at step ${bot.index()} (${L.route[bot.index()]?.join(" ")})`);
      if (continues > 3) break;
      g.continueFromCheckpoint();
    }
    if (g.status === "complete") break;
    if (bot.stuck) {
      stuckFor++;
      if (stuckFor > 600) {
        logs.push(`stuck at step ${bot.index()} (${JSON.stringify(L.route[bot.index()])}) pos ${g.player.x.toFixed(2)},${g.player.y.toFixed(2)},${g.player.z.toFixed(2)}`);
        break;
      }
    } else stuckFor = 0;
  }
  return { g, logs, continues, bot };
}

let fail = 0;
let tot = { coins: 0, coinTotal: 0, chests: 0, chestTotal: 0, time: 0 };
for (const id of ids) {
  const L = getLevel(id);
  const errs = structure(L);
  const { g, logs, continues, bot } = play(id);
  const ok = g.status === "complete" && errs.length === 0;
  if (!ok) fail++;
  const r = g.result;
  if (r) {
    tot.coins += r.coins;
    tot.coinTotal += r.coinTotal;
    tot.chests += r.chests;
    tot.chestTotal += r.chestTotal;
    tot.time += r.time;
  }
  const line = r
    ? `time ${r.time.toFixed(0).padStart(3)}s coins ${r.coins}/${r.coinTotal} chests ${r.chests}/${r.chestTotal} hurts ${r.hurts} falls ${r.falls} enemies ${r.enemies}/${L.enemies.length}${r.friend !== null ? ` friend ${r.friend}` : ""}${continues ? ` CONTINUES ${continues}` : ""}`
    : `NOT FINISHED (status ${g.status}, step ${bot.index()}/${L.route.length}, t=${g.t.toFixed(0)})`;
  console.log(`${ok ? "ok  " : "FAIL"} L${String(id).padStart(2)} ${L.name.padEnd(24)} ${line}`);
  for (const e of errs) console.log(`       ✗ ${e}`);
  if (!ok || verbose) for (const s of logs.slice(-12)) console.log(`       · ${s}`);
}
console.log(`\n${ids.length - fail}/${ids.length} levels pass · coins ${tot.coins}/${tot.coinTotal} · chests ${tot.chests}/${tot.chestTotal} · bot time ${(tot.time / 60).toFixed(1)} min`);
process.exit(fail ? 1 : 0);
