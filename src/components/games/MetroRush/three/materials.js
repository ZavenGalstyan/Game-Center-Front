/**
 * Metro Rush — shared materials and canvas textures. Everything created
 * here is tracked so the world can dispose it in one call.
 */
import * as THREE from "three";

const tracked = new Set();
const cache = new Map();
export const track = (x) => {
  tracked.add(x);
  return x;
};

/** cached standard material by colour + options */
export function mat(color, { rough = 0.6, metal = 0, emissive = null, ei = 1, flat = false, transparent = false, opacity = 1, side = THREE.FrontSide } = {}) {
  const key = `${color}|${rough}|${metal}|${emissive}|${ei}|${flat}|${transparent}|${opacity}|${side}`;
  let m = cache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, flatShading: flat, transparent, opacity, side });
    if (emissive) {
      m.emissive = new THREE.Color(emissive);
      m.emissiveIntensity = ei;
    }
    if (transparent) m.depthWrite = opacity > 0.9;
    cache.set(key, track(m));
  }
  return m;
}

export function glowTexture() {
  if (cache.has("tex:glow")) return cache.get("tex:glow");
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d");
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, "rgba(255,255,255,1)");
  grd.addColorStop(0.25, "rgba(255,255,255,0.65)");
  grd.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const t = track(new THREE.CanvasTexture(c));
  t.colorSpace = THREE.SRGBColorSpace;
  cache.set("tex:glow", t);
  return t;
}

/** additive glow sprite material (one per colour) */
export function glowMat(color, opacity = 1) {
  const key = `glow|${color}|${opacity}`;
  let m = cache.get(key);
  if (!m) {
    m = track(new THREE.SpriteMaterial({ map: glowTexture(), color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false }));
    cache.set(key, m);
  }
  return m;
}

/** unlit additive material for neon / lamps */
export function lampMat(color, opacity = 1) {
  const key = `lamp|${color}|${opacity}`;
  let m = cache.get(key);
  if (!m) {
    m = track(new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, toneMapped: false }));
    cache.set(key, m);
  }
  return m;
}

export function stripeTexture(a, b, n = 6, diag = true) {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 64;
  const g = c.getContext("2d");
  drawStripes(g, a, b, n, diag);
  const t = track(new THREE.CanvasTexture(c));
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.userData.redraw = (a2, b2) => {
    drawStripes(g, a2, b2, n, diag);
    t.needsUpdate = true;
  };
  return t;
}
function drawStripes(g, a, b, n, diag) {
  g.fillStyle = b;
  g.fillRect(0, 0, 256, 64);
  g.fillStyle = a;
  const w = 256 / n;
  for (let i = -1; i < n + 1; i++) {
    g.beginPath();
    const x = i * w;
    if (diag) {
      g.moveTo(x, 64);
      g.lineTo(x + w / 2, 64);
      g.lineTo(x + w, 0);
      g.lineTo(x + w / 2, 0);
    } else {
      g.rect(x, 0, w / 2, 64);
    }
    g.fill();
  }
  g.fillStyle = "rgba(0,0,0,0.18)";
  g.fillRect(0, 0, 256, 4);
  g.fillRect(0, 60, 256, 4);
}

/** gravel / ground noise texture */
export function noiseTexture(base, spread = 28, size = 256, dots = 2600, seed = 1) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d");
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const col = new THREE.Color(base);
  g.fillStyle = `#${col.getHexString()}`;
  g.fillRect(0, 0, size, size);
  for (let i = 0; i < dots; i++) {
    const k = (rnd() - 0.5) * spread;
    const r = Math.max(0, Math.min(255, col.r * 255 + k));
    const gg = Math.max(0, Math.min(255, col.g * 255 + k));
    const b = Math.max(0, Math.min(255, col.b * 255 + k));
    g.fillStyle = `rgb(${r | 0},${gg | 0},${b | 0})`;
    const w = 1 + rnd() * 3;
    g.fillRect(rnd() * size, rnd() * size, w, w);
  }
  const t = track(new THREE.CanvasTexture(c));
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

export function disposeMaterials() {
  for (const x of tracked) x.dispose?.();
  tracked.clear();
  cache.clear();
}
