/**
 * Bottle Flip — world ↔ screen mapping.
 *
 * view: { cx, cy, s, W, H, dpr } — camera centre in world units, pixels per
 * unit (CSS px), canvas CSS size and device pixel ratio.
 */

/** y-UP world transform, with optional parallax (par < 1 = further away). */
export function setWorld(ctx, v, par = 1, parY = par) {
  const k = v.s * v.dpr;
  ctx.setTransform(k, 0, 0, -k, (v.W / 2 - v.cx * par * v.s) * v.dpr, (v.H / 2 + v.cy * parY * v.s) * v.dpr);
}

export function setScreen(ctx, v) {
  ctx.setTransform(v.dpr, 0, 0, v.dpr, 0, 0);
}

export function worldToScreen(v, x, y) {
  return [v.W / 2 + (x - v.cx) * v.s, v.H / 2 - (y - v.cy) * v.s];
}

export function screenToWorld(v, sx, sy) {
  return [v.cx + (sx - v.W / 2) / v.s, v.cy - (sy - v.H / 2) / v.s];
}

/** Visible world rect for a parallax layer. */
export function visibleRect(v, par = 1) {
  const hw = v.W / 2 / v.s;
  const hh = v.H / 2 / v.s;
  return { x0: v.cx * par - hw, x1: v.cx * par + hw, y0: v.cy * par - hh, y1: v.cy * par + hh };
}
