/**
 * Mario Adventure 3D — headless level playthroughs with the route bot.
 *   node src/components/games/MarioAdventure3D/tools/levelBot.mjs [ids…] [--verbose]
 * Each level's `route` (data/levels/*) is played through the real engine at
 * 60 fps input / 120 Hz physics. Reports completion, coins, hidden star,
 * hearts lost and time; exits non-zero if any level fails.
 */
import { levelById, BUILT_COUNT } from "../data/levels/index.js";
import { createWorld, advance } from "../engine/world.js";
import { updateCamera } from "../engine/camera.js";
import { createBot } from "./bot.mjs";

export function playLevel(id, { verbose = false, maxTime = 400 } = {}) {
  const lv = levelById(id);
  const W = createWorld(lv);
  const bot = createBot(lv.route || [], { log: verbose ? (m) => console.log(`   [${id}] ${m}`) : undefined });
  const dt = 1 / 60;
  let t = 0;
  let minHearts = 3;
  let falls = 0;
  let lastNode = -1;
  while (t < maxTime && W.state !== "complete" && W.state !== "gameover") {
    const raw = bot(W, dt);
    advance(W, raw, dt);
    updateCamera(W.cam, W, 0, 0, 0, dt, { assist: false });
    for (const e of W.events.splice(0)) {
      if (e.type === "fall") falls++;
      if (verbose && (e.type === "hurt" || e.type === "fall")) console.log(`   [${id}] ${e.type} ${e.kind || ""} at node ${bot.index()} (${W.player.x.toFixed(1)},${W.player.y.toFixed(1)},${W.player.z.toFixed(1)})`);
    }
    if (W.hearts < minHearts) minHearts = W.hearts;
    if (bot.index() !== lastNode) lastNode = bot.index();
    t += dt;
  }
  return { id, name: lv.name, state: W.state, coins: W.coinCount, total: W.coinTotal, goal: W.coinGoal, star: W.starFound, hearts: minHearts, falls, time: W.time, node: bot.index(), nodes: (lv.route || []).length };
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const verbose = process.argv.includes("--verbose");
  const ids = process.argv.slice(2).map(Number).filter(Boolean);
  const list = ids.length ? ids : Array.from({ length: BUILT_COUNT }, (_, i) => i + 1);
  let bad = 0;
  for (const id of list) {
    const r = playLevel(id, { verbose });
    const ok = r.state === "complete";
    if (!ok) bad++;
    console.log(`${ok ? "OK  " : "FAIL"} ${String(id).padStart(2)} ${r.name.padEnd(22)} ${r.state.padEnd(9)} coins ${r.coins}/${r.total} (goal ${r.goal})${r.coins >= r.goal ? "★" : " "} hidden ${r.star ? "★" : "-"} hearts ${r.hearts} falls ${r.falls} t=${r.time.toFixed(1)}s node ${r.node}/${r.nodes}`);
  }
  process.exit(bad ? 1 : 0);
}
