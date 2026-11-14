/**
 * Shadow Wolf — a quadruped (no suitable CC0 rigged realistic wolf exists),
 * so the body is SCULPTED here: an anatomical signed-distance field (ribcage,
 * deep chest, tucked belly, shoulder/hip musculature, skull, muzzle, ears,
 * tail) smooth-unioned and meshed with surface nets, skinned to a 22-bone
 * skeleton with distance-based weights, and covered with layered shell fur.
 * All animation is procedural (breathing, weight shifts, head tracking, ear
 * twitches, snarl, crouch → lunge bite, pounce, howl, recoil, collapse).
 */
import * as THREE from "three";
import { creatureMaterial, creatureUniforms, eyeMaterial, softSprite, smokeTexture } from "./materials.js";

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

/* ------------------------------------------------------------------ skeleton */
// name, parent, rest world position
const BONES = [
  ["root", null, [0, 0, 0]],
  ["hips", "root", [0, 0.86, -0.42]],
  ["spine", "hips", [0, 0.9, -0.08]],
  ["chest", "spine", [0, 0.96, 0.26]],
  ["neck", "chest", [0, 1.06, 0.5]],
  ["head", "neck", [0, 1.17, 0.72]],
  ["jaw", "head", [0, 1.1, 0.78]],
  ["earL", "head", [0.07, 1.3, 0.7]],
  ["earR", "head", [-0.07, 1.3, 0.7]],
  ["tail1", "hips", [0, 0.88, -0.66]],
  ["tail2", "tail1", [0, 0.78, -0.86]],
  ["tail3", "tail2", [0, 0.64, -1.02]],
  ["tail4", "tail3", [0, 0.5, -1.12]],
];
for (const [s, x] of [
  ["L", 1],
  ["R", -1],
]) {
  BONES.push(
    [`shoulder${s}`, "chest", [x * 0.14, 0.86, 0.36]],
    [`elbow${s}`, `shoulder${s}`, [x * 0.16, 0.5, 0.3]],
    [`wrist${s}`, `elbow${s}`, [x * 0.16, 0.15, 0.36]],
    [`fpaw${s}`, `wrist${s}`, [x * 0.16, 0.04, 0.43]],
    [`thigh${s}`, "hips", [x * 0.14, 0.8, -0.5]],
    [`knee${s}`, `thigh${s}`, [x * 0.16, 0.52, -0.36]],
    [`hock${s}`, `knee${s}`, [x * 0.16, 0.24, -0.6]],
    [`hpaw${s}`, `hock${s}`, [x * 0.16, 0.04, -0.52]],
  );
}

/* ------------------------------------------------------------------ SDF */
function smin(a, b, k) {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}
// round cone between a (radius ra) and b (radius rb)
function seg(px, py, pz, a, b, ra, rb) {
  const bax = b[0] - a[0], bay = b[1] - a[1], baz = b[2] - a[2];
  const pax = px - a[0], pay = py - a[1], paz = pz - a[2];
  const l2 = bax * bax + bay * bay + baz * baz;
  let h = (pax * bax + pay * bay + paz * baz) / l2;
  h = h < 0 ? 0 : h > 1 ? 1 : h;
  const dx = pax - bax * h, dy = pay - bay * h, dz = paz - baz * h;
  return Math.sqrt(dx * dx + dy * dy + dz * dz) - (ra + (rb - ra) * h);
}
function ell(px, py, pz, c, r) {
  const x = (px - c[0]) / r[0], y = (py - c[1]) / r[1], z = (pz - c[2]) / r[2];
  const k0 = Math.sqrt(x * x + y * y + z * z);
  const x1 = x / r[0], y1 = y / r[1], z1 = z / r[2];
  const k1 = Math.sqrt(x1 * x1 + y1 * y1 + z1 * z1);
  return (k0 * (k0 - 1)) / Math.max(1e-6, k1);
}

const P = Object.fromEntries(BONES.map(([n, , p]) => [n, p]));

function wolfSDF(x, y, z) {
  const ax = Math.abs(x); // symmetric
  // torso: deep chest, ribcage, tucked waist, hips
  let d = ell(ax, y, z, [0, 0.93, 0.24], [0.19, 0.24, 0.3]);
  d = smin(d, ell(ax, y, z, [0, 0.92, -0.06], [0.15, 0.17, 0.28]), 0.12);
  d = smin(d, ell(ax, y, z, [0, 0.88, -0.42], [0.16, 0.16, 0.2]), 0.12);
  d = smin(d, ell(ax, y, z, [0, 1.04, 0.2], [0.13, 0.12, 0.26]), 0.1); // withers / shoulder hump
  // neck with ruff
  d = smin(d, seg(ax, y, z, [0, 0.99, 0.36], [0, 1.12, 0.66], 0.16, 0.1), 0.1);
  d = smin(d, ell(ax, y, z, [0, 1.02, 0.46], [0.17, 0.2, 0.15]), 0.08);
  // skull + muzzle
  d = smin(d, ell(ax, y, z, [0, 1.19, 0.73], [0.105, 0.1, 0.12]), 0.06);
  d = smin(d, seg(ax, y, z, [0, 1.16, 0.78], [0, 1.12, 0.98], 0.065, 0.04), 0.06);
  d = smin(d, ell(ax, y, z, [0.055, 1.15, 0.72], [0.05, 0.05, 0.06]), 0.04); // cheeks
  // lower jaw
  d = smin(d, seg(ax, y, z, [0, 1.09, 0.76], [0, 1.075, 0.95], 0.045, 0.026), 0.04);
  // mouth slit (carve between the jaws)
  const slit = Math.max(Math.abs(y - 1.105) - 0.008, z < 0.83 ? 0.83 - z : -1, ax - 0.06);
  d = Math.max(d, -slit);
  // ears
  d = smin(d, seg(ax, y, z, [0.07, 1.26, 0.7], [0.085, 1.37, 0.68], 0.032, 0.006), 0.03);
  // brow ridge
  d = smin(d, ell(ax, y, z, [0.04, 1.235, 0.79], [0.035, 0.022, 0.04]), 0.03);
  // legs — fore
  const fl = [P.shoulderL, P.elbowL, P.wristL, P.fpawL].map((p) => [Math.abs(p[0]), p[1], p[2]]);
  d = smin(d, ell(ax, y, z, [0.13, 0.82, 0.33], [0.075, 0.16, 0.1]), 0.08); // shoulder muscle
  d = smin(d, seg(ax, y, z, fl[0], fl[1], 0.075, 0.05), 0.06);
  d = smin(d, seg(ax, y, z, fl[1], fl[2], 0.042, 0.03), 0.04);
  d = smin(d, seg(ax, y, z, fl[2], fl[3], 0.032, 0.036), 0.03);
  d = smin(d, ell(ax, y, z, [fl[3][0], 0.035, fl[3][2] + 0.02], [0.045, 0.035, 0.065]), 0.025); // paw
  // legs — hind
  const hl = [P.thighL, P.kneeL, P.hockL, P.hpawL].map((p) => [Math.abs(p[0]), p[1], p[2]]);
  d = smin(d, ell(ax, y, z, [0.12, 0.74, -0.46], [0.08, 0.17, 0.15]), 0.08); // haunch
  d = smin(d, seg(ax, y, z, hl[0], hl[1], 0.085, 0.05), 0.07);
  d = smin(d, seg(ax, y, z, hl[1], hl[2], 0.042, 0.03), 0.04);
  d = smin(d, seg(ax, y, z, hl[2], hl[3], 0.03, 0.034), 0.03);
  d = smin(d, ell(ax, y, z, [hl[3][0], 0.035, hl[3][2] + 0.02], [0.044, 0.034, 0.06]), 0.025);
  // tail
  d = smin(d, seg(ax, y, z, P.tail1, P.tail2, 0.065, 0.075), 0.06);
  d = smin(d, seg(ax, y, z, P.tail2, P.tail3, 0.075, 0.06), 0.03);
  d = smin(d, seg(ax, y, z, P.tail3, P.tail4, 0.06, 0.025), 0.03);
  // eye sockets
  const eye = ell(ax, y, z, [0.055, 1.21, 0.83], [0.018, 0.014, 0.02]);
  d = Math.max(d, -eye);
  return d;
}

/** Surface nets over the SDF. Returns { positions, normals, indices }. */
function meshSDF(fn, min, max, h) {
  const nx = Math.ceil((max[0] - min[0]) / h) + 1;
  const ny = Math.ceil((max[1] - min[1]) / h) + 1;
  const nz = Math.ceil((max[2] - min[2]) / h) + 1;
  const F = new Float32Array(nx * ny * nz);
  const id = (i, j, k) => i + nx * (j + ny * k);
  for (let k = 0; k < nz; k++)
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++) F[id(i, j, k)] = fn(min[0] + i * h, min[1] + j * h, min[2] + k * h);
  const vIndex = new Int32Array(nx * ny * nz).fill(-1);
  const pos = [];
  const corners = [
    [0, 0, 0],
    [1, 0, 0],
    [0, 1, 0],
    [1, 1, 0],
    [0, 0, 1],
    [1, 0, 1],
    [0, 1, 1],
    [1, 1, 1],
  ];
  const edges = [
    [0, 1],
    [2, 3],
    [4, 5],
    [6, 7],
    [0, 2],
    [1, 3],
    [4, 6],
    [5, 7],
    [0, 4],
    [1, 5],
    [2, 6],
    [3, 7],
  ];
  const val = new Float32Array(8);
  for (let k = 0; k < nz - 1; k++)
    for (let j = 0; j < ny - 1; j++)
      for (let i = 0; i < nx - 1; i++) {
        let mask = 0;
        for (let c = 0; c < 8; c++) {
          const [a, b, e] = corners[c];
          val[c] = F[id(i + a, j + b, k + e)];
          if (val[c] < 0) mask |= 1 << c;
        }
        if (mask === 0 || mask === 255) continue;
        let sx = 0, sy = 0, sz = 0, n = 0;
        for (const [a, b] of edges) {
          const va = val[a], vb = val[b];
          if (va < 0 === vb < 0) continue;
          const t = va / (va - vb);
          const ca = corners[a], cb = corners[b];
          sx += ca[0] + (cb[0] - ca[0]) * t;
          sy += ca[1] + (cb[1] - ca[1]) * t;
          sz += ca[2] + (cb[2] - ca[2]) * t;
          n++;
        }
        vIndex[id(i, j, k)] = pos.length / 3;
        pos.push(min[0] + (i + sx / n) * h, min[1] + (j + sy / n) * h, min[2] + (k + sz / n) * h);
      }
  const idx = [];
  for (let k = 1; k < nz - 1; k++)
    for (let j = 1; j < ny - 1; j++)
      for (let i = 1; i < nx - 1; i++) {
        const f0 = F[id(i, j, k)] < 0;
        // x edge
        if (f0 !== F[id(i + 1, j, k)] < 0) {
          const a = vIndex[id(i, j - 1, k - 1)], b = vIndex[id(i, j, k - 1)], c = vIndex[id(i, j, k)], d = vIndex[id(i, j - 1, k)];
          if (a >= 0 && b >= 0 && c >= 0 && d >= 0) f0 ? idx.push(a, b, c, a, c, d) : idx.push(a, c, b, a, d, c);
        }
        if (f0 !== F[id(i, j + 1, k)] < 0) {
          const a = vIndex[id(i - 1, j, k - 1)], b = vIndex[id(i, j, k - 1)], c = vIndex[id(i, j, k)], d = vIndex[id(i - 1, j, k)];
          if (a >= 0 && b >= 0 && c >= 0 && d >= 0) f0 ? idx.push(a, c, b, a, d, c) : idx.push(a, b, c, a, c, d);
        }
        if (f0 !== F[id(i, j, k + 1)] < 0) {
          const a = vIndex[id(i - 1, j - 1, k)], b = vIndex[id(i, j - 1, k)], c = vIndex[id(i, j, k)], d = vIndex[id(i - 1, j, k)];
          if (a >= 0 && b >= 0 && c >= 0 && d >= 0) f0 ? idx.push(a, b, c, a, c, d) : idx.push(a, c, b, a, d, c);
        }
      }
  // normals from the SDF gradient (smoother than face normals)
  const nor = new Float32Array(pos.length);
  const e = h * 0.5;
  for (let v = 0; v < pos.length; v += 3) {
    const x = pos[v], y = pos[v + 1], z = pos[v + 2];
    let gx = fn(x + e, y, z) - fn(x - e, y, z);
    let gy = fn(x, y + e, z) - fn(x, y - e, z);
    let gz = fn(x, y, z + e) - fn(x, y, z - e);
    const l = Math.hypot(gx, gy, gz) || 1;
    nor[v] = gx / l;
    nor[v + 1] = gy / l;
    nor[v + 2] = gz / l;
  }
  return { positions: new Float32Array(pos), normals: nor, indices: idx };
}

/** Project vertices onto the surface (one Newton step) — removes stair-stepping. */
function relax(fn, positions, normals) {
  for (let v = 0; v < positions.length; v += 3) {
    const d = fn(positions[v], positions[v + 1], positions[v + 2]);
    positions[v] -= normals[v] * d;
    positions[v + 1] -= normals[v + 1] * d;
    positions[v + 2] -= normals[v + 2] * d;
  }
}

/* ------------------------------------------------------------------ skinning */
function segDist(p, a, b) {
  const ab = b.clone().sub(a);
  const t = Math.max(0, Math.min(1, p.clone().sub(a).dot(ab) / Math.max(1e-9, ab.lengthSq())));
  return p.distanceTo(a.clone().addScaledVector(ab, t));
}

function skinWeights(positions, boneList) {
  // influence segments: each bone covers the span to its first child (or a stub)
  const restPos = boneList.map(([, , p]) => V(...p));
  const nameIdx = new Map(boneList.map(([n], i) => [n, i]));
  const firstChild = boneList.map(([n]) => boneList.findIndex(([, par]) => par === n));
  const segs = boneList.map((b, i) => {
    const c = firstChild[i];
    if (b[0] === "root") return null;
    if (b[0] === "jaw") return [V(0, 1.085, 0.8), V(0, 1.075, 0.96)];
    if (b[0] === "head") return [V(0, 1.18, 0.7), V(0, 1.14, 0.95)];
    if (/ear/.test(b[0])) return [restPos[i], restPos[i].clone().add(V(0, 0.08, -0.02))];
    if (c < 0) return [restPos[i], restPos[i].clone()];
    return [restPos[i], restPos[c]];
  });
  const n = positions.length / 3;
  const si = new Uint16Array(n * 4);
  const sw = new Float32Array(n * 4);
  const p = V();
  for (let v = 0; v < n; v++) {
    p.set(positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2]);
    const cand = [];
    for (let i = 0; i < segs.length; i++) {
      const s = segs[i];
      if (!s) continue;
      const name = boneList[i][0];
      // keep left/right limbs apart
      if (/L$/.test(name) && p.x < -0.02) continue;
      if (/R$/.test(name) && p.x > 0.02) continue;
      // jaw only takes the lower jaw (below the slit, forward of the cheek)
      if (name === "jaw" && (p.y > 1.105 || p.z < 0.76)) continue;
      if (name === "head" && p.y < 1.1 && p.z > 0.8) continue;
      let d = segDist(p, s[0], s[1]);
      if (/^(hips|spine|chest)$/.test(name)) d *= 0.8;
      cand.push([i, d]);
    }
    cand.sort((a, b) => a[1] - b[1]);
    const top = cand.slice(0, 4);
    let tot = 0;
    const w = top.map(([, d]) => {
      const x = 1 / Math.pow(Math.max(0.01, d), 4);
      tot += x;
      return x;
    });
    for (let k = 0; k < 4; k++) {
      si[v * 4 + k] = top[k] ? top[k][0] : 0;
      sw[v * 4 + k] = top[k] ? w[k] / tot : 0;
    }
  }
  void nameIdx;
  return { si, sw };
}

/* ------------------------------------------------------------------ build */
export async function buildWolf(ctx) {
  const q = ctx.quality || "high";
  const h = q === "high" ? 0.016 : q === "medium" ? 0.021 : 0.028;
  const scale = 1.3;
  const geoData = meshSDF(wolfSDF, [-0.42, -0.02, -1.25], [0.42, 1.48, 1.08], h);
  relax(wolfSDF, geoData.positions, geoData.normals);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(geoData.positions, 3));
  geo.setAttribute("normal", new THREE.BufferAttribute(geoData.normals, 3));
  geo.setIndex(geoData.indices);
  const { si, sw } = skinWeights(geoData.positions, BONES);
  geo.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(si, 4));
  geo.setAttribute("skinWeight", new THREE.Float32BufferAttribute(sw, 4));
  geo.computeBoundingSphere();

  // bones
  const bones = {};
  const list = [];
  for (const [n, par, p] of BONES) {
    const b = new THREE.Bone();
    b.name = n;
    const pp = par ? P[par] : [0, 0, 0];
    b.position.set(p[0] - pp[0], p[1] - pp[1], p[2] - pp[2]);
    if (par) bones[par].add(b);
    bones[n] = b;
    list.push(b);
  }
  const skeleton = new THREE.Skeleton(list);
  const U = creatureUniforms();
  U.uRimColor.value.set(0x6a7ab8);
  U.uRim.value = 0.9;

  const skin = creatureMaterial(
    { color: 0x16161a, roughness: 0.85, metalness: 0 },
    { bump: [40, 0.006, 4], blotch: [0x3a3a44, 5, 0.5], cavity: 0.4 },
    U,
  );
  const root = new THREE.Group();
  const body = new THREE.SkinnedMesh(geo, skin);
  body.castShadow = true;
  body.receiveShadow = true;
  body.frustumCulled = false;
  body.add(bones.root);
  body.bind(skeleton);
  root.add(body);

  // fur shells
  const shells = q === "high" ? 14 : q === "medium" ? 8 : 0;
  const shellMats = [];
  for (let i = 1; i <= shells; i++) {
    const f = i / shells;
    const m = new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(0.66, 0.08, 0.05 + f * 0.13), roughness: 0.95, metalness: 0, side: THREE.FrontSide });
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uF = { value: f };
      sh.uniforms.uTime = U.uTime;
      sh.uniforms.uDissolve = U.uDissolve;
      sh.uniforms.uHit = U.uHit;
      sh.uniforms.uHitColor = U.uHitColor;
      sh.uniforms.uRimColor = U.uRimColor;
      sh.vertexShader = sh.vertexShader
        .replace("#include <common>", "#include <common>\nuniform float uF, uTime;\nvarying vec3 vFP;\nvarying float vFL;")
        .replace(
          "#include <skinning_vertex>",
          `#include <skinning_vertex>
vFP = position; vFL = uF;
float len = 0.034 * (0.6 + 0.6 * smoothstep(0.75, 1.05, position.y) * step(position.z, 0.62)) * (1.0 - 0.6 * step(1.1, position.y) * step(0.62, position.z));
transformed += normalize(objectNormal) * uF * len;
transformed.y -= uF * uF * 0.012;
transformed.x += sin(uTime * 1.3 + position.z * 4.0) * uF * uF * 0.004;`,
        );
      sh.fragmentShader = sh.fragmentShader
        .replace("#include <common>", "#include <common>\nuniform float uF, uDissolve, uHit;\nuniform vec3 uHitColor, uRimColor;\nvarying vec3 vFP;\nvarying float vFL;\nfloat fh(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }")
        .replace(
          "#include <color_fragment>",
          `#include <color_fragment>
vec3 cell = floor(vFP * 190.0);
float strand = fh(cell) * 0.85 + fh(floor(vFP * 60.0)) * 0.15;
if (strand < vFL * 0.95) discard;
if (uDissolve > 0.0 && fh(floor(vFP * 30.0)) < uDissolve * 1.2) discard;
diffuseColor.rgb *= 0.35 + 0.65 * vFL;`,
        )
        .replace(
          "#include <emissivemap_fragment>",
          `#include <emissivemap_fragment>
float rimF = pow(1.0 - clamp(abs(dot(normal, normalize(vViewPosition))), 0.0, 1.0), 2.5);
totalEmissiveRadiance += uRimColor * rimF * 0.9 * vFL + uHitColor * uHit * 0.5;`,
        );
    };
    m.customProgramCacheKey = () => `wolfshell${i}`;
    const sm = new THREE.SkinnedMesh(geo, m);
    sm.bind(skeleton, body.bindMatrix);
    sm.frustumCulled = false;
    sm.castShadow = false;
    sm.receiveShadow = true;
    root.add(sm);
    shellMats.push(m);
  }

  // eyes, teeth
  const glows = [];
  const sp = softSprite();
  for (const s of [1, -1]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.016, 10, 8), eyeMaterial(0xffc040, 9));
    e.position.set(s * 0.055, 1.21 - P.head[1], 0.835 - P.head[2]);
    bones.head.add(e);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: sp, color: 0xffb030, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.9 }));
    halo.scale.setScalar(0.09);
    e.add(halo);
    glows.push(halo);
  }
  const toothMat = creatureMaterial({ color: 0xe8dcc0, roughness: 0.35 }, { blotch: [0x8a7040, 30, 0.6] }, U);
  for (const [bone, y0, dir] of [
    ["head", 1.1, -1],
    ["jaw", 1.11, 1],
  ]) {
    for (let i = 0; i < 7; i++) {
      for (const s of [1, -1]) {
        const big = i === 1;
        const t = new THREE.Mesh(new THREE.ConeGeometry(big ? 0.008 : 0.005, big ? 0.04 : 0.02, 6), toothMat);
        const z = 0.95 - i * 0.022;
        const x = s * (0.018 + i * 0.006);
        t.position.set(x, y0 - P[bone][1] + dir * 0.004, z - P[bone][2]);
        t.rotation.x = dir > 0 ? 0 : Math.PI;
        bones[bone].add(t);
      }
    }
  }
  const eyeLight = new THREE.PointLight(0xffaa30, 0.5, 1.5, 2);
  eyeLight.position.set(0, 1.25 - P.head[1], 0.95 - P.head[2]);
  bones.head.add(eyeLight);

  // shadow smoke drifting off the body
  const smoke = [];
  const smTex = smokeTexture();
  for (let i = 0; i < (q === "low" ? 4 : 9); i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: smTex, color: 0x0a0a12, transparent: true, depthWrite: false, opacity: 0.0 }));
    s.scale.setScalar(0.5);
    root.add(s);
    smoke.push(s);
  }

  root.scale.setScalar(scale);
  const rest = {};
  for (const [n, b] of Object.entries(bones)) rest[n] = { q: b.quaternion.clone(), p: b.position.clone() };

  /* ----- procedural animation */
  const st = { t: Math.random() * 9, act: null, hitV: 0, hit: 0, dead: false, deadT: 0, track: 1, look: new THREE.Quaternion(), stage: 1 };
  const e = new THREE.Euler();
  const qd = new THREE.Quaternion();
  const rot = (n, x, y = 0, z = 0) => {
    e.set(x, y, z);
    bones[n].quaternion.multiply(qd.setFromEuler(e));
  };
  const ease = (x) => x * x * (3 - 2 * x);

  function act(kind) {
    let ri;
    let rd;
    const impact = new Promise((r) => (ri = r));
    const done = new Promise((r) => (rd = r));
    if (st.dead) {
      ri();
      rd();
      return { impact, done };
    }
    const dur = kind === "pounce" ? 2.0 : kind === "howl" ? 2.4 : 1.5;
    const at = kind === "pounce" ? 1.15 : kind === "howl" ? 1.0 : 0.85;
    st.act = { kind, t: 0, dur, at, ri, rd, fired: false };
    return { impact, done };
  }

  function update(dt, camPos) {
    U.uTime.value += dt;
    st.t += dt;
    const t = st.t;
    for (const [n, r] of Object.entries(rest)) {
      bones[n].quaternion.copy(r.q);
      bones[n].position.copy(r.p);
    }
    const breath = Math.sin(t * 2.2);
    let crouch = 0;
    let lunge = 0;
    let lift = 0;
    let jaw = 0.06 + Math.max(0, Math.sin(t * 0.7)) * 0.06; // low snarl
    let headUp = 0;
    let track = 1;
    const A = st.act;
    if (A) {
      A.t += dt;
      const k = A.t;
      track = 0.3;
      if (A.kind === "howl") {
        const u = Math.min(1, k / 0.8);
        const v = k > 1.9 ? Math.max(0, 1 - (k - 1.9) / 0.5) : 1;
        headUp = ease(u) * v * 0.9;
        jaw = 0.06 + ease(u) * v * 0.45;
        crouch = -0.05 * v;
        track = 0;
      } else {
        const pounce = A.kind === "pounce";
        const anticEnd = A.at - 0.18;
        if (k < anticEnd) {
          crouch = ease(Math.min(1, k / anticEnd)) * (pounce ? 0.22 : 0.14);
          jaw = 0.12 + ease(Math.min(1, k / anticEnd)) * 0.2;
        } else if (k < A.at + 0.25) {
          const u = (k - anticEnd) / 0.43;
          lunge = Math.sin(Math.min(1, u) * Math.PI * 0.5) * (pounce ? 1.25 : 0.65);
          lift = pounce ? Math.sin(Math.min(1, u) * Math.PI) * 0.35 : 0;
          crouch = (1 - Math.min(1, u * 2)) * 0.14;
          jaw = k < A.at ? 0.55 : 0.05;
        } else {
          const u = Math.min(1, (k - A.at - 0.25) / (A.dur - A.at - 0.25));
          lunge = (1 - ease(u)) * (pounce ? 1.25 : 0.65);
          jaw = 0.1;
        }
      }
      if (!A.fired && k >= A.at) {
        A.fired = true;
        A.ri();
      }
      if (k >= A.dur) {
        A.rd();
        st.act = null;
      }
    }
    // hit recoil spring
    st.hitV += (-st.hit * 70 - st.hitV * 10) * dt;
    st.hit += st.hitV * dt;
    U.uHit.value = Math.max(0, U.uHit.value - dt * 3);
    if (st.dead) {
      st.deadT += dt;
      const u = ease(Math.min(1, st.deadT / 1.1));
      bones.root.rotation.z = u * 1.35;
      bones.root.position.y = -u * 0.14;
      bones.root.position.x = u * 0.1;
      for (const s of ["L", "R"]) {
        rot(`shoulder${s}`, u * 0.6);
        rot(`thigh${s}`, -u * 0.5);
      }
      rot("neck", u * 0.6);
      rot("head", u * 0.3);
      jaw = 0.25 * u;
      track = 0;
    } else {
      // stance + breathing
      bones.root.position.z = lunge - st.hit * 0.25;
      bones.root.position.y = -crouch * 0.6 + lift;
      rot("hips", -crouch * 0.3);
      rot("chest", breath * 0.015 - crouch * 0.4 + st.hit * 0.3);
      rot("spine", breath * 0.01);
      for (const s of ["L", "R"]) {
        rot(`shoulder${s}`, crouch * 1.2 + lift * 0.8);
        rot(`elbow${s}`, -crouch * 2.0 - lift * 1.4);
        rot(`wrist${s}`, crouch * 0.8);
        rot(`thigh${s}`, -crouch * 1.4 + lift * 0.6);
        rot(`knee${s}`, crouch * 2.2);
        rot(`hock${s}`, -crouch * 1.0);
      }
      rot("neck", -crouch * 1.2 - headUp * 0.9 + st.hit * 0.5);
      rot("head", -headUp * 0.4 + crouch * 0.6);
      // weight shift + ear twitches + tail
      rot("hips", 0, Math.sin(t * 0.45) * 0.03, Math.sin(t * 0.45) * 0.02);
      const tw = Math.max(0, Math.sin(t * 3.3) * Math.sin(t * 0.7) - 0.6) * 1.5;
      rot("earL", -tw * 0.5, 0, 0.2);
      rot("earR", -Math.max(0, Math.sin(t * 2.9 + 1) * Math.sin(t * 0.6) - 0.6) * 0.75, 0, -0.2);
    }
    for (let i = 1; i <= 4; i++) rot(`tail${i}`, 0.1 + (st.dead ? 0.2 : 0), Math.sin(t * 1.5 - i * 0.6) * (0.08 + i * 0.04) * (st.dead ? 0.1 : 1), 0);
    rot("jaw", jaw);
    // head tracking toward the camera
    st.track += (track - st.track) * Math.min(1, dt * 3);
    if (camPos && st.track > 0.01) {
      body.updateMatrixWorld(true);
      const hp = bones.head.getWorldPosition(V());
      const want = camPos.clone().sub(hp).normalize();
      const curQ = bones.head.getWorldQuaternion(new THREE.Quaternion());
      const cur = V(0, 0, 1).applyQuaternion(curQ);
      const qq = new THREE.Quaternion().setFromUnitVectors(cur, want);
      const ang = 2 * Math.acos(Math.min(1, Math.abs(qq.w)));
      if (ang > 0.7) qq.slerp(new THREE.Quaternion(), 1 - 0.7 / ang);
      qq.slerp(new THREE.Quaternion(), 1 - st.track * 0.8);
      st.look.slerp(qq, Math.min(1, dt * 5));
      const parQ = bones.head.parent.getWorldQuaternion(new THREE.Quaternion());
      bones.head.quaternion.copy(parQ.invert().multiply(st.look.clone().multiply(curQ)));
    }
    // smoke
    smoke.forEach((s, i) => {
      const life = (t * 0.35 + i / smoke.length) % 1;
      const a = i * 2.1;
      s.position.set(Math.sin(a) * 0.25, 0.75 + life * 0.7, -0.6 + (i / smoke.length) * 1.4);
      s.scale.setScalar(0.35 + life * 0.6);
      s.material.opacity = Math.sin(life * Math.PI) * 0.5 * (1 - U.uDissolve.value);
      s.material.rotation = a + t * 0.2;
    });
    if (st.dead && st.deadT > 1.3) U.uDissolve.value = Math.min(1, U.uDissolve.value + dt * 0.55);
    for (const g of glows) g.material.opacity = Math.max(0, 0.9 - U.uDissolve.value * 2);
    eyeLight.intensity = Math.max(0, 0.5 - U.uDissolve.value);
  }

  const mon = {
    key: "wolf",
    root,
    U,
    height: 1.4 * scale,
    glows,
    update,
    act: (kind) => act(kind === "bite" || kind === "pounce" || kind === "howl" ? kind : "bite"),
    hit: (p = 1, d = 1) => {
      U.uHit.value = Math.min(1.4, 0.6 + p * 0.5);
      st.hitV += 3 * p * d;
    },
    die: () => {
      st.dead = true;
      st.act?.ri();
      st.act?.rd();
      st.act = null;
      return new Promise((r) => setTimeout(r, 1800));
    },
    setStage: (n) => {
      st.stage = n;
    },
    headPos: (out = V()) => bones.head.getWorldPosition(out),
    chestPos: (out = V()) => bones.chest.getWorldPosition(out),
    handPos: (side, out = V()) => bones.head.getWorldPosition(out),
    dispose: () => {
      geo.dispose();
      skin.dispose();
      skeleton.dispose();
      for (const m of shellMats) m.dispose();
      toothMat.dispose();
      root.traverse((o) => {
        if (o.isMesh && o.geometry !== geo) o.geometry.dispose();
        if (o.isSprite) o.material.dispose();
      });
      root.removeFromParent();
    },
  };
  return mon;
}
