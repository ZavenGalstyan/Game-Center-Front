/**
 * Iron Arena — the WebGL world. One renderer and one canvas for the whole
 * game; it never owns game state. Three presentation modes:
 *   garage  — showroom turntable with the selected tank (menus / garage)
 *   preview — slow fly-over of a map (map select / loading)
 *   match   — mirrors a running match (engine/match.js) every frame, with
 *             interpolation between fixed simulation steps
 *
 * Quality (low | medium | high): pixel ratio, MSAA + bloom post chain,
 * shadow map size, terrain/texture resolution, particle budgets, lights.
 */
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { getMap } from "../engine/maps/index.js";
import { getArena } from "../engine/arena.js";
import { themeFor } from "./themes.js";
import { buildTerrain, buildWater } from "./terrainView.js";
import { buildMapView } from "./mapView.js";
import { createSky } from "./sky.js";
import { createEffects } from "./effects.js";
import { createTankView, setTankTexSize, disposeTankCache } from "./tankModel.js";
import { disposeTextures, texSet } from "./textures.js";
import { predictImpact, segTank } from "../engine/combat.js";
import { muzzle as muzzleOf } from "../engine/tank.js";
import { clamp, damp, wrap } from "../engine/util.js";
import { TEAM_COLORS } from "../engine/tanks.js";

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    lift: { value: new THREE.Vector3(0, 0, 0) },
    gain: { value: new THREE.Vector3(1, 1, 1) },
    sat: { value: 1 },
    contrast: { value: 1 },
    vignette: { value: 0.3 },
    hurt: { value: 0 },
    desat: { value: 0 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `
uniform sampler2D tDiffuse; uniform vec3 lift; uniform vec3 gain; uniform float sat; uniform float contrast; uniform float vignette; uniform float hurt; uniform float desat;
varying vec2 vUv;
void main(){
  vec4 c = texture2D(tDiffuse, vUv);
  vec3 col = c.rgb * gain + lift;
  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(l), col, sat * (1.0 - desat));
  col = (col - 0.18) * contrast + 0.18;
  vec2 d = vUv - 0.5;
  float r2 = dot(d, d);
  col *= clamp(1.0 - r2 * vignette * 2.2, 0.0, 1.0);
  col = mix(col, col * vec3(1.25, 0.55, 0.5), hurt * smoothstep(0.08, 0.32, r2));
  gl_FragColor = vec4(max(col, 0.0), c.a);
}`,
};

const tmpV = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();
const TEAM_HEX = TEAM_COLORS;

export function createWorld(host, opts = {}) {
  let Q = opts.quality || "medium";
  const preserve = !!host.dataset.preserve;
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance", preserveDrawingBuffer: preserve, stencil: false });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const canvas = renderer.domElement;
  canvas.className = "ia-canvas";
  host.appendChild(canvas);
  const pmrem = new THREE.PMREMGenerator(renderer);

  /* ------------------------------------------------------------ scenes */
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 2600);
  camera.rotation.order = "YXZ";
  const sun = new THREE.DirectionalLight("#ffffff", 3);
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.04;
  const hemi = new THREE.HemisphereLight("#bcd", "#554", 0.8);
  scene.add(sun, sun.target, hemi);
  const MAX_PL = 6;
  const mapLights = [];
  for (let i = 0; i < MAX_PL; i++) {
    const l = new THREE.PointLight("#ffd9a0", 0, 24, 2);
    scene.add(l);
    mapLights.push(l);
  }
  // player headlight (night maps)
  const headlight = new THREE.SpotLight("#fff2d8", 0, 60, 0.5, 0.5, 1.5);
  scene.add(headlight, headlight.target);

  /* ------------------------------------------------------------ garage scene */
  const garage = createGarage();

  /* ------------------------------------------------------------ post */
  let composer = null;
  let renderPass = null;
  let bloom = null;
  let grade = null;
  function buildComposer() {
    if (composer) {
      composer.renderTarget1.dispose();
      composer.renderTarget2.dispose();
      composer.passes.forEach((p) => p.dispose?.());
      composer = null;
    }
    if (Q === "low") return;
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: Q === "high" ? 4 : 2 });
    composer = new EffectComposer(renderer, rt);
    renderPass = new RenderPass(scene, camera);
    composer.addPass(renderPass);
    bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.3, 0.55, 0.85);
    composer.addPass(bloom);
    grade = new ShaderPass(GradeShader);
    composer.addPass(grade);
    composer.addPass(new OutputPass());
    applyGrade();
  }

  /* ------------------------------------------------------------ state */
  let mode = "garage"; // garage | preview | match
  let theme = themeFor("desert");
  let mapId = null;
  let built = null; // { terrain, water, props, sky, env }
  let effects = null;
  let match = null;
  const views = new Map(); // tank id → view state
  const flagViews = [];
  let lost = false;
  let time = 0;
  let shake = 0;
  let shakeK = 1;
  let hurt = 0;
  const cam = { yaw: 0, pitch: 0.22, dist: 13, scope: 0, scopeT: 0, x: 0, y: 10, z: -20, inited: false, fovBase: 60 };
  const aim = { x: 0, y: 0, z: 0, tank: null };
  const marker = { x: 0, y: 0, z: 0, ok: false, tank: null };
  let previewT = 0;
  let sunDir = new THREE.Vector3(0.5, 0.7, 0.3).normalize();

  /* ------------------------------------------------------------ quality */
  function applyQuality() {
    const dpr = Math.min(window.devicePixelRatio || 1, Q === "high" ? 2 : Q === "medium" ? 1.5 : 1);
    renderer.setPixelRatio(dpr);
    renderer.shadowMap.enabled = Q !== "low";
    sun.castShadow = Q !== "low";
    const sm = Q === "high" ? 2048 : 1024;
    if (sun.shadow.mapSize.x !== sm) {
      sun.shadow.mapSize.set(sm, sm);
      sun.shadow.map?.dispose();
      sun.shadow.map = null;
    }
    const half = Q === "high" ? 70 : 55;
    Object.assign(sun.shadow.camera, { left: -half, right: half, top: half, bottom: -half, near: 1, far: 260 });
    sun.shadow.camera.updateProjectionMatrix();
    setTankTexSize(Q === "low" ? 256 : 512);
    resize();
    buildComposer();
  }
  function resize() {
    const w = Math.max(1, host.clientWidth);
    const h = Math.max(1, host.clientHeight);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    garage.camera.aspect = w / h;
    garage.camera.updateProjectionMatrix();
    if (composer) {
      composer.setSize(w, h);
      const size = renderer.getDrawingBufferSize(new THREE.Vector2());
      bloom?.setSize(size.x / 2, size.y / 2);
    }
  }
  function applyGrade() {
    if (!grade) return;
    const g = mode === "garage" ? { sat: 1.1, contrast: 1.08, lift: [0.004, 0.004, 0.008], gain: [1, 1, 1.02], vignette: 0.55 } : theme.grade;
    const u = grade.uniforms;
    u.sat.value = g.sat;
    u.contrast.value = g.contrast;
    u.lift.value.set(...g.lift);
    u.gain.value.set(...g.gain);
    u.vignette.value = g.vignette;
    const b = mode === "garage" ? { strength: 0.32, threshold: 0.9 } : theme.bloom;
    bloom.strength = b.strength;
    bloom.threshold = b.threshold;
    bloom.radius = 0.55;
  }

  /* ------------------------------------------------------------ map loading */
  async function loadMap(id, onProgress) {
    const map = getMap(id);
    if (mapId === map.id && built) {
      onProgress?.(1);
      return;
    }
    unloadMap();
    mapId = map.id;
    theme = themeFor(map.theme);
    const arena = getArena(map);
    onProgress?.(0.02);
    // lighting / atmosphere
    const az = map.sun?.az ?? 0.6;
    const el = map.sun?.el ?? 0.6;
    sunDir = new THREE.Vector3(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)).normalize();
    sun.color.set(theme.sun.color);
    sun.intensity = theme.sun.intensity;
    hemi.color.set(theme.hemi.sky);
    hemi.groundColor.set(theme.hemi.ground);
    hemi.intensity = theme.hemi.intensity;
    scene.fog = new THREE.FogExp2(theme.fog.color, theme.fog.density);
    renderer.toneMappingExposure = theme.exposure;
    const sky = createSky(theme, sunDir);
    scene.add(sky.mesh);
    const terrain = await buildTerrain(map, arena, theme, Q, (p) => onProgress?.(0.05 + p * 0.5));
    scene.add(terrain.mesh);
    const water = buildWater(map, theme, Q);
    if (water) scene.add(water.mesh);
    onProgress?.(0.6);
    const props = await buildMapView(map, theme, Q, map.theme, (p) => onProgress?.(0.6 + p * 0.3));
    scene.add(props.group);
    // static map lights (nearest few matter most; keep the count fixed)
    const nl = Q === "high" ? MAX_PL : Q === "medium" ? 3 : 0;
    mapLights.forEach((l, i) => {
      const d = map.lights[i];
      if (d && i < nl) {
        l.position.set(d.x, d.y, d.z);
        l.color.set(d.color);
        l.intensity = d.intensity;
        l.distance = d.dist;
      } else l.intensity = 0;
    });
    // effects + weather
    effects?.dispose();
    effects = createEffects(scene, Q);
    effects.setWeather(theme.particles?.kind, theme.particles?.color, theme.particles?.count || 0);
    onProgress?.(0.93);
    // environment: capture the built map from above the centre
    const env = captureEnv(map);
    built = { terrain, water, props, sky, env, map, arena };
    scene.environment = env.texture;
    scene.environmentIntensity = theme.env;
    headlight.intensity = 0;
    applyGrade();
    // warm up shaders
    try {
      renderer.compile(scene, camera);
    } catch {
      /* ignore */
    }
    onProgress?.(1);
  }
  function captureEnv(map) {
    const rt = new THREE.WebGLCubeRenderTarget(Q === "high" ? 256 : 128, { type: THREE.HalfFloatType });
    const cc = new THREE.CubeCamera(1, 2000, rt);
    cc.position.set(0, (map.theme === "neon" ? 14 : 24) + (built?.arena?.groundAt?.(0, 0) || 0), 0);
    const fog = scene.fog;
    scene.fog = null;
    const prevSm = renderer.shadowMap.enabled;
    renderer.shadowMap.enabled = false;
    cc.update(renderer, scene);
    renderer.shadowMap.enabled = prevSm;
    scene.fog = fog;
    const tex = pmrem.fromCubemap(rt.texture);
    rt.dispose();
    return tex;
  }
  function unloadMap() {
    clearMatch();
    if (!built) return;
    scene.remove(built.terrain.mesh, built.sky.mesh, built.props.group);
    built.terrain.dispose();
    built.sky.dispose();
    built.props.dispose();
    if (built.water) {
      scene.remove(built.water.mesh);
      built.water.dispose();
    }
    built.env.dispose();
    scene.environment = null;
    built = null;
    mapId = null;
  }

  /* ------------------------------------------------------------ match binding */
  function bindMatch(M) {
    clearMatch();
    match = M;
    mode = "match";
    applyGrade();
    effects?.clear();
    for (const t of M.tanks) {
      const v = createTankView(t.stats.model, t.skin);
      scene.add(v.root);
      const st = { v, dead: false, wreckT: 0, smokeT: 0, dustT: 0, spin: 0, spinV: 0, bob: 0, bobV: 0, kick: 0, lastVf: 0, shield: null, tilt: 0, popY: 0, popVy: 0, popRx: 0, popRz: 0, ghost: 0, chargeT: 0 };
      // shield bubble
      const sh = new THREE.Mesh(shieldGeo(), shieldMat());
      sh.visible = false;
      sh.scale.set(t.dims.wid * 0.85, t.dims.top * 0.95, t.dims.len * 0.7);
      sh.position.y = t.dims.top * 0.45;
      v.root.add(sh);
      st.shield = sh;
      views.set(t.id, st);
    }
    if (M.mode.id === "ctf")
      for (const f of M.flags) {
        const fv = createFlagView(f.team);
        scene.add(fv.group);
        flagViews.push(fv);
      }
    cam.inited = false;
    const P = M.player;
    if (P) {
      cam.yaw = P.yaw;
      cam.pitch = 0.22;
    }
    headlight.intensity = built && built.map.theme === "neon" ? 90 : 0;
  }
  function clearMatch() {
    for (const st of views.values()) {
      st.shield.geometry.dispose?.();
      st.v.dispose();
    }
    views.clear();
    for (const fv of flagViews) fv.dispose();
    flagViews.length = 0;
    match = null;
    effects?.clear();
    headlight.intensity = 0;
    if (mode === "match") mode = "preview";
  }
  let _shieldGeo = null;
  let _shieldMat = null;
  function shieldGeo() {
    return (_shieldGeo = _shieldGeo || new THREE.SphereGeometry(1, 28, 16));
  }
  function shieldMat() {
    if (_shieldMat) return _shieldMat;
    _shieldMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uCol: { value: new THREE.Color(0.4, 1.6, 1.4) } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: `varying vec3 vN; varying vec3 vV; varying vec3 vP; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); vP = position; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform float uTime; uniform vec3 uCol; varying vec3 vN; varying vec3 vV; varying vec3 vP;
void main(){ float f = pow(1.0 - abs(dot(vN, vV)), 2.5); float hex = step(0.92, fract(vP.x * 6.0 + sin(vP.y * 9.0 + uTime))) + step(0.94, fract(vP.y * 7.0 - uTime * 0.6));
  gl_FragColor = vec4(uCol * (f * 0.9 + hex * 0.12 + 0.03), 1.0); }`,
    });
    return _shieldMat;
  }

  function createFlagView(team) {
    const group = new THREE.Group();
    const col = new THREE.Color(TEAM_HEX[team]);
    const poleM = new THREE.MeshStandardMaterial({ color: "#c8ccd2", metalness: 0.8, roughness: 0.3 });
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 4.2, 10), poleM);
    pole.position.y = 2.1;
    const clothG = new THREE.PlaneGeometry(2.0, 1.25, 12, 4);
    clothG.translate(1.0, 0, 0);
    const clothM = new THREE.MeshStandardMaterial({ color: col, side: THREE.DoubleSide, roughness: 0.6, emissive: col, emissiveIntensity: 0.45 });
    const cloth = new THREE.Mesh(clothG, clothM);
    cloth.position.y = 3.55;
    const base = clothG.attributes.position.array.slice();
    const glowM = new THREE.MeshBasicMaterial({ color: col.clone().multiplyScalar(2.2), transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 70, 12, 1, true), new THREE.MeshBasicMaterial({ color: col.clone().multiplyScalar(1.4), transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    beacon.position.y = 35;
    const tip = new THREE.Mesh(new THREE.OctahedronGeometry(0.22), glowM);
    tip.position.y = 4.3;
    group.add(pole, cloth, beacon, tip);
    // home pad
    const pad = new THREE.Mesh(new THREE.RingGeometry(3.6, 4.6, 48), glowM);
    pad.rotation.x = -Math.PI / 2;
    const padIn = new THREE.Mesh(new THREE.CircleGeometry(3.6, 48), new THREE.MeshBasicMaterial({ color: col.clone().multiplyScalar(0.6), transparent: true, opacity: 0.18, depthWrite: false, toneMapped: false }));
    padIn.rotation.x = -Math.PI / 2;
    const padG = new THREE.Group();
    padG.add(pad, padIn);
    scene.add(padG);
    return {
      group,
      pad: padG,
      update(f, t) {
        group.position.set(f.x, f.y, f.z);
        padG.position.set(f.home.x, f.home.y + 0.08, f.home.z);
        pad.rotation.z = t * 0.3;
        beacon.visible = f.state !== "carried";
        group.scale.setScalar(f.state === "carried" ? 0.75 : 1);
        const p = clothG.attributes.position;
        for (let i = 0; i < p.count; i++) {
          const x = base[i * 3];
          p.setZ(i, Math.sin(t * 5 + x * 2.5) * 0.18 * x);
          p.setY(i, base[i * 3 + 1] - x * 0.05 * (f.state === "carried" ? 1 : 0));
        }
        p.needsUpdate = true;
        clothG.computeVertexNormals();
        tip.rotation.y = t * 2;
        group.rotation.y = f.state === "carried" ? 0 : t * 0.15;
      },
      dispose() {
        scene.remove(group, padG);
        for (const o of [pole, cloth, beacon, tip, pad, padIn]) o.geometry.dispose();
        for (const m of [poleM, clothM, glowM, beacon.material, padIn.material]) m.dispose();
      },
    };
  }

  /* ------------------------------------------------------------ events → visuals */
  function handleEvents(events) {
    if (!match || !effects) return;
    const M = match;
    const P = M.player;
    for (const e of events) {
      switch (e.type) {
        case "fire": {
          const L = Math.hypot(e.dx, e.dy, e.dz) || 1;
          const t = M.tanks[e.id];
          effects.muzzle(e.x, e.y, e.z, e.dx / L, e.dy / L, e.dz / L, e.kind, t.stats.model === "titan" ? 1.4 : 1);
          if (e.kind === "he" || e.kind === "shell" || e.kind === "rail") effects.blastDust(e.x - (e.dx / L) * 2, t.y + 0.2, e.z - (e.dz / L) * 2, effects.surfaceColor(t.surface));
          const st = views.get(e.id);
          if (st) st.kick = Math.min(1, st.kick + (e.kind === "burst" || e.kind === "clip" ? 0.25 : 1));
          if (P && e.id === P.id) shake = Math.max(shake, e.kind === "he" ? 0.5 : e.kind === "shell" || e.kind === "rail" ? 0.35 : 0.12);
          break;
        }
        case "impact": {
          effects.impact(e, effects.surfaceColor(e.surface));
          if (P) {
            const d = Math.hypot(e.x - P.x, e.z - P.z);
            const k = e.kind === "he" || e.kind === "strike" ? 1.2 : e.kind === "shell" ? 0.7 : 0.3;
            if (d < 40) shake = Math.max(shake, k * (1 - d / 40) * 0.8);
          }
          break;
        }
        case "hit": {
          const t = M.tanks[e.target];
          if (e.shielded && e.kind !== "burn" && e.kind !== "flame") effects.shieldHit(e.x, e.y, e.z);
          if (P && e.target === P.id && !e.quiet) {
            hurt = Math.min(1, hurt + e.amount / 250);
            shake = Math.max(shake, Math.min(0.7, e.amount / 200));
          }
          void t;
          break;
        }
        case "kill": {
          const t = M.tanks[e.victim];
          effects.tankExplosion(t.x, t.y, t.z);
          const st = views.get(e.victim);
          if (st) {
            st.dead = true;
            st.v.setGhost(0);
            st.v.setWreck(true);
            st.popY = 0;
            st.popVy = 7 + Math.random() * 4;
            st.popRx = (Math.random() - 0.5) * 1.2;
            st.popRz = (Math.random() - 0.5) * 1.2;
            st.shield.visible = false;
          }
          if (P) {
            const d = Math.hypot(t.x - P.x, t.z - P.z);
            if (d < 60) shake = Math.max(shake, 1.0 * (1 - d / 60));
          }
          break;
        }
        case "spawn": {
          const st = views.get(e.id);
          if (st) {
            st.dead = false;
            st.v.setWreck(false);
            st.v.turret.position.y = st.v.dims.hgt;
            st.v.turret.rotation.x = 0;
            st.v.turret.rotation.z = 0;
          }
          effects.add.emit({ x: e.x, y: e.y + 1.2, z: e.z, life: 0.6, s0: 3, s1: 10, c0: [0.5, 1.4, 2.0, 0.7], c1: [0.2, 0.6, 1, 0], frame: 6 });
          effects.sparks(e.x, e.y + 0.5, e.z, 20, [0.6, 1.4, 2.0], 8);
          if (P && e.id === P.id) cam.inited = false;
          break;
        }
        case "inferno":
          effects.inferno(e.x, e.y, e.z);
          if (P && Math.hypot(e.x - P.x, e.z - P.z) < 30) shake = Math.max(shake, 0.6);
          break;
        case "barrage":
          effects.marker(e.x, e.y, e.z, 2.6);
          break;
        case "deflect":
          effects.deflect(e.x, e.y, e.z);
          break;
        case "flamehit":
          effects.flameHit(e.x, e.y, e.z);
          break;
        case "ram":
          effects.sparks(e.x, e.y, e.z, 12, [1.6, 1.2, 0.6], 8);
          break;
        default:
      }
    }
  }

  /* ------------------------------------------------------------ camera input */
  function setView(v) {
    if (v.yaw != null) cam.yaw = v.yaw;
    if (v.pitch != null) cam.pitch = v.pitch;
    if (v.dist != null) cam.dist = v.dist;
    if (v.scope != null) cam.scope = v.scope;
  }

  /** first thing under the camera's centre ray (terrain, props, tanks) */
  function computeAim() {
    const M = match;
    const P = M.player;
    const A = M.A;
    camera.getWorldDirection(tmpV);
    const ox = camera.position.x;
    const oy = camera.position.y;
    const oz = camera.position.z;
    const far = 420;
    // start the ray past the player's own tank so it never aims at itself
    const startT = cam.scopeT > 0.5 ? 0.5 : Math.max(0.5, cam.dist * 0.6);
    const sx = ox + tmpV.x * startT;
    const sy = oy + tmpV.y * startT;
    const sz = oz + tmpV.z * startT;
    const ex = ox + tmpV.x * far;
    const ey = oy + tmpV.y * far;
    const ez = oz + tmpV.z * far;
    let best = 1;
    let tank = null;
    for (const o of M.tanks) {
      if (!o.alive || o === P) continue;
      const tt = segTank(o, sx, sy, sz, ex, ey, ez, 0.2);
      if (tt >= 0 && tt < best) {
        best = tt;
        tank = o;
      }
    }
    const h = A.raycast(sx, sy, sz, ex, ey, ez);
    if (h && h.t < best) {
      best = h.t;
      tank = null;
    }
    aim.x = sx + (ex - sx) * best;
    aim.y = sy + (ey - sy) * best;
    aim.z = sz + (ez - sz) * best;
    aim.tank = tank;
    return aim;
  }

  function updateCamera(dt, P, pose) {
    const A = match.A;
    const scopeTarget = cam.scope ? 1 : 0;
    cam.scopeT += (scopeTarget - cam.scopeT) * damp(14, dt);
    const sniper = P.stats.model === "sniper";
    // third-person orbit pivot above the hull
    const px = pose.x;
    const py = pose.y + P.dims.top + 1.1;
    const pz = pose.z;
    const cp = Math.cos(cam.pitch);
    const fx = Math.sin(cam.yaw) * cp;
    const fy = -Math.sin(cam.pitch);
    const fz = Math.cos(cam.yaw) * cp;
    const dist = cam.dist * (1 - cam.scopeT) + 0.2 * cam.scopeT;
    let tx = px - fx * dist;
    let ty = py - fy * dist + 1.2 * (1 - cam.scopeT);
    let tz = pz - fz * dist;
    // scope: sit on the turret roof
    if (cam.scopeT > 0.01) {
      const sx = pose.x;
      const sy = pose.y + P.dims.top + 0.6;
      const sz = pose.z;
      tx = tx * (1 - cam.scopeT) + (sx - fx * 0.5) * cam.scopeT;
      ty = ty * (1 - cam.scopeT) + sy * cam.scopeT;
      tz = tz * (1 - cam.scopeT) + (sz - fz * 0.5) * cam.scopeT;
    }
    // collision: pull in front of walls / terrain between pivot and camera
    const h = A.raycast(px, py, pz, tx, ty, tz);
    if (h) {
      const k = Math.max(0, h.t - 0.6 / Math.max(0.5, Math.hypot(tx - px, ty - py, tz - pz)));
      tx = px + (tx - px) * k;
      ty = py + (ty - py) * k;
      tz = pz + (tz - pz) * k;
    }
    const gy = A.groundAt(tx, tz) + 0.7;
    if (ty < gy) ty = gy;
    if (!cam.inited) {
      cam.x = tx;
      cam.y = ty;
      cam.z = tz;
      cam.inited = true;
    } else {
      const k = damp(cam.scopeT > 0.5 ? 40 : 16, dt);
      cam.x += (tx - cam.x) * k;
      cam.y += (ty - cam.y) * k;
      cam.z += (tz - cam.z) * k;
      // never lag behind an obstacle: snap closer when the target is nearer than us
      const dT = Math.hypot(tx - px, ty - py, tz - pz);
      const dC = Math.hypot(cam.x - px, cam.y - py, cam.z - pz);
      if (dC > dT + 0.05) {
        cam.x = tx;
        cam.y = ty;
        cam.z = tz;
      }
    }
    camera.position.set(cam.x, cam.y, cam.z);
    // shake
    shake = Math.max(0, shake - dt * 2.2);
    const s = shake * shake * shakeK;
    camera.rotation.set(-cam.pitch + (Math.random() - 0.5) * s * 0.04, cam.yaw + Math.PI + (Math.random() - 0.5) * s * 0.04, (Math.random() - 0.5) * s * 0.02);
    const zoom = 1 + cam.scopeT * (sniper ? 4 : 2);
    camera.fov = (cam.fovBase * 1) / zoom;
    camera.updateProjectionMatrix();
  }

  /* ------------------------------------------------------------ per-frame sync */
  const pose = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, turret: 0, gun: 0 };
  function lerpPose(t, a, out) {
    const p = t.prev;
    out.x = p.x + (t.x - p.x) * a;
    out.y = p.y + (t.y - p.y) * a;
    out.z = p.z + (t.z - p.z) * a;
    out.yaw = p.yaw + wrap(t.yaw - p.yaw) * a;
    out.pitch = p.pitch + (t.pitch - p.pitch) * a;
    out.roll = p.roll + (t.roll - p.roll) * a;
    out.turret = p.turret + wrap(t.turret - p.turret) * a;
    out.gun = p.gun + (t.gun - p.gun) * a;
    return out;
  }
  function syncMatch(dt, alpha) {
    const M = match;
    const P = M.player;
    const camPos = camera.position;
    for (const t of M.tanks) {
      const st = views.get(t.id);
      if (!st) continue;
      const v = st.v;
      lerpPose(t, alpha, pose);
      v.root.position.set(pose.x, pose.y, pose.z);
      v.root.rotation.y = pose.yaw;
      // suspension: pitch with acceleration, bob, recoil kick
      const acc = (t.vf - st.lastVf) / Math.max(1e-3, dt);
      st.lastVf = t.vf;
      st.bobV += (-st.bob * 160 - st.bobV * 14 + clamp(-acc, -40, 40) * 0.6) * dt;
      st.bob += st.bobV * dt;
      st.kick = Math.max(0, st.kick - dt * 3.2);
      const kickRot = Math.sin(Math.min(1, st.kick) * Math.PI) * 0.035 * Math.cos(pose.turret);
      v.body.rotation.set(pose.pitch + clamp(st.bob * 0.012, -0.05, 0.05) - kickRot, 0, pose.roll + Math.sin(Math.min(1, st.kick) * Math.PI) * 0.02 * Math.sin(pose.turret));
      v.body.position.y = Math.sin(time * 9 + t.id) * 0.012 * Math.min(1, Math.abs(t.vf) / 6);
      if (!st.dead) {
        v.turret.rotation.y = pose.turret;
        v.gun.rotation.x = -pose.gun;
      } else {
        // blown-off turret settles crooked
        st.popVy -= 22 * dt;
        st.popY = Math.max(0, st.popY + st.popVy * dt);
        if (st.popY === 0) st.popVy = 0;
        v.turret.position.y = t.dims.hgt + st.popY * 0.4;
        v.turret.rotation.x += (st.popRx * 0.25 - v.turret.rotation.x) * damp(6, dt);
        v.turret.rotation.z += (st.popRz * 0.25 - v.turret.rotation.z) * damp(6, dt);
      }
      v.barrel.position.z = -Math.sin(Math.min(1, t.recoil) * Math.PI * 0.5) * (t.stats.weapon.recoil > 0.5 ? 0.45 : 0.15) * t.recoil;
      v.anim.U.uDistL.value = t.trackL;
      v.anim.U.uDistR.value = t.trackR;
      // rotary barrels
      if (t.stats.model === "thunder") {
        st.spinV += ((t.input.fire && t.alive ? 26 : 0) - st.spinV) * damp(t.input.fire ? 6 : 1.5, dt);
        st.spin += st.spinV * dt;
        v.spin.rotation.z = st.spin;
      }
      // LOD + shadows by distance
      const d = Math.hypot(pose.x - camPos.x, pose.z - camPos.z);
      v.setLOD(d > 70 ? 1 : 0);
      if (Q !== "low") v.setShadows(d < 90);
      // cloak
      const ghostTarget = t.alive && t.fx.cloak > 0 ? (t === P || (P && !M.isEnemy(P, t)) ? 0.55 : 1) : 0;
      st.ghost += (ghostTarget - st.ghost) * damp(6, dt);
      v.setGhost(st.ghost > 0.02 ? st.ghost : 0);
      v.root.visible = !(st.ghost > 0.98 && P && M.isEnemy(P, t) && Math.hypot(t.x - P.x, t.z - P.z) > 12);
      // shield
      st.shield.visible = t.alive && t.fx.shield > 0;
      // dust / smoke / fire
      if (t.alive) {
        const speed = Math.abs(t.vf);
        st.dustT -= dt;
        if (speed > 2 && st.dustT <= 0 && d < 110) {
          st.dustT = 0.06 + (Q === "low" ? 0.08 : 0);
          const s = Math.sin(pose.yaw);
          const c = Math.cos(pose.yaw);
          const back = -t.dims.len * 0.45 * Math.sign(t.vf || 1);
          for (const side of [1, -1]) {
            const lx = (side * t.dims.wid) / 2.4;
            effects.trackDust(pose.x + s * back + c * lx, pose.y + 0.15, pose.z + c * back - s * lx, t.surface, speed, s * t.vf, c * t.vf);
          }
        }
        if (t.fx.nitro > 0) {
          const s = Math.sin(pose.yaw);
          const c = Math.cos(pose.yaw);
          effects.nitro(pose.x - s * t.dims.len * 0.52, pose.y + t.dims.hgt - 0.2, pose.z - c * t.dims.len * 0.52, s, c);
        }
        const hpF = t.hp / t.stats.hp;
        st.smokeT -= dt;
        if (hpF < 0.5 && st.smokeT <= 0 && d < 120) {
          st.smokeT = hpF < 0.25 ? 0.09 : 0.18;
          const s = Math.sin(pose.yaw);
          const c = Math.cos(pose.yaw);
          effects.damageSmoke(pose.x - s * t.dims.len * 0.32, pose.y + t.dims.hgt + 0.2, pose.z - c * t.dims.len * 0.32, hpF < 0.25);
        }
        if (t.fx.burnT > 0 && Math.random() < 0.5) effects.fire(pose.x + (Math.random() - 0.5) * 2, pose.y + t.dims.hgt, pose.z + (Math.random() - 0.5) * 2, 1, 1.2, { v: 1, vUp: 3, life: 0.4 });
        // rail charge glow
        if (t.ws.charging) {
          const m = muzzleOf(t, {});
          const k = 1 - t.ws.chargeT / Math.max(0.05, t.ws.chargeTotal || 0.6);
          effects.add.emit({ x: m.x, y: m.y, z: m.z, life: 0.08, s0: 0.6 + k * 1.6, s1: 0.8 + k * 2, c0: [0.5, 1.4, 2.2, 0.9], c1: [0.2, 0.6, 1, 0], frame: 0 });
          if (Math.random() < 0.5) effects.sparks(m.x, m.y, m.z, 1, [0.5, 1.4, 2.0], 3);
        }
      } else if (d < 150) {
        st.smokeT -= dt;
        if (st.smokeT <= 0) {
          st.smokeT = 0.12;
          effects.damageSmoke(pose.x, pose.y + t.dims.hgt, pose.z, M.clock - t.deathAt < 3);
        }
      }
    }
    if (_shieldMat) _shieldMat.uniforms.uTime.value = time;
    // projectiles
    for (const p of M.proj.list) {
      if (!p.active) continue;
      if (p.kind === "flame") effects.flame(p.x, p.y, p.z, p.vx, p.vy, p.vz, p.rad, p.age);
      else if (Math.random() < (p.kind === "rail" ? 1 : 0.6)) {
        if (p.kind === "rail") for (let k = 0; k < 6; k++) effects.trail(p.px + ((p.x - p.px) * k) / 6, p.py + ((p.y - p.py) * k) / 6, p.pz + ((p.z - p.pz) * k) / 6, "rail");
        else effects.trail(p.x, p.y, p.z, p.kind);
      }
    }
    effects.tracers(M.proj.list, alpha);
    // CTF flags
    for (let i = 0; i < flagViews.length; i++) flagViews[i].update(M.flags[i], time);
  }

  /* ------------------------------------------------------------ preview (menus) */
  function previewCamera(dt) {
    previewT += dt;
    const R = 92;
    const a = previewT * 0.045 + 0.6;
    const gy = built ? built.arena.groundAt(Math.sin(a) * R * 0.4, Math.cos(a) * R * 0.4) : 0;
    camera.position.set(Math.sin(a) * R, 44 + gy * 0.3, Math.cos(a) * R);
    camera.fov = 52;
    camera.updateProjectionMatrix();
    camera.lookAt(0, 4 + gy * 0.5, 0);
  }

  /* ------------------------------------------------------------ frame */
  function frame(dt, alpha = 1) {
    time += dt;
    if (lost) return;
    let renderScene = scene;
    let renderCam = camera;
    if (mode === "garage") {
      garage.update(dt);
      renderScene = garage.scene;
      renderCam = garage.camera;
    } else {
      if (mode === "match" && match && match.player) {
        lerpPose(match.player, alpha, pose);
        const P = match.player;
        const pp = { ...pose };
        updateCamera(dt, P, pp);
        if (P.alive) computeAim();
        syncMatch(dt, alpha);
        // gun marker: where the barrel will actually hit
        if (P.alive) {
          const r = predictImpact(match, P, marker);
          marker.ok = r.hit;
        }
        // shadow camera follows the player
        sun.position.set(pp.x + sunDir.x * 120, pp.y + sunDir.y * 120, pp.z + sunDir.z * 120);
        sun.target.position.set(pp.x, pp.y, pp.z);
        if (headlight.intensity > 0) {
          const s = Math.sin(pp.yaw);
          const c = Math.cos(pp.yaw);
          headlight.position.set(pp.x + s * 3, pp.y + 1.6, pp.z + c * 3);
          headlight.target.position.set(pp.x + s * 30, pp.y - 1, pp.z + c * 30);
        }
      } else if (mode === "match" && match) {
        syncMatch(dt, alpha);
        previewCamera(dt);
      } else {
        previewCamera(dt);
        sun.position.set(sunDir.x * 160, sunDir.y * 160, sunDir.z * 160);
        sun.target.position.set(0, 0, 0);
      }
      if (built) {
        built.props.update(time);
        built.sky.U.uTime.value = time;
        built.sky.mesh.position.copy(camera.position);
        if (built.water) built.water.U.uTime.value = time;
      }
      effects?.update(dt, camera.position);
    }
    hurt = Math.max(0, hurt - dt * 0.9);
    if (grade) {
      grade.uniforms.hurt.value = mode === "match" ? hurt : 0;
      const P = match?.player;
      grade.uniforms.desat.value = mode === "match" && P && !P.alive ? 0.65 : 0;
    }
    if (composer) {
      renderPass.scene = renderScene;
      renderPass.camera = renderCam;
      composer.render(dt);
    } else renderer.render(renderScene, renderCam);
  }

  /* ------------------------------------------------------------ projection helpers (HUD) */
  const proj = new THREE.Vector3();
  function toScreen(x, y, z, out = {}) {
    proj.set(x, y, z).project(mode === "garage" ? garage.camera : camera);
    const w = host.clientWidth;
    const h = host.clientHeight;
    out.x = (proj.x * 0.5 + 0.5) * w;
    out.y = (-proj.y * 0.5 + 0.5) * h;
    out.vis = proj.z < 1 && proj.z > -1;
    out.behind = proj.z > 1;
    return out;
  }

  /* ------------------------------------------------------------ garage showroom */
  function createGarage() {
    const gs = new THREE.Scene();
    const gc = new THREE.PerspectiveCamera(36, 16 / 9, 0.1, 400);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04);
    gs.environment = env.texture;
    gs.environmentIntensity = 0.55;
    gs.background = new THREE.Color("#07090c");
    gs.fog = new THREE.Fog("#07090c", 26, 60);
    // floor: dark brushed metal with a hex grid
    const floorTex = texSet("metal", 512, { panels: 4 });
    const floorMat = new THREE.MeshStandardMaterial({ color: "#2a2f36", map: floorTex.map, normalMap: floorTex.normalMap, roughnessMap: floorTex.roughnessMap, metalness: 0.75, roughness: 0.55 });
    const floor = new THREE.Mesh(new THREE.CircleGeometry(60, 64), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    gs.add(floor);
    // turntable
    const ttMat = new THREE.MeshStandardMaterial({ color: "#2c3138", metalness: 0.8, roughness: 0.48 });
    const table = new THREE.Mesh(new THREE.CylinderGeometry(6.4, 6.7, 0.35, 64), ttMat);
    table.position.y = 0.175;
    table.receiveShadow = true;
    table.castShadow = true;
    gs.add(table);
    const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color("#ff9a3a").multiplyScalar(2.2), toneMapped: false });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(6.55, 0.05, 8, 96), ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.36;
    gs.add(ring);
    const ring2 = new THREE.Mesh(new THREE.TorusGeometry(4.6, 0.025, 6, 96), ringMat);
    ring2.rotation.x = Math.PI / 2;
    ring2.position.y = 0.36;
    gs.add(ring2);
    // backdrop: curved wall with light panels
    const wallMat = new THREE.MeshStandardMaterial({ color: "#14181e", metalness: 0.6, roughness: 0.5, side: THREE.BackSide });
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(30, 30, 22, 64, 1, true), wallMat);
    wall.position.y = 11;
    gs.add(wall);
    const panelMat = new THREE.MeshBasicMaterial({ color: new THREE.Color("#9fd0ff").multiplyScalar(1.2), toneMapped: false });
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.22, 3.2, 0.1), panelMat);
      p.position.set(Math.sin(a) * 29.6, 2.6, Math.cos(a) * 29.6);
      p.rotation.y = a;
      gs.add(p);
    }
    const stripMat = new THREE.MeshBasicMaterial({ color: new THREE.Color("#ff9a3a").multiplyScalar(1.6), toneMapped: false });
    const strip = new THREE.Mesh(new THREE.TorusGeometry(29.5, 0.06, 6, 128), stripMat);
    strip.rotation.x = Math.PI / 2;
    strip.position.y = 0.4;
    gs.add(strip);
    // lights
    const key = new THREE.SpotLight("#fff1dc", 320, 60, 0.42, 0.6, 1.6);
    key.position.set(8, 16, 10);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.bias = -0.0004;
    gs.add(key, key.target);
    const rimA = new THREE.SpotLight("#4aa8ff", 260, 50, 0.5, 0.6, 1.6);
    rimA.position.set(-12, 7, -10);
    gs.add(rimA, rimA.target);
    const rimB = new THREE.SpotLight("#ff8a3a", 220, 50, 0.5, 0.6, 1.6);
    rimB.position.set(12, 5, -8);
    gs.add(rimB, rimB.target);
    gs.add(new THREE.HemisphereLight("#8aa0c0", "#1a1410", 0.6));
    // floating dust motes
    const motesG = new THREE.BufferGeometry();
    const mp = new Float32Array(260 * 3);
    for (let i = 0; i < 260; i++) mp.set([(Math.random() - 0.5) * 30, Math.random() * 10, (Math.random() - 0.5) * 30], i * 3);
    motesG.setAttribute("position", new THREE.BufferAttribute(mp, 3));
    const motes = new THREE.Points(motesG, new THREE.PointsMaterial({ color: "#ffd9a8", size: 0.05, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
    gs.add(motes);
    // sparkle burst for unlocks
    const burstG = new THREE.BufferGeometry();
    const NB = 220;
    const bp = new Float32Array(NB * 3);
    const bv = new Float32Array(NB * 3);
    burstG.setAttribute("position", new THREE.BufferAttribute(bp, 3));
    const burstM = new THREE.PointsMaterial({ color: new THREE.Color("#ffc46a").multiplyScalar(2), size: 0.14, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
    const burst = new THREE.Points(burstG, burstM);
    burst.frustumCulled = false;
    gs.add(burst);

    let view = null;
    let viewKey = "";
    const G = { yaw: 0.6, auto: true, dist: 17.5, height: 5.4, t: 0, drop: 0, dropV: 0, celebrate: 0, turret: 0, focusY: 1.3, shift: 0, shiftT: 0, distT: 17.5 };
    function show(tankId, skinId, model) {
      const key = tankId + "|" + skinId;
      if (key === viewKey && view) return;
      viewKey = key;
      if (view) view.dispose();
      view = createTankView(model || tankId, { tank: tankId, id: skinId });
      view.root.position.y = 0.36;
      gs.add(view.root);
      view.setShadows(true);
    }
    return {
      scene: gs,
      camera: gc,
      show,
      /** shift: −0.5..0.5 of the screen width (positive moves the tank right) */
      frame(shift = 0, distK = 1) {
        G.shiftT = shift;
        G.distT = 17.5 * distK;
      },
      drag(dx) {
        G.yaw += dx;
        G.auto = false;
        clearTimeout(G.autoT);
        G.autoT = setTimeout(() => (G.auto = true), 4000);
      },
      celebrate() {
        G.drop = 7;
        G.dropV = 0;
        G.celebrate = 2.5;
        for (let i = 0; i < NB; i++) {
          const a = Math.random() * Math.PI * 2;
          const e = Math.random() * 0.9 + 0.2;
          const s = 6 + Math.random() * 10;
          bp.set([0, 1.2, 0], i * 3);
          bv.set([Math.cos(a) * s * Math.cos(e), Math.sin(e) * s + 3, Math.sin(a) * s * Math.cos(e)], i * 3);
        }
        burstM.opacity = 1;
      },
      update(dt) {
        G.t += dt;
        if (G.auto) G.yaw += dt * 0.22;
        G.shift += (G.shiftT - G.shift) * Math.min(1, dt * 4);
        G.dist += (G.distT - G.dist) * Math.min(1, dt * 4);
        const dist = G.dist;
        gc.position.set(Math.sin(G.yaw) * dist, G.height, Math.cos(G.yaw) * dist);
        gc.lookAt(0, G.focusY, 0);
        // shift the tank sideways on screen (frees room for the side panels)
        // (setViewOffset also sets aspect = fullWidth / fullHeight, so keep the real aspect)
        const fw = 1000 * gc.aspect;
        if (Math.abs(G.shift) > 0.001) gc.setViewOffset(fw, 1000, -G.shift * fw, 0, fw, 1000);
        else if (gc.view) gc.clearViewOffset();
        table.rotation.y = 0;
        ring.rotation.z = G.t * 0.15;
        if (view) {
          // drop-in animation for unlocks
          if (G.drop > 0 || G.dropV !== 0) {
            G.dropV -= 30 * dt;
            G.drop += G.dropV * dt;
            if (G.drop <= 0) {
              G.drop = 0;
              G.dropV = Math.abs(G.dropV) > 3 ? -G.dropV * 0.3 : 0;
            }
          }
          view.root.position.y = 0.36 + G.drop;
          view.turret.rotation.y = Math.sin(G.t * 0.5) * 0.5;
          view.gun.rotation.x = -0.04 - Math.max(0, Math.sin(G.t * 0.35)) * 0.08;
        }
        if (G.celebrate > 0) {
          G.celebrate -= dt;
          for (let i = 0; i < NB; i++) {
            bv[i * 3 + 1] -= 9 * dt;
            bp[i * 3] += bv[i * 3] * dt;
            bp[i * 3 + 1] = Math.max(0.4, bp[i * 3 + 1] + bv[i * 3 + 1] * dt);
            bp[i * 3 + 2] += bv[i * 3 + 2] * dt;
          }
          burstG.attributes.position.needsUpdate = true;
          burstM.opacity = Math.max(0, G.celebrate / 2.5);
          ringMat.color.setRGB(2.2 + G.celebrate, 1.3 + G.celebrate * 0.5, 0.4);
        } else ringMat.color.set("#ff9a3a").multiplyScalar(2.2);
        const p = motesG.attributes.position;
        for (let i = 0; i < p.count; i++) {
          let y = p.getY(i) + dt * 0.15;
          if (y > 10) y = 0;
          p.setY(i, y);
        }
        p.needsUpdate = true;
      },
      dispose() {
        view?.dispose();
        env.dispose();
        gs.traverse((o) => {
          if (o.isMesh || o.isPoints) {
            o.geometry.dispose();
            if (o.material !== floorMat) o.material.dispose?.();
          }
        });
        floorMat.dispose();
      },
    };
  }

  /* ------------------------------------------------------------ context loss */
  const onLost = (e) => {
    e.preventDefault();
    lost = true;
    opts.onContextLost?.();
  };
  const onRestored = () => {
    lost = false;
    // PMREM env maps live on the GPU only: regenerate them
    if (built) {
      built.env.dispose();
      built.env = captureEnv(built.map);
      scene.environment = built.env.texture;
    }
    opts.onContextRestored?.();
  };
  canvas.addEventListener("webglcontextlost", onLost);
  canvas.addEventListener("webglcontextrestored", onRestored);

  applyQuality();

  return {
    renderer,
    scene,
    camera,
    canvas,
    get mode() {
      return mode;
    },
    get effects() {
      return effects;
    },
    get mapId() {
      return mapId;
    },
    aim,
    marker,
    cam,
    garage,
    resize,
    setQuality(q) {
      if (q === Q) return;
      Q = q;
      applyQuality();
      // rebuild the map at the new detail level next time it's shown
      if (built && mode !== "match") {
        const id = mapId;
        unloadMap();
        if (mode === "preview") loadMap(id);
      }
    },
    get quality() {
      return Q;
    },
    setFov(f) {
      cam.fovBase = f;
    },
    setShake(on) {
      shakeK = on ? 1 : 0;
    },
    setMode(m) {
      mode = m;
      applyGrade();
    },
    async preview(id) {
      await loadMap(id);
      if (!match) mode = "preview";
      applyGrade();
    },
    loadMap,
    bindMatch,
    clearMatch,
    handleEvents,
    setView,
    frame,
    toScreen,
    dispose() {
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", onRestored);
      unloadMap();
      effects?.dispose();
      garage.dispose();
      _shieldGeo?.dispose();
      _shieldMat?.dispose();
      disposeTankCache();
      disposeTextures();
      composer?.renderTarget1.dispose();
      composer?.renderTarget2.dispose();
      composer?.passes.forEach((p) => p.dispose?.());
      pmrem.dispose();
      renderer.dispose();
      canvas.remove();
    },
  };
}
