/**
 * Last Hope — man-made props: vehicles, furniture, street furniture, camp
 * gear, industrial machinery, bunker equipment, loot containers.
 * All stand on y = 0 and face +z; `v` picks a colour / wear variant.
 */
import { builder } from "./builder.js";

const WOOD = "#7a5a3c";
const WOOD_D = "#5c4330";
const WOOD_L = "#9a7650";
const METAL = "#6d7178";
const METAL_D = "#3c3f44";
const RUST = "#7a4a2e";
const CANVAS = "#6b6a4a";

/* ================================================================ vehicles */
const CAR_COLORS = ["#7d2a26", "#2e4a6b", "#c8c2b4", "#3d5a3a", "#8a7a4a"];
function car(v, o = {}) {
  const B = builder(301 + v);
  const body = o.color || CAR_COLORS[v % CAR_COLORS.length];
  const wreck = !!o.wreck;
  const bc = wreck ? RUST : body;
  // chassis + cabin
  B.box("s", bc, [1.8, 0.62, 4.3], [0, 0.62, 0], { jit: wreck ? 0.18 : 0.03 });
  B.box("s", bc, [1.7, 0.18, 1.2], [0, 1.0, 1.45], { r: [0.08, 0, 0] }); // hood
  B.box("s", bc, [1.65, 0.56, 2.1], [0, 1.18, -0.2], { jit: wreck ? 0.18 : 0.03 });
  // windows
  B.box("g", "#1a2530", [1.66, 0.42, 1.95], [0, 1.2, -0.2]);
  B.box("g", "#1a2530", [1.5, 0.46, 0.06], [0, 1.18, 0.86], { r: [-0.45, 0, 0] });
  // bumpers + lights
  B.box("x", METAL, [1.82, 0.18, 0.14], [0, 0.42, 2.17]);
  B.box("x", METAL, [1.82, 0.18, 0.14], [0, 0.42, -2.17]);
  if (!wreck) {
    B.box("e", "#fff1c8", [0.32, 0.12, 0.04], [0.62, 0.7, 2.16]);
    B.box("e", "#fff1c8", [0.32, 0.12, 0.04], [-0.62, 0.7, 2.16]);
  }
  B.box("e", "#b02020", [0.32, 0.12, 0.04], [0.62, 0.72, -2.16]);
  B.box("e", "#b02020", [0.32, 0.12, 0.04], [-0.62, 0.72, -2.16]);
  // wheels
  for (const [x, z] of [
    [0.82, 1.35],
    [-0.82, 1.35],
    [0.82, -1.35],
    [-0.82, -1.35],
  ]) {
    B.cyl("m", "#1b1b1c", [0.36, 0.36, 0.28, 12], [x, wreck ? 0.3 : 0.36, z], { r: [0, 0, Math.PI / 2] });
    B.cyl("x", "#7a7d82", [0.2, 0.2, 0.3, 8], [x, wreck ? 0.3 : 0.36, z], { r: [0, 0, Math.PI / 2] });
  }
  if (o.police) {
    B.box("s", "#e8e6e0", [1.81, 0.4, 1.7], [0, 0.72, -0.2]); // white doors
    B.box("x", METAL_D, [1.2, 0.12, 0.3], [0, 1.52, -0.1]);
    B.box("e", "#e02828", [0.5, 0.12, 0.26], [-0.32, 1.6, -0.1]);
    B.box("e", "#2850e8", [0.5, 0.12, 0.26], [0.32, 1.6, -0.1]);
  }
  if (wreck) {
    // crumpled panels + broken glass
    B.box("s", "#5a3a26", [0.9, 0.06, 1.2], [0.4, 1.12, 1.4], { r: [0.3, 0.2, 0.15] });
    B.box("m", "#2a2420", [1.5, 0.05, 1.6], [0, 1.47, -0.2]);
  }
  return B.build();
}
function pickupTruck(v) {
  const B = builder(321 + v);
  const c = ["#6a4630", "#3d4f5c", "#5c6648"][v % 3];
  B.box("s", c, [1.95, 0.7, 5.2], [0, 0.72, 0], { jit: 0.12 });
  B.box("s", c, [1.85, 0.75, 1.7], [0, 1.4, 0.75], { jit: 0.1 });
  B.box("g", "#1c2630", [1.86, 0.48, 1.5], [0, 1.45, 0.75]);
  B.box("m", "#2b2622", [1.8, 0.4, 2.2], [0, 1.0, -1.35]); // bed interior
  B.box("s", c, [0.08, 0.45, 2.3], [0.94, 1.27, -1.35]);
  B.box("s", c, [0.08, 0.45, 2.3], [-0.94, 1.27, -1.35]);
  B.box("s", c, [1.95, 0.45, 0.08], [0, 1.27, -2.55]);
  for (const [x, z] of [
    [0.9, 1.7],
    [-0.9, 1.7],
    [0.9, -1.6],
    [-0.9, -1.6],
  ])
    B.cyl("m", "#1b1b1c", [0.42, 0.42, 0.32, 12], [x, 0.42, z], { r: [0, 0, Math.PI / 2] });
  B.box("x", METAL, [1.96, 0.2, 0.16], [0, 0.5, 2.62]);
  // cargo: jerrycans and a tarp
  B.box("s", "#5d6b3a", [0.35, 0.45, 0.2], [0.5, 1.4, -1.9]);
  B.box("s", "#5d6b3a", [0.35, 0.45, 0.2], [0.1, 1.4, -1.9]);
  B.box("m", CANVAS, [1.2, 0.3, 1.0], [-0.3, 1.32, -1.0], { r: [0, 0.3, 0.05], jit: 0.1 });
  return B.build();
}
function loggingTruck(v) {
  const B = builder(331 + v);
  B.box("s", "#8a6a2a", [2.2, 1.0, 2.2], [0, 1.4, 3.1], { jit: 0.1 });
  B.box("g", "#1c2630", [2.21, 0.6, 1.2], [0, 1.65, 3.2]);
  B.box("x", METAL_D, [1.6, 0.4, 8.2], [0, 0.7, -0.6]);
  for (const z of [3.6, 1.6, -1.6, -3.6]) for (const x of [-1, 1]) B.cyl("m", "#1b1b1c", [0.48, 0.48, 0.4, 12], [x * 0.95, 0.48, z], { r: [0, 0, Math.PI / 2] });
  for (const z of [1.5, -0.6, -2.8]) for (const x of [-1, 1]) B.box("x", METAL_D, [0.1, 1.4, 0.1], [x * 1.05, 1.6, z]);
  for (let r = 0; r < 2; r++) for (let k = 0; k < 3 - r; k++) B.cyl("m", k % 2 ? "#5c4330" : "#6a4a32", [0.32, 0.32, 5.6, 9], [(k - (2 - r) / 2) * 0.66, 1.25 + r * 0.56, -0.7], { r: [Math.PI / 2, 0, 0] });
  return B.build();
}

/* ================================================================ camp & forest */
function tent(v) {
  const B = builder(401 + v);
  const c = v ? "#7a5a3a" : "#5c6a3c";
  B.box("m", c, [1.9, 0.06, 3.0], [0.62, 0.78, 0], { r: [0, 0, 0.9], jit: 0.08 });
  B.box("m", c, [1.9, 0.06, 3.0], [-0.62, 0.78, 0], { r: [0, 0, -0.9], jit: 0.08 });
  B.shape("m", c, [[-1.15, 0], [1.15, 0], [0, 1.45]], 0.04, [0, 0, -1.48]);
  B.shape("m", "#2b2a22", [[-0.5, 0], [0.5, 0], [0, 1.0]], 0.05, [0, 0, 1.49]);
  B.cyl("m", WOOD_D, [0.03, 0.03, 1.6, 5], [0, 0.8, 1.55]);
  B.beam("m", "#cfc6a6", [0, 1.5, 1.52], [0, 0.02, 2.4], 0.008);
  B.box("m", "#3a2d22", [0.5, 0.3, 0.35], [0.9, 0.15, 1.6], { r: [0, 0.4, 0] }); // pack
  return B.build();
}
function tentCollapsed(v) {
  const B = builder(411 + v);
  B.ico("m", "#5a6440", [1.1, 1], [0, 0.25, 0], { s: [1.2, 0.28, 1.3], lump: 0.4, jit: 0.1 });
  B.beam("m", WOOD_D, [-1, 0.1, -0.4], [0.9, 0.5, 0.6], 0.035);
  return B.build();
}
function firepitOld() {
  const B = builder(421);
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * 6.28;
    B.ico("r", "#6f6c66", [0.17, 1], [Math.cos(a) * 0.5, 0.1, Math.sin(a) * 0.5], { lump: 0.25, s: [1.2, 0.75, 1], jit: 0.06 });
  }
  B.cyl("m", "#2a2522", [0.38, 0.4, 0.05, 10], [0, 0.03, 0]);
  B.beam("m", "#1f1a17", [-0.3, 0.08, -0.1], [0.3, 0.12, 0.15], 0.06);
  B.beam("m", "#1f1a17", [-0.2, 0.08, 0.25], [0.25, 0.1, -0.2], 0.05);
  return B.build();
}
function logSeat(v) {
  const B = builder(431 + v);
  B.cyl("m", WOOD_D, [0.22, 0.24, 1.7, 9], [0, 0.22, 0], { r: [0, 0, Math.PI / 2], jit: 0.06 });
  B.box("m", "#a07a50", [1.5, 0.03, 0.26], [0, 0.44, 0]);
  return B.build();
}
function leanTo(v) {
  const B = builder(441 + v);
  for (const x of [-1.4, 1.4]) {
    B.cyl("m", WOOD_D, [0.07, 0.08, 2.1, 6], [x, 1.05, 0.9]);
    B.cyl("m", WOOD_D, [0.07, 0.08, 0.8, 6], [x, 0.4, -0.9]);
  }
  for (let k = 0; k < 9; k++) B.cyl("m", k % 2 ? "#6a4d35" : "#5a4230", [0.09, 0.09, 2.2, 6], [-1.45 + k * 0.36, 1.25, 0], { r: [1.0, 0, 0], jit: 0.06 });
  B.box("f", "#3f6a33", [3.2, 0.12, 1.4], [0, 1.4, 0.15], { r: [1.0, 0, 0], jit: 0.14 });
  B.box("m", "#6b5a3a", [1.6, 0.12, 0.8], [0, 0.06, -0.2]); // bedding
  return B.build();
}
function well() {
  const B = builder(451);
  B.cyl("r", "#7a776f", [0.85, 0.9, 0.8, 12], [0, 0.4, 0], { jit: 0.1 });
  B.cyl("m", "#141a1c", [0.66, 0.66, 0.05, 12], [0, 0.78, 0]);
  for (const x of [-0.8, 0.8]) B.cyl("m", WOOD_D, [0.07, 0.07, 1.9, 6], [x, 1.25, 0]);
  B.cyl("m", WOOD, [0.08, 0.08, 1.7, 6], [0, 1.8, 0], { r: [0, 0, Math.PI / 2] });
  B.box("m", "#5a3b2a", [2.0, 0.08, 1.0], [0, 2.3, 0.28], { r: [0.5, 0, 0] });
  B.box("m", "#5a3b2a", [2.0, 0.08, 1.0], [0, 2.3, -0.28], { r: [-0.5, 0, 0] });
  B.cyl("x", METAL, [0.14, 0.12, 0.24, 8], [0.2, 1.25, 0]);
  return B.build();
}
function sign(v) {
  const B = builder(461 + v);
  for (const x of [-0.7, 0.7]) B.cyl("m", WOOD_D, [0.06, 0.07, 1.8, 6], [x, 0.9, 0]);
  B.box("m", WOOD_L, [1.8, 0.6, 0.06], [0, 1.45, 0]);
  B.box("m", "#e8d8a8", [1.4, 0.06, 0.07], [0, 1.55, 0]);
  B.box("m", "#e8d8a8", [1.0, 0.06, 0.07], [0, 1.38, 0]);
  return B.build();
}
function trailSign() {
  const B = builder(471);
  B.cyl("m", WOOD_D, [0.07, 0.08, 2.0, 6], [0, 1.0, 0]);
  B.shape("m", WOOD_L, [[-0.6, -0.12], [0.45, -0.12], [0.62, 0], [0.45, 0.12], [-0.6, 0.12]], 0.05, [0.3, 1.65, 0]);
  B.shape("m", "#8a6a44", [[0.6, -0.11], [-0.45, -0.11], [-0.62, 0], [-0.45, 0.11], [0.6, 0.11]], 0.05, [-0.3, 1.35, 0], { r: [0, 0.4, 0] });
  return B.build();
}
function flag() {
  const B = builder(481);
  B.cyl("x", METAL, [0.035, 0.04, 4.2, 6], [0, 2.1, 0]);
  B.box("f", "#9a2a22", [0.03, 0.8, 1.3], [0, 3.7, 0.66], { wind: { h: 4.2, k: 1.4 }, jit: 0.1 });
  return B.build();
}
function clothesline() {
  const B = builder(491);
  for (const x of [-2, 2]) B.cyl("m", WOOD_D, [0.05, 0.05, 1.8, 6], [x, 0.9, 0]);
  B.beam("m", "#cfc6a6", [-2, 1.7, 0], [2, 1.7, 0], 0.01);
  const cl = ["#c0b090", "#6a7a8a", "#9a4a3a", "#d0d0c8"];
  for (let k = 0; k < 4; k++) B.box("f", cl[k], [0.6, 0.7, 0.02], [-1.3 + k * 0.85, 1.32, 0], { wind: { h: 1.7, k: 0.8 }, jit: 0.08 });
  return B.build();
}
function choppingBlock() {
  const B = builder(501);
  B.cyl("m", WOOD_D, [0.36, 0.4, 0.6, 9], [0, 0.3, 0]);
  B.cyl("m", "#b08a5a", [0.34, 0.34, 0.02, 9], [0, 0.61, 0]);
  B.beam("m", WOOD, [0.05, 0.62, 0], [0.4, 1.1, 0.2], 0.03);
  B.box("x", "#888a8e", [0.06, 0.2, 0.16], [0.05, 0.64, 0], { r: [0, 0.5, 0] });
  return B.build();
}
function sawhorse() {
  const B = builder(511);
  B.box("m", WOOD, [1.6, 0.1, 0.1], [0, 0.85, 0]);
  for (const x of [-0.65, 0.65])
    for (const z of [-1, 1]) B.beam("m", WOOD_D, [x, 0.85, 0], [x + Math.sign(x) * 0.05, 0, z * 0.32], 0.04);
  B.cyl("m", "#6a4a32", [0.18, 0.18, 1.4, 8], [0.2, 1.06, 0], { r: [0, 0, Math.PI / 2] });
  return B.build();
}
function watchtower() {
  const B = builder(521);
  for (const [x, z] of [
    [-1.4, -1.4],
    [1.4, -1.4],
    [-1.4, 1.4],
    [1.4, 1.4],
  ])
    B.beam("m", WOOD_D, [x, 0, z], [x * 0.8, 6, z * 0.8], 0.12);
  for (const y of [2, 4]) {
    B.beam("m", WOOD, [-1.3, y, -1.3], [1.3, y + 0.8, 1.3], 0.06);
    B.beam("m", WOOD, [1.3, y, -1.3], [-1.3, y + 0.8, 1.3], 0.06);
  }
  B.box("m", WOOD_L, [3.0, 0.15, 3.0], [0, 6, 0]);
  for (const [x, z, w, d] of [
    [0, 1.45, 3, 0.08],
    [0, -1.45, 3, 0.08],
    [1.45, 0, 0.08, 3],
    [-1.45, 0, 0.08, 3],
  ])
    B.box("m", WOOD, [w, 1.0, d], [x, 6.6, z]);
  B.cone("m", "#4a3a2a", [2.4, 1.2, 4], [0, 8.2, 0], { r: [0, Math.PI / 4, 0] });
  for (const [x, z] of [
    [-1.2, -1.2],
    [1.2, -1.2],
    [-1.2, 1.2],
    [1.2, 1.2],
  ])
    B.cyl("m", WOOD_D, [0.05, 0.05, 1.6, 5], [x, 6.9, z]);
  return B.build();
}
function dock() {
  const B = builder(531);
  for (let k = 0; k < 10; k++) B.box("m", k % 2 ? WOOD : WOOD_L, [1.6, 0.06, 0.32], [0, 0.32, -1.6 + k * 0.34], { jit: 0.08 });
  for (const z of [-1.6, 1.4]) for (const x of [-0.7, 0.7]) B.cyl("m", WOOD_D, [0.08, 0.08, 0.7, 6], [x, 0.0, z]);
  return B.build();
}

/* ================================================================ houses & interiors */
const STYLE_TRIM = ["#e8e2d4", "#d8d0c0", "#efe8da", "#cfc6b4"];
function porch(v) {
  const B = builder(541 + v);
  const w = v === 9 ? 2.2 : 3.2;
  B.box("m", WOOD, [w, 0.24, 1.6], [0, 0.12, 0], { jit: 0.06 });
  B.box("m", WOOD_D, [w * 0.6, 0.12, 0.45], [0, 0.06, 1.0]);
  if (v !== 9) {
    for (const x of [-w / 2 + 0.1, w / 2 - 0.1]) B.box("m", STYLE_TRIM[v % 4], [0.12, 1.0, 0.12], [x, 0.74, 0.7]);
    B.box("m", STYLE_TRIM[v % 4], [0.06, 0.06, 1.5], [w / 2 - 0.1, 0.95, 0]);
    B.box("m", STYLE_TRIM[v % 4], [0.06, 0.06, 1.5], [-w / 2 + 0.1, 0.95, 0]);
  }
  return B.build();
}
function doorOpen(v) {
  const B = builder(551 + v);
  const c = ["#6a3a2a", "#3a4a5a", "#5a5a3a", "#7a6a5a"][v % 4];
  B.box("m", c, [1.3, 2.2, 0.06], [0.65, 1.1, 0], { jit: 0.06 });
  B.box("x", "#c8a858", [0.06, 0.06, 0.12], [1.15, 1.05, 0]);
  return B.build();
}
function counter(v) {
  const B = builder(561 + v);
  B.box("m", "#8a7058", [3.2, 0.85, 0.62], [0, 0.42, 0]);
  B.box("s", "#c8c2b8", [3.25, 0.06, 0.66], [0, 0.88, 0]);
  B.box("x", "#9aa0a6", [0.6, 0.04, 0.4], [-0.8, 0.91, 0]);
  for (let k = 0; k < 4; k++) B.box("m", "#6e5844", [0.72, 0.6, 0.02], [-1.2 + k * 0.8, 0.45, 0.32]);
  B.box("s", "#a8a090", [0.28, 0.3, 0.2], [1.0, 1.05, -0.1]); // microwave-ish
  B.cyl("s", "#d8d0c0", [0.06, 0.06, 0.24, 8], [0.4, 1.03, 0.05]);
  return B.build();
}
function table(v) {
  const B = builder(571 + v);
  B.box("m", WOOD_L, [1.5, 0.06, 1.0], [0, 0.76, 0]);
  for (const [x, z] of [
    [-0.66, -0.42],
    [0.66, -0.42],
    [-0.66, 0.42],
    [0.66, 0.42],
  ])
    B.box("m", WOOD_D, [0.06, 0.74, 0.06], [x, 0.37, z]);
  B.cyl("s", "#d0c8b8", [0.12, 0.08, 0.04, 10], [0.3, 0.8, 0.1]);
  B.cyl("s", "#8a6a3a", [0.04, 0.04, 0.14, 6], [-0.2, 0.86, -0.15]);
  return B.build();
}
function chair(v) {
  const B = builder(581 + v);
  B.box("m", WOOD, [0.46, 0.05, 0.46], [0, 0.46, 0]);
  B.box("m", WOOD, [0.46, 0.5, 0.05], [0, 0.72, -0.21]);
  for (const [x, z] of [
    [-0.2, -0.2],
    [0.2, -0.2],
    [-0.2, 0.2],
    [0.2, 0.2],
  ])
    B.box("m", WOOD_D, [0.04, 0.46, 0.04], [x, 0.23, z]);
  return B.build();
}
function sofa(v) {
  const B = builder(591 + v);
  const c = ["#6a4a4a", "#4a5a6a", "#5a6a4a", "#7a6a5a"][v % 4];
  B.box("m", c, [2.2, 0.42, 0.85], [0, 0.21, 0], { jit: 0.06 });
  B.box("m", c, [2.2, 0.55, 0.22], [0, 0.6, -0.32], { jit: 0.06 });
  for (const x of [-1.0, 1.0]) B.box("m", c, [0.22, 0.32, 0.85], [x, 0.56, 0]);
  B.box("m", "#c8b890", [0.5, 0.3, 0.12], [-0.5, 0.58, -0.15], { r: [-0.3, 0.2, 0] });
  return B.build();
}
function rug(v) {
  const B = builder(601 + v);
  const c = ["#7a3a2a", "#3a4a6a", "#6a5a3a", "#5a3a5a"][v % 4];
  B.box("m", c, [2.2, 0.015, 1.5], [0, 0.008, 0], { jit: 0.05 });
  B.box("m", "#c8b890", [1.9, 0.016, 1.2], [0, 0.01, 0], { jit: 0.04 });
  B.box("m", c, [1.6, 0.017, 0.9], [0, 0.012, 0], { jit: 0.05 });
  return B.build();
}
function tv(v) {
  const B = builder(611 + v);
  B.box("m", WOOD_D, [1.0, 0.45, 0.36], [0, 0.22, 0]);
  B.box("s", "#1a1a1c", [0.9, 0.55, 0.06], [0, 0.78, -0.05]);
  B.box("g", "#20303a", [0.82, 0.47, 0.02], [0, 0.78, -0.015]);
  return B.build();
}
function bed(v) {
  const B = builder(621 + v);
  const blanket = ["#6a3a3a", "#3a5a6a", "#5a6a3a", "#7a5a7a"][v % 4];
  B.box("m", WOOD_D, [1.7, 0.3, 2.3], [0, 0.15, 0]);
  B.box("m", WOOD_D, [1.7, 0.85, 0.08], [0, 0.42, -1.12]);
  B.box("m", "#e0d8c8", [1.55, 0.2, 2.1], [0, 0.4, 0.05]);
  B.box("m", blanket, [1.58, 0.06, 1.35], [0, 0.52, 0.4], { r: [0.02, 0, 0.01], jit: 0.08 });
  B.box("m", "#f0ece0", [0.6, 0.12, 0.38], [-0.4, 0.56, -0.8]);
  B.box("m", "#f0ece0", [0.6, 0.12, 0.38], [0.4, 0.56, -0.8]);
  return B.build();
}
function lamp(v) {
  const B = builder(631 + v);
  B.cyl("x", METAL_D, [0.16, 0.18, 0.04, 10], [0, 0.02, 0]);
  B.cyl("x", METAL_D, [0.02, 0.02, 1.5, 6], [0, 0.75, 0]);
  B.cyl("m", "#d8c8a0", [0.16, 0.24, 0.3, 10, true], [0, 1.55, 0]);
  B.sph("e", "#ffd9a0", [0.06, 6, 5], [0, 1.5, 0]);
  return B.build();
}
function gunCase() {
  const B = builder(641);
  B.box("m", WOOD_D, [0.4, 1.8, 1.2], [0, 0.9, 0]);
  B.box("g", "#2a3a40", [0.02, 1.4, 1.0], [0.21, 1.0, 0]);
  return B.build();
}

/* ================================================================ street */
function streetlight(v) {
  const B = builder(651 + v);
  B.cyl("x", "#4a4e54", [0.08, 0.12, 6, 8], [0, 3, 0]);
  B.beam("x", "#4a4e54", [0, 5.8, 0], [0, 6.1, 1.6], 0.05);
  B.box("x", "#3a3d42", [0.3, 0.14, 0.6], [0, 6.05, 1.75]);
  B.box("e", "#ffe2a8", [0.24, 0.04, 0.5], [0, 5.97, 1.75]);
  return B.build();
}
function mailbox(v) {
  const B = builder(661 + v);
  B.box("m", WOOD_D, [0.08, 1.0, 0.08], [0, 0.5, 0]);
  B.box("s", ["#3a5a7a", "#7a3a2a", "#3a3a3a"][v % 3], [0.26, 0.24, 0.5], [0, 1.1, 0.05]);
  B.box("s", "#c03030", [0.02, 0.16, 0.06], [0.14, 1.2, -0.1]);
  return B.build();
}
function trashCan() {
  const B = builder(671);
  B.cyl("x", "#5a6066", [0.28, 0.24, 0.85, 12], [0, 0.42, 0]);
  B.cyl("x", "#4a5056", [0.3, 0.3, 0.05, 12], [0, 0.87, 0], { r: [0.2, 0, 0.1] });
  return B.build();
}
function hydrant() {
  const B = builder(681);
  B.cyl("s", "#b8302a", [0.12, 0.15, 0.6, 9], [0, 0.3, 0]);
  B.sph("s", "#b8302a", [0.12, 8, 5], [0, 0.6, 0]);
  B.cyl("s", "#b8302a", [0.05, 0.05, 0.4, 6], [0, 0.42, 0], { r: [0, 0, Math.PI / 2] });
  return B.build();
}
function powerPole() {
  const B = builder(691);
  B.cyl("m", "#4e3b2a", [0.13, 0.17, 8, 7], [0, 4, 0]);
  B.box("m", "#4e3b2a", [2.2, 0.12, 0.12], [0, 7.4, 0]);
  for (const x of [-0.9, 0, 0.9]) B.cyl("s", "#d8d0c0", [0.04, 0.05, 0.14, 6], [x, 7.53, 0]);
  B.cyl("x", "#6a6e74", [0.18, 0.18, 0.55, 8], [0.2, 6.6, 0.2]);
  return B.build();
}
function barrier(v) {
  const B = builder(701 + v);
  B.shape("m", "#b9b5aa", [[-0.32, 0], [0.32, 0], [0.12, 0.25], [0.1, 0.8], [-0.1, 0.8], [-0.12, 0.25]], 3, [0, 0, 0], { r: [0, Math.PI / 2, 0], jit: 0.06 });
  for (let k = 0; k < 4; k++) B.box("m", k % 2 ? "#d8a428" : "#2a2a2a", [0.7, 0.14, 0.33], [-1.1 + k * 0.72, 0.55, 0], { r: [0, 0, 0] });
  return B.build();
}
function cone(v) {
  const B = builder(711 + v);
  B.box("m", "#d8601e", [0.4, 0.04, 0.4], [0, 0.02, 0]);
  B.cone("s", "#e8701e", [0.16, 0.65, 10], [0, 0.36, 0]);
  B.cyl("s", "#f0f0e8", [0.09, 0.12, 0.1, 10], [0, 0.32, 0]);
  return B.build();
}
function swings() {
  const B = builder(721);
  for (const x of [-2, 2]) {
    B.beam("x", "#5a6a7a", [x, 0, -0.6], [x, 2.4, 0], 0.06);
    B.beam("x", "#5a6a7a", [x, 0, 0.6], [x, 2.4, 0], 0.06);
  }
  B.cyl("x", "#5a6a7a", [0.06, 0.06, 4, 8], [0, 2.4, 0], { r: [0, 0, Math.PI / 2] });
  for (const x of [-1, 1]) {
    B.beam("x", "#8a8e92", [x - 0.25, 2.4, 0], [x - 0.25, 0.55, 0.15], 0.012);
    B.beam("x", "#8a8e92", [x + 0.25, 2.4, 0], [x + 0.25, 0.55, 0.15], 0.012);
    B.box("s", "#c84a2a", [0.6, 0.05, 0.25], [x, 0.53, 0.15]);
  }
  return B.build();
}
function slide() {
  const B = builder(731);
  B.box("s", "#d8a428", [0.7, 0.06, 3.2], [0, 1.0, 0.4], { r: [0.55, 0, 0] });
  for (const x of [-0.3, 0.3]) B.box("x", "#5a6a7a", [0.06, 2, 0.06], [x, 1, -1.2]);
  B.box("s", "#3a7ab8", [0.8, 0.08, 0.8], [0, 1.9, -1.25]);
  for (let k = 0; k < 5; k++) B.box("x", "#5a6a7a", [0.6, 0.04, 0.06], [0, 0.3 + k * 0.35, -1.5]);
  return B.build();
}
function bench() {
  const B = builder(741);
  for (let k = 0; k < 3; k++) B.box("m", WOOD, [1.8, 0.05, 0.14], [0, 0.46, -0.15 + k * 0.16]);
  for (let k = 0; k < 2; k++) B.box("m", WOOD, [1.8, 0.14, 0.05], [0, 0.66 + k * 0.17, -0.27], { r: [-0.2, 0, 0] });
  for (const x of [-0.75, 0.75]) B.box("x", METAL_D, [0.06, 0.46, 0.5], [x, 0.23, 0]);
  return B.build();
}
function gazebo() {
  const B = builder(751);
  B.cyl("m", WOOD_L, [2.6, 2.6, 0.18, 8], [0, 0.09, 0]);
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * 6.28 + Math.PI / 4;
    B.box("m", "#e8e2d4", [0.14, 2.6, 0.14], [Math.cos(a) * 2.5, 1.4, Math.sin(a) * 2.5]);
  }
  B.cone("m", "#5a3a2a", [3.4, 1.6, 8], [0, 3.5, 0]);
  return B.build();
}
function hedge(v) {
  const B = builder(761 + v);
  for (let k = 0; k < 4; k++) B.ico("f", k % 2 ? "#3f6a30" : "#4a7838", [0.62, 1], [-1.05 + k * 0.7, 0.55, 0], { s: [1, 0.95, 0.75], lump: 0.25, jit: 0.12, wind: { h: 1.2, k: 0.2 } });
  return B.build();
}
function trashBag(v) {
  const B = builder(771 + v);
  B.ico("s", "#1e2226", [0.32, 1], [0, 0.26, 0], { s: [1, 0.85, 0.9], lump: 0.25 });
  B.ico("s", "#26302a", [0.25, 1], [0.38, 0.2, 0.15], { s: [1, 0.8, 1], lump: 0.25 });
  return B.build();
}
function roadSign(v) {
  const B = builder(781 + v);
  for (const x of [-1.2, 1.2]) B.cyl("x", "#6a6e74", [0.05, 0.05, 2.6, 6], [x, 1.3, 0]);
  B.box("s", v ? "#2a5a3a" : "#2a4a7a", [2.8, 1.1, 0.06], [0, 2.4, 0]);
  B.box("s", "#e8e8e0", [2.2, 0.08, 0.07], [0, 2.6, 0]);
  B.box("s", "#e8e8e0", [1.6, 0.08, 0.07], [0, 2.3, 0]);
  B.box("s", "#e8e8e0", [0.3, 0.3, 0.07], [1.0, 2.25, 0], { r: [0, 0, Math.PI / 4] });
  return B.build();
}
function gasCanopy() {
  const B = builder(791);
  B.box("s", "#d8d4cc", [14, 0.7, 8], [0, 4.7, 0]);
  B.box("s", "#b8302a", [14.1, 0.25, 8.1], [0, 4.5, 0]);
  B.box("e", "#fff4d8", [12, 0.04, 0.4], [0, 4.33, -2]);
  B.box("e", "#fff4d8", [12, 0.04, 0.4], [0, 4.33, 2]);
  for (const x of [-6, 6]) B.box("s", "#d8d4cc", [0.5, 4.4, 0.5], [x, 2.2, 0]);
  return B.build();
}
function gasPump() {
  const B = builder(801);
  B.box("s", "#c8c4bc", [0.7, 0.2, 1.1], [0, 0.1, 0]);
  B.box("s", "#b8302a", [0.55, 1.5, 0.8], [0, 0.95, 0]);
  B.box("g", "#203038", [0.56, 0.3, 0.5], [0, 1.4, 0]);
  B.beam("m", "#1a1a1a", [0.28, 1.0, 0.3], [0.4, 0.4, 0.5], 0.03);
  return B.build();
}

/* ================================================================ industrial */
const CONT_COLORS = ["#8a3a2a", "#2a5a7a", "#3a6a3a", "#c88a2a", "#5a5a6a"];
function shippingContainer(v, h = 1, open = false) {
  const B = builder(811 + v);
  const c = CONT_COLORS[v % 5];
  for (let k = 0; k < h; k++) {
    const y = k * 2.6;
    const cc = k ? CONT_COLORS[(v + 2) % 5] : c;
    B.box("s", cc, [2.44, 2.55, 6.06], [0, y + 1.28, 0], { jit: 0.05 });
    for (let r = 0; r < 14; r++) {
      B.box("s", cc, [2.5, 2.3, 0.08], [0, y + 1.28, -2.8 + r * 0.43], { jit: 0.06, s: [1, 1, 1] });
    }
    B.box("x", "#3a3a3a", [2.5, 0.12, 6.1], [0, y + 0.06, 0]);
    B.box("x", "#3a3a3a", [2.5, 0.12, 6.1], [0, y + 2.52, 0]);
    // doors (end at +z)
    B.box("s", cc, [1.18, 2.4, 0.06], [0.6, y + 1.28, 3.05]);
    B.box("s", cc, [1.18, 2.4, 0.06], [-0.6, y + 1.28, 3.05]);
    for (const x of [-0.3, 0.3, -0.9, 0.9]) B.box("x", "#5a5a5a", [0.04, 2.3, 0.05], [x, y + 1.28, 3.09]);
  }
  if (open) {
    B.box("m", "#141414", [2.3, 2.4, 0.04], [0, 1.28, 3.0]);
    B.box("s", CONT_COLORS[v % 5], [1.18, 2.4, 0.06], [1.6, 1.28, 3.7], { r: [0, -1.4, 0] });
    B.box("m", WOOD, [1.0, 0.8, 1.0], [-0.5, 0.4, 2.0]);
  }
  return B.build();
}
function forklift() {
  const B = builder(821);
  B.box("s", "#d8a428", [1.3, 0.9, 2.2], [0, 0.75, -0.2]);
  B.box("s", "#2a2a2a", [1.25, 0.6, 0.8], [0, 0.6, -1.1]);
  for (const x of [-0.6, 0.6]) {
    B.box("x", METAL_D, [0.06, 2.2, 0.06], [x, 1.1, 0.95]);
    B.box("x", METAL_D, [0.08, 0.05, 1.1], [x * 0.5, 0.12, 1.5]);
  }
  for (const [x, z] of [
    [0.62, 0.6],
    [-0.62, 0.6],
    [0.62, -0.9],
    [-0.62, -0.9],
  ])
    B.cyl("m", "#1a1a1a", [0.3, 0.3, 0.25, 10], [x, 0.3, z], { r: [0, 0, Math.PI / 2] });
  for (const [x, z] of [
    [-0.55, 0.3],
    [0.55, 0.3],
    [-0.55, -0.6],
    [0.55, -0.6],
  ])
    B.box("x", METAL_D, [0.05, 1.3, 0.05], [x, 1.85, z]);
  B.box("x", METAL_D, [1.2, 0.06, 1.0], [0, 2.5, -0.15]);
  return B.build();
}
function pallets(v) {
  const B = builder(831 + v);
  for (let k = 0; k < 3; k++) B.box("m", k % 2 ? WOOD_L : WOOD, [1.2, 0.14, 1.2], [0, 0.07 + k * 0.15, 0], { jit: 0.08 });
  if (v % 2 === 0) B.box("m", "#9a8058", [1.0, 0.7, 1.0], [0, 0.8, 0], { jit: 0.06 });
  else B.box("m", "#3a6a8a", [0.9, 0.5, 0.9], [0.05, 0.7, 0], { jit: 0.06 });
  return B.build();
}
function rack(v) {
  const B = builder(841 + v);
  for (const z of [-2.8, 0, 2.8]) for (const x of [-0.55, 0.55]) B.box("x", "#2a5a9a", [0.08, 3.6, 0.08], [x, 1.8, z]);
  for (const y of [0.15, 1.4, 2.6]) for (const x of [-0.55, 0.55]) B.box("x", "#d86a1e", [0.08, 0.12, 5.7], [x, y, 0]);
  const goods = ["#9a8058", "#7a6a4a", "#3a6a8a", "#5a7a4a", "#8a5a3a"];
  for (const y of [0.25, 1.5, 2.7])
    for (let k = 0; k < 4; k++) {
      if ((k + y * 3 + v) % 5 === 0) continue;
      B.box("m", goods[(k + Math.round(y) + v) % 5], [0.95, 0.75 + (k % 2) * 0.2, 1.1], [0, y + 0.42, -2.1 + k * 1.4], { jit: 0.08 });
    }
  return B.build();
}
function rollup() {
  const B = builder(851);
  B.box("x", "#6a6e74", [8.4, 0.6, 0.5], [0, 6.0, 0]);
  B.cyl("x", "#7a7e84", [0.3, 0.3, 8.0, 10], [0, 5.5, 0], { r: [0, 0, Math.PI / 2] });
  B.box("s", "#d8a428", [0.15, 5.6, 0.12], [-4.1, 2.8, 0.25]);
  B.box("s", "#d8a428", [0.15, 5.6, 0.12], [4.1, 2.8, 0.25]);
  return B.build();
}
function gate() {
  const B = builder(861);
  for (const s of [-1, 1]) {
    B.box("x", METAL, [0.12, 2.4, 0.12], [s * 6, 1.2, 0]);
    B.box("x", METAL, [0.08, 0.08, 5.8], [s * 6, 2.2, s * 2.9], { r: [0, 0, 0] });
    B.box("x", METAL, [0.08, 0.08, 5.8], [s * 6, 0.2, s * 2.9]);
    B.box("g", "#9aa4a8", [0.02, 2.0, 5.8], [s * 6, 1.2, s * 2.9]);
  }
  return B.build();
}
function deskOffice() {
  const B = builder(871);
  B.box("m", "#6a5a4a", [1.6, 0.06, 0.8], [0, 0.75, 0]);
  B.box("m", "#5a4a3a", [0.5, 0.72, 0.75], [0.5, 0.36, 0]);
  B.box("s", "#1a1a1c", [0.5, 0.35, 0.04], [-0.2, 1.0, -0.2]);
  B.box("e", "#3a6a8a", [0.44, 0.28, 0.02], [-0.2, 1.0, -0.17]);
  B.box("m", "#d8d0c0", [0.3, 0.02, 0.22], [0.2, 0.79, 0.1]);
  return B.build();
}
function monitorBank() {
  const B = builder(881);
  B.box("x", METAL_D, [1.8, 0.8, 0.5], [0, 0.4, 0]);
  for (let k = 0; k < 3; k++)
    for (let r = 0; r < 2; r++) {
      B.box("s", "#1a1a1c", [0.52, 0.36, 0.08], [-0.58 + k * 0.58, 1.05 + r * 0.4, -0.1]);
      B.box("e", ["#3a8a5a", "#2a5a8a", "#8a3a2a"][(k + r) % 3], [0.46, 0.3, 0.02], [-0.58 + k * 0.58, 1.05 + r * 0.4, -0.05]);
    }
  return B.build();
}
function loadingDock() {
  const B = builder(891);
  B.box("m", "#8a8780", [12, 1.1, 3.2], [0, 0.55, 0], { jit: 0.05 });
  for (const x of [-4, 0, 4]) {
    B.box("m", "#1a1a1a", [0.6, 0.5, 0.25], [x - 1.2, 0.7, 1.7]);
    B.box("m", "#1a1a1a", [0.6, 0.5, 0.25], [x + 1.2, 0.7, 1.7]);
  }
  for (let k = 0; k < 12; k++) B.box("m", k % 2 ? "#d8a428" : "#1a1a1a", [1, 0.08, 0.2], [-5.5 + k, 1.12, 1.55]);
  return B.build();
}
function fuelTank() {
  const B = builder(901);
  B.cyl("s", "#c8c4bc", [3.5, 3.5, 7.5, 24], [0, 3.75, 0], { jit: 0.03, grad: [0, 7.5, 0.75] });
  B.cyl("s", "#a8a49c", [3.55, 3.55, 0.25, 24], [0, 7.5, 0]);
  B.cyl("s", "#b8302a", [3.52, 3.52, 0.6, 24], [0, 5.5, 0]);
  for (let k = 0; k < 16; k++) B.box("x", METAL_D, [0.6, 0.05, 0.05], [3.6, 0.3 + k * 0.45, 0]);
  B.box("x", METAL_D, [0.05, 7.4, 0.05], [3.9, 3.7, -0.28]);
  B.box("x", METAL_D, [0.05, 7.4, 0.05], [3.9, 3.7, 0.28]);
  return B.build();
}
function pipes() {
  const B = builder(911);
  for (const z of [-0.18, 0.18]) B.cyl("x", z < 0 ? "#8a6a3a" : "#5a6a7a", [0.18, 0.18, 8, 12], [0, 1.2 + z * 0.6, z], { r: [0, 0, Math.PI / 2] });
  for (const x of [-3.5, 0, 3.5]) {
    B.box("x", METAL_D, [0.12, 1.4, 0.7], [x, 0.7, 0]);
  }
  B.cyl("x", "#b8302a", [0.25, 0.25, 0.1, 10], [1.5, 1.35, 0.25], { r: [Math.PI / 2, 0, 0] });
  return B.build();
}
function crane() {
  const B = builder(921);
  for (const [x, z] of [
    [-9, -4],
    [9, -4],
    [-9, 4],
    [9, 4],
  ])
    B.box("s", "#d8a428", [0.6, 11, 0.6], [x, 5.5, z], { jit: 0.04 });
  for (const z of [-4, 4]) B.box("s", "#d8a428", [19, 0.9, 0.7], [0, 11.2, z]);
  for (const x of [-9, 9]) B.box("s", "#d8a428", [0.7, 0.7, 8.6], [x, 11.2, 0]);
  B.box("x", METAL_D, [2.2, 1.0, 9.0], [2, 10.6, 0]);
  B.beam("x", "#2a2a2a", [2, 10.1, 0], [2, 4.5, 0], 0.04);
  B.box("x", "#d8a428", [0.4, 0.5, 0.3], [2, 4.3, 0]);
  return B.build();
}
function bunkerHatch() {
  const B = builder(931);
  B.box("m", "#7a7a74", [6, 1.4, 4.4], [0, 0.7, 0], { jit: 0.05 });
  B.box("x", "#4a5048", [3.2, 0.12, 2.4], [0, 1.45, 0.2]);
  for (let k = 0; k < 8; k++) B.box("m", k % 2 ? "#d8a428" : "#1a1a1a", [0.75, 0.04, 0.3], [-2.6 + k * 0.75, 1.42, -1.95]);
  B.box("m", "#2a2a2a", [2.0, 0.6, 0.06], [0, 1.0, 2.23]);
  B.box("e", "#ff4a2a", [0.12, 0.12, 0.04], [1.3, 1.1, 2.24]);
  return B.build();
}
function tireStack() {
  const B = builder(941);
  for (let k = 0; k < 4; k++) B.tor("m", "#1c1c1c", [0.38, 0.15, 6, 14], [0, 0.15 + k * 0.3, 0], { r: [Math.PI / 2, 0, 0] });
  return B.build();
}
function debris(v) {
  const B = builder(951 + v);
  for (let k = 0; k < 5; k++) {
    const a = k * 1.4 + v;
    B.box(k % 2 ? "x" : "m", k % 2 ? RUST : "#7a776f", [0.4 + B.rnd() * 0.5, 0.06 + B.rnd() * 0.1, 0.3 + B.rnd() * 0.4], [Math.cos(a) * 0.6, 0.06, Math.sin(a) * 0.5], { r: [B.rnd() * 0.3, a, B.rnd() * 0.3] });
  }
  return B.build();
}
function floodlight() {
  const B = builder(961);
  B.cyl("x", "#5a5e64", [0.1, 0.14, 7, 8], [0, 3.5, 0]);
  B.box("x", "#3a3d42", [1.4, 0.12, 0.2], [0, 7, 0]);
  for (const x of [-0.5, 0.5]) {
    B.box("x", "#3a3d42", [0.45, 0.35, 0.3], [x, 6.8, 0.15], { r: [0.6, 0, 0] });
    B.box("e", "#f0f4ff", [0.38, 0.28, 0.04], [x, 6.72, 0.28], { r: [0.6, 0, 0] });
  }
  return B.build();
}

/* ================================================================ bunker */
function elevator() {
  const B = builder(971);
  B.box("x", "#5a5e64", [2.8, 3.2, 0.4], [0, 1.6, 0.2]);
  B.box("x", "#8a8e94", [1.0, 2.6, 0.06], [-0.52, 1.3, 0.42]);
  B.box("x", "#8a8e94", [1.0, 2.6, 0.06], [0.52, 1.3, 0.42]);
  B.box("e", "#3aff7a", [0.12, 0.2, 0.04], [1.2, 1.4, 0.43]);
  for (let k = 0; k < 8; k++) B.box("m", k % 2 ? "#d8a428" : "#1a1a1a", [0.35, 0.04, 0.8], [-1.2 + k * 0.35, 0.02, 1.0]);
  return B.build();
}
function sandbags() {
  const B = builder(981);
  for (let r = 0; r < 3; r++) for (let k = 0; k < 5 - (r % 2); k++) B.ico("m", "#8a7a58", [0.32, 1], [-1.15 + k * 0.58 + (r % 2) * 0.29, 0.18 + r * 0.3, 0], { s: [1, 0.48, 0.62], lump: 0.15, jit: 0.08 });
  return B.build();
}
function warningSign() {
  const B = builder(991);
  B.box("s", "#d8a428", [0.8, 0.8, 0.04], [0, 2.0, 0], { r: [0, 0, Math.PI / 4] });
  B.box("s", "#1a1a1a", [0.08, 0.36, 0.05], [0, 2.05, 0.01]);
  return B.build();
}
function bunk() {
  const B = builder(1001);
  for (const [x, z] of [
    [-0.45, -1.0],
    [0.45, -1.0],
    [-0.45, 1.0],
    [0.45, 1.0],
  ])
    B.box("x", "#4a5a4a", [0.06, 1.8, 0.06], [x, 0.9, z]);
  for (const y of [0.45, 1.4]) {
    B.box("x", "#4a5a4a", [0.95, 0.08, 2.05], [0, y, 0]);
    B.box("m", "#6a6a52", [0.85, 0.14, 1.95], [0, y + 0.1, 0]);
    B.box("m", "#d8d0c0", [0.6, 0.1, 0.35], [0, y + 0.22, -0.75]);
  }
  return B.build();
}
function tableMetal() {
  const B = builder(1011);
  B.box("x", "#6a6e74", [1.6, 0.05, 1.0], [0, 0.78, 0]);
  for (const [x, z] of [
    [-0.72, -0.44],
    [0.72, -0.44],
    [-0.72, 0.44],
    [0.72, 0.44],
  ])
    B.box("x", METAL_D, [0.05, 0.78, 0.05], [x, 0.39, z]);
  B.box("m", "#3a4a3a", [0.4, 0.12, 0.3], [0.3, 0.86, 0.1]);
  B.box("m", "#d8d0c0", [0.3, 0.02, 0.4], [-0.3, 0.81, -0.1]);
  return B.build();
}
function labTable() {
  const B = builder(1021);
  B.box("s", "#e8e6e0", [2.4, 0.9, 1.1], [0, 0.45, 0]);
  B.box("s", "#2a2c2e", [2.45, 0.05, 1.15], [0, 0.92, 0]);
  for (let k = 0; k < 5; k++) B.cyl("g", ["#3aff7a", "#4ab8ff", "#ff4a8a"][k % 3], [0.05, 0.07, 0.25, 8], [-0.9 + k * 0.42, 1.07, 0.1]);
  B.box("x", "#6a6e74", [0.5, 0.4, 0.4], [0.8, 1.15, -0.25]);
  B.box("e", "#3aff7a", [0.3, 0.15, 0.02], [0.8, 1.2, -0.04]);
  return B.build();
}
function labTank() {
  const B = builder(1031);
  B.cyl("x", "#5a5e64", [0.75, 0.8, 0.3, 16], [0, 0.15, 0]);
  B.cyl("e", "#3aff7a", [0.62, 0.62, 2.1, 16], [0, 1.35, 0]);
  B.cyl("g", "#cfefff", [0.68, 0.68, 2.3, 16], [0, 1.45, 0]);
  B.cyl("x", "#5a5e64", [0.75, 0.75, 0.25, 16], [0, 2.7, 0]);
  return B.build();
}
function gurney() {
  const B = builder(1041);
  B.box("x", "#8a8e94", [0.7, 0.08, 1.9], [0, 0.8, 0]);
  B.box("m", "#e0e0d8", [0.65, 0.08, 1.8], [0, 0.88, 0]);
  for (const [x, z] of [
    [-0.3, -0.85],
    [0.3, -0.85],
    [-0.3, 0.85],
    [0.3, 0.85],
  ])
    B.box("x", METAL_D, [0.04, 0.8, 0.04], [x, 0.4, z]);
  return B.build();
}
function generator(v) {
  const B = builder(1051 + v);
  B.box("s", "#4a5a4a", [3.0, 1.6, 2.0], [0, 0.8, 0], { jit: 0.05 });
  B.cyl("x", "#6a6e74", [0.5, 0.5, 2.6, 14], [0, 1.7, 0], { r: [0, 0, Math.PI / 2] });
  B.box("x", METAL_D, [0.8, 0.9, 0.06], [0.9, 1.0, 1.02]);
  B.box("e", "#ffb02a", [0.2, 0.12, 0.02], [0.8, 1.2, 1.06]);
  B.box("e", "#3aff7a", [0.12, 0.12, 0.02], [1.1, 1.2, 1.06]);
  for (let k = 0; k < 5; k++) B.box("x", "#2a2a2a", [0.05, 0.9, 1.8], [-1.0 + k * 0.2, 0.9, 0]);
  return B.build();
}
function switchboard() {
  const B = builder(1061);
  B.box("x", "#5a6058", [2.4, 2.2, 0.5], [0, 1.1, 0]);
  for (let k = 0; k < 6; k++) B.box("e", k % 3 ? "#ff3a2a" : "#3aff7a", [0.1, 0.1, 0.03], [-0.9 + k * 0.36, 1.7, 0.26]);
  B.box("x", "#2a2a2a", [0.4, 0.8, 0.12], [0.6, 1.0, 0.28]);
  B.box("s", "#b8302a", [0.08, 0.4, 0.08], [0.6, 1.2, 0.36], { r: [0.5, 0, 0] });
  return B.build();
}
function fuelDrums() {
  const B = builder(1071);
  for (const [x, z] of [
    [-0.4, -0.3],
    [0.4, -0.3],
    [0, 0.4],
  ])
    B.cyl("s", "#3a5a3a", [0.36, 0.36, 0.95, 12], [x, 0.48, z]);
  return B.build();
}
function shelving() {
  const B = builder(1081);
  for (const z of [-1.5, 1.5]) for (const x of [-0.4, 0.4]) B.box("x", METAL_D, [0.05, 2.2, 0.05], [x, 1.1, z]);
  for (const y of [0.3, 1.1, 1.9]) {
    B.box("x", "#6a6e74", [0.9, 0.04, 3.1], [0, y, 0]);
    for (let k = 0; k < 4; k++) B.box("m", ["#4a5a3a", "#6a5a3a", "#3a4a3a"][k % 3], [0.6, 0.4, 0.55], [0, y + 0.22, -1.1 + k * 0.72], { jit: 0.06 });
  }
  return B.build();
}
function pillar() {
  const B = builder(1091);
  B.box("m", "#8a8a84", [1.4, 3.4, 1.4], [0, 1.7, 0], { jit: 0.04, grad: [0, 3.4, 0.7] });
  for (let k = 0; k < 4; k++) B.box("m", k % 2 ? "#d8a428" : "#1a1a1a", [1.45, 0.25, 1.45], [0, 0.12 + k * 0.25, 0]);
  return B.build();
}
function cage() {
  const B = builder(1101);
  for (let k = 0; k < 11; k++) B.box("x", METAL_D, [0.05, 2.6, 0.05], [-2 + k * 0.4, 1.3, 0]);
  B.box("x", METAL_D, [4.1, 0.08, 0.08], [0, 2.6, 0]);
  B.box("x", METAL_D, [4.1, 0.08, 0.08], [0, 0.1, 0]);
  return B.build();
}

/* ================================================================ containers */
function crate(v) {
  const B = builder(1201 + v);
  B.box("m", WOOD, [1.0, 0.8, 0.8], [0, 0.4, 0], { jit: 0.08 });
  for (const y of [0.1, 0.7]) B.box("m", WOOD_D, [1.04, 0.1, 0.84], [0, y, 0]);
  for (const x of [-0.45, 0.45]) B.box("m", WOOD_D, [0.1, 0.8, 0.84], [x, 0.4, 0]);
  return B.build();
}
function backpackPile(v) {
  const B = builder(1211 + v);
  B.box("m", "#4a5a3a", [0.5, 0.6, 0.3], [0, 0.3, 0], { r: [0.2, 0.3, 0] });
  B.box("m", "#3a3a2a", [0.4, 0.2, 0.12], [0, 0.3, 0.18], { r: [0.2, 0.3, 0] });
  B.box("m", "#7a3a2a", [0.45, 0.35, 0.28], [0.35, 0.17, -0.25], { r: [0, -0.4, 1.4] });
  return B.build();
}
function hunterChest() {
  const B = builder(1221);
  B.box("m", WOOD_D, [1.2, 0.6, 0.8], [0, 0.3, 0], { jit: 0.06 });
  B.cyl("m", WOOD_D, [0.4, 0.4, 1.2, 10, false], [0, 0.6, 0], { r: [0, 0, Math.PI / 2], s: [1, 1, 1] });
  for (const x of [-0.4, 0.4]) B.box("x", "#3a3a3a", [0.06, 0.66, 0.84], [x, 0.33, 0]);
  B.box("x", "#c8a858", [0.12, 0.14, 0.04], [0, 0.6, 0.42]);
  return B.build();
}
function fridge() {
  const B = builder(1231);
  B.box("s", "#e8e6e0", [0.9, 1.9, 0.76], [0, 0.95, 0]);
  B.box("m", "#c8c6c0", [0.92, 0.02, 0.78], [0, 1.25, 0]);
  B.box("x", "#8a8e94", [0.04, 0.4, 0.05], [0.36, 1.55, 0.4]);
  B.box("x", "#8a8e94", [0.04, 0.4, 0.05], [0.36, 0.9, 0.4]);
  return B.build();
}
function cabinet(v) {
  const B = builder(1241 + v);
  B.box("m", "#8a6a4a", [1.1, 1.0, 0.56], [0, 0.5, 0]);
  B.box("s", "#c8c2b8", [1.14, 0.05, 0.6], [0, 1.02, 0]);
  B.box("m", "#7a5a3a", [0.52, 0.85, 0.02], [-0.27, 0.5, 0.29]);
  B.box("m", "#7a5a3a", [0.52, 0.85, 0.02], [0.27, 0.5, 0.29]);
  return B.build();
}
function wardrobe(v) {
  const B = builder(1251 + v);
  B.box("m", "#6a4a32", [1.2, 2.0, 0.64], [0, 1.0, 0], { jit: 0.05 });
  B.box("m", "#5a3c28", [0.02, 1.8, 0.66], [0, 1.0, 0]);
  B.box("x", "#c8a858", [0.03, 0.12, 0.04], [0.08, 1.1, 0.33]);
  B.box("x", "#c8a858", [0.03, 0.12, 0.04], [-0.08, 1.1, 0.33]);
  return B.build();
}
function toolbox() {
  const B = builder(1261);
  B.box("s", "#b8302a", [0.84, 0.4, 0.5], [0, 0.2, 0]);
  B.box("s", "#a82a24", [0.86, 0.1, 0.52], [0, 0.42, 0]);
  B.box("x", "#2a2a2a", [0.4, 0.06, 0.06], [0, 0.52, 0]);
  return B.build();
}
function medcab() {
  const B = builder(1271);
  B.box("s", "#e8e8e4", [0.76, 0.8, 0.36], [0, 0.4, 0]);
  B.box("e", "#d02828", [0.3, 0.08, 0.02], [0, 0.55, 0.19]);
  B.box("e", "#d02828", [0.08, 0.3, 0.02], [0, 0.55, 0.19]);
  return B.build();
}
function desk() {
  const B = builder(1281);
  B.box("m", "#6a4a32", [1.5, 0.06, 0.8], [0, 0.76, 0]);
  B.box("m", "#5a3c28", [0.45, 0.72, 0.75], [0.5, 0.36, 0]);
  B.box("m", "#5a3c28", [0.06, 0.72, 0.75], [-0.7, 0.36, 0]);
  B.box("m", "#d8c8a0", [0.5, 0.02, 0.35], [-0.2, 0.8, 0.1], { r: [0, 0.3, 0] });
  B.cyl("x", "#3a3a2a", [0.08, 0.1, 0.35, 8], [-0.5, 0.96, -0.2]);
  return B.build();
}
function shelf(v) {
  const B = builder(1291 + v);
  B.box("x", "#8a8e94", [2.6, 0.1, 0.7], [0, 0.05, 0]);
  B.box("x", "#6a6e74", [2.6, 1.8, 0.06], [0, 0.9, 0]);
  const goods = ["#c84a2a", "#2a7ac8", "#e8c82a", "#3ab85a", "#e8e0d0", "#8a3ac8"];
  for (const y of [0.25, 0.85, 1.45]) {
    B.box("x", "#9aa0a6", [2.6, 0.04, 0.7], [0, y - 0.06, 0]);
    for (let k = 0; k < 9; k++) if ((k + y * 7) % 4 > 0.6) B.box("s", goods[(k + Math.round(y * 3)) % 6], [0.22, 0.3, 0.25], [-1.15 + k * 0.29, y + 0.1, 0.18], { jit: 0.1 });
  }
  return B.build();
}
function locker(v) {
  const B = builder(1301 + v);
  const c = v === 1 ? "#4a5a3a" : "#6a7a88";
  B.box("s", c, [0.9, 1.9, 0.6], [0, 0.95, 0]);
  B.box("m", "#2a2a2a", [0.02, 1.8, 0.62], [0, 0.95, 0]);
  for (const x of [-0.22, 0.22]) for (let k = 0; k < 4; k++) B.box("m", "#3a3a3a", [0.3, 0.02, 0.01], [x, 1.6 + k * 0.05, 0.31]);
  return B.build();
}
function metalCrate(v) {
  const B = builder(1311 + v);
  B.box("s", v % 2 ? "#4a5a4a" : "#5a6068", [1.2, 0.9, 0.9], [0, 0.45, 0]);
  for (const x of [-0.5, 0.5]) B.box("x", "#2a2a2a", [0.06, 0.92, 0.92], [x, 0.45, 0]);
  B.box("s", "#d8a428", [0.4, 0.15, 0.02], [0, 0.6, 0.46]);
  return B.build();
}
function chemBarrel(v) {
  const B = builder(1321 + v);
  B.cyl("s", v % 2 ? "#2a5aa8" : "#d8a428", [0.38, 0.38, 1.0, 14], [0, 0.5, 0]);
  for (const y of [0.25, 0.75]) B.tor("x", "#3a3a3a", [0.38, 0.03, 4, 16], [0, y, 0], { r: [Math.PI / 2, 0, 0] });
  B.box("e", "#ff8a1a", [0.25, 0.25, 0.02], [0, 0.55, 0.38], { r: [0, 0, Math.PI / 4] });
  return B.build();
}
function safe() {
  const B = builder(1331);
  B.box("x", "#2a2e34", [0.9, 1.0, 0.9], [0, 0.5, 0]);
  B.cyl("x", "#8a8e94", [0.12, 0.12, 0.06, 12], [0.1, 0.6, 0.46], { r: [Math.PI / 2, 0, 0] });
  B.box("x", "#8a8e94", [0.06, 0.3, 0.06], [-0.25, 0.55, 0.47]);
  return B.build();
}
function milCrate(v) {
  const B = builder(1341 + v);
  B.box("m", "#4a5a32", [1.4, 0.7, 0.8], [0, 0.35, 0], { jit: 0.06 });
  B.box("m", "#3a4a28", [1.44, 0.08, 0.84], [0, 0.7, 0]);
  B.box("m", "#e8e0c8", [0.6, 0.12, 0.02], [0, 0.4, 0.41]);
  for (const x of [-0.6, 0.6]) B.box("x", "#2a2a2a", [0.08, 0.3, 0.86], [x, 0.4, 0]);
  return B.build();
}
function labCabinet() {
  const B = builder(1351);
  B.box("s", "#e8e6e0", [1.2, 1.6, 0.56], [0, 0.8, 0]);
  B.box("g", "#cfefff", [1.1, 0.9, 0.02], [0, 1.05, 0.29]);
  for (let k = 0; k < 6; k++) B.cyl("e", ["#3aff7a", "#4ab8ff", "#ff4a8a"][k % 3], [0.04, 0.04, 0.18, 6], [-0.4 + (k % 3) * 0.4, 0.8 + Math.floor(k / 3) * 0.4, 0.1]);
  return B.build();
}
function weaponRack() {
  const B = builder(1361);
  B.box("m", "#3a4a28", [1.8, 1.8, 0.4], [0, 0.9, -0.1]);
  for (let k = 0; k < 4; k++) {
    B.box("x", "#1e2022", [0.08, 1.1, 0.12], [-0.6 + k * 0.4, 1.0, 0.15]);
    B.box("x", "#1e2022", [0.1, 0.25, 0.1], [-0.6 + k * 0.4, 0.75, 0.2]);
  }
  return B.build();
}
function footlocker() {
  const B = builder(1371);
  B.box("m", "#4a5a32", [1.1, 0.55, 0.64], [0, 0.28, 0]);
  B.box("x", "#2a2a2a", [1.12, 0.06, 0.66], [0, 0.5, 0]);
  B.box("x", "#c8a858", [0.12, 0.1, 0.04], [0, 0.42, 0.33]);
  return B.build();
}
function drum() {
  const B = builder(1381);
  B.cyl("s", "#a82a1e", [0.38, 0.38, 1.0, 14], [0, 0.5, 0]);
  for (const y of [0.25, 0.75]) B.tor("x", "#3a3a3a", [0.38, 0.03, 4, 16], [0, y, 0], { r: [Math.PI / 2, 0, 0] });
  B.box("e", "#ffd02a", [0.32, 0.26, 0.02], [0, 0.55, 0.385]);
  B.box("s", "#1a1a1a", [0.08, 0.12, 0.03], [0, 0.55, 0.39]);
  return B.build();
}

/* ================================================================ resources (man-made) */
function scrap(v) {
  const B = builder(1401 + v);
  for (let k = 0; k < 7; k++) {
    const a = k * 0.9 + v;
    B.box("x", k % 3 ? RUST : "#6a6e74", [0.8 + B.rnd() * 0.6, 0.05, 0.5 + B.rnd() * 0.4], [Math.cos(a) * 0.35, 0.12 + k * 0.08, Math.sin(a) * 0.3], { r: [B.rnd() * 0.5, a, B.rnd() * 0.5], jit: 0.12 });
  }
  B.beam("x", "#5a5e64", [-0.7, 0.1, 0.2], [0.6, 0.6, -0.3], 0.06);
  B.cyl("x", RUST, [0.18, 0.18, 0.5, 8], [0.4, 0.2, 0.4], { r: [0.3, 0, 1.2] });
  return B.build();
}
function machine(v) {
  const B = builder(1411 + v);
  const c = ["#5a6a5a", "#6a5a4a", "#4a5a6a"][v % 3];
  B.box("s", c, [1.6, 1.1, 1.2], [0, 0.55, 0], { jit: 0.08 });
  B.cyl("x", "#6a6e74", [0.35, 0.35, 1.5, 12], [0, 1.25, 0], { r: [0, 0, Math.PI / 2] });
  B.box("x", METAL_D, [0.5, 0.4, 0.06], [0.4, 0.7, 0.62]);
  B.cyl("x", "#3a3a3a", [0.25, 0.25, 0.12, 12], [-0.85, 0.6, 0], { r: [0, 0, Math.PI / 2] });
  B.beam("x", "#2a2a2a", [-0.8, 0.6, 0], [-1.0, 0.0, 0.4], 0.03);
  return B.build();
}

export const PROPS = {
  car: (v) => car(v),
  wreck: (v) => car(v, { wreck: true }),
  police_car: (v) => car(v, { police: true, color: "#1e2226" }),
  pickup_truck: pickupTruck,
  logging_truck: loggingTruck,
  tent,
  tent_collapsed: tentCollapsed,
  firepit_old: firepitOld,
  log_seat: logSeat,
  lean_to: leanTo,
  well,
  sign,
  trail_sign: trailSign,
  flag,
  clothesline,
  chopping_block: choppingBlock,
  sawhorse,
  watchtower,
  dock,
  porch,
  door_open: doorOpen,
  counter,
  table,
  chair,
  sofa,
  rug,
  tv,
  bed,
  lamp,
  gun_case: gunCase,
  streetlight,
  mailbox,
  trash_can: trashCan,
  hydrant,
  power_pole: powerPole,
  barrier,
  cone,
  swings,
  slide,
  bench,
  gazebo,
  hedge,
  trash_bag: trashBag,
  road_sign: roadSign,
  gas_canopy: gasCanopy,
  gas_pump: gasPump,
  shipping_container: (v, p) => shippingContainer(v, p?.h || 1, !!p?.c),
  forklift,
  pallets,
  rack,
  rollup,
  gate,
  desk_office: deskOffice,
  monitor_bank: monitorBank,
  loading_dock: loadingDock,
  fuel_tank: fuelTank,
  pipes,
  crane,
  bunker_hatch: bunkerHatch,
  tire_stack: tireStack,
  debris,
  floodlight,
  elevator,
  sandbags,
  warning_sign: warningSign,
  bunk,
  table_metal: tableMetal,
  lab_table: labTable,
  lab_tank: labTank,
  gurney,
  generator,
  switchboard,
  fuel_drums: fuelDrums,
  shelving,
  pillar,
  cage,
  // containers
  crate,
  backpack_pile: backpackPile,
  hunter_chest: hunterChest,
  fridge,
  cabinet,
  wardrobe,
  toolbox,
  medcab,
  desk,
  shelf,
  locker: (v) => locker(0 + v * 0),
  bunker_locker: () => locker(1),
  metal_crate: metalCrate,
  chem_barrel: chemBarrel,
  safe,
  mil_crate: milCrate,
  lab_cabinet: labCabinet,
  weapon_rack: weaponRack,
  footlocker,
  drum,
  scrap,
  machine,
  stove: () => {
    const B = builder(1501);
    B.box("x", "#2a2a2a", [0.8, 0.7, 0.7], [0, 0.35, 0]);
    B.cyl("x", "#2a2a2a", [0.08, 0.08, 1.6, 6], [0.2, 1.4, -0.2]);
    B.box("e", "#ff6a1a", [0.3, 0.12, 0.02], [0, 0.3, 0.36]);
    return B.build();
  },
};
/** Containers drawn by a prop placed at the same spot (vehicles, shipping containers). */
export const CONTAINER_NO_MODEL = new Set(["police_car", "car_trunk", "container"]);
