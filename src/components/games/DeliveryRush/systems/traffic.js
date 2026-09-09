/**
 * Delivery Rush — traffic.
 *
 * Deliberately not GTA. Cars follow the directed lane graph the layout already
 * produced: drive along an edge, pick a new edge at the node, repeat. On top of
 * that sit three behaviours that are all it takes to read as real traffic:
 *
 *   - car following: brake for whatever is in the lane ahead (including you)
 *   - junction lights: a shared cycle, with each junction offset by position
 *   - recycling: a car that ends up far behind the player is quietly moved to
 *     a lane 90-150 m away, never inside view distance
 *
 * The system owns no meshes. It exposes a flat array of car states that the
 * renderer copies into InstancedMesh matrices once per frame.
 */

import { makeRng } from "../utils/rng.js";

const CYCLE = 16; // seconds for a full traffic-light cycle
const GREEN = 0.44; // fraction of the cycle each axis gets
const AMBER = 0.06;
const CELL = 14;

export const DENSITY = { low: 0.5, medium: 1, high: 1.55 };

export class TrafficSystem {
  constructor(layout, types, { density = "medium", zoneBias = 1, seed = 11 } = {}) {
    this.layout = layout;
    this.types = types;
    this.edges = layout.lanes.edges;
    this.nodes = layout.lanes.nodes;
    this.rng = makeRng(seed);
    this.time = 0;
    this.grid = new Map();

    // junctions get a phase offset from their coordinates so the whole city
    // does not blink in unison
    for (const n of this.nodes) {
      n.phase = ((Math.abs(n.x * 0.37 + n.z * 0.71) % CYCLE) / CYCLE) * CYCLE;
    }

    const laneLength = this.edges.reduce((a, e) => a + e.len, 0);
    const target = Math.round((laneLength / 210) * (DENSITY[density] ?? 1) * zoneBias);
    this.count = Math.max(4, Math.min(48, target));

    this.cars = [];
    for (let i = 0; i < this.count; i++) {
      const type = i % this.types.length;
      const car = {
        id: i,
        type,
        color: this.rng.int(0, 9),
        edge: 0,
        t: 0,
        speed: 0,
        x: 0,
        z: 0,
        yaw: 0,
        braking: false,
        stopped: false,
      };
      this.cars.push(car);
      this.place(car, null);
    }
  }

  /** Drop a car on a random edge, optionally keeping it away from a point. */
  place(car, away) {
    for (let tries = 0; tries < 24; tries++) {
      const e = this.edges[this.rng.int(0, this.edges.length - 1)];
      if (e.len < 14) continue;
      const t = this.rng.range(2, e.len - 2);
      const x = e.ax + e.ux * t;
      const z = e.az + e.uz * t;
      if (away) {
        const d = Math.hypot(x - away.x, z - away.z);
        if (d < away.min || d > away.max) continue;
      }
      car.edge = e.id;
      car.t = t;
      car.speed = e.speed * 0.7;
      this.pose(car);
      return true;
    }
    return false;
  }

  pose(car) {
    const e = this.edges[car.edge];
    car.x = e.ax + e.ux * car.t;
    car.z = e.az + e.uz * car.t;
    car.yaw = Math.atan2(e.ux, e.uz);
  }

  /** Green for the given axis at this node right now? */
  lightGreen(node, axis) {
    if (!node.junction) return true;
    const p = ((this.time + node.phase) % CYCLE) / CYCLE;
    const mine = axis === 0 ? p < GREEN : p >= 0.5 && p < 0.5 + GREEN;
    return mine;
  }

  /** Amber warning window, used only to make cars ease off early. */
  lightAmber(node, axis) {
    const p = ((this.time + node.phase) % CYCLE) / CYCLE;
    return axis === 0
      ? p >= GREEN && p < GREEN + AMBER
      : p >= 0.5 + GREEN && p < 0.5 + GREEN + AMBER;
  }

  _hash(x, z) {
    return Math.floor(x / CELL) * 73856093 + Math.floor(z / CELL) * 19349663;
  }

  _rebuildGrid(player) {
    this.grid.clear();
    for (const c of this.cars) {
      const k = this._hash(c.x, c.z);
      let l = this.grid.get(k);
      if (!l) this.grid.set(k, (l = []));
      l.push(c);
    }
    this.player = player;
  }

  /** Distance to the nearest thing in front of `car`, or Infinity. */
  _gapAhead(car) {
    const e = this.edges[car.edge];
    let best = Infinity;
    const look = 16;
    for (let step = 4; step <= look; step += 4) {
      const px = car.x + e.ux * step;
      const pz = car.z + e.uz * step;
      const cx = Math.floor(px / CELL);
      const cz = Math.floor(pz / CELL);
      for (let ox = -1; ox <= 1; ox++) {
        for (let oz = -1; oz <= 1; oz++) {
          const l = this.grid.get((cx + ox) * 73856093 + (cz + oz) * 19349663);
          if (!l) continue;
          for (const o of l) {
            if (o === car) continue;
            const dx = o.x - car.x;
            const dz = o.z - car.z;
            const along = dx * e.ux + dz * e.uz;
            if (along <= 0.5 || along > look) continue;
            const side = Math.abs(dx * e.uz - dz * e.ux);
            if (side > 2.6) continue;
            if (along < best) best = along;
          }
        }
      }
    }
    const p = this.player;
    if (p) {
      const dx = p.x - car.x;
      const dz = p.z - car.z;
      const along = dx * e.ux + dz * e.uz;
      const side = Math.abs(dx * e.uz - dz * e.ux);
      if (along > 0.5 && along < look && side < 3.0 && along < best) best = along;
    }
    return best;
  }

  update(dt, player, options = {}) {
    this.time += dt;
    this._rebuildGrid(player);
    const recycle = options.recycle !== false;

    for (const car of this.cars) {
      const e = this.edges[car.edge];
      const typeSpeed = this.types[car.type]?.speed ?? 1;
      let target = e.speed * typeSpeed;

      // hold back for whatever is ahead
      const gap = this._gapAhead(car);
      if (gap < 13) target = Math.min(target, Math.max(0, (gap - 5.5) * 1.5));

      // junction lights
      const node = this.nodes[e.to];
      const toNode = e.len - car.t;
      if (node && node.junction && toNode < 20) {
        const green = this.lightGreen(node, e.axis);
        const amber = this.lightAmber(node, e.axis);
        if (!green) {
          const stopAt = Math.max(0, toNode - 6.5);
          target = Math.min(target, stopAt * 0.9);
        } else if (amber) {
          target = Math.min(target, e.speed * 0.55);
        }
      }

      const accel = target > car.speed ? 4.2 : 9.5;
      car.speed += Math.max(-accel * dt, Math.min(accel * dt, target - car.speed));
      if (car.speed < 0) car.speed = 0;
      car.braking = target < car.speed - 0.3 || car.speed < 1.2;
      car.stopped = car.speed < 0.25;

      car.t += car.speed * dt;
      if (car.t >= e.len) {
        car.t -= e.len;
        const next = this.pickNext(e);
        if (next == null) {
          this.place(car, player ? { x: player.x, z: player.z, min: 90, max: 150 } : null);
          continue;
        }
        car.edge = next;
        car.t = Math.min(car.t, this.edges[next].len - 0.1);
      }
      this.pose(car);

      if (recycle && player) {
        const d = Math.hypot(car.x - player.x, car.z - player.z);
        if (d > 210) this.place(car, { x: player.x, z: player.z, min: 90, max: 155 });
      }
    }
  }

  /** Choose an outgoing edge at the end of `e`, never an immediate U-turn. */
  pickNext(e) {
    const node = this.nodes[e.to];
    if (!node || node.out.length === 0) return null;
    const options = node.out.filter((id) => this.edges[id].to !== e.from);
    const pool = options.length ? options : node.out;
    return pool[this.rng.int(0, pool.length - 1)];
  }

  /**
   * Push the player out of any traffic car they have run into.
   * Returns the impact speed, or 0. Also shoves the traffic car forward a
   * little so a rear-end nudge does not look like hitting a wall.
   */
  resolvePlayer(state, radius = 1.05, offsets = [1.25, -1.25]) {
    let impact = 0;
    const fx = Math.sin(state.yaw);
    const fz = Math.cos(state.yaw);
    for (const car of this.cars) {
      const dx = car.x - state.x;
      const dz = car.z - state.z;
      if (dx * dx + dz * dz > 90) continue;
      const type = this.types[car.type];
      for (const off of offsets) {
        const cx = state.x + fx * off;
        const cz = state.z + fz * off;
        const hit = circleVsBox(cx, cz, radius, car.x, car.z, type.hw, type.hd, car.yaw);
        if (!hit) continue;
        state.x += hit.nx * hit.pen;
        state.z += hit.nz * hit.pen;
        const vn = state.vx * hit.nx + state.vz * hit.nz;
        if (vn < 0) {
          state.vx -= hit.nx * vn * 1.25;
          state.vz -= hit.nz * vn * 1.25;
          impact = Math.max(impact, -vn);
          // give the struck car a shove and make it brake
          car.speed = Math.max(0, car.speed - 3);
          car.t += 0.35;
        }
        const rx = fz;
        const rz = -fx;
        state.speed = (state.vx * fx + state.vz * fz) * 0.86;
        state.lateral = (state.vx * rx + state.vz * rz) * 0.86;
        state.vx = fx * state.speed + rx * state.lateral;
        state.vz = fz * state.speed + rz * state.lateral;
      }
    }
    return impact;
  }
}

/** Circle vs oriented box: returns the shortest push-out, or null. */
export function circleVsBox(x, z, r, bx, bz, hw, hd, yaw) {
  const dx = x - bx;
  const dz = z - bz;
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const lx = dx * c - dz * s;
  const lz = dx * s + dz * c;
  const cx = lx < -hw ? -hw : lx > hw ? hw : lx;
  const cz = lz < -hd ? -hd : lz > hd ? hd : lz;
  let ox = lx - cx;
  let oz = lz - cz;
  let d = Math.hypot(ox, oz);
  if (d > r) return null;
  if (d < 1e-4) {
    const toX = hw - Math.abs(lx);
    const toZ = hd - Math.abs(lz);
    if (toX < toZ) {
      ox = lx >= 0 ? 1 : -1;
      oz = 0;
      d = -toX;
    } else {
      ox = 0;
      oz = lz >= 0 ? 1 : -1;
      d = -toZ;
    }
  } else {
    ox /= d;
    oz /= d;
  }
  const pen = r - d;
  if (pen <= 0) return null;
  return { nx: ox * c + oz * s, nz: -ox * s + oz * c, pen };
}
