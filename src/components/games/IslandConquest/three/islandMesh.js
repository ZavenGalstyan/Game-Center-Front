/**
 * Island Conquest — procedural miniature islands.
 *
 * One archetype per island type (small · medium · large · farm · fort · port ·
 * capital), each built from a terraced radial terrain (underwater rock skirt →
 * wet sand → beach → grass, with cliffs on the big ones) plus decorations
 * scattered by a seeded RNG: region trees, bushes, rocks, paths, houses,
 * towers, walls, windmills, docks. The same type looks different on every
 * map because the shoreline shape, rotation and props come from the island's
 * `variant` seed.
 *
 * Output per island:
 *   body    one merged vertex-coloured geometry (shared material)
 *   cloth   faction-coloured pennants (white vertex colour × faction material)
 *   glow    optional emissive moss (Shadow Isles)
 *   flag    { x, y, z } top of the main flag pole
 *   tents   up to 4 camp-tent spots that appear as the garrison grows
 *   labelY  height the troop badge floats at
 *
 * The shoreline function (shoreParams/shoreRadius) is shared with the ocean
 * shader so foam hugs the real coastline.
 */
import * as THREE from "three";
import { T, paint, merge, box, cyl, cone, sph, ico, dodec, gable, rng } from "./geo.js";

/* ---------------------------------------------------------------- shoreline */
export function shoreParams(variant) {
  const r = rng(variant * 31 + 7);
  return { p1: r() * Math.PI * 2, p2: r() * Math.PI * 2, p3: r() * Math.PI * 2, rot: r() * Math.PI * 2 };
}
/** radius multiplier of the coastline at angle `a` (matches the ocean shader) */
export function shoreMul(a, sp) {
  return 1 + 0.1 * Math.sin(2 * a + sp.p1) + 0.06 * Math.sin(3 * a + sp.p2) + 0.035 * Math.sin(5 * a + sp.p3);
}

/* ---------------------------------------------------------------- profiles */
// rings from the outside in: s = fraction of the shoreline radius, y = height,
// c = colour key of the band from this ring inward. `top` = where the walkable
// plateau starts (props live inside it), `hill` = central bump height.
const PROFILES = {
  small: { rings: [[1.3, -0.85, "deep"], [1.12, -0.2, "wet"], [1.0, 0.05, "sand"], [0.86, 0.17, "sand"], [0.76, 0.27, "grass"], [0.45, 0.4, "grass2"]], top: 0.74, hill: 0.12 },
  medium: { rings: [[1.3, -0.85, "deep"], [1.12, -0.2, "wet"], [1.0, 0.05, "sand"], [0.87, 0.18, "sand"], [0.79, 0.3, "grass"], [0.5, 0.48, "grass2"]], top: 0.76, hill: 0.16 },
  large: { rings: [[1.3, -0.85, "deep"], [1.12, -0.2, "wet"], [1.0, 0.05, "sand"], [0.9, 0.16, "rock"], [0.84, 0.72, "rock2"], [0.8, 0.8, "grass"], [0.45, 0.92, "grass2"]], top: 0.78, hill: 0.14 },
  capital: { rings: [[1.3, -0.85, "deep"], [1.12, -0.2, "wet"], [1.0, 0.05, "sand"], [0.9, 0.16, "rock"], [0.84, 0.86, "rock2"], [0.8, 0.94, "grass"], [0.45, 1.0, "grass2"]], top: 0.78, hill: 0.06 },
  fort: { rings: [[1.3, -0.85, "deep"], [1.12, -0.2, "wet"], [1.0, 0.05, "rock"], [0.92, 0.22, "rock"], [0.84, 1.05, "rock2"], [0.79, 1.12, "grass"], [0.4, 1.18, "grass2"]], top: 0.77, hill: 0.05 },
  farm: { rings: [[1.3, -0.85, "deep"], [1.12, -0.2, "wet"], [1.0, 0.05, "sand"], [0.88, 0.16, "sand"], [0.81, 0.26, "grass"], [0.5, 0.34, "grass"]], top: 0.79, hill: 0.04 },
  port: { rings: [[1.3, -0.85, "deep"], [1.12, -0.2, "wet"], [1.0, 0.05, "sand"], [0.86, 0.15, "sand"], [0.78, 0.25, "grass"], [0.45, 0.36, "grass2"]], top: 0.75, hill: 0.08 },
};

function palette(th) {
  return {
    deep: new THREE.Color(th.rock).multiplyScalar(0.55),
    wet: new THREE.Color(th.sand).lerp(new THREE.Color(th.rock), 0.45).multiplyScalar(0.8),
    sand: new THREE.Color(th.sand),
    rock: new THREE.Color(th.rock),
    rock2: new THREE.Color(th.cliff),
    grass: new THREE.Color(th.grass),
    grass2: new THREE.Color(th.grass2),
  };
}

/* ---------------------------------------------------------------- terrain */
function terrain(r, prof, sp, pal, segs, seed) {
  const rings = prof.rings;
  const rand = rng(seed);
  const jit = Array.from({ length: segs }, () => rand());
  const pos = [];
  const col = [];
  const vtx = (k, j) => {
    const a = (j / segs) * Math.PI * 2;
    const [s, y] = rings[k];
    // tiny per-vertex wobble on the rocky/cliff bands only
    const wob = rings[k][2].startsWith("rock") ? (jit[j % segs] - 0.5) * 0.06 : 0;
    const R = r * shoreMul(a, sp) * (s + wob);
    return [Math.cos(a) * R, y + bump(s, a, prof, sp), Math.sin(a) * R];
  };
  const pushTri = (a, b, c, color, k) => {
    pos.push(...a, ...b, ...c);
    for (let i = 0; i < 3; i++) col.push(color.r * k, color.g * k, color.b * k);
  };
  for (let k = 0; k < rings.length - 1; k++) {
    const color = pal[rings[k + 1][2]];
    for (let j = 0; j < segs; j++) {
      const A = vtx(k, j);
      const A1 = vtx(k, (j + 1) % segs);
      const B = vtx(k + 1, j);
      const B1 = vtx(k + 1, (j + 1) % segs);
      const sh = 0.93 + jit[j] * 0.14;
      pushTri(A, B, A1, color, sh);
      pushTri(B, B1, A1, color, sh * 0.97);
    }
  }
  const last = rings.length - 1;
  const cy = rings[last][1] + bump(0, 0, prof, sp);
  const cc = pal[rings[last][2]];
  for (let j = 0; j < segs; j++) {
    pushTri(vtx(last, j), [0, cy, 0], vtx(last, (j + 1) % segs), cc, 0.95 + jit[j] * 0.1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

function bump(s, a, prof, sp) {
  if (s >= prof.top) return 0;
  const k = 1 - (s / prof.top) ** 2;
  return prof.hill * k * (0.7 + 0.3 * Math.sin(2 * a + sp.p2));
}

/** terrain height at local (x, z) — props sit on it */
function heightAt(x, z, r, prof, sp) {
  const a = Math.atan2(z, x);
  const s = Math.hypot(x, z) / (r * shoreMul(a, sp));
  const rings = prof.rings;
  if (s >= rings[0][0]) return rings[0][1];
  let y = rings[rings.length - 1][1];
  for (let k = 0; k < rings.length - 1; k++) {
    const [s0, y0] = rings[k];
    const [s1, y1] = rings[k + 1];
    if (s <= s0 && s >= s1) {
      y = y1 + ((y0 - y1) * (s - s1)) / (s0 - s1);
      break;
    }
  }
  return y + bump(s, a, prof, sp);
}

/* ---------------------------------------------------------------- props */
const C = (c) => new THREE.Color(c);

function palm(out, x, y, z, h, rand, th) {
  const lean = (rand() - 0.5) * 0.5;
  const dir = rand() * Math.PI * 2;
  const segs = 4;
  let px = x;
  let pz = z;
  let py = y;
  for (let i = 0; i < segs; i++) {
    const sh = h / segs;
    const tilt = lean * (i / segs);
    out.push(paint(T(cyl(0.035 - i * 0.004, 0.045 - i * 0.004, sh * 1.05, 5), px, py + sh / 2, pz, Math.sin(dir) * tilt, 0, Math.cos(dir) * tilt), i % 2 ? th.trunk : C(th.trunk).multiplyScalar(0.85), 0.1, i));
    px += Math.cos(dir) * Math.sin(tilt) * sh;
    pz += Math.sin(dir) * Math.sin(tilt) * sh;
    py += sh;
  }
  const n = 6;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rand();
    const leaf = T(cone(0.07, 0.34, 3), 0, 0.17, 0, 0, 0, 0, 1, 1, 0.35);
    T(leaf, 0, 0, 0, 0, 0, -1.15 - rand() * 0.25);
    T(leaf, px, py, pz, 0, -a, 0);
    out.push(paint(leaf, i % 2 ? th.leaf : th.leaf2, 0.2, i + 3));
  }
  out.push(paint(T(sph(0.05, 5, 4), px, py - 0.02, pz), "#6a4a2c"));
}

function roundTree(out, x, y, z, h, rand, th) {
  out.push(paint(T(cyl(0.035, 0.05, h * 0.5, 5), x, y + h * 0.25, z), th.trunk));
  const s = 0.16 + h * 0.18;
  out.push(paint(T(ico(s, 0), x, y + h * 0.55 + s * 0.6, z, rand(), rand(), 0, 1, 0.9, 1), rand() > 0.5 ? th.leaf : th.leaf2, 0.25, (x * 99) | 0));
  out.push(paint(T(ico(s * 0.7, 0), x + s * 0.5, y + h * 0.5 + s * 0.4, z + s * 0.2, rand(), rand(), 0), th.leaf2, 0.25, (z * 77) | 0));
}

function cypress(out, x, y, z, h, rand, th) {
  out.push(paint(T(cyl(0.03, 0.04, h * 0.25, 5), x, y + h * 0.12, z), th.trunk));
  out.push(paint(T(sph(0.1, 6, 6), x, y + h * 0.62, z, 0, rand(), 0, 1, h * 4.2, 1), th.leaf, 0.2, (x * 31) | 0));
}

function pine(out, x, y, z, h, rand, th) {
  out.push(paint(T(cyl(0.03, 0.045, h * 0.3, 5), x, y + h * 0.15, z), th.trunk));
  for (let i = 0; i < 3; i++) {
    const r = 0.2 - i * 0.05;
    const yy = y + h * (0.28 + i * 0.22);
    out.push(paint(T(cone(r, h * 0.36, 7), x, yy + h * 0.18, z, 0, rand(), 0), i % 2 ? th.leaf : th.leaf2, 0.18, i * 7 + 1));
    if (th.snow) out.push(paint(T(cone(r * 0.62, h * 0.16, 7), x, yy + h * 0.29, z), "#f6fbff", 0.05, i));
  }
}

function twisted(out, glow, x, y, z, h, rand, th) {
  let px = x;
  let py = y;
  let pz = z;
  const a = rand() * Math.PI * 2;
  for (let i = 0; i < 3; i++) {
    const sh = h * 0.28;
    const tilt = (i % 2 ? 0.45 : -0.35) * (0.6 + rand() * 0.5);
    out.push(paint(T(cyl(0.022, 0.04, sh, 5), px, py + sh / 2, pz, Math.cos(a) * tilt, 0, Math.sin(a) * tilt), th.trunk));
    px += Math.sin(a) * Math.sin(tilt) * sh * 0.8;
    pz -= Math.cos(a) * Math.sin(tilt) * sh * 0.8;
    py += sh * 0.95;
  }
  out.push(paint(T(dodec(0.13), px, py + 0.05, pz, rand(), rand(), 0, 1.3, 0.7, 1.1), th.leaf, 0.3, 5));
  out.push(paint(T(dodec(0.09), px - 0.12, py - 0.05, pz + 0.08, rand(), rand(), 0), th.leaf2, 0.3, 6));
  if (glow && rand() > 0.35) glow.push(paint(T(ico(0.035, 0), x + 0.1, y + 0.03, z + 0.06), "#ffffff"));
}

function tree(kind, out, glow, x, y, z, h, rand, th) {
  if (kind === "palm") palm(out, x, y, z, h * 1.15, rand, th);
  else if (kind === "cypress") cypress(out, x, y, z, h, rand, th);
  else if (kind === "pine") pine(out, x, y, z, h, rand, th);
  else if (kind === "twisted") twisted(out, glow, x, y, z, h, rand, th);
  else roundTree(out, x, y, z, h, rand, th);
}

function rock(out, x, y, z, s, rand, th) {
  out.push(paint(T(dodec(s), x, y + s * 0.3, z, rand() * 3, rand() * 3, rand() * 3, 1, 0.7 + rand() * 0.4, 1), rand() > 0.5 ? th.rock : th.rock2, 0.25, (s * 1000) | 0));
}

function bush(out, x, y, z, s, rand, th) {
  out.push(paint(T(ico(s, 0), x, y + s * 0.55, z, rand(), rand(), 0, 1.2, 0.75, 1.1), rand() > 0.5 ? th.leaf2 : th.leaf, 0.25, (x * 50) | 0));
}

/** cottage: walls + gable roof + door, facing angle `ry` */
function house(out, x, y, z, ry, th, w = 0.32, d = 0.26, h = 0.2, roof) {
  const g = [];
  g.push(paint(T(box(w, h, d), 0, h / 2, 0), th.wall, 0.08, 3));
  g.push(paint(T(gable(w * 1.12, d * 1.18, h * 0.85), 0, h, 0), roof || th.roof, 0.12, 4));
  g.push(paint(T(box(0.06, 0.11, 0.01), 0.04, 0.055, d / 2 + 0.005), th.wood));
  g.push(paint(T(box(0.05, 0.05, 0.01), -w / 4, h * 0.6, d / 2 + 0.005), "#3c4a5a"));
  g.push(paint(T(box(0.04, 0.12, 0.04), w / 3, h + h * 0.55, -d / 5), "#8a8078"));
  for (const p of g) out.push(T(p, x, y, z, 0, ry, 0));
}

/** round stone tower with a cone roof; returns the roof tip */
function tower(out, x, y, z, h, r, th, roof) {
  out.push(paint(T(cyl(r * 0.92, r, h, 9), x, y + h / 2, z), th.wall, 0.12, 9));
  out.push(paint(T(cyl(r * 1.12, r * 1.12, 0.05, 9), x, y + h, z), C(th.wall).multiplyScalar(0.85), 0.1, 2));
  out.push(paint(T(cone(r * 1.25, h * 0.55, 9), x, y + h + h * 0.27 + 0.02, z), roof || th.roof, 0.12, 8));
  out.push(paint(T(box(0.05, 0.08, 0.02), x, y + h * 0.62, z + r * 0.95), "#2e3540"));
  return [x, y + h + h * 0.55 + 0.02, z];
}

/** square keep with crenellations; returns its roof centre */
function keep(out, x, y, z, w, h, th, ry = 0) {
  const g = [];
  g.push(paint(T(box(w, h, w), 0, h / 2, 0), th.wall, 0.1, 11));
  g.push(paint(T(box(w * 1.08, 0.05, w * 1.08), 0, h, 0), C(th.wall).multiplyScalar(0.85)));
  const n = 3;
  for (let i = 0; i < n; i++)
    for (const side of [-1, 1]) {
      const t = -w / 2 + (w * (i + 0.5)) / n;
      g.push(paint(T(box(0.07, 0.08, 0.07), t, h + 0.06, (side * w) / 2), th.wall, 0.1, i));
      g.push(paint(T(box(0.07, 0.08, 0.07), (side * w) / 2, h + 0.06, t), th.wall, 0.1, i + 4));
    }
  g.push(paint(T(box(0.1, 0.16, 0.01), 0, 0.08, w / 2 + 0.005), th.wood));
  g.push(paint(T(box(0.06, 0.08, 0.01), 0, h * 0.62, w / 2 + 0.005), "#2e3540"));
  for (const p of g) out.push(T(p, x, y, z, 0, ry, 0));
  return [x, y + h + 0.1, z];
}

function wallSeg(out, x0, z0, x1, z1, y, th, h = 0.18) {
  const L = Math.hypot(x1 - x0, z1 - z0);
  const a = Math.atan2(z1 - z0, x1 - x0);
  const mx = (x0 + x1) / 2;
  const mz = (z0 + z1) / 2;
  out.push(paint(T(box(L, h, 0.07), mx, y + h / 2, mz, 0, -a, 0), th.wall, 0.1, (L * 100) | 0));
  const n = Math.max(1, Math.floor(L / 0.13));
  for (let i = 0; i < n; i += 2) {
    const t = (i + 0.5) / n - 0.5;
    out.push(paint(T(box(0.06, 0.06, 0.08), mx + Math.cos(a) * t * L, y + h + 0.03, mz + Math.sin(a) * t * L, 0, -a, 0), th.wall, 0.1, i));
  }
}

function windmill(out, x, y, z, ry, th) {
  out.push(paint(T(cyl(0.11, 0.15, 0.48, 8), x, y + 0.24, z), th.wall, 0.1, 21));
  out.push(paint(T(cone(0.15, 0.18, 8), x, y + 0.57, z), th.roof, 0.1, 22));
  const hub = new THREE.Vector3(0, 0.44, 0.16).applyAxisAngle(new THREE.Vector3(0, 1, 0), ry);
  for (let i = 0; i < 4; i++) {
    const blade = T(box(0.05, 0.36, 0.01), 0, 0.2, 0);
    T(blade, 0, 0, 0, 0, 0, (i * Math.PI) / 2 + 0.4);
    T(blade, x + hub.x, y + hub.y, z + hub.z, 0, ry, 0);
    out.push(paint(blade, i % 2 ? "#efe6d2" : th.wood, 0.05, i));
  }
}

function field(out, x, y, z, ry, w, d, c1, c2) {
  const rows = 4;
  for (let i = 0; i < rows; i++) {
    const t = -d / 2 + (d * (i + 0.5)) / rows;
    const g = T(box(w, 0.035, (d / rows) * 0.8), 0, 0.02, t);
    out.push(T(paint(g, i % 2 ? c1 : c2, 0.08, i), x, y, z, 0, ry, 0));
  }
}

/** small static rowboat for harbours */
function moored(out, x, y, z, ry, th) {
  const g = [];
  const hull = box(0.14, 0.06, 0.34);
  const p = hull.attributes.position;
  for (let i = 0; i < p.count; i++) {
    if (p.getZ(i) > 0.1) p.setX(i, p.getX(i) * 0.2);
    if (p.getY(i) < 0) p.setX(i, p.getX(i) * 0.6);
  }
  g.push(paint(hull, th.wood, 0.1, 3));
  g.push(paint(T(box(0.1, 0.01, 0.2), 0, 0.03, -0.02), "#c9a878"));
  for (const q of g) out.push(T(q, x, y, z, 0, ry, 0));
}

/* ---------------------------------------------------------------- builder */
const TREE_H = { small: 0.42, medium: 0.48, large: 0.52, farm: 0.46, fort: 0.44, port: 0.46, capital: 0.5 };

/**
 * Build the meshes for one island. `isl` = { type, r, variant }, `th` = region
 * theme, `q` = graphics quality (low trims vegetation density).
 */
export function buildIsland(isl, th, q = "medium") {
  const prof = PROFILES[isl.type] || PROFILES.medium;
  const sp = shoreParams(isl.variant);
  const r = isl.r;
  const rand = rng(isl.variant * 17 + 3);
  const pal = palette(th);
  const segs = q === "low" ? 26 : q === "high" ? 44 : 36;
  const out = [terrain(r, prof, sp, pal, segs, isl.variant)];
  const cloth = [];
  const glow = th.glow ? [] : null;
  const taken = []; // occupied discs [x, z, rad]
  const H = (x, z) => heightAt(x, z, r, prof, sp);
  const free = (x, z, rad) => taken.every(([tx, tz, tr]) => Math.hypot(x - tx, z - tz) > rad + tr);
  const claim = (x, z, rad) => taken.push([x, z, rad]);
  const polar = (a, s) => {
    const R = r * shoreMul(a, sp) * s;
    return [Math.cos(a) * R, Math.sin(a) * R];
  };
  const rot = sp.rot;
  const pennant = (x, y, z, s0 = 1) => {
    const s = s0 * 1.5;
    out.push(paint(T(cyl(0.008, 0.008, 0.16 * s, 4), x, y + 0.08 * s, z), "#5a4634"));
    const f = new THREE.BufferGeometry();
    f.setAttribute("position", new THREE.Float32BufferAttribute([0, 0.16 * s, 0, 0, 0.09 * s, 0, 0.13 * s, 0.125 * s, 0], 3));
    T(f, x, y, z, 0, rand() * 6, 0);
    f.computeVertexNormals();
    cloth.push(paint(f, "#ffffff"));
  };
  const top = prof.top;

  /* ---- buildings per archetype */
  let flag;
  const at = (a, s) => {
    const [x, z] = polar(rot + a, s);
    return [x, H(x, z), z];
  };
  switch (isl.type) {
    case "small": {
      const [x, y, z] = at(0.6, 0.18);
      const tip = tower(out, x, y, z, 0.42, 0.12, th);
      claim(x, z, 0.2);
      flag = [x, tip[1] - 0.02, z];
      const [hx, hy, hz] = at(2.6, 0.42);
      house(out, hx, hy, hz, rot + 1.2, th, 0.26, 0.22, 0.16);
      claim(hx, hz, 0.22);
      break;
    }
    case "medium": {
      const [x, y, z] = at(0.2, 0.08);
      const tip = tower(out, x, y, z, 0.5, 0.13, th);
      claim(x, z, 0.2);
      flag = [x, tip[1] - 0.02, z];
      for (const [a, s, ry] of [[2.2, 0.45, 0.7], [3.4, 0.42, 2.0], [4.6, 0.46, -0.4]]) {
        const [hx, hy, hz] = at(a, s);
        house(out, hx, hy, hz, rot + ry, th);
        claim(hx, hz, 0.24);
      }
      const [px, py, pz] = at(2.8, 0.2);
      pennant(px, py + 0.05, pz, 0.9);
      break;
    }
    case "large": {
      const [x, y, z] = at(0, 0.05);
      const k = keep(out, x, y, z, 0.42, 0.5, th, rot);
      claim(x, z, 0.36);
      flag = [x, k[1] - 0.02, z];
      for (const [a, s, ry] of [[1.6, 0.5, 0.4], [2.6, 0.55, 1.5], [3.7, 0.5, 2.4], [5.0, 0.52, -0.6]]) {
        const [hx, hy, hz] = at(a, s);
        house(out, hx, hy, hz, rot + ry, th);
        claim(hx, hz, 0.24);
      }
      const [tx, ty, tz] = at(0.9, 0.6);
      const tip = tower(out, tx, ty, tz, 0.48, 0.11, th);
      claim(tx, tz, 0.16);
      pennant(tip[0], tip[1] - 0.03, tip[2]);
      break;
    }
    case "capital": {
      const [x, y, z] = at(0, 0);
      const roof = th.gold || th.roof;
      const k = keep(out, x, y, z, 0.5, 0.78, th, rot);
      out.push(paint(T(cone(0.24, 0.42, 4), x, k[1] + 0.12, z, 0, rot + Math.PI / 4, 0), roof, 0.1, 31));
      claim(x, z, 0.45);
      flag = [x + 0.0, k[1] + 0.3, z];
      const cs = 0.5;
      const corners = [0, 1, 2, 3].map((i) => at(Math.PI / 4 + (i * Math.PI) / 2, cs));
      corners.forEach(([cx, cy, cz], i) => {
        const tip = tower(out, cx, cy, cz, 0.6, 0.13, th, roof);
        pennant(tip[0], tip[1] - 0.03, tip[2]);
        const [nx, ny, nz] = corners[(i + 1) % 4];
        wallSeg(out, cx, cz, nx, nz, Math.min(cy, ny), th, 0.24);
        claim(cx, cz, 0.18);
      });
      for (let i = 0; i < 4; i++) {
        const [a, b] = [corners[i], corners[(i + 1) % 4]];
        claim((a[0] + b[0]) / 2, (a[2] + b[2]) / 2, 0.15);
      }
      for (const [a, s, ry] of [[0.6, 0.66, 0.3], [2.4, 0.68, 1.8], [3.9, 0.66, 2.8], [5.4, 0.67, -0.9]]) {
        const [hx, hy, hz] = at(a, s);
        if (free(hx, hz, 0.2)) {
          house(out, hx, hy, hz, rot + ry, th, 0.28, 0.22, 0.18);
          claim(hx, hz, 0.22);
        }
      }
      break;
    }
    case "fort": {
      const [x, y, z] = at(0, 0.05);
      const k = keep(out, x, y, z, 0.36, 0.56, th, rot);
      claim(x, z, 0.3);
      flag = [x, k[1] - 0.02, z];
      const n = 6;
      const ring = [];
      for (let i = 0; i < n; i++) ring.push(at((i / n) * Math.PI * 2 + 0.3, 0.6));
      ring.forEach(([cx, cy, cz], i) => {
        const [nx, ny, nz] = ring[(i + 1) % n];
        wallSeg(out, cx, cz, nx, nz, Math.min(cy, ny) - 0.02, th, 0.2);
        if (i % 2 === 0) {
          const tip = tower(out, cx, cy - 0.02, cz, 0.36, 0.1, th);
          pennant(tip[0], tip[1] - 0.03, tip[2], 0.85);
        }
        claim(cx, cz, 0.14);
        claim((cx + nx) / 2, (cz + nz) / 2, 0.12);
      });
      break;
    }
    case "farm": {
      const [wx, wy, wz] = at(0.4, 0.3);
      windmill(out, wx, wy, wz, rot + 0.4, th);
      claim(wx, wz, 0.22);
      const [hx, hy, hz] = at(3.5, 0.18);
      house(out, hx, hy, hz, rot + 2.1, th, 0.38, 0.28, 0.22);
      claim(hx, hz, 0.26);
      flag = [hx + 0.12, hy + 0.5, hz];
      out.push(paint(T(cyl(0.012, 0.012, 0.5, 4), flag[0], hy + 0.25, flag[2]), "#5a4634"));
      const wheat = th.snow ? "#d9e4c8" : "#e9c65a";
      const green = th.snow ? "#b8c9a8" : "#8fbf4a";
      for (const [a, s, ry] of [[1.6, 0.45, 0.2], [2.5, 0.55, 0.9], [4.6, 0.48, -0.3], [5.5, 0.4, 0.5]]) {
        const [fx, fy, fz] = at(a, s);
        if (!free(fx, fz, 0.22)) continue;
        field(out, fx, fy, fz, rot + ry, 0.42, 0.34, wheat, green);
        claim(fx, fz, 0.24);
      }
      // fence posts
      for (let i = 0; i < 10; i++) {
        const [fx, fy, fz] = at(1.3 + i * 0.32, 0.7);
        if (free(fx, fz, 0.04)) out.push(paint(T(box(0.025, 0.08, 0.025), fx, fy + 0.04, fz), th.wood));
      }
      break;
    }
    case "port": {
      const da = rot + 1.2;
      // dock planks running out over the water
      const [sx, sz] = polar(da, 0.72);
      const [ex, ez] = polar(da, 1.5);
      const L = Math.hypot(ex - sx, ez - sz);
      const a = Math.atan2(ez - sz, ex - sx);
      out.push(paint(T(box(L, 0.04, 0.2), (sx + ex) / 2, 0.15, (sz + ez) / 2, 0, -a, 0), th.wood, 0.15, 41));
      for (let i = 0; i <= 4; i++) {
        const t = i / 4;
        for (const side of [-1, 1]) {
          const px = sx + (ex - sx) * t + Math.cos(a + Math.PI / 2) * 0.1 * side;
          const pz = sz + (ez - sz) * t + Math.sin(a + Math.PI / 2) * 0.1 * side;
          out.push(paint(T(cyl(0.018, 0.018, 0.5, 5), px, -0.1, pz), C(th.wood).multiplyScalar(0.7)));
        }
      }
      const mx = sx + (ex - sx) * 0.75 + Math.cos(a + Math.PI / 2) * 0.24;
      const mz = sz + (ez - sz) * 0.75 + Math.sin(a + Math.PI / 2) * 0.24;
      moored(out, mx, 0.02, mz, -a + Math.PI / 2, th);
      const [wx, wy, wz] = at(1.2, 0.35);
      house(out, wx, wy, wz, -da + Math.PI / 2, th, 0.44, 0.3, 0.24, C(th.roof).lerp(C(th.wood), 0.5));
      claim(wx, wz, 0.3);
      // crane
      const [cx, cy, cz] = at(0.75, 0.62);
      out.push(paint(T(box(0.04, 0.42, 0.04), cx, cy + 0.21, cz), th.wood));
      out.push(paint(T(box(0.32, 0.03, 0.03), cx + Math.cos(da) * 0.12, cy + 0.42, cz + Math.sin(da) * 0.12, 0, -da, 0), th.wood));
      claim(cx, cz, 0.08);
      // crates
      for (let i = 0; i < 3; i++) {
        const [kx, ky, kz] = at(0.95 + i * 0.12, 0.55 + (i % 2) * 0.08);
        if (free(kx, kz, 0.05)) out.push(paint(T(box(0.07, 0.07, 0.07), kx, ky + 0.035, kz, 0, i, 0), "#a7804f", 0.15, i));
      }
      const [tx, ty, tz] = at(3.6, 0.2);
      const tip = tower(out, tx, ty, tz, 0.44, 0.12, th);
      claim(tx, tz, 0.2);
      flag = [tx, tip[1] - 0.02, tz];
      const [hx, hy, hz] = at(4.9, 0.45);
      house(out, hx, hy, hz, rot + 0.6, th);
      claim(hx, hz, 0.24);
      claim(...polar(da, 0.85), 0.2);
      break;
    }
    default:
      flag = [0, H(0, 0) + 0.4, 0];
  }

  /* ---- flag pole for the main banner */
  const poleH = isl.type === "capital" ? 0.75 : 0.55;
  out.push(paint(T(cyl(0.012, 0.014, poleH, 5), flag[0], flag[1] + poleH / 2, flag[2]), "#6b543c"));
  out.push(paint(T(sph(0.022, 6, 4), flag[0], flag[1] + poleH + 0.01, flag[2]), th.gold || "#d9b45a"));
  const flagTop = [flag[0], flag[1] + poleH, flag[2]];

  /* ---- camp tents (appear as the garrison grows) */
  const tents = [];
  for (let i = 0, tries = 0; tents.length < 4 && tries < 40; tries++) {
    const a = rand() * Math.PI * 2;
    const s = 0.3 + rand() * (top - 0.4);
    const [x, z] = polar(a, s);
    if (!free(x, z, 0.13)) continue;
    claim(x, z, 0.13);
    tents.push([x, H(x, z), z, rand() * Math.PI]);
    i++;
  }

  /* ---- vegetation + rocks */
  const density = q === "low" ? 0.55 : q === "high" ? 1.35 : 1;
  const nTrees = Math.round((isl.type === "fort" ? 3 : isl.type === "farm" ? 5 : isl.type === "capital" ? 6 : 4 + r * 3.2) * density);
  const kinds = [th.tree, th.tree2];
  for (let i = 0, tries = 0; i < nTrees && tries < 80; tries++) {
    const a = rand() * Math.PI * 2;
    const s = isl.type === "fort" || isl.type === "capital" ? top - 0.08 + rand() * 0.04 : 0.25 + rand() * (top - 0.3);
    const [x, z] = polar(a, s);
    if (!free(x, z, 0.12)) continue;
    claim(x, z, 0.12);
    const kind = kinds[rand() < 0.68 ? 0 : 1];
    tree(kind, out, glow, x, H(x, z) - 0.01, z, TREE_H[isl.type] * (0.8 + rand() * 0.45), rand, th);
    i++;
  }
  const nBush = Math.round((3 + r * 2) * density);
  for (let i = 0, tries = 0; i < nBush && tries < 60; tries++) {
    const [x, z] = polar(rand() * Math.PI * 2, 0.2 + rand() * (top - 0.15));
    if (!free(x, z, 0.06)) continue;
    claim(x, z, 0.06);
    bush(out, x, H(x, z), z, 0.05 + rand() * 0.04, rand, th);
    i++;
  }
  // shoreline boulders, some half in the water
  const nRock = Math.round((3 + r * 1.6) * (q === "low" ? 0.6 : 1));
  for (let i = 0; i < nRock; i++) {
    const a = rand() * Math.PI * 2;
    const s = 0.9 + rand() * 0.2;
    const [x, z] = polar(a, s);
    if (isl.type === "port" && Math.abs(((a - rot - 1.2 + Math.PI * 3) % (Math.PI * 2)) - Math.PI) < 0.5) continue;
    rock(out, x, Math.max(-0.12, H(x, z) - 0.05), z, 0.07 + rand() * 0.09, rand, th);
  }
  // snow regions: ice floes drifting near the coast
  if (th.snow) {
    for (let i = 0; i < 3; i++) {
      const [x, z] = polar(rand() * Math.PI * 2, 1.25 + rand() * 0.2);
      out.push(paint(T(dodec(0.12 + rand() * 0.1), x, -0.02, z, 0, rand() * 3, 0, 1.4, 0.35, 1.1), "#eef7ff", 0.06, i));
    }
  }
  if (glow) {
    for (let i = 0; i < 5; i++) {
      const [x, z] = polar(rand() * Math.PI * 2, 0.3 + rand() * (top - 0.3));
      glow.push(paint(T(ico(0.03 + rand() * 0.02, 0), x, H(x, z) + 0.02, z), "#ffffff"));
    }
  }
  // sandy path from the shore to the main building
  if (isl.type !== "fort" && isl.type !== "capital") {
    const pa = rot + 3.9;
    for (let i = 0; i < 6; i++) {
      const s = 0.2 + i * 0.11;
      const [x, z] = polar(pa + Math.sin(i * 1.3) * 0.12, s);
      out.push(paint(T(cyl(0.07, 0.07, 0.012, 7), x, H(x, z) + 0.004, z), C(th.sand).multiplyScalar(0.95), 0.05, i));
    }
  }

  const body = merge(out);
  const clothGeo = merge(cloth);
  const glowGeo = glow && glow.length ? merge(glow) : null;
  const labelY = Math.max(flagTop[1] + 0.35, prof.rings[prof.rings.length - 1][1] + 0.9);
  return { body, cloth: clothGeo, glow: glowGeo, flag: flagTop, tents, labelY, shore: sp };
}
