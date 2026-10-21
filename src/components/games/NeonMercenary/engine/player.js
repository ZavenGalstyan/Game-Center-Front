/**
 * Third-person character controller (pure sim): acceleration, sprint stamina,
 * jumping, crouch, dodge roll with i-frames, step-up onto low boxes,
 * collision against the district boxes, safe-position recovery.
 */
import { collideCircle, groundHeight, ceilingHeight, STEP_H } from "./map.js";
import { approach, approachAngle, clamp, yawOf } from "./math.js";

export const PLAYER_R = 0.36;
export const PLAYER_H = 1.8;
export const CROUCH_H = 1.15;
const GRAV = 18;
const JUMP_V = 6.3;

export function createPlayer(x, z, yaw, D) {
  return {
    x, y: 0, z, vx: 0, vy: 0, vz: 0,
    yaw, // body facing
    onGround: true,
    crouch: false,
    crouchT: 0,
    sprinting: false,
    speed: 0,
    moveX: 0, // movement relative to body (for strafe animation)
    moveZ: 0,
    hp: D.maxHp,
    armor: D.armorCap,
    stamina: D.maxStamina,
    energy: D.maxEnergy,
    staDelay: 0,
    dodgeT: 0,
    dodgeCd: 0,
    dodgeX: 0,
    dodgeZ: 0,
    iframes: 0,
    airT: 0,
    landT: 0,
    jumpT: 0,
    safe: { x, z, y: 0 },
    safeT: 0,
    faceT: 0, // >0 → body faces the camera (aiming / firing)
    dead: false,
  };
}

/** Advance the controller. inp: {mx, mz, yaw, sprint, jump, ctrl, crouchKey}. */
export function stepPlayer(G, p, inp, dt) {
  const M = G.map;
  const D = G.D;
  const B = G.buffs;
  if (p.dead) {
    p.vx = p.vz = 0;
    return;
  }
  // ------------------------------------------------------------ intent
  const fx = Math.sin(inp.yaw);
  const fz = Math.cos(inp.yaw);
  const rx = -Math.cos(inp.yaw);
  const rz = Math.sin(inp.yaw);
  let wx = fx * inp.mz + rx * inp.mx;
  let wz = fz * inp.mz + rz * inp.mx;
  const wl = Math.hypot(wx, wz);
  if (wl > 1) {
    wx /= wl;
    wz /= wl;
  }
  const moving = wl > 0.15;
  const locked = G.lockMove > 0; // interacting / using items / cinematic
  // ------------------------------------------------------------ crouch / dodge (Ctrl is contextual)
  p.dodgeCd = Math.max(0, p.dodgeCd - dt);
  if (inp.ctrl && !locked) {
    const dodgeCost = 22 * Math.max(0.4, 1 - (D.dash - 1) * 1.25) * (B.reflex > 0 ? 0 : 1);
    if (moving && p.onGround && p.dodgeT <= 0 && p.dodgeCd <= 0 && p.stamina >= dodgeCost * 0.5) {
      p.dodgeT = 0.55;
      p.iframes = 0.38 + (D.dash - 1) * 0.25;
      const l = Math.hypot(wx, wz) || 1;
      p.dodgeX = wx / l;
      p.dodgeZ = wz / l;
      p.yaw = yawOf(p.dodgeX, p.dodgeZ);
      p.stamina = Math.max(0, p.stamina - dodgeCost);
      p.staDelay = 0.9;
      p.crouch = false;
      G.emit({ type: "dodge" });
    } else if (!moving) {
      p.crouch = !p.crouch;
      G.emit({ type: "crouch", on: p.crouch });
    }
  }
  if (inp.crouchKey && !locked) {
    p.crouch = !p.crouch;
    G.emit({ type: "crouch", on: p.crouch });
  }
  // can't stand up under a low ceiling
  if (!p.crouch && p.crouchT > 0.5 && ceilingHeight(M, p.x, p.z, PLAYER_R, p.y + 0.2) < p.y + PLAYER_H) p.crouch = true;
  p.crouchT = approach(p.crouchT, p.crouch ? 1 : 0, dt * 6);
  p.iframes = Math.max(0, p.iframes - dt);

  // ------------------------------------------------------------ speeds / stamina
  let target = 4.6;
  const aiming = G.aiming;
  const wantSprint = inp.sprint && moving && !aiming && !p.crouch && inp.mz > -0.3;
  const stimOn = B.stim > 0;
  p.sprinting = wantSprint && (p.stamina > 1 || stimOn) && p.dodgeT <= 0;
  if (p.sprinting) target = 7.2;
  if (aiming) target = 2.9;
  if (p.crouch) target = 2.2;
  if (B.reflex > 0) target *= 1.4;
  if (stimOn) target *= 1.25;
  if (G.slowT > 0) target *= 0.55; // hazards
  if (p.sprinting && !stimOn) {
    p.stamina = Math.max(0, p.stamina - 21 * dt);
    p.staDelay = 0.8;
  } else if (p.staDelay > 0) p.staDelay -= dt;
  else p.stamina = Math.min(D.maxStamina, p.stamina + D.staRegen * dt);

  // ------------------------------------------------------------ velocity
  if (p.dodgeT > 0) {
    p.dodgeT -= dt;
    const sp = 8.6 * D.dash * (p.dodgeT > 0.15 ? 1 : 0.4);
    p.vx = p.dodgeX * sp;
    p.vz = p.dodgeZ * sp;
    if (p.dodgeT <= 0) p.dodgeCd = 0.2;
  } else {
    const tx = locked ? 0 : wx * target;
    const tz = locked ? 0 : wz * target;
    const acc = p.onGround ? (moving ? 30 : 26) : 7;
    const dvx = tx - p.vx;
    const dvz = tz - p.vz;
    const dl = Math.hypot(dvx, dvz);
    const step = acc * dt;
    if (dl <= step) {
      p.vx = tx;
      p.vz = tz;
    } else {
      p.vx += (dvx / dl) * step;
      p.vz += (dvz / dl) * step;
    }
  }
  // jump
  p.jumpT = Math.max(0, p.jumpT - dt);
  if (inp.jump && p.onGround && !locked && p.dodgeT <= 0) {
    p.vy = JUMP_V;
    p.onGround = false;
    p.jumpT = 0.25;
    p.crouch = false;
    if (!stimOn) p.stamina = Math.max(0, p.stamina - 6);
    G.emit({ type: "jump" });
  }
  p.vy -= GRAV * dt;

  // ------------------------------------------------------------ integrate + collide
  const prevY = p.y;
  p.x += p.vx * dt;
  p.z += p.vz * dt;
  p.y += p.vy * dt;
  const h = PLAYER_H + (CROUCH_H - PLAYER_H) * p.crouchT;
  collideCircle(M, p, PLAYER_R, h);
  const g = groundHeight(M, p.x, p.z, PLAYER_R, Math.max(prevY, p.y) + STEP_H);
  if (p.y <= g + 0.02 && p.vy <= 0.01) {
    if (!p.onGround && p.airT > 0.35) {
      p.landT = 0.3;
      G.emit({ type: "land", hard: p.airT > 0.7 });
    }
    // step-up smoothing: rise at most 6 m/s
    p.y = g > p.y ? Math.min(g, p.y + 7 * dt + 0.08) : g;
    p.vy = 0;
    p.onGround = true;
    p.airT = 0;
  } else {
    if (p.onGround && g < p.y - 0.06 && p.vy <= 0 && p.y - g < STEP_H && p.jumpT <= 0) {
      // walking down a step: stay glued
      p.y = g;
      p.vy = 0;
    } else {
      p.onGround = false;
      p.airT += dt;
    }
  }
  // ceilings
  const ceil = ceilingHeight(M, p.x, p.z, PLAYER_R * 0.8, p.y + 0.5);
  if (p.y + h > ceil) {
    p.y = Math.max(g, ceil - h);
    if (p.vy > 0) p.vy = 0;
  }
  p.landT = Math.max(0, p.landT - dt);

  // ------------------------------------------------------------ facing
  p.faceT = Math.max(0, p.faceT - dt);
  const hs = Math.hypot(p.vx, p.vz);
  p.speed = hs;
  if (p.dodgeT > 0) {
    // keep roll direction
  } else if (aiming || p.faceT > 0) p.yaw = approachAngle(p.yaw, inp.yaw, dt * 16);
  else if (hs > 0.4) p.yaw = approachAngle(p.yaw, yawOf(p.vx, p.vz), dt * 11);
  // movement relative to the body (strafe / backpedal blend)
  const by = p.yaw;
  p.moveZ = (p.vx * Math.sin(by) + p.vz * Math.cos(by)) / Math.max(1, target);
  p.moveX = (p.vx * -Math.cos(by) + p.vz * Math.sin(by)) / Math.max(1, target);

  // ------------------------------------------------------------ safety net
  const bnd = M.bounds;
  if (p.y < -6 || p.x < bnd.x0 || p.x > bnd.x1 || p.z < bnd.z0 || p.z > bnd.z1 || !Number.isFinite(p.x + p.z + p.y)) {
    p.x = p.safe.x;
    p.z = p.safe.z;
    p.y = p.safe.y;
    p.vx = p.vy = p.vz = 0;
  }
  p.safeT += dt;
  if (p.onGround && p.safeT > 0.5) {
    p.safeT = 0;
    p.safe = { x: p.x, z: p.z, y: p.y };
  }
  p.x = clamp(p.x, bnd.x0, bnd.x1);
  p.z = clamp(p.z, bnd.z0, bnd.z1);
}
