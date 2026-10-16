/**
 * Hulk: Open World 3D — destructible / grabbable props (framework-free).
 *
 * Every prop starts as a copy of the city's generated list. A prop is in
 * one of these modes:
 *   static    resting in the world (registered in the collision grid)
 *   carried   held above the hero's head (position driven by the hero)
 *   flying    thrown or blasted: real ballistic motion + tumbling, swept
 *             against buildings / terrain / other props / enemies
 *   gone      broken apart (debris effects only)
 * and in a damage state 0 intact · 1 damaged · 2 destroyed. Destroyed cars
 * become burning wrecks that explode, lamps and traffic lights topple,
 * barrels explode, crates / benches / fences / barricades shatter.
 * Only props that are moving or burning are updated each step.
 */
import { PROPS, THROW, GRAVITY } from "./config.js";

const DEBRIS_KIND = { car: "metal", van: "metal", taxi: "metal", barrel: "metal", crate: "wood", mcrate: "wood", concrete: "concrete", bench: "wood", bin: "metal", hydrant: "metal", lamp: "metal", light: "metal", fence: "wood", barricade: "concrete", sandbag: "dirt", wallSec: "concrete", generator: "metal", fuelTank: "metal", reactor: "metal", debris: "concrete", shieldGen: "metal", target: "wood" };

export function makeProps(sim, list) {
  const out = [];
  for (const src of list) out.push(makeProp(sim, src));
  return out;
}
export function makeProp(sim, src) {
  const def = PROPS[src.type];
  const p = {
    id: src.id,
    type: src.type,
    def,
    x: src.x,
    y: 0,
    z: src.z,
    rot: src.rot || 0,
    rx: 0,
    rz: 0,
    hp: def.hp,
    maxHp: def.hp,
    state: 0,
    mode: "static",
    vx: 0,
    vy: 0,
    vz: 0,
    wx: 0,
    wy: 0,
    solid: !!def.solid,
    tag: src.tag || null,
    color: src.color || 0,
    red: !!src.red,
    military: !!src.military,
    inert: !!src.inert,
    burn: 0,
    ver: 0,
    box: null,
    _in: null,
  };
  p.y = src.y != null && src.y > 0 ? src.y : sim.city.terrainH(p.x, p.z);
  if (src.y != null && src.y > 0) p.y = src.y;
  propBox(p);
  sim.col.addProp(p);
  return p;
}
export function propBox(p) {
  const d = p.def;
  const c = Math.abs(Math.cos(p.rot));
  const s = Math.abs(Math.sin(p.rot));
  const hx = d.hx * c + d.hz * s;
  const hz = d.hx * s + d.hz * c;
  const fallen = p.rx !== 0 || p.rz !== 0;
  const h = fallen && (p.type === "lamp" || p.type === "light") ? 0.4 : 2 * d.hy * (p.state === 2 && p.type !== "wallSec" ? 0.7 : 1);
  p.box = { x0: p.x - hx, x1: p.x + hx, z0: p.z - hz, z1: p.z + hz, y0: p.y, y1: p.y + h };
  return p.box;
}
export const propRadius = (p) => Math.max(p.def.hx, p.def.hz, p.def.hy) * 0.85;
export const propCentreY = (p) => p.y + p.def.hy;

/**
 * Damage a prop. dir = push direction (unit xz) for toppling / blast-off.
 * Returns true if this hit destroyed it.
 */
export function damageProp(sim, p, dmg, src = {}) {
  if (p.mode === "gone" || p.state === 2 && !p.def.explode) return false;
  if (p.inert) {
    sim.fx.push({ type: "spark", x: p.x, y: propCentreY(p), z: p.z, n: 6 });
    return false;
  }
  if (p.state === 2) {
    // hitting a wreck: knock it around / make it blow sooner
    if (p.burn > 0) p.burn = Math.min(p.burn, 0.4);
    return false;
  }
  const was = p.state;
  p.hp -= dmg;
  p.ver++;
  if (p.hp <= p.maxHp * 0.5 && p.state === 0) p.state = 1;
  if (src.byPlayer) sim.stats.destruction += Math.min(dmg, Math.max(0, p.hp + dmg)) * 0.05;
  if (p.hp > 0) {
    if (was !== p.state) sim.events.push({ type: "propDamaged", prop: p });
    sim.fx.push({ type: DEBRIS_KIND[p.type] === "wood" ? "splinter" : "spark", x: p.x, y: propCentreY(p), z: p.z, n: 5 });
    return false;
  }
  destroyProp(sim, p, src);
  return true;
}

export function destroyProp(sim, p, src = {}) {
  p.state = 2;
  p.hp = 0;
  p.ver++;
  const kind = DEBRIS_KIND[p.type] || "concrete";
  sim.stats.destroyed++;
  if (src.byPlayer !== false) {
    sim.stats.destruction += p.def.score;
    sim.gainXp(Math.ceil(p.def.score / 12), false);
  }
  sim.events.push({ type: "propDestroyed", prop: p, byPlayer: src.byPlayer !== false });
  sim.fx.push({ type: "debris", kind, x: p.x, y: propCentreY(p), z: p.z, n: Math.min(14, 4 + Math.round(p.def.hx * p.def.hz * 3)), dx: src.dx || 0, dz: src.dz || 0, s: Math.max(p.def.hx, p.def.hz) });
  switch (p.type) {
    case "car":
    case "van":
    case "taxi":
      // a burning wreck that blows up shortly after (sooner if it was thrown)
      p.burn = src.thrown ? 0.05 : 2.2 + sim.rand() * 1.5;
      sim.activeProps.add(p);
      propBox(p);
      sim.col.moveProp(p);
      break;
    case "barrel":
      if (p.red) {
        p.burn = 0.12;
        sim.activeProps.add(p);
      } else removeProp(sim, p);
      break;
    case "generator":
    case "fuelTank":
    case "reactor":
    case "shieldGen":
      explode(sim, p.x, p.y + p.def.hy, p.z, p.type === "reactor" ? 12 : 8, p.type === "reactor" ? 220 : 160, { byPlayer: src.byPlayer !== false, big: true, skipProp: p });
      propBox(p);
      sim.col.moveProp(p);
      p.solid = p.type !== "shieldGen";
      if (!p.solid) sim.col.removeProp(p);
      break;
    case "lamp":
    case "light": {
      // topple away from the hit
      const a = Math.atan2(src.dx || Math.sin(p.rot), src.dz || Math.cos(p.rot));
      p.fallYaw = a;
      p.rx = Math.PI / 2 - 0.08;
      p.solid = false;
      propBox(p);
      sim.col.moveProp(p);
      sim.fx.push({ type: "spark", x: p.x, y: p.y + 5.5, z: p.z, n: 10 });
      break;
    }
    case "hydrant":
      sim.fx.push({ type: "spray", x: p.x, y: p.y + 0.6, z: p.z, t: 6 });
      p.solid = false;
      propBox(p);
      sim.col.moveProp(p);
      break;
    case "wallSec":
      sim.fx.push({ type: "dust", x: p.x, y: p.y + 2, z: p.z, r: 7 });
      removeProp(sim, p);
      break;
    default:
      removeProp(sim, p);
  }
}
export function removeProp(sim, p) {
  p.mode = "gone";
  p.solid = false;
  p.ver++;
  sim.col.removeProp(p);
  sim.activeProps.delete(p);
  if (sim.hero.carry === p) sim.hero.carry = null;
}

/**
 * Area blast: damages enemies, bosses, civilians, props (chain reactions)
 * and — unless it is the player's own — the hero. LOS from the blast
 * centre is required so walls shield things behind them.
 */
export function explode(sim, x, y, z, r, dmg, o = {}) {
  sim.fx.push({ type: o.big ? "bigExplosion" : "explosion", x, y, z, r });
  sim.events.push({ type: "explosion", x, y, z, r, big: !!o.big });
  sim.shake(x, z, o.big ? 1 : 0.7, r * 3);
  const los = (tx, ty, tz) => sim.col.losClear(x, y + 0.6, z, tx, ty, tz);
  for (const e of sim.enemiesNear(x, z, r + 2)) {
    const d = Math.hypot(e.x - x, e.y + e.def.h * 0.5 - y, e.z - z);
    if (d > r + e.def.r || !los(e.x, e.y + e.def.h * 0.5, e.z)) continue;
    const k = 1 - Math.min(1, d / (r + e.def.r)) * 0.6;
    const dx = (e.x - x) / (d || 1);
    const dz = (e.z - z) / (d || 1);
    sim.damageEnemy(e, dmg * k, { byPlayer: o.byPlayer !== false, dx, dz, knock: 14 * k, lift: 8 * k, kind: "explosion" });
  }
  for (const b of sim.bosses) {
    if (b.dead) continue;
    const d = Math.hypot(b.x - x, b.z - z) - b.def.r;
    if (d > r) continue;
    sim.damageBoss(b, dmg * (1 - Math.max(0, d) / r * 0.6), { byPlayer: o.byPlayer !== false, kind: "explosion", x, y, z });
  }
  for (const c of sim.civilians) {
    if (c.dead) continue;
    const d = Math.hypot(c.x - x, c.z - z);
    if (d < r * 0.8 && los(c.x, c.y + 1, c.z)) sim.hurtCivilian(c, dmg * 0.6, x, z);
  }
  if (o.byPlayer === false || o.hurtsHero) {
    const h = sim.hero;
    const d = Math.hypot(h.x - x, h.y + 1.5 - y, h.z - z);
    if (d < r + 1 && los(h.x, h.y + 1.6, h.z)) sim.damageHero(dmg * (1 - Math.min(1, d / (r + 1)) * 0.6), { x, z, kind: "explosion", knock: 9 });
  }
  const near = sim.col.propsIn(x - r, z - r, x + r, z + r);
  for (const p of near) {
    if (p === o.skipProp || p.mode !== "static") continue;
    const d = Math.hypot(p.x - x, propCentreY(p) - y, p.z - z);
    if (d > r) continue;
    const k = 1 - d / r;
    const dx = (p.x - x) / (d || 1);
    const dz = (p.z - z) / (d || 1);
    damageProp(sim, p, dmg * (0.4 + 0.8 * k), { byPlayer: o.byPlayer !== false, dx, dz });
    // light props get blown away
    if (p.mode === "static" && p.def.grab && p.def.weight <= 0.5 && k > 0.3) launchProp(sim, p, dx * 12 * k, 8 * k, dz * 12 * k, false);
  }
}

/** put a prop into ballistic flight */
export function launchProp(sim, p, vx, vy, vz, byPlayer, spin = 1) {
  sim.col.removeProp(p);
  p.mode = "flying";
  p.vx = vx;
  p.vy = vy;
  p.vz = vz;
  p.wx = (2 + sim.rand() * 4) * spin;
  p.wy = (sim.rand() - 0.5) * 3 * spin;
  p.thrown = byPlayer;
  p.landedOnce = false;
  p.hitSet = new Set();
  p.airT = 0;
  p.ver++;
  sim.activeProps.add(p);
}

const _hits = [];
/** advance moving / burning props */
export function updateProps(sim, dt) {
  for (const p of sim.activeProps) {
    if (p.burn > 0) {
      p.burn -= dt;
      if (p.burn <= 0 && p.mode !== "gone") {
        p.burn = 0;
        const big = p.type !== "barrel";
        explode(sim, p.x, p.y + p.def.hy, p.z, big ? THROW.explodeR : 5, big ? THROW.explodeDmg : 90, { byPlayer: p.lastByPlayer !== false, skipProp: p, big });
        if (p.type === "barrel") {
          removeProp(sim, p);
          continue;
        }
        p.burnt = true;
        p.ver++;
      }
    }
    if (p.mode === "flying") stepFlying(sim, p, dt);
    else if (p.burn <= 0 && p.mode !== "carried") sim.activeProps.delete(p);
  }
}

function stepFlying(sim, p, dt) {
  p.airT += dt;
  p.vy -= GRAVITY * dt;
  const ox = p.x;
  const oy = p.y + p.def.hy;
  const oz = p.z;
  let nx = p.x + p.vx * dt;
  let ny = p.y + p.vy * dt;
  let nz = p.z + p.vz * dt;
  p.rx += p.wx * dt;
  p.rot += p.wy * dt;
  const speed = Math.hypot(p.vx, p.vy, p.vz);
  const rad = propRadius(p);
  // enemies / bosses along the way
  if (speed > 6) {
    for (const e of sim.enemiesNear(nx, nz, rad + 3)) {
      if (p.hitSet.has(e)) continue;
      const d = Math.hypot(e.x - nx, e.y + e.def.h * 0.5 - (ny + p.def.hy), e.z - nz);
      if (d > rad + e.def.r + 0.3) continue;
      p.hitSet.add(e);
      const dmg = Math.max(THROW.minDmg, THROW.dmgPerWeight * p.def.weight * (speed / 30)) * (p.thrown ? sim.hero.st.throwDmg : 0.5);
      const inv = 1 / (speed || 1);
      sim.damageEnemy(e, dmg, { byPlayer: p.thrown, dx: p.vx * inv, dz: p.vz * inv, knock: 10 + speed * 0.4, lift: 7, kind: "throw" });
      sim.events.push({ type: "propHit", prop: p, x: e.x, z: e.z });
      if (p.def.weight >= 1) {
        p.vx *= 0.7;
        p.vz *= 0.7;
      }
    }
    for (const b of sim.bosses) {
      if (b.dead || p.hitSet.has(b)) continue;
      if (b.hitTest(nx, ny + p.def.hy, nz, rad)) {
        p.hitSet.add(b);
        const dmg = Math.max(THROW.minDmg, THROW.dmgPerWeight * p.def.weight * (speed / 30)) * (p.thrown ? sim.hero.st.throwDmg : 0.5) * 1.4;
        sim.damageBoss(b, dmg, { byPlayer: p.thrown, kind: "throw", x: nx, y: ny, z: nz, prop: p });
        impact(sim, p, nx, ny, nz, -p.vx / (speed || 1), 0, -p.vz / (speed || 1), speed, null);
        return;
      }
    }
  }
  // world: sweep the centre from old to new
  const dx = nx - ox;
  const dy = ny + p.def.hy - oy;
  const dz = nz - oz;
  const hit = sim.col.raycast(ox, oy, oz, dx, dy, dz, 1, { props: true, skipProp: p, terrain: true });
  if (hit) {
    impact(sim, p, ox + dx * hit.t, oy + dy * hit.t - p.def.hy, oz + dz * hit.t, hit.nx, hit.ny, hit.nz, speed, hit.prop || null);
    return;
  }
  // ground (incl. rooftops) under the new position
  const g = sim.col.groundAt(nx, nz, ny + p.def.hy, 0.2, 0.3);
  if (ny <= g.y) {
    impact(sim, p, nx, g.y, nz, 0, 1, 0, speed, null);
    return;
  }
  // world bounds
  if (nx < -20 || nz < -20 || nx > sim.city.size + 20 || nz > sim.city.size + 20 || ny < -30) {
    removeProp(sim, p);
    return;
  }
  p.x = nx;
  p.y = ny;
  p.z = nz;
}

function impact(sim, p, x, y, z, nx, ny, nz, speed, other) {
  p.x = x;
  p.y = Math.max(y, sim.city.terrainH(x, z) - 0.2);
  p.z = z;
  if (p.thrown && !p.landedOnce) {
    p.landedOnce = true;
    sim.events.push({ type: "propLanded", prop: p, x, y, z });
  }
  const hard = speed > 14;
  if (hard) {
    sim.fx.push({ type: "dust", x, y: y + 0.5, z, r: 2 + p.def.weight * 2 });
    sim.events.push({ type: "propImpact", prop: p, speed, x, z });
    sim.shake(x, z, Math.min(0.6, speed / 60) * p.def.weight, 40);
    // splash damage to enemies close to the impact
    for (const e of sim.enemiesNear(x, z, THROW.splash + 1)) {
      if (p.hitSet && p.hitSet.has(e)) continue;
      const d = Math.hypot(e.x - x, e.z - z);
      if (d > THROW.splash + e.def.r) continue;
      p.hitSet && p.hitSet.add(e);
      sim.damageEnemy(e, 30 * p.def.weight * (speed / 30) * (p.thrown ? sim.hero.st.throwDmg : 0.5), { byPlayer: p.thrown, dx: (e.x - x) / (d || 1), dz: (e.z - z) / (d || 1), knock: 8, lift: 5, kind: "throw" });
    }
    if (other) damageProp(sim, other, 30 + speed * 3 * p.def.weight, { byPlayer: p.thrown, dx: -nx, dz: -nz });
    // the static box it hit might be a breakable prop's neighbour: nothing else to do
  }
  // the thrown prop itself takes the impact
  const vehicle = p.type === "car" || p.type === "van" || p.type === "taxi";
  const selfDmg = hard ? speed * (vehicle ? (p.thrown && speed > 18 ? 8 : 4.2) : 3) : 0;
  p.lastByPlayer = p.thrown;
  if (selfDmg > 0 && p.state < 2) {
    damageProp(sim, p, selfDmg, { byPlayer: p.thrown, thrown: p.thrown, dx: -nx, dz: -nz });
    if (p.mode === "gone") return;
  } else if (hard && p.state === 2 && p.burn > 0) p.burn = Math.min(p.burn, 0.05);
  // bounce or come to rest
  if (ny > 0.5 && speed < 9) {
    settle(sim, p);
    return;
  }
  const vn = p.vx * nx + p.vy * ny + p.vz * nz;
  p.vx = (p.vx - 1.6 * vn * nx) * 0.45;
  p.vy = (p.vy - 1.6 * vn * ny) * 0.35;
  p.vz = (p.vz - 1.6 * vn * nz) * 0.45;
  p.wx *= 0.5;
  // nudge out of the surface so the next sweep starts outside it
  p.x += nx * 0.3;
  p.z += nz * 0.3;
  if (ny > 0.5) p.y += 0.02;
  if (Math.hypot(p.vx, p.vy, p.vz) < 3) settle(sim, p);
}

function settle(sim, p) {
  p.mode = "static";
  p.vx = p.vy = p.vz = 0;
  // land on its wheels / base (keep the yaw), unless it is a wreck
  p.rx = 0;
  p.rz = 0;
  const g = sim.col.groundAt(p.x, p.z, p.y + 0.5, 1.5, 0.4, false);
  p.y = g.y;
  propBox(p);
  // don't come to rest inside a building: push the footprint out
  const e = { x: p.x, y: p.y, z: p.z };
  sim.col.pushOut(e, Math.max(p.def.hx, p.def.hz) * 0.9, p.def.hy * 2, 0.4, false);
  p.x = e.x;
  p.z = e.z;
  propBox(p);
  p.ver++;
  if (p.mode !== "gone") sim.col.addProp(p);
  if (p.burn <= 0) sim.activeProps.delete(p);
}
