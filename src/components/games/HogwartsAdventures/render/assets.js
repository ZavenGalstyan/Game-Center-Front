/**
 * Character assets — reused CC0 Quaternius files already shipped in public/
 * (see public/models/neon-mercenary/LICENSE-Quaternius-CC0.txt and
 * public/models/mma/LICENSE-Quaternius-CC0.txt):
 *
 *   neon-mercenary/male.glb, female.glb   Universal Base Characters (65-bone UE rig)
 *   neon-mercenary/anims.glb              Universal Animation Library 1+2 selection
 *   mma/anims.glb                         same rig: ShieldIdle, Block, ShieldBash, Overhand…
 *
 * Every armour piece, garment, weapon, shield and creature is generated in
 * code (render/characters.js, render/creatures.js).
 *
 * Each clip is split three ways so the animator can layer them:
 *   full   all bones (attacks, rolls, deaths, casts…)
 *   lower  pelvis + legs (locomotion under a guarding / aiming torso)
 *   upper  spine, arms, head
 */
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

const BASE = import.meta.env?.BASE_URL || "/";
const NM = `${BASE}models/neon-mercenary/`;
const MMA = `${BASE}models/mma/`;
const MMA_CLIPS = { ShieldIdle: "ShieldIdle", Block: "Block", ShieldBash: "ShieldBash", Overhand: "Overhand", LJab: "LJab", LHook: "LHook", Push: "Push", Scratch: "Scratch" };
let promise = null;

export const LOWER = new Set(["pelvis", "thigh_l", "calf_l", "foot_l", "ball_l", "thigh_r", "calf_r", "foot_r", "ball_r"]);
export const LOOP_CLIPS = new Set(["Idle", "Walk", "Jog", "Sprint", "CrouchIdle", "CrouchWalk", "JumpLoop", "GunIdle", "AimMid", "AimUp", "AimDown", "BladeIdle", "Talk", "WalkFormal", "Sit", "CastIdle", "Dance", "FoldArms", "Phone", "Lean", "Yes", "No", "Fix", "ShieldIdle", "Scratch"]);

function split(clips, hipScale = 1) {
  const out = { full: {}, lower: {}, upper: {} };
  for (const c of clips) {
    const tracks = c.tracks
      .filter((t) => !t.name.startsWith("root."))
      .map((t) => {
        if (hipScale !== 1 && t.name === "pelvis.position") {
          const v = t.values.slice();
          for (let i = 0; i < v.length; i++) v[i] *= hipScale;
          return new THREE.VectorKeyframeTrack(t.name, t.times, v);
        }
        return t;
      });
    const lower = tracks.filter((t) => LOWER.has(t.name.split(".")[0]));
    const upper = tracks.filter((t) => !LOWER.has(t.name.split(".")[0]));
    out.full[c.name] = new THREE.AnimationClip(c.name, c.duration, tracks);
    out.lower[c.name] = new THREE.AnimationClip(`${c.name}_lo`, c.duration, lower);
    out.upper[c.name] = new THREE.AnimationClip(`${c.name}_up`, c.duration, upper);
  }
  return out;
}

export function loadAssets(onProgress) {
  if (promise) return promise;
  const loader = new GLTFLoader();
  const parts = { m: 0, f: 0, a: 0, b: 0 };
  const report = () => onProgress?.((parts.m + parts.f + parts.a + parts.b) / 4);
  const track = (k) => (e) => {
    if (e.total) parts[k] = e.loaded / e.total;
    report();
  };
  const tex = (n) =>
    new THREE.TextureLoader().loadAsync(`${NM}${n}`).then((t) => {
      t.flipY = false;
      t.colorSpace = THREE.SRGBColorSpace;
      return t;
    });
  promise = Promise.all([loader.loadAsync(`${NM}male.glb`, track("m")), loader.loadAsync(`${NM}female.glb`, track("f")), loader.loadAsync(`${NM}anims.glb`, track("a")), loader.loadAsync(`${MMA}anims.glb`, track("b")), tex("m_dark.jpg"), tex("f_dark.jpg")])
    .then(([male, female, anims, mma, mDark, fDark]) => {
      parts.m = parts.f = parts.a = parts.b = 1;
      report();
      const pelvisY = (g) => {
        let y = 1;
        g.scene.traverse((o) => o.isBone && o.name === "pelvis" && (y = o.position.length()));
        return y;
      };
      const ratio = pelvisY(female) / pelvisY(male);
      const extra = mma.animations.filter((c) => MMA_CLIPS[c.name]).map((c) => {
        const k = c.clone();
        k.name = MMA_CLIPS[c.name];
        return k;
      });
      const all = [...anims.animations, ...extra];
      return {
        bodies: { m: male, f: female },
        dark: { m: mDark, f: fDark },
        clips: { m: split(all), f: split(all, ratio) },
      };
    })
    .catch((err) => {
      promise = null;
      throw err;
    });
  return promise;
}
