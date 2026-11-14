/**
 * The 3D stage: renderer + post (bloom, film grade), the bunker, its light
 * rig, dust and light shafts, two CCTV feeds rendered from the airlock
 * corridor, the seated first-person camera (breathing, limited look-around,
 * smooth focus moves, shake) and the scripted cues each day's event plays.
 *
 * Quality presets (High / Medium / Low; Auto steps down when frames run
 * long) set pixel ratio, MSAA, shadows, area lights, bloom, dust and CCTV
 * refresh. Plain Three.js with one rAF loop; everything is disposed on unmount.
 */
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RectAreaLightUniformsLib } from "three/examples/jsm/lights/RectAreaLightUniformsLib.js";
import { loadEnvironment, setAnisotropy, disposeAssets, preloadSets, setPropSet } from "./assets.js";
import { buildBunker, disposeBunker, TARGETS, ROOM, vaultY } from "./bunker.js";
import { loadRigs, disposeAssets as disposeRigAssets } from "../../DeckOfShadows/render/assets.js";
import { softSprite, disposeSharedTextures } from "../../DeckOfShadows/render/materials.js";
import { audio } from "../audio.js";

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export const QUALITY = {
  high: { pr: 2, msaa: 4, shadows: true, shadowSize: 2048, casters: 2, area: true, bloom: true, dust: 1600, shafts: true, cctvEvery: 2, aniso: 8, post: true, lean: false, fps: 0 },
  medium: { pr: 1, msaa: 0, shadows: true, shadowSize: 1024, casters: 1, area: false, bloom: true, dust: 500, shafts: true, cctvEvery: 4, aniso: 4, post: true, lean: false, fps: 0 },
  // the lightest look: reduced resolution, no post-processing, no shadows, no
  // live CCTV, no particles, only the essential lights, capped at 30 fps
  low: { pr: 0.65, msaa: 0, shadows: false, shadowSize: 512, casters: 0, area: false, bloom: false, dust: 0, shafts: false, cctvEvery: 0, aniso: 1, post: false, lean: true, fps: 30 },
};

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uFlash: { value: new THREE.Vector4(0, 0, 0, 0) },
    uVig: { value: 0.5 },
    uGrain: { value: 0.03 },
    uBright: { value: 1 },
    uDesat: { value: 0 },
    uFade: { value: 0 },
    uRes: { value: new THREE.Vector2(1, 1) },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uTime, uVig, uGrain, uBright, uDesat, uFade; uniform vec4 uFlash; uniform vec2 uRes; varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){
      vec2 uv = vUv;
      vec2 dc = (uv - 0.5) * 0.0022;
      vec3 c = vec3(texture2D(tDiffuse, uv + dc).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - dc).b);
      c *= uBright;
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, 0.82 * (1.0 - uDesat));
      // teal shadows, sodium highlights
      c += vec3(-0.006, 0.002, 0.01) * (1.0 - smoothstep(0.0, 0.3, l)) + vec3(0.016, 0.006, -0.01) * smoothstep(0.45, 1.0, l);
      float d = length((uv - 0.5) * vec2(uRes.x / uRes.y, 1.0));
      c *= 1.0 - uVig * smoothstep(0.3, 1.1, d);
      c = mix(c, uFlash.rgb, uFlash.a * (0.3 + 0.7 * smoothstep(0.15, 0.9, d)));
      c += (h(uv * uRes + fract(uTime) * 91.7) - 0.5) * uGrain;
      c *= 1.0 - uFade;
      gl_FragColor = vec4(c, 1.0);
    }`,
};

/** CRT security feed: the corridor render through grain, scanlines and a rolling bar. */
function cctvMaterial(rt) {
  return new THREE.ShaderMaterial({
    uniforms: { tFeed: { value: rt.texture }, uTime: { value: 0 }, uOn: { value: 1 }, uSignal: { value: 1 }, uAlert: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D tFeed; uniform float uTime, uOn, uSignal, uAlert; varying vec2 vUv;
      float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      void main(){
        vec2 uv = vUv;
        vec2 cc = uv - 0.5; uv = 0.5 + cc * (1.0 + dot(cc, cc) * 0.25);
        float jitter = (h(vec2(floor(uTime * 24.0), uv.y * 40.0)) - 0.5) * 0.004 * (1.6 - uSignal);
        vec3 f = texture2D(tFeed, uv + vec2(jitter, 0.0)).rgb;
        float l = dot(f, vec3(0.3, 0.59, 0.11));
        l = pow(l * 1.6, 0.8);
        float n = h(uv * 300.0 + uTime * 13.0);
        l = mix(n * 0.5, l, uSignal);
        l += (n - 0.5) * 0.12;
        l *= 0.82 + 0.18 * sin(uv.y * 520.0);
        float bar = smoothstep(0.0, 0.08, abs(fract(uv.y - uTime * 0.11) - 0.5));
        l *= 0.85 + 0.15 * bar;
        vec3 col = l * mix(vec3(0.72, 0.95, 0.78), vec3(1.0, 0.45, 0.4), uAlert);
        float edge = smoothstep(0.0, 0.06, uv.x) * smoothstep(1.0, 0.94, uv.x) * smoothstep(0.0, 0.06, uv.y) * smoothstep(1.0, 0.94, uv.y);
        col *= edge;
        gl_FragColor = vec4(col * 1.6 * uOn + vec3(0.004) , 1.0);
      }`,
  });
}

/** Additive cone under a ceiling light: cheap visible light shaft with drifting dust noise. */
function shaftMaterial(color) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: { uColor: { value: new THREE.Color(color) }, uI: { value: 0.12 }, uTime: { value: 0 } },
    vertexShader: `varying vec2 vUv; varying vec3 vP; void main(){ vUv = uv; vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `uniform vec3 uColor; uniform float uI, uTime; varying vec2 vUv; varying vec3 vP;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
      void main(){
        float fall = pow(vUv.y, 1.6);
        float side = sin(vUv.x * 3.14159);
        float dust = 0.7 + 0.3 * n(vec2(vUv.x * 8.0 + uTime * 0.05, vUv.y * 5.0 - uTime * 0.08));
        gl_FragColor = vec4(uColor * uI * fall * side * dust, 1.0);
      }`,
  });
}

let rectInit = false;

export function createWorld(container, opts = {}) {
  let qualityName = !opts.quality || opts.quality === "auto" ? "low" : opts.quality;
  let autoQuality = !opts.quality || opts.quality === "auto";
  let Q = QUALITY[qualityName];
  const canvas = document.createElement("canvas");
  canvas.className = "dds-canvas";
  container.appendChild(canvas);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance", preserveDrawingBuffer: !!opts.preserve });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = Q.shadows;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  setAnisotropy(Math.min(Q.aniso, renderer.capabilities.getMaxAnisotropy()));
  if (!rectInit) {
    RectAreaLightUniformsLib.init();
    rectInit = true;
  }

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x020203);
  scene.fog = new THREE.FogExp2(0x0a0b0d, 0.04);
  const camera = new THREE.PerspectiveCamera(58, 1, 0.03, 60);
  camera.position.copy(TARGETS.desk.pos);

  let W = 2;
  let H = 2;
  const rt = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType, samples: Q.msaa });
  const composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.55, 0.6, 0.82);
  const grade = new ShaderPass(GradeShader);
  composer.addPass(bloom);
  composer.addPass(grade);
  composer.addPass(new OutputPass());
  bloom.enabled = Q.bloom;
  const G = grade.uniforms;

  let disposed = false;
  let B = null; // bunker handles
  let rigs = null;
  let burrower = null;
  let mara = null;
  let brightness = opts.brightness ?? 1;
  let shakeOn = opts.shake ?? true;
  const owned = new Set();
  const own = (x) => (owned.add(x), x);

  /* ---------------------------------------------------------------- lights */
  const L = {};
  const lightsGroup = new THREE.Group();
  scene.add(lightsGroup);
  L.hemi = new THREE.HemisphereLight(0x6a7480, 0x15120e, 0.18);
  lightsGroup.add(L.hemi);
  // ceiling tubes: rect area lights (soft, realistic falloff) or points on Low
  L.tubes = [];
  const tubeZ = [1.6, -1.2, -3.9];
  for (const z of tubeZ) {
    const y = vaultY(0) - 0.09;
    const a = new THREE.RectAreaLight(0xdfe9ff, 6, 1.1, 0.5);
    a.position.set(0, y, z);
    a.lookAt(0, 0, z);
    const p = new THREE.PointLight(0xdfe9ff, 6, 7, 2);
    p.position.set(0, y - 0.15, z);
    lightsGroup.add(a, p);
    L.tubes.push({ area: a, point: p, base: 1, flick: 0, z });
  }
  // shadow-casting key under the middle tube
  L.key = new THREE.SpotLight(0xdde6ff, 22, 9, 1.05, 0.7, 1.6);
  L.key.position.set(0, vaultY(0) - 0.2, -1.2);
  L.key.target.position.set(0, 0, -1.6);
  lightsGroup.add(L.key, L.key.target);
  // desk lamp (warm)
  L.desk = new THREE.SpotLight(0xffb36b, 4, 3.2, 0.75, 0.6, 1.8);
  L.desk.position.set(0.7, 1.32, 2.45);
  L.desk.target.position.set(0.05, 0.79, 2.55);
  lightsGroup.add(L.desk, L.desk.target);
  // red emergency lights + rotating beacon
  L.red = [V(-2.6, 2.2, -5.2), V(2.6, 2.2, 1.2)].map((p) => {
    const l = new THREE.PointLight(0xff2a14, 0, 7, 2);
    l.position.copy(p);
    lightsGroup.add(l);
    return l;
  });
  L.beacon = new THREE.SpotLight(0xff2a10, 0, 9, 0.5, 0.6, 1.4);
  L.beacon.position.set(0, 2.55, ROOM.z0 + 0.35);
  lightsGroup.add(L.beacon, L.beacon.target);
  // monitor spill, radio dial, corridor, sector C, daylight for the rescue
  L.monitor = new THREE.PointLight(0x8fd3a8, 0.5, 2.2, 2);
  L.monitor.position.set(1.55, 1.25, 2.3);
  L.radio = new THREE.PointLight(0xffa040, 0, 1.2, 2);
  L.radio.position.set(-0.6, 1.0, 2.6);
  L.corridor = new THREE.PointLight(0xc9d4c0, 2.2, 7, 2);
  L.sector = new THREE.PointLight(0xff8a3a, 0, 5, 2);
  L.sector.position.set(ROOM.x0 - 0.8, 1.2, -4.25);
  L.day = new THREE.SpotLight(0xdfe8ff, 0, 18, 0.55, 0.8, 1);
  lightsGroup.add(L.monitor, L.radio, L.corridor, L.sector, L.day, L.day.target);

  function applyShadows() {
    renderer.shadowMap.enabled = Q.shadows;
    const casters = [L.key, L.desk];
    casters.forEach((l, i) => {
      l.castShadow = Q.shadows && i < Q.casters;
      l.shadow.mapSize.set(Q.shadowSize, Q.shadowSize);
      l.shadow.bias = -0.0004;
      l.shadow.normalBias = 0.02;
      l.shadow.radius = 4;
      if (l.shadow.map) {
        l.shadow.map.dispose();
        l.shadow.map = null;
      }
    });
    for (const t of L.tubes) {
      t.area.visible = Q.area;
      t.point.visible = !Q.area && !(Q.lean && t === L.tubes[2]);
    }
    // fewer lights = much cheaper shaders on every surface
    for (const l of [L.key, L.monitor, L.radio, L.sector, L.day, L.beacon, L.red[1]]) l.visible = !Q.lean;
    bloom.enabled = Q.bloom;
    scene.traverse((o) => {
      if (o.material) o.material.needsUpdate = true;
    });
  }
  applyShadows();

  /* ---------------------------------------------------------------- dust + shafts */
  let dust = null;
  function buildDust() {
    if (dust) {
      dust.geometry.dispose();
      dust.material.dispose();
      dust.removeFromParent();
    }
    const n = Q.dust;
    if (!n) {
      dust = null;
      return;
    }
    const g = new THREE.BufferGeometry();
    const p = new Float32Array(n * 3);
    const s = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      p[i * 3] = (Math.random() - 0.5) * 6;
      p[i * 3 + 1] = Math.random() * 3.2;
      p[i * 3 + 2] = ROOM.z0 + Math.random() * (ROOM.z1 - ROOM.z0);
      s[i] = Math.random();
    }
    g.setAttribute("position", new THREE.BufferAttribute(p, 3));
    g.setAttribute("seed", new THREE.BufferAttribute(s, 1));
    const m = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uMap: { value: softSprite() }, uScale: { value: 1 }, uI: { value: 1 } },
      vertexShader: /* glsl */ `attribute float seed; uniform float uTime, uScale; varying float vA;
        void main(){ vec3 p = position;
          p.x += sin(uTime * 0.13 + seed * 40.0) * 0.25; p.y += sin(uTime * 0.09 + seed * 17.0) * 0.18 - mod(uTime * 0.01 * (0.5 + seed), 0.0);
          p.z += cos(uTime * 0.11 + seed * 23.0) * 0.25;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = uScale * (6.0 + seed * 10.0) / -mv.z; vA = 0.25 + 0.75 * fract(seed * 7.3);
          gl_Position = projectionMatrix * mv; }`,
      fragmentShader: /* glsl */ `uniform sampler2D uMap; uniform float uI; varying float vA;
        void main(){ float a = texture2D(uMap, gl_PointCoord).a; gl_FragColor = vec4(vec3(0.75, 0.72, 0.66) * a * vA * 0.11 * uI, 1.0); }`,
    });
    dust = new THREE.Points(g, m);
    dust.frustumCulled = false;
    scene.add(dust);
  }
  buildDust();
  const shafts = [];
  for (const t of L.tubes) {
    const geo = own(new THREE.CylinderGeometry(0.35, 1.25, vaultY(0) - 0.1, 24, 1, true));
    geo.translate(0, -(vaultY(0) - 0.1) / 2, 0);
    const m = own(shaftMaterial(0xcfdcff));
    const c = new THREE.Mesh(geo, m);
    c.position.set(0, vaultY(0) - 0.08, t.z);
    c.renderOrder = 5;
    scene.add(c);
    shafts.push(c);
  }

  /* ---------------------------------------------------------------- CCTV */
  const cctv = [
    { rt: own(new THREE.WebGLRenderTarget(320, 240)), cam: new THREE.PerspectiveCamera(70, 4 / 3, 0.05, 20) },
    { rt: own(new THREE.WebGLRenderTarget(320, 240)), cam: new THREE.PerspectiveCamera(62, 4 / 3, 0.05, 30) },
  ];
  let cctvMats = [];

  /* ---------------------------------------------------------------- deck on the desk */
  const deckGroup = new THREE.Group();
  {
    const c = document.createElement("canvas");
    c.width = 128;
    c.height = 176;
    const g = c.getContext("2d");
    g.fillStyle = "#2a2219";
    g.fillRect(0, 0, 128, 176);
    g.strokeStyle = "#8a6d3f";
    g.lineWidth = 4;
    g.strokeRect(8, 8, 112, 160);
    g.lineWidth = 2;
    g.strokeRect(16, 16, 96, 144);
    g.beginPath();
    g.arc(64, 88, 26, 0, Math.PI * 2);
    g.stroke();
    for (let i = 0; i < 3; i++) {
      g.beginPath();
      g.moveTo(64, 88);
      g.lineTo(64 + Math.cos(-Math.PI / 2 + (i * Math.PI * 2) / 3) * 26, 88 + Math.sin(-Math.PI / 2 + (i * Math.PI * 2) / 3) * 26);
      g.stroke();
    }
    for (let i = 0; i < 600; i++) {
      g.fillStyle = `rgba(0,0,0,${Math.random() * 0.18})`;
      g.fillRect(Math.random() * 128, Math.random() * 176, 2, 2);
    }
    const tex = own(new THREE.CanvasTexture(c));
    tex.colorSpace = THREE.SRGBColorSpace;
    const back = own(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 }));
    const edge = own(new THREE.MeshStandardMaterial({ color: 0xcdbf9f, roughness: 0.9 }));
    const card = own(new THREE.BoxGeometry(0.068, 0.0006, 0.095));
    for (let i = 0; i < 14; i++) {
      const m = new THREE.Mesh(card, [edge, edge, back, edge, edge, edge]);
      m.position.set((Math.random() - 0.5) * 0.002, i * 0.0007, (Math.random() - 0.5) * 0.002);
      m.rotation.y = (Math.random() - 0.5) * 0.04;
      m.castShadow = true;
      m.receiveShadow = true;
      deckGroup.add(m);
    }
    deckGroup.position.set(0.32, 0.795, 2.42);
    deckGroup.rotation.y = 0.18;
    scene.add(deckGroup);
  }

  /* ---------------------------------------------------------------- camera director */
  const cam = {
    pos: TARGETS.desk.pos.clone(),
    look: TARGETS.room.look.clone(),
    fromP: V(),
    fromL: V(),
    toP: TARGETS.room.pos.clone(),
    toL: TARGETS.room.look.clone(),
    t: 1,
    dur: 1,
    px: 0,
    py: 0,
    tx: 0,
    ty: 0,
    shake: 0,
    menu: false,
    breathe: 1,
  };
  function focus(name, dur = 1.6) {
    const T = TARGETS[name] || TARGETS.room;
    cam.fromP.copy(cam.pos);
    cam.fromL.copy(cam.look);
    cam.toP.copy(T.pos);
    cam.toL.copy(T.look);
    cam.t = 0;
    cam.dur = dur;
    cam.focus = name;
  }
  function kick(a) {
    if (shakeOn) cam.shake = Math.min(0.08, cam.shake + a);
  }

  /* ---------------------------------------------------------------- mood */
  const mood = { power: 1, powerT: 1, alarm: false, red: 0, redT: 0, flicker: 0.3, beaconT: 0, day: 0, dayT: 0, sector: 0, sectorT: 0, tension: 0 };
  function setMood(m) {
    if (m.power != null) mood.powerT = m.power;
    if (m.alarm != null) mood.alarm = m.alarm;
    if (m.red != null) mood.redT = m.red;
    if (m.flicker != null) mood.flicker = m.flicker;
    if (m.tension != null) mood.tension = m.tension;
  }
  function flash(r, g, b, a) {
    G.uFlash.value.set(r, g, b, Math.max(G.uFlash.value.w, a));
  }

  /* ---------------------------------------------------------------- loading */
  let loaded = false;
  async function load(onProgress) {
    onProgress?.(0.05);
    const envP = loadEnvironment(renderer);
    await preloadSets(["concrete_wall_008", "concrete_floor_worn_001", "painted_concrete", "rusty_metal_02", "rusty_painted_metal", "concrete_floor_02"]);
    if (disposed) return false;
    onProgress?.(0.25);
    const env = await envP;
    if (disposed) return false;
    scene.environment = env;
    scene.environmentIntensity = 0.22;
    onProgress?.(0.35);
    // Low loads the simplified prop set (applies from load; switching later keeps the loaded set)
    setPropSet(qualityName === "low" ? "props-lite" : "props");
    B = await buildBunker({ quality: qualityName, onProgress });
    if (disposed) {
      disposeBunker(B);
      return false;
    }
    scene.add(B.root);
    for (const s of B.screens) {
      const mi = B.screens.indexOf(s);
      const m = own(cctvMaterial(cctv[mi].rt));
      s.mesh.material = m;
      cctvMats.push(m);
    }
    // CCTV cameras: one high in the corridor looking at the door, one through the door outward
    const cz = B.corridor;
    cctv[0].cam.position.set(0.95, 2.3, cz.end + 0.4);
    cctv[0].cam.lookAt(0, 1.0, ROOM.z0 - 0.3);
    cctv[1].cam.position.set(-0.9, 2.25, ROOM.z0 - 0.5);
    cctv[1].cam.lookAt(0.2, 0.8, cz.end + 0.5);
    L.corridor.position.set(0, 2.25, cz.z);
    L.day.position.set(0, 2.2, cz.end + 0.5);
    L.day.target.position.set(0, 0.8, ROOM.z0 + 2);
    rigs = await loadRigs();
    if (disposed) return false;
    const { buildBurrower, buildMara } = await import("./creature.js");
    burrower = buildBurrower(rigs);
    burrower.root.visible = false;
    scene.add(burrower.root);
    mara = buildMara(rigs);
    mara.root.visible = false;
    scene.add(mara.root);
    onProgress?.(1);
    loaded = true;
    // compile everything once so the first event doesn't hitch
    burrower.root.visible = mara.root.visible = true;
    renderer.compile(scene, camera);
    burrower.root.visible = mara.root.visible = false;
    return true;
  }

  /* ---------------------------------------------------------------- persistent props */
  const state = { companion: false, ventSealed: false, sector: "closed" };
  function setPersistent({ companion, ventSealed, sector, storageOpen } = {}) {
    if (!B) return;
    if (companion != null) {
      state.companion = companion;
      if (companion) {
        mara.root.visible = true;
        mara.root.position.set(ROOM.x1 - 0.6, 0.0, -4.0);
        mara.root.rotation.y = -Math.PI / 2 - 0.5;
        mara.play("Sit", { fade: 0 });
        mara.anim.spec.idle = "Sit";
      } else if (mara.root.visible && mara.mode === "bunker") mara.root.visible = false;
      mara.mode = companion ? "bunker" : null;
      if (!companion) mara.root.visible = false;
    }
    if (ventSealed != null) {
      state.ventSealed = ventSealed;
      B.vent.plate.visible = ventSealed;
    }
    if (sector != null) {
      state.sector = sector;
      B.sector.target = sector === "open" ? 0.35 : 0;
      mood.sectorT = sector === "open" ? 1 : 0;
    }
    if (storageOpen != null) B.storage.target = storageOpen ? 0.3 : 0;
  }

  /* ---------------------------------------------------------------- cues */
  let cueToken = 0;
  const wait = (ms, tok) => new Promise((r) => setTimeout(() => r(tok === cueToken && !disposed), ms));
  const stopCreature = () => {
    if (!burrower) return;
    burrower.root.visible = false;
    burrower.walk = null;
    burrower.rise = null;
  };

  /** Plays the staging for an event scene. Resolves when the key moment has played. */
  async function cue(name, ctx = {}) {
    if (!B) return;
    const tok = ++cueToken;
    const W8 = (ms) => wait(ms, tok);
    switch (name) {
      case "lockdown": {
        focus("door", 2);
        setMood({ alarm: true, red: 1 });
        audio.siren(true);
        B.door.spin = 1;
        B.door.rattle = 0.6;
        if (!(await W8(2600))) return;
        B.door.spin = 0;
        audio.siren(false);
        audio.bang();
        kick(0.03);
        setMood({ alarm: false, red: 0 });
        await W8(900);
        focus("room", 1.8);
        break;
      }
      case "low":
        focus("shelves", 1.8);
        await W8(1600);
        break;
      case "knock": {
        focus("door", 1.8);
        // Mara outside, seen on CCTV
        mara.root.visible = true;
        mara.mode = "door";
        mara.root.position.set(0.15, 0, ROOM.z0 - 1.2);
        mara.root.rotation.y = 0;
        mara.anim.spec.idle = "Idle";
        mara.idle();
        if (!(await W8(900))) return;
        audio.knock(3);
        B.door.rattle = 0.5;
        kick(0.012);
        if (!(await W8(2200))) return;
        audio.knock(3);
        B.door.rattle = 0.5;
        if (!(await W8(1400))) return;
        focus("monitors", 1.4);
        await W8(1200);
        break;
      }
      case "powerfail": {
        focus("generator", 1.4);
        audio.powerDown();
        kick(0.02);
        for (let i = 0; i < 6; i++) {
          setMood({ power: i % 2 ? 1 : 0.1 });
          if (!(await W8(90 + Math.random() * 120))) return;
        }
        setMood({ power: 0, red: 1 });
        await W8(1600);
        break;
      }
      case "walls": {
        focus("vent", 1.6);
        if (!(await W8(800))) return;
        audio.scratch(3.2);
        B.vent.shake = 1.2;
        if (!(await W8(1800))) return;
        B.rat.t = 0;
        B.rat.obj.visible = true;
        audio.scratch(1.5);
        await W8(1600);
        break;
      }
      case "storage": {
        B.storage.target = 0.3;
        focus("storage", 1.8);
        audio.door(true);
        await W8(2000);
        break;
      }
      case "radio": {
        focus("radio", 1.5);
        audio.static(true);
        L.radio.intensity = 1.2;
        if (!(await W8(900))) return;
        audio.radioVoice();
        await W8(2600);
        break;
      }
      case "water":
        focus("shelves", 1.6);
        for (let i = 0; i < 5; i++) {
          audio.drip();
          if (!(await W8(380))) return;
        }
        break;
      case "breach": {
        setMood({ alarm: true, red: 1 });
        audio.siren(true);
        focus("monitors", 1.4);
        burrower.root.visible = true;
        burrower.root.position.set(0.1, 0, B.corridor.end + 1.0);
        burrower.root.rotation.y = 0;
        burrower.anim.spec.idle = "Idle";
        burrower.walk = { from: B.corridor.end + 1.0, to: ROOM.z0 - 0.9, t: 0, dur: 5.5 };
        burrower.play("Walk", { timeScale: 0.55 });
        if (!(await W8(3200))) return;
        audio.siren(false);
        focus("door", 1.4);
        if (!(await W8(1400))) return;
        audio.bang();
        B.door.rattle = 1;
        kick(0.035);
        await W8(900);
        break;
      }
      case "sector": {
        focus("sector", 1.8);
        audio.door(true);
        B.sector.target = 0.35;
        mood.sectorT = 1;
        await W8(2200);
        break;
      }
      case "rations":
        focus("desk", 1.4);
        await W8(1200);
        break;
      case "alarm": {
        setMood({ alarm: true, red: 1, power: 0.25 });
        audio.siren(true);
        focus("ceiling", 1.6);
        if (!(await W8(2200))) return;
        audio.siren(false);
        focus("door", 1.6);
        await W8(1200);
        break;
      }
      case "creature": {
        setMood({ power: 0.3, red: 0.6, tension: 1 });
        focus("hatch", 1.6);
        audio.heartbeat(4);
        if (!(await W8(1200))) return;
        B.hatch.target = 1;
        audio.bang();
        kick(0.02);
        burrower.root.visible = true;
        burrower.root.position.set(0, -2.0, -2.4);
        burrower.root.rotation.y = 0;
        burrower.anim.spec.idle = "CrouchIdle";
        burrower.idle();
        burrower.rise = { t: 0, dur: 2.6, from: -2.0, to: 0 };
        audio.breath(true);
        if (!(await W8(2400))) return;
        audio.shriek();
        flash(0.4, 0.05, 0.02, 0.35);
        kick(0.04);
        focus("creature", 1.2);
        await W8(1200);
        break;
      }
      case "finalnight": {
        focus("room", 1.6);
        audio.footsteps(8, 0.5);
        if (!(await W8(2200))) return;
        audio.knock(4);
        B.door.rattle = 0.8;
        setMood({ flicker: 1 });
        await W8(1600);
        break;
      }
      case "intro": {
        setMood({ flicker: 1, red: 0.6 });
        audio.bang();
        kick(0.02);
        if (!(await W8(2400))) return;
        setMood({ flicker: 0.3, red: 0 });
        break;
      }
      case "rescue": {
        // dawn of day 15: rotors far above, something awake below
        focus("ceiling", 1.8);
        audio.rotor(true);
        if (!(await W8(1800))) return;
        focus("hatch", 1.6);
        B.hatch.target = 0.15;
        audio.growl();
        kick(0.02);
        if (!(await W8(1400))) return;
        B.hatch.target = 0;
        focus("door", 1.6);
        await W8(900);
        break;
      }
      case "escape": {
        focus("door", 1.6);
        B.door.spin = 1;
        if (!(await W8(1200))) return;
        B.door.spin = 0;
        audio.door(true);
        B.door.target = 1;
        mood.dayT = 1;
        await W8(2400);
        break;
      }

      /* ------------- outcomes */
      case "creatureFight": {
        if (!burrower.root.visible) return;
        const a = burrower.act("claw");
        await a.impact;
        audio.hurt();
        flash(0.6, 0.02, 0.0, 0.6);
        kick(0.06);
        await W8(500);
        burrower.hit(1.6);
        audio.shriek();
        await W8(900);
        burrower.rise = { t: 0, dur: 1.6, from: 0, to: -2.1, hide: true };
        B.hatch.target = 0;
        break;
      }
      case "creatureFlee":
        G.uFade.value = 0;
        mood.fadeT = 1;
        audio.footsteps(6, 0.25);
        await W8(1500);
        stopCreature();
        B.hatch.target = 0;
        mood.fadeT = 0;
        break;
      case "creatureLure": {
        burrower.play("CrouchWalk", { timeScale: 0.7 });
        burrower.walkTo = { to: V(ROOM.x0 + 0.5, 0, -2.05), t: 0, dur: 3.2, from: burrower.root.position.clone() };
        B.storage.target = 0.6;
        await W8(3300);
        stopCreature();
        B.storage.target = 0;
        audio.door(false);
        kick(0.02);
        B.hatch.target = 0;
        break;
      }
      case "intruderGone":
        stopCreature();
        break;
      case "hurt":
        audio.hurt();
        flash(0.55, 0.02, 0.0, 0.5);
        kick(0.04);
        break;
      case "nightQuiet":
        setMood({ power: Math.min(mood.powerT, 0.4) });
        audio.footsteps(4, 0.8);
        await W8(1200);
        break;
      case "nightHeld":
        audio.bang();
        B.door.rattle = 1;
        kick(0.03);
        await W8(1200);
        break;
      case "nightBreach":
        audio.bang();
        B.door.rattle = 1.2;
        kick(0.06);
        flash(0.5, 0.0, 0.0, 0.6);
        audio.growl();
        await W8(1200);
        break;
      default:
        break;
    }
    void ctx;
  }

  /** Back to the neutral room state between events (keeps persistent props). */
  function reset({ power = 1, generator = true } = {}) {
    cueToken++;
    stopCreature();
    audio.siren(false);
    audio.static(false);
    audio.rotor(false);
    L.radio.intensity = 0;
    B && (B.door.target = 0);
    B && (B.door.spin = 0);
    B && (B.hatch.target = 0);
    B && (B.storage.target = 0);
    if (B) B.sector.target = state.sector === "open" ? 0.35 : 0;
    mood.dayT = 0;
    mood.fadeT = 0;
    setMood({ alarm: false, red: power < 0.5 ? 1 : 0, power, flicker: 0.3, tension: 0 });
    if (mara && mara.mode === "door") {
      mara.mode = null;
      mara.root.visible = false;
    }
    setPersistent({ companion: state.companion });
    audio.generator(generator);
  }

  /* ---------------------------------------------------------------- loop */
  const clock = new THREE.Clock();
  let raf = 0;
  let frame = 0;
  let slow = 0;
  let last = performance.now();
  const listeners = { quality: opts.onQuality || (() => {}) };
  const tmpP = V();
  const tmpL = V();

  let simT = 0;
  let lastDraw = 0;
  function tick() {
    raf = requestAnimationFrame(tick);
    const nowDraw = performance.now();
    if (Q.fps && nowDraw - lastDraw < 1000 / Q.fps - 2) return;
    lastDraw = nowDraw;
    const dt = Math.min(0.05, clock.getDelta());
    simT += dt;
    const t = simT;
    frame++;
    // auto quality
    const nowT = performance.now();
    const ft = nowT - last;
    last = nowT;
    if (autoQuality && loaded && document.visibilityState === "visible") {
      if (ft > 40) slow++;
      else slow = Math.max(0, slow - 0.5);
      if (slow > 45 && qualityName !== "low") {
        slow = 0;
        setQualityInternal(qualityName === "high" ? "medium" : "low");
        listeners.quality(qualityName);
      }
    }
    step(dt, t);
    renderFrame(dt);
  }

  /** Advance animation, camera and lights by dt (no rendering). */
  function step(dt, t) {
    // camera
    cam.t = Math.min(1, cam.t + dt / cam.dur);
    const k = ease(cam.t);
    cam.pos.lerpVectors(cam.fromP, cam.toP, k);
    cam.look.lerpVectors(cam.fromL, cam.toL, k);
    if (cam.t >= 1) {
      cam.pos.copy(cam.toP);
      cam.look.copy(cam.toL);
    }
    cam.px += (cam.tx - cam.px) * Math.min(1, dt * 3);
    cam.py += (cam.ty - cam.py) * Math.min(1, dt * 3);
    cam.shake = Math.max(0, cam.shake - dt * 0.12);
    tmpP.copy(cam.pos);
    tmpP.y += Math.sin(t * 1.25) * 0.006 * cam.breathe;
    tmpP.x += Math.sin(t * 0.6) * 0.003;
    if (cam.menu) {
      tmpP.x += Math.sin(t * 0.08) * 0.35;
      tmpP.z += Math.sin(t * 0.06) * 0.2;
    }
    camera.position.copy(tmpP);
    tmpL.copy(cam.look);
    // look-around offsets in the view's own frame
    const dir = tmpL.clone().sub(tmpP);
    const dist = dir.length();
    const right = V().crossVectors(dir, V(0, 1, 0)).normalize();
    tmpL.addScaledVector(right, cam.px * dist * 0.22).add(V(0, cam.py * dist * 0.14, 0));
    if (cam.shake > 0) tmpL.add(V((Math.random() - 0.5) * cam.shake, (Math.random() - 0.5) * cam.shake, 0).multiplyScalar(dist));
    camera.lookAt(tmpL);

    // mood → lights
    mood.power += (mood.powerT - mood.power) * Math.min(1, dt * 4);
    mood.red += (mood.redT - mood.red) * Math.min(1, dt * 2);
    mood.day += (mood.dayT - mood.day) * Math.min(1, dt * 0.8);
    mood.sector += (mood.sectorT - mood.sector) * Math.min(1, dt * 1.5);
    for (const tb of L.tubes) {
      // fluorescent flicker: rare dropouts, stronger with mood.flicker
      if (Math.random() < 0.002 * (1 + mood.flicker * 6)) {
        tb.flick = 0.06 + Math.random() * 0.18;
        if (tb === L.tubes[1] && Math.random() < 0.5) audio.flicker();
      }
      tb.flick = Math.max(0, tb.flick - dt);
      const on = tb.flick > 0 ? (Math.sin(t * 90) > 0 ? 0.15 : 0.9) : 1;
      const I = mood.power * on;
      tb.area.intensity = 7 * I;
      tb.point.intensity = 5 * I;
      tb.lvl = I;
    }
    if (B) for (let i = 0; i < B.tubes.length; i++) B.tubes[i].emissiveIntensity = 2.4 * (L.tubes[Math.min(2, Math.floor(i / 7))]?.lvl ?? mood.power);
    L.key.intensity = 18 * mood.power * (L.tubes[1].lvl ?? 1);
    L.desk.intensity = 3.2 + 1.5 * (1 - mood.power);
    const pulse = mood.alarm ? 0.55 + 0.45 * Math.sin(t * 5) : 1;
    for (const r of L.red) r.intensity = 3.2 * mood.red * pulse;
    L.beacon.intensity = mood.alarm ? 40 : 0;
    L.beacon.target.position.set(Math.sin(t * 4) * 4, 0.5, ROOM.z0 + 1.5 + Math.cos(t * 4) * 4);
    if (B) for (const m of B.beaconMats) m.emissiveIntensity = mood.alarm ? 3 + 2 * Math.sin(t * 8) : 0.25 * mood.red;
    L.corridor.intensity = (1.6 + Math.sin(t * 13) * 0.2 * (Math.random() < 0.05 ? 3 : 1)) * (0.6 + 0.4 * mood.power) + mood.day * 30;
    L.corridor.color.setRGB(0.79 + mood.day * 0.2, 0.83 + mood.day * 0.15, 0.75 + mood.day * 0.25);
    L.day.intensity = mood.day * 60;
    L.sector.intensity = mood.sector * (2.2 + Math.sin(t * 2.3) * 0.4);
    L.monitor.intensity = 0.55 * Math.max(0.15, mood.power);
    L.hemi.intensity = 0.16 + 0.12 * mood.power;
    for (const s of shafts) {
      s.visible = Q.shafts;
      s.material.uniforms.uI.value = 0.035 * mood.power;
      s.material.uniforms.uTime.value = t;
    }
    if (dust) {
      dust.material.uniforms.uTime.value = t;
      dust.material.uniforms.uScale.value = H * 0.9;
      dust.material.uniforms.uI.value = 0.35 + mood.power * 0.65;
    }
    if (mood.fadeT != null) G.uFade.value += ((mood.fadeT || 0) - G.uFade.value) * Math.min(1, dt * 3);
    // flash decay
    G.uFlash.value.w = Math.max(0, G.uFlash.value.w - dt * 1.1);
    G.uTime.value = t;
    G.uBright.value = brightness;

    if (B) {
      for (const f of B.anim) f(dt, t);
      // rat scurry along the right wall
      const R = B.rat;
      if (R.t >= 0) {
        R.t += dt;
        const k2 = Math.min(1, R.t / 1.4);
        R.obj.position.set(ROOM.x1 - 0.25, 0, 0.9 - k2 * 3.2);
        R.obj.rotation.y = Math.PI;
        if (k2 >= 1) {
          R.t = -1;
          R.obj.visible = false;
        }
      }
    }
    if (burrower && burrower.root.visible) {
      const bw = burrower;
      if (bw.walk) {
        bw.walk.t += dt;
        const k3 = Math.min(1, bw.walk.t / bw.walk.dur);
        bw.root.position.z = bw.walk.from + (bw.walk.to - bw.walk.from) * k3;
        if (k3 >= 1) {
          bw.walk = null;
          bw.anim.spec.idle = "Idle";
          bw.idle();
        }
      }
      if (bw.walkTo) {
        const w = bw.walkTo;
        w.t += dt;
        const k4 = Math.min(1, w.t / w.dur);
        bw.root.position.lerpVectors(w.from, w.to, k4);
        bw.root.rotation.y = Math.atan2(w.to.x - w.from.x, w.to.z - w.from.z);
        if (k4 >= 1) bw.walkTo = null;
      }
      if (bw.rise) {
        bw.rise.t += dt;
        const k5 = ease(Math.min(1, bw.rise.t / bw.rise.dur));
        bw.root.position.y = bw.rise.from + (bw.rise.to - bw.rise.from) * k5;
        if (k5 >= 1) {
          if (bw.rise.hide) bw.root.visible = false;
          bw.rise = null;
        }
      }
      bw.update(dt, camera.position);
    }
    if (mara && mara.root.visible) mara.update(dt, camera.position);

    // CCTV
    for (const m of cctvMats) {
      m.uniforms.uTime.value = t;
      m.uniforms.uOn.value = Math.max(0.0, Math.min(1, mood.power * 1.4));
      m.uniforms.uAlert.value = mood.alarm ? 0.5 + 0.5 * Math.sin(t * 5) : 0;
    }
  }

  function renderFrame(dt) {
    if (loaded && Q.cctvEvery && frame % Q.cctvEvery === 0 && mood.power > 0.05) {
      const c = cctv[(frame / Q.cctvEvery) % 2 | 0];
      const fog = scene.fog;
      scene.fog = null;
      shafts.forEach((s) => (s.visible = false));
      dust && (dust.visible = false);
      // the screens sample these targets: hide them while rendering into them
      for (const s of B.screens) s.mesh.visible = false;
      renderer.setRenderTarget(c.rt);
      renderer.render(scene, c.cam);
      renderer.setRenderTarget(null);
      scene.fog = fog;
      shafts.forEach((s) => (s.visible = Q.shafts));
      dust && (dust.visible = true);
      for (const s of B.screens) s.mesh.visible = true;
    }
    if (Q.post) composer.render(dt);
    else renderer.render(scene, camera);
  }
  raf = requestAnimationFrame(tick);

  /* ---------------------------------------------------------------- public */
  function resize(w, h) {
    W = Math.max(2, w | 0);
    H = Math.max(2, h | 0);
    const pr = Math.min(window.devicePixelRatio || 1, Q.pr);
    renderer.setPixelRatio(pr);
    renderer.setSize(W, H, false);
    composer.setPixelRatio(pr);
    composer.setSize(W, H);
    bloom.resolution.set(W * pr * 0.5, H * pr * 0.5);
    camera.aspect = W / H;
    // keep the desk + door framed on tall/narrow stages
    camera.fov = W / H < 1.3 ? 66 : 58;
    camera.updateProjectionMatrix();
    G.uRes.value.set(W, H);
  }
  function setQualityInternal(name) {
    qualityName = name;
    Q = QUALITY[name];
    rt.samples = Q.msaa;
    rt.dispose();
    setAnisotropy(Math.min(Q.aniso, renderer.capabilities.getMaxAnisotropy()));
    applyShadows();
    buildDust();
    resize(W, H);
  }
  function setQuality(q) {
    autoQuality = q === "auto";
    const name = autoQuality ? qualityName : q;
    if (QUALITY[name]) setQualityInternal(name);
  }

  /** Screen position (px) of a world point, for anchoring DOM effects. */
  function project(p) {
    const v = p.clone().project(camera);
    if (v.z > 1) return null;
    return { x: (v.x * 0.5 + 0.5) * W, y: (-v.y * 0.5 + 0.5) * H };
  }

  return {
    load,
    resize,
    focus,
    cue,
    reset,
    setMood,
    setPersistent,
    flash,
    kick,
    setQuality,
    quality: () => qualityName,
    setBrightness: (b) => (brightness = b),
    setShake: (s) => (shakeOn = s),
    setMenu: (m) => {
      cam.menu = m;
    },
    pointer: (x, y) => {
      cam.tx = Math.max(-1, Math.min(1, x));
      cam.ty = Math.max(-1, Math.min(1, y));
    },
    deckScreen: () => project(deckGroup.position.clone().add(V(0, 0.01, 0))),
    /** Fast-forward the simulation (tests / slow software GL): sec of game time, then one frame. */
    advance(sec, dt = 1 / 30) {
      const n = Math.round(sec / dt);
      for (let i = 0; i < n; i++) {
        simT += dt;
        step(dt, simT);
      }
      frame = Math.max(0, Q.cctvEvery - 1);
      renderFrame(dt);
    },
    renderer,
    get debug() {
      return { B, camera, scene, burrower, mara, L, mood, cam };
    },
    dispose() {
      disposed = true;
      cueToken++;
      cancelAnimationFrame(raf);
      burrower?.dispose();
      mara?.dispose();
      disposeBunker(B);
      if (dust) {
        dust.geometry.dispose();
        dust.material.dispose();
      }
      for (const o of owned) o.dispose?.();
      deckGroup.removeFromParent();
      composer.dispose?.();
      rt.dispose();
      bloom.dispose?.();
      disposeAssets();
      disposeRigAssets();
      disposeSharedTextures();
      renderer.dispose();
      renderer.forceContextLoss?.();
      canvas.remove();
    },
  };
}
