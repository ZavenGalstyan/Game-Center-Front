/**
 * Last Hope — characters on the CC0 Quaternius rigs ("Universal Base
 * Characters" + "Universal Animation Library", shared with Neon Mercenary at
 * public/models/neon-mercenary — see LICENSE-Quaternius-CC0.txt there; the
 * files are referenced, not duplicated).
 *
 * Looks are painted in the skin shader from bind-pose regions: jacket /
 * trousers / boots for the survivor (plus skinned garment shells for real
 * volume), and for the dead: decayed grey-green skin with veins and bruising,
 * torn and stained clothes, glowing eyes, toxic pustules. Rigid gear (packs,
 * helmets, armour plates, riot gear) hangs off bones.
 *
 * Animation: three layers (lower body, upper body, full-body one-shots)
 * blended by weight; zombies add a procedural arms-forward reach, a hunch and
 * a limp on top of the clips.
 */
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as skClone } from "three/examples/jsm/utils/SkeletonUtils.js";
import { WEAPON_MODELS } from "./models/weapons.js";
import { builder } from "./models/builder.js";
import { materials } from "./materials.js";

const DIR = `${(typeof import.meta !== "undefined" && import.meta.env?.BASE_URL) || "/"}models/neon-mercenary/`;
export const LOWER = new Set(["pelvis", "thigh_l", "calf_l", "foot_l", "ball_l", "thigh_r", "calf_r", "foot_r", "ball_r"]);
const LOOP = new Set(["Idle", "Walk", "Jog", "Sprint", "CrouchIdle", "CrouchWalk", "GunIdle", "AimMid", "BladeIdle", "Stagger", "Fix"]);
const BIND = { m: { neck: 1.535, wrist: 0.69 }, f: { neck: 1.5, wrist: 0.625 } };

/* ================================================================ assets */
let promise = null;
function split(clips, hipScale = 1) {
  const out = { full: {}, lower: {}, upper: {} };
  for (const c of clips) {
    const tracks = c.tracks.map((t) => {
      if (hipScale !== 1 && t.name === "pelvis.position") {
        const v = t.values.slice();
        for (let i = 0; i < v.length; i++) v[i] *= hipScale;
        return new THREE.VectorKeyframeTrack(t.name, t.times, v);
      }
      return t;
    });
    out.full[c.name] = new THREE.AnimationClip(c.name, c.duration, tracks);
    out.lower[c.name] = new THREE.AnimationClip(`${c.name}_lo`, c.duration, tracks.filter((t) => LOWER.has(t.name.split(".")[0])));
    out.upper[c.name] = new THREE.AnimationClip(`${c.name}_up`, c.duration, tracks.filter((t) => !LOWER.has(t.name.split(".")[0])));
  }
  return out;
}
export function loadCharacters(onProgress) {
  if (promise) return promise;
  const loader = new GLTFLoader();
  const parts = { m: 0, f: 0, a: 0 };
  const track = (k) => (e) => {
    if (e.total) parts[k] = e.loaded / e.total;
    onProgress?.((parts.m + parts.f + parts.a) / 3);
  };
  promise = Promise.all([loader.loadAsync(`${DIR}male.glb`, track("m")), loader.loadAsync(`${DIR}female.glb`, track("f")), loader.loadAsync(`${DIR}anims.glb`, track("a"))])
    .then(([male, female, anims]) => {
      const pelvisY = (g) => {
        let y = 1;
        g.scene.traverse((o) => o.isBone && o.name === "pelvis" && (y = o.position.length()));
        return y;
      };
      const ratio = pelvisY(female) / pelvisY(male);
      return { bodies: { m: male, f: female }, clips: { m: split(anims.animations), f: split(anims.animations, ratio) } };
    })
    .catch((err) => {
      promise = null;
      throw err;
    });
  return promise;
}

/* ================================================================ skin / clothes shader */
function bodyMaterial(src, look, body) {
  const m = src.clone();
  m.color = new THREE.Color("#ffffff");
  m.roughness = 0.8;
  m.metalness = 0;
  const B = BIND[body];
  const u = {
    uSkin: { value: new THREE.Color(look.skin || "#ffffff") },
    uTop: { value: new THREE.Color(look.top || "#4a5236") },
    uTop2: { value: new THREE.Color(look.top2 || look.top || "#4a5236") },
    uPants: { value: new THREE.Color(look.pants || "#2e3a4e") },
    uBoots: { value: new THREE.Color(look.boots || "#2a2420") },
    uNeck: { value: B.neck },
    uWrist: { value: B.wrist },
    uSleeve: { value: look.sleeve ?? B.wrist - 0.04 },
    uZombie: { value: look.zombie ? 1 : 0 },
    uRot: { value: look.rot ?? 0 },
    uTorn: { value: look.torn ?? 0 },
    uToxic: { value: look.toxic ? 1 : 0 },
    uDirt: { value: look.dirt ?? 0.25 },
    uHit: { value: 0 },
    uTime: { value: 0 },
    uSeed: { value: look.seed ?? 0 },
  };
  m.userData.u = u;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vBind;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvBind = position;");
    sh.fragmentShader = sh.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
varying vec3 vBind;
uniform vec3 uSkin, uTop, uTop2, uPants, uBoots;
uniform float uNeck, uWrist, uSleeve, uZombie, uRot, uTorn, uToxic, uDirt, uHit, uTime, uSeed;
float cH(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
float cN(vec3 p) { vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(cH(i), cH(i + vec3(1,0,0)), f.x), mix(cH(i + vec3(0,1,0)), cH(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(cH(i + vec3(0,0,1)), cH(i + vec3(1,0,1)), f.x), mix(cH(i + vec3(0,1,1)), cH(i + vec3(1,1,1)), f.x), f.y), f.z); }
float clothMask = 0.0; float glowK = 0.0;`
      )
      .replace(
        "#include <map_fragment>",
        `#include <map_fragment>
  {
    vec3 b = vBind + uSeed * 0.37;
    vec3 p = vBind;
    float ax = abs(p.x);
    float lum = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
    // ---- skin
    vec3 skin = diffuseColor.rgb * uSkin;
    if (uZombie > 0.5) {
      float blot = cN(b * 9.0);
      vec3 rotten = mix(vec3(0.33, 0.4, 0.28), vec3(0.3, 0.27, 0.23), blot);
      skin = mix(skin, rotten * (0.75 + 0.45 * lum), uRot);
      float vein = smoothstep(0.47, 0.5, cN(b * 24.0)) * smoothstep(0.53, 0.5, cN(b * 24.0));
      skin = mix(skin, vec3(0.22, 0.2, 0.28), vein * 0.55 * uRot);
      skin *= mix(1.0, 0.7, smoothstep(0.6, 0.85, cN(b * 5.0)) * uRot);
      if (uToxic > 0.5) {
        float pus = smoothstep(0.78, 0.86, cN(b * 30.0));
        skin = mix(skin * vec3(0.85, 1.0, 0.7), vec3(0.75, 1.0, 0.25), pus);
        glowK = pus * (0.7 + 0.3 * sin(uTime * 3.0 + b.y * 9.0));
      }
    }
    // ---- clothing regions (bind space)
    float top = step(0.9, p.y) * step(p.y, uNeck - 0.02) * step(ax, uSleeve);
    float pants = step(0.085, p.y) * step(p.y, 0.99) * step(ax, 0.3);
    float boots = step(p.y, 0.12) * step(ax, 0.3);
    // torn fabric: holes and ragged hems show skin through
    float holes = smoothstep(1.0 - uTorn * 0.42, 1.0 - uTorn * 0.42 + 0.04, cN(b * 7.0));
    float hem = smoothstep(0.0, 0.08, cN(b * 14.0) * uTorn);
    top *= 1.0 - holes;
    top *= 1.0 - step(uSleeve - 0.12 - hem * 0.2, ax) * uTorn;
    pants *= 1.0 - holes;
    float fabric = 0.88 + 0.12 * cN(p * 80.0);
    float seam = 1.0 - 0.35 * (1.0 - smoothstep(0.0, 0.006, abs(p.x))) * step(0.95, p.y);
    vec3 topC = mix(uTop, uTop2, smoothstep(0.55, 0.58, ax)) * fabric * seam * (0.75 + 0.5 * lum);
    vec3 pantC = uPants * fabric * (0.75 + 0.5 * lum) * (1.0 - 0.25 * smoothstep(0.004, 0.0, abs(ax - 0.12)));
    vec3 bootC = uBoots * (0.8 + 0.4 * lum);
    vec3 c = skin;
    c = mix(c, pantC, pants);
    c = mix(c, topC, top);
    c = mix(c, bootC, boots);
    clothMask = max(max(top, pants), boots);
    // grime: rises from the feet, blotches on clothes
    float dirt = uDirt * (smoothstep(0.7, 0.0, p.y) * 0.8 + smoothstep(0.62, 0.9, cN(b * 6.0)) * 0.6);
    c = mix(c, c * vec3(0.55, 0.5, 0.42), clamp(dirt, 0.0, 0.85));
    diffuseColor.rgb = mix(c, vec3(1.0, 0.3, 0.22), uHit * 0.32);
  }`
      )
      .replace(
        "#include <roughnessmap_fragment>",
        `#include <roughnessmap_fragment>
  roughnessFactor = mix(roughnessFactor, 0.9, clothMask);
  roughnessFactor = mix(roughnessFactor, 0.45, uZombie * uRot * (1.0 - clothMask) * 0.6);`
      )
      .replace(
        "#include <normal_fragment_maps>",
        `vec3 lhBaseN = normal;
#include <normal_fragment_maps>
  normal = normalize(mix(normal, lhBaseN, clothMask * 0.7));`
      )
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
  totalEmissiveRadiance += vec3(0.55, 1.0, 0.2) * glowK * 0.9;
  totalEmissiveRadiance += vec3(1.0, 0.3, 0.2) * uHit * 0.28;`
      );
  };
  m.customProgramCacheKey = () => "lh-body";
  return m;
}

/* ================================================================ garment shells (player only) */
const GARMENT_GEO = new Map();
function garmentGeometry(src, body, kind) {
  const key = `${body}:${kind}`;
  if (GARMENT_GEO.has(key)) return GARMENT_GEO.get(key);
  const B = BIND[body];
  const pos = src.attributes.position;
  const idx = src.index;
  const R = {
    jacket: (x, y) => y > 0.86 && y < B.neck - 0.004 && Math.abs(x) < B.wrist - 0.06,
    pants: (x, y) => y > 0.1 && y < 1.0 && Math.abs(x) < 0.3,
  }[kind];
  const off = { jacket: 0.018, pants: 0.008 }[kind];
  const map = new Int32Array(pos.count).fill(-1);
  const keep = [];
  const tri = [];
  const inR = (i) => R(pos.getX(i), pos.getY(i));
  for (let t = 0; t < idx.count; t += 3) {
    const a = idx.getX(t);
    const b = idx.getX(t + 1);
    const c = idx.getX(t + 2);
    if (!inR(a) || !inR(b) || !inR(c)) continue;
    for (const v of [a, b, c]) {
      if (map[v] < 0) {
        map[v] = keep.length;
        keep.push(v);
      }
      tri.push(map[v]);
    }
  }
  const g = new THREE.BufferGeometry();
  for (const [name, attr] of Object.entries(src.attributes)) {
    const n = attr.itemSize;
    const out = new attr.array.constructor(keep.length * n);
    keep.forEach((v, i) => {
      for (let k = 0; k < n; k++) out[i * n + k] = attr.array[v * n + k];
    });
    g.setAttribute(name, new THREE.BufferAttribute(out, n, attr.normalized));
  }
  const p = g.attributes.position;
  const nn = g.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    const flare = kind === "jacket" ? Math.max(0, 0.98 - y) * 0.09 : 0;
    p.setXYZ(i, p.getX(i) + nn.getX(i) * (off + flare), y + nn.getY(i) * off, p.getZ(i) + nn.getZ(i) * (off + flare));
  }
  g.setIndex(tri);
  g.computeBoundingSphere();
  GARMENT_GEO.set(key, g);
  return g;
}
function garmentMaterial(color, kind) {
  const m = new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: kind === "pants" ? 0.92 : 0.78, metalness: 0, side: THREE.DoubleSide });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vG;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvG = position;");
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vG;\nfloat gH(vec3 p){return fract(sin(dot(p,vec3(12.9,78.2,37.7)))*43758.5);}")
      .replace(
        "#include <map_fragment>",
        `#include <map_fragment>
  {
    float ax = abs(vG.x);
    float seam = 1.0;
    ${kind === "jacket" ? "seam -= 0.4 * (1.0 - smoothstep(0.0, 0.006, abs(vG.x))) * step(0.0, vG.z); seam -= 0.3 * (1.0 - smoothstep(0.0, 0.008, abs(vG.y - 1.32))) * step(ax, 0.22); float pocket = step(0.06, ax) * step(ax, 0.17) * step(0.97, vG.y) * step(vG.y, 1.07) * step(0.0, vG.z); seam -= pocket * 0.18;" : "seam -= 0.3 * (1.0 - smoothstep(0.0, 0.006, abs(ax - 0.12))); seam -= 0.2 * step(0.4, vG.y) * step(vG.y, 0.48);"}
    float weave = 0.9 + 0.1 * gH(floor(vG * 300.0));
    float dirt = smoothstep(0.6, 0.0, vG.y) * 0.35;
    diffuseColor.rgb *= seam * weave * (1.0 - dirt);
  }`
      );
  };
  m.customProgramCacheKey = () => `lh-garment-${kind}`;
  return m;
}

/* ================================================================ rigid gear */
const GEAR = {};
function gearGeo(k) {
  if (GEAR[k]) return GEAR[k];
  const B = builder(5001 + Object.keys(GEAR).length);
  switch (k) {
    case "pack_small":
      B.box("m", "#5a5a3a", [0.3, 0.36, 0.16], [0, 0, 0], { jit: 0.06 });
      B.box("m", "#4a4a30", [0.26, 0.12, 0.06], [0, -0.08, 0.1]);
      break;
    case "pack_big":
      B.box("m", "#7a3a2a", [0.36, 0.5, 0.22], [0, 0, 0], { jit: 0.06 });
      B.box("m", "#5a2a1e", [0.3, 0.14, 0.08], [0, -0.1, 0.14]);
      B.cyl("m", "#4a5a3a", [0.08, 0.08, 0.38, 8], [0, 0.3, 0], { r: [0, 0, Math.PI / 2] });
      break;
    case "hood":
      B.sph("m", "#5a5a48", [0.135, 14, 10], [0, 0, 0], { s: [1.02, 1.08, 1.12] });
      break;
    case "hardhat":
      B.sph("s", "#e8b828", [0.14, 16, 8], [0, 0, 0], { s: [1, 0.75, 1.1] });
      B.cyl("s", "#e8b828", [0.17, 0.17, 0.015, 16], [0, -0.01, 0.02]);
      break;
    case "scraphelm":
      B.sph("x", "#7a7e84", [0.142, 12, 8], [0, 0, 0], { s: [1, 0.85, 1.1], jit: 0.12 });
      B.box("x", "#5a5e64", [0.2, 0.03, 0.05], [0, 0.0, 0.13]);
      break;
    case "riot":
      B.sph("s", "#1e2633", [0.15, 16, 10], [0, 0, 0], { s: [1, 0.95, 1.12] });
      B.box("g", "#9ab0c0", [0.24, 0.13, 0.03], [0, -0.04, 0.15], { r: [-0.15, 0, 0] });
      break;
    case "vest_pad":
      B.box("m", "#6a6a4a", [0.34, 0.36, 0.06], [0, 0, 0.0], { jit: 0.06 });
      break;
    case "vest_plate":
      B.box("x", "#6a6e74", [0.3, 0.32, 0.05], [0, 0, 0], { jit: 0.1 });
      for (let i = 0; i < 4; i++) B.sph("x", "#3a3e44", [0.012, 5, 4], [(i % 2 ? 0.11 : -0.11), i < 2 ? 0.12 : -0.12, 0.03]);
      break;
    case "vest_mil":
      B.box("m", "#4a5236", [0.34, 0.38, 0.07], [0, 0, 0]);
      for (let i = 0; i < 3; i++) B.box("m", "#3a4228", [0.08, 0.1, 0.05], [-0.1 + i * 0.1, -0.1, 0.05]);
      break;
    case "back_plate":
      B.box("x", "#6a6e74", [0.3, 0.34, 0.04], [0, 0, 0]);
      break;
    case "shin":
      B.box("s", "#1e2633", [0.1, 0.24, 0.05], [0, 0, 0]);
      break;
    case "riotvest":
      B.box("s", "#1e2633", [0.36, 0.4, 0.07], [0, 0, 0]);
      B.box("m", "#d8d8d8", [0.16, 0.04, 0.072], [0, 0.08, 0]);
      break;
    case "gasmask":
      B.sph("s", "#2a2e2a", [0.07, 10, 8], [0, 0, 0], { s: [1.2, 0.9, 0.8] });
      B.cyl("x", "#5a6a3a", [0.04, 0.045, 0.06, 10], [0, -0.03, 0.06], { r: [Math.PI / 2, 0, 0] });
      break;
    case "tank":
      B.cyl("s", "#c8a828", [0.08, 0.08, 0.42, 10], [0, 0, 0]);
      break;
    case "shoulder":
      B.sph("x", "#4a4e54", [0.13, 10, 6], [0, 0, 0], { s: [1, 0.7, 1.15], jit: 0.15 });
      break;
    case "spiked":
      B.sph("x", "#6a6258", [0.12, 10, 6], [0, 0, 0], { s: [1, 0.6, 1.1], jit: 0.18 });
      for (let i = 0; i < 3; i++) B.cone("x", "#b8b0a0", [0.025, 0.11, 5], [(i - 1) * 0.06, 0.08, 0], {});
      break;
    case "chain":
      for (let i = 0; i < 6; i++) B.tor("x", "#5a5e64", [0.03, 0.009, 4, 8], [0, -i * 0.05, 0], { r: [0, (i % 2) * Math.PI / 2, 0] });
      break;
  }
  const g = B.build();
  GEAR[k] = g;
  return g;
}

/* ================================================================ animator */
function createLayered(model, set) {
  const mixer = new THREE.AnimationMixer(model);
  const layers = { lower: new Map(), upper: new Map(), full: new Map() };
  const want = { lower: null, upper: null, full: null };
  const opts = { lower: {}, upper: {}, full: {} };
  let fullW = 0;
  function act(layer, name) {
    let e = layers[layer].get(name);
    if (!e) {
      const clip = set[layer][name];
      if (!clip) return null;
      const a = mixer.clipAction(clip);
      a.setLoop(LOOP.has(name) ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
      a.clampWhenFinished = true;
      a.setEffectiveWeight(0);
      a.play();
      e = { a, w: 0 };
      layers[layer].set(name, e);
    }
    return e;
  }
  return {
    mixer,
    duration(name) {
      return set.full[name]?.duration || 1;
    },
    set(layer, name, o = {}) {
      if (want[layer] !== name || o.restart) {
        const e = name ? act(layer, name) : null;
        if (e && (o.restart || (!LOOP.has(name) && e.w < 0.05))) e.a.reset().play();
        want[layer] = name;
      }
      opts[layer] = o;
      const e = name && layers[layer].get(name);
      if (e) e.a.timeScale = o.speed ?? 1;
    },
    playing: (layer) => want[layer],
    update(dt) {
      fullW += ((want.full ? 1 : 0) - fullW) * Math.min(1, dt / (opts.full.fade ?? 0.1));
      for (const layer of ["lower", "upper", "full"]) {
        const k = Math.min(1, dt / (opts[layer].fade ?? 0.16));
        let sum = 0;
        for (const [n, e] of layers[layer]) {
          e.w += ((n === want[layer] ? 1 : 0) - e.w) * k;
          if (n !== want[layer] && e.w < 0.003) e.w = 0;
          sum += e.w;
        }
        const scale = layer === "full" ? fullW : 1 - fullW;
        for (const [, e] of layers[layer]) e.a.setEffectiveWeight(sum > 0 ? (e.w / sum) * scale : 0);
      }
      mixer.update(dt);
    },
    dispose() {
      mixer.stopAllAction();
      mixer.uncacheRoot(model);
    },
  };
}

/* ================================================================ character */
const HAIRS = ["Hair_Buzzed", "Hair_SimpleParted", "Hair_Beard", "Hair_Long", "Hair_Buns", "Hair_BuzzedFemale"];

export function createCharacter(assets, look = {}) {
  const body = look.body === "f" ? "f" : "m";
  const src = assets.bodies[body];
  const root = new THREE.Group();
  const model = skClone(src.scene);
  root.add(model);
  const B = {};
  const meshes = [];
  model.traverse((o) => {
    if (o.isBone) B[o.name] = o;
    if (o.isMesh) meshes.push(o);
  });
  model.updateMatrixWorld(true);
  const headInv = B.Head.matrixWorld.clone().invert();
  const mats = [];
  const hairMat = new THREE.MeshStandardMaterial({ color: look.hairColor || "#2a2018", roughness: 0.75, side: THREE.DoubleSide });
  mats.push(hairMat);
  let bodyMat = null;
  let eyeMat = null;
  let bodyMesh = null;
  const hideHair = look.helmet || look.bald;
  for (const o of meshes) {
    o.castShadow = true;
    o.receiveShadow = true;
    o.frustumCulled = false;
    if (HAIRS.includes(o.name)) {
      const keep = !hideHair && (o.name === look.hair || (o.name === "Hair_Beard" && look.beard));
      if (!keep) {
        o.parent.remove(o);
        continue;
      }
      o.material = hairMat;
      o.matrix.copy(headInv).multiply(o.matrixWorld);
      o.matrix.decompose(o.position, o.quaternion, o.scale);
      B.Head.add(o);
      continue;
    }
    if (o.isSkinnedMesh && /superhero/i.test(o.name)) {
      bodyMat = bodyMaterial(o.material, look, body);
      o.material = bodyMat;
      mats.push(bodyMat);
      bodyMesh = o;
    } else if (o.material?.name === "Eyes") {
      eyeMat = o.material.clone();
      if (look.eyes) {
        eyeMat.emissive = new THREE.Color(look.eyes);
        eyeMat.emissiveIntensity = 1.6;
        eyeMat.color.set("#222");
      }
      o.material = eyeMat;
      mats.push(eyeMat);
    } else if (o.material?.name === "Hair") {
      o.material = hairMat; // eyebrows
      if (look.zombie && look.rot > 0.6) o.visible = false;
    } else {
      o.material = o.material.clone();
      mats.push(o.material);
    }
  }
  // clothing shells for the survivor
  if (bodyMesh && look.shells)
    for (const [kind, color] of [
      ["jacket", look.top],
      ["pants", look.pants],
    ]) {
      const gm = new THREE.SkinnedMesh(garmentGeometry(bodyMesh.geometry, body, kind), garmentMaterial(color, kind));
      gm.position.copy(bodyMesh.position);
      gm.quaternion.copy(bodyMesh.quaternion);
      gm.scale.copy(bodyMesh.scale);
      gm.bind(bodyMesh.skeleton, bodyMesh.bindMatrix);
      gm.castShadow = true;
      gm.frustumCulled = false;
      bodyMesh.parent.add(gm);
      mats.push(gm.material);
    }
  const s = look.scale || 1;
  const gth = look.girth || 1;
  model.scale.set(s * gth, s, s * gth);

  // ---------------------------------------------------------- gear
  const M = materials().plain;
  const gearMeshes = [];
  const gearRoots = {};
  const addGear = (k, bone, p, r = [0, 0, 0], sc = 1, slot = "misc") => {
    const b = B[bone];
    if (!b) return;
    const grp = new THREE.Group();
    for (const [bk, g] of Object.entries(gearGeo(k))) {
      const mesh = new THREE.Mesh(g, M[bk]);
      mesh.castShadow = true;
      grp.add(mesh);
    }
    grp.position.set(...p);
    grp.rotation.set(...r);
    grp.scale.setScalar(sc);
    b.add(grp);
    gearMeshes.push(grp);
    (gearRoots[slot] = gearRoots[slot] || []).push(grp);
  };
  // bone frames (bind pose): spine/neck/head X=left Y=up Z=fwd
  function dress(g) {
    for (const list of Object.values(gearRoots)) for (const grp of list) grp.parent?.remove(grp);
    for (const k of Object.keys(gearRoots)) delete gearRoots[k];
    gearMeshes.length = 0;
    if (g.pack) addGear(g.pack === "big" ? "pack_big" : "pack_small", "spine_03", [0, 0.02, -0.17], [0, 0, 0], 1, "pack");
    if (g.head === "hood") addGear("hood", "Head", [0, 0.1, -0.01], [0, 0, 0], 1, "head");
    if (g.head === "hardhat") addGear("hardhat", "Head", [0, 0.17, 0.0], [-0.08, 0, 0], 1, "head");
    if (g.head === "scrap") addGear("scraphelm", "Head", [0, 0.13, 0.0], [0, 0, 0], 1, "head");
    if (g.head === "riot") addGear("riot", "Head", [0, 0.11, 0.0], [0, 0, 0], 1, "head");
    if (g.body === "pad") addGear("vest_pad", "spine_03", [0, 0.04, 0.12], [0.08, 0, 0], 1, "body");
    if (g.body === "plate") {
      addGear("vest_plate", "spine_03", [0, 0.04, 0.13], [0.08, 0, 0], 1, "body");
      addGear("back_plate", "spine_03", [0, 0.04, -0.13], [0, 0, 0], 1, "body");
    }
    if (g.body === "mil") {
      addGear("vest_mil", "spine_03", [0, 0.03, 0.12], [0.08, 0, 0], 1, "body");
      addGear("back_plate", "spine_03", [0, 0.04, -0.13], [0, 0, 0], 1, "body");
    }
    if (g.body === "riot") {
      addGear("riotvest", "spine_03", [0, 0.03, 0.12], [0.06, 0, 0], 1, "body");
      addGear("shoulder", "upperarm_l", [-0.035, 0.06, 0], [0, 0, Math.PI / 2], 1, "body");
      addGear("shoulder", "upperarm_r", [0.035, 0.06, 0], [0, 0, -Math.PI / 2], 1, "body");
    }
    if (g.legs === "shin") {
      addGear("shin", "calf_l", [0, 0.17, -0.06], [0, 0, 0], 1, "legs");
      addGear("shin", "calf_r", [0, 0.17, -0.06], [0, 0, 0], 1, "legs");
    }
    if (g.mask) {
      addGear("gasmask", "Head", [0, 0.04, 0.1], [0, 0, 0], 1, "head");
      addGear("tank", "spine_03", [0, 0.0, -0.17], [0, 0, 0], 1, "pack");
    }
    if (g.brute) {
      addGear("spiked", "upperarm_l", [-0.035, 0.05, 0], [0, 0, Math.PI / 2], 0.8, "body");
      addGear("spiked", "upperarm_r", [0.035, 0.05, 0], [0, 0, -Math.PI / 2], 0.8, "body");
      addGear("chain", "spine_03", [0.1, 0.06, 0.13], [0, 0, 0.3], 1, "body");
      addGear("vest_plate", "spine_03", [0, 0.02, 0.13], [0.08, 0, 0], 1, "body");
    }
    fixBoneSpace(model, gearMeshes);
  }
  dress(look.gear || {});

  // fingers: curl into a grip (the library has no finger tracks)
  {
    const qq = new THREE.Quaternion();
    for (const side of ["l", "r"]) {
      for (const f of ["index", "middle", "ring", "pinky"])
        for (let j = 1; j <= 3; j++) {
          const b = B[`${f}_0${j}_${side}`];
          if (b) b.quaternion.multiply(qq.setFromAxisAngle(new THREE.Vector3(1, 0, 0), (look.zombie ? 0.5 : 1.05) + (j > 1 ? 0.25 : 0)));
        }
      for (let j = 1; j <= 3; j++) {
        const b = B[`thumb_0${j}_${side}`];
        if (b) b.quaternion.multiply(qq.setFromAxisAngle(new THREE.Vector3(0, 0, side === "l" ? 1 : -1), 0.35));
      }
    }
  }
  // weapon socket (right hand): grip space → hand space
  const socket = new THREE.Group();
  B.hand_r.add(socket);
  socket.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0)));
  socket.position.set(-0.01, 0.075, -0.04);
  fixBoneSpace(model, [socket]);
  let weapon = null;
  let weaponKind = null;

  const anim = createLayered(model, assets.clips[body]);
  const fwd = new THREE.Vector3();
  const right = new THREE.Vector3();
  const pa = new THREE.Vector3();
  const pb = new THREE.Vector3();
  const cur = new THREE.Vector3();
  const want = new THREE.Vector3();
  const downV = new THREE.Vector3();
  const dq = new THREE.Quaternion();
  const idq = new THREE.Quaternion();
  const pw = new THREE.Quaternion();
  const wq = new THREE.Quaternion();
  /** Rotate a bone by a world-space quaternion. */
  const applyWorld = (b, qw) => {
    b.parent.getWorldQuaternion(pw);
    // local' = pw⁻¹ · qw · pw · local
    wq.copy(pw).invert().multiply(qw).multiply(pw);
    b.quaternion.premultiply(wq);
    b.updateMatrixWorld(true);
  };
  const rotWorld = (b, axis, ang) => applyWorld(b, wq.setFromAxisAngle(axis, ang).clone());
  const q = new THREE.Quaternion();
  const ax = new THREE.Vector3(1, 0, 0);
  const ay = new THREE.Vector3(0, 1, 0);
  const az = new THREE.Vector3(0, 0, 1);
  const U = bodyMat?.userData.u;

  return {
    root,
    model,
    bones: B,
    anim,
    look,
    dress,
    setWeapon(kind) {
      if (kind === weaponKind) return;
      if (weapon) socket.remove(weapon);
      weapon = null;
      weaponKind = kind;
      if (kind && WEAPON_MODELS[kind]) {
        weapon = new THREE.Group();
        for (const [bk, g] of Object.entries(weaponGeo(kind))) {
          const mesh = new THREE.Mesh(g, M[bk]);
          mesh.castShadow = true;
          weapon.add(mesh);
        }
        socket.add(weapon);
      }
    },
    muzzleWorld(out) {
      if (!weapon) return B.hand_r.getWorldPosition(out);
      out.set(0, 0.06, weaponKind === "rifle" ? 0.62 : 0.2);
      return weapon.localToWorld(out);
    },
    /**
     * Zombie overlay (after mixer.update): hunch forward, loll the head, and
     * swing the upper arms toward "forward and a little down" — all solved in
     * world space so it doesn't depend on the skeleton's local bone axes.
     */
    zombify(reach, hunch, t, limp = 0) {
      const yaw = root.rotation.y;
      fwd.set(Math.sin(yaw), 0, Math.cos(yaw));
      right.set(Math.cos(yaw), 0, -Math.sin(yaw));
      root.updateMatrixWorld(true);
      if (hunch) {
        for (const b of [B.spine_01, B.spine_02, B.spine_03]) if (b) rotWorld(b, right, hunch * 0.13);
        if (B.neck_01) rotWorld(B.neck_01, fwd, Math.sin(t * 0.9) * 0.22 * hunch + 0.12 * hunch);
        if (limp && B.pelvis) rotWorld(B.pelvis, fwd, Math.sin(t * 4) * 0.07 * limp);
        root.updateMatrixWorld(true);
      }
      if (reach > 0.01)
        [
          [B.upperarm_l, B.lowerarm_l, 1],
          [B.upperarm_r, B.lowerarm_r, -1],
        ].forEach(([u, l, side], i) => {
          if (!u || !l) return;
          u.getWorldPosition(pa);
          l.getWorldPosition(pb);
          cur.subVectors(pb, pa).normalize();
          const sway = Math.sin(t * 2.3 + i * 1.7) * 0.12;
          want.copy(fwd).multiplyScalar(0.94).addScaledVector(right, side * (0.1 + sway * 0.3)).add(downV.set(0, -0.28 + sway, 0)).normalize();
          dq.setFromUnitVectors(cur, want);
          dq.slerp(idq, 1 - Math.min(1, reach));
          applyWorld(u, dq);
        });
    },
    /** Upper-body aim pitch / twist (procedural, after mixer.update). */
    aim(pitch, twist = 0) {
      for (const b of [B.spine_01, B.spine_02, B.spine_03]) {
        if (!b) continue;
        if (pitch) b.quaternion.multiply(q.setFromAxisAngle(ax, -pitch / 3));
        if (twist) b.quaternion.multiply(q.setFromAxisAngle(ay, twist / 3));
      }
    },
    setHit(v) {
      if (U) U.uHit.value = v;
    },
    tick(t) {
      if (U) U.uTime.value = t;
    },
    setColors(c) {
      if (!U) return;
      if (c.top) U.uTop.value.set(c.top);
      if (c.top2) U.uTop2.value.set(c.top2);
      if (c.pants) U.uPants.value.set(c.pants);
      if (c.boots) U.uBoots.value.set(c.boots);
    },
    gearRoots,
    dispose() {
      anim.dispose();
      model.traverse((o) => o.isSkinnedMesh && o.skeleton.dispose());
      mats.forEach((m) => m.dispose());
    },
  };
}

const WGEO = {};
function weaponGeo(kind) {
  if (!WGEO[kind]) WGEO[kind] = WEAPON_MODELS[kind]();
  return WGEO[kind];
}

/** Gear is authored in metres; cancel the skeleton's FBX scale chain. */
function fixBoneSpace(model, objs) {
  model.updateMatrixWorld(true);
  const s = new THREE.Vector3();
  const ms = new THREE.Vector3();
  model.getWorldScale(ms);
  for (const o of objs) {
    if (o.userData.fixed) continue;
    o.parent.getWorldScale(s);
    const k = ms.x / (s.x || 1);
    if (Math.abs(k - 1) > 0.01) {
      o.scale.multiplyScalar(k);
      o.position.multiplyScalar(k);
    }
    o.userData.fixed = true;
  }
}

/* ================================================================ looks */
const SKINS = ["#f1c9a5", "#e0ac84", "#c68a62", "#8d5a3c", "#f5d5b8"];
export function survivorLook(G) {
  const E = G.equip;
  const id = (k) => E[k]?.id;
  const gear = {
    pack: id("pack") ? (id("pack") === "hiking_backpack" ? "big" : "small") : null,
    head: { padded_hood: "hood", hard_hat: "hardhat", scrap_helmet: "scrap", riot_helmet: "riot" }[id("head")] || null,
    body: { padded_vest: "pad", scrap_armor: "plate", military_vest: "mil" }[id("body")] || null,
    legs: id("legs") === "combat_pants" ? "shin" : null,
  };
  return {
    body: "m",
    hair: "Hair_SimpleParted",
    beard: true,
    hairColor: "#3a2a1e",
    skin: SKINS[0],
    top: "#55603e",
    top2: "#4a5436",
    pants: id("legs") === "combat_pants" ? "#4a5236" : id("legs") === "cloth_pants" ? "#5a4a36" : "#2f3a4e",
    boots: id("feet") ? "#3a2a1c" : "#2a2420",
    shells: true,
    dirt: 0.25,
    gear,
    helmet: gear.head === "riot" || gear.head === "scrap" || gear.head === "hardhat",
  };
}
export function gearKey(G) {
  const E = G.equip;
  return ["pack", "head", "body", "legs", "feet"].map((k) => E[k]?.id || "-").join("|");
}

const ZTOPS = ["#5a4a3a", "#3a4a5a", "#6a3a32", "#4a5a3a", "#7a7466", "#2e2e32", "#5a5a6a"];
const ZPANTS = ["#2e3440", "#3a3328", "#4a4038", "#2a2a2a", "#3e4a3a"];
export function zombieLook(type, seed, boss) {
  const r = (k) => {
    const x = Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453;
    return x - Math.floor(x);
  };
  const body = type === "brute" || type === "armored" ? "m" : r(1) < 0.35 ? "f" : "m";
  const hair = body === "f" ? ["Hair_Long", "Hair_Buns", "Hair_BuzzedFemale"][Math.floor(r(2) * 3)] : ["Hair_Buzzed", "Hair_SimpleParted", "Hair_Long"][Math.floor(r(2) * 3)];
  const base = {
    body,
    hair,
    hairColor: ["#2a2018", "#4a3a2a", "#6a6058", "#1a1a1a"][Math.floor(r(3) * 4)],
    skin: SKINS[Math.floor(r(4) * SKINS.length)],
    zombie: true,
    rot: 0.75 + r(5) * 0.25,
    torn: 0.5 + r(6) * 0.4,
    dirt: 0.55,
    top: ZTOPS[Math.floor(r(7) * ZTOPS.length)],
    pants: ZPANTS[Math.floor(r(8) * ZPANTS.length)],
    boots: "#2a2420",
    sleeve: 0.45 + r(9) * 0.2,
    eyes: "#e8d070",
    seed: r(10) * 10,
    gear: {},
  };
  if (type === "runner") Object.assign(base, { top: ["#8a2a26", "#3a3a3a", "#2a4a6a"][Math.floor(r(11) * 3)], sleeve: 0.66, eyes: "#ff5a3a", torn: 0.45, scale: 0.97 });
  if (type === "armored") Object.assign(base, { top: "#1e2633", top2: "#1e2633", pants: "#1e2633", torn: 0.15, eyes: "#e8d070", gear: { head: "riot", body: "riot", legs: "shin" }, helmet: true, scale: 1.04, girth: 1.06 });
  if (type === "toxic") Object.assign(base, { top: "#b8a028", top2: "#a89020", pants: "#b8a028", toxic: true, torn: 0.55, eyes: "#9aff4a", gear: { mask: true }, girth: 1.14 });
  if (type === "brute") Object.assign(base, { body: "m", hair: null, bald: true, top: "#3a3a3a", sleeve: 0.2, pants: "#2a2420", torn: 0.7, rot: 0.95, eyes: boss === "warden" ? "#ff2a1a" : "#ffb02a", gear: { brute: true }, scale: 1.0, girth: 1.32 });
  return base;
}
