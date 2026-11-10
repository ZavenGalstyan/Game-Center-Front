/**
 * Low-poly procedural models built from a shared kit of geometries (original
 * geometry, no model files): the tomb's guardians (each an original
 * silhouette with named limbs the renderer animates), the four weapon
 * viewmodels, pickups and the temple props (statues, containers, gold,
 * obelisks). Materials are shared per kind except each guardian's "skin",
 * which it clones so it can flash on hit. Every builder's front faces −z.
 */
import * as THREE from "three";
import { SVGLoader } from "three/examples/jsm/loaders/SVGLoader.js";
import { GLYPHS } from "../engine/glyphs.js";

const glyphGeoCache = new Map();
/** Extruded hieroglyph, ~1 m tall, centred. Cached for the page's lifetime. */
export function glyphGeometry(id, depth = 10) {
  const key = `${id}:${depth}`;
  if (glyphGeoCache.has(key)) return glyphGeoCache.get(key);
  let geo;
  try {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path fill-rule="evenodd" d="${GLYPHS[id].d}"/></svg>`;
    const data = new SVGLoader().parse(svg);
    const shapes = data.paths.flatMap((p) => SVGLoader.createShapes(p));
    geo = new THREE.ExtrudeGeometry(shapes, { depth, bevelEnabled: true, bevelThickness: 1.5, bevelSize: 1.2, bevelSegments: 1, curveSegments: 6 });
    geo.scale(0.01, -0.01, 0.01);
    geo.center();
    geo.computeVertexNormals();
  } catch {
    geo = new THREE.BoxGeometry(0.5, 0.8, 0.1);
  }
  glyphGeoCache.set(key, geo);
  return geo;
}

const lathe = (pts, seg = 18) => new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), seg);

export function createKit() {
  const g = {
    box: new THREE.BoxGeometry(1, 1, 1),
    sphere: new THREE.SphereGeometry(0.5, 14, 10),
    sphereLo: new THREE.SphereGeometry(0.5, 8, 6),
    cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 14),
    cylLo: new THREE.CylinderGeometry(0.5, 0.5, 1, 7),
    cone: new THREE.ConeGeometry(0.5, 1, 8),
    cone4: new THREE.ConeGeometry(0.5, 1, 4),
    torus: new THREE.TorusGeometry(0.5, 0.08, 8, 24),
    ring: new THREE.TorusGeometry(0.5, 0.035, 6, 32),
    plane: new THREE.PlaneGeometry(1, 1),
    octa: new THREE.OctahedronGeometry(0.5, 0),
    disc: new THREE.CylinderGeometry(0.5, 0.5, 1, 28),
    jar: lathe([[0, 0], [0.2, 0], [0.28, 0.12], [0.31, 0.4], [0.27, 0.66], [0.19, 0.76], [0.14, 0.8], [0, 0.8]]),
    urn: lathe([[0, 0], [0.22, 0], [0.34, 0.2], [0.38, 0.5], [0.3, 0.8], [0.22, 0.9], [0.25, 0.98], [0, 0.98]]),
    bowl: lathe([[0, 0], [0.12, 0.02], [0.34, 0.16], [0.44, 0.34], [0.46, 0.36], [0, 0.3]], 20),
    coin: new THREE.CylinderGeometry(0.075, 0.075, 0.018, 10),
    rock: new THREE.IcosahedronGeometry(0.5, 0),
    capsule: new THREE.CapsuleGeometry(0.5, 1, 4, 10),
  };
  const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.1, ...o });
  const glow = (c, k = 1.6) => new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(k), toneMapped: false });
  const m = {
    gold: std(0xe8b84a, { metalness: 1, roughness: 0.28 }),
    goldDark: std(0xa87a28, { metalness: 1, roughness: 0.4 }),
    bronze: std(0xb87a46, { metalness: 0.9, roughness: 0.35 }),
    mirror: std(0xf0d8a8, { metalness: 1, roughness: 0.06 }),
    stone: std(0xb89a70, { roughness: 0.9 }),
    stoneDark: std(0x3a3026, { roughness: 0.95 }),
    sandstone: std(0xc8a070, { roughness: 0.95, flatShading: true }),
    black: std(0x141210, { roughness: 0.6, metalness: 0.2 }),
    linen: std(0xe8e0c8, { roughness: 0.85 }),
    linenDirty: std(0xa89a78, { roughness: 0.95 }),
    skin: std(0xa8643a, { roughness: 0.7 }),
    bone: std(0xe0d6bc, { roughness: 0.6 }),
    lapis: std(0x23409a, { roughness: 0.35, metalness: 0.3 }),
    turquoise: std(0x2fb8a0, { roughness: 0.35, metalness: 0.2 }),
    wood: std(0x6b3f1f, { roughness: 0.8 }),
    clay: std(0xa0522d, { roughness: 0.9 }),
    alabaster: std(0xe6dcc4, { roughness: 0.5 }),
    reed: std(0xb08a4a, { roughness: 0.95 }),
    red: std(0xc0302a, { roughness: 0.5 }),
    papyrus: std(0xe8d8a8, { roughness: 0.9 }),
    shell: std(0x1f3a2a, { roughness: 0.25, metalness: 0.6 }),
    chitin: std(0x2a2418, { roughness: 0.4, metalness: 0.3 }),
    glowGold: glow(0xffc040, 1.8),
    glowGreen: glow(0x5aff9a, 1.6),
    glowCyan: glow(0x40e0ff, 1.8),
    glowViolet: glow(0x9a6aff, 1.8),
    glowRed: glow(0xff4020, 1.8),
    glowOrange: glow(0xff8a20, 1.8),
    glowWhite: glow(0xffffff, 1.4),
    shield: new THREE.MeshBasicMaterial({ color: 0xffc860, transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
    glass: new THREE.MeshStandardMaterial({ color: 0xffe0b0, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.25, depthWrite: false }),
    dark: new THREE.MeshBasicMaterial({ color: 0x050403 }),
  };
  // striped nemes cloth (gold / lapis)
  const c = document.createElement("canvas");
  c.width = 16;
  c.height = 64;
  const ctx = c.getContext("2d");
  for (let i = 0; i < 8; i++) {
    ctx.fillStyle = i % 2 ? "#23409a" : "#e8b84a";
    ctx.fillRect(0, i * 8, 16, 8);
  }
  const stripeTex = new THREE.CanvasTexture(c);
  stripeTex.colorSpace = THREE.SRGBColorSpace;
  m.stripes = std(0xffffff, { map: stripeTex, roughness: 0.5, metalness: 0.4 });
  return {
    ...g,
    ...m,
    g,
    m,
    dispose() {
      Object.values(g).forEach((x) => x.dispose());
      Object.values(m).forEach((x) => x.dispose());
      stripeTex.dispose();
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
  mesh(kit.box, mat, thick, len, thick, 0, -len / 2, 0, pivot);
  if (end) end(pivot, len);
  parent.add(pivot);
  return pivot;
}

const SKIN = {
  skeleton: (k) => k.bone,
  swarm: (k) => k.shell,
  stone: (k) => k.sandstone,
  royal: (k) => k.linenDirty,
  elite: (k) => k.black,
  anubis: (k) => k.black,
  colossus: (k) => k.sandstone,
  queen: (k) => k.chitin,
  pharaoh: (k) => k.linen,
};

/** Build a guardian: { root, body, parts, skin, baseRx, baseY }. */
export function buildEnemy(kit, kind) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const skin = SKIN[kind](kit).clone();
  const P = {};
  let baseY = 0;
  const eyes = (parent, y, z, mat = kit.glowCyan, w = 0.07, s = 0.05) => {
    mesh(kit.sphereLo, mat, s, s, s, -w, y, z, parent);
    mesh(kit.sphereLo, mat, s, s, s, w, y, z, parent);
  };
  switch (kind) {
    case "skeleton": {
      // thin bones, ribcage, linen kilt, glowing eye sockets, bronze khopesh
      baseY = 0.95;
      body.position.y = baseY;
      mesh(kit.box, skin, 0.08, 0.55, 0.08, 0, 0.35, 0, body); // spine
      for (let i = 0; i < 4; i++) mesh(kit.torus, skin, 0.42 - i * 0.04, 0.32, 0.42, 0, 0.28 + i * 0.1, 0, body).rotation.set(Math.PI / 2, 0, 0);
      mesh(kit.box, kit.linenDirty, 0.42, 0.3, 0.3, 0, -0.05, 0, body);
      mesh(kit.box, kit.gold, 0.44, 0.05, 0.32, 0, 0.08, 0, body);
      const head = new THREE.Group();
      head.position.set(0, 0.78, 0);
      mesh(kit.sphere, skin, 0.3, 0.32, 0.32, 0, 0, 0, head);
      mesh(kit.box, skin, 0.2, 0.1, 0.18, 0, -0.14, -0.06, head);
      eyes(head, 0.02, -0.14, kit.glowCyan, 0.07, 0.07);
      mesh(kit.box, kit.stripes, 0.36, 0.08, 0.34, 0, 0.13, 0.02, head);
      body.add(head);
      P.head = head;
      P.legL = limb(kit, skin, 0.9, 0.08, -0.12, -0.1, 0, body);
      P.legR = limb(kit, skin, 0.9, 0.08, 0.12, -0.1, 0, body);
      P.armL = limb(kit, skin, 0.62, 0.07, -0.26, 0.6, 0, body);
      P.armR = limb(kit, skin, 0.62, 0.07, 0.26, 0.6, 0, body, (pv, len) => {
        mesh(kit.box, kit.bronze, 0.04, 0.5, 0.06, 0, -len - 0.2, -0.05, pv);
        mesh(kit.box, kit.bronze, 0.04, 0.12, 0.2, 0, -len - 0.45, -0.12, pv);
      });
      break;
    }
    case "swarm": {
      // a living cloud of scarab beetles circling a dark core
      baseY = 0.5;
      body.position.y = baseY;
      const orbit = new THREE.Group();
      body.add(orbit);
      for (let i = 0; i < 16; i++) {
        const b = new THREE.Group();
        const a = (i / 16) * Math.PI * 2;
        const r = 0.18 + ((i * 37) % 10) / 30;
        b.position.set(Math.cos(a) * r, ((i * 13) % 7) / 14 - 0.2, Math.sin(a) * r);
        b.rotation.y = -a;
        mesh(kit.sphereLo, skin, 0.12, 0.07, 0.16, 0, 0, 0, b);
        mesh(kit.sphereLo, kit.gold, 0.05, 0.04, 0.05, 0, 0.01, -0.08, b);
        orbit.add(b);
      }
      mesh(kit.sphereLo, kit.glowGreen, 0.08, 0.08, 0.08, 0, 0, 0, body);
      P.orbit = orbit;
      break;
    }
    case "stone":
    case "colossus": {
      // a hewn sandstone golem; the Colossus is twice the size with a sun core
      const big = kind === "colossus";
      const k = big ? 1.6 : 1;
      baseY = 1.0 * k;
      body.position.y = baseY;
      mesh(kit.box, skin, 0.85 * k, 0.8 * k, 0.55 * k, 0, 0.45 * k, 0, body);
      mesh(kit.box, skin, 0.65 * k, 0.4 * k, 0.45 * k, 0, -0.05 * k, 0, body);
      mesh(kit.box, kit.gold, 0.9 * k, 0.08 * k, 0.6 * k, 0, 0.85 * k, 0, body);
      const core = mesh(kit.octa, big ? kit.glowOrange : kit.glowGold, 0.3 * k, 0.3 * k, 0.3 * k, 0, 0.45 * k, -0.28 * k, body);
      P.core = core;
      const head = new THREE.Group();
      head.position.set(0, 1.05 * k, 0);
      mesh(kit.box, skin, 0.42 * k, 0.4 * k, 0.4 * k, 0, 0, 0, head);
      mesh(kit.box, kit.stripes, 0.5 * k, 0.24 * k, 0.44 * k, 0, 0.14 * k, 0.03 * k, head);
      eyes(head, 0.02 * k, -0.2 * k, big ? kit.glowOrange : kit.glowGold, 0.1 * k, 0.07 * k);
      body.add(head);
      P.head = head;
      P.legL = limb(kit, skin, 1.0 * k, 0.28 * k, -0.22 * k, -0.2 * k, 0, body);
      P.legR = limb(kit, skin, 1.0 * k, 0.28 * k, 0.22 * k, -0.2 * k, 0, body);
      const fist = (pv, len) => mesh(kit.box, skin, 0.36 * k, 0.36 * k, 0.36 * k, 0, -len - 0.1 * k, 0, pv);
      P.armL = limb(kit, skin, 0.95 * k, 0.26 * k, -0.58 * k, 0.75 * k, 0, body, fist);
      P.armR = limb(kit, skin, 0.95 * k, 0.26 * k, 0.58 * k, 0.75 * k, 0, body, fist);
      if (big) {
        const shield = new THREE.Mesh(kit.sphere, kit.shield);
        shield.scale.setScalar(3.8);
        shield.position.y = 0.3;
        body.add(shield);
        P.shield = shield;
      }
      break;
    }
    case "royal": {
      // a mummified warrior in bronze scale armour with a striped headdress and spear
      baseY = 1.0;
      body.position.y = baseY;
      mesh(kit.box, skin, 0.46, 0.62, 0.3, 0, 0.35, 0, body);
      mesh(kit.box, kit.bronze, 0.5, 0.4, 0.34, 0, 0.42, 0, body);
      mesh(kit.box, kit.linen, 0.5, 0.36, 0.34, 0, -0.08, 0, body);
      mesh(kit.box, kit.gold, 0.52, 0.06, 0.36, 0, 0.12, 0, body);
      const head = new THREE.Group();
      head.position.set(0, 0.86, 0);
      mesh(kit.sphere, skin, 0.3, 0.34, 0.3, 0, 0, 0, head);
      mesh(kit.box, kit.stripes, 0.42, 0.26, 0.36, 0, 0.1, 0.04, head);
      for (const s of [-1, 1]) mesh(kit.box, kit.stripes, 0.1, 0.36, 0.08, s * 0.17, -0.16, -0.06, head);
      eyes(head, 0.0, -0.15, kit.glowOrange, 0.07, 0.05);
      body.add(head);
      P.head = head;
      P.legL = limb(kit, skin, 0.95, 0.13, -0.12, -0.2, 0, body);
      P.legR = limb(kit, skin, 0.95, 0.13, 0.12, -0.2, 0, body);
      P.armL = limb(kit, skin, 0.66, 0.11, -0.3, 0.62, 0, body, (pv, len) => mesh(kit.sphereLo, kit.glowOrange, 0.16, 0.16, 0.16, 0, -len - 0.05, -0.05, pv));
      P.armR = limb(kit, skin, 0.66, 0.11, 0.3, 0.62, 0, body, (pv, len) => {
        mesh(kit.cylLo, kit.wood, 0.04, 1.9, 0.04, 0, -len + 0.25, -0.08, pv);
        mesh(kit.cone4, kit.bronze, 0.08, 0.24, 0.08, 0, -len + 1.3, -0.08, pv);
      });
      P.fire = true;
      break;
    }
    case "elite":
    case "anubis": {
      // jackal-masked guard in golden armour; the Sentinel is a giant of the same breed
      const big = kind === "anubis";
      const k = big ? 1.45 : 1;
      baseY = 1.05 * k;
      body.position.y = baseY;
      mesh(kit.box, skin, 0.5 * k, 0.66 * k, 0.32 * k, 0, 0.36 * k, 0, body);
      mesh(kit.box, kit.gold, 0.56 * k, 0.24 * k, 0.36 * k, 0, 0.58 * k, 0, body);
      mesh(kit.torus, kit.gold, 0.5 * k, 0.5 * k, 0.6 * k, 0, 0.74 * k, 0, body).rotation.x = Math.PI / 2;
      mesh(kit.box, kit.linen, 0.52 * k, 0.38 * k, 0.34 * k, 0, -0.08 * k, 0, body);
      mesh(kit.box, kit.lapis, 0.16 * k, 0.4 * k, 0.02 * k, 0, -0.1 * k, -0.18 * k, body);
      const head = new THREE.Group();
      head.position.set(0, 0.95 * k, 0);
      mesh(kit.box, skin, 0.3 * k, 0.3 * k, 0.34 * k, 0, 0, 0, head);
      mesh(kit.box, skin, 0.14 * k, 0.12 * k, 0.36 * k, 0, -0.06 * k, -0.28 * k, head);
      for (const s of [-1, 1]) mesh(kit.cone4, skin, 0.09 * k, 0.32 * k, 0.07 * k, s * 0.1 * k, 0.28 * k, 0.04 * k, head);
      mesh(kit.box, kit.gold, 0.32 * k, 0.05 * k, 0.36 * k, 0, -0.12 * k, 0, head);
      eyes(head, 0.04 * k, -0.17 * k, big ? kit.glowRed : kit.glowCyan, 0.075 * k, 0.05 * k);
      body.add(head);
      P.head = head;
      P.legL = limb(kit, skin, 1.0 * k, 0.15 * k, -0.13 * k, -0.2 * k, 0, body);
      P.legR = limb(kit, skin, 1.0 * k, 0.15 * k, 0.13 * k, -0.2 * k, 0, body);
      P.armL = limb(kit, skin, 0.7 * k, 0.13 * k, -0.34 * k, 0.66 * k, 0, body, (pv, len) => {
        if (!big) mesh(kit.disc, kit.gold, 0.5, 0.05, 0.5, -0.05, -len + 0.1, -0.1, pv).rotation.set(0, 0, Math.PI / 2);
        else mesh(kit.sphereLo, kit.glowRed, 0.24, 0.24, 0.24, 0, -len - 0.05, -0.05, pv);
      });
      P.armR = limb(kit, skin, 0.7 * k, 0.13 * k, 0.34 * k, 0.66 * k, 0, body, (pv, len) => {
        if (big) {
          mesh(kit.cylLo, kit.gold, 0.06 * k, 2.6, 0.06 * k, 0, -len + 0.5, -0.1, pv);
          mesh(kit.box, kit.gold, 0.06, 0.12, 0.3, 0, -len + 1.8, -0.2, pv);
        } else {
          mesh(kit.box, kit.gold, 0.05, 0.55, 0.08, 0, -len - 0.22, -0.06, pv);
          mesh(kit.box, kit.gold, 0.05, 0.14, 0.24, 0, -len - 0.5, -0.15, pv);
        }
      });
      P.fire = true;
      if (big) {
        const shield = new THREE.Mesh(kit.sphere, kit.shield);
        shield.scale.setScalar(3.2);
        shield.position.y = 0.3;
        body.add(shield);
        P.shield = shield;
      }
      break;
    }
    case "queen": {
      // a giant scarab beetle: armoured wing cases, six legs, a glowing abdomen and a horn
      baseY = 0.95;
      body.position.y = baseY;
      const shellMat = skin;
      mesh(kit.sphere, shellMat, 1.6, 0.9, 2.1, -0.02, 0.1, 0.15, body);
      for (const s of [-1, 1]) {
        const w = mesh(kit.sphere, kit.shell, 0.82, 0.62, 2.0, s * 0.42, 0.28, 0.2, body);
        w.rotation.z = s * 0.15;
      }
      const sac = mesh(kit.sphere, kit.glowGreen, 0.8, 0.5, 0.9, 0, 0.0, 0.95, body);
      P.sac = sac;
      const head = new THREE.Group();
      head.position.set(0, 0.15, -1.05);
      mesh(kit.sphere, shellMat, 0.9, 0.55, 0.7, 0, 0, 0, head);
      mesh(kit.cone, kit.gold, 0.2, 0.7, 0.2, 0, 0.3, -0.3, head).rotation.x = -0.8;
      eyes(head, 0.08, -0.32, kit.glowRed, 0.26, 0.12);
      body.add(head);
      P.head = head;
      const legs = [];
      for (let i = 0; i < 3; i++)
        for (const s of [-1, 1]) {
          const lg = limb(kit, shellMat, 1.2, 0.1, s * 0.75, 0.0, -0.5 + i * 0.6, body);
          lg.rotation.z = s * 0.9;
          legs.push(lg);
        }
      P.legs = legs;
      const shield = new THREE.Mesh(kit.sphere, kit.shield);
      shield.scale.setScalar(3.6);
      body.add(shield);
      P.shield = shield;
      P.fire = true;
      break;
    }
    case "pharaoh": {
      // the Undying Pharaoh: a towering mummy king with a golden mask, nemes, crook and a burning heart
      const k = 1.5;
      baseY = 1.1 * k;
      body.position.y = baseY;
      mesh(kit.box, skin, 0.56 * k, 0.72 * k, 0.34 * k, 0, 0.36 * k, 0, body);
      mesh(kit.box, kit.gold, 0.6 * k, 0.2 * k, 0.38 * k, 0, 0.66 * k, 0, body);
      mesh(kit.torus, kit.lapis, 0.56 * k, 0.56 * k, 0.6 * k, 0, 0.78 * k, 0, body).rotation.x = Math.PI / 2;
      const robe = mesh(kit.cone, kit.linenDirty, 1.0 * k, 1.2 * k, 0.8 * k, 0, -0.4 * k, 0, body);
      robe.rotation.x = Math.PI;
      const core = mesh(kit.octa, kit.glowRed, 0.22 * k, 0.28 * k, 0.22 * k, 0, 0.45 * k, -0.2 * k, body);
      P.core = core;
      const head = new THREE.Group();
      head.position.set(0, 1.0 * k, 0);
      mesh(kit.box, kit.gold, 0.32 * k, 0.36 * k, 0.32 * k, 0, 0, 0, head);
      mesh(kit.box, kit.stripes, 0.52 * k, 0.32 * k, 0.42 * k, 0, 0.12 * k, 0.05 * k, head);
      for (const s of [-1, 1]) mesh(kit.box, kit.stripes, 0.14 * k, 0.44 * k, 0.1 * k, s * 0.2 * k, -0.18 * k, -0.06 * k, head);
      mesh(kit.box, kit.lapis, 0.06 * k, 0.2 * k, 0.06 * k, 0, -0.28 * k, -0.15 * k, head);
      mesh(kit.cone4, kit.gold, 0.06 * k, 0.16 * k, 0.06 * k, 0, 0.36 * k, -0.14 * k, head);
      eyes(head, 0.04 * k, -0.17 * k, kit.glowRed, 0.08 * k, 0.06 * k);
      body.add(head);
      P.head = head;
      P.legL = limb(kit, skin, 0.9 * k, 0.16 * k, -0.15 * k, -0.2 * k, 0, body);
      P.legR = limb(kit, skin, 0.9 * k, 0.16 * k, 0.15 * k, -0.2 * k, 0, body);
      P.armL = limb(kit, skin, 0.75 * k, 0.14 * k, -0.38 * k, 0.68 * k, 0, body, (pv, len) => mesh(kit.sphereLo, kit.glowRed, 0.3, 0.3, 0.3, 0, -len - 0.08, -0.05, pv));
      P.armR = limb(kit, skin, 0.75 * k, 0.14 * k, 0.38 * k, 0.68 * k, 0, body, (pv, len) => {
        mesh(kit.cylLo, kit.stripes, 0.06, 1.8, 0.06, 0, -len + 0.3, -0.1, pv);
        mesh(kit.torus, kit.gold, 0.22, 0.22, 0.22, 0.1, -len + 1.2, -0.1, pv);
      });
      const shield = new THREE.Mesh(kit.sphere, kit.shield);
      shield.scale.setScalar(3.6);
      shield.position.y = 0.4;
      body.add(shield);
      P.shield = shield;
      P.fire = true;
      break;
    }
    default:
      mesh(kit.box, skin, 0.6, 1.6, 0.4, 0, 0.8, 0, body);
  }
  // the heavy brutes lean forward a little
  const baseRx = kind === "stone" || kind === "colossus" ? 0.08 : 0;
  body.rotation.x = baseRx;
  return { root, body, parts: P, skin, baseRx, baseY };
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
  // a bandaged explorer's hand: a wrapped fist and a strip of forearm
  const hand = (x, y, z, rx = 0) => {
    const h = mesh(kit.sphere, kit.skin, 0.075, 0.07, 0.09, x, y, z, g);
    h.rotation.x = rx;
    mesh(kit.cyl, kit.linenDirty, 0.06, 0.16, 0.06, x, y - 0.03, z + 0.1, g).rotation.x = Math.PI / 2 - 0.3;
    return h;
  };
  switch (id) {
    case "bow": {
      // a recurve bow held upright-ish with an arrow on the string
      const bow = new THREE.Group();
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, -0.36, 0.02),
        new THREE.Vector3(0, -0.24, -0.06),
        new THREE.Vector3(0, -0.05, -0.08),
        new THREE.Vector3(0, 0.05, -0.08),
        new THREE.Vector3(0, 0.24, -0.06),
        new THREE.Vector3(0, 0.36, 0.02),
      ]);
      const limbGeo = new THREE.TubeGeometry(curve, 20, 0.012, 6);
      g.userData.ownGeo = [limbGeo];
      bow.add(new THREE.Mesh(limbGeo, kit.wood));
      mesh(kit.cyl, kit.gold, 0.03, 0.1, 0.03, 0, 0, -0.08, bow);
      const string = mesh(kit.cylLo, kit.linen, 0.003, 0.72, 0.003, 0, 0, 0.03, bow);
      void string;
      // arrow
      mesh(kit.cylLo, kit.reed, 0.008, 0.56, 0.008, 0, 0, -0.18, bow).rotation.x = Math.PI / 2;
      const tip = mesh(kit.cone4, kit.bronze, 0.024, 0.07, 0.024, 0, 0, -0.48, bow);
      tip.rotation.x = -Math.PI / 2;
      for (const s of [-1, 1]) mesh(kit.box, kit.red, 0.002, 0.03, 0.06, s * 0.008, 0.01, 0.06, bow);
      bow.rotation.z = -0.25;
      bow.position.set(0.02, 0.02, -0.05);
      g.add(bow);
      hand(0.02, -0.02, -0.12);
      hand(0.04, 0.0, 0.08);
      muzzle.position.set(0.0, 0.03, -0.55);
      break;
    }
    case "scarab": {
      // golden gauntlet with a jewelled scarab that spits bolts
      const gt = new THREE.Group();
      gt.position.z = -0.22;
      mesh(kit.cyl, kit.gold, 0.1, 0.3, 0.1, 0, -0.03, 0.1, gt).rotation.x = Math.PI / 2;
      for (let i = 0; i < 3; i++) mesh(kit.torus, kit.lapis, 0.11, 0.11, 0.11, 0, -0.03, 0.0 + i * 0.08, gt);
      mesh(kit.sphere, kit.shell, 0.15, 0.08, 0.2, 0, 0.03, -0.1, gt);
      for (const s of [-1, 1]) mesh(kit.sphere, kit.gold, 0.07, 0.045, 0.18, s * 0.04, 0.06, -0.1, gt);
      const gem = mesh(kit.octa, kit.glowGreen, 0.06, 0.06, 0.06, 0, 0.03, -0.21, gt);
      glowMeshes.push(gem);
      for (const s of [-1, 1]) mesh(kit.box, kit.gold, 0.01, 0.01, 0.1, s * 0.06, 0.02, -0.22, gt).rotation.y = s * 0.3;
      g.add(gt);
      hand(0, -0.06, -0.24);
      muzzle.position.set(0, 0.03, -0.48);
      break;
    }
    case "sun": {
      // staff of acacia and gold crowned by a blazing sun disc between horns
      const st = new THREE.Group();
      mesh(kit.cyl, kit.wood, 0.03, 0.9, 0.03, 0, -0.1, 0, st);
      for (let i = 0; i < 4; i++) mesh(kit.cyl, kit.gold, 0.036, 0.03, 0.036, 0, -0.4 + i * 0.18, 0, st);
      const disc = mesh(kit.sphere, kit.glowOrange, 0.13, 0.13, 0.13, 0, 0.43, 0, st);
      glowMeshes.push(disc);
      mesh(kit.torus, kit.gold, 0.18, 0.18, 0.18, 0, 0.43, 0, st);
      for (const s of [-1, 1]) {
        const h = mesh(kit.torus, kit.gold, 0.2, 0.2, 0.2, s * 0.03, 0.4, 0, st);
        h.scale.set(0.12, 0.2, 0.12);
        h.rotation.z = s * 0.6;
      }
      st.rotation.x = -0.3;
      st.rotation.z = -0.32;
      st.position.set(0.04, -0.06, -0.18);
      g.add(st);
      hand(0.02, -0.12, -0.14);
      muzzle.position.set(0.17, 0.3, -0.34);
      break;
    }
    case "scepter": {
      // the royal was-scepter: lapis and gold shaft, an ankh head and a soul gem
      const st = new THREE.Group();
      mesh(kit.cyl, kit.stripes, 0.025, 0.85, 0.025, 0, -0.08, 0, st);
      const ankh = new THREE.Mesh(glyphGeometry("ankh", 14), kit.gold);
      ankh.scale.setScalar(0.24);
      ankh.position.set(0, 0.42, 0);
      st.add(ankh);
      const gem = mesh(kit.octa, kit.glowViolet, 0.08, 0.1, 0.08, 0, 0.42, -0.03, st);
      glowMeshes.push(gem);
      mesh(kit.box, kit.gold, 0.12, 0.03, 0.03, 0, -0.5, 0, st);
      st.rotation.x = -0.3;
      st.rotation.z = -0.32;
      st.position.set(0.04, -0.08, -0.18);
      g.add(st);
      hand(0.02, -0.14, -0.14);
      muzzle.position.set(0.17, 0.28, -0.34);
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
  const metal = new THREE.MeshStandardMaterial({ color: col, metalness: 0.95, roughness: 0.25, emissive: col.clone().multiplyScalar(0.15) });
  own.push(metal);
  const add = (geo, mat, s, p, r) => {
    const o = new THREE.Mesh(geo, mat);
    o.scale.set(...s);
    o.position.set(...p);
    if (r) o.rotation.set(...r);
    g.add(o);
    return o;
  };
  if (def.kind === "relic") {
    const mat = new THREE.MeshStandardMaterial({ color: col, metalness: 0.7, roughness: 0.25, emissive: col.clone().multiplyScalar(0.35) });
    own.push(mat);
    add(glyphGeometry(def.glyph), mat, [0.5, 0.5, 0.5], [0, 0, 0]);
    add(kit.ring, kit.gold, [0.62, 0.62, 0.62], [0, 0, 0]);
  } else if (def.kind === "weapon") {
    const w = buildWeapon(kit, def.weapon);
    w.group.children.filter((c) => c.material === kit.skin || c.material === kit.linen).forEach((c) => (c.visible = false));
    w.group.scale.setScalar(1.3);
    w.group.rotation.set(0, Math.PI / 2, 0.3);
    g.add(w.group);
    if (w.group.userData.ownGeo) g.userData.ownGeo = w.group.userData.ownGeo;
  } else if (id.endsWith("Key") || id === "scarabSeal" || id === "royalSeal") {
    if (id.endsWith("Key")) {
      add(kit.torus, metal, [0.16, 0.16, 0.16], [0, 0.17, 0]);
      add(kit.cyl, metal, [0.045, 0.34, 0.045], [0, -0.06, 0]);
      add(kit.box, metal, [0.1, 0.04, 0.02], [0.05, -0.18, 0]);
      add(kit.box, metal, [0.07, 0.04, 0.02], [0.035, -0.1, 0]);
    } else {
      add(kit.disc, metal, [0.34, 0.06, 0.34], [0, 0, 0], [Math.PI / 2, 0, 0]);
      const gm = new THREE.Mesh(glyphGeometry(id === "scarabSeal" ? "scarab" : "falcon"), kit.gold);
      gm.scale.setScalar(0.22);
      gm.position.z = -0.04;
      g.add(gm);
    }
  } else if (id === "oil") {
    add(kit.jar, kit.alabaster, [0.5, 0.5, 0.5], [0, -0.2, 0]);
    add(kit.sphereLo, kit.glowOrange, [0.08, 0.08, 0.08], [0, 0.22, 0]);
  } else if (id === "gear") {
    add(kit.cyl, kit.bronze, [0.32, 0.06, 0.32], [0, 0, 0], [Math.PI / 2, 0, 0]);
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      add(kit.box, kit.bronze, [0.06, 0.06, 0.06], [Math.cos(a) * 0.18, Math.sin(a) * 0.18, 0], [0, 0, a]);
    }
    add(kit.cyl, kit.stoneDark, [0.08, 0.08, 0.08], [0, 0, 0], [Math.PI / 2, 0, 0]);
  } else if (id === "canopic") {
    add(kit.jar, kit.alabaster, [0.55, 0.55, 0.55], [0, -0.22, 0]);
    add(kit.box, kit.black, [0.12, 0.12, 0.14], [0, 0.28, 0]);
    add(kit.cone4, kit.black, [0.04, 0.12, 0.04], [-0.04, 0.38, 0]);
    add(kit.cone4, kit.black, [0.04, 0.12, 0.04], [0.04, 0.38, 0]);
  } else if (id === "mirror") {
    add(kit.disc, kit.mirror, [0.36, 0.03, 0.36], [0, 0.08, 0], [Math.PI / 2, 0, 0]);
    add(kit.cyl, kit.wood, [0.05, 0.24, 0.05], [0, -0.2, 0]);
  } else if (id === "idol") {
    add(kit.box, kit.gold, [0.18, 0.3, 0.12], [0, 0, 0]);
    add(kit.sphereLo, kit.gold, [0.12, 0.12, 0.12], [0, 0.22, 0]);
    add(kit.box, kit.lapis, [0.2, 0.1, 0.14], [0, 0.28, 0.02]);
    add(kit.box, kit.gold, [0.24, 0.06, 0.16], [0, -0.17, 0]);
  } else if (def.kind === "heal") {
    add(kit.sphere, kit.glass, [0.26, 0.26, 0.26], [0, 0, 0]);
    add(kit.sphereLo, new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff3050).multiplyScalar(1.3), toneMapped: false }), [0.2, 0.2, 0.2], [0, -0.01, 0]);
    own.push(g.children[g.children.length - 1].material);
    add(kit.cyl, kit.gold, [0.07, 0.12, 0.07], [0, 0.17, 0]);
  } else if (def.kind === "armor") {
    add(kit.disc, kit.gold, [0.3, 0.04, 0.3], [0, 0, 0], [Math.PI / 2, 0, 0]);
    add(kit.octa, kit.glowCyan, [0.1, 0.12, 0.06], [0, 0, -0.03]);
    add(kit.torus, kit.gold, [0.12, 0.12, 0.12], [0, 0.2, 0]);
  } else if (def.kind === "ammo") {
    const glowMat = def.ammo === "scarab" ? kit.glowGreen : def.ammo === "sun" ? kit.glowOrange : kit.glowViolet;
    for (let k = 0; k < 3; k++) add(kit.octa, glowMat, [0.1, 0.16, 0.1], [(k - 1) * 0.1, (k % 2) * 0.05, 0], [0, k, 0.2 * (k - 1)]);
    add(kit.bowl, kit.gold, [0.35, 0.25, 0.35], [0, -0.14, 0]);
  } else if (def.kind === "note") {
    add(kit.cyl, kit.papyrus, [0.07, 0.42, 0.07], [0, 0, 0], [0, 0, Math.PI / 2]);
    for (const s of [-1, 1]) add(kit.cyl, kit.wood, [0.05, 0.04, 0.05], [s * 0.23, 0, 0], [0, 0, Math.PI / 2]);
  } else {
    add(kit.sphere, metal, [0.2, 0.2, 0.2], [0, 0, 0]);
  }
  return { group: g, own };
}

/* ------------------------------------------------------------------ props */
const part = (geo, mat, [sx, sy, sz], [x, y, z], rot) => {
  const o = new THREE.Mesh(geo, mat);
  o.scale.set(sx, sy, sz);
  o.position.set(x, y, z);
  if (rot) o.rotation.set(...rot);
  return o;
};

/** Seated guardian statue (anubis | falcon | pharaoh), ~2.9 m. */
export function buildStatue(kit, kind = "anubis", scale = 1) {
  const g = new THREE.Group();
  const { box, cyl, cone4 } = kit;
  const body = kind === "anubis" ? kit.black : kind === "falcon" ? kit.lapis : kit.skin;
  g.add(part(box, kit.stoneDark, [1.0, 0.4, 1.0], [0, 0.2, 0]));
  g.add(part(box, kit.gold, [1.04, 0.06, 1.04], [0, 0.42, 0]));
  for (const s of [-1, 1]) {
    g.add(part(box, body, [0.2, 0.62, 0.24], [s * 0.15, 0.75, 0]));
    g.add(part(box, body, [0.22, 0.08, 0.36], [s * 0.15, 0.48, -0.05]));
  }
  g.add(part(box, kit.linen, [0.62, 0.46, 0.42], [0, 1.24, 0]));
  g.add(part(box, kit.gold, [0.18, 0.4, 0.02], [0, 1.22, -0.22]));
  g.add(part(box, kit.gold, [0.64, 0.08, 0.44], [0, 1.45, 0]));
  g.add(part(box, body, [0.66, 0.66, 0.38], [0, 1.82, 0]));
  g.add(part(cyl, kit.gold, [0.76, 0.12, 0.56], [0, 2.12, 0]));
  for (const s of [-1, 1]) {
    g.add(part(box, body, [0.15, 0.68, 0.17], [s * 0.42, 1.8, -0.02]));
    g.add(part(cyl, kit.gold, [0.19, 0.08, 0.19], [s * 0.42, 1.58, -0.02]));
  }
  g.add(part(cyl, kit.gold, [0.05, 1.7, 0.05], [0.42, 1.25, -0.2]));
  g.add(part(box, kit.gold, [0.04, 0.05, 0.16], [0.42, 2.1, -0.26]));
  if (kind === "anubis") {
    g.add(part(box, kit.black, [0.32, 0.32, 0.36], [0, 2.42, 0]));
    g.add(part(box, kit.black, [0.15, 0.13, 0.4], [0, 2.36, -0.32]));
    for (const s of [-1, 1]) g.add(part(cone4, kit.black, [0.16, 0.36, 0.12], [s * 0.1, 2.75, 0.05]));
    g.add(part(box, kit.gold, [0.34, 0.05, 0.38], [0, 2.26, 0]));
  } else if (kind === "falcon") {
    g.add(part(box, kit.lapis, [0.34, 0.34, 0.36], [0, 2.42, 0]));
    g.add(part(cone4, kit.gold, [0.14, 0.24, 0.14], [0, 2.36, -0.26], [-Math.PI / 2, 0, 0]));
    g.add(part(kit.disc, kit.red, [0.52, 0.05, 0.52], [0, 2.92, 0.05], [Math.PI / 2, 0, 0]));
  } else {
    g.add(part(box, kit.skin, [0.32, 0.36, 0.32], [0, 2.42, 0]));
    g.add(part(box, kit.stripes, [0.5, 0.3, 0.42], [0, 2.6, 0.06]));
    for (const s of [-1, 1]) g.add(part(box, kit.stripes, [0.13, 0.42, 0.1], [s * 0.22, 2.2, -0.08]));
    g.add(part(box, kit.lapis, [0.07, 0.2, 0.07], [0, 2.14, -0.18]));
    g.add(part(cone4, kit.gold, [0.1, 0.12, 0.1], [0, 2.82, -0.12]));
  }
  for (const s of [-1, 1]) g.add(part(box, kit.glowGold, [0.06, 0.04, 0.02], [s * 0.08, 2.47, -0.19]));
  g.scale.setScalar(scale);
  return g;
}

/** urn | jar | basket | sarcophagus | chest | vault; lid in userData.lid. */
export function buildContainer(kit, kind) {
  const g = new THREE.Group();
  const lid = new THREE.Group();
  if (kind === "jar") {
    g.add(part(kit.jar, kit.alabaster, [1, 1, 1], [0, 0, 0]));
    lid.add(part(kit.sphere, kit.black, [0.34, 0.36, 0.34], [0, 0.92, 0]));
    lid.add(part(kit.cyl, kit.gold, [0.36, 0.04, 0.36], [0, 0.8, 0]));
  } else if (kind === "urn") {
    g.add(part(kit.urn, kit.clay, [1.1, 1.1, 1.1], [0, 0, 0]));
    lid.add(part(kit.cyl, kit.clay, [0.56, 0.06, 0.56], [0, 1.1, 0]));
    lid.add(part(kit.sphere, kit.clay, [0.14, 0.14, 0.14], [0, 1.16, 0]));
  } else if (kind === "basket") {
    g.add(part(kit.cyl, kit.reed, [0.7, 0.5, 0.7], [0, 0.25, 0]));
    g.add(part(kit.torus, kit.reed, [0.7, 0.7, 0.4], [0, 0.5, 0], [Math.PI / 2, 0, 0]));
    lid.add(part(kit.cyl, kit.reed, [0.74, 0.06, 0.74], [0, 0.54, 0]));
  } else if (kind === "sarcophagus") {
    g.add(part(kit.box, kit.lapis, [1.0, 0.75, 1.9], [0, 0.375, 0]));
    g.add(part(kit.box, kit.gold, [1.04, 0.08, 1.94], [0, 0.1, 0]));
    lid.add(part(kit.box, kit.gold, [1.04, 0.2, 1.94], [0, 0.85, 0]));
    lid.add(part(kit.box, kit.stripes, [0.5, 0.18, 0.5], [0, 1.02, -0.6]));
    lid.add(part(kit.sphere, kit.skin, [0.32, 0.2, 0.36], [0, 1.1, -0.66]));
    lid.add(part(kit.box, kit.lapis, [0.6, 0.06, 0.7], [0, 0.97, 0.15]));
  } else if (kind === "vault") {
    g.add(part(kit.box, kit.stoneDark, [1.1, 1.0, 0.9], [0, 0.5, 0]));
    g.add(part(kit.box, kit.gold, [1.14, 0.08, 0.94], [0, 1.0, 0]));
    lid.add(part(kit.box, kit.goldDark, [0.9, 0.8, 0.06], [0.45, 0, 0]));
    lid.add(part(kit.torus, kit.gold, [0.22, 0.22, 0.22], [0.45, 0, -0.05]));
    lid.position.set(-0.45, 0.5, -0.47);
    lid.userData.door = true;
  } else {
    g.add(part(kit.box, kit.wood, [1.2, 0.6, 0.8], [0, 0.3, 0]));
    for (const x of [-0.58, 0.58]) g.add(part(kit.box, kit.gold, [0.06, 0.62, 0.84], [x, 0.31, 0]));
    g.add(part(kit.box, kit.lapis, [1.0, 0.18, 0.02], [0, 0.34, -0.41]));
    const l = part(kit.box, kit.wood, [1.24, 0.16, 0.84], [0, 0.08, -0.42]);
    const trim = part(kit.box, kit.gold, [1.26, 0.04, 0.86], [0, 0.0, -0.42]);
    lid.position.set(0, 0.6, 0.42);
    lid.add(l, trim);
    lid.userData.hinge = true;
  }
  g.add(lid);
  g.userData.lid = lid;
  return g;
}

/** Animate a container's lid: 0 closed → 1 open. */
export function openContainer(g, kind, k) {
  const lid = g.userData.lid;
  if (!lid) return;
  if (lid.userData.hinge) lid.rotation.x = -k * 1.7;
  else if (lid.userData.door) lid.rotation.y = k * 1.7;
  else if (kind === "sarcophagus") {
    lid.position.x = k * 0.85;
    lid.rotation.z = -k * 0.15;
  } else {
    lid.position.set(k * 0.45, -k * (kind === "basket" ? 0.48 : 0.8), k * 0.1);
    lid.rotation.z = k * 1.2;
  }
}

export function buildGoldPile(kit, seed = 1) {
  const g = new THREE.Group();
  let a = seed * 9301 + 49297;
  const rand = () => (a = (a * 9301 + 49297) % 233280) / 233280;
  const N = 60;
  const inst = new THREE.InstancedMesh(kit.coin, kit.gold, N);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  for (let i = 0; i < N; i++) {
    const r = Math.sqrt(rand()) * 0.65,
      t = rand() * Math.PI * 2;
    const h = (1 - r / 0.65) * 0.35 + rand() * 0.04;
    e.set((rand() - 0.5) * 0.9, rand() * 3, (rand() - 0.5) * 0.9);
    q.setFromEuler(e);
    m.compose(new THREE.Vector3(Math.cos(t) * r, h, Math.sin(t) * r), q, new THREE.Vector3(1, 1, 1));
    inst.setMatrixAt(i, m);
  }
  g.add(inst);
  g.add(part(kit.cyl, kit.gold, [0.24, 0.25, 0.24], [0.35, 0.12, 0.2]));
  g.add(part(kit.box, kit.gold, [0.3, 0.1, 0.14], [-0.3, 0.05, 0.25], [0, 0.4, 0]));
  g.add(part(kit.sphere, kit.red, [0.12, 0.12, 0.12], [0.05, 0.42, 0]));
  g.add(part(kit.sphere, kit.lapis, [0.1, 0.1, 0.1], [-0.15, 0.3, -0.1]));
  return g;
}

export function buildObelisk(kit, mat) {
  const g = new THREE.Group();
  g.add(part(kit.box, kit.stoneDark, [1.0, 0.3, 1.0], [0, 0.15, 0]));
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.4, 2.9, 4, 1), mat);
  shaft.rotation.y = Math.PI / 4;
  shaft.position.y = 1.75;
  g.add(shaft);
  g.add(part(kit.cone4, kit.gold, [0.74, 0.4, 0.74], [0, 3.4, 0], [0, Math.PI / 4, 0]));
  g.userData.ownGeo = [shaft.geometry];
  return g;
}
