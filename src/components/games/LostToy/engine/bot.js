/**
 * Lost Toy — route bot. Plays a level through the SAME raw input a player
 * produces (stick axes + jump/interact edges + camera yaw), following the
 * route nodes the level authors with K.go(). It never teleports or writes
 * engine state, so if the bot can finish, the moves exist for a human.
 *
 * Node options:
 *   jump: true      press jump when within `jd` of the node (default 1.5)
 *   hold: true      keep jump held while airborne (full jumps / big bounces)
 *   sprint: true    hold Shift on the way
 *   r: 0.35         arrival radius
 *   y: number       arrival also requires standing within 0.25 of this height
 *   interact: true  press E on arrival
 *   wait: seconds   stand still on arrival
 *   waitMover: { i, axis:0|2|1, at, tol }  wait (standing) until mover i's
 *                   offset on that axis is within tol of `at`, then continue
 *   only: "buttons" node is only part of the all-buttons route
 */
import { STATES as S } from "./config.js";
import { hazardPhase } from "./world.js";

export function createBot(level, mode = "main") {
  const nodes = (level.route || []).filter((n) => !n.only || n.only === mode);
  return { nodes, i: 0, mode, t: 0, jumped: false, held: false, stuckT: 0, best: Infinity, done: false, fails: 0, log: [], waitT: 0, lastI: -1 };
}

function hazardSafe(h, W, P, cross = 1.0) {
  if (h.type === "roller") {
    const dx = h.x - P.x;
    const dz = h.z - P.z;
    const d = Math.hypot(dx, dz);
    const away = dx * (h.vx || 0) + dz * (h.vz || 0) > 0;
    return d > 2.2 && away;
  }
  if (h.period) {
    const st = hazardPhase(h, W.clock);
    const onFrac = h.onFrac == null ? 0.4 : h.onFrac;
    const warnFrac = h.warnFrac == null ? 0.2 : h.warnFrac;
    return !st.on && !st.warn && st.ph < 1 - onFrac - warnFrac - cross / (h.period || 3);
  }
  return true;
}

/** returns raw input { ax, ay, sprint, jumpHeld, edges, yaw } */
export function botInput(B, W, dt) {
  const P = W.player;
  const raw = { ax: 0, ay: 0, sprint: false, jumpHeld: false, edges: {}, yaw: W.camYaw };
  if (B.done || P.state === S.FINISHED) {
    B.done = true;
    return raw;
  }
  const n = B.nodes[B.i];
  if (!n) {
    B.done = true;
    return raw;
  }
  if (B.i !== B.lastI) {
    B.lastI = B.i;
    B.jumped = false;
    B.waitT = 0;
    B.stuckT = 0;
    B.best = Infinity;
    B.arrived = false;
    B.jumpAge = 0;
  }
  B.t += dt;
  // board a moving platform: aim at where it is now
  let tx = n.x;
  let tz = n.z;
  if (n.board != null) {
    const mb = W.movers[n.board].box;
    tx = (mb.min[0] + mb.max[0]) / 2;
    tz = (mb.min[2] + mb.max[2]) / 2;
  }
  const dx = tx - P.x;
  const dz = tz - P.z;
  const d = Math.hypot(dx, dz);
  const r = n.r ?? 0.35;
  const okY = n.y == null || (P.grounded && (Math.abs(P.y - n.y) < 0.25 || (n.atLeast && P.y > n.y)));
  const onBoard = n.board != null && P.grounded && P.groundBox === W.movers[n.board].box;
  const busy = P.state === S.LEDGE || P.state === S.HURT || P.state === S.FALLING_OUT || P.state === S.RESPAWN || P.state === S.STUMBLE;

  // arrived?
  const bounced = n.fromY != null && P.state === S.AIR && P.leftBy === "bounce" && P.airT < 0.15 && P.y > n.fromY - 0.2;
  if (!B.arrived && n.board != null ? onBoard : !B.arrived && d < r && okY && !busy && (n.fromY != null ? bounced : P.grounded || n.air)) B.arrived = true;
  if (B.arrived) {
    if (n.interact && !B.pressedE) {
      B.pressedE = true;
      raw.edges.interact = true;
      return raw;
    }
    if (n.wait && B.waitT < n.wait) {
      B.waitT += dt;
      return raw;
    }
    if (n.waitHazard != null) {
      const h = W.hazards[n.waitHazard];
      if (h && !hazardSafe(h, W, P, n.cross ?? 1.0)) return raw;
    }
    if (n.waitPet) {
      const pet = W.pets[n.waitPet.i];
      if (pet && !(pet.cur.state === n.waitPet.state && pet.cur.timeToNext > (n.waitPet.minLeft ?? 2) && (n.waitPet.far == null || pet.dist > n.waitPet.far))) return raw;
    }
    if (n.waitMover) {
      const m = W.movers[n.waitMover.i];
      if (n.waitMover.phase) {
        const p = m.path;
        const per = p.period || 4;
        const ph = ((((m.t + (p.phase || 0) * per) % per) + per) % per) / per;
        if (ph < n.waitMover.phase[0] || ph > n.waitMover.phase[1]) return raw;
      } else {
        const off = m ? m.off[n.waitMover.axis ?? 0] : 0;
        if (Math.abs(off - n.waitMover.at) > (n.waitMover.tol ?? 0.3)) return raw;
      }
    }
    B.pressedE = false;
    B.i++;
    return raw;
  }

  // steer: point the camera at the node and push forward
  if (d > 0.02) raw.yaw = Math.atan2(dx, dz);
  W.camYaw = raw.yaw;
  raw.ay = d > r * 0.5 ? Math.min(1, 0.35 + d) : 0;
  if (n.slow) raw.ay = Math.min(raw.ay, n.slow);
  raw.sprint = !!n.sprint;
  // a landed jump that didn't reach the node can be retried
  if (B.jumped && P.grounded && P.state === S.GROUND && n.jump && d > r && B.jumpAge > 0.3) {
    B.jumped = false;
    B.stuckT = 0;
  }
  if (n.jump && !B.jumped && (d < (n.jd ?? 1.5) || B.stuckT > 0.3) && P.grounded) {
    raw.edges.jump = true;
    raw.jumpHeld = true;
    B.jumped = true;
  } else if (n.jump && B.jumped && (n.hold || !P.grounded) && n.hold !== false) {
    raw.jumpHeld = !!n.hold || P.vy > 0;
  }
  if (n.hold && !P.grounded) raw.jumpHeld = true;
  B.jumpAge = B.jumped ? (B.jumpAge || 0) + dt : 0;

  // progress watchdog
  if (d < B.best - 0.05) {
    B.best = d;
    B.stuckT = 0;
  } else B.stuckT += dt;
  return raw;
}

/** run a level headless until finish / timeout. Returns a summary. */
export async function runBot(level, { createWorld, stepWorld, drainEvents }, { mode = "main", maxT = 600, fps = 60, assist = false } = {}) {
  const W = createWorld(level, { assist });
  const B = createBot(level, mode);
  const dt = 1 / fps;
  let t = 0;
  const events = { fall: 0, button: 0, checkpoint: 0, finish: 0, hurt: 0 };
  let lastNode = -1;
  let nodeT = 0;
  while (t < maxT && !W.finished) {
    const raw = botInput(B, W, dt);
    stepWorld(W, raw, dt);
    for (const e of drainEvents(W)) if (events[e.type] != null) events[e.type]++;
    t += dt;
    if (B.i !== lastNode) {
      lastNode = B.i;
      nodeT = 0;
    } else nodeT += dt;
    if (nodeT > 30) break; // stuck on one node
  }
  const P = W.player;
  return { finished: W.finished, time: t, node: B.i, nodes: B.nodes.length, at: [P.x, P.y, P.z].map((v) => +v.toFixed(2)), state: P.state, buttons: W.buttonCount, ...events, stuckNode: W.finished ? null : B.nodes[B.i] };
}
