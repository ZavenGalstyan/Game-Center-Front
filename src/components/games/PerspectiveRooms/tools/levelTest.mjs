/**
 * Headless proof that every room is solvable through the real simulation:
 *   node src/components/games/PerspectiveRooms/tools/levelTest.mjs [ids|a-b] [--trace]
 * For each level: the exit must be locked/unreachable at the start (for gated
 * rooms), then the route bot plays the scripted solution until "complete".
 */
import { createSim } from "../engine/sim.js";
import { LEVELS, getLevel } from "../engine/levels.js";
import { createBot } from "./bot.mjs";
import { ROUTES } from "./routes.mjs";

const args = process.argv.slice(2);
const trace = args.includes("--trace");
let ids = LEVELS.map((l) => l.id);
const sel = args.find((a) => /^\d/.test(a));
if (sel) {
  if (sel.includes("-")) {
    const [a, b] = sel.split("-").map(Number);
    ids = ids.filter((i) => i >= a && i <= b);
  } else ids = sel.split(",").map(Number);
}

let failed = 0;
for (const id of ids) {
  const L = getLevel(id);
  const s = createSim(L);
  const gated = L.exits.some((e) => e.when.length) || L.doors.length;
  if (L.exits.some((e) => e.when.length) && s.exits.some((e) => e.unlocked)) {
    console.log(`✗ ${id} ${L.name}: exit unlocked at start`);
    failed++;
    continue;
  }
  if (L.doors.some((d) => d.when.length) && s.doors.some((d) => d.open > 0)) {
    console.log(`✗ ${id} ${L.name}: a door is open at start`);
    failed++;
    continue;
  }
  const route = ROUTES[id];
  if (!route) {
    console.log(`? ${id} ${L.name}: no route`);
    failed++;
    continue;
  }
  const bot = createBot(route, { log: trace ? (m) => console.log(`   [${id}] ${m}`) : () => {} });
  const dt = 1 / 60;
  let f = 0;
  const t0 = Date.now();
  let lastStep = -1;
  while (f < 60 * 400 && s.state !== "complete" && !bot.state.failed) {
    if (trace && bot.state.i !== lastStep) {
      lastStep = bot.state.i;
      const p = s.player;
      console.log(`   [${id}] t=${s.t.toFixed(1)} step ${bot.state.i} ${JSON.stringify(route[bot.state.i] || "end", (k, v) => (typeof v === "function" ? "fn" : v))} @ ${p.x.toFixed(2)},${p.y.toFixed(2)},${p.z.toFixed(2)}`);
    }
    s.update(dt, bot(s, dt));
    s.events.length = 0;
    f++;
    if (bot.state.done && s.state !== "complete" && f > 60 * 400 - 2) break;
  }
  const ok = s.state === "complete";
  if (!ok) failed++;
  console.log(
    `${ok ? "✓" : "✗"} ${String(id).padStart(2)} ${L.name.padEnd(26)} ${ok ? `${s.t.toFixed(1)}s sim` : bot.state.reason || (bot.state.done ? "route ended before exit" : "timeout")}  grabs ${s.stats.grabs} falls ${s.stats.falls}${gated ? "" : " (open)"}  [${Date.now() - t0} ms]`,
  );
  if (!ok && trace) {
    const p = s.player;
    console.log(`   player ${p.x.toFixed(2)},${p.y.toFixed(2)},${p.z.toFixed(2)} signals ${JSON.stringify(s.signals)}`);
    s.objs.forEach((o) => console.log(`   obj ${o.id} ${o.shape} scale ${o.scale.toFixed(2)} pos ${o.pos.map((v) => v.toFixed(2)).join(",")}`));
  }
}
console.log(failed ? `${failed} level(s) FAILED` : `all ${ids.length} levels solved`);
process.exit(failed ? 1 : 0);
