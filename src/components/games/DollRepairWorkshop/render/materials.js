/**
 * Materials. Doll surfaces get the grime patch: a per-vertex vec4 attribute
 * `aGrime` (dust, dirt, stain, wet) that the cleaning tools lower vertex by
 * vertex. The shader breaks it up with object-space noise so dust looks
 * fuzzy, dirt blotchy and stains ringed; `uReveal` (UV dirt detector) makes
 * remaining grime glow.
 */
import * as THREE from "three";

export const grimeUniforms = { uReveal: { value: 0 } };

const GLSL_NOISE = /* glsl */ `
float gHash(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float gNoise(vec3 x){
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(gHash(i), gHash(i + vec3(1.0,0.0,0.0)), f.x), mix(gHash(i + vec3(0.0,1.0,0.0)), gHash(i + vec3(1.0,1.0,0.0)), f.x), f.y),
             mix(mix(gHash(i + vec3(0.0,0.0,1.0)), gHash(i + vec3(1.0,0.0,1.0)), f.x), mix(gHash(i + vec3(0.0,1.0,1.0)), gHash(i + vec3(1.0,1.0,1.0)), f.x), f.y), f.z);
}
`;

export function patchGrime(mat) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uReveal = grimeUniforms.uReveal;
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nattribute vec4 aGrime;\nvarying vec4 vGrime;\nvarying vec3 vGPos;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvGrime = aGrime;\nvGPos = position;");
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform float uReveal;\nvarying vec4 vGrime;\nvarying vec3 vGPos;\n" + GLSL_NOISE)
      .replace(
        "#include <map_fragment>",
        `#include <map_fragment>
float gN = gNoise(vGPos * 46.0) * 0.6 + gNoise(vGPos * 120.0) * 0.4;
float gN2 = gNoise(vGPos * 15.0 + 7.3);
float dustC = smoothstep(0.06, 0.85, vGrime.x * (0.5 + 0.9 * gN));
float dirtC = smoothstep(0.2, 0.7, vGrime.y + (gN2 - 0.5) * 0.65) * min(1.0, vGrime.y * 2.5);
float stainC = smoothstep(0.12, 0.55, vGrime.z + (gN - 0.5) * 0.15);
float stainEdge = smoothstep(0.1, 0.25, vGrime.z) - smoothstep(0.3, 0.6, vGrime.z);
float wetC = clamp(vGrime.w, 0.0, 1.0);
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.64, 0.6, 0.54) * (0.85 + 0.3 * gN), dustC * 0.88);
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.32, 0.23, 0.14) * (0.8 + 0.4 * gN), dirtC * 0.86);
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.45, 0.31, 0.13), stainC * 0.72);
diffuseColor.rgb *= 1.0 - stainEdge * 0.35;
diffuseColor.rgb *= 1.0 - 0.2 * wetC;
float grimeAll = max(max(dustC, dirtC), stainC);`,
      )
      .replace(
        "#include <roughnessmap_fragment>",
        `#include <roughnessmap_fragment>
roughnessFactor = mix(roughnessFactor, 0.96, max(dustC, dirtC * 0.85));
roughnessFactor = mix(roughnessFactor, 0.12, wetC * 0.85);`,
      )
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
totalEmissiveRadiance += vec3(0.25, 1.0, 0.5) * uReveal * grimeAll * 0.75;`,
      );
  };
  mat.customProgramCacheKey = () => "grime1";
  mat.userData.grime = true;
  return mat;
}

/** A doll-surface material for a given kind; grime-patched. */
export function surfaceMat(kind, color, { map = null, bump = null, gloss = 0.5, grime = true, side = THREE.FrontSide } = {}) {
  let m;
  const col = new THREE.Color(color);
  switch (kind) {
    case "porcelain":
      m = new THREE.MeshPhysicalMaterial({ color: col, roughness: 0.32 - gloss * 0.12, clearcoat: 0.6 + gloss * 0.4, clearcoatRoughness: 0.12, sheen: 0.3, sheenColor: new THREE.Color("#ffd9d0") });
      break;
    case "resin":
      m = new THREE.MeshPhysicalMaterial({ color: col, roughness: 0.38, clearcoat: 0.3, clearcoatRoughness: 0.3, sheen: 0.5, sheenColor: new THREE.Color("#ffd0c8") });
      break;
    case "vinyl":
      m = new THREE.MeshPhysicalMaterial({ color: col, roughness: 0.48 - gloss * 0.12, clearcoat: 0.12, sheen: 0.45, sheenColor: new THREE.Color("#ffc9b8") });
      break;
    case "wood":
      m = new THREE.MeshStandardMaterial({ color: col, map, roughness: 0.58 });
      break;
    case "plush":
      m = new THREE.MeshPhysicalMaterial({ color: col, map, bumpMap: bump, bumpScale: 1.4, roughness: 0.95, sheen: 1, sheenRoughness: 0.5, sheenColor: col.clone().offsetHSL(0, -0.1, 0.2) });
      break;
    case "cloth":
    case "fabric":
      m = new THREE.MeshPhysicalMaterial({ color: col, map, roughness: 0.86, sheen: 0.6, sheenRoughness: 0.7, sheenColor: col.clone().offsetHSL(0, -0.05, 0.15), side });
      break;
    case "velvet":
      m = new THREE.MeshPhysicalMaterial({ color: col, map, roughness: 0.75, sheen: 1, sheenRoughness: 0.35, sheenColor: col.clone().offsetHSL(0, 0, 0.25), side });
      break;
    case "satin":
      m = new THREE.MeshPhysicalMaterial({ color: col, map, roughness: 0.35, sheen: 0.8, sheenRoughness: 0.25, sheenColor: col.clone().offsetHSL(0, -0.1, 0.25), clearcoat: 0.15, side });
      break;
    case "leather":
      m = new THREE.MeshPhysicalMaterial({ color: col, roughness: 0.35, clearcoat: 0.5, clearcoatRoughness: 0.25 });
      break;
    case "metal":
      m = new THREE.MeshStandardMaterial({ color: col, roughness: 0.25, metalness: 1 });
      break;
    case "glass":
      m = new THREE.MeshPhysicalMaterial({ color: col, roughness: 0.05, transmission: 0, clearcoat: 1, clearcoatRoughness: 0.02, transparent: true, opacity: 0.35 });
      break;
    default:
      m = new THREE.MeshStandardMaterial({ color: col, map, roughness: 0.6 });
  }
  if (map && !m.map) m.map = map;
  if (grime) patchGrime(m);
  return m;
}

/** Plain material helper for the room/props (no grime). */
export function mat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: 0.7, ...opts });
}
