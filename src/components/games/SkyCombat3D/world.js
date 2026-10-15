/**
 * Sky Combat 3D — renderer (plain Three.js). Draws whatever the Sim holds:
 * terrain/sea/sky/clouds for the mission's world, aircraft, ground units,
 * projectiles and pooled particle effects, plus the chase/cockpit cameras,
 * the main-menu flyby and the hangar showroom.
 *
 * No shadows and no post-processing; one directional sun + hemisphere light,
 * a PMREM sky environment for metal reflections, distance fog for depth.
 */
import * as THREE from "three";
import { Kit, buildJet, buildBig, buildGround, buildWreck, missileGeometry, bombGeometry } from "./models.js";
import { heightField, PADS, VALLEY, fbm } from "./terrain.js";
import { WORLDS, JETS } from "./data.js";

const BIG_LOOKS = { bomber: "bomber", cargo: "cargo", attacker: "attacker", gunship: "gunship" };
const tmpV = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();
const tmpM = new THREE.Matrix4();
const UP = new THREE.Vector3(0, 1, 0);
const tmpS = new THREE.Vector3();

/* ------------------------------------------------------------------ textures */
function canvasTex(w, h, draw, repeat = false) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}
function softDot() {
  return canvasTex(64, 64, (g, w) => {
    const r = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    r.addColorStop(0, "rgba(255,255,255,1)");
    r.addColorStop(0.35, "rgba(255,255,255,0.65)");
    r.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = r;
    g.fillRect(0, 0, w, w);
  });
}
function puffTex() {
  return canvasTex(128, 128, (g, w) => {
    for (let i = 0; i < 16; i++) {
      const x = w * (0.25 + Math.random() * 0.5);
      const y = w * (0.3 + Math.random() * 0.45);
      const r = w * (0.14 + Math.random() * 0.16);
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, "rgba(255,255,255,0.55)");
      gr.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = gr;
      g.fillRect(0, 0, w, w);
    }
  });
}
function noiseTex(size = 128, scale = 1, seed = 1) {
  return canvasTex(size, size, (g, w) => {
    const img = g.createImageData(w, w);
    for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) {
      const n = fbm((x / w) * 8 * scale, (y / w) * 8 * scale, seed, 4);
      const v = 150 + (n - 0.5) * 200 * 0.7;
      const i = (y * w + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.max(0, Math.min(255, v));
      img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }, true);
}
function waterNormalTex() {
  return canvasTex(128, 128, (g, w) => {
    const img = g.createImageData(w, w);
    const h = (x, y) => Math.sin(x * 0.29 + Math.sin(y * 0.11) * 2) * 0.5 + Math.sin(y * 0.23 + x * 0.07) * 0.5 + Math.sin((x + y) * 0.61) * 0.25;
    for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) {
      const dx = h(x + 1, y) - h(x - 1, y);
      const dy = h(x, y + 1) - h(x, y - 1);
      const i = (y * w + x) * 4;
      img.data[i] = 128 + dx * 60;
      img.data[i + 1] = 128 + dy * 60;
      img.data[i + 2] = 255;
      img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }, true);
}
function runwayTex() {
  return canvasTex(64, 1024, (g, w, h) => {
    g.fillStyle = "#3b3d40";
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 600; i++) {
      g.fillStyle = `rgba(${Math.random() < 0.5 ? 0 : 90},${Math.random() < 0.5 ? 0 : 90},${Math.random() < 0.5 ? 0 : 90},0.08)`;
      g.fillRect(Math.random() * w, Math.random() * h, 3, 6);
    }
    g.fillStyle = "#e6e6e0";
    g.fillRect(3, 0, 2, h);
    g.fillRect(w - 5, 0, 2, h);
    for (let y = 60; y < h - 60; y += 46) g.fillRect(w / 2 - 1, y, 2, 24);
    for (const y0 of [8, h - 40]) for (let x = 9; x < w - 9; x += 6) g.fillRect(x, y0, 3, 32);
  });
}

/* ------------------------------------------------------------------ shaders */
const SKY_VS = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;
const SKY_FS = /* glsl */ `
uniform vec3 top;
uniform vec3 horizon;
uniform vec3 ground;
uniform vec3 sunDir;
uniform vec3 sunColor;
uniform float haze;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 c = mix(horizon, top, pow(clamp(h, 0.0, 1.0), 0.42));
  c = mix(c, horizon, haze * (1.0 - smoothstep(0.0, 0.5, h)));
  if (h < 0.0) c = mix(horizon, ground, smoothstep(0.0, -0.22, h));
  float s = max(dot(d, normalize(sunDir)), 0.0);
  c += sunColor * (pow(s, 900.0) * 14.0 + pow(s, 60.0) * 0.35 + pow(s, 8.0) * 0.08);
  gl_FragColor = vec4(c, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
const CLOUD_VS = /* glsl */ `
attribute vec3 offset;
attribute float scale;
attribute float shade;
uniform float time;
uniform vec2 wind;
uniform vec3 cam;
uniform float range;
varying vec2 vUv;
varying float vShade;
varying float vDepth;
void main() {
  vec3 p = offset;
  p.xz += wind * time;
  p.xz = cam.xz + mod(p.xz - cam.xz + range, 2.0 * range) - range;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  mv.xy += position.xy * scale;
  gl_Position = projectionMatrix * mv;
  vUv = uv;
  vShade = shade;
  vDepth = -mv.z;
}`;
const CLOUD_FS = /* glsl */ `
uniform sampler2D map;
uniform vec3 lit;
uniform vec3 dark;
uniform vec3 fogColor;
uniform float fogFar;
uniform float opacity;
varying vec2 vUv;
varying float vShade;
varying float vDepth;
void main() {
  float a = texture2D(map, vUv).a * opacity;
  a *= smoothstep(25.0, 260.0, vDepth);
  vec3 c = mix(dark, lit, clamp(vShade + vUv.y * 0.55 - 0.15, 0.0, 1.0));
  float f = smoothstep(fogFar * 0.25, fogFar * 1.1, vDepth);
  c = mix(c, fogColor, f);
  a *= 1.0 - f * 0.6;
  if (a < 0.01) discard;
  gl_FragColor = vec4(c, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
const PART_VS = /* glsl */ `
attribute float size;
attribute vec4 pcolor;
uniform float scale;
varying vec4 vColor;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = size * scale / max(1.0, -mv.z);
  vColor = pcolor;
}`;
const PART_FS = /* glsl */ `
uniform sampler2D map;
uniform vec3 fogColor;
uniform float fogFar;
uniform float fade;
varying vec4 vColor;
void main() {
  vec4 t = texture2D(map, gl_PointCoord);
  float depth = gl_FragCoord.z / gl_FragCoord.w;
  float f = smoothstep(fogFar * 0.2, fogFar, depth) * fade;
  vec3 c = mix(vColor.rgb, fogColor, f);
  float a = t.a * vColor.a * (1.0 - f * 0.7);
  if (a < 0.004) discard;
  gl_FragColor = vec4(c, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/* ------------------------------------------------------------------ particles */
class Particles {
  constructor(n, tex, additive) {
    this.n = n;
    this.count = 0;
    this.pos = new Float32Array(n * 3);
    this.vel = new Float32Array(n * 3);
    this.col = new Float32Array(n * 4);
    this.size = new Float32Array(n);
    this.life = new Float32Array(n);
    this.max = new Float32Array(n);
    this.s0 = new Float32Array(n);
    this.s1 = new Float32Array(n);
    this.a0 = new Float32Array(n);
    this.c0 = new Float32Array(n * 3);
    this.c1 = new Float32Array(n * 3);
    this.drag = new Float32Array(n);
    this.grav = new Float32Array(n);
    const g = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute("position", this.aPos);
    g.setAttribute("pcolor", this.aCol);
    g.setAttribute("size", this.aSize);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e9);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: tex }, scale: { value: 500 }, fogColor: { value: new THREE.Color() }, fogFar: { value: 12000 }, fade: { value: additive ? 0.6 : 1 } },
      vertexShader: PART_VS,
      fragmentShader: PART_FS,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 3 : 2;
    this.geo = g;
  }
  /** c0/c1: [r,g,b] start/end colour; a0 start alpha. */
  emit(x, y, z, vx, vy, vz, life, s0, s1, c0, c1, a0, drag = 0.5, grav = 0) {
    let i = this.count;
    if (i >= this.n) i = (Math.random() * this.n) | 0;
    else this.count++;
    const i3 = i * 3;
    this.pos[i3] = x; this.pos[i3 + 1] = y; this.pos[i3 + 2] = z;
    this.vel[i3] = vx; this.vel[i3 + 1] = vy; this.vel[i3 + 2] = vz;
    this.life[i] = life; this.max[i] = life;
    this.s0[i] = s0; this.s1[i] = s1; this.a0[i] = a0;
    this.c0[i3] = c0[0]; this.c0[i3 + 1] = c0[1]; this.c0[i3 + 2] = c0[2];
    this.c1[i3] = c1[0]; this.c1[i3 + 1] = c1[1]; this.c1[i3 + 2] = c1[2];
    this.drag[i] = drag;
    this.grav[i] = grav;
  }
  update(dt) {
    let n = this.count;
    for (let i = 0; i < n; i++) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        n--;
        this.copy(n, i);
        i--;
        continue;
      }
      const i3 = i * 3;
      const k = Math.max(0, 1 - this.drag[i] * dt);
      this.vel[i3] *= k; this.vel[i3 + 1] = this.vel[i3 + 1] * k - this.grav[i] * dt; this.vel[i3 + 2] *= k;
      this.pos[i3] += this.vel[i3] * dt; this.pos[i3 + 1] += this.vel[i3 + 1] * dt; this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
      const t = 1 - this.life[i] / this.max[i];
      this.size[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * t;
      const i4 = i * 4;
      this.col[i4] = this.c0[i3] + (this.c1[i3] - this.c0[i3]) * t;
      this.col[i4 + 1] = this.c0[i3 + 1] + (this.c1[i3 + 1] - this.c0[i3 + 1]) * t;
      this.col[i4 + 2] = this.c0[i3 + 2] + (this.c1[i3 + 2] - this.c0[i3 + 2]) * t;
      this.col[i4 + 3] = this.a0[i] * (t < 0.1 ? t / 0.1 : 1 - (t - 0.1) / 0.9);
    }
    this.count = n;
    this.geo.setDrawRange(0, n);
    this.aPos.needsUpdate = this.aCol.needsUpdate = this.aSize.needsUpdate = true;
  }
  copy(from, to) {
    if (from === to) return;
    for (const [a, s] of [[this.pos, 3], [this.vel, 3], [this.c0, 3], [this.c1, 3], [this.col, 4]]) for (let k = 0; k < s; k++) a[to * s + k] = a[from * s + k];
    for (const a of [this.size, this.life, this.max, this.s0, this.s1, this.a0, this.drag, this.grav]) a[to] = a[from];
  }
  clear() {
    this.count = 0;
    this.geo.setDrawRange(0, 0);
  }
  dispose() {
    this.geo.dispose();
    this.mat.dispose();
  }
}

const FIRE = [1, 0.62, 0.22];
const FIRE_END = [0.6, 0.12, 0.02];
const WHITE = [1, 1, 1];
const SMOKE = [0.32, 0.31, 0.3];
const SMOKE_END = [0.55, 0.54, 0.52];
const DARK = [0.12, 0.11, 0.1];
const SAND = [0.78, 0.68, 0.5];
const SPRAY = [0.85, 0.92, 0.97];
const rnd = (a = 1) => (Math.random() - 0.5) * 2 * a;

/* ================================================================== world */
export function createWorld(canvas, { preserve = false } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: preserve, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.autoClear = false;

  const kit = new Kit();
  const own = []; // disposables we created outside the kit
  const T = { dot: softDot(), puff: puffTex(), water: waterNormalTex(), detail: noiseTex(128, 2, 5), runway: runwayTex() };
  T.detail.repeat.set(1, 1);
  T.water.repeat.set(1, 1);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(68, 16 / 9, 1.5, 40000);
  scene.add(camera);
  const sun = new THREE.DirectionalLight(0xffffff, 3);
  const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
  scene.add(sun, sun.target, hemi);
  const flash = new THREE.PointLight(0xffa040, 0, 900, 1.6);
  scene.add(flash);

  // sky dome (follows the camera)
  const skyU = {
    top: { value: new THREE.Color() }, horizon: { value: new THREE.Color() }, ground: { value: new THREE.Color() },
    sunDir: { value: new THREE.Vector3(0, 1, 0) }, sunColor: { value: new THREE.Color(1, 0.95, 0.85) }, haze: { value: 0 },
  };
  const skyMat = new THREE.ShaderMaterial({ uniforms: skyU, vertexShader: SKY_VS, fragmentShader: SKY_FS, side: THREE.BackSide, depthWrite: false, fog: false });
  const skyGeo = new THREE.SphereGeometry(30000, 32, 16);
  const sky = new THREE.Mesh(skyGeo, skyMat);
  sky.renderOrder = -10;
  sky.frustumCulled = false;
  scene.add(sky);
  own.push(skyGeo, skyMat);

  // particles
  const fxAdd = new Particles(3500, T.dot, true);
  const fxSmoke = new Particles(3500, T.puff, false);
  scene.add(fxSmoke.points, fxAdd.points);

  // tracers (instanced)
  const tracerGeo = new THREE.BoxGeometry(0.4, 0.4, 1);
  own.push(tracerGeo);
  const tracers = {
    player: new THREE.InstancedMesh(tracerGeo, kit.basic("tracerP", 0xffe28a, { add: true, transparent: true, toneMapped: false }), 420),
    enemy: new THREE.InstancedMesh(tracerGeo, kit.basic("tracerE", 0xff5a3a, { add: true, transparent: true, toneMapped: false }), 420),
  };
  for (const t of Object.values(tracers)) {
    t.frustumCulled = false;
    t.count = 0;
    t.renderOrder = 4;
    scene.add(t);
  }

  // cockpit overlay (own scene + camera, drawn after clearing depth)
  const cockpitScene = new THREE.Scene();
  const cockpitCam = new THREE.PerspectiveCamera(68, 16 / 9, 0.05, 10);
  cockpitScene.add(new THREE.HemisphereLight(0xbfd8ff, 0x202020, 1.4));
  const cockpit = buildCockpit(kit);
  cockpitScene.add(cockpit);

  // hangar showroom
  const hangar = buildHangar(kit, own);

  let env = null; // per-world environment
  let pmrem = new THREE.PMREMGenerator(renderer);
  let envTex = null;
  const ents = new Map(); // sim entity id → view
  const missileMeshes = [];
  const bombMeshes = [];
  const markerObjs = [];
  let lastSim = null;
  const cam = { pos: new THREE.Vector3(), look: new THREE.Vector3(), aim: new THREE.Vector3(0, 0, -1), up: new THREE.Vector3(0, 1, 0), shake: 0, mode: "chase", deathT: 0, init: false, orbit: 0 };
  let time = 0;
  let size = { w: 16, h: 9 };
  const menu = { jets: [], t: 0 };

  /* ------------------------------------------------------------ environment */
  function setWorld(worldId, weather = null) {
    if (env && env.id === worldId && env.weather === weather) return;
    clearEnv();
    const W = WORLDS[worldId];
    const hf = heightField(worldId);
    const grp = new THREE.Group();
    scene.add(grp);
    env = { id: worldId, weather, grp, disposables: [], W, hf };
    // sky + light
    skyU.top.value.setHex(W.sky.top);
    skyU.horizon.value.setHex(W.sky.horizon);
    skyU.ground.value.setHex(W.sky.ground);
    skyU.sunDir.value.set(...W.sun.dir).normalize();
    skyU.haze.value = weather === "sandstorm" ? 0.9 : 0;
    sun.position.copy(skyU.sunDir.value).multiplyScalar(1000);
    sun.color.setHex(W.sun.color);
    sun.intensity = W.sun.intensity * (weather === "sandstorm" ? 0.55 : 1);
    hemi.color.setHex(W.hemi[0]);
    hemi.groundColor.setHex(W.hemi[1]);
    hemi.intensity = W.hemi[2];
    const fogCol = new THREE.Color(weather === "sandstorm" ? 0xc9a578 : W.fog);
    if (weather === "sandstorm") skyU.horizon.value.copy(fogCol);
    scene.fog = weather === "sandstorm" ? new THREE.Fog(fogCol, 250, 3200) : new THREE.Fog(fogCol, 2500, W.fogFar);
    for (const p of [fxAdd, fxSmoke]) {
      p.mat.uniforms.fogColor.value.copy(fogCol);
      p.mat.uniforms.fogFar.value = scene.fog.far;
    }
    // reflections from this sky
    if (envTex) envTex.dispose();
    const envScene = new THREE.Scene();
    const envSky = new THREE.Mesh(skyGeo, skyMat);
    envScene.add(envSky);
    envTex = pmrem.fromScene(envScene, 0, 1, 40000).texture;
    scene.environment = envTex;
    hangar.scene.environment = envTex;
    // terrain
    const terrain = buildTerrain(hf, worldId, T.detail);
    grp.add(terrain);
    env.disposables.push(terrain.geometry, terrain.material);
    // sea
    const waterGeo = new THREE.PlaneGeometry(90000, 90000);
    waterGeo.rotateX(-Math.PI / 2);
    const water = new THREE.Mesh(waterGeo, new THREE.MeshStandardMaterial({ color: W.water, roughness: 0.12, metalness: 0.35, normalMap: T.water, normalScale: new THREE.Vector2(0.35, 0.35), transparent: true, opacity: 0.9, envMapIntensity: 0.9 }));
    water.material.normalMap.repeat.set(900, 900);
    water.renderOrder = 1;
    grp.add(water);
    env.water = water;
    env.disposables.push(waterGeo, water.material);
    // clouds
    const clouds = buildClouds(W.cloud * (weather === "sandstorm" ? 0.3 : 1), T.puff, worldId);
    grp.add(clouds.mesh);
    env.clouds = clouds;
    env.disposables.push(clouds.mesh.geometry, clouds.mesh.material);
    clouds.mesh.material.uniforms.fogColor.value.copy(fogCol);
    clouds.mesh.material.uniforms.fogFar.value = scene.fog.far;
    // airbases + scenery
    buildScenery(env, grp, kit, T, worldId);
  }

  function clearEnv() {
    clearEntities();
    if (!env) return;
    scene.remove(env.grp);
    for (const d of env.disposables) d.dispose();
    env = null;
  }

  /* ------------------------------------------------------------ entities */
  function clearEntities() {
    for (const v of ents.values()) disposeView(v);
    ents.clear();
    for (const m of missileMeshes) m.visible = false;
    for (const m of bombMeshes) m.visible = false;
    for (const o of markerObjs) scene.remove(o);
    markerObjs.length = 0;
    fxAdd.clear();
    fxSmoke.clear();
    for (const t of Object.values(tracers)) t.count = 0;
  }
  function disposeView(v) {
    scene.remove(v.obj);
    if (v.wreck) scene.remove(v.wreck);
  }

  function viewFor(e) {
    let v = ents.get(e.id);
    if (v) return v;
    let obj;
    if (e.cat === "air") {
      if (e.side === "player") obj = buildJet(kit, e.kind, JETS[e.kind].look, { missiles: 4, bombs: 2 });
      else if (BIG_LOOKS[e.def.look]) obj = buildBig(kit, BIG_LOOKS[e.def.look]);
      else obj = buildJet(kit, e.def.look, null, { missiles: Math.min(4, e.missiles || 0) });
    } else obj = buildGround(kit, e.kind, e.side);
    scene.add(obj);
    v = { obj, ent: e, smokeT: 0, wreck: null, dead: false, deadT: 0, trailT: 0 };
    ents.set(e.id, v);
    return v;
  }

  function syncEntities(sim, dt, view) {
    const seen = new Set();
    const p = sim.player;
    for (const a of sim.air) {
      seen.add(a.id);
      const v = viewFor(a);
      const o = v.obj;
      o.position.copy(a.pos);
      o.quaternion.copy(a.quat);
      const far = a.pos.distanceToSquared(camera.position) > 14000 * 14000;
      o.visible = !far && !(a === p && view === "cockpit" && p.alive);
      if (a.wreck || !a.alive) {
        o.visible = a.wreck && !far;
        if (a.wreck) emitWreck(a, dt);
        continue;
      }
      const ud = o.userData;
      // afterburner
      const thr = a === p ? p.throttle : Math.min(1, a.speed / (a.def.speed || 200));
      const ab = a === p ? (p.ab ? 1 : 0) : thr > 1 ? 1 : 0;
      for (let i = 0; i < ud.exhaust.length; i++) {
        const ex = ud.exhaust[i];
        const core = i % 2 === 1;
        const L = (core ? 0.8 : 1.2) + thr * (core ? 1.6 : 2.6) + ab * (core ? 1.8 : 3.4) + Math.sin(time * 60 + i) * 0.15;
        ex.scale.z = L;
        ex.visible = thr > 0.25 || a !== p;
      }
      // nav lights
      for (const l of ud.lights) if (l.blink) l.mesh.visible = (time * 1.3 + a.id * 0.37) % 1 < 0.12;
      // stores
      if (a === p) {
        for (let i = 0; i < ud.missiles.length; i++) ud.missiles[i].visible = i < p.ammo.missiles;
        for (let i = 0; i < ud.bombs.length; i++) ud.bombs[i].visible = i < p.ammo.bombs;
      }
      if (o.visible || a === p) emitAircraft(a, v, dt);
    }
    for (const g of sim.ground) {
      seen.add(g.id);
      const v = viewFor(g);
      const o = v.obj;
      o.position.copy(g.pos);
      o.rotation.y = g.yaw + Math.PI;
      if (g.def.naval) {
        o.position.y = Math.sin(time * 0.8 + g.id) * 0.4;
        o.rotation.z = Math.sin(time * 0.6 + g.id) * 0.02;
      }
      if (o.userData.spin) o.userData.spin.rotation.y += dt * 1.2;
      if (!g.alive && !v.dead) {
        v.dead = true;
        v.deadT = 0;
        o.visible = false;
        v.wreck = buildWreck(kit, g.radius * 0.8);
        v.wreck.position.copy(g.pos);
        if (g.def.naval) v.wreck.position.y = -2;
        scene.add(v.wreck);
      }
      if (v.dead) {
        v.deadT += dt;
        if (g.def.naval && v.wreck) v.wreck.position.y = Math.max(-30, -2 - v.deadT * 0.6);
        if (v.deadT < 40) emitBurning(g, v, dt);
      }
      // smoke from damaged units
      if (!v.dead && g.hp < g.maxHp * 0.5 && Math.random() < dt * 4) fxSmoke.emit(g.pos.x + rnd(g.radius * 0.4), g.pos.y + g.radius * 0.6, g.pos.z + rnd(g.radius * 0.4), rnd(2), 8, rnd(2), 4, g.radius * 0.6, g.radius * 2, DARK, SMOKE, 0.5, 0.1);
    }
    for (const [id, v] of ents) {
      if (!seen.has(id)) {
        disposeView(v);
        ents.delete(id);
      }
    }
  }

  function emitAircraft(a, v, dt) {
    const p = lastSim?.player;
    const dmg = 1 - a.hp / a.maxHp;
    v.smokeT -= dt;
    if (dmg > 0.5 && v.smokeT <= 0) {
      v.smokeT = dmg > 0.75 ? 0.025 : 0.05;
      tmpV.copy(a.dir).multiplyScalar(-a.radius * 0.6).add(a.pos);
      fxSmoke.emit(tmpV.x, tmpV.y, tmpV.z, rnd(3), 2, rnd(3), 2.6, 3, 16, DARK, SMOKE, dmg > 0.75 ? 0.75 : 0.45, 0.4);
      if (dmg > 0.75) fxAdd.emit(tmpV.x, tmpV.y, tmpV.z, a.vel.x * 0.4 + rnd(4), a.vel.y * 0.4 + rnd(4), a.vel.z * 0.4 + rnd(4), 0.35, 4, 1.5, FIRE, FIRE_END, 0.9, 2);
    }
    // wingtip vapour in hard pulls (player)
    if (a === p && Math.abs(p.rate.p) > 0.85 && p.speed > 150) {
      const S = (JETS[p.kind]?.look.span || 10) / 2;
      for (const s of [-1, 1]) {
        tmpV.set(s * S, 0, 2).applyQuaternion(a.quat).add(a.pos);
        fxSmoke.emit(tmpV.x, tmpV.y, tmpV.z, 0, 0, 0, 0.5, 0.6, 1.6, WHITE, WHITE, 0.35, 0);
      }
    }
  }
  function emitWreck(a, dt) {
    tmpV.copy(a.pos);
    fxSmoke.emit(tmpV.x + rnd(2), tmpV.y, tmpV.z + rnd(2), rnd(2), 3, rnd(2), 3.5, 5, 22, DARK, SMOKE, 0.8, 0.3);
    fxAdd.emit(tmpV.x, tmpV.y, tmpV.z, rnd(6), rnd(6), rnd(6), 0.5, 7, 2, FIRE, FIRE_END, 1, 2);
  }
  function emitBurning(g, v, dt) {
    const k = Math.max(0.15, 1 - v.deadT / 40);
    if (Math.random() < dt * 14 * k) {
      const r = g.radius * 0.5;
      fxSmoke.emit(g.pos.x + rnd(r), g.pos.y + 2, g.pos.z + rnd(r), rnd(2) + 3, 10 + Math.random() * 6, rnd(2), 6, g.radius * 0.7, g.radius * 2.8, DARK, SMOKE_END, 0.7 * k, 0.05);
    }
    if (Math.random() < dt * 20 * k) fxAdd.emit(g.pos.x + rnd(g.radius * 0.4), g.pos.y + 1, g.pos.z + rnd(g.radius * 0.4), rnd(1), 6, rnd(1), 0.7, g.radius * 0.5, 1, FIRE, FIRE_END, 0.9, 0.5);
  }

  function syncProjectiles(sim, dt) {
    // tracers
    const counts = { player: 0, enemy: 0 };
    for (const b of sim.bullets) {
      if (!b.on || !b.tracer) continue;
      const k = b.side === "enemy" ? "enemy" : "player";
      const t = tracers[k];
      const i = counts[k]++;
      if (i >= 420) continue;
      const sp = b.vel.length();
      tmpV.copy(b.vel).multiplyScalar(1 / sp);
      tmpQ.setFromUnitVectors(tmpV2.set(0, 0, 1), tmpV);
      const len = Math.min(26, sp * 0.022);
      tmpM.compose(tmpV2.copy(b.pos).addScaledVector(tmpV, -len / 2), tmpQ, tmpS.set(1, 1, len));
      t.setMatrixAt(i, tmpM);
    }
    for (const k of ["player", "enemy"]) {
      tracers[k].count = Math.min(420, counts[k]);
      tracers[k].instanceMatrix.needsUpdate = true;
    }
    // missiles
    let mi = 0;
    for (const m of sim.missiles) {
      if (!m.on) continue;
      let mesh = missileMeshes[mi];
      if (!mesh) {
        mesh = new THREE.Mesh(missileGeometry(kit), kit.std("missileW", 0xe8eaec, { metal: 0.2, rough: 0.5 }));
        mesh.scale.setScalar(1.3);
        scene.add(mesh);
        missileMeshes.push(mesh);
      }
      mi++;
      mesh.visible = true;
      mesh.position.copy(m.pos);
      mesh.quaternion.setFromUnitVectors(tmpV2.set(0, 0, -1), m.dir);
      // motor flame + smoke trail
      tmpV.copy(m.pos).addScaledVector(m.dir, -2.6);
      fxAdd.emit(tmpV.x, tmpV.y, tmpV.z, -m.dir.x * 20, -m.dir.y * 20, -m.dir.z * 20, 0.12, 4.5, 1, [1, 0.85, 0.5], FIRE, 1, 1);
      for (let s = 0; s < 2; s++) {
        tmpV.copy(m.pos).addScaledVector(m.dir, -3 - s * m.speed * dt * 0.5);
        fxSmoke.emit(tmpV.x + rnd(0.4), tmpV.y + rnd(0.4), tmpV.z + rnd(0.4), rnd(1.5), rnd(1.5) + 1, rnd(1.5), m.side === "enemy" ? 3.2 : 2.6, 3.2, 16, WHITE, [0.82, 0.83, 0.85], 0.5, 0.6);
      }
    }
    for (let i = mi; i < missileMeshes.length; i++) missileMeshes[i].visible = false;
    // bombs
    let bi = 0;
    for (const b of sim.bombs) {
      if (!b.on) continue;
      let mesh = bombMeshes[bi];
      if (!mesh) {
        mesh = new THREE.Mesh(bombGeometry(kit), kit.std("bombG", 0x5b6150, { metal: 0.3, rough: 0.6 }));
        mesh.scale.setScalar(1.3);
        scene.add(mesh);
        bombMeshes.push(mesh);
      }
      bi++;
      mesh.visible = true;
      mesh.position.copy(b.pos);
      tmpV.copy(b.vel).normalize();
      mesh.quaternion.setFromUnitVectors(tmpV2.set(0, 0, -1), tmpV);
    }
    for (let i = bi; i < bombMeshes.length; i++) bombMeshes[i].visible = false;
    // flares
    for (const f of sim.flares) {
      if (!f.on) continue;
      fxAdd.emit(f.pos.x, f.pos.y, f.pos.z, 0, 0, 0, 0.09, 14, 8, [1, 0.95, 0.75], [1, 0.6, 0.2], 1, 0);
      if (Math.random() < 0.6) fxSmoke.emit(f.pos.x, f.pos.y, f.pos.z, rnd(1), 1, rnd(1), 1.8, 2, 7, WHITE, [0.85, 0.85, 0.85], 0.4, 0.5);
    }
    // torpedo wakes
    for (const t of sim.torps) {
      if (!t.on) continue;
      fxSmoke.emit(t.pos.x + rnd(1), 0.6, t.pos.z + rnd(1), rnd(1), 0.5, rnd(1), 3, 3, 10, SPRAY, SPRAY, 0.6, 0.5);
    }
    // muzzle flash
    const p = sim.player;
    if (p.alive && p.firing && cam.mode !== "cockpit") {
      tmpV.copy(p.dir).multiplyScalar(9).add(p.pos);
      fxAdd.emit(tmpV.x, tmpV.y, tmpV.z, p.vel.x, p.vel.y, p.vel.z, 0.05, 3, 1, [1, 0.9, 0.6], FIRE, 1, 0);
    }
  }

  /* ------------------------------------------------------------ one-shot effects */
  function explosion(x, y, z, s, kind) {
    const near = camera.position.distanceTo(tmpV.set(x, y, z));
    const sz = s * 10;
    // flash
    fxAdd.emit(x, y, z, 0, 0, 0, 0.25, sz * 4, sz * 6, [1, 0.95, 0.8], [1, 0.6, 0.2], 1, 0);
    // fireball
    const n = Math.round(14 * s);
    for (let i = 0; i < n; i++) fxAdd.emit(x + rnd(sz * 0.3), y + rnd(sz * 0.3), z + rnd(sz * 0.3), rnd(sz * 2.2), rnd(sz * 2.2) + (kind === "ground" ? sz : 0), rnd(sz * 2.2), 0.5 + Math.random() * 0.5, sz * 1.4, sz * 0.4, FIRE, FIRE_END, 1, 2.5, kind === "ground" ? -2 : 0);
    // smoke
    for (let i = 0; i < n; i++) fxSmoke.emit(x + rnd(sz * 0.4), y + rnd(sz * 0.4), z + rnd(sz * 0.4), rnd(sz * 0.8), rnd(sz * 0.8) + (kind === "ground" ? sz * 0.8 : 1), rnd(sz * 0.8), 3 + Math.random() * 3, sz * 0.9, sz * 3.2, DARK, SMOKE_END, 0.8, 0.8);
    // sparks / debris
    for (let i = 0; i < n * 1.5; i++) fxAdd.emit(x, y, z, rnd(sz * 7), rnd(sz * 7) + sz * 2, rnd(sz * 7), 0.6 + Math.random() * 0.8, 1.4, 0.6, [1, 0.8, 0.4], [1, 0.3, 0.05], 1, 1.2, 25);
    if (kind === "ground") for (let i = 0; i < n; i++) fxSmoke.emit(x + rnd(sz), y + 1, z + rnd(sz), rnd(sz * 1.5), sz * 0.6 * Math.random(), rnd(sz * 1.5), 2.5, sz * 0.8, sz * 2.5, env?.id === "desert" ? SAND : SMOKE, SMOKE_END, 0.7, 1.2);
    // light + shake
    flash.position.set(x, y + 5, z);
    flash.intensity = Math.max(flash.intensity, 4e5 * s);
    flash.distance = 400 + s * 400;
    cam.shake = Math.min(1.2, cam.shake + (s * 600) / Math.max(150, near));
  }
  function splash(x, z, s) {
    const sz = s * 8;
    for (let i = 0; i < 18 * s; i++) fxSmoke.emit(x + rnd(sz * 0.4), 1, z + rnd(sz * 0.4), rnd(sz * 0.8), sz * (2 + Math.random() * 3), rnd(sz * 0.8), 2 + Math.random(), sz * 0.6, sz * 2.4, SPRAY, SPRAY, 0.8, 0.6, 12);
    cam.shake = Math.min(1, cam.shake + (s * 300) / Math.max(150, camera.position.distanceTo(tmpV.set(x, 0, z))));
  }
  function drainFx(sim) {
    for (const f of sim.fx) {
      if (camera.position.distanceToSquared(tmpV.set(f.x, f.y, f.z)) > 16000 * 16000) continue;
      switch (f.type) {
        case "explosion":
        case "airburst":
          explosion(f.x, f.y, f.z, f.s, "air");
          break;
        case "groundExplosion":
        case "bombExplosion":
        case "fuelExplosion":
        case "shipExplosion":
          explosion(f.x, f.y, f.z, f.s * (f.type === "fuelExplosion" ? 1.6 : 1), "ground");
          if (f.type === "shipExplosion") splash(f.x, f.z, f.s);
          break;
        case "splash":
        case "bigSplash":
          splash(f.x, f.z, f.s);
          if (f.type === "splash" && f.s > 1) explosion(f.x, 2, f.z, f.s * 0.6, "air");
          break;
        case "bulletSplash":
          if (Math.random() < 0.5) fxSmoke.emit(f.x, 0.5, f.z, rnd(1), 6 + Math.random() * 6, rnd(1), 0.8, 1, 3, SPRAY, SPRAY, 0.6, 1, 10);
          break;
        case "dust":
          if (Math.random() < 0.5) fxSmoke.emit(f.x, f.y + 0.5, f.z, rnd(1), 3, rnd(1), 1, 1.5, 5, env?.id === "desert" ? SAND : [0.5, 0.47, 0.42], SMOKE_END, 0.6, 1);
          break;
        case "impact":
          fxAdd.emit(f.x, f.y, f.z, 0, 0, 0, 0.08, 4 * f.s, 2, [1, 0.9, 0.6], FIRE, 1, 0);
          for (let i = 0; i < 3; i++) fxAdd.emit(f.x, f.y, f.z, rnd(40), rnd(40), rnd(40), 0.3, 0.8, 0.3, [1, 0.8, 0.4], FIRE_END, 1, 2, 10);
          break;
        case "sparks":
          fxAdd.emit(f.x, f.y, f.z, rnd(20), rnd(20), rnd(20), 0.25, 1, 0.3, [1, 0.8, 0.4], FIRE_END, 1, 2, 10);
          break;
        case "launch":
          fxSmoke.emit(f.x, f.y, f.z, rnd(3), rnd(3), rnd(3), 1.5, 3, 10, WHITE, [0.8, 0.8, 0.8], 0.6, 1);
          break;
        case "flareBurst":
          break;
        default:
      }
    }
    sim.fx.length = 0;
  }

  /* ------------------------------------------------------------ markers (3D rings / beams) */
  const ringGeo = new THREE.TorusGeometry(1, 0.045, 6, 40);
  const beamGeo = new THREE.CylinderGeometry(1, 1, 1, 12, 1, true);
  own.push(ringGeo, beamGeo);
  function syncMarkers(sim) {
    const list = sim.markers().filter((m) => m.kind === "gate" || m.kind === "gate-next" || m.kind === "waypoint");
    while (markerObjs.length < list.length) {
      const o = new THREE.Group();
      o.add(new THREE.Mesh(ringGeo, kit.basic("gateRing", 0x5fe8ff, { add: true, transparent: true, opacity: 0.9, toneMapped: false })));
      const beam = new THREE.Mesh(beamGeo, kit.basic("beam", 0x5fe8ff, { add: true, transparent: true, opacity: 0.18, side: THREE.DoubleSide, toneMapped: false }));
      o.add(beam);
      o.userData.ring = o.children[0];
      o.userData.beam = beam;
      scene.add(o);
      markerObjs.push(o);
    }
    for (let i = 0; i < markerObjs.length; i++) {
      const o = markerObjs[i];
      const m = list[i];
      o.visible = !!m;
      if (!m) continue;
      o.position.set(m.x, m.y, m.z);
      const isGate = m.kind !== "waypoint";
      o.userData.ring.visible = isGate;
      o.userData.beam.visible = !isGate;
      if (isGate) {
        // face along the course: toward the next gate (or the player)
        const nxt = list.find((q) => q.kind === "gate-next");
        tmpV.set(m.x, m.y, m.z);
        if (m.kind === "gate" && nxt) o.lookAt(nxt.x, nxt.y, nxt.z);
        else o.lookAt(sim.player.pos);
        const s = m.r * (m.kind === "gate" ? 1 : 0.9);
        o.userData.ring.scale.set(s, s, s * 4);
        o.userData.ring.material = kit.basic(m.kind === "gate" ? "gateRing" : "gateRing2", m.kind === "gate" ? 0x5fe8ff : 0x2a7f9a, { add: true, transparent: true, opacity: m.kind === "gate" ? 0.95 : 0.4, toneMapped: false });
      } else {
        o.rotation.set(0, 0, 0);
        o.userData.beam.scale.set(40, 3000, 40);
        o.userData.beam.position.y = 1400 - m.y + sim.hf.ground(m.x, m.z);
      }
    }
  }

  /* ------------------------------------------------------------ camera */
  function updateCamera(sim, dt, view, aim) {
    const p = sim.player;
    cam.mode = view;
    cam.shake = Math.max(0, cam.shake - dt * 1.8);
    if (p.hitT > sim.t - 0.05) cam.shake = Math.min(1, cam.shake + 0.25);
    const sh = cam.shake * cam.shake;
    if (!p.alive) {
      // slow orbit of the wreck
      cam.deathT += dt;
      cam.orbit += dt * 0.3;
      const c = p.pos;
      const r = 70 + cam.deathT * 12;
      tmpV.set(c.x + Math.cos(cam.orbit) * r, c.y + 30 + cam.deathT * 6, c.z + Math.sin(cam.orbit) * r);
      tmpV.y = Math.max(tmpV.y, sim.hf.ground(tmpV.x, tmpV.z) + 20);
      camera.position.lerp(tmpV, 1 - Math.exp(-dt * 3));
      camera.up.set(0, 1, 0);
      camera.lookAt(c);
      camera.fov = 60;
      camera.updateProjectionMatrix();
      return;
    }
    cam.deathT = 0;
    if (view === "cockpit") {
      const ck = viewFor(p).obj.userData.cockpit || [0, 1, -4];
      camera.position.set(ck[0], ck[1], ck[2]).applyQuaternion(p.quat).add(p.pos);
      camera.quaternion.copy(p.quat);
      camera.position.x += rnd(sh * 0.08);
      camera.position.y += rnd(sh * 0.08);
      camera.fov = 72;
      camera.updateProjectionMatrix();
      cam.init = false;
      return;
    }
    // chase: behind the mouse-aim direction, partly rolling with the jet
    // look along the mouse aim, but never so far from the nose that the jet leaves the frame
    const want = tmpV2.copy(aim || p.dir);
    const off = Math.acos(Math.max(-1, Math.min(1, want.dot(p.dir))));
    if (off > 0.35) want.copy(p.dir).lerp(tmpV2, 0.35 / off).normalize();
    const wantDir = cam.wantDir || (cam.wantDir = new THREE.Vector3());
    wantDir.copy(want);
    if (!cam.init) {
      cam.aim.copy(wantDir);
      cam.up.set(0, 1, 0);
    }
    cam.aim.lerp(wantDir, 1 - Math.exp(-dt * 7)).normalize();
    tmpV.set(0, 1, 0).applyQuaternion(p.quat);
    tmpV2.copy(UP).lerp(tmpV, 0.35).normalize();
    cam.up.lerp(tmpV2, 1 - Math.exp(-dt * 4)).normalize();
    const L = viewFor(p).obj.userData.length || 15;
    const back = L * 1.55 + 6 + Math.max(0, p.speed - 150) * 0.02;
    const pos = tmpV.copy(p.pos).addScaledVector(cam.aim, -back).addScaledVector(cam.up, L * 0.38 + 2);
    const gh = sim.hf.ground(pos.x, pos.z);
    if (pos.y < gh + 4) pos.y = gh + 4;
    if (!cam.init) camera.position.copy(pos);
    else camera.position.lerp(pos, 1 - Math.exp(-dt * 14));
    cam.init = true;
    cam.look.copy(p.pos).addScaledVector(cam.aim, 90);
    camera.up.copy(cam.up);
    camera.lookAt(cam.look);
    if (sh > 0.001) {
      camera.rotateX(rnd(sh * 0.012));
      camera.rotateY(rnd(sh * 0.012));
    }
    camera.fov = 66 + Math.max(0, p.speed - 200) * 0.05 + (p.ab ? 2 : 0);
    camera.updateProjectionMatrix();
  }

  /* ------------------------------------------------------------ menu flyby */
  function menuFrame(dt) {
    setWorld("desert");
    if (!menu.jets.length) {
      const looks = [["falcon", JETS.falcon.look], ["viper", JETS.viper.look], ["thunder", JETS.thunder.look]];
      for (const [k, L] of looks) {
        const j = buildJet(kit, k, L, { missiles: 4, bombs: 2 });
        scene.add(j);
        menu.jets.push(j);
      }
    }
    for (const j of menu.jets) j.visible = true;
    menu.t += dt;
    const t = menu.t * 0.11;
    const R = 2600;
    const c = new THREE.Vector3(-900, 0, 400);
    const lead = new THREE.Vector3();
    menu.jets.forEach((j, i) => {
      const a = t - i * 0.012;
      const off = [[0, 0, 0], [-34, -8, 26], [34, 6, 30]][i];
      const pos = new THREE.Vector3(c.x + Math.cos(a) * R, 900 + Math.sin(a * 2) * 60, c.z + Math.sin(a) * R);
      const fwd = new THREE.Vector3(-Math.sin(a), Math.cos(a * 2) * 0.05, Math.cos(a)).normalize();
      const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(new THREE.Vector3(), fwd, UP));
      q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), 0.35));
      j.quaternion.copy(q);
      j.position.copy(pos).add(new THREE.Vector3(...off).applyQuaternion(q));
      for (const [k, ex] of j.userData.exhaust.entries()) ex.scale.z = (k % 2 ? 2 : 3.2) + Math.sin(time * 50 + k) * 0.2;
      for (const l of j.userData.lights) if (l.blink) l.mesh.visible = (time * 1.3 + i * 0.3) % 1 < 0.12;
      if (i === 0) lead.copy(pos);
    });
    const a = t + 0.035;
    const camPos = new THREE.Vector3(c.x + Math.cos(a) * (R + 90), 935, c.z + Math.sin(a) * (R + 90));
    camera.position.copy(camPos);
    camera.up.set(0, 1, 0);
    camera.lookAt(lead.x, lead.y + 4, lead.z);
    camera.fov = 52;
    camera.updateProjectionMatrix();
  }
  function hideMenuJets() {
    for (const j of menu.jets) j.visible = false;
  }

  /* ------------------------------------------------------------ main render */
  function render(sim, dt, { mode = "play", view = "chase", aim = null, hangarJet = null, freeze = false } = {}) {
    time += dt;
    flash.intensity *= Math.exp(-dt * 9);
    if (mode === "hangar") {
      hangar.update(dt, hangarJet, time);
      renderer.clear();
      renderer.render(hangar.scene, hangar.camera);
      return;
    }
    if (mode === "menu" || !sim) {
      if (lastSim) {
        clearEntities();
        lastSim = null;
      }
      menuFrame(dt);
    } else {
      hideMenuJets();
      if (sim !== lastSim) {
        setWorld(sim.world, sim.weather);
        clearEntities();
        cam.init = false;
        lastSim = sim;
      }
      syncEntities(sim, dt, view);
      syncProjectiles(sim, dt);
      if (!freeze) drainFx(sim);
      syncMarkers(sim);
      updateCamera(sim, dt, view, aim);
      // sandstorm dust around the camera
      if (sim.weather === "sandstorm" && !freeze) for (let i = 0; i < 3; i++) fxSmoke.emit(camera.position.x + rnd(260), camera.position.y + rnd(120), camera.position.z + rnd(260), 40 + rnd(10), rnd(4), 25 + rnd(10), 3, 30, 60, SAND, SAND, 0.18, 0);
    }
    if (!freeze) {
      fxAdd.update(dt);
      fxSmoke.update(dt);
    }
    sky.position.copy(camera.position);
    if (env) {
      env.water.material.normalMap.offset.set(time * 0.004, time * 0.0025);
      const cu = env.clouds.mesh.material.uniforms;
      cu.time.value = time;
      cu.cam.value.copy(camera.position);
      env.water.position.x = Math.round(camera.position.x / 1000) * 1000;
      env.water.position.z = Math.round(camera.position.z / 1000) * 1000;
    }
    const ps = size.h / (2 * Math.tan((camera.fov * Math.PI) / 360));
    fxAdd.mat.uniforms.scale.value = ps;
    fxSmoke.mat.uniforms.scale.value = ps;
    renderer.clear();
    renderer.render(scene, camera);
    if (sim && mode === "play" && view === "cockpit" && sim.player.alive) {
      renderer.clearDepth();
      cockpitCam.aspect = camera.aspect;
      cockpitCam.fov = camera.fov;
      cockpitCam.updateProjectionMatrix();
      cockpit.userData.update(sim, time);
      renderer.render(cockpitScene, cockpitCam);
    }
  }

  function resize(w, h) {
    size = { w: Math.max(2, w), h: Math.max(2, h) };
    renderer.setSize(size.w, size.h, false);
    camera.aspect = size.w / size.h;
    camera.updateProjectionMatrix();
    hangar.camera.aspect = camera.aspect;
    hangar.camera.updateProjectionMatrix();
  }

  /** World point → CSS pixels on the canvas ({x, y, on: in front of camera}). */
  function project(x, y, z, out = {}) {
    tmpV.set(x, y, z).project(camera);
    const behind = tmpV.z > 1;
    out.x = (tmpV.x * 0.5 + 0.5) * size.w;
    out.y = (-tmpV.y * 0.5 + 0.5) * size.h;
    out.on = !behind;
    // direction for off-screen arrows
    tmpV2.set(x, y, z).applyMatrix4(camera.matrixWorldInverse);
    out.dx = tmpV2.x;
    out.dy = tmpV2.y;
    out.front = tmpV2.z < 0;
    return out;
  }

  function dispose() {
    clearEnv();
    for (const j of menu.jets) scene.remove(j);
    for (const m of [...missileMeshes, ...bombMeshes]) scene.remove(m);
    fxAdd.dispose();
    fxSmoke.dispose();
    for (const t of Object.values(tracers)) t.dispose();
    for (const d of own) d.dispose();
    for (const t of Object.values(T)) t.dispose();
    hangar.dispose();
    if (envTex) envTex.dispose();
    pmrem.dispose();
    kit.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  }

  return {
    renderer, scene, camera, kit, render, resize, project, dispose, setWorld,
    stats: () => ({ calls: renderer.info.render.calls, tris: renderer.info.render.triangles, geos: renderer.info.memory.geometries, tex: renderer.info.memory.textures, particles: fxAdd.count + fxSmoke.count }),
    get size() {
      return size;
    },
  };
}

/* ================================================================== terrain mesh */
function buildTerrain(hf, worldId, detail) {
  const n = hf.n;
  const pos = new Float32Array(n * n * 3);
  const col = new Float32Array(n * n * 3);
  const uv = new Float32Array(n * n * 2);
  const c = new THREE.Color();
  const pal = PALETTES[worldId];
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const k = j * n + i;
      const x = -hf.half + i * hf.step;
      const z = -hf.half + j * hf.step;
      const h = hf.data[k];
      pos[k * 3] = x;
      pos[k * 3 + 1] = h;
      pos[k * 3 + 2] = z;
      uv[k * 2] = x / 90;
      uv[k * 2 + 1] = z / 90;
      const hx = hf.data[j * n + Math.min(n - 1, i + 1)] - hf.data[j * n + Math.max(0, i - 1)];
      const hz = hf.data[Math.min(n - 1, j + 1) * n + i] - hf.data[Math.max(0, j - 1) * n + i];
      const slope = Math.hypot(hx, hz) / (2 * hf.step);
      pal(c, h, slope, x, z);
      col[k * 3] = c.r;
      col[k * 3 + 1] = c.g;
      col[k * 3 + 2] = c.b;
    }
  }
  const idx = new Uint32Array((n - 1) * (n - 1) * 6);
  let q = 0;
  for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) {
    const a = j * n + i;
    const b = a + 1;
    const cc = a + n;
    const d = cc + 1;
    // matches heightField's bilinear split: (a, c, b) and (c, d, b)
    idx[q++] = a; idx[q++] = cc; idx[q++] = b;
    idx[q++] = cc; idx[q++] = d; idx[q++] = b;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeVertexNormals();
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, metalness: 0, map: detail });
  const mesh = new THREE.Mesh(g, m);
  mesh.matrixAutoUpdate = false;
  return mesh;
}

const mixC = (c, a, b, t) => c.setRGB(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t);
const ss = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const hex = (h) => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255].map((v) => Math.pow(v, 2.2));
const PALETTES = {
  desert(c, h, slope, x, z) {
    const sand = hex(0xd8b583);
    const dune = hex(0xc49a64);
    const rock = hex(0x9c6a45);
    const dark = hex(0x6e4a33);
    const wet = hex(0x8c8a6a);
    const deep = hex(0x2e6d74);
    const n = fbm(x / 300, z / 300, 3, 3);
    mixC(c, sand, dune, ss(0.35, 0.7, n));
    const r = ss(0.35, 0.75, slope + (h > 220 ? 0.15 : 0));
    if (r > 0) {
      const rr = c.toArray();
      mixC(c, rr, h > 600 ? dark : rock, r);
    }
    if (h < 8) mixC(c, deep, wet, ss(-60, 6, h));
  },
  mountain(c, h, slope, x, z) {
    const grass = hex(0x6c8a45);
    const forest = hex(0x3f5e2f);
    const rock = hex(0x7d7a74);
    const rockD = hex(0x5a5853);
    const snow = hex(0xf2f5f8);
    const deep = hex(0x2b4f63);
    const n = fbm(x / 260, z / 260, 7, 3);
    mixC(c, grass, forest, ss(0.4, 0.65, n));
    const r = ss(0.28, 0.55, slope) * (h > 300 ? 1 : 0.6);
    const cur = c.toArray();
    mixC(c, cur, n > 0.5 ? rock : rockD, Math.max(r, ss(700, 1000, h) * 0.85));
    const sn = ss(1050, 1250, h + n * 160) * (1 - ss(0.7, 1.1, slope));
    if (sn > 0) {
      const cc = c.toArray();
      mixC(c, cc, snow, sn);
    }
    if (h < 5) mixC(c, deep, grass, ss(-30, 5, h));
  },
  ocean(c, h, slope, x, z) {
    const grass = hex(0x6f9a4a);
    const jungle = hex(0x3e6a33);
    const sand = hex(0xe3d1a0);
    const rock = hex(0x857f72);
    const shallow = hex(0x4fb2b8);
    const deep = hex(0x0f3f62);
    const n = fbm(x / 240, z / 240, 9, 3);
    if (h < 0) {
      mixC(c, deep, shallow, ss(-120, -2, h));
      return;
    }
    mixC(c, sand, grass, ss(6, 26, h + n * 10));
    if (h > 26) {
      const cur = c.toArray();
      mixC(c, cur, jungle, ss(0.4, 0.7, n));
    }
    const r = ss(0.4, 0.8, slope);
    if (r > 0) {
      const cur = c.toArray();
      mixC(c, cur, rock, r);
    }
  },
};

/* ================================================================== clouds */
function buildClouds(amount, tex, worldId) {
  const clusters = Math.round(70 * amount + 20);
  const per = 7;
  const n = clusters * per;
  const quad = new THREE.PlaneGeometry(1, 1);
  const g = new THREE.InstancedBufferGeometry();
  g.index = quad.index;
  g.setAttribute("position", quad.attributes.position);
  g.setAttribute("uv", quad.attributes.uv);
  const off = new Float32Array(n * 3);
  const sc = new Float32Array(n);
  const sh = new Float32Array(n);
  let k = 0;
  let seed = worldId.length * 977;
  const r = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const R = 11000;
  for (let c = 0; c < clusters; c++) {
    const cx = (r() - 0.5) * 2 * R;
    const cz = (r() - 0.5) * 2 * R;
    const cy = (worldId === "mountain" ? 2300 : 1900) + r() * 1400;
    const size = 260 + r() * 420;
    for (let i = 0; i < per; i++) {
      off[k * 3] = cx + (r() - 0.5) * size * 2.2;
      off[k * 3 + 1] = cy + (r() - 0.5) * size * 0.45;
      off[k * 3 + 2] = cz + (r() - 0.5) * size * 1.6;
      sc[k] = size * (0.8 + r() * 0.9);
      sh[k] = 0.45 + r() * 0.5;
      k++;
    }
  }
  g.setAttribute("offset", new THREE.InstancedBufferAttribute(off, 3));
  g.setAttribute("scale", new THREE.InstancedBufferAttribute(sc, 1));
  g.setAttribute("shade", new THREE.InstancedBufferAttribute(sh, 1));
  g.instanceCount = n;
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      map: { value: tex }, time: { value: 0 }, wind: { value: new THREE.Vector2(9, 4) }, cam: { value: new THREE.Vector3() }, range: { value: R },
      lit: { value: new THREE.Color(1, 1, 1) }, dark: { value: new THREE.Color(0.62, 0.67, 0.76) }, fogColor: { value: new THREE.Color() }, fogFar: { value: 12000 }, opacity: { value: 0.85 },
    },
    vertexShader: CLOUD_VS,
    fragmentShader: CLOUD_FS,
    transparent: true,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 5;
  return { mesh };
}

/* ================================================================== scenery */
function buildScenery(env, grp, kit, T, worldId) {
  const hf = env.hf;
  const pads = PADS[worldId];
  // runways at the home base (and the desert enemy base)
  const runwayMat = new THREE.MeshStandardMaterial({ map: T.runway, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  env.disposables.push(runwayMat);
  const bases = [["homeBase", 0.3, false]];
  if (worldId === "desert") bases.push(["enemyBase", -0.6, true]);
  for (const [key, yaw, enemy] of bases) {
    const p = pads[key];
    if (!p) continue;
    const len = Math.min(1500, p.r * 2.1);
    const rw = new THREE.PlaneGeometry(60, len);
    rw.rotateX(-Math.PI / 2);
    env.disposables.push(rw);
    const m = new THREE.Mesh(rw, runwayMat);
    m.position.set(p.x, p.h + 0.4, p.z);
    m.rotation.y = yaw;
    grp.add(m);
    // taxiway apron + hangars + tower (decor only)
    const apron = new THREE.PlaneGeometry(260, 380);
    apron.rotateX(-Math.PI / 2);
    env.disposables.push(apron);
    const am = new THREE.Mesh(apron, kit.std("apron", 0x6f6f6c, { rough: 0.95, metal: 0 }));
    const side = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    am.position.set(p.x + side.x * 190, p.h + 0.3, p.z + side.z * 190);
    am.rotation.y = yaw;
    grp.add(am);
    if (!enemy) {
      for (let i = 0; i < 3; i++) {
        const h = buildGround(kit, "hangar", "friend");
        const along = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
        h.position.set(p.x + side.x * 270 + along.x * (i - 1) * 110, p.h, p.z + side.z * 270 + along.z * (i - 1) * 110);
        h.rotation.y = yaw + Math.PI / 2;
        grp.add(h);
      }
      const tw = buildGround(kit, "tower", "friend");
      tw.position.set(p.x + side.x * 120 + Math.sin(yaw) * 260, p.h, p.z + side.z * 120 + Math.cos(yaw) * 260);
      grp.add(tw);
      // parked friendly jets
      for (let i = 0; i < 4; i++) {
        const j = buildJet(kit, "wingman", null, { missiles: 2, gear: true });
        const along = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
        j.position.set(p.x + side.x * 160 + along.x * (i - 1.5) * 34, p.h + 2.2, p.z + side.z * 160 + along.z * (i - 1.5) * 34);
        j.rotation.y = yaw + Math.PI / 2;
        grp.add(j);
      }
    }
  }
  // instanced vegetation / rocks
  const rnd = (() => {
    let s = 12345;
    return () => ((s = (s * 16807) % 2147483647) / 2147483647);
  })();
  if (worldId === "mountain" || worldId === "ocean") {
    const trunk = new THREE.CylinderGeometry(0.6, 0.8, 6, 5).translate(0, 3, 0);
    const crown = worldId === "mountain" ? new THREE.ConeGeometry(5, 16, 6).translate(0, 13, 0) : new THREE.SphereGeometry(5.5, 6, 4).translate(0, 9, 0);
    const N = worldId === "mountain" ? 4000 : 1800;
    const trunkI = new THREE.InstancedMesh(trunk, kit.std("trunk", 0x4a3828, { rough: 1 }), N);
    const crownI = new THREE.InstancedMesh(crown, kit.std("crown" + worldId, worldId === "mountain" ? 0x2f4f2a : 0x3f7a35, { rough: 1, flat: true }), N);
    let k = 0;
    const m = new THREE.Matrix4();
    for (let tries = 0; tries < N * 8 && k < N; tries++) {
      const x = (rnd() - 0.5) * 16000;
      const z = (rnd() - 0.5) * 16000;
      const h = hf.height(x, z);
      if (worldId === "mountain" ? h < 120 || h > 950 : h < 14 || h > 300) continue;
      const sl = Math.abs(hf.height(x + 30, z) - hf.height(x - 30, z)) / 60 + Math.abs(hf.height(x, z + 30) - hf.height(x, z - 30)) / 60;
      if (sl > 0.6) continue;
      if (fbm(x / 900, z / 900, 77, 2) < 0.45) continue; // groves
      let nearPad = false;
      for (const kk in PADS[worldId]) {
        const p = PADS[worldId][kk];
        if (Math.hypot(x - p.x, z - p.z) < p.r * 1.2) nearPad = true;
      }
      if (nearPad) continue;
      const s = 0.7 + rnd() * 0.9;
      m.compose(new THREE.Vector3(x, h - 0.5, z), new THREE.Quaternion().setFromAxisAngle(UP, rnd() * 6), new THREE.Vector3(s, s, s));
      trunkI.setMatrixAt(k, m);
      crownI.setMatrixAt(k, m);
      k++;
    }
    trunkI.count = crownI.count = k;
    grp.add(trunkI, crownI);
    env.disposables.push(trunk, crown, trunkI, crownI);
  }
  if (worldId === "desert" || worldId === "mountain") {
    const rock = new THREE.DodecahedronGeometry(6, 0);
    const N = 1400;
    const ri = new THREE.InstancedMesh(rock, kit.std("rock" + worldId, worldId === "desert" ? 0x8a6448 : 0x6d6a64, { rough: 1, flat: true }), N);
    const m = new THREE.Matrix4();
    for (let k = 0; k < N; k++) {
      const x = (rnd() - 0.5) * 15000;
      const z = (rnd() - 0.5) * 15000;
      const h = hf.height(x, z);
      const s = 0.6 + rnd() * 2.6;
      m.compose(new THREE.Vector3(x, Math.max(h, -50) - s * 1.5, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rnd() * 3, rnd() * 3, 0)), new THREE.Vector3(s, s * 0.7, s));
      ri.setMatrixAt(k, m);
    }
    grp.add(ri);
    env.disposables.push(rock, ri);
  }
  // valley canyon walls get a few marker pylons along the run (mountain)
  if (worldId === "mountain") {
    for (const [x, z] of VALLEY) {
      const h = hf.height(x, z);
      const pyl = new THREE.Mesh(kit.geo("vpyl", () => new THREE.CylinderGeometry(1.2, 1.6, 40, 6).translate(0, 20, 0)), kit.std("vpyl", 0xd5d8dc, { rough: 0.6 }));
      pyl.position.set(x + 160, h, z);
      grp.add(pyl);
    }
  }
}

/* ================================================================== cockpit */
function buildCockpit(kit) {
  const g = new THREE.Group();
  const frame = kit.std("cpFrame", 0x1c1f23, { rough: 0.6, metal: 0.4 });
  const panel = kit.std("cpPanel", 0x3a424b, { rough: 0.8, metal: 0.2 });
  const screen = kit.basic("cpScreen", 0x123c48, { toneMapped: false });
  const glow = kit.basic("cpGlow", 0x38e0ff, { toneMapped: false });
  // dashboard
  const dash = new THREE.Mesh(kit.geo("cpDash", () => new THREE.BoxGeometry(1.5, 0.32, 0.5)), panel);
  dash.position.set(0, -0.5, -0.62);
  dash.rotation.x = -0.25;
  g.add(dash);
  const glare = new THREE.Mesh(kit.geo("cpGlare", () => new THREE.BoxGeometry(0.62, 0.06, 0.22)), frame);
  glare.position.set(0, -0.33, -0.62);
  g.add(glare);
  // MFDs
  const screens = [];
  for (const x of [-0.42, 0, 0.42]) {
    const s = new THREE.Mesh(kit.geo("cpMfd", () => new THREE.PlaneGeometry(0.24, 0.17)), screen);
    s.position.set(x, -0.49, -0.43);
    s.rotation.x = -0.25;
    g.add(s);
    const bar = new THREE.Mesh(kit.geo("cpBar", () => new THREE.PlaneGeometry(0.2, 0.012)), glow);
    bar.position.set(x, -0.48, -0.425);
    bar.rotation.x = -0.25;
    g.add(bar);
    screens.push(bar);
  }
  // HUD combiner glass
  const comb = new THREE.Mesh(kit.geo("cpComb", () => new THREE.PlaneGeometry(0.3, 0.22)), kit.basic("cpComb", 0x3fe8ff, { transparent: true, opacity: 0.06, add: true }));
  comb.position.set(0, -0.12, -0.6);
  comb.rotation.x = 0.35;
  g.add(comb);
  // canopy bow + rails
  const bow = new THREE.Mesh(kit.geo("cpBow", () => new THREE.TorusGeometry(0.95, 0.014, 6, 30, Math.PI)), frame);
  bow.position.set(0, -0.42, -1.05);
  g.add(bow);
  for (const s of [-1, 1]) {
    const rail = new THREE.Mesh(kit.geo("cpRail", () => new THREE.BoxGeometry(0.05, 0.05, 2.4)), frame);
    rail.position.set(s * 0.88, -0.36, 0.2);
    g.add(rail);
  }
  g.userData.update = (sim, t) => {
    const p = sim.player;
    screens[0].scale.x = Math.max(0.02, p.hp / p.maxHp);
    screens[1].scale.x = Math.max(0.02, p.throttle);
    screens[2].scale.x = Math.max(0.02, (p.speed / 330) * (0.85 + Math.sin(t * 3) * 0.02));
    screens[0].material = kit.basic(p.hp < p.maxHp * 0.3 ? "cpGlowR" : "cpGlow", p.hp < p.maxHp * 0.3 ? 0xff4a3a : 0x38e0ff, { toneMapped: false });
  };
  return g;
}

/* ================================================================== hangar */
function buildHangar(kit, own) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b1220);
  scene.fog = new THREE.Fog(0x0b1220, 60, 160);
  const camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.5, 400);
  scene.add(new THREE.HemisphereLight(0x9fc4ff, 0x1a1e26, 0.9));
  const key = new THREE.DirectionalLight(0xffffff, 2.4);
  key.position.set(20, 30, 18);
  const rim = new THREE.DirectionalLight(0x5fd6ff, 2.2);
  rim.position.set(-25, 12, -30);
  scene.add(key, rim);
  const floorG = new THREE.CircleGeometry(60, 48);
  floorG.rotateX(-Math.PI / 2);
  const floorM = new THREE.MeshStandardMaterial({ color: 0x1a2232, roughness: 0.5, metalness: 0.3 });
  const floor = new THREE.Mesh(floorG, floorM);
  scene.add(floor);
  const padG = new THREE.CylinderGeometry(14, 14.5, 0.6, 64);
  const pad = new THREE.Mesh(padG, new THREE.MeshStandardMaterial({ color: 0x2a3446, roughness: 0.4, metalness: 0.7 }));
  pad.position.y = 0.3;
  scene.add(pad);
  const ringG = new THREE.TorusGeometry(14.2, 0.08, 6, 96);
  ringG.rotateX(Math.PI / 2);
  const ring = new THREE.Mesh(ringG, kit.basic("hgRing", 0x37e0ff, { toneMapped: false }));
  ring.position.y = 0.62;
  scene.add(ring);
  // back wall ribs
  const ribG = new THREE.BoxGeometry(1.2, 40, 1.2);
  const ribM = new THREE.MeshStandardMaterial({ color: 0x1d2636, roughness: 0.6, metalness: 0.5 });
  for (let i = 0; i < 14; i++) {
    const a = Math.PI * 0.15 + (i / 13) * Math.PI * 0.7;
    const r = new THREE.Mesh(ribG, ribM);
    r.position.set(Math.cos(a) * 55, 20, -Math.sin(a) * 55);
    scene.add(r);
  }
  const stripG = new THREE.PlaneGeometry(110, 0.4);
  const strip = new THREE.Mesh(stripG, kit.basic("hgStrip", 0x37e0ff, { toneMapped: false }));
  strip.position.set(0, 14, -48);
  scene.add(strip);
  own.push(floorG, floorM, padG, pad.material, ringG, ribG, ribM, stripG);
  const jets = {};
  let cur = null;
  let spin = 0.6;
  return {
    scene, camera,
    update(dt, jetId, t) {
      if (jetId && !jets[jetId]) {
        const j = buildJet(kit, jetId, JETS[jetId].look, { missiles: 4, bombs: 2, gear: true });
        j.position.y = 0.6 + 2.15;
        scene.add(j);
        jets[jetId] = j;
      }
      for (const [id, j] of Object.entries(jets)) j.visible = id === jetId;
      cur = jets[jetId];
      spin += dt * 0.35;
      if (cur) {
        cur.rotation.y = spin;
        for (const ex of cur.userData.exhaust) ex.visible = false; // parked: engines idle
        for (const l of cur.userData.lights) if (l.blink) l.mesh.visible = t % 1.2 < 0.15;
      }
      const L = cur ? cur.userData.length : 16;
      camera.position.set(Math.sin(0.6) * L * 1.55, L * 0.42, Math.cos(0.6) * L * 1.55);
      camera.lookAt(0, 2.4, 0);
    },
    dispose() {
      for (const j of Object.values(jets)) scene.remove(j);
    },
  };
}

