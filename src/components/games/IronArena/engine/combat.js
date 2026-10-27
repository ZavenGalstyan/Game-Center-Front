/**
 * Iron Arena — weapons, projectiles and abilities.
 *
 * Every weapon fires real projectiles with travel time (rail slugs are just
 * very fast). Projectiles live in a fixed pool and are swept as segments
 * each step against tanks (oriented boxes) and the arena (raycast), so fast
 * shells never tunnel. Damage, kills and scoring go through match.damage().
 */
import { ABILITIES } from "./tanks.js";
import { muzzle } from "./tank.js";
import { clamp, rotYXZ } from "./util.js";

const POOL = 360;
const tmp = { x: 0, y: 0, z: 0, dx: 0, dy: 0, dz: 0 };
const tv = { x: 0, y: 0, z: 0 };

export function createProjectiles() {
  const list = [];
  for (let i = 0; i < POOL; i++) list.push({ active: false, id: i, kind: "", x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, px: 0, py: 0, pz: 0, g: 0, owner: -1, team: -1, dmg: 0, range: 0, dist: 0, splash: 0, splashMul: 0, pierce: false, hitSet: null, rad: 0, life: 0, age: 0, burn: 0, burnDps: 0, src: "" });
  let next = 0;
  return {
    list,
    spawn() {
      for (let k = 0; k < POOL; k++) {
        const p = list[(next + k) % POOL];
        if (!p.active) {
          next = (next + k + 1) % POOL;
          p.active = true;
          p.dist = 0;
          p.age = 0;
          p.hitSet = null;
          p.pierce = false;
          p.burn = 0;
          p.rad = 0;
          return p;
        }
      }
      // pool exhausted: recycle the oldest flame particle or slot `next`
      const p = list[next];
      next = (next + 1) % POOL;
      p.active = true;
      p.dist = 0;
      p.age = 0;
      p.hitSet = null;
      return p;
    },
    clear() {
      for (const p of list) p.active = false;
    },
  };
}

/* ------------------------------------------------------------------ firing */
function fireProjectile(M, t, opts = {}) {
  const w = t.stats.weapon;
  muzzle(t, tmp);
  let { dx, dy, dz } = tmp;
  const spread = (opts.spread ?? w.spread) * (t.speed > 2 ? 1.6 : 1);
  if (spread > 0) {
    // random cone (deterministic rng)
    const a = M.rand() * Math.PI * 2;
    const r = Math.sqrt(M.rand()) * spread;
    // orthonormal basis (u, v) perpendicular to d: u = d × up, v = u × d
    let ux = -dz;
    let uz = dx;
    const ul = Math.hypot(ux, uz) || 1;
    ux /= ul;
    uz /= ul;
    const vx = -uz * dy;
    const vy = uz * dx - ux * dz;
    const vz = ux * dy;
    const ca = Math.cos(a) * r;
    const sa = Math.sin(a) * r;
    dx += ux * ca + vx * sa;
    dy += vy * sa;
    dz += uz * ca + vz * sa;
    const L = Math.hypot(dx, dy, dz);
    dx /= L;
    dy /= L;
    dz /= L;
  }
  const p = M.proj.spawn();
  const speed = opts.speed ?? w.speed;
  p.kind = opts.kind ?? w.kind;
  p.src = t.stats.model;
  p.x = p.px = tmp.x;
  p.y = p.py = tmp.y;
  p.z = p.pz = tmp.z;
  // inherit a little hull velocity
  const hvx = Math.sin(t.yaw) * t.vf;
  const hvz = Math.cos(t.yaw) * t.vf;
  p.vx = dx * speed + hvx * 0.3;
  p.vy = dy * speed;
  p.vz = dz * speed + hvz * 0.3;
  p.g = opts.gravity ?? w.gravity;
  p.owner = t.id;
  p.team = t.team;
  const dmgMul = (t.fx.focus > 0 ? 1.35 : 1) * M.dmgScale(t);
  p.dmg = (opts.dmg ?? w.damage) * dmgMul;
  p.range = opts.range ?? w.range;
  p.splash = opts.splash ?? w.splash ?? 0;
  p.splashMul = w.splashMul ?? 0.35;
  p.pierce = !!w.pierce && p.kind === "rail";
  p.rad = opts.rad ?? (p.kind === "plasma" ? 0.35 : p.kind === "rail" ? 0.25 : 0.12);
  p.life = opts.life ?? 6;
  p.burn = opts.burn ?? 0;
  p.burnDps = opts.burnDps ?? 0;
  t.shots++;
  return p;
}

function recoil(t, k) {
  if (!k) return;
  const back = k * 1.1;
  const c = Math.cos(t.turret);
  t.vf -= c * back;
  t.vl -= Math.sin(t.turret) * back * 0.5;
  t.recoil = 1;
}

/** advance one tank's weapon; fire when its input asks */
export function updateWeapon(M, t, dt, allowFire) {
  const w = t.stats.weapon;
  const S = t.ws;
  const over = t.fx.over > 0;
  const rate = over ? 2 : 1;
  const want = allowFire && t.input.fire && t.alive;
  S.cd = Math.max(0, S.cd - dt * rate);
  S.firing = false;
  const reveal = () => {
    if (t.fx.cloak > 0) {
      t.fx.cloak = 0;
      M.emit({ type: "uncloak", id: t.id });
    }
    t.protT = 0;
  };
  const shotEvent = (p, extra = {}) => M.emit({ type: "fire", id: t.id, kind: p.kind, model: t.stats.model, x: p.x, y: p.y, z: p.z, dx: p.vx, dy: p.vy, dz: p.vz, ...extra });
  switch (w.kind) {
    case "burst": {
      if (S.burstLeft > 0) {
        S.burstT -= dt * rate;
        if (S.burstT <= 0) {
          const p = fireProjectile(M, t);
          shotEvent(p, { n: w.burst - S.burstLeft });
          recoil(t, w.recoil);
          S.burstLeft--;
          S.burstT = w.burstGap;
          if (S.burstLeft === 0) S.cd = w.reload;
        }
      } else if (want && S.cd <= 0) {
        reveal();
        S.burstLeft = w.burst;
        S.burstT = 0;
      }
      break;
    }
    case "clip": {
      if (S.reloading) {
        S.reloadT -= dt * rate;
        if (S.reloadT <= 0) {
          S.reloading = false;
          S.clip = w.clip;
          M.emit({ type: "reloaded", id: t.id });
        }
        break;
      }
      if (want && S.cd <= 0 && S.clip > 0) {
        reveal();
        const p = fireProjectile(M, t);
        shotEvent(p);
        recoil(t, w.recoil);
        if (!over) S.clip--;
        S.cd = w.gap;
        S.idleT = 0;
        if (S.clip <= 0) {
          S.reloading = true;
          S.reloadT = w.reload;
          M.emit({ type: "reload", id: t.id, time: w.reload });
        }
      } else {
        S.idleT += dt;
        if (S.clip < w.clip && S.idleT > 2.2 && !want) {
          S.reloading = true;
          // partial magazines reload faster
          S.reloadT = w.reload * (0.45 + 0.55 * (1 - S.clip / w.clip));
          M.emit({ type: "reload", id: t.id, time: S.reloadT });
        }
      }
      break;
    }
    case "rail": {
      if (S.charging) {
        S.chargeT -= dt;
        if (S.chargeT <= 0) {
          S.charging = false;
          const p = fireProjectile(M, t);
          shotEvent(p);
          recoil(t, w.recoil);
          S.cd = w.reload;
        }
      } else if (want && S.cd <= 0) {
        reveal();
        S.charging = true;
        S.chargeT = w.charge * (t.fx.focus > 0 ? 0.5 : 1);
        S.chargeTotal = S.chargeT;
        M.emit({ type: "charge", id: t.id, time: S.chargeT });
      }
      break;
    }
    case "flame": {
      if (want && !S.overheated) {
        reveal();
        S.firing = true;
        S.heat += dt / w.heatTime;
        S.flameAcc += dt * w.rate;
        while (S.flameAcc >= 1) {
          S.flameAcc -= 1;
          const life = w.range / w.speed;
          const p = fireProjectile(M, t, { spread: w.spread, dmg: w.dps / w.rate, range: w.range, rad: 0.5, life, burn: w.burn, burnDps: w.burnDps });
          p.kind = "flame";
        }
        if (S.heat >= 1) {
          S.heat = 1;
          S.overheated = true;
          M.emit({ type: "overheat", id: t.id });
        }
      } else {
        S.heat = Math.max(0, S.heat - dt / w.coolTime);
        S.flameAcc = 0;
        if (S.overheated && S.heat <= 0) S.overheated = false;
      }
      break;
    }
    default: {
      // shell, plasma, he
      if (want && S.cd <= 0) {
        reveal();
        const p = fireProjectile(M, t);
        shotEvent(p);
        recoil(t, w.recoil);
        S.cd = w.reload;
      }
    }
  }
}

/** 0..1 readiness of the weapon (for HUD rings and AI) */
export function weaponReady(t) {
  const w = t.stats.weapon;
  const S = t.ws;
  if (w.kind === "flame") return S.overheated ? 1 - S.heat : 1;
  if (w.kind === "clip") return S.reloading ? 1 - S.reloadT / w.reload : 1;
  if (w.kind === "rail" && S.charging) return 1;
  return 1 - S.cd / w.reload;
}

/* ------------------------------------------------------------------ abilities */
export function tryAbility(M, t) {
  if (!t.alive || t.ab.cd > 0) return false;
  const def = ABILITIES[t.stats.ability];
  const fx = t.fx;
  switch (def.key) {
    case "nitro":
      fx.nitro = def.dur;
      break;
    case "repair":
      if (t.hp >= t.stats.hp) return false;
      fx.repair = def.dur;
      fx.burnT = 0;
      break;
    case "shield":
      fx.shield = def.dur;
      break;
    case "focus":
      fx.focus = def.dur;
      break;
    case "overclock":
      fx.over = def.dur;
      if (t.ws.reloading) {
        t.ws.reloading = false;
        t.ws.clip = t.stats.weapon.clip;
      }
      break;
    case "cloak":
      if (t.carrying >= 0) return false;
      fx.cloak = def.dur;
      break;
    case "inferno": {
      M.emit({ type: "inferno", id: t.id, x: t.x, y: t.y + 1.2, z: t.z });
      const R = 10;
      for (const o of M.tanks) {
        if (!o.alive || !M.isEnemy(t, o)) continue;
        const d = Math.hypot(o.x - t.x, o.z - t.z, (o.y - t.y) * 0.7);
        if (d > R) continue;
        const k = 1 - (d / R) * 0.6;
        M.damage(o, 140 * k * M.dmgScale(t), t, "inferno", o.x, o.y + 1.2, o.z);
        o.fx.burnT = Math.max(o.fx.burnT, 3);
        o.fx.burnDps = Math.max(o.fx.burnDps, 16);
        o.fx.burnBy = t.id;
        // shove away
        const ux = (o.x - t.x) / (d || 1);
        const uz = (o.z - t.z) / (d || 1);
        o.vf += (ux * Math.sin(o.yaw) + uz * Math.cos(o.yaw)) * 5 * k;
        o.vl += (ux * Math.cos(o.yaw) - uz * Math.sin(o.yaw)) * 5 * k;
      }
      t.protT = 0;
      break;
    }
    case "barrage": {
      const ax = t.input.ax;
      const az = t.input.az;
      fx.barrage = def.dur;
      for (let i = 0; i < 6; i++) {
        const a = M.rand() * Math.PI * 2;
        const r = 2 + M.rand() * 7;
        M.schedule(0.7 + i * 0.28, { kind: "strike", owner: t.id, x: ax + Math.cos(a) * r, z: az + Math.sin(a) * r });
      }
      M.emit({ type: "barrage", id: t.id, x: ax, y: M.A.groundAt(ax, az), z: az });
      t.protT = 0;
      break;
    }
    default:
      return false;
  }
  t.ab.cd = def.cd;
  t.ab.active = def.dur;
  M.emit({ type: "ability", id: t.id, ability: def.key });
  return true;
}

export function updateEffects(M, t, dt) {
  const fx = t.fx;
  t.ab.cd = Math.max(0, t.ab.cd - dt);
  t.ab.active = Math.max(0, t.ab.active - dt);
  fx.nitro = Math.max(0, fx.nitro - dt);
  fx.shield = Math.max(0, fx.shield - dt);
  fx.focus = Math.max(0, fx.focus - dt);
  fx.over = Math.max(0, fx.over - dt);
  fx.barrage = Math.max(0, fx.barrage - dt);
  if (fx.cloak > 0) {
    fx.cloak -= dt;
    if (fx.cloak <= 0) {
      fx.cloak = 0;
      M.emit({ type: "uncloak", id: t.id });
    }
  }
  t.protT = Math.max(0, t.protT - dt);
  if (!t.alive) return;
  if (fx.repair > 0) {
    const d = Math.min(dt, fx.repair);
    fx.repair -= d;
    t.hp = Math.min(t.stats.hp, t.hp + ((t.stats.hp * 0.4) / ABILITIES.repair.dur) * d);
  }
  if (fx.burnT > 0) {
    fx.burnT -= dt;
    const src = M.tanks[fx.burnBy];
    if (src) M.damage(t, fx.burnDps * dt, src, "burn", t.x, t.y + 1, t.z, true);
    if (t.inWater) fx.burnT = 0;
  }
  // out-of-combat regeneration: after 6 s without damage
  t.sinceHit += dt;
  if (t.sinceHit > 6 && t.hp < t.stats.hp) t.hp = Math.min(t.stats.hp, t.hp + t.stats.hp * 0.035 * dt);
}

/* ------------------------------------------------------------------ projectiles */
/** segment (a→b, inflated by rad) vs a tank's oriented hull box; returns t or -1 */
export function segTank(o, ax, ay, az, bx, by, bz, rad) {
  const c = Math.cos(o.yaw);
  const s = Math.sin(o.yaw);
  const cy = o.y + o.dims.top / 2;
  const dxa = ax - o.x;
  const dza = az - o.z;
  const dxb = bx - o.x;
  const dzb = bz - o.z;
  // world → hull local (yaw only)
  const lax = dxa * c - dza * s;
  const laz = dxa * s + dza * c;
  const lbx = dxb * c - dzb * s;
  const lbz = dxb * s + dzb * c;
  const hw = o.dims.wid / 2 + rad;
  const hh = o.dims.top / 2 + rad;
  const hd = o.dims.len / 2 + rad;
  let t0 = 0;
  let t1 = 1;
  const slab = (a, b, h) => {
    const d = b - a;
    if (Math.abs(d) < 1e-9) return a >= -h && a <= h;
    let ta = (-h - a) / d;
    let tb = (h - a) / d;
    if (ta > tb) [ta, tb] = [tb, ta];
    if (ta > t0) t0 = ta;
    if (tb < t1) t1 = tb;
    return t0 <= t1;
  };
  if (!slab(lax, lbx, hw)) return -1;
  if (!slab(ay - cy, by - cy, hh)) return -1;
  if (!slab(laz, lbz, hd)) return -1;
  return t0;
}

export function stepProjectiles(M, dt) {
  const A = M.A;
  for (const p of M.proj.list) {
    if (!p.active) continue;
    p.age += dt;
    p.px = p.x;
    p.py = p.y;
    p.pz = p.z;
    let nx = p.x + p.vx * dt;
    let ny = p.y + p.vy * dt - 0.5 * p.g * dt * dt;
    let nz = p.z + p.vz * dt;
    p.vy -= p.g * dt;
    const flame = p.kind === "flame";
    if (flame) {
      // drag + expanding cone
      const k = Math.exp(-1.6 * dt);
      p.vx *= k;
      p.vy *= k;
      p.vz *= k;
      p.rad = 0.5 + p.age * 3.4;
    }
    // tanks
    let bestT = 2;
    let bestTank = null;
    for (const o of M.tanks) {
      if (!o.alive || o.id === p.owner) continue;
      if (p.hitSet && p.hitSet.has(o.id)) continue;
      if (Math.abs(o.x - p.x) > 30 + Math.abs(p.vx * dt) || Math.abs(o.z - p.z) > 30 + Math.abs(p.vz * dt)) continue;
      const tt = segTank(o, p.x, p.y, p.z, nx, ny, nz, flame ? Math.min(1.6, p.rad * 0.6) : p.rad);
      if (tt >= 0 && tt < bestT) {
        bestT = tt;
        bestTank = o;
      }
    }
    const wh = A.raycast(p.x, p.y, p.z, nx, ny, nz);
    const wt = wh ? wh.t : 2;
    if (bestTank && bestT <= wt) {
      const hx = p.x + (nx - p.x) * bestT;
      const hy = p.y + (ny - p.y) * bestT;
      const hz = p.z + (nz - p.z) * bestT;
      const owner = M.tanks[p.owner];
      const enemy = owner && M.isEnemy(owner, bestTank);
      if (flame) {
        if (enemy) {
          M.damage(bestTank, p.dmg, owner, "flame", hx, hy, hz, true);
          if (p.burn) {
            bestTank.fx.burnT = Math.max(bestTank.fx.burnT, p.burn);
            bestTank.fx.burnDps = Math.max(bestTank.fx.burnDps, p.burnDps);
            bestTank.fx.burnBy = owner.id;
          }
        }
        if (!p.hitSet) p.hitSet = new Set();
        p.hitSet.add(bestTank.id);
        // flames keep flowing around the target, a little weaker
        p.dmg *= 0.5;
      } else {
        if (enemy) {
          owner.hits++;
          M.damage(bestTank, p.dmg, owner, p.kind, hx, hy, hz);
        } else M.emit({ type: "deflect", x: hx, y: hy, z: hz });
        if (p.pierce && enemy) {
          if (!p.hitSet) p.hitSet = new Set();
          p.hitSet.add(bestTank.id);
          M.emit({ type: "impact", kind: p.kind, x: hx, y: hy, z: hz, nx: 0, ny: 1, nz: 0, tank: bestTank.id, surface: "metal" });
        } else {
          explode(M, p, hx, hy, hz, 0, 1, 0, bestTank.id, "metal");
          continue;
        }
      }
    } else if (wh) {
      if (flame) {
        p.active = false;
        M.emit({ type: "flamehit", x: wh.x, y: wh.y, z: wh.z });
        continue;
      }
      const surface = wh.what === "terrain" ? A.surfaceType(wh.x, wh.z, null) : wh.col?.surface || "concrete";
      explode(M, p, wh.x - p.vx * 0.0005, wh.y, wh.z - p.vz * 0.0005, wh.nx, wh.ny, wh.nz, -1, surface);
      continue;
    }
    const seg = Math.hypot(nx - p.x, ny - p.y, nz - p.z);
    p.x = nx;
    p.y = ny;
    p.z = nz;
    p.dist += seg;
    if (p.dist > p.range || p.age > p.life || p.y < -30) {
      if (!flame && p.kind !== "strike") M.emit({ type: "expire", kind: p.kind, x: p.x, y: p.y, z: p.z });
      p.active = false;
    }
  }
}

function explode(M, p, x, y, z, nx, ny, nz, tankId, surface) {
  p.active = false;
  const owner = M.tanks[p.owner];
  M.emit({ type: "impact", kind: p.kind, src: p.src, x, y, z, nx, ny, nz, tank: tankId, surface, splash: p.splash });
  if (p.splash > 0 && owner) splash(M, x, y, z, p.splash, p.dmg * p.splashMul, owner, tankId, p.kind);
}

export function splash(M, x, y, z, R, dmg, owner, exclude, kind) {
  for (const o of M.tanks) {
    if (!o.alive || o.id === exclude || !M.isEnemy(owner, o)) continue;
    // distance to the hull box (approx: centre minus half-size)
    const cy = o.y + o.dims.top / 2;
    const d = Math.max(0, Math.hypot(o.x - x, (cy - y) * 0.8, o.z - z) - o.dims.wid / 2);
    if (d > R) continue;
    if (!M.A.los(x, y + 0.4, z, o.x, cy, o.z)) continue;
    M.damage(o, dmg * (1 - (d / R) * 0.7), owner, kind === "strike" ? "barrage" : "splash", o.x, cy, o.z);
  }
}

/** artillery shells for the barrage ability (scheduled by tryAbility) */
export function spawnStrike(M, ev) {
  const owner = M.tanks[ev.owner];
  if (!owner) return;
  const p = M.proj.spawn();
  const gy = M.A.groundAt(ev.x, ev.z);
  p.kind = "strike";
  p.src = "titan";
  p.x = p.px = ev.x + 6;
  p.y = p.py = gy + 70;
  p.z = p.pz = ev.z - 3;
  p.vx = -6 * 1.4;
  p.vy = -98;
  p.vz = 3 * 1.4;
  p.g = 0;
  p.owner = owner.id;
  p.team = owner.team;
  p.dmg = 62 * M.dmgScale(owner);
  p.range = 200;
  p.splash = 5.5;
  p.splashMul = 1;
  p.rad = 0.2;
  p.life = 3;
  M.emit({ type: "whistle", x: ev.x, y: gy, z: ev.z });
}

/** where the barrel is pointing: first hit along the ballistic path (for HUD marker & AI) */
export function predictImpact(M, t, out = {}, maxT = 3) {
  const w = t.stats.weapon;
  muzzle(t, tmp);
  const speed = w.speed;
  let x = tmp.x;
  let y = tmp.y;
  let z = tmp.z;
  let vx = tmp.dx * speed;
  let vy = tmp.dy * speed;
  let vz = tmp.dz * speed;
  const g = w.kind === "flame" ? 0 : w.gravity;
  const range = w.range;
  const dt = clamp(range / speed / 24, 0.008, 0.08);
  let dist = 0;
  for (let k = 0; k < 40 && dist < range; k++) {
    const nx = x + vx * dt;
    const ny = y + vy * dt - 0.5 * g * dt * dt;
    const nz = z + vz * dt;
    vy -= g * dt;
    let best = 2;
    let tank = null;
    for (const o of M.tanks) {
      if (!o.alive || o.id === t.id) continue;
      const tt = segTank(o, x, y, z, nx, ny, nz, 0.1);
      if (tt >= 0 && tt < best) {
        best = tt;
        tank = o;
      }
    }
    const h = M.A.raycast(x, y, z, nx, ny, nz);
    if (h && h.t < best) {
      out.x = h.x;
      out.y = h.y;
      out.z = h.z;
      out.tank = null;
      out.hit = true;
      return out;
    }
    if (tank) {
      out.x = x + (nx - x) * best;
      out.y = y + (ny - y) * best;
      out.z = z + (nz - z) * best;
      out.tank = tank;
      out.hit = true;
      return out;
    }
    dist += Math.hypot(nx - x, ny - y, nz - z);
    x = nx;
    y = ny;
    z = nz;
  }
  out.x = x;
  out.y = y;
  out.z = z;
  out.tank = null;
  out.hit = false;
  return out;
}

export { rotYXZ, tv };
