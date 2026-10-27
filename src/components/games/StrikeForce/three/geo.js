/**
 * Strike Force — geometry helpers and the static batcher.
 *
 * Static map geometry is generated part by part, then merged per
 * (material, 24 m chunk) so a whole map renders in a few dozen draw calls
 * while chunks can still be frustum-culled. Every merged geometry carries
 * position / normal / uv / color; the colour attribute tints the material.
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

const _c = new THREE.Color();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();

/** project UVs from (world) position by dominant normal axis: 1 UV = `scale` m */
export function projectUV(geo, scale = 1, ox = 0, oy = 0, oz = 0) {
  const p = geo.attributes.position;
  const n = geo.attributes.normal;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) + ox;
    const y = p.getY(i) + oy;
    const z = p.getZ(i) + oz;
    const ax = Math.abs(n.getX(i));
    const ay = Math.abs(n.getY(i));
    const az = Math.abs(n.getZ(i));
    let u;
    let v;
    if (ay >= ax && ay >= az) {
      u = x;
      v = z;
    } else if (ax >= az) {
      u = n.getX(i) > 0 ? -z : z;
      v = y;
    } else {
      u = n.getZ(i) > 0 ? x : -x;
      v = y;
    }
    uv[i * 2] = u / scale;
    uv[i * 2 + 1] = v / scale;
  }
  geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  return geo;
}

/** solid colour attribute (linear) */
export function paint(geo, color = "#ffffff", jitter = 0) {
  _c.set(color);
  const n = geo.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const j = jitter ? 1 + (Math.random() - 0.5) * jitter : 1;
    col[i * 3] = _c.r * j;
    col[i * 3 + 1] = _c.g * j;
    col[i * 3 + 2] = _c.b * j;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  return geo;
}

/** vertical gradient tint: bottom colour → top colour across [y0, y1] */
export function paintGradient(geo, bottom, top, y0, y1) {
  const a = new THREE.Color(bottom);
  const b = new THREE.Color(top);
  const p = geo.attributes.position;
  const col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const t = Math.max(0, Math.min(1, (p.getY(i) - y0) / (y1 - y0 || 1)));
    col[i * 3] = a.r + (b.r - a.r) * t;
    col[i * 3 + 1] = a.g + (b.g - a.g) * t;
    col[i * 3 + 2] = a.b + (b.b - a.b) * t;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  return geo;
}

/** axis-aligned box from min/max corners, world-projected UVs */
export function boxMinMax(x0, y0, z0, x1, y1, z1, scale = 1) {
  const g = new THREE.BoxGeometry(Math.max(1e-3, x1 - x0), Math.max(1e-3, y1 - y0), Math.max(1e-3, z1 - z0));
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  return projectUV(g, scale);
}

/** box with face-local 0..1 UVs (crates, hesco) */
export function boxFaceUV(x0, y0, z0, x1, y1, z1) {
  const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  return g;
}

/** apply position / rotation (euler xyz) / scale to a geometry in place */
export function place(geo, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  _e.set(rx, ry, rz);
  _q.setFromEuler(_e);
  _v.set(x, y, z);
  _s.set(sx, sy, sz);
  _m.compose(_v, _q, _s);
  geo.applyMatrix4(_m);
  return geo;
}

/** extrude a 2D profile (x, y points) along z by `depth`, centred */
export function extrude(points, depth, bevel = 0, curveSegments = 4) {
  const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(1e-3, depth - bevel * 2),
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: bevel > 0 ? 2 : 0,
    curveSegments,
  });
  g.translate(0, 0, -depth / 2 + bevel);
  return g;
}

/** strip geometry down to position/normal/uv(/color) and make it non-indexed */
export function normalizeGeo(g) {
  let out = g.index ? g.toNonIndexed() : g;
  if (out !== g) g.dispose();
  for (const k of Object.keys(out.attributes)) if (!["position", "normal", "uv", "color"].includes(k)) out.deleteAttribute(k);
  if (!out.attributes.normal) out.computeVertexNormals();
  if (!out.attributes.uv) out.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(out.attributes.position.count * 2), 2));
  if (!out.attributes.color) paint(out, "#ffffff");
  out.morphAttributes = {};
  return out;
}

export function mergeAll(list) {
  const norm = list.map(normalizeGeo);
  const m = mergeGeometries(norm, false);
  for (const g of norm) g.dispose();
  return m;
}

/**
 * Collects geometry per material and spatial chunk, merging on build().
 * add(geo, material, { color, shadow, receive, chunkX, chunkZ })
 */
export function createBatcher({ chunk = 24 } = {}) {
  const buckets = new Map();
  function add(geo, mat, o = {}) {
    if (!geo) return;
    if (o.color) paint(geo, o.color, o.jitter || 0);
    const g = normalizeGeo(geo);
    let cx = 0;
    let cz = 0;
    if (o.chunkX !== undefined) {
      cx = Math.floor(o.chunkX / chunk);
      cz = Math.floor(o.chunkZ / chunk);
    } else {
      g.computeBoundingBox();
      const bb = g.boundingBox;
      cx = Math.floor((bb.min.x + bb.max.x) / 2 / chunk);
      cz = Math.floor((bb.min.z + bb.max.z) / 2 / chunk);
    }
    const shadow = o.shadow !== false;
    const receive = o.receive !== false;
    const key = `${mat.uuid}|${cx}|${cz}|${shadow}|${receive}`;
    let b = buckets.get(key);
    if (!b) {
      b = { mat, geos: [], shadow, receive, verts: 0 };
      buckets.set(key, b);
    }
    b.geos.push(g);
    b.verts += g.attributes.position.count;
  }
  function build(parent) {
    const meshes = [];
    for (const b of buckets.values()) {
      if (!b.geos.length) continue;
      const merged = mergeGeometries(b.geos, false);
      for (const g of b.geos) g.dispose();
      merged.computeBoundingSphere();
      merged.computeBoundingBox();
      const mesh = new THREE.Mesh(merged, b.mat);
      mesh.castShadow = b.shadow;
      mesh.receiveShadow = b.receive;
      mesh.matrixAutoUpdate = false;
      parent.add(mesh);
      meshes.push(mesh);
    }
    buckets.clear();
    return meshes;
  }
  return { add, build, buckets };
}
