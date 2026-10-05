/**
 * Lumberjack Life — log geometry/materials shared by free logs, fallen-trunk
 * sections, cart/trailer cargo and the sawmill. A log is a tapered cylinder
 * whose side uses the species' bark and whose two ends show growth rings.
 * Local frame: axis along +Z, centred on the origin.
 */
import * as THREE from "three";
import { speciesById } from "../data/species.js";
import { barkTexture, endGrainTexture, plankTexture } from "./textures.js";

const mats = new Map();

export function logMaterials(speciesId) {
  if (mats.has(speciesId)) return mats.get(speciesId);
  const sp = speciesById(speciesId);
  const bark = new THREE.MeshStandardMaterial({ map: barkTexture(sp.bark), roughness: 0.92, metalness: 0 });
  const end = new THREE.MeshStandardMaterial({ map: endGrainTexture(sp.wood, sp.bark), roughness: 0.8, metalness: 0 });
  const plank = new THREE.MeshStandardMaterial({ map: plankTexture(sp.wood), roughness: 0.75, metalness: 0 });
  const m = { bark, end, plank, list: [bark, end, end] };
  mats.set(speciesId, m);
  return m;
}

/**
 * Tapered log: rA at −Z end, rB at +Z end. Bark UVs repeat every 1.4 m along
 * the axis so a sectioned trunk reads as one continuous piece of bark.
 */
export function logGeometry(len, rA, rB, segs = 14, vOffset = 0) {
  const g = new THREE.CylinderGeometry(rB, rA, len, segs, 2, false);
  // bark UVs: u around ×2, v along length in metres
  const uv = g.attributes.uv;
  const pos = g.attributes.position;
  const sideCount = (segs + 1) * 3;
  for (let i = 0; i < sideCount; i++) {
    const y = pos.getY(i);
    uv.setXY(i, uv.getX(i) * 2, (y + len / 2 + vOffset) / 1.4);
  }
  uv.needsUpdate = true;
  g.rotateX(Math.PI / 2); // +Y → +Z
  return g;
}

export function makeLogMesh(log, { shadows = true } = {}) {
  const m = logMaterials(log.species);
  const mesh = new THREE.Mesh(logGeometry(log.len, log.rA, log.rB), m.list);
  mesh.castShadow = shadows;
  mesh.receiveShadow = true;
  return mesh;
}

/** a bundle of sawn planks (used on the output belt and in the racks) */
let plankGeo = null;
export function plankGeometry() {
  if (!plankGeo) plankGeo = new THREE.BoxGeometry(0.26, 0.045, 1.8);
  return plankGeo;
}

export function disposeLogMaterials() {
  for (const m of mats.values()) {
    m.bark.dispose();
    m.end.dispose();
    m.plank.dispose();
  }
  mats.clear();
  if (plankGeo) {
    plankGeo.dispose();
    plankGeo = null;
  }
}
