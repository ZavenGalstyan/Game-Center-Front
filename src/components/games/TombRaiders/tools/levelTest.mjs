/**
 * Headless level check:  node src/components/games/TombRaiders/tools/levelTest.mjs [ids|a-b] [--trace] [--up=N]
 *  1. the scripted route (tools/routes.mjs) completes the level through the real sim,
 *     fighting with the combat bot (base stats, or every upgrade at rank N with --up=N);
 *  2. the exit cannot be reached at the start without solving anything (no free walk-out).
 */
import { createSim, defaultLoadout } from "../engine/sim.js";
import { LEVELS } from "../engine/levels.js";
import { statsFor, DIRS } from "../engine/constants.js";
import { ROUTES } from "./routes.mjs";
import { runRoute } from "./bot.mjs";

const args = process.argv.slice(2);
const trace = args.includes("--trace");
const up = Number((args.find((a) => a.startsWith("--up=")) || "--up=0").slice(5));
// --human: aim error + reaction delay, closer to a real player than the perfect-aim bot
const skill = args.includes("--human") ? { aimErr: 0.07, react: 0.6, turn: 5 } : null;
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
      const t = s.tileAt(nc, nr);
      if (!t) continue;
      const ok = t.t === "exit" || t.t === "spikes" || (t.t === "floor" && t.h < 0.65) || (t.t === "laser" && !s.laserOn(t)) || (t.t === "gas" && !s.gasOn(t));
      if (!ok || s.solidEntAt(nc, nr)) continue;
      seen.add(k);
      q.push([nc, nr]);
    }
  }
  return false;
}

let fails = 0;
let totalXp = 0;
const stats = statsFor({ vitality: up, armor: up, power: up, agility: up, mysticism: Math.min(3, up) });
for (const id of ids) {
  const L = LEVELS[id - 1];
  const sim = createSim(L, { stats, loadout: defaultLoadout(id) });
  const res = runRoute(sim, ROUTES[id], {
    skill,
    onEvent: trace ? (e, s) => !["impact", "shot", "enemyHurt", "xp", "reload", "reloaded", "switch", "jump", "land", "splash", "burst", "plate"].includes(e.type) && console.log(`  ${s.t.toFixed(2)} ${e.type} ${JSON.stringify(e)}`) : undefined,
  });
  const free = exitReachableAtStart(L);
  const ok = res.done && !free;
  if (!ok) fails++;
  totalXp += res.xp;
  console.log(
    `${ok ? "PASS" : "FAIL"} L${String(id).padStart(2, "0")} ${L.name.padEnd(22)} t=${res.t.toFixed(0).padStart(4)}s deaths=${res.deaths} med=${sim.counters.heals || 0} hp=${Math.round(res.hp)} kills=${sim.counters.kills}/${sim.enemies.length} taken=${Math.round(sim.counters.taken)} xp=${res.xp}${res.done ? "" : ` step=${res.step} reason=${res.reason}`}${free ? " EXIT-REACHABLE-AT-START" : ""}`,
  );
}
console.log(`${fails ? `${fails} level(s) failed` : `all ${ids.length} levels solved`} · total xp ${totalXp}`);
process.exit(fails ? 1 : 0);
