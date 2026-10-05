/**
 * Island Conquest — geometry helpers for every procedural model.
 *
 * Pieces are painted with vertex colours and MERGED, so a whole island (rock,
 * beach, grass, trees, houses, walls) is one geometry + one shared material:
 * one draw call per island. Everything is built once per level load and
 * disposed on unload — nothing here runs per frame.
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

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

/** strip to position+normal, de-index, paint one colour (+ per-face jitter) */
export function paint(geo, color, jitter = 0, seed = 1) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) geo.dispose();
  for (const k of Object.keys(g.attributes)) if (k !== "position" && k !== "normal") g.deleteAttribute(k);
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  _c.set(color);
  let s = (seed * 9301 + 49297) % 233280;
  for (let i = 0; i < n; i += 3) {
    let k = 1;
    if (jitter) {
      s = (s * 9301 + 49297) % 233280;
      k = 1 + (s / 233280 - 0.5) * jitter;
    }
    for (let v = 0; v < 3 && i + v < n; v++) {
      col[(i + v) * 3] = _c.r * k;
      col[(i + v) * 3 + 1] = _c.g * k;
      col[(i + v) * 3 + 2] = _c.b * k;
    }
  }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  return g;
}

export function merge(list) {
  if (!list.length) return null;
  const g = mergeGeometries(list, false);
  list.forEach((x) => x.dispose());
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

export const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
export const cyl = (rt, rb, h, s = 8) => new THREE.CylinderGeometry(rt, rb, h, s, 1);
export const cone = (r, h, s = 8) => new THREE.ConeGeometry(r, h, s);
export const sph = (r, w = 8, h = 6) => new THREE.SphereGeometry(r, w, h);
export const ico = (r, d = 0) => new THREE.IcosahedronGeometry(r, d);
export const dodec = (r) => new THREE.DodecahedronGeometry(r, 0);

/** gable roof (triangular prism) along X, width w, depth d, height h */
export function gable(w, d, h) {
  const s = new THREE.Shape();
  s.moveTo(-d / 2, 0);
  s.lineTo(d / 2, 0);
  s.lineTo(0, h);
  s.lineTo(-d / 2, 0);
  const g = new THREE.ExtrudeGeometry(s, { depth: w, bevelEnabled: false });
  g.translate(0, 0, -w / 2);
  g.rotateY(Math.PI / 2);
  return g;
}

/** deterministic PRNG */
export function rng(seed) {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** shared materials by key — created once, reused by every island/boat */
const mats = new Map();
export function vcMat(key = "std", opt = {}) {
  let m = mats.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9, metalness: 0, ...opt });
    mats.set(key, m);
  }
  return m;
}
export function getMat(key, make) {
  let m = mats.get(key);
  if (!m) {
    m = make();
    mats.set(key, m);
  }
  return m;
}
