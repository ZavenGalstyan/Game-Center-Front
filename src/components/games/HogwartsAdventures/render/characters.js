/**
 * Humanoid characters: a clone of the CC0 Quaternius body, dressed in code.
 * Adapted from Crown of Ashes for wizards: school robes (skinned robe shell
 * + a long hinged cloak), house scarves and ties, glasses, pointed hats,
 * beards, Death Eater hoods and masks, and wands.
 *
 *  • Garb shader — the body material is extended so torso/arms read as a
 *    cloth tunic, legs as hose, feet as leather boots (regions decided from
 *    the un-skinned bind position), with embroidered hems. Variants: undead
 *    (bone-grey skin with rot and glowing eyes), corrupted (ember cracks),
 *    hit flash and a burn-away dissolve on death.
 *  • Garments — skinned shells of the body's own triangles (tunic, robe,
 *    gambeson, hose) bound to the same skeleton so they deform with it.
 *  • Gear — helmets, plate, pauldrons, bracers, greaves, belts, capes,
 *    quivers, shields and weapons: procedural meshes parented to bones.
 *  • Animator — three layers (lower, upper, full-body one-shots) blended by
 *    weight; one-shots can be scrubbed by sim time so swings land on the
 *    frame the simulation applies the hit.
 */
import * as THREE from "three";
import { clone as skClone } from "three/examples/jsm/utils/SkeletonUtils.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { LOOP_CLIPS } from "./assets.js";

const BIND = {
  m: { neck: 1.535, wrist: 0.69 },
  f: { neck: 1.5, wrist: 0.625 },
};

/* ================================================================ scarf stripes */
const STRIPES = new Map();
function stripeTex(a, b, diagonal = false) {
  const key = `${a}|${b}|${diagonal}`;
  if (STRIPES.has(key)) return STRIPES.get(key);
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d");
  g.fillStyle = a;
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = b;
  if (diagonal) {
    g.save();
    g.translate(32, 32);
    g.rotate(-0.6);
    for (let y = -64; y < 64; y += 16) g.fillRect(-64, y, 128, 5);
    g.restore();
  } else for (let y = 0; y < 64; y += 16) g.fillRect(0, y, 64, 7);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  STRIPES.set(key, t);
  return t;
}

/* ================================================================ body material */
function garbMaterial(src, look, assets, body) {
  const m = src.clone();
  if (look.skin === "dark") m.map = assets.dark[body];
  m.color = new THREE.Color(look.skinTint || (look.skin === "pale" ? "#e8dcd4" : look.skin === "tan" ? "#e0b896" : "#ffffff"));
  m.metalness = 0;
  m.roughness = 1;
  m.envMapIntensity = 0.5;
  m.normalScale = new THREE.Vector2(0.7, 0.7);
  const B = BIND[body];
  const u = {
    uTunic: { value: new THREE.Color(look.tunic || "#5a4a3a") },
    uHose: { value: new THREE.Color(look.hose || "#3a3028") },
    uBoot: { value: new THREE.Color(look.boots || "#3a2618") },
    uTrim: { value: new THREE.Color(look.trim || "#c9a050") },
    uNeck: { value: B.neck },
    uWrist: { value: look.gloves ? 0.55 : B.wrist },
    uUndead: { value: look.undead ? 1 : 0 },
    uCorrupt: { value: look.corrupt ? 1 : 0 },
    uEye: { value: new THREE.Color(look.eyes || (look.undead ? "#5fd8ff" : "#ff5a1a")) },
    uHit: { value: 0 },
    uDissolve: { value: 0 },
    uTime: { value: 0 },
    uStealth: { value: 0 },
    uEyeGlow: { value: look.eyeGlow ? 1 : 0 },
  };
  m.userData.u = u;
  m.transparent = false;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vBind;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvBind = position;");
    sh.fragmentShader = sh.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
varying vec3 vBind;
uniform vec3 uTunic; uniform vec3 uHose; uniform vec3 uBoot; uniform vec3 uTrim; uniform vec3 uEye;
uniform float uNeck; uniform float uWrist; uniform float uUndead; uniform float uCorrupt; uniform float uHit; uniform float uDissolve; uniform float uTime; uniform float uStealth; uniform float uEyeGlow;
float clothMask = 0.0; float trimMask = 0.0; float eyeMask = 0.0; float crack = 0.0;
float gl1(float v, float at, float w) { return 1.0 - smoothstep(0.0, w, abs(v - at)); }
float h3(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
float n3(vec3 p) { vec3 i = floor(p); vec3 f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(mix(h3(i), h3(i+vec3(1,0,0)), f.x), mix(h3(i+vec3(0,1,0)), h3(i+vec3(1,1,0)), f.x), f.y),
             mix(mix(h3(i+vec3(0,0,1)), h3(i+vec3(1,0,1)), f.x), mix(h3(i+vec3(0,1,1)), h3(i+vec3(1,1,1)), f.x), f.y), f.z); }`
      )
      .replace(
        "#include <map_fragment>",
        `#include <map_fragment>
  {
    vec3 b = vBind;
    float ax = abs(b.x);
    clothMask = step(b.y, uNeck) * step(ax, uWrist);
    float upper = smoothstep(0.93, 0.99, b.y);
    float boot = 1.0 - smoothstep(0.3, 0.34, b.y);
    vec3 cloth = mix(uHose, uTunic, upper);
    cloth = mix(cloth, uBoot, boot);
    // weave + seams
    float weave = (sin(b.x * 420.0) * sin(b.y * 420.0)) * 0.04;
    float seam = max(gl1(b.y, 0.97, 0.01), gl1(ax, 0.11, 0.005) * step(b.y, 0.93) * step(0.34, b.y));
    // embroidered hems: collar, cuffs, tunic hem
    trimMask = gl1(b.y, uNeck - 0.035, 0.012) + gl1(ax, uWrist - 0.03, 0.01) * step(1.25, b.y) + gl1(b.y, 0.95, 0.008);
    float lum = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
    vec3 garb = cloth * (0.8 + 0.4 * lum + weave) * (1.0 - seam * 0.5);
    garb = mix(garb, uTrim, clamp(trimMask, 0.0, 1.0) * 0.8 * (1.0 - boot));
    diffuseColor.rgb = mix(diffuseColor.rgb, garb, clothMask);
    if (uUndead > 0.5) {
      float rot = n3(b * 18.0);
      vec3 bone = mix(vec3(0.42, 0.44, 0.38), vec3(0.72, 0.7, 0.6), rot);
      bone *= 0.7 + 0.3 * n3(b * 60.0);
      float holes = smoothstep(0.62, 0.7, n3(b * 9.0 + 3.0));
      diffuseColor.rgb = mix(mix(bone, diffuseColor.rgb * 0.5, clothMask * 0.65), vec3(0.04, 0.04, 0.03), holes * 0.8);
    }
    // eyes (head front, two spots) glow for undead / corrupted
    float hy = b.y - (uNeck + 0.13);
    eyeMask = (smoothstep(0.022, 0.0, length(vec2(abs(b.x) - 0.032, hy))) * step(0.06, b.z)) * max(max(uUndead, uCorrupt), uEyeGlow);
    if (uCorrupt > 0.5) {
      float c = n3(b * 22.0 + vec3(0.0, uTime * 0.2, 0.0));
      crack = smoothstep(0.47, 0.5, c) * smoothstep(0.53, 0.5, c);
      diffuseColor.rgb *= 0.7;
    }
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0, 0.3, 0.25), uHit * 0.55);
    // dissolve (death)
    if (uDissolve > 0.0) {
      float d = n3(b * 14.0) * 0.8 + (1.0 - b.y / 1.8) * 0.2;
      if (d < uDissolve) discard;
      crack = max(crack, smoothstep(uDissolve + 0.06, uDissolve, d));
    }
  }`
      )
      .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\n  roughnessFactor = mix(roughnessFactor, 0.92, clothMask);")
      .replace("#include <metalnessmap_fragment>", "#include <metalnessmap_fragment>\n  metalnessFactor = 0.0;")
      .replace(
        "#include <normal_fragment_maps>",
        `vec3 baseN = normal;
#include <normal_fragment_maps>
  normal = normalize(mix(normal, baseN, clothMask * 0.7));`
      )
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
  totalEmissiveRadiance += uEye * eyeMask * 4.0;
  totalEmissiveRadiance += vec3(1.0, 0.35, 0.08) * crack * 2.4;
  totalEmissiveRadiance += vec3(1.0, 0.3, 0.2) * uHit * 0.6;`
      )
      .replace("#include <dithering_fragment>", "#include <dithering_fragment>\n  if (uStealth > 0.0) { gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.25, 0.2, 0.35), uStealth * 0.7); gl_FragColor.a = 1.0 - uStealth * 0.6; }");
  };
  m.customProgramCacheKey = () => "hwa-garb";
  return m;
}

/* ================================================================ garments */
const GARMENT_GEO = new Map();
function garmentGeometry(src, body, kind) {
  const key = `${body}:${kind}`;
  if (GARMENT_GEO.has(key)) return GARMENT_GEO.get(key);
  const B = BIND[body];
  const pos = src.attributes.position;
  const idx = src.index;
  const R = {
    gambeson: (x, y) => y > 0.86 && y < B.neck - 0.004 && Math.abs(x) < B.wrist - 0.16,
    tunic: (x, y) => y > 0.52 && y < B.neck - 0.004 && Math.abs(x) < B.wrist - 0.13,
    robe: (x, y) => y > 0.08 && y < B.neck - 0.004 && Math.abs(x) < B.wrist - 0.1,
    hose: (x, y) => y > 0.3 && y < 1.0 && Math.abs(x) < 0.3,
  }[kind];
  const off = { gambeson: 0.024, tunic: 0.022, robe: 0.024, hose: 0.01 }[kind];
  const map = new Int32Array(pos.count).fill(-1);
  const keep = [];
  const tri = [];
  const inR = (i) => R(pos.getX(i), pos.getY(i));
  for (let t = 0; t < idx.count; t += 3) {
    const a = idx.getX(t);
    const b = idx.getX(t + 1);
    const c = idx.getX(t + 2);
    if (!inR(a) || !inR(b) || !inR(c)) continue;
    for (const v of [a, b, c]) {
      if (map[v] < 0) {
        map[v] = keep.length;
        keep.push(v);
      }
      tri.push(map[v]);
    }
  }
  const g = new THREE.BufferGeometry();
  for (const [name, attr] of Object.entries(src.attributes)) {
    const n = attr.itemSize;
    const Arr = attr.array.constructor;
    const out = new Arr(keep.length * n);
    keep.forEach((v, i) => {
      for (let k = 0; k < n; k++) out[i * n + k] = attr.array[v * n + k];
    });
    g.setAttribute(name, new THREE.BufferAttribute(out, n, attr.normalized));
  }
  const p = g.attributes.position;
  const nn = g.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    const flare = kind === "robe" ? Math.max(0, 0.95 - y) * 0.16 : kind === "tunic" ? Math.max(0, 0.95 - y) * 0.12 : kind === "gambeson" ? Math.max(0, 1.0 - y) * 0.06 : 0;
    p.setXYZ(i, p.getX(i) + nn.getX(i) * (off + flare), y + nn.getY(i) * off, p.getZ(i) + nn.getZ(i) * (off + flare));
  }
  g.setIndex(tri);
  g.computeBoundingSphere();
  GARMENT_GEO.set(key, g);
  return g;
}
function garmentMaterial(look, kind) {
  const col = kind === "hose" ? look.hose || "#3a3028" : kind === "gambeson" ? look.gambeson || look.tunic || "#6a5a44" : look.robe || look.tunic || "#5a4a3a";
  const m = new THREE.MeshStandardMaterial({ color: new THREE.Color(col), roughness: 0.9, metalness: 0.0, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const u = { uTrim: { value: new THREE.Color(look.trim || "#c9a050") }, uKind: { value: { gambeson: 0, tunic: 1, robe: 2, hose: 3 }[kind] }, uHit: { value: 0 }, uDissolve: { value: 0 }, uRune: { value: look.runes ? 1 : 0 }, uTime: { value: 0 } };
  m.userData.u = u;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vG;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvG = position;");
    sh.fragmentShader = sh.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
varying vec3 vG; uniform vec3 uTrim; uniform float uKind; uniform float uHit; uniform float uDissolve; uniform float uRune; uniform float uTime; float gTrim = 0.0; float gRune = 0.0;
float g1(float v, float a, float w) { return 1.0 - smoothstep(0.0, w, abs(v - a)); }
float gh(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }`
      )
      .replace(
        "#include <map_fragment>",
        `#include <map_fragment>
  {
    float ax = abs(vG.x);
    float seam = 0.0;
    float weave = sin(vG.x * 380.0) * sin(vG.y * 380.0) * 0.05;
    if (uKind < 2.5) {
      // centre seam, belt line, hem band, cuffs
      gTrim = g1(vG.x, 0.0, 0.008) * step(0.0, vG.z) * step(0.9, vG.y) * 0.8;
      float hemY = uKind < 0.5 ? 0.88 : uKind < 1.5 ? 0.55 : 0.12;
      gTrim = max(gTrim, step(vG.y, hemY + 0.05) * step(hemY, vG.y));
      gTrim = max(gTrim, g1(ax, 0.5, 0.015) * step(1.3, vG.y));
      seam = g1(vG.y, 0.98, 0.01);
      if (uKind < 0.5) seam = max(seam, step(0.5, fract(vG.y * 18.0)) * 0.25); // quilting
      if (uRune > 0.5) gRune = g1(fract(vG.y * 6.0), 0.5, 0.04) * step(1.0, vG.y) * step(vG.y, 1.42) * step(0.0, vG.z) * step(ax, 0.16);
    } else {
      seam = max(g1(vG.y, 0.52, 0.01), g1(ax, 0.12, 0.006));
    }
    diffuseColor.rgb *= (1.0 - seam * 0.4 + weave);
    diffuseColor.rgb = mix(diffuseColor.rgb, uTrim, gTrim * 0.85);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0, 0.3, 0.25), uHit * 0.5);
    if (uDissolve > 0.0 && gh(floor(vG * 70.0)) * 0.8 + (1.0 - vG.y / 1.8) * 0.2 < uDissolve) discard;
  }`
      )
      .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\n  totalEmissiveRadiance += uTrim * gRune * (1.2 + 0.6 * sin(uTime * 3.0));");
  };
  m.customProgramCacheKey = () => "hwa-garment";
  return m;
}

/* ================================================================ gear geometry */
const G = {};
function rb(w, h, d, r = 0.02, s = 2) {
  const shape = new THREE.Shape();
  const x = w / 2 - r;
  const y = h / 2 - r;
  shape.moveTo(-x, -h / 2);
  shape.lineTo(x, -h / 2);
  shape.quadraticCurveTo(w / 2, -h / 2, w / 2, -y);
  shape.lineTo(w / 2, y);
  shape.quadraticCurveTo(w / 2, h / 2, x, h / 2);
  shape.lineTo(-x, h / 2);
  shape.quadraticCurveTo(-w / 2, h / 2, -w / 2, y);
  shape.lineTo(-w / 2, -y);
  shape.quadraticCurveTo(-w / 2, -h / 2, -x, -h / 2);
  const e = new THREE.ExtrudeGeometry(shape, { depth: Math.max(0.001, d - r * 2), bevelEnabled: true, bevelSize: r, bevelThickness: r, bevelSegments: s, curveSegments: 3 });
  e.translate(0, 0, -(d - r * 2) / 2);
  e.computeVertexNormals();
  return e;
}
function geo(k) {
  if (G[k]) return G[k];
  let g;
  switch (k) {
    case "breast": {
      // curved breastplate: a squashed half-capsule
      g = new THREE.SphereGeometry(0.2, 18, 12, -Math.PI * 0.5, Math.PI, 0, Math.PI * 0.75);
      g.scale(0.95, 1.25, 0.6);
      g.rotateY(Math.PI);
      break;
    }
    case "backplate": {
      g = new THREE.SphereGeometry(0.19, 16, 10, Math.PI * 0.5, Math.PI, 0, Math.PI * 0.72);
      g.scale(0.95, 1.2, 0.5);
      g.rotateY(Math.PI);
      break;
    }
    case "fauld": {
      g = new THREE.CylinderGeometry(0.175, 0.21, 0.13, 18, 1, true);
      break;
    }
    case "pauldron": {
      g = new THREE.SphereGeometry(0.11, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2);
      g.scale(1, 0.75, 1.15);
      break;
    }
    case "pauldronBig": {
      const a = new THREE.SphereGeometry(0.14, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2);
      a.scale(1, 0.75, 1.2);
      const b = new THREE.SphereGeometry(0.12, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2);
      b.scale(1, 0.7, 1.15);
      b.translate(0, -0.05, 0);
      g = mergeGeometries([a, b]);
      break;
    }
    case "fur": {
      g = new THREE.IcosahedronGeometry(0.15, 1);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const f = 1 + Math.sin(i * 12.9898) * 0.18;
        p.setXYZ(i, p.getX(i) * f * 1.3, p.getY(i) * f * 0.7, p.getZ(i) * f);
      }
      g.computeVertexNormals();
      break;
    }
    case "spike":
      g = new THREE.ConeGeometry(0.025, 0.12, 6);
      break;
    case "bracer":
      g = new THREE.CylinderGeometry(0.05, 0.044, 0.2, 12);
      break;
    case "gauntlet": {
      const a = new THREE.CylinderGeometry(0.058, 0.05, 0.12, 12);
      a.translate(0, 0.02, 0);
      g = a;
      break;
    }
    case "greave":
      g = rb(0.11, 0.26, 0.07, 0.025);
      break;
    case "knee": {
      g = new THREE.SphereGeometry(0.065, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);
      g.scale(1, 0.6, 1);
      break;
    }
    case "boot":
      g = rb(0.092, 0.085, 0.215, 0.03);
      break;
    case "skirt": {
      g = new THREE.CylinderGeometry(0.19, 0.36, 0.86, 22, 3, true);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const a = Math.atan2(p.getZ(i), p.getX(i));
        const y = p.getY(i);
        const f = 1 + Math.sin(a * 7) * 0.05 * (0.43 - y);
        p.setX(i, p.getX(i) * f);
        p.setZ(i, p.getZ(i) * f);
      }
      g.translate(0, -0.43, 0);
      g.computeVertexNormals();
      break;
    }
    case "skirtShort": {
      g = new THREE.CylinderGeometry(0.19, 0.27, 0.36, 20, 1, true);
      g.translate(0, -0.18, 0);
      break;
    }
    case "belt": {
      g = new THREE.TorusGeometry(0.16, 0.022, 6, 28);
      g.scale(1, 0.74, 1);
      break;
    }
    case "buckle":
      g = rb(0.06, 0.05, 0.02, 0.008);
      break;
    case "pouch":
      g = rb(0.08, 0.09, 0.05, 0.015);
      break;
    case "gorget":
      g = new THREE.CylinderGeometry(0.075, 0.11, 0.09, 16, 1, true);
      break;
    case "collarFur": {
      g = new THREE.TorusGeometry(0.13, 0.055, 8, 18);
      g.rotateX(Math.PI / 2);
      g.scale(1.1, 1, 0.95);
      break;
    }
    case "helmNasal": {
      const a = new THREE.SphereGeometry(0.13, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.55);
      a.scale(1, 1.15, 1.12);
      const b = new THREE.BoxGeometry(0.022, 0.1, 0.02);
      b.translate(0, -0.02, 0.145);
      const c = new THREE.TorusGeometry(0.133, 0.012, 5, 24);
      c.rotateX(Math.PI / 2);
      c.scale(1, 1, 1.12);
      c.translate(0, 0.02, 0);
      g = mergeGeometries([a, b, c].map((x) => x.toNonIndexed()));
      break;
    }
    case "helmGreat": {
      const a = new THREE.CylinderGeometry(0.135, 0.14, 0.27, 18);
      const top = new THREE.SphereGeometry(0.135, 18, 6, 0, Math.PI * 2, 0, Math.PI * 0.3);
      top.scale(1, 0.6, 1);
      top.translate(0, 0.13, 0);
      g = mergeGeometries([a, top].map((x) => x.toNonIndexed()));
      g.scale(1, 1, 1.12);
      break;
    }
    case "visorSlit":
      g = new THREE.BoxGeometry(0.2, 0.018, 0.04);
      break;
    case "hood": {
      g = new THREE.SphereGeometry(0.16, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.68);
      g.scale(1, 1.18, 1.18);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) if (p.getZ(i) > 0.06 && p.getY(i) < 0.08) p.setZ(i, 0.06 + (p.getZ(i) - 0.06) * 0.25); // open face
      g.computeVertexNormals();
      break;
    }
    case "hoodPoint":
      g = new THREE.ConeGeometry(0.09, 0.2, 10);
      break;
    case "circlet": {
      g = new THREE.TorusGeometry(0.115, 0.01, 6, 28);
      g.rotateX(Math.PI / 2);
      g.scale(1, 1, 1.1);
      break;
    }
    case "crownPoint":
      g = new THREE.ConeGeometry(0.018, 0.07, 4);
      break;
    case "horn": {
      const pts = [];
      for (let i = 0; i <= 8; i++) pts.push(new THREE.Vector2(0.035 * (1 - i / 8) + 0.002, i * 0.03));
      g = new THREE.LatheGeometry(pts, 8);
      g.rotateZ(-0.5);
      break;
    }
    case "capeSeg": {
      g = new THREE.PlaneGeometry(0.4, 0.34, 4, 2);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) p.setZ(i, -Math.abs(p.getX(i)) * 0.18); // drape around the back
      g.computeVertexNormals();
      break;
    }
    case "quiver": {
      const a = new THREE.CylinderGeometry(0.07, 0.06, 0.62, 10);
      const parts = [a.toNonIndexed()];
      for (let i = 0; i < 6; i++) {
        const f = new THREE.ConeGeometry(0.018, 0.08, 4).toNonIndexed();
        f.translate(Math.cos(i) * 0.035, 0.36, Math.sin(i) * 0.035);
        parts.push(f);
      }
      g = mergeGeometries(parts);
      break;
    }
    case "sash":
      g = rb(0.06, 0.6, 0.02, 0.01);
      break;
    case "skirtPlate":
      g = rb(0.14, 0.16, 0.025, 0.008);
      break;
    case "lens":
      g = new THREE.TorusGeometry(0.027, 0.0035, 6, 20);
      break;
    case "halfLens":
      g = new THREE.TorusGeometry(0.025, 0.003, 5, 14, Math.PI);
      g.rotateZ(Math.PI);
      break;
    case "bridge":
      g = new THREE.CylinderGeometry(0.003, 0.003, 0.02, 5);
      break;
    case "hatBrim":
      g = new THREE.CylinderGeometry(0.25, 0.26, 0.012, 28);
      break;
    case "hatCone": {
      // a tall pointed hat with a lazy bend near the tip
      const pts = [];
      for (let i = 0; i <= 12; i++) pts.push(new THREE.Vector2(0.135 * Math.pow(1 - i / 12, 1.15) + 0.003, i * 0.042));
      g = new THREE.LatheGeometry(pts, 20);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const y = p.getY(i);
        const k = Math.max(0, y - 0.28);
        p.setZ(i, p.getZ(i) - k * k * 2.2);
      }
      g.computeVertexNormals();
      break;
    }
    case "beardLong": {
      const pts = [];
      for (let i = 0; i <= 10; i++) {
        const t = i / 10;
        pts.push(new THREE.Vector2(0.075 * Math.sin(Math.min(1, t * 1.6) * Math.PI * 0.5) * (1 - t * 0.85) + 0.004, -t * 0.62));
      }
      g = new THREE.LatheGeometry(pts, 14);
      g.scale(1.15, 1, 0.7);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) p.setX(i, p.getX(i) + Math.sin(p.getY(i) * 30) * 0.004);
      g.computeVertexNormals();
      break;
    }
    case "beardBushy": {
      g = new THREE.IcosahedronGeometry(0.11, 2);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const f = 1 + Math.sin(i * 12.9898) * 0.12;
        p.setXYZ(i, p.getX(i) * f * 1.15, p.getY(i) * f * 1.5 - 0.06, p.getZ(i) * f * 0.75);
      }
      g.computeVertexNormals();
      break;
    }
    case "beardShort": {
      g = new THREE.SphereGeometry(0.07, 12, 8, 0, Math.PI * 2, Math.PI * 0.35, Math.PI * 0.65);
      g.scale(1.1, 1.3, 0.7);
      break;
    }
    case "moustache": {
      g = new THREE.CapsuleGeometry(0.012, 0.07, 3, 8);
      g.rotateZ(Math.PI / 2);
      g.scale(1, 1, 0.7);
      break;
    }
    case "mask": {
      g = new THREE.SphereGeometry(0.112, 18, 12, -Math.PI * 0.5, Math.PI, Math.PI * 0.15, Math.PI * 0.6);
      g.rotateY(Math.PI);
      g.scale(0.95, 1.12, 1.05);
      break;
    }
    case "scarfRing": {
      g = new THREE.TorusGeometry(0.085, 0.034, 8, 20);
      g.rotateX(Math.PI / 2);
      g.scale(1.05, 1, 1.1);
      break;
    }
    case "scarfTail":
      g = rb(0.055, 0.34, 0.014, 0.006);
      g.translate(0, -0.17, 0);
      break;
    case "tie":
      g = rb(0.028, 0.16, 0.008, 0.003);
      g.translate(0, -0.1, 0);
      break;
  }
  G[k] = g;
  return g;
}

/* ================================================================ weapons */
const WGEO = {};
const boxG = (w, h, d, x = 0, y = 0, z = 0) => new THREE.BoxGeometry(w, h, d).translate(x, y, z).toNonIndexed();
const cylG = (r1, r2, l, x = 0, y = 0, z = 0, seg = 10) => new THREE.CylinderGeometry(r1, r2, l, seg).rotateX(Math.PI / 2).translate(x, y, z).toNonIndexed();
function bladeG(len, w, t, z0) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0);
  s.lineTo(w / 2, 0);
  s.lineTo(w * 0.42, len * 0.85);
  s.lineTo(0, len);
  s.lineTo(-w * 0.42, len * 0.85);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: t, bevelEnabled: true, bevelSize: t * 0.45, bevelThickness: t * 0.5, bevelSegments: 1 });
  g.translate(0, 0, -t / 2);
  g.rotateX(Math.PI / 2); // length along +Z
  g.rotateZ(Math.PI / 2); // flat of the blade faces sideways
  g.translate(0, 0, z0);
  return g.toNonIndexed();
}
/**
 * Weapon geometry in "grip space": the grip at the origin, the weapon's
 * business end along +Z, its edge/top along +Y. Parts: metal, wood/leather,
 * accent (gold / glowing).
 */
export function weaponGeometry(kind) {
  if (WGEO[kind]) return WGEO[kind];
  let metal = [];
  let wood = [];
  let accent = [];
  let tip = 0.9;
  switch (kind) {
    case "wand": {
      // tapered shaft with a carved handle and a little knot
      const shaft = new THREE.CylinderGeometry(0.0055, 0.0105, 0.3, 8).rotateX(Math.PI / 2).translate(0, 0, 0.17).toNonIndexed();
      wood = [shaft, cylG(0.013, 0.012, 0.09, 0, 0, -0.005, 8)];
      accent = [new THREE.SphereGeometry(0.016, 8, 6).translate(0, 0, -0.055).toNonIndexed(), new THREE.TorusGeometry(0.012, 0.003, 4, 10).translate(0, 0, 0.045).toNonIndexed()];
      tip = 0.32;
      break;
    }
    case "sword":
      metal = [bladeG(0.82, 0.055, 0.012, 0.12)];
      wood = [cylG(0.018, 0.016, 0.16, 0, 0, 0.0, 8)];
      accent = [boxG(0.2, 0.025, 0.03, 0, 0, 0.1), new THREE.SphereGeometry(0.025, 8, 6).translate(0, 0, -0.09).toNonIndexed()];
      tip = 0.94;
      break;
    case "runeblade":
      metal = [bladeG(0.92, 0.065, 0.014, 0.12)];
      wood = [cylG(0.019, 0.017, 0.18, 0, 0, 0.0, 8)];
      accent = [boxG(0.24, 0.03, 0.035, 0, 0, 0.1), boxG(0.012, 0.004, 0.7, 0, 0.0, 0.5)];
      tip = 1.04;
      break;
    case "greatsword":
      metal = [bladeG(1.2, 0.08, 0.016, 0.22)];
      wood = [cylG(0.02, 0.02, 0.32, 0, 0, 0.04, 8)];
      accent = [boxG(0.32, 0.03, 0.04, 0, 0, 0.2)];
      tip = 1.42;
      break;
    case "flamesword":
      metal = [bladeG(1.1, 0.075, 0.016, 0.2)];
      wood = [cylG(0.02, 0.02, 0.3, 0, 0, 0.04, 8)];
      accent = [boxG(0.3, 0.035, 0.04, 0, 0, 0.18), boxG(0.016, 0.006, 0.95, 0, 0, 0.7)];
      tip = 1.3;
      break;
    case "axe": {
      wood = [cylG(0.02, 0.022, 0.75, 0, 0, 0.25, 8)];
      const s = new THREE.Shape();
      s.moveTo(0, 0);
      s.quadraticCurveTo(0.12, 0.02, 0.18, -0.12);
      s.lineTo(0.18, 0.14);
      s.quadraticCurveTo(0.12, 0.05, 0, 0.06);
      s.closePath();
      const h = new THREE.ExtrudeGeometry(s, { depth: 0.012, bevelEnabled: false });
      h.translate(0, -0.03, -0.006);
      h.rotateY(Math.PI / 2);
      h.rotateX(-Math.PI / 2);
      h.translate(0, 0.02, 0.56);
      metal = [h.toNonIndexed(), boxG(0.04, 0.05, 0.08, 0, 0, 0.56)];
      tip = 0.66;
      break;
    }
    case "mace":
      wood = [cylG(0.02, 0.022, 0.55, 0, 0, 0.18, 8)];
      metal = [new THREE.IcosahedronGeometry(0.07, 0).translate(0, 0, 0.5)];
      for (let i = 0; i < 6; i++) metal.push(new THREE.ConeGeometry(0.02, 0.07, 4).rotateZ((i / 6) * Math.PI * 2).translate(Math.cos((i / 6) * Math.PI * 2) * 0.07, Math.sin((i / 6) * Math.PI * 2) * 0.07, 0.5).toNonIndexed());
      tip = 0.56;
      break;
    case "dagger":
      metal = [bladeG(0.28, 0.036, 0.008, 0.07)];
      wood = [cylG(0.014, 0.013, 0.1, 0, 0, 0.0, 8)];
      accent = [boxG(0.08, 0.016, 0.018, 0, 0, 0.065)];
      tip = 0.36;
      break;
    case "spear":
      wood = [cylG(0.018, 0.018, 2.0, 0, 0, 0.45, 8)];
      metal = [bladeG(0.3, 0.06, 0.012, 1.42)];
      tip = 1.75;
      break;
    case "halberd": {
      wood = [cylG(0.02, 0.02, 2.0, 0, 0, 0.5, 8)];
      const s = new THREE.Shape();
      s.moveTo(0, 0);
      s.lineTo(0.2, -0.06);
      s.quadraticCurveTo(0.24, 0.1, 0.16, 0.22);
      s.lineTo(0, 0.12);
      s.closePath();
      const h = new THREE.ExtrudeGeometry(s, { depth: 0.012, bevelEnabled: false });
      h.rotateY(Math.PI / 2);
      h.rotateX(-Math.PI / 2);
      h.translate(0, 0.02, 1.3);
      metal = [h.toNonIndexed(), bladeG(0.3, 0.05, 0.012, 1.48)];
      tip = 1.78;
      break;
    }
    case "staff": {
      wood = [cylG(0.022, 0.026, 1.7, 0, 0, 0.4, 8)];
      const claw = [];
      for (let i = 0; i < 3; i++) claw.push(new THREE.ConeGeometry(0.02, 0.18, 5).rotateX(Math.PI / 2 - 0.35).rotateZ((i / 3) * Math.PI * 2).translate(Math.cos((i / 3) * Math.PI * 2) * 0.05, Math.sin((i / 3) * Math.PI * 2) * 0.05, 1.27).toNonIndexed());
      metal = claw;
      accent = [new THREE.OctahedronGeometry(0.06, 0).scale(1, 1, 1.5).translate(0, 0, 1.33)];
      tip = 1.36;
      break;
    }
    case "bow": {
      // limbs along ±Y (vertical when held), grip at origin; string along the back
      const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, -0.72, -0.05), new THREE.Vector3(0, 0, 0.22), new THREE.Vector3(0, 0.72, -0.05));
      wood = [new THREE.TubeGeometry(curve, 16, 0.018, 6).toNonIndexed(), boxG(0.04, 0.12, 0.05)];
      accent = [new THREE.CylinderGeometry(0.003, 0.003, 1.4, 4).translate(0, 0, -0.05).toNonIndexed()];
      tip = 0.2;
      break;
    }
    case "torch":
      wood = [cylG(0.025, 0.02, 0.6, 0, 0, 0.2, 6)];
      accent = [cylG(0.04, 0.03, 0.1, 0, 0, 0.5, 6)];
      tip = 0.56;
      break;
    case "hammer":
      wood = [cylG(0.02, 0.02, 0.5, 0, 0, 0.16, 8)];
      metal = [boxG(0.07, 0.07, 0.16, 0, 0, 0.44).map ? boxG(0.16, 0.07, 0.07, 0, 0, 0.44) : boxG(0.16, 0.07, 0.07, 0, 0, 0.44)];
      tip = 0.5;
      break;
    default:
      metal = [boxG(0.04, 0.04, 0.6, 0, 0, 0.3)];
  }
  const m = (a) => (a.length ? mergeGeometries(a.map((x) => (x.index ? x.toNonIndexed() : x)).map((x) => (x.deleteAttribute("uv"), x))) : null);
  WGEO[kind] = { metal: m(metal), wood: m(wood), accent: m(accent), tip };
  return WGEO[kind];
}
const WSTYLE = {
  wand: { metal: "#3a2618", wood: "#4a2e1a", accent: "#2a1a10" },
  sword: { metal: "#b8bcc4", wood: "#3a2418", accent: "#c9a050" },
  runeblade: { metal: "#c8d4e4", wood: "#2a1c2a", accent: "#7fd8ff", glow: 2.2 },
  greatsword: { metal: "#9aa0aa", wood: "#2a1a10", accent: "#7a6a50" },
  flamesword: { metal: "#2a2026", wood: "#1a0e0a", accent: "#ff5a1a", glow: 3 },
  axe: { metal: "#8a8e96", wood: "#5a3a22", accent: "#8a8e96" },
  mace: { metal: "#70747c", wood: "#4a2e1c", accent: "#70747c" },
  dagger: { metal: "#c0c4cc", wood: "#2a1a14", accent: "#9a7a40" },
  spear: { metal: "#a0a4ac", wood: "#6a4a2a", accent: "#a0a4ac" },
  halberd: { metal: "#8a8e96", wood: "#3a2a1a", accent: "#8a8e96" },
  staff: { metal: "#5a4a3a", wood: "#4a3020", accent: "#ff7a2a", glow: 2.6 },
  bow: { metal: "#5a4030", wood: "#6a4424", accent: "#e8e0d0" },
  torch: { metal: "#333", wood: "#4a3020", accent: "#ff8a3a", glow: 3 },
  hammer: { metal: "#7a7e86", wood: "#4a2e1c", accent: "#7a7e86" },
};
export function createWeaponMesh(kind, opts = {}) {
  const g = weaponGeometry(kind);
  const st = { ...(WSTYLE[kind] || WSTYLE.sword), ...(opts.style || {}) };
  const grp = new THREE.Group();
  const mats = [];
  const mk = (geo, mat) => {
    if (!geo) return;
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true;
    grp.add(m);
    mats.push(mat);
  };
  mk(g.metal, new THREE.MeshStandardMaterial({ color: st.metal, roughness: 0.28, metalness: 0.9 }));
  mk(g.wood, new THREE.MeshStandardMaterial({ color: st.wood, roughness: 0.75, metalness: 0.05 }));
  mk(g.accent, new THREE.MeshStandardMaterial({ color: st.accent, emissive: st.glow ? st.accent : "#000000", emissiveIntensity: st.glow || 0, roughness: 0.35, metalness: st.glow ? 0.2 : 0.9 }));
  grp.userData = { tip: g.tip, mats, kind };
  return grp;
}

/** Shields (left forearm): kite / round / heater, faced with a sigil. */
const SHIELD_GEO = {};
function shieldGeometry(kind) {
  if (SHIELD_GEO[kind]) return SHIELD_GEO[kind];
  const s = new THREE.Shape();
  if (kind === "round") s.absarc(0, 0, 0.32, 0, Math.PI * 2, false);
  else if (kind === "kite") {
    s.moveTo(-0.26, 0.3);
    s.quadraticCurveTo(0, 0.38, 0.26, 0.3);
    s.lineTo(0.24, -0.05);
    s.quadraticCurveTo(0.12, -0.38, 0, -0.55);
    s.quadraticCurveTo(-0.12, -0.38, -0.24, -0.05);
    s.closePath();
  } else {
    s.moveTo(-0.28, 0.32);
    s.lineTo(0.28, 0.32);
    s.lineTo(0.27, 0.0);
    s.quadraticCurveTo(0.2, -0.3, 0, -0.42);
    s.quadraticCurveTo(-0.2, -0.3, -0.27, 0.0);
    s.closePath();
  }
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.03, bevelEnabled: true, bevelSize: 0.015, bevelThickness: 0.012, bevelSegments: 2, curveSegments: 18 });
  // bow it outward a little and map UVs across the face
  const p = g.attributes.position;
  const uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    p.setZ(i, p.getZ(i) - (x * x + y * y * 0.4) * 0.35);
    uv.setXY(i, x / 0.7 + 0.5, (y + 0.15) / 1.1 + 0.36);
  }
  g.computeVertexNormals();
  SHIELD_GEO[kind] = g;
  return g;
}
export function createShieldMesh(kind = "heater", sigil = "wardens", color = "#2b4a7a") {
  void sigil;
  const face = new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.15 });
  const rim = new THREE.MeshStandardMaterial({ color: "#8a8e96", roughness: 0.35, metalness: 0.85 });
  const m = new THREE.Mesh(shieldGeometry(kind), [face, rim]);
  m.castShadow = true;
  const grp = new THREE.Group();
  grp.add(m);
  grp.userData = { mats: [face, rim] };
  return grp;
}

/* ================================================================ outfits */
/**
 * look.armor: { chest, head, shoulders, arms, legs } — see data/looks.js.
 * Bone frames (bind pose): spine/neck/head X=left Y=up Z=fwd · upperarm_l X=down Y=out ·
 * upperarm_r X=up Y=out · calf Y=down Z=back · foot Y=toes Z=down-back · pelvis Y=up Z=fwd
 */
function gearSet(look) {
  const out = [];
  const A = (g, bone, p, r = [0, 0, 0], mat = "metal", s = 1) => out.push({ g, bone, p, r, mat, s });
  const ar = look.armor || {};
  A("boot", "foot_l", [0, 0.07, 0.03], [-Math.PI / 2, 0, 0], "leather");
  A("boot", "foot_r", [0, 0.07, 0.03], [-Math.PI / 2, 0, 0], "leather");
  if (look.belt !== false) {
    A("belt", "pelvis", [0, 0.06, 0.0], [Math.PI / 2, 0, 0], "leather");
    A("buckle", "pelvis", [0, 0.06, 0.13], [0, 0, 0], "gold");
    A("pouch", "pelvis", [0.15, 0.0, 0.06], [0, 0.4, 0], "leather");
  }
  // chest
  if (ar.chest === "plate" || ar.chest === "ornate" || ar.chest === "dark") {
    const mat = ar.chest === "dark" ? "dark" : "metal";
    A("breast", "spine_03", [0, 0.02, 0.02], [0.05, 0, 0], mat);
    A("backplate", "spine_03", [0, 0.02, -0.03], [0, 0, 0], mat);
    A("fauld", "pelvis", [0, 0.0, 0.01], [0, 0, 0], mat);
    for (let i = 0; i < 4; i++) A("skirtPlate", "pelvis", [-0.12 + i * 0.08, -0.1, 0.17], [0.15, 0, 0], mat);
    A("gorget", "neck_01", [0, 0.015, 0.0], [0, 0, 0], mat);
    if (ar.chest === "ornate") A("buckle", "spine_03", [0, 0.1, 0.16], [0, 0, 0], "gold", 2);
  } else if (ar.chest === "leather") {
    A("breast", "spine_03", [0, 0.02, 0.015], [0.05, 0, 0], "leather", 0.97);
    A("backplate", "spine_03", [0, 0.02, -0.03], [0, 0, 0], "leather", 0.97);
    A("sash", "spine_03", [0.05, -0.02, 0.13], [0, 0, 0.6], "leather");
  } else if (ar.chest === "bone") {
    for (let i = 0; i < 4; i++) A("belt", "spine_03", [0, -0.05 + i * 0.06, 0.0], [Math.PI / 2, 0, 0], "bone", 0.82 - i * 0.03);
  }
  // shoulders
  const sh = ar.shoulders;
  if (sh === "plate" || sh === "dark") {
    A("pauldronBig", "upperarm_l", [-0.035, 0.07, 0], [0, 0, Math.PI / 2], sh === "dark" ? "dark" : "metal");
    A("pauldronBig", "upperarm_r", [0.035, 0.07, 0], [0, 0, -Math.PI / 2], sh === "dark" ? "dark" : "metal");
  } else if (sh === "leather") {
    A("pauldron", "upperarm_l", [-0.035, 0.06, 0], [0, 0, Math.PI / 2], "leather");
    A("pauldron", "upperarm_r", [0.035, 0.06, 0], [0, 0, -Math.PI / 2], "leather");
  } else if (sh === "fur") {
    A("collarFur", "neck_01", [0, -0.02, 0], [0, 0, 0], "fur");
    A("fur", "upperarm_l", [-0.04, 0.05, 0], [0, 0, Math.PI / 2], "fur");
    A("fur", "upperarm_r", [0.04, 0.05, 0], [0, 0, -Math.PI / 2], "fur");
  } else if (sh === "spiked") {
    A("pauldronBig", "upperarm_l", [-0.035, 0.07, 0], [0, 0, Math.PI / 2], "dark");
    A("pauldronBig", "upperarm_r", [0.035, 0.07, 0], [0, 0, -Math.PI / 2], "dark");
    for (let k = 0; k < 3; k++) {
      A("spike", "upperarm_l", [-0.16, 0.06, -0.06 + k * 0.06], [0, 0, Math.PI / 2], "metal");
      A("spike", "upperarm_r", [0.16, 0.06, -0.06 + k * 0.06], [0, 0, -Math.PI / 2], "metal");
    }
  }
  // arms + legs
  if (ar.arms === "bracers" || ar.arms === "gauntlets") {
    const mat = ar.arms === "gauntlets" ? (ar.chest === "dark" ? "dark" : "metal") : "leather";
    A("bracer", "lowerarm_l", [0, 0.14, 0], [0, 0, 0], mat);
    A("bracer", "lowerarm_r", [0, 0.14, 0], [0, 0, 0], mat);
    if (ar.arms === "gauntlets") {
      A("gauntlet", "hand_l", [0, 0.03, 0], [0, 0, 0], mat);
      A("gauntlet", "hand_r", [0, 0.03, 0], [0, 0, 0], mat);
    }
  }
  if (ar.legs === "greaves" || ar.legs === "dark") {
    const mat = ar.legs === "dark" ? "dark" : "metal";
    for (const s of ["l", "r"]) {
      A("knee", `calf_${s}`, [0, 0.03, -0.07], [-Math.PI / 2, 0, 0], mat);
      A("greave", `calf_${s}`, [0, 0.19, -0.055], [0, 0, 0], mat);
    }
  } else if (ar.legs === "leather") {
    for (const s of ["l", "r"]) A("greave", `calf_${s}`, [0, 0.19, -0.05], [0, 0, 0], "leather", 0.95);
  }
  // heads
  const h = ar.head;
  if (h === "nasal") A("helmNasal", "Head", [0, 0.07, 0.0], [0, 0, 0], "metal");
  if (h === "great" || h === "darkgreat") {
    A("helmGreat", "Head", [0, 0.085, 0.01], [0, 0, 0], h === "darkgreat" ? "dark" : "metal");
    A("visorSlit", "Head", [0, 0.1, 0.165], [0, 0, 0], h === "darkgreat" ? "glow" : "black");
  }
  if (h === "horned") {
    A("helmNasal", "Head", [0, 0.07, 0.0], [0, 0, 0], "dark");
    A("horn", "Head", [0.11, 0.14, 0], [0, 0, -0.4], "bone");
    A("horn", "Head", [-0.11, 0.14, 0], [0, Math.PI, -0.4], "bone");
  }
  if (h === "hood" || h === "hoodUp") {
    A("hood", "Head", [0, 0.06, -0.02], [0, 0, 0], "hood");
    A("hoodPoint", "Head", [0, 0.17, -0.13], [-0.9, 0, 0], "hood");
  }
  if (h === "circlet" || h === "crown") {
    A("circlet", "Head", [0, 0.105, 0.01], [-0.12, 0, 0], "gold", 1.06);
    if (h === "crown") for (let k = 0; k < 7; k++) A("crownPoint", "Head", [Math.sin((k / 7) * Math.PI * 2) * 0.12, 0.14, Math.cos((k / 7) * Math.PI * 2) * 0.13 + 0.01], [0, 0, 0], "gold");
  }
  if (look.skirt) A(look.skirt === "short" ? "skirtShort" : "skirt", "pelvis", [0, 0.06, 0.0], [0, 0, 0], "robe");
  // ---- wizarding gear
  if (look.glasses === "round") {
    A("lens", "Head", [0.036, 0.094, 0.118], [0, 0, 0], "frame");
    A("lens", "Head", [-0.036, 0.094, 0.118], [0, 0, 0], "frame");
    A("bridge", "Head", [0, 0.096, 0.122], [0, 0, Math.PI / 2], "frame");
  } else if (look.glasses === "half") {
    A("halfLens", "Head", [0.036, 0.088, 0.118], [0, 0, 0], "gold");
    A("halfLens", "Head", [-0.036, 0.088, 0.118], [0, 0, 0], "gold");
  }
  if (look.hat === "wizard") {
    A("hatBrim", "Head", [0, 0.155, -0.005], [-0.08, 0, 0], "hat");
    A("hatCone", "Head", [0, 0.17, -0.02], [-0.12, 0, 0], "hat");
  }
  if (look.beard === "long") {
    A("beardLong", "Head", [0, 0.02, 0.085], [0.18, 0, 0], "beard");
    A("moustache", "Head", [0, 0.05, 0.11], [0, 0, 0], "beard");
  } else if (look.beard === "bushy") {
    A("beardBushy", "Head", [0, 0.01, 0.07], [0.1, 0, 0], "beard");
    A("moustache", "Head", [0, 0.05, 0.11], [0, 0, 0], "beard", 1.3);
  } else if (look.beard === "short") A("beardShort", "Head", [0, 0.02, 0.085], [0.1, 0, 0], "beard");
  if (look.mask) A("mask", "Head", [0, 0.08, 0.035], [0, 0, 0], "silver");
  if (look.scarf) {
    A("scarfRing", "neck_01", [0, -0.01, 0.0], [0, 0, 0], "scarf");
    A("scarfTail", "spine_03", [0.075, 0.1, 0.145], [0.18, 0, 0.12], "scarf");
    A("scarfTail", "spine_03", [-0.06, 0.12, -0.15], [-0.25, 0, -0.1], "scarf", 0.9);
  }
  if (look.tie) A("tie", "spine_03", [0, 0.07, 0.14], [0.1, 0, 0], "tie");
  if (look.hood) {
    A("hood", "Head", [0, 0.06, -0.02], [0, 0, 0], "hood");
    A("hoodPoint", "Head", [0, 0.17, -0.13], [-0.9, 0, 0], "hood");
  }
  if (look.quiver) A("quiver", "spine_03", [0.08, 0.02, -0.17], [0.2, 0, -0.35], "leather");
  return out;
}

/* ================================================================ animator */
function createLayered(model, set) {
  const mixer = new THREE.AnimationMixer(model);
  const layers = { lower: new Map(), upper: new Map(), full: new Map() };
  const want = { lower: null, upper: null, full: null };
  const wantOpts = { lower: {}, upper: {}, full: {} };
  let fullW = 0;
  function act(layer, name) {
    const L = layers[layer];
    let e = L.get(name);
    if (!e) {
      const clip = set[layer][name];
      if (!clip) return null;
      const a = mixer.clipAction(clip);
      a.setLoop(LOOP_CLIPS.has(name) ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
      a.clampWhenFinished = true;
      a.setEffectiveWeight(0);
      a.play();
      e = { a, w: 0 };
      L.set(name, e);
    }
    return e;
  }
  return {
    mixer,
    set(layer, name, o = {}) {
      if (want[layer] !== name || o.restart) {
        const e = name ? act(layer, name) : null;
        if (e && (o.restart || (!LOOP_CLIPS.has(name) && e.w < 0.05))) e.a.reset().play();
        want[layer] = name;
      }
      wantOpts[layer] = o;
      const e = name && layers[layer].get(name);
      if (e) {
        if (o.time != null) {
          e.a.time = Math.max(0, Math.min(e.a.getClip().duration - 1e-3, o.time));
          e.a.timeScale = 0;
        } else e.a.timeScale = o.speed ?? 1;
      }
    },
    playing(layer) {
      return want[layer];
    },
    duration(name) {
      return set.full[name]?.duration || 1;
    },
    update(dt) {
      const fullTarget = want.full ? 1 : 0;
      const fFade = wantOpts.full.fade ?? 0.12;
      fullW += (fullTarget - fullW) * Math.min(1, dt / fFade);
      for (const layer of ["lower", "upper", "full"]) {
        const fade = wantOpts[layer].fade ?? 0.18;
        const k = Math.min(1, dt / fade);
        let sum = 0;
        for (const [n, e] of layers[layer]) {
          const t = n === want[layer] ? 1 : 0;
          e.w += (t - e.w) * k;
          if (t === 0 && e.w < 0.003) e.w = 0;
          sum += e.w;
        }
        const scale = layer === "full" ? fullW : 1 - fullW;
        for (const [, e] of layers[layer]) {
          const w = sum > 0 ? (e.w / sum) * scale : 0;
          // zero-weight actions are switched off so the mixer skips them entirely
          const on = w > 0.001;
          if (e.a.enabled !== on) e.a.enabled = on;
          e.a.setEffectiveWeight(w);
        }
      }
      mixer.update(dt);
    },
    dispose() {
      mixer.stopAllAction();
      mixer.uncacheRoot(model);
    },
  };
}

/* ================================================================ character */
const HAIRS = ["Hair_Buzzed", "Hair_SimpleParted", "Hair_Beard", "Hair_Long", "Hair_Buns", "Hair_BuzzedFemale"];

export function createCharacter(assets, look = {}) {
  const body = look.body === "f" ? "f" : "m";
  const src = assets.bodies[body];
  const root = new THREE.Group();
  const model = skClone(src.scene);
  root.add(model);
  const B = {};
  const meshes = [];
  model.traverse((o) => {
    if (o.isBone) B[o.name] = o;
    if (o.isMesh) meshes.push(o);
  });
  model.updateMatrixWorld(true);
  const headInv = B.Head.matrixWorld.clone().invert();
  const mats = [];
  const ar = look.armor || {};
  const coveredHead = ["great", "darkgreat", "hood", "hoodUp"].includes(ar.head) || look.hood;
  const hairMat = new THREE.MeshStandardMaterial({ color: look.hairColor || "#2a1a10", roughness: 0.75, metalness: 0, side: THREE.DoubleSide });
  mats.push(hairMat);
  let garb = null;
  for (const o of meshes) {
    o.castShadow = true;
    o.receiveShadow = true;
    o.frustumCulled = false;
    if (HAIRS.includes(o.name)) {
      const want = !look.undead && !coveredHead && (o.name === look.hair || (o.name === "Hair_Beard" && look.beard));
      if (!want) {
        o.parent.remove(o);
        continue;
      }
      o.material = hairMat;
      o.matrix.copy(headInv).multiply(o.matrixWorld);
      o.matrix.decompose(o.position, o.quaternion, o.scale);
      B.Head.add(o);
      continue;
    }
    if (o.isSkinnedMesh && /superhero/i.test(o.name)) {
      garb = garbMaterial(o.material, look, assets, body);
      o.material = garb;
      mats.push(garb);
    } else if (o.material?.name === "Hair") {
      if (look.undead || coveredHead) o.visible = false;
      o.material = hairMat;
    } else {
      o.material = o.material.clone();
      if (look.undead && /eye/i.test(o.name + (o.material.name || ""))) o.visible = false;
      mats.push(o.material);
    }
  }
  const bodyMesh = meshes.find((o) => o.isSkinnedMesh && /superhero/i.test(o.name));
  const garmentMats = [];
  if (bodyMesh)
    for (const kind of (look.garments || ["tunic"]).filter((k) => k !== "hose")) {
      const gm = new THREE.SkinnedMesh(garmentGeometry(bodyMesh.geometry, body, kind), garmentMaterial(look, kind));
      gm.position.copy(bodyMesh.position);
      gm.quaternion.copy(bodyMesh.quaternion);
      gm.scale.copy(bodyMesh.scale);
      gm.bind(bodyMesh.skeleton, bodyMesh.bindMatrix);
      gm.castShadow = true;
      gm.receiveShadow = true;
      gm.frustumCulled = false;
      bodyMesh.parent.add(gm);
      mats.push(gm.material);
      garmentMats.push(gm.material);
    }
  const s = look.scale || 1;
  const gth = look.girth || 1;
  model.scale.set(s * gth, s, s * gth);

  // ---------------------------------------------------------- gear
  const GM = {
    metal: new THREE.MeshStandardMaterial({ color: look.metal || "#9aa0aa", roughness: 0.32, metalness: 0.88 }),
    dark: new THREE.MeshStandardMaterial({ color: look.darkMetal || "#2a2428", roughness: 0.38, metalness: 0.8 }),
    leather: new THREE.MeshStandardMaterial({ color: look.leather || "#4a3020", roughness: 0.8, metalness: 0.05 }),
    gold: new THREE.MeshStandardMaterial({ color: "#d8b25a", roughness: 0.3, metalness: 1 }),
    fur: new THREE.MeshStandardMaterial({ color: look.furColor || "#6a5a48", roughness: 1, metalness: 0 }),
    hood: new THREE.MeshStandardMaterial({ color: look.hood || look.tunic || "#3a3a30", roughness: 0.95, metalness: 0, side: THREE.DoubleSide }),
    robe: new THREE.MeshStandardMaterial({ color: look.robe || look.tunic || "#5a4a3a", roughness: 0.92, metalness: 0, side: THREE.DoubleSide }),
    bone: new THREE.MeshStandardMaterial({ color: "#d8ceb2", roughness: 0.7, metalness: 0 }),
    black: new THREE.MeshStandardMaterial({ color: "#050505", roughness: 1 }),
    glow: new THREE.MeshStandardMaterial({ color: "#ff5a1a", emissive: "#ff5a1a", emissiveIntensity: 3, roughness: 0.4 }),
    frame: new THREE.MeshStandardMaterial({ color: "#1a1a1c", roughness: 0.35, metalness: 0.6 }),
    hat: new THREE.MeshStandardMaterial({ color: look.hatColor || "#3a2a5a", roughness: 0.9, metalness: 0, side: THREE.DoubleSide }),
    beard: new THREE.MeshStandardMaterial({ color: look.beardColor || look.hairColor || "#d8d8d4", roughness: 0.95, metalness: 0 }),
    silver: new THREE.MeshStandardMaterial({ color: "#c8ccd4", roughness: 0.22, metalness: 1, side: THREE.DoubleSide }),
    scarf: new THREE.MeshStandardMaterial({ map: look.scarf ? stripeTex(look.scarf[0], look.scarf[1]) : null, roughness: 0.95, metalness: 0 }),
    tie: new THREE.MeshStandardMaterial({ map: look.scarf ? stripeTex(look.scarf[0], look.scarf[1], true) : null, color: look.scarf ? "#ffffff" : "#5a1a1a", roughness: 0.7, metalness: 0 }),
  };
  for (const m of Object.values(GM)) mats.push(m);
  const gearMeshes = [];
  for (const p of gearSet(look)) {
    const bone = B[p.bone];
    if (!bone) continue;
    const mesh = new THREE.Mesh(geo(p.g), GM[p.mat]);
    mesh.position.set(...p.p);
    mesh.rotation.set(...p.r);
    if (p.s !== 1) mesh.scale.setScalar(p.s);
    mesh.castShadow = false;
    bone.add(mesh);
    gearMeshes.push(mesh);
  }
  // cape: three hinged segments hanging from the upper back
  let cape = null;
  if (look.cape || look.cloak) {
    const long = !!look.cloak;
    const capeMat = new THREE.MeshStandardMaterial({ color: look.cloak || look.cape, roughness: 0.9, metalness: 0, side: THREE.DoubleSide });
    mats.push(capeMat);
    const segs = [];
    let parent = new THREE.Group();
    parent.position.set(0, 0.16, -0.12);
    B.spine_03.add(parent);
    const anchor = parent;
    const N = long ? 4 : 3;
    for (let i = 0; i < N; i++) {
      const hinge = new THREE.Group();
      if (i > 0) hinge.position.set(0, -0.33, 0);
      const m = new THREE.Mesh(geo("capeSeg"), capeMat);
      m.position.set(0, -0.17, 0);
      m.scale.set((long ? 1.12 : 1) + i * (long ? 0.12 : 0.16), 1, 1);
      m.castShadow = true;
      hinge.add(m);
      parent.add(hinge);
      segs.push(hinge);
      parent = hinge;
    }
    gearMeshes.push(anchor);
    cape = { anchor, segs, swing: 0 };
  }
  fixBoneSpace(model, gearMeshes);

  // fingers are never animated: curl them into a grip
  {
    const qq = new THREE.Quaternion();
    for (const side of ["l", "r"]) {
      for (const f of ["index", "middle", "ring", "pinky"])
        for (let j = 1; j <= 3; j++) {
          const b = B[`${f}_0${j}_${side}`];
          if (b) b.quaternion.multiply(qq.setFromAxisAngle(new THREE.Vector3(1, 0, 0), 1.05 + (j > 1 ? 0.25 : 0)));
        }
      for (let j = 1; j <= 3; j++) {
        const b = B[`thumb_0${j}_${side}`];
        if (b) b.quaternion.multiply(qq.setFromAxisAngle(new THREE.Vector3(0, 0, side === "l" ? 1 : -1), 0.35));
      }
    }
  }
  // ---------------------------------------------------------- sockets
  // grip space → hand space: weapon +Z along the fingers' curl axis (+Y hand), top (+Y) toward the thumb (+Z)
  const socketR = new THREE.Group();
  B.hand_r.add(socketR);
  socketR.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0)));
  socketR.position.set(-0.01, 0.08, -0.03);
  const socketL = new THREE.Group();
  B.hand_l.add(socketL);
  socketL.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, -1, 0)));
  socketL.position.set(0.01, 0.08, -0.03);
  const shieldSock = new THREE.Group();
  B.lowerarm_l.add(shieldSock);
  shieldSock.position.set(0.0, 0.16, 0.0);
  const back = new THREE.Group(); // sheathed weapon on the back
  B.spine_03.add(back);
  back.position.set(0, 0.05, -0.17);
  fixBoneSpace(model, [socketR, socketL, shieldSock, back]);
  // weapon grip rotations: blades extend from the fist along the forearm-perpendicular (thumb) axis
  const gripR = new THREE.Group();
  gripR.rotation.x = -Math.PI / 2;
  socketR.add(gripR);
  const gripL = new THREE.Group();
  gripL.rotation.x = -Math.PI / 2;
  socketL.add(gripL);
  let weapon = null;
  let weaponKind = null;
  let offhand = null;
  let offKind = null;
  let shield = null;
  let shieldKey = null;

  const anim = createLayered(model, assets.clips[body]);
  const spine = [B.spine_01, B.spine_02, B.spine_03];
  const q = new THREE.Quaternion();
  const axisX = new THREE.Vector3(1, 0, 0);
  const axisY = new THREE.Vector3(0, 1, 0);
  const axisZ = new THREE.Vector3(0, 0, 1);
  const allMats = () => [...mats, ...(weapon?.userData.mats || []), ...(offhand?.userData.mats || []), ...(shield?.userData.mats || [])];

  return {
    root,
    model,
    bones: B,
    body,
    garb,
    uniforms: garb?.userData.u,
    anim,
    setWeapon(kind, opts) {
      if (kind === weaponKind) return;
      if (weapon) {
        weapon.parent.remove(weapon);
        weapon.userData.mats.forEach((m) => m.dispose());
      }
      weapon = kind ? createWeaponMesh(kind, opts) : null;
      weaponKind = kind;
      if (weapon) {
        if (kind === "bow") {
          // bows sit in the left hand, string toward the body
          weapon.rotation.set(Math.PI / 2, 0, 0);
          gripL.add(weapon);
        } else gripR.add(weapon);
      }
    },
    setOffhand(kind, opts) {
      if (kind === offKind) return;
      if (offhand) {
        offhand.parent.remove(offhand);
        offhand.userData.mats.forEach((m) => m.dispose());
      }
      offhand = kind ? createWeaponMesh(kind, opts) : null;
      offKind = kind;
      if (offhand) gripL.add(offhand);
    },
    setShield(kind, sigil, color) {
      const key = kind ? `${kind}:${sigil}:${color}` : null;
      if (key === shieldKey) return;
      if (shield) {
        shield.parent.remove(shield);
        shield.userData.mats.forEach((m) => m.dispose());
      }
      shield = kind ? createShieldMesh(kind, sigil, color) : null;
      shieldKey = key;
      if (shield) {
        // strapped to the outside of the left forearm, face outward
        shield.rotation.set(0, 0, -Math.PI / 2);
        shield.position.set(-0.07, 0, 0);
        shield.rotation.y = -Math.PI / 2;
        shieldSock.add(shield);
      }
    },
    get weapon() {
      return weapon;
    },
    /** World position of the weapon tip (trails, spell origins). */
    tipWorld(out) {
      if (!weapon) return B.hand_r.getWorldPosition(out);
      out.set(0, 0, weapon.userData.tip);
      return weapon.localToWorld(out);
    },
    handWorld(side, out) {
      return (side === "l" ? B.hand_l : B.hand_r).getWorldPosition(out);
    },
    /** Procedural torso pitch / twist on top of the animation (aiming, looking). */
    aim(pitch, twist = 0) {
      const p = pitch / 3;
      const t = twist / 3;
      for (const b of spine) {
        if (!b) continue;
        q.setFromAxisAngle(axisX, -p);
        b.quaternion.multiply(q);
        if (t) {
          q.setFromAxisAngle(axisY, t);
          b.quaternion.multiply(q);
        }
      }
    },
    /** Bow draw: the pistol-aim clip already reads as a draw; nudge the string hand back. */
    bowPose(k) {
      if (k <= 0 || !B.lowerarm_r) return;
      B.lowerarm_r.quaternion.multiply(q.setFromAxisAngle(axisZ, -0.25 * k));
    },
    capeUpdate(dt, speed, turn) {
      if (!cape) return;
      const want = Math.min(1.1, speed * 0.11) + Math.abs(turn) * 0.2;
      cape.swing += (want - cape.swing) * Math.min(1, dt * 4);
      const t = performance.now() / 1000;
      cape.segs.forEach((h, i) => {
        h.rotation.x = cape.swing * (0.55 + i * 0.25) + Math.sin(t * 2.4 + i) * 0.05 * (1 + cape.swing);
        h.rotation.z = Math.sin(t * 1.7 + i * 0.6) * 0.03;
      });
    },
    setShadow(on) {
      if (this._shadow === on) return;
      this._shadow = on;
      for (const o of meshes) if (o.isMesh && o.parent) o.castShadow = on;
    },
    setHit(v) {
      if (this.uniforms) this.uniforms.uHit.value = v;
      for (const m of garmentMats) m.userData.u.uHit.value = v;
    },
    setDissolve(v) {
      if (this.uniforms) this.uniforms.uDissolve.value = v;
      for (const m of garmentMats) m.userData.u.uDissolve.value = v;
      const vis = v < 0.6;
      for (const g of gearMeshes) g.visible = vis;
      if (weapon) weapon.visible = vis;
      if (shield) shield.visible = vis;
      if (offhand) offhand.visible = vis;
      hairMat.visible = vis;
    },
    setStealth(v) {
      if (this.uniforms) this.uniforms.uStealth.value = v;
      const tr = v > 0.01;
      for (const m of allMats()) {
        if (m.transparent !== tr) {
          m.transparent = tr;
          m.needsUpdate = true;
        }
        if (m !== garb) m.opacity = 1 - v * 0.6;
      }
    },
    tick(t) {
      if (this.uniforms) this.uniforms.uTime.value = t;
      for (const m of garmentMats) m.userData.u.uTime.value = t;
    },
    dispose() {
      anim.dispose();
      model.traverse((o) => o.isSkinnedMesh && o.skeleton.dispose());
      allMats().forEach((m) => m.dispose());
    },
  };
}

/**
 * Gear is authored in metres in the bone's local frame, but the UBC skeleton
 * carries a 0.01 / ×100 scale chain from its FBX origins on some bones —
 * compensate so a 0.3 m plate is 0.3 m in the world.
 */
function fixBoneSpace(model, objs) {
  model.updateMatrixWorld(true);
  const s = new THREE.Vector3();
  const ms = new THREE.Vector3();
  model.getWorldScale(ms);
  for (const o of objs) {
    o.parent.getWorldScale(s);
    const k = ms.x / (s.x || 1);
    if (Math.abs(k - 1) > 0.01) {
      o.scale.multiplyScalar(k);
      o.position.multiplyScalar(k);
    }
  }
}
