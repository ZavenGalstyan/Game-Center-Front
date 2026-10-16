/**
 * Wild Kingdom 3D — procedural low-poly animals (no asset files).
 *
 * Each species is a rig: a small bone hierarchy plus primitive parts glued to
 * the bones (rigid skinning). All parts are merged into ONE SkinnedMesh per
 * animal with vertex colours, so an animal is a single draw call. Tiger and
 * zebra stripes come from a tiny shader patch keyed by a per-vertex pattern id.
 *
 * Models face +Z with their feet at y = 0. `pose(inst, s, dt)` animates the
 * bones procedurally from simulation channels (speed, gait phase, attack,
 * eat, lie, death, flight…) with smoothing, so states blend instead of snap.
 */
import * as THREE from "three";

/* ------------------------------------------------------------------ geometry kit */
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();
const UPV = new THREE.Vector3(0, 1, 0);

function xform(g, at = [0, 0, 0], rot = null, scl = null) {
  const e = rot ? new THREE.Euler(rot[0], rot[1], rot[2]) : null;
  _q.identity();
  if (e) _q.setFromEuler(e);
  _s.set(1, 1, 1);
  if (scl) _s.set(scl[0], scl[1], scl[2]);
  _m.compose(_v.set(at[0], at[1], at[2]), _q, _s);
  g.applyMatrix4(_m);
  return g;
}
const G = {
  ell: (rx, ry, rz, at, rot, seg = [10, 7]) => xform(new THREE.SphereGeometry(1, seg[0], seg[1]), at, rot, [rx, ry, rz]),
  box: (w, h, d, at, rot) => xform(new THREE.BoxGeometry(w, h, d), at, rot),
  cone: (r, len, at, rot, seg = 6) => xform(new THREE.ConeGeometry(r, len, seg).translate(0, len / 2, 0), at, rot),
  /** Tapered cylinder between two points. */
  seg(a, b, r1, r2, n = 6) {
    const A = new THREE.Vector3(...a);
    const B = new THREE.Vector3(...b);
    const d = B.clone().sub(A);
    const len = d.length();
    const g = new THREE.CylinderGeometry(r2, r1, len, n).translate(0, len / 2, 0);
    _q.setFromUnitVectors(UPV, d.normalize());
    _m.compose(A, _q, _s.set(1, 1, 1));
    return g.applyMatrix4(_m);
  },
  /** Leg piece hanging straight down from the joint. */
  limb: (r1, r2, len, x = 0, z = 0, n = 6) => new THREE.CylinderGeometry(r1, r2, len, n).translate(x, -len / 2, z),
};

/* ------------------------------------------------------------------ rig builder */
class RigDef {
  constructor(name) {
    this.name = name;
    this.bones = []; // {name, parent, pos}
    this.parts = []; // {bone, geo, color, pat}
    this.idx = {};
  }
  bone(name, parent, pos) {
    this.idx[name] = this.bones.length;
    this.bones.push({ name, parent: parent == null ? -1 : this.idx[parent], pos });
    return this;
  }
  part(bone, geo, color, pat = 0) {
    this.parts.push({ bone: this.idx[bone], geo, color: new THREE.Color(color), pat });
    return this;
  }
  /** Bind-pose world position of a bone. */
  world(i) {
    const out = [0, 0, 0];
    while (i >= 0) {
      const b = this.bones[i];
      out[0] += b.pos[0];
      out[1] += b.pos[1];
      out[2] += b.pos[2];
      i = b.parent;
    }
    return out;
  }
  build() {
    let count = 0;
    const geos = this.parts.map((p) => {
      // smooth normals on the indexed primitive, then unshare (keeps the soft look)
      if (p.geo.index) p.geo.computeVertexNormals();
      const g = p.geo.index ? p.geo.toNonIndexed() : p.geo;
      if (g !== p.geo) p.geo.dispose();
      const w = this.world(p.bone);
      g.translate(w[0], w[1], w[2]);
      if (!g.attributes.normal) g.computeVertexNormals();
      count += g.attributes.position.count;
      return g;
    });
    const pos = new Float32Array(count * 3);
    const nrm = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const si = new Uint16Array(count * 4);
    const sw = new Float32Array(count * 4);
    const pat = new Float32Array(count);
    let o = 0;
    geos.forEach((g, k) => {
      const P = this.parts[k];
      const n = g.attributes.position.count;
      pos.set(g.attributes.position.array, o * 3);
      nrm.set(g.attributes.normal.array, o * 3);
      for (let i = 0; i < n; i++) {
        const j = o + i;
        // a touch of per-face shade variation so flat colours don't look plastic
        const v = 0.97 + (((Math.floor(i / 3) * 2654435761) >>> 0) % 1000) / 1000 * 0.05;
        col[j * 3] = P.color.r * v;
        col[j * 3 + 1] = P.color.g * v;
        col[j * 3 + 2] = P.color.b * v;
        si[j * 4] = P.bone;
        sw[j * 4] = 1;
        pat[j] = P.pat;
      }
      o += n;
      g.dispose();
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("normal", new THREE.BufferAttribute(nrm, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    geo.setAttribute("skinIndex", new THREE.BufferAttribute(si, 4));
    geo.setAttribute("skinWeight", new THREE.BufferAttribute(sw, 4));
    geo.setAttribute("aPat", new THREE.BufferAttribute(pat, 1));
    geo.computeBoundingSphere();
    geo.boundingSphere.radius *= 1.6; // poses reach further than the bind pose
    const inverses = this.bones.map((b, i) => {
      const w = this.world(i);
      return new THREE.Matrix4().makeTranslation(-w[0], -w[1], -w[2]);
    });
    return { name: this.name, geo, bones: this.bones, idx: this.idx, inverses };
  }
}

/* ------------------------------------------------------------------ material */
/** One shared material: vertex colours + procedural stripes (aPat 1/2 tiger, 3/4 zebra). */
export function createAnimalMaterial() {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0 });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float aPat;\nvarying float vPat;\nvarying vec3 vBind;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvPat = aPat;\nvBind = position;");
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying float vPat;\nvarying vec3 vBind;")
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
if (vPat > 0.5) {
  vec3 q = vBind;
  float s = 0.0;
  if (vPat < 1.5) s = sin(q.z * 11.0 + sin(q.y * 9.0) * 1.3 + sin(q.x * 7.0) * 0.6);
  else if (vPat < 2.5) s = sin(q.y * 16.0 + q.z * 4.0);
  else if (vPat < 3.5) s = sin(q.z * 19.0 + sin(q.y * 7.0) * 1.6);
  else s = sin(q.y * 24.0);
  float band = smoothstep(0.35, 0.6, s);
  vec3 dark = vPat < 2.5 ? vec3(0.06, 0.04, 0.03) : vec3(0.05, 0.05, 0.06);
  diffuseColor.rgb = mix(diffuseColor.rgb, dark, band * (vPat < 2.5 ? 0.92 : 1.0));
}`,
      );
  };
  m.customProgramCacheKey = () => "wk-animal-v1";
  return m;
}

/* ------------------------------------------------------------------ quadruped template */
/**
 * Generic four-legged rig. cfg (metres):
 *  hip, chest: joint heights; len: hip→chest distance; legR, legR2: leg radii;
 *  neck: [up, fwd], head: [up, fwd]; tail: [count, segLen, droop].
 * `dress(rig, cfg)` adds the species-specific parts.
 */
function quad(name, cfg, dress) {
  const r = new RigDef(name);
  const { hip, chest, len } = cfg;
  r.bone("root", null, [0, 0, 0]);
  r.bone("hips", "root", [0, hip, -len * 0.45]);
  r.bone("chest", "hips", [0, chest - hip, len]);
  r.bone("neck", "chest", [0, cfg.neck[0], cfg.neck[1]]);
  r.bone("head", "neck", [0, cfg.head[0], cfg.head[1]]);
  r.bone("jaw", "head", [0, -cfg.jaw[0], cfg.jaw[1]]);
  const [tn, tl, droop] = cfg.tail;
  let prev = "hips";
  for (let i = 0; i < tn; i++) {
    r.bone(`tail${i}`, prev, i === 0 ? [0, cfg.tailY ?? 0.05, -cfg.tailBack] : [0, -tl * droop, -tl * (1 - droop * 0.5)]);
    prev = `tail${i}`;
  }
  const lx = cfg.legX;
  const up = cfg.upper;
  const lo = cfg.lower;
  for (const [s, side] of [["L", 1], ["R", -1]]) {
    r.bone(`f${s}`, "chest", [side * lx, -cfg.shoulderDrop, cfg.frontZ ?? 0]);
    r.bone(`f${s}2`, `f${s}`, [0, -up[0], 0]);
    r.bone(`f${s}3`, `f${s}2`, [0, -(chest - cfg.shoulderDrop - up[0]), 0]);
    r.bone(`b${s}`, "hips", [side * lx, -cfg.hipDrop, cfg.backZ ?? 0]);
    r.bone(`b${s}2`, `b${s}`, [0, -up[1], 0]);
    r.bone(`b${s}3`, `b${s}2`, [0, -(hip - cfg.hipDrop - up[1]), 0]);
  }
  r.cfg = cfg;
  dress(r, cfg);
  const t = r.build();
  t.kind = "quad";
  t.cfg = cfg;
  t.tailN = tn;
  return t;
}
/** Standard legs: upper, lower, paw/hoof per leg. */
function legs(r, cfg, colUp, colLow, colFoot, o = {}) {
  const { chest, hip } = cfg;
  const up = cfg.upper;
  const rU = cfg.legR;
  const rL = cfg.legR2;
  for (const s of ["L", "R"]) {
    const fLow = chest - cfg.shoulderDrop - up[0];
    const bLow = hip - cfg.hipDrop - up[1];
    r.part(`f${s}`, G.limb(rU * 1.25, rU, up[0] + rU * 0.5), colUp, o.patU || 0);
    r.part(`f${s}2`, G.limb(rU * 0.95, rL, fLow), colLow, o.patL || 0);
    r.part(`b${s}`, G.ell(rU * 1.6, up[1] * 0.62, rU * 2.1, [0, -up[1] * 0.38, -rU * 0.3]), colUp, o.patU || 0);
    r.part(`b${s}2`, G.limb(rU * 0.9, rL, bLow), colLow, o.patL || 0);
    if (o.hoof) {
      r.part(`f${s}3`, G.limb(rL * 1.15, rL * 1.35, rL * 2.2), colFoot);
      r.part(`b${s}3`, G.limb(rL * 1.15, rL * 1.35, rL * 2.2), colFoot);
    } else {
      r.part(`f${s}3`, G.ell(rL * 1.5, rL * 0.9, rL * 2.1, [0, -rL * 0.2, rL * 0.8]), colFoot);
      r.part(`b${s}3`, G.ell(rL * 1.5, rL * 0.9, rL * 2.1, [0, -rL * 0.2, rL * 0.8]), colFoot);
    }
  }
}
function eyes(r, x, y, z, s, col = 0x15110c) {
  r.part("head", G.ell(s, s, s * 0.8, [x, y, z], null, [6, 5]), col);
  r.part("head", G.ell(s, s, s * 0.8, [-x, y, z], null, [6, 5]), col);
}

/* ------------------------------------------------------------------ species */
function makeWolf(name = "wolf", fur = 0x8b9098, light = 0xdad6cc, dark = 0x4b4f55) {
  const cfg = { hip: 0.6, chest: 0.66, len: 0.72, neck: [0.1, 0.16], head: [0.17, 0.14], jaw: [0.06, 0.06], tail: [3, 0.16, 0.45], tailBack: 0.2, legX: 0.11, upper: [0.24, 0.26], legR: 0.042, legR2: 0.03, shoulderDrop: 0.08, hipDrop: 0.06 };
  return quad(name, cfg, (r) => {
    r.part("chest", G.ell(0.17, 0.22, 0.3, [0, 0.0, -0.02]), fur);
    r.part("chest", G.ell(0.14, 0.13, 0.22, [0, -0.1, 0.02]), light); // chest ruff
    r.part("chest", G.ell(0.15, 0.08, 0.24, [0, 0.15, -0.08]), dark); // saddle
    r.part("hips", G.ell(0.15, 0.18, 0.3, [0, 0.0, 0.05]), fur);
    r.part("hips", G.ell(0.15, 0.185, 0.42, [0, 0.03, 0.36]), fur);
    r.part("hips", G.ell(0.12, 0.08, 0.26, [0, 0.13, 0.08]), dark);
    r.part("neck", G.seg([0, -0.06, -0.04], [0, 0.12, 0.08], 0.13, 0.1, 7), fur);
    r.part("neck", G.ell(0.12, 0.12, 0.1, [0, -0.02, 0.02]), light);
    // head: skull, muzzle, nose, ears, cheeks
    r.part("head", G.ell(0.11, 0.1, 0.13, [0, 0.02, 0]), fur);
    r.part("head", G.ell(0.11, 0.07, 0.09, [0, -0.04, 0.02]), light);
    r.part("head", G.seg([0, 0.0, 0.07], [0, -0.02, 0.24], 0.065, 0.04, 6), fur);
    r.part("head", G.ell(0.025, 0.022, 0.025, [0, 0.0, 0.245]), 0x161210);
    r.part("head", G.cone(0.045, 0.12, [0.065, 0.08, -0.02], [-0.15, 0, -0.3], 4), fur);
    r.part("head", G.cone(0.045, 0.12, [-0.065, 0.08, -0.02], [-0.15, 0, 0.3], 4), fur);
    r.part("head", G.cone(0.025, 0.07, [0.067, 0.085, 0.0], [-0.15, 0, -0.3], 4), 0x3a2e2a);
    r.part("head", G.cone(0.025, 0.07, [-0.067, 0.085, 0.0], [-0.15, 0, 0.3], 4), 0x3a2e2a);
    eyes(r, 0.05, 0.035, 0.1, 0.015, 0xd6a12a);
    r.part("jaw", G.seg([0, 0, -0.02], [0, -0.01, 0.15], 0.045, 0.03, 6), light);
    // bushy tail
    r.part("tail0", G.ell(0.06, 0.06, 0.12, [0, -0.02, -0.08], [0.4, 0, 0]), fur);
    r.part("tail1", G.ell(0.075, 0.075, 0.13, [0, -0.03, -0.08], [0.5, 0, 0]), fur);
    r.part("tail2", G.ell(0.06, 0.06, 0.12, [0, -0.04, -0.07], [0.6, 0, 0]), dark);
    legs(r, r.cfg, fur, light, 0x6a6460);
  });
}
function makeLion(name = "lion", mane = true) {
  const coat = 0xc89650;
  const pale = 0xe8cf9c;
  const cfg = { hip: 0.82, chest: 0.9, len: 1.05, neck: [0.14, 0.2], head: [0.12, 0.22], jaw: [0.09, 0.08], tail: [4, 0.2, 0.55], tailBack: 0.32, legX: 0.16, upper: [0.32, 0.36], legR: 0.075, legR2: 0.05, shoulderDrop: 0.1, hipDrop: 0.08 };
  return quad(name, cfg, (r) => {
    r.part("chest", G.ell(0.27, 0.33, 0.42, [0, 0, -0.02]), coat);
    r.part("chest", G.ell(0.22, 0.14, 0.3, [0, -0.17, 0]), pale);
    r.part("hips", G.ell(0.24, 0.28, 0.42, [0, 0.0, 0.06]), coat);
    r.part("hips", G.ell(0.245, 0.3, 0.6, [0, 0.03, 0.52]), coat);
    r.part("neck", G.seg([0, -0.1, -0.06], [0, 0.12, 0.14], 0.2, 0.15, 7), coat);
    r.part("head", G.ell(0.16, 0.15, 0.17, [0, 0.0, 0]), coat);
    r.part("head", G.ell(0.12, 0.09, 0.13, [0, -0.06, 0.12]), pale);
    r.part("head", G.ell(0.05, 0.035, 0.03, [0, 0.0, 0.26]), 0x3a2622);
    r.part("head", G.ell(0.05, 0.05, 0.03, [0.11, 0.12, -0.02]), coat);
    r.part("head", G.ell(0.05, 0.05, 0.03, [-0.11, 0.12, -0.02]), coat);
    eyes(r, 0.075, 0.04, 0.13, 0.018, 0xc78a1c);
    r.part("jaw", G.ell(0.09, 0.04, 0.1, [0, -0.01, 0.06]), pale);
    if (mane) {
      const mc = [0x7a4a22, 0x8e5a2a, 0x5e3618];
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2;
        const rr = 0.2;
        r.part("head", G.ell(0.13, 0.13, 0.12, [Math.cos(a) * rr, Math.sin(a) * rr - 0.02, -0.08], null, [6, 5]), mc[i % 3]);
      }
      r.part("neck", G.ell(0.27, 0.3, 0.26, [0, 0.0, 0.02], null, [8, 6]), 0x6e4220);
      r.part("chest", G.ell(0.22, 0.2, 0.2, [0, -0.1, 0.3], null, [7, 5]), 0x7a4a22);
    }
    for (let i = 0; i < 4; i++) r.part(`tail${i}`, G.seg([0, 0, 0], [0, -0.2 * 0.55, -0.2 * 0.72], 0.03, 0.025, 5), coat);
    r.part("tail3", G.ell(0.05, 0.05, 0.08, [0, -0.12, -0.16]), 0x4a2a14);
    legs(r, r.cfg, coat, coat, pale);
  });
}
function makeTiger() {
  const coat = 0xe2772a;
  const white = 0xf1ebe0;
  const cfg = { hip: 0.78, chest: 0.84, len: 1.15, neck: [0.12, 0.2], head: [0.1, 0.22], jaw: [0.08, 0.08], tail: [5, 0.2, 0.4], tailBack: 0.3, legX: 0.16, upper: [0.3, 0.34], legR: 0.075, legR2: 0.052, shoulderDrop: 0.1, hipDrop: 0.08 };
  return quad("tiger", cfg, (r) => {
    r.part("chest", G.ell(0.26, 0.3, 0.44, [0, 0, -0.02]), coat, 1);
    r.part("chest", G.ell(0.2, 0.12, 0.32, [0, -0.17, 0]), white);
    r.part("hips", G.ell(0.24, 0.27, 0.44, [0, 0, 0.06]), coat, 1);
    r.part("hips", G.ell(0.245, 0.285, 0.62, [0, 0.03, 0.57]), coat, 1);
    r.part("hips", G.ell(0.18, 0.11, 0.32, [0, -0.16, 0.06]), white);
    r.part("neck", G.seg([0, -0.1, -0.06], [0, 0.1, 0.14], 0.19, 0.15, 7), coat, 1);
    r.part("head", G.ell(0.16, 0.145, 0.16, [0, 0, 0]), coat, 1);
    r.part("head", G.ell(0.15, 0.08, 0.1, [0, -0.06, 0.06]), white); // cheeks
    r.part("head", G.ell(0.1, 0.075, 0.12, [0, -0.05, 0.13]), white);
    r.part("head", G.ell(0.045, 0.03, 0.03, [0, -0.01, 0.25]), 0xc06a6a);
    r.part("head", G.ell(0.05, 0.05, 0.025, [0.11, 0.12, -0.03]), 0x2a1a12);
    r.part("head", G.ell(0.05, 0.05, 0.025, [-0.11, 0.12, -0.03]), 0x2a1a12);
    r.part("head", G.ell(0.025, 0.025, 0.012, [0.11, 0.12, -0.012]), white);
    r.part("head", G.ell(0.025, 0.025, 0.012, [-0.11, 0.12, -0.012]), white);
    eyes(r, 0.075, 0.04, 0.12, 0.018, 0xc9b032);
    r.part("jaw", G.ell(0.085, 0.035, 0.09, [0, -0.01, 0.06]), white);
    for (let i = 0; i < 5; i++) r.part(`tail${i}`, G.seg([0, 0, 0], [0, -0.2 * 0.4, -0.2 * 0.8], 0.035, 0.03, 5), i === 4 ? 0x1a120c : coat, i < 4 ? 1 : 0);
    legs(r, r.cfg, coat, coat, white, { patU: 2, patL: 2 });
  });
}
function makeBear() {
  const fur = 0x6b4527;
  const dark = 0x4a2e19;
  const muz = 0xa9825a;
  const cfg = { hip: 0.82, chest: 0.92, len: 0.95, neck: [0.12, 0.22], head: [0.0, 0.22], jaw: [0.1, 0.1], tail: [1, 0.08, 0.3], tailBack: 0.42, legX: 0.22, upper: [0.32, 0.34], legR: 0.11, legR2: 0.085, shoulderDrop: 0.12, hipDrop: 0.08 };
  return quad("bear", cfg, (r) => {
    r.part("chest", G.ell(0.38, 0.44, 0.48, [0, 0.0, 0]), fur);
    r.part("chest", G.ell(0.28, 0.2, 0.3, [0, 0.33, -0.1]), dark); // shoulder hump
    r.part("hips", G.ell(0.36, 0.4, 0.46, [0, 0.0, 0.08]), fur);
    r.part("hips", G.ell(0.37, 0.43, 0.55, [0, 0.04, 0.48]), fur);
    r.part("neck", G.seg([0, -0.12, -0.08], [0, 0.06, 0.16], 0.27, 0.2, 7), fur);
    r.part("head", G.ell(0.2, 0.19, 0.2, [0, 0.02, 0]), fur);
    r.part("head", G.seg([0, -0.04, 0.12], [0, -0.06, 0.32], 0.1, 0.075, 7), muz);
    r.part("head", G.ell(0.05, 0.04, 0.035, [0, -0.04, 0.33]), 0x1a110c);
    r.part("head", G.ell(0.06, 0.06, 0.035, [0.15, 0.17, -0.03]), dark);
    r.part("head", G.ell(0.06, 0.06, 0.035, [-0.15, 0.17, -0.03]), dark);
    eyes(r, 0.09, 0.06, 0.15, 0.018);
    r.part("jaw", G.seg([0, 0, 0.0], [0, -0.01, 0.18], 0.07, 0.05, 6), muz);
    r.part("tail0", G.ell(0.07, 0.07, 0.07, [0, 0, -0.03]), fur);
    legs(r, r.cfg, fur, fur, dark);
    // claws
    for (const s of ["L", "R"]) r.part(`f${s}3`, G.box(0.16, 0.03, 0.06, [0, -0.06, 0.16]), 0xd8d0c0);
  });
}
function makeFox() {
  const coat = 0xd9622a;
  const white = 0xf5efe6;
  const black = 0x241a16;
  const cfg = { hip: 0.3, chest: 0.33, len: 0.4, neck: [0.06, 0.08], head: [0.08, 0.08], jaw: [0.035, 0.04], tail: [4, 0.12, 0.35], tailBack: 0.12, legX: 0.06, upper: [0.12, 0.13], legR: 0.024, legR2: 0.017, shoulderDrop: 0.05, hipDrop: 0.04 };
  return quad("fox", cfg, (r) => {
    r.part("chest", G.ell(0.09, 0.11, 0.17, [0, 0, 0]), coat);
    r.part("chest", G.ell(0.07, 0.07, 0.12, [0, -0.05, 0.05]), white);
    r.part("hips", G.ell(0.085, 0.1, 0.17, [0, 0, 0.03]), coat);
    r.part("hips", G.ell(0.087, 0.105, 0.24, [0, 0.01, 0.2]), coat);
    r.part("neck", G.seg([0, -0.03, -0.02], [0, 0.06, 0.05], 0.065, 0.05, 6), coat);
    r.part("neck", G.ell(0.055, 0.06, 0.05, [0, -0.01, 0.03]), white);
    r.part("head", G.ell(0.065, 0.06, 0.07, [0, 0.0, 0]), coat);
    r.part("head", G.ell(0.06, 0.035, 0.05, [0, -0.025, 0.02]), white);
    r.part("head", G.seg([0, -0.005, 0.04], [0, -0.015, 0.15], 0.035, 0.017, 6), coat);
    r.part("head", G.ell(0.013, 0.012, 0.013, [0, -0.012, 0.152]), black);
    r.part("head", G.cone(0.035, 0.1, [0.04, 0.04, -0.01], [-0.1, 0, -0.35], 4), coat);
    r.part("head", G.cone(0.035, 0.1, [-0.04, 0.04, -0.01], [-0.1, 0, 0.35], 4), coat);
    r.part("head", G.cone(0.02, 0.045, [0.058, 0.093, -0.016], [-0.1, 0, -0.35], 4), black);
    r.part("head", G.cone(0.02, 0.045, [-0.058, 0.093, -0.016], [-0.1, 0, 0.35], 4), black);
    eyes(r, 0.03, 0.02, 0.055, 0.009, 0xc28a12);
    r.part("jaw", G.seg([0, 0, -0.01], [0, -0.005, 0.09], 0.022, 0.014, 5), white);
    // long bushy tail with a white tip
    r.part("tail0", G.ell(0.045, 0.045, 0.08, [0, -0.01, -0.05], [0.3, 0, 0]), coat);
    r.part("tail1", G.ell(0.06, 0.06, 0.09, [0, -0.02, -0.06], [0.35, 0, 0]), coat);
    r.part("tail2", G.ell(0.065, 0.065, 0.09, [0, -0.02, -0.06], [0.4, 0, 0]), coat);
    r.part("tail3", G.ell(0.05, 0.05, 0.08, [0, -0.02, -0.05], [0.4, 0, 0]), white);
    legs(r, r.cfg, coat, black, black);
  });
}
function makeDeer(name, buck) {
  const coat = 0x9e6c3c;
  const pale = 0xe9dcc4;
  const cfg = { hip: 0.82, chest: 0.84, len: 0.72, neck: [0.18, 0.14], head: [0.28, 0.06], jaw: [0.05, 0.08], tail: [1, 0.08, 0.5], tailBack: 0.2, tailY: 0.12, legX: 0.1, upper: [0.28, 0.32], legR: 0.04, legR2: 0.022, shoulderDrop: 0.08, hipDrop: 0.06 };
  return quad(name, cfg, (r) => {
    r.part("chest", G.ell(0.17, 0.22, 0.3, [0, 0, 0]), coat);
    r.part("chest", G.ell(0.13, 0.1, 0.22, [0, -0.13, 0]), pale);
    r.part("hips", G.ell(0.16, 0.21, 0.3, [0, 0.02, 0.04]), coat);
    r.part("hips", G.ell(0.165, 0.215, 0.44, [0, 0.02, 0.36]), coat);
    r.part("hips", G.ell(0.11, 0.13, 0.05, [0, 0.03, -0.25]), pale); // rump patch
    r.part("neck", G.seg([0, -0.06, -0.04], [0, 0.3, 0.06], 0.09, 0.06, 7), coat);
    r.part("head", G.ell(0.065, 0.07, 0.09, [0, 0, 0]), coat);
    r.part("head", G.seg([0, -0.01, 0.05], [0, -0.04, 0.2], 0.05, 0.03, 6), coat);
    r.part("head", G.ell(0.025, 0.02, 0.02, [0, -0.04, 0.205]), 0x1b1410);
    r.part("head", G.ell(0.03, 0.07, 0.015, [0.08, 0.06, -0.03], [0, 0.3, -0.9]), coat);
    r.part("head", G.ell(0.03, 0.07, 0.015, [-0.08, 0.06, -0.03], [0, -0.3, 0.9]), coat);
    eyes(r, 0.05, 0.02, 0.05, 0.014);
    r.part("jaw", G.seg([0, 0, 0], [0, -0.01, 0.1], 0.025, 0.018, 5), pale);
    r.part("tail0", G.ell(0.04, 0.07, 0.025, [0, -0.02, -0.01]), pale);
    if (buck) {
      const ac = 0xcbb894;
      for (const s of [1, -1]) {
        r.part("head", G.seg([s * 0.04, 0.06, -0.02], [s * 0.12, 0.25, -0.06], 0.014, 0.011, 4), ac);
        r.part("head", G.seg([s * 0.12, 0.25, -0.06], [s * 0.16, 0.42, 0.0], 0.011, 0.007, 4), ac);
        r.part("head", G.seg([s * 0.1, 0.2, -0.05], [s * 0.08, 0.32, 0.08], 0.009, 0.006, 4), ac);
        r.part("head", G.seg([s * 0.14, 0.33, -0.03], [s * 0.22, 0.4, -0.08], 0.008, 0.005, 4), ac);
      }
    }
    legs(r, r.cfg, coat, coat, 0x2a2018, { hoof: true });
  });
}
function makeGazelle() {
  const coat = 0xcf9f5f;
  const pale = 0xf3ead9;
  const cfg = { hip: 0.64, chest: 0.66, len: 0.55, neck: [0.14, 0.1], head: [0.2, 0.05], jaw: [0.04, 0.06], tail: [1, 0.07, 0.6], tailBack: 0.15, tailY: 0.08, legX: 0.08, upper: [0.22, 0.25], legR: 0.03, legR2: 0.016, shoulderDrop: 0.06, hipDrop: 0.05 };
  return quad("gazelle", cfg, (r) => {
    r.part("chest", G.ell(0.13, 0.16, 0.22, [0, 0, 0]), coat);
    r.part("chest", G.ell(0.11, 0.08, 0.18, [0, -0.09, 0]), pale);
    r.part("chest", G.ell(0.135, 0.025, 0.2, [0, -0.03, -0.01]), 0x3b2a1c); // flank stripe
    r.part("hips", G.ell(0.12, 0.15, 0.22, [0, 0.01, 0.03]), coat);
    r.part("hips", G.ell(0.125, 0.155, 0.34, [0, 0.015, 0.28]), coat);
    r.part("hips", G.ell(0.125, 0.025, 0.2, [0, -0.04, 0.03]), 0x3b2a1c);
    r.part("hips", G.ell(0.1, 0.07, 0.17, [0, -0.09, 0.03]), pale);
    r.part("neck", G.seg([0, -0.04, -0.03], [0, 0.22, 0.04], 0.06, 0.04, 6), coat);
    r.part("head", G.ell(0.05, 0.05, 0.07, [0, 0, 0]), coat);
    r.part("head", G.seg([0, -0.01, 0.04], [0, -0.03, 0.15], 0.038, 0.022, 6), pale);
    r.part("head", G.ell(0.02, 0.045, 0.012, [0.06, 0.05, -0.02], [0, 0.3, -0.7]), coat);
    r.part("head", G.ell(0.02, 0.045, 0.012, [-0.06, 0.05, -0.02], [0, -0.3, 0.7]), coat);
    eyes(r, 0.04, 0.015, 0.04, 0.011);
    for (const s of [1, -1]) {
      r.part("head", G.seg([s * 0.02, 0.04, 0.0], [s * 0.04, 0.2, -0.06], 0.012, 0.009, 4), 0x2b231c);
      r.part("head", G.seg([s * 0.04, 0.2, -0.06], [s * 0.045, 0.3, -0.03], 0.009, 0.003, 4), 0x2b231c);
    }
    r.part("jaw", G.seg([0, 0, 0], [0, -0.01, 0.08], 0.02, 0.013, 5), pale);
    r.part("tail0", G.seg([0, 0, 0], [0, -0.1, -0.03], 0.015, 0.01, 4), 0x2b231c);
    legs(r, r.cfg, coat, coat, 0x2b231c, { hoof: true });
  });
}
function makeZebra() {
  const white = 0xf2f0ea;
  const black = 0x1b1b1e;
  const cfg = { hip: 0.86, chest: 0.9, len: 0.92, neck: [0.2, 0.18], head: [0.24, 0.1], jaw: [0.06, 0.1], tail: [3, 0.16, 0.85], tailBack: 0.3, tailY: 0.12, legX: 0.14, upper: [0.32, 0.35], legR: 0.06, legR2: 0.034, shoulderDrop: 0.1, hipDrop: 0.08 };
  return quad("zebra", cfg, (r) => {
    r.part("chest", G.ell(0.25, 0.3, 0.38, [0, 0, 0]), white, 3);
    r.part("hips", G.ell(0.24, 0.3, 0.4, [0, 0.02, 0.05]), white, 3);
    r.part("hips", G.ell(0.25, 0.305, 0.55, [0, 0.03, 0.46]), white, 3);
    r.part("neck", G.seg([0, -0.1, -0.06], [0, 0.26, 0.12], 0.15, 0.1, 7), white, 3);
    r.part("neck", G.box(0.04, 0.42, 0.06, [0, 0.12, -0.04], [0.45, 0, 0]), black); // mane
    r.part("head", G.ell(0.09, 0.1, 0.12, [0, 0, 0]), white, 3);
    r.part("head", G.seg([0, -0.02, 0.06], [0, -0.07, 0.3], 0.08, 0.055, 7), white, 4);
    r.part("head", G.ell(0.06, 0.05, 0.05, [0, -0.07, 0.3]), black);
    r.part("head", G.cone(0.04, 0.13, [0.06, 0.07, -0.04], [-0.3, 0, -0.35], 4), white);
    r.part("head", G.cone(0.04, 0.13, [-0.06, 0.07, -0.04], [-0.3, 0, 0.35], 4), white);
    eyes(r, 0.07, 0.03, 0.05, 0.016);
    r.part("jaw", G.seg([0, 0, 0.02], [0, -0.01, 0.17], 0.04, 0.03, 5), black);
    for (let i = 0; i < 3; i++) r.part(`tail${i}`, G.seg([0, 0, 0], [0, -0.16 * 0.85, -0.16 * 0.57], 0.02, 0.018, 4), i === 2 ? black : white);
    r.part("tail2", G.ell(0.035, 0.09, 0.035, [0, -0.17, -0.08]), black);
    legs(r, r.cfg, white, white, black, { hoof: true, patU: 4, patL: 4 });
  });
}
function makeRabbit() {
  const fur = 0x9c8a74;
  const pale = 0xe8e0d4;
  const r = new RigDef("rabbit");
  r.bone("root", null, [0, 0, 0]);
  r.bone("body", "root", [0, 0.14, 0]);
  r.bone("head", "body", [0, 0.07, 0.11]);
  r.bone("earL", "head", [0.025, 0.05, -0.01]);
  r.bone("earR", "head", [-0.025, 0.05, -0.01]);
  r.bone("legB", "body", [0, -0.02, -0.08]);
  r.bone("legF", "body", [0, -0.04, 0.07]);
  r.part("body", G.ell(0.085, 0.095, 0.13, [0, 0, 0]), fur);
  r.part("body", G.ell(0.07, 0.06, 0.1, [0, -0.04, 0.01]), pale);
  r.part("body", G.ell(0.035, 0.035, 0.03, [0, 0.03, -0.13]), 0xffffff);
  r.part("head", G.ell(0.055, 0.055, 0.07, [0, 0, 0.02]), fur);
  r.part("head", G.ell(0.012, 0.01, 0.01, [0, -0.005, 0.088]), 0xd08a8a);
  eyes(r, 0.04, 0.015, 0.045, 0.011);
  r.part("earL", G.ell(0.018, 0.075, 0.01, [0, 0.07, 0], [0, 0, -0.15]), fur);
  r.part("earR", G.ell(0.018, 0.075, 0.01, [0, 0.07, 0], [0, 0, 0.15]), fur);
  r.part("legB", G.ell(0.03, 0.06, 0.08, [0.06, -0.05, 0.0]), fur);
  r.part("legB", G.ell(0.03, 0.06, 0.08, [-0.06, -0.05, 0.0]), fur);
  r.part("legB", G.ell(0.022, 0.015, 0.06, [0.06, -0.105, 0.04]), pale);
  r.part("legB", G.ell(0.022, 0.015, 0.06, [-0.06, -0.105, 0.04]), pale);
  r.part("legF", G.limb(0.014, 0.012, 0.08, 0.035, 0), pale);
  r.part("legF", G.limb(0.014, 0.012, 0.08, -0.035, 0), pale);
  const t = r.build();
  t.kind = "rabbit";
  return t;
}
function makeBird(name, colBody, colWing, colBelly) {
  const r = new RigDef(name);
  r.bone("root", null, [0, 0, 0]);
  r.bone("body", "root", [0, 0.08, 0]);
  r.bone("head", "body", [0, 0.04, 0.06]);
  r.bone("wL", "body", [0.035, 0.02, 0.0]);
  r.bone("wR", "body", [-0.035, 0.02, 0.0]);
  r.bone("tail", "body", [0, 0.0, -0.06]);
  r.part("body", G.ell(0.045, 0.045, 0.075, [0, 0, 0]), colBody);
  r.part("body", G.ell(0.038, 0.035, 0.055, [0, -0.015, 0.015]), colBelly);
  r.part("body", G.limb(0.004, 0.003, 0.05, 0.015, 0.0), 0x6a4a2a);
  r.part("body", G.limb(0.004, 0.003, 0.05, -0.015, 0.0), 0x6a4a2a);
  r.part("head", G.ell(0.032, 0.032, 0.034, [0, 0, 0]), colBody);
  r.part("head", G.cone(0.01, 0.03, [0, -0.005, 0.03], [Math.PI / 2, 0, 0], 4), 0xe2b03a);
  eyes(r, 0.022, 0.008, 0.02, 0.006, 0x050505);
  r.part("wL", G.ell(0.06, 0.006, 0.035, [0.05, 0, -0.01]), colWing);
  r.part("wR", G.ell(0.06, 0.006, 0.035, [-0.05, 0, -0.01]), colWing);
  r.part("tail", G.box(0.035, 0.006, 0.06, [0, 0, -0.03]), colWing);
  const t = r.build();
  t.kind = "bird";
  return t;
}
function makeEagle(name = "eagle", head = 0xf4f1e8, body = 0x4a3220, tailC = 0xf4f1e8) {
  const r = new RigDef(name);
  const beak = 0xf0b72e;
  r.bone("root", null, [0, 0, 0]);
  r.bone("body", "root", [0, 0.32, 0]);
  r.bone("neck", "body", [0, 0.08, 0.2]);
  r.bone("head", "neck", [0, 0.06, 0.06]);
  for (const [s, x] of [["L", 1], ["R", -1]]) {
    r.bone(`w${s}1`, "body", [x * 0.11, 0.06, 0.06]);
    r.bone(`w${s}2`, `w${s}1`, [x * 0.32, 0, 0]);
    r.bone(`w${s}3`, `w${s}2`, [x * 0.3, 0, 0]);
    r.bone(`leg${s}`, "body", [x * 0.06, -0.08, -0.02]);
  }
  r.bone("tail", "body", [0, -0.02, -0.22]);
  r.part("body", G.ell(0.13, 0.13, 0.27, [0, 0, 0], [0.12, 0, 0]), body);
  r.part("body", G.ell(0.1, 0.09, 0.18, [0, -0.06, 0.04]), body);
  r.part("neck", G.ell(0.085, 0.09, 0.09, [0, 0, 0]), head);
  r.part("head", G.ell(0.075, 0.075, 0.09, [0, 0.0, 0.02]), head);
  r.part("head", G.seg([0, 0.0, 0.08], [0, -0.03, 0.15], 0.035, 0.015, 5), beak);
  r.part("head", G.cone(0.014, 0.04, [0, -0.025, 0.145], [Math.PI * 0.8, 0, 0], 4), beak); // hook
  r.part("head", G.box(0.13, 0.018, 0.04, [0, 0.035, 0.05]), head); // brow
  eyes(r, 0.05, 0.015, 0.06, 0.012, 0xd4a017);
  for (const [s, x] of [["L", 1], ["R", -1]]) {
    r.part(`w${s}1`, G.box(0.33, 0.035, 0.24, [x * 0.16, 0, -0.04]), body);
    r.part(`w${s}2`, G.box(0.31, 0.03, 0.22, [x * 0.15, 0, -0.05]), body);
    r.part(`w${s}2`, G.box(0.3, 0.02, 0.1, [x * 0.15, -0.012, 0.03]), 0x5c4029);
    r.part(`w${s}3`, G.box(0.16, 0.025, 0.2, [x * 0.08, 0, -0.06]), body);
    for (let i = 0; i < 5; i++) r.part(`w${s}3`, G.box(0.17, 0.012, 0.034, [x * (0.2 + i * 0.008), 0, 0.02 - i * 0.05], [0, x * (0.16 - i * 0.09), 0]), 0x2e1f14);
    r.part(`leg${s}`, G.limb(0.03, 0.022, 0.13, 0, 0, 5), body);
    r.part(`leg${s}`, G.limb(0.015, 0.014, 0.1, 0, 0.0, 4).translate(0, -0.13, 0), beak);
    for (const a of [-0.5, 0, 0.5]) r.part(`leg${s}`, G.cone(0.01, 0.06, [0, -0.23, 0.0], [Math.PI / 2 - 0.3, a, 0], 3), 0x1b1b1b);
  }
  r.part("tail", G.box(0.2, 0.025, 0.26, [0, 0, -0.12]), tailC);
  const t = r.build();
  t.kind = "eagle";
  return t;
}
function makeFish() {
  const r = new RigDef("fish");
  r.bone("root", null, [0, 0, 0]);
  r.bone("body", "root", [0, 0, 0.04]);
  r.bone("t1", "body", [0, 0, -0.12]);
  r.bone("t2", "t1", [0, 0, -0.1]);
  r.part("body", G.ell(0.045, 0.06, 0.13, [0, 0, 0]), 0x7c8a6a);
  r.part("body", G.ell(0.04, 0.035, 0.11, [0, -0.025, 0.01]), 0xd9dccf);
  r.part("body", G.box(0.006, 0.05, 0.06, [0, 0.07, -0.03]), 0x5c6a4a);
  eyes({ part: (b, g, c) => r.part("body", g, c) }, 0.03, 0.015, 0.09, 0.008);
  r.part("t1", G.ell(0.032, 0.045, 0.08, [0, 0, -0.03]), 0x7c8a6a);
  r.part("t2", G.box(0.006, 0.1, 0.07, [0, 0, -0.04]), 0x5c6a4a);
  const t = r.build();
  t.kind = "fish";
  return t;
}

/* ------------------------------------------------------------------ registry */
const MAKERS = {
  wolf: () => makeWolf(),
  wolfRival: () => makeWolf("wolfRival", 0x4f5257, 0x9a958c, 0x27292c),
  lion: () => makeLion("lion", true),
  lioness: () => makeLion("lioness", false),
  tiger: makeTiger,
  bear: makeBear,
  fox: makeFox,
  deer: () => makeDeer("deer", false),
  deerBuck: () => makeDeer("deerBuck", true),
  gazelle: makeGazelle,
  zebra: makeZebra,
  rabbit: makeRabbit,
  birdA: () => makeBird("birdA", 0x8a5a3a, 0x5a3a22, 0xe8c9a0),
  birdB: () => makeBird("birdB", 0x3a6aa8, 0x2a4a7a, 0xf0e6d0),
  birdC: () => makeBird("birdC", 0xc23a2a, 0x5a2a20, 0xe8d0b0),
  eagle: () => makeEagle("eagle"),
  goldenEagle: () => makeEagle("goldenEagle", 0xa77a3a, 0x4a3220, 0x4a3220),
  fish: makeFish,
};
export class ModelLib {
  constructor() {
    this.material = createAnimalMaterial();
    this.templates = new Map();
  }
  template(key) {
    let t = this.templates.get(key);
    if (!t) {
      t = MAKERS[key]();
      this.templates.set(key, t);
    }
    return t;
  }
  /** A posable instance: { mesh (SkinnedMesh), bones, t (template), s (smoothed pose state) }. */
  create(key) {
    const t = this.template(key);
    const bones = t.bones.map((b) => {
      const bone = new THREE.Bone();
      bone.position.set(b.pos[0], b.pos[1], b.pos[2]);
      return bone;
    });
    t.bones.forEach((b, i) => {
      if (b.parent >= 0) bones[b.parent].add(bones[i]);
    });
    const skel = new THREE.Skeleton(bones, t.inverses);
    const mesh = new THREE.SkinnedMesh(t.geo, this.material);
    mesh.add(bones[0]);
    mesh.bind(skel, new THREE.Matrix4());
    mesh.castShadow = true;
    mesh.receiveShadow = false;
    mesh.frustumCulled = true;
    const B = {};
    for (const k in t.idx) B[k] = bones[t.idx[k]];
    return { key, mesh, bones: B, t, s: { gait: 0, amp: 0, lie: 0, head: 0, atk: 0, howl: 0, swim: 0, stalk: 0, air: 0, wing: 0, turn: 0, dead: 0, t: Math.random() * 10 } };
  }
  dispose() {
    for (const t of this.templates.values()) t.geo.dispose();
    this.templates.clear();
    this.material.dispose();
  }
}

/** Which template an entity / player uses. */
export function templateKey(type, o = {}) {
  switch (type) {
    case "wolf":
      return o.rival ? "wolfRival" : "wolf";
    case "lion":
      return o.female ? "lioness" : "lion";
    case "deer":
      return o.buck ? "deerBuck" : "deer";
    case "bird":
      return ["birdA", "birdB", "birdC"][o.variant % 3];
    case "eagle":
      return o.golden ? "goldenEagle" : "eagle";
    default:
      return type;
  }
}

/* ------------------------------------------------------------------ animation */
const lerpK = (cur, target, rate, dt) => cur + (target - cur) * Math.min(1, rate * dt);
const TAU = Math.PI * 2;
// leg phase offsets (fraction of a stride): walk = lateral sequence, gallop = rotary
const WALK = { fL: 0, bR: 0.25, fR: 0.5, bL: 0.75 };
const TROT = { fL: 0, bR: 0, fR: 0.5, bL: 0.5 };
const GALLOP = { fL: 0, fR: 0.12, bL: 0.55, bR: 0.65 };

/**
 * Pose a quadruped. a = channels:
 *  spd, walk, run (reference speeds), phase, turn, lie (0–1), head (0–1 down),
 *  atk (0–1 progress) + atkKind, howl, hurt, dead, air (airborne), swim, stalk, eat (chew)
 */
export function poseQuad(inst, a, dt) {
  const B = inst.bones;
  const s = inst.s;
  const cfg = inst.t.cfg;
  s.t += dt;
  const run = a.run || 7;
  const sp = a.spd || 0;
  const moveN = Math.min(1, sp / Math.max(0.5, a.walk || 1.5));
  const gallopW = Math.min(1, Math.max(0, (sp - run * 0.75) / (run * 0.5)));
  const trotW = Math.min(1, Math.max(0, (sp - (a.walk || 1.5) * 1.3) / ((a.walk || 1.5) * 1.5))) * (1 - gallopW);
  s.amp = lerpK(s.amp, moveN * (0.45 + 0.25 * gallopW), 10, dt);
  s.lie = lerpK(s.lie, a.lie || 0, 3, dt);
  s.dead = lerpK(s.dead, a.dead ? 1 : 0, 3, dt);
  s.head = lerpK(s.head, a.head || 0, 5, dt);
  s.howl = lerpK(s.howl, a.howl > 0 ? 1 : 0, 6, dt);
  s.swim = lerpK(s.swim, a.swim ? 1 : 0, 4, dt);
  s.stalk = lerpK(s.stalk, a.stalk ? 1 : 0, 5, dt);
  s.air = lerpK(s.air, a.air ? 1 : 0, 10, dt);
  s.turn = lerpK(s.turn, a.turn || 0, 6, dt);
  const ph = a.phase || 0;
  const lieK = Math.max(s.lie, s.dead);
  const legAmp = s.amp * (1 - lieK) * (1 - s.air * 0.7);
  const legPose = (name, front, off) => {
    const u = B[name];
    const l = B[name + "2"];
    const f = B[name + "3"];
    const p = (ph / Math.PI) * 0.5 + off; // phase in strides
    const c = Math.sin(p * TAU);
    const lift = Math.max(0, Math.cos(p * TAU));
    let swing = -c * legAmp * (front ? 0.9 : 0.8);
    let bend = lift * legAmp * 1.4;
    // swimming paddles; airborne tucks
    if (s.swim > 0.01) {
      const sw = Math.sin(s.t * 7 + off * TAU);
      swing = swing * (1 - s.swim) + s.swim * (-sw * 0.6);
      bend = bend * (1 - s.swim) + s.swim * (0.6 + sw * 0.4);
    }
    swing += s.air * (front ? -0.7 : 0.6);
    bend += s.air * 0.6;
    // lying down folds the legs under the body
    const fold = lieK;
    swing = swing * (1 - fold) + fold * (front ? -1.35 : 1.05) * (1 - s.dead) + s.dead * (front ? -0.5 : 0.4);
    bend = bend * (1 - fold) + fold * 2.4 * (1 - s.dead) + s.dead * 0.3;
    u.rotation.x = swing;
    l.rotation.x = front ? bend : -bend;
    f.rotation.x = front ? -bend * 0.5 - swing * 0.3 : bend * 0.7;
  };
  const off = {};
  for (const k of ["fL", "fR", "bL", "bR"]) off[k] = WALK[k] * (1 - trotW - gallopW) + TROT[k] * trotW + GALLOP[k] * gallopW;
  legPose("fL", true, off.fL);
  legPose("fR", true, off.fR);
  legPose("bL", false, off.bL);
  legPose("bR", false, off.bR);
  // body: bob, gallop flex, stalk crouch, lie drop, roll on death
  const bob = Math.abs(Math.sin(ph)) * 0.04 * s.amp * (cfg ? cfg.hip : 0.6) * (1 + gallopW * 2);
  const crouch = s.stalk * 0.18 + s.swim * 0.25;
  const drop = lieK * 0.55;
  const root = B.root;
  root.position.y = (bob - (cfg ? cfg.hip : 0.6) * (crouch + drop)) * (1 - s.dead * 0.2);
  root.rotation.z = s.dead * 1.45;
  root.position.x = -s.dead * (cfg ? cfg.hip * 0.5 : 0.3);
  const flex = Math.sin(ph * 1) * 0.12 * gallopW * s.amp;
  B.hips.rotation.x = flex + s.air * -0.15;
  B.chest.rotation.x = -flex * 1.4 - s.stalk * 0.05;
  B.chest.rotation.y = s.turn * 0.22;
  B.chest.rotation.z = Math.sin(s.t * 40) * 0.06 * (a.hurt || 0);
  // attacks
  const atk = a.atk || 0;
  const kind = a.atkKind;
  let neckX = 0;
  let headX = 0;
  let jaw = 0;
  if (atk > 0 && atk < 1) {
    const e = Math.sin(Math.min(1, atk * 1.25) * Math.PI);
    if (kind === "heavy") {
      // rear up then slam
      const up = atk < 0.45 ? atk / 0.45 : Math.max(0, 1 - (atk - 0.45) / 0.2);
      B.hips.rotation.x -= up * 0.9;
      root.position.y += up * (cfg ? cfg.hip * 0.25 : 0.2);
      B.fL.rotation.x = -up * 2.0;
      B.fR.rotation.x = -up * 1.8;
      B.fL2.rotation.x = up * 0.6;
      B.fR2.rotation.x = up * 0.6;
      jaw = up * 0.5;
    } else if (kind === "claw" || a.claw) {
      B.fR.rotation.x = -e * 1.9;
      B.fR2.rotation.x = e * 0.9;
      B.chest.rotation.z += e * 0.12;
      jaw = e * 0.4;
    } else if (kind === "pounce") {
      B.hips.rotation.x -= e * 0.35;
      B.fL.rotation.x = -e * 1.4;
      B.fR.rotation.x = -e * 1.4;
      jaw = e * 0.6;
      neckX -= e * 0.2;
    } else {
      // bite: lunge the head forward, jaw snap
      neckX += e * 0.35;
      headX -= e * 0.25;
      jaw = e * 0.7;
    }
  }
  // head: look down to graze / eat / drink, up to howl
  neckX += s.head * 1.05 - s.howl * 0.95 + s.stalk * 0.25 - s.swim * 0.35 + lieK * 0.35 * (1 - s.dead);
  headX += s.head * 0.35 - s.howl * 0.25;
  if (a.eat || s.head > 0.6) jaw = Math.max(jaw, (Math.sin(s.t * 12) * 0.5 + 0.5) * 0.25 * s.head);
  if (s.howl > 0.05) jaw = Math.max(jaw, s.howl * (a.roar ? 0.7 : 0.4));
  const idle = (1 - s.amp) * (1 - lieK);
  B.neck.rotation.x = neckX + Math.sin(s.t * 0.9) * 0.04 * idle;
  B.neck.rotation.y = s.turn * 0.35 + Math.sin(s.t * 0.37) * 0.25 * idle * (1 - s.head);
  B.head.rotation.x = headX;
  B.head.rotation.z = Math.sin(s.t * 0.5) * 0.06 * idle;
  B.jaw.rotation.x = jaw;
  // tail: swish when idle, stream back when running
  const tn = inst.t.tailN || 0;
  for (let i = 0; i < tn; i++) {
    const b = B[`tail${i}`];
    const k = (i + 1) / tn;
    b.rotation.y = Math.sin(s.t * (1.6 + gallopW) - i * 0.6) * (0.18 + 0.12 * idle) * k - s.turn * 0.25;
    b.rotation.x = i === 0 ? -gallopW * 0.7 - trotW * 0.25 + s.dead * 0.4 : -gallopW * 0.12;
  }
}

/** Rabbit: hop cycle — the whole body arcs, hind legs push, ears flop. */
export function poseRabbit(inst, a, dt) {
  const B = inst.bones;
  const s = inst.s;
  s.t += dt;
  s.lie = lerpK(s.lie, a.dead ? 1 : a.lie || 0, 3, dt);
  s.head = lerpK(s.head, a.head || 0, 5, dt);
  const sp = a.spd || 0;
  const hop = sp > 0.3 ? Math.abs(Math.sin(a.phase || 0)) : 0;
  s.amp = lerpK(s.amp, Math.min(1, sp / 3), 8, dt);
  B.root.position.y = hop * 0.12 * s.amp * (1 - s.lie);
  B.root.rotation.z = a.dead ? 1.4 * s.lie : 0;
  B.body.rotation.x = (Math.cos(a.phase || 0) * 0.35 * s.amp - s.head * 0.25) * (1 - s.lie);
  B.legB.rotation.x = -Math.cos(a.phase || 0) * 0.8 * s.amp;
  B.legF.rotation.x = Math.cos(a.phase || 0) * 0.7 * s.amp;
  B.head.rotation.x = s.head * 0.6 + Math.sin(s.t * 9) * 0.03 * (1 - s.amp);
  B.earL.rotation.x = -0.2 - s.amp * 0.6 + Math.sin(s.t * 3) * 0.08;
  B.earR.rotation.x = -0.2 - s.amp * 0.6 + Math.sin(s.t * 3 + 1) * 0.08;
}

/** Small bird: pecking on the ground or flapping in the air. */
export function poseBird(inst, a, dt) {
  const B = inst.bones;
  const s = inst.s;
  s.t += dt;
  s.air = lerpK(s.air, a.air ? 1 : 0, 6, dt);
  const flap = Math.sin((a.flap || s.t * 3) * 3.2) * 1.1 * s.air;
  const fold = 1 - s.air;
  B.wL.rotation.z = flap + 0.1;
  B.wR.rotation.z = -flap - 0.1;
  B.wL.rotation.y = fold * 1.3;
  B.wR.rotation.y = -fold * 1.3;
  B.head.rotation.x = a.head ? (Math.sin(s.t * 9) > 0.6 ? 0.9 : 0.2) : Math.sin(s.t * 2) * 0.1;
  B.root.rotation.z = a.dead ? 1.4 : 0;
  B.tail.rotation.x = 0.2 * fold;
}

/** Fish: tail sweep. */
export function poseFish(inst, a, dt) {
  const B = inst.bones;
  const s = inst.s;
  s.t += dt;
  const ph = a.phase || s.t * 4;
  B.t1.rotation.y = Math.sin(ph) * 0.35;
  B.t2.rotation.y = Math.sin(ph - 0.9) * 0.55;
  B.root.rotation.z = a.dead ? 1.57 : 0;
}

/**
 * Eagle. a: air (flying), flapping, flap (phase), glide, dive, bank, pitch,
 * land (flare), atk, takeoff, dead, eat, lie.
 */
export function poseEagle(inst, a, dt) {
  const B = inst.bones;
  const s = inst.s;
  s.t += dt;
  s.air = lerpK(s.air, a.air ? 1 : 0, 4, dt);
  s.wing = lerpK(s.wing, a.flapping ? 1 : 0, 6, dt);
  s.dive = lerpK(s.dive || 0, a.dive ? 1 : 0, 6, dt);
  s.head = lerpK(s.head, a.head || 0, 5, dt);
  s.dead = lerpK(s.dead, a.dead ? 1 : 0, 3, dt);
  const fl = Math.sin(a.flap || 0);
  const open = s.air * (1 - s.dive);
  for (const [k, x] of [["L", 1], ["R", -1]]) {
    const w1 = B[`w${k}1`];
    const w2 = B[`w${k}2`];
    const w3 = B[`w${k}3`];
    const flap = fl * 0.85 * s.wing * open;
    const dihedral = 0.12 * open * (1 - s.wing);
    // folded at rest: wings tucked back along the body
    w1.rotation.z = x * (flap + dihedral) + x * (1 - s.air) * -0.25;
    // folded: humerus back, forearm forward, hand back (a compact zig-zag along the body)
    w1.rotation.y = x * (1.4 * (1 - s.air) + 0.85 * s.dive);
    w2.rotation.y = x * (-2.8 * (1 - s.air) + 0.2 * s.dive);
    w2.rotation.z = x * flap * 0.4;
    w3.rotation.y = x * (2.7 * (1 - s.air) + 0.35 * s.dive);
    w3.rotation.z = x * flap * 0.5;
    // talons forward to strike or land
    const reach = Math.max(a.atk > 0 && a.atk < 1 ? Math.sin(a.atk * Math.PI) : 0, a.land || 0);
    B[`leg${k}`].rotation.x = -reach * 1.3 + s.air * 0.9 * (1 - reach);
  }
  B.root.rotation.z = (a.bank || 0) * s.air + s.dead * 1.3;
  B.root.rotation.x = -(a.pitch || 0) * s.air;
  B.root.position.y = (1 - s.air) * 0 - s.dead * 0.15;
  B.body.rotation.x = (1 - s.air) * -0.45 + s.head * 0.5;
  B.neck.rotation.x = (1 - s.air) * 0.35 + s.head * 0.6 + s.dive * 0.25;
  B.head.rotation.x = Math.sin(s.t * 1.3) * 0.05;
  B.head.rotation.y = (1 - s.air) * Math.sin(s.t * 0.6) * 0.5 * (1 - s.head);
  B.tail.rotation.x = (1 - s.air) * 0.5 - s.wing * 0.1;
}
