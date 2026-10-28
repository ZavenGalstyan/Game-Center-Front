/**
 * Geometry helpers for the static world: world-space-UV boxes (so adjacent
 * stone blocks line up across separate pieces), merging by material,
 * instancing, arches and gabled roofs.
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/**
 * Axis-aligned box with UVs taken from world coordinates / `tile` metres.
 * `faces` can drop sides: { top, bottom, px, nx, pz, nz } (default all on).
 */
export function boxGeo(x0, x1, y0, y1, z0, z1, tile = 4, faces = {}) {
  const pos = [];
  const nor = [];
  const uv = [];
  const quad = (a, b, c, d, n, uvs) => {
    pos.push(...a, ...b, ...c, ...a, ...c, ...d);
    for (let i = 0; i < 6; i++) nor.push(...n);
    const [ua, ub, uc, ud] = uvs;
    uv.push(...ua, ...ub, ...uc, ...ua, ...uc, ...ud);
  };
  const t = 1 / tile;
  if (faces.pz !== false) quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], [[x0 * t, y0 * t], [x1 * t, y0 * t], [x1 * t, y1 * t], [x0 * t, y1 * t]]);
  if (faces.nz !== false) quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], [[-x1 * t, y0 * t], [-x0 * t, y0 * t], [-x0 * t, y1 * t], [-x1 * t, y1 * t]]);
  if (faces.px !== false) quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], [[-z1 * t, y0 * t], [-z0 * t, y0 * t], [-z0 * t, y1 * t], [-z1 * t, y1 * t]]);
  if (faces.nx !== false) quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], [[z0 * t, y0 * t], [z1 * t, y0 * t], [z1 * t, y1 * t], [z0 * t, y1 * t]]);
  if (faces.top !== false) quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0], [[x0 * t, -z1 * t], [x1 * t, -z1 * t], [x1 * t, -z0 * t], [x0 * t, -z0 * t]]);
  if (faces.bottom !== false) quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], [[x0 * t, z0 * t], [x1 * t, z0 * t], [x1 * t, z1 * t], [x0 * t, z1 * t]]);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  return g;
}
/** Horizontal rectangle (floor / ceiling) with world UVs. */
export function planeGeo(x0, x1, z0, z1, y, tile = 4, down = false) {
  const t = 1 / tile;
  const pos = down ? [x0, y, z0, x1, y, z0, x1, y, z1, x0, y, z0, x1, y, z1, x0, y, z1] : [x0, y, z1, x1, y, z1, x1, y, z0, x0, y, z1, x1, y, z0, x0, y, z0];
  const n = down ? [0, -1, 0] : [0, 1, 0];
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute([...n, ...n, ...n, ...n, ...n, ...n], 3));
  const uv = [];
  for (let i = 0; i < 6; i++) uv.push(pos[i * 3] * t, -pos[i * 3 + 2] * t);
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  return g;
}
/** Merge non-indexed geometries; returns null for an empty list. */
export function merge(list) {
  const ok = list.filter(Boolean).map((g) => (g.index ? g.toNonIndexed() : g));
  if (!ok.length) return null;
  for (const g of ok) {
    if (!g.attributes.uv) g.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    for (const k of Object.keys(g.attributes)) if (!["position", "normal", "uv", "color"].includes(k)) g.deleteAttribute(k);
  }
  const hasColor = ok.some((g) => g.attributes.color);
  if (hasColor) for (const g of ok) if (!g.attributes.color) g.setAttribute("color", new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 3).fill(1), 3));
  const m = mergeGeometries(ok);
  ok.forEach((g) => g.dispose());
  return m;
}
/** A static mesh from a merged geometry list. */
export function meshOf(list, mat, { cast = true, receive = true } = {}) {
  const g = merge(list);
  if (!g) return null;
  g.computeBoundingSphere();
  const m = new THREE.Mesh(g, mat);
  m.castShadow = cast;
  m.receiveShadow = receive;
  m.matrixAutoUpdate = false;
  m.updateMatrix();
  return m;
}
/** InstancedMesh from a list of {x,y,z,ry,s|sx,sy,sz,rx,rz}. */
export function instances(geo, mat, list, { cast = true, receive = true, color } = {}) {
  const im = new THREE.InstancedMesh(geo, mat, Math.max(1, list.length));
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  list.forEach((o, i) => {
    e.set(o.rx || 0, o.ry || 0, o.rz || 0);
    q.setFromEuler(e);
    s.set(o.sx ?? o.s ?? 1, o.sy ?? o.s ?? 1, o.sz ?? o.s ?? 1);
    p.set(o.x, o.y || 0, o.z);
    m.compose(p, q, s);
    im.setMatrixAt(i, m);
    if (color && o.c) im.setColorAt(i, new THREE.Color(o.c));
  });
  im.count = list.length;
  im.castShadow = cast;
  im.receiveShadow = receive;
  im.instanceMatrix.needsUpdate = true;
  im.computeBoundingSphere();
  return im;
}
/** Pointed (gothic) arch outline: a frame with a hole, extruded `depth`. */
export function archGeo(w, h, spring, thick, depth) {
  const s = new THREE.Shape();
  const o = w / 2 + thick;
  s.moveTo(-o, 0);
  s.lineTo(-o, spring + o * 0.9 + thick);
  s.lineTo(o, spring + o * 0.9 + thick);
  s.lineTo(o, 0);
  s.lineTo(w / 2, 0);
  s.lineTo(w / 2, spring);
  s.quadraticCurveTo(w / 2, h, 0, h);
  s.quadraticCurveTo(-w / 2, h, -w / 2, spring);
  s.lineTo(-w / 2, 0);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 10 });
  g.translate(0, 0, -depth / 2);
  return g;
}
/** Gothic window pane shape (for glass). */
export function windowGeo(w, h, spring) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0);
  s.lineTo(w / 2, 0);
  s.lineTo(w / 2, spring);
  s.quadraticCurveTo(w / 2, h, 0, h);
  s.quadraticCurveTo(-w / 2, h, -w / 2, spring);
  s.closePath();
  const g = new THREE.ShapeGeometry(s, 10);
  const p = g.attributes.position;
  const uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / w + 0.5, p.getY(i) / h);
  return g;
}
/**
 * Gabled roof over a rectangle: ridge along `axis` ('x' | 'z'), eave height
 * `y`, rise `rise`, overhang `over`. Returns { slopes, gables } geometries.
 */
export function gableRoof(x0, x1, z0, z1, y, rise, over = 0.8, axis = "z") {
  const slopes = [];
  const gables = [];
  const tri = (a, b, c) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute([...a, ...b, ...c], 3));
    g.computeVertexNormals();
    g.setAttribute("uv", new THREE.Float32BufferAttribute([a[0] / 4 + a[2] / 4, a[1] / 4, b[0] / 4 + b[2] / 4, b[1] / 4, c[0] / 4 + c[2] / 4, c[1] / 4], 2));
    return g;
  };
  const quad = (a, b, c, d, len, slant) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute([...a, ...b, ...c, ...a, ...c, ...d], 3));
    g.computeVertexNormals();
    const L = len / 3;
    const S = slant / 3;
    g.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, L, 0, L, S, 0, 0, L, S, 0, S], 2));
    return g;
  };
  if (axis === "z") {
    const cx = (x0 + x1) / 2;
    const yr = y + rise;
    const half = (x1 - x0) / 2 + over;
    const drop = (over / ((x1 - x0) / 2)) * rise;
    const za = z0 - over;
    const zb = z1 + over;
    const slant = Math.hypot(half, rise + drop);
    slopes.push(quad([x0 - over, y - drop, zb], [x0 - over, y - drop, za], [cx, yr, za], [cx, yr, zb], zb - za, slant));
    slopes.push(quad([x1 + over, y - drop, za], [x1 + over, y - drop, zb], [cx, yr, zb], [cx, yr, za], zb - za, slant));
    gables.push(tri([x0, y, z0], [cx, yr, z0], [x1, y, z0]));
    gables.push(tri([x1, y, z1], [cx, yr, z1], [x0, y, z1]));
  } else {
    const cz = (z0 + z1) / 2;
    const yr = y + rise;
    const half = (z1 - z0) / 2 + over;
    const drop = (over / ((z1 - z0) / 2)) * rise;
    const xa = x0 - over;
    const xb = x1 + over;
    const slant = Math.hypot(half, rise + drop);
    slopes.push(quad([xa, y - drop, z0 - over], [xb, y - drop, z0 - over], [xb, yr, cz], [xa, yr, cz], xb - xa, slant));
    slopes.push(quad([xb, y - drop, z1 + over], [xa, y - drop, z1 + over], [xa, yr, cz], [xb, yr, cz], xb - xa, slant));
    gables.push(tri([x0, y, z1], [x0, yr, cz], [x0, y, z0]));
    gables.push(tri([x1, y, z0], [x1, yr, cz], [x1, y, z1]));
  }
  return { slopes, gables };
}
/** Vertex-colour a geometry with a flat colour (for merged multi-colour meshes). */
export function tint(g, color) {
  const c = new THREE.Color(color);
  const n = g.attributes.position.count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    a[i * 3] = c.r;
    a[i * 3 + 1] = c.g;
    a[i * 3 + 2] = c.b;
  }
  g.setAttribute("color", new THREE.BufferAttribute(a, 3));
  return g;
}
export const at = (g, x, y, z, ry = 0, s = 1) => {
  const c = g.clone();
  if (s !== 1) c.scale(s, s, s);
  if (ry) c.rotateY(ry);
  c.translate(x, y, z);
  return c;
};
