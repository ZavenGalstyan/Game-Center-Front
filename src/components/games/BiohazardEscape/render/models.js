/**
 * Low-poly procedural models built from a shared kit of geometries: the
 * mutants (each kind an original silhouette with named limbs the renderer
 * animates), the four weapon viewmodels and the pickups. Materials are shared
 * per kind except the skin, which each enemy clones so it can flash on hit.
 */
import * as THREE from "three";

export function createKit() {
  const g = {
    box: new THREE.BoxGeometry(1, 1, 1),
    sphere: new THREE.SphereGeometry(0.5, 14, 10),
    sphereLo: new THREE.SphereGeometry(0.5, 8, 6),
    cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 12),
    cylLo: new THREE.CylinderGeometry(0.5, 0.5, 1, 7),
    cone: new THREE.ConeGeometry(0.5, 1, 8),
    capsule: new THREE.CapsuleGeometry(0.5, 1, 4, 10),
    torus: new THREE.TorusGeometry(0.5, 0.08, 8, 24),
    plane: new THREE.PlaneGeometry(1, 1),
    octa: new THREE.OctahedronGeometry(0.5, 0),
  };
  const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.1, ...o });
  const m = {
    metal: std(0x7a8290, { metalness: 0.75, roughness: 0.38 }),
    darkMetal: std(0x2a2e34, { metalness: 0.7, roughness: 0.45 }),
    gunMetal: std(0x22252a, { metalness: 0.8, roughness: 0.35 }),
    polymer: std(0x1c1e22, { roughness: 0.8 }),
    rubber: std(0x111214, { roughness: 0.95 }),
    white: std(0xd8dde2, { roughness: 0.6 }),
    plastic: std(0xb8c0c8, { roughness: 0.5 }),
    wood: std(0x5a3e2a, { roughness: 0.8 }),
    red: std(0xc8261c, { roughness: 0.5 }),
    yellow: std(0xe8b020, { roughness: 0.5 }),
    coat: std(0xc8ccc4, { roughness: 0.9 }),
    coatDirty: std(0x8a8c7a, { roughness: 0.95 }),
    pants: std(0x2a3038, { roughness: 0.9 }),
    armor: std(0x2c3644, { metalness: 0.55, roughness: 0.5 }),
    armorLight: std(0x4a5868, { metalness: 0.5, roughness: 0.5 }),
    gown: std(0x2f6a5a, { roughness: 0.9 }),
    bone: std(0xe0d6bc, { roughness: 0.6 }),
    claw: std(0x2a2018, { roughness: 0.5 }),
    glowGreen: new THREE.MeshBasicMaterial({ color: new THREE.Color(0x7dff3a).multiplyScalar(1.6), toneMapped: false }),
    glowRed: new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff3020).multiplyScalar(1.8), toneMapped: false }),
    glowOrange: new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff8a20).multiplyScalar(1.6), toneMapped: false }),
    glowCyan: new THREE.MeshBasicMaterial({ color: new THREE.Color(0x3ae6ff).multiplyScalar(1.8), toneMapped: false }),
    glowViolet: new THREE.MeshBasicMaterial({ color: new THREE.Color(0xc070ff).multiplyScalar(1.6), toneMapped: false }),
    glowWhite: new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffffff).multiplyScalar(1.5), toneMapped: false }),
    sac: new THREE.MeshStandardMaterial({ color: 0xb8e040, emissive: 0x4a8a10, emissiveIntensity: 0.9, roughness: 0.3, transparent: true, opacity: 0.85 }),
    glass: new THREE.MeshStandardMaterial({ color: 0xbfe8ff, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.18, depthWrite: false }),
    shield: new THREE.MeshBasicMaterial({ color: 0x60c8ff, transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
    black: new THREE.MeshBasicMaterial({ color: 0x050505 }),
  };
  return {
    ...g,
    ...m,
    g,
    m,
    dispose() {
      Object.values(g).forEach((x) => x.dispose());
      Object.values(m).forEach((x) => x.dispose());
    },
  };
}

const SKIN = {
  worker: 0x9aa888,
  runner: 0xb06a5a,
  guard: 0x8a9a80,
  spitter: 0x9aa860,
  brute: 0x7a6a80,
  surgeon: 0xa8a090,
  hive: 0x6a5070,
  projectx: 0x50485a,
};

function mesh(geo, mat, sx, sy, sz, x = 0, y = 0, z = 0, parent) {
  const o = new THREE.Mesh(geo, mat);
  o.scale.set(sx, sy, sz);
  o.position.set(x, y, z);
  parent?.add(o);
  return o;
}
/** A limb that pivots at its top: returns the pivot group. */
function limb(kit, mat, len, thick, x, y, z, parent, end) {
  const pivot = new THREE.Group();
  pivot.position.set(x, y, z);
  mesh(kit.capsule, mat, thick, len / 2, thick, 0, -len / 2, 0, pivot);
  if (end) end(pivot, len);
  parent.add(pivot);
  return pivot;
}

/**
 * Enemy model. Returns { root, body, parts: {head, armL, armR, legL, legR, sac?, core?, shield?}, skin, h }.
 * The model faces −z (the sim's yaw convention).
 */
export function buildEnemy(kit, kind) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const skin = new THREE.MeshStandardMaterial({ color: SKIN[kind] || 0x999999, roughness: 0.75, emissive: 0x000000 });
  const P = {};
  const eyes = (head, mat, w = 0.09, y = 0.04, z = -0.2, s = 0.06) => {
    mesh(kit.sphereLo, mat, s, s, s, -w, y, z, head);
    mesh(kit.sphereLo, mat, s, s, s, w, y, z, head);
  };
  const pustules = (parent, n, spread, seed) => {
    for (let i = 0; i < n; i++) {
      const a = seed + i * 2.3;
      mesh(kit.sphereLo, kit.glowGreen, 0.07, 0.07, 0.07, Math.sin(a) * spread, Math.cos(a * 1.7) * spread, -Math.abs(Math.cos(a)) * spread * 0.6, parent);
    }
  };
  switch (kind) {
    case "runner": {
      body.position.y = 0.75;
      body.rotation.x = -0.9; // hunched forward
      mesh(kit.capsule, skin, 0.42, 0.42, 0.34, 0, 0.1, 0, body);
      for (let i = 0; i < 5; i++) mesh(kit.cone, kit.bone, 0.06, 0.18, 0.06, 0, 0.45 - i * 0.12, 0.17, body).rotation.x = 0.6;
      const head = new THREE.Group();
      head.position.set(0, 0.62, -0.08);
      mesh(kit.sphere, skin, 0.32, 0.28, 0.38, 0, 0, 0, head);
      mesh(kit.box, kit.black, 0.22, 0.08, 0.1, 0, -0.08, -0.17, head);
      eyes(head, kit.glowRed, 0.08, 0.03, -0.16, 0.05);
      body.add(head);
      P.head = head;
      const claws = (pv, len) => {
        for (let k = -1; k <= 1; k++) mesh(kit.cone, kit.claw, 0.04, 0.2, 0.04, k * 0.05, -len - 0.08, -0.04, pv).rotation.x = Math.PI;
      };
      P.armL = limb(kit, skin, 0.9, 0.12, -0.26, 0.35, 0, body, claws);
      P.armR = limb(kit, skin, 0.9, 0.12, 0.26, 0.35, 0, body, claws);
      P.legL = limb(kit, skin, 0.75, 0.14, -0.16, 0.75, 0.2, root);
      P.legR = limb(kit, skin, 0.75, 0.14, 0.16, 0.75, 0.2, root);
      break;
    }
    case "guard": {
      body.position.y = 1.0;
      mesh(kit.box, kit.armor, 0.62, 0.62, 0.38, 0, 0.32, 0, body);
      mesh(kit.box, kit.armorLight, 0.66, 0.2, 0.42, 0, 0.5, 0, body);
      mesh(kit.box, kit.pants, 0.52, 0.3, 0.32, 0, -0.08, 0, body);
      mesh(kit.box, kit.yellow, 0.64, 0.06, 0.4, 0, 0.12, 0, body);
      for (const s of [-1, 1]) mesh(kit.sphereLo, kit.armorLight, 0.3, 0.22, 0.3, s * 0.38, 0.6, 0, body);
      const head = new THREE.Group();
      head.position.set(0, 0.86, 0);
      mesh(kit.sphere, skin, 0.3, 0.32, 0.3, 0, 0, 0, head);
      mesh(kit.box, kit.armor, 0.36, 0.22, 0.36, 0, 0.08, 0, head);
      const visor = mesh(kit.box, kit.glowOrange, 0.3, 0.06, 0.04, 0, 0.02, -0.18, head);
      visor.rotation.z = 0.12;
      body.add(head);
      P.head = head;
      P.armL = limb(kit, kit.armor, 0.75, 0.15, -0.42, 0.52, 0, body, (pv, len) => mesh(kit.sphereLo, skin, 0.16, 0.16, 0.16, 0, -len, 0, pv));
      P.armR = limb(kit, kit.armor, 0.75, 0.15, 0.42, 0.52, 0, body, (pv, len) => mesh(kit.sphereLo, skin, 0.16, 0.16, 0.16, 0, -len, 0, pv));
      P.legL = limb(kit, kit.pants, 0.92, 0.18, -0.15, 0.95, 0, root, (pv, len) => mesh(kit.box, kit.rubber, 0.2, 0.12, 0.3, 0, -len, -0.05, pv));
      P.legR = limb(kit, kit.pants, 0.92, 0.18, 0.15, 0.95, 0, root, (pv, len) => mesh(kit.box, kit.rubber, 0.2, 0.12, 0.3, 0, -len, -0.05, pv));
      break;
    }
    case "spitter": {
      body.position.y = 0.55;
      const sac = mesh(kit.sphere, kit.sac, 0.95, 0.85, 0.9, 0, 0.35, -0.05, body);
      P.sac = sac;
      mesh(kit.sphere, skin, 0.7, 0.6, 0.55, 0, 0.75, 0.12, body);
      const head = new THREE.Group();
      head.position.set(0, 1.12, -0.05);
      mesh(kit.sphere, skin, 0.3, 0.26, 0.3, 0, 0, 0, head);
      mesh(kit.cylLo, kit.glowGreen, 0.14, 0.06, 0.14, 0, -0.04, -0.14, head).rotation.x = Math.PI / 2;
      eyes(head, kit.glowGreen, 0.08, 0.06, -0.12, 0.04);
      body.add(head);
      P.head = head;
      P.armL = limb(kit, skin, 0.55, 0.11, -0.42, 0.75, 0, body);
      P.armR = limb(kit, skin, 0.55, 0.11, 0.42, 0.75, 0, body);
      P.legL = limb(kit, skin, 0.5, 0.17, -0.2, 0.5, 0, root);
      P.legR = limb(kit, skin, 0.5, 0.17, 0.2, 0.5, 0, root);
      pustules(body, 6, 0.4, 2);
      break;
    }
    case "brute":
    case "surgeon":
    case "projectx": {
      const big = kind === "brute" ? 1.55 : kind === "surgeon" ? 1.6 : 1.7;
      body.position.y = 1.0 * big;
      body.rotation.x = kind === "brute" ? -0.35 : -0.12;
      const torsoMat = kind === "surgeon" ? kit.gown : skin;
      mesh(kit.capsule, torsoMat, 0.62 * big, 0.42 * big, 0.48 * big, 0, 0.3 * big, 0, body);
      if (kind !== "surgeon") for (let i = 0; i < 6; i++) mesh(kit.cone, kit.bone, 0.08 * big, 0.36 * big, 0.08 * big, (i % 2 ? 0.14 : -0.14) * big, (0.62 - i * 0.12) * big, 0.24 * big, body).rotation.x = -0.9;
      if (kind === "projectx") {
        P.core = mesh(kit.sphere, kit.glowViolet, 0.32 * big, 0.32 * big, 0.32 * big, 0, 0.36 * big, -0.24 * big, body);
        mesh(kit.torus, kit.bone, 0.5 * big, 0.5 * big, 0.5 * big, 0, 0.36 * big, -0.22 * big, body);
      }
      if (kind === "surgeon") {
        mesh(kit.box, kit.white, 0.5 * big, 0.06 * big, 0.04 * big, 0, 0.5 * big, -0.24 * big, body);
        pustules(body, 5, 0.32 * big, 5);
      }
      const head = new THREE.Group();
      head.position.set(0, 0.88 * big, -0.12 * big);
      mesh(kit.sphere, skin, 0.36 * big, 0.34 * big, 0.38 * big, 0, 0, 0, head);
      if (kind === "surgeon") mesh(kit.box, kit.white, 0.3 * big, 0.16 * big, 0.06 * big, 0, -0.06 * big, -0.18 * big, head);
      else mesh(kit.box, kit.black, 0.24 * big, 0.08 * big, 0.08 * big, 0, -0.1 * big, -0.17 * big, head);
      eyes(head, kind === "projectx" ? kit.glowViolet : kit.glowRed, 0.09 * big, 0.04 * big, -0.17 * big, 0.06 * big);
      body.add(head);
      P.head = head;
      const armLen = (kind === "surgeon" ? 1.3 : 1.15) * big;
      const armT = (kind === "brute" ? 0.32 : 0.2) * big;
      const hand = (pv, len) => {
        if (kind === "surgeon") {
          mesh(kit.box, kit.metal, 0.05 * big, 0.6 * big, 0.12 * big, 0, -len - 0.3 * big, 0, pv);
        } else {
          mesh(kit.sphere, skin, armT * 1.6, armT * 1.4, armT * 1.6, 0, -len, 0, pv);
          for (let k = -1; k <= 1; k++) mesh(kit.cone, kit.claw, 0.06 * big, 0.26 * big, 0.06 * big, k * 0.08 * big, -len - 0.2 * big, -0.06 * big, pv).rotation.x = Math.PI;
        }
      };
      P.armL = limb(kit, skin, armLen, armT, -0.48 * big, 0.6 * big, 0, body, hand);
      P.armR = limb(kit, skin, armLen, armT, 0.48 * big, 0.6 * big, 0, body, hand);
      if (kind === "surgeon") {
        P.armL2 = limb(kit, skin, armLen * 0.85, armT * 0.7, -0.36 * big, 0.25 * big, 0.08, body, hand);
        P.armR2 = limb(kit, skin, armLen * 0.85, armT * 0.7, 0.36 * big, 0.25 * big, 0.08, body, hand);
      }
      P.legL = limb(kit, kind === "surgeon" ? kit.gown : skin, 1.0 * big, 0.24 * big, -0.24 * big, 1.0 * big, 0, root);
      P.legR = limb(kit, kind === "surgeon" ? kit.gown : skin, 1.0 * big, 0.24 * big, 0.24 * big, 1.0 * big, 0, root);
      P.shield = mesh(kit.sphere, kit.shield, 2.6 * big, 2.6 * big, 2.6 * big, 0, 1.1 * big, 0, root);
      P.shield.visible = false;
      break;
    }
    case "hive": {
      body.position.y = 0.2;
      mesh(kit.sphere, skin, 2.6, 1.8, 2.4, 0, 0.9, 0.2, body);
      P.sac = mesh(kit.sphere, kit.sac, 1.6, 1.4, 1.5, 0, 1.6, 0.5, body);
      for (let i = 0; i < 7; i++) {
        const a = i * 0.9;
        mesh(kit.sphere, kit.sac, 0.6, 0.55, 0.6, Math.cos(a) * 1.2, 0.5 + (i % 3) * 0.4, Math.sin(a) * 1.0, body);
      }
      const head = new THREE.Group();
      head.position.set(0, 1.9, -0.9);
      mesh(kit.sphere, skin, 1.1, 0.9, 0.9, 0, 0, 0, head);
      mesh(kit.cylLo, kit.glowGreen, 0.55, 0.12, 0.55, 0, -0.1, -0.42, head).rotation.x = Math.PI / 2;
      for (let k = 0; k < 4; k++) mesh(kit.sphereLo, kit.glowRed, 0.1, 0.1, 0.1, -0.3 + k * 0.2, 0.22, -0.4, head);
      body.add(head);
      P.head = head;
      const tendril = (x, z) => limb(kit, skin, 1.8, 0.2, x, 1.4, z, body, (pv, len) => mesh(kit.cone, kit.claw, 0.12, 0.4, 0.12, 0, -len - 0.2, 0, pv).rotation.set(Math.PI, 0, 0));
      P.armL = tendril(-1.1, -0.6);
      P.armR = tendril(1.1, -0.6);
      P.armL2 = tendril(-1.3, 0.4);
      P.armR2 = tendril(1.3, 0.4);
      P.shield = mesh(kit.sphere, kit.shield, 5.2, 4.4, 5.2, 0, 1.5, 0, root);
      P.shield.visible = false;
      break;
    }
    default: {
      // infected worker
      body.position.y = 1.0;
      body.rotation.x = -0.15;
      mesh(kit.capsule, kit.coat, 0.5, 0.36, 0.32, 0, 0.32, 0, body);
      mesh(kit.box, kit.coatDirty, 0.52, 0.5, 0.33, 0, -0.08, 0, body);
      mesh(kit.box, kit.plastic, 0.1, 0.06, 0.02, 0.12, 0.42, -0.17, body);
      const head = new THREE.Group();
      head.position.set(0, 0.78, -0.04);
      mesh(kit.sphere, skin, 0.3, 0.34, 0.3, 0, 0, 0, head);
      mesh(kit.box, kit.black, 0.14, 0.05, 0.05, 0, -0.1, -0.14, head);
      eyes(head, kit.glowGreen, 0.07, 0.04, -0.13, 0.04);
      pustules(head, 3, 0.14, 1);
      head.rotation.z = 0.25;
      body.add(head);
      P.head = head;
      P.armL = limb(kit, kit.coat, 0.7, 0.11, -0.32, 0.5, 0, body, (pv, len) => mesh(kit.sphereLo, skin, 0.12, 0.12, 0.14, 0, -len, 0, pv));
      P.armR = limb(kit, kit.coat, 0.7, 0.11, 0.32, 0.5, 0, body, (pv, len) => mesh(kit.sphereLo, skin, 0.12, 0.12, 0.14, 0, -len, 0, pv));
      P.legL = limb(kit, kit.pants, 0.95, 0.13, -0.13, 0.95, 0, root);
      P.legR = limb(kit, kit.pants, 0.95, 0.13, 0.13, 0.95, 0, root);
      pustules(body, 4, 0.22, 3);
      break;
    }
  }
  root.traverse((o) => {
    if (o.isMesh) o.frustumCulled = true;
  });
  return { root, body, parts: P, skin, baseY: body.position.y, baseRx: body.rotation.x };
}

/* ------------------------------------------------------------------ weapons */
/** Viewmodel for the second (weapon) pass. Faces −z, sits at the lower right. */
export function buildWeapon(kit, id, { hands = true } = {}) {
  const g = new THREE.Group();
  const muzzle = new THREE.Object3D();
  const add = (geo, mat, sx, sy, sz, x, y, z, rx = 0) => {
    const o = mesh(geo, mat, sx, sy, sz, x, y, z, g);
    o.rotation.x = rx;
    return o;
  };
  const glow = [];
  if (id === "pistol") {
    add(kit.box, kit.gunMetal, 0.05, 0.06, 0.28, 0, 0.02, -0.08);
    add(kit.box, kit.metal, 0.052, 0.025, 0.26, 0, 0.06, -0.08);
    add(kit.box, kit.polymer, 0.045, 0.14, 0.07, 0, -0.07, 0.03, 0.25);
    add(kit.box, kit.polymer, 0.02, 0.03, 0.06, 0, -0.02, -0.02);
    glow.push(add(kit.box, kit.glowGreen, 0.006, 0.006, 0.004, -0.012, 0.075, 0.035));
    glow.push(add(kit.box, kit.glowGreen, 0.006, 0.006, 0.004, 0.012, 0.075, 0.035));
    add(kit.box, kit.darkMetal, 0.04, 0.012, 0.02, 0, 0.074, -0.2);
    muzzle.position.set(0, 0.03, -0.24);
  } else if (id === "rifle") {
    add(kit.box, kit.gunMetal, 0.07, 0.09, 0.46, 0, 0.02, -0.12);
    add(kit.cyl, kit.gunMetal, 0.028, 0.32, 0.028, 0, 0.03, -0.5, Math.PI / 2);
    add(kit.box, kit.polymer, 0.075, 0.07, 0.22, 0, 0.0, -0.3);
    add(kit.box, kit.gunMetal, 0.045, 0.16, 0.07, 0, -0.1, -0.12, -0.2);
    add(kit.box, kit.polymer, 0.05, 0.13, 0.06, 0, -0.08, 0.06, 0.3);
    add(kit.box, kit.polymer, 0.055, 0.07, 0.1, 0, 0.0, 0.14);
    add(kit.box, kit.darkMetal, 0.03, 0.05, 0.2, 0, 0.09, -0.12);
    glow.push(add(kit.box, kit.glowRed, 0.012, 0.012, 0.012, 0, 0.115, -0.05));
    muzzle.position.set(0, 0.03, -0.68);
  } else if (id === "shotgun") {
    add(kit.cyl, kit.gunMetal, 0.04, 0.62, 0.04, 0, 0.04, -0.3, Math.PI / 2);
    add(kit.cyl, kit.darkMetal, 0.034, 0.5, 0.034, 0, -0.01, -0.28, Math.PI / 2);
    add(kit.box, kit.wood, 0.07, 0.07, 0.16, 0, -0.01, -0.3);
    add(kit.box, kit.gunMetal, 0.07, 0.1, 0.18, 0, 0.02, 0.0);
    add(kit.box, kit.wood, 0.055, 0.11, 0.12, 0, -0.05, 0.12, 0.2);
    glow.push(add(kit.box, kit.glowOrange, 0.01, 0.01, 0.01, 0, 0.075, -0.58));
    muzzle.position.set(0, 0.04, -0.62);
  } else {
    add(kit.box, kit.white, 0.09, 0.1, 0.42, 0, 0.02, -0.12);
    add(kit.cyl, kit.darkMetal, 0.05, 0.36, 0.05, 0, 0.03, -0.46, Math.PI / 2);
    for (let i = 0; i < 4; i++) glow.push(add(kit.torus, kit.glowCyan, 0.13, 0.13, 0.13, 0, 0.03, -0.32 - i * 0.07));
    add(kit.box, kit.polymer, 0.05, 0.14, 0.07, 0, -0.09, -0.02, 0.25);
    glow.push(add(kit.box, kit.glowCyan, 0.03, 0.05, 0.18, 0.05, 0.03, -0.1));
    add(kit.box, kit.darkMetal, 0.07, 0.07, 0.1, 0, 0.0, 0.12);
    muzzle.position.set(0, 0.03, -0.66);
  }
  g.add(muzzle);
  if (hands) {
    const hand = mesh(kit.box, kit.polymer, 0.07, 0.09, 0.11, 0.0, -0.11, 0.04, g);
    hand.rotation.x = 0.25;
    if (id !== "pistol") mesh(kit.box, kit.polymer, 0.08, 0.06, 0.12, 0, -0.04, -0.3, g);
  }
  return { group: g, muzzle, glow };
}

/* ------------------------------------------------------------------ pickups */
export function buildItem(kit, id, def) {
  const g = new THREE.Group();
  const col = new THREE.Color(def.color);
  const tint = new THREE.MeshStandardMaterial({ color: col, roughness: 0.4, metalness: 0.2, emissive: col, emissiveIntensity: 0.35 });
  const own = [tint];
  const add = (geo, mat, sx, sy, sz, x = 0, y = 0, z = 0) => mesh(geo, mat, sx, sy, sz, x, y, z, g);
  switch (def.kind) {
    case "key":
      if (id.startsWith("card")) {
        add(kit.box, tint, 0.32, 0.02, 0.2);
        add(kit.box, kit.black, 0.08, 0.025, 0.06, -0.08, 0, 0.02);
      } else if (id === "fuse") {
        add(kit.cyl, kit.white, 0.12, 0.3, 0.12);
        add(kit.cyl, kit.metal, 0.13, 0.05, 0.13, 0, 0.16);
        add(kit.cyl, kit.metal, 0.13, 0.05, 0.13, 0, -0.16);
        add(kit.box, tint, 0.13, 0.06, 0.02, 0, 0, -0.06);
      } else if (id === "circuit") {
        add(kit.box, tint, 0.34, 0.02, 0.24);
        for (let i = 0; i < 4; i++) add(kit.box, kit.black, 0.05, 0.03, 0.05, -0.1 + i * 0.07, 0.02, 0);
      } else if (id === "sample") {
        add(kit.cyl, kit.glass, 0.1, 0.26, 0.1);
        add(kit.cyl, kit.glowGreen, 0.07, 0.2, 0.07);
        add(kit.cyl, kit.metal, 0.11, 0.04, 0.11, 0, 0.14);
      } else if (id === "prism") {
        add(kit.octa, tint, 0.3, 0.42, 0.3);
      }
      break;
    case "heal":
      add(kit.box, kit.white, 0.34, 0.2, 0.24);
      add(kit.box, kit.red, 0.2, 0.205, 0.06);
      add(kit.box, kit.red, 0.06, 0.205, 0.18);
      break;
    case "armor":
      add(kit.box, kit.armor, 0.36, 0.42, 0.08);
      add(kit.box, tint, 0.3, 0.06, 0.09, 0, 0.1);
      break;
    case "ammo":
      add(kit.box, kit.darkMetal, 0.32, 0.18, 0.2);
      add(kit.box, tint, 0.33, 0.05, 0.21, 0, 0.04);
      break;
    case "weapon": {
      const w = buildWeapon(kit, def.weapon, { hands: false });
      w.group.scale.setScalar(1.6);
      w.group.rotation.y = Math.PI / 2;
      g.add(w.group);
      break;
    }
    case "note":
      add(kit.box, kit.white, 0.24, 0.01, 0.32);
      break;
    default:
      add(kit.box, tint, 0.2, 0.2, 0.2);
  }
  return { group: g, own };
}
