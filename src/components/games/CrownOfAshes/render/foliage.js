/**
 * Foliage: trees (pine, snowy pine, oak, birch, dead), rocks, bushes and a
 * grass field.
 *
 * Trees use two global InstancedMeshes per species part: a detailed "near"
 * set (refilled from the scatter list as the camera moves) and a cheap "far"
 * set holding every tree. Both shaders cut instances on the GPU against the
 * same radius, so the sets never overlap or z-fight. Foliage sways in the
 * wind (phase from the instance position).
 *
 * Grass is a fixed pool of instanced blades wrapped around the camera; the
 * vertex shader reads the heightmap + splat textures to place, thin and
 * colour them (flowers at the tips of a few).
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { surface } from "./textures.js";
import { rng, fbm } from "../engine/math.js";

/* ------------------------------------------------------------ geometry kit */
function jitter(g, amt, seed, yScale = 1) {
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const n = fbm(x * 1.7 + seed, z * 1.7 + y * 0.9, 2, seed) * amt;
    p.setXYZ(i, x * (1 + n), y + n * 0.4 * yScale, z * (1 + n));
  }
  g.computeVertexNormals();
  return g;
}
function colorize(g, fn) {
  const p = g.attributes.position;
  const n = g.attributes.normal;
  const c = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const [r, gg, b] = fn(p.getX(i), p.getY(i), p.getZ(i), n.getY(i));
    c[i * 3] = r;
    c[i * 3 + 1] = gg;
    c[i * 3 + 2] = b;
  }
  g.setAttribute("color", new THREE.BufferAttribute(c, 3));
  return g;
}
const clean = (g) => {
  const ng = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(ng.attributes)) if (!["position", "normal", "uv", "color"].includes(k)) ng.deleteAttribute(k);
  if (!ng.attributes.uv) ng.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(ng.attributes.position.count * 2), 2));
  return ng;
};
function trunk(r0, r1, h, seg = 7) {
  const g = new THREE.CylinderGeometry(r1, r0, h, seg, 3, true);
  g.translate(0, h / 2, 0);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 2, uv.getY(i) * h * 0.4);
  return g;
}
/** One pine tier: a star-shaped drooping skirt (alternating long / short boughs) with an underside. */
function pineTier(r, h, y0, n, droop, seed) {
  const R = rng(seed);
  const pos = [0, y0 + h, 0];
  const uv = [0.5, 1];
  for (let i = 0; i < n * 2; i++) {
    const a = (i / (n * 2)) * Math.PI * 2 + R() * 0.15;
    const long = i % 2 === 0;
    const rr = r * (long ? 1 : 0.6) * (0.9 + R() * 0.2);
    pos.push(Math.cos(a) * rr, y0 - (long ? droop : droop * 0.2) + R() * 0.15, Math.sin(a) * rr);
    uv.push((i / (n * 2)) * 4, 0);
  }
  pos.push(0, y0 + h * 0.22, 0);
  uv.push(0.5, 0.5);
  const under = n * 2 + 1;
  const idx = [];
  for (let i = 0; i < n * 2; i++) {
    const a = 1 + i;
    const b = 1 + ((i + 1) % (n * 2));
    idx.push(0, b, a, under, a, b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
function pineCrown(snow, lod) {
  const parts = [];
  const tiers = lod ? 3 : 6;
  for (let k = 0; k < tiers; k++) {
    const t = k / tiers;
    const r = 3.0 * (1 - t * 0.78);
    const h = (lod ? 3.6 : 2.5) * (1 - t * 0.2);
    const y0 = lod ? 2.4 + k * 2.9 : 2.2 + k * 1.45;
    parts.push(clean(pineTier(r, h, y0, lod ? 5 : 8, 0.55 * (1 - t * 0.5), k * 13 + 7)));
  }
  const m = mergeGeometries(parts);
  return colorize(m, (x, y, z, ny) => {
    const ao = 0.55 + Math.min(1, y / 11) * 0.5;
    if (snow && ny > 0.25) {
      const s = Math.min(1, (ny - 0.25) * 2.2);
      return [ao * (1 - s) + 1.6 * s, ao * (1 - s) + 1.65 * s, ao * (1 - s) + 1.75 * s];
    }
    return [ao, ao * 1.02, ao * 0.95];
  });
}
function blobCrown(n, spread, r, y, seed, lod, tint) {
  const R = rng(seed);
  const parts = [];
  const count = lod ? 1 : n;
  for (let k = 0; k < count; k++) {
    const g = new THREE.IcosahedronGeometry(lod ? r * 1.9 : r * (0.75 + R() * 0.5), lod ? 0 : 1);
    const a = R() * Math.PI * 2;
    const d = lod ? 0 : spread * (0.3 + R() * 0.7);
    g.scale(1, 0.82, 1);
    g.translate(Math.cos(a) * d, y + (lod ? 0 : (R() - 0.3) * spread * 0.8), Math.sin(a) * d);
    if (!lod) jitter(g, 0.22, seed + k * 7);
    parts.push(clean(g));
  }
  const m = mergeGeometries(parts);
  return colorize(m, (x, yy, z, ny) => {
    const ao = 0.5 + Math.max(0, ny) * 0.45 + Math.min(1, (yy - y + r) / (2 * r)) * 0.25;
    return [ao * tint[0], ao * tint[1], ao * tint[2]];
  });
}
/** Bark with a darker base (vertex AO) — every tree part needs a colour attribute. */
const barkAO = (g) => colorize(g, (x, y) => {
  const a = 0.62 + Math.min(1, y / 5) * 0.38;
  return [a, a, a];
});
function branches(count, len, y0, r, seed) {
  const R = rng(seed);
  const parts = [];
  for (let k = 0; k < count; k++) {
    const g = new THREE.CylinderGeometry(r * 0.4, r, len, 5, 1, true);
    g.translate(0, len / 2, 0);
    g.rotateZ(0.6 + R() * 0.5);
    g.rotateY(R() * Math.PI * 2);
    g.translate(0, y0 + R() * 2, 0);
    parts.push(clean(g));
  }
  return parts;
}

const SPECIES = {
  pine: {
    near: () => ({ bark: barkAO(mergeGeometries([clean(trunk(0.32, 0.12, 6))])), crown: pineCrown(false, false) }),
    far: () => ({ bark: barkAO(mergeGeometries([clean(trunk(0.32, 0.12, 4, 4))])), crown: pineCrown(false, true) }),
    crownMat: "needles",
    tint: [0.8, 0.95, 0.8],
  },
  pineSnow: {
    near: () => ({ bark: barkAO(mergeGeometries([clean(trunk(0.32, 0.12, 6))])), crown: pineCrown(true, false) }),
    far: () => ({ bark: barkAO(mergeGeometries([clean(trunk(0.32, 0.12, 4, 4))])), crown: pineCrown(true, true) }),
    crownMat: "needles",
    tint: [0.85, 0.95, 0.9],
  },
  oak: {
    near: () => ({ bark: barkAO(mergeGeometries([clean(trunk(0.55, 0.32, 4.4, 8)), ...branches(5, 2.8, 2.6, 0.22, 5)])), crown: blobCrown(9, 3.0, 2.0, 5.6, 11, false, [0.95, 1, 0.75]) }),
    far: () => ({ bark: barkAO(mergeGeometries([clean(trunk(0.5, 0.3, 4.4, 4))])), crown: blobCrown(1, 0, 2.3, 5.8, 11, true, [0.95, 1, 0.75]) }),
    crownMat: "leaves",
  },
  birch: {
    near: () => ({ bark: barkAO(mergeGeometries([clean(trunk(0.22, 0.1, 8, 7))])), crown: blobCrown(7, 1.5, 1.3, 6.6, 21, false, [1.15, 1.15, 0.6]) }),
    far: () => ({ bark: barkAO(mergeGeometries([clean(trunk(0.22, 0.1, 7, 4))])), crown: blobCrown(1, 0, 1.5, 6.8, 21, true, [1.15, 1.15, 0.6]) }),
    crownMat: "leaves",
    barkMat: "birch",
  },
  dead: {
    near: () => ({ bark: barkAO(mergeGeometries([clean(trunk(0.35, 0.08, 6.5, 6)), ...branches(5, 2.2, 2.5, 0.12, 31)])) }),
    far: () => ({ bark: barkAO(mergeGeometries([clean(trunk(0.35, 0.08, 6.5, 4))])) }),
    barkTint: [0.32, 0.28, 0.26],
  },
};

/* ------------------------------------------------------------ materials */
function windMaterial(base, shared, { near, wind = 1 }) {
  const m = base;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = shared.time;
    sh.uniforms.uCam = shared.camPos;
    sh.uniforms.uCut = shared.treeCut;
    sh.uniforms.uWind = shared.wind;
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float uTime; uniform vec3 uCam; uniform float uCut; uniform float uWind;")
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
  {
    vec3 ip = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
    float d = distance(ip.xz, uCam.xz);
    ${near ? "if (d > uCut) transformed *= 0.0;" : "if (d < uCut) transformed *= 0.0;"}
    float h = max(transformed.y, 0.0);
    float ph = ip.x * 0.31 + ip.z * 0.17;
    float sway = (sin(uTime * 1.3 + ph) * 0.6 + sin(uTime * 2.7 + ph * 1.7) * 0.25) * uWind * ${wind.toFixed(2)};
    transformed.x += sway * h * h * 0.0035;
    transformed.z += sway * h * h * 0.0022;
  }`
      );
  };
  m.customProgramCacheKey = () => `coa-tree-${near ? 1 : 0}-${wind}`;
  return m;
}

export function createFoliage(scene, W, shared, quality) {
  const group = new THREE.Group();
  group.name = "foliage";
  scene.add(group);
  const disposables = [];
  const mats = {};
  const mkMat = (key, kind, wind, near, extra = {}) => {
    const k = `${key}:${near}`;
    if (mats[k]) return mats[k];
    const s = surface(kind);
    const m = windMaterial(new THREE.MeshStandardMaterial({ map: s.map, normalMap: s.normalMap, vertexColors: true, roughness: 0.92, metalness: 0, side: wind ? THREE.DoubleSide : THREE.FrontSide, ...extra }), shared, { near, wind });
    disposables.push(m);
    mats[k] = m;
    return m;
  };
  const bySpecies = {};
  for (const t of W.trees) (bySpecies[t.type] ||= []).push(t);
  const mtx = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const sc = new THREE.Vector3();
  const pos = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const setM = (t) => {
    q.setFromAxisAngle(up, t.rot);
    if (t.lean) q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), t.lean));
    sc.setScalar(t.s);
    pos.set(t.x, t.y - 0.25, t.z);
    return mtx.compose(pos, q, sc);
  };
  const near = [];
  for (const [type, list] of Object.entries(bySpecies)) {
    const S = SPECIES[type];
    const ng = S.near();
    const fg = S.far();
    const parts = [];
    for (const [part, geo] of Object.entries(ng)) {
      const isCrown = part === "crown";
      const mat = isCrown ? mkMat(S.crownMat, S.crownMat, 1, true) : mkMat(S.barkMat || "bark", S.barkMat || "bark", 0.4, true, S.barkTint ? { color: new THREE.Color(...S.barkTint) } : {});
      const im = new THREE.InstancedMesh(geo, mat, Math.min(list.length, 1400));
      im.count = 0;
      im.castShadow = true;
      im.receiveShadow = true;
      im.frustumCulled = false;
      group.add(im);
      disposables.push(geo);
      parts.push(im);
    }
    for (const [part, geo] of Object.entries(fg)) {
      const isCrown = part === "crown";
      const mat = isCrown ? mkMat(S.crownMat, S.crownMat, 1, false) : mkMat(S.barkMat || "bark", S.barkMat || "bark", 0.4, false, S.barkTint ? { color: new THREE.Color(...S.barkTint) } : {});
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      list.forEach((t, i) => im.setMatrixAt(i, setM(t)));
      im.instanceMatrix.needsUpdate = true;
      im.frustumCulled = false;
      im.receiveShadow = true;
      group.add(im);
      disposables.push(geo);
    }
    near.push({ list, parts });
  }

  /* ------------------------------------------------------------ rocks */
  const rockGeos = [0, 1].map((k) => {
    const g = new THREE.IcosahedronGeometry(1, 1);
    jitter(g, 0.35, 50 + k * 9);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setY(i, Math.max(-0.35, p.getY(i)) * (k ? 0.65 : 0.85));
    g.computeVertexNormals();
    disposables.push(g);
    return g;
  });
  const rs = surface("rock");
  const rockMat = new THREE.MeshStandardMaterial({ map: rs.map, normalMap: rs.normalMap, roughness: 0.9, color: 0xc8c4bc });
  rockMat.onBeforeCompile = (sh) => {
    sh.uniforms.uCam = shared.camPos;
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float aSnow; varying float vSnow; varying vec3 vWN;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvSnow = aSnow; vWN = normalize(mat3(modelMatrix * instanceMatrix) * objectNormal);");
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying float vSnow; varying vec3 vWN;")
      .replace("#include <map_fragment>", "#include <map_fragment>\n  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.92, 0.95, 1.0), vSnow * smoothstep(0.35, 0.7, vWN.y));");
  };
  disposables.push(rockMat);
  [0, 1].forEach((k) => {
    const list = W.rocks.filter((r) => r.kind === k);
    const im = new THREE.InstancedMesh(rockGeos[k], rockMat, list.length);
    const snow = new Float32Array(list.length);
    list.forEach((r, i) => {
      q.setFromEuler(new THREE.Euler(r.rot * 0.3, r.rot, r.rot * 0.2));
      sc.set(r.s * 1.2, r.s, r.s);
      pos.set(r.x, r.y - r.s * 0.15, r.z);
      im.setMatrixAt(i, mtx.compose(pos, q, sc));
      snow[i] = r.snow;
      im.setColorAt(i, new THREE.Color().setHSL(0.08, 0.06 + r.ash * 0.02, 0.5 - r.ash * 0.25 + (i % 7) * 0.02));
    });
    im.geometry = im.geometry.clone();
    im.geometry.setAttribute("aSnow", new THREE.InstancedBufferAttribute(snow, 1));
    disposables.push(im.geometry);
    im.castShadow = quality === "high";
    im.receiveShadow = true;
    im.frustumCulled = false;
    group.add(im);
  });

  /* ------------------------------------------------------------ bushes (render only) */
  const bushes = [];
  {
    const R = rng(777);
    const T = W.T;
    for (let k = 0; k < 9000; k++) {
      const x = (R() - 0.5) * 2 * 420;
      const z = (R() - 0.5) * 2 * 420;
      const f = T.mask("forest", x, z);
      if (R() > 0.12 + f * 0.7) continue;
      if (T.mask("road", x, z) > 0.05 || T.mask("snow", x, z) > 0.6 || T.mask("ash", x, z) > 0.5 || T.waterAt(x, z) > -1e8 || T.mask("field", x, z) > 0 || T.slope(x, z) > 0.6) continue;
      if (W.col.blockedAt(x, z, 1.2, T.height(x, z))) continue;
      bushes.push({ x, y: T.height(x, z), z, s: 0.6 + R() * 0.8, rot: R() * 6.28, type: R() < 0.55 ? "bush" : "fern" });
    }
  }
  const bushGeo = blobCrown(3, 0.6, 0.65, 0.45, 99, false, [0.8, 1, 0.7]);
  const fernGeo = (() => {
    const parts = [];
    for (let k = 0; k < 7; k++) {
      const g = new THREE.PlaneGeometry(0.35, 1.2, 1, 3);
      g.translate(0, 0.6, 0);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const y = p.getY(i);
        p.setZ(i, y * y * 0.35);
      }
      g.rotateX(-0.5);
      g.rotateY((k / 7) * Math.PI * 2);
      parts.push(clean(g));
    }
    const m = mergeGeometries(parts);
    m.computeVertexNormals();
    return colorize(m, (x, y) => [0.45 + y * 0.3, 0.75 + y * 0.25, 0.35]);
  })();
  disposables.push(bushGeo, fernGeo);
  const bushSets = [
    { geo: bushGeo, mat: mkMat("leaves", "leaves", 0.7, true), list: bushes.filter((b) => b.type === "bush") },
    { geo: fernGeo, mat: mkMat("needlesFern", "needles", 0.9, true), list: bushes.filter((b) => b.type === "fern") },
  ].map((B) => {
    const im = new THREE.InstancedMesh(B.geo, B.mat, Math.min(1600, B.list.length));
    im.count = 0;
    im.frustumCulled = false;
    im.receiveShadow = true;
    im.castShadow = false;
    group.add(im);
    return { ...B, im };
  });

  /* ------------------------------------------------------------ grass */
  const grassCount = { low: 5000, medium: 14000, high: 30000 }[quality] || 14000;
  const GR = quality === "high" ? 34 : 26;
  const blade = (() => {
    const segs = 3;
    const posA = [];
    const uvA = [];
    const idx = [];
    for (let s = 0; s <= segs; s++) {
      const t = s / segs;
      const w = 0.04 * (1 - t * 0.9);
      posA.push(-w, t, 0, w, t, 0);
      uvA.push(0, t, 1, t);
    }
    for (let s = 0; s < segs; s++) {
      const a = s * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(posA, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uvA, 2));
    g.setIndex(idx);
    const off = new Float32Array(grassCount * 4);
    const R = rng(4242);
    for (let i = 0; i < grassCount; i++) {
      off[i * 4] = (R() * 2 - 1) * GR;
      off[i * 4 + 1] = (R() * 2 - 1) * GR;
      off[i * 4 + 2] = R();
      off[i * 4 + 3] = R() * Math.PI * 2;
    }
    g.setAttribute("aOff", new THREE.InstancedBufferAttribute(off, 4));
    g.instanceCount = grassCount;
    return g;
  })();
  disposables.push(blade);
  const grassMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, side: THREE.DoubleSide });
  const gu = {
    uTime: shared.time,
    uCam: shared.camPos,
    uWind: shared.wind,
    uHeight: { value: shared.heightTex },
    uSplatA: { value: shared.splatA },
    uSplatB: { value: shared.splatB },
    uHalf: { value: W.T.half },
    uR: { value: GR },
  };
  grassMat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, gu);
    sh.vertexShader = sh.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
attribute vec4 aOff; uniform float uTime; uniform vec3 uCam; uniform float uWind; uniform sampler2D uHeight; uniform sampler2D uSplatA; uniform sampler2D uSplatB; uniform float uHalf; uniform float uR;
varying float vTip; varying vec3 vGC;`
      )
      .replace(
        "#include <begin_vertex>",
        `vec3 transformed = vec3(position);
  {
    vec2 w = uCam.xz + mod(aOff.xy - uCam.xz + uR, 2.0 * uR) - uR;
    vec2 suv = (w + uHalf) / (2.0 * uHalf);
    float hgt = texture2D(uHeight, suv).r;
    float hx = texture2D(uHeight, suv + vec2(1.5 / 513.0, 0.0)).r - texture2D(uHeight, suv - vec2(1.5 / 513.0, 0.0)).r;
    float hz = texture2D(uHeight, suv + vec2(0.0, 1.5 / 513.0)).r - texture2D(uHeight, suv - vec2(0.0, 1.5 / 513.0)).r;
    float slope = length(vec2(hx, hz)) / 6.0;
    vec4 sa = texture2D(uSplatA, suv);
    vec4 sb = texture2D(uSplatB, suv);
    float dens = (1.0 - smoothstep(0.1, 0.5, sa.r)) * (1.0 - smoothstep(0.2, 0.5, sa.g)) * (1.0 - smoothstep(0.3, 0.6, sa.b)) * (1.0 - sb.r) * (1.0 - smoothstep(0.3, 0.8, sb.g)) * (1.0 - smoothstep(0.35, 0.55, slope)) * (1.0 - sa.a * 0.8);
    float d = distance(w, uCam.xz);
    float fade = 1.0 - smoothstep(uR * 0.6, uR, d);
    float keep = step(aOff.z, dens) * fade;
    float tall = (0.3 + aOff.z * 0.42) * keep;
    float c = cos(aOff.w); float s = sin(aOff.w);
    vec3 p = vec3(position.x * c, position.y * tall, position.x * s);
    float ph = w.x * 0.21 + w.y * 0.33;
    float bend = (sin(uTime * 1.9 + ph) * 0.5 + sin(uTime * 3.7 + ph * 2.1) * 0.2 + 0.2) * uWind * position.y * position.y * tall;
    p.x += bend * 0.35; p.z += bend * 0.2;
    transformed = vec3(w.x, hgt - 0.05, w.y) + p;
    vTip = position.y;
    float hue = fract(sin(dot(w, vec2(12.9898, 78.233))) * 43758.5453);
    vGC = mix(vec3(0.17, 0.3, 0.07), vec3(0.42, 0.48, 0.16), hue * 0.8) * mix(1.0, 0.8, sa.a);
    if (hue > 0.985) vGC = mix(vec3(0.9, 0.85, 0.3), vec3(0.75, 0.3, 0.6), fract(hue * 97.0));
  }`
      )
      .replace("#include <beginnormal_vertex>", "vec3 objectNormal = vec3(0.0, 1.0, 0.0);")
      .replace("#include <project_vertex>", "vec4 mvPosition = viewMatrix * vec4(transformed, 1.0); gl_Position = projectionMatrix * mvPosition;")
      .replace("#include <worldpos_vertex>", "vec4 worldPosition = vec4(transformed, 1.0);");
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying float vTip; varying vec3 vGC;")
      .replace("#include <map_fragment>", "diffuseColor.rgb = vGC * (0.5 + vTip * 0.8);")
      .replace("#include <normal_fragment_begin>", "float faceDirection = 1.0; vec3 normal = normalize(vNormal); vec3 nonPerturbedNormal = normal;");
  };
  grassMat.customProgramCacheKey = () => "coa-grass";
  disposables.push(grassMat);
  const grass = new THREE.Mesh(blade, grassMat);
  grass.frustumCulled = false;
  grass.receiveShadow = true;
  group.add(grass);

  /* ------------------------------------------------------------ update */
  let lastX = 1e9;
  let lastZ = 1e9;
  let cut = 95;
  function refill(cx, cz) {
    const R2 = (cut + 25) ** 2;
    for (const S of near) {
      let n = 0;
      const cap = S.parts[0]?.instanceMatrix.count ?? 0;
      for (const t of S.list) {
        if ((t.x - cx) ** 2 + (t.z - cz) ** 2 > R2 || n >= cap) continue;
        setM(t);
        for (const im of S.parts) im.setMatrixAt(n, mtx);
        n++;
      }
      for (const im of S.parts) {
        im.count = n;
        im.instanceMatrix.needsUpdate = true;
      }
    }
    const BR2 = 50 * 50;
    for (const B of bushSets) {
      let n = 0;
      const cap = B.im.instanceMatrix.count;
      for (const b of B.list) {
        if ((b.x - cx) ** 2 + (b.z - cz) ** 2 > BR2 || n >= cap) continue;
        q.setFromAxisAngle(up, b.rot);
        sc.setScalar(b.s);
        pos.set(b.x, b.y - 0.1, b.z);
        B.im.setMatrixAt(n++, mtx.compose(pos, q, sc));
      }
      B.im.count = n;
      B.im.instanceMatrix.needsUpdate = true;
    }
  }
  return {
    group,
    update(cam, interior) {
      group.visible = !interior;
      if (interior) return;
      if (Math.hypot(cam.x - lastX, cam.z - lastZ) > 12) {
        lastX = cam.x;
        lastZ = cam.z;
        refill(cam.x, cam.z);
      }
    },
    setQuality(qq) {
      cut = qq === "low" ? 45 : qq === "high" ? 110 : 70;
      for (const S of near) for (const im of S.parts) im.castShadow = qq !== "low";
      shared.treeCut.value = cut;
      lastX = 1e9;
    },
    dispose() {
      scene.remove(group);
      disposables.forEach((d) => d.dispose());
    },
  };
}
