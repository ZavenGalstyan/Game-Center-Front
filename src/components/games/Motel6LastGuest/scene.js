/**
 * Motel 6: Last Guest — the motel in plain Three.js.
 *
 * Compact set: lobby + reception desk (0,0) · hallway with rooms 1–12 (x 5→23)
 * · storage room behind the desk · rainy parking lot with the neon sign.
 * Guests are built from the same face spec as their ID photo. Each guest has
 * TWO bodies: what your eyes see (layer EYE) and what the cameras see (layer
 * CAM) — that difference is the CCTV clue. All textures are canvas-generated.
 *
 * The React shell owns the loop: world.update(dt, input) + world.render().
 */
import * as THREE from "three";
import { buildGuest } from "./guestModel.js";

export const EYE = 1;
export const CAM = 2;
export const DESK_POSE = { x: 0, y: 1.62, z: -2.45, yaw: Math.PI, pitch: -0.1 };
export const CCTV_NAMES = ["CAM 1 — LOBBY", "CAM 2 — PARKING LOT", "CAM 3 — HALLWAY", "CAM 4 — STORAGE"];

const GUEST_SPOT = new THREE.Vector3(0, 0, -0.2);
const CLERK = new THREE.Vector3(0, 1.62, -2.45);
const DOOR_OUT = new THREE.Vector3(0, 0, 7.2);
const HALL_IN = [new THREE.Vector3(3.8, 0, 1.1), new THREE.Vector3(7.5, 0, 1.1)];
const LOT_SLOTS = [[-3.3, 8.6], [6.4, 6.6], [9.4, 6.6], [12.4, 6.6], [15.4, 6.6], [-6.4, 8.6], [18.4, 6.6]];
const GUEST_SLOT = [2.6, 8.6];
const HALL_DOORS = [];
for (let k = 0; k < 6; k++) {
  HALL_DOORS.push({ room: 2 * k + 1, x: 6.8 + k * 2.8, z: 2.1, face: -1 });
  HALL_DOORS.push({ room: 2 * k + 2, x: 6.8 + k * 2.8, z: 0.1, face: 1 });
}

// walkable rectangles (already shrunk by the player radius) and blockers
const R = 0.28;
const WALK = [
  [-5 + R, 5 - R, -4 + R, 3.85 - R], // lobby
  [-3.72, -3.28, -4.5, -3.5], // storage doorway
  [-5 + R, -1 - R, -8 + R, -4 - R + 0.05], // storage
  [4.4, 5.6, 0.86, 1.34], // hallway doorway
  [5 + R, 23 - R, 0.1 + R, 2.1 - R], // hallway
];
const BLOCK = [
  [-3.6, 2.1, -2.0, -0.52], // counter + work surface
  [-5, -4.3, 2.6, 3.85], // brochure rack + plant
  [-1.45, -0.95, -7.95, -4.2], // storage shelves
  [3.95, 4.95, 2.75, 3.85], // vending machine
  [-4.95, -4.05, 1.0, 2.6], // chairs
];

/* ------------------------------------------------------------------ helpers */
function canvasTex(w, h, draw, { repeat = null, srgb = true } = {}) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  draw(ctx, w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  t.anisotropy = 4;
  t.userData.canvas = c;
  t.userData.ctx = ctx;
  return t;
}
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}
function setLayer(obj, ...layers) {
  obj.traverse((o) => {
    o.layers.disableAll();
    for (const l of layers) o.layers.enable(l);
  });
}

/* ------------------------------------------------------------------ textures */
function makeTextures() {
  const r = rng(11);
  const T = {};
  T.lino = canvasTex(256, 256, (c, w, h) => {
    for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) {
      c.fillStyle = (x + y) % 2 ? "#2c2a27" : "#8c8676";
      c.fillRect(x * 128, y * 128, 128, 128);
    }
    for (let i = 0; i < 1400; i++) {
      c.fillStyle = `rgba(0,0,0,${r() * 0.08})`;
      c.fillRect(r() * w, r() * h, 2 + r() * 6, 2 + r() * 6);
    }
    c.fillStyle = "rgba(60,40,20,0.18)";
    c.beginPath(); c.ellipse(170, 90, 60, 30, 0.4, 0, Math.PI * 2); c.fill();
  }, { repeat: [5, 4] });
  T.wall = canvasTex(256, 256, (c, w, h) => {
    c.fillStyle = "#4f5a47";
    c.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 32) {
      c.fillStyle = "#56624c";
      c.fillRect(x, 0, 14, h);
      c.fillStyle = "rgba(170,150,90,0.18)";
      for (let y = 8; y < h; y += 26) { c.beginPath(); c.arc(x + 7, y, 3, 0, Math.PI * 2); c.fill(); }
    }
    for (let i = 0; i < 6; i++) {
      const g = c.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, "rgba(60,45,20,0)");
      g.addColorStop(1, "rgba(60,45,20,0.25)");
      c.fillStyle = g;
      c.fillRect(r() * w, r() * 60, 6 + r() * 20, h);
    }
  }, { repeat: [3, 1] });
  T.wainscot = canvasTex(128, 128, (c, w, h) => {
    c.fillStyle = "#3a2618";
    c.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 16) { c.fillStyle = "rgba(0,0,0,0.35)"; c.fillRect(x, 0, 2, h); }
    for (let i = 0; i < 300; i++) { c.fillStyle = `rgba(90,60,30,${r() * 0.3})`; c.fillRect(r() * w, r() * h, 1, 8 + r() * 30); }
  }, { repeat: [6, 1] });
  T.ceiling = canvasTex(128, 128, (c, w, h) => {
    c.fillStyle = "#b9b4a6";
    c.fillRect(0, 0, w, h);
    c.strokeStyle = "#6e6a60";
    c.lineWidth = 3;
    c.strokeRect(0, 0, w, h);
    for (let i = 0; i < 500; i++) { c.fillStyle = `rgba(70,60,40,${r() * 0.18})`; c.fillRect(r() * w, r() * h, 1.5, 1.5); }
    c.fillStyle = "rgba(110,80,40,0.25)";
    c.beginPath(); c.arc(80, 60, 22, 0, Math.PI * 2); c.fill();
  }, { repeat: [8, 6] });
  T.carpet = canvasTex(128, 128, (c, w, h) => {
    c.fillStyle = "#3c1214";
    c.fillRect(0, 0, w, h);
    c.strokeStyle = "#6b2a1c";
    c.lineWidth = 3;
    for (let i = 0; i < 4; i++) {
      c.beginPath();
      c.moveTo(i * 32, 64); c.lineTo(i * 32 + 16, 48); c.lineTo(i * 32 + 32, 64); c.lineTo(i * 32 + 16, 80); c.closePath();
      c.stroke();
    }
    c.fillStyle = "#8a6a2a";
    for (let i = 0; i < 4; i++) c.fillRect(i * 32 + 14, 62, 4, 4);
    for (let i = 0; i < 800; i++) { c.fillStyle = `rgba(0,0,0,${r() * 0.2})`; c.fillRect(r() * w, r() * h, 2, 2); }
  }, { repeat: [18, 2] });
  T.hallWall = canvasTex(128, 256, (c, w, h) => {
    c.fillStyle = "#6a5a3c";
    c.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 24) { c.fillStyle = "#73633f"; c.fillRect(x, 0, 10, h); }
    for (let i = 0; i < 900; i++) { c.fillStyle = `rgba(30,20,10,${r() * 0.12})`; c.fillRect(r() * w, r() * h, 2, 2); }
  }, { repeat: [14, 1] });
  T.wood = canvasTex(256, 64, (c, w, h) => {
    c.fillStyle = "#4a2e1b";
    c.fillRect(0, 0, w, h);
    for (let i = 0; i < 70; i++) {
      c.strokeStyle = `rgba(${20 + r() * 40},${10 + r() * 20},5,0.35)`;
      c.beginPath(); c.moveTo(0, r() * h); c.bezierCurveTo(w * 0.3, r() * h, w * 0.6, r() * h, w, r() * h); c.stroke();
    }
  });
  T.laminate = canvasTex(256, 64, (c, w, h) => {
    c.fillStyle = "#a99a7a";
    c.fillRect(0, 0, w, h);
    for (let i = 0; i < 600; i++) { c.fillStyle = `rgba(80,60,30,${r() * 0.15})`; c.fillRect(r() * w, r() * h, 2, 1); }
    c.fillStyle = "rgba(90,50,20,0.25)";
    c.beginPath(); c.arc(60, 30, 10, 0, Math.PI * 2); c.fill();
  });
  T.asphalt = canvasTex(256, 256, (c, w, h) => {
    c.fillStyle = "#121315";
    c.fillRect(0, 0, w, h);
    for (let i = 0; i < 4000; i++) { c.fillStyle = `rgba(${90 + r() * 60},${90 + r() * 60},${90 + r() * 60},${r() * 0.12})`; c.fillRect(r() * w, r() * h, 1.5, 1.5); }
    for (let i = 0; i < 10; i++) { c.fillStyle = "rgba(40,50,60,0.35)"; c.beginPath(); c.ellipse(r() * w, r() * h, 10 + r() * 30, 5 + r() * 12, r() * 3, 0, Math.PI * 2); c.fill(); }
  }, { repeat: [10, 6] });
  T.window = canvasTex(256, 512, (c, w, h) => {
    c.clearRect(0, 0, w, h);
    for (let i = 0; i < 160; i++) {
      const x = r() * w, y = r() * h, s = 1 + r() * 3.5;
      c.fillStyle = "rgba(200,220,255,0.22)";
      c.beginPath(); c.ellipse(x, y, s, s * 1.3, 0, 0, Math.PI * 2); c.fill();
      if (r() < 0.25) { c.fillStyle = "rgba(200,220,255,0.12)"; c.fillRect(x - 0.6, y, 1.2, 20 + r() * 60); }
    }
  }, { repeat: [1, 1] });
  T.metal = canvasTex(64, 64, (c, w, h) => {
    c.fillStyle = "#5b6066";
    c.fillRect(0, 0, w, h);
    for (let i = 0; i < 300; i++) { c.fillStyle = `rgba(${r() < 0.5 ? 90 : 30},${r() < 0.5 ? 50 : 30},20,${r() * 0.25})`; c.fillRect(r() * w, r() * h, 2, 2); }
  });
  T.concrete = canvasTex(128, 128, (c, w, h) => {
    c.fillStyle = "#3e3c38";
    c.fillRect(0, 0, w, h);
    for (let i = 0; i < 1500; i++) { c.fillStyle = `rgba(0,0,0,${r() * 0.15})`; c.fillRect(r() * w, r() * h, 2, 2); }
  }, { repeat: [3, 3] });
  T.brick = canvasTex(256, 128, (c, w, h) => {
    c.fillStyle = "#2a2422";
    c.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 16) for (let x = (y / 16) % 2 ? -16 : 0; x < w; x += 32) {
      c.fillStyle = `rgb(${70 + r() * 30},${44 + r() * 14},${36 + r() * 10})`;
      c.fillRect(x + 1, y + 1, 30, 14);
    }
  }, { repeat: [8, 2] });
  return T;
}

function plateTexture(text) {
  return canvasTex(128, 64, (c) => {
    c.fillStyle = "#e8e4d4";
    c.fillRect(0, 0, 128, 64);
    c.strokeStyle = "#20304a";
    c.lineWidth = 4;
    c.strokeRect(3, 3, 122, 58);
    c.fillStyle = "#18263f";
    c.font = "bold 24px monospace";
    c.textAlign = "center";
    c.fillText(text || "", 64, 42);
  });
}
function numberTexture(n, opts = {}) {
  return canvasTex(64, 64, (c) => {
    c.fillStyle = opts.bg || "#1a120c";
    c.fillRect(0, 0, 64, 64);
    c.strokeStyle = "#b08a3a";
    c.lineWidth = 3;
    c.strokeRect(4, 4, 56, 56);
    c.fillStyle = "#d8b25a";
    c.font = "bold 34px Georgia, serif";
    c.textAlign = "center";
    c.fillText(String(n), 32, 45);
  });
}

function buildCar(color, plate) {
  const g = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0 });
  const dark = new THREE.MeshLambertMaterial({ color: 0x0c0d10 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x1a2430, roughness: 0.1 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.6, 4.3), paint);
  body.position.y = 0.55;
  g.add(body);
  const cab = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.5, 2.2), glass);
  cab.position.set(0, 1.08, 0.2);
  g.add(cab);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.06, 1.9), paint);
  roof.position.set(0, 1.35, 0.25);
  g.add(roof);
  for (const [x, z] of [[-0.85, 1.35], [0.85, 1.35], [-0.85, -1.35], [0.85, -1.35]]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.24, 14), dark);
    w.rotation.z = Math.PI / 2;
    w.position.set(x, 0.34, z);
    g.add(w);
  }
  const pt = plateTexture(plate);
  const pm = new THREE.MeshBasicMaterial({ map: pt, color: 0xbbbbbb });
  for (const s of [-1, 1]) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.21), pm);
    p.position.set(0, 0.5, s * 2.16);
    if (s < 0) p.rotation.y = Math.PI;
    g.add(p);
  }
  const tail = new THREE.MeshBasicMaterial({ color: 0x5a0a0a });
  for (const s of [-1, 1]) {
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.04), tail);
    l.position.set(s * 0.65, 0.68, 2.16);
    g.add(l);
  }
  return g;
}

/* ================================================================== world */
export function createWorld(container, { test = false } = {}) {
  const canvas = document.createElement("canvas");
  canvas.className = "m6-canvas";
  container.appendChild(canvas);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: test, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x05060a);
  scene.fog = new THREE.FogExp2(0x07080d, 0.035);
  const camera = new THREE.PerspectiveCamera(56, 16 / 9, 0.05, 90);
  camera.rotation.order = "YXZ";
  camera.layers.enable(EYE);
  scene.add(camera);

  const T = makeTextures();
  const disposables = [];
  const keep = (x) => (disposables.push(x), x);
  const M = {
    lino: new THREE.MeshLambertMaterial({ map: T.lino }),
    wall: new THREE.MeshLambertMaterial({ map: T.wall }),
    wains: new THREE.MeshLambertMaterial({ map: T.wainscot }),
    ceil: new THREE.MeshLambertMaterial({ map: T.ceiling }),
    carpet: new THREE.MeshLambertMaterial({ map: T.carpet }),
    hallWall: new THREE.MeshLambertMaterial({ map: T.hallWall }),
    wood: new THREE.MeshLambertMaterial({ map: T.wood }),
    lam: new THREE.MeshLambertMaterial({ map: T.laminate }),
    metal: new THREE.MeshLambertMaterial({ map: T.metal }),
    concrete: new THREE.MeshLambertMaterial({ map: T.concrete }),
    brick: new THREE.MeshLambertMaterial({ map: T.brick }),
    asphalt: new THREE.MeshStandardMaterial({ map: T.asphalt, roughness: 0.28, metalness: 0, color: 0x9aa0a8 }),
    dark: new THREE.MeshLambertMaterial({ color: 0x0e0f12 }),
    beige: new THREE.MeshLambertMaterial({ color: 0xb8ad94 }),
    black: new THREE.MeshLambertMaterial({ color: 0x111111 }),
    sheet: new THREE.MeshLambertMaterial({ color: 0xc9c4b8 }),
    tube: new THREE.MeshBasicMaterial({ color: 0xe8f0ff }),
    red: new THREE.MeshLambertMaterial({ color: 0x7a1414 }),
    brass: new THREE.MeshLambertMaterial({ color: 0xa8843a, emissive: 0x1a1206 }),
    paper: new THREE.MeshLambertMaterial({ color: 0xe6dcc0 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x8fa3b8, roughness: 0.05, transparent: true, opacity: 0.16, depthWrite: false }),
    rainGlass: new THREE.MeshBasicMaterial({ map: T.window, transparent: true, depthWrite: false, opacity: 0.9 }),
  };
  Object.values(M).forEach(keep);

  const occluders = [];
  const WALLS = new Set([M.wall, M.hallWall, M.concrete, M.brick]);
  function box(w, h, d, mat, x, y, z, parent = scene) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    parent.add(m);
    if (WALLS.has(mat)) occluders.push(m);
    return m;
  }
  function plane(w, h, mat, x, y, z, ry = 0, rx = 0, parent = scene) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, 0);
    parent.add(m);
    return m;
  }
  const props = new Map(); // id -> { meshes: [], label }
  const pickables = [];
  function prop(id, mesh, label) {
    mesh.userData.prop = id;
    mesh.traverse((o) => { o.userData.prop = id; });
    pickables.push(mesh);
    if (!props.has(id)) props.set(id, { meshes: [], label });
    props.get(id).meshes.push(mesh);
    return mesh;
  }

  /* ---------------------------------------------------------------- lobby shell */
  const W = 0.15; // wall thickness
  plane(10, 8, M.lino, 0, 0, 0, 0, -Math.PI / 2);
  plane(10, 8, M.ceil, 0, 3, 0, 0, Math.PI / 2);
  // back wall z=-4 with storage door (x -4..-3)
  box(1, 3, W, M.wall, -4.5, 1.5, -4);
  box(8, 3, W, M.wall, 1, 1.5, -4);
  box(1, 0.9, W, M.wall, -3.5, 2.55, -4);
  // left wall
  box(W, 3, 8, M.wall, -5, 1.5, 0);
  // right wall with hallway door z 0.6..1.6
  box(W, 3, 4.6, M.wall, 5, 1.5, -1.7);
  box(W, 3, 2.4, M.wall, 5, 1.5, 2.8);
  box(W, 0.8, 1, M.wall, 5, 2.6, 1.1);
  // front wall z=4: windows x[-4.5,-1.2] & [1.2,4.5] y .9–2.75, door x[-0.6,0.6] y 0–2.3
  box(4.4, 0.9, W, M.brick, -2.8, 0.45, 4);
  box(4.4, 0.9, W, M.brick, 2.8, 0.45, 4);
  box(10, 0.25, W, M.brick, 0, 2.875, 4);
  box(1.2, 0.45, W, M.brick, 0, 2.525, 4);
  for (const [x, w] of [[-4.75, 0.5], [-0.9, 0.6], [0.9, 0.6], [4.75, 0.5]]) box(w, 1.85, W, M.brick, x, 1.825, 4);
  const winL = plane(3.3, 1.85, M.glass, -2.85, 1.825, 4, Math.PI);
  const winR = plane(3.3, 1.85, M.glass, 2.85, 1.825, 4, Math.PI);
  const rainL = plane(3.3, 1.85, M.rainGlass, -2.85, 1.825, 3.97, Math.PI);
  const rainR = plane(3.3, 1.85, M.rainGlass, 2.85, 1.825, 3.97, Math.PI);
  void winL; void winR; void rainL; void rainR;
  // glass door (pivot on the left jamb)
  const doorPivot = new THREE.Group();
  doorPivot.position.set(-0.6, 0, 4);
  scene.add(doorPivot);
  const doorGlass = plane(1.2, 2.3, M.glass, 0.6, 1.15, 0, Math.PI, 0, doorPivot);
  void doorGlass;
  box(1.2, 0.08, 0.06, M.metal, 0.6, 2.28, 0, doorPivot);
  box(0.06, 2.3, 0.06, M.metal, 0.03, 1.15, 0, doorPivot);
  box(0.06, 2.3, 0.06, M.metal, 1.17, 1.15, 0, doorPivot);
  box(0.9, 0.05, 0.08, M.metal, 0.6, 1.05, -0.05, doorPivot);
  prop("frontdoor", box(1.2, 2.3, 0.2, new THREE.MeshBasicMaterial({ visible: false }), 0, 1.15, 3.95), "Front door");
  const openSign = canvasTex(128, 48, (c) => {
    c.fillStyle = "#200"; c.fillRect(0, 0, 128, 48);
    c.fillStyle = "#ff3b3b"; c.font = "bold 30px sans-serif"; c.textAlign = "center"; c.fillText("OPEN", 64, 36);
  });
  const openMat = keep(new THREE.MeshBasicMaterial({ map: openSign }));
  plane(0.45, 0.17, openMat, 0.95, 2.1, 3.92, Math.PI);
  // wainscot strips
  box(0.04, 1, 7.9, M.wains, -4.91, 0.5, 0);
  box(4.5, 1, 0.04, M.wains, 2.6, 0.5, -3.91);
  // fluorescent fixtures
  const tubes = [];
  for (const [x, z] of [[-1.6, 1.2], [1.6, 1.2], [0, -2.4]]) {
    box(1.3, 0.06, 0.3, M.metal, x, 2.96, z);
    tubes.push(box(1.2, 0.035, 0.2, M.tube.clone(), x, 2.925, z));
  }
  tubes.forEach((t) => keep(t.material));
  // reception desk
  box(5.7, 1.1, 0.12, M.wood, -0.75, 0.55, -0.6);
  box(5.9, 0.06, 0.75, M.lam, -0.75, 1.13, -0.92);
  box(0.12, 1.1, 0.7, M.wood, -3.55, 0.55, -0.95);
  box(5.7, 0.05, 0.75, M.lam, -0.75, 0.78, -1.62);
  box(5.7, 0.78, 0.05, M.wood, -0.75, 0.39, -1.28);
  // drawer (examine)
  const drawer = box(0.7, 0.18, 0.05, M.wood, -2.2, 0.66, -2.0);
  box(0.16, 0.025, 0.04, M.brass, -2.2, 0.66, -2.03);
  prop("drawer", drawer, "Desk drawer");
  prop("drawer", box(0.7, 0.62, 0.7, M.wood, -2.2, 0.39, -1.63), "Desk drawer");
  // desk sign "RING FOR SERVICE" & bell
  const bell = new THREE.Group();
  bell.position.set(-0.45, 1.16, -0.85);
  const bellDome = new THREE.Mesh(new THREE.SphereGeometry(0.06, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), M.brass);
  bell.add(bellDome);
  const bellBase = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.08, 0.02, 16), M.black);
  bellBase.position.y = -0.005;
  bell.add(bellBase);
  scene.add(bell);
  // register book on the counter
  const regTex = canvasTex(256, 160, (c) => {
    c.fillStyle = "#e8dcc0"; c.fillRect(0, 0, 256, 160);
    c.strokeStyle = "#9a8a6a";
    for (let y = 20; y < 160; y += 12) { c.beginPath(); c.moveTo(6, y); c.lineTo(250, y); c.stroke(); }
    c.fillStyle = "#2a2a4a"; c.font = "10px serif";
    for (let y = 30; y < 150; y += 12) c.fillText("~~~~ ~~~~~   ~~   ~~~~~~", 12 + (y % 3) * 6, y);
    c.fillStyle = "#3a1a10"; c.fillRect(126, 0, 4, 160);
  });
  plane(0.5, 0.32, keep(new THREE.MeshLambertMaterial({ map: regTex })), 0.4, 1.165, -0.95, 0, -Math.PI / 2);
  // rulebook binder
  box(0.26, 0.05, 0.34, M.red, -0.25, 0.83, -1.62);
  // phone
  const phone = new THREE.Group();
  phone.position.set(1.85, 0.81, -1.6);
  box(0.24, 0.08, 0.2, M.black, 0, 0, 0, phone);
  const handset = box(0.26, 0.05, 0.06, M.black, 0, 0.07, 0, phone);
  const phoneLamp = new THREE.Mesh(new THREE.SphereGeometry(0.015, 8, 6), new THREE.MeshBasicMaterial({ color: 0x330000 }));
  phoneLamp.position.set(0.09, 0.045, -0.1);
  phone.add(phoneLamp);
  keep(phoneLamp.material);
  scene.add(phone);
  // CRT terminal
  const crt = new THREE.Group();
  crt.position.set(1.02, 1.16, -0.95);
  crt.rotation.y = 0.55;
  crt.scale.setScalar(0.78);
  box(0.5, 0.42, 0.45, M.beige, 0, 0.24, 0.05, crt);
  box(0.36, 0.3, 0.2, M.beige, 0, 0.22, 0.32, crt);
  box(0.5, 0.03, 0.2, M.beige, 0, 0.015, -0.32, crt);
  const termTex = canvasTex(320, 240, (c) => { c.fillStyle = "#031006"; c.fillRect(0, 0, 320, 240); });
  const termMat = keep(new THREE.MeshBasicMaterial({ map: termTex }));
  const termScreen = plane(0.4, 0.3, termMat, 0, 0.25, -0.18, Math.PI, 0, crt);
  void termScreen;
  scene.add(crt);
  // CCTV monitor on the counter (render target, cycles cameras)
  const rtA = keep(new THREE.WebGLRenderTarget(320, 200));
  rtA.texture.colorSpace = THREE.SRGBColorSpace;
  const monMats = [keep(new THREE.MeshBasicMaterial({ map: rtA.texture, color: 0xa8d8b0 }))];
  const monOff = keep(new THREE.MeshBasicMaterial({ color: 0x050806 }));
  const monScreens = [];
  const mon = new THREE.Group();
  mon.position.set(-1.02, 1.16, -0.95);
  mon.rotation.y = -0.55;
  mon.scale.setScalar(0.78);
  box(0.5, 0.38, 0.36, M.dark, 0, 0.24, 0, mon);
  box(0.14, 0.05, 0.2, M.dark, 0, 0.025, 0, mon);
  monScreens.push(plane(0.42, 0.29, monMats[0], 0, 0.25, -0.185, Math.PI, 0, mon));
  scene.add(mon);
  // key rack on the back wall
  const keyTex = canvasTex(256, 128, (c) => {
    c.fillStyle = "#3a2414"; c.fillRect(0, 0, 256, 128);
    c.font = "bold 14px sans-serif"; c.textAlign = "center";
    for (let i = 0; i < 13; i++) {
      const x = 14 + (i % 7) * 36, y = i < 7 ? 30 : 92;
      c.fillStyle = "#c9a85a"; c.fillText(String(i + 1), x, y - 12);
      c.fillStyle = "#888"; c.beginPath(); c.arc(x, y, 3, 0, Math.PI * 2); c.fill();
      if (i < 12 && i !== 7) { c.fillStyle = "#b8862a"; c.fillRect(x - 5, y + 4, 10, 20); }
    }
    c.fillStyle = "#3a2414"; c.fillRect(220, 60, 36, 50);
  });
  plane(1.2, 0.6, keep(new THREE.MeshLambertMaterial({ map: keyTex })), 0.8, 1.7, -3.92, 0);
  // wall clock above the key rack
  const clockTex = canvasTex(128, 128, () => {});
  const clockMat = keep(new THREE.MeshBasicMaterial({ map: clockTex, transparent: true }));
  plane(0.42, 0.42, clockMat, -1.0, 2.35, -3.92, 0);
  // rules poster
  const posterTex = canvasTex(128, 180, (c) => {
    c.fillStyle = "#d8cfb4"; c.fillRect(0, 0, 128, 180);
    c.fillStyle = "#6a0d0d"; c.font = "bold 13px sans-serif"; c.textAlign = "center";
    c.fillText("NIGHT STAFF", 64, 22); c.fillText("RULES", 64, 38);
    c.fillStyle = "#222"; c.font = "9px sans-serif"; c.textAlign = "left";
    ["1. Check every ID", "2. Check every booking", "3. Never leave the desk", "   after midnight", "4. There is no", "   Room 13", "5. Do not answer", "   knocking"].forEach((l, i) => c.fillText(l, 10, 62 + i * 13));
  });
  plane(0.5, 0.7, keep(new THREE.MeshLambertMaterial({ map: posterTex })), 2.6, 1.7, -3.92, 0);
  // brochure rack (left wall, near the front)
  const rack = new THREE.Group();
  rack.position.set(-4.85, 0, 3.0);
  box(0.25, 1.4, 0.7, M.wood, 0, 0.7, 0, rack);
  const broCols = [0x2a6a8a, 0xb8862a, 0x6a2a2a, 0x3a7a3a, 0x8a3a6a, 0x2a2a6a];
  broCols.forEach((col, i) => {
    const m = keep(new THREE.MeshLambertMaterial({ color: col }));
    box(0.03, 0.22, 0.14, m, 0.14, 0.55 + Math.floor(i / 2) * 0.3, -0.15 + (i % 2) * 0.3, rack);
  });
  scene.add(rack);
  prop("brochures", rack, "Brochure rack");
  // waiting chairs + dead plant
  for (const z of [1.3, 2.2]) {
    box(0.7, 0.08, 0.7, M.red, -4.5, 0.45, z);
    box(0.08, 0.6, 0.7, M.red, -4.85, 0.75, z);
    box(0.06, 0.45, 0.06, M.metal, -4.5, 0.22, z);
  }
  box(0.4, 0.4, 0.4, M.concrete, -4.6, 0.2, 3.55);
  const plantM = keep(new THREE.MeshLambertMaterial({ color: 0x3a3418 }));
  for (let i = 0; i < 5; i++) {
    const leaf = box(0.04, 0.6, 0.12, plantM, -4.6 + Math.cos(i) * 0.08, 0.65, 3.55 + Math.sin(i) * 0.08);
    leaf.rotation.set(Math.sin(i * 2) * 0.5, i, Math.cos(i * 3) * 0.5);
  }
  // vending machine
  const vend = new THREE.Group();
  vend.position.set(4.45, 0, 3.3);
  box(0.95, 1.9, 0.75, M.red, 0, 0.95, 0, vend);
  const vendTex = canvasTex(64, 128, (c) => {
    c.fillStyle = "#16324a"; c.fillRect(0, 0, 64, 128);
    const cols = ["#c0392b", "#e6b422", "#2e86c1", "#27ae60", "#d35400"];
    for (let r = 0; r < 6; r++) for (let k = 0; k < 4; k++) { c.fillStyle = cols[(r + k) % 5]; c.fillRect(6 + k * 14, 8 + r * 19, 9, 14); }
    c.fillStyle = "rgba(200,230,255,0.18)"; c.fillRect(0, 0, 64, 128);
  });
  const vendPanel = keep(new THREE.MeshBasicMaterial({ map: vendTex, color: 0xb0c8d8 }));
  plane(0.6, 1.1, vendPanel, -0.2, 1.15, -0.38, Math.PI, 0, vend);
  scene.add(vend);

  /* ---------------------------------------------------------------- storage room */
  plane(4, 4, M.concrete, -3, 0.001, -6, 0, -Math.PI / 2);
  plane(4, 4, M.concrete, -3, 2.8, -6, 0, Math.PI / 2);
  box(W, 2.8, 4, M.concrete, -5, 1.4, -6);
  box(W, 2.8, 4, M.concrete, -1, 1.4, -6);
  box(4, 2.8, W, M.concrete, -3, 1.4, -8);
  // shelves with boxes
  const boxM = keep(new THREE.MeshLambertMaterial({ color: 0x6a5236 }));
  for (const y of [0.4, 1.0, 1.6, 2.2]) {
    box(0.45, 0.04, 3.6, M.metal, -1.25, y, -6.05);
    for (let i = 0; i < 4; i++) if ((i + y * 10) % 3 !== 1) box(0.35, 0.3, 0.5, boxM, -1.25, y + 0.17, -7.4 + i * 0.85 + (y % 0.3));
  }
  for (const z of [-4.3, -7.8]) for (const x of [-1.05, -1.45]) box(0.04, 2.4, 0.04, M.metal, x, 1.2, z);
  // sheet-covered furniture
  const sheet = box(1.2, 0.9, 0.8, M.sheet, -3.0, 0.45, -7.4);
  sheet.rotation.y = 0.15;
  box(0.6, 1.5, 0.6, M.sheet, -4.4, 0.75, -7.4);
  // breaker panel
  const breaker = new THREE.Group();
  breaker.position.set(-4.92, 1.45, -6.2);
  box(0.08, 0.7, 0.5, M.metal, 0, 0, 0, breaker);
  const lever = box(0.1, 0.18, 0.05, M.red, 0.07, 0.05, 0, breaker);
  scene.add(breaker);
  prop("breaker", breaker, "Breaker panel");
  box(0.4, 0.2, 0.25, M.red, -4.75, 0.1, -6.2); // toolbox
  // diary page pinned next to the breaker
  const diary = plane(0.2, 0.26, M.paper, -4.9, 1.45, -5.7, Math.PI / 2);
  diary.rotation.z = 0.08;
  prop("diary", diary, "Torn page");
  // lockbox on the shelf
  const lockbox = new THREE.Group();
  lockbox.position.set(-1.3, 1.17, -5.3);
  box(0.3, 0.22, 0.4, M.metal, 0, 0, 0, lockbox);
  const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.03, 16), M.brass);
  dial.rotation.z = Math.PI / 2;
  dial.position.set(0.16, 0, 0);
  lockbox.add(dial);
  scene.add(lockbox);
  prop("lockbox", lockbox, "Lockbox");
  // bare bulb
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), keep(new THREE.MeshBasicMaterial({ color: 0xffd28a })));
  bulb.position.set(-3, 2.45, -6);
  scene.add(bulb);
  box(0.01, 0.35, 0.01, M.black, -3, 2.62, -6);

  /* ---------------------------------------------------------------- hallway */
  plane(18, 2, M.carpet, 14, 0.001, 1.1, 0, -Math.PI / 2);
  plane(18, 2, M.ceil, 14, 2.8, 1.1, 0, Math.PI / 2);
  box(18, 2.8, W, M.hallWall, 14, 1.4, 2.1 + W / 2);
  box(18, 2.8, W, M.hallWall, 14, 1.4, 0.1 - W / 2);
  const endWallTex = canvasTex(128, 256, (c) => {
    c.fillStyle = "#6a5a3c"; c.fillRect(0, 0, 128, 256);
    c.strokeStyle = "rgba(40,28,14,0.55)"; c.lineWidth = 4; c.strokeRect(34, 60, 60, 196);
    c.fillStyle = "rgba(40,28,14,0.3)"; c.fillRect(54, 70, 20, 14);
  });
  const endWall = box(W, 2.8, 2, keep(new THREE.MeshLambertMaterial({ map: endWallTex })), 23 + W / 2, 1.4, 1.1);
  prop("door13wall", endWall, "End of the hallway");
  const doorMeshes = {};
  const doorWood = keep(new THREE.MeshLambertMaterial({ color: 0x5a2e1c }));
  for (const d of HALL_DOORS) {
    const g = new THREE.Group();
    g.position.set(d.x, 0, d.z + d.face * 0.04);
    if (d.face < 0) g.rotation.y = Math.PI;
    box(0.95, 2.1, 0.06, doorWood, 0, 1.05, 0, g);
    box(1.08, 0.08, 0.08, M.wood, 0, 2.12, 0, g);
    const num = plane(0.16, 0.16, keep(new THREE.MeshBasicMaterial({ map: numberTexture(d.room) })), 0, 1.62, 0.035, 0, 0, g);
    void num;
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), M.brass);
    knob.position.set(0.36, 1.0, 0.06);
    g.add(knob);
    if (d.room === 8) {
      const tape = keep(new THREE.MeshLambertMaterial({ color: 0xc9a020 }));
      const a = box(1.05, 0.08, 0.02, tape, 0, 1.2, 0.05, g);
      a.rotation.z = 0.7;
      const b = box(1.05, 0.08, 0.02, tape, 0, 1.2, 0.05, g);
      b.rotation.z = -0.7;
    }
    scene.add(g);
    prop("door" + d.room, g, `Room ${d.room}`);
    doorMeshes[d.room] = g;
  }
  // staff photo
  const photoTex = canvasTex(160, 120, (c) => {
    c.fillStyle = "#2a1a0e"; c.fillRect(0, 0, 160, 120);
    c.fillStyle = "#8a7a5e"; c.fillRect(10, 10, 140, 100);
    for (const [x, col] of [[45, "#3a2a1a"], [80, "#4a4a5a"], [115, "#c8c0b0"]]) {
      c.fillStyle = col; c.fillRect(x - 12, 60, 24, 50);
      c.fillStyle = "#c9a684"; c.beginPath(); c.arc(x, 48, 10, 0, Math.PI * 2); c.fill();
    }
  });
  const photo = plane(0.5, 0.38, keep(new THREE.MeshLambertMaterial({ map: photoTex })), 8.2, 1.6, 0.11, 0);
  prop("photo", photo, "Framed photo");
  // fallen key in front of room 5
  const key5 = new THREE.Group();
  key5.position.set(12.4, 0.015, 1.75);
  box(0.1, 0.01, 0.04, M.brass, 0, 0, 0, key5);
  box(0.06, 0.01, 0.1, keep(new THREE.MeshLambertMaterial({ color: 0x8a2a1a })), -0.08, 0, 0, key5);
  key5.rotation.y = 0.6;
  scene.add(key5);
  prop("key5", key5, "Something on the carpet");
  // phantom door 13 — cameras only
  const door13 = new THREE.Group();
  door13.position.set(22.95, 0, 1.1);
  door13.rotation.y = -Math.PI / 2;
  box(0.95, 2.1, 0.06, doorWood, -0.35, 1.05, -0.35, door13).rotation.y = 0.9;
  box(1.0, 2.1, 0.02, keep(new THREE.MeshBasicMaterial({ color: 0x000000 })), 0, 1.05, -0.01, door13);
  plane(0.16, 0.16, keep(new THREE.MeshBasicMaterial({ map: numberTexture(13, { bg: "#0a0303" }) })), -0.42, 1.62, 0.09, 0.9, 0, door13);
  scene.add(door13);
  setLayer(door13, CAM);
  door13.visible = false;
  // hallway fixtures + ice machine
  const hallTubes = [];
  for (const x of [8, 14, 20]) {
    box(1.1, 0.05, 0.25, M.metal, x, 2.77, 1.1);
    hallTubes.push(box(1.0, 0.03, 0.16, M.tube.clone(), x, 2.745, 1.1));
  }
  hallTubes.forEach((t) => keep(t.material));
  box(0.7, 1.2, 0.6, M.metal, 22.4, 0.6, 0.45);

  /* ---------------------------------------------------------------- exterior */
  const ground = plane(60, 40, M.asphalt, 5, -0.01, 16, 0, -Math.PI / 2);
  void ground;
  // parking lines
  const lineM = keep(new THREE.MeshBasicMaterial({ color: 0x8a8a70 }));
  for (const [x, z] of [...LOT_SLOTS, GUEST_SLOT]) for (const s of [-1, 1]) plane(0.08, 4.6, lineM, x + s * 1.4, 0.005, z, 0, -Math.PI / 2);
  // building exterior: lobby side walls + hallway wing
  box(10.3, 0.4, 8.3, M.concrete, 0, 3.2, 0); // lobby roof
  box(18.3, 0.4, 2.3, M.concrete, 14, 3.0, 1.1); // wing roof
  box(18, 2.8, W, M.brick, 14, 1.4, 2.1 + W * 1.5); // wing facade (outside layer)
  // lit windows on the wing (rooms)
  const winLit = keep(new THREE.MeshBasicMaterial({ color: 0xffc27a }));
  const winDark = keep(new THREE.MeshBasicMaterial({ color: 0x0b0d12 }));
  const wingWins = [];
  for (let k = 0; k < 6; k++) {
    const w = plane(0.9, 0.7, k % 3 === 1 ? winLit : winDark, 6.8 + k * 2.8, 1.6, 2.1 + W * 2 + 0.01, 0);
    wingWins.push(w);
  }
  // awning with a red strip over the entrance
  box(3.4, 0.12, 1.6, M.concrete, 0, 3.0, 4.8);
  const strip = keep(new THREE.MeshBasicMaterial({ color: 0xff2a2a }));
  box(3.4, 0.05, 0.05, strip, 0, 2.93, 5.6);
  for (const x of [-1.6, 1.6]) box(0.1, 3, 0.1, M.metal, x, 1.5, 5.55);
  // neon sign
  const signTex = canvasTex(512, 200, () => {});
  const signMat = keep(new THREE.MeshBasicMaterial({ map: signTex, transparent: true }));
  const sign = new THREE.Group();
  sign.position.set(-4.6, 0, 8.2);
  box(0.16, 4.2, 0.16, M.metal, 0, 2.1, 0, sign);
  box(3.1, 1.25, 0.25, M.black, 0, 3.35, 0, sign);
  const signFace = plane(3.0, 1.18, signMat, 0, 3.35, -0.13, Math.PI, 0, sign);
  const signBack = plane(3.0, 1.18, signMat, 0, 3.35, 0.13, 0, 0, sign);
  void signFace; void signBack;
  const vacTex = canvasTex(256, 64, () => {});
  const vacMat = keep(new THREE.MeshBasicMaterial({ map: vacTex, transparent: true }));
  box(1.7, 0.42, 0.15, M.black, 0, 2.4, 0, sign);
  plane(1.62, 0.38, vacMat, 0, 2.4, -0.08, Math.PI, 0, sign);
  plane(1.62, 0.38, vacMat, 0, 2.4, 0.08, 0, 0, sign);
  scene.add(sign);
  function drawSign(on, flick = false) {
    const c = signTex.userData.ctx;
    c.clearRect(0, 0, 512, 200);
    c.fillStyle = "#0b0405"; c.fillRect(0, 0, 512, 200);
    c.font = "bold 120px 'Arial Black', Impact, sans-serif";
    c.textAlign = "center";
    const glow = (txt, x, y, col, lit) => {
      c.shadowColor = lit ? col : "transparent";
      c.shadowBlur = lit ? 26 : 0;
      c.fillStyle = lit ? col : "#2a0c0c";
      c.fillText(txt, x, y);
      c.shadowBlur = 0;
    };
    glow("MOTEL", 205, 145, "#ff3030", on);
    glow("6", 440, 150, "#ff3030", on && !flick);
    signTex.needsUpdate = true;
    const v = vacTex.userData.ctx;
    v.clearRect(0, 0, 256, 64);
    v.fillStyle = "#050505"; v.fillRect(0, 0, 256, 64);
    v.font = "bold 34px sans-serif"; v.textAlign = "center";
    v.shadowColor = "#ff5a2a"; v.shadowBlur = on ? 14 : 0;
    v.fillStyle = on ? "#ff6a3a" : "#2a0c0c";
    v.fillText("VACANCY", 128, 45);
    vacTex.needsUpdate = true;
  }
  drawSign(true);
  // lot light pole
  box(0.14, 5.5, 0.14, M.metal, 8.5, 2.75, 12.5);
  box(0.9, 0.12, 0.3, M.metal, 8.1, 5.5, 12.5);
  const sodium = keep(new THREE.MeshBasicMaterial({ color: 0xffb36a }));
  box(0.7, 0.04, 0.22, sodium, 8.0, 5.43, 12.5);
  // trees & road
  const treeM = keep(new THREE.MeshLambertMaterial({ color: 0x0b120c }));
  const tr = rng(5);
  for (let i = 0; i < 26; i++) {
    const x = -22 + i * 1.9 + tr() * 1.2, z = 24 + tr() * 6;
    const h = 4 + tr() * 4;
    const t = new THREE.Mesh(new THREE.ConeGeometry(0.9 + tr() * 0.6, h, 7), treeM);
    t.position.set(x, h / 2, z);
    scene.add(t);
  }
  plane(70, 4, keep(new THREE.MeshLambertMaterial({ color: 0x0c0c0e })), 5, 0, 20, 0, -Math.PI / 2);
  // passing headlights
  const passer = new THREE.Group();
  const hl = keep(new THREE.MeshBasicMaterial({ color: 0xfff2c8 }));
  for (const s of [-1, 1]) box(0.25, 0.12, 0.05, hl, 0, 0.6, s * 0.7, passer).rotation.y = Math.PI / 2;
  passer.position.set(-40, 0, 20);
  scene.add(passer);
  // window scare: a pale face just outside the right window
  const scareTex = canvasTex(128, 160, (c) => {
    c.fillStyle = "rgba(0,0,0,0)"; c.clearRect(0, 0, 128, 160);
    const g = c.createRadialGradient(64, 70, 10, 64, 70, 60);
    g.addColorStop(0, "#d8d6cf"); g.addColorStop(1, "rgba(200,200,190,0)");
    c.fillStyle = g; c.beginPath(); c.ellipse(64, 72, 40, 56, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = "#000";
    c.beginPath(); c.ellipse(48, 64, 9, 11, 0, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.ellipse(80, 64, 9, 11, 0, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.ellipse(64, 108, 14, 6, 0, 0, Math.PI * 2); c.fill();
  });
  const scareFace = plane(0.55, 0.7, keep(new THREE.MeshBasicMaterial({ map: scareTex, transparent: true, depthWrite: false })), 2.2, 1.7, 4.25, Math.PI);
  scareFace.visible = false;

  /* ---------------------------------------------------------------- rain */
  const DROPS = 2600;
  const rainGeo = new THREE.BufferGeometry();
  const rpos = new Float32Array(DROPS * 6);
  const rseed = new Float32Array(DROPS * 2);
  const rr = rng(99);
  for (let i = 0; i < DROPS; i++) {
    const x = -16 + rr() * 42, z = 4.3 + rr() * 18;
    if (x > 4.8 && z < 2.6) continue;
    const y = rr() * 12, s = rr();
    rpos.set([x, y, z, x - 0.04, y - 0.38, z], i * 6);
    rseed[i * 2] = s;
    rseed[i * 2 + 1] = s;
  }
  rainGeo.setAttribute("position", new THREE.BufferAttribute(rpos, 3));
  rainGeo.setAttribute("seed", new THREE.BufferAttribute(rseed, 1));
  const rainMat = keep(new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(0x9fb4d0) } },
    vertexShader: `attribute float seed; uniform float uTime; varying float vA;
      void main(){ vec3 p = position; float fall = mod(p.y - uTime * (13.0 + seed * 5.0), 12.0); p.y = fall;
        vA = 0.18 + seed * 0.25; gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }`,
    fragmentShader: `uniform vec3 uColor; varying float vA; void main(){ gl_FragColor = vec4(uColor, vA); }`,
    transparent: true, depthWrite: false,
  }));
  const rain = new THREE.LineSegments(rainGeo, rainMat);
  rain.frustumCulled = false;
  scene.add(rain);
  keep(rainGeo);

  /* ---------------------------------------------------------------- lights */
  const amb = new THREE.AmbientLight(0x2a3040, 0.55);
  scene.add(amb);
  const lobbyLights = [new THREE.PointLight(0xe4ecff, 9, 11, 1.6), new THREE.PointLight(0xe4ecff, 7, 9, 1.6)];
  lobbyLights[0].position.set(0, 2.7, 1.0);
  lobbyLights[1].position.set(0, 2.7, -2.4);
  const hallLights = [8, 14, 20].map((x) => {
    const l = new THREE.PointLight(0xf0e6c8, 5, 7, 1.7);
    l.position.set(x, 2.55, 1.1);
    return l;
  });
  const storageLight = new THREE.PointLight(0xffc27a, 2.2, 5.5, 1.8);
  storageLight.position.set(-3, 2.3, -6);
  const neonLight = new THREE.PointLight(0xff2a2a, 14, 14, 1.6);
  neonLight.position.set(-4.6, 3.4, 7.4);
  const lotLight = new THREE.PointLight(0xffa860, 22, 18, 1.5);
  lotLight.position.set(8.0, 5.2, 12.5);
  const vendLight = new THREE.PointLight(0x9fd0ff, 1.6, 3.5, 2);
  vendLight.position.set(4.0, 1.3, 2.7);
  const emergency = [new THREE.PointLight(0xff1a10, 0, 9, 1.6), new THREE.PointLight(0xff1a10, 0, 9, 1.6)];
  emergency[0].position.set(0, 2.6, -3.4);
  emergency[1].position.set(14, 2.5, 1.1);
  const porch = new THREE.PointLight(0xffc890, 6, 9, 1.6);
  porch.position.set(0, 2.75, 5.0);
  const moon = new THREE.DirectionalLight(0x6a7aa8, 0.35);
  moon.position.set(-8, 14, 22);
  scene.add(moon);
  const flood = new THREE.SpotLight(0xdfe6ff, 40, 22, 0.75, 0.5, 1.2);
  flood.position.set(5.4, 3.3, 4.5);
  flood.target.position.set(1.5, 0, 9.5);
  scene.add(flood, flood.target);
  const deskLamp = new THREE.PointLight(0xffd59a, 1.4, 3, 2);
  deskLamp.position.set(-0.3, 1.5, -1.9);
  const flashlight = new THREE.SpotLight(0xfff1d8, 0, 14, 0.42, 0.45, 1.4);
  camera.add(flashlight);
  flashlight.position.set(0.15, -0.12, 0);
  const flashTarget = new THREE.Object3D();
  flashTarget.position.set(0, -0.1, -1);
  camera.add(flashTarget);
  flashlight.target = flashTarget;
  [...lobbyLights, ...hallLights, storageLight, neonLight, lotLight, vendLight, porch, ...emergency, deskLamp].forEach((l) => scene.add(l));
  const BASE = new Map([...lobbyLights, ...hallLights, storageLight, vendLight, deskLamp, neonLight, lotLight, porch, flood].map((l) => [l, l.intensity]));

  /* ---------------------------------------------------------------- CCTV cameras */
  const cctv = [
    { pos: [2.3, 2.55, 2.4], look: [-0.1, 1.45, -0.3], fov: 52 },
    { pos: [5.6, 3.1, 4.7], look: [1.6, 0.5, 9.2] },
    { pos: [5.35, 2.55, 1.85], look: [23, 1.0, 1.0] },
    { pos: [-1.35, 2.6, -4.35], look: [-4.4, 0.8, -7.4] },
  ].map((c) => {
    const cam = new THREE.PerspectiveCamera(c.fov || 64, 16 / 9, 0.05, 60);
    cam.position.set(...c.pos);
    cam.lookAt(...c.look);
    cam.layers.enable(CAM);
    cam.userData.base = cam.quaternion.clone();
    scene.add(cam);
    return cam;
  });

  /* ---------------------------------------------------------------- cars on the lot */
  let lotCars = [];
  let guestCar = null;
  function setLot(cars) {
    for (const c of lotCars) disposeTree(c);
    lotCars = [];
    cars.slice(0, LOT_SLOTS.length).forEach((c, i) => {
      const m = buildCar(c.color || 0x4a4f58, c.plate);
      const [x, z] = LOT_SLOTS[i];
      m.position.set(x, 0, z);
      m.rotation.y = Math.PI;
      scene.add(m);
      lotCars.push(m);
    });
  }
  function setGuestCar(car) {
    if (guestCar) disposeTree(guestCar);
    guestCar = null;
    if (!car) return;
    guestCar = buildCar(car.color || 0x4a4f58, car.plate);
    guestCar.position.set(GUEST_SLOT[0], 0, GUEST_SLOT[1]);
    guestCar.rotation.y = Math.PI;
    scene.add(guestCar);
  }

  /* ---------------------------------------------------------------- guest */
  let guest = null; // { root, eye, cam, camTrue, path, state, t, spec }
  function clearGuest() {
    if (guest) disposeTree(guest.root);
    guest = null;
  }
  /** cctv: normal | absent | twisted | other | flicker. opts: { mood, seed } */
  function spawnGuest(spec, cctvForm = "normal", opts = {}) {
    clearGuest();
    const root = new THREE.Group();
    const eye = buildGuest(spec, { variant: "normal", mood: opts.mood, seed: opts.seed });
    root.add(eye.root);
    let camTrue = null;
    if (cctvForm === "normal" || cctvForm === "flicker") setLayer(eye.root, EYE, CAM);
    else setLayer(eye.root, EYE);
    if (cctvForm === "twisted" || cctvForm === "other" || cctvForm === "flicker") {
      camTrue = buildGuest(spec, { variant: cctvForm === "other" ? "other" : "twisted", seed: opts.seed });
      setLayer(camTrue.root, CAM);
      root.add(camTrue.root);
      if (cctvForm === "flicker") camTrue.root.visible = false;
    }
    root.position.copy(DOOR_OUT);
    root.rotation.y = Math.PI;
    scene.add(root);
    guest = { root, eye, camTrue, form: cctvForm, state: "enter", path: [new THREE.Vector3(0, 0, 4.4), GUEST_SPOT.clone()], t: 0, spec, shift: 0 };
  }
  function guestLeave(toHall) {
    if (!guest) return;
    guest.state = "leave";
    guest.path = toHall ? HALL_IN.map((v) => v.clone()) : [new THREE.Vector3(0, 0, 4.4), DOOR_OUT.clone()];
    guest.toHall = toHall;
  }
  /** "Guests changing appearance": black eyes, a too-wide mouth — for a moment. */
  function guestShift(sec = 0.35) {
    if (!guest) return;
    guest.eye.setVoid(true);
    guest.shift = sec;
  }
  function guestTalk(sec = 1.5) {
    guest?.eye.talk(sec);
  }
  const tmpV = new THREE.Vector3();
  function updateGuest(dt, time) {
    if (!guest) return;
    const g = guest;
    if (g.shift > 0) {
      g.shift -= dt;
      if (g.shift <= 0) g.eye.setVoid(false);
    }
    if (g.form === "flicker" && g.camTrue) g.camTrue.root.visible = forceTrue || Math.sin(time * 1.7) + Math.sin(time * 4.3) > 1.75;
    let moving = false;
    if (g.path.length) {
      const target = g.path[0];
      const p = g.root.position;
      const dx = target.x - p.x, dz = target.z - p.z;
      const d = Math.hypot(dx, dz);
      const sp = 1.15 * dt;
      if (d <= sp) {
        p.set(target.x, 0, target.z);
        g.path.shift();
      } else {
        p.x += (dx / d) * sp;
        p.z += (dz / d) * sp;
        const want = Math.atan2(dx, dz);
        let diff = want - g.root.rotation.y;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        g.root.rotation.y += diff * Math.min(1, dt * 8);
        moving = true;
      }
    }
    if (!g.path.length) {
      if (g.state === "enter") {
        g.state = "idle";
      } else if (g.state === "leave") {
        clearGuest();
        return;
      }
      if (g.state === "idle") {
        let diff = Math.PI - g.root.rotation.y;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        g.root.rotation.y += diff * Math.min(1, dt * 4);
      }
    }
    g.t += dt;
    // where is the clerk, relative to the guest's facing?
    const idle = g.state === "idle";
    let lookYaw = 0, lookPitch = 0;
    if (idle) {
      tmpV.copy(CLERK).sub(g.root.position);
      const yaw = Math.atan2(tmpV.x, tmpV.z) - g.root.rotation.y;
      lookYaw = Math.max(-0.9, Math.min(0.9, Math.atan2(Math.sin(yaw), Math.cos(yaw))));
      lookPitch = -Math.atan2(tmpV.y - g.eye.height * 0.93, Math.hypot(tmpV.x, tmpV.z)) * 0.8;
    }
    const state = { moving, idle, lookYaw, lookPitch };
    g.eye.update(dt, state);
    if (g.camTrue) g.camTrue.update(dt, state);
    // the glass door swings open while someone passes it
    const near = Math.abs(g.root.position.z - 4) < 1.1 && Math.abs(g.root.position.x) < 1;
    doorOpen = near;
  }
  let doorOpen = false;
  let forceTrue = false;

  /* ---------------------------------------------------------------- state */
  let view = "menu"; // menu | desk | walk | cctv
  let cctvIndex = 0;
  let power = true;
  let flickerT = 0;
  let time = 0;
  let frame = 0;
  let lightningT = 0;
  let scareT = 0;
  const player = { x: DESK_POSE.x, z: DESK_POSE.z, yaw: DESK_POSE.yaw, pitch: DESK_POSE.pitch };
  let tween = null;
  const parallax = { x: 0, y: 0 };
  let stepDist = 0;
  let onStep = null;
  let flashOn = false;

  function setView(v) {
    if (v === view) return;
    const prev = view;
    view = v;
    if (v === "desk" && prev === "walk") {
      tween = { t: 0, from: { ...player, y: 1.62 }, to: DESK_POSE };
    } else if (v === "desk") {
      Object.assign(player, { x: DESK_POSE.x, z: DESK_POSE.z, yaw: DESK_POSE.yaw, pitch: DESK_POSE.pitch });
    }
    if (v === "walk" && prev !== "desk") Object.assign(player, { x: DESK_POSE.x, z: DESK_POSE.z, yaw: DESK_POSE.yaw, pitch: 0 });
  }
  function setPower(on) {
    power = on;
    for (const [l, base] of BASE) {
      l.intensity = on ? base : 0;
    }
    for (const t of [...tubes, ...hallTubes]) t.material.color.setHex(on ? 0xe8f0ff : 0x111214);
    for (const e of emergency) e.intensity = on ? 0 : 3.2;
    vendPanel.color.setHex(on ? 0xb0c8d8 : 0x05070a);
    bulb.material.color.setHex(on ? 0xffd28a : 0x15110a);
    monScreens.forEach((m, i) => (m.material = on ? monMats[i] : monOff));
    termMat.color.setHex(on ? 0xffffff : 0x000000);
    phoneLamp.material.color.setHex(0x330000);
    wingWins.forEach((w, k) => (w.material = on && k % 3 === 1 ? winLit : winDark));
    sodium.color.setHex(on ? 0xffb36a : 0x1a120a);
    strip.color.setHex(on ? 0xff2a2a : 0x220505);
    drawSign(on);
    amb.intensity = on ? 0.55 : 0.32;
  }
  function flicker(sec = 1.4) {
    flickerT = Math.max(flickerT, sec);
  }
  function lightning() {
    lightningT = 0.5;
  }
  function scareWindow() {
    scareT = 0.7;
  }
  function setTerminal(lines) {
    const c = termTex.userData.ctx;
    c.fillStyle = "#031006";
    c.fillRect(0, 0, 320, 240);
    c.font = "13px monospace";
    c.fillStyle = "#4dff7a";
    c.shadowColor = "#4dff7a";
    c.shadowBlur = 6;
    lines.slice(0, 15).forEach((l, i) => c.fillText(l, 10, 22 + i * 14.5));
    c.shadowBlur = 0;
    c.fillStyle = "rgba(0,0,0,0.25)";
    for (let y = 0; y < 240; y += 3) c.fillRect(0, y, 320, 1);
    termTex.needsUpdate = true;
  }
  function setClock(h, m) {
    const c = clockTex.userData.ctx;
    c.clearRect(0, 0, 128, 128);
    c.fillStyle = "#e8e2d0"; c.beginPath(); c.arc(64, 64, 58, 0, Math.PI * 2); c.fill();
    c.strokeStyle = "#222"; c.lineWidth = 5; c.stroke();
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; c.fillStyle = "#222"; c.fillRect(64 + Math.sin(a) * 48 - 2, 64 - Math.cos(a) * 48 - 2, 4, 4); }
    const hand = (a, len, w) => { c.lineWidth = w; c.beginPath(); c.moveTo(64, 64); c.lineTo(64 + Math.sin(a) * len, 64 - Math.cos(a) * len); c.stroke(); };
    hand(((h % 12) + m / 60) / 12 * Math.PI * 2, 30, 5);
    hand((m / 60) * Math.PI * 2, 44, 3);
    clockTex.needsUpdate = true;
  }
  const propVis = {};
  function setProps(vis) {
    Object.assign(propVis, vis);
    key5.visible = !!vis.key5;
    diary.visible = !!vis.diary;
    door13.visible = !!vis.door13;
  }
  function setPhoneRinging(on) {
    phoneLamp.material.color.setHex(on ? 0xff2020 : 0x330000);
  }

  /* ---------------------------------------------------------------- walking */
  function free(x, z) {
    const inWalk = WALK.some(([x1, x2, z1, z2]) => x >= x1 && x <= x2 && z >= z1 && z <= z2);
    if (!inWalk) return false;
    return !BLOCK.some(([x1, x2, z1, z2]) => x > x1 - R && x < x2 + R && z > z1 - R && z < z2 + R);
  }
  function walk(dt, input) {
    const sens = input.sens || 1;
    player.yaw -= (input.lookX || 0) * 0.0032 * sens;
    player.pitch = Math.max(-1.2, Math.min(1.2, player.pitch - (input.lookY || 0) * 0.0032 * sens));
    player.yaw -= (input.turn || 0) * dt * 2.2;
    const f = input.fwd || 0, s = input.strafe || 0;
    if (!f && !s) return;
    const len = Math.hypot(f, s) || 1;
    const sp = (input.run ? 3.4 : 2.1) * dt;
    const sin = Math.sin(player.yaw), cos = Math.cos(player.yaw);
    // forward is -Z rotated by yaw
    const dx = ((-sin * f + cos * s) / len) * sp;
    const dz = ((-cos * f - sin * s) / len) * sp;
    let moved = 0;
    if (free(player.x + dx, player.z)) { player.x += dx; moved += Math.abs(dx); }
    if (free(player.x, player.z + dz)) { player.z += dz; moved += Math.abs(dz); }
    stepDist += moved;
    if (stepDist > 0.62) {
      stepDist = 0;
      onStep && onStep(player.x > 5 ? "carpet" : "hard");
    }
  }
  const ray = new THREE.Raycaster();
  ray.layers.set(0);
  ray.layers.enable(EYE);
  const center = new THREE.Vector2(0, 0);
  function target() {
    if (view !== "walk") return null;
    ray.setFromCamera(center, camera);
    ray.far = 2.7;
    const hits = ray.intersectObjects([...pickables, ...occluders], true);
    for (const h of hits) {
      let o = h.object;
      if (occluders.includes(o)) return null;
      while (o && !o.userData.prop) o = o.parent;
      if (!o || !o.visible) continue;
      let vis = true;
      for (let p = h.object; p; p = p.parent) if (!p.visible) vis = false;
      if (!vis) continue;
      const id = o.userData.prop;
      return { id, label: props.get(id)?.label || id, dist: h.distance };
    }
    return null;
  }
  const area = () => (player.x > 5 ? "hallway" : player.z < -4.05 ? "storage" : "lobby");

  /* ---------------------------------------------------------------- update/render */
  let width = 16, height = 9;
  function resize(w, h) {
    width = Math.max(1, Math.floor(w));
    height = Math.max(1, Math.floor(h));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    for (const c of cctv) {
      c.aspect = width / height;
      c.updateProjectionMatrix();
    }
  }
  function update(dt, input = {}) {
    dt = Math.min(0.05, Math.max(0, dt));
    time += dt;
    frame++;
    rainMat.uniforms.uTime.value = time;
    T.window.offset.y = (T.window.offset.y + dt * 0.03) % 1;
    // camera
    if (view === "menu") {
      const a = time * 0.05;
      camera.position.set(-9.5 + Math.sin(a) * 1.2, 1.7 + Math.sin(a * 1.7) * 0.12, 15.2 + Math.cos(a) * 0.8);
      camera.lookAt(-2.2, 2.7, 4.5);
    } else if (view === "walk") {
      walk(dt, input);
      camera.position.set(player.x, 1.62 + Math.sin(stepDist * 10) * 0.012, player.z);
      camera.rotation.set(player.pitch, player.yaw, 0);
    } else {
      // desk / cctv: main camera rests at the desk (cctv renders another camera)
      if (tween) {
        tween.t = Math.min(1, tween.t + dt / 0.75);
        const k = tween.t < 0.5 ? 2 * tween.t * tween.t : 1 - Math.pow(-2 * tween.t + 2, 2) / 2;
        let dy = tween.to.yaw - tween.from.yaw;
        dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        player.x = tween.from.x + (tween.to.x - tween.from.x) * k;
        player.z = tween.from.z + (tween.to.z - tween.from.z) * k;
        player.yaw = tween.from.yaw + dy * k;
        player.pitch = tween.from.pitch + (tween.to.pitch - tween.from.pitch) * k;
        if (tween.t >= 1) tween = null;
      } else {
        parallax.x += ((input.px || 0) - parallax.x) * Math.min(1, dt * 3);
        parallax.y += ((input.py || 0) - parallax.y) * Math.min(1, dt * 3);
        player.x = DESK_POSE.x;
        player.z = DESK_POSE.z;
        player.yaw = DESK_POSE.yaw - parallax.x * 0.22;
        player.pitch = DESK_POSE.pitch - parallax.y * 0.12;
      }
      camera.position.set(player.x, 1.62, player.z);
      camera.rotation.set(player.pitch, player.yaw, 0);
    }
    // flashlight in the dark
    const dark = !power || (view === "walk" && area() === "storage");
    flashOn = view === "walk" && dark;
    flashlight.intensity += ((flashOn ? 26 : 0) - flashlight.intensity) * Math.min(1, dt * 8);
    // lights: flicker, storage bulb, emergency pulse, lightning
    if (power) {
      const fl = flickerT > 0;
      if (fl) flickerT -= dt;
      const on = !fl || Math.random() > 0.45;
      lobbyLights.forEach((l) => (l.intensity = BASE.get(l) * (on ? 1 : 0.05)));
      hallLights.forEach((l, i) => (l.intensity = BASE.get(l) * (on || i === 1 ? (i === 2 ? 0.75 + 0.25 * Math.sin(time * 23) * Math.sin(time * 3.1) : 1) : 0.05)));
      tubes.forEach((t) => t.material.color.setHex(on ? 0xe8f0ff : 0x202226));
      storageLight.intensity = BASE.get(storageLight) * (Math.sin(time * 17) * Math.sin(time * 2.3) > 0.85 ? 0.2 : 1);
      const signFlick = Math.sin(time * 9) * Math.sin(time * 0.7) > 0.9;
      if (frame % 6 === 0) drawSign(true, signFlick);
    } else {
      emergency.forEach((e) => (e.intensity = 2.6 + Math.sin(time * 3) * 0.6));
    }
    if (lightningT > 0) {
      lightningT -= dt;
      amb.intensity = (power ? 0.55 : 0.32) + (lightningT > 0.35 || (lightningT > 0.1 && lightningT < 0.2) ? 2.4 : 0);
    } else amb.intensity = power ? 0.55 : 0.32;
    if (scareT > 0) {
      scareT -= dt;
      scareFace.visible = scareT > 0;
    }
    // front door
    doorPivot.rotation.y += ((doorOpen ? -1.2 : 0) - doorPivot.rotation.y) * Math.min(1, dt * 5);
    // passing car on the road
    passer.position.x += dt * 14;
    if (passer.position.x > 50) passer.position.x = -60 - Math.random() * 80;
    // camera sway for CCTV
    cctv.forEach((c, i) => {
      c.quaternion.copy(c.userData.base);
      c.rotateY(Math.sin(time * 0.3 + i) * 0.015);
    });
    updateGuest(dt, time);
  }
  function renderCam(cam, rt) {
    renderer.setRenderTarget(rt);
    renderer.render(scene, cam);
    renderer.setRenderTarget(null);
  }
  function render() {
    if (view === "cctv") {
      renderer.render(scene, cctv[cctvIndex]);
      return;
    }
    if (view === "desk" && power && frame % 4 === 0) {
      const cycle = [0, 0, 2, 1][Math.floor(time / 3) % 4];
      renderCam(cctv[cycle], rtA);
    }
    renderer.render(scene, camera);
  }
  /** Render a still from a CCTV camera and return it as a PNG data URL. */
  function captureStill(i) {
    const w = 480, h = 270;
    const rt = new THREE.WebGLRenderTarget(w, h);
    rt.texture.colorSpace = THREE.SRGBColorSpace;
    const cam = cctv[i];
    const a = cam.aspect;
    cam.aspect = w / h;
    cam.updateProjectionMatrix();
    forceTrue = true;
    if (guest?.camTrue && guest.form === "flicker") guest.camTrue.root.visible = true;
    renderCam(cam, rt);
    forceTrue = false;
    const px = new Uint8Array(w * h * 4);
    renderer.readRenderTargetPixels(rt, 0, 0, w, h, px);
    rt.dispose();
    cam.aspect = a;
    cam.updateProjectionMatrix();
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d");
    const img = ctx.createImageData(w, h);
    for (let y = 0; y < h; y++) {
      const src = (h - 1 - y) * w * 4;
      for (let x = 0; x < w * 4; x += 4) {
        // monochrome surveillance tint
        const l = 0.3 * px[src + x] + 0.59 * px[src + x + 1] + 0.11 * px[src + x + 2];
        img.data[y * w * 4 + x] = l * 0.8;
        img.data[y * w * 4 + x + 1] = l;
        img.data[y * w * 4 + x + 2] = l * 0.85;
        img.data[y * w * 4 + x + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    try {
      return c.toDataURL("image/jpeg", 0.85);
    } catch {
      return null;
    }
  }

  function disposeTree(o) {
    o.parent && o.parent.remove(o);
    o.traverse((x) => {
      if (x.geometry) x.geometry.dispose();
      if (x.material) {
        const mats = Array.isArray(x.material) ? x.material : [x.material];
        for (const m of mats) {
          if (m.map && m.map.isCanvasTexture) m.map.dispose();
          if (!disposables.includes(m)) m.dispose();
        }
      }
    });
  }
  function dispose() {
    clearGuest();
    scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach((m) => { if (m.map) m.map.dispose(); m.dispose(); });
      }
    });
    disposables.forEach((d) => d.dispose && d.dispose());
    Object.values(T).forEach((t) => t.dispose());
    renderer.dispose();
    canvas.remove();
  }

  setTerminal(["ROUTE 6 MOTOR LODGE", "RESERVATION SYSTEM v2.3", "", "> READY_"]);
  setClock(11, 0);
  resize(container.clientWidth || 640, container.clientHeight || 360);

  return {
    renderer, scene, camera, canvas, cctv, player,
    resize, update, render, dispose, setView, getView: () => view,
    setCCTV: (i) => (cctvIndex = Math.max(0, Math.min(3, i))),
    setPower, flicker, lightning, scareWindow, setTerminal, setClock, setProps, setPhoneRinging,
    spawnGuest, guestLeave, clearGuest, guestShift, guestTalk, guestState: () => guest?.state || null,
    setLot, setGuestCar, captureStill, target, area,
    onStep: (fn) => (onStep = fn),
    flashOn: () => flashOn,
    returnToDesk: () => setView("desk"),
  };
}
