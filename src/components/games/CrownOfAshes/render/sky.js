/**
 * Sky, sun / moon, stars, clouds and the lighting palette for the
 * day/night cycle. One dome shader does the sky; the same material is
 * rendered into a PMREM environment (refreshed as the hour changes) so armour,
 * water and wet stone reflect the actual sky.
 *
 * `update(hour, weather)` returns the light rig for the frame:
 *   { sunDir, keyColor, keyIntensity, hemiSky, hemiGround, hemiIntensity,
 *     fogColor, night (0..1), dusk (0..1) }
 */
import * as THREE from "three";

const lerpC = (a, b, t, out) => out.copy(a).lerp(b, t);
const C = (h) => new THREE.Color(h);
const PAL = {
  day: { zen: C("#3d6db0"), hor: C("#b4cde6"), key: C("#fff1d6"), sky: C("#c9dcf2"), gnd: C("#5d5644"), fog: C("#b9cbdc") },
  dusk: { zen: C("#3a4a7a"), hor: C("#f2a35e"), key: C("#ffb072"), sky: C("#e0a88a"), gnd: C("#4a3a30"), fog: C("#c99a80") },
  night: { zen: C("#0a1226"), hor: C("#25335a"), key: C("#a8c0f0"), sky: C("#4a5f90"), gnd: C("#1e2030"), fog: C("#1f2a44") },
  storm: { zen: C("#4a5260"), hor: C("#8a929c"), key: C("#c8ccd4"), sky: C("#8e96a2"), gnd: C("#3e3c38"), fog: C("#8a929a") },
};

const vert = `varying vec3 vDir; void main(){ vDir = normalize((modelMatrix * vec4(position, 0.0)).xyz); vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`;
const frag = `
varying vec3 vDir;
uniform vec3 uZen; uniform vec3 uHor; uniform vec3 uSunDir; uniform vec3 uSunCol; uniform vec3 uMoonDir;
uniform float uNight; uniform float uTime; uniform float uCloud; uniform float uDusk; uniform float uStorm;
float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vn(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(h21(i), h21(i+vec2(1,0)), f.x), mix(h21(i+vec2(0,1)), h21(i+vec2(1,1)), f.x), f.y); }
float fbm(vec2 p){ float s = 0.0; float a = 0.5; for (int i = 0; i < 5; i++){ s += vn(p) * a; p *= 2.07; a *= 0.5; } return s; }
void main(){
  vec3 d = normalize(vDir);
  float up = clamp(d.y, -0.2, 1.0);
  float hz = pow(1.0 - max(up, 0.0), 3.2);
  vec3 col = mix(uZen, uHor, hz);
  // below the horizon fade toward the fog
  col = mix(col, uHor * 0.85, smoothstep(0.0, -0.15, d.y));
  // sun glow + disc
  float sd = max(dot(d, uSunDir), 0.0);
  col += uSunCol * (pow(sd, 6.0) * 0.28 + pow(sd, 64.0) * 0.6) * (1.0 - uNight) * (1.0 - uStorm * 0.8);
  col += uSunCol * smoothstep(0.9993, 0.9997, sd) * 6.0 * (1.0 - uNight) * (1.0 - uStorm);
  // dusk band
  col += vec3(1.0, 0.45, 0.2) * uDusk * pow(1.0 - abs(d.y), 8.0) * 0.35 * max(0.0, dot(normalize(vec3(d.x, 0.0, d.z)), normalize(vec3(uSunDir.x, 0.0, uSunDir.z))) * 0.5 + 0.5);
  // stars + moon
  if (uNight > 0.01) {
    vec2 g = d.xz / (abs(d.y) + 0.35) * 220.0;
    float s = h21(floor(g));
    float tw = 0.6 + 0.4 * sin(uTime * 3.0 + s * 40.0);
    float star = step(0.9975, s) * smoothstep(0.5, 0.0, length(fract(g) - 0.5)) * tw;
    col += vec3(0.9, 0.95, 1.0) * star * uNight * smoothstep(0.0, 0.2, d.y) * (1.0 - uStorm);
    float md = max(dot(d, uMoonDir), 0.0);
    col += vec3(0.85, 0.9, 1.0) * (smoothstep(0.9994, 0.9997, md) * 1.6 + pow(md, 32.0) * 0.12) * uNight;
  }
  // clouds on a virtual plane
  if (d.y > 0.0) {
    vec2 cp = d.xz / (d.y + 0.08) * 1.6 + vec2(uTime * 0.006, uTime * 0.0035);
    float c = fbm(cp);
    float cov = mix(0.62, 0.32, uCloud);
    float a = smoothstep(cov, cov + 0.28, c) * smoothstep(0.0, 0.18, d.y);
    vec3 lit = mix(vec3(1.0), uSunCol, 0.35) * (1.0 - uNight * 0.85) + vec3(0.04, 0.05, 0.08) * uNight;
    vec3 shade = mix(uHor * 0.75, vec3(0.35, 0.37, 0.42), uStorm) * (1.0 - uNight * 0.7);
    float edge = smoothstep(cov + 0.28, cov + 0.05, c);
    vec3 cc = mix(shade, lit, edge * 0.6 + sd * 0.3);
    col = mix(col, cc, a * (0.85 + uStorm * 0.15));
  }
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export function createSky(scene, renderer) {
  const uniforms = {
    uZen: { value: new THREE.Color() },
    uHor: { value: new THREE.Color() },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uMoonDir: { value: new THREE.Vector3(0, 1, 0) },
    uSunCol: { value: new THREE.Color() },
    uNight: { value: 0 },
    uDusk: { value: 0 },
    uTime: { value: 0 },
    uCloud: { value: 0.3 },
    uStorm: { value: 0 },
  };
  const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: vert, fragmentShader: frag, side: THREE.BackSide, depthWrite: false, fog: false });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(3000, 48, 24), mat);
  dome.frustumCulled = false;
  dome.renderOrder = -10;
  scene.add(dome);
  // environment probe
  const envScene = new THREE.Scene();
  const envDome = new THREE.Mesh(dome.geometry, mat);
  envScene.add(envDome);
  const ground = new THREE.Mesh(new THREE.CircleGeometry(2000, 16).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x3a3a30 }));
  ground.position.y = -40;
  envScene.add(ground);
  const pm = new THREE.PMREMGenerator(renderer);
  let envRT = null;
  let lastEnvHour = -99;
  let lastEnvStorm = -1;

  const out = {
    sunDir: new THREE.Vector3(),
    lightDir: new THREE.Vector3(),
    keyColor: new THREE.Color(),
    keyIntensity: 1,
    hemiSky: new THREE.Color(),
    hemiGround: new THREE.Color(),
    hemiIntensity: 1,
    fogColor: new THREE.Color(),
    night: 0,
    dusk: 0,
    env: null,
  };
  const tmp = new THREE.Color();
  const tmp2 = new THREE.Color();

  function update(hour, weather = {}, time = 0, dark = false) {
    const p = ((hour - 6) / 12) * Math.PI;
    const sx = Math.cos(p);
    const sy = Math.sin(p) * 0.82;
    const sz = 0.35 * Math.sin(p) + 0.3;
    out.sunDir.set(sx, sy, sz).normalize();
    const elev = out.sunDir.y;
    const night = THREE.MathUtils.smoothstep(-elev, -0.02, 0.18);
    const dusk = Math.max(0, 1 - Math.abs(elev - 0.04) / 0.2) * (1 - night * 0.6);
    const storm = weather.storm || 0;
    out.night = night;
    out.dusk = dusk;
    const P = PAL;
    // sky colours
    lerpC(P.day.zen, P.dusk.zen, dusk, tmp);
    tmp.lerp(P.night.zen, night).lerp(P.storm.zen, storm * (1 - night * 0.7));
    uniforms.uZen.value.copy(tmp);
    lerpC(P.day.hor, P.dusk.hor, dusk, tmp);
    tmp.lerp(P.night.hor, night).lerp(P.storm.hor, storm * (1 - night * 0.7));
    uniforms.uHor.value.copy(tmp);
    uniforms.uSunDir.value.copy(out.sunDir);
    const moon = out.sunDir.clone().multiplyScalar(-1);
    moon.y = Math.abs(moon.y) * 0.8 + 0.25;
    moon.normalize();
    uniforms.uMoonDir.value.copy(moon);
    lerpC(P.day.key, P.dusk.key, dusk, tmp2);
    uniforms.uSunCol.value.copy(tmp2);
    uniforms.uNight.value = night;
    uniforms.uDusk.value = dusk;
    uniforms.uTime.value = time;
    uniforms.uCloud.value = 0.25 + storm * 0.75 + (weather.cloud || 0) * 0.4;
    uniforms.uStorm.value = storm;
    // light rig: the sun by day, the moon by night
    const useMoon = night > 0.5;
    out.lightDir.copy(useMoon ? moon : out.sunDir);
    if (out.lightDir.y < 0.12) out.lightDir.y = 0.12;
    out.lightDir.normalize();
    out.keyColor.copy(useMoon ? P.night.key : tmp2).lerp(P.storm.key, storm * 0.6);
    const dayI = THREE.MathUtils.smoothstep(elev, -0.02, 0.3);
    out.keyIntensity = useMoon ? 0.95 * THREE.MathUtils.smoothstep(night, 0.5, 0.85) : 2.6 * dayI * (1 - storm * 0.65);
    lerpC(P.day.sky, P.dusk.sky, dusk, out.hemiSky).lerp(P.night.sky, night).lerp(P.storm.sky, storm * (1 - night));
    lerpC(P.day.gnd, P.dusk.gnd, dusk, out.hemiGround).lerp(P.night.gnd, night);
    out.hemiIntensity = 1.15 - night * 0.2 + storm * 0.2 + dusk * 0.25;
    lerpC(P.day.fog, P.dusk.fog, dusk, out.fogColor).lerp(P.night.fog, night).lerp(P.storm.fog, storm * (1 - night * 0.6));
    if (dark) {
      out.keyIntensity = 0;
      out.hemiSky.set("#6a5a48");
      out.hemiGround.set("#2a2018");
      out.hemiIntensity = 0.95;
      out.fogColor.set("#06050a");
    }
    // refresh the environment probe now and then
    if (Math.abs(hour - lastEnvHour) > 1 || Math.abs(storm - lastEnvStorm) > 0.25) {
      lastEnvHour = hour;
      lastEnvStorm = storm;
      const old = envRT;
      envRT = pm.fromScene(envScene, 0.04, 1, 3200);
      old?.dispose();
    }
    out.env = envRT.texture;
    return out;
  }

  return {
    dome,
    uniforms,
    update,
    dispose() {
      scene.remove(dome);
      dome.geometry.dispose();
      mat.dispose();
      ground.geometry.dispose();
      ground.material.dispose();
      envRT?.dispose();
      pm.dispose();
    },
  };
}
