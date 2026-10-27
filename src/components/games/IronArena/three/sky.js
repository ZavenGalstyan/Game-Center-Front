/**
 * Iron Arena — sky dome: vertical gradient, sun disc + glow, drifting
 * procedural clouds, stars / moon / city glow for night maps. One shader on
 * a large inverted sphere that follows the camera.
 */
import * as THREE from "three";

export function createSky(theme, sunDir) {
  const s = theme.sky;
  const U = {
    uTop: { value: new THREE.Color(s.top) },
    uMid: { value: new THREE.Color(s.mid) },
    uHor: { value: new THREE.Color(s.horizon) },
    uGround: { value: new THREE.Color(s.ground) },
    uSun: { value: new THREE.Color(s.sun) },
    uSunDir: { value: sunDir.clone().normalize() },
    uSunSize: { value: s.sunSize },
    uClouds: { value: s.clouds },
    uCloudCol: { value: new THREE.Color(s.cloudColor) },
    uStars: { value: s.stars || 0 },
    uMoon: { value: s.moon ? 1 : 0 },
    uGlow: { value: new THREE.Color(s.cityGlow || "#000000") },
    uTime: { value: 0 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms: U,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    vertexShader: `varying vec3 vDir;
void main(){
  vDir = normalize(position);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`,
    fragmentShader: `uniform vec3 uTop; uniform vec3 uMid; uniform vec3 uHor; uniform vec3 uGround; uniform vec3 uSun; uniform vec3 uSunDir;
uniform float uSunSize; uniform float uClouds; uniform vec3 uCloudCol; uniform float uStars; uniform float uMoon; uniform vec3 uGlow; uniform float uTime;
varying vec3 vDir;
float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vn(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y); }
float fbm(vec2 p){ float s = 0.0; float a = 0.5; for (int i = 0; i < 5; i++){ s += vn(p) * a; p = p * 2.03 + 17.1; a *= 0.5; } return s; }
void main(){
  vec3 d = normalize(vDir);
  float y = d.y;
  vec3 col = y > 0.0 ? mix(uHor, mix(uMid, uTop, smoothstep(0.25, 0.9, y)), smoothstep(0.0, 0.25, y)) : mix(uHor, uGround, smoothstep(0.0, -0.12, y));
  float sd = max(dot(d, normalize(uSunDir)), 0.0);
  // sun / moon glow
  col += uSun * (pow(sd, 8.0) * 0.18 + pow(sd, 64.0) * 0.35) * (1.0 - uMoon * 0.6);
  float disc = smoothstep(1.0 - 0.0009 * uSunSize, 1.0 - 0.0006 * uSunSize, sd);
  col = mix(col, uSun * (uMoon > 0.5 ? 1.4 : 6.0), disc);
  // city glow on the horizon
  col += uGlow * pow(1.0 - abs(y), 6.0) * 0.35 * step(-0.05, y);
  // stars
  if (uStars > 0.0 && y > 0.0) {
    vec2 sp = d.xz / (d.y + 0.3) * 160.0;
    float st = step(0.996, h21(floor(sp))) * smoothstep(0.05, 0.4, y);
    float tw = 0.6 + 0.4 * sin(uTime * 3.0 + h21(floor(sp) + 3.1) * 40.0);
    col += vec3(st * tw * uStars);
  }
  // clouds on a virtual plane
  if (uClouds > 0.0 && y > 0.01) {
    vec2 cp = d.xz / (y + 0.08) * 1.6 + vec2(uTime * 0.006, uTime * 0.003);
    float c = fbm(cp);
    float cover = smoothstep(1.0 - uClouds * 0.85, 1.05 - uClouds * 0.4, c);
    float shade = 0.7 + 0.3 * fbm(cp * 2.0 + 4.0);
    vec3 cc = uCloudCol * shade + uSun * pow(sd, 6.0) * 0.4;
    col = mix(col, cc, cover * smoothstep(0.01, 0.18, y) * 0.9);
  }
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`,
  });
  const geo = new THREE.SphereGeometry(1800, 32, 16);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  mesh.name = "sky";
  return { mesh, U, dispose: () => (geo.dispose(), mat.dispose()) };
}
