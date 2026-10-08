/**
 * Mountain Journey — the route bot. Plays a level through the same input the
 * player uses (camera yaw + stick + jump / interact presses), following the
 * route steps engine/builder.js emitted with every segment. tools/simTest.mjs
 * uses it to prove all 30 levels are completable, every badge reachable and
 * every viewpoint usable, with zero falls; the browser QA uses it too
 * (window.__mj.bot()).
 */
import { STATE } from "./constants.js";
import { wrapAngle } from "./rng.js";

export function createBot(G, opts = {}) {
  const route = G.L.route.slice();
  let i = 0;
  let t = 0; // time in current op
  let phase = 0;
  let lastProgress = { d: Infinity, t: 0 };
  const log = [];
  let failed = null;
  G.opts.noAutoCam = true;
  const objById = new Map();
  for (const k of ["levers", "switches", "gates", "viewpoints", "climbs", "keys"]) for (const o of G.L[k]) objById.set(o.id, o);
  for (const pl of G.platforms) objById.set(pl.id, pl);
  for (const cr of G.crates) objById.set(cr.id, cr);

  const P = G.player;
  const steerTo = (x, z) => {
    G.cam.yaw = Math.atan2(x - P.x, z - P.z);
  };
  const next = () => {
    i++;
    t = 0;
    phase = 0;
    lastProgress = { d: Infinity, t: 0 };
  };
  const fail = (why) => {
    failed = `op ${i} (${route[i]?.op}): ${why} at (${P.x.toFixed(1)}, ${P.y.toFixed(1)}, ${P.z.toFixed(1)}) state ${G.state}`;
  };

  function input(dt) {
    const inp = { mx: 0, mz: 0, run: false, jumpPressed: false, interactPressed: false, lookDX: 0, lookDY: 0 };
    if (failed || G.state === STATE.LEVEL_COMPLETE) return inp;
    if (G.state === STATE.FALLING || G.state === STATE.RESPAWNING) {
      // the bot never expects to fall; note it and carry on from the checkpoint
      if (!log.includes(`fall@${i}`)) log.push(`fall@${i}`);
      // resume from the last route step near the checkpoint
      return inp;
    }
    if (G.state === STATE.VIEWPOINT) return inp;
    const op = route[i];
    if (!op) return inp;
    t += dt;
    const d2 = (x, z) => Math.hypot(x - P.x, z - P.z);
    const progress = (d) => {
      if (d < lastProgress.d - 0.05) lastProgress = { d, t };
      else if (t - lastProgress.t > (opts.stuckTime ?? 5)) fail(`stuck (d=${d.toFixed(2)})`);
    };
    switch (op.op) {
      case "go": {
        if (G.state === STATE.CLIMBING) return inp;
        const d = d2(op.x, op.z);
        if (d < (op.tol ?? 0.6)) {
          next();
          return input(0);
        }
        steerTo(op.x, op.z);
        inp.mz = d < 0.8 && !op.run ? Math.max(0.35, d) : 1;
        inp.run = !!op.run || (opts.run && d > 3);
        progress(d);
        return inp;
      }
      case "jump": {
        const d = d2(op.x, op.z);
        if (phase === 0) {
          steerTo(op.x, op.z);
          inp.mz = 1;
          inp.run = !!op.run;
          // take off once moving (or at an edge)
          const fx = Math.sin(P.facing);
          const fz = Math.cos(P.facing);
          const ahead = G.L.terrain.height(P.x + fx * 0.55, P.z + fz * 0.55);
          const s = G.L.solids.groundAt(P.x + fx * 0.55, P.z + fz * 0.55, P.y + 0.1, 0.45);
          const edge = Math.max(ahead, s ? s.top : -Infinity) < P.y - 0.3;
          if (P.grounded && (P.speed > (op.run ? 6.3 : 3.6) || edge || t > 0.45)) {
            inp.jumpPressed = true;
            phase = 1;
          }
          if (t > 3) fail("never took off");
          return inp;
        }
        if (phase === 1) {
          steerTo(op.x, op.z);
          inp.mz = d > 0.25 ? 1 : 0;
          inp.run = !!op.run;
          if (!P.grounded) phase = 2;
          else if (t > 1) phase = 2;
          return inp;
        }
        if (phase === 2) {
          if (d > 0.3) {
            steerTo(op.x, op.z);
            inp.mz = Math.min(1, d);
          }
          inp.run = !!op.run;
          if (P.grounded) {
            if (op.settle) {
              phase = 3;
              t = 0;
            } else next();
          }
          if (t > 4) fail("jump never landed");
          return inp;
        }
        // settle on a small target
        if (d > 0.25) {
          steerTo(op.x, op.z);
          inp.mz = Math.min(0.5, d);
        }
        if ((P.speed < 0.6 && d < 0.5) || t > 1.2) next();
        return inp;
      }
      case "climb":
      case "ladder": {
        const cl = objById.get(op.id);
        if (phase === 0) {
          if (G.state === STATE.CLIMBING) {
            phase = 1;
            return inp;
          }
          G.cam.yaw = Math.atan2(-cl.nx, -cl.nz);
          inp.mz = 1;
          if (t > 0.4) inp.jumpPressed = true;
          if (t > 4) fail("climb never started");
          return inp;
        }
        if (G.state === STATE.CLIMBING) {
          inp.mz = 1;
          if (t > 12) fail("climb never finished");
          return inp;
        }
        next();
        return input(0);
      }
      case "interact": {
        const o = objById.get(op.id);
        const d = d2(o.x, o.z);
        if (phase === 0) {
          if (d > (o.r ?? 1.6) * 0.65) {
            steerTo(o.x, o.z);
            inp.mz = Math.min(1, d);
            progress(d);
            return inp;
          }
          inp.interactPressed = true;
          phase = 1;
          t = 0;
          return inp;
        }
        if (G.state === STATE.VIEWPOINT) return inp;
        if (t > 0.8) next();
        return inp;
      }
      case "waitFlag": {
        if (G.flags[op.flag]) {
          next();
          return input(0);
        }
        if (t > 20) fail(`flag ${op.flag} never set`);
        return inp;
      }
      case "push": {
        const cr = objById.get(op.id);
        if (G.flags[`crate:${cr.id}`]) {
          next();
          return input(0);
        }
        // line up behind the crate, then walk it home
        const bx = cr.x - cr.dx * (cr.size + 0.6);
        const bz = cr.z - cr.dz * (cr.size + 0.6);
        const lat = (P.x - cr.x) * cr.dz - (P.z - cr.z) * cr.dx;
        if (Math.abs(lat) > 0.3 || d2(bx, bz) > 1.0) {
          steerTo(bx, bz);
          inp.mz = Math.min(1, d2(bx, bz) + 0.2);
        } else {
          G.cam.yaw = Math.atan2(cr.dx, cr.dz) + wrapAngle(Math.atan2(cr.x - P.x, cr.z - P.z) - Math.atan2(cr.dx, cr.dz)) * 0.5;
          inp.mz = 1;
        }
        if (t > 25) fail("crate never reached the plate");
        return inp;
      }
      case "ride": {
        const pl = objById.get(op.id);
        const on = P.groundSolid === pl.solid;
        if (phase === 0) {
          // wait at the edge until the platform rests at our end
          if (pl.f === 0 && !pl.moving && !on) {
            phase = 1;
            t = 0;
          }
          if (t > 15) fail("platform never arrived");
          return inp;
        }
        if (phase === 1) {
          if (!on && pl.f > 0.04 && P.grounded) {
            // it left without us: back to the edge and wait for the next one
            const w = op.wait || route[i - 1];
            if (w && Math.hypot(P.x - w.x, P.z - w.z) > 0.3) {
              steerTo(w.x, w.z);
              inp.mz = Math.min(1, Math.hypot(P.x - w.x, P.z - w.z) + 0.2);
            } else {
              phase = 0;
              t = 0;
            }
            return inp;
          }
          if (on && Math.hypot(P.x - pl.x, P.z - pl.z) < 0.45) {
            phase = 2;
            t = 0;
            return inp;
          }
          steerTo(pl.x, pl.z);
          inp.mz = Math.min(1, Math.hypot(P.x - pl.x, P.z - pl.z) + 0.2);
          if (t > 4) fail("couldn't board the platform");
          return inp;
        }
        if (phase === 2) {
          // ride, holding still in the middle
          const dc = Math.hypot(P.x - pl.x, P.z - pl.z);
          if (dc > 0.35) {
            steerTo(pl.x, pl.z);
            inp.mz = Math.min(0.6, dc);
          }
          if (pl.f === 1 && !pl.moving) {
            phase = 3;
            t = 0;
          }
          if (t > 15) fail("ride never ended");
          return inp;
        }
        const d = d2(op.alight.x, op.alight.z);
        if (d < 0.5) {
          next();
          return input(0);
        }
        steerTo(op.alight.x, op.alight.z);
        inp.mz = 1;
        if (t > 4) fail("couldn't get off the platform");
        return inp;
      }
      default:
        fail(`unknown op ${op.op}`);
        return inp;
    }
  }

  return {
    input,
    get done() {
      return G.state === STATE.LEVEL_COMPLETE;
    },
    get failed() {
      return failed;
    },
    get index() {
      return i;
    },
    log,
    route,
  };
}

/** Plays a level headlessly; returns a report. */
export function runBot(G, opts = {}) {
  const bot = createBot(G, opts);
  const dt = 1 / 120;
  const maxT = opts.maxTime ?? 900;
  let fallsSeen = 0;
  while (!bot.done && !bot.failed && G.time < maxT) {
    const inp = bot.input(dt);
    G.stepN(1, inp);
    G.drain();
    if (G.run.falls > fallsSeen) {
      fallsSeen = G.run.falls;
      if (opts.failOnFall !== false) {
        return { ok: false, why: `fell at route op ${bot.index} (${bot.route[bot.index]?.op}) near (${G.player.x.toFixed(1)}, ${G.player.y.toFixed(1)}, ${G.player.z.toFixed(1)})`, time: G.levelTime, G };
      }
    }
  }
  return {
    ok: bot.done,
    why: bot.failed || (bot.done ? null : "timeout"),
    time: G.levelTime,
    falls: G.run.falls,
    badges: G.collected.size,
    viewpoints: G.viewed.size,
    jumps: G.run.jumps,
    distance: G.run.distance,
    G,
  };
}
