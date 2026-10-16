/**
 * School Life Simulator 3D — stylised human characters.
 *
 * Every character is ONE smooth SkinnedMesh driven by a 28-bone skeleton:
 *   hips → spine → chest → neck → head (+ jaw, eyelids, brows, mouth corners,
 *   hair tail / back hair), clavicles → upper arms → forearms → hands,
 *   thighs → shins → feet.
 * The body is generated as continuous lofted surfaces (torso + neck, arms,
 * legs, hands with fingers, shoes) whose skin weights blend across the
 * joints, so shoulders, elbows, hips and knees bend smoothly. The head is a
 * sculpted surface (jaw, chin, cheekbones, brow ridge, nose, eye sockets)
 * with real eyes (iris, pupil, catch-light, lids, lashes), brows, lips,
 * teeth and ears. Hair is built from dozens of tapered, layered clumps that
 * follow the scalp. Clothing is modelled on the body (fabric thickness,
 * hems, cuffs, folds, seams) plus garment parts (collars, lapels, ties,
 * hoods, pockets, buttons, zips, skirts, coat tails).
 *
 * One cached geometry per look, shared by every character wearing it, and
 * four materials (skin, cloth, hair, eyes) → 4 draw calls per character.
 *
 * animateRig(rig, state, dt) drives the body (idle with weight shifts,
 * walk / run cycles with heel-to-toe feet and counter-rotation, sitting,
 * talking, waving, celebrating, sports moves) and the face (blinking;
 * neutral / happy / talking / surprised / celebrating / sad expressions).
 */
import * as THREE from "three";
import { SKIN, HAIR_COLORS, EYE_COLORS, OUTFITS, STAFF_OUTFITS } from "./data.js";

/* =================================================================== helpers */
const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const _col = new THREE.Color();
function lin(hex, k = 1) {
  _col.set(hex).convertSRGBToLinear();
  return [_col.r * k, _col.g * k, _col.b * k];
}
const mixc = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const mulc = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
/** Detail level of the geometry being generated (1 = close-up, ~0.5 = distant LOD). */
let Q = 1;
const qn = (n, min = 3) => Math.max(min, Math.round(n * Q));

/* =================================================================== skeleton */
const B = {
  hips: 0, spine: 1, chest: 2, neck: 3, head: 4, jaw: 5, lidL: 6, lidR: 7, browL: 8, browR: 9, mouthL: 10, mouthR: 11,
  clavL: 12, armL: 13, foreL: 14, handL: 15, clavR: 16, armR: 17, foreR: 18, handR: 19,
  thighL: 20, shinL: 21, footL: 22, thighR: 23, shinR: 24, footR: 25, tail: 26, hairBack: 27,
};
const PARENT = [-1, 0, 1, 2, 3, 4, 4, 4, 4, 4, 4, 4, 2, 12, 13, 14, 2, 16, 17, 18, 0, 20, 21, 0, 23, 24, 4, 4];

/** Bind-pose layout (character space, feet at y=0, facing +z). Left side = +x. */
function layout(P) {
  const w = P.w;
  const ax = 0.168 * w + 0.006;
  const L = {};
  L.hips = v3(0, 0.93, 0);
  L.spine = v3(0, 1.03, 0);
  L.chest = v3(0, 1.22, 0);
  L.neck = v3(0, 1.445, -0.004);
  L.head = v3(0, 1.505, 0.004);
  L.hc = v3(0, 1.505 + 0.112, 0.018); // head centre
  L.clav = (s) => v3(0.045 * s, 1.4, -0.006);
  L.arm = (s) => v3(ax * s, 1.385, -0.01);
  L.fore = (s) => v3(ax * s, 1.385 - 0.272, -0.01);
  L.hand = (s) => v3(ax * s, 1.385 - 0.272 - 0.248, -0.006);
  L.thigh = (s) => v3(0.088 * w * s, 0.905, 0);
  L.shin = (s) => v3(0.088 * w * s, 0.905 - 0.425, 0.004);
  L.foot = (s) => v3(0.088 * w * s, 0.08, -0.006);
  return L;
}

/* =================================================================== mesh builder */
const MATS = ["skin", "cloth", "hair", "eye"];
class Part {
  constructor() {
    this.pos = [];
    this.col = [];
    this.si = [];
    this.sw = [];
    this.idx = [];
    this.n = 0;
  }
  /** bw: [[bone, w], …] (≤ 4 kept, normalised) */
  v(p, c, bw) {
    this.pos.push(p.x, p.y, p.z);
    this.col.push(c[0], c[1], c[2]);
    const list = bw.filter((x) => x[1] > 1e-4).sort((a, b) => b[1] - a[1]).slice(0, 4);
    let s = 0;
    for (const [, w] of list) s += w;
    for (let i = 0; i < 4; i++) {
      this.si.push(list[i] ? list[i][0] : 0);
      this.sw.push(list[i] ? list[i][1] / (s || 1) : 0);
    }
    return this.n++;
  }
  t(a, b, c) {
    this.idx.push(a, b, c);
  }
}
class Builder {
  constructor() {
    this.parts = { skin: new Part(), cloth: new Part(), hair: new Part(), eye: new Part() };
  }
  build() {
    const pos = [];
    const col = [];
    const si = [];
    const sw = [];
    const idx = [];
    const groups = [];
    let base = 0;
    MATS.forEach((m, mi) => {
      const p = this.parts[m];
      const start = idx.length;
      for (const x of p.pos) pos.push(x);
      for (const x of p.col) col.push(x);
      for (const x of p.si) si.push(x);
      for (const x of p.sw) sw.push(x);
      for (const i of p.idx) idx.push(i + base);
      groups.push([start, p.idx.length, mi]);
      base += p.n;
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(si, 4));
    g.setAttribute("skinWeight", new THREE.Float32BufferAttribute(sw, 4));
    g.setIndex(base > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
    for (const [s, c, m] of groups) if (c) g.addGroup(s, c, m);
    g.computeVertexNormals();
    g.computeBoundingSphere();
    g.boundingSphere.radius += 0.6;
    return g;
  }
}

/**
 * Loft a closed tube through `rings`. Each ring: { p (centre), t (tangent, optional),
 * n (front/reference direction), rx, rz, pw (superellipse exponent), bw, color, off(a) }.
 * Vertex at angle a: p + side·(rx+off)·cos'a + n·(rz+off)·sin'a (a = π/2 faces `n`).
 */
function loft(part, rings, seg = 16) {
  seg = qn(seg, 4);
  if (Q < 0.7 && rings.length > 4) rings = rings.filter((_, i) => i % 2 === 0 || i === rings.length - 1);
  const N = rings.length;
  const base = part.n;
  for (let i = 0; i < N; i++) {
    const r = rings[i];
    let T = r.t;
    if (!T) {
      const a = rings[Math.max(0, i - 1)].p;
      const b = rings[Math.min(N - 1, i + 1)].p;
      T = b.clone().sub(a);
      if (T.lengthSq() < 1e-12) T = v3(0, -1, 0);
      T.normalize();
    }
    const ref = r.n || v3(0, 0, 1);
    const n = ref.clone().addScaledVector(T, -ref.dot(T));
    if (n.lengthSq() < 1e-10) n.set(1, 0, 0);
    n.normalize();
    const side = new THREE.Vector3().crossVectors(n, T).normalize();
    const pw = r.pw || 2;
    for (let k = 0; k < seg; k++) {
      const a = (k / seg) * TAU;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const cx = Math.sign(ca) * Math.pow(Math.abs(ca), 2 / pw);
      const sz = Math.sign(sa) * Math.pow(Math.abs(sa), 2 / pw);
      const off = r.off ? r.off(a, ca, sa) : 0;
      const p = r.p.clone().addScaledVector(side, (r.rx + off) * cx).addScaledVector(n, (r.rz + off) * sz);
      const c = typeof r.color === "function" ? r.color(a, ca, sa, p) : r.color;
      part.v(p, c, r.bw);
    }
  }
  for (let i = 0; i < N - 1; i++) {
    for (let k = 0; k < seg; k++) {
      const k1 = (k + 1) % seg;
      const a = base + i * seg + k;
      const b = base + i * seg + k1;
      const c = base + (i + 1) * seg + k;
      const d = base + (i + 1) * seg + k1;
      part.t(a, b, c);
      part.t(b, d, c);
    }
  }
}
/** Ellipsoid (lat/long) with an optional rotation. */
function blob(part, center, r, color, bw, { rot = null, lat = 8, lon = 12 } = {}) {
  lat = qn(lat, 2);
  lon = qn(lon, 4);
  const base = part.n;
  const q = rot ? new THREE.Quaternion().setFromEuler(new THREE.Euler(rot[0], rot[1], rot[2])) : null;
  for (let i = 0; i <= lat; i++) {
    const th = (i / lat) * Math.PI;
    for (let k = 0; k < lon; k++) {
      const ph = (k / lon) * TAU;
      const d = v3(Math.sin(th) * Math.cos(ph) * r[0], Math.cos(th) * r[1], Math.sin(th) * Math.sin(ph) * r[2]);
      if (q) d.applyQuaternion(q);
      part.v(d.add(center), typeof color === "function" ? color(i / lat, k / lon) : color, bw);
    }
  }
  for (let i = 0; i < lat; i++) {
    for (let k = 0; k < lon; k++) {
      const k1 = (k + 1) % lon;
      const a = base + i * lon + k;
      const b = base + i * lon + k1;
      const c = base + (i + 1) * lon + k;
      const d = base + (i + 1) * lon + k1;
      part.t(a, b, c);
      part.t(b, d, c);
    }
  }
}
/** A flattened ribbon lying on a surface: path points with outward normals. */
function strip(part, pts, normals, width, thick, color, bw, seg = 6) {
  const last = Math.max(1, pts.length - 1);
  const rings = pts.map((p, i) => ({
    p,
    n: normals[i],
    rx: typeof width === "function" ? width(i / last) : width,
    rz: thick,
    color,
    bw: typeof bw === "function" ? bw(i / last, p) : bw,
    pw: 2.4,
  }));
  loft(part, rings, seg);
}

/* =================================================================== look → design */
export function resolveLook(look) {
  const outfit = OUTFITS.find((o) => o.id === look.outfit) || STAFF_OUTFITS[look.outfit] || OUTFITS[0];
  return {
    skin: SKIN[look.skin] ?? SKIN[1],
    hair: (HAIR_COLORS.find((h) => h.id === look.hairColor) || HAIR_COLORS[1]).c,
    eyes: EYE_COLORS[look.eyes] ?? EYE_COLORS[0],
    o: outfit,
    style: outfit.style,
    bottom: look.bottom || "pants",
    hairStyle: look.hairStyle || "short",
    acc: look.acc || {},
    w: [0.9, 1, 1.13][look.build ?? 1],
    build: look.build ?? 1,
    adult: !!look.adult,
  };
}
export function lookKey(look) {
  return JSON.stringify([look.skin, look.hairStyle, look.hairColor, look.eyes, look.outfit, look.bottom, look.build, look.acc, look.adult, look.faceSeed || 0]);
}
/** Per-character facial / body variety from a seed (deterministic per look). */
function faceParams(look, R) {
  const r = rng(hashStr(`${look.skin}|${look.eyes}|${look.hairStyle}|${look.hairColor}|${look.build}|${look.outfit}|${look.faceSeed || 0}`));
  const j = (a) => (r() * 2 - 1) * a;
  return {
    eyeSize: (R.adult ? 0.9 : 1.0) + j(0.07),
    eyeGap: 0.335 + j(0.025),
    eyeY: j(0.02),
    nose: 1 + j(0.22),
    jaw: (R.adult ? 1.04 : 0.97) + j(0.07),
    chin: 1 + j(0.3),
    brow: 1 + j(0.25),
    browTilt: j(0.04),
    mouth: 1 + j(0.12),
    lip: 1 + j(0.25),
    headLen: (R.adult ? 1.05 : 1) + j(0.03),
    height: R.adult ? 1.03 + j(0.03) : 0.955 + j(0.035),
    hairJit: Math.floor(r() * 1e9),
  };
}

/* =================================================================== head */
/** Head surface (relative to the head centre) for a unit direction. */
function headSurface(F) {
  const a = 0.094;
  const b = 0.124 * F.headLen;
  const c = 0.108;
  const eyes = [v3(F.eyeGap, 0.07 + F.eyeY, 0.94).normalize(), v3(-F.eyeGap, 0.07 + F.eyeY, 0.94).normalize()];
  const g = (d, u, sx, sy, sz) => Math.exp(-(((d.x - u.x) / sx) ** 2) - ((d.y - u.y) / sy) ** 2 - ((d.z - u.z) / sz) ** 2);
  const nose1 = v3(0, -0.06, 1).normalize();
  const nose2 = v3(0, -0.24, 0.97).normalize();
  const chinU = v3(0, -0.78, 0.62).normalize();
  const cheekL = v3(0.55, -0.12, 0.8).normalize();
  const cheekR = v3(-0.55, -0.12, 0.8).normalize();
  const fn = (d) => {
    const r = 1 / Math.sqrt((d.x / a) ** 2 + (d.y / b) ** 2 + (d.z / c) ** 2);
    const p = d.clone().multiplyScalar(r);
    // fuller cranium at the back, slightly flatter forehead
    if (p.z < 0 && p.y > -0.02) p.z *= 1.04 + 0.03 * smooth(0, 0.08, p.y);
    if (p.y > 0.02 && p.z > 0) p.z *= 1 - 0.035 * smooth(0.02, 0.1, p.y);
    // jaw tapers toward the chin
    const k = smooth(0.0, -b, p.y);
    p.x *= 1 - 0.3 * Math.pow(k, 1.25) * (2 - F.jaw);
    if (p.z < 0) p.z *= 1 - 0.18 * k;
    else p.z *= 1 - 0.06 * k;
    // features as smooth bumps along the surface normal
    let push = 0;
    push += 0.012 * F.chin * g(d, chinU, 0.22, 0.2, 0.3);
    push += 0.0045 * (g(d, cheekL, 0.2, 0.15, 0.3) + g(d, cheekR, 0.2, 0.15, 0.3));
    push += 0.011 * F.nose * g(d, nose1, 0.07, 0.2, 0.3);
    push += 0.011 * F.nose * g(d, nose2, 0.085, 0.07, 0.3);
    push += 0.0035 * F.nose * (g(d, v3(0.085, -0.27, 0.95), 0.06, 0.05, 0.3) + g(d, v3(-0.085, -0.27, 0.95), 0.06, 0.05, 0.3));
    push += 0.003 * g(d, v3(0, 0.17, 0.98), 0.4, 0.06, 0.3); // brow ridge
    push -= 0.0085 * (g(d, eyes[0], 0.14, 0.11, 0.3) + g(d, eyes[1], 0.14, 0.11, 0.3)); // eye sockets
    push -= 0.003 * g(d, v3(0, -0.36, 0.93), 0.05, 0.04, 0.3); // philtrum
    const n = v3(p.x / (a * a), p.y / (b * b), p.z / (c * c)).normalize();
    p.addScaledVector(n, push);
    return p;
  };
  fn.normal = (d) => {
    const p = fn(d);
    return v3(p.x / (a * a), p.y / (b * b), p.z / (c * c)).normalize();
  };
  fn.eyes = eyes;
  return fn;
}
/** Hairline height for a scalp direction (φ = 0 front, π back). */
function hairThreshold(d) {
  const phi = Math.abs(Math.atan2(d.x, d.z));
  const pts = [[0, 0.4], [0.5, 0.34], [0.95, 0.16], [1.25, 0.12], [1.5, 0.2], [1.75, -0.18], [2.2, -0.5], [2.7, -0.62], [Math.PI, -0.66]];
  for (let i = 0; i < pts.length - 1; i++) {
    if (phi <= pts[i + 1][0]) return lerp(pts[i][1], pts[i + 1][1], smooth(pts[i][0], pts[i + 1][0], phi));
  }
  return -0.66;
}

function sphereGrid(part, lat, lon, pointAt, colorAt, bw, keep) {
  const base = part.n;
  for (let i = 0; i <= lat; i++) {
    const th = (i / lat) * Math.PI;
    for (let k = 0; k < lon; k++) {
      const ph = (k / lon) * TAU;
      const d = v3(Math.sin(th) * Math.sin(ph), Math.cos(th), Math.sin(th) * Math.cos(ph));
      part.v(pointAt(d), colorAt(d), bw);
    }
  }
  for (let i = 0; i < lat; i++) {
    for (let k = 0; k < lon; k++) {
      const k1 = (k + 1) % lon;
      const a = i * lon + k;
      const b = i * lon + k1;
      const c = (i + 1) * lon + k;
      const d = (i + 1) * lon + k1;
      if (keep && !(keep(a) && keep(b) && keep(c) && keep(d))) continue;
      part.t(base + a, base + c, base + b);
      part.t(base + b, base + c, base + d);
    }
  }
}

const skinTone = (hex) => {
  const c = lin(hex);
  const l = (c[0] + c[1] + c[2]) / 3;
  return mixc(c, [l, l, l], 0.12);
};
function buildHead(Bd, P, R, F, L) {
  const S = headSurface(F);
  const HC = L.hc;
  const skin = skinTone(R.skin);
  const skinDark = mulc(skin, 0.86);
  const blush = mixc(skin, lin("#e8807a"), 0.2);
  const lip = mixc(skin, lin("#c25a62"), R.adult ? 0.3 : 0.42);
  const H = [[B.head, 1]];
  const part = Bd.parts.skin;
  // --- head surface
  sphereGrid(
    part,
    qn(30, 12),
    qn(40, 16),
    (d) => S(d).add(HC),
    (d) => {
      let c = skin;
      const cheek = Math.exp(-(((Math.abs(d.x) - 0.5) / 0.16) ** 2) - ((d.y + 0.15) / 0.13) ** 2) * (d.z > 0.5 ? 1 : 0);
      c = mixc(c, blush, cheek * 0.8);
      if (d.y < -0.6) c = mixc(c, skinDark, smooth(-0.6, -1, d.y) * 0.6);
      return c;
    },
    H,
  );
  // --- ears
  for (const s of [1, -1]) {
    const d = v3(s, 0.0, -0.12).normalize();
    const p = S(d).add(HC);
    p.x += s * 0.004;
    blob(part, p, [0.012, 0.03, 0.021], (u) => mixc(skin, skinDark, u > 0.5 ? 0.4 : 0), H, { rot: [0, -s * 0.25, s * 0.08], lat: 6, lon: 10 });
    blob(part, p.clone().add(v3(s * 0.005, 0, 0.003)), [0.006, 0.018, 0.012], mulc(skin, 0.75), H, { rot: [0, -s * 0.25, 0], lat: 5, lon: 8 });
  }
  // --- eyes: eyeball (iris / pupil by vertex colour), catch-light, lids, lashes
  const eyeR = 0.0215 * F.eyeSize;
  const iris = lin(R.eyes);
  const irisLight = mixc(iris, [1, 1, 1], 0.3);
  const white = lin("#f7f5f2");
  const eyeFace = {};
  for (const [s, dir, lidB] of [[1, S.eyes[0], B.lidL], [-1, S.eyes[1], B.lidR]]) {
    const surf = S(dir);
    const nrm = S.normal(dir);
    const ec = surf.clone().addScaledVector(nrm, -eyeR * 0.55).add(HC);
    const fwd = v3(s * 0.04, 0, 1).normalize();
    eyeFace[s > 0 ? "L" : "R"] = { ec, fwd };
    const up = v3(0, 1, 0);
    const side = new THREE.Vector3().crossVectors(up, fwd).normalize();
    const up2 = new THREE.Vector3().crossVectors(fwd, side).normalize();
    // eyeball rings measured from the forward axis so the iris edge stays crisp
    const ang = [0, 0.08, 0.16, 0.2, 0.24, 0.31, 0.38, 0.45, 0.5, 0.53, 0.56, 0.68, 0.85, 1.05, 1.35, 1.7, 2.1, 2.6, Math.PI];
    const ep = Bd.parts.eye;
    const eb = ep.n;
    const seg = qn(18, 8);
    for (let i = 0; i < ang.length; i++) {
      const t = ang[i];
      for (let k = 0; k < seg; k++) {
        const ph = (k / seg) * TAU;
        const d = fwd.clone().multiplyScalar(Math.cos(t)).addScaledVector(side, Math.sin(t) * Math.cos(ph)).addScaledVector(up2, Math.sin(t) * Math.sin(ph));
        let c;
        if (t < 0.2) c = [0.012, 0.01, 0.012];
        else if (t < 0.5) c = mixc(irisLight, iris, smooth(0.2, 0.5, t));
        else if (t < 0.56) c = mulc(iris, 0.42);
        else c = mixc(white, lin("#e0d4cf"), smooth(0.9, 1.6, t) * 0.5);
        ep.v(d.multiplyScalar(eyeR).add(ec), c, H);
      }
    }
    for (let i = 0; i < ang.length - 1; i++) {
      for (let k = 0; k < seg; k++) {
        const k1 = (k + 1) % seg;
        const a = eb + i * seg + k;
        const b = eb + i * seg + k1;
        const c = eb + (i + 1) * seg + k;
        const d = eb + (i + 1) * seg + k1;
        ep.t(a, c, b);
        ep.t(b, c, d);
      }
    }
    blob(ep, ec.clone().addScaledVector(fwd, eyeR * 0.98).add(v3(s * 0.004, 0.005, 0)), [0.0026, 0.0026, 0.0008], [1.6, 1.6, 1.6], H, { lat: 4, lon: 6 });
    // upper lid: a shell over the top of the eyeball, hinged on the lid bone
    const lidR = eyeR * 1.09;
    const lb = part.n;
    const lidLat = 7;
    const lidLon = 16;
    for (let i = 0; i <= lidLat; i++) {
      const t = (i / lidLat) * 1.12;
      for (let k = 0; k <= lidLon; k++) {
        const ph = -1.9 + (k / lidLon) * 3.8;
        const d = up.clone().multiplyScalar(Math.cos(t)).addScaledVector(fwd, Math.sin(t) * Math.cos(ph)).addScaledVector(side, Math.sin(t) * Math.sin(ph));
        part.v(d.multiplyScalar(lidR).add(ec), i === lidLat ? mulc(skin, 0.78) : mixc(skin, skinDark, 0.3), [[lidB, 1]]);
      }
    }
    for (let i = 0; i < lidLat; i++) {
      for (let k = 0; k < lidLon; k++) {
        const a = lb + i * (lidLon + 1) + k;
        const b = a + 1;
        const c = a + lidLon + 1;
        const d = c + 1;
        part.t(a, c, b);
        part.t(b, c, d);
      }
    }
    // lower lid
    const lw = part.n;
    for (let i = 0; i <= 4; i++) {
      const t = (i / 4) * 0.85;
      for (let k = 0; k <= lidLon; k++) {
        const ph = -1.7 + (k / lidLon) * 3.4;
        const d = up.clone().multiplyScalar(-Math.cos(t)).addScaledVector(fwd, Math.sin(t) * Math.cos(ph)).addScaledVector(side, Math.sin(t) * Math.sin(ph));
        part.v(d.multiplyScalar(eyeR * 1.06).add(ec), mixc(skin, blush, 0.5), H);
      }
    }
    for (let i = 0; i < 4; i++) {
      for (let k = 0; k < lidLon; k++) {
        const a = lw + i * (lidLon + 1) + k;
        const b = a + 1;
        const c = a + lidLon + 1;
        const d = c + 1;
        part.t(a, b, c);
        part.t(b, d, c);
      }
    }
    // lashes along the upper lid edge, thicker toward the outer corner
    const lashPts = [];
    const lashN = [];
    for (let k = 0; k <= 8; k++) {
      const ph = -1.55 + (k / 8) * 3.1;
      const t = 1.13;
      const d = up.clone().multiplyScalar(Math.cos(t)).addScaledVector(fwd, Math.sin(t) * Math.cos(ph)).addScaledVector(side, Math.sin(t) * Math.sin(ph));
      lashPts.push(d.clone().multiplyScalar(lidR * 1.04).add(ec));
      lashN.push(d.clone().normalize());
    }
    const outerAt = (u) => (s > 0 ? u : 1 - u);
    strip(Bd.parts.hair, lashPts, lashN, (u) => 0.0012 + 0.0016 * outerAt(u), 0.0012, lin("#1a1414"), [[lidB, 1]], 5);
  }
  // --- brows
  const browCol = mulc(lin(R.hair), R.hairStyle === "buzz" ? 0.75 : 0.85);
  for (const [s, bone] of [[1, B.browL], [-1, B.browR]]) {
    const pts = [];
    const ns = [];
    for (let k = 0; k <= 7; k++) {
      const u = k / 7;
      const x = s * (0.1 + u * 0.36);
      const y = 0.255 + Math.sin(u * Math.PI * 0.9) * 0.045 - u * 0.03 + F.browTilt * (u - 0.5) * 2 + F.eyeY;
      const d = v3(x, y, 0.93).normalize();
      ns.push(S.normal(d));
      pts.push(S(d).add(HC).addScaledVector(ns[k], 0.0022));
    }
    strip(Bd.parts.hair, pts, ns, (u) => (0.0062 - 0.0032 * u) * F.brow, 0.0016, browCol, [[bone, 1]], 6);
  }
  // --- mouth: dark interior (stretches open with the jaw), teeth, lips
  const mdY = v3(0, -0.47, 0.88).normalize().y;
  const mw = 0.026 * F.mouth;
  const onFace = (x, y, out) => {
    const d = v3(x / 0.09, mdY + y / 0.11, 0.88).normalize();
    return S(d).add(HC).addScaledVector(S.normal(d), out);
  };
  const faceN = (x, y) => S.normal(v3(x / 0.09, mdY + y / 0.11, 0.88).normalize());
  const cornerW = (x) => smooth(0.35, 1, Math.abs(x) / mw);
  const lipBW = (x, lower) => {
    const cw = cornerW(x);
    const cb = x > 0 ? B.mouthL : B.mouthR;
    return [[lower ? B.jaw : B.head, 1 - cw * 0.8], [cb, cw * 0.8]];
  };
  {
    const cp = Bd.parts.cloth;
    const cols = 9;
    const quad = (x0, x1, yTop, yBot, out, col, bwTop, bwBot, curve = 0) => {
      const b0 = cp.n;
      for (let row = 0; row < 2; row++) {
        for (let k = 0; k < cols; k++) {
          const u = k / (cols - 1);
          const x = lerp(x0, x1, u);
          const y = row === 0 ? yTop : yBot + curve * (1 - Math.sin(u * Math.PI));
          cp.v(onFace(x, y, out), col, row === 0 ? bwTop(x) : bwBot(x));
        }
      }
      for (let k = 0; k < cols - 1; k++) {
        cp.t(b0 + k, b0 + cols + k, b0 + k + 1);
        cp.t(b0 + k + 1, b0 + cols + k, b0 + cols + k + 1);
      }
    };
    quad(-mw * 0.9, mw * 0.9, 0.0006, -0.0006, 0.0008, lin("#3a1418"), (x) => lipBW(x, false), (x) => lipBW(x, true));
    // teeth: a softly curved band that only follows the head (no fang corners when smiling)
    quad(-mw * 0.5, mw * 0.5, 0.0006, -0.0032, 0.0013, lin("#f2eee6"), () => [[B.head, 1]], () => [[B.head, 0.7], [B.jaw, 0.3]], 0.0022);
  }
  for (const lower of [false, true]) {
    const n = 10;
    const rings = [];
    for (let k = 0; k <= n; k++) {
      const u = k / n;
      const x = lerp(-mw, mw, u);
      const y = lower ? -0.0042 - Math.sin(u * Math.PI) * 0.0018 : 0.0034 + Math.sin(u * Math.PI) * 0.0008 - Math.exp(-(((u - 0.5) / 0.08) ** 2)) * 0.0012;
      const th = Math.max(0.0007, Math.sin(u * Math.PI) ** 0.7 * (lower ? 0.0042 : 0.0032) * F.lip);
      rings.push({ p: onFace(x, y, 0.0016), n: faceN(x, y), rx: th, rz: Math.max(0.0007, th * 0.55), color: lip, bw: lipBW(x, lower) });
    }
    loft(part, rings, 8);
  }
  return { S, HC, eyeFace, eyeR };
}

/* =================================================================== hair */
function buildHair(Bd, P, R, F, L, S, opts) {
  const style = R.hairStyle;
  const HC = L.hc;
  const base = lin(R.hair);
  const hp = Bd.parts.hair;
  const r = rng(F.hairJit >>> 0);
  const capped = opts.cap;
  const H = [[B.head, 1]];
  const out = { topY: HC.y + 0.12, maxR: 0.105 };
  const track = (p) => {
    if (p.y > out.topY) out.topY = p.y;
    const rr = Math.hypot(p.x - HC.x, p.z - HC.z);
    if (p.y > HC.y - 0.02 && p.y < HC.y + 0.06 && rr > out.maxR) out.maxR = rr;
  };
  const colAt = (u, jit) => mulc(base, (0.72 + 0.38 * Math.pow(u, 0.8)) * jit);
  // --- scalp cap following the hairline (feathered at the edge). Sleek styles
  // (ponytail, bun) get combed grooves flowing toward the gather point; the
  // buzz cut gets a fine grain.
  const gather = style === "bun" ? v3(0, 0.62, -0.78).normalize() : style === "ponytail" ? v3(0, 0.25, -0.97).normalize() : null;
  const sleek = !!gather;
  const combed = sleek || style === "long" || style === "bob";
  {
    const off = style === "buzz" ? 0.0035 : combed ? 0.0075 : 0.006;
    const keepArr = [];
    const lat = qn(combed || style === "buzz" ? 38 : 28, 12);
    const lon = qn(combed || style === "buzz" ? 60 : 44, 18);
    for (let i = 0; i <= lat; i++) {
      const th = (i / lat) * Math.PI;
      for (let k = 0; k < lon; k++) {
        const ph = (k / lon) * TAU;
        const d = v3(Math.sin(th) * Math.sin(ph), Math.cos(th), Math.sin(th) * Math.cos(ph));
        keepArr.push(d.y > hairThreshold(d) - 0.12);
      }
    }
    const groove = (d) => {
      if (!combed) return 0;
      if (!sleek) {
        // strands combed down from the crown
        const ang = Math.atan2(d.x, d.z);
        return (Math.sin(ang * 30 + Math.sin(ang * 4) * 2) * 0.5 + Math.sin(ang * 67) * 0.25) * smooth(0.95, 0.6, d.y);
      }
      // angle around the gather axis → stripes radiating from it
      const t1 = new THREE.Vector3().crossVectors(gather, v3(1, 0, 0)).normalize();
      const t2 = new THREE.Vector3().crossVectors(gather, t1);
      const ang = Math.atan2(d.dot(t2), d.dot(t1));
      return Math.sin(ang * 34 + Math.sin(ang * 5) * 2) * 0.5 + Math.sin(ang * 71) * 0.25;
    };
    sphereGrid(
      hp,
      lat,
      lon,
      (d) => {
        const thr = hairThreshold(d) - (style === "buzz" ? 0.02 : 0);
        const vol = combed ? (sleek ? 0.004 : 0.009) * smooth(-0.2, 0.7, d.y) : 0;
        // the cap rises out of the skin along the hairline → smooth contour, no stair steps
        const e = smooth(thr - 0.035, thr + 0.07, d.y);
        let o2 = off + vol + groove(d) * 0.0011;
        if (capped && d.y > -0.05) o2 = Math.min(o2, 0.0035);
        const p = S(d).addScaledVector(S.normal(d), lerp(-0.004, o2, e)).add(HC);
        track(p);
        return p;
      },
      (d) => {
        if (style === "buzz") return mulc(base, 0.5 + r() * 0.22);
        if (combed) return mulc(base, 0.82 + groove(d) * 0.13 + 0.08 * smooth(0.2, 0.9, d.y));
        return mulc(base, 0.7 * (0.9 + r() * 0.12));
      },
      H,
      (i) => keepArr[i],
    );
  }
  if (style === "buzz") return out;
  /** One clump: integrate along the scalp following field(d), then an optional free fall. */
  const clump = (d0, o) => {
    const pts = [];
    const ns = [];
    const d = d0.clone().normalize();
    const ds = (o.ds || 0.1) / Math.min(1, Q * 1.15);
    const steps = Math.min(o.maxSteps || 24, Math.max(2, Math.ceil((o.len || 0.6) / ds)));
    for (let i = 0; i <= steps; i++) {
      const u = i / steps;
      const n = S.normal(d);
      const lift = (o.lift ? o.lift(u) : 0.012) + (o.vol || 0) * Math.sin(Math.min(1, u * 1.4) * Math.PI * 0.5);
      const p = S(d).addScaledVector(n, lift).add(HC);
      if (capped && p.y > HC.y - 0.01 && i > 0) break;
      if (capped && p.y > HC.y - 0.01) return;
      pts.push(p);
      ns.push(n);
      if (i === steps) break;
      const want = o.field(d, u);
      const tang = want.clone().addScaledVector(d, -want.dot(d));
      if (tang.lengthSq() < 1e-8) break;
      d.addScaledVector(tang.normalize(), ds).normalize();
      if (o.stopBelow && d.y < o.stopBelow(d)) {
        const n2 = S.normal(d);
        pts.push(S(d).addScaledVector(n2, lift).add(HC));
        ns.push(n2);
        break;
      }
    }
    if (pts.length < 2) return;
    if (o.fall) {
      let p = pts[pts.length - 1].clone();
      const outV = v3(p.x - HC.x, 0, p.z - HC.z);
      if (outV.lengthSq() < 1e-6) outV.set(0, 0, -1);
      outV.normalize();
      const n = o.fall.steps || 6;
      for (let i = 1; i <= n; i++) {
        const u = i / n;
        const spread = o.fall.spread ? o.fall.spread(u) : 0;
        const curl = o.fall.curl ? o.fall.curl(u) : 0;
        p = p.clone().add(v3(0, -o.fall.len / n, 0)).addScaledVector(outV, (spread - curl) / n);
        pts.push(p);
        ns.push(outV.clone());
      }
    }
    const nPts = pts.length;
    const jit = 0.88 + r() * 0.24;
    const w0 = o.w;
    const width = (u) => w0 * (u < 0.12 ? lerp(0.55, 1, u / 0.12) : 1 - Math.pow((u - 0.12) / 0.88, o.taper || 2.2) * 0.86);
    loft(
      hp,
      pts.map((p, i) => {
        const u = i / (nPts - 1);
        track(p);
        return { p, n: ns[i], rx: Math.max(0.0007, width(u)), rz: Math.max(0.0006, width(u) * (o.flat || 0.38)), pw: 2.2, color: colAt(u, jit), bw: o.bw ? o.bw(u, p) : H };
      }),
      o.seg || 6,
    );
  };
  const fib = (n) => {
    const res = [];
    const ga = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < n; i++) {
      const y = 1 - (i / (n - 1)) * 2;
      const rad = Math.sqrt(1 - y * y);
      const th = ga * i;
      res.push(v3(Math.cos(th) * rad, y, Math.sin(th) * rad));
    }
    return res;
  };
  const inHair = (d, m = 0) => d.y > hairThreshold(d) + m;
  const side = r() < 0.5 ? -1 : 1;
  const sweep = side * 0.35;
  const downField = (d) => v3(d.x * 0.25, -1, d.z * 0.2 - 0.05);
  const backW = (u) => [[B.head, 1 - u * 0.6], [B.hairBack, u * 0.6]];
  if (style === "short" || style === "spiky") {
    for (const d of fib(qn(190, 20)).filter((x) => inHair(x, 0.08))) {
      if (style === "spiky" && d.y > 0.25) continue;
      const front = d.z > 0.25 && d.y > 0.25;
      clump(d, {
        len: 2.2,
        w: 0.021 + r() * 0.006,
        steps: 9,
        vol: 0.009 * smooth(-0.2, 0.9, d.y),
        flat: 0.3,
        taper: 3,
        lift: (u) => 0.005 + u * 0.003,
        field: (dd) => (front ? v3(sweep, -0.35, 1) : dd.z > 0.2 && dd.y > 0.15 ? v3(sweep * 0.5, -0.2, 1) : downField(dd)),
        stopBelow: (dd) => (dd.z > 0.4 ? 0.3 : hairThreshold(dd) - 0.03),
      });
    }
    if (style === "spiky" && !capped) {
      for (const d of fib(qn(110, 20)).filter((x) => x.y > 0.22 && inHair(x, 0.05))) {
        const n = S.normal(d);
        const p0 = S(d).add(HC).addScaledVector(n, -0.004);
        const dir = n.clone().add(v3(0, 0.9, -0.55 + (d.z > 0.4 ? 0.75 : 0))).normalize();
        const len = 0.035 + r() * 0.025 + 0.015 * smooth(0.3, 0.9, d.y);
        const jit = 0.9 + r() * 0.2;
        const rings = [];
        for (let i = 0; i <= 5; i++) {
          const u = i / 5;
          const p = p0.clone().addScaledVector(dir, len * u).add(v3(0, -u * u * 0.012, 0));
          track(p);
          rings.push({ p, n, rx: Math.max(0.0006, 0.016 * (1 - u) ** 1.1), rz: Math.max(0.0006, 0.008 * (1 - u) ** 1.1), color: colAt(0.3 + u * 0.7, jit), bw: H });
        }
        loft(hp, rings, 6);
      }
    }
  } else if (style === "long" || style === "bob") {
    const bob = style === "bob";
    for (const d of fib(qn(260, 20)).filter((x) => inHair(x, 0.04) && (x.y < 0.62 || (x.z > 0.45 && x.y < 0.8)))) {
      const front = d.z > 0.45 && d.y > 0.34 && Math.abs(d.x) < 0.42;
      const sideways = !front && d.z > 0.05;
      const fall = !front
        ? { len: bob ? 0.03 + 0.07 * smooth(0.6, -0.2, d.y) : 0.17 + 0.12 * smooth(0.5, -0.4, d.y) + r() * 0.04, steps: bob ? 4 : 7, spread: (u) => (bob ? 0.012 : 0.03 * u), curl: (u) => (bob ? 0.03 * u * u : 0) }
        : null;
      clump(d, {
        len: front ? 0.5 : 2.4,
        w: 0.022 + r() * 0.008,
        vol: bob ? 0.01 : 0.006,
        flat: 0.26,
        lift: (u) => 0.008 + u * 0.005,
        field: (dd) => (front ? (bob ? v3(sweep * 0.3, -1, 0.4) : v3(sweep * 1.4, -0.6, 1)) : sideways || dd.z > 0.05 ? v3(Math.sign(dd.x) || 1, -0.55, -0.45) : downField(dd)),
        stopBelow: (dd) => (front ? 0.33 : dd.z > 0.25 ? 0.12 : -0.25),
        fall,
        taper: bob ? 4 : 2.6,
        bw: (u) => (fall && !bob ? backW(u) : H),
      });
    }
  } else if (style === "ponytail" || style === "bun") {
    const G = style === "bun" ? v3(0, 0.62, -0.78).normalize() : v3(0, 0.25, -0.97).normalize();
    // a few loose strands on top so the silhouette isn't perfectly smooth
    for (const d of fib(qn(60, 20)).filter((x) => x.y > 0.45 && inHair(x, 0.1))) {
      clump(d, { len: 2.4, w: 0.02, vol: 0.002, flat: 0.2, taper: 4, lift: () => 0.008, field: (dd) => G.clone().sub(dd), stopBelow: (dd) => (dd.angleTo(G) < 0.3 ? 9 : -9) });
    }
    const gn = S.normal(G);
    const gp = S(G).add(HC).addScaledVector(gn, 0.012);
    if (style === "ponytail") {
      blob(hp, gp.clone().addScaledVector(gn, 0.004), [0.02, 0.02, 0.012], lin("#e0453d"), H, { rot: [Math.PI / 2 - 0.4, 0, 0], lat: 5, lon: 10 });
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * TAU;
        const o0 = v3(Math.cos(a) * 0.012, Math.sin(a) * 0.012, 0);
        const sway = (r() - 0.5) * 0.03;
        const jit = 0.88 + r() * 0.24;
        const rings = [];
        for (let k = 0; k <= 9; k++) {
          const u = k / 9;
          const p = gp.clone().add(o0).add(v3(sway * u, -0.24 * u, -0.05 * Math.sin(u * 2.4) - 0.02 * u));
          track(p);
          rings.push({ p, n: v3(0, 0.3, -1).normalize(), rx: Math.max(0.0008, 0.016 * (1 - Math.pow(u, 1.6) * 0.9) * (u < 0.1 ? 0.7 : 1)), rz: Math.max(0.0007, 0.011 * (1 - u * 0.85)), color: colAt(0.35 + u * 0.65, jit), bw: [[B.head, 1 - smooth(0, 0.5, u)], [B.tail, smooth(0, 0.5, u)]] });
        }
        loft(hp, rings, 7);
      }
    } else {
      const sideV = new THREE.Vector3().crossVectors(gn, v3(1, 0, 0)).normalize();
      const sideU = new THREE.Vector3().crossVectors(gn, sideV).normalize();
      for (let i = 0; i < 9; i++) {
        const r0 = 0.012 + (i % 3) * 0.009;
        const a0 = r() * TAU;
        const jit = 0.88 + r() * 0.24;
        const rings = [];
        for (let k = 0; k <= 12; k++) {
          const a = a0 + (k / 12) * TAU * 1.1;
          const p = gp.clone().addScaledVector(gn, 0.022 + (i % 3) * 0.008 - (i % 3 === 2 ? 0.012 : 0)).addScaledVector(sideU, Math.cos(a) * r0 * 1.15).addScaledVector(sideV, Math.sin(a) * r0 * 1.15);
          track(p);
          rings.push({ p, n: gn, rx: 0.012, rz: 0.009, color: colAt(0.5 + (k / 12) * 0.4, jit), bw: H });
        }
        loft(hp, rings, 7);
      }
      blob(hp, gp.clone().addScaledVector(gn, 0.004), [0.024, 0.024, 0.008], lin("#2f5fa8"), H, { rot: [Math.PI / 2 - 0.9, 0, 0], lat: 5, lon: 10 });
    }
    // soft bangs framing the face
    if (style === "ponytail") for (const d of fib(qn(120, 20)).filter((x) => x.z > 0.5 && x.y > 0.36 && Math.abs(x.x) < 0.3 && inHair(x, 0.02))) {
      clump(d, { len: 0.4, w: 0.016, vol: 0.002, flat: 0.22, lift: () => 0.008, field: () => v3(sweep * 1.6, -0.5, 1), stopBelow: () => 0.34 });
    }
  } else if (style === "curly") {
    for (const d of fib(qn(170, 20)).filter((x) => inHair(x, 0.02))) {
      const n = S.normal(d);
      const t1 = new THREE.Vector3().crossVectors(n, v3(0, 1, 0));
      if (t1.lengthSq() < 1e-4) t1.set(1, 0, 0);
      t1.normalize();
      const t2 = new THREE.Vector3().crossVectors(n, t1).normalize();
      const height = capped ? 0.006 + 0.006 * smooth(-0.3, 0.3, d.y) : 0.012 + 0.03 * smooth(-0.3, 0.8, d.y);
      const p0 = S(d).add(HC).addScaledVector(n, height);
      if (capped && p0.y > HC.y + 0.035) continue;
      const a0 = r() * TAU;
      const rad = 0.009 + r() * 0.004;
      const jit = 0.85 + r() * 0.3;
      const rings = [];
      for (let k = 0; k <= 12; k++) {
        const u = k / 12;
        const a = a0 + u * TAU * 1.3;
        const p = p0.clone().addScaledVector(t1, Math.cos(a) * rad).addScaledVector(t2, Math.sin(a) * rad).addScaledVector(n, (u - 0.5) * 0.02).add(v3(0, -u * 0.012, 0));
        track(p);
        const w = 1 - Math.abs(u - 0.5);
        rings.push({ p, n, rx: Math.max(0.001, 0.0085 * w), rz: Math.max(0.001, 0.0075 * w), color: colAt(0.35 + u * 0.6, jit), bw: H });
      }
      loft(hp, rings, 6);
    }
    for (const d of fib(qn(90, 20)).filter((x) => inHair(x, 0.05))) {
      if (capped && d.y > 0.3) continue;
      blob(hp, S(d).add(HC).addScaledVector(S.normal(d), 0.006 + 0.018 * smooth(-0.3, 0.8, d.y)), [0.018, 0.018, 0.018], mulc(base, 0.7), H, { lat: 4, lon: 6 });
    }
  }
  return out;
}

/* =================================================================== body */
const TORSO = [
  [0.8, 0.03, 0.03, 0],
  [0.83, 0.105, 0.085, 0],
  [0.86, 0.142, 0.1, -0.004],
  [0.9, 0.162, 0.112, -0.008],
  [0.95, 0.164, 0.11, -0.006],
  [1.0, 0.151, 0.102, 0],
  [1.05, 0.138, 0.095, 0.004],
  [1.1, 0.141, 0.097, 0.006],
  [1.16, 0.151, 0.103, 0.008],
  [1.22, 0.161, 0.108, 0.009],
  [1.28, 0.167, 0.108, 0.007],
  [1.33, 0.171, 0.103, 0.002],
  [1.37, 0.17, 0.094, -0.004],
  [1.4, 0.156, 0.084, -0.008],
  [1.425, 0.122, 0.072, -0.008],
  [1.445, 0.078, 0.062, -0.006],
  [1.46, 0.056, 0.054, -0.001],
  [1.5, 0.049, 0.048, 0.004],
  [1.545, 0.046, 0.046, 0.008],
  [1.565, 0.03, 0.03, 0.008],
  [1.575, 0.002, 0.002, 0.008],
];
function torsoProfile(y, P) {
  let i = 0;
  while (i < TORSO.length - 2 && y > TORSO[i + 1][0]) i++;
  const a = TORSO[i];
  const b = TORSO[i + 1];
  const t = clamp((y - a[0]) / (b[0] - a[0]), 0, 1);
  const s = t * t * (3 - 2 * t) * 0.5 + t * 0.5;
  const wk = y > 1.43 ? 1 : P.w;
  const dk = y > 1.43 ? 1 : 0.55 + 0.45 * P.w;
  return { rx: lerp(a[1], b[1], s) * wk, rz: lerp(a[2], b[2], s) * dk, zc: lerp(a[3], b[3], s) };
}
/** Point on the torso surface at height y and angle a (π/2 = front). */
function torsoPoint(y, a, P, out = 0) {
  const pr = torsoProfile(y, P);
  const pw = y > 1.43 ? 2 : 2.5;
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  const cx = Math.sign(ca) * Math.pow(Math.abs(ca), 2 / pw);
  const sz = Math.sign(sa) * Math.pow(Math.abs(sa), 2 / pw);
  return v3((pr.rx + out) * cx, y, pr.zc + (pr.rz + out) * sz);
}

/** Garment design from the outfit style. */
function garment(R) {
  const st = R.style;
  const o = R.o;
  const G = { top: lin(o.top), acc: lin(o.accent), bot: lin(o.bottom), shoes: lin(o.shoes), style: st, sleeves: "long", jacket: false, hem: 0.95, collar: null, open: 0, coatTail: 0, extra: 0.007 };
  switch (st) {
    case "blazer":
      Object.assign(G, { jacket: true, open: 0.42, hem: 0.875, collar: "lapel", cuff: G.acc, extra: 0.011, tie: o.tie ? lin(o.tie) : null });
      break;
    case "labcoat":
      Object.assign(G, { jacket: true, open: 0.5, hem: 0.875, collar: "lapel", coatTail: 0.5, coat: lin("#f4f4f2"), shirt: G.acc, extra: 0.012 });
      break;
    case "tee":
      Object.assign(G, { sleeves: "short", collar: "crew", hem: 0.93 });
      break;
    case "jersey":
      Object.assign(G, { sleeves: "short", collar: "v", hem: 0.92 });
      break;
    case "apron":
      Object.assign(G, { sleeves: "short", collar: "crew", apron: lin("#e6e6e2") });
      break;
    case "track":
      Object.assign(G, { collar: "stand", zip: true, stripes: G.acc, cuff: G.acc, hem: 0.93, extra: 0.01 });
      break;
    case "vest":
      Object.assign(G, { vest: G.top, top: G.acc, collar: "shirt", hem: 0.94 });
      break;
    case "varsity":
      Object.assign(G, { sleeveCol: G.acc, collar: "rib", cuff: G.acc, ribHem: G.acc, patch: true, extra: 0.012, hem: 0.93 });
      break;
    case "hoodie":
      Object.assign(G, { hood: true, pocket: true, cuff: mulc(G.top, 0.85), ribHem: mulc(G.top, 0.85), extra: 0.013, hem: 0.9 });
      break;
    case "gown":
      Object.assign(G, { collar: "v", gown: true, stole: G.acc, extra: 0.016, hem: 0.88 });
      break;
    default:
  }
  return G;
}

function buildBody(Bd, P, R, F, L) {
  const G = garment(R);
  const skin = skinTone(R.skin);
  const skinShade = mulc(skin, 0.9);
  const cloth = Bd.parts.cloth;
  const sk = Bd.parts.skin;
  const isSkirt = R.bottom === "skirt";
  const isShorts = R.bottom === "shorts";
  const beltY = 0.985;
  /* ---------------- torso + neck */
  {
    const rings = [];
    for (let y = 0.8; y <= 1.5751; y += 0.013) {
      const yy = Math.min(1.575, y);
      const pr = torsoProfile(yy, P);
      const aboveCollar = yy > 1.455;
      const fabric = aboveCollar ? 0 : G.extra * smooth(1.44, 1.38, yy) + 0.004;
      const bw =
        yy < 0.97
          ? [[B.hips, 1]]
          : yy < 1.12
            ? [[B.hips, 1 - smooth(0.97, 1.12, yy)], [B.spine, smooth(0.97, 1.12, yy)]]
            : yy < 1.3
              ? [[B.spine, 1 - smooth(1.18, 1.3, yy)], [B.chest, smooth(1.18, 1.3, yy)]]
              : yy < 1.44
                ? [[B.chest, 1]]
                : yy < 1.5
                  ? [[B.chest, 1 - smooth(1.44, 1.5, yy)], [B.neck, smooth(1.44, 1.5, yy)]]
                  : [[B.neck, 1 - smooth(1.53, 1.57, yy)], [B.head, smooth(1.53, 1.57, yy)]];
      const color = (a, ca, sa) => {
        if (aboveCollar) return yy > 1.52 ? skin : mixc(skin, skinShade, 0.4);
        const front = sa;
        const tucked = !G.jacket && !G.gown;
        if (yy < beltY && tucked && yy < G.hem) return G.bot;
        if (yy >= beltY && yy < beltY + 0.012 && tucked && G.hem > beltY) return mulc(G.bot, 0.55);
        if (G.gown) return Math.abs(Math.abs(ca) - 0.24) < 0.05 && front > 0 ? G.stole : G.top;
        if (G.jacket) {
          const halfV = G.open * smooth(1.17, 1.43, yy);
          if (front > Math.cos(halfV) && yy > 1.15) return G.shirt || G.acc;
          if (front > 0.995 && yy < 1.15) return mulc(G.coat || G.top, 0.8);
          return G.coat || G.top;
        }
        if (G.vest) {
          const halfV = 0.42 * smooth(1.2, 1.44, yy);
          if (yy > 1.43 || (front > Math.cos(halfV) && yy > 1.2)) return G.top;
          if (yy < 0.975) return mulc(G.vest, 0.82);
          return Math.sin(a * 40) > 0.6 && yy < 1.0 ? mulc(G.vest, 0.9) : G.vest;
        }
        if (G.apron && front > 0.25 && yy < 1.36) return G.apron;
        if (G.ribHem && yy < G.hem + 0.03) return Math.sin(yy * 900) > 0 ? G.ribHem : mulc(G.ribHem, 0.85);
        if (G.style === "jersey" && front < -0.55 && yy > 1.12 && yy < 1.34 && (Math.abs(ca + 0.13) < 0.06 || Math.abs(ca - 0.13) < 0.06)) return G.acc;
        if (G.pocket && front > 0.7 && yy > 0.99 && yy < 1.1) return mulc(G.top, 0.9);
        return G.top;
      };
      const off = (a, ca, sa) => {
        if (aboveCollar) return 0;
        let o = fabric;
        if (yy < 1.12 && yy > (isSkirt ? 1.03 : 0.95)) o += 0.0016 * Math.sin(a * 9 + yy * 60) * (1 - Math.abs(sa) * 0.5);
        if (yy < beltY && !G.jacket && !G.gown) o = 0.004;
        if (G.jacket && yy < 1.12 && yy > G.hem) o += 0.004 * smooth(1.12, G.hem, yy);
        if (G.gown) o += 0.01 * smooth(1.2, 0.85, yy);
        return o;
      };
      rings.push({ p: v3(0, yy, pr.zc), t: v3(0, 1, 0), n: v3(0, 0, 1), rx: pr.rx, rz: pr.rz, pw: yy > 1.43 ? 2 : 2.5, bw, color, off });
    }
    const neckFrom = rings.findIndex((r) => r.p.y > 1.43);
    loft(cloth, rings.slice(0, neckFrom + 1), 24);
    loft(sk, rings.slice(neckFrom), 24);
  }
  /* ---------------- arms + hands */
  for (const s of [1, -1]) {
    const arm = L.arm(s);
    const long = G.sleeves === "long";
    const sleeveCol = G.sleeveCol || G.coat || G.top;
    const cuffCol = G.cuff || sleeveCol;
    const o = s < 0 ? 4 : 0;
    const prof = [
      [-0.03, 0.016, 0.02],
      [-0.012, 0.036, 0.042],
      [0.02, 0.047, 0.051],
      [0.06, 0.048, 0.05],
      [0.12, 0.045, 0.046],
      [0.19, 0.04, 0.041],
      [0.245, 0.035, 0.037],
      [0.272, 0.035, 0.038],
      [0.3, 0.038, 0.04],
      [0.36, 0.035, 0.034],
      [0.43, 0.029, 0.026],
      [0.49, 0.024, 0.02],
      [0.505, 0.021, 0.017],
      [0.512, 0.006, 0.006],
    ];
    const sleeveEnd = long ? 0.488 : 0.15;
    const rings = [];
    for (let s0 = -0.03; s0 <= 0.5121; s0 += 0.015) {
      const ss = Math.min(0.512, s0);
      let i = 0;
      while (i < prof.length - 2 && ss > prof[i + 1][0]) i++;
      const a = prof[i];
      const b = prof[i + 1];
      const t = clamp((ss - a[0]) / (b[0] - a[0]), 0, 1);
      const k = 0.88 + 0.12 * P.w;
      const inSleeve = ss < sleeveEnd;
      const cuff = long && ss > sleeveEnd - 0.03 && inSleeve;
      const hem = !long && ss > sleeveEnd - 0.02 && inSleeve;
      const fabric = inSleeve ? (long ? 0.006 + (G.jacket ? 0.004 : 0) + (G.gown ? 0.012 * smooth(0.2, 0.49, ss) : 0) : 0.008) + (cuff || hem ? 0.002 : 0) : 0;
      const bw =
        ss < 0.03
          ? [[B.clavL + o, 0.35 * (1 - smooth(-0.03, 0.03, ss))], [B.armL + o, 1 - 0.35 * (1 - smooth(-0.03, 0.03, ss))]]
          : ss < 0.32
            ? [[B.armL + o, 1 - smooth(0.22, 0.32, ss)], [B.foreL + o, smooth(0.22, 0.32, ss)]]
            : ss < 0.48
              ? [[B.foreL + o, 1]]
              : [[B.foreL + o, 1 - smooth(0.48, 0.51, ss)], [B.handL + o, smooth(0.48, 0.51, ss)]];
      const color = (aa) => {
        if (!inSleeve) return ss > 0.44 ? mixc(skin, skinShade, 0.25) : skin;
        if (cuff) return cuffCol;
        if (hem) return mulc(sleeveCol, 0.88);
        if (G.stripes && Math.cos(aa) * s > 0.94) return G.stripes;
        return sleeveCol;
      };
      const off = (aa) => (inSleeve ? fabric + (long && ss > 0.22 && ss < 0.32 ? 0.0018 * Math.sin(aa * 7 + ss * 80) : 0) : 0);
      rings.push({ p: v3(arm.x, arm.y - ss, arm.z + (ss > 0.27 ? 0.004 : 0)), t: v3(0, -1, 0), n: v3(0, 0, 1), rx: lerp(a[1], b[1], t) * k, rz: lerp(a[2], b[2], t) * k, bw, color, off, part: inSleeve ? "cloth" : "skin" });
    }
    const cut = rings.findIndex((r) => r.part === "skin");
    if (cut <= 0) loft(cloth, rings, 14);
    else {
      loft(cloth, rings.slice(0, cut + 1), 14);
      loft(sk, rings.slice(cut), 14);
    }
    buildHand(Bd, L, s, skin);
  }
  /* ---------------- legs */
  for (const s of [1, -1]) {
    const th = L.thigh(s);
    const o = s < 0 ? 3 : 0;
    const prof = [
      [-0.06, 0.07, 0.07, 0],
      [0.0, 0.088, 0.09, 0],
      [0.08, 0.085, 0.088, 0.002],
      [0.18, 0.075, 0.077, 0.004],
      [0.3, 0.063, 0.064, 0.004],
      [0.39, 0.052, 0.055, 0.006],
      [0.425, 0.051, 0.054, 0.008],
      [0.46, 0.053, 0.055, 0.004],
      [0.53, 0.058, 0.06, -0.008],
      [0.62, 0.051, 0.051, -0.006],
      [0.72, 0.04, 0.04, -0.002],
      [0.8, 0.032, 0.034, 0],
      [0.83, 0.03, 0.03, 0],
      [0.845, 0.004, 0.004, 0],
    ];
    const pants = R.bottom === "pants" || G.gown;
    const shortsEnd = 0.2;
    const sockTop = isSkirt ? 0.47 : 0.66;
    const rings = [];
    for (let s0 = -0.06; s0 <= 0.8451; s0 += 0.019) {
      const ss = Math.min(0.845, s0);
      let i = 0;
      while (i < prof.length - 2 && ss > prof[i + 1][0]) i++;
      const a = prof[i];
      const b = prof[i + 1];
      const t = clamp((ss - a[0]) / (b[0] - a[0]), 0, 1);
      const k = 0.88 + 0.12 * P.w;
      const inPants = pants || (isShorts && ss < shortsEnd);
      const sock = !inPants && ss > sockTop;
      const flare = pants ? 0.006 + 0.008 * smooth(0.5, 0.82, ss) : isShorts && ss < shortsEnd ? 0.012 : sock ? 0.002 : 0;
      const bw =
        ss < 0.06
          ? [[B.hips, 0.4 * (1 - smooth(-0.06, 0.06, ss))], [B.thighL + o, 1 - 0.4 * (1 - smooth(-0.06, 0.06, ss))]]
          : ss < 0.48
            ? [[B.thighL + o, 1 - smooth(0.37, 0.48, ss)], [B.shinL + o, smooth(0.37, 0.48, ss)]]
            : ss < 0.78
              ? [[B.shinL + o, 1]]
              : [[B.shinL + o, 1 - smooth(0.78, 0.83, ss)], [B.footL + o, smooth(0.78, 0.83, ss)]];
      const color = (aa, ca, sa) => {
        if (inPants) {
          if (Math.abs(ca) > 0.985) return mulc(G.bot, 0.82);
          if (pants && ss > 0.8) return mulc(G.bot, 0.9);
          if (isShorts && ss > shortsEnd - 0.02) return mulc(G.bot, 0.88);
          return G.bot;
        }
        if (sock) return ss < sockTop + 0.02 ? lin(G.style === "blazer" ? "#2a2c35" : "#e6e6e6") : lin(G.style === "blazer" ? "#33353f" : "#f4f4f4");
        return ss > 0.42 && ss < 0.45 && sa > 0.5 ? mixc(skin, skinShade, 0.4) : skin;
      };
      const off = (aa, ca, sa) => {
        let v = flare;
        if (pants && ((ss > 0.38 && ss < 0.47) || ss > 0.7)) v += 0.0022 * Math.sin(aa * 6 + ss * 50) * (0.5 + 0.5 * sa);
        return v;
      };
      rings.push({ p: v3(th.x, th.y - ss, th.z + lerp(a[3], b[3], t)), t: v3(0, -1, 0), n: v3(0, 0, 1), rx: lerp(a[1], b[1], t) * k, rz: lerp(a[2], b[2], t) * k, bw, color, off, part: inPants || sock ? "cloth" : "skin" });
    }
    let start = 0;
    for (let i = 1; i <= rings.length; i++) {
      if (i === rings.length || rings[i].part !== rings[start].part) {
        loft(rings[start].part === "cloth" ? cloth : sk, rings.slice(start, Math.min(rings.length, i + 1)), 16);
        start = i;
      }
    }
    buildShoe(Bd, L, s, G);
  }
  buildGarmentParts(Bd, P, R, L, G);
  return G;
}

function buildHand(Bd, L, s, skin) {
  const hb = B.handL + (s < 0 ? 4 : 0);
  const fb = B.foreL + (s < 0 ? 4 : 0);
  const sk = Bd.parts.skin;
  const w = L.hand(s);
  const nail = mixc(skin, lin("#f2c9c4"), 0.5);
  const knuckle = mulc(skin, 0.94);
  // palm faces the thigh, fingers point down
  const prof = [[-0.012, 0.016, 0.026], [0.0, 0.017, 0.031], [0.03, 0.0165, 0.035], [0.06, 0.0145, 0.036], [0.075, 0.012, 0.033], [0.082, 0.006, 0.02]];
  loft(sk, prof.map(([d, rx, rz]) => ({ p: v3(w.x + s * 0.002, w.y - d, w.z + 0.004), t: v3(0, -1, 0), n: v3(0, 0, 1), rx, rz, color: d > 0.07 ? knuckle : skin, bw: d < 0.005 ? [[hb, 0.7], [fb, 0.3]] : [[hb, 1]], pw: 2.3 })), 12);
  // fingers curl toward the palm (−x for the left hand), index finger in front
  for (const [fz, len, r] of [[0.024, 0.056, 0.0072], [0.008, 0.062, 0.0075], [-0.008, 0.059, 0.0072], [-0.023, 0.048, 0.0064]]) {
    const rings = [];
    for (let k = 0; k <= 7; k++) {
      const u = k / 7;
      const bend = Math.pow(u, 1.6) * 0.55;
      const tip = u > 0.92 ? 0.55 : 1;
      rings.push({ p: v3(w.x - s * Math.sin(bend) * len * 0.45, w.y - 0.072 - Math.cos(bend * 0.6) * len * u, w.z + 0.004 + fz * (1 - u * 0.1)), n: v3(0, 0, 1), rx: Math.max(0.0015, r * (1 - u * 0.25) * tip), rz: Math.max(0.0015, r * 0.92 * (1 - u * 0.25) * tip), color: u > 0.85 ? nail : skin, bw: [[hb, 1]] });
    }
    loft(sk, rings, 8);
  }
  // thumb
  const tp = [];
  for (let k = 0; k <= 6; k++) {
    const u = k / 6;
    const tip = u > 0.9 ? 0.6 : 1;
    tp.push({ p: v3(w.x - s * (0.004 + u * 0.012), w.y - 0.018 - u * 0.05, w.z + 0.03 + u * 0.016), n: v3(1, 0, 0), rx: Math.max(0.0018, 0.0095 * (1 - u * 0.3) * tip), rz: Math.max(0.0018, 0.0085 * (1 - u * 0.3) * tip), color: u > 0.85 ? nail : skin, bw: [[hb, 1]] });
  }
  loft(sk, tp, 8);
}

function buildShoe(Bd, L, s, G) {
  const fb = B.footL + (s < 0 ? 3 : 0);
  const f = L.foot(s);
  const cp = Bd.parts.cloth;
  const formal = G.style === "blazer" || G.style === "gown";
  const main = G.shoes;
  const light = main[0] + main[1] + main[2] > 2.2;
  const sole = formal ? lin("#1a1a1a") : light ? lin("#d8d8d8") : lin("#f2f2f2");
  const accent = formal ? mulc(main, 1.2) : light ? mixc(G.acc, lin("#4f8cff"), 0.4) : lin("#ffffff");
  const rows = formal
    ? [[-0.062, 0.006, 0.006, -0.03], [-0.055, 0.03, 0.03, -0.035], [-0.03, 0.039, 0.045, -0.032], [0.0, 0.043, 0.048, -0.036], [0.05, 0.046, 0.036, -0.046], [0.1, 0.045, 0.028, -0.052], [0.14, 0.04, 0.022, -0.056], [0.165, 0.028, 0.017, -0.058], [0.178, 0.006, 0.006, -0.06]]
    : [[-0.066, 0.006, 0.006, -0.028], [-0.06, 0.032, 0.034, -0.03], [-0.035, 0.042, 0.05, -0.026], [0.0, 0.046, 0.054, -0.03], [0.05, 0.049, 0.042, -0.042], [0.1, 0.048, 0.033, -0.05], [0.14, 0.044, 0.026, -0.055], [0.168, 0.032, 0.02, -0.058], [0.182, 0.007, 0.007, -0.06]];
  loft(
    cp,
    rows.map(([z, rx, rz, yc]) => ({
      p: v3(f.x + s * 0.004, f.y + yc, f.z + z),
      t: v3(0, 0, 1),
      n: v3(0, 1, 0),
      rx,
      rz,
      pw: 2.6,
      color: (a, ca, sa) => (formal ? (sa > 0.6 && z > 0.04 ? mulc(main, 1.3) : main) : z > 0.12 && sa < 0.5 ? accent : Math.abs(ca) > 0.9 && z > -0.02 && z < 0.1 ? accent : main),
      bw: [[fb, 1]],
    })),
    18,
  );
  const srows = [[-0.068, 0.005], [-0.062, 0.034], [-0.03, 0.044], [0.03, 0.05], [0.1, 0.05], [0.15, 0.045], [0.175, 0.032], [0.188, 0.006]];
  loft(cp, srows.map(([z, rx]) => ({ p: v3(f.x + s * 0.004, f.y - 0.07, f.z + z), t: v3(0, 0, 1), n: v3(0, 1, 0), rx: rx + 0.003, rz: formal ? 0.007 : 0.011, pw: 3, color: sole, bw: [[fb, 1]] })), 14);
  if (!formal) {
    for (let k = 0; k < 4; k++) {
      const z = 0.015 + k * 0.022;
      blob(cp, v3(f.x + s * 0.004, f.y + 0.026 - (z / 0.1) * 0.02 - k * 0.004, f.z + z), [0.022, 0.0035, 0.004], lin("#fafafa"), [[fb, 1]], { lat: 3, lon: 6, rot: [0.4, 0, 0] });
    }
  }
}

/** How far the torso fabric sits above the body at height y. */
const fabricAt = (G, y) => G.extra * smooth(1.44, 1.38, y) + 0.004 + (G.jacket && y < 1.12 && y > G.hem ? 0.004 * smooth(1.12, G.hem, y) : 0);
function buildGarmentParts(Bd, P, R, L, G) {
  const cp = Bd.parts.cloth;
  const C = [[B.chest, 1]];
  const front = Math.PI / 2;
  const surf = (y, a, out) => torsoPoint(y, a, P, out);
  const outN = (y, a) => {
    const p = torsoPoint(y, a, P);
    return v3(p.x, 0, p.z - torsoProfile(y, P).zc).normalize();
  };
  if (G.collar === "lapel") {
    for (const s of [1, -1]) {
      const pts = [];
      const ns = [];
      for (let k = 0; k <= 7; k++) {
        const u = k / 7;
        const y = lerp(1.44, 1.17, u);
        const halfV = G.open * smooth(1.17, 1.43, y);
        const a = front - s * (halfV + 0.12 + 0.12 * Math.sin(u * Math.PI));
        pts.push(surf(y, a, fabricAt(G, y) + 0.003));
        ns.push(outN(y, a));
      }
      strip(cp, pts, ns, (u) => 0.012 + 0.016 * Math.sin(Math.min(1, u * 1.3) * Math.PI), 0.0035, mulc(G.coat || G.top, 0.86), C, 6);
    }
    for (const s of [1, -1]) strip(cp, [surf(1.458, front - s * 0.5, 0.006), surf(1.425, front - s * 0.17, fabricAt(G, 1.425) + 0.001)], [outN(1.455, front - s * 0.5), outN(1.425, front - s * 0.17)], (u) => 0.009 - 0.006 * u, 0.002, G.shirt || G.acc, C, 6);
  } else if (G.collar === "shirt") {
    for (const s of [1, -1]) strip(cp, [surf(1.463, front - s * 0.55, 0.008), surf(1.43, front - s * 0.16, 0.011)], [outN(1.46, front - s * 0.55), outN(1.43, front - s * 0.16)], (u) => 0.009 - 0.006 * u, 0.002, G.top, C, 6);
  } else if (G.collar) {
    const pts = [];
    const ns = [];
    for (let k = 0; k <= 24; k++) {
      const a = (k / 24) * TAU;
      const vdip = G.collar === "v" ? 0.06 * Math.max(0, Math.sin(a)) ** 6 : 0;
      const y = (G.collar === "stand" ? 1.47 : 1.448) - vdip;
      pts.push(surf(y, a, G.collar === "stand" ? 0.002 : 0.004 + (vdip > 0.01 ? 0.004 : 0)));
      ns.push(v3(0, 1, 0).lerp(outN(y, a), 0.5).normalize());
    }
    const col = G.collar === "rib" || G.collar === "v" ? G.acc : G.collar === "stand" ? G.top : mulc(G.top, 0.9);
    strip(cp, pts, ns, G.collar === "stand" ? 0.014 : 0.006, 0.004, col, (u, p) => (p.y > 1.46 ? [[B.chest, 0.6], [B.neck, 0.4]] : C), 6);
  }
  if (G.tie) {
    const pts = [];
    const ns = [];
    for (let k = 0; k <= 8; k++) {
      const y = lerp(1.435, 1.13, k / 8);
      pts.push(surf(y, front, fabricAt(G, y) + 0.0035));
      ns.push(outN(y, front));
    }
    strip(cp, pts, ns, (u) => (u < 0.08 ? 0.011 : 0.007 + 0.009 * u), 0.003, G.tie, (u) => (u < 0.5 ? C : [[B.chest, 1.5 - u], [B.spine, u - 0.5]]), 6);
    blob(cp, surf(1.432, front, fabricAt(G, 1.432) + 0.006), [0.012, 0.009, 0.006], mulc(G.tie, 0.9), C, { lat: 4, lon: 8 });
  }
  if (G.jacket) for (const y of [1.11, 1.04]) blob(cp, surf(y, front - 0.03, fabricAt(G, y) + 0.002), [0.006, 0.006, 0.003], mulc(G.coat || G.top, 0.55), [[B.spine, 1]], { lat: 4, lon: 8 });
  if (G.vest) {
    for (const s2 of [1, -1]) {
      const pts = [];
      const ns = [];
      for (let k = 0; k <= 6; k++) {
        const y = lerp(1.44, 1.2, k / 6);
        const a = front - s2 * 0.42 * smooth(1.2, 1.44, y);
        pts.push(surf(y, a, fabricAt(G, y) + 0.0012));
        ns.push(outN(y, a));
      }
      strip(cp, pts, ns, 0.0035, 0.0015, mulc(G.vest, 0.75), C, 4);
    }
  }
  if (G.vest) for (const y of [1.16, 1.09, 1.02]) blob(cp, surf(y, front, fabricAt(G, y) + 0.002), [0.0045, 0.0045, 0.0025], mulc(G.vest, 0.6), [[B.spine, 1]], { lat: 4, lon: 6 });
  if (G.zip) {
    const pts = [];
    const ns = [];
    for (let k = 0; k <= 10; k++) {
      const y = lerp(1.47, 0.94, k / 10);
      pts.push(surf(y, front, fabricAt(G, y) + 0.002));
      ns.push(outN(y, front));
    }
    strip(cp, pts, ns, 0.0028, 0.0018, G.acc, (u, p) => (p.y > 1.2 ? C : p.y > 1.03 ? [[B.spine, 1]] : [[B.hips, 0.5], [B.spine, 0.5]]), 5);
  }
  const crest = (y, a, r, ring, fill) => {
    const pts = [];
    const ns = [];
    for (let k = 0; k <= 16; k++) {
      const t = (k / 16) * TAU;
      pts.push(surf(y + Math.sin(t) * r, a + (Math.cos(t) * r) / 0.17, fabricAt(G, y) + 0.0012));
      ns.push(outN(y, a));
    }
    strip(cp, pts, ns, 0.0035, 0.0012, ring, C, 4);
    blob(cp, surf(y, a, fabricAt(G, y) - 0.0005), [r * 0.85, r * 0.85, 0.0022], fill, C, { rot: [0, a - front, 0], lat: 4, lon: 12 });
  };
  if (G.patch) crest(1.29, front + 0.5, 0.022, G.acc, G.top);
  if (G.style === "jersey") crest(1.28, front + 0.48, 0.016, G.acc, mulc(G.top, 0.8));
  if (G.pocket) {
    const pts = [];
    const ns = [];
    for (let k = 0; k <= 6; k++) {
      const a = front - 0.55 + (k / 6) * 1.1;
      pts.push(surf(1.045, a, fabricAt(G, 1.045) + 0.004));
      ns.push(outN(1.045, a));
    }
    strip(cp, pts, ns, 0.03, 0.004, mulc(G.top, 0.92), [[B.spine, 1]], 6);
    for (const s of [1, -1]) {
      const p2 = [];
      const n2 = [];
      for (let k = 0; k <= 5; k++) {
        const y = lerp(1.44, 1.3, k / 5);
        p2.push(surf(y, front - s * 0.12, fabricAt(G, y) + 0.003));
        n2.push(outN(y, front - s * 0.12));
      }
      strip(cp, p2, n2, 0.0018, 0.0018, mulc(G.top, 1.25), C, 5);
    }
  }
  if (G.hood) {
    const pts = [];
    const ns = [];
    for (let k = 0; k <= 12; k++) {
      const a = 0.25 + (k / 12) * (Math.PI - 0.5) + Math.PI;
      pts.push(surf(1.43 + 0.015 * Math.sin((k / 12) * Math.PI), a, 0.02));
      ns.push(v3(0, 1, 0));
    }
    strip(cp, pts, ns, (u) => 0.02 + 0.03 * Math.sin(u * Math.PI), 0.016, mulc(G.top, 0.94), [[B.chest, 0.7], [B.neck, 0.3]], 8);
  }
  if (G.apron) {
    for (const s of [1, -1]) {
      const pts = [];
      const ns = [];
      for (let k = 0; k <= 4; k++) {
        const y = lerp(1.455, 1.35, k / 4);
        const a = front - s * lerp(0.9, 0.5, k / 4);
        pts.push(surf(y, a, 0.01));
        ns.push(outN(y, a));
      }
      strip(cp, pts, ns, 0.007, 0.002, G.apron, C, 5);
    }
  }
  // skirts, coat tails and gowns: a shell around the hips that follows the legs
  const skirt = (y0, y1, r0, r1, col, open, pleat) => {
    const rows = [];
    let mx = 0;
    let mz = 0;
    for (let i = 0; i <= 9; i++) {
      const u = i / 9;
      const y = lerp(y0, y1, u);
      const pr = torsoProfile(Math.max(0.9, y), P);
      // never narrower than the widest body part above (the hips) → no poke-through
      mx = Math.max(mx, pr.rx + 0.006);
      mz = Math.max(mz, pr.rz + 0.006);
      const f = Math.pow(u, 0.9);
      rows.push({ u, y, rx: mx + lerp(r0, r1, f), rz: mz + lerp(r0, r1 * 0.85, f), zc: pr.zc });
    }
    const cols = 32;
    for (const face of open ? [1, -1] : [1]) {
      const base = cp.n;
      const a0 = open ? front + open : 0;
      const span = open ? TAU - 2 * open : TAU;
      const rowN = open ? cols + 1 : cols;
      for (const r of rows) {
        for (let k = 0; k < rowN; k++) {
          const a = a0 + (k / cols) * span;
          const pl = pleat ? 0.006 * Math.abs(Math.sin(a * 8)) * r.u : 0;
          const shrink = face < 0 ? 0.996 : 1;
          const x = Math.cos(a) * (r.rx + pl) * shrink;
          const z = r.zc + Math.sin(a) * (r.rz + pl) * shrink;
          const lw = r.u * 0.75 * clamp(0.5 + x / (r.rx * 1.4), 0, 1);
          const rw = r.u * 0.75 * clamp(0.5 - x / (r.rx * 1.4), 0, 1);
          cp.v(v3(x, r.y, z), r.u > 0.94 ? mulc(col, 0.85) : face < 0 ? mulc(col, 0.7) : col, [[B.hips, Math.max(0.05, 1 - lw - rw)], [B.thighL, lw], [B.thighR, rw]]);
        }
      }
      for (let i = 0; i < rows.length - 1; i++) {
        for (let k = 0; k < cols; k++) {
          const k1 = open ? k + 1 : (k + 1) % cols;
          const a = base + i * rowN + k;
          const b = base + i * rowN + k1;
          const c = base + (i + 1) * rowN + k;
          const d = base + (i + 1) * rowN + k1;
          if (face > 0) {
            cp.t(a, b, c);
            cp.t(b, d, c);
          } else {
            cp.t(a, c, b);
            cp.t(b, c, d);
          }
        }
      }
    }
  };
  if (R.bottom === "skirt" && !G.gown) skirt(1.005, 0.66, 0.004, 0.065, G.bot, 0, true);
  if (G.coat) skirt(0.96, 0.6, 0.016, 0.05, G.coat, 0.22, false);
  if (G.gown) skirt(0.98, 0.32, 0.018, 0.1, G.top, 0, false);
  if (G.jacket && !G.coat) skirt(0.955, G.hem, G.extra + 0.002, G.extra + 0.012, G.top, 0.06, false);
}

/* =================================================================== accessories */
function buildAccessories(Bd, P, R, F, L, head, hair) {
  const a = R.acc;
  const G0 = garment(R);
  const cp = Bd.parts.cloth;
  const H = [[B.head, 1]];
  const HC = L.hc;
  const S = head.S;
  if (a.face === "glasses" || a.face === "sunglasses") {
    const sun = a.face === "sunglasses";
    const frame = lin(sun ? "#141414" : "#2b2b33");
    const centre = (k) => head.eyeFace[k].ec.clone().addScaledVector(head.eyeFace[k].fwd, head.eyeR * 1.55);
    for (const k of ["L", "R"]) {
      const c = centre(k);
      const fwd = head.eyeFace[k].fwd;
      const pts = [];
      const ns = [];
      for (let i = 0; i <= 18; i++) {
        const t = (i / 18) * TAU;
        pts.push(c.clone().add(v3(Math.cos(t) * 0.025, Math.sin(t) * 0.019 - 0.002, 0)));
        ns.push(fwd);
      }
      strip(cp, pts, ns, 0.0026, 0.0026, frame, H, 5);
      if (sun) blob(cp, c.clone().add(v3(0, -0.002, -0.001)), [0.024, 0.018, 0.002], lin("#202a3a"), H, { lat: 4, lon: 12 });
      const s = k === "L" ? 1 : -1;
      const earP = S(v3(s, 0.03, -0.1).normalize()).add(HC);
      const t0 = c.clone().add(v3(s * 0.025, 0.002, 0));
      strip(cp, [t0, v3(earP.x + s * 0.006, t0.y, HC.z + 0.02), v3(earP.x + s * 0.004, earP.y + 0.012, earP.z)], [v3(s, 0, 0), v3(s, 0, 0), v3(s, 0, 0)], 0.002, 0.0022, frame, H, 4);
    }
    const lc = centre("L");
    const rc = centre("R");
    strip(cp, [lc.clone().add(v3(-0.025, 0.004, 0)), v3(0, lc.y + 0.006, lc.z + 0.004), rc.clone().add(v3(0.025, 0.004, 0))], [v3(0, 0, 1), v3(0, 0, 1), v3(0, 0, 1)], 0.0022, 0.0022, frame, H, 4);
  }
  const top = hair.topY;
  if (a.head === "headphones") {
    const pts = [];
    const ns = [];
    for (let i = 0; i <= 16; i++) {
      const t = (i / 16) * Math.PI;
      pts.push(v3(HC.x + Math.cos(t) * (hair.maxR + 0.008), HC.y + 0.01 + Math.sin(t) * (top - HC.y + 0.006), HC.z - 0.01));
      ns.push(v3(Math.cos(t), Math.sin(t), 0));
    }
    strip(cp, pts, ns, 0.012, 0.005, lin("#2b2b33"), H, 6);
    for (const s of [1, -1]) blob(cp, v3(HC.x + s * (hair.maxR + 0.01), HC.y + 0.005, HC.z - 0.01), [0.014, 0.034, 0.03], lin("#e0453d"), H, { lat: 6, lon: 12 });
  } else if (a.head === "cap") {
    const capc = lin("#2f5fa8");
    // crown of the cap: a dome over the hair, six panels, rim just above the brows
    const lat = 10;
    const lon = 30;
    const base0 = cp.n;
    const rim = clamp((hair.maxR + 0.004) / 0.1, 1.09, 1.15);
    for (let i = 0; i <= lat; i++) {
      const th = (i / lat) * 1.42;
      for (let k = 0; k < lon; k++) {
        const ph = (k / lon) * TAU;
        const d = v3(Math.sin(th) * Math.sin(ph), Math.cos(th), Math.sin(th) * Math.cos(ph));
        const p = S(d).multiplyScalar(rim).add(HC).add(v3(0, 0.006, -0.004));
        const seam = Math.abs(Math.sin(ph * 3)) < 0.06 && i > 0 && i < lat;
        cp.v(p, i === lat ? mulc(capc, 0.8) : seam ? mulc(capc, 0.82) : capc, H);
      }
    }
    for (let i = 0; i < lat; i++) {
      for (let k = 0; k < lon; k++) {
        const k1 = (k + 1) % lon;
        cp.t(base0 + i * lon + k, base0 + (i + 1) * lon + k, base0 + i * lon + k1);
        cp.t(base0 + i * lon + k1, base0 + (i + 1) * lon + k, base0 + (i + 1) * lon + k1);
      }
    }
    // inner band so you never see into the cap
    sphereGrid(cp, 6, 30, (d) => S(v3(d.x, d.y * 0.25 + 0.2, d.z).normalize()).multiplyScalar(rim * 0.985).add(HC).add(v3(0, 0.006, -0.004)), () => mulc(capc, 0.55), H, null);
    const brim = [];
    for (let k = 0; k <= 8; k++) {
      const u = k / 8;
      brim.push({ p: v3(HC.x, HC.y + 0.03 - u * 0.012, HC.z + 0.1 * rim - 0.006 + u * 0.075), t: v3(0, -0.15, 1).normalize(), n: v3(0, 1, 0), rx: 0.08 * Math.sqrt(1 - Math.pow(u, 2.2) * 0.75), rz: 0.0045, pw: 2.8, color: mulc(capc, 0.9), bw: H });
    }
    loft(cp, brim, 14);
  } else if (a.head === "crown") {
    const gold = lin("#e8c45a");
    const pts = [];
    const ns = [];
    for (let i = 0; i <= 20; i++) {
      const t = (i / 20) * TAU;
      pts.push(v3(HC.x + Math.cos(t) * 0.07, top - 0.02, HC.z - 0.01 + Math.sin(t) * 0.074));
      ns.push(v3(Math.cos(t), 0, Math.sin(t)));
    }
    strip(cp, pts, ns, 0.014, 0.004, gold, H, 6);
    for (let i = 0; i < 7; i++) {
      const t = (i / 7) * TAU;
      const p0 = v3(HC.x + Math.cos(t) * 0.07, top - 0.006, HC.z - 0.01 + Math.sin(t) * 0.074);
      loft(cp, [0, 0.5, 1].map((u) => ({ p: p0.clone().add(v3(0, u * 0.03, 0)), t: v3(0, 1, 0), n: v3(Math.cos(t), 0, Math.sin(t)), rx: Math.max(0.0008, 0.008 * (1 - u)), rz: Math.max(0.0008, 0.004 * (1 - u)), color: gold, bw: H })), 6);
      blob(cp, p0.clone().add(v3(0, 0.032, 0)), [0.004, 0.004, 0.004], lin(i % 2 ? "#e0453d" : "#4f8cff"), H, { lat: 3, lon: 5 });
    }
  }
  if (a.back === "backpack") {
    const pc = lin("#3a6fd1");
    const C = [[B.chest, 0.8], [B.spine, 0.2]];
    const rings = [];
    for (let k = 0; k <= 12; k++) {
      const u = k / 12;
      const y = lerp(1.04, 1.39, u);
      const pr = torsoProfile(y, P);
      const box = Math.pow(Math.sin(u * Math.PI), 0.18);
      rings.push({ p: v3(0, y, pr.zc - pr.rz - 0.065 * box - 0.016), t: v3(0, 1, 0), n: v3(0, 0, -1), rx: Math.max(0.004, 0.118 * P.w * box), rz: Math.max(0.004, 0.058 * box), pw: 5, color: k === 4 ? mulc(pc, 0.8) : pc, bw: C });
    }
    loft(cp, rings, 18);
    const pr = torsoProfile(1.12, P);
    loft(cp, [0, 0.15, 0.5, 0.85, 1].map((u) => {
      const b = Math.pow(Math.sin(u * Math.PI), 0.25);
      return { p: v3(0, lerp(1.06, 1.2, u), pr.zc - pr.rz - 0.13), t: v3(0, 1, 0), n: v3(0, 0, -1), rx: Math.max(0.003, 0.085 * P.w * b), rz: Math.max(0.003, 0.03 * b), pw: 4, color: mulc(pc, 0.85), bw: C };
    }), 14);
    strip(cp, [v3(-0.06 * P.w, 1.205, pr.zc - pr.rz - 0.158), v3(0.06 * P.w, 1.205, pr.zc - pr.rz - 0.158)], [v3(0, 0, -1), v3(0, 0, -1)], 0.0025, 0.002, lin("#d9dde2"), C, 4);
    for (const s of [1, -1]) {
      // back of the pack → over the top of the shoulder → down the front of the chest
      const ctrl = [
        torsoPoint(1.3, -Math.PI / 2 + s * 0.62, P, 0.03),
        torsoPoint(1.4, -Math.PI / 2 + s * 0.75, P, 0.022),
        v3(s * 0.115 * P.w, 1.447, -0.012),
        torsoPoint(1.4, Math.PI / 2 - s * 0.85, P, 0.02),
        torsoPoint(1.3, Math.PI / 2 - s * 0.78, P, fabricAt(G0, 1.3) + 0.003),
        torsoPoint(1.18, Math.PI / 2 - s * 0.82, P, fabricAt(G0, 1.18) + 0.003),
      ];
      const curve = new THREE.CatmullRomCurve3(ctrl);
      const pts = curve.getPoints(14);
      const ns = pts.map((p) => v3(p.x, p.y > 1.43 ? 0.3 : 0, p.z).normalize().add(v3(0, p.y > 1.43 ? 1 : 0, 0)).normalize());
      strip(cp, pts, ns, 0.011, 0.003, lin("#26334d"), C, 5);
    }
  }
  if (a.neck === "scarf") {
    const sc = lin("#d9573f");
    const pts = [];
    const ns = [];
    for (let k = 0; k <= 24; k++) {
      const t = (k / 24) * TAU;
      pts.push(torsoPoint(1.46, t, P, 0.018));
      ns.push(v3(Math.cos(t), 0.3, Math.sin(t)).normalize());
    }
    strip(cp, pts, ns, 0.024, 0.016, sc, [[B.chest, 0.6], [B.neck, 0.4]], 8);
    const tail = [];
    const tn = [];
    for (let k = 0; k <= 6; k++) {
      const y = lerp(1.45, 1.22, k / 6);
      tail.push(torsoPoint(y, Math.PI / 2 - 0.35, P, 0.02 + k * 0.001));
      tn.push(v3(0.2, 0, 1).normalize());
    }
    strip(cp, tail, tn, 0.025, 0.006, sc, C_CHEST, 6);
  }
  if (a.chest === "badge") {
    blob(cp, torsoPoint(1.3, Math.PI / 2 - 0.55, P, 0.016), [0.016, 0.016, 0.004], lin("#e8c45a"), C_CHEST, { rot: [0, -0.55, 0], lat: 5, lon: 12 });
    blob(cp, torsoPoint(1.3, Math.PI / 2 - 0.55, P, 0.02), [0.007, 0.007, 0.003], lin("#c4302b"), C_CHEST, { rot: [0, -0.55, 0], lat: 4, lon: 8 });
  }
}
const C_CHEST = [[B.chest, 1]];

/* =================================================================== materials & cache */
let MATS_INST = null;
function materials() {
  if (!MATS_INST) {
    MATS_INST = [
      new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.6, metalness: 0, sheen: 0.22, sheenColor: new THREE.Color("#ffc9b8"), sheenRoughness: 0.6 }),
      new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.82, metalness: 0, sheen: 0.25, sheenColor: new THREE.Color("#ffffff"), sheenRoughness: 0.8 }),
      new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.42, metalness: 0, sheen: 0.6, sheenColor: new THREE.Color("#fff3e0"), sheenRoughness: 0.35 }),
      new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.18, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.08 }),
    ];
  }
  return MATS_INST;
}
/** Kept for the world's dispose(): disposes the shared character materials. */
export function charMaterial() {
  return {
    dispose() {
      if (MATS_INST) MATS_INST.forEach((m) => m.dispose());
      MATS_INST = null;
    },
  };
}
const CACHE = new Map();
export function disposeCharacterCache() {
  for (const c of CACHE.values()) c.geo.dispose();
  CACHE.clear();
}
function design(look, lod = 0) {
  const key = `${lookKey(look)}|${lod}`;
  let c = CACHE.get(key);
  if (c) return c;
  Q = lod ? 0.5 : 1;
  const R = resolveLook(look);
  const F = faceParams(look, R);
  const P = { w: R.w };
  const L = layout(P);
  const Bd = new Builder();
  buildBody(Bd, P, R, F, L);
  const head = buildHead(Bd, P, R, F, L);
  const hair = buildHair(Bd, P, R, F, L, head.S, { cap: R.acc.head === "cap" });
  buildAccessories(Bd, P, R, F, L, head, hair);
  c = { geo: Bd.build(), F, L, R, head };
  Q = 1;
  CACHE.set(key, c);
  return c;
}

/* =================================================================== rig */
export function buildCharacter(look) {
  const D = design(look);
  const { L, F } = D;
  const HC = L.hc;
  const ef = D.head.eyeFace;
  const at = {
    [B.hips]: L.hips, [B.spine]: L.spine, [B.chest]: L.chest, [B.neck]: L.neck, [B.head]: L.head,
    [B.jaw]: HC.clone().add(v3(0, -0.035, -0.02)),
    [B.lidL]: ef.L.ec.clone(), [B.lidR]: ef.R.ec.clone(),
    [B.browL]: HC.clone().add(v3(0.03, 0.04, 0.09)), [B.browR]: HC.clone().add(v3(-0.03, 0.04, 0.09)),
    [B.mouthL]: HC.clone().add(v3(0.025, -0.055, 0.09)), [B.mouthR]: HC.clone().add(v3(-0.025, -0.055, 0.09)),
    [B.clavL]: L.clav(1), [B.armL]: L.arm(1), [B.foreL]: L.fore(1), [B.handL]: L.hand(1),
    [B.clavR]: L.clav(-1), [B.armR]: L.arm(-1), [B.foreR]: L.fore(-1), [B.handR]: L.hand(-1),
    [B.thighL]: L.thigh(1), [B.shinL]: L.shin(1), [B.footL]: L.foot(1),
    [B.thighR]: L.thigh(-1), [B.shinR]: L.shin(-1), [B.footR]: L.foot(-1),
    [B.tail]: HC.clone().add(v3(0, 0.03, -0.1)),
    [B.hairBack]: HC.clone().add(v3(0, -0.02, -0.06)),
  };
  const names = Object.keys(B);
  const bones = PARENT.map((_, i) => {
    const b = new THREE.Bone();
    b.name = names[i];
    return b;
  });
  PARENT.forEach((p, i) => {
    if (p < 0) bones[i].position.copy(at[i]);
    else {
      bones[i].position.copy(at[i]).sub(at[p]);
      bones[p].add(bones[i]);
    }
    bones[i].userData.rest = bones[i].position.clone();
  });
  const mesh = new THREE.SkinnedMesh(D.geo, materials());
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.add(bones[0]);
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.scale.setScalar(F.height);
  root.add(body);
  body.add(mesh);
  mesh.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton(bones));
  const g = (n) => bones[B[n]];
  return {
    root, body, mesh, bones,
    hips: g("hips"), torso: g("spine"), spine: g("spine"), chest: g("chest"), neck: g("neck"), head: g("head"),
    jaw: g("jaw"), lidL: g("lidL"), lidR: g("lidR"), browL: g("browL"), browR: g("browR"), mouthL: g("mouthL"), mouthR: g("mouthR"),
    clavL: g("clavL"), clavR: g("clavR"), armL: g("armL"), elbowL: g("foreL"), handL: g("handL"), armR: g("armR"), elbowR: g("foreR"), handR: g("handR"),
    legL: g("thighL"), kneeL: g("shinL"), footL: g("footL"), legR: g("thighR"), kneeR: g("shinR"), footR: g("footR"),
    tail: g("tail"), hairBack: g("hairBack"),
    scale: F.height,
    look: lookKey(look),
    cur: {},
    face: { blinkT: 1 + Math.random() * 3, blink: 0, talkPh: Math.random() * 10 },
    hipsY: L.hips.y,
    lod: 0,
    /** 0 = full detail, 1 = distant (lighter mesh, same skeleton). */
    setLOD(level) {
      if (level === this.lod) return;
      this.lod = level;
      mesh.geometry = design(look, level).geo;
    },
  };
}
export function disposeRig(rig) {
  rig.root.removeFromParent();
}

/* =================================================================== animation */
const J = [
  "hipsY", "hipsX", "hipsRX", "hipsRY", "hipsRZ", "spineRX", "spineRY", "spineRZ", "chestRX", "chestRY", "chestRZ", "headRX", "headRY", "headRZ",
  "clavLZ", "clavRZ", "armLX", "armLY", "armLZ", "armRX", "armRY", "armRZ", "elbowLX", "elbowRX", "handLX", "handLZ", "handRX", "handRZ",
  "legLX", "legLY", "legLZ", "legRX", "legRY", "legRZ", "kneeL", "kneeR", "footL", "footR", "bodyY", "smile", "jaw", "brow", "browTilt", "lid", "tail",
];
const HIP_Y = 0.93;
const T0 = Object.fromEntries(J.map((k) => [k, 0]));
T0.hipsY = HIP_Y;

/**
 * state: { pose, speed, phase, t, air, wave, interact, celebrate, shoot, kick, talking, raise,
 *          charging, power, seed, mood, listen, snap }
 * pose ∈ stand | idle | walk | sit | sitClass | sitRead | sitType | sitTalk | write | eat | talk | teach | type | shoot | kick | stretch
 */
export function animateRig(rig, s, dt) {
  const T = { ...T0 };
  const t = s.t || 0;
  const seed = s.seed || 0;
  const sp = s.speed || 0;
  const ph = s.phase || 0;
  const pose = s.pose || "stand";
  const sitting = pose.startsWith("sit") || pose === "eat" || pose === "write";
  // relaxed arms hang a little away from the body with soft elbows
  T.armLZ = 0.12;
  T.armRZ = -0.12;
  T.elbowLX = -0.16;
  T.elbowRX = -0.16;
  T.armLY = -0.1;
  T.armRY = 0.1;
  T.handLZ = 0.05;
  T.handRZ = -0.05;
  T.smile = 0.28;
  let talkAmt = s.talking ? 1 : 0;
  if (sitting) {
    Object.assign(T, { hipsY: 0.52, legLX: -1.5, legRX: -1.5, kneeL: 1.52, kneeR: 1.52, legLZ: 0.05, legRZ: -0.05, legLY: -0.05, legRY: 0.05, footL: -0.04, footR: -0.04 });
    Object.assign(T, { spineRX: 0.08, chestRX: 0.04, armLX: -0.5, armRX: -0.5, elbowLX: -0.85, elbowRX: -0.85, armLZ: 0.16, armRZ: -0.16, headRX: 0.06 });
    T.chestRX += Math.sin(t * 1.6 + seed) * 0.012;
    if (pose === "sitClass" || pose === "write") {
      T.spineRX = 0.14;
      T.headRX = s.listen ? -0.04 + Math.sin(t * 0.5 + seed) * 0.05 : 0.28;
      T.headRY = s.listen ? Math.sin(t * 0.33 + seed) * 0.12 : 0;
      T.armRX = -0.72;
      T.elbowRX = -1.0 + (s.listen ? 0 : Math.sin(t * 7 + seed) * 0.07);
      T.armRZ = -0.06 + (s.listen ? 0 : Math.sin(t * 9 + seed) * 0.04);
    } else if (pose === "sitRead") {
      Object.assign(T, { spineRX: 0.2, headRX: 0.38, armLX: -0.78, armRX: -0.78, elbowLX: -1.15, elbowRX: -1.15, handLX: -0.3, handRX: -0.3 });
    } else if (pose === "sitType") {
      Object.assign(T, { spineRX: 0.1, headRX: 0.08, handLX: 0.2, handRX: 0.2 });
      T.elbowLX = -1.05 + Math.sin(t * 13 + seed) * 0.05;
      T.elbowRX = -1.05 + Math.cos(t * 12 + seed) * 0.05;
    } else if (pose === "eat") {
      const c = Math.max(0, Math.sin(t * 1.6 + seed));
      T.armRX = -0.5 - c * 1.25;
      T.elbowRX = -0.85 - c * 1.15;
      T.armRZ = -0.1 + 0.25 * c;
      T.headRX = 0.06 + c * 0.06;
      T.jaw = c > 0.8 ? 0.08 * Math.abs(Math.sin(t * 9)) : 0;
      T.smile = 0.45;
    } else if (pose === "sitTalk") {
      talkAmt = Math.max(talkAmt, Math.sin(t * 0.4 + seed) > 0 ? 1 : 0);
      T.spineRX = -0.04;
      T.headRY = Math.sin(t * 0.7 + seed) * 0.35;
      T.armRX = -0.35 + Math.max(0, Math.sin(t * 2.2 + seed)) * -0.55;
      T.elbowRX = -0.95;
      T.smile = 0.5;
    }
    if (s.raise) Object.assign(T, { armRX: -2.85, armRZ: -0.12, elbowRX: -0.25, clavRZ: -0.15 });
  } else if (s.air) {
    Object.assign(T, { legLX: -0.7, legRX: 0.25, kneeL: 1.1, kneeR: 0.7, footL: 0.3, footR: 0.4, armLX: -0.5, armRX: 0.35, armLZ: 0.55, armRZ: -0.55, spineRX: 0.05 });
  } else if (sp > 0.15) {
    const run = sp > 3.6;
    const k = run ? 1 : Math.min(1, 0.45 + sp * 0.2);
    const amp = run ? 0.9 : 0.5 * k;
    const sw = Math.sin(ph);
    const cw = Math.cos(ph);
    T.legLX = -sw * amp;
    T.legRX = sw * amp;
    const swingL = Math.max(0, Math.sin(ph - 1.25));
    const swingR = Math.max(0, Math.sin(ph + Math.PI - 1.25));
    T.kneeL = swingL * (run ? 1.75 : 0.95) + 0.08 + (run ? 0.25 : 0);
    T.kneeR = swingR * (run ? 1.75 : 0.95) + 0.08 + (run ? 0.25 : 0);
    // heel strike → flat → toe-off
    T.footL = -0.2 * Math.max(0, sw) * k + 0.45 * Math.max(0, -sw) * Math.max(0, -cw) * k + swingL * 0.25;
    T.footR = -0.2 * Math.max(0, -sw) * k + 0.45 * Math.max(0, sw) * Math.max(0, cw) * k + swingR * 0.25;
    // pelvis rotation & sway, spine counter-rotation, natural arm swing
    T.hipsRY = sw * (run ? 0.16 : 0.11);
    T.hipsRZ = cw * (run ? 0.03 : 0.045);
    T.hipsX = cw * (run ? 0.008 : 0.016);
    T.spineRY = -sw * 0.08;
    T.chestRY = -sw * (run ? 0.18 : 0.1);
    T.armLX = sw * amp * (run ? 1.05 : 0.85);
    T.armRX = -sw * amp * (run ? 1.05 : 0.85);
    T.elbowLX = run ? -1.45 : -0.28 - Math.max(0, sw) * 0.35;
    T.elbowRX = run ? -1.45 : -0.28 - Math.max(0, -sw) * 0.35;
    T.armLZ = run ? 0.18 : 0.12;
    T.armRZ = run ? -0.18 : -0.12;
    T.spineRX = run ? 0.12 : 0.03;
    T.chestRX = run ? 0.1 : 0.02;
    T.hipsY = HIP_Y - Math.abs(cw) * (run ? 0.055 : 0.028) + (run ? 0.01 : 0.005);
    T.headRX = run ? -0.16 : -0.02;
    T.headRY = -(T.hipsRY + T.spineRY + T.chestRY) * 0.7;
    T.tail = -sw * 0.15 + (run ? 0.4 : 0.1);
  } else {
    // idle: breathing, weight shifting from leg to leg, looking around
    const br = Math.sin(t * 1.7 + seed);
    const shift = Math.sin(t * 0.32 + seed * 2);
    T.chestRX = br * 0.014;
    T.spineRX = 0.01;
    T.clavLZ = br * 0.015;
    T.clavRZ = -br * 0.015;
    T.hipsX = shift * 0.02;
    T.hipsRZ = -shift * 0.035;
    T.legLZ = shift * 0.035;
    T.legRZ = shift * 0.035;
    T.kneeL = shift > 0 ? 0.04 : 0.14 * -shift;
    T.kneeR = shift < 0 ? 0.04 : 0.14 * shift;
    T.legLX = shift < 0 ? -0.06 * -shift : 0;
    T.legRX = shift > 0 ? -0.06 * shift : 0;
    T.spineRZ = shift * 0.02;
    T.headRY = Math.sin(t * 0.37 + seed * 3) * 0.24 + Math.sin(t * 0.13 + seed) * 0.15;
    T.headRX = Math.sin(t * 0.29 + seed) * 0.05;
    T.headRZ = shift * 0.035;
    T.armLZ = 0.13 + br * 0.012;
    T.armRZ = -0.13 - br * 0.012;
    if (pose === "talk") {
      talkAmt = 1;
      const g = Math.sin(t * 2.4 + seed);
      const g2 = Math.sin(t * 1.7 + seed * 2);
      Object.assign(T, { armRX: -0.45 - Math.max(0, g) * 0.5, elbowRX: -1.0, armRZ: -0.2, handRZ: -0.3 * g, armLX: -0.2 - Math.max(0, g2) * 0.35, elbowLX: -0.6 - Math.max(0, -g) * 0.5, smile: 0.55 });
      T.headRX = Math.sin(t * 3.1 + seed) * 0.07;
      T.headRY = Math.sin(t * 0.8 + seed) * 0.35;
    } else if (pose === "teach") {
      talkAmt = Math.max(talkAmt, 0.7);
      const g = Math.sin(t * 1.3 + seed);
      Object.assign(T, { armRX: -1.1 - g * 0.4, armRZ: -0.3, elbowRX: -0.35, armLX: -0.3, elbowLX: -1.05, chestRY: 0.15 * g });
      T.headRY = Math.sin(t * 0.6 + seed) * 0.45;
    } else if (pose === "type" || pose === "write") {
      Object.assign(T, { armLX: -0.78, armRX: -0.78, headRX: 0.28, spineRX: 0.09 });
      T.elbowLX = -0.9 + Math.sin(t * 11 + seed) * 0.05;
      T.elbowRX = -0.9 + Math.cos(t * 10 + seed) * 0.05;
    } else if (pose === "shoot") {
      const c = (t * 0.55 + seed) % 2.2;
      if (c < 0.5) Object.assign(T, { armLX: -2.6, armRX: -2.7, elbowLX: -0.9 * (1 - c * 2), elbowRX: -0.9 * (1 - c * 2), hipsY: HIP_Y + Math.sin(c * Math.PI * 2) * 0.12 });
      else Object.assign(T, { armRX: -0.6 - Math.abs(Math.sin(t * 6 + seed)) * 0.4, elbowRX: -0.6, hipsY: HIP_Y - 0.03, kneeL: 0.28, kneeR: 0.28, legLX: -0.14, legRX: -0.14, footL: -0.14, footR: -0.14 });
    } else if (pose === "kick") {
      const c = (t * 0.6 + seed) % 2;
      if (c < 0.4) Object.assign(T, { legRX: -1.2 * Math.sin((c / 0.4) * Math.PI), armLX: 0.4, armLZ: 0.5 });
      else T.legLX = Math.sin(t * 4 + seed) * 0.1;
    } else if (pose === "stretch") {
      const c = Math.sin(t * 1.2 + seed);
      Object.assign(T, { armLX: -2.8, armRX: -2.8, spineRZ: c * 0.2, chestRZ: c * 0.1 });
    }
  }
  // gesture overlays
  if (s.interact > 0) {
    const k = Math.min(1, s.interact * 3);
    T.armRX = -1.25 * k + T.armRX * (1 - k);
    T.elbowRX = -0.25 * k + T.elbowRX * (1 - k);
    T.handRX = -0.3 * k;
  }
  if (s.wave > 0 && !sitting) {
    Object.assign(T, { armRX: -0.25, armRZ: -2.5, clavRZ: -0.18, headRZ: 0.08, smile: 1 });
    T.elbowRX = -0.55 + Math.sin(t * 13) * 0.35;
    T.handRZ = Math.sin(t * 13) * 0.35;
  } else if (s.wave > 0 && sitting) Object.assign(T, { armRX: -2.85, elbowRX: -0.3, clavRZ: -0.15 });
  if (s.shoot > 0) {
    const k = s.shoot / 0.6;
    Object.assign(T, { armLX: -2.6, armRX: -2.8, elbowLX: -0.4 * k, elbowRX: -0.6 * k, handRX: -0.8 * (1 - k) });
  } else if (s.charging) {
    const p = s.power || 0;
    Object.assign(T, { armLX: -1.5, armRX: -1.6, elbowLX: -1.6, elbowRX: -1.7, kneeL: 0.35 * p, kneeR: 0.35 * p, legLX: -0.18 * p, legRX: -0.18 * p, footL: -0.17 * p, footR: -0.17 * p, hipsY: HIP_Y - 0.08 * p });
  }
  if (s.kick > 0) {
    const k = Math.sin((1 - s.kick / 0.6) * Math.PI);
    Object.assign(T, { legRX: -1.4 * k + 0.5 * (1 - k), kneeR: 0.35, footR: 0.3, armLZ: 0.6, armRZ: -0.5, spineRX: -0.15 * k });
  }
  // expressions
  let surprised = 0;
  if (s.mood === "worried") surprised = 1;
  if (s.mood === "love" || s.mood === "happy") T.smile = 0.95;
  if (s.mood === "sad" || s.mood === "annoyed") {
    T.smile = -0.5;
    T.browTilt = s.mood === "sad" ? 1 : -1;
    if (s.mood === "sad") T.headRX += 0.2;
  }
  if (s.celebrate > 0) {
    const b = Math.abs(Math.sin(t * 9));
    Object.assign(T, { armLX: -2.8, armRX: -2.8, armLZ: 0.4, armRZ: -0.4, clavLZ: 0.15, clavRZ: -0.15, headRX: -0.22, smile: 1, jaw: 0.2, brow: 0.5 });
    T.elbowLX = -0.25 - b * 0.4;
    T.elbowRX = -0.25 - (1 - b) * 0.4;
    T.bodyY = sitting ? 0 : b * 0.16;
    if (!sitting) {
      T.kneeL = b * 0.3;
      T.kneeR = b * 0.3;
    }
  }
  if (surprised) Object.assign(T, { brow: 1, jaw: 0.16, smile: 0 });
  // talking: the jaw flaps with a little rhythm and the brows follow the speech
  const FA = rig.face;
  FA.talkPh += dt * (8 + Math.sin(t * 1.7) * 2);
  if (talkAmt > 0 && !(s.celebrate > 0)) {
    T.jaw = Math.max(T.jaw, talkAmt * (0.05 + 0.1 * Math.abs(Math.sin(FA.talkPh)) * (0.6 + 0.4 * Math.sin(FA.talkPh * 0.37))));
    T.brow += 0.25 * Math.max(0, Math.sin(FA.talkPh * 0.23));
  }
  // blinking
  FA.blinkT -= dt;
  if (FA.blinkT <= 0) {
    FA.blinkT = 2 + Math.random() * 3.5;
    FA.blink = 0.16;
  }
  FA.blink = Math.max(0, FA.blink - dt);
  const blinkAmt = FA.blink > 0 ? Math.sin((1 - FA.blink / 0.16) * Math.PI) : 0;
  T.lid = Math.max(blinkAmt * 1.15, T.smile > 0.8 ? 0.3 : 0) - surprised * 0.22;
  // smooth toward the target pose (face channels react faster)
  const C = rig.cur;
  const k = Math.min(1, dt * (s.snap ? 60 : 10));
  const kf = Math.min(1, dt * 22);
  for (const key of J) {
    const v = C[key] ?? T[key];
    C[key] = v + (T[key] - v) * (key === "lid" || key === "jaw" ? kf : k);
  }
  rig.hips.position.set(C.hipsX, C.hipsY, 0);
  rig.hips.rotation.set(C.hipsRX, C.hipsRY, C.hipsRZ);
  rig.spine.rotation.set(C.spineRX, C.spineRY, C.spineRZ);
  rig.chest.rotation.set(C.chestRX, C.chestRY, C.chestRZ);
  rig.neck.rotation.set(C.headRX * 0.35, C.headRY * 0.35, 0);
  rig.head.rotation.set(C.headRX * 0.65, C.headRY * 0.65, C.headRZ);
  rig.clavL.rotation.z = C.clavLZ;
  rig.clavR.rotation.z = C.clavRZ;
  rig.armL.rotation.set(C.armLX, C.armLY, C.armLZ);
  rig.armR.rotation.set(C.armRX, C.armRY, C.armRZ);
  rig.elbowL.rotation.x = C.elbowLX;
  rig.elbowR.rotation.x = C.elbowRX;
  rig.handL.rotation.set(C.handLX, 0, C.handLZ);
  rig.handR.rotation.set(C.handRX, 0, C.handRZ);
  rig.legL.rotation.set(C.legLX, C.legLY, C.legLZ);
  rig.legR.rotation.set(C.legRX, C.legRY, C.legRZ);
  rig.kneeL.rotation.x = C.kneeL;
  rig.kneeR.rotation.x = C.kneeR;
  rig.footL.rotation.x = C.footL;
  rig.footR.rotation.x = C.footR;
  rig.body.position.y = C.bodyY;
  rig.jaw.rotation.x = C.jaw;
  rig.lidL.rotation.x = C.lid;
  rig.lidR.rotation.x = C.lid;
  const by = C.brow * 0.007;
  rig.browL.position.y = rig.browL.userData.rest.y + by;
  rig.browR.position.y = rig.browR.userData.rest.y + by;
  rig.browL.rotation.z = C.browTilt * 0.12;
  rig.browR.rotation.z = -C.browTilt * 0.12;
  const sm = C.smile;
  const restL = rig.mouthL.userData.rest;
  const restR = rig.mouthR.userData.rest;
  rig.mouthL.position.set(restL.x + Math.max(0, sm) * 0.0035, restL.y + sm * 0.0055, restL.z - Math.max(0, sm) * 0.002);
  rig.mouthR.position.set(restR.x - Math.max(0, sm) * 0.0035, restR.y + sm * 0.0055, restR.z - Math.max(0, sm) * 0.002);
  rig.tail.rotation.x = C.tail + Math.sin(t * 1.3 + seed) * 0.03;
  rig.hairBack.rotation.x = C.tail * 0.4;
}
