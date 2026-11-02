/**
 * A renderable fighter: a clone of a CC0 Quaternius body, dressed in code.
 *
 *  1. Skin shader — the body's PBR skin material is extended so the regions
 *     under clothing are painted in the cloth colour (decided from the
 *     un-skinned bind position): clothes never show skin through at extreme
 *     poses. Gloves / shoes / ninja hood are painted the same way. Hit flash
 *     and a fresnel "aura" (specials, bosses) are added to the emissive term.
 *  2. Cloth shells — copies of the body's triangles inside a garment region,
 *     pushed out along the normal and bound to the same skeleton, so a gi,
 *     shorts or trousers deform exactly like the body underneath. Fabric is
 *     MeshPhysicalMaterial with sheen + a woven normal map; patterns (gi
 *     lapels, flames, lightning piping, waistbands) are drawn in the shader.
 *  3. Gear — rigid pieces (belts, headbands, gloves, guards, masks, pads…)
 *     authored in metres in the REST pose's world space and re-parented to a
 *     bone with that bone's inverse rest matrix, so they follow the animation.
 *
 * Proportions: `scale` (height) and `girth` (width/depth) per fighter.
 */
import * as THREE from "three";
import { clone as skClone } from "three/examples/jsm/utils/SkeletonUtils.js";
import { fabricNormal } from "./textures.js";

const HAIRS = ["Hair_Buzzed", "Hair_SimpleParted", "Hair_Beard", "Hair_Long", "Hair_Buns", "Hair_BuzzedFemale"];
const col = (c) => new THREE.Color(c);

/* ================================================================ regions */
/**
 * Garment regions in bind space. Each: yLo / yHi, xMax (|x| limit: sleeves),
 * vneck [startY, slope] (front opening), arm [x, y] (armholes: cut |x|>x above y),
 * off (shell offset along the normal), flare(y) (extra looseness).
 */
export function garmentRegion(kind, L) {
  const N = L.neck;
  const P = L.pelvis;
  const K = L.knee;
  const A = L.ankle;
  const W = L.wrist;
  const E = L.elbow;
  const S = L.shoulder;
  switch (kind) {
    case "gi":
      return { yLo: P - 0.2, yHi: N - 0.012, xMax: E + 0.5 * (W - E), vneck: [N - 0.34, 0.42], off: 0.022, flare: (y) => Math.max(0, P + 0.04 - y) * 0.22 + Math.max(0, y - (N - 0.2)) * 0.02 };
    case "giPants":
      return { yLo: A + 0.06, yHi: P + 0.07, xMax: 0.32, off: 0.022, flare: (y) => Math.max(0, K + 0.15 - y) * 0.09 + 0.006 };
    case "jacket":
      return { yLo: P - 0.1, yHi: N - 0.008, xMax: W - 0.035, vneck: [N - 0.1, 0.25], off: 0.014, flare: (y) => Math.max(0, P + 0.02 - y) * 0.12 };
    case "pants":
      return { yLo: A + 0.07, yHi: P + 0.07, xMax: 0.32, off: 0.01, flare: (y) => Math.max(0, K - y) * 0.03 };
    case "shorts":
      return { yLo: K + 0.13, yHi: P + 0.075, xMax: 0.32, off: 0.018, flare: (y) => Math.max(0, P - 0.12 - y) * 0.22 };
    case "tank":
      return { yLo: P - 0.04, yHi: N - 0.04, xMax: S - 0.01, vneck: [N - 0.12, 0.6], arm: [0.115, N - 0.17], off: 0.011, flare: () => 0 };
    case "crop":
      return { yLo: N - 0.36, yHi: N - 0.045, xMax: S - 0.02, vneck: [N - 0.1, 0.55], arm: [0.12, N - 0.15], off: 0.008, flare: () => 0 };
    case "leggings":
      return { yLo: A + 0.06, yHi: P + 0.08, xMax: 0.32, off: 0.005, flare: () => 0 };
    case "suitTop":
      return { yLo: P - 0.02, yHi: N - 0.004, xMax: W - 0.04, off: 0.006, flare: () => 0 };
    default:
      return null;
  }
}
const LEG_KINDS = new Set(["giPants", "pants", "shorts", "leggings"]);

function inRegion(R, x, y, z) {
  const ax = Math.abs(x);
  if (y < R.yLo || y > R.yHi || ax > R.xMax) return false;
  if (R.vneck && y > R.vneck[0] && z > 0 && ax < (y - R.vneck[0]) * R.vneck[1]) return false;
  if (R.arm && ax > R.arm[0] && y > R.arm[1]) return false;
  return true;
}

/* ================================================================ shell geometry */
const SHELL_GEO = new Map();
function shellGeometry(src, body, kind, R) {
  const key = `${body}:${kind}`;
  if (SHELL_GEO.has(key)) return SHELL_GEO.get(key);
  const pos = src.attributes.position;
  const idx = src.index;
  const map = new Int32Array(pos.count).fill(-1);
  const keep = [];
  const tri = [];
  const inR = (i) => inRegion(R, pos.getX(i), pos.getY(i), pos.getZ(i));
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
    const out = new attr.array.constructor(keep.length * n);
    keep.forEach((v, i) => {
      for (let k = 0; k < n; k++) out[i * n + k] = attr.array[v * n + k];
    });
    g.setAttribute(name, new THREE.BufferAttribute(out, n, attr.normalized));
  }
  const p = g.attributes.position;
  const nn = g.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    const o = R.off + R.flare(y);
    p.setXYZ(i, p.getX(i) + nn.getX(i) * o, y + nn.getY(i) * R.off, p.getZ(i) + nn.getZ(i) * o);
  }
  g.setIndex(tri);
  g.computeBoundingSphere();
  SHELL_GEO.set(key, g);
  return g;
}

/* ================================================================ shader helpers */
/** Shared emissive extras: hit flash + fresnel aura. */
function glowChunk() {
  return `
  {
    vec3 vdir = normalize(vViewPosition);
    float fres = pow(1.0 - clamp(abs(dot(normal, vdir)), 0.0, 1.0), 2.6);
    // rim-only: lights the silhouette edge, never flattens the PBR shading
    totalEmissiveRadiance += uGlow * uGlowI * fres * 1.5;
    totalEmissiveRadiance += vec3(1.0, 0.9, 0.8) * uHit * (0.06 + fres * 0.55);
  }`;
}

function skinMaterial(src, look, assets, body, L, shared) {
  const m = src.clone();
  if (look.skin === "dark") m.map = assets.dark[body];
  m.color = col(look.skinTint || "#ffffff");
  m.metalness = 1; // metalnessMap.b is 0 → dielectric
  m.roughness = 0.92;
  m.envMapIntensity = 0.75;
  m.normalScale = new THREE.Vector2(0.9, 0.9);
  const top = (look.shells || []).find((s) => !LEG_KINDS.has(s.kind));
  const leg = (look.shells || []).find((s) => LEG_KINDS.has(s.kind));
  const R = (s) => (s ? garmentRegion(s.kind, L) : null);
  const rt = R(top);
  const rl = R(leg);
  const paint = look.paint || {};
  const u = {
    uTopOn: { value: rt ? 1 : 0 },
    uTopC: { value: col(top?.color || "#000") },
    uTopR: { value: new THREE.Vector4(rt?.yLo ?? 0, (rt?.yHi ?? 0) - 0.004, (rt?.xMax ?? 0) - 0.004, rt?.vneck ? rt.vneck[0] : 9) },
    uTopV: { value: new THREE.Vector2(rt?.vneck ? rt.vneck[1] : 0, rt?.arm ? 1 : 0) },
    uTopA: { value: new THREE.Vector2(rt?.arm ? rt.arm[0] : 9, rt?.arm ? rt.arm[1] : 9) },
    uLegOn: { value: rl ? 1 : 0 },
    uLegC: { value: col(leg?.color || "#000") },
    uLegR: { value: new THREE.Vector3((rl?.yLo ?? 0) + 0.004, (rl?.yHi ?? 0) - 0.004, rl?.xMax ?? 0) },
    uHandOn: { value: paint.hands ? 1 : 0 },
    uHandC: { value: col(paint.hands || "#000") },
    uHandX: { value: L.wrist - (paint.handsTo ?? 0.02) },
    uFootOn: { value: paint.feet ? 1 : 0 },
    uFootC: { value: col(paint.feet || "#000") },
    uFootY: { value: paint.feetTo ?? 0.12 },
    uHoodOn: { value: paint.hood ? 1 : 0 },
    uHoodC: { value: col(paint.hood || "#000") },
    uNeck: { value: L.neck - 0.03 },
    uEye: { value: new THREE.Vector2(L.eye.y, 0.022) },
    ...shared,
  };
  m.userData.u = u;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vBind;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvBind = position;");
    sh.fragmentShader = sh.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
varying vec3 vBind;
uniform float uTopOn; uniform vec3 uTopC; uniform vec4 uTopR; uniform vec2 uTopV; uniform vec2 uTopA;
uniform float uLegOn; uniform vec3 uLegC; uniform vec3 uLegR;
uniform float uHandOn; uniform vec3 uHandC; uniform float uHandX;
uniform float uFootOn; uniform vec3 uFootC; uniform float uFootY;
uniform float uHoodOn; uniform vec3 uHoodC; uniform float uNeck; uniform vec2 uEye;
uniform vec3 uGlow; uniform float uGlowI; uniform float uHit;
float clothMask = 0.0;`
      )
      .replace(
        "#include <map_fragment>",
        `#include <map_fragment>
  {
    vec3 b = vBind;
    float ax = abs(b.x);
    float lum = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
    vec3 paintC = vec3(0.0);
    float top = uTopOn * step(uTopR.x, b.y) * step(b.y, uTopR.y) * step(ax, uTopR.z);
    if (b.y > uTopR.w && b.z > 0.0 && ax < (b.y - uTopR.w) * uTopV.x) top = 0.0;
    if (uTopV.y > 0.5 && ax > uTopA.x && b.y > uTopA.y) top = 0.0;
    float leg = uLegOn * step(uLegR.x, b.y) * step(b.y, uLegR.y) * step(ax, uLegR.z);
    float hand = uHandOn * step(uHandX, ax) * step(1.2, b.y);
    float foot = uFootOn * step(b.y, uFootY);
    float hood = uHoodOn * step(uNeck, b.y) * step(ax, 0.2);
    // eye slit stays open
    hood *= 1.0 - step(abs(b.y - uEye.x), uEye.y) * step(0.0, b.z) * step(ax, 0.085);
    paintC = mix(paintC, uLegC, leg);
    paintC = mix(paintC, uTopC, top);
    paintC = mix(paintC, uHandC, hand);
    paintC = mix(paintC, uFootC, foot);
    paintC = mix(paintC, uHoodC, hood);
    clothMask = clamp(top + leg + hand + foot + hood, 0.0, 1.0);
    diffuseColor.rgb = mix(diffuseColor.rgb, paintC * (0.62 + 0.55 * lum), clothMask);
  }`
      )
      .replace(
        "#include <roughnessmap_fragment>",
        `#include <roughnessmap_fragment>
  roughnessFactor = mix(roughnessFactor * 0.82, 0.86, clothMask);`
      )
      .replace(
        "#include <normal_fragment_maps>",
        `vec3 baseN = normal;
#include <normal_fragment_maps>
  normal = normalize(mix(normal, baseN, clothMask * 0.8));`
      )
      .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>${glowChunk()}`);
  };
  m.customProgramCacheKey = () => "ifa-skin";
  return m;
}

function clothMaterial(spec, L, shared) {
  const R = garmentRegion(spec.kind, L);
  const base = col(spec.color);
  const m = new THREE.MeshPhysicalMaterial({
    color: base,
    roughness: spec.kind === "suitTop" || spec.kind === "leggings" ? 0.5 : 0.82,
    metalness: 0,
    sheen: 0.35,
    sheenRoughness: 0.7,
    sheenColor: base.clone().lerp(new THREE.Color("#ffffff"), 0.2),
    normalMap: fabricNormal(),
    normalScale: new THREE.Vector2(0.35, 0.35),
    side: THREE.DoubleSide,
    envMapIntensity: 0.8,
  });
  m.normalMap.repeat.set(18, 18);
  const pattern = { none: 0, flame: 1, bolt: 2 }[spec.pattern || "none"];
  const u = {
    uTrim: { value: col(spec.trim || spec.color) },
    uPat: { value: pattern },
    uGi: { value: spec.kind === "gi" ? 1 : 0 },
    uLeg: { value: LEG_KINDS.has(spec.kind) ? 1 : 0 },
    uReg: { value: new THREE.Vector4(R.yLo, R.yHi, R.xMax, R.vneck ? R.vneck[0] : 9) },
    uSlope: { value: R.vneck ? R.vneck[1] : 0 },
    uArmY: { value: L.armY },
    uTime: shared.uTime,
    ...shared,
  };
  m.userData.u = u;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vG;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvG = position;");
    sh.fragmentShader = sh.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
varying vec3 vG;
uniform vec3 uTrim; uniform float uPat; uniform float uGi; uniform float uLeg; uniform vec4 uReg; uniform float uSlope; uniform float uArmY; uniform float uTime;
uniform vec3 uGlow; uniform float uGlowI; uniform float uHit;
float trimE = 0.0;
float band(float v, float a, float w) { return 1.0 - smoothstep(0.0, w, abs(v - a)); }`
      )
      .replace(
        "#include <map_fragment>",
        `#include <map_fragment>
  {
    float ax = abs(vG.x);
    float h = (vG.y - uReg.x) / max(0.01, uReg.y - uReg.x);
    float trim = 0.0;
    // hems & waistband
    if (uLeg > 0.5) trim = max(trim, step(uReg.y - 0.035, vG.y));
    trim = max(trim, step(vG.y, uReg.x + 0.022) * (1.0 - uLeg * 0.0));
    if (uLeg < 0.5) trim = max(trim, step(uReg.z - 0.028, ax) * step(0.3, ax));
    // gi lapels along the V opening + wrap overlap line
    if (uGi > 0.5) {
      float d = ax - (vG.y - uReg.w) * uSlope;
      trim = max(trim, step(uReg.w, vG.y) * step(0.0, vG.z) * (1.0 - smoothstep(0.03, 0.04, d)));
      trim = max(trim, band(vG.x + (vG.y - uReg.w) * 0.42, 0.0, 0.006) * step(vG.y, uReg.w) * step(0.0, vG.z) * step(uReg.x + 0.2, vG.y));
    }
    // flames licking up from the hems
    if (uPat > 0.5 && uPat < 1.5) {
      float a = atan(vG.z, vG.x - sign(vG.x) * 0.1);
      float tongue = 0.18 + 0.22 * pow(0.5 + 0.5 * sin(a * 7.0 + vG.y * 9.0), 2.0) + 0.06 * sin(a * 23.0);
      float f = step(h, tongue);
      trim = max(trim, f);
      trimE = max(trimE, f * smoothstep(tongue, tongue - 0.12, h) * 0.9);
    }
    // lightning piping down the outer legs / along the arms + chest bolt
    if (uPat > 1.5) {
      float zig = abs(fract(vG.y * 7.0) - 0.5) * 0.05;
      float zigA = abs(fract(ax * 7.0) - 0.5) * 0.05;
      float l = uLeg > 0.5 ? band(ax, 0.155 + zig, 0.007) * step(vG.z, 0.02) : band(vG.y, uArmY + 0.035 + zigA, 0.007) * step(0.24, ax);
      float chest = uLeg < 0.5 ? band(vG.x * 0.8 + (vG.y - 1.25) * 0.5 + abs(fract(vG.y * 9.0) - 0.5) * 0.06, 0.0, 0.008) * step(0.0, vG.z) * step(1.05, vG.y) * step(vG.y, 1.42) : 0.0;
      float e = max(l, chest);
      trim = max(trim, e);
      trimE = max(trimE, e * (0.85 + 0.15 * sin(uTime * 14.0 + vG.y * 30.0)));
    }
    diffuseColor.rgb = mix(diffuseColor.rgb, uTrim, clamp(trim, 0.0, 1.0));
  }`
      )
      .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>\n  totalEmissiveRadiance += uTrim * trimE * 2.2;${glowChunk()}`);
  };
  m.customProgramCacheKey = () => "ifa-cloth";
  return m;
}

/* ================================================================ gear */
function gearMat(spec, kind, shared) {
  const metal = kind === "metal" || kind === "gold";
  // only leather needs the (costlier) physical clearcoat; everything else is standard PBR
  const leather = kind === "leather";
  const M = leather ? THREE.MeshPhysicalMaterial : THREE.MeshStandardMaterial;
  const m = new M({
    color: col(spec.color || "#222"),
    roughness: leather ? 0.38 : metal ? 0.28 : kind === "glow" ? 0.3 : 0.75,
    metalness: metal ? 1 : 0,
    ...(leather ? { clearcoat: 0.6, clearcoatRoughness: 0.35 } : {}),
    envMapIntensity: metal ? 1.4 : 0.9,
    emissive: kind === "glow" ? col(spec.color) : new THREE.Color(0),
    emissiveIntensity: kind === "glow" ? 2.4 : 0,
    side: kind === "cloth" ? THREE.DoubleSide : THREE.FrontSide,
  });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, shared);
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nuniform vec3 uGlow; uniform float uGlowI; uniform float uHit;").replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>${glowChunk()}`);
  };
  m.customProgramCacheKey = () => "ifa-gear";
  return m;
}

/** Solid elliptic band (belts, headbands, cuffs): axis Y, unit radius scaled. */
const band = (rx, rz, h, seg = 40) => {
  const g = new THREE.CylinderGeometry(1, 1, h, seg, 1, false);
  g.scale(rx, 1, rz);
  return g;
};
/** Cylinder along X (arms in the T-pose). */
const barX = (r0, r1, len, seg = 20) => {
  const g = new THREE.CylinderGeometry(r1, r0, len, seg, 1, false);
  g.rotateZ(-Math.PI / 2);
  return g;
};

/**
 * Build every gear piece of a look. Returns [{ bone, geo, mat, pos:[x,y,z] (rest world), rot?:[x,y,z], scl? }].
 * Sides: l = +X (fighter's left), r = −X.
 */
function gearPieces(look, L, M) {
  const out = [];
  const add = (bone, geo, mat, pos, rot = [0, 0, 0], scl = [1, 1, 1]) => out.push({ bone, geo, mat, pos, rot, scl });
  const sides = [
    ["l", 1],
    ["r", -1],
  ];
  for (const g of look.gear || []) {
    switch (g.g) {
      case "belt":
      case "sash": {
        const y = L.pelvis + 0.055;
        const s = L.section(y, 0.3);
        add("pelvis", band(s.rx + 0.014, s.rz + 0.014, g.g === "sash" ? 0.055 : 0.042), M(g, "cloth"), [s.cx, y, s.cz]);
        // knot + hanging tails
        const fz = s.cz + s.rz + 0.02;
        add("pelvis", new THREE.BoxGeometry(0.06, 0.045, 0.022), M(g, "cloth"), [0.0, y, fz]);
        for (const [i, k] of [
          [0, 1],
          [1, -1],
        ]) {
          void i;
          const len = g.g === "sash" ? 0.34 : 0.24;
          const tail = new THREE.BoxGeometry(0.042, len, 0.012);
          tail.translate(0, -len / 2, 0);
          add("pelvis", tail, M(g, "cloth"), [k * 0.03, y - 0.01, fz + 0.004], [0.08, 0, k * 0.12]);
        }
        break;
      }
      case "headband": {
        const y = L.bones.Head.y + 0.135;
        const s = L.section(y, 0.13, 0.008);
        add("Head", band(s.rx + 0.012, s.rz + 0.012, 0.034), M(g, "cloth"), [s.cx, y, s.cz]);
        if (g.tails)
          for (const k of [1, -1]) {
            const tail = new THREE.BoxGeometry(0.035, 0.26, 0.008);
            tail.translate(0, -0.13, 0);
            add("Head", tail, M(g, "cloth"), [k * 0.025, y, s.cz - s.rz - 0.015], [-0.35, 0, k * 0.22]);
          }
        break;
      }
      case "wraps":
        for (const [sd, k] of sides) {
          const a = L.armSection(L.wrist - 0.03);
          add(`lowerarm_${sd}`, barX(a.ry + 0.01, a.ry + 0.012, 0.08), M(g, "cloth"), [k * (L.wrist - 0.035), a.cy, a.cz], [0, 0, 0], [1, 1, a.rz / Math.max(0.01, a.ry)]);
          add(`hand_${sd}`, barX(0.042, 0.045, 0.06), M(g, "cloth"), [k * (L.wrist + 0.045), a.cy - 0.005, a.cz + 0.006], [0, 0, 0], [1, 0.62, 1.15]);
        }
        break;
      case "gloves":
      case "gauntlets": {
        const gl = g.g === "gloves";
        for (const [sd, k] of sides) {
          const a = L.armSection(L.wrist - 0.04);
          if (gl) {
            const R = g.mma ? [0.072, 0.048, 0.054] : [0.088, 0.064, 0.066];
            const fist = new THREE.SphereGeometry(1, 28, 20);
            add(`hand_${sd}`, fist, M(g, "leather"), [k * (L.wrist + 0.07), a.cy - 0.012, a.cz + 0.008], [0, 0, 0], R);
            add(`hand_${sd}`, barX(a.ry + 0.018, a.ry + 0.024, 0.075), M(g, "leather"), [k * (L.wrist - 0.005), a.cy, a.cz], [0, 0, 0], [1, 1, 1.05]);
            add(`hand_${sd}`, barX(a.ry + 0.026, a.ry + 0.026, 0.02), M({ color: g.trim }, "cloth"), [k * (L.wrist - 0.02), a.cy, a.cz]);
          } else {
            const len = (L.wrist - L.elbow) * 0.8;
            const mid = L.elbow + (L.wrist - L.elbow) * 0.55;
            const s = L.armSection(mid);
            add(`lowerarm_${sd}`, barX(s.ry + 0.016, s.ry + 0.028, len), M(g, "metal"), [k * mid, s.cy, s.cz], [0, 0, 0], [1, 1, 1.1]);
            for (const f of [0.2, 0.5, 0.8]) add(`lowerarm_${sd}`, barX(s.ry + 0.03 - f * 0.01, s.ry + 0.03 - f * 0.01, 0.012), M({ color: g.trim }, g.glow ? "glow" : "metal"), [k * (L.elbow + (L.wrist - L.elbow) * (0.15 + f * 0.75)), s.cy, s.cz]);
            add(`hand_${sd}`, new THREE.SphereGeometry(1, 20, 14), M(g, "metal"), [k * (L.wrist + 0.06), a.cy + 0.02, a.cz], [0, 0, 0], [0.06, 0.03, 0.05]);
          }
        }
        break;
      }
      case "armGuards":
        for (const [sd, k] of sides) {
          const len = (L.wrist - L.elbow) * 0.72;
          const mid = L.elbow + (L.wrist - L.elbow) * 0.55;
          const s = L.armSection(mid);
          add(`lowerarm_${sd}`, barX(s.ry + 0.01, s.ry + 0.02, len), M(g, "leather"), [k * mid, s.cy, s.cz], [0, 0, 0], [1, 1, 1.1]);
          add(`lowerarm_${sd}`, barX(s.ry + 0.022, s.ry + 0.022, 0.012), M({ color: g.trim }, "glow"), [k * (mid + len * 0.42), s.cy, s.cz]);
          add(`lowerarm_${sd}`, barX(s.ry + 0.016, s.ry + 0.016, 0.012), M({ color: g.trim }, "glow"), [k * (mid - len * 0.42), s.cy, s.cz]);
        }
        break;
      case "shinGuards":
        for (const [sd, k] of sides) {
          const y0 = L.ankle + 0.07;
          const y1 = L.knee - 0.02;
          const s = L.legSection((y0 + y1) / 2);
          const geo = new THREE.CylinderGeometry(s.rx + 0.022, s.rx + 0.012, y1 - y0, 20, 1, true, -Math.PI * 0.62, Math.PI * 1.24);
          add(`calf_${sd}`, geo, M(g, "leather"), [k * s.cx, (y0 + y1) / 2, s.cz + 0.01], [0, 0, 0], [1, 1, (s.rz + 0.022) / (s.rx + 0.022)]);
          const stripe = new THREE.CylinderGeometry(s.rx + 0.024, s.rx + 0.022, 0.03, 20, 1, true, -Math.PI * 0.62, Math.PI * 1.24);
          add(`calf_${sd}`, stripe, M({ color: g.trim }, "leather"), [k * s.cx, y1 - 0.05, s.cz + 0.01], [0, 0, 0], [1, 1, (s.rz + 0.024) / (s.rx + 0.024)]);
        }
        break;
      case "kneePads":
        for (const [sd, k] of sides) {
          const ks = L.legSection(L.knee);
          const kp = new THREE.SphereGeometry(1, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.6);
          kp.rotateX(Math.PI / 2);
          add(`calf_${sd}`, kp, M(g, "leather"), [k * ks.cx, L.knee + 0.01, ks.cz + ks.rz - 0.022], [0, 0, 0], [0.068, 0.08, 0.034]);
          add(`calf_${sd}`, band(ks.rx + 0.012, ks.rz + 0.012, 0.06), M(g, "cloth"), [k * ks.cx, L.knee + 0.0, ks.cz]);
        }
        break;
      case "boots":
        for (const [sd, k] of sides) {
          const y = L.ankle + 0.07;
          const s = L.legSection(y);
          add(`calf_${sd}`, band(s.rx + 0.018, s.rz + 0.018, 0.12), M(g, "leather"), [k * s.cx, y, s.cz]);
        }
        break;
      case "chain": {
        const y = L.neck - 0.035;
        const s = L.section(y, 0.12, 0.01);
        const t = new THREE.TorusGeometry(1, 0.075, 8, 40);
        t.rotateX(Math.PI / 2);
        add("spine_03", t, M(g, "gold"), [s.cx, y - 0.02, s.cz + 0.01], [0.35, 0, 0], [s.rx + 0.012, 0.12, s.rz + 0.03]);
        add("spine_03", new THREE.CylinderGeometry(0.022, 0.022, 0.008, 16).rotateX(Math.PI / 2), M(g, "gold"), [0, y - 0.1, s.cz + s.rz + 0.04]);
        break;
      }
      case "champBelt": {
        const y = L.pelvis + 0.05;
        const s = L.section(y, 0.3);
        add("pelvis", band(s.rx + 0.02, s.rz + 0.02, 0.085), M({ color: "#1a1410" }, "leather"), [s.cx, y, s.cz]);
        const plate = new THREE.CylinderGeometry(0.11, 0.11, 0.022, 32);
        plate.rotateX(Math.PI / 2);
        plate.scale(1.25, 0.95, 1);
        add("pelvis", plate, M(g, "gold"), [0, y, s.cz + s.rz + 0.028]);
        const gem = new THREE.SphereGeometry(0.03, 20, 14);
        add("pelvis", gem, M({ color: "#c81e2a" }, "glow"), [0, y, s.cz + s.rz + 0.042], [0, 0, 0], [0.7, 0.7, 0.4]);
        for (const k of [1, -1]) {
          const side = new THREE.BoxGeometry(0.07, 0.07, 0.016);
          add("pelvis", side, M(g, "gold"), [k * (s.rx * 0.74), y, s.cz + s.rz * 0.7 + 0.022], [0, k * 0.75, 0]);
        }
        break;
      }
      case "shoulderPads":
        for (const [sd, k] of sides) {
          const dome = new THREE.SphereGeometry(1, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.55);
          add(`upperarm_${sd}`, dome, M(g, "gold"), [k * (L.shoulder + 0.04), L.armY + 0.035, -0.04], [0, 0, k * -0.35], [0.1, 0.075, 0.1]);
          const rim = new THREE.TorusGeometry(1, 0.06, 6, 32);
          rim.rotateX(Math.PI / 2);
          add(`upperarm_${sd}`, rim, M({ color: g.trim }, "glow"), [k * (L.shoulder + 0.04), L.armY + 0.035, -0.04], [0, 0, k * -0.35], [0.1, 0.1, 0.1]);
        }
        break;
      case "ninjaMask": {
        // glowing eyes + forehead plate (the hood itself is painted on the skin)
        const ey = L.eye.y;
        for (const k of [1, -1]) {
          const e = new THREE.SphereGeometry(1, 14, 10);
          add("Head", e, M({ color: g.eyes }, "glow"), [k * 0.031, ey, L.eye.z - 0.004], [0, 0, k * 0.12], [0.017, 0.0065, 0.006]);
        }
        add("Head", new THREE.BoxGeometry(0.07, 0.03, 0.012), M({ color: "#5a5a66" }, "metal"), [0, ey + 0.06, L.eye.z + 0.012], [-0.25, 0, 0]);
        break;
      }
      case "scarf": {
        const y = L.neck - 0.0;
        const s = L.section(y, 0.1, 0.01);
        add("spine_03", band(s.rx + 0.03, s.rz + 0.03, 0.07), M(g, "cloth"), [s.cx, y - 0.02, s.cz]);
        for (const k of [1, -1]) {
          const tail = new THREE.BoxGeometry(0.075, 0.5, 0.012);
          tail.translate(0, -0.25, 0);
          add("spine_03", tail, M(g, "cloth"), [k * 0.04, y - 0.02, s.cz - s.rz - 0.045], [-0.42, k * 0.15, k * 0.1]);
        }
        break;
      }
      default:
        break;
    }
  }
  return out;
}

/** Curl the fingers into fists (no clip animates fingers). */
function makeFists(B) {
  const q = new THREE.Quaternion();
  const ax = new THREE.Vector3(1, 0, 0);
  for (const side of ["l", "r"]) {
    for (const f of ["index", "middle", "ring", "pinky"])
      for (let j = 1; j <= 3; j++) {
        const b = B[`${f}_0${j}_${side}`];
        if (b) b.quaternion.multiply(q.setFromAxisAngle(ax, j === 1 ? 1.25 : 1.45));
      }
    for (let j = 1; j <= 3; j++) {
      const b = B[`thumb_0${j}_${side}`];
      if (b) b.quaternion.multiply(q.setFromAxisAngle(new THREE.Vector3(0, 0, side === "l" ? 1 : -1), 0.45));
    }
  }
}

/* ================================================================ rig */
export function createFighterRig(assets, look) {
  const body = look.body === "f" ? "f" : "m";
  const L = assets.land[body];
  const root = new THREE.Group();
  const model = skClone(assets.bodies[body].scene);
  root.add(model);
  const B = {};
  const meshes = [];
  model.traverse((o) => {
    if (o.isBone) B[o.name] = o;
    if (o.isMesh) meshes.push(o);
  });
  model.updateMatrixWorld(true);
  const shared = { uGlow: { value: new THREE.Color(0) }, uGlowI: { value: 0 }, uHit: { value: 0 }, uTime: { value: 0 } };
  const mats = [];
  const geos = [];
  const hairMat = new THREE.MeshPhysicalMaterial({ color: col(look.hairColor || "#1a1410"), roughness: 0.55, metalness: 0, sheen: 1, sheenRoughness: 0.4, sheenColor: col(look.hairColor || "#1a1410").lerp(new THREE.Color("#fff"), 0.4), side: THREE.DoubleSide });
  mats.push(hairMat);
  const headInv = B.Head.matrixWorld.clone().invert();
  let skin = null;
  let bodyMesh = null;
  for (const o of meshes) {
    o.castShadow = true;
    o.receiveShadow = true;
    o.frustumCulled = false;
    if (HAIRS.includes(o.name)) {
      const want = !look.paint?.hood && (o.name === look.hair || (o.name === "Hair_Beard" && look.beard));
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
      skin = skinMaterial(o.material, look, assets, body, L, shared);
      o.material = skin;
      mats.push(skin);
      bodyMesh = o;
    } else if (o.material?.name === "Hair") {
      o.material = hairMat; // eyebrows
    } else {
      o.material = o.material.clone();
      mats.push(o.material);
    }
  }
  // cloth shells bound to the body's skeleton
  for (const spec of look.shells || []) {
    const R = garmentRegion(spec.kind, L);
    if (!R || !bodyMesh) continue;
    const gm = new THREE.SkinnedMesh(shellGeometry(bodyMesh.geometry, body, spec.kind, R), clothMaterial(spec, L, shared));
    gm.position.copy(bodyMesh.position);
    gm.quaternion.copy(bodyMesh.quaternion);
    gm.scale.copy(bodyMesh.scale);
    gm.bind(bodyMesh.skeleton, bodyMesh.bindMatrix);
    gm.castShadow = true;
    gm.receiveShadow = true;
    gm.frustumCulled = false;
    bodyMesh.parent.add(gm);
    mats.push(gm.material);
  }
  // rigid gear in rest-world space → bone space
  const matCache = new Map();
  const M = (spec, kind) => {
    const key = `${spec.color}|${kind}`;
    if (!matCache.has(key)) {
      const m = gearMat(spec, kind, shared);
      matCache.set(key, m);
      mats.push(m);
    }
    return matCache.get(key);
  };
  const W = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  for (const p of gearPieces(look, L, M)) {
    const bone = B[p.bone];
    if (!bone) continue;
    const mesh = new THREE.Mesh(p.geo, p.mat);
    geos.push(p.geo);
    W.compose(new THREE.Vector3(...p.pos), q.setFromEuler(e.set(...p.rot)), new THREE.Vector3(...p.scl));
    mesh.matrix.copy(bone.matrixWorld).invert().multiply(W);
    mesh.matrix.decompose(mesh.position, mesh.quaternion, mesh.scale);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    bone.add(mesh);
  }
  makeFists(B);
  const s = look.scale || 1;
  const g = look.girth || 1;
  model.scale.set(s * g, s, s * g);

  return {
    root,
    model,
    bones: B,
    body,
    height: L.top * s,
    uniforms: shared,
    setHit(v) {
      shared.uHit.value = v;
    },
    setGlow(color, intensity) {
      if (color) shared.uGlow.value.set(color);
      shared.uGlowI.value = intensity;
    },
    tick(t) {
      shared.uTime.value = t;
    },
    dispose() {
      model.traverse((o) => o.isSkinnedMesh && o.skeleton.dispose());
      mats.forEach((m) => m.dispose());
      geos.forEach((gg) => gg.dispose());
    },
  };
}
