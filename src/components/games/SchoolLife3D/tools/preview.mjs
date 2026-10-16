/**
 * DEV-only: line up raw character GLBs from /models/school-life in the running
 * game scene (use with tools/snap.mjs to render them).
 */
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

const loader = new GLTFLoader();
const load = (url) => new Promise((res, rej) => loader.load(url, res, undefined, rej));

export async function rawLineup(names, { z = -26, gap = 0.8, clip = "Idle", t = 1.2 } = {}) {
  const W = window.__sl.world;
  (window.__raw || []).forEach((o) => o.removeFromParent());
  const anims = { M: await load("/models/school-life/M_anims.glb"), F: await load("/models/school-life/F_anims.glb") };
  window.__raw = [];
  for (let i = 0; i < names.length; i++) {
    const g = await load(`/models/school-life/${names[i]}.glb`);
    const root = g.scene;
    root.position.set((i - (names.length - 1) / 2) * gap, 0, z);
    root.rotation.y = Math.PI;
    root.traverse((o) => {
      if (o.isMesh) o.castShadow = true;
    });
    W.scene.add(root);
    const set = anims[names[i][0]];
    const mixer = new THREE.AnimationMixer(root);
    const c = set.animations.find((a) => a.name === clip);
    if (c) {
      mixer.clipAction(c).play();
      mixer.update(t);
    }
    root.updateMatrixWorld(true);
    window.__raw.push(root);
  }
  return window.__raw.length;
}

import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
/** Experiment: smooth normals, proper eyeballs and a mouth on a raw Quaternius character. */
export function enhance(root, { smooth = true, eyes = true, mouth = true, iris = "#3b6ea8" } = {}) {
  const meshes = [];
  root.traverse((o) => o.isSkinnedMesh && meshes.push(o));
  if (smooth) {
    for (const m of meshes) {
      if (m.material.name === "Eye") continue;
      const g = m.geometry.clone();
      g.deleteAttribute("normal");
      const merged = mergeVertices(g, 1e-4);
      merged.computeVertexNormals();
      m.geometry = merged;
    }
  }
  const eye = meshes.find((m) => m.material.name === "Eye");
  const headSkin = meshes.find((m) => m.name.includes("Head") && m.material.name === "Skin") || meshes.find((m) => m.material.name === "Skin" && /Head/.test(m.parent?.name || m.name));
  if (eye && eyes) {
    const sk = eye.skeleton;
    const hi = sk.bones.findIndex((b) => b.name === "Head");
    const head = sk.bones[hi];
    const toHead = new THREE.Matrix4().multiplyMatrices(sk.boneInverses[hi], eye.bindMatrix);
    const pos = eye.geometry.attributes.position;
    const sides = { L: [], R: [] };
    for (let i = 0; i < pos.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(toHead);
      sides[v.x > 0 ? "L" : "R"].push(v);
    }
    eye.visible = false;
    const white = new THREE.MeshPhysicalMaterial({ color: "#f6f4f0", roughness: 0.25, clearcoat: 1 });
    const irisM = new THREE.MeshPhysicalMaterial({ color: iris, roughness: 0.3, clearcoat: 1 });
    const pupilM = new THREE.MeshBasicMaterial({ color: "#0b0b0d" });
    for (const k of ["L", "R"]) {
      const pts = sides[k];
      const box = new THREE.Box3().setFromPoints(pts);
      const c = box.getCenter(new THREE.Vector3());
      const sz = box.getSize(new THREE.Vector3());
      const r = Math.max(sz.x, sz.y) * 0.5;
      const g = new THREE.Group();
      g.position.copy(c).add(new THREE.Vector3(0, 0, -r * 0.35));
      const ball = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 14), white);
      ball.scale.set(1, 0.92, 0.8);
      const ir = new THREE.Mesh(new THREE.SphereGeometry(r * 0.55, 16, 10), irisM);
      ir.position.z = r * 0.62;
      ir.scale.z = 0.4;
      const pu = new THREE.Mesh(new THREE.SphereGeometry(r * 0.27, 12, 8), pupilM);
      pu.position.z = r * 0.78;
      pu.scale.z = 0.3;
      const hl = new THREE.Mesh(new THREE.SphereGeometry(r * 0.09, 8, 6), new THREE.MeshBasicMaterial({ color: "#ffffff" }));
      hl.position.set(r * 0.18, r * 0.2, r * 0.86);
      g.add(ball, ir, pu, hl);
      head.add(g);
    }
  }
  void headSkin;
  void mouth;
  return meshes.length;
}
