/**
 * Mario Adventure 3D — the player controller (pure maths, fixed step).
 *
 * Mario is a vertical cylinder (feet at y). Each step:
 *   1. ride: if standing on a moving / rotating solid, move with it
 *   2. steer: camera-relative input → horizontal velocity (ground / ice / air
 *      acceleration curves), facing turns smoothly toward motion
 *   3. jump: buffered presses (BUFFER) + coyote time (COYOTE), variable height
 *      (release early → GRAVITY_CUT), one air jump (double jump / flip)
 *   4. horizontal move: terrain cliffs + too-steep slopes block, solids push
 *      out (slide along walls)
 *   5. vertical move: land on the highest terrain / solid top in range,
 *      snap down slopes and small steps, bonk ceilings (?-blocks report it)
 *
 * The world (world.js) owns hearts / power-ups / events; this file only moves
 * Mario and reports what happened through W.emit().
 */
import { P, STEP, clamp, dampAngle, SPEED_MUL, JUMP_MUL } from "./config.js";
import { groundAt, pushOut, ceilingAt } from "./collision.js";

export function createPlayer(x, y, z, yaw = 0) {
  return {
    x,
    y,
    z,
    vx: 0,
    vy: 0,
    vz: 0,
    yaw,
    grounded: true,
    ground: null, // solid we stand on (null = terrain)
    surf: "grass",
    coyote: 0,
    buffer: 0,
    jumps: 0,
    jumpHeld: false,
    anim: "idle",
    animT: 0,
    landT: 0,
    stompT: 0,
    hurtT: 0,
    invuln: 0,
    lockT: 0,
    dead: false,
    deadT: 0,
    victory: false,
    pipe: null,
    speed: 0,
    airT: 0,
    peakY: y,
    slide: false,
    lastSafe: [x, y, z],
    safeT: 0,
    moveK: 0,
  };
}

export function resetPlayer(p, x, y, z, yaw) {
  Object.assign(p, createPlayer(x, y, z, yaw));
}

const pres = { x: 0, z: 0, hit: null, nx: 0, nz: 0 };
const gout = { y: 0, solid: null };

/** horizontal terrain test: does moving to (nx,nz) climb something too steep? */
function terrainBlocks(T, p, nx, nz) {
  const h = T.height(nx, nz);
  if (!Number.isFinite(h)) return false;
  const rise = h - p.y;
  if (rise <= 0.02) return false;
  if (rise > P.STEP_UP) return true;
  // crossing onto another island is a step (a low ledge), not a slope
  if (T.islandAt(p.x, p.z) !== T.islandAt(nx, nz)) return false;
  return T.slope(nx, nz).s > P.MAX_SLOPE;
}

/**
 * One fixed step. inp = { ax, ay, sprint, jumpHeld, jump (edge), camYaw }.
 * Returns nothing; reports through W.emit(type, data).
 */
export function stepPlayer(W, inp, dt = STEP) {
  const p = W.player;
  const T = W.terrain;
  const C = W.solids;
  const pw = W.power;

  p.animT += dt;
  if (p.invuln > 0) p.invuln -= dt;
  if (p.landT > 0) p.landT -= dt;
  if (p.stompT > 0) p.stompT -= dt;
  if (p.hurtT > 0) p.hurtT -= dt;
  if (p.lockT > 0) p.lockT -= dt;

  if (p.dead) {
    p.deadT += dt;
    // a small hop then fall through the floor (classic), no collision
    p.vy -= P.GRAVITY_DOWN * 0.55 * dt;
    if (p.deadT > 0.55) p.y += p.vy * dt;
    return;
  }
  if (p.pipe) return; // world animates the warp
  if (p.victory) {
    p.vx = p.vz = 0;
  }

  /* 1. ride whatever we stand on */
  const g = p.ground;
  if (p.grounded && g && (g.dx || g.dy || g.dz || g.dyaw)) {
    p.x += g.dx;
    p.y += g.dy;
    p.z += g.dz;
    if (g.dyaw) {
      const rx = p.x - g.x;
      const rz = p.z - g.z;
      const c = Math.cos(g.dyaw);
      const s = Math.sin(g.dyaw);
      p.x = g.x + rx * c - rz * s;
      p.z = g.z + rx * s + rz * c;
      p.yaw -= g.dyaw;
    }
  }

  /* 2. steer */
  const locked = p.lockT > 0 || p.victory || p.hurtT > P.HURT_TIME - 0.25;
  let ax = locked ? 0 : inp.ax || 0;
  let ay = locked ? 0 : inp.ay || 0;
  const m = Math.min(1, Math.hypot(ax, ay));
  const cy = inp.camYaw || 0;
  const fx = Math.sin(cy);
  const fz = Math.cos(cy);
  // right = (-fz, fx)
  let wx = -fz * ax + fx * ay;
  let wz = fx * ax + fz * ay;
  const wl = Math.hypot(wx, wz);
  if (wl > 1e-6) {
    wx /= wl;
    wz /= wl;
  }
  const spdMul = pw.speed > 0 ? SPEED_MUL : 1;
  const top = (inp.sprint ? P.RUN : P.WALK) * spdMul * m;
  const tvx = wx * top;
  const tvz = wz * top;
  const ice = p.grounded && p.surf === "ice";
  let acc;
  if (p.grounded) {
    const along = p.vx * wx + p.vz * wz;
    if (m < 0.05) acc = ice ? P.ICE_DECEL : P.DECEL;
    else if (along < -0.5) acc = ice ? P.ICE_ACCEL : P.TURN_DECEL;
    else acc = ice ? P.ICE_ACCEL : P.ACCEL;
  } else {
    acc = m < 0.05 ? P.AIR_DRAG : P.AIR_ACCEL;
  }
  const dvx = tvx - p.vx;
  const dvz = tvz - p.vz;
  const dl = Math.hypot(dvx, dvz);
  const maxDv = acc * dt;
  if (dl <= maxDv) {
    p.vx = tvx;
    p.vz = tvz;
  } else {
    p.vx += (dvx / dl) * maxDv;
    p.vz += (dvz / dl) * maxDv;
  }
  p.moveK = m;

  // steep terrain: slide downhill
  p.slide = false;
  if (p.grounded && !p.ground) {
    const sl = T.slope(p.x, p.z);
    if (sl.s > P.SLIDE_SLOPE) {
      const k = 1 / sl.s;
      p.vx -= sl.gx * k * 22 * dt;
      p.vz -= sl.gz * k * 22 * dt;
      p.slide = true;
    }
  }

  const sp = Math.hypot(p.vx, p.vz);
  p.speed = sp;
  if (!p.victory && (sp > 0.35 || m > 0.2)) {
    const want = sp > 0.35 ? Math.atan2(p.vx, p.vz) : Math.atan2(wx, wz);
    p.yaw = dampAngle(p.yaw, want, p.grounded ? P.TURN_RATE : P.TURN_RATE * 0.6, dt);
  }

  /* 3. jump */
  if (inp.jump) p.buffer = P.BUFFER;
  else if (p.buffer > 0) p.buffer -= dt;
  if (p.grounded) {
    p.coyote = P.COYOTE;
    p.jumps = 0;
  } else if (p.coyote > 0) p.coyote -= dt;
  const jumpMul = pw.jump > 0 ? JUMP_MUL : 1;
  if (p.buffer > 0 && !locked) {
    if (p.grounded || p.coyote > 0) {
      p.vy = P.JUMP_V * jumpMul + Math.min(1.2, sp * 0.06);
      p.grounded = false;
      p.ground = null;
      p.coyote = 0;
      p.buffer = 0;
      p.jumps = 1;
      p.jumpHeld = true;
      p.anim = "jump";
      p.animT = 0;
      p.peakY = p.y;
      W.emit("jump", { double: false });
    } else if (p.jumps < 2) {
      p.vy = P.DOUBLE_V * jumpMul;
      p.buffer = 0;
      p.jumps = 2;
      p.jumpHeld = true;
      p.anim = "double";
      p.animT = 0;
      W.emit("jump", { double: true });
    }
  }
  if (!inp.jumpHeld) p.jumpHeld = false;

  /* gravity */
  if (!p.grounded) {
    let gr = p.vy > 0 ? P.GRAVITY_UP : P.GRAVITY_DOWN;
    if (p.vy > 0 && !p.jumpHeld && p.anim !== "spring") gr = P.GRAVITY_CUT;
    p.vy -= gr * dt;
    if (p.vy < -P.MAX_FALL) p.vy = -P.MAX_FALL;
    p.airT += dt;
  } else {
    p.vy = 0;
    p.airT = 0;
  }

  /* 4. horizontal move */
  let nx = p.x + p.vx * dt;
  let nz = p.z + p.vz * dt;
  if (terrainBlocks(T, p, nx, nz)) {
    if (!terrainBlocks(T, p, nx, p.z)) {
      nz = p.z;
      p.vz = 0;
    } else if (!terrainBlocks(T, p, p.x, nz)) {
      nx = p.x;
      p.vx = 0;
    } else {
      nx = p.x;
      nz = p.z;
      p.vx = p.vz = 0;
    }
  }
  pushOut(C, nx, nz, p.y, P.RADIUS, P.HEIGHT, p.grounded ? P.STEP_UP : 0.12, pres);
  if (pres.hit) {
    const vn = p.vx * pres.nx + p.vz * pres.nz;
    if (vn < 0) {
      p.vx -= pres.nx * vn;
      p.vz -= pres.nz * vn;
    }
    if (pres.hit.hurt) W.hurt(pres.hit.x, pres.hit.z, "spikes");
    // pushed back into a cliff by a moving wall: stay where we were
    if (terrainBlocks(T, p, pres.x, pres.z)) {
      pres.x = p.x;
      pres.z = p.z;
    }
  }
  p.x = pres.x;
  p.z = pres.z;

  /* 5. vertical move */
  const prevY = p.y;
  const wasGrounded = p.grounded;
  const impact = -p.vy;
  p.y += p.vy * dt;
  let landY = -Infinity;
  let landSolid = null;
  if (p.vy <= 0) {
    const yLo = p.y - (wasGrounded ? P.SNAP_DOWN : 0) - 1e-4;
    const yHi = prevY + (wasGrounded ? P.STEP_UP : 0.06);
    groundAt(C, p.x, p.z, P.RADIUS * 0.78, yLo, yHi, prevY, gout);
    if (gout.solid) {
      landY = gout.y;
      landSolid = gout.solid;
    }
    const th = T.height(p.x, p.z);
    if (Number.isFinite(th) && th >= yLo && th <= yHi + 0.6 && th > landY) {
      landY = th;
      landSolid = null;
    }
  } else {
    const th = T.height(p.x, p.z);
    if (Number.isFinite(th) && p.y < th) p.y = th; // never inside the hill
    const c = ceilingAt(C, p.x, p.z, P.RADIUS * 0.7, prevY + P.HEIGHT, p.y + P.HEIGHT);
    if (c) {
      p.y = c.y - c.hy - P.HEIGHT - 0.001;
      p.vy = Math.min(0, -1);
      W.emit("bonk", { solid: c });
    }
  }

  // land — or, if we were walking, snap down onto a slope / small step below
  const snap = wasGrounded && p.vy <= 0 && p.y - landY <= P.SNAP_DOWN;
  if (landY > -Infinity && (p.y <= landY + 1e-4 || snap)) {
    p.y = landY;
    p.grounded = true;
    p.ground = landSolid;
    if (landSolid) p.surf = landSolid.surf;
    else {
      const isl = T.islandAt(p.x, p.z);
      p.surf = (isl && isl.surf) || W.groundSurf;
    }
    p.vy = 0;
    if (landSolid && landSolid.bounce > 0) {
      // springs launch on any contact (walking onto one too)
      p.vy = landSolid.bounce * (W.power.jump > 0 ? 1.12 : 1);
      p.grounded = false;
      p.ground = null;
      p.jumps = 1;
      p.jumpHeld = true;
      p.anim = "spring";
      p.animT = 0;
      W.emit("spring", { solid: landSolid });
    } else if (!wasGrounded) {
      p.jumps = 0;
      p.airT = 0;
      if (landSolid && landSolid.hurt) {
        W.hurt(p.x - p.vx, p.z - p.vz, "spikes");
      } else {
        if (impact > 7) {
          p.landT = P.LAND_TIME * clamp(impact / 18, 0.6, 1.4);
          p.anim = "land";
          p.animT = 0;
        }
        W.emit("land", { impact, solid: landSolid, surf: p.surf });
      }
    }
    if (p.grounded && landSolid) W.standOn(landSolid);
  } else {
    p.grounded = false;
    p.ground = null;
    if (p.y > p.peakY) p.peakY = p.y;
  }

  // remember the last safe ground spot (for pit respawn without checkpoint)
  if (p.grounded && !p.slide && (!p.ground || !p.ground.owner || p.ground.owner.kind === "static")) {
    p.safeT += dt;
    if (p.safeT > 0.25) {
      p.lastSafe[0] = p.x;
      p.lastSafe[1] = p.y;
      p.lastSafe[2] = p.z;
      p.safeT = 0;
    }
  }

  /* animation state */
  if (p.victory) p.anim = "victory";
  else if (p.hurtT > 0) p.anim = "hurt";
  else if (p.grounded) {
    if (p.landT > 0 && p.anim === "land") {
      /* keep */
    } else if (sp > P.WALK * 1.08) p.anim = "run";
    else if (sp > 0.4) p.anim = "walk";
    else p.anim = "idle";
  } else if (p.stompT > 0) p.anim = "stomp";
  else if (p.anim === "double" && p.animT < 0.55) {
    /* flip continues */
  } else if (p.anim === "spring" && p.vy > 0) {
    /* spring pose */
  } else if (p.anim === "jump" && p.vy > -2) {
    /* rising */
  } else p.anim = p.vy > 0 ? "jump" : "fall";
}

/** bounce off an enemy head */
export function stompBounce(p, held) {
  p.vy = held ? P.STOMP_V_HELD : P.STOMP_V;
  p.grounded = false;
  p.ground = null;
  p.jumps = 1;
  p.jumpHeld = held;
  p.stompT = 0.32;
  p.anim = "stomp";
  p.animT = 0;
}
