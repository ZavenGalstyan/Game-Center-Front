/**
 * Last Shelter — the Barlows as chunky stylised 3D figures for the house
 * phase. Each figure is a small rig of rounded primitives (hips → torso →
 * head, shoulder-pivoted arms, hip-pivoted legs) with a face and a hairstyle
 * of its own. animate() drives walk, idle, waving-for-help and carrying.
 */
import * as THREE from "three";
import { BY_ID } from "../data/family.js";
import { bakeLocal } from "./bake.js";

const SCALE = { hollis: 1.08, june: 1.0, remy: 0.94, pip: 0.74 };

export function buildCharacter(kit, id) {
  const C = BY_ID[id].colors;
  const { box, mesh, mat, sph, cyl, g, shadeOf } = kit;
  const root = new THREE.Group();
  const rig = new THREE.Group();
  rig.scale.setScalar(SCALE[id]);
  root.add(rig);
  const broad = id === "hollis" ? 1.15 : id === "pip" ? 0.95 : 1;
  const skin = mat(C.skin, { rough: 0.6 });
  // legs
  const legs = [];
  for (const sx of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(sx * 0.1 * broad, 0.46, 0);
    rig.add(pivot);
    mesh(cyl(0.075, 0.07, 0.36, 10), mat(C.pants, { rough: 0.8 }), 0, -0.2, 0, pivot);
    box(pivot, 0.14, 0.09, 0.22, id === "pip" ? "#ef6f8a" : "#3b3030", 0, -0.46, 0.03, { r: 0.04 });
    legs.push(pivot);
  }
  // hips + torso
  const torso = new THREE.Group();
  torso.position.y = 0.44;
  rig.add(torso);
  box(torso, 0.34 * broad, 0.16, 0.22, C.pants, 0, -0.02, 0, { r: 0.07 });
  const chest = box(torso, 0.4 * broad, 0.44, 0.26, C.top, 0, 0.1, 0, { r: 0.11, rough: 0.85 });
  chest.castShadow = true;
  // clothing details
  if (id === "hollis") {
    for (let i = 0; i < 3; i++) box(torso, 0.41 * broad, 0.03, 0.265, C.top2, 0, 0.18 + i * 0.12, 0, { r: 0.012 });
    box(torso, 0.05, 0.3, 0.02, "#e8d9c0", 0, 0.24, 0.13, { r: 0.01 });
  } else if (id === "june") {
    box(torso, 0.16, 0.34, 0.02, "#e9f5f2", 0, 0.16, 0.13, { r: 0.02 });
    box(torso, 0.06, 0.06, 0.02, "#e04b4b", 0.12, 0.38, 0.135, { r: 0.01 });
  } else if (id === "remy") {
    box(torso, 0.24, 0.1, 0.02, C.top2, 0, 0.14, 0.13, { r: 0.03 });
    const hood = mesh(sph(0.16, 12), mat(C.top2), 0, 0.5, -0.12, torso);
    hood.scale.set(1.2, 0.7, 0.8);
  } else if (id === "pip") {
    for (let i = 0; i < 3; i++) mesh(sph(0.022, 8), mat("#7a4f12"), 0, 0.16 + i * 0.09, 0.135, torso);
    box(torso, 0.42 * broad, 0.06, 0.27, C.top2, 0, 0.1, 0, { r: 0.03 });
  }
  // arms
  const arms = [];
  for (const sx of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(sx * (0.22 * broad + 0.04), 0.5, 0);
    torso.add(pivot);
    mesh(cyl(0.06, 0.055, 0.34, 10), mat(id === "june" ? C.top2 : C.top, { rough: 0.85 }), 0, -0.16, 0, pivot);
    mesh(sph(0.06, 10), skin, 0, -0.36, 0, pivot);
    arms.push(pivot);
  }
  // head
  const head = new THREE.Group();
  const big = id === "pip" ? 1.18 : id === "remy" ? 1.04 : 1;
  head.position.y = 0.6 + 0.24 * big;
  head.scale.setScalar(big);
  torso.add(head);
  mesh(cyl(0.06, 0.07, 0.08, 10), skin, 0, -0.24, 0, head);
  const skull = mesh(sph(0.25, 20), skin, 0, 0, 0, head);
  skull.scale.set(1, 0.98, 0.95);
  for (const sx of [-1, 1]) mesh(sph(0.05, 8), skin, sx * 0.245, 0, 0, head).scale.set(0.5, 1, 0.8);
  // face
  const eyeM = mat("#1d1b22", { rough: 0.3 });
  const eyes = [];
  for (const sx of [-1, 1]) {
    const e = mesh(sph(0.036, 10), eyeM, sx * 0.085, 0.02, 0.215, head);
    e.scale.set(0.85, 1.15, 0.6);
    eyes.push(e);
    mesh(sph(0.011, 6), mat("#ffffff", { emissive: "#ffffff", ei: 0.4 }), sx * 0.085 + 0.012, 0.04, 0.237, head);
    const brow = box(head, 0.07, 0.016, 0.02, shadeOf(C.hair, -0.05), sx * 0.09, 0.085, 0.215, { r: 0.007 });
    brow.rotation.z = -sx * 0.12;
    const cheek = mesh(g("disc", () => new THREE.CircleGeometry(0.035, 14)), mat("#ff8f8f", { opacity: 0.45 }), sx * 0.15, -0.045, 0.205, head);
    cheek.rotation.y = sx * 0.55;
    cheek.castShadow = false;
  }
  mesh(sph(0.032, 8), mat(shadeOf(C.skin, -0.05)), 0, -0.025, 0.24, head);
  const mouth = mesh(g("smile", () => new THREE.TorusGeometry(0.045, 0.011, 6, 14, Math.PI)), mat("#6b2b2b"), 0, -0.085, 0.215, head);
  mouth.rotation.z = Math.PI;
  mouth.castShadow = false;
  // hair styles
  const hair = mat(C.hair, { rough: 0.7 });
  if (id === "hollis") {
    const cap = mesh(sph(0.258, 18), hair, 0, 0.05, -0.02, head);
    cap.scale.set(1, 0.72, 0.98);
    const beard = mesh(sph(0.2, 14), hair, 0, -0.12, 0.08, head);
    beard.scale.set(1.12, 0.62, 0.78);
    mesh(sph(0.06, 8), skin, 0, -0.07, 0.215, head).scale.set(1.2, 0.5, 0.5); // lip gap so the smile reads
  } else if (id === "june") {
    const cap = mesh(sph(0.262, 18), hair, 0, 0.06, -0.03, head);
    cap.scale.set(1.04, 0.8, 1.0);
    mesh(sph(0.12, 12), hair, 0, 0.2, -0.2, head);
    for (const sx of [-1, 1]) {
      const r = mesh(g("ring", () => new THREE.TorusGeometry(0.052, 0.009, 6, 18)), mat("#2b2d42", { metal: 0.4 }), sx * 0.085, 0.02, 0.235, head);
      r.castShadow = false;
    }
    box(head, 0.06, 0.01, 0.01, "#2b2d42", 0, 0.03, 0.245, { r: 0.004 });
  } else if (id === "remy") {
    const cap = mesh(sph(0.262, 18), hair, 0, 0.07, -0.02, head);
    cap.scale.set(1.04, 0.78, 1.02);
    for (let i = 0; i < 6; i++) {
      const s = mesh(g("spike", () => new THREE.ConeGeometry(0.07, 0.16, 6)), i === 2 ? mat(C.accent) : hair, -0.15 + i * 0.06, 0.2 + (i % 2) * 0.03, 0.08 - (i % 3) * 0.06, head);
      s.rotation.set(0.5 - (i % 3) * 0.3, 0, -0.5 + i * 0.2);
    }
    const band = mesh(g("hp", () => new THREE.TorusGeometry(0.27, 0.02, 6, 20, Math.PI)), mat("#2b2d42"), 0, 0.02, -0.02, head);
    band.rotation.z = 0;
    for (const sx of [-1, 1]) {
      const cup = mesh(cyl(0.07, 0.07, 0.05, 14), mat(C.accent), sx * 0.26, 0, 0, head);
      cup.rotation.z = Math.PI / 2;
    }
  } else if (id === "pip") {
    const cap = mesh(sph(0.262, 18), hair, 0, 0.07, -0.03, head);
    cap.scale.set(1.04, 0.82, 1.02);
    const fringe = mesh(sph(0.2, 14), hair, 0, 0.13, 0.1, head);
    fringe.scale.set(1.1, 0.45, 0.7);
    for (const sx of [-1, 1]) {
      mesh(sph(0.09, 10), hair, sx * 0.27, -0.02, -0.06, head).scale.set(0.8, 1.2, 0.8);
      mesh(sph(0.03, 8), mat(C.accent), sx * 0.24, 0.07, -0.05, head);
    }
  }
  // what the runner is carrying sits in front of the chest
  const carry = new THREE.Group();
  carry.position.set(0, 0.42, 0.28);
  torso.add(carry);
  // help bubble for family members waiting to be found
  const bubble = makeBubble(kit);
  bubble.position.set(0, 1.95 * SCALE[id], 0);
  bubble.visible = false;
  root.add(bubble);
  // soft contact shadow
  const blob = new THREE.Mesh(g("blobPlane", () => new THREE.PlaneGeometry(1, 1)), kit.blobMat);
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = 0.015;
  blob.scale.setScalar(0.75 * SCALE[id]);
  blob.renderOrder = 1;
  root.add(blob);
  root.traverse((o) => {
    if (o.isMesh && o !== blob) o.castShadow = true;
  });
  // ~45 rounded parts → a handful of meshes; eyes and mouth stay separate (they animate)
  if (kit.vcMat) bakeLocal(rig, kit.vcMat, new Set([...eyes, mouth, carry]), kit.track);
  return { id, root, rig, torso, head, arms, legs, eyes, mouth, carry, bubble, blob, phase: Math.random() * 6, blinkT: 2 + Math.random() * 3, carried: [] };
}

function makeBubble(kit) {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 128;
  const g = c.getContext("2d");
  g.fillStyle = "#fff8e7";
  g.strokeStyle = "#2b2d42";
  g.lineWidth = 6;
  g.beginPath();
  g.arc(64, 56, 44, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  g.beginPath();
  g.moveTo(52, 96);
  g.lineTo(64, 122);
  g.lineTo(76, 96);
  g.fill();
  g.fillStyle = "#e63946";
  g.font = "bold 70px sans-serif";
  g.textAlign = "center";
  g.fillText("!", 64, 82);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  kit.extraTextures.push(t);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true }));
  kit.extraMaterials.push(s.material);
  s.scale.set(0.55, 0.55, 1);
  s.renderOrder = 10;
  return s;
}

/**
 * Pose a character for this frame.
 *  speed   ground speed (m/s), drives the walk cycle
 *  mode    "idle" | "walk" | "help" (waving) | "carry" | "scared"
 */
export function animate(ch, dt, t, speed, mode) {
  const walk = Math.min(1, speed / 3.5);
  ch.phase += dt * (4 + speed * 2.6);
  const s = Math.sin(ch.phase);
  const c = Math.cos(ch.phase);
  const [legL, legR] = ch.legs;
  const [armL, armR] = ch.arms;
  legL.rotation.x = s * 0.75 * walk;
  legR.rotation.x = -s * 0.75 * walk;
  ch.rig.position.y = Math.abs(c) * 0.06 * walk + (1 - walk) * Math.sin(t * 2.2 + ch.phase * 0.1) * 0.008;
  ch.torso.rotation.z = s * 0.05 * walk;
  ch.torso.rotation.x = 0.08 * walk;
  ch.head.rotation.z = -s * 0.04 * walk;
  const breathe = 1 + Math.sin(t * 2.4 + ch.phase * 0.05) * 0.012;
  ch.torso.scale.set(1, breathe, 1);
  if (mode === "carry" || ch.carried.length) {
    armL.rotation.set(-1.25, 0, 0.12);
    armR.rotation.set(-1.25, 0, -0.12);
  } else if (mode === "help") {
    armL.rotation.set(-s * 0.1, 0, 0.15);
    armR.rotation.set(Math.PI * 0.85, 0, -0.3 + Math.sin(t * 9) * 0.45);
    ch.rig.position.y = Math.abs(Math.sin(t * 4.5)) * 0.07;
  } else if (mode === "scared") {
    armL.rotation.set(-2.6, 0, 0.5);
    armR.rotation.set(-2.6, 0, -0.5);
  } else {
    armL.rotation.set(-s * 0.7 * walk, 0, 0.1);
    armR.rotation.set(s * 0.7 * walk, 0, -0.1);
  }
  // blink
  ch.blinkT -= dt;
  const closed = ch.blinkT < 0.12;
  for (const e of ch.eyes) e.scale.y = closed ? 0.15 : 1.15;
  if (ch.blinkT < 0) ch.blinkT = 2 + Math.random() * 3.5;
  ch.mouth.scale.set(1, mode === "help" || mode === "scared" ? -1.2 : 1, 1);
  if (ch.bubble.visible) {
    const k = 0.55 + Math.sin(t * 6) * 0.05;
    ch.bubble.scale.set(k, k, 1);
  }
}
