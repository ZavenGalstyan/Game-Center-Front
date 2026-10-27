/**
 * Strike Force — the one WebGL world. Owns the renderer, post-processing,
 * sky / environment, the built map, soldier rigs, the viewmodel, effects,
 * Domination flags, weapon pickups and weather. It never owns game state:
 * every frame it mirrors a match (engine/match.js) or, on menus, orbits a
 * preview of the selected map.
 *
 * Quality (low | medium | high) changes pixel ratio, shadows, MSAA, bloom,
 * the number of local lights, particle counts and texture resolution
 * (texture resolution applies the next time a map is built).
 */
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { Sky } from "three/examples/jsm/objects/Sky.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { createMaterialLib } from "./materials.js";
import { buildMapView } from "./mapView.js";
import { themeFor } from "./themes.js";
import { createSoldier, disposeSoldierCache } from "./soldier.js";
import { createViewmodel } from "./viewmodel.js";
import { createEffects, surfaceOf } from "./effects.js";
import { buildGun, disposeGunMaterials } from "./guns.js";
import { canvasTexture, disposeTextures, radialTexture } from "./textures.js";
import { getMap } from "../engine/maps/index.js";
import { weaponById, WEAPONS } from "../engine/weapons.js";
import { DOM_RADIUS } from "../engine/config.js";

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    lift: { value: new THREE.Vector3(0, 0, 0) },
    gain: { value: new THREE.Vector3(1, 1, 1) },
    sat: { value: 1 },
    contrast: { value: 1 },
    vignette: { value: 0.3 },
    desat: { value: 0 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform vec3 lift; uniform vec3 gain; uniform float sat; uniform float contrast; uniform float vignette; uniform float desat;
    varying vec2 vUv;
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      vec3 col = c.rgb * gain + lift;
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, sat * (1.0 - desat));
      col = (col - 0.18) * contrast + 0.18;
      vec2 d = vUv - 0.5;
      float v = 1.0 - dot(d, d) * vignette * 2.2;
      col *= clamp(v, 0.0, 1.0);
      gl_FragColor = vec4(max(col, 0.0), c.a);
    }`,
};

const TEAM_COL = ["#3fa9ff", "#ff4a3d"];

export function createWorld(host, opts = {}) {
  let Q = opts.quality || "medium";
  const preserve = !!host.dataset.preserve;
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance", preserveDrawingBuffer: preserve, stencil: false });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const canvas = renderer.domElement;
  canvas.className = "sf-canvas";
  host.appendChild(canvas);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(65, 16 / 9, 0.05, 3000);
  camera.rotation.order = "YXZ";
  scene.add(camera);

  /* ------------------------------------------------------------ lights */
  const sun = new THREE.DirectionalLight("#ffffff", 3);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.035;
  const hemi = new THREE.HemisphereLight("#bcd", "#554", 0.8);
  scene.add(sun, sun.target, hemi);
  const MAX_PL = 6;
  const pLights = [];
  for (let i = 0; i < MAX_PL; i++) {
    const l = new THREE.PointLight("#ffd9a0", 0, 14, 2);
    scene.add(l);
    pLights.push(l);
  }
  const pLightsFor = (q) => (q === "high" ? 6 : q === "medium" ? 3 : 0);

  /* ------------------------------------------------------------ post */
  let composer = null;
  let bloom = null;
  let grade = null;
  let vmPass = null;
  const vm = createViewmodel({ quality: Q });
  function buildComposer() {
    if (composer) {
      composer.renderTarget1.dispose();
      composer.renderTarget2.dispose();
      composer = null;
    }
    if (Q === "low") return;
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: Q === "high" ? 4 : 2 });
    composer = new EffectComposer(renderer, rt);
    composer.addPass(new RenderPass(scene, camera));
    vmPass = new RenderPass(vm.scene, vm.camera);
    vmPass.clear = false;
    vmPass.clearDepth = true;
    composer.addPass(vmPass);
    bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.3, 0.5, 0.85);
    composer.addPass(bloom);
    grade = new ShaderPass(GradeShader);
    composer.addPass(grade);
    composer.addPass(new OutputPass());
    applyTheme();
  }

  /* ------------------------------------------------------------ state */
  let theme = themeFor("harbor");
  let lib = null;
  let view = null; // map view
  let mapId = null;
  let skyObj = null;
  let envTex = null;
  let weather = null;
  let match = null;
  let fx = null;
  const soldiers = new Map();
  const flags = [];
  const pickupViews = new Map();
  let markers = null;
  let fovH = opts.fov || 95;
  let lost = false;
  let previewT = 0;
  let mode = "idle"; // idle | preview | match
  const cam = { x: 0, y: 1.6, z: 0, yaw: 0, pitch: 0, dip: 0, dipV: 0, shake: 0, roll: 0 };

  function applyQuality() {
    const dpr = window.devicePixelRatio || 1;
    renderer.setPixelRatio(Q === "high" ? Math.min(dpr, 2) : Q === "medium" ? Math.min(dpr, 1.25) : Math.min(dpr, 1) * 0.8);
    renderer.shadowMap.enabled = Q !== "low";
    sun.castShadow = Q !== "low";
    const ms = Q === "high" ? 2048 : 1024;
    if (sun.shadow.mapSize.x !== ms) {
      sun.shadow.mapSize.set(ms, ms);
      if (sun.shadow.map) {
        sun.shadow.map.dispose();
        sun.shadow.map = null;
      }
    }
    const R = Q === "high" ? 46 : 34;
    Object.assign(sun.shadow.camera, { left: -R, right: R, top: R, bottom: -R, near: 1, far: 260 });
    sun.shadow.camera.updateProjectionMatrix();
    renderer.shadowMap.needsUpdate = true;
    resize();
    buildComposer();
    for (const s of soldiers.values()) for (const m of s.rig.meshes) m.castShadow = Q !== "low";
  }

  function applyTheme() {
    renderer.toneMappingExposure = theme.exposure ?? 1;
    sun.color.set(theme.sun.color);
    sun.intensity = theme.sun.intensity;
    hemi.color.set(theme.hemi.sky);
    hemi.groundColor.set(theme.hemi.ground);
    hemi.intensity = theme.hemi.intensity;
    scene.fog = new THREE.Fog(theme.fog.color, theme.fog.near, theme.fog.far);
    if (bloom) {
      bloom.strength = theme.bloom.strength * (Q === "high" ? 1 : 0.85);
      bloom.radius = theme.bloom.radius;
      bloom.threshold = theme.bloom.threshold;
    }
    if (grade) {
      const g = theme.grade;
      grade.uniforms.lift.value.set(...g.lift);
      grade.uniforms.gain.value.set(...g.gain);
      grade.uniforms.sat.value = g.sat;
      grade.uniforms.contrast.value = g.contrast;
      grade.uniforms.vignette.value = g.vignette;
    }
  }

  /* ------------------------------------------------------------ sky + env */
  const sunDir = new THREE.Vector3();
  function buildSky() {
    if (skyObj) {
      scene.remove(skyObj.group);
      skyObj.dispose();
      skyObj = null;
    }
    const group = new THREE.Group();
    const disp = [];
    const sk = theme.sky;
    if (sk.type === "day") {
      const sky = new Sky();
      sky.scale.setScalar(2400);
      const u = sky.material.uniforms;
      u.turbidity.value = sk.turbidity;
      u.rayleigh.value = sk.rayleigh;
      u.mieCoefficient.value = sk.mie;
      u.mieDirectionalG.value = sk.mieG;
      const phi = THREE.MathUtils.degToRad(90 - sk.elevation);
      const th = THREE.MathUtils.degToRad(sk.azimuth);
      sunDir.setFromSphericalCoords(1, phi, th);
      u.sunPosition.value.copy(sunDir);
      group.add(sky);
      disp.push(sky.geometry, sky.material);
    } else {
      const geo = new THREE.SphereGeometry(2200, 32, 16);
      const mat = new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: { top: { value: new THREE.Color(sk.top) }, bottom: { value: new THREE.Color(sk.bottom) } },
        vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `uniform vec3 top; uniform vec3 bottom; varying vec3 vP; void main(){ float h = clamp(vP.y*1.6+0.1, 0.0, 1.0); vec3 c = mix(bottom, top, pow(h, 0.7)); gl_FragColor = vec4(c, 1.0); }`,
      });
      group.add(new THREE.Mesh(geo, mat));
      disp.push(geo, mat);
      if (sk.stars) {
        const n = 1400;
        const pos = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) {
          const u = Math.random();
          const v = Math.random() * 0.5 + 0.08;
          const th = u * Math.PI * 2;
          const ph = Math.acos(v);
          pos[i * 3] = Math.sin(ph) * Math.cos(th) * 2000;
          pos[i * 3 + 1] = Math.cos(ph) * 2000;
          pos[i * 3 + 2] = Math.sin(ph) * Math.sin(th) * 2000;
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
        const m = new THREE.PointsMaterial({ color: "#cfd8ff", size: 2.2, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.8 });
        group.add(new THREE.Points(g, m));
        disp.push(g, m);
      }
      if (sk.moon) {
        sunDir.set(...sk.moon).normalize();
        const m = new THREE.SpriteMaterial({ map: radialTexture([[0, "rgba(255,255,255,1)"], [0.35, "rgba(235,240,255,1)"], [0.42, "rgba(200,210,255,0.25)"], [1, "rgba(160,170,255,0)"]]), fog: false, depthWrite: false, color: "#e8ecff" });
        const s = new THREE.Sprite(m);
        s.position.copy(sunDir).multiplyScalar(1800);
        s.scale.setScalar(160);
        group.add(s);
        disp.push(m);
      }
    }
    scene.add(group);
    skyObj = { group, dispose: () => disp.forEach((d) => d.dispose()) };
    // environment from the sky + a ground disc
    const envScene = new THREE.Scene();
    envScene.add(group.clone());
    const gd = new THREE.Mesh(new THREE.CircleGeometry(900, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: theme.hemi.ground }));
    gd.position.y = -20;
    envScene.add(gd);
    if (theme.night) envScene.add(new THREE.AmbientLight("#ffffff", 1));
    const pm = new THREE.PMREMGenerator(renderer);
    const nextEnv = pm.fromScene(envScene, 0.02, 1, 3000).texture;
    pm.dispose();
    gd.geometry.dispose();
    gd.material.dispose();
    if (envTex) envTex.dispose();
    envTex = nextEnv;
    scene.environment = envTex;
    scene.environmentIntensity = theme.envIntensity ?? 1;
    vm.setLighting({ env: envTex, sunColor: theme.sun.color, sunIntensity: theme.sun.intensity, hemiSky: theme.hemi.sky, hemiGround: theme.hemi.ground, hemiIntensity: theme.hemi.intensity });
  }

  /* ------------------------------------------------------------ weather */
  function buildWeather() {
    if (weather) {
      scene.remove(weather.obj);
      weather.dispose();
      weather = null;
    }
    const kind = theme.weather;
    const k = Q === "high" ? 1 : Q === "medium" ? 0.6 : 0.3;
    const box = { x: 44, y: 22, z: 44 };
    if (kind === "rain") {
      const n = Math.round(2600 * k);
      const pos = new Float32Array(n * 6);
      const seeds = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        seeds[i * 3] = Math.random() * box.x;
        seeds[i * 3 + 1] = Math.random() * box.y;
        seeds[i * 3 + 2] = Math.random() * box.z;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      const m = new THREE.LineBasicMaterial({ color: "#9fb4d8", transparent: true, opacity: 0.35, depthWrite: false });
      const obj = new THREE.LineSegments(g, m);
      obj.frustumCulled = false;
      scene.add(obj);
      let t = 0;
      weather = {
        obj,
        update(dt, c) {
          t += dt;
          for (let i = 0; i < n; i++) {
            const y = (((seeds[i * 3 + 1] - t * 16) % box.y) + box.y) % box.y;
            const x = c.x - box.x / 2 + ((seeds[i * 3] - c.x + box.x * 100) % box.x);
            const z = c.z - box.z / 2 + ((seeds[i * 3 + 2] - c.z + box.z * 100) % box.z);
            pos[i * 6] = x;
            pos[i * 6 + 1] = y;
            pos[i * 6 + 2] = z;
            pos[i * 6 + 3] = x + 0.04;
            pos[i * 6 + 4] = y + 0.55;
            pos[i * 6 + 5] = z + 0.02;
          }
          g.attributes.position.needsUpdate = true;
        },
        dispose: () => (g.dispose(), m.dispose()),
      };
      return;
    }
    const conf = {
      snow: { n: 2600, color: "#ffffff", size: 0.07, fall: 1.4, drift: 0.8, op: 0.9 },
      dust: { n: 700, color: "#e6cfa6", size: 0.05, fall: -0.05, drift: 1.6, op: 0.5 },
      pollen: { n: 500, color: "#fff6c8", size: 0.04, fall: 0.15, drift: 0.5, op: 0.7 },
      gulls: { n: 260, color: "#ffffff", size: 0.03, fall: 0.05, drift: 0.6, op: 0.25 },
    }[kind];
    if (!conf) return;
    const n = Math.round(conf.n * k);
    const pos = new Float32Array(n * 3);
    const seeds = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      seeds[i * 4] = Math.random() * box.x;
      seeds[i * 4 + 1] = Math.random() * box.y;
      seeds[i * 4 + 2] = Math.random() * box.z;
      seeds[i * 4 + 3] = Math.random() * 10;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const m = new THREE.PointsMaterial({ color: conf.color, size: conf.size, transparent: true, opacity: conf.op, depthWrite: false, map: radialTexture(), sizeAttenuation: true });
    const obj = new THREE.Points(g, m);
    obj.frustumCulled = false;
    scene.add(obj);
    let t = 0;
    weather = {
      obj,
      update(dt, c) {
        t += dt;
        for (let i = 0; i < n; i++) {
          const ph = seeds[i * 4 + 3];
          const y = (((seeds[i * 4 + 1] - t * conf.fall * (0.7 + (ph % 1) * 0.6)) % box.y) + box.y) % box.y;
          const wx = Math.sin(t * 0.6 + ph) * conf.drift + t * conf.drift * 0.4;
          const wz = Math.cos(t * 0.5 + ph * 1.3) * conf.drift;
          pos[i * 3] = c.x - box.x / 2 + ((((seeds[i * 4] + wx - c.x) % box.x) + box.x) % box.x);
          pos[i * 3 + 1] = y;
          pos[i * 3 + 2] = c.z - box.z / 2 + ((((seeds[i * 4 + 2] + wz - c.z) % box.z) + box.z) % box.z);
        }
        g.attributes.position.needsUpdate = true;
      },
      dispose: () => (g.dispose(), m.dispose()),
    };
  }

  /* ------------------------------------------------------------ map */
  let disposed = false;
  let loadSeq = 0;
  async function loadMap(id, onProgress) {
    if (mapId === id && view) return;
    if (loading && loading.id === id) return loading.p;
    const seq = ++loadSeq;
    const run = async () => {
      unloadMap();
      const map = getMap(id);
      onProgress?.(0.1);
      await yieldFrame();
      if (disposed || seq !== loadSeq) return;
      theme = themeFor(map.theme);
      await buildMapInto(map, id, seq, onProgress);
    };
    const p = run().finally(() => {
      if (loading && loading.p === p) loading = null;
    });
    loading = { id, p };
    return p;
  }
  let loading = null;
  async function buildMapInto(map, id, seq, onProgress) {
    lib = createMaterialLib(Q, theme);
    applyTheme();
    buildSky();
    onProgress?.(0.3);
    await yieldFrame();
    if (disposed || seq !== loadSeq) return;
    view = buildMapView(map, lib, { quality: Q, theme });
    scene.add(view.group);
    onProgress?.(0.75);
    await yieldFrame();
    if (disposed || seq !== loadSeq) return;
    buildWeather();
    fx = createEffects(scene, { quality: Q, groundSurface: theme.base });
    mapId = id;
    // compile shaders up front to avoid hitches on the first frames
    try {
      renderer.compile(scene, camera);
      renderer.compile(vm.scene, vm.camera);
    } catch {
      /* ignore */
    }
    onProgress?.(1);
  }
  function unloadMap() {
    clearMatch();
    if (view) {
      scene.remove(view.group);
      view.group.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.isInstancedMesh) o.dispose();
      });
      view = null;
    }
    if (fx) {
      fx.dispose();
      fx = null;
    }
    if (lib) {
      lib.dispose();
      lib = null;
    }
    if (weather) {
      scene.remove(weather.obj);
      weather.dispose();
      weather = null;
    }
    disposeTextures();
    mapId = null;
  }

  /* ------------------------------------------------------------ match binding */
  function bindMatch(m) {
    clearMatch();
    match = m;
    mode = "match";
    for (const c of m.combatants) {
      if (c.isPlayer) continue;
      const palette = m.mode.teams ? (c.team === 0 ? "vanguard" : "obsidian") : c.id % 2 ? "obsidian" : "vanguard";
      const rig = createSoldier({ palette, accent: m.mode.teams ? null : c.color, weapon: c.weapons[c.cur].def.id, shadow: Q !== "low" });
      scene.add(rig.root);
      soldiers.set(c.id, { rig, c, px: c.x, py: c.y, pz: c.z, wasAlive: c.alive });
    }
    // flags
    for (const f of m.flags) {
      const g = new THREE.Group();
      g.position.set(f.x, f.y, f.z);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 4.2, 10), new THREE.MeshStandardMaterial({ color: "#aab0b5", metalness: 0.9, roughness: 0.3 }));
      pole.position.y = 2.1;
      pole.castShadow = true;
      g.add(pole);
      const clothGeo = new THREE.PlaneGeometry(1.3, 0.8, 10, 4);
      clothGeo.translate(0.65, 0, 0);
      const clothMat = new THREE.MeshStandardMaterial({ color: "#e8e8e8", side: THREE.DoubleSide, roughness: 0.8, emissive: "#000000" });
      const cloth = new THREE.Mesh(clothGeo, clothMat);
      cloth.position.set(0.05, 3.7, 0);
      cloth.castShadow = true;
      g.add(cloth);
      const base = clothGeo.attributes.position.array.slice();
      const ringMat = new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.45, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
      const ring = new THREE.Mesh(new THREE.RingGeometry(DOM_RADIUS - 0.18, DOM_RADIUS, 64).rotateX(-Math.PI / 2), ringMat);
      ring.position.y = 0.05;
      g.add(ring);
      const fillMat = new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.08, depthWrite: false, side: THREE.DoubleSide });
      const fill = new THREE.Mesh(new THREE.CircleGeometry(DOM_RADIUS - 0.18, 48).rotateX(-Math.PI / 2), fillMat);
      fill.position.y = 0.04;
      g.add(fill);
      const letter = canvasTexture(
        128,
        128,
        (ctx, w, h) => {
          ctx.clearRect(0, 0, w, h);
          ctx.fillStyle = "rgba(0,0,0,0.0)";
          ctx.fillRect(0, 0, w, h);
          ctx.font = "900 92px Arial, sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.lineWidth = 8;
          ctx.strokeStyle = "rgba(0,0,0,0.6)";
          ctx.strokeText(f.key, w / 2, h / 2 + 4);
          ctx.fillStyle = "#ffffff";
          ctx.fillText(f.key, w / 2, h / 2 + 4);
        },
        "flagLetter" + f.key,
      );
      const base2 = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.65, 0.25, 16), new THREE.MeshStandardMaterial({ color: "#3a3d40", roughness: 0.6, metalness: 0.4 }));
      base2.position.y = 0.12;
      g.add(base2);
      scene.add(g);
      void letter;
      flags.push({ f, g, cloth, clothMat, ringMat, fillMat, base, pole, base2 });
    }
    markers = new THREE.Group();
    scene.add(markers);
    const p = m.player;
    vm.setWeapon(p.weapons[p.cur].def.id);
    vm.preload(p.weapons.map((w) => w.def.id));
    cam.x = p.x;
    cam.y = m.eye(p);
    cam.z = p.z;
  }
  function clearMatch() {
    for (const s of soldiers.values()) {
      scene.remove(s.rig.root);
      s.rig.dispose();
    }
    soldiers.clear();
    for (const fl of flags) {
      scene.remove(fl.g);
      fl.g.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) o.material.dispose();
      });
    }
    flags.length = 0;
    for (const pv of pickupViews.values()) {
      scene.remove(pv.g);
      pv.gun.root.traverse((o) => o.isMesh && o.geometry.dispose());
    }
    pickupViews.clear();
    if (markers) scene.remove(markers);
    markers = null;
    fx?.clear();
    match = null;
    mode = mapId ? "preview" : "idle";
  }

  /* ------------------------------------------------------------ events → visuals */
  const _v = new THREE.Vector3();
  const _w = new THREE.Vector3();
  function handleEvents(events) {
    if (!match || !fx) return;
    const P = match.player;
    for (const e of events) {
      if (e.type === "shot") {
        const shooter = match.combatants[e.id];
        let ox;
        let oy;
        let oz;
        const def = weaponById(e.w);
        if (shooter.isPlayer) {
          vm.onShot(def);
          // tracer from the visible muzzle: project the viewmodel muzzle into the world
          const g = vm.gun;
          if (g) {
            g.anchors.muzzle.getWorldPosition(_v);
            _v.applyMatrix4(camera.matrixWorld);
            ox = _v.x;
            oy = _v.y;
            oz = _v.z;
          } else {
            ox = e.ox;
            oy = e.oy - 0.1;
            oz = e.oz;
          }
        } else {
          const s = soldiers.get(e.id);
          if (s && s.rig.root.visible) {
            s.rig.fire();
            s.rig.root.updateMatrixWorld(true);
            s.rig.muzzleWorld(_v);
            ox = _v.x;
            oy = _v.y;
            oz = _v.z;
          } else {
            ox = e.ox;
            oy = e.oy - 0.15;
            oz = e.oz;
          }
          fx.muzzle(ox, oy, oz, e.silenced);
        }
        e.pellets.forEach((p, i) => {
          const showTracer = def.pellets > 1 ? i < 3 : shooter.isPlayer ? true : Math.random() < 0.65;
          if (showTracer && !e.silenced) fx.tracer(ox, oy, oz, p.x, p.y, p.z, shooter.isPlayer ? 520 : 380, def.cat === "sniper" ? 9 : 4.5);
          else if (showTracer) fx.tracer(ox, oy, oz, p.x, p.y, p.z, 520, 2.2);
          if (p.hit === "world") {
            if (p.k === "ground") fx.impact(p.x, p.y, p.z, 0, 1, 0, theme.base, "ground", { big: def.cat === "sniper" });
            else fx.impact(p.x, p.y, p.z, p.nx, p.ny, p.nz, p.m, p.k, { big: def.cat === "sniper" });
          } else if (p.hit === "head" || p.hit === "body" || p.hit === "limb") {
            const v = match.combatants[p.victim];
            const col = match.mode.teams ? TEAM_COL[v.team] : v.color || "#ffd27a";
            fx.bodyHit(p.x, p.y, p.z, p.dx, p.dy, p.dz, v.isPlayer ? "#ff5040" : col, p.hit === "head");
          }
        });
      } else if (e.type === "kill") {
        const s = soldiers.get(e.victim);
        if (s) {
          const k = match.combatants[e.killer];
          s.rig.onDeath(k.x - e.x, k.z - e.z);
        }
      } else if (e.type === "hit") {
        const s = soldiers.get(e.victim);
        if (s) s.rig.flinch();
        if (e.victim === P.id) {
          cam.shake = Math.min(1, cam.shake + e.amount / 60);
        }
      } else if (e.type === "land" && e.id === P.id) {
        cam.dipV -= Math.min(2.4, e.v * 0.22);
        vm.onLand(e.v);
      } else if (e.type === "spawn") {
        const s = soldiers.get(e.id);
        if (s) {
          s.px = s.c.x;
          s.py = s.c.y;
          s.pz = s.c.z;
        }
      }
    }
  }

  /* ------------------------------------------------------------ per frame */
  let time = 0;
  let lightPickT = 0;
  const frustum = new THREE.Frustum();
  const projM = new THREE.Matrix4();
  const sph = new THREE.Sphere(new THREE.Vector3(), 1.4);
  const sunOffset = new THREE.Vector3();

  function vFov(hDeg, aspect) {
    return THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(hDeg) / 2) / aspect));
  }

  /**
   * view: { yaw, pitch } latest look (player input), alpha: sim interpolation
   */
  function frame(dt, viewIn = null) {
    if (lost || disposed) return;
    time += dt;
    const aspect = Math.max(0.3, canvas.clientWidth / Math.max(1, canvas.clientHeight));
    if (mode === "match" && match) frameMatch(dt, viewIn, aspect);
    else if (mode === "preview") framePreview(dt, aspect);
    else {
      renderer.setClearColor("#0b0f14");
      renderer.clear();
      return;
    }
    view?.update(time, dt);
    weather?.update(dt, camera.position);
    fx?.update(dt, camera.position);
    // sun shadow box follows the camera (snapped to texel grid)
    if (sun.castShadow) {
      const R = sun.shadow.camera.right;
      const texel = (R * 2) / sun.shadow.mapSize.x;
      const tx = Math.round(camera.position.x / texel) * texel;
      const tz = Math.round(camera.position.z / texel) * texel;
      sunOffset.copy(sunDir).multiplyScalar(120);
      if (sunOffset.y < 20) sunOffset.y = 20;
      sun.position.set(tx + sunOffset.x, sunOffset.y, tz + sunOffset.z);
      sun.target.position.set(tx, 0, tz);
    } else {
      sun.position.copy(sunDir).multiplyScalar(100);
      sun.target.position.set(0, 0, 0);
    }
    // local lights: nearest light spots to the camera
    lightPickT -= dt;
    const nPL = pLightsFor(Q);
    if (lightPickT <= 0 && view) {
      lightPickT = 0.35;
      const spots = view.lightSpots;
      const cx = camera.position.x;
      const cz = camera.position.z;
      const sorted = spots.map((s) => [s, (s.x - cx) ** 2 + (s.z - cz) ** 2]).sort((a, b) => a[1] - b[1]);
      for (let i = 0; i < MAX_PL; i++) {
        const l = pLights[i];
        const s = i < nPL ? sorted[i]?.[0] : null;
        if (!s) {
          l.intensity = 0;
          continue;
        }
        l.position.set(s.x, s.y, s.z);
        l.color.set(s.color);
        l.distance = s.r || (theme.night ? 18 : 12);
        l.userData.base = s.neon ? 7 : theme.night ? 9 : s.interior ? 5 : s.flicker ? 6 : 2.5;
        l.userData.flicker = !!s.flicker;
        l.intensity = l.userData.base;
      }
    }
    for (let i = 0; i < nPL; i++) {
      const l = pLights[i];
      if (l.userData.flicker) l.intensity = l.userData.base * (0.8 + Math.sin(time * 13 + i) * 0.12 + Math.sin(time * 31) * 0.08);
    }
    const showcaseActive = mode !== "match" && renderShowcase(dt);
    const showcaseKids = [showcaseRoot, scKey, scRim, scFill];
    for (const ch of vm.camera.children) ch.visible = mode === "match" ? !showcaseKids.includes(ch) : showcaseKids.includes(ch);
    // view-space sun for the viewmodel
    _w.copy(sunDir).transformDirection(camera.matrixWorldInverse);
    vm.setLighting({ sunDir: _w });
    // render
    if (composer) {
      if (grade) grade.uniforms.desat.value = match ? Math.max(0, 1 - match.player.hp / 45) * 0.55 + (match.player.alive ? 0 : 0.6) : 0;
      vmPass.enabled = (mode === "match" && match?.player.alive) || showcaseActive;
      composer.render(dt);
    } else {
      renderer.autoClear = true;
      renderer.render(scene, camera);
      if ((mode === "match" && match?.player.alive) || showcaseActive) {
        renderer.autoClear = false;
        renderer.clearDepth();
        renderer.render(vm.scene, vm.camera);
        renderer.autoClear = true;
      }
    }
  }

  function frameMatch(dt, viewIn, aspect) {
    const P = match.player;
    const ws = P.weapons[P.cur];
    const def = ws.def;
    // camera position: smoothed eye
    const eye = match.eye(P);
    const k = 1 - Math.exp(-28 * dt);
    if (P.alive) {
      if (Math.hypot(P.x - cam.x, P.z - cam.z) > 3) {
        cam.x = P.x;
        cam.z = P.z;
        cam.y = eye;
      }
      cam.x += (P.x - cam.x) * k;
      cam.z += (P.z - cam.z) * k;
      cam.y += (eye - cam.y) * (1 - Math.exp(-18 * dt));
      // landing dip spring
      cam.dipV += (-cam.dip * 120 - cam.dipV * 14) * dt;
      cam.dip += cam.dipV * dt;
      cam.shake *= Math.exp(-6 * dt);
      const yaw = (viewIn ? viewIn.yaw : P.yaw) + P.kickY;
      const pitch = (viewIn ? viewIn.pitch : P.pitch) + P.kickP;
      const speed = Math.hypot(P.vx, P.vz);
      const bob = P.grounded ? Math.sin(time * (P.sprinting ? 13 : 9.5)) * 0.012 * Math.min(1, speed / 4.7) * (1 - P.ads * 0.8) : 0;
      camera.position.set(cam.x, cam.y + cam.dip * 0.08 + bob, cam.z);
      const sh = cam.shake * 0.012;
      cam.roll += ((P.sprinting ? 0 : -P.input.mx * 0.012) - cam.roll) * (1 - Math.exp(-6 * dt));
      camera.rotation.set(pitch + (Math.random() - 0.5) * sh, yaw + (Math.random() - 0.5) * sh, cam.roll);
      // FOV: base → ADS zoom; sprint widens a little
      const zoom = 1 + (def.zoom - 1) * smooth(P.ads);
      const base = vFov(fovH, aspect) * (1 + (P.sprinting ? 0.05 : 0));
      camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(base) / 2) / zoom));
    } else {
      // death cam: rise and look at the killer
      const killer = P.killedBy != null ? match.combatants[P.killedBy] : null;
      const tt = Math.min(1, (match.clock - (P.deathAt || 0)) / 1.2);
      camera.position.set(P.x, eye - 1.1 * tt * 0.6 + tt * 1.4, P.z);
      if (killer) {
        _v.set(killer.x, match.eye(killer) - 0.3, killer.z);
        const dx = _v.x - camera.position.x;
        const dy = _v.y - camera.position.y;
        const dz = _v.z - camera.position.z;
        const yaw = Math.atan2(-dx, -dz);
        const pitch = Math.atan2(dy, Math.hypot(dx, dz));
        camera.rotation.set(lerpAngle(camera.rotation.x, pitch, 0.08), lerpAngle(camera.rotation.y, yaw, 0.08), camera.rotation.z * 0.9 + 0.1 * 0.12);
      }
      camera.fov += (vFov(fovH, aspect) * 0.8 - camera.fov) * 0.06;
    }
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    // viewmodel
    if (P.alive) {
      vm.setWeapon(def.id);
      vm.update(P, ws, dt, 52, aspect);
    }
    // soldiers
    projM.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(projM);
    for (const s of soldiers.values()) {
      const c = s.c;
      const kk = 1 - Math.exp(-30 * dt);
      if (Math.hypot(c.x - s.px, c.z - s.pz) > 3) {
        s.px = c.x;
        s.py = c.y;
        s.pz = c.z;
      }
      s.px += (c.x - s.px) * kk;
      s.py += (c.y - s.py) * kk;
      s.pz += (c.z - s.pz) * kk;
      sph.center.set(s.px, s.py + 0.9, s.pz);
      const inView = frustum.intersectsSphere(sph);
      const rigAlive = c.alive;
      if (!rigAlive && s.wasAlive) s.deadAt = time;
      s.wasAlive = rigAlive;
      if (!inView && (rigAlive || time - (s.deadAt || 0) > 5)) {
        s.rig.root.visible = false;
        continue;
      }
      s.rig.root.visible = true;
      const w = c.weapons[c.cur];
      s.rig.setWeapon(w.def.id);
      s.rig.update({ x: s.px, y: s.py, z: s.pz, yaw: c.yaw, pitch: c.pitch, vx: c.vx, vz: c.vz, vy: c.vy, crouch: c.crouch, sprinting: c.sprinting, grounded: c.grounded, ads: c.ads, alive: rigAlive, reloading: w.reloading, reloadT: w.reloadT, reloadTotal: w.reloadTotal }, dt, time);
    }
    // flags
    for (const fl of flags) {
      const f = fl.f;
      const own = f.owner;
      const col = own < 0 ? "#f2f2f2" : TEAM_COL[own === P.team ? 0 : 1];
      fl.clothMat.color.set(col);
      fl.clothMat.emissive.set(own < 0 ? "#000000" : col);
      fl.clothMat.emissiveIntensity = 0.25;
      const capCol = f.capTeam >= 0 ? TEAM_COL[f.capTeam === P.team ? 0 : 1] : col;
      fl.ringMat.color.set(f.contested ? "#ffd34f" : capCol).multiplyScalar(1.6);
      fl.ringMat.opacity = 0.5 + (f.capTeam >= 0 || f.contested ? Math.sin(time * 8) * 0.25 : 0);
      fl.fillMat.color.set(capCol);
      // wave the cloth
      const pos = fl.cloth.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const bx = fl.base[i * 3];
        pos.setZ(i, Math.sin(bx * 4 - time * 5 + i * 0.01) * 0.08 * bx);
      }
      pos.needsUpdate = true;
      fl.cloth.geometry.computeVertexNormals();
    }
    // pickups
    const seen = new Set();
    for (const p of match.pickups) {
      seen.add(p.id);
      let pv = pickupViews.get(p.id);
      if (!pv || pv.weapon !== p.weapon) {
        if (pv) {
          scene.remove(pv.g);
          pv.gun.root.traverse((o) => o.isMesh && o.geometry.dispose());
        }
        const gun = buildGun(p.weapon, { shadow: false });
        const g = new THREE.Group();
        gun.root.rotation.set(0, 0, Math.PI / 2);
        g.add(gun.root);
        const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTexture(), color: "#ffd77a", transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
        halo.scale.setScalar(1.1);
        g.add(halo);
        scene.add(g);
        pv = { g, gun, weapon: p.weapon, halo };
        pickupViews.set(p.id, pv);
      }
      pv.g.position.set(p.x, p.y + 0.35 + Math.sin(time * 2 + p.id) * 0.05, p.z);
      pv.g.rotation.y = time * 1.2 + p.id;
      pv.halo.material.opacity = 0.25 + Math.sin(time * 4) * 0.1;
    }
    for (const [id, pv] of pickupViews) {
      if (seen.has(id)) continue;
      scene.remove(pv.g);
      pv.gun.root.traverse((o) => o.isMesh && o.geometry.dispose());
      pv.halo.material.dispose();
      pickupViews.delete(id);
    }
  }

  function framePreview(dt, aspect) {
    previewT += dt;
    const map = getMap(mapId);
    const shots = map.shots;
    if (shots && shots.length) {
      const LEN = 11;
      const i = Math.floor(previewT / LEN) % shots.length;
      const k = (previewT % LEN) / LEN;
      const s = shots[i];
      const e = k * k * (3 - 2 * k) * 0.6 + k * 0.4;
      camera.position.set(s.a[0] + (s.b[0] - s.a[0]) * e, s.a[1] + (s.b[1] - s.a[1]) * e, s.a[2] + (s.b[2] - s.a[2]) * e);
      camera.lookAt(s.t[0], s.t[1], s.t[2]);
    } else {
      const { minX, maxX, minZ, maxZ } = map.bounds;
      const cx = (minX + maxX) / 2;
      const cz = (minZ + maxZ) / 2;
      const R = Math.max(maxX - minX, maxZ - minZ) * 0.42;
      const a = previewT * 0.05 + 0.6;
      camera.position.set(cx + Math.cos(a) * R, 14, cz + Math.sin(a) * R * 0.75);
      camera.lookAt(cx, 2, cz);
    }
    camera.fov = vFov(82, aspect);
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
  }

  async function preview(id) {
    await loadMap(id);
    if (!match && !disposed && mapId === id) mode = "preview";
  }

  /* ------------------------------------------------------------ loadout showcase + thumbnails */
  let showcaseGun = null;
  const showcaseRoot = new THREE.Group();
  showcaseRoot.position.set(0.02, -0.01, -0.8);
  vm.camera.add(showcaseRoot);
  const scKey = new THREE.DirectionalLight("#fff4e6", 2.6);
  scKey.position.set(-1, 1.5, 1.2);
  const scRim = new THREE.DirectionalLight("#ffb46a", 3.2);
  scRim.position.set(1.5, 0.6, -1.5);
  const scFill = new THREE.PointLight("#9fc6ff", 1.4, 3, 2);
  scFill.position.set(0.4, -0.3, -0.3);
  for (const l of [scKey, scRim, scFill]) {
    l.visible = false;
    vm.camera.add(l);
  }
  function showcase(id) {
    if (showcaseGun && showcaseGun.id === id) return;
    if (showcaseGun) {
      showcaseRoot.remove(showcaseGun.root);
      showcaseGun.root.traverse((o) => o.isMesh && o.geometry.dispose());
      showcaseGun = null;
    }
    if (!id) return;
    showcaseGun = buildGun(id, { shadow: false });
    // centre the model on its bounding box and fit it
    const bb = new THREE.Box3().setFromObject(showcaseGun.root);
    const c = bb.getCenter(new THREE.Vector3());
    const len = bb.getSize(new THREE.Vector3()).z;
    showcaseGun.root.position.sub(c);
    const wrap = new THREE.Group();
    wrap.add(showcaseGun.root);
    wrap.scale.setScalar(0.66 / Math.max(0.3, len));
    showcaseGun.wrap = wrap;
    showcaseRoot.add(wrap);
  }
  function renderShowcase(dt) {
    if (!showcaseGun) return false;
    showcaseRoot.rotation.y = Math.PI / 2 + Math.sin(time * 0.45) * 0.55;
    showcaseRoot.rotation.x = 0.08 + Math.sin(time * 0.3) * 0.05;
    vm.camera.fov = 40;
    vm.camera.aspect = Math.max(0.3, canvas.clientWidth / Math.max(1, canvas.clientHeight));
    vm.camera.updateProjectionMatrix();
    for (const g of vm.scene.children) if (g.isGroup && g !== showcaseRoot) void 0;
    void dt;
    return true;
  }

  function gunThumbs() {
    const out = {};
    const W = 320;
    const H = 120;
    const rt = new THREE.WebGLRenderTarget(W, H, { samples: 4 });
    const sc = new THREE.Scene();
    const pm = new THREE.PMREMGenerator(renderer);
    const env = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    pm.dispose();
    sc.environment = env;
    sc.add(new THREE.HemisphereLight("#ffffff", "#334", 1.2));
    const d = new THREE.DirectionalLight("#ffffff", 2.5);
    d.position.set(1, 2, 3);
    sc.add(d);
    const camO = new THREE.OrthographicCamera(-1, 1, 0.375, -0.375, 0.01, 10);
    camO.position.set(3, 0, 0);
    camO.lookAt(0, 0, 0);
    const buf = new Uint8Array(W * H * 4);
    const cv = document.createElement("canvas");
    cv.width = W;
    cv.height = H;
    const g2 = cv.getContext("2d");
    const prevTarget = renderer.getRenderTarget();
    const prevClear = renderer.getClearColor(new THREE.Color());
    const prevAlpha = renderer.getClearAlpha();
    const prevTone = renderer.toneMapping;
    renderer.toneMapping = THREE.NoToneMapping;
    for (const w of WEAPONS) {
      const gun = buildGun(w.id, { shadow: false });
      const bb = new THREE.Box3().setFromObject(gun.root);
      const c = bb.getCenter(new THREE.Vector3());
      const size = bb.getSize(new THREE.Vector3());
      gun.root.position.sub(c);
      const fit = Math.max(size.z / 1.9, size.y / 0.7);
      camO.left = -fit;
      camO.right = fit;
      camO.top = fit * 0.375;
      camO.bottom = -fit * 0.375;
      camO.updateProjectionMatrix();
      sc.add(gun.root);
      renderer.setRenderTarget(rt);
      renderer.setClearColor(0x000000, 0);
      renderer.clear();
      renderer.render(sc, camO);
      renderer.readRenderTargetPixels(rt, 0, 0, W, H, buf);
      const img = g2.createImageData(W, H);
      for (let y = 0; y < H; y++) {
        const src = (H - 1 - y) * W * 4;
        img.data.set(buf.subarray(src, src + W * 4), y * W * 4);
      }
      // light "icon" look: keep the shading as luminance, lift it toward white
      for (let i = 0; i < img.data.length; i += 4) {
        const l = (0.2126 * img.data[i] + 0.7152 * img.data[i + 1] + 0.0722 * img.data[i + 2]) / 255;
        const v = 150 + Math.pow(l, 1 / 2.2) * 120;
        const tint = (c) => Math.min(255, v * 0.82 + Math.pow(c / 255, 1 / 2.2) * 255 * 0.28);
        img.data[i] = tint(img.data[i]);
        img.data[i + 1] = tint(img.data[i + 1]);
        img.data[i + 2] = tint(img.data[i + 2]);
      }
      g2.clearRect(0, 0, W, H);
      g2.putImageData(img, 0, 0);
      out[w.id] = cv.toDataURL("image/png");
      sc.remove(gun.root);
      gun.root.traverse((o) => o.isMesh && o.geometry.dispose());
    }
    renderer.setRenderTarget(prevTarget);
    renderer.setClearColor(prevClear, prevAlpha);
    renderer.toneMapping = prevTone;
    rt.dispose();
    env.dispose();
    return out;
  }

  /* ------------------------------------------------------------ HUD helpers */
  const _p = new THREE.Vector3();
  /** project world → { x, y (0..1), behind, dist } */
  function project(x, y, z) {
    _p.set(x, y, z);
    const dist = _p.distanceTo(camera.position);
    _p.project(camera);
    return { x: (_p.x + 1) / 2, y: (1 - _p.y) / 2, behind: _p.z > 1, dist };
  }
  const cameraYaw = () => camera.rotation.y;

  function resize() {
    const w = host.clientWidth || 640;
    const h = host.clientHeight || 360;
    renderer.setSize(w, h, false);
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    if (composer) {
      composer.setPixelRatio(renderer.getPixelRatio());
      composer.setSize(w, h);
    }
  }

  /* ------------------------------------------------------------ context loss */
  const onLost = (e) => {
    e.preventDefault();
    lost = true;
    opts.onContextLost?.();
  };
  const onRestored = () => {
    lost = false;
    try {
      buildSky();
      applyQuality();
    } catch (err) {
      console.warn("[StrikeForce] restore failed", err);
    }
    opts.onContextRestored?.();
  };
  canvas.addEventListener("webglcontextlost", onLost);
  canvas.addEventListener("webglcontextrestored", onRestored);

  applyQuality();
  applyTheme();

  function setQuality(q) {
    if (q === Q) return;
    Q = q;
    applyQuality();
    buildWeather();
  }

  function dispose() {
    disposed = true;
    canvas.removeEventListener("webglcontextlost", onLost);
    canvas.removeEventListener("webglcontextrestored", onRestored);
    unloadMap();
    if (skyObj) {
      scene.remove(skyObj.group);
      skyObj.dispose();
    }
    envTex?.dispose();
    vm.dispose();
    disposeSoldierCache();
    disposeGunMaterials();
    if (composer) {
      composer.renderTarget1.dispose();
      composer.renderTarget2.dispose();
    }
    renderer.dispose();
    renderer.forceContextLoss?.();
    canvas.remove();
  }

  const stats = () => ({ calls: renderer.info.render.calls, tris: renderer.info.render.triangles, textures: renderer.info.memory.textures, geometries: renderer.info.memory.geometries, quality: Q, map: view?.stats() });

  return {
    renderer,
    scene,
    camera,
    vm,
    loadMap,
    preview,
    showcase,
    gunThumbs,
    bindMatch,
    clearMatch,
    handleEvents,
    frame,
    project,
    cameraYaw,
    resize,
    setQuality,
    setFov: (f) => (fovH = f),
    get quality() {
      return Q;
    },
    get mapId() {
      return mapId;
    },
    get lost() {
      return lost;
    },
    stats,
    dispose,
  };
}

function smooth(t) {
  return t * t * (3 - 2 * t);
}
function lerpAngle(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
function yieldFrame() {
  return new Promise((r) => {
    const c = new MessageChannel();
    c.port1.onmessage = () => r();
    c.port2.postMessage(0);
  });
}
void surfaceOf;
