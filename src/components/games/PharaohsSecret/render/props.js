/**
 * Mesh builders for the temple's devices and decorations. Everything is made
 * from primitives, lathes and extruded hieroglyphs (original geometry, no
 * model files). Builders take a `kit` of shared materials/geometries owned by
 * the world, and return a THREE.Object3D whose local front faces −z.
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

/** Shared materials and geometries for one world. */
export function createKit() {
  const own = [];
  const m = (o) => {
    const x = new THREE.MeshStandardMaterial(o);
    own.push(x);
    return x;
  };
  const g = (x) => {
    own.push(x);
    return x;
  };
  const kit = {
    gold: m({ color: 0xe8b84a, metalness: 1, roughness: 0.28 }),
    goldDark: m({ color: 0xa87a28, metalness: 1, roughness: 0.4 }),
    bronze: m({ color: 0xb87a46, metalness: 0.9, roughness: 0.35 }),
    silver: m({ color: 0xd8dde6, metalness: 1, roughness: 0.25 }),
    mirror: m({ color: 0xf0d8a8, metalness: 1, roughness: 0.06 }),
    stoneDark: m({ color: 0x3a3026, roughness: 0.95 }),
    stone: m({ color: 0xb89a70, roughness: 0.9 }),
    black: m({ color: 0x141210, roughness: 0.6, metalness: 0.2 }),
    linen: m({ color: 0xe8e0c8, roughness: 0.85 }),
    skin: m({ color: 0xa8643a, roughness: 0.7 }),
    lapis: m({ color: 0x23409a, roughness: 0.35, metalness: 0.3 }),
    wood: m({ color: 0x6b3f1f, roughness: 0.8 }),
    clay: m({ color: 0xa0522d, roughness: 0.9 }),
    alabaster: m({ color: 0xe6dcc4, roughness: 0.5 }),
    reed: m({ color: 0xb08a4a, roughness: 0.95 }),
    red: m({ color: 0xc0302a, roughness: 0.5, emissive: 0x400000 }),
    eyeGlow: m({ color: 0x302010, emissive: 0xffb040, emissiveIntensity: 0.6 }),
    papyrus: m({ color: 0xe8d8a8, roughness: 0.9 }),
    steel: m({ color: 0x9aa0a8, metalness: 1, roughness: 0.32 }),
    rock: m({ color: 0x6a5a48, roughness: 1, flatShading: true }),
    box: g(new THREE.BoxGeometry(1, 1, 1)),
    cyl: g(new THREE.CylinderGeometry(1, 1, 1, 16)),
    cyl8: g(new THREE.CylinderGeometry(1, 1, 1, 8)),
    sphere: g(new THREE.SphereGeometry(1, 16, 12)),
    cone4: g(new THREE.ConeGeometry(1, 1, 4)),
    torus: g(new THREE.TorusGeometry(1, 0.28, 8, 20)),
    ring: g(new THREE.TorusGeometry(1, 0.07, 8, 32)),
    jar: g(lathe([[0, 0], [0.2, 0], [0.28, 0.12], [0.31, 0.4], [0.27, 0.66], [0.19, 0.76], [0.14, 0.8], [0, 0.8]])),
    urn: g(lathe([[0, 0], [0.22, 0], [0.34, 0.2], [0.38, 0.5], [0.3, 0.8], [0.22, 0.9], [0.25, 0.98], [0, 0.98]])),
    bowl: g(lathe([[0, 0], [0.12, 0.02], [0.34, 0.16], [0.44, 0.34], [0.46, 0.36], [0, 0.3]], 20)),
    coin: g(new THREE.CylinderGeometry(0.075, 0.075, 0.018, 10)),
    disc: g(new THREE.CylinderGeometry(1, 1, 1, 28)),
    plane: g(new THREE.PlaneGeometry(1, 1)),
    rockGeo: g(new THREE.IcosahedronGeometry(1, 0)),
    dispose() {
      own.forEach((x) => x.dispose());
    },
  };
  kit.stripes = (() => {
    const c = document.createElement("canvas");
    c.width = 16;
    c.height = 64;
    const ctx = c.getContext("2d");
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = i % 2 ? "#23409a" : "#e8b84a";
      ctx.fillRect(0, i * 8, 16, 8);
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    own.push(t);
    return m({ map: t, roughness: 0.5, metalness: 0.4 });
  })();
  return kit;
}

const part = (geo, mat, [sx, sy, sz], [x, y, z], rot) => {
  const o = new THREE.Mesh(geo, mat);
  o.scale.set(sx, sy, sz);
  o.position.set(x, y, z);
  if (rot) o.rotation.set(...rot);
  return o;
};

/* ------------------------------------------------------------------ statues */
export function buildStatue(kit, kind = "anubis", scale = 1) {
  const g = new THREE.Group();
  const { box, cyl, cone4 } = kit;
  const body = kind === "anubis" ? kit.black : kind === "falcon" ? kit.lapis : kit.skin;
  g.add(part(box, kit.stoneDark, [1.25, 0.4, 1.25], [0, 0.2, 0]));
  g.add(part(box, kit.gold, [1.3, 0.06, 1.3], [0, 0.42, 0]));
  for (const s of [-1, 1]) {
    g.add(part(box, body, [0.2, 0.62, 0.24], [s * 0.15, 0.75, 0]));
    g.add(part(box, body, [0.22, 0.08, 0.36], [s * 0.15, 0.48, -0.05]));
  }
  g.add(part(box, kit.linen, [0.62, 0.46, 0.42], [0, 1.24, 0]));
  g.add(part(box, kit.gold, [0.18, 0.4, 0.02], [0, 1.22, -0.22]));
  g.add(part(box, kit.gold, [0.64, 0.08, 0.44], [0, 1.45, 0]));
  g.add(part(box, body, [0.66, 0.66, 0.38], [0, 1.82, 0]));
  g.add(part(cyl, kit.gold, [0.38, 0.12, 0.28], [0, 2.12, 0]));
  for (const s of [-1, 1]) {
    g.add(part(box, body, [0.15, 0.68, 0.17], [s * 0.42, 1.8, -0.02]));
    g.add(part(cyl, kit.gold, [0.095, 0.08, 0.095], [s * 0.42, 1.58, -0.02]));
  }
  // was-sceptre held forward
  g.add(part(cyl, kit.gold, [0.025, 1.7, 0.025], [0.42, 1.25, -0.2]));
  g.add(part(box, kit.gold, [0.04, 0.05, 0.16], [0.42, 2.1, -0.26]));
  if (kind === "anubis") {
    g.add(part(box, kit.black, [0.32, 0.32, 0.36], [0, 2.42, 0]));
    g.add(part(box, kit.black, [0.15, 0.13, 0.4], [0, 2.36, -0.32]));
    for (const s of [-1, 1]) g.add(part(cone4, kit.black, [0.08, 0.36, 0.06], [s * 0.1, 2.75, 0.05]));
    g.add(part(box, kit.gold, [0.34, 0.05, 0.38], [0, 2.26, 0]));
  } else if (kind === "falcon") {
    g.add(part(box, kit.lapis, [0.34, 0.34, 0.36], [0, 2.42, 0]));
    g.add(part(cone4, kit.gold, [0.07, 0.24, 0.07], [0, 2.36, -0.26], [-Math.PI / 2, 0, 0]));
    g.add(part(kit.disc, kit.red, [0.26, 0.05, 0.26], [0, 2.92, 0.05], [Math.PI / 2, 0, 0]));
  } else {
    g.add(part(box, kit.skin, [0.32, 0.36, 0.32], [0, 2.42, 0]));
    g.add(part(box, kit.stripes, [0.5, 0.3, 0.42], [0, 2.6, 0.06]));
    for (const s of [-1, 1]) g.add(part(box, kit.stripes, [0.13, 0.42, 0.1], [s * 0.22, 2.2, -0.08]));
    g.add(part(box, kit.lapis, [0.07, 0.2, 0.07], [0, 2.14, -0.18]));
    g.add(part(cone4, kit.gold, [0.05, 0.12, 0.05], [0, 2.82, -0.12]));
  }
  for (const s of [-1, 1]) g.add(part(box, kit.eyeGlow, [0.06, 0.04, 0.02], [s * 0.08, 2.47, -0.18 - (kind === "anubis" ? 0.01 : 0)]));
  g.scale.setScalar(scale);
  return g;
}

/* ------------------------------------------------------------------ containers */
export function buildContainer(kit, kind) {
  const g = new THREE.Group();
  const lid = new THREE.Group();
  if (kind === "jar") {
    g.add(part(kit.jar, kit.alabaster, [1, 1, 1], [0, 0, 0]));
    lid.add(part(kit.sphere, kit.black, [0.17, 0.18, 0.17], [0, 0.92, 0]));
    lid.add(part(kit.box, kit.black, [0.07, 0.06, 0.18], [0, 0.9, -0.16]));
    lid.add(part(kit.cyl, kit.gold, [0.18, 0.04, 0.18], [0, 0.8, 0]));
  } else if (kind === "urn") {
    g.add(part(kit.urn, kit.clay, [1, 1, 1], [0, 0, 0]));
    lid.add(part(kit.cyl, kit.clay, [0.28, 0.06, 0.28], [0, 1.0, 0]));
    lid.add(part(kit.sphere, kit.clay, [0.07, 0.07, 0.07], [0, 1.06, 0]));
  } else if (kind === "basket") {
    g.add(part(kit.cyl8, kit.reed, [0.34, 0.5, 0.34], [0, 0.25, 0]));
    g.add(part(kit.torus, kit.reed, [0.34, 0.34, 0.2], [0, 0.5, 0], [Math.PI / 2, 0, 0]));
    lid.add(part(kit.cyl8, kit.reed, [0.37, 0.06, 0.37], [0, 0.54, 0]));
  } else if (kind === "sarcophagus") {
    g.add(part(kit.box, kit.lapis, [1.0, 0.75, 1.9], [0, 0.375, 0]));
    g.add(part(kit.box, kit.gold, [1.04, 0.08, 1.94], [0, 0.1, 0]));
    lid.add(part(kit.box, kit.gold, [1.04, 0.2, 1.94], [0, 0.85, 0]));
    lid.add(part(kit.box, kit.stripes, [0.5, 0.18, 0.5], [0, 1.02, -0.6]));
    lid.add(part(kit.sphere, kit.skin, [0.16, 0.1, 0.18], [0, 1.1, -0.66]));
    lid.add(part(kit.box, kit.lapis, [0.6, 0.06, 0.7], [0, 0.97, 0.15]));
  } else {
    // painted wooden chest
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
  else if (kind === "sarcophagus") {
    lid.position.x = k * 0.85;
    lid.rotation.z = -k * 0.15;
  } else {
    lid.position.set(k * 0.45, -k * (kind === "basket" ? 0.48 : 0.8), k * 0.1);
    lid.rotation.z = k * 1.2;
  }
}

/* ------------------------------------------------------------------ items */
export function buildItem(kit, id, color) {
  const g = new THREE.Group();
  const col = new THREE.Color(color);
  const metal = new THREE.MeshStandardMaterial({ color: col, metalness: 0.95, roughness: 0.25, emissive: col.clone().multiplyScalar(0.12), side: THREE.DoubleSide });
  g.userData.own = [metal];
  const relicGlyph = { ankh: "ankh", eye: "eye", scarab: "scarab", feather: "feather", sunDisk: "sun", lotus: "lotus" }[id];
  if (relicGlyph) {
    const mat = id === "feather" || id === "scarab" || id === "eye" || id === "lotus" ? new THREE.MeshStandardMaterial({ color: col, metalness: 0.3, roughness: 0.35, emissive: col.clone().multiplyScalar(0.18), side: THREE.DoubleSide }) : metal;
    if (mat !== metal) g.userData.own.push(mat);
    const mesh = new THREE.Mesh(glyphGeometry(relicGlyph), mat);
    mesh.scale.setScalar(0.42);
    g.add(mesh);
  } else if (id.endsWith("Key")) {
    g.add(part(kit.torus, metal, [0.09, 0.09, 0.09], [0, 0.17, 0]));
    g.add(part(kit.cyl, metal, [0.024, 0.34, 0.024], [0, -0.06, 0]));
    g.add(part(kit.box, metal, [0.1, 0.04, 0.02], [0.05, -0.18, 0]));
    g.add(part(kit.box, metal, [0.07, 0.04, 0.02], [0.035, -0.1, 0]));
    if (id === "goldKey") g.add(part(kit.sphere, kit.red, [0.035, 0.035, 0.035], [0, 0.17, 0.03]));
    g.scale.setScalar(1.4);
  } else if (id === "heart") {
    const ruby = new THREE.MeshStandardMaterial({ color: 0xff2a3a, emissive: 0xa00010, emissiveIntensity: 1.2, roughness: 0.2, metalness: 0.2 });
    g.userData.own.push(ruby);
    g.add(part(kit.sphere, ruby, [0.18, 0.22, 0.15], [0, 0, 0]));
    g.add(part(kit.cyl, kit.gold, [0.09, 0.06, 0.09], [0, 0.22, 0]));
    g.add(part(kit.torus, kit.gold, [0.19, 0.19, 0.12], [0, 0, 0], [0, 0, 0]));
  } else if (id === "moonStone") {
    const glow = new THREE.MeshStandardMaterial({ color: 0xdfeaff, emissive: 0x7090c0, emissiveIntensity: 0.8, roughness: 0.15 });
    g.userData.own.push(glow);
    g.add(part(kit.sphere, glow, [0.17, 0.14, 0.17], [0, 0, 0]));
  } else if (id === "torch") {
    g.add(part(kit.cyl, kit.wood, [0.035, 0.5, 0.035], [0, -0.05, 0]));
    g.add(part(kit.cyl, kit.reed, [0.06, 0.12, 0.06], [0, 0.22, 0]));
  } else if (id === "mirror") {
    g.add(part(kit.disc, kit.mirror, [0.2, 0.02, 0.2], [0, 0.08, 0], [Math.PI / 2, 0, 0]));
    g.add(part(kit.cyl, kit.wood, [0.03, 0.22, 0.03], [0, -0.2, 0]));
  } else if (id === "scroll") {
    g.add(part(kit.cyl, kit.papyrus, [0.07, 0.42, 0.07], [0, 0, 0], [0, 0, Math.PI / 2]));
    for (const s of [-1, 1]) g.add(part(kit.cyl, kit.wood, [0.05, 0.04, 0.05], [s * 0.23, 0, 0], [0, 0, Math.PI / 2]));
  } else if (id === "crook") {
    const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, -0.4, 0), new THREE.Vector3(0, 0.2, 0), new THREE.Vector3(0.02, 0.32, 0), new THREE.Vector3(0.12, 0.36, 0), new THREE.Vector3(0.18, 0.28, 0)]);
    const tube = new THREE.TubeGeometry(curve, 24, 0.025, 6);
    g.userData.ownGeo = [tube];
    g.add(new THREE.Mesh(tube, kit.stripes));
  } else if (id === "flail") {
    g.add(part(kit.cyl, kit.stripes, [0.025, 0.55, 0.025], [0, -0.05, 0], [0, 0, 0.3]));
    for (let i = -1; i <= 1; i++) g.add(part(kit.cyl, kit.gold, [0.012, 0.3, 0.012], [0.12 + i * 0.04, 0.12, 0], [0, 0, -0.5]));
  } else {
    g.add(part(kit.sphere, metal, [0.15, 0.15, 0.15], [0, 0, 0]));
  }
  return g;
}

/* ------------------------------------------------------------------ misc */
export function buildGoldPile(kit, seed = 1) {
  const g = new THREE.Group();
  let a = seed * 9301 + 49297;
  const rand = () => ((a = (a * 9301 + 49297) % 233280) / 233280);
  const N = 70;
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
  g.add(part(kit.cyl, kit.gold, [0.12, 0.25, 0.12], [0.35, 0.12, 0.2]));
  g.add(part(kit.box, kit.gold, [0.3, 0.1, 0.14], [-0.3, 0.05, 0.25], [0, 0.4, 0]));
  g.add(part(kit.sphere, kit.red, [0.06, 0.06, 0.06], [0.05, 0.42, 0]));
  g.add(part(kit.sphere, kit.lapis, [0.05, 0.05, 0.05], [-0.15, 0.3, -0.1]));
  return g;
}

export function buildObelisk(kit, mat) {
  const g = new THREE.Group();
  g.add(part(kit.box, kit.stoneDark, [1.0, 0.3, 1.0], [0, 0.15, 0]));
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.4, 3.3, 4, 1), mat);
  shaft.rotation.y = Math.PI / 4;
  shaft.position.y = 1.95;
  g.add(shaft);
  g.add(part(kit.cone4, kit.gold, [0.37, 0.4, 0.37], [0, 3.8, 0], [0, Math.PI / 4, 0]));
  g.userData.ownGeo = [shaft.geometry];
  return g;
}

export function buildTorch(kit) {
  const g = new THREE.Group();
  g.add(part(kit.box, kit.bronze, [0.12, 0.08, 0.3], [0, -0.1, -0.12]));
  g.add(part(kit.cyl, kit.wood, [0.04, 0.5, 0.04], [0, 0.05, -0.26], [0.35, 0, 0]));
  g.add(part(kit.cyl, kit.bronze, [0.07, 0.12, 0.07], [0, 0.28, -0.34], [0.35, 0, 0]));
  return g;
}
