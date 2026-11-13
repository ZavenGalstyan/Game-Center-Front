/**
 * Geometry builders for creature parts: anatomical bones, armour plates,
 * horns, blades, cloth. All sizes are metres; long parts are built along +Y
 * from y=0 so they can be laid along a rig bone (see alongBone in monsters.js).
 * Smooth normals everywhere; noise relief comes from the creature shader.
 */
import * as THREE from "three";
import { mergeGeometries, mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/** Lathe around Y from [radius, y] pairs (bottom → top). Optional elliptic squash. */
export function lathe(profile, seg = 16, sx = 1, sz = 1) {
  const pts = profile.map(([r, y]) => new THREE.Vector2(Math.max(0.0001, r), y));
  const g = new THREE.LatheGeometry(pts, seg);
  if (sx !== 1 || sz !== 1) g.scale(sx, 1, sz);
  g.computeVertexNormals();
  return g;
}

/** Anatomical long bone: knobbed epiphyses, slightly bowed shaft. */
export function longBone(len, r = 0.02, knob = 1.6, seg = 12) {
  const p = [
    [0.001, -r * 0.6],
    [r * knob * 0.8, -r * 0.3],
    [r * knob, r * 0.4],
    [r * knob * 0.75, r * 1.6],
    [r * 1.05, len * 0.18],
    [r * 0.9, len * 0.5],
    [r * 1.0, len * 0.8],
    [r * knob * 0.8, len - r * 1.4],
    [r * knob, len - r * 0.4],
    [r * knob * 0.7, len + r * 0.3],
    [0.001, len + r * 0.55],
  ];
  const g = lathe(p, seg, 1, 0.82);
  // bow the shaft a touch so it doesn't read as a turned dowel
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / len;
    pos.setZ(i, pos.getZ(i) + Math.sin(Math.PI * y) * r * 0.5);
  }
  g.computeVertexNormals();
  return g;
}

/** Vertebra: body disc + spinous process + transverse processes. */
export function vertebra(s = 1) {
  const body = new THREE.CylinderGeometry(0.022 * s, 0.024 * s, 0.026 * s, 10);
  const spine = new THREE.ConeGeometry(0.009 * s, 0.05 * s, 6);
  spine.rotateX(-Math.PI / 2 - 0.5);
  spine.translate(0, -0.006 * s, -0.04 * s);
  const tr = new THREE.CylinderGeometry(0.006 * s, 0.004 * s, 0.075 * s, 6);
  tr.rotateZ(Math.PI / 2);
  tr.translate(0, 0, -0.018 * s);
  const g = mergeGeometries([body.toNonIndexed(), spine.toNonIndexed(), tr.toNonIndexed()]);
  return smooth(g);
}

/** One rib: an elliptic arc from the spine round to the front. */
export function rib(w, d, drop, r = 0.0075, side = 1) {
  const pts = [];
  for (let i = 0; i <= 14; i++) {
    const t = i / 14;
    const a = t * Math.PI * 0.92;
    pts.push(new THREE.Vector3(side * Math.sin(a) * w, -drop * Math.pow(t, 1.4), -Math.cos(a) * d + d * 0.15));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  const g = new THREE.TubeGeometry(curve, 20, r, 6, false);
  // flatten ribs (they are blades, not rods)
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setY(i, pos.getY(i) * 1.0);
  return g;
}

/** Tapering ridged horn following a curve (spiral sweep). */
export function horn(len, r0, curl = 1, twist = 0.6, ridges = 10) {
  const pts = [];
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    const a = t * curl * 1.6;
    pts.push(new THREE.Vector3(Math.sin(t * twist * Math.PI) * len * 0.15, Math.sin(a) * len * 0.62, -(1 - Math.cos(a)) * len * 0.5));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  const tubSeg = 40;
  const radSeg = 10;
  const g = new THREE.TubeGeometry(curve, tubSeg, r0, radSeg, false);
  const pos = g.attributes.position;
  const P = new THREE.Vector3();
  const C = new THREE.Vector3();
  for (let i = 0; i <= tubSeg; i++) {
    const t = i / tubSeg;
    curve.getPointAt(t, C);
    const rr = Math.pow(1 - t, 0.85) * (1 + 0.08 * Math.sin(t * ridges * Math.PI * 2));
    for (let j = 0; j <= radSeg; j++) {
      const k = i * (radSeg + 1) + j;
      P.fromBufferAttribute(pos, k).sub(C).multiplyScalar(Math.max(0.02, rr)).add(C);
      pos.setXYZ(k, P.x, P.y, P.z);
    }
  }
  g.computeVertexNormals();
  return g;
}

/** Curved claw (for ghoul fingers / demon hands). */
export function claw(len, r) {
  return horn(len, r, 0.55, 0, 0);
}

/** Flat blade from a 2D outline, bevelled. Built along +Y. */
export function blade(outline, thick = 0.006, bevel = 0.003) {
  const sh = new THREE.Shape(outline.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(sh, { depth: thick, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 12 });
  g.translate(0, 0, -thick / 2);
  g.computeVertexNormals();
  return g;
}

/** Curved armour plate wrapping a limb: open-backed partial tube with rolled rims. */
export function plate(len, r0, r1, arc = Math.PI * 2, seg = 20) {
  const prof = [
    [r0 * 1.06, -0.004],
    [r0 * 1.1, 0.008],
    [r0 * 1.02, 0.018],
    [(r0 + r1) / 2, len * 0.5],
    [r1 * 1.02, len - 0.018],
    [r1 * 1.1, len - 0.008],
    [r1 * 1.06, len + 0.004],
  ];
  const pts = prof.map(([r, y]) => new THREE.Vector2(r, y));
  const g = new THREE.LatheGeometry(pts, seg, -arc / 2 + Math.PI / 2, arc);
  g.computeVertexNormals();
  return doubleThick(g, 0.004);
}

/** Give a thin open surface some thickness by appending an inner copy. */
export function doubleThick(g, t) {
  const inner = g.clone();
  const pos = inner.attributes.position;
  const nor = inner.attributes.normal;
  for (let i = 0; i < pos.count; i++) pos.setXYZ(i, pos.getX(i) - nor.getX(i) * t, pos.getY(i) - nor.getY(i) * t, pos.getZ(i) - nor.getZ(i) * t);
  const idx = inner.index.array;
  for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]];
  for (let i = 0; i < nor.count; i++) nor.setXYZ(i, -nor.getX(i), -nor.getY(i), -nor.getZ(i));
  return mergeGeometries([g, inner]);
}

/** Dome / pauldron: part of an ellipsoid. */
export function dome(rx, ry, rz, phiLen = Math.PI * 2, thetaLen = Math.PI / 2, seg = 20) {
  const g = new THREE.SphereGeometry(1, seg, Math.round(seg / 2), 0, phiLen, 0, thetaLen);
  g.scale(rx, ry, rz);
  return doubleThick(g, 0.005);
}

/** Tattered cloth tube (robe, skirt, sleeve): rings from top radius to bottom, with ragged hem. */
export function clothTube(top, bottom, len, { seg = 28, rings = 18, sx = 1, sz = 1, flare = 0, ragged = 0.08, folds = 0.012, seed = 1 } = {}) {
  const verts = [];
  const uvs = [];
  const idx = [];
  const rnd = (i) => {
    const n = Math.sin(i * 12.9898 + seed * 78.233) * 43758.5453;
    return n - Math.floor(n);
  };
  const hem = [];
  for (let j = 0; j <= seg; j++) hem.push(rnd(j % seg) * ragged + (rnd((j % seg) + 99) > 0.8 ? ragged * 1.2 : 0));
  for (let i = 0; i <= rings; i++) {
    const t = i / rings;
    for (let j = 0; j <= seg; j++) {
      const a = (j / seg) * Math.PI * 2;
      const r = top + (bottom - top) * Math.pow(t, 1 - flare * 0.5);
      const fold =
        (Math.sin(a * 9 + seed) * 1.0 + Math.sin(a * 4 + seed * 2) * 0.6 + Math.sin(a * 17 + seed * 3 + t * 2) * 0.35) * folds * (0.25 + t) +
        Math.max(0, Math.sin(a * 6 + seed * 5)) * folds * 1.4 * t * t;
      const y = -t * (len + hem[j] * t * t);
      verts.push(Math.sin(a) * (r + fold) * sx, y, Math.cos(a) * (r + fold) * sz);
      uvs.push(j / seg, t);
    }
  }
  for (let i = 0; i < rings; i++)
    for (let j = 0; j < seg; j++) {
      const a = i * (seg + 1) + j;
      const b = a + seg + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Peaked cowl with a face opening toward +Z (built around the head, y up). */
export function hood(r = 0.17, h = 0.34, opening = 0.42, seed = 2) {
  return membrane(16, 30, (i, j) => {
    const v = i; // 0 = bottom edge, 1 = peak
    const a = (j - 0.5) * Math.PI * 2 * (1 - opening * 0.5) + Math.PI; // gap centred on +Z
    const rr = r * (1 - Math.pow(v, 2.2) * 0.85) * (1 + Math.sin(a * 5 + seed + v * 3) * 0.04 * (1 - v));
    const drape = (1 - v) * (1 - v) * 0.05;
    const y = v * h - drape;
    const back = Math.pow(v, 3) * 0.09; // peak falls backward
    const x = Math.sin(a) * rr;
    let z = Math.cos(a) * rr - back;
    // front edges roll outward
    const edge = Math.abs(Math.sin((j - 0.5) * Math.PI));
    z += Math.pow(edge, 8) * 0.03;
    return new THREE.Vector3(x, y, z);
  });
}

/** Flat membrane (wing / cape) between a list of rib polylines. */
export function membrane(rows, cols, fn) {
  const verts = [];
  const uvs = [];
  const idx = [];
  for (let i = 0; i <= rows; i++)
    for (let j = 0; j <= cols; j++) {
      const p = fn(i / rows, j / cols);
      verts.push(p.x, p.y, p.z);
      uvs.push(j / cols, i / rows);
    }
  for (let i = 0; i < rows; i++)
    for (let j = 0; j < cols; j++) {
      const a = i * (cols + 1) + j;
      const b = a + cols + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export function smooth(g) {
  const out = mergeVertices(g.deleteAttribute("uv") ? g : g, 1e-4);
  out.computeVertexNormals();
  return out;
}

export { mergeGeometries };
