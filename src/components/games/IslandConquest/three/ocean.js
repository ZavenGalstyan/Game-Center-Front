/**
 * Island Conquest — stylized ocean (one plane, one ShaderMaterial).
 *
 *  - gentle analytic waves (vertex displacement on medium/high, normals in
 *    the fragment shader on every quality) + sun glint + sky fresnel
 *  - deep → mid → shallow colour by distance to the nearest coastline, soft
 *    caustics in the shallows, foam that hugs the REAL shoreline (the island
 *    shape function is the same as islandMesh.js#shoreMul) plus lapping foam
 *  - ownership drawn in the water: a soft faction-tinted halo around every
 *    island, a crisp ring for the selected island and valid targets, a red
 *    pulse for islands under incoming attack and a shock ring on capture.
 *
 * Everything is a uniform written in place each frame — no allocation.
 */
import * as THREE from "three";

export const MAX_ISLANDS = 12;

const vert = /* glsl */ `
  uniform float uTime;
  uniform float uAmp;
  varying vec3 vW;
  #include <fog_pars_vertex>
  float waveH(vec2 p, float t) {
    return 0.05 * sin(dot(p, vec2(0.8, 0.6)) * 0.9 + t * 1.1)
         + 0.035 * sin(dot(p, vec2(-0.5, 0.86)) * 1.6 + t * 1.6)
         + 0.02 * sin(dot(p, vec2(0.96, -0.28)) * 2.7 + t * 2.1);
  }
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    w.y += waveH(w.xz, uTime) * uAmp;
    vW = w.xyz;
    vec4 mvPosition = viewMatrix * w;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const frag = /* glsl */ `
  #define MAXI ${MAX_ISLANDS}
  uniform float uTime;
  uniform int uCount;
  uniform vec4 uIsl[MAXI];    // x, z, radius, owner index (0 player,1 red,2 purple,3 neutral)
  uniform vec4 uShape[MAXI];  // shoreline phases p1 p2 p3, unused
  uniform vec4 uState[MAXI];  // selected, target-highlight, incoming-warning, seconds since capture
  uniform vec3 uOwn[4];
  uniform vec3 uDeep;
  uniform vec3 uMid;
  uniform vec3 uShallow;
  uniform vec3 uFoam;
  uniform vec3 uSky;
  uniform vec3 uSunDir;
  uniform vec3 uSunCol;
  uniform float uDetail;
  varying vec3 vW;
  #include <fog_pars_fragment>

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  vec2 waveG(vec2 p, float t) {
    vec2 g = vec2(0.0);
    vec2 d1 = vec2(0.8, 0.6);
    vec2 d2 = vec2(-0.5, 0.86);
    vec2 d3 = vec2(0.96, -0.28);
    g += 0.05 * 0.9 * cos(dot(p, d1) * 0.9 + t * 1.1) * d1;
    g += 0.035 * 1.6 * cos(dot(p, d2) * 1.6 + t * 1.6) * d2;
    g += 0.02 * 2.7 * cos(dot(p, d3) * 2.7 + t * 2.1) * d3;
    return g;
  }

  void main() {
    vec2 p = vW.xz;
    float t = uTime;
    float dmin = 1000.0;
    vec3 tint = vec3(0.0);
    float tintA = 0.0;
    for (int i = 0; i < MAXI; i++) {
      if (i >= uCount) break;
      vec4 I = uIsl[i];
      vec4 S = uShape[i];
      vec4 st = uState[i];
      vec2 q = p - I.xy;
      float a = atan(q.y, q.x);
      float R = I.z * (1.0 + 0.1 * sin(2.0 * a + S.x) + 0.06 * sin(3.0 * a + S.y) + 0.035 * sin(5.0 * a + S.z)) * 1.02;
      float d = length(q) - R;
      dmin = min(dmin, d);
      if (d > 2.4) continue;
      int oi = int(I.w + 0.5);
      vec3 oc = oi == 0 ? uOwn[0] : oi == 1 ? uOwn[1] : oi == 2 ? uOwn[2] : uOwn[3];
      float faction = oi == 3 ? 0.0 : 1.0;
      // soft ownership halo just outside the foam
      float halo = smoothstep(0.95, 0.42, d) * smoothstep(0.1, 0.38, d);
      float al = halo * (0.4 * faction + 0.07);
      // crisp selection / target rings
      float ringSel = smoothstep(0.07, 0.0, abs(d - 0.62)) * st.x;
      float dash = step(0.5, fract(a * 4.0 + t * 0.6));
      float ringTgt = smoothstep(0.06, 0.0, abs(d - 0.6)) * st.y * (0.45 + 0.55 * dash);
      al += halo * 0.35 * st.x + ringSel * 0.9 + ringTgt * 0.8 + halo * st.y * 0.15;
      vec3 c = oc * al;
      // incoming attack: red pulse
      float pulse = 0.5 + 0.5 * sin(t * 7.0);
      float w = st.z * (halo * 0.55 + smoothstep(0.08, 0.0, abs(d - 0.75 - pulse * 0.25)) * 0.8) * (0.55 + 0.45 * pulse);
      c += vec3(1.0, 0.25, 0.18) * w;
      al += w;
      // capture shock ring
      if (st.w >= 0.0 && st.w < 1.2) {
        float rr = 0.1 + st.w * 2.4;
        float sh = smoothstep(0.18, 0.0, abs(d - rr)) * (1.0 - st.w / 1.2);
        c += mix(oc, vec3(1.0), 0.35) * sh * 1.2;
        al += sh * 1.2;
      }
      tint += c;
      tintA += al;
    }

    // base water colour
    float big = noise(p * 0.07 + vec2(t * 0.01, 0.0));
    vec3 base = mix(uDeep, uMid, 0.35 + 0.45 * big);
    float sh = exp(-max(dmin, 0.0) * 0.85);
    base = mix(base, uShallow, sh * 0.9);
    // caustics in the shallows
    float c1 = noise(p * 2.3 + vec2(t * 0.35, t * 0.2));
    float c2 = noise(p * 3.1 - vec2(t * 0.25, -t * 0.3));
    base += uFoam * pow(c1 * c2, 2.0) * 0.55 * sh * uDetail;

    // lighting
    vec2 g = waveG(p, t);
    vec2 rip = vec2(noise(p * 3.0 + t * 0.6) - 0.5, noise(p * 3.0 + 17.0 - t * 0.5) - 0.5) * 0.35 * uDetail;
    vec3 N = normalize(vec3(-g.x + rip.x, 1.0, -g.y + rip.y));
    vec3 V = normalize(cameraPosition - vW);
    float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
    vec3 col = mix(base, uSky, fres * 0.55);
    vec3 H = normalize(uSunDir + V);
    float spec = pow(max(dot(N, H), 0.0), 140.0) * 1.4;
    float spark = step(0.985, noise(p * 9.0 + t * 1.3)) * 0.35 * uDetail * (1.0 - sh);
    col += uSunCol * (spec + spark);
    col += uSunCol * 0.06 * max(dot(N, uSunDir), 0.0);

    // foam: shoreline band + lapping waves
    float n1 = noise(p * 5.0 + vec2(t * 0.5, -t * 0.3));
    float edge = smoothstep(0.34, 0.02, dmin + (n1 - 0.5) * 0.16);
    float lap = 0.5 + 0.5 * sin(dmin * 8.5 - t * 2.0);
    float lapF = smoothstep(0.62, 0.12, dmin) * smoothstep(0.72, 0.95, lap * (0.6 + n1 * 0.6));
    float foam = clamp(edge * 0.92 + lapF * 0.55, 0.0, 1.0);
    col = mix(col, uFoam, foam);

    // faction / selection / warning tint
    col = mix(col, tint / max(tintA, 0.0001), clamp(tintA, 0.0, 0.8));

    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

export function createOceanMaterial() {
  const u = THREE.UniformsUtils.merge([
    THREE.UniformsLib.fog,
    {
      uTime: { value: 0 },
      uAmp: { value: 1 },
      uCount: { value: 0 },
      uIsl: { value: Array.from({ length: MAX_ISLANDS }, () => new THREE.Vector4(999, 999, 0, 3)) },
      uShape: { value: Array.from({ length: MAX_ISLANDS }, () => new THREE.Vector4()) },
      uState: { value: Array.from({ length: MAX_ISLANDS }, () => new THREE.Vector4(0, 0, 0, -1)) },
      uOwn: { value: [new THREE.Color(), new THREE.Color(), new THREE.Color(), new THREE.Color()] },
      uDeep: { value: new THREE.Color() },
      uMid: { value: new THREE.Color() },
      uShallow: { value: new THREE.Color() },
      uFoam: { value: new THREE.Color() },
      uSky: { value: new THREE.Color() },
      uSunDir: { value: new THREE.Vector3(0.4, 0.8, 0.3).normalize() },
      uSunCol: { value: new THREE.Color() },
      uDetail: { value: 1 },
    },
  ]);
  return new THREE.ShaderMaterial({ uniforms: u, vertexShader: vert, fragmentShader: frag, fog: true });
}
