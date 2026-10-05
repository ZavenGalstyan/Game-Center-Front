/**
 * Train Commander — geometry helpers for every procedural model.
 *
 * Models are built from primitive pieces, each painted with a vertex colour,
 * then MERGED into one BufferGeometry, so a whole locomotive body is one or
 * two draw calls. Geometries are cached by key and built once; nothing here
 * runs per frame. (Same approach as Castle Rush, kept local so the two games
 * never couple.)
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

const cache = new Map();
export function cached(key, make) {
  let g = cache.get(key);
  if (!g) {
    g = make();
    g.userData.shared = true;
    cache.set(key, g);
  }
  return g;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

/** transform a geometry in place: position, euler rotation, scale */
export function T(g, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  _m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz));
  g.applyMatrix4(_m);
  return g;
}

/** paint a geometry one colour (optional per-face lightness jitter 0..1) */
export function paint(geo, color, jitter = 0, seed = 1) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  for (const k of Object.keys(g.attributes)) if (k !== "position" && k !== "normal") g.deleteAttribute(k);
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  _c.set(color);
  let s = seed * 9301 + 49297;
  const base = _c.clone();
  for (let i = 0; i < n; i += 3) {
    let k = 1;
    if (jitter) {
      s = (s * 9301 + 49297) % 233280;
      k = 1 + (s / 233280 - 0.5) * jitter;
    }
    for (let v = 0; v < 3 && i + v < n; v++) {
      col[(i + v) * 3] = base.r * k;
      col[(i + v) * 3 + 1] = base.g * k;
      col[(i + v) * 3 + 2] = base.b * k;
    }
  }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  return g;
}

/** paint with a vertical gradient (bottom colour → top colour) */
export function paintY(geo, bottom, top, y0, y1) {
  const g = paint(geo, "#ffffff");
  const pos = g.attributes.position;
  const col = g.attributes.color;
  const a = new THREE.Color(bottom);
  const b = new THREE.Color(top);
  for (let i = 0; i < pos.count; i++) {
    const k = Math.min(1, Math.max(0, (pos.getY(i) - y0) / (y1 - y0 || 1)));
    _c.copy(a).lerp(b, k);
    col.setXYZ(i, _c.r, _c.g, _c.b);
  }
  return g;
}

/** merge painted geometries (consumes the inputs) */
export function merge(list) {
  const flat = list.filter(Boolean).map((x) => (x.index ? x.toNonIndexed() : x));
  for (const g of flat) {
    if (!g.attributes.color) paint(g, "#ff00ff");
    for (const k of Object.keys(g.attributes)) if (k !== "position" && k !== "normal" && k !== "color") g.deleteAttribute(k);
  }
  const g = mergeGeometries(flat, false);
  flat.forEach((x) => x.dispose());
  // keep each primitive's own normals: cylinders stay smooth, boxes crisp
  if (!g.attributes.normal) g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

/* ---------------------------------------------------------------- shapes */
export const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
export const cyl = (rt, rb, h, s = 12, open = false) => new THREE.CylinderGeometry(rt, rb, h, s, 1, open);
export const cone = (r, h, s = 8) => new THREE.ConeGeometry(r, h, s);
export const sph = (r, w = 12, h = 8) => new THREE.SphereGeometry(r, w, h);
export const ico = (r, d = 0) => new THREE.IcosahedronGeometry(r, d);
export const dodec = (r) => new THREE.DodecahedronGeometry(r, 0);
export const torus = (r, t, rs = 6, ts = 16, arc = Math.PI * 2) => new THREE.TorusGeometry(r, t, rs, ts, arc);
export const capsule = (r, l, c = 3, rs = 8) => new THREE.CapsuleGeometry(r, l, c, rs);
/** half-sphere dome (open bottom) */
export const dome = (r, w = 14, h = 6) => new THREE.SphereGeometry(r, w, h, 0, Math.PI * 2, 0, Math.PI / 2);

/** a cylinder lying along X */
export const cylX = (r, len, s = 14, r2 = r) => T(cyl(r2, r, len, s), 0, 0, 0, 0, 0, -Math.PI / 2);
/** a cylinder lying along Z (wheels, axles) */
export const cylZ = (r, len, s = 14) => T(cyl(r, r, len, s), 0, 0, 0, Math.PI / 2, 0, 0);

/** extruded 2D profile (in the XY plane) with depth along Z, centred */
export function prism(points, depth, bevel = 0) {
  const s = new THREE.Shape();
  points.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 1, curveSegments: 8 });
  g.translate(0, 0, -depth / 2);
  return g;
}

/** a row of rivets (small domes) from (x0,y,z) to (x1,y,z), facing ±Z */
export function rivetsX(x0, x1, y, z, n, r = 0.035, face = 1) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const x = n === 1 ? x0 : x0 + ((x1 - x0) * i) / (n - 1);
    out.push(T(sph(r, 5, 3), x, y, z + face * 0.005, 0, 0, 0, 1, 1, 0.55));
  }
  return out;
}
/** rivets in a vertical column facing ±Z */
export function rivetsY(x, y0, y1, z, n, r = 0.035, face = 1) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const y = n === 1 ? y0 : y0 + ((y1 - y0) * i) / (n - 1);
    out.push(T(sph(r, 5, 3), x, y, z + face * 0.005, 0, 0, 0, 1, 1, 0.55));
  }
  return out;
}

/** mirror a list of geometries across Z (clone + scale z −1, winding fixed) */
export function mirrorZ(list) {
  return list.map((g) => {
    const c = g.clone();
    c.scale(1, 1, -1);
    // flip winding so normals stay outward
    const idx = c.index;
    if (idx) {
      for (let i = 0; i < idx.count; i += 3) {
        const a = idx.getX(i + 1);
        idx.setX(i + 1, idx.getX(i + 2));
        idx.setX(i + 2, a);
      }
    } else {
      const pos = c.attributes.position;
      const col = c.attributes.color;
      for (let i = 0; i < pos.count; i += 3) {
        for (const attr of [pos, col, c.attributes.normal]) {
          if (!attr) continue;
          const ax = attr.getX(i + 1);
          const ay = attr.getY(i + 1);
          const az = attr.getZ(i + 1);
          attr.setXYZ(i + 1, attr.getX(i + 2), attr.getY(i + 2), attr.getZ(i + 2));
          attr.setXYZ(i + 2, ax, ay, az);
        }
      }
    }
    return c;
  });
}

/** deterministic PRNG */
export function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/* ---------------------------------------------------------------- materials */
const mats = new Map();
/** shared vertex-coloured material */
export function vcMat(key = "std", opt = {}) {
  let m = mats.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.82, metalness: 0, ...opt });
    m.userData.shared = true;
    mats.set(key, m);
  }
  return m;
}
export function basicMat(key, opt) {
  let m = mats.get(key);
  if (!m) {
    m = new THREE.MeshBasicMaterial(opt);
    m.userData.shared = true;
    mats.set(key, m);
  }
  return m;
}
export function stdMat(key, opt) {
  let m = mats.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial(opt);
    m.userData.shared = true;
    mats.set(key, m);
  }
  return m;
}

/** dispose a group's non-shared geometries/materials */
export function disposeTree(root) {
  root.traverse((o) => {
    if (o.geometry && !o.geometry.userData?.shared) o.geometry.dispose?.();
    const m = o.material;
    if (Array.isArray(m)) m.forEach((x) => !x.userData?.shared && x.dispose?.());
    else if (m && !m.userData?.shared) m.dispose?.();
  });
}
