/**
 * Oceanbound — sky dome and time of day.
 *
 * The dome shader draws the gradient, sun disc + glow, moon, twinkling
 * stars and drifting procedural clouds lit by the sun colour. `palette(h)`
 * interpolates keyframed colours for golden sunrises, bright noon, orange
 * sunsets and moonlit nights; the world copies them into the lights, fog
 * and the shared water uniforms.
 */
import * as THREE from "three";
import { WU } from "./water.js";

const KEYS = [
  // hour, zenith, horizon, sun colour, sun intensity, ambient
  [0, "#040a1c", "#0f1d38", "#9fb4e6", 0.16, 0.32],
  [4.6, "#071230", "#1b2a4c", "#9fb4e6", 0.14, 0.3],
  [5.6, "#1c2b5c", "#c3706a", "#ff9f6e", 0.32, 0.42],
  [6.5, "#3a6fb4", "#ffbb7a", "#ffb47a", 0.85, 0.62],
  [8.5, "#2e7fd4", "#a9daf2", "#fff1d8", 1.1, 0.85],
  [13, "#2a78d2", "#b8e2f6", "#ffffff", 1.25, 0.95],
  [16.5, "#3176c6", "#c5e0ec", "#fff0d2", 1.1, 0.88],
  [18.4, "#38569a", "#ff9a5c", "#ffa25e", 0.85, 0.66],
  [19.4, "#1e2a5e", "#e0664a", "#ff7a48", 0.42, 0.48],
  [20.4, "#0c1638", "#3c2f55", "#a7b6e8", 0.18, 0.36],
  [24, "#040a1c", "#0f1d38", "#9fb4e6", 0.16, 0.32],
];
const KC = KEYS.map(([h, z, hz, s, si, a]) => [h, new THREE.Color(z), new THREE.Color(hz), new THREE.Color(s), si, a]);
const tmp = { zenith: new THREE.Color(), horizon: new THREE.Color(), sun: new THREE.Color(), sunI: 1, amb: 1, night: 0, dir: new THREE.Vector3(), moon: new THREE.Vector3(), light: new THREE.Vector3() };

/** colours + directions for an hour of the day */
export function palette(h) {
  let k = 0;
  while (k < KC.length - 2 && KC[k + 1][0] <= h) k++;
  const a = KC[k];
  const b = KC[k + 1];
  const t = (h - a[0]) / (b[0] - a[0]);
  const s = t * t * (3 - 2 * t);
  tmp.zenith.copy(a[1]).lerp(b[1], s);
  tmp.horizon.copy(a[2]).lerp(b[2], s);
  tmp.sun.copy(a[3]).lerp(b[3], s);
  tmp.sunI = a[4] + (b[4] - a[4]) * s;
  tmp.amb = a[5] + (b[5] - a[5]) * s;
  // sun path: rises in the east (+x), noon high in the south-ish sky
  const ang = ((h - 6.1) / 13.3) * Math.PI;
  const el = Math.sin(ang);
  tmp.dir.set(Math.cos(ang), el * 0.92, 0.38).normalize();
  tmp.moon.set(-Math.cos(ang), -el * 0.85 + 0.12, -0.3).normalize();
  tmp.night = THREE.MathUtils.smoothstep(-tmp.dir.y, -0.05, 0.25);
  // the shadow-casting light follows whichever body is up
  if (tmp.dir.y > -0.02) tmp.light.copy(tmp.dir).setY(Math.max(0.12, tmp.dir.y));
  else tmp.light.copy(tmp.moon).setY(Math.max(0.25, tmp.moon.y));
  return tmp;
}

const VS = `
varying vec3 vDir;
void main(){
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;
const FS = `
uniform vec3 uZenith; uniform vec3 uHorizon; uniform vec3 uSunCol; uniform vec3 uSunDir; uniform vec3 uMoonDir;
uniform float uSunI; uniform float uNight; uniform float uTime; uniform float uCloud; uniform vec3 uGround;
varying vec3 vDir;
float h21(vec2 p){ p = fract(p * vec2(233.34, 851.73)); p += dot(p, p + 23.45); return fract(p.x * p.y); }
float n2(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(h21(i), h21(i+vec2(1,0)), u.x), mix(h21(i+vec2(0,1)), h21(i+vec2(1,1)), u.x), u.y); }
float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ s += n2(p) * a; p = p * 2.03 + 17.1; a *= 0.5; } return s; }
void main(){
  vec3 d = normalize(vDir);
  float y = d.y;
  vec3 col = mix(uHorizon, uZenith, pow(max(y, 0.0), 0.5));
  // haze band at the horizon
  col = mix(col, uHorizon * 1.05, exp(-max(y, 0.0) * 18.0) * 0.5);
  float g = max(dot(d, uSunDir), 0.0);
  col += uSunCol * (pow(g, 6.0) * 0.22 + pow(g, 48.0) * 0.55) * uSunI;
  float disc = smoothstep(0.99955, 0.99975, g);
  col += uSunCol * disc * 14.0 * smoothstep(-0.06, 0.04, uSunDir.y);
  // moon + stars
  float m = max(dot(d, uMoonDir), 0.0);
  col += vec3(0.85, 0.9, 1.0) * (smoothstep(0.99935, 0.9996, m) * 2.4 + pow(m, 60.0) * 0.18) * uNight;
  if (uNight > 0.01 && y > 0.0) {
    // round stars on a 3D lattice of cells
    vec3 sd = d * 260.0;
    vec3 cell = floor(sd);
    vec3 f = fract(sd) - 0.5;
    float st = h21(cell.xy + cell.z * 17.13);
    vec3 off = vec3(h21(cell.xz + 3.1), h21(cell.yz + 7.7), h21(cell.xy + 1.3)) - 0.5;
    float r = length(f - off * 0.6);
    float tw = 0.6 + 0.4 * sin(uTime * 2.0 + st * 60.0);
    float star = step(0.985, st) * smoothstep(0.12, 0.0, r) * (0.5 + 0.5 * fract(st * 91.0));
    col += vec3(0.9, 0.95, 1.0) * star * tw * uNight * smoothstep(0.02, 0.25, y) * 1.8;
  }
  // clouds
  if (y > 0.0) {
    vec2 uv = d.xz / (y + 0.16) * 1.35 + vec2(uTime * 0.0045, uTime * 0.002);
    float c = fbm(uv);
    float c2 = fbm(uv * 2.4 + 5.0);
    float cover = smoothstep(0.52 - uCloud * 0.22, 0.8, c * 0.75 + c2 * 0.3);
    float lit = clamp(0.55 + (c2 - 0.45) * 1.4 + pow(g, 3.0) * 0.6, 0.0, 1.3);
    vec3 cloudCol = mix(uZenith * 0.55 + uHorizon * 0.35, mix(vec3(1.0), uSunCol, 0.45) * (0.6 + uSunI * 0.6), lit);
    cloudCol = mix(cloudCol, uHorizon, 0.25);
    cloudCol *= mix(1.0, 0.35, uNight);
    col = mix(col, cloudCol, cover * smoothstep(0.0, 0.12, y) * 0.92);
  }
  col = mix(col, uGround, smoothstep(0.0, -0.12, y));
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export function createSky() {
  const geo = new THREE.SphereGeometry(4000, 48, 24);
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uZenith: WU.uZenith,
      uHorizon: WU.uHorizon,
      uSunCol: WU.uSunCol,
      uSunDir: WU.uSunDir,
      uSunI: WU.uSunI,
      uTime: { value: 0 },
      uMoonDir: { value: new THREE.Vector3(0, 1, 0) },
      uNight: { value: 0 },
      uCloud: { value: 0.5 },
      uGround: { value: new THREE.Color("#0b3550") },
    },
    vertexShader: VS,
    fragmentShader: FS,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = -10;
  mesh.frustumCulled = false;
  return {
    mesh,
    mat,
    update(camPos, P, t) {
      mesh.position.copy(camPos);
      mat.uniforms.uTime.value = t;
      mat.uniforms.uMoonDir.value.copy(P.moon);
      mat.uniforms.uNight.value = P.night;
    },
    dispose() {
      geo.dispose();
      mat.dispose();
    },
  };
}
