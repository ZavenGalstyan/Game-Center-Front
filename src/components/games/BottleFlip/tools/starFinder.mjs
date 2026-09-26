/**
 * Bottle Flip — bonus-star placement helper (authoring only).
 *
 *   node tools/starFinder.mjs <levelId> <hop> [mode=high|low|far] [t0]
 *
 * Sweeps the hop, keeps only throws that LAND with progress, picks one that
 * is not the "obvious" throw (the highest lob / flattest / farthest), and
 * prints a point on its path, plus how many winning throws pass within the
 * pickup radius of that point. Stars are then hand-written into levels.js
 * and proven by levelCheck.mjs.
 */
import { getLevel } from "../levels/levels.js";
import { createSession, launch, update, drainEvents } from "../game/session.js";
import { PHYS, BOTTLE } from "../physics/constants.js";
import { platformTop } from "../physics/solids.js";

const DEG = Math.PI / 180;
const [id, hop, mode = "high", t0s = "0"] = process.argv.slice(2);
const level = getLevel(Number(id));
const from = Number(hop);
const t0 = Number(t0s);

function run(angle, power) {
  const s = createSession(level);
  s.t = t0;
  s.platformIndex = from;
  const p = level.platforms[from];
  s.localX = from === 0 ? level.spawnX ?? p.w * 0.7 : p.w / 2;
  s.progress = from;
  s.checkpoint = from;
  const tp = platformTop(p, s.t);
  s.body.x = tp.x0 + s.localX;
  s.body.y = tp.top + BOTTLE.com;
  launch(s, angle, power);
  const path = [];
  for (let i = 0; i < 4000; i++) {
    update(s, PHYS.dt);
    if (s.state === "flight") path.push([s.body.x, s.body.y]);
    for (const e of drainEvents(s)) {
      if (e.type === "land") return { ok: e.platform > from, path, platform: e.platform };
      if (e.type === "fail") return { ok: false, path };
    }
  }
  return { ok: false, path };
}

const wins = [];
for (let a = 16; a <= 164; a += 3) for (let p = 0; p <= 1.0001; p += 0.025) {
  const r = run(a * DEG, p);
  if (r.ok && r.path.length > 10) wins.push({ a, p, ...r });
}
if (!wins.length) {
  console.log("no winning throws");
  process.exit(1);
}
const apex = (w) => w.path.reduce((m, q) => (q[1] > m[1] ? q : m), w.path[0]);
// not the extreme single throw — a 80th / 20th percentile path, so a star
// sits on a family of winning throws rather than one pixel-perfect one
const byApex = [...wins].sort((a, b) => apex(a)[1] - apex(b)[1]);
let pick;
if (mode === "high") pick = byApex[Math.floor(byApex.length * 0.8)];
else if (mode === "low") pick = byApex[Math.floor(byApex.length * 0.2)];
else pick = wins.reduce((m, w) => (w.platform > m.platform ? w : m));
// a point 45% along the flight
const pt = pick.path[Math.floor(pick.path.length * 0.45)];
const near = wins.filter((w) => w.path.some((q) => Math.hypot(q[0] - pt[0], q[1] - pt[1]) < 9)).length;
console.log(`wins ${wins.length}; pick a=${pick.a} p=${pick.p.toFixed(3)} → platform ${pick.platform}`);
console.log(`star at x=${pt[0].toFixed(0)} y=${pt[1].toFixed(0)}  (winning throws through it: ${near})`);
