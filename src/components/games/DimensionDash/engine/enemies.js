/**
 * Dimension Dash — robot enemies (small state machines) + their projectiles.
 *
 *   patrol   walks back and forth, turns at the ends (pause + wobble)
 *   fly      hovers and drifts; the classic homing-attack target
 *   shield   faces Sonic behind a front shield; only the back / top is weak
 *   chaser   wakes up (alert telegraph), charges within a leash, goes home
 *   turret   aims, glows for a clear wind-up, fires a slow energy ball
 *
 * Enemies inside a 2.5D zone move only along that zone's plane axis.
 */
import { floorBelow, insideTerrain } from "./geom.js";
import { isAttacking, hurtPlayer, bounce } from "./player.js";
import { SCORE } from "./config.js";

const fl = {};
/** deterministic per-enemy jitter (0..1) so runs are reproducible */
const hash = (i, k) => {
  const v = Math.sin(i * 127.1 + k * 311.7) * 43758.5453;
  return v - Math.floor(v);
};
const DEF = {
  patrol: { r: 0.75, hy: 0.55, speed: 2.6, homable: true },
  fly: { r: 0.7, hy: 0.0, speed: 2.2, homable: true },
  shield: { r: 0.85, hy: 0.6, speed: 1.6, homable: true },
  chaser: { r: 0.75, hy: 0.55, speed: 9.5, homable: true },
  turret: { r: 0.85, hy: 0.7, speed: 0, homable: true },
};

export function createEnemies(W, list) {
  const out = [];
  for (const src of list) {
    const d = DEF[src.kind] || DEF.patrol;
    const Z = src.zone != null ? W.zones[src.zone] : null;
    const h = Z ? Z.h : src.h || 0;
    const e = {
      kind: src.kind,
      x: src.x,
      y: src.y + (src.kind === "fly" ? src.fly ?? 1.6 : 0),
      z: src.z,
      hx: src.x,
      hy0: src.y + (src.kind === "fly" ? src.fly ?? 1.6 : 0),
      hz: src.z,
      ax: Math.sin(h), // movement axis
      az: Math.cos(h),
      range: src.range ?? 4,
      zone: src.zone,
      r: d.r,
      hy: d.hy,
      speed: d.speed * (src.fast ? 1.5 : 1),
      homable: d.homable,
      dir: 1,
      facing: h,
      state: "move",
      t: hash(out.length, 1) * 2,
      dead: false,
      deadT: 0,
      alert: 0,
      charge: 0,
      vx: 0,
      vz: 0,
      bob: hash(out.length, 2) * 6.28,
      flash: 0,
      leash: src.leash ?? 14,
      cool: 1 + hash(out.length, 3),
    };
    out.push(e);
  }
  return out;
}

function toPlayer(e, p) {
  return [p.x - e.x, p.y + 0.5 - (e.y + e.hy), p.z - e.z];
}

export function stepEnemies(W, dt) {
  const p = W.player;
  for (const e of W.enemies) {
    if (e.dead) {
      e.deadT += dt;
      continue;
    }
    e.t += dt;
    e.flash = Math.max(0, e.flash - dt);
    const [dx, dy, dz] = toPlayer(e, p);
    const dist = Math.hypot(dx, dy, dz);
    switch (e.kind) {
      case "patrol":
        patrol(W, e, dt);
        break;
      case "fly": {
        e.bob += dt * 2.2;
        const off = Math.sin(e.t * 0.6) * e.range;
        e.x = e.hx + e.ax * off;
        e.z = e.hz + e.az * off;
        e.y = e.hy0 + Math.sin(e.bob) * 0.45;
        e.facing = Math.atan2(dx, dz);
        break;
      }
      case "shield": {
        // turn to face Sonic and shuffle toward him when close
        const want = Math.atan2(dx, dz);
        let da = want - e.facing;
        while (da > Math.PI) da -= Math.PI * 2;
        while (da < -Math.PI) da += Math.PI * 2;
        e.facing += Math.max(-2.2 * dt, Math.min(2.2 * dt, da));
        if (e.zone != null) e.facing = dx * e.ax + dz * e.az >= 0 ? Math.atan2(e.ax, e.az) : Math.atan2(-e.ax, -e.az);
        if (dist < 10 && p.action !== "dead") {
          const a = (dx * e.ax + dz * e.az) >= 0 ? 1 : -1;
          const off = (e.x - e.hx) * e.ax + (e.z - e.hz) * e.az;
          if (Math.abs(off + a * e.speed * dt) < e.range) {
            e.x += e.ax * a * e.speed * dt;
            e.z += e.az * a * e.speed * dt;
          }
          if (e.zone == null) {
            // in 3D, step directly toward
            const hd = Math.hypot(dx, dz) || 1;
            const nx = e.x + (dx / hd) * e.speed * dt * 0.5;
            const nz = e.z + (dz / hd) * e.speed * dt * 0.5;
            if (Math.hypot(nx - e.hx, nz - e.hz) < e.range + 1) {
              e.x = nx;
              e.z = nz;
            }
          }
        }
        ground(W, e);
        break;
      }
      case "chaser":
        chaser(W, e, dx, dz, dist, dt);
        break;
      case "turret":
        turret(W, e, dx, dy, dz, dist, dt);
        break;
      default:
        break;
    }
    contact(W, e, p, dist);
  }
  stepShots(W, dt);
}

function ground(W, e) {
  if (floorBelow(W.geom, e.x, e.z, e.y + 1.2, e.y - 3, fl)) e.y = fl.y;
}

function patrol(W, e, dt) {
  if (e.state === "turn") {
    if (e.t > 0.6) {
      e.state = "move";
      e.t = 0;
      e.dir = -e.dir;
    }
  } else {
    const off = (e.x - e.hx) * e.ax + (e.z - e.hz) * e.az;
    const n = off + e.dir * e.speed * dt;
    if (Math.abs(n) > e.range) {
      e.state = "turn";
      e.t = 0;
    } else {
      const nx = e.x + e.ax * e.dir * e.speed * dt;
      const nz = e.z + e.az * e.dir * e.speed * dt;
      // don't walk off ledges
      if (floorBelow(W.geom, nx, nz, e.y + 1, e.y - 1.2, fl)) {
        e.x = nx;
        e.z = nz;
        e.y = fl.y;
      } else {
        e.state = "turn";
        e.t = 0;
      }
    }
    e.facing = Math.atan2(e.ax * e.dir, e.az * e.dir);
  }
}

function chaser(W, e, dx, dz, dist, dt) {
  const p = W.player;
  const home = Math.hypot(e.x - e.hx, e.z - e.hz);
  const near = dist < 12 && p.action !== "dead" && Math.hypot(p.x - e.hx, p.z - e.hz) < e.leash;
  if (e.state === "move") e.state = "idle";
  if (e.state === "idle") {
    if (near) {
      e.state = "alert";
      e.t = 0;
      W.events.push({ type: "enemyAlert", x: e.x, y: e.y, z: e.z });
    } else if (home > 0.3) {
      const k = Math.min(1, (4 * dt) / home);
      e.x += (e.hx - e.x) * k;
      e.z += (e.hz - e.z) * k;
    }
  } else if (e.state === "alert") {
    if (e.t > 0.55) {
      e.state = "chase";
      e.t = 0;
    }
  } else if (e.state === "chase") {
    if (!near || e.t > 6) {
      e.state = "idle";
      e.t = 0;
    } else {
      let mx = dx;
      let mz = dz;
      if (e.zone != null) {
        const a = dx * e.ax + dz * e.az;
        mx = e.ax * a;
        mz = e.az * a;
      }
      const l = Math.hypot(mx, mz) || 1;
      e.vx += ((mx / l) * e.speed - e.vx) * Math.min(1, 3 * dt);
      e.vz += ((mz / l) * e.speed - e.vz) * Math.min(1, 3 * dt);
      const nx = e.x + e.vx * dt;
      const nz = e.z + e.vz * dt;
      if (floorBelow(W.geom, nx, nz, e.y + 1, e.y - 1.5, fl) && Math.hypot(nx - e.hx, nz - e.hz) < e.leash) {
        e.x = nx;
        e.z = nz;
        e.y = fl.y;
      } else {
        e.vx = e.vz = 0;
      }
    }
  }
  if (Math.hypot(dx, dz) > 0.1 && e.state !== "idle") e.facing = Math.atan2(dx, dz);
}

function turret(W, e, dx, dy, dz, dist, dt) {
  const p = W.player;
  const want = Math.atan2(dx, dz);
  let da = want - e.facing;
  while (da > Math.PI) da -= Math.PI * 2;
  while (da < -Math.PI) da += Math.PI * 2;
  e.facing += Math.max(-2 * dt, Math.min(2 * dt, da));
  e.cool -= dt;
  if (e.state === "move") e.state = "idle";
  if (e.state === "idle") {
    if (dist < 22 && e.cool <= 0 && p.action !== "dead") {
      e.state = "charge";
      e.t = 0;
      W.events.push({ type: "turretCharge", x: e.x, y: e.y + e.hy, z: e.z });
    }
  } else if (e.state === "charge") {
    e.charge = Math.min(1, e.t / 0.9);
    if (e.t > 0.9 && dist < 4.5) {
      // never fire point-blank (unreadable): fizzle and re-arm
      e.state = "idle";
      e.charge = 0;
      e.cool = 0.8;
    } else if (e.t > 0.9) {
      e.state = "idle";
      e.charge = 0;
      e.cool = 1.8;
      // aim at where Sonic is (in-plane inside zones)
      let tx = dx;
      let ty = dy;
      let tz = dz;
      if (e.zone != null) {
        const a = dx * e.ax + dz * e.az;
        tx = e.ax * a;
        tz = e.az * a;
      }
      const l = Math.hypot(tx, ty, tz) || 1;
      const sp = 12;
      W.shots.push({ x: e.x + (tx / l) * 0.9, y: e.y + e.hy + (ty / l) * 0.9, z: e.z + (tz / l) * 0.9, vx: (tx / l) * sp, vy: (ty / l) * sp, vz: (tz / l) * sp, t: 0, r: 0.38, kind: "orb", id: W.shotSeq++ });
      W.events.push({ type: "shoot", x: e.x, y: e.y + e.hy, z: e.z });
    }
  }
}

function contact(W, e, p, dist) {
  if (p.action === "dead" || p.action === "victory") return;
  if (dist > e.r + 0.55) return;
  const attacking = isAttacking(p, W);
  if (attacking && e.kind === "shield" && W.power.invincible <= 0) {
    // the shield covers the front half; above-and-falling also counts as the weak side
    const fx = Math.sin(e.facing);
    const fz = Math.cos(e.facing);
    const tx = p.x - e.x;
    const tz = p.z - e.z;
    const front = (tx * fx + tz * fz) / (Math.hypot(tx, tz) || 1);
    const above = p.y > e.y + e.hy + 0.35 && p.vy <= 2;
    if (front > 0.25 && !above) {
      // deflect
      const l = Math.hypot(tx, tz) || 1;
      p.vx = (tx / l) * 9;
      p.vz = (tz / l) * 9;
      if (p.mode === "side" && p.zone) {
        const a = p.vx * p.zone.fx + p.vz * p.zone.fz;
        p.vx = p.zone.fx * a;
        p.vz = p.zone.fz * a;
      }
      p.vy = Math.max(p.vy, 7);
      p.grounded = false;
      p.floor = null;
      p.action = "ball";
      p.homing = null;
      p.lockT = 0.25;
      e.flash = 0.3;
      W.events.push({ type: "shieldBlock", x: e.x, y: e.y + e.hy, z: e.z });
      return;
    }
  }
  if (attacking) {
    defeat(W, e, p);
    return;
  }
  hurtPlayer(W, p, e.x, e.z, "enemy");
}

export function defeat(W, e, p) {
  e.dead = true;
  e.deadT = 0;
  W.stats.enemies++;
  const airborne = !p.grounded || p.action === "homing";
  let pts = SCORE.enemy;
  if (airborne) {
    pts = SCORE.chain[Math.min(SCORE.chain.length - 1, W.chain)];
    W.chain++;
    bounce(W, p, p.action === "homing");
  }
  W.score += pts;
  W.events.push({ type: "enemyDefeat", x: e.x, y: e.y + e.hy, z: e.z, kind: e.kind, pts, chain: W.chain });
}

function stepShots(W, dt) {
  const p = W.player;
  const keep = [];
  for (const s of W.shots) {
    s.t += dt;
    if (s.grav) s.vy -= s.grav * dt;
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.z += s.vz * dt;
    let dead = s.t > 4.5;
    if (!dead && insideTerrain(W.geom, s.x, s.y, s.z)) dead = true;
    if (!dead && floorBelow(W.geom, s.x, s.z, s.y + 0.05, s.y - s.r, fl)) dead = true;
    const d = Math.hypot(p.x - s.x, p.y + 0.55 - s.y, p.z - s.z);
    if (!dead && d < s.r + 0.5 && p.action !== "dead") {
      if (p.action === "homing" || (isAttacking(p, W) && W.power.invincible > 0)) {
        dead = true;
      } else {
        hurtPlayer(W, p, s.x - s.vx, s.z - s.vz, "shot");
        dead = true;
      }
    }
    if (dead) W.events.push({ type: "shotPop", x: s.x, y: s.y, z: s.z });
    else keep.push(s);
  }
  W.shots = keep;
}
