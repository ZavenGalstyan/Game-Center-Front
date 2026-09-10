/**
 * Cake Designer — shared cake geometry.
 *
 * The renderer and the editor's pointer handling both need to agree on where a
 * tier sits and how a normalised (0..1) decoration coordinate maps into the
 * SVG view box. Keeping the maths here means "what you drag is what you see".
 *
 * View box is a fixed 360 x 360 square. The cake is centred on VB_CX and grows
 * upward from a baseline near the bottom.
 */

export const VB = 360;
export const VB_CX = 180;
export const BASE_Y = 216; // where the bottom tier meets the stand plate

// view box gives headroom above for tall cakes / toppers while keeping a
// single-tier cake roughly centred
export const VBX = 0;
export const VBY = 0;
export const VBW = 360;
export const VBH = 352;
export const VIEWBOX = `${VBX} ${VBY} ${VBW} ${VBH}`;

const SHAPE_WIDTH = {
  round: 1, square: 1.02, heart: 1.04, flower: 1.08, star: 1.14, hexagon: 1, tall: 0.82,
};

/**
 * Returns per-tier boxes, bottom tier first.
 *   { cx, topY, baseY, rx, ry, h }   (rx/ry are the top-surface ellipse radii)
 */
export function tierBoxes(cake) {
  const n = cake.layers.length;
  const shape = cake.shape || "round";
  const tall = shape === "tall";

  // bottom tier size scales down a touch as tier count rises so a 4-tier cake fits
  const maxRx = (n >= 4 ? 100 : n === 3 ? 108 : 118) * (SHAPE_WIDTH[shape] || 1);
  const tierH = (tall ? 96 : n >= 4 ? 44 : n === 3 ? 50 : 58);
  const shrink = tall ? 0.94 : n >= 4 ? 0.8 : 0.77;

  const boxes = [];
  let baseY = BASE_Y;
  for (let i = 0; i < n; i++) {
    const tierShape = i === 0 ? shape : "round";
    const rx = maxRx * Math.pow(shrink, i);
    const ry = rx * (tierShape === "square" ? 0.44 : tierShape === "heart" ? 0.4 : 0.34);
    const h = tierH * (i === 0 ? 1 : 0.96);
    const topY = baseY - h;
    boxes.push({ cx: VB_CX, rx, ry, h, topY, baseY });
    // the next (smaller) tier rests on this tier's top surface, embedded a touch
    baseY = topY + ry * 0.14;
  }
  return boxes;
}

/**
 * The rectangle (view-box units) that normalised decoration coords map into.
 * Normalised (0.5, 0.5) is the centre of the top tier's top surface; the field
 * also reaches down over the front face so drips-side items still land sensibly.
 */
export function placementField(cake) {
  const boxes = tierBoxes(cake);
  const top = boxes[boxes.length - 1];
  // the top tier's top-surface bounding box, expanded a little, so normalised
  // (0.5, 0.5) is the centre of the surface where items rest
  const w = top.rx * 2.15;
  const h = top.ry * 2.15 + top.h * 0.35;
  const cx = VB_CX + (cake.rotation || 0) * 9;
  const cy = top.topY + top.h * 0.1;
  return { cx, cy, w, h, x: cx - w / 2, y: cy - h / 2 };
}

/** normalised (0..1) -> view-box point */
export function toViewBox(cake, nx, ny) {
  const f = placementField(cake);
  return { x: f.x + nx * f.w, y: f.y + ny * f.h };
}

/** view-box point -> normalised (0..1), clamped */
export function toNormalized(cake, vx, vy) {
  const f = placementField(cake);
  return {
    x: clamp01((vx - f.x) / f.w),
    y: clamp01((vy - f.y) / f.h),
  };
}

/** client (mouse/touch) point on an <svg> element -> view-box point.
 * Accounts for preserveAspectRatio="xMidYMid meet" letterboxing of the
 * (possibly non-square) view box. */
export function clientToViewBox(svg, clientX, clientY) {
  const rect = svg.getBoundingClientRect();
  const scale = Math.min(rect.width / VBW, rect.height / VBH);
  const drawW = VBW * scale;
  const drawH = VBH * scale;
  const offX = rect.left + (rect.width - drawW) / 2;
  const offY = rect.top + (rect.height - drawH) / 2;
  return {
    x: VBX + (clientX - offX) / scale,
    y: VBY + (clientY - offY) / scale,
  };
}

export function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
