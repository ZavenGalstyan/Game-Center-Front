/**
 * Delivery Rush — geometry accumulator.
 *
 * The city is static, so instead of thousands of meshes it is *baked*: every
 * building, kerb, lamp post and tree is appended into one of a few growable
 * vertex buffers and uploaded as a single BufferGeometry. A whole district ends
 * up as ~6 draw calls (opaque / glass / emissive / foliage / road / markings)
 * while still supporting per-object colour, because colour is written per
 * vertex rather than per material.
 *
 * Shapes come from a tiny library of unit primitives created once and then
 * copied+transformed into the buffers — no per-object THREE.Geometry
 * allocation, so baking a district costs a few hundred milliseconds even on a
 * modest laptop.
 */

import * as THREE from "three";

/* --------------------------------------------------------------- primitives */

const _shapes = new Map();

function nonIndexed(geo) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const src = {
    position: g.attributes.position.array,
    normal: g.attributes.normal.array,
    count: g.attributes.position.count,
  };
  g.dispose();
  if (g !== geo) geo.dispose();
  return src;
}

/**
 * Unit primitives, all centred on the origin and 1 unit across unless noted.
 * They are created on first use and cached for the lifetime of the page.
 */
export function shape(name) {
  let s = _shapes.get(name);
  if (s) return s;
  let geo;
  switch (name) {
    case "box":
      geo = new THREE.BoxGeometry(1, 1, 1);
      break;
    case "cyl6":
      geo = new THREE.CylinderGeometry(0.5, 0.5, 1, 6, 1);
      break;
    case "cyl8":
      geo = new THREE.CylinderGeometry(0.5, 0.5, 1, 8, 1);
      break;
    case "cyl12":
      geo = new THREE.CylinderGeometry(0.5, 0.5, 1, 12, 1);
      break;
    case "cyl16":
      geo = new THREE.CylinderGeometry(0.5, 0.5, 1, 16, 1);
      break;
    case "taper8": // trunk / lamp column: narrower at the top
      geo = new THREE.CylinderGeometry(0.34, 0.5, 1, 8, 1);
      break;
    case "cone6":
      geo = new THREE.ConeGeometry(0.5, 1, 6, 1);
      break;
    case "cone8":
      geo = new THREE.ConeGeometry(0.5, 1, 8, 1);
      break;
    case "ico0":
      geo = new THREE.IcosahedronGeometry(0.5, 0);
      break;
    case "ico1":
      geo = new THREE.IcosahedronGeometry(0.5, 1);
      break;
    case "dodeca":
      geo = new THREE.DodecahedronGeometry(0.5, 0);
      break;
    case "sphere":
      geo = new THREE.SphereGeometry(0.5, 10, 7);
      break;
    case "wedge":
      geo = wedgeGeometry();
      break;
    case "plane": // 1x1 in the XZ plane, facing +Y
      geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
      break;
    case "quad": // 1x1 in the XY plane, facing +Z
      geo = new THREE.PlaneGeometry(1, 1);
      break;
    default:
      geo = new THREE.BoxGeometry(1, 1, 1);
  }
  s = nonIndexed(geo);
  _shapes.set(name, s);
  return s;
}

/** Gable-roof prism: ridge runs along X, 1x1x1, apex at +Y. */
function wedgeGeometry() {
  const g = new THREE.BufferGeometry();
  const v = [];
  const A = [-0.5, -0.5, -0.5], B = [0.5, -0.5, -0.5], C = [0.5, -0.5, 0.5], D = [-0.5, -0.5, 0.5];
  const E = [-0.5, 0.5, 0], F = [0.5, 0.5, 0];
  const tri = (a, b, c) => v.push(...a, ...b, ...c);
  tri(A, B, C); tri(A, C, D);       // underside
  tri(D, C, F); tri(D, F, E);       // +Z slope
  tri(B, A, E); tri(B, E, F);       // -Z slope
  tri(A, D, E);                     // -X gable
  tri(C, B, F);                     // +X gable
  g.setAttribute("position", new THREE.Float32BufferAttribute(v, 3));
  g.computeVertexNormals();
  return g;
}

/* -------------------------------------------------------------- accumulator */

class Growable {
  constructor(cap = 4096) {
    this.a = new Float32Array(cap);
    this.n = 0;
  }
  need(extra) {
    if (this.n + extra <= this.a.length) return;
    let cap = this.a.length || 4096;
    while (cap < this.n + extra) cap *= 2;
    const next = new Float32Array(cap);
    next.set(this.a.subarray(0, this.n));
    this.a = next;
  }
  view() {
    return this.a.subarray(0, this.n);
  }
}

const _m = new THREE.Matrix4();
const _nm = new THREE.Matrix3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();

export class MeshAcc {
  constructor(cap = 8192) {
    this.pos = new Growable(cap * 3);
    this.nrm = new Growable(cap * 3);
    this.col = new Growable(cap * 3);
    this.verts = 0;
  }

  get empty() {
    return this.verts === 0;
  }

  /**
   * Append a unit primitive transformed into place.
   *
   * @param name   primitive id from shape()
   * @param p      [x, y, z] centre
   * @param s      [sx, sy, sz] size
   * @param color  linear [r, g, b]
   * @param rot    yaw, or [rx, ry, rz]
   */
  add(name, p, s, color, rot = 0) {
    const src = shape(name);
    if (Array.isArray(rot)) _e.set(rot[0], rot[1], rot[2], "YXZ");
    else _e.set(0, rot, 0, "YXZ");
    _q.setFromEuler(_e);
    _v.set(p[0], p[1], p[2]);
    _s.set(s[0], s[1], s[2]);
    _m.compose(_v, _q, _s);
    _nm.getNormalMatrix(_m);
    this._append(src, _m, _nm, color);
    return this;
  }

  /** Axis-aligned box given by min/max on X/Z plus a base Y and height. */
  boxRect(x0, z0, x1, z1, y0, h, color) {
    return this.add(
      "box",
      [(x0 + x1) / 2, y0 + h / 2, (z0 + z1) / 2],
      [Math.abs(x1 - x0), h, Math.abs(z1 - z0)],
      color,
    );
  }

  /** Flat, upward-facing quad — the fast path for road surface and paint. */
  quadY(x0, z0, x1, z1, y, color) {
    this._quad(
      [x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1],
      [0, 1, 0],
      color,
    );
    return this;
  }

  /** Arbitrary upward-facing quad from four XZ corners (counter-clockwise). */
  quadYPoints(a, b, c, d, y, color) {
    this._quad([a[0], y, a[1]], [b[0], y, b[1]], [c[0], y, c[1]], [d[0], y, d[1]], [0, 1, 0], color);
    return this;
  }

  _quad(a, b, c, d, n, col) {
    const P = this.pos, N = this.nrm, C = this.col;
    P.need(18); N.need(18); C.need(18);
    const p = P.a, nn = N.a, cc = C.a;
    let i = P.n, j = N.n, k = C.n;
    const push = (v) => {
      p[i++] = v[0]; p[i++] = v[1]; p[i++] = v[2];
      nn[j++] = n[0]; nn[j++] = n[1]; nn[j++] = n[2];
      cc[k++] = col[0]; cc[k++] = col[1]; cc[k++] = col[2];
    };
    // Corners arrive in ring order (x0z0 -> x1z0 -> x1z1 -> x0z1). Emitting
    // them in that order winds the triangles clockwise as seen from above, so
    // every road, kerb top and lane marking would be back-face culled. The
    // reversed order below puts the front face where the normal points.
    push(a); push(c); push(b);
    push(a); push(d); push(c);
    P.n = i; N.n = j; C.n = k;
    this.verts += 6;
  }

  _append(src, m, nm, col) {
    const count = src.count;
    const P = this.pos, N = this.nrm, C = this.col;
    P.need(count * 3); N.need(count * 3); C.need(count * 3);
    const sp = src.position, sn = src.normal;
    const p = P.a, nn = N.a, cc = C.a;
    const me = m.elements, ne = nm.elements;
    let i = P.n, j = N.n, k = C.n;
    const r = col[0], g = col[1], b = col[2];
    for (let v = 0; v < count; v++) {
      const x = sp[v * 3], y = sp[v * 3 + 1], z = sp[v * 3 + 2];
      p[i++] = me[0] * x + me[4] * y + me[8] * z + me[12];
      p[i++] = me[1] * x + me[5] * y + me[9] * z + me[13];
      p[i++] = me[2] * x + me[6] * y + me[10] * z + me[14];
      const nx = sn[v * 3], ny = sn[v * 3 + 1], nz = sn[v * 3 + 2];
      let ox = ne[0] * nx + ne[3] * ny + ne[6] * nz;
      let oy = ne[1] * nx + ne[4] * ny + ne[7] * nz;
      let oz = ne[2] * nx + ne[5] * ny + ne[8] * nz;
      const len = Math.hypot(ox, oy, oz) || 1;
      nn[j++] = ox / len; nn[j++] = oy / len; nn[j++] = oz / len;
      cc[k++] = r; cc[k++] = g; cc[k++] = b;
    }
    P.n = i; N.n = j; C.n = k;
    this.verts += count;
  }

  /** Hand the accumulated vertices to the GPU as one BufferGeometry. */
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(this.pos.view()), 3));
    g.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(this.nrm.view()), 3));
    g.setAttribute("color", new THREE.BufferAttribute(new Float32Array(this.col.view()), 3));
    g.computeBoundingSphere();
    return g;
  }
}

/**
 * A named bundle of accumulators — one per material channel. Callers just
 * write into `acc.opaque`, `acc.glass`, ... and bake() turns them into meshes.
 */
export function createChannels(names) {
  const out = {};
  for (const n of names) out[n] = new MeshAcc();
  return out;
}
