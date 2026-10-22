/**
 * Hill Rider physics — a small, stable 2D vehicle model (no engine library).
 *
 * Chassis: rigid body (position, angle, linear + angular velocity).
 * Wheels:  point masses with spin, each tied to a chassis anchor by a
 *          suspension: a spring-damper along the chassis "down" axis with
 *          travel limits, and a rigid sideways constraint (impulses).
 * Ground:  wheels are pushed out along the terrain normal; traction is a
 *          friction impulse on the contact-point slip, clamped to mu * N,
 *          so engine torque turns into motion (or wheelspin) naturally.
 *          Chassis corner points also collide; the driver's head touching
 *          the ground ends the run.
 * Fixed 240 Hz substeps keep it stable at any frame rate.
 *
 * stepWorld(w, dt, {gas, brake}) advances a run; gameplay events (coins,
 * fuel, flips, landings, crash) are pushed to w.events for the view.
 */
import { createTerrain } from "./terrain.js";
import { MAPS, tunedVehicle } from "./data.js";

const SUB = 1 / 240;
const cross = (ax, ay, bx, by) => ax * by - ay * bx;

export function createRun(mapId, vehicleId, upgrades = {}) {
  const map = MAPS[mapId];
  const v = tunedVehicle(vehicleId, upgrades);
  const terrain = createTerrain(map);
  const x0 = 6, ground = terrain.h(x0);
  const chassis = { x: x0, y: ground + v.radius + v.rest + 0.35, a: 0, vx: 0, vy: 0, w: 0, m: v.mass, I: v.mass * 0.9 };
  const wheels = v.anchors.map(([ax, ay], i) => ({
    i, ax, ay, x: x0 + ax, y: chassis.y + ay - v.rest, vx: 0, vy: 0, s: 0, phi: 0, m: v.wheelMass,
    I: v.wheelMass * v.radius * v.radius * 0.8, r: v.radius, contact: false, load: 0, drive: v.drive[i],
  }));
  return {
    map, mapId, v, terrain, chassis, wheels, g: map.gravity,
    fuel: 1, coins: 0, bonus: 0, dist: 0, maxX: x0, time: 0,
    air: 0, airRot: 0, flips: 0, grounded: true, upside: 0, stalled: 0,
    over: null, events: [], throttle: 0,
  };
}

/** chassis-local point -> world */
export function toWorld(c, lx, ly) {
  const cs = Math.cos(c.a), sn = Math.sin(c.a);
  return [c.x + lx * cs - ly * sn, c.y + lx * sn + ly * cs];
}

/** Apply impulse j along (nx, ny) at world point (px, py) of the chassis. */
function chassisImpulse(c, px, py, nx, ny, j) {
  c.vx += (nx * j) / c.m;
  c.vy += (ny * j) / c.m;
  c.w += (cross(px - c.x, py - c.y, nx, ny) * j) / c.I;
}

function substep(w, dt, gas, brake) {
  const c = w.chassis, v = w.v, T = w.terrain;
  const cs = Math.cos(c.a), sn = Math.sin(c.a);
  const dx = sn, dy = -cs; // chassis "down" axis
  const px = cs, py = sn; // chassis forward axis

  // gravity
  c.vy -= w.g * dt;
  for (const wh of w.wheels) wh.vy -= w.g * dt;

  // suspension springs (forces along the down axis)
  for (const wh of w.wheels) {
    const [ax, ay] = toWorld(c, wh.ax, wh.ay);
    const rx = ax - c.x, ry = ay - c.y;
    const avx = c.vx - c.w * ry, avy = c.vy + c.w * rx; // anchor velocity
    const ext = (wh.x - ax) * dx + (wh.y - ay) * dy;
    const rel = (wh.vx - avx) * dx + (wh.vy - avy) * dy;
    const f = -v.spring * (ext - v.rest) - v.damp * rel; // + pushes wheel down
    wh.vx += (f * dx * dt) / wh.m;
    wh.vy += (f * dy * dt) / wh.m;
    chassisImpulse(c, ax, ay, dx, dy, -f * dt);
  }

  // engine / brakes
  const speed = c.vx * px + c.vy * py;
  w.throttle = 0;
  for (const wh of w.wheels) {
    const spinV = wh.s * wh.r;
    let tq = 0;
    if (gas && w.fuel > 0) {
      tq = v.torque * wh.drive * Math.max(0, 1 - spinV / v.vmax);
      w.throttle = 1;
    } else if (brake) {
      if (speed > 0.8 && wh.s > 0) {
        // brake: slow the spin toward zero (never past it); the nose dips
        const ds = Math.min(wh.s, (v.torque * 2.5 * dt) / wh.I);
        wh.s -= ds;
        c.w -= (ds * wh.I * 0.55) / c.I;
      } else if (w.fuel > 0) {
        tq = -v.torque * 0.6 * wh.drive * Math.max(0, 1 + spinV / (v.vmax * 0.35));
        w.throttle = -1;
      }
    }
    if (tq) {
      wh.s += (tq * dt) / wh.I;
      // reaction torque tilts the chassis (wheelies / nose dives)
      c.w += (tq * dt * 0.55) / c.I;
    }
    wh.s *= 1 - (w.fuel > 0 ? 0.35 : 1.6) * dt; // rolling resistance (+ engine braking when dry)
  }
  // air control
  if (!w.grounded) c.w += ((gas ? 1 : 0) - (brake ? 1 : 0)) * v.air * dt;
  c.w *= 1 - 0.25 * dt;
  c.vx *= 1 - 0.015 * dt;

  // integrate
  c.x += c.vx * dt;
  c.y += c.vy * dt;
  c.a += c.w * dt;
  for (const wh of w.wheels) {
    wh.x += wh.vx * dt;
    wh.y += wh.vy * dt;
    wh.phi += wh.s * dt;
  }

  // suspension constraints: rigid sideways, travel limits along the axis
  for (let it = 0; it < 2; it++)
    for (const wh of w.wheels) {
      const [ax, ay] = toWorld(c, wh.ax, wh.ay);
      const cs2 = Math.cos(c.a), sn2 = Math.sin(c.a);
      const ddx = sn2, ddy = -cs2, ppx = cs2, ppy = sn2;
      const rx = ax - c.x, ry = ay - c.y;
      const solve = (nx, ny, err, velOnlyIfClosing) => {
        const rn = cross(rx, ry, nx, ny);
        const k = 1 / wh.m + 1 / c.m + (rn * rn) / c.I;
        // position projection
        const pj = -err / k;
        wh.x += (nx * pj) / wh.m;
        wh.y += (ny * pj) / wh.m;
        c.x -= (nx * pj) / c.m;
        c.y -= (ny * pj) / c.m;
        c.a -= (rn * pj) / c.I;
        // velocity
        const avx = c.vx - c.w * ry, avy = c.vy + c.w * rx;
        const vrel = (wh.vx - avx) * nx + (wh.vy - avy) * ny;
        if (velOnlyIfClosing && vrel * Math.sign(err) <= 0) return;
        const j = -vrel / k;
        wh.vx += (nx * j) / wh.m;
        wh.vy += (ny * j) / wh.m;
        chassisImpulse(c, ax, ay, nx, ny, -j);
      };
      const lat = (wh.x - ax) * ppx + (wh.y - ay) * ppy;
      solve(ppx, ppy, lat, false);
      const ext = (wh.x - ax) * ddx + (wh.y - ay) * ddy;
      if (ext < v.travel[0]) solve(ddx, ddy, ext - v.travel[0], true);
      else if (ext > v.travel[1]) solve(ddx, ddy, ext - v.travel[1], true);
    }

  // wheel / ground contact with traction
  const mu = w.map.friction * v.grip;
  for (const wh of w.wheels) {
    const { y: gy, dy: slope } = T.at(wh.x);
    const inv = 1 / Math.hypot(1, slope);
    const nx = -slope * inv, ny = inv, tx = inv, ty = slope * inv;
    const dist = (wh.y - gy) * inv;
    wh.contact = dist < wh.r + 0.02;
    if (dist >= wh.r) continue;
    const pen = wh.r - dist;
    wh.x += nx * pen;
    wh.y += ny * pen;
    let jn = 0;
    const un = wh.vx * nx + wh.vy * ny;
    if (un < 0) {
      jn = -un * wh.m * 1.05;
      wh.vx += (nx * jn) / wh.m;
      wh.vy += (ny * jn) / wh.m;
    }
    wh.load = jn / dt;
    // traction: kill contact-point slip within the friction cone
    const slip = wh.vx * tx + wh.vy * ty - wh.s * wh.r;
    const kt = 1 / wh.m + (wh.r * wh.r) / wh.I;
    let jt = -slip / kt;
    const lim = mu * Math.max(jn, wh.m * w.g * dt * 0.5) * 1.2;
    jt = Math.max(-lim, Math.min(lim, jt));
    wh.vx += (tx * jt) / wh.m;
    wh.vy += (ty * jt) / wh.m;
    wh.s -= (wh.r * jt) / wh.I;
    wh.slip = Math.abs(slip);
  }

  // chassis points vs ground (sliding contacts), head = crash
  let bodyContact = false;
  for (const [lx, ly] of v.body) {
    const [qx, qy] = toWorld(c, lx, ly);
    const { y: gy, dy: slope } = T.at(qx);
    const inv = 1 / Math.hypot(1, slope);
    const pen = (gy - qy) * inv;
    if (pen <= 0) continue;
    bodyContact = true;
    const nx = -slope * inv, ny = inv;
    const rx = qx - c.x, ry = qy - c.y, rn = cross(rx, ry, nx, ny);
    const k = 1 / c.m + (rn * rn) / c.I;
    c.x += (nx * pen * 0.8) / (c.m * k);
    c.y += (ny * pen * 0.8) / (c.m * k);
    c.a += (rn * pen * 0.8) / (c.I * k);
    const pvx = c.vx - c.w * ry, pvy = c.vy + c.w * rx;
    const un = pvx * nx + pvy * ny;
    if (un < 0) {
      const j = (-un * 1.2) / k;
      chassisImpulse(c, qx, qy, nx, ny, j);
      // scraping friction
      const ut = pvx * -ny + pvy * nx;
      const kt = 1 / c.m + cross(rx, ry, -ny, nx) ** 2 / c.I;
      const jt = Math.max(-0.6 * j, Math.min(0.6 * j, -ut / kt));
      chassisImpulse(c, qx, qy, -ny, nx, jt);
    }
  }
  const [hx, hy] = toWorld(c, v.head[0], v.head[1]);
  if (!w.over && hy - v.headR < T.h(hx)) w.over = "crash";
  return bodyContact;
}

const PICK_R = 1.25;

export function stepWorld(w, dt, input = {}) {
  if (w.over && w.overTimer <= 0) return w;
  dt = Math.min(dt, 1 / 20);
  const gas = !w.over && !!input.gas, brake = !w.over && !!input.brake;
  const n = Math.max(1, Math.round(dt / SUB));
  let body = false;
  const wasGrounded = w.grounded;
  const impact = Math.min(w.chassis.vy, ...w.wheels.map((wh) => wh.vy));
  for (let k = 0; k < n; k++) body = substep(w, dt / n, gas, brake) || body;
  w.time += dt;
  const c = w.chassis;

  // airtime + flips
  w.grounded = body || w.wheels.some((wh) => wh.contact);
  if (!w.grounded) {
    w.air += dt;
    w.airRot += c.w * dt;
    const done = Math.floor((Math.abs(w.airRot) + 0.6) / (Math.PI * 2));
    if (done > w.flips) {
      w.flips = done;
      const pts = 100;
      w.bonus += pts;
      w.events.push({ type: "flip", back: w.airRot > 0, pts, n: done });
    }
  } else {
    if (!wasGrounded) {
      w.events.push({ type: "land", force: -impact, x: c.x });
      if (w.air > 1.2 && !w.over) {
        const pts = Math.round(w.air * 10);
        w.bonus += pts;
        w.events.push({ type: "air", secs: w.air, pts });
      }
    }
    w.air = 0;
    w.airRot = 0;
    w.flips = 0;
  }

  // fuel
  if (!w.over) {
    w.fuel = Math.max(0, w.fuel - (dt * (0.3 + 0.7 * Math.abs(w.throttle))) / w.v.fuelTime);
    if (w.fuel <= 0 && w.fuel + dt > 0 && !w.fuelOutSent) (w.fuelOutSent = true), w.events.push({ type: "fuelOut" });
  }

  // pickups (checked near the chassis and both wheels)
  const T = w.terrain;
  const pts = [[c.x, c.y], ...w.wheels.map((wh) => [wh.x, wh.y])];
  const near = (x, y) => pts.some(([px, py]) => Math.abs(px - x) < PICK_R && Math.abs(py - y) < PICK_R * 1.4);
  for (const coin of T.coins) {
    if (coin.got || coin.x < c.x - 6) continue;
    if (coin.x > c.x + 6) break;
    if (near(coin.x, T.h(coin.x) + 1.1)) {
      coin.got = true;
      w.coins += coin.v;
      w.events.push({ type: "coin", v: coin.v, x: coin.x, y: T.h(coin.x) + 1.1 });
    }
  }
  for (const can of T.cans) {
    if (can.got || can.x < c.x - 6) continue;
    if (can.x > c.x + 6) break;
    if (near(can.x, T.h(can.x) + 0.9)) {
      can.got = true;
      w.fuel = 1;
      w.fuelOutSent = false;
      w.events.push({ type: "fuel", x: can.x, y: T.h(can.x) + 0.9 });
    }
  }

  w.maxX = Math.max(w.maxX, c.x);
  w.dist = Math.max(0, Math.floor(w.maxX - 6));

  // game over: head hit, long upside-down, or out of fuel and stopped
  const up = Math.cos(c.a);
  w.upside = up < -0.2 && Math.hypot(c.vx, c.vy) < 2 ? w.upside + dt : 0;
  if (!w.over && w.upside > 2) w.over = "flipped";
  const slow = Math.hypot(c.vx, c.vy) < 0.8;
  w.dry = w.fuel <= 0 ? (w.dry || 0) + dt : 0;
  w.stalled = w.fuel <= 0 && slow ? w.stalled + dt : 0;
  if (!w.over && (w.stalled > 1.2 || w.dry > 12)) w.over = "fuel";
  if (w.over && w.overTimer === undefined) {
    w.overTimer = w.over === "fuel" ? 0.2 : 1.4; // let the crash play out
    w.events.push({ type: "over", reason: w.over });
  }
  if (w.overTimer !== undefined && (w.overTimer -= dt) <= 0) w.events.push({ type: "done", reason: w.over });
  return w;
}
