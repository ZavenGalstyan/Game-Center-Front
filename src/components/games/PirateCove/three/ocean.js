/**
 * Pirate Cove — the ocean. One mesh, one ShaderMaterial, no render targets:
 *
 *  - geometry: a grid whose spacing grows cubically from the centre (≈2.4 m
 *    under the camera, ≈40 m at the horizon); it follows the camera, snapped
 *    to the inner spacing so nothing swims
 *  - vertex: the SAME swell as engine/waves.js (ships ride what you see)
 *  - fragment: depth from a baked terrain texture → deep/mid/shallow colour,
 *    shallow caustics, shoreline foam with lapping lines; analytic wave normals
 *    + two scrolling detail normals; sky fresnel; sun glint; crest foam;
 *    a turquoise "light through the crest" term; three.js fog
 * Quality (low/medium/high) scales detail normals and caustics only.
 */
import * as THREE from "three";
import { wavesGLSL } from "../engine/waves.js";
import { SEA_FLOOR } from "../engine/terrain.js";

export function createOceanGeometry(N = 200, R = 1700, inner = 0.13) {
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array((N + 1) * (N + 1) * 3);
  const f = (u) => R * (inner * u + (1 - inner) * u * u * u);
  let k = 0;
  for (let j = 0; j <= N; j++) {
    const v = (j / N) * 2 - 1;
    for (let i = 0; i <= N; i++) {
      const u = (i / N) * 2 - 1;
      pos[k++] = f(u);
      pos[k++] = 0;
      pos[k++] = f(v);
    }
  }
  const idx = new Uint32Array(N * N * 6);
  k = 0;
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const a = j * (N + 1) + i;
      const b = a + 1;
      const c = a + (N + 1);
      const d = c + 1;
      idx[k++] = a;
      idx[k++] = c;
      idx[k++] = b;
      idx[k++] = b;
      idx[k++] = c;
      idx[k++] = d;
    }
  }
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), R * 1.5);
  g.userData.snap = (R * inner * 2) / N;
  return g;
}

/** Bakes terrain height around the region into a texture the water shader reads. */
export function bakeDepthTexture(terrain, extent, size = 640) {
  const data = new Uint8Array(size * size * 4);
  const cell = (extent * 2) / size;
  for (let j = 0; j < size; j++) {
    const z = -extent + (j + 0.5) * cell;
    for (let i = 0; i < size; i++) {
      const x = -extent + (i + 0.5) * cell;
      const h = terrain.height(x, z);
      const v = Math.max(0, Math.min(1, (h - SEA_FLOOR) / 16));
      const o = (j * size + i) * 4;
      data[o] = Math.round(v * 255);
      data[o + 1] = 0;
      data[o + 2] = 0;
      data[o + 3] = 255;
    }
  }
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.needsUpdate = true;
  t.userData = { extent };
  return t;
}

const vert = /* glsl */ `
  uniform float uTime;
  uniform float uAmp;
  varying vec3 vW;
  varying float vH;
  #include <fog_pars_vertex>
  ${wavesGLSL()}
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    float h = waveH(w.xz, uTime) * uAmp;
    w.y += h;
    vW = w.xyz;
    vH = h / max(uAmp, 0.001);
    vec4 mvPosition = viewMatrix * w;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const frag = /* glsl */ `
  uniform float uTime;
  uniform float uAmp;
  uniform sampler2D uDepth;
  uniform float uExtent;
  uniform vec3 uDeep;
  uniform vec3 uMid;
  uniform vec3 uShallow;
  uniform vec3 uFoam;
  uniform vec3 uSky;
  uniform vec3 uSunDir;
  uniform vec3 uSunCol;
  uniform float uDetail;
  uniform float uGlow;
  uniform vec3 uGlowCol;
  varying vec3 vW;
  varying float vH;
  #include <fog_pars_fragment>
  ${wavesGLSL()}

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  vec2 noiseGrad(vec2 p) {
    float e = 0.15;
    float c = noise(p);
    return vec2(noise(p + vec2(e, 0.0)) - c, noise(p + vec2(0.0, e)) - c) / e;
  }

  void main() {
    vec2 p = vW.xz;
    float t = uTime;
    vec2 uv = (p + uExtent) / (2.0 * uExtent);
    float inside = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
    float terr = mix(-14.0, texture2D(uDepth, uv).r * 16.0 - 14.0, inside);

    // ---- normal: swell + two scrolling detail layers
    vec2 g = waveGrad(p, t) * uAmp;
    vec2 d1 = noiseGrad(p * 0.35 + vec2(t * 0.05, t * 0.03));
    vec2 d2 = noiseGrad(p * 1.1 - vec2(t * 0.11, -t * 0.07));
    vec2 dn = (d1 * 0.16 + d2 * 0.07) * uDetail * (0.6 + 0.4 * uAmp);
    vec3 N = normalize(vec3(-g.x - dn.x, 1.0, -g.y - dn.y));
    vec3 V = normalize(cameraPosition - vW);
    float dist = length(cameraPosition - vW);

    // ---- base colour by depth
    float sh = smoothstep(-9.0, -0.5, terr);
    float big = noise(p * 0.012 + vec2(t * 0.004, 0.0));
    vec3 base = mix(uDeep, uMid, 0.35 + 0.4 * big);
    base = mix(base, uShallow, sh * 0.92);
    // caustics in the shallows
    float c1 = noise(p * 0.55 + vec2(t * 0.35, t * 0.22));
    float c2 = noise(p * 0.75 - vec2(t * 0.28, -t * 0.31));
    float caus = pow(1.0 - abs(c1 - c2), 7.0);
    base += vec3(0.75, 0.95, 0.9) * caus * 0.33 * sh * (1.0 - smoothstep(-0.6, 0.2, terr)) * uDetail;
    // light through the crests
    float crest = clamp(vH * 1.4, 0.0, 1.0);
    float back = pow(max(dot(-V, uSunDir), 0.0), 3.0) * 0.4 + 0.25;
    base += uShallow * crest * back * 0.35;

    // ---- lighting
    float ndl = max(dot(N, uSunDir), 0.0);
    vec3 col = base * (0.62 + 0.45 * ndl);
    float fres = 0.02 + 0.98 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
    col = mix(col, uSky, clamp(fres * 0.85, 0.0, 0.85));
    vec3 H = normalize(uSunDir + V);
    float nh = max(dot(N, H), 0.0);
    col += uSunCol * (pow(nh, 260.0) * 3.0 + pow(nh, 40.0) * 0.12);
    float spark = step(0.992, noise(p * 2.4 + t * 1.6)) * pow(nh, 8.0) * uDetail * (1.0 - sh);
    col += uSunCol * spark * 1.4;

    // ---- foam: wave crests + shoreline band with lapping lines
    float fn = noise(p * 0.9 + vec2(t * 0.3, -t * 0.2));
    float crestFoam = smoothstep(0.62, 0.95, vH * (0.75 + 0.5 * fn)) * smoothstep(0.5, 1.2, uAmp);
    float shore = smoothstep(-1.4, -0.15, terr) * (1.0 - smoothstep(0.1, 0.7, terr));
    float lap = 0.5 + 0.5 * sin(terr * 9.0 - t * 2.2 + fn * 3.0);
    float shoreFoam = shore * (0.55 + 0.45 * smoothstep(0.55, 0.9, lap)) * (0.6 + 0.6 * fn);
    float edge = smoothstep(-0.35, 0.05, terr);
    float foam = clamp(crestFoam * 0.7 + shoreFoam + edge, 0.0, 1.0);
    col = mix(col, uFoam * (0.85 + 0.15 * ndl), foam * 0.9);

    // cursed glow in the deep (Dead Man's Sea)
    col += uGlowCol * uGlow * pow(noise(p * 0.05 + t * 0.02), 4.0) * 0.16 * (1.0 - sh);

    // distance: calm the detail so the horizon doesn't shimmer
    col = mix(col, mix(base, uSky, 0.55), smoothstep(400.0, 1400.0, dist) * 0.6);

    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

export function createOceanMaterial(depthTex) {
  const uniforms = THREE.UniformsUtils.merge([
    THREE.UniformsLib.fog,
    {
      uTime: { value: 0 },
      uAmp: { value: 1 },
      uDepth: { value: null },
      uExtent: { value: 1000 },
      uDeep: { value: new THREE.Color("#0a5f86") },
      uMid: { value: new THREE.Color("#0f93b0") },
      uShallow: { value: new THREE.Color("#40e0d0") },
      uFoam: { value: new THREE.Color("#ffffff") },
      uSky: { value: new THREE.Color("#bfe4ff") },
      uSunDir: { value: new THREE.Vector3(0.4, 0.8, -0.4).normalize() },
      uSunCol: { value: new THREE.Color("#fff4e0") },
      uDetail: { value: 1 },
      uGlow: { value: 0 },
      uGlowCol: { value: new THREE.Color("#56f0b0") },
    },
  ]);
  uniforms.uDepth.value = depthTex;
  uniforms.uExtent.value = depthTex?.userData?.extent ?? 1000;
  return new THREE.ShaderMaterial({ uniforms, vertexShader: vert, fragmentShader: frag, fog: true });
}

/** Writes an atmosphere preset's water colours into the material. */
export function applyWaterColors(material, atmos) {
  const u = material.uniforms;
  u.uDeep.value.set(atmos.water.deep);
  u.uMid.value.set(atmos.water.mid);
  u.uShallow.value.set(atmos.water.shallow);
  u.uFoam.value.set(atmos.water.foam);
  u.uSky.value.set(atmos.water.sky);
  u.uSunCol.value.set(atmos.sun.color).multiplyScalar(Math.min(1.2, atmos.sun.intensity / 2.4));
  u.uSunDir.value.set(...atmos.sun.dir).normalize();
  u.uGlow.value = atmos.glow ? 1 : 0;
  if (atmos.glow) u.uGlowCol.value.set(atmos.glow);
}
