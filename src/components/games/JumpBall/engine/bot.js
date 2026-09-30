/**
 * Jump Ball — steering bot + reachability solver.
 *
 * The bot only ever calls sim.setInput(-1 | 0 | 1) and sim.step() — exactly
 * what the keyboard does — so anything it reaches, a player can reach with
 * the same physics. Used by:
 *   - the menu demo (steer)
 *   - tools/validateLevels.mjs (solve every level, with reduced control
 *     authority as a safety margin)
 *   - tools/simTest.mjs (endless generator validation)
 */
import { PHYS } from "./constants.js";
import { Sim, platX, platTop, platSolid, LANDABLE } from "./sim.js";

/** Later root of y + vy·τ − ½Gτ² = yT (descending pass), or null if never reached. */
export function fallTime(y, vy, yT) {
  const disc = vy * vy + 2 * PHYS.G * (y - yT);
  if (disc < 0) return null;
  return (vy + Math.sqrt(disc)) / PHYS.G;
}

/** Earlier root (ascending pass) — time to first reach height yT, or null. */
function riseTime(y, vy, yT) {
  const disc = vy * vy + 2 * PHYS.G * (y - yT);
  if (disc < 0) return null;
  const t = (vy - Math.sqrt(disc)) / PHYS.G;
  return t >= 0 ? t : null;
}

/**
 * Pick an input that steers the ball towards target.plat (+offset units),
 * optionally passing through target.via (a star) first.
 */
export function steer(sim, target) {
  const b = sim.ball;
  const R = PHYS.R;
  let tx;
  let tau;
  const via = target.via;
  if (via && !via.taken) {
    const tr = riseTime(b.y, b.vy, via.y);
    const tf = fallTime(b.y, b.vy, via.y);
    tau = tr ?? tf;
    tx = via.x;
    if (tau == null || tau < PHYS.DT) {
      tau = Math.max(PHYS.DT * 4, fallTime(b.y, b.vy, platTop(target.plat, sim.t) + R) ?? 0.3);
    }
  }
  if (tx === undefined) {
    const p = target.plat;
    const top = platTop(p, sim.t) + R;
    tau = fallTime(b.y, b.vy, top);
    if (tau == null) tau = Math.max(0.05, b.vy / PHYS.G); // unreachable: aim anyway
    // aim at where the platform WILL be
    tx = platX(p, sim.t + tau) + (target.offset || 0);
  }
  tx = Math.max(R, Math.min(sim.width - R, tx));
  const need = (tx - b.x) / Math.max(tau, PHYS.DT * 2);
  const eps = PHYS.ACCEL * PHYS.DT * 1.2;
  if (need > b.vx + eps) return 1;
  if (need < b.vx - eps) return -1;
  return 0;
}

/**
 * Run the sim under the bot until the next landing / finish / death.
 * Returns { kind: "land"|"finish"|"dead"|"timeout", platform, inputs }.
 */
export function runBounce(sim, target, maxT = 4, record = null) {
  const end = sim.t + maxT;
  while (sim.t < end) {
    const dir = steer(sim, target);
    sim.setInput(dir);
    if (record) record.push(dir);
    sim.step();
    let out = null;
    for (const e of sim.events) {
      if (e.type === "finish") out = { kind: "finish", platform: e.platform };
      else if (e.type === "land" && !out) out = { kind: "land", platform: e.platform, perfect: e.perfect };
      else if (e.type === "death") out = { kind: "dead", cause: e.cause };
    }
    sim.events.length = 0;
    if (out) return out;
    if (sim.status === "dead") return { kind: "dead" };
  }
  return { kind: "timeout" };
}

const isDynamic = (level) => level.platforms.some((p) => p.move || p.type === "vanish");

/**
 * Search for a route that finishes the level (optionally with all stars),
 * branching at every landing over target platform × aim offset × star
 * waypoint (+ "bounce in place" to wait for movers / vanishers).
 *
 * opts.ctrl < 1 reduces steering authority (accel + max speed) — the level
 * must still be beatable with a handicapped ball, which is the safety margin.
 *
 * Returns { ok, route, time, stars, nodes, inputs }.
 */
export function solve(level, opts = {}) {
  const ctrl = opts.ctrl ?? 1;
  // needStars: true = all stars, or an array of star indices that must be taken
  const needStars = !!opts.needStars;
  const maxNodes = opts.maxNodes ?? 6000;
  const maxTime = opts.maxTime ?? 60; // a route that needs longer than this is not a real route
  const dyn = isDynamic(level);
  const sim = new Sim(level, { ctrl });
  const nStars = sim.stars.length;
  const full = Array.isArray(opts.needStars) ? opts.needStars.reduce((m, i) => m | (1 << i), 0) : (1 << nStars) - 1;
  const starMask = () => sim.stars.reduce((m, s, i) => (s.taken ? m | (1 << i) : m), 0);
  const plats = sim.platforms;
  const byId = new Map(plats.map((p) => [p.id, p]));

  // settle the intro hop onto the start platform
  const firstRec = [];
  const first = runBounce(sim, { plat: plats.find((p) => p.type === "start") || plats[0] }, 4, firstRec);
  if (first.kind !== "land") return { ok: false, reason: "intro hop failed", nodes: 0 };

  const seen = new Set();
  let nodes = 0;
  let reached = null; // highest platform any branch landed on (diagnostics)
  const offsetsFor = (p) => {
    const f = opts.offsets || [0, -0.32, 0.32];
    return f.map((k) => k * p.w);
  };

  // iterative DFS with an explicit stack of { snap, platId, route, inputs }
  const stack = [{ snap: sim.snapshot(), platId: first.platform, parent: null, rec: firstRec }];
  while (stack.length && nodes < maxNodes) {
    const node = stack.pop();
    nodes++;
    sim.restore(node.snap);
    const cur = byId.get(node.platId);
    const mask = starMask();
    const tb = dyn ? Math.round(sim.t / 0.3) % 400 : 0;
    const key = `${node.platId}|${mask}|${tb}|${node.waits || 0}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const curTop = platTop(cur, sim.t);
    if (!reached || curTop > reached.y) reached = { id: cur.id, y: curTop };
    const rise = cur.type === "spring" ? (PHYS.SPRING * PHYS.SPRING) / (2 * PHYS.G) : (PHYS.BOUNCE * PHYS.BOUNCE) / (2 * PHYS.G);
    const cands = [];
    for (const p of plats) {
      if (!LANDABLE.has(p.type) || p.broken) continue;
      if (p.type === "start" && p !== cur) continue;
      const top = platTop(p, sim.t);
      const range = p.move && p.move.axis === "y" ? p.move.amp : 0;
      if (top - range > curTop + rise - 4) continue;
      if (top + range < curTop - 40) continue; // routes climb: no ping-ponging back down
      if (p === cur && (cur.type === "breaking" || (node.waits || 0) >= (dyn ? 5 : 1))) continue;
      cands.push(p);
    }
    // prefer higher targets (DFS pops last → push low first)
    cands.sort((a, b) => platTop(a, sim.t) - platTop(b, sim.t));
    const pending = sim.stars.filter((s, i) => !s.taken && (full >> i) & 1 && s.y > curTop - 60 && s.y < curTop + rise + 40);

    for (const p of cands) {
      const targets = [];
      for (const off of p === cur ? [0] : offsetsFor(p)) targets.push({ plat: p, offset: off });
      if (needStars) for (const s of pending) targets.push({ plat: p, offset: 0, via: s });
      for (const tg of targets) {
        sim.restore(node.snap);
        const rec = [];
        const r = runBounce(sim, tg, 5, rec);
        if (r.kind === "finish") {
          const m = starMask();
          if (!needStars || (m & full) === full) {
            const inputs = [];
            const route = [r.platform];
            for (let n = node; n; n = n.parent) {
              route.unshift(n.platId);
              inputs.unshift(n.rec);
            }
            return { ok: true, route, time: sim.endAt, stars: sim.stats.stars, nodes, inputs: [...inputs.flat(), ...rec] };
          }
          continue;
        }
        if (r.kind !== "land" || sim.t > maxTime) continue;
        // never keep a branch that landed back on the same platform unless waiting was intended
        const waits = r.platform === node.platId ? (node.waits || 0) + 1 : 0;
        if (r.platform === node.platId && p !== cur) continue;
        if (platTop(byId.get(r.platform), sim.t) < curTop - 40) continue;
        stack.push({ snap: sim.snapshot(), platId: r.platform, parent: node, rec, waits });
      }
    }
  }
  return { ok: false, reason: nodes >= maxNodes ? "node budget" : "exhausted", nodes, reached };
}

/** Replay recorded per-step inputs in a fresh sim — proves the route is real. */
export function replay(level, inputs, ctrl = 1) {
  const sim = new Sim(level, { ctrl });
  for (const d of inputs) {
    sim.setInput(d);
    sim.step();
    sim.events.length = 0;
    if (sim.status !== "play") break;
  }
  return sim;
}

export { platSolid };
