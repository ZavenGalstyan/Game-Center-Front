/**
 * Stack Tower — block renderer (Canvas 2D, true orthographic projection).
 *
 * Every block is a real 3D box projected with a fixed 45° yaw / PITCH tilt
 * camera. Faces are culled by their (possibly rotated) normal, so the same
 * routine draws static tower slabs and tumbling cut pieces. A box is convex,
 * so visible faces never overlap and need no sorting.
 *
 * Visible faces of an axis-aligned block: top (+Y), left (+Z), right (+X).
 * Lighting is a fixed key light from the upper left: top brightest, left
 * face mid, right face darkest, all nudged toward the theme's ambient tint.
 */

const PITCH = (33 * Math.PI) / 180;
export const K1 = Math.SQRT1_2;
export const K2 = Math.sin(PITCH) * Math.SQRT1_2;
export const K3 = Math.cos(PITCH);

// toward-camera vector (for back-face culling)
const CAM = [Math.cos(PITCH) * Math.SQRT1_2, Math.sin(PITCH), Math.cos(PITCH) * Math.SQRT1_2];
// key light
const LIGHT = (() => {
  const v = [-0.35, 1, 0.6];
  const l = Math.hypot(...v);
  return v.map((c) => c / l);
})();

/** Screen-space projection of world point. `view` = { cx, cy, s, camY } */
export function project(view, x, y, z) {
  return [view.cx + (x - z) * K1 * view.s, view.cy + ((x + z) * K2 - (y - view.camY) * K3) * view.s];
}

// corner i: bit0 → +x, bit1 → +y, bit2 → +z
const FACES = [
  { n: [1, 0, 0], v: [1, 3, 7, 5], kind: "side" },
  { n: [-1, 0, 0], v: [0, 4, 6, 2], kind: "side" },
  { n: [0, 1, 0], v: [2, 6, 7, 3], kind: "top" },
  { n: [0, -1, 0], v: [0, 1, 5, 4], kind: "bottom" },
  { n: [0, 0, 1], v: [4, 5, 7, 6], kind: "side" },
  { n: [0, 0, -1], v: [0, 2, 3, 1], kind: "side" },
];

const pts = new Float64Array(16);

function rotate(rot, x, y, z) {
  if (!rot || !rot.a) return [x, y, z];
  const c = Math.cos(rot.a);
  const s = Math.sin(rot.a);
  if (rot.axis === "z") return [x * c - y * s, x * s + y * c, z];
  // about X
  return [x, y * c - z * s, y * s + z * c];
}

/**
 * Face colour in HSL: shadowed faces keep (even gain) saturation and drift
 * slightly toward the theme's cool/warm ambient hue instead of turning muddy
 * the way plain RGB multiplication does (gold → olive).
 */
function shadeHsl(hsl, shade, tintHue, a = 1) {
  const k = 1 - Math.min(1, shade);
  let dh = tintHue - hsl[0];
  if (dh > 180) dh -= 360;
  if (dh < -180) dh += 360;
  const h = hsl[0] + dh * k * 0.18;
  const s = Math.min(100, hsl[1] * (1 + k * 0.1));
  const l = Math.min(96, hsl[2] * (0.42 + 0.58 * shade) + (shade > 1 ? (shade - 1) * 60 : 0));
  return `hsla(${h.toFixed(1)},${s.toFixed(1)}%,${l.toFixed(1)}%,${a})`;
}
function lighten(hsl, k, a = 1) {
  return `hsla(${hsl[0].toFixed(1)},${hsl[1].toFixed(1)}%,${(hsl[2] + (100 - hsl[2]) * k).toFixed(1)}%,${a})`;
}

function path4(ctx, i0, i1, i2, i3) {
  ctx.beginPath();
  ctx.moveTo(pts[i0 * 2], pts[i0 * 2 + 1]);
  ctx.lineTo(pts[i1 * 2], pts[i1 * 2 + 1]);
  ctx.lineTo(pts[i2 * 2], pts[i2 * 2 + 1]);
  ctx.lineTo(pts[i3 * 2], pts[i3 * 2 + 1]);
  ctx.closePath();
}

/**
 * Draw one box.
 *   b = { x, y, z, w, h, d, hsl: [h,s,l], rot?: { axis, a } }  (y = bottom face)
 *   o = { tint (ambient hue), quality, alpha, glow, edgeGlow, flash }
 */
export function drawBox(ctx, view, b, o) {
  const hx = b.w / 2;
  const hy = b.h / 2;
  const hz = b.d / 2;
  const cy = b.y + hy;
  for (let i = 0; i < 8; i++) {
    const [rx, ry, rz] = rotate(b.rot, i & 1 ? hx : -hx, i & 2 ? hy : -hy, i & 4 ? hz : -hz);
    const x = b.x + rx;
    const y = cy + ry;
    const z = b.z + rz;
    pts[i * 2] = view.cx + (x - z) * K1 * view.s;
    pts[i * 2 + 1] = view.cy + ((x + z) * K2 - (y - view.camY) * K3) * view.s;
  }
  const alpha = o.alpha ?? 1;
  const hq = o.quality !== "low";
  const lw = Math.max(1, view.s * 0.05);
  const flash = o.flash || 0;

  for (const f of FACES) {
    const [nx, ny, nz] = rotate(b.rot, f.n[0], f.n[1], f.n[2]);
    if (nx * CAM[0] + ny * CAM[1] + nz * CAM[2] <= 1e-4) continue;
    const dot = nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2];
    let shade = 0.64 + 0.36 * dot;
    if (flash) shade = shade + (1.25 - shade) * flash;
    const [a0, a1, a2, a3] = f.v;
    path4(ctx, a0, a1, a2, a3);

    if (hq && !b.rot && f.kind === "side") {
      // soft vertical falloff: catch-light at the top, darker at the foot
      const topY = Math.min(pts[a0 * 2 + 1], pts[a1 * 2 + 1], pts[a2 * 2 + 1], pts[a3 * 2 + 1]);
      const botY = Math.max(pts[a0 * 2 + 1], pts[a1 * 2 + 1], pts[a2 * 2 + 1], pts[a3 * 2 + 1]);
      const g = ctx.createLinearGradient(0, topY, 0, botY);
      g.addColorStop(0, shadeHsl(b.hsl, shade * 1.05, o.tint, alpha));
      g.addColorStop(1, shadeHsl(b.hsl, shade * 0.9, o.tint, alpha));
      ctx.fillStyle = g;
    } else if (hq && !b.rot && f.kind === "top") {
      // back corner slightly lighter — reads as a smooth painted surface
      const g = ctx.createLinearGradient(pts[2 * 2], pts[2 * 2 + 1], pts[7 * 2], pts[7 * 2 + 1]);
      g.addColorStop(0, shadeHsl(b.hsl, Math.min(1.12, shade * 1.07), o.tint, alpha));
      g.addColorStop(1, shadeHsl(b.hsl, shade * 0.98, o.tint, alpha));
      ctx.fillStyle = g;
    } else {
      ctx.fillStyle = shadeHsl(b.hsl, shade, o.tint, alpha);
    }
    ctx.fill();

    if (f.kind === "side" && !b.rot) {
      // contact line at the foot of each side face
      ctx.strokeStyle = `rgba(0,0,0,${0.12 * alpha})`;
      ctx.lineWidth = lw;
      ctx.beginPath();
      // bottom edge: the two corners without the +y bit
      const low = f.v.filter((i) => !(i & 2));
      ctx.moveTo(pts[low[0] * 2], pts[low[0] * 2 + 1]);
      ctx.lineTo(pts[low[1] * 2], pts[low[1] * 2 + 1]);
      ctx.stroke();
    }
  }

  if (!b.rot) {
    // bevel: bright catch-light along the two front edges of the top face
    // and down the front vertical corner
    ctx.lineWidth = lw * (hq ? 1.1 : 1);
    ctx.strokeStyle = lighten(b.hsl, 0.55, 0.75 * alpha);
    ctx.beginPath();
    ctx.moveTo(pts[3 * 2], pts[3 * 2 + 1]);
    ctx.lineTo(pts[7 * 2], pts[7 * 2 + 1]);
    ctx.lineTo(pts[6 * 2], pts[6 * 2 + 1]);
    ctx.stroke();
    if (hq) {
      ctx.strokeStyle = lighten(b.hsl, 0.3, 0.35 * alpha);
      ctx.beginPath();
      ctx.moveTo(pts[7 * 2], pts[7 * 2 + 1]);
      ctx.lineTo(pts[5 * 2], pts[5 * 2 + 1]);
      ctx.stroke();
      // faint back rim of the top face
      ctx.strokeStyle = lighten(b.hsl, 0.4, 0.25 * alpha);
      ctx.beginPath();
      ctx.moveTo(pts[3 * 2], pts[3 * 2 + 1]);
      ctx.lineTo(pts[2 * 2], pts[2 * 2 + 1]);
      ctx.lineTo(pts[6 * 2], pts[6 * 2 + 1]);
      ctx.stroke();
    }
    if (o.edgeGlow) {
      ctx.strokeStyle = o.edgeGlow;
      ctx.globalAlpha = alpha * (o.glow ?? 0.5);
      ctx.lineWidth = lw;
      path4(ctx, 2, 6, 7, 3);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  } else {
    // tumbling piece: crisp outline keeps it readable while it spins
    ctx.strokeStyle = lighten(b.hsl, 0.4, 0.35 * alpha);
    ctx.lineWidth = lw;
    for (const f of FACES) {
      const [nx, ny, nz] = rotate(b.rot, f.n[0], f.n[1], f.n[2]);
      if (nx * CAM[0] + ny * CAM[1] + nz * CAM[2] <= 1e-4) continue;
      path4(ctx, f.v[0], f.v[1], f.v[2], f.v[3]);
      ctx.stroke();
    }
  }
}

/** Top-face polygon of an axis-aligned footprint at height y. */
export function topPoly(view, x, z, w, d, y) {
  const x0 = x - w / 2;
  const x1 = x + w / 2;
  const z0 = z - d / 2;
  const z1 = z + d / 2;
  return [project(view, x0, y, z0), project(view, x1, y, z0), project(view, x1, y, z1), project(view, x0, y, z1)];
}

function polyPath(ctx, p) {
  ctx.beginPath();
  ctx.moveTo(p[0][0], p[0][1]);
  for (let i = 1; i < p.length; i++) ctx.lineTo(p[i][0], p[i][1]);
  ctx.closePath();
}

/**
 * Soft contact shadow of `upper` (footprint) on the top face of `lower`.
 * Two expanded translucent footprints clipped to the lower top face — reads
 * as ambient occlusion around every ledge without any blur cost.
 */
export function drawContactShadow(ctx, view, lower, upper, y, strength = 1) {
  ctx.save();
  polyPath(ctx, topPoly(view, lower.x, lower.z, lower.w, lower.d, y));
  ctx.clip();
  const layers = [
    [0.9, 0.05],
    [0.45, 0.08],
    [0.18, 0.1],
  ];
  for (const [grow, a] of layers) {
    ctx.fillStyle = `rgba(0,0,0,${a * strength})`;
    // shadow leans away from the key light (toward +x / -z)
    polyPath(ctx, topPoly(view, upper.x + grow * 0.35, upper.z - grow * 0.2, upper.w + grow * 2, upper.d + grow * 2, y));
    ctx.fill();
  }
  ctx.restore();
}

/** Expanding outline of a top face — the PERFECT ring. */
export function drawRing(ctx, view, blk, y, k, color, alpha, width) {
  const grow = 1 + k * 0.9;
  const p = topPoly(view, blk.x, blk.z, blk.w + grow, blk.d + grow, y);
  ctx.strokeStyle = color;
  ctx.globalAlpha = alpha;
  ctx.lineWidth = width;
  polyPath(ctx, p);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

/** Glowing wash over a top face (perfect / streak accent). */
export function drawTopGlow(ctx, view, blk, y, alpha) {
  ctx.fillStyle = `rgba(255,255,255,${alpha})`;
  polyPath(ctx, topPoly(view, blk.x, blk.z, blk.w, blk.d, y));
  ctx.fill();
}
