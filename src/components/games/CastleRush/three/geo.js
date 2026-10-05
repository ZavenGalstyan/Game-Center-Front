/**
 * Castle Rush — geometry helpers shared by every procedural model.
 *
 * Models are built from primitive pieces, each painted with a vertex colour,
 * then MERGED into one BufferGeometry so a castle wall or a soldier's forearm
 * (with its sword) is a single draw call with a single material. Geometries
 * are cached by key and built once; nothing here runs per frame.
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

const cache = new Map();
export function cached(key, make) {
  let g = cache.get(key);
  if (!g) {
    g = make();
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

/**
 * Paint a geometry with one colour (optionally jittered per face for a
 * hand-made look). `jitter` 0..1 = lightness variation.
 */
export function paint(geo, color, jitter = 0, seed = 1) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  for (const k of Object.keys(g.attributes)) if (k !== "position" && k !== "normal") g.deleteAttribute(k);
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  _c.set(color);
  let s = seed * 9301 + 49297;
  const base = _c.clone();
  for (let i = 0; i < n; i += 3) {
    let r = base.r;
    let gg = base.g;
    let b = base.b;
    if (jitter) {
      s = (s * 9301 + 49297) % 233280;
      const k = 1 + (s / 233280 - 0.5) * jitter;
      r *= k;
      gg *= k;
      b *= k;
    }
    for (let v = 0; v < 3 && i + v < n; v++) {
      col[(i + v) * 3] = r;
      col[(i + v) * 3 + 1] = gg;
      col[(i + v) * 3 + 2] = b;
    }
  }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  return g;
}

/** merge painted geometries; optional world-scale box-projected UVs */
export function merge(list, uvScale = 0) {
  const g = mergeGeometries(list, false);
  list.forEach((x) => x.dispose());
  g.computeVertexNormals();
  if (uvScale) worldUV(g, uvScale);
  g.computeBoundingSphere();
  return g;
}

/** box-projected UVs at a constant world scale (bricks stay brick-sized) */
export function worldUV(g, scale) {
  const pos = g.attributes.position;
  const nor = g.attributes.normal;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const nx = Math.abs(nor.getX(i));
    const ny = Math.abs(nor.getY(i));
    const nz = Math.abs(nor.getZ(i));
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    let u;
    let v;
    if (ny >= nx && ny >= nz) {
      u = x;
      v = z;
    } else if (nx >= nz) {
      u = z;
      v = y;
    } else {
      u = x;
      v = y;
    }
    uv[i * 2] = u * scale;
    uv[i * 2 + 1] = v * scale;
  }
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
}

/* ---------------------------------------------------------------- shapes */
export const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
export const cyl = (rt, rb, h, s = 10, open = false) => new THREE.CylinderGeometry(rt, rb, h, s, 1, open);
export const cone = (r, h, s = 8) => new THREE.ConeGeometry(r, h, s);
export const sph = (r, w = 10, h = 8) => new THREE.SphereGeometry(r, w, h);
export const ico = (r, d = 0) => new THREE.IcosahedronGeometry(r, d);
export const dodec = (r) => new THREE.DodecahedronGeometry(r, 0);
export const torus = (r, t, rs = 6, ts = 16, arc = Math.PI * 2) => new THREE.TorusGeometry(r, t, rs, ts, arc);
export const capsule = (r, l, c = 3, rs = 8) => new THREE.CapsuleGeometry(r, l, c, rs);

/** half-sphere dome (open bottom), radius r */
export const dome = (r, w = 12, h = 6) => new THREE.SphereGeometry(r, w, h, 0, Math.PI * 2, 0, Math.PI / 2);

/** a wall slab with an arched opening, extruded `depth` along X (faces ±X) */
export function archWall(width, height, depth, gateW, gateH) {
  const s = new THREE.Shape();
  s.moveTo(-width / 2, 0);
  s.lineTo(width / 2, 0);
  s.lineTo(width / 2, height);
  s.lineTo(-width / 2, height);
  s.lineTo(-width / 2, 0);
  const hole = new THREE.Path();
  const r = gateW / 2;
  hole.moveTo(-r, 0);
  hole.lineTo(-r, gateH - r);
  hole.absarc(0, gateH - r, r, Math.PI, 0, true);
  hole.lineTo(r, 0);
  hole.lineTo(-r, 0);
  s.holes.push(hole);
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 10 });
  // shape is in XY (width along X), extruded along +Z → rotate so width runs along Z
  g.translate(0, 0, -depth / 2);
  g.rotateY(Math.PI / 2);
  return g;
}

/** arched solid (for a gate door / dark gate interior), faces ±X */
export function archSolid(w, h, depth) {
  const s = new THREE.Shape();
  const r = w / 2;
  s.moveTo(-r, 0);
  s.lineTo(-r, h - r);
  s.absarc(0, h - r, r, Math.PI, 0, true);
  s.lineTo(r, 0);
  s.lineTo(-r, 0);
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 10 });
  g.translate(0, 0, -depth / 2);
  g.rotateY(Math.PI / 2);
  return g;
}

/** a ring of merlons (crenellations) around a circle */
export function merlonRing(r, y, n, w = 0.32, h = 0.42, d = 0.3) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    out.push(T(box(w, h, d), Math.cos(a) * r, y + h / 2, Math.sin(a) * r, 0, -a, 0));
  }
  return out;
}

/** a straight row of merlons along Z (from z0 to z1) at x */
export function merlonRow(x, y, z0, z1, step = 0.62, w = 0.36, h = 0.42, d = 0.36) {
  const out = [];
  const n = Math.max(1, Math.round((z1 - z0) / step));
  for (let i = 0; i <= n; i += 1) {
    if (i % 2) continue;
    const z = z0 + ((z1 - z0) * i) / n;
    out.push(T(box(d, h, w), x, y + h / 2, z));
  }
  return out;
}

/** a straight row of merlons along X (from x0 to x1) at z */
export function merlonRowX(z, y, x0, x1, step = 0.62, w = 0.36, h = 0.42, d = 0.36) {
  const out = [];
  const n = Math.max(1, Math.round((x1 - x0) / step));
  for (let i = 0; i <= n; i += 1) {
    if (i % 2) continue;
    const x = x0 + ((x1 - x0) * i) / n;
    out.push(T(box(w, h, d), x, y + h / 2, z));
  }
  return out;
}

/** deterministic PRNG */
export function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** shared materials (vertex-coloured) */
const mats = new Map();
export function vcMat(key = "std", opt = {}) {
  let m = mats.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.85, metalness: 0, ...opt });
    mats.set(key, m);
  }
  return m;
}
export function basicMat(key, opt) {
  let m = mats.get(key);
  if (!m) {
    m = new THREE.MeshBasicMaterial(opt);
    mats.set(key, m);
  }
  return m;
}
