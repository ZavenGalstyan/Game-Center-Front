/**
 * Night Corridor — shared materials (created once, reused by every prop).
 */
import * as THREE from "three";
import { stainTexture, papersTexture, puddleTexture, debrisTexture, lockerTexture, windowTexture } from "./textures.js";

let mats = null;

export function getMaterials() {
  if (mats) return mats;
  const std = (o) => new THREE.MeshStandardMaterial(o);
  mats = {
    darkMetal: std({ color: "#2e2f2c", roughness: 0.55, metalness: 0.65 }),
    paintedMetal: std({ color: "#6b6f68", roughness: 0.7, metalness: 0.35 }),
    beigeMetal: std({ color: "#8b8573", roughness: 0.75, metalness: 0.25 }),
    greenMetal: std({ color: "#4a5a50", roughness: 0.7, metalness: 0.3 }),
    rust: std({ color: "#5a3a26", roughness: 0.9, metalness: 0.3 }),
    chrome: std({ color: "#b8bab4", roughness: 0.3, metalness: 0.9 }),
    wood: std({ color: "#4f3a28", roughness: 0.85 }),
    plywood: std({ color: "#7a6345", roughness: 0.9 }),
    fabric: std({ color: "#5c6466", roughness: 1 }),
    mattress: std({ color: "#8e8a7c", roughness: 1 }),
    rubber: std({ color: "#141414", roughness: 0.9 }),
    plastic: std({ color: "#2a2b2c", roughness: 0.6 }),
    red: std({ color: "#7a1410", roughness: 0.5, metalness: 0.2 }),
    yellow: std({ color: "#a8831c", roughness: 0.7, metalness: 0.2 }),
    cork: std({ color: "#6e5233", roughness: 1 }),
    concrete: std({ color: "#5f5c55", roughness: 1 }),
    cardboard: std({ color: "#6b5236", roughness: 1 }),
    pipe: std({ color: "#55574f", roughness: 0.6, metalness: 0.55 }),
    pipeRust: std({ color: "#5d4433", roughness: 0.8, metalness: 0.4 }),
    black: new THREE.MeshBasicMaterial({ color: "#020202" }),
    ceilingPanel: std({ color: "#7d7b73", roughness: 0.95, side: THREE.DoubleSide }),
    stain: [0, 1, 2, 3].map((v) => std({ map: stainTexture(v), transparent: true, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2 })),
    papers: std({ map: papersTexture(), transparent: true, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2 }),
    puddle: std({ color: "#0a0b0c", alphaMap: puddleTexture(), transparent: true, depthWrite: false, roughness: 0.04, metalness: 0.3, polygonOffset: true, polygonOffsetFactor: -2 }),
    debris: std({ map: debrisTexture(), transparent: true, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2 }),
    locker: (() => {
      const t = lockerTexture();
      return std({ map: t.map, bumpMap: t.bump, bumpScale: 1, roughness: 0.6, metalness: 0.35 });
    })(),
    window: std({ map: windowTexture(), emissive: "#9fb5c8", emissiveMap: windowTexture(), emissiveIntensity: 0.35, roughness: 0.1, metalness: 0.2 }),
  };
  mats.stain.forEach((m) => (m.toneMapped = true));
  return mats;
}

export function disposeMaterials() {
  if (!mats) return;
  for (const v of Object.values(mats)) {
    if (Array.isArray(v)) v.forEach((m) => m.dispose());
    else v.dispose?.();
  }
  mats = null;
}
