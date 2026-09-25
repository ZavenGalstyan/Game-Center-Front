/**
 * Bottle Flip — side camera.
 *
 *  idle     frames the bottle AND the next goal so you can plan the throw
 *  flight   follows the bottle with look-ahead in the travel direction,
 *           still leaning toward the goal
 *  failed   drifts after the bottle briefly, then eases back on respawn
 *
 * Always exponential smoothing (never snaps, frame-rate independent) and
 * always clamped to the level's camera bounds and the floor.
 */
import { platformTop } from "../physics/solids.js";

export function createCamera() {
  return { x: 0, y: 0, s: 3, ready: false, zoom: 1 };
}

export function viewScale(level, W, H) {
  const vh = level.view || 190;
  return Math.min(H / vh, W / 240);
}

function goalIndex(s) {
  const last = s.level.platforms.length - 1;
  return Math.min(last, Math.max(s.platformIndex, s.progress) + 1);
}

export function cameraTarget(s, W, H, scale) {
  const lv = s.level;
  const b = s.body;
  const halfW = W / 2 / scale;
  const gi = goalIndex(s);
  const gp = lv.platforms[gi];
  const g = platformTop(gp, s.t);
  const gx = (g.x0 + g.x1) / 2;
  let tx;
  let ty;
  if (s.state === "flight" || s.state === "contact" || s.state === "failed") {
    const look = Math.max(-55, Math.min(55, b.vx * 0.22));
    tx = (b.x + look) * 0.72 + gx * 0.28;
    ty = b.y * 0.55 + (g.top + 18) * 0.45;
    if (s.state === "failed") ty = Math.max(ty, 40);
  } else {
    tx = (b.x + gx) / 2;
    // frame the bottle, the goal and any bonus star waiting between them
    let lo = Math.min(b.y - 10, g.top - 6);
    let hi = Math.max(b.y + 18, g.top + 30);
    const xa = Math.min(b.x, gx) - 20;
    const xb = Math.max(b.x, gx) + 20;
    (lv.collectibles || []).forEach((c, i) => {
      if (!s.collected.has(i) && c.x > xa && c.x < xb) hi = Math.max(hi, c.y + 12);
    });
    const halfH = H / 2 / scale;
    // keep the floor in shot whenever everything still fits — grounds the scene
    hi += 16; // room for the HUD strip
    lo = Math.min(lo, Math.max(-26, hi - halfH * 2 + 4));
    // never lose the bottle or the goal to fit a star
    ty = Math.min((lo + hi) / 2, lo + halfH - 6);
  }
  // keep the bottle comfortably on screen
  const margin = Math.min(halfW * 0.7, halfW - 40);
  tx = Math.max(b.x - margin, Math.min(b.x + margin, tx));
  return { x: tx, y: ty };
}

export function clampCamera(level, cam, W, H, scale) {
  const halfW = W / 2 / scale;
  const halfH = H / 2 / scale;
  const bd = level.bounds;
  const x0 = bd.x0 + halfW;
  const x1 = bd.x1 - halfW;
  cam.x = x0 > x1 ? (bd.x0 + bd.x1) / 2 : Math.max(x0, Math.min(x1, cam.x));
  const yMin = halfH - 34; // always show a strip of floor
  const yMax = Math.max(yMin, (bd.y1 ?? 300) - halfH);
  cam.y = Math.max(yMin, Math.min(yMax, cam.y));
}

export function updateCamera(cam, s, W, H, dt) {
  const scale = viewScale(s.level, W, H);
  cam.s = scale;
  const t = cameraTarget(s, W, H, scale);
  if (!cam.ready) {
    cam.x = t.x;
    cam.y = t.y;
    cam.ready = true;
  } else {
    const k = s.state === "flight" ? 4.2 : s.state === "failed" ? 2 : 3;
    const a = 1 - Math.exp(-k * dt);
    cam.x += (t.x - cam.x) * a;
    cam.y += (t.y - cam.y) * a;
  }
  clampCamera(s.level, cam, W, H, scale);
}
