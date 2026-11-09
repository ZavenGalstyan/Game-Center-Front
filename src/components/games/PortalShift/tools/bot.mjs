/**
 * Portal Shift — route bot. Turns a level's scripted route (tools/routes.mjs)
 * into per-frame input for the real simulation: the same input object the
 * keyboard/mouse produce (move axes, absolute view, fire, use, jump). So a
 * route finishing a level proves that level solvable with the shipped rules.
 *
 *   const bot = createBot(route);  each frame: sim.update(dt, bot(sim));
 *   bot.state → { done, failed, step, reason }
 */
const CELL = 2;
export const c = (i) => i * CELL + 1; // cell centre, world metres

function aimAt(sim, p) {
  const e = sim.eye();
  const dx = p[0] - e[0], dy = p[1] - e[1], dz = p[2] - e[2];
  return { yaw: Math.atan2(-dx, -dz), pitch: Math.atan2(dy, Math.hypot(dx, dz)) };
}

function faceCenter(cell, face) {
  const n = { px: [1, 0, 0], nx: [-1, 0, 0], py: [0, 1, 0], ny: [0, -1, 0], pz: [0, 0, 1], nz: [0, 0, -1] }[face];
  return [c(cell[0]) + n[0] * 1, c(cell[1]) + n[1] * 1, c(cell[2]) + n[2] * 1].map((v, a) => v + n[a] * 0.0);
}

export function createBot(route, opts = {}) {
  const st = { step: 0, done: false, failed: false, reason: "", t: 0, sub: {} };
  const log = opts.log || (() => {});

  function fail(reason) {
    st.failed = true;
    st.reason = `step ${st.step} ${JSON.stringify(route[st.step])}: ${reason}`;
  }
  function next() {
    st.step++;
    st.t = 0;
    st.sub = {};
  }

  const bot = (sim) => {
    const input = {};
    if (st.done || st.failed) return input;
    if (sim.state === "complete") {
      st.done = true;
      return input;
    }
    if (st.step >= route.length) {
      st.t += 1 / 60;
      if (st.t > 6) fail("route ended without completing");
      return input;
    }
    const op = route[st.step];
    const [kind] = op;
    st.t += 1 / 60;
    const P = sim.player;
    const timeout = (s) => {
      if (st.t > s) fail("timeout");
    };
    switch (kind) {
      case "go":
      case "run": {
        // ['go', x, z, tol=0.3, {jump:true}]
        const [, x, z, tol = 0.3, o = {}] = op;
        const dx = x - P.pos[0], dz = z - P.pos[2];
        const d = Math.hypot(dx, dz);
        if (d < tol) {
          next();
          return input;
        }
        input.yaw = Math.atan2(-dx, -dz);
        input.pitch = o.pitch ?? 0;
        input.mz = d < 0.6 && !o.fast ? Math.max(0.35, d / 0.6) : 1;
        if (o.jump && P.wasGrounded && st.t < 0.1) input.jump = true;
        if (o.jumpAt !== undefined && P.wasGrounded && d <= o.jumpAt) input.jump = true;
        // stuck?
        st.sub.hist = st.sub.hist || [];
        st.sub.hist.push(d);
        if (st.sub.hist.length > 150 && st.sub.hist[st.sub.hist.length - 150] - d < 0.2) fail(`stuck at ${P.pos.map((v) => v.toFixed(2))} (dist ${d.toFixed(2)})`);
        timeout(o.timeout || 25);
        return input;
      }
      case "steer": {
        // ['steer', x, z, until(sim), timeout] — hold position over (x, z) (air control) until a condition
        const [, x, z, fn, tmo = 6] = op;
        if (fn(sim)) {
          next();
          return input;
        }
        const dv = [(x - P.pos[0]) * 3 - P.vel[0], (z - P.pos[2]) * 3 - P.vel[2]];
        const m = Math.hypot(dv[0], dv[1]);
        if (m > 0.05) {
          input.yaw = Math.atan2(-dv[0], -dv[1]);
          input.mz = Math.min(1, m / 2);
        }
        input.pitch = -1.2;
        timeout(tmo);
        return input;
      }
      case "jump": {
        if (P.wasGrounded) {
          input.jump = true;
          next();
        } else timeout(3);
        return input;
      }
      case "face": {
        const [, x, z] = op;
        input.yaw = Math.atan2(-(x - P.pos[0]), -(z - P.pos[2]));
        input.pitch = 0;
        next();
        return input;
      }
      case "aim": {
        const [, p] = op;
        Object.assign(input, aimAt(sim, p));
        next();
        return input;
      }
      case "shoot": {
        // ['shoot', 'blue', cell, face] — aims at the face centre (slightly off the edge) and fires
        const [, color, cell, face, off = [0, 0, 0]] = op;
        if (!st.sub.fired) {
          const p = faceCenter(cell, face).map((v, a) => v + off[a]);
          Object.assign(input, aimAt(sim, p));
          input.fire = color;
          st.sub.fired = true;
          st.sub.cell = cell;
          return input;
        }
        const pt = sim.portals[color];
        if (!pt || pt.cell.join() !== cell.join()) {
          const ev = sim.events.find((e) => e.type === "portalFail");
          fail(`portal not placed${ev ? ` (${ev.reason})` : ""} — portal now ${pt ? pt.cell.join() : "none"}`);
          return input;
        }
        next();
        return input;
      }
      case "enter": {
        // walk into a wall portal (or drop into a floor portal) until teleported
        const [, color, o = {}] = op;
        const p = sim.portals[color];
        if (!p) return fail("no portal"), input;
        if (st.sub.tp0 === undefined) st.sub.tp0 = sim.stats.teleports;
        if (sim.stats.teleports > st.sub.tp0) {
          next();
          return input;
        }
        const tgt = [p.center[0] - p.n[0] * 1.2, p.center[2] - p.n[2] * 1.2];
        const dx = tgt[0] - P.pos[0], dz = tgt[1] - P.pos[2];
        input.yaw = Math.atan2(-dx, -dz);
        input.pitch = 0;
        input.mz = Math.hypot(dx, dz) > 0.15 ? 1 : 0;
        if (o.jump && P.wasGrounded) input.jump = true;
        timeout(o.timeout || 20);
        return input;
      }
      case "grab": {
        // ['grab', cubeIndex]
        const [, n = 0] = op;
        const cube = sim.cubes[n];
        if (sim.held === cube) {
          next();
          return input;
        }
        if (st.sub.tries > 5) return fail("could not pick up cube"), input;
        const ctr = [cube.body.pos[0], cube.body.pos[1] + 0.4, cube.body.pos[2]];
        const hd = Math.hypot(ctr[0] - P.pos[0], ctr[2] - P.pos[2]);
        if (hd > 1.75 || Math.abs(ctr[1] - P.pos[1]) > 1.6) {
          input.yaw = Math.atan2(-(ctr[0] - P.pos[0]), -(ctr[2] - P.pos[2]));
          input.mz = 1;
          timeout(12);
          return input;
        }
        Object.assign(input, aimAt(sim, ctr));
        st.sub.tries = (st.sub.tries || 0) + 1;
        if (st.sub.tries % 2 === 1) input.use = true;
        return input;
      }
      case "place": {
        // ['place', x, z, {from:[x,z]}] — carry the held cube so it lands at (x, z), then drop it
        const [, x, z, o = {}] = op;
        if (!sim.held) return fail("not holding a cube"), input;
        if (!st.sub.stand) {
          const fx = o.from ? o.from[0] : P.pos[0], fz = o.from ? o.from[1] : P.pos[2];
          const dx = x - fx, dz = z - fz, d = Math.hypot(dx, dz) || 1;
          st.sub.stand = [x - (dx / d) * 1.62, z - (dz / d) * 1.62];
        }
        const [sx, sz] = st.sub.stand;
        const dx = sx - P.pos[0], dz = sz - P.pos[2], d = Math.hypot(dx, dz);
        if (d > 0.08 && !st.sub.arrived) {
          input.yaw = Math.atan2(-dx, -dz);
          input.mz = d < 0.6 ? Math.max(0.25, d / 0.6) : 1;
          timeout(o.timeout || 20);
          return input;
        }
        st.sub.arrived = true;
        input.yaw = Math.atan2(-(x - P.pos[0]), -(z - P.pos[2]));
        input.pitch = 0;
        st.sub.settle = (st.sub.settle || 0) + 1;
        if (st.sub.settle > 12) {
          input.use = true;
          next();
        }
        return input;
      }
      case "drop": {
        if (!sim.held) {
          next();
          return input;
        }
        if (op[1] !== undefined) input.pitch = op[1];
        input.use = true;
        return input;
      }
      case "press": {
        const [, n = 0] = op;
        const s = sim.switches[n];
        Object.assign(input, aimAt(sim, [s.pos[0], s.pos[1] + 1.0, s.pos[2]]));
        input.use = true;
        next();
        return input;
      }
      case "wait": {
        if (st.t >= op[1]) next();
        return input;
      }
      case "until": {
        const [, fn, tmo = 15, hold = {}] = op;
        if (fn(sim)) next();
        else {
          Object.assign(input, hold);
          timeout(tmo);
        }
        return input;
      }
      case "move": {
        // raw input for a duration: ['move', seconds, {mz, mx, yaw, pitch, jump}]
        const [, secs, inp] = op;
        Object.assign(input, inp);
        if (st.t >= secs) next();
        return input;
      }
      case "look": {
        input.yaw = (op[1] * Math.PI) / 180;
        input.pitch = ((op[2] || 0) * Math.PI) / 180;
        next();
        return input;
      }
      case "log": {
        log(op[1], sim);
        next();
        return input;
      }
      default:
        fail(`unknown op ${kind}`);
        return input;
    }
  };
  bot.state = st;
  return bot;
}

/** Run a level headlessly with its route. */
export function runRoute(createSim, level, route, { dt = 1 / 60, maxT = 300, trace = false } = {}) {
  const sim = createSim(level);
  const bot = createBot(route, { log: (m, s) => trace && console.log("   ", m, s.player.pos.map((v) => v.toFixed(2)).join(",")) });
  let frames = 0;
  let lastStep = -1;
  while (sim.t < maxT) {
    const inp = bot(sim);
    sim.events = [];
    if (trace && bot.state.step !== lastStep) {
      lastStep = bot.state.step;
      console.log(`  t=${sim.t.toFixed(2)} step ${lastStep} ${JSON.stringify(route[lastStep] || "end").slice(0, 70)} pos=${sim.player.pos.map((v) => v.toFixed(2)).join(",")}`);
    }
    if (bot.state.done || bot.state.failed) break;
    sim.update(dt, inp);
    frames++;
  }
  return { ok: bot.state.done, reason: bot.state.failed ? bot.state.reason : bot.state.done ? "" : "time limit", t: sim.t, sim, frames };
}
