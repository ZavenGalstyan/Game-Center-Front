/**
 * Strike Force — vehicle models (original designs). Each builder returns
 * parts { g, m, c?, glow? } in local space: facing +x, centred on x/z,
 * resting on y = 0. The map view rotates / places and batches them.
 * m is a material-library id ("vehicle" is tinted by c), glow parts use an
 * unlit emissive colour instead.
 */
import * as THREE from "three";
import { boxMinMax, extrude, place } from "./geo.js";

function bodyShape(L, wheelX, wheelR, profile) {
  // profile: list of [x, y] for the upper outline, front (+x) to back
  const s = new THREE.Shape();
  const half = L / 2;
  const by = 0.3;
  s.moveTo(-half, by + 0.05);
  const arch = (cx) => {
    s.lineTo(cx - wheelR - 0.06, by);
    s.absarc(cx, by - 0.04, wheelR + 0.07, Math.PI, 0, true);
  };
  const xs = [...wheelX].sort((a, b) => a - b);
  for (const x of xs) arch(x);
  s.lineTo(half, by);
  for (const [x, y] of profile) s.lineTo(x, y);
  s.lineTo(-half, by + 0.05);
  return s;
}
function extrudeShape(shape, depth, bevel = 0.03) {
  const g = new THREE.ExtrudeGeometry(shape, { depth: Math.max(0.01, depth - bevel * 2), bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 6 });
  g.translate(0, 0, -depth / 2 + bevel);
  return g;
}
function wheel(parts, x, z, r, w, rimC = "#9aa0a6") {
  const t = new THREE.CylinderGeometry(r, r, w, 18);
  place(t, x, r, z, Math.PI / 2, 0, 0);
  parts.push({ g: t, m: "rubber" });
  const rim = new THREE.CylinderGeometry(r * 0.58, r * 0.58, w + 0.02, 12);
  place(rim, x, r, z, Math.PI / 2, 0, 0);
  parts.push({ g: rim, m: "steel", c: rimC });
  const hub = new THREE.CylinderGeometry(r * 0.18, r * 0.18, w + 0.05, 8);
  place(hub, x, r, z, Math.PI / 2, 0, 0);
  parts.push({ g: hub, m: "darkMetal" });
}
const lights = (parts, x, y, zs, color, w = 0.05, h = 0.12, d = 0.32) => {
  for (const z of zs) parts.push({ g: boxMinMax(x - w / 2, y - h / 2, z - d / 2, x + w / 2, y + h / 2, z + d / 2), glow: color });
};
function sidePillar(parts, pts, W, c, t = 0.07) {
  for (const s of [-1, 1]) {
    const g = extrude(pts, t);
    g.translate(0, 0, s * (W / 2 - t / 2));
    parts.push({ g, m: "vehicle", c });
  }
}

function car({ L = 4.5, W = 1.86, H = 1.45, c = "#5a6c7a", tall = false }) {
  const parts = [];
  const h = L / 2;
  const wx = [h - 0.95, -h + 0.95];
  const r = tall ? 0.38 : 0.34;
  const belt = tall ? 1.05 : 0.9;
  const body = bodyShape(L, wx, r, [
    [h + 0.04, 0.62],
    [h - 0.08, belt - 0.08],
    [h * 0.42, belt],
    [-h + 0.5, belt + 0.04],
    [-h + 0.05, belt - 0.02],
    [-h - 0.03, 0.62],
  ]);
  parts.push({ g: extrudeShape(body, W, 0.05), m: "vehicle", c });
  // greenhouse (glass) + roof
  const gh = [
    [h * 0.44, belt - 0.02],
    [h * 0.08, H - 0.06],
    [-h * 0.55, H - 0.04],
    [-h + 0.52, belt + 0.02],
  ];
  parts.push({ g: extrude(gh, W - 0.16), m: "glass" });
  parts.push({ g: extrude([[h * 0.1, H - 0.08], [-h * 0.55, H - 0.06], [-h * 0.56, H], [h * 0.08, H - 0.02]], W - 0.1), m: "vehicle", c });
  sidePillar(parts, [[h * 0.44, belt - 0.02], [h * 0.08, H - 0.06], [h * 0.02, H - 0.06], [h * 0.36, belt - 0.02]], W, c);
  sidePillar(parts, [[-h * 0.08, belt], [-h * 0.08, H - 0.05], [-h * 0.16, H - 0.05], [-h * 0.16, belt]], W, c);
  sidePillar(parts, [[-h * 0.55, H - 0.04], [-h + 0.52, belt + 0.02], [-h + 0.4, belt + 0.02], [-h * 0.62, H - 0.04]], W, c);
  // bumpers, grille, mirrors, plate
  parts.push({ g: boxMinMax(h - 0.06, 0.3, -W / 2 + 0.05, h + 0.08, 0.5, W / 2 - 0.05), m: "darkMetal" });
  parts.push({ g: boxMinMax(-h - 0.08, 0.3, -W / 2 + 0.05, -h + 0.06, 0.5, W / 2 - 0.05), m: "darkMetal" });
  parts.push({ g: boxMinMax(h + 0.02, 0.55, -0.42, h + 0.07, 0.7, 0.42), m: "darkMetal" });
  for (const s of [-1, 1]) parts.push({ g: boxMinMax(h * 0.38, belt + 0.02, s * (W / 2) - 0.04, h * 0.38 + 0.14, belt + 0.12, s * (W / 2 + 0.12) + 0.04), m: "vehicle", c });
  lights(parts, h + 0.06, 0.66, [-W / 2 + 0.3, W / 2 - 0.3], "#fff3d1", 0.05, 0.1, 0.34);
  lights(parts, -h - 0.04, 0.72, [-W / 2 + 0.28, W / 2 - 0.28], "#ff2a1a", 0.05, 0.12, 0.3);
  for (const x of wx) for (const z of [-W / 2 + 0.18, W / 2 - 0.18]) wheel(parts, x, z, r, 0.24);
  return parts;
}

function pickup({ c }) {
  const L = 5.3;
  const W = 2.0;
  const H = 1.75;
  const h = L / 2;
  const parts = [];
  const wx = [h - 1.0, -h + 1.05];
  const r = 0.4;
  const body = bodyShape(L, wx, r, [
    [h + 0.04, 0.68],
    [h - 0.1, 1.02],
    [h * 0.4, 1.08],
    [-h + 0.02, 1.08],
    [-h - 0.02, 0.66],
  ]);
  parts.push({ g: extrudeShape(body, W, 0.05), m: "vehicle", c });
  parts.push({ g: extrude([[h * 0.4, 1.06], [h * 0.14, H - 0.04], [-h * 0.3, H - 0.02], [-h * 0.32, 1.06]], W - 0.14), m: "glass" });
  parts.push({ g: extrude([[h * 0.15, H - 0.06], [-h * 0.31, H - 0.04], [-h * 0.31, H + 0.02], [h * 0.13, H]], W - 0.08), m: "vehicle", c });
  sidePillar(parts, [[h * 0.4, 1.06], [h * 0.14, H - 0.04], [h * 0.06, H - 0.04], [h * 0.32, 1.06]], W, c);
  sidePillar(parts, [[-h * 0.06, 1.06], [-h * 0.06, H - 0.03], [-h * 0.14, H - 0.03], [-h * 0.14, 1.06]], W, c);
  parts.push({ g: boxMinMax(-h * 0.36, 1.06, -W / 2 + 0.02, -h * 0.3, H, W / 2 - 0.02), m: "vehicle", c });
  // bed
  parts.push({ g: boxMinMax(-h + 0.05, 0.95, -W / 2 + 0.1, -h * 0.36, 1.0, W / 2 - 0.1), m: "darkMetal" });
  for (const s of [-1, 1]) parts.push({ g: boxMinMax(-h + 0.02, 1.0, s * W / 2 - (s > 0 ? 0.08 : 0), -h * 0.36, 1.32, s * W / 2 + (s < 0 ? 0.08 : 0)), m: "vehicle", c });
  parts.push({ g: boxMinMax(-h - 0.02, 1.0, -W / 2, -h + 0.08, 1.32, W / 2), m: "vehicle", c });
  parts.push({ g: boxMinMax(h - 0.05, 0.32, -W / 2 + 0.05, h + 0.12, 0.55, W / 2 - 0.05), m: "chrome" });
  parts.push({ g: boxMinMax(-h - 0.1, 0.32, -W / 2 + 0.05, -h + 0.05, 0.52, W / 2 - 0.05), m: "chrome" });
  parts.push({ g: boxMinMax(h + 0.02, 0.62, -0.5, h + 0.07, 0.95, 0.5), m: "darkMetal" });
  lights(parts, h + 0.06, 0.82, [-W / 2 + 0.28, W / 2 - 0.28], "#fff3d1");
  lights(parts, -h - 0.05, 1.15, [-W / 2 + 0.12, W / 2 - 0.12], "#ff2a1a", 0.05, 0.22, 0.12);
  for (const x of wx) for (const z of [-W / 2 + 0.2, W / 2 - 0.2]) wheel(parts, x, z, r, 0.28);
  return parts;
}

function truck({ c }) {
  const L = 7.6;
  const W = 2.5;
  const H = 3.1;
  const h = L / 2;
  const parts = [];
  // cab
  const cab = extrude(
    [
      [h, 0.75],
      [h, 1.9],
      [h - 0.25, 2.75],
      [h - 1.7, 2.8],
      [h - 1.75, 0.75],
    ],
    W,
    0.06,
  );
  parts.push({ g: cab, m: "vehicle", c: "#d9dde0" });
  parts.push({ g: extrude([[h + 0.01, 1.95], [h - 0.22, 2.68], [h - 0.6, 2.68], [h - 0.6, 1.95]], W - 0.18), m: "glass" });
  parts.push({ g: boxMinMax(h - 1.3, 1.9, -W / 2 - 0.01, h - 0.7, 2.55, W / 2 + 0.01), m: "glass" });
  parts.push({ g: boxMinMax(h - 0.02, 0.85, -0.8, h + 0.05, 1.6, 0.8), m: "darkMetal" });
  parts.push({ g: boxMinMax(h - 0.05, 0.45, -W / 2, h + 0.12, 0.8, W / 2), m: "darkMetal" });
  lights(parts, h + 0.06, 1.0, [-W / 2 + 0.25, W / 2 - 0.25], "#fff3d1", 0.05, 0.2, 0.3);
  // chassis
  parts.push({ g: boxMinMax(-h, 0.55, -W / 2 + 0.25, h - 0.2, 0.85, W / 2 - 0.25), m: "darkMetal" });
  // cargo box
  const bx0 = -h;
  const bx1 = h - 1.95;
  parts.push({ g: boxMinMax(bx0, 0.9, -W / 2, bx1, H, W / 2, 2.6), m: "corrugated", c });
  parts.push({ g: boxMinMax(bx0 - 0.04, 0.88, -W / 2 - 0.04, bx1 + 0.04, 1.0, W / 2 + 0.04), m: "darkMetal" });
  parts.push({ g: boxMinMax(bx0 - 0.04, H - 0.1, -W / 2 - 0.04, bx1 + 0.04, H + 0.02, W / 2 + 0.04), m: "darkMetal" });
  lights(parts, -h - 0.04, 1.1, [-W / 2 + 0.2, W / 2 - 0.2], "#ff2a1a", 0.05, 0.14, 0.24);
  // fuel tank + steps
  parts.push({ g: place(new THREE.CylinderGeometry(0.3, 0.3, 1.1, 14), h - 2.4, 0.75, W / 2 - 0.25, 0, 0, Math.PI / 2), m: "chrome" });
  for (const x of [h - 0.9, -h + 1.6, -h + 0.55]) for (const z of [-W / 2 + 0.24, W / 2 - 0.24]) wheel(parts, x, z, 0.5, 0.36, "#c0c4c8");
  return parts;
}

function humvee({ c }) {
  const L = 4.9;
  const W = 2.2;
  const h = L / 2;
  const parts = [];
  const r = 0.46;
  const wx = [h - 0.95, -h + 0.9];
  const body = bodyShape(L, wx, r, [
    [h + 0.02, 0.75],
    [h - 0.06, 1.12],
    [h * 0.5, 1.22],
    [h * 0.32, 1.25],
    [-h + 0.02, 1.25],
    [-h - 0.02, 0.75],
  ]);
  parts.push({ g: extrudeShape(body, W, 0.04), m: "vehicle", c });
  parts.push({ g: boxMinMax(-h * 0.7, 1.22, -W / 2 + 0.06, h * 0.32, 1.86, W / 2 - 0.06), m: "vehicle", c });
  parts.push({ g: boxMinMax(h * 0.3 - 0.01, 1.32, -W / 2 + 0.16, h * 0.34, 1.76, W / 2 - 0.16), m: "glass" });
  for (const x of [h * 0.05, -h * 0.4]) for (const s of [-1, 1]) parts.push({ g: boxMinMax(x - 0.3, 1.38, s * (W / 2 - 0.06) - 0.02, x + 0.3, 1.72, s * (W / 2 - 0.06) + 0.02), m: "glass" });
  // turret ring + gun shield
  parts.push({ g: place(new THREE.CylinderGeometry(0.62, 0.62, 0.16, 18), -h * 0.2, 1.94, 0), m: "vehicle", c });
  parts.push({ g: boxMinMax(-h * 0.2 + 0.35, 1.98, -0.55, -h * 0.2 + 0.45, 2.45, 0.55), m: "vehicle", c });
  parts.push({ g: place(new THREE.CylinderGeometry(0.05, 0.05, 1.0, 8), -h * 0.2 + 0.7, 2.25, 0, 0, 0, Math.PI / 2), m: "darkMetal" });
  parts.push({ g: boxMinMax(h - 0.02, 0.62, -W / 2 + 0.1, h + 0.18, 0.95, W / 2 - 0.1), m: "darkMetal" });
  parts.push({ g: boxMinMax(h + 0.0, 0.9, -0.6, h + 0.05, 1.1, 0.6), m: "darkMetal" });
  lights(parts, h + 0.04, 1.0, [-W / 2 + 0.3, W / 2 - 0.3], "#fff3d1", 0.05, 0.12, 0.18);
  lights(parts, -h - 0.04, 1.0, [-W / 2 + 0.2, W / 2 - 0.2], "#ff2a1a", 0.05, 0.12, 0.14);
  // spare wheel + jerry cans
  parts.push({ g: place(new THREE.CylinderGeometry(0.42, 0.42, 0.24, 16), -h - 0.14, 1.2, 0.45, 0, 0, Math.PI / 2), m: "rubber" });
  for (const x of wx) for (const z of [-W / 2 + 0.2, W / 2 - 0.2]) wheel(parts, x, z, r, 0.36, "#5b5e4a");
  return parts;
}

function forklift({ c }) {
  const parts = [];
  const L = 2.8;
  const W = 1.3;
  const h = L / 2;
  parts.push({ g: boxMinMax(-h + 0.35, 0.25, -W / 2, h - 0.55, 1.05, W / 2), m: "vehicle", c });
  parts.push({ g: extrude([[-h + 0.4, 0.25], [-h + 0.4, 1.2], [-h, 1.05], [-h, 0.35]], W - 0.04), m: "vehicle", c: "#2a2c2e" });
  parts.push({ g: boxMinMax(-0.5, 1.05, -0.32, -0.05, 1.5, 0.32), m: "rubber" });
  // overhead guard
  for (const [x, z] of [
    [-0.75, -W / 2 + 0.06],
    [-0.75, W / 2 - 0.06],
    [0.6, -W / 2 + 0.06],
    [0.6, W / 2 - 0.06],
  ])
    parts.push({ g: boxMinMax(x - 0.04, 1.05, z - 0.04, x + 0.04, 2.15, z + 0.04), m: "darkMetal" });
  parts.push({ g: boxMinMax(-0.8, 2.12, -W / 2 + 0.02, 0.65, 2.2, W / 2 - 0.02), m: "darkMetal" });
  // mast + forks
  for (const z of [-0.35, 0.35]) parts.push({ g: boxMinMax(h - 0.55, 0.15, z - 0.06, h - 0.43, 2.2, z + 0.06), m: "darkMetal" });
  parts.push({ g: boxMinMax(h - 0.45, 0.2, -0.45, h - 0.38, 0.75, 0.45), m: "darkMetal" });
  for (const z of [-0.28, 0.28]) parts.push({ g: boxMinMax(h - 0.4, 0.12, z - 0.06, h + 0.05, 0.18, z + 0.06), m: "steel" });
  lights(parts, h - 0.5, 1.9, [-0.42, 0.42], "#ffb21c", 0.08, 0.08, 0.08);
  for (const x of [h - 0.75, -h + 0.55]) for (const z of [-W / 2 + 0.12, W / 2 - 0.12]) wheel(parts, x, z, 0.26, 0.2);
  return parts;
}

function van({ c }) {
  const L = 5.2;
  const W = 2.1;
  const H = 2.3;
  const h = L / 2;
  const parts = [];
  const wx = [h - 0.85, -h + 0.95];
  const body = bodyShape(L, wx, 0.36, [
    [h + 0.03, 0.62],
    [h - 0.1, 1.05],
    [h - 0.85, 1.25],
    [h - 1.15, H - 0.04],
    [-h + 0.05, H],
    [-h - 0.02, 0.6],
  ]);
  parts.push({ g: extrudeShape(body, W, 0.05), m: "vehicle", c });
  parts.push({ g: extrude([[h - 0.82, 1.24], [h - 1.12, H - 0.12], [h - 1.36, H - 0.12], [h - 1.36, 1.24]], W - 0.1), m: "glass" });
  for (const s of [-1, 1]) parts.push({ g: boxMinMax(h - 1.9, 1.3, s * W / 2 - 0.015, h - 1.45, 1.95, s * W / 2 + 0.015), m: "glass" });
  parts.push({ g: boxMinMax(h - 0.05, 0.3, -W / 2 + 0.05, h + 0.08, 0.52, W / 2 - 0.05), m: "darkMetal" });
  parts.push({ g: boxMinMax(-h - 0.06, 0.3, -W / 2 + 0.05, -h + 0.04, 0.52, W / 2 - 0.05), m: "darkMetal" });
  lights(parts, h + 0.05, 0.8, [-W / 2 + 0.3, W / 2 - 0.3], "#fff3d1");
  lights(parts, -h - 0.04, 0.95, [-W / 2 + 0.12, W / 2 - 0.12], "#ff2a1a", 0.05, 0.3, 0.12);
  for (const x of wx) for (const z of [-W / 2 + 0.2, W / 2 - 0.2]) wheel(parts, x, z, 0.36, 0.25);
  return parts;
}

function bus({ c }) {
  const L = 11;
  const W = 2.6;
  const H = 3.1;
  const h = L / 2;
  const parts = [];
  parts.push({ g: boxMinMax(-h, 0.35, -W / 2, h, 1.2, W / 2, 3), m: "vehicle", c });
  parts.push({ g: boxMinMax(-h + 0.05, 1.2, -W / 2 + 0.04, h - 0.05, 2.45, W / 2 - 0.04, 3), m: "glass" });
  parts.push({ g: boxMinMax(-h, 2.45, -W / 2, h, H, W / 2, 3), m: "vehicle", c });
  for (let x = -h + 0.9; x < h - 0.5; x += 1.6) for (const s of [-1, 1]) parts.push({ g: boxMinMax(x - 0.06, 1.2, s * W / 2 - 0.03, x + 0.06, 2.45, s * W / 2 + 0.03), m: "vehicle", c });
  parts.push({ g: boxMinMax(h - 0.02, 0.35, -W / 2 + 0.04, h + 0.05, 0.6, W / 2 - 0.04), m: "darkMetal" });
  parts.push({ g: boxMinMax(-h - 0.05, 0.35, -W / 2 + 0.04, -h + 0.02, 0.6, W / 2 - 0.04), m: "darkMetal" });
  lights(parts, h + 0.04, 0.8, [-W / 2 + 0.3, W / 2 - 0.3], "#fff3d1");
  lights(parts, h + 0.04, 2.8, [0], "#ffb21c", 0.05, 0.25, 1.6);
  lights(parts, -h - 0.04, 0.9, [-W / 2 + 0.2, W / 2 - 0.2], "#ff2a1a", 0.05, 0.25, 0.14);
  for (const x of [h - 2.2, -h + 2.4]) for (const z of [-W / 2 + 0.25, W / 2 - 0.25]) wheel(parts, x, z, 0.5, 0.32);
  return parts;
}

function snowcat({ c }) {
  const L = 5.2;
  const W = 2.6;
  const h = L / 2;
  const parts = [];
  for (const s of [-1, 1]) {
    const z = s * (W / 2 - 0.35);
    parts.push({ g: boxMinMax(-h + 0.3, 0.05, z - 0.35, h - 0.3, 0.85, z + 0.35), m: "rubber" });
    for (const x of [-h + 0.3, h - 0.3]) parts.push({ g: place(new THREE.CylinderGeometry(0.4, 0.4, 0.7, 14), x, 0.45, z, Math.PI / 2, 0, 0), m: "rubber" });
    for (let x = -h + 0.6; x < h - 0.5; x += 0.8) parts.push({ g: place(new THREE.CylinderGeometry(0.22, 0.22, 0.72, 10), x, 0.3, z, Math.PI / 2, 0, 0), m: "darkMetal" });
  }
  parts.push({ g: boxMinMax(-h + 0.1, 0.85, -W / 2 + 0.1, h - 0.1, 1.3, W / 2 - 0.1), m: "vehicle", c });
  parts.push({ g: extrude([[h * 0.3, 1.3], [h * 0.05, 2.5], [-h + 0.2, 2.55], [-h + 0.2, 1.3]], W - 0.4, 0.04), m: "vehicle", c });
  parts.push({ g: extrude([[h * 0.3 + 0.02, 1.4], [h * 0.06 + 0.02, 2.4], [h * 0.0, 2.4], [h * 0.22, 1.4]], W - 0.5), m: "glass" });
  for (const s of [-1, 1]) parts.push({ g: boxMinMax(-h * 0.7, 1.6, s * (W / 2 - 0.2) - 0.02, -h * 0.05, 2.3, s * (W / 2 - 0.2) + 0.02), m: "glass" });
  // blade
  parts.push({ g: extrude([[0, 0], [0.25, 0], [0.45, 1.0], [0.3, 1.05]], W + 0.3).rotateY(0).translate(h - 0.05, 0.1, 0), m: "steel", c: "#b9bdc1" });
  lights(parts, h * 0.15, 2.58, [-0.6, -0.2, 0.2, 0.6], "#fff3d1", 0.12, 0.08, 0.12);
  return parts;
}

function apc({ c }) {
  const L = 6.6;
  const W = 2.8;
  const h = L / 2;
  const parts = [];
  parts.push({
    g: extrude(
      [
        [h, 0.75],
        [h + 0.1, 1.15],
        [h - 1.1, 1.85],
        [-h + 0.3, 1.9],
        [-h, 1.6],
        [-h, 0.75],
      ],
      W - 0.3,
      0.05,
    ),
    m: "vehicle",
    c,
  });
  parts.push({ g: boxMinMax(-h + 0.2, 0.55, -W / 2, h - 0.2, 0.95, W / 2), m: "vehicle", c });
  parts.push({ g: place(new THREE.CylinderGeometry(0.7, 0.8, 0.45, 8), -0.4, 2.1, 0), m: "vehicle", c });
  parts.push({ g: place(new THREE.CylinderGeometry(0.07, 0.08, 2.2, 8), 0.8, 2.15, 0, 0, 0, Math.PI / 2), m: "darkMetal" });
  for (const x of [h - 0.9, h - 2.3, -h + 2.1, -h + 0.8]) for (const z of [-W / 2 + 0.3, W / 2 - 0.3]) wheel(parts, x, z, 0.52, 0.4, "#4a4d40");
  lights(parts, h + 0.06, 1.0, [-W / 2 + 0.4, W / 2 - 0.4], "#fff3d1", 0.05, 0.1, 0.18);
  return parts;
}

const BUILDERS = {
  car: (o) => car(o),
  suv: (o) => car({ ...o, L: 4.8, W: 2.0, H: 1.8, tall: true }),
  pickup,
  truck,
  humvee,
  forklift,
  van,
  bus,
  snowcat,
  apc,
};
export function vehicleParts(type, c) {
  const b = BUILDERS[type] || BUILDERS.car;
  return b({ c });
}
