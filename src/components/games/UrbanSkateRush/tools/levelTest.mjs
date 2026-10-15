/**
 * Headless check that every Urban Skate Rush level is finishable with the
 * real physics + goal tracker (a simple bot plays each one).
 *   node src/components/games/UrbanSkateRush/tools/levelTest.mjs [ids…] [--verbose]
 */
import { createPlayer, stepPlayer, STATES } from "../engine/physics.js";
import { buildLevelGoal, createTracker, trackFrame, guideTarget, progressOf, starsFor } from "../engine/goals.js";
import { getLevelForMission } from "../data/levels/index.js";
import { MISSIONS } from "../data/missions.js";

const args = process.argv.slice(2);
const verbose = args.includes("--verbose");
const ids = args.filter((a) => /^\d+$/.test(a)).map(Number);
const list = ids.length ? ids : MISSIONS.map((m) => m.id);

const norm = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function steer(p, x, z) {
  const diff = norm(Math.atan2(x - p.x, z - p.z) - p.yaw);
  return { mx: clamp(-diff * 3, -1, 1), diff };
}

function play(id) {
  const level = getLevelForMission(`mission${id}`);
  const setup = buildLevelGoal(id, level);
  const world = { grounds: level.grounds, obstacles: level.obstacles, rails: [...level.rails, ...setup.rails], bounds: level.bounds, tokens: [], checkpoints: {} };
  const p = createPlayer(setup.spawn);
  const tr = createTracker();
  const dt = 1 / 60;
  let jumpCd = 0;
  let phase = "approach";
  let stuck = 0;
  let lastPos = { x: p.x, z: p.z };
  const notes = [];
  for (let f = 0; f < 60 * 240; f++) {
    const inp = { mx: 0, mz: 1, mag: 1, sprint: false, jumpPressed: false, jumpHeld: false, crouch: false, grind: false, kickflip: false, heelflip: false, shoveIt: false };
    jumpCd -= dt;
    const kind = setup.goal.kind;
    const t = guideTarget(tr, setup, p);
    if ((kind === "rings" || kind === "coins") && t) {
      const s = steer(p, t.x, t.z);
      inp.mx = s.mx;
      const dist = Math.hypot(t.x - p.x, t.z - p.z);
      inp.mag = Math.abs(s.diff) > 1.2 || (dist < 6 && Math.abs(s.diff) > 0.5) ? 0.35 : 1;
    } else if (kind === "grind" && setup.grindRail) {
      const r = setup.grindRail;
      const len = Math.hypot(r.endX - r.startX, r.endZ - r.startZ);
      const dx = (r.endX - r.startX) / len;
      const dz = (r.endZ - r.startZ) / len;
      if (p.state !== STATES.GRINDING) {
        const back = setup.rails.length ? 9 : 6;
        const ax = r.startX - dx * back;
        const az = r.startZ - dz * back;
        if (phase === "approach") {
          const s = steer(p, ax, az);
          inp.mx = s.mx;
          inp.mag = Math.abs(s.diff) > 1.2 ? 0.4 : 0.8;
          if (Math.hypot(p.x - ax, p.z - az) < 2.5) phase = "run";
        } else {
          const s = steer(p, r.startX + dx * 3, r.startZ + dz * 3);
          inp.mx = s.mx;
          const d = Math.hypot(p.x - r.startX, p.z - r.startZ);
          if (d < 3.2 && p.grounded && jumpCd <= 0) {
            inp.jumpPressed = true;
            inp.jumpHeld = true;
            jumpCd = 1;
          }
          // overshot / missed: go round again
          if ((p.x - r.endX) * dx + (p.z - r.endZ) * dz > 2 || (d > 14 && p.grounded && jumpCd < 0)) phase = "approach";
        }
      } else phase = "approach";
    } else {
      // jumps / tricks / score: cruise in a wide circle and keep popping tricks
      inp.mx = 0.35;
      inp.mag = 0.7;
      if (p.grounded && jumpCd <= 0) {
        inp.jumpPressed = true;
        inp.jumpHeld = true;
        jumpCd = 0.9;
      }
      if (p.state === STATES.AIR && p.airTime > 0.32 && p.airTime < 0.36 && kind !== "jumps") inp.kickflip = true;
      if (p.state === STATES.AIR && p.airTime > 0.5 && p.airTime < 0.53 && kind === "score") inp.heelflip = true;
    }
    // unstick: if barely moving for 2 s, back up and turn
    if (f % 60 === 0) {
      if (Math.hypot(p.x - lastPos.x, p.z - lastPos.z) < 1.5) stuck++;
      else stuck = 0;
      lastPos = { x: p.x, z: p.z };
    }
    if (stuck >= 2) {
      inp.mz = -1;
      inp.mx = 1;
      if (stuck > 3) stuck = 0;
    }
    stepPlayer(p, inp, dt, world);
    const ev = p.events;
    p.events = [];
    if (ev.some((e) => e.type === "crash")) notes.push("crash@" + (f / 60).toFixed(1));
    const h = trackFrame(tr, setup, p, ev, dt);
    if (h.includes("done")) return { ok: true, time: tr.time, stars: starsFor(setup.goal, tr.time), setup, notes };
  }
  return { ok: false, time: tr.time, progress: progressOf(tr, setup.goal), setup, notes, pos: [p.x.toFixed(1), p.z.toFixed(1)] };
}

let fails = 0;
for (const id of list) {
  const r = play(id);
  const g = r.setup.goal;
  const items = r.setup.rings.length || r.setup.coins.length || (r.setup.grindRail ? 1 : 0);
  const line = `${String(id).padStart(2)} ${g.kind.padEnd(6)} ${String(g.target).padStart(5)}  ${r.ok ? "OK  " : "FAIL"} ${r.time.toFixed(1).padStart(6)}s  par ${String(g.par).padStart(3)}s  ${r.ok ? "★".repeat(r.stars) : `progress ${r.progress} at ${r.pos}`}  items:${items}${r.notes.length ? "  " + r.notes.slice(0, 3).join(",") : ""}`;
  console.log(line);
  if (verbose && !r.ok) console.log("   spawn", r.setup.spawn, "rings", r.setup.rings.map((q) => `${q.x.toFixed(0)},${q.z.toFixed(0)}`).join(" "));
  if (!r.ok) fails++;
  if (g.kind === "grind" && !r.setup.grindRail) {
    console.log("   no practice rail placed");
    fails++;
  }
}
console.log(fails ? `${fails} level(s) FAILED` : `all ${list.length} levels finishable`);
process.exit(fails ? 1 : 0);
