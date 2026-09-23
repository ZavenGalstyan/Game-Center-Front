/** Car Wash Studio — tiny color math for procedural paint shading. */

export function hexToRgb(hex) {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const c255 = (v) => Math.max(0, Math.min(255, Math.round(v)));

export const rgb = (c, a = 1) => (a >= 1 ? `rgb(${c255(c[0])},${c255(c[1])},${c255(c[2])})` : `rgba(${c255(c[0])},${c255(c[1])},${c255(c[2])},${a})`);

export const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const lighten = (c, t) => mix(c, [255, 255, 255], t);
export const darken = (c, t) => mix(c, [0, 0, 0], t);

/** Deeper, slightly more saturated version of a paint color (used for polish). */
export function deepen(c, t = 0.25) {
  const avg = (c[0] + c[1] + c[2]) / 3;
  const sat = c.map((v) => v + (v - avg) * 0.45);
  return darken(sat, t);
}

export function luminance(c) {
  return (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;
}

/** Build the shading ramp for one paint color. */
export function paintLook(hex) {
  const base = hexToRgb(hex);
  const lum = luminance(base);
  // light paints need darker shading to read; dark paints need brighter highlights
  const hi = lum > 0.7 ? 0.35 : lum < 0.12 ? 0.4 : 0.3;
  return {
    hex,
    base,
    lum,
    top: lighten(base, hi * 0.9),
    shoulder: lighten(base, hi + 0.08),
    mid: base,
    low: darken(base, lum > 0.7 ? 0.2 : 0.3),
    bottom: darken(base, lum > 0.7 ? 0.32 : 0.48),
    deep: deepen(base, lum > 0.7 ? 0.05 : 0.18),
    spec: lum > 0.75 ? [255, 255, 255] : lighten(base, 0.75),
  };
}
