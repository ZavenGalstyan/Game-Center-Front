/**
 * Creature surface shading. Every monster material is a physically based
 * MeshStandard/MeshPhysical material extended (onBeforeCompile) with:
 *   - micro detail: procedural bump from 3D fbm noise in bind-pose object
 *     space (pores, wrinkles, pitted bone, hammered metal) — it sticks to
 *     the skin while the skeleton animates, no UVs needed
 *   - albedo variation: blotches, veins, grime, cavity darkening
 *   - roughness variation (wet / oily / polished patches)
 *   - glowing cracks (demon lava, guardian runes) with a pulse
 *   - rim light (cinematic silhouette separation), hit flash, dissolve death
 * Uniforms are shared per monster (one object) so a single write drives
 * every part of the creature.
 */
import * as THREE from "three";

export function creatureUniforms() {
  return {
    uTime: { value: 0 },
    uHit: { value: 0 },
    uHitColor: { value: new THREE.Color(1.0, 0.25, 0.15) },
    uDissolve: { value: 0 },
    uDissolveColor: { value: new THREE.Color(1.0, 0.45, 0.1) },
    uRimColor: { value: new THREE.Color(0.35, 0.45, 0.7) },
    uRim: { value: 0.35 },
    uGlow: { value: 1 },
  };
}

const NOISE = /* glsl */ `
float dsHash(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float dsNoise(vec3 x){
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(dsHash(i), dsHash(i + vec3(1,0,0)), f.x), mix(dsHash(i + vec3(0,1,0)), dsHash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(dsHash(i + vec3(0,0,1)), dsHash(i + vec3(1,0,1)), f.x), mix(dsHash(i + vec3(0,1,1)), dsHash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float dsFbm(vec3 p, int oct){ float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { if (i >= oct) break; s += a * dsNoise(p); p = p * 2.03 + 1.7; a *= 0.5; } return s; }
float dsCell(vec3 p){ vec3 i = floor(p); vec3 f = fract(p); float d = 1.0;
  for (int x = -1; x <= 1; x++) for (int y = -1; y <= 1; y++) for (int z = -1; z <= 1; z++) {
    vec3 g = vec3(float(x), float(y), float(z)); vec3 o = vec3(dsHash(i + g), dsHash(i + g + 7.1), dsHash(i + g + 13.7));
    vec3 r = g + o - f; d = min(d, dot(r, r)); }
  return sqrt(d); }
vec3 dsPerturb(vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float faceDirection){
  vec3 vSigmaX = normalize(dFdx(surf_pos)); vec3 vSigmaY = normalize(dFdy(surf_pos)); vec3 vN = surf_norm;
  vec3 R1 = cross(vSigmaY, vN); vec3 R2 = cross(vN, vSigmaX); float fDet = dot(vSigmaX, R1) * faceDirection;
  vec3 vGrad = sign(fDet) * (dHdxy.x * R1 + dHdxy.y * R2);
  return normalize(abs(fDet) * surf_norm - vGrad); }
`;

/**
 * recipe: {
 *   bump: [freq, amp, octaves]     micro relief (amp ~0.002–0.02)
 *   pores: [freq, amp]             cellular pits (skin pores / pitted bone)
 *   blotch: [hex, freq, amount]    multiply albedo towards a colour in patches
 *   veins: [hex, freq, width]      thin dark/bright vein lines
 *   cavity: amount                 darken low noise (dirt in crevices)
 *   wet: [freq, minRough]          glossy patches
 *   cracks: [hex, freq, width, intensity, pulse]  emissive crack network
 *   scale: object-space scale for noise (1 = metres)
 * }
 */
export function creatureMaterial(params, recipe = {}, U, physical = false) {
  const m = physical ? new THREE.MeshPhysicalMaterial(params) : new THREE.MeshStandardMaterial(params);
  const defs = [];
  if (recipe.bump) defs.push("DS_BUMP");
  if (recipe.pores) defs.push("DS_PORES");
  if (recipe.blotch) defs.push("DS_BLOTCH");
  if (recipe.veins) defs.push("DS_VEINS");
  if (recipe.cavity) defs.push("DS_CAVITY");
  if (recipe.wet) defs.push("DS_WET");
  if (recipe.cracks) defs.push("DS_CRACKS");
  if (recipe.tatter) defs.push("DS_TATTER");
  if (recipe.flutter) defs.push("DS_FLUTTER");
  if (recipe.mask) defs.push("DS_MASK");
  const r = recipe;
  const col = (h) => new THREE.Color(h);
  const local = {
    uBump: { value: new THREE.Vector3(...(r.bump || [1, 0, 1])) },
    uPores: { value: new THREE.Vector2(...(r.pores || [1, 0])) },
    uBlotch: { value: new THREE.Vector4(...col(r.blotch?.[0] ?? 0xffffff).toArray(), r.blotch?.[2] ?? 0) },
    uBlotchF: { value: r.blotch?.[1] ?? 1 },
    uVeins: { value: new THREE.Vector4(...col(r.veins?.[0] ?? 0).toArray(), r.veins?.[2] ?? 0.05) },
    uVeinsF: { value: r.veins?.[1] ?? 1 },
    uCavity: { value: r.cavity ?? 0 },
    uWet: { value: new THREE.Vector2(...(r.wet || [1, 1])) },
    uCracks: { value: new THREE.Vector4(...col(r.cracks?.[0] ?? 0).toArray(), r.cracks?.[3] ?? 0) },
    uCracksP: { value: new THREE.Vector3(r.cracks?.[1] ?? 1, r.cracks?.[2] ?? 0.05, r.cracks?.[4] ?? 0) },
    uNScale: { value: r.scale ?? 1 },
    uSatAlb: { value: r.sat ?? 1 },
    uTatter: { value: new THREE.Vector4(...(r.tatter || [1, 0, 0, -1])) },
    uFlutter: { value: new THREE.Vector3(...(r.flutter || [0, 1, 0])) },
    uMaskColor: { value: col(r.mask?.[0] ?? 0) },
    uMaskRough: { value: new THREE.Vector2(r.mask?.[1] ?? 0.8, r.mask?.[2] ?? 0) },
  };
  m.userData.dsUniforms = local;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U, local);
    sh.defines = sh.defines || {};
    for (const d of defs) sh.defines[d] = "";
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vDsPos;\nuniform float uTime;\nuniform vec3 uFlutter;\n#ifdef DS_MASK\nattribute float aMask;\nvarying float vDsMask;\n#endif")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvDsPos = position;\n#ifdef DS_MASK\nvDsMask = aMask;\n#endif")
      .replace(
        "#include <skinning_vertex>",
        `#include <skinning_vertex>
#ifdef DS_FLUTTER
  float dsFl = clamp((uFlutter.z - position.y) / 1.4, 0.0, 1.0);
  transformed.x += sin(uTime * uFlutter.y + position.y * 3.1 + position.z * 2.3) * uFlutter.x * dsFl;
  transformed.z += cos(uTime * uFlutter.y * 0.83 + position.y * 2.7 + position.x * 3.3) * uFlutter.x * dsFl * 0.6;
#endif`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
varying vec3 vDsPos;
uniform float uTime, uHit, uDissolve, uRim, uGlow, uBlotchF, uVeinsF, uCavity, uNScale, uSatAlb;
uniform vec3 uHitColor, uDissolveColor, uRimColor, uBump, uCracksP;
uniform vec2 uPores, uWet;
uniform vec4 uBlotch, uVeins, uCracks, uTatter;
uniform vec3 uMaskColor;
uniform vec2 uMaskRough;
#ifdef DS_MASK
varying float vDsMask;
#endif
${NOISE}`,
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
diffuseColor.rgb = mix(vec3(dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11))), diffuseColor.rgb, uSatAlb);
vec3 dsP = vDsPos * uNScale;
float dsDis = dsFbm(dsP * 9.0, 3);
if (uDissolve > 0.0 && dsDis < uDissolve * 1.15 - 0.05) discard;
#ifdef DS_TATTER
  if (dsFbm(vDsPos * uTatter.x, 4) < uTatter.y * (1.0 - smoothstep(uTatter.w, uTatter.z, vDsPos.y))) discard;
#endif
#ifdef DS_MASK
  diffuseColor.rgb = mix(diffuseColor.rgb, uMaskColor * (0.75 + 0.5 * dsFbm(dsP * 30.0, 2)), vDsMask);
#endif
#ifdef DS_BLOTCH
  float dsB = smoothstep(0.35, 0.75, dsFbm(dsP * uBlotchF, 4));
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * uBlotch.rgb, dsB * uBlotch.a);
#endif
#ifdef DS_VEINS
  float dsV = 1.0 - smoothstep(0.0, uVeins.a, abs(dsFbm(dsP * uVeinsF, 4) - 0.5));
  diffuseColor.rgb = mix(diffuseColor.rgb, uVeins.rgb, dsV * 0.75);
#endif
#ifdef DS_CAVITY
  float dsC = dsFbm(dsP * 22.0, 3);
  diffuseColor.rgb *= 1.0 - uCavity * smoothstep(0.55, 0.25, dsC);
#endif`,
      )
      .replace(
        "#include <roughnessmap_fragment>",
        `#include <roughnessmap_fragment>
#ifdef DS_MASK
  roughnessFactor = mix(roughnessFactor, uMaskRough.x, vDsMask);
#endif
#ifdef DS_WET
  roughnessFactor = mix(roughnessFactor, uWet.y, smoothstep(0.5, 0.7, dsFbm(dsP * uWet.x + 3.1, 3)));
#endif`,
      )
      .replace(
        "#include <normal_fragment_maps>",
        `#include <normal_fragment_maps>
#if defined(DS_BUMP) || defined(DS_PORES)
  float dsH = 0.0;
  #ifdef DS_BUMP
    dsH += dsFbm(dsP * uBump.x, int(uBump.z)) * uBump.y;
  #endif
  #ifdef DS_PORES
    dsH -= (1.0 - smoothstep(0.0, 0.35, dsCell(dsP * uPores.x))) * uPores.y;
  #endif
  normal = dsPerturb(-vViewPosition, normal, vec2(dFdx(dsH), dFdy(dsH)) * 60.0, faceDirection);
#endif`,
      )
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
vec3 dsV3 = normalize(vViewPosition);
float dsF = pow(1.0 - clamp(abs(dot(normal, dsV3)), 0.0, 1.0), 4.0);
totalEmissiveRadiance += uRimColor * dsF * uRim;
totalEmissiveRadiance += uHitColor * uHit * (0.25 + dsF * 1.6);
#ifdef DS_CRACKS
  float dsRn = dsFbm(dsP * uCracksP.x, 4);
  float dsRidge = 1.0 - abs(dsRn * 2.0 - 1.0);
  float dsCr = smoothstep(1.0 - uCracksP.y, 1.0, dsRidge) * smoothstep(0.35, 0.6, dsFbm(dsP * uCracksP.x * 0.45 + 7.3, 3));
  float dsPulse = 0.75 + 0.25 * sin(uTime * 2.2 + dsP.y * 6.0) * uCracksP.z;
  totalEmissiveRadiance += uCracks.rgb * dsCr * uCracks.a * dsPulse * uGlow;
  diffuseColor.rgb *= 1.0 - dsCr * 0.6;
#endif
if (uDissolve > 0.0) totalEmissiveRadiance += uDissolveColor * (1.0 - smoothstep(0.0, 0.06, dsDis - (uDissolve * 1.15 - 0.05))) * 4.0;`,
      );
  };
  m.customProgramCacheKey = () => `ds:${defs.join(",")}:${physical ? 1 : 0}`;
  return m;
}

/** Glowing eye: emissive core with a soft halo sprite added by the caller. */
export function eyeMaterial(color, intensity = 6) {
  return new THREE.MeshStandardMaterial({ color: 0x000000, emissive: new THREE.Color(color), emissiveIntensity: intensity, roughness: 0.2 });
}

/** Soft radial sprite texture (halos, particles). Generated once. */
let softTex = null;
export function softSprite() {
  if (softTex) return softTex;
  const s = 64;
  const data = new Uint8Array(s * s * 4);
  for (let y = 0; y < s; y++)
    for (let x = 0; x < s; x++) {
      const dx = (x + 0.5) / s - 0.5;
      const dy = (y + 0.5) / s - 0.5;
      const d = Math.min(1, Math.sqrt(dx * dx + dy * dy) * 2);
      const a = Math.pow(1 - d, 2.2);
      const i = (y * s + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = 255;
      data[i + 3] = Math.round(a * 255);
    }
  softTex = new THREE.DataTexture(data, s, s);
  softTex.needsUpdate = true;
  return softTex;
}

/** Tileable smoky noise texture (fog cards, smoke). */
let smokeTex = null;
export function smokeTexture() {
  if (smokeTex) return smokeTex;
  const s = 128;
  const data = new Uint8Array(s * s * 4);
  const h = (x, y) => {
    const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return n - Math.floor(n);
  };
  const vn = (x, y, p) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const w = (t) => t * t * (3 - 2 * t);
    const g = (a, b) => h(((a % p) + p) % p, ((b % p) + p) % p);
    return g(xi, yi) * (1 - w(xf)) * (1 - w(yf)) + g(xi + 1, yi) * w(xf) * (1 - w(yf)) + g(xi, yi + 1) * (1 - w(xf)) * w(yf) + g(xi + 1, yi + 1) * w(xf) * w(yf);
  };
  for (let y = 0; y < s; y++)
    for (let x = 0; x < s; x++) {
      let v = 0, a = 0.5, f = 4;
      for (let o = 0; o < 5; o++) {
        v += a * vn((x / s) * f, (y / s) * f, f);
        a *= 0.5;
        f *= 2;
      }
      const dx = (x + 0.5) / s - 0.5, dy = (y + 0.5) / s - 0.5;
      const r = Math.min(1, Math.sqrt(dx * dx + dy * dy) * 2);
      const edge = Math.pow(1 - r, 1.5);
      const i = (y * s + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = 255;
      data[i + 3] = Math.round(Math.max(0, Math.min(1, (v - 0.25) * 1.8)) * edge * 255);
    }
  smokeTex = new THREE.DataTexture(data, s, s);
  smokeTex.wrapS = smokeTex.wrapT = THREE.RepeatWrapping;
  smokeTex.needsUpdate = true;
  return smokeTex;
}

export function disposeSharedTextures() {
  softTex?.dispose();
  smokeTex?.dispose();
  softTex = null;
  smokeTex = null;
}
