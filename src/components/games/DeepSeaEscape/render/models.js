/**
 * Low-poly procedural models built from a shared kit of geometries (original
 * designs, no model files): the facility's mutants and machines (each with
 * named parts the renderer animates), the four weapon viewmodels, pickups and
 * props (lockers, crates, antenna dishes, specimen tanks, consoles). Materials
 * are shared per kind except each enemy's "skin", which it clones so it can
 * flash on hit. Every builder's front faces −z.
 */
import * as THREE from "three";

const lathe = (pts, seg = 18) => new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), seg);

export function createKit() {
  const g = {
    box: new THREE.BoxGeometry(1, 1, 1),
    sphere: new THREE.SphereGeometry(0.5, 16, 12),
    sphereLo: new THREE.SphereGeometry(0.5, 8, 6),
    cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 16),
    cylLo: new THREE.CylinderGeometry(0.5, 0.5, 1, 7),
    cone: new THREE.ConeGeometry(0.5, 1, 10),
    cone4: new THREE.ConeGeometry(0.5, 1, 4),
    torus: new THREE.TorusGeometry(0.5, 0.08, 8, 28),
    ring: new THREE.TorusGeometry(0.5, 0.035, 6, 32),
    plane: new THREE.PlaneGeometry(1, 1),
    octa: new THREE.OctahedronGeometry(0.5, 0),
    disc: new THREE.CylinderGeometry(0.5, 0.5, 1, 28),
    capsule: new THREE.CapsuleGeometry(0.5, 1, 4, 12),
    dish: lathe([[0, 0], [0.12, 0.01], [0.3, 0.06], [0.46, 0.16], [0.5, 0.2], [0.48, 0.21], [0.29, 0.08], [0, 0.03]], 24),
    bulb: lathe([[0, 0], [0.3, 0.05], [0.45, 0.3], [0.42, 0.62], [0.26, 0.86], [0.08, 0.98], [0, 1]], 16),
    tankGlass: new THREE.CylinderGeometry(0.5, 0.5, 1, 20, 1, true),
    knot: new THREE.TorusKnotGeometry(0.3, 0.08, 48, 8),
  };
  const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.2, ...o });
  const glow = (c, k = 1.6) => new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(k), toneMapped: false });
  const m = {
    steel: std(0x8a96a2, { metalness: 0.85, roughness: 0.35 }),
    steelDark: std(0x3a424a, { metalness: 0.8, roughness: 0.45 }),
    gunmetal: std(0x2a3036, { metalness: 0.7, roughness: 0.4 }),
    chrome: std(0xd8e0e8, { metalness: 1, roughness: 0.12 }),
    rubber: std(0x15181b, { roughness: 0.85, metalness: 0 }),
    yellow: std(0xe8b81a, { roughness: 0.45, metalness: 0.3 }),
    orange: std(0xe0601a, { roughness: 0.5, metalness: 0.2 }),
    white: std(0xe8ecef, { roughness: 0.55, metalness: 0.05 }),
    labcoat: std(0xd8dcd4, { roughness: 0.9 }),
    cloth: std(0x3a4a5a, { roughness: 0.9 }),
    red: std(0xc0302a, { roughness: 0.5 }),
    skin: std(0x9aa88a, { roughness: 0.6 }),
    flesh: std(0x8a3a4a, { roughness: 0.45, metalness: 0.05 }),
    fleshPale: std(0xc8a8a0, { roughness: 0.5 }),
    chitin: std(0x2a4a5a, { roughness: 0.3, metalness: 0.4 }),
    shellRed: std(0x8a2a24, { roughness: 0.35, metalness: 0.3 }),
    scales: std(0x1a3a44, { roughness: 0.3, metalness: 0.5, flatShading: true }),
    armorPlate: std(0x4a5258, { roughness: 0.35, metalness: 0.7, flatShading: true }),
    drone: std(0x2c343c, { roughness: 0.3, metalness: 0.8 }),
    suit: std(0xd86a1a, { roughness: 0.6, metalness: 0.1 }),
    glove: std(0x23282e, { roughness: 0.75, metalness: 0.1 }),
    wood: std(0x4a3a2a, { roughness: 0.8 }),
    glowCyan: glow(0x40e0ff, 1.8),
    glowGreen: glow(0x5aff9a, 1.6),
    glowViolet: glow(0xa06aff, 1.8),
    glowRed: glow(0xff3a20, 1.8),
    glowOrange: glow(0xff8a20, 1.8),
    glowYellow: glow(0xffd040, 1.7),
    glowWhite: glow(0xffffff, 1.4),
    glowBio: glow(0x3affc0, 1.6),
    shield: new THREE.MeshBasicMaterial({ color: 0x60d0ff, transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
    glass: new THREE.MeshStandardMaterial({ color: 0xbfefff, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide }),
    liquid: new THREE.MeshStandardMaterial({ color: 0x2ad0a0, roughness: 0.2, transparent: true, opacity: 0.45, depthWrite: false, emissive: 0x0a5040, emissiveIntensity: 0.6 }),
    dark: new THREE.MeshBasicMaterial({ color: 0x030507 }),
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

function mesh(geo, mat, sx, sy, sz, x = 0, y = 0, z = 0, parent) {
  const o = new THREE.Mesh(geo, mat);
  o.scale.set(sx, sy, sz);
  o.position.set(x, y, z);
  parent?.add(o);
  return o;
}
/** A limb pivoting at its top: returns the pivot group. */
function limb(kit, mat, len, thick, x, y, z, parent, end) {
  const pivot = new THREE.Group();
  pivot.position.set(x, y, z);
  mesh(kit.capsule, mat, thick, len / 2, thick, 0, -len / 2, 0, pivot);
  if (end) end(pivot, len);
  parent.add(pivot);
  return pivot;
}

const SKIN = {
  crawler: (k) => k.shellRed,
  researcher: (k) => k.skin,
  eel: (k) => k.scales,
  drone: (k) => k.drone,
  spitter: (k) => k.fleshPale,
  brute: (k) => k.armorPlate,
  stalker: (k) => k.scales,
  matriarch: (k) => k.shellRed,
  warden: (k) => k.drone,
  specimen: (k) => k.flesh,
  leviathan: (k) => k.chitin,
};

/** A crab-like body with six legs (crawler, and the Matriarch at scale `k`). */
function crab(kit, body, skin, P, k, eyesMat) {
  mesh(kit.sphere, skin, 0.9 * k, 0.42 * k, 0.8 * k, 0, 0.05 * k, 0, body);
  mesh(kit.sphere, kit.flesh, 0.6 * k, 0.2 * k, 0.55 * k, 0, -0.08 * k, 0, body);
  for (const s of [-1, 1]) {
    const stalk = mesh(kit.cylLo, skin, 0.05 * k, 0.22 * k, 0.05 * k, s * 0.14 * k, 0.24 * k, -0.3 * k, body);
    stalk.rotation.x = -0.4;
    mesh(kit.sphereLo, eyesMat, 0.09 * k, 0.09 * k, 0.09 * k, s * 0.14 * k, 0.36 * k, -0.36 * k, body);
  }
  P.legs = [];
  for (let i = 0; i < 6; i++) {
    const s = i % 2 ? 1 : -1;
    const zi = Math.floor(i / 2) - 1;
    const pv = new THREE.Group();
    pv.position.set(s * 0.36 * k, 0, zi * 0.24 * k);
    const up = mesh(kit.capsule, skin, 0.06 * k, 0.2 * k, 0.06 * k, s * 0.22 * k, 0.12 * k, 0, pv);
    up.rotation.z = s * 1.1;
    const lo = mesh(kit.capsule, skin, 0.05 * k, 0.24 * k, 0.05 * k, s * 0.48 * k, -0.12 * k, 0, pv);
    lo.rotation.z = -s * 0.4;
    body.add(pv);
    P.legs.push(pv);
  }
  // claws
  const claw = (s) => (pv, len) => {
    mesh(kit.sphere, skin, 0.22 * k, 0.16 * k, 0.32 * k, 0, -len - 0.05 * k, -0.08 * k, pv);
    const pin = mesh(kit.cone4, skin, 0.08 * k, 0.24 * k, 0.08 * k, s * 0.05 * k, -len - 0.05 * k, -0.3 * k, pv);
    pin.rotation.x = -Math.PI / 2;
  };
  P.armL = limb(kit, skin, 0.35 * k, 0.09 * k, -0.34 * k, 0.1 * k, -0.32 * k, body, claw(-1));
  P.armR = limb(kit, skin, 0.35 * k, 0.09 * k, 0.34 * k, 0.1 * k, -0.32 * k, body, claw(1));
  P.armL.rotation.x = P.armR.rotation.x = -1.2;
}

/** Build an enemy: { root, body, parts, skin, baseRx, baseY }. */
export function buildEnemy(kit, kind) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const skin = SKIN[kind](kit).clone();
  const P = {};
  let baseY = 0;
  const eyes = (parent, y, z, mat = kit.glowBio, w = 0.07, s = 0.05) => {
    mesh(kit.sphereLo, mat, s, s, s, -w, y, z, parent);
    mesh(kit.sphereLo, mat, s, s, s, w, y, z, parent);
  };
  switch (kind) {
    case "crawler": {
      baseY = 0.42;
      body.position.y = baseY;
      crab(kit, body, skin, P, 1, kit.glowYellow);
      break;
    }
    case "matriarch": {
      baseY = 1.0;
      body.position.y = baseY;
      crab(kit, body, skin, P, 2.4, kit.glowRed);
      // an egg sac glowing on her back
      P.sac = mesh(kit.sphere, kit.liquid, 1.1, 0.7, 1.0, 0, 0.55, 0.6, body);
      for (let i = 0; i < 5; i++) mesh(kit.sphereLo, kit.glowBio, 0.2, 0.2, 0.2, Math.cos(i * 1.3) * 0.3, 0.6, 0.6 + Math.sin(i * 1.3) * 0.3, body);
      const shield = new THREE.Mesh(kit.sphere, kit.shield);
      shield.scale.setScalar(4.2);
      body.add(shield);
      P.shield = shield;
      break;
    }
    case "researcher":
    case "spitter": {
      // an infected scientist: torn lab coat, swollen growths, glowing veins
      const fat = kind === "spitter";
      baseY = 0.98;
      body.position.y = baseY;
      mesh(kit.capsule, fat ? skin : kit.labcoat, fat ? 0.6 : 0.42, 0.32, fat ? 0.5 : 0.28, 0, 0.32, 0, body);
      if (!fat) {
        mesh(kit.box, kit.labcoat, 0.46, 0.5, 0.3, 0, -0.08, 0, body);
        mesh(kit.box, kit.cloth, 0.3, 0.2, 0.31, 0, 0.5, 0, body);
      }
      for (let i = 0; i < (fat ? 6 : 3); i++) mesh(kit.sphereLo, i % 2 ? kit.flesh : kit.glowBio, 0.16, 0.14, 0.12, (i % 3 - 1) * 0.16, 0.2 + (i * 0.11) % 0.4, -0.16 - (fat ? 0.1 : 0), body);
      if (fat) P.sac = mesh(kit.sphere, kit.liquid, 0.8, 0.5, 0.9, 0, 0.4, 0.05, body);
      const head = new THREE.Group();
      head.position.set(0, 0.82, 0);
      mesh(kit.sphere, skin, 0.28, 0.32, 0.28, 0, 0, 0, head);
      mesh(kit.sphereLo, kit.flesh, 0.2, 0.18, 0.16, 0.08, 0.08, 0.02, head);
      eyes(head, 0.02, -0.13, kit.glowBio, 0.07, 0.05);
      mesh(kit.box, kit.dark, 0.14, 0.04, 0.04, 0, -0.08, -0.13, head);
      body.add(head);
      P.head = head;
      P.legL = limb(kit, kit.cloth, 0.95, 0.13, -0.12, -0.25, 0, body);
      P.legR = limb(kit, kit.cloth, 0.95, 0.13, 0.12, -0.25, 0, body);
      P.armL = limb(kit, fat ? skin : kit.labcoat, 0.66, 0.11, -0.3, 0.58, 0, body, (pv, len) => mesh(kit.sphereLo, skin, 0.12, 0.14, 0.12, 0, -len, 0, pv));
      P.armR = limb(kit, fat ? skin : kit.labcoat, 0.66, 0.11, 0.3, 0.58, 0, body, (pv, len) => {
        mesh(kit.sphereLo, skin, 0.12, 0.14, 0.12, 0, -len, 0, pv);
        if (!fat) for (let i = 0; i < 3; i++) mesh(kit.cone4, kit.flesh, 0.04, 0.18, 0.04, (i - 1) * 0.04, -len - 0.12, -0.03, pv);
      });
      if (fat) P.fire = true;
      break;
    }
    case "eel":
    case "leviathan": {
      // a segmented abyssal serpent: armoured head with a lantern lure, glowing gill slits
      const big = kind === "leviathan";
      const k = big ? 3.4 : 1;
      baseY = big ? 1.6 : 0.3;
      body.position.y = baseY;
      const head = new THREE.Group();
      mesh(kit.sphere, skin, 0.42 * k, 0.32 * k, 0.6 * k, 0, 0, 0, head);
      const jaw = mesh(kit.sphere, kit.flesh, 0.34 * k, 0.12 * k, 0.5 * k, 0, -0.12 * k, -0.06 * k, head);
      for (let i = 0; i < 6; i++) mesh(kit.cone4, kit.white, 0.03 * k, 0.1 * k, 0.03 * k, (i - 2.5) * 0.05 * k, -0.07 * k, -0.26 * k, head).rotation.x = Math.PI;
      eyes(head, 0.08 * k, -0.2 * k, big ? kit.glowRed : kit.glowCyan, 0.14 * k, 0.07 * k);
      const lureStem = mesh(kit.cylLo, skin, 0.02 * k, 0.4 * k, 0.02 * k, 0, 0.3 * k, -0.18 * k, head);
      lureStem.rotation.x = 0.7;
      P.core = mesh(kit.sphereLo, kit.glowBio, 0.1 * k, 0.1 * k, 0.1 * k, 0, 0.45 * k, -0.36 * k, head);
      body.add(head);
      P.head = head;
      P.jaw = jaw;
      P.tail = [];
      let prev = body;
      for (let i = 0; i < (big ? 6 : 7); i++) {
        const seg = new THREE.Group();
        seg.position.set(0, 0, (i ? 0.36 : 0.4) * k);
        const s = 1 - i * 0.1;
        mesh(kit.sphere, skin, 0.36 * k * s, 0.3 * k * s, 0.48 * k, 0, 0, 0.1 * k, seg);
        mesh(kit.box, kit.glowBio, 0.02 * k, 0.04 * k, 0.1 * k, 0.17 * k * s, 0, 0.1 * k, seg);
        mesh(kit.box, kit.glowBio, 0.02 * k, 0.04 * k, 0.1 * k, -0.17 * k * s, 0, 0.1 * k, seg);
        mesh(kit.cone4, skin, 0.08 * k * s, 0.2 * k * s, 0.08 * k, 0, 0.16 * k * s, 0.1 * k, seg);
        prev.add(seg);
        P.tail.push(seg);
        prev = seg;
      }
      if (big) {
        // the Leviathan rears up with tentacle arms
        body.rotation.x = -0.25;
        P.armL = limb(kit, skin, 2.2, 0.3, -1.3, 0.2, -0.2, body, (pv, len) => mesh(kit.cone, kit.flesh, 0.3, 0.7, 0.3, 0, -len - 0.2, 0, pv));
        P.armR = limb(kit, skin, 2.2, 0.3, 1.3, 0.2, -0.2, body, (pv, len) => mesh(kit.cone, kit.flesh, 0.3, 0.7, 0.3, 0, -len - 0.2, 0, pv));
        const shield = new THREE.Mesh(kit.sphere, kit.shield);
        shield.scale.setScalar(5);
        body.add(shield);
        P.shield = shield;
      }
      break;
    }
    case "drone":
    case "warden": {
      // a security drone: armoured sphere, a red lens, twin ducted thrusters
      const big = kind === "warden";
      const k = big ? 2.4 : 1;
      baseY = 0.3 * k;
      body.position.y = baseY;
      mesh(kit.sphere, skin, 0.56 * k, 0.5 * k, 0.56 * k, 0, 0, 0, body);
      mesh(kit.torus, kit.yellow, 0.62 * k, 0.62 * k, 0.62 * k, 0, 0, 0, body).rotation.x = Math.PI / 2;
      mesh(kit.cyl, kit.gunmetal, 0.28 * k, 0.1 * k, 0.28 * k, 0, 0, -0.26 * k, body).rotation.x = Math.PI / 2;
      P.core = mesh(kit.sphereLo, kit.glowRed, 0.18 * k, 0.18 * k, 0.1 * k, 0, 0, -0.32 * k, body);
      P.rotors = [];
      for (const s of [-1, 1]) {
        const duct = new THREE.Group();
        duct.position.set(s * 0.44 * k, 0.05 * k, 0);
        mesh(kit.torus, kit.gunmetal, 0.32 * k, 0.32 * k, 0.6 * k, 0, 0, 0, duct).rotation.x = Math.PI / 2;
        const rot = new THREE.Group();
        mesh(kit.box, kit.steel, 0.3 * k, 0.01 * k, 0.05 * k, 0, 0, 0, rot);
        mesh(kit.box, kit.steel, 0.05 * k, 0.01 * k, 0.3 * k, 0, 0, 0, rot);
        duct.add(rot);
        mesh(kit.sphereLo, kit.glowCyan, 0.08 * k, 0.04 * k, 0.08 * k, 0, -0.06 * k, 0, duct);
        body.add(duct);
        P.rotors.push(rot);
      }
      if (big) {
        P.armL = limb(kit, kit.gunmetal, 0.6, 0.12, -0.9, -0.3, -0.2, body, (pv, len) => mesh(kit.cyl, kit.glowRed, 0.08, 0.2, 0.08, 0, -len - 0.1, 0, pv));
        P.armR = limb(kit, kit.gunmetal, 0.6, 0.12, 0.9, -0.3, -0.2, body, (pv, len) => mesh(kit.cyl, kit.glowRed, 0.08, 0.2, 0.08, 0, -len - 0.1, 0, pv));
        const shield = new THREE.Mesh(kit.sphere, kit.shield);
        shield.scale.setScalar(3.2);
        body.add(shield);
        P.shield = shield;
      }
      break;
    }
    case "brute":
    case "stalker":
    case "specimen": {
      // hulking mutants: armoured plates (brute), finned amphibian (stalker), tentacled horror (Specimen Zero)
      const k = kind === "specimen" ? 1.45 : kind === "stalker" ? 1.05 : 1;
      baseY = 1.05 * k;
      body.position.y = baseY;
      mesh(kit.capsule, skin, 0.8 * k, 0.4 * k, 0.6 * k, 0, 0.42 * k, 0, body);
      if (kind === "brute") {
        for (let i = 0; i < 4; i++) mesh(kit.box, kit.steelDark, 0.5 * k, 0.12 * k, 0.12 * k, 0, 0.2 + i * 0.18, -0.3 * k, body).rotation.z = (i % 2 ? 1 : -1) * 0.1;
        mesh(kit.box, kit.rubber, 0.9 * k, 0.16 * k, 0.66 * k, 0, 0.85 * k, 0, body);
      } else {
        for (let i = 0; i < 5; i++) mesh(kit.cone4, kit.glowBio, 0.06 * k, 0.4 * k, 0.12 * k, 0, 0.3 * k + i * 0.18 * k, 0.32 * k, body).rotation.x = 0.5;
      }
      mesh(kit.sphere, kit.flesh, 0.6 * k, 0.36 * k, 0.5 * k, 0, -0.05 * k, 0, body);
      const head = new THREE.Group();
      head.position.set(0, 1.0 * k, -0.08 * k);
      mesh(kit.sphere, skin, 0.42 * k, 0.36 * k, 0.46 * k, 0, 0, 0, head);
      if (kind === "brute") mesh(kit.box, kit.steelDark, 0.46 * k, 0.12 * k, 0.4 * k, 0, 0.1 * k, -0.04 * k, head);
      eyes(head, 0.02 * k, -0.22 * k, kind === "specimen" ? kit.glowRed : kind === "stalker" ? kit.glowCyan : kit.glowOrange, 0.1 * k, 0.07 * k);
      if (kind !== "brute") mesh(kit.sphere, kit.flesh, 0.3 * k, 0.12 * k, 0.3 * k, 0, -0.12 * k, -0.12 * k, head);
      body.add(head);
      P.head = head;
      P.legL = limb(kit, skin, 1.0 * k, 0.24 * k, -0.22 * k, -0.25 * k, 0, body);
      P.legR = limb(kit, skin, 1.0 * k, 0.24 * k, 0.22 * k, -0.25 * k, 0, body);
      const fist = (pv, len) => {
        mesh(kit.sphere, kind === "brute" ? kit.steelDark : skin, 0.3 * k, 0.3 * k, 0.3 * k, 0, -len - 0.05 * k, 0, pv);
        if (kind !== "brute") for (let i = 0; i < 3; i++) mesh(kit.cone4, kit.white, 0.05 * k, 0.24 * k, 0.05 * k, (i - 1) * 0.08 * k, -len - 0.22 * k, -0.06 * k, pv).rotation.x = Math.PI;
      };
      P.armL = limb(kit, skin, 1.0 * k, 0.22 * k, -0.55 * k, 0.72 * k, 0, body, fist);
      P.armR = limb(kit, skin, 1.0 * k, 0.22 * k, 0.55 * k, 0.72 * k, 0, body, fist);
      if (kind === "specimen") {
        P.tail = [];
        for (let i = 0; i < 4; i++) {
          const t = new THREE.Group();
          t.position.set((i - 1.5) * 0.3, 0.9, 0.3);
          mesh(kit.capsule, kit.flesh, 0.12, 0.6, 0.12, 0, 0.5, 0.3, t).rotation.x = 0.8;
          mesh(kit.sphereLo, kit.glowRed, 0.12, 0.12, 0.12, 0, 0.95, 0.75, t);
          body.add(t);
          P.tail.push(t);
        }
        const shield = new THREE.Mesh(kit.sphere, kit.shield);
        shield.scale.setScalar(4.4);
        shield.position.y = 0.3;
        body.add(shield);
        P.shield = shield;
      }
      if (kind === "stalker") P.fire = true;
      break;
    }
    default:
      mesh(kit.box, skin, 0.6, 1.6, 0.4, 0, 0.8, 0, body);
  }
  const baseRx = kind === "brute" || kind === "specimen" ? 0.1 : 0;
  body.rotation.x += baseRx;
  return { root, body, parts: P, skin, baseRx: body.rotation.x, baseY };
}

/* ------------------------------------------------------------------ weapons */
/**
 * First-person weapon models in the view camera's space (+x right, −z ahead).
 * Returns { group, muzzle, glow: meshes that light up when charged }.
 */
export function buildWeapon(kit, id) {
  const g = new THREE.Group();
  const muzzle = new THREE.Object3D();
  const glowMeshes = [];
  // a dive-suit glove and orange suit cuff
  const hand = (x, y, z, rx = 0) => {
    const h = mesh(kit.sphere, kit.glove, 0.08, 0.075, 0.1, x, y, z, g);
    h.rotation.x = rx;
    mesh(kit.cyl, kit.suit, 0.075, 0.18, 0.075, x, y - 0.03, z + 0.12, g).rotation.x = Math.PI / 2 - 0.3;
    mesh(kit.torus, kit.steelDark, 0.08, 0.08, 0.08, x, y - 0.02, z + 0.06, g).rotation.x = Math.PI / 2 - 0.3;
    return h;
  };
  switch (id) {
    case "pistol": {
      const p = new THREE.Group();
      mesh(kit.box, kit.gunmetal, 0.05, 0.06, 0.26, 0, 0.02, -0.1, p);
      mesh(kit.box, kit.steel, 0.052, 0.025, 0.24, 0, 0.06, -0.1, p);
      mesh(kit.cyl, kit.steelDark, 0.022, 0.06, 0.022, 0, 0.03, -0.25, p).rotation.x = Math.PI / 2;
      const grip = mesh(kit.box, kit.rubber, 0.045, 0.13, 0.06, 0, -0.07, 0.0, p);
      grip.rotation.x = 0.25;
      const dot = mesh(kit.box, kit.glowGreen, 0.008, 0.008, 0.008, 0, 0.08, -0.2, p);
      glowMeshes.push(dot);
      mesh(kit.box, kit.yellow, 0.054, 0.012, 0.05, 0, 0.0, -0.02, p);
      p.position.set(0, 0, -0.12);
      g.add(p);
      hand(0, -0.1, -0.1);
      muzzle.position.set(0, 0.03, -0.4);
      break;
    }
    case "harpoon": {
      const h = new THREE.Group();
      mesh(kit.cyl, kit.gunmetal, 0.07, 0.5, 0.07, 0, 0, -0.12, h).rotation.x = Math.PI / 2;
      mesh(kit.cyl, kit.yellow, 0.08, 0.12, 0.08, 0, 0, 0.06, h).rotation.x = Math.PI / 2;
      mesh(kit.box, kit.steelDark, 0.04, 0.04, 0.5, 0, 0.05, -0.15, h);
      // the loaded harpoon
      mesh(kit.cylLo, kit.chrome, 0.014, 0.5, 0.014, 0, 0.075, -0.26, h).rotation.x = Math.PI / 2;
      const tip = mesh(kit.cone4, kit.chrome, 0.04, 0.1, 0.04, 0, 0.075, -0.54, h);
      tip.rotation.x = -Math.PI / 2;
      for (const s of [-1, 1]) mesh(kit.box, kit.chrome, 0.006, 0.05, 0.03, s * 0.02, 0.075, -0.48, h).rotation.z = s * 0.5;
      const tank = mesh(kit.capsule, kit.steel, 0.05, 0.07, 0.05, 0, -0.07, -0.04, h);
      tank.rotation.x = Math.PI / 2;
      mesh(kit.box, kit.rubber, 0.05, 0.14, 0.07, 0, -0.1, 0.12, h).rotation.x = 0.3;
      const lamp = mesh(kit.sphereLo, kit.glowOrange, 0.025, 0.025, 0.025, 0.04, 0.02, -0.34, h);
      glowMeshes.push(lamp);
      h.position.set(0, 0, -0.1);
      g.add(h);
      hand(0, -0.12, 0.02);
      hand(-0.02, -0.08, -0.26);
      muzzle.position.set(0, 0.075, -0.68);
      break;
    }
    case "pulse": {
      const r = new THREE.Group();
      mesh(kit.box, kit.white, 0.08, 0.1, 0.46, 0, 0, -0.08, r);
      mesh(kit.box, kit.gunmetal, 0.085, 0.04, 0.48, 0, 0.06, -0.08, r);
      for (let i = 0; i < 4; i++) {
        const coil = mesh(kit.torus, kit.glowCyan, 0.07, 0.07, 0.07, 0, 0, -0.34 - i * 0.04, r);
        glowMeshes.push(coil);
      }
      mesh(kit.cyl, kit.gunmetal, 0.04, 0.2, 0.04, 0, 0, -0.42, r).rotation.x = Math.PI / 2;
      const cell = mesh(kit.box, kit.glowCyan, 0.03, 0.08, 0.1, 0.045, -0.02, -0.02, r);
      glowMeshes.push(cell);
      mesh(kit.box, kit.rubber, 0.05, 0.14, 0.06, 0, -0.1, 0.06, r).rotation.x = 0.3;
      mesh(kit.box, kit.gunmetal, 0.04, 0.05, 0.08, 0, 0.1, -0.05, r);
      r.position.set(0, 0, -0.1);
      g.add(r);
      hand(0, -0.13, -0.02);
      hand(-0.02, -0.08, -0.3);
      muzzle.position.set(0, 0.0, -0.66);
      break;
    }
    case "cannon": {
      const c = new THREE.Group();
      mesh(kit.cyl, kit.drone, 0.13, 0.5, 0.13, 0, 0, -0.1, c).rotation.x = Math.PI / 2;
      for (let i = 0; i < 3; i++) mesh(kit.torus, kit.orange, 0.15, 0.15, 0.15, 0, 0, -0.04 - i * 0.12, c);
      const coreG = mesh(kit.sphere, kit.glowViolet, 0.1, 0.1, 0.1, 0, 0.09, 0.02, c);
      glowMeshes.push(coreG);
      mesh(kit.cyl, kit.glass, 0.13, 0.12, 0.13, 0, 0.09, 0.02, c);
      for (const s of [-1, 1]) {
        const prong = mesh(kit.box, kit.chrome, 0.02, 0.03, 0.18, s * 0.06, 0, -0.42, c);
        prong.rotation.y = -s * 0.15;
      }
      const tipG = mesh(kit.sphereLo, kit.glowViolet, 0.05, 0.05, 0.05, 0, 0, -0.45, c);
      glowMeshes.push(tipG);
      mesh(kit.box, kit.rubber, 0.06, 0.15, 0.07, 0, -0.13, 0.08, c).rotation.x = 0.3;
      c.position.set(0, 0, -0.1);
      g.add(c);
      hand(0, -0.15, 0.0);
      hand(-0.03, -0.1, -0.3);
      muzzle.position.set(0, 0.0, -0.62);
      break;
    }
    default:
      break;
  }
  g.add(muzzle);
  return { group: g, muzzle, glow: glowMeshes };
}

/* ------------------------------------------------------------------ items */
export function buildItem(kit, id, def) {
  const g = new THREE.Group();
  const own = [];
  const col = new THREE.Color(def.color);
  const tint = new THREE.MeshStandardMaterial({ color: col, metalness: 0.5, roughness: 0.35, emissive: col.clone().multiplyScalar(0.2) });
  const glowM = new THREE.MeshBasicMaterial({ color: col.clone().multiplyScalar(1.6), toneMapped: false });
  own.push(tint, glowM);
  const add = (geo, mat, s, p, r) => {
    const o = new THREE.Mesh(geo, mat);
    o.scale.set(...s);
    o.position.set(...p);
    if (r) o.rotation.set(...r);
    g.add(o);
    return o;
  };
  if (def.kind === "relic") {
    const mat = new THREE.MeshStandardMaterial({ color: col, metalness: 0.6, roughness: 0.2, emissive: col.clone().multiplyScalar(0.45) });
    own.push(mat);
    switch (def.icon) {
      case "pearl":
        add(kit.sphere, mat, [0.32, 0.32, 0.32], [0, 0, 0]);
        add(kit.dish, kit.chrome, [0.5, 0.5, 0.5], [0, -0.16, 0]);
        break;
      case "crystal":
        add(kit.octa, mat, [0.26, 0.5, 0.26], [0, 0, 0]);
        add(kit.octa, mat, [0.14, 0.3, 0.14], [0.14, -0.08, 0.04], [0, 0, 0.5]);
        break;
      case "coral":
        for (let i = 0; i < 5; i++) add(kit.capsule, mat, [0.05, 0.16, 0.05], [Math.cos(i * 1.3) * 0.08, 0.05 + (i % 2) * 0.06, Math.sin(i * 1.3) * 0.08], [Math.sin(i) * 0.6, 0, Math.cos(i) * 0.6]);
        break;
      case "lens":
        add(kit.disc, mat, [0.36, 0.05, 0.36], [0, 0, 0], [Math.PI / 2, 0, 0]);
        add(kit.torus, kit.chrome, [0.38, 0.38, 0.38], [0, 0, 0]);
        break;
      case "weave":
        add(kit.knot, mat, [0.7, 0.7, 0.7], [0, 0, 0]);
        break;
      case "med":
        add(kit.box, kit.white, [0.32, 0.22, 0.12], [0, 0, 0]);
        add(kit.box, mat, [0.06, 0.16, 0.13], [0, 0, 0]);
        add(kit.box, mat, [0.16, 0.06, 0.13], [0, 0, 0]);
        break;
      case "chip":
        add(kit.box, kit.gunmetal, [0.3, 0.04, 0.3], [0, 0, 0]);
        add(kit.box, mat, [0.16, 0.06, 0.16], [0, 0.03, 0]);
        break;
      default:
        add(kit.octa, mat, [0.36, 0.2, 0.46], [0, 0, 0]);
    }
    add(kit.ring, glowM, [0.7, 0.7, 0.7], [0, 0, 0], [Math.PI / 2, 0, 0]);
  } else if (def.kind === "weapon") {
    const w = buildWeapon(kit, def.weapon);
    w.group.children.filter((c) => c.material === kit.glove || c.material === kit.suit || c.material === kit.steelDark).forEach((c) => (c.visible = false));
    w.group.scale.setScalar(1.5);
    w.group.rotation.y = Math.PI / 2;
    g.add(w.group);
  } else if (def.kind === "ammo") {
    add(kit.box, kit.gunmetal, [0.32, 0.2, 0.22], [0, 0, 0]);
    add(kit.box, tint, [0.33, 0.05, 0.23], [0, 0.04, 0]);
    add(kit.box, glowM, [0.06, 0.06, 0.24], [0.1, 0.05, 0]);
  } else if (def.kind === "heal") {
    add(kit.box, kit.white, [0.34, 0.24, 0.16], [0, 0, 0]);
    add(kit.box, kit.red, [0.08, 0.18, 0.17], [0, 0, 0]);
    add(kit.box, kit.red, [0.18, 0.08, 0.17], [0, 0, 0]);
  } else if (def.kind === "armor") {
    add(kit.box, tint, [0.34, 0.4, 0.06], [0, 0, 0], [0.2, 0, 0]);
    add(kit.box, kit.gunmetal, [0.36, 0.06, 0.08], [0, 0.14, 0], [0.2, 0, 0]);
  } else if (def.kind === "o2") {
    add(kit.capsule, kit.white, [0.12, 0.2, 0.12], [0, 0, 0]);
    add(kit.cyl, tint, [0.125, 0.06, 0.125], [0, 0.05, 0]);
    add(kit.cyl, kit.steel, [0.05, 0.08, 0.05], [0, 0.27, 0]);
  } else if (def.kind === "note") {
    add(kit.box, kit.gunmetal, [0.26, 0.02, 0.34], [0, 0, 0], [0.4, 0, 0]);
    add(kit.box, glowM, [0.22, 0.021, 0.28], [0, 0.005, 0], [0.4, 0, 0]);
  } else {
    // keys and parts
    switch (id) {
      case "blueCard":
      case "redCard":
      case "blackCard":
        add(kit.box, tint, [0.3, 0.19, 0.015], [0, 0, 0]);
        add(kit.box, kit.chrome, [0.06, 0.05, 0.017], [-0.08, 0.02, 0]);
        add(kit.box, kit.gunmetal, [0.3, 0.03, 0.017], [0, -0.05, 0]);
        break;
      case "fuse":
        add(kit.cyl, kit.white, [0.1, 0.24, 0.1], [0, 0, 0], [0, 0, Math.PI / 2]);
        for (const s of [-1, 1]) add(kit.cyl, kit.chrome, [0.11, 0.05, 0.11], [s * 0.13, 0, 0], [0, 0, Math.PI / 2]);
        add(kit.ring, glowM, [0.12, 0.12, 0.12], [0, 0, 0], [0, Math.PI / 2, 0]);
        break;
      case "battery":
        add(kit.box, kit.gunmetal, [0.18, 0.28, 0.12], [0, 0, 0]);
        add(kit.box, glowM, [0.12, 0.18, 0.125], [0, -0.02, 0]);
        add(kit.box, kit.chrome, [0.06, 0.04, 0.06], [0, 0.16, 0]);
        break;
      case "filter":
        add(kit.cyl, kit.white, [0.18, 0.22, 0.18], [0, 0, 0]);
        add(kit.cyl, tint, [0.19, 0.04, 0.19], [0, 0.06, 0]);
        add(kit.cyl, tint, [0.19, 0.04, 0.19], [0, -0.06, 0]);
        break;
      case "valve":
        add(kit.torus, tint, [0.36, 0.36, 0.6], [0, 0, 0], [Math.PI / 2, 0, 0]);
        add(kit.box, tint, [0.34, 0.03, 0.03], [0, 0, 0]);
        add(kit.box, tint, [0.03, 0.03, 0.34], [0, 0, 0]);
        break;
      case "part":
        add(kit.box, kit.steel, [0.22, 0.16, 0.22], [0, 0, 0]);
        add(kit.torus, tint, [0.3, 0.3, 0.6], [0, 0.1, 0], [Math.PI / 2, 0, 0]);
        add(kit.cyl, glowM, [0.06, 0.2, 0.06], [0, 0, 0]);
        break;
      case "sample":
        add(kit.cyl, kit.glass, [0.08, 0.26, 0.08], [0, 0, 0]);
        add(kit.cyl, glowM, [0.06, 0.18, 0.06], [0, -0.03, 0]);
        add(kit.cyl, kit.chrome, [0.09, 0.04, 0.09], [0, 0.14, 0]);
        break;
      case "reflector":
        add(kit.octa, kit.chrome, [0.24, 0.3, 0.12], [0, 0, 0]);
        add(kit.ring, glowM, [0.3, 0.3, 0.3], [0, 0, 0]);
        break;
      default:
        add(kit.box, tint, [0.2, 0.2, 0.2], [0, 0, 0]);
    }
  }
  return { group: g, own };
}

/* ------------------------------------------------------------------ props */
/** Antenna dish on a pedestal; the returned `head` turns. */
export function buildDish(kit) {
  const g = new THREE.Group();
  mesh(kit.cyl, kit.steelDark, 0.7, 0.3, 0.7, 0, 0.15, 0, g);
  mesh(kit.cyl, kit.steel, 0.16, 1.2, 0.16, 0, 0.9, 0, g);
  const head = new THREE.Group();
  head.position.y = 1.55;
  const dish = mesh(kit.dish, kit.white, 1.5, 1.5, 1.5, 0, 0, -0.1, head);
  dish.rotation.x = -Math.PI / 2 + 0.25;
  mesh(kit.cylLo, kit.steel, 0.03, 0.7, 0.03, 0, 0.05, -0.4, head).rotation.x = Math.PI / 2 - 0.2;
  const tip = mesh(kit.sphereLo, kit.glowRed, 0.08, 0.08, 0.08, 0, 0.12, -0.75, head);
  g.add(head);
  return { group: g, head, tip };
}

/** Specimen tank: a glass cylinder of glowing fluid with a silhouette inside. */
export function buildTank(kit, liquid, seed = 1) {
  const g = new THREE.Group();
  mesh(kit.cyl, kit.steelDark, 1.5, 0.35, 1.5, 0, 0.17, 0, g);
  mesh(kit.cyl, kit.steelDark, 1.5, 0.3, 1.5, 0, 3.55, 0, g);
  mesh(kit.cyl, liquid, 1.3, 2.9, 1.3, 0, 1.8, 0, g);
  mesh(kit.tankGlass, kit.glass, 1.4, 3.1, 1.4, 0, 1.8, 0, g);
  // something curled up inside
  const s = new THREE.Group();
  mesh(kit.capsule, kit.flesh, 0.35, 0.4, 0.3, 0, 1.7, 0, s);
  mesh(kit.sphere, kit.flesh, 0.3, 0.3, 0.3, 0.05, 2.25, -0.05, s);
  mesh(kit.sphereLo, kit.glowBio, 0.06, 0.06, 0.06, 0.08, 2.28, -0.18, s);
  s.rotation.z = (seed % 3) * 0.2 - 0.2;
  g.add(s);
  for (let i = 0; i < 4; i++) mesh(kit.cylLo, kit.steel, 0.06, 3.1, 0.06, Math.cos(i * 1.57) * 0.72, 1.8, Math.sin(i * 1.57) * 0.72, g);
  g.userData.inner = s;
  return g;
}

/** Lockers, crates, cabinets, safes, vaults and specimen cases; `lid` opens. */
export function buildContainer(kit, kind, crateMat) {
  const g = new THREE.Group();
  const lid = new THREE.Group();
  g.userData.lid = lid;
  switch (kind) {
    case "crate":
      mesh(kit.box, crateMat || kit.steel, 1.1, 0.75, 0.8, 0, 0.375, 0, g);
      lid.position.set(0, 0.75, 0.4);
      mesh(kit.box, crateMat || kit.steel, 1.12, 0.1, 0.82, 0, 0.05, -0.4, lid);
      break;
    case "cabinet":
      mesh(kit.box, kit.white, 0.9, 1.6, 0.5, 0, 0.8, 0.05, g);
      mesh(kit.box, kit.red, 0.2, 0.06, 0.02, 0, 1.3, -0.21, g);
      mesh(kit.box, kit.red, 0.06, 0.2, 0.02, 0, 1.3, -0.21, g);
      lid.position.set(-0.45, 0.8, -0.2);
      mesh(kit.box, kit.glass, 0.88, 1.5, 0.03, 0.44, 0, 0, lid);
      for (let i = 0; i < 3; i++) mesh(kit.box, kit.steel, 0.8, 0.03, 0.4, 0, 0.4 + i * 0.45, 0.05, g);
      break;
    case "safe":
    case "vault":
      mesh(kit.box, kit.gunmetal, 1.0, kind === "vault" ? 1.6 : 1.0, 0.8, 0, kind === "vault" ? 0.8 : 0.5, 0, g);
      lid.position.set(-0.48, kind === "vault" ? 0.8 : 0.5, -0.41);
      mesh(kit.box, kit.steelDark, 0.9, kind === "vault" ? 1.45 : 0.85, 0.05, 0.47, 0, 0, lid);
      mesh(kit.torus, kit.chrome, 0.3, 0.3, 0.3, 0.47, 0, -0.04, lid);
      break;
    case "case":
      mesh(kit.box, kit.steelDark, 0.9, 0.7, 0.7, 0, 0.35, 0, g);
      mesh(kit.box, kit.glowViolet, 0.92, 0.04, 0.72, 0, 0.55, 0, g);
      lid.position.set(0, 0.7, 0.35);
      mesh(kit.box, kit.glass, 0.9, 0.5, 0.7, 0, 0.25, -0.35, lid);
      break;
    default:
      // tall storage locker
      mesh(kit.box, kit.steel, 0.9, 1.9, 0.6, 0, 0.95, 0.05, g);
      for (let i = 0; i < 3; i++) mesh(kit.box, kit.steelDark, 0.5, 0.03, 0.02, -0.1, 1.6 + i * 0.06, -0.26, g);
      lid.position.set(-0.44, 0.95, -0.25);
      mesh(kit.box, kit.steel, 0.86, 1.82, 0.04, 0.43, 0, 0, lid);
      for (let i = 0; i < 4; i++) mesh(kit.box, kit.steelDark, 0.5, 0.03, 0.02, 0.38, 0.6 + i * 0.06, -0.03, lid);
  }
  g.add(lid);
  return g;
}
export function openContainer(g, kind, k) {
  const lid = g.userData.lid;
  if (kind === "crate" || kind === "case") lid.rotation.x = -k * 1.6;
  else lid.rotation.y = k * 1.9;
}

/** Control console: angled desk with a screen material slot. */
export function buildConsole(kit, screenMat) {
  const g = new THREE.Group();
  mesh(kit.box, kit.steelDark, 1.3, 0.9, 0.7, 0, 0.45, 0.05, g);
  const top = mesh(kit.box, kit.gunmetal, 1.3, 0.08, 0.6, 0, 0.95, -0.05, g);
  top.rotation.x = 0.35;
  const scr = mesh(kit.plane, screenMat, 1.0, 0.55, 1, 0, 1.4, 0.18, g);
  scr.rotation.x = -0.15;
  scr.rotation.y = Math.PI;
  mesh(kit.box, kit.gunmetal, 1.1, 0.65, 0.05, 0, 1.4, 0.22, g).rotation.x = -0.15;
  for (let i = 0; i < 5; i++) mesh(kit.box, i % 2 ? kit.glowGreen : kit.glowYellow, 0.05, 0.02, 0.05, -0.4 + i * 0.2, 1.0, -0.15, g);
  return g;
}
