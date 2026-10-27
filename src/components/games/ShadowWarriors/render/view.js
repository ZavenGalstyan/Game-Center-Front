/**
 * Shadow Warriors — camera. World units → canvas pixels. The fight plane
 * zooms out when the fighters are far apart; background layers use the
 * un-zoomed base scale (they are cached) and only pan with parallax.
 */
import { ARENA_W } from "../engine/constants.js";

export const VIEW_H = 400; // world units visible vertically at zoom 1
export const CAM_MIN = -(ARENA_W / 2 + 70);
export const CAM_MAX = ARENA_W / 2 + 70;

export function createView() {
  return { W: 960, H: 540, dpr: 1, s0: 1, s: 1, zoom: 1, cx: 0, cy: 0, groundY: 0, shake: 0, shakeX: 0, shakeY: 0, kick: 0 };
}

export function resizeView(v, W, H, dpr) {
  v.W = W;
  v.H = H;
  v.dpr = dpr;
  // landscape: height decides; portrait/narrow: keep enough width for the fight
  v.s0 = Math.min(H / VIEW_H, W / 560);
  v.groundY = H * 0.83;
}

/** Follow the two fighters. `dt` seconds, `snap` jumps straight there. */
export function updateCamera(v, a, b, dt, snap = false, focus = null) {
  const mid = focus ? focus.x : (a.x + b.x) / 2;
  const span = Math.abs(a.x - b.x) + 360;
  const baseW = v.W / v.s0;
  let zoom = Math.min(1, baseW / span);
  zoom = Math.max(0.72, zoom);
  if (focus) zoom = Math.min(1.12, zoom * 1.12);
  const k = snap ? 1 : 1 - Math.pow(0.0025, dt);
  v.zoom += (zoom - v.zoom) * k;
  v.s = v.s0 * v.zoom;
  const half = v.W / v.s / 2;
  const lo = CAM_MIN + half;
  const hi = CAM_MAX - half;
  const target = lo > hi ? 0 : Math.max(lo, Math.min(hi, mid));
  v.cx += (target - v.cx) * (snap ? 1 : 1 - Math.pow(0.004, dt));
  // ground line rises slightly as we zoom out so the fighters stay central
  v.cy = 0;
  // shake
  if (v.shake > 0) {
    v.shake = Math.max(0, v.shake - dt * 30);
    v.shakeX = (Math.random() * 2 - 1) * v.shake;
    v.shakeY = (Math.random() * 2 - 1) * v.shake * 0.6;
  } else v.shakeX = v.shakeY = 0;
}

export const sx = (v, x) => v.W / 2 + (x - v.cx) * v.s + v.shakeX;
export const sy = (v, y) => v.groundY - y * v.s + v.shakeY;
