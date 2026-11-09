/**
 * Route bot — plays a level through the real simulation with the same inputs
 * a player sends (move, yaw/pitch, E). A route is a list of steps:
 *   ["use", entId, times?]      walk next to the device, look at it, press E
 *   ["push", blockId, dir, n?]  stand behind the block and push it `n` cells
 *   ["go", c, r]                walk to a cell
 *   ["wait", seconds]
 *   ["exit"]                    walk onto the exit
 * Navigation is Dijkstra over the cells that are safe right now; it waits for
 * spikes and blades to give a window before stepping into them and never
 * pauses on crumbling stone. Used by tools/levelTest.mjs and the browser
 * harness (tools/harness.mjs).
 */
import { CELL, DIRS, cellCenter } from "../engine/constants.js";
import { SIZE } from "../engine/sim.js";

const STEP = 1 / 60;

export function createBot(route, opts = {}) {
  const state = { i: 0, done: false, failed: false, reason: "", path: null, goalKey: "", waitT: 0, aimT: 0, uses: 0, stuck: 0, lastPos: null, log: [] };
  const run = opts.run ?? true;

  function passable(sim, c, r, { allowExit = false } = {}) {
    const k = sim.tileKind(c, r);
    if (k === "exit") return allowExit;
    if (k === "floor" || k === "crumble") {
      /* ok */
    } else if (k === "spikes") {
      const t = sim.tileAt(c, r);
      if (t.mode === "static" && sim.spikeLevel(t) > 0) return false;
    } else return false;
    const e = sim.solidEntAt(c, r);
    if (e) return false;
    return true;
  }
  const cost = (sim, c, r) => {
    const t = sim.tileAt(c, r);
    if (t.t === "spikes" && t.mode !== "static") return 4;
    if (t.t === "crumble") return 3;
    return 1;
  };

  function findPath(sim, goals, allowExit) {
    const [sc, sr] = sim.playerCell();
    const key = (c, r) => r * sim.W + c;
    const dist = new Map([[key(sc, sr), 0]]);
    const prev = new Map();
    const open = [[0, sc, sr]];
    const goalSet = new Set(goals.map(([c, r]) => key(c, r)));
    while (open.length) {
      open.sort((a, b) => a[0] - b[0]);
      const [d, c, r] = open.shift();
      if (d > (dist.get(key(c, r)) ?? Infinity)) continue;
      if (goalSet.has(key(c, r))) {
        const path = [[c, r]];
        let k = key(c, r);
        while (prev.has(k)) {
          k = prev.get(k);
          path.unshift([k % sim.W, Math.floor(k / sim.W)]);
        }
        return path;
      }
      for (const [dc, dr] of Object.values(DIRS)) {
        const nc = c + dc,
          nr = r + dr;
        if (!passable(sim, nc, nr, { allowExit: allowExit && goalSet.has(key(nc, nr)) })) continue;
        const nd = d + cost(sim, nc, nr);
        if (nd < (dist.get(key(nc, nr)) ?? Infinity)) {
          dist.set(key(nc, nr), nd);
          prev.set(key(nc, nr), key(c, r));
          open.push([nd, nc, nr]);
        }
      }
    }
    return null;
  }

  /** Is it safe to walk the hazard run starting at path[idx] right now? */
  function windowOpen(sim, path, idx) {
    const sp = (run ? 5.8 : 3.4) * 0.92;
    // include every consecutive hazard cell ahead
    let j = idx;
    while (j < path.length) {
      const t = sim.tileAt(...path[j]);
      if (!(t.t === "spikes" && t.mode !== "static")) break;
      j++;
    }
    for (let i = idx; i < Math.max(j, idx + 1); i++) {
      const t = sim.tileAt(...path[i]);
      const enter = ((i - idx) * CELL) / sp;
      const leave = enter + (CELL * 1.0) / sp + 0.3;
      if (t.t === "spikes" && t.mode !== "static") {
        for (let s = Math.max(0, enter - 0.3); s <= leave; s += 0.04) if (spikeAt(sim, t, sim.t + s) > 0.3) return false;
      }
    }
    // blades / boulders near the next two cells
    for (const e of sim.ents) {
      if (e.t !== "mover") continue;
      for (let i = idx; i < Math.min(path.length, idx + 2); i++) {
        const [x, z] = cellCenter(...path[i]);
        const enter = ((i - idx) * CELL) / sp;
        for (let s = Math.max(0, enter - 0.25); s <= enter + 0.7; s += 0.05) {
          const p = moverAt(sim, e, s);
          const rad = (e.kind === "boulder" ? 1.05 : 0.8) + 0.65;
          if (Math.hypot(p[0] - x, p[1] - z) < rad) return false;
        }
      }
    }
    return true;
  }
  function spikeAt(sim, t, time) {
    if (t.off && sim.sigs[t.off]) return 0;
    const p = (((time + t.phase) % t.period) + t.period) % t.period;
    return p < t.up ? 1 : 0;
  }
  function moverAt(sim, e, ahead) {
    const mt = e.stopped ? e.mt : e.mt + ahead;
    const [ax, az] = cellCenter(...e.from);
    const [bx, bz] = cellCenter(...e.to);
    const u = 0.5 - 0.5 * Math.cos(((mt + (e.phase || 0)) / e.period) * Math.PI * 2);
    return [ax + (bx - ax) * u, az + (bz - az) * u];
  }

  function standCells(sim, e) {
    if (e.wall) return [[e.c, e.r]];
    const out = [];
    for (const [dc, dr] of Object.values(DIRS)) if (passable(sim, e.c + dc, e.r + dr)) out.push([e.c + dc, e.r + dr]);
    return out;
  }

  function fail(reason) {
    state.failed = true;
    state.reason = reason;
    return {};
  }

  /** Walk toward `goals`; returns an input, or null once standing on a goal centre. */
  function walk(sim, goals, allowExit = false) {
    const p = sim.player;
    const [pc, pr] = sim.playerCell();
    const gk = goals.map((g) => g.join(",")).join(";");
    const atGoal = goals.some(([c, r]) => c === pc && r === pr);
    if (atGoal) {
      const [x, z] = cellCenter(pc, pr);
      if (Math.hypot(p.x - x, p.z - z) < 0.18 && Math.hypot(p.vx, p.vz) < 0.6) return null;
      return steer(sim, x, z, false);
    }
    // re-plan every cell (doors and hazards change)
    const path = findPath(sim, goals, allowExit);
    if (!path) {
      state.waitT += STEP;
      if (state.waitT > 25) return fail(`no path to ${gk}`);
      return {};
    }
    state.waitT = 0;
    // path[0] is the current cell; next
    const idx = 1;
    const next = path[idx];
    const curT = sim.tileAt(pc, pr);
    const hazardNext = (() => {
      const t = sim.tileAt(...next);
      return (t.t === "spikes" && t.mode !== "static") || sim.ents.some((e) => e.t === "mover");
    })();
    if (hazardNext && !(curT.t === "spikes" && curT.mode !== "static") && curT.t !== "crumble") {
      if (!windowOpen(sim, path, idx)) {
        const [x, z] = cellCenter(pc, pr);
        return steer(sim, x, z, false, true);
      }
    }
    const [x, z] = cellCenter(...next);
    return steer(sim, x, z, true);
  }

  function steer(sim, x, z, fast, hold = false) {
    const p = sim.player;
    const dx = x - p.x,
      dz = z - p.z;
    const d = Math.hypot(dx, dz);
    if (hold && d < 0.12) return { mx: 0, mz: 0 };
    const yaw = Math.atan2(-dx, -dz);
    const onTrapField = sim.L.map.some((row) => row.includes("~"));
    return { setYaw: yaw, setPitch: 0, mz: d > 0.05 ? Math.min(1, d * 3 + 0.25) : 0, mx: 0, run: fast && run && !onTrapField && d > 0.5 };
  }

  function aim(sim, e) {
    const b = sim.entBox(e);
    const [ex, ey, ez] = sim.eye();
    const dx = b.c[0] - ex,
      dy = b.c[1] - ey,
      dz = b.c[2] - ez;
    return { setYaw: Math.atan2(-dx, -dz), setPitch: Math.atan2(dy, Math.hypot(dx, dz)), mx: 0, mz: 0 };
  }

  function tick(sim) {
    if (state.done || state.failed) return {};
    if (sim.state === "dying") return {};
    if (sim.state === "complete") {
      state.done = true;
      return {};
    }
    const step = opts.route ? opts.route[state.i] : route[state.i];
    if (!step) return fail("route ended before the exit");
    const [kind, a, b, c] = step;
    switch (kind) {
      case "wait": {
        state.aimT += STEP;
        if (state.aimT >= a) {
          state.aimT = 0;
          state.i++;
        }
        return {};
      }
      case "go": {
        const inp = walk(sim, [[a, b]]);
        if (inp === null) {
          state.i++;
          return {};
        }
        return inp;
      }
      case "exit": {
        const goals = [];
        for (const t of sim.tiles) if (t.t === "exit") goals.push([t.c, t.r]);
        const inp = walk(sim, goals, true);
        return inp === null ? {} : inp;
      }
      case "use":
      case "push": {
        const e = sim.byId[a];
        if (!e) return fail(`no entity ${a}`);
        const times = kind === "use" ? b ?? 1 : c ?? 1;
        if (state.uses >= times) {
          state.uses = 0;
          state.aimT = 0;
          state.i++;
          return {};
        }
        let goals;
        if (kind === "push") {
          const [dc, dr] = DIRS[b];
          goals = [[e.c - dc, e.r - dr]];
        } else goals = standCells(sim, e);
        if (!goals.length) {
          state.waitT += STEP;
          if (state.waitT > 25) return fail(`nowhere to stand for ${a}`);
          return {};
        }
        const inp = walk(sim, goals);
        if (inp !== null) {
          state.aimT = 0;
          return inp;
        }
        if (e.t === "block" && e.slide < 1) return {};
        state.aimT += STEP;
        const look = aim(sim, e);
        if (state.aimT < 3 * STEP) return look;
        if (sim.focus?.ent !== e) {
          if (state.aimT > 1) return fail(`cannot focus ${a} (focus: ${sim.focus?.ent?.id ?? "none"})`);
          return look;
        }
        if (state.aimT < 0.12) return look; // a short beat between presses
        state.aimT = 0;
        state.uses++;
        return { ...look, use: true };
      }
      default:
        return fail(`bad step ${kind}`);
    }
  }
  tick.state = state;
  return tick;
}

/** Run a route headlessly. Returns { done, failed, reason, t, deaths, step }. */
export function runRoute(sim, route, { maxTime = 900, onEvent } = {}) {
  const bot = createBot(route);
  let t = 0;
  while (t < maxTime && !bot.state.done && !bot.state.failed) {
    const inp = bot(sim);
    sim.update(STEP, inp);
    if (onEvent) for (const e of sim.events) onEvent(e, sim);
    sim.events.length = 0;
    t += STEP;
    if (sim.state === "complete") bot.state.done = true;
  }
  return { done: bot.state.done, failed: bot.state.failed, reason: bot.state.reason || (bot.state.done ? "" : "timeout"), t: sim.t, deaths: sim.stats.deaths, step: bot.state.i };
}

export { SIZE };
