/**
 * Zombie Outbreak — prop models, built from primitives with procedural
 * textures. Each builder returns a THREE.Group in the solid's local frame
 * (origin at the footprint centre on the ground, length along local Z) so it
 * can be dropped at the solid's (x, z, rot). Anything that animates is tagged
 * userData.dynamic so the static merge in environment.js leaves it alone.
 */
import * as THREE from "three";
import { std, basic, boxUV } from "./materials.js";
import * as T from "./textures.js";
import { createRng } from "../engine/math.js";

const G = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 16),
  cyl8: new THREE.CylinderGeometry(1, 1, 1, 8),
  sph: new THREE.SphereGeometry(1, 12, 10),
  cone: new THREE.ConeGeometry(1, 1, 12),
  torus: new THREE.TorusGeometry(1, 0.38, 8, 16),
  dodec: new THREE.DodecahedronGeometry(1, 0),
  plane: new THREE.PlaneGeometry(1, 1),
};
for (const g of Object.values(G)) g.userData.shared = true;

export function mesh(geom, material, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(geom, material);
  m.position.set(x, y, z);
  m.scale.set(sx, sy, sz);
  m.rotation.set(rx, ry, rz);
  return m;
}

const M = {
  tire: () => std("tire", { color: "#151515", roughness: 0.9 }),
  rim: () => std("rim", { color: "#6d6f73", roughness: 0.4, metalness: 0.7 }),
  glass: () => std("carglass", { color: "#2a3644", roughness: 0.12, metalness: 0.35 }),
  chrome: () => std("chrome", { color: "#9a9ca0", roughness: 0.3, metalness: 0.9 }),
  dark: () => std("darkplastic", { color: "#1c1c1e", roughness: 0.75 }),
  rust: () => std("rust", { color: "#5a3420", roughness: 0.95 }),
  concrete: () => std("concrete-prop", { color: "#8b8984", map: T.concreteTex("#8a8883", "c-prop"), roughness: 0.95 }),
  metal: () => std("metal-prop", { color: "#585d63", roughness: 0.55, metalness: 0.6 }),
  black: () => std("black", { color: "#0d0d0e", roughness: 0.8 }),
};

function carPaint(color, burnt) {
  if (burnt) return std("burnt", { color: "#1b1715", roughness: 1 });
  return std(`paint-${color}`, { color, roughness: 0.45, metalness: 0.35 });
}

/* ------------------------------------------------------------------ vehicles */

export function buildCar(s) {
  const g = new THREE.Group();
  const { w, d, h } = s;
  const kind = s.kind || "sedan";
  const rng = createRng(Math.round((s.x * 13 + s.z * 7) * 100));
  const paint = carPaint(s.color, s.burnt);
  const wr = kind === "bus" || kind === "truck" ? 0.52 : kind === "jeep" ? 0.42 : 0.34;
  const clear = wr * 0.7;
  // Wheels (one flat at random → the car sits slightly crooked).
  const flat = rng.int(0, 5);
  const wheelZ = kind === "bus" ? [d * 0.36, -d * 0.3] : kind === "truck" ? [d * 0.36, -d * 0.22, -d * 0.36] : [d * 0.32, -d * 0.32];
  let wi = 0;
  for (const wz of wheelZ) {
    for (const side of [-1, 1]) {
      const sink = wi === flat ? 0.12 : 0;
      g.add(mesh(G.cyl, M.tire(), side * (w / 2 - 0.12), wr - sink, wz, wr, 0.26, wr, 0, 0, Math.PI / 2));
      g.add(mesh(G.cyl8, M.rim(), side * (w / 2 - 0.02), wr - sink, wz, wr * 0.55, 0.04, wr * 0.55, 0, 0, Math.PI / 2));
      wi++;
    }
  }
  if (kind === "bus") {
    g.add(mesh(G.box, paint, 0, clear + (h - clear) / 2, 0, w, h - clear, d));
    // Window strip + black lower band.
    g.add(mesh(G.box, M.glass(), 0, h * 0.68, 0, w + 0.02, h * 0.3, d * 0.92));
    g.add(mesh(G.box, M.dark(), 0, clear + 0.15, 0, w + 0.03, 0.3, d + 0.03));
    g.add(mesh(G.box, M.glass(), 0, h * 0.58, d / 2 + 0.01, w * 0.9, h * 0.45, 0.04));
    g.add(mesh(G.box, std("bus-sign", { color: "#ffb02e", emissive: "#3a2400", roughness: 0.6 }), 0, h * 0.9, d / 2 + 0.02, w * 0.7, 0.25, 0.04));
  } else if (kind === "truck") {
    // Cab + cargo box.
    const cabD = 2.2;
    g.add(mesh(G.box, paint, 0, clear + 0.9, d / 2 - cabD / 2, w, 1.8, cabD));
    g.add(mesh(G.box, M.glass(), 0, clear + 1.45, d / 2 - 0.25, w * 0.9, 0.6, 0.5));
    g.add(mesh(G.box, s.burnt ? paint : std("truckbox", { color: "#8a8478", roughness: 0.8 }), 0, clear + (h - clear) / 2 + 0.05, -cabD / 2 + 0.1, w * 1.02, h - clear, d - cabD - 0.1));
    g.add(mesh(G.box, M.dark(), 0, clear, 0, w * 0.9, 0.2, d));
  } else {
    const bodyH = kind === "van" ? h - clear - 0.1 : (h - clear) * 0.5;
    g.add(mesh(G.box, paint, 0, clear + bodyH / 2, 0, w, bodyH, d));
    if (kind === "van") {
      g.add(mesh(G.box, M.glass(), 0, clear + bodyH * 0.7, d / 2 - 0.05, w * 0.92, bodyH * 0.35, 0.12));
      g.add(mesh(G.box, M.glass(), 0, clear + bodyH * 0.72, d * 0.2, w + 0.02, bodyH * 0.25, d * 0.25));
    } else if (kind === "jeep") {
      g.add(mesh(G.box, M.glass(), 0, clear + bodyH + 0.3, d * 0.12, w * 0.9, 0.55, 0.06, -0.3, 0, 0));
      for (const sx of [-1, 1]) g.add(mesh(G.box, paint, sx * (w / 2 - 0.08), clear + bodyH + 0.45, -d * 0.15, 0.08, 0.9, 0.08));
      g.add(mesh(G.box, paint, 0, clear + bodyH + 0.88, -d * 0.15, w, 0.08, 0.08));
      g.add(mesh(G.cyl, M.tire(), 0, clear + bodyH * 0.6, -d / 2 - 0.15, 0.36, 0.22, 0.36, Math.PI / 2, 0, 0));
    } else {
      // Cabin: glass greenhouse + roof.
      const cabH = (h - clear) * 0.46;
      const cabD = d * (kind === "hatch" ? 0.56 : 0.48);
      const cz = kind === "hatch" ? -d * 0.1 : -d * 0.04;
      g.add(mesh(G.box, M.glass(), 0, clear + bodyH + cabH / 2, cz, w * 0.84, cabH, cabD));
      g.add(mesh(G.box, paint, 0, clear + bodyH + cabH, cz, w * 0.82, 0.07, cabD * 0.92));
      // Hood / trunk crease.
      g.add(mesh(G.box, paint, 0, clear + bodyH + 0.02, d * 0.33, w * 0.96, 0.06, d * 0.3, -0.06, 0, 0));
    }
    // Bumpers + lights.
    g.add(mesh(G.box, M.dark(), 0, clear + 0.12, d / 2 + 0.03, w * 1.01, 0.22, 0.1));
    g.add(mesh(G.box, M.dark(), 0, clear + 0.12, -d / 2 - 0.03, w * 1.01, 0.22, 0.1));
    for (const sx of [-1, 1]) {
      g.add(mesh(G.box, std("headlight", { color: "#c9c5b8", roughness: 0.2, metalness: 0.2 }), sx * w * 0.36, clear + bodyH * 0.7, d / 2 + 0.01, w * 0.18, 0.12, 0.04));
      g.add(mesh(G.box, std("taillight", { color: "#5a0d0d", emissive: "#2a0000", roughness: 0.3 }), sx * w * 0.38, clear + bodyH * 0.7, -d / 2 - 0.01, w * 0.14, 0.12, 0.04));
    }
    if (kind === "police") {
      g.add(mesh(G.box, std("police-door", { color: "#121418", roughness: 0.5 }), 0, clear + bodyH * 0.5, 0, w + 0.02, bodyH * 0.55, d * 0.42));
      const bar = mesh(G.box, std("lightbar-r", { color: "#ff2020", emissive: "#ff1010", emissiveIntensity: 1.2 }), -0.25, h + 0.05, -d * 0.04, 0.45, 0.12, 0.22);
      const bar2 = mesh(G.box, std("lightbar-b", { color: "#2050ff", emissive: "#1030ff", emissiveIntensity: 1.2 }), 0.25, h + 0.05, -d * 0.04, 0.45, 0.12, 0.22);
      bar.userData.dynamic = "siren-r";
      bar2.userData.dynamic = "siren-b";
      g.add(bar, bar2);
    }
    if (kind === "taxi") g.add(mesh(G.box, std("taxi-sign", { color: "#f4d35e", emissive: "#3a2c00", roughness: 0.5 }), 0, h + 0.1, -d * 0.04, 0.6, 0.18, 0.25));
  }
  // Doors left open on some.
  if (kind !== "bus" && kind !== "truck" && rng.chance(0.35) && !s.burnt) {
    const door = mesh(G.box, paint, w / 2 + 0.45, clear + 0.55, d * 0.08, 0.06, 0.75, 1.0, 0, 0.9, 0);
    g.add(door);
  }
  return g;
}

/* ------------------------------------------------------------------ buildings */

export function buildBuilding(s, facing) {
  const g = new THREE.Group();
  const { w, d, h } = s;
  const color = s.color || "#5b3b30";
  const style = s.style || "brick";
  const facTex = T.facadeTex(style === "shop" ? "concrete" : style === "brick" ? "brick" : "concrete", color);
  const facMat = std(`facade-${style}-${color}`, { map: facTex, roughness: 0.92 });
  const geo = boxUV(new THREE.BoxGeometry(w, h, d), w, h, d, 20, 19.2);
  g.add(mesh(geo, facMat, 0, h / 2, 0));
  // Ground-floor band.
  const bandH = style === "shop" ? 4.2 : 1.1;
  const bandMat =
    style === "shop"
      ? std(`shopfront-${color}`, { map: T.shopfrontTex(s.sign || "shop", "#3d3a36"), roughness: 0.7, metalness: 0.1 })
      : std("plinth", { map: T.concreteTex("#4a4845", "plinth"), roughness: 0.95 });
  const bandGeo = boxUV(new THREE.BoxGeometry(w + 0.16, bandH, d + 0.16), w + 0.16, bandH, d + 0.16, style === "shop" ? 5 : 4, style === "shop" ? 4.2 : 4);
  g.add(mesh(bandGeo, bandMat, 0, bandH / 2, 0));
  // Cornice + parapet.
  g.add(mesh(G.box, std("cornice", { color: "#3a3734", roughness: 0.9 }), 0, h + 0.25, 0, w + 0.4, 0.5, d + 0.4));
  // Rooftop clutter for the skyline.
  const rng = createRng(Math.round(s.x * 31 + s.z * 17));
  for (let i = 0; i < 3; i++) {
    const rx = rng.range(-w / 3, w / 3);
    const rz = rng.range(-d / 3, d / 3);
    if (rng.chance(0.5)) {
      g.add(mesh(G.cyl, std("watertank", { color: "#4a3a2e", roughness: 0.9 }), rx, h + 1.9, rz, 1.1, 2.2, 1.1));
      for (const lx of [-0.7, 0.7]) g.add(mesh(G.box, M.metal(), rx + lx, h + 0.4, rz, 0.1, 0.8, 0.1));
    } else g.add(mesh(G.box, M.metal(), rx, h + 0.7, rz, rng.range(1.2, 2.4), 1.2, rng.range(1, 2)));
  }
  // Street-facing details: awning, sign, fire escape.
  const fx = facing[0];
  const fz = facing[1];
  const halfFace = fx !== 0 ? w / 2 : d / 2;
  const along = fx !== 0 ? d : w;
  const place = (obj, off, y, out) => {
    // `off` along the facade, `out` distance in front of it.
    if (fx !== 0) obj.position.set(fx * (halfFace + out), y, off);
    else obj.position.set(off, y, fz * (halfFace + out));
    obj.rotation.y = fx !== 0 ? (fx > 0 ? Math.PI / 2 : -Math.PI / 2) : fz > 0 ? 0 : Math.PI;
    g.add(obj);
    return obj;
  };
  if (style === "shop") {
    const aw = new THREE.Group();
    const awMat = std(`awning-${s.signColor || "#7a2a22"}`, { color: new THREE.Color(s.signColor || "#7a2a22").multiplyScalar(0.55), roughness: 0.9, side: THREE.DoubleSide });
    for (let k = 0; k < Math.floor(along / 6); k++) {
      const seg = mesh(G.box, awMat, 0, 0, 0, 4.4, 0.06, 1.6, 0.42, 0, 0);
      seg.position.set(-along / 2 + 3 + k * 6, 0, 0.6);
      aw.add(seg);
    }
    place(aw, 0, 4.3, 0.1);
  }
  if (s.sign) {
    const sm = std(`sign-${s.sign}`, { map: T.signTex(s.sign, s.signColor || "#ff4d5e"), emissive: "#ffffff", emissiveMap: T.signTex(s.sign, s.signColor || "#ff4d5e"), emissiveIntensity: 0.9, roughness: 0.6 });
    const sign = mesh(G.box, sm, 0, 0, 0, 5.2, 1.3, 0.12);
    // Box UVs repeat the texture on every face; that's fine for a thin sign.
    place(sign, along * 0.12, style === "shop" ? 5.6 : 7.5, 0.12);
  }
  if (style === "brick" && h > 8) {
    const fe = new THREE.Group();
    const iron = std("iron", { color: "#1a1a1b", roughness: 0.7, metalness: 0.5 });
    for (let y = 4; y < h - 1; y += 3.2) {
      fe.add(mesh(G.box, iron, 0, y, 0.55, 4, 0.08, 1.1));
      fe.add(mesh(G.box, iron, 0, y + 0.5, 1.1, 4, 0.05, 0.05));
      fe.add(mesh(G.box, iron, 0, y + 1.5, 0.55, 3.8, 0.06, 0.4, 0, 0, 0.62));
    }
    for (const sx of [-2, 2]) fe.add(mesh(G.box, iron, sx, h / 2 + 1.5, 1.1, 0.06, h - 4, 0.06));
    place(fe, -along * 0.22, 0, 0);
  }
  return g;
}

/* ------------------------------------------------------------------ street furniture */

export function buildPole(s, armDir) {
  const g = new THREE.Group();
  const iron = std("lamp-iron", { color: "#26292d", roughness: 0.6, metalness: 0.6 });
  g.add(mesh(G.cyl8, iron, 0, s.h / 2, 0, 0.09, s.h, 0.09));
  g.add(mesh(G.cyl8, iron, 0, 0.3, 0, 0.16, 0.6, 0.16));
  g.add(mesh(G.box, iron, armDir * 0.6, s.h - 0.15, 0, 1.3, 0.08, 0.08));
  g.add(mesh(G.box, iron, armDir * 1.15, s.h - 0.3, 0, 0.55, 0.22, 0.3));
  return g;
}

export function buildBarrier(s) {
  const g = new THREE.Group();
  const shape = new THREE.Shape();
  shape.moveTo(-0.3, 0);
  shape.lineTo(0.3, 0);
  shape.lineTo(0.12, 0.3);
  shape.lineTo(0.1, s.h);
  shape.lineTo(-0.1, s.h);
  shape.lineTo(-0.12, 0.3);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: s.w, bevelEnabled: false });
  geo.translate(0, 0, -s.w / 2);
  // Extrusion runs along Z; the solid's length is its local X.
  const m = mesh(geo, std("barrier", { color: "#a9a59b", map: T.concreteTex("#a8a49a", "barrier"), roughness: 0.95 }), 0, 0, 0, 1, 1, 1, 0, Math.PI / 2, 0);
  g.add(m);
  g.add(mesh(G.box, std("barrier-stripe", { map: T.hazardTex(), roughness: 0.8 }), 0, s.h * 0.62, 0.13, s.w * 0.9, 0.16, 0.02, -0.08, 0, 0));
  return g;
}

export function buildSandbags(s) {
  const g = new THREE.Group();
  const rng = createRng(Math.round(s.x * 11 + s.z * 5));
  const bag = std("sandbag", { color: "#8a7a58", roughness: 1 });
  const bag2 = std("sandbag2", { color: "#76694c", roughness: 1 });
  const n = Math.max(2, Math.round(s.w / 0.56));
  const rows = Math.round(s.h / 0.24);
  for (let r = 0; r < rows; r++) {
    for (let i = 0; i < n; i++) {
      const x = -s.w / 2 + (i + 0.5 + (r % 2) * 0.5) * (s.w / n);
      if (x > s.w / 2) continue;
      for (const zz of [-s.d * 0.22, s.d * 0.22]) {
        g.add(mesh(G.sph, rng.chance(0.5) ? bag : bag2, x, 0.12 + r * 0.24, zz + rng.range(-0.03, 0.03), 0.3, 0.13, 0.22, 0, rng.range(-0.15, 0.15), 0));
      }
    }
  }
  return g;
}

export function buildDumpster(s) {
  const g = new THREE.Group();
  const green = std("dumpster", { color: "#2f4a35", roughness: 0.7, metalness: 0.3 });
  g.add(mesh(G.box, green, 0, 0.7, 0, s.w, 1.1, s.d));
  g.add(mesh(G.box, M.dark(), 0, 1.3, -0.15, s.w + 0.05, 0.06, s.d * 0.7, 0.5, 0, 0));
  g.add(mesh(G.box, M.rust(), 0, 0.12, 0, s.w * 0.9, 0.2, s.d * 0.9));
  return g;
}

export function buildContainer(s) {
  const g = new THREE.Group();
  const stack = s.stack || 1;
  const m = std(`container-${s.color}`, { color: s.color || "#7a2d22", map: T.containerTex(), roughness: 0.7, metalness: 0.35 });
  for (let k = 0; k < stack; k++) {
    const geo = boxUV(new THREE.BoxGeometry(s.w, 2.55, s.d), s.w, 2.55, s.d, 6, 2.6);
    g.add(mesh(geo, k === 0 ? m : std(`container-${s.color}-${k}`, { color: new THREE.Color(s.color || "#7a2d22").offsetHSL(0.08 * k, 0, 0.04), map: T.containerTex(), roughness: 0.7, metalness: 0.35 }), 0, 1.3 + k * 2.6, 0));
    // Door bars on the ends.
    for (const ez of [-1, 1]) for (const bx of [-0.5, -0.2, 0.2, 0.5]) g.add(mesh(G.box, M.metal(), bx * s.w * 0.8, 1.3 + k * 2.6, ez * (s.d / 2 + 0.02), 0.04, 2.3, 0.04));
  }
  return g;
}

export function buildCrates(s) {
  const g = new THREE.Group();
  const rng = createRng(Math.round(s.x * 9 + s.z * 3));
  const m = std("crate", { map: T.crateTex(), roughness: 0.9 });
  const n = Math.max(1, Math.round(s.h / Math.min(s.w, 1.4)));
  const size = s.h / n;
  for (let k = 0; k < n; k++) g.add(mesh(G.box, m, rng.range(-0.05, 0.05), size / 2 + k * size, rng.range(-0.05, 0.05), Math.min(s.w, size * 1.02), size, Math.min(s.d, size * 1.02), 0, rng.range(-0.2, 0.2), 0));
  return g;
}

export function buildShelf(s) {
  const g = new THREE.Group();
  const rng = createRng(Math.round(s.x * 7 + s.z * 13));
  const orange = std("rack-orange", { color: "#c4621d", roughness: 0.6, metalness: 0.3 });
  const blue = std("rack-blue", { color: "#2c4d7a", roughness: 0.6, metalness: 0.3 });
  const long = s.d >= s.w;
  const L = long ? s.d : s.w;
  const W = long ? s.w : s.d;
  const bays = Math.max(1, Math.round(L / 2.7));
  const levels = Math.max(2, Math.round(s.h / 1.4));
  const grp = new THREE.Group();
  for (let b = 0; b <= bays; b++) {
    const z = -L / 2 + (b * L) / bays;
    for (const x of [-W / 2 + 0.05, W / 2 - 0.05]) grp.add(mesh(G.box, blue, x, s.h / 2, z, 0.08, s.h, 0.08));
  }
  for (let l = 1; l <= levels; l++) {
    const y = (l * s.h) / levels - 0.05;
    for (const x of [-W / 2 + 0.05, W / 2 - 0.05]) grp.add(mesh(G.box, orange, x, y, 0, 0.08, 0.12, L));
    if (l < levels || rng.chance(0.5)) {
      for (let b = 0; b < bays; b++) {
        if (rng.chance(0.25)) continue;
        const z = -L / 2 + ((b + 0.5) * L) / bays;
        const bh = rng.range(0.5, 1.0);
        const crate = rng.chance(0.5);
        grp.add(mesh(G.box, crate ? std("crate", { map: T.crateTex(), roughness: 0.9 }) : std("cardboard", { color: "#9a7b52", roughness: 0.95 }), rng.range(-0.1, 0.1), y + 0.06 + bh / 2 - (l === levels ? 0 : 0), z + rng.range(-0.2, 0.2), W * 0.8, bh, (L / bays) * 0.75, 0, rng.range(-0.1, 0.1), 0));
      }
    }
  }
  // Pallet base level.
  grp.add(mesh(G.box, std("pallet", { color: "#6b5133", roughness: 1 }), 0, 0.07, 0, W * 0.9, 0.14, L * 0.98));
  if (!long) grp.rotation.y = Math.PI / 2;
  g.add(grp);
  return g;
}

export function buildMachine(s) {
  const g = new THREE.Group();
  const body = std("machine", { color: "#4f5a4c", roughness: 0.6, metalness: 0.5 });
  const yel = std("machine-yel", { color: "#b8901f", roughness: 0.6, metalness: 0.4 });
  g.add(mesh(G.box, body, 0, s.h * 0.4, 0, s.w, s.h * 0.8, s.d));
  g.add(mesh(G.box, yel, 0, s.h * 0.85, 0, s.w * 0.6, s.h * 0.3, s.d * 0.6));
  g.add(mesh(G.cyl, M.metal(), s.w * 0.3, s.h * 0.95, s.d * 0.2, 0.18, s.h * 0.4, 0.18));
  g.add(mesh(G.cyl, M.metal(), -s.w * 0.25, s.h * 0.6, s.d / 2 + 0.1, 0.25, 0.3, 0.25, Math.PI / 2, 0, 0));
  g.add(mesh(G.box, std("panel-green", { color: "#0e1f12", emissive: "#2aff6a", emissiveIntensity: 0.25 }), s.w * 0.25, s.h * 0.55, s.d / 2 + 0.01, s.w * 0.25, 0.25, 0.02));
  g.add(mesh(G.box, std("barrier-stripe", { map: T.hazardTex(), roughness: 0.8 }), 0, 0.08, 0, s.w + 0.04, 0.16, s.d + 0.04));
  return g;
}

export function buildWall(s) {
  const g = new THREE.Group();
  let m;
  const style = s.style || "plaster";
  if (style === "metal") m = std(`metalwall-${s.color || "x"}`, { map: T.metalWallTex(s.color || "#4c5156"), roughness: 0.6, metalness: 0.4 });
  else if (style === "concrete") m = std(`concwall-${s.color || "x"}`, { map: T.concreteTex(s.color || "#6a6964", "wall"), roughness: 0.95 });
  else if (style === "brick") m = std(`brickwall-${s.color || "x"}`, { map: T.facadeTex("brick", s.color || "#5b3b30"), roughness: 0.92 });
  else if (style === "lab") m = std("labwall", { map: T.plasterTex("#b9c0c4", "lab", "#2f3b44"), roughness: 0.6, metalness: 0.15 });
  else m = std(`plaster-${s.color || "x"}`, { map: T.plasterTex(s.color || "#a49d8c", "hosp", s.band || "#4d6b66"), roughness: 0.9 });
  const tile = style === "brick" ? 20 : 4;
  const geo = boxUV(new THREE.BoxGeometry(s.w, s.h, s.d), s.w, s.h, s.d, tile, style === "brick" ? 19.2 : s.h);
  g.add(mesh(geo, m, 0, s.h / 2, 0));
  return g;
}

export function buildGlass(s) {
  const g = new THREE.Group();
  const frame = std("glassframe", { color: "#3a4045", roughness: 0.4, metalness: 0.7 });
  const glass = std("glasswall", { color: "#9fd0e0", transparent: true, opacity: 0.16, roughness: 0.05, metalness: 0.5, depthWrite: false });
  const long = s.w >= s.d;
  const L = long ? s.w : s.d;
  const gm = mesh(G.box, glass, 0, s.h / 2, 0, long ? s.w : s.d * 0.3, s.h - 0.1, long ? s.d * 0.3 : s.d);
  gm.userData.dynamic = "glass";
  g.add(gm);
  const n = Math.max(1, Math.round(L / 2));
  for (let i = 0; i <= n; i++) {
    const t = -L / 2 + (i * L) / n;
    g.add(mesh(G.box, frame, long ? t : 0, s.h / 2, long ? 0 : t, 0.08, s.h, 0.08));
  }
  g.add(mesh(G.box, frame, 0, 0.05, 0, long ? L : 0.12, 0.1, long ? 0.12 : L));
  g.add(mesh(G.box, frame, 0, s.h - 0.05, 0, long ? L : 0.12, 0.1, long ? 0.12 : L));
  return g;
}

export function buildTank(s) {
  const g = new THREE.Group();
  const r = Math.min(s.w, s.d) / 2;
  const metal = M.metal();
  g.add(mesh(G.cyl, metal, 0, 0.2, 0, r, 0.4, r));
  g.add(mesh(G.cyl, metal, 0, s.h - 0.2, 0, r, 0.4, r));
  const liquid = mesh(G.cyl, std(`tank-liquid-${s.color || "g"}`, { color: s.color || "#3bdc57", emissive: s.color || "#3bdc57", emissiveIntensity: 0.55, roughness: 0.3, transparent: true, opacity: 0.85 }), 0, (s.h - 0.4) * 0.45 + 0.4, 0, r * 0.86, (s.h - 0.8) * 0.9, r * 0.86);
  liquid.userData.dynamic = "liquid";
  g.add(liquid);
  const glass = mesh(G.cyl, std("tank-glass", { color: "#b8e6f0", transparent: true, opacity: 0.18, roughness: 0.05, depthWrite: false }), 0, s.h / 2, 0, r * 0.95, s.h - 0.8, r * 0.95);
  glass.userData.dynamic = "glass";
  g.add(glass);
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + 0.4;
    g.add(mesh(G.box, metal, Math.cos(a) * r * 0.97, s.h / 2, Math.sin(a) * r * 0.97, 0.08, s.h, 0.08));
  }
  g.add(mesh(G.cyl8, metal, 0, s.h + 0.6, 0, 0.12, 1.2, 0.12));
  return g;
}

export function buildConsole(s) {
  const g = new THREE.Group();
  const body = std("console", { color: "#2b3036", roughness: 0.5, metalness: 0.5 });
  g.add(mesh(G.box, body, 0, s.h / 2, 0, s.w, s.h, s.d));
  const scr = mesh(G.box, std("screen", { color: "#06121a", emissive: "#2a9ec0", emissiveIntensity: 0.4 }), 0, s.h + 0.3, -s.d * 0.2, s.w * 0.8, 0.5, 0.05, -0.25, 0, 0);
  scr.userData.dynamic = "screen";
  g.add(scr);
  g.add(mesh(G.box, std("keys", { color: "#141618", roughness: 0.6 }), 0, s.h + 0.02, s.d * 0.1, s.w * 0.7, 0.04, s.d * 0.4));
  return g;
}

export function buildBed(s) {
  const g = new THREE.Group();
  const frame = std("bedframe", { color: "#8d9396", roughness: 0.4, metalness: 0.6 });
  const sheet = std("sheet", { color: "#c9c6bb", map: T.clothTex(), roughness: 0.95 });
  const long = s.d >= s.w;
  const L = long ? s.d : s.w;
  const W = long ? s.w : s.d;
  const grp = new THREE.Group();
  grp.add(mesh(G.box, frame, 0, 0.5, 0, W, 0.08, L));
  grp.add(mesh(G.box, sheet, 0, 0.62, 0.05, W * 0.95, 0.16, L * 0.92));
  grp.add(mesh(G.box, sheet, 0, 0.75, L * 0.38, W * 0.6, 0.12, 0.35));
  for (const x of [-W / 2 + 0.05, W / 2 - 0.05]) for (const z of [-L / 2 + 0.05, L / 2 - 0.05]) grp.add(mesh(G.cyl8, frame, x, 0.25, z, 0.03, 0.5, 0.03));
  grp.add(mesh(G.box, frame, 0, 0.85, L / 2 - 0.02, W, 0.7, 0.05));
  if (!long) grp.rotation.y = Math.PI / 2;
  g.add(grp);
  return g;
}

export function buildDesk(s) {
  const g = new THREE.Group();
  const top = std("desk", { color: "#6d5a45", roughness: 0.8 });
  const base = std("desk-base", { color: "#4c4f52", roughness: 0.6, metalness: 0.4 });
  g.add(mesh(G.box, base, 0, s.h / 2 - 0.03, 0, s.w * 0.96, s.h - 0.06, s.d * 0.96));
  g.add(mesh(G.box, top, 0, s.h - 0.03, 0, s.w + 0.06, 0.06, s.d + 0.06));
  return g;
}

export function buildLocker(s) {
  const g = new THREE.Group();
  const m = std("locker", { color: "#5b6b70", roughness: 0.5, metalness: 0.6 });
  g.add(mesh(G.box, m, 0, s.h / 2, 0, s.w, s.h, s.d));
  const n = Math.max(1, Math.round(Math.max(s.w, s.d) / 0.5));
  const long = s.w >= s.d;
  for (let i = 0; i < n; i++) {
    const t = -Math.max(s.w, s.d) / 2 + (i + 0.5) * (Math.max(s.w, s.d) / n);
    g.add(mesh(G.box, M.dark(), long ? t : s.w / 2 + 0.005, s.h * 0.75, long ? s.d / 2 + 0.005 : t, long ? 0.2 : 0.01, 0.05, long ? 0.01 : 0.2));
  }
  return g;
}

export function buildGeneric(s) {
  const g = new THREE.Group();
  switch (s.tag) {
    case "hydrant":
      g.add(mesh(G.cyl, std("hydrant", { color: "#a3241c", roughness: 0.5, metalness: 0.3 }), 0, 0.35, 0, 0.13, 0.7, 0.13));
      g.add(mesh(G.sph, std("hydrant", {}), 0, 0.72, 0, 0.14, 0.1, 0.14));
      g.add(mesh(G.cyl8, std("hydrant", {}), 0, 0.5, 0, 0.06, 0.4, 0.06, 0, 0, Math.PI / 2));
      break;
    case "busstop": {
      const fr = std("busstop", { color: "#2d3237", roughness: 0.5, metalness: 0.6 });
      for (const z of [-s.d / 2 + 0.1, s.d / 2 - 0.1]) g.add(mesh(G.box, fr, -s.w / 2 + 0.1, s.h / 2, z, 0.08, s.h, 0.08));
      g.add(mesh(G.box, fr, 0, s.h, 0, s.w, 0.08, s.d));
      const gl = mesh(G.box, std("stopglass", { color: "#8fb0c0", transparent: true, opacity: 0.22, roughness: 0.1, depthWrite: false }), -s.w / 2 + 0.1, s.h / 2 + 0.2, 0, 0.03, s.h - 0.6, s.d - 0.2);
      gl.userData.dynamic = "glass";
      g.add(gl);
      g.add(mesh(G.box, fr, 0, 0.45, 0, 0.4, 0.06, s.d * 0.8));
      break;
    }
    case "planter":
      g.add(mesh(G.box, M.concrete(), 0, s.h / 2, 0, s.w, s.h, s.d));
      for (let i = 0; i < 4; i++) g.add(mesh(G.dodec, std("deadbush", { color: "#3a3424", roughness: 1 }), (i - 1.5) * 0.2, s.h + 0.25, ((i % 2) - 0.5) * 0.3, 0.28, 0.35, 0.28));
      break;
    case "barrel":
      g.add(mesh(G.cyl, std(`barrel-${s.color || "x"}`, { color: s.color || "#3a5a3a", roughness: 0.6, metalness: 0.4 }), 0, s.h / 2, 0, s.w / 2, s.h, s.w / 2));
      for (const y of [0.25, 0.5, 0.75]) g.add(mesh(G.cyl, M.dark(), 0, s.h * y, 0, s.w / 2 + 0.01, 0.04, s.w / 2 + 0.01));
      break;
    case "bunker":
      g.add(mesh(boxUV(new THREE.BoxGeometry(s.w, s.h, s.d), s.w, s.h, s.d, 4), std("bunker", { map: T.concreteTex("#6e6c63", "bunker"), roughness: 0.95 }), 0, s.h / 2, 0));
      g.add(mesh(G.box, M.black(), 0, s.h * 0.7, s.d / 2 + 0.01, s.w * 0.6, 0.25, 0.04));
      g.add(mesh(G.box, std("bunker-top", { color: "#5d5b53", roughness: 1 }), 0, s.h + 0.15, 0, s.w + 0.3, 0.3, s.d + 0.3));
      break;
    case "towerleg":
      g.add(mesh(G.box, std("towerwood", { color: "#4b3a28", roughness: 0.95 }), 0, s.h / 2, 0, s.w, s.h, s.d));
      break;
    case "fence": {
      const long = s.w >= s.d;
      const L = long ? s.w : s.d;
      const post = std("fencepost", { color: "#3a3e42", roughness: 0.5, metalness: 0.6 });
      const meshTex = T.chainTex().clone();
      meshTex.repeat.set(L / 0.8, s.h / 0.8);
      meshTex.needsUpdate = true;
      const net = mesh(G.plane, std(`chain-${Math.round(L * 10)}-${s.h}`, { color: "#9aa0a6", map: meshTex, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.6, metalness: 0.5 }), 0, s.h / 2, 0, L, s.h, 1, 0, long ? 0 : Math.PI / 2, 0);
      g.add(net);
      for (let t = -L / 2; t <= L / 2 + 0.01; t += 3) g.add(mesh(G.cyl8, post, long ? t : 0, s.h / 2, long ? 0 : t, 0.05, s.h, 0.05));
      g.add(mesh(G.cyl8, post, 0, s.h, 0, 0.03, L, 0.03, long ? 0 : Math.PI / 2, 0, long ? Math.PI / 2 : 0));
      break;
    }
    case "deck":
    case "roof": {
      const m = std(`deck-${s.color}`, { color: s.color || "#3a3e3a", roughness: 0.9, metalness: s.tag === "roof" ? 0.4 : 0 });
      g.add(mesh(G.box, m, 0, s.h / 2, 0, s.w, s.h, s.d));
      if (s.tag === "roof") for (let x = -s.w / 2 + 2; x < s.w / 2; x += 4) g.add(mesh(G.box, M.metal(), x, -0.25, 0, 0.3, 0.5, s.d));
      break;
    }
    case "vending":
      g.add(mesh(G.box, std(`vend-${s.color}`, { color: s.color, roughness: 0.5, metalness: 0.3 }), 0, s.h / 2, 0, s.w, s.h, s.d));
      g.add(mesh(G.box, std("vend-glass", { color: "#0c1a22", emissive: "#2a6a8a", emissiveIntensity: 0.4, roughness: 0.1 }), -s.w / 2 - 0.01, s.h * 0.6, 0, 0.02, s.h * 0.6, s.d * 0.7));
      break;
    case "cabinet":
      g.add(mesh(G.box, std(`cab-${s.color}`, { color: s.color || "#7a8288", roughness: 0.5, metalness: 0.5 }), 0, s.h / 2, 0, s.w, s.h, s.d));
      for (const y of [0.3, 0.6, 0.85]) g.add(mesh(G.box, M.dark(), s.w / 2 + 0.005, s.h * y, 0, 0.01, 0.04, s.d * 0.3));
      break;
    case "counter":
      g.add(mesh(G.box, std("counter", { color: "#7a7d80", roughness: 0.5, metalness: 0.2 }), 0, s.h / 2, 0, s.w, s.h, s.d));
      g.add(mesh(G.box, std("counter-top", { color: "#d8d4c8", roughness: 0.4 }), 0, s.h, 0, s.w + 0.1, 0.05, s.d + 0.1));
      break;
    case "server":
      g.add(mesh(G.box, std("server", { color: "#15181c", roughness: 0.5, metalness: 0.4 }), 0, s.h / 2, 0, s.w, s.h, s.d));
      {
        const led = mesh(G.box, std("server-led", { color: "#001a08", emissive: "#24ff7a", emissiveIntensity: 0.8 }), 0, s.h * 0.6, s.d / 2 + 0.01, s.w * 0.7, s.h * 0.6, 0.01);
        led.userData.dynamic = "screen";
        g.add(led);
        const led2 = mesh(G.box, std("server-led", {}), 0, s.h * 0.6, -s.d / 2 - 0.01, s.w * 0.7, s.h * 0.6, 0.01);
        g.add(led2);
      }
      break;
    case "pillar":
      g.add(mesh(boxUV(new THREE.BoxGeometry(s.w, s.h, s.d), s.w, s.h, s.d, 4), std(`pillar-${s.color || "x"}`, { map: T.concreteTex(s.color || "#77746c", "pillar"), roughness: 0.9 }), 0, s.h / 2, 0));
      g.add(mesh(G.box, std("barrier-stripe", { map: T.hazardTex(), roughness: 0.8 }), 0, 0.6, 0, s.w + 0.03, 1.2, s.d + 0.03));
      break;
    case "forklift": {
      const y = std("forklift", { color: "#d6a21a", roughness: 0.5, metalness: 0.3 });
      g.add(mesh(G.box, y, 0, 0.7, 0, s.w, 0.9, s.d * 0.7));
      g.add(mesh(G.box, M.dark(), 0, 1.6, -s.d * 0.1, s.w * 0.9, 0.06, s.d * 0.5));
      for (const x of [-1, 1]) g.add(mesh(G.box, M.dark(), x * s.w * 0.42, 1.2, -s.d * 0.1, 0.06, 1.0, 0.06));
      g.add(mesh(G.box, M.metal(), 0, 1.3, s.d / 2 - 0.1, s.w * 0.7, 2.4, 0.1));
      for (const x of [-0.3, 0.3]) g.add(mesh(G.box, M.metal(), x, 0.15, s.d / 2 + 0.5, 0.12, 0.06, 1.1));
      for (const z of [-0.6, 0.5]) for (const x of [-1, 1]) g.add(mesh(G.cyl, M.tire(), x * s.w * 0.45, 0.28, z, 0.28, 0.2, 0.28, 0, 0, Math.PI / 2));
      break;
    }
    default: {
      // Unknown tag: a plain, textured block.
      const m = std(`generic-${s.color || s.tag}`, { color: s.color || "#55524c", map: T.concreteTex("#888", "generic"), roughness: 0.9 });
      g.add(mesh(G.box, m, 0, s.h / 2, 0, s.w, s.h, s.d));
    }
  }
  return g;
}

/* ------------------------------------------------------------------ decor */

export function buildDecor(d, rngSeed = 1) {
  const g = new THREE.Group();
  const rng = createRng(Math.round(d.x * 19 + d.z * 23) + rngSeed);
  const s = d.s || 1;
  switch (d.tag) {
    case "rubble": {
      const cm = std("rubble", { color: "#6d6a63", map: T.concreteTex("#77746c", "rubble"), roughness: 1 });
      const bm = std("brickchunk", { color: "#6a3b2c", roughness: 1 });
      for (let i = 0; i < 9; i++) {
        const r = rng.range(0.12, 0.38) * s;
        g.add(mesh(G.dodec, rng.chance(0.3) ? bm : cm, rng.range(-0.8, 0.8) * s, r * 0.4, rng.range(-0.6, 0.6) * s, r, r * 0.6, r * rng.range(0.8, 1.3), rng.range(0, 3), rng.range(0, 3), 0));
      }
      for (let i = 0; i < 3; i++) g.add(mesh(G.cyl8, M.rust(), rng.range(-0.6, 0.6) * s, 0.15, rng.range(-0.4, 0.4) * s, 0.015, rng.range(0.6, 1.2), 0.015, rng.range(-1.3, 1.3), 0, rng.range(-1, 1)));
      break;
    }
    case "tire":
      g.add(mesh(G.torus, M.tire(), 0, 0.12, 0, 0.3, 0.3, 0.32, Math.PI / 2, 0, 0));
      break;
    case "trash": {
      const bag = std("trashbag", { color: "#121314", roughness: 0.35, metalness: 0.1 });
      for (let i = 0; i < 3; i++) g.add(mesh(G.sph, bag, rng.range(-0.5, 0.5), 0.22, rng.range(-0.4, 0.4), rng.range(0.28, 0.4), rng.range(0.2, 0.3), rng.range(0.25, 0.35), 0, rng.range(0, 3), 0));
      g.add(mesh(G.box, std("cardboard", { color: "#9a7b52", roughness: 0.95 }), 0.6, 0.15, 0.2, 0.5, 0.3, 0.4, 0, 0.6, 0.2));
      break;
    }
    case "papers": {
      const pm = std("paper", { color: "#7d796e", roughness: 1, side: THREE.DoubleSide });
      for (let i = 0; i < 6; i++) g.add(mesh(G.plane, pm, rng.range(-1.2, 1.2), 0.012 + i * 0.001, rng.range(-1.2, 1.2), 0.16, 0.21, 1, -Math.PI / 2, 0, rng.range(0, 3)));
      break;
    }
    case "stain": {
      const st = mesh(G.plane, std("stain", { color: "#2a0605", transparent: true, opacity: 0.75, alphaMap: T.decalTex("splat"), roughness: 0.3, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }), 0, 0.015, 0, 1.4 * s, 1.4 * s, 1, -Math.PI / 2, 0, rng.range(0, 6));
      g.add(st);
      break;
    }
    case "cone":
      g.add(mesh(G.cone, std("cone", { color: "#e2561b", roughness: 0.6 }), 0, 0.35, 0, 0.18, 0.7, 0.18));
      g.add(mesh(G.box, std("cone-base", { color: "#1a1a1a", roughness: 0.8 }), 0, 0.02, 0, 0.42, 0.04, 0.42));
      g.add(mesh(G.cyl, std("cone-stripe", { color: "#e8e8e8", roughness: 0.5 }), 0, 0.42, 0, 0.11, 0.08, 0.11));
      break;
    case "manhole":
      g.add(mesh(G.cyl, std("manhole", { color: "#2a2a2c", roughness: 0.5, metalness: 0.7 }), 0, 0.01, 0, 0.42, 0.02, 0.42));
      break;
    case "puddle": {
      const pm = std("puddle", { color: "#0b0e14", roughness: 0.02, metalness: 0.8, transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 });
      g.add(mesh(G.cyl, pm, 0, 0.012, 0, 1.4 * s, 0.01, 0.9 * s, 0, rng.range(0, 3), 0));
      break;
    }
    case "pipe": {
      g.add(mesh(G.cyl, std("pipe", { color: "#5b6168", roughness: 0.5, metalness: 0.6 }), 0, d.y || 4, 0, d.r || 0.15, d.len || 6, d.r || 0.15, 0, 0, Math.PI / 2));
      break;
    }
    case "catwalk": {
      const iron = std("catwalk", { color: "#2b2e31", roughness: 0.6, metalness: 0.6 });
      const L = d.len || 12;
      const y = d.y || 4.5;
      g.add(mesh(G.box, std("catwalk-floor", { map: T.metalFloorTex(), roughness: 0.6, metalness: 0.5 }), 0, y, 0, 1.6, 0.08, L));
      for (const x of [-0.8, 0.8]) {
        g.add(mesh(G.box, iron, x, y + 1.0, 0, 0.05, 0.05, L));
        g.add(mesh(G.box, iron, x, y + 0.5, 0, 0.03, 0.03, L));
      }
      for (let k = -L / 2; k <= L / 2; k += 3) for (const x of [-0.8, 0.8]) g.add(mesh(G.box, iron, x, y + 0.5, k, 0.05, 1.0, 0.05));
      break;
    }
    case "chairs": {
      const seat = std("chair", { color: d.color || "#3b5a6e", roughness: 0.6 });
      const n = d.n || 4;
      for (let i = 0; i < n; i++) {
        const tipped = rng.chance(0.25);
        const c = new THREE.Group();
        c.add(mesh(G.box, seat, 0, 0.45, 0, 0.48, 0.06, 0.46));
        c.add(mesh(G.box, seat, 0, 0.75, -0.21, 0.48, 0.55, 0.05));
        for (const x of [-0.2, 0.2]) for (const z of [-0.2, 0.2]) c.add(mesh(G.cyl8, M.metal(), x, 0.22, z, 0.02, 0.45, 0.02));
        c.position.set((i - (n - 1) / 2) * 0.55, 0, 0);
        if (tipped) {
          c.rotation.set(Math.PI / 2, 0, rng.range(-0.5, 0.5));
          c.position.y = 0.25;
        }
        g.add(c);
      }
      break;
    }
    case "curtain": {
      const cm = std("curtain", { color: "#7d9a92", roughness: 1, side: THREE.DoubleSide, transparent: true, opacity: 0.92 });
      g.add(mesh(G.plane, cm, 0, 1.4, 0, d.len || 2.5, 2.2, 1));
      g.add(mesh(G.box, M.metal(), 0, 2.55, 0, d.len || 2.5, 0.04, 0.04));
      break;
    }
    case "gurney": {
      const fr = std("bedframe", { color: "#8d9396", roughness: 0.4, metalness: 0.6 });
      g.add(mesh(G.box, fr, 0, 0.8, 0, 0.7, 0.06, 2.0));
      g.add(mesh(G.box, std("sheet", { color: "#c9c6bb", map: T.clothTex(), roughness: 0.95 }), 0, 0.88, 0, 0.66, 0.1, 1.9));
      for (const x of [-0.3, 0.3]) for (const z of [-0.9, 0.9]) g.add(mesh(G.cyl8, fr, x, 0.4, z, 0.025, 0.8, 0.025));
      break;
    }
    case "cart": {
      const fr = std("cart", { color: "#a9aeb2", roughness: 0.4, metalness: 0.6 });
      g.add(mesh(G.box, fr, 0, 0.5, 0, 0.6, 0.04, 0.45));
      g.add(mesh(G.box, fr, 0, 0.9, 0, 0.6, 0.04, 0.45));
      g.add(mesh(G.box, std("monitor", { color: "#0a0f10", emissive: "#1dff9a", emissiveIntensity: 0.4 }), 0, 1.15, 0, 0.4, 0.3, 0.06));
      for (const x of [-0.27, 0.27]) for (const z of [-0.2, 0.2]) g.add(mesh(G.cyl8, fr, x, 0.45, z, 0.015, 0.9, 0.015));
      break;
    }
    case "barrels": {
      const colors = ["#2f4f2f", "#5a2e1d", "#2c3e5c", "#6b5a1d"];
      for (let i = 0; i < (d.n || 3); i++) {
        const c = colors[rng.int(0, 3)];
        const tipped = rng.chance(0.2);
        const b = mesh(G.cyl, std(`barrel-${c}`, { color: c, roughness: 0.6, metalness: 0.4 }), rng.range(-0.6, 0.6), tipped ? 0.3 : 0.45, rng.range(-0.6, 0.6), 0.3, 0.9, 0.3, tipped ? Math.PI / 2 : 0, rng.range(0, 3), 0);
        g.add(b);
      }
      break;
    }
    case "tent": {
      const tm = std("tent", { color: "#4f553b", roughness: 1, side: THREE.DoubleSide });
      const L = d.len || 4;
      for (const sgn of [-1, 1]) g.add(mesh(G.plane, tm, sgn * 0.9, 1.0, 0, 2.3, L, 1, -Math.PI / 2, sgn * 0.85, Math.PI / 2));
      break;
    }
    case "warnsign": {
      const p = std("signpost", { color: "#2b2e31", roughness: 0.6, metalness: 0.5 });
      g.add(mesh(G.cyl8, p, 0, 1.0, 0, 0.04, 2, 0.04));
      g.add(mesh(G.box, std(`warnsign-${d.text || "x"}`, { map: T.signTex(d.text || "DANGER", d.color || "#ffcc00"), roughness: 0.6, emissive: "#222", emissiveMap: T.signTex(d.text || "DANGER", d.color || "#ffcc00") }), 0, 1.8, 0, 1.2, 0.32, 0.04));
      break;
    }
    case "bones": {
      const bm = std("bone", { color: "#cfc6a8", roughness: 0.8 });
      for (let i = 0; i < 5; i++) g.add(mesh(G.cyl8, bm, rng.range(-0.4, 0.4), 0.04, rng.range(-0.4, 0.4), 0.03, rng.range(0.25, 0.45), 0.03, Math.PI / 2, rng.range(0, 3), 0));
      g.add(mesh(G.sph, bm, 0.2, 0.09, 0.1, 0.1, 0.09, 0.12));
      break;
    }
    default:
      break;
  }
  return g;
}
