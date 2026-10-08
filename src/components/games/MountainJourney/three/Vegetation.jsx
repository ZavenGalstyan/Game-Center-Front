/**
 * Mountain Journey — vegetation from the engine's deterministic scatter
 * (L.veg): every species is one merged, vertex-coloured geometry drawn as
 * InstancedMeshes chunked into 64 m tiles (frustum culling per tile). Trees,
 * bushes, grass and flowers sway with the shared wind uniforms.
 */
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { mats, addSway } from "./materials.js";
import { bladeTex } from "./textures.js";
import { mulberry32 } from "../engine/rng.js";

const geoCache = new Map();

function colorize(g, color, vary = 0, rand = Math.random, topWhite = 0) {
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  const c = new THREE.Color(color);
  const tmp = new THREE.Color();
  const nrm = g.attributes.normal;
  for (let i = 0; i < n; i++) {
    tmp.copy(c).offsetHSL(0, 0, (rand() - 0.5) * vary);
    if (topWhite > 0 && nrm && nrm.getY(i) > 0.25 && rand() < topWhite) tmp.set("#f4f8fb");
    col[i * 3] = tmp.r;
    col[i * 3 + 1] = tmp.g;
    col[i * 3 + 2] = tmp.b;
  }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  return g;
}

function prep(g) {
  // merged geometries need identical attribute sets
  const ng = g.index ? g.toNonIndexed() : g;
  if (!ng.attributes.uv) ng.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(ng.attributes.position.count * 2), 2));
  ng.computeVertexNormals();
  return ng;
}

function trunk(h, r0, r1, color, rand) {
  const g = new THREE.CylinderGeometry(r1, r0, h, 7, 2);
  g.translate(0, h / 2, 0);
  return colorize(prep(g), color, 0.06, rand);
}

function coneStack(levels, rand, { base = 1.4, top = 0.5, y0 = 1.0, y1 = 5.6, color = "#2f5d34", color2 = "#4f8a46", snow = 0 }) {
  const parts = [];
  for (let i = 0; i < levels; i++) {
    const t = i / (levels - 1);
    const r = base + (top - base) * t;
    const hh = ((y1 - y0) / levels) * 1.9;
    const g = new THREE.ConeGeometry(r * (0.92 + rand() * 0.16), hh, 8, 1);
    g.rotateY(rand() * Math.PI);
    g.translate((rand() - 0.5) * 0.12, y0 + (y1 - y0) * t + hh * 0.35, (rand() - 0.5) * 0.12);
    const c = new THREE.Color(color).lerp(new THREE.Color(color2), t);
    parts.push(colorize(prep(g), c, 0.08, rand, snow));
  }
  return parts;
}

function blob(r, x, y, z, color, rand, detail = 1) {
  const g = new THREE.IcosahedronGeometry(r, detail);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const s = 0.85 + rand() * 0.3;
    p.setXYZ(i, p.getX(i) * s, p.getY(i) * s * 0.85, p.getZ(i) * s);
  }
  g.translate(x, y, z);
  return colorize(prep(g), color, 0.12, rand);
}

export function speciesGeometry(kind, palette) {
  const key = `${kind}:${palette?.grass || ""}`;
  if (geoCache.has(key)) return geoCache.get(key);
  const rand = mulberry32(kind.length * 977 + 3);
  let parts;
  switch (kind) {
    case "pine":
      parts = [trunk(1.6, 0.22, 0.14, "#5b3d29", rand), ...coneStack(4, rand, {})];
      break;
    case "fir":
      parts = [trunk(1.4, 0.2, 0.12, "#4f3524", rand), ...coneStack(5, rand, { base: 1.15, top: 0.35, y0: 0.9, y1: 7.2, color: "#24482d", color2: "#3d6e3e" })];
      break;
    case "snowPine":
      parts = [trunk(1.5, 0.2, 0.13, "#4e3727", rand), ...coneStack(4, rand, { base: 1.3, top: 0.45, color: "#2a4a3a", color2: "#3f6650", snow: 0.75 })];
      break;
    case "broad": {
      const tr = trunk(2.4, 0.26, 0.18, "#5d4330", rand);
      const greens = ["#4e8a3a", "#5f9a40", "#3f7a36", "#6aa548"];
      parts = [tr];
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        parts.push(blob(1.15 + rand() * 0.5, Math.cos(a) * 0.8, 3.0 + rand() * 0.9, Math.sin(a) * 0.8, greens[i % 4], rand));
      }
      parts.push(blob(1.4, 0, 4.0, 0, "#5a9640", rand));
      break;
    }
    case "birch": {
      const g = new THREE.CylinderGeometry(0.11, 0.15, 3.6, 7, 6);
      g.translate(0, 1.8, 0);
      const tr = prep(g);
      const n = tr.attributes.position.count;
      const col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const dark = rand() < 0.18;
        const v = dark ? 0.25 : 0.88 + rand() * 0.08;
        col[i * 3] = v;
        col[i * 3 + 1] = v;
        col[i * 3 + 2] = v * 0.97;
      }
      tr.setAttribute("color", new THREE.BufferAttribute(col, 3));
      parts = [tr];
      for (let i = 0; i < 4; i++) parts.push(blob(0.75 + rand() * 0.35, (rand() - 0.5) * 1.1, 3.3 + rand() * 1.2, (rand() - 0.5) * 1.1, i % 2 ? "#9cc25a" : "#86b24a", rand));
      break;
    }
    case "dead": {
      parts = [trunk(3.2, 0.2, 0.08, "#6e6258", rand)];
      for (let i = 0; i < 4; i++) {
        const b = new THREE.CylinderGeometry(0.03, 0.07, 1.4, 5);
        b.translate(0, 0.7, 0);
        b.rotateZ(0.7 + rand() * 0.5);
        b.rotateY((i / 4) * Math.PI * 2 + rand());
        b.translate(0, 1.5 + i * 0.4, 0);
        parts.push(colorize(prep(b), "#6e6258", 0.05, rand));
      }
      break;
    }
    case "bush": {
      parts = [];
      for (let i = 0; i < 3; i++) parts.push(blob(0.55 + rand() * 0.25, (rand() - 0.5) * 0.7, 0.4 + rand() * 0.2, (rand() - 0.5) * 0.7, i % 2 ? "#4f8a3a" : "#3f7533", rand));
      break;
    }
    case "rock": {
      const g = new THREE.IcosahedronGeometry(1, 1);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const s = 0.75 + rand() * 0.45;
        p.setXYZ(i, p.getX(i) * s * 1.1, p.getY(i) * s * 0.65, p.getZ(i) * s);
      }
      g.translate(0, 0.25, 0);
      const r = prep(g);
      const n = r.attributes.position.count;
      const col = new Float32Array(n * 3);
      const top = new THREE.Color(palette?.moss || "#6c8a46");
      const base = new THREE.Color(palette?.rock || "#85817a");
      const tmp = new THREE.Color();
      for (let i = 0; i < n; i++) {
        const up = r.attributes.normal.getY(i);
        tmp.copy(base).offsetHSL(0, 0, (rand() - 0.5) * 0.08);
        if (up > 0.55) tmp.lerp(top, 0.65);
        col[i * 3] = tmp.r;
        col[i * 3 + 1] = tmp.g;
        col[i * 3 + 2] = tmp.b;
      }
      r.setAttribute("color", new THREE.BufferAttribute(col, 3));
      parts = [r];
      break;
    }
    default:
      parts = [trunk(2, 0.2, 0.1, "#5b3d29", rand)];
  }
  const merged = mergeGeometries(parts.map((p) => {
    // keep only the shared attributes
    for (const k of Object.keys(p.attributes)) if (!["position", "normal", "color", "uv"].includes(k)) p.deleteAttribute(k);
    return p;
  }));
  merged.computeBoundingSphere();
  geoCache.set(key, merged);
  return merged;
}

function grassGeometry() {
  if (geoCache.has("grass")) return geoCache.get("grass");
  const parts = [];
  for (let i = 0; i < 3; i++) {
    const g = new THREE.PlaneGeometry(0.9, 0.62);
    g.translate(0, 0.31, 0);
    g.rotateY((i / 3) * Math.PI);
    parts.push(g);
  }
  const m = mergeGeometries(parts);
  geoCache.set("grass", m);
  return m;
}

function flowerGeometry() {
  if (geoCache.has("flower")) return geoCache.get("flower");
  const stem = new THREE.CylinderGeometry(0.012, 0.012, 0.2, 3);
  stem.translate(0, 0.1, 0);
  const head = new THREE.IcosahedronGeometry(0.06, 0);
  head.scale(1, 0.55, 1);
  head.translate(0, 0.21, 0);
  const g = mergeGeometries([stem.toNonIndexed(), head.toNonIndexed()]);
  geoCache.set("flower", g);
  return g;
}

const TILE = 64;
function tiled(list) {
  const tiles = new Map();
  for (const it of list) {
    const k = `${Math.floor(it[0] / TILE)}:${Math.floor(it[2] / TILE)}`;
    if (!tiles.has(k)) tiles.set(k, []);
    tiles.get(k).push(it);
  }
  return [...tiles.values()];
}

function buildInstanced(geo, mat, list, { yScale = 1, color = null } = {}) {
  const m = new THREE.InstancedMesh(geo, mat, list.length);
  const o = new THREE.Object3D();
  const c = new THREE.Color();
  list.forEach((it, i) => {
    o.position.set(it[0], it[1], it[2]);
    o.rotation.set(0, it[4] || 0, 0);
    o.scale.set(it[3], it[3] * yScale, it[3]);
    o.updateMatrix();
    m.setMatrixAt(i, o.matrix);
    if (color) {
      c.set(color(it, i));
      m.setColorAt(i, c);
    }
  });
  m.instanceMatrix.needsUpdate = true;
  if (m.instanceColor) m.instanceColor.needsUpdate = true;
  m.computeBoundingSphere();
  return m;
}

const FLOWER_COLORS = ["#f2e86d", "#f4f1ea", "#c98be0", "#ef8a6a"];

export default function Vegetation({ L, quality, shadows }) {
  const region = L.region;
  const built = useMemo(() => {
    const out = [];
    const pal = { moss: region.id >= 4 ? "#e6edf2" : region.id === 3 ? "#8a9a5c" : "#6c8a46", rock: region.palette.rock };
    const dens = quality === "low" ? 0.55 : 1;
    const thin = (arr) => (dens >= 1 ? arr : arr.filter((_, i) => i % Math.round(1 / dens) === 0));
    for (const [kind, list] of Object.entries(L.veg.trees)) {
      if (!list.length) continue;
      const geo = speciesGeometry(kind, pal);
      for (const t of tiled(thin(list))) out.push({ mesh: buildInstanced(geo, mats.foliage(), t), cast: true });
    }
    if (L.veg.bushes.length) {
      const geo = speciesGeometry("bush", pal);
      for (const t of tiled(thin(L.veg.bushes))) out.push({ mesh: buildInstanced(geo, mats.foliage(), t), cast: false });
    }
    if (L.veg.rocks.length) {
      const geo = speciesGeometry("rock", pal);
      for (const t of tiled(L.veg.rocks)) out.push({ mesh: buildInstanced(geo, mats.rockVC(), t), cast: true });
    }
    if (L.veg.grass.length) {
      const gmat = addSway(
        new THREE.MeshStandardMaterial({ map: bladeTex(), alphaTest: 0.45, side: THREE.DoubleSide, color: region.id >= 4 ? "#c9cf9a" : region.id === 3 ? "#b9c78a" : "#a9d07a", roughness: 0.95 }),
        { strength: 0.35, rigid: 0.02 },
      );
      out.push({ ownMat: gmat });
      const gl = thin(L.veg.grass);
      for (const t of tiled(gl)) out.push({ mesh: buildInstanced(grassGeometry(), gmat, t), cast: false });
    }
    if (L.veg.flowers.length) {
      const fmat = addSway(new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.7 }), { strength: 0.6, rigid: 0.05 });
      out.push({ ownMat: fmat });
      for (const t of tiled(L.veg.flowers)) out.push({ mesh: buildInstanced(flowerGeometry(), fmat, t, { color: (it) => FLOWER_COLORS[it[4] % 4] }), cast: false });
    }
    return out;
  }, [L, quality, region]);
  useEffect(
    () => () => {
      for (const b of built) {
        if (b.mesh) b.mesh.dispose();
        if (b.ownMat) b.ownMat.dispose();
      }
    },
    [built],
  );
  return (
    <group>
      {built
        .filter((b) => b.mesh)
        .map((b, i) => (
          <primitive key={i} object={b.mesh} castShadow={shadows && b.cast} receiveShadow={shadows} />
        ))}
    </group>
  );
}

export function disposeVegetation() {
  for (const g of geoCache.values()) g.dispose();
  geoCache.clear();
}
