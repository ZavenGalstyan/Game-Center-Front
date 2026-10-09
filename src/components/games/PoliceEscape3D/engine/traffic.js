/**
 * Police Escape 3D — lightweight civilian traffic.
 *
 * A fixed POOL of cars that only exists around the player (spawned 110–240 m
 * away on roads, recycled when they drift beyond ~300 m) — the rest of the
 * city is never simulated. Each car is kinematic: it rides the right-hand
 * lane of a graph edge, turns through intersections along a smooth curve
 * (random exit, never a U-turn unless it's a dead end), stops for red lights
 * at signalled crossroads, keeps its distance to the car ahead and brakes for
 * the player / police in its lane.
 *
 * When something hits it, it gets shoved (position + spin), stalls for a few
 * seconds, then eases back into its lane and carries on.
 */
import { edgePoint } from "./city.js";
import { clamp, wrapAngle } from "./util.js";

export const TRAFFIC_STYLES = ["sedan", "compact", "suv", "van", "taxi"];
const LIGHT_PERIOD = 12;
const LANE = (w) => Math.min(3.6, w / 4 + 0.2);

/** Light state of a node for an edge axis at time t: "green" | "yellow" | "red". */
export function lightFor(node, axis, t) {
  if (!node.light) return "green";
  const ph = (t + (node.id * 3.7) % LIGHT_PERIOD) % LIGHT_PERIOD;
  const xGreen = ph < 5 ? "green" : ph < 6 ? "yellow" : "red";
  const zGreen = ph < 6 ? "red" : ph < 11 ? "green" : ph < 12 ? "yellow" : "red";
  return axis === "x" ? xGreen : zGreen;
}

export function createTraffic(city, n, rand) {
  const cars = [];
  for (let i = 0; i < n; i++) cars.push({ id: i, active: false, style: TRAFFIC_STYLES[i % TRAFFIC_STYLES.length], color: Math.floor(rand() * 8), x: 0, z: 0, h: 0, v: 0, e: -1, dir: 1, t: 0, turn: null, stall: 0, off: { x: 0, z: 0, h: 0 }, wheelSpin: 0, braking: false });
  return { cars, rand, city };
}

/** Pose of a car riding edge e in direction dir at distance t from its start node. */
function lanePose(city, e, dir, t) {
  const lane = LANE(e.w);
  if (dir > 0) return edgePoint(city, e, t, -lane);
  const p = edgePoint(city, e, e.len - t, lane);
  return { x: p.x, z: p.z, h: wrapAngle(p.h + Math.PI) };
}
const endNode = (e, dir) => (dir > 0 ? e.b : e.a);

function spawn(tr, car, px, pz) {
  const { city, rand } = tr;
  for (let tries = 0; tries < 40; tries++) {
    const e = city.edges[Math.floor(rand() * city.edges.length)];
    if (e.kind === "drive" || e.kind === "alley" || e.blocked || e.len < 30) continue;
    const dir = rand() < 0.5 ? 1 : -1;
    const t = 8 + rand() * (e.len - 16);
    const p = lanePose(city, e, dir, t);
    const d = Math.hypot(p.x - px, p.z - pz);
    if (d < 110 || d > 240) continue;
    // keep spacing from other traffic
    if (tr.cars.some((o) => o.active && Math.hypot(o.x - p.x, o.z - p.z) < 18)) continue;
    Object.assign(car, { active: true, e: e.id, dir, t, x: p.x, z: p.z, h: p.h, v: 9 + rand() * 5, turn: null, stall: 0, off: { x: 0, z: 0, h: 0 }, cruise: 9 + rand() * 5 });
    return true;
  }
  return false;
}

/** Choose the next edge at the end of the current one (no U-turn unless dead end). */
function nextEdge(tr, car) {
  const { city, rand } = tr;
  const e = city.edges[car.e];
  const node = city.nodes[endNode(e, car.dir)];
  const opts = node.adj.filter((a) => a.e !== car.e && city.edges[a.e].kind !== "drive" && city.edges[a.e].kind !== "alley" && !city.edges[a.e].blocked);
  if (!opts.length) return { e: car.e, dir: -car.dir, node };
  const pick = opts[Math.floor(rand() * opts.length)];
  const ne = city.edges[pick.e];
  return { e: ne.id, dir: ne.a === node.id ? 1 : -1, node };
}

/**
 * One step. actors = [{ x, z }] — player and police (for braking / spawning).
 * clock = run clock (traffic lights).
 */
export function stepTraffic(tr, dt, player, actors, clock) {
  const { city } = tr;
  for (const car of tr.cars) {
    if (!car.active) {
      spawn(tr, car, player.x, player.z);
      continue;
    }
    if (Math.hypot(car.x - player.x, car.z - player.z) > 300) {
      car.active = false;
      continue;
    }
    if (tr.city.edges[car.e].blocked && !car.turn) {
      car.active = false; // a roadblock went up on its road: recycle it
      continue;
    }
    // knocked: stall, then ease the offset away
    if (car.stall > 0) {
      car.stall -= dt;
      car.v = Math.max(0, car.v - 12 * dt);
      car.braking = true;
      car.x = car.base.x + car.off.x;
      car.z = car.base.z + car.off.z;
      car.h = car.base.h + car.off.h;
      continue;
    }
    if (car.off.x || car.off.z || car.off.h) {
      const k = Math.exp(-2 * dt);
      car.off.x *= k;
      car.off.z *= k;
      car.off.h *= k;
      if (Math.abs(car.off.x) + Math.abs(car.off.z) + Math.abs(car.off.h) < 0.05) car.off = { x: 0, z: 0, h: 0 };
    }
    const e = city.edges[car.e];
    // target speed: cruise, slower for lights / cars ahead / actors ahead
    let vT = car.cruise;
    const stopAt = e.len - 9; // stop line before the intersection
    if (!car.turn) {
      const node = city.nodes[endNode(e, car.dir)];
      const light = lightFor(node, e.axis, clock);
      if (light !== "green" && car.t < stopAt + 0.5 && car.t > stopAt - 30) vT = Math.min(vT, Math.max(0, (stopAt - car.t) * 0.6));
    }
    const fx = Math.sin(car.h);
    const fz = Math.cos(car.h);
    const ahead = (ox, oz, range) => {
      const dx = ox - car.x;
      const dz = oz - car.z;
      const along = dx * fx + dz * fz;
      const lat = Math.abs(dx * fz - dz * fx);
      return along > 0 && along < range && lat < 2.6 ? along : null;
    };
    for (const o of tr.cars) {
      if (o === car || !o.active) continue;
      const d = ahead(o.x, o.z, 16);
      if (d != null) vT = Math.min(vT, Math.max(0, (d - 7) * 0.9));
    }
    for (const a of actors) {
      const d = ahead(a.x, a.z, 14);
      if (d != null) vT = Math.min(vT, Math.max(0, (d - 6) * 0.8));
    }
    car.braking = vT < car.v - 0.5;
    car.v += clamp(vT - car.v, -9 * dt, 4 * dt);
    const step = car.v * dt;
    if (car.turn) {
      const T = car.turn;
      T.u += step / T.len;
      if (T.u >= 1) {
        car.e = T.ne;
        car.dir = T.ndir;
        car.t = T.t1;
        car.turn = null;
      } else {
        const u = T.u;
        const x = (1 - u) * (1 - u) * T.p0.x + 2 * (1 - u) * u * T.c.x + u * u * T.p1.x;
        const z = (1 - u) * (1 - u) * T.p0.z + 2 * (1 - u) * u * T.c.z + u * u * T.p1.z;
        const dx = 2 * (1 - u) * (T.c.x - T.p0.x) + 2 * u * (T.p1.x - T.c.x);
        const dz = 2 * (1 - u) * (T.c.z - T.p0.z) + 2 * u * (T.p1.z - T.c.z);
        car.base = { x, z, h: Math.atan2(dx, dz) };
      }
    } else {
      car.t += step;
      const turnStart = e.len - 7;
      if (car.t >= turnStart) {
        const nx = nextEdge(tr, car);
        const ne = city.edges[nx.e];
        const p0 = lanePose(city, e, car.dir, Math.min(car.t, e.len));
        const t1 = Math.min(7, ne.len / 2);
        const p1 = lanePose(city, ne, nx.dir, t1);
        const node = nx.node;
        // control point: where the two lane lines cross (or the node for a U-turn)
        let c = { x: node.x, z: node.z };
        const f0x = Math.sin(p0.h);
        const f0z = Math.cos(p0.h);
        const f1x = Math.sin(p1.h);
        const f1z = Math.cos(p1.h);
        const den = f0x * f1z - f0z * f1x;
        if (Math.abs(den) > 0.2) {
          const s = ((p1.x - p0.x) * f1z - (p1.z - p0.z) * f1x) / den;
          c = { x: p0.x + f0x * s, z: p0.z + f0z * s };
        } else if (nx.e !== car.e) c = { x: (p0.x + p1.x) / 2, z: (p0.z + p1.z) / 2 };
        const len = Math.max(4, Math.hypot(c.x - p0.x, c.z - p0.z) + Math.hypot(p1.x - c.x, p1.z - c.z));
        car.turn = { p0, p1, c, len, u: 0, ne: nx.e, ndir: nx.dir, t1 };
      }
      if (!car.turn) {
        const p = lanePose(city, e, car.dir, car.t);
        car.base = { x: p.x, z: p.z, h: p.h };
      }
    }
    if (car.base) {
      car.x = car.base.x + car.off.x;
      car.z = car.base.z + car.off.z;
      car.h = car.base.h + car.off.h;
    }
    car.wheelSpin += step / 0.34;
  }
}

/** Shove a traffic car (from a collision): it stalls, offset from its lane. */
export function knockTraffic(car, dx, dz, spin) {
  if (!car.base) car.base = { x: car.x, z: car.z, h: car.h };
  car.off.x += dx;
  car.off.z += dz;
  car.off.h += spin;
  car.off.x = clamp(car.off.x, -5, 5);
  car.off.z = clamp(car.off.z, -5, 5);
  car.stall = 2.5;
  car.v = 0;
}
