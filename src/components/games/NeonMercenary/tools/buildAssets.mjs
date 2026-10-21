/**
 * Neon Mercenary — offline asset builder (not imported by the game).
 *
 *   node buildAssets.mjs <packs dir> <prepped images dir> [out dir]
 *
 * <packs dir> holds the unzipped CC0 Quaternius packs:
 *   ubc/   "Universal Base Characters[Standard]"   https://quaternius.itch.io/universal-base-characters
 *   ual1/  "Animation Library[Standard]"           https://opengameart.org/content/universal-animation-library
 *   ual2/  "Universal Animation Library 2 [Standard]" https://opengameart.org/content/universal-animation-library-2
 * <prepped images dir> is the output of tools/prepImages.py.
 *
 * Writes to public/models/neon-mercenary/ (default):
 *   male.glb / female.glb  Superhero_{Male,Female}_FullBody (65-bone UE skeleton,
 *                          eyes + brows) + static "origin at 0" hair meshes
 *                          (re-parented to the Head bone at runtime), JPEG textures.
 *   m_dark.jpg / f_dark.jpg  dark-skin albedo variants (swapped in at runtime).
 *   anims.glb              library clips baked onto the male skeleton (the female
 *                          rig re-scales hip translation at load). Finger and scale
 *                          tracks dropped, root tracks dropped (in place), 30 fps.
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
const OUT = outArg || path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../../../../public/models/neon-mercenary");
fs.mkdirSync(OUT, { recursive: true });
const UBC = `${packs}/ubc/Universal Base Characters[Standard]`;
const UAL1_FBX = `${packs}/ual1/Animation Library[Standard]/Unreal Engine/AL_Standard.fbx`;
const UAL2_GLB = `${packs}/ual2/Universal Animation Library 2 [Standard]/Unreal-Godot/UAL2_Standard.glb`;

const ab = (p) => {
  const b = fs.readFileSync(p);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
};
const pad4 = (n) => (n + 3) & ~3;

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

function loadGltfJson(file) {
  const j = JSON.parse(fs.readFileSync(file));
  const bin = fs.readFileSync(path.join(path.dirname(file), j.buffers[0].uri));
  return { j, bin };
}

/* ---------------------------------------------------------- bodies */
function buildBody(g) {
  const female = g === "f";
  const base = loadGltfJson(`${UBC}/Base Characters/Godot - UE/Superhero_${female ? "Female" : "Male"}_FullBody.gltf`);
  const hairDir = `${UBC}/Hairstyles/Origin at 0/glTF (Godot)`;
  const hairNames = female ? ["Hair_Buns", "Hair_BuzzedFemale", "Hair_Long"] : ["Hair_Buzzed", "Hair_SimpleParted", "Hair_Beard", "Hair_Long"];
  const hairs = hairNames.map((n) => ({ n, ...loadGltfJson(`${hairDir}/${n}.gltf`) }));

  const out = { asset: { version: "2.0", generator: "NeonMercenary buildAssets" }, scene: 0, scenes: [{ nodes: [] }], nodes: [], meshes: [], accessors: [], bufferViews: [], materials: [], textures: [], images: [], samplers: [{ magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 10497 }], skins: [] };
  const bb = binBuilder(out);
  const img = (name) => {
    out.images.push({ mimeType: "image/jpeg", name, bufferView: bb.add(fs.readFileSync(`${imgDir}/${name}.jpg`)) });
    out.textures.push({ sampler: 0, source: out.images.length - 1 });
    return out.textures.length - 1;
  };
  const T = { body: img(`${g}_light`), bodyN: img(`${g}_n`), bodyMR: img(`${g}_mr`), hair: img(female ? "hair2_c" : "hair1_c"), hairN: img(female ? "hair2_n" : "hair1_n"), eye: img("eye_c") };
  const skin = { name: "Skin", pbrMetallicRoughness: { baseColorTexture: { index: T.body }, metallicRoughnessTexture: { index: T.bodyMR }, metallicFactor: 1, roughnessFactor: 1 }, normalTexture: { index: T.bodyN } };
  const hair = { name: "Hair", pbrMetallicRoughness: { baseColorTexture: { index: T.hair }, metallicFactor: 0, roughnessFactor: 0.75 }, normalTexture: { index: T.hairN }, doubleSided: true };
  const MAT = {
    MI_Superhero_Male: skin,
    MI_Superhero_Female: skin,
    MI_Hair_1: hair,
    MI_Hair_2: hair,
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
  const merge = ({ j, bin }, rootName) => {
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
      if (rootName && c.mesh !== undefined && !c.skin) c.name = rootName;
      out.nodes.push(c);
    });
    (j.skins || []).forEach((s) => out.skins.push({ ...s, inverseBindMatrices: s.inverseBindMatrices + accOff, joints: s.joints.map((i) => i + nodeOff), ...(s.skeleton !== undefined ? { skeleton: s.skeleton + nodeOff } : {}) }));
    j.scenes[j.scene || 0].nodes.forEach((i) => out.scenes[0].nodes.push(i + nodeOff));
  };
  merge(base);
  hairs.forEach((h) => merge(h, h.n));
  writeGlb(`${OUT}/${female ? "female" : "male"}.glb`, out, bb.done());
  fs.copyFileSync(`${imgDir}/${g}_dark.jpg`, `${OUT}/${g}_dark.jpg`);
}

/* ------------------------------------------------------------- anims.glb */
const UAL1_CLIPS = {
  Idle_Loop: "Idle",
  Walk_Loop: "Walk",
  Jog_Fwd_Loop: "Jog",
  Sprint_Loop: "Sprint",
  Crouch_Idle_Loop: "CrouchIdle",
  Crouch_Fwd_Loop: "CrouchWalk",
  Roll: "Roll",
  Jump_Start: "JumpStart",
  Jump_Loop: "JumpLoop",
  Jump_Land: "JumpLand",
  Pistol_Idle_Loop: "GunIdle",
  Pistol_Aim_Neutral: "AimMid",
  Pistol_Aim_Up: "AimUp",
  Pistol_Aim_Down: "AimDown",
  Pistol_Shoot: "Shoot",
  Pistol_Reload: "Reload",
  Hit_Chest: "HitBody",
  Hit_Head: "HitHead",
  Death01: "Death",
  Sword_Idle: "BladeIdle",
  Sword_Attack: "BladeHeavy",
  Punch_Jab: "Jab",
  Punch_Cross: "Cross",
  Interact: "Interact",
  Idle_Talking_Loop: "Talk",
  Walk_Formal_Loop: "WalkFormal",
  Sitting_Idle_Loop: "Sit",
  Spell_Simple_Shoot: "Cast",
  Spell_Simple_Idle_Loop: "CastIdle",
  Fixing_Kneeling: "Fix",
  Dance_Loop: "Dance",
};
const UAL2_CLIPS = {
  Sword_Regular_A: "SlashA",
  Sword_Regular_B: "SlashB",
  Sword_Regular_C: "SlashC",
  Sword_Dash_RM: "BladeDash",
  Hit_Knockback: "Knockback",
  Idle_FoldArms_Loop: "FoldArms",
  Idle_TalkingPhone_Loop: "Phone",
  Idle_Rail_Loop: "Lean",
  Melee_Hook: "Hook",
  Consume: "Consume",
  LayToIdle: "GetUp",
  OverhandThrow: "Throw",
  Idle_Shield_Break: "Stagger",
  Yes: "Yes",
  Idle_No_Loop: "No",
};
const FINGER = /^(index|middle|ring|pinky|thumb)_/;
const FPS = 30;

async function buildAnims() {
  const ual2 = await new Promise((res, rej) => new GLTFLoader().parse(ab(UAL2_GLB), "", res, rej));
  const fbx = new FBXLoader().parse(ab(UAL1_FBX), "");
  const bones = [];
  ual2.scene.traverse((o) => o.isBone && bones.push(o));
  const maleGltf = JSON.parse(fs.readFileSync(`${UBC}/Base Characters/Godot - UE/Superhero_Male_FullBody.gltf`));
  const fPelvis = maleGltf.nodes.find((n) => n.name === "pelvis").translation;
  const mPelvis = bones.find((b) => b.name === "pelvis").position;
  const hipScale = fPelvis[2] / mPelvis.z;
  const scalePelvis = (t) => {
    const v = t.values.slice();
    for (let i = 0; i < v.length; i++) v[i] *= hipScale;
    return new THREE.VectorKeyframeTrack(t.name, t.times, v);
  };
  const clips = [];
  const keep = (name) => !FINGER.test(name) && !name.endsWith("_leaf_l") && !name.endsWith("_leaf_r") && !/_end_/.test(name);
  // root-motion clips: keep the pelvis's vertical motion only (horizontal drift → in place)
  const RM = new Set(["Sword_Dash_RM"]);
  const flatten = (t) => {
    const v = t.values.slice();
    for (let i = 0; i < v.length; i += 3) {
      v[i] = v[0];
      v[i + 1] = v[1];
    }
    return new THREE.VectorKeyframeTrack(t.name, t.times, v);
  };
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
    clips.push(new THREE.AnimationClip(dst, c.duration, tracks.map((t) => (t.name.endsWith(".position") ? (RM.has(src) ? flatten(scalePelvis(t)) : scalePelvis(t)) : t.clone()))));
  }

  const json = { asset: { version: "2.0", generator: "NeonMercenary buildAssets" }, scene: 0, scenes: [{ nodes: [] }], nodes: [], accessors: [], bufferViews: [], animations: [] };
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

buildBody("m");
buildBody("f");
await buildAnims();
fs.writeFileSync(
  `${OUT}/LICENSE-Quaternius-CC0.txt`,
  `Neon Mercenary — 3D character assets

male.glb, female.glb, m_dark.jpg, f_dark.jpg
  "Universal Base Characters" (Standard) by Quaternius — Superhero_Male_FullBody,
  Superhero_Female_FullBody, hairstyles (Buzzed, Simple Parted, Beard, Long, Buns,
  Buzzed Female), eye / hair / body textures (resized to JPEG).
  https://quaternius.itch.io/universal-base-characters

anims.glb
  "Universal Animation Library" (Standard) by Quaternius
  https://opengameart.org/content/universal-animation-library
  "Universal Animation Library 2" (Standard) by Quaternius
  https://opengameart.org/content/universal-animation-library-2
  Selected clips resampled to 30 fps; finger, scale and root tracks removed.

Clothing, armour, cyberware, weapons, robots and drones are generated in code
by the game (render/gear.js, render/robots.js) — no other third-party assets.

License: CC0 1.0 Universal (CC0 1.0) Public Domain Dedication
https://creativecommons.org/publicdomain/zero/1.0/

Models by @Quaternius — https://www.patreon.com/quaternius
`
);
