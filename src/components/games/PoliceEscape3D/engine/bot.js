/**
 * Police Escape 3D — a getaway-driver bot. Used by tools/simTest.mjs to prove
 * every mission can be completed (and to measure the star target times),
 * and by the ?petest=1 hooks to drive the real game. It only uses what a
 * player can see: the roads, the objective, nearby cars.
 *
 *   route    road-graph distance field to the current objective (checkpoint,
 *            escape zone — or, while a survive timer runs, a node far from
 *            the police)
 *   steer    pure pursuit on a look-ahead point that rounds intersections,
 *            sidestepping traffic / police / roadblocks in its corridor
 *   speed    full throttle, brakes for corners, handbrake for hairpins
 *   nitro    on long clear straights or with police on its tail
 *   unstick  reverse out with opposite lock; R if that fails
 */
import { locate, edgePoint } from "./city.js";
import { clamp, wrapAngle } from "./util.js";
import { PSTATE } from "./police.js";

export function createBot(opts = {}) {
  const mem = { stuck: 0, rev: 0, revSteer: 1, prev: -1, next: -1, surviveTarget: -1, surviveT: 0, resets: 0 };
  const skill = opts.skill ?? 1;
  return function drive(run) {
    const { city, player: c } = run;
    const out = { throttle: 1, brake: 0, steer: 0, handbrake: false, nitro: false, reset: false };
    const cops = run.police.filter((p) => p.state !== PSTATE.LOST);
    // --- objective node -------------------------------------------------------
    let target;
    if (run.cpIndex < run.checkpoints.length) target = run.checkpoints[run.cpIndex].node;
    else if (city.zone && run.time >= (run.def.survive || 0) && (run.zoneOpen || !run.heatLock || Math.hypot(city.zone.x - c.x, city.zone.z - c.z) > 260)) target = city.zone.node;
    else {
      mem.surviveT -= 1 / 120;
      const here = Math.hypot(city.nodes[mem.surviveTarget]?.x - c.x, city.nodes[mem.surviveTarget]?.z - c.z);
      if (mem.surviveTarget < 0 || mem.surviveT <= 0 || here < 20) {
        // a node 150–400 m away, as far from the police as possible
        let best = -1;
        let bs = -Infinity;
        for (const n of city.nodes) {
          if (n.kind !== "int") continue;
          const d = Math.hypot(n.x - c.x, n.z - c.z);
          if (d < 150 || d > 400) continue;
          // shaking the police off near the escape point: stay in its area
          if (run.heatLock && city.zone && Math.hypot(n.x - city.zone.x, n.z - city.zone.z) > 380) continue;
          let m = Infinity;
          for (const p of cops) m = Math.min(m, Math.hypot(p.car.x - n.x, p.car.z - n.z));
          const s = m + run.rand() * 40;
          if (s > bs) {
            bs = s;
            best = n.id;
          }
        }
        mem.surviveTarget = best >= 0 ? best : 0;
        mem.surviveT = 8;
      }
      target = mem.surviveTarget;
    }
    const field = run.fieldTo(target);
    const q = locate(city, c.x, c.z, 30);
    const e = city.edges[q.e];
    const viaA = q.t + field[e.a];
    const viaB = e.len - q.t + field[e.b];
    let tn = viaA < viaB ? e.a : e.b;
    // going the wrong way along the edge → it's fine, we turn around
    const T = city.nodes[tn];
    const dT = Math.hypot(T.x - c.x, T.z - c.z);
    let aim;
    const v = c.fwd;
    const look = clamp(Math.abs(v) * 0.5, 8, 20);
    let after = -1;
    if (dT < 22) {
      let best = Infinity;
      for (const { e: ei, to } of T.adj) {
        const ed = city.edges[ei];
        if (ed.blocked && !(ed.kind === "drive")) {
          // a roadblock edge is still passable through its gap; just costlier
        }
        const cst = ed.len + field[to] + (ed.blocked ? 40 : 0);
        if (cst < best && !(to === mem.prev && T.adj.length > 1)) {
          best = cst;
          after = to;
        }
      }
    }
    if (tn !== mem.next) {
      mem.prev = mem.next;
      mem.next = tn;
    }
    if (tn === target && dT < 30) aim = { x: T.x, z: T.z };
    else if (after < 0 || dT > look) {
      const towardB = tn === e.b;
      const t = clamp(q.t + (towardB ? look : -look), 0, e.len);
      aim = edgePoint(city, e, t, 0);
    } else {
      const A = city.nodes[after];
      const k = clamp(look - dT, 0, 30);
      const L = Math.hypot(A.x - T.x, A.z - T.z) || 1;
      aim = { x: T.x + ((A.x - T.x) / L) * k, z: T.z + ((A.z - T.z) / L) * k };
    }
    // --- sidestep things in the corridor ahead ------------------------------------
    const fx = Math.sin(c.h);
    const fz = Math.cos(c.h);
    let push = 0;
    const consider = (x, z, r) => {
      const dx = x - c.x;
      const dz = z - c.z;
      const along = dx * fx + dz * fz;
      const lat = dx * fz - dz * fx; // + = to our left? (left = (fz, -fx))
      if (along > 2 && along < 32 && Math.abs(lat) < r) push += (lat > 0 ? -1 : 1) * (r - Math.abs(lat)) * (1 - along / 40);
    };
    for (const t of run.traffic.cars) if (t.active) consider(t.x, t.z, 3.6);
    for (const p of cops) consider(p.car.x, p.car.z, p.state === PSTATE.DISABLED ? 3.6 : 4.4);
    let rbSlow = false;
    for (const r of run.roadblocks) {
      // thread the gap: aim at its centre from 70 m out until we're past it
      const ux = Math.sin(r.h);
      const uz = Math.cos(r.h);
      const along = (r.x - c.x) * fx + (r.z - c.z) * fz;
      const latOff = Math.abs((r.x - c.x) * uz - (r.z - c.z) * ux);
      const aligned = Math.abs(fx * ux + fz * uz) > 0.7;
      if (aligned && along > -3 && along < 70 && latOff < 12) {
        const half = city.edges[r.e].w / 2;
        const gapLat = r.gapSide === "L" ? (r.hi + half) / 2 + 0.6 : (r.lo - half) / 2 - 0.6;
        const g = { x: r.x + uz * gapLat, z: r.z - ux * gapLat };
        // the gap point, carried a little past the block along the road
        const s = Math.sign(fx * ux + fz * uz) || 1;
        aim = { x: g.x + ux * s * 6, z: g.z + uz * s * 6 };
        push = 0;
        rbSlow = along < 45;
      }
    }
    aim = { x: aim.x + fz * push * 0.8, z: aim.z - fx * push * 0.8 };
    const want = Math.atan2(aim.x - c.x, aim.z - c.z);
    const err = wrapAngle(want - c.h);
    out.steer = clamp(err * 2.8, -1, 1);
    // --- speed ---------------------------------------------------------------------
    let vT = c.p.vmax * skill;
    if (after >= 0) {
      const A = city.nodes[after];
      const inH = Math.atan2(T.x - c.x, T.z - c.z);
      const outH = Math.atan2(A.x - T.x, A.z - T.z);
      const turn = Math.abs(wrapAngle(outH - inH));
      if (turn > 0.4) {
        const vTurn = Math.max(8, 26 - turn * 9);
        const brake = Math.max(0, (v * v - vTurn * vTurn) / (2 * 22));
        if (dT < brake + 12) vT = Math.min(vT, vTurn);
      }
    }
    if (Math.abs(err) > 1.3 && v > 10) vT = Math.min(vT, 10);
    if (rbSlow) vT = Math.min(vT, 19);
    if (v > vT + 2) {
      out.throttle = 0;
      out.brake = 1;
    } else if (v > vT) out.throttle = 0;
    if (Math.abs(err) > 0.9 && v > 14) out.handbrake = true;
    // --- nitro -----------------------------------------------------------------------
    const tail = cops.some((p) => Math.hypot(p.car.x - c.x, p.car.z - c.z) < 30);
    if (c.nitro > 0.15 && Math.abs(err) < 0.15 && dT > 90 && out.throttle > 0) out.nitro = true;
    if (tail && c.nitro > 0.1 && Math.abs(err) < 0.25 && out.throttle > 0) out.nitro = true;
    // --- unstick ----------------------------------------------------------------------
    if (mem.rev > 0) {
      mem.rev -= 1 / 120;
      return { throttle: 0, brake: 1, steer: mem.revSteer, handbrake: false, nitro: false, reset: false };
    }
    if (Math.abs(v) < 1.5 && out.throttle > 0) mem.stuck += 1 / 120;
    else mem.stuck = Math.max(0, mem.stuck - 1 / 60);
    if (mem.stuck > 1.0) {
      mem.stuck = 0;
      mem.resets++;
      mem.rev = 0.9;
      mem.revSteer = -Math.sign(out.steer || 1);
      if (mem.resets % 4 === 0) out.reset = true;
    }
    return out;
  };
}
