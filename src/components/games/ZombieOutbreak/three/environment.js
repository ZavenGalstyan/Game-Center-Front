/**
 * Zombie Outbreak — builds an arena's 3D world from its data.
 *
 * Every solid becomes a prop model at its exact (x, z, rot) footprint — the
 * thing you see is the thing you collide with and the thing that stops
 * bullets. Static meshes are then merged by material (a few dozen draw calls
 * for a whole street); animated pieces (lamp lenses, flames, smoke, sirens,
 * screens, glass) stay separate and are returned as `dynamics`.
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { std, basic, boxUV } from "./materials.js";
import * as T from "./textures.js";
import * as P from "./props.js";

const FLOOR_MAT = {
  asphalt: () => std("f-asphalt", { map: T.asphaltTex(), roughness: 0.92 }),
  sidewalk: () => std("f-sidewalk", { map: T.sidewalkTex(), roughness: 0.95 }),
  concrete: () => std("f-concrete", { map: T.concreteTex("#55534f", "floor"), roughness: 0.93 }),
  warehouse: () => std("f-warehouse", { map: T.concreteTex("#5a5a56", "whfloor"), roughness: 0.8, metalness: 0.05 }),
  tile: () => std("f-tile", { map: T.tileTex("#8e8c82", "#3f403b", "hosp"), roughness: 0.55 }),
  tileGreen: () => std("f-tileg", { map: T.tileTex("#7f9c92", "#3a4440", "hospg"), roughness: 0.55 }),
  lab: () => std("f-lab", { map: T.metalFloorTex(), roughness: 0.45, metalness: 0.55 }),
  labTile: () => std("f-labtile", { map: T.tileTex("#c7ccd0", "#30363a", "lab"), roughness: 0.35, metalness: 0.1 }),
  dirt: () => std("f-dirt", { map: T.dirtTex(), roughness: 1 }),
  tarmac: () => std("f-tarmac", { map: T.concreteTex("#4a4c4c", "tarmac"), roughness: 0.9 }),
};

function floorMat(name) {
  return (FLOOR_MAT[name] || FLOOR_MAT.concrete)();
}

function facingOf(s, arena) {
  const b = arena.bounds;
  const cx = (b.minX + b.maxX) / 2;
  const cz = (b.minZ + b.maxZ) / 2;
  const dx = cx - s.x;
  const dz = cz - s.z;
  if (s.face) return s.face;
  return Math.abs(dx) / (b.maxX - b.minX) > Math.abs(dz) / (b.maxZ - b.minZ) ? [Math.sign(dx) || 1, 0] : [0, Math.sign(dz) || 1];
}

export function buildArena(arena, theme, opts = {}) {
  const root = new THREE.Group();
  const stat = new THREE.Group();
  const dynamics = [];
  root.add(stat);
  const b = arena.bounds;
  const W = b.maxX - b.minX;
  const D = b.maxZ - b.minZ;
  const cx = (b.minX + b.maxX) / 2;
  const cz = (b.minZ + b.maxZ) / 2;

  // ---------------------------------------------------------- ground
  const pad = arena.ceiling ? 0 : 60;
  {
    const base = floorMat(arena.baseFloor || "concrete");
    const geo = new THREE.PlaneGeometry(W + pad * 2, D + pad * 2);
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * (W + pad * 2)) / 4, (uv.getY(i) * (D + pad * 2)) / 4);
    const m = P.mesh(geo, base, cx, 0, cz, 1, 1, 1, -Math.PI / 2, 0, 0);
    stat.add(m);
  }
  arena.floors.forEach((f, i) => {
    const geo = new THREE.PlaneGeometry(f.w, f.d);
    const uv = geo.attributes.uv;
    const tile = f.tile || 4;
    for (let k = 0; k < uv.count; k++) uv.setXY(k, (uv.getX(k) * f.w) / tile, (uv.getY(k) * f.d) / tile);
    stat.add(P.mesh(geo, floorMat(f.mat), f.x, 0.004 + i * 0.002, f.z, 1, 1, 1, -Math.PI / 2, 0, 0));
    if (f.mat === "sidewalk") {
      // Curb edge on the road side.
      const curb = std("curb", { color: "#8c8a84", roughness: 0.9 });
      const long = f.d >= f.w;
      const roadSide = long ? (f.x > cx ? -1 : 1) : f.z > cz ? -1 : 1;
      if (long) stat.add(P.mesh(new THREE.BoxGeometry(0.18, 0.13, f.d), curb, f.x + (roadSide * f.w) / 2, 0.065, f.z));
      else stat.add(P.mesh(new THREE.BoxGeometry(f.w, 0.13, 0.18), curb, f.x, 0.065, f.z + (roadSide * f.d) / 2));
    }
    if (f.lanes) {
      const white = std("lane-white", { color: "#d8d4c4", roughness: 0.7 });
      const yellow = std("lane-yellow", { color: "#d8a826", roughness: 0.7 });
      const long = f.d >= f.w;
      const L = long ? f.d : f.w;
      for (let t = -L / 2 + 1; t < L / 2 - 1; t += 4.5) {
        const geo = new THREE.BoxGeometry(long ? 0.14 : 2.2, 0.01, long ? 2.2 : 0.14);
        stat.add(P.mesh(geo, white, f.x + (long ? 0 : t), 0.016, f.z + (long ? t : 0)));
      }
      for (const off of [-1, 1]) {
        const geo = new THREE.BoxGeometry(long ? 0.12 : L, 0.01, long ? L : 0.12);
        stat.add(P.mesh(geo, yellow, f.x + (long ? off * (f.w / 2 - 0.35) : 0), 0.015, f.z + (long ? 0 : off * (f.d / 2 - 0.35))));
      }
    }
    if (f.stripes) {
      // Painted floor safety lines (warehouse / hangar).
      const y = std("floor-line", { color: "#c9a127", roughness: 0.8 });
      for (const off of [-1, 1]) {
        stat.add(P.mesh(new THREE.BoxGeometry(f.w - 0.4, 0.01, 0.14), y, f.x, 0.018, f.z + (off * (f.d - 0.4)) / 2));
        stat.add(P.mesh(new THREE.BoxGeometry(0.14, 0.01, f.d - 0.4), y, f.x + (off * (f.w - 0.4)) / 2, 0.018, f.z));
      }
    }
  });

  // ---------------------------------------------------------- solids
  for (const s of arena.solids) {
    if (s.hidden) continue;
    let g;
    switch (s.tag) {
      case "building":
        g = P.buildBuilding(s, facingOf(s, arena));
        break;
      case "car":
      case "truck":
        g = P.buildCar(s);
        break;
      case "pole":
        g = P.buildPole(s, s.arm ?? (s.x > cx ? -1 : 1));
        break;
      case "barrier":
        g = P.buildBarrier(s);
        break;
      case "sandbag":
        g = P.buildSandbags(s);
        break;
      case "dumpster":
        g = P.buildDumpster(s);
        break;
      case "container":
        g = P.buildContainer(s);
        break;
      case "crate":
        g = P.buildCrates(s);
        break;
      case "shelf":
        g = P.buildShelf(s);
        break;
      case "machine":
        g = P.buildMachine(s);
        break;
      case "wall":
        g = P.buildWall(s);
        break;
      case "glass":
        g = P.buildGlass(s);
        break;
      case "tank":
        g = P.buildTank(s);
        break;
      case "console":
        g = P.buildConsole(s);
        break;
      case "bed":
        g = P.buildBed(s);
        break;
      case "desk":
        g = P.buildDesk(s);
        break;
      case "locker":
        g = P.buildLocker(s);
        break;
      default:
        g = P.buildGeneric(s);
    }
    g.position.set(s.x, s.y0 || 0, s.z);
    g.rotation.y = s.rot || 0;
    stat.add(g);
  }

  // ---------------------------------------------------------- decor
  for (const d of arena.decor) {
    if (d.tag === "fire") {
      const g = buildFire(d);
      root.add(g);
      dynamics.push({ type: "fire", obj: g, seed: d.x * 3 + d.z });
      continue;
    }
    if (d.tag === "smoke") {
      const g = buildSmoke(d);
      root.add(g);
      dynamics.push({ type: "smoke", obj: g, seed: d.x + d.z * 2 });
      continue;
    }
    const g = P.buildDecor(d);
    g.position.set(d.x, d.y0 || 0, d.z);
    g.rotation.y = d.rot || 0;
    stat.add(g);
  }

  // ---------------------------------------------------------- lamp visuals
  const glowMat = (color) => basic(`glow-${color}`, { color, map: T.groundGlowTex(), transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, fog: true });
  arena.lights.forEach((L, i) => {
    const lamp = new THREE.Group();
    const color = new THREE.Color(L.color);
    const lensMat = new THREE.MeshBasicMaterial({ color: color.clone().multiplyScalar(1.6), fog: false });
    const lampK = L.kind === 'emergency' || L.kind === 'warning' ? theme.emergency ?? 1 : L.kind === 'fire' || L.kind === 'siren' ? 1 : theme.lampScale ?? 1;
    let lens = null;
    if (L.kind === "street") {
      lens = P.mesh(new THREE.BoxGeometry(0.42, 0.06, 0.24), lensMat, L.x, L.y - 0.03, L.z);
      lamp.add(lens);
    } else if (L.kind === "hang") {
      const cable = std("cable", { color: "#111", roughness: 1 });
      const top = arena.ceiling ? arena.ceiling.h : L.y + 3;
      lamp.add(P.mesh(new THREE.CylinderGeometry(0.012, 0.012, top - L.y, 4), cable, L.x, (top + L.y) / 2 + 0.1, L.z));
      lamp.add(P.mesh(new THREE.ConeGeometry(0.45, 0.3, 12, 1, true), std("shade", { color: "#3a3d40", roughness: 0.6, metalness: 0.5, side: THREE.DoubleSide }), L.x, L.y + 0.12, L.z));
      lens = P.mesh(new THREE.SphereGeometry(0.13, 10, 8), lensMat, L.x, L.y, L.z);
      lamp.add(lens);
    } else if (L.kind === "tube") {
      lamp.add(P.mesh(new THREE.BoxGeometry(L.len || 1.6, 0.06, 0.22), std("tubehousing", { color: "#2a2c2e", roughness: 0.6 }), L.x, L.y + 0.05, L.z, 1, 1, 1, 0, L.rot || 0, 0));
      lens = P.mesh(new THREE.BoxGeometry(L.len || 1.6, 0.04, 0.12), lensMat, L.x, L.y, L.z, 1, 1, 1, 0, L.rot || 0, 0);
      lamp.add(lens);
    } else if (L.kind === "emergency" || L.kind === "warning") {
      lens = P.mesh(new THREE.SphereGeometry(0.14, 10, 8), lensMat, L.x, L.y, L.z);
      lamp.add(lens);
      lamp.add(P.mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.12, 10), std("beaconbase", { color: "#222", roughness: 0.6 }), L.x, L.y - 0.12, L.z));
    } else if (L.kind === "flood") {
      const pole = std("lamp-iron", { color: "#26292d", roughness: 0.6, metalness: 0.6 });
      lamp.add(P.mesh(new THREE.CylinderGeometry(0.1, 0.12, L.y, 8), pole, L.x, L.y / 2, L.z));
      lamp.add(P.mesh(new THREE.BoxGeometry(1.2, 0.5, 0.3), pole, L.x, L.y + 0.2, L.z));
      lens = P.mesh(new THREE.BoxGeometry(1.0, 0.36, 0.05), lensMat, L.x, L.y + 0.2, L.z + 0.16);
      lamp.add(lens);
    }
    // Light pool on the floor (fakes what most lamps can't afford as real lights).
    let pool = null;
    if (L.kind !== "siren") {
      const r = Math.min(L.distance * 0.55, 9);
      pool = P.mesh(new THREE.PlaneGeometry(r * 2, r * 2), glowMat(L.color).clone(), L.x, 0.03 + i * 0.001, L.z, 1, 1, 1, -Math.PI / 2, 0, 0);
      pool.material.opacity = 0.16 * L.intensity * lampK;
      root.add(pool);
    }
    if (lamp.children.length) root.add(lamp);
    dynamics.push({ type: "lamp", spec: L, lens, pool, baseOpacity: pool ? pool.material.opacity : 0, index: i, scale: lampK });
  });

  // ---------------------------------------------------------- ceiling / sky
  if (arena.ceiling) {
    const c = arena.ceiling;
    const geo = new THREE.PlaneGeometry(W, D);
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * W) / 4, (uv.getY(i) * D) / 4);
    const m = c.mat === "metal" ? std("ceil-metal", { map: T.metalWallTex("#3a3e42", "ceil"), roughness: 0.7, metalness: 0.4 }) : std(`ceil-${c.mat}`, { map: T.concreteTex(c.color || "#4b4a47", "ceil"), roughness: 0.95 });
    stat.add(P.mesh(geo, m, cx, c.h, cz, 1, 1, 1, Math.PI / 2, 0, 0));
    // Beams.
    const beam = std("beam", { color: "#2c2f33", roughness: 0.6, metalness: 0.5 });
    for (let x = b.minX + 4; x < b.maxX; x += 6) stat.add(P.mesh(new THREE.BoxGeometry(0.3, 0.45, D), beam, x, c.h - 0.22, cz));
  } else {
    const cols = theme.skyCols || ["#05070d", "#141a28", "#24283a"];
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(220, 48, 32),
      new THREE.MeshBasicMaterial({ map: T.skyTex(cols[0], cols[1], cols[2]), side: THREE.BackSide, fog: false, depthWrite: false }),
    );
    sky.position.set(cx, 0, cz);
    sky.renderOrder = -10;
    root.add(sky);
    dynamics.push({ type: "sky", obj: sky });
    // Moon.
    const moon = new THREE.Mesh(new THREE.CircleGeometry(7, 24), new THREE.MeshBasicMaterial({ color: "#e8e6dc", fog: false, transparent: true, opacity: 0.85 }));
    const md = new THREE.Vector3(...(theme.moonDir || [-0.4, 1, 0.3])).normalize();
    moon.position.set(cx + md.x * 200, Math.max(40, md.y * 120), cz + md.z * 200);
    moon.lookAt(cx, 0, cz);
    root.add(moon);
    // Distant skyline silhouettes beyond the arena walls.
    const sil = std("skyline", { color: "#0c0f16", roughness: 1, fog: true });
    const rng = mulberry(arena.id.length * 97);
    for (let i = 0; i < 46; i++) {
      const a = (i / 46) * Math.PI * 2;
      const r = Math.max(W, D) * 0.5 + 25 + rng() * 40;
      const h = 14 + rng() * 34;
      const w = 8 + rng() * 14;
      stat.add(P.mesh(new THREE.BoxGeometry(1, 1, 1), sil, cx + Math.cos(a) * r, h / 2, cz + Math.sin(a) * r, w, h, w, 0, a, 0));
    }
  }

  // ---------------------------------------------------------- merge statics
  const merged = mergeStatic(stat, opts.shadows !== false);
  root.remove(stat);
  root.add(merged);
  // Pull dynamic-tagged meshes back out of the static tree (they were skipped by the merge).
  for (const m of merged.userData.dynamicMeshes) {
    root.add(m);
    if (m.userData.dynamic === "siren-r" || m.userData.dynamic === "siren-b" || m.userData.dynamic === "screen") dynamics.push({ type: m.userData.dynamic, obj: m });
  }
  return { root, dynamics };
}

function mulberry(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Bakes every static mesh's world transform into its geometry and merges by
 * material. Meshes tagged userData.dynamic are detached (with their world
 * transform) and returned in userData.dynamicMeshes instead.
 */
function mergeStatic(group, shadows) {
  group.updateMatrixWorld(true);
  const byMat = new Map();
  const dyn = [];
  group.traverse((o) => {
    if (!o.isMesh) return;
    if (o.userData.dynamic) {
      dyn.push(o);
      return;
    }
    let g = o.geometry.clone();
    g.applyMatrix4(o.matrixWorld);
    if (g.index) g = g.toNonIndexed();
    for (const k of Object.keys(g.attributes)) if (k !== "position" && k !== "normal" && k !== "uv") g.deleteAttribute(k);
    if (!g.attributes.uv) g.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array((g.attributes.position.count) * 2), 2));
    const key = o.material.uuid;
    if (!byMat.has(key)) byMat.set(key, { mat: o.material, list: [] });
    byMat.get(key).list.push(g);
  });
  const out = new THREE.Group();
  for (const { mat, list } of byMat.values()) {
    const geo = mergeGeometries(list, false);
    for (const g of list) g.dispose();
    if (!geo) continue;
    geo.computeBoundingSphere();
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = shadows && !mat.transparent;
    m.receiveShadow = !mat.transparent;
    m.matrixAutoUpdate = false;
    m.updateMatrix();
    out.add(m);
  }
  // Detach dynamic meshes keeping their world transform.
  out.userData.dynamicMeshes = dyn.map((o) => {
    const m = new THREE.Mesh(o.geometry, o.material);
    o.matrixWorld.decompose(m.position, m.quaternion, m.scale);
    m.userData.dynamic = o.userData.dynamic;
    m.castShadow = false;
    m.receiveShadow = false;
    return m;
  });
  return out;
}

/* ------------------------------------------------------------------ fire + smoke */

function buildFire(d) {
  const g = new THREE.Group();
  g.position.set(d.x, 0, d.z);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.85, 14, 1, true), std("firebarrel", { color: "#3b2a20", roughness: 0.9, metalness: 0.4, side: THREE.DoubleSide }));
  barrel.position.y = 0.425;
  barrel.castShadow = false;
  g.add(barrel);
  const coal = new THREE.Mesh(new THREE.CircleGeometry(0.28, 12), new THREE.MeshBasicMaterial({ color: "#ff6a1a" }));
  coal.rotation.x = -Math.PI / 2;
  coal.position.y = 0.8;
  g.add(coal);
  const flameMat = new THREE.MeshBasicMaterial({ color: "#ff8a2a", transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const flames = [];
  for (let i = 0; i < 4; i++) {
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.22 - i * 0.03, 0.9, 8, 1, true), flameMat.clone());
    f.position.set((i - 1.5) * 0.06, 1.15, ((i % 2) - 0.5) * 0.08);
    f.material.color.set(i % 2 ? "#ffb347" : "#ff6a1a");
    g.add(f);
    flames.push(f);
  }
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), basic("fireglow", { color: "#ff7a2a", map: T.groundGlowTex(), transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false }));
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = 0.035;
  g.add(glow);
  g.userData.flames = flames;
  return g;
}

function buildSmoke(d) {
  const g = new THREE.Group();
  g.position.set(d.x, 0, d.z);
  const s = d.s || 1;
  const puffs = [];
  for (let i = 0; i < 7; i++) {
    const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.smokeTex(), color: "#8a8a8a", transparent: true, opacity: 0.4, depthWrite: false }));
    m.userData.phase = i / 7;
    g.add(m);
    puffs.push(m);
  }
  g.userData.puffs = puffs;
  g.userData.s = s;
  return g;
}

/** Per-frame animation of the environment's dynamic pieces. */
export function animateDynamics(dynamics, t, dt, lights) {
  for (const d of dynamics) {
    switch (d.type) {
      case "fire": {
        const fl = d.obj.userData.flames;
        for (let i = 0; i < fl.length; i++) {
          const k = 0.75 + Math.sin(t * (9 + i * 3.1) + d.seed + i) * 0.18 + Math.sin(t * 23 + i) * 0.08;
          fl[i].scale.set(1 + Math.sin(t * 7 + i) * 0.1, k, 1);
          fl[i].rotation.y = t * (1 + i * 0.3);
        }
        break;
      }
      case "smoke": {
        const s = d.obj.userData.s;
        for (const p of d.obj.userData.puffs) {
          const ph = (p.userData.phase + t * 0.07) % 1;
          p.position.set(Math.sin(ph * 6 + d.seed) * 0.6 * s + ph * 1.5 * s, 0.8 + ph * 9 * s, Math.cos(ph * 5 + d.seed) * 0.5 * s);
          const sc = (1.2 + ph * 4.5) * s;
          p.scale.set(sc, sc, 1);
          p.material.opacity = 0.32 * Math.sin(ph * Math.PI);
        }
        break;
      }
      case "siren-r":
      case "siren-b": {
        const on = Math.floor(t * 3) % 2 === (d.type === "siren-r" ? 0 : 1);
        d.obj.material.emissiveIntensity = on ? 2.2 : 0.15;
        break;
      }
      case "screen":
        d.obj.material.emissiveIntensity = 0.5 + Math.sin(t * 30 + d.obj.id) * 0.04 + (Math.random() < 0.01 ? 0.4 : 0);
        break;
      case "lamp": {
        const L = d.spec;
        let k = 1;
        if (L.kind === "siren") break;
        if (L.flicker > 0) {
          // Mostly on, with bursts of stutter.
          const n = Math.sin(t * 13 + d.index * 7) + Math.sin(t * 31.7 + d.index) * 0.6 + Math.sin(t * 2.1 + d.index * 3) * 1.4;
          if (n > 2.0 - L.flicker * 1.2) k = Math.random() < 0.5 ? 0.15 : 0.6;
        }
        if (L.kind === "fire") k = 0.8 + Math.sin(t * 17 + d.index) * 0.12 + Math.sin(t * 7.3) * 0.08;
        if (L.kind === "warning") k = 0.35 + 0.65 * Math.max(0, Math.sin(t * 5 + d.index));
        if (L.kind === "emergency") k = 0.55 + 0.45 * (Math.sin(t * 3 + d.index) > 0 ? 1 : 0.25);
        d.k = k;
        if (d.lens) d.lens.material.color.set(L.color).multiplyScalar(0.3 + 1.4 * k * (d.scale ?? 1));
        if (d.pool) d.pool.material.opacity = d.baseOpacity * k;
        break;
      }
      default:
        break;
    }
  }
  if (lights) {
    for (const l of lights) {
      const d = l.userData.dyn;
      if (d) l.intensity = l.userData.base * (d.k ?? 1);
    }
  }
  void dt;
}
