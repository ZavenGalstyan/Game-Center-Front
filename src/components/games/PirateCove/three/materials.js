/**
 * Pirate Cove — shared materials. One instance per look, reused by every
 * mesh that wants it (ships, props, characters), disposed with the game.
 */
import * as THREE from "three";
import { hullPlanks, deckPlanks, sailCloth, tatteredCloth, detailNoise, stoneBlocks, thatch, tentCloth, goldTexture } from "./textures.js";

const cache = new Map();

export function mat(key, make) {
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key);
}

export function disposeMaterials() {
  for (const m of cache.values()) m.dispose();
  cache.clear();
}

const std = (o) => new THREE.MeshStandardMaterial(o);

export const M = {
  hull: (color) =>
    mat(`hull:${color}`, () => {
      const t = hullPlanks();
      return std({ color, map: t, roughness: 0.82, metalness: 0, vertexColors: true });
    }),
  deck: () => mat("deck", () => std({ color: "#c9a77a", map: deckPlanks(), roughness: 0.85 })),
  darkWood: () => mat("darkWood", () => std({ color: "#4a3221", map: hullPlanks(), roughness: 0.85 })),
  wood: () => mat("wood", () => std({ color: "#8a6440", map: hullPlanks(), roughness: 0.85 })),
  mast: () => mat("mast", () => std({ color: "#6b4a2c", roughness: 0.75 })),
  sail: (color) =>
    mat(`sail:${color}`, () =>
      std({ color, map: sailCloth(), roughness: 0.95, side: THREE.DoubleSide }),
    ),
  tattered: (color) =>
    mat(`tsail:${color}`, () => std({ color, map: tatteredCloth(), roughness: 0.95, side: THREE.DoubleSide, alphaTest: 0.5 })),
  rope: () => mat("rope", () => new THREE.LineBasicMaterial({ color: "#2e2418", transparent: true, opacity: 0.75 })),
  iron: () => mat("iron", () => std({ color: "#1d1d20", roughness: 0.45, metalness: 0.75 })),
  brass: () => mat("brass", () => std({ color: "#c9a043", roughness: 0.35, metalness: 0.85 })),
  gold: () => mat("gold", () => std({ color: "#ffd060", map: goldTexture(), roughness: 0.3, metalness: 0.9, emissive: "#6a4300", emissiveIntensity: 0.35 })),
  accent: (color) => mat(`accent:${color}`, () => std({ color, roughness: 0.6 })),
  glass: () => mat("glass", () => std({ color: "#ffd38a", emissive: "#ffb347", emissiveIntensity: 1.6, roughness: 0.3 })),
  stone: () => mat("stone", () => std({ color: "#c9c2b2", map: stoneBlocks(), roughness: 0.92 })),
  rock: (color = "#8d877c") => mat(`rock:${color}`, () => std({ color, map: detailNoise(), roughness: 0.95, flatShading: true })),
  thatch: () => mat("thatch", () => std({ color: "#d8b878", map: thatch(), roughness: 1 })),
  tent: (a, b) => mat(`tent:${a}:${b}`, () => std({ map: tentCloth(a, b), roughness: 0.95, side: THREE.DoubleSide })),
  cloth: (color) => mat(`cloth:${color}`, () => std({ color, roughness: 0.9 })),
  skin: (color = "#c99a72") => mat(`skin:${color}`, () => std({ color, roughness: 0.75 })),
  bone: () => mat("bone", () => std({ color: "#e8e0c8", roughness: 0.8 })),
  leaf: (color) => mat(`leaf:${color}`, () => std({ color, roughness: 0.85, side: THREE.DoubleSide })),
  emissive: (color, i = 2) => mat(`em:${color}:${i}`, () => new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(i), toneMapped: false })),
  flame: () =>
    mat("flame", () => new THREE.MeshBasicMaterial({ color: new THREE.Color("#ffb24a").multiplyScalar(2.2), toneMapped: false, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending })),
  shadow: () => mat("shadowDecal", () => new THREE.MeshBasicMaterial({ color: "#000000", transparent: true, opacity: 0.28, depthWrite: false })),
};
