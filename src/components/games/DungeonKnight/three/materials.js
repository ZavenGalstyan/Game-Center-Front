/**
 * Dungeon Knight — shared materials and geometry helpers. Materials are cached
 * by their parameters so the knight, every skeleton and every crate share GPU
 * programs and textures; disposeMaterials() frees them on unmount.
 */
import * as THREE from "three";
import { metalTexture } from "./textures.js";

const mats = new Map();

/**
 * mat("#aabbcc", rough, metal, { emissive, emissiveIntensity, map, transparent,
 * opacity, side, flat })
 */
export function mat(color, rough = 0.7, metal = 0, o = {}) {
  const key = `${color}|${rough}|${metal}|${o.emissive || ""}|${o.emissiveIntensity || ""}|${o.map ? o.map.uuid : ""}|${o.transparent ? o.opacity : ""}|${o.side || ""}|${o.flat ? 1 : 0}|${o.depthWrite === false ? 0 : 1}|${o.blend || ""}`;
  let m = mats.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color,
      roughness: rough,
      metalness: metal,
      emissive: o.emissive || "#000000",
      emissiveIntensity: o.emissiveIntensity ?? 1,
      map: o.map || null,
      transparent: !!o.transparent,
      opacity: o.opacity ?? 1,
      side: o.side || THREE.FrontSide,
      flatShading: !!o.flat,
      depthWrite: o.depthWrite !== false,
    });
    if (o.blend === "add") m.blending = THREE.AdditiveBlending;
    mats.set(key, m);
  }
  return m;
}

/** Polished armour steel (brushed texture, tinted). */
export const steel = (color, rough = 0.34) => mat(color, rough, 0.85, { map: metalTexture() });
/** Self-lit glow (eyes, runes, embers) — unlit-looking, cheap. */
export const glow = (color, intensity = 2.2) => mat("#000000", 1, 0, { emissive: color, emissiveIntensity: intensity });

export function disposeMaterials() {
  for (const m of mats.values()) m.dispose();
  mats.clear();
}

/* ------------------------------------------------------------------ geometry helpers */
const geos = new Map();
/** cached geometry by key (built once, shared) */
export function geo(key, build) {
  let g = geos.get(key);
  if (!g) {
    g = build();
    geos.set(key, g);
  }
  return g;
}
export function disposeGeometries() {
  for (const g of geos.values()) g.dispose();
  geos.clear();
}

const V2 = (x, y) => new THREE.Vector2(x, y);
/** Lathe from [radius, y] pairs, optional elliptical squash. */
export function lathe(pts, seg = 16, sx = 1, sz = 1, phiStart = 0, phiLen = Math.PI * 2) {
  // LatheGeometry faces outward only when the profile runs bottom → top
  const ordered = pts[0][1] > pts[pts.length - 1][1] ? pts.slice().reverse() : pts;
  const g = new THREE.LatheGeometry(ordered.map(([r, y]) => V2(Math.max(0.0005, r), y)), seg, phiStart, phiLen);
  if (sx !== 1 || sz !== 1) g.scale(sx, 1, sz);
  g.computeVertexNormals();
  return g;
}
export function ellipsoid(rx, ry, rz, ws = 16, hs = 12) {
  const g = new THREE.SphereGeometry(1, ws, hs);
  g.scale(rx, ry, rz);
  return g;
}
export function rbox(w, h, d, r = 0.02, seg = 2) {
  // rounded-ish box: a box with bevelled vertices pulled in (cheap "soft" look)
  const g = new THREE.BoxGeometry(w, h, d, seg, seg, seg);
  const pos = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const ax = Math.abs(v.x) / (w / 2);
    const ay = Math.abs(v.y) / (h / 2);
    const az = Math.abs(v.z) / (d / 2);
    const corner = (ax > 0.99 ? 1 : 0) + (ay > 0.99 ? 1 : 0) + (az > 0.99 ? 1 : 0);
    if (corner >= 2) {
      v.x -= Math.sign(v.x) * r * (ax > 0.99 ? 0.6 : 0);
      v.y -= Math.sign(v.y) * r * (ay > 0.99 ? 0.6 : 0);
      v.z -= Math.sign(v.z) * r * (az > 0.99 ? 0.6 : 0);
      pos.setXYZ(i, v.x, v.y, v.z);
    }
  }
  g.computeVertexNormals();
  return g;
}

/** Make a mesh, add it, return it. */
export function addMesh(parent, g, m, pos, rot, scl, shadows = true) {
  const mesh = new THREE.Mesh(g, m);
  if (pos) mesh.position.set(pos[0], pos[1], pos[2]);
  if (rot) mesh.rotation.set(rot[0], rot[1], rot[2]);
  if (scl) mesh.scale.set(scl[0], scl[1], scl[2]);
  mesh.castShadow = shadows;
  mesh.receiveShadow = false;
  parent.add(mesh);
  return mesh;
}
export function group(parent, pos) {
  const g = new THREE.Group();
  if (pos) g.position.set(pos[0], pos[1], pos[2]);
  if (parent) parent.add(g);
  return g;
}

/* ------------------------------------------------------------------ environment (metal reflections) */
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
const envs = new WeakMap();
/**
 * Polished armour needs something to reflect or it renders black. A small
 * prefiltered "room" environment, dimmed and tinted by the scene lights, is
 * enough — cached per renderer, freed with it.
 */
export function applyEnvironment(gl, scene, intensity = 0.4) {
  let tex = envs.get(gl);
  if (!tex) {
    const pm = new THREE.PMREMGenerator(gl);
    const room = new RoomEnvironment();
    tex = pm.fromScene(room, 0.04).texture;
    room.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
    pm.dispose();
    envs.set(gl, tex);
  }
  scene.environment = tex;
  scene.environmentIntensity = intensity;
  return tex;
}
export function releaseEnvironment(gl) {
  const tex = envs.get(gl);
  if (tex) {
    tex.dispose();
    envs.delete(gl);
  }
}
