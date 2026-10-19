/**
 * Vice Streets 3D — road-graph navigation (A*), lane geometry and the
 * route-following driver shared by racers, police, mission cars, the GPS and
 * the test bot.
 */
import { LANE_OFF, ROAD_HALF, lightState } from "./city.js";
import { clamp, wrapA, headingOf, segClosest } from "./util.js";
import { steerToward } from "./vehicle.js";

/** clearance (m) a lane stops short of a node: room to turn inside the junction */
export const nodeClear = (n) => (n.edges.length > 2 ? 10.5 : 0);

/**
 * A junction turn as an arc, not a chord: the point halfway round the arc from
 * the arrival to the departure point (bulging toward the junction centre), so
 * drivers don't clip the kerb corner. null for (nearly) straight-on.
 */
export function turnMid(n, ax, az, dx, dz, inDir, outDir) {
  const turn = Math.abs(Math.atan2(inDir[0] * outDir[1] - inDir[1] * outDir[0], inDir[0] * outDir[0] + inDir[1] * outDir[1]));
  if (turn < 0.5 || turn > 2.6) return null;
  const mx = (ax + dx) / 2;
  const mz = (az + dz) / 2;
  const chord = Math.hypot(dx - ax, dz - az);
  const tx = n.x - mx;
  const tz = n.z - mz;
  const L = Math.hypot(tx, tz) || 1;
  const s = Math.min(L, 0.207 * chord * (turn / (Math.PI / 2)));
  return { x: mx + (tx / L) * s, z: mz + (tz / L) * s };
}
export function otherEnd(e, nid) {
  return e.a === nid ? e.b : e.a;
}

/** A* over nodes; `blocked(edge)` excludes edges (closed gates). Returns node ids or null. */
export function astar(city, from, to, blocked) {
  if (from === to) return [from];
  const N = city.nodes;
  const g = new Map([[from, 0]]);
  const came = new Map();
  const open = [[0, from]];
  const T = N[to];
  const h = (id) => Math.hypot(N[id].x - T.x, N[id].z - T.z);
  const closed = new Set();
  while (open.length) {
    // small graphs: a linear min-extract is fine
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (open[i][0] < open[bi][0]) bi = i;
    const [, cur] = open[bi];
    open.splice(bi, 1);
    if (cur === to) {
      const out = [cur];
      let c = cur;
      while (came.has(c)) out.push((c = came.get(c)));
      return out.reverse();
    }
    if (closed.has(cur)) continue;
    closed.add(cur);
    for (const eid of N[cur].edges) {
      const e = city.edges[eid];
      if (blocked && blocked(e)) continue;
      const nb = otherEnd(e, cur);
      const ng = g.get(cur) + e.len;
      if (ng < (g.get(nb) ?? Infinity)) {
        g.set(nb, ng);
        came.set(nb, cur);
        open.push([ng + h(nb), nb]);
      }
    }
  }
  return null;
}

/** nearest road position → { edge, t, x, z, d } (searches wider than roadQuery) */
export function nearestRoad(city, x, z, blocked) {
  let q = city.roadQuery(x, z);
  if (q && (!blocked || !blocked(q.edge))) return q;
  let best = null;
  for (const e of city.edges) {
    if (blocked && blocked(e)) continue;
    const A = city.nodes[e.a];
    const B = city.nodes[e.b];
    const c = segClosest(x, z, A.x, A.z, B.x, B.z);
    if (!best || c.d2 < best.d2) best = { edge: e, t: c.t, x: c.x, z: c.z, d2: c.d2 };
  }
  best.d = Math.sqrt(best.d2);
  return best;
}

/**
 * Plan a drive from (x, z) facing h to (tx, tz). Returns
 * { pts: [{x, z, node?}], nodes, length } — lane-offset waypoints (right-hand
 * traffic), or centre-line ones when opts.center (police on a pursuit).
 */
export function planRoute(city, x, z, h, tx, tz, opts = {}) {
  const blocked = opts.blocked;
  let s = nearestRoad(city, x, z, blocked);
  // starting inside a junction: use the arm the car points down, not whichever is nearest
  {
    const N0 = city.nodes;
    const near = [N0[s.edge.a], N0[s.edge.b]].find((n) => n.edges.length > 2 && Math.hypot(n.x - x, n.z - z) < 11);
    if (near) {
      let best = null;
      for (const id of near.edges) {
        const e = city.edges[id];
        if (blocked && blocked(e)) continue;
        const o = N0[otherEnd(e, near.id)];
        const dx = (o.x - near.x) / e.len;
        const dz = (o.z - near.z) / e.len;
        const dot = dx * Math.sin(h) + dz * Math.cos(h);
        if (!best || dot > best.dot) best = { e, dot };
      }
      if (best && best.dot > 0.6) {
        const A = N0[best.e.a];
        const B = N0[best.e.b];
        const c = segClosest(x, z, A.x, A.z, B.x, B.z);
        s = { edge: best.e, t: c.t, x: c.x, z: c.z, d2: c.d2, d: Math.sqrt(c.d2) };
      }
    }
  }
  const g = nearestRoad(city, tx, tz, blocked);
  const N = city.nodes;
  const sA = N[s.edge.a];
  const sB = N[s.edge.b];
  // prefer leaving in the direction the car already faces
  const along = Math.sin(h) * (sB.x - sA.x) + Math.cos(h) * (sB.z - sA.z) > 0 ? s.edge.b : s.edge.a;
  const starts = [
    { node: s.edge.b, cost: s.edge.len * (1 - s.t) + (along === s.edge.b ? 0 : 40) },
    { node: s.edge.a, cost: s.edge.len * s.t + (along === s.edge.a ? 0 : 40) },
  ];
  // arriving from node a means travelling a → b along the goal road; a kerb
  // target (opts.goalH) prefers the direction its lane runs in
  const wantDir = (fromA) => {
    if (opts.goalH == null) return 0;
    const dot = (fromA ? 1 : -1) * (g.edge.dx * Math.sin(opts.goalH) + g.edge.dz * Math.cos(opts.goalH));
    return dot < 0 ? 70 : 0;
  };
  const goals = [
    { node: g.edge.a, cost: g.edge.len * g.t + wantDir(true) },
    { node: g.edge.b, cost: g.edge.len * (1 - g.t) + wantDir(false) },
  ];
  let best = null;
  // same edge, heading the right way: drive straight there
  if (s.edge === g.edge) {
    const dirOk = (g.t - s.t) * (along === s.edge.b ? 1 : -1) >= 0;
    if (dirOk) best = { nodes: [], cost: Math.abs(g.t - s.t) * s.edge.len };
  }
  for (const st of starts) {
    for (const go of goals) {
      const p = astar(city, st.node, go.node, blocked);
      if (!p) continue;
      let c = st.cost + go.cost;
      for (let i = 0; i < p.length - 1; i++) {
        const e = N[p[i]].edges.map((id) => city.edges[id]).find((q) => otherEnd(q, p[i]) === p[i + 1]);
        c += e.len;
      }
      // don't pass the goal edge's far end and come back
      if (p.length >= 2 && ((p[p.length - 2] === g.edge.a && go.node === g.edge.b) || (p[p.length - 2] === g.edge.b && go.node === g.edge.a))) c += 1e4;
      if (!best || c < best.cost) best = { nodes: p, cost: c };
    }
  }
  if (!best) return { pts: [{ x: tx, z: tz }], nodes: [], length: Math.hypot(tx - x, tz - z) };
  const off = opts.center ? 0 : LANE_OFF;
  const pts = [];
  const nodes = best.nodes;
  // the first node is reached along the road the car is on: join that lane first
  const firstFrom = nodes.length ? N[otherEnd(s.edge, nodes[0])] : null;
  if (firstFrom && (s.edge.a === nodes[0] || s.edge.b === nodes[0])) {
    const d0 = norm(N[nodes[0]].x - firstFrom.x, N[nodes[0]].z - firstFrom.z);
    const ahead = Math.min(6, Math.hypot(N[nodes[0]].x - s.x, N[nodes[0]].z - s.z) * 0.5);
    pts.push({ x: s.x + d0[0] * ahead - d0[1] * off, z: s.z + d0[1] * ahead + d0[0] * off });
  }
  for (let i = 0; i < nodes.length; i++) {
    const n = N[nodes[i]];
    const prev = i > 0 ? N[nodes[i - 1]] : firstFrom && (s.edge.a === nodes[0] || s.edge.b === nodes[0]) ? firstFrom : null;
    const next = i < nodes.length - 1 ? N[nodes[i + 1]] : null;
    const clear = nodeClear(n);
    const inDir = prev ? norm(n.x - prev.x, n.z - prev.z) : next ? norm(next.x - n.x, next.z - n.z) : null;
    const outDir = next ? norm(next.x - n.x, next.z - n.z) : inDir;
    if (!inDir) continue;
    if (prev || i === 0) {
      // arrival point on the incoming lane, then the departure point on the outgoing lane
      const ix = n.x - inDir[0] * clear - inDir[1] * off;
      const iz = n.z - inDir[1] * clear + inDir[0] * off;
      if (clear > 0) pts.push({ x: ix, z: iz, node: n.id, arrive: true });
    }
    const ox = n.x + outDir[0] * clear - outDir[1] * off;
    const oz = n.z + outDir[1] * clear + outDir[0] * off;
    if (clear > 0 && (prev || i === 0)) {
      const m = turnMid(n, n.x - inDir[0] * clear - inDir[1] * off, n.z - inDir[1] * clear + inDir[0] * off, ox, oz, inDir, outDir);
      if (m) pts.push({ x: m.x, z: m.z, node: n.id, mid: true });
    }
    pts.push({ x: ox, z: oz, node: n.id });
  }
  // end on the goal road, in lane, next to the target
  const ge = g.edge;
  const last = nodes.length ? N[nodes[nodes.length - 1]] : null;
  let dir;
  if (last) dir = last.id === ge.a ? [ge.dx, ge.dz] : [-ge.dx, -ge.dz];
  else dir = along === ge.b ? [ge.dx, ge.dz] : [-ge.dx, -ge.dz];
  pts.push({ x: g.x - dir[1] * off, z: g.z + dir[0] * off, goal: true });
  // finish on the exact spot unless it lies across the oncoming lane (then stop in lane)
  const side = -dir[1] * (tx - g.x) + dir[0] * (tz - g.z);
  if (opts.exact !== false && (side > -1.5 || g.d > ROAD_HALF + 1)) pts.push({ x: tx, z: tz, goal: true, exact: true });
  let length = Math.hypot(pts[0].x - x, pts[0].z - z);
  for (let i = 1; i < pts.length; i++) length += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
  return { pts, nodes, length };
}
/** is the lane to the left (oncoming) free of cars for `range` metres ahead? */
function laneClear(sim, v, range) {
  const fx = Math.sin(v.h);
  const fz = Math.cos(v.h);
  const rx = -fz;
  const rz = fx;
  for (const o of sim.vehicles) {
    if (o === v) continue;
    const dx = o.x - v.x;
    const dz = o.z - v.z;
    const a = dx * fx + dz * fz;
    if (a < -4 || a > range) continue;
    const l = dx * rx + dz * rz;
    if (l < -7 || l > -1.2) continue;
    return false;
  }
  return true;
}
function norm(x, z) {
  const L = Math.hypot(x, z) || 1;
  return [x / L, z / L];
}

/**
 * Route follower: drives `v` along route.pts with pure-pursuit steering, slows
 * for corners and for anything ahead, optionally obeys traffic lights, and
 * reverses out when stuck. Returns "arrived" | "driving".
 */
export function followRoute(sim, v, R, dt, opts = {}) {
  const pts = R.pts;
  if (!pts.length) return "arrived";
  // advance the waypoint index
  while (R.i < pts.length - 1) {
    const p = pts[R.i];
    const q = pts[R.i + 1];
    const dx = q.x - p.x;
    const dz = q.z - p.z;
    const along = (v.x - p.x) * dx + (v.z - p.z) * dz;
    const dp = Math.hypot(v.x - p.x, v.z - p.z);
    // passed p: beyond it along the next segment, and actually close to that segment
    const L2 = dx * dx + dz * dz || 1;
    const t = Math.min(1, along / L2);
    const lat = Math.hypot(v.x - (p.x + dx * t), v.z - (p.z + dz * t));
    if (dp < 4 || (along > 0 && lat < 9)) R.i++;
    else break;
  }
  const last = pts[pts.length - 1];
  const dEnd = Math.hypot(last.x - v.x, last.z - v.z);
  if (R.i >= pts.length - 1 && dEnd < (opts.arriveR || 5)) {
    v.input.throttle = 0;
    v.input.brake = 1;
    v.input.steer = 0;
    return "arrived";
  }
  // look-ahead target along the polyline
  const L = clamp(5 + Math.abs(v.vf) * 0.55, 5, 22);
  let tx = pts[R.i].x;
  let tz = pts[R.i].z;
  {
    let rem = L - Math.hypot(tx - v.x, tz - v.z);
    for (let k = R.i; k < pts.length - 1 && rem > 0; k++) {
      const a = pts[k];
      const b = pts[k + 1];
      const seg = Math.hypot(b.x - a.x, b.z - a.z);
      if (seg >= rem) {
        tx = a.x + ((b.x - a.x) * rem) / seg;
        tz = a.z + ((b.z - a.z) * rem) / seg;
        rem = 0;
      } else {
        tx = b.x;
        tz = b.z;
        rem -= seg;
      }
    }
  }
  // overtaking a stopped, empty car: aim to the left of the lane for a while
  R.passT = Math.max(0, (R.passT || 0) - dt);
  const shift = opts.shift || (R.passT > 0 ? 3.6 : 0);
  if (shift) {
    const dx = tx - v.x;
    const dz = tz - v.z;
    const L = Math.hypot(dx, dz) || 1;
    tx += (dz / L) * shift;
    tz += (-dx / L) * shift;
  }
  // corner speed: the total turn of the path within any 20 m stretch of the
  // next ~45 m (a junction turn is split over several short segments)
  let maxSp = opts.speed || 14;
  {
    const segs = [];
    let px = v.x;
    let pz = v.z;
    let acc = 0;
    for (let k = R.i; k < pts.length && acc < 45; k++) {
      const p = pts[k];
      const seg = Math.hypot(p.x - px, p.z - pz);
      if (seg < 0.5) continue;
      segs.push({ h: headingOf(p.x - px, p.z - pz), at: acc });
      acc += seg;
      px = p.x;
      pz = p.z;
    }
    // corners sit where one segment ends and the next begins
    const cs = segs.length ? [{ at: 0, turn: Math.abs(wrapA(segs[0].h - v.h)) * (v.vf > 0 ? 1 : 0) }] : [];
    for (let q = 1; q < segs.length; q++) cs.push({ at: segs[q].at, turn: Math.abs(wrapA(segs[q].h - segs[q - 1].h)) });
    let i0 = 0;
    for (let j = 0; j < cs.length; j++) {
      while (cs[j].at - cs[i0].at > 20) i0++;
      let turn = 0;
      for (let q = i0; q <= j; q++) turn += cs[q].turn;
      if (turn > 0.35) {
        const vt = turn > 1.2 ? opts.cornerSpeed || 8 : turn > 0.7 ? 11 : 15;
        // slow down before the first corner of the stretch
        maxSp = Math.min(maxSp, Math.sqrt(vt * vt + 2 * 4.5 * Math.max(0, cs[i0].at - 3)));
      }
    }
  }
  // final approach: arrive slowly
  if (R.i >= pts.length - 2) maxSp = Math.min(maxSp, Math.sqrt(2 * 4.5 * Math.max(0, dEnd - 2)) + 1.5);
  // traffic lights (lawful drivers only)
  if (opts.lights) {
    // the next junction stop point the car has not yet driven past (the waypoint
    // index moves on a few metres early, the stop line must not)
    for (let k = Math.max(1, R.i - 2); k < Math.min(pts.length, R.i + 3); k++) {
      const p = pts[k];
      if (!p.arrive) continue;
      const prev = pts[k - 1];
      const L = Math.hypot(p.x - prev.x, p.z - prev.z) || 1;
      const ax = (p.x - prev.x) / L;
      const az = (p.z - prev.z) / L;
      const d = (p.x - v.x) * ax + (p.z - v.z) * az - 1;
      if (d < -1.2) continue;
      const n = sim.city.nodes[p.node];
      if (!n.light) break;
      const axis = Math.abs(ax) > Math.abs(az) ? "ew" : "ns";
      const st = lightState(n, axis, sim.t);
      if (st === "red" || (st === "yellow" && d > (v.vf * v.vf) / 8)) maxSp = Math.min(maxSp, Math.sqrt(2 * 5 * Math.max(0, d - 0.5)));
      break;
    }
  }
  // anything ahead (cars, the player, people in the road)
  let staticBlock = false;
  if (opts.avoid !== false) {
    const gap = sim.gapAhead(v, 30, R.passT > 0 ? R.passing : opts.ignore, opts.ignoreRole);
    if (gap < 30) maxSp = Math.min(maxSp, Math.sqrt(2 * 5.5 * Math.max(0, gap - 2.5)) + (opts.ram ? 6 : 0));
    const b = sim.blocker;
    // something that won't move out of the way: parked, abandoned or wrecked cars
    // straight away, and anyone else who has sat still in front of us for a while
    const empty = b && b.st && (!b.driver || b.wrecked || b.stalled);
    if (b && b.st && gap < 14 && Math.hypot(b.vx, b.vz) < 0.3) {
      staticBlock = empty && gap < 4;
      if (Math.abs(v.vf) < 1) R.blockT = (R.blockT || 0) + dt;
      if (R.blockT > (empty ? 1.6 : 4.5) && !(R.passT > 0)) {
        R.passT = 4.5;
        R.passing = b;
        R.blockT = 0;
      }
    } else R.blockT = Math.max(0, (R.blockT || 0) - dt);
    // racers / pursuers: overtake a slower car in the other lane when it is clear
    if (opts.overtake && b && b.st && gap < 16 && !(R.passT > 0)) {
      const bs = Math.hypot(b.vx, b.vz);
      if (bs > 0.3 && bs < (opts.speed || 14) * 0.75) {
        R.slowT = (R.slowT || 0) + dt;
        if (R.slowT > 0.8 && laneClear(sim, v, 45)) {
          R.passT = 2.6;
          R.passing = b;
          R.overtaking = true;
          R.slowT = 0;
        }
      }
    } else R.slowT = 0;
    if (R.passT > 0) maxSp = Math.min(maxSp, R.overtaking ? (opts.speed || 14) : 7);
    else R.overtaking = false;
    // nose to nose with someone who is also waiting: after a while, back off
    if (gap < 4 && Math.abs(v.vf) < 0.5) R.waitT = (R.waitT || 0) + dt;
    else R.waitT = 0;
    if (R.waitT > 5) staticBlock = true;
  }
  // stuck recovery: reverse for a moment
  if (R.rev > 0) {
    R.rev -= dt;
    steerToward(v, tx, tz, 0, { reverse: true });
    return "driving";
  }
  steerToward(v, tx, tz, maxSp, { gain: opts.gain || 2.2 });
  // stuck: pushing without actually moving (measured by displacement: a car shoved
  // against a wall can report wheel speed while going nowhere), or nose-up
  // against something that won't move
  R.realV = (R.realV ?? 5) + ((v.moved || 0) / Math.max(dt, 1e-3) - (R.realV ?? 5)) * Math.min(1, dt * 2.5);
  if (R.realV < 0.6 && (v.input.throttle > 0.2 || staticBlock)) {
    R.stuck = (R.stuck || 0) + dt;
    if (R.stuck > 1.8) {
      R.rev = 1.2;
      R.stuck = 0;
    }
  } else R.stuck = 0;
  return "driving";
}
