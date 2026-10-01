/**
 * Helix Drop — cached geometry. A sector mesh spans tower-local angles
 * [0, len] (placed with rotation.y = −start) with its TOP exactly at y = 0,
 * inner radius INNER_R and outer radius OUTER_R — the same numbers collision
 * uses, so what you see is what you hit. Bevels are taken from inside the
 * sector (never grow it).
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { PHYS } from "../engine/constants.js";

const cache = new Map();
const keyOf = (a) => Math.round(a * 1000);

/** Annular-sector shape in the XZ plane (after rotateX), angle 0..len. */
function sectorShape(len, rIn, rOut, inset) {
  const a0 = inset / rOut;
  const a1 = len - inset / rOut;
  const segs = Math.max(2, Math.ceil((len * 180) / Math.PI / 5));
  const s = new THREE.Shape();
  // shape (sx, sy) → world (sx, ·, −sy); we want z = r·sin φ  →  sy = −r·sin φ
  const P = (r, a) => [r * Math.cos(a), -r * Math.sin(a)];
  s.moveTo(...P(rOut, a0));
  for (let i = 1; i <= segs; i++) s.lineTo(...P(rOut, a0 + ((a1 - a0) * i) / segs));
  for (let i = segs; i >= 0; i--) s.lineTo(...P(rIn, a0 + ((a1 - a0) * i) / segs));
  s.closePath();
  return s;
}

export function sectorGeometry(len) {
  const key = `sec:${keyOf(len)}`;
  if (cache.has(key)) return cache.get(key);
  const H = PHYS.PLATFORM_H;
  const bevel = 0.05;
  const g = new THREE.ExtrudeGeometry(sectorShape(len, PHYS.INNER_R + bevel, PHYS.OUTER_R - bevel, bevel * 1.2), {
    depth: H - bevel * 2,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    curveSegments: 1,
  });
  g.rotateX(-Math.PI / 2);
  // extrusion now spans y ∈ [−bevel, H − bevel]; put the top at exactly 0
  g.translate(0, -(H - bevel), 0);
  g.computeVertexNormals();
  cache.set(key, g);
  return g;
}

/** Spikes along a danger sector's top — the shape half of the danger language. */
export function spikeGeometry(len) {
  const key = `spk:${keyOf(len)}`;
  if (cache.has(key)) return cache.get(key);
  const parts = [];
  const rows = [1.45, 2.15, 2.8];
  rows.forEach((r, ri) => {
    const step = 0.42 / r; // ~0.42 u apart along the arc
    for (let a = step * (0.6 + (ri % 2) * 0.5); a < len - step * 0.4; a += step) {
      const c = new THREE.ConeGeometry(0.085, 0.2, 5, 1);
      c.translate(r * Math.cos(a), 0.1, r * Math.sin(a));
      parts.push(c);
    }
  });
  const g = parts.length ? mergeGeometries(parts) : new THREE.BufferGeometry();
  parts.forEach((p) => p.dispose());
  cache.set(key, g);
  return g;
}

/** Small ring chunk used for smash debris. */
export function debrisGeometry() {
  const key = "debris";
  if (cache.has(key)) return cache.get(key);
  const g = new THREE.ExtrudeGeometry(sectorShape(0.42, 1.4, 2.6, 0.02), { depth: PHYS.PLATFORM_H * 0.9, bevelEnabled: false });
  g.rotateX(-Math.PI / 2);
  g.center();
  g.computeVertexNormals();
  cache.set(key, g);
  return g;
}
