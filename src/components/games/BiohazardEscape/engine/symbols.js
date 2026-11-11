/**
 * Vector symbols (100×100 SVG path data, even-odd fill) shared by the 3D
 * panel textures and the React clue panels, plus the named colours the color
 * panels use — so what a clue shows is exactly what the device shows.
 */
const ring = (cx, cy, r) => `M${cx - r} ${cy}A${r} ${r} 0 1 0 ${cx + r} ${cy}A${r} ${r} 0 1 0 ${cx - r} ${cy}Z`;
const pt = (cx, cy, r, a) => `${(cx + Math.cos(a) * r).toFixed(2)} ${(cy + Math.sin(a) * r).toFixed(2)}`;

function radiation() {
  let d = ring(50, 50, 9);
  for (let k = 0; k < 3; k++) {
    const a0 = -Math.PI / 2 + (k * 2 * Math.PI) / 3 - Math.PI / 6;
    const a1 = a0 + Math.PI / 3;
    d += `M${pt(50, 50, 15, a0)}L${pt(50, 50, 42, a0)}A42 42 0 0 1 ${pt(50, 50, 42, a1)}L${pt(50, 50, 15, a1)}A15 15 0 0 0 ${pt(50, 50, 15, a0)}Z`;
  }
  return d;
}
function biohazard() {
  // three crescents opening outward around a ring
  let d = "";
  for (let k = 0; k < 3; k++) {
    const a = -Math.PI / 2 + (k * 2 * Math.PI) / 3;
    const [x, y] = [50 + Math.cos(a) * 19, 50 + Math.sin(a) * 19];
    const [hx, hy] = [50 + Math.cos(a) * 28, 50 + Math.sin(a) * 28];
    d += ring(x, y, 20) + ring(hx, hy, 15);
  }
  d += ring(50, 50, 9);
  return d;
}

export const SYMBOLS = {
  biohazard: { name: "Biohazard", d: biohazard() },
  radiation: { name: "Radiation", d: radiation() },
  flame: { name: "Flame", d: "M50 6C58 26 80 36 77 62A27 27 0 0 1 23 62C21 46 33 40 36 27C42 38 46 40 48 33C50 25 46 16 50 6Z" },
  drop: { name: "Drop", d: "M50 8C50 8 20 46 20 64A30 30 0 0 0 80 64C80 46 50 8 50 8Z" },
  skull: {
    name: "Skull",
    d: `M50 10C28 10 16 26 16 44C16 56 22 62 28 66V82H72V66C78 62 84 56 84 44C84 26 72 10 50 10Z${ring(36, 44, 8)}${ring(64, 44, 8)}M44 64L50 54L56 64Z`,
  },
};

export const COLORS = {
  red: "#ff3b30",
  green: "#38e05a",
  blue: "#3a7dff",
  yellow: "#ffd23a",
  white: "#f2f6ff",
  cyan: "#3ae6ff",
  orange: "#ff8c2a",
  violet: "#b05aff",
};
export const COLOR_NAMES = { red: "Red", green: "Green", blue: "Blue", yellow: "Yellow", white: "White", cyan: "Cyan", orange: "Orange", violet: "Violet" };
