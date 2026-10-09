/**
 * Mountain Journey — shared materials (cached per key, disposed on unmount)
 * and the foliage wind-sway shader patch. One uniform set drives every
 * swaying material, updated once per frame by <GameScene>.
 */
import * as THREE from "three";
import { rockTex, barkTex, plankTex, groundDetail } from "./textures.js";

const cache = new Map();
export const windUniforms = { uTime: { value: 0 }, uWind: { value: 0.35 } };

function get(key, fn) {
  if (!cache.has(key)) cache.set(key, fn());
  return cache.get(key);
}

/** Bends vertices with height (instanced foliage / grass / cloth). */
export function addSway(mat, { strength = 0.04, rigid = 0.0 } = {}) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = windUniforms.uTime;
    shader.uniforms.uWind = windUniforms.uWind;
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
         uniform float uTime;
         uniform float uWind;`,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
         vec3 swBase = vec3(0.0);
         #ifdef USE_INSTANCING
           swBase = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
         #endif
         float swH = max(0.0, position.y - ${rigid.toFixed(2)});
         float swP = uTime * 1.7 + swBase.x * 0.23 + swBase.z * 0.19;
         float swA = ${strength.toFixed(3)} * uWind * swH * swH;
         transformed.x += (sin(swP) + 0.35 * sin(swP * 2.7)) * swA;
         transformed.z += cos(swP * 0.83) * swA * 0.6;`,
      );
  };
  mat.customProgramCacheKey = () => `sway${strength}${rigid}`;
  return mat;
}

/**
 * Terrain: vertex colours × a world-space detail texture sampled triplanar —
 * ground grain on flat ground, rock strata on steep faces, no stretching.
 */
function triplanarTerrain() {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, metalness: 0 });
  const ground = groundDetail();
  const rock = rockTex();
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uGround = { value: ground };
    shader.uniforms.uRock = { value: rock };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vTpPos;\nvarying vec3 vTpNrm;")
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvTpPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvTpNrm = normalize(mat3(modelMatrix) * objectNormal);",
      );
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform sampler2D uGround;\nuniform sampler2D uRock;\nvarying vec3 vTpPos;\nvarying vec3 vTpNrm;")
      .replace(
        "#include <map_fragment>",
        /* glsl */ `
        vec3 tpN = abs(normalize(vTpNrm));
        tpN = pow(tpN, vec3(4.0));
        tpN /= (tpN.x + tpN.y + tpN.z);
        float gTop = texture2D(uGround, vTpPos.xz / 7.0).r;
        float gFine = texture2D(uGround, vTpPos.xz / 1.6).r;
        float rX = texture2D(uRock, vTpPos.zy / 6.0).r;
        float rZ = texture2D(uRock, vTpPos.xy / 6.0).r;
        float rTop = texture2D(uRock, vTpPos.xz / 6.0).r;
        float steep = smoothstep(0.55, 0.85, 1.0 - tpN.y);
        float flatDetail = mix(gTop * (0.75 + gFine * 0.4), rTop, steep * 0.6);
        float detail = flatDetail * tpN.y + rX * tpN.x + rZ * tpN.z;
        diffuseColor.rgb *= 0.55 + detail * 0.75;
        `,
      );
  };
  mat.customProgramCacheKey = () => "mjTriplanar";
  return mat;
}

export const mats = {
  terrain: () => get("terrain", () => triplanarTerrain()),
  rock: (color = "#8a857c") =>
    get(`rock${color}`, () => {
      const t = rockTex();
      return new THREE.MeshStandardMaterial({ color, map: t, roughness: 0.92, flatShading: true });
    }),
  rockVC: () => get("rockVC", () => new THREE.MeshStandardMaterial({ vertexColors: true, map: rockTex(), roughness: 0.9, flatShading: true })),
  wetRock: () => get("wetRock", () => new THREE.MeshStandardMaterial({ color: "#7d8582", map: rockTex(), roughness: 0.55, metalness: 0, flatShading: true })),
  bark: (color = "#6b4a32") => get(`bark${color}`, () => new THREE.MeshStandardMaterial({ color, map: barkTex(), roughness: 0.95 })),
  wood: (color = "#8a5f3a") => get(`wood${color}`, () => new THREE.MeshStandardMaterial({ color, map: plankTex(), roughness: 0.85 })),
  plain: (color, opts = {}) => get(`plain${color}${JSON.stringify(opts)}`, () => new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...opts })),
  flat: (color, opts = {}) => get(`flat${color}${JSON.stringify(opts)}`, () => new THREE.MeshStandardMaterial({ color, roughness: 0.85, flatShading: true, ...opts })),
  glow: (color, intensity = 2) => get(`glow${color}${intensity}`, () => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity, roughness: 0.4, toneMapped: false })),
  metal: (color = "#6f6a64") => get(`metal${color}`, () => new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.75 })),
  rope: () => get("rope", () => new THREE.MeshStandardMaterial({ color: "#b89a6a", roughness: 1 })),
  foliage: () => get("foliage", () => addSway(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, flatShading: true }), { strength: 0.0045, rigid: 1.2 })),
  trunk: () => get("trunk", () => new THREE.MeshStandardMaterial({ vertexColors: true, map: barkTex(), roughness: 0.95 })),
  cloth: (color) => get(`cloth${color}`, () => addSway(new THREE.MeshStandardMaterial({ color, roughness: 0.9, side: THREE.DoubleSide }), { strength: 0.12, rigid: 0 })),
};

export function disposeMaterials() {
  for (const m of cache.values()) m.dispose?.();
  cache.clear();
}
