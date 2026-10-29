/**
 * Last Hope — tiny procedural modelling kit.
 *
 * A model is assembled from primitives into material "buckets" and merged
 * into one BufferGeometry per bucket (position / normal / uv / color / wind):
 *   m matte   s satin   x metal   e emissive   g glass   f foliage (wind)
 *   r rock (flat shaded)   b blade (alpha-tested grass cards)
 * Colours are sRGB hex, jittered per vertex for a painterly finish; `wind`
 * is 0 at the base and rises with height for swaying foliage.
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

const _c = new THREE.Color();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();

let seed = 1;
const rnd = () => {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
};

export function builder(s0 = 1) {
  seed = s0 * 7919 + 13;
  const parts = {};
  const api = {
    rnd,
    /** Add any geometry: color hex, transform {p, r (euler), s (scale)}, jit, wind {h, k}. */
    add(bucket, geo, color, o = {}) {
      let g = geo.index ? geo : geo;
      if (!g.attributes.uv) g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      const p = o.p || [0, 0, 0];
      const r = o.r || [0, 0, 0];
      const sc = o.s == null ? [1, 1, 1] : typeof o.s === "number" ? [o.s, o.s, o.s] : o.s;
      _e.set(r[0], r[1], r[2], o.order || "XYZ");
      _q.setFromEuler(_e);
      _m.compose(_v.set(p[0], p[1], p[2]), _q, _s.set(sc[0], sc[1], sc[2]));
      g.applyMatrix4(_m);
      if (o.post) g.applyMatrix4(o.post);
      const n = g.attributes.position.count;
      const col = new Float32Array(n * 3);
      _c.set(color);
      const jit = o.jit ?? 0.04;
      const pos = g.attributes.position;
      for (let i = 0; i < n; i++) {
        const k = 1 + (rnd() - 0.5) * 2 * jit;
        col[i * 3] = _c.r * k;
        col[i * 3 + 1] = _c.g * k;
        col[i * 3 + 2] = _c.b * k;
      }
      if (o.grad) {
        // vertical gradient: darker at the bottom
        const [y0, y1, k0] = o.grad;
        for (let i = 0; i < n; i++) {
          const t = Math.max(0, Math.min(1, (pos.getY(i) - y0) / (y1 - y0)));
          const k = k0 + (1 - k0) * t;
          col[i * 3] *= k;
          col[i * 3 + 1] *= k;
          col[i * 3 + 2] *= k;
        }
      }
      g.setAttribute("color", new THREE.BufferAttribute(col, 3));
      if (o.sphereN) {
        // soft volumetric foliage: bend normals toward "outward from the canopy centre"
        const [cx, cy, cz, k] = o.sphereN;
        const nrm = g.attributes.normal;
        for (let i = 0; i < n; i++) {
          let dx = pos.getX(i) - cx;
          let dy = pos.getY(i) - cy;
          let dz = pos.getZ(i) - cz;
          const l = Math.hypot(dx, dy, dz) || 1;
          dx = nrm.getX(i) * (1 - k) + (dx / l) * k;
          dy = nrm.getY(i) * (1 - k) + (dy / l) * k;
          dz = nrm.getZ(i) * (1 - k) + (dz / l) * k;
          const m = Math.hypot(dx, dy, dz) || 1;
          nrm.setXYZ(i, dx / m, dy / m, dz / m);
        }
      }
      const wind = new Float32Array(n);
      if (o.wind) for (let i = 0; i < n; i++) wind[i] = Math.max(0, Math.min(1, pos.getY(i) / o.wind.h)) ** 1.5 * o.wind.k;
      g.setAttribute("wind", new THREE.BufferAttribute(wind, 1));
      for (const k of Object.keys(g.attributes)) if (!["position", "normal", "uv", "color", "wind"].includes(k)) g.deleteAttribute(k);
      if (g.index) g = g.toNonIndexed();
      (parts[bucket] = parts[bucket] || []).push(g);
      return api;
    },
    box(b, color, [w, h, d], p = [0, h / 2, 0], o = {}) {
      return api.add(b, new THREE.BoxGeometry(w, h, d), color, { ...o, p, r: o.r });
    },
    cyl(b, color, [rt, rb, h, seg = 10], p = [0, h / 2, 0], o = {}) {
      return api.add(b, new THREE.CylinderGeometry(rt, rb, h, seg, 1, !!o.open), color, { ...o, p });
    },
    sph(b, color, [r, ws = 10, hs = 8], p = [0, r, 0], o = {}) {
      return api.add(b, new THREE.SphereGeometry(r, ws, hs), color, { ...o, p });
    },
    ico(b, color, [r, det = 0], p = [0, r, 0], o = {}) {
      const g = new THREE.IcosahedronGeometry(r, det);
      if (o.lump) {
        // the polyhedron is non-indexed: derive the bump from the vertex position
        // so the copies of a shared corner move together (no torn faces)
        const pos = g.attributes.position;
        const salt = rnd() * 1000;
        for (let i = 0; i < pos.count; i++) {
          const x = pos.getX(i);
          const y = pos.getY(i);
          const z = pos.getZ(i);
          const h = Math.sin((Math.round(x * 1000) * 12.9898 + Math.round(y * 1000) * 78.233 + Math.round(z * 1000) * 37.719 + salt) * 0.001) * 43758.5453;
          const k = 1 + (h - Math.floor(h) - 0.5) * o.lump;
          pos.setXYZ(i, x * k, y * k, z * k);
        }
        g.computeVertexNormals();
      }
      return api.add(b, g, color, { ...o, p });
    },
    cone(b, color, [r, h, seg = 9], p = [0, h / 2, 0], o = {}) {
      return api.add(b, new THREE.ConeGeometry(r, h, seg), color, { ...o, p });
    },
    tor(b, color, [r, t, rs = 6, ts = 16], p, o = {}) {
      return api.add(b, new THREE.TorusGeometry(r, t, rs, ts), color, { ...o, p });
    },
    /** Extruded 2-D outline (x, y) given depth along z. */
    shape(b, color, pts, depth, p, o = {}) {
      const s = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
      const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: !!o.bevel, bevelSize: o.bevel || 0, bevelThickness: o.bevel || 0, bevelSegments: 1 });
      g.translate(0, 0, -depth / 2);
      return api.add(b, g, color, { ...o, p });
    },
    /** Cylinder between two points. */
    beam(b, color, a, z, r, o = {}) {
      const A = new THREE.Vector3(...a);
      const Z = new THREE.Vector3(...z);
      const len = A.distanceTo(Z);
      const g = new THREE.CylinderGeometry(r, o.r2 ?? r, len, o.seg || 6);
      const dir = Z.clone().sub(A).normalize();
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      const mid = A.clone().add(Z).multiplyScalar(0.5);
      const post = new THREE.Matrix4().compose(mid, q, new THREE.Vector3(1, 1, 1));
      return api.add(b, g, color, { ...o, post });
    },
    /** A crossed pair of alpha cards (grass / reeds). */
    cards(color, w, h, p = [0, 0, 0], o = {}) {
      for (let k = 0; k < (o.n || 2); k++) {
        const g = new THREE.PlaneGeometry(w, h);
        g.translate(0, h / 2, 0);
        // light grass cards like the ground they grow from
        const nrm = g.attributes.normal;
        for (let i = 0; i < nrm.count; i++) nrm.setXYZ(i, 0, 1, 0);
        api.add("b", g, color, { ...o, p, r: [0, (k / (o.n || 2)) * Math.PI + (o.yaw || 0), 0], wind: { h, k: o.windK ?? 1 } });
      }
      return api;
    },
    build() {
      const out = {};
      for (const [b, list] of Object.entries(parts)) {
        const g = mergeGeometries(list, false);
        list.forEach((q) => q.dispose());
        // rocks: faceted (non-indexed → per-face normals); everything else keeps its smooth normals
        if (b === "r") g.computeVertexNormals();
        g.computeBoundingSphere();
        g.computeBoundingBox();
        out[b] = g;
      }
      return out;
    },
  };
  return api;
}

/** Re-light flat-shaded buckets: non-indexed geometry already has face normals. */
export const BUCKETS = ["m", "s", "x", "e", "g", "f", "r", "b"];
