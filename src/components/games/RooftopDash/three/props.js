/**
 * Rooftop Dash — rooftop props and gameplay-obstacle models.
 *
 * Every decorative prop type is ONE merged, vertex-coloured BufferGeometry
 * (built once, shared) drawn as an InstancedMesh — dozens of props cost a
 * handful of draw calls. Local frame: +Z = "along" (course forward),
 * X = "across", Y up, origin at the centre of the footprint on the roof.
 * Footprints match data/kit.js PROP_FOOTPRINT (that's the collision box).
 *
 * Gameplay obstacles (vault ducts, slide pipes, wall-run murals, beams,
 * rooftop rooms) are built per box because their size varies.
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { muralTexture, billboardTexture, stripeTexture } from "./materials.js";

const C = (hex) => new THREE.Color(hex);

/** a part: geometry transformed + flat colour baked into a `color` attribute */
function part(geo, color, { p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1] } = {}) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  geo.dispose();
  const m = new THREE.Matrix4().compose(new THREE.Vector3(...p), new THREE.Quaternion().setFromEuler(new THREE.Euler(...r)), new THREE.Vector3(...s));
  g.applyMatrix4(m);
  const col = C(color);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = col.r;
    arr[i * 3 + 1] = col.g;
    arr[i * 3 + 2] = col.b;
  }
  g.setAttribute("color", new THREE.BufferAttribute(arr, 3));
  if (!g.attributes.uv) g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  return g;
}
const box = (w, h, d, color, o) => part(new THREE.BoxGeometry(w, h, d), color, o);
const cyl = (rt, rb, h, color, o, seg = 14) => part(new THREE.CylinderGeometry(rt, rb, h, seg), color, o);
const sph = (r, color, o, w = 12, h = 8) => part(new THREE.SphereGeometry(r, w, h), color, o);
function merge(parts) {
  const g = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  g.computeBoundingSphere();
  return g;
}

/* ------------------------------------------------------------------ prop library */
const BUILDERS = {
  ac(t) {
    const body = t.metal || "#c9c6bd";
    const P = [box(1.0, 0.95, 1.3, body, { p: [0, 0.55, 0] }), box(1.04, 0.06, 1.34, "#9b978e", { p: [0, 1.05, 0] })];
    // fan grille on top + blades
    P.push(cyl(0.38, 0.38, 0.05, "#3b3d40", { p: [0, 1.09, 0.1] }, 18));
    for (let i = 0; i < 4; i++) P.push(box(0.06, 0.02, 0.62, "#6d6f72", { p: [0, 1.12, 0.1], r: [0, (i * Math.PI) / 4, 0] }));
    // side fins
    for (let i = 0; i < 7; i++) P.push(box(1.02, 0.025, 0.04, "#a7a49b", { p: [0, 0.25 + i * 0.1, -0.66] }));
    // feet
    for (const x of [-0.42, 0.42]) P.push(box(0.12, 0.1, 1.2, "#5b5d60", { p: [x, 0.05, 0] }));
    // pipe out the side
    P.push(cyl(0.05, 0.05, 0.5, "#8d6e52", { p: [0.55, 0.3, 0.4], r: [0, 0, Math.PI / 2] }, 8));
    return merge(P);
  },
  acBig(t) {
    const P = [box(1.4, 1.3, 2.2, t.metal || "#bdbab1", { p: [0, 0.72, 0] }), box(1.44, 0.07, 2.24, "#8f8b82", { p: [0, 1.4, 0] })];
    for (const z of [-0.55, 0.55]) {
      P.push(cyl(0.48, 0.48, 0.06, "#2f3134", { p: [0, 1.45, z] }, 20));
      for (let i = 0; i < 3; i++) P.push(box(0.07, 0.02, 0.8, "#6b6d70", { p: [0, 1.48, z], r: [0, (i * Math.PI) / 3, 0] }));
    }
    for (let i = 0; i < 10; i++) P.push(box(0.03, 1.0, 0.03, "#9f9c94", { p: [0.71, 0.65, -1.0 + i * 0.22] }));
    for (const x of [-0.6, 0.6]) P.push(box(0.14, 0.1, 2.1, "#57595c", { p: [x, 0.05, 0] }));
    return merge(P);
  },
  tank(t) {
    const wood = "#8a5a3a";
    const P = [];
    for (const [x, z] of [
      [-0.95, -0.95],
      [0.95, -0.95],
      [-0.95, 0.95],
      [0.95, 0.95],
    ]) P.push(box(0.14, 1.5, 0.14, "#4c4f55", { p: [x, 0.75, z] }));
    P.push(box(2.3, 0.08, 0.08, "#4c4f55", { p: [0, 0.8, -0.95] }), box(2.3, 0.08, 0.08, "#4c4f55", { p: [0, 0.8, 0.95] }));
    P.push(box(0.08, 0.08, 2.3, "#4c4f55", { p: [-0.95, 0.8, 0] }), box(0.08, 0.08, 2.3, "#4c4f55", { p: [0.95, 0.8, 0] }));
    P.push(box(2.5, 0.12, 2.5, "#5c5f66", { p: [0, 1.52, 0] }));
    P.push(cyl(1.2, 1.25, 2.1, wood, { p: [0, 2.62, 0] }, 22));
    for (const y of [1.85, 2.45, 3.05, 3.55]) P.push(cyl(1.27, 1.27, 0.06, "#3e3a36", { p: [0, y, 0] }, 22));
    P.push(cyl(0.12, 1.32, 0.55, "#6b4630", { p: [0, 3.95, 0] }, 22));
    P.push(cyl(0.06, 0.06, 0.25, "#3e3a36", { p: [0, 4.3, 0] }, 8));
    // ladder
    for (const x of [-0.18, 0.18]) P.push(box(0.04, 2.4, 0.04, "#2f3136", { p: [x, 2.4, 1.28] }));
    for (let i = 0; i < 8; i++) P.push(box(0.36, 0.03, 0.03, "#2f3136", { p: [0, 1.4 + i * 0.3, 1.28] }));
    return merge(P);
  },
  vent() {
    return merge([cyl(0.18, 0.2, 0.7, "#a9aaa6", { p: [0, 0.35, 0] }), cyl(0.34, 0.2, 0.18, "#8c8d89", { p: [0, 0.8, 0] }), cyl(0.36, 0.36, 0.04, "#6f706c", { p: [0, 0.9, 0] }), box(0.6, 0.06, 0.6, "#6f706c", { p: [0, 0.03, 0] })]);
  },
  chimney() {
    const P = [box(0.66, 1.75, 0.66, "#9c4b3c", { p: [0, 0.87, 0] }), box(0.76, 0.12, 0.76, "#6e6862", { p: [0, 1.8, 0] })];
    for (let i = 0; i < 7; i++) P.push(box(0.67, 0.02, 0.67, "#7d3b30", { p: [0, 0.2 + i * 0.24, 0] }));
    P.push(cyl(0.1, 0.1, 0.25, "#3a3a3a", { p: [0.12, 1.98, 0.1] }, 8));
    return merge(P);
  },
  door(t) {
    const wall = t.room || "#d8cbb8";
    const P = [box(2.0, 2.55, 2.4, wall, { p: [0, 1.275, 0] }), box(2.2, 0.14, 2.6, "#6e6a64", { p: [0, 2.62, 0] })];
    // door on the +X face, frame, light
    P.push(box(0.04, 2.0, 0.95, "#4a5563", { p: [1.0, 1.0, 0.2] }), box(0.05, 2.1, 1.08, "#2f3640", { p: [0.995, 1.04, 0.2] }));
    P.push(box(0.06, 0.04, 0.12, "#c9b37a", { p: [1.03, 1.0, -0.15] }));
    P.push(box(0.12, 0.1, 0.22, "#fff1c4", { p: [1.04, 2.25, 0.2] }));
    // vent grille on the back
    for (let i = 0; i < 5; i++) P.push(box(0.03, 0.03, 0.8, "#8a857c", { p: [-1.01, 1.6 + i * 0.1, 0] }));
    return merge(P);
  },
  dish() {
    const P = [cyl(0.05, 0.06, 0.9, "#7d8087", { p: [0, 0.45, 0] }, 8), box(0.5, 0.06, 0.5, "#5b5e65", { p: [0, 0.03, 0] })];
    const d = new THREE.SphereGeometry(0.48, 18, 8, 0, Math.PI * 2, 0, Math.PI * 0.32);
    P.push(part(d, "#e9eaee", { p: [0, 1.0, 0.05], r: [-1.0, 0, 0] }));
    P.push(cyl(0.015, 0.015, 0.45, "#5b5e65", { p: [0, 1.08, 0.3], r: [0.6, 0, 0] }, 6));
    return merge(P);
  },
  crates() {
    return merge([
      box(0.8, 0.8, 0.8, "#b0844f", { p: [0.15, 0.4, -0.35] }),
      box(0.82, 0.06, 0.82, "#8a6438", { p: [0.15, 0.81, -0.35] }),
      box(0.7, 0.6, 0.7, "#a7794a", { p: [-0.1, 0.3, 0.4], r: [0, 0.3, 0] }),
      box(0.9, 0.18, 0.5, "#4f6d7a", { p: [0.2, 0.9, -0.3], r: [0, 0.2, 0.05] }),
    ]);
  },
  solar() {
    const P = [];
    for (const z of [-0.7, 0.7]) P.push(box(0.08, 0.5, 0.08, "#8c9096", { p: [-0.7, 0.25, z] }), box(0.08, 0.25, 0.08, "#8c9096", { p: [0.7, 0.125, z] }));
    const panel = box(1.6, 0.05, 3.0, "#1f3b66", { p: [0, 0.42, 0], r: [0, 0, 0.32] });
    P.push(panel);
    for (let i = 0; i < 5; i++) P.push(box(1.62, 0.055, 0.025, "#9fb3c8", { p: [0, 0.425, -1.2 + i * 0.6], r: [0, 0, 0.32] }));
    return merge(P);
  },
  planter() {
    const P = [box(0.8, 0.5, 2.4, "#8b5e3c", { p: [0, 0.25, 0] }), box(0.7, 0.05, 2.3, "#3f2c1f", { p: [0, 0.5, 0] })];
    const greens = ["#4f8a3c", "#5e9c44", "#3f7a33"];
    for (let i = 0; i < 6; i++) P.push(sph(0.28 + (i % 3) * 0.05, greens[i % 3], { p: [((i % 2) - 0.5) * 0.2, 0.62, -0.95 + i * 0.38] }));
    for (let i = 0; i < 5; i++) P.push(sph(0.06, ["#ff7aa2", "#ffd166", "#ffffff"][i % 3], { p: [0.12 * ((i % 2) - 0.5), 0.85, -0.8 + i * 0.4] }, 6, 4));
    return merge(P);
  },
  antenna() {
    const P = [box(0.3, 0.06, 0.3, "#5b5e65", { p: [0, 0.03, 0] }), cyl(0.035, 0.05, 3.4, "#8a8d94", { p: [0, 1.7, 0] }, 8)];
    for (let i = 0; i < 4; i++) P.push(box(0.9 - i * 0.18, 0.025, 0.025, "#8a8d94", { p: [0, 1.6 + i * 0.45, 0] }));
    P.push(sph(0.07, "#ff3b30", { p: [0, 3.45, 0] }, 8, 6));
    return merge(P);
  },
  pipes() {
    return merge([cyl(0.12, 0.12, 3, "#9a7b5c", { p: [0.12, 0.2, 0], r: [Math.PI / 2, 0, 0] }, 10), cyl(0.08, 0.08, 3, "#7d8a91", { p: [-0.15, 0.15, 0], r: [Math.PI / 2, 0, 0] }, 10), box(0.5, 0.3, 0.08, "#4f5257", { p: [0, 0.15, -1.2] }), box(0.5, 0.3, 0.08, "#4f5257", { p: [0, 0.15, 1.2] })]);
  },
  bench() {
    const P = [box(0.45, 0.06, 1.6, "#a26f45", { p: [0, 0.42, 0] }), box(0.06, 0.35, 1.6, "#a26f45", { p: [-0.2, 0.65, 0], r: [0, 0, 0.2] })];
    for (const z of [-0.65, 0.65]) P.push(box(0.4, 0.42, 0.06, "#3d4045", { p: [0, 0.21, z] }));
    return merge(P);
  },
  skylight() {
    return merge([box(1.4, 0.2, 2.0, "#8f949b", { p: [0, 0.1, 0] }), box(1.25, 0.24, 1.85, "#7fb4d9", { p: [0, 0.3, 0] }), box(0.04, 0.26, 1.86, "#d9dde2", { p: [0, 0.31, 0] })]);
  },
  helipad() {
    // flat painted pad: ring + H + corner lights (decal, walk-through height)
    const P = [part(new THREE.RingGeometry(3.4, 3.8, 40), "#f5f5f0", { p: [0, 0.03, 0], r: [-Math.PI / 2, 0, 0] })];
    P.push(part(new THREE.CircleGeometry(3.4, 40), "#2e3540", { p: [0, 0.02, 0], r: [-Math.PI / 2, 0, 0] }));
    P.push(box(0.5, 0.02, 2.6, "#f5f5f0", { p: [-0.9, 0.04, 0] }), box(0.5, 0.02, 2.6, "#f5f5f0", { p: [0.9, 0.04, 0] }), box(1.3, 0.02, 0.45, "#f5f5f0", { p: [0, 0.04, 0] }));
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      P.push(sph(0.1, "#7fd0ff", { p: [Math.cos(a) * 4.1, 0.08, Math.sin(a) * 4.1] }, 6, 4));
    }
    return merge(P);
  },
  laundry() {
    const P = [];
    for (const z of [-2, 2]) P.push(cyl(0.035, 0.035, 2.0, "#8a8d94", { p: [0, 1.0, z] }, 6), box(0.4, 0.04, 0.04, "#8a8d94", { p: [0, 1.95, z] }));
    P.push(cyl(0.008, 0.008, 4, "#e8e8e8", { p: [0, 1.92, 0], r: [Math.PI / 2, 0, 0] }, 4));
    const cloth = ["#f2f2f2", "#ff9f5a", "#4f8fd6", "#ffd166", "#e86a92", "#9ad1a0"];
    for (let i = 0; i < 6; i++) P.push(box(0.02, 0.5 + (i % 3) * 0.12, 0.42, cloth[i], { p: [0, 1.62 - (i % 3) * 0.06, -1.5 + i * 0.6] }));
    return merge(P);
  },
};

export const PROP_TYPES = Object.keys(BUILDERS);

const geoCache = new Map();
export function propGeometry(type, theme) {
  const key = `${type}:${theme.key}`;
  if (!geoCache.has(key)) {
    const b = BUILDERS[type];
    if (!b) return null;
    geoCache.set(key, b({ metal: theme.key === "neon" ? "#8e93a3" : null, room: theme.facades ? theme.facades[3] : null }));
  }
  return geoCache.get(key);
}
export function disposePropCache() {
  for (const g of geoCache.values()) g.dispose();
  geoCache.clear();
}

/* ------------------------------------------------------------------ gameplay obstacles */
const lerpC = (a, b, t) => C(a).lerp(C(b), t);

/** vault obstacle: ventilation duct (low) or barrier/stacked duct (high) */
export function vaultMesh(b, theme, mats) {
  const sx = b.max[0] - b.min[0];
  const sy = b.max[1] - b.min[1];
  const sz = b.max[2] - b.min[2];
  const long = sx >= sz ? "x" : "z";
  const L = long === "x" ? sx : sz;
  const W = long === "x" ? sz : sx;
  const P = [];
  if (b.look === "barrier") {
    // construction barrier: concrete base + striped top rail
    P.push(box(L, sy * 0.55, W, "#b9b4a8", { p: [0, sy * 0.275, 0] }));
    P.push(box(L, sy * 0.45, W * 0.75, "#f07c28", { p: [0, sy * 0.55 + sy * 0.225, 0] }));
    for (let i = 0; i < Math.floor(L / 0.6); i++) P.push(box(0.22, sy * 0.44, W * 0.77, "#f5f2ea", { p: [-L / 2 + 0.3 + i * 0.6, sy * 0.775, 0] }));
  } else {
    // galvanised duct with ribs and a grille
    P.push(box(L, sy * 0.9, W, theme.key === "neon" ? "#8f95a6" : "#b7bab9", { p: [0, sy * 0.47, 0] }));
    const n = Math.max(2, Math.floor(L / 0.8));
    for (let i = 0; i <= n; i++) P.push(box(0.05, sy * 0.94, W + 0.04, "#8c908f", { p: [-L / 2 + (i * L) / n, sy * 0.47, 0] }));
    P.push(box(L * 0.25, sy * 0.4, 0.02, "#3a3c3f", { p: [L * 0.2, sy * 0.5, W / 2 + 0.005] }));
    P.push(box(L, 0.06, W + 0.06, "#6c706f", { p: [0, 0.03, 0] }));
    for (const x of [-L / 2 + 0.2, L / 2 - 0.2]) P.push(box(0.14, 0.12, W + 0.1, "#55595a", { p: [x, 0.06, 0] }));
  }
  const g = merge(P);
  if (long === "z") g.rotateY(Math.PI / 2);
  const m = new THREE.Mesh(g, mats.vc);
  m.position.set((b.min[0] + b.max[0]) / 2, b.min[1], (b.min[2] + b.max[2]) / 2);
  return m;
}

/** slide pipe: a big striped pipe with brackets (reads "duck under me") */
export function pipeMesh(b, theme, mats) {
  const sx = b.max[0] - b.min[0];
  const sy = b.max[1] - b.min[1];
  const sz = b.max[2] - b.min[2];
  const alongX = sx >= sz;
  const L = alongX ? sx : sz;
  const r = Math.min(sy, alongX ? sz : sx) / 2;
  const grp = new THREE.Group();
  const geo = new THREE.CylinderGeometry(r, r, L, 18, 1);
  geo.rotateZ(Math.PI / 2);
  if (!alongX) geo.rotateY(Math.PI / 2);
  // hazard bands ALONG the pipe (cylinder v runs along its length)
  let mat = mats.stripe;
  const base = stripeTexture();
  if (base) {
    const tex = base.clone();
    tex.needsUpdate = true;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.center.set(0.5, 0.5);
    tex.rotation = Math.PI / 2;
    tex.repeat.set(Math.max(2, Math.round(L / 0.9)), 1);
    mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5, metalness: 0.25 });
    mat.userData.own = true;
  }
  const pipe = new THREE.Mesh(geo, mat);
  grp.add(pipe);
  // brackets
  const n = Math.max(2, Math.ceil(L / 3));
  for (let i = 0; i <= n; i++) {
    const t = -L / 2 + (i * L) / n;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r + 0.02, 0.025, 6, 16), mats.darkMetal);
    if (alongX) {
      ring.rotation.y = Math.PI / 2;
      ring.position.x = t;
    } else ring.position.z = t;
    grp.add(ring);
  }
  grp.position.set((b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2);
  return grp;
}

/** wall-run wall: mural or billboard; texture repeats by length so it never stretches */
export function wallMesh(b, theme, mats, idx = 0) {
  const sx = b.max[0] - b.min[0];
  const sy = b.max[1] - b.min[1];
  const sz = b.max[2] - b.min[2];
  const grp = new THREE.Group();
  const alongX = sx >= sz;
  const L = alongX ? sx : sz;
  const T = alongX ? sz : sx;
  const look = b.look || "mural";
  const cx = (b.min[0] + b.max[0]) / 2;
  const cz = (b.min[2] + b.max[2]) / 2;
  // body (brick / concrete) — the lower part below the roofline uses the building colour
  const bodyGeo = new THREE.BoxGeometry(alongX ? L : T, sy, alongX ? T : L);
  const body = new THREE.Mesh(bodyGeo, mats.wallBody);
  body.position.set(cx, (b.min[1] + b.max[1]) / 2, cz);
  grp.add(body);
  // painted face(s): a plane slightly in front of each long side, only the top 4.5 m
  const paintH = Math.min(sy, 5.2);
  const tex = look === "billboard" ? billboardTexture(idx) : muralTexture(theme, look === "mural2" ? 1 : 0);
  const m = look === "billboard" ? mats.billboard(idx) : mats.mural(look === "mural2" ? 1 : 0);
  if (tex && look !== "billboard") {
    tex.wrapS = THREE.RepeatWrapping;
  }
  for (const s of [-1, 1]) {
    const g = new THREE.PlaneGeometry(L, paintH);
    if (look !== "billboard") {
      const uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * (L / (paintH * 2)));
    }
    const p = new THREE.Mesh(g, m);
    const off = T / 2 + 0.012;
    p.position.set(cx + (alongX ? 0 : s * off), b.max[1] - paintH / 2 - 0.15, cz + (alongX ? s * off : 0));
    p.rotation.y = alongX ? (s > 0 ? 0 : Math.PI) : s > 0 ? Math.PI / 2 : -Math.PI / 2;
    grp.add(p);
  }
  // cap
  const cap = new THREE.Mesh(new THREE.BoxGeometry((alongX ? L : T) + 0.12, 0.14, (alongX ? T : L) + 0.12), mats.trim);
  cap.position.set(cx, b.max[1] + 0.07, cz);
  grp.add(cap);
  if (look === "billboard") {
    // light bar on top
    const bar = new THREE.Mesh(new THREE.BoxGeometry(alongX ? L * 0.9 : 0.12, 0.08, alongX ? 0.12 : L * 0.9), mats.lamp);
    bar.position.set(cx, b.max[1] + 0.2, cz);
    grp.add(bar);
  }
  return grp;
}

/** posts, rooms, beams, generic gameplay boxes */
export function solidMesh(b, theme, mats) {
  const sx = b.max[0] - b.min[0];
  const sy = b.max[1] - b.min[1];
  const sz = b.max[2] - b.min[2];
  const geo = new THREE.BoxGeometry(sx, sy, sz);
  const mat = b.kind === "post" ? mats.darkMetal : b.kind === "beam" || b.style === "beam" ? mats.beam : mats.room;
  const m = new THREE.Mesh(geo, mat);
  m.position.set((b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2);
  return m;
}

/** steel I-beam bridge / plank (used for very narrow "roofs") */
export function beamMesh(b, theme, mats) {
  const sx = b.max[0] - b.min[0];
  const sz = b.max[2] - b.min[2];
  const alongX = sx >= sz;
  const L = alongX ? sx : sz;
  const Wd = alongX ? sz : sx;
  const P = [box(Wd, 0.06, L, "#e3b23c", { p: [0, -0.03, 0] }), box(0.08, 0.3, L, "#c99a2e", { p: [0, -0.2, 0] }), box(Wd, 0.06, L, "#c99a2e", { p: [0, -0.36, 0] })];
  for (let i = 0; i < Math.floor(L / 1.2); i++) P.push(box(Wd + 0.02, 0.02, 0.05, "#2b2b2b", { p: [0, 0.005, -L / 2 + 0.6 + i * 1.2] }));
  const g = merge(P);
  if (alongX) g.rotateY(Math.PI / 2);
  const m = new THREE.Mesh(g, mats.vc);
  m.position.set((b.min[0] + b.max[0]) / 2, b.max[1], (b.min[2] + b.max[2]) / 2);
  return m;
}

export { lerpC };
