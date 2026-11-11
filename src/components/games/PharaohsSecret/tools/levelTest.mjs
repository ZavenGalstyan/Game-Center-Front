/**
 * Headless level check:  node src/components/games/PharaohsSecret/tools/levelTest.mjs [ids|a-b] [--trace]
 *  1. the scripted route (tools/routes.mjs) completes the level through the real sim, without dying;
 *  2. the exit cannot be reached at the start without solving anything (no free walk-out);
 *  3. every interactive device appears in the route or is a clue/container the player can use.
 */
import { createSim } from "../engine/sim.js";
import { LEVELS } from "../engine/levels.js";
import { ROUTES } from "./routes.mjs";
import { runRoute } from "./bot.mjs";
import { DIRS } from "../engine/constants.js";

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

function exitReachableAtStart(L) {
  const s = createSim(L);
  for (let i = 0; i < 10; i++) s.update(1 / 60, {});
  const [sc, sr] = s.playerCell();
  const seen = new Set([`${sc},${sr}`]);
  const q = [[sc, sr]];
  while (q.length) {
    const [c, r] = q.shift();
    if (s.tileKind(c, r) === "exit") return true;
    for (const [dc, dr] of Object.values(DIRS)) {
      const nc = c + dc,
        nr = r + dr,
        k = `${nc},${nr}`;
      if (seen.has(k)) continue;
      const kind = s.tileKind(nc, nr);
      if (!["floor", "exit", "spikes", "crumble"].includes(kind)) continue;
      if (s.solidEntAt(nc, nr)) continue;
      seen.add(k);
      q.push([nc, nr]);
    }
  }
  return false;
}

let fails = 0;
for (const id of ids) {
  const L = LEVELS[id - 1];
  const sim = createSim(L);
  const res = runRoute(sim, ROUTES[id], {
    onEvent: trace ? (e, s) => !["plateOn", "plateOff", "crack"].includes(e.type) && console.log(`  ${s.t.toFixed(2)} ${e.type} ${JSON.stringify(e)}`) : undefined,
  });
  const free = exitReachableAtStart(L);
  const ok = res.done && res.deaths === 0 && !free;
  if (!ok) fails++;
  console.log(
    `${ok ? "PASS" : "FAIL"} L${String(id).padStart(2, "0")} ${L.name.padEnd(28)} t=${res.t.toFixed(1)}s deaths=${res.deaths}${res.done ? "" : ` step=${res.step} reason=${res.reason}`}${free ? " EXIT-REACHABLE-AT-START" : ""}`,
  );
}
console.log(fails ? `${fails} level(s) failed` : `all ${ids.length} levels solvable`);
process.exit(fails ? 1 : 0);
