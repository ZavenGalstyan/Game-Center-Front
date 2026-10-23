/**
 * Headless level checks (Node + real Matter.js):
 *   node src/components/games/GravitySketch/tools/levelTest.mjs [ids…] [--trace] [--runs N]
 * For every level:
 *  1. the reference solution wins, within ★★★ par and the ink budget;
 *  2. it is robust: wins in most runs with every point jittered ±5 units;
 *  3. the level does not solve itself (physics started, nothing drawn);
 *  4. the solution strokes are drawable (no point lands on a blocked spot).
 * --trace prints positions of id'd bodies every 0.5 s for the solution run.
 */
import { LEVELS } from "../levels.js";
import * as E from "../engine.js";

const args = process.argv.slice(2);
const trace = args.includes("--trace");
const runsArg = args.indexOf("--runs");
const RUNS = runsArg >= 0 ? +args[runsArg + 1] : 12;
const ids = args.filter((a, i) => /^\d+$/.test(a) && args[i - 1] !== "--runs").map(Number);
const list = ids.length ? ids : LEVELS.map((_, i) => i + 1);

let seed = 1;
const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

let failures = 0;
const fail = (msg) => (failures++, console.log("  ✗ " + msg));

for (const n of list) {
  const L = LEVELS[n - 1];
  if (!L) continue;
  const t0 = performance.now();
  // 1. reference solution
  const ref = E.runSolution(L, L.sol, { maxTime: 30 });
  const okRef = ref.won && ref.drawn === L.sol.length && ref.shapes <= L.par[0] && ref.sim.inkUsed <= L.ink;
  // 2. robustness
  seed = n * 7919;
  let wins = 0;
  for (let r = 0; r < RUNS; r++) if (E.runSolution(L, L.sol, { maxTime: 30, jitter: 5, rng }).won) wins++;
  // 3. idle
  const idle = E.createSim(L);
  idle.started = true;
  idle.state = "running";
  while (idle.state === "running" && idle.time < 15) E.step(idle);
  const ms = (performance.now() - t0) | 0;
  console.log(
    `${String(n).padStart(2)} ${L.name.padEnd(22)} ref:${ref.won ? "WIN" : ref.failed ? "FAIL(" + ref.sim.failReason + ")" : "timeout"} t=${ref.time.toFixed(1)}s drawn=${ref.drawn}/${L.sol.length} ink=${ref.sim.inkUsed | 0}/${L.ink}  jitter ${wins}/${RUNS}  idle:${idle.state}  ${ms}ms`,
  );
  // 4. every reference stroke is drawn (nearly) in full — none of it lands on blocked space
  {
    const sim = E.createSim(L);
    for (const [k, st] of L.sol.entries()) {
      const want = E.strokeLength(st.pts.map(([x, y]) => ({ x, y })));
      const bad = E.densify(st.pts.map(([x, y]) => ({ x, y })), 8).filter((p) => !E.pointFree(sim, p)).slice(0, 3);
      const got = E.drawPoints(sim, st.pts);
      const len = got ? (got.dot ? 0 : E.strokeLength(got.pts)) : -1;
      if (!got || (!got.dot && len < want * 0.97)) {
        fail(`stroke #${k} blocked: drew ${len | 0}/${want | 0} — e.g. at ${bad.map((p) => `(${p.x | 0},${p.y | 0})`).join(" ")}`);
      }
    }
  }
  if (!okRef) fail(`reference solution: won=${ref.won} drawn=${ref.drawn}/${L.sol.length} shapes=${ref.shapes} par=${L.par[0]} ink=${ref.sim.inkUsed | 0}/${L.ink}`);
  if (wins < Math.ceil(RUNS * 0.75)) fail(`not robust: ${wins}/${RUNS} jittered wins`);
  if (idle.state === "won") fail("level solves itself");
  if (!L.task || !L.name || !L.par || !L.ink) fail("missing metadata");
  if (trace) {
    const sim = E.createSim(L);
    let qi = 0, nextT = 0;
    while (sim.time < 30 && sim.state !== "won" && sim.state !== "failed") {
      while (qi < L.sol.length && (sim.time >= L.sol[qi].t || !sim.started)) {
        const r = E.drawPoints(sim, L.sol[qi].pts);
        console.log(`    draw#${qi} at ${sim.time.toFixed(2)} → ${r ? "ok" : "BLOCKED"}${r ? "" : ""}`);
        qi++;
      }
      if (!sim.started) break;
      E.step(sim);
      sim.events.length = 0;
      if (sim.time >= nextT) {
        nextT += 0.5;
        const pos = [...sim.byId.entries()].filter(([, b]) => !b.isStatic || b.gsKind === "gate").map(([id, b]) => `${id}(${b.position.x | 0},${b.position.y | 0}${b.gsGone ? " gone" : ""})`);
        const dr = sim.drawn.map((d, i) => `d${i}(${d.body.position.x | 0},${d.body.position.y | 0})`);
        console.log(`    t=${sim.time.toFixed(1)} ${pos.join(" ")} ${dr.join(" ")} hit=[${[...sim.hit]}] pressed=[${[...sim.pressed]}] hold=${sim.hold.toFixed(2)}`);
      }
    }
    console.log(`    end: ${sim.state} ${sim.failReason}`);
  }
}
console.log(failures ? `\n${failures} problem(s)` : `\nall ${list.length} level(s) OK`);
process.exit(failures ? 1 : 0);
