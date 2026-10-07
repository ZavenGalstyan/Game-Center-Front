/**
 * Highway Racer — shared materials and textures. Everything is cached here
 * and disposed together when the game unmounts, so remounting (or switching
 * cars / themes) never leaks GPU memory.
 */
import * as THREE from "three";

const mats = new Map();
const texs = new Map();

export function mat(key, make) {
  let m = mats.get(key);
  if (!m) {
    m = make();
    mats.set(key, m);
  }
  return m;
}

export function tex(key, make) {
  let t = texs.get(key);
  if (!t) {
    t = make();
    texs.set(key, t);
  }
  return t;
}

export function disposeAll() {
  for (const m of mats.values()) m.dispose();
  for (const t of texs.values()) t.dispose();
  mats.clear();
  texs.clear();
}

/* ------------------------------------------------------------ car materials */
export const paintMat = (color, quality = "medium") =>
  mat(`paint:${color}:${quality}`, () =>
    quality === "high"
      ? new THREE.MeshPhysicalMaterial({ color, metalness: 0.45, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.12, envMapIntensity: 1.1 })
      : new THREE.MeshStandardMaterial({ color, metalness: 0.4, roughness: 0.34, envMapIntensity: 1.0 }),
  );
export const glassMat = () =>
  mat("glass", () => new THREE.MeshStandardMaterial({ color: "#121925", metalness: 0.7, roughness: 0.06, envMapIntensity: 1.4 }));
export const trimMat = () => mat("trim", () => new THREE.MeshStandardMaterial({ color: "#16171b", metalness: 0.2, roughness: 0.62 }));
export const tireMat = () => mat("tire", () => new THREE.MeshStandardMaterial({ color: "#19191b", metalness: 0, roughness: 0.92 }));
export const rimMat = (color) => mat(`rim:${color}`, () => new THREE.MeshStandardMaterial({ color, metalness: 0.85, roughness: 0.28 }));
export const chromeMat = () => mat("chrome", () => new THREE.MeshStandardMaterial({ color: "#c9ccd2", metalness: 1, roughness: 0.2 }));
export const headMat = () =>
  mat("head", () => new THREE.MeshStandardMaterial({ color: "#fff8e6", emissive: "#fff3d6", emissiveIntensity: 1.4, roughness: 0.2 }));
export const tailMat = () =>
  mat("tail", () => new THREE.MeshStandardMaterial({ color: "#7a0c10", emissive: "#ff2020", emissiveIntensity: 1.1, roughness: 0.3 }));
/** the player's own tail lights get a separate material so braking/crash can flare them */
export const playerTailMat = () =>
  mat("tail:player", () => new THREE.MeshStandardMaterial({ color: "#7a0c10", emissive: "#ff2020", emissiveIntensity: 1.1, roughness: 0.3 }));
export const accentMat = (color) => mat(`accent:${color}`, () => new THREE.MeshStandardMaterial({ color, metalness: 0.3, roughness: 0.45 }));

/** soft round contact shadow under every vehicle (works with shadows off) */
export const blobTex = () =>
  tex("blob", () => {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const g = c.getContext("2d");
    const grd = g.createRadialGradient(64, 64, 8, 64, 64, 64);
    grd.addColorStop(0, "rgba(0,0,0,0.75)");
    grd.addColorStop(0.55, "rgba(0,0,0,0.42)");
    grd.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  });
export const blobMat = () =>
  mat("blob", () => new THREE.MeshBasicMaterial({ map: blobTex(), transparent: true, depthWrite: false, opacity: 0.85 }));

/** radial glow for lights, coins and sparks (additive) */
export const glowTex = () =>
  tex("glow", () => {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d");
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, "rgba(255,255,255,1)");
    grd.addColorStop(0.25, "rgba(255,255,255,0.55)");
    grd.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  });
export const glowMat = (color, opacity = 1) =>
  mat(`glow:${color}:${opacity}`, () =>
    new THREE.MeshBasicMaterial({ map: glowTex(), color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }),
  );
