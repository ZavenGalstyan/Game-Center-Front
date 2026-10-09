/**
 * Mario Adventure 3D — third-person orbit camera (pure maths; the renderer
 * copies cam.{x,y,z,tx,ty,tz,fov} onto the THREE camera).
 *
 *   pivot  Mario's shoulders, smoothed: fast horizontally, slower vertically
 *          while airborne so jumps don't bob the view (it catches up when he
 *          lands or falls far)
 *   boom   yaw / pitch from the mouse, length = the player's zoom (wheel /
 *          settings). Ray-cast against solids AND the terrain: the boom
 *          SHORTENS at once when something comes between camera and Mario and
 *          LENGTHENS smoothly once it clears — never snapping through walls.
 *   assist after a while without mouse input, while running, the yaw drifts
 *          gently behind Mario's heading and the pitch eases back to default.
 *
 * Mario is never hidden: the boom never ends inside a solid or under ground.
 */
import { CAM, clamp, damp, wrapAngle } from "./config.js";
import { raycast } from "./collision.js";

const GOAL_DIST = 5.4;

export function createCamera(p, yaw = 0) {
  const cam = {
    yaw,
    pitch: CAM.PITCH_DEFAULT,
    pref: CAM.DIST,
    dist: CAM.DIST,
    px: p.x,
    py: p.y + CAM.PIVOT_H,
    pz: p.z,
    x: 0,
    y: 0,
    z: 0,
    tx: 0,
    ty: 0,
    tz: 0,
    fov: CAM.FOV,
    idle: 0,
    shake: 0,
    mode: "follow", // follow | goal | boss-intro
    orbitT: 0,
  };
  return cam;
}

export function snapCamera(cam, W, yaw) {
  const p = W.player;
  cam.yaw = yaw;
  cam.pitch = CAM.PITCH_DEFAULT;
  cam.px = p.x;
  cam.py = p.y + CAM.PIVOT_H;
  cam.pz = p.z;
  cam.dist = cam.pref;
  cam.idle = 0;
  cam.mode = "follow";
  place(cam, W, 0, true);
}

function terrainHit(T, ox, oy, oz, dx, dy, dz, len) {
  const stepL = 0.45;
  for (let t = stepL; t <= len; t += stepL) {
    const x = ox + dx * t;
    const z = oz + dz * t;
    const h = T.height(x, z);
    if (Number.isFinite(h) && oy + dy * t < h + 0.45) return Math.max(0, t - stepL);
  }
  return len;
}

/**
 * dx, dy: mouse delta (px) since last frame; wheel: zoom delta
 * opts: { sensitivity, invertY, assist }
 */
export function updateCamera(cam, W, dx, dy, wheel, dt, opts) {
  const p = W.player;
  const sens = CAM.SENS * (opts.sensitivity || 1);
  if (dx || dy) {
    cam.yaw -= dx * sens;
    cam.pitch += (opts.invertY ? -dy : dy) * sens;
    cam.pitch = clamp(cam.pitch, CAM.PITCH_MIN, CAM.PITCH_MAX);
    cam.idle = 0;
  } else cam.idle += dt;
  if (wheel) cam.pref = clamp(cam.pref + wheel * 0.006, CAM.DIST_MIN, CAM.DIST_MAX);
  cam.yaw = wrapAngle(cam.yaw);

  if (cam.mode === "goal") {
    // slow orbit round to Mario's face for the victory pose
    cam.orbitT += dt;
    const want = p.yaw + Math.PI;
    cam.yaw = cam.yaw + wrapAngle(want - cam.yaw) * (1 - Math.exp(-1.6 * dt));
    cam.pitch = damp(cam.pitch, 0.12, 2, dt);
    cam.dist = damp(cam.dist, GOAL_DIST, 2, dt);
  } else if (opts.assist !== false && cam.idle > 1.4 && p.grounded && p.speed > 4 && !p.dead) {
    const head = Math.atan2(p.vx, p.vz);
    const d = wrapAngle(head - cam.yaw);
    // only when not running toward the camera (that's a deliberate choice)
    if (Math.abs(d) < 2.0) cam.yaw += d * (1 - Math.exp(-0.7 * dt));
    cam.pitch = damp(cam.pitch, CAM.PITCH_DEFAULT, 0.8, dt);
  }

  // pivot
  const ty = p.y + CAM.PIVOT_H;
  const k = p.dead ? 0 : 1;
  cam.px = damp(cam.px, p.x, 16 * k, dt);
  cam.pz = damp(cam.pz, p.z, 16 * k, dt);
  const air = !p.grounded;
  let vk = air ? 4.2 : 11;
  if (air && p.y < cam.py - CAM.PIVOT_H - 1.2) vk = 10; // falling far: follow
  if (air && p.y > cam.py + 2.8) vk = 8; // sprung high: follow
  if (!p.dead) cam.py = damp(cam.py, ty, vk, dt);
  if (cam.py < p.y + 0.6 && !p.dead) cam.py = p.y + 0.6;

  // fov: a breath wider while sprinting
  const run = clamp((p.speed - 7) / 5, 0, 1);
  cam.fov = damp(cam.fov, CAM.FOV + run * 5, 4, dt);

  if (cam.shake > 0) cam.shake = Math.max(0, cam.shake - dt * 2.2);
  place(cam, W, dt, false);
}

export function addShake(cam, a) {
  cam.shake = Math.min(1, cam.shake + a);
}

function place(cam, W, dt, snap) {
  const pitch = cam.pitch;
  const cp = Math.cos(pitch);
  const fx = Math.sin(cam.yaw) * cp;
  const fy = -Math.sin(pitch);
  const fz = Math.cos(cam.yaw) * cp;
  let want = cam.mode === "goal" ? GOAL_DIST : cam.pref;
  if (pitch < 0) want *= 1 + pitch * 0.6; // looking up: pull in so the ground doesn't eat the boom
  const hs = raycast(W.solids, cam.px, cam.py, cam.pz, -fx, -fy, -fz, want, CAM.PAD);
  const ht = terrainHit(W.terrain, cam.px, cam.py, cam.pz, -fx, -fy, -fz, want);
  const hit = Math.max(CAM.MIN_DIST, Math.min(hs, ht) - 0.1);
  if (cam.mode === "goal") cam.dist = Math.min(cam.dist, hit);
  else if (snap || hit < cam.dist) cam.dist = hit;
  else cam.dist = Math.min(hit, cam.dist + (hit - cam.dist) * (1 - Math.exp(-CAM.RETURN * dt)) + 0.2 * dt);
  let x = cam.px - fx * cam.dist;
  let y = cam.py - fy * cam.dist;
  let z = cam.pz - fz * cam.dist;
  const h = W.terrain.height(x, z);
  if (Number.isFinite(h) && y < h + 0.5) y = h + 0.5;
  if (cam.shake > 0) {
    const t = W.clock * 47;
    const a = cam.shake * cam.shake * 0.35;
    x += Math.sin(t) * a;
    y += Math.sin(t * 1.3 + 1) * a;
  }
  cam.x = x;
  cam.y = y;
  cam.z = z;
  cam.tx = cam.px;
  cam.ty = cam.py + (cam.mode === "goal" ? -0.35 : 0.15);
  cam.tz = cam.pz;
}
