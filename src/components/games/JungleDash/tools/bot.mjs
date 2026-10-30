/**
 * Jungle Dash — route bot. Plays a level through the same input object the
 * keyboard/touch produce ({mx, mz, jump, jumpHeld, spin}), so a bot run
 * exercises the real controller, collisions, platforms, enemies and goal.
 *
 * Route nodes (each finished before the next starts):
 *   [x, z]                         run there
 *   { j: [x, z] }                  run there, jump on arrival (keeps running)
 *   { j: [x, z], hold: 0.2 }       … with a shorter Space press
 *   { wait: s }                    stand still s seconds
 *   { waitMover: i, near: [x, z], r }   stand still until mover i is near a point
 *   { ride: i, until: [x, z], r }  stay centred on mover i until it is near a point
 *   { waitHaz: i, from, to }       wait until timed hazard i's cycle is in [from, to]
 *   { waitFaller: i }              wait until faller i is back in place
 *   { spin: true }                 spin once
 *   { boss: true }                 fight the boss until it is defeated
 * Reactive: spins at enemies, incoming shots and crates within reach.
 *
 * Browser: const {createBot}=await import('/src/components/games/JungleDash/tools/bot.mjs')
 */
import { cycle } from "../engine/game.js";

export function createBot(route, opts = {}) {
  let i = 0, st = 0, held = 0, t = 0;
  const log = opts.log || (() => {});
  const norm = (n) => (Array.isArray(n) ? { p: n } : n);
  const done = () => i >= route.length;
  const next = (g, why) => {
    log(`node ${i} ${why} @ ${g.player.x.toFixed(1)},${g.player.y.toFixed(1)},${g.player.z.toFixed(1)} t=${g.t.toFixed(1)}`);
    i++;
    st = 0;
  };
  const steer = (g, x, z, slow = 0) => {
    const p = g.player;
    const dx = x - p.x, dz = z - p.z;
    const L = Math.hypot(dx, dz);
    if (L < 1e-4) return { mx: 0, mz: 0 };
    const k = slow ? Math.min(1, L / slow) : 1;
    return { mx: (dx / L) * k, mz: (-dz / L) * k };
  };

  const bot = (g, dt = 1 / 60) => {
    t += dt;
    st += dt;
    const p = g.player;
    const out = { mx: 0, mz: 0, jump: false, jumpHeld: held > 0, spin: false };
    if (held > 0) held -= dt;
    if (done() || g.status !== "play") return out;
    const n = norm(route[i]);
    const jumpNow = (h = 0.35) => {
      out.jump = true;
      out.jumpHeld = true;
      held = h;
    };

    // ---- reactive spins
    if (p.spin <= 0 && !n.noSpin) {
      let want = false;
      for (const e of g.enemies) {
        if (!e.alive) continue;
        const d = Math.hypot(e.x - p.x, e.z - p.z);
        if (d < (e.t === "thorn" ? 1.9 : 1.75) && Math.abs(e.y - p.y) < 1.2) want = true;
      }
      for (const s of g.shots) {
        if (s.dead) continue;
        const rx = p.x - s.x, rz = p.z - s.z;
        const d = Math.hypot(rx, rz);
        if (d < 2.0 && rx * s.vx + rz * s.vz > 0 && Math.abs(s.y - (p.y + 0.6)) < 1) want = true;
      }
      if (!opts.noCrates)
        for (const c of g.crates) {
          if (c.broken || (c.type === "b" && !opts.spinBounce)) continue;
          const cx = (c.x0 + c.x1) / 2, cz = (c.z0 + c.z1) / 2, cy = (c.y0 + c.y1) / 2;
          if (Math.hypot(cx - p.x, cz - p.z) < 1.5 && Math.abs(cy - (p.y + 0.6)) < 1.0) want = true;
        }
      if (want) out.spin = true;
    }

    if (n.p) {
      Object.assign(out, steer(g, n.p[0], n.p[1], n.slow));
      if (n.until === "bounce") {
        // hover over a bounce crate until it springs us
        if (st < dt * 1.5) n.b0 = g.stats.bounces;
        out.jumpHeld = true;
        if (g.stats.bounces > n.b0) next(g, "bounced");
        return out;
      }
      if (Math.hypot(n.p[0] - p.x, n.p[1] - p.z) < (n.r ?? 0.5)) next(g, "reached");
      return out;
    }
    if (n.j) {
      Object.assign(out, steer(g, n.j[0], n.j[1]));
      if (Math.hypot(n.j[0] - p.x, n.j[1] - p.z) < (n.r ?? 0.55)) {
        if (p.grounded || p.coyote > 0) {
          jumpNow(n.hold ?? 0.35);
          next(g, "jump");
        }
      }
      return out;
    }
    if (n.wait != null) {
      if (st > n.wait) next(g, "wait");
      return out;
    }
    if (n.waitMover != null) {
      const m = g.movers[n.waitMover];
      const cx = (m.x0 + m.x1) / 2, cz = (m.z0 + m.z1) / 2;
      if (n.hold) Object.assign(out, steer(g, n.hold[0], n.hold[1], 0.6));
      if (Math.hypot(cx - n.near[0], cz - n.near[1]) < (n.r ?? 0.6) && (n.top == null || Math.abs(m.y1 - n.top) < 0.4)) next(g, "mover near");
      return out;
    }
    if (n.ride != null) {
      const m = g.movers[n.ride];
      const cx = (m.x0 + m.x1) / 2 + (n.off?.[0] ?? 0), cz = (m.z0 + m.z1) / 2 + (n.off?.[1] ?? 0);
      Object.assign(out, steer(g, cx, cz, 0.8));
      const mx = (m.x0 + m.x1) / 2, mz = (m.z0 + m.z1) / 2;
      if (p.ground === m && Math.hypot(mx - n.until[0], mz - n.until[1]) < (n.r ?? 0.6)) next(g, "ride done");
      return out;
    }
    if (n.waitHaz != null) {
      const h = g.hazards[n.waitHaz];
      const u = h.t === "crusher" ? ((((g.t + (h.phase || 0) * h.period) % h.period) + h.period) % h.period) / h.period : cycle(h, g.t).u;
      if (n.hold) Object.assign(out, steer(g, n.hold[0], n.hold[1], 0.6));
      if (u >= n.from && u <= n.to) next(g, "hazard window");
      return out;
    }
    if (n.waitSlide != null) {
      // rolling log: wait until it's out at one end of its track
      const h = g.hazards[n.waitSlide];
      const ax = n.axis ?? 0;
      const mid = (h.path[0][ax] + h.path[1][ax]) / 2;
      if (Math.abs(h.pos[ax] - mid) >= n.min) next(g, "slider clear");
      return out;
    }
    if (n.waitFaller != null) {
      if (g.fallers[n.waitFaller].state === "idle") next(g, "faller back");
      return out;
    }
    if (n.spin) {
      out.spin = true;
      next(g, "spin");
      return out;
    }
    if (n.boss) return bossBrain(g, out, () => next(g, "boss down"), jumpNow);
    next(g, "unknown node");
    return out;
  };
  bot.node = () => i;
  bot.done = done;
  return bot;
}

/** boss: keep ~7 m away, jump shockwaves, sidestep boulder targets, avoid the charge lane, spin when it's tired */
function bossBrain(g, out, finish, jumpNow) {
  const B = g.boss;
  const p = g.player;
  if (!B || B.defeated) {
    finish();
    return out;
  }
  const A = B.arena;
  const cx = (A[0] + A[2]) / 2, cz = (A[1] + A[3]) / 2;
  const dx = p.x - B.x, dz = p.z - B.z;
  const d = Math.hypot(dx, dz) || 1;
  let tx, tz;
  if (B.vulnerable && B.inv <= 0) {
    tx = B.x;
    tz = B.z;
    if (d < B.r + 1.6 && p.spin <= 0) out.spin = true;
  } else {
    // orbit at ~7 m on the side of the arena centre
    const ang = Math.atan2(dx, dz) + 0.5;
    tx = B.x + Math.sin(ang) * 7;
    tz = B.z + Math.cos(ang) * 7;
    if (B.state === "chargeTele" || B.state === "charge") {
      // step sideways out of the lane
      const [ux, uz] = B.chargeDir;
      const side = dx * uz - dz * ux >= 0 ? 1 : -1;
      tx = p.x + uz * side * 4;
      tz = p.z - ux * side * 4;
    }
    for (const b of B.boulders) {
      if (b.done) continue;
      const bd = Math.hypot(p.x - b.tx, p.z - b.tz);
      if (bd < 2.4) {
        tx = p.x + ((p.x - b.tx) / (bd || 1)) * 3;
        tz = p.z + ((p.z - b.tz) / (bd || 1)) * 3;
      }
    }
    tx = Math.max(A[0] + 1.5, Math.min(A[2] - 1.5, tx));
    tz = Math.max(A[1] + 1.5, Math.min(A[3] - 1.5, tz));
  }
  for (const r of B.rings) {
    if (r.delay > 0) continue;
    const rd = Math.hypot(p.x - r.x, p.z - r.z);
    if (rd - r.r > 0.5 && rd - r.r < 1.6 && p.grounded) jumpNow(0.3);
  }
  const L = Math.hypot(tx - p.x, tz - p.z);
  if (L > 0.3) {
    out.mx = (tx - p.x) / L;
    out.mz = -(tz - p.z) / L;
  }
  void cx;
  void cz;
  return out;
}
