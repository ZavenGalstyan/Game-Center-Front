/**
 * Last Hope — shared materials and the shader patches every world surface
 * gets:
 *
 *  cutout   anything between the camera and the player, above knee height,
 *           inside a screen circle around the player is dithered away, so
 *           walls, roofs and canopies never hide the survivor (works for
 *           instanced meshes too, no per-object bookkeeping)
 *  detail   world-space grime / colour breakup + darker contact with the
 *           ground on vertex-coloured models
 *  wind     foliage sways by the per-vertex `wind` weight and instance phase
 *  glow     emissive buckets light up in their vertex colour
 */
import * as THREE from "three";
import { tex } from "./textures.js";

export const CUT = {
  uCutP: { value: new THREE.Vector3(-9999, -9999, 1) },
  uCutR: { value: 140 },
  uTime: { value: 0 },
  uWind: { value: 0.6 },
};

function patch(mat, o) {
  const key = `lh-${o.cut ? "c" : ""}${o.detail ? "d" : ""}${o.wind ? "w" : ""}${o.glow ? "g" : ""}${o.tex ? "t" : ""}${o.up ? "u" : ""}`;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, CUT);
    let vs = sh.vertexShader;
    let fs = sh.fragmentShader;
    vs = vs.replace(
      "#include <common>",
      `#include <common>
uniform float uTime; uniform float uWind;
varying vec3 vLhW;
${o.wind ? "attribute float wind;" : ""}`
    );
    if (o.wind)
      vs = vs.replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
  {
    vec3 ip = vec3(0.0);
    #ifdef USE_INSTANCING
      ip = instanceMatrix[3].xyz;
    #endif
    float ph = ip.x * 0.37 + ip.z * 0.53;
    float sway = sin(uTime * 1.7 + ph) * 0.6 + sin(uTime * 3.1 + ph * 1.7) * 0.25;
    transformed.x += sway * wind * 0.12 * uWind * (1.0 + 0.5 * uWind);
    transformed.z += cos(uTime * 1.3 + ph) * wind * 0.08 * uWind;
  }`
      );
    vs = vs.replace(
      "#include <project_vertex>",
      `#include <project_vertex>
  {
    vec4 lhw = vec4(transformed, 1.0);
    #ifdef USE_INSTANCING
      lhw = instanceMatrix * lhw;
    #endif
    vLhW = (modelMatrix * lhw).xyz;
  }`
    );
    fs = fs.replace(
      "#include <common>",
      `#include <common>
uniform vec3 uCutP; uniform float uCutR; uniform float uTime;
varying vec3 vLhW;
float lhH(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float lhN(vec3 p) { vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(lhH(i), lhH(i + vec3(1,0,0)), f.x), mix(lhH(i + vec3(0,1,0)), lhH(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(lhH(i + vec3(0,0,1)), lhH(i + vec3(1,0,1)), f.x), mix(lhH(i + vec3(0,1,1)), lhH(i + vec3(1,1,1)), f.x), f.y), f.z); }
float lhBayer(vec2 p) { vec2 q = mod(floor(p), 4.0);
  float b = q.x * 4.0 + q.y; // 4x4 ordered dither
  return fract(sin(b * 12.9898) * 43758.5453) * 0.25 + mod(q.x + q.y * 2.0, 4.0) / 4.0; }`
    );
    if (o.cut)
      fs = fs.replace(
        "#include <clipping_planes_fragment>",
        `#include <clipping_planes_fragment>
  if (vLhW.y > 1.15 && gl_FragCoord.z < uCutP.z) {
    vec2 dd = gl_FragCoord.xy - uCutP.xy;
    dd.y *= 0.85;
    float rr = length(dd) / uCutR;
    float keep = smoothstep(0.55, 1.0, rr) + smoothstep(1.15, 2.4, vLhW.y) * 0.0;
    if (rr < 1.0 && keep < lhBayer(gl_FragCoord.xy)) discard;
  }`
      );
    if (o.detail)
      fs = fs.replace(
        "#include <color_fragment>",
        `#include <color_fragment>
  {
    float g1 = lhN(vLhW * 1.7);
    float g2 = lhN(vLhW * 6.3 + 3.0);
    diffuseColor.rgb *= mix(0.86, 1.08, g1 * 0.7 + g2 * 0.3);
    float grime = smoothstep(0.55, 0.9, lhN(vLhW * 0.9 + 11.0));
    diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.78, 0.74, 0.66), grime * 0.35);
    diffuseColor.rgb *= mix(0.74, 1.0, smoothstep(0.0, 0.22, vLhW.y));
  }`
      );
    if (o.up)
      fs = fs.replace(
        "#include <normal_fragment_maps>",
        `#include <normal_fragment_maps>
  normal = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);`
      );
    if (o.glow)
      fs = fs.replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
  totalEmissiveRadiance = diffuseColor.rgb * 2.2;`
      );
    sh.vertexShader = vs;
    sh.fragmentShader = fs;
  };
  mat.customProgramCacheKey = () => key;
  return mat;
}

let M = null;
/** The shared material set (created once per WebGL world). */
export function materials() {
  if (M) return M;
  const std = (p) => new THREE.MeshStandardMaterial({ vertexColors: true, ...p });
  M = {
    m: patch(std({ roughness: 0.86, metalness: 0 }), { cut: true, detail: true }),
    s: patch(std({ roughness: 0.48, metalness: 0.05 }), { cut: true, detail: true }),
    x: patch(std({ roughness: 0.4, metalness: 0.7 }), { cut: true, detail: true }),
    e: patch(std({ roughness: 0.5, emissive: "#ffffff", emissiveIntensity: 1 }), { cut: true, glow: true }),
    g: patch(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.08, metalness: 0.4, transparent: true, opacity: 0.62, depthWrite: false }), { cut: true }),
    f: patch(std({ roughness: 0.82, metalness: 0 }), { cut: true, detail: true, wind: true }),
    r: patch(std({ roughness: 0.92, metalness: 0 }), { cut: true, detail: true }),
    b: patch(new THREE.MeshStandardMaterial({ vertexColors: true, map: tex("blades", 128).map, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.9 }), { wind: true, up: true }),
  };
  // characters / items that must never be cut away use plain copies
  M.plain = {
    m: std({ roughness: 0.86 }),
    s: std({ roughness: 0.48 }),
    x: std({ roughness: 0.4, metalness: 0.7 }),
    e: patch(std({ roughness: 0.5, emissive: "#ffffff" }), { glow: true }),
    g: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.08, metalness: 0.4, transparent: true, opacity: 0.6 }),
    f: std({ roughness: 0.82 }),
    r: std({ roughness: 0.92 }),
    b: M.b,
  };
  return M;
}

/** Textured wall / roof / floor materials (shared, per surface kind). */
const SURF = {};
const SURF_DEF = {
  siding0: ["siding", "#e8e4da", 0.85],
  siding1: ["siding", "#a8c4c8", 0.85],
  siding2: ["siding", "#d8c8a0", 0.85],
  siding3: ["siding", "#b8a8c0", 0.85],
  brick: ["brick", "#ffffff", 0.9],
  logs: ["logs", "#ffffff", 0.9],
  corrugated: ["corrugated", "#ffffff", 0.55, 0.45],
  concrete: ["wallconcrete", "#ffffff", 0.9],
  interior: ["interior", "#ffffff", 0.9],
  bunker: ["bunker", "#ffffff", 0.85],
  plaster: ["wallconcrete", "#e8e0d0", 0.9],
  shingles: ["shingles", "#ffffff", 0.9],
  metalroof: ["metalroof", "#ffffff", 0.5, 0.5],
  planks: ["planks", "#ffffff", 0.8],
  tile: ["tile", "#ffffff", 0.45],
  floorconcrete: ["concrete", "#ffffff", 0.85],
};
export function surface(kind, quality = "medium") {
  const k = `${kind}:${quality}`;
  if (SURF[k]) return SURF[k];
  const [t, color, rough, metal = 0] = SURF_DEF[kind] || SURF_DEF.plaster;
  const T = tex(t, quality === "low" ? 256 : 512);
  const mat = patch(new THREE.MeshStandardMaterial({ map: T.map, normalMap: T.normal, color, roughness: rough, metalness: metal }), { cut: true, tex: true });
  mat.normalScale = new THREE.Vector2(0.9, 0.9);
  SURF[k] = mat;
  return mat;
}

export function disposeMaterials() {
  if (M) {
    for (const m of Object.values(M)) if (m.isMaterial) m.dispose();
    for (const m of Object.values(M.plain)) if (m.isMaterial && m !== M.b) m.dispose();
  }
  M = null;
  for (const k of Object.keys(SURF)) {
    SURF[k].dispose();
    delete SURF[k];
  }
}
