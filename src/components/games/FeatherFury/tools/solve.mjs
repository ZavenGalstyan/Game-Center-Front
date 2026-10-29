/**
 * Solvability proof for every level (headless, multi-threaded):
 *   node src/components/games/FeatherFury/tools/solve.mjs [ids…] [--verify] [--k=2]
 *
 * For each level a beam search fires the level's own birds in order, trying
 * a grid of aim angles × pull strengths and, for birds with a tap ability,
 * several tap moments (counted in physics steps after launch, timed back from
 * the moment the untapped bird would hit something). Every candidate is a
 * full replay through the real engine (createGame → launch → step), so a win
 * here is a win in the game. Candidates are ranked by Mokos defeated, then by
 * how many of four slightly-off aims (±0.75°, ±2% power) do as well (so the
 * shot doesn't need pixel-perfect aim), then by score.
 *
 * Results go to tools/solutions.json; `--verify` replays the stored solutions
 * only (a fast regression check after physics or level edits).
 */
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import os from "node:os";
import { LEVELS } from "../data/levels.js";
import { play } from "./replay.mjs";

const OUT = fileURLToPath(new URL("./solutions.json", import.meta.url));
const ANGLES = [];
for (let a = -6; a <= 75; a += 3) ANGLES.push(a);
const POWERS = [0.5, 0.6, 0.7, 0.8, 0.88, 0.94, 1];
const ABILITY = new Set(["yellow", "black", "blue"]);

function solveLevel(def, K) {
  let beam = [{ shots: [], kills: 0, score: 0 }];
  let best = null;
  let fallback = null;
  let sims = 0;
  for (let depth = 0; depth < def.birds.length && !best; depth++) {
    const type = def.birds[depth];
    const cands = [];
    for (const node of beam) {
      for (const a of ANGLES) {
        for (const p of POWERS) {
          const base = { a, p, tap: -1 };
          const r0 = play(def, [...node.shots, base]);
          sims++;
          cands.push({ shots: [...node.shots, base], ...r0 });
          if (ABILITY.has(type) && r0.touch > 0) {
            const T = r0.touch;
            const taps = type === "yellow" ? [T - 4, T - 10, T - 20, T - 35] : type === "black" ? [T - 1, T - 3] : [T - 6, T - 14, T - 25];
            for (const tap of taps) {
              if (tap < 4) continue;
              const s = { a, p, tap };
              const r = play(def, [...node.shots, s]);
              sims++;
              cands.push({ shots: [...node.shots, s], ...r });
            }
          }
        }
      }
    }
    cands.sort((x, y) => (y.won - x.won) || (y.kills - x.kills) || (y.score - x.score));
    // robustness for the leaders: do slightly-off aims do as well?
    const top = cands.slice(0, 10);
    for (const c of top) {
      const last = c.shots[c.shots.length - 1];
      let ok = 0;
      for (const [da, dp] of [[0.75, 0], [-0.75, 0], [0, 0.02], [0, -0.02]]) {
        const s = { ...last, a: last.a + da, p: Math.min(1, last.p + dp) };
        const r = play(def, [...c.shots.slice(0, -1), s]);
        sims++;
        if (r.kills >= c.kills) ok++;
      }
      c.robust = ok;
    }
    top.sort((x, y) => (y.won - x.won) || (y.kills - x.kills) || (y.robust - x.robust) || (y.score - x.score));
    // a win whose aim tolerates small errors ends the search; a knife-edge
    // win is kept as a fallback while later birds look for a sturdier one
    const wins = top.filter((c) => c.won);
    const sturdy = wins.find((c) => c.robust >= 2);
    if (sturdy) {
      best = sturdy;
      break;
    }
    if (wins.length && !fallback) fallback = wins[0];
    // keep K distinct, promising prefixes
    beam = [];
    for (const c of top) {
      if (beam.length >= K) break;
      if (!c.won && !beam.some((b) => b.kills === c.kills && b.score === c.score)) beam.push(c);
    }
    if (!beam.length) break;
  }
  return { best: best || fallback, sims };
}

if (!isMainThread) {
  const { id, K, verify, shots } = workerData;
  const def = LEVELS[id - 1];
  if (verify) {
    const r = play(def, shots);
    parentPort.postMessage({ id, verify: true, ...r, shots });
  } else {
    const t0 = Date.now();
    const { best, sims } = solveLevel(def, K);
    parentPort.postMessage({ id, sims, ms: Date.now() - t0, ...(best || { won: false }), shots: best?.shots || [] });
  }
} else {
  const args = process.argv.slice(2);
  const verify = args.includes("--verify");
  const K = Number((args.find((a) => a.startsWith("--k=")) || "--k=2").slice(4));
  const ids = args.map(Number).filter(Boolean);
  const todo = (ids.length ? ids : LEVELS.map((l) => l.id)).slice();
  const store = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : {};
  const results = [];
  const N = Math.max(1, Math.min(os.cpus().length - 2, todo.length));
  let running = 0;
  await new Promise((resolve) => {
    const next = () => {
      if (!todo.length && !running) return resolve();
      while (running < N && todo.length) {
        const id = todo.shift();
        if (verify && !store[id]) {
          results.push({ id, won: false, missing: true });
          continue;
        }
        running++;
        const w = new Worker(fileURLToPath(import.meta.url), { workerData: { id, K, verify, shots: store[id]?.shots } });
        w.on("message", (m) => {
          results.push(m);
          const def = LEVELS[m.id - 1];
          console.log(`${String(m.id).padStart(2)} ${def.name.padEnd(22)} ${m.won ? "WON " : "FAIL"} kills ${m.kills}/${m.total} shots ${m.shots.length}/${def.birds.length} stars ${m.stars} score ${m.score}${m.robust !== undefined ? ` robust ${m.robust}/4` : ""}${m.ms ? ` (${(m.ms / 1000).toFixed(1)}s, ${m.sims} sims)` : ""}`);
        });
        w.on("error", (e) => {
          console.error(`level ${id} crashed`, e);
          results.push({ id, won: false });
        });
        w.on("exit", () => {
          running--;
          next();
        });
      }
    };
    next();
  });
  if (!verify) {
    for (const r of results) if (r.won) store[r.id] = { shots: r.shots, stars: r.stars, score: r.score };
    writeFileSync(OUT, JSON.stringify(store, null, 1));
  }
  const failed = results.filter((r) => !r.won).map((r) => r.id).sort((a, b) => a - b);
  const stars = results.reduce((s, r) => s + (r.stars || 0), 0);
  console.log(`\n${results.length - failed.length}/${results.length} levels won${failed.length ? ` — failed: ${failed.join(", ")}` : ""} · stars ${stars}/${results.length * 3}`);
  process.exit(failed.length ? 1 : 0);
}
