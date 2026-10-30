/**
 * Route bot — plays a level through the REAL simulation input (world-space
 * stick, jump, attack, sprint) by following the waypoints the level builder
 * recorded. Human-like reflexes: swipes nearby enemies, looks 0.5 s ahead and
 * jumps / waits / backs off when a timed hazard would hit.
 *
 * Used by tools/levelTest.mjs (headless) and by the DEV hook in the browser.
 */
import { anyHazard } from "../engine/hazards.js";
import { PHYS } from "../engine/game.js";

export function createBot(route, opts = {}) {
  let i = 0;
  let st = { phase: 0, t: 0 };
  let cpIdx = 0;
  let stuckT = 0;
  let bestD = Infinity;
  const log = opts.log || (() => {});
  const bot = (g) => {
    const p = g.player;
    const dt = 1 / 60;
    // events of the previous step: checkpoints + respawns rewind the route
    for (const e of g.frameEvents || g.events) {
      if (e.type === "checkpoint") cpIdx = i;
      if (e.type === "respawn") {
        log(`respawn → step ${cpIdx}`);
        i = cpIdx;
        st = { phase: 0, t: 0 };
      }
    }
    if (g.status !== "play") return {};
    const step = route[i];
    if (!step) return {};
    st.t += dt;
    const out = { mx: 0, mz: 0, jump: false, jumpHeld: false, attack: false, sprint: false };
    const next = () => {
      i++;
      st = { phase: 0, t: 0 };
      stuckT = 0;
      bestD = Infinity;
    };
    const steer = (x, z, { brake = false, sprint = false } = {}) => {
      const dx = x - p.x, dz = z - p.z;
      const d = Math.hypot(dx, dz);
      if (d < 1e-3) return d;
      let k = 1;
      if (brake) {
        const ice = p.ground && p.ground.surface === "ice";
        const a = (ice ? PHYS.iceAccel : PHYS.accel) * 0.7;
        const vmax = Math.sqrt(2 * a * Math.max(0, d - 0.05));
        k = Math.min(1, vmax / PHYS.walk);
        // cancel sideways drift on ice
        if (ice) {
          const vx = (dx / d) * vmax - p.vx, vz = (dz / d) * vmax - p.vz;
          const l = Math.hypot(vx, vz) || 1;
          out.mx = vx / l;
          out.mz = vz / l;
          if (d < 0.15 && Math.hypot(p.vx, p.vz) < 0.3) out.mx = out.mz = 0;
          return d;
        }
      }
      out.mx = (dx / d) * k;
      out.mz = (dz / d) * k;
      out.sprint = sprint;
      return d;
    };

    let d = 0;
    switch (step[0]) {
      case "go": {
        const nx = route[i + 1];
        const brake = !nx || nx[0] === "waitm" || nx[0] === "hit" || nx[0] === "boss" || (p.ground && p.ground.surface === "ice");
        d = steer(step[1], step[2], { brake });
        if (d < (brake ? 0.3 : 0.45)) next();
        break;
      }
      case "jump": {
        const [, x, y, z, sprint] = step;
        if (st.phase === 0) {
          d = steer(x, z, { sprint });
          if (p.grounded && !arcSafe(g, p, out)) {
            // a hazard would catch the take-off — hold position a moment
            out.mx = out.mz = 0;
          } else if (p.grounded) {
            out.jump = true;
            out.jumpHeld = true;
            st.phase = 1;
            st.t = 0;
          }
        } else {
          out.jumpHeld = true;
          d = steer(x, z, { sprint, brake: p.grounded });
          if (p.grounded && st.t > 0.1) {
            if (Math.abs(p.y - y) < 0.35) next();
            else if (p.y < y - 0.35) {
              // landed short (lower ledge) — try the jump again
              st.phase = 0;
              log(`step ${i}: short landing at y=${p.y.toFixed(2)} (want ${y})`);
            } else next();
          }
        }
        break;
      }
      case "waitm": {
        const m = g.boxes[step[1]];
        if (Math.abs(m.s - step[2]) < 0.03) next();
        else if (st.hold) steer(st.hold[0], st.hold[1], { brake: true });
        else st.hold = [p.x, p.z];
        break;
      }
      case "ride": {
        const m = g.boxes[step[1]];
        steer((m.x0 + m.x1) / 2, (m.z0 + m.z1) / 2, { brake: true });
        if (p.ground === m && Math.abs(m.s - step[2]) < 0.03) next();
        if (st.t > 1 && p.ground !== m && p.grounded) {
          log(`step ${i}: not on mover`);
          i = Math.max(0, i - 2);
          st = { phase: 0, t: 0 };
        }
        break;
      }
      case "bounce": {
        const [, sx, sz, x, y, z] = step;
        if (st.phase === 0) {
          d = steer(sx, sz);
          if (!p.grounded && p.vy > 10) st.phase = 1;
        } else {
          d = steer(x, z, { sprint: true, brake: p.grounded });
          if (p.grounded && st.t > 0.2) {
            if (Math.abs(p.y - y) < 0.4) next();
            else st.phase = 0;
          }
        }
        break;
      }
      case "hit": {
        const f = g.friend;
        if (!f || f.freed) next();
        else {
          d = Math.hypot(step[1] - p.x, step[2] - p.z);
          if (d > 1.3) steer(step[1], step[2], { brake: true });
          else if (p.attackCd <= 0) out.attack = true;
        }
        break;
      }
      case "boss":
        bossBrain(g, out, steer);
        if (g.boss.state === "gone") next();
        break;
      default:
        next();
    }

    // ---- reflex 1: swipe enemies in reach
    if (p.grounded || step[0] === "boss") {
      for (const e of g.enemies) {
        if (!e.alive) continue;
        const ed = Math.hypot(e.x - p.x, e.z - p.z);
        if (ed < 2.2 && Math.abs(e.y - p.y) < 1) {
          if (p.attackCd <= 0) out.attack = true;
          if (step[0] !== "jump" || st.phase === 0) {
            // stand and fight (face it)
            out.mx = (e.x - p.x) * 0.05;
            out.mz = (e.z - p.z) * 0.05;
            out.jump = false;
          }
          break;
        }
      }
    }

    // ---- reflex 2: look ahead for timed hazards (not while airborne or on movers)
    if (g.hazards.length && p.grounded && !(p.ground && p.ground.m) && step[0] !== "boss") {
      const sp = Math.hypot(out.mx, out.mz) * (out.sprint ? PHYS.run : PHYS.walk);
      const ux = sp > 0 ? out.mx / Math.hypot(out.mx, out.mz) : 0, uz = sp > 0 ? out.mz / Math.hypot(out.mx, out.mz) : 0;
      let firstHit = Infinity;
      const safe = (mode) => {
        for (let tau = 0; tau <= 0.6; tau += 0.05) {
          let x = p.x, z = p.z, y = p.y;
          if (mode === "move" || mode === "jump") {
            x += ux * sp * tau;
            z += uz * sp * tau;
          } else if (mode === "back") {
            x -= ux * 2.5 * tau;
            z -= uz * 2.5 * tau;
          }
          if (mode === "jump") y = Math.max(p.y, p.y + PHYS.jump * tau - 0.5 * PHYS.gravity * tau * tau);
          if (anyHazard(g.hazards, g.t + tau, x, y, z)) {
            if (mode === "move") firstHit = tau;
            return false;
          }
        }
        if (mode === "jump") {
          const T = (2 * PHYS.jump) / PHYS.gravity;
          const lx = p.x + ux * sp * T, lz = p.z + uz * sp * T;
          if (g.groundBelow(lx, lz, p.y + 0.1) < p.y - 0.2) return false;
        }
        return true;
      };
      // static danger far ahead: keep walking until it's time to hop
      const moveOk = safe("move");
      const statik = !moveOk && firstHit > 0.25 && isStatic(g, p.x + ux * sp * firstHit, p.y, p.z + uz * sp * firstHit);
      if (!moveOk && !out.jump && !statik) {
        if (sp > 0.5 && firstHit < 0.3 && safe("jump")) {
          out.jump = true;
          out.jumpHeld = true;
        } else if (safe("stop")) {
          out.mx = out.mz = 0;
          out.jump = false;
        } else if (firstHit < 0.3 && arcSafe(g, p, { mx: 0, mz: 0 })) {
          out.mx = out.mz = 0;
          out.jump = true;
          out.jumpHeld = true;
        } else if (safe("back")) {
          out.mx = -ux * 0.5;
          out.mz = -uz * 0.5;
          out.jump = false;
        }
      }
    }

    // sinking sand: hop out of it
    if (p.grounded && p.ground && p.ground.surface === "sand" && p.sink > 0.35) {
      out.jump = true;
      out.jumpHeld = true;
    }

    // a pressed jump is held for a full-height jump
    if (out.jump) st.holdJ = 0.45;
    if (st.holdJ > 0) {
      out.jumpHeld = true;
      st.holdJ -= dt;
    }

    // stuck watchdog (reported by tests)
    if (d > 0) {
      if (d < bestD - 0.05) {
        bestD = d;
        stuckT = 0;
      } else stuckT += dt;
    }
    bot.stuck = stuckT > 10;
    return out;
  };
  bot.index = () => i;
  bot.done = () => i >= route.length;
  return bot;
}

/** would a full jump with this stick input stay clear of every hazard? */
function arcSafe(g, p, out) {
  if (!g.hazards.length) return true;
  const sp = Math.hypot(out.mx, out.mz) * (out.sprint ? PHYS.run : PHYS.walk);
  const l = Math.hypot(out.mx, out.mz) || 1;
  const T = (2 * PHYS.jump) / PHYS.gravity;
  for (let tau = 0; tau <= T; tau += 0.04) {
    const x = p.x + (out.mx / l) * sp * tau, z = p.z + (out.mz / l) * sp * tau;
    const y = Math.max(p.y - 0.3, p.y + PHYS.jump * tau - 0.5 * PHYS.gravity * tau * tau);
    if (anyHazard(g.hazards, g.t + tau, x, y, z)) return false;
  }
  return true;
}

/** is the hazard at this spot always there (static spikes)? */
function isStatic(g, x, y, z) {
  const h = anyHazard(g.hazards, g.t + 0.6, x, y, z) || anyHazard(g.hazards, g.t, x, y, z);
  return !!h && h.type === "spikes" && !h.period;
}

/** boss fight: dodge every telegraphed attack, swipe him during windows */
function bossBrain(g, out, steer) {
  const B = g.boss, p = g.player, D = B.def;
  const d = Math.hypot(B.x - p.x, B.z - p.z);
  const away = (k = 1) => {
    // move away from the boss, but slide along walls toward the centre
    let ax = p.x - B.x, az = p.z - B.z;
    const l = Math.hypot(ax, az) || 1;
    ax /= l;
    az /= l;
    const cx = D.cx - p.x, cz = D.cz - p.z;
    const nearWall = Math.abs(p.x - D.cx) > D.hs - 2.2 || Math.abs(p.z - D.cz) > D.hs - 2.2;
    if (nearWall) {
      ax = -az + cx * 0.15;
      az = ax * 0 + (p.x - B.x) / l + cz * 0.15;
    }
    steer(p.x + ax * 3 * k, p.z + az * 3 * k);
  };
  switch (B.state) {
    case "sleep":
      steer(D.cx, D.cz - D.hs + 4);
      break;
    case "intro":
    case "recover":
      if (d < 5) away();
      break;
    case "chargeTele":
    case "charge": {
      const L = B.lane || { dx: B.cdx, dz: B.cdz };
      // step sideways out of the lane
      const sx = -L.dz, sz = L.dx;
      const side = (p.x - B.x) * sx + (p.z - B.z) * sz >= 0 ? 1 : -1;
      let tx = p.x + sx * side * 3, tz = p.z + sz * side * 3;
      if (Math.abs(tx - D.cx) > D.hs - 1 || Math.abs(tz - D.cz) > D.hs - 1) {
        tx = p.x - sx * side * 3;
        tz = p.z - sz * side * 3;
      }
      steer(tx, tz, { sprint: true });
      break;
    }
    case "slamTele":
    case "slamAir":
    case "slamLand":
      if (d < 4.5) away();
      break;
    case "rain":
    case "rainTele":
      break;
    default:
      if (B.vulnerable) {
        if (d > B.r + 1) steer(B.x, B.z, { sprint: true });
        if (d < B.r + 1.6 && p.attackCd <= 0) out.attack = true;
      }
  }
  // shockwave: jump when the ring is about to reach us
  if (B.ring && p.grounded) {
    const rd = Math.hypot(p.x - B.ring.x, p.z - B.ring.z);
    const gap = rd - B.ring.r;
    if (gap > 0 && gap < 1.3) {
      out.jump = true;
      out.jumpHeld = true;
    }
  }
  // thorn marks: run to the nearest spot no red circle covers
  const live = B.marks.filter((m) => m.t < 1.3);
  const covered = (x, z, pad) => live.some((m) => Math.hypot(x - m.x, z - m.z) < m.r + pad);
  if (live.length && covered(p.x, p.z, 0.8)) {
    let best = null, bd = Infinity;
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      for (const r of [1.2, 2, 3, 4]) {
        const x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r;
        if (Math.abs(x - D.cx) > D.hs - 1.2 || Math.abs(z - D.cz) > D.hs - 1.2) continue;
        if (covered(x, z, 0.9) || Math.hypot(x - B.x, z - B.z) < B.r + 1.2) continue;
        // the straight path there must not cross a circle that lands soon
        let crosses = false;
        for (let s = 0.25; s < 1; s += 0.25) if (live.some((m) => m.t > 0.6 && Math.hypot(p.x + (x - p.x) * s - m.x, p.z + (z - p.z) * s - m.z) < m.r + 0.4)) crosses = true;
        const cost = r + (crosses ? 3 : 0);
        if (cost < bd) {
          bd = cost;
          best = [x, z];
        }
        break;
      }
    }
    if (best) steer(best[0], best[1], { sprint: true });
    out.attack = false;
  }
}
