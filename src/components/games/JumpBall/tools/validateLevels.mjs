/**
 * Jump Ball — level validator. Proves every handcrafted level with the REAL
 * sim (engine/sim.js) driven only through setInput(-1|0|1) + step().
 *
 *   node src/components/games/JumpBall/tools/validateLevels.mjs [ids…]
 *
 * For each level:
 *   1. structure: ids unique, start first, one goal last, stars in bounds,
 *      nothing outside the walls, no platform overlapping another
 *   2. COMPLETE: the bot finishes it with REDUCED control authority
 *      (the per-world margin below) — i.e. with a weaker ball than yours
 *   3. ALL STARS: the bot finishes with all 3 stars (margin a bit smaller —
 *      stars are the optional harder routes, but never impossible)
 *   4. REPLAY: the recorded per-step inputs are replayed in a fresh sim and
 *      must reach the goal again (proves determinism, no search artefacts)
 *   5. VISIBILITY: at every landing on the found route, the next platform on
 *      the route is inside the camera's guaranteed view
 * Exits non-zero if anything fails.
 */
import { LEVELS } from "../data/levels.js";
import { solve, replay } from "../engine/bot.js";
import { PHYS } from "../engine/constants.js";
import { Sim } from "../engine/sim.js";

// control authority the bot gets, per world (lower = bigger safety margin)
const MARGIN = { 1: 0.7, 2: 0.78, 3: 0.82, 4: 0.86, 5: 0.9 };
const STAR_MARGIN = { 1: 0.8, 2: 0.86, 3: 0.9, 4: 0.93, 5: 0.96 };

const only = process.argv.slice(2).map(Number).filter(Boolean);
const list = only.length ? LEVELS.filter((L) => only.includes(L.id)) : LEVELS;
let bad = 0;

function structure(L) {
  const errs = [];
  const ids = new Set();
  for (const p of L.platforms) {
    if (ids.has(p.id)) errs.push(`duplicate id ${p.id}`);
    ids.add(p.id);
    const amp = p.move && p.move.axis !== "y" ? p.move.amp : 0;
    if (p.x - p.w / 2 - amp < 0 || p.x + p.w / 2 + amp > 600) errs.push(`${p.id} leaves the playfield`);
  }
  if (L.platforms[0].type !== "start") errs.push("first platform is not start");
  if (L.platforms[L.platforms.length - 1].type !== "finish") errs.push("last platform is not finish");
  if (L.platforms.filter((p) => p.type === "finish").length !== 1) errs.push("goal count != 1");
  if (L.stars.length !== 3) errs.push("needs exactly 3 stars");
  for (const s of L.stars) if (s.x < 30 || s.x > 570) errs.push(`star at x=${s.x} too close to wall`);
  // static overlap check (movers checked at their extremes)
  const box = (p, dx = 0) => [p.x + dx - p.w / 2, p.x + dx + p.w / 2, p.y - (p.h || PHYS.PLATFORM_H), p.y];
  const ext = (p) => (p.move && p.move.axis !== "y" ? [-p.move.amp, 0, p.move.amp] : [0]);
  for (let i = 0; i < L.platforms.length; i++)
    for (let j = i + 1; j < L.platforms.length; j++) {
      const a = L.platforms[i];
      const b = L.platforms[j];
      if (Math.abs(a.y - b.y) > 60) continue;
      for (const da of ext(a))
        for (const db of ext(b)) {
          const A = box(a, da);
          const B = box(b, db);
          const gapY = Math.max(A[2], B[2]) - Math.min(A[3], B[3]);
          if (A[0] < B[1] + 8 && B[0] < A[1] + 8 && gapY < 44) errs.push(`${a.id} crowds ${b.id}`);
        }
    }
  // NO CHEAP DEATHS: a spike may never sit inside the "bounce column" of any
  // landable platform (above it, within its full bounce height + ball size),
  // otherwise simply bouncing on that platform — or launching off it — kills.
  const apex = (t) => ((t === "spring" ? PHYS.SPRING : PHYS.BOUNCE) ** 2) / (2 * PHYS.G);
  for (const k of L.platforms.filter((p) => p.type === "spikes")) {
    const kx0 = k.x - k.w / 2;
    const kx1 = k.x + k.w / 2;
    const ky0 = k.y - (k.h || 24);
    for (const p of L.platforms) {
      if (p.type === "spikes" || p.type === "finish") continue;
      const amp = p.move && p.move.axis !== "y" ? p.move.amp : 0;
      const cx0 = p.x - p.w / 2 - amp - PHYS.R;
      const cx1 = p.x + p.w / 2 + amp + PHYS.R;
      const cy1 = p.y + apex(p.type) + 2 * PHYS.R + 12;
      if (kx0 < cx1 && kx1 > cx0 && ky0 < cy1 && k.y > p.y) errs.push(`${k.id} spikes sit in the bounce column of ${p.id} (cheap death)`);
    }
  }
  return [...new Set(errs)];
}

function visibility(L, route) {
  const byId = new Map(L.platforms.map((p) => [p.id, p]));
  const issues = [];
  let anchor = L.platforms[0].y;
  for (let i = 0; i + 1 < route.length; i++) {
    anchor = Math.max(anchor, byId.get(route[i]).y);
    const next = byId.get(route[i + 1]);
    const ny = next.y + (next.move?.axis === "y" ? next.move.amp : 0);
    const camTop = anchor - PHYS.CAM_ANCHOR + PHYS.VIEW_H;
    if (ny + 40 > camTop) issues.push(`${next.id} not visible from ${route[i]}`);
  }
  return issues;
}

for (const L of list) {
  const t0 = Date.now();
  const errs = structure(L);
  const m = MARGIN[L.world];
  const ms = STAR_MARGIN[L.world];
  const done = solve(L, { ctrl: m, maxNodes: 9000 });
  const all = solve(L, { ctrl: ms, needStars: true, maxNodes: 14000 });
  let rep = null;
  if (all.ok) {
    const sim = replay(L, all.inputs, ms);
    rep = sim.status === "finished" && sim.stats.stars === 3;
  }
  // full-control sanity: the real ball must obviously manage too
  const real = solve(L, { ctrl: 1, maxNodes: 9000 });
  if (!done.ok) errs.push(`NOT COMPLETABLE at ctrl ${m} (${done.reason}, ${done.nodes} nodes)`);
  if (!all.ok) {
    const bad = [0, 1, 2].filter((i) => !solve(L, { ctrl: ms, needStars: [i], maxNodes: 6000 }).ok);
    errs.push(`3 STARS NOT REACHABLE at ctrl ${ms} (${all.reason}, ${all.nodes} nodes); individually unreachable: ${bad.length ? bad.map((i) => `#${i + 1}(${L.stars[i].x},${L.stars[i].y})`).join(" ") : "none (only jointly)"}`);
  }
  if (all.ok && !rep) errs.push("REPLAY of the 3-star route did not reproduce");
  if (!real.ok) errs.push(`not completable even at full control (stuck at ${real.reached?.id} y=${real.reached?.y})`);
  if (done.ok) errs.push(...visibility(L, done.route));
  const counts = {};
  for (const p of L.platforms) counts[p.type] = (counts[p.type] || 0) + 1;
  const mix = Object.entries(counts).map(([k, v]) => `${k}:${v}`).join(" ");
  const status = errs.length ? "FAIL" : "ok  ";
  if (errs.length) bad++;
  console.log(
    `${status} L${String(L.id).padStart(2)} ${L.name.padEnd(20)} w${L.world} h=${L.platforms[L.platforms.length - 1].y} ` +
      `clear@${m}:${done.ok ? done.time.toFixed(1) + "s" : "--"} 3★@${ms}:${all.ok ? all.time.toFixed(1) + "s" : "--"} ` +
      `[${mix}] ${Date.now() - t0}ms`
  );
  for (const e of errs) console.log("      - " + e);
}
// guard against the checker itself going blind: a deliberately impossible level must fail
{
  const imp = {
    id: 0, world: 1, name: "IMPOSSIBLE", width: 600,
    platforms: [
      { id: "a", type: "start", x: 60, y: 0, w: 80 },
      { id: "b", type: "finish", x: 560, y: 240, w: 60 },
    ],
    stars: [],
  };
  const r = solve(imp, { ctrl: 1, maxNodes: 2000 });
  console.log(r.ok ? "FAIL self-check: impossible level was 'solved'" : "ok   self-check: impossible level correctly rejected");
  if (r.ok) bad++;
  const tooHigh = { ...imp, platforms: [imp.platforms[0], { id: "b", type: "finish", x: 60, y: 300, w: 80 }] };
  const r2 = solve(tooHigh, { ctrl: 1, maxNodes: 2000 });
  console.log(r2.ok ? "FAIL self-check: above-apex goal was 'solved'" : "ok   self-check: above-apex goal correctly rejected");
  if (r2.ok) bad++;
  void Sim;
}
console.log(bad ? `\n${bad} PROBLEM(S)` : `\nALL ${list.length} LEVELS VALID`);
process.exit(bad ? 1 : 0);
