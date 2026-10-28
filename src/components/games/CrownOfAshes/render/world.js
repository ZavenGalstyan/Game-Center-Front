/**
 * The 3D world: renderer, scene, lighting rig, post-processing and every
 * render module (terrain, sky, foliage, water, structures, actors, fx,
 * overlay). The React shell steps the simulation, then calls
 * `world.frame(dt, view)`; nothing here touches React state.
 *
 * view.mode: 'menu' (cinematic fly-bys) · 'select' (hero line-up) · 'play'.
 *
 * Quality   low     no shadows, no post, 0.75 px ratio, sparse grass
 *           medium  2048² shadows, bloom + grade, ≤1 px ratio
 *           high    4096² soft shadows, bloom + grade, MSAA, ≤1.5 px ratio
 */
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { getWorld } from "../engine/world.js";
import { createTerrain, splatTextures } from "./terrain.js";
import { createSky } from "./sky.js";
import { createFoliage } from "./foliage.js";
import { createWater } from "./water.js";
import { createStructures } from "./structures.js";
import { createFx } from "./fx.js";
import { createActors } from "./actors.js";
import { createOverlay } from "./overlay.js";
import { loadAssets } from "./assets.js";
import { createCharacter } from "./characters.js";
import { HEROES } from "../data/heroes.js";
import { START_KIT, ITEMS } from "../data/items.js";

const PR = { low: 0.6, medium: 0.8, high: 1.25 };

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uVig: { value: 0.42 },
    uSat: { value: 1.06 },
    uWarm: { value: new THREE.Color(1.05, 1.0, 0.92) },
    uCool: { value: new THREE.Color(0.9, 0.96, 1.08) },
    uFlash: { value: 0 },
    uHurt: { value: 0 },
    uDesat: { value: 0 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uVig; uniform float uSat; uniform vec3 uWarm; uniform vec3 uCool; uniform float uFlash; uniform float uHurt; uniform float uDesat; varying vec2 vUv;
    void main(){
      vec2 d = vUv - 0.5; float r2 = dot(d, d);
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c *= mix(uCool, uWarm, smoothstep(0.05, 0.8, l));
      c = mix(vec3(l), c, uSat * (1.0 - uDesat));
      c *= 1.0 - uVig * smoothstep(0.1, 0.55, r2);
      c = mix(c, vec3(0.6, 0.02, 0.02), uHurt * smoothstep(0.05, 0.45, r2));
      c += uFlash;
      gl_FragColor = vec4(max(c, 0.0), 1.0);
    }`,
};

/** Cinematic shots for the title screen: [from, to, look-from, look-to, hour]. */
const MENU_SHOTS = [
  { a: [-60, 58, -160], b: [40, 54, -168], la: [0, 32, -300], lb: [0, 32, -300], hour: 17.2, dur: 16 },
  { a: [-60, 22, 230], b: [40, 26, 236], la: [0, 8, 150], lb: [0, 8, 150], hour: 7.2, dur: 15 },
  { a: [230, 90, -170], b: [270, 96, -210], la: [310, 62, -330], lb: [310, 62, -330], hour: 19.4, dur: 15 },
  { a: [330, 30, 90], b: [250, 34, 80], la: [300, 14, 20], lb: [300, 14, 20], hour: 21.5, dur: 14 },
];
const SHOWCASE = { x: -4, z: 98, yaw: 0 };

export function createWorld(host, { quality = "medium", test = false } = {}) {
  const W = getWorld();
  const canvas = document.createElement("canvas");
  canvas.className = "coa-canvas";
  host.appendChild(canvas);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance", preserveDrawingBuffer: test, stencil: false });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 2400);
  scene.add(camera);
  const tex = splatTextures(W.T);
  const shared = {
    time: { value: 0 },
    camPos: { value: new THREE.Vector3() },
    wind: { value: 1 },
    treeCut: { value: quality === "low" ? 45 : quality === "high" ? 110 : 70 },
    snowBoost: { value: 0 },
    pointScale: { value: 600 },
    fogColor: { value: new THREE.Color() },
    fogDensity: { value: 0.0016 },
    heightTex: tex.height,
    splatA: tex.splatA,
    splatB: tex.splatB,
    windows: null,
  };
  const hemi = new THREE.HemisphereLight(0xc9dcf2, 0x5d5644, 1);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff1d6, 3);
  sun.castShadow = true;
  scene.add(sun, sun.target);
  const heroLight = new THREE.PointLight(0xffe8c8, 0, 7, 2);
  scene.add(heroLight);
  scene.fog = new THREE.FogExp2(new THREE.Color("#b9cbdc"), 0.0016);
  const sky = createSky(scene, renderer);
  let q = quality;
  const terrain = createTerrain(scene, W.T, shared, q);
  const foliage = createFoliage(scene, W, shared, q);
  const water = createWater(scene, W.T, shared);
  const structures = createStructures(scene, W, shared);
  const fx = createFx(scene, W, shared, q);
  const torchFires = W.lights.filter((l) => l.kind === "torch").map((l) => ({ ...l, s: 0.5, interior: true }));
  const puzzleFires = structures.puzzleFires.map((p) => ({ ...p, kind: "brazier", s: 0.9, interior: true, puzzle: p.id, lit: false }));
  const shrineFires = structures.shrines.map((s) => ({ x: s.x, y: s.y + 2.1, z: s.z, kind: "torch", s: 0.7, shrine: s.id, lit: false }));
  const raidFires = [
    [-50, 140],
    [30, 114],
    [-30, 196],
    [36, 132],
  ].map(([x, z]) => ({ x, y: W.T.height(x, z) + 4, z, kind: "campfire", s: 2.2, raid: true, lit: false }));
  fx.setSources([...structures.fires, ...puzzleFires, ...torchFires, ...shrineFires, ...raidFires], structures.smokes);
  const torchGroup = new THREE.Group();
  {
    const tm = new THREE.MeshStandardMaterial({ color: 0x3a2a1a, roughness: 0.9 });
    const tg = new THREE.CylinderGeometry(0.06, 0.04, 0.6, 6);
    for (const t of torchFires) {
      const m = new THREE.Mesh(tg, tm);
      m.position.set(t.x, t.y - 0.3, t.z);
      m.rotation.set(t.wall[1] * 0.4, 0, -t.wall[0] * 0.4);
      torchGroup.add(m);
    }
    scene.add(torchGroup);
  }
  const overlay = createOverlay(host);
  let assets = null;
  let actors = null;
  let showcase = null;
  let disposed = false;
  const ready = loadAssets().then((a) => {
    if (disposed) return false;
    assets = a;
    actors = createActors(scene, a, fx);
    return true;
  });

  let W_ = 1280;
  let H_ = 720;
  let composer = null;
  let grade = null;
  function setupShadows() {
    const S = q === "high" ? 2048 : 1024;
    renderer.shadowMap.enabled = q !== "low";
    sun.castShadow = q !== "low";
    sun.shadow.mapSize.set(S, S);
    const ext = q === "high" ? 55 : 38;
    const c = sun.shadow.camera;
    c.left = -ext;
    c.right = ext;
    c.top = ext;
    c.bottom = -ext;
    c.near = 1;
    c.far = 400;
    c.updateProjectionMatrix();
    sun.shadow.bias = -0.0003;
    sun.shadow.normalBias = 0.05;
    sun.shadow.radius = 2.5;
    sun.shadow.map?.dispose();
    sun.shadow.map = null;
  }
  function setupComposer() {
    if (composer) {
      composer.passes.forEach((p) => p.dispose?.());
      composer.renderTarget1.dispose();
      composer.renderTarget2.dispose();
      composer = null;
    }
    grade = null;
    if (q !== "high") return; // bloom + grade only on High
    const rt = new THREE.WebGLRenderTarget(W_, H_, { type: THREE.HalfFloatType, samples: q === "high" ? 4 : 0 });
    composer = new EffectComposer(renderer, rt);
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(W_ / 2, H_ / 2), 0.32, 0.55, 0.92));
    grade = new ShaderPass(GradeShader);
    composer.addPass(grade);
    composer.addPass(new OutputPass());
    composer.setPixelRatio(Math.min(window.devicePixelRatio || 1, PR[q]));
    composer.setSize(W_, H_);
  }
  function resize(w, h) {
    W_ = Math.max(2, Math.floor(w));
    H_ = Math.max(2, Math.floor(h));
    const pr = Math.min(window.devicePixelRatio || 1, PR[q]);
    renderer.setPixelRatio(pr);
    renderer.setSize(W_, H_, false);
    camera.aspect = W_ / H_;
    camera.updateProjectionMatrix();
    composer?.setPixelRatio(pr);
    composer?.setSize(W_, H_);
    shared.pointScale.value = (H_ * pr) / (2 * Math.tan((camera.fov * Math.PI) / 360));
    overlay.resize(W_, H_);
  }
  function setQuality(nq) {
    if (nq === q) return;
    q = nq;
    setupShadows();
    setupComposer();
    terrain.setQuality(q);
    foliage.setQuality(q);
    resize(W_, H_);
  }
  setupShadows();
  setupComposer();
  foliage.setQuality(q);

  /* ------------------------------------------------------------ showcase (hero select) */
  function buildShowcase() {
    if (showcase || !assets) return;
    const chars = [];
    Object.values(HEROES).forEach((H, i) => {
      const lineup = [];
      for (const body of Object.keys(H.look)) {
        const look = H.look[body];
        const c = createCharacter(assets, look);
        const kit = START_KIT[H.id].equip;
        c.setWeapon(ITEMS[kit.weapon].kind);
        if (H.id === "rogue") c.setOffhand("dagger");
        const off = ITEMS[kit.offhand];
        if (off?.shield) c.setShield(off.shield.shape, off.shield.sigil, off.shield.color);
        const x = SHOWCASE.x + (i - 1.5) * 2.4;
        const z = SHOWCASE.z;
        c.root.position.set(x, W.T.height(x, z), z);
        c.root.rotation.y = SHOWCASE.yaw;
        c.anim.set("lower", "Idle");
        c.anim.set("upper", { knight: "BladeIdle", archer: "Idle", mage: "CastIdle", rogue: "BladeIdle" }[H.id]);
        c.root.visible = false;
        scene.add(c.root);
        lineup.push({ body, c });
      }
      chars.push({ id: H.id, lineup });
    });
    showcase = { chars };
  }
  function showShowcase(on, sel, body) {
    if (!showcase) return;
    for (const h of showcase.chars)
      for (const L of h.lineup) {
        const want = on && (h.id === sel ? L.body === body : L.body === Object.keys(HEROES[h.id].look)[0]);
        L.c.root.visible = want;
      }
  }

  /* ------------------------------------------------------------ cameras */
  const look = new THREE.Vector3();
  let menuT = 0;
  let selCam = null;
  function menuCamera(dt) {
    menuT += dt;
    let t = menuT;
    let i = 0;
    while (t > MENU_SHOTS[i % MENU_SHOTS.length].dur) {
      t -= MENU_SHOTS[i % MENU_SHOTS.length].dur;
      i++;
    }
    const S = MENU_SHOTS[i % MENU_SHOTS.length];
    const k = t / S.dur;
    const e = k * k * (3 - 2 * k);
    const L = (a, b) => a + (b - a) * e;
    const cam = { x: L(S.a[0], S.b[0]), y: L(S.a[1], S.b[1]), z: L(S.a[2], S.b[2]), lx: L(S.la[0], S.lb[0]), ly: L(S.la[1], S.lb[1]), lz: L(S.la[2], S.lb[2]), fov: 50 };
    return { cam, hour: S.hour, fade: Math.min(1, t / 1.2, (S.dur - t) / 1.2) };
  }
  function selectCamera(dt, sel) {
    const i = Object.keys(HEROES).indexOf(sel);
    const x = SHOWCASE.x + (i - 1.5) * 2.4;
    const z = SHOWCASE.z;
    const y = W.T.height(x, z);
    const want = { x: x + 1.1, y: y + 1.7, z: z + 4.6, lx: x - 0.35, ly: y + 1.15, lz: z };
    if (!selCam) selCam = { ...want };
    const k = 1 - Math.exp(-dt * 5);
    for (const key of Object.keys(want)) selCam[key] += (want[key] - selCam[key]) * k;
    return { ...selCam, fov: 40 };
  }

  /* ------------------------------------------------------------ frame */
  let flash = 0;
  let hurt = 0;
  let shake = 0;
  let lastView = null;
  function frame(dt, view) {
    if (disposed) return;
    shared.time.value += dt;
    const t = shared.time.value;
    const G = view.G;
    let cam;
    let hour = 10;
    let weather = {};
    let interior = false;
    let focus;
    let fogMul = 1;
    if (view.mode === "menu") {
      const m = menuCamera(dt);
      cam = m.cam;
      hour = m.hour;
      focus = { x: m.cam.lx, y: m.cam.ly, z: m.cam.lz };
      view.fade?.(1 - m.fade);
    } else if (view.mode === "select") {
      buildShowcase();
      cam = selectCamera(dt, view.hero);
      hour = 16.8;
      focus = { x: SHOWCASE.x, y: W.T.height(SHOWCASE.x, SHOWCASE.z), z: SHOWCASE.z };
      fogMul = 1.2;
    } else if (view.mode === "free") {
      cam = view.cam;
      hour = view.hour ?? 10;
      weather = view.weather || {};
      interior = !!view.interior;
      focus = view.focus || { x: cam.lx, y: cam.ly, z: cam.lz };
    } else {
      const c = G.camera;
      cam = { x: c.x, y: c.y, z: c.z, lx: c.lx, ly: c.ly, lz: c.lz, fov: c.fov };
      hour = G.hour;
      weather = G.weather;
      interior = !!G.player.interior;
      focus = G.player;
    }
    showShowcase(view.mode === "select", view.hero, view.body);
    const sh = shake * 0.18 * (view.shake === false ? 0 : 1);
    camera.position.set(cam.x + (Math.random() - 0.5) * sh, cam.y + (Math.random() - 0.5) * sh, cam.z + (Math.random() - 0.5) * sh);
    look.set(cam.lx, cam.ly, cam.lz);
    camera.lookAt(look);
    const fov = cam.fov || 60;
    if (Math.abs(camera.fov - fov) > 0.01) {
      camera.fov += (fov - camera.fov) * Math.min(1, dt * 8);
      camera.updateProjectionMatrix();
      shared.pointScale.value = (H_ * Math.min(window.devicePixelRatio || 1, PR[q])) / (2 * Math.tan((camera.fov * Math.PI) / 360));
    }
    shared.camPos.value.copy(camera.position);
    // lighting
    const L = sky.update(hour, weather, t, interior);
    sun.color.copy(L.keyColor);
    sun.intensity = L.keyIntensity;
    hemi.color.copy(L.hemiSky);
    hemi.groundColor.copy(L.hemiGround);
    hemi.intensity = L.hemiIntensity;
    scene.environment = interior || q !== "high" ? null : L.env;
    if (q !== "high") hemi.intensity *= 1.25;
    scene.environmentIntensity = 0.55 * (1 - L.night * 0.7);
    const snowFog = !interior && view.mode === "play" ? W.T.mask("snow", camera.position.x, camera.position.z) * 0.6 : 0;
    const fd = interior ? 0.045 : 0.0016 * fogMul * (1 + (weather.storm || 0) * 1.6 + snowFog);
    scene.fog.density = fd;
    scene.fog.color.copy(L.fogColor);
    shared.fogColor.value.copy(L.fogColor);
    shared.fogDensity.value = fd;
    scene.background = interior ? L.fogColor : null;
    sky.dome.visible = !interior;
    // a soft fill near the hero so faces read at night / indoors
    heroLight.intensity = view.mode === "play" ? (interior ? 6 : L.night * 5) : view.mode === "select" ? 7 : 0;
    if (focus) heroLight.position.set(focus.x + Math.sin(t * 0.3), (focus.y || 0) + 2.6, focus.z + 1.5);
    // shadow frustum follows the focus point, snapped to texels to stop shimmer
    const fp = focus || camera.position;
    const ext = sun.shadow.camera.right;
    const texel = (ext * 2) / sun.shadow.mapSize.x;
    const sx = Math.round(fp.x / texel) * texel;
    const sz = Math.round(fp.z / texel) * texel;
    sun.position.set(sx + L.lightDir.x * 160, (fp.y || 0) + L.lightDir.y * 160, sz + L.lightDir.z * 160);
    sun.target.position.set(sx, fp.y || 0, sz);
    sun.castShadow = q !== "low" && !interior && L.keyIntensity > 0.05;
    shared.wind.value = 0.8 + (weather.storm || 0) * 1.4 + Math.sin(t * 0.13) * 0.25;
    terrain.update(camera.position);
    terrain.group.visible = !interior;
    foliage.update(camera.position, interior);
    water.update(interior);
    torchGroup.visible = interior;
    // dynamic fires follow game state
    if (G) {
      for (const f of puzzleFires) f.lit = !!G.P.world.lit[f.puzzle];
      for (const f of shrineFires) f.lit = !!G.P.world.lit[f.shrine];
      const raid = G.P.quests.q_thornwick?.state === "active";
      for (const f of raidFires) f.lit = raid;
    }
    structures.update(dt, t, G ? (id) => G.entState(id) : () => ({ open: true }), interior ? 1 : L.night);
    fx.update(dt, camera.position, { interior, night: interior ? 1 : L.night, windX: shared.wind.value * 0.6, weather: weather.kind, weatherAmt: weather.amt || 0 });
    if (actors && G && view.mode === "play") {
      actors.group.visible = true;
      actors.update(G, dt, camera.position, camera);
    } else if (actors) actors.group.visible = false;
    if (showcase && view.mode === "select")
      for (const h of showcase.chars)
        for (const L2 of h.lineup)
          if (L2.c.root.visible) {
            L2.c.anim.update(dt);
            L2.c.capeUpdate(dt, 0, 0);
            L2.c.tick(t);
          }
    overlay.update(G, camera, dt, view.mode === "play" && view.overlay !== false && !!G);
    shake = Math.max(0, shake - dt * 2.2);
    if (grade) {
      flash = Math.max(0, flash - dt * 2.5);
      hurt = Math.max(0, hurt - dt * 1.4);
      grade.uniforms.uFlash.value = flash;
      grade.uniforms.uHurt.value = Math.max(hurt, view.lowHp ? 0.22 + Math.sin(t * 4) * 0.08 : 0);
      grade.uniforms.uDesat.value = view.dead ? 0.8 : 0;
      grade.uniforms.uVig.value = view.mode === "select" ? 0.6 : 0.42;
    }
    lastView = view;
    if (view.render !== false) render();
  }
  function render() {
    if (composer) composer.render();
    else renderer.render(scene, camera);
  }

  /* ------------------------------------------------------------ events → visuals */
  const v3 = new THREE.Vector3();
  function onEvents(G, evs) {
    for (const ev of evs) {
      switch (ev.type) {
        case "dmg":
          overlay.damage(ev);
          if (ev.toPlayer) hurt = Math.max(hurt, Math.min(0.7, 0.25 + ev.n / Math.max(60, G.stats.maxHp)));
          if (!ev.dot) fx.burst(ev.blocked ? "spark" : ev.mat === "bone" ? "spark" : "spark", ev.x, ev.y - 0.6, ev.z, { n: ev.crit ? 14 : 7, speed: 4, color: ev.fire ? [1, 0.5, 0.15] : ev.mat === "metal" ? [1, 0.85, 0.6] : [0.9, 0.85, 0.75] });
          break;
        case "heal":
          overlay.damage({ ...ev, heal: true });
          fx.burst("heal", ev.x, ev.y - 2, ev.z, { n: 10 });
          break;
        case "telegraph":
          fx.telegraph(ev);
          break;
        case "block":
          fx.burst("spark", ev.x, ev.y, ev.z, { n: 12, speed: 5, color: [1, 0.85, 0.5] });
          break;
        case "parry":
          fx.burst("spark", ev.x, ev.y, ev.z, { n: 26, speed: 7, color: [1, 0.95, 0.7] });
          flash = Math.max(flash, 0.12);
          break;
        case "ward":
          fx.burst("magic", ev.x, ev.y, ev.z, { n: 10, speed: 3, color: [1, 0.5, 0.15] });
          break;
        case "guardBreak":
          fx.burst("spark", ev.x, ev.y, ev.z, { n: 20, speed: 6, color: [1, 0.4, 0.2] });
          break;
        case "dodge":
          fx.burst("dust", ev.x, ev.y, ev.z, { n: 6, speed: 2, snow: W.T.mask("snow", ev.x, ev.z) > 0.5 });
          break;
        case "land":
          if (ev.hard) fx.burst("dust", G.player.x, G.player.y, G.player.z, { n: 10, speed: 3 });
          break;
        case "projHit":
          if (ev.stick && actors) actors.stick(ev.x, ev.y, ev.z, ev.dx, ev.dy, ev.dz, ev.kind === "ballista" ? "ballista" : ev.kind === "knife" ? "knife" : ev.kind);
          fx.burst(ev.kind === "emberbolt" ? "fire" : "spark", ev.x, ev.y, ev.z, { n: 6, speed: 3, color: [0.9, 0.8, 0.6] });
          break;
        case "explode":
          fx.burst("fire", ev.x, ev.y, ev.z, { n: Math.round(10 + ev.r * 6), speed: ev.r * 2.2, size: 1.2 + ev.r * 0.3 });
          fx.burst("smoke", ev.x, ev.y, ev.z, { n: 8, speed: 2, size: 1.5 });
          fx.burst("spark", ev.x, ev.y, ev.z, { n: 16, speed: 7, color: [1, 0.6, 0.2] });
          shake = Math.max(shake, ev.r > 3 ? 0.5 : 0.2);
          break;
        case "zone": {
          const big = ev.r > 4;
          if (ev.kind === "volley") for (let k = 0; k < 18; k++) fx.burst("spark", ev.x + (Math.random() - 0.5) * ev.r * 1.6, (ev.y || 0) + 0.3, ev.z + (Math.random() - 0.5) * ev.r * 1.6, { n: 2, speed: 2, color: [0.9, 0.9, 0.8] });
          else if (ev.kind === "trapSnap") break;
          else if (ev.kind === "breath" || ev.kind === "bite" || ev.kind === "claw") break;
          else if (ev.fire || ev.kind === "meteor" || ev.kind === "eruption" || ev.kind === "firerain" || ev.kind === "nova" || ev.kind === "wave") {
            if (ev.shape === "line") {
              for (let k = 0; k < 12; k++) {
                const d = (k / 12) * (ev.len || 10);
                fx.burst("fire", ev.x + Math.sin(ev.yaw) * d, (ev.y || 0) + 0.2, ev.z + Math.cos(ev.yaw) * d, { n: 4, speed: 2, size: 1.6 });
              }
            } else {
              const n = Math.round(14 + ev.r * 5);
              for (let k = 0; k < n; k++) {
                const a = (k / n) * Math.PI * 2;
                const r = ev.kind === "nova" ? ev.r * 0.9 : Math.random() * ev.r;
                fx.burst("fire", ev.x + Math.cos(a) * r, (ev.y || 0) + 0.3, ev.z + Math.sin(a) * r, { n: 2, speed: 2, size: 1.4 + (big ? 0.6 : 0) });
              }
              fx.burst("smoke", ev.x, (ev.y || 0) + 1, ev.z, { n: big ? 10 : 5, speed: 2.5, size: 2 });
            }
            shake = Math.max(shake, big ? 0.7 : 0.3);
          } else if (ev.frost || ev.kind === "frostslam") {
            fx.burst("frost", ev.x, (ev.y || 0) + 0.4, ev.z, { n: 30, speed: ev.r * 1.5 });
            shake = Math.max(shake, 0.5);
          } else {
            fx.burst("dust", ev.x, ev.y || 0, ev.z, { n: Math.round(8 + ev.r * 2), speed: ev.r * 0.8, snow: W.T.mask("snow", ev.x, ev.z) > 0.5 });
            shake = Math.max(shake, 0.4);
          }
          break;
        }
        case "trapSnap":
          fx.burst("spark", ev.x, ev.y + 0.3, ev.z, { n: 12, speed: 3, color: [0.6, 0.9, 0.4] });
          break;
        case "death":
          fx.burst("smoke", ev.x, ev.y + 0.5, ev.z, { n: ev.boss ? 20 : 5, speed: 1.2, size: ev.boss ? 2 : 1 });
          if (ev.boss) flash = Math.max(flash, 0.45);
          break;
        case "levelUp":
          fx.burst("level", G.player.x, G.player.y, G.player.z, { n: 40 });
          flash = Math.max(flash, 0.25);
          break;
        case "warcry":
          fx.burst("level", ev.x, ev.y, ev.z, { n: 24 });
          break;
        case "nova":
          for (let k = 0; k < 40; k++) {
            const a = (k / 40) * Math.PI * 2;
            fx.burst("fire", ev.x + Math.cos(a) * 1.5, ev.y + 0.5, ev.z + Math.sin(a) * 1.5, { n: 1, speed: 9, size: 1 });
          }
          break;
        case "blink":
          fx.burst(ev.shadow ? "shadow" : "magic", ev.x, ev.y + 0.2, ev.z, { n: 18, speed: 2, color: [0.6, 0.4, 1.2] });
          fx.burst(ev.shadow ? "shadow" : "magic", ev.x2, G.ground(ev.x2, ev.z2) + 0.2, ev.z2, { n: 18, speed: 2, color: [0.6, 0.4, 1.2] });
          break;
        case "ability":
          if (ev.id === "vanish") fx.burst("shadow", ev.x, ev.y, ev.z, { n: 24, speed: 2 });
          break;
        case "bash":
          fx.burst("dust", ev.x, ev.y, ev.z, { n: 8, speed: 3 });
          break;
        case "anchorBreak":
          fx.burst("fire", ev.x, ev.y, ev.z, { n: 40, speed: 6, size: 1.6 });
          fx.burst("smoke", ev.x, ev.y, ev.z, { n: 16, speed: 3, size: 2.5 });
          flash = Math.max(flash, 0.3);
          break;
        case "shrineLit":
        case "brazierLit":
          fx.burst("fire", ev.x, ev.y, ev.z, { n: 20, speed: 2, size: 0.8 });
          break;
        case "heartstone":
          fx.burst("magic", ev.x, ev.y, ev.z, { n: 40, speed: 3, color: [1.6, 0.4, 0.2] });
          flash = Math.max(flash, 0.35);
          break;
        case "mine":
          fx.burst("frost", ev.x, ev.y + 1, ev.z, { n: 14, speed: 3 });
          break;
        case "drop":
          if (ev.rare) fx.burst("magic", ev.x, ev.y + 0.5, ev.z, { n: 16, speed: 2, color: [0.4, 0.7, 1.6] });
          break;
        case "dragonLand":
          fx.burst("dust", ev.x, ev.y, ev.z, { n: 40, speed: 9, size: 2 });
          shake = Math.max(shake, 1);
          break;
        case "dragonRoar":
          shake = Math.max(shake, ev.intro ? 0.9 : 0.5);
          break;
        case "dragonNova":
          for (let k = 0; k < 60; k++) {
            const a = (k / 60) * Math.PI * 2;
            fx.burst("fire", ev.x + Math.cos(a) * 4, ev.y + 0.5, ev.z + Math.sin(a) * 4, { n: 1, speed: 14, size: 2 });
          }
          break;
        case "dragonDown":
          fx.burst("smoke", ev.x, ev.y + 2, ev.z, { n: 30, speed: 4, size: 3 });
          flash = Math.max(flash, 0.5);
          break;
        case "ballista":
          fx.burst("dust", ev.x, ev.y, ev.z, { n: 6, speed: 2 });
          break;
        case "shake":
          shake = Math.max(shake, ev.v);
          break;
        case "teleport":
          overlay.clear();
          break;
        case "respawn":
          fx.clear();
          overlay.clear();
          break;
        case "potion":
          fx.burst("heal", ev.x, ev.y, ev.z, { n: 12 });
          break;
        case "collapse":
          fx.burst("dust", ev.x, ev.y, ev.z, { n: 8, speed: 2 });
          break;
        case "reassemble":
          fx.burst("magic", ev.x, ev.y + 1, ev.z, { n: 16, speed: 2, color: [0.4, 1.2, 1.6] });
          break;
        case "summon":
          fx.burst("frost", ev.x, ev.y + 1, ev.z, { n: 30, speed: 4 });
          break;
        case "freed":
          fx.burst("level", ev.x, ev.y, ev.z, { n: 12 });
          break;
        default:
          break;
      }
    }
    void v3;
  }

  return {
    W,
    renderer,
    scene,
    camera,
    shared,
    fx,
    structures,
    ready,
    resize,
    setQuality,
    frame,
    render,
    onEvents,
    actors: () => actors,
    flash(v = 0.5) {
      flash = Math.max(flash, v);
    },
    get quality() {
      return q;
    },
    get view() {
      return lastView;
    },
    dispose() {
      disposed = true;
      actors?.dispose();
      if (showcase) for (const h of showcase.chars) for (const L of h.lineup) {
        scene.remove(L.c.root);
        L.c.dispose();
      }
      overlay.dispose();
      fx.dispose();
      structures.dispose();
      water.dispose();
      foliage.dispose();
      terrain.dispose();
      sky.dispose();
      scene.remove(torchGroup);
      torchGroup.traverse((o) => o.geometry?.dispose());
      if (composer) {
        composer.passes.forEach((p) => p.dispose?.());
        composer.renderTarget1.dispose();
        composer.renderTarget2.dispose();
      }
      sun.shadow.map?.dispose();
      renderer.dispose();
      canvas.remove();
    },
  };
}
