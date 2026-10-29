/**
 * Structures and props, built from the shared layout (data/layout.js) and
 * the interior maps.
 *
 * Static geometry is generated per layout entry by small builders (timber
 * houses, curtain walls, towers, keeps, ruins, tents, bridges, props…),
 * then merged into one mesh per material per 128 m tile (frustum culled).
 * UVs are world-scaled so stone courses and planks keep one density.
 *
 * Interactable or animated pieces (gates, chests, cages, levers, shrines,
 * ore, anchors, ballistae, windmill sails, banners, braziers) are separate
 * objects registered in `dyn` by id and driven from game state each frame.
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { surface, sigilTex } from "./textures.js";
import { ICELL, IHEIGHT } from "../data/interiors.js";
import { rng } from "../engine/math.js";

/* ================================================================ geometry kit */
function planarUV(g, ts = 2) {
  const p = g.attributes.position;
  const n = g.attributes.normal;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i));
    const ay = Math.abs(n.getY(i));
    const az = Math.abs(n.getZ(i));
    let u;
    let v;
    if (ay >= ax && ay >= az) {
      u = p.getX(i);
      v = p.getZ(i);
    } else if (ax >= az) {
      u = p.getZ(i);
      v = p.getY(i);
    } else {
      u = p.getX(i);
      v = p.getY(i);
    }
    uv[i * 2] = u / ts;
    uv[i * 2 + 1] = v / ts;
  }
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  return g;
}
const box = (w, h, d, ts = 2) => planarUV(new THREE.BoxGeometry(w, h, d), ts);
function cyl(rt, rb, h, seg = 12, ts = 2, open = false) {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg, 1, open);
  const uv = g.attributes.uv;
  const C = Math.PI * 2 * Math.max(rt, rb);
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * C) / ts, (uv.getY(i) * h) / ts);
  return g;
}
function cone(r, h, seg = 12, ts = 2) {
  const g = new THREE.ConeGeometry(r, h, seg, 1, true);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * Math.PI * 2 * r) / ts, (uv.getY(i) * Math.hypot(r, h)) / ts);
  return g;
}
/** Triangular prism (gable end): width w along x, height h, thickness t. */
function gable(w, h, t) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0);
  s.lineTo(w / 2, 0);
  s.lineTo(0, h);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: t, bevelEnabled: false });
  g.translate(0, 0, -t / 2);
  g.computeVertexNormals();
  return planarUV(g, 2);
}

function createBuckets() {
  const B = new Map();
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const one = new THREE.Vector3(1, 1, 1);
  return {
    /** Add `geo` (consumed) under material `mat` with local transform within entity matrix `E`. */
    add(mat, geo, E, lx = 0, ly = 0, lz = 0, ry = 0, rx = 0, rz = 0, color = null, scale = null) {
      e.set(rx, ry, rz, "YXZ");
      q.setFromEuler(e);
      m.compose(new THREE.Vector3(lx, ly, lz), q, scale || one);
      let g = geo.index ? geo.toNonIndexed() : geo;
      g.applyMatrix4(m);
      if (E) g.applyMatrix4(E);
      for (const k of Object.keys(g.attributes)) if (!["position", "normal", "uv"].includes(k)) g.deleteAttribute(k);
      if (!g.attributes.uv) g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      const n = g.attributes.position.count;
      const c = new Float32Array(n * 3);
      const col = color ? new THREE.Color(color) : null;
      for (let i = 0; i < n; i++) {
        c[i * 3] = col ? col.r : 1;
        c[i * 3 + 1] = col ? col.g : 1;
        c[i * 3 + 2] = col ? col.b : 1;
      }
      g.setAttribute("color", new THREE.BufferAttribute(c, 3));
      // tile by the first vertex
      const tx = Math.floor((g.attributes.position.getX(0) + 2048) / 128);
      const tz = Math.floor((g.attributes.position.getZ(0) + 2048) / 128);
      const key = `${mat}|${tx}|${tz}`;
      if (!B.has(key)) B.set(key, { mat, list: [] });
      B.get(key).list.push(g);
    },
    build(materials, group) {
      const meshes = [];
      for (const { mat, list } of B.values()) {
        const g = mergeGeometries(list);
        list.forEach((x) => x.dispose());
        g.computeBoundingSphere();
        const mesh = new THREE.Mesh(g, materials[mat]);
        mesh.castShadow = !["window", "ember", "glow"].includes(mat);
        mesh.receiveShadow = true;
        mesh.matrixAutoUpdate = false;
        group.add(mesh);
        meshes.push(mesh);
      }
      B.clear();
      return meshes;
    },
  };
}

/* ================================================================ materials */
function makeMaterials(shared) {
  const S = (k, o = {}) => {
    const t = surface(k);
    return new THREE.MeshStandardMaterial({ map: t.map, normalMap: t.normalMap, vertexColors: true, roughness: 0.9, metalness: 0, ...o });
  };
  const M = {
    stone: S("stone", { roughness: 0.88 }),
    ruin: S("ruin", { roughness: 0.92 }),
    crypt: S("crypt", { roughness: 0.9 }),
    cobble: S("cobble", { roughness: 0.85 }),
    plaster: S("plaster", { roughness: 0.95 }),
    timber: S("timber", { roughness: 0.85 }),
    planks: S("planks", { roughness: 0.85 }),
    log: S("log", { roughness: 0.9 }),
    thatch: S("thatch", { roughness: 1 }),
    shingle: S("shingle", { roughness: 0.85 }),
    slate: S("slate", { roughness: 0.6, metalness: 0.05 }),
    cloth: S("cloth", { roughness: 0.9, side: THREE.DoubleSide }),
    metal: S("metal", { roughness: 0.42, metalness: 0.85, color: 0x6a6a70 }),
    gold: S("metal", { roughness: 0.3, metalness: 1, color: 0xd8b25a }),
    rock: S("rock", { roughness: 0.92 }),
    bone: S("plaster", { roughness: 0.7, color: 0xd9cfb4 }),
    obsidian: S("rock", { roughness: 0.25, metalness: 0.3, color: 0x2a2228 }),
    window: new THREE.MeshStandardMaterial({ color: 0x1c2026, emissive: new THREE.Color("#ffb45a"), emissiveIntensity: 0, roughness: 0.25, metalness: 0.3 }),
    ember: new THREE.MeshStandardMaterial({ color: 0x401008, emissive: new THREE.Color("#ff5a1a"), emissiveIntensity: 2.2, roughness: 0.8 }),
    glow: new THREE.MeshStandardMaterial({ color: 0x103040, emissive: new THREE.Color("#7fd8ff"), emissiveIntensity: 2.4, roughness: 0.3 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 1 }),
  };
  shared.windows = M.window;
  return M;
}

/* ================================================================ builders */
const rad = (d) => (d * Math.PI) / 180;

function entityMatrix(e) {
  const m = new THREE.Matrix4();
  m.compose(new THREE.Vector3(e.x, e.y, e.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), e.rot || 0), new THREE.Vector3(1, 1, 1));
  return m;
}

function buildHouse(B, e, E) {
  const { w, d } = e;
  const h = e.h || 3.4;
  const floors = e.floors || 1;
  const stone = e.style === "stone";
  const wallMat = stone ? "stone" : "plaster";
  const roofMat = e.roof === "slate" ? "slate" : e.roof === "shingle" ? "shingle" : "thatch";
  B.add("stone", box(w + 0.4, 2.2, d + 0.4), E, 0, -0.75, 0);
  let top = 0.35;
  for (let f = 0; f < floors; f++) {
    const jet = f > 0 && !stone ? 0.35 : 0;
    const fw = w + jet * 2;
    const fd = d + jet * 2;
    B.add(wallMat, box(fw, h, fd), E, 0, top + h / 2, 0);
    if (!stone) {
      // timber frame: corner posts, studs, sill/plate beams, braces
      const T = (x, y, z, ww, hh, dd, ry = 0, rz = 0) => B.add("timber", box(ww, hh, dd, 1), E, x, y, z, ry, 0, rz);
      for (const sx of [-1, 1])
        for (const sz of [-1, 1]) T((sx * fw) / 2, top + h / 2, (sz * fd) / 2, 0.26, h, 0.26);
      for (const sz of [-1, 1]) {
        T(0, top + 0.12, (sz * fd) / 2, fw, 0.22, 0.2);
        T(0, top + h - 0.1, (sz * fd) / 2, fw, 0.2, 0.2);
        const n = Math.max(1, Math.round(fw / 1.9));
        for (let k = 1; k < n; k++) T(-fw / 2 + (k * fw) / n, top + h / 2, (sz * fd) / 2 + sz * 0.05, 0.18, h, 0.14);
        if (fw > 5) {
          T(-fw / 2 + fw / n / 2, top + h / 2, (sz * fd) / 2 + sz * 0.06, 0.16, Math.hypot(h, fw / n) * 0.9, 0.12, 0, Math.atan2(fw / n, h) * sz);
          T(fw / 2 - fw / n / 2, top + h / 2, (sz * fd) / 2 + sz * 0.06, 0.16, Math.hypot(h, fw / n) * 0.9, 0.12, 0, -Math.atan2(fw / n, h) * sz);
        }
      }
      for (const sx of [-1, 1]) {
        T((sx * fw) / 2, top + 0.12, 0, 0.2, 0.22, fd);
        T((sx * fw) / 2, top + h - 0.1, 0, 0.2, 0.2, fd);
        const n = Math.max(1, Math.round(fd / 1.9));
        for (let k = 1; k < n; k++) T((sx * fw) / 2 + sx * 0.05, top + h / 2, -fd / 2 + (k * fd) / n, 0.14, h, 0.18);
      }
    }
    // windows on each side
    const winY = top + h * 0.55;
    const nWin = Math.max(1, Math.floor(fw / 3.2));
    for (let k = 0; k < nWin; k++) {
      const x = -fw / 2 + ((k + 0.5) * fw) / nWin;
      if (f === 0 && Math.abs(x) < 1.2) continue; // the door
      B.add("window", box(0.75, 0.9, 0.1), E, x, winY, fd / 2 + 0.03);
      B.add("timber", box(0.95, 0.12, 0.16, 1), E, x, winY - 0.5, fd / 2 + 0.06);
      B.add("window", box(0.75, 0.9, 0.1), E, x, winY, -fd / 2 - 0.03);
    }
    for (const sx of [-1, 1]) B.add("window", box(0.1, 0.9, 0.75), E, (sx * fw) / 2 + sx * 0.03, winY, 0);
    top += h;
  }
  // door
  B.add("planks", box(1.3, 2.2, 0.14, 1), E, 0, 0.35 + 1.1, d / 2 + 0.06);
  B.add("timber", box(1.6, 0.18, 0.2, 1), E, 0, 0.35 + 2.28, d / 2 + 0.08);
  // gable roof along the longer side
  const along = w >= d;
  const L = (along ? w : d) + (e.floors > 1 ? 1.4 : 1.0);
  const S = (along ? d : w) + (floors > 1 ? 0.7 : 0) + 1.2;
  const rh = S * (roofMat === "thatch" ? 0.55 : 0.48);
  const slope = Math.atan2(rh, S / 2);
  const slab = Math.hypot(rh, S / 2) + 0.15;
  const th = roofMat === "thatch" ? 0.42 : 0.16;
  const ry = along ? 0 : Math.PI / 2;
  for (const s of [-1, 1]) {
    const lz = (s * S) / 4;
    const lx = 0;
    const [ox, oz] = along ? [lx, lz] : [lz, lx];
    B.add(roofMat, box(L, th, slab, 2), E, ox, top + rh / 2, oz, ry, s * slope * (along ? 1 : 1), 0);
  }
  B.add("timber", box(L + 0.1, 0.22, 0.22, 1), E, 0, top + rh + 0.02, 0, ry);
  // gable ends
  const gw = (along ? d : w) + (floors > 1 ? 0.7 : 0);
  for (const s of [-1, 1]) {
    const off = (s * ((along ? w : d) + (floors > 1 ? 0.7 : 0))) / 2;
    const [gx, gz] = along ? [off, 0] : [0, off];
    B.add(stone ? "stone" : "plaster", gable(gw, rh - 0.1, 0.25), E, gx, top, gz, along ? Math.PI / 2 : 0);
  }
  // chimney
  if (e.chimney !== false && (e.id || (w * 13 + d * 7) % 3 > 0)) {
    const cx = along ? w * 0.28 : 0;
    const cz = along ? 0 : d * 0.28;
    B.add("stone", box(0.9, rh + 1.6, 0.9), E, cx, top + (rh + 1.6) / 2 - 0.2, cz + (along ? -0.6 : 0));
    e.smoke = [cx, top + rh + 1.4, cz + (along ? -0.6 : 0)];
  }
  if (e.sign === "inn") {
    B.add("timber", box(0.12, 0.12, 1.4, 1), E, 1.6, 2.9, d / 2 + 0.7);
    B.add("planks", box(0.9, 0.6, 0.08, 1), E, 1.6, 2.4, d / 2 + 1.25, 0, 0, 0, "#c9a050");
  }
}

function buildHall(B, e, E) {
  buildHouse(B, { ...e, roof: "shingle", style: "timber", floors: 1, h: e.h }, E);
  // porch with posts
  for (const sx of [-2.4, 2.4]) B.add("timber", box(0.3, 3.2, 0.3, 1), E, sx, 1.6, e.d / 2 + 1.8);
  B.add("shingle", box(6, 0.15, 2.6, 2), E, 0, 3.3, e.d / 2 + 1.2, 0, rad(-12));
}

function buildChapel(B, e, E) {
  const { w, d } = e;
  B.add("stone", box(w, 6, d), E, 0, 3 - 0.8, 0);
  B.add("stone", box(w + 0.4, 1.2, d + 0.4), E, 0, -0.5, 0);
  const rh = w * 0.75;
  const slab = Math.hypot(rh, w / 2) + 0.2;
  for (const s of [-1, 1]) B.add("slate", box(slab, 0.2, d + 0.8), E, (s * w) / 4, 5.2 + rh / 2, 0, 0, 0, -s * Math.atan2(rh, w / 2));
  for (const s of [-1, 1]) B.add("stone", gable(w, rh, 0.4), E, 0, 5.2, (s * d) / 2);
  // bell tower at the front
  B.add("stone", box(3.6, 11, 3.6), E, 0, 4.7, d / 2 + 1.6);
  B.add("slate", cone(2.9, 4.5, 4), E, 0, 12.4, d / 2 + 1.6, Math.PI / 4);
  B.add("dark", box(1.4, 1.6, 3.7), E, 0, 9, d / 2 + 1.6);
  for (let k = 0; k < 3; k++) B.add("window", box(0.12, 2.2, 0.9), E, w / 2 + 0.04, 2.6, -d / 2 + 3 + k * 3.6);
  for (let k = 0; k < 3; k++) B.add("window", box(0.12, 2.2, 0.9), E, -w / 2 - 0.04, 2.6, -d / 2 + 3 + k * 3.6);
  B.add("planks", box(1.8, 2.8, 0.2, 1), E, 0, 1.2, d / 2 + 3.42);
}

function buildSmithy(B, e, E) {
  const { w, d } = e;
  B.add("stone", box(w, 3.8, d / 2), E, 0, 1.4, -d / 4);
  for (const sx of [-1, 1]) B.add("timber", box(0.3, 3.6, 0.3, 1), E, (sx * (w - 0.6)) / 2, 1.8, d / 2 - 0.3);
  B.add("shingle", box(w + 0.8, 0.16, d + 1), E, 0, 3.9, 0.2, 0, rad(-14));
  // forge
  B.add("stone", box(2.4, 1.2, 1.6), E, -w / 4, 0.6, -d / 4 + 1.2);
  B.add("ember", box(1.6, 0.12, 1.0), E, -w / 4, 1.22, -d / 4 + 1.2);
  B.add("stone", box(1, 4, 1), E, -w / 4, 4, -d / 4 + 0.6);
  e.smoke = [-w / 4, 6.1, -d / 4 + 0.6];
  e.fire = [-w / 4, 1.4, -d / 4 + 1.2];
  // anvil + quench barrel + rack of tools
  B.add("metal", box(0.9, 0.35, 0.4, 1), E, w / 6, 0.85, 0.6);
  B.add("log", cyl(0.3, 0.35, 0.7, 8), E, w / 6, 0.35, 0.6);
  B.add("planks", cyl(0.45, 0.45, 0.9, 10, 1), E, w / 3, 0.45, -0.4);
}

function buildStable(B, e, E) {
  const { w, d } = e;
  B.add("planks", box(w, 3, 0.2, 2), E, 0, 1.4, -d / 2);
  for (const sx of [-1, 0, 1]) B.add("timber", box(0.26, 3, 0.26, 1), E, (sx * (w - 0.4)) / 2, 1.5, d / 2 - 0.3);
  B.add("thatch", box(w + 0.8, 0.35, d + 1.2), E, 0, 3.2, 0, 0, rad(-12));
  for (let k = 0; k < 3; k++) B.add("planks", box(0.12, 1.2, d * 0.6, 1), E, -w / 2 + (k + 1) * (w / 4), 0.6, 0);
  B.add("thatch", box(1.8, 0.9, 1.2), E, -w / 3, 0.45, -d / 4, 0, 0, 0, "#d8c070");
}

function buildStall(B, e, E) {
  for (const sx of [-1.5, 1.5]) for (const sz of [-0.9, 0.9]) B.add("timber", box(0.14, 2.6, 0.14, 1), E, sx, 1.3, sz);
  B.add("planks", box(3.2, 0.12, 1.2, 1), E, 0, 1.0, 0.6);
  B.add("planks", box(3.2, 1.0, 0.1, 1), E, 0, 0.5, 1.2);
  B.add("cloth", box(3.6, 0.05, 2.4, 1), E, 0, 2.7, 0.1, 0, rad(-10), 0, e.color);
  // wares
  const R = rng(Math.round(e.x * 7 + e.z));
  for (let k = 0; k < 5; k++) B.add(R() < 0.5 ? "planks" : "cloth", box(0.35, 0.25, 0.3, 1), E, -1.2 + k * 0.6, 1.2, 0.6, R(), 0, 0, R() < 0.5 ? "#a8723a" : "#7a3a2a");
}

function buildWell(B, e, E) {
  B.add("stone", cyl(1.25, 1.35, 1.0, 14, 1.5, true), E, 0, 0.5, 0);
  B.add("stone", cyl(1.0, 1.0, 1.0, 14, 1.5, true), E, 0, 0.5, 0);
  B.add("stone", new THREE.RingGeometry(1.0, 1.35, 14).rotateX(-Math.PI / 2), E, 0, 1.0, 0);
  B.add("dark", new THREE.CircleGeometry(1.0, 14).rotateX(-Math.PI / 2), E, 0, 0.6, 0);
  for (const s of [-1, 1]) B.add("timber", box(0.18, 2.6, 0.18, 1), E, s * 1.1, 1.3, 0);
  B.add("timber", cyl(0.08, 0.08, 2.4, 6, 1), E, 0, 2.2, 0, 0, 0, Math.PI / 2);
  for (const s of [-1, 1]) B.add("shingle", box(1.4, 0.1, 2.0), E, s * 0.6, 2.9, 0, Math.PI / 2, 0, s * rad(30));
}

function buildStatue(B, e, E) {
  const k = e.big ? 1.6 : 1;
  B.add("stone", box(2.2 * k, 1.4 * k, 2.2 * k), E, 0, 0.7 * k - 0.2, 0);
  B.add("stone", box(1.7 * k, 0.4 * k, 1.7 * k), E, 0, 1.5 * k, 0);
  // a robed, crowned figure leaning on a sword
  B.add("stone", cyl(0.35 * k, 0.75 * k, 2.4 * k, 10, 1), E, 0, 2.9 * k, 0);
  B.add("stone", cyl(0.42 * k, 0.32 * k, 0.9 * k, 10, 1), E, 0, 4.4 * k, 0);
  B.add("stone", new THREE.SphereGeometry(0.28 * k, 12, 10), E, 0, 5.05 * k, 0);
  for (const s of [-1, 1]) B.add("stone", cyl(0.12 * k, 0.1 * k, 1.1 * k, 6, 1), E, s * 0.42 * k, 4.2 * k, 0.15 * k, 0, rad(-25), s * rad(12));
  B.add("stone", box(0.1 * k, 2.2 * k, 0.04 * k, 1), E, 0, 3.0 * k, 0.65 * k);
  B.add("stone", box(0.6 * k, 0.08 * k, 0.1 * k, 1), E, 0, 4.0 * k, 0.65 * k);
  if (e.type === "king") B.add("gold", cyl(0.3 * k, 0.26 * k, 0.18 * k, 8, 1, true), E, 0, 5.3 * k, 0);
}

function buildWindmill(B, e, E, dyn, id) {
  B.add("stone", cyl(3.2, 4.3, 10, 12, 2), E, 0, 4.4, 0);
  B.add("shingle", cone(3.8, 3.6, 12), E, 0, 11.2, 0);
  B.add("planks", box(1.4, 2.2, 0.2, 1), E, 0, 1.1, 4.2);
  B.add("window", box(0.7, 0.8, 0.1), E, 0, 6, 3.7, 0, rad(-6));
  // sails rotate on a hub facing +Z
  const hub = new THREE.Group();
  hub.position.set(0, 8.6, 4.2);
  const pivot = new THREE.Group();
  pivot.position.set(e.x, e.y, e.z);
  pivot.rotation.y = e.rot;
  pivot.add(hub);
  const wood = new THREE.MeshStandardMaterial({ map: surface("timber").map, roughness: 0.9 });
  const sailM = new THREE.MeshStandardMaterial({ map: surface("cloth").map, color: 0xe6dcc6, roughness: 0.95, side: THREE.DoubleSide });
  for (let k = 0; k < 4; k++) {
    const arm = new THREE.Group();
    arm.rotation.z = (k * Math.PI) / 2;
    const spar = new THREE.Mesh(box(0.25, 8.5, 0.2, 1), wood);
    spar.position.y = 4.4;
    arm.add(spar);
    const sail = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 6.5), sailM);
    sail.position.set(0.95, 5.0, 0.05);
    arm.add(sail);
    for (let r = 0; r < 4; r++) {
      const rung = new THREE.Mesh(box(1.9, 0.08, 0.08, 1), wood);
      rung.position.set(0.95, 2.2 + r * 1.9, 0.08);
      arm.add(rung);
    }
    hub.add(arm);
  }
  const cap = new THREE.Mesh(cyl(0.45, 0.45, 0.8, 10), wood);
  cap.rotation.x = Math.PI / 2;
  hub.add(cap);
  hub.traverse((o) => o.isMesh && (o.castShadow = true));
  dyn.add(id, { obj: pivot, tick: (t) => (hub.rotation.z = -t * 0.35), mats: [wood, sailM] });
}

function buildWatchtower(B, e, E) {
  for (const sx of [-1.4, 1.4]) for (const sz of [-1.4, 1.4]) B.add("log", cyl(0.18, 0.22, 8, 7, 1.5), E, sx, 4, sz, 0, sz * 0.04, -sx * 0.04);
  B.add("planks", box(3.8, 0.2, 3.8, 1.5), E, 0, 6.4, 0);
  for (const [x, z, ry] of [
    [0, 1.9, 0],
    [0, -1.9, 0],
    [1.9, 0, Math.PI / 2],
    [-1.9, 0, Math.PI / 2],
  ])
    B.add("planks", box(3.8, 0.9, 0.08, 1.5), E, x, 7, z, ry);
  B.add("thatch", cone(3.1, 2.2, 4), E, 0, 9.4, 0, Math.PI / 4);
  for (const sx of [-1.4, 1.4]) for (const sz of [-1.4, 1.4]) B.add("log", cyl(0.1, 0.1, 1.6, 5), E, sx, 7.9, sz);
  for (let k = 0; k < 9; k++) B.add("log", box(0.6, 0.08, 0.08, 1), E, 0, 0.5 + k * 0.7, 2.2);
}

function buildFence(B, e, E) {
  const n = Math.max(1, Math.round(e.len / 2.4));
  for (let k = 0; k <= n; k++) B.add("log", cyl(0.07, 0.08, 1.25, 5, 1), E, -e.len / 2 + (k * e.len) / n, 0.55, 0);
  B.add("timber", box(e.len, 0.1, 0.06, 1), E, 0, 0.45, 0);
  B.add("timber", box(e.len, 0.1, 0.06, 1), E, 0, 0.95, 0);
}
function buildPalisade(B, e, E) {
  const n = Math.max(2, Math.round(e.len / 0.55));
  const R = rng(Math.round(e.x * 3 + e.z * 5));
  for (let k = 0; k < n; k++) {
    const x = -e.len / 2 + ((k + 0.5) * e.len) / n;
    const h = 3.1 + R() * 0.5;
    B.add("log", cyl(0.26, 0.28, h, 6, 1.5), E, x, h / 2 - 0.3, 0);
    B.add("log", cone(0.26, 0.6, 6, 1), E, x, h - 0.3 + 0.3, 0);
  }
  B.add("timber", box(e.len, 0.2, 0.15, 1), E, 0, 2.2, -0.3);
}

function buildWall(B, e, E) {
  const ruin = e.ruin ?? 1;
  const h = e.h * ruin;
  const mat = e.style === "ruin" ? "ruin" : "stone";
  B.add(mat, box(e.len + 0.2, h + 4, e.t, 2.4), E, 0, h / 2 - 2, 0);
  // plinth
  B.add(mat, box(e.len + 0.4, 1.2, e.t + 0.8, 2.4), E, 0, -0.2, 0);
  const R = rng(Math.round(e.x * 11 + e.z * 3));
  if (e.crenel && ruin > 0.75) {
    const n = Math.floor(e.len / 2.4);
    for (let k = 0; k < n; k++) {
      if (mat === "ruin" && R() < 0.35) continue;
      const x = -e.len / 2 + (k + 0.5) * (e.len / n);
      for (const s of [-1, 1]) B.add(mat, box(1.3, 1.2, 0.7, 2.4), E, x, h + 0.6, (s * (e.t - 0.7)) / 2);
    }
  }
  if (ruin < 0.99) {
    // jagged top and rubble at the foot
    for (let k = 0; k < 5; k++) {
      const x = -e.len / 2 + R() * e.len;
      B.add(mat, box(1 + R() * 2.4, 0.6 + R() * 2.2, e.t * (0.6 + R() * 0.4), 2.4), E, x, h + 0.2, 0, R() * 0.4, 0, (R() - 0.5) * 0.4);
    }
    for (let k = 0; k < 7; k++) B.add(mat, new THREE.DodecahedronGeometry(0.4 + R() * 0.7, 0), E, -e.len / 2 + R() * e.len, 0.2, (R() < 0.5 ? -1 : 1) * (e.t / 2 + 0.6 + R() * 1.6), R() * 3, R() * 3);
  }
  // arrow slits
  if (h > 7) for (let k = 0; k < Math.floor(e.len / 6); k++) for (const s of [-1, 1]) B.add("dark", box(0.25, 1.2, 0.1), E, -e.len / 2 + 3 + k * 6, h * 0.6, (s * e.t) / 2 + s * 0.03);
}

function buildTower(B, e, E) {
  const mat = e.style === "ruin" ? "ruin" : "stone";
  const { r, h } = e;
  B.add(mat, cyl(r, r * 1.08, h + 4, 18, 2.4), E, 0, h / 2 - 2, 0);
  B.add(mat, cyl(r * 1.15, r * 1.25, 1.4, 18, 2.4), E, 0, -0.1, 0);
  if (e.roof === "cone") {
    B.add(mat, cyl(r * 1.12, r * 1.05, 1.1, 18, 2.4), E, 0, h + 0.4, 0);
    B.add("slate", cone(r * 1.3, r * 2.2, 18, 2), E, 0, h + 0.9 + r * 1.1, 0);
    B.add("gold", cyl(0.06, 0.06, 2.2, 5, 1), E, 0, h + 0.9 + r * 2.2 + 0.8, 0);
  } else if (e.roof === "flat") {
    const n = Math.max(6, Math.round((Math.PI * 2 * r) / 2.4));
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      B.add(mat, box(1.2, 1.2, 0.7, 2.4), E, Math.cos(a) * (r - 0.3), h + 0.6, Math.sin(a) * (r - 0.3), -a + Math.PI / 2);
    }
  } else if (e.roof === "broken") {
    const R = rng(Math.round(e.x + e.z * 7));
    for (let k = 0; k < 6; k++) {
      const a = R() * Math.PI * 2;
      B.add(mat, box(1.6, 0.8 + R() * 2.6, 0.9, 2.4), E, Math.cos(a) * (r - 0.4), h + 0.6, Math.sin(a) * (r - 0.4), -a);
    }
  }
  for (let k = 0; k < 3; k++) {
    const a = k * 2.1 + 0.4;
    B.add("dark", box(0.3, 1.3, 0.2), E, Math.cos(a) * (r + 0.02), h * (0.35 + k * 0.2), Math.sin(a) * (r + 0.02), -a + Math.PI / 2);
  }
}

function buildGatehouse(B, e, E, dyn) {
  const mat = e.style === "ruin" ? "ruin" : "stone";
  const open = 6;
  const side = (e.w - open) / 2;
  for (const s of [-1, 1]) {
    B.add(mat, box(side, e.h + 4, e.t, 2.4), E, s * (open / 2 + side / 2), e.h / 2 - 2, 0);
    B.add(mat, cyl(side * 0.62, side * 0.68, e.h + 6, 14, 2.4), E, s * (open / 2 + side / 2), (e.h + 2) / 2 - 2, e.t * 0.35);
    B.add("slate", cone(side * 0.8, side * 1.6, 14), E, s * (open / 2 + side / 2), e.h + 3.5 + side * 0.4, e.t * 0.35);
  }
  B.add(mat, box(open, e.h - 5.6, e.t, 2.4), E, 0, 5.6 + (e.h - 5.6) / 2, 0);
  // arch
  const arch = new THREE.TorusGeometry(open / 2, 0.45, 6, 16, Math.PI);
  B.add(mat, planarUV(arch, 2), E, 0, 5.6 - open / 2 + 0.2, e.t / 2 + 0.2);
  for (let k = 0; k < Math.floor(e.w / 2.4); k++) for (const s of [-1, 1]) B.add(mat, box(1.2, 1.2, 0.8, 2.4), E, -e.w / 2 + 1.2 + k * 2.4, e.h + 0.6, (s * (e.t - 0.8)) / 2);
  // dynamic portcullis / doors
  const g = new THREE.Group();
  const iron = new THREE.MeshStandardMaterial({ map: surface("metal").map, color: 0x45464c, roughness: 0.5, metalness: 0.85 });
  const wood = new THREE.MeshStandardMaterial({ map: surface("planks").map, normalMap: surface("planks").normalMap, roughness: 0.85 });
  const holder = new THREE.Group();
  holder.position.set(e.x, e.y, e.z);
  holder.rotation.y = e.rot;
  holder.add(g);
  if (e.style === "ruin") {
    // heavy double doors
    const leaves = [];
    for (const s of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set((s * open) / 2, 0, 0.2);
      const leaf = new THREE.Mesh(box(open / 2, 5.6, 0.35, 1), wood);
      leaf.position.set((-s * open) / 4, 2.8, 0);
      for (let b = 0; b < 3; b++) {
        const band = new THREE.Mesh(box(open / 2, 0.18, 0.4, 1), iron);
        band.position.set((-s * open) / 4, 0.8 + b * 2, 0);
        pivot.add(band);
      }
      leaf.castShadow = true;
      pivot.add(leaf);
      g.add(pivot);
      leaves.push([pivot, s]);
    }
    let k = e.open ? 1 : 0;
    dyn.add(e.gate, {
      obj: holder,
      mats: [iron, wood],
      update: (st, dt) => {
        k += ((st.open ? 1 : 0) - k) * Math.min(1, dt * 1.6);
        for (const [p, s] of leaves) p.rotation.y = s * k * 1.7;
      },
    });
  } else {
    const grid = new THREE.Group();
    for (let i = 0; i < 7; i++) {
      const bar = new THREE.Mesh(box(0.12, 5.6, 0.12, 1), iron);
      bar.position.set(-open / 2 + 0.4 + (i * (open - 0.8)) / 6, 2.8, 0);
      grid.add(bar);
    }
    for (let j = 0; j < 6; j++) {
      const bar = new THREE.Mesh(box(open - 0.4, 0.1, 0.1, 1), iron);
      bar.position.set(0, 0.5 + j * 1, 0);
      grid.add(bar);
    }
    grid.traverse((o) => o.isMesh && (o.castShadow = true));
    g.add(grid);
    let k = e.open ? 1 : 0;
    dyn.add(e.gate, {
      obj: holder,
      mats: [iron, wood],
      update: (st, dt) => {
        k += ((st.open ? 1 : 0) - k) * Math.min(1, dt * 1.2);
        grid.position.y = k * 5.0;
      },
    });
  }
}

function buildKeep(B, e, E) {
  const { w, d, h } = e;
  B.add("stone", box(w, h + 4, d, 2.4), E, 0, h / 2 - 2, 0);
  B.add("stone", box(w + 1, 1.6, d + 1, 2.4), E, 0, 0, 0);
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) B.add("stone", box(2.6, h + 5, 2.6, 2.4), E, (sx * w) / 2, (h + 1) / 2 - 2, (sz * d) / 2);
  const n = Math.floor(w / 2.4);
  for (let k = 0; k < n; k++)
    for (const sz of [-1, 1]) B.add("stone", box(1.3, 1.3, 0.8, 2.4), E, -w / 2 + 1.2 + k * 2.4, h + 0.65, (sz * (d - 0.8)) / 2);
  const m = Math.floor(d / 2.4);
  for (let k = 0; k < m; k++)
    for (const sx of [-1, 1]) B.add("stone", box(0.8, 1.3, 1.3, 2.4), E, (sx * (w - 0.8)) / 2, h + 0.65, -d / 2 + 1.2 + k * 2.4);
  // great door + windows
  B.add("planks", box(3.6, 5, 0.3, 1), E, 0, 2.5, d / 2 + 0.1);
  B.add("stone", planarUV(new THREE.TorusGeometry(1.9, 0.35, 6, 12, Math.PI), 2), E, 0, 5, d / 2 + 0.2);
  for (let f = 0; f < 3; f++)
    for (let k = 0; k < 4; k++) {
      const x = -w / 2 + 4 + k * ((w - 8) / 3);
      if (f === 0 && Math.abs(x) < 3) continue;
      B.add("window", box(0.9, 1.8, 0.12), E, x, 6 + f * 5, d / 2 + 0.05);
      B.add("window", box(0.9, 1.8, 0.12), E, x, 6 + f * 5, -d / 2 - 0.05);
    }
}

function buildRuinKeep(B, e, E) {
  const { w, d, h } = e;
  const t = 1.8;
  const gap = 6;
  const side = (e.w - gap) / 4;
  B.add("ruin", box(w, h + 3, t, 2.4), E, 0, h / 2 - 1.5, -d / 2);
  B.add("ruin", box(t, h * 0.7 + 3, d, 2.4), E, -w / 2, (h * 0.7) / 2 - 1.5, 0);
  B.add("ruin", box(t, h * 0.85 + 3, d, 2.4), E, w / 2, (h * 0.85) / 2 - 1.5, 0);
  B.add("ruin", box(side * 2, h * 0.5 + 3, t, 2.4), E, -(gap / 2 + side), (h * 0.5) / 2 - 1.5, d / 2);
  B.add("ruin", box(side * 2, h * 0.6 + 3, t, 2.4), E, gap / 2 + side, (h * 0.6) / 2 - 1.5, d / 2);
  const R = rng(91);
  for (let k = 0; k < 6; k++) B.add("log", cyl(0.2, 0.22, 7 + R() * 4, 6, 1.5), E, -w / 3 + R() * (w * 0.66), 2 + R() * 3, -d / 4 + R() * (d / 2), R() * 3, rad(60 + R() * 40), 0, "#3a2a20");
  for (let k = 0; k < 14; k++) B.add("ruin", new THREE.DodecahedronGeometry(0.5 + R() * 0.9, 0), E, -w / 2 + R() * w, 0.2, -d / 2 + R() * d, R() * 3, R() * 3);
  B.add("cobble", box(w, 0.1, d, 2), E, 0, 0.06, 0);
}

function buildCryptHut(B, e, E) {
  B.add("ruin", box(5.2, 4.2, 5.2, 2.4), E, 0, 1.8, 0);
  B.add("ruin", cone(4.2, 2.2, 4), E, 0, 5.0, 0, Math.PI / 4);
  for (const sx of [-1.8, 1.8]) B.add("ruin", cyl(0.35, 0.4, 4, 10, 2), E, sx, 2, 3.1);
  B.add("ruin", box(5, 0.6, 1.4, 2.4), E, 0, 4.1, 3.1);
  B.add("dark", box(2.2, 3, 0.1), E, 0, 1.5, 2.62);
  B.add("ruin", box(3, 0.3, 1.4, 2), E, 0, 0.1, 3.4);
}

function buildTent(B, e, E) {
  const { w, d } = e;
  if (e.style === "ridge") {
    const h = 2.6;
    const slab = Math.hypot(h, w / 2);
    for (const s of [-1, 1]) B.add("cloth", box(slab, 0.04, d, 1.5), E, (s * w) / 4, h / 2, 0, 0, 0, -s * Math.atan2(h, w / 2), e.color);
    B.add("cloth", gable(w, h, 0.04), E, 0, 0, -d / 2, 0, 0, 0, e.color);
    B.add("dark", gable(w * 0.5, h * 0.7, 0.05), E, 0, 0, d / 2, 0, 0, 0);
    for (const z of [-d / 2, d / 2]) B.add("log", cyl(0.06, 0.06, h + 0.3, 5), E, 0, (h + 0.3) / 2, z);
  } else if (e.style === "round") {
    const r = w / 2;
    B.add("cloth", cyl(r, r, 2.2, 14, 1.5, true), E, 0, 1.1, 0, 0, 0, 0, e.color);
    B.add("cloth", cone(r * 1.08, 2.4, 14, 1.5), E, 0, 3.4, 0, 0, 0, 0, e.color);
    B.add("gold", new THREE.SphereGeometry(0.18, 8, 6), E, 0, 4.7, 0);
    B.add("dark", box(1.2, 1.8, 0.1), E, 0, 0.9, r + 0.02);
  } else {
    // pavilion: tall walls, peaked roof, striped valance, gold finials
    B.add("cloth", box(w, 3.6, d, 2), E, 0, 1.8, 0, 0, 0, 0, e.color);
    const rh = 3.4;
    const slab = Math.hypot(rh, d / 2) + 0.3;
    for (const s of [-1, 1]) B.add("cloth", box(w + 0.8, 0.05, slab, 2), E, 0, 3.6 + rh / 2, (s * d) / 4, 0, s * Math.atan2(rh, d / 2), 0, "#c9a227");
    for (const s of [-1, 1]) B.add("cloth", gable(d + 0.8, rh, 0.05), E, (s * (w + 0.8)) / 2, 3.6, 0, Math.PI / 2, 0, 0, "#c9a227");
    for (let k = 0; k < Math.floor(w / 1.2); k++) B.add("cloth", box(1.2, 0.6, 0.05, 1), E, -w / 2 + 0.6 + k * 1.2, 3.3, d / 2 + 0.42, 0, 0, 0, k % 2 ? "#c9a227" : e.color);
    for (const sx of [-1, 1]) B.add("gold", cyl(0.1, 0.1, 9, 6), E, (sx * w) / 2.5, 4.5, 0);
    B.add("dark", box(2.4, 3, 0.1), E, 0, 1.5, d / 2 + 0.03);
    for (const sx of [-2.2, 2.2]) B.add("gold", cyl(0.12, 0.12, 3.6, 8), E, sx, 1.8, d / 2 + 0.3);
  }
}

function buildBridge(B, e, E) {
  const ramp = 5;
  const mid = e.len / 2 - ramp;
  B.add("cobble", box(e.w, 0.5, mid * 2, 2), E, 0, -0.25, 0);
  for (const s of [-1, 1]) {
    // ramps (local frame: E sits at the deck height)
    const dy = (s < 0 ? e.yA : e.yB) - e.deck;
    const ang = Math.atan2(-dy, ramp);
    B.add("cobble", box(e.w, 0.5, Math.hypot(ramp, dy) + 0.3, 2), E, 0, dy / 2 - 0.25, s * (mid + ramp / 2), 0, s * ang);
  }
  for (const sx of [-1, 1]) {
    B.add("stone", box(0.5, 1.1, mid * 2, 2), E, (sx * e.w) / 2, 0.55, 0);
    B.add("stone", box(0.7, 0.2, mid * 2 + 0.2, 2), E, (sx * e.w) / 2, 1.15, 0);
  }
  // the arch underneath
  const arch = new THREE.TorusGeometry(mid * 1.05, 0.9, 6, 18, Math.PI);
  for (const sx of [-1, 1]) B.add("stone", planarUV(arch.clone(), 2), E, (sx * (e.w - 0.6)) / 2, -0.6, 0, Math.PI / 2, 0, Math.PI);
  B.add("stone", box(e.w, 1.2, mid * 2, 2), E, 0, -1.2, 0);
}

function buildProp(B, e, E, dyn, ctx) {
  const R = rng(Math.round(e.x * 13 + e.z * 7));
  switch (e.kind) {
    case "crate":
      B.add("planks", box(1, 1, 1, 1), E, 0, 0.5, 0);
      B.add("timber", box(1.04, 0.12, 1.04, 1), E, 0, 0.92, 0);
      break;
    case "barrel":
      B.add("planks", cyl(0.42, 0.38, 1.0, 12, 1), E, 0, 0.5, 0);
      B.add("metal", cyl(0.44, 0.44, 0.06, 12, 1, true), E, 0, 0.25, 0);
      B.add("metal", cyl(0.44, 0.44, 0.06, 12, 1, true), E, 0, 0.75, 0);
      break;
    case "cart":
      B.add("planks", box(2.4, 0.6, 1.5, 1), E, 0, 0.9, 0);
      for (const s of [-1, 1]) B.add("timber", cyl(0.55, 0.55, 0.12, 12, 1), E, 0.3, 0.55, s * 0.82, 0, Math.PI / 2);
      B.add("timber", box(1.6, 0.1, 0.1, 1), E, 1.9, 0.7, 0.3);
      B.add("timber", box(1.6, 0.1, 0.1, 1), E, 1.9, 0.7, -0.3);
      if (!e.mine) B.add("thatch", box(1.8, 0.5, 1.2), E, 0, 1.35, 0, 0, 0, 0, "#d8c070");
      else for (let k = 0; k < 4; k++) B.add("rock", new THREE.DodecahedronGeometry(0.3, 0), E, -0.6 + k * 0.4, 1.3, 0, k, k);
      break;
    case "hay":
      B.add("thatch", cyl(0.9, 0.9, 1.6, 14, 1.5), E, 0, 0.9, 0, 0, 0, Math.PI / 2, "#e0c878");
      break;
    case "logpile":
      for (let k = 0; k < 6; k++) B.add("log", cyl(0.2, 0.2, 2.2, 8, 1), E, -0.6 + (k % 3) * 0.42 + (k > 2 ? 0.21 : 0), 0.22 + (k > 2 ? 0.36 : 0), 0, 0, 0, Math.PI / 2);
      break;
    case "anvil":
      B.add("metal", box(0.9, 0.35, 0.4, 1), E, 0, 0.85, 0);
      B.add("log", cyl(0.3, 0.35, 0.7, 8), E, 0, 0.35, 0);
      break;
    case "rack":
      for (const s of [-1, 1]) B.add("timber", box(0.12, 1.8, 0.12, 1), E, s * 1, 0.9, 0);
      B.add("timber", box(2.2, 0.1, 0.12, 1), E, 0, 1.5, 0);
      B.add("timber", box(2.2, 0.1, 0.12, 1), E, 0, 0.5, 0);
      for (let k = 0; k < 4; k++) B.add("metal", box(0.06, 1.6, 0.12, 1), E, -0.75 + k * 0.5, 1.0, 0.1, 0, 0, (k - 1.5) * 0.06);
      break;
    case "dummy":
      B.add("log", cyl(0.08, 0.08, 1.8, 6), E, 0, 0.9, 0);
      B.add("thatch", cyl(0.3, 0.32, 0.8, 10, 1), E, 0, 1.4, 0, 0, 0, 0, "#c8b070");
      B.add("thatch", new THREE.SphereGeometry(0.2, 8, 6), E, 0, 2.0, 0, 0, 0, 0, "#c8b070");
      B.add("log", cyl(0.05, 0.05, 1.2, 5), E, 0, 1.6, 0, 0, 0, Math.PI / 2);
      break;
    case "scarecrow":
      B.add("log", cyl(0.06, 0.06, 2.4, 6), E, 0, 1.2, 0);
      B.add("log", cyl(0.05, 0.05, 1.6, 5), E, 0, 1.8, 0, 0, 0, Math.PI / 2);
      B.add("cloth", box(0.7, 0.8, 0.3, 1), E, 0, 1.5, 0, 0, 0, 0, "#6a5a3a");
      B.add("thatch", new THREE.SphereGeometry(0.22, 8, 6), E, 0, 2.2, 0, 0, 0, 0, "#c8b070");
      B.add("thatch", cone(0.35, 0.35, 8), E, 0, 2.45, 0, 0, 0, 0, "#8a6a3a");
      break;
    case "lamp":
      B.add("metal", cyl(0.06, 0.08, 2.6, 6), E, 0, 1.3, 0);
      B.add("metal", box(0.36, 0.42, 0.36, 1), E, 0, 2.75, 0);
      B.add("window", box(0.28, 0.32, 0.38), E, 0, 2.75, 0);
      break;
    case "signpost":
      B.add("log", cyl(0.08, 0.1, 2.6, 6), E, 0, 1.3, 0);
      B.add("planks", box(1.4, 0.32, 0.06, 1), E, 0.55, 2.2, 0, 0, 0, 0.05);
      break;
    case "campfire":
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        B.add("rock", new THREE.DodecahedronGeometry(0.22, 0), E, Math.cos(a) * 0.7, 0.1, Math.sin(a) * 0.7, a, a);
      }
      for (let k = 0; k < 4; k++) B.add("log", cyl(0.08, 0.08, 1.0, 6), E, 0, 0.25, 0, (k / 4) * Math.PI, 0, rad(70));
      B.add("ember", new THREE.CircleGeometry(0.45, 10).rotateX(-Math.PI / 2), E, 0, 0.06, 0);
      ctx.fires.push({ x: e.x, y: e.y + 0.4, z: e.z, s: e.big ? 1.8 : 1, kind: "campfire" });
      break;
    case "brazier": {
      for (let k = 0; k < 3; k++) B.add("metal", cyl(0.04, 0.04, 1.2, 4), E, Math.cos(k * 2.1) * 0.3, 0.55, Math.sin(k * 2.1) * 0.3, 0, Math.sin(k * 2.1) * 0.3, -Math.cos(k * 2.1) * 0.3);
      B.add("metal", cyl(0.55, 0.3, 0.4, 12, 1, true), E, 0, 1.15, 0);
      B.add("ember", new THREE.CircleGeometry(0.5, 12).rotateX(-Math.PI / 2), E, 0, 1.25, 0);
      ctx.fires.push({ x: e.x, y: e.y + 1.35, z: e.z, s: 0.8, kind: "brazier", ember: e.ember });
      break;
    }
    case "boulder":
      B.add("rock", jitterGeo(new THREE.IcosahedronGeometry(e.r, 1), 0.3, e.x), E, 0, e.r * 0.3, 0, e.rot, 0.2, 0, null, new THREE.Vector3(1.1, 0.75, 1));
      break;
    case "rubble":
      for (let k = 0; k < 9; k++) B.add("ruin", new THREE.DodecahedronGeometry(0.3 + R() * 0.6, 0), E, (R() - 0.5) * 3, 0.15 + R() * 0.4, (R() - 0.5) * 3, R() * 3, R() * 3);
      break;
    case "bones":
      for (let k = 0; k < 5; k++) B.add("bone", cyl(0.05, 0.05, 0.6 + R() * 0.4, 5, 1), E, (R() - 0.5) * 1.6, 0.06, (R() - 0.5) * 1.6, R() * 3, 0, Math.PI / 2);
      B.add("bone", new THREE.SphereGeometry(0.16, 8, 6), E, 0.3, 0.12, 0.2);
      break;
    case "caveMouth":
      for (const [x, s] of [
        [-3.6, 2.8],
        [3.6, 2.8],
        [0, 3.4],
      ])
        B.add("rock", jitterGeo(new THREE.IcosahedronGeometry(s, 1), 0.3, x + e.x), E, x, x === 0 ? 5.5 : 2, x === 0 ? -1.5 : 0, R(), 0, 0, null, new THREE.Vector3(1, x === 0 ? 0.6 : 1.1, 1));
      B.add("rock", jitterGeo(new THREE.IcosahedronGeometry(6, 1), 0.25, e.z), E, 0, 2.5, -4.5, 0, 0, 0, null, new THREE.Vector3(1.4, 1, 0.8));
      B.add("dark", new THREE.CircleGeometry(2.6, 12), E, 0, 2.3, -1.0);
      break;
    case "monolith":
      B.add("stone", box(1.3, e.h, 0.8, 2), E, 0, e.h / 2 - 0.4, 0, 0, e.tilt || 0, (e.tilt || 0) * 0.5, "#9a9a92");
      B.add("glow", box(0.08, e.h * 0.5, 0.82), E, 0, e.h * 0.45, 0, 0, e.tilt || 0, 0);
      break;
    case "pillar":
      B.add("stone", cyl(1.2, 1.35, e.h, 14, 2), E, 0, e.h / 2 - 0.5, 0, 0, 0, 0, "#8a7e74");
      B.add("stone", box(3, 0.8, 3, 2), E, 0, -0.1, 0, 0, 0, 0, "#8a7e74");
      if (e.broken) for (let k = 0; k < 3; k++) B.add("stone", cyl(1.1, 1.2, 1.2, 10, 2), E, 2 + k * 1.6, 0.6, 1 - k, R() * 3, Math.PI / 2, R(), "#8a7e74");
      else B.add("stone", box(3.2, 0.9, 3.2, 2), E, 0, e.h - 0.05, 0, 0, 0, 0, "#8a7e74");
      break;
    case "altar":
      B.add("stone", box(4.4, 1.2, 2.8, 2), E, 0, 0.6, 0, 0, 0, 0, "#6a5e56");
      B.add("stone", box(6, 0.4, 4.4, 2), E, 0, 0.1, 0, 0, 0, 0, "#6a5e56");
      B.add("ember", box(3, 0.06, 0.4), E, 0, 1.23, 0);
      break;
    case "dragonSkull": {
      const bone = "bone";
      B.add(bone, new THREE.SphereGeometry(2.6, 14, 10).scale(1, 0.8, 1.3), E, 0, 2, 0);
      B.add(bone, new THREE.ConeGeometry(1.6, 4.4, 10).rotateX(Math.PI / 2), E, 0, 1.6, 3.6);
      for (const s of [-1, 1]) {
        B.add(bone, new THREE.ConeGeometry(0.5, 4.2, 8), E, s * 1.6, 4, -1.4, 0, -0.8, s * 0.4);
        B.add("dark", new THREE.SphereGeometry(0.6, 8, 6), E, s * 1.1, 2.6, 1.9);
      }
      for (let k = 0; k < 6; k++) B.add(bone, new THREE.ConeGeometry(0.16, 0.8, 5).rotateX(Math.PI), E, -1 + k * 0.4, 0.6, 3.8 + Math.abs(k - 2.5) * -0.2);
      break;
    }
    case "mineEntrance":
      B.add("rock", jitterGeo(new THREE.IcosahedronGeometry(7, 1), 0.2, 33), E, 0, 2.5, -5, 0, 0, 0, null, new THREE.Vector3(1.3, 1, 0.9));
      for (const s of [-1, 1]) B.add("log", cyl(0.25, 0.25, 4.4, 8), E, s * 2, 2.2, -1);
      B.add("log", cyl(0.25, 0.25, 4.8, 8), E, 0, 4.4, -1, 0, 0, Math.PI / 2);
      B.add("dark", new THREE.PlaneGeometry(3.6, 4.2), E, 0, 2.1, -1.2);
      for (const s of [-0.5, 0.5]) B.add("metal", box(0.08, 0.08, 6, 1), E, s, 0.05, 2);
      break;
    case "dock":
      B.add("planks", box(2.6, 0.2, 12, 2), E, 0, (e.deckY ?? e.y) - e.y, 5);
      for (let k = 0; k < 4; k++) for (const s of [-1, 1]) B.add("log", cyl(0.15, 0.15, 3, 6), E, s * 1.2, (e.deckY ?? e.y) - e.y - 1.4, 0.5 + k * 3.4);
      break;
    case "stairs":
      for (let k = 0; k < 6; k++) B.add("stone", box(e.w, (e.h * (k + 1)) / 6, e.d / 6, 2), E, 0, (e.h * (k + 1)) / 12, e.d / 2 - (k + 0.5) * (e.d / 6));
      break;
    case "cabin":
      buildCabin(B, e, E);
      break;
    default:
      break;
  }
}

function buildCabin(B, e, E) {
  const { w, d } = e;
  for (let k = 0; k < 9; k++) {
    const y = 0.15 + k * 0.34;
    B.add("log", cyl(0.18, 0.18, w + 0.6, 8, 1.5), E, 0, y, d / 2, 0, 0, Math.PI / 2);
    B.add("log", cyl(0.18, 0.18, w + 0.6, 8, 1.5), E, 0, y, -d / 2, 0, 0, Math.PI / 2);
    B.add("log", cyl(0.18, 0.18, d + 0.6, 8, 1.5), E, w / 2, y + 0.17, 0, 0, Math.PI / 2);
    B.add("log", cyl(0.18, 0.18, d + 0.6, 8, 1.5), E, -w / 2, y + 0.17, 0, 0, Math.PI / 2);
  }
  B.add("planks", box(w - 0.2, 3.1, d - 0.2, 2), E, 0, 1.55, 0, 0, 0, 0, "#6a5040");
  const rh = 2.2;
  const slab = Math.hypot(rh, d / 2) + 0.5;
  for (const s of [-1, 1]) B.add("shingle", box(w + 1.2, 0.16, slab, 2), E, 0, 3.2 + rh / 2, (s * d) / 4, 0, s * Math.atan2(rh, d / 2), 0);
  for (const s of [-1, 1]) B.add("log", gable(d, rh, 0.3), E, (s * w) / 2, 3.2, 0, Math.PI / 2);
  B.add("planks", box(1.2, 2.1, 0.12, 1), E, 0, 1.05, d / 2 + 0.2);
  B.add("window", box(0.8, 0.7, 0.1), E, w / 4, 1.8, d / 2 + 0.2);
  B.add("stone", box(1, 5, 1), E, -w / 2 - 0.3, 2.5, 0);
  e.smoke = [-w / 2 - 0.3, 5.3, 0];
}

function jitterGeo(g, amt, seed) {
  const p = g.attributes.position;
  const R = rng(Math.round(Math.abs(seed) * 1000) + 3);
  const off = new Map();
  for (let i = 0; i < p.count; i++) {
    const k = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
    if (!off.has(k)) off.set(k, 1 + (R() - 0.5) * amt * 2);
    const f = off.get(k);
    p.setXYZ(i, p.getX(i) * f, p.getY(i) * f, p.getZ(i) * f);
  }
  g.computeVertexNormals();
  return planarUV(g, 3);
}

/* ================================================================ dynamic interactables */
function dynMats() {
  const t = (k) => surface(k);
  return {
    wood: new THREE.MeshStandardMaterial({ map: t("planks").map, normalMap: t("planks").normalMap, roughness: 0.85 }),
    iron: new THREE.MeshStandardMaterial({ map: t("metal").map, color: 0x4a4a52, roughness: 0.45, metalness: 0.85 }),
    gold: new THREE.MeshStandardMaterial({ map: t("metal").map, color: 0xd8b25a, roughness: 0.3, metalness: 1 }),
    stone: new THREE.MeshStandardMaterial({ map: t("stone").map, normalMap: t("stone").normalMap, roughness: 0.9 }),
    crystal: new THREE.MeshStandardMaterial({ color: 0x9fd8ff, emissive: 0x3a90d0, emissiveIntensity: 0.9, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.92 }),
    obsidian: new THREE.MeshStandardMaterial({ color: 0x1e1820, roughness: 0.2, metalness: 0.4 }),
    rune: new THREE.MeshStandardMaterial({ color: 0x300808, emissive: 0xff3010, emissiveIntensity: 2.5, roughness: 0.4 }),
    flame: new THREE.MeshStandardMaterial({ color: 0x401008, emissive: 0xff7a2a, emissiveIntensity: 0, roughness: 0.6 }),
    heart: new THREE.MeshStandardMaterial({ color: 0x601010, emissive: 0xff4020, emissiveIntensity: 2.6, roughness: 0.2, metalness: 0.3 }),
  };
}

function interactableVisual(e, M, dyn, ctx) {
  const g = new THREE.Group();
  g.position.set(e.x, e.y, e.z);
  g.rotation.y = e.rot || 0;
  const add = (geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, parent = g) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  };
  switch (e.kind) {
    case "chest": {
      add(box(1.2, 0.6, 0.8, 1), M.wood, 0, 0.3, 0);
      for (const x of [-0.45, 0.45]) add(box(0.08, 0.64, 0.84, 1), M.iron, x, 0.3, 0);
      const lid = new THREE.Group();
      lid.position.set(0, 0.6, -0.4);
      g.add(lid);
      add(box(1.22, 0.24, 0.82, 1), M.wood, 0, 0.12, 0.4, 0, 0, 0, lid);
      add(box(0.18, 0.18, 0.06, 1), M.gold, 0, 0.0, 0.83, 0, 0, 0, lid);
      let k = 0;
      dyn.add(e.id, { obj: g, update: (st, dt) => ((k += ((st.looted ? 1 : 0) - k) * Math.min(1, dt * 4)), (lid.rotation.x = -k * 1.9)) });
      break;
    }
    case "shrine": {
      add(cyl(0.45, 0.6, 1.4, 8, 1), M.stone, 0, 0.7, 0);
      add(cyl(0.6, 0.35, 0.3, 10, 1), M.stone, 0, 1.55, 0);
      const fl = add(new THREE.ConeGeometry(0.25, 0.7, 8), M.flame, 0, 1.95, 0);
      for (let k = 0; k < 4; k++) add(box(0.5, 2.2, 0.3, 1), M.stone, Math.cos(k * 1.57) * 0.95, 1.1, Math.sin(k * 1.57) * 0.95, 0, -k * 1.57, 0);
      dyn.add(e.id, {
        obj: g,
        update: (st, dt, t) => {
          fl.visible = !!st.lit;
          M.flame.emissiveIntensity = 2.8;
          fl.scale.set(1, 0.85 + Math.sin(t * 9) * 0.15, 1);
        },
      });
      ctx.shrines.push(e);
      break;
    }
    case "oreNode": {
      add(jitterGeo(new THREE.IcosahedronGeometry(0.9, 1), 0.25, e.x), M.stone, 0, 0.3, 0);
      const crystals = new THREE.Group();
      g.add(crystals);
      for (let k = 0; k < 6; k++) add(new THREE.OctahedronGeometry(0.22 + (k % 3) * 0.08, 0).scale(0.6, 2, 0.6), M.crystal, Math.cos(k) * 0.5, 0.8 + (k % 2) * 0.2, Math.sin(k) * 0.5, k * 0.3, k, 0.3, crystals);
      dyn.add(e.id, { obj: g, update: (st) => (crystals.visible = !st.mined) });
      break;
    }
    case "cage": {
      add(box(2.4, 0.15, 2.4, 1), M.wood, 0, 0.08, 0);
      add(box(2.4, 0.15, 2.4, 1), M.wood, 0, 2.4, 0);
      for (let k = 0; k < 7; k++)
        for (const [x, z, ry] of [
          [-1.15 + k * 0.38, -1.15, 0],
          [-1.15, -1.15 + k * 0.38, 0],
          [1.15, -1.15 + k * 0.38, 0],
        ])
          add(cyl(0.05, 0.05, 2.3, 5, 1), M.wood, x, 1.2, z, 0, ry, 0);
      const door = new THREE.Group();
      door.position.set(-1.15, 0, 1.15);
      g.add(door);
      for (let k = 0; k < 7; k++) add(cyl(0.05, 0.05, 2.3, 5, 1), M.wood, k * 0.38, 1.2, 0, 0, 0, 0, door);
      let k = 0;
      dyn.add(e.id, { obj: g, update: (st, dt) => ((k += ((st.open ? 1 : 0) - k) * Math.min(1, dt * 3)), (door.rotation.y = k * 1.8)) });
      break;
    }
    case "lever": {
      add(box(0.5, 0.8, 0.3, 1), M.stone, 0, 0.4, 0);
      const arm = new THREE.Group();
      arm.position.set(0, 0.8, 0);
      g.add(arm);
      add(cyl(0.04, 0.04, 0.9, 6), M.iron, 0, 0.45, 0, 0, 0, 0, arm);
      add(new THREE.SphereGeometry(0.08, 8, 6), M.iron, 0, 0.9, 0, 0, 0, 0, arm);
      let k = 0;
      dyn.add(e.id, { obj: g, update: (st, dt) => ((k += ((st.pulled ? 1 : 0) - k) * Math.min(1, dt * 5)), (arm.rotation.x = -0.7 + k * 1.4)) });
      break;
    }
    case "grate": {
      add(jitterGeo(new THREE.IcosahedronGeometry(3.4, 1), 0.2, 71), new THREE.MeshStandardMaterial({ map: surface("rock").map, roughness: 0.95 }), 0, 1.6, -2.2);
      add(new THREE.PlaneGeometry(1.9, 2.1), new THREE.MeshBasicMaterial({ color: 0x030303 }), 0, 1.05, 0.85);
      const grate = new THREE.Group();
      grate.position.set(-1, 0, 0.95);
      g.add(grate);
      for (let k = 0; k < 6; k++) add(cyl(0.04, 0.04, 2.1, 5), M.iron, 0.18 + k * 0.33, 1.05, 0, 0, 0, 0, grate);
      for (let k = 0; k < 3; k++) add(box(2, 0.06, 0.06, 1), M.iron, 1, 0.3 + k * 0.75, 0, 0, 0, 0, grate);
      let k = 0;
      dyn.add(e.id, { obj: g, update: (st, dt) => ((k += ((st.open ? 1 : 0) - k) * Math.min(1, dt * 3)), (grate.rotation.y = -k * 1.6)) });
      break;
    }
    case "trapdoor": {
      add(box(1.8, 0.1, 1.8, 1), M.stone, 0, 0.02, 0);
      const hatch = new THREE.Group();
      hatch.position.set(0, 0.1, -0.7);
      g.add(hatch);
      add(box(1.4, 0.1, 1.4, 1), M.wood, 0, 0, 0.7, 0, 0, 0, hatch);
      add(box(1.4, 0.12, 0.12, 1), M.iron, 0, 0.05, 0.4, 0, 0, 0, hatch);
      let k = 0;
      dyn.add(e.id, { obj: g, update: (st, dt) => ((k += ((st.open ? 1 : 0) - k) * Math.min(1, dt * 3)), (hatch.rotation.x = -k * 1.8)) });
      break;
    }
    case "ballista": {
      const base = add(box(1.6, 0.4, 2, 1), M.wood, 0, 0.3, 0);
      void base;
      const turret = new THREE.Group();
      turret.position.set(0, 0.9, 0);
      g.add(turret);
      add(box(0.3, 0.3, 2.6, 1), M.wood, 0, 0, 0.2, 0, 0, 0, turret);
      for (const s of [-1, 1]) add(box(1.6, 0.14, 0.14, 1), M.wood, s * 0.8, 0, 1.2, 0, s * 0.35, 0, turret);
      const bolt = add(cyl(0.05, 0.05, 2.4, 6), M.iron, 0, 0.2, 0.6, Math.PI / 2, 0, 0, turret);
      add(cyl(0.1, 0.1, 1, 6), M.wood, 0, -0.4, 0, 0, 0, 0, turret);
      dyn.add(e.id, {
        obj: g,
        update: (st) => {
          bolt.visible = !st.cooldown;
          if (st.aimYaw != null) turret.rotation.y = st.aimYaw - (e.rot || 0);
        },
      });
      break;
    }
    case "anchor": {
      const spike = new THREE.Group();
      g.add(spike);
      add(new THREE.ConeGeometry(1.1, 5.4, 6), M.obsidian, 0, 2.7, 0, 0, 0, 0, spike);
      for (let k = 0; k < 3; k++) add(box(0.12, 1.4, 0.6), M.rune, Math.cos(k * 2.1) * 0.62, 1.6 + k * 0.4, Math.sin(k * 2.1) * 0.62, 0, -k * 2.1, 0.18, spike);
      // chains reaching up toward the peak
      for (let k = 0; k < 6; k++) add(new THREE.TorusGeometry(0.22, 0.06, 5, 8), M.iron, 0, 5.4 + k * 0.38, 0, k % 2 ? Math.PI / 2 : 0, 0, 0, spike);
      const shards = new THREE.Group();
      g.add(shards);
      for (let k = 0; k < 6; k++) add(new THREE.TetrahedronGeometry(0.5, 0), M.obsidian, Math.cos(k) * 1.4, 0.2, Math.sin(k) * 1.4, k, k, 0, shards);
      dyn.add(e.id, {
        obj: g,
        update: (st) => {
          spike.visible = !st.destroyed;
          shards.visible = !!st.destroyed;
        },
      });
      break;
    }
    case "oreless":
      break;
    default:
      return null;
  }
  return g;
}

/* ================================================================ banners */
function createBanners(scene, list, shared) {
  const group = new THREE.Group();
  const poleMat = new THREE.MeshStandardMaterial({ map: surface("timber").map, roughness: 0.8 });
  const mats = new Map();
  for (const b of list) {
    const key = `${b.sigil}:${b.color}`;
    if (!mats.has(key)) {
      const m = new THREE.MeshStandardMaterial({ map: sigilTex(b.sigil, b.color), roughness: 0.85, side: THREE.DoubleSide });
      m.onBeforeCompile = (sh) => {
        sh.uniforms.uTime = shared.time;
        sh.uniforms.uWind = shared.wind;
        sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nuniform float uTime; uniform float uWind;").replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>
  float fall = 1.0 - uv.y;
  float ph = modelMatrix[3].x * 0.7 + modelMatrix[3].z * 0.3;
  transformed.z += sin(uTime * 2.6 + uv.y * 4.0 + ph + uv.x * 2.0) * 0.12 * (0.4 + fall) * (0.6 + uWind * 0.6) * uv.x;
  transformed.x += sin(uTime * 1.7 + ph) * 0.05 * fall;`
        );
      };
      m.customProgramCacheKey = () => "coa-banner";
      mats.set(key, m);
    }
    const holder = new THREE.Group();
    holder.position.set(b.x, b.y, b.z);
    holder.rotation.y = b.rot || 0;
    const pole = new THREE.Mesh(cyl(0.07, 0.09, b.h, 6), poleMat);
    pole.position.y = b.h / 2;
    pole.castShadow = true;
    holder.add(pole);
    const bar = new THREE.Mesh(cyl(0.04, 0.04, 1.6, 5), poleMat);
    bar.rotation.z = Math.PI / 2;
    bar.position.set(0.8, b.h - 0.25, 0);
    holder.add(bar);
    const cloth = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 3, 6, 10), mats.get(`${b.sigil}:${b.color}`));
    cloth.geometry.translate(0.8, -1.5, 0);
    cloth.position.set(0, b.h - 0.3, 0.02);
    cloth.castShadow = true;
    holder.add(cloth);
    group.add(holder);
  }
  scene.add(group);
  return {
    group,
    dispose() {
      scene.remove(group);
      group.traverse((o) => o.geometry?.dispose());
      poleMat.dispose();
      mats.forEach((m) => m.dispose());
    },
  };
}

/* ================================================================ interiors */
function buildInterior(B, I, M, dyn, ctx) {
  const { map, rows, cols } = I;
  const H = IHEIGHT;
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const ch = map[r][c];
      const p = I.at(c, r);
      if (ch === "#") {
        // only walls that face a floor cell need geometry
        const faces = [
          [0, -1],
          [1, 0],
          [0, 1],
          [-1, 0],
        ].some(([dc, dr]) => !I.isWall(c + dc, r + dr));
        if (faces) B.add("crypt", box(ICELL, H + 1, ICELL, 2.4), null, p.x, H / 2, p.z);
        continue;
      }
      B.add("cobble", box(ICELL, 0.3, ICELL, 2), null, p.x, -0.15, p.z);
      B.add("crypt", box(ICELL, 0.4, ICELL, 2.4), null, p.x, H + 0.2, p.z);
      if (ch === "p") {
        B.add("crypt", cyl(0.7, 0.8, H, 12, 2), null, p.x, H / 2, p.z);
        B.add("crypt", box(1.8, 0.5, 1.8, 2), null, p.x, 0.25, p.z);
        B.add("crypt", box(1.8, 0.5, 1.8, 2), null, p.x, H - 0.25, p.z);
      }
      if (ch === "X") {
        // stairs back up
        for (let k = 0; k < 5; k++) B.add("crypt", box(ICELL - 0.4, 0.35 * (k + 1), 0.5, 2), null, p.x, 0.18 * (k + 1), p.z + ICELL / 2 - 0.25 - k * 0.5);
        B.add("dark", new THREE.PlaneGeometry(ICELL, 3), null, p.x, 3.4, p.z + ICELL / 2 - 0.1);
      }
      if (ch === "T") {
        for (let k = 0; k < 10; k++) B.add("timber", box(0.8, 0.06, 0.06, 1), null, p.x, 0.4 + k * 0.6, p.z - ICELL / 2 + 0.3);
        for (const s of [-0.4, 0.4]) B.add("timber", box(0.08, H, 0.08, 1), null, p.x + s, H / 2, p.z - ICELL / 2 + 0.3);
      }
    }
  // braziers (puzzle) and the Heartstone altar
  I.braziers.forEach((b, i) => {
    const id = `cbrazier${i + 1}`;
    const g = new THREE.Group();
    g.position.set(b.x, 0, b.z);
    const bowl = new THREE.Mesh(cyl(0.6, 0.35, 0.5, 12, 1, true), M.iron);
    bowl.position.y = 1.1;
    g.add(bowl);
    const leg = new THREE.Mesh(cyl(0.12, 0.2, 1.0, 8), M.iron);
    leg.position.y = 0.5;
    g.add(leg);
    const coal = new THREE.Mesh(new THREE.CircleGeometry(0.55, 12).rotateX(-Math.PI / 2), M.flame);
    coal.position.y = 1.25;
    g.add(coal);
    ctx.puzzleFires.push({ id, x: b.x, y: 1.4, z: b.z });
    dyn.add(id, { obj: g, update: (st) => (coal.visible = !!st.lit) });
  });
  if (I.altar) {
    const g = new THREE.Group();
    g.position.set(I.altar.x, 0, I.altar.z);
    const a = new THREE.Mesh(box(3, 1.2, 2, 2), M.stone);
    a.position.y = 0.6;
    g.add(a);
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.4, 0).scale(1, 1.4, 1), M.heart);
    gem.position.y = 1.9;
    g.add(gem);
    dyn.add("altar_heart", { obj: g, update: (st, dt, t) => ((gem.visible = !st.taken), (gem.rotation.y = t * 0.8), (gem.position.y = 1.9 + Math.sin(t * 2) * 0.1)) });
  }
  if (I.seal?.length) {
    const a = I.at(I.seal[0][0], I.seal[0][1]);
    const b = I.at(I.seal[I.seal.length - 1][0], I.seal[0][1]);
    const g = new THREE.Group();
    g.position.set((a.x + b.x) / 2, 0, a.z);
    const door = new THREE.Mesh(box(I.seal.length * ICELL, H, 0.8, 2.4), M.stone);
    door.position.y = H / 2;
    g.add(door);
    for (let k = 0; k < 3; k++) {
      const rune = new THREE.Mesh(new THREE.CircleGeometry(0.5, 6), M.rune);
      rune.position.set((k - 1) * 2.4, 3.2, 0.42);
      door.add(rune);
    }
    let k = 0;
    dyn.add("seal", { obj: g, update: (st, dt) => ((k += ((st.open ? 1 : 0) - k) * Math.min(1, dt * 0.8)), (door.position.y = H / 2 - k * (H + 0.2))) });
  }
  I.chests.forEach((c, i) => {
    const e = { kind: "chest", id: `c_${I.id}${i + 1}`, x: c.x, y: 0, z: c.z, rot: 0 };
    const v = interactableVisual(e, M, dyn, ctx);
    if (v) ctx.group.add(v);
  });
}

/* ================================================================ main */
export function createStructures(scene, W, shared) {
  const group = new THREE.Group();
  group.name = "structures";
  scene.add(group);
  const materials = makeMaterials(shared);
  const DM = dynMats();
  const dynMap = new Map();
  const dyn = {
    add(id, d) {
      dynMap.set(id, d);
      if (d.obj && !d.obj.parent) group.add(d.obj);
    },
  };
  const ctx = { fires: [], shrines: [], puzzleFires: [], smokes: [], group };
  const B = createBuckets();
  const banners = [];
  for (const e of W.layout) {
    const E = entityMatrix(e);
    switch (e.kind) {
      case "house":
        buildHouse(B, e, E);
        break;
      case "hall":
        buildHall(B, e, E);
        break;
      case "chapel":
        buildChapel(B, e, E);
        break;
      case "smithy":
        buildSmithy(B, e, E);
        break;
      case "stable":
        buildStable(B, e, E);
        break;
      case "stall":
        buildStall(B, e, E);
        break;
      case "well":
        buildWell(B, e, E);
        break;
      case "statue":
        buildStatue(B, e, E);
        break;
      case "windmill":
        buildWindmill(B, e, E, dyn, "windmill");
        break;
      case "watchtowerWood":
        buildWatchtower(B, e, E);
        break;
      case "fence":
        buildFence(B, e, E);
        break;
      case "palisade":
        buildPalisade(B, e, E);
        break;
      case "wall":
        buildWall(B, e, E);
        break;
      case "tower":
        buildTower(B, e, E);
        break;
      case "gatehouse":
        buildGatehouse(B, e, E, dyn);
        break;
      case "keep":
        buildKeep(B, e, E);
        break;
      case "ruinKeep":
        buildRuinKeep(B, e, E);
        break;
      case "cryptHut":
        buildCryptHut(B, e, E);
        break;
      case "tent":
        buildTent(B, e, E);
        break;
      case "bridge":
        buildBridge(B, e, E);
        break;
      case "banner":
        banners.push(e);
        break;
      case "chest":
      case "shrine":
      case "oreNode":
      case "cage":
      case "lever":
      case "grate":
      case "trapdoor":
      case "ballista":
      case "anchor": {
        const v = interactableVisual(e, DM, dyn, ctx);
        if (v && !v.parent) group.add(v);
        break;
      }
      default:
        buildProp(B, e, E, dyn, ctx);
    }
    if (e.smoke) ctx.smokes.push({ x: e.x + e.smoke[0] * Math.cos(e.rot) + e.smoke[2] * Math.sin(e.rot), y: e.y + e.smoke[1], z: e.z - e.smoke[0] * Math.sin(e.rot) + e.smoke[2] * Math.cos(e.rot) });
    if (e.fire) ctx.fires.push({ x: e.x + e.fire[0] * Math.cos(e.rot) + e.fire[2] * Math.sin(e.rot), y: e.y + e.fire[1], z: e.z - e.fire[0] * Math.sin(e.rot) + e.fire[2] * Math.cos(e.rot), s: 0.6, kind: "forge" });
  }
  for (const I of Object.values(W.interiors)) buildInterior(B, I, DM, dyn, ctx);
  const meshes = B.build(materials, group);
  const bannerSet = createBanners(scene, banners.map((b) => ({ ...b })), shared);
  return {
    group,
    meshes,
    fires: ctx.fires,
    smokes: ctx.smokes,
    shrines: ctx.shrines,
    puzzleFires: ctx.puzzleFires,
    dyn: dynMap,
    materials,
    /** stateFor(id) → object of flags for that interactable (looted, open, lit…) */
    update(dt, t, stateFor, night) {
      materials.window.emissiveIntensity = night * 2.4;
      for (const [id, d] of dynMap) {
        if (d.tick) d.tick(t);
        if (d.update) d.update(stateFor(id) || {}, dt, t);
      }
    },
    dispose() {
      scene.remove(group);
      group.traverse((o) => o.geometry?.dispose());
      Object.values(materials).forEach((m) => m.dispose());
      Object.values(DM).forEach((m) => m.dispose());
      for (const d of dynMap.values()) d.mats?.forEach((m) => m.dispose());
      bannerSet.dispose();
    },
  };
}
