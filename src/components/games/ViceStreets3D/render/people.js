/**
 * Vice Streets 3D — characters built from rigged glTF assets (adapted from the
 * School Life Simulator 3D character system, which solved the foot/leg issues).
 *
 * Source art: "Ultimate Modular Men" / "Ultimate Modular Women" by Quaternius
 * (CC0 1.0, see /models/school-life/LICENSE-Quaternius-CC0.txt — the files are
 * shared with School Life Simulator 3D, nothing is duplicated). Every file
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
import { SKIN, HAIR_COLORS, EYE_COLORS, OUTFITS, NPC_OUTFITS, BOTTOMS } from "../data/people.js";
import { MOVES } from "../engine/combat.js";

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
  // The asset rig is an IK rig: FootL / FootR hang off Root (they are the IK
  // targets), not off the shins, and the clips only key their rotation. The
  // foot head sits exactly on the shin's tail in bind pose; keep that offset
  // (in shin space) so the feet can be placed on the ankles every frame.
  const bindOf = (n) => inv[n].clone().invert();
  const ankle = {};
  for (const s of ["L", "R"]) ankle[s] = new THREE.Vector3().setFromMatrixPosition(bindOf(`Foot${s}`)).applyMatrix4(bindOf(`LowerLeg${s}`).invert());
  return { names, index: Object.fromEntries(names.map((n, i) => [n, i])), inv, restWorld, ankle, armature: sk.bones[0].parent };
}

/** Shoe extents around the foot bone head (bind space): toe reach, heel reach and sole depth. */
function soleOf(file) {
  const foot = file.skel.bones.find((b) => b.name === "FootL");
  const head = new THREE.Vector3().setFromMatrixPosition(file.skel.boneInverses[file.skel.bones.indexOf(foot)].clone().invert());
  const box = new THREE.Box3();
  for (const prim of file.parts.Feet) for (const p of points(prim)) if (p.x > 0) box.expandByPoint(p);
  return { toe: box.max.z - head.z, heel: head.z - box.min.z, depth: head.y - box.min.y };
}

const LOWER = /^(Body|UpperLeg[LR]|LowerLeg[LR]|Foot[LR]|PT[LR])\./;
/**
 * The asset's Idle (and Wave, built on it) stands contrapposto: pelvis turned
 * 27°, left foot set back and turned out ~60°, right foot forward — from most
 * angles that reads as a twisted, crossed foot. Take the pelvis, legs and feet
 * from Idle_Neutral (feet square under the hips) and re-express the spine so
 * the upper body keeps exactly the world pose and motion it had.
 */
function squareStance(tpl, clip, neutral) {
  const tr = (c, n) => c.tracks.find((t) => t.name === n);
  const bodyC = tr(clip, "Body.quaternion");
  const bodyN = tr(neutral, "Body.quaternion");
  const abd = tr(clip, "Abdomen.quaternion");
  if (!bodyC || !bodyN || !abd) return clip;
  const hipsQ = tpl.armature.getObjectByName("Hips").quaternion;
  const hipsI = hipsQ.clone().invert();
  const iC = bodyC.createInterpolant();
  const iN = bodyN.createInterpolant();
  const qc = new THREE.Quaternion();
  const qn = new THREE.Quaternion();
  const qa = new THREE.Quaternion();
  const vals = new Float32Array(abd.values.length);
  abd.times.forEach((t, i) => {
    qc.fromArray(iC.evaluate(t));
    qn.fromArray(iN.evaluate(t % neutral.duration));
    qa.fromArray(abd.values, i * 4);
    // abdomen' = hips⁻¹ · bodyN⁻¹ · bodyC · hips · abdomen
    qn.invert().multiply(qc).multiply(hipsQ).multiply(qa).premultiply(hipsI).normalize();
    qn.toArray(vals, i * 4);
  });
  const tracks = clip.tracks.filter((t) => !LOWER.test(t.name) && t !== abd).map((t) => t.clone());
  tracks.push(new THREE.QuaternionKeyframeTrack("Abdomen.quaternion", abd.times.slice(), vals));
  for (const t of neutral.tracks) if (LOWER.test(t.name)) tracks.push(t.clone());
  return new THREE.AnimationClip(clip.name, clip.duration, tracks);
}

/**
 * Measure a locomotion clip on the template skeleton: the ground speed of the
 * planted foot (m/s at scale 1) and the cycle phase at which the left foot is
 * at mid-stance, so walk and run can be blended in step and played at the
 * rate that keeps the planted foot still.
 */
function analyzeGait(tpl, clip) {
  const arm = tpl.armature.clone(true);
  for (const ch of [...arm.children]) if (!ch.isBone) arm.remove(ch);
  const shin = arm.getObjectByName("LowerLegL");
  const mixer = new THREE.AnimationMixer(arm);
  mixer.clipAction(clip).play();
  const N = 120;
  const pts = [];
  for (let i = 0; i < N; i++) {
    mixer.setTime((clip.duration * i) / N);
    arm.updateMatrixWorld(true);
    const a = tpl.ankle.L.clone().applyMatrix4(shin.matrixWorld);
    pts.push({ ph: i / N, y: a.y, z: a.z });
  }
  mixer.stopAllAction();
  const minY = Math.min(...pts.map((p) => p.y));
  // the planted samples form one contiguous run (mod 1): find where it begins and unwrap it
  const planted = (i) => pts[(i + N) % N].y < minY + 0.01;
  let i0 = 0;
  while (i0 < N && !(planted(i0) && !planted(i0 - 1))) i0++;
  const run = [];
  for (let i = i0; i < i0 + N && planted(i); i++) run.push({ ph: i / N, z: pts[i % N].z });
  const n = run.length;
  const mt = run.reduce((s, p) => s + p.ph, 0) / n;
  const mz = run.reduce((s, p) => s + p.z, 0) / n;
  const k = run.reduce((s, p) => s + (p.ph - mt) * (p.z - mz), 0) / (run.reduce((s, p) => s + (p.ph - mt) ** 2, 0) || 1);
  return { speed: -k / clip.duration, mid: mt % 1, dur: clip.duration };
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
        for (const b of ["m", "f"]) {
          A.tpl[b] = makeTemplate(A[b][FILES[b][0]]);
          A.tpl[b].sole = soleOf(A[b][FILES[b][0]]);
          for (const n of ["Idle", "Wave"]) A.clips[b][n] = squareStance(A.tpl[b], A.clips[b][n], A.clips[b].Idle_Neutral);
          A.tpl[b].gait = { walk: analyzeGait(A.tpl[b], A.clips[b].Walk), run: analyzeGait(A.tpl[b], A.clips[b].Run) };
        }
        A.ready = true;
        A.waiting.splice(0).forEach((fn) => fn());
      })
      .catch((e) => {
        A.error = e;
        console.error("[ViceStreets3D] character assets failed to load", e);
      });
  }
  return A.promise;
}
export const characterAssetsReady = () => A.ready;

/* =================================================================== look → design */
export function resolveLook(look) {
  // an outfit is an id (player outfits / NPC uniforms) or inline colours (random pedestrians)
  const outfit = typeof look.outfit === "object" && look.outfit ? look.outfit : OUTFITS.find((o) => o.id === look.outfit) || NPC_OUTFITS[look.outfit] || OUTFITS[0];
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
  const oKey = typeof look.outfit === "object" ? JSON.stringify(look.outfit) : look.outfit;
  const h = hashStr(`${look.skin}|${look.hairStyle}|${look.hairColor}|${look.eyes}|${oKey}|${look.build}|${look.adult ? 1 : 0}|${look.faceSeed || 0}`);
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
      console.error("[ViceStreets3D] could not build character", e);
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
  "legLX", "legRX", "kneeL", "kneeR", "footL", "footR", "legLZ", "legRZ", "bodyYaw",
  "wIdle", "wWalk", "wRun", "wWave", "mouth", "smile",
];
const T0 = Object.fromEntries(CH.map((k) => [k, 0]));
T0.wIdle = 1;
/** Highest comfortable gait cycle rate (cycles/s, two steps each) for walking / running. */
const GAIT_RATE = [1.55, 2.3];
/** Longest stride, relative to the clip's, used when moving faster than that cadence allows. */
const MAX_STRIDE = 1.25;

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

/* ---- legs: feet on the ankles, stride scaling and ground following ----
 * All of this works in armature space (the rig's unscaled skeleton space,
 * x left, y up, z forward). */
const _mB = new THREE.Matrix4();
const _mU = new THREE.Matrix4();
const _mL = new THREE.Matrix4();
const _mRi = new THREE.Matrix4();
const _qP = new THREE.Quaternion();
const _qD = new THREE.Quaternion();
const _f = new THREE.Vector3();
const _t = new THREE.Vector3();
const _w = new THREE.Vector3();
const _fw = new THREE.Vector3();
const _up = new THREE.Vector3();
const _p1 = new THREE.Vector3();
const _p2 = new THREE.Vector3();
const _qR = new THREE.Quaternion();
const _qF = new THREE.Quaternion();
const LEG = {
  L: { hip: new THREE.Vector3(), knee: new THREE.Vector3(), ankle: new THREE.Vector3(), target: new THREE.Vector3(), slope: 0 },
  R: { hip: new THREE.Vector3(), knee: new THREE.Vector3(), ankle: new THREE.Vector3(), target: new THREE.Vector3(), slope: 0 },
};

/** Thigh / shin chain of one leg → hip, knee and ankle positions (armature space). */
function legChain(rig, s, o) {
  const ul = rig.bones[`UpperLeg${s}`];
  const ll = rig.bones[`LowerLeg${s}`];
  ul.updateMatrix();
  ll.updateMatrix();
  _mU.multiplyMatrices(_mB, ul.matrix);
  _mL.multiplyMatrices(_mU, ll.matrix);
  o.hip.setFromMatrixPosition(_mU);
  o.knee.setFromMatrixPosition(_mL);
  o.ankle.copy(A.tpl[rig.base].ankle[s]).applyMatrix4(_mL);
}

/** Turn `bone` (whose parent sits at armature matrix `parentM`) so armature-space direction `from` points along `to`. */
function aimBone(bone, parentM, from, to) {
  _qP.setFromRotationMatrix(parentM);
  _qD.setFromUnitVectors(from.normalize(), to.normalize());
  bone.quaternion.premultiply(_qP).premultiply(_qD).premultiply(_qP.invert());
}

/** Two-bone IK: bend the leg (keeping its knee plane) so the ankle reaches o.target. */
function solveLeg(rig, s, o) {
  const ul = rig.bones[`UpperLeg${s}`];
  const ll = rig.bones[`LowerLeg${s}`];
  const L1 = o.knee.distanceTo(o.hip);
  const L2 = o.ankle.distanceTo(o.knee);
  const dir = _t.subVectors(o.target, o.hip);
  const d = clamp(dir.length(), Math.abs(L1 - L2) + 1e-4, (L1 + L2) * 0.9995);
  dir.normalize();
  // knee keeps bending the way the clip bends it
  const pole = _w.subVectors(o.knee, o.hip);
  pole.z += 0.02; // a nearly straight leg still bends its knee forward
  pole.addScaledVector(dir, -pole.dot(dir));
  if (pole.lengthSq() < 1e-10) pole.set(0, 0, 1).addScaledVector(dir, -dir.z);
  pole.normalize();
  const a = (L1 * L1 - L2 * L2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
  const knee = pole.multiplyScalar(h).addScaledVector(dir, a).add(o.hip);
  const reach = dir.multiplyScalar(d).add(o.hip);
  aimBone(ul, _mB, _f.subVectors(o.knee, o.hip), knee.clone().sub(o.hip));
  legChain(rig, s, o);
  aimBone(ll, _mU, _f.subVectors(o.ankle, o.knee), reach.sub(o.knee));
  legChain(rig, s, o);
}

/** Ground height (m, relative to the character's own ground) under an armature-space point. */
function groundUnder(rig, ground, p) {
  _w.copy(p).applyMatrix4(rig.body.matrix).applyMatrix4(rig.root.matrix);
  return clamp(ground(_w.x, _w.z, rig.root.position.y) - rig.root.position.y, -0.3, 0.3);
}

/**
 * Put the feet on the ankles (their bones are IK targets off Root that the clips
 * never move) and lengthen the stride by `kz`. When `grounded`, keep the soles
 * from sinking below the floor and, given a ground sampler, follow uneven
 * ground per foot (height and slope). `lift` is how far the body is already
 * raised (m, e.g. a celebration hop or a crouch). Returns how far to lower the
 * body (m, ≤ 0) so the lower foot can reach its ground.
 */
function placeLegs(rig, kz, grounded, ground, lift, dt) {
  const Bn = rig.bones;
  const sole = A.tpl[rig.base].sole;
  Bn.Root.updateMatrix();
  Bn.Body.updateMatrix();
  _mB.multiplyMatrices(Bn.Root.matrix, Bn.Body.matrix);
  _mRi.copy(Bn.Root.matrix).invert();
  _qR.setFromRotationMatrix(Bn.Root.matrix);
  rig.body.updateMatrix();
  rig.root.updateMatrix();
  const gnd = rig.gnd || (rig.gnd = { L: 0, R: 0, pelvis: 0 });
  for (const s of ["L", "R"]) {
    const o = LEG[s];
    legChain(rig, s, o);
    o.target.copy(o.ankle);
    o.target.z = o.hip.z + (o.ankle.z - o.hip.z) * kz;
    o.slope = 0;
    gnd[s] = 0;
    if (ground) {
      // sample under the heel, middle and toe of the foot: three heights in a line are
      // a slope the foot lies along; a jump is a step edge, where it stays level on the tread
      _qF.multiplyQuaternions(_qR, Bn[`Foot${s}`].quaternion);
      _fw.set(0, 1, 0).applyQuaternion(_qF).setY(0);
      if (_fw.lengthSq() < 0.04) _fw.set(0, 0, 1);
      _fw.normalize();
      const hH = groundUnder(rig, ground, _p1.copy(o.target).addScaledVector(_fw, -sole.heel));
      const hM = groundUnder(rig, ground, _p1.copy(o.target).addScaledVector(_fw, (sole.toe - sole.heel) / 2));
      const hT = groundUnder(rig, ground, _p1.copy(o.target).addScaledVector(_fw, sole.toe));
      if (Math.abs(hM - (hH + hT) / 2) < 0.02) {
        gnd[s] = hH + ((hT - hH) * sole.heel) / (sole.toe + sole.heel);
        o.slope = Math.atan2(hT - hH, (sole.toe + sole.heel) * rig.body.scale.z);
      } else gnd[s] = Math.max(hH, hM);
    }
  }
  gnd.pelvis += (Math.min(0, gnd.L, gnd.R) - gnd.pelvis) * Math.min(1, dt * 10);
  const sy = rig.body.scale.y;
  for (const s of ["L", "R"]) {
    const o = LEG[s];
    const foot = Bn[`Foot${s}`];
    if (grounded) {
      const floor = (gnd[s] - gnd.pelvis - lift) / sy;
      o.target.y += (gnd[s] - gnd.pelvis) / sy;
      // foot axes in armature space: +Y runs heel → toe, −Z is the top of the foot
      _qF.multiplyQuaternions(_qR, foot.quaternion);
      _fw.set(0, 1, 0).applyQuaternion(_qF);
      _up.set(0, 0, -1).applyQuaternion(_qF);
      // a foot near the floor lies along the slope under it (ramps)
      const near = 1 - clamp((o.target.y - floor - sole.depth) / 0.08, 0, 1);
      if (o.slope && near > 0 && Math.hypot(_fw.x, _fw.z) > 0.5) {
        _ax.set(_fw.z, 0, -_fw.x).normalize();
        _qD.setFromAxisAngle(_ax, -clamp(o.slope, -0.6, 0.6) * near);
        foot.quaternion.premultiply(_qR).premultiply(_qD).premultiply(_qP.copy(_qR).invert());
        _fw.applyQuaternion(_qD);
        _up.applyQuaternion(_qD);
      }
      // the sole (heel and toe line) never goes below the floor
      const low = Math.min(-_fw.y * sole.heel - _up.y * sole.depth, _fw.y * sole.toe - _up.y * sole.depth * 0.4);
      o.target.y = Math.max(o.target.y, floor - low);
    }
    if (o.target.distanceToSquared(o.ankle) > 1e-10) solveLeg(rig, s, o);
    foot.position.copy(o.ankle).applyMatrix4(_mRi);
  }
  return gnd.pelvis;
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
  const sitting = pose.startsWith("sit") || pose === "eat" || pose === "write" || pose === "drive";
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
    if (pose === "drive") {
      // car seat: legs reach for the pedals, hands on the wheel turning with it
      const st = s.steer || 0;
      Object.assign(T, { legLX: -1.2, legRX: -1.2, kneeL: 0.95, kneeR: 0.95, footL: -0.15, footR: -0.15, spineX: -0.06, headX: 0.04 });
      Object.assign(T, { armLX: -1.0 + st * 0.25, armRX: -1.0 - st * 0.25, foreL: -0.62, foreR: -0.62, armLZ: -0.28 - st * 0.18, armRZ: 0.28 - st * 0.18, handL: -0.2, handR: -0.2 });
      T.headY = -st * 0.25;
      T.chestX = 0;
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
  if (s.surrender) Object.assign(T, { armLZ: 2.5, armRZ: -2.5, armLX: -0.3, armRX: -0.3, foreL: -0.5, foreR: -0.5, headX: 0.15, smile: -0.4 });
  if (s.hurt > 0) Object.assign(T, { spineX: T.spineX + 0.25, headX: T.headX + 0.2, smile: -0.6 });
  // ---- fighting (Vice Streets): stance, strikes, guard, dodges, hit reactions
  // Arm helper: x = raise forward (−), out = abduction away from the body
  // (+ out, − across the chest), fore = elbow bend (− bends).
  const arm = (side, x, out, fore) => {
    if (side > 0) {
      T.armRX = x;
      T.armRZ = -out;
      T.foreR = fore;
    } else {
      T.armLX = x;
      T.armLZ = out;
      T.foreL = fore;
    }
  };
  const P = s.punch;
  const M = P ? MOVES[P.move] : null;
  // the guard only while squared up (standing / shuffling) or striking —
  // walking or running away after a fight uses the normal arm swing
  const guard = P || s.block > 0 || (s.fight > 0 && sp < 1.2);
  if (guard) {
    // boxing guard: lead (left) fist forward at chin height, rear fist by the
    // jaw, elbows in, chin down; feet staggered (left forward), knees soft
    arm(-1, -1.05, -0.16, -2.15);
    arm(1, -0.82, -0.2, -2.3);
    Object.assign(T, { handL: 0.15, handR: 0.15, chestY: 0.16, headX: 0.12, headY: 0, smile: -0.5 });
    if (!moving) Object.assign(T, { legLX: -0.3, kneeL: 0.2, legRX: 0.24, kneeR: 0.34, footL: 0.08, footR: -0.12, drop: 0.07, spineX: 0.12, bodyY: Math.sin(t * 5.5 + seed) * 0.012 });
  }
  if (M) {
    const k = clamp(P.k, 0, 1);
    const hk = M.hitAt / M.dur;
    // wind-up builds until the strike launches; the limb is fully out at the
    // contact moment, holds briefly, then recovers to guard
    const sm = (a, b, x) => {
      const u = clamp((x - a) / (b - a), 0, 1);
      return u * u * (3 - 2 * u);
    };
    const lead = M.heavy ? 0.16 : 0.12;
    const wind = sm(0, hk - lead, k) * (1 - sm(hk - lead, hk - lead * 0.3, k));
    const ext = sm(hk - lead, hk, k) * (1 - sm(hk + 0.1, hk + (M.heavy ? 0.4 : 0.32), k));
    const env = Math.sin(clamp(k, 0, 1) * Math.PI);
    const sg = M.arm;
    switch (M.kind) {
      case "punch":
        if (sg < 0) {
          // jab: the lead hand snaps straight out, lead shoulder turns in
          arm(-1, -1.05 - ext * 0.55, -0.16 + ext * 0.1, -2.15 + wind * 0.1 + ext * 2.05);
          T.chestY = 0.16 + ext * 0.22 - wind * 0.05;
        } else {
          // cross: the rear hand drives through, hips and shoulders turn over, rear heel lifts
          arm(1, -0.82 + wind * 0.08 - ext * 0.78, -0.2 - ext * 0.06, -2.3 + ext * 2.2);
          T.chestY = 0.16 + wind * 0.12 - ext * 0.78;
          T.footR = -0.12 - ext * 0.35;
          T.kneeR = 0.34 + ext * 0.12;
        }
        T.spineX = 0.12 + ext * 0.08;
        break;
      case "hook":
      case "hhook": {
        // elbow up and bent ~90°, the fist swings round in a horizontal arc
        const big = M.kind === "hhook" ? 1.45 : 1;
        arm(sg, -0.95 - ext * 0.5 - wind * 0.15, -0.18 + wind * 0.55 * big - ext * 0.5 * big, -1.65 + wind * 0.15);
        T.chestY = 0.16 + sg * (wind * 0.35 * big - ext * 0.75 * big);
        T.spineX = 0.12 + ext * 0.06 * big;
        if (sg > 0) T.footR = -0.12 - ext * 0.3;
        else T.footL = 0.08 - ext * 0.25;
        if (M.kind === "hhook") {
          T.drop = 0.07 + wind * 0.05;
          T.kneeL = 0.2 + ext * 0.25;
        }
        break;
      }
      case "power":
        // loaded rear straight: sit back on the rear leg, then drive forward through it
        arm(1, -0.82 + wind * 0.3 - ext * 0.8, -0.2 + wind * 0.15 - ext * 0.08, -2.3 - wind * 0.1 + ext * 2.25);
        T.chestY = 0.16 + wind * 0.4 - ext * 0.95;
        T.spineX = 0.12 - wind * 0.1 + ext * 0.22;
        T.legLX = -0.3 - ext * 0.18;
        T.kneeL = 0.2 + ext * 0.3;
        T.kneeR = 0.34 + wind * 0.15;
        T.footR = -0.12 - ext * 0.45;
        T.drop = 0.07 + wind * 0.04;
        break;
      case "upper":
        // dip, then drive the rear fist up under the chin
        arm(1, -0.55 + wind * 0.4 - ext * 1.75, -0.1, -1.55 - wind * 0.3 + ext * 0.1);
        T.chestY = 0.16 + wind * 0.2 - ext * 0.5;
        T.spineX = 0.12 + wind * 0.15 - ext * 0.2;
        T.drop = 0.07 + wind * 0.1 - ext * 0.05;
        T.kneeL = 0.2 + wind * 0.25;
        T.kneeR = 0.34 + wind * 0.25;
        break;
      case "kick":
      case "skick":
      case "finisher": {
        // the right leg kicks (clip), arms out for balance, body leans away from the kick
        kickT = k;
        arm(-1, -0.6 - env * 0.2, 0.35 * env, -1.6);
        arm(1, -0.5 + env * 0.25, 0.3 * env, -1.7);
        T.spineX = 0.05 - ext * (M.kind === "finisher" ? 0.32 : 0.2);
        if (M.kind === "skick") {
          // side kick: hips turn side-on to the target and the leg drives out sideways
          T.bodyYaw = -1.15 * env;
          T.spineZ = -0.35 * ext;
          T.legRZ = -0.75 * ext;
          T.chestY = 0.3 * env;
        }
        if (M.kind === "finisher") {
          T.legRX = -0.45 * ext;
          T.bodyY = 0.05 * ext;
        }
        break;
      }
      default:
    }
  }
  if (s.block > 0 && !M) {
    // high guard: both forearms up in front of the face, chin tucked, braced
    arm(-1, -1.5, -0.38, -2.55);
    arm(1, -1.5, -0.38, -2.55);
    Object.assign(T, { headX: 0.3, spineX: 0.2, chestY: 0, handL: 0.3, handR: 0.3 });
    if (!moving) Object.assign(T, { kneeL: 0.32, kneeR: 0.38, drop: 0.09 });
  }
  if (s.dodge > 0) {
    // slip back out of range
    T.spineX = -0.3;
    T.spineZ = 0.22;
    T.headX = -0.1;
  }
  if (s.stagger > 0) {
    // knocked back off balance, arms flung out
    const st = clamp(s.stagger, 0, 1);
    T.spineX = T.spineX * (1 - st) - 0.32 * st;
    T.headX = T.headX * (1 - st) - 0.35 * st;
    T.armLZ = 0.7 * st + T.armLZ * (1 - st);
    T.armRZ = -0.7 * st + T.armRZ * (1 - st);
    T.armLX = -0.4 * st + T.armLX * (1 - st);
    T.armRX = -0.4 * st + T.armRX * (1 - st);
    T.kneeL = Math.max(T.kneeL, 0.25 * st);
    T.kneeR = Math.max(T.kneeR, 0.15 * st);
    // where the blow came from: hooks snap the head round, kicks to the body fold you over
    const hs = s.hitSide || 0;
    if (s.hitKind === "hook" || s.hitKind === "hhook") {
      T.headY += -hs * 0.55 * st;
      T.headZ += hs * 0.35 * st;
      T.chestY += -hs * 0.35 * st;
    } else if (s.hitKind === "upper") T.headX -= 0.35 * st;
    else if (s.hitKind === "kick" || s.hitKind === "finisher") {
      T.spineX = 0.45 * st;
      T.headX = 0.2 * st;
    }
    T.smile = -0.8;
    T.mouth = 0.4;
  }
  if (s.dance > 0 && !moving) {
    // dancing on the beat (124 BPM like the club music): knee bounce, hip
    // sway, head nod, and one of five arm styles
    const D = clamp(s.dance, 0, 1);
    const ph = t * (124 / 60) * Math.PI * 2 + seed;
    const bounce = (1 + Math.sin(ph)) / 2;
    const sway = Math.sin(ph / 2);
    const st = s.danceStyle ?? Math.floor(seed * 7) % 4;
    const set = (key, v) => (T[key] = T[key] * (1 - D) + v * D);
    set("drop", 0.04 + bounce * 0.07);
    set("kneeL", 0.2 + bounce * 0.25);
    set("kneeR", 0.2 + bounce * 0.25);
    set("legLX", -0.1 - bounce * 0.12);
    set("legRX", -0.1 - bounce * 0.12);
    set("spineZ", sway * 0.13);
    set("chestY", sway * 0.28);
    set("headX", 0.08 + Math.sin(ph) * 0.13);
    set("headY", sway * 0.25);
    if (st === 0) {
      // fist pump
      set("armRZ", -2.35 + Math.max(0, Math.sin(ph)) * 0.35);
      set("armRX", -0.2);
      set("foreR", -0.35 - bounce * 0.4);
      set("armLX", -0.7);
      set("foreL", -1.7);
    } else if (st === 1) {
      // arms swinging in front, alternating
      set("armLX", -0.75 + sway * 0.45);
      set("armRX", -0.75 - sway * 0.45);
      set("foreL", -1.6);
      set("foreR", -1.6);
    } else if (st === 2) {
      // hands in the air
      set("armLZ", 2.45 + sway * 0.15);
      set("armRZ", -2.45 + sway * 0.15);
      set("foreL", -0.4 - bounce * 0.3);
      set("foreR", -0.4 - bounce * 0.3);
    } else if (st === 3) {
      // shoulder shimmy
      set("armLX", -0.45);
      set("armRX", -0.45);
      set("foreL", -1.95);
      set("foreR", -1.95);
      set("chestY", sway * 0.45);
    } else {
      // DJ: a hand on the decks, the other on the headphones
      set("armRX", -1.05 + Math.sin(ph * 2) * 0.08);
      set("foreR", -0.8);
      set("armLZ", 1.95);
      set("armLX", -0.6);
      set("foreL", -2.4);
      set("headX", 0.22 + Math.sin(ph) * 0.18);
    }
    T.smile = 0.8;
    T.wIdle = 1;
    T.wWalk = 0;
    T.wRun = 0;
  }
  if (s.tuck > 0) {
    // tucked roll: knees to the chest, chin down, arms wrapped round the shins
    const u = clamp(s.tuck, 0, 1);
    for (const [key, v] of [["legLX", -1.75], ["legRX", -1.7], ["kneeL", 2.25], ["kneeR", 2.2], ["footL", 0.4], ["footR", 0.4], ["spineX", 0.55], ["chestX", 0.2], ["headX", 0.55], ["headY", 0], ["armLX", -1.1], ["armRX", -1.1], ["foreL", -1.9], ["foreR", -1.9], ["armLZ", -0.25], ["armRZ", 0.25], ["drop", 0.25]]) T[key] = T[key] * (1 - u) + v * u;
    Object.assign(T, { wIdle: 1, wWalk: 0, wRun: 0, smile: -0.5 });
  }
  if (s.cower > 0) {
    // crouched, hands over the head, trembling
    const sh = Math.sin(t * 31 + seed) * 0.03;
    Object.assign(T, { kneeL: 1.25, kneeR: 1.25, legLX: -0.95, legRX: -0.95, footL: 0.2, footR: 0.2, drop: 0.36, spineX: 0.5 + sh, headX: 0.45, armLX: -2.3, armRX: -2.3, foreL: -1.9, foreR: -1.9, armLZ: -0.25, armRZ: 0.25, smile: -0.8, mouth: 0.3, wIdle: 1, wWalk: 0, wRun: 0 });
  }
  if (s.limp > 0) {
    // on the ground (the body itself is laid down by the caller): loose and splayed
    const L = clamp(s.limp, 0, 1);
    for (const [key, v] of [["armLZ", 1.25], ["armRZ", -1.1], ["armLX", -0.3], ["armRX", 0.2], ["foreL", -0.35], ["foreR", -0.6], ["legLX", -0.12], ["legRX", 0.08], ["kneeL", 0.25], ["kneeR", 0.08], ["headY", 0.35], ["headX", -0.1], ["spineX", 0], ["chestY", 0]]) T[key] = T[key] * (1 - L) + v * L;
    T.smile = -0.6;
  }
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
  // punches and hits need a snappier blend than idle gestures
  const k = Math.min(1, dt * (s.snap ? 60 : s.punch ? 45 : s.stagger > 0 || s.block > 0 || s.dodge > 0 ? 18 : 9));
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
  // one gait clock drives both Walk and Run so a blend of the two stays in step
  // (left mid-stance at phase 0 in each). The cycle rate makes the planted foot
  // cover the ground speed; above a natural cadence the stride lengthens instead.
  const G = A.tpl[rig.base].gait;
  const loco = C.wWalk + C.wRun;
  const runK = loco > 1e-3 ? C.wRun / loco : T.wRun;
  const stride = (G.walk.speed * G.walk.dur + (G.run.speed * G.run.dur - G.walk.speed * G.walk.dur) * runK) * rig.body.scale.z;
  const f0 = sp / stride;
  const maxRate = GAIT_RATE[0] + (GAIT_RATE[1] - GAIT_RATE[0]) * runK;
  const kTarget = moving ? clamp(f0 / maxRate, 1, MAX_STRIDE) : 1;
  rig.strideK = (rig.strideK || 1) + (kTarget - (rig.strideK || 1)) * Math.min(1, dt * 6);
  rig.gaitPh = ((rig.gaitPh || 0) + (moving ? (dt * f0) / rig.strideK : 0)) % 1;
  X.walk.timeScale = 0;
  X.run.timeScale = 0;
  X.walk.time = ((rig.gaitPh + G.walk.mid) % 1) * G.walk.dur;
  X.run.time = ((rig.gaitPh + G.run.mid) % 1) * G.run.dur;
  // AnimationMixer only writes a property whose blended value changed since its
  // previous update, but every bone was just reset to rest: invalidate the
  // previous results so constant tracks (e.g. a still foot) are written too.
  for (const b of rig.mixer._bindings) b.buffer[rig.mixer._accuIndex * b.valueSize + b.valueSize] = NaN;
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
  rotC(rig, Bn.UpperLegL, 0, 0, 1, C.legLZ);
  rotC(rig, Bn.UpperLegR, 0, 0, 1, C.legRZ);
  rotC(rig, Bn.LowerLegL, 1, 0, 0, C.kneeL);
  rotC(rig, Bn.LowerLegR, 1, 0, 0, C.kneeR);
  rotC(rig, Bn.FootL, 1, 0, 0, C.footL);
  rotC(rig, Bn.FootR, 1, 0, 0, C.footR);
  const locoW = clamp(loco / wsum, 0, 1) * (1 - kw);
  const grounded = !sitting && !s.air;
  const pelvis = placeLegs(rig, 1 + (rig.strideK - 1) * locoW, grounded, grounded ? s.ground : null, C.bodyY - C.drop, dt);
  rig.body.position.y = C.bodyY - C.drop + pelvis;
  rig.body.rotation.y = C.bodyYaw;

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
