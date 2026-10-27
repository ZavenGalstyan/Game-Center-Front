/**
 * Iron Arena — builds the visual map from the engine's render items.
 *
 * Each item kind has a small procedural builder returning [material, geometry]
 * parts in item-local space. Parts are transformed to world space, given
 * world-scaled box UVs (unless they carry their own) and merged per material,
 * so a whole map renders in a few dozen draw calls. Foliage sways in the
 * vertex shader; a few animated pieces (radar dishes, holograms, flags,
 * hazard beacons) stay as separate objects with update callbacks.
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { ConvexGeometry } from "three/examples/jsm/geometries/ConvexGeometry.js";
import { texSet, canvasTex } from "./textures.js";
import { rng } from "../engine/util.js";

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const yieldUI = () => new Promise((r) => {
  if (typeof MessageChannel === "undefined") return setTimeout(r, 0);
  const c = new MessageChannel();
  c.port1.onmessage = () => r();
  c.port2.postMessage(0);
});

/* ------------------------------------------------------------------ materials */
function createMaterials(theme, quality, themeId) {
  const ts = quality === "low" ? 256 : 512;
  const cache = {};
  const std = (key, o) => {
    if (cache[key]) return cache[key];
    const t = o.gen ? texSet(o.gen, o.size || ts, o.opts || {}) : null;
    const m = new THREE.MeshStandardMaterial({
      color: o.color || "#ffffff",
      map: t?.map || null,
      normalMap: t && o.normal !== false ? t.normalMap : null,
      roughnessMap: t?.roughnessMap || null,
      roughness: o.roughness ?? 1,
      metalness: o.metalness ?? 0,
      vertexColors: true,
      emissive: o.emissive || "#000000",
      emissiveMap: t?.emissiveMap && o.useEmissive ? t.emissiveMap : null,
      emissiveIntensity: o.emissiveIntensity ?? 1,
      side: o.side || THREE.FrontSide,
      envMapIntensity: o.env ?? 1,
    });
    if (o.normalScale) m.normalScale.set(o.normalScale, o.normalScale);
    m.userData.uv = o.uv ?? 0.25; // UV units per metre for box mapping
    cache[key] = m;
    return m;
  };
  const glow = (key, color, k = 2.2) => {
    if (cache[key]) return cache[key];
    const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), toneMapped: false, vertexColors: true });
    m.userData.uv = 1;
    cache[key] = m;
    return m;
  };
  const wet = theme.wet;
  const defs = {
    concrete: () => std("concrete", { gen: "concrete", opts: { c0: "#b4afa4", c1: "#8a857b", panels: 2 }, uv: 0.22, roughness: 1, metalness: 0 }),
    concreteDark: () => std("concreteDark", { gen: "concrete", opts: { c0: "#7d7a74", c1: "#5a5752", panels: 1 }, uv: 0.3 }),
    metal: () => std("metal", { gen: "metal", opts: { panels: 2 }, color: "#8a8f94", uv: 0.35, metalness: 0.6, roughness: 1 }),
    steel: () => std("steel", { gen: "metal", opts: { panels: 1 }, color: "#c9a23a", uv: 0.4, metalness: 0.5, roughness: 1 }),
    darkmetal: () => std("darkmetal", { gen: "metal", opts: { panels: 3 }, color: "#3c3f44", uv: 0.4, metalness: 0.7, roughness: 1 }),
    corrugated: () => std("corrugated", { gen: "corrugated", opts: { ribs: 16 }, uv: 0.25, metalness: 0.55, roughness: 1 }),
    wood: () => std("wood", { gen: "planks", opts: { c0: "#9a7048", c1: "#6a4a2c", boards: 6 }, uv: 0.33 }),
    darkwood: () => std("darkwood", { gen: "planks", opts: { c0: "#5e4630", c1: "#3a2a1c", boards: 5 }, uv: 0.33 }),
    redwood: () => std("redwood", { gen: "planks", opts: { c0: "#8f3a2a", c1: "#5e2218", boards: 8 }, uv: 0.25 }),
    brick: () => std("brick", { gen: "brick", opts: {}, uv: 0.3 }),
    stone: () => std("stone", { gen: "rock", opts: { c0: "#a09a8e", c1: "#6c675e" }, uv: 0.35 }),
    rock: () => std("rock", { gen: "rock", opts: themeId === "snow" ? { c0: "#8a9098", c1: "#4c525a" } : themeId === "desert" ? { c0: "#c09872", c1: "#86624a" } : { c0: "#8f8b82", c1: "#5a5750" }, uv: 0.32, normalScale: 1.1 }),
    fabric: () => std("fabric", { gen: "fabric", opts: { c0: "#c2ab80" }, uv: 0.6 }),
    canvas: () => std("canvas", { gen: "fabric", opts: { c0: "#7c7a52" }, uv: 0.4 }),
    asphalt: () => std("asphalt", { gen: "asphalt", opts: { c0: "#35373b" }, uv: 0.15, roughness: wet ? 0.45 : 1 }),
    glass: () => std("glass", { color: "#7fa8c8", roughness: 0.05, metalness: 0.9, env: 1.6 }),
    rubber: () => std("rubber", { color: "#222224", roughness: 0.8 }),
    paint: () => std("paint", { gen: "metal", opts: { panels: 1 }, color: "#ffffff", uv: 0.5, metalness: 0.3, roughness: 0.8 }),
    foliage: () => {
      if (cache.foliage) return cache.foliage;
      const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0, side: THREE.DoubleSide, envMapIntensity: 0.5 });
      m.userData.uv = 1;
      m.userData.sway = true;
      cache.foliage = m;
      return m;
    },
    bark: () => std("bark", { gen: "rock", opts: { c0: "#6a5544", c1: "#3c2e24" }, uv: 0.8, normalScale: 1.2 }),
    snowcap: () => std("snowcap", { gen: "snow", opts: {}, uv: 0.3, roughness: 0.9 }),
    facade: () => std("facade", { gen: "facade", opts: { c0: "#262a35", cols: 8, rows: 8, seed: 1 }, uv: 1, roughness: 1, metalness: 0.3, emissive: "#ffffff", useEmissive: true, emissiveIntensity: 0.75 }),
    facade2: () => std("facade2", { gen: "facade", opts: { c0: "#30343e", cols: 6, rows: 10, seed: 7, wA: "#ff9ad8", wB: "#7fe8ff", litChance: 0.45 }, uv: 1, roughness: 1, metalness: 0.4, emissive: "#ffffff", useEmissive: true, emissiveIntensity: 0.7 }),
    facade3: () => std("facade3", { gen: "facade", opts: { c0: "#3a3026", cols: 10, rows: 8, seed: 13, wA: "#ffd28a", wB: "#ffe8c0", litChance: 0.6 }, uv: 1, roughness: 1, metalness: 0.2, emissive: "#ffffff", useEmissive: true, emissiveIntensity: 0.65 }),
    windows: () => std("windows", { gen: "facade", opts: { c0: "#7d7a72", cols: 6, rows: 3, seed: 21, litChance: themeId === "neon" ? 0.6 : 0.2, wA: "#ffe0a8", wB: "#cfe8ff" }, uv: 1, roughness: 1, emissive: "#ffffff", useEmissive: true, emissiveIntensity: themeId === "neon" ? 1.2 : 0.35 }),
    lampGlow: () => glow("lampGlow", themeId === "neon" ? "#ffe2b0" : "#fff2d0", 3),
    neonPink: () => glow("neonPink", "#ff3ad8", 2.6),
    neonCyan: () => glow("neonCyan", "#3ae0ff", 2.6),
    neonAmber: () => glow("neonAmber", "#ffb03a", 2.4),
    neonGreen: () => glow("neonGreen", "#4aff9a", 2.4),
    redGlow: () => glow("redGlow", "#ff2a1a", 2.6),
    hazard: () => {
      if (cache.hazard) return cache.hazard;
      const t = canvasTex("hazard", 128, 128, (g, w, h) => {
        g.fillStyle = "#f2c230";
        g.fillRect(0, 0, w, h);
        g.fillStyle = "#1a1a1a";
        for (let i = -2; i < 6; i++) {
          g.beginPath();
          g.moveTo(i * 32, 0);
          g.lineTo(i * 32 + 16, 0);
          g.lineTo(i * 32 + 16 + h, h);
          g.lineTo(i * 32 + h, h);
          g.fill();
        }
      });
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      const m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.7, vertexColors: true });
      m.userData.uv = 1;
      cache.hazard = m;
      return m;
    },
  };
  const get = (k) => (defs[k] ? defs[k]() : defs.concrete());
  return { get, cache };
}

/* ------------------------------------------------------------------ geometry helpers */
const ni = (g) => (g.index ? g.toNonIndexed() : g);
function colorize(g, rgb) {
  const n = g.attributes.position.count;
  const c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    c[i * 3] = rgb[0];
    c[i * 3 + 1] = rgb[1];
    c[i * 3 + 2] = rgb[2];
  }
  g.setAttribute("color", new THREE.BufferAttribute(c, 3));
  return g;
}
const col3 = (hex) => {
  const c = new THREE.Color(hex);
  return [c.r, c.g, c.b];
};
/** box with its BOTTOM centre at (x, y, z) */
function box(w, h, d, x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(0, h / 2, 0);
  if (rx || rz) g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, 0, rz)));
  if (ry) g.rotateY(ry);
  g.translate(x, y, z);
  return g;
}
function rbox(w, h, d, r, x = 0, y = 0, z = 0, ry = 0, seg = 2) {
  const g = new RoundedBoxGeometry(w, h, d, seg, r);
  g.translate(0, h / 2, 0);
  if (ry) g.rotateY(ry);
  g.translate(x, y, z);
  return g;
}
function cyl(rt, rb, h, x = 0, y = 0, z = 0, seg = 16, rx = 0, rz = 0, open = false) {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg, 1, open);
  g.translate(0, h / 2, 0);
  if (rx || rz) g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, 0, rz)));
  g.translate(x, y, z);
  return g;
}
/** horizontal cylinder along local X (rot = 0) or Z */
function hcyl(r, len, x, y, z, alongZ = false, seg = 14) {
  const g = new THREE.CylinderGeometry(r, r, len, seg);
  if (alongZ) g.rotateX(Math.PI / 2);
  else g.rotateZ(Math.PI / 2);
  g.translate(x, y, z);
  return g;
}
function prism(w, h, d, x = 0, y = 0, z = 0) {
  // triangular roof along z
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0);
  s.lineTo(w / 2, 0);
  s.lineTo(0, h);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false });
  g.translate(x, y, z - d / 2);
  return g;
}
function rockGeo(r, h, seed, detail = 2) {
  const g = new THREE.IcosahedronGeometry(1, detail);
  const R = rng(seed);
  const pos = g.attributes.position;
  const offs = [R() * 10, R() * 10, R() * 10];
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const n = Math.sin(x * 2.3 + offs[0]) * Math.sin(y * 2.9 + offs[1]) * Math.sin(z * 2.1 + offs[2]);
    const n2 = Math.sin(x * 5.1 + offs[1]) * Math.sin(z * 4.7 + offs[2]) * 0.4;
    const k = 1 + n * 0.28 + n2 * 0.12;
    // flatten the bottom, facet the top
    pos.setXYZ(i, x * r * k, Math.max(-0.25, y) * h * 0.62 * k + h * 0.18, z * r * k);
  }
  g.computeVertexNormals();
  return ni(g);
}

/* ------------------------------------------------------------------ foliage */
function addSway(g, base, top) {
  const pos = g.attributes.position;
  const a = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) a[i] = Math.max(0, (pos.getY(i) - base) / Math.max(0.01, top - base));
  g.setAttribute("aSway", new THREE.BufferAttribute(a, 1));
  return g;
}
function pineParts(s, seed, snowy) {
  const R = rng(seed);
  const parts = [];
  const H = 8.5 * s;
  parts.push(["bark", cyl(0.14 * s, 0.32 * s, H * 0.55, 0, 0, 0, 7)]);
  const tiers = 5;
  for (let t = 0; t < tiers; t++) {
    const y = H * (0.22 + t * 0.15);
    const r = 2.1 * s * (1 - t * 0.17);
    const h = 2.4 * s * (1 - t * 0.08);
    const g = ni(new THREE.ConeGeometry(r, h, 9, 2, true));
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const yy = pos.getY(i);
      const j = 1 + (R() - 0.5) * 0.25;
      pos.setXYZ(i, pos.getX(i) * j, yy + (yy < 0 ? (R() - 0.5) * 0.35 * s : 0), pos.getZ(i) * j);
    }
    g.computeVertexNormals();
    g.translate(0, y + h / 2, 0);
    const green = [0.16 + R() * 0.05, 0.3 + R() * 0.08 - t * 0.01, 0.13];
    colorize(g, snowy ? [0.6, 0.66, 0.68] : green);
    if (snowy) {
      // white tips on the upper faces
      const c = g.attributes.color;
      const n = g.attributes.normal;
      for (let i = 0; i < c.count; i++) if (n.getY(i) > 0.25) c.setXYZ(i, 0.92, 0.95, 1.0);
    }
    parts.push(["foliage", addSway(g, 0, H)]);
  }
  return parts;
}
function oakParts(s, seed) {
  const R = rng(seed);
  const parts = [["bark", cyl(0.22 * s, 0.38 * s, 4.2 * s, 0, 0, 0, 8)]];
  for (let k = 0; k < 6; k++) {
    const g = ni(new THREE.IcosahedronGeometry(1.6 * s * (0.7 + R() * 0.5), 1));
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setXYZ(i, pos.getX(i) * (1 + (R() - 0.5) * 0.2), pos.getY(i) * 0.8, pos.getZ(i) * (1 + (R() - 0.5) * 0.2));
    g.computeVertexNormals();
    const a = R() * Math.PI * 2;
    const rr = k === 0 ? 0 : 1.4 * s;
    g.translate(Math.cos(a) * rr, 4.6 * s + R() * 1.6 * s, Math.sin(a) * rr);
    colorize(g, [0.2 + R() * 0.08, 0.36 + R() * 0.1, 0.12]);
    parts.push(["foliage", addSway(g, 0, 7 * s)]);
  }
  return parts;
}
function palmParts(s, seed) {
  const R = rng(seed);
  const parts = [];
  const H = 7 * s;
  const lean = (R() - 0.5) * 0.6;
  let px = 0;
  let pz = 0;
  for (let i = 0; i < 6; i++) {
    const y = (i / 6) * H;
    const nx = lean * (i + 1) * 0.35 * s;
    const g = cyl(0.2 * s * (1 - i * 0.06), 0.24 * s * (1 - i * 0.06), H / 6 + 0.05, px, y, pz, 7);
    parts.push(["bark", g]);
    px = nx;
    pz = nx * 0.3;
  }
  for (let f = 0; f < 9; f++) {
    const a = (f / 9) * Math.PI * 2 + R() * 0.3;
    const len = 3.2 * s;
    const shape = [];
    const pos = [];
    const segs = 6;
    for (let k = 0; k <= segs; k++) {
      const t = k / segs;
      const w = Math.sin(t * Math.PI) * 0.55 * s;
      const yy = H + Math.sin(t * Math.PI * 0.8) * 0.9 * s - t * t * 2.2 * s;
      shape.push([t * len, yy, w]);
    }
    for (let k = 0; k < segs; k++) {
      const [x0, y0, w0] = shape[k];
      const [x1, y1, w1] = shape[k + 1];
      pos.push(x0, y0, -w0, x1, y1, -w1, x1, y1 + 0.05, 0, x0, y0, -w0, x1, y1 + 0.05, 0, x0, y0 + 0.05, 0);
      pos.push(x0, y0 + 0.05, 0, x1, y1 + 0.05, 0, x1, y1, w1, x0, y0 + 0.05, 0, x1, y1, w1, x0, y0, w0);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    g.rotateY(a);
    g.translate(px, 0, pz);
    colorize(g, [0.25 + R() * 0.08, 0.42 + R() * 0.1, 0.14]);
    parts.push(["foliage", addSway(g, H * 0.8, H + 1)]);
  }
  return parts;
}
function bushParts(s, seed, colA = [0.22, 0.38, 0.14], flat = 0.7) {
  const R = rng(seed);
  const parts = [];
  for (let k = 0; k < 3; k++) {
    const g = ni(new THREE.IcosahedronGeometry(0.8 * s * (0.6 + R() * 0.5), 1));
    g.scale(1, flat, 1);
    g.translate((R() - 0.5) * s, 0.35 * s, (R() - 0.5) * s);
    colorize(g, [colA[0] + R() * 0.06, colA[1] + R() * 0.08, colA[2]]);
    parts.push(["foliage", addSway(g, 0, 1.4 * s)]);
  }
  return parts;
}

/* ------------------------------------------------------------------ prop builders */
const TEAMC = ["#3fa9ff", "#ff5245"];
function buildProp(it, ctx) {
  const { theme } = ctx;
  const P = [];
  const add = (mat, g, tint) => {
    if (tint) colorize(g, tint);
    P.push([mat, g]);
  };
  const R = rng(it.seed || Math.floor(Math.abs(it.x * 13 + it.z * 7)) + 1);
  const w = it.w;
  const d = it.d;
  const h = it.h;
  switch (it.kind) {
    /* -------- desert / generic military */
    case "fortwall": {
      add("concrete", box(w, h, d));
      add("concreteDark", box(w + 0.3, 0.35, d + 0.05, 0, h - 0.05));
      for (let z = -d / 2 + 1; z < d / 2 - 0.5; z += 2.6) add("concreteDark", box(w + 0.2, 0.7, 1.2, 0, h + 0.3, z));
      add("concreteDark", box(w + 0.8, 0.5, d, 0, 0));
      break;
    }
    case "tower": {
      const r = it.r;
      add("concrete", cyl(r * 0.85, r, h * 0.62, 0, 0, 0, 18));
      add("concreteDark", cyl(r * 1.15, r * 1.15, 0.5, 0, h * 0.62, 0, 18));
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * Math.PI * 2 + 0.78;
        add("darkmetal", cyl(0.12, 0.12, h * 0.25, Math.cos(a) * r, h * 0.66, Math.sin(a) * r, 6));
      }
      add("metal", cyl(0.2, r * 1.35, h * 0.14, 0, h * 0.88, 0, 12));
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2;
        add("darkmetal", box(0.06, 1.0, 0.06, Math.cos(a) * r * 1.1, h * 0.62 + 0.5, Math.sin(a) * r * 1.1));
      }
      add("darkmetal", cyl(r * 1.12, r * 1.12, 0.06, 0, h * 0.62 + 1.4, 0, 18, 0, 0, true));
      add("concreteDark", box(0.9, 0.5, 0.1, 0, h * 0.4, r * 0.98));
      break;
    }
    case "bunker": {
      add("concrete", new ConvexGeometry([V3(-w / 2, 0, -d / 2), V3(w / 2, 0, -d / 2), V3(-w / 2, 0, d / 2), V3(w / 2, 0, d / 2), V3(-w / 2 + 0.8, h, -d / 2 + 0.8), V3(w / 2 - 0.8, h, -d / 2 + 0.8), V3(-w / 2 + 0.8, h, d / 2 - 0.8), V3(w / 2 - 0.8, h, d / 2 - 0.8)]));
      add("darkmetal", box(w * 0.5, 0.35, 0.3, 0, h * 0.55, d / 2 - 0.45), [0.1, 0.1, 0.1]);
      add("darkmetal", box(0.3, 0.35, d * 0.4, w / 2 - 0.45, h * 0.55, 0), [0.1, 0.1, 0.1]);
      for (let k = 0; k < Math.floor(w / 0.7); k++) add("fabric", rbox(0.62, 0.32, 0.42, 0.12, -w / 2 + 0.9 + k * 0.62, h - 0.05, -d / 2 + 0.95 + (k % 2) * 0.05, R() * 0.2));
      add("metal", box(1.0, 1.8, 0.12, -w / 4, 0, -d / 2 - 0.02), [0.45, 0.45, 0.4]);
      break;
    }
    case "sandbags": {
      const rows = Math.max(2, Math.round(h / 0.33));
      const n = Math.max(2, Math.round(w / 0.62));
      for (let r = 0; r < rows; r++)
        for (let k = 0; k < n - (r % 2); k++) {
          const tone = 0.85 + R() * 0.25;
          add("fabric", rbox(0.64, 0.34, d * 0.9, 0.12, -w / 2 + 0.32 + k * (w / n) + (r % 2) * 0.31, r * 0.32, 0, (R() - 0.5) * 0.12), [tone, tone * 0.97, tone * 0.9]);
        }
      break;
    }
    case "crate": {
      add("wood", box(w, h, d));
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) add("darkwood", box(0.12, h + 0.02, 0.12, (sx * (w - 0.1)) / 2, 0, (sz * (d - 0.1)) / 2));
      add("darkwood", box(w + 0.02, 0.12, d + 0.02, 0, h - 0.1));
      add("darkwood", box(w + 0.02, 0.12, d + 0.02, 0, 0));
      break;
    }
    case "barrel": {
      const c = [[0.55, 0.1, 0.08], [0.15, 0.3, 0.55], [0.3, 0.35, 0.2], [0.75, 0.6, 0.1]][Math.floor(R() * 4)];
      add("paint", cyl(it.r, it.r, h, 0, 0, 0, 14), c);
      for (const y of [h * 0.3, h * 0.7]) add("paint", cyl(it.r + 0.03, it.r + 0.03, 0.06, 0, y, 0, 14), c.map((v) => v * 0.7));
      break;
    }
    case "tent": {
      add("canvas", prism(w, h, d), theme === "desert" ? [1.35, 1.2, 0.95] : [1, 1, 1]);
      add("darkwood", box(0.1, h, 0.1, 0, 0, d / 2 - 0.1));
      add("darkwood", box(0.1, h, 0.1, 0, 0, -d / 2 + 0.1));
      add("darkmetal", box(1.3, h * 0.6, 0.05, 0, 0, d / 2 + 0.02), [0.15, 0.13, 0.1]);
      break;
    }
    case "container": {
      const c = col3(it.color || "#a24b2b");
      add("corrugated", box(w, h, d), c);
      for (const s of [-1, 1]) {
        add("darkmetal", box(w + 0.04, h, 0.12, 0, 0, (s * (d - 0.12)) / 2), c.map((v) => v * 0.8));
        for (let k = 0; k < 4; k++) add("darkmetal", box(0.05, h - 0.3, 0.05, -w / 2 + 0.4 + k * ((w - 0.8) / 3), 0.15, (s * d) / 2 + s * 0.05), [0.35, 0.35, 0.35]);
      }
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) for (const y of [0, h - 0.18]) add("darkmetal", box(0.2, 0.18, 0.2, (sx * (w - 0.18)) / 2, y, (sz * (d - 0.18)) / 2), [0.3, 0.3, 0.3]);
      break;
    }
    case "fueltank": {
      const r = it.r;
      add("paint", cyl(r, r, h * 0.85, 0, 0.3, 0, 20), [0.85, 0.85, 0.82]);
      add("paint", new THREE.SphereGeometry(r, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, h * 0.85 + 0.3, 0).scale(1, 0.4, 1), [0.82, 0.82, 0.8]);
      add("concreteDark", cyl(r + 0.3, r + 0.4, 0.3, 0, 0, 0, 20));
      for (const y of [h * 0.3, h * 0.6]) add("darkmetal", cyl(r + 0.04, r + 0.04, 0.08, 0, y, 0, 20), [0.5, 0.5, 0.5]);
      add("darkmetal", box(0.5, h * 0.9, 0.08, 0, 0.3, r + 0.1), [0.35, 0.35, 0.35]);
      add("redGlow", box(0.25, 0.1, 0.1, 0, h + 0.15, 0));
      break;
    }
    case "oiltank": {
      const r = it.r;
      add("paint", cyl(r, r, h, 0, 0, 0, 28), [0.9, 0.9, 0.88]);
      add("paint", cyl(r * 0.2, r + 0.05, 0.9, 0, h, 0, 28), [0.75, 0.75, 0.74]);
      add("steel", cyl(r + 0.05, r + 0.05, 0.25, 0, h * 0.5, 0, 28), [0.6, 0.15, 0.1]);
      for (let k = 0; k < 14; k++) {
        const a = (k / 14) * Math.PI * 1.5;
        add("darkmetal", box(0.9, 0.08, 0.35, Math.cos(a) * (r + 0.4), (k / 14) * h, Math.sin(a) * (r + 0.4), -a), [0.3, 0.3, 0.3]);
      }
      break;
    }
    case "barrier": {
      const s = new THREE.Shape();
      s.moveTo(-0.32, 0);
      s.lineTo(0.32, 0);
      s.lineTo(0.12, 0.3);
      s.lineTo(0.1, h);
      s.lineTo(-0.1, h);
      s.lineTo(-0.12, 0.3);
      s.closePath();
      const g = new THREE.ExtrudeGeometry(s, { depth: w, bevelEnabled: false });
      g.translate(0, 0, -w / 2);
      g.rotateY(Math.PI / 2);
      add("concrete", g, [0.95, 0.95, 0.93]);
      if (it.glow) add(R() < 0.5 ? "neonCyan" : "neonPink", box(w * 0.9, 0.06, 0.26, 0, h * 0.62));
      else add("hazard", box(w * 0.9, 0.15, 0.25, 0, h * 0.55));
      break;
    }
    case "hesco": {
      const n = Math.max(1, Math.round(w / 1.5));
      for (let k = 0; k < n; k++) {
        add("fabric", box(w / n - 0.05, h, d, -w / 2 + (w / n) * (k + 0.5), 0), [1.05, 0.98, 0.85]);
        for (const y of [0.1, h / 2, h - 0.04]) add("darkmetal", box(w / n, 0.04, d + 0.04, -w / 2 + (w / n) * (k + 0.5), y), [0.4, 0.4, 0.38]);
      }
      break;
    }
    case "wreck": {
      if (it.variant === "truck") {
        add("darkmetal", box(w, h * 0.7, d * 0.3, 0, 0, d * 0.32), [0.25, 0.2, 0.17]);
        add("darkmetal", box(w * 0.95, h * 0.45, d * 0.62, 0, 0.3, -d * 0.18, 0, 0.05, 0.08), [0.3, 0.22, 0.16]);
        for (const z of [d * 0.3, -d * 0.3]) for (const s of [-1, 1]) add("rubber", hcyl(0.45, 0.35, (s * w) / 2, 0.45, z));
      } else {
        add("darkmetal", new ConvexGeometry([V3(-w / 2, 0.4, -d / 2), V3(w / 2, 0.4, -d / 2), V3(-w / 2, 0.4, d / 2), V3(w / 2, 0.4, d / 2), V3(-w / 2 + 0.2, h * 0.65, -d / 2 + 0.3), V3(w / 2 - 0.2, h * 0.65, -d / 2 + 0.3), V3(-w / 2 + 0.2, h * 0.65, d / 2 - 1.2), V3(w / 2 - 0.2, h * 0.65, d / 2 - 1.2)]), [0.22, 0.19, 0.16]);
        add("darkmetal", box(w * 0.55, h * 0.35, d * 0.35, 0.3, h * 0.6, -0.3, 0.6, 0.15, -0.2), [0.2, 0.17, 0.15]);
        add("darkmetal", hcyl(0.12, 3.2, -0.8, h * 0.8, 1.2, true), [0.15, 0.15, 0.15]);
        for (const s of [-1, 1]) add("rubber", box(0.5, 0.8, d, (s * (w - 0.5)) / 2, 0));
      }
      break;
    }
    case "concrete": {
      add("concrete", box(w, h, d));
      add("concreteDark", box(w + 0.6, 0.3, d * 0.95, 0, 0));
      break;
    }
    case "watertower": {
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) add("darkmetal", box(0.25, 6, 0.25, sx * 1.6, 0, sz * 1.6, 0, sz * 0.08, -sx * 0.08), [0.4, 0.4, 0.4]);
      add("paint", cyl(it.r, it.r, h, 0, 6, 0, 18), [0.75, 0.72, 0.65]);
      add("metal", cyl(0.2, it.r + 0.2, 1.2, 0, 6 + h, 0, 18));
      break;
    }
    case "rock": {
      const g = rockGeo(it.r * 1.05, it.h, it.seed || 7);
      const c = theme === "snow" ? [1, 1, 1] : [1, 1, 1];
      add("rock", g, c);
      if (theme === "snow") {
        const cap = rockGeo(it.r * 0.9, it.h * 0.35, (it.seed || 7) + 1, 1);
        cap.translate(0, it.h * 0.55, 0);
        add("snowcap", cap);
      }
      break;
    }
    case "palm":
    case "pine":
    case "oak":
    case "snowpine":
      for (const p of treeParts(it, it.s || 1)) P.push(p);
      break;
    case "shrub":
      for (const p of bushParts(it.s * 0.8, it.seed, [0.42, 0.4, 0.2], 0.55)) P.push(p);
      break;
    case "bush":
      for (const p of bushParts(it.s, it.seed)) P.push(p);
      break;
    case "snowbush":
      for (const p of bushParts(it.s, it.seed, [0.75, 0.8, 0.85], 0.5)) P.push(p);
      break;
    case "fern": {
      for (const p of bushParts(it.s * 0.7, it.seed, [0.18, 0.42, 0.12], 0.35)) P.push(p);
      break;
    }
    case "reeds": {
      for (let k = 0; k < 7; k++) {
        const g = cyl(0.02, 0.04, 1.4 * it.s * (0.7 + R() * 0.5), (R() - 0.5) * 1.2, 0, (R() - 0.5) * 1.2, 4);
        colorize(g, [0.45, 0.5, 0.22]);
        P.push(["foliage", addSway(g, 0, 1.6)]);
      }
      break;
    }
    case "stones":
    case "snowrock": {
      for (let k = 0; k < 3; k++) {
        const g = rockGeo(0.35 * it.s * (0.6 + R()), 0.5 * it.s, (it.seed || 3) + k, 1);
        g.translate((R() - 0.5) * 1.5 * it.s, -0.1, (R() - 0.5) * 1.5 * it.s);
        add(it.kind === "snowrock" ? "rock" : "rock", g, [1, 1, 1]);
        if (it.kind === "snowrock") {
          const c = rockGeo(0.3 * it.s, 0.2 * it.s, (it.seed || 3) + k + 9, 1);
          c.translate(0, 0.2 * it.s, 0);
          add("snowcap", c);
        }
      }
      break;
    }
    case "antenna": {
      add("darkmetal", cyl(0.04, 0.08, 6 * it.s, 0, 0, 0, 6));
      add("redGlow", new THREE.SphereGeometry(0.12, 8, 6).translate(0, 6 * it.s, 0));
      break;
    }
    case "flagpole": {
      add("metal", cyl(0.05, 0.08, 6, 0, 0, 0, 8));
      ctx.flag(it, 6, "#d8c26a");
      break;
    }
    case "radio": {
      add("darkmetal", box(1.2, 1.0, 0.8), [0.3, 0.35, 0.25]);
      add("darkmetal", cyl(0.02, 0.04, 3.5, 0.4, 1, 0.2, 5));
      add("neonGreen", box(0.3, 0.06, 0.02, -0.2, 0.7, 0.41));
      break;
    }
    case "floodlight": {
      add("darkmetal", cyl(0.08, 0.12, 6, 0, 0, 0, 8));
      add("darkmetal", box(1.6, 0.4, 0.4, 0, 6));
      add("lampGlow", box(1.4, 0.25, 0.05, 0, 6.05, 0.21));
      break;
    }
    case "camonet": {
      const g = new THREE.PlaneGeometry(8, 6, 8, 6);
      g.rotateX(-Math.PI / 2);
      const pos = g.attributes.position;
      for (let i = 0; i < pos.count; i++) pos.setY(i, 2.6 + Math.sin(pos.getX(i) * 0.9) * 0.25 + Math.cos(pos.getZ(i) * 1.1) * 0.25 - (Math.abs(pos.getX(i)) > 3.5 ? 0.8 : 0));
      g.computeVertexNormals();
      add("canvas", ni(g), theme === "desert" ? [1.3, 1.15, 0.85] : [0.8, 0.95, 0.7]);
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) add("darkwood", box(0.1, 2.6, 0.1, sx * 3.2, 0, sz * 2.4));
      break;
    }
    case "radar": {
      add("darkmetal", cyl(0.3, 0.4, 1.4, 0, 0, 0, 10));
      ctx.radar(it);
      break;
    }
    case "pylon": {
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) add("darkmetal", box(0.18, 18, 0.18, sx * 1.4, 0, sz * 1.4, 0, -sz * 0.07, sx * 0.07), [0.55, 0.55, 0.55]);
      for (const y of [6, 11, 15]) add("darkmetal", box(6 - y * 0.15, 0.2, 0.3, 0, y), [0.55, 0.55, 0.55]);
      break;
    }
    /* -------- neon city */
    case "kiosk": {
      add("metal", box(w, h, d), [0.3, 0.32, 0.38]);
      add("glass", box(w * 0.8, h * 0.45, 0.05, 0, h * 0.3, d / 2 + 0.01));
      add(R() < 0.5 ? "neonPink" : "neonCyan", box(w + 0.2, 0.25, d + 0.2, 0, h - 0.1));
      add("metal", box(w + 1.2, 0.08, d + 1.2, 0, h + 0.15, 0.3), [0.2, 0.2, 0.25]);
      break;
    }
    case "busstop": {
      add("metal", box(w, 0.08, d, 0, h), [0.3, 0.3, 0.32]);
      for (const x of [-w / 2 + 0.1, w / 2 - 0.1]) add("darkmetal", box(0.1, h, 0.1, x, 0, -d / 2 + 0.1));
      add("glass", box(w, h * 0.8, 0.04, 0, 0.2, -d / 2 + 0.05));
      add("darkmetal", box(w * 0.7, 0.45, 0.4, 0, 0, -d / 2 + 0.4));
      add("neonAmber", box(1.4, 1.8, 0.06, w / 2 - 0.8, 0.4, -d / 2 + 0.1));
      break;
    }
    case "planter": {
      add("concrete", box(w, h, d), [0.85, 0.85, 0.88]);
      for (let k = 0; k < Math.round(w / 1.8); k++) for (const p of bushParts(0.9, (it.seed || 1) + k)) {
        p[1].translate(-w / 2 + 0.9 + k * 1.8, h - 0.1, 0);
        P.push(p);
      }
      break;
    }
    case "monument": {
      add("concrete", cyl(it.r, it.r + 0.3, 1.2, 0, 0, 0, 24), [0.7, 0.72, 0.8]);
      add("darkmetal", cyl(it.r * 0.6, it.r * 0.7, 0.5, 0, 1.2, 0, 24));
      add("neonCyan", cyl(it.r * 0.62, it.r * 0.62, 0.08, 0, 1.72, 0, 24));
      ctx.holo(it);
      break;
    }
    case "lamp": {
      const hh = it.h || 7;
      add("darkmetal", cyl(0.1, 0.16, hh, 0, 0, 0, 8));
      add("darkmetal", box(0.15, 0.12, 1.8, 0, hh - 0.2, 0.8, 0), [0.3, 0.3, 0.32]);
      add("lampGlow", box(0.35, 0.08, 0.9, 0, hh - 0.32, 1.4));
      break;
    }
    case "car": {
      const c = col3(["#c23a2a", "#2a5fc2", "#e8e8e8", "#1a1a1e", "#e0b030", "#3a8a5a", "#7a3ac2"][(it.seed || 1) % 7]);
      add("paint", rbox(w, h * 0.55, d, 0.25, 0, 0.3), c);
      add("glass", new ConvexGeometry([V3(-w / 2 + 0.1, h * 0.8, -d * 0.25), V3(w / 2 - 0.1, h * 0.8, -d * 0.25), V3(-w / 2 + 0.1, h * 0.8, d * 0.15), V3(w / 2 - 0.1, h * 0.8, d * 0.15), V3(-w / 2 + 0.25, h * 1.25, -d * 0.15), V3(w / 2 - 0.25, h * 1.25, -d * 0.15), V3(-w / 2 + 0.25, h * 1.25, d * 0.02), V3(w / 2 - 0.25, h * 1.25, d * 0.02)]));
      for (const z of [-d * 0.32, d * 0.32]) for (const s of [-1, 1]) add("rubber", hcyl(0.34, 0.25, (s * w) / 2, 0.34, z));
      add("lampGlow", box(w * 0.8, 0.1, 0.05, 0, h * 0.62, d / 2 + 0.01));
      add("redGlow", box(w * 0.8, 0.1, 0.05, 0, h * 0.62, -d / 2 - 0.01));
      break;
    }
    case "truck": {
      add("paint", box(w, h * 0.65, d * 0.25, 0, 0.5, d * 0.36), [0.85, 0.85, 0.85]);
      add("glass", box(w * 0.9, h * 0.25, 0.05, 0, h * 0.75, d * 0.49));
      add("corrugated", box(w, h, d * 0.72, 0, 0.5, -d * 0.13), col3(["#e8e8e8", "#2a5fc2", "#c23a2a"][(it.seed || 0) % 3]));
      for (const z of [d * 0.36, -d * 0.1, -d * 0.36]) for (const s of [-1, 1]) add("rubber", hcyl(0.45, 0.35, (s * w) / 2, 0.45, z));
      add("lampGlow", box(w * 0.8, 0.12, 0.05, 0, 0.9, d / 2 + 0.01));
      break;
    }
    /* -------- forest */
    case "cabin": {
      add("darkwood", box(w, h * 0.6, d));
      add("darkwood", prism(w + 0.8, h * 0.45, d + 0.8, 0, h * 0.6, 0).rotateY(0), [0.7, 0.6, 0.55]);
      add("brick", box(0.8, h * 0.55, 0.8, w / 3, h * 0.6, -d / 4));
      add("darkmetal", box(0.9, 1.6, 0.06, 0, 0, d / 2 + 0.02), [0.3, 0.22, 0.15]);
      add("windows", box(1.0, 0.8, 0.06, -w / 3, h * 0.25, d / 2 + 0.02));
      break;
    }
    case "logpile": {
      for (let r = 0; r < 3; r++) for (let k = 0; k < 4 - r; k++) add("bark", hcyl(0.28, w, 0, 0.28 + r * 0.48, -d / 2 + 0.4 + k * 0.56 + r * 0.28, false, 8));
      break;
    }
    case "ruin": {
      const segs = Math.max(1, Math.round(d / 1.4));
      for (let k = 0; k < segs; k++) {
        const hh = h * (0.45 + R() * 0.55);
        add("stone", box(w, hh, d / segs + 0.02, 0, 0, -d / 2 + (d / segs) * (k + 0.5)));
      }
      break;
    }
    case "barn": {
      add("redwood", box(w, h * 0.55, d));
      const s = new THREE.Shape();
      s.moveTo(-w / 2 - 0.4, 0);
      s.lineTo(-w / 2 + 0.6, h * 0.3);
      s.lineTo(0, h * 0.45);
      s.lineTo(w / 2 - 0.6, h * 0.3);
      s.lineTo(w / 2 + 0.4, 0);
      s.closePath();
      const g = new THREE.ExtrudeGeometry(s, { depth: d + 0.6, bevelEnabled: false });
      g.translate(0, h * 0.55, -d / 2 - 0.3);
      add("corrugated", g, [0.35, 0.32, 0.3]);
      add("darkwood", box(w * 0.4, h * 0.45, 0.1, 0, 0, d / 2 + 0.03), [0.9, 0.85, 0.8]);
      break;
    }
    case "silo": {
      add("corrugated", cyl(it.r, it.r, h, 0, 0, 0, 20), [0.75, 0.75, 0.72]);
      add("metal", new THREE.SphereGeometry(it.r, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, h, 0));
      break;
    }
    case "haybale": {
      add("fabric", hcyl(it.r, it.h, 0, it.r, 0, true, 16), [1.15, 1.0, 0.55]);
      break;
    }
    case "cart": {
      add("wood", box(1.6, 0.5, 2.6, 0, 0.6));
      for (const s of [-1, 1]) add("darkwood", hcyl(0.55, 0.12, s * 0.9, 0.55, 0, false, 12));
      break;
    }
    case "stonewall": {
      const n = Math.max(2, Math.round(d / 0.7));
      for (let r = 0; r < 2; r++)
        for (let k = 0; k < n; k++) {
          const g = rockGeo(0.42, 0.7, (it.seed || 3) * 7 + k * 3 + r, 1);
          g.translate((R() - 0.5) * 0.2, r * 0.55 - 0.1, -d / 2 + (k + 0.5) * (d / n));
          add("stone", g);
        }
      break;
    }
    case "log": {
      add("bark", hcyl(w / 2, d, 0, w / 2 - 0.05, 0, true, 10));
      break;
    }
    case "watchtower": {
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) add("darkwood", box(0.3, h * 0.75, 0.3, (sx * w) / 2.4, 0, (sz * d) / 2.4, 0, sz * 0.05, -sx * 0.05));
      add("wood", box(w + 0.6, 0.25, d + 0.6, 0, h * 0.72));
      add("wood", box(w + 0.6, 1.0, 0.1, 0, h * 0.75, (d + 0.6) / 2));
      add("darkwood", prism(w + 1.2, 1.4, d + 1.2, 0, h * 0.75 + 2.2, 0), [0.8, 0.7, 0.6]);
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) add("darkwood", box(0.15, 2.2, 0.15, (sx * (w + 0.4)) / 2, h * 0.75, (sz * (d + 0.4)) / 2));
      break;
    }
    case "post": {
      add("darkwood", cyl(it.r, it.r, h, 0, 0, 0, 8));
      break;
    }
    /* -------- snow base */
    case "hangarwall": {
      add("corrugated", box(w, h, d), [0.72, 0.76, 0.8]);
      add("concrete", box(w + 0.4, 0.8, d, 0, 0));
      break;
    }
    case "hangarroof": {
      // arched roof shell
      const g = new THREE.CylinderGeometry(w / 2, w / 2, d, 24, 1, true, -Math.PI / 2, Math.PI);
      g.rotateX(Math.PI / 2);
      g.scale(1, 0.35, 1);
      add("corrugated", g, [0.62, 0.66, 0.7]);
      add("snowcap", (() => {
        const s = new THREE.CylinderGeometry(w / 2 + 0.05, w / 2 + 0.05, d, 24, 1, true, -Math.PI / 3, (Math.PI * 2) / 3);
        s.rotateX(Math.PI / 2);
        s.scale(1, 0.36, 1);
        return s;
      })());
      break;
    }
    case "control": {
      add("concrete", box(w, h, d), [0.85, 0.87, 0.9]);
      add("windows", box(w * 0.9, h * 0.3, d + 0.06, 0, h * 0.55));
      add("snowcap", box(w + 0.3, 0.25, d + 0.3, 0, h));
      add("darkmetal", box(1.2, 0.8, 1.2, w / 3, h + 0.2, d / 4));
      add("redGlow", box(0.2, 0.2, 0.2, -w / 3, h + 0.25, -d / 3));
      break;
    }
    case "pipe": {
      add("metal", hcyl(h / 2, d, 0, h / 2, 0, true, 12), [0.75, 0.6, 0.3]);
      for (let z = -d / 2 + 1; z < d / 2; z += 3) add("darkmetal", cyl(h / 2 + 0.05, h / 2 + 0.05, 0.2, 0, h / 2, z, 12, Math.PI / 2), [0.4, 0.4, 0.4]);
      break;
    }
    case "pipesupport": {
      add("darkmetal", box(w, h, d), [0.5, 0.5, 0.52]);
      add("darkmetal", box(1.6, 0.2, 0.5, 0, h - 0.6), [0.5, 0.5, 0.52]);
      break;
    }
    case "prefab": {
      add("corrugated", box(w, h, d), [0.85, 0.8, 0.55]);
      add("windows", box(w * 0.6, 1.0, d + 0.06, 0, h * 0.4));
      add("snowcap", box(w + 0.2, 0.25, d + 0.2, 0, h));
      add("darkmetal", box(1.0, 2.1, 0.06, w / 3, 0, d / 2 + 0.03), [0.3, 0.3, 0.3]);
      break;
    }
    case "tunnelwall": {
      add("concrete", box(w, h, d), [0.8, 0.82, 0.85]);
      // lamps on the face that looks into the tunnel (tunnels are centred on x = ±72)
      const inward = Math.sign(Math.round(it.x / 72) * 72 - it.x) * Math.cos(it.rot || 0);
      for (let z = -d / 2 + 2; z < d / 2; z += 5) add("lampGlow", box(0.08, 0.2, 1.2, inward * (w / 2 + 0.05), h - 0.6, z));
      break;
    }
    case "tunnelroof": {
      add("concrete", box(w, h, d), [0.75, 0.78, 0.82]);
      add("snowcap", box(w + 0.6, 0.6, d, 0, h));
      break;
    }
    case "tunnelmouth": {
      add("concreteDark", box(14.5, 1.4, 1.2, 0, 6.6, 0));
      add("hazard", box(13, 0.5, 0.06, 0, 6.2, 0.62));
      break;
    }
    case "hangarframe": {
      for (let k = 0; k <= 4; k++) {
        const z = -it.l / 2 + (k * it.l) / 4;
        for (const s of [-1, 1]) add("steel", box(0.45, it.h, 0.45, (s * it.w) / 2, 0, z), [0.55, 0.6, 0.65]);
      }
      add("lampGlow", box(0.3, 0.15, it.l - 2, 0, it.h - 0.4, 0));
      break;
    }
    /* -------- harbor */
    case "warehouse": {
      add("corrugated", box(w, h, d), [0.55, 0.62, 0.68]);
      add("metal", box(w + 0.6, 0.6, d + 0.6, 0, h), [0.4, 0.42, 0.45]);
      add("windows", box(w * 0.85, 1.2, d + 0.06, 0, h * 0.72));
      for (let k = 0; k < Math.floor(w / 7); k++) add("darkmetal", box(4, 4.5, 0.08, -w / 2 + 3.5 + k * 7, 0, d / 2 + 0.04), [0.6, 0.55, 0.3]);
      break;
    }
    case "traincar": {
      add("corrugated", box(w, h - 0.8, d, 0, 0.8), [0.55, 0.25, 0.15]);
      add("darkmetal", box(w * 0.9, 0.5, d, 0, 0.35));
      for (const z of [-d / 2 + 1.5, d / 2 - 1.5]) for (const s of [-1, 1]) add("darkmetal", hcyl(0.42, 0.2, (s * w) / 2.8, 0.42, z, false, 12));
      break;
    }
    case "forklift": {
      add("paint", box(w, h * 0.5, d * 0.7, 0, 0.3, -0.2), [0.9, 0.65, 0.1]);
      add("darkmetal", box(w * 0.8, 0.08, d * 0.6, 0, h, -0.3));
      for (const s of [-1, 1]) add("darkmetal", box(0.08, h, 0.08, (s * w) / 2.4, 0, d * 0.25));
      add("darkmetal", box(0.15, 0.06, 1.2, 0.3, 0.15, d / 2));
      add("darkmetal", box(0.15, 0.06, 1.2, -0.3, 0.15, d / 2));
      break;
    }
    case "craneleg": {
      add("steel", box(w, h, d), it.small ? [0.6, 0.62, 0.65] : [1, 0.8, 0.3]);
      break;
    }
    case "crane": {
      // portal beams + boom over the water (decor; legs come from craneleg colliders)
      const W = it.w;
      const L = it.l;
      const top = 22;
      for (const z of [-L / 2, L / 2]) add("steel", box(W + 1.4, 1.4, 1.4, 0, top, z));
      for (const x of [-W / 2, W / 2]) add("steel", box(1.4, 1.4, L + 1.4, x, top, 0));
      add("steel", box(2.2, 2.0, L * 0.6, 0, top + 1.4, 0));
      // boom extends seaward along +x
      add("steel", box(42, 1.6, 2.4, 14, top + 3, 0));
      for (let k = 0; k < 8; k++) add("steel", box(0.3, 3, 0.3, -6 + k * 5.5, top + 3, 1.1, 0, 0, 0.4), [0.9, 0.7, 0.25]);
      add("paint", box(3, 2.6, 3, 4, top - 2.8, 0), [0.85, 0.85, 0.85]);
      add("glass", box(2.6, 1.2, 0.06, 4, top - 1.6, 1.52));
      add("darkmetal", box(0.08, 18, 0.08, 18, top - 15, 0));
      add("redGlow", box(0.4, 0.4, 0.4, 34, top + 4.8, 0));
      break;
    }
    case "yardcrane": {
      const top = 15;
      for (const z of [-it.l / 2, it.l / 2]) add("steel", box(it.w + 1, 1.1, 1.1, 0, top, z), [0.6, 0.62, 0.65]);
      for (const x of [-it.w / 2, it.w / 2]) add("steel", box(1.1, 1.1, it.l + 1, x, top, 0), [0.6, 0.62, 0.65]);
      add("paint", box(2.4, 2, 2.4, 3, top - 1.6, 0), [0.9, 0.9, 0.9]);
      add("darkmetal", box(0.06, 9, 0.06, 3, top - 10, 0));
      break;
    }
    case "rails": {
      const L = it.l;
      for (const s of [-1, 1]) add("darkmetal", box(0.12, 0.15, L, s * 0.75, 0.15, 0), [0.6, 0.55, 0.5]);
      for (let z = -L / 2; z < L / 2; z += 0.9) add("darkwood", box(2.4, 0.15, 0.3, 0, 0.02, z));
      break;
    }
    case "bollard": {
      add("darkmetal", cyl(0.25, 0.3, 0.7, 0, 0, 0, 10), [0.25, 0.25, 0.25]);
      add("darkmetal", cyl(0.38, 0.28, 0.15, 0, 0.7, 0, 10), [0.25, 0.25, 0.25]);
      break;
    }
    case "buoy": {
      add("paint", cyl(0.4, 0.9, 2, 0, -0.4, 0, 12), [0.85, 0.2, 0.1]);
      add("redGlow", new THREE.SphereGeometry(0.2, 8, 6).translate(0, 1.8, 0));
      break;
    }
    case "ship": {
      const L = 90;
      const W = 18;
      const hull = new ConvexGeometry([V3(-W / 2, -3, -L / 2 + 4), V3(W / 2, -3, -L / 2 + 4), V3(-W / 2 + 2, -3, L / 2 - 8), V3(W / 2 - 2, -3, L / 2 - 8), V3(-W / 2, 6, -L / 2), V3(W / 2, 6, -L / 2), V3(-W / 2, 6, L / 2 - 10), V3(W / 2, 6, L / 2 - 10), V3(0, 7, L / 2 + 2), V3(0, -2, L / 2)]);
      add("paint", hull, [0.2, 0.25, 0.35]);
      add("paint", box(W - 2, 2, L - 18, 0, 6, -4), [0.65, 0.15, 0.1]);
      add("paint", box(14, 12, 10, 0, 6, -L / 2 + 8), [0.92, 0.92, 0.9]);
      add("windows", box(14.2, 2, 10.2, 0, 14, -L / 2 + 8));
      add("paint", cyl(1.4, 1.6, 6, 0, 18, -L / 2 + 6, 12), [0.85, 0.3, 0.1]);
      for (let k = 0; k < 6; k++) for (let r = 0; r < 2; r++) add("corrugated", box(5, 2.6, 12, -5 + r * 5.2 + (k % 2) * 0.1, 8, -18 + k * 0, 0), col3(["#b5342a", "#2b6fa8", "#d39a2c", "#3e8a4f"][(k + r) % 4]));
      break;
    }
    case "holo": {
      ctx.teamHolo(it);
      break;
    }
    default:
      add("concrete", box(w || 1, h || 1, d || 1));
  }
  return P;
}

function treeParts(it, s) {
  const k = it.kind;
  if (k === "palm") return palmParts(s, it.seed || 1);
  if (k === "oak") return oakParts(s, it.seed || 1);
  if (k === "snowpine") return pineParts(s, it.seed || 1, true);
  return pineParts(s, it.seed || 1, false);
}

/** city skyscraper: own UVs so windows align with each face */
function cityTower(it, ctx, out) {
  const { w, d, h } = it;
  const R = rng((it.seed || 1) * 97 + 3);
  const facade = ["facade", "facade2", "facade3"][(it.seed || 0) % 3];
  const floor = 3.1;
  const tile = 8; // windows per texture tile horizontally
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(0, h / 2, 0);
  const uv = g.attributes.uv;
  const nor = g.attributes.normal;
  const pos = g.attributes.position;
  for (let i = 0; i < uv.count; i++) {
    const nx = Math.abs(nor.getX(i));
    const ny = Math.abs(nor.getY(i));
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    if (ny > 0.5) uv.setXY(i, 0.02, 0.02);
    else uv.setXY(i, (nx > 0.5 ? z : x) / (2.6 * tile), y / (floor * 8));
  }
  out.push([facade, ni(g), true]);
  out.push(["concreteDark", box(w + 0.6, 0.8, d + 0.6, 0, h)]);
  out.push(["concreteDark", box(w + 0.4, 4, d + 0.4, 0, 0)]);
  // shop-front band at street level
  const shop = ["neonPink", "neonCyan", "neonAmber", "neonGreen"][Math.floor(R() * 4)];
  for (const s of [-1, 1]) {
    out.push([shop, box(w * 0.85, 0.18, 0.08, 0, 4.1, (s * (d + 0.42)) / 2)]);
    out.push([shop, box(0.08, 0.18, d * 0.85, (s * (w + 0.42)) / 2, 4.1, 0)]);
  }
  // vertical neon edge strips
  const edge = ["neonPink", "neonCyan", "neonAmber"][Math.floor(R() * 3)];
  for (const [sx, sz] of [[-1, -1], [1, 1]]) out.push([edge, box(0.18, h - 6, 0.18, (sx * w) / 2, 5, (sz * d) / 2)]);
  // rooftop clutter
  for (let k = 0; k < 3; k++) out.push(["metal", box(2 + R() * 2, 1.5 + R(), 2 + R() * 2, (R() - 0.5) * (w - 4), h + 0.8, (R() - 0.5) * (d - 4))]);
  out.push(["darkmetal", cyl(0.1, 0.18, 6 + R() * 8, (R() - 0.5) * w * 0.5, h + 0.8, (R() - 0.5) * d * 0.5, 6)]);
  if (!it.far && (it.sign || R() < 0.45)) ctx.billboard(it, R);
}

/* ------------------------------------------------------------------ decks */
function buildDeck(it, out) {
  const { w, d, ya, yb, thick } = it;
  const k = (yb - ya) / d;
  const mat = it.kind === "woodbridge" || it.kind === "pier" ? "wood" : it.kind === "highway" ? "concrete" : "concrete";
  // slab: a sloped box (convex hull of 8 corners)
  const C = [];
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const top = (ya + yb) / 2 + (k * sz * d) / 2;
      C.push(V3((sx * w) / 2, top, (sz * d) / 2), V3((sx * w) / 2, top - thick, (sz * d) / 2));
    }
  out.push([mat, new ConvexGeometry(C)]);
  if (it.kind === "highway") {
    // asphalt surface + rails + lamps
    const C2 = [];
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) {
        const top = (ya + yb) / 2 + (k * sz * d) / 2 + 0.03;
        C2.push(V3((sx * (w - 0.6)) / 2, top, (sz * d) / 2), V3((sx * (w - 0.6)) / 2, top - 0.05, (sz * d) / 2));
      }
    out.push(["asphalt", new ConvexGeometry(C2)]);
    const n = Math.max(1, Math.floor(d / 6));
    for (let i = 0; i < n; i++) {
      const z = -d / 2 + (i + 0.5) * (d / n);
      const y = (ya + yb) / 2 + k * z + 0.05;
      out.push(["lampGlow", box(0.15, 0.02, 2.2, 0, y, z)]);
    }
  }
  if (it.kind === "platform") {
    for (const sx of [-1, 1]) {
      const C3 = [];
      for (const sz of [-1, 1]) {
        const top = (ya + yb) / 2 + (k * sz * d) / 2 + 0.02;
        C3.push(V3((sx * w) / 2, top, (sz * d) / 2), V3((sx * w) / 2 - sx * 0.6, top, (sz * d) / 2), V3((sx * w) / 2, top - 0.01, (sz * d) / 2), V3((sx * w) / 2 - sx * 0.6, top - 0.01, (sz * d) / 2));
      }
      out.push(["hazard", new ConvexGeometry(C3)]);
    }
  }
  if (it.rails) {
    for (const sx of [-1, 1]) {
      const x = (sx * (w / 2 + 0.25));
      const n = Math.max(2, Math.ceil(d / 2.5));
      for (let i = 0; i <= n; i++) {
        const z = -d / 2 + (i * d) / n;
        const y = (ya + yb) / 2 + k * z;
        out.push([it.kind === "highway" ? "metal" : "darkwood", box(0.18, 1.1, 0.18, x, y, z)]);
      }
      const railTop = [];
      for (const sz of [-1, 1]) {
        const y = (ya + yb) / 2 + (k * sz * d) / 2;
        railTop.push(V3(x - 0.1, y + 0.95, (sz * d) / 2), V3(x + 0.1, y + 0.95, (sz * d) / 2), V3(x - 0.1, y + 1.15, (sz * d) / 2), V3(x + 0.1, y + 1.15, (sz * d) / 2));
      }
      out.push([it.kind === "highway" ? "metal" : "wood", new ConvexGeometry(railTop)]);
      if (it.kind === "highway") {
        const glowRail = [];
        for (const sz of [-1, 1]) {
          const y = (ya + yb) / 2 + (k * sz * d) / 2;
          glowRail.push(V3(x - sx * 0.12, y + 0.55, (sz * d) / 2), V3(x - sx * 0.14, y + 0.55, (sz * d) / 2), V3(x - sx * 0.12, y + 0.62, (sz * d) / 2), V3(x - sx * 0.14, y + 0.62, (sz * d) / 2));
        }
        out.push([sx > 0 ? "neonCyan" : "neonPink", new ConvexGeometry(glowRail)]);
      }
    }
  }
}

/* ------------------------------------------------------------------ main */
export async function buildMapView(map, theme, quality, themeId, onProgress) {
  const mats = createMaterials(theme, quality, themeId);
  const group = new THREE.Group();
  group.name = "map";
  const buckets = new Map();
  const animated = [];
  const extraDispose = [];
  const swayU = { uTime: { value: 0 } };
  const shadowOK = quality !== "low";

  const push = (matKey, g, worldMatrix, keepUV) => {
    let geo = ni(g);
    geo.applyMatrix4(worldMatrix);
    if (!geo.attributes.normal) geo.computeVertexNormals();
    const m = mats.get(matKey);
    if (!keepUV || !geo.attributes.uv) {
      // world-space box UVs (metres × material scale)
      const pos = geo.attributes.position;
      const nor = geo.attributes.normal;
      const s = m.userData.uv ?? 0.25;
      const uv = new Float32Array(pos.count * 2);
      for (let i = 0; i < pos.count; i++) {
        const ax = Math.abs(nor.getX(i));
        const ay = Math.abs(nor.getY(i));
        const az = Math.abs(nor.getZ(i));
        let u;
        let v;
        if (ay >= ax && ay >= az) {
          u = pos.getX(i);
          v = pos.getZ(i);
        } else if (ax >= az) {
          u = pos.getZ(i);
          v = pos.getY(i);
        } else {
          u = pos.getX(i);
          v = pos.getY(i);
        }
        uv[i * 2] = u * s;
        uv[i * 2 + 1] = v * s;
      }
      geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    }
    if (!geo.attributes.color) colorize(geo, [1, 1, 1]);
    for (const k of Object.keys(geo.attributes)) if (!["position", "normal", "uv", "color", "aSway"].includes(k)) geo.deleteAttribute(k);
    if (m.userData.sway && !geo.attributes.aSway) geo.setAttribute("aSway", new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count), 1));
    if (!buckets.has(matKey)) buckets.set(matKey, []);
    buckets.get(matKey).push(geo);
  };

  const ctx = {
    theme: themeId,
    flag(it, poleH, color) {
      const g = new THREE.PlaneGeometry(1.8, 1.1, 8, 1);
      g.translate(0.9, 0, 0);
      const m = new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide, roughness: 0.9 });
      const mesh = new THREE.Mesh(g, m);
      mesh.position.set(it.x, it.y + poleH - 0.6, it.z);
      group.add(mesh);
      const base = g.attributes.position.array.slice();
      animated.push((t) => {
        const p = g.attributes.position;
        for (let i = 0; i < p.count; i++) {
          const x = base[i * 3];
          p.setZ(i, Math.sin(t * 4 + x * 2.2) * 0.15 * x);
        }
        p.needsUpdate = true;
      });
      extraDispose.push(g, m);
    },
    radar(it) {
      const g = new THREE.SphereGeometry(1.6, 16, 8, 0, Math.PI * 2, 0, Math.PI / 3);
      g.rotateX(-Math.PI / 2 - 0.4);
      const m = mats.get("metal");
      const mesh = new THREE.Mesh(colorize(ni(g), [0.85, 0.85, 0.88]), m);
      mesh.position.set(it.x, it.y + 1.6, it.z);
      mesh.castShadow = shadowOK;
      group.add(mesh);
      animated.push((t) => (mesh.rotation.y = t * 0.6));
      extraDispose.push(mesh.geometry);
    },
    holo(it) {
      const holo = new THREE.Group();
      const ringM = new THREE.MeshBasicMaterial({ color: new THREE.Color("#3ae0ff").multiplyScalar(2), transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
      for (let k = 0; k < 3; k++) {
        const r = new THREE.Mesh(new THREE.TorusGeometry(1.4 + k * 0.5, 0.05, 6, 40), ringM);
        r.rotation.x = Math.PI / 2;
        r.position.y = 2.4 + k * 0.7;
        holo.add(r);
      }
      const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.9, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color("#ff4ad8").multiplyScalar(2), transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
      core.position.y = 3.4;
      holo.add(core);
      holo.position.set(it.x, it.y, it.z);
      group.add(holo);
      animated.push((t) => {
        holo.children.forEach((c, i) => {
          if (c === core) {
            c.rotation.y = t * 1.2;
            c.position.y = 3.4 + Math.sin(t * 1.6) * 0.25;
          } else c.rotation.z = t * (0.5 + i * 0.3) * (i % 2 ? -1 : 1);
        });
      });
      holo.traverse((o) => o.isMesh && extraDispose.push(o.geometry));
      extraDispose.push(ringM, core.material);
    },
    teamHolo(it) {
      const c = TEAMC[it.team || 0];
      const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(2), transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
      const ring = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.08, 6, 48), m);
      ring.position.set(it.x, it.y + 6, it.z);
      const shield = new THREE.Mesh(new THREE.CircleGeometry(1.6, 6), m);
      shield.position.copy(ring.position);
      group.add(ring, shield);
      animated.push((t) => {
        ring.rotation.y = t * 0.8;
        shield.rotation.y = -t * 0.5;
      });
      extraDispose.push(ring.geometry, shield.geometry, m);
    },
    billboard(it, R) {
      const names = ["VOLTA", "NOVA-9", "KAIJU", "HELIX", "ORBIT", "ZENTH", "PULSE", "AXION"];
      const name = names[Math.floor(R() * names.length)];
      const hue = ["#ff3ad8", "#3ae0ff", "#ffb03a", "#4aff9a", "#a77bff"][Math.floor(R() * 5)];
      const t = canvasTex("bb-" + name + hue, 512, 192, (g, w, h) => {
        g.fillStyle = "#07060c";
        g.fillRect(0, 0, w, h);
        g.strokeStyle = hue;
        g.lineWidth = 8;
        g.strokeRect(10, 10, w - 20, h - 20);
        g.font = "900 104px Arial Black, Arial, sans-serif";
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.shadowColor = hue;
        g.shadowBlur = 24;
        g.fillStyle = hue;
        g.fillText(name, w / 2, h / 2 + 6);
        g.shadowBlur = 0;
        g.fillStyle = "#ffffff";
        g.fillText(name, w / 2, h / 2 + 6);
      });
      const m = new THREE.MeshBasicMaterial({ map: t, toneMapped: false, color: new THREE.Color(1.7, 1.7, 1.7) });
      const bw = Math.min(it.w, it.d) * 0.8;
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(bw, bw * 0.375), m);
      // face the side that looks toward the map centre
      const toC = Math.atan2(-it.x, -it.z);
      const faceX = Math.abs(Math.sin(toC)) > Math.abs(Math.cos(toC));
      const nx = faceX ? Math.sign(-it.x) : 0;
      const nz = faceX ? 0 : Math.sign(-it.z);
      mesh.position.set(it.x + nx * (it.w / 2 + 0.3), it.y + it.h * (0.55 + R() * 0.3), it.z + nz * (it.d / 2 + 0.3));
      mesh.rotation.y = Math.atan2(nx, nz);
      group.add(mesh);
      extraDispose.push(mesh.geometry, m);
    },
  };

  /* ---------------------------------------------------------------- items */
  const items = map.items;
  const M4 = new THREE.Matrix4();
  const Q = new THREE.Quaternion();
  const UP = new THREE.Vector3(0, 1, 0);
  let n = 0;
  for (const it of items) {
    if (it.invisible) continue;
    if (it.kind === "stack" || it.kind === "quay" || it.kind === "rail") continue;
    if (quality === "low" && it.decor && ["stones", "fern", "reeds", "snowrock", "shrub"].includes(it.kind)) continue;
    const rot = it.rot || 0;
    Q.setFromAxisAngle(UP, rot);
    if (it.tilt) Q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), it.tilt));
    M4.compose(new THREE.Vector3(it.x, it.y, it.z), Q, new THREE.Vector3(1, 1, 1));
    if (it.deck) {
      const parts = [];
      buildDeck(it, parts);
      for (const [mk, g] of parts) push(mk, g, M4, false);
    } else if (it.kind === "tower" && themeId === "neon") {
      const parts = [];
      cityTower(it, ctx, parts);
      for (const [mk, g, keep] of parts) push(mk, g, M4, keep);
    } else if (it.kind === "tree") {
      for (const [mk, g] of treeParts(it, it.s || 1)) push(mk, g, M4, false);
    } else {
      for (const [mk, g] of buildProp(it, ctx)) push(mk, g, M4, false);
    }
    if (++n % 40 === 0) {
      onProgress?.(n / items.length);
      await yieldUI();
    }
  }

  /* ---------------------------------------------------------------- merge */
  const meshes = [];
  for (const [mk, list] of buckets) {
    const m = mats.get(mk);
    const merged = mergeGeometries(list);
    for (const g of list) g.dispose();
    if (!merged) continue;
    merged.computeBoundingSphere();
    if (m.userData.sway && !m.userData.swayPatched) {
      m.userData.swayPatched = true;
      m.onBeforeCompile = (sh) => {
        sh.uniforms.uTime = swayU.uTime;
        sh.vertexShader = sh.vertexShader
          .replace("#include <common>", "#include <common>\nattribute float aSway;\nuniform float uTime;")
          .replace("#include <begin_vertex>", "#include <begin_vertex>\nfloat sw = aSway * aSway;\ntransformed.x += sin(uTime * 1.3 + transformed.z * 0.07 + transformed.x * 0.05) * 0.22 * sw;\ntransformed.z += cos(uTime * 1.1 + transformed.x * 0.06) * 0.16 * sw;");
      };
      m.customProgramCacheKey = () => "ia-sway";
    }
    const mesh = new THREE.Mesh(merged, m);
    const isGlow = m.isMeshBasicMaterial;
    mesh.castShadow = shadowOK && !isGlow && mk !== "lampGlow";
    mesh.receiveShadow = !isGlow;
    mesh.name = "props-" + mk;
    group.add(mesh);
    meshes.push(mesh);
  }

  return {
    group,
    meshes,
    update(t) {
      swayU.uTime.value = t;
      for (const f of animated) f(t);
    },
    dispose() {
      for (const m of meshes) m.geometry.dispose();
      for (const x of extraDispose) x.dispose?.();
      for (const m of Object.values(mats.cache)) m.dispose();
      group.removeFromParent();
    },
  };
}
