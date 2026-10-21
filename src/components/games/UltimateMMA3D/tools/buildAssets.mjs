/**
 * Ultimate MMA Championship 3D — offline asset builder (not imported by the game).
 *
 *   node buildAssets.mjs <packs dir> <prepped images dir> [out dir]
 *
 * <packs dir> holds the unzipped CC0 Quaternius packs:
 *   ubc/   "Universal Base Characters[Standard]"   https://quaternius.itch.io/universal-base-characters
 *   ual1/  "Animation Library[Standard]"           https://opengameart.org/content/universal-animation-library
 *   ual2/  "Universal Animation Library 2 [Standard]" https://opengameart.org/content/universal-animation-library-2
 * <prepped images dir> is the output of tools/prepImages.py.
 *
 * Writes to public/models/mma/ (default):
 *   fighter.glb  Superhero_Male_FullBody (7.3k-vertex athletic body, 65-bone UE
 *                skeleton, eyes + brows) + static hair/beard meshes (origin at 0,
 *                parented to the Head bone at runtime), 1024² JPEG textures.
 *   body_dark.jpg  the dark-skin albedo variant (swapped in at runtime).
 *   anims.glb    library clips baked onto the fighter skeleton: UAL1 (Unreal FBX,
 *                cm → m, same bone names/rest) + UAL2 (glTF, identical skeleton).
 *                Finger tracks are dropped (fighters wear gloves — the runtime
 *                holds a fist), scale tracks dropped, resampled to 30 fps.
 */
import fs from "node:fs";
import path from "node:path";
import * as THREE from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

globalThis.self = globalThis;
globalThis.ProgressEvent ??= class extends Event {
  constructor(t, o) {
    super(t);
    Object.assign(this, o);
  }
};

const [packs, imgDir, outArg] = process.argv.slice(2);
if (!packs || !imgDir) {
  console.error("usage: node buildAssets.mjs <packs dir> <images dir> [out dir]");
  process.exit(1);
}
const OUT = outArg || path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../../../../public/models/mma");
fs.mkdirSync(OUT, { recursive: true });
const UBC = `${packs}/ubc/Universal Base Characters[Standard]`;
const UAL1_FBX = `${packs}/ual1/Animation Library[Standard]/Unreal Engine/AL_Standard.fbx`;
const UAL2_GLB = `${packs}/ual2/Universal Animation Library 2 [Standard]/Unreal-Godot/UAL2_Standard.glb`;

const ab = (p) => {
  const b = fs.readFileSync(p);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
};
const pad4 = (n) => (n + 3) & ~3;

/* ------------------------------------------------------------- GLB writing */
function writeGlb(file, json, bin) {
  const jsonBuf = Buffer.from(JSON.stringify(json));
  const jLen = pad4(jsonBuf.length);
  const bLen = pad4(bin.length);
  const out = Buffer.alloc(12 + 8 + jLen + 8 + bLen);
  out.writeUInt32LE(0x46546c67, 0);
  out.writeUInt32LE(2, 4);
  out.writeUInt32LE(out.length, 8);
  out.writeUInt32LE(jLen, 12);
  out.writeUInt32LE(0x4e4f534a, 16);
  jsonBuf.copy(out, 20);
  out.fill(0x20, 20 + jsonBuf.length, 20 + jLen);
  out.writeUInt32LE(bLen, 20 + jLen);
  out.writeUInt32LE(0x004e4942, 24 + jLen);
  bin.copy(out, 28 + jLen);
  fs.writeFileSync(file, out);
  console.log(`wrote ${path.basename(file)}  ${(out.length / 1024).toFixed(0)} KB`);
}

/** Append-only binary builder for bufferViews. */
function binBuilder(json) {
  const parts = [];
  let len = 0;
  json.bufferViews ??= [];
  return {
    add(buf, target) {
      const off = pad4(len);
      if (off > len) parts.push(Buffer.alloc(off - len));
      parts.push(buf);
      len = off + buf.length;
      json.bufferViews.push({ buffer: 0, byteOffset: off, byteLength: buf.length, ...(target ? { target } : {}) });
      return json.bufferViews.length - 1;
    },
    done() {
      const b = Buffer.concat(parts);
      json.buffers = [{ byteLength: b.length }];
      return b;
    },
  };
}

/* ---------------------------------------------------------- fighter.glb */
/**
 * Merge a separate .gltf (+ .bin) into `dst` (json + list of binary parts),
 * remapping indices. Images are replaced by JPEGs from imgDir by role.
 */
function loadGltfJson(file) {
  const j = JSON.parse(fs.readFileSync(file));
  const bin = fs.readFileSync(path.join(path.dirname(file), j.buffers[0].uri));
  return { j, bin };
}

function buildFighter() {
  const base = loadGltfJson(`${UBC}/Base Characters/Godot - UE/Superhero_Male_FullBody.gltf`);
  const hairDir = `${UBC}/Hairstyles/Origin at 0/glTF (Godot)`;
  const hairs = ["Hair_Buzzed", "Hair_SimpleParted", "Hair_Beard", "Hair_Long"].map((n) => ({ n, ...loadGltfJson(`${hairDir}/${n}.gltf`) }));

  const out = { asset: { version: "2.0", generator: "UltimateMMA3D buildAssets" }, scene: 0, scenes: [{ nodes: [] }], nodes: [], meshes: [], accessors: [], bufferViews: [], materials: [], textures: [], images: [], samplers: [{ magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 10497 }], skins: [] };
  const bb = binBuilder(out);

  // images (one shared set)
  const img = (name) => {
    out.images.push({ mimeType: "image/jpeg", name, bufferView: bb.add(fs.readFileSync(`${imgDir}/${name}.jpg`)) });
    out.textures.push({ sampler: 0, source: out.images.length - 1 });
    return out.textures.length - 1;
  };
  const T = { body: img("body_light"), bodyN: img("body_n"), bodyMR: img("body_mr"), hair: img("hair_c"), hairN: img("hair_n"), eye: img("eye_c") };
  const MAT = {
    MI_Superhero_Male: { name: "Skin", pbrMetallicRoughness: { baseColorTexture: { index: T.body }, metallicRoughnessTexture: { index: T.bodyMR }, metallicFactor: 1, roughnessFactor: 1 }, normalTexture: { index: T.bodyN } },
    MI_Hair_1: { name: "Hair", pbrMetallicRoughness: { baseColorTexture: { index: T.hair }, metallicFactor: 0, roughnessFactor: 0.75 }, normalTexture: { index: T.hairN }, doubleSided: true },
    MI_Hair_2: { name: "Hair", pbrMetallicRoughness: { baseColorTexture: { index: T.hair }, metallicFactor: 0, roughnessFactor: 0.75 }, normalTexture: { index: T.hairN }, doubleSided: true },
    MI_Eyes: { name: "Eyes", pbrMetallicRoughness: { baseColorTexture: { index: T.eye }, metallicFactor: 0, roughnessFactor: 0.25 } },
  };
  const matIndex = {};
  const mat = (name) => {
    const key = MAT[name] ? MAT[name].name : name;
    if (matIndex[key] === undefined) {
      out.materials.push(MAT[name] || { name });
      matIndex[key] = out.materials.length - 1;
    }
    return matIndex[key];
  };

  const merge = ({ j, bin }, rootNames) => {
    const bvMap = j.bufferViews.map((v) => bb.add(bin.subarray(v.byteOffset || 0, (v.byteOffset || 0) + v.byteLength), v.target));
    const accOff = out.accessors.length;
    j.accessors.forEach((a) => out.accessors.push({ ...a, bufferView: bvMap[a.bufferView] }));
    const meshOff = out.meshes.length;
    j.meshes.forEach((m) =>
      out.meshes.push({
        name: m.name,
        primitives: m.primitives.map((p) => ({
          attributes: Object.fromEntries(Object.entries(p.attributes).map(([k, v]) => [k, v + accOff])),
          indices: p.indices + accOff,
          material: mat(j.materials[p.material].name),
          mode: p.mode,
        })),
      })
    );
    const nodeOff = out.nodes.length;
    const skinOff = out.skins.length;
    j.nodes.forEach((n) => {
      const c = { ...n };
      if (c.children) c.children = c.children.map((i) => i + nodeOff);
      if (c.mesh !== undefined) c.mesh += meshOff;
      if (c.skin !== undefined) c.skin += skinOff;
      if (rootNames && c.mesh !== undefined && !c.skin) c.name = rootNames;
      out.nodes.push(c);
    });
    (j.skins || []).forEach((s) => out.skins.push({ ...s, inverseBindMatrices: s.inverseBindMatrices + accOff, joints: s.joints.map((i) => i + nodeOff), ...(s.skeleton !== undefined ? { skeleton: s.skeleton + nodeOff } : {}) }));
    j.scenes[j.scene || 0].nodes.forEach((i) => out.scenes[0].nodes.push(i + nodeOff));
  };
  merge(base);
  hairs.forEach((h) => merge(h, h.n));
  const bin = bb.done();
  writeGlb(`${OUT}/fighter.glb`, out, bin);
  fs.copyFileSync(`${imgDir}/body_dark.jpg`, `${OUT}/body_dark.jpg`);
}

/* ------------------------------------------------------------- anims.glb */
const UAL1_CLIPS = {
  Idle_Loop: "Idle",
  Walk_Loop: "Walk",
  Jog_Fwd_Loop: "Jog",
  Punch_Jab: "LJab",
  Punch_Cross: "LCross",
  Hit_Chest: "HitBody",
  Hit_Head: "HitHead",
  Death01: "Death",
  Roll: "Roll",
  Crouch_Idle_Loop: "Crouch",
  Dance_Loop: "Dance",
  Jump_Start: "JumpStart",
  Jump_Land: "JumpLand",
  Idle_Talking_Loop: "Talk",
  Sword_Idle: "SwordIdle",
  Push_Loop: "Push",
};
const UAL2_CLIPS = {
  Melee_Hook: "LHook",
  Melee_Hook_Rec: "LHookRec",
  Hit_Knockback: "Knockback",
  LayToIdle: "GetUp",
  Idle_Shield_Break: "Stagger",
  Idle_Shield_Loop: "ShieldIdle",
  Sword_Block: "Block",
  Yes: "Yes",
  Idle_FoldArms_Loop: "FoldArms",
  OverhandThrow: "Overhand",
  NinjaJump_Land: "Land",
  Idle_No_Loop: "No",
  Zombie_Scratch: "Scratch",
  Shield_OneShot: "ShieldBash",
};
const FINGER = /^(index|middle|ring|pinky|thumb)_/;
const FPS = 30;

async function buildAnims() {
  const ual2 = await new Promise((res, rej) => new GLTFLoader().parse(ab(UAL2_GLB), "", res, rej));
  const fbx = new FBXLoader().parse(ab(UAL1_FBX), "");
  // target skeleton = UAL2 mannequin (identical joint names/rest to the fighter)
  const bones = [];
  ual2.scene.traverse((o) => o.isBone && bones.push(o));
  // Both libraries store pelvis translation in the root bone's frame, in metres
  // (the FBX's 'Rig' group carries the ×100 / −90° X). The fighter's hips sit a
  // little higher than the mannequin's → scale hip translation by the ratio.
  const fighterGltf = JSON.parse(fs.readFileSync(`${UBC}/Base Characters/Godot - UE/Superhero_Male_FullBody.gltf`));
  const fPelvis = fighterGltf.nodes.find((n) => n.name === "pelvis").translation;
  const mPelvis = bones.find((b) => b.name === "pelvis").position;
  const hipScale = fPelvis[2] / mPelvis.z;
  const scalePelvis = (t) => {
    const v = t.values.slice();
    for (let i = 0; i < v.length; i++) v[i] *= hipScale;
    return new THREE.VectorKeyframeTrack(t.name, t.times, v);
  };

  const clips = [];
  const keep = (name) => !FINGER.test(name) && !name.endsWith("_leaf_l") && !name.endsWith("_leaf_r") && !/_end_/.test(name);
  // UAL1 (FBX): same bone names / rest as UAL2; root tracks skipped (in place).
  for (const [src, dst] of Object.entries(UAL1_CLIPS)) {
    const c = fbx.animations.find((a) => a.name === `Rig|${src}`);
    if (!c) throw new Error(`UAL1 clip missing: ${src}`);
    const tracks = [];
    for (const t of c.tracks) {
      const [bone, prop] = t.name.split(".");
      if (prop === "scale" || bone === "root" || !keep(bone)) continue;
      if (prop === "position" && bone !== "pelvis") continue;
      tracks.push(prop === "position" ? scalePelvis(t) : t.clone());
    }
    clips.push(new THREE.AnimationClip(dst, c.duration, tracks));
  }
  for (const [src, dst] of Object.entries(UAL2_CLIPS)) {
    const c = ual2.animations.find((a) => a.name === src);
    if (!c) throw new Error(`UAL2 clip missing: ${src}`);
    const tracks = c.tracks.filter((t) => {
      const [bone, prop] = t.name.split(".");
      return prop !== "scale" && bone !== "root" && keep(bone) && (prop !== "position" || bone === "pelvis");
    });
    clips.push(new THREE.AnimationClip(dst, c.duration, tracks.map((t) => (t.name.endsWith(".position") ? scalePelvis(t) : t.clone()))));
  }

  // nodes = skeleton (no fingers), animations resampled
  const json = { asset: { version: "2.0", generator: "UltimateMMA3D buildAssets" }, scene: 0, scenes: [{ nodes: [] }], nodes: [], accessors: [], bufferViews: [], animations: [] };
  const bb = binBuilder(json);
  const idx = new Map();
  const kept = bones.filter((b) => keep(b.name));
  kept.forEach((b, i) => idx.set(b.name, i));
  kept.forEach((b) => {
    const n = { name: b.name, translation: b.position.toArray(), rotation: b.quaternion.toArray() };
    const ch = b.children.filter((c) => idx.has(c.name)).map((c) => idx.get(c.name));
    if (ch.length) n.children = ch;
    json.nodes.push(n);
  });
  json.scenes[0].nodes.push(idx.get("root"));
  const acc = (arr, type, minmax) => {
    const buf = Buffer.from(new Float32Array(arr).buffer);
    const a = { bufferView: bb.add(buf), componentType: 5126, count: arr.length / (type === "SCALAR" ? 1 : type === "VEC3" ? 3 : 4), type };
    if (minmax) {
      a.min = [Math.min(...arr)];
      a.max = [Math.max(...arr)];
    }
    json.accessors.push(a);
    return json.accessors.length - 1;
  };
  for (const clip of clips) {
    const n = Math.max(2, Math.round(clip.duration * FPS) + 1);
    const times = Array.from({ length: n }, (_, i) => Math.min(clip.duration, i / FPS));
    const tAcc = acc(times, "SCALAR", true);
    const anim = { name: clip.name, samplers: [], channels: [] };
    for (const t of clip.tracks) {
      const [bone, prop] = t.name.split(".");
      if (!idx.has(bone)) continue;
      const interp = t.createInterpolant();
      const size = t.getValueSize();
      const vals = [];
      for (const tm of times) vals.push(...interp.evaluate(tm));
      if (prop === "quaternion")
        for (let i = 0; i < vals.length; i += 4) {
          const l = Math.hypot(vals[i], vals[i + 1], vals[i + 2], vals[i + 3]) || 1;
          for (let k = 0; k < 4; k++) vals[i + k] /= l;
        }
      anim.samplers.push({ input: tAcc, output: acc(vals, size === 4 ? "VEC4" : "VEC3"), interpolation: "LINEAR" });
      anim.channels.push({ sampler: anim.samplers.length - 1, target: { node: idx.get(bone), path: prop === "quaternion" ? "rotation" : "translation" } });
    }
    json.animations.push(anim);
  }
  writeGlb(`${OUT}/anims.glb`, json, bb.done());
  console.log("clips:", clips.map((c) => `${c.name}(${c.duration.toFixed(2)}s)`).join(" "));
}

buildFighter();
await buildAnims();
fs.writeFileSync(
  `${OUT}/LICENSE-Quaternius-CC0.txt`,
  `Ultimate MMA Championship 3D — 3D assets

fighter.glb, body_dark.jpg
  "Universal Base Characters" (Standard) by Quaternius — Superhero_Male_FullBody,
  hairstyles (Buzzed, Simple Parted, Beard, Long), eye/hair/body textures
  (resized to JPEG; the roughness texture's R channel now holds a shorts mask).
  https://quaternius.itch.io/universal-base-characters

anims.glb
  "Universal Animation Library" (Standard) by Quaternius
  https://opengameart.org/content/universal-animation-library
  "Universal Animation Library 2" (Standard) by Quaternius
  https://opengameart.org/content/universal-animation-library-2
  Selected clips resampled to 30 fps; finger and scale tracks removed.

License: CC0 1.0 Universal (CC0 1.0) Public Domain Dedication
https://creativecommons.org/publicdomain/zero/1.0/

Models by @Quaternius — https://www.patreon.com/quaternius
`
);
