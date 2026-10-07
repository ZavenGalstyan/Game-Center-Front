/**
 * Water Tanks — board layout + tank geometry, all in CSS pixels.
 *
 * Tanks are drawn as SVGs whose viewBox equals their pixel size (1 unit =
 * 1 px), so the pour maths below (spout point, stream, water surface) can
 * be done once in board coordinates and is exact at every stage size.
 *
 * Water height is LINEAR in litres: the measured zone runs from the inner
 * bottom (0 L) to the full line (capacity), so fill height = amount / capacity
 * of that zone, always.
 */

const SHAPE_WIDTH = { tall: 0.34, standard: 0.44, wide: 0.6, jar: 0.52, flask: 0.46 };
export const TILT_DEG = 58;

export function tankGeometry(w, h, shape = "standard") {
  const wall = Math.max(3, Math.round(w * 0.045));
  const foot = Math.max(7, Math.round(h * 0.055));
  const rimH = Math.max(6, Math.round(h * 0.035));
  const x0 = wall + 2;
  const x1 = w - wall - 2;
  const bodyBottom = h - foot;
  const radius = Math.min((x1 - x0) / 2, shape === "jar" ? w * 0.26 : shape === "flask" ? w * 0.08 : w * 0.16);
  const rimY = 2;
  const yFull = rimY + rimH + Math.max(5, h * 0.035); // full line sits just under the rim
  const yBottom = bodyBottom - wall - 1;
  return { w, h, wall, foot, rimH, rimY, x0, x1, cx: w / 2, bodyBottom, radius, yFull, yBottom, shape };
}

/** Local y of the water surface for `amount` (slightly below the clip when empty). */
export function levelY(g, amount, capacity) {
  if (amount <= 0) return g.yBottom + 6;
  return g.yBottom - (amount / capacity) * (g.yBottom - g.yFull);
}

/** Interior path (rounded bottom) — clips the water. */
export function interiorPath(g) {
  const { x0, x1, yBottom, radius: r } = g;
  const top = g.rimY + g.rimH - 1;
  return `M${x0},${top} L${x0},${yBottom - r} Q${x0},${yBottom} ${x0 + r},${yBottom} L${x1 - r},${yBottom} Q${x1},${yBottom} ${x1},${yBottom - r} L${x1},${top} Z`;
}

/** Outer glass outline (walls + bottom), open at the top. */
export function glassPath(g) {
  const { wall } = g;
  const x0 = g.x0 - wall / 2;
  const x1 = g.x1 + wall / 2;
  const b = g.yBottom + wall / 2;
  const r = g.radius + wall / 2;
  const top = g.rimY + g.rimH / 2;
  return `M${x0},${top} L${x0},${b - r} Q${x0},${b} ${x0 + r},${b} L${x1 - r},${b} Q${x1},${b} ${x1},${b - r} L${x1},${top}`;
}

/**
 * Lay the tanks out on the counter. Returns
 *   { tanks: [{ x, y, w, h, geo }], baseY, labelH, ... }
 * where (x, y) is the tank's top-left corner in board pixels.
 */
export function layoutBoard(bw, bh, level, { fixtureRow = false, valveRows = 0, compact = false, headroom = 0 } = {}) {
  const n = level.tanks.length;
  const maxCap = Math.max(...level.tanks.map((t) => t.capacity));
  const hf = level.tanks.map((t) => 0.46 + 0.54 * Math.pow(t.capacity / maxCap, 0.75));
  const wf = level.tanks.map((t, i) => (SHAPE_WIDTH[t.shape] || 0.44) * (0.78 + 0.22 * hf[i]));
  const labelH = Math.round(Math.min(56, Math.max(compact ? 22 : 30, bh * 0.1)));
  const fixtureH = fixtureRow ? Math.round(Math.min(42, Math.max(28, bh * 0.075))) : 0;
  const valveH = valveRows ? Math.round(Math.min(26, Math.max(20, bh * 0.05)) * valveRows + 6) : 0;
  const bottom = labelH + fixtureH + valveH + Math.round(bh * 0.02);
  const sin = Math.sin((TILT_DEG * Math.PI) / 180);
  // vertical: every destination's height + headroom for any other tank tilted above it
  let need = 0;
  for (let d = 0; d < n; d++) for (let s = 0; s < n; s++) if (s !== d) need = Math.max(need, hf[d] + sin * wf[s] * 1.02);
  // A tilted pourer may briefly rise over the HUD (`headroom` px above the
  // board); resting tanks must still fit inside the board itself.
  const top = Math.min(30, bh * 0.08);
  const vMax = Math.min((bh + headroom * 0.85 - bottom - top) / need, (bh - bottom - top) / Math.max(...hf));
  // horizontal: widths + gaps
  const gapF = n <= 2 ? 0.42 : n === 3 ? 0.3 : n === 4 ? 0.22 : 0.16;
  const hMax = (bw * 0.94) / (wf.reduce((a, b) => a + b, 0) + gapF * (n + 1) * (n <= 2 ? 1.4 : 1));
  const H = Math.max(40, Math.min(vMax, hMax, 560));
  // portrait / tall boards: width runs out first — let the glasses grow taller instead
  const stretch = vMax > hMax ? Math.min(2.2, vMax / hMax) : 1;
  const ws = wf.map((f) => Math.round(f * H));
  const hs = hf.map((f) => Math.round(f * H * stretch));
  const total = ws.reduce((a, b) => a + b, 0);
  const gap = Math.min((bw - total) / (n + 1), H * 0.55);
  const rowW = total + gap * (n - 1);
  let x = (bw - rowW) / 2;
  const baseY = bh - bottom;
  const tanks = level.tanks.map((t, i) => {
    const r = { x: Math.round(x), y: Math.round(baseY - hs[i]), w: ws[i], h: hs[i], slot: ws[i] + gap, geo: tankGeometry(ws[i], hs[i], t.shape) };
    x += ws[i] + gap;
    return r;
  });
  return { tanks, baseY, labelH, fixtureH, valveH, bw, bh, H };
}

/**
 * Where the pouring tank goes. Returns the transform (translate + rotate about
 * the tank's centre) that puts its spout just above the destination's near
 * rim, plus the spout point in board pixels for the stream.
 */
export function pourPose(src, dst) {
  const sign = dst.x + dst.w / 2 >= src.x + src.w / 2 ? 1 : -1;
  const deg = TILT_DEG * sign;
  const rad = (deg * Math.PI) / 180;
  const g = src.geo;
  // spout = top corner of the source on the pouring side, relative to its centre
  const lx = sign * (g.x1 - g.cx + g.wall * 0.6);
  const ly = g.rimY + g.rimH * 0.5 - src.h / 2;
  const rx = lx * Math.cos(rad) - ly * Math.sin(rad);
  const ry = lx * Math.sin(rad) + ly * Math.cos(rad);
  const target = {
    x: dst.x + dst.w / 2 - sign * (dst.geo.x1 - dst.geo.x0) * 0.2,
    y: dst.y + dst.geo.rimY - Math.max(14, dst.h * 0.06),
  };
  const cx = src.x + src.w / 2;
  const cy = src.y + src.h / 2;
  return { dx: target.x - (cx + rx), dy: target.y - (cy + ry), deg, spout: target, sign };
}
