/**
 * Asset loading + caching. Everything is fetched lazily: the menu needs only
 * the HDRI, one rig and a few props; each battle then loads its environment's
 * textures/props and its monster's parts. Loaded assets are shared between
 * battles and released by disposeAssets() when the game unmounts.
 *
 * Sources (see public/models/deck-of-shadows/LICENSE.txt):
 *   props/*.glb, tex/*.webp, env.hdr  Poly Haven (CC0)
 *   props/skull.glb                   Khronos glTF-Sample-Assets "ScatteringSkull" (CC0)
 *   ../neon-mercenary/*, ../mma/anims.glb  Quaternius UBC + UAL (CC0)
 */
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { RGBELoader } from "three/examples/jsm/loaders/RGBELoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";

const BASE = import.meta.env?.BASE_URL || "/";
const DIR = `${BASE}models/deck-of-shadows/`;
const RIG_DIR = `${BASE}models/neon-mercenary/`;
const MMA_DIR = `${BASE}models/mma/`;

let gltfLoader = null;
const cache = new Map(); // key -> promise
const disposables = new Set();
let maxAniso = 4;

function loader() {
  if (!gltfLoader) {
    gltfLoader = new GLTFLoader();
    gltfLoader.setMeshoptDecoder(MeshoptDecoder);
  }
  return gltfLoader;
}

export function setAnisotropy(n) {
  maxAniso = Math.max(1, n | 0);
}

function once(key, make) {
  if (!cache.has(key)) {
    const p = make().catch((e) => {
      cache.delete(key);
      throw e;
    });
    cache.set(key, p);
  }
  return cache.get(key);
}

function track(gltf) {
  gltf.scene.traverse((o) => {
    if (o.geometry) disposables.add(o.geometry);
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of mats) {
      disposables.add(m);
      for (const k of Object.keys(m)) if (m[k]?.isTexture) disposables.add(m[k]);
    }
  });
  return gltf;
}

/** A Poly Haven prop: a fresh clone each call (materials shared). */
export function loadProp(name) {
  return once(`prop:${name}`, () =>
    loader()
      .loadAsync(`${DIR}props/${name}.glb`)
      .then(track)
      .then((g) => {
        g.scene.traverse((o) => {
          if (o.isMesh) {
            o.castShadow = true;
            o.receiveShadow = true;
            const m = o.material;
            for (const k of ["map", "normalMap", "roughnessMap", "metalnessMap", "aoMap"]) if (m[k]) m[k].anisotropy = maxAniso;
          }
        });
        return g.scene;
      }),
  ).then((scene) => {
    const c = scene.clone(true);
    c.traverse((o) => {
      if (o.isMesh) o.userData.sharedGeo = o.userData.sharedMat = true;
    });
    return c;
  });
}

/**
 * One named piece (or the i-th mesh) of a multi-object prop, detached with its
 * world transform baked into the returned group (centred on X/Z, grounded).
 */
export async function loadPart(name, pick, scale = 1) {
  const p = await loadProp(name);
  p.updateMatrixWorld(true);
  let node = null;
  if (typeof pick === "number") {
    const meshes = [];
    p.traverse((o) => o.isMesh && meshes.push(o));
    node = meshes[pick] || meshes[0];
  } else p.traverse((o) => !node && o.name.endsWith(pick) && (node = o));
  node = node || p;
  const m = node.matrixWorld.clone();
  node.removeFromParent();
  node.matrix.copy(m);
  node.matrix.decompose(node.position, node.quaternion, node.scale);
  node.scale.multiplyScalar(scale);
  node.position.multiplyScalar(scale);
  const g = new THREE.Group();
  g.add(node);
  g.updateMatrixWorld(true);
  const bb = new THREE.Box3().setFromObject(g);
  const c = bb.getCenter(new THREE.Vector3());
  node.position.x -= c.x;
  node.position.z -= c.z;
  node.position.y -= bb.min.y;
  return g;
}

/** Scale + ground a prop so its height (or `axis` size) is `size` metres. */
export function fitProp(obj, size, axis = "y", ground = true) {
  obj.updateMatrixWorld(true);
  const bb = new THREE.Box3().setFromObject(obj);
  const dim = bb.getSize(new THREE.Vector3());
  const s = size / Math.max(1e-6, dim[axis]);
  obj.scale.multiplyScalar(s);
  obj.updateMatrixWorld(true);
  const bb2 = new THREE.Box3().setFromObject(obj);
  const c = bb2.getCenter(new THREE.Vector3());
  obj.position.x -= c.x;
  obj.position.z -= c.z;
  if (ground) obj.position.y -= bb2.min.y;
  else obj.position.y -= c.y;
  const wrap = new THREE.Group();
  wrap.add(obj);
  return wrap;
}

/**
 * A tiling PBR set (Poly Haven 1k WebP: _d albedo, _n OpenGL normal, _arm =
 * AO/roughness/metal). Returns a MeshStandardMaterial; textures are shared by
 * every material made from the same set, repeat is per material.
 */
const texCache = new Map();
function tex(url, srgb) {
  if (!texCache.has(url)) {
    const t = new THREE.TextureLoader().load(url);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = maxAniso;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    texCache.set(url, t);
    disposables.add(t);
  }
  return texCache.get(url);
}

export function pbr(set, { repeat = [1, 1], color = 0xffffff, normalScale = 1, roughness = 1, metalness = 0, envMapIntensity = 1, aoIntensity = 1 } = {}) {
  const clone = (t) => {
    const c = t.clone();
    c.repeat.set(repeat[0], repeat[1]);
    c.needsUpdate = true;
    disposables.add(c);
    return c;
  };
  const d = clone(tex(`${DIR}tex/${set}_d.webp`, true));
  const n = clone(tex(`${DIR}tex/${set}_n.webp`, false));
  const arm = clone(tex(`${DIR}tex/${set}_arm.webp`, false));
  const m = new THREE.MeshStandardMaterial({
    map: d,
    normalMap: n,
    normalScale: new THREE.Vector2(normalScale, normalScale),
    roughnessMap: arm,
    metalnessMap: metalness > 0 ? arm : null,
    aoMap: arm,
    aoMapIntensity: aoIntensity,
    roughness,
    metalness,
    color,
    envMapIntensity,
  });
  disposables.add(m);
  return m;
}

/** Just the texture maps of a PBR set (for creature materials). */
export function pbrMaps(set, repeat = [1, 1]) {
  const clone = (t) => {
    const c = t.clone();
    c.repeat.set(repeat[0], repeat[1]);
    c.needsUpdate = true;
    disposables.add(c);
    return c;
  };
  const arm = clone(tex(`${DIR}tex/${set}_arm.webp`, false));
  return { map: clone(tex(`${DIR}tex/${set}_d.webp`, true)), normalMap: clone(tex(`${DIR}tex/${set}_n.webp`, false)), roughnessMap: arm, aoMap: arm, metalnessMap: arm };
}

/** Wait until the textures of a set are decoded (for the loading bar). */
export function preloadSets(sets) {
  return Promise.all(
    sets.flatMap((s) =>
      ["d", "n", "arm"].map(
        (k) =>
          new Promise((res) => {
            const t = tex(`${DIR}tex/${s}_${k}.webp`, k === "d");
            if (t.image && (t.image.complete ?? true) && t.image.width) return res();
            const img = new Image();
            img.onload = img.onerror = () => res();
            img.src = `${DIR}tex/${s}_${k}.webp`;
          }),
      ),
    ),
  );
}

/**
 * PMREM environment from the CC0 moonlit HDRI. The decoded HDR is shared;
 * the PMREM is GPU-side and belongs to one renderer, so it is made per
 * renderer (StrictMode remounts create a fresh renderer).
 */
const envByRenderer = new WeakMap();
export function loadEnvironment(renderer) {
  if (envByRenderer.has(renderer)) return envByRenderer.get(renderer);
  const p = once("hdr", () =>
    new RGBELoader().loadAsync(`${DIR}env.hdr`).then((hdr) => {
      hdr.mapping = THREE.EquirectangularReflectionMapping;
      disposables.add(hdr);
      return hdr;
    }),
  ).then((hdr) => {
    const pm = new THREE.PMREMGenerator(renderer);
    const rt = pm.fromEquirectangular(hdr);
    pm.dispose();
    disposables.add(rt);
    return rt.texture;
  });
  p.catch(() => envByRenderer.delete(renderer));
  envByRenderer.set(renderer, p);
  return p;
}

/** Quaternius rigs + animation libraries. */
export function loadRigs() {
  return once("rigs", () =>
    Promise.all([
      loader().loadAsync(`${RIG_DIR}male.glb`),
      loader().loadAsync(`${RIG_DIR}female.glb`),
      loader().loadAsync(`${RIG_DIR}anims.glb`),
      loader().loadAsync(`${MMA_DIR}anims.glb`),
    ]).then(([male, female, a1, a2]) => {
      track(male);
      track(female);
      const clips = {};
      for (const c of a1.animations) clips[c.name] = c;
      for (const c of a2.animations) if (!clips[c.name]) clips[c.name] = c;
      // scale tracks would fight the per-monster proportions
      for (const k of Object.keys(clips)) clips[k] = new THREE.AnimationClip(k, clips[k].duration, clips[k].tracks.filter((t) => !t.name.endsWith(".scale")));
      const pelvisY = (g) => {
        let y = 1;
        g.scene.traverse((o) => o.isBone && o.name === "pelvis" && (y = o.position.length()));
        return y;
      };
      const ratio = pelvisY(female) / pelvisY(male);
      const fclips = {};
      for (const [k, c] of Object.entries(clips)) {
        fclips[k] = new THREE.AnimationClip(
          k,
          c.duration,
          c.tracks.map((t) => {
            if (t.name !== "pelvis.position") return t;
            const v = t.values.slice();
            for (let i = 0; i < v.length; i++) v[i] *= ratio;
            return new THREE.VectorKeyframeTrack(t.name, t.times, v);
          }),
        );
      }
      return { male, female, clips, fclips };
    }),
  );
}

export function disposeAssets() {
  for (const d of disposables) d.dispose?.();
  disposables.clear();
  cache.clear();
  texCache.clear();
}

export function registerDisposable(d) {
  disposables.add(d);
  return d;
}
