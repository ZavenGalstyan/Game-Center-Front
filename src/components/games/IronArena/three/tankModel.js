/**
 * Iron Arena — procedural tank models.
 *
 * Each of the eight models is assembled from convex armour shells
 * (ConvexGeometry over hand-placed key points → crisp sloped plates),
 * lathe-turned barrels, segmented side skirts, road wheels, sprockets,
 * idlers, return rollers and a continuous track belt (the 2D convex hull of
 * all wheels, extruded as a ribbon). Parts are merged per layer/material so a
 * tank costs ~12 draw calls. Grime is baked into vertex colours (darker near
 * the ground), wheels spin in the vertex shader (per-wheel radius) and the
 * tread texture scrolls with each track's travel distance.
 *
 * Geometry is cached per model ("full" + "lite" LOD without small details);
 * paint materials per skin; per-instance materials only for the animated
 * wheels/treads and trim lights.
 */
import * as THREE from "three";
import { ConvexGeometry } from "three/examples/jsm/geometries/ConvexGeometry.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { DIMS } from "../engine/tank.js";
import { skinFor, TEAM_SKIN } from "../engine/tanks.js";
import { texSet } from "./textures.js";

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const geoCache = new Map();
const matCache = new Map();
let texSize = 512;
export function setTankTexSize(n) {
  texSize = n;
}

/* ------------------------------------------------------------------ geometry helpers */
function prep(geo, o = {}) {
  let g = geo.index ? geo.toNonIndexed() : geo;
  if (!g.attributes.normal) g.computeVertexNormals();
  for (const k of Object.keys(g.attributes)) if (!["position", "normal", "uv"].includes(k)) g.deleteAttribute(k);
  const pos = g.attributes.position;
  const nor = g.attributes.normal;
  const n = pos.count;
  if (!g.attributes.uv || o.boxUV) {
    const uv = new Float32Array(n * 2);
    const s = o.uvScale ?? 0.4;
    for (let i = 0; i < n; i++) {
      const ax = Math.abs(nor.getX(i));
      const ay = Math.abs(nor.getY(i));
      const az = Math.abs(nor.getZ(i));
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      let u;
      let v;
      if (ay >= ax && ay >= az) {
        u = x;
        v = z;
      } else if (ax >= az) {
        u = z;
        v = y;
      } else {
        u = x;
        v = y;
      }
      uv[i * 2] = u * s + (o.uvOff || 0);
      uv[i * 2 + 1] = v * s;
    }
    g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  } else if (o.uvMul) {
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * o.uvMul[0], uv.getY(i) * o.uvMul[1]);
  }
  // vertex colour: tint × grime (darker toward the ground)
  const col = new Float32Array(n * 3);
  const tint = o.tint || [1, 1, 1];
  const yOff = o.yOff || 0;
  for (let i = 0; i < n; i++) {
    const y = pos.getY(i) + yOff;
    let k = 1;
    if (o.grime !== false) {
      const t = Math.min(1, Math.max(0, (y - 0.15) / 1.25));
      k = 0.55 + 0.45 * t * t * (3 - 2 * t);
    }
    col[i * 3] = tint[0] * k * (o.grime !== false ? (0.96 + 0.04 * k) : 1);
    col[i * 3 + 1] = tint[1] * k * (o.grime !== false ? 0.97 : 1);
    col[i * 3 + 2] = tint[2] * k * (o.grime !== false ? 0.93 + 0.05 * k : 1);
  }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  return g;
}
const xf = (g, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1 } = {}) => {
  const m = new THREE.Matrix4().compose(V(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, "YXZ")), V(sx, sy, sz));
  g.applyMatrix4(m);
  return g;
};
const convex = (pts) => new ConvexGeometry(pts);
const ni = (g) => (g.index ? g.toNonIndexed() : g);
const boxG = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cylG = (rt, rb, h, seg = 16, open = false) => new THREE.CylinderGeometry(rt, rb, h, seg, 1, open);
/** symmetric outline in the xz plane: [[halfWidth, z], ...] → points at height y */
const ring = (outline, y) => {
  const pts = [];
  for (const [hw, z] of outline) {
    pts.push(V(hw, y, z));
    pts.push(V(-hw, y, z));
  }
  return pts;
};
/** lathe barrel along +Z from a profile [[radius, z], ...] */
function barrelG(profile, seg = 18) {
  const pts = profile.map(([r, z]) => new THREE.Vector2(Math.max(0.001, r), z));
  const g = new THREE.LatheGeometry(pts, seg);
  // lathe is around +Y; rotate to +Z
  g.rotateX(Math.PI / 2);
  return g;
}

/* ------------------------------------------------------------------ kit */
function createKit() {
  const parts = [];
  const kit = {
    parts,
    /** layer: hull | turret | gun | spin | wheels | tread | lights | trim; mat: paint | metal | rubber | glow | trim */
    add(layer, mat, geo, o = {}) {
      parts.push({ layer, mat, geo: prep(geo, o), detail: !!o.detail, wheel: o.wheel || null, side: o.side || 0 });
    },
  };
  return kit;
}

/** belt loop: convex hull of wheel circles (zy plane), resampled, as a ribbon */
function treadBelt(circles, width, x, side, thick = 0.11) {
  const pts = [];
  for (const c of circles)
    for (let k = 0; k < 28; k++) {
      const a = (k / 28) * Math.PI * 2;
      pts.push([c.z + Math.cos(a) * (c.r + thick * 0.5), c.y + Math.sin(a) * (c.r + thick * 0.5)]);
    }
  pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  const hull = lower.slice(0, -1).concat(upper.slice(0, -1)); // CCW in (z, y)
  // resample evenly
  const seg = [];
  let total = 0;
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i];
    const b = hull[(i + 1) % hull.length];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    seg.push(L);
    total += L;
  }
  const N = Math.max(40, Math.round(total / 0.09));
  const loop = [];
  let si = 0;
  let acc = 0;
  for (let k = 0; k < N; k++) {
    const d = (k / N) * total;
    while (acc + seg[si] < d) {
      acc += seg[si];
      si = (si + 1) % hull.length;
    }
    const a = hull[si];
    const b = hull[(si + 1) % hull.length];
    const t = (d - acc) / (seg[si] || 1);
    loop.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, d]);
  }
  // ribbon with thickness: outer, inner, two edges
  const pos = [];
  const nor = [];
  const uv = [];
  const hw = width / 2;
  const TILE = 1.6;
  for (let k = 0; k < N; k++) {
    const a = loop[k];
    const b = loop[(k + 1) % N];
    const ua = a[2] / TILE;
    const ub = (k + 1 === N ? total : b[2]) / TILE;
    // outward normal (CCW loop in z,y → outward = (dy, -dz))
    const dz = b[0] - a[0];
    const dy = b[1] - a[1];
    const L = Math.hypot(dz, dy) || 1;
    const onz = dy / L;
    const ony = -dz / L;
    const quad = (p0, p1, p2, p3, n, u0, u1, v0, v1) => {
      pos.push(...p0, ...p1, ...p2, ...p0, ...p2, ...p3);
      for (let q = 0; q < 6; q++) nor.push(...n);
      uv.push(u0, v0, u1, v0, u1, v1, u0, v0, u1, v1, u0, v1);
    };
    const T = thick;
    const A0 = [x - hw, a[1], a[0]];
    const A1 = [x + hw, a[1], a[0]];
    const B0 = [x - hw, b[1], b[0]];
    const B1 = [x + hw, b[1], b[0]];
    const Ai0 = [x - hw, a[1] - ony * T, a[0] - onz * T];
    const Ai1 = [x + hw, a[1] - ony * T, a[0] - onz * T];
    const Bi0 = [x - hw, b[1] - ony * T, b[0] - onz * T];
    const Bi1 = [x + hw, b[1] - ony * T, b[0] - onz * T];
    quad(A0, B0, B1, A1, [0, ony, onz], ua, ub, 0, 1);
    quad(Ai1, Bi1, Bi0, Ai0, [0, -ony, -onz], ua, ub, 1, 0);
    quad(Ai0, Bi0, B0, A0, [-1, 0, 0], ua, ub, 0, 0.1);
    quad(A1, B1, Bi1, Ai1, [1, 0, 0], ua, ub, 0, 0.1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.userData.side = side;
  return g;
}

/** one road wheel (hub + rubber tyre + bolts) centred at origin, axis X */
function wheelGeos(r, w) {
  const tyre = cylG(r, r, w, 22);
  tyre.rotateZ(Math.PI / 2);
  const hub = cylG(r * 0.62, r * 0.72, w + 0.04, 14);
  hub.rotateZ(Math.PI / 2);
  const cap = cylG(r * 0.18, r * 0.24, w + 0.12, 8);
  cap.rotateZ(Math.PI / 2);
  const spokes = [];
  for (let k = 0; k < 6; k++) {
    const b = boxG(w + 0.07, r * 0.09, r * 0.5);
    b.translate(0, r * 0.32, 0);
    b.rotateX((k / 6) * Math.PI * 2);
    spokes.push(b);
  }
  return { tyre, hub: mergeGeometries([ni(hub), ni(cap), ...spokes.map(ni)]) };
}
function sprocketGeo(r, w) {
  const shape = new THREE.Shape();
  const teeth = 12;
  for (let k = 0; k <= teeth * 2; k++) {
    const a = (k / (teeth * 2)) * Math.PI * 2;
    const rr = k % 2 ? r : r * 0.86;
    if (k === 0) shape.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
    else shape.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  const g = new THREE.ExtrudeGeometry(shape, { depth: w, bevelEnabled: false, curveSegments: 2 });
  g.translate(0, 0, -w / 2);
  g.rotateY(Math.PI / 2);
  const hub = cylG(r * 0.45, r * 0.5, w + 0.15, 12);
  hub.rotateZ(Math.PI / 2);
  return mergeGeometries([ni(g), ni(hub)]);
}

/* ------------------------------------------------------------------ common running gear + hull */
function runningGear(k, p) {
  const { L, W, trackW, nWheels, rWheel, rSprocket = 0.42, rIdler = 0.38, skirt = 0.5, skirtDrop = 0.55 } = p;
  const xs = W / 2 - trackW / 2;
  const z0 = -L / 2 + 0.95;
  const z1 = L / 2 - 1.05;
  const wy = rWheel + 0.06;
  for (const side of [1, -1]) {
    const x = xs * side;
    const circles = [];
    for (let i = 0; i < nWheels; i++) {
      const z = z0 + ((z1 - z0) * i) / (nWheels - 1);
      const { tyre, hub } = wheelGeos(rWheel, trackW * 0.72);
      k.add("wheels", "rubber", xf(tyre, { x, y: wy, z }), { wheel: [wy, z, rWheel], side, grime: false, tint: [0.18, 0.18, 0.18] });
      k.add("wheels", "rubber", xf(hub, { x, y: wy, z }), { wheel: [wy, z, rWheel], side, grime: false, tint: [0.9, 0.9, 0.9], boxUV: true });
      circles.push({ z, y: wy, r: rWheel });
    }
    const sz = -L / 2 + 0.45;
    const sy = 0.78;
    const iz = L / 2 - 0.42;
    const iy = 0.74;
    k.add("wheels", "rubber", xf(sprocketGeo(rSprocket, trackW * 0.8), { x, y: sy, z: sz }), { wheel: [sy, sz, rSprocket], side, grime: false, tint: [0.75, 0.75, 0.78], boxUV: true });
    const id = cylG(rIdler, rIdler, trackW * 0.7, 18);
    id.rotateZ(Math.PI / 2);
    k.add("wheels", "rubber", xf(id, { x, y: iy, z: iz }), { wheel: [iy, iz, rIdler], side, grime: false, tint: [0.3, 0.3, 0.32] });
    circles.push({ z: sz, y: sy, r: rSprocket }, { z: iz, y: iy, r: rIdler });
    // return rollers
    const topY = Math.max(sy + rSprocket, iy + rIdler) - 0.12;
    for (let i = 0; i < Math.max(2, nWheels - 3); i++) {
      const z = z0 + 0.4 + ((z1 - z0 - 0.8) * i) / Math.max(1, nWheels - 4);
      const rr = cylG(0.11, 0.11, trackW * 0.5, 10);
      rr.rotateZ(Math.PI / 2);
      k.add("wheels", "rubber", xf(rr, { x, y: topY - 0.02, z }), { wheel: [topY - 0.02, z, 0.11], side, grime: false, tint: [0.3, 0.3, 0.3], detail: true });
    }
    const belt = treadBelt(circles, trackW, x, side);
    k.add("tread", "tread", belt, { side, grime: false });
    // fender over the track
    const fy = topY + 0.18;
    k.add("hull", "paint", xf(boxG(trackW + 0.12, 0.06, L + 0.1), { x, y: fy, z: 0.02 }));
    // front mud flap slope
    k.add("hull", "paint", xf(boxG(trackW + 0.1, 0.05, 0.6), { x, y: fy - 0.16, z: L / 2 + 0.18, rx: 0.5 }));
    // side skirt plates
    if (skirt > 0) {
      const n = Math.max(3, Math.round(L / 1.25));
      const plateL = (L - 0.5) / n;
      for (let i = 0; i < n; i++) {
        const z = -L / 2 + 0.3 + plateL * (i + 0.5);
        const hgt = skirt;
        const g = boxG(0.07, hgt, plateL - 0.05);
        k.add("hull", "paint", xf(g, { x: x + side * (trackW / 2 + 0.05), y: fy - hgt / 2 + 0.02, z, rz: side * -0.07 }), { uvOff: i * 0.37 });
        // bolt strip
        k.add("hull", "metal", xf(boxG(0.03, 0.05, plateL - 0.2), { x: x + side * (trackW / 2 + 0.1), y: fy - 0.06, z }), { detail: true });
      }
      if (skirtDrop > 0.56) {
        // full-depth skirt (stealth / heavy): lower band
        k.add("hull", "paint", xf(boxG(0.06, skirtDrop - skirt, L - 0.6), { x: x + side * (trackW / 2 + 0.06), y: fy - skirt - (skirtDrop - skirt) / 2 + 0.03, z: 0, rz: side * -0.05 }));
      }
    }
    // headlight + tail light on the fender ends
    const hl = boxG(0.22, 0.16, 0.12);
    k.add("hull", "metal", xf(hl, { x: x - side * 0.05, y: fy + 0.12, z: L / 2 - 0.05 }), { detail: false });
    k.add("lights", "glow", xf(boxG(0.16, 0.1, 0.04), { x: x - side * 0.05, y: fy + 0.12, z: L / 2 + 0.02 }), { grime: false, tint: [1, 0.95, 0.8] });
    k.add("lights", "glow", xf(boxG(0.14, 0.07, 0.04), { x: x - side * 0.1, y: fy + 0.06, z: -L / 2 - 0.02 }), { grime: false, tint: [1, 0.12, 0.08] });
  }
  return { fy: Math.max(0.78 + rSprocket, 0.74 + rIdler) + 0.06, xs };
}

/** central hull between the tracks */
function hullShell(k, p) {
  const { L, W, H, trackW, clear = 0.5, noseY = 0.85, glacisLen = 1.5, rearY = 0.55, deckW } = p;
  const bw = W / 2 - trackW + 0.02;
  const tw = deckW ?? W / 2 - 0.05;
  const pts = [
    ...ring([[bw, -L / 2 + 0.35], [bw, L / 2 - 0.45]], clear),
    ...ring([[bw, L / 2]], noseY),
    ...ring([[tw, L / 2 - 0.05]], noseY + 0.12),
    ...ring([[tw, L / 2 - glacisLen]], H),
    ...ring([[tw, -L / 2 + 0.15]], H),
    ...ring([[tw, -L / 2]], H - 0.15),
    ...ring([[bw, -L / 2]], rearY),
  ];
  k.add("hull", "paint", convex(pts), { boxUV: true });
  return { bw, tw };
}

/** engine deck grille + exhausts + stowage */
function rearDeck(k, p, o = {}) {
  const { L, H } = p;
  const gw = o.grilleW ?? 1.3;
  for (let i = 0; i < 6; i++) k.add("hull", "metal", xf(boxG(gw, 0.04, 0.09), { y: H + 0.02, z: -L / 2 + 0.6 + i * 0.17 }), { detail: true });
  k.add("hull", "metal", xf(boxG(gw + 0.15, 0.03, 1.15), { y: H + 0.005, z: -L / 2 + 1.02 }));
  if (o.exhaust !== false)
    for (const s of [1, -1]) {
      const ex = cylG(0.09, 0.11, 0.35, 10);
      ex.rotateX(Math.PI / 2);
      k.add("hull", "metal", xf(ex, { x: s * 0.75, y: H - 0.22, z: -L / 2 - 0.08 }), { detail: true, grime: false, tint: [0.25, 0.22, 0.2] });
    }
  // tow hooks + rear stowage box
  for (const s of [1, -1]) k.add("hull", "metal", xf(boxG(0.12, 0.2, 0.18), { x: s * 0.6, y: 0.62, z: -L / 2 - 0.05 }), { detail: true });
  if (o.box !== false) k.add("hull", "paint", xf(boxG(1.2, 0.35, 0.35), { y: H - 0.05, z: -L / 2 - 0.12 }), { detail: true });
}

function cupola(k, x, y, z, r = 0.32, h = 0.22, mg = true) {
  k.add("turret", "paint", xf(cylG(r, r * 1.08, h, 14), { x, y: y + h / 2, z }));
  k.add("turret", "metal", xf(cylG(r * 0.92, r * 0.92, 0.06, 14), { x, y: y + h + 0.03, z }), { detail: true });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    k.add("turret", "glow", xf(boxG(0.09, 0.05, 0.03), { x: x + Math.sin(a) * r * 1.02, y: y + h * 0.65, z: z + Math.cos(a) * r * 1.02, ry: a }), { detail: true, grime: false, tint: [0.25, 0.55, 0.65] });
  }
  if (mg) {
    const b = barrelG([[0.035, 0], [0.035, 0.8], [0.025, 0.8], [0.025, 0.95]], 8);
    k.add("turret", "metal", xf(b, { x: x + 0.12, y: y + h + 0.16, z: z + 0.1 }), { detail: true });
    k.add("turret", "metal", xf(boxG(0.12, 0.14, 0.32), { x: x + 0.12, y: y + h + 0.14, z }), { detail: true });
  }
}
function smokeLaunchers(k, x, y, z, side, n = 4, ry = 0) {
  for (let i = 0; i < n; i++) {
    const c = cylG(0.055, 0.06, 0.32, 8);
    c.rotateX(Math.PI / 2 - 0.5);
    k.add("turret", "metal", xf(c, { x: x + side * 0.02, y: y + i * 0.1, z: z + i * 0.03, ry: ry + side * 0.5 }), { detail: true });
  }
}
function antenna(k, x, y, z, len = 1.6, layer = "turret") {
  k.add(layer, "metal", xf(cylG(0.012, 0.022, len, 5), { x, y: y + len / 2, z, rx: -0.12 }), { detail: true, grime: false, tint: [0.3, 0.3, 0.3] });
  k.add(layer, "metal", xf(cylG(0.05, 0.05, 0.08, 8), { x, y: y + 0.04, z }), { detail: true });
}
function eraBlocks(k, layer, x0, x1, z, y0, y1, cols, rows, slope = 0, side = 0) {
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const x = x0 + ((x1 - x0) * (c + 0.5)) / cols;
      const y = y0 + ((y1 - y0) * (r + 0.5)) / rows;
      const zz = z - (y - y0) * slope;
      k.add(layer, "paint", xf(boxG(((x1 - x0) / cols) * 0.86, ((y1 - y0) / rows) * 0.8, 0.12), { x, y, z: zz, rx: -Math.atan(slope) }), { detail: true, uvOff: c * 0.3 + r * 0.7 });
    }
}

/* ------------------------------------------------------------------ the eight models */
const MODELS = {
  striker(k) {
    const p = { L: 6.6, W: 3.4, H: 1.6, trackW: 0.62, nWheels: 6, rWheel: 0.37, noseY: 0.78, glacisLen: 1.6 };
    runningGear(k, p);
    hullShell(k, p);
    rearDeck(k, p);
    // driver hatch + periscopes
    k.add("hull", "paint", xf(cylG(0.26, 0.28, 0.08, 12), { x: 0.5, y: p.H + 0.02, z: 1.55 }), { detail: true });
    k.add("hull", "glow", xf(boxG(0.4, 0.05, 0.03), { x: 0.5, y: p.H + 0.08, z: 1.85 }), { detail: true, grime: false, tint: [0.25, 0.55, 0.65] });
    // spare track links on glacis
    for (let i = 0; i < 3; i++) k.add("hull", "metal", xf(boxG(0.34, 0.06, 0.22), { x: -0.7 + i * 0.36, y: 1.27, z: 2.62, rx: -0.85 }), { detail: true });
    // turret: wedge front, bustle rear
    const T = [
      ...ring([[1.05, 1.15], [1.35, 0.5], [1.4, -0.9], [1.2, -1.75], [0.85, -2.05]], 0),
      ...ring([[0.85, 1.25], [1.18, 0.55], [1.25, -0.9], [1.05, -1.7], [0.75, -1.95]], 0.72),
      ...ring([[0.5, 1.55]], 0.32),
    ];
    k.add("turret", "paint", convex(T), { boxUV: true, yOff: p.H });
    k.add("turret", "metal", xf(cylG(1.25, 1.3, 0.12, 20), { y: -0.04, z: -0.3 }), { yOff: p.H });
    cupola(k, -0.55, 0.72, -0.55);
    k.add("turret", "paint", xf(boxG(0.36, 0.36, 0.42), { x: 0.72, y: 0.82, z: 0.25 }), { detail: true, yOff: p.H }); // gunner sight
    k.add("turret", "glow", xf(boxG(0.26, 0.18, 0.03), { x: 0.72, y: 0.84, z: 0.47 }), { detail: true, grime: false, tint: [0.3, 0.7, 0.85] });
    smokeLaunchers(k, 1.18, 0.35, 0.55, 1);
    smokeLaunchers(k, -1.18, 0.35, 0.55, -1);
    antenna(k, -0.85, 0.72, -1.6, 1.9);
    // bustle rack
    for (const s of [1, -1]) k.add("turret", "metal", xf(boxG(0.04, 0.32, 1.1), { x: s * 1.05, y: 0.55, z: -2.15 }), { detail: true });
    k.add("turret", "metal", xf(boxG(2.1, 0.04, 0.04), { y: 0.7, z: -2.68 }), { detail: true });
    k.add("turret", "paint", xf(boxG(1.6, 0.3, 0.5), { y: 0.42, z: -2.3 }), { detail: true });
    // mantlet + barrel
    k.add("gun", "paint", convex([...ring([[0.45, -0.1], [0.38, 0.55]], -0.3), ...ring([[0.45, -0.1], [0.38, 0.55]], 0.3)]), { boxUV: true, yOff: p.H + 0.45 });
    k.add("gun", "metal", barrelG([[0.16, 0.4], [0.15, 1.6], [0.2, 1.75], [0.2, 2.35], [0.14, 2.5], [0.13, 4.0], [0.16, 4.05], [0.16, 4.2], [0.07, 4.2]]), { grime: false, tint: [0.62, 0.62, 0.6] });
    k.add("gun", "paint", barrelG([[0.18, 0.5], [0.18, 1.5]], 14), { detail: true });
  },
  scout(k) {
    const p = { L: 5.6, W: 3.0, H: 1.38, trackW: 0.56, nWheels: 5, rWheel: 0.34, noseY: 0.72, glacisLen: 1.75, clear: 0.48, rSprocket: 0.36, rIdler: 0.33 };
    runningGear(k, p);
    hullShell(k, p);
    rearDeck(k, p, { grilleW: 1.0 });
    // sensor fins on the glacis
    for (const s of [1, -1]) k.add("hull", "paint", convex([V(s * 0.9, p.H, 1.0), V(s * 0.9, p.H, 0.3), V(s * 0.9, p.H + 0.25, 0.4), V(s * 0.95, p.H, 1.0), V(s * 0.95, p.H, 0.3), V(s * 0.95, p.H + 0.25, 0.4)]), { boxUV: true, detail: true });
    // compact faceted turret
    const T = [
      ...ring([[0.8, 0.95], [1.0, 0.25], [0.95, -0.9], [0.65, -1.25]], 0),
      ...ring([[0.55, 0.85], [0.78, 0.25], [0.75, -0.8], [0.5, -1.1]], 0.6),
    ];
    k.add("turret", "paint", convex(T), { boxUV: true, yOff: p.H });
    k.add("turret", "metal", xf(cylG(0.95, 1.0, 0.1, 18), { y: -0.03, z: -0.2 }), { yOff: p.H });
    // sensor mast
    k.add("turret", "metal", xf(cylG(0.04, 0.05, 0.7, 6), { x: -0.45, y: 0.95, z: -0.7 }), { detail: true });
    k.add("turret", "paint", xf(boxG(0.36, 0.2, 0.2), { x: -0.45, y: 1.32, z: -0.7 }), { detail: true });
    k.add("turret", "glow", xf(boxG(0.28, 0.1, 0.03), { x: -0.45, y: 1.33, z: -0.59 }), { detail: true, grime: false, tint: [1, 0.6, 0.25] });
    antenna(k, 0.55, 0.6, -0.95, 1.4);
    k.add("turret", "trim", xf(boxG(0.03, 0.04, 1.4), { x: 0.92, y: 0.3, z: -0.2 }), { grime: false });
    k.add("turret", "trim", xf(boxG(0.03, 0.04, 1.4), { x: -0.92, y: 0.3, z: -0.2 }), { grime: false });
    // autocannon: thin long barrel, ammo box
    k.add("gun", "paint", convex([...ring([[0.3, -0.05], [0.25, 0.45]], -0.2), ...ring([[0.3, -0.05], [0.25, 0.45]], 0.22)]), { boxUV: true, yOff: p.H + 0.45 });
    k.add("gun", "metal", barrelG([[0.09, 0.3], [0.08, 2.5], [0.065, 2.6], [0.065, 3.15], [0.1, 3.18], [0.1, 3.42], [0.04, 3.42]], 14), { grime: false, tint: [0.55, 0.55, 0.55] });
    for (let i = 0; i < 4; i++) k.add("gun", "metal", xf(boxG(0.24, 0.04, 0.08), { z: 3.22 + i * 0.05 }), { detail: true });
  },
  phantom(k) {
    const p = { L: 6.0, W: 3.3, H: 1.28, trackW: 0.6, nWheels: 6, rWheel: 0.33, noseY: 0.62, glacisLen: 2.3, clear: 0.42, skirt: 0.55, skirtDrop: 0.95 };
    runningGear(k, p);
    // sharp faceted stealth hull
    const bw = p.W / 2 - p.trackW + 0.02;
    const pts = [
      ...ring([[bw, -2.7], [bw, 2.5]], 0.42),
      ...ring([[0.45, 3.05]], 0.55),
      ...ring([[1.6, 2.6]], 0.72),
      ...ring([[1.62, 0.6]], p.H),
      ...ring([[1.45, -2.65]], p.H - 0.05),
      ...ring([[1.1, -3.0]], 0.75),
    ];
    k.add("hull", "paint", convex(pts), { boxUV: true });
    // trim light lines along the hull edge
    for (const s of [1, -1]) {
      k.add("hull", "trim", xf(boxG(0.04, 0.035, 2.4), { x: s * 1.6, y: 1.0, z: 1.55, ry: s * -0.48, rx: 0.2 }), { grime: false });
      k.add("hull", "trim", xf(boxG(0.035, 0.035, 3.2), { x: s * 1.62, y: p.H + 0.02, z: -1.05 }), { grime: false });
    }
    rearDeck(k, p, { exhaust: false, box: false, grilleW: 1.2 });
    // low wide turret
    const T = [
      ...ring([[0.35, 1.45], [1.2, 0.45], [1.3, -1.0], [0.95, -1.6]], 0),
      ...ring([[0.25, 1.25], [0.95, 0.4], [1.05, -0.95], [0.7, -1.45]], 0.48),
    ];
    k.add("turret", "paint", convex(T), { boxUV: true, yOff: p.H });
    k.add("turret", "metal", xf(cylG(1.0, 1.05, 0.08, 18), { y: -0.02, z: -0.3 }), { yOff: p.H });
    k.add("turret", "trim", xf(boxG(1.7, 0.03, 0.04), { y: 0.5, z: -1.0 }), { grime: false });
    k.add("turret", "glow", xf(boxG(0.5, 0.06, 0.03), { y: 0.36, z: 1.06, rx: 0.3 }), { detail: true, grime: false, tint: [0.7, 0.4, 1] });
    // plasma projector: emitter rings
    k.add("gun", "paint", convex([...ring([[0.32, -0.1], [0.24, 0.6]], -0.18), ...ring([[0.32, -0.1], [0.24, 0.6]], 0.2)]), { boxUV: true, yOff: p.H + 0.45 });
    k.add("gun", "metal", barrelG([[0.14, 0.4], [0.12, 2.6], [0.17, 2.7], [0.17, 3.35], [0.1, 3.4], [0.05, 3.4]], 16), { grime: false, tint: [0.45, 0.45, 0.5] });
    for (let i = 0; i < 4; i++) k.add("gun", "trim", xf(cylG(0.165, 0.165, 0.06, 16), { z: 1.0 + i * 0.45, rx: Math.PI / 2 }), { grime: false });
  },
  blazer(k) {
    const p = { L: 6.3, W: 3.5, H: 1.6, trackW: 0.64, nWheels: 6, rWheel: 0.37, noseY: 0.85, glacisLen: 1.3 };
    runningGear(k, p);
    hullShell(k, p);
    rearDeck(k, p, { box: false });
    // fuel tanks on the rear deck
    for (const s of [1, -1]) {
      const tank = cylG(0.32, 0.32, 1.6, 14);
      tank.rotateX(Math.PI / 2);
      k.add("hull", "metal", xf(tank, { x: s * 0.62, y: p.H + 0.32, z: -2.2 }), { grime: false, tint: [0.55, 0.3, 0.16] });
      for (const zz of [-2.7, -1.7]) k.add("hull", "metal", xf(cylG(0.34, 0.34, 0.06, 14), { x: s * 0.62, y: p.H + 0.32, z: zz, rx: Math.PI / 2 }), { detail: true });
    }
    // hull heat vents
    for (const s of [1, -1]) for (let i = 0; i < 3; i++) k.add("hull", "trim", xf(boxG(0.05, 0.04, 0.4), { x: s * 1.05, y: p.H + 0.01, z: 0.2 - i * 0.18 }), { grime: false, detail: true });
    // squat rounded turret
    const T = [
      ...ring([[0.9, 1.0], [1.25, 0.3], [1.25, -0.9], [0.95, -1.45]], 0),
      ...ring([[0.7, 0.9], [1.0, 0.3], [1.0, -0.85], [0.75, -1.25]], 0.68),
    ];
    k.add("turret", "paint", convex(T), { boxUV: true, yOff: p.H });
    k.add("turret", "metal", xf(cylG(1.1, 1.15, 0.1, 18), { y: -0.03, z: -0.25 }), { yOff: p.H });
    cupola(k, -0.5, 0.68, -0.5, 0.28, 0.18, false);
    // hoses from the fuel tanks to the gun
    for (const s of [1, -1]) {
      const curve = new THREE.CatmullRomCurve3([V(s * 0.62, -0.05, -2.2 + 0.3), V(s * 0.9, 0.3, -1.2), V(s * 0.75, 0.42, 0.2), V(s * 0.3, 0.45, 0.85)]);
      k.add("turret", "rubber", new THREE.TubeGeometry(curve, 14, 0.055, 6), { detail: true, grime: false, tint: [0.15, 0.13, 0.12], boxUV: true });
    }
    // flamer: armoured housing + flared nozzle with glowing core
    k.add("gun", "paint", convex([...ring([[0.48, -0.1], [0.42, 0.75]], -0.32), ...ring([[0.48, -0.1], [0.42, 0.75]], 0.34)]), { boxUV: true, yOff: p.H + 0.45 });
    k.add("gun", "metal", barrelG([[0.26, 0.7], [0.24, 1.6], [0.2, 1.8], [0.2, 2.2], [0.3, 2.45], [0.34, 2.6], [0.2, 2.6]], 18), { grime: false, tint: [0.4, 0.38, 0.36] });
    for (let i = 0; i < 3; i++) k.add("gun", "metal", xf(cylG(0.27, 0.27, 0.07, 16), { z: 0.95 + i * 0.25, rx: Math.PI / 2 }), { detail: true, grime: false, tint: [0.25, 0.25, 0.25] });
    k.add("gun", "trim", xf(cylG(0.15, 0.15, 0.05, 14), { z: 2.56, rx: Math.PI / 2 }), { grime: false });
  },
  thunder(k) {
    const p = { L: 6.5, W: 3.5, H: 1.6, trackW: 0.64, nWheels: 6, rWheel: 0.37, noseY: 0.8, glacisLen: 1.55 };
    runningGear(k, p);
    hullShell(k, p);
    rearDeck(k, p);
    const T = [
      ...ring([[0.95, 1.0], [1.3, 0.35], [1.3, -1.1], [1.0, -1.7]], 0),
      ...ring([[0.8, 0.95], [1.12, 0.35], [1.12, -1.0], [0.85, -1.55]], 0.74),
    ];
    k.add("turret", "paint", convex(T), { boxUV: true, yOff: p.H });
    k.add("turret", "metal", xf(cylG(1.15, 1.2, 0.1, 18), { y: -0.03, z: -0.3 }), { yOff: p.H });
    // ammo drum on the right cheek + feed chute
    const drum = cylG(0.45, 0.45, 0.5, 18);
    drum.rotateZ(Math.PI / 2);
    k.add("turret", "metal", xf(drum, { x: -1.42, y: 0.42, z: -0.35 }), { grime: false, tint: [0.5, 0.48, 0.4] });
    k.add("turret", "metal", xf(boxG(0.3, 0.16, 0.9), { x: -1.2, y: 0.55, z: 0.25, ry: 0.25 }), { detail: true });
    cupola(k, 0.5, 0.74, -0.6);
    smokeLaunchers(k, 1.28, 0.38, 0.6, 1, 3);
    antenna(k, -0.7, 0.74, -1.4, 1.7);
    k.add("gun", "paint", convex([...ring([[0.44, -0.1], [0.36, 0.7]], -0.34), ...ring([[0.44, -0.1], [0.36, 0.7]], 0.34)]), { boxUV: true, yOff: p.H + 0.45 });
    // rotary barrel cluster (spins while firing)
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      k.add("spin", "metal", xf(barrelG([[0.06, 0.6], [0.06, 3.2], [0.075, 3.25], [0.075, 3.4], [0.03, 3.4]], 10), { x: Math.cos(a) * 0.17, y: Math.sin(a) * 0.17 }), { grime: false, tint: [0.5, 0.5, 0.5] });
    }
    for (const z of [0.9, 2.1, 3.0]) k.add("spin", "metal", xf(cylG(0.26, 0.26, 0.09, 14), { z, rx: Math.PI / 2 }), { grime: false, tint: [0.35, 0.35, 0.35] });
    k.add("gun", "metal", barrelG([[0.28, 0.5], [0.28, 0.95], [0.2, 1.0]], 16), { grime: false, tint: [0.4, 0.4, 0.4] });
  },
  guardian(k) {
    const p = { L: 7.1, W: 3.9, H: 1.75, trackW: 0.72, nWheels: 7, rWheel: 0.38, noseY: 0.9, glacisLen: 1.7, skirt: 0.62, skirtDrop: 0.9 };
    runningGear(k, p);
    hullShell(k, p);
    rearDeck(k, p);
    // ERA tiles on the glacis
    eraBlocks(k, "hull", -1.2, 1.2, 3.42, 1.0, 1.65, 5, 2, 1.25);
    // dozer blade
    k.add("hull", "metal", convex([...ring([[1.75, 3.85], [1.75, 3.6]], 0.25), ...ring([[1.75, 3.7], [1.75, 3.5]], 0.85)]), { boxUV: true, detail: false, tint: [0.55, 0.53, 0.5] });
    for (const s of [1, -1]) k.add("hull", "metal", xf(boxG(0.12, 0.12, 0.8), { x: s * 1.0, y: 0.6, z: 3.25, rx: -0.4 }), { detail: true });
    // massive angular turret with spaced armour
    const T = [
      ...ring([[1.25, 1.45], [1.6, 0.6], [1.62, -1.0], [1.35, -2.05], [1.0, -2.35]], 0),
      ...ring([[1.0, 1.5], [1.38, 0.62], [1.42, -0.95], [1.2, -1.95], [0.85, -2.2]], 0.85),
      ...ring([[0.55, 1.9]], 0.4),
    ];
    k.add("turret", "paint", convex(T), { boxUV: true, yOff: p.H });
    for (const s of [1, -1]) {
      k.add("turret", "paint", convex([V(s * 1.62, 0.1, 0.9), V(s * 1.62, 0.8, 0.9), V(s * 1.7, 0.1, -0.6), V(s * 1.7, 0.8, -0.6), V(s * 1.78, 0.1, 0.85), V(s * 1.78, 0.8, 0.85), V(s * 1.84, 0.1, -0.6), V(s * 1.84, 0.8, -0.6)]), { boxUV: true, yOff: p.H, uvOff: 0.5 });
      eraBlocks(k, "turret", s > 0 ? 0.55 : -1.25, s > 0 ? 1.25 : -0.55, 1.62, 0.15, 0.75, 2, 2, 0.7);
    }
    k.add("turret", "metal", xf(cylG(1.45, 1.5, 0.12, 20), { y: -0.04, z: -0.4 }), { yOff: p.H });
    cupola(k, -0.65, 0.85, -0.7, 0.36, 0.25);
    // shield emitter dome
    k.add("turret", "metal", xf(new THREE.SphereGeometry(0.3, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), { x: 0.6, y: 0.85, z: -1.2 }), { grime: false, tint: [0.4, 0.42, 0.45] });
    k.add("turret", "trim", xf(cylG(0.31, 0.31, 0.05, 14), { x: 0.6, y: 0.87, z: -1.2 }), { grime: false });
    smokeLaunchers(k, 1.55, 0.45, 0.2, 1, 4);
    smokeLaunchers(k, -1.55, 0.45, 0.2, -1, 4);
    antenna(k, -1.0, 0.85, -1.9, 2.0);
    k.add("gun", "paint", convex([...ring([[0.58, -0.1], [0.5, 0.7]], -0.4), ...ring([[0.58, -0.1], [0.5, 0.7]], 0.4)]), { boxUV: true, yOff: p.H + 0.45 });
    k.add("gun", "metal", barrelG([[0.21, 0.5], [0.2, 1.8], [0.26, 1.95], [0.26, 2.55], [0.19, 2.7], [0.18, 3.55], [0.27, 3.6], [0.27, 4.0], [0.1, 4.0]], 18), { grime: false, tint: [0.58, 0.58, 0.56] });
    for (const s of [1, -1]) k.add("gun", "metal", xf(boxG(0.1, 0.3, 0.32), { x: s * 0.27, z: 3.82 }), { detail: true });
  },
  sniper(k) {
    const p = { L: 6.8, W: 3.3, H: 1.5, trackW: 0.6, nWheels: 6, rWheel: 0.36, noseY: 0.72, glacisLen: 2.1 };
    runningGear(k, p);
    hullShell(k, p);
    rearDeck(k, p, { box: false });
    // capacitor banks on the rear deck
    for (const s of [1, -1]) {
      k.add("hull", "metal", xf(boxG(0.55, 0.32, 1.3), { x: s * 0.7, y: p.H + 0.16, z: -2.3 }), { grime: false, tint: [0.4, 0.42, 0.46] });
      k.add("hull", "trim", xf(boxG(0.56, 0.04, 1.0), { x: s * 0.7, y: p.H + 0.33, z: -2.3 }), { grime: false });
    }
    // low turret set back
    const T = [
      ...ring([[0.75, 1.0], [1.15, 0.35], [1.18, -1.05], [0.9, -1.6]], 0),
      ...ring([[0.55, 0.9], [0.95, 0.32], [0.98, -0.95], [0.72, -1.45]], 0.62),
    ];
    k.add("turret", "paint", convex(T), { boxUV: true, yOff: p.H });
    k.add("turret", "metal", xf(cylG(1.05, 1.1, 0.1, 18), { y: -0.03, z: -0.3 }), { yOff: p.H });
    // targeting optic dish
    k.add("turret", "metal", xf(cylG(0.08, 0.1, 0.4, 8), { x: -0.6, y: 0.82, z: -0.5 }), { detail: true });
    const dish = new THREE.SphereGeometry(0.32, 14, 8, 0, Math.PI * 2, 0, Math.PI / 3);
    dish.rotateX(Math.PI / 2);
    k.add("turret", "metal", xf(dish, { x: -0.6, y: 1.12, z: -0.4 }), { detail: true, grime: false, tint: [0.6, 0.62, 0.66] });
    k.add("turret", "glow", xf(boxG(0.34, 0.16, 0.03), { x: 0.62, y: 0.7, z: 0.68 }), { detail: true, grime: false, tint: [0.3, 0.8, 1] });
    antenna(k, 0.7, 0.62, -1.3, 1.5);
    // rail cannon: twin rails, coil rings, cooling fins
    k.add("gun", "paint", convex([...ring([[0.36, -0.1], [0.3, 0.7]], -0.24), ...ring([[0.36, -0.1], [0.3, 0.7]], 0.26)]), { boxUV: true, yOff: p.H + 0.45 });
    for (const s of [1, -1]) k.add("gun", "metal", xf(boxG(0.08, 0.22, 5.0), { x: s * 0.12, z: 3.0 }), { grime: false, tint: [0.42, 0.43, 0.46] });
    k.add("gun", "metal", xf(boxG(0.2, 0.06, 5.0), { y: -0.1, z: 3.0 }), { grime: false, tint: [0.3, 0.3, 0.32] });
    for (let i = 0; i < 6; i++) k.add("gun", "trim", xf(boxG(0.36, 0.3, 0.06), { z: 1.1 + i * 0.72 }), { grime: false });
    for (let i = 0; i < 5; i++) k.add("gun", "metal", xf(boxG(0.44, 0.03, 0.04), { y: 0.13, z: 0.85 + i * 0.12 }), { detail: true });
    k.add("gun", "metal", xf(boxG(0.34, 0.3, 0.2), { z: 5.5 }), { grime: false, tint: [0.35, 0.35, 0.38] });
  },
  titan(k) {
    const p = { L: 8.0, W: 4.3, H: 1.95, trackW: 0.82, nWheels: 8, rWheel: 0.4, noseY: 1.0, glacisLen: 2.0, rSprocket: 0.48, rIdler: 0.44, skirt: 0.7, skirtDrop: 1.0 };
    runningGear(k, p);
    hullShell(k, p);
    rearDeck(k, p, { grilleW: 1.6 });
    eraBlocks(k, "hull", -1.4, 1.4, 3.93, 1.1, 1.85, 6, 2, 1.25);
    // add-on armour slabs on the hull sides
    for (const s of [1, -1]) k.add("hull", "paint", xf(boxG(0.1, 0.5, 5.5), { x: s * 2.24, y: 1.55, z: 0.1, rz: s * -0.12 }), { uvOff: 0.4 });
    // huge turret
    const T = [
      ...ring([[1.35, 1.6], [1.75, 0.7], [1.8, -1.2], [1.5, -2.4], [1.1, -2.7]], 0),
      ...ring([[1.1, 1.6], [1.5, 0.7], [1.55, -1.15], [1.3, -2.25], [0.95, -2.55]], 1.0),
      ...ring([[0.6, 2.05]], 0.5),
    ];
    k.add("turret", "paint", convex(T), { boxUV: true, yOff: p.H });
    k.add("turret", "metal", xf(cylG(1.6, 1.65, 0.14, 22), { y: -0.05, z: -0.5 }), { yOff: p.H });
    // rocket pods (barrage visual) on both sides
    for (const s of [1, -1]) {
      k.add("turret", "paint", xf(boxG(0.6, 0.55, 1.4), { x: s * 2.05, y: 0.6, z: -0.6 }), { uvOff: 0.3 });
      for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) k.add("turret", "metal", xf(cylG(0.075, 0.075, 0.05, 8), { x: s * 2.05 + (c - 1) * 0.17, y: 0.48 + r * 0.22, z: 0.12, rx: Math.PI / 2 }), { detail: true, grime: false, tint: [0.12, 0.12, 0.12] });
      k.add("turret", "trim", xf(boxG(0.62, 0.04, 0.04), { x: s * 2.05, y: 0.9, z: 0.1 }), { grime: false });
    }
    cupola(k, -0.7, 1.0, -0.9, 0.38, 0.26);
    cupola(k, 0.75, 1.0, -1.2, 0.3, 0.18, false);
    antenna(k, -1.1, 1.0, -2.2, 2.2);
    antenna(k, 1.1, 1.0, -2.2, 1.6);
    k.add("gun", "paint", convex([...ring([[0.66, -0.15], [0.56, 0.85]], -0.46), ...ring([[0.66, -0.15], [0.56, 0.85]], 0.46)]), { boxUV: true, yOff: p.H + 0.45 });
    k.add("gun", "metal", barrelG([[0.26, 0.6], [0.25, 2.2], [0.32, 2.35], [0.32, 3.0], [0.24, 3.15], [0.23, 4.05], [0.36, 4.1], [0.36, 4.6], [0.14, 4.6]], 18), { grime: false, tint: [0.55, 0.55, 0.53] });
    for (const s of [1, -1]) for (let i = 0; i < 3; i++) k.add("gun", "metal", xf(boxG(0.12, 0.42, 0.1), { x: s * 0.34, z: 4.18 + i * 0.15 }), { detail: true });
  },
};

/* ------------------------------------------------------------------ build + cache */
function buildModelGeos(model) {
  if (geoCache.has(model)) return geoCache.get(model);
  const k = createKit();
  (MODELS[model] || MODELS.striker)(k);
  const out = { full: {}, lite: {} };
  const groups = {};
  for (const p of k.parts) {
    const key = p.layer + "|" + p.mat;
    (groups[key] = groups[key] || []).push(p);
  }
  for (const [key, list] of Object.entries(groups)) {
    const [layer, mat] = key.split("|");
    const attach = (g, p) => {
      if (layer === "wheels") {
        const n = g.attributes.position.count;
        const a = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) {
          a[i * 3] = p.wheel[0];
          a[i * 3 + 1] = p.wheel[1];
          a[i * 3 + 2] = p.wheel[2] * p.side;
        }
        g.setAttribute("aWheel", new THREE.BufferAttribute(a, 3));
      }
      if (layer === "tread") {
        const n = g.attributes.position.count;
        g.setAttribute("aSide", new THREE.BufferAttribute(new Float32Array(n).fill(p.side), 1));
      }
      return g;
    };
    const full = list.map((p) => attach(p.geo, p));
    out.full[key] = mergeGeometries(full);
    const liteList = list.filter((p) => !p.detail);
    out.lite[key] = liteList.length === list.length ? out.full[key] : liteList.length ? mergeGeometries(liteList.map((p) => p.geo)) : null;
    for (const g of full) if (g !== out.full[key]) g.dispose?.();
  }
  geoCache.set(model, out);
  return out;
}

function paintMat(skin) {
  const key = "paint|" + skin.id + "|" + skin.base + skin.accent + skin.pattern;
  if (matCache.has(key)) return matCache.get(key);
  const t = texSet("camo", texSize, { base: skin.base, accent: skin.accent, detail: skin.detail, pattern: skin.pattern });
  const m = new THREE.MeshStandardMaterial({ map: t.map, normalMap: t.normalMap, roughnessMap: t.roughnessMap, metalness: 0.42, roughness: 1, vertexColors: true, normalScale: new THREE.Vector2(0.8, 0.8), envMapIntensity: 1.0 });
  matCache.set(key, m);
  return m;
}
function sharedMat(name) {
  if (matCache.has(name)) return matCache.get(name);
  let m;
  if (name === "metal") {
    const t = texSet("metal", texSize, { panels: 1 });
    m = new THREE.MeshStandardMaterial({ color: "#5b5d60", map: t.map, normalMap: t.normalMap, roughnessMap: t.roughnessMap, metalness: 0.75, roughness: 0.9, vertexColors: true });
  } else if (name === "rubber") {
    const t = texSet("metal", Math.min(256, texSize), { panels: 2 });
    m = new THREE.MeshStandardMaterial({ color: "#6a6a68", map: t.map, roughness: 0.75, metalness: 0.45, vertexColors: true });
  } else if (name === "glow") m = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, color: new THREE.Color(2.2, 2.2, 2.2) });
  else if (name === "wreck") {
    const t = texSet("rock", Math.min(256, texSize), { c0: "#3a3530", c1: "#141210" });
    m = new THREE.MeshStandardMaterial({ map: t.map, normalMap: t.normalMap, color: "#6a625a", roughness: 0.95, metalness: 0.2, vertexColors: true });
  }
  matCache.set(name, m);
  return m;
}
/** per-instance animated materials (wheel spin / tread scroll uniforms) */
function animMats() {
  const tread = texSet("tread", Math.min(256, texSize));
  const U = { uDistL: { value: 0 }, uDistR: { value: 0 } };
  const wheels = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.55, roughness: 0.6, color: "#808080" });
  wheels.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nattribute vec3 aWheel;\nuniform float uDistL;\nuniform float uDistR;\nvec2 ia_rot(vec2 p, float a){ float c = cos(a), s = sin(a); return vec2(p.x * c - p.y * s, p.x * s + p.y * c); }")
      .replace("#include <beginnormal_vertex>", "#include <beginnormal_vertex>\nfloat ia_a = (aWheel.z > 0.0 ? uDistL : uDistR) / max(0.05, abs(aWheel.z));\nobjectNormal.yz = ia_rot(objectNormal.yz, ia_a);")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\ntransformed.yz = aWheel.xy + ia_rot(transformed.yz - aWheel.xy, ia_a);");
  };
  wheels.customProgramCacheKey = () => "ia-wheels";
  const treadMat = new THREE.MeshStandardMaterial({ map: tread.map, normalMap: tread.normalMap, roughnessMap: tread.roughnessMap, metalness: 0.6, roughness: 1, color: "#9a9792", vertexColors: true });
  treadMat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float aSide;\nuniform float uDistL;\nuniform float uDistR;")
      .replace("#include <uv_vertex>", "#include <uv_vertex>\n#ifdef USE_MAP\nvMapUv.x -= (aSide > 0.0 ? uDistL : uDistR) / 1.6;\n#endif\n#ifdef USE_NORMALMAP\nvNormalMapUv.x -= (aSide > 0.0 ? uDistL : uDistR) / 1.6;\n#endif\n#ifdef USE_ROUGHNESSMAP\nvRoughnessMapUv.x -= (aSide > 0.0 ? uDistL : uDistR) / 1.6;\n#endif");
  };
  treadMat.customProgramCacheKey = () => "ia-tread";
  return { wheels, tread: treadMat, U };
}

/**
 * Build a tank view. `skinRef` = { tank, id } or { tank, team }.
 * Returns { root, body, turret, gun, barrel, spin, muzzle, update(pose), setLOD, setWreck, dispose, ... }.
 */
export function createTankView(model, skinRef, opts = {}) {
  const geos = buildModelGeos(model);
  const skin = skinRef.team != null ? TEAM_SKIN[skinRef.team] : skinFor(skinRef.tank || model, skinRef.id);
  const paint = paintMat(skin);
  const metal = sharedMat("metal");
  const rubber = sharedMat("rubber");
  const glow = sharedMat("glow");
  const trim = new THREE.MeshBasicMaterial({ color: new THREE.Color(skin.trim).multiplyScalar(2.4), toneMapped: false });
  const anim = animMats();
  const dims = DIMS[model] || DIMS.striker;
  const matFor = (m) => (m === "paint" ? paint : m === "metal" ? metal : m === "rubber" ? (opts.wheelsAnim === false ? rubber : anim.wheels) : m === "glow" ? glow : m === "trim" ? trim : m === "tread" ? anim.tread : metal);

  const root = new THREE.Group();
  root.name = "tank-" + model;
  const body = new THREE.Group();
  root.add(body);
  const turret = new THREE.Group();
  turret.position.set(0, dims.hgt, dims.pivotZ);
  body.add(turret);
  const gun = new THREE.Group();
  gun.position.set(0, 0.45, 0);
  turret.add(gun);
  const barrel = new THREE.Group();
  gun.add(barrel);
  const spin = new THREE.Group();
  barrel.add(spin);
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0, dims.barrel);
  gun.add(muzzle);

  const meshes = { full: [], lite: [] };
  const parentFor = (layer) => (layer === "turret" ? turret : layer === "gun" ? barrel : layer === "spin" ? spin : body);
  for (const lod of ["full", "lite"]) {
    for (const [key, g] of Object.entries(geos[lod])) {
      if (!g) continue;
      if (lod === "lite" && g === geos.full[key]) continue; // shared
      const [layer, mat] = key.split("|");
      const material = layer === "wheels" ? anim.wheels : layer === "tread" ? anim.tread : matFor(mat);
      const mesh = new THREE.Mesh(g, material);
      mesh.castShadow = mat !== "glow" && mat !== "trim";
      mesh.receiveShadow = mat !== "glow" && mat !== "trim";
      mesh.userData.mat = mat;
      parentFor(layer).add(mesh);
      meshes[lod].push(mesh);
      if (lod === "lite") mesh.visible = false;
    }
  }
  // meshes shared by both LODs stay visible always; full-only meshes toggle
  const fullOnly = meshes.full.filter((m) => {
    const key = Object.keys(geos.full).find((k) => geos.full[k] === m.geometry);
    return key && geos.lite[key] !== geos.full[key];
  });
  let lod = 0;
  function setLOD(l) {
    if (l === lod) return;
    lod = l;
    for (const m of fullOnly) m.visible = l === 0;
    for (const m of meshes.lite) m.visible = l === 1;
  }
  function setShadows(on) {
    root.traverse((o) => {
      if (o.isMesh && o.userData.mat !== "glow" && o.userData.mat !== "trim") o.castShadow = on;
    });
  }
  let wreck = false;
  function setWreck(on) {
    if (on === wreck) return;
    wreck = on;
    const w = sharedMat("wreck");
    root.traverse((o) => {
      if (!o.isMesh) return;
      if (on) {
        o.userData.orig = o.userData.orig || o.material;
        if (o.userData.mat === "glow" || o.userData.mat === "trim") o.visible = false;
        else o.material = w;
      } else {
        if (o.userData.orig) o.material = o.userData.orig;
        if (o.userData.mat === "glow" || o.userData.mat === "trim") o.visible = true;
      }
    });
    if (!on) {
      turret.position.set(0, dims.hgt, dims.pivotZ);
      turret.rotation.set(0, turret.rotation.y, 0);
      setLOD(lod === 1 ? 1 : 0);
    }
  }
  let ghost = 0;
  function setGhost(a) {
    // cloak: 0 = visible … 1 = almost invisible shimmer
    if (Math.abs(a - ghost) < 0.01) return;
    ghost = a;
    root.traverse((o) => {
      if (!o.isMesh) return;
      if (a > 0.01) {
        if (!o.userData.ghostMat) {
          o.userData.ghostMat = new THREE.MeshStandardMaterial({ color: "#9fb6ff", metalness: 1, roughness: 0.05, transparent: true, depthWrite: false, opacity: 0.2, envMapIntensity: 2 });
          o.userData.preGhost = o.material;
        }
        if (o.material !== o.userData.ghostMat) {
          o.userData.preGhost = o.material;
          o.material = o.userData.ghostMat;
        }
        o.userData.ghostMat.opacity = 0.35 * (1 - a) + 0.07;
        o.castShadow = false;
      } else if (o.userData.preGhost) {
        o.material = o.userData.preGhost;
        o.castShadow = o.userData.mat !== "glow" && o.userData.mat !== "trim";
      }
    });
  }
  function dispose() {
    trim.dispose();
    anim.wheels.dispose();
    anim.tread.dispose();
    root.traverse((o) => {
      if (o.userData.ghostMat) o.userData.ghostMat.dispose();
    });
    root.removeFromParent();
  }
  return { root, body, turret, gun, barrel, spin, muzzle, dims, anim, skin, setLOD, setShadows, setWreck, setGhost, dispose, trim };
}

export function disposeTankCache() {
  for (const g of geoCache.values()) for (const lod of ["full", "lite"]) for (const x of Object.values(g[lod])) x?.dispose();
  geoCache.clear();
  for (const m of matCache.values()) m.dispose();
  matCache.clear();
}
