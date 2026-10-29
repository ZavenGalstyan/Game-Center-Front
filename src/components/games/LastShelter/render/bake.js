/**
 * Last Shelter — draw-call reduction. Plain-coloured opaque parts (no map,
 * no glow, not metallic) are baked into one vertex-coloured mesh; textured,
 * glowing, metallic or transparent parts keep their own material.
 *
 *  bakeWorld(root)  the static house, in world space, across the hierarchy
 *  bakeLocal(group) one rig limb / item model, in the group's local space
 *                   (recurses into child groups so animated pivots survive)
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

export const isPlain = (m) => m && m.isMeshStandardMaterial && !m.map && !m.transparent && (m.emissiveIntensity === 0 || m.emissive.getHex() === 0) && m.metalness < 0.35;

function prep(o, matrix, colored) {
  const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
  for (const k of Object.keys(g.attributes)) if (k !== "position" && k !== "normal" && !(k === "uv" && !colored)) g.deleteAttribute(k);
  g.morphAttributes = {};
  g.applyMatrix4(matrix);
  if (colored) {
    const n = g.attributes.position.count;
    const c = new Float32Array(n * 3);
    const col = o.material.color;
    for (let i = 0; i < n; i++) {
      c[i * 3] = col.r;
      c[i * 3 + 1] = col.g;
      c[i * 3 + 2] = col.b;
    }
    g.setAttribute("color", new THREE.BufferAttribute(c, 3));
  }
  return g;
}
function merge(list, colored, matrixOf, material, track) {
  const parts = list.map((o) => prep(o, matrixOf(o), colored));
  const merged = mergeGeometries(parts, false);
  for (const g of parts) g.dispose();
  if (!merged) return null;
  track?.(merged);
  const mesh = new THREE.Mesh(merged, material);
  mesh.castShadow = list.some((o) => o.castShadow);
  mesh.receiveShadow = true;
  return mesh;
}

export function bakeWorld(root, vcMat, track) {
  root.updateMatrixWorld(true);
  const buckets = new Map();
  root.traverse((o) => {
    if (!o.isMesh || Array.isArray(o.material) || o.material.transparent) return;
    const key = isPlain(o.material) ? vcMat : o.material;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(o);
  });
  const gone = [];
  for (const [key, list] of buckets) {
    if (list.length < 2) continue;
    const mesh = merge(list, key === vcMat, (o) => o.matrixWorld, key, track);
    if (!mesh) continue;
    root.add(mesh);
    gone.push(...list);
  }
  for (const o of gone) o.parent.remove(o);
  root.traverse((o) => {
    o.matrixAutoUpdate = false;
    o.updateMatrix();
  });
  root.updateMatrixWorld(true);
}

export function bakeLocal(group, vcMat, keep, track) {
  for (const c of [...group.children]) if (!c.isMesh && !c.isSprite && c.children.length && !keep.has(c)) bakeLocal(c, vcMat, keep, track);
  const list = group.children.filter((c) => c.isMesh && !keep.has(c) && !Array.isArray(c.material) && isPlain(c.material) && c.children.length === 0);
  if (list.length < 2) return;
  const mesh = merge(
    list,
    true,
    (o) => {
      o.updateMatrix();
      return o.matrix;
    },
    vcMat,
    track,
  );
  if (!mesh) return;
  for (const o of list) group.remove(o);
  group.add(mesh);
}
