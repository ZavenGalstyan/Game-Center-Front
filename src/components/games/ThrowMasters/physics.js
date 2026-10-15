/**
 * Throw Masters — 2D projectile physics. Pure functions over plain objects so
 * the live battle, the AI planner, the aim preview and the headless tests all
 * run the exact same simulation.
 *
 * World: y grows downwards, gravity pulls +y. Everything steps at a fixed
 * 1/120 s so results don't depend on the display frame rate.
 */
import { W, H, GRAVITY, WEAPONS } from "./data.js";

export const STEP = 1 / 120;
const DEG = Math.PI / 180;

/** How strongly wind pushes each weapon (light / floaty weapons drift more). */
const WIND_K = { hammer: 0.55, spear: 0.75, arrow: 0.8, axe: 0.85, bomb: 0.8, fireball: 1.1, crystal: 1.35, boomerang: 1.25, knives: 1, shuriken: 0.9 };
/** Sharp, pointy weapons test collisions at their tip (offset along velocity). */
const TIP = { arrow: 22, spear: 46 };

/* ------------------------------------------------------------------ ground */

/** Ground height (y) under x for a polyline [[x, y], …] sorted by x. */
export function groundY(ground, x) {
  if (x <= ground[0][0]) return ground[0][1];
  for (let i = 1; i < ground.length; i++) {
    const [x1, y1] = ground[i];
    if (x <= x1) {
      const [x0, y0] = ground[i - 1];
      return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
    }
  }
  return ground[ground.length - 1][1];
}

function groundNormal(ground, x) {
  const d = groundY(ground, x + 4) - groundY(ground, x - 4);
  const len = Math.hypot(d, 8);
  return { nx: d / len, ny: -8 / len };
}

/* ------------------------------------------------------------------ fighters */

/** Hitbox geometry of a fighter (feet at f.x, f.y; k = body scale). */
export function fighterBox(f) {
  const k = f.k || 1;
  return {
    hx: f.x + f.dir * 3 * k,
    hy: f.y - 118 * k,
    hr: 25 * k,
    left: f.x - 22 * k,
    right: f.x + 22 * k,
    top: f.y - 96 * k,
    bottom: f.y,
    legs: f.y - 40 * k,
    cx: f.x,
    cy: f.y - 70 * k,
  };
}

/** Which zone (head / body / legs) a circle at (px, py, r) touches, or null. */
export function hitZone(f, px, py, r) {
  const b = fighterBox(f);
  if (Math.hypot(px - b.hx, py - b.hy) < b.hr + r) return "head";
  const qx = Math.max(b.left, Math.min(b.right, px));
  const qy = Math.max(b.top, Math.min(b.bottom, py));
  if (Math.hypot(px - qx, py - qy) < r) return py > b.legs ? "legs" : "body";
  return null;
}

/** Shortest distance from a point to a fighter's body (for blast falloff). */
export function distToFighter(f, px, py) {
  const b = fighterBox(f);
  const dh = Math.hypot(px - b.hx, py - b.hy) - b.hr;
  const qx = Math.max(b.left, Math.min(b.right, px));
  const qy = Math.max(b.top, Math.min(b.bottom, py));
  return Math.max(0, Math.min(dh, Math.hypot(px - qx, py - qy)));
}

/* ------------------------------------------------------------------ obstacles */

function hitObstacle(o, px, py, r) {
  if (o.type === "circle") {
    const dx = px - o.x;
    const dy = py - o.y;
    const d = Math.hypot(dx, dy);
    if (d >= o.r + r) return null;
    return d > 0 ? { nx: dx / d, ny: dy / d } : { nx: 0, ny: -1 };
  }
  const qx = Math.max(o.x, Math.min(o.x + o.w, px));
  const qy = Math.max(o.y, Math.min(o.y + o.h, py));
  const dx = px - qx;
  const dy = py - qy;
  const d = Math.hypot(dx, dy);
  if (d >= r) return null;
  if (d > 0) return { nx: dx / d, ny: dy / d };
  // centre inside the rect: push out along the shallowest axis
  const pen = [
    [px - o.x, -1, 0],
    [o.x + o.w - px, 1, 0],
    [py - o.y, 0, -1],
    [o.y + o.h - py, 0, 1],
  ].sort((a, b) => a[0] - b[0])[0];
  return { nx: pen[1], ny: pen[2] };
}

/* ------------------------------------------------------------------ launch */

/** Launch point (throwing hand) for a fighter. */
export function launchOrigin(f) {
  const k = f.k || 1;
  return { x: f.x + f.dir * 28 * k, y: f.y - 106 * k };
}

/** Launch speed for a weapon / fighter at a 0..1 power. */
export function launchSpeed(weaponId, powerStat, power) {
  return WEAPONS[weaponId].speed * (powerStat || 1) * Math.max(0.08, Math.min(1, power));
}

/**
 * Create the projectile(s) for a throw. `angle` is in degrees above the
 * horizontal, measured towards the fighter's facing direction.
 */
export function launch(f, weaponId, angle, power, extra = {}) {
  const w = WEAPONS[weaponId];
  const o = launchOrigin(f);
  const v = launchSpeed(weaponId, f.power, power);
  const shots = [];
  const n = w.count || 1;
  for (let i = 0; i < n; i++) {
    const off = n > 1 ? (i - (n - 1) / 2) * w.spread : 0;
    const a = (angle + off) * DEG;
    const vv = v * (n > 1 ? 1 - Math.abs(i - (n - 1) / 2) * 0.015 : 1);
    shots.push({
      w,
      id: weaponId,
      owner: f.side,
      ownerX: f.x,
      dir: f.dir,
      x: o.x,
      y: o.y,
      vx: Math.cos(a) * vv * f.dir,
      vy: -Math.sin(a) * vv,
      rot: f.dir > 0 ? -a : Math.PI + a,
      t: 0,
      ricochet: w.ricochet || 0,
      resting: false,
      alive: true,
      ...extra,
    });
  }
  return shots;
}

/* ------------------------------------------------------------------ step */

/**
 * Advance one projectile by `dt` (call with STEP). Returns an event object or
 * null. Events with `end: true` mean the projectile is finished.
 *   fighter  {side, zone, x, y}   ground {x, y}   obstacle {o, x, y}
 *   explode  {x, y}               caught / out    bounce / ricochet (end: false)
 *   target   {target, d}
 * The caller applies damage and effects; this function only moves the shot.
 */
export function stepProjectile(world, p, dt) {
  const w = p.w;
  p.t += dt;

  if (w.fuse && p.t >= w.fuse) return { type: "explode", x: p.x, y: p.y, end: true };
  if (w.life && p.t >= w.life) return { type: "out", end: true };

  if (p.resting) return null;

  // forces
  let ax = (world.wind || 0) * 0.6 * (WIND_K[p.id] ?? 1);
  const ay = GRAVITY * w.grav;
  if (w.ret) ax -= p.dir * w.ret;
  p.vx += ax * dt;
  p.vy += ay * dt;
  const drag = Math.max(0, 1 - w.drag * dt);
  p.vx *= drag;
  p.vy *= drag;

  const px = p.x;
  const py = p.y;
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  if (w.spin) p.rot += w.spin * dt * p.dir;
  else p.rot = Math.atan2(p.vy, p.vx);

  // collision point: weapon tip for pointy weapons
  let cx = p.x;
  let cy = p.y;
  const tip = TIP[p.id];
  if (tip) {
    const sp = Math.hypot(p.vx, p.vy) || 1;
    cx += (p.vx / sp) * tip;
    cy += (p.vy / sp) * tip;
  }
  const r = tip ? 5 : w.r;

  // boomerang caught on its way home
  if (w.ret && p.t > 0.3 && (p.x - p.ownerX) * p.dir < 0) return { type: "caught", end: true };

  // targets (Target Challenge)
  if (world.targets) {
    for (const tg of world.targets) {
      if (!tg.alive) continue;
      const d = Math.hypot(cx - tg.x, cy - tg.y);
      if (d < tg.r + r * 0.6) return { type: "target", target: tg, d, x: cx, y: cy, end: true };
    }
  }

  // fighters (never the thrower)
  for (const f of world.fighters) {
    if (f.side === p.owner || f.dead) continue;
    const zone = hitZone(f, cx, cy, r);
    if (zone) {
      if (w.fuse) return { type: "explode", x: p.x, y: p.y, end: true, direct: f.side };
      return { type: "fighter", side: f.side, zone, x: cx, y: cy, end: true };
    }
  }

  // obstacles
  for (const o of world.obstacles) {
    const n = hitObstacle(o, cx, cy, r);
    if (!n) continue;
    if (w.bounce || p.ricochet > 0) {
      p.x = px;
      p.y = py;
      reflect(p, n.nx, n.ny, w.bounce || 0.7);
      if (p.ricochet > 0) p.ricochet--;
      return { type: w.bounce ? "bounce" : "ricochet", x: cx, y: cy, o, end: false };
    }
    return { type: "obstacle", o, x: cx, y: cy, end: true };
  }

  // ground
  const gy = groundY(world.ground, cx);
  const sink = w.sticks ? r * 0.2 : r * 0.85;
  if (cy + sink >= gy) {
    if (w.bounce || p.ricochet > 0) {
      const n = groundNormal(world.ground, cx);
      p.x = px;
      p.y = Math.min(py, groundY(world.ground, px) - sink - 0.5);
      reflect(p, n.nx, n.ny, w.bounce || 0.7);
      if (p.ricochet > 0) p.ricochet--;
      else if (Math.hypot(p.vx, p.vy) < 90) {
        p.resting = true;
        p.vx = p.vy = 0;
      }
      return { type: w.bounce ? "bounce" : "ricochet", x: cx, y: gy, end: false };
    }
    p.y += gy - (cy + sink);
    return { type: "ground", x: cx, y: gy, end: true };
  }

  // world bounds (no ceiling — high lobs come back down)
  if (p.x < -400 || p.x > W + 400 || p.y > H + 300) return { type: "out", end: true };
  return null;
}

function reflect(p, nx, ny, e) {
  const vn = p.vx * nx + p.vy * ny;
  if (vn >= 0) return; // already moving away
  const tx = p.vx - vn * nx;
  const ty = p.vy - vn * ny;
  p.vx = tx * 0.82 - vn * nx * e;
  p.vy = ty * 0.82 - vn * ny * e;
}

/* ------------------------------------------------------------------ simulate */

/**
 * Fly a throw to completion without side effects. Used by the AI and tests.
 * Returns {event, x, y, minDist, t} where minDist is the closest the shot
 * came to `target` (a fighter) — or the blast distance for bombs.
 */
export function simulateShot(world, shooter, weaponId, angle, power, target, maxT = 7) {
  const p = launch(shooter, weaponId, angle, power)[Math.floor((WEAPONS[weaponId].count || 1) / 2)];
  let minDist = Infinity;
  const tb = target ? fighterBox(target) : null;
  let ev = null;
  for (let t = 0; t < maxT; t += STEP) {
    ev = stepProjectile(world, p, STEP);
    if (tb) {
      const d = Math.hypot(p.x - tb.cx, p.y - tb.cy);
      if (d < minDist) minDist = d;
    }
    if (ev && ev.end) break;
  }
  if (ev && ev.type === "explode" && target) {
    minDist = Math.min(minDist, distToFighter(target, ev.x, ev.y));
  }
  return { event: ev, x: p.x, y: p.y, minDist, t: p.t };
}

/** Sample the first `dur` seconds of a throw for the aim preview. */
export function previewPath(world, shooter, weaponId, angle, power, dur, every = 0.03) {
  const p = launch(shooter, weaponId, angle, power)[Math.floor((WEAPONS[weaponId].count || 1) / 2)];
  const pts = [];
  let next = 0;
  for (let t = 0; t < dur; t += STEP) {
    const ev = stepProjectile({ ...world, fighters: [] }, p, STEP);
    if (t >= next) {
      pts.push(p.x, p.y);
      next += every;
    }
    if (ev && ev.end) break;
  }
  return pts;
}
