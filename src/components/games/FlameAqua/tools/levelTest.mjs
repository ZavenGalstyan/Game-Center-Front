/**
 * Headless level checks: structure + every level's route (tools/routes.mjs)
 * finishes the level with all gems through the real simulation.
 *   node src/components/games/FlameAqua/tools/levelTest.mjs [ids…] [--trace] [--map]
 */
import { LEVELS } from "../data/levels.js";
import { buildLevel, validateLevel } from "../engine/level.js";
import { step } from "../engine/sim.js";
import { ROUTES } from "./routes.mjs";
import { playRoute } from "./bot.mjs";

const args = process.argv.slice(2);
const trace = args.includes("--trace");
const showMap = args.includes("--map");
const ids = args.filter((a) => /^\d+(-\d+)?$/.test(a)).flatMap((a) => {
  const [lo, hi] = a.split("-").map(Number);
  return Array.from({ length: (hi || lo) - lo + 1 }, (_, i) => lo + i);
});
const list = ids.length ? LEVELS.filter((l) => ids.includes(l.id)) : LEVELS;
let fails = 0;
for (const def of list) {
  const errs = validateLevel(def);
  if (showMap) console.log(def.map.map((r, i) => String(i).padStart(2) + " " + r).join("\n") + "\n   " + "0123456789".repeat(4).slice(0, 32));
  const route = ROUTES[def.id - 1];
  if (!route) errs.push("no route");
  let res = null;
  if (route && !errs.length) {
    res = playRoute(buildLevel, step, def, route, { trace });
    if (res.status !== "won") errs.push(`status ${res.status}`);
    if (res.gems[0] !== res.totalGems[0] || res.gems[1] !== res.totalGems[1]) errs.push(`gems ${res.gems} of ${res.totalGems}`);
  }
  const ok = !errs.length;
  if (!ok) fails++;
  console.log(`${ok ? "PASS" : "FAIL"} L${String(def.id).padStart(2)} ${def.name.padEnd(24)} ${res ? res.time.toFixed(1) + "s" : ""} ${errs.join("; ")}`);
  if (!ok && res) {
    console.log("     stuck:", res.stuck.join(" | ") || "-", " dead:", res.dead.join(", ") || "-", " pos:", res.pos.join(" / "), " cmds:", JSON.stringify(res.runner));
    const left = res.state.gems.filter((g) => !g.taken).map((g) => `${g.el[0]}(${Math.floor(g.x / 30)},${Math.floor(g.y / 30)})`);
    if (left.length) console.log("     gems left:", left.join(" "));
    if (trace) console.log(res.log.join("\n"));
  }
}
console.log(`\n${list.length - fails}/${list.length} levels pass`);
process.exit(fails ? 1 : 0);
