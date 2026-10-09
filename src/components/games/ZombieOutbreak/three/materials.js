/**
 * Zombie Outbreak — shared materials (cached by key, disposed with the game).
 */
import * as THREE from "three";

const cache = new Map();

export function mat(key, make) {
  let m = cache.get(key);
  if (!m) {
    m = make();
    m.userData.shared = true;
    cache.set(key, m);
  }
  return m;
}

export function std(key, params) {
  return mat(key, () => new THREE.MeshStandardMaterial(params));
}

export function basic(key, params) {
  return mat(key, () => new THREE.MeshBasicMaterial(params));
}

export function disposeMaterials() {
  for (const m of cache.values()) m.dispose();
  cache.clear();
}

/** Remaps a BoxGeometry's UVs to world units so a repeating texture keeps its scale. */
export function boxUV(geom, w, h, d, tile = 4, tileV = tile) {
  const uv = geom.attributes.uv;
  // Face order: +x, -x, +y, -y, +z, -z (4 verts each).
  const dims = [
    [d, h],
    [d, h],
    [w, d],
    [w, d],
    [w, h],
    [w, h],
  ];
  for (let f = 0; f < 6; f++) {
    const [fu, fv] = dims[f];
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      uv.setXY(i, uv.getX(i) * (fu / tile), uv.getY(i) * (fv / tileV));
    }
  }
  uv.needsUpdate = true;
  return geom;
}
