/**
 * Car Wash Studio — 2D geometry helpers (pure JS, Node-importable).
 *
 * Every vehicle / interior shape is authored as key points and flattened to
 * plain polygons ([[x,y], ...]). The SAME polygons feed three consumers:
 *   - the painter (converted to Path2D for fills and clips),
 *   - the surface validity rasteriser (which mask pixels belong to a region),
 *   - brush hit tests.
 * That is what keeps "what you see" and "what the brush cleans" identical.
 */

/** Catmull-Rom through an OPEN chain of points → dense polyline (endpoints kept sharp). */
export function spline(pts, steps = 10, tension = 0.5) {
  if (pts.length < 3) return pts.map((p) => [p[0], p[1]]);
  const out = [];
  const n = pts.length;
  const P = (i) => pts[Math.max(0, Math.min(n - 1, i))];
  for (let i = 0; i < n - 1; i++) {
    const p0 = P(i - 1);
    const p1 = P(i);
    const p2 = P(i + 1);
    const p3 = P(i + 2);
    // tangents; a point flagged sharp (p[2] === 1) gets a zero tangent → corner
    const s1 = p1[2] === 1 ? 0 : tension;
    const s2 = p2[2] === 1 ? 0 : tension;
    const m1x = (p2[0] - p0[0]) * s1;
    const m1y = (p2[1] - p0[1]) * s1;
    const m2x = (p3[0] - p1[0]) * s2;
    const m2y = (p3[1] - p1[1]) * s2;
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      const t2 = t * t;
      const t3 = t2 * t;
      const h00 = 2 * t3 - 3 * t2 + 1;
      const h10 = t3 - 2 * t2 + t;
      const h01 = -2 * t3 + 3 * t2;
      const h11 = t3 - t2;
      out.push([
        h00 * p1[0] + h10 * m1x + h01 * p2[0] + h11 * m2x,
        h00 * p1[1] + h10 * m1y + h01 * p2[1] + h11 * m2y,
      ]);
    }
  }
  const last = pts[n - 1];
  out.push([last[0], last[1]]);
  return out;
}

/** Closed Catmull-Rom loop. */
export function splineClosed(pts, steps = 10, tension = 0.5) {
  const n = pts.length;
  const out = [];
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    const s1 = p1[2] === 1 ? 0 : tension;
    const s2 = p2[2] === 1 ? 0 : tension;
    const m1x = (p2[0] - p0[0]) * s1;
    const m1y = (p2[1] - p0[1]) * s1;
    const m2x = (p3[0] - p1[0]) * s2;
    const m2y = (p3[1] - p1[1]) * s2;
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      const t2 = t * t;
      const t3 = t2 * t;
      out.push([
        (2 * t3 - 3 * t2 + 1) * p1[0] + (t3 - 2 * t2 + t) * m1x + (-2 * t3 + 3 * t2) * p2[0] + (t3 - t2) * m2x,
        (2 * t3 - 3 * t2 + 1) * p1[1] + (t3 - 2 * t2 + t) * m1y + (-2 * t3 + 3 * t2) * p2[1] + (t3 - t2) * m2y,
      ]);
    }
  }
  return out;
}

/** Arc points (angles in radians, standard math orientation in the caller's space). */
export function arc(cx, cy, r, a0, a1, n = 18, ry = r) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * ry]);
  }
  return out;
}

export function ellipse(cx, cy, rx, ry, n = 36) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    out.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
  }
  return out;
}

export function rect(x0, y0, x1, y1) {
  return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
}

export function roundRect(x0, y0, x1, y1, r, n = 5) {
  const rr = Math.min(r, (x1 - x0) / 2, (y1 - y0) / 2);
  const out = [];
  const corner = (cx, cy, a0) => {
    for (let i = 0; i <= n; i++) {
      const a = a0 + (Math.PI / 2) * (i / n);
      out.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
    }
  };
  corner(x1 - rr, y0 + rr, -Math.PI / 2);
  corner(x1 - rr, y1 - rr, 0);
  corner(x0 + rr, y1 - rr, Math.PI / 2);
  corner(x0 + rr, y0 + rr, Math.PI);
  return out;
}

export function bbox(poly) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const p of poly) {
    if (p[0] < x0) x0 = p[0];
    if (p[1] < y0) y0 = p[1];
    if (p[0] > x1) x1 = p[0];
    if (p[1] > y1) y1 = p[1];
  }
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
}

export function unionBox(a, b) {
  if (!a) return b;
  const x0 = Math.min(a.x0, b.x0);
  const y0 = Math.min(a.y0, b.y0);
  const x1 = Math.max(a.x1, b.x1);
  const y1 = Math.max(a.y1, b.y1);
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
}

/** Even-odd ray cast. */
export function pointInPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0];
    const yi = poly[i][1];
    const xj = poly[j][0];
    const yj = poly[j][1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export const mapPoly = (poly, fn) => poly.map((p) => fn(p[0], p[1]));

/** Band polygon between two dividing polylines (each listed top→bottom). */
export function band(lineA, lineB, top = -1e4, bottom = 1e4) {
  const a = [[lineA[0][0], top], ...lineA, [lineA[lineA.length - 1][0], bottom]];
  const b = [[lineB[0][0], top], ...lineB, [lineB[lineB.length - 1][0], bottom]];
  return [...a, ...b.reverse()];
}

/* ------------------------------------------------------------ affine */
// Same layout as CanvasRenderingContext2D.setTransform(a, b, c, d, e, f):
//   x' = a*x + c*y + e,  y' = b*x + d*y + f

export const affine = (a, b, c, d, e, f) => ({ a, b, c, d, e, f });

export function applyAff(m, x, y) {
  return [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f];
}

export function invertAff(m) {
  const det = m.a * m.d - m.b * m.c;
  const ia = m.d / det;
  const ib = -m.b / det;
  const ic = -m.c / det;
  const id = m.a / det;
  return affine(ia, ib, ic, id, -(ia * m.e + ic * m.f), -(ib * m.e + id * m.f));
}

export function mulAff(m, n) {
  // m ∘ n  (apply n first, then m)
  return affine(
    m.a * n.a + m.c * n.b,
    m.b * n.a + m.d * n.b,
    m.a * n.c + m.c * n.d,
    m.b * n.c + m.d * n.d,
    m.a * n.e + m.c * n.f + m.e,
    m.b * n.e + m.d * n.f + m.f,
  );
}

/**
 * Affine that maps mask pixel space [0,w]x[0,h] onto a view-space box,
 * optionally flipped (used when the same panel is seen from the other end).
 */
export function boxAffine(w, h, box, flipX = false, flipY = false) {
  const sx = box.w / w;
  const sy = box.h / h;
  return affine(
    flipX ? -sx : sx,
    0,
    0,
    flipY ? -sy : sy,
    flipX ? box.x1 : box.x0,
    flipY ? box.y1 : box.y0,
  );
}

/** Distance from point to segment. */
export function distSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  let t = l2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const x = ax + dx * t - px;
  const y = ay + dy * t - py;
  return Math.sqrt(x * x + y * y);
}

export function centroid(poly) {
  let x = 0;
  let y = 0;
  for (const p of poly) {
    x += p[0];
    y += p[1];
  }
  return [x / poly.length, y / poly.length];
}

export const lerp = (a, b, t) => a + (b - a) * t;
