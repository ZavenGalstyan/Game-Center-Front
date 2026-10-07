/**
 * Pirate Cove — broadside cannons and cannonballs.
 *
 *  - Reload is authoritative per side: `tryBroadside` refuses while
 *    `ship.reload[side] > time`, whatever the input or animation says.
 *  - A broadside ripples: cannon i fires i × 70 ms after the order (queued in
 *    ship.pending, flushed by `updatePending`), bow gun first.
 *  - Elevation is solved for a range: the player's guns use the targeted
 *    ship's distance (positioning is still on you — the arc must contain it),
 *    AI captains use a distance with their own error.
 *  - Cannonballs live in a fixed pool. Each one dies exactly once — on a hull,
 *    the land, the water, or its lifetime — and a hull takes its damage from
 *    that single impact.
 */
import { forwardOf, rightOf } from "./ship.js";
import { waveHeight } from "./waves.js";
import { clamp } from "./rng.js";

export const GRAVITY = 15;
export const POOL_SIZE = 120;
export const ARC_HALF = (40 * Math.PI) / 180; // broadside arc: ±40° around the beam
export const BALL_LIFE = 5;

export function createProjectilePool() {
  const balls = [];
  for (let i = 0; i < POOL_SIZE; i++) {
    balls.push({ i, active: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, px: 0, py: 0, pz: 0, owner: null, team: "", dmg: 0, life: 0, big: false });
  }
  return balls;
}

function alloc(pool) {
  for (let i = 0; i < pool.length; i++) if (!pool[i].active) return pool[i];
  // Pool exhausted (never in practice): recycle the oldest ball.
  let old = pool[0];
  for (let i = 1; i < pool.length; i++) if (pool[i].life > old.life) old = pool[i];
  return old;
}

/** Max useful range for a ship's guns (45° would be further, but we cap elevation at a flat 9°). */
export function gunRange(stats) {
  const v = stats.muzzle;
  return (v * v * Math.sin(2 * ((9 * Math.PI) / 180))) / GRAVITY;
}

export function sideDir(ship, side) {
  const r = rightOf(ship.heading);
  return side === "right" ? r : { x: -r.x, z: -r.z };
}

/** Angle between the side's beam and the bearing to (x, z); <0 when not on that side at all. */
export function inArc(ship, side, x, z) {
  const d = sideDir(ship, side);
  const dx = x - ship.x;
  const dz = z - ship.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 1) return { ok: false, dist, angle: Math.PI };
  const cos = (dx * d.x + dz * d.z) / dist;
  const angle = Math.acos(clamp(cos, -1, 1));
  return { ok: angle <= ARC_HALF, dist, angle };
}

/** Best target on a side (closest angle within arc and range), or null. */
export function targetOnSide(ship, side, candidates, range) {
  let best = null;
  let bestScore = Infinity;
  for (const c of candidates) {
    if (!c.alive || c.removed || c.docked) continue;
    const a = inArc(ship, side, c.x, c.z);
    const reach = range + c.stats.length * 0.4;
    if (!a.ok || a.dist > reach) continue;
    const score = a.angle * 40 + a.dist * 0.3;
    if (score < bestScore) {
      bestScore = score;
      best = { ship: c, dist: a.dist, angle: a.angle };
    }
  }
  return best;
}

/**
 * Gun-laying for a broadside at `target`: where to point (yaw off the beam)
 * and what range to lay for so the ball meets the ship. Balls inherit the
 * firing ship's velocity, so we lead with the RELATIVE velocity. `skill`
 * scales the lead (1 = perfect gun crew). Returns { dist, yaw }.
 */
export function leadSolution(ship, side, target, skill = 1) {
  const fs = forwardOf(ship.heading);
  const ft = forwardOf(target.heading);
  const rvx = ft.x * target.speed - fs.x * ship.speed;
  const rvz = ft.z * target.speed - fs.z * ship.speed;
  let px = target.x - ship.x;
  let pz = target.z - ship.z;
  let d = Math.hypot(px, pz);
  for (let i = 0; i < 2; i++) {
    const tFlight = d / (ship.stats.muzzle * 0.985);
    px = target.x - ship.x + rvx * tFlight * skill;
    pz = target.z - ship.z + rvz * tFlight * skill;
    d = Math.hypot(px, pz);
  }
  const sd = sideDir(ship, side);
  const yaw = Math.atan2(sd.x * pz - sd.z * px, sd.x * px + sd.z * pz);
  return { dist: d, yaw: clamp(yaw, -0.55, 0.55) };
}

function elevationFor(v, dist) {
  const s = clamp((GRAVITY * dist) / (v * v), 0, 0.99);
  return clamp(0.5 * Math.asin(s), (0.6 * Math.PI) / 180, (9 * Math.PI) / 180);
}

/**
 * Orders a broadside. Returns false while that side reloads (or the ship can't fire).
 * aim = { dist, yawError } — distance the gun crew lays for, and an optional yaw error (rad).
 */
export function tryBroadside(ship, side, time, aim = {}) {
  if (!ship.alive || ship.docked) return false;
  if (side !== "left" && side !== "right") return false;
  if (ship.reload[side] > time) return false;
  const st = ship.stats;
  ship.reload[side] = time + st.reload;
  const n = st.perSide;
  const dist = aim.dist ?? gunRange(st) * 0.62;
  for (let i = 0; i < n; i++) {
    const frac = n === 1 ? 0 : i / (n - 1) - 0.5; // bow (+) to stern (-)
    ship.pending.push({
      at: time + i * 0.07,
      side,
      along: -frac * st.length * 0.62 + st.length * 0.04,
      dist: dist * (1 + (aim.rangeErr || 0) * (((i * 7919) % 13) / 13 - 0.5)),
      yawErr: (aim.yawError || 0) + (((i * 104729) % 17) / 17 - 0.5) * 0.045,
      big: false,
    });
  }
  return true;
}

/** Boss bow chaser: a single heavy ball straight ahead. */
export function tryChaser(ship, time, dist) {
  const ch = ship.chaser;
  if (!ch || !ship.alive || ship.reload.bow > time) return false;
  ship.reload.bow = time + ch.reload;
  ship.pending.push({ at: time, side: "bow", along: ship.stats.length * 0.5, dist, yawErr: 0, big: true, dmg: ch.damage });
  return true;
}

/** Launches due shots; returns muzzle events [{x,y,z,dx,dz,side,ship}]. */
export function updatePending(ship, time, pool, out) {
  if (!ship.pending.length) return;
  if (!ship.alive) {
    ship.pending.length = 0;
    return;
  }
  const st = ship.stats;
  const f = forwardOf(ship.heading);
  const rest = [];
  for (const p of ship.pending) {
    if (p.at > time) {
      rest.push(p);
      continue;
    }
    let d;
    let off;
    if (p.side === "bow") {
      d = f;
      off = 0;
    } else {
      d = sideDir(ship, p.side);
      off = st.beam * 0.5 + 0.35;
    }
    const c = Math.cos(p.yawErr);
    const s = Math.sin(p.yawErr);
    const dx = d.x * c - d.z * s;
    const dz = d.x * s + d.z * c;
    const v = st.muzzle * (p.big ? 0.95 : 1);
    const el = elevationFor(v, p.dist);
    const b = alloc(pool);
    b.active = true;
    b.x = ship.x + f.x * p.along + d.x * off;
    b.z = ship.z + f.z * p.along + d.z * off;
    b.y = ship.y + st.deckY * 0.85;
    const hs = Math.cos(el) * v;
    // carry the ship's own motion (that is what makes leading a target matter)
    b.vx = dx * hs + f.x * ship.speed;
    b.vz = dz * hs + f.z * ship.speed;
    b.vy = Math.sin(el) * v;
    b.px = b.x;
    b.py = b.y;
    b.pz = b.z;
    b.owner = ship;
    b.team = ship.team;
    b.dmg = p.dmg ?? st.damage;
    b.life = 0;
    b.big = p.big;
    if (p.side !== "bow") ship.recoil[p.side] = 1;
    out.push({ type: "muzzle", x: b.x, y: b.y, z: b.z, dx, dz, side: p.side, ship, big: p.big });
  }
  ship.pending = rest;
}

/** Closest distance from point (x,z) to the ship's keel segment, and height window check. */
function hullHit(ship, x, y, z) {
  const L = ship.stats.length;
  const f = forwardOf(ship.heading);
  const ax = ship.x - f.x * L * 0.45;
  const az = ship.z - f.z * L * 0.45;
  const dx = x - ax;
  const dz = z - az;
  const t = clamp((dx * f.x + dz * f.z) / (L * 0.9), 0, 1);
  const cx = ax + f.x * L * 0.9 * t;
  const cz = az + f.z * L * 0.9 * t;
  const d = Math.hypot(x - cx, z - cz);
  // tapered: narrower toward bow/stern
  const taper = 1 - Math.abs(t - 0.5) * 0.9;
  const rad = ship.stats.beam * 0.55 * taper + 0.35;
  const top = ship.y + ship.stats.deckY + 2.2;
  return d < rad && y < top && y > ship.y - 1.5;
}

/**
 * Advances every live ball. Emits impacts into `out`:
 *   {type:"hit", ship, dmg, x,y,z, by} · {type:"splash"} · {type:"landHit"}
 * Damage itself is applied by the caller through applyDamage (once per ball).
 */
export function stepProjectiles(pool, ships, env, dt, out) {
  const T = env.terrain;
  for (let i = 0; i < pool.length; i++) {
    const b = pool[i];
    if (!b.active) continue;
    b.px = b.x;
    b.py = b.y;
    b.pz = b.z;
    b.vy -= GRAVITY * dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.z += b.vz * dt;
    b.life += dt;
    // swept test in two halves so a fast ball can't skip a thin bow
    let hit = null;
    for (let k = 0; k < ships.length && !hit; k++) {
      const s = ships[k];
      if (s === b.owner || s.removed || s.team === b.team) continue;
      if (s.sinkT > 3) continue;
      if (Math.abs(s.x - b.x) > 30 || Math.abs(s.z - b.z) > 30) continue;
      for (let q = 0.5; q <= 1.001; q += 0.5) {
        const x = b.px + (b.x - b.px) * q;
        const y = b.py + (b.y - b.py) * q;
        const z = b.pz + (b.z - b.pz) * q;
        if (hullHit(s, x, y, z)) {
          hit = { s, x, y, z };
          break;
        }
      }
    }
    if (hit) {
      b.active = false;
      out.push({ type: "hit", ship: hit.s, dmg: b.dmg, x: hit.x, y: Math.max(hit.y, hit.s.y + 0.6), z: hit.z, by: b.owner, big: b.big, vx: b.vx, vz: b.vz });
      continue;
    }
    const ground = T.height(b.x, b.z);
    if (ground > -0.3 && b.y < ground + 0.15) {
      b.active = false;
      out.push({ type: "landHit", x: b.x, y: ground + 0.1, z: b.z, by: b.owner });
      continue;
    }
    const w = waveHeight(b.x, b.z, env.time, env.waveAmp);
    if (b.y < w) {
      b.active = false;
      out.push({ type: "splash", x: b.x, y: w, z: b.z, by: b.owner, big: b.big });
      continue;
    }
    if (b.life > BALL_LIFE) b.active = false;
  }
}

export function activeBalls(pool) {
  let n = 0;
  for (let i = 0; i < pool.length; i++) if (pool[i].active) n++;
  return n;
}

export function clearPool(pool) {
  for (let i = 0; i < pool.length; i++) pool[i].active = false;
}

/**
 * Applies damage once. Returns "sunk" exactly once per ship (the transition),
 * "hit" for a damaging hit, or null (already dead / docked).
 */
export function applyDamage(ship, dmg, time) {
  if (!ship.alive || ship.removed) return null;
  ship.hull = Math.max(0, ship.hull - dmg);
  ship.lastHitAt = time;
  ship.damageFlash = 1;
  if (ship.hull <= 0) {
    ship.alive = false;
    ship.sinking = true;
    ship.sinkT = 0;
    ship.pending.length = 0;
    return "sunk";
  }
  return "hit";
}
