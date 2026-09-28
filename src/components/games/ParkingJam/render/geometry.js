/** Parking Jam — vehicle proportions + outline (pure, Node-safe). */

export const CELL = 100;

/** Per-class proportions. Fractions run from the nose (0) to the tail (1). */
const SPEC = {
  compact: { w: 66, len: 0.88, rf: 0.46, rr: 0.36, hood: 0.2, ws: 0.36, roof: 0.72, rw: 0.86, cab: 0.8 },
  sedan: { w: 66, len: 1, rf: 0.36, rr: 0.26, hood: 0.27, ws: 0.42, roof: 0.66, rw: 0.78, cab: 0.8 },
  hatch: { w: 66, len: 0.93, rf: 0.4, rr: 0.26, hood: 0.24, ws: 0.4, roof: 0.78, rw: 0.92, cab: 0.8, spoiler: true },
  coupe: { w: 66, len: 1, rf: 0.42, rr: 0.3, hood: 0.35, ws: 0.52, roof: 0.7, rw: 0.82, cab: 0.72, stripes: true, spoiler: true },
  suv: { w: 72, len: 1, rf: 0.2, rr: 0.16, hood: 0.22, ws: 0.36, roof: 0.84, rw: 0.93, cab: 0.86, rails: true },
  pickup: { w: 70, len: 1, rf: 0.22, rr: 0.1, hood: 0.24, ws: 0.37, roof: 0.53, rw: 0.58, cab: 0.84, bed: true },
  taxi: { w: 66, len: 1, rf: 0.36, rr: 0.26, hood: 0.27, ws: 0.42, roof: 0.66, rw: 0.78, cab: 0.8, sign: true, checker: true },
  van: { w: 74, len: 1, rf: 0.24, rr: 0.1, hood: 0.1, ws: 0.2, roof: 0.95, rw: 0.99, cab: 0.9, panels: 3 },
  minibus: { w: 76, len: 1, rf: 0.22, rr: 0.1, hood: 0.07, ws: 0.16, roof: 0.96, rw: 0.99, cab: 0.9, windows: 5, hatchTop: true },
  limo: { w: 68, len: 1, rf: 0.34, rr: 0.26, hood: 0.2, ws: 0.3, roof: 0.8, rw: 0.88, cab: 0.8, sunroof: true },
  bus: { w: 80, len: 1, rf: 0.14, rr: 0.1, hood: 0.02, ws: 0.08, roof: 0.985, rw: 1, cab: 0.94, ac: true, windows: 8 },
  shuttle: { w: 80, len: 1, rf: 0.2, rr: 0.12, hood: 0.02, ws: 0.09, roof: 0.985, rw: 1, cab: 0.94, ac: true, windows: 8, band: true },
};

/** Geometry for a vehicle class occupying `cells` grid cells. */
export function vehicleGeometry(type, cells) {
  const s = SPEC[type] || SPEC.sedan;
  const L = (cells * CELL - 20) * s.len;
  const W = s.w;
  return { s, L, W, y: (f) => -L / 2 + f * L };
}

/** Rounded body outline with a gently bowed nose and tail. */
export function bodyPath(W, L, rf, rr) {
  const hw = W / 2;
  const hl = L / 2;
  const a = Math.min(hw, rf * W);
  const b = Math.min(hw, rr * W);
  const k = 0.45; // 0 = sharp, 0.55 ≈ circle
  return [
    `M ${-hw} ${-hl + a}`,
    `C ${-hw} ${-hl + a * k} ${-hw + a * k} ${-hl} ${-hw + a} ${-hl - 1}`,
    `Q 0 ${-hl - 4} ${hw - a} ${-hl - 1}`,
    `C ${hw - a * k} ${-hl} ${hw} ${-hl + a * k} ${hw} ${-hl + a}`,
    `L ${hw} ${hl - b}`,
    `C ${hw} ${hl - b * k} ${hw - b * k} ${hl} ${hw - b} ${hl}`,
    `Q 0 ${hl + 2.5} ${-hw + b} ${hl}`,
    `C ${-hw + b * k} ${hl} ${-hw} ${hl - b * k} ${-hw} ${hl - b}`,
    "Z",
  ].join(" ");
}

