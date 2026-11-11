/**
 * Portal Shift — proves every chamber solvable: plays each level's scripted
 * route (routes.mjs) through the real simulation with the route bot, plus
 * structural checks (spawn/exit/devices sit in sensible cells).
 *
 *   node src/components/games/PortalShift/tools/levelTest.mjs [ids|a-b] [--trace]
 */
import { createSim } from "../engine/sim.js";
import { getLevel, LEVELS } from "../engine/levels.js";
import { EMPTY, GOO, isSolidValue } from "../engine/constants.js";
import { ROUTES, ANTI } from "./routes.mjs";
import { runRoute } from "./bot.mjs";

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

let fails = 0;
function check(cond, msg) {
  if (!cond) {
    fails++;
    console.log(`   ✗ ${msg}`);
  }
}

for (const id of ids) {
  const L = getLevel(id);
  const at = (c) => L.grid[c[0] + L.nx * (c[1] + L.ny * c[2])];
  // structure
  const sp = L.spawn.pos.map((v) => Math.floor(v / 2));
  check(at(sp) === EMPTY && isSolidValue(at([sp[0], sp[1] - 1, sp[2]])), `L${id}: spawn must stand on solid floor`);
  check(at(L.exit.goal) === EMPTY && at(L.exit.door) === EMPTY, `L${id}: exit cells must be empty`);
  for (const p of L.plates) check(at(p.cell) === EMPTY && isSolidValue(at([p.cell[0], p.cell[1] - 1, p.cell[2]])), `L${id}: plate ${p.id} floating`);
  for (const r of L.receivers) check(isSolidValue(at(r.cell)), `L${id}: receiver ${r.id} not on a wall`);
  for (const e of L.emitters) check(isSolidValue(at(e.cell)), `L${id}: emitter not on a wall`);
  for (const cpt of L.checkpoints) check(at(cpt.cell) === EMPTY, `L${id}: checkpoint in a wall`);
  const ids2 = new Set([...L.plates.map((p) => p.id), ...L.switches.map((s) => s.id), ...L.receivers.map((r) => r.id)]);
  for (const d of [...L.doors, ...L.platforms]) for (const i of d.inputs || []) check(ids2.has(i), `L${id}: unknown input ${i}`);
  void GOO;

  // can't finish without doing anything
  const idle = runRoute(createSim, L, [["wait", 8]], { maxT: 9 });
  check(!idle.ok, `L${id}: completes by standing still`);

  if (ANTI[id]) {
    const a = runRoute(createSim, L, ANTI[id], { maxT: 120 });
    check(!a.ok, `L${id}: the no-portal shortcut must fail`);
  }
  const route = ROUTES[id];
  if (!route) {
    check(false, `L${id}: no route`);
    continue;
  }
  const r = runRoute(createSim, L, route, { trace, maxT: 400 });
  const s = r.sim;
  console.log(`${r.ok ? "✓" : "✗"} L${String(id).padStart(2)} ${L.name.padEnd(24)} ${r.ok ? `${s.t.toFixed(1)}s portals ${s.stats.portals} tp ${s.stats.teleports} deaths ${s.stats.deaths}` : r.reason}`);
  if (!r.ok) fails++;
  else check(s.stats.deaths === 0, `L${id}: route died ${s.stats.deaths}×`);
}
console.log(fails ? `\n${fails} failure(s)` : `\nall ${ids.length} chambers solved`);
process.exit(fails ? 1 : 0);
