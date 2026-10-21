/**
 * The 3D world: renderer, scene, post-processing, district, actors, FX,
 * hazards, rain, DOM overlay and the camera (play / menu / cinematic).
 *
 * The React shell owns the loop: it steps the sim, then calls
 * `world.frame(dt, view)`. Nothing here touches React state.
 *
 * Quality   low     no shadows, no post, 0.75 px ratio, light rain
 *           medium  1024² shadows, bloom + grade, ≤1 px ratio
 *           high    2048² soft shadows, bloom + grade + chromatic aberration,
 *                   MSAA, ≤1.5 px ratio, denser rain / steam / traffic
 */
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { loadAssets } from "./assets.js";
import { buildDistrict } from "./city.js";
import { createActors } from "./actors.js";
import { createFx } from "./fx.js";
import { createHazardView } from "./hazards.js";
import { createRain } from "./rain.js";
import { createOverlay } from "./overlay.js";
import { cameraRig } from "../engine/camera.js";
import { ceilingHeight } from "../engine/map.js";
import { CINEMATICS } from "../data/story.js";
import { DISTRICTS } from "../data/districts/index.js";

const PR = { low: 0.75, medium: 1, high: 1.5 };
const RAIN = { low: 1400, medium: 3200, high: 6000 };

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uVig: { value: 0.55 },
    uCA: { value: 0 },
    uGrain: { value: 0.025 },
    uShadow: { value: new THREE.Color(0.86, 0.9, 1.12) },
    uHigh: { value: new THREE.Color(1.1, 0.98, 1.04) },
    uSat: { value: 1.08 },
    uFlash: { value: 0 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uTime; uniform float uVig; uniform float uCA; uniform float uGrain; uniform vec3 uShadow; uniform vec3 uHigh; uniform float uSat; uniform float uFlash; varying vec2 vUv;
    void main(){
      vec2 d = vUv - 0.5; float r2 = dot(d, d);
      vec3 c;
      if (uCA > 0.0) { vec2 o = d * uCA * (0.4 + r2 * 2.0); c = vec3(texture2D(tDiffuse, vUv + o).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - o).b); }
      else c = texture2D(tDiffuse, vUv).rgb;
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c *= mix(uShadow, uHigh, smoothstep(0.02, 0.9, l));
      c = mix(vec3(l), c, uSat);
      c *= 1.0 - uVig * smoothstep(0.08, 0.5, r2);
      float n = fract(sin(dot(vUv * vec2(12.9898, 78.233) + fract(uTime) * 7.0, vec2(1.0, 1.7))) * 43758.5453);
      c += (n - 0.5) * uGrain * (0.4 + min(l, 1.0));
      c += uFlash;
      gl_FragColor = vec4(max(c, 0.0), 1.0);
    }`,
};

function neonEnvironment(renderer, palette) {
  const s = new THREE.Scene();
  s.background = new THREE.Color("#05050a");
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const add = (col, x, y, z, sx, sy, sz, k = 1) => {
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(k) }));
    m.position.set(x, y, z);
    m.scale.set(sx, sy, sz);
    s.add(m);
  };
  const n = palette.neon;
  add(n[0], -8, 2, -6, 0.4, 3, 4, 3);
  add(n[1], 8, 3, -4, 0.4, 2, 5, 3);
  add(n[2], 0, 4, 9, 6, 1.5, 0.4, 2.5);
  add(n[3] || n[0], -6, 1, 8, 3, 0.6, 0.3, 2.5);
  add(palette.hemiTop, 0, 12, 0, 30, 0.5, 30, 0.6);
  add("#101018", 0, -6, 0, 40, 0.5, 40, 1);
  const pm = new THREE.PMREMGenerator(renderer);
  const rt = pm.fromScene(s, 0.035);
  pm.dispose();
  s.traverse((o) => o.isMesh && o.material.dispose());
  geo.dispose();
  return rt;
}

export function createWorld(host, { quality = "medium", test = false } = {}) {
  const canvas = document.createElement("canvas");
  canvas.className = "nm-canvas";
  host.appendChild(canvas);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance", preserveDrawingBuffer: test, stencil: false });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(62, 16 / 9, 0.08, 900);
  const time = { value: 0 };
  const hemi = new THREE.HemisphereLight(0x3b2a6b, 0x08060d, 1.25);
  scene.add(hemi);
  // soft fill from the camera so characters read against the dark city
  const fill = new THREE.PointLight(0xd8e8ff, 5, 9, 2);
  scene.add(fill);
  const moon = new THREE.DirectionalLight(0x8fb7ff, 1.1);
  moon.castShadow = true;
  scene.add(moon, moon.target);
  const ambient = new THREE.AmbientLight(0x202030, 0.4);
  scene.add(ambient);
  const overlay = createOverlay(host);
  let q = quality;
  let W = 1280;
  let H = 720;
  let composer = null;
  let grade = null;
  let bloom = null;
  let fx = createFx(scene, q);
  const hazards = createHazardView(scene);
  let rain = createRain(scene, RAIN[q]);
  let district = null;
  let districtId = null;
  let envRT = null;
  let assets = null;
  let actors = null;
  let disposed = false;
  const camPos = new THREE.Vector3();
  const camLook = new THREE.Vector3();
  const smooth = new THREE.Vector3();
  let smoothInit = false;
  const rig = {};
  let menuT = 0;
  let cin = null;
  const ready = loadAssets().then((a) => {
    if (disposed) return false;
    assets = a;
    actors = createActors(scene, a);
    return true;
  });

  function setupShadows() {
    const S = q === "high" ? 2048 : 1024;
    moon.castShadow = q !== "low";
    renderer.shadowMap.enabled = q !== "low";
    moon.shadow.mapSize.set(S, S);
    const ext = q === "high" ? 26 : 20;
    const c = moon.shadow.camera;
    c.left = -ext;
    c.right = ext;
    c.top = ext;
    c.bottom = -ext;
    c.near = 1;
    c.far = 140;
    c.updateProjectionMatrix();
    moon.shadow.bias = -0.0004;
    moon.shadow.normalBias = 0.04;
    moon.shadow.radius = 2;
    moon.shadow.map?.dispose();
    moon.shadow.map = null;
  }
  function setupComposer() {
    if (composer) {
      composer.passes.forEach((p) => p.dispose?.());
      composer.renderTarget1.dispose();
      composer.renderTarget2.dispose();
      composer = null;
    }
    grade = null;
    bloom = null;
    if (q === "low") return;
    const rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: q === "high" ? 4 : 0 });
    composer = new EffectComposer(renderer, rt);
    composer.addPass(new RenderPass(scene, camera));
    bloom = new UnrealBloomPass(new THREE.Vector2(W / 2, H / 2), q === "high" ? 0.72 : 0.6, 0.5, 0.86);
    composer.addPass(bloom);
    grade = new ShaderPass(GradeShader);
    grade.uniforms.uCA.value = q === "high" ? 0.0035 : 0;
    composer.addPass(grade);
    composer.addPass(new OutputPass());
    composer.setPixelRatio(Math.min(window.devicePixelRatio || 1, PR[q]));
    composer.setSize(W, H);
  }
  function resize(w, h) {
    W = Math.max(2, Math.floor(w));
    H = Math.max(2, Math.floor(h));
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, PR[q]));
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
    composer?.setPixelRatio(Math.min(window.devicePixelRatio || 1, PR[q]));
    composer?.setSize(W, H);
    overlay.resize(W, H);
    const ph = H * Math.min(window.devicePixelRatio || 1, PR[q]);
    fx.setScale(ph);
    rain.setScale(ph);
    district?.steam?.setScale(ph);
  }
  function setQuality(nq) {
    if (nq === q) return;
    q = nq;
    setupShadows();
    setupComposer();
    fx.dispose();
    fx = createFx(scene, q);
    rain.dispose();
    rain = createRain(scene, RAIN[q]);
    if (districtId && lastG) buildFor(lastG, true);
    resize(W, H);
  }
  setupShadows();
  setupComposer();

  let lastG = null;
  function buildFor(G, force = false) {
    if (!force && districtId === G.districtId && district) return;
    if (district) {
      scene.remove(district.group);
      district.dispose();
    }
    actors?.clear();
    fx.clear();
    hazards.clear();
    overlay.clear();
    const def = DISTRICTS[G.districtId];
    const pal = def.palette;
    scene.fog = new THREE.FogExp2(new THREE.Color(pal.fog), pal.fogDensity);
    scene.background = new THREE.Color(pal.sky);
    hemi.color.set(pal.hemiTop);
    hemi.groundColor.set(pal.hemiBottom);
    moon.color.set(pal.key);
    envRT?.dispose();
    envRT = neonEnvironment(renderer, pal);
    scene.environment = envRT.texture;
    scene.environmentIntensity = 0.55;
    district = buildDistrict(G, q, { time });
    scene.add(district.group);
    districtId = G.districtId;
    smoothInit = false;
    const ph = H * Math.min(window.devicePixelRatio || 1, PR[q]);
    district.steam?.setScale(ph);
  }

  /* ------------------------------------------------------------ cameras */
  function playCamera(G, dt) {
    const p = G.player;
    cameraRig(G.map, p, G.camYaw, G.camPitch, G.aimT, rig);
    const target = camPos.set(rig.x, rig.y, rig.z);
    if (!smoothInit) {
      smooth.copy(target);
      smoothInit = true;
    }
    // follow quickly (no visible lag on aim), a bit softer vertically
    const k = 1 - Math.exp(-dt * 30);
    smooth.x += (target.x - smooth.x) * k;
    smooth.z += (target.z - smooth.z) * k;
    smooth.y += (target.y - smooth.y) * (1 - Math.exp(-dt * 14));
    if (target.distanceTo(smooth) > 3) smooth.copy(target);
    camera.position.copy(smooth);
    const sh = fx.shake * 0.06;
    if (sh > 0) camera.position.add(new THREE.Vector3((Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh));
    camLook.set(camera.position.x + rig.fx * 10, camera.position.y + rig.fy * 10, camera.position.z + rig.fz * 10);
    camera.lookAt(camLook);
    const fov = rig.fov + (p.sprinting ? 4 : 0);
    if (Math.abs(camera.fov - fov) > 0.05) {
      camera.fov += (fov - camera.fov) * Math.min(1, dt * 10);
      camera.updateProjectionMatrix();
    }
  }
  function menuCamera(dt) {
    menuT += dt;
    const a = menuT * 0.035;
    camera.position.set(Math.sin(a) * 34, 15 + Math.sin(menuT * 0.1) * 3, Math.cos(a) * 34 + 6);
    camera.lookAt(0, 7, 0);
    if (camera.fov !== 55) {
      camera.fov = 55;
      camera.updateProjectionMatrix();
    }
  }
  function creatorCamera(G, dt) {
    const p = G.player;
    menuT += dt;
    const a = p.yaw + 0.35 * Math.sin(menuT * 0.4);
    camera.position.set(p.x + Math.sin(a) * 2.6, p.y + 1.35, p.z + Math.cos(a) * 2.6);
    camera.lookAt(p.x, p.y + 1.05, p.z);
    if (camera.fov !== 42) {
      camera.fov = 42;
      camera.updateProjectionMatrix();
    }
    smoothInit = false;
  }
  function cinematicCamera(G, dt) {
    const c = cin;
    if (!c) return;
    c.t += dt;
    let shot = c.shots[c.i];
    while (shot && c.t > shot.dur) {
      c.t -= shot.dur;
      c.i++;
      shot = c.shots[c.i];
    }
    if (!shot) {
      c.done = true;
      shot = c.shots[c.shots.length - 1];
      c.t = shot.dur;
    }
    const k = Math.min(1, c.t / shot.dur);
    const e = k * k * (3 - 2 * k);
    let from = shot.from;
    let to = shot.to;
    if (shot.boss) {
      const b = G.boss;
      if (b) {
        const fx = Math.sin(b.yaw);
        const fz = Math.cos(b.yaw);
        const hh = b.h * 0.85;
        from = [b.x + fx * 7 + fz * 3, b.y + hh + 0.6, b.z + fz * 7 - fx * 3, b.x, b.y + hh * 0.8, b.z];
        to = [b.x + fx * 3.6 + fz * 1.2, b.y + hh * 0.95, b.z + fz * 3.6 - fx * 1.2, b.x, b.y + hh * 0.9, b.z];
      }
    }
    camera.position.set(from[0] + (to[0] - from[0]) * e, from[1] + (to[1] - from[1]) * e, from[2] + (to[2] - from[2]) * e);
    camLook.set(from[3] + (to[3] - from[3]) * e, from[4] + (to[4] - from[4]) * e, from[5] + (to[5] - from[5]) * e);
    camera.lookAt(camLook);
    if (camera.fov !== 45) {
      camera.fov = 45;
      camera.updateProjectionMatrix();
    }
    smoothInit = false;
  }

  /* ------------------------------------------------------------ frame */
  function frame(dt, view) {
    if (disposed || !assets) return;
    const G = view.G;
    if (!G) return;
    lastG = G;
    buildFor(G);
    time.value += dt;
    const mode = cin && !cin.done ? "cinematic" : view.mode;
    if (mode === "menu") menuCamera(dt);
    else if (mode === "creator") creatorCamera(G, dt);
    else if (mode === "cinematic") cinematicCamera(G, dt);
    else playCamera(G, dt);
    // sim → visuals
    actors.update(G, dt, camera.position, { hidePlayer: mode === "menu" || (cin && !cin.done && !cin.showPlayer) || (mode !== "cinematic" && smooth.distanceTo(new THREE.Vector3(G.player.x, G.player.y + 1.4, G.player.z)) < 0.55) });
    fx.update(dt, G, camera);
    hazards.update(G, dt);
    district.update(time.value, camera.position);
    fill.position.copy(camera.position).add(new THREE.Vector3(0, 0.6, 0));
    fill.intensity = mode === "menu" ? 0 : mode === "creator" ? 9 : 5;
    // moon shadow follows the player
    const p = G.player;
    const fp = mode === "menu" ? new THREE.Vector3(0, 0, 0) : new THREE.Vector3(p.x, 0, p.z);
    moon.position.set(fp.x + 18, 46, fp.z + 10);
    moon.target.position.copy(fp);
    // rain (not under ceilings)
    const indoors = ceilingHeight(G.map, camera.position.x, camera.position.z, 0.3, camera.position.y - 0.2) < camera.position.y + 30;
    rain.update(time.value, camera.position, !indoors && view.rain !== false, 0.05);
    overlay.update(G, camera, dt, mode === "play" && view.overlay !== false);
    if (grade) {
      grade.uniforms.uTime.value = time.value;
      grade.uniforms.uFlash.value = Math.max(0, (grade.uniforms.uFlash.value || 0) - dt * 1.5);
    }
    if (view.render !== false) render();
  }
  function render() {
    if (composer) composer.render();
    else renderer.render(scene, camera);
  }

  return {
    ready,
    renderer,
    scene,
    camera,
    resize,
    setQuality,
    frame,
    render,
    get quality() {
      return q;
    },
    get assets() {
      return assets;
    },
    muzzleWorld() {
      const v = actors?.playerView();
      if (!v) return null;
      return v.muzzleWorld(new THREE.Vector3());
    },
    onEvents(G, evs) {
      for (const ev of evs) {
        if (ev.type === "dmg") overlay.damage(ev);
        if (ev.type === "immune") overlay.text({ ...ev, text: "IMMUNE" }, "nm-dmg nm-dmg--immune");
        if (ev.type === "takedown") overlay.text({ x: G.player.x, y: G.player.y + 2, z: G.player.z, text: "SILENT TAKEDOWN" }, "nm-dmg nm-dmg--info");
        if (ev.type === "bossDown" && grade) grade.uniforms.uFlash.value = 0.6;
        if (ev.type === "teleport") smoothInit = false;
        if (ev.type === "district") {
          smoothInit = false;
          buildFor(G, true);
        }
        fx.onEvent(ev, G, ev.type === "fire" ? () => this.muzzleWorld() : null);
      }
    },
    playCinematic(key, opts = {}) {
      const c = key === "boss" ? { shots: [{ boss: true, dur: 3.2 }], showPlayer: false } : CINEMATICS[key];
      if (!c) return null;
      cin = { ...c, shots: c.shots, i: 0, t: 0, done: false, key, showPlayer: !!opts.showPlayer || key === "boss" };
      return cin;
    },
    cinematic: () => cin,
    endCinematic() {
      if (cin) cin.done = true;
      cin = null;
    },
    dispose() {
      disposed = true;
      actors?.dispose();
      fx.dispose();
      hazards.dispose();
      rain.dispose();
      overlay.dispose();
      if (district) {
        scene.remove(district.group);
        district.dispose();
      }
      envRT?.dispose();
      if (composer) {
        composer.passes.forEach((p) => p.dispose?.());
        composer.renderTarget1.dispose();
        composer.renderTarget2.dispose();
      }
      moon.shadow.map?.dispose();
      renderer.dispose();
      canvas.remove();
    },
  };
}
