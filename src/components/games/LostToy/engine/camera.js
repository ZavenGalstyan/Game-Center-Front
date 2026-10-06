/**
 * Lost Toy — third-person follow camera (pure maths; the renderer copies the
 * result onto the THREE camera).
 *
 *   pivot   = toy + shoulder height, smoothed (vertical slower while airborne
 *             so jumps don't bob the whole view)
 *   boom    = yaw/pitch from the mouse; ray-cast from the pivot against the
 *             collision boxes AND the camera-only boxes (chair backs, lamp
 *             shades …), inflated by the camera radius. The boom SHORTENS
 *             immediately when something comes between camera and toy and
 *             LENGTHENS smoothly when it clears — no snapping through walls.
 *   scale   = the boom sits low and close so the furniture towers overhead;
 *             looking up (negative pitch) pulls in further and lifts the aim
 *             so the giant room fills the frame without losing the toy.
 *
 * Hard guarantees: never inside a box, never below the floor, never above
 * the ceiling, never closer than the near-clip distance to the toy's head.
 */
import { raycast, pointInside } from "./collision.js";
import { STATES as S } from "./config.js";

export const CAM = {
  DIST: 3.1,
  MIN_DIST: 0.45,
  PIVOT_H: 0.78,
  PITCH_MIN: -0.62, // looking up at the furniture
  PITCH_MAX: 1.1, // looking down
  PITCH_DEFAULT: 0.24,
  PAD: 0.13,
  SENS: 0.0024, // rad per pixel at sensitivity 1
  RETURN: 2.6, // boom lengthening rate (1/s)
  FOV: 62,
};

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));

export function createCamera(player, yaw = 0) {
  return {
    yaw,
    pitch: CAM.PITCH_DEFAULT,
    dist: CAM.DIST,
    px: player.x,
    py: player.y + CAM.PIVOT_H,
    pz: player.z,
    x: 0,
    y: 0,
    z: 0,
    fov: CAM.FOV,
    roll: 0,
    shakeY: 0,
    shakeV: 0,
    lastLook: 0,
    aimY: 0,
  };
}

/** snap behind the toy (spawn / respawn / restart) — no swoop through walls */
export function snapCamera(cam, W, yaw) {
  const P = W.player;
  cam.yaw = yaw;
  cam.pitch = CAM.PITCH_DEFAULT;
  cam.px = P.x;
  cam.py = P.y + CAM.PIVOT_H;
  cam.pz = P.z;
  cam.dist = CAM.DIST;
  cam.roll = 0;
  cam.shakeY = 0;
  cam.shakeV = 0;
  cam.aimY = 0;
  placeBoom(cam, W, 0, true);
}

export function shakeScale(s) {
  if (!s) return 0.5;
  if (s.reducedMotion) return 0;
  return s.cameraShake === "off" ? 0 : s.cameraShake === "normal" ? 1 : 0.5;
}

export function addImpulse(cam, amount, settings) {
  const scale = shakeScale(settings);
  if (scale <= 0) return;
  cam.shakeV -= amount * scale;
}

/**
 * dx, dy: mouse / touch look delta in pixels since last frame.
 * opts: { sensitivity, invertY, reducedMotion, cameraShake, touch }
 */
export function updateCamera(cam, W, dx, dy, dt, opts) {
  const P = W.player;
  const sens = CAM.SENS * (opts.sensitivity || 1);
  if (dx || dy) {
    cam.yaw -= dx * sens;
    cam.pitch += (opts.invertY ? -dy : dy) * sens;
    cam.pitch = clamp(cam.pitch, CAM.PITCH_MIN, CAM.PITCH_MAX);
    cam.lastLook = 0;
  } else {
    cam.lastLook += dt;
  }
  if (cam.yaw > Math.PI) cam.yaw -= Math.PI * 2;
  if (cam.yaw < -Math.PI) cam.yaw += Math.PI * 2;

  // gentle auto-follow for touch players who aren't steering the camera
  const sp = Math.hypot(P.vx, P.vz);
  if (opts.touch && cam.lastLook > 1.1 && sp > 1.6 && P.state !== S.CLIMB && P.state !== S.LEDGE) {
    const want = Math.atan2(P.vx, P.vz);
    let d = want - cam.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    if (Math.abs(d) < 2.3) cam.yaw += d * (1 - Math.exp(-0.9 * dt));
  }

  // pivot: follows the toy; a little lower while climbing/hanging so the wall reads
  const low = P.state === S.LEDGE || P.state === S.CLIMB;
  const ty = P.y + (low ? CAM.PIVOT_H * 0.85 : CAM.PIVOT_H);
  cam.px = damp(cam.px, P.x, 20, dt);
  cam.pz = damp(cam.pz, P.z, 20, dt);
  const air = !P.grounded && P.state !== S.CLIMB && P.state !== S.LEDGE;
  cam.py = damp(cam.py, ty, air ? (P.vy < -6 ? 11 : 5.5) : 14, dt);
  if (cam.py < P.y + 0.3) cam.py = P.y + 0.3;
  if (cam.py > P.y + 1.6) cam.py = P.y + 1.6;

  // looking up at the giant room: aim point rises a little (scale-aware)
  const upK = clamp(-cam.pitch / 0.6, 0, 1);
  cam.aimY = damp(cam.aimY, upK * 0.55, 6, dt);

  const scale = shakeScale(opts);
  const motion = !opts.reducedMotion;
  const sprintK = clamp((sp - 3.6) / 1.2, 0, 1);
  cam.fov = damp(cam.fov, CAM.FOV + (motion ? sprintK * 4 : 0), 5, dt);
  // balancing on a pencil: a whisper of roll that follows the wobble
  let rollTarget = 0;
  if (motion && P.balance && P.grounded) rollTarget = Math.sin(W.clock * 2.3) * 0.012;
  cam.roll = damp(cam.roll, rollTarget, 4, dt);
  // spring for the landing dip
  cam.shakeV += (-cam.shakeY * 160 - cam.shakeV * 17) * dt;
  cam.shakeY += cam.shakeV * dt;
  if (scale <= 0) cam.shakeY = cam.shakeV = 0;

  placeBoom(cam, W, dt, false);
}

function boomLen(cam, W, pitch) {
  let want = CAM.DIST;
  if (pitch > 0.6) want *= 1 - (pitch - 0.6) * 0.3;
  if (pitch < 0) want *= 1 + pitch * 0.55;
  const cp = Math.cos(pitch);
  const hit = raycast(W.C, cam.px, cam.py, cam.pz, -Math.sin(cam.yaw) * cp, Math.sin(pitch), -Math.cos(cam.yaw) * cp, want, CAM.PAD, true);
  return { want, hit };
}

function placeBoom(cam, W, dt, snap) {
  // low ceilings (under a bed, inside a cubby): if the boom is cut short, try a
  // flatter angle that clears whatever is overhead, and ease into it
  let duck = 0;
  const base = boomLen(cam, W, cam.pitch);
  if (base.hit < base.want * 0.62 && cam.pitch > -0.2) {
    let best = base.hit;
    for (let k = 1; k <= 4; k++) {
      const p = cam.pitch - k * 0.14;
      if (p < -0.25) break;
      const r = boomLen(cam, W, p);
      if (r.hit > best + 0.25) {
        best = r.hit;
        duck = cam.pitch - p;
      }
    }
  }
  cam.duck = snap ? duck : (cam.duck || 0) + (duck - (cam.duck || 0)) * (1 - Math.exp(-5 * dt));
  const pitch = cam.pitch - cam.duck;
  const cp = Math.cos(pitch);
  const fx = Math.sin(cam.yaw) * cp;
  const fy = -Math.sin(pitch);
  const fz = Math.cos(cam.yaw) * cp;
  const { want, hit } = boomLen(cam, W, pitch);
  const d = Math.max(CAM.MIN_DIST * 0.5, hit - 0.04);
  if (snap || d < cam.dist) cam.dist = d;
  else cam.dist = Math.min(d, cam.dist + (d - cam.dist) * (1 - Math.exp(-CAM.RETURN * dt)) + 0.15 * dt);
  let x = cam.px - fx * cam.dist;
  let y = cam.py - fy * cam.dist + cam.shakeY;
  let z = cam.pz - fz * cam.dist;
  // squeezed right behind the toy: slide over its right shoulder (and up when
  // there's headroom) so the way ahead stays visible — clearance-checked
  const sq = Math.max(0, Math.min(1, 1 - (cam.dist - 0.45) / 1.1));
  cam.sq = snap ? sq : (cam.sq || 0) + (sq - (cam.sq || 0)) * (1 - Math.exp(-6 * dt));
  if (cam.sq > 0.01) {
    const rx = -Math.cos(cam.yaw);
    const rz = Math.sin(cam.yaw);
    const side = Math.min(0.62 * cam.sq, raycast(W.C, x, y, z, rx, 0, rz, 0.62 * cam.sq + CAM.PAD, CAM.PAD, true) - 0.05);
    if (side > 0) {
      x += rx * side;
      z += rz * side;
    }
    const up = Math.min(0.5 * cam.sq, raycast(W.C, x, y, z, 0, 1, 0, 0.5 * cam.sq + CAM.PAD, CAM.PAD, true) - 0.05);
    if (up > 0) y += up;
  }
  const floor = (W.level.floorY ?? 0) + 0.12;
  const ceil = W.level.ceilingY != null ? W.level.ceilingY - 0.3 : Infinity;
  if (y < floor) y = floor;
  if (y > ceil) y = ceil;
  if (pointInside(W.C, x, y, z, 0.04, true)) {
    cam.dist = CAM.MIN_DIST * 0.5;
    x = cam.px - fx * cam.dist;
    y = Math.max(floor, cam.py - fy * cam.dist);
    z = cam.pz - fz * cam.dist;
  }
  cam.x = x;
  cam.y = y;
  cam.z = z;
  W.camYaw = cam.yaw;
}
