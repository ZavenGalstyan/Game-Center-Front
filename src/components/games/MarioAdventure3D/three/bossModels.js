/**
 * Mario Adventure 3D — boss models (original designs) + animation.
 *
 *   King Trooper   a giant crowned mushroom trooper with a royal cape
 *   Tomb Scarab    a jewelled desert beetle with golden hieroglyph bands
 *   Captain Crab   a pirate crab: tricorne hat, one huge claw
 *   Frost Yeti     a shaggy snow beast with horns and an icy back
 *   Magma King     a basalt-shelled dragon-turtle with lava cracks and a fire mane
 *
 * animateBoss() poses the rig from B.anim (walk, windup, run, jump, dazed,
 * hurt, roar, breath, claw, throw, dig, burrow, flipped, defeat), flashes on
 * hits, spins dizzy stars while dazed and draws the ground telegraphs
 * (B.marks) as pulsing red rings.
 */
import * as THREE from "three";
import { starShape } from "./props.js";

function mk(G, bank) {
  const sph = G.get("bSph", () => new THREE.SphereGeometry(1, 24, 16));
  const cone = G.get("bCone", () => new THREE.ConeGeometry(1, 1, 16));
  const cyl = G.get("bCyl", () => new THREE.CylinderGeometry(1, 1, 1, 20));
  const caps = G.get("bCaps", () => new THREE.CapsuleGeometry(1, 1, 6, 14));
  const box = G.get("bBox", () => new THREE.BoxGeometry(1, 1, 1));
  const geo = { sph, cone, cyl, caps, box };
  const mats = [];
  return {
    mats,
    part(parent, g, color, pos, scale, rot, o = {}) {
      const m = new THREE.Mesh(geo[g] || g, bank.own(new THREE.MeshStandardMaterial({ color, roughness: o.rough ?? 0.55, metalness: o.metal ?? 0, emissive: o.emissive || "#000000", emissiveIntensity: o.ei ?? 1, flatShading: !!o.flat })));
      m.material.userData.baseEmissive = m.material.emissive.clone();
      mats.push(m.material);
      m.position.set(pos[0], pos[1], pos[2]);
      m.scale.set(scale[0], scale[1], scale[2]);
      if (rot) m.rotation.set(rot[0], rot[1], rot[2]);
      m.castShadow = true;
      parent.add(m);
      return m;
    },
    node(parent, pos) {
      const n = new THREE.Group();
      n.position.set(pos[0], pos[1], pos[2]);
      parent.add(n);
      return n;
    },
  };
}

function eyes(K, parent, x, y, z, s, angry = true, iris = "#111") {
  for (const sd of [-1, 1]) {
    K.part(parent, "sph", "#ffffff", [x * sd, y, z], [0.24 * s, 0.32 * s, 0.14 * s]);
    K.part(parent, "sph", iris, [x * sd * 0.95, y - 0.03 * s, z + 0.1 * s], [0.12 * s, 0.17 * s, 0.07 * s]);
    if (angry) K.part(parent, "box", "#1a0f08", [x * sd, y + 0.36 * s, z + 0.06 * s], [0.42 * s, 0.1 * s, 0.08 * s], [0, 0, -0.45 * sd]);
  }
}

export function makeBoss(B, ctx) {
  const { G, bank } = ctx;
  const K = mk(G, bank);
  const root = new THREE.Group();
  const body = K.node(root, [0, 0, 0]);
  const U = { body, K, kind: B.kind };
  switch (B.kind) {
    case "kingTrooper": {
      K.part(body, "sph", "#f1d2a0", [0, 1.35, 0], [1.3, 1.2, 1.25]);
      U.head = K.node(body, [0, 2.75, 0]);
      K.part(U.head, "sph", "#7a3a16", [0, 0.3, 0], [2.3, 1.2, 2.1]);
      K.part(U.head, "sph", "#8f4a20", [0, 0.62, 0], [1.9, 0.95, 1.75]);
      eyes(K, body, 0.45, 1.6, 1.12, 2.0);
      for (const sd of [-1, 1]) K.part(body, "cone", "#ffffff", [0.32 * sd, 1.0, 1.1], [0.13, 0.32, 0.13], [Math.PI, 0, 0]);
      // crown
      const crown = K.node(U.head, [0, 1.45, 0]);
      K.part(crown, "cyl", "#ffd23a", [0, 0, 0], [0.75, 0.45, 0.75], null, { metal: 0.6, rough: 0.25, emissive: "#5a3a00", ei: 0.4 });
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        K.part(crown, "cone", "#ffd23a", [Math.cos(a) * 0.62, 0.45, Math.sin(a) * 0.62], [0.16, 0.45, 0.16], null, { metal: 0.6, rough: 0.25, emissive: "#5a3a00", ei: 0.4 });
      }
      K.part(crown, "sph", "#e3262b", [0, 0.1, 0.72], [0.14, 0.14, 0.06], null, { emissive: "#600", ei: 0.6 });
      // cape
      K.part(body, "sph", "#7a1a9a", [0, 1.4, -0.7], [1.3, 1.3, 0.35], [0.2, 0, 0], { rough: 0.8 });
      U.feet = [K.part(root, "sph", "#3a2414", [0.7, 0.3, 0.2], [0.6, 0.35, 0.8]), K.part(root, "sph", "#3a2414", [-0.7, 0.3, 0.2], [0.6, 0.35, 0.8])];
      break;
    }
    case "tombScarab": {
      U.shell = K.node(body, [0, 1.2, 0]);
      K.part(U.shell, "sph", "#1d6b78", [0, 0.2, -0.2], [2.0, 1.3, 2.5], null, { metal: 0.5, rough: 0.25 });
      for (const z of [-1.2, 0, 1.0]) K.part(U.shell, "cyl", "#ffcf3a", [0, 0.25, z - 0.2], [2.02, 0.14, 0.18], [0, 0, Math.PI / 2], { metal: 0.7, rough: 0.2, emissive: "#5a3a00", ei: 0.4 });
      K.part(U.shell, "box", "#0e3c44", [0, 0.6, -0.2], [0.08, 1.1, 4.6], [0, 0, 0], { metal: 0.5 });
      U.head = K.node(body, [0, 1.15, 2.1]);
      K.part(U.head, "sph", "#123f47", [0, 0, 0], [1.0, 0.8, 0.9], null, { metal: 0.5, rough: 0.3 });
      eyes(K, U.head, 0.42, 0.25, 0.75, 1.2, true, "#c01818");
      K.part(U.head, "cone", "#ffcf3a", [0, 0.9, 0.5], [0.22, 1.1, 0.22], [0.5, 0, 0], { metal: 0.7, rough: 0.2 });
      for (const sd of [-1, 1]) K.part(U.head, "cone", "#0e3c44", [0.45 * sd, -0.35, 0.85], [0.13, 0.7, 0.13], [Math.PI / 2 + 0.3, 0, 0.4 * sd]);
      U.legs = [];
      for (let i = 0; i < 6; i++) {
        const sd = i % 2 ? 1 : -1;
        const z = [-1.2, 0, 1.2][Math.floor(i / 2)];
        const piv = K.node(body, [1.5 * sd, 1, z]);
        K.part(piv, "caps", "#0e3c44", [0.55 * sd, -0.45, 0], [0.13, 0.55, 0.13], [0, 0, 0.9 * sd]);
        U.legs.push(piv);
      }
      U.mound = K.part(root, "sph", "#d9a352", [0, 0, 0], [2.4, 0.9, 2.4], null, { rough: 1 });
      U.mound.visible = false;
      break;
    }
    case "captainCrab": {
      K.part(body, "sph", "#e2502a", [0, 1.4, 0], [2.3, 1.15, 1.7], null, { rough: 0.45 });
      K.part(body, "sph", "#ffb48a", [0, 1.1, 0.5], [1.7, 0.7, 1.2]);
      U.head = K.node(body, [0, 2.4, 0.9]);
      for (const sd of [-1, 1]) {
        K.part(U.head, "cyl", "#e2502a", [0.55 * sd, 0.3, 0], [0.1, 0.7, 0.1]);
        K.part(U.head, "sph", "#ffffff", [0.55 * sd, 0.75, 0], [0.26, 0.3, 0.26]);
        K.part(U.head, "sph", "#111111", [0.55 * sd, 0.75, 0.2], [0.12, 0.15, 0.1]);
      }
      // tricorne
      const hat = K.node(body, [0, 2.6, -0.1]);
      K.part(hat, "cyl", "#1d1b2c", [0, 0, 0], [1.3, 0.25, 1.0], null, { rough: 0.7 });
      K.part(hat, "sph", "#1d1b2c", [0, 0.35, 0], [0.85, 0.55, 0.7], null, { rough: 0.7 });
      K.part(hat, "cyl", "#ffd23a", [0, 0.06, 0], [1.32, 0.06, 1.02], null, { metal: 0.6 });
      const emb = new THREE.Mesh(G.get("crabStar", () => starShape(0.22, 0.1, 0.04, false)), bank.color("#ffffff"));
      emb.position.set(0, 0.4, 0.72);
      hat.add(emb);
      U.claws = [];
      for (const sd of [-1, 1]) {
        const big = sd > 0 ? 1.35 : 1;
        const sh = K.node(body, [1.9 * sd, 1.6, 0.8]);
        K.part(sh, "caps", "#e2502a", [0.4 * sd, 0, 0.5], [0.28, 0.6, 0.28], [Math.PI / 2, 0, 0.5 * sd]);
        const claw = K.node(sh, [0.7 * sd, 0, 1.4]);
        K.part(claw, "sph", "#e2502a", [0, 0, 0], [0.75 * big, 0.55 * big, 0.95 * big], null, { rough: 0.4 });
        const pin = K.part(claw, "cone", "#c43a1a", [0, 0.25 * big, 0.9 * big], [0.28 * big, 0.9 * big, 0.28 * big], [Math.PI / 2, 0, 0]);
        U.claws.push({ sh, claw, pin });
      }
      U.legs = [];
      for (let i = 0; i < 6; i++) {
        const sd = i % 2 ? 1 : -1;
        const z = [-0.8, -0.1, 0.6][Math.floor(i / 2)];
        const piv = K.node(body, [2 * sd, 1.2, z]);
        K.part(piv, "caps", "#c43a1a", [0.5 * sd, -0.6, 0], [0.12, 0.6, 0.12], [0, 0, 0.6 * sd]);
        U.legs.push(piv);
      }
      break;
    }
    case "frostYeti": {
      K.part(body, "sph", "#eef4ff", [0, 1.9, 0], [1.6, 1.9, 1.4], null, { rough: 0.95 });
      K.part(body, "sph", "#d9e6f7", [0, 1.6, 0.6], [1.15, 1.35, 0.9], null, { rough: 0.95 });
      U.head = K.node(body, [0, 3.7, 0.3]);
      K.part(U.head, "sph", "#eef4ff", [0, 0, 0], [1.0, 0.9, 0.95], null, { rough: 0.95 });
      K.part(U.head, "sph", "#7fa8d9", [0, -0.1, 0.55], [0.7, 0.6, 0.5]);
      eyes(K, U.head, 0.28, 0.08, 0.95, 0.9, true, "#1a3a7a");
      U.jaw = K.part(U.head, "sph", "#4a1a2a", [0, -0.38, 0.85], [0.35, 0.12, 0.15]);
      for (const sd of [-1, 1]) K.part(U.head, "cone", "#c9d4e2", [0.75 * sd, 0.7, 0], [0.18, 0.8, 0.18], [0, 0, -0.6 * sd], { rough: 0.4 });
      for (let i = 0; i < 4; i++) K.part(body, "cone", "#8fe0ff", [(i - 1.5) * 0.5, 2.9 - Math.abs(i - 1.5) * 0.25, -1.05], [0.2, 0.9, 0.2], [-0.5, 0, 0], { emissive: "#3aa8e8", ei: 0.5, rough: 0.1 });
      U.arms = [];
      for (const sd of [-1, 1]) {
        const sh = K.node(body, [1.55 * sd, 2.7, 0.1]);
        K.part(sh, "caps", "#eef4ff", [0.2 * sd, -0.8, 0], [0.45, 0.9, 0.45], [0, 0, 0.25 * sd], { rough: 0.95 });
        K.part(sh, "sph", "#7fa8d9", [0.35 * sd, -1.8, 0.1], [0.45, 0.4, 0.5]);
        U.arms.push(sh);
      }
      U.feet = [K.part(root, "sph", "#7fa8d9", [0.7, 0.25, 0.3], [0.6, 0.3, 0.85]), K.part(root, "sph", "#7fa8d9", [-0.7, 0.25, 0.3], [0.6, 0.3, 0.85])];
      break;
    }
    case "magmaKing": {
      // shell + body
      U.shell = K.node(body, [0, 2.0, -0.3]);
      K.part(U.shell, "sph", "#2c2122", [0, 0, 0], [1.9, 1.75, 1.7], null, { rough: 0.5, flat: true });
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        K.part(U.shell, "cone", "#ffb02e", [Math.cos(a) * 1.3, 0.9 + Math.sin(a * 2) * 0.15, Math.sin(a) * 1.15 - 0.2], [0.22, 0.7, 0.22], [Math.sin(a) * -0.6, 0, -Math.cos(a) * 0.6], { metal: 0.4, rough: 0.3, emissive: "#a04000", ei: 0.6 });
      }
      K.part(U.shell, "sph", "#ff5a1f", [0, 0.2, -1.0], [1.3, 1.1, 0.8], null, { emissive: "#ff3a00", ei: 1.2 });
      K.part(body, "sph", "#ffb26a", [0, 1.8, 0.75], [1.25, 1.45, 0.8], null, { rough: 0.7 });
      U.head = K.node(body, [0, 3.6, 1.1]);
      K.part(U.head, "sph", "#7a2a1a", [0, 0, 0], [1.0, 0.85, 1.0], null, { rough: 0.5 });
      K.part(U.head, "sph", "#7a2a1a", [0, -0.25, 0.75], [0.75, 0.45, 0.7]);
      U.jaw = K.part(U.head, "sph", "#5a1a10", [0, -0.6, 0.65], [0.65, 0.22, 0.6]);
      eyes(K, U.head, 0.32, 0.25, 0.82, 0.9, true, "#ff3a00");
      for (const sd of [-1, 1]) K.part(U.head, "cone", "#ffe0a0", [0.6 * sd, 0.75, -0.1], [0.2, 0.95, 0.2], [-0.35, 0, -0.5 * sd], { rough: 0.3 });
      // fire mane
      U.mane = [];
      for (let i = 0; i < 6; i++) {
        const m = K.part(U.head, "cone", i % 2 ? "#ff7a1f" : "#ffcf3a", [(i - 2.5) * 0.25, 0.75, -0.65], [0.22, 0.9, 0.22], [-0.7, 0, 0], { emissive: "#ff5a00", ei: 1.4 });
        U.mane.push(m);
      }
      U.arms = [];
      for (const sd of [-1, 1]) {
        const sh = K.node(body, [1.5 * sd, 2.7, 0.6]);
        K.part(sh, "caps", "#7a2a1a", [0.2 * sd, -0.7, 0.2], [0.42, 0.75, 0.42], [0.3, 0, 0.3 * sd]);
        K.part(sh, "sph", "#ffe0a0", [0.4 * sd, -1.55, 0.5], [0.4, 0.3, 0.4]);
        U.arms.push(sh);
      }
      U.feet = [K.part(root, "sph", "#5a1a10", [0.8, 0.35, 0.3], [0.7, 0.4, 0.95]), K.part(root, "sph", "#5a1a10", [-0.8, 0.35, 0.3], [0.7, 0.4, 0.95])];
      break;
    }
    default:
  }
  // dizzy stars
  U.dizzy = new THREE.Group();
  const st = G.get("bossDizzy", () => starShape(0.28, 0.12, 0.06, false));
  for (let i = 0; i < 4; i++) {
    const m = new THREE.Mesh(st, bank.color("#ffe14a", { emissive: "#a07000" }));
    U.dizzy.add(m);
  }
  U.dizzy.visible = false;
  root.add(U.dizzy);
  // telegraph rings (pooled)
  U.rings = [];
  const ringGeo = G.get("tgRing", () => new THREE.RingGeometry(0.82, 1, 40));
  const ringMat = bank.own(new THREE.MeshBasicMaterial({ color: "#ff2a1f", transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false }));
  U.ringMat = ringMat;
  for (let i = 0; i < 8; i++) {
    const m = new THREE.Mesh(ringGeo, ringMat);
    m.rotation.x = -Math.PI / 2;
    m.visible = false;
    ctx.root.add(m);
    U.rings.push(m);
  }
  U.tmpC = new THREE.Color();
  root.userData = U;
  return root;
}

export function animateBoss(root, B, W, t) {
  const U = root.userData;
  root.position.set(B.x, B.y, B.z);
  root.rotation.set(0, B.yaw, 0);
  const b = U.body;
  b.position.set(0, 0, 0);
  b.rotation.set(0, 0, 0);
  b.scale.set(1, 1, 1);
  root.scale.setScalar(1);
  root.visible = !B.hidden || B.state === "burrow";
  const a = B.anim;
  const ph = t * 6;
  // shared poses
  if (a === "walk" || a === "run") {
    const k = a === "run" ? 2.2 : 1;
    b.position.y = Math.abs(Math.sin(ph * k)) * 0.12;
    b.rotation.z = Math.sin(ph * k) * 0.05;
    if (a === "run") b.rotation.x = 0.25;
    if (U.feet) {
      U.feet[0].position.z = 0.2 + Math.sin(ph * k) * 0.5;
      U.feet[1].position.z = 0.2 - Math.sin(ph * k) * 0.5;
    }
  } else if (a === "windup") {
    b.position.x = Math.sin(t * 50) * 0.08;
    b.scale.set(1.06, 0.9, 1.06);
  } else if (a === "jump") {
    b.scale.set(0.92, 1.12, 0.92);
  } else if (a === "roar") {
    b.rotation.x = -0.2;
    b.position.y = Math.sin(t * 30) * 0.03;
  } else if (a === "hurt") {
    b.rotation.x = -0.35;
    b.scale.set(1.1, 0.88, 1.1);
  }
  const dazed = B.state === "dazed";
  if (dazed) {
    // slump: squash so the head is in reach, wobble
    const k = B.slumpH / B.fullH;
    b.scale.set(1.08, k, 1.08);
    b.rotation.z = Math.sin(t * 4) * 0.08;
  }
  U.dizzy.visible = dazed;
  if (dazed) {
    U.dizzy.position.y = B.h + 0.7;
    U.dizzy.children.forEach((m, i) => {
      const an = t * 3.5 + (i / 4) * Math.PI * 2;
      m.position.set(Math.cos(an) * 1.6, Math.sin(t * 6 + i) * 0.15, Math.sin(an) * 1.6);
      m.rotation.y = an;
    });
  }
  // kind-specific
  switch (B.kind) {
    case "tombScarab": {
      U.mound.visible = B.state === "burrow";
      b.visible = B.state !== "burrow";
      if (B.state === "burrow") {
        U.mound.scale.set(2.2 + Math.sin(t * 20) * 0.1, 0.8, 2.2);
      }
      if (a === "dig") b.position.y = -B.st * 1.5;
      if (dazed || a === "flipped") {
        b.rotation.z = Math.PI + Math.sin(t * 3) * 0.08;
        b.position.y = 2.6;
        U.legs.forEach((l, i) => (l.rotation.x = Math.sin(t * 14 + i) * 0.6));
      } else U.legs.forEach((l, i) => (l.rotation.x = a === "walk" ? Math.sin(ph * 1.5 + i * 1.3) * 0.4 : 0));
      break;
    }
    case "captainCrab": {
      U.legs.forEach((l, i) => (l.rotation.z = a === "walk" ? Math.sin(ph * 1.8 + i) * 0.3 : 0));
      const big = U.claws[1];
      if (a === "claw") {
        big.sh.rotation.x = B.st < 0.8 ? -1.2 * Math.min(1, B.st / 0.5) : 0.6;
      } else if (dazed) {
        big.sh.rotation.x = 0.7;
        big.claw.position.y = -0.3;
      } else {
        big.sh.rotation.x = Math.sin(t * 2) * 0.1;
        big.claw.position.y = 0;
      }
      U.claws[0].sh.rotation.x = a === "windup" ? -0.6 : Math.sin(t * 2 + 1) * 0.1;
      for (const c of U.claws) c.pin.rotation.z = Math.sin(t * 8) * 0.15;
      break;
    }
    case "frostYeti": {
      const sw = a === "walk" ? Math.sin(ph) * 0.5 : 0;
      U.arms[0].rotation.x = sw;
      U.arms[1].rotation.x = -sw;
      if (a === "throw") {
        U.arms[0].rotation.x = B.st < 0.5 ? -2.6 * (B.st / 0.5) : 0.8;
      }
      if (a === "jump" || a === "windup") {
        U.arms[0].rotation.x = U.arms[1].rotation.x = -2.6;
      }
      U.jaw.scale.y = a === "roar" || a === "throw" ? 0.25 : 0.12;
      break;
    }
    case "magmaKing": {
      const sw = a === "walk" ? Math.sin(ph) * 0.4 : 0;
      U.arms[0].rotation.x = sw;
      U.arms[1].rotation.x = -sw;
      if (a === "breath" || a === "roar") {
        U.head.rotation.x = -0.3;
        U.jaw.position.y = -0.85;
        if (Math.random() < 0.6) W.emit("bossEmber", { x: B.x + Math.sin(B.yaw) * 2.6, y: B.y + 3.3, z: B.z + Math.cos(B.yaw) * 2.6 });
      } else {
        U.head.rotation.x = 0;
        U.jaw.position.y = -0.6;
      }
      if (a === "jump" || a === "windup") U.arms[0].rotation.x = U.arms[1].rotation.x = -2.4;
      U.mane.forEach((m, i) => (m.scale.y = 0.9 + Math.sin(t * 12 + i) * 0.25));
      break;
    }
    case "kingTrooper": {
      if (a === "roar" || a === "windup") U.head.rotation.x = -0.15 + Math.sin(t * 30) * 0.03;
      else U.head.rotation.x = 0;
      break;
    }
    default:
  }
  // defeat: spin, shrink, rise
  if (B.state === "defeat") {
    const k = Math.min(1, B.st / 2.2);
    root.rotation.y = B.yaw + k * k * 18;
    root.scale.setScalar(1 - k * 0.85);
    root.position.y = B.y + k * 2;
  }
  // hit flash
  const flash = B.flash > 0 && Math.floor(t * 16) % 2 === 0;
  if (flash !== U.flashing) {
    U.flashing = flash;
    for (const m of U.K.mats) {
      if (flash) m.emissive.set("#ff2a2a");
      else m.emissive.copy(m.userData.baseEmissive);
    }
  }
  // telegraph rings
  U.rings.forEach((r, i) => {
    const m = B.marks[i];
    r.visible = !!m;
    if (!m) return;
    const g = W.terrain.height(m.x, m.z);
    r.position.set(m.x, (Number.isFinite(g) ? g : B.home[1]) + 0.06, m.z);
    const k = m.t / m.max;
    r.scale.setScalar(m.r * (1.15 - 0.15 * k));
  });
  U.ringMat.opacity = 0.45 + Math.sin(t * 18) * 0.25;
}
