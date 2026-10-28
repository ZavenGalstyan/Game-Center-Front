/**
 * Last Hope — base-building models, one per piece × tier.
 * Edge pieces (walls, doors) run 2 m along local z with their thickness on
 * local x; cell pieces sit centred in their 2 × 2 m cell.
 * The door leaf is a separate model hinged at its own origin so it can swing.
 */
import { builder } from "./builder.js";

const LOG = "#6a4a32";
const LOG2 = "#5a3e2a";

function wall(t) {
  const B = builder(2001 + t);
  if (t === 0) {
    for (let k = 0; k < 6; k++) {
      const z = -0.84 + k * 0.336;
      const h = 2.35 + ((k * 7) % 3) * 0.12;
      B.cyl("m", k % 2 ? LOG : LOG2, [0.16, 0.18, h, 7], [0, h / 2, z], { grad: [0, h, 0.65], jit: 0.07 });
      B.cone("m", "#7a5a3c", [0.16, 0.38, 7], [0, h + 0.19, z]);
    }
    for (const y of [0.7, 1.8]) B.box("m", "#4e3826", [0.14, 0.16, 2.05], [0.17, y, 0], { jit: 0.06 });
    B.beam("m", "#7a6a4a", [0.2, 0.68, -0.9], [0.2, 1.82, 0.9], 0.02);
  } else if (t === 1) {
    for (let r = 0; r < 6; r++)
      for (let k = 0; k < 4; k++) {
        const off = r % 2 ? 0.25 : 0;
        const z = -0.75 + k * 0.5 + off;
        if (z > 0.95) continue;
        B.box("r", ["#8a867e", "#7a766e", "#9a958c"][(r + k) % 3], [0.38, 0.4, 0.47], [0, 0.22 + r * 0.42, z], { jit: 0.07 });
      }
    B.box("m", "#6a665e", [0.42, 0.12, 2.0], [0, 2.6, 0]);
  } else {
    B.box("x", "#4a4e54", [0.12, 2.6, 0.12], [0, 1.3, -0.94]);
    B.box("x", "#4a4e54", [0.12, 2.6, 0.12], [0, 1.3, 0.94]);
    for (let k = 0; k < 9; k++) B.box("x", k % 2 ? "#7a7e84" : "#6a6e74", [0.06, 2.5, 0.22], [0.02 + (k % 2) * 0.03, 1.27, -0.88 + k * 0.22], { jit: 0.05 });
    for (const y of [0.35, 1.3, 2.25]) B.box("x", "#3a3e44", [0.16, 0.1, 2.0], [0.06, y, 0]);
    B.box("x", "#8a4a2a", [0.08, 0.5, 0.6], [0.09, 1.7, 0.3], { jit: 0.2 });
  }
  return B.build();
}
function doorFrame(t) {
  const B = builder(2011 + t);
  const c = t === 0 ? LOG2 : t === 1 ? "#7a766e" : "#4a4e54";
  const b = t === 1 ? "r" : t === 2 ? "x" : "m";
  for (const z of [-0.95, 0.95]) B.box(b, c, [0.32, 2.6, 0.12], [0, 1.3, z]);
  B.box(b, c, [0.32, 0.3, 2.02], [0, 2.45, 0]);
  return B.build();
}
/** Door leaf hinged at its origin, extending along +z. */
function doorLeaf(t) {
  const B = builder(2021 + t);
  if (t === 0) {
    for (let k = 0; k < 5; k++) B.box("m", k % 2 ? "#7a5a3c" : "#6a4a32", [0.08, 2.2, 0.34], [0, 1.1, 0.17 + k * 0.35], { jit: 0.06 });
    B.box("m", "#4e3826", [0.1, 0.14, 1.7], [0.06, 0.6, 0.86]);
    B.box("m", "#4e3826", [0.1, 0.14, 1.7], [0.06, 1.7, 0.86]);
    B.beam("m", "#4e3826", [0.07, 0.62, 0.1], [0.07, 1.68, 1.6], 0.05);
  } else if (t === 1) {
    B.box("m", "#5a3e2a", [0.1, 2.2, 1.72], [0, 1.1, 0.86]);
    for (const y of [0.4, 1.1, 1.8]) B.box("x", "#3a3a3a", [0.12, 0.12, 1.74], [0.02, y, 0.86]);
  } else {
    B.box("x", "#5a5e64", [0.1, 2.2, 1.72], [0, 1.1, 0.86]);
    B.box("x", "#3a3e44", [0.12, 0.1, 1.7], [0.02, 0.5, 0.86]);
    B.box("x", "#3a3e44", [0.12, 0.1, 1.7], [0.02, 1.7, 0.86]);
    B.box("x", "#3a3e44", [0.12, 1.4, 0.1], [0.02, 1.1, 0.86]);
  }
  B.box("x", "#c8a858", [0.14, 0.08, 0.08], [0.06, 1.05, 1.55]);
  return B.build();
}
function floor(t) {
  const B = builder(2031 + t);
  if (t === 0) for (let k = 0; k < 6; k++) B.box("m", k % 2 ? "#8a6a48" : "#7a5c3e", [0.32, 0.1, 1.96], [-0.82 + k * 0.33, 0.05, 0], { jit: 0.06 });
  else if (t === 1) for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) B.box("r", (i + j) % 2 ? "#8a867e" : "#7e7a72", [0.96, 0.12, 0.96], [-0.49 + i * 0.98, 0.06, -0.49 + j * 0.98], { jit: 0.05 });
  else {
    B.box("x", "#6a6e74", [1.98, 0.08, 1.98], [0, 0.04, 0]);
    for (let k = 0; k < 7; k++) B.box("x", "#5a5e64", [1.9, 0.02, 0.05], [0, 0.085, -0.85 + k * 0.28]);
  }
  return B.build();
}
function barricade(t) {
  const B = builder(2041 + t);
  if (t === 0) {
    B.cyl("m", LOG2, [0.12, 0.12, 1.8, 7], [0, 0.35, 0], { r: [0, 0, Math.PI / 2] });
    for (let k = 0; k < 5; k++) {
      const x = -0.7 + k * 0.35;
      B.beam("m", LOG, [x, 0.0, -0.32], [x + 0.08, 1.15, 0.4], 0.07, { r2: 0.02 });
      B.beam("m", LOG2, [x + 0.1, 0.0, 0.32], [x + 0.02, 1.1, -0.42], 0.07, { r2: 0.02 });
    }
  } else {
    B.box("x", "#4a4e54", [1.7, 0.12, 0.12], [0, 0.3, 0]);
    for (let k = 0; k < 6; k++) {
      const x = -0.72 + k * 0.29;
      B.beam("x", "#7a7e84", [x, 0.0, -0.3], [x + 0.05, 1.15, 0.38], 0.04, { r2: 0.005 });
      B.beam("x", "#6a6e74", [x + 0.08, 0.0, 0.3], [x, 1.1, -0.4], 0.04, { r2: 0.005 });
    }
  }
  return B.build();
}
function campfire() {
  const B = builder(2051);
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * 6.28;
    B.ico("r", k % 2 ? "#6f6c66" : "#5f5c58", [0.16, 1], [Math.cos(a) * 0.48, 0.1, Math.sin(a) * 0.48], { lump: 0.25, s: [1.2, 0.75, 1], jit: 0.06 });
  }
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * 6.28;
    B.beam("m", k % 2 ? "#3a2a1e" : "#4a3626", [Math.cos(a) * 0.38, 0.05, Math.sin(a) * 0.38], [Math.cos(a) * 0.05, 0.55, Math.sin(a) * 0.05], 0.055);
  }
  B.cyl("e", "#ff7a2a", [0.22, 0.28, 0.06, 10], [0, 0.05, 0]);
  return B.build();
}
function workbench(t) {
  const B = builder(2061 + t);
  const top = t ? "#6a6e74" : "#8a6a48";
  B.box(t ? "x" : "m", top, [1.7, 0.1, 0.85], [0, 0.88, 0]);
  for (const [x, z] of [
    [-0.75, -0.35],
    [0.75, -0.35],
    [-0.75, 0.35],
    [0.75, 0.35],
  ])
    B.box("m", "#5a3e2a", [0.1, 0.86, 0.1], [x, 0.43, z]);
  B.box("m", "#6a4a32", [1.5, 0.06, 0.7], [0, 0.25, 0]);
  B.box("m", "#7a5a3c", [1.7, 0.9, 0.06], [0, 1.38, -0.4]); // pegboard
  B.box("x", "#8a8e94", [0.4, 0.04, 0.06], [-0.4, 1.5, -0.36]);
  B.box("m", "#5a3e2a", [0.05, 0.3, 0.05], [0.2, 1.45, -0.36]);
  B.box("x", "#8a8e94", [0.18, 0.08, 0.06], [0.2, 1.62, -0.36]);
  B.box("m", "#a07a50", [0.5, 0.06, 0.2], [0.3, 0.96, 0.15], { r: [0, 0.4, 0] });
  if (t) {
    B.box("x", "#3a5a7a", [0.24, 0.22, 0.3], [-0.6, 1.04, 0.1]);
    B.cyl("x", "#5a5e64", [0.04, 0.04, 0.4, 6], [-0.6, 1.1, 0.3], { r: [Math.PI / 2, 0, 0] });
    B.box("s", "#b8302a", [0.4, 0.2, 0.25], [0.55, 0.36, 0.05]);
  }
  return B.build();
}
function chest(t) {
  const B = builder(2071 + t);
  if (t === 0) {
    B.box("m", "#7a5a3c", [1.2, 0.62, 0.78], [0, 0.31, 0], { jit: 0.06 });
    B.box("m", "#6a4a32", [1.24, 0.12, 0.82], [0, 0.66, 0]);
    for (const x of [-0.42, 0.42]) B.box("x", "#3a3a3a", [0.06, 0.74, 0.84], [x, 0.36, 0]);
    B.box("x", "#c8a858", [0.12, 0.14, 0.04], [0, 0.5, 0.41]);
  } else {
    B.box("x", "#5a6a5a", [1.2, 0.95, 0.78], [0, 0.48, 0]);
    B.box("m", "#2a2a2a", [0.02, 0.85, 0.8], [0, 0.48, 0]);
    B.box("x", "#c8a858", [0.06, 0.16, 0.04], [0.12, 0.6, 0.41]);
  }
  return B.build();
}
function collector() {
  const B = builder(2081);
  B.cyl("s", "#2a5a8a", [0.4, 0.4, 0.9, 14], [0, 0.45, 0]);
  for (const y of [0.2, 0.7]) B.tor("x", "#3a3a3a", [0.4, 0.025, 4, 16], [0, y, 0], { r: [Math.PI / 2, 0, 0] });
  for (const [x, z] of [
    [-0.7, -0.7],
    [0.7, -0.7],
    [-0.7, 0.7],
    [0.7, 0.7],
  ])
    B.beam("m", "#5a3e2a", [x, 0, z], [x * 0.95, 1.5, z * 0.95], 0.04);
  B.cone("m", "#4a6a8a", [1.0, 0.5, 8], [0, 1.25, 0], { r: [Math.PI, 0, 0], jit: 0.1 });
  return B.build();
}
function bedroll() {
  const B = builder(2091);
  B.box("m", "#4a5a3a", [0.85, 0.12, 1.9], [0, 0.06, 0], { jit: 0.08 });
  B.cyl("m", "#5a6a48", [0.18, 0.18, 0.85, 10], [0, 0.18, -0.85], { r: [0, 0, Math.PI / 2] });
  B.box("m", "#7a3a2a", [0.8, 0.06, 1.0], [0, 0.15, 0.4], { r: [0.04, 0, 0.02], jit: 0.08 });
  return B.build();
}

export const STRUCT_MODELS = {
  wall,
  door: doorFrame,
  doorLeaf,
  floor,
  barricade,
  campfire: () => campfire(),
  workbench,
  chest,
  collector: () => collector(),
  bed: () => bedroll(),
};
