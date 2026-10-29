/**
 * Sky dome + atmosphere presets. One shader draws the gradient, the sun
 * disc and halo, drifting fBm clouds, stars and storm lightning; a preset
 * per region (golden-hour grounds, gloomy forest, black hidden halls, a
 * stormy night for the duel) is blended over ~1.5 s together with fog and
 * the light rig.
 */
import * as THREE from "three";

export const ATMOS = {
  courtyard: { top: "#3a6ab0", mid: "#a8c4e0", horizon: "#f2c890", sun: "#ffd8a0", sunI: 2.6, hemiSky: "#a8c0e0", hemiGround: "#6a5a40", hemiI: 0.75, amb: 0.18, fog: "#d8c8b0", fogD: 0.0042, clouds: 0.55, stars: 0, storm: 0, exposure: 1.0, indoor: 0 },
  grounds: { top: "#3a6ab0", mid: "#a8c4e0", horizon: "#f2c890", sun: "#ffd8a0", sunI: 2.7, hemiSky: "#a8c0e0", hemiGround: "#5a6a3a", hemiI: 0.7, amb: 0.14, fog: "#d8c8b0", fogD: 0.0038, clouds: 0.55, stars: 0, storm: 0, exposure: 1.0, indoor: 0 },
  forest: { top: "#1a2a40", mid: "#3a4a50", horizon: "#5a6050", sun: "#a8b8c0", sunI: 0.55, hemiSky: "#4a6a6a", hemiGround: "#1a2018", hemiI: 0.45, amb: 0.12, fog: "#1e2a26", fogD: 0.03, clouds: 0.85, stars: 0.3, storm: 0, exposure: 1.15, indoor: 0 },
  hall: { top: "#3a6ab0", mid: "#a8c4e0", horizon: "#f2c890", sun: "#ffd8a0", sunI: 1.6, hemiSky: "#ffd8a8", hemiGround: "#6a4a30", hemiI: 0.95, amb: 0.45, fog: "#3a2a20", fogD: 0.006, clouds: 0.55, stars: 0, storm: 0, exposure: 1.05, indoor: 1 },
  library: { top: "#3a6ab0", mid: "#a8c4e0", horizon: "#f2c890", sun: "#ffd8a0", sunI: 1.4, hemiSky: "#ffcc90", hemiGround: "#6a4a30", hemiI: 1.0, amb: 0.45, fog: "#2a1e14", fogD: 0.012, clouds: 0.55, stars: 0, storm: 0, exposure: 1.1, indoor: 1 },
  classroom: { top: "#3a6ab0", mid: "#a8c4e0", horizon: "#f2c890", sun: "#ffd8a0", sunI: 1.5, hemiSky: "#ffe0b8", hemiGround: "#7a5a40", hemiI: 1.15, amb: 0.55, fog: "#2a2018", fogD: 0.008, clouds: 0.55, stars: 0, storm: 0, exposure: 1.05, indoor: 1 },
  hidden: { top: "#0a0a12", mid: "#101018", horizon: "#141418", sun: "#8090b0", sunI: 0.0, hemiSky: "#7a8aaa", hemiGround: "#2a2420", hemiI: 0.7, amb: 0.22, fog: "#0a0a12", fogD: 0.032, clouds: 0, stars: 0, storm: 0, exposure: 1.35, indoor: 1 },
  arena: { top: "#05060c", mid: "#1a1428", horizon: "#3a2a3a", sun: "#b8c8ff", sunI: 1.3, hemiSky: "#7a6aaa", hemiGround: "#2a2228", hemiI: 0.6, amb: 0.2, fog: "#140f1c", fogD: 0.011, clouds: 0.95, stars: 0.6, storm: 1, exposure: 1.15, indoor: 0 },
  menu: { top: "#0c1430", mid: "#3a4a78", horizon: "#e8a070", sun: "#ffb070", sunI: 1.9, hemiSky: "#8aa0d0", hemiGround: "#4a3a30", hemiI: 0.6, amb: 0.14, fog: "#6a5a70", fogD: 0.0035, clouds: 0.6, stars: 0.5, storm: 0, exposure: 1.05, indoor: 0 },
};

const vert = `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`;
const frag = `
uniform vec3 uTop; uniform vec3 uMid; uniform vec3 uHorizon; uniform vec3 uSun; uniform vec3 uSunDir;
uniform float uTime; uniform float uClouds; uniform float uStars; uniform float uStorm; uniform float uFlash;
varying vec3 vDir;
float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
float n(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
float fbm(vec2 p){ float s = 0.0; float a = 0.5; for (int i = 0; i < 5; i++){ s += n(p) * a; p *= 2.03; a *= 0.5; } return s; }
void main(){
  vec3 d = normalize(vDir);
  float y = d.y;
  vec3 col = mix(uHorizon, uMid, smoothstep(-0.02, 0.22, y));
  col = mix(col, uTop, smoothstep(0.2, 0.85, y));
  if (y < 0.0) col = mix(uHorizon, uHorizon * 0.55, smoothstep(0.0, -0.3, y));
  // sun
  float sd = max(0.0, dot(d, normalize(uSunDir)));
  col += uSun * (pow(sd, 900.0) * 6.0 + pow(sd, 14.0) * 0.35 + pow(sd, 3.0) * 0.12) * (1.0 - uStorm * 0.8);
  // stars
  if (uStars > 0.0 && y > 0.0) {
    vec2 sp = d.xz / (y + 0.25) * 90.0;
    vec2 c = floor(sp);
    float s = h(c);
    float st = step(0.985, s) * smoothstep(0.5, 0.0, length(fract(sp) - 0.5)) * (0.6 + 0.4 * sin(uTime * 2.0 + s * 50.0));
    col += vec3(1.0, 0.96, 0.9) * st * uStars * smoothstep(0.0, 0.3, y);
  }
  // clouds on a plane
  if (y > 0.0) {
    vec2 cp = d.xz / (y + 0.08) * 1.6 + vec2(uTime * 0.012, uTime * 0.004);
    float c = fbm(cp);
    float cov = smoothstep(1.0 - uClouds * 0.9, 1.15 - uClouds * 0.5, c + 0.25);
    vec3 cc = mix(vec3(1.0, 0.92, 0.82), uHorizon * 1.1, 0.35) * (0.75 + 0.35 * fbm(cp * 2.0 + 3.0));
    cc = mix(cc, vec3(0.08, 0.07, 0.1), uStorm * 0.85);
    cc += uSun * pow(sd, 6.0) * 0.4 * (1.0 - uStorm);
    col = mix(col, cc, cov * smoothstep(0.0, 0.18, y) * 0.92);
  }
  col += vec3(0.7, 0.75, 1.0) * uFlash * (0.4 + 0.6 * smoothstep(0.0, 0.5, y));
  gl_FragColor = vec4(col, 1.0);
}`;

export function createSky(scene) {
  const u = {
    uTop: { value: new THREE.Color() },
    uMid: { value: new THREE.Color() },
    uHorizon: { value: new THREE.Color() },
    uSun: { value: new THREE.Color() },
    uSunDir: { value: new THREE.Vector3(-0.55, 0.22, 0.8).normalize() },
    uTime: { value: 0 },
    uClouds: { value: 0.5 },
    uStars: { value: 0 },
    uStorm: { value: 0 },
    uFlash: { value: 0 },
  };
  const mat = new THREE.ShaderMaterial({ uniforms: u, vertexShader: vert, fragmentShader: frag, side: THREE.BackSide, depthWrite: false });
  const geo = new THREE.SphereGeometry(900, 32, 16);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  scene.add(mesh);
  const cur = {};
  const c = (v) => new THREE.Color(v);
  const lerpC = (k, target, t) => {
    if (!cur[k]) cur[k] = c(target);
    else cur[k].lerp(c(target), t);
    return cur[k];
  };
  const lerpN = (k, target, t) => {
    if (cur[k] == null) cur[k] = target;
    else cur[k] += (target - cur[k]) * t;
    return cur[k];
  };
  let flashT = 0;
  let nextFlash = 4;
  return {
    mesh,
    sunDir: u.uSunDir.value,
    /** Blend toward preset `name`; returns the current blended values. */
    update(dt, name, camPos, time) {
      const P = ATMOS[name] || ATMOS.grounds;
      const k = Math.min(1, dt * 1.6);
      const out = {
        top: lerpC("top", P.top, k),
        mid: lerpC("mid", P.mid, k),
        horizon: lerpC("horizon", P.horizon, k),
        sun: lerpC("sun", P.sun, k),
        hemiSky: lerpC("hemiSky", P.hemiSky, k),
        hemiGround: lerpC("hemiGround", P.hemiGround, k),
        fog: lerpC("fog", P.fog, k),
        sunI: lerpN("sunI", P.sunI, k),
        hemiI: lerpN("hemiI", P.hemiI, k),
        amb: lerpN("amb", P.amb, k),
        fogD: lerpN("fogD", P.fogD, k),
        clouds: lerpN("clouds", P.clouds, k),
        stars: lerpN("stars", P.stars, k),
        storm: lerpN("storm", P.storm, k),
        exposure: lerpN("exposure", P.exposure, k),
        indoor: lerpN("indoor", P.indoor, k * 2),
      };
      u.uTop.value.copy(out.top);
      u.uMid.value.copy(out.mid);
      u.uHorizon.value.copy(out.horizon);
      u.uSun.value.copy(out.sun);
      u.uTime.value = time;
      u.uClouds.value = out.clouds;
      u.uStars.value = out.stars;
      u.uStorm.value = out.storm;
      // storm lightning
      flashT = Math.max(0, flashT - dt * 3);
      if (out.storm > 0.5) {
        nextFlash -= dt;
        if (nextFlash <= 0) {
          nextFlash = 3 + Math.random() * 6;
          flashT = 1;
          out.thunder = true;
        }
      }
      out.flash = flashT * flashT * out.storm;
      u.uFlash.value = out.flash * 0.6;
      mesh.position.copy(camPos);
      return out;
    },
    dispose() {
      scene.remove(mesh);
      geo.dispose();
      mat.dispose();
    },
  };
}
