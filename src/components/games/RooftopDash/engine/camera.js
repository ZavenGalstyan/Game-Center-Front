/**
 * Rooftop Dash — third-person chase camera (pure maths; the renderer copies
 * the result onto the THREE camera).
 *
 *   pivot   = runner + shoulder height, smoothed (vertical slower while
 *             airborne so jumps don't bob the whole view)
 *   boom    = yaw/pitch from the mouse; ray-cast from the pivot against the
 *             collision boxes (inflated by the camera radius). The boom
 *             SHORTENS instantly when something comes between camera and
 *             runner and LENGTHENS smoothly when the obstruction clears.
 *   effects = sprint FOV widening, dash punch, hard-landing dip, wall-run
 *             roll — all scaled by the Camera Shake / Motion settings.
 *
 * The camera never sits inside a box, below the street, or closer than the
 * near-clip distance to the runner's head.
 */
import { raycast, pointInside } from "./collision.js";
import { STATES as S } from "./config.js";

export const CAM = {
  DIST: 4.7,
  MIN_DIST: 0.9,
  PIVOT_H: 1.5,
  PIVOT_H_LOW: 0.95,
  PITCH_MIN: -0.55, // looking up
  PITCH_MAX: 1.05, // looking down
  PITCH_DEFAULT: 0.2,
  PAD: 0.22,
  SENS: 0.0024, // rad per pixel at sensitivity 1
  RETURN: 3.2, // boom lengthening rate (1/s)
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
    fov: 72,
    roll: 0,
    shakeY: 0,
    shakeV: 0,
    punch: 0,
    lastLook: 0,
    idle: 0,
  };
}

/** snap behind the runner (spawn / respawn / restart) — no swoop through walls */
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
  cam.punch = 0;
  placeBoom(cam, W, 0, true);
}

export function addImpulse(cam, kind, amount, settings) {
  const scale = shakeScale(settings);
  if (scale <= 0) return;
  if (kind === "land") cam.shakeV -= amount * scale;
  else if (kind === "dash") cam.punch = Math.max(cam.punch, amount * scale);
}

function shakeScale(s) {
  if (!s) return 0.5;
  if (s.reducedMotion) return 0;
  return s.cameraShake === "off" ? 0 : s.cameraShake === "normal" ? 1 : 0.5;
}

/**
 * dx, dy: mouse / touch look delta in pixels since last frame.
 * opts: { sensitivity, invertY, fov, motion, touch }
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
  if (opts.touch && cam.lastLook > 0.9 && sp > 3 && P.state !== S.WALLRUN) {
    const want = Math.atan2(P.vx, P.vz);
    let d = want - cam.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    if (Math.abs(d) < 2.4) cam.yaw += d * (1 - Math.exp(-1.1 * dt));
  }

  // pivot
  const low = P.height < 1.2;
  const ph = low ? CAM.PIVOT_H_LOW : CAM.PIVOT_H;
  const ty = P.y + ph;
  // on a wall run the pivot slides away from the wall so the boom isn't jammed against it
  const wx = P.state === S.WALLRUN && P.wall ? P.wall.nx * 0.95 : 0;
  const wz = P.state === S.WALLRUN && P.wall ? P.wall.nz * 0.95 : 0;
  cam.wox = damp(cam.wox || 0, wx, 5, dt);
  cam.woz = damp(cam.woz || 0, wz, 5, dt);
  cam.px = damp(cam.px, P.x + cam.wox, 22, dt);
  cam.pz = damp(cam.pz, P.z + cam.woz, 22, dt);
  const air = !P.grounded && P.state !== S.WALLRUN;
  cam.py = damp(cam.py, ty, air ? (P.vy < -9 ? 12 : 6) : 16, dt);
  // never let the vertical lag hide the runner
  if (cam.py < P.y + 0.4) cam.py = P.y + 0.4;
  if (cam.py > P.y + 2.4) cam.py = P.y + 2.4;

  // effects
  const scale = shakeScale(opts);
  const motion = opts.motion !== false && !opts.reducedMotion;
  const sprintK = clamp((sp - 7.4) / 2.6, 0, 1);
  const fovTarget = (opts.fov || 72) + (motion ? sprintK * 6 + cam.punch * 5 : 0);
  cam.fov = damp(cam.fov, fovTarget, 6, dt);
  cam.punch = damp(cam.punch, 0, 7, dt);
  let rollTarget = 0;
  if (motion && P.state === S.WALLRUN && P.wall) rollTarget = (P.wall.side === "left" ? -1 : 1) * 0.055;
  cam.roll = damp(cam.roll, rollTarget, 6, dt);
  // spring for landing dip
  cam.shakeV += (-cam.shakeY * 140 - cam.shakeV * 16) * dt;
  cam.shakeY += cam.shakeV * dt;
  if (scale <= 0) cam.shakeY = cam.shakeV = 0;

  placeBoom(cam, W, dt, false);
}

function placeBoom(cam, W, dt, snap) {
  const cp = Math.cos(cam.pitch);
  const fx = Math.sin(cam.yaw) * cp;
  const fy = -Math.sin(cam.pitch);
  const fz = Math.cos(cam.yaw) * cp;
  // look-down pulls the boom in a little so the runner stays readable
  const want = CAM.DIST * (cam.pitch > 0.6 ? 1 - (cam.pitch - 0.6) * 0.35 : 1);
  const hit = raycast(W.C, cam.px, cam.py, cam.pz, -fx, -fy, -fz, want, CAM.PAD);
  let d = Math.max(CAM.MIN_DIST * 0.5, hit - 0.05);
  if (snap || d < cam.dist) cam.dist = d;
  else cam.dist = Math.min(d, cam.dist + (d - cam.dist) * (1 - Math.exp(-CAM.RETURN * dt)) + 0.2 * dt);
  let x = cam.px - fx * cam.dist;
  let y = cam.py - fy * cam.dist + cam.shakeY;
  let z = cam.pz - fz * cam.dist;
  // street floor + last-resort inside test
  const floor = (W.level.streetY ?? -60) + 0.6;
  if (y < floor) y = floor;
  if (pointInside(W.C, x, y, z, 0.05)) {
    cam.dist = CAM.MIN_DIST * 0.5;
    x = cam.px - fx * cam.dist;
    y = cam.py - fy * cam.dist;
    z = cam.pz - fz * cam.dist;
  }
  cam.x = x;
  cam.y = y;
  cam.z = z;
  W.camYaw = cam.yaw;
}
