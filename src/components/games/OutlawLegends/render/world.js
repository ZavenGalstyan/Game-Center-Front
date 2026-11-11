/**
 * Plain Three.js view of an Outlaw Legends sim. Builds the level from the
 * layout data (buildings, cover, props, sky, distant mesas, lights), keeps a
 * rig per character, and plays the effects the sim reports as events: muzzle
 * flashes, tracers, impact dust, hit puffs, explosions, fires.
 *
 * The camera comes straight from the sim (shots are ray-cast from it), with a
 * little shake added for feel. A pool of point lights follows the nearest
 * lamps/fires so big maps stay cheap.
 */
import * as THREE from "three";
import { buildCharacter, setRigWeapon, poseRig, buildHorse, poseHorse, buildGun, buildWagon, buildCoach, buildCactus, box, cyl, sph, cone, mat, geo, disposeCaches } from "./models.js";
import * as TX from "./textures.js";
import { objectiveMarkers } from "../engine/sim.js";
import { MISSION_BY_ID, buildMission } from "../engine/missions.js";

/* ------------------------------------------------------------ themes */
const THEMES = {
  noon: { top: "#3f86c8", hor: "#cfe0e6", bot: "#d8b98a", sun: [0.35, 0.9, 0.25], sunC: "#fff3d8", sunI: 2.6, hemiS: "#bcd8f0", hemiG: "#a07850", hemiI: 1.1, fog: "#d6cdb8", far: 260, exp: 1.0, ground: "town" },
  morning: { top: "#5a9ad0", hor: "#f2dcc0", bot: "#d4b08a", sun: [-0.7, 0.45, 0.3], sunC: "#ffe2b8", sunI: 2.4, hemiS: "#c8daf0", hemiG: "#9a7450", hemiI: 1.0, fog: "#e8d6bc", far: 240, exp: 1.0, ground: "town" },
  afternoon: { top: "#4a8ccc", hor: "#e8dcc4", bot: "#d2b080", sun: [0.6, 0.6, -0.4], sunC: "#ffe8c4", sunI: 2.5, hemiS: "#c4d8ec", hemiG: "#a07648", hemiI: 1.05, fog: "#ddd0b6", far: 250, exp: 1.0, ground: "town" },
  sunset: { top: "#2e3c6e", hor: "#ff9a52", bot: "#c27a4a", sun: [0.15, 0.16, -1], sunC: "#ffa060", sunI: 2.8, hemiS: "#ffb488", hemiG: "#5a3a2a", hemiI: 0.9, fog: "#e89a6a", far: 220, exp: 1.05, ground: "town", sunDisk: "#ffcf80" },
  dusk: { top: "#1e2448", hor: "#c4604a", bot: "#6a3e34", sun: [-0.6, 0.12, -0.7], sunC: "#ff8a5a", sunI: 1.6, hemiS: "#7a7aa8", hemiG: "#3a2a24", hemiI: 0.75, fog: "#7a4e4a", far: 180, exp: 1.15, ground: "town" },
  night: { top: "#060914", hor: "#3a1a26", bot: "#120c10", sun: [0.4, 0.5, -0.6], sunC: "#ffb0a0", sunI: 0.75, hemiS: "#7a86c0", hemiG: "#2a2024", hemiI: 0.95, fog: "#191826", far: 150, exp: 1.35, ground: "dirt", moon: true },
  burning: { top: "#160c12", hor: "#a0381e", bot: "#3a1a10", sun: [-0.5, 0.25, 0.6], sunC: "#ff7a3a", sunI: 1.4, hemiS: "#a05a4a", hemiG: "#2a1610", hemiI: 0.75, fog: "#4a2018", far: 150, exp: 1.2, ground: "town", embers: true },
  interior: { top: "#000", hor: "#000", bot: "#000", sun: [0.3, 1, 0.2], sunC: "#ffd8a0", sunI: 0.0, hemiS: "#ffe0b8", hemiG: "#5a3a22", hemiI: 1.15, fog: "#2a1a10", far: 70, exp: 1.4, ground: "wood", indoor: true },
  mine: { top: "#000", hor: "#000", bot: "#000", sun: [0.3, 1, 0.2], sunC: "#ffd8a0", sunI: 0.0, hemiS: "#b09a80", hemiG: "#2a1a10", hemiI: 0.75, fog: "#0c0806", far: 55, exp: 1.35, ground: "rock", indoor: true },
};

const SKY_VS = `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * p;
}`;
const SKY_FS = `
uniform vec3 top;
uniform vec3 hor;
uniform vec3 bot;
uniform vec3 sunDir;
uniform vec3 sunC;
varying vec3 vDir;
void main() {
  float h = vDir.y;
  vec3 c = h > 0.0 ? mix(hor, top, pow(clamp(h, 0.0, 1.0), 0.55)) : mix(hor, bot, clamp(-h * 4.0, 0.0, 1.0));
  float s = max(dot(normalize(vDir), normalize(sunDir)), 0.0);
  c += sunC * (pow(s, 600.0) * 2.5 + pow(s, 12.0) * 0.35);
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
}`;

/* ------------------------------------------------------------ helpers */
function rngf(seed) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const ENEMY_WEAPON = { bandit: "revolver", gunslinger: "revolver", shotgunner: "shotgun", marksman: "rifle", brawler: null, elite: "carbine", rider: "revolver", boss: "revolver", bossBrute: null };

export function createWorld(container, opts = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance", preserveDrawingBuffer: !!opts.preserve });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, opts.lowRes ? 1 : 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.className = "ol-canvas";
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(62, 16 / 9, 0.08, 600);
  camera.rotation.order = "YXZ";
  const hemi = new THREE.HemisphereLight("#ffffff", "#806040", 1);
  const sun = new THREE.DirectionalLight("#fff0d0", 2.5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -34;
  sun.shadow.camera.right = 34;
  sun.shadow.camera.top = 34;
  sun.shadow.camera.bottom = -34;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 160;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.03;
  scene.add(hemi, sun, sun.target);

  // shared textures
  const T = {
    planks: TX.PLANK_TONES.map((_, i) => TX.plankTexture(i, true)),
    plankH: TX.plankTexture(3, false),
    crate: TX.crateTexture(),
    adobe: TX.adobeTexture(),
    log: TX.logTexture(),
    canvas: TX.canvasTexture(),
    canvasRed: TX.canvasTexture("#b8654a"),
    road: TX.roadTexture(),
    floor: TX.woodFloorTexture(),
    rocks: [0, 1, 2, 3].map((i) => TX.rockTexture(i)),
    dot: TX.softDot(),
    flash: TX.flashTexture(),
    smoke: TX.smokeTexture(),
    blob: TX.blobShadow(),
    marker: TX.markerTexture(),
    alert: TX.alertTexture(),
    poster: TX.posterTexture(),
    signs: new Map(),
    grounds: new Map(),
  };
  const sign = (kind) => {
    if (!T.signs.has(kind)) T.signs.set(kind, TX.signTexture(kind));
    return T.signs.get(kind);
  };
  const groundTex = (kind) => {
    if (!T.grounds.has(kind)) T.grounds.set(kind, TX.groundTexture(kind));
    return T.grounds.get(kind);
  };
  const plankMat = (tone, repX = 1, repY = 1) => {
    const t = T.planks[tone % T.planks.length].clone();
    t.repeat.set(repX, repY);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.needsUpdate = true;
    t.userData.owned = true;
    return new THREE.MeshStandardMaterial({ map: t, roughness: 0.9 });
  };

  // sky
  const skyMat = new THREE.ShaderMaterial({
    vertexShader: SKY_VS,
    fragmentShader: SKY_FS,
    uniforms: { top: { value: new THREE.Color() }, hor: { value: new THREE.Color() }, bot: { value: new THREE.Color() }, sunDir: { value: new THREE.Vector3(0, 1, 0) }, sunC: { value: new THREE.Color() } },
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(450, 32, 16), skyMat);
  sky.renderOrder = -1;
  scene.add(sky);
  // stars + moon (night)
  const starGeo = new THREE.BufferGeometry();
  {
    const r = rngf(7);
    const p = new Float32Array(900 * 3);
    for (let i = 0; i < 900; i++) {
      const th = r() * Math.PI * 2, ph = Math.acos(r() * 0.95);
      p[i * 3] = Math.sin(ph) * Math.cos(th) * 420;
      p[i * 3 + 1] = Math.cos(ph) * 420;
      p[i * 3 + 2] = Math.sin(ph) * Math.sin(th) * 420;
    }
    starGeo.setAttribute("position", new THREE.BufferAttribute(p, 3));
  }
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: "#fff4e0", size: 1.6, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.85 }));
  scene.add(stars);
  const moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.dot, color: "#ff5a40", fog: false, depthWrite: false }));
  moon.scale.setScalar(60);
  scene.add(moon);

  // ground
  const groundMat = new THREE.MeshStandardMaterial({ roughness: 0.95, color: "#ffffff" });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  /* ---------------------------------------------------------- fx pools */
  const fx = new THREE.Group();
  scene.add(fx);
  // tracers
  const tracers = [];
  for (let i = 0; i < 28; i++) {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(6), 3));
    const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color: "#ffe8a0", transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    l.frustumCulled = false;
    l.visible = false;
    fx.add(l);
    tracers.push({ l, t: 1 });
  }
  let tracerI = 0;
  function tracer(ax, ay, az, bx, by, bz, color = "#ffe8a0") {
    const T2 = tracers[tracerI];
    tracerI = (tracerI + 1) % tracers.length;
    const a = T2.l.geometry.attributes.position.array;
    a[0] = ax;
    a[1] = ay;
    a[2] = az;
    a[3] = bx;
    a[4] = by;
    a[5] = bz;
    T2.l.geometry.attributes.position.needsUpdate = true;
    T2.l.material.color.set(color);
    T2.t = 0;
    T2.l.visible = true;
  }
  // sprites (flashes, smoke, puffs, fire)
  const sprites = [];
  for (let i = 0; i < 90; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.smoke, transparent: true, depthWrite: false, opacity: 0 }));
    s.visible = false;
    fx.add(s);
    sprites.push({ s, t: 1, life: 1, vx: 0, vy: 0, vz: 0, grow: 1, size: 1, fade: 1, kind: "" });
  }
  let spriteI = 0;
  function puff(x, y, z, { map = T.smoke, color = "#d8c6a6", size = 0.8, grow = 2, life = 0.8, vx = 0, vy = 0.6, vz = 0, opacity = 0.7, additive = false, rot = Math.random() * 6 } = {}) {
    const P = sprites[spriteI];
    spriteI = (spriteI + 1) % sprites.length;
    P.s.material.map = map;
    P.s.material.color.set(color);
    P.s.material.blending = additive ? THREE.AdditiveBlending : THREE.NormalBlending;
    P.s.material.rotation = rot;
    P.s.material.needsUpdate = true;
    P.s.position.set(x, y, z);
    P.s.scale.setScalar(size);
    P.s.visible = true;
    Object.assign(P, { t: 0, life, vx, vy, vz, grow, size, op: opacity });
    return P;
  }
  // sparks (additive points)
  const NS = 500;
  const spPos = new Float32Array(NS * 3), spCol = new Float32Array(NS * 3), spVel = new Float32Array(NS * 3), spLife = new Float32Array(NS);
  const spGeo = new THREE.BufferGeometry();
  spGeo.setAttribute("position", new THREE.BufferAttribute(spPos, 3));
  spGeo.setAttribute("color", new THREE.BufferAttribute(spCol, 3));
  const sparks = new THREE.Points(spGeo, new THREE.PointsMaterial({ size: 0.12, map: T.dot, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  sparks.frustumCulled = false;
  fx.add(sparks);
  for (let i = 0; i < NS; i++) spPos[i * 3 + 1] = -999;
  let spI = 0;
  const tmpC = new THREE.Color();
  function spray(x, y, z, n, color, speed = 3, up = 1.5, life = 0.5) {
    tmpC.set(color);
    for (let k = 0; k < n; k++) {
      const i = spI;
      spI = (spI + 1) % NS;
      spPos[i * 3] = x;
      spPos[i * 3 + 1] = y;
      spPos[i * 3 + 2] = z;
      const a = Math.random() * Math.PI * 2, e = Math.random();
      spVel[i * 3] = Math.cos(a) * speed * e;
      spVel[i * 3 + 1] = up * (0.3 + Math.random());
      spVel[i * 3 + 2] = Math.sin(a) * speed * e;
      spCol[i * 3] = tmpC.r;
      spCol[i * 3 + 1] = tmpC.g;
      spCol[i * 3 + 2] = tmpC.b;
      spLife[i] = life * (0.5 + Math.random() * 0.6);
    }
  }
  // muzzle light
  const muzzleLight = new THREE.PointLight("#ffb050", 0, 9, 2);
  scene.add(muzzleLight);
  let muzzleT = 1;
  const boomLight = new THREE.PointLight("#ff8a3a", 0, 22, 2);
  scene.add(boomLight);
  let boomT = 1;
  // point light pool
  const lightPool = [];
  for (let i = 0; i < 6; i++) {
    const l = new THREE.PointLight("#ffb060", 0, 10, 2);
    scene.add(l);
    lightPool.push({ l, src: null });
  }
  // shock rings
  const ringGeo = new THREE.RingGeometry(0.85, 1, 40);
  ringGeo.rotateX(-Math.PI / 2);
  const rings = [];
  for (let i = 0; i < 6; i++) {
    const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: "#fff", transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
    m.visible = false;
    fx.add(m);
    rings.push({ m, t: 1, r: 1, dur: 0.4 });
  }
  let ringI = 0;
  function ring(x, z, r, color, dur = 0.45) {
    const R = rings[ringI];
    ringI = (ringI + 1) % rings.length;
    R.m.position.set(x, 0.07, z);
    R.m.material.color.set(color);
    Object.assign(R, { t: 0, r, dur });
    R.m.visible = true;
  }

  /* ---------------------------------------------------------- level */
  let level = null; // { group, dyn, theme, L, ... }
  const blobGeo = geo("blob", () => {
    const g = new THREE.PlaneGeometry(1, 1);
    g.rotateX(-Math.PI / 2);
    return g;
  });
  const blobMat = new THREE.MeshBasicMaterial({ map: T.blob, transparent: true, depthWrite: false });

  function applyTheme(name) {
    const th = THEMES[name] || THEMES.noon;
    skyMat.uniforms.top.value.set(th.top);
    skyMat.uniforms.hor.value.set(th.hor);
    skyMat.uniforms.bot.value.set(th.bot);
    skyMat.uniforms.sunDir.value.set(...th.sun).normalize();
    skyMat.uniforms.sunC.value.set(th.sunDisk || th.sunC);
    hemi.color.set(th.hemiS);
    hemi.groundColor.set(th.hemiG);
    hemi.intensity = th.hemiI;
    sun.color.set(th.sunC);
    sun.intensity = th.sunI;
    sun.visible = th.sunI > 0;
    scene.fog = new THREE.Fog(th.fog, th.indoor ? 8 : 40, th.far);
    scene.background = th.indoor ? new THREE.Color(th.fog) : null;
    sky.visible = !th.indoor;
    stars.visible = !!th.moon;
    moon.visible = !!th.moon;
    moon.position.set(...th.sun.map((v) => v * 380));
    renderer.toneMappingExposure = th.exp;
    return th;
  }

  function staticMesh(m) {
    m.matrixAutoUpdate = false;
    m.updateMatrix();
    m.traverse?.((o) => {
      if (o !== m) {
        o.matrixAutoUpdate = false;
        o.updateMatrix();
      }
    });
    return m;
  }

  function addBuildingDetail(group, b, h, face, facade, tone, tall, hollowRoof = false) {
    // false front + sign + windows + door + roof
    const fw = face === "e" || face === "w" ? b.d : b.w;
    const half = face === "e" || face === "w" ? b.w / 2 : b.d / 2;
    const ang = { s: 0, n: Math.PI, e: Math.PI / 2, w: -Math.PI / 2 }[face] ?? 0;
    const F = new THREE.Group();
    F.position.set(b.x, 0, b.z);
    F.rotation.y = ang;
    const pm = plankMat(tone, fw / 4, (h + tall) / 4);
    if (tall > 0) {
      const ff = new THREE.Mesh(BOXG, pm);
      ff.scale.set(fw + 0.2, h + tall, 0.25);
      ff.position.set(0, (h + tall) / 2, half + 0.1);
      ff.castShadow = ff.receiveShadow = true;
      F.add(ff);
      // cornice
      F.add(at(box("#4a3020", fw + 0.6, 0.22, 0.5), 0, h + tall, half + 0.16));
    }
    if (facade && facade !== "house" && facade !== "shack" && facade !== "cabin" && facade !== "adobe" && facade !== "barn" && facade !== "shed") {
      const sm = new THREE.Mesh(geo("plane", () => new THREE.PlaneGeometry(1, 1)), new THREE.MeshStandardMaterial({ map: sign(facade), roughness: 0.8 }));
      sm.scale.set(Math.min(fw * 0.7, 4.6), Math.min(fw * 0.35, 2.3), 1);
      sm.position.set(0, h + tall * 0.35 - 0.2, half + 0.25);
      F.add(sm);
    }
    if (!hollowRoof) {
      // door
      F.add(at(box("#2a1a10", 1.5, 2.4, 0.06), 0, 1.2, half + 0.02));
      F.add(at(box("#7a5434", 1.7, 0.12, 0.1), 0, 2.45, half + 0.04));
      // windows
      for (const x of [-fw * 0.3, fw * 0.3]) {
        if (Math.abs(x) < 1.4) continue;
        F.add(at(box("#1a1c22", 1.1, 1.2, 0.06, { rough: 0.2, metal: 0.4 }), x, 1.7, half + 0.02));
        F.add(at(box("#d8c8a0", 1.3, 0.1, 0.1), x, 2.35, half + 0.05));
        F.add(at(box("#d8c8a0", 1.3, 0.1, 0.1), x, 1.05, half + 0.05));
      }
      // upper windows on tall buildings
      if (h > 6) for (const x of [-fw * 0.25, 0, fw * 0.25]) F.add(at(box("#22242a", 0.8, 1.0, 0.06, { rough: 0.2, metal: 0.4 }), x, h - 1.6, half + 0.02));
    }
    group.add(F);
  }
  const BOXG = geo("box", () => new THREE.BoxGeometry(1, 1, 1));
  const at = (o, x, y, z) => {
    o.position.set(x, y, z);
    return o;
  };

  function wallMaterial(b) {
    const m = b.mat || "plank";
    const len = Math.max(b.w, b.d);
    if (m === "adobe") {
      const t = T.adobe.clone();
      t.repeat.set(len / 3, b.h / 3);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.needsUpdate = true;
      t.userData.owned = true;
      return new THREE.MeshStandardMaterial({ map: t, roughness: 0.95 });
    }
    if (m === "log") {
      const t = T.log.clone();
      t.repeat.set(len / 1.2, 1);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.needsUpdate = true;
      t.userData.owned = true;
      return new THREE.MeshStandardMaterial({ map: t, roughness: 0.9 });
    }
    if (m === "rock") {
      const t = T.rocks[3].clone();
      t.repeat.set(len / 5, b.h / 5);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.needsUpdate = true;
      t.userData.owned = true;
      return new THREE.MeshStandardMaterial({ map: t, roughness: 1, flatShading: true });
    }
    return plankMat(m === "barn" ? 4 : 3, len / 3, b.h / 3);
  }

  function buildObstacle(b, G, th) {
    let m = null;
    switch (b.kind) {
      case "bound":
        return null;
      case "building": {
        const pm = plankMat(b.tone || 0, b.w / 3.5, b.h / 3.5);
        m = new THREE.Mesh(BOXG, pm);
        m.scale.set(b.w, b.h, b.d);
        m.position.set(b.x, b.h / 2, b.z);
        m.castShadow = m.receiveShadow = true;
        G.add(staticMesh(m));
        // roof
        const roof = box("#3a2a20", b.w + 0.5, 0.25, b.d + 0.5);
        roof.position.set(b.x, b.h + 0.1, b.z);
        G.add(staticMesh(roof));
        const det = new THREE.Group();
        addBuildingDetail(det, b, b.h, b.face, b.facade, b.tone || 0, b.tall || 0);
        G.add(staticMesh(det));
        return m;
      }
      case "wall":
      case "rockwall":
      case "palisade":
      case "adobe":
      case "ruin": {
        if (b.hidden) return null;
        const wm = wallMaterial(b);
        m = new THREE.Mesh(BOXG, wm);
        const y0 = b.y0 || 0;
        m.scale.set(b.w, b.h - y0, b.d);
        m.position.set(b.x, y0 + (b.h - y0) / 2, b.z);
        m.castShadow = m.receiveShadow = true;
        G.add(staticMesh(m));
        if (b.kind === "palisade") {
          // pointed log tops
          const n = Math.max(1, Math.round(Math.max(b.w, b.d) / 0.8));
          const g2 = new THREE.Group();
          for (let i = 0; i < n; i++) {
            const tip = cone("#5a3e26", 0.4, 0.7);
            const k = (i + 0.5) / n - 0.5;
            tip.position.set(b.x + (b.w > b.d ? k * b.w : 0), b.h + 0.35, b.z + (b.w > b.d ? 0 : k * b.d));
            g2.add(tip);
          }
          G.add(staticMesh(g2));
        }
        if (b.kind === "adobe") {
          const cap = box("#a8784e", b.w + 0.15, 0.18, b.d + 0.15);
          cap.position.set(b.x, b.h + 0.05, b.z);
          G.add(staticMesh(cap));
        }
        return m;
      }
      case "gate": {
        const g = new THREE.Group();
        g.add(at(box(mat("#5a3e26", { map: T.log }), b.w, b.h, b.d), 0, b.h / 2, 0));
        g.add(at(box("#2a2424", b.w + 0.2, 0.3, b.d + 0.2, { metal: 0.6, rough: 0.5 }), 0, b.h * 0.3, 0));
        g.add(at(box("#2a2424", b.w + 0.2, 0.3, b.d + 0.2, { metal: 0.6, rough: 0.5 }), 0, b.h * 0.75, 0));
        g.position.set(b.x, 0, b.z);
        G.add(g);
        return g;
      }
      case "crate": {
        const g = new THREE.Group();
        for (let i = 0; i < (b.stack || 1); i++) {
          const c = new THREE.Mesh(BOXG, mat("#ffffff", { map: T.crate, rough: 0.9 }));
          c.scale.setScalar(b.s);
          c.position.set(0, b.s * (i + 0.5), 0);
          c.rotation.y = (((b.x * 7 + b.z * 3 + i) % 5) - 2) * 0.05;
          c.castShadow = c.receiveShadow = true;
          g.add(c);
        }
        g.position.set(b.x, 0, b.z);
        G.add(staticMesh(g));
        return g;
      }
      case "barrel": {
        const g = new THREE.Group();
        g.add(at(cyl("#6a4426", 0.4, 1.05), 0, 0.525, 0));
        g.add(at(cyl("#3a3a3a", 0.41, 0.06, { metal: 0.6, rough: 0.5 }), 0, 0.2, 0));
        g.add(at(cyl("#3a3a3a", 0.41, 0.06, { metal: 0.6, rough: 0.5 }), 0, 0.85, 0));
        g.position.set(b.x, 0, b.z);
        G.add(staticMesh(g));
        return g;
      }
      case "wagon": {
        const g = buildWagon(b.cover, false);
        g.position.set(b.x, 0, b.z);
        if (b.ax === "x") g.rotation.y = Math.PI / 2;
        G.add(g);
        return g;
      }
      case "coach": {
        const g = buildCoach();
        g.position.set(b.x, 0, b.z);
        G.add(g);
        return g;
      }
      case "fence":
      case "sandbags":
      case "trough":
      case "hay": {
        const g = new THREE.Group();
        const horiz = b.w > b.d;
        const len = horiz ? b.w : b.d;
        if (b.kind === "fence") {
          const n = Math.max(1, Math.round(len / 2));
          for (let i = 0; i <= n; i++) {
            const k = i / n - 0.5;
            g.add(at(box("#6a4a2e", 0.14, b.h + 0.1, 0.14), horiz ? k * len : 0, (b.h + 0.1) / 2, horiz ? 0 : k * len));
          }
          for (const y of [b.h * 0.45, b.h * 0.9]) g.add(at(box("#7a5838", horiz ? len : 0.08, 0.12, horiz ? 0.08 : len), 0, y, 0));
        } else if (b.kind === "sandbags") {
          const n = Math.max(2, Math.round(len / 0.7));
          for (let row = 0; row < 3; row++)
            for (let i = 0; i < n - (row % 2); i++) {
              const k = (i + 0.5 + (row % 2) * 0.5) / n - 0.5;
              const s = sph("#b8a27a", 0.5);
              s.scale.set(horiz ? 0.78 : 0.62, 0.36, horiz ? 0.62 : 0.78);
              s.position.set(horiz ? k * len : 0, 0.18 + row * 0.3, horiz ? 0 : k * len);
              g.add(s);
            }
        } else if (b.kind === "trough") {
          g.add(at(box("#6a4a2e", b.w, b.h, b.d), 0, b.h / 2, 0));
          g.add(at(box("#3e6a7a", b.w - 0.16, 0.04, b.d - 0.16, { rough: 0.15, metal: 0.2 }), 0, b.h - 0.08, 0));
        } else {
          g.add(at(box("#d8b45a", b.w, b.h, b.d), 0, b.h / 2, 0));
          g.add(at(box("#a8843a", horiz ? 0.06 : b.w + 0.02, b.h + 0.02, horiz ? b.d + 0.02 : 0.06), horiz ? -b.w * 0.25 : 0, b.h / 2, horiz ? 0 : -b.d * 0.25));
          g.add(at(box("#a8843a", horiz ? 0.06 : b.w + 0.02, b.h + 0.02, horiz ? b.d + 0.02 : 0.06), horiz ? b.w * 0.25 : 0, b.h / 2, horiz ? 0 : b.d * 0.25));
        }
        g.position.set(b.x, 0, b.z);
        G.add(staticMesh(g));
        return g;
      }
      case "rock":
      case "cliff": {
        const t = T.rocks[b.tone || 0];
        const g = new THREE.Group();
        const rm = mat("#ffffff", { map: t, rough: 1 });
        const r = rngf(Math.round(b.x * 13 + b.z * 7));
        if (b.kind === "rock") {
          const m2 = new THREE.Mesh(geo(`rk${Math.floor(r() * 3)}`, () => new THREE.DodecahedronGeometry(0.5, 0)), rm);
          m2.scale.set(b.w * 1.1, b.h * 1.25, b.d * 1.1);
          m2.position.y = b.h * 0.42;
          m2.rotation.y = r() * 6;
          m2.castShadow = m2.receiveShadow = true;
          g.add(m2);
        } else {
          const m2 = new THREE.Mesh(BOXG, rm);
          m2.scale.set(b.w, b.h, b.d);
          m2.position.y = b.h / 2;
          m2.castShadow = m2.receiveShadow = true;
          g.add(m2);
          // jagged boulders along the top & faces
          const n = Math.ceil((b.w + b.d) / 6);
          for (let i = 0; i < n; i++) {
            const k = new THREE.Mesh(geo("rk0", () => new THREE.DodecahedronGeometry(0.5, 0)), rm);
            const s = 3 + r() * 5;
            k.scale.set(s, s * (0.6 + r() * 0.8), s);
            k.position.set((r() - 0.5) * b.w, b.h - s * 0.2 + r() * 2, (r() - 0.5) * b.d);
            k.rotation.set(r() * 3, r() * 3, 0);
            g.add(k);
          }
        }
        g.position.set(b.x, 0, b.z);
        G.add(staticMesh(g));
        return g;
      }
      case "cactus": {
        const g = buildCactus(b.h);
        g.position.set(b.x, 0, b.z);
        g.rotation.y = (b.x * 3.1 + b.z) % 6;
        G.add(staticMesh(g));
        return g;
      }
      case "tent": {
        const g = new THREE.Group();
        const prism = new THREE.Mesh(geo("tent", () => new THREE.CylinderGeometry(1, 1, 1, 3, 1)), mat("#ffffff", { map: Math.round(b.x + b.z) % 2 ? T.canvas : T.canvasRed, side: THREE.DoubleSide }));
        const len = b.ax === "x" ? b.w : b.d;
        const wid = b.ax === "x" ? b.d : b.w;
        const s = b.h / 1.5;
        // triangular prism: ridge up, axis along z (turned for x tents)
        prism.scale.set(wid / 1.73, len, s);
        prism.rotation.x = -Math.PI / 2;
        prism.position.y = 0.5 * s;
        prism.castShadow = true;
        const holder = new THREE.Group();
        holder.add(prism);
        if (b.ax === "x") holder.rotation.y = Math.PI / 2;
        g.add(holder);
        g.position.set(b.x, 0, b.z);
        G.add(staticMesh(g));
        return g;
      }
      case "table": {
        const g = new THREE.Group();
        if (b.round) g.add(at(cyl("#5a3620", b.w / 2, 0.08), 0, b.h, 0));
        else g.add(at(box("#5a3620", b.w, 0.08, b.d), 0, b.h, 0));
        g.add(at(cyl("#3a2414", 0.08, b.h), 0, b.h / 2, 0));
        g.add(at(cyl("#3a2414", 0.4, 0.05), 0, 0.03, 0));
        // cards & glass
        g.add(at(box("#e8e0d0", 0.2, 0.01, 0.14), 0.15, b.h + 0.05, 0.1));
        g.add(at(cyl("#c8a050", 0.04, 0.1, { transparent: true, opacity: 0.8 }), -0.2, b.h + 0.09, -0.1));
        g.position.set(b.x, 0, b.z);
        G.add(staticMesh(g));
        return g;
      }
      case "bar":
      case "counter":
      case "desk": {
        const g = new THREE.Group();
        g.add(at(new THREE.Mesh(BOXG, plankMat(3, b.w / 2, 1)), 0, b.h / 2, 0));
        g.children[0].scale.set(b.w, b.h, b.d);
        g.add(at(box("#3a2214", b.w + 0.2, 0.08, b.d + 0.2, { rough: 0.4 }), 0, b.h, 0));
        if (b.kind === "bar") g.add(at(box("#b08a3a", b.w, 0.05, 0.05, { metal: 0.7, rough: 0.3 }), 0, 0.2, b.d / 2 + 0.15));
        if (b.kind === "desk") g.add(at(box("#e8dcc0", 0.5, 0.01, 0.35), 0.3, b.h + 0.05, 0));
        g.position.set(b.x, 0, b.z);
        G.add(staticMesh(g));
        return g;
      }
      case "piano":
      case "safe": {
        const g = new THREE.Group();
        if (b.kind === "safe") {
          g.add(at(box("#2a2c30", b.w, b.h, b.d, { metal: 0.6, rough: 0.4 }), 0, b.h / 2, 0));
          g.add(at(cyl("#c8a040", 0.12, 0.06, { metal: 0.8, rough: 0.3 }), 0, b.h * 0.55, -b.d / 2 - 0.02));
          g.children[1].rotation.x = Math.PI / 2;
        } else if (b.kind2 === "bench") {
          g.add(at(box("#5a3620", b.w, b.h * 0.5, b.d), 0, b.h * 0.25, 0));
        } else {
          g.add(at(box("#2a1810", b.w, b.h, b.d, { rough: 0.4 }), 0, b.h / 2, 0));
          g.add(at(box("#f0ead8", b.w * 0.9, 0.04, 0.24), 0, b.h * 0.62, b.d / 2 + 0.05));
        }
        g.position.set(b.x, 0, b.z);
        G.add(staticMesh(g));
        return g;
      }
      case "cell": {
        const g = new THREE.Group();
        const iron = mat("#2a2a2e", { metal: 0.7, rough: 0.45 });
        for (let i = 0; i <= 8; i++) {
          g.add(at(cyl(iron, 0.025, b.h), -b.w / 2 + (i * b.w) / 8, b.h / 2, -b.d / 2));
          g.add(at(cyl(iron, 0.025, b.h), -b.w / 2, b.h / 2, -b.d / 2 + (i * b.d) / 8));
        }
        g.add(at(box(iron, b.w, 0.08, 0.08), 0, b.h - 0.05, -b.d / 2));
        g.add(at(box(iron, 0.08, 0.08, b.d), -b.w / 2, b.h - 0.05, 0));
        g.add(at(box("#8a7a5a", 1.6, 0.4, 0.8), 0.3, 0.3, 0.6));
        g.position.set(b.x, 0, b.z);
        G.add(staticMesh(g));
        return g;
      }
      case "train": {
        const g = buildTrainCar(b);
        G.add(staticMesh(g));
        return g;
      }
      case "tower": {
        const g = new THREE.Group();
        for (const [x, z] of [[-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2], [1.2, 1.2]]) g.add(at(box("#5a3e26", 0.25, 5, 0.25), x, 2.5, z));
        g.add(at(box("#5a3e26", 2.8, 0.2, 2.8), 0, 5, 0));
        const tank = at(cyl("#7a5636", 1.6, 2.6), 0, 6.4, 0);
        g.add(tank);
        g.add(at(cyl("#2a2a2a", 1.62, 0.1, { metal: 0.6 }), 0, 5.8, 0));
        g.add(at(cyl("#2a2a2a", 1.62, 0.1, { metal: 0.6 }), 0, 7.0, 0));
        g.add(at(cone("#4a3020", 1.8, 1.1), 0, 8.2, 0));
        g.position.set(b.x, 0, b.z);
        G.add(staticMesh(g));
        return g;
      }
      case "post": {
        const g = new THREE.Group();
        if (b.w > 1) {
          // windmill / headframe bases are drawn by deco; keep a stone footing
          g.add(at(box("#7a6a5a", b.w, 0.5, b.d), 0, 0.25, 0));
        } else {
          g.add(at(box("#4a3220", 0.18, b.h, 0.18), 0, b.h / 2, 0));
          if (b.lamp) {
            g.add(at(box("#4a3220", 0.7, 0.1, 0.1), 0.3, b.h - 0.1, 0));
            g.add(at(box("#ffcf7a", 0.22, 0.3, 0.22, { emissive: "#ff9a3a" }), 0.55, b.h - 0.35, 0));
          }
        }
        g.position.set(b.x, 0, b.z);
        G.add(staticMesh(g));
        return g;
      }
      case "tree": {
        const g = new THREE.Group();
        const bark = "#4a3a2e";
        g.add(at(cyl(bark, 0.22, b.h, {}, true), 0, b.h / 2, 0));
        const r = rngf(Math.round(b.x * 5 + b.z * 11));
        for (let i = 0; i < 5; i++) {
          const br = cyl(bark, 0.08, 1.6 + r() * 1.2, {}, true);
          br.position.set(0, b.h * (0.55 + r() * 0.4), 0);
          br.rotation.set((r() - 0.5) * 1.6, r() * 6, (r() - 0.5) * 1.6);
          br.translateY(0.7);
          g.add(br);
        }
        g.position.set(b.x, 0, b.z);
        G.add(staticMesh(g));
        return g;
      }
      case "mine": {
        const g = new THREE.Group();
        g.add(at(box("#0a0806", b.w - 2, b.h - 1, 0.6, { rough: 1 }), 0, (b.h - 1) / 2, 1.2));
        for (const x of [-b.w / 2 + 0.6, b.w / 2 - 0.6]) g.add(at(box("#5a3e26", 0.6, b.h, 0.6), x, b.h / 2, 1.5));
        g.add(at(box("#5a3e26", b.w, 0.7, 0.7), 0, b.h - 0.35, 1.5));
        g.position.set(b.x, 0, b.z);
        G.add(staticMesh(g));
        return g;
      }
      case "cart": {
        const g = new THREE.Group();
        if (b.luggage) {
          g.add(at(box("#5a4a3a", b.w, 0.1, b.d), 0, 0.5, 0));
          g.add(at(box("#7a4a2a", b.w * 0.8, 0.4, b.d * 0.4), 0, 0.75, -0.3));
          g.add(at(box("#3a4a5a", b.w * 0.7, 0.35, b.d * 0.35), 0, 0.72, 0.4));
        } else {
          g.add(at(box("#4a4a50", b.w, 0.8, b.d, { metal: 0.5, rough: 0.6 }), 0, 0.75, 0));
          g.add(at(box("#6a6a6a", b.w * 0.9, 0.25, b.d * 0.9, { rough: 1 }), 0, 1.15, 0));
        }
        for (const x of [-1, 1]) for (const z of [-1, 1]) {
          const w = at(cyl("#2a2a2a", 0.2, 0.1), x * b.w * 0.45, 0.2, z * b.d * 0.3);
          w.rotation.z = Math.PI / 2;
          g.add(w);
        }
        g.position.set(b.x, 0, b.z);
        G.add(staticMesh(g));
        return g;
      }
      case "pillar":
      case "fountain":
      case "pot":
      case "well": {
        const g = new THREE.Group();
        if (b.kind === "pillar") g.add(at(box(b.mat === "adobe" ? "#c89a6c" : "#5a4a3a", b.w, b.h, b.d), 0, b.h / 2, 0));
        else if (b.kind === "fountain") {
          g.add(at(cyl("#b8946a", b.w / 2, b.h), 0, b.h / 2, 0));
          g.add(at(cyl("#3e7a8a", b.w / 2 - 0.25, 0.05, { rough: 0.1 }), 0, b.h - 0.05, 0));
          g.add(at(cyl("#b8946a", 0.3, 1.6), 0, 1.4, 0));
          g.add(at(cyl("#b8946a", 0.8, 0.2), 0, 2.1, 0));
        } else if (b.kind === "pot") {
          g.add(at(sph("#b0603a", 0.5), 0, 0.5, 0));
          g.children[0].scale.set(1, 1.2, 1);
          g.add(at(box("#3a6a2a", 0.4, 0.6, 0.4), 0, 1.2, 0));
        } else {
          g.add(at(cyl("#7a6a5a", 0.9, 1.0), 0, 0.5, 0));
          for (const x of [-0.8, 0.8]) g.add(at(box("#4a3220", 0.12, 2.2, 0.12), x, 1.1, 0));
          g.add(at(box("#4a3220", 1.8, 0.12, 0.12), 0, 2.2, 0));
        }
        g.position.set(b.x, 0, b.z);
        G.add(staticMesh(g));
        return g;
      }
      default: {
        if (b.hidden) return null;
        m = box("#7a5a3a", b.w, b.h - (b.y0 || 0), b.d);
        m.position.set(b.x, (b.y0 || 0) + (b.h - (b.y0 || 0)) / 2, b.z);
        G.add(staticMesh(m));
        return m;
      }
    }
  }

  function buildTrainCar(b) {
    const g = new THREE.Group();
    const len = b.ax === "x" ? b.w : b.d;
    const inner = new THREE.Group();
    const wheelM = mat("#1e1e22", { metal: 0.6, rough: 0.5 });
    const car = b.car;
    if (car === "loco") {
      inner.add(at(cyl("#1a1a1e", 1.2, len * 0.6, { metal: 0.5, rough: 0.5 }), 0, 2.1, -len * 0.12));
      inner.children[0].rotation.x = Math.PI / 2;
      inner.add(at(box("#1a1a1e", 2.8, 3.2, len * 0.32, { metal: 0.4, rough: 0.6 }), 0, 2.3, len * 0.32));
      inner.add(at(box("#7a1a1a", 3.0, 0.2, len * 0.36), 0, 3.95, len * 0.32));
      inner.add(at(cyl("#1a1a1e", 0.35, 1.6), 0, 3.8, -len * 0.38));
      inner.add(at(cone("#1a1a1e", 0.65, 0.6), 0, 4.7, -len * 0.38));
      inner.children[inner.children.length - 1].rotation.x = Math.PI;
      inner.add(at(box("#b08a3a", 2.6, 0.3, 0.3, { metal: 0.8, rough: 0.3 }), 0, 1.3, -len * 0.42));
      inner.add(at(cone("#2a2a2e", 1.3, 1.2), 0, 0.7, -len * 0.5));
      inner.children[inner.children.length - 1].rotation.x = -Math.PI / 2;
      inner.add(at(sph("#ffe8a0", 0.3, { emissive: "#ffcf6a" }), 0, 2.9, -len * 0.47));
      for (let i = 0; i < 3; i++)
        for (const s of [-1, 1]) {
          const w = at(cyl("#7a1a1a", 0.7, 0.12), s * 1.35, 0.75, -len * 0.25 + i * 1.7);
          w.rotation.z = Math.PI / 2;
          inner.add(w);
        }
    } else {
      const color = car === "pass" ? "#2e5a3e" : car === "flat" ? "#4a3a2a" : "#7a3a26";
      const h = car === "flat" ? 0.3 : 2.6;
      inner.add(at(box("#2a2420", 2.9, 0.4, len), 0, 1.0, 0));
      if (car !== "flat") {
        inner.add(at(new THREE.Mesh(BOXG, plankMat(car === "pass" ? 2 : 1, len / 3, 1)), 0, 1.2 + h / 2, 0));
        inner.children[1].scale.set(2.9, h, len);
        inner.children[1].castShadow = true;
        inner.add(at(box("#2a2420", 3.1, 0.2, len + 0.2), 0, 1.25 + h, 0));
        if (car === "pass") for (let i = 0; i < Math.floor(len / 1.6); i++) for (const s of [-1, 1]) inner.add(at(box("#ffd890", 0.05, 0.7, 0.8, { emissive: "#6a4a20" }), s * 1.46, 2.5, -len / 2 + 1 + i * 1.6));
        else for (const s of [-1, 1]) inner.add(at(box("#3a1a10", 0.05, 2.0, 1.8), s * 1.46, 2.2, 0));
      } else {
        inner.add(at(box("#7a5a3a", 1.2, 1.0, 1.2), 0.5, 1.7, -len * 0.2));
        inner.add(at(box("#7a5a3a", 1.0, 0.8, 1.0), -0.6, 1.6, len * 0.25));
      }
      for (const z of [-len * 0.35, len * 0.35])
        for (const s of [-1, 1]) {
          const w = at(cyl(wheelM, 0.42, 0.12), s * 1.25, 0.45, z);
          w.rotation.z = Math.PI / 2;
          inner.add(w);
        }
      void color;
    }
    if (b.ax === "x") inner.rotation.y = Math.PI / 2;
    g.add(inner);
    g.position.set(b.x, 0, b.z);
    g.traverse((o) => {
      if (o.isMesh) o.castShadow = true;
    });
    return g;
  }

  function buildDeco(d, G, th, anim) {
    const g = new THREE.Group();
    switch (d.kind) {
      case "road": {
        const t = T.road.clone();
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.repeat.set(d.w > d.d ? d.w / 12 : 1, d.w > d.d ? 1 : d.d / 12);
        if (d.w > d.d) t.rotation = Math.PI / 2;
        t.needsUpdate = true;
        t.userData.owned = true;
        const m = new THREE.Mesh(geo("plane", () => new THREE.PlaneGeometry(1, 1)), new THREE.MeshStandardMaterial({ map: t, roughness: 1, transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 }));
        m.scale.set(d.w, d.d, 1);
        m.rotation.x = -Math.PI / 2;
        m.position.set(d.x, 0.015, d.z);
        m.receiveShadow = true;
        G.add(staticMesh(m));
        return;
      }
      case "porch": {
        const face = d.face;
        const ang = { s: 0, n: Math.PI, e: Math.PI / 2, w: -Math.PI / 2 }[face] ?? 0;
        const fw = face === "e" || face === "w" ? d.d : d.w;
        const half = face === "e" || face === "w" ? d.w / 2 : d.d / 2;
        const deck = new THREE.Mesh(BOXG, plankMat(3, fw / 3, 1));
        deck.scale.set(fw, 0.2, 2.4);
        deck.position.set(0, 0.1, half + 1.2);
        deck.receiveShadow = true;
        g.add(deck);
        const aw = box("#4a3424", fw + 0.2, 0.14, 2.6);
        aw.position.set(0, 3.0, half + 1.25);
        aw.rotation.x = 0.12;
        g.add(aw);
        const n = Math.max(2, Math.round(fw / 3));
        for (let i = 0; i <= n; i++) g.add(at(box("#5a3e26", 0.16, 3, 0.16), -fw / 2 + 0.2 + (i * (fw - 0.4)) / n, 1.5, half + 2.3));
        g.position.set(d.x, 0, d.z);
        g.rotation.y = ang;
        G.add(staticMesh(g));
        return;
      }
      case "roof": {
        const roof = box("#3a2a20", d.w + 0.5, 0.25, d.d + 0.5);
        roof.position.set(d.x, d.h + 0.1, d.z);
        G.add(staticMesh(roof));
        const det = new THREE.Group();
        addBuildingDetail(det, { x: d.x, z: d.z, w: d.w, d: d.d }, d.h, d.face, d.facade, d.tone || 0, d.tall || 0, true);
        G.add(staticMesh(det));
        // ceiling seen from inside
        const ceil = new THREE.Mesh(geo("plane", () => new THREE.PlaneGeometry(1, 1)), plankMat(3, d.w / 3, d.d / 3));
        ceil.scale.set(d.w, d.d, 1);
        ceil.rotation.x = Math.PI / 2;
        ceil.position.set(d.x, d.h - 0.1, d.z);
        G.add(staticMesh(ceil));
        // floor boards
        const floor = new THREE.Mesh(geo("plane", () => new THREE.PlaneGeometry(1, 1)), new THREE.MeshStandardMaterial({ map: T.floor, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2 }));
        floor.scale.set(d.w - 0.3, d.d - 0.3, 1);
        floor.rotation.x = -Math.PI / 2;
        floor.position.set(d.x, 0.02, d.z);
        floor.receiveShadow = true;
        G.add(staticMesh(floor));
        return;
      }
      case "rails": {
        const len = d.len;
        const horiz = d.ax === "x";
        for (const s of [-0.72, 0.72]) g.add(at(box("#6a6a70", horiz ? len : 0.1, 0.12, horiz ? 0.1 : len, { metal: 0.7, rough: 0.4 }), horiz ? 0 : s, 0.12, horiz ? s : 0));
        const n = Math.floor(len / 0.9);
        const tieGeo = geo("tie", () => new THREE.BoxGeometry(1, 1, 1));
        const ties = new THREE.InstancedMesh(tieGeo, mat("#4a3424"), n);
        const m4 = new THREE.Matrix4();
        for (let i = 0; i < n; i++) {
          const k = -len / 2 + (i + 0.5) * 0.9;
          m4.compose(new THREE.Vector3(horiz ? k : 0, 0.05, horiz ? 0 : k), new THREE.Quaternion(), new THREE.Vector3(horiz ? 0.25 : 2.2, 0.1, horiz ? 2.2 : 0.25));
          ties.setMatrixAt(i, m4);
        }
        ties.receiveShadow = true;
        g.add(ties);
        g.position.set(d.x, 0, d.z);
        G.add(staticMesh(g));
        return;
      }
      case "platform": {
        const m = new THREE.Mesh(BOXG, plankMat(3, d.w / 3, d.d / 3));
        m.scale.set(d.w, 0.12, d.d);
        m.position.set(d.x, 0.04, d.z);
        m.receiveShadow = true;
        G.add(staticMesh(m));
        return;
      }
      case "campfire":
      case "fire": {
        const s = d.s || 0.6;
        if (d.kind === "campfire") {
          for (let i = 0; i < 5; i++) {
            const lg = box("#3a2414", 0.14, 0.14, 0.9);
            lg.rotation.y = (i * Math.PI) / 5;
            lg.position.set(d.x, 0.08, d.z);
            G.add(lg);
          }
          for (let i = 0; i < 8; i++) G.add(at(sph("#5a5550", 0.14), d.x + Math.cos(i) * 0.6, 0.06, d.z + Math.sin(i) * 0.6));
        }
        anim.fires.push({ x: d.x, z: d.z, y: d.kind === "fire" ? 2.5 : 0.2, s: d.kind === "fire" ? s * 2.2 : 0.7, t: Math.random() });
        return;
      }
      case "lantern": {
        g.add(at(box("#2a2420", 0.24, 0.32, 0.24), 0, 0, 0));
        g.add(at(box("#ffd080", 0.16, 0.22, 0.16, { emissive: "#ffaa40" }), 0, 0, 0));
        g.position.set(d.x, d.y || 2.6, d.z);
        G.add(staticMesh(g));
        return;
      }
      case "tumbleweed": {
        const m = new THREE.Mesh(geo("tw", () => new THREE.IcosahedronGeometry(0.4, 1)), new THREE.MeshStandardMaterial({ color: "#a8885a", wireframe: true }));
        m.position.set(d.x, 0.4, d.z);
        G.add(m);
        anim.weeds.push({ m, x: d.x, z: d.z, sp: 1.2 + (d.seed % 3) * 0.6, z0: d.z });
        return;
      }
      case "windmill": {
        for (const [x, z] of [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]]) g.add(at(box("#5a3e26", 0.18, 9, 0.18), x * (1 - 0.0), 4.5, z));
        const head = new THREE.Group();
        head.position.set(0, 9.2, -0.6);
        const blades = new THREE.Group();
        for (let i = 0; i < 12; i++) {
          const bl = box("#c8b89a", 0.3, 2.2, 0.04);
          bl.position.y = 1.2;
          const piv = new THREE.Group();
          piv.rotation.z = (i * Math.PI * 2) / 12;
          piv.add(bl);
          blades.add(piv);
        }
        head.add(blades);
        head.add(at(box("#7a1a1a", 0.1, 0.9, 1.6), 0, 0, 1.2));
        g.add(head);
        g.position.set(d.x, 0, d.z);
        G.add(g);
        anim.spin.push(blades);
        return;
      }
      case "headframe": {
        for (const [x, z] of [[-1.5, -1.5], [1.5, -1.5], [-1.5, 1.5], [1.5, 1.5]]) {
          const leg = box("#5a3e26", 0.3, 12, 0.3);
          leg.position.set(x * 0.7, 6, z * 0.7);
          leg.rotation.set(z * 0.06, 0, -x * 0.06);
          g.add(leg);
        }
        const wheel = new THREE.Mesh(geo("torusW", () => new THREE.TorusGeometry(1.2, 0.12, 6, 18)), mat("#3a3a3e", { metal: 0.6 }));
        wheel.position.set(0, 12, 0);
        g.add(wheel);
        g.position.set(d.x, 0, d.z);
        G.add(g);
        anim.spin.push(wheel);
        return;
      }
      case "chairs": {
        for (let i = 0; i < 3; i++) {
          const a = i * 2.1 + d.x;
          const c = new THREE.Group();
          c.add(at(box("#4a2a18", 0.45, 0.06, 0.45), 0, 0.46, 0));
          c.add(at(box("#4a2a18", 0.45, 0.5, 0.06), 0, 0.72, 0.2));
          for (const [x, z] of [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]]) c.add(at(box("#3a2010", 0.05, 0.46, 0.05), x, 0.23, z));
          c.position.set(d.x + Math.cos(a) * 1.05, 0, d.z + Math.sin(a) * 1.05);
          c.rotation.y = -a + Math.PI / 2;
          g.add(c);
        }
        G.add(staticMesh(g));
        return;
      }
      case "shelf": {
        g.add(at(new THREE.Mesh(BOXG, plankMat(3, 4, 1)), 0, 1.8, 0));
        g.children[0].scale.set(d.w, 2.6, 0.4);
        g.add(at(box("#c8c8d0", d.w * 0.6, 1.0, 0.04, { metal: 0.9, rough: 0.05 }), 0, 2.2, 0.22));
        const cols = ["#3a6a3a", "#7a4a1a", "#8a2a1a", "#c8a050"];
        for (let i = 0; i < 20; i++) g.add(at(cyl(cols[i % 4], 0.05, 0.3, { transparent: true, opacity: 0.85, rough: 0.2 }), -d.w / 2 + 0.4 + (i * (d.w - 0.8)) / 19, i % 2 ? 1.1 : 2.95, 0.25));
        g.position.set(d.x, 0, d.z);
        G.add(staticMesh(g));
        return;
      }
      case "stairs": {
        for (let i = 0; i < 8; i++) g.add(at(box("#5a3a22", 2.2, 0.15 + i * 0.4, 0.8), 0, (0.15 + i * 0.4) / 2, -3.2 + i * 0.8));
        g.add(at(box("#3a2214", 0.1, 1, 6.4), -1.1, 3.4, 0));
        g.position.set(d.x, 0, d.z);
        G.add(staticMesh(g));
        return;
      }
      case "chandelier": {
        g.add(at(new THREE.Mesh(geo("torusC", () => new THREE.TorusGeometry(0.7, 0.05, 6, 16)), mat("#8a6a3a", { metal: 0.6 })), 0, 0, 0));
        g.children[0].rotation.x = Math.PI / 2;
        for (let i = 0; i < 6; i++) g.add(at(cyl("#fff0c0", 0.04, 0.16, { emissive: "#ffb050" }), Math.cos(i) * 0.7, 0.1, Math.sin(i) * 0.7));
        g.add(at(cyl("#3a2a1a", 0.02, 1.2), 0, 0.6, 0));
        g.position.set(d.x, d.y || 4.8, d.z);
        G.add(staticMesh(g));
        return;
      }
      case "door": {
        for (const s of [-1, 1]) {
          const dm = box("#6a4426", 0.95, 1.2, 0.06);
          dm.position.set(s * 0.5, 1.4, 0);
          g.add(dm);
        }
        g.position.set(d.x, 0, d.z);
        G.add(staticMesh(g));
        return;
      }
      case "grave": {
        const r = rngf(Math.round(d.x * 31 + d.z * 17));
        if (r() < 0.5) {
          g.add(at(box("#6a5a46", 0.1, 1.0, 0.1), 0, 0.5, 0));
          g.add(at(box("#6a5a46", 0.6, 0.1, 0.1), 0, 0.72, 0));
        } else g.add(at(box("#8a8478", 0.6, 0.8, 0.16), 0, 0.4, 0));
        g.add(at(box("#6a4e36", 0.8, 0.12, 1.6), 0, 0.05, 0.8));
        g.rotation.y = (r() - 0.5) * 0.3;
        g.position.set(d.x, 0, d.z);
        G.add(staticMesh(g));
        return;
      }
      case "bones": {
        g.add(at(sph("#e8dcc0", 0.18), 0, 0.12, 0));
        for (let i = 0; i < 5; i++) {
          const rb = box("#e8dcc0", 0.05, 0.05, 0.7);
          rb.position.set(0.3 + i * 0.15, 0.05, 0.4);
          rb.rotation.y = 0.3;
          g.add(rb);
        }
        g.position.set(d.x, 0, d.z);
        G.add(staticMesh(g));
        return;
      }
      case "arch": {
        const rm = mat("#ffffff", { map: T.rocks[2], rough: 1 });
        const a = new THREE.Mesh(geo("archT", () => new THREE.TorusGeometry(9, 1.6, 6, 18, Math.PI)), rm);
        a.position.set(d.x, 0, d.z);
        a.castShadow = true;
        G.add(staticMesh(a));
        return;
      }
      default:
        return;
    }
  }

  function buildBackdrop(G, L, th) {
    if (th.indoor) return;
    const [x0, z0, x1, z1] = L.bounds;
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const R = Math.max(x1 - x0, z1 - z0) / 2 + 60;
    const r = rngf(42);
    const rm = mat("#ffffff", { map: T.rocks[1], rough: 1 });
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2 + r() * 0.2;
      const d = R + r() * 90;
      const w = 30 + r() * 60, h = 14 + r() * 36, dd = 20 + r() * 30;
      const m = new THREE.Mesh(BOXG, rm);
      m.scale.set(w, h, dd);
      m.position.set(cx + Math.cos(a) * d, h / 2 - 1, cz + Math.sin(a) * d);
      m.rotation.y = -a;
      G.add(staticMesh(m));
      // tapered cap
      const cap = new THREE.Mesh(BOXG, rm);
      cap.scale.set(w * 0.75, h * 0.25, dd * 0.8);
      cap.position.set(m.position.x, h + h * 0.1, m.position.z);
      cap.rotation.y = -a;
      G.add(staticMesh(cap));
    }
    // scattered scrub
    const scrub = new THREE.InstancedMesh(geo("scrub", () => new THREE.IcosahedronGeometry(0.5, 0)), mat("#7a7a4a"), 160);
    const m4 = new THREE.Matrix4();
    for (let i = 0; i < 160; i++) {
      const x = x0 - 30 + r() * (x1 - x0 + 60), z = z0 - 30 + r() * (z1 - z0 + 60);
      const s = 0.4 + r() * 0.8;
      m4.compose(new THREE.Vector3(x, s * 0.3, z), new THREE.Quaternion(), new THREE.Vector3(s, s * 0.6, s));
      scrub.setMatrixAt(i, m4);
    }
    G.add(scrub);
  }

  function disposeTree(o) {
    o.traverse((n) => {
      if (n.geometry && !n.geometry.userData.shared) n.geometry.dispose?.();
      if (n.material) {
        const ms = Array.isArray(n.material) ? n.material : [n.material];
        for (const m of ms) {
          if (m.userData?.shared) continue;
          if (m.map?.userData?.owned) m.map.dispose();
          m.dispose();
        }
      }
    });
  }

  /* ---------------------------------------------------------- actors */
  function makeRig(look, weapon) {
    const rig = buildCharacter(look, { weapon });
    const blob = new THREE.Mesh(blobGeo, blobMat);
    blob.scale.setScalar(1.1);
    blob.position.y = 0.03;
    rig.blob = blob;
    return rig;
  }

  function clearLevel() {
    if (!level) return;
    scene.remove(level.group);
    disposeTree(level.group);
    level = null;
  }

  function buildLevel(L, themeName, M) {
    clearLevel();
    const th = applyTheme(themeName);
    const group = new THREE.Group();
    const statics = new THREE.Group();
    group.add(statics);
    const anim = { fires: [], weeds: [], spin: [] };
    // ground
    const gk = L.floor === "wood" ? null : L.floor || th.ground;
    if (L.floor === "wood") {
      groundMat.map = T.floor;
      groundMat.color.set("#ffffff");
    } else {
      groundMat.map = groundTex(gk === "rock" ? "rock" : gk);
      groundMat.color.set("#ffffff");
    }
    groundMat.needsUpdate = true;
    const obsMesh = new Map();
    for (const b of L.obs) {
      const m = buildObstacle(b, statics, th);
      if (m) obsMesh.set(b.id, m);
    }
    for (const d of L.deco) buildDeco(d, statics, th, anim);
    if (L.ceiling) {
      const c = new THREE.Mesh(geo("plane", () => new THREE.PlaneGeometry(1, 1)), L.floor === "rock" ? mat("#ffffff", { map: T.rocks[3], rough: 1 }) : plankMat(3, 10, 8));
      const [x0, z0, x1, z1] = L.bounds;
      c.scale.set(x1 - x0 + 4, z1 - z0 + 4, 1);
      c.rotation.x = Math.PI / 2;
      c.position.set((x0 + x1) / 2, L.ceiling, (z0 + z1) / 2);
      statics.add(staticMesh(c));
      if (L.floor === "wood")
        for (let x = x0 + 3; x < x1; x += 4) statics.add(staticMesh(at(box("#3a2414", 0.3, 0.3, z1 - z0), x, L.ceiling - 0.15, (z0 + z1) / 2)));
      if (L.floor === "rock")
        for (let z = z0 + 3; z < z1; z += 6) statics.add(staticMesh(at(box("#4a3220", x1 - x0, 0.3, 0.3), (x0 + x1) / 2, L.ceiling - 0.2, z)));
    }
    buildBackdrop(statics, L, th);
    scene.add(group);
    // dynamic groups
    const dyn = new THREE.Group();
    group.add(dyn);
    level = { group, statics, dyn, L, M, th, theme: themeName, anim, obsMesh, rigs: new Map(), npcRigs: new Map(), objMeshes: new Map(), pickups: new Map(), projectiles: [], player: null, horses: [], bars: new Map(), markers: [], alerts: new Map(), lightT: 0, train: null, t: 0 };
    // objective markers pool
    for (let i = 0; i < 6; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.marker, depthTest: false, transparent: true }));
      s.scale.set(0.6, 0.6, 1);
      s.visible = false;
      s.renderOrder = 10;
      dyn.add(s);
      level.markers.push(s);
    }
    return level;
  }

  function buildObject(o) {
    const g = new THREE.Group();
    switch (o.kind) {
      case "bottle": {
        const glass = mat("#3a7a4a", { rough: 0.15, transparent: true, opacity: 0.85 });
        g.add(at(cyl(glass, 0.06, 0.2), 0, 0.1, 0));
        g.add(at(cyl(glass, 0.025, 0.12), 0, 0.26, 0));
        break;
      }
      case "poster": {
        const m = new THREE.Mesh(geo("plane", () => new THREE.PlaneGeometry(1, 1)), new THREE.MeshStandardMaterial({ map: T.poster, roughness: 0.9 }));
        m.scale.set(0.6, 0.85, 1);
        g.add(m);
        g.rotation.y = { w: -Math.PI / 2, e: Math.PI / 2, n: 0, s: Math.PI }[o.face || "w"];
        break;
      }
      case "moneybag": {
        g.add(at(sph("#b89a62", 0.25), 0, 0.22, 0));
        g.add(at(cyl("#8a6a3a", 0.08, 0.12), 0, 0.48, 0));
        break;
      }
      case "weapon": {
        const gun = buildGun(o.wid === "dual" ? "revolver" : o.wid);
        gun.rotation.y = 0.6;
        g.add(gun);
        if (o.wid === "dual") {
          const g2 = buildGun("revolver");
          g2.position.set(0.15, 0, 0.1);
          g2.rotation.y = -0.4;
          g.add(g2);
        }
        g.userData.spin = true;
        break;
      }
      case "chest":
      case "strongbox": {
        const c = o.kind === "chest" ? "#6a4426" : "#3a3a40";
        g.add(at(box(c, 0.9, 0.5, 0.55), 0, 0.25, 0));
        const lid = new THREE.Group();
        lid.position.set(0, 0.5, 0.27);
        lid.add(at(box(c, 0.92, 0.14, 0.57), 0, 0.07, -0.27));
        g.add(lid);
        g.userData.lid = lid;
        g.add(at(box("#c8a040", 0.94, 0.06, 0.06, { metal: 0.8, rough: 0.3 }), 0, 0.3, -0.27));
        break;
      }
      case "saddlebag": {
        g.add(at(box("#6a3e20", 0.5, 0.3, 0.2), -0.2, 0.15, 0));
        g.add(at(box("#6a3e20", 0.5, 0.3, 0.2), 0.25, 0.15, 0.05));
        break;
      }
      case "maptable": {
        g.add(at(box("#5a3620", 1.6, 0.08, 1.0), 0, 0.9, 0));
        for (const [x, z] of [[-0.7, -0.4], [0.7, -0.4], [-0.7, 0.4], [0.7, 0.4]]) g.add(at(box("#3a2214", 0.08, 0.9, 0.08), x, 0.45, z));
        g.add(at(box("#e0cfa0", 1.2, 0.01, 0.7), 0, 0.95, 0));
        g.add(at(box("#8a2a1a", 0.06, 0.012, 0.06), 0.3, 0.96, -0.1));
        break;
      }
      case "hostage": {
        const rig = makeRig(o.look || "miner", null);
        g.add(rig.root);
        g.add(rig.blob);
        g.userData.rig = rig;
        // ropes
        g.add(at(box("#c8a870", 0.5, 0.06, 0.3), 0, 0.85, 0.12));
        g.userData.rope = g.children[g.children.length - 1];
        break;
      }
      case "dynamite": {
        const tnt = new THREE.Group();
        for (let i = 0; i < 4; i++) tnt.add(at(cyl("#b8281e", 0.05, 0.35), (i % 2) * 0.1 - 0.05, 0.18, Math.floor(i / 2) * 0.1 - 0.05));
        tnt.visible = false;
        g.add(tnt);
        g.userData.tnt = tnt;
        break;
      }
      default:
        return null;
    }
    g.position.set(o.x, o.y || 0, o.z);
    if (o.rot && o.kind === "hostage") g.rotation.y = o.rot;
    g.traverse((n) => {
      if (n.isMesh) n.castShadow = true;
    });
    return g;
  }

  /* ---------------------------------------------------------- public: set sim */
  let sim = null;
  function setSim(S) {
    sim = S;
    if (!S) {
      clearLevel();
      return;
    }
    const lv = buildLevel(S.L, S.M.theme, S.M);
    // player
    lv.player = makeRig("hero", S.P.w);
    lv.dyn.add(lv.player.root, lv.player.blob);
    lv.deadT = 0;
    // npcs
    for (const n of S.npcs) {
      const rig = makeRig(n.look, null);
      lv.dyn.add(rig.root, rig.blob);
      lv.npcRigs.set(n.id, rig);
    }
    for (const o of S.objects.values()) {
      const m = buildObject(o);
      if (m) {
        lv.dyn.add(m);
        lv.objMeshes.set(o.id, m);
      }
    }
  }

  function enemyRig(e) {
    let r = level.rigs.get(e.id);
    if (r) return r;
    const weapon = e.duel ? "revolver" : ENEMY_WEAPON[e.type] ?? "revolver";
    r = makeRig(e.look, weapon);
    if (e.def.mounted) {
      r.horse = buildHorse(["#6a4228", "#3a2a1e", "#8a6a4a", "#e0d8c8"][e.id % 4]);
      level.dyn.add(r.horse.root);
      r.blob.scale.setScalar(2.2);
    }
    if (e.boss) r.root.scale.multiplyScalar(1.1);
    level.dyn.add(r.root, r.blob);
    // health bar
    const bar = new THREE.Group();
    const bg = new THREE.Sprite(new THREE.SpriteMaterial({ color: "#1a0e0a", depthTest: false, transparent: true, opacity: 0.75 }));
    bg.scale.set(0.9, 0.09, 1);
    const fg = new THREE.Sprite(new THREE.SpriteMaterial({ color: e.boss ? "#ffb02a" : "#e0402a", depthTest: false }));
    fg.scale.set(0.86, 0.06, 1);
    fg.center.set(0, 0.5);
    fg.position.x = -0.43;
    bar.add(bg, fg);
    bar.renderOrder = 9;
    bg.renderOrder = 9;
    fg.renderOrder = 10;
    bar.visible = false;
    level.dyn.add(bar);
    r.bar = { g: bar, fg };
    // alert icon
    const al = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.alert, depthTest: false, transparent: true }));
    al.scale.set(0.45, 0.45, 1);
    al.visible = false;
    al.renderOrder = 11;
    level.dyn.add(al);
    r.alertS = al;
    r.alertT = 9;
    level.rigs.set(e.id, r);
    return r;
  }

  function removeRig(r) {
    level.dyn.remove(r.root, r.blob, r.bar.g, r.alertS);
    if (r.horse) level.dyn.remove(r.horse.root);
    r.bar.g.children.forEach((c) => c.material.dispose());
    r.alertS.material.dispose();
  }

  /* ---------------------------------------------------------- events → fx */
  function onEvents(S, evs) {
    if (!level) return;
    for (const e of evs) {
      switch (e.type) {
        case "fire": {
          const big = e.w === "shotgun" ? 1.5 : e.w === "rifle" ? 1.2 : 0.9;
          puff(e.mx, e.my, e.mz, { map: T.flash, color: "#ffffff", size: 0.55 * big, grow: 0.5, life: 0.06, vy: 0, opacity: 1, additive: true });
          puff(e.mx, e.my, e.mz, { color: "#d8d0c0", size: 0.22 * big, grow: 2.2, life: 0.7, vy: 0.4, opacity: 0.22 });
          muzzleLight.position.set(e.mx, e.my, e.mz);
          muzzleLight.intensity = 6 * big;
          muzzleT = 0;
          for (const p of e.tracers) tracer(e.mx, e.my, e.mz, p[0], p[1], p[2]);
          break;
        }
        case "efire": {
          puff(e.mx, e.my, e.mz, { map: T.flash, color: "#ffffff", size: e.type === "shotgunner" ? 0.8 : 0.55, grow: 0.5, life: 0.06, vy: 0, opacity: 1, additive: true });
          tracer(e.mx, e.my, e.mz, e.tx, e.ty, e.tz, e.hit ? "#ffb070" : "#ffe8a0");
          break;
        }
        case "impact": {
          const wood = e.mat !== "dirt" && e.mat !== "rock" && e.mat !== "cliff";
          spray(e.x, e.y, e.z, 7, wood ? "#d8a060" : "#c8a878", 2.2, 1.6, 0.35);
          puff(e.x, e.y, e.z, { color: wood ? "#8a6a4a" : "#c8b090", size: 0.25, grow: 2.4, life: 0.6, vy: 0.3, opacity: 0.6 });
          break;
        }
        case "hit": {
          spray(e.x, e.y, e.z, e.head ? 14 : 8, e.how === "melee" ? "#fff0c0" : "#c02a1a", 2.4, 1.6, 0.4);
          puff(e.x, e.y, e.z, { color: e.how === "melee" ? "#e8dcc0" : "#7a1a12", size: 0.25, grow: 2, life: 0.4, vy: 0.2, opacity: 0.6 });
          const r = level.rigs.get(e.id);
          if (r) r.flash = 0.12;
          break;
        }
        case "bottle": {
          spray(e.x, e.y + 0.15, e.z, 18, "#8ad8a0", 2.5, 2, 0.6);
          const m = level.objMeshes.get(e.id);
          if (m) m.visible = false;
          break;
        }
        case "explode": {
          puff(e.x, 1.2, e.z, { map: T.flash, color: "#ffffff", size: 3.5, grow: 1.5, life: 0.25, vy: 0, opacity: 1, additive: true });
          for (let i = 0; i < 9; i++) puff(e.x + (Math.random() - 0.5) * 2, 0.6 + Math.random(), e.z + (Math.random() - 0.5) * 2, { color: i < 3 ? "#ff8a3a" : "#4a3a30", size: 1.4, grow: 3, life: 1.6, vy: 1.2, vx: (Math.random() - 0.5) * 2, vz: (Math.random() - 0.5) * 2, opacity: 0.8, additive: i < 3 });
          spray(e.x, 0.5, e.z, 50, "#ffb04a", 8, 6, 0.9);
          ring(e.x, e.z, e.r || 4, "#ffd08a", 0.5);
          boomLight.position.set(e.x, 2, e.z);
          boomLight.intensity = 30;
          boomT = 0;
          break;
        }
        case "dust":
          puff(e.x, 0.2, e.z, { color: "#d8c09a", size: 0.6, grow: 2, life: 0.8, vy: 0.3, opacity: 0.5 });
          break;
        case "roll":
          for (let i = 0; i < 4; i++) puff(S.P.x + (Math.random() - 0.5), 0.2, S.P.z + (Math.random() - 0.5), { color: "#d8c09a", size: 0.6, grow: 2.2, life: 0.9, vy: 0.2, opacity: 0.55 });
          break;
        case "land":
          for (let i = 0; i < 3; i++) puff(S.P.x + (Math.random() - 0.5), 0.15, S.P.z + (Math.random() - 0.5), { color: "#d8c09a", size: 0.5, grow: 2, life: 0.7, vy: 0.2, opacity: 0.5 });
          break;
        case "punch":
          spray(e.x, 1.3, e.z, 10, "#fff4d0", 2.5, 1.5, 0.3);
          break;
        case "alert": {
          const r = level.rigs.get(e.id);
          if (r) r.alertT = 0;
          break;
        }
        case "slam":
          ring(e.x, e.z, 3.2, "#ffb070", 0.5);
          for (let i = 0; i < 8; i++) puff(e.x + Math.cos(i) * 1.5, 0.3, e.z + Math.sin(i) * 1.5, { color: "#c8a878", size: 1, grow: 2, life: 0.9, vy: 0.5, opacity: 0.6 });
          break;
        case "crash":
          spray(e.x, 1.5, e.z, 20, "#fff0c0", 3, 2, 0.5);
          break;
        case "fuse": {
          const m = level.objMeshes.get(e.id);
          if (m?.userData.tnt) m.userData.tnt.visible = true;
          break;
        }
        case "wreck": {
          const m = level.obsMesh.get(e.id);
          if (m) {
            m.traverse((n) => {
              if (n.isMesh && n.material && !n.material.userData?.charred) {
                n.material = mat("#1e1814", { rough: 1 });
                n.material.userData.charred = true;
              }
            });
            m.scale.y = 0.55;
            m.rotation.z = 0.15;
          }
          level.anim.fires.push({ x: m?.position.x ?? 0, z: m?.position.z ?? 0, y: 0.6, s: 1.2, t: 0, life: 12 });
          break;
        }
        case "gateGone": {
          const m = level.obsMesh.get(e.id);
          if (m) m.visible = false;
          break;
        }
        case "use": {
          const m = level.objMeshes.get(e.id);
          if (!m) break;
          if (["poster", "moneybag", "weapon", "saddlebag"].includes(e.kind)) m.visible = false;
          if (m.userData.lid) m.userData.lid.rotation.x = -1.6;
          break;
        }
        case "collect": {
          const m = level.objMeshes.get(e.id);
          if (m) m.visible = false;
          spray(e.x, 0.5, e.z, 14, "#ffd860", 2, 2, 0.6);
          break;
        }
        case "train":
          level.train = { t: 0, g: buildTrainArrival() };
          level.dyn.add(level.train.g);
          break;
        default:
          break;
      }
    }
  }

  function buildTrainArrival() {
    const g = new THREE.Group();
    const cars = [{ car: "loco", len: 13 }, { car: "pass", len: 12 }, { car: "pass", len: 12 }, { car: "box", len: 12 }];
    let x = 0;
    for (const c of cars) {
      const m = buildTrainCar({ x: 0, z: 0, w: c.len, d: 3, ax: "x", car: c.car });
      m.position.set(x, 0, 0);
      x += c.len + 0.8;
      g.add(m);
    }
    g.rotation.y = Math.PI;
    g.position.set(-90, 0, -16);
    return g;
  }

  /* ---------------------------------------------------------- render */
  const v3 = new THREE.Vector3();
  let shakeT = 0;
  function render(S, dt) {
    if (!level || !S) return;
    const lv = level;
    lv.t += dt;
    const P = S.P, C = S.cam;
    // ---- player
    const pr = lv.player;
    const wantW = S.step?.fists ? null : P.w;
    if (pr.weapon !== wantW) setRigWeapon(pr, wantW);
    pr.root.position.set(P.x, P.y, P.z);
    pr.root.rotation.y = P.rot;
    pr.blob.position.set(P.x, 0.03, P.z);
    pr.blob.visible = P.y < 2;
    if (!P.alive) lv.deadT += dt;
    else lv.deadT = 0;
    const meleeSt = P.melee ? { kind: P.melee.kind, i: P.melee.i, p: P.melee.t / P.melee.dur } : P.takedown ? { kind: "punch", i: 2, p: Math.min(1, P.takedown.t / 0.6) } : null;
    const aimingNow = S.duel ? (S.duel.phase === "draw" || S.duel.phase === "resolve" ? 1 : 0) : Math.max(C.aim, S.t - P.lastShot < 0.6 ? 1 : 0);
    poseRig(
      pr,
      {
        speed: P.roll ? 0 : P.moving,
        sprint: P.sprint,
        aim: wantW && !meleeSt && !P.block ? aimingNow : 0,
        pitch: C.pitch,
        crouch: P.crouch,
        air: !P.onGround,
        roll: P.roll ? Math.min(1, P.roll.t / 0.5) : null,
        melee: meleeSt,
        block: P.block,
        hurt: P.hurtT / 0.3,
        down: P.downT > 0,
        dead: P.alive ? null : lv.deadT,
        reload: P.reloadT > 0 ? 1 - P.reloadT / Math.max(0.01, P.reloadNeed) : null,
        recoil: P.shotT,
        draw: S.duel && S.duel.phase === "ready" ? -1 : null,
        cheer: S.status === "ending" && S.M.final,
      },
      dt,
    );
    // first-person-ish fade when the camera is very close
    const camD = Math.hypot(C.pos[0] - P.x, C.pos[2] - P.z);
    pr.root.visible = !(camD < 0.75 && C.pos[1] < P.y + 2.1);

    // ---- enemies
    const seen = new Set();
    for (const e of S.enemies) {
      seen.add(e.id);
      const r = enemyRig(e);
      r.flash = Math.max(0, (r.flash || 0) - dt);
      const lying = e.state === "down" || e.state === "takendown";
      if (e.def.mounted) {
        const h = r.horse;
        if (e.alive) {
          h.root.position.set(e.x, 0, e.z);
          h.root.rotation.y = e.rot;
          poseHorse(h, e.speed, dt);
          r.root.position.set(e.x, 0.05, e.z);
          r.root.rotation.y = e.rot;
          poseRig(r, { seat: true, aim: e.aimT > 0 || e.shotT < 0.5 ? 1 : 0, pitch: -0.15, recoil: e.shotT, hurt: e.hurtT / 0.22 }, dt);
        } else {
          // rider tumbles off, the horse bolts
          if (!r.bolt) r.bolt = { x: e.x, z: e.z, rot: e.rot, t: 0 };
          r.bolt.t += dt;
          r.bolt.x -= Math.sin(r.bolt.rot) * 9 * dt;
          r.bolt.z -= Math.cos(r.bolt.rot) * 9 * dt;
          h.root.position.set(r.bolt.x, 0, r.bolt.z);
          h.root.rotation.y = r.bolt.rot;
          poseHorse(h, 9, dt);
          h.root.visible = r.bolt.t < 5;
          r.root.position.set(e.x, 0, e.z);
          poseRig(r, { dead: e.deadT, fallDir: 1 }, dt);
        }
      } else {
        r.root.position.set(e.x, 0, e.z);
        r.root.rotation.y = e.rot;
        const ranged = !e.def.meleeOnly;
        const dToP = Math.hypot(P.x - e.x, P.z - e.z);
        const aim = e.duel ? (S.duel && S.duel.phase === "resolve" && S.duel.result !== "win" ? 1 : S.duel && S.duel.phase === "draw" && S.duel.t > S.duel.reaction * 0.55 ? 1 : 0) : ranged && e.alive && (e.aimT > 0 || e.burst > 0 || e.shotT < 0.6 || (e.sees && e.alert && e.speed < 1.5) || !!e.tele) ? 1 : 0;
        const pitch = Math.atan2(1.2 - 1.45, Math.max(1, dToP));
        let wind = 0;
        let melee = null;
        if (e.atk) {
          if (e.atk.t < e.atk.wind) wind = e.atk.t / e.atk.wind;
          else melee = { kind: "punch", i: e.atk.kind === "slam" ? 2 : e.id % 2, p: Math.min(1, (e.atk.t - e.atk.wind) / 0.4) };
        }
        poseRig(
          r,
          {
            speed: e.alive ? e.speed : 0,
            sprint: e.speed > 5,
            aim: e.atk ? 0 : aim,
            pitch,
            crouch: e.crouch,
            melee,
            wind,
            block: e.blockT > 0,
            hurt: e.hurtT / 0.22,
            down: lying && e.alive,
            dead: e.alive ? null : e.deadT,
            fallDir: (e.id % 3) - 1 || 1,
            recoil: e.shotT,
            tele: e.tele?.kind,
            charge: !!e.charge,
            draw: e.duel && S.duel && (S.duel.phase === "ready" || S.duel.phase === "intro" || (S.duel.phase === "draw" && S.duel.t < S.duel.reaction * 0.55)) ? -1 : null,
          },
          dt,
        );
        if (e.stunT > 0 && e.alive) r.root.rotation.y += Math.sin(lv.t * 18) * 0.12;
      }
      r.blob.position.set(e.x, 0.03, e.z);
      r.blob.visible = e.alive || e.deadT < 30;
      // hit flash
      const showBar = e.alive && e.hp < e.maxHp && !e.boss && dToCam(e) < 32 && !e.duel;
      r.bar.g.visible = showBar;
      if (showBar) {
        r.bar.g.position.set(e.x, e.def.mounted ? 3.1 : e.crouch ? 1.7 : 2.25, e.z);
        r.bar.fg.scale.x = 0.86 * Math.max(0, e.hp / e.maxHp);
      }
      r.alertT += dt;
      r.alertS.visible = e.alive && r.alertT < 1.1;
      if (r.alertS.visible) r.alertS.position.set(e.x, (e.def.mounted ? 3.3 : 2.5) + r.alertT * 0.2, e.z);
      // glint / telegraph rings
      if (e.alive && e.tele && Math.floor(lv.t * 10) % 3 === 0) ring(e.x, e.z, 1.4, "#ff4a2a", 0.2);
      if (e.alive && e.def.sniper && e.aimT > 0 && Math.floor(lv.t * 8) % 2 === 0) puff(e.x - Math.sin(e.rot) * 0.6, 1.45, e.z - Math.cos(e.rot) * 0.6, { map: T.dot, color: "#fff4c0", size: 0.35, grow: 0.5, life: 0.12, vy: 0, opacity: 1, additive: true });
    }
    for (const [id, r] of lv.rigs) {
      if (!seen.has(id)) {
        removeRig(r);
        lv.rigs.delete(id);
      }
    }
    // ---- npcs
    for (const n of S.npcs) {
      const r = lv.npcRigs.get(n.id);
      if (!r) continue;
      n.talkT = Math.max(0, (n.talkT || 0) - dt);
      r.root.position.set(n.x, 0, n.z);
      const d = Math.hypot(P.x - n.x, P.z - n.z);
      const want = d < 7 ? Math.atan2(-(P.x - n.x), -(P.z - n.z)) : n.rot;
      r.root.rotation.y += angD(r.root.rotation.y, want) * Math.min(1, dt * 4);
      r.blob.position.set(n.x, 0.03, n.z);
      poseRig(r, { speed: 0, talk: n.talkT > 0 || (S.say[0] && S.say[0].who === n.name) }, dt);
    }
    // ---- objects
    for (const o of S.objects.values()) {
      const m = lv.objMeshes.get(o.id);
      if (!m) continue;
      if (o.kind === "hostage") {
        const r = m.userData.rig;
        r.blob.position.set(0, 0.03, 0);
        poseRig(r, o.done ? { cheer: true } : { tied: true }, dt);
        m.userData.rope.visible = !o.done;
      }
      if (m.userData.spin && m.visible) m.rotation.y += dt * 1.2;
      if (o.kind === "moneybag" && m.visible) m.position.y = Math.sin(lv.t * 2 + o.x) * 0.04;
    }
    // ---- pickups
    const pseen = new Set();
    for (const k of S.pickups) {
      pseen.add(k.id);
      let m = lv.pickups.get(k.id);
      if (!m) {
        m = new THREE.Group();
        if (k.kind === "cash") {
          for (let i = 0; i < 3; i++) m.add(at(cyl("#e8b830", 0.12, 0.03, { metal: 0.8, rough: 0.3 }), (i - 1) * 0.06, 0.03 + i * 0.035, 0));
        } else if (k.kind === "ammo") {
          m.add(at(box("#5a4a2a", 0.36, 0.2, 0.26), 0, 0.1, 0));
          for (let i = 0; i < 4; i++) m.add(at(cyl("#d8a840", 0.025, 0.12, { metal: 0.8, rough: 0.3 }), -0.1 + i * 0.07, 0.25, 0));
        } else {
          m.add(at(cyl("#b8281e", 0.08, 0.22, { rough: 0.2, transparent: true, opacity: 0.9 }), 0, 0.11, 0));
          m.add(at(cyl("#e8e0d0", 0.03, 0.1), 0, 0.27, 0));
        }
        const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.dot, color: k.kind === "cash" ? "#ffd860" : k.kind === "ammo" ? "#ffc870" : "#ff6a5a", transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending }));
        glow.scale.setScalar(0.9);
        glow.position.y = 0.2;
        m.add(glow);
        m.userData.glow = glow;
        lv.dyn.add(m);
        lv.pickups.set(k.id, m);
      }
      m.position.set(k.x, 0.15 + Math.sin(lv.t * 3 + k.id) * 0.06, k.z);
      m.rotation.y += dt * 2;
    }
    for (const [id, m] of lv.pickups) {
      if (!pseen.has(id)) {
        lv.dyn.remove(m);
        m.userData.glow.material.dispose();
        lv.pickups.delete(id);
      }
    }
    // ---- projectiles
    while (lv.projectiles.length < S.projectiles.length) {
      const g = new THREE.Group();
      g.add(at(cyl("#b8281e", 0.05, 0.3), 0, 0, 0));
      g.children[0].rotation.z = 1.2;
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.dot, color: "#ffd060", blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
      sp.scale.setScalar(0.4);
      sp.position.set(0.12, 0.08, 0);
      g.add(sp);
      lv.dyn.add(g);
      lv.projectiles.push(g);
    }
    lv.projectiles.forEach((g, i) => {
      const p = S.projectiles[i];
      g.visible = !!p;
      if (!p) return;
      g.position.set(p.x, p.y + 0.06, p.z);
      g.rotation.y += dt * 6;
      g.children[1].scale.setScalar(0.3 + Math.random() * 0.3);
      if (p.y <= 0.01 && Math.random() < 0.3) ring(p.x, p.z, 3.8 * (1 - p.fuse / 2.2) + 0.2, "#ff3a1a", 0.15);
    });
    // ---- objective markers
    const marks = S.step && S.step.type !== "kill" && S.status === "play" && !S.duel ? objectiveMarkers(S) : [];
    lv.markers.forEach((s, i) => {
      const m = marks[i];
      s.visible = !!m;
      if (!m) return;
      let y = 2.6;
      if (S.step.type === "talk") y = 2.5;
      else if (S.step.type === "reach") y = 1.6;
      s.position.set(m[0], y + Math.sin(lv.t * 3 + i) * 0.12, m[1]);
      const dd = Math.hypot(m[0] - C.pos[0], m[1] - C.pos[2]);
      s.scale.setScalar(Math.min(1.6, 0.35 + dd * 0.025));
    });
    // ---- ambient animation
    for (const f of lv.anim.fires) {
      f.t += dt;
      if (f.life != null && f.t > f.life) continue;
      if (Math.random() < dt * 14 * f.s) puff(f.x + (Math.random() - 0.5) * 0.5 * f.s, f.y * 0.3 + 0.1, f.z + (Math.random() - 0.5) * 0.5 * f.s, { map: T.flash, color: Math.random() < 0.5 ? "#ff8a2a" : "#ffc04a", size: 0.6 * f.s, grow: -0.3, life: 0.5, vy: 1.2 * f.s, opacity: 0.9, additive: true });
      if (Math.random() < dt * 3 * f.s) puff(f.x, f.y + 0.8, f.z, { color: "#3a3430", size: 0.8 * f.s, grow: 2.5, life: 2.4, vy: 1.2, vx: 0.4, opacity: 0.35 });
      if (Math.random() < dt * 4) spray(f.x, f.y * 0.5 + 0.3, f.z, 1, "#ffb040", 0.3, 2, 1.2);
    }
    for (const w of lv.anim.weeds) {
      w.m.position.x += w.sp * dt;
      w.m.position.y = 0.4 + Math.abs(Math.sin(lv.t * 3 + w.z0)) * 0.3;
      w.m.rotation.z -= w.sp * dt * 2.4;
      const [x0, , x1] = lv.L.bounds;
      if (w.m.position.x > x1) w.m.position.x = x0;
    }
    for (const sp of lv.anim.spin) sp.rotation.z += dt * 0.8;
    if (lv.th.embers && Math.random() < dt * 20) spray(P.x + (Math.random() - 0.5) * 30, 0.5, P.z + (Math.random() - 0.5) * 30, 1, "#ff7a2a", 0.6, 2.5, 3);
    if (!lv.th.indoor && Math.random() < dt * 1.5) puff(P.x + (Math.random() - 0.5) * 24, 0.25, P.z + (Math.random() - 0.5) * 24, { color: "#d8c09a", size: 1.4, grow: 1.5, life: 2.5, vx: 1.2, vy: 0.05, opacity: 0.18 });
    if (lv.train) {
      lv.train.t += dt;
      const k = Math.min(1, lv.train.t / 9);
      lv.train.g.position.x = -90 + 92 * (1 - Math.pow(1 - k, 3));
      if (k < 1 && Math.random() < dt * 8) puff(lv.train.g.position.x - 4.5, 5, -16, { color: "#5a5450", size: 1.2, grow: 3, life: 2.2, vy: 1.5, opacity: 0.5 });
    }

    // ---- point light pool (nearest lamps / fires)
    lv.lightT -= dt;
    if (lv.lightT <= 0) {
      lv.lightT = 0.3;
      const ls = [...lv.L.lights].sort((a, b) => (a.x - P.x) ** 2 + (a.z - P.z) ** 2 - ((b.x - P.x) ** 2 + (b.z - P.z) ** 2));
      lightPool.forEach((pl, i) => {
        pl.src = ls[i] || null;
        if (pl.src) {
          pl.l.position.set(pl.src.x, pl.src.y, pl.src.z);
          pl.l.color.set(pl.src.color);
          pl.l.distance = pl.src.d;
        }
      });
    }
    const night = lv.th.sunI < 2 || lv.th.indoor;
    for (const pl of lightPool) {
      if (!pl.src) {
        pl.l.intensity = 0;
        continue;
      }
      const base = pl.src.i * (night ? 2.2 : pl.src.lamp ? 0 : 0.8) * 3;
      pl.l.intensity = base * (pl.src.flicker ? 0.85 + Math.sin(lv.t * 13 + pl.src.x) * 0.08 + Math.random() * 0.07 : 1);
    }
    // ---- fx update
    muzzleT += dt;
    muzzleLight.intensity = muzzleT < 0.06 ? muzzleLight.intensity : 0;
    boomT += dt;
    boomLight.intensity = Math.max(0, 30 * (1 - boomT / 0.4));
    for (const T2 of tracers) {
      if (!T2.l.visible) continue;
      T2.t += dt;
      T2.l.material.opacity = Math.max(0, 0.9 - T2.t / 0.07);
      if (T2.t > 0.08) T2.l.visible = false;
    }
    for (const p of sprites) {
      if (!p.s.visible) continue;
      p.t += dt;
      if (p.t >= p.life) {
        p.s.visible = false;
        continue;
      }
      const k = p.t / p.life;
      p.s.position.x += p.vx * dt;
      p.s.position.y += p.vy * dt;
      p.s.position.z += p.vz * dt;
      p.s.scale.setScalar(Math.max(0.01, p.size * (1 + p.grow * k)));
      p.s.material.opacity = p.op * (1 - k) * Math.min(1, k * 8 + 0.3);
    }
    for (let i = 0; i < NS; i++) {
      if (spLife[i] <= 0) continue;
      spLife[i] -= dt;
      spVel[i * 3 + 1] -= 9 * dt;
      spPos[i * 3] += spVel[i * 3] * dt;
      spPos[i * 3 + 1] += spVel[i * 3 + 1] * dt;
      spPos[i * 3 + 2] += spVel[i * 3 + 2] * dt;
      if (spPos[i * 3 + 1] < 0.02) {
        spPos[i * 3 + 1] = 0.02;
        spVel[i * 3] *= 0.5;
        spVel[i * 3 + 2] *= 0.5;
      }
      if (spLife[i] <= 0) spPos[i * 3 + 1] = -999;
    }
    spGeo.attributes.position.needsUpdate = true;
    spGeo.attributes.color.needsUpdate = true;
    for (const R of rings) {
      if (!R.m.visible) continue;
      R.t += dt;
      const k = R.t / R.dur;
      if (k >= 1) {
        R.m.visible = false;
        continue;
      }
      R.m.scale.setScalar(R.r * (0.3 + 0.7 * k));
      R.m.material.opacity = 0.8 * (1 - k);
    }

    // ---- camera
    const fovT = C.fov;
    if (Math.abs(camera.fov - fovT) > 0.01) {
      camera.fov += (fovT - camera.fov) * Math.min(1, dt * 12);
      camera.updateProjectionMatrix();
    }
    shakeT += dt;
    const sk = C.shake * 0.06;
    if (C.cine) {
      camera.position.set(C.cine.pos[0], C.cine.pos[1], C.cine.pos[2]);
      camera.lookAt(C.cine.target[0], C.cine.target[1], C.cine.target[2]);
    } else {
      camera.position.set(C.pos[0] + Math.sin(shakeT * 41) * sk, C.pos[1] + Math.sin(shakeT * 37) * sk, C.pos[2]);
      camera.rotation.set(C.pitch + Math.sin(shakeT * 29) * sk * 0.3, C.yaw, 0, "YXZ");
    }
    // sun & shadow box follow the player
    const sd = lv.th.sun;
    v3.set(sd[0], sd[1], sd[2]).normalize();
    sun.position.set(P.x + v3.x * 70, v3.y * 70, P.z + v3.z * 70);
    sun.target.position.set(P.x, 0, P.z);
    sky.position.copy(camera.position);
    stars.position.copy(camera.position);
    renderer.render(scene, camera);
  }

  function dToCam(e) {
    return Math.hypot(camera.position.x - e.x, camera.position.z - e.z);
  }

  /* ---------------------------------------------------------- menu backdrop */
  let menu = null;
  function setMenu(missionId = 4, theme = "sunset") {
    sim = null;
    const M = MISSION_BY_ID[missionId];
    const L = buildMission(M);
    const lv = buildLevel(L, theme, M);
    const hero = makeRig("hero", "revolver");
    hero.root.position.set(2.3, 0, 9.4);
    hero.root.rotation.y = 0.15;
    lv.dyn.add(hero.root);
    const foe = makeRig("gunslinger", "revolver");
    foe.root.position.set(0, 0, -16);
    foe.root.rotation.y = 0;
    lv.dyn.add(foe.root);
    const horse = buildHorse("#4a2e1c");
    horse.root.position.set(-5.5, 0, 9);
    horse.root.rotation.y = 0.4;
    lv.dyn.add(horse.root);
    menu = { lv, hero, foe, horse, t: 0 };
  }
  function renderMenu(dt) {
    if (!menu || !level) return;
    menu.t += dt;
    const t = menu.t;
    poseRig(menu.hero, { speed: 0, draw: -1 }, dt);
    poseRig(menu.foe, { speed: 0, draw: -1 }, dt);
    poseHorse(menu.horse, 0, dt);
    camera.position.set(-0.6 + Math.sin(t * 0.09) * 1.1, 1.7 + Math.sin(t * 0.2) * 0.08, 14 + Math.cos(t * 0.07) * 0.6);
    camera.lookAt(1.4, 1.55, 0);
    if (camera.fov !== 50) {
      camera.fov = 50;
      camera.updateProjectionMatrix();
    }
    for (const w of level.anim.weeds) {
      w.m.position.x += w.sp * dt;
      w.m.rotation.z -= w.sp * dt * 2.4;
      if (w.m.position.x > level.L.bounds[2]) w.m.position.x = level.L.bounds[0];
    }
    if (Math.random() < dt * 2) puff((Math.random() - 0.5) * 20, 0.25, (Math.random() - 0.5) * 20, { color: "#e8b88a", size: 1.6, grow: 1.5, life: 3, vx: 1.2, vy: 0.05, opacity: 0.2 });
    for (const p of sprites) {
      if (!p.s.visible) continue;
      p.t += dt;
      if (p.t >= p.life) {
        p.s.visible = false;
        continue;
      }
      const k = p.t / p.life;
      p.s.position.x += p.vx * dt;
      p.s.position.y += p.vy * dt;
      p.s.scale.setScalar(p.size * (1 + p.grow * k));
      p.s.material.opacity = p.op * (1 - k) * Math.min(1, k * 8 + 0.3);
    }
    const sd = level.th.sun;
    v3.set(sd[0], sd[1], sd[2]).normalize();
    sun.position.set(v3.x * 70, v3.y * 70, v3.z * 70);
    sun.target.position.set(0, 0, 0);
    sky.position.copy(camera.position);
    renderer.render(scene, camera);
  }
  function clearMenu() {
    menu = null;
  }

  /* ---------------------------------------------------------- misc */
  function resize(w, h) {
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  const pv = new THREE.Vector3();
  function project(x, y, z) {
    pv.set(x, y, z).project(camera);
    if (pv.z > 1) return null;
    const el = renderer.domElement;
    return { x: (pv.x * 0.5 + 0.5) * el.clientWidth, y: (-pv.y * 0.5 + 0.5) * el.clientHeight };
  }
  function setQuality(q) {
    const low = q === "low";
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, low ? 1 : 1.75));
    sun.shadow.mapSize.set(low ? 1024 : 2048, low ? 1024 : 2048);
    sun.shadow.map?.dispose();
    sun.shadow.map = null;
    renderer.shadowMap.enabled = q !== "off";
  }
  function dispose() {
    clearLevel();
    for (const t of [...T.planks, T.plankH, T.crate, T.adobe, T.log, T.canvas, T.canvasRed, T.road, T.floor, ...T.rocks, T.dot, T.flash, T.smoke, T.blob, T.marker, T.alert, T.poster, ...T.signs.values(), ...T.grounds.values()]) t.dispose();
    for (const T2 of tracers) {
      T2.l.geometry.dispose();
      T2.l.material.dispose();
    }
    for (const p of sprites) p.s.material.dispose();
    spGeo.dispose();
    sparks.material.dispose();
    ringGeo.dispose();
    rings.forEach((R) => R.m.material.dispose());
    starGeo.dispose();
    stars.material.dispose();
    moon.material.dispose();
    sky.geometry.dispose();
    skyMat.dispose();
    ground.geometry.dispose();
    groundMat.dispose();
    blobMat.dispose();
    disposeCaches();
    renderer.dispose();
    renderer.domElement.remove();
  }

  return { setSim, render, onEvents, resize, project, dispose, setMenu, renderMenu, clearMenu, setQuality, renderer, scene, camera, get level() {
    return level;
  } };
}

function angD(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}
