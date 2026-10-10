/**
 * Web Hero — third-person camera (pure math; three/ copies the result).
 *
 *  - orbit behind the hero (mouse yaw / pitch), slightly elevated
 *  - smoothed follow, speed-based distance + FOV
 *  - swinging: pulls back, looks along the travel direction (auto-yaw)
 *  - climbing: pulls back from the wall so the climb stays readable
 *  - combat: biases the focus toward nearby engaged enemies and widens
 *  - collision: raycast from the focus to the camera, pulled in before walls
 *  - recovery: after aerial movement it eases back to the default pitch
 */
import { raycast, floorAt } from "./collide.js";

export function createCamera() {
  return { yaw: 0, pitch: 0.28, dist: 6, fov: 62, px: 0, py: 5, pz: -8, tx: 0, ty: 0, tz: 0, fx: 0, fy: 0, fz: 0, idleT: 0, snap: true, shake: 0, distNow: 6, label: "THIRD_PERSON", combatK: 0 };
}

export function addShake(cam, k) {
  cam.shake = Math.min(1, cam.shake + k);
}

const ang = (a) => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};
const damp = (c, w, r, dt) => c + (w - c) * (1 - Math.exp(-r * dt));
const rc = {};
const fl = {};

export function updateCamera(W, dt, look, settings = {}) {
  const cam = W.cam;
  const h = W.hero;
  dt = Math.min(dt, 0.05);
  const sens = 0.0025 * (settings.sensitivity ?? 1);
  if (look && (look.dx || look.dy)) {
    cam.yaw = ang(cam.yaw - look.dx * sens);
    cam.pitch = Math.max(-0.35, Math.min(1.2, cam.pitch + look.dy * sens * (settings.invertY ? -1 : 1)));
    cam.idleT = 0;
  } else cam.idleT += dt;

  const sp = Math.hypot(h.vx, h.vy, h.vz);
  const swinging = h.mode === "swing" || (h.mode === "air" && sp > 16);
  const climbing = h.mode === "climb";

  // ---- combat framing: engaged enemies near the hero
  let ex = 0;
  let ez = 0;
  let en = 0;
  for (const e of W.enemies) {
    if (e.dead || e.state === "defeated" || e.state === "idle" || e.state === "patrol") continue;
    const d = Math.hypot(e.x - h.x, e.z - h.z);
    if (d < 14) {
      ex += e.x;
      ez += e.z;
      en++;
    }
  }
  if (W.boss && !W.boss.defeated) {
    ex += W.boss.e.x * 2;
    ez += W.boss.e.z * 2;
    en += 2;
  }
  cam.combatK = damp(cam.combatK, en ? 1 : 0, 3, dt);

  // ---- auto-yaw: follow travel while swinging / running, unless the mouse moved recently
  const auto = settings.camAssist !== false;
  if (auto && cam.idleT > 0.8) {
    let want = null;
    let rate = 0;
    if (swinging && Math.hypot(h.vx, h.vz) > 4) {
      want = Math.atan2(h.vx, h.vz);
      rate = 2.4;
    } else if (h.grounded && h.speed > 9 && !en) {
      want = Math.atan2(h.vx, h.vz);
      rate = 0.9;
    }
    if (want !== null) cam.yaw += ang(want - cam.yaw) * (1 - Math.exp(-rate * dt));
    if (cam.idleT > 1.5) cam.pitch = damp(cam.pitch, swinging ? 0.18 : 0.28, 1.2, dt);
  }

  // ---- focus
  let fx = h.x;
  let fy = h.y + 1.55;
  let fz = h.z;
  if (en) {
    const k = 0.32 * cam.combatK;
    fx += (ex / en - h.x) * k;
    fz += (ez / en - h.z) * k;
  }
  if (cam.snap) {
    cam.fx = fx;
    cam.fy = fy;
    cam.fz = fz;
  }
  cam.fx = damp(cam.fx, fx, swinging ? 10 : 14, dt);
  cam.fy = damp(cam.fy, fy, h.grounded || climbing ? 9 : 5, dt);
  cam.fz = damp(cam.fz, fz, swinging ? 10 : 14, dt);

  // ---- distance + fov
  const pref = settings.camDistance ?? 6;
  let want = pref + Math.min(4, sp * 0.1);
  if (swinging) want += 2.2;
  if (climbing) want += 1.5;
  if (en) want += 1.5 * cam.combatK + (W.boss ? 3 : 0);
  cam.dist = damp(cam.dist, want, 3, dt);
  const fov = Math.min(84, 60 + Math.max(0, sp - 8) * 0.75);
  cam.fov = cam.snap ? fov : damp(cam.fov, fov, 3, dt);

  // ---- orbit + collision
  const pitch = cam.pitch + (climbing ? 0.12 : 0);
  const cp = Math.cos(pitch);
  const dx = -Math.sin(cam.yaw) * cp;
  const dy = Math.sin(pitch);
  const dz = -Math.cos(cam.yaw) * cp;
  let dist = cam.dist;
  if (raycast(W.geo, cam.fx, cam.fy, cam.fz, dx, dy, dz, dist + 0.4, rc)) dist = Math.max(1.2, rc.t - 0.45);
  cam.distNow = cam.snap ? dist : dist < cam.distNow ? dist : damp(cam.distNow, dist, 5, dt);
  let px = cam.fx + dx * cam.distNow;
  let py = cam.fy + dy * cam.distNow;
  let pz = cam.fz + dz * cam.distNow;
  if (floorAt(W.geo, px, pz, py + 1, py - 0.5, fl)) py = Math.max(py, fl.y + 0.5);
  if (cam.shake > 0) {
    const k = cam.shake * (settings.reducedMotion ? 0.2 : 1) * 0.3;
    px += (Math.random() - 0.5) * k;
    py += (Math.random() - 0.5) * k;
    pz += (Math.random() - 0.5) * k;
    cam.shake = Math.max(0, cam.shake - dt * 2.5);
  }
  cam.px = px;
  cam.py = py;
  cam.pz = pz;
  cam.tx = cam.fx;
  cam.ty = cam.fy;
  cam.tz = cam.fz;
  cam.viewYaw = cam.yaw;
  cam.label = swinging ? "SWING" : climbing ? "CLIMB" : en ? "COMBAT" : "THIRD_PERSON";
  cam.snap = false;
  return cam;
}
