/**
 * Lumberjack Life — vehicle models: hand cart, tractor (+ log trailer),
 * logging truck. Wheels spin with distance, front wheels steer, bodies
 * pitch/roll with the terrain. Cargo is drawn by the log renderer at the
 * slot poses returned by `bedSlotPose` — every log on a bed is a real log.
 */
import * as THREE from "three";
import { boardsTexture, metalTexture } from "./textures.js";
import { stackSlot } from "../engine/logs.js";
import { CART } from "../engine/vehicles.js";

const std = (color, rough = 0.7, metal = 0, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...extra });

function kit(shadows) {
  const disp = [];
  const box = (parent, w, h, d, mat, x, y, z, r = [0, 0, 0]) => {
    const g = new THREE.BoxGeometry(w, h, d);
    disp.push(g);
    const m = new THREE.Mesh(g, mat);
    m.position.set(x, y, z);
    m.rotation.set(r[0], r[1], r[2]);
    m.castShadow = shadows;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  };
  const cyl = (parent, r0, r1, h, mat, x, y, z, r = [0, 0, 0], seg = 14) => {
    const g = new THREE.CylinderGeometry(r0, r1, h, seg);
    disp.push(g);
    const m = new THREE.Mesh(g, mat);
    m.position.set(x, y, z);
    m.rotation.set(r[0], r[1], r[2]);
    m.castShadow = shadows;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  };
  return { disp, box, cyl };
}

/** a wheel: tyre (with tread blocks) + rim + hub; spins about local X */
function wheel(K, mats, r, w) {
  const g = new THREE.Group();
  const spin = new THREE.Group();
  g.add(spin);
  K.cyl(spin, r, r, w, mats.tyre, 0, 0, 0, [0, 0, Math.PI / 2], 20);
  K.cyl(spin, r * 0.62, r * 0.62, w + 0.02, mats.rim, 0, 0, 0, [0, 0, Math.PI / 2], 16);
  K.cyl(spin, r * 0.2, r * 0.2, w + 0.06, mats.hub, 0, 0, 0, [0, 0, Math.PI / 2], 8);
  const n = Math.round(r * 30);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    K.box(spin, w * 0.95, 0.04, r * 0.18, mats.tyre, 0, Math.cos(a) * r, Math.sin(a) * r, [a, 0, 0]);
  }
  return { g, spin };
}

export function buildCart({ shadows = true } = {}) {
  const K = kit(shadows);
  const mats = {
    wood: std("#ffffff", 0.85, 0, { map: boardsTexture("#9c7348", false) }),
    frame: std("#5b4330", 0.85),
    tyre: std("#2a2622", 0.95),
    rim: std("#7a6a52", 0.7),
    hub: std("#4a4a4a", 0.5, 0.6),
    steel: std("#6f767c", 0.5, 0.6, { map: metalTexture("#6f767c") }),
  };
  K.disp.push(...Object.values(mats));
  const root = new THREE.Group();
  const tilt = new THREE.Group(); // pivots about the axle
  tilt.position.y = 0.36;
  root.add(tilt);
  K.box(tilt, 1.0, 0.07, 1.75, mats.wood, 0, 0.2, 0);
  K.box(tilt, 0.08, 0.1, 1.85, mats.frame, -0.48, 0.14, 0);
  K.box(tilt, 0.08, 0.1, 1.85, mats.frame, 0.48, 0.14, 0);
  for (const x of [-0.5, 0.5]) for (const z of [-0.82, 0, 0.82]) K.box(tilt, 0.06, 0.5, 0.06, mats.frame, x, 0.45, z);
  K.box(tilt, 0.04, 0.12, 1.75, mats.wood, -0.5, 0.42, 0);
  K.box(tilt, 0.04, 0.12, 1.75, mats.wood, 0.5, 0.42, 0);
  // handle: two shafts to a cross-bar
  for (const x of [-0.32, 0.32]) K.box(tilt, 0.05, 0.05, 1.0, mats.frame, x, 0.18, 1.35);
  K.cyl(tilt, 0.025, 0.025, 0.72, mats.frame, 0, 0.18, 1.83, [0, 0, Math.PI / 2], 8);
  K.box(tilt, 0.06, 0.32, 0.06, mats.frame, 0, 0.0, -0.8);
  const wheels = [];
  for (const s of [-1, 1]) {
    const w = wheel(K, mats, 0.36, 0.1);
    w.g.position.set(s * 0.6, 0.36, 0);
    root.add(w.g);
    wheels.push(w);
  }
  K.cyl(root, 0.025, 0.025, 1.25, mats.steel, 0, 0.36, 0, [0, 0, Math.PI / 2], 8);
  let lift = 0;
  return {
    root,
    kind: "cart",
    bedY: 0.36 + 0.24,
    tiltGroup: tilt,
    update(c, dt) {
      root.position.set(c.x, c.y, c.z);
      root.rotation.set(0, c.yaw, 0);
      // parked: handle rests on the ground; pulled: lifted to hand height
      const target = c.pulled ? -0.09 : 0.24;
      lift += (target - lift) * Math.min(1, dt * 8);
      tilt.rotation.set(lift + c.pitch * 0.5, 0, c.roll);
      for (const w of wheels) w.spin.rotation.x = c.wheel;
    },
    /** handle grip points in WORLD space (for the player's hands) */
    handlePoints(c, outL, outR) {
      tilt.updateMatrixWorld(true);
      outL.set(0.25, 0.18, 1.83);
      outR.set(-0.25, 0.18, 1.83);
      tilt.localToWorld(outL);
      tilt.localToWorld(outR);
    },
    dispose() {
      root.removeFromParent();
      K.disp.forEach((d) => d.dispose());
    },
  };
}

export function buildTractor(def, { shadows = true } = {}) {
  const K = kit(shadows);
  const L = def.look;
  const s = L.size || 1;
  const mats = {
    body: std(L.body, 0.45, 0.25),
    trim: std(L.trim, 0.55, 0.1),
    dark: std("#2b2b2b", 0.6, 0.3),
    tyre: std("#232120", 0.95),
    rim: std(L.trim, 0.5, 0.3),
    hub: std("#555", 0.4, 0.7),
    glass: std("#a8c8d8", 0.1, 0.2, { transparent: true, opacity: 0.45 }),
    steel: std("#6f767c", 0.45, 0.65, { map: metalTexture("#6f767c") }),
    wood: std("#ffffff", 0.85, 0, { map: boardsTexture("#8c6a48", false) }),
    light: std("#fff4cf", 0.3, 0, { emissive: "#ffe9a8", emissiveIntensity: 0.4 }),
  };
  K.disp.push(...Object.values(mats));
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const S = (v) => v * s;
  // chassis + hood + grille
  K.box(body, S(0.7), S(0.45), S(2.6), mats.dark, 0, S(0.75), S(0.2));
  K.box(body, S(0.82), S(0.6), S(1.55), mats.body, 0, S(1.1), S(0.85));
  K.box(body, S(0.84), S(0.08), S(1.6), mats.trim, 0, S(1.42), S(0.85));
  K.box(body, S(0.72), S(0.5), S(0.06), mats.dark, 0, S(1.06), S(1.64));
  for (const x of [-0.25, 0.25]) K.cyl(body, S(0.07), S(0.07), S(0.05), mats.light, S(x), S(1.18), S(1.67), [Math.PI / 2, 0, 0], 10);
  K.cyl(body, S(0.05), S(0.06), S(0.9), mats.dark, S(0.25), S(1.75), S(1.15), [0, 0, 0], 8);
  // cab
  K.box(body, S(1.3), S(0.12), S(1.3), mats.body, 0, S(1.05), S(-0.55));
  for (const [x, z] of [[-0.6, -1.15], [0.6, -1.15], [-0.6, 0.05], [0.6, 0.05]]) K.box(body, S(0.07), S(1.3), S(0.07), mats.dark, S(x), S(1.75), S(z));
  K.box(body, S(1.42), S(0.1), S(1.42), mats.body, 0, S(2.45), S(-0.55));
  K.box(body, S(1.2), S(0.85), S(0.03), mats.glass, 0, S(1.85), S(0.05));
  K.box(body, S(0.03), S(0.85), S(1.1), mats.glass, S(0.6), S(1.85), S(-0.55));
  K.box(body, S(0.5), S(0.12), S(0.45), mats.dark, 0, S(1.25), S(-0.55));
  K.box(body, S(0.5), S(0.5), S(0.1), mats.dark, 0, S(1.5), S(-0.8));
  const wheelG = new THREE.Group();
  wheelG.position.set(0, S(1.42), S(-0.05));
  wheelG.rotation.x = -0.9;
  body.add(wheelG);
  K.cyl(wheelG, S(0.16), S(0.16), S(0.03), mats.dark, 0, 0, 0, [0, 0, 0], 16);
  // fenders
  for (const x of [-0.72, 0.72]) K.box(body, S(0.42), S(0.06), S(1.2), mats.body, S(x), S(1.35), S(-0.55));
  // wheels
  const wheels = [];
  const fronts = [];
  for (const [x, z, r, w, front] of [[-0.72, -0.55, 0.62, 0.38, false], [0.72, -0.55, 0.62, 0.38, false], [-0.55, 1.15, 0.38, 0.24, true], [0.55, 1.15, 0.38, 0.24, true]]) {
    const wh = wheel(K, mats, S(r), S(w));
    const pivot = new THREE.Group();
    pivot.position.set(S(x), S(r), S(z));
    pivot.add(wh.g);
    root.add(pivot);
    wheels.push({ ...wh, r: S(r) });
    if (front) fronts.push(pivot);
  }
  K.box(body, S(0.2), S(0.15), S(0.4), mats.dark, 0, S(0.6), S(-1.6));

  // trailer
  const trailer = new THREE.Group();
  const tb = new THREE.Group();
  trailer.add(tb);
  K.box(tb, S(1.9), S(0.08), S(3.6), mats.wood, 0, S(0.95), 0);
  K.box(tb, S(0.12), S(0.18), S(3.7), mats.dark, S(-0.9), S(0.85), 0);
  K.box(tb, S(0.12), S(0.18), S(3.7), mats.dark, S(0.9), S(0.85), 0);
  for (const x of [-0.92, 0.92]) for (const z of [-1.6, -0.55, 0.55, 1.6]) K.box(tb, S(0.08), S(0.95), S(0.08), mats.body, S(x), S(1.45), S(z));
  K.box(tb, S(0.08), S(0.08), S(2.45), mats.dark, 0, S(0.82), S(2.9));
  const twheels = [];
  for (const [x, z] of [[-1.05, -0.55], [1.05, -0.55], [-1.05, 0.55], [1.05, 0.55]]) {
    const wh = wheel(K, mats, S(0.4), S(0.24));
    wh.g.position.set(S(x), S(0.4), S(z));
    trailer.add(wh.g);
    twheels.push(wh);
  }
  return {
    root,
    trailer,
    kind: "tractor",
    seatY: S(1.31) - 0.98,
    seatZ: S(-0.5),
    bedY: S(0.99),
    update(v, dt) {
      root.position.set(v.x, v.y, v.z);
      root.rotation.set(0, v.yaw, 0, "YXZ");
      body.rotation.set(-v.pitch, 0, v.roll);
      for (const w of wheels) w.spin.rotation.x = (v.wheel * 0.55) / w.r;
      for (const f of fronts) f.rotation.y = v.steer;
      body.position.y = Math.abs(v.speed) > 0.3 ? Math.sin(v.wheel * 3) * 0.008 : 0;
      const t = v.trailer;
      if (t) {
        trailer.position.set(t.x, t.y, t.z);
        trailer.rotation.set(0, t.yaw, 0, "YXZ");
        tb.rotation.set(-t.pitch, 0, t.roll);
        for (const w of twheels) w.spin.rotation.x = t.wheel;
      }
    },
    dispose() {
      root.removeFromParent();
      trailer.removeFromParent();
      K.disp.forEach((d) => d.dispose());
    },
  };
}

export function buildTruck(def, { shadows = true } = {}) {
  const K = kit(shadows);
  const L = def.look;
  const mats = {
    body: std(L.body, 0.4, 0.3),
    trim: std(L.trim, 0.4, 0.6),
    dark: std("#262626", 0.6, 0.3),
    tyre: std("#211f1e", 0.95),
    rim: std("#b9bec4", 0.3, 0.8),
    hub: std("#555", 0.4, 0.7),
    glass: std("#9fc0d2", 0.08, 0.3, { transparent: true, opacity: 0.55 }),
    steel: std("#6f767c", 0.45, 0.65, { map: metalTexture("#6f767c") }),
    light: std("#fff4cf", 0.3, 0, { emissive: "#ffe9a8", emissiveIntensity: 0.4 }),
  };
  K.disp.push(...Object.values(mats));
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  // chassis
  K.box(body, 1.0, 0.3, 7.2, mats.dark, 0, 0.75, -0.6);
  // cab
  K.box(body, 2.2, 1.5, 1.7, mats.body, 0, 1.85, 2.0);
  K.box(body, 2.0, 0.65, 0.05, mats.glass, 0, 2.2, 2.86);
  for (const x of [-1.11, 1.11]) K.box(body, 0.04, 0.55, 1.0, mats.glass, x, 2.2, 2.1);
  K.box(body, 2.1, 0.9, 1.0, mats.body, 0, 1.3, 3.3);
  K.box(body, 1.8, 0.6, 0.06, mats.trim, 0, 1.3, 3.82);
  for (const x of [-0.75, 0.75]) K.cyl(body, 0.1, 0.1, 0.05, mats.light, x, 1.35, 3.84, [Math.PI / 2, 0, 0], 10);
  K.box(body, 2.3, 0.18, 0.2, mats.trim, 0, 0.75, 3.85);
  K.cyl(body, 0.07, 0.07, 1.6, mats.trim, 1.0, 2.3, 1.15, [0, 0, 0], 8);
  // log bunks (stakes) along the bed
  for (const z of [-4.0, -2.5, -1.0, 0.5]) {
    K.box(body, 2.3, 0.16, 0.18, mats.steel, 0, 1.0, z);
    for (const x of [-1.12, 1.12]) K.box(body, 0.1, 1.3, 0.1, mats.steel, x, 1.7, z);
  }
  K.box(body, 2.2, 1.6, 0.12, mats.steel, 0, 1.75, 1.05);
  const wheels = [];
  const fronts = [];
  for (const [x, z, front] of [[-1.05, 2.9, true], [1.05, 2.9, true], [-1.05, -1.6, false], [1.05, -1.6, false], [-1.05, -2.8, false], [1.05, -2.8, false]]) {
    const wh = wheel(K, mats, 0.52, 0.36);
    const pivot = new THREE.Group();
    pivot.position.set(x, 0.52, z);
    pivot.add(wh.g);
    root.add(pivot);
    wheels.push(wh);
    if (front) fronts.push(pivot);
  }
  return {
    root,
    trailer: null,
    kind: "truck",
    seatY: 1.75 - 0.98,
    seatZ: 2.1,
    seatX: 0.45,
    bedY: 1.08,
    update(v) {
      root.position.set(v.x, v.y, v.z);
      root.rotation.set(0, v.yaw, 0, "YXZ");
      body.rotation.set(-v.pitch, 0, v.roll);
      for (const w of wheels) w.spin.rotation.x = (v.wheel * 0.55) / 0.52;
      for (const f of fronts) f.rotation.y = v.steer;
    },
    dispose() {
      root.removeFromParent();
      K.disp.forEach((d) => d.dispose());
    },
  };
}

/**
 * World pose of the i-th log on a bed. Logs lie along the bed (its yaw),
 * stacked across it in nested rows; spacing adapts to the thickest log so
 * big timber doesn't intersect.
 */
export function bedSlotPose(v, vis, i, log, maxR, out) {
  let perRow;
  let spacing;
  let lanes = 1;
  let laneZ = [0];
  let base;
  if (v.kind === "cart") {
    perRow = CART.perRow;
    spacing = Math.max(CART.spacing, maxR * 2 + 0.02);
    base = { x: v.x, z: v.z, y: v.y + vis.bedY, yaw: v.yaw, pitch: v.pitch };
  } else if (v.trailer) {
    const t = v.trailer;
    perRow = v.cap > 10 ? 5 : 4;
    spacing = Math.max(0.42, maxR * 2 + 0.02);
    base = { x: t.x, z: t.z, y: t.y + vis.bedY, yaw: t.yaw, pitch: t.pitch };
  } else {
    perRow = 5;
    lanes = 2;
    laneZ = [-2.9, -0.6];
    spacing = Math.max(0.42, maxR * 2 + 0.02);
    base = { x: v.x, z: v.z, y: v.y + vis.bedY, yaw: v.yaw, pitch: v.pitch };
  }
  const lane = i % lanes;
  const k = Math.floor(i / lanes);
  const s = stackSlot(k, perRow, spacing, spacing * 0.86);
  const along = laneZ[lane];
  const cy = Math.cos(base.yaw);
  const sy = Math.sin(base.yaw);
  // local (x across, z along) → world; local +X is the vehicle's left
  out.x = base.x + s.x * cy + along * sy;
  out.z = base.z - s.x * sy + along * cy;
  out.y = base.y + log.r + s.y - along * Math.sin(base.pitch);
  out.yaw = base.yaw;
  out.pitch = base.pitch;
  out.roll = 0;
  out.vis = 1;
  return out;
}
