/**
 * Arena Gladiator — weapon & shield meshes.
 *
 * Convention (matches data/weapons.js blade geometry): the grip centre is the
 * origin, the blade points along +Y, and the blade's WIDTH runs along +X (the
 * renderer turns +X toward the direction the edge travels), thickness along Z.
 * A shield's face looks along +Z with the grip at the origin.
 */
import * as THREE from "three";
import { shieldTexture, leatherTexture } from "./textures.js";

const mats = new Map();
export function matOf(color, rough = 0.6, metal = 0, extra = {}) {
  const key = `${color}|${rough}|${metal}|${extra.map ? extra.map.uuid : ""}|${extra.side || 0}|${extra.emissive || ""}`;
  if (!mats.has(key)) mats.set(key, new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...extra }));
  return mats.get(key);
}

const STEEL = () => matOf("#c9ccd1", 0.28, 0.9);
const DARK_STEEL = () => matOf("#6d7178", 0.4, 0.85);
const BRONZE = () => matOf("#b8894a", 0.35, 0.85);
const WOOD = () => matOf("#6b4a2c", 0.75, 0);
const LEATHER = () => matOf("#3b2718", 0.8, 0, { map: leatherTexture("#4a3020") });

function extrudeBlade(shape, thick, bevel) {
  const g = new THREE.ExtrudeGeometry(shape, { depth: thick, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * 1.4, bevelSegments: 2, curveSegments: 8 });
  g.translate(0, 0, -thick / 2);
  g.computeVertexNormals();
  return g;
}

function grip(group, { from = -0.07, to = 0.07, r = 0.017, pommel = true, guard = "bar", guardMat = BRONZE() } = {}) {
  const h = to - from;
  const gm = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.05, h, 10), LEATHER());
  gm.position.y = (from + to) / 2;
  group.add(gm);
  for (let i = 0; i < 4; i++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r * 1.02, 0.0035, 5, 12), matOf("#2a1a10", 0.8));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = from + (h * (i + 0.5)) / 4;
    group.add(ring);
  }
  if (pommel) {
    const p = new THREE.Mesh(new THREE.SphereGeometry(0.028, 14, 10), guardMat);
    p.scale.set(1, 0.8, 0.9);
    p.position.y = from - 0.018;
    group.add(p);
  }
  if (guard === "bar") {
    const gd = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.022, 0.04), guardMat);
    gd.position.y = to + 0.012;
    group.add(gd);
  } else if (guard === "disc") {
    const gd = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.02, 16), guardMat);
    gd.position.y = to + 0.01;
    group.add(gd);
  }
}

function gladius() {
  const g = new THREE.Group();
  grip(g, { from: -0.065, to: 0.075, guard: "disc" });
  // leaf-shaped blade with a long taper to the point: 0.1 → 0.88
  const s = new THREE.Shape();
  const w = 0.03;
  s.moveTo(-w * 0.95, 0.09);
  s.lineTo(-w * 0.82, 0.3);
  s.quadraticCurveTo(-w * 1.05, 0.58, -w * 0.95, 0.7);
  s.lineTo(0, 0.88);
  s.lineTo(w * 0.95, 0.7);
  s.quadraticCurveTo(w * 1.05, 0.58, w * 0.82, 0.3);
  s.lineTo(w * 0.95, 0.09);
  s.closePath();
  const blade = new THREE.Mesh(extrudeBlade(s, 0.006, 0.0035), STEEL());
  g.add(blade);
  // fuller
  const fuller = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.5, 0.0115), DARK_STEEL());
  fuller.position.y = 0.38;
  g.add(fuller);
  return g;
}

function longsword() {
  const g = new THREE.Group();
  grip(g, { from: -0.08, to: 0.075, guard: "bar", guardMat: DARK_STEEL() });
  const s = new THREE.Shape();
  const w = 0.026;
  s.moveTo(-w, 0.09);
  s.lineTo(-w * 0.8, 0.84);
  s.lineTo(0, 1.0);
  s.lineTo(w * 0.8, 0.84);
  s.lineTo(w, 0.09);
  s.closePath();
  g.add(new THREE.Mesh(extrudeBlade(s, 0.006, 0.003), STEEL()));
  const fuller = new THREE.Mesh(new THREE.BoxGeometry(0.007, 0.6, 0.011), DARK_STEEL());
  fuller.position.y = 0.42;
  g.add(fuller);
  return g;
}

function sica() {
  const g = new THREE.Group();
  grip(g, { from: -0.06, to: 0.07, guard: "bar" });
  // curved blade, edge on +X (leading)
  const s = new THREE.Shape();
  s.moveTo(-0.022, 0.085);
  s.quadraticCurveTo(-0.03, 0.4, 0.05, 0.69);
  s.quadraticCurveTo(0.045, 0.4, 0.024, 0.085);
  s.closePath();
  g.add(new THREE.Mesh(extrudeBlade(s, 0.005, 0.003), STEEL()));
  return g;
}

function spear() {
  const g = new THREE.Group();
  // shaft −0.55 → 1.02, head 1.02 → 1.4
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.02, 1.57, 10), WOOD());
  shaft.position.y = (-0.55 + 1.02) / 2;
  g.add(shaft);
  const wrap = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.18, 10), LEATHER());
  g.add(wrap);
  const butt = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.07, 10), BRONZE());
  butt.rotation.x = Math.PI;
  butt.position.y = -0.58;
  g.add(butt);
  const socket = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.022, 0.1, 10), DARK_STEEL());
  socket.position.y = 1.03;
  g.add(socket);
  const s = new THREE.Shape();
  s.moveTo(-0.012, 1.07);
  s.quadraticCurveTo(-0.05, 1.16, -0.035, 1.24);
  s.lineTo(0, 1.4);
  s.lineTo(0.035, 1.24);
  s.quadraticCurveTo(0.05, 1.16, 0.012, 1.07);
  s.closePath();
  g.add(new THREE.Mesh(extrudeBlade(s, 0.008, 0.004), STEEL()));
  return g;
}

function axe() {
  const g = new THREE.Group();
  const haft = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.022, 1.12, 10), WOOD());
  haft.position.y = 0.31;
  g.add(haft);
  const wrap = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.2, 10), LEATHER());
  g.add(wrap);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), DARK_STEEL());
  knob.position.y = -0.26;
  g.add(knob);
  // bearded head: eye at the haft, blade sweeping to +X with a long lower beard
  const s = new THREE.Shape();
  s.moveTo(-0.03, 0.8);
  s.lineTo(0.05, 0.8);
  s.quadraticCurveTo(0.12, 0.86, 0.19, 0.9);
  s.quadraticCurveTo(0.225, 0.78, 0.2, 0.62);
  s.quadraticCurveTo(0.12, 0.66, 0.06, 0.72);
  s.lineTo(-0.03, 0.72);
  s.closePath();
  g.add(new THREE.Mesh(extrudeBlade(s, 0.02, 0.006), DARK_STEEL()));
  const edge = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.27, 0.012), STEEL());
  edge.position.set(0.205, 0.76, 0);
  edge.rotation.z = 0.12;
  g.add(edge);
  const eye = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.1, 10), DARK_STEEL());
  eye.position.y = 0.76;
  g.add(eye);
  return g;
}

export function buildWeaponMesh(model) {
  let g;
  if (model === "longsword") g = longsword();
  else if (model === "spear") g = spear();
  else if (model === "axe") g = axe();
  else if (model === "sica") g = sica();
  else g = gladius();
  g.traverse((m) => {
    if (m.isMesh) m.castShadow = true;
  });
  return g;
}

/** Shield: slightly domed face (+Z), metal rim, central boss. */
export function buildShieldMesh(shape, color = "#8e1f1a", trim = "#d9ad4b", pattern = 0) {
  const g = new THREE.Group();
  const R = shape === "oval" ? 0.3 : 0.3;
  const face = new THREE.SphereGeometry(1, 36, 12, 0, Math.PI * 2, 0, 0.42);
  // dome cap → flatten and scale to radius
  face.rotateX(Math.PI / 2);
  const capR = Math.sin(0.42);
  face.scale(R / capR, R / capR, 0.35);
  face.translate(0, 0, -Math.cos(0.42) * 0.35 + 0.02);
  face.computeVertexNormals();
  // planar uv from xy
  const pos = face.attributes.position;
  const uv = face.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / (2 * R) + 0.5, pos.getY(i) / (2 * R) + 0.5);
  const faceMat = new THREE.MeshStandardMaterial({ map: shieldTexture(color, trim, pattern), roughness: 0.7, metalness: 0.05 });
  const fm = new THREE.Mesh(face, faceMat);
  g.add(fm);
  const back = new THREE.Mesh(new THREE.CircleGeometry(R, 32), matOf("#4a3524", 0.9, 0, { side: THREE.DoubleSide }));
  back.position.z = -0.005;
  back.rotation.y = Math.PI;
  g.add(back);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(R, 0.014, 8, 40), BRONZE());
  rim.position.z = 0.0;
  g.add(rim);
  const boss = new THREE.Mesh(new THREE.SphereGeometry(0.07, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2), BRONZE());
  boss.rotation.x = Math.PI / 2;
  boss.position.z = 0.03;
  g.add(boss);
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.12, 0.03), LEATHER());
  handle.position.z = -0.03;
  g.add(handle);
  if (shape === "oval") g.scale.set(0.9, 1.25, 1);
  g.traverse((m) => {
    if (m.isMesh) m.castShadow = true;
  });
  g.userData.faceMat = faceMat;
  return g;
}

/** Rescale shield materials on dispose (face material is per-shield). */
export function disposeShield(g) {
  if (g && g.userData.faceMat) g.userData.faceMat.dispose();
}
