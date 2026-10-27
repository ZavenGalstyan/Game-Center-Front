/**
 * Oceanbound — shared water look.
 *
 * WU: uniforms shared by the ocean shader and every "wet" material (shared
 * objects, so one update per frame drives them all).
 *
 * patchWet(material): adds, in the fragment shader, the exact sea surface at
 * the fragment (same wave function as the sim) and
 *  - darkens/wets sand just above the waterline + animated shore foam,
 *  - absorbs colour with depth below the surface (turquoise shallows → deep
 *    blue), so the ocean can stay semi-transparent,
 *  - adds sun caustics on submerged surfaces.
 *
 * createOcean(quality): the sea surface — a radial grid that follows the
 * camera, displaced by the same waves, with fresnel sky reflection, sun
 * glints, subsurface turquoise on crests, foam and a Snell's-window look
 * from below.
 */
import * as THREE from "three";
import { WAVE_GLSL } from "../sim/waves.js";
import { waterNormalTex } from "./textures.js";

export const WU = {
  uTime: { value: 0 },
  uSunDir: { value: new THREE.Vector3(0.3, 0.8, 0.2).normalize() },
  uSunCol: { value: new THREE.Color(1, 0.95, 0.85) },
  uSunI: { value: 1 },
  uDeep: { value: new THREE.Color("#0b3d5e") },
  uShallow: { value: new THREE.Color("#2bb7b0") },
  uZenith: { value: new THREE.Color("#2a78d2") },
  uHorizon: { value: new THREE.Color("#b5e0f5") },
  uCamUnder: { value: 0 },
  uCamPos: { value: new THREE.Vector3() },
  uFogCol: { value: new THREE.Color("#b5e0f5") },
  uFogNear: { value: 120 },
  uFogFar: { value: 900 },
  uAmbient: { value: 1 },
};

const NOISE_GLSL = `
float obHash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float obNoise(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(obHash(i), obHash(i + vec2(1.0,0.0)), u.x), mix(obHash(i + vec2(0.0,1.0)), obHash(i + vec2(1.0,1.0)), u.x), u.y); }
float obCaustic(vec2 p, float t){
  vec2 q = p * 0.55;
  float c = 0.0;
  for (int k = 0; k < 2; k++) {
    float fk = float(k);
    vec2 r = q * (1.0 + fk * 0.7) + vec2(t * (0.21 + fk * 0.1), t * (0.17 - fk * 0.07));
    vec2 w = vec2(sin(r.y * 1.7 + t * 0.6), cos(r.x * 1.3 - t * 0.5));
    float v = abs(sin(r.x * 2.1 + w.x * 1.4) + sin(r.y * 2.3 + w.y * 1.4));
    c += pow(max(0.0, 1.0 - v * 0.75), 3.0);
  }
  return c * 0.6;
}
`;

/** add the wet/underwater look to a MeshStandard/Lambert material */
export function patchWet(mat, { shore = false, strength = 1 } = {}) {
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, WU);
    sh.uniforms.uWetK = { value: strength };
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vObW;")
      .replace(
        "#include <project_vertex>",
        `#include <project_vertex>
vec4 obWP = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
obWP = instanceMatrix * obWP;
#endif
vObW = (modelMatrix * obWP).xyz;`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
varying vec3 vObW;
uniform float uTime; uniform vec3 uSunDir; uniform vec3 uSunCol; uniform float uSunI;
uniform vec3 uDeep; uniform vec3 uShallow; uniform float uCamUnder; uniform float uWetK;
${WAVE_GLSL}
${NOISE_GLSL}`,
      )
      .replace(
        "#include <fog_fragment>",
        `{
  float sea = waveH(vObW.xz, uTime, 1.0);
  float below = sea - vObW.y;
  ${
    shore
      ? `// wet sand band + shore foam at the exact waterline
  float wet = smoothstep(0.55, 0.0, -below) * step(below, 0.0);
  gl_FragColor.rgb *= 1.0 - wet * 0.32;
  float fn = obNoise(vObW.xz * 1.7 + vec2(uTime * 0.4, 0.0)) * 0.6 + obNoise(vObW.xz * 4.0 - uTime * 0.3) * 0.4;
  float band = smoothstep(0.22, 0.0, abs(below + 0.02 + sin(uTime * 1.3 + vObW.x * 0.3) * 0.05));
  float foam = band * smoothstep(0.35, 0.7, fn);
  gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.95, 0.98, 1.0) * (0.6 + 0.5 * uSunI), foam * 0.85);`
      : ""
  }
  if (below > 0.0) {
    float k = 1.0 - exp(-below * 0.32 * uWetK);
    float kAbove = mix(k, 0.35 + k * 0.5, uCamUnder);
    vec3 waterCol = mix(uShallow, uDeep, smoothstep(0.0, 7.0, below));
    float caus = obCaustic(vObW.xz, uTime) * exp(-below * 0.18) * uSunI * (1.0 - uCamUnder * 0.3);
    gl_FragColor.rgb = mix(gl_FragColor.rgb * (1.0 + caus * 0.9), waterCol * (0.35 + 0.65 * uSunI), kAbove);
  }
}
#include <fog_fragment>`,
      );
  };
  mat.customProgramCacheKey = () => `obwet${shore ? 1 : 0}`;
  return mat;
}

/* ------------------------------------------------------------------ ocean */
const OCEAN_VS = `
uniform float uTime; uniform vec3 uCamPos;
varying vec3 vW; varying vec2 vD; varying float vH; varying float vDist;
${WAVE_GLSL}
void main(){
  vec4 wp = modelMatrix * vec4(position, 1.0);
  float dist = length(wp.xz - uCamPos.xz);
  float fade = 1.0 - smoothstep(120.0, 520.0, dist);
  float big = 1.0 - smoothstep(700.0, 1600.0, dist);
  float h = waveH(wp.xz, uTime, fade) * big;
  wp.y += h;
  vW = wp.xyz; vH = h; vDist = dist;
  vD = waveD(wp.xz, uTime, fade) * big;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const OCEAN_FS = `
uniform float uTime; uniform vec3 uCamPos; uniform vec3 uSunDir; uniform vec3 uSunCol; uniform float uSunI;
uniform vec3 uDeep; uniform vec3 uShallow; uniform vec3 uZenith; uniform vec3 uHorizon;
uniform vec3 uFogCol; uniform float uFogNear; uniform float uFogFar; uniform float uCamUnder;
uniform sampler2D uNormal; uniform float uDetail;
varying vec3 vW; varying vec2 vD; varying float vH; varying float vDist;
${NOISE_GLSL}
vec3 skyCol(vec3 r){
  float y = max(r.y, 0.0);
  vec3 c = mix(uHorizon, uZenith, pow(y, 0.55));
  float g = max(dot(r, uSunDir), 0.0);
  c += uSunCol * (pow(g, 10.0) * 0.35) * uSunI;
  return c;
}
void main(){
  vec3 V = normalize(uCamPos - vW);
  vec3 N = normalize(vec3(-vD.x, 1.0, -vD.y));
  // detail normals (two scrolling layers), fading with distance
  float df = (1.0 - smoothstep(30.0, 260.0, vDist)) * uDetail;
  vec2 uv1 = vW.xz * 0.055 + vec2(uTime * 0.018, uTime * 0.011);
  vec2 uv2 = vW.xz * 0.16 - vec2(uTime * 0.026, -uTime * 0.017);
  vec4 t1 = texture2D(uNormal, uv1);
  vec4 t2 = texture2D(uNormal, uv2);
  vec3 n1 = t1.xyz * 2.0 - 1.0;
  vec3 n2 = t2.xyz * 2.0 - 1.0;
  vec3 dn = vec3(n1.x + n2.x * 0.7, 0.0, n1.y + n2.y * 0.7) * 0.32 * df;
  N = normalize(N + dn);
  bool under = !gl_FrontFacing || uCamUnder > 0.5;
  if (under) N = -N;
  float NV = max(dot(N, V), 0.0);
  float fres = 0.02 + 0.98 * pow(1.0 - NV, 5.0);
  vec3 col;
  float alpha;
  if (!under) {
    vec3 R = reflect(-V, N);
    R.y = abs(R.y);
    vec3 refl = skyCol(R);
    float crest = clamp(vH * 1.25 + 0.35, 0.0, 1.0);
    vec3 sunFlat = normalize(vec3(uSunDir.x, 0.0, uSunDir.z) + 1e-4);
    float back = max(0.0, dot(-V, sunFlat)) * 0.6 + 0.4;
    float sss = crest * crest * back;
    vec3 body = mix(uDeep, uShallow, 0.12 + sss * 0.55) * (0.32 + 0.68 * uSunI);
    body += uShallow * pow(max(0.0, 1.0 - NV), 2.0) * 0.08 * uSunI;
    col = mix(body, refl, fres * 0.92);
    // sun glints
    float s = max(dot(reflect(-uSunDir, N), V), 0.0);
    col += uSunCol * (pow(s, 1100.0) * 9.0 + pow(s, 120.0) * 0.32) * uSunI;
    // foam on crests
    float fn = obNoise(vW.xz * 0.9 + vec2(uTime * 0.25, 0.0)) * 0.55 + obNoise(vW.xz * 2.7 - uTime * 0.2) * 0.45;
    float foam = smoothstep(0.6, 0.82, vH + fn * 0.3) * (1.0 - smoothstep(60.0, 260.0, vDist));
    foam += smoothstep(0.55, 0.85, t1.a * t2.a) * 0.25 * df;
    col = mix(col, vec3(0.93, 0.97, 1.0) * (0.45 + 0.6 * uSunI), clamp(foam, 0.0, 1.0) * 0.75);
    alpha = mix(0.72, 1.0, clamp(fres * 1.4 + foam, 0.0, 1.0));
    alpha = mix(alpha, 1.0, smoothstep(40.0, 160.0, vDist));
    // distance fog
    float f = smoothstep(uFogNear, uFogFar, vDist);
    col = mix(col, uFogCol, f);
    alpha = mix(alpha, 1.0, f);
  } else {
    // looking up from below: bright Snell's window, dim total internal reflection outside it
    float win = smoothstep(0.55, 0.8, NV);
    vec3 above = mix(uHorizon, uZenith, 0.5) * (0.6 + 0.6 * uSunI);
    float s = pow(max(dot(-V, uSunDir), 0.0), 40.0);
    col = mix(uDeep * 0.9 + uShallow * 0.15, above, win) + uSunCol * s * 1.6 * uSunI;
    col *= 0.5 + 0.5 * uSunI;
    float f = smoothstep(2.0, 46.0, vDist);
    col = mix(col, uDeep * (0.25 + 0.6 * uSunI), f);
    alpha = 0.95;
  }
  gl_FragColor = vec4(col, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

function radialGrid(rings, segs) {
  const pos = [];
  const idx = [];
  const radius = (k) => 0.7 * k * (1 + (k / 42) ** 2);
  pos.push(0, 0, 0);
  for (let k = 1; k <= rings; k++) {
    const r = radius(k);
    for (let s = 0; s < segs; s++) {
      const a = (s / segs) * Math.PI * 2 + (k % 2) * (Math.PI / segs);
      pos.push(Math.cos(a) * r, 0, Math.sin(a) * r);
    }
  }
  for (let s = 0; s < segs; s++) idx.push(0, 1 + ((s + 1) % segs), 1 + s);
  for (let k = 1; k < rings; k++) {
    const a0 = 1 + (k - 1) * segs;
    const b0 = 1 + k * segs;
    for (let s = 0; s < segs; s++) {
      const s1 = (s + 1) % segs;
      if (k % 2) {
        idx.push(a0 + s, a0 + s1, b0 + s1);
        idx.push(a0 + s, b0 + s1, b0 + s);
      } else {
        idx.push(a0 + s, a0 + s1, b0 + s);
        idx.push(a0 + s1, b0 + s1, b0 + s);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  g.boundingSphere.radius = 1e5;
  return { geo: g, outer: radius(rings) };
}

export function createOcean(quality) {
  const cfg = { low: [120, 96], medium: [150, 150], high: [165, 200] }[quality] || [150, 150];
  const { geo, outer } = radialGrid(cfg[0], cfg[1]);
  const mat = new THREE.ShaderMaterial({
    uniforms: { ...WU, uNormal: { value: waterNormalTex() }, uDetail: { value: quality === "low" ? 0.6 : 1 } },
    vertexShader: OCEAN_VS,
    fragmentShader: OCEAN_FS,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: true,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 2;
  mesh.userData.outer = outer;
  return {
    mesh,
    update(camPos) {
      // follow the camera on a coarse grid so the mesh doesn't shimmer
      mesh.position.set(Math.round(camPos.x / 2) * 2, 0, Math.round(camPos.z / 2) * 2);
    },
    dispose() {
      geo.dispose();
      mat.dispose();
    },
  };
}
