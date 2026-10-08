/**
 * Stunt Racer 3D — procedural stunt cars (original designs, no assets).
 *
 * Each body is an extruded SIDE SILHOUETTE with wheel-arch cut-outs,
 * bevelled edges and a tapered glasshouse, so a car reads as a sports car
 * from the chase camera. Parts are merged by material (a handful of draw
 * calls per car); wheels stay separate so they spin and steer, the body
 * group takes suspension squat, lean and landing compression.
 *
 * Orientation: front toward +Z, left = +X, ground at y = 0.
 *
 *   update(st, dt)  st = { speed, steer, wheelSpin, compress, lean, pitchA,
 *                          braking, nitro, boost, air, headlights }
 */
import * as THREE from "three";
import { mergeGeometries as mergeRaw } from "three/examples/jsm/utils/BufferGeometryUtils.js";

function mergeGeometries(list) {
  const flat = list.map((g) => {
    const n = g.index ? g.toNonIndexed() : g.clone();
    for (const k of Object.keys(n.attributes)) if (k !== "position" && k !== "normal") n.deleteAttribute(k);
    if (!n.attributes.normal) n.computeVertexNormals();
    return n;
  });
  const out = mergeRaw(flat, false);
  for (const g of flat) g.dispose();
  for (const g of list) g.dispose();
  return out;
}

/* x runs rear (−L/2) → front (+L/2) in each 2D profile. `body` = top contour
 * of the lower body from rear to front; `cabin` = glasshouse from rear base
 * over the roof to the windscreen base. */
const STYLES = {
  coupe: {
    L: 4.4, W: 2.0, r: 0.38, tw: 0.36, wb: 2.66, ground: 0.26, inset: 0.1, taper: 0.26,
    body: [[-2.2, 0.4], [-2.23, 0.76], [-2.1, 0.9], [-1.55, 0.92], [0.55, 0.86], [1.55, 0.76], [2.12, 0.6], [2.2, 0.4]],
    cabin: [[-1.85, 0.9], [-1.15, 1.16], [-0.5, 1.28], [0.15, 1.27], [0.95, 0.86]],
    head: { y: 0.64, x: 0.68, w: 0.46, h: 0.1 }, tail: { y: 0.8, x: 0.62, w: 0.46, h: 0.11, bar: false },
    wing: { y: 0.36, z: -1.92, w: 1.86 }, hoodStripes: true,
  },
  hatch: {
    L: 4.05, W: 1.96, r: 0.37, tw: 0.36, wb: 2.5, ground: 0.27, inset: 0.1, taper: 0.22,
    body: [[-2.02, 0.4], [-2.05, 0.8], [-1.96, 0.96], [-1.45, 0.98], [0.9, 0.92], [1.6, 0.8], [2.0, 0.64], [2.03, 0.4]],
    cabin: [[-1.9, 0.96], [-1.8, 1.26], [-1.45, 1.38], [0.15, 1.38], [1.0, 0.92]],
    head: { y: 0.7, x: 0.62, w: 0.4, h: 0.12 }, tail: { y: 0.92, x: 0.6, w: 0.3, h: 0.2, bar: false },
    wing: { y: 0.46, z: -1.7, w: 1.6, roof: true }, hoodStripes: false,
  },
  wedge: {
    L: 4.45, W: 2.02, r: 0.37, tw: 0.38, wb: 2.68, ground: 0.22, inset: 0.1, taper: 0.3,
    body: [[-2.22, 0.36], [-2.24, 0.78], [-2.12, 0.88], [-1.2, 0.88], [0.2, 0.82], [1.3, 0.68], [2.02, 0.5], [2.24, 0.42], [2.24, 0.3]],
    cabin: [[-1.35, 0.86], [-0.8, 1.12], [-0.3, 1.16], [0.35, 1.13], [1.2, 0.78]],
    head: { y: 0.52, x: 0.72, w: 0.5, h: 0.07 }, tail: { y: 0.78, x: 0, w: 1.86, h: 0.07, bar: true },
    wing: { y: 0.42, z: -1.95, w: 1.9 }, hoodStripes: false,
  },
  muscle: {
    L: 4.65, W: 2.1, r: 0.42, tw: 0.42, wb: 2.84, ground: 0.3, inset: 0.08, taper: 0.18,
    body: [[-2.32, 0.46], [-2.35, 0.86], [-2.25, 1.0], [-1.6, 1.02], [0.6, 1.0], [1.7, 0.96], [2.3, 0.84], [2.35, 0.46]],
    cabin: [[-1.7, 1.0], [-1.1, 1.36], [-0.55, 1.42], [0.2, 1.42], [0.85, 1.0]],
    head: { y: 0.78, x: 0.7, w: 0.42, h: 0.14 }, tail: { y: 0.88, x: 0, w: 1.9, h: 0.1, bar: true },
    wing: { y: 0.3, z: -2.0, w: 1.9 }, hoodStripes: true, scoop: true,
  },
  hyper: {
    L: 4.7, W: 2.06, r: 0.37, tw: 0.4, wb: 2.78, ground: 0.2, inset: 0.08, taper: 0.34,
    body: [[-2.33, 0.34], [-2.35, 0.82], [-2.18, 0.9], [-1.1, 0.88], [-0.2, 0.8], [1.2, 0.64], [2.08, 0.48], [2.35, 0.4], [2.35, 0.28]],
    cabin: [[-1.25, 0.82], [-0.7, 1.05], [-0.2, 1.11], [0.35, 1.08], [1.18, 0.72]],
    head: { y: 0.48, x: 0.74, w: 0.44, h: 0.06 }, tail: { y: 0.8, x: 0, w: 1.9, h: 0.06, bar: true },
    wing: { y: 0.5, z: -2.05, w: 1.96 }, hoodStripes: false, fin: true,
  },
};

function profileShape(st, contour, withArches) {
  const half = st.L / 2;
  const s = new THREE.Shape();
  const ar = st.r + 0.08;
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

/** Extrude a side profile across the width, centre it, front → +Z. */
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
  g.rotateY(-Math.PI / 2);
  return g;
}

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

/** Body height of the lower-body contour at a given length position. */
function bodyTopAt(st, x) {
  const c = st.body;
  for (let i = 0; i < c.length - 1; i++) {
    const [x0, y0] = c[i];
    const [x1, y1] = c[i + 1];
    if (x >= Math.min(x0, x1) && x <= Math.max(x0, x1) && x1 !== x0) return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
  }
  return c[c.length - 1][1];
}

function wheelGeoms(r, width) {
  const tire = new THREE.CylinderGeometry(r, r, width, 24, 1);
  tire.rotateZ(Math.PI / 2);
  // tyre sidewall lettering ring
  const wall = new THREE.TorusGeometry(r * 0.8, 0.012, 4, 28);
  wall.rotateY(Math.PI / 2);
  const rim = new THREE.CylinderGeometry(r * 0.66, r * 0.62, width + 0.02, 20, 1);
  rim.rotateZ(Math.PI / 2);
  const spokes = [];
  for (let i = 0; i < 5; i++) {
    const b = new THREE.BoxGeometry(width + 0.04, r * 1.18, r * 0.15);
    b.rotateX((i / 5) * Math.PI);
    spokes.push(b);
  }
  const hub = new THREE.CylinderGeometry(r * 0.17, r * 0.17, width + 0.06, 10);
  hub.rotateZ(Math.PI / 2);
  const disc = new THREE.CylinderGeometry(r * 0.5, r * 0.5, width * 0.5, 16);
  disc.rotateZ(Math.PI / 2);
  return { tire: mergeGeometries([tire]), rim: mergeGeometries([rim, ...spokes, hub]), disc: mergeGeometries([disc]), wall };
}

const matCache = new Map();
function mat(key, make) {
  if (!matCache.has(key)) matCache.set(key, make());
  return matCache.get(key);
}
export function disposeCarMaterials() {
  for (const m of matCache.values()) m.dispose();
  matCache.clear();
}

const paintMat = (color, quality) =>
  mat(`paint:${color}:${quality}`, () =>
    quality === "low"
      ? new THREE.MeshStandardMaterial({ color, metalness: 0.35, roughness: 0.35, envMapIntensity: 1 })
      : new THREE.MeshPhysicalMaterial({ color, metalness: 0.45, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 1.15 }),
  );
const accentPaint = (color, quality) =>
  mat(`accent:${color}:${quality}`, () => new THREE.MeshStandardMaterial({ color, metalness: 0.4, roughness: 0.4, envMapIntensity: 1 }));
const glassMat = (tint) => mat(`glass:${tint}`, () => new THREE.MeshStandardMaterial({ color: tint, metalness: 0.8, roughness: 0.05, envMapIntensity: 1.6 }));
const trimMat = (color) => mat(`trim:${color}`, () => new THREE.MeshStandardMaterial({ color, metalness: 0.25, roughness: 0.6 }));
const tireMat = () => mat("tire", () => new THREE.MeshStandardMaterial({ color: "#161618", metalness: 0, roughness: 0.92 }));
const rimMat = (color) => mat(`rim:${color}`, () => new THREE.MeshStandardMaterial({ color, metalness: 0.9, roughness: 0.25, envMapIntensity: 1.3 }));
const discMat = () => mat("disc", () => new THREE.MeshStandardMaterial({ color: "#8a8d93", metalness: 0.8, roughness: 0.45 }));
const chromeMat = () => mat("chrome", () => new THREE.MeshStandardMaterial({ color: "#d7dae0", metalness: 1, roughness: 0.18 }));

/**
 * Builds one car. carDef from data/cars.js. Returns { group, body, update,
 * dispose, dims }. The group's origin is the centre of the footprint on the
 * road; the caller orients and positions it.
 */
export function buildCar(carDef, quality = "medium") {
  const st = STYLES[carDef.body] || STYLES.coupe;
  const C = carDef.colors;
  const parts = { paint: [], accent: [], glass: [], trim: [], chrome: [], head: [], tail: [] };
  const belt = Math.min(...st.cabin.map((p) => p[1]));
  const roof = Math.max(...st.cabin.map((p) => p[1]));
  const half = st.L / 2;
  const W = st.W;

  // lower body with wheel arches
  parts.paint.push(taper(extrude(profileShape(st, st.body, true), W, 0.08), belt + 0.02, belt + 0.3, 0.02));
  parts.trim.push(box(W - 0.5, 0.32, st.L - 0.55, 0, st.ground + 0.14, 0)); // under-tray
  // glasshouse + roof skin in the accent colour (black roof on BLAZE)
  const cabin = extrude(profileShape(st, st.cabin, false), W - 0.18, 0.05, 6);
  taper(cabin, belt, roof, st.taper);
  parts.glass.push(cabin);
  const rp = st.cabin.filter((p) => p[1] >= roof - 0.1);
  const x0 = Math.min(...rp.map((p) => p[0])) + 0.05;
  const x1 = Math.max(...rp.map((p) => p[0])) - 0.05;
  const rw = (W - 0.18) * (1 - st.taper) - 0.04;
  parts.accent.push(box(rw, 0.05, x1 - x0, 0, roof + 0.02, (x0 + x1) / 2));

  // racing stripes over hood and tail
  if (st.hoodStripes) {
    const hoodFrom = st.cabin[st.cabin.length - 1][0] + 0.05;
    const hoodTo = half - 0.2;
    const n = 6;
    for (let i = 0; i < n; i++) {
      const a = hoodFrom + ((hoodTo - hoodFrom) * i) / n;
      const b = hoodFrom + ((hoodTo - hoodFrom) * (i + 1)) / n;
      const ya = bodyTopAt(st, a);
      const yb = bodyTopAt(st, b);
      const len = Math.hypot(b - a, yb - ya);
      for (const sx of [-1, 1]) {
        const g = new THREE.BoxGeometry(0.24, 0.02, len + 0.02);
        g.rotateX(-Math.atan2(yb - ya, b - a));
        g.translate(sx * 0.22, (ya + yb) / 2 + 0.085, (a + b) / 2);
        parts.accent.push(g);
      }
    }
  }
  if (st.scoop) parts.accent.push(box(0.6, 0.12, 0.7, 0, bodyTopAt(st, 1.0) + 0.1, 1.0));
  // side skirts + stripe
  for (const sx of [-1, 1]) {
    parts.accent.push(box(0.04, 0.12, st.wb - 0.9, sx * (W / 2 + 0.01), st.ground + 0.1, 0));
    parts.accent.push(box(0.02, 0.06, st.L * 0.55, sx * (W / 2 + 0.012), belt - 0.18, 0.1));
  }

  // lights
  const frontZ = half + 0.07;
  const rearZ = -half - 0.07;
  const hd = st.head;
  for (const sx of [-1, 1]) parts.head.push(box(hd.w, hd.h, 0.08, sx * hd.x, hd.y, frontZ - 0.03));
  const tl = st.tail;
  if (tl.bar) parts.tail.push(box(tl.w, tl.h, 0.06, 0, tl.y, rearZ + 0.02));
  else for (const sx of [-1, 1]) parts.tail.push(box(tl.w, tl.h, 0.06, sx * tl.x, tl.y, rearZ + 0.02));
  // front splitter / grille / diffuser
  parts.trim.push(box(W * 0.5, 0.14, 0.06, 0, hd.y - 0.2, frontZ - 0.02));
  parts.accent.push(box(W - 0.1, 0.05, 0.3, 0, st.ground + 0.04, half - 0.05));
  parts.trim.push(box(W - 0.24, 0.18, 0.1, 0, st.ground + 0.14, rearZ + 0.03));
  for (let i = -2; i <= 2; i++) parts.trim.push(box(0.03, 0.16, 0.3, i * 0.28, st.ground + 0.12, rearZ + 0.18));
  // mirrors
  const mirrorZ = st.cabin[st.cabin.length - 1][0] - 0.15;
  for (const sx of [-1, 1]) parts.accent.push(box(0.16, 0.09, 0.14, sx * (W / 2 + 0.02), belt + 0.1, mirrorZ));
  // exhaust: twin pipes
  const exhaust = [];
  for (const sx of [-1, 1]) {
    const e = new THREE.CylinderGeometry(0.075, 0.08, 0.24, 12, 1, true);
    e.rotateX(Math.PI / 2);
    e.translate(sx * 0.42, st.ground + 0.13, rearZ + 0.02);
    parts.chrome.push(e);
    exhaust.push({ x: sx * 0.42, y: st.ground + 0.13, z: rearZ - 0.08 });
  }
  // rear wing
  const deckY = Math.max(st.body[2][1], st.body[3][1]);
  const wg = st.wing;
  const wingY = (wg.roof ? roof : deckY) + wg.y;
  const wingG = box(wg.w, 0.05, 0.42, 0, wingY, wg.z);
  wingG.rotateX(0);
  parts.accent.push(wingG);
  for (const sx of [-1, 1]) {
    parts.accent.push(box(0.04, 0.22, 0.48, sx * (wg.w / 2 - 0.01), wingY + 0.06, wg.z));
    parts.trim.push(box(0.06, wingY - (wg.roof ? roof : deckY), 0.14, sx * 0.55, (wingY + (wg.roof ? roof : deckY)) / 2, wg.z + 0.04));
  }
  if (st.fin) parts.accent.push(box(0.04, 0.22, 1.0, 0, roof - 0.02, -1.2));

  // --- meshes -------------------------------------------------------------------
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);
  const add = (list, material, shadow = true) => {
    if (!list.length) return null;
    const m = new THREE.Mesh(mergeGeometries(list), material);
    m.castShadow = shadow;
    body.add(m);
    return m;
  };
  add(parts.paint, paintMat(C.body, quality));
  add(parts.accent, accentPaint(C.accent, quality));
  add(parts.glass, glassMat(C.glass), false);
  add(parts.trim, trimMat(C.trim));
  add(parts.chrome, chromeMat(), false);
  const headMat = new THREE.MeshStandardMaterial({ color: C.light, emissive: C.light, emissiveIntensity: 1.6, roughness: 0.2 });
  const tailMat = new THREE.MeshStandardMaterial({ color: "#5a0a0e", emissive: "#ff2030", emissiveIntensity: 1.0, roughness: 0.3 });
  add(parts.head, headMat, false);
  add(parts.tail, tailMat, false);

  // wheels: pivot (steer) → spin
  const wg2 = wheelGeoms(st.r, st.tw);
  const wheels = [];
  const xs = W / 2 - st.inset;
  for (const [sx, front] of [
    [1, true],
    [-1, true],
    [1, false],
    [-1, false],
  ]) {
    const pivot = new THREE.Group();
    pivot.position.set(sx * xs, st.r, (front ? 1 : -1) * (st.wb / 2));
    const spin = new THREE.Group();
    const t = new THREE.Mesh(wg2.tire, tireMat());
    t.castShadow = true;
    const r = new THREE.Mesh(wg2.rim, rimMat(C.rim));
    r.position.x = sx * 0.012;
    const d = new THREE.Mesh(wg2.disc, discMat());
    spin.add(t, r, d);
    pivot.add(spin);
    group.add(pivot);
    wheels.push({ pivot, spin, front, baseY: st.r });
  }

  // nitro flames (additive cones) + exhaust glow
  const flameMat = new THREE.MeshBasicMaterial({ color: C.glow, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const coreMat = new THREE.MeshBasicMaterial({ color: "#e8f6ff", transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  const flames = [];
  for (const e of exhaust) {
    const g1 = new THREE.ConeGeometry(0.14, 1.2, 12, 1, true);
    g1.rotateX(-Math.PI / 2);
    g1.translate(0, 0, -0.6);
    const g2 = new THREE.ConeGeometry(0.07, 0.6, 10, 1, true);
    g2.rotateX(-Math.PI / 2);
    g2.translate(0, 0, -0.3);
    const outer = new THREE.Mesh(g1, flameMat);
    const core = new THREE.Mesh(g2, coreMat);
    const fg = new THREE.Group();
    fg.position.set(e.x, e.y, e.z);
    fg.add(outer, core);
    fg.visible = false;
    body.add(fg);
    flames.push(fg);
  }

  const S = { flick: 0, lean: 0, pitch: 0, bounce: 0 };
  function update(s, dt) {
    // wheels
    for (const w of wheels) {
      w.spin.rotation.x = s.wheelSpin;
      if (w.front) w.pivot.rotation.y = s.steer * 0.42;
      w.pivot.position.y = w.baseY + (s.air ? -0.06 : 0);
    }
    // body: squat on compression, lean into turns, pitch on throttle / brake
    S.lean += ((s.lean || 0) - S.lean) * Math.min(1, dt * 6);
    S.pitch += ((s.pitchA || 0) - S.pitch) * Math.min(1, dt * 5);
    body.position.y = -s.compress * 0.35 + (s.air ? 0.04 : 0);
    body.rotation.z = -S.lean * 0.05;
    body.rotation.x = S.pitch * 0.025;
    // lights
    tailMat.emissiveIntensity = s.braking ? 3.2 : 1.0;
    headMat.emissiveIntensity = s.headlights ? 3 : 1.6;
    // flames
    S.flick += dt * 40;
    const on = s.nitro ? 1 : s.boost ? 0.55 : 0;
    for (let i = 0; i < flames.length; i++) {
      const f = flames[i];
      f.visible = on > 0;
      if (on) {
        const k = 0.75 + Math.sin(S.flick + i * 1.7) * 0.15 + Math.random() * 0.2;
        f.scale.set(1, 1, k * (0.6 + on * 0.6));
        flameMat.opacity = 0.75 * on;
        coreMat.opacity = 0.9 * on;
      }
    }
  }

  return {
    group,
    body,
    wheels,
    update,
    dims: { L: st.L, W, r: st.r, roof },
    dispose() {
      group.traverse((o) => {
        if (o.isMesh) o.geometry.dispose();
      });
      wg2.wall.dispose();
      headMat.dispose();
      tailMat.dispose();
      flameMat.dispose();
      coreMat.dispose();
    },
  };
}
