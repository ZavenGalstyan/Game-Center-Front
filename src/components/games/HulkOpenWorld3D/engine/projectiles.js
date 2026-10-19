/**
 * Hulk: Open World 3D — projectiles (framework-free).
 *
 * Bullets, rockets, energy blasts, tank shells, lobbed boss missiles,
 * lasers, flame and plasma orbs all travel through the world at finite
 * speed (so they can be dodged) and are swept segment-by-segment against
 * buildings, terrain, solid props (cars are cover), the hero's capsule and
 * civilians. Explosive kinds splash on impact (walls shield the splash).
 */
import { PROJ, GRAVITY } from "./config.js";
import { HERO } from "./config.js";
import { explode, damageProp } from "./props.js";

export function makeProjectile(kind, x, y, z, dx, dy, dz, o = {}) {
  const P = PROJ[kind];
  const n = Math.hypot(dx, dy, dz) || 1;
  const sp = o.speed || P.speed;
  return {
    kind,
    def: P,
    x,
    y,
    z,
    vx: (dx / n) * sp,
    vy: (dy / n) * sp,
    vz: (dz / n) * sp,
    life: o.life || P.life,
    age: 0,
    hostile: o.hostile !== false,
    owner: o.owner || null,
    dead: false,
    gravity: o.gravity || 0,
    target: o.target || null, // lobbed missiles: ground marker
    dmgMul: o.dmgMul || 1,
  };
}

/** closest distance between segment AB and the vertical segment (cx, y0..y1, cz) — approximated by sampling */
function segCapsule(ax, ay, az, bx, by, bz, cx, y0, y1, cz) {
  let best = Infinity;
  for (let k = 0; k <= 4; k++) {
    const t = k / 4;
    const x = ax + (bx - ax) * t;
    const y = ay + (by - ay) * t;
    const z = az + (bz - az) * t;
    const yy = y < y0 ? y0 : y > y1 ? y1 : y;
    const d = Math.hypot(x - cx, y - yy, z - cz);
    if (d < best) best = d;
  }
  return best;
}

export function updateProjectiles(sim, dt) {
  const h = sim.hero;
  for (const p of sim.projectiles) {
    if (p.dead) continue;
    p.age += dt;
    if (p.age > p.life) {
      p.dead = true;
      if (p.def.splash) detonate(sim, p, p.x, p.y, p.z);
      continue;
    }
    if (p.gravity) p.vy -= GRAVITY * p.gravity * dt;
    if (p.homing && h.alive) {
      // slow plasma orbs curve toward the hero (outrun them or clap them away)
      const sp = Math.hypot(p.vx, p.vy, p.vz);
      let tx = h.x - p.x;
      let ty = h.y + 1.6 - p.y;
      let tz = h.z - p.z;
      const tl = Math.hypot(tx, ty, tz) || 1;
      const k = Math.min(1, p.homing * dt);
      p.vx += ((tx / tl) * sp - p.vx) * k;
      p.vy += ((ty / tl) * sp - p.vy) * k;
      p.vz += ((tz / tl) * sp - p.vz) * k;
    }
    const ox = p.x;
    const oy = p.y;
    const oz = p.z;
    const nx = ox + p.vx * dt;
    const ny = oy + p.vy * dt;
    const nz = oz + p.vz * dt;
    // the hero
    if (p.hostile && h.alive) {
      const d = segCapsule(ox, oy, oz, nx, ny, nz, h.x, h.y + 0.3, h.y + HERO.height - 0.2, h.z);
      if (d < HERO.radius * 0.95 + p.def.r) {
        p.dead = true;
        if (p.def.splash) detonate(sim, p, nx, ny, nz);
        else {
          sim.damageHero(p.def.dmg * p.dmgMul, { x: ox, z: oz, kind: p.kind });
          sim.fx.push({ type: "hitHero", x: nx, y: ny, z: nz, kind: p.kind });
        }
        continue;
      }
    }
    // civilians caught in the crossfire
    if (p.hostile && sim.civilians.length) {
      let hitC = null;
      for (const c of sim.civilians) {
        if (c.dead) continue;
        if (Math.abs(c.x - nx) > 3 || Math.abs(c.z - nz) > 3) continue;
        if (segCapsule(ox, oy, oz, nx, ny, nz, c.x, c.y, c.y + 1.7, c.z) < 0.4 + p.def.r) {
          hitC = c;
          break;
        }
      }
      if (hitC) {
        p.dead = true;
        if (p.def.splash) detonate(sim, p, nx, ny, nz);
        else sim.hurtCivilian(hitC, p.def.dmg * p.dmgMul, ox, oz);
        continue;
      }
    }
    // world: buildings, terrain, solid props
    const hit = sim.col.raycast(ox, oy, oz, nx - ox, ny - oy, nz - oz, 1, { props: true, terrain: true });
    if (hit) {
      p.dead = true;
      const ix = hit.x;
      const iy = hit.y;
      const iz = hit.z;
      if (p.def.splash) detonate(sim, p, ix - (nx - ox) * 0.05, iy, iz - (nz - oz) * 0.05);
      else {
        sim.fx.push({ type: "ricochet", x: ix, y: iy, z: iz, kind: p.kind });
        if (hit.prop) damageProp(sim, hit.prop, p.def.dmg * 0.5, { byPlayer: false });
      }
      continue;
    }
    // water swallows it
    if (ny < -1.5 && sim.city.water(nx, nz)) {
      p.dead = true;
      sim.fx.push({ type: "splash", x: nx, y: -1.5, z: nz });
      continue;
    }
    // lobbed missiles burst at their marker
    if (p.target && ny <= p.target.y + 0.3 && p.vy < 0) {
      p.dead = true;
      detonate(sim, p, nx, Math.max(ny, p.target.y), nz);
      continue;
    }
    p.x = nx;
    p.y = ny;
    p.z = nz;
  }
  // compact
  if (sim.projectiles.length > 40) sim.projectiles = sim.projectiles.filter((p) => !p.dead);
}

function detonate(sim, p, x, y, z) {
  explode(sim, x, y, z, p.def.splash, p.def.dmg * p.dmgMul, { byPlayer: false, hurtsHero: true, big: p.kind === "shell" || p.kind === "missile" });
}
