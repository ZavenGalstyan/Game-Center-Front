/**
 * Third-person follow camera with occlusion: the pivot sits over the hero's
 * right shoulder; a ray from the pivot back toward the camera is cast
 * against walls so the view is never blocked (trees are ignored — they are
 * thin, and hiding behind them would be worse than a leaf in the lens).
 * Aiming (RMB) pulls in and narrows the view.
 *
 * Pure maths so the simulation can derive the exact aim ray the renderer shows.
 */
import { clamp } from "./math.js";

export function cameraRig(G, out = {}) {
  const p = G.player;
  const aim = p.aiming ? 1 : 0;
  G.aimT = (G.aimT || 0) + (aim - (G.aimT || 0)) * 0.22;
  const k = G.aimT;
  const combat = G.inCombat() ? 1 : 0;
  G.combatCam = (G.combatCam || 0) + (combat - (G.combatCam || 0)) * 0.02;
  const boss = G.bossActive ? 1 : 0;
  G.bossCam = (G.bossCam || 0) + (boss - (G.bossCam || 0)) * 0.02;
  const yaw = G.camYaw;
  const pitch = G.camPitch;
  let dist = (4.3 + G.combatCam * 0.5 + G.bossCam * 1.6 - k * 2.1) * (G.zoom || 1);
  if (G.indoorTight) dist = Math.min(dist, 3.6);
  const side = 0.58 - k * 0.04;
  const fx = Math.sin(yaw) * Math.cos(pitch);
  const fy = Math.sin(pitch);
  const fz = Math.cos(yaw) * Math.cos(pitch);
  const rx = -Math.cos(yaw);
  const rz = Math.sin(yaw);
  const px = p.x + rx * side;
  const py = p.y + (p.dead ? 0.8 : 1.6) - k * 0.04;
  const pz = p.z + rz * side;
  const col = G.col;
  // pull the camera in front of whatever blocks the view
  let d = dist;
  const hit = col.raycast(px, py, pz, -fx, -fy, -fz, dist + 0.35, { noTrees: true, noLow: true, noGround: true });
  if (hit < dist + 0.35) d = Math.max(0.5, hit - 0.35);
  let cx = px - fx * d;
  let cy = py - fy * d;
  let cz = pz - fz * d;
  const g = col.ground(cx, cz, cy + 0.2) + 0.3;
  if (cy < g && g > -5) cy = g;
  if (G.ceiling && cy > G.ceiling - 0.4) cy = G.ceiling - 0.4;
  out.x = cx;
  out.y = cy;
  out.z = cz;
  out.fx = fx;
  out.fy = fy;
  out.fz = fz;
  out.fov = 62 - k * 16 + (p.sprinting ? 5 : 0) + G.bossCam * 6;
  out.pivot = { x: px, y: py, z: pz };
  out.dist = d;
  return out;
}
export const clampPitch = (v) => clamp(v, -1.05, 0.75);
