/**
 * Character assets: CC0 Quaternius bodies + animation library
 * (public/models/neon-mercenary, see LICENSE-Quaternius-CC0.txt and
 * tools/buildAssets.mjs). Loaded once and shared; rigs are cloned.
 *
 * Every library clip is split three ways so the animator can layer them:
 *   full   all bones (one-shots: roll, death, slashes, interact…)
 *   lower  pelvis + legs (locomotion under an aiming torso)
 *   upper  spine, arms, head (gun poses on top of any locomotion)
 * The female body gets its own copies with hip translation re-scaled.
 */
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

const DIR = `${import.meta.env?.BASE_URL || "/"}models/neon-mercenary/`;
let promise = null;

export const LOWER = new Set(["pelvis", "thigh_l", "calf_l", "foot_l", "ball_l", "thigh_r", "calf_r", "foot_r", "ball_r"]);
export const LOOP_CLIPS = new Set(["Idle", "Walk", "Jog", "Sprint", "CrouchIdle", "CrouchWalk", "JumpLoop", "GunIdle", "AimMid", "AimUp", "AimDown", "BladeIdle", "Talk", "WalkFormal", "Sit", "CastIdle", "Dance", "FoldArms", "Phone", "Lean", "Yes", "No", "Fix"]);

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
  const parts = { m: 0, f: 0, a: 0 };
  const report = () => onProgress?.((parts.m + parts.f + parts.a) / 3);
  const track = (k) => (e) => {
    if (e.total) parts[k] = e.loaded / e.total;
    report();
  };
  const tex = (n) =>
    new THREE.TextureLoader().loadAsync(`${DIR}${n}`).then((t) => {
      t.flipY = false;
      t.colorSpace = THREE.SRGBColorSpace;
      return t;
    });
  promise = Promise.all([loader.loadAsync(`${DIR}male.glb`, track("m")), loader.loadAsync(`${DIR}female.glb`, track("f")), loader.loadAsync(`${DIR}anims.glb`, track("a")), tex("m_dark.jpg"), tex("f_dark.jpg")])
    .then(([male, female, anims, mDark, fDark]) => {
      parts.m = parts.f = parts.a = 1;
      report();
      const pelvisY = (g) => {
        let y = 1;
        g.scene.traverse((o) => o.isBone && o.name === "pelvis" && (y = o.position.length()));
        return y;
      };
      const ratio = pelvisY(female) / pelvisY(male);
      return {
        bodies: { m: male, f: female },
        dark: { m: mDark, f: fDark },
        clips: { m: split(anims.animations), f: split(anims.animations, ratio) },
      };
    })
    .catch((err) => {
      promise = null;
      throw err;
    });
  return promise;
}
