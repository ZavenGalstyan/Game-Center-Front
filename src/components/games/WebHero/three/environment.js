/**
 * Web Hero — district atmosphere: gradient sky dome with sun / moon, stars
 * (night), drifting clouds, fog, hemisphere + sun light (a soft shadow
 * camera that follows the hero), a PMREM environment map baked from the sky
 * (glass towers, cars and water reflect it), rain streaks (Neon City, the
 * Fortress storm) and lightning flashes (storm).
 */
import * as THREE from "three";
import { dot } from "./textures.js";

const SKY_VS = `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const SKY_FS = `
uniform vec3 top; uniform vec3 mid; uniform vec3 horizon; uniform vec3 sunCol; uniform vec3 sunDir; uniform float sunSize; uniform float flash;
varying vec3 vDir;
void main() {
  float h = vDir.y;
  vec3 c = h > 0.0 ? mix(mid, top, smoothstep(0.0, 0.55, h)) : mix(mid, horizon * 0.6, smoothstep(0.0, -0.3, h));
  c = mix(horizon, c, smoothstep(-0.02, 0.18, h));
  float s = max(0.0, dot(normalize(vDir), normalize(sunDir)));
  c += sunCol * (pow(s, 800.0 / sunSize) * 2.2 + pow(s, 10.0) * 0.28);
  c += vec3(0.75, 0.8, 1.0) * flash;
  gl_FragColor = vec4(c, 1.0);
}`;

export function createEnvironment(scene, gl, D, { shadows, quality, menu = false }) {
  const own = [];
  const k = (x) => (own.push(x), x);
  const S = D.sky;
  const night = D.time === "night";
  const storm = D.time === "storm";
  const dusk = D.time === "dusk";
  const sunDir = night ? new THREE.Vector3(-0.3, 0.55, 0.4) : dusk ? new THREE.Vector3(-0.7, 0.18, 0.35) : storm ? new THREE.Vector3(0.2, 0.5, -0.6) : new THREE.Vector3(0.45, 0.75, 0.3);
  sunDir.normalize();

  // ---- sky dome
  const skyU = {
    top: { value: new THREE.Color(S.top) },
    mid: { value: new THREE.Color(S.mid) },
    horizon: { value: new THREE.Color(S.horizon) },
    sunCol: { value: new THREE.Color(S.sun) },
    sunDir: { value: sunDir.clone() },
    sunSize: { value: night ? 1.2 : 2.2 },
    flash: { value: 0 },
  };
  const sky = new THREE.Mesh(k(new THREE.SphereGeometry(1400, 32, 16)), k(new THREE.ShaderMaterial({ uniforms: skyU, vertexShader: SKY_VS, fragmentShader: SKY_FS, side: THREE.BackSide, depthWrite: false, fog: false })));
  sky.renderOrder = -10;
  scene.add(sky);

  // ---- stars (night)
  let stars = null;
  if (night || storm) {
    const n = night ? 1400 : 300;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const u = Math.random() * Math.PI * 2;
      const v = Math.random() * 0.9 + 0.08;
      pos[i * 3] = Math.cos(u) * Math.sqrt(1 - v * v) * 1300;
      pos[i * 3 + 1] = v * 1300;
      pos[i * 3 + 2] = Math.sin(u) * Math.sqrt(1 - v * v) * 1300;
    }
    const g = k(new THREE.BufferGeometry());
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    stars = new THREE.Points(g, k(new THREE.PointsMaterial({ color: "#dfe6ff", size: 2.2, sizeAttenuation: false, transparent: true, opacity: storm ? 0.25 : 0.8, fog: false, depthWrite: false })));
    scene.add(stars);
  }

  // ---- clouds: soft billboards high above
  const clouds = new THREE.Group();
  const cloudMat = k(new THREE.SpriteMaterial({ map: dot(), color: storm ? "#5a6072" : night ? "#2a2550" : dusk ? "#ffd2b0" : "#ffffff", transparent: true, opacity: storm ? 0.55 : night ? 0.25 : 0.55, depthWrite: false, fog: false }));
  const nC = storm ? 38 : 22;
  for (let i = 0; i < nC; i++) {
    const s = new THREE.Sprite(cloudMat);
    const a = Math.random() * Math.PI * 2;
    const r = 300 + Math.random() * 700;
    s.position.set(Math.cos(a) * r, 220 + Math.random() * 180, Math.sin(a) * r);
    s.scale.set(220 + Math.random() * 260, 70 + Math.random() * 60, 1);
    clouds.add(s);
  }
  scene.add(clouds);

  // ---- fog
  scene.fog = new THREE.Fog(S.fog, night ? 60 : storm ? 50 : 120, night ? 520 : storm ? 420 : 780);
  scene.background = new THREE.Color(S.horizon);

  // ---- lights
  const hemi = new THREE.HemisphereLight(S.mid, night ? "#1a1420" : "#4f4a40", night ? 0.55 : storm ? 0.7 : 0.85);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(S.sun, night ? 0.55 : storm ? 0.8 : dusk ? 1.6 : 2.3);
  sun.castShadow = !!shadows;
  if (shadows) {
    const sz = quality === "high" ? 2048 : 1024;
    sun.shadow.mapSize.set(sz, sz);
    const e = menu ? 120 : 48;
    Object.assign(sun.shadow.camera, { left: -e, right: e, top: e, bottom: -e, near: 1, far: 400 });
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.03;
    sun.shadow.radius = 3;
  }
  scene.add(sun);
  scene.add(sun.target);
  const fill = new THREE.DirectionalLight(night ? "#7a5cff" : "#bcd8ff", night ? 0.35 : 0.3);
  fill.position.set(-sunDir.x * 100, 60, -sunDir.z * 100);
  scene.add(fill);

  // ---- environment map (reflections) baked from the sky
  const pm = new THREE.PMREMGenerator(gl);
  const envScene = new THREE.Scene();
  const envSky = new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), new THREE.ShaderMaterial({ uniforms: skyU, vertexShader: SKY_VS, fragmentShader: SKY_FS, side: THREE.BackSide }));
  envScene.add(envSky);
  // a ring of "buildings" so reflections aren't just sky
  const ringMat = new THREE.MeshBasicMaterial({ color: night ? "#151826" : "#5d6a7a" });
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const h = 10 + ((i * 37) % 23);
    const b = new THREE.Mesh(new THREE.BoxGeometry(12, h, 12), ringMat);
    b.position.set(Math.cos(a) * 60, h / 2 - 8, Math.sin(a) * 60);
    envScene.add(b);
  }
  const rt = pm.fromScene(envScene, 0.02);
  const envMap = rt.texture;
  pm.dispose();
  envSky.geometry.dispose();
  envScene.traverse((o) => o.isMesh && o.geometry.dispose());
  ringMat.dispose();

  // ---- rain (neon / storm): streaks that follow the camera
  let rain = null;
  if (night || storm) {
    const n = quality === "low" ? 900 : 2200;
    const pos = new Float32Array(n * 6);
    const g = k(new THREE.BufferGeometry());
    const seeds = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      seeds[i * 3] = (Math.random() - 0.5) * 80;
      seeds[i * 3 + 1] = Math.random() * 60;
      seeds[i * 3 + 2] = (Math.random() - 0.5) * 80;
    }
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    rain = { mesh: new THREE.LineSegments(g, k(new THREE.LineBasicMaterial({ color: night ? "#9fb6ff" : "#c8d0e0", transparent: true, opacity: 0.32, depthWrite: false }))), seeds, n, pos, g };
    rain.mesh.frustumCulled = false;
    scene.add(rain.mesh);
  }

  let flashT = 0;
  let nextFlash = 4;
  const baseHemi = hemi.intensity;
  function update(t, dt, cam, focus) {
    // shadow camera + sun follow the action
    if (focus) {
      sun.position.set(focus.x + sunDir.x * 160, focus.y + sunDir.y * 160, focus.z + sunDir.z * 160);
      sun.target.position.set(focus.x, focus.y, focus.z);
    }
    sky.position.copy(cam.position);
    if (stars) stars.position.copy(cam.position);
    clouds.position.set(cam.position.x, 0, cam.position.z);
    clouds.rotation.y = t * 0.003;
    if (rain) {
      const P = rain.pos;
      const sd = rain.seeds;
      const fall = 38;
      for (let i = 0; i < rain.n; i++) {
        const y = ((sd[i * 3 + 1] - t * fall) % 60 + 60) % 60;
        const x = cam.position.x + sd[i * 3];
        const z = cam.position.z + sd[i * 3 + 2];
        const yy = cam.position.y - 25 + y;
        P[i * 6] = x;
        P[i * 6 + 1] = yy;
        P[i * 6 + 2] = z;
        P[i * 6 + 3] = x + 0.08;
        P[i * 6 + 4] = yy + 0.9;
        P[i * 6 + 5] = z + 0.05;
      }
      rain.g.attributes.position.needsUpdate = true;
    }
    if (storm) {
      nextFlash -= dt;
      if (nextFlash <= 0) {
        flashT = 0.45;
        nextFlash = 5 + Math.random() * 9;
      }
      flashT = Math.max(0, flashT - dt);
      const f = flashT > 0 ? (Math.sin(flashT * 60) > 0 ? flashT * 2 : flashT * 0.6) : 0;
      skyU.flash.value = f * 0.5;
      hemi.intensity = baseHemi + f * 2.2;
    }
    return flashT > 0.4;
  }

  function dispose() {
    for (const o of own) o.dispose && o.dispose();
    rt.dispose();
    scene.fog = null;
  }
  return { update, dispose, envMap, sun, hemi, sky };
}
