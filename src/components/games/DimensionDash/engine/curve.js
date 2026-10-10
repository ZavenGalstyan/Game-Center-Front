/**
 * Dimension Dash — sampled 3D curves with arc length. Used by loops / half
 * loops / corkscrews ("rides") and by grind rails.
 *
 * A curve is { x[], y[], z[], ux[], uy[], uz[] (rider "up"), cum[], len }.
 * sample(c, u, out) fills position, unit tangent and up at arc length u.
 */
export function makeCurve(points, ups) {
  const n = points.length;
  const c = {
    n,
    x: new Float64Array(n),
    y: new Float64Array(n),
    z: new Float64Array(n),
    ux: new Float64Array(n),
    uy: new Float64Array(n),
    uz: new Float64Array(n),
    cum: new Float64Array(n),
    len: 0,
  };
  for (let i = 0; i < n; i++) {
    const p = points[i];
    c.x[i] = p[0];
    c.y[i] = p[1];
    c.z[i] = p[2];
    const u = ups ? ups[i] : [0, 1, 0];
    const l = Math.hypot(u[0], u[1], u[2]) || 1;
    c.ux[i] = u[0] / l;
    c.uy[i] = u[1] / l;
    c.uz[i] = u[2] / l;
    if (i > 0) c.cum[i] = c.cum[i - 1] + Math.hypot(c.x[i] - c.x[i - 1], c.y[i] - c.y[i - 1], c.z[i] - c.z[i - 1]);
  }
  c.len = c.cum[n - 1];
  return c;
}

function seg(c, u) {
  // binary search the segment holding arc length u
  let lo = 0;
  let hi = c.n - 1;
  if (u <= 0) return 0;
  if (u >= c.len) return c.n - 2;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (c.cum[m] <= u) lo = m;
    else hi = m;
  }
  return lo;
}

export function sample(c, u, out) {
  const i = seg(c, u);
  const j = i + 1;
  const l = c.cum[j] - c.cum[i] || 1e-6;
  const f = Math.min(1, Math.max(0, (u - c.cum[i]) / l));
  out.x = c.x[i] + (c.x[j] - c.x[i]) * f;
  out.y = c.y[i] + (c.y[j] - c.y[i]) * f;
  out.z = c.z[i] + (c.z[j] - c.z[i]) * f;
  out.tx = (c.x[j] - c.x[i]) / l;
  out.ty = (c.y[j] - c.y[i]) / l;
  out.tz = (c.z[j] - c.z[i]) / l;
  let ux = c.ux[i] + (c.ux[j] - c.ux[i]) * f;
  let uy = c.uy[i] + (c.uy[j] - c.uy[i]) * f;
  let uz = c.uz[i] + (c.uz[j] - c.uz[i]) * f;
  const ul = Math.hypot(ux, uy, uz) || 1;
  out.ux = ux / ul;
  out.uy = uy / ul;
  out.uz = uz / ul;
  return out;
}

/** nearest arc length on the curve to point p (brute force over segments; curves are short) */
export function nearest(c, px, py, pz, out) {
  let best = Infinity;
  let bu = 0;
  for (let i = 0; i < c.n - 1; i++) {
    const ax = c.x[i];
    const ay = c.y[i];
    const az = c.z[i];
    const dx = c.x[i + 1] - ax;
    const dy = c.y[i + 1] - ay;
    const dz = c.z[i + 1] - az;
    const l2 = dx * dx + dy * dy + dz * dz || 1e-9;
    let t = ((px - ax) * dx + (py - ay) * dy + (pz - az) * dz) / l2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const qx = ax + dx * t - px;
    const qy = ay + dy * t - py;
    const qz = az + dz * t - pz;
    const d2 = qx * qx + qy * qy + qz * qz;
    if (d2 < best) {
      best = d2;
      bu = c.cum[i] + t * (c.cum[i + 1] - c.cum[i]);
    }
  }
  if (out) {
    out.u = bu;
    out.d = Math.sqrt(best);
  }
  return bu;
}

/** Catmull-Rom resample of control points into ~step-spaced points */
export function spline(ctrl, step = 0.8) {
  const out = [];
  const P = (i) => ctrl[Math.max(0, Math.min(ctrl.length - 1, i))];
  for (let i = 0; i < ctrl.length - 1; i++) {
    const p0 = P(i - 1);
    const p1 = P(i);
    const p2 = P(i + 1);
    const p3 = P(i + 2);
    const segLen = Math.hypot(p2[0] - p1[0], p2[1] - p1[1], p2[2] - p1[2]);
    const m = Math.max(2, Math.ceil(segLen / step));
    for (let k = 0; k < m; k++) {
      const t = k / m;
      const t2 = t * t;
      const t3 = t2 * t;
      const v = [0, 0, 0];
      for (let a = 0; a < 3; a++) {
        v[a] = 0.5 * (2 * p1[a] + (-p0[a] + p2[a]) * t + (2 * p0[a] - 5 * p1[a] + 4 * p2[a] - p3[a]) * t2 + (-p0[a] + 3 * p1[a] - 3 * p2[a] + p3[a]) * t3);
      }
      out.push(v);
    }
  }
  out.push([...ctrl[ctrl.length - 1]]);
  return out;
}
