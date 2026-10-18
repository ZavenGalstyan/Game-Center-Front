/**
 * Vice Streets 3D — civilian traffic.
 *
 * A bounded pool of AI cars lives in a ring around the player: spawned on
 * lanes 75–170 m away (never on top of another car), despawned beyond
 * ~210 m. Each car wanders the road graph lane by lane (right-hand traffic,
 * no U-turns except at dead ends, never through a closed district gate),
 * keeps its distance to whatever is ahead (cars, the player, pedestrians),
 * stops for red lights, slows for corners, reverses out when wedged and is
 * quietly recycled when it stays stuck out of sight.
 */
import { VEHICLE, CIVIL_PAINTS, pickVehicle } from "../data/vehicles.js";
import { makeVehicle } from "./vehicle.js";
import { followRoute, nodeClear, otherEnd, turnMid } from "./nav.js";
import { LANE_OFF } from "./city.js";
import { dist } from "./util.js";

export const TRAFFIC = { max: 16, near: 75, far: 170, despawn: 215 };

/** a vehicle type that suits the district the car appears in */
function pickType(R, district) {
  return pickVehicle(R, district);
}

/** extend a wandering route until it has `need` metres of points ahead */
export function extendWander(sim, v, need = 120) {
  const W = v.wander;
  const { city } = sim;
  const N = city.nodes;
  const R = v.route;
  // trim consumed points
  if (R.i > 6) {
    R.pts.splice(0, R.i - 2);
    R.i = 2;
  }
  let ahead = 0;
  for (let k = Math.max(R.i, 1); k < R.pts.length; k++) ahead += Math.hypot(R.pts[k].x - R.pts[k - 1].x, R.pts[k].z - R.pts[k - 1].z);
  let guard = 0;
  while (ahead < need && guard++ < 12) {
    const prev = N[W.prev];
    const cur = N[W.cur];
    const opts = cur.edges.map((id) => city.edges[id]).filter((e) => !sim.edgeBlocked(e) && otherEnd(e, cur.id) !== prev.id);
    let e;
    if (!opts.length) e = city.edges[cur.edges.find((id) => otherEnd(city.edges[id], cur.id) === prev.id)];
    else {
      // mostly straight on, sometimes turn
      const inx = cur.x - prev.x;
      const inz = cur.z - prev.z;
      const L = Math.hypot(inx, inz) || 1;
      const w = opts.map((q) => {
        const nb = N[otherEnd(q, cur.id)];
        const dot = ((nb.x - cur.x) * inx + (nb.z - cur.z) * inz) / (L * q.len);
        return dot > 0.7 ? 3 : 1;
      });
      let x = sim.rand() * w.reduce((s, a) => s + a, 0);
      e = opts[0];
      for (let k = 0; k < opts.length; k++) if ((x -= w[k]) <= 0) {
        e = opts[k];
        break;
      }
    }
    const nb = N[otherEnd(e, cur.id)];
    const clear = nodeClear(cur);
    const ix = (cur.x - prev.x) / (Math.hypot(cur.x - prev.x, cur.z - prev.z) || 1);
    const iz = (cur.z - prev.z) / (Math.hypot(cur.x - prev.x, cur.z - prev.z) || 1);
    const ox = (nb.x - cur.x) / e.len;
    const oz = (nb.z - cur.z) / e.len;
    const ax = cur.x - ix * clear - iz * LANE_OFF;
    const az = cur.z - iz * clear + ix * LANE_OFF;
    const dx = cur.x + ox * clear - oz * LANE_OFF;
    const dz = cur.z + oz * clear + ox * LANE_OFF;
    if (clear > 0) {
      R.pts.push({ x: ax, z: az, node: cur.id, arrive: true });
      const m = turnMid(cur, ax, az, dx, dz, [ix, iz], [ox, oz]);
      if (m) R.pts.push({ x: m.x, z: m.z, node: cur.id, mid: true });
    }
    R.pts.push({ x: dx, z: dz, node: cur.id });
    ahead += e.len;
    W.prev = cur.id;
    W.cur = nb.id;
  }
}

export class Traffic {
  constructor(sim) {
    this.sim = sim;
    this.cars = [];
    this.spawnT = 0;
    this.max = TRAFFIC.max;
  }
  /** spawn a car on a lane at a given edge/direction/fraction */
  spawnOn(e, forward, t, type, opts = {}) {
    const sim = this.sim;
    const N = sim.city.nodes;
    const A = N[forward ? e.a : e.b];
    const B = N[forward ? e.b : e.a];
    const dx = (B.x - A.x) / e.len;
    const dz = (B.z - A.z) / e.len;
    const x = A.x + (B.x - A.x) * t - dz * LANE_OFF;
    const z = A.z + (B.z - A.z) * t + dx * LANE_OFF;
    const v = makeVehicle(type, x, z, Math.atan2(dx, dz), { role: opts.role || "traffic", paint: opts.paint || sim.rand.pick(CIVIL_PAINTS.concat(VEHICLE[type].paint)), upgrades: opts.upgrades });
    if (type === "taxi") v.paint = VEHICLE.taxi.paint;
    if (type === "police") v.paint = VEHICLE.police.paint;
    v.y = sim.city.groundAt(x, z);
    v.driver = "ai";
    v.wander = { prev: A.id, cur: B.id };
    v.route = { pts: [{ x, z }], i: 0 };
    const sp = opts.speed ?? 7;
    v.vx = dx * sp;
    v.vz = dz * sp;
    v.vf = sp;
    v.cruise = e.kind === "hill" ? 10.5 : sim.city.nodes[e.a].x >= 270 && sim.city.nodes[e.b].x >= 270 ? 15 : 13;
    v.cruise *= 0.9 + sim.rand() * 0.2;
    extendWander(sim, v);
    sim.addVehicle(v);
    return v;
  }
  /** a free lane spot 75–170 m from the player */
  findSpawn() {
    const sim = this.sim;
    const P = sim.focus();
    const { edges, nodes } = sim.city;
    for (let tries = 0; tries < 24; tries++) {
      const e = sim.rand.pick(edges);
      if (sim.edgeBlocked(e)) continue;
      const t = 0.25 + sim.rand() * 0.5;
      const A = nodes[e.a];
      const B = nodes[e.b];
      const x = A.x + (B.x - A.x) * t;
      const z = A.z + (B.z - A.z) * t;
      const d = dist(x, z, P.x, P.z);
      if (d < TRAFFIC.near || d > TRAFFIC.far) continue;
      if (!sim.districtOpen(sim.city.districtAt(x, z))) continue;
      if (sim.vehicles.some((v) => dist(v.x, v.z, x, z) < 14)) continue;
      return { e, t, forward: sim.rand() < 0.5 };
    }
    return null;
  }
  step(dt) {
    const sim = this.sim;
    const P = sim.focus();
    // despawn far / long-stuck cars
    for (let k = this.cars.length - 1; k >= 0; k--) {
      const v = this.cars[k];
      const d = dist(v.x, v.z, P.x, P.z);
      if (v.driver === "player" || v.role !== "traffic") {
        this.cars.splice(k, 1);
        continue;
      }
      const stuckFar = (v.stuckT > 14 || v.waitT > 40) && d > 60;
      if (d > TRAFFIC.despawn || stuckFar || (v.wrecked && d > 90) || (v.abandoned && d > 120)) {
        sim.removeVehicle(v);
        this.cars.splice(k, 1);
      }
    }
    // keep the pool topped up (one spawn attempt every 0.25 s)
    this.spawnT -= dt;
    if (this.spawnT <= 0 && this.cars.length < this.max) {
      this.spawnT = 0.25;
      const s = this.findSpawn();
      if (s) this.cars.push(this.spawnOn(s.e, s.forward, s.t, pickType(sim.rand, s.e.district)));
    }
    for (const v of this.cars) this.drive(v, dt);
  }
  drive(v, dt) {
    const sim = this.sim;
    if (v.driver !== "ai" || v.wrecked) {
      v.input.throttle = 0;
      v.input.brake = 1;
      return;
    }
    // a scared driver (just rammed / shots of a siren) pulls away fast
    extendWander(sim, v);
    const speed = v.cruise * (v.panic > 0 ? 1.35 : 1);
    v.panic = Math.max(0, (v.panic || 0) - dt);
    // (followRoute passes stopped, empty cars and backs out of dead ends by itself)
    const r = followRoute(sim, v, v.route, dt, { speed, lights: true });
    if (r === "arrived") extendWander(sim, v, 200);
    v.waitT = Math.hypot(v.vx, v.vz) < 0.5 ? (v.waitT || 0) + dt : 0;
    // stuck detection (not while waiting at a light / behind traffic: those keep throttle 0)
    if (Math.abs(v.vf) < 0.4 && v.input.throttle > 0.2) v.stuckT += dt;
    else if (Math.abs(v.vf) > 2) v.stuckT = 0;
    // honk at a blocker now and then
    if (v.input.brake > 0.5 && Math.abs(v.vf) < 1 && sim.player.mode === "foot" && dist(v.x, v.z, sim.player.x, sim.player.z) < 9) {
      v.honkT = (v.honkT || 0) - dt;
      if (v.honkT <= 0) {
        v.honkT = 3 + sim.rand() * 3;
        sim.emit({ type: "honk", x: v.x, z: v.z });
      }
    }
  }
}
