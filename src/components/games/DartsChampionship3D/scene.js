/**
 * Darts Championship 3D — plain Three.js presentation. Builds one pub-style
 * arena from procedural geometry + canvas textures and animates darts and the
 * camera. Scoring lives in board.js; the board texture is drawn from the same
 * ORDER / R tables so every bed you see is the bed that is scored.
 */
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { ORDER, R, SEG } from "./board.js";

export const BOARD_Y = 1.73; // bull height (m)
export const FACE_Z = 0.04; // board face plane
const OCHE_Z = 2.37;
const MM = 0.001;
const TEAM = [
  { flight: "#f5b335", flight2: "#1a1408", shaft: "#16120a", barrel: "#c9a45a" },
  { flight: "#d8323c", flight2: "#f2f2f2", shaft: "#c8ccd6", barrel: "#9aa3b2" },
];

function rand(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function canvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return [c, c.getContext("2d")];
}

/* ---------------------------------------------------------------- textures */
function boardCanvas() {
  const S = 2048;
  const [c, x] = canvas(S, S);
  const k = S / (2 * R.board); // px per mm
  const cx = S / 2;
  const rad = (deg) => ((deg - 90) * Math.PI) / 180; // canvas angle for clockwise-from-top degrees
  x.fillStyle = "#0d0d0f";
  x.beginPath();
  x.arc(cx, cx, R.board * k, 0, Math.PI * 2);
  x.fill();
  const band = (r0, r1, a0, a1, col) => {
    x.fillStyle = col;
    x.beginPath();
    x.arc(cx, cx, r1 * k, rad(a0), rad(a1));
    x.arc(cx, cx, r0 * k, rad(a1), rad(a0), true);
    x.closePath();
    x.fill();
  };
  ORDER.forEach((_, i) => {
    const a0 = i * SEG - SEG / 2, a1 = a0 + SEG;
    const single = i % 2 ? "#eadcb6" : "#18181a";
    const ring = i % 2 ? "#167a3c" : "#c41e2a";
    band(R.outerBull, R.trebleIn, a0, a1, single);
    band(R.trebleIn, R.trebleOut, a0, a1, ring);
    band(R.trebleOut, R.doubleIn, a0, a1, single);
    band(R.doubleIn, R.doubleOut, a0, a1, ring);
  });
  x.fillStyle = "#167a3c";
  x.beginPath();
  x.arc(cx, cx, R.outerBull * k, 0, Math.PI * 2);
  x.fill();
  x.fillStyle = "#c41e2a";
  x.beginPath();
  x.arc(cx, cx, R.bull * k, 0, Math.PI * 2);
  x.fill();
  // sisal fibre speckle
  const r = rand(5);
  for (let i = 0; i < 26000; i++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * R.doubleOut * k;
    x.fillStyle = r() < 0.5 ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.09)";
    x.fillRect(cx + Math.cos(a) * d, cx + Math.sin(a) * d, 1.6, 1.6);
  }
  // spider (wires)
  x.strokeStyle = "#d9dde4";
  x.lineWidth = 1.1 * k;
  for (const rr of [R.bull, R.outerBull, R.trebleIn, R.trebleOut, R.doubleIn, R.doubleOut]) {
    x.beginPath();
    x.arc(cx, cx, rr * k, 0, Math.PI * 2);
    x.stroke();
  }
  for (let i = 0; i < 20; i++) {
    const a = rad(i * SEG - SEG / 2);
    x.beginPath();
    x.moveTo(cx + Math.cos(a) * R.outerBull * k, cx + Math.sin(a) * R.outerBull * k);
    x.lineTo(cx + Math.cos(a) * R.doubleOut * k, cx + Math.sin(a) * R.doubleOut * k);
    x.stroke();
  }
  // number ring
  x.fillStyle = "#f4f1ea";
  x.font = `bold ${Math.round(27 * k)}px "Arial Black", Arial, sans-serif`;
  x.textAlign = "center";
  x.textBaseline = "middle";
  ORDER.forEach((n, i) => {
    const a = rad(i * SEG);
    x.fillText(String(n), cx + Math.cos(a) * 196 * k, cx + Math.sin(a) * 196 * k + 1.5 * k);
  });
  return c;
}

function woodCanvas(w, h, planks, seed, hue, light, vertical = true) {
  const [c, x] = canvas(w, h);
  const r = rand(seed);
  const pw = (vertical ? w : h) / planks;
  for (let i = 0; i < planks; i++) {
    const v = r();
    x.fillStyle = `hsl(${hue + v * 6}, ${44 + v * 12}%, ${light + v * 7}%)`;
    vertical ? x.fillRect(i * pw, 0, pw + 1, h) : x.fillRect(0, i * pw, w, pw + 1);
    for (let g = 0; g < 18; g++) {
      x.strokeStyle = `rgba(30,12,2,${0.06 + r() * 0.1})`;
      x.lineWidth = 0.6 + r() * 1.4;
      const o = i * pw + r() * pw;
      x.beginPath();
      for (let s = 0; s <= 24; s++) {
        const t = ((vertical ? h : w) * s) / 24;
        const d = o + Math.sin(t * 0.012 + g * 1.7) * 2.2;
        vertical ? x.lineTo(d, t) : x.lineTo(t, d);
      }
      x.stroke();
    }
    x.fillStyle = "rgba(10,4,0,0.55)";
    vertical ? x.fillRect(i * pw, 0, 2, h) : x.fillRect(0, i * pw, w, 2);
  }
  return c;
}

function neonCanvas(text, color) {
  const [c, x] = canvas(512, 160);
  x.font = 'bold 104px "Segoe Script", "Brush Script MT", cursive';
  x.textAlign = "center";
  x.textBaseline = "middle";
  x.shadowColor = color;
  for (const [blur, col] of [[40, color], [18, color], [4, "#fff"]]) {
    x.shadowBlur = blur;
    x.fillStyle = col;
    x.fillText(text, 256, 84);
  }
  return c;
}

function chalkBase(x, w, h) {
  const g = x.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, "#26302b");
  g.addColorStop(1, "#1a221e");
  x.fillStyle = g;
  x.fillRect(0, 0, w, h);
  const r = rand(9);
  for (let i = 0; i < 70; i++) {
    x.fillStyle = `rgba(255,255,255,${0.012 + r() * 0.02})`;
    x.beginPath();
    x.ellipse(r() * w, r() * h, 20 + r() * 80, 8 + r() * 30, r() * 3, 0, Math.PI * 2);
    x.fill();
  }
}
const CHALK = '"Segoe Print", "Bradley Hand", "Comic Sans MS", cursive';

/* ---------------------------------------------------------------- dart */
function dartParts() {
  const pts = (arr) => arr.map(([r, y]) => new THREE.Vector2(r, y));
  const lathe = (arr, seg = 14) => new THREE.LatheGeometry(pts(arr), seg).rotateX(Math.PI / 2);
  const point = lathe([[0, 0], [0.0006, 0.002], [0.0011, 0.028], [0.0013, 0.032]], 8);
  const grooves = [];
  for (let i = 0; i <= 12; i++) grooves.push([i % 2 ? 0.0033 : 0.0037, 0.032 + i * 0.0042]);
  const barrel = lathe([[0.0013, 0.032], [0.0034, 0.0322], ...grooves, [0.0032, 0.0835], [0.0024, 0.086]], 18);
  const shaft = lathe([[0.0024, 0.086], [0.0019, 0.088], [0.0017, 0.118], [0.0021, 0.12], [0.0021, 0.124], [0, 0.124]], 10);
  const s = new THREE.Shape();
  s.moveTo(0.0012, 0);
  s.lineTo(0.017, 0.012);
  s.lineTo(0.017, 0.036);
  s.lineTo(0.0012, 0.04);
  s.closePath();
  const wing = new THREE.ShapeGeometry(s); // x = out, y = along shaft
  const flight = new THREE.BufferGeometry();
  const parts = [0, 1, 2, 3].map((q) => wing.clone().rotateZ(0).rotateX(Math.PI / 2).rotateZ((q * Math.PI) / 2).translate(0, 0, 0.088));
  // merge four wings into one geometry
  const pos = [];
  for (const p of parts) {
    const g = p.toNonIndexed();
    pos.push(...g.attributes.position.array);
    g.dispose();
    p.dispose();
  }
  wing.dispose();
  flight.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  flight.computeVertexNormals();
  return { point, barrel, shaft, flight };
}

/* ---------------------------------------------------------------- scene */
export function createScene(canvasEl) {
  const renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.92;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#0b0705");
  scene.fog = new THREE.Fog("#0b0705", 6, 14);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envTex;

  const camera = new THREE.PerspectiveCamera(40, 1, 0.02, 40);
  const textures = [envTex];
  const T = (c, srgb = true) => {
    const t = new THREE.CanvasTexture(c);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    textures.push(t);
    return t;
  };
  const add = (geo, mat, x = 0, y = 0, z = 0, parent = scene) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  };

  /* lights */
  scene.add(new THREE.HemisphereLight("#ffd9a8", "#2a1608", 0.35));
  const spot = new THREE.SpotLight("#fff0da", 3.2, 5, 0.42, 0.55, 1.4);
  spot.position.set(0, 2.55, 0.9);
  spot.target.position.set(0, BOARD_Y, 0);
  spot.castShadow = true;
  spot.shadow.mapSize.set(1024, 1024);
  spot.shadow.bias = -0.0004;
  spot.shadow.normalBias = 0.002;
  spot.shadow.camera.near = 0.5;
  spot.shadow.camera.far = 3.5;
  scene.add(spot, spot.target);
  const lampA = new THREE.PointLight("#ffb766", 7, 6, 1.6);
  lampA.position.set(-1.6, 2.35, 1.6);
  const lampB = lampA.clone();
  lampB.position.x = 1.6;
  scene.add(lampA, lampB);

  /* materials */
  const wallTex = T(woodCanvas(1024, 512, 14, 3, 24, 22));
  wallTex.wrapS = wallTex.wrapT = THREE.RepeatWrapping;
  wallTex.repeat.set(4, 2);
  const floorTex = T(woodCanvas(1024, 1024, 10, 8, 26, 16, false));
  floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
  floorTex.repeat.set(3, 3);
  const cabTex = T(woodCanvas(512, 512, 5, 4, 12, 18));
  const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.75, envMapIntensity: 0.25 });
  const floorMat = new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.45, envMapIntensity: 0.4 });
  const cabMat = new THREE.MeshStandardMaterial({ map: cabTex, roughness: 0.4, envMapIntensity: 0.5 });
  const darkMat = new THREE.MeshStandardMaterial({ color: "#121010", roughness: 0.95 });
  const gold = new THREE.MeshStandardMaterial({ color: "#d9a441", metalness: 1, roughness: 0.28 });
  const steel = new THREE.MeshStandardMaterial({ color: "#c7ccd4", metalness: 1, roughness: 0.22 });
  const boardMat = new THREE.MeshStandardMaterial({ map: T(boardCanvas()), roughness: 1, envMapIntensity: 0.04 });
  const ringGlow = new THREE.MeshBasicMaterial({ color: "#fff4e0" });

  /* room */
  const wall = add(new THREE.PlaneGeometry(9, 3.4), wallMat, 0, 1.7, -0.06);
  wall.receiveShadow = true;
  const side = new THREE.PlaneGeometry(6, 3.4);
  add(side, wallMat, -3.2, 1.7, 2.9).rotation.y = Math.PI / 2;
  add(side, wallMat, 3.2, 1.7, 2.9).rotation.y = -Math.PI / 2;
  const floor = add(new THREE.PlaneGeometry(9, 6).rotateX(-Math.PI / 2), floorMat, 0, 0, 2.9);
  floor.receiveShadow = true;
  add(new THREE.PlaneGeometry(9, 6).rotateX(Math.PI / 2), darkMat, 0, 3.4, 2.9);
  const skirt = new THREE.BoxGeometry(9, 0.14, 0.03);
  add(skirt, cabMat, 0, 0.07, -0.045);
  add(new THREE.BoxGeometry(9, 0.05, 0.05), cabMat, 0, 1.02, -0.035); // dado rail

  /* throwing mat + oche */
  const matTex = (() => {
    const [c, x] = canvas(256, 1024);
    x.fillStyle = "#17171a";
    x.fillRect(0, 0, 256, 1024);
    x.strokeStyle = "#d9a441";
    x.lineWidth = 8;
    x.strokeRect(10, 10, 236, 1004);
    x.fillStyle = "#d9a441";
    x.font = "bold 40px Arial";
    x.textAlign = "center";
    x.save();
    x.translate(128, 520);
    x.rotate(-Math.PI / 2);
    x.fillText("CHAMPIONSHIP", 0, 14);
    x.restore();
    return T(c);
  })();
  const mat = add(new THREE.PlaneGeometry(0.9, 3).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: matTex, roughness: 0.9 }), 0, 0.004, 1.6);
  mat.receiveShadow = true;
  add(new THREE.BoxGeometry(0.62, 0.038, 0.05), gold, 0, 0.02, OCHE_Z);

  /* cabinet, surround, board */
  const cab = add(new THREE.BoxGeometry(0.95, 1.0, 0.06), cabMat, 0, BOARD_Y, -0.03);
  cab.receiveShadow = true;
  const surround = add(new THREE.RingGeometry(R.board * MM, 0.4, 64), new THREE.MeshStandardMaterial({ color: "#0b0b0d", roughness: 0.85 }), 0, BOARD_Y, 0.004);
  surround.receiveShadow = true;
  const board = new THREE.Group();
  board.position.set(0, BOARD_Y, 0);
  scene.add(board);
  const rim = add(new THREE.CylinderGeometry(R.board * MM, R.board * MM, 0.036, 72, 1, true).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: "#151515", roughness: 0.7 }), 0, 0, 0.022, board);
  rim.receiveShadow = true;
  const face = add(new THREE.CircleGeometry(R.board * MM, 96), boardMat, 0, 0, FACE_Z, board);
  face.receiveShadow = true;
  // raised wires catch the light
  const wireMat = new THREE.MeshStandardMaterial({ color: "#e6e8ec", metalness: 1, roughness: 0.3 });
  for (const rr of [R.outerBull, R.trebleIn, R.trebleOut, R.doubleIn, R.doubleOut]) add(new THREE.TorusGeometry(rr * MM, 0.00055, 4, 96), wireMat, 0, 0, FACE_Z + 0.0004, board);
  const spoke = new THREE.BoxGeometry(0.0009, (R.doubleOut - R.outerBull) * MM, 0.0008).translate(0, ((R.doubleOut + R.outerBull) / 2) * MM, 0);
  for (let i = 0; i < 20; i++) add(spoke, wireMat, 0, 0, FACE_Z + 0.0004, board).rotation.z = -((i * SEG - SEG / 2) * Math.PI) / 180;
  add(new THREE.TorusGeometry(0.335, 0.011, 10, 96), ringGlow, 0, BOARD_Y, 0.06); // LED ring light
  add(new THREE.TorusGeometry(0.335, 0.016, 10, 96, Math.PI), darkMat, 0, BOARD_Y, 0.052);

  /* cabinet doors with chalkboards */
  const chalk = [0, 1].map(() => {
    const [c, x] = canvas(480, 1010);
    return { c, x, tex: T(c) };
  });
  [-1, 1].forEach((s, i) => {
    // hinged on the cabinet's outer edges, swung open 150° toward the room
    const pivot = new THREE.Group();
    pivot.position.set(s * 0.475, BOARD_Y, 0.014);
    pivot.rotation.y = (s * 5 * Math.PI) / 6;
    scene.add(pivot);
    add(new THREE.BoxGeometry(0.475, 1.0, 0.028).translate(-s * 0.2375, 0, 0), cabMat, 0, 0, 0, pivot);
    const p = add(new THREE.PlaneGeometry(0.43, 0.94), new THREE.MeshStandardMaterial({ map: chalk[i].tex, roughness: 0.95 }), s * -0.2375, 0, -0.0145, pivot);
    p.rotation.y = Math.PI;
  });
  {
    const { x } = chalk[1];
    chalkBase(x, 480, 1010);
    x.fillStyle = "rgba(245,240,225,0.9)";
    x.textAlign = "center";
    x.font = `bold 54px ${CHALK}`;
    x.fillText("Checkouts", 240, 90);
    x.font = `34px ${CHALK}`;
    [["170", "T20 T20 Bull"], ["167", "T20 T19 Bull"], ["164", "T20 T18 Bull"], ["161", "T20 T17 Bull"], ["160", "T20 T20 D20"], ["141", "T20 T19 D12"], ["121", "T20 11 Bull"], ["100", "T20 D20"], ["81", "T19 D12"], ["61", "25 D18"], ["40", "D20"], ["32", "D16"]].forEach(([a, b], i) => {
      x.textAlign = "left";
      x.fillText(a, 40, 170 + i * 66);
      x.textAlign = "right";
      x.fillText(b, 445, 170 + i * 66);
    });
    chalk[1].tex.needsUpdate = true;
  }

  /* decor: neon signs, pendant lamps, trophy shelf */
  const neon = (text, color, x, y) => {
    const m = add(new THREE.PlaneGeometry(1.1, 0.34), new THREE.MeshBasicMaterial({ map: T(neonCanvas(text, color)), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }), x, y, -0.05);
    return m;
  };
  const neonA = neon("Darts", "#ffb347", -1.55, 2.35);
  const neonB = neon("180!", "#ff4f6d", 1.55, 2.4);
  const shade = new THREE.ConeGeometry(0.2, 0.18, 24, 1, true);
  const bulb = new THREE.SphereGeometry(0.05, 12, 8);
  const cord = new THREE.CylinderGeometry(0.004, 0.004, 1.0);
  for (const lx of [-1.6, 1.6]) {
    add(shade, new THREE.MeshStandardMaterial({ color: "#1d1712", metalness: 0.6, roughness: 0.4, side: THREE.DoubleSide }), lx, 2.48, 1.6);
    add(bulb, new THREE.MeshBasicMaterial({ color: "#ffd9a0" }), lx, 2.41, 1.6);
    add(cord, darkMat, lx, 3.0, 1.6);
  }
  add(new THREE.BoxGeometry(0.9, 0.035, 0.22), cabMat, 1.6, 1.55, 0.05);
  const cupGeo = new THREE.LatheGeometry([[0, 0], [0.06, 0], [0.06, 0.02], [0.02, 0.04], [0.012, 0.1], [0.05, 0.13], [0.065, 0.2], [0.068, 0.22], [0.06, 0.22]].map(([a, b]) => new THREE.Vector2(a, b)), 20);
  [[1.32, 0.8], [1.6, 1.15], [1.88, 0.9]].forEach(([tx, s]) => {
    const c = add(cupGeo, gold, tx, 1.568, 0.05);
    c.scale.setScalar(s);
    c.castShadow = true;
  });
  add(new THREE.BoxGeometry(0.9, 0.035, 0.22), cabMat, -1.6, 1.55, 0.05);
  const bottle = new THREE.CylinderGeometry(0.028, 0.032, 0.24, 12);
  ["#2f6b3a", "#7a3a14", "#c9a45a", "#3a2a6b", "#8a1c24"].forEach((col, i) => {
    add(bottle, new THREE.MeshPhysicalMaterial({ color: col, roughness: 0.1, transmission: 0, metalness: 0.1, clearcoat: 1 }), -1.92 + i * 0.16, 1.69, 0.05);
  });

  /* darts: 3 per side */
  const parts = dartParts();
  const pointMat = steel;
  const darts = TEAM.map((t) => {
    const barrelMat = new THREE.MeshStandardMaterial({ color: t.barrel, metalness: 1, roughness: 0.3 });
    const shaftMat = new THREE.MeshStandardMaterial({ color: t.shaft, roughness: 0.35, metalness: 0.3 });
    const flightMat = new THREE.MeshStandardMaterial({ color: t.flight, roughness: 0.5, side: THREE.DoubleSide, emissive: t.flight, emissiveIntensity: 0.12 });
    return [0, 1, 2].map(() => {
      const g = new THREE.Group();
      for (const [geo, m] of [[parts.point, pointMat], [parts.barrel, barrelMat], [parts.shaft, shaftMat], [parts.flight, flightMat]]) {
        const mesh = new THREE.Mesh(geo, m);
        mesh.castShadow = true;
        g.add(mesh);
      }
      g.visible = false;
      scene.add(g);
      return { g, fly: null, wob: 0, base: new THREE.Quaternion(), spin: 0 };
    });
  });

  /* chalk scoreboard (left door) */
  function setScoreboard({ title, names, rows, rem, active }) {
    const { x, tex } = chalk[0];
    chalkBase(x, 480, 1010);
    x.fillStyle = "rgba(245,240,225,0.92)";
    x.strokeStyle = "rgba(245,240,225,0.75)";
    x.lineWidth = 3;
    x.textAlign = "center";
    x.font = `bold 60px ${CHALK}`;
    x.fillText(title, 240, 82);
    x.beginPath();
    x.moveTo(240, 118);
    x.lineTo(240, 960);
    x.moveTo(30, 190);
    x.lineTo(450, 190);
    x.stroke();
    x.font = `bold 44px ${CHALK}`;
    names.forEach((n, i) => {
      x.fillStyle = i === active ? "#ffd27a" : "rgba(245,240,225,0.92)";
      x.fillText(n, 130 + i * 220, 165);
    });
    x.font = `40px ${CHALK}`;
    rows.forEach((col, i) => {
      const shown = col.slice(-11);
      shown.forEach((v, j) => {
        const y = 245 + j * 62;
        const last = j === shown.length - 1;
        x.fillStyle = last ? "#fff" : "rgba(245,240,225,0.55)";
        x.fillText(String(v), 130 + i * 220, y);
        if (!last) {
          x.beginPath();
          x.moveTo(90 + i * 220, y - 2);
          x.lineTo(170 + i * 220, y - 8);
          x.stroke();
        }
      });
    });
    x.font = `bold 62px ${CHALK}`;
    rem.forEach((v, i) => {
      x.fillStyle = i === active ? "#ffd27a" : "#fff";
      x.fillText(String(v), 130 + i * 220, 975);
    });
    tex.needsUpdate = true;
  }

  /* camera */
  const cam = { mode: "menu", pos: new THREE.Vector3(0, 1.7, 3), look: new THREE.Vector3(0, BOARD_Y, 0), tPos: new THREE.Vector3(), tLook: new THREE.Vector3(), dist: 0.9, aspect: 1 };
  let time = 0;
  let flash = 0;
  const v = new THREE.Vector3();
  const v2 = new THREE.Vector3();
  const ray = new THREE.Vector3();
  const size = { w: 1, h: 1 };
  const hand = { team: -1, idx: 0, power: 0, aim: new THREE.Vector3() };
  const toWorld = (xmm, ymm, out = new THREE.Vector3()) => out.set(xmm * MM, BOARD_Y + ymm * MM, FACE_Z);

  function targetCam() {
    const m = cam.mode;
    if (m === "player") {
      cam.tPos.set(0, BOARD_Y, FACE_Z + cam.dist);
      cam.tLook.set(0, BOARD_Y, FACE_Z);
    } else if (m === "ai") {
      const f = Math.max(1, 1.15 / cam.aspect);
      cam.tPos.set(0.16 * f, 1.7, FACE_Z + 1.55 * f);
      cam.tLook.set(-0.2, BOARD_Y - 0.02, 0);
    } else {
      const a = time * 0.12;
      const f = Math.max(1, 1.2 / cam.aspect);
      cam.tPos.set(Math.sin(a) * 1.1, 1.62 + Math.sin(a * 0.7) * 0.12, (2.5 + Math.cos(a * 0.8) * 0.3) * f);
      cam.tLook.set(Math.sin(a) * 0.25 + (cam.aspect > 1.2 ? -0.35 : 0), 1.55, 0);
    }
  }

  function placeHand() {
    if (hand.team < 0) return;
    const d = darts[hand.team][hand.idx];
    if (d.fly) return;
    d.g.visible = true;
    v.set(0.06 * Math.min(1, cam.aspect), -0.062, -0.42 + hand.power * 0.05);
    camera.localToWorld(v);
    d.g.position.copy(v);
    v2.copy(v).sub(hand.aim).add(v); // look away from the aim so local -z (tip) faces it
    d.g.lookAt(v2);
  }

  function update(dt) {
    time += dt;
    targetCam();
    const k = 1 - Math.exp(-dt * (cam.mode === "menu" ? 1.6 : 4.2));
    cam.pos.lerp(cam.tPos, k);
    cam.look.lerp(cam.tLook, k);
    camera.position.copy(cam.pos);
    camera.lookAt(cam.look);
    camera.updateMatrixWorld();
    placeHand();

    for (const team of darts) {
      for (const d of team) {
        if (d.fly) {
          const f = d.fly;
          f.t = Math.min(1, f.t + dt / f.dur);
          const t = f.t;
          d.g.position.lerpVectors(f.from, f.to, t);
          d.g.position.y += f.arc * 4 * t * (1 - t);
          // tangent of the arc → orientation (tip = local -z)
          ray.subVectors(f.to, f.from);
          ray.y += f.arc * 4 * (1 - 2 * t);
          v.copy(d.g.position).sub(ray);
          d.g.lookAt(v);
          d.spin += dt * 26;
          d.g.rotateZ(d.spin);
          if (t >= 1) {
            d.fly = null;
            d.g.position.copy(f.to);
            d.base.copy(d.g.quaternion);
            d.wob = 1;
            f.onLand?.();
          }
        } else if (d.wob > 0) {
          d.wob = Math.max(0, d.wob - dt * 3.2);
          d.g.quaternion.copy(d.base);
          d.g.rotateX(Math.sin(d.wob * 30) * d.wob * 0.05);
        }
      }
    }

    flash = Math.max(0, flash - dt * 1.4);
    ringGlow.color.setRGB(1 + flash, 0.95 + flash * 0.6, 0.86 + flash * 0.2);
    spot.intensity = 3.2 + flash * 5;
    neonA.material.opacity = 0.88 + 0.12 * Math.sin(time * 3.1) * Math.sin(time * 7.3);
    neonB.material.opacity = 0.85 + 0.15 * Math.abs(Math.sin(time * 1.3)) + flash * 0.3;
  }

  return {
    camera,
    update,
    render: () => renderer.render(scene, camera),
    setScoreboard,
    setCamMode(mode, snap = false) {
      cam.mode = mode;
      if (snap) {
        targetCam();
        cam.pos.copy(cam.tPos);
        cam.look.copy(cam.tLook);
      }
    },
    /** true once the camera has (nearly) arrived. */
    camReady: () => cam.pos.distanceTo(cam.tPos) < 0.01,
    /** Board point (mm) under a normalized device coordinate, or null. */
    boardAt(nx, ny) {
      v.set(nx, ny, 0.5).unproject(camera).sub(camera.position);
      if (Math.abs(v.z) < 1e-6) return null;
      const t = (FACE_Z - camera.position.z) / v.z;
      if (t <= 0) return null;
      return { x: (camera.position.x + v.x * t) / MM, y: (camera.position.y + v.y * t - BOARD_Y) / MM };
    },
    /** CSS-pixel position of a board point (mm) on the canvas. */
    project(xmm, ymm) {
      toWorld(xmm, ymm, v).project(camera);
      return { x: ((v.x + 1) / 2) * size.w, y: ((1 - v.y) / 2) * size.h };
    },
    /** Show (team ≥ 0) or hide the dart held at the thrower's hand. */
    setHand(team, idx = 0, power = 0, aim = null) {
      if (hand.team >= 0 && (hand.team !== team || hand.idx !== idx)) {
        const d = darts[hand.team][hand.idx];
        if (!d.fly && !d.stuck) d.g.visible = false;
      }
      hand.team = team;
      hand.idx = idx;
      hand.power = power;
      if (aim) toWorld(aim.x, aim.y, hand.aim);
    },
    /** Fly dart `idx` of `team` into the board at (x, y) mm; onLand fires on impact. */
    throwDart(team, idx, xmm, ymm, onLand) {
      const d = darts[team][idx];
      if (hand.team === team && hand.idx === idx) hand.team = -1;
      const from = team === 0 && d.g.visible ? d.g.position.clone() : new THREE.Vector3(0.18, 1.5, FACE_Z + 1.9);
      const r = Math.hypot(xmm, ymm);
      // past the board edge it lands in the surround / cabinet face instead
      const z = r <= R.board ? FACE_Z - 0.008 : r <= 400 ? 0.004 - 0.006 : -0.004;
      const to = new THREE.Vector3(xmm * MM, BOARD_Y + ymm * MM, z + 0.002);
      const dist = from.distanceTo(to);
      d.g.visible = true;
      d.stuck = true;
      d.spin = 0;
      d.fly = { from, to, t: 0, dur: 0.16 + dist * 0.14, arc: dist * 0.06, onLand };
    },
    clearDarts(team = -1) {
      darts.forEach((list, t) => {
        if (team >= 0 && t !== team) return;
        for (const d of list) {
          d.fly = null;
          d.stuck = false;
          d.wob = 0;
          d.g.visible = false;
        }
      });
    },
    flash(v = 1) {
      flash = Math.max(flash, v);
    },
    resize(w, h) {
      size.w = w;
      size.h = h;
      renderer.setSize(w, h, false);
      cam.aspect = w / Math.max(1, h);
      camera.aspect = cam.aspect;
      camera.updateProjectionMatrix();
      // keep the whole board (plus a little surround) in view at any aspect
      const half = Math.tan(((camera.fov / 2) * Math.PI) / 180);
      const need = 0.29;
      cam.dist = Math.max(need / half, need / (half * cam.aspect));
    },
    dispose() {
      const mats = new Set();
      const geos = new Set();
      scene.traverse((o) => {
        if (o.geometry) geos.add(o.geometry);
        if (o.material) mats.add(o.material);
      });
      geos.forEach((g) => g.dispose());
      mats.forEach((m) => m.dispose());
      textures.forEach((t) => t.dispose());
      pmrem.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
