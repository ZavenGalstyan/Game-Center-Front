/**
 * Highway Racer — procedural vehicles (original, fictional designs).
 *
 * Each body is an extruded SIDE SILHOUETTE with real wheel-arch cut-outs,
 * bevelled edges and a tapered glasshouse (tumblehome), so a car reads as a
 * car from the chase camera — not a box. Player cars keep separate parts
 * (wheels spin and steer, body leans); traffic is merged by material into a
 * handful of meshes so a full road of cars stays cheap to draw.
 *
 * Orientation: front toward -Z, ground at y = 0, centred on x = 0, z = 0.
 */
import * as THREE from "three";
import { mergeGeometries as mergeRaw } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {
  accentMat, blobMat, chromeMat, glassMat, headMat, paintMat, playerTailMat, rimMat, tailMat, tireMat, trimMat,
} from "./materials.js";

/** merge parts of mixed origin (extrudes are non-indexed, primitives indexed):
 *  normalise to non-indexed position + normal first */
function mergeGeometries(list) {
  const flat = list.map((g) => {
    const n = g.index ? g.toNonIndexed() : g.clone();
    for (const k of Object.keys(n.attributes)) if (k !== "position" && k !== "normal") n.deleteAttribute(k);
    if (!n.attributes.normal) n.computeVertexNormals();
    return n;
  });
  const out = mergeRaw(flat, false);
  for (const g of flat) g.dispose();
  return out;
}

/* ------------------------------------------------------------------ styles
 * x runs rear (-L/2) → front (+L/2) in the 2D profile. `body` is the top
 * contour of the lower body from rear to front; `cabin` the glasshouse from
 * rear base over the roof to the windscreen base. */
const STYLES = {
  hatch: {
    L: 4.1, W: 1.84, r: 0.33, wb: 2.52, ground: 0.27, wheelInset: 0.13, taper: 0.2,
    body: [[-2.05, 0.4], [-2.07, 0.7], [-1.98, 0.9], [-1.4, 0.95], [1.05, 0.9], [1.7, 0.8], [2.03, 0.66], [2.05, 0.42]],
    cabin: [[-1.9, 0.92], [-1.78, 1.2], [-1.45, 1.36], [0.2, 1.38], [1.15, 0.92]],
    head: { y: 0.72, x: 0.62, w: 0.36, h: 0.12 }, tail: { y: 0.84, x: 0.56, w: 0.42, h: 0.12, bar: false },
  },
  gt: {
    L: 4.55, W: 1.94, r: 0.35, wb: 2.75, ground: 0.24, wheelInset: 0.14, taper: 0.24,
    body: [[-2.27, 0.38], [-2.3, 0.68], [-2.18, 0.84], [-1.5, 0.88], [-0.4, 0.88], [1.0, 0.86], [1.9, 0.72], [2.28, 0.58], [2.29, 0.38]],
    cabin: [[-1.65, 0.86], [-1.05, 1.18], [-0.55, 1.26], [0.3, 1.25], [1.15, 0.86]],
    head: { y: 0.64, x: 0.66, w: 0.42, h: 0.1 }, tail: { y: 0.76, x: 0.0, w: 1.7, h: 0.08, bar: true },
  },
  wedge: {
    L: 4.42, W: 1.98, r: 0.34, wb: 2.64, ground: 0.22, wheelInset: 0.12, taper: 0.28,
    body: [[-2.2, 0.36], [-2.22, 0.74], [-2.1, 0.86], [-1.2, 0.86], [0.2, 0.82], [1.3, 0.7], [2.0, 0.54], [2.22, 0.46], [2.22, 0.32]],
    cabin: [[-1.35, 0.84], [-0.8, 1.1], [-0.3, 1.14], [0.35, 1.12], [1.2, 0.8]],
    head: { y: 0.55, x: 0.7, w: 0.46, h: 0.07 }, tail: { y: 0.76, x: 0.0, w: 1.8, h: 0.07, bar: true },
  },
  coupe: {
    L: 4.5, W: 1.92, r: 0.35, wb: 2.7, ground: 0.24, wheelInset: 0.13, taper: 0.25,
    body: [[-2.25, 0.38], [-2.28, 0.72], [-2.15, 0.86], [-1.6, 0.86], [0.6, 0.84], [1.6, 0.74], [2.2, 0.58], [2.25, 0.38]],
    cabin: [[-2.0, 0.86], [-1.2, 1.08], [-0.45, 1.22], [0.25, 1.22], [1.1, 0.84]],
    head: { y: 0.64, x: 0.66, w: 0.44, h: 0.08 }, tail: { y: 0.8, x: 0.62, w: 0.38, h: 0.1, bar: false },
  },
  hyper: {
    L: 4.62, W: 2.02, r: 0.35, wb: 2.72, ground: 0.2, wheelInset: 0.1, taper: 0.32,
    body: [[-2.3, 0.34], [-2.32, 0.8], [-2.15, 0.88], [-1.1, 0.86], [-0.2, 0.8], [1.2, 0.66], [2.05, 0.5], [2.31, 0.42], [2.31, 0.3]],
    cabin: [[-1.25, 0.82], [-0.7, 1.04], [-0.2, 1.1], [0.35, 1.08], [1.15, 0.74]],
    head: { y: 0.5, x: 0.72, w: 0.42, h: 0.06 }, tail: { y: 0.8, x: 0.0, w: 1.86, h: 0.06, bar: true },
  },
  /* traffic */
  sedan: {
    L: 4.4, W: 1.82, r: 0.33, wb: 2.68, ground: 0.27, wheelInset: 0.13, taper: 0.16,
    body: [[-2.18, 0.42], [-2.2, 0.76], [-2.1, 0.98], [-1.25, 1.0], [0.95, 0.96], [1.8, 0.86], [2.18, 0.72], [2.2, 0.42]],
    cabin: [[-1.45, 0.98], [-1.0, 1.36], [-0.6, 1.44], [0.45, 1.44], [1.05, 0.96]],
    head: { y: 0.8, x: 0.6, w: 0.36, h: 0.13 }, tail: { y: 0.9, x: 0.58, w: 0.36, h: 0.14, bar: false },
  },
  compact: {
    L: 3.8, W: 1.76, r: 0.31, wb: 2.4, ground: 0.27, wheelInset: 0.12, taper: 0.14,
    body: [[-1.9, 0.42], [-1.92, 0.8], [-1.85, 0.98], [0.8, 0.94], [1.5, 0.84], [1.88, 0.7], [1.9, 0.42]],
    cabin: [[-1.82, 0.96], [-1.74, 1.4], [-1.4, 1.5], [0.2, 1.5], [0.95, 0.94]],
    head: { y: 0.76, x: 0.58, w: 0.32, h: 0.13 }, tail: { y: 0.98, x: 0.62, w: 0.22, h: 0.26, bar: false },
  },
  suv: {
    L: 4.7, W: 1.96, r: 0.4, wb: 2.85, ground: 0.4, wheelInset: 0.12, taper: 0.12,
    body: [[-2.33, 0.55], [-2.35, 0.95], [-2.3, 1.16], [1.0, 1.14], [1.9, 1.06], [2.32, 0.92], [2.35, 0.55]],
    cabin: [[-2.25, 1.14], [-2.18, 1.72], [-1.9, 1.8], [0.4, 1.8], [1.15, 1.14]],
    head: { y: 0.98, x: 0.64, w: 0.38, h: 0.14 }, tail: { y: 1.14, x: 0.7, w: 0.2, h: 0.32, bar: false },
  },
  van: {
    L: 5.1, W: 2.0, r: 0.38, wb: 3.2, ground: 0.36, wheelInset: 0.12, taper: 0.06,
    body: [[-2.53, 0.5], [-2.55, 1.2], [-2.5, 1.3], [1.5, 1.28], [2.3, 1.08], [2.55, 0.92], [2.55, 0.5]],
    cabin: [[-2.5, 1.28], [-2.48, 2.12], [-2.3, 2.16], [1.1, 2.16], [1.72, 1.28]],
    head: { y: 0.98, x: 0.68, w: 0.36, h: 0.16 }, tail: { y: 1.1, x: 0.82, w: 0.16, h: 0.42, bar: false },
    solidCabin: true,
  },
};

function profileShape(st, contour, withArches) {
  const half = st.L / 2;
  const s = new THREE.Shape();
  const ar = st.r + 0.07;
  const yc = st.r;
  const xf = st.wb / 2;
  const xr = -st.wb / 2;
  const yb = st.ground;
  const first = contour[contour.length - 1];
  if (withArches) {
    s.moveTo(first[0] - 0.04, yb);
    s.lineTo(xf + ar, yb);
    s.lineTo(xf + ar, yc);
    s.absarc(xf, yc, ar, 0, Math.PI, false);
    s.lineTo(xf - ar, yb);
    s.lineTo(xr + ar, yb);
    s.lineTo(xr + ar, yc);
    s.absarc(xr, yc, ar, 0, Math.PI, false);
    s.lineTo(xr - ar, yb);
    s.lineTo(-half + 0.04, yb);
  } else {
    s.moveTo(contour[contour.length - 1][0], contour[contour.length - 1][1]);
    s.lineTo(contour[0][0], contour[0][1]);
  }
  for (const [x, y] of contour) s.lineTo(x, y);
  s.closePath();
  return s;
}

/** extrude a side profile across the width, centre it, orient it front → -Z */
function extrude(shape, width, bevel, curveSegments = 10) {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.05, width - bevel * 2),
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel * 0.8,
    bevelSegments: 2,
    curveSegments,
  });
  g.translate(0, 0, -(width - bevel * 2) / 2);
  g.rotateY(Math.PI / 2);
  return g;
}

/** narrow the glasshouse toward the roof (tumblehome) */
function taper(g, fromY, toY, amount) {
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    if (y <= fromY) continue;
    const k = Math.min(1, (y - fromY) / Math.max(0.01, toY - fromY));
    p.setX(i, p.getX(i) * (1 - amount * k));
  }
  p.needsUpdate = true;
  g.computeVertexNormals();
  return g;
}

const box = (w, h, d, x, y, z) => {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return g;
};

function wheelGeoms(r, width) {
  const tire = new THREE.CylinderGeometry(r, r, width, 22, 1);
  tire.rotateZ(Math.PI / 2);
  const rim = new THREE.CylinderGeometry(r * 0.64, r * 0.6, width + 0.02, 18, 1);
  rim.rotateZ(Math.PI / 2);
  const spokes = [];
  for (let i = 0; i < 5; i++) {
    const b = new THREE.BoxGeometry(width + 0.03, r * 1.1, r * 0.16);
    b.rotateX((i / 5) * Math.PI);
    spokes.push(b);
  }
  const hub = new THREE.CylinderGeometry(r * 0.16, r * 0.16, width + 0.05, 10);
  hub.rotateZ(Math.PI / 2);
  return { tire, rim: mergeGeometries([rim, ...spokes, hub]) };
}

/** Geometry parts of one vehicle, grouped by material key. */
function buildParts(styleKey, look = {}) {
  const st = STYLES[styleKey];
  const parts = { paint: [], glass: [], trim: [], head: [], tail: [], chrome: [], accent: [] };
  const belt = Math.min(...st.cabin.map((p) => p[1]));
  const roof = Math.max(...st.cabin.map((p) => p[1]));
  const half = st.L / 2;
  const W = st.W;

  // lower body with wheel arches
  parts.paint.push(taper(extrude(profileShape(st, st.body, true), W, 0.07), belt + 0.02, belt + 0.3, 0.02));
  // dark under-tray between the arches so you never see through the car
  parts.trim.push(box(W - 0.46, 0.34, st.L - 0.5, 0, st.ground + 0.14, 0));
  // glasshouse + painted roof skin
  const cabin = extrude(profileShape(st, st.cabin, false), W - 0.16, 0.05, 6);
  taper(cabin, belt, roof, st.taper);
  (st.solidCabin ? parts.paint : parts.glass).push(cabin);
  if (st.solidCabin) {
    // van: windscreen + side windows as glass panels on a painted box
    const front = st.cabin[st.cabin.length - 1][0];
    parts.glass.push(box(W - 0.3, 0.62, 0.05, 0, belt + 0.42, -(front - 0.25)));
    parts.glass.push(box(W - 0.12, 0.5, 1.2, 0, belt + 0.45, -(front - 0.95)));
  } else {
    // roof panel: the top two points of the cabin contour, slightly proud
    const rp = st.cabin.filter((p) => p[1] >= roof - 0.1);
    const x0 = Math.min(...rp.map((p) => p[0])) + 0.05;
    const x1 = Math.max(...rp.map((p) => p[0])) - 0.05;
    const rw = (W - 0.16) * (1 - st.taper) - 0.04;
    parts.paint.push(box(rw, 0.05, x1 - x0, 0, roof + 0.02, -(x0 + x1) / 2));
  }

  // lights
  const frontZ = -half - 0.07; // bevel pushes the skin ~6 cm past the profile
  const rearZ = half + 0.07;
  const hd = st.head;
  for (const sx of [-1, 1]) parts.head.push(box(hd.w, hd.h, 0.08, sx * hd.x, hd.y, frontZ + 0.03));
  const tl = st.tail;
  if (tl.bar) parts.tail.push(box(tl.w, tl.h, 0.06, 0, tl.y, rearZ - 0.02));
  else for (const sx of [-1, 1]) parts.tail.push(box(tl.w, tl.h, 0.06, sx * tl.x, tl.y, rearZ - 0.02));
  // grille / bumpers / diffuser
  parts.trim.push(box(W * 0.46, 0.14, 0.06, 0, hd.y - 0.2, frontZ + 0.02));
  parts.trim.push(box(W - 0.2, 0.16, 0.08, 0, st.ground + 0.14, rearZ - 0.03));
  // mirrors
  const mirrorZ = -(st.cabin[st.cabin.length - 1][0] - 0.15);
  for (const sx of [-1, 1]) parts.paint.push(box(0.14, 0.08, 0.12, sx * (W / 2 - 0.02), belt + 0.1, mirrorZ));
  // exhaust
  if (look.sporty) {
    for (const sx of [-1, 1]) {
      const e = new THREE.CylinderGeometry(0.055, 0.06, 0.18, 10);
      e.rotateX(Math.PI / 2);
      e.translate(sx * 0.42, st.ground + 0.1, rearZ + 0.02);
      parts.chrome.push(e);
    }
  }
  // spoilers
  const deckY = st.body[3] ? Math.max(st.body[2][1], st.body[3][1]) : 0.9;
  if (look.spoiler === "wing") {
    parts.trim.push(box(W - 0.2, 0.04, 0.32, 0, deckY + 0.26, half - 0.28));
    for (const sx of [-1, 1]) parts.trim.push(box(0.05, 0.26, 0.12, sx * 0.55, deckY + 0.12, half - 0.3));
    for (const sx of [-1, 1]) parts.trim.push(box(0.03, 0.14, 0.36, sx * (W / 2 - 0.1), deckY + 0.24, half - 0.28));
  } else if (look.spoiler === "duck") {
    const g = box(W - 0.3, 0.07, 0.24, 0, deckY + 0.03, half - 0.2);
    g.rotateX(0);
    parts.paint.push(g);
  } else if (look.spoiler === "lip") {
    parts.trim.push(box(W - 0.4, 0.04, 0.12, 0, deckY + 0.02, half - 0.08));
  }
  // side stripe
  if (look.stripe) {
    for (const sx of [-1, 1]) parts.accent.push(box(0.02, 0.05, st.L * 0.62, sx * (W / 2 + 0.005), belt - 0.16, -0.1));
  }
  return { st, parts, belt, roof };
}

function wheelPositions(st) {
  const xs = st.W / 2 - st.wheelInset;
  return [
    { x: -xs, z: -st.wb / 2, front: true },
    { x: xs, z: -st.wb / 2, front: true },
    { x: -xs, z: st.wb / 2, front: false },
    { x: xs, z: st.wb / 2, front: false },
  ];
}

function blob(L, W) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(W * 1.35, L * 1.12), blobMat());
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.02;
  m.renderOrder = 1;
  return m;
}

/* ================================================================== player */
/**
 * Player car: { group, body, wheels[{pivot, spin}], tailMat, flames[], dims }.
 * `body` takes lean / pitch / bounce; wheels spin around X, fronts steer.
 */
export function buildPlayerCar(car, quality = "medium") {
  const look = { ...car.look, sporty: true };
  const { st, parts } = buildParts(look.style, look);
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);
  const add = (list, material) => {
    if (!list.length) return;
    const m = new THREE.Mesh(mergeGeometries(list), material);
    m.castShadow = true;
    body.add(m);
    return m;
  };
  add(parts.paint, paintMat(look.paint, quality));
  add(parts.glass, glassMat());
  add(parts.trim, trimMat());
  add(parts.chrome, chromeMat());
  add(parts.accent, accentMat(look.stripe || look.accent));
  add(parts.head, headMat());
  const tail = playerTailMat();
  add(parts.tail, tail);

  const { tire, rim } = wheelGeoms(st.r, 0.28);
  const wheels = [];
  for (const wp of wheelPositions(st)) {
    const pivot = new THREE.Group();
    pivot.position.set(wp.x, st.r, wp.z);
    const spin = new THREE.Group();
    const t = new THREE.Mesh(tire, tireMat());
    t.castShadow = true;
    const r = new THREE.Mesh(rim, rimMat(look.rim));
    r.position.x = wp.x < 0 ? -0.006 : 0.006;
    spin.add(t, r);
    pivot.add(spin);
    group.add(pivot);
    wheels.push({ pivot, spin, front: wp.front });
  }

  // boost flames at the exhaust tips
  const flames = [];
  for (const sx of [-1, 1]) {
    const g = new THREE.ConeGeometry(0.09, 0.7, 10, 1, true);
    g.rotateX(-Math.PI / 2);
    g.translate(0, 0, 0.35);
    const m = new THREE.Mesh(
      g,
      new THREE.MeshBasicMaterial({ color: "#7fd8ff", transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    );
    m.position.set(sx * 0.42, st.ground + 0.1, st.L / 2 + 0.05);
    m.visible = false;
    body.add(m);
    flames.push(m);
  }

  group.add(blob(st.L, st.W));
  return {
    group,
    body,
    wheels,
    tailMat: tail,
    flames,
    dims: { L: st.L, W: st.W, r: st.r, rearZ: st.L / 2 },
    dispose() {
      group.traverse((o) => {
        if (o.isMesh) {
          o.geometry.dispose();
          if (o.material && o.material.blending === THREE.AdditiveBlending) o.material.dispose();
        }
      });
    },
  };
}

/* ================================================================== traffic */
const TRAFFIC_STYLE = { sedan: "sedan", hatch: "compact", suv: "suv", van: "van" };
export const TRAFFIC_PAINTS = ["#d7dbe2", "#2b2f38", "#b8222a", "#2a5aa8", "#e3e5e8", "#5e6b74", "#2f7a55", "#c98a2a"];

const trafficCache = new Map();

/** merged geometry set for one traffic type (shared by every car of that type) */
function trafficGeometry(type) {
  let g = trafficCache.get(type);
  if (g) return g;
  if (type === "truck") g = truckGeometry();
  else {
    const { st, parts } = buildParts(TRAFFIC_STYLE[type], {});
    const { tire, rim } = wheelGeoms(st.r, 0.26);
    for (const wp of wheelPositions(st)) {
      parts.trim.push(tire.clone().translate(wp.x, st.r, wp.z));
      parts.chrome.push(rim.clone().translate(wp.x + (wp.x < 0 ? -0.006 : 0.006), st.r, wp.z));
    }
    tire.dispose();
    rim.dispose();
    g = { L: st.L, W: st.W };
    for (const k of Object.keys(parts)) g[k] = parts[k].length ? mergeGeometries(parts[k]) : null;
    for (const list of Object.values(parts)) for (const x of list) x.dispose();
  }
  trafficCache.set(type, g);
  return g;
}

function truckGeometry() {
  // box truck: cab + cargo box, 9.2 m long
  const parts = { paint: [], glass: [], trim: [], head: [], tail: [], chrome: [], cargo: [] };
  const W = 2.36;
  const L = 9.2;
  const half = L / 2;
  const cabL = 2.2;
  const cabFront = -half;
  // cab
  parts.paint.push(box(W - 0.06, 1.5, cabL, 0, 1.45, cabFront + cabL / 2));
  parts.paint.push(box(W - 0.2, 0.9, cabL - 0.3, 0, 2.6, cabFront + cabL / 2 + 0.1));
  parts.glass.push(box(W - 0.3, 0.7, 0.05, 0, 2.55, cabFront - 0.02 + 0.18));
  for (const sx of [-1, 1]) parts.glass.push(box(0.04, 0.6, 1.0, sx * (W / 2 - 0.1), 2.55, cabFront + 0.8));
  parts.trim.push(box(W * 0.6, 0.5, 0.06, 0, 1.1, cabFront - 0.02));
  for (const sx of [-1, 1]) parts.head.push(box(0.34, 0.16, 0.06, sx * 0.82, 0.92, cabFront - 0.03));
  // cargo box
  parts.cargo.push(box(W, 2.75, L - cabL - 0.25, 0, 1.0 + 2.75 / 2, cabFront + cabL + 0.25 + (L - cabL - 0.25) / 2));
  parts.trim.push(box(W - 0.1, 0.12, L - 0.4, 0, 0.62, 0.1));
  parts.trim.push(box(W, 0.18, 0.12, 0, 0.7, half - 0.05));
  for (const sx of [-1, 1]) parts.tail.push(box(0.22, 0.3, 0.06, sx * 0.95, 1.05, half + 0.02));
  // wheels: front axle + tandem rear
  const tire = new THREE.CylinderGeometry(0.5, 0.5, 0.36, 20);
  tire.rotateZ(Math.PI / 2);
  const rim = new THREE.CylinderGeometry(0.3, 0.3, 0.38, 14);
  rim.rotateZ(Math.PI / 2);
  for (const z of [cabFront + 1.3, half - 2.4, half - 1.3]) {
    for (const sx of [-1, 1]) {
      parts.trim.push(tire.clone().translate(sx * (W / 2 - 0.2), 0.5, z));
      parts.chrome.push(rim.clone().translate(sx * (W / 2 - 0.19), 0.5, z));
    }
  }
  tire.dispose();
  rim.dispose();
  const g = { L, W };
  for (const k of Object.keys(parts)) g[k] = parts[k].length ? mergeGeometries(parts[k]) : null;
  for (const list of Object.values(parts)) for (const x of list) x.dispose();
  return g;
}

/** A traffic vehicle view: a group of ≤ 7 merged meshes. Paint is swappable. */
export function buildTraffic(type) {
  const g = trafficGeometry(type);
  const group = new THREE.Group();
  const meshes = {};
  const MATS = {
    paint: paintMat(TRAFFIC_PAINTS[0]),
    glass: glassMat(),
    trim: trimMat(),
    head: headMat(),
    tail: tailMat(),
    chrome: chromeMat(),
    cargo: paintMat("#e9ebee"),
  };
  for (const k of Object.keys(MATS)) {
    if (!g[k]) continue;
    const m = new THREE.Mesh(g[k], MATS[k]);
    m.castShadow = k === "paint" || k === "cargo";
    group.add(m);
    meshes[k] = m;
  }
  group.add(blob(g.L, g.W));
  return {
    group,
    type,
    setPaint(i) {
      if (meshes.paint) meshes.paint.material = paintMat(TRAFFIC_PAINTS[i % TRAFFIC_PAINTS.length]);
    },
  };
}
export function disposeVehicleGeometry() {
  for (const g of trafficCache.values()) for (const v of Object.values(g)) if (v && v.dispose) v.dispose();
  trafficCache.clear();
}
