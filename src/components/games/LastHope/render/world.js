/**
 * Last Hope — the WebGL world. One renderer for the whole game; it never owns
 * game state, it mirrors a sim G every frame.
 *
 * Camera: fixed-angle isometric follow (yaw 45°, pitch ~52°, perspective
 * with a narrow FOV), zoomable, a gentle look-ahead toward the aim, shake on
 * impacts. Anything between camera and survivor is dithered away by the
 * shared cut-out patch (materials.js), roofs fade while you're inside.
 *
 * Lighting: sun / moon directional with a shadow box following the player,
 * hemisphere sky light, day-night colour grading, fog, a flashlight at night
 * and underground, a small pool of point lights handed to the nearest
 * emitters (fires, lamps, muzzle flashes, explosions) plus additive light
 * pools on the ground for the rest. Weather: rain streaks + wet ground, fog.
 *
 * Quality (low | medium | high) sets pixel ratio, MSAA, shadow map size,
 * grass density, particle budgets, point-light count and visible zombie rigs.
 */
import * as THREE from "three";
import { getMap } from "../data/locations/index.js";
import { ITEMS } from "../data/items.js";
import { PIECES } from "../data/structures.js";
import { isNight } from "../engine/zombies.js";
import { buildLocation, modelGeo, disposeModelCache } from "./location.js";
import { STRUCT_MODELS } from "./models/structures.js";
import { builder } from "./models/builder.js";
import { materials, CUT, disposeMaterials } from "./materials.js";
import { createFx } from "./fx.js";
import { createOverlay } from "./overlay.js";
import { loadCharacters, createCharacter, survivorLook, gearKey, zombieLook } from "./characters.js";
import { disposeTextures, setAnisotropy } from "./textures.js";

export const CAM_YAW = Math.PI / 4;
const PITCH = 0.92;
const QUAL = {
  low: { pr: 1, aa: false, shadow: 1024, lights: 2, rigs: 10 },
  medium: { pr: 1.5, aa: true, shadow: 2048, lights: 4, rigs: 18 },
  high: { pr: 2, aa: true, shadow: 4096, lights: 6, rigs: 26 },
};

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _c = new THREE.Color();
const _c2 = new THREE.Color();
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerpAngle = (a, b, t) => {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
};

/** Day-night colour keys: [hour, sunCol, sunI, hemiSky, hemiGround, hemiI, fog, exposure] */
const SKY = [
  [0, "#a8baf0", 1.15, "#6274a8", "#262c3a", 0.95, "#1e283c", 1.3],
  [4.5, "#a8baf0", 1.05, "#5c6c9c", "#262c3a", 0.9, "#202a3a", 1.28],
  [6, "#ffb07a", 1.6, "#d09a8a", "#4a4030", 0.7, "#9a8a80", 1.12],
  [8, "#fff1d8", 2.9, "#c4dcf2", "#5a5440", 1.05, "#b8c8cc", 1.18],
  [13, "#fffaf0", 3.2, "#cce0f4", "#5e5842", 1.1, "#c0ccd0", 1.2],
  [17.5, "#ffe4b8", 2.8, "#d0ccd8", "#5a5038", 1.0, "#c0bcb4", 1.2],
  [19.3, "#ff9a5a", 1.9, "#c89080", "#4a3a2a", 0.8, "#9a7a6a", 1.15],
  [20.6, "#a0a8e0", 1.0, "#5c5e90", "#262632", 0.9, "#2a2a40", 1.25],
  [24, "#a8baf0", 1.15, "#6274a8", "#262c3a", 0.95, "#1e283c", 1.3],
];
function skyAt(h) {
  let a = SKY[0];
  let b = SKY[1];
  for (let i = 0; i < SKY.length - 1; i++)
    if (h >= SKY[i][0] && h <= SKY[i + 1][0]) {
      a = SKY[i];
      b = SKY[i + 1];
      break;
    }
  const t = (h - a[0]) / (b[0] - a[0] || 1);
  const col = (i) => _c.set(a[i]).lerp(_c2.set(b[i]), t).clone();
  return { sun: col(1), sunI: a[2] + (b[2] - a[2]) * t, sky: col(3), gnd: col(4), hemiI: a[5] + (b[5] - a[5]) * t, fog: col(6), exp: a[7] + (b[7] - a[7]) * t };
}

/* ======================================================================= */
export function createWorld(host, { quality = "medium", preserve = false, onContextLost, onContextRestored, onLoad } = {}) {
  let Q = QUAL[quality] ? quality : "medium";
  let cfg = QUAL[Q];
  const canvas = document.createElement("canvas");
  canvas.className = "lh-canvas";
  host.appendChild(canvas);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: cfg.aa, powerPreference: "high-performance", preserveDrawingBuffer: preserve });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  setAnisotropy(Math.min(8, renderer.capabilities.getMaxAnisotropy()));
  const lost = (e) => {
    e.preventDefault();
    onContextLost?.();
  };
  canvas.addEventListener("webglcontextlost", lost);
  canvas.addEventListener("webglcontextrestored", () => onContextRestored?.());

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog("#b8c8cc", 34, 90);
  scene.background = new THREE.Color("#b8c8cc");
  const camera = new THREE.PerspectiveCamera(30, 1, 1, 260);
  scene.add(camera);
  materials();

  // ---------------------------------------------------------------- lights
  const hemi = new THREE.HemisphereLight("#bcd4ec", "#4a4436", 1);
  const sun = new THREE.DirectionalLight("#ffffff", 2.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(cfg.shadow, cfg.shadow);
  const sc = sun.shadow.camera;
  sc.left = -30;
  sc.right = 30;
  sc.top = 30;
  sc.bottom = -30;
  sc.near = 1;
  sc.far = 120;
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.04;
  scene.add(hemi, sun, sun.target);
  const flash = new THREE.SpotLight("#fff2d8", 0, 17, 0.7, 0.6, 1.4);
  scene.add(flash, flash.target);
  const pool = [];
  function makePool() {
    for (const l of pool) scene.remove(l);
    pool.length = 0;
    for (let i = 0; i < cfg.lights; i++) {
      const l = new THREE.PointLight("#ffcc88", 0, 12, 1.6);
      scene.add(l);
      pool.push(l);
    }
  }
  makePool();

  let fx = createFx(scene, Q);
  const overlay = createOverlay(host);

  // ---------------------------------------------------------------- characters
  let assets = null;
  let assetsErr = null;
  loadCharacters()
    .then((a) => {
      assets = a;
      onLoad?.(true);
    })
    .catch((e) => {
      assetsErr = e;
      console.error("[LastHope] character assets failed", e);
      onLoad?.(false);
    });
  let player = null;
  let playerGear = "";
  const rigs = new Map(); // zombie id → rig
  const spareRigs = new Map(); // look key → [rig]
  let rigBudget = 0;

  // simple fallback capsule when assets fail
  function fallbackRig(color) {
    const g = new THREE.Group();
    const m = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 1.1, 4, 10), new THREE.MeshStandardMaterial({ color }));
    m.position.y = 0.85;
    m.castShadow = true;
    g.add(m);
    return { root: g, fallback: true, anim: null, setWeapon() {}, setHit() {}, tick() {}, zombify() {}, aim() {}, dispose: () => (m.geometry.dispose(), m.material.dispose()) };
  }

  // ---------------------------------------------------------------- dynamic world objects
  const dyn = new THREE.Group();
  scene.add(dyn);
  const M = materials();
  // pickups (loot sacks)
  const sackGeo = (() => {
    const B = builder(6001);
    B.ico("m", "#7a6a48", [0.22, 1], [0, 0.2, 0], { s: [1, 0.85, 1], lump: 0.2 });
    B.cyl("m", "#5a4a32", [0.05, 0.08, 0.12, 6], [0, 0.4, 0]);
    return B.build();
  })();
  const sackIMs = Object.entries(sackGeo).map(([b, g]) => {
    const im = new THREE.InstancedMesh(g, M.plain[b], 64);
    im.count = 0;
    im.castShadow = true;
    im.frustumCulled = false;
    dyn.add(im);
    return im;
  });
  // projectiles
  const arrowGeo = (() => {
    const B = builder(6011);
    B.cyl("m", "#8a6a44", [0.012, 0.012, 0.7, 5], [0, 0, 0], { r: [Math.PI / 2, 0, 0] });
    B.cone("x", "#9aa0a6", [0.025, 0.08, 5], [0, 0, 0.38], { r: [Math.PI / 2, 0, 0] });
    B.box("m", "#c8c0a8", [0.06, 0.005, 0.1], [0, 0, -0.32]);
    return B.build();
  })();
  const projPool = [];
  const tracerMat = new THREE.MeshBasicMaterial({ color: "#ffe2a0", transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
  const tracerGeo = new THREE.BoxGeometry(0.04, 0.04, 1.6);
  const spitMat = new THREE.MeshStandardMaterial({ color: "#9aff3a", emissive: "#6aff1a", emissiveIntensity: 1.5 });
  const spitGeo = new THREE.SphereGeometry(0.16, 10, 8);
  function projMesh(kind) {
    let p = projPool.find((q) => !q.used && q.kind === kind);
    if (!p) {
      let obj;
      if (kind === "arrow") {
        obj = new THREE.Group();
        for (const [b, g] of Object.entries(arrowGeo)) obj.add(new THREE.Mesh(g, M.plain[b]));
      } else if (kind === "bullet") obj = new THREE.Mesh(tracerGeo, tracerMat);
      else obj = new THREE.Mesh(spitGeo, spitMat);
      dyn.add(obj);
      p = { kind, obj, used: false };
      projPool.push(p);
    }
    p.used = true;
    p.obj.visible = true;
    return p;
  }
  // structures (instanced per kind+tier, rebuilt when the layout changes)
  const structGroup = new THREE.Group();
  dyn.add(structGroup);
  const structGeoCache = new Map();
  const sgeo = (k, t) => {
    const key = `${k}:${t}`;
    if (!structGeoCache.has(key)) structGeoCache.set(key, STRUCT_MODELS[k](t));
    return structGeoCache.get(key);
  };
  let structSig = "";
  const doorLeaves = new Map(); // sid → {grp, ang}
  const fires = []; // campfires positions
  function rebuildStructures(G) {
    for (const c of [...structGroup.children]) {
      structGroup.remove(c);
      if (c.isInstancedMesh) c.dispose();
    }
    doorLeaves.clear();
    fires.length = 0;
    if (G.loc !== "camp") return;
    const groups = new Map();
    for (const s of G.structures) {
      const key = `${s.kind}:${s.tier}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(s);
      if (s.kind === "campfire") fires.push(s);
      if (PIECES[s.kind].door) {
        const grp = new THREE.Group();
        for (const [b, g] of Object.entries(sgeo("doorLeaf", s.tier))) {
          const mesh = new THREE.Mesh(g, M[b]);
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          grp.add(mesh);
        }
        grp.position.set(s.x, 0, s.z);
        grp.rotation.y = s.yaw;
        // hinge at the low-z end of the edge
        const hinge = new THREE.Group();
        hinge.position.set(0, 0, -0.86);
        grp.children.slice().forEach((c) => hinge.add(c));
        grp.add(hinge);
        structGroup.add(grp);
        doorLeaves.set(s.id, { grp, hinge, ang: s.open ? 1 : 0 });
      }
    }
    for (const [key, list] of groups) {
      const [k, t] = key.split(":");
      const geo = sgeo(k, +t);
      for (const [b, g] of Object.entries(geo)) {
        const im = new THREE.InstancedMesh(g, M[b], list.length);
        list.forEach((s, i) => {
          _v.set(s.x, 0, s.z);
          const m = new THREE.Matrix4().compose(_v, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), s.yaw), new THREE.Vector3(1, 1, 1));
          im.setMatrixAt(i, m);
        });
        im.castShadow = true;
        im.receiveShadow = true;
        im.frustumCulled = false;
        im.userData.list = list;
        im.userData.bucket = b;
        structGroup.add(im);
      }
    }
  }
  // build-mode ghost
  const ghostMat = new THREE.MeshStandardMaterial({ color: "#5aff8a", transparent: true, opacity: 0.45, emissive: "#2aff6a", emissiveIntensity: 0.4, depthWrite: false });
  const ghost = new THREE.Group();
  ghost.visible = false;
  scene.add(ghost);
  let ghostKey = "";
  const zoneLine = (() => {
    const pts = [];
    const Z = 18;
    for (const [x, z] of [
      [-Z, -Z],
      [Z, -Z],
      [Z, Z],
      [-Z, Z],
      [-Z, -Z],
    ])
      pts.push(new THREE.Vector3(x, 0.06, z));
    const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineDashedMaterial({ color: "#ffd86a", dashSize: 0.8, gapSize: 0.5, transparent: true, opacity: 0.8 }));
    l.computeLineDistances();
    l.visible = false;
    scene.add(l);
    return l;
  })();
  const gridHelper = new THREE.GridHelper(36, 18, "#ffd86a", "#ffd86a");
  gridHelper.material.transparent = true;
  gridHelper.material.opacity = 0.12;
  gridHelper.position.y = 0.05;
  gridHelper.visible = false;
  scene.add(gridHelper);
  // animals
  const animalRigs = new Map();
  function animalRig(a) {
    const B = builder(7001 + (a.t === "deer" ? 0 : 1));
    const deer = a.t === "deer";
    const body = deer ? "#8a6240" : "#9a8a72";
    const s = deer ? 1 : 0.35;
    B.ico("m", body, [0.42 * s, 1], [0, 0.95 * s, 0], { s: [0.75, 0.7, 1.45], lump: 0.1 });
    B.ico("m", body, [0.17 * s, 1], [0, 1.5 * s, 0.6 * s], { s: [0.8, 0.9, 1.4] });
    B.beam("m", body, [0, 1.05 * s, 0.42 * s], [0, 1.45 * s, 0.56 * s], 0.11 * s);
    B.ico("m", "#e8e0d0", [0.08 * s, 0], [0, 1.0 * s, -0.6 * s]);
    if (deer)
      for (const sx of [-1, 1]) {
        B.beam("m", "#c8b090", [sx * 0.06, 1.65, 0.62], [sx * 0.2, 1.95, 0.55], 0.018);
        B.beam("m", "#c8b090", [sx * 0.15, 1.82, 0.58], [sx * 0.28, 1.9, 0.72], 0.014);
      }
    else for (const sx of [-1, 1]) B.box("m", body, [0.05, 0.28, 0.08], [sx * 0.05, 0.7, 0.22], { r: [0.2, 0, sx * 0.2] });
    const g = new THREE.Group();
    for (const [b, geo] of Object.entries(B.build())) {
      const mesh = new THREE.Mesh(geo, M.plain[b]);
      mesh.castShadow = true;
      g.add(mesh);
    }
    const legs = [];
    const legGeo = new THREE.CylinderGeometry(0.035 * (deer ? 1 : 0.6), 0.025 * (deer ? 1 : 0.6), 0.8 * s, 5);
    legGeo.translate(0, -0.4 * s, 0);
    const legMat = new THREE.MeshStandardMaterial({ color: body, roughness: 0.85 });
    for (const [x, z] of [
      [-0.16, 0.38],
      [0.16, 0.38],
      [-0.16, -0.4],
      [0.16, -0.4],
    ]) {
      const l = new THREE.Mesh(legGeo, legMat);
      l.position.set(x * s, 0.82 * s, z * s);
      l.castShadow = true;
      g.add(l);
      legs.push(l);
    }
    dyn.add(g);
    return { g, legs, phase: Math.random() * 6, dispose: () => (dyn.remove(g), legGeo.dispose(), legMat.dispose(), g.children.forEach((c) => c.geometry !== legGeo && c.geometry.dispose())) };
  }
  // felled trees
  const falling = [];

  // ---------------------------------------------------------------- rain
  const RAIN_N = 1400;
  const rainGeo = new THREE.BufferGeometry();
  const rainPos = new Float32Array(RAIN_N * 6);
  rainGeo.setAttribute("position", new THREE.BufferAttribute(rainPos, 3));
  const rain = new THREE.LineSegments(rainGeo, new THREE.LineBasicMaterial({ color: "#a8b8c8", transparent: true, opacity: 0.35 }));
  rain.frustumCulled = false;
  rain.visible = false;
  scene.add(rain);
  const drops = Array.from({ length: RAIN_N }, () => ({ x: (Math.random() - 0.5) * 60, y: Math.random() * 22, z: (Math.random() - 0.5) * 60 }));

  // ---------------------------------------------------------------- location state
  let L = null;
  let locKey = "";
  let curG = null;
  const cam = { x: 0, z: 0, look: { x: 0, z: 0 }, shake: 0, zoom: 18, zoomT: 18, orbit: 0 };
  let hurt = 0;
  let lightFlash = [];
  let lastDt = 0.016;
  let t = 0;
  let W = 1;
  let H = 1;

  function loadLocation(G) {
    if (L) {
      scene.remove(L.group);
      L.dispose();
    }
    for (const [, r] of rigs) releaseRig(r);
    rigs.clear();
    for (const [, a] of animalRigs) a.dispose();
    animalRigs.clear();
    for (const f of falling) dyn.remove(f.obj);
    falling.length = 0;
    fx.clear();
    overlay.clear();
    const map = getMap(G.loc);
    L = buildLocation(map, Q, G.R.col);
    scene.add(L.group);
    locKey = `${G.loc}:${Q}`;
    structSig = "";
    cam.x = G.P.x;
    cam.z = G.P.z;
    cam.look.x = cam.look.z = 0;
  }

  /* -------------------------------------------------------------- rigs */
  function lookKey(z) {
    return `${z.t}:${z.boss || ""}:${z.v % 6}`;
  }
  function acquireRig(z) {
    const key = lookKey(z);
    const spare = spareRigs.get(key);
    if (spare && spare.length) {
      const r = spare.pop();
      r.root.visible = true;
      return r;
    }
    if (!assets) return null;
    if (rigBudget <= 0) return null;
    rigBudget--;
    const r = createCharacter(assets, zombieLook(z.t, z.v % 6, z.boss));
    r.key = key;
    dyn.add(r.root);
    return r;
  }
  function releaseRig(r) {
    r.root.visible = false;
    if (!spareRigs.has(r.key)) spareRigs.set(r.key, []);
    spareRigs.get(r.key).push(r);
  }

  /* -------------------------------------------------------------- events → effects */
  function handleEvents(G) {
    const P = G.P;
    for (const e of G.events) {
      switch (e.t) {
        case "zhit": {
          const z = G.R.zombies.find((q) => q.id === e.id);
          const y = z ? 1.2 * (z.scale || 1) : 1.2;
          fx.hit(e.x, y, e.z, z?.t === "toxic" ? "toxic" : e.armored ? "armored" : "flesh", e.crit);
          overlay.number(e.x, y + 0.6, e.z, String(e.amount), e.crit ? "crit" : "dmg");
          if (z) z.rFlash = 1;
          break;
        }
        case "ahit":
          fx.hit(e.x, 0.8, e.z, "flesh", e.crit);
          overlay.number(e.x, 1.4, e.z, String(e.amount), "dmg");
          break;
        case "phit":
          hurt = Math.min(1, hurt + 0.35 + e.amount / 40);
          overlay.number(P.x, 2.1, P.z, `-${e.amount}`, "hurt");
          cam.shake = Math.max(cam.shake, 0.25);
          break;
        case "gather": {
          const kind = e.kind === "tree" ? "wood" : e.kind === "rock" ? "stone" : e.kind === "scrap" ? "metal" : "leaf";
          const hy = e.kind === "tree" ? 1.2 : 0.6;
          fx.chips(e.x + (P.x - e.x) * 0.3, hy, e.z + (P.z - e.z) * 0.3, kind, 7);
          fx.puff(e.x + (P.x - e.x) * 0.3, hy - 0.3, e.z + (P.z - e.z) * 0.3, e.kind === "bush" ? "leaf" : "dust", 3, { s1: 0.8 });
          if (e.kind === "rock" || e.kind === "scrap") fx.sparks(e.x + (P.x - e.x) * 0.35, hy, e.z + (P.z - e.z) * 0.35, 4);
          cam.shake = Math.max(cam.shake, 0.06);
          break;
        }
        case "gatherFail":
          fx.sparks(e.x, 0.8, e.z, 5);
          break;
        case "deplete":
          if (e.kind === "tree") fellTree(e);
          else fx.puff(e.x, 0.3, e.z, e.kind === "rock" ? "stone" : "dust", 10, { s1: 1.4 });
          break;
        case "pickup":
          if (e.n > 0) overlay.popup(P.x, 2.3, P.z, `+${e.n} ${ITEMS[e.id]?.name || e.id}`, `lh-pop--${ITEMS[e.id]?.cat || "misc"}`);
          break;
        case "shot": {
          const mz = player?.muzzleWorld?.(_v2) || _v2.set(e.x, 1.3, e.z);
          fx.muzzle(mz.x, mz.y, mz.z, e.yaw, e.kind === "gun" && e.id === "rifle");
          if (e.kind === "gun") lightFlash.push({ x: mz.x, y: mz.y, z: mz.z, color: "#ffc070", i: 6, r: 10, t: 0.07 });
          break;
        }
        case "impact":
          if (e.kind === "bullet") fx.sparks(e.x, 1.2, e.z, 6);
          else fx.puff(e.x, 1, e.z, e.kind === "spit" ? "toxic" : "dust", 4);
          break;
        case "explode":
          fx.explosion(e.x, e.z, e.r);
          lightFlash.push({ x: e.x, y: 2, z: e.z, color: "#ffa040", i: 40, r: 22, t: 0.45 });
          break;
        case "slam":
          fx.slamDust(e.x, e.z, e.r);
          break;
        case "shake":
          cam.shake = Math.max(cam.shake, e.k * 0.6);
          break;
        case "zdie":
          fx.puff(e.x, 0.6, e.z, e.type === "toxic" ? "toxic" : "ash", e.boss ? 30 : 10, { s1: 1.4, spread: 2 });
          break;
        case "adie":
          fx.puff(e.x, 0.5, e.z, "dust", 8);
          break;
        case "build":
        case "upgrade":
        case "demolish":
          fx.puff(e.x, 0.3, e.z, "dust", 14, { s1: 1.6, spread: 2.2 });
          break;
        case "shit":
          fx.chips(e.x, 1.2, e.z, e.tier === 2 ? "metal" : e.tier === 1 ? "stone" : "wood", 4);
          break;
        case "sbreak":
          fx.chips(e.x, 1.0, e.z, "wood", 18);
          fx.puff(e.x, 0.6, e.z, "dust", 16, { s1: 1.8, spread: 2.5 });
          break;
        case "level":
          fx.levelUp(P.x, P.z);
          break;
        case "splat":
          fx.puff(P.x, 1.2, P.z, "toxic", 10);
          break;
        case "zstun":
          fx.puff(e.x, 1.6, e.z, "dust", 12, { spread: 2 });
          break;
        case "spit":
          fx.puff(e.x, 1.6, e.z, "toxic", 4, { spread: 0.6 });
          break;
        case "unlockDoor":
          fx.puff(e.x, 1, e.z, "dust", 18, { spread: 2.5, s1: 1.8 });
          break;
        case "respawn":
        case "enter":
          hurt = 0;
          break;
      }
    }
  }

  function fellTree(e) {
    const info = L.nodeGeo(e.node);
    if (!info?.geo) return;
    const g = new THREE.Group();
    for (const [b, geo] of Object.entries(info.geo)) {
      if (b === "b") continue;
      const mesh = new THREE.Mesh(geo, M.plain[b]);
      mesh.castShadow = true;
      g.add(mesh);
    }
    g.position.set(e.x, 0, e.z);
    g.scale.setScalar(info.n.s);
    const P = curG.P;
    const away = Math.atan2(e.x - P.x, e.z - P.z);
    const pivot = new THREE.Group();
    pivot.position.set(e.x, 0.3, e.z);
    pivot.rotation.y = away;
    g.position.set(0, -0.3, 0);
    pivot.add(g);
    dyn.add(pivot);
    falling.push({ obj: pivot, inner: g, t: 0 });
  }

  /* -------------------------------------------------------------- per-frame */
  function render(G, dt, opts = {}) {
    lastDt = dt;
    t += dt;
    rigBudget = 2;
    if (G !== curG || !L || `${G.loc}:${Q}` !== locKey) {
      curG = G;
      loadLocation(G);
    }
    const P = G.P;
    const R = G.R;
    const map = R.map;
    const menu = opts.mode === "menu";
    const bunker = map.biome === "bunker";
    CUT.uTime.value = t;

    // ---------------------------------------------------------------- lighting & weather
    const S = skyAt(G.clock);
    const W8 = G.weather;
    const wet = bunker ? 0 : W8.kind === "rain" ? W8.k : 0;
    const fogK = bunker ? 0 : W8.kind === "fog" ? W8.k : W8.kind === "rain" ? W8.k * 0.6 : 0;
    const night = isNight(G);
    if (bunker) {
      const power = !!G.flags.power;
      hemi.color.set(power ? "#8a94a8" : "#6a6a78");
      hemi.groundColor.set("#1a1a1e");
      hemi.intensity = power ? 0.95 : 0.6;
      // cool overhead fill so walls and bodies read in the dark
      sun.color.set(power ? "#c8d4e8" : "#8a90a8");
      sun.intensity = power ? 1.1 : 0.55;
      scene.fog.color.set("#050607");
      scene.fog.near = 22;
      scene.fog.far = 62;
      renderer.toneMappingExposure = 1.25;
    } else {
      sun.color.copy(S.sun);
      sun.intensity = S.sunI * (1 - 0.55 * Math.max(wet, fogK * 0.8)) * (W8.kind === "cloudy" ? 1 - 0.35 * W8.k : 1);
      hemi.color.copy(S.sky);
      hemi.groundColor.copy(S.gnd);
      hemi.intensity = S.hemiI * (1 + 0.15 * wet);
      const fogCol = S.fog.clone().lerp(_c.set("#7a8288"), Math.max(wet * 0.5, fogK * 0.6));
      scene.fog.color.copy(fogCol);
      scene.fog.near = 30 - fogK * 18;
      scene.fog.far = (night ? 70 : 95) - fogK * 52 - wet * 12;
      renderer.toneMappingExposure = S.exp;
    }
    scene.background.copy(scene.fog.color);
    // sun direction: arcs east → west; moon at night
    const h = G.clock;
    const dayAng = ((h - 6) / 14) * Math.PI;
    const up = bunker ? 0.95 : night ? 0.85 : Math.max(0.25, Math.sin(clamp(dayAng, 0.15, Math.PI - 0.15)));
    const az = bunker ? 0.8 : night ? 2.2 : -1.2 + dayAng * 0.9;
    const tx = cam.x;
    const tz = cam.z;
    sun.position.set(tx + Math.cos(az) * 40 * (1 - up * 0.5), 40 * up + 12, tz + Math.sin(az) * 40 * (1 - up * 0.5));
    sun.target.position.set(tx, 0, tz);
    // flashlight
    const wantFlash = !menu && !P.dead && (bunker || night || (G.clock > 19.6 || G.clock < 5.8));
    flash.intensity += ((wantFlash ? (bunker ? 45 : 26) : 0) - flash.intensity) * Math.min(1, dt * 4);
    flash.position.set(P.x + Math.sin(P.yaw) * 0.2, 1.55, P.z + Math.cos(P.yaw) * 0.2);
    flash.target.position.set(P.x + Math.sin(P.yaw) * 7, 0, P.z + Math.cos(P.yaw) * 7);
    L.water.update(t);

    // ---------------------------------------------------------------- camera
    const zoomBase = opts.zoom ?? 18;
    cam.zoomT = menu ? 22 : zoomBase;
    cam.zoom += (cam.zoomT - cam.zoom) * Math.min(1, dt * 3);
    // locked on the survivor: no aim look-ahead (it would drag the ground point
    // under a still cursor and make the aim drift)
    cam.x = P.x;
    cam.z = P.z;
    let yaw = CAM_YAW;
    let pitch = PITCH;
    let dist = cam.zoom;
    if (menu) {
      cam.orbit += dt * 0.05;
      yaw = CAM_YAW + Math.sin(cam.orbit) * 0.5 - 0.2;
      pitch = 0.62;
      dist = 17;
    }
    cam.shake = Math.max(0, cam.shake - dt * 2.2);
    const sh = cam.shake * cam.shake;
    const sx = (Math.random() - 0.5) * sh * 0.8;
    const sz = (Math.random() - 0.5) * sh * 0.8;
    camera.position.set(cam.x + Math.sin(yaw) * Math.cos(pitch) * dist + sx, Math.sin(pitch) * dist + 1, cam.z + Math.cos(yaw) * Math.cos(pitch) * dist + sz);
    camera.lookAt(cam.x + sx, menu ? 1.2 : 0.6, cam.z + sz);
    camera.updateMatrixWorld();

    // cut-out centre: the survivor's chest in drawing-buffer pixels
    _v.set(P.x, 1.0, P.z).project(camera);
    const bw = renderer.domElement.width;
    const bh = renderer.domElement.height;
    CUT.uCutP.value.set((_v.x * 0.5 + 0.5) * bw, (_v.y * 0.5 + 0.5) * bh, _v.z * 0.5 + 0.5 - 0.0006);
    CUT.uCutR.value = bh * (menu ? 0.0 : 0.15) * (26 / cam.zoom);
    CUT.uWind.value = 0.5 + wet * 0.9 + (W8.kind === "cloudy" ? 0.2 : 0);

    // ---------------------------------------------------------------- roofs
    for (const r of L.roofs) {
      const inside = P.inside === r.userData.bld;
      const target = inside ? 0 : 1;
      r.userData.fade += (target - r.userData.fade) * Math.min(1, dt * 7);
      r.material.opacity = r.userData.fade;
      r.visible = r.userData.fade > 0.02;
      r.material.depthWrite = r.userData.fade > 0.95;
    }

    // ---------------------------------------------------------------- nodes / drums / structures
    L.syncNodes(R, t);
    L.syncDrums(R);
    const sig = G.loc === "camp" ? G.structures.map((s) => `${s.id}.${s.tier}`).join(",") : "";
    if (sig !== structSig) {
      structSig = sig;
      rebuildStructures(G);
      if (G.loc === "camp") L.hideGrassUnder(G.structures);
    }
    for (const [sid, d] of doorLeaves) {
      const s = G.structures.find((q) => q.id === sid);
      const want = s?.open ? 1 : 0;
      d.ang += (want - d.ang) * Math.min(1, dt * 8);
      d.hinge.rotation.y = -d.ang * 1.6;
    }
    // structure hit shake
    for (const c of structGroup.children)
      if (c.isInstancedMesh && c.userData.list) {
        let dirty = false;
        c.userData.list.forEach((s, i) => {
          if (s.hitT > 0 || s._wasHit) {
            const k = s.hitT > 0 ? Math.sin(t * 50) * 0.04 * s.hitT * 3 : 0;
            _v.set(s.x + k, 0, s.z);
            const m = new THREE.Matrix4().compose(_v, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), s.yaw), new THREE.Vector3(1, 1, 1));
            c.setMatrixAt(i, m);
            dirty = true;
            s._wasHit = s.hitT > 0;
          }
        });
        if (dirty) c.instanceMatrix.needsUpdate = true;
      }

    // ---------------------------------------------------------------- player
    updatePlayer(G, dt, opts);
    // ---------------------------------------------------------------- zombies
    updateZombies(G, dt);
    updateAnimals(G, dt);
    updatePickups(G);
    updateProjectiles(G);
    updateGhost(G, opts);

    // falling trees
    for (let i = falling.length - 1; i >= 0; i--) {
      const f = falling[i];
      f.t += dt;
      const k = Math.min(1, f.t / 1.1);
      f.obj.rotation.x = 0;
      f.inner.rotation.x = (k * k) * (Math.PI / 2 - 0.08);
      if (f.t > 1.1) {
        f.inner.position.y = -0.3 - (f.t - 1.1) * 0.8;
        if (f.t > 1.15 && f.t < 1.2) {
          const fx0 = f.obj.position.x + Math.sin(f.obj.rotation.y) * 3;
          const fz0 = f.obj.position.z + Math.cos(f.obj.rotation.y) * 3;
          fx.puff(fx0, 0.2, fz0, "dust", 14, { spread: 3, s1: 1.8 });
          cam.shake = Math.max(cam.shake, 0.3);
        }
      }
      if (f.t > 2.4) {
        dyn.remove(f.obj);
        falling.splice(i, 1);
      }
    }

    // ---------------------------------------------------------------- telegraphs + clouds + fires
    fx.beginRings();
    for (const z of R.zombies) {
      if (z.state === "windup" && z.atk?.kind !== "struct") fx.ring(z.x, z.z, z.def.reach * 0.95, 1 - z.st / (z.tele || 1), "#ff3a2a");
      else if (z.state === "slamWind") fx.ring(z.atk.x, z.atk.z, z.def.slam.r, 1 - z.st / (z.tele || 1), "#ff2a1a");
      else if (z.state === "chargeWind") fx.ring(z.x, z.z, 1.6, 1 - z.st / (z.tele || 1), "#ff8a1a");
      else if (z.state === "spitWind") fx.ring(z.x, z.z, 0.9, 1 - z.st / (z.tele || 1), "#9aff3a");
    }
    // build-zone / interact helpers
    fx.endRings();
    for (const c of R.clouds) fx.gas(c.x, 0, c.z, c.r * 0.8);
    for (const f of fires) fx.fire(f.x, 0.1, f.z, 1);
    for (const l of L.lights) if (l.kind === "fire") fx.fire(l.x, 0, l.z, 1);
    // loot hints: unopened containers sparkle when near
    const ls = G.locs[G.loc];
    if (!menu && Math.random() < 0.35)
      for (const c of map.containers) {
        if (ls.cont[c.id] != null) continue;
        const d2 = (c.x - P.x) ** 2 + (c.z - P.z) ** 2;
        if (d2 < 100 && Math.random() < 0.12) fx.sparkle(c.x, 1.0, c.z, c.contents ? [1, 0.75, 0.3] : [1, 0.95, 0.7]);
      }
    if (ls.bag && Math.random() < 0.4) fx.sparkle(ls.bag.x, 0.5, ls.bag.z, [0.5, 0.8, 1]);

    // ---------------------------------------------------------------- light pool
    const emitters = [];
    const power = !!G.flags.power;
    for (const l of L.lights) {
      if (l.kind === "street" || l.kind === "flood") {
        if (!(night || G.clock > 19 || G.clock < 6.2)) continue;
      }
      let i = l.i;
      let color = l.color;
      if (l.kind === "ceiling") {
        color = power ? "#e8f0ff" : "#ff7a52";
        i = power ? 3.2 : 1.9;
      }
      if (l.flicker && !(l.kind === "ceiling" && power)) i *= Math.sin(t * 13 + l.x) > 0.6 - l.flicker * 0.4 ? 1 : 0.15 + Math.random() * 0.3;
      emitters.push({ x: l.x, y: l.y, z: l.z, color, i, r: l.r });
    }
    for (const f of fires) emitters.push({ x: f.x, y: 0.9, z: f.z, color: "#ff9a4a", i: 3.2 * (0.85 + Math.random() * 0.3), r: 11 });
    for (let k = lightFlash.length - 1; k >= 0; k--) {
      const f = lightFlash[k];
      f.t -= dt;
      if (f.t <= 0) lightFlash.splice(k, 1);
      else emitters.push(f);
    }
    for (const e of emitters) e.d = (e.x - P.x) ** 2 + (e.z - P.z) ** 2;
    emitters.sort((a, b) => a.d - b.d);
    pool.forEach((pl, k) => {
      const e = emitters[k];
      if (!e || e.d > 45 * 45) {
        pl.intensity = 0;
        return;
      }
      pl.position.set(e.x, e.y, e.z);
      pl.color.set(e.color);
      pl.intensity = e.i * 5;
      pl.distance = e.r * 1.4;
    });
    fx.setGlows(emitters.filter((e) => e.d < 60 * 60).map((e) => ({ x: e.x, z: e.z, r: e.r * 0.45, color: e.color, k: Math.min(0.55, e.i * 0.12) * (night || bunker ? 1 : 0.35) })));

    // ---------------------------------------------------------------- rain
    rain.visible = wet > 0.05 && !bunker;
    if (rain.visible) {
      rain.material.opacity = 0.35 * wet;
      const n = Math.floor(RAIN_N * wet);
      for (let i = 0; i < RAIN_N; i++) {
        const d = drops[i];
        if (i >= n) {
          rainPos.fill(0, i * 6, i * 6 + 6);
          continue;
        }
        d.y -= dt * 22;
        d.x += dt * 2;
        if (d.y < 0) {
          d.y = 18 + Math.random() * 6;
          d.x = cam.x + (Math.random() - 0.5) * 50;
          d.z = cam.z + (Math.random() - 0.5) * 50;
          if (Math.random() < 0.15) fx.splash(d.x, d.z);
        }
        rainPos[i * 6] = d.x;
        rainPos[i * 6 + 1] = d.y;
        rainPos[i * 6 + 2] = d.z;
        rainPos[i * 6 + 3] = d.x - 0.08;
        rainPos[i * 6 + 4] = d.y + 0.7;
        rainPos[i * 6 + 5] = d.z;
      }
      rainGeo.attributes.position.needsUpdate = true;
    }
    L.groundUniforms.uWet.value += (wet - L.groundUniforms.uWet.value) * Math.min(1, dt * 0.5);

    handleEvents(G);
    fx.update(dt);
    hurt = Math.max(0, hurt - dt * 1.4);
    renderer.render(scene, camera);
    overlay.update(camera, dt);
    overlay.bars(
      camera,
      R.zombies
        .filter((z) => z.state !== "dead" && !z.boss && z.hp < z.maxHp && (z.x - P.x) ** 2 + (z.z - P.z) ** 2 < 30 * 30)
        .map((z) => ({ id: z.id, x: z.x, y: 2.15 * (z.scale || 1), z: z.z, hp: z.hp, max: z.maxHp, show: true, armored: z.t === "armored" })),
    );
    return { night };
  }

  /* -------------------------------------------------------------- player */
  let pState = { yaw: 0 };
  function updatePlayer(G, dt, opts) {
    const P = G.P;
    if (!player && assets) {
      player = createCharacter(assets, survivorLook(G));
      playerGear = gearKey(G);
      dyn.add(player.root);
    } else if (!player && assetsErr) {
      player = fallbackRig("#6a7a4a");
      dyn.add(player.root);
    }
    if (!player) return;
    const gk = gearKey(G);
    if (gk !== playerGear && !player.fallback) {
      // re-dress: rebuild for leg colours, re-hang gear
      playerGear = gk;
      const lk = survivorLook(G);
      player.setColors({ pants: lk.pants, boots: lk.boots });
      player.dress(lk.gear);
    }
    player.root.position.set(P.x, 0, P.z);
    pState.yaw = lerpAngle(pState.yaw, P.yaw, Math.min(1, dt * 20));
    player.root.rotation.y = pState.yaw;
    player.root.visible = true;
    const hand = G.equip.hand?.id || null;
    // show the gather tool while chopping
    player.setWeapon(hand);
    if (player.fallback) return;
    const A = player.anim;
    const act = P.act;
    const w = hand ? ITEMS[hand].w : null;
    const gun = w && (w.kind === "gun" || w.kind === "bow");
    if (P.dead) {
      A.set("full", "Death", { fade: 0.15 });
    } else if (act && act.k === "melee") {
      const name = { punch: ["Jab", "Cross", "Hook"], swing: ["SlashA", "SlashB", "SlashC"], chop: ["BladeHeavy", "SlashB", "BladeHeavy"], heavy: ["BladeHeavy", "BladeHeavy", "SlashC"], thrust: ["Jab", "Jab", "Cross"] }[act.anim || "swing"][act.combo % 3];
      const d = A.duration(name);
      A.set("full", name, { restart: act.t < dt * 1.5 && A.playing("full") === name, speed: (d * 0.82) / Math.max(0.25, act.dur), fade: 0.06 });
    } else if (act && (act.k === "use" || act.k === "pick" || act.k === "loot")) {
      const name = act.k === "use" ? "Consume" : "Interact";
      A.set("full", name, { speed: A.duration(name) / Math.max(0.3, act.dur) * 0.8, fade: 0.1 });
    } else {
      A.set("full", null, { fade: 0.15 });
      const sp = P.speed;
      const loco = sp < 0.25 ? "Idle" : sp < 2.8 ? "Walk" : sp < 4.9 ? "Jog" : "Sprint";
      const rate = loco === "Walk" ? sp / 1.6 : loco === "Jog" ? sp / 3.6 : loco === "Sprint" ? sp / 6.0 : 1;
      A.set("lower", loco, { speed: clamp(rate, 0.6, 1.6) });
      if (gun && (act?.k === "shoot" || (opts.aim && w.kind !== "melee"))) A.set("upper", act?.k === "shoot" && act.t < 0.12 ? "Shoot" : "AimMid", { restart: act?.k === "shoot" && act.t < dt * 1.5, fade: 0.08 });
      else if (P.hurtT > 0.2) A.set("upper", "HitBody", { fade: 0.05 });
      else A.set("upper", loco, { speed: clamp(rate, 0.6, 1.6) });
    }
    A.update(dt);
    player.tick(t);
    player.setHit(P.hurtT > 0 ? P.hurtT * 2 : 0);
  }

  /* -------------------------------------------------------------- zombies */
  function updateZombies(G, dt) {
    const P = G.P;
    const R = G.R;
    // nearest N get rigs
    const alive = R.zombies.filter((z) => !(z.state === "dead" && z.st > 8));
    for (const z of alive) z._d = (z.x - P.x) ** 2 + (z.z - P.z) ** 2;
    alive.sort((a, b) => a._d - b._d);
    const want = new Set(alive.slice(0, cfg.rigs).filter((z) => z._d < 55 * 55).map((z) => z.id));
    for (const [id, r] of rigs)
      if (!want.has(id) || !R.zombies.some((z) => z.id === id)) {
        releaseRig(r);
        rigs.delete(id);
      }
    for (const z of alive) {
      if (!want.has(z.id)) continue;
      let r = rigs.get(z.id);
      if (!r) {
        r = acquireRig(z);
        if (!r) continue;
        rigs.set(z.id, r);
        r.yaw = z.yaw;
        r.sink = 0;
      }
      r.root.position.set(z.x, 0, z.z);
      r.yaw = lerpAngle(r.yaw ?? z.yaw, z.yaw, Math.min(1, dt * 14));
      r.root.rotation.y = r.yaw;
      r.root.scale.setScalar(z.scale || 1);
      if (z.state === "dead") {
        r.sink = z.st > 5 ? (z.st - 5) * 0.25 : 0;
        r.root.position.y = -r.sink;
      } else r.root.position.y = 0;
      const A = r.anim;
      const d = z.def;
      let reach = 0.75;
      let hunch = 1;
      switch (z.state) {
        case "dead":
          A.set("full", "Death", { fade: 0.12, speed: 0.9 });
          reach = 0;
          break;
        case "hurt":
          A.set("full", "HitBody", { fade: 0.05, restart: z.st > (z.def.boss ? 0.33 : 0.4) });
          break;
        case "stun":
          A.set("full", "Stagger", { fade: 0.1 });
          reach = 0;
          break;
        case "windup": {
          const name = z.t === "brute" ? "BladeHeavy" : z.v % 2 ? "SlashA" : "Hook";
          const dur = A.duration(name);
          A.set("full", name, { speed: (dur * 0.5) / Math.max(0.3, z.tele), fade: 0.08 });
          reach = 0.2;
          break;
        }
        case "slamWind": {
          const dur = A.duration("BladeHeavy");
          A.set("full", "BladeHeavy", { speed: (dur * 0.55) / Math.max(0.4, z.tele), fade: 0.1 });
          reach = 0;
          break;
        }
        case "spitWind":
          A.set("full", "Throw", { speed: A.duration("Throw") * 0.55 / Math.max(0.3, z.tele), fade: 0.1 });
          reach = 0;
          break;
        case "chargeWind":
          A.set("full", "CrouchIdle", { fade: 0.15 });
          reach = 0.3;
          break;
        case "charge":
          A.set("full", null, { fade: 0.08 });
          A.set("lower", "Sprint", { speed: 1.25 });
          A.set("upper", "Sprint", { speed: 1.25 });
          reach = 0.9;
          break;
        case "recover":
          // let the strike play out
          if (!A.playing("full")) A.set("full", null);
          break;
        default: {
          A.set("full", null, { fade: 0.2 });
          const sp = z.speed;
          const fast = z.t === "runner" && sp > 2.5;
          const loco = sp < 0.15 ? "Idle" : fast ? (sp > 4 ? "Sprint" : "Jog") : "Walk";
          const rate = loco === "Walk" ? clamp(sp / 1.25, 0.45, 1.8) : loco === "Jog" ? sp / 3.4 : loco === "Sprint" ? sp / 5.5 : 0.55;
          A.set("lower", loco, { speed: rate });
          A.set("upper", loco, { speed: rate });
          reach = z.state === "chase" ? (fast ? 0.35 : 0.95) : loco === "Idle" ? 0.25 : 0.6;
          hunch = z.t === "brute" ? 0.6 : 1;
        }
      }
      A.update(dt);
      if (!r.fallback) {
        r.zombify(reach, hunch * (z.state === "dead" ? 0 : 1), t + z.id, z.t === "walker" ? 1 : 0);
        r.setHit(Math.max(z.flash, 0));
        r.tick(t);
      }
    }
  }

  function updateAnimals(G, dt) {
    const R = G.R;
    const seen = new Set();
    for (const a of R.animals) {
      seen.add(a.id);
      let r = animalRigs.get(a.id);
      if (!r) {
        r = animalRig(a);
        animalRigs.set(a.id, r);
      }
      r.g.position.set(a.x, a.dead ? -Math.max(0, a.st - 4) * 0.2 : 0, a.z);
      r.g.rotation.y = a.yaw;
      r.g.rotation.z = a.dead ? Math.min(1.5, a.st * 4) : 0;
      r.phase += dt * a.speed * (a.t === "deer" ? 3.2 : 9);
      r.legs.forEach((l, i) => (l.rotation.x = a.dead ? 0 : Math.sin(r.phase + (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI / 2 : 0)) * Math.min(0.7, a.speed * 0.25)));
      if (a.t === "rabbit") r.g.position.y += Math.abs(Math.sin(r.phase)) * Math.min(0.25, a.speed * 0.06);
    }
    for (const [id, r] of animalRigs)
      if (!seen.has(id)) {
        r.dispose();
        animalRigs.delete(id);
      }
  }

  const _m4 = new THREE.Matrix4();
  const _q4 = new THREE.Quaternion();
  function updatePickups(G) {
    const list = G.R.pickups;
    const n = Math.min(64, list.length + (G.locs[G.loc].bag ? 1 : 0));
    let i = 0;
    const put = (x, z, s, spin) => {
      _q4.setFromAxisAngle(_v.set(0, 1, 0), spin);
      _m4.compose(_v2.set(x, 0.02 + Math.sin(t * 3 + x) * 0.03, z), _q4, _v.set(s, s, s));
      for (const im of sackIMs) im.setMatrixAt(i, _m4);
      i++;
    };
    for (const p of list) if (i < 64) put(p.x, p.z, 1, p.id);
    const bag = G.locs[G.loc].bag;
    if (bag && i < 64) put(bag.x, bag.z, 1.6, 0.5);
    for (const im of sackIMs) {
      im.count = n;
      im.instanceMatrix.needsUpdate = true;
    }
    if (Math.random() < 0.3) for (const p of list) if (Math.random() < 0.08) fx.sparkle(p.x, 0.4, p.z, [1, 0.9, 0.55]);
  }

  function updateProjectiles(G) {
    for (const p of projPool) p.used = false;
    for (const pr of G.R.proj) {
      const p = projMesh(pr.kind);
      p.obj.position.set(pr.x, pr.y ?? 1.3, pr.z);
      p.obj.rotation.set(0, Math.atan2(pr.vx, pr.vz), 0);
      if (pr.kind === "spit") fx.puff(pr.x, 1.3, pr.z, "toxic", 1, { spread: 0.2, up: 0.2, s0: 0.2, s1: 0.5, life: 0.4 });
    }
    for (const p of projPool) if (!p.used) p.obj.visible = false;
  }

  function updateGhost(G, opts) {
    const B = opts.build;
    zoneLine.visible = gridHelper.visible = !!B && G.loc === "camp";
    if (!B || !B.preview) {
      ghost.visible = false;
      return;
    }
    const pv = B.preview;
    const key = `${pv.kind}:${pv.tier || 0}`;
    if (key !== ghostKey) {
      ghostKey = key;
      ghost.clear();
      const geo = sgeo(pv.kind, pv.tier || 0);
      for (const g of Object.values(geo)) ghost.add(new THREE.Mesh(g, ghostMat));
      if (PIECES[pv.kind].door) for (const g of Object.values(sgeo("doorLeaf", 0))) {
        const m = new THREE.Mesh(g, ghostMat);
        m.position.z = -0.86;
        ghost.add(m);
      }
    }
    ghost.visible = true;
    ghost.position.set(pv.x, 0.02, pv.z);
    ghost.rotation.y = pv.yaw;
    ghostMat.color.set(pv.ok ? "#5aff8a" : "#ff4a4a");
    ghostMat.emissive.set(pv.ok ? "#2aff6a" : "#ff1a1a");
    ghostMat.opacity = 0.38 + Math.sin(t * 6) * 0.08;
  }

  /* -------------------------------------------------------------- api */
  function resize() {
    const r = host.getBoundingClientRect();
    W = Math.max(1, Math.round(r.width));
    H = Math.max(1, Math.round(r.height));
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, cfg.pr));
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    // keep the same world framing on tall (portrait) screens
    camera.fov = W / H < 1 ? 42 : 30;
    camera.updateProjectionMatrix();
    overlay.resize(W, H);
  }
  resize();

  const ray = new THREE.Raycaster();
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -1.0);
  return {
    render,
    resize,
    camera,
    renderer,
    get minimap() {
      return L?.minimap || null;
    },
    get assetsReady() {
      return !!assets || !!assetsErr;
    },
    hurt: () => hurt,
    /** Client point → ground point at torso height (aiming). */
    screenToGround(cx, cy, y = 1.0) {
      const r = canvas.getBoundingClientRect();
      const nx = ((cx - r.left) / r.width) * 2 - 1;
      const ny = -((cy - r.top) / r.height) * 2 + 1;
      ray.setFromCamera({ x: nx, y: ny }, camera);
      plane.constant = -y;
      const out = new THREE.Vector3();
      return ray.ray.intersectPlane(plane, out) ? { x: out.x, z: out.z } : null;
    },
    project(x, y, z) {
      _v.set(x, y, z).project(camera);
      return { x: (_v.x * 0.5 + 0.5) * W, y: (-_v.y * 0.5 + 0.5) * H, vis: _v.z < 1 };
    },
    setQuality(q) {
      if (!QUAL[q] || q === Q) return;
      Q = q;
      cfg = QUAL[q];
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, cfg.pr));
      sun.shadow.mapSize.set(cfg.shadow, cfg.shadow);
      sun.shadow.map?.dispose();
      sun.shadow.map = null;
      makePool();
      fx.dispose();
      fx = createFx(scene, Q);
      locKey = "";
      resize();
    },
    reset() {
      curG = null;
    },
    dispose() {
      if (L) {
        scene.remove(L.group);
        L.dispose();
      }
      for (const [, r] of rigs) r.dispose();
      for (const list of spareRigs.values()) for (const r of list) r.dispose();
      player?.dispose();
      for (const [, a] of animalRigs) a.dispose();
      fx.dispose();
      overlay.dispose();
      for (const g of structGeoCache.values()) for (const b of Object.values(g)) b.dispose();
      for (const g of [sackGeo, arrowGeo]) for (const b of Object.values(g)) b.dispose();
      tracerGeo.dispose();
      tracerMat.dispose();
      spitGeo.dispose();
      spitMat.dispose();
      ghostMat.dispose();
      rainGeo.dispose();
      rain.material.dispose();
      zoneLine.geometry.dispose();
      zoneLine.material.dispose();
      gridHelper.geometry.dispose();
      gridHelper.material.dispose();
      disposeModelCache();
      disposeMaterials();
      disposeTextures();
      renderer.dispose();
      canvas.removeEventListener("webglcontextlost", lost);
      canvas.remove();
    },
  };
}
