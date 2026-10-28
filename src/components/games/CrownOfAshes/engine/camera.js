/**
 * Over-the-shoulder camera rig with collision.
 *
 * The pivot sits above the player's shoulder (offset to the right); the
 * camera sits `dist` behind it along the view direction. A ray from the
 * pivot to the camera is cast against the collision world and terrain so
 * walls and hills never come between you and your hero. Aiming (bow,
 * spells with RMB) pulls the camera in and narrows the field of view.
 */
import { clamp } from "./math.js";
import { INTERIOR_X } from "../data/worldmap.js";

export function cameraRig(G, out = {}) {
  const p = G.player;
  const yaw = G.camYaw;
  const pitch = G.camPitch;
  const aim = (p.aiming || p.draw > 0.12 || (p.action && p.action.type === "charge" && G.P.hero === "mage")) ? 1 : 0;
  G.aimT = (G.aimT || 0) + (aim - (G.aimT || 0)) * 0.2;
  const k = G.aimT;
  const combat = G.inCombat() ? 1 : 0;
  G.combatCam = (G.combatCam || 0) + (combat - (G.combatCam || 0)) * 0.02;
  const bigBoss = G.dragon && G.dragon.state !== "dormant" && !G.dragon.down && !p.interior && Math.hypot(G.dragon.x - p.x, G.dragon.z - p.z) < 60 ? 1 : 0;
  G.bossCam = (G.bossCam || 0) + (bigBoss - (G.bossCam || 0)) * 0.02;
  let dist = 3.9 + G.combatCam * 0.6 + G.bossCam * 2.6 - k * 1.9;
  if (p.interior) dist = Math.min(dist, 3.4);
  dist *= G.zoom || 1;
  const side = 0.62 - k * 0.05;
  const fx = Math.sin(yaw) * Math.cos(pitch);
  const fy = Math.sin(pitch);
  const fz = Math.cos(yaw) * Math.cos(pitch);
  const rx = -Math.cos(yaw);
  const rz = Math.sin(yaw);
  const px = p.x + rx * side;
  const py = p.y + (p.dead ? 0.8 : 1.62) - k * 0.05;
  const pz = p.z + rz * side;
  // collision: pull the camera in front of whatever blocks the view
  const col = G.W.col;
  const bx = -fx;
  const by = -fy;
  const bz = -fz;
  let d = dist;
  const hit = col.raycast(px, py, pz, bx, by, bz, dist + 0.3, { noTrees: true, skipLow: true });
  if (hit < dist + 0.3) d = Math.max(0.6, hit - 0.35);
  let cx = px + bx * d;
  let cy = py + by * d;
  let cz = pz + bz * d;
  if (cx < INTERIOR_X) {
    const g = col.ground(cx, cz, cy + 2) + 0.35;
    if (cy < g) cy = g;
  } else cy = clamp(cy, 0.4, 6.0);
  out.x = cx;
  out.y = cy;
  out.z = cz;
  out.fx = fx;
  out.fy = fy;
  out.fz = fz;
  out.lx = cx + fx * 10;
  out.ly = cy + fy * 10;
  out.lz = cz + fz * 10;
  out.fov = 60 - k * 18 + (p.sprinting ? 5 : 0) + G.bossCam * 6;
  out.pivot = { x: px, y: py, z: pz };
  return out;
}
