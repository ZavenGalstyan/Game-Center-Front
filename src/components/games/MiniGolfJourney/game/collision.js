/**
 * Mini Golf Journey — collision math (pure, no React, no Canvas).
 *
 * Every solid in the game reduces to one of two primitives:
 *   • capsule  — a thick line segment (perimeter rails, internal walls,
 *                spinner bars, sliding gates). Handles axis-aligned AND
 *                angled walls with one code path.
 *   • rect     — an axis-aligned block (stone boxes, city blocks).
 *
 * The solver is swept in sub-steps by the engine, so this file only needs the
 * static "circle vs primitive" resolve. Moving primitives pass their surface
 * velocity so a gate can nudge the ball instead of just stopping it.
 */

export const RESTITUTION = 0.72;

export function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}

export function len(x, y) {
  return Math.hypot(x, y);
}

/** closest point on segment (ax,ay)-(bx,by) to point (px,py) */
export function closestOnSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy || 1e-6;
  let t = ((px - ax) * dx + (py - ay) * dy) / l2;
  t = clamp(t, 0, 1);
  return { x: ax + t * dx, y: ay + t * dy, t };
}

/**
 * Resolve ball (circle) against one collider. Mutates `ball` ({x,y,vx,vy,r}).
 * Returns a small object describing the hit (or null) so the caller can spark
 * a particle / play a sound.
 *
 * collider:
 *   { kind:'capsule', x1,y1,x2,y2, r, vx?, vy?, ox?, oy? }   ox/oy = pivot for spin
 *   { kind:'rect', x,y,w,h }
 */
export function resolve(ball, c) {
  if (c.kind === "rect") return resolveRect(ball, c);
  return resolveCapsule(ball, c);
}

function bounce(ball, nx, ny, surfVX, surfVY) {
  // work in the surface's frame so moving gates impart push
  const rvx = ball.vx - surfVX;
  const rvy = ball.vy - surfVY;
  const vn = rvx * nx + rvy * ny;
  if (vn >= 0) return 0; // separating already
  const jx = -(1 + RESTITUTION) * vn * nx;
  const jy = -(1 + RESTITUTION) * vn * ny;
  let nrvx = rvx + jx;
  let nrvy = rvy + jy;
  // shave a touch of tangential energy so the ball doesn't crawl edges forever
  const tnx = -ny;
  const tny = nx;
  const vt = nrvx * tnx + nrvy * tny;
  nrvx -= vt * 0.04 * tnx;
  nrvy -= vt * 0.04 * tny;
  ball.vx = nrvx + surfVX;
  ball.vy = nrvy + surfVY;
  return Math.abs(vn);
}

function resolveCapsule(ball, c) {
  const cp = closestOnSegment(ball.x, ball.y, c.x1, c.y1, c.x2, c.y2);
  let dx = ball.x - cp.x;
  let dy = ball.y - cp.y;
  let dist = Math.hypot(dx, dy);
  const min = ball.r + c.r;
  if (dist >= min) return null;

  if (dist < 1e-4) {
    // dead centre on the segment — push along its normal
    const sx = c.x2 - c.x1;
    const sy = c.y2 - c.y1;
    const sl = Math.hypot(sx, sy) || 1;
    dx = -sy / sl;
    dy = sx / sl;
    dist = 0.0001;
  }
  const nx = dx / dist;
  const ny = dy / dist;
  ball.x = cp.x + nx * (min + 0.02);
  ball.y = cp.y + ny * (min + 0.02);

  // surface velocity at the contact point (translation + rotation about pivot)
  let svx = c.vx || 0;
  let svy = c.vy || 0;
  if (c.omega) {
    svx += -(cp.y - c.oy) * c.omega;
    svy += (cp.x - c.ox) * c.omega;
  }
  const impact = bounce(ball, nx, ny, svx, svy);
  return impact > 0 ? { impact, nx, ny, x: cp.x, y: cp.y } : null;
}

function resolveRect(ball, c) {
  const nx0 = clamp(ball.x, c.x, c.x + c.w);
  const ny0 = clamp(ball.y, c.y, c.y + c.h);
  const inside = nx0 === ball.x && ny0 === ball.y;

  let px = nx0;
  let py = ny0;
  if (inside) {
    // ball centre is within the rect — eject through the nearest face
    const dl = ball.x - c.x;
    const dr = c.x + c.w - ball.x;
    const dt = ball.y - c.y;
    const db = c.y + c.h - ball.y;
    const m = Math.min(dl, dr, dt, db);
    if (m === dl) px = c.x;
    else if (m === dr) px = c.x + c.w;
    else if (m === dt) py = c.y;
    else py = c.y + c.h;
  }
  let dx = ball.x - px;
  let dy = ball.y - py;
  let dist = Math.hypot(dx, dy);
  if (!inside && dist >= ball.r) return null;
  if (dist < 1e-4) {
    dx = 0;
    dy = -1;
    dist = 0.0001;
  }
  const nx = dx / dist;
  const ny = dy / dist;
  ball.x = px + nx * (ball.r + 0.02);
  ball.y = py + ny * (ball.r + 0.02);
  const impact = bounce(ball, nx, ny, 0, 0);
  return impact > 0 ? { impact, nx, ny, x: px, y: py } : null;
}
