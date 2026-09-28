/** Parking Jam — tiny color helpers for the SVG art. */

export const PAINT = {
  blue: "#2f7de1",
  red: "#e0413a",
  green: "#3dae5a",
  yellow: "#f5c330",
  orange: "#f28a2e",
  white: "#eef1f4",
  black: "#2e333b",
  purple: "#8a55d6",
  teal: "#22b0aa",
  silver: "#b8c0c9",
};

function parse(hex) {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.replace(/./g, "$&$&") : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const hex = (r, g, b) => `#${[r, g, b].map((x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, "0")).join("")}`;

/** amt > 0 mixes toward white, < 0 toward black. */
export function shade(color, amt) {
  const [r, g, b] = parse(color);
  const t = amt < 0 ? 0 : 255;
  const p = Math.abs(amt);
  return hex(r + (t - r) * p, g + (t - g) * p, b + (t - b) * p);
}

export function mix(a, b, t) {
  const [r1, g1, b1] = parse(a);
  const [r2, g2, b2] = parse(b);
  return hex(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t);
}

export function luminance(color) {
  const [r, g, b] = parse(color);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}
