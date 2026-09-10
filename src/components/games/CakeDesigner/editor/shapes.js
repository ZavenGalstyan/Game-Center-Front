/**
 * Cake Designer — cake-shape outlines.
 *
 * `shapeOutline` samples a shape's silhouette as points around its centre,
 * scaled to the tier's top-surface radii (rx, ry). The tier renderer uses the
 * points three ways: the filled top surface, the extruded front "side", and
 * the frosting rim that traces the edge.
 */

const TAU = Math.PI * 2;

/** radius multiplier (0..1+) for a shape at parametric angle a (0..TAU) */
function shapeRadius(shape, a) {
  switch (shape) {
    case "square": {
      // rounded square in polar form
      const c = Math.abs(Math.cos(a));
      const s = Math.abs(Math.sin(a));
      return 0.82 / Math.max(c, s, 0.0001) ** 0.72;
    }
    case "hexagon": {
      const k = Math.PI / 3;
      const aa = a % k;
      return 0.86 / Math.cos(aa - k / 2);
    }
    case "heart": {
      // classic heart curve, normalised
      const t = a;
      const x = 16 * Math.sin(t) ** 3;
      const y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
      return Math.hypot(x, y) / 17;
    }
    case "flower": {
      return 0.82 + 0.18 * Math.cos(a * 6);
    }
    case "star": {
      // 5 rounded points
      return 0.58 + 0.42 * Math.pow(Math.abs(Math.cos((a * 5) / 2)), 1.7);
    }
    default:
      return 1; // round / tall
  }
}

export function shapeOutline(shape, cx, cy, rx, ry, steps = 72) {
  const pts = [];

  // square -> rounded rectangle (superellipse): flat sides + flat front edge,
  // so the extruded body reads as a square cake block with no front fang
  if (shape === "square") {
    const nExp = 4.5;
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * TAU - Math.PI / 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const x = Math.sign(ca) * Math.pow(Math.abs(ca), 2 / nExp);
      const y = Math.sign(sa) * Math.pow(Math.abs(sa), 2 / nExp);
      pts.push({ x: cx + x * rx * 0.94, y: cy + y * ry });
    }
    return pts;
  }

  // hexagon oriented point-left/right so the front is a flat edge (no fang)
  if (shape === "hexagon") {
    const verts = [0, 60, 120, 180, 240, 300].map((d) => (d * Math.PI) / 180);
    for (let i = 0; i < steps; i++) {
      const t = (i / steps) * 6;
      const seg = Math.floor(t);
      const f = t - seg;
      const a0 = verts[seg % 6];
      const a1 = verts[(seg + 1) % 6];
      const x0 = Math.cos(a0), y0 = Math.sin(a0), x1 = Math.cos(a1), y1 = Math.sin(a1);
      pts.push({ x: cx + (x0 + (x1 - x0) * f) * rx * 0.9, y: cy + (y0 + (y1 - y0) * f) * ry * 1.6 });
    }
    return pts;
  }

  // heart wants its own parametrisation for a clean tip
  if (shape === "heart") {
    for (let i = 0; i < steps; i++) {
      const t = (i / steps) * TAU;
      const x = 16 * Math.sin(t) ** 3;
      const y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
      pts.push({ x: cx + (x / 17) * rx, y: cy + (y / 17) * ry * 0.92 });
    }
    return pts;
  }
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * TAU - Math.PI / 2;
    let r = shapeRadius(shape, a + Math.PI / 2);
    if (!isFinite(r) || r > 1.9) r = 1.9;
    pts.push({ x: cx + Math.cos(a) * rx * r, y: cy + Math.sin(a) * ry * r });
  }
  return pts;
}

export function outlinePath(pts) {
  return pts.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ") + " Z";
}

/** Front chain (screen-lower half) as an ordered left→right point list. */
export function frontChain(pts, cy) {
  const front = pts.filter((p) => p.y >= cy - 0.5);
  front.sort((a, b) => a.x - b.x);
  return front;
}

/**
 * Extruded side path: the front arc of the silhouette is the top edge, the
 * same arc offset down by `h` is the base edge. Only used for the rounded
 * body shapes (round / square / hexagon / tall), whose front arc is smooth.
 */
export function sidePath(pts, cy, h) {
  const front = frontChain(pts, cy);
  if (front.length < 2) return "";
  const top = front.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
  const bottom = [...front].reverse().map((p) => `L${p.x.toFixed(1)} ${(p.y + h).toFixed(1)}`).join(" ");
  const last = front[front.length - 1];
  return `${top} L${last.x.toFixed(1)} ${(last.y + h).toFixed(1)} ${bottom} Z`;
}

/** Points along the front lower edge where drips hang from. */
export function dripAnchors(pts, cy, count = 9) {
  const front = frontChain(pts, cy);
  if (front.length < 2) return [];
  const out = [];
  for (let i = 0; i < count; i++) {
    const t = (i + 0.5) / count;
    const idx = t * (front.length - 1);
    const lo = Math.floor(idx);
    const hi = Math.min(front.length - 1, lo + 1);
    const f = idx - lo;
    out.push({
      x: front[lo].x + (front[hi].x - front[lo].x) * f,
      y: front[lo].y + (front[hi].y - front[lo].y) * f,
    });
  }
  return out;
}

export function pointInPolygon(pt, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i].x, yi = pts[i].y, xj = pts[j].x, yj = pts[j].y;
    const hit = yi > pt.y !== yj > pt.y && pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi) + xi;
    if (hit) inside = !inside;
  }
  return inside;
}
