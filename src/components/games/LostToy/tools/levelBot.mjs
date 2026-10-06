/**
 * Lost Toy — headless level runner: proves each level is completable through
 * the real engine + raw input (main route), and that every Memory Button is
 * reachable (buttons route).
 *
 *   node src/components/games/LostToy/tools/levelBot.mjs [ids…] [--assist]
 */
import { createWorld, stepWorld, drainEvents } from "../engine/world.js";
import { runBot } from "../engine/bot.js";
import { levelById, levelIds } from "../data/levels/index.js";

const args = process.argv.slice(2);
const assist = args.includes("--assist");
const ids = args.filter((a) => /^\d+$/.test(a)).map(Number);
const list = ids.length ? ids : levelIds();
let bad = 0;
for (const id of list) {
  const L = levelById(id);
  for (const mode of ["main", "buttons"]) {
    const r = await runBot(L, { createWorld, stepWorld, drainEvents }, { mode, assist });
    const ok = r.finished && (mode === "main" || r.buttons === (L.buttons || []).length);
    if (!ok) bad++;
    console.log(`${ok ? "OK  " : "FAIL"} L${String(id).padStart(2, "0")} ${mode.padEnd(7)} t=${r.time.toFixed(1)}s node ${r.node}/${r.nodes} buttons ${r.buttons}/${L.buttons.length} falls ${r.fall} hurt ${r.hurt}${ok ? "" : ` at ${JSON.stringify(r.at)} state=${r.state} stuck=${JSON.stringify(r.stuckNode)}`}`);
  }
}
process.exit(bad ? 1 : 0);
