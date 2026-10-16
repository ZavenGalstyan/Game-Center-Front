/**
 * School Life Simulator 3D — characters built from rigged glTF assets.
 *
 * Source art: "Ultimate Modular Men" / "Ultimate Modular Women" by Quaternius
 * (CC0 1.0, see /models/school-life/LICENSE-Quaternius-CC0.txt). Every file
 * shares one 62-bone humanoid skeleton per body base (hips → spine → chest →
 * neck → head, shoulders → arms → wrists → four fingers + thumb, legs → feet)
 * and is split into modular Head / Body / Legs / Feet meshes.
 *
 * A character is assembled per look:
 *   • body base (masculine / feminine skeleton + proportions),
 *   • a face (head mesh) picked per character, skin recoloured to the skin tone,
 *   • top / legs / feet garments picked from the outfit style and recoloured
 *     to the outfit palette,
 * merged into ONE smooth-shaded SkinnedMesh (vertex colours, one material),
 * plus rigid parts parented to bones: hair (re-fitted to the chosen head and
 * recoloured), eyes (eyeball / iris / pupil, blinking), a mouth (talking) and
 * accessories (glasses, caps, headphones, crown, backpack, scarf, badge).
 *
 * Animation: an AnimationMixer blends the asset clips (Idle, Walk, Run, Wave,
 * Kick) by speed / gesture weights, then procedural layers rotate bones in
 * character space for sitting, writing, reading, typing, eating, talking,
 * teaching, raising a hand, celebrating, sports moves and head look-around.
 *
 * Assets load asynchronously; buildCharacter() returns a rig immediately and
 * fills it in once the files are ready.
 */
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { SKIN, HAIR_COLORS, EYE_COLORS, OUTFITS, STAFF_OUTFITS, BOTTOMS } from "./data.js";

const DIR = `${import.meta.env.BASE_URL || "/"}models/school-life/`;
const FILES = { m: ["Casual_2", "Casual_Hoodie", "Suit", "Beach"], f: ["Casual", "Formal", "Suit", "Punk"] };
/** Faces (head meshes) usable per base. */
const FACES = { m: ["Casual_2", "Suit", "Casual_Hoodie", "Beach"], f: ["Casual", "Punk"] };
/** Which asset's haircut each hair style uses ([base, file]); buzz is generated from the scalp. */
const HAIR_SRC = { short: ["m", "Suit"], long: ["f", "Casual"], ponytail: ["f", "Formal"], bun: ["m", "Casual_2"], curly: ["m", "Casual_Hoodie"], spiky: ["m", "Beach"], bob: ["f", "Punk"] };
const EYE_MATS = new Set(["Eye", "Brown"]);
const BROW_MATS = new Set(["Eyebrows", "Hair_Brown"]);
const SKIN_MATS = new Set(["Skin", "Skin_Darker"]);
const HAIR_MATS = new Set(["Hair", "Hair_Blond", "Red", "Pink"]);

/**
 * Garments per outfit kind: [file, { sourceMaterial: role }] for the top, the
 * legs and the feet. Roles: top / accent / bottom / shoes / tie / sole.
 */
const GARMENTS = {
  m: {
    suit: { body: ["Suit", { Suit: "top", White: "accent", Tie: "tie" }], pants: ["Suit", { Suit: "bottom" }], feet: ["Suit", { Black: "shoes" }] },
    tee: { body: ["Casual_2", { LightBrown: "top" }], pants: ["Casual_2", { LightBlue: "bottom" }], feet: ["Casual_2", { Red_Dark: "shoes", White: "sole" }] },
    hoodie: { body: ["Casual_Hoodie", { Purple: "top" }], pants: ["Casual_2", { LightBlue: "bottom" }], feet: ["Casual_2", { Red_Dark: "shoes", White: "sole" }] },
    tank: { body: ["Beach", { LightBrown: "top" }], pants: ["Casual_2", { LightBlue: "bottom" }], feet: ["Casual_2", { Red_Dark: "shoes", White: "sole" }] },
    shorts: ["Casual_Hoodie", { LightBlue: "bottom" }],
    sportShorts: ["Beach", { Red_Dark: "bottom", White: "accent" }],
  },
  f: {
    suit: { body: ["Suit", { Black: "top", White: "accent" }], pants: ["Suit", { Black: "bottom" }], feet: ["Suit", { Black: "shoes" }] },
    tee: { body: ["Casual", { White: "top" }], pants: ["Casual", { Orange: "bottom" }], feet: ["Casual", { Grey: "shoes" }] },
    dress: { body: ["Formal", { LimeGreen: "top", Gold: "accent" }], pants: ["Formal", { LimeGreen: "top" }], feet: ["Formal", { Red: "shoes" }] },
    skirt: ["Formal", { LimeGreen: "bottom" }],
    skirtFeet: ["Formal", { Red: "shoes" }],
  },
};
const STYLE_KIND = { blazer: "suit", vest: "suit", labcoat: "suit", gown: "suit", tee: "tee", apron: "tee", track: "hoodie", hoodie: "hoodie", varsity: "hoodie", jersey: "tank" };

/* =================================================================== helpers */
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
const _c = new THREE.Color();
const _v = new THREE.Vector3();
/** Linear-space colour of a hex string, optionally darkened. */
function col(hex, k = 1) {
  _c.set(hex);
  return [_c.r * k, _c.g * k, _c.b * k];
}

/* =================================================================== assets */
const A = { ready: false, promise: null, error: null, waiting: [], m: {}, f: {}, clips: { m: {}, f: {} }, tpl: {} };

/** Collect the skinned primitives of one glTF by part (Head / Body / Legs / Feet). */
function indexFile(gltf) {
  gltf.scene.updateMatrixWorld(true);
  const parts = { Head: [], Body: [], Legs: [], Feet: [] };
  let skel = null;
  gltf.scene.traverse((o) => {
    if (!o.isSkinnedMesh) return;
    const tag = [o.name, o.parent && o.parent.name].map((n) => /_(Head|Body|Legs|Feet)$/.exec(n || "")).find(Boolean);
    if (!tag) return;
    skel = skel || o.skeleton;
    parts[tag[1]].push({ mat: o.material.name, color: o.material.color.clone(), geo: o.geometry, bones: o.skeleton.bones.map((b) => b.name) });
  });
  return { parts, skel };
}

/** Bind-space positions of a primitive (bind matrices are identity in these assets). */
function points(prim) {
  const p = prim.geo.attributes.position;
  const out = [];
  for (let i = 0; i < p.count; i++) out.push(new THREE.Vector3().fromBufferAttribute(p, i));
  return out;
}

function makeTemplate(file) {
  const sk = file.skel;
  const names = sk.bones.map((b) => b.name);
  const inv = {};
  const restWorld = {};
  sk.bones.forEach((b, i) => {
    inv[b.name] = sk.boneInverses[i].clone();
    restWorld[b.name] = new THREE.Vector3().setFromMatrixPosition(sk.boneInverses[i].clone().invert());
  });
  return { names, index: Object.fromEntries(names.map((n, i) => [n, i])), inv, restWorld, armature: sk.bones[0].parent };
}

export function loadCharacterAssets() {
  if (!A.promise) {
    const loader = new GLTFLoader();
    const jobs = [];
    for (const b of ["m", "f"]) {
      const P = b === "m" ? "M_" : "F_";
      for (const f of FILES[b]) jobs.push(loader.loadAsync(`${DIR}${P}${f}.glb`).then((g) => (A[b][f] = indexFile(g))));
      jobs.push(loader.loadAsync(`${DIR}${P}anims.glb`).then((g) => g.animations.forEach((c) => (A.clips[b][c.name] = c))));
    }
    A.promise = Promise.all(jobs)
      .then(() => {
        for (const b of ["m", "f"]) A.tpl[b] = makeTemplate(A[b][FILES[b][0]]);
        A.ready = true;
        A.waiting.splice(0).forEach((fn) => fn());
      })
      .catch((e) => {
        A.error = e;
        console.error("[SchoolLife3D] character assets failed to load", e);
      });
  }
  return A.promise;
}
export const characterAssetsReady = () => A.ready;

/* =================================================================== look → design */
export function resolveLook(look) {
  const outfit = OUTFITS.find((o) => o.id === look.outfit) || STAFF_OUTFITS[look.outfit] || OUTFITS[0];
  const base = look.body === "f" ? "f" : "m";
  let bottom = look.bottom || "pants";
  // bottoms the body's garments don't include fall back to trousers
  if (!(BOTTOMS.find((x) => x.id === bottom)?.bodies || []).includes(base)) bottom = "pants";
  return {
    base,
    skin: SKIN[look.skin] ?? SKIN[1],
    hair: (HAIR_COLORS.find((h) => h.id === look.hairColor) || HAIR_COLORS[1]).c,
    eyes: EYE_COLORS[look.eyes] ?? EYE_COLORS[0],
    o: outfit,
    style: outfit.style,
    bottom,
    hairStyle: look.hairStyle || "short",
    acc: look.acc || {},
    build: look.build ?? 1,
    adult: !!look.adult,
  };
}
export function lookKey(look) {
  return JSON.stringify([look.body || "m", look.skin, look.hairStyle, look.hairColor, look.eyes, look.outfit, look.bottom, look.build, look.acc, look.adult, look.faceSeed || 0]);
}

/** Face metrics (bind space) of a head: eyes, upper-head box, mouth spot. */
function headMetrics(base, fileName) {
  const file = A[base][fileName];
  const skin = file.parts.Head.find((p) => p.mat === "Skin");
  const pts = points(skin);
  const headY = A.tpl[base].restWorld.Head.y;
  const upper = new THREE.Box3().setFromPoints(pts.filter((p) => p.y > headY));
  const eyePrim = file.parts.Head.find((p) => EYE_MATS.has(p.mat));
  const eyes = [];
  if (eyePrim) {
    for (const side of [1, -1]) {
      const box = new THREE.Box3().setFromPoints(points(eyePrim).filter((p) => p.x * side > 0));
      eyes.push({ c: box.getCenter(new THREE.Vector3()), s: box.getSize(new THREE.Vector3()) });
    }
  }
  const eyeY = eyes.length ? eyes[0].c.y : headY + 0.1;
  const eyeZ = eyes.length ? eyes[0].c.z : upper.max.z;
  // chin = lowest point of the face front; the mouth sits a bit over halfway down from the eyes
  const front = pts.filter((p) => Math.abs(p.x) < 0.03 && p.z > eyeZ - 0.04 && p.y < eyeY);
  const chinY = front.length ? Math.min(...front.map((p) => p.y)) : eyeY - 0.12;
  const mouthY = eyeY - 0.56 * (eyeY - chinY);
  const near = pts.filter((p) => Math.abs(p.x) < 0.014 && Math.abs(p.y - mouthY) < 0.012);
  const mouthZ = near.length ? Math.max(...near.map((p) => p.z)) : eyeZ;
  return { upper, headY, eyes, eyeY, chinY, mouth: new THREE.Vector3(0, mouthY, mouthZ), skin };
}
const METRICS = new Map();
function metrics(base, file) {
  const k = base + file;
  if (!METRICS.has(k)) METRICS.set(k, headMetrics(base, file));
  return METRICS.get(k);
}

/** Torso measurements (bind space) of a top garment: front / back depth per (x, y). */
function torsoMetrics(base, fileName) {
  const tpl = A.tpl[base];
  const chestY = tpl.restWorld.Chest.y;
  const neckY = tpl.restWorld.Neck.y;
  const pts = [];
  for (const p of A[base][fileName].parts.Body) for (const v of points(p)) if (Math.abs(v.x) < 0.17 && v.y > chestY - 0.25 && v.y < neckY) pts.push(v);
  const box = new THREE.Box3().setFromPoints(pts);
  const at = (x, y) => {
    let f = -1;
    let bk = 1;
    for (const v of pts) {
      if (Math.abs(v.x - x) < 0.025 && Math.abs(v.y - y) < 0.025) {
        f = Math.max(f, v.z);
        bk = Math.min(bk, v.z);
      }
    }
    return { front: f > -1 ? f : box.max.z, back: bk < 1 ? bk : box.min.z };
  };
  return { box, chestY, neckY, at };
}

function pickFace(look, R) {
  const list = FACES[R.base];
  const h = hashStr(`${look.skin}|${look.hairStyle}|${look.hairColor}|${look.eyes}|${look.outfit}|${look.build}|${look.adult ? 1 : 0}|${look.faceSeed || 0}`);
  return list[h % list.length];
}

/* =================================================================== geometry */
/** Append primitives into one skinned geometry with baked vertex colours. */
function mergeSkinned(base, prims) {
  const tpl = A.tpl[base];
  const pos = [];
  const colr = [];
  const si = [];
  const sw = [];
  const idx = [];
  let off = 0;
  for (const { prim, color } of prims) {
    const g = prim.geo;
    const P = g.attributes.position;
    const I = g.attributes.skinIndex;
    const W = g.attributes.skinWeight;
    const map = prim.bones.map((n) => tpl.index[n] ?? 0);
    for (let i = 0; i < P.count; i++) {
      pos.push(P.getX(i), P.getY(i), P.getZ(i));
      colr.push(color[0], color[1], color[2]);
      si.push(map[I.getX(i)], map[I.getY(i)], map[I.getZ(i)], map[I.getW(i)]);
      sw.push(W.getX(i), W.getY(i), W.getZ(i), W.getW(i));
    }
    if (g.index) for (let i = 0; i < g.index.count; i++) idx.push(g.index.getX(i) + off);
    else for (let i = 0; i < P.count; i++) idx.push(i + off);
    off += P.count;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(colr, 3));
  geo.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(si, 4));
  geo.setAttribute("skinWeight", new THREE.Float32BufferAttribute(sw, 4));
  geo.setIndex(idx);
  // the source art is flat-shaded: weld identical corners so normals come out smooth
  const out = mergeVertices(geo, 1e-4);
  geo.dispose();
  out.computeVertexNormals();
  out.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.9, 0), 1.4);
  return out;
}

/** Re-fit a haircut from its source head onto the target head (bind space). */
function hairGeometry(style, base, face) {
  const tgt = metrics(base, face);
  if (!HAIR_SRC[style]) return buzzGeometry(tgt);
  const [sb, sf] = HAIR_SRC[style];
  const src = metrics(sb, sf);
  const prim = A[sb][sf].parts.Head.filter((p) => HAIR_MATS.has(p.mat)).sort((a, b) => b.geo.attributes.position.count - a.geo.attributes.position.count)[0];
  const sU = src.upper;
  const tU = tgt.upper;
  const sC = sU.getCenter(new THREE.Vector3());
  const tC = tU.getCenter(new THREE.Vector3());
  const sx = ((tU.max.x - tU.min.x) / (sU.max.x - sU.min.x)) * 1.015;
  const sz = ((tU.max.z - tU.min.z) / (sU.max.z - sU.min.z)) * 1.015;
  const sy = ((tU.max.y - tgt.headY) / (sU.max.y - src.headY)) * 1.01;
  const P = prim.geo.attributes.position;
  const pos = new Float32Array(P.count * 3);
  for (let i = 0; i < P.count; i++) {
    pos[i * 3] = tC.x + (P.getX(i) - sC.x) * sx;
    pos[i * 3 + 1] = tgt.headY + (P.getY(i) - src.headY) * sy;
    pos[i * 3 + 2] = tC.z + (P.getZ(i) - sC.z) * sz;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  if (prim.geo.index) g.setIndex(prim.geo.index.clone());
  const out = mergeVertices(g, 1e-4);
  out.computeVertexNormals();
  out.computeBoundingBox();
  return out;
}
/** Buzz cut: a thin shell over the scalp grown from the head mesh itself. */
function buzzGeometry(tgt) {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", tgt.skin.geo.attributes.position.clone());
  if (tgt.skin.geo.index) g.setIndex(tgt.skin.geo.index.clone());
  const m = mergeVertices(g, 1e-4);
  m.computeVertexNormals();
  const P = m.attributes.position;
  const N = m.attributes.normal;
  const U = tgt.upper;
  const halfW = (U.max.x - U.min.x) / 2;
  const cz = (U.max.z + U.min.z) / 2;
  const keep = (i) => {
    const x = P.getX(i);
    const y = P.getY(i);
    const z = P.getZ(i);
    if (y > tgt.eyeY + 0.045 + Math.max(0, z - cz) * 0.5) return Math.abs(x) < halfW * 0.93 || y > tgt.eyeY + 0.07;
    return z < cz - 0.035 && y > tgt.eyeY - 0.07 && Math.abs(x) < halfW * 0.86;
  };
  const idx = [];
  const I = m.index;
  for (let t = 0; t < I.count; t += 3) {
    const a = I.getX(t);
    const b = I.getX(t + 1);
    const c = I.getX(t + 2);
    if (keep(a) && keep(b) && keep(c)) idx.push(a, b, c);
  }
  const pos = new Float32Array(P.count * 3);
  for (let i = 0; i < P.count; i++) {
    pos[i * 3] = P.getX(i) + N.getX(i) * 0.005;
    pos[i * 3 + 1] = P.getY(i) + N.getY(i) * 0.005;
    pos[i * 3 + 2] = P.getZ(i) + N.getZ(i) * 0.005;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  out.setAttribute("normal", N.clone());
  out.setIndex(idx);
  out.computeBoundingBox();
  m.dispose();
  return out;
}

const CACHE = new Map();
function design(look) {
  const key = lookKey(look);
  let d = CACHE.get(key);
  if (d) return d;
  const R = resolveLook(look);
  const b = R.base;
  const face = pickFace(look, R);
  const o = R.o;
  const roles = { top: o.top, accent: o.accent, bottom: o.bottom, shoes: o.shoes, tie: o.tie || o.accent, sole: "#efefef" };
  const skin = col(R.skin);
  const skinDark = col(R.skin, 0.82);
  _c.set(R.hair).lerp(new THREE.Color("#2a1d17"), 0.45);
  const brow = [_c.r, _c.g, _c.b];
  const G = GARMENTS[b];
  let kind = STYLE_KIND[R.style] || "tee";
  if (b === "f" && R.style === "gown") kind = "dress";
  if (b === "f" && (kind === "hoodie" || kind === "tank")) kind = "tee";
  const set = G[kind];
  let legs = set.pants;
  let feet = set.feet;
  if (kind !== "dress") {
    if (b === "m" && R.bottom === "shorts") legs = R.style === "jersey" ? G.sportShorts : G.shorts;
    if (b === "f" && R.bottom === "skirt") {
      legs = G.skirt;
      feet = G.skirtFeet;
    }
  }
  const prims = [];
  const add = (file, part, map, filter) => {
    for (const prim of A[b][file].parts[part]) {
      if (filter && !filter(prim)) continue;
      let c;
      if (SKIN_MATS.has(prim.mat)) c = prim.mat === "Skin" ? skin : skinDark;
      else if (BROW_MATS.has(prim.mat)) c = brow;
      else if (map && map[prim.mat]) c = col(roles[map[prim.mat]] || "#888888");
      else c = [prim.color.r, prim.color.g, prim.color.b];
      prims.push({ prim, color: c });
    }
  };
  add(face, "Head", null, (p) => SKIN_MATS.has(p.mat) || BROW_MATS.has(p.mat));
  add(set.body[0], "Body", set.body[1]);
  add(legs[0], "Legs", legs[1]);
  add(feet[0], "Feet", feet[1]);
  d = { R, face, geo: mergeSkinned(b, prims), hair: hairGeometry(R.hairStyle, b, face), torso: torsoMetrics(b, set.body[0]) };
  CACHE.set(key, d);
  return d;
}

/* =================================================================== materials */
let MATS = null;
function mats() {
  if (!MATS) {
    MATS = {
      body: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72, metalness: 0 }),
      white: new THREE.MeshPhysicalMaterial({ color: "#f7f5f1", roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.1 }),
      pupil: new THREE.MeshBasicMaterial({ color: "#0b0b0d" }),
      glint: new THREE.MeshBasicMaterial({ color: "#ffffff" }),
      mouth: new THREE.MeshStandardMaterial({ color: "#5a2326", roughness: 0.6 }),
      frame: new THREE.MeshStandardMaterial({ color: "#1d1d22", roughness: 0.35, metalness: 0.4 }),
      lens: new THREE.MeshPhysicalMaterial({ color: "#d8ecff", roughness: 0.05, transparent: true, opacity: 0.18 }),
      shade: new THREE.MeshPhysicalMaterial({ color: "#121318", roughness: 0.08, clearcoat: 1, transparent: true, opacity: 0.9 }),
      gold: new THREE.MeshStandardMaterial({ color: "#e6b93a", roughness: 0.3, metalness: 0.85, side: THREE.DoubleSide }),
      strap: new THREE.MeshStandardMaterial({ color: "#2a2a30", roughness: 0.8 }),
      byHex: new Map(),
    };
  }
  return MATS;
}
function matHex(hex, kind = "cloth") {
  const M = mats();
  const k = kind + hex;
  if (!M.byHex.has(k)) M.byHex.set(k, new THREE.MeshStandardMaterial({ color: hex, roughness: kind === "hair" ? 0.55 : kind === "iris" ? 0.3 : 0.75 }));
  return M.byHex.get(k);
}
const GEO = {};
const sharedGeo = (name, make) => GEO[name] || (GEO[name] = make());
const box = () => sharedGeo("box", () => new THREE.BoxGeometry(1, 1, 1));

/** Kept for the world's dispose(): disposes the shared character materials. */
export function charMaterial() {
  return {
    dispose() {
      if (!MATS) return;
      for (const [k, m] of Object.entries(MATS)) if (k !== "byHex") m.dispose();
      MATS.byHex.forEach((m) => m.dispose());
      MATS = null;
    },
  };
}
export function disposeCharacterCache() {
  for (const d of CACHE.values()) {
    d.geo.dispose();
    d.hair.dispose();
  }
  CACHE.clear();
  for (const k of Object.keys(GEO)) {
    GEO[k].dispose();
    delete GEO[k];
  }
}

/* =================================================================== rigid parts */
/** A group whose children are authored in bind space but follow `bone`. */
function boneSpace(base, boneName, bone) {
  const g = new THREE.Group();
  A.tpl[base].inv[boneName].decompose(g.position, g.quaternion, g.scale);
  bone.add(g);
  return g;
}

function buildEyes(M, R, parent) {
  const out = [];
  const iris = matHex(R.eyes, "iris");
  for (const e of M.eyes) {
    const r = Math.max(e.s.x, e.s.y) * 0.62;
    const g = new THREE.Group();
    g.position.set(e.c.x, e.c.y, e.c.z - r * 0.25);
    const ball = new THREE.Mesh(sharedGeo("ball", () => new THREE.SphereGeometry(1, 20, 14)), mats().white);
    ball.scale.set(r, r * 0.92, r * 0.8);
    const ir = new THREE.Mesh(sharedGeo("iris", () => new THREE.SphereGeometry(1, 16, 10)), iris);
    ir.scale.set(r * 0.56, r * 0.56, r * 0.22);
    ir.position.z = r * 0.66;
    const pu = new THREE.Mesh(sharedGeo("pupil", () => new THREE.SphereGeometry(1, 12, 8)), mats().pupil);
    pu.scale.set(r * 0.26, r * 0.26, r * 0.1);
    pu.position.z = r * 0.8;
    const gl = new THREE.Mesh(sharedGeo("glint", () => new THREE.SphereGeometry(1, 8, 6)), mats().glint);
    gl.scale.setScalar(r * 0.1);
    gl.position.set(r * 0.2, r * 0.22, r * 0.84);
    g.add(ball, ir, pu, gl);
    parent.add(g);
    out.push(g);
  }
  return out;
}

function buildMouth(M, parent) {
  const m = new THREE.Mesh(sharedGeo("mouth", () => new THREE.SphereGeometry(1, 16, 8)), mats().mouth);
  m.position.copy(M.mouth).add(_v.set(0, 0, -0.0015));
  m.scale.set(0.017, 0.0032, 0.004);
  m.userData.rest = m.position.clone();
  parent.add(m);
  return m;
}

function buildHeadAccessories(M, R, D, parent) {
  const U = M.upper;
  const halfW = (U.max.x - U.min.x) / 2;
  const cx = (U.max.x + U.min.x) / 2;
  const cz = (U.max.z + U.min.z) / 2;
  const hairTop = Math.max(U.max.y, D.hair.boundingBox.max.y);
  const face = R.acc.face;
  if ((face === "glasses" || face === "sunglasses") && M.eyes.length === 2) {
    const g = new THREE.Group();
    const r = Math.max(M.eyes[0].s.x, M.eyes[0].s.y) * 0.62 * 1.55;
    const z = Math.max(M.eyes[0].c.z, M.eyes[1].c.z) + r * 0.55;
    for (const e of M.eyes) {
      const rim = new THREE.Mesh(sharedGeo("rim", () => new THREE.TorusGeometry(1, 0.11, 6, 22)), mats().frame);
      rim.scale.set(r * 1.08, r * 0.86, r);
      rim.position.set(e.c.x, e.c.y, z);
      const lens = new THREE.Mesh(sharedGeo("lens", () => new THREE.CircleGeometry(1, 22)), face === "sunglasses" ? mats().shade : mats().lens);
      lens.scale.set(r * 1.06, r * 0.84, 1);
      lens.position.set(e.c.x, e.c.y, z);
      const side = Math.sign(e.c.x);
      const ax = cx + side * halfW * 1.02;
      const len = z - (cz - 0.01);
      const arm = new THREE.Mesh(box(), mats().frame);
      arm.scale.set(0.004, 0.005, len);
      arm.position.set(ax, e.c.y + r * 0.2, z - len / 2);
      const hinge = new THREE.Mesh(box(), mats().frame);
      hinge.scale.set(Math.abs(ax - (e.c.x + side * r * 1.08)) + 0.004, 0.005, 0.005);
      hinge.position.set((ax + e.c.x + side * r * 1.08) / 2, e.c.y + r * 0.2, z);
      g.add(rim, lens, arm, hinge);
    }
    const br = new THREE.Mesh(box(), mats().frame);
    const gap = Math.abs(M.eyes[0].c.x - M.eyes[1].c.x) - r * 2.1;
    br.scale.set(Math.max(0.006, gap), 0.004, 0.004);
    br.position.set(cx, M.eyes[0].c.y + r * 0.25, z + 0.002);
    g.add(br);
    parent.add(g);
  }
  const head = R.acc.head;
  if (head === "cap") {
    const c = matHex(R.o.top);
    const g = new THREE.Group();
    const r = halfW * 1.16;
    const y0 = M.eyeY + 0.05;
    const dome = new THREE.Mesh(sharedGeo("dome", () => new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2)), c);
    dome.scale.set(r, Math.max(r * 0.78, hairTop - y0 + 0.012), r * 1.12);
    dome.position.set(cx, y0, cz);
    const brim = new THREE.Mesh(sharedGeo("brim", () => new THREE.CylinderGeometry(1, 1, 1, 24, 1, false, -Math.PI / 2, Math.PI)), c);
    brim.scale.set(r * 0.95, 0.008, r * 0.95);
    brim.rotation.x = -0.12;
    brim.position.set(cx, y0 + 0.005, cz + r * 0.62);
    const btn = new THREE.Mesh(sharedGeo("ball8", () => new THREE.SphereGeometry(1, 8, 6)), matHex(R.o.accent));
    btn.scale.setScalar(0.012);
    btn.position.set(cx, y0 + dome.scale.y, cz);
    g.add(dome, brim, btn);
    parent.add(g);
  } else if (head === "headphones") {
    const g = new THREE.Group();
    const w = halfW * 1.18;
    const y = M.eyeY - 0.015;
    const band = new THREE.Mesh(sharedGeo("band", () => new THREE.TorusGeometry(1, 0.06, 8, 28, Math.PI)), mats().strap);
    band.scale.set(w, hairTop - y + 0.02, w * 0.9);
    band.position.set(cx, y, cz - 0.005);
    for (const s of [1, -1]) {
      const cup = new THREE.Mesh(sharedGeo("cup", () => new THREE.CylinderGeometry(1, 1, 1, 18)), matHex(R.o.accent === "#ffffff" ? "#e2463c" : R.o.accent));
      cup.rotation.z = Math.PI / 2;
      cup.scale.set(0.042, 0.03, 0.042);
      cup.position.set(cx + s * (w + 0.004), y, cz - 0.005);
      g.add(cup);
    }
    g.add(band);
    parent.add(g);
  } else if (head === "crown") {
    const g = new THREE.Group();
    const r = halfW * 0.62;
    const y = hairTop - 0.03;
    const ring = new THREE.Mesh(sharedGeo("crown", () => new THREE.CylinderGeometry(1, 0.92, 1, 20, 1, true)), mats().gold);
    ring.scale.set(r, 0.04, r);
    ring.position.set(cx, y + 0.02, cz);
    g.add(ring);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const sp = new THREE.Mesh(sharedGeo("spike", () => new THREE.ConeGeometry(1, 1, 6)), mats().gold);
      sp.scale.set(0.012, 0.035, 0.012);
      sp.position.set(cx + Math.sin(a) * r, y + 0.055, cz + Math.cos(a) * r);
      g.add(sp);
    }
    parent.add(g);
  }
}

function buildChestAccessories(D, R, parent) {
  const T = D.torso;
  const acc = R.acc;
  if (acc.back === "backpack") {
    const g = new THREE.Group();
    const y = T.chestY - 0.02;
    const back = T.at(0, y).back;
    const pack = new THREE.Mesh(box(), matHex("#2f6fd0"));
    pack.scale.set(0.27, 0.34, 0.12);
    pack.position.set(0, y - 0.02, back - 0.065);
    const pocket = new THREE.Mesh(box(), matHex("#255bb0"));
    pocket.scale.set(0.2, 0.13, 0.05);
    pocket.position.set(0, y - 0.11, back - 0.145);
    const lid = new THREE.Mesh(sharedGeo("lid", () => new THREE.CylinderGeometry(1, 1, 1, 16, 1, false, 0, Math.PI)), matHex("#2f6fd0"));
    lid.rotation.z = Math.PI / 2;
    lid.scale.set(0.06, 0.27, 0.06);
    lid.position.set(0, y + 0.15, back - 0.065);
    g.add(pack, pocket, lid);
    for (const s of [1, -1]) {
      const x = s * 0.085;
      const sh = T.at(x, T.neckY - 0.05);
      const lo = T.at(x, y - 0.12);
      const h = T.neckY - 0.03 - (y - 0.14);
      const strapF = new THREE.Mesh(box(), mats().strap);
      strapF.scale.set(0.04, h, 0.012);
      strapF.position.set(x, (T.neckY - 0.03 + y - 0.14) / 2, Math.max(sh.front, lo.front) + 0.004);
      const strapT = new THREE.Mesh(box(), mats().strap);
      strapT.scale.set(0.04, 0.012, sh.front - sh.back + 0.02);
      strapT.position.set(x, T.neckY - 0.025, (sh.front + sh.back) / 2);
      g.add(strapF, strapT);
    }
    parent.add(g);
  }
  if (acc.neck === "scarf") {
    const g = new THREE.Group();
    const y = T.neckY - 0.035;
    const fr = T.at(0, y);
    const ring = new THREE.Mesh(sharedGeo("scarf", () => new THREE.TorusGeometry(1, 0.32, 10, 24)), matHex("#c8413a"));
    ring.rotation.x = Math.PI / 2;
    ring.scale.set(0.085, Math.max(0.06, (fr.front - fr.back) / 2 + 0.005), 0.09);
    ring.position.set(0, y, (fr.front + fr.back) / 2);
    const tail = new THREE.Mesh(box(), matHex("#c8413a"));
    tail.scale.set(0.06, 0.2, 0.025);
    tail.position.set(0.045, y - 0.12, T.at(0.045, y - 0.12).front + 0.016);
    tail.rotation.z = 0.08;
    g.add(ring, tail);
    parent.add(g);
  }
  if (acc.chest === "badge") {
    const x = 0.085;
    const y = T.chestY + 0.05;
    const b = new THREE.Mesh(sharedGeo("badge", () => new THREE.CylinderGeometry(1, 1, 1, 20)), mats().gold);
    b.rotation.x = Math.PI / 2;
    b.scale.set(0.024, 0.006, 0.024);
    b.position.set(x, y, T.at(x, y).front + 0.004);
    const star = new THREE.Mesh(sharedGeo("ball8", () => new THREE.SphereGeometry(1, 8, 6)), matHex(R.o.accent));
    star.scale.set(0.01, 0.01, 0.004);
    star.position.copy(b.position).add(_v.set(0, 0, 0.004));
    parent.add(b, star);
  }
}

/* =================================================================== rig */
const SCALE = { m: { teen: 0.925, adult: 0.99 }, f: { teen: 0.9, adult: 0.955 } };
const BUILD_W = [0.9, 1, 1.1];

function assemble(rig, look) {
  const D = design(look);
  const R = D.R;
  const b = R.base;
  const tpl = A.tpl[b];
  const arm = tpl.armature.clone(true);
  for (const ch of [...arm.children]) if (!ch.isBone) arm.remove(ch);
  const bones = {};
  arm.traverse((o) => {
    if (o.isBone) bones[o.name] = o;
  });
  const skeleton = new THREE.Skeleton(tpl.names.map((n) => bones[n]), tpl.names.map((n) => tpl.inv[n]));
  const mesh = new THREE.SkinnedMesh(D.geo, mats().body);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  arm.add(mesh);
  mesh.bind(skeleton, new THREE.Matrix4());
  // rigid parts on the head and chest
  const M = metrics(b, D.face);
  const headG = boneSpace(b, "Head", bones.Head);
  const hair = new THREE.Mesh(D.hair, matHex(R.hair, R.hairStyle === "buzz" ? "cloth" : "hair"));
  hair.castShadow = true;
  headG.add(hair);
  rig.eyes = buildEyes(M, R, headG);
  rig.mouth = buildMouth(M, headG);
  buildHeadAccessories(M, R, D, headG);
  buildChestAccessories(D, R, boneSpace(b, "Chest", bones.Chest));
  const s = SCALE[b][R.adult ? "adult" : "teen"];
  const w = BUILD_W[R.build] ?? 1;
  rig.body.scale.set(s * w, s, s * (0.5 + w * 0.5));
  rig.body.add(arm);
  Object.assign(rig, { arm, bones, mesh, scale: s, base: b, legY: tpl.restWorld.UpperLegL.y * s });
  // procedural layers are added on top of the clips each frame, so bones the clips
  // don't key go back to their rest pose first
  rig.rest = Object.values(bones).map((bn) => [bn, bn.quaternion.clone(), bn.position.clone()]);
  const mixer = new THREE.AnimationMixer(arm);
  const clips = A.clips[b];
  const act = (name) => {
    const a = mixer.clipAction(clips[name]);
    a.enabled = true;
    a.setEffectiveWeight(0);
    a.play();
    return a;
  };
  rig.mixer = mixer;
  rig.act = { idle: act("Idle"), walk: act("Walk"), run: act("Run"), wave: act("Wave"), kick: act("Kick_Right") };
  rig.act.idle.time = Math.random() * clips.Idle.duration;
  rig.act.idle.setEffectiveWeight(1);
  rig.act.kick.timeScale = 0;
  rig.ready = true;
}

/**
 * Returns { root, seed, setLOD, … } immediately; the character appears as soon as
 * the shared assets are loaded (they are cached for every later character).
 */
export function buildCharacter(look) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const rig = {
    root,
    body,
    ready: false,
    look: lookKey(look),
    cur: {},
    face: { blinkT: 1 + Math.random() * 3, blink: 0, talkPh: Math.random() * 10 },
    lod: 0,
    seed: 0,
    /** 0 = full detail, 1 = distant (no shadow casting). */
    setLOD(level) {
      if (level === this.lod) return;
      this.lod = level;
      if (this.mesh) this.mesh.castShadow = level === 0;
    },
  };
  const go = () => {
    if (rig.disposed) return;
    try {
      assemble(rig, look);
    } catch (e) {
      console.error("[SchoolLife3D] could not build character", e);
    }
  };
  if (A.ready) go();
  else {
    A.waiting.push(go);
    loadCharacterAssets();
  }
  return rig;
}
export function disposeRig(rig) {
  rig.disposed = true;
  if (rig.mixer) rig.mixer.stopAllAction();
  rig.root.removeFromParent();
}

/* =================================================================== animation */
const CH = [
  "drop", "bodyY", "spineX", "spineZ", "chestX", "chestY", "headX", "headY", "headZ",
  "armLX", "armLZ", "armRX", "armRZ", "foreL", "foreR", "handL", "handR",
  "legLX", "legRX", "kneeL", "kneeR", "footL", "footR",
  "wIdle", "wWalk", "wRun", "wWave", "mouth", "smile",
];
const T0 = Object.fromEntries(CH.map((k) => [k, 0]));
T0.wIdle = 1;
/** Ground speed (m/s, at scale 1) the Walk / Run clips cover at timeScale 1. */
const WALK_SPEED = 1.45;
const RUN_SPEED = 4.3;

const _qa = new THREE.Quaternion();
const _qp = new THREE.Quaternion();
const _qi = new THREE.Quaternion();
const _ax = new THREE.Vector3();
/** Rotate a bone by `ang` about an axis given in character space (x left, y up, z forward). */
function rotC(rig, bone, x, y, z, ang) {
  if (!bone || Math.abs(ang) < 1e-5) return;
  _qp.identity();
  for (let o = bone.parent; o && o !== rig.body; o = o.parent) _qp.premultiply(o.quaternion);
  _qi.copy(_qp).invert();
  _qa.setFromAxisAngle(_ax.set(x, y, z), ang);
  bone.quaternion.premultiply(_qp).premultiply(_qa).premultiply(_qi);
}

/**
 * state: { pose, speed, phase, t, air, wave, interact, celebrate, shoot, kick, talking, raise,
 *          charging, power, seed, mood, listen, snap }
 * pose ∈ stand | idle | walk | sit | sitClass | sitRead | sitType | sitTalk | write | eat | talk | teach | type | shoot | kick | stretch
 */
export function animateRig(rig, s, dt) {
  if (!rig.ready) return;
  const T = { ...T0 };
  const t = s.t || 0;
  const seed = s.seed || 0;
  const sp = s.speed || 0;
  const pose = s.pose || "stand";
  const sitting = pose.startsWith("sit") || pose === "eat" || pose === "write";
  let talk = s.talking ? 1 : 0;
  let kickT = -1;
  const moving = !sitting && !s.air && sp > 0.15;
  if (sitting) {
    T.drop = Math.max(0, rig.legY - 0.47);
    Object.assign(T, { legLX: -1.48, legRX: -1.48, kneeL: 1.42, kneeR: 1.42, footL: 0.04, footR: 0.04 });
    Object.assign(T, { armLX: -0.42, armRX: -0.42, foreL: -0.85, foreR: -0.85, armLZ: -0.06, armRZ: 0.06, spineX: 0.03, headX: 0.05 });
    T.chestX = Math.sin(t * 1.6 + seed) * 0.012;
    if (pose === "sitClass" || pose === "write") {
      T.spineX = 0.12;
      T.headX = s.listen ? -0.02 + Math.sin(t * 0.5 + seed) * 0.05 : 0.32;
      T.headY = s.listen ? Math.sin(t * 0.33 + seed) * 0.15 : 0;
      T.armRX = -0.55;
      T.foreR = -1.25 + (s.listen ? 0 : Math.sin(t * 7 + seed) * 0.08);
      T.armRZ = 0.12 + (s.listen ? 0 : Math.sin(t * 9 + seed) * 0.04);
      T.armLX = -0.45;
      T.foreL = -1.3;
      T.armLZ = -0.15;
    } else if (pose === "sitRead") {
      Object.assign(T, { spineX: 0.16, headX: 0.42, armLX: -0.55, armRX: -0.55, foreL: -1.55, foreR: -1.55, armLZ: -0.12, armRZ: 0.12, handL: -0.3, handR: -0.3 });
    } else if (pose === "sitType") {
      Object.assign(T, { spineX: 0.08, headX: 0.1, armLX: -0.4, armRX: -0.4, armLZ: -0.1, armRZ: 0.1 });
      T.foreL = -1.35 + Math.sin(t * 13 + seed) * 0.05;
      T.foreR = -1.35 + Math.cos(t * 12 + seed) * 0.05;
    } else if (pose === "eat") {
      const c = Math.max(0, Math.sin(t * 1.6 + seed));
      T.armRX = -0.45 - c * 0.55;
      T.foreR = -1.2 - c * 1.0;
      T.armRZ = 0.12 + c * 0.25;
      T.headX = 0.08 + c * 0.08;
      T.mouth = c > 0.8 ? 0.4 * Math.abs(Math.sin(t * 9)) : 0;
      T.smile = 0.5;
    } else if (pose === "sitTalk") {
      talk = Math.max(talk, Math.sin(t * 0.4 + seed) > 0 ? 1 : 0);
      T.spineX = -0.03;
      T.headY = Math.sin(t * 0.7 + seed) * 0.4;
      T.armRX = -0.4 - Math.max(0, Math.sin(t * 2.2 + seed)) * 0.5;
      T.foreR = -1.15;
      T.smile = 0.5;
    }
    if (s.raise || s.wave > 0) Object.assign(T, { armRZ: -2.75, armRX: -0.25, foreR: -0.3 });
  } else if (s.air) {
    Object.assign(T, { legLX: -0.75, legRX: 0.2, kneeL: 1.2, kneeR: 0.7, armLZ: 0.55, armRZ: -0.55, armLX: -0.4, armRX: 0.3, spineX: 0.06 });
  } else if (moving) {
    const run = sp > 3.2 ? clamp((sp - 3.2) / 1.4, 0, 1) : 0;
    T.wIdle = 0;
    T.wWalk = 1 - run;
    T.wRun = run;
  } else {
    // idle: the clip breathes and shifts weight; add looking around
    T.headY = Math.sin(t * 0.37 + seed * 3) * 0.28 + Math.sin(t * 0.13 + seed) * 0.15;
    T.headX = Math.sin(t * 0.29 + seed) * 0.05;
    if (pose === "talk") {
      talk = 1;
      const g = Math.sin(t * 2.4 + seed);
      const g2 = Math.sin(t * 1.7 + seed * 2);
      Object.assign(T, { armRX: -0.25 - Math.max(0, g) * 0.35, foreR: -1.05 - Math.max(0, g) * 0.25, armRZ: 0.1, handR: -0.3 * g, armLX: -0.1 - Math.max(0, g2) * 0.25, foreL: -0.55 - Math.max(0, -g) * 0.4, smile: 0.55 });
      T.headX = Math.sin(t * 3.1 + seed) * 0.07;
      T.headY = Math.sin(t * 0.8 + seed) * 0.35;
    } else if (pose === "teach") {
      talk = Math.max(talk, 0.7);
      const g = Math.sin(t * 1.3 + seed);
      Object.assign(T, { armRX: -1.15 - g * 0.35, armRZ: -0.15, foreR: -0.3, armLX: -0.3, foreL: -1.35, armLZ: -0.1, chestY: 0.15 * g });
      T.headY = Math.sin(t * 0.6 + seed) * 0.45;
    } else if (pose === "type") {
      Object.assign(T, { armLX: -0.45, armRX: -0.45, armLZ: -0.1, armRZ: 0.1, headX: 0.3, headY: 0, spineX: 0.08 });
      T.foreL = -1.25 + Math.sin(t * 11 + seed) * 0.05;
      T.foreR = -1.25 + Math.cos(t * 10 + seed) * 0.05;
    } else if (pose === "shoot") {
      const c = (t * 0.55 + seed) % 2.2;
      if (c < 0.5) Object.assign(T, { armLX: -2.6, armRX: -2.7, foreL: -0.9 * (1 - c * 2), foreR: -0.9 * (1 - c * 2), bodyY: Math.max(0, Math.sin(c * Math.PI * 2)) * 0.12 });
      else Object.assign(T, { armRX: -0.5 - Math.abs(Math.sin(t * 6 + seed)) * 0.35, foreR: -0.7, drop: 0.03, kneeL: 0.3, kneeR: 0.3, legLX: -0.15, legRX: -0.15 });
    } else if (pose === "kick") {
      const c = (t * 0.6 + seed) % 2;
      if (c < 0.6) kickT = c / 0.6;
    } else if (pose === "stretch") {
      const c = Math.sin(t * 1.2 + seed);
      Object.assign(T, { armLZ: 2.7, armRZ: -2.7, spineZ: c * 0.2, headY: 0 });
    }
    if (s.wave > 0) {
      T.wIdle = 0;
      T.wWave = 1;
      T.headY *= 0.2;
      T.smile = 1;
    }
  }
  // gesture overlays
  if (s.interact > 0) {
    const k = Math.min(1, s.interact * 3);
    T.armRX = -1.3 * k + T.armRX * (1 - k);
    T.foreR = -0.25 * k + T.foreR * (1 - k);
    T.handR = 0.3 * k;
  }
  if (s.wave > 0 && moving) Object.assign(T, { armRZ: -2.6, foreR: -0.4 + Math.sin(t * 12) * 0.3 });
  if (s.shoot > 0) {
    const k = s.shoot / 0.6;
    Object.assign(T, { armLX: -2.6, armRX: -2.8, foreL: -0.4 * k, foreR: -0.6 * k, handR: -0.8 * (1 - k) });
  } else if (s.charging) {
    const p = s.power || 0;
    Object.assign(T, { armLX: -1.35, armRX: -1.45, foreL: -1.5, foreR: -1.6, kneeL: 0.4 * p, kneeR: 0.4 * p, legLX: -0.2 * p, legRX: -0.2 * p, drop: 0.07 * p });
  }
  if (s.kick > 0) kickT = clamp(1 - s.kick / 0.6, 0, 1);
  if (s.mood === "love" || s.mood === "happy") T.smile = 1;
  if (s.mood === "sad" || s.mood === "annoyed") {
    T.smile = -0.5;
    if (s.mood === "sad") {
      T.headX += 0.25;
      T.chestX += 0.08;
    }
  }
  if (s.mood === "worried") T.mouth = 0.35;
  if (s.celebrate > 0) {
    const b = Math.abs(Math.sin(t * 9));
    Object.assign(T, { armLZ: 2.55, armRZ: -2.55, armLX: -0.2, armRX: -0.2, headX: -0.2, headY: 0, smile: 1, mouth: 0.5, wWave: 0 });
    T.foreL = -0.2 - b * 0.4;
    T.foreR = -0.2 - (1 - b) * 0.4;
    if (!moving) T.wIdle = 1;
    if (!sitting) {
      T.bodyY = b * 0.14;
      T.kneeL = b * 0.3;
      T.kneeR = b * 0.3;
      T.legLX = -b * 0.12;
      T.legRX = -b * 0.12;
    }
  }
  // talking: the mouth opens and closes with a little rhythm
  const FA = rig.face;
  FA.talkPh += dt * (8 + Math.sin(t * 1.7) * 2);
  if (talk > 0 && !(s.celebrate > 0)) T.mouth = Math.max(T.mouth, talk * (0.15 + 0.55 * Math.abs(Math.sin(FA.talkPh)) * (0.6 + 0.4 * Math.sin(FA.talkPh * 0.37))));

  // smooth toward the target (the mouth reacts faster)
  const C = rig.cur;
  const k = Math.min(1, dt * (s.snap ? 60 : 9));
  const kf = Math.min(1, dt * 22);
  for (const key of CH) {
    const v = C[key] ?? T[key];
    C[key] = v + (T[key] - v) * (key === "mouth" ? kf : k);
  }

  // ---- clip layer
  const X = rig.act;
  const kw = kickT >= 0 ? 1 : 0;
  const wsum = C.wIdle + C.wWalk + C.wRun + C.wWave || 1;
  X.idle.setEffectiveWeight((C.wIdle / wsum) * (1 - kw));
  X.walk.setEffectiveWeight((C.wWalk / wsum) * (1 - kw));
  X.run.setEffectiveWeight((C.wRun / wsum) * (1 - kw));
  X.wave.setEffectiveWeight((C.wWave / wsum) * (1 - kw));
  X.kick.setEffectiveWeight(kw);
  if (kw) X.kick.time = kickT * X.kick.getClip().duration * 0.999;
  for (const [bn, q, p] of rig.rest) {
    bn.quaternion.copy(q);
    bn.position.copy(p);
  }
  const sc = rig.scale || 1;
  X.walk.timeScale = clamp(sp / (WALK_SPEED * sc), 0.5, 2.2);
  X.run.timeScale = clamp(sp / (RUN_SPEED * sc), 0.6, 1.6);
  rig.mixer.update(dt);

  // ---- procedural layer (character space, parents first)
  const Bn = rig.bones;
  rotC(rig, Bn.Abdomen, 1, 0, 0, C.spineX);
  rotC(rig, Bn.Abdomen, 0, 0, 1, C.spineZ);
  rotC(rig, Bn.Chest, 1, 0, 0, C.chestX);
  rotC(rig, Bn.Chest, 0, 1, 0, C.chestY);
  rotC(rig, Bn.Neck, 0, 1, 0, C.headY * 0.4);
  rotC(rig, Bn.Head, 1, 0, 0, C.headX);
  rotC(rig, Bn.Head, 0, 1, 0, C.headY * 0.6);
  rotC(rig, Bn.Head, 0, 0, 1, C.headZ);
  rotC(rig, Bn.UpperArmL, 1, 0, 0, C.armLX);
  rotC(rig, Bn.UpperArmL, 0, 0, 1, C.armLZ);
  rotC(rig, Bn.UpperArmR, 1, 0, 0, C.armRX);
  rotC(rig, Bn.UpperArmR, 0, 0, 1, C.armRZ);
  rotC(rig, Bn.LowerArmL, 1, 0, 0, C.foreL);
  rotC(rig, Bn.LowerArmR, 1, 0, 0, C.foreR);
  rotC(rig, Bn.WristL, 1, 0, 0, C.handL);
  rotC(rig, Bn.WristR, 1, 0, 0, C.handR);
  rotC(rig, Bn.UpperLegL, 1, 0, 0, C.legLX);
  rotC(rig, Bn.UpperLegR, 1, 0, 0, C.legRX);
  rotC(rig, Bn.LowerLegL, 1, 0, 0, C.kneeL);
  rotC(rig, Bn.LowerLegR, 1, 0, 0, C.kneeR);
  rotC(rig, Bn.FootL, 1, 0, 0, C.footL);
  rotC(rig, Bn.FootR, 1, 0, 0, C.footR);
  rig.body.position.y = C.bodyY - C.drop;

  // ---- face: blinking + mouth
  FA.blinkT -= dt;
  if (FA.blinkT <= 0) {
    FA.blinkT = 2 + Math.random() * 3.5;
    FA.blink = 0.16;
  }
  FA.blink = Math.max(0, FA.blink - dt);
  const bl = FA.blink > 0 ? Math.sin((1 - FA.blink / 0.16) * Math.PI) : 0;
  const lid = Math.max(0.08, 1 - bl * 0.95 - (C.smile > 0.8 ? 0.2 : 0));
  for (const e of rig.eyes) e.scale.y = lid;
  const m = rig.mouth;
  const open = clamp(C.mouth, 0, 1);
  m.scale.set(0.017 * (1 + Math.max(0, C.smile) * 0.25 - open * 0.15), 0.0032 + open * 0.009, 0.004);
  m.position.y = m.userData.rest.y + Math.max(0, C.smile) * 0.0015 - open * 0.003;
}
