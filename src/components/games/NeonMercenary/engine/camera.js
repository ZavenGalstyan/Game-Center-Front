/**
 * Third-person shoulder camera rig (pure math, shared by sim aiming and the
 * renderer so the crosshair ray and the picture always agree).
 *
 * yaw 0 looks toward +Z; pitch > 0 looks up. The camera sits behind the
 * player's right shoulder and is pulled in when a wall is in the way.
 */
import { raycast } from "./map.js";
import { clamp } from "./math.js";

export const CAM = {
  dist: 3.6,
  aimDist: 1.75,
  shoulder: 0.62,
  aimShoulder: 0.55,
  height: 1.62,
  crouchHeight: 1.12,
  fov: 62,
  aimFov: 44,
  minPitch: -0.95,
  maxPitch: 0.8,
};

/**
 * Compute camera position + forward for a player state.
 *   aimT 0..1 blends hip → aim framing; zoom extra dolly (cinematic).
 * Returns { px,py,pz (pivot), x,y,z (camera), fx,fy,fz (forward), rx,rz (right), fov }.
 */
export function cameraRig(M, p, yaw, pitch, aimT = 0, out = {}) {
  pitch = clamp(pitch, CAM.minPitch, CAM.maxPitch);
  const h = p.crouchT != null ? CAM.height + (CAM.crouchHeight - CAM.height) * p.crouchT : CAM.height;
  const px = p.x;
  const py = p.y + h;
  const pz = p.z;
  const cp = Math.cos(pitch);
  const fx = Math.sin(yaw) * cp;
  const fy = Math.sin(pitch);
  const fz = Math.cos(yaw) * cp;
  const rx = -Math.cos(yaw);
  const rz = Math.sin(yaw);
  const dist = CAM.dist + (CAM.aimDist - CAM.dist) * aimT;
  const sh = CAM.shoulder + (CAM.aimShoulder - CAM.shoulder) * aimT;
  // shoulder point (offset right), then back along the view direction
  let sx = px + rx * sh;
  let sz = pz + rz * sh;
  let sy = py;
  if (M) {
    // keep the shoulder offset from clipping into an adjacent wall
    const hs = raycast(M, px, py, pz, rx, 0, rz, sh + 0.25);
    if (hs) {
      const k = Math.max(0, hs.t - 0.25);
      sx = px + rx * k;
      sz = pz + rz * k;
    }
  }
  let d = dist;
  if (M) {
    const hit = raycast(M, sx, sy, sz, -fx, -fy, -fz, dist + 0.3);
    if (hit) d = Math.max(0.35, hit.t - 0.3);
  }
  out.px = px;
  out.py = py;
  out.pz = pz;
  out.x = sx - fx * d;
  out.y = sy - fy * d;
  out.z = sz - fz * d;
  // never below the floor
  if (out.y < 0.25) out.y = 0.25;
  out.fx = fx;
  out.fy = fy;
  out.fz = fz;
  out.rx = rx;
  out.rz = rz;
  out.d = d;
  out.fov = CAM.fov + (CAM.aimFov - CAM.fov) * aimT;
  return out;
}
