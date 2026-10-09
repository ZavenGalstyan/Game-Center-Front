/**
 * Police Escape 3D — police AI: a small finite-state machine driving the
 * SAME car physics as the player (engine/car.js).
 *
 *   PATROL     wander the road graph at a calm speed (before the pursuit /
 *              after losing the player); switches to PURSUIT on sight
 *   PURSUIT    follow the road graph toward the player's last known road
 *              position: the run keeps one Dijkstra distance field from the
 *              player (recomputed a few times a second, shared by every
 *              police car); each car just takes the neighbour with the
 *              smallest remaining distance. Close and in sight → drive
 *              straight at the player with a little lead (ram / box in)
 *   INTERCEPT  every second police car, when far, uses a second field from a
 *              node AHEAD of the player (on their direction of travel) to
 *              cut them off; close → PURSUIT
 *   RECOVER    stuck (throttle on, not moving): reverse with opposite lock
 *              for a moment, then carry on. Stuck for long and well out of
 *              view → quietly re-placed on a road node BEHIND the player
 *              (never ahead of them)
 *   DISABLED   after a heavy crash: stopped, smoking, for a couple of seconds
 *   LOST       too far and out of sight for a while: the car gives up (it
 *              counts as evaded) and leaves the chase
 *
 * Steering is a pure-pursuit on a look-ahead point that rounds intersections;
 * speed drops before sharp turns. Transitions are simple and predictable.
 */
import { createCar, paramsFor, placeCar } from "./car.js";
import { locate, lineOfSight, edgePoint } from "./city.js";
import { clamp, wrapAngle } from "./util.js";

export const PSTATE = Object.freeze({ PATROL: "PATROL", PURSUIT: "PURSUIT", INTERCEPT: "INTERCEPT", RECOVER: "RECOVER", DISABLED: "DISABLED", LOST: "LOST" });

export function createPolice(id, city, x, z, h, skill) {
  const p = paramsFor({ speed: 5, accel: 5, handling: 5, durability: 6 });
  p.vmax *= skill.speed;
  p.accel *= skill.accel ?? 1;
  const car = createCar(p, x, z, h);
  car.nitro = 0;
  return {
    id,
    car,
    state: PSTATE.PATROL,
    role: id % 2 ? "interceptor" : "chaser",
    q: locate(city, x, z),
    next: -1, // node we're heading for
    prevNode: -1,
    stuckT: 0,
    recoverT: 0,
    disabledT: 0,
    unseenT: 0,
    sees: false,
    hp: 100,
    lostT: 0,
    distToPlayer: Infinity,
    siren: true,
    hitCool: 0,
    patrolTarget: -1,
  };
}

/** Pick the next node from an edge / node using a field (smaller = closer). */
function chooseNext(city, cop, field) {
  const q = cop.q;
  const e = city.edges[q.e];
  // still on the edge: go toward the cheaper end
  const viaA = q.t + field[e.a];
  const viaB = e.len - q.t + field[e.b];
  let target = viaA < viaB ? e.a : e.b;
  const dT = Math.hypot(city.nodes[target].x - cop.car.x, city.nodes[target].z - cop.car.z);
  // close to that node → already look at the following one
  let after = -1;
  if (dT < 18) {
    let best = Infinity;
    for (const { e: ei, to } of city.nodes[target].adj) {
      const ed = city.edges[ei];
      if (ed.blocked) continue;
      const c = ed.len + field[to];
      if (c < best && !(to === cop.prevNode && city.nodes[target].adj.length > 1)) {
        best = c;
        after = to;
      }
    }
  }
  return { target, after, dT };
}

/** The point to steer at: rounds the corner from `target` toward `after`. */
function lookPoint(city, cop, ch, lookahead) {
  const T = city.nodes[ch.target];
  if (ch.after < 0 || ch.dT > lookahead) {
    // along the road toward the node: aim at a point on the centreline ahead
    const q = cop.q;
    const e = city.edges[q.e];
    const towardB = ch.target === e.b;
    const t = clamp(q.t + (towardB ? lookahead : -lookahead), 0, e.len);
    const p = edgePoint(city, e, t, 0);
    return { x: p.x, z: p.z };
  }
  const A = city.nodes[ch.after];
  const k = clamp(lookahead - ch.dT, 0, 30);
  const L = Math.hypot(A.x - T.x, A.z - T.z) || 1;
  return { x: T.x + ((A.x - T.x) / L) * k, z: T.z + ((A.z - T.z) / L) * k };
}

/**
 * Decide this step's inputs. ctx = { city, player, fieldP (from player),
 * fieldI (intercept), clock, cameraSafe(x, z) → bool }.
 */
export function policeThink(cop, ctx, dt) {
  const { city, player } = ctx;
  const c = cop.car;
  const out = { throttle: 0, brake: 0, steer: 0, handbrake: false, nitro: false };
  cop.q = locate(city, c.x, c.z, 30) || cop.q;
  const dx = player.x - c.x;
  const dz = player.z - c.z;
  const dist = Math.hypot(dx, dz);
  cop.distToPlayer = dist;
  cop.hitCool = Math.max(0, cop.hitCool - dt);

  // --- state transitions ---------------------------------------------------------
  cop.sees = dist < 160 && lineOfSight(city, c.x, c.z, player.x, player.z);
  cop.unseenT = cop.sees ? 0 : cop.unseenT + dt;
  if (cop.state === PSTATE.DISABLED) {
    cop.disabledT -= dt;
    if (cop.disabledT <= 0) cop.state = PSTATE.PURSUIT;
    return out; // no input: it rolls to a stop (brake from rest would reverse)
  }
  if (cop.state === PSTATE.LOST) return out;
  if (cop.state === PSTATE.PATROL && ctx.active && (cop.sees || dist < 90)) cop.state = PSTATE.PURSUIT;
  if ((cop.state === PSTATE.PURSUIT || cop.state === PSTATE.INTERCEPT) && ctx.active) {
    // the far-chaser gives up when it can't see you for long
    // "lost" means the player got AWAY: well beyond the closest this car
    // ever got, and out of sight for a while
    const gd = ctx.fieldP ? graphDist(city, ctx.fieldP, cop.q) : dist;
    cop.closest = Math.min(cop.closest ?? Infinity, gd);
    if (gd > Math.max(320, cop.closest + 220) && cop.unseenT > 7) {
      cop.state = PSTATE.LOST;
      return out;
    }
    if (cop.role === "interceptor" && ctx.fieldI && dist > 110 && !cop.sees) cop.state = PSTATE.INTERCEPT;
    else if (cop.state === PSTATE.INTERCEPT && (dist < 70 || cop.sees)) cop.state = PSTATE.PURSUIT;
  }
  // stuck detection → RECOVER
  const moving = Math.abs(c.fwd) > 2;
  if (cop.state !== PSTATE.RECOVER && cop.state !== PSTATE.PATROL) {
    if (!moving && c.throttle > 0) cop.stuckT += dt;
    else cop.stuckT = Math.max(0, cop.stuckT - dt * 2);
    if (cop.stuckT > 1.2) {
      cop.state = PSTATE.RECOVER;
      cop.recoverT = 1.1;
      cop.recoverSteer = ctx.rand() < 0.5 ? 1 : -1;
      cop.stuckTotal = (cop.stuckTotal || 0) + cop.stuckT;
      cop.stuckT = 0;
    }
  }
  if (cop.state === PSTATE.RECOVER) {
    cop.recoverT -= dt;
    out.brake = 1; // reverse
    out.steer = cop.recoverSteer;
    if (cop.recoverT <= 0) {
      cop.state = ctx.active ? PSTATE.PURSUIT : PSTATE.PATROL;
      // stuck again and again, far from the camera: re-place behind the player
      if ((cop.stuckTotal || 0) > 5 && dist > 90 && ctx.respawnBehind) {
        ctx.respawnBehind(cop);
        cop.stuckTotal = 0;
      }
    }
    return out;
  }
  if (moving) cop.stuckTotal = Math.max(0, (cop.stuckTotal || 0) - dt * 0.5);

  // --- where to drive ------------------------------------------------------------
  let aim;
  let wantV = c.p.vmax;
  if (!ctx.active || cop.state === PSTATE.PATROL) {
    wantV = c.p.vmax * 0.5;
    if (cop.patrolField == null || cop.patrolAge > 12 || cop.q && city.edges[cop.q.e] && nearNode(city, c, cop.patrolTarget) < 15) {
      cop.patrolTarget = Math.floor(ctx.rand() * city.nodes.length);
      cop.patrolField = ctx.fieldTo ? ctx.fieldTo(cop.patrolTarget) : null;
      cop.patrolAge = 0;
    }
    cop.patrolAge = (cop.patrolAge || 0) + dt;
    if (!cop.patrolField) return out;
    const ch = chooseNext(city, cop, cop.patrolField);
    aim = lookPoint(city, cop, ch, 14);
    remember(cop, ch);
    wantV = Math.min(wantV, cornerSpeed(city, c, ch));
  } else if (dist < 34 && cop.sees) {
    // close: go for the player, leading their motion a little
    const lead = clamp(dist / 30, 0.15, 0.6);
    aim = { x: player.x + player.vx * lead, z: player.z + player.vz * lead };
    // controlled contact: close in only a little faster than the player is
    // going — a nudge / box-in, never a full-speed T-bone
    const pv = Math.hypot(player.vx, player.vz);
    wantV = dist < 9 ? Math.max(0, pv - 2) : Math.min(c.p.vmax, pv + 4 + (dist - 9) * 0.3);
    // the player is coming AT us: block the road, don't ram head-on
    const toCop = ((c.x - player.x) * player.vx + (c.z - player.z) * player.vz) / Math.max(1, dist * pv);
    if (pv > 8 && toCop > 0.6) wantV = Math.min(wantV, 7);
    if (dist < 9 && pv < 3) {
      // alongside a stopped car: stop and hold it (box in)
      out.brake = c.fwd > 0.5 ? 1 : 0;
      out.steer = 0;
      return out;
    }
  } else {
    const field = cop.state === PSTATE.INTERCEPT && ctx.fieldI ? ctx.fieldI : ctx.fieldP;
    if (!field) return out;
    const ch = chooseNext(city, cop, field);
    aim = lookPoint(city, cop, ch, clamp(Math.abs(c.fwd) * 0.55, 9, 22));
    remember(cop, ch);
    wantV = Math.min(wantV, cornerSpeed(city, c, ch));
    // catching up from far behind: a little extra pace (never in view)
    if (dist > 180 && !cop.sees) wantV *= 1.06;
  }
  // keep clear of other police cars in front (no pile-ups between cops)
  if (ctx.others) {
    const fx = Math.sin(c.h);
    const fz = Math.cos(c.h);
    for (const o of ctx.others) {
      if (o === cop || o.state === PSTATE.LOST) continue;
      const dx = o.car.x - c.x;
      const dz = o.car.z - c.z;
      const along = dx * fx + dz * fz;
      const lat = dx * fz - dz * fx; // + = left
      if (along > 0 && along < 16 && Math.abs(lat) < 3.5) {
        const k = (3.5 - Math.abs(lat)) * (lat > 0 ? -1 : 1);
        aim = { x: aim.x + fz * k * 1.5, z: aim.z - fx * k * 1.5 };
        // closing on it head-on or fast: back off
        const rel = (o.car.vx - c.vx) * fx + (o.car.vz - c.vz) * fz;
        if (rel < -8) wantV = Math.min(wantV, Math.max(6, c.fwd + rel * 0.5));
      }
    }
  }
  const want = Math.atan2(aim.x - c.x, aim.z - c.z);
  const err = wrapAngle(want - c.h);
  out.steer = clamp(err * 2.6, -1, 1);
  const v = c.fwd;
  if (Math.abs(err) > 1.9 && dist > 20) {
    // target behind: reverse-turn would be slow; do a handbrake U-turn
    out.throttle = 1;
    out.handbrake = v > 8;
  } else if (v > wantV + 3) out.brake = 1;
  else if (v < wantV) out.throttle = 1;
  return out;
}

function remember(cop, ch) {
  if (cop.next !== ch.target) {
    cop.prevNode = cop.next;
    cop.next = ch.target;
  }
}
const nearNode = (city, c, id) => (id < 0 ? Infinity : Math.hypot(city.nodes[id].x - c.x, city.nodes[id].z - c.z));

/** Speed for the coming corner: slow down for sharp turns at the next node. */
function cornerSpeed(city, c, ch) {
  if (ch.after < 0) return Infinity;
  const T = city.nodes[ch.target];
  const A = city.nodes[ch.after];
  const inH = Math.atan2(T.x - c.x, T.z - c.z);
  const outH = Math.atan2(A.x - T.x, A.z - T.z);
  const turn = Math.abs(wrapAngle(outH - inH));
  if (turn < 0.3) return Infinity;
  const vTurn = 30 - turn * 11; // 90° ≈ 13 m/s, 180° ≈ 5 m/s
  // braking distance check
  const brake = Math.max(0, (c.fwd * c.fwd - vTurn * vTurn) / (2 * 20));
  return ch.dT < brake + 10 ? Math.max(6, vTurn) : Infinity;
}

function graphDist(city, field, q) {
  const e = city.edges[q.e];
  return Math.min(q.t + field[e.a], e.len - q.t + field[e.b]);
}

/** Put a police car on a node, facing along one of its roads. */
export function placePolice(city, cop, node, towardNode = -1) {
  const n = city.nodes[node];
  let h = 0;
  const adj = n.adj.find((a) => a.to === towardNode) || n.adj[0];
  if (adj) {
    const m = city.nodes[adj.to];
    h = Math.atan2(m.x - n.x, m.z - n.z);
  }
  placeCar(cop.car, n.x, n.z, h);
  cop.state = PSTATE.PURSUIT;
  cop.stuckT = 0;
  cop.unseenT = 0;
  cop.q = locate(city, n.x, n.z);
}
