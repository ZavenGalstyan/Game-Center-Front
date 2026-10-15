/**
 * Tank Warfare 3D — procedural models (Three.js).
 *
 * Every vehicle is built once per look from boxes, cylinders and extruded
 * profiles, merged into ONE geometry per material key, so a tank costs ~10
 * draw calls no matter how much detail it carries. Each instance gets its own
 * three transform groups (hull → turret → gun → recoil) and clones only the
 * paint/accent materials (for damage tint); everything else is shared.
 *
 * Road wheels and sprockets are NOT part of the tank meshes: world.js draws
 * every wheel of every vehicle with one InstancedMesh (they spin individually),
 * using the wheel layout reported here.
 *
 * Model space matches sim.js: +z forward, y up, origin on the ground at the
 * hull centre. Dimensions come from LOOKS (data.js) so hit boxes match.
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { LOOKS, TANKS } from "./data.js";

/* ------------------------------------------------------------------ textures */
function canvasTex(w, h, draw, repeat = true) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
function rnd(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeTextures() {
  const R = rnd(7);
  // weathered paint: light base with mottling, scratches and grime streaks (multiplied by the paint colour)
  const grime = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = "#d9d9d9";
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 260; i++) {
      const v = 175 + R() * 70;
      g.fillStyle = `rgba(${v},${v},${v},${0.18 + R() * 0.2})`;
      const r = 4 + R() * 22;
      g.beginPath();
      g.arc(R() * w, R() * h, r, 0, Math.PI * 2);
      g.fill();
    }
    for (let i = 0; i < 70; i++) {
      g.strokeStyle = `rgba(70,62,50,${0.08 + R() * 0.12})`;
      g.lineWidth = 1 + R() * 3;
      const x = R() * w;
      g.beginPath();
      g.moveTo(x, R() * h * 0.5);
      g.lineTo(x + (R() - 0.5) * 6, h);
      g.stroke();
    }
    for (let i = 0; i < 120; i++) {
      g.fillStyle = `rgba(240,240,240,${0.25 + R() * 0.3})`;
      g.fillRect(R() * w, R() * h, 1 + R() * 6, 1);
    }
  });
  // camouflage blotches for player tanks (multiplied)
  const camo = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = "#e6e6e6";
    g.fillRect(0, 0, w, h);
    const tones = ["rgba(170,170,160,0.45)", "rgba(140,138,128,0.4)", "rgba(250,250,240,0.3)"];
    for (let i = 0; i < 26; i++) {
      g.fillStyle = tones[i % 3];
      g.beginPath();
      const cx = R() * w;
      const cy = R() * h;
      for (let k = 0; k < 9; k++) {
        const a = (k / 9) * Math.PI * 2;
        const r = 14 + R() * 26;
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r * 0.7;
        if (k === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.closePath();
      g.fill();
    }
    for (let i = 0; i < 90; i++) {
      g.fillStyle = `rgba(60,55,45,${0.06 + R() * 0.1})`;
      g.fillRect(R() * w, R() * h, 1 + R() * 3, 2 + R() * 14);
    }
  });
  // track tread: grousers + links (u along the loop, repeats every 0.5 m)
  const tread = canvasTex(64, 128, (g, w, h) => {
    g.fillStyle = "#3a3936";
    g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 32) {
      g.fillStyle = "#56544f";
      g.fillRect(0, y + 2, w, 13);
      g.fillStyle = "#24231f";
      g.fillRect(0, y + 15, w, 3);
      g.fillStyle = "#6d6a63";
      g.fillRect(w * 0.42, y + 18, w * 0.16, 12);
      g.fillStyle = "#2c2b28";
      g.fillRect(0, y + 28, w, 4);
    }
  });
  tread.colorSpace = THREE.SRGBColorSpace;
  // metal plate noise for dark parts
  const metal = canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = "#cfcfcf";
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 400; i++) {
      const v = 170 + R() * 80;
      g.fillStyle = `rgba(${v},${v},${v},0.3)`;
      g.fillRect(R() * w, R() * h, 1 + R() * 4, 1 + R() * 4);
    }
  });
  // dummy target rings
  const target = canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = "#e8dcc0";
    g.fillRect(0, 0, w, h);
    for (let r = 60; r > 0; r -= 14) {
      g.fillStyle = (r / 14) % 2 < 1 ? "#d9481c" : "#f4efe2";
      g.beginPath();
      g.arc(w / 2, h / 2, r, 0, Math.PI * 2);
      g.fill();
    }
  }, false);
  camo.repeat.set(0.3, 0.3);
  grime.repeat.set(0.5, 0.5);
  return { grime, camo, tread, metal, target };
}

/* ------------------------------------------------------------------ geometry kit */
/** Box with UVs in metres (so tiling textures don't stretch). */
export function boxGeo(sx, sy, sz) {
  const g = new THREE.BoxGeometry(sx, sy, sz);
  const uv = g.attributes.uv;
  const dims = [[sz, sy], [sz, sy], [sx, sz], [sx, sz], [sx, sy], [sx, sy]];
  for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) {
    const i = f * 4 + k;
    uv.setXY(i, uv.getX(i) * dims[f][0], uv.getY(i) * dims[f][1]);
  }
  return g;
}
export function cylGeo(rt, rb, h, seg = 12, open = false) {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg, 1, open);
  const uv = g.attributes.uv;
  const circ = Math.PI * (rt + rb);
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * circ, uv.getY(i) * h);
  return g;
}
const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();

/** Collects positioned geometries per material key; build() merges them. */
export class Parts {
  constructor() {
    this.map = new Map();
  }
  add(key, geo, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
    tmpE.set(rx, ry, rz, "YXZ");
    tmpQ.setFromEuler(tmpE);
    tmpM.compose(new THREE.Vector3(x, y, z), tmpQ, new THREE.Vector3(sx, sy, sz));
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    if (g !== geo && geo.index) geo.dispose();
    g.applyMatrix4(tmpM);
    if (!g.attributes.uv) g.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    for (const k of Object.keys(g.attributes)) if (k !== "position" && k !== "normal" && k !== "uv") g.deleteAttribute(k);
    if (!this.map.has(key)) this.map.set(key, []);
    this.map.get(key).push(g);
    return this;
  }
  box(key, x, y, z, sx, sy, sz, rx = 0, ry = 0, rz = 0) {
    return this.add(key, boxGeo(sx, sy, sz), x, y, z, rx, ry, rz);
  }
  /** Cylinder along an axis ('x' | 'y' | 'z'). */
  cyl(key, x, y, z, r, h, axis = "y", seg = 12, rb = r) {
    const g = cylGeo(r, rb, h, seg);
    const rx = axis === "z" ? Math.PI / 2 : 0;
    const rz = axis === "x" ? -Math.PI / 2 : 0;
    return this.add(key, g, x, y, z, rx, 0, rz);
  }
  /** Side profile [[z,y],…] extruded across x (width w, centred at cx). */
  side(key, profile, w, cx = 0, bevel = 0.04) {
    const s = new THREE.Shape(profile.map(([z, y]) => new THREE.Vector2(z, y)));
    const g = new THREE.ExtrudeGeometry(s, { depth: w - bevel * 2, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 1, curveSegments: 4 });
    // shape x→z, shape y→y, extrude z→x
    g.rotateY(-Math.PI / 2);
    g.translate(cx + (w - bevel * 2) / 2, 0, 0);
    return this.add(key, g);
  }
  /** Top outline [[x,z],…] extruded upward from y0 by h. */
  top(key, outline, y0, h, bevel = 0.05) {
    const s = new THREE.Shape(outline.map(([x, z]) => new THREE.Vector2(x, -z)));
    const g = new THREE.ExtrudeGeometry(s, { depth: Math.max(0.01, h - bevel * 2), bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 1, curveSegments: 6 });
    g.rotateX(-Math.PI / 2);
    g.translate(0, y0 + bevel, 0);
    return this.add(key, g);
  }
  build() {
    const out = {};
    for (const [k, list] of this.map) {
      out[k] = mergeGeometries(list, false);
      for (const g of list) g.dispose();
      out[k].computeBoundingSphere();
    }
    this.map.clear();
    return out;
  }
}

/** Track loop ribbon (outer tread + both side faces) with u = arc length. */
export function trackGeo(len, rr, w, thick = 0.1, seg = 10) {
  // stadium path in (z,y): arcs centred at z=±a, y=rr
  const a = len / 2 - rr;
  const pts = [];
  const push = (z, y, nz, ny) => pts.push([z, y, nz, ny]);
  // bottom run rear→front
  const n = 8;
  for (let i = 0; i <= n; i++) push(-a + (2 * a * i) / n, 0, 0, -1);
  for (let i = 1; i <= seg; i++) {
    const t = -Math.PI / 2 + (Math.PI * i) / seg;
    push(a + Math.cos(t) * rr, rr + Math.sin(t) * rr, Math.cos(t), Math.sin(t));
  }
  for (let i = 1; i <= n; i++) push(a - (2 * a * i) / n, 2 * rr, 0, 1);
  for (let i = 1; i <= seg; i++) {
    const t = Math.PI / 2 + (Math.PI * i) / seg;
    push(-a + Math.cos(t) * rr, rr + Math.sin(t) * rr, Math.cos(t), Math.sin(t));
  }
  const s = [0];
  for (let i = 1; i < pts.length; i++) s.push(s[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const pos = [];
  const nor = [];
  const uv = [];
  const hw = w / 2;
  const quad = (p0, p1, p2, p3, n0, n1, n2, n3, u0, u1, v0, v1) => {
    pos.push(...p0, ...p1, ...p2, ...p0, ...p2, ...p3);
    nor.push(...n0, ...n1, ...n2, ...n0, ...n2, ...n3);
    uv.push(u0, v0, u1, v0, u1, v1, u0, v0, u1, v1, u0, v1);
  };
  for (let i = 0; i < pts.length - 1; i++) {
    const [z0, y0, nz0, ny0] = pts[i];
    const [z1, y1, nz1, ny1] = pts[i + 1];
    const u0 = s[i] * 2;
    const u1 = s[i + 1] * 2;
    // outer tread surface
    quad([-hw, y0, z0], [-hw, y1, z1], [hw, y1, z1], [hw, y0, z0], [0, ny0, nz0], [0, ny1, nz1], [0, ny1, nz1], [0, ny0, nz0], u0, u1, 0, 1);
    // side faces (ring between outer and inner)
    const iz0 = z0 - nz0 * thick;
    const iy0 = y0 - ny0 * thick;
    const iz1 = z1 - nz1 * thick;
    const iy1 = y1 - ny1 * thick;
    quad([hw, y0, z0], [hw, y1, z1], [hw, iy1, iz1], [hw, iy0, iz0], [1, 0, 0], [1, 0, 0], [1, 0, 0], [1, 0, 0], u0, u1, 0, 0.12);
    quad([-hw, iy0, iz0], [-hw, iy1, iz1], [-hw, y1, z1], [-hw, y0, z0], [-1, 0, 0], [-1, 0, 0], [-1, 0, 0], [-1, 0, 0], u0, u1, 0, 0.12);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.computeBoundingSphere();
  return g;
}

/** Unit wheel along x (radius 1, width 1) with hub, rim and bolts. */
export function wheelGeo(kind = "road") {
  const P = new Parts();
  if (kind === "road") {
    P.cyl("w", 0, 0, 0, 1, 1, "x", 18);
    P.cyl("w", 0.52, 0, 0, 0.72, 0.06, "x", 18);
    P.cyl("w", 0.56, 0, 0, 0.32, 0.12, "x", 10);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      P.box("w", 0.6, Math.cos(a) * 0.48, Math.sin(a) * 0.48, 0.08, 0.12, 0.12);
    }
  } else if (kind === "sprocket") {
    P.cyl("w", 0, 0, 0, 0.92, 0.8, "x", 16);
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      P.box("w", 0, Math.cos(a) * 0.95, Math.sin(a) * 0.95, 0.5, 0.22, 0.22, a, 0, 0);
    }
    P.cyl("w", 0.45, 0, 0, 0.36, 0.2, "x", 10);
  } else {
    // truck tyre
    P.cyl("w", 0, 0, 0, 1, 1, "x", 16);
    P.cyl("w", 0.51, 0, 0, 0.55, 0.04, "x", 14);
    P.cyl("w", 0.53, 0, 0, 0.18, 0.1, "x", 8);
  }
  return P.build().w;
}

/* ------------------------------------------------------------------ vehicle designs */
const STYLE = {
  fox: { style: "mbt", paint: TANKS.fox.paint, accent: 0x2c3420, camo: true },
  viper: { style: "light", paint: TANKS.viper.paint, accent: 0x6b5634, camo: true },
  titan: { style: "heavy", paint: TANKS.titan.paint, accent: 0x353b41, camo: true, era: true },
  phantom: { style: "stealth", paint: TANKS.phantom.paint, accent: 0x14b8c4, camo: false, sensor: true },
  scout: { style: "light", paint: 0x8a7258, accent: 0xb3301e },
  raider: { style: "mbt", paint: 0x74726a, accent: 0xb3301e },
  bulwark: { style: "heavy", paint: 0x626860, accent: 0xb3301e, era: true },
  lancer: { style: "td", paint: 0x857a5e, accent: 0xb3301e },
  warlord: { style: "heavy", paint: 0x46403c, accent: 0xd0361f, era: true, boss: true },
  ally: { style: "mbt", paint: 0x5d6a45, accent: 0x2e5fa8 },
  truck: { style: "truck", paint: 0x8b7a58, accent: 0xa3281e, cargo: "fuel" },
  convoy: { style: "truck", paint: 0x4f5a3a, accent: 0x2e5fa8, cargo: "canvas" },
  dummy: { style: "dummy", paint: 0xc8b48a, accent: 0xd9481c },
};

const DESIGN_CACHE = new Map();

/** All cached vehicle geometries; with clear=true the cache is emptied (unmount). */
export function designGeometries(clear = false) {
  const out = [];
  for (const d of DESIGN_CACHE.values()) {
    for (const part of [d.hull, d.turret, d.gun]) if (part) out.push(...Object.values(part));
    if (d.track) out.push(d.track);
  }
  if (clear) DESIGN_CACHE.clear();
  return out;
}

/** Geometry + layout for a look (cached; shared by all instances). */
export function design(look) {
  if (DESIGN_CACHE.has(look)) return DESIGN_CACHE.get(look);
  const L = LOOKS[look] || LOOKS.fox;
  const S = STYLE[look] || STYLE.fox;
  let d;
  if (S.style === "truck") d = buildTruck(L, S);
  else if (S.style === "dummy") d = buildDummy(L, S);
  else d = buildTank(L, S);
  d.look = look;
  d.L = L;
  d.S = S;
  DESIGN_CACHE.set(look, d);
  return d;
}

function buildTank(L, S) {
  const { hx, hz, top, ty, tz, tr, th, barrel } = L;
  const heavy = S.style === "heavy";
  const light = S.style === "light";
  const td = S.style === "td";
  const stealth = S.style === "stealth";
  const H = new Parts();
  const T = new Parts();
  const Gp = new Parts();
  const trackW = light ? 0.52 : heavy ? 0.7 : 0.62;
  const tx = hx - trackW / 2 - 0.02;
  const rr = 0.47;
  const trackLen = hz * 2 - 0.3;
  const innerW = 2 * (hx - trackW) + 0.1;
  // lower hull between the tracks (sloped lower front plate)
  H.side("dark", [[-hz + 0.25, 0.38], [hz - 0.8, 0.38], [hz - 0.12, 1.0], [-hz + 0.1, 1.0]], innerW, 0, 0.03);
  // upper hull over the tracks with a long upper glacis
  const glacis = heavy ? 1.3 : stealth ? 2.1 : 1.65;
  const deckY = top;
  H.side("paint", [[-hz + 0.08, 0.98], [hz - 0.06, 0.98], [hz, 1.2], [hz - glacis, deckY], [-hz + 0.35, deckY], [-hz, deckY - 0.28]], hx * 2 - 0.06, 0, 0.05);
  // side skirts in segments
  const panels = light ? 4 : heavy ? 6 : 5;
  const skL = (trackLen - 0.5) / panels;
  for (let i = 0; i < panels; i++) {
    const z = -trackLen / 2 + 0.25 + skL * (i + 0.5);
    for (const sx of [-1, 1]) {
      H.box("paint", sx * (hx + 0.03), 0.8, z, 0.07, heavy ? 0.5 : 0.42, skL - 0.05);
      if (heavy && i % 2 === 0) H.box("dark", sx * (hx + 0.08), 0.8, z, 0.03, 0.36, skL * 0.7);
    }
  }
  // front: headlights, tow hooks, spare track links, driver hatch
  for (const sx of [-1, 1]) {
    H.box("dark", sx * (hx - 0.32), 1.24, hz - 0.18, 0.34, 0.16, 0.16);
    H.box("light", sx * (hx - 0.24), 1.25, hz - 0.08, 0.12, 0.09, 0.04);
    H.box("light", sx * (hx - 0.42), 1.25, hz - 0.08, 0.12, 0.09, 0.04);
    H.box("metal", sx * (hx - 0.7), 0.55, hz - 0.15, 0.14, 0.14, 0.3);
    H.box("red", sx * (hx - 0.25), deckY - 0.12, -hz + 0.02, 0.14, 0.08, 0.04);
  }
  if (!stealth) for (let i = 0; i < (heavy ? 5 : 4); i++) H.box("dark", -0.6 + i * 0.32 + (heavy ? -0.2 : 0), 1.32, hz - 0.45, 0.26, 0.06, 0.32, -0.3);
  H.box("dark", 0.0, deckY + 0.04, hz - glacis + 0.35, 0.62, 0.08, 0.5);
  H.box("glass", 0.0, deckY + 0.1, hz - glacis + 0.62, 0.36, 0.07, 0.05);
  // engine deck grilles and exhausts
  for (let i = 0; i < 3; i++) H.box("dark", 0, deckY + 0.015, -hz + 0.7 + i * 0.42, hx * 1.2, 0.03, 0.3);
  const exhausts = [];
  for (const sx of [-1, 1]) {
    H.box("dark", sx * (hx - 0.55), deckY - 0.3, -hz - 0.02, 0.7, 0.3, 0.1);
    H.cyl("metal", sx * (hx - 0.55), deckY - 0.3, -hz - 0.08, 0.1, 0.12, "z", 8);
    exhausts.push([sx * (hx - 0.55), deckY - 0.3, -hz - 0.2]);
  }
  // stowage boxes on the sponsons
  for (const sx of [-1, 1]) {
    H.box("paint", sx * (hx - 0.32), deckY + 0.16, -hz * 0.42, 0.5, 0.32, 1.1);
    H.box("dark", sx * (hx - 0.32), deckY + 0.33, -hz * 0.42, 0.52, 0.03, 1.12);
    if (!light) H.box("paint", sx * (hx - 0.3), deckY + 0.12, hz * 0.18, 0.44, 0.24, 0.8);
  }
  // fenders over the track ends
  for (const sx of [-1, 1]) {
    H.box("paint", sx * tx, 1.02, hz + 0.05, trackW + 0.06, 0.05, 0.42, -0.25);
    H.box("rubber", sx * tx, 0.82, -hz - 0.06, trackW, 0.36, 0.04);
  }
  if (S.era) {
    // explosive reactive armour bricks on the glacis
    for (let r = 0; r < 2; r++) for (let c = -3; c <= 3; c++) H.box("accentDark", c * 0.42, 1.3 + r * 0.22, hz - 0.35 - r * 0.42, 0.38, 0.1, 0.36, -0.3);
  }
  if (S.sensor) {
    for (const sx of [-1, 1]) H.box("sensor", sx * (hx - 0.05), 1.08, 0, 0.03, 0.04, hz * 1.4);
  }

  // ---------------- turret (pivot at (0, top, tz) in hull space; y=0 is the hull roof)
  const k = tr;
  let outline;
  if (stealth) outline = [[-0.35 * k, 1.25 * k], [0.35 * k, 1.25 * k], [k, 0.25 * k], [0.95 * k, -0.9 * k], [0.7 * k, -1.3 * k], [-0.7 * k, -1.3 * k], [-0.95 * k, -0.9 * k], [-k, 0.25 * k]];
  else if (light) outline = [[-0.45 * k, 0.95 * k], [0.45 * k, 0.95 * k], [k, 0.35 * k], [k, -0.7 * k], [0.7 * k, -1.05 * k], [-0.7 * k, -1.05 * k], [-k, -0.7 * k], [-k, 0.35 * k]];
  else if (td) outline = [[-0.7 * k, 1.1 * k], [0.7 * k, 1.1 * k], [k, 0.6 * k], [k, -1.0 * k], [-k, -1.0 * k], [-k, 0.6 * k]];
  else outline = [[-0.55 * k, 1.05 * k], [0.55 * k, 1.05 * k], [k, 0.45 * k], [0.98 * k, -0.75 * k], [0.8 * k, -1.28 * k], [-0.8 * k, -1.28 * k], [-0.98 * k, -0.75 * k], [-k, 0.45 * k]];
  T.cyl("dark", 0, 0.06, 0, k * 0.82, 0.14, "y", 20);
  T.top("paint", outline, 0.08, th, 0.06);
  if (heavy || S.era) {
    for (const sx of [-1, 1]) for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) T.box("accentDark", sx * (0.32 + c * 0.24) * k, 0.3 + r * 0.24, 1.08 * k, 0.2 * k, 0.2, 0.14, 0, sx * 0.35);
  }
  // accent stripe (unit marking) on both turret sides
  for (const sx of [-1, 1]) T.box("accent", sx * (k + 0.005), 0.08 + th * 0.55, -0.2 * k, 0.02, 0.12, 0.9 * k);
  // mantlet + gun trunnion
  const trunY = ty - top;
  const trunZ = td ? 1.1 * k : 1.0 * k;
  T.box("paint", 0, trunY, trunZ, 0.62 * k + 0.2, th * 0.7, 0.42);
  T.box("dark", 0, trunY, trunZ + 0.22, 0.34, 0.34, 0.12);
  // commander cupola, hatch, MG, sight, smoke launchers, antenna, bustle rack
  const top2 = 0.08 + th;
  T.cyl("paint", -0.45 * k, top2 + 0.1, -0.25 * k, 0.3, 0.2, "y", 12);
  T.cyl("dark", -0.45 * k, top2 + 0.22, -0.25 * k, 0.26, 0.05, "y", 12);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    T.box("glass", -0.45 * k + Math.sin(a) * 0.29, top2 + 0.14, -0.25 * k + Math.cos(a) * 0.29, 0.08, 0.06, 0.04, 0, a);
  }
  T.cyl("dark", -0.45 * k + 0.12, top2 + 0.36, -0.25 * k + 0.25, 0.035, 0.85, "z", 6);
  T.box("dark", -0.45 * k + 0.12, top2 + 0.33, -0.25 * k - 0.1, 0.12, 0.14, 0.3);
  T.box("dark", 0.5 * k, top2 + 0.14, 0.5 * k, 0.3, 0.28, 0.36);
  T.box("glass", 0.5 * k, top2 + 0.16, 0.5 * k + 0.19, 0.24, 0.16, 0.02);
  T.box("dark", 0.2 * k, top2 + 0.06, -0.55 * k, 0.5, 0.12, 0.5);
  for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) T.cyl("dark", sx * (0.82 * k + i * 0.02), 0.1 + th * 0.7, (0.55 - i * 0.12) * k, 0.055, 0.28, "z", 6);
  const antennaBase = [-0.62 * k, top2, -0.95 * k];
  T.cyl("dark", antennaBase[0], antennaBase[1] + 0.06, antennaBase[2], 0.05, 0.12, "y", 6);
  if (!td) {
    // bustle stowage basket
    const bz = (light ? -1.05 : -1.28) * k - 0.25;
    T.box("dark", 0, 0.45, bz - 0.2, 1.4 * k, 0.04, 0.04);
    T.box("dark", 0, 0.75, bz - 0.2, 1.4 * k, 0.04, 0.04);
    for (const sx of [-1, 1]) T.box("dark", sx * 0.7 * k, 0.6, bz - 0.05, 0.04, 0.34, 0.4);
    T.box("rubber", 0.2 * k, 0.6, bz, 0.5 * k, 0.26, 0.26);
  }
  if (S.sensor) {
    T.box("sensor", 0, 0.08 + th * 0.35, 1.0 * k + 0.02, 0.9 * k, 0.04, 0.02);
    T.cyl("dark", 0.15 * k, top2 + 0.45, -0.5 * k, 0.04, 0.7, "y", 6);
    T.box("dark", 0.15 * k, top2 + 0.82, -0.5 * k, 0.36, 0.14, 0.14);
    T.box("sensor", 0.15 * k, top2 + 0.82, -0.5 * k + 0.08, 0.3, 0.06, 0.01);
  }
  if (S.boss) {
    // command tank: extra plates and a second coax mount
    for (const sx of [-1, 1]) T.box("accentDark", sx * k * 1.02, 0.08 + th * 0.4, 0.1 * k, 0.12, th * 0.7, 1.4 * k);
    T.box("accent", 0, top2 + 0.02, 0.1 * k, 0.5 * k, 0.03, 0.8 * k);
  }

  // ---------------- gun (pivot at trunnion; +z along the barrel)
  const gunLen = barrel - trunZ;
  const rB = (heavy ? 0.14 : light ? 0.1 : 0.12) * (S.boss ? 1.15 : 1);
  Gp.cyl("metal", 0, 0, gunLen * 0.5 + 0.1, rB * 0.82, gunLen - 0.2, "z", 14, rB);
  Gp.cyl("paint", 0, 0, gunLen * 0.42, rB * 1.45, gunLen * 0.16, "z", 14);
  Gp.cyl("paint", 0, 0, 0.45, rB * 1.35, 0.7, "z", 14);
  for (let i = 1; i <= 3; i++) Gp.cyl("dark", 0, 0, gunLen * (0.2 + i * 0.16), rB * 1.04, 0.05, "z", 12);
  if (light || S.boss || td) {
    Gp.box("dark", 0, 0, gunLen - 0.12, rB * 2.6, rB * 1.6, 0.3);
  } else Gp.cyl("dark", 0, 0, gunLen - 0.1, rB * 1.15, 0.2, "z", 12);
  // coax MG
  Gp.cyl("dark", 0.28, -0.05, 0.25, 0.03, 0.5, "z", 6);

  // wheel layout (instanced in world.js), in hull space
  const wheels = [];
  const n = L.wheels;
  const span = trackLen - rr * 2 - 0.5;
  const wr = light ? 0.36 : heavy ? 0.4 : 0.38;
  for (const sx of [-1, 1]) {
    for (let i = 0; i < n; i++) wheels.push({ x: sx * tx, y: wr + 0.02, z: -span / 2 + (span * i) / (n - 1), r: wr, w: trackW * 0.78, kind: "road", side: sx });
    wheels.push({ x: sx * tx, y: rr + 0.12, z: -trackLen / 2 + rr + 0.05, r: rr * 0.92, w: trackW * 0.7, kind: "sprocket", side: sx });
    wheels.push({ x: sx * tx, y: rr + 0.12, z: trackLen / 2 - rr - 0.05, r: rr * 0.8, w: trackW * 0.7, kind: "road", side: sx });
    // return rollers
    for (let i = 0; i < (heavy ? 3 : 2); i++) wheels.push({ x: sx * tx, y: rr * 2 - 0.08, z: -span / 3 + (i * span) / (heavy ? 3 : 2) * 0.8, r: 0.12, w: trackW * 0.5, kind: "road", side: sx });
  }
  const hull = H.build();
  const turret = T.build();
  const gun = Gp.build();
  const track = trackGeo(trackLen, rr, trackW);
  return {
    kind: "tank",
    hull,
    turret,
    gun,
    track,
    trackX: tx,
    trackLen,
    wheels,
    exhausts,
    turretPos: [0, top, tz],
    trunnion: [0, trunY, trunZ],
    gunLen,
    antenna: antennaBase,
    antennaLen: heavy ? 2.6 : 2.3,
    muzzleR: rB,
    lights: [[-(hx - 0.33), 1.25, hz], [hx - 0.33, 1.25, hz]],
  };
}

function buildTruck(L, S) {
  const { hx, hz } = L;
  const H = new Parts();
  // chassis
  H.box("dark", 0, 0.75, 0, hx * 1.5, 0.3, hz * 2 - 0.2);
  // cab
  H.box("paint", 0, 1.55, hz - 1.0, hx * 2, 1.35, 1.7);
  H.box("paint", 0, 1.05, hz - 0.05, hx * 1.9, 0.5, 0.25);
  H.box("glass", 0, 1.85, hz - 0.14, hx * 1.7, 0.55, 0.04);
  for (const sx of [-1, 1]) H.box("glass", sx * (hx + 0.005), 1.85, hz - 0.95, 0.02, 0.5, 0.9);
  H.box("dark", 0, 2.26, hz - 1.0, hx * 2.02, 0.06, 1.72);
  for (const sx of [-1, 1]) {
    H.box("light", sx * (hx - 0.3), 1.05, hz + 0.08, 0.26, 0.16, 0.03);
    H.box("dark", sx * (hx + 0.12), 1.9, hz - 0.3, 0.06, 0.25, 0.16);
    H.box("paint", sx * (hx - 0.05), 1.0, 0.3, 0.1, 0.3, 2.6);
  }
  // cargo
  if (S.cargo === "fuel") {
    H.cyl("paint", 0, 1.75, -0.95, hx * 0.92, hz * 1.15, "z", 18);
    H.cyl("dark", 0, 1.75, -0.95 + hz * 0.58, hx * 0.94, 0.06, "z", 18);
    H.cyl("dark", 0, 1.75, -0.95 - hz * 0.58, hx * 0.94, 0.06, "z", 18);
    H.box("accent", 0, 1.75, -0.95, hx * 1.86, 0.25, 0.8);
    H.cyl("dark", 0, 2.7, -0.6, 0.25, 0.16, "y", 10);
  } else {
    H.box("paint", 0, 1.25, -0.95, hx * 2, 0.5, hz * 1.2);
    // canvas cover with hoops
    const cov = new THREE.CylinderGeometry(hx, hx, hz * 1.2, 14, 1, false, -Math.PI / 2, Math.PI);
    H.add("canvas", cov, 0, 1.5, -0.95, -Math.PI / 2, 0, 0, 1, 1, 0.95);
    H.box("canvas", 0, 1.48, -0.95, hx * 2, 0.04, hz * 1.2);
    for (let i = 0; i < 4; i++) H.box("dark", 0, 1.5 + hx * 0.98, -0.95 - hz * 0.55 + i * hz * 0.36, 0.2, 0.03, 0.04);
    H.box("accent", 0, 2.0, -0.95 - hz * 0.6 - 0.01, 0.6, 0.6, 0.01);
  }
  const wheels = [];
  for (const sx of [-1, 1]) for (const z of [hz - 1.0, -0.6, -1.9]) wheels.push({ x: sx * (hx - 0.15), y: 0.52, z, r: 0.52, w: 0.42, kind: "tyre", side: sx });
  return { kind: "truck", hull: H.build(), turret: null, gun: null, track: null, wheels, exhausts: [[hx - 0.2, 0.6, -hz]], lights: [[-(hx - 0.3), 1.05, hz + 0.1], [hx - 0.3, 1.05, hz + 0.1]] };
}

function buildDummy(L, S) {
  const { hx, hz, top } = L;
  const H = new Parts();
  H.box("paint", 0, 0.75, 0, hx * 2, 1.0, hz * 2);
  H.box("dark", 0, 0.2, 0, hx * 1.6, 0.4, hz * 1.8);
  H.box("paint", 0, top + 0.35, -0.3, 2.2, 0.7, 2.6);
  H.cyl("paint", 0, top + 0.35, 2.4, 0.1, 3.4, "z", 8);
  for (const sx of [-1, 1]) H.add("target", new THREE.PlaneGeometry(1.4, 1.4), sx * (hx + 0.01), 0.85, 0, 0, sx * Math.PI / 2, 0);
  H.add("target", new THREE.PlaneGeometry(1.3, 1.0), 0, 0.85, hz + 0.01, 0, 0, 0);
  H.add("target", new THREE.PlaneGeometry(1.3, 1.0), 0, 0.85, -hz - 0.01, 0, Math.PI, 0);
  return { kind: "dummy", hull: H.build(), turret: null, gun: null, track: null, wheels: [], exhausts: [], lights: [] };
}

/* ------------------------------------------------------------------ materials */
export function makeMaterials(tex) {
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const M = {
    dark: std({ color: 0x34373a, roughness: 0.62, metalness: 0.45, map: tex.metal }),
    metal: std({ color: 0x80858a, roughness: 0.38, metalness: 0.85, map: tex.metal }),
    rubber: std({ color: 0x1d1d1c, roughness: 0.95, metalness: 0 }),
    light: std({ color: 0xfff4d6, emissive: 0xfff0c8, emissiveIntensity: 1.6, roughness: 0.3 }),
    red: std({ color: 0xff3020, emissive: 0xff2010, emissiveIntensity: 1.2 }),
    glass: std({ color: 0x0b1418, roughness: 0.08, metalness: 0.9 }),
    sensor: std({ color: 0x40f0ff, emissive: 0x30e8ff, emissiveIntensity: 2.2 }),
    canvas: std({ color: 0x6b6a4a, roughness: 0.95, metalness: 0, map: tex.grime }),
    target: std({ map: tex.target, roughness: 0.9, side: THREE.DoubleSide }),
    accentDark: std({ color: 0x2f322f, roughness: 0.7, metalness: 0.3, map: tex.grime }),
    burnt: std({ color: 0x2b2622, roughness: 0.95, metalness: 0.15, map: tex.grime }),
    wheel: std({ color: 0x4a4d4f, roughness: 0.72, metalness: 0.35, map: tex.metal }),
  };
  return M;
}

/** Paint/accent materials are per instance (damage tint, burn). */
export function paintMaterial(tex, color, camo) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.74, metalness: 0.28, map: camo ? tex.camo : tex.grime });
}
