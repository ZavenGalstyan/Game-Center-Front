/**
 * Mountain Journey — the explorer's movement controller (one fixed step).
 *
 *   ground   smooth accel / decel toward the camera-relative input; ice cuts
 *            traction, water slows wading; slopes steeper than maxSlope are
 *            walls going up and slides when stood on
 *   air      reduced control, gravity, jump with coyote time + jump buffer
 *   world    analytic terrain (walls = rises taller than a step or too steep),
 *            solid props pushed out of, walkable tops, ceilings, moving
 *            platforms carry whoever stands on them, wind drifts, a crate on
 *            a rail is pushed from behind
 *
 * Pure function of (game, input, dt) — no rendering, no timers.
 */
import { PHYS } from "./constants.js";
import { clamp, wrapAngle } from "./rng.js";
import { surfaceAt, caveRoofAt } from "./terrain.js";

export function createPlayer(spawn) {
  return {
    x: spawn.x,
    y: spawn.y,
    z: spawn.z,
    vx: 0,
    vy: 0,
    vz: 0,
    facing: spawn.h,
    grounded: true,
    groundSolid: null,
    coyote: 0,
    jumpBuf: 0,
    sliding: false,
    lastSafeY: spawn.y,
    surf: "dirt",
    wade: 0,
    speed: 0,
    phase: 0, // walk cycle (radians; a footstep every π)
    landT: 9,
    landHard: 0,
    airT: 0,
    run: false,
    pushing: false,
    inCave: 0,
    windX: 0,
    windZ: 0,
  };
}

/**
 * Is moving to (x, z) blocked by the terrain? Rises taller than a step are
 * walls; so is ground at foot level that is too steep both here and a little
 * further on (a real slope face — a ledge's top edge is steep only right at
 * the lip, so stepping onto it stays possible).
 */
function terrainBlocks(T, x, z, feet, curGround, dx = 0, dz = 0) {
  const hn = T.height(x, z);
  if (hn > feet + PHYS.stepUp) return true;
  if (hn > feet - 0.04 && hn > curGround + 0.015) {
    if (T.slope(x, z, hn).g > PHYS.maxSlope) {
      // only a true lip (level ground just beyond) may be stepped onto
      if (!dx && !dz) return true;
      const beyond = T.height(x + dx * 0.35, z + dz * 0.35);
      if (Math.abs(beyond - hn) > 0.12) return true;
    }
  }
  return false;
}

/** Ground height under (x, z) for feet at `feet` (terrain or a walkable solid). */
const RING = [
  [0.26, 0],
  [-0.26, 0],
  [0, 0.26],
  [0, -0.26],
  [0.18, 0.18],
  [-0.18, 0.18],
  [0.18, -0.18],
  [-0.18, -0.18],
];
function supportAt(G, x, z, feet) {
  const h = G.L.terrain.height(x, z);
  const s = G.L.solids.groundAt(x, z, feet, PHYS.stepUp);
  if (s && s.top >= h - 0.02) return { h: s.top, solid: s.solid };
  return { h, solid: null };
}
export function groundUnder(G, x, z, feet) {
  const c = supportAt(G, x, z, feet);
  if (c.h >= feet - 0.22) return c;
  // the centre is over a gap: the footprint's rim can still hold the explorer
  // at an edge (forgiving ledges, stepping stones, platform hand-offs)
  let best = null;
  for (const [ox, oz] of RING) {
    const r = supportAt(G, x + ox, z + oz, feet);
    if (r.h > feet + PHYS.stepUp || r.h < feet - 0.22) continue;
    // terrain rim support only from level ground (a real lip) — a rising
    // slope under the rim must never hold the explorer up
    if (!r.solid && Math.abs(G.L.terrain.height(x + ox * 1.8, z + oz * 1.8) - r.h) > 0.1) continue;
    if (!best || r.h > best.h) best = r;
  }
  return best || c;
}

export function stepPlayer(G, inp, dt) {
  const P = G.player;
  const T = G.L.terrain;
  const S = G.L.solids;
  const locked = G.lockMove > 0;

  // --- input → desired horizontal velocity (camera-relative) --------------
  const yaw = G.cam.yaw;
  const fx = Math.sin(yaw);
  const fz = Math.cos(yaw);
  const rx = -Math.cos(yaw);
  const rz = Math.sin(yaw);
  let mx = locked ? 0 : inp.mx;
  let mz = locked ? 0 : inp.mz;
  let dx = fx * mz + rx * mx;
  let dz = fz * mz + rz * mx;
  let mag = Math.hypot(dx, dz);
  if (mag > 1) {
    dx /= mag;
    dz /= mag;
    mag = 1;
  }
  P.run = !!inp.run && mag > 0.2;
  const ice = P.surf === "ice" && P.grounded;
  const maxV = (P.run ? PHYS.run : PHYS.walk) * (P.wade > PHYS.wadeDepth ? PHYS.wadeMul : 1);
  const tvx = dx * maxV;
  const tvz = dz * maxV;
  let acc;
  if (!P.grounded) acc = PHYS.airAccel;
  else if (ice) acc = mag > 0.05 ? PHYS.iceAccel : PHYS.iceDecel;
  else acc = mag > 0.05 ? PHYS.accel : PHYS.decel;
  // in the air, let go of the stick → keep momentum (forgiving jumps)
  if (!P.grounded && mag < 0.05) acc = 1.5;
  const ex = tvx - P.vx;
  const ez = tvz - P.vz;
  const el = Math.hypot(ex, ez);
  const maxDv = acc * dt;
  if (el <= maxDv) {
    P.vx = tvx;
    P.vz = tvz;
  } else {
    P.vx += (ex / el) * maxDv;
    P.vz += (ez / el) * maxDv;
  }

  // --- facing ---------------------------------------------------------------
  if (mag > 0.1 && !P.pushing) {
    const want = Math.atan2(dx, dz);
    const d = wrapAngle(want - P.facing);
    const k = Math.min(1, PHYS.turnRate * dt);
    P.facing = wrapAngle(P.facing + d * k);
  }

  // --- jump: coyote time + buffer -------------------------------------------
  if (!locked && inp.jumpPressed) P.jumpBuf = PHYS.jumpBuffer;
  P.jumpBuf = Math.max(0, P.jumpBuf - dt);
  P.coyote = P.grounded && !P.sliding ? PHYS.coyote : Math.max(0, P.coyote - dt);
  let jumped = false;
  if (P.jumpBuf > 0 && P.coyote > 0) {
    P.vy = PHYS.jumpV;
    P.grounded = false;
    P.coyote = 0;
    P.jumpBuf = 0;
    P.groundSolid = null;
    jumped = true;
    G.emit({ type: "jump", surf: P.surf });
    G.run.jumps++;
  }

  // --- external motion: moving platforms, wind ------------------------------
  if (P.grounded && P.groundSolid && P.groundSolid.platform) {
    const pl = P.groundSolid.platform;
    P.x += pl.dx;
    P.z += pl.dz;
    P.y += pl.dy;
  }
  P.windX = 0;
  P.windZ = 0;
  const wv = G.windAt(P.x, P.z);
  if (wv) {
    P.windX = wv.x;
    P.windZ = wv.z;
  }

  // --- gravity --------------------------------------------------------------
  if (!P.grounded) P.vy = Math.max(-PHYS.maxFall, P.vy - PHYS.gravity * dt);

  // --- horizontal move against the terrain ----------------------------------
  const feet = P.y;
  const cur = groundUnder(G, P.x, P.z, feet + 0.05).h;
  const ox = P.x;
  const oz = P.z;
  const mvx = (P.vx + P.windX) * dt;
  const mvz = (P.vz + P.windZ) * dt;
  // the crate: pushed along its rail when walked into from behind
  P.pushing = false;
  for (const cr of G.crates) pushCrate(G, cr, mvx, mvz, dt);
  let nx = P.x + mvx;
  let nz = P.z;
  if (mvx !== 0 && terrainBlocks(T, nx, nz, feet, cur, Math.sign(mvx), 0)) {
    nx = P.x;
    P.vx *= 0.2;
  }
  nz = P.z + mvz;
  if (mvz !== 0 && terrainBlocks(T, nx, nz, feet, cur, 0, Math.sign(mvz))) {
    nz = P.z;
    P.vz *= 0.2;
  }
  // solids
  const push = S.pushOut(nx, nz, PHYS.radius, feet, feet + PHYS.height, PHYS.stepUp);
  if (push.hit && terrainBlocks(T, push.x, push.z, feet, cur)) {
    // pushed into a terrain wall: stay put this step
    P.x = ox;
    P.z = oz;
  } else {
    P.x = push.x;
    P.z = push.z;
  }
  // the corridor boundary: nothing legitimate lies more than 5.8 m beyond a
  // trail's edge (meadow shoulders end at 5.5), so moving further out is
  // refused — no climbing out over odd terrain, ever
  const eNew = T.query(P.x, P.z).e;
  if (eNew > 5.8) {
    const eOld = T.query(ox, oz).e;
    if (eNew > eOld) {
      P.x = ox;
      P.z = oz;
      P.vx *= 0.3;
      P.vz *= 0.3;
    }
  }
  // level bounds
  const B = G.L.bounds;
  P.x = clamp(P.x, B.minX, B.maxX);
  P.z = clamp(P.z, B.minZ, B.maxZ);

  // --- vertical move ----------------------------------------------------------
  const prevFeet = P.y;
  P.y += P.vy * dt;
  const gnd = groundUnder(G, P.x, P.z, Math.max(prevFeet, P.y) + 0.02);
  const wasGrounded = P.grounded && !jumped;
  if (P.y <= gnd.h) {
    if (!wasGrounded) {
      const impact = -P.vy;
      if (impact > 3) {
        P.landT = 0;
        P.landHard = clamp((impact - 3) / 12, 0, 1);
        G.emit({ type: "land", surf: gnd.solid ? gnd.solid.surf : P.surf, hard: P.landHard });
      }
    }
    P.y = gnd.h;
    P.vy = 0;
    P.grounded = true;
    P.groundSolid = gnd.solid;
  } else if (wasGrounded && P.vy <= 0 && P.y - gnd.h < 0.16) {
    P.y = gnd.h; // glue to the ground walking downhill
    P.vy = 0;
    P.grounded = true;
    P.groundSolid = gnd.solid;
  } else {
    P.grounded = false;
    P.groundSolid = null;
  }
  // ceilings (solids, cave roofs)
  if (P.vy > 0) {
    let ceil = S.ceiling(P.x, P.z, P.y, P.y + PHYS.height);
    const q = T.query(P.x, P.z);
    const roof = caveRoofAt(q);
    if (roof != null) ceil = Math.min(ceil, roof - 0.15);
    if (P.y + PHYS.height > ceil) {
      P.y = ceil - PHYS.height;
      P.vy = 0;
    }
  }

  // --- surface, water, slopes -------------------------------------------------
  const q = T.query(P.x, P.z);
  P.inCave = caveRoofAt(q) != null ? 1 : 0;
  if (P.groundSolid) P.surf = P.groundSolid.surf || "wood";
  else P.surf = surfaceAt(q, G.region);
  const w = q.water;
  P.wade = w ? Math.max(0, w.level - P.y) : 0;
  if (P.wade > PHYS.wadeDepth && P.grounded) P.surf = "water";
  P.sliding = false;
  // standing on the steep terrain itself (not an edge held by the footprint)
  if (P.grounded && !P.groundSolid && Math.abs(q.h - P.y) < 0.04) {
    const sl = T.slope(P.x, P.z, q.h);
    const ug = Math.max(1e-6, sl.g);
    // a real slope face keeps rising just uphill (a lip is level beyond)
    if (sl.g > PHYS.maxSlope + 0.05 && Math.abs(T.height(P.x + (sl.gx / ug) * 0.35, P.z + (sl.gz / ug) * 0.35) - q.h) > 0.12) {
      // too steep to stand: slide downhill (and no jumping off it); gravity
      // takes it from there — never a teleport
      P.sliding = true;
      const gl = Math.max(1e-6, sl.g);
      const sx = (-sl.gx / gl) * PHYS.slide * dt;
      const sz = (-sl.gz / gl) * PHYS.slide * dt;
      if (!terrainBlocks(T, P.x + sx, P.z + sz, P.y, P.y + 1)) {
        P.x += sx;
        P.z += sz;
        const g2 = groundUnder(G, P.x, P.z, P.y + 0.02);
        if (g2.h < P.y - 0.16) P.grounded = false;
        else P.y = g2.h;
      }
    }
  }
  if (P.grounded && !P.sliding && P.wade < 0.3) P.lastSafeY = P.y;

  // --- animation bookkeeping --------------------------------------------------
  const hs = Math.hypot(P.x - ox, P.z - oz) / dt;
  P.speed = P.grounded ? hs : P.speed;
  P.landT += dt;
  P.airT = P.grounded ? 0 : P.airT + dt;
  if (P.grounded && hs > 0.3) {
    const stepLen = hs > 5.5 ? 1.38 : 0.98;
    const before = Math.floor(P.phase / Math.PI);
    P.phase += (hs * dt * Math.PI) / stepLen;
    if (Math.floor(P.phase / Math.PI) !== before) G.emit({ type: "step", surf: P.surf, run: hs > 5.5 });
    G.run.distance += hs * dt;
  } else if (P.grounded) {
    // settle the stride toward a standing pose
    const r = P.phase % Math.PI;
    if (r > 0.02) P.phase += Math.min(Math.PI - r, dt * 4);
  }
}

function pushCrate(G, cr, mvx, mvz, dt) {
  const P = G.player;
  if (cr.pos >= cr.len - 1e-3) return;
  const relx = P.x - cr.x;
  const relz = P.z - cr.z;
  const along = relx * cr.dx + relz * cr.dz;
  const lat = relx * cr.dz - relz * cr.dx;
  const reachBack = cr.size + 0.34;
  if (along > -reachBack + 0.12 || along < -reachBack - 0.3) return;
  if (Math.abs(lat) > cr.size + 0.05) return;
  if (Math.abs(P.y - cr.y) > 0.5) return;
  const v = (mvx * cr.dx + mvz * cr.dz) / dt;
  if (v < 0.4) return;
  const adv = Math.min(1.8, v) * dt;
  cr.pos = Math.min(cr.len, cr.pos + adv);
  cr.x = cr.x0 + cr.dx * cr.pos;
  cr.z = cr.z0 + cr.dz * cr.pos;
  cr.solid.x = cr.x;
  cr.solid.z = cr.z;
  P.pushing = true;
  G.player.facing = Math.atan2(cr.dx, cr.dz);
  if (cr.pos >= cr.len - 1e-3) G.onCrateHome(cr);
}
