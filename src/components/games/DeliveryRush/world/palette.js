/**
 * Delivery Rush — colour helpers.
 *
 * Every static city mesh is vertex-coloured, so the whole district renders in a
 * handful of draw calls while still giving each building its own facade tint.
 * These helpers turn a zone palette (plain hex strings) into the linear-ish RGB
 * triples the mesh accumulator writes into the colour attribute.
 *
 * Colours are authored in sRGB hex. Three.js r152+ renders with colour
 * management on, so values are converted to linear here once, at bake time.
 */

const cache = new Map();

/** "#a1b2c3" -> [r, g, b] in linear space, memoised. */
export function rgb(hex) {
  let c = cache.get(hex);
  if (c) return c;
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.replace(/./g, (d) => d + d) : h, 16);
  c = [srgbToLinear(((n >> 16) & 255) / 255), srgbToLinear(((n >> 8) & 255) / 255), srgbToLinear((n & 255) / 255)];
  cache.set(hex, c);
  return c;
}

function srgbToLinear(v) {
  return v < 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

/** Scale a linear triple — >1 lightens, <1 darkens. Returns a new array. */
export function shade(c, k) {
  return [clamp01(c[0] * k), clamp01(c[1] * k), clamp01(c[2] * k)];
}

/** Blend two linear triples. */
export function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** Small deterministic per-object variation so repeated meshes never band. */
export function jitter(c, rng, amount = 0.06) {
  const k = 1 + (rng() - 0.5) * 2 * amount;
  return shade(c, k);
}

export function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Pick from a palette array of hex strings by index (wraps). */
export function pick(list, i) {
  return rgb(list[((i % list.length) + list.length) % list.length]);
}
