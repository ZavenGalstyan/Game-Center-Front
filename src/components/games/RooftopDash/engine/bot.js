/**
 * Rooftop Dash — route bot. Plays a level through the SAME input path a
 * player uses (raw axes + key edges, camera yaw), following the route nodes
 * the level kit records. Used by:
 *   - tools/levelBot.mjs — proves every level is completable (safe route) and
 *     every star reachable (stars route), headless in Node;
 *   - the DEV test hooks — drives the real game in the browser for visual QA.
 *
 * It never teleports or touches engine state: if the bot can do it, the
 * moves exist for a human too.
 */
import { STATES as S } from "./config.js";
import { hazardPhase, moverOffset } from "./world.js";

export function createBot(level, mode = "safe") {
  const nodes = level.route.filter((n) => !n.only || n.only === mode);
  return { nodes, i: 0, mode, phase: "run", t: 0, act: null, jumpHold: 0, slideHold: 0, cpI: 0, stuckT: 0, best: 0, done: false, fails: 0, log: [], lastEdge: null, wj: false, dashed: false };
}

const dist2 = (ax, az, bx, bz) => (ax - bx) * (ax - bx) + (az - bz) * (az - bz);

function hazardSafe(W, idx) {
  const h = W.hazards[idx];
  if (!h) return true;
  if (h.type === "hook") {
    // predict where the hook will be while we run past (≈0.3–1.1 s from now)
    for (let dt = 0.2; dt <= 1.2; dt += 0.1) {
      const ph = ((W.clock + dt + (h.phase || 0) * h.period) % h.period) / h.period;
      const a = Math.sin(ph * Math.PI * 2) * h.amp;
      if (Math.abs(Math.sin(a) * h.len) < 1.6) return false;
    }
    return true;
  }
  if (h.type === "fan") return true;
  // steam / zap: go right after a burst ends
  const st = hazardPhase(h, W.clock);
  const onFrac = h.onFrac || 0.38;
  return !st.on && !st.warn && st.ph < 1 - onFrac - 0.18 - 0.32;
}

function moverReady(W, n) {
  const m = W.movers[n.waitMover];
  if (!m) return true;
  const out = [0, 0, 0];
  // where will the platform be when we land (~lead seconds)?
  moverOffset(m, W.clock + (n.lead ?? 0.45), out);
  const cx = (m.base.min[0] + m.base.max[0]) / 2 + out[0];
  const cz = (m.base.min[2] + m.base.max[2]) / 2 + out[2];
  const cy = m.base.max[1] + out[1];
  const tol = n.tol ?? 0.9;
  const ok = dist2(cx, cz, n.mx, n.mz) < tol * tol && (n.my == null || Math.abs(cy - n.my) < (n.ytol ?? 0.6));
  return ok;
}

/**
 * Returns { yaw, ax, ay, sprint, jumpHeld, slideHeld, edges }.
 * `events` = this frame's world events (for respawn / checkpoint bookkeeping).
 */
export function botInput(B, W, dt, events = []) {
  const P = W.player;
  const out = { yaw: W.camYaw, ax: 0, ay: 0, sprint: false, jumpHeld: false, slideHeld: false, edges: {} };
  for (const e of events) {
    if (e.type === "checkpoint") B.cpI = B.i;
    if (e.type === "respawn") {
      B.i = B.cpI;
      B.phase = "run";
      B.act = null;
      B.fails++;
      B.log.push(`respawn → node ${B.i}`);
    }
    if (e.type === "finish") B.done = true;
  }
  if (B.done || P.state === S.FINISHED || P.state === S.FALLING_OUT || P.state === S.RESPAWN) return out;
  if (B.i >= B.nodes.length) {
    B.done = true;
    return out;
  }
  B.t += dt;
  if (B.jumpHold > 0) {
    B.jumpHold -= dt;
    out.jumpHeld = true;
  }
  if (B.slideHold > 0) {
    B.slideHold -= dt;
    out.slideHeld = true;
  }

  // progress / stuck detection
  if (B.i > B.best) {
    B.best = B.i;
    B.stuckT = 0;
  } else B.stuckT += dt;

  const N = B.nodes[B.i];
  const dx = N.x - P.x;
  const dz = N.z - P.z;
  const d = Math.hypot(dx, dz);
  const yawTo = Math.atan2(dx, dz);

  /* ---------------- an action in progress (airborne after a take-off) */
  if (B.phase === "act") {
    const A = B.act;
    A.t += dt;
    const next = B.nodes[B.i];
    const tdx = next.x - P.x;
    const tdz = next.z - P.z;
    out.yaw = Math.atan2(tdx, tdz);
    // once the landing point is behind us, keep flying along the take-off heading (no mid-air braking)
    if (tdx * A.fx + tdz * A.fz < 0) out.yaw = Math.atan2(A.fx, A.fz);
    out.ay = 1;
    out.sprint = A.sprint;
    if (A.how === "wallrun") {
      // run along the take-off heading; lean toward the wall until we catch it
      out.yaw = Math.atan2(A.fx, A.fz);
      if (P.state !== S.WALLRUN && !A.onWall && A.t < 0.7) out.ax = A.side === "left" ? -0.42 : 0.42;
      if (P.state === S.WALLRUN) A.onWall = true;
      if (A.onWall && A.wjAt != null && !A.wj && P.state === S.WALLRUN) {
        const along = (P.x - A.x0) * A.fx + (P.z - A.z0) * A.fz;
        if (along >= A.wjAt) {
          out.edges.jump = true;
          out.jumpHeld = true;
          B.jumpHold = 0.3;
          A.wj = true;
        }
      }
      if (A.wj && P.state !== S.WALLRUN) out.yaw = Math.atan2(tdx, tdz);
      if (A.onWall && P.state !== S.WALLRUN && A.wjAt == null) out.yaw = Math.atan2(tdx, tdz);
    }
    if (A.how === "dashJump" && !A.dashed && A.t >= (A.dashAt ?? 0.3)) {
      out.edges.dash = true;
      A.dashed = true;
    }
    if (A.how === "climb" && P.state === S.LEDGE) A.grabbed = true;
    // done when we're back on the ground (or hanging → climbing finishes on the ground)
    if (A.t > 0.08 && (P.state === S.GROUND || P.state === S.SLIDE || P.state === S.CROUCH) && P.grounded) {
      B.phase = "run";
      B.act = null;
    }
    return out;
  }

  /* ---------------- riding: get to the platform's centre, then stand still until it arrives */
  if (N.hold) {
    const m = W.movers[N.waitMover];
    const b = m.box;
    const cx = (b.min[0] + b.max[0]) / 2;
    const cz = (b.min[2] + b.max[2]) / 2;
    const dd = Math.hypot(cx - P.x, cz - P.z);
    if (moverReady(W, N) && P.grounded) {
      B.i++;
      B.onboard = false;
      return out;
    }
    if (!B.onboard && dd > 0.45) {
      out.yaw = Math.atan2(cx - P.x, cz - P.z);
      out.ay = dd > 1.5 ? 0.6 : 0.3;
      return out;
    }
    B.onboard = true;
    out.yaw = Math.atan2(N.fx, N.fz);
    // drift back to the centre if the ride carried us off it
    if (dd > 0.7) {
      out.yaw = Math.atan2(cx - P.x, cz - P.z);
      out.ay = 0.45;
    }
    return out;
  }

  /* ---------------- waits */
  if (N.waitHazard != null && d < 1.2 && !hazardSafe(W, N.waitHazard)) {
    out.yaw = yawTo;
    return out; // stand still
  }
  if (N.waitMover != null && d < 1.0) {
    if (!moverReady(W, N)) {
      out.yaw = Math.atan2(N.fx, N.fz);
      if (d > 0.25) {
        out.yaw = yawTo;
        out.ay = Math.min(1, d);
      }
      return out;
    }
  }

  /* ---------------- run toward the node */
  out.yaw = yawTo;
  out.ay = 1;
  out.sprint = !!N.sprint || (B.nodes[B.i + 1] && !!B.nodes[B.i + 1].sprint && !!N.act);
  if (N.slow) out.ay = N.slow;
  // passed the node's plane (along its heading) or close enough
  const passed = (P.x - N.x) * (N.fx || 0) + (P.z - N.z) * (N.fz || 0) > -0.05 && d < 3.5;
  const reached = d < (N.act ? 0.45 : N.land ? 1.4 : 0.8) || (passed && (N.act || N.land || N.pass));
  if (!reached) return out;

  // node reached
  if (N.slide && !(P.grounded && (P.state === S.GROUND || P.state === S.SLIDE))) return out; // slide needs the ground
  if (N.slide) {
    out.edges.slide = true;
    out.slideHeld = true;
    B.slideHold = 0.75;
  }
  if (N.waitHazard != null && !hazardSafe(W, N.waitHazard)) return out;
  if (N.waitMover != null && !moverReady(W, N)) return out;
  if (N.act && N.act !== "walk") {
    const how = N.act;
    out.edges.jump = true;
    out.jumpHeld = true;
    B.jumpHold = how === "hop" ? 0.05 : 0.5;
    B.act = { how, t: 0, sprint: !!N.sprint, side: N.side, wjAt: N.wjAt, dashAt: N.dashAt, fx: N.fx, fz: N.fz, x0: P.x, z0: P.z, onWall: false, wj: false, dashed: false };
    B.phase = "act";
    out.yaw = Math.atan2(N.fx, N.fz);
    if (N.steer) out.ax = N.steer;
  }
  if (N.dash) out.edges.dash = true;
  B.i++;
  return out;
}
