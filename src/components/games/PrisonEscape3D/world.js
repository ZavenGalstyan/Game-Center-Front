/**
 * Prison Escape 3D — the Three.js renderer.
 *
 * Every static thing (walls, floors, ceilings, props, bars, fences, signs) is
 * baked into a handful of merged meshes, one per material, so the whole
 * prison costs a few dozen draw calls. Doors, levers, pickups, guards,
 * inmates, cameras and searchlights are live objects synced from the sim
 * every frame. A small pool of point lights follows the player between the
 * ceiling fixtures; only the flashlight and the nearest ceiling lamp cast
 * shadows. Nothing here mutates the sim.
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { Kit, mesh, textures, palette, buildProp, createPerson, animatePerson, signTexture, alertTexture } from "./models.js";
import {
  WALLS, PROPS, DOORS, ZONES, CELLS, PLAYER_CELL, FIXTURES, FLOODS, SIGNS, CAMERAS, SEARCHLIGHTS, H_IN, T, INDOOR,
  GUARDS, INMATES, SPOTS, HIDES, FACING, ROLLCALL, zoneAt,
} from "./data.js";
import { propSize, propBoxes, doorBox } from "./sim.js";

const ROT = { s: 0, n: Math.PI, e: Math.PI / 2, w: -Math.PI / 2 };
const _v = new THREE.Vector3();
const _c = new THREE.Color();

/* ------------------------------------------------------------------ geometry */
/** Axis-aligned box with world-space UVs (tiles every `s` metres). */
function wbox(x1, y1, z1, x2, y2, z2, s = 2, { bottom = false, top = true } = {}) {
  const pos = [];
  const nor = [];
  const uv = [];
  const quad = (a, b, c, d, n, uvs) => {
    for (const [p, t] of [[a, uvs[0]], [b, uvs[1]], [c, uvs[2]], [a, uvs[0]], [c, uvs[2]], [d, uvs[3]]]) {
      pos.push(...p);
      nor.push(...n);
      uv.push(...t);
    }
  };
  const U = (v) => v / s;
  // +x / -x
  quad([x2, y1, z2], [x2, y1, z1], [x2, y2, z1], [x2, y2, z2], [1, 0, 0], [[U(z2), U(y1)], [U(z1), U(y1)], [U(z1), U(y2)], [U(z2), U(y2)]]);
  quad([x1, y1, z1], [x1, y1, z2], [x1, y2, z2], [x1, y2, z1], [-1, 0, 0], [[U(z1), U(y1)], [U(z2), U(y1)], [U(z2), U(y2)], [U(z1), U(y2)]]);
  // +z / -z
  quad([x1, y1, z2], [x2, y1, z2], [x2, y2, z2], [x1, y2, z2], [0, 0, 1], [[U(x1), U(y1)], [U(x2), U(y1)], [U(x2), U(y2)], [U(x1), U(y2)]]);
  quad([x2, y1, z1], [x1, y1, z1], [x1, y2, z1], [x2, y2, z1], [0, 0, -1], [[U(x2), U(y1)], [U(x1), U(y1)], [U(x1), U(y2)], [U(x2), U(y2)]]);
  if (top) quad([x1, y2, z2], [x2, y2, z2], [x2, y2, z1], [x1, y2, z1], [0, 1, 0], [[U(x1), U(z2)], [U(x2), U(z2)], [U(x2), U(z1)], [U(x1), U(z1)]]);
  if (bottom) quad([x1, y1, z1], [x2, y1, z1], [x2, y1, z2], [x1, y1, z2], [0, -1, 0], [[U(x1), U(z1)], [U(x2), U(z1)], [U(x2), U(z2)], [U(x1), U(z2)]]);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  return g;
}
/** Horizontal rect (floor if up, ceiling if down) with world UVs. */
function wrect(x1, z1, x2, z2, y, s, up = true) {
  const g = new THREE.BufferGeometry();
  const p = up ? [x1, y, z2, x2, y, z2, x2, y, z1, x1, y, z2, x2, y, z1, x1, y, z1] : [x1, y, z1, x2, y, z1, x2, y, z2, x1, y, z1, x2, y, z2, x1, y, z2];
  const uv = [];
  for (let i = 0; i < p.length; i += 3) uv.push(p[i] / s, p[i + 2] / s);
  g.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(new Array(6).fill(0).flatMap(() => [0, up ? 1 : -1, 0]), 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

/** Collects geometry per material and merges it into one mesh each. */
class Batch {
  constructor() {
    this.by = new Map();
  }
  addGeo(geo, mat, owned = true) {
    let g = owned ? geo : geo.clone();
    if (g.index) g = g.toNonIndexed();
    for (const k of Object.keys(g.attributes)) if (k !== "position" && k !== "normal" && k !== "uv") g.deleteAttribute(k);
    if (!g.attributes.uv) g.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (!this.by.has(mat)) this.by.set(mat, []);
    this.by.get(mat).push(g);
  }
  /** Bakes a (static) object tree into the batch. */
  addObject(obj) {
    obj.updateMatrixWorld(true);
    obj.traverse((m) => {
      if (!m.isMesh) return;
      const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
      g.applyMatrix4(m.matrixWorld);
      this.addGeo(g, m.material);
    });
  }
  build(scene, own, { cast = true, receive = true } = {}) {
    for (const [mat, list] of this.by) {
      const g = mergeGeometries(list, false);
      for (const x of list) x.dispose();
      if (!g) continue;
      g.computeBoundingSphere();
      own.push(g);
      const m = new THREE.Mesh(g, mat);
      m.castShadow = cast && !mat.transparent && !(mat.isMeshBasicMaterial);
      m.receiveShadow = receive;
      m.matrixAutoUpdate = false;
      scene.add(m);
    }
    this.by.clear();
  }
}

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ================================================================== world */
export function createWorld(canvas, { preserve = false } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: preserve, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const kit = new Kit();
  const T_ = textures(kit);
  const P = palette(kit, T_);
  const own = []; // geometries we created outside the kit
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(72, 16 / 9, 0.05, 170);
  camera.rotation.order = "YXZ";
  scene.add(camera);
  scene.fog = new THREE.FogExp2(0x0b0f14, 0.02);
  scene.background = new THREE.Color(0x0b0f14);

  // ---- materials with world-UV textures
  const M = {
    concrete: kit.mat(0xa3acb6, { map: T_.concrete, rough: 0.92 }),
    paint: kit.mat(0x5e7767, { map: T_.concrete, rough: 0.75 }),
    yardWall: kit.mat(0x8d9399, { map: T_.concrete, rough: 0.95 }),
    outer: kit.mat(0x7f8489, { map: T_.concrete, rough: 0.95 }),
    floor: kit.mat(0x7c8189, { map: T_.floor, rough: 0.7 }),
    floorDark: kit.mat(0x5b5f64, { map: T_.floor, rough: 0.6 }),
    tiles: kit.mat(0xffffff, { map: T_.tiles, rough: 0.55 }),
    lino: kit.mat(0x9ea69a, { map: T_.lino, rough: 0.6 }),
    grate: kit.mat(0x8a8f96, { map: T_.grate, rough: 0.5, metal: 0.5 }),
    asphalt: kit.mat(0x6f7378, { map: T_.asphalt, rough: 0.95 }),
    gravel: kit.mat(0xa29c90, { map: T_.gravel, rough: 1 }),
    grass: kit.mat(0x6a7a58, { map: T_.grass, rough: 1 }),
    ceiling: kit.mat(0x5d636a, { map: T_.concrete, rough: 1 }),
    road: kit.mat(0x3d4044, { map: T_.asphalt, rough: 0.9 }),
  };
  const R = rng(7);

  /* ---------------------------------------------------------------- static */
  const B = new Batch();
  const razorPts = []; // razor-wire coil positions (filled by fences + walls)
  // walls
  const barsList = [];
  for (const w of WALLS) {
    if (w.kind === "invisible") continue;
    if (w.kind === "bars") {
      barsList.push(w);
      continue;
    }
    if (w.kind === "fence") {
      buildFence(w);
      continue;
    }
    const mat = w.kind === "yard" ? M.yardWall : w.kind === "outer" ? M.outer : M.concrete;
    if (w.paint && w.y1 < 1.25) {
      B.addGeo(wbox(w.x1, w.y1, w.z1, w.x2, Math.min(1.25, w.h), w.z2, 2), M.paint);
      // a thin orange stripe between paint and concrete
      if (w.h > 1.3) B.addGeo(wbox(w.x1 - 0.005, 1.25, w.z1 - 0.005, w.x2 + 0.005, 1.31, w.z2 + 0.005, 2), P.orange);
      if (w.h > 1.31) B.addGeo(wbox(w.x1, 1.31, w.z1, w.x2, w.h, w.z2, 2), mat);
    } else {
      B.addGeo(wbox(w.x1, w.y1, w.z1, w.x2, w.h, w.z2, 2, { bottom: w.y1 > 0 }), mat);
    }
    if (w.kind === "yard" || w.kind === "outer") B.addGeo(wbox(w.x1 - 0.08, w.h, w.z1 - 0.08, w.x2 + 0.08, w.h + 0.15, w.z2 + 0.08, 2), M.ceiling);
  }
  // lintels above doorways
  for (const d of DOORS) {
    if (d.kind === "door" || d.kind === "slide") {
      const b = doorBox(d);
      B.addGeo(wbox(b.x1, 2.3, b.z1 + 0.02, b.x2, H_IN, b.z2 - 0.02, 2, { bottom: true }), M.concrete);
    }
  }
  // the main corridor's wide cafeteria doorway + laundry doorway lintels
  for (const [x, w] of [[-20, 2.6], [-3, 1.8]]) B.addGeo(wbox(x - w / 2, 2.6, 3 - T / 2, x + w / 2, H_IN, 3 + T / 2, 2, { bottom: true }), M.concrete);
  // the yard door frame lintel (outdoor face)
  B.addGeo(wbox(18.6, 2.6, -11 - T / 2, 20.4, 4.6, -11 + T / 2, 2, { bottom: true }), M.yardWall);

  // bars (instanced: one draw call for every bar in the block)
  {
    const pts = [];
    for (const w of barsList) {
      const along = w.x2 - w.x1 > w.z2 - w.z1 ? "x" : "z";
      const len = along === "x" ? w.x2 - w.x1 : w.z2 - w.z1;
      const n = Math.max(2, Math.round(len / 0.14));
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        pts.push(along === "x" ? [w.x1 + len * t, (w.z1 + w.z2) / 2] : [(w.x1 + w.x2) / 2, w.z1 + len * t]);
      }
      // rails
      for (const y of [0.08, 1.1, H_IN - 0.08]) {
        const r = along === "x" ? wbox(w.x1, y - 0.03, (w.z1 + w.z2) / 2 - 0.04, w.x2, y + 0.03, (w.z1 + w.z2) / 2 + 0.04, 1) : wbox((w.x1 + w.x2) / 2 - 0.04, y - 0.03, w.z1, (w.x1 + w.x2) / 2 + 0.04, y + 0.03, w.z2, 1);
        B.addGeo(r, P.bars);
      }
    }
    const geo = new THREE.CylinderGeometry(0.022, 0.022, H_IN, 6);
    own.push(geo);
    const inst = new THREE.InstancedMesh(geo, P.bars, pts.length);
    const m4 = new THREE.Matrix4();
    pts.forEach(([x, z], i) => inst.setMatrixAt(i, m4.makeTranslation(x, H_IN / 2, z)));
    inst.castShadow = true;
    scene.add(inst);
  }

  function buildFence(w) {
    const along = w.x2 - w.x1 > w.z2 - w.z1 ? "x" : "z";
    const len = along === "x" ? w.x2 - w.x1 : w.z2 - w.z1;
    const c = along === "x" ? (w.z1 + w.z2) / 2 : (w.x1 + w.x2) / 2;
    const s = along === "x" ? w.x1 : w.z1;
    const mat = P.chain;
    const g = new THREE.BufferGeometry();
    const p = along === "x" ? [s, 0, c, s + len, 0, c, s + len, w.h, c, s, 0, c, s + len, w.h, c, s, w.h, c] : [c, 0, s, c, 0, s + len, c, w.h, s + len, c, 0, s, c, w.h, s + len, c, w.h, s];
    g.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(new Array(6).fill(0).flatMap(() => (along === "x" ? [0, 0, 1] : [1, 0, 0])), 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, len / 0.6, 0, len / 0.6, w.h / 0.6, 0, 0, len / 0.6, w.h / 0.6, 0, w.h / 0.6], 2));
    B.addGeo(g, mat);
    for (let i = 0; i <= Math.ceil(len / 3); i++) {
      const t = Math.min(len, i * 3);
      const x = along === "x" ? s + t : c;
      const z = along === "x" ? c : s + t;
      B.addGeo(wbox(x - 0.05, 0, z - 0.05, x + 0.05, w.h + 0.2, z + 0.05, 1), P.darkSteel);
    }
    B.addGeo(along === "x" ? wbox(s, w.h - 0.04, c - 0.03, s + len, w.h + 0.02, c + 0.03, 1) : wbox(c - 0.03, w.h - 0.04, s, c + 0.03, w.h + 0.02, s + len, 1), P.darkSteel);
    razor(along, s, len, c, w.h + 0.25);
  }
  function razor(along, s, len, c, y) {
    for (let t = 0.3; t < len; t += 0.55) razorPts.push(along === "x" ? [s + t, y, c, 0] : [c, y, s + t, 1]);
  }
  for (const w of WALLS) {
    if (w.kind !== "outer" && w.kind !== "yard") continue;
    const along = w.x2 - w.x1 > w.z2 - w.z1 ? "x" : "z";
    razor(along, along === "x" ? w.x1 : w.z1, along === "x" ? w.x2 - w.x1 : w.z2 - w.z1, along === "x" ? (w.z1 + w.z2) / 2 : (w.x1 + w.x2) / 2, w.h + 0.42);
  }

  // floors + ceilings
  const FLOORS = [
    [-15, 8, 15, 28, M.floor, 2], [-30, 3, 25, 8, M.floorDark, 2], [15, 8, 25, 18, M.lino, 1], [-30, -17, -10, 3, M.tiles, 1],
    [-10, -11, 4, 3, M.tiles, 1.2], [4, -11, 14, 3, M.floorDark, 2], [14, -11, 25, 3, M.lino, 1], [25, -14, 31, 8, M.floor, 2],
    [31, -14, 45, 4, M.grate, 1], [36, -48, 40, -14, M.floorDark, 2], [-10, -40, 25, -11, M.asphalt, 4], [-14, -48, 48, -40, M.gravel, 2],
    [-14, -67, 49, -48, M.grass, 3], [25, -48, 36, -14, M.gravel, 2], [40, -48, 49, -14, M.gravel, 2],
  ];
  for (const [x1, z1, x2, z2, mat, s] of FLOORS) B.addGeo(wrect(x1, z1, x2, z2, 0, s), mat);
  const CEILS = [[-15, 8, 15, 28], [-30, 3, 25, 8], [15, 8, 25, 18], [-30, -17, -10, 3], [-10, -11, 4, 3], [4, -11, 14, 3], [14, -11, 25, 3], [25, -14, 31, 8], [31, -14, 45, 4]];
  for (const [x1, z1, x2, z2] of CEILS) B.addGeo(wrect(x1, z1, x2, z2, H_IN, 3, false), M.ceiling);
  B.addGeo(wrect(36, -48, 40, -14, 3.2, 3, false), M.ceiling);
  // ceiling beams in the cell block + pipes along the corridor
  for (let x = -12; x <= 12; x += 6) B.addGeo(wbox(x - 0.15, H_IN - 0.35, 8, x + 0.15, H_IN, 28, 2), M.ceiling);
  B.addGeo(wbox(-30, 3.0, 7.55, 25, 3.12, 7.67, 1), P.paintSteel);
  B.addGeo(wbox(-30, 2.85, 7.3, 25, 2.95, 7.4, 1), P.red);
  B.addGeo(wbox(36.2, 2.7, -48, 36.4, 2.85, -14, 1), P.paintSteel);
  B.addGeo(wbox(39.6, 2.5, -48, 39.8, 2.62, -14, 1), P.steel);
  // decals: roll-call line, restricted stripes
  B.addGeo(wrect(ROLLCALL.x1, 19.35, ROLLCALL.x2, 19.65, 0.01, 1), P.yellow);
  B.addGeo(wrect(24.6, 3.15, 25.0, 7.85, 0.012, 0.5), P.hazard);
  B.addGeo(wrect(-29.85, -10.6, -28.35, -10.45, 0.012, 0.5), P.hazard);
  B.addGeo(wrect(30.2, -6.8, 30.84, -5.2, 0.012, 0.5), P.hazard);
  B.addGeo(wrect(15.15, 11.3, 15.6, 12.7, 0.012, 0.5), P.hazard);
  // basketball court lines
  const lineMat = kit.mat(0xd9d4c4, { rough: 0.8 });
  for (const [x1, z1, x2, z2] of [[0, -34.2, 14, -34], [0, -20.2, 14, -20], [0, -34.2, 0.2, -20], [13.8, -34.2, 14, -20], [0, -27.1, 14, -26.9]]) B.addGeo(wrect(x1, z1, x2, z2, 0.012, 1), lineMat);
  // exterior road + tree line + hills
  B.addGeo(wrect(-14, -60, 49, -56, 0.01, 4), M.road);
  for (let x = -12; x < 48; x += 4) B.addGeo(wrect(x, -58.08, x + 2, -57.92, 0.02, 1), P.yellow);

  // cell windows (high, barred) — glow changes with time of day
  const windowMat = kit.mat(0x90a8c0, { basic: true });
  for (const c of CELLS) {
    B.addGeo(wbox(c.cx - 0.45, 2.35, 27.83, c.cx + 0.45, 2.75, 27.85, 1), windowMat);
    for (let i = -2; i <= 2; i++) B.addGeo(wbox(c.cx + i * 0.16 - 0.015, 2.35, 27.8, c.cx + i * 0.16 + 0.015, 2.75, 27.84, 1), P.bars);
  }
  // corridor windows onto nowhere: high slit windows on the corridor south wall west end
  for (const x of [-27, -22, -17]) B.addGeo(wbox(x - 0.6, 2.4, 7.84, x + 0.6, 2.8, 7.86, 1), windowMat);

  // props
  for (const p of PROPS) {
    const { sx, sz, h, def } = propSize(p);
    const ew = p.f === "e" || p.f === "w";
    const lw = ew ? sz : sx; // local width (x before rotation)
    const ld = ew ? sx : sz;
    const g = buildProp(kit, P, p, lw, ld, h, R);
    g.position.set(p.x, 0, p.z);
    g.rotation.y = ROT[p.f || "s"];
    if (p.t === "pole") continue; // poles are dynamic (lamps switch off)
    if (p.id === "rationshelf") {
      // the ration bars: rows of red wrappers
      for (let k = 0; k < 3; k++) for (let i = 0; i < 6; i++) g.add(mesh(kit.box(), P.red, [-0.8 + i * 0.3, 0.16 + k * 0.62 + 0.04, 0.02], [0.22, 0.06, 0.12]));
    }
    B.addObject(g);
    void def;
  }
  // poster in the player's cell (hides the loose brick)
  B.addGeo(wbox(1.95, 1.0, 27.8, 3.05, 2.1, 27.84, 1), P.poster);
  // keypad, card readers, scanner
  const reader = (x, y, z, f, mat = P.darkSteel) => {
    const [fx, fz] = FACING[f];
    const o = new THREE.Group();
    o.add(mesh(kit.box(), mat, [0, 0, 0], [0.18, 0.26, 0.06]));
    o.add(mesh(kit.box(), P.ledRed, [0, 0.08, 0.035], [0.08, 0.02, 0.01]));
    o.add(mesh(kit.box(), P.black, [0, -0.03, 0.035], [0.12, 0.12, 0.01]));
    o.position.set(x + fx * 0.03, y, z + fz * 0.03);
    o.rotation.y = ROT[f];
    B.addObject(o);
  };
  reader(30.82, 1.3, -4.95, "w"); // maintenance keypad (corridor side)
  reader(20.55, 1.3, 3.18, "s"); // checkpoint card reader
  reader(39.4, 1.3, -43.82, "s", P.yellow); // tunnel gate scanner
  // signs
  for (const [x, y, z, f, text, style] of SIGNS) {
    const tex = signTexture(kit, text, style);
    const o = mesh(kit.plane(), kit.mat(0xffffff, { map: tex, rough: 0.6 }), [x + FACING[f][0] * 0.17, y, z + FACING[f][1] * 0.17], [1.6, 0.4, 1]);
    o.rotation.y = ROT[f];
    B.addObject(o);
  }
  // ceiling light fixtures
  for (const [x, z, zid] of FIXTURES) {
    const y = zid === "tunnel" ? 3.05 : H_IN - 0.06;
    const mat = zid === "tunnel" ? P.lampRed : zid === "maint" ? P.lampWarm : P.lampOn;
    B.addGeo(wbox(x - 0.55, y - 0.05, z - 0.14, x + 0.55, y, z + 0.14, 1, { bottom: true }), mat);
    B.addGeo(wbox(x - 0.6, y, z - 0.18, x + 0.6, y + 0.06, z + 0.18, 1), P.darkSteel);
  }
  // breaker panel + fuse box + flood box casings
  B.addGeo(wbox(44.8, 0.9, -7.6, 44.85, 2.0, -4.4, 1), P.darkSteel);
  B.addGeo(wbox(44.7, 1.15, -9.9, 44.85, 1.85, -9.1, 1), P.blueSteel);
  B.addGeo(wbox(-9.85, 0.9, -24.45, -9.7, 1.7, -23.55, 1), P.paintSteel);
  for (const [z, txt] of [[-5, "PUMPS"], [-6, "MAIN"], [-7, "LIGHTS"]]) {
    const o = mesh(kit.plane(), kit.mat(0xffffff, { map: signTexture(kit, txt, "info") }), [44.78, 1.82, z], [0.5, 0.13, 1]);
    o.rotation.y = -Math.PI / 2;
    B.addObject(o);
  }
  {
    const o = mesh(kit.plane(), kit.mat(0xffffff, { map: signTexture(kit, "FUSES — TUNNEL", "warn") }), [44.68, 1.95, -9.5], [0.7, 0.18, 1]);
    o.rotation.y = -Math.PI / 2;
    B.addObject(o);
    const o2 = mesh(kit.plane(), kit.mat(0xffffff, { map: signTexture(kit, "FLOODLIGHTS", "danger") }), [-9.68, 1.85, -24], [0.8, 0.2, 1]);
    o2.rotation.y = Math.PI / 2;
    B.addObject(o2);
  }

  // exterior: trees along the tree line + distant hills
  {
    const trunkG = new THREE.CylinderGeometry(0.12, 0.18, 1, 6);
    const crownG = new THREE.ConeGeometry(1, 1, 7);
    own.push(trunkG, crownG);
    const spots = [];
    for (let i = 0; i < 70; i++) {
      const x = -13 + R() * 61;
      const z = -66 + R() * 5.5;
      spots.push([x, z, 4 + R() * 4]);
    }
    for (let i = 0; i < 14; i++) spots.push([-13.2 + R() * 1.0, -62 + R() * 13, 4 + R() * 3], [46.5 + R() * 1.5, -62 + R() * 13, 4 + R() * 3]);
    const trunks = new THREE.InstancedMesh(trunkG, P.wood, spots.length);
    const crowns = new THREE.InstancedMesh(crownG, kit.mat(0x2c3d2c, { rough: 1 }), spots.length);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    spots.forEach(([x, z, h], i) => {
      trunks.setMatrixAt(i, m4.compose(_v.set(x, h * 0.2, z), q, new THREE.Vector3(1, h * 0.4, 1)));
      crowns.setMatrixAt(i, m4.compose(_v.set(x, h * 0.4 + h * 0.35, z), q, new THREE.Vector3(h * 0.28, h * 0.7, h * 0.28)));
    });
    scene.add(trunks, crowns);
    const hillG = new THREE.ConeGeometry(1, 1, 6);
    own.push(hillG);
    const hillMat = kit.mat(0x1d2630, { rough: 1 });
    for (let i = 0; i < 9; i++) {
      const hm = new THREE.Mesh(hillG, hillMat);
      hm.position.set(-60 + i * 18 + R() * 8, 0, -110 - R() * 20);
      hm.scale.set(18 + R() * 10, 14 + R() * 14, 14);
      scene.add(hm);
    }
  }
  // razor wire coils (instanced)
  {
    const tg = new THREE.TorusGeometry(0.22, 0.012, 4, 10);
    own.push(tg);
    const inst = new THREE.InstancedMesh(tg, P.steel, razorPts.length);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    razorPts.forEach(([x, y, z, rot], i) => {
      q.setFromEuler(new THREE.Euler(0, rot ? 0 : Math.PI / 2, 0.3));
      inst.setMatrixAt(i, m4.compose(_v.set(x, y, z), q, new THREE.Vector3(1, 1, 1)));
    });
    scene.add(inst);
  }
  B.build(scene, own);

  /* ---------------------------------------------------------------- doors */
  const doorObjs = new Map();
  for (const d of DOORS) {
    const g = new THREE.Group();
    const inner = new THREE.Group();
    g.add(inner);
    g.position.set(d.x, 0, d.z);
    g.rotation.y = d.axis === "x" ? 0 : Math.PI / 2; // local x runs along the wall
    const w = d.w;
    if (d.kind === "cellgate" || d.kind === "gate") {
      const h = d.id === "exitA" ? 3.15 : H_IN - 0.05;
      const n = Math.round(w / 0.14);
      for (let i = 0; i <= n; i++) inner.add(mesh(kit.cyl(6), P.bars, [-w / 2 + (w * i) / n, h / 2, 0], [0.05, h, 0.05]));
      for (const y of [0.1, 1.05, h - 0.1]) inner.add(mesh(kit.box(), P.bars, [0, y, 0], [w, 0.07, 0.08]));
      inner.add(mesh(kit.box(), P.darkSteel, [-w / 2 + 0.15, 1.05, 0.06], [0.12, 0.2, 0.06])); // lock box
      g.userData.slide = w * 0.95;
    } else if (d.kind === "door") {
      const pivot = new THREE.Group();
      const hx = (d.hinge || 1) * (w / 2);
      pivot.position.x = hx;
      inner.add(pivot);
      const panel = new THREE.Group();
      panel.position.x = -hx;
      pivot.add(panel);
      panel.add(mesh(kit.box(), P.blueSteel, [0, 1.13, 0], [w - 0.06, 2.24, 0.07]));
      panel.add(mesh(kit.box(), P.glassDark, [0, 1.65, 0], [0.3, 0.4, 0.075]));
      panel.add(mesh(kit.box(), P.steel, [-(d.hinge || 1) * (w / 2 - 0.15), 1.05, 0.06], [0.04, 0.04, 0.12]));
      panel.add(mesh(kit.box(), P.steel, [-(d.hinge || 1) * (w / 2 - 0.15), 1.05, -0.06], [0.04, 0.04, 0.12]));
      g.userData.pivot = pivot;
      g.userData.swing = (d.hinge || 1) * 1.7;
    } else if (d.kind === "slide") {
      inner.add(mesh(kit.box(), P.darkSteel, [0, 1.13, 0], [w - 0.02, 2.26, 0.12]));
      inner.add(mesh(kit.box(), P.hazard, [0, 0.25, 0.065], [w - 0.1, 0.18, 0.01]));
      inner.add(mesh(kit.box(), P.hazard, [0, 0.25, -0.065], [w - 0.1, 0.18, 0.01]));
      inner.add(mesh(kit.box(), P.glassDark, [0, 1.6, 0], [0.24, 0.5, 0.13]));
      g.userData.slide = w * 0.95;
    } else if (d.kind === "shutter") {
      for (let i = 0; i < 16; i++) inner.add(mesh(kit.box(), i % 2 ? P.steel : P.paintSteel, [0, 0.1 + i * 0.2, 0], [w, 0.19, 0.06]));
      g.userData.lift = 3.1;
    } else if (d.kind === "vent") {
      inner.add(mesh(kit.box(), P.steel, [0, 0.46, 0], [w - 0.04, 0.9, 0.04]));
      for (let i = 0; i < 6; i++) inner.add(mesh(kit.box(), P.black, [0, 0.12 + i * 0.13, 0.025], [w - 0.18, 0.05, 0.01]));
      for (const sx of [-1, 1]) for (const sy of [0.08, 0.84]) inner.add(mesh(kit.sphere(6), P.darkSteel, [sx * (w / 2 - 0.07), sy, 0.03], [0.04, 0.04, 0.02]));
      g.userData.vent = true;
      // dark crawlspace behind
      B.addGeo(wbox(d.x - 0.14, 0, d.z - 0.48, d.x + 0.14, 0.02, d.z + 0.48, 1), P.black);
    } else if (d.kind === "fencepanel") {
      const pivot = new THREE.Group();
      pivot.position.x = -w / 2;
      inner.add(pivot);
      const pm = mesh(kit.plane(), kit.mat(0xffffff, { map: T_.chain, alphaTest: 0.45, side: THREE.DoubleSide, rough: 0.5, metal: 0.6 }), [w / 2, 0.57, 0], [w, 1.14, 1]);
      pivot.add(pm);
      pivot.add(mesh(kit.box(), P.darkSteel, [w / 2, 1.13, 0], [w, 0.04, 0.04]));
      pivot.add(mesh(kit.box(), P.darkSteel, [w / 2, 0.02, 0], [w, 0.04, 0.04]));
      for (const sx of [0.05, w - 0.05]) for (const sy of [0.3, 0.85]) pivot.add(mesh(kit.sphere(6), P.steel, [sx, sy, 0.03], [0.05, 0.05, 0.05]));
      g.userData.pivot = pivot;
      g.userData.swing = -1.4;
    }
    g.traverse((m) => {
      if (m.isMesh) m.castShadow = true;
    });
    scene.add(g);
    doorObjs.set(d.id, g);
  }
  B.build(scene, own);
  // drain gap grate (static, bent open)
  {
    const o = mesh(kit.box(), P.darkSteel, [8.45, 0.5, -48.1], [0.06, 0.9, 1.1], [0, 0, 0.5]);
    scene.add(o);
  }

  /* ---------------------------------------------------------------- dynamic props */
  // breaker levers
  const levers = {};
  for (const [id, z] of [["pumps", -5], ["main", -6], ["lights", -7]]) {
    const pivot = new THREE.Group();
    pivot.position.set(44.75, 1.45, z);
    pivot.add(mesh(kit.box(), P.black, [0, 0, 0], [0.08, 0.32, 0.22]));
    const arm = new THREE.Group();
    arm.add(mesh(kit.box(), P.red, [-0.12, 0, 0], [0.24, 0.04, 0.04]));
    arm.add(mesh(kit.box(), P.black, [-0.24, 0, 0], [0.06, 0.06, 0.12]));
    pivot.add(arm);
    const led = mesh(kit.sphere(6), P.ledRed, [-0.045, 0.13, 0.07], [0.03, 0.03, 0.03]);
    pivot.add(led);
    scene.add(pivot);
    levers[id] = { arm, led, up: 0 };
  }
  // fuse box door
  const fuseDoor = new THREE.Group();
  fuseDoor.position.set(44.68, 1.5, -9.9);
  fuseDoor.add(mesh(kit.box(), P.blueSteel, [0, 0, 0.4], [0.03, 0.66, 0.78]));
  scene.add(fuseDoor);
  const fuseWire = mesh(kit.box(), P.orange, [44.67, 1.5, -9.5], [0.02, 0.025, 0.3]);
  scene.add(fuseWire);
  // flood box cover + switch
  const floodCover = mesh(kit.box(), P.paintSteel, [-9.66, 1.3, -24], [0.04, 0.76, 0.86]);
  scene.add(floodCover);
  const floodSwitch = new THREE.Group();
  floodSwitch.position.set(-9.7, 1.3, -24);
  floodSwitch.add(mesh(kit.box(), P.red, [0.08, 0, 0], [0.16, 0.06, 0.06]));
  scene.add(floodSwitch);
  // pickups visible in the world until taken
  const pickups = [];
  const addPickup = (item, obj) => {
    obj.traverse((m) => m.isMesh && (m.material = m.material.clone()));
    scene.add(obj);
    pickups.push({ item, obj });
  };
  {
    const clip = new THREE.Group();
    clip.add(mesh(kit.box(), P.wood, [0, 0, 0], [0.24, 0.012, 0.32]));
    clip.add(mesh(kit.box(), P.paper, [0, 0.008, 0.01], [0.2, 0.006, 0.26]));
    clip.add(mesh(kit.box(), P.steel, [0, 0.012, -0.14], [0.1, 0.012, 0.03]));
    clip.position.set(6.1, 0.79, -10.2);
    clip.rotation.y = 0.3;
    addPickup("accessnote", clip);
    const coil = new THREE.Group();
    coil.add(mesh(kit.geo("coil", () => new THREE.TorusGeometry(0.11, 0.035, 6, 14)), P.orange, [0, 0.03, 0], [1, 1, 1], [Math.PI / 2, 0, 0]));
    coil.add(mesh(kit.box(), P.red, [0, 0.0, 0.1], [0.3, 0.1, 0.18]));
    coil.position.set(13.25, 0.95, -9);
    addPickup("wire", coil);
    const card = mesh(kit.box(), kit.mat(0xe8e8e8), [20.7, 0.79, 14.85], [0.085, 0.005, 0.055], [0, 0.4, 0]);
    card.add(mesh(kit.box(), P.blueSteel, [0, 0.6, -0.2], [1, 0.4, 0.4]));
    addPickup("keycard", card);
  }

  // floodlight poles (lamps switch off)
  const poles = [];
  for (const [x, z] of FLOODS) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.add(mesh(kit.cyl(8), P.darkSteel, [0, 4, 0], [0.24, 8, 0.24]));
    const head = new THREE.Group();
    head.position.y = 8;
    g.add(head);
    g.updateMatrixWorld(true);
    head.lookAt(8, 0, -26);
    const lampMat = kit.mat(0xffffff, { basic: true, tag: "flood" + x + z });
    head.add(mesh(kit.box(), P.darkSteel, [0, 0, 0], [0.9, 0.5, 0.25]));
    const lamp = mesh(kit.box(), lampMat, [0, 0, 0.13], [0.8, 0.4, 0.02]);
    head.add(lamp);
    scene.add(g);
    poles.push({ g, lampMat });
  }

  /* ---------------------------------------------------------------- characters */
  const guardObjs = new Map();
  for (const def of GUARDS) {
    const root = createPerson(kit, { shirt: def.cook ? 0xdfe3e6 : def.color, pants: def.cook ? 0x2b2f36 : 0x1f2735, skin: [0xc8987a, 0x8d5a3b, 0xe0b090, 0x6b4430][def.id.length % 4], hair: 0x2a2018, cap: def.cook ? null : 0x1b2433, guard: true });
    const icon = new THREE.Sprite(new THREE.SpriteMaterial({ map: alertTexture(kit, "?"), depthTest: false, transparent: true }));
    icon.scale.set(0.42, 0.42, 1);
    icon.position.y = 2.25;
    icon.renderOrder = 10;
    root.add(icon);
    const beam = mesh(kit.geo("beam", () => new THREE.ConeGeometry(1, 1, 16, 1, true).translate(0, -0.5, 0).rotateX(-Math.PI / 2)), kit.mat(0xfff0c0, { add: true, opacity: 0.999, side: THREE.DoubleSide, basic: true, tag: "beam" }), [0, 0, 0], [1.1, 1.1, 7]);
    beam.material.opacity = 0.06;
    beam.visible = false;
    root.userData.rig.torch?.add(beam);
    beam.position.z = 0.12;
    beam.renderOrder = 5;
    scene.add(root);
    guardObjs.set(def.id, { root, icon, beam, iconCh: "?" });
  }
  const inmateObjs = new Map();
  for (const def of INMATES) {
    const root = createPerson(kit, { shirt: def.color, skin: def.skin, hair: def.hair, beard: def.id === "lou" || def.id === "pete" });
    scene.add(root);
    inmateObjs.set(def.id, root);
  }

  /* ---------------------------------------------------------------- security */
  const camObjs = new Map();
  const coneG = kit.geo("camcone", () => new THREE.ConeGeometry(1, 1, 20, 1, true).translate(0, -0.5, 0).rotateX(Math.PI / 2)); // apex at 0, opens toward −z
  for (const c of CAMERAS) {
    const g = new THREE.Group();
    g.position.set(c.x, c.y, c.z);
    g.add(mesh(kit.box(), P.darkSteel, [0, 0.12, 0], [0.08, 0.25, 0.08]));
    const head = new THREE.Group();
    head.rotation.order = "YXZ";
    g.add(head);
    head.add(mesh(kit.box(), P.white, [0, 0, -0.12], [0.16, 0.14, 0.34]));
    head.add(mesh(kit.cyl(10), P.black, [0, 0, -0.3], [0.1, 0.03, 0.1], [Math.PI / 2, 0, 0]));
    const led = mesh(kit.sphere(6), P.ledRed, [0.05, 0.05, -0.29], [0.03, 0.03, 0.03]);
    head.add(led);
    const cone = new THREE.Mesh(coneG, kit.mat(0xff3b30, { add: true, basic: true, opacity: 0.999, side: THREE.DoubleSide, tag: "camcone" + c.id }));
    cone.material.opacity = 0.05;
    const L = c.range * 0.55;
    const rad = Math.tan(c.fov ?? 0.3) * L;
    cone.scale.set(rad, rad * 0.75, L);
    cone.position.z = -0.3;
    cone.renderOrder = 5;
    head.add(cone);
    head.rotation.x = -0.32;
    scene.add(g);
    camObjs.set(c.id, { g, head, led, cone });
  }
  const slObjs = SEARCHLIGHTS.map((s) => {
    const light = new THREE.SpotLight(0xe8f0ff, 0, 45, 0.13, 0.5, 1.2);
    light.position.set(s.x, s.y, s.z);
    scene.add(light, light.target);
    const beam = new THREE.Mesh(kit.geo("slbeam", () => new THREE.CylinderGeometry(0.25, 1, 1, 18, 1, true).translate(0, -0.5, 0)), kit.mat(0xdfe8ff, { add: true, basic: true, opacity: 0.999, side: THREE.DoubleSide, tag: "slbeam" + s.id }));
    beam.material.opacity = 0.07;
    beam.renderOrder = 5;
    scene.add(beam);
    const pool = mesh(kit.geo("disc", () => new THREE.CircleGeometry(1, 28).rotateX(-Math.PI / 2)), kit.mat(0xe8f0ff, { add: true, basic: true, opacity: 0.999, tag: "slpool" + s.id }), [0, 0.03, 0], [s.r, 1, s.r]);
    pool.material.opacity = 0.18;
    pool.renderOrder = 4;
    scene.add(pool);
    const housing = mesh(kit.cyl(10), P.darkSteel, [s.x, s.y, s.z], [0.5, 0.6, 0.5]);
    scene.add(housing);
    return { s, light, beam, pool, housing };
  });

  /* ---------------------------------------------------------------- lights */
  const hemi = new THREE.HemisphereLight(0xbfd2e6, 0x30353b, 1.0);
  scene.add(hemi);
  const moon = new THREE.DirectionalLight(0x9fb4d8, 0.0);
  moon.position.set(-30, 60, 20);
  scene.add(moon, moon.target);
  const POOL = 6;
  const pool = [];
  for (let i = 0; i < POOL; i++) {
    const l = new THREE.PointLight(0xfff1dc, 0, 14, 1.6);
    scene.add(l);
    pool.push(l);
  }
  // nearest ceiling lamp: a downward spot with soft shadows
  const lampShadow = new THREE.SpotLight(0xfff1dc, 0, 12, 1.15, 0.85, 1.4);
  lampShadow.castShadow = true;
  lampShadow.shadow.mapSize.set(1024, 1024);
  lampShadow.shadow.bias = -0.0008;
  lampShadow.shadow.normalBias = 0.02;
  lampShadow.shadow.camera.near = 0.3;
  lampShadow.shadow.camera.far = 12;
  scene.add(lampShadow, lampShadow.target);
  // the player's flashlight
  const flash = new THREE.SpotLight(0xfff3d6, 0, 26, 0.45, 0.55, 1.3);
  flash.castShadow = true;
  flash.shadow.mapSize.set(512, 512);
  flash.shadow.bias = -0.001;
  flash.shadow.camera.near = 0.2;
  flash.shadow.camera.far = 26;
  flash.position.set(0.18, -0.2, 0.1);
  camera.add(flash);
  flash.target.position.set(0, -0.15, -5);
  camera.add(flash.target);
  // flashlight viewmodel
  const viewTorch = new THREE.Group();
  viewTorch.add(mesh(kit.cyl(10), kit.mat(0x1d1f22, { rough: 0.5, metal: 0.3 }), [0, 0, 0], [0.055, 0.26, 0.055], [Math.PI / 2, 0, 0]));
  viewTorch.add(mesh(kit.cyl(12), kit.mat(0x2a2d31, { rough: 0.4, metal: 0.4 }), [0, 0, -0.15], [0.075, 0.06, 0.075], [Math.PI / 2, 0, 0]));
  viewTorch.add(mesh(kit.cyl(12), kit.mat(0xfff4d8, { basic: true }), [0, 0, -0.181], [0.065, 0.004, 0.065], [Math.PI / 2, 0, 0]));
  viewTorch.add(mesh(kit.box(), kit.mat(0xd06a28, { rough: 0.9 }), [0.02, -0.03, 0.17], [0.09, 0.08, 0.16]));
  viewTorch.position.set(0.24, -0.22, -0.42);
  camera.add(viewTorch);
  // highlight box
  const hlGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1));
  own.push(hlGeo);
  const hlMat = new THREE.LineBasicMaterial({ color: 0xffa64d, transparent: true, opacity: 0.85, depthTest: true });
  const highlight = new THREE.LineSegments(hlGeo, hlMat);
  highlight.visible = false;
  highlight.renderOrder = 6;
  scene.add(highlight);
  // stars
  {
    const n = 700;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = R() * Math.PI * 2;
      const e = 0.12 + R() * 1.3;
      pos[i * 3] = Math.cos(a) * Math.cos(e) * 150;
      pos[i * 3 + 1] = Math.sin(e) * 150;
      pos[i * 3 + 2] = Math.sin(a) * Math.cos(e) * 150;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    own.push(g);
    const stars = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xcfd8ff, size: 1.6, sizeAttenuation: false, fog: false }));
    stars.userData.stars = true;
    scene.add(stars);
    var starObj = stars; // eslint-disable-line no-var
  }

  /* ---------------------------------------------------------------- per frame */
  const env = { amb: 1, dayK: 1 };
  let time = 0;
  let bob = 0;
  let poolT = 0;
  let lastPhase = null;
  let size = { w: 1, h: 1 };
  const AMB = { storage: 0.14, tunnel: 0.09, maint: 0.75, kitchen: 1, gs: 1 };

  function phaseLook(game) {
    const night = game.phase !== "day";
    if (lastPhase === game.phase) return;
    lastPhase = game.phase;
    P.lampOn.color.setHex(night ? 0x8a8576 : 0xfff4dc);
    windowMat.color.setHex(night ? 0x1d2d44 : 0xcfe2f2);
    P.screen.color.setHex(night ? 0x9fb0a8 : 0xffffff);
  }

  function render(game, dt, mode = "play") {
    time += dt;
    phaseLook(game);
    const p = game.player;
    const night = game.phase !== "day";
    const zone = zoneAt(p.x, p.z);
    // ---- camera
    if (mode === "menu") {
      const t = time * 0.06;
      camera.position.set(-6 + Math.sin(t) * 7, 2.4 + Math.sin(t * 1.7) * 0.2, 13 + Math.cos(t * 0.8) * 2.5);
      camera.rotation.set(-0.12, -Math.PI + 0.25 + Math.sin(t * 0.9) * 0.55, 0);
    } else {
      const hidden = p.hidden;
      let eyeY = game.eyeHeight();
      if (hidden) eyeY = HIDES.find((h) => h.id === hidden)?.kind === "locker" ? 1.55 : 0.78;
      const moving = p.moving && !hidden ? p.speed : 0;
      bob += moving * dt * (p.moving === 3 ? 1.35 : 1.75);
      const bobAmp = hidden ? 0 : Math.min(1, moving / 3) * (p.crouch ? 0.025 : 0.04);
      camera.position.set(p.x, eyeY + Math.abs(Math.sin(bob * Math.PI)) * bobAmp - bobAmp * 0.5, p.z);
      let pitch = p.pitch;
      let roll = Math.sin(bob * Math.PI) * bobAmp * 0.25;
      if (game.capture) {
        const k = Math.min(1, game.capture.t / 0.6);
        pitch = pitch * (1 - k) - 0.35 * k;
        roll += Math.sin(game.capture.t * 40) * 0.02 * (1 - k * 0.6);
        camera.position.y -= k * 0.35;
      }
      camera.rotation.set(pitch, p.yaw, roll);
    }
    // ---- environment by phase + zone
    const outdoor = !INDOOR.includes(zone.id) && mode !== "menu";
    const zAmb = mode === "menu" ? 0.8 : AMB[zone.id] ?? 1;
    const tgtAmb = (night ? (outdoor ? 0.32 : 0.34) : 1.0) * zAmb;
    env.amb += (tgtAmb - env.amb) * (1 - Math.exp(-dt * 3));
    hemi.intensity = env.amb * (night ? 0.55 : 1.15);
    hemi.color.setHex(night ? 0x6d84b0 : 0xd6e2ee);
    hemi.groundColor.setHex(night ? 0x14181e : 0x3a3f45);
    moon.intensity = night && outdoor ? 0.5 : 0;
    scene.fog.color.setHex(night ? (outdoor ? 0x0c1220 : 0x07090c) : 0x2a2f36);
    scene.background.copy(scene.fog.color);
    scene.fog.density = outdoor ? 0.012 : zone.id === "tunnel" || zone.id === "storage" ? 0.05 : night ? 0.035 : 0.018;
    starObj.visible = night && (outdoor || mode === "menu");
    // ---- light pool: nearest fixtures to the camera (same zone first)
    poolT -= dt;
    if (poolT <= 0) {
      poolT = 0.2;
      const cand = [];
      for (const [x, z, zid, col] of FIXTURES) {
        let I = night ? (zid === "cells" ? 0 : zid === "tunnel" ? 3 : zid === "kitchen" || zid === "cafeteria" || zid === "laundry" ? 2.2 : 4.5) : zid === "tunnel" ? 3 : 15;
        if (zid === "maint") I = night && !game.flags.has("power") ? 3 : 10;
        if (I <= 0) continue;
        const d = Math.hypot(x - camera.position.x, z - camera.position.z) + (zid === zone.id || (zid === "cells" && zone.id === "mycell") ? 0 : 7);
        cand.push({ x, z, y: zid === "tunnel" ? 2.95 : H_IN - 0.2, I, col: col ?? (night ? 0xb8c7e0 : 0xfff1dc), d, dist: zid === "tunnel" ? 7 : 13 });
      }
      if (night && !game.flags.has("floods")) for (const [x, z] of FLOODS) cand.push({ x, z, y: 7.6, I: 90, col: 0xf2f4ff, d: Math.hypot(x - camera.position.x, z - camera.position.z) - 6, dist: 38 });
      cand.sort((a, b) => a.d - b.d);
      for (let i = 0; i < POOL; i++) {
        const c = cand[i];
        const l = pool[i];
        if (!c) {
          l.intensity = 0;
          continue;
        }
        l.position.set(c.x, c.y, c.z);
        l.userData.I = c.I;
        l.distance = c.dist;
        l.color.setHex(c.col);
      }
      const top = cand.find((c) => c.y < 4);
      if (top && top.d < 16) {
        lampShadow.position.set(top.x, top.y - 0.05, top.z);
        lampShadow.target.position.set(top.x + 0.01, 0, top.z + 0.01);
        lampShadow.userData.I = top.I * 1.6;
        lampShadow.color.setHex(top.col);
      } else lampShadow.userData.I = 0;
    }
    for (const l of pool) l.intensity += ((l.userData.I || 0) - l.intensity) * (1 - Math.exp(-dt * 8));
    lampShadow.intensity += ((lampShadow.userData.I || 0) - lampShadow.intensity) * (1 - Math.exp(-dt * 8));
    // flicker in the tunnel + maintenance before power
    if (zone.id === "tunnel" || (zone.id === "maint" && night && !game.flags.has("power"))) {
      const f = Math.sin(time * 23) * Math.sin(time * 7.3) > 0.85 ? 0.35 : 1;
      for (const l of pool) l.intensity *= f;
    }
    // ---- flashlight
    const flashOn = mode === "play" && game.flashlight;
    flash.intensity = flashOn ? (night || zone.dark ? 55 : 30) : 0;
    viewTorch.visible = flashOn && !p.hidden;
    if (viewTorch.visible) {
      viewTorch.position.y = -0.22 + Math.sin(bob * Math.PI * 2) * 0.006;
      viewTorch.position.x = 0.24 + Math.cos(bob * Math.PI) * 0.006;
    }
    // ---- doors
    for (const d of game.doors) {
      const g = doorObjs.get(d.id);
      if (!g) continue;
      const k = d.open * d.open * (3 - 2 * d.open);
      const inner = g.children[0];
      if (g.userData.slide) inner.position.x = -k * g.userData.slide;
      if (g.userData.swing) g.userData.pivot.rotation.y = k * g.userData.swing;
      if (g.userData.lift) inner.position.y = k * g.userData.lift;
      if (g.userData.vent) {
        inner.rotation.x = -k * 1.45; // falls into the laundry
        g.position.x = d.def.x - k * 0.55;
      }
    }
    // ---- levers, fuse, flood box, pickups
    const seq = game.puzzle.seq;
    for (const [id, L] of Object.entries(levers)) {
      const up = game.flags.has("power") || seq.includes(id) ? 1 : 0;
      L.up += (up - L.up) * (1 - Math.exp(-dt * 12));
      L.arm.rotation.z = -0.7 + L.up * 1.4;
      L.led.material = up ? P.ledGreen : P.ledRed;
    }
    fuseDoor.rotation.y = game.flags.has("fuse") ? -1.9 : 0;
    fuseWire.visible = game.flags.has("fuse");
    floodCover.visible = !game.flags.has("floodpanel") && !game.flags.has("floods");
    floodSwitch.rotation.z = game.flags.has("floods") ? -1.2 : 0.4;
    for (const pk of pickups) {
      pk.obj.visible = !game.got.has(pk.item);
      if (pk.obj.visible) {
        const glow = 0.12 + Math.max(0, Math.sin(time * 3)) * 0.25;
        pk.obj.traverse((m) => {
          if (m.isMesh && m.material.emissive) {
            m.material.emissive.setHex(0xffa64d);
            m.material.emissiveIntensity = glow;
          }
        });
      }
    }
    for (const pl of poles) pl.lampMat.color.setHex(night && !game.flags.has("floods") ? 0xffffff : 0x3a3d40);
    // ---- guards
    const alertCh = (g) => (g.state === "chase" ? "!" : g.state === "suspicious" || g.state === "investigate" || g.state === "searching" ? "?" : null);
    for (const g of game.guards) {
      const o = guardObjs.get(g.id);
      o.root.visible = g.active;
      if (!g.active) continue;
      o.root.position.set(g.x, 0, g.z);
      o.root.rotation.y = g.yaw + Math.PI;
      const torch = night && !g.def.cook;
      animatePerson(o.root, { speed: g.speed, phase: g.phase, t: time, torch, alert: g.aware });
      o.beam.visible = torch;
      const ch = alertCh(g);
      o.icon.visible = !!ch && mode === "play";
      if (ch && ch !== o.iconCh) {
        o.icon.material.map = alertTexture(kit, ch);
        o.icon.material.needsUpdate = true;
        o.iconCh = ch;
      }
      if (ch) {
        const s = 0.32 + g.aware * 0.18 + (ch === "!" ? Math.sin(time * 14) * 0.03 : 0);
        o.icon.scale.set(s, s, 1);
        o.icon.material.opacity = ch === "!" ? 1 : 0.55 + g.aware * 0.45;
      }
    }
    for (const n of game.inmates) {
      const root = inmateObjs.get(n.id);
      root.position.set(n.x, 0, n.z);
      root.rotation.y = n.yaw + Math.PI;
      animatePerson(root, { speed: n.speed || 0, phase: n.phase || 0, pose: n.pose, t: time + n.id.length });
    }
    // ---- cameras + searchlights
    for (const c of game.cams) {
      const o = camObjs.get(c.id);
      o.g.visible = true;
      o.head.rotation.y = c.active ? c.yaw : c.base;
      o.cone.visible = c.active;
      o.cone.material.opacity = 0.035 + c.aware * 0.09;
      o.led.visible = c.active && Math.sin(time * 6 + c.x) > -0.2;
    }
    if (mode === "menu") for (const o of camObjs.values()) o.cone.visible = false;
    for (const so of slObjs) {
      const l = game.lights.find((x) => x.id === so.s.id);
      const on = l.on;
      so.beam.visible = so.pool.visible = on;
      so.light.intensity = on ? 900 : 0;
      if (!on) continue;
      const [cx, cz] = l.cx || l.cz ? [l.cx, l.cz] : so.s.path(game.clock);
      so.light.target.position.set(cx, 0, cz);
      so.pool.position.set(cx, 0.03, cz);
      so.pool.material.opacity = l.hit ? 0.3 : 0.16;
      // beam: cylinder from the housing down to the pool
      const dx = cx - so.s.x;
      const dy = -so.s.y;
      const dz = cz - so.s.z;
      const len = Math.hypot(dx, dy, dz);
      so.beam.position.set(so.s.x, so.s.y, so.s.z);
      so.beam.scale.set(so.s.r, len, so.s.r);
      so.beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), _v.set(dx / len, dy / len, dz / len));
      so.housing.lookAt(cx, 0, cz);
    }
    renderer.render(scene, camera);
  }

  /** Outline the targeted interactable (box from its prop or sphere). */
  function setTarget(it) {
    if (!it || it.kind === "guard" || it.kind === "inmate" || (it.kind === "hide" && it.label === "Hiding")) {
      highlight.visible = false;
      return;
    }
    let b = null;
    if (it.kind === "door") {
      const db = doorBox(it.door.def);
      b = { ...db, y2: Math.min(db.y2, it.door.def.kind === "vent" ? 0.95 : it.door.def.kind === "fencepanel" ? 1.15 : 2.3) };
      if (it.door.def.lock === "keypad" || it.door.def.id === "exitA" || it.door.def.id === "check") {
        b = { x1: it.x - 0.16, x2: it.x + 0.16, y1: 1.12, y2: 1.48, z1: it.z - 0.16, z2: it.z + 0.16 };
        if (it.door.def.id === "check") b = { x1: 20.42, x2: 20.68, y1: 1.12, y2: 1.48, z1: 3.1, z2: 3.3 };
      }
    } else if (it.owner && it.kind !== "hide" && !["gsdesk", "monitors", "release", "rulebook", "logbook"].includes(it.key)) {
      const prop = PROPS.find((p) => p.id === it.owner);
      if (prop) b = propBoxes(prop)[0];
    } else if (it.kind === "hide") {
      const prop = PROPS.find((p) => p.id === it.key);
      if (prop) b = propBoxes(prop)[0];
    }
    if (!b) {
      const r = it.r * 0.8;
      b = { x1: it.x - r, x2: it.x + r, y1: it.y - r, y2: it.y + r, z1: it.z - r, z2: it.z + r };
    }
    const pad = 0.03;
    highlight.visible = true;
    highlight.position.set((b.x1 + b.x2) / 2, (b.y1 + b.y2) / 2, (b.z1 + b.z2) / 2);
    highlight.scale.set(b.x2 - b.x1 + pad, b.y2 - b.y1 + pad, b.z2 - b.z1 + pad);
    hlMat.opacity = 0.55 + Math.sin(time * 6) * 0.25;
  }

  function resize(w, h) {
    size = { w: Math.max(1, Math.floor(w)), h: Math.max(1, Math.floor(h)) };
    renderer.setSize(size.w, size.h, false);
    camera.aspect = size.w / size.h;
    camera.updateProjectionMatrix();
  }

  function dispose() {
    const kitMats = new Set(kit.mats.values());
    scene.traverse((o) => {
      if (o.isSprite) o.material.dispose();
      if (o.isInstancedMesh) o.dispose();
      if ((o.isMesh || o.isPoints || o.isLineSegments) && o.material && !kitMats.has(o.material) && !o.isSprite) {
        if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
        else o.material.dispose?.();
      }
    });
    for (const g of own) g.dispose();
    hlMat.dispose();
    kit.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  }

  return {
    renderer, scene, camera, kit, render, resize, setTarget, dispose,
    /** Camera eye + forward direction for crosshair picking. */
    look() {
      const d = new THREE.Vector3(0, 0, -1).applyEuler(camera.rotation);
      return { eye: { x: camera.position.x, y: camera.position.y, z: camera.position.z }, dir: { x: d.x, y: d.y, z: d.z } };
    },
    stats: () => ({ calls: renderer.info.render.calls, tris: renderer.info.render.triangles, geos: renderer.info.memory.geometries, tex: renderer.info.memory.textures }),
  };
}
