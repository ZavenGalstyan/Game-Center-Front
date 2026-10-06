/**
 * Rooftop Dash — plays every level with the route bot through the real engine.
 *   safe route  → must reach the finish (no star detours, no shortcuts)
 *   stars route → must reach the finish AND collect all 3 stars
 * Also reports bot times (used to sanity-check target times).
 *
 *   node src/components/games/RooftopDash/tools/levelBot.mjs [levelId] [--trace]
 */
import { createWorld, stepWorld, drainEvents } from "../engine/world.js";
import { createBot, botInput } from "../engine/bot.js";
import { LEVELS } from "../data/levels/index.js";
import { addCityCollision } from "../three/environment.js";
import { worldById } from "../data/worlds.js";
import { validateAll } from "../data/validate.js";

export function playLevel(level, mode, { fps = 60, maxTime = 240, trace = false } = {}) {
  const W = createWorld(level);
  // same collision world as the game: route + the solid background towers
  addCityCollision(W.C, level, worldById(level.world));
  const B = createBot(level, mode);
  let events = [];
  const dt = 1 / fps;
  const tl = [];
  for (let f = 0; f < maxTime * fps; f++) {
    const raw = botInput(B, W, dt, events);
    W.camYaw = raw.yaw;
    stepWorld(W, raw, dt);
    events = drainEvents(W);
    if (trace) {
      for (const e of events) if (!["step", "flow", "start"].includes(e.type)) tl.push(`${(f / fps).toFixed(2)} ${e.type}${e.side ? ":" + e.side : ""} n${B.i} @${W.player.x.toFixed(1)},${W.player.y.toFixed(1)},${W.player.z.toFixed(1)}`);
    }
    if (W.finished) {
      // let the finish settle a moment, then report
      return { ok: true, time: W.finishTime, stars: W.starCount, falls: W.falls, fails: B.fails, W, B, tl };
    }
    if (B.stuckT > 12) break;
  }
  return { ok: false, time: W.time, stars: W.starCount, falls: W.falls, fails: B.fails, W, B, tl, where: `node ${B.i}/${B.nodes.length} @${W.player.x.toFixed(1)},${W.player.y.toFixed(1)},${W.player.z.toFixed(1)} ${W.player.state}` };
}

export async function runLevelBots({ verbose = false, only = null } = {}) {
  const out = [];
  const problems = validateAll(LEVELS);
  out.push({ id: "data", name: "structural validation", ok: problems.length === 0, detail: problems.slice(0, 6).join(" | ") });
  for (const L of LEVELS) {
    if (only != null && L.id !== only) continue;
    const safe = playLevel(L, "safe");
    const stars = playLevel(L, "stars");
    const nStars = L.stars.length;
    const ok = safe.ok && safe.falls === 0 && stars.ok && stars.stars === nStars && stars.falls === 0;
    const detail = `safe ${safe.ok ? safe.time.toFixed(1) + "s" : "FAIL " + safe.where} falls ${safe.falls} | stars ${stars.ok ? stars.time.toFixed(1) + "s" : "FAIL " + stars.where} ${stars.stars}/${nStars} falls ${stars.falls} | target ${L.targetTime}s`;
    out.push({ id: L.id, name: L.name, ok, detail, safe, stars });
    if (verbose) console.log(`  ${ok ? "ok " : "BAD"} ${L.id} ${L.name}: ${detail}`);
  }
  return out;
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, "/")}` || process.argv[1].endsWith("levelBot.mjs")) {
  const arg = process.argv[2];
  const trace = process.argv.includes("--trace");
  const only = arg && !arg.startsWith("--") ? Number(arg) : null;
  for (const L of LEVELS) {
    if (only != null && L.id !== only) continue;
    for (const mode of ["safe", "stars"]) {
      const r = playLevel(L, mode, { trace });
      console.log(`${L.id} ${L.name} [${mode}] ${r.ok ? "FINISH" : "FAIL"} t=${r.time.toFixed(1)} stars=${r.stars}/${L.stars.length} falls=${r.falls} ${r.where || ""}`);
      if (trace) console.log("   " + r.tl.join("\n   "));
      if (trace && r.B.log.length) console.log("   bot:", r.B.log.join(" | "));
    }
  }
}
