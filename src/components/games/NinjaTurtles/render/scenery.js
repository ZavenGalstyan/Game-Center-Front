/**
 * Level meshes built from data/levels.js props: floor, sky, bounds walls,
 * buildings, cars, rooftop clutter, the sewer channel and the boss arena.
 * Cheap toon/lambert geometry and a few small canvas textures — no shadows.
 */
import * as THREE from "three";
import { toonGradient } from "./characters.js";

const mats = new Map();
const toon = (c) => {
  if (!mats.has(c)) {
    const m = new THREE.MeshToonMaterial({ color: c, gradientMap: toonGradient() });
    m.userData.shared = true;
    mats.set(c, m);
  }
  return mats.get(c);
};
const glow = (c, i = 1) => new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(i) });

const texCache = new Map();
function canvasTex(key, w, h, draw, rx = 1, ry = rx) {
  const k = `${key}|${rx}|${ry}`;
  if (texCache.has(k)) return texCache.get(k);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  t.anisotropy = 4;
  t.userData.shared = true;
  texCache.set(k, t);
  return t;
}
/** A per-level copy of a cached texture (own repeat); freed with the level. */
const ownClone = (t) => {
  const c = t.clone();
  c.userData = {};
  c.needsUpdate = true;
  return c;
};
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

const skyTex = (top, mid, bottom) =>
  canvasTex(`sky${top}${mid}${bottom}`, 4, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, top);
    gr.addColorStop(0.55, mid);
    gr.addColorStop(1, bottom);
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
  });
const brickTex = (base, mortar, rx, ry) =>
  canvasTex(`brick${base}`, 128, 128, (g, w, h) => {
    g.fillStyle = mortar;
    g.fillRect(0, 0, w, h);
    seed = 11;
    for (let r = 0; r < 8; r++)
      for (let c = -1; c < 4; c++) {
        const v = 0.85 + rnd() * 0.3;
        const col = new THREE.Color(base).multiplyScalar(v);
        g.fillStyle = `#${col.getHexString()}`;
        g.fillRect(c * 32 + (r % 2) * 16 + 1, r * 16 + 1, 30, 14);
      }
  }, rx, ry);
const tileTex = (a, b, rx) =>
  canvasTex(`tile${a}${b}`, 128, 128, (g, w, h) => {
    g.fillStyle = b;
    g.fillRect(0, 0, w, h);
    seed = 5;
    for (let i = 0; i < 4; i++)
      for (let j = 0; j < 4; j++) {
        const col = new THREE.Color(a).multiplyScalar(0.88 + rnd() * 0.2);
        g.fillStyle = `#${col.getHexString()}`;
        g.fillRect(i * 32 + 1, j * 32 + 1, 30, 30);
      }
  }, rx);
const noiseTex = (base, dots, rx) =>
  canvasTex(`noise${base}`, 256, 256, (g, w, h) => {
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    seed = 3;
    for (let i = 0; i < 1200; i++) {
      g.fillStyle = dots[i % dots.length];
      g.globalAlpha = 0.3;
      g.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 3, 1 + rnd() * 3);
    }
    g.globalAlpha = 1;
  }, rx);
const windowTex = (wall, style) =>
  canvasTex(`win${wall}${style}`, 128, 256, (g, w, h) => {
    g.fillStyle = wall;
    g.fillRect(0, 0, w, h);
    seed = 17 + style * 31;
    for (let r = 0; r < 8; r++)
      for (let c = 0; c < 4; c++) {
        const lit = rnd() < 0.45;
        g.fillStyle = lit ? ["#ffe08a", "#ffd0a0", "#c8e4ff"][Math.floor(rnd() * 3)] : "#1a2030";
        g.fillRect(c * 32 + 7, r * 32 + 8, 18, 18);
        g.fillStyle = "rgba(0,0,0,0.35)";
        g.fillRect(c * 32 + 15, r * 32 + 8, 2, 18);
      }
  });

const G = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 14),
  cyl8: new THREE.CylinderGeometry(1, 1, 1, 8),
  cone: new THREE.ConeGeometry(1, 1, 12),
  sph: new THREE.SphereGeometry(1, 12, 9),
  plane: new THREE.PlaneGeometry(1, 1),
  circle: new THREE.CircleGeometry(1, 40),
  ring: new THREE.RingGeometry(0.8, 1, 48),
};
for (const g of Object.values(G)) g.userData.shared = true;

const add = (parent, geo, mat, p = [0, 0, 0], s = [1, 1, 1], r = [0, 0, 0]) => {
  const m = new THREE.Mesh(geo, typeof mat === "string" ? toon(mat) : mat);
  m.position.set(...p);
  m.scale.set(...s);
  m.rotation.set(...r);
  parent.add(m);
  return m;
};
const flat = (parent, mat, x, z, w, d, y = 0.01) => add(parent, G.plane, mat, [x, y, z], [w, d, 1], [-Math.PI / 2, 0, 0]);

/* ---------------------------------------------------------------- props */
const BUILD_WALLS = ["#7a4a3a", "#5a6070", "#8a7a64", "#4a5a68"];
function building(g, p) {
  const wall = BUILD_WALLS[p.style % 4];
  const tex = ownClone(windowTex(wall, p.style));
  tex.repeat.set(Math.max(1, Math.round(p.w / 4)), Math.max(1, Math.round(p.h / 6)));
  const texD = ownClone(tex);
  texD.repeat.set(Math.max(1, Math.round(p.d / 4)), Math.max(1, Math.round(p.h / 6)));
  const mW = new THREE.MeshLambertMaterial({ map: tex });
  const mD = new THREE.MeshLambertMaterial({ map: texD });
  const top = new THREE.MeshLambertMaterial({ color: "#2a2a30" });
  const m = new THREE.Mesh(G.box, [mD, mD, top, top, mW, mW]);
  m.position.set(p.x, p.h / 2, p.z);
  m.scale.set(p.w, p.h, p.d);
  g.add(m);
  add(g, G.box, "#2a2228", [p.x, p.h + 0.25, p.z], [p.w + 0.3, 0.5, p.d + 0.3]); // cornice
  add(g, G.box, "#3a3036", [p.x, 0.6, p.z], [p.w + 0.12, 1.2, p.d + 0.12]); // ground floor band
  // shop awning on the road side
  const side = p.x < 0 ? 1 : -1;
  if (Math.abs(p.x) > 5 && p.d > 8) {
    add(g, G.box, ["#c8302a", "#2a8a5a", "#e0a020", "#3a6ac8"][p.style % 4], [p.x + side * (p.w / 2 + 0.5), 2.6, p.z], [1, 0.12, Math.min(6, p.d - 2)], [0, 0, side * 0.25]);
    // fire escape
    for (let f = 1; f < Math.floor(p.h / 3); f++) add(g, G.box, "#1e1e24", [p.x + side * (p.w / 2 + 0.35), f * 3 + 0.5, p.z - p.d * 0.25], [0.7, 0.08, 2.2]);
  }
}
function car(g, p) {
  const c = p.color;
  add(g, G.box, c, [p.x, 0.55, p.z], [p.w, 0.6, p.d]);
  add(g, G.box, c, [p.x, 1.08, p.z - 0.2], [p.w * 0.92, 0.5, p.d * 0.55]);
  add(g, G.box, "#9ac0e0", [p.x, 1.08, p.z - 0.2], [p.w * 0.94, 0.38, p.d * 0.5]); // glass band
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(g, G.cyl, "#1a1a1a", [p.x + sx * p.w * 0.46, 0.33, p.z + sz * p.d * 0.32], [0.33, 0.22, 0.33], [0, 0, Math.PI / 2]);
  add(g, G.box, glow("#fff4c0"), [p.x, 0.62, p.z + p.d / 2 + 0.01], [p.w * 0.7, 0.12, 0.04]);
  add(g, G.box, glow("#ff3020"), [p.x, 0.62, p.z - p.d / 2 - 0.01], [p.w * 0.7, 0.12, 0.04]);
}
function van(g, p) {
  add(g, G.box, "#e8e2c8", [p.x, 1.25, p.z - 0.3], [p.w, 1.9, p.d - 0.6]);
  add(g, G.box, "#e8e2c8", [p.x, 0.85, p.z + p.d / 2 - 0.4], [p.w, 1.1, 0.8]);
  add(g, G.box, "#8ab0d0", [p.x, 1.55, p.z + p.d / 2 - 0.62], [p.w * 0.9, 0.5, 0.06]);
  add(g, G.box, "#2a8a4a", [p.x, 1.2, p.z - 0.3], [p.w + 0.02, 0.35, p.d - 0.8]); // green stripe
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(g, G.cyl, "#1a1a1a", [p.x + sx * p.w * 0.46, 0.38, p.z + sz * p.d * 0.3], [0.38, 0.24, 0.38], [0, 0, Math.PI / 2]);
}
function lamp(g, p, lights) {
  if (p.style === "bulb") {
    add(g, G.cyl8, "#2a2a2a", [p.x, p.h / 2, p.z], [0.05, p.h, 0.05]);
    add(g, G.sph, glow("#ffe6a0", 1.2), [p.x, p.h - 0.2, p.z + 0.3], [0.16, 0.16, 0.16]);
    lights.push([p.x, p.h - 0.4, p.z + 0.4, "#ffd890"]);
    return;
  }
  const s = p.flip ? -1 : 1;
  add(g, G.cyl8, "#2c3a34", [p.x, p.h / 2, p.z], [0.11, p.h, 0.11]);
  add(g, G.box, "#2c3a34", [p.x + s * 0.7, p.h, p.z], [1.5, 0.1, 0.1]);
  add(g, G.box, glow("#fff0c0", 1.15), [p.x + s * 1.35, p.h - 0.1, p.z], [0.5, 0.12, 0.3]);
  // fake light pool on the ground
  const pool = add(g, G.circle, new THREE.MeshBasicMaterial({ color: "#ffd890", transparent: true, opacity: 0.09, depthWrite: false }), [p.x + s * 1.35, 0.02, p.z], [2.6, 2.6, 1], [-Math.PI / 2, 0, 0]);
  pool.renderOrder = 1;
}
function crate(g, p) {
  add(g, G.box, "#9a7040", [p.x, p.h / 2, p.z], [p.w, p.h, p.d]);
  add(g, G.box, "#6a4a28", [p.x, p.h / 2, p.z], [p.w + 0.02, 0.1, p.d + 0.02]);
  add(g, G.box, "#6a4a28", [p.x, p.h / 2, p.z], [0.1, p.h + 0.02, p.d + 0.02]);
}
function barrel(g, p) {
  add(g, G.cyl, "#2a6a8a", [p.x, p.h / 2, p.z], [p.r, p.h, p.r]);
  for (const y of [0.25, 0.75]) add(g, G.cyl, "#1a4a62", [p.x, p.h * y, p.z], [p.r + 0.02, 0.06, p.r + 0.02]);
  add(g, G.cyl, glow("#6aff5a", 0.8), [p.x, p.h + 0.01, p.z], [p.r * 0.8, 0.02, p.r * 0.8]); // ooze
}
function decor(g, p) {
  switch (p.kind) {
    case "pizzabox":
      add(g, G.box, "#e8dcc0", [p.x, 0.04, p.z], [0.45, 0.06, 0.45], [0, 0.4, 0]);
      add(g, G.box, "#e8dcc0", [p.x + 0.1, 0.1, p.z + 0.05], [0.45, 0.06, 0.45], [0, 0.9, 0]);
      add(g, G.cyl, "#c8302a", [p.x + 0.1, 0.135, p.z + 0.05], [0.1, 0.01, 0.1]);
      break;
    case "puddle":
      add(g, G.circle, new THREE.MeshLambertMaterial({ color: "#3a5a4a", transparent: true, opacity: 0.6 }), [p.x, 0.015, p.z], [1.2, 0.8, 1], [-Math.PI / 2, 0, 0]);
      break;
    case "manhole":
      add(g, G.cyl, "#3a3a3e", [p.x, 0.02, p.z], [0.55, 0.02, 0.55]);
      for (let i = -2; i <= 2; i++) add(g, G.box, "#28282c", [p.x + i * 0.18, 0.035, p.z], [0.05, 0.01, 0.8]);
      break;
    case "antenna":
      add(g, G.cyl8, "#4a4a52", [p.x, 2.5, p.z], [0.05, 5, 0.05]);
      for (let i = 0; i < 3; i++) add(g, G.box, "#4a4a52", [p.x, 3.3 + i * 0.6, p.z], [1.2 - i * 0.3, 0.05, 0.05]);
      add(g, G.sph, glow("#ff3020"), [p.x, 5.05, p.z], [0.09, 0.09, 0.09]);
      break;
    case "vent":
      add(g, G.box, "#7a7e86", [p.x, 0.05, p.z], [1.4, 0.1, 1.4]);
      for (let i = -2; i <= 2; i++) add(g, G.box, "#3a3e46", [p.x + i * 0.25, 0.11, p.z], [0.1, 0.02, 1.2]);
      break;
    case "emblem": {
      // the Foot emblem painted on the arena floor
      add(g, G.circle, glow("#8a1418", 0.9), [p.x, 0.02, p.z], [3.2, 3.2, 1], [-Math.PI / 2, 0, 0]);
      add(g, G.circle, glow("#1a0c10"), [p.x, 0.025, p.z], [2.7, 2.7, 1], [-Math.PI / 2, 0, 0]);
      for (const [x, z, a] of [[-0.75, 0.55, 0.35], [0, 0.85, 0], [0.75, 0.55, -0.35]]) add(g, G.box, glow("#c8202a"), [p.x + x, 0.03, p.z + z], [0.35, 0.01, 1.3], [0, a, 0]);
      add(g, G.box, glow("#c8202a"), [p.x, 0.03, p.z - 0.6], [1.1, 0.01, 0.55]);
      break;
    }
    default:
      break;
  }
}

/* ---------------------------------------------------------------- themes */
function wallsRect(g, B, h, mat, thick = 0.5) {
  const w = B.x1 - B.x0, d = B.z1 - B.z0, cx = (B.x0 + B.x1) / 2, cz = (B.z0 + B.z1) / 2;
  add(g, G.box, mat, [cx, h / 2, B.z0 - thick / 2], [w + thick * 2, h, thick]);
  add(g, G.box, mat, [cx, h / 2, B.z1 + thick / 2], [w + thick * 2, h, thick]);
  add(g, G.box, mat, [B.x0 - thick / 2, h / 2, cz], [thick, h, d]);
  add(g, G.box, mat, [B.x1 + thick / 2, h / 2, cz], [thick, h, d]);
}
function skyDome(g, top, mid, bottom) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(180, 24, 12), new THREE.MeshBasicMaterial({ map: skyTex(top, mid, bottom), side: THREE.BackSide, fog: false, depthWrite: false }));
  m.renderOrder = -1;
  g.add(m);
}
function skyline(g, r0, r1, n, yBase, hRange, colors, seedN) {
  seed = seedN;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rnd() * 0.1;
    const r = r0 + rnd() * (r1 - r0);
    const w = 5 + rnd() * 8, h = hRange[0] + rnd() * (hRange[1] - hRange[0]);
    const tex = ownClone(windowTex(colors[i % colors.length], i % 4));
    tex.repeat.set(Math.max(1, Math.round(w / 4)), Math.max(1, Math.round(h / 6)));
    const m = new THREE.Mesh(G.box, new THREE.MeshBasicMaterial({ map: tex, color: "#9a9ab0" }));
    m.position.set(Math.sin(a) * r, yBase + h / 2, Math.cos(a) * r);
    m.scale.set(w, h, w);
    m.rotation.y = a;
    g.add(m);
  }
}

export function buildScenery(level) {
  const g = new THREE.Group();
  const B = level.bounds;
  const lights = [];
  let env;
  if (level.theme === "sewer") {
    flat(g, new THREE.MeshLambertMaterial({ map: tileTex("#5a6a5e", "#2e3a32", 8) }), 0, 0, 23, 31);
    const brick = new THREE.MeshLambertMaterial({ map: brickTex("#5a4a3c", "#2a2420", 6, 2) });
    wallsRect(g, B, B.wallH, brick, 0.6);
    // arches + pipes along the walls
    for (let z = -12; z <= 12; z += 6)
      for (const s of [-1, 1]) {
        add(g, G.box, "#3a3230", [s * 10.9, 2.1, z], [0.25, 4.2, 0.7]);
        add(g, G.cyl, "#4a6a5a", [s * 10.6, 3.4, z + 3], [0.16, 6, 0.16], [Math.PI / 2, 0, 0]);
      }
    add(g, G.cyl, "#7a5a3a", [0, 3.6, 14.6], [0.22, 22, 0.22], [0, 0, Math.PI / 2]);
    // ceiling beams (above the camera's reach)
    for (let z = -13; z <= 13; z += 5.2) add(g, G.box, "#2a2622", [0, 5.6, z], [23, 0.5, 0.5]);
    env = { background: new THREE.Color("#0e1612"), fog: new THREE.Fog("#0e1612", 16, 42), hemi: ["#b8d8c0", "#3a4a3a", 1.25], sun: ["#d8ffd0", 1.1, [4, 10, -6]] };
  } else if (level.theme === "streets") {
    skyDome(g, "#0a0a24", "#3a2a5a", "#b05a6a");
    flat(g, new THREE.MeshLambertMaterial({ map: noiseTex("#3a3a42", ["#2a2a30", "#4a4a52"], 10) }), 0, 0, 44, 60);
    flat(g, new THREE.MeshLambertMaterial({ color: "#7a7880" }), -7.6, 0, 3, 60, 0.015); // sidewalks
    flat(g, new THREE.MeshLambertMaterial({ color: "#7a7880" }), 7.6, 0, 3, 60, 0.015);
    for (const s of [-1, 1]) add(g, G.box, "#9a98a0", [s * 6.05, 0.06, 0], [0.12, 0.12, 60]); // curbs
    for (let z = -26; z <= 26; z += 4) flat(g, glow("#e8d060", 0.85), 0, z, 0.18, 2, 0.02); // lane dashes
    for (let i = -3; i <= 3; i++) flat(g, glow("#d8d8d8", 0.8), i * 0.8, -11, 0.4, 2.6, 0.02); // crosswalk
    for (let i = -3; i <= 3; i++) flat(g, glow("#d8d8d8", 0.8), i * 0.8, 10.5, 0.4, 2.6, 0.02);
    // the safe zone by the van
    const S = level.safe;
    const zone = add(g, G.ring, new THREE.MeshBasicMaterial({ color: "#4aff7a", transparent: true, opacity: 0.55, depthWrite: false }), [S.x, 0.03, S.z], [S.r, S.r, 1], [-Math.PI / 2, 0, 0]);
    zone.name = "safeZone";
    zone.visible = false;
    skyline(g, 46, 70, 26, 0, [14, 34], ["#3a3a4a", "#4a3a3a", "#2a3a4a"], 21);
    env = { background: new THREE.Color("#1a1430"), fog: new THREE.Fog("#2a2040", 30, 95), hemi: ["#c8c0ff", "#4a3a3a", 1.35], sun: ["#ffd8b0", 1.3, [-8, 14, -10]] };
  } else if (level.theme === "rooftops") {
    skyDome(g, "#1a1a48", "#8a4a7a", "#ff9a5a");
    flat(g, new THREE.MeshLambertMaterial({ map: noiseTex("#5a5a60", ["#4a4a50", "#6a6a70"], 8) }), 0, 0, 30.6, 36.6);
    // parapets
    wallsRect(g, B, B.wallH, new THREE.MeshLambertMaterial({ map: brickTex("#8a5a46", "#4a342c", 8, 1) }), 0.4);
    // the alley gap: dark drop to the street far below
    const gap = level.props.find((p) => p.t === "channel");
    add(g, G.box, "#0c0c12", [0, -0.6, 0], [gap.x1 - gap.x0, 1.2, gap.z1 - gap.z0]);
    flat(g, glow("#1a1a28"), 0, 0, gap.x1 - gap.x0, gap.z1 - gap.z0, 0.0);
    // the two building bodies falling away below the roofs
    for (const s of [-1, 1]) add(g, G.box, "#4a3a3a", [0, -12, s * 9.7], [30.6, 24, 16.6]);
    skyline(g, 40, 72, 30, -30, [20, 48], ["#3a3a4a", "#5a4a4a", "#2a3a4a"], 33);
    env = { background: new THREE.Color("#5a3a6a"), fog: new THREE.Fog("#6a4a6a", 35, 110), hemi: ["#ffd8c8", "#4a3a5a", 1.4], sun: ["#ffb880", 1.6, [10, 8, 14]] };
  } else {
    skyDome(g, "#08060e", "#3a0e1a", "#8a2a1a");
    add(g, G.cyl, new THREE.MeshLambertMaterial({ map: tileTex("#3a3238", "#1e181c", 6) }), [0, -0.25, 0], [B.r + 1, 0.5, B.r + 1]);
    add(g, G.cyl, "#2a2028", [0, -3, 0], [B.r + 1.2, 5, B.r + 1.2]);
    // low railing around the edge
    const n = 40;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      add(g, G.box, "#3a2a30", [Math.sin(a) * (B.r + 0.35), B.wallH / 2, Math.cos(a) * (B.r + 0.35)], [2.45, B.wallH, 0.4], [0, a, 0]);
    }
    for (const p of level.props.filter((q) => q.t === "pillar")) {
      // red lanterns hang between pillars
      const a = Math.atan2(p.x, p.z) + Math.PI / 6;
      lights.push([Math.sin(a) * 12.5, 3, Math.cos(a) * 12.5, "#ff4a2a"]);
    }
    skyline(g, 50, 80, 30, -40, [25, 55], ["#2a2a3a", "#3a2a2a"], 45);
    env = { background: new THREE.Color("#1a0a10"), fog: new THREE.Fog("#2a0e14", 34, 110), hemi: ["#ffb8b0", "#3a1a2a", 1.3], sun: ["#ff9a7a", 1.5, [6, 12, -8]] };
  }

  for (const p of level.props) {
    switch (p.t) {
      case "building":
        building(g, p);
        break;
      case "car":
        car(g, p);
        break;
      case "van":
        van(g, p);
        break;
      case "lamp":
        lamp(g, p, lights);
        break;
      case "crate":
        crate(g, p);
        break;
      case "barrel":
        barrel(g, p);
        break;
      case "hydrant":
        add(g, G.cyl, "#d8302a", [p.x, 0.4, p.z], [p.r * 0.8, 0.8, p.r * 0.8]);
        add(g, G.sph, "#d8302a", [p.x, 0.8, p.z], [p.r * 0.8, p.r * 0.6, p.r * 0.8]);
        add(g, G.cyl, "#d8302a", [p.x, 0.5, p.z], [0.08, p.r * 2.4, 0.08], [0, 0, Math.PI / 2]);
        break;
      case "trash":
        add(g, G.cyl, "#5a6a6a", [p.x, p.h / 2, p.z], [p.r, p.h, p.r]);
        add(g, G.cyl, "#4a5858", [p.x, p.h + 0.03, p.z], [p.r + 0.04, 0.06, p.r + 0.04]);
        break;
      case "dumpster":
        add(g, G.box, "#2a6a3a", [p.x, p.h / 2, p.z], [p.w, p.h, p.d]);
        add(g, G.box, "#1e4a2a", [p.x, p.h + 0.04, p.z], [p.w + 0.1, 0.08, p.d + 0.1], [0.08, 0, 0]);
        break;
      case "barrier":
        add(g, G.box, "#e8e8e8", [p.x, p.h / 2, p.z], [p.w, p.h, p.d]);
        for (let i = 0; i < 6; i++) add(g, G.box, "#e04020", [p.x - p.w / 2 + 1.5 + i * 3, p.h / 2, p.z], [1.2, p.h + 0.02, p.d + 0.02]);
        break;
      case "couch":
        add(g, G.box, "#8a3a2a", [p.x, 0.3, p.z], [p.w, 0.5, p.d]);
        add(g, G.box, "#7a2e22", [p.x, 0.7, p.z + p.d / 2 - 0.15], [p.w, 0.8, 0.3]);
        for (const s of [-1, 1]) add(g, G.box, "#7a2e22", [p.x + s * (p.w / 2 - 0.15), 0.55, p.z], [0.3, 0.55, p.d]);
        break;
      case "tv":
        add(g, G.box, "#6a4a2a", [p.x, 0.35, p.z], [p.w, 0.7, p.d]);
        add(g, G.box, "#2a2a2a", [p.x, 1.05, p.z], [p.w * 0.8, 0.75, p.d * 0.8]);
        add(g, G.box, glow("#6ab8ff", 0.9), [p.x, 1.05, p.z - p.d * 0.41], [p.w * 0.62, 0.55, 0.02]);
        break;
      case "pipe":
        add(g, G.cyl, "#5a7a6a", [p.x, p.h / 2, p.z], [p.r, p.h, p.r]);
        for (const y of [0.6, p.h - 0.6]) add(g, G.cyl, "#3a5a4a", [p.x, y, p.z], [p.r + 0.05, 0.12, p.r + 0.05]);
        break;
      case "bridge":
        if (p.style === "grate") {
          add(g, G.box, "#4a5258", [p.x, 0.0, p.z], [p.w, 0.1, p.d]);
          for (let i = -4; i <= 4; i++) add(g, G.box, "#2a3036", [p.x + i * (p.w / 9), 0.06, p.z], [0.06, 0.04, p.d]);
          for (const s of [-1, 1]) add(g, G.box, "#6a7278", [p.x + s * (p.w / 2), 0.5, p.z], [0.08, 0.08, p.d]);
        } else {
          for (let i = -2; i <= 2; i++) add(g, G.box, "#8a6a42", [p.x + i * (p.w / 5), 0.02, p.z], [p.w / 5 - 0.06, 0.1, p.d + 0.6]);
        }
        break;
      case "channel":
        if (p.style === "water") {
          const w = p.x1 - p.x0, d = p.z1 - p.z0;
          add(g, G.box, "#22302a", [(p.x0 + p.x1) / 2, -0.5, (p.z0 + p.z1) / 2], [w, 1, d]);
          const water = add(g, G.plane, new THREE.MeshLambertMaterial({ color: "#3a8a5a", emissive: "#1a6a3a", emissiveIntensity: 0.35, transparent: true, opacity: 0.88 }), [(p.x0 + p.x1) / 2, -0.25, (p.z0 + p.z1) / 2], [w, d, 1], [-Math.PI / 2, 0, 0]);
          water.name = "water";
          for (const z of [p.z0, p.z1]) add(g, G.box, "#4a5a52", [(p.x0 + p.x1) / 2, 0.04, z], [w, 0.08, 0.25]);
        }
        break;
      case "tower":
        add(g, G.cyl, "#8a6a4a", [p.x, p.h - 1.6, p.z], [p.r, 3, p.r]);
        add(g, G.cone, "#5a4a3a", [p.x, p.h + 0.4, p.z], [p.r + 0.2, 1, p.r + 0.2]);
        for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) add(g, G.cyl8, "#3a3a40", [p.x + sx * p.r * 0.7, (p.h - 3.1) / 2, p.z + sz * p.r * 0.7], [0.1, p.h - 3.1, 0.1]);
        add(g, G.cyl, "#3a3a40", [p.x, 0.2, p.z], [p.r * 0.9, 0.4, p.r * 0.9]);
        break;
      case "hut":
        add(g, G.box, "#7a5a4a", [p.x, p.h / 2, p.z], [p.w, p.h, p.d]);
        add(g, G.box, "#4a3a32", [p.x, p.h + 0.08, p.z], [p.w + 0.2, 0.16, p.d + 0.2]);
        add(g, G.box, "#3a2a22", [p.x + p.w / 2 - 1, 1.05, p.z - p.d / 2 - 0.01], [0.9, 2.1, 0.05]);
        break;
      case "ac":
        add(g, G.box, "#b8bcc4", [p.x, p.h / 2, p.z], [p.w, p.h, p.d]);
        add(g, G.cyl, "#5a5e66", [p.x, p.h + 0.01, p.z], [Math.min(p.w, p.d) * 0.36, 0.04, Math.min(p.w, p.d) * 0.36]);
        break;
      case "skylight":
        add(g, G.box, "#5a5e66", [p.x, p.h / 2, p.z], [p.w, p.h, p.d]);
        add(g, G.box, glow("#9ad0ff", 0.75), [p.x, p.h + 0.01, p.z], [p.w - 0.3, 0.04, p.d - 0.3]);
        break;
      case "chimney":
        add(g, G.cyl8, new THREE.MeshLambertMaterial({ map: brickTex("#8a5a46", "#4a342c", 2, 2) }), [p.x, p.h / 2, p.z], [p.r, p.h, p.r]);
        break;
      case "pillar": {
        add(g, G.cyl8, "#2e2228", [p.x, p.h / 2, p.z], [p.r, p.h, p.r]);
        add(g, G.box, "#5a1a24", [p.x, p.h + 0.15, p.z], [p.r * 2.6, 0.3, p.r * 2.6]);
        add(g, G.box, "#5a1a24", [p.x, 0.15, p.z], [p.r * 2.4, 0.3, p.r * 2.4]);
        const a = Math.atan2(p.x, p.z);
        add(g, G.box, "#8a1418", [p.x - Math.sin(a) * (p.r + 0.02), p.h * 0.6, p.z - Math.cos(a) * (p.r + 0.02)], [p.r * 1.7, 2.2, 0.05], [0, a, 0]); // banner
        add(g, G.cyl, glow("#1a0c10"), [p.x - Math.sin(a) * (p.r + 0.06), p.h * 0.64, p.z - Math.cos(a) * (p.r + 0.06)], [0.32, 0.02, 0.32], [Math.PI / 2, 0, -a]);
        break;
      }
      case "decor":
        decor(g, p);
        break;
      default:
        break;
    }
  }
  // glowing bulbs / lanterns (no real lights — cheap emissive spheres)
  for (const [x, y, z, c] of lights) {
    if (level.theme === "arena") {
      add(g, G.cyl8, "#2a1a1a", [x, y + 1, z], [0.02, 2, 0.02]);
      add(g, G.sph, glow(c, 1.1), [x, y, z], [0.32, 0.42, 0.32]);
    }
  }
  return { group: g, env };
}

/** Pizza box pickup (spinning slice + glow beam). */
export function buildItem() {
  const g = new THREE.Group();
  const spin = new THREE.Group();
  g.add(spin);
  add(spin, G.box, "#e8dcc0", [0, 0, 0], [0.55, 0.08, 0.55]);
  add(spin, G.cyl, "#e8b04a", [0, 0.06, 0], [0.24, 0.04, 0.24]); // pizza
  add(spin, G.cyl, "#d8402a", [0, 0.085, 0], [0.2, 0.01, 0.2]);
  for (const [x, z] of [[0.08, 0.05], [-0.07, 0.07], [0.02, -0.1]]) add(spin, G.cyl, "#8a1a1a", [x, 0.095, z], [0.035, 0.01, 0.035]);
  spin.rotation.x = -0.5;
  const beam = add(g, G.cyl, new THREE.MeshBasicMaterial({ color: "#ffd860", transparent: true, opacity: 0.18, depthWrite: false }), [0, 1.4, 0], [0.32, 2.8, 0.32]);
  g.userData = { spin, beam };
  return g;
}
