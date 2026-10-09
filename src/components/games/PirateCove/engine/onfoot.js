/**
 * Pirate Cove — on foot. The land world (ground height, water's edge,
 * colliders, platforms) and the pirate's third-person controller.
 *
 * Land world, per island:
 *   area "out"      the island's terrain + its props' colliders + the dock deck
 *   area <caveId>   a cave interior (engine/cave.js SDF) with its own colliders
 * Colliders:
 *   circle { x, z, r }                       — solid (palm trunks, rocks, barrels)
 *   box    { x, z, hw, hd, rot, top, gate? } — solid, OR walkable on top when
 *                                              your feet are within a step of `top`
 *                                              (dock planks, steps, ruin floors)
 * The pirate never enters water deeper than ankle height and never climbs a
 * rise taller than a step (cliffs are walls).
 */
import { caveSDF, caveFloor } from "./cave.js";
import { clamp, wrapAngle } from "./rng.js";

export const STEP_UP = 0.55;
const WATER_LIMIT = -0.3;
export const PIRATE_R = 0.42;

export function createLand(terrain) {
  return {
    terrain,
    areas: { out: { circles: [], boxes: [] } },
    caves: {},
  };
}

export function addArea(land, id, cave) {
  land.areas[id] = { circles: [], boxes: [] };
  land.caves[id] = cave;
}

function boxLocal(b, x, z) {
  const dx = x - b.x;
  const dz = z - b.z;
  const c = Math.cos(b.rot || 0);
  const s = Math.sin(b.rot || 0);
  return { lx: dx * c - dz * s, lz: dx * s + dz * c, c, s };
}

/** Ground under (x, z) for feet at `feetY`. Returns { h, water }. */
export function groundAt(land, area, x, z, feetY) {
  const A = land.areas[area];
  if (area !== "out") {
    const C = land.caves[area];
    const lx = x - C.origin.x;
    const lz = z - C.origin.z;
    const floor = caveFloor(C, lx, lz);
    const h = A ? platformTop(A, x, z, feetY, floor) : floor;
    return { h, water: false, plat: true, wall: caveSDF(C, lx, lz) > -PIRATE_R };
  }
  let h = land.terrain.height(x, z);
  let onPlat = false;
  if (A) {
    const p = platformTop(A, x, z, feetY, -Infinity);
    if (p > h - 0.05) {
      h = Math.max(h, p);
      onPlat = p > -Infinity;
    }
  }
  return { h, water: !onPlat && h < WATER_LIMIT, plat: onPlat };
}

function platformTop(A, x, z, feetY, h) {
  for (const b of A.boxes) {
    if (b.gate && b.gate.open) continue;
    if (b.top > feetY + STEP_UP) continue;
    const { lx, lz } = boxLocal(b, x, z);
    if (Math.abs(lx) <= b.hw && Math.abs(lz) <= b.hd && b.top > h) h = b.top;
  }
  return h;
}

/** Pushes a circle at (x, z) out of solid colliders. */
export function pushOut(land, area, x, z, r, feetY) {
  const A = land.areas[area];
  if (!A) return { x, z };
  for (let it = 0; it < 2; it++) {
    for (const c of A.circles) {
      const dx = x - c.x;
      const dz = z - c.z;
      const d = Math.hypot(dx, dz);
      const m = c.r + r;
      if (d < m) {
        if (d < 1e-4) {
          x += m;
          continue;
        }
        x = c.x + (dx / d) * m;
        z = c.z + (dz / d) * m;
      }
    }
    for (const b of A.boxes) {
      if (b.gate && b.gate.open) continue;
      if (b.top <= feetY + STEP_UP) continue; // walkable on top → not a wall
      if (b.bottom != null && feetY > b.bottom) continue;
      const { lx, lz, c, s } = boxLocal(b, x, z);
      const qx = clamp(lx, -b.hw, b.hw);
      const qz = clamp(lz, -b.hd, b.hd);
      let ox = lx - qx;
      let oz = lz - qz;
      let d = Math.hypot(ox, oz);
      let nlx = lx;
      let nlz = lz;
      if (d < 1e-4) {
        // centre inside: leave by the nearest face
        const px = b.hw - Math.abs(lx);
        const pz = b.hd - Math.abs(lz);
        if (px < pz) nlx = Math.sign(lx || 1) * (b.hw + r);
        else nlz = Math.sign(lz || 1) * (b.hd + r);
      } else if (d < r) {
        nlx = qx + (ox / d) * r;
        nlz = qz + (oz / d) * r;
      } else continue;
      // back to world (inverse rotation)
      x = b.x + nlx * c + nlz * s;
      z = b.z - nlx * s + nlz * c;
    }
  }
  return { x, z };
}

/** True when the pirate can stand at (x, z) coming from feet height `feetY`. */
function canStand(land, area, x, z, feetY, grounded, stepLen) {
  const g = groundAt(land, area, x, z, feetY);
  if (g.water || g.wall) return null;
  const rise = g.h - feetY;
  if (grounded) {
    if (rise > STEP_UP) return null;
    if (!g.plat && rise > 0.12 && stepLen > 1e-4 && rise / stepLen > 1.35) return null; // too steep to walk up
  } else if (rise > 0.25) return null;
  return g;
}

/** Tries to move to (nx, nz); slides along walls by trying each axis. */
export function moveBody(land, area, body, nx, nz, r) {
  const tries = [
    [nx, nz],
    [nx, body.z],
    [body.x, nz],
  ];
  for (const [tx, tz] of tries) {
    const p = pushOut(land, area, tx, tz, r, body.y);
    const step = Math.hypot(p.x - body.x, p.z - body.z);
    const g = canStand(land, area, p.x, p.z, body.y, body.grounded, step);
    if (g) {
      body.x = p.x;
      body.z = p.z;
      return g;
    }
  }
  // stay put, but still resolve any overlap at the current spot
  const p = pushOut(land, area, body.x, body.z, r, body.y);
  if (canStand(land, area, p.x, p.z, body.y, true, 0.001)) {
    body.x = p.x;
    body.z = p.z;
  }
  return groundAt(land, area, body.x, body.z, body.y);
}

// ------------------------------------------------------------------ pirate

export const ATTACKS = [
  { dur: 0.4, hitFrom: 0.1, hitTo: 0.22, dmg: 16, reach: 2.1, arc: 1.1, lunge: 2.6 },
  { dur: 0.4, hitFrom: 0.1, hitTo: 0.22, dmg: 16, reach: 2.1, arc: 1.1, lunge: 2.6 },
  { dur: 0.62, hitFrom: 0.2, hitTo: 0.34, dmg: 30, reach: 2.4, arc: 1.4, lunge: 4.2 },
];

export function createPirate(x, z, yaw, hp = 100) {
  return {
    x,
    y: 0,
    z,
    vx: 0,
    vz: 0,
    vy: 0,
    yaw,
    camYaw: yaw,
    camPitch: 0.32,
    grounded: true,
    hp,
    maxHp: 100,
    state: "move", // move | attack | dodge | dig | hurt | dead | open
    stateT: 0,
    combo: 0,
    queued: false,
    swingId: 0,
    blocking: false,
    invuln: 0,
    speed: 0,
    moveAnim: 0,
    lastHurt: -9,
    area: "out",
    distance: 0,
    landT: 0,
    airT: 0,
  };
}

/**
 * One fixed step. inp: { mx, mz (camera-relative stick, -1..1), sprint, block,
 * jump/attack/dodge (edge presses, already taken) }. Returns small events.
 */
export function stepPirate(p, inp, land, dt, ctx) {
  const ev = [];
  p.stateT += dt;
  if (p.invuln > 0) p.invuln -= dt;
  if (p.state === "dead") {
    p.vx *= 0.8;
    p.vz *= 0.8;
    settle(p, land, dt);
    return ev;
  }

  // --- camera-relative intent
  const cy = Math.cos(p.camYaw);
  const sy = Math.sin(p.camYaw);
  // forward = (sin, cos), right = (-cos, sin)
  let wx = inp.mz * sy - inp.mx * cy;
  let wz = inp.mz * cy + inp.mx * sy;
  const mag = Math.min(1, Math.hypot(wx, wz));
  if (mag > 1e-3) {
    const l = Math.hypot(wx, wz);
    wx /= l;
    wz /= l;
  }

  p.blocking = !!inp.block && p.grounded && (p.state === "move" || p.state === "block");

  // --- actions
  if (inp.attack && p.grounded && (p.state === "move" || p.state === "attack")) {
    if (p.state === "attack") {
      if (p.stateT > ATTACKS[p.combo].dur * 0.45 && p.combo < 2) p.queued = true;
    } else startAttack(p, 0, ctx);
  }
  if (inp.dodge && p.grounded && p.state === "move" && !p.blocking) {
    p.state = "dodge";
    p.stateT = 0;
    p.invuln = 0.42;
    const dx = mag > 0.1 ? wx : Math.sin(p.yaw);
    const dz = mag > 0.1 ? wz : Math.cos(p.yaw);
    p.yaw = Math.atan2(dx, dz);
    ev.push({ type: "dodge" });
  }

  let tvx = 0;
  let tvz = 0;
  if (p.state === "move") {
    const sp = p.blocking ? 1.7 : inp.sprint ? 7.2 : mag < 0.55 ? 2.4 : 4.6;
    tvx = wx * sp * Math.max(mag, mag > 0.05 ? 0.5 : 0);
    tvz = wz * sp * Math.max(mag, mag > 0.05 ? 0.5 : 0);
    if (mag > 0.05) {
      const want = p.blocking ? p.camYaw : Math.atan2(wx, wz);
      const d = wrapAngle(want - p.yaw);
      p.yaw = wrapAngle(p.yaw + clamp(d, -dt * 12, dt * 12));
    } else if (p.blocking) {
      const d = wrapAngle(p.camYaw - p.yaw);
      p.yaw = wrapAngle(p.yaw + clamp(d, -dt * 10, dt * 10));
    }
    if (inp.jump && p.grounded) {
      p.vy = 6.6;
      p.grounded = false;
      p.airT = 0;
      ev.push({ type: "jump" });
    }
  } else if (p.state === "attack") {
    const A = ATTACKS[p.combo];
    const lunge = p.stateT < A.hitTo ? A.lunge : 0;
    tvx = Math.sin(p.yaw) * lunge;
    tvz = Math.cos(p.yaw) * lunge;
    if (p.stateT >= A.dur) {
      if (p.queued && p.combo < 2) startAttack(p, p.combo + 1, ctx);
      else {
        p.state = "move";
        p.combo = 0;
      }
    }
  } else if (p.state === "dodge") {
    const k = 1 - p.stateT / 0.45;
    tvx = Math.sin(p.yaw) * 8.5 * Math.max(0.2, k);
    tvz = Math.cos(p.yaw) * 8.5 * Math.max(0.2, k);
    if (p.stateT > 0.45) p.state = "move";
  } else if (p.state === "hurt") {
    if (p.stateT > 0.32) p.state = "move";
  } else if (p.state === "dig") {
    if (p.stateT > 1.9) {
      p.state = "move";
      ev.push({ type: "digDone" });
    }
  } else if (p.state === "open") {
    if (p.stateT > 1.1) p.state = "move";
  }

  // --- velocity smoothing (snappy on the ground, floaty in the air)
  const acc = p.grounded ? (p.state === "move" ? 16 : 22) : 5;
  const k = Math.min(1, dt * acc);
  p.vx += (tvx - p.vx) * k;
  p.vz += (tvz - p.vz) * k;
  p.speed = Math.hypot(p.vx, p.vz);

  const ox = p.x;
  const oz = p.z;
  moveBody(land, p.area, p, p.x + p.vx * dt, p.z + p.vz * dt, PIRATE_R);
  const moved = Math.hypot(p.x - ox, p.z - oz);
  p.distance += moved;
  p.moveAnim += moved;
  if (moved < p.speed * dt * 0.3) {
    // blocked — bleed velocity so we don't "push" into walls
    p.vx *= 0.5;
    p.vz *= 0.5;
  }
  const wasAir = !p.grounded;
  const vyBefore = p.vy;
  settle(p, land, dt);
  if (wasAir && p.grounded && p.airT > 0.12) ev.push({ type: "land", hard: vyBefore < -9 });
  return ev;
}

function settle(p, land, dt) {
  const g = groundAt(land, p.area, p.x, p.z, p.y);
  if (p.grounded) {
    if (g.h < p.y - 0.65) {
      p.grounded = false;
      p.vy = 0;
      p.airT = 0;
    } else {
      p.y += (g.h - p.y) * Math.min(1, dt * 20);
      if (Math.abs(g.h - p.y) < 0.02) p.y = g.h;
      p.vy = 0;
      return;
    }
  }
  p.airT += dt;
  p.vy -= 22 * dt;
  p.y += p.vy * dt;
  if (p.y <= g.h) {
    p.y = g.h;
    p.vy = 0;
    p.grounded = true;
  }
}

function startAttack(p, combo, ctx) {
  p.state = "attack";
  p.stateT = 0;
  p.combo = combo;
  p.queued = false;
  p.swingId++;
  // soft aim assist: face the nearest foe in front, else the camera direction
  const target = ctx?.nearestFoe?.(p, 4.5, 1.6);
  if (target) p.yaw = Math.atan2(target.x - p.x, target.z - p.z);
  else if (ctx?.useCamYaw) p.yaw = p.camYaw;
}

/** Is the sword active this frame? Returns the attack spec or null. */
export function activeSwing(p) {
  if (p.state !== "attack") return null;
  const A = ATTACKS[p.combo];
  return p.stateT >= A.hitFrom && p.stateT <= A.hitTo ? A : null;
}

/** Damage to the pirate from a frontal blow at (fx, fz). Block soaks most of it. Returns applied dmg. */
export function hurtPirate(p, dmg, fx, fz, time) {
  if (p.state === "dead" || p.invuln > 0) return { dmg: 0, blocked: false, dodged: p.state === "dodge" };
  let blocked = false;
  if (p.blocking) {
    const toFoe = Math.atan2(fx - p.x, fz - p.z);
    if (Math.abs(wrapAngle(toFoe - p.yaw)) < 1.25) {
      blocked = true;
      dmg *= 0.15;
    }
  }
  p.hp = Math.max(0, p.hp - dmg);
  p.lastHurt = time;
  const ax = p.x - fx;
  const az = p.z - fz;
  const al = Math.hypot(ax, az) || 1;
  const kb = blocked ? 2.5 : 5;
  p.vx += (ax / al) * kb;
  p.vz += (az / al) * kb;
  if (p.hp <= 0) {
    p.state = "dead";
    p.stateT = 0;
  } else if (!blocked) {
    p.state = "hurt";
    p.stateT = 0;
    p.invuln = 0.35;
  }
  return { dmg, blocked, dodged: false };
}
