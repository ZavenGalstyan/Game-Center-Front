/**
 * Physics stability + engine rule checks (Node + real Matter.js):
 *   node src/components/games/GravitySketch/tools/stressTest.mjs
 *  - every level survives 40 random scribbles/taps over 20 s: no NaN, no
 *    runaway speeds (explosions), and a frame stays cheap;
 *  - drawing rules: can't start inside bodies or no-draw zones, ink budget is
 *    enforced and refunded by undo, a tap makes a ball, physics only starts
 *    with the first shape;
 *  - star rating and progress persistence rules.
 */
import { LEVELS } from "../levels.js";
import * as E from "../engine.js";
import * as P from "../progress.js";

let fails = 0, checks = 0;
const ok = (cond, msg) => {
  checks++;
  if (!cond) (fails++, console.log("  ✗ " + msg));
};
let seed = 12345;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

/* ---------- stability ---------- */
let worstMs = 0;
for (const [i, L] of LEVELS.entries()) {
  const sim = E.createSim({ ...L, ink: 1e6 });
  let maxV = 0, nan = false;
  const t0 = performance.now();
  let frames = 0;
  for (let k = 0; k < 40; k++) {
    // random scribble: 1–12 points, or a tap
    const x = 60 + rnd() * (E.W - 120), y = 40 + rnd() * (E.H * 0.6);
    const n = rnd() < 0.25 ? 1 : 2 + Math.floor(rnd() * 10);
    const pts = [[x, y]];
    for (let j = 1; j < n; j++) pts.push([pts[j - 1][0] + (rnd() - 0.5) * 160, pts[j - 1][1] + (rnd() - 0.5) * 120]);
    E.drawPoints(sim, pts);
    if (!sim.started) continue;
    for (let f = 0; f < 30 && sim.state === "running"; f++, frames++) {
      E.step(sim);
      sim.events.length = 0;
    }
    if (sim.state !== "running") {
      // keep stressing even after a win/fail
      sim.state = "running";
    }
    for (const b of sim.engine.world.bodies) {
      if (!Number.isFinite(b.position.x) || !Number.isFinite(b.position.y) || !Number.isFinite(b.angle)) nan = true;
      if (!b.isStatic) maxV = Math.max(maxV, b.speed);
    }
  }
  const ms = (performance.now() - t0) / Math.max(1, frames);
  worstMs = Math.max(worstMs, ms);
  ok(!nan, `level ${i + 1}: NaN in physics`);
  ok(maxV < 80, `level ${i + 1}: runaway speed ${maxV.toFixed(1)} px/step`);
  ok(ms < 8, `level ${i + 1}: ${ms.toFixed(2)} ms per frame under stress`);
}
console.log(`stability: 30 levels × 40 random shapes, worst ${worstMs.toFixed(2)} ms/frame`);

/* ---------- drawing rules ---------- */
{
  const L = LEVELS[0];
  const sim = E.createSim(L);
  ok(sim.state === "ready" && !sim.started, "sim starts frozen");
  E.step(sim);
  ok(sim.time === 0, "physics does not run before the first shape");
  // inside the left ramp
  ok(!E.pointFree(sim, { x: 300, y: 500 }), "cannot draw inside a static body");
  ok(!E.pointFree(sim, { x: 3, y: 300 }), "cannot draw outside the page");
  const st = E.createStroke(sim);
  st.add({ x: 300, y: 500 });
  ok(st.pts.length === 0 && st.blocked, "stroke cannot start inside a body");
  // a stroke that crosses the ramp skips the blocked part
  const st2 = E.createStroke(sim);
  for (const p of E.densify([{ x: 300, y: 380 }, { x: 300, y: 620 }], 6)) st2.add(p);
  ok(st2.pts.every((p) => E.pointFree(sim, p)), "stroke never places points inside bodies");
  const tap = E.commitStroke(sim, [{ x: 800, y: 200 }]);
  ok(tap && tap.dot, "a tap makes a small ball");
  ok(sim.started && sim.state === "running", "first shape starts physics");
  const used = sim.inkUsed;
  ok(E.undo(sim) && sim.inkUsed === used - tap.ink && sim.drawn.length === 0, "undo removes the shape and refunds ink");
  // ink budget
  const s3 = E.createSim({ ...L, ink: 200 });
  const st3 = E.createStroke(s3);
  for (const p of E.densify([{ x: 600, y: 150 }, { x: 1400, y: 150 }], 6)) st3.add(p);
  ok(Math.abs(st3.ink - 200) < 2 && st3.dead, `ink budget caps a stroke (${st3.ink.toFixed(1)})`);
  const rec = E.commitStroke(s3, st3.pts);
  ok(rec && E.inkLeft(s3) < 2, "ink is spent");
  const st4 = E.createStroke(s3);
  st4.add({ x: 700, y: 300 });
  st4.add({ x: 760, y: 300 });
  ok(st4.pts.length <= 1, "no more drawing without ink");
  // no-draw zones
  const nd = E.createSim(LEVELS[5]);
  ok(!E.pointFree(nd, { x: 1300, y: 300 }), "cannot draw in a no-draw zone");
  ok(!E.segmentFree(nd, { x: 980, y: 300 }, { x: 1300, y: 300 }) , "segments can't enter a no-draw zone");
}

/* ---------- stars ---------- */
{
  const L = { par: [1, 2] };
  ok(E.starsFor(L, 1) === 3 && E.starsFor(L, 2) === 2 && E.starsFor(L, 5) === 1, "stars by shape count");
  ok(E.starsFor(L, 1, true) === 2, "a hint caps the level at two stars");
  for (const [i, Lv] of LEVELS.entries()) ok(Lv.par[0] <= Lv.par[1] && Lv.sol.length <= Lv.par[0], `level ${i + 1}: par consistent with solution`);
}

/* ---------- progress ---------- */
{
  const N = LEVELS.length;
  let p = P.normalize(null, N);
  ok(p.unlocked === 0 && Object.keys(p.best).length === 0 && p.sound, "fresh progress");
  let r = P.recordWin(p, 0, 2, 2, N);
  ok(r.prog.unlocked === 1 && r.prog.best[0].stars === 2 && r.first, "win unlocks next level");
  r = P.recordWin(r.prog, 0, 1, 4, N);
  ok(r.prog.best[0].stars === 2 && !r.newBest, "worse result keeps the best");
  r = P.recordWin(r.prog, 0, 3, 1, N);
  ok(r.prog.best[0].stars === 3 && r.newBest, "better result replaces the best");
  ok(P.totalStars(r.prog) === 3, "total stars");
  const junk = P.normalize({ unlocked: 999, best: { 0: { stars: 9, shapes: -3 }, 77: { stars: 2 }, x: 1, 5: "bad" }, sound: false }, N);
  ok(junk.unlocked === N - 1 && junk.best[0].stars === 3 && junk.best[0].shapes === 1 && !junk.best[77] && !junk.best[5] && !junk.sound, "corrupt saves are sanitized");
  ok(P.normalize("garbage", N).unlocked === 0, "non-object save resets");
  ok(P.nextLevel(P.normalize({ best: { 0: { stars: 3, shapes: 1 }, 1: { stars: 1, shapes: 3 } } }, N), N) === 2, "continue picks the first unsolved level");
}

console.log(fails ? `\n${fails}/${checks} checks failed` : `\nall ${checks} checks passed`);
process.exit(fails ? 1 : 0);
