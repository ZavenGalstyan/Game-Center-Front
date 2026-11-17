/**
 * Asset loading + caching. Everything is CC0 (public/models/wild-west/LICENSE.txt):
 * Poly Haven props (meshopt + WebP, a ~25% "props-lite" set for Low), Poly
 * Haven PBR texture sets and HDR skies (1k HDR for lighting + 4k tonemapped
 * JPEG seen through the windows). Character rigs/animations are the CC0
 * Quaternius sets shared with other games (loaded through Deck of Shadows).
 * Every GPU resource is tracked and released by disposeAssets().
 */
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { RGBELoader } from "three/examples/jsm/loaders/RGBELoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";

const BASE = import.meta.env?.BASE_URL || "/";
export const DIR = `${BASE}models/wild-west/`;

let gltfLoader = null;
const cache = new Map();
const disposables = new Set();
let maxAniso = 4;
let propSet = "props";

function loader() {
  if (!gltfLoader) {
    gltfLoader = new GLTFLoader();
    gltfLoader.setMeshoptDecoder(MeshoptDecoder);
  }
  return gltfLoader;
}
export const setPropSet = (set) => (propSet = set === "props-lite" ? "props-lite" : "props");
export const setAnisotropy = (n) => (maxAniso = Math.max(1, n | 0));

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
  const set = propSet;
  return once(`${set}:${name}`, () =>
    loader()
      .loadAsync(`${DIR}${set}/${name}.glb`)
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

/** Tint every material of a prop (clones them; the clones are tracked). */
export function tintProp(obj, color, { rough = null, keepMap = true } = {}) {
  const c = new THREE.Color(color);
  obj.traverse((o) => {
    if (!o.isMesh) return;
    o.material = o.material.clone();
    o.material.color.multiply(c);
    if (rough != null) o.material.roughness = rough;
    if (!keepMap) o.material.map = null;
    disposables.add(o.material);
  });
  return obj;
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
 * as a MeshStandardMaterial. Maps are shared; repeat/rotation are per material.
 */
export function pbr(set, { repeat = [1, 1], offset = [0, 0], rotation = 0, color = 0xffffff, normalScale = 1, roughness = 1, metalness = 0, envMapIntensity = 1, aoIntensity = 1, side = THREE.FrontSide } = {}) {
  const clone = (t) => {
    const c = t.clone();
    c.repeat.set(repeat[0], repeat[1]);
    c.offset.set(offset[0], offset[1]);
    c.rotation = rotation;
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

/** Resolve once the given texture sets have decoded. */
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

/* ------------------------------------------------------------------ skies */
export const SKIES = {
  day: { hdr: "goegap", sunDir: [0.55, 0.62, -0.56], sun: 0xfff1d8, sunI: 3.4, exposure: 0.92, envI: 0.55, fog: 0xc9b89c },
  sunset: { hdr: "kiara_8_sunset", sunDir: [0.86, 0.16, -0.48], sun: 0xffb36a, sunI: 3.0, exposure: 0.95, envI: 0.5, fog: 0xb7865a },
  night: { hdr: "dikhololo_night", sunDir: [-0.3, 0.75, -0.6], sun: 0x8ea4d8, sunI: 0.35, exposure: 1.0, envI: 0.3, fog: 0x1b2230 },
};

const envByRenderer = new WeakMap();
/** PMREM environment (lighting/reflections) for a sky, per renderer. */
export function loadSkyEnv(renderer, sky) {
  let per = envByRenderer.get(renderer);
  if (!per) envByRenderer.set(renderer, (per = new Map()));
  if (per.has(sky)) return per.get(sky);
  const name = SKIES[sky].hdr;
  const p = once(`hdr:${name}`, () =>
    new RGBELoader().loadAsync(`${DIR}sky/${name}.hdr`).then((hdr) => {
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
  p.catch(() => per.delete(sky));
  per.set(sky, p);
  return p;
}

/** The 4k tonemapped panorama, seen through windows and doors. */
export function loadSkyBackdrop(sky) {
  const name = SKIES[sky].hdr;
  return once(`bg:${name}`, () =>
    new THREE.TextureLoader().loadAsync(`${DIR}sky/${name}.jpg`).then((t) => {
      t.colorSpace = THREE.SRGBColorSpace;
      t.mapping = THREE.EquirectangularReflectionMapping;
      t.anisotropy = maxAniso;
      disposables.add(t);
      return t;
    }),
  );
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
