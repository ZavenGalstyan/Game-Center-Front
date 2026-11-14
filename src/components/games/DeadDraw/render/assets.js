/**
 * Asset loading + caching for the bunker. Everything is CC0 (see
 * public/models/dead-draw/LICENSE.txt): Poly Haven props (meshopt + WebP),
 * Poly Haven PBR texture sets and an indoor HDRI used only for reflections.
 * All loaded GPU resources are tracked and released by disposeAssets().
 */
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { RGBELoader } from "three/examples/jsm/loaders/RGBELoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";

const BASE = import.meta.env?.BASE_URL || "/";
const DIR = `${BASE}models/dead-draw/`;

let gltfLoader = null;
const cache = new Map();
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

/** A prop: a fresh clone per call (geometry + materials shared). */
export function loadProp(name) {
  return once(`prop:${name}`, () =>
    loader()
      .loadAsync(`${DIR}props/${name}.glb`)
      .then((g) => {
        g.scene.traverse((o) => {
          if (!o.isMesh) return;
          disposables.add(o.geometry);
          disposables.add(o.material);
          o.castShadow = true;
          o.receiveShadow = true;
          const m = o.material;
          for (const k of ["map", "normalMap", "roughnessMap", "metalnessMap", "aoMap", "emissiveMap"])
            if (m[k]) {
              m[k].anisotropy = maxAniso;
              disposables.add(m[k]);
            }
        });
        return g.scene;
      }),
  ).then((scene) => scene.clone(true));
}

/** Scale + ground a prop so its `axis` size is `size` metres; returns a wrapper group. */
export function fitProp(obj, size, axis = "y", ground = true) {
  obj.updateMatrixWorld(true);
  const bb = new THREE.Box3().setFromObject(obj);
  const dim = bb.getSize(new THREE.Vector3());
  const s = size == null ? 1 : size / Math.max(1e-6, dim[axis]);
  obj.scale.multiplyScalar(s);
  obj.updateMatrixWorld(true);
  const bb2 = new THREE.Box3().setFromObject(obj);
  const c = bb2.getCenter(new THREE.Vector3());
  obj.position.x -= c.x;
  obj.position.z -= c.z;
  obj.position.y -= ground ? bb2.min.y : c.y;
  const wrap = new THREE.Group();
  wrap.add(obj);
  return wrap;
}

/** One named mesh of a multi-object prop, detached, centred and grounded. */
export async function loadPart(name, pick) {
  const p = await loadProp(name);
  p.updateMatrixWorld(true);
  let node = null;
  // multi-primitive meshes load as a Group of Meshes, so match any node by name
  p.traverse((o) => !node && o.name === pick && (node = o));
  if (!node) p.traverse((o) => !node && o.name.includes(pick) && (node = o));
  node = node || p;
  const m = node.matrixWorld.clone();
  node.removeFromParent();
  node.matrix.copy(m);
  node.matrix.decompose(node.position, node.quaternion, node.scale);
  return fitProp(node, null);
}

/* ------------------------------------------------------------------ PBR sets */
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

/**
 * A tiling Poly Haven PBR set (_d albedo, _n OpenGL normal, _arm AO/rough/metal)
 * as a MeshStandardMaterial. Maps are shared; repeat is per material.
 */
export function pbr(set, { repeat = [1, 1], color = 0xffffff, normalScale = 1, roughness = 1, metalness = 0, envMapIntensity = 1, aoIntensity = 1, side = THREE.FrontSide } = {}) {
  const clone = (t) => {
    const c = t.clone();
    c.repeat.set(repeat[0], repeat[1]);
    c.needsUpdate = true;
    disposables.add(c);
    return c;
  };
  const arm = clone(tex(`${DIR}tex/${set}_arm.webp`, false));
  const m = new THREE.MeshStandardMaterial({
    map: clone(tex(`${DIR}tex/${set}_d.webp`, true)),
    normalMap: clone(tex(`${DIR}tex/${set}_n.webp`, false)),
    normalScale: new THREE.Vector2(normalScale, normalScale),
    roughnessMap: arm,
    metalnessMap: metalness > 0 ? arm : null,
    aoMap: arm,
    aoMapIntensity: aoIntensity,
    roughness,
    metalness,
    color,
    envMapIntensity,
    side,
  });
  disposables.add(m);
  return m;
}

/** Resolve once the given texture sets have decoded (drives the loading bar). */
export function preloadSets(sets) {
  return Promise.all(
    sets.flatMap((s) =>
      ["d", "n", "arm"].map(
        (k) =>
          new Promise((res) => {
            const img = new Image();
            img.onload = img.onerror = () => res();
            img.src = `${DIR}tex/${s}_${k}.webp`;
            tex(`${DIR}tex/${s}_${k}.webp`, k === "d");
          }),
      ),
    ),
  );
}

/** PMREM environment from the CC0 launch-facility HDRI (per renderer). */
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

export function track(d) {
  disposables.add(d);
  return d;
}

export function disposeAssets() {
  for (const d of disposables) d.dispose?.();
  disposables.clear();
  cache.clear();
  texCache.clear();
}
