/**
 * Oceanbound — first-person body physics.
 *
 * The player is a vertical cylinder (radius PR, height PH) with feet at
 * P.y. Ground = the highest walkable surface under the feet: raft decks /
 * roofs / stairs (raft-local boxes, shifted by the raft's position), island
 * terrain and the seabed. Taller boxes and island obstacles (trees, rocks,
 * ruins) push the body out horizontally. The raft is a moving platform: when
 * the player stands on (or jumps above) it, its motion is carried over.
 *
 * Water: chest-deep → swimming (buoyant, 3D movement when submerged,
 * Space rises, C / Ctrl dives). Swimming against a raft edge and pressing
 * Space (or E) climbs aboard.
 */
import { CELL, rampTop } from "./raft.js";
import { waveHeight } from "./waves.js";
import { groundHeight, islandsNear, islandNodes } from "./islands.js";
import { clamp } from "./util.js";

export const PR = 0.3;
export const PH = 1.78;
export const EYE = 1.62;
export const STEP = 0.5;
const GRAV = 21;
const JUMP_V = 6.6;
const WALK = 3.7;
const SPRINT = 6.1;
const SWIM = 2.5;
const SWIM_FAST = 3.7;

export function createPlayer() {
  return {
    x: 0,
    y: 0.3,
    z: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    yaw: Math.PI * 0.5, // look along +x (the current)
    pitch: -0.08,
    mode: "walk", // walk | swim
    grounded: false,
    ground: null, // "raft" | "land" | null
    onRaftFrame: false,
    underwater: false,
    headUnder: false,
    climb: null,
    stepAcc: 0,
    bob: 0,
    landImpact: 0,
    wade: false,
  };
}

/** look direction vector */
export function lookDir(P) {
  const cp = Math.cos(P.pitch);
  return [-Math.sin(P.yaw) * cp, Math.sin(P.pitch), -Math.cos(P.yaw) * cp];
}
export const eyePos = (P) => [P.x, P.y + EYE, P.z];

/* --------------------------------------------------------------- obstacles near the player */
function islandObstacles(G, x, z) {
  const out = [];
  for (const I of islandsNear(G.world, x, z, 60)) {
    if (Math.hypot(I.x - x, I.z - z) > I.r * 2 + 6) continue;
    islandNodes(G.world, I);
    const st = G.islandState[I.id];
    for (const c of I.colliders) {
      if (c.node != null && st && st.gone && st.gone[c.node] != null) continue;
      if (Math.abs(c.x - x) > c.r + 2 || Math.abs(c.z - z) > c.r + 2) continue;
      out.push(c);
    }
  }
  return out;
}

/** raft colliders in world space near the player (cheap reject first) */
function raftBoxes(G, x, z) {
  const R = G.raft;
  const lx = x - R.x;
  const lz = z - R.z;
  const out = [];
  for (const c of R.colliders) {
    if (lx < c.x0 - 1 || lx > c.x1 + 1 || lz < c.z0 - 1 || lz > c.z1 + 1) continue;
    out.push(c);
  }
  return out;
}
const circleRect = (lx, lz, r, c) => {
  const qx = clamp(lx, c.x0, c.x1);
  const qz = clamp(lz, c.z0, c.z1);
  const dx = lx - qx;
  const dz = lz - qz;
  return dx * dx + dz * dz < r * r;
};
function boxTop(c, lx, lz) {
  return c.ramp ? rampTop(c, lx, lz) : c.y1;
}

/** highest walkable surface under (x, z) not above maxY; returns { h, kind } */
export function groundUnder(G, x, z, maxY, boxes) {
  const R = G.raft;
  let h = groundHeight(G.world, x, z);
  let kind = "land";
  const lx = x - R.x;
  const lz = z - R.z;
  for (const c of boxes || raftBoxes(G, x, z)) {
    if (!circleRect(lx, lz, PR * 0.75, c)) continue;
    const top = boxTop(c, clamp(lx, c.x0, c.x1), clamp(lz, c.z0, c.z1)) + R.y;
    if (top <= maxY && top > h) {
      h = top;
      kind = "raft";
    }
  }
  return { h, kind };
}

/** resolve horizontal overlap with raft boxes + island cylinders */
function pushOut(G, P, boxes, obst) {
  const R = G.raft;
  const feet = P.y;
  const head = P.y + PH;
  for (let iter = 0; iter < 3; iter++) {
    let moved = false;
    const lx = P.x - R.x;
    const lz = P.z - R.z;
    for (const c of boxes) {
      const y0 = c.y0 + R.y;
      let top = c.y1 + R.y;
      if (c.ramp) {
        top = rampTop(c, clamp(lx, c.x0, c.x1), clamp(lz, c.z0, c.z1)) + R.y;
        if (top <= feet + STEP) continue;
      }
      if (top <= feet + STEP || y0 >= head) continue;
      if (!circleRect(lx, lz, PR, c)) continue;
      const qx = clamp(lx, c.x0, c.x1);
      const qz = clamp(lz, c.z0, c.z1);
      let dx = lx - qx;
      let dz = lz - qz;
      const d = Math.hypot(dx, dz);
      if (d > 1e-5) {
        const k = (PR - d) / d;
        P.x += dx * k;
        P.z += dz * k;
        const nx = dx / d;
        const nz = dz / d;
        const vn = P.vx * nx + P.vz * nz;
        if (vn < 0) {
          P.vx -= vn * nx;
          P.vz -= vn * nz;
        }
      } else {
        // centre inside the box: leave by the shallowest side
        const pen = [lx - c.x0 + PR, c.x1 - lx + PR, lz - c.z0 + PR, c.z1 - lz + PR];
        const m = pen.indexOf(Math.min(...pen));
        if (m === 0) P.x -= pen[0];
        else if (m === 1) P.x += pen[1];
        else if (m === 2) P.z -= pen[2];
        else P.z += pen[3];
      }
      moved = true;
    }
    for (const c of obst) {
      if (c.y1 <= feet + STEP || c.y0 >= head) continue;
      const dx = P.x - c.x;
      const dz = P.z - c.z;
      const d = Math.hypot(dx, dz);
      const rr = c.r + PR;
      if (d < rr && d > 1e-5) {
        P.x = c.x + (dx / d) * rr;
        P.z = c.z + (dz / d) * rr;
        moved = true;
      }
    }
    if (!moved) break;
  }
}

/** ceilings (roof slab underside etc.) */
function ceiling(G, P, boxes) {
  const R = G.raft;
  const lx = P.x - R.x;
  const lz = P.z - R.z;
  let lim = Infinity;
  for (const c of boxes) {
    if (c.ramp) continue;
    const y0 = c.y0 + R.y;
    if (y0 < P.y + 0.9) continue;
    if (!circleRect(lx, lz, PR * 0.8, c)) continue;
    lim = Math.min(lim, y0);
  }
  return lim;
}

/** is the point inside the raft footprint (local cell present)? */
export function overRaft(G, x, z, pad = 0) {
  const R = G.raft;
  const lx = x - R.x;
  const lz = z - R.z;
  for (const c of R.cells.values()) {
    if (lx >= c.i * CELL - pad && lx <= (c.i + 1) * CELL + pad && lz >= c.j * CELL - pad && lz <= (c.j + 1) * CELL + pad) return c;
  }
  return null;
}

/** where a swimmer would climb aboard (null if not at an edge) */
export function climbSpot(G, P) {
  if (P.mode !== "swim") return null;
  const R = G.raft;
  const deck = R.y;
  if (deck - P.y > 2.2 || P.y + PH < deck - 0.6) return null;
  const c = overRaft(G, P.x, P.z, PR + 0.45);
  if (!c) return null;
  const lx = P.x - R.x;
  const lz = P.z - R.z;
  const tx = clamp(lx, c.i * CELL + 0.45, (c.i + 1) * CELL - 0.45);
  const tz = clamp(lz, c.j * CELL + 0.45, (c.j + 1) * CELL - 0.45);
  // must be free of walls / stations at the landing spot
  for (const b of R.colliders) {
    if (b.deck || b.ramp) continue;
    if (b.y0 > 1.9) continue;
    if (circleRect(tx, tz, PR, b)) return null;
  }
  return { x: tx + R.x, z: tz + R.z, lx: tx, lz: tz };
}

/**
 * step the body. I = intent { mx, mz, jump, jumpPressed, sprint, dive, climb }
 * returns { stamina use, events }
 */
export function stepPlayer(G, P, I, dt, raftDelta) {
  const R = G.raft;
  const ev = G.events;
  // moving platform: carry the player with the raft
  if (P.onRaftFrame && !P.climb) {
    P.x += raftDelta[0];
    P.y += raftDelta[1];
    P.z += raftDelta[2];
  }
  if (P.climb) {
    const C = P.climb;
    C.t += dt / C.dur;
    const t = Math.min(1, C.t);
    const e = t * t * (3 - 2 * t);
    // climb in raft-local space so the moving raft carries it
    P.x = R.x + C.sx + (C.tx - C.sx) * e;
    P.z = R.z + C.sz + (C.tz - C.sz) * e;
    P.y = R.y + C.sy * (1 - e) + Math.sin(t * Math.PI) * 0.35;
    if (t >= 1) {
      P.climb = null;
      P.y = R.y;
      P.mode = "walk";
      P.grounded = true;
      P.ground = "raft";
      P.onRaftFrame = true;
      P.vx = P.vy = P.vz = 0;
      ev.push({ t: "climbed" });
    }
    return { sprinting: false, swimming: false, moving: true };
  }

  const water = waveHeight(P.x, P.z, G.t);
  const boxes = raftBoxes(G, P.x, P.z);
  const gq = groundUnder(G, P.x, P.z, P.y + STEP, boxes);
  const depth = water - gq.h; // water depth at the player's position
  const sub = water - P.y; // how deep the feet are
  const wasSwim = P.mode === "swim";

  // walking ↔ swimming
  if (P.mode === "walk") {
    if (sub > 1.15 && depth > 1.35 && !(P.grounded && gq.kind === "raft")) {
      P.mode = "swim";
      if (P.vy < -4) ev.push({ t: "splash", x: P.x, y: water, z: P.z, s: clamp(-P.vy / 8, 0.4, 1.4) });
      ev.push({ t: "enterWater" });
    }
  } else if (depth < 1.25 || (gq.kind === "raft" && gq.h > water - 0.3 && P.y >= gq.h - 0.05)) {
    P.mode = "walk";
    ev.push({ t: "exitWater" });
  }

  // movement intent in the horizontal plane
  const sy = Math.sin(P.yaw);
  const cy = Math.cos(P.yaw);
  // I.my = forward (+1), I.mx = right (+1)
  let ix = -sy * I.my + cy * I.mx;
  let iz = -cy * I.my - sy * I.mx;
  const il = Math.hypot(ix, iz);
  if (il > 1) {
    ix /= il;
    iz /= il;
  }
  const moving = il > 0.05;

  let sprinting = false;
  if (P.mode === "walk") {
    P.wade = sub > 0.45;
    sprinting = I.sprint && moving && G.stats.stamina > 1 && !P.wade && I.my > 0.3;
    let sp = sprinting ? SPRINT : WALK;
    if (P.wade) sp *= 0.62;
    const tx = ix * sp;
    const tz = iz * sp;
    const acc = P.grounded ? 14 : 3.2;
    P.vx += (tx - P.vx) * Math.min(1, acc * dt);
    P.vz += (tz - P.vz) * Math.min(1, acc * dt);
    P.vy -= GRAV * dt;
    if (I.jumpPressed && P.grounded && G.stats.stamina > 4) {
      P.vy = JUMP_V * (P.wade ? 0.7 : 1);
      P.grounded = false;
      G.stats.stamina -= 4;
      ev.push({ t: "jump" });
    }
  } else {
    P.wade = false;
    const fast = I.sprint && moving && G.stats.stamina > 1;
    sprinting = fast;
    let sp = fast ? SWIM_FAST : SWIM;
    if (G.stats.stamina <= 0.5) sp *= 0.55;
    const headUnder = P.y + EYE < water - 0.05;
    let tx = ix * sp;
    let tz = iz * sp;
    let ty = 0;
    if (headUnder || I.dive) {
      // fully 3D: swim where you look
      const cp = Math.cos(P.pitch);
      const fwd = clamp(I.my, -1, 1);
      tx = (-sy * fwd * cp + cy * I.mx) * sp;
      tz = (-cy * fwd * cp - sy * I.mx) * sp;
      if (Math.abs(fwd) > 0.05) ty = Math.sin(P.pitch) * fwd * sp;
    }
    if (I.jump) ty = Math.max(ty, 2.4);
    if (I.dive) ty = Math.min(ty, -2.2);
    // buoyancy toward the floating height (head just above water)
    const floatY = water - EYE + 0.18;
    if (!I.dive && !(headUnder && ty < -0.2)) {
      const lift = (floatY - P.y) * 2.6;
      ty = I.jump ? Math.max(ty, lift) : headUnder ? Math.max(ty, Math.min(lift, 0.9) + ty * 0.2) : lift;
    }
    if (P.y > floatY + 0.05 && ty > 0) ty = Math.min(ty, (floatY + 0.05 - P.y) * 6);
    const k = Math.min(1, 3.4 * dt);
    P.vx += (tx - P.vx) * k;
    P.vz += (tz - P.vz) * k;
    P.vy += (ty - P.vy) * k;
    if (P.y > water - 0.4) P.vy -= GRAV * 0.4 * dt; // out of the water you fall back in
  }

  // integrate
  const ox = P.x;
  const oz = P.z;
  const oy = P.y;
  P.x += P.vx * dt;
  P.z += P.vz * dt;
  P.y += P.vy * dt;

  const boxes2 = raftBoxes(G, P.x, P.z);
  pushOut(G, P, boxes2, islandObstacles(G, P.x, P.z));

  // vertical: ground + ceiling
  const g2 = groundUnder(G, P.x, P.z, Math.max(oy, P.y) + STEP, boxes2);
  const ceil = ceiling(G, P, boxes2);
  if (P.y + PH > ceil && P.vy > 0) {
    P.y = ceil - PH;
    P.vy = 0;
  }
  const wasGrounded = P.grounded;
  P.grounded = false;
  if (P.y <= g2.h + 0.001 || (P.mode === "walk" && wasGrounded && P.vy <= 0 && P.y - g2.h < 0.38)) {
    if (!wasGrounded && P.vy < -6.5 && P.mode === "walk") {
      P.landImpact = clamp(-P.vy / 14, 0, 1);
      ev.push({ t: "land", s: P.landImpact, kind: g2.kind });
      if (P.vy < -15) G.hurt?.(Math.round((-P.vy - 15) * 4), "fall");
    }
    P.y = g2.h;
    if (P.vy < 0) P.vy = 0;
    P.grounded = P.mode === "walk" || P.y <= g2.h + 0.001;
    if (P.mode === "swim") P.grounded = false;
  }
  if (P.mode === "walk" && P.grounded) P.ground = g2.kind;
  else if (P.mode === "swim") P.ground = null;
  // stay "in the raft frame" while standing on it or jumping over it
  P.onRaftFrame = (P.grounded && g2.kind === "raft") || (P.mode === "walk" && !P.grounded && !!overRaft(G, P.x, P.z, 0.2) && P.y > R.y - 0.3);

  // NaN / void safety
  if (!Number.isFinite(P.x + P.y + P.z)) {
    P.x = ox;
    P.y = oy;
    P.z = oz;
    P.vx = P.vy = P.vz = 0;
  }
  if (P.y < -14) {
    P.y = -14;
    P.vy = Math.max(0, P.vy);
  }

  P.underwater = P.y + 1.0 < water;
  P.headUnder = P.y + EYE < water - 0.02;
  if (wasSwim && P.mode === "walk" && P.ground === "land") ev.push({ t: "wade" });

  // footsteps
  const sp = Math.hypot(P.vx - (P.onRaftFrame ? R.vx : 0), P.vz - (P.onRaftFrame ? R.vz : 0));
  if (P.mode === "walk" && P.grounded && sp > 0.6) {
    P.stepAcc += sp * dt;
    P.bob += sp * dt * 2.1;
    const stride = sprinting ? 0.95 : 0.75;
    if (P.stepAcc > stride) {
      P.stepAcc = 0;
      ev.push({ t: "step", kind: P.wade ? "wade" : g2.kind === "raft" ? "wood" : "sand" });
    }
  } else if (P.mode === "swim" && moving) {
    P.bob += dt * 2.4;
    P.stepAcc += dt;
    if (P.stepAcc > 0.9) {
      P.stepAcc = 0;
      ev.push({ t: "stroke", under: P.headUnder });
    }
  }
  return { sprinting, swimming: P.mode === "swim", moving };
}

export function startClimb(G, P, spot) {
  const R = G.raft;
  P.climb = { t: 0, dur: 0.55, sx: P.x - R.x, sy: P.y - R.y, sz: P.z - R.z, tx: spot.lx, tz: spot.lz };
  P.vx = P.vy = P.vz = 0;
}
