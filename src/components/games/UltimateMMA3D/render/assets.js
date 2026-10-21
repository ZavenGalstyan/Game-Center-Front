/**
 * Asset loading — fighter model, animation library, extra textures.
 *
 * All files are bundled under /public/models/mma (CC0 Quaternius assets, see
 * LICENSE-Quaternius-CC0.txt there and tools/buildAssets.mjs). Loading is
 * memoised: every match / preview shares one parsed copy; rigs are cloned.
 */
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { buildAuthoredClips } from "./clips.js";

const DIR = `${import.meta.env?.BASE_URL || "/"}models/mma/`;
let promise = null;

export function loadAssets(onProgress) {
  if (promise) return promise;
  const loader = new GLTFLoader();
  const parts = { fighter: 0, anims: 0, dark: 0 };
  const report = () => onProgress?.((parts.fighter + parts.anims + parts.dark) / 3);
  const track = (k) => (e) => {
    if (e.total) parts[k] = e.loaded / e.total;
    report();
  };
  promise = Promise.all([
    loader.loadAsync(`${DIR}fighter.glb`, track("fighter")),
    loader.loadAsync(`${DIR}anims.glb`, track("anims")),
    new THREE.TextureLoader().loadAsync(`${DIR}body_dark.jpg`),
  ])
    .then(([fighter, anims, dark]) => {
      parts.fighter = parts.anims = parts.dark = 1;
      report();
      dark.flipY = false;
      dark.colorSpace = THREE.SRGBColorSpace;
      const clips = {};
      anims.animations.forEach((c) => (clips[c.name] = c));
      Object.assign(clips, buildAuthoredClips(fighter.scene));
      return { fighter, clips, darkTex: dark };
    })
    .catch((err) => {
      promise = null; // allow a retry
      throw err;
    });
  return promise;
}
