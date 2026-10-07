/**
 * Dungeon Knight — third-person chase camera (pure maths; the renderer copies
 * the result onto the THREE camera).
 *
 *   pivot  = knight + shoulder height, a little to his right (over the
 *            shoulder), smoothed so steps don't bob the view
 *   boom   = yaw / pitch from the mouse (or touch drag); a ray (with a
 *            radius pad) from the pivot back toward the wanted camera spot is
 *            cast against the room's solids. The boom SHORTENS at once when a
 *            wall or pillar comes between camera and knight, and LENGTHENS
 *            smoothly when it clears — never inside stone, never outside the
 *            room, no popping.
 *   shake  = a small damped spring kicked by hits (scaled by the setting;
 *            zero with reduced motion)
 */
import { raycast, pointSolid } from "./collision.js";
import { clamp, damp, wrap } from "./math.js";

export const CAM = {
  PIVOT_H: 1.6,
  SHOULDER: 0.6,
  DIST: { near: 3.6, normal: 4.4, far: 5.4 },
  PITCH_MIN: -0.2,
  PITCH_MAX: 1.05,
  PITCH_DEFAULT: 0.34,
  PAD: 0.28,
  SENS: 0.0024,
  RETURN: 3.2,
  FOV: 58,
};

export function createCamera(yaw = 0) {
  return {
    yaw, pitch: CAM.PITCH_DEFAULT, dist: CAM.DIST.normal, want: CAM.DIST.normal,
    px: 0, py: 0, pz: 0, x: 0, y: 2, z: -4, lx: 0, ly: 1.4, lz: 0,
    shakeX: 0, shakeY: 0, vX: 0, vY: 0, side: CAM.SHOULDER, lastLook: 0, fov: CAM.FOV, bossK: 0,
  };
}

export function shakeScale(settings) {
  if (!settings || settings.reducedMotion) return 0;
  return settings.cameraShake === "off" ? 0 : settings.cameraShake === "low" ? 0.45 : 1;
}

/** A hit / impact: kick the spring (direction in camera-space x/y). */
export function kick(cam, amount, settings, dx = 0, dy = -1) {
  const s = shakeScale(settings);
  if (s <= 0) return;
  cam.vX += dx * amount * s;
  cam.vY += dy * amount * s;
}

/** Snap behind the knight (room entry / restart): no swoop through walls. */
export function snapCamera(cam, W, yaw, settings) {
  const p = W.player;
  cam.yaw = yaw;
  cam.pitch = CAM.PITCH_DEFAULT;
  cam.px = p.x;
  cam.py = CAM.PIVOT_H;
  cam.pz = p.z;
  cam.shakeX = cam.shakeY = cam.vX = cam.vY = 0;
  cam.want = CAM.DIST[settings.cameraDistance] || CAM.DIST.normal;
  cam.dist = cam.want;
  place(cam, W, 0, true);
}

/**
 * dx, dy = look delta in pixels; opts = { sensitivity, invertY, touch, boss, settings }
 */
export function updateCamera(cam, W, dx, dy, dt, opts) {
  const p = W.player;
  const sens = CAM.SENS * (opts.sensitivity || 1);
  if (dx || dy) {
    cam.yaw = wrap(cam.yaw - dx * sens);
    cam.pitch = clamp(cam.pitch + (opts.invertY ? -dy : dy) * sens, CAM.PITCH_MIN, CAM.PITCH_MAX);
    cam.lastLook = 0;
  } else cam.lastLook += dt;
  // touch players get a gentle drift behind the knight while they run
  const sp = Math.hypot(p.vx, p.vz);
  if (opts.touch && cam.lastLook > 1.0 && sp > 2.5 && !p.blocking) {
    const want = Math.atan2(p.vx, p.vz);
    const d = wrap(want - cam.yaw);
    if (Math.abs(d) < 2.4) cam.yaw = wrap(cam.yaw + d * (1 - Math.exp(-0.8 * dt)));
  }
  cam.px = damp(cam.px, p.x, 16, dt);
  cam.pz = damp(cam.pz, p.z, 16, dt);
  const ty = CAM.PIVOT_H - (p.act && p.act.type === "dodge" ? 0.25 : 0);
  cam.py = damp(cam.py, ty, 8, dt);
  cam.bossK = damp(cam.bossK, opts.boss ? 1 : 0, 2, dt);
  const base = CAM.DIST[opts.settings.cameraDistance] || CAM.DIST.normal;
  cam.want = base + cam.bossK * 1.1;
  // shake spring
  cam.vX += (-cam.shakeX * 180 - cam.vX * 18) * dt;
  cam.vY += (-cam.shakeY * 180 - cam.vY * 18) * dt;
  cam.shakeX += cam.vX * dt;
  cam.shakeY += cam.vY * dt;
  if (shakeScale(opts.settings) <= 0) cam.shakeX = cam.shakeY = cam.vX = cam.vY = 0;
  cam.fov = damp(cam.fov, CAM.FOV + (p.sprinting && !opts.settings.reducedMotion ? 3 : 0), 4, dt);
  place(cam, W, dt, false);
}

function place(cam, W, dt, snap) {
  const p = W.player;
  const C = W.C;
  const cp = Math.cos(cam.pitch);
  // forward (where the camera looks), right (screen right)
  const fx = Math.sin(cam.yaw) * cp;
  const fy = -Math.sin(cam.pitch);
  const fz = Math.cos(cam.yaw) * cp;
  const rx = -Math.cos(cam.yaw);
  const rz = Math.sin(cam.yaw);
  // over-the-shoulder offset, pulled in if a wall is right beside the knight
  const sideHit = raycast(C, cam.px, cam.py, cam.pz, rx, 0, rz, CAM.SHOULDER + CAM.PAD, 0.05, true);
  const side = Math.max(0, Math.min(CAM.SHOULDER, sideHit - CAM.PAD));
  cam.side = snap ? side : side < cam.side ? side : damp(cam.side, side, 4, dt);
  const ox = cam.px + rx * cam.side;
  const oz = cam.pz + rz * cam.side;
  const oy = cam.py;
  // the boom: shorten instantly, lengthen smoothly
  const hit = raycast(C, ox, oy, oz, -fx, -fy, -fz, cam.want + CAM.PAD, CAM.PAD * 0.6, true);
  const d = clamp(hit - CAM.PAD * 0.4, 0.2, cam.want);
  if (snap || d < cam.dist) cam.dist = d;
  else cam.dist = Math.min(d, cam.dist + (d - cam.dist) * (1 - Math.exp(-CAM.RETURN * dt)) + 0.2 * dt);
  let x;
  let y;
  let z;
  // hard limits: above the floor, under the ceiling, never inside a solid —
  // if the spot is still in stone (tight alcove corners), pull in further
  for (let tries = 0; tries < 8; tries++) {
    x = ox - fx * cam.dist + rx * cam.shakeX;
    y = clamp(oy - fy * cam.dist + cam.shakeY, 0.45, 4.9);
    z = oz - fz * cam.dist + rz * cam.shakeX;
    const s = pointSolid(C, x, y, z, 0.06);
    if (!s || s.cam === false) break;
    cam.dist *= 0.6;
    if (cam.dist < 0.12) {
      // last resort: sit just above the shoulder point (or the head, if even that is in stone)
      const free = !pointSolid(C, ox, oy, oz, 0.06);
      x = free ? ox : cam.px;
      y = Math.min(4.9, cam.py + 0.5);
      z = free ? oz : cam.pz;
      if (!free) cam.side = 0;
      break;
    }
  }
  cam.x = x;
  cam.y = y;
  cam.z = z;
  // look target: ahead of the pivot along the view
  cam.lx = ox + fx * 2;
  cam.ly = oy + fy * 2 + 0.05;
  cam.lz = oz + fz * 2;
  void p;
}
