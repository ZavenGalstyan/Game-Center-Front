/**
 * Last Hope — nature models (stylised low-poly, painterly vertex colour):
 * pines, oaks, birches, stumps, bushes, berry bushes, ferns, grass tufts,
 * rocks, boulders, cliffs, logs, branches, stones, mushrooms, reeds.
 * Every model stands on y = 0, faces +z, ~1 unit = 1 m.
 */
import * as THREE from "three";
import { builder } from "./builder.js";

const BARK = "#5a4130";
const BARK2 = "#4a3426";

function pine(v, big = false) {
  const B = builder(11 + v);
  const s = big ? 1.25 : 1;
  B.cyl("m", BARK, [0.16 * s, 0.28 * s, 2.4 * s, 7], [0, 1.2 * s, 0], { grad: [0, 2.4, 0.6] });
  const greens = ["#2f5a34", "#2a5230", "#365f38", "#27492b"];
  const tiers = [
    [1.75, 2.3, 1.5],
    [1.42, 2.1, 2.75],
    [1.1, 1.9, 3.85],
    [0.75, 1.6, 4.85],
    [0.38, 1.1, 5.65],
  ];
  tiers.forEach(([r, h, y], i) => {
    const c = greens[(i + v) % greens.length];
    // a drooping, ragged skirt: a cone whose rim vertices are pulled down and jittered
    const g = new THREE.ConeGeometry(r * s * (0.92 + B.rnd() * 0.16), h * s, 16, 2);
    const pos = g.attributes.position;
    for (let q = 0; q < pos.count; q++) {
      const py = pos.getY(q);
      if (py < -h * s * 0.45) {
        const k = 1 + (B.rnd() - 0.5) * 0.28;
        pos.setXYZ(q, pos.getX(q) * k, py - B.rnd() * 0.22 * s, pos.getZ(q) * k);
      }
    }
    g.computeVertexNormals();
    B.add("f", g, c, { p: [(B.rnd() - 0.5) * 0.12, y * s, (B.rnd() - 0.5) * 0.12], jit: 0.12, grad: [0.6 * s, 6 * s, 0.55], wind: { h: 6 * s, k: 0.7 }, r: [0, B.rnd() * 3, 0] });
  });
  return B.build();
}

function oak(v, big = false) {
  const B = builder(31 + v);
  const s = big ? 1.3 : 1;
  B.cyl("m", BARK2, [0.2 * s, 0.34 * s, 2.6 * s, 8], [0, 1.3 * s, 0], { grad: [0, 2.6, 0.55] });
  B.beam("m", BARK2, [0, 2.0 * s, 0], [0.9 * s, 3.1 * s, 0.25 * s], 0.11 * s);
  B.beam("m", BARK2, [0, 2.2 * s, 0], [-0.7 * s, 3.3 * s, -0.4 * s], 0.1 * s);
  const greens = ["#4d7a35", "#5f9140", "#3f6a2c", "#6a9a46", "#46752f", "#557f38"];
  const blobs = [
    [0, 3.95, 0, 1.15],
    [1.05, 3.5, 0.4, 0.92],
    [-1.0, 3.6, -0.35, 0.95],
    [0.25, 4.7, -0.5, 0.85],
    [-0.45, 3.3, 1.0, 0.82],
    [0.6, 4.45, 0.8, 0.78],
    [-0.75, 4.35, 0.5, 0.72],
    [0.95, 3.2, -0.75, 0.78],
    [-0.25, 3.05, -0.95, 0.74],
    [0.1, 3.1, 0.2, 0.9],
  ];
  blobs.forEach(([x, y, z, r], i) => {
    B.ico("f", greens[(i * 2 + v) % greens.length], [r * s, 1], [x * s, y * s, z * s], { jit: 0.09, lump: 0.2, s: [1, 0.86, 1], grad: [2.2 * s, 5.4 * s, 0.5], wind: { h: 5.5 * s, k: 0.5 }, sphereN: [0, 3.9 * s, 0, 0.5] });
  });
  return B.build();
}

function birch(v) {
  const B = builder(51 + v);
  B.cyl("m", "#e7e2d6", [0.12, 0.19, 3.4, 8], [0, 1.7, 0], { grad: [0, 3.4, 0.75], jit: 0.03 });
  for (let k = 0; k < 7; k++) B.box("m", "#2b2722", [0.1, 0.05, 0.04], [Math.cos(k * 2.1) * 0.15, 0.4 + k * 0.42, Math.sin(k * 2.1) * 0.15], { r: [0, k * 2.1, 0] });
  const greens = ["#8eaa45", "#9cb84d", "#7f9d3c", "#a8bf5a"];
  for (let i = 0; i < 6; i++) {
    const a = i * 1.2;
    B.ico("f", greens[(i + v) % 4], [0.75 + B.rnd() * 0.25, 2], [Math.cos(a) * 0.5, 3.4 + (i % 3) * 0.45, Math.sin(a) * 0.5], { jit: 0.1, lump: 0.1, s: [1, 1.1, 1], grad: [2.6, 5, 0.6], wind: { h: 5, k: 0.65 }, sphereN: [0, 3.8, 0, 0.6] });
  }
  return B.build();
}

function stump(v, big = false) {
  const B = builder(71 + v);
  const s = big ? 1.8 : 1;
  B.cyl("m", BARK, [0.3 * s, 0.38 * s, 0.45 * s, 9], [0, 0.22 * s, 0], { grad: [0, 0.45 * s, 0.6] });
  B.cyl("m", "#c8a46e", [0.27 * s, 0.27 * s, 0.03, 9], [0, 0.46 * s, 0], { jit: 0.06 });
  B.tor("m", "#9b7a4e", [0.15 * s, 0.015, 4, 14], [0, 0.48 * s, 0], { r: [Math.PI / 2, 0, 0] });
  for (let k = 0; k < 4; k++) {
    const a = k * 1.7 + 0.3;
    B.beam("m", BARK, [Math.cos(a) * 0.2 * s, 0.12, Math.sin(a) * 0.2 * s], [Math.cos(a) * 0.55 * s, 0.02, Math.sin(a) * 0.55 * s], 0.07 * s);
  }
  return B.build();
}

function bush(v, berry = false) {
  const B = builder(91 + v);
  const greens = berry ? ["#3f6b33", "#4a7a3a", "#36602d"] : ["#4b7837", "#5b8a3e", "#406c30", "#68924a"];
  const n = 5;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * 6.28 + B.rnd();
    const r = i === 0 ? 0 : 0.42;
    B.ico("f", greens[i % greens.length], [0.5 + B.rnd() * 0.22, 2], [Math.cos(a) * r, 0.42 + B.rnd() * 0.2, Math.sin(a) * r], { jit: 0.12, lump: 0.12, s: [1, 0.8, 1], grad: [0, 1.1, 0.55], wind: { h: 1.2, k: 0.3 }, sphereN: [0, 0.3, 0, 0.6] });
  }
  if (berry)
    for (let k = 0; k < 22; k++) {
      const a = B.rnd() * 6.28;
      const y = 0.3 + B.rnd() * 0.6;
      const r = 0.55 + B.rnd() * 0.25;
      B.sph("s", k % 5 ? "#b2243a" : "#5b2a7a", [0.055, 6, 5], [Math.cos(a) * r, y, Math.sin(a) * r], { jit: 0.1 });
    }
  return B.build();
}

function fern(v) {
  const B = builder(111 + v);
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * 6.28 + v;
    B.box("f", k % 2 ? "#3f7a34" : "#4f8a3c", [0.16, 0.02, 0.85], [Math.sin(a) * 0.38, 0.28, Math.cos(a) * 0.38], { r: [-0.55, a, 0], jit: 0.12, wind: { h: 0.6, k: 0.5 } });
  }
  return B.build();
}

function grassTuft(v) {
  const B = builder(121 + v);
  B.cards(v % 2 ? "#ffffff" : "#e8f0d8", 0.9, 0.55, [0, 0, 0], { n: 3, yaw: v * 0.7, windK: 1 });
  return B.build();
}

function reeds(v) {
  const B = builder(131 + v);
  B.cards("#d9d2a0", 0.7, 1.2, [0, 0, 0], { n: 3, yaw: v });
  for (let k = 0; k < 3; k++) B.cyl("m", "#5a3c22", [0.035, 0.035, 0.18, 6], [(k - 1) * 0.15, 1.1 + k * 0.06, 0.05], {});
  return B.build();
}

function rock(v, big = false) {
  const B = builder(141 + v);
  const s = big ? 1.45 : 1;
  const greys = ["#7d7b76", "#8a8780", "#6d6b67", "#94918a"];
  B.ico("r", greys[v % 4], [0.95 * s, 2], [0, 0.42 * s, 0], { lump: 0.22, s: [1.15, 0.72, 1], jit: 0.06, grad: [0, 1.2 * s, 0.6] });
  if (big) B.ico("r", greys[(v + 1) % 4], [0.6 * s, 1], [0.9 * s, 0.25 * s, 0.4 * s], { lump: 0.2, s: [1, 0.8, 1.1], jit: 0.06 });
  B.ico("f", "#557f3e", [0.55 * s, 1], [0, 0.72 * s, -0.08], { lump: 0.2, s: [1.3, 0.22, 1.1], jit: 0.1 }); // moss cap
  return B.build();
}

function cliff(v) {
  const B = builder(161 + v);
  const greys = ["#6f6c66", "#7f7c74", "#5f5d58"];
  for (let k = 0; k < 4; k++) {
    const a = k * 1.9 + v;
    B.ico("r", greys[k % 3], [1.1 + B.rnd() * 0.6, 1], [Math.cos(a) * 0.7, 0.8 + k * 0.35, Math.sin(a) * 0.7], { lump: 0.3, s: [1, 1.4, 1], jit: 0.06, grad: [0, 3, 0.55] });
  }
  B.ico("f", "#4a7038", [1.0, 1], [0, 2.3, 0], { lump: 0.25, s: [1.4, 0.3, 1.2], jit: 0.1 });
  return B.build();
}

function logFallen(v) {
  const B = builder(171 + v);
  B.cyl("m", BARK, [0.3, 0.32, 4.2, 9], [0, 0.3, 0], { r: [Math.PI / 2, 0, 0], jit: 0.06 });
  B.cyl("m", "#b9935e", [0.28, 0.28, 0.02, 9], [0, 0.3, 2.11], { r: [Math.PI / 2, 0, 0] });
  B.cyl("m", "#b9935e", [0.3, 0.3, 0.02, 9], [0, 0.3, -2.11], { r: [Math.PI / 2, 0, 0] });
  B.box("f", "#4c7a36", [0.42, 0.08, 2.2], [0, 0.58, 0.4], { jit: 0.15 });
  return B.build();
}

function logPile(v) {
  const B = builder(181 + v);
  const rows = [
    [3, 0],
    [2, 1],
    [1, 2],
  ];
  // logs run along x, stacked across z
  for (const [n, row] of rows)
    for (let k = 0; k < n; k++) {
      const z = (k - (n - 1) / 2) * 0.62;
      const y = 0.3 + row * 0.52;
      B.cyl("m", k % 2 ? BARK : BARK2, [0.3, 0.3, 6.2, 9], [0, y, z], { r: [0, 0, Math.PI / 2], jit: 0.05 });
      for (const ex of [-3.11, 3.11]) B.cyl("m", "#c39d68", [0.28, 0.28, 0.02, 9], [ex, y, z], { r: [0, 0, Math.PI / 2] });
    }
  return B.build();
}

function woodpile(v) {
  const B = builder(191 + v);
  for (let r = 0; r < 3; r++)
    for (let k = 0; k < 5 - r; k++) B.cyl("m", (k + r) % 2 ? "#6a4a32" : "#7b583a", [0.12, 0.12, 1.6, 7], [(k - (4 - r) / 2) * 0.25, 0.12 + r * 0.22, 0], { r: [0, 0, Math.PI / 2], order: "ZYX", jit: 0.06 });
  return B.build();
}

function branch(v) {
  const B = builder(201 + v);
  B.beam("m", "#5d4430", [-0.7, 0.05, -0.2], [0.75, 0.06, 0.25], 0.05);
  B.beam("m", "#6b4f37", [-0.5, 0.05, 0.3], [0.6, 0.06, -0.35], 0.04);
  B.beam("m", "#5d4430", [-0.1, 0.05, -0.5], [0.15, 0.05, 0.55], 0.035);
  B.beam("m", "#4e3826", [0.3, 0.06, 0.1], [0.55, 0.12, 0.42], 0.025);
  return B.build();
}

function stones(v) {
  const B = builder(211 + v);
  for (let k = 0; k < 6; k++) {
    const a = k * 1.3 + v;
    B.ico("r", k % 2 ? "#8b8882" : "#77756f", [0.13 + B.rnd() * 0.1, 1], [Math.cos(a) * 0.35, 0.08, Math.sin(a) * 0.3], { lump: 0.25, s: [1.2, 0.7, 1], jit: 0.06 });
  }
  return B.build();
}

function mushroom(v) {
  const B = builder(221 + v);
  const caps = ["#b8432e", "#8a5a32", "#c9a35a"];
  for (let k = 0; k < 3; k++) {
    const a = k * 2.2;
    const x = Math.cos(a) * 0.14;
    const z = Math.sin(a) * 0.14;
    const h = 0.12 + k * 0.05;
    B.cyl("m", "#e8e0cc", [0.025, 0.035, h, 6], [x, h / 2, z]);
    B.sph("s", caps[(k + v) % 3], [0.08 + k * 0.02, 8, 5], [x, h, z], { s: [1, 0.55, 1] });
  }
  return B.build();
}

/** Cheap distant trees for the forest band outside the playable area. */
function pineLod(v) {
  const B = builder(301 + v);
  B.cyl("m", BARK, [0.2, 0.3, 2.2, 5], [0, 1.1, 0]);
  const greens = ["#2f5a34", "#2a5230", "#365f38"];
  [
    [2.1, 3.0, 2.0],
    [1.6, 2.6, 3.6],
    [1.0, 2.2, 5.0],
  ].forEach(([r, h, y], i) => B.cone("f", greens[(i + v) % 3], [r, h, 7], [0, y, 0], { jit: 0.12, grad: [0.6, 7, 0.55], wind: { h: 7, k: 0.5 } }));
  return B.build();
}
function oakLod(v) {
  const B = builder(311 + v);
  B.cyl("m", BARK2, [0.24, 0.36, 2.6, 5], [0, 1.3, 0]);
  const greens = ["#4d7a35", "#5f9140", "#3f6a2c"];
  [
    [0, 4.0, 0, 1.6],
    [1.0, 3.5, 0.4, 1.15],
    [-0.9, 3.6, -0.4, 1.2],
  ].forEach(([x, y, z, r], i) => B.ico("f", greens[(i + v) % 3], [r, 0], [x, y, z], { jit: 0.1, lump: 0.15, s: [1, 0.85, 1], grad: [2.2, 5.4, 0.5], wind: { h: 5.5, k: 0.4 }, sphereN: [0, 3.9, 0, 0.5] }));
  return B.build();
}

export const NATURE = {
  pine_lod: pineLod,
  tree_lod: oakLod,
  pine: (v) => pine(v),
  pine_big: (v) => pine(v, true),
  tree: (v) => oak(v),
  tree_big: (v) => oak(v, true),
  birch,
  stump: (v) => stump(v),
  stump_big: (v) => stump(v, true),
  bush: (v) => bush(v),
  berry: (v) => bush(v, true),
  fern,
  grass_tuft: grassTuft,
  reeds,
  rock: (v) => rock(v),
  boulder: (v) => rock(v, true),
  cliff,
  log_fallen: logFallen,
  log_pile: logPile,
  woodpile,
  branch,
  stones,
  mushroom,
};
