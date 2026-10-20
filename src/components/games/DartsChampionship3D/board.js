/**
 * Darts Championship 3D — dartboard geometry and scoring (pure, no Three.js).
 * Board coordinates are millimetres from the bull centre, +x right, +y up,
 * as seen by the thrower. The 3D board texture is drawn from the same tables,
 * so what you see is exactly what is scored.
 */

/** Clockwise from the top. */
export const ORDER = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];

/** Standard regulation radii (mm). */
export const R = {
  bull: 6.35, // inner bull (50)
  outerBull: 15.9, // outer bull (25)
  trebleIn: 99,
  trebleOut: 107,
  doubleIn: 162,
  doubleOut: 170, // scoring edge
  board: 225.5, // whole board incl. number ring
};
export const SEG = 18; // degrees per segment

/** Clockwise angle (deg, 0 = straight up) of a board point. */
export const angleOf = (x, y) => ((Math.atan2(x, y) * 180) / Math.PI + 360) % 360;

/** Number of the segment containing angle `deg`. */
export const segmentAt = (deg) => ORDER[Math.floor((((deg + SEG / 2) % 360) + 360) % 360 / SEG) % ORDER.length];

/**
 * Score of a dart landing at (x, y) mm.
 * → { score, mult, num, ring, label, double }   ring: inner-bull | outer-bull | single | treble | double | miss
 * `double` is true for anything that may finish a leg (doubles and the inner bull).
 */
export function scoreAt(x, y) {
  const r = Math.hypot(x, y);
  if (r <= R.bull) return { score: 50, mult: 2, num: 25, ring: "inner-bull", label: "BULL", double: true };
  if (r <= R.outerBull) return { score: 25, mult: 1, num: 25, ring: "outer-bull", label: "25", double: false };
  if (r > R.doubleOut) return { score: 0, mult: 0, num: 0, ring: "miss", label: "MISS", double: false };
  const num = segmentAt(angleOf(x, y));
  if (r >= R.trebleIn && r <= R.trebleOut) return { score: num * 3, mult: 3, num, ring: "treble", label: `T${num}`, double: false };
  if (r >= R.doubleIn) return { score: num * 2, mult: 2, num, ring: "double", label: `D${num}`, double: true };
  return { score: num, mult: 1, num, ring: "single", label: `${num}`, double: false };
}

/** Aim point (mm) for a named target: "T20", "D16", "S19" (big outer single), "25", "BULL". */
export function targetPoint(label) {
  if (label === "BULL") return { x: 0, y: 0 };
  if (label === "25") return { x: 0, y: (R.bull + R.outerBull) / 2 };
  const kind = label[0];
  const num = Number(label.slice(1));
  const r = kind === "T" ? (R.trebleIn + R.trebleOut) / 2 : kind === "D" ? (R.doubleIn + R.doubleOut) / 2 : (R.trebleOut + R.doubleIn) / 2;
  const a = (ORDER.indexOf(num) * SEG * Math.PI) / 180;
  return { x: r * Math.sin(a), y: r * Math.cos(a) };
}
