/**
 * Police Escape 3D — builds the 3D city from the engine's city model (so
 * what you see is exactly what you drive into):
 *
 *   ground      roads (lane markings per road type), intersections with
 *               crosswalks, raised sidewalks, plazas, parks, yards, water
 *   buildings   every solid rectangle becomes 1–3 buildings with district
 *               facades (world-scale UVs), lit shopfronts, rooftop clutter,
 *               neon signs; the map border is a ring of tall towers
 *   street      lamps with light pools, signalled crossroads with live
 *               traffic lights, trees / palms, containers, fences
 *   structures  bridges (railings, girders), tunnels (walls, roof, lights),
 *               elevated highways (Metro), the escape-zone gate + beacon,
 *               checkpoints, nitro canisters, roadblocks (police cars,
 *               barriers, cones — added / removed live)
 *
 * Static geometry is merged by material (a few dozen draw calls).
 * Returns { group, update(run, dt, t), dispose }.
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { ALLEY_W, edgePoint } from "../engine/city.js";
import { lightFor } from "../engine/traffic.js";
import { mulberry32 } from "../engine/util.js";
import { roadTex, asphaltTex, crosswalkTex, sidewalkTex, facadeTex, shopTex, neonTex, labelTex, hazardTex, containerTex, grassTex, waterTex, softDot, beamTex } from "./textures.js";
import { buildCar } from "./carModel.js";

const SIDE_H = 0.16;
const NEON_WORDS = {
  downtown: ["HOTEL", "24/7", "DINER", "CLUB", "BAR", "CINEMA", "PIZZA", "MOTEL"],
  industrial: ["DOCK 7", "STEEL", "SHIPPING", "FREIGHT", "WORKS", "DEPOT"],
  coastal: ["SURF", "OCEAN", "TIKI", "HOTEL", "SEAFOOD", "BEACH"],
  rain: ["NOODLES", "OPEN", "ARCADE", "BAR", "TAXI", "CAFE", "KARAOKE"],
  metro: ["NEXUS", "ZENITH", "SKYNET", "HYPER", "VOLT", "ORBIT", "NOVA"],
};
const HEIGHTS = {
  downtown: [16, 70],
  industrial: [8, 20],
  coastal: [10, 34],
  rain: [14, 56],
  metro: [24, 110],
};
const STYLE = { downtown: "office", industrial: "industrial", coastal: "coastal", rain: "apartment", metro: "metro" };
const ZONE_LABEL = { garage: "GARAGE", warehouse: "WAREHOUSE", harbor: "HARBOR", tunnel: "TUNNEL", highway: "HIGHWAY EXIT" };

/** Box with world-scale UVs on the walls (u = metres / uw, v = metres / vh). */
function wallBox(x0, z0, x1, z1, y0, y1, uw = 8, vh = 12) {
  const g = new THREE.BufferGeometry();
  const pos = [];
  const uv = [];
  const nor = [];
  const quad = (a, b, n, len) => {
    // a, b: bottom-left → bottom-right along the wall (outside view)
    const [ax, az] = a;
    const [bx, bz] = b;
    const verts = [
      [ax, y0, az, 0, y0 / vh],
      [bx, y0, bz, len / uw, y0 / vh],
      [bx, y1, bz, len / uw, y1 / vh],
      [ax, y1, az, 0, y1 / vh],
    ];
    for (const i of [0, 1, 2, 0, 2, 3]) {
      const v = verts[i];
      pos.push(v[0], v[1], v[2]);
      uv.push(v[3], v[4]);
      nor.push(...n);
    }
  };
  quad([x0, z1], [x1, z1], [0, 0, 1], x1 - x0); // south (+z)
  quad([x1, z1], [x1, z0], [1, 0, 0], z1 - z0); // east
  quad([x1, z0], [x0, z0], [0, 0, -1], x1 - x0); // north
  quad([x0, z0], [x0, z1], [-1, 0, 0], z1 - z0); // west
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

/** Horizontal rectangle (facing up) with world-scale UVs. */
function flat(x0, z0, x1, z1, y, tile = 4) {
  const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0);
  g.rotateX(-Math.PI / 2);
  g.translate((x0 + x1) / 2, y, (z0 + z1) / 2);
  const p = g.attributes.position;
  const uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / tile, p.getZ(i) / tile);
  return g;
}

/** A road strip along an edge (u across, v along / 20 m). */
function roadStrip(city, e, t0, t1, y) {
  const a = edgePoint(city, e, t0, 0);
  const b = edgePoint(city, e, t1, 0);
  const ux = Math.sin(a.h);
  const uz = Math.cos(a.h);
  const lx = uz;
  const lz = -ux;
  const hw = e.w / 2;
  const P = [
    [a.x - lx * hw, a.z - lz * hw, 0, t0 / 20],
    [a.x + lx * hw, a.z + lz * hw, 1, t0 / 20],
    [b.x + lx * hw, b.z + lz * hw, 1, t1 / 20],
    [b.x - lx * hw, b.z - lz * hw, 0, t1 / 20],
  ];
  const g = new THREE.BufferGeometry();
  const pos = [];
  const uv = [];
  for (const i of [0, 2, 1, 0, 3, 2]) {
    pos.push(P[i][0], y, P[i][1]);
    uv.push(P[i][2], P[i][3]);
  }
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  // make sure it faces up
  if (g.attributes.normal.getY(0) < 0) {
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i += 3) {
      const x = p.getX(i + 1);
      const z = p.getZ(i + 1);
      const u = g.attributes.uv.getX(i + 1);
      const v = g.attributes.uv.getY(i + 1);
      p.setXYZ(i + 1, p.getX(i + 2), y, p.getZ(i + 2));
      g.attributes.uv.setXY(i + 1, g.attributes.uv.getX(i + 2), g.attributes.uv.getY(i + 2));
      p.setXYZ(i + 2, x, y, z);
      g.attributes.uv.setXY(i + 2, u, v);
    }
    g.computeVertexNormals();
  }
  return g;
}

const boxAt = (w, h, d, x, y, z, ry = 0) => {
  const g = new THREE.BoxGeometry(w, h, d);
  if (ry) g.rotateY(ry);
  g.translate(x, y, z);
  return g;
};

export function buildCityMesh(city, world, quality = "medium", opts = {}) {
  const group = new THREE.Group();
  const pal = world.palette;
  const theme = world.theme;
  const rand = mulberry32((opts.seed || 1) * 977 + world.id);
  const dens = quality === "low" ? 0.55 : quality === "high" ? 1.25 : 1;
  const wet = !!world.sky.rain;
  const buckets = new Map(); // material key → [geometries]
  const mats = new Map();
  const disposeList = [];
  const put = (key, makeMat, geo) => {
    if (!mats.has(key)) mats.set(key, makeMat());
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(geo);
  };
  const std = (o) => () => new THREE.MeshStandardMaterial(o);
  const basic = (o) => () => new THREE.MeshBasicMaterial(o);
  const roughRoad = wet ? 0.28 : 0.85;

  // --- ground ---------------------------------------------------------------------------
  const B = city.bounds;
  put("ground", std({ color: shadeHex(pal.asphalt, -0.4), roughness: 1 }), flat(B.x0 - 400, B.z0 - 400, B.x1 + 400, B.z1 + 400, -0.05, 50));
  // roads
  for (const e of city.edges) {
    const kind = e.kind === "alley" ? "alley" : e.kind === "drive" ? "drive" : e.w >= 18 ? "avenue" : "road";
    const key = `road-${kind}`;
    put(key, std({ map: roadTex(pal, kind), roughness: roughRoad, metalness: wet ? 0.25 : 0.05, envMapIntensity: wet ? 1.3 : 0.4, emissive: kind === "drive" ? "#1fff70" : "#000000", emissiveIntensity: kind === "drive" ? 0.35 : 0, emissiveMap: kind === "drive" ? roadTex(pal, "drive") : null }), roadStrip(city, e, 0, e.len, 0.01));
  }
  // intersections + crosswalks
  const cw = [];
  for (const n of city.nodes) {
    if (n.kind !== "int" || !n.gi) continue;
    const [i, j] = n.gi;
    const hx = city.wx(i) / 2;
    const hz = city.wz(j) / 2;
    put("inter", std({ map: asphaltTex(pal), roughness: roughRoad, metalness: wet ? 0.25 : 0.05, envMapIntensity: wet ? 1.3 : 0.4 }), flat(n.x - hx, n.z - hz, n.x + hx, n.z + hz, 0.02, 12));
    if (n.adj.length >= 3) {
      for (const a of n.adj) {
        const e = city.edges[a.e];
        if (e.kind !== "road" && e.kind !== "tunnel" && e.kind !== "bridge") continue;
        const m = city.nodes[a.to];
        const dx = Math.sign(m.x - n.x);
        const dz = Math.sign(m.z - n.z);
        const off = (dx ? hx : hz) + 2.2;
        const cx = n.x + dx * off;
        const cz = n.z + dz * off;
        const g = new THREE.PlaneGeometry(e.w * 0.92, 3);
        g.rotateX(-Math.PI / 2);
        if (dx) g.rotateY(Math.PI / 2);
        g.translate(cx, 0.03, cz);
        cw.push(g);
      }
    }
  }
  if (cw.length) put("crosswalk", basic({ map: crosswalkTex(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }), mergeGeometries(cw));

  // sidewalks / block grounds
  const sideMat = std({ map: sidewalkTex(pal), roughness: wet ? 0.35 : 0.9, metalness: wet ? 0.2 : 0 });
  const curbMat = std({ color: pal.curb, roughness: 0.8 });
  for (const b of city.blocks) {
    let rects = [{ x0: b.x0, x1: b.x1, z0: b.z0, z1: b.z1 }];
    if (b.alley) {
      const h = ALLEY_W / 2;
      rects = b.alley.axis === "x" ? [{ ...rects[0], z1: b.alley.c - h }, { ...rects[0], z0: b.alley.c + h }] : [{ ...rects[0], x1: b.alley.c - h }, { ...rects[0], x0: b.alley.c + h }];
    }
    for (const r of rects) {
      if (b.type === "water") continue;
      put("side", sideMat, flat(r.x0, r.z0, r.x1, r.z1, SIDE_H, 3));
      put("curb", curbMat, wallBox(r.x0, r.z0, r.x1, r.z1, 0, SIDE_H, 4, 1));
    }
    if (b.type === "water") {
      // promenade ring + water inside
      const sw = 3.5;
      for (const r of [
        { x0: b.x0, x1: b.x1, z0: b.z0, z1: b.z0 + sw },
        { x0: b.x0, x1: b.x1, z0: b.z1 - sw, z1: b.z1 },
        { x0: b.x0, x1: b.x0 + sw, z0: b.z0 + sw, z1: b.z1 - sw },
        { x0: b.x1 - sw, x1: b.x1, z0: b.z0 + sw, z1: b.z1 - sw },
      ]) {
        put("side", sideMat, flat(r.x0, r.z0, r.x1, r.z1, SIDE_H, 3));
        put("curb", curbMat, wallBox(r.x0, r.z0, r.x1, r.z1, -1.5, SIDE_H, 4, 1));
      }
    }
  }
  // water bodies (one big plane under the city where blocks are water)
  const waterBlocks = city.blocks.filter((b) => b.type === "water");
  let waterTexture = null;
  if (waterBlocks.length || theme === "coastal") {
    waterTexture = waterTex().clone();
    waterTexture.needsUpdate = true;
    waterTexture.repeat.set(60, 60);
    disposeList.push(waterTexture);
    const wm = new THREE.MeshStandardMaterial({ map: waterTexture, color: "#4a8ab8", roughness: 0.12, metalness: 0.6, envMapIntensity: 1.5 });
    disposeList.push(wm);
    for (const b of waterBlocks) {
      const m = new THREE.Mesh(flat(b.x0 + 3.5, b.z0 + 3.5, b.x1 - 3.5, b.z1 - 3.5, -1.2, 6), wm);
      group.add(m);
      disposeList.push(m.geometry);
    }
    if (theme === "coastal") {
      // the open sea beyond the south / east edge
      const sea = new THREE.Mesh(flat(B.x0 - 400, B.z1 + 30, B.x1 + 400, B.z1 + 600, -1.2, 6), wm);
      group.add(sea);
      disposeList.push(sea.geometry);
    }
  }

  // --- buildings ------------------------------------------------------------------------
  const [hLo, hHi] = HEIGHTS[theme];
  const style = STYLE[theme];
  const facadeKeys = [0, 1, 2].map((k) => {
    const wall = pal.towers[k % pal.towers.length];
    const key = `facade-${k}`;
    const tex = facadeTex(style, wall, pal.windows, k + 1);
    mats.set(key, new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: "#ffffff", emissiveIntensity: theme === "coastal" ? 0.4 : 0.55, roughness: 0.7, metalness: 0.2, color: "#7a8090" }));
    buckets.set(key, []);
    return key;
  });
  const roofKey = "roof";
  put(roofKey, std({ color: shadeHex(pal.towers[0], -0.35), roughness: 0.9 }), new THREE.BufferGeometry());
  const neonGeos = new Map();
  const words = NEON_WORDS[theme];
  const roofProps = [];
  const antennaTips = [];
  const shopKey = "shop";
  const shopT = shopTex(pal, world.id);
  mats.set(shopKey, new THREE.MeshStandardMaterial({ map: shopT, emissiveMap: shopT, emissive: "#ffffff", emissiveIntensity: 0.6, roughness: 0.6, color: "#8a8a8a" }));
  buckets.set(shopKey, []);
  const addBuilding = (x0, z0, x1, z1, h, tall = false) => {
    const fk = facadeKeys[Math.floor(rand() * facadeKeys.length)];
    buckets.get(fk).push(wallBox(x0, z0, x1, z1, 0, h));
    buckets.get(roofKey).push(flat(x0, z0, x1, z1, h, 6));
    // setback tower on top of tall ones
    if (tall && h > 40 && rand() < 0.55) {
      const ix = (x1 - x0) * 0.2;
      const iz = (z1 - z0) * 0.2;
      const h2 = h + 10 + rand() * 30;
      buckets.get(fk).push(wallBox(x0 + ix, z0 + iz, x1 - ix, z1 - iz, h, h2));
      buckets.get(roofKey).push(flat(x0 + ix, z0 + iz, x1 - ix, z1 - iz, h2, 6));
      if (rand() < 0.6) {
        roofProps.push(boxAt(0.4, 14, 0.4, (x0 + x1) / 2, h2 + 7, (z0 + z1) / 2));
        antennaTips.push([(x0 + x1) / 2, h2 + 14.2, (z0 + z1) / 2]);
      }
    }
    // rooftop clutter
    const n = Math.floor(rand() * 3);
    for (let k = 0; k < n; k++) {
      const w = 2 + rand() * 3;
      roofProps.push(boxAt(w, 1.4, w * 0.8, x0 + 3 + rand() * Math.max(1, x1 - x0 - 6), h + 0.7, z0 + 3 + rand() * Math.max(1, z1 - z0 - 6)));
    }
    // lit shopfronts on the ground floor (not industrial)
    if (theme !== "industrial" && h > 8) buckets.get(shopKey).push(wallBox(x0 - 0.12, z0 - 0.12, x1 + 0.12, z1 + 0.12, 0.2, 4.2, 8, 4));
    // a neon sign on one face
    if (rand() < 0.35 * dens && h > 10) {
      const word = words[Math.floor(rand() * words.length)];
      const col = pal.neon[Math.floor(rand() * pal.neon.length)];
      const key = `${word}|${col}`;
      const face = Math.floor(rand() * 4);
      const sw = Math.min(9, Math.max(5, (face % 2 ? z1 - z0 : x1 - x0) * 0.6));
      const g = new THREE.PlaneGeometry(sw, sw * 0.31);
      const y = 6 + rand() * Math.min(10, h - 9);
      const cx = (x0 + x1) / 2;
      const cz = (z0 + z1) / 2;
      if (face === 0) g.translate(cx, y, z1 + 0.2);
      else if (face === 1) {
        g.rotateY(Math.PI / 2);
        g.translate(x1 + 0.2, y, cz);
      } else if (face === 2) {
        g.rotateY(Math.PI);
        g.translate(cx, y, z0 - 0.2);
      } else {
        g.rotateY(-Math.PI / 2);
        g.translate(x0 - 0.2, y, cz);
      }
      if (!neonGeos.has(key)) neonGeos.set(key, []);
      neonGeos.get(key).push(g);
    }
  };
  // subdivide each building rectangle into lots
  const lots = (r, tallChance = 0.3) => {
    const lx = r.x1 - r.x0;
    const lz = r.z1 - r.z0;
    const alongX = lx >= lz;
    const L = alongX ? lx : lz;
    const n = Math.max(1, Math.min(4, Math.round(L / 34)));
    for (let k = 0; k < n; k++) {
      const a = (L * k) / n;
      const b = (L * (k + 1)) / n;
      const tall = rand() < tallChance;
      const h = hLo + (hHi - hLo) * (tall ? 0.6 + rand() * 0.4 : rand() * 0.55);
      if (alongX) addBuilding(r.x0 + a + (k ? 0.4 : 0), r.z0, r.x0 + b, r.z1, h, tall);
      else addBuilding(r.x0, r.z0 + a + (k ? 0.4 : 0), r.x1, r.z0 + b, h, tall);
    }
  };
  for (const s of city.solids) {
    if (s.kind === "building" || s.kind === "closed") lots(s, theme === "metro" ? 0.5 : 0.3);
    else if (s.kind === "wall") {
      // the city edge: a ring of tall buildings
      const r = { x0: s.x0, x1: s.x1, z0: s.z0, z1: s.z1 };
      const lx = r.x1 - r.x0;
      const lz = r.z1 - r.z0;
      const alongX = lx >= lz;
      const L = alongX ? lx : lz;
      const n = Math.max(1, Math.round(L / 40));
      for (let k = 0; k < n; k++) {
        const a = (L * k) / n;
        const b = (L * (k + 1)) / n;
        const h = (hLo + hHi) * 0.5 + rand() * hHi * 0.6;
        if (alongX) addBuilding(r.x0 + a + 0.5, r.z0, r.x0 + b, r.z1, h, true);
        else addBuilding(r.x0, r.z0 + a + 0.5, r.x1, r.z0 + b, h, true);
      }
    }
  }
  for (const [key, list] of neonGeos) {
    const [word, col] = key.split("|");
    const m = new THREE.Mesh(mergeGeometries(list), new THREE.MeshBasicMaterial({ map: neonTex(word, col), toneMapped: false }));
    list.forEach((g) => g.dispose());
    group.add(m);
    disposeList.push(m.geometry, m.material);
  }
  if (roofProps.length) put("roofprops", std({ color: "#3a3f4a", roughness: 0.7, metalness: 0.4 }), mergeGeometries(roofProps));
  const blinkMat = new THREE.SpriteMaterial({ map: softDot(), color: "#ff3030", transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  disposeList.push(blinkMat);
  const blinks = antennaTips.map(([x, y, z]) => {
    const s = new THREE.Sprite(blinkMat);
    s.position.set(x, y, z);
    s.scale.setScalar(3);
    group.add(s);
    return s;
  });

  // --- parks, yards, plazas -----------------------------------------------------------------
  const trunks = [];
  const crowns = [];
  const palms = [];
  const containers = new Map();
  const fences = [];
  const contColors = ["#c0392b", "#2471a3", "#1e8449", "#d68910", "#7d3c98", "#566573"];
  for (const b of city.blocks) {
    const r = b.inner;
    if (!r) continue;
    if (b.type === "park") {
      put("grass", std({ map: grassTex(), roughness: 1 }), flat(r.x0, r.z0, r.x1, r.z1, SIDE_H + 0.02, 6));
      const n = Math.round(((r.x1 - r.x0) * (r.z1 - r.z0)) / 160 * dens);
      for (let k = 0; k < n; k++) {
        const x = r.x0 + 3 + rand() * (r.x1 - r.x0 - 6);
        const z = r.z0 + 3 + rand() * (r.z1 - r.z0 - 6);
        const s = 0.8 + rand() * 0.6;
        trunks.push(boxAt(0.5 * s, 3 * s, 0.5 * s, x, 1.5 * s, z));
        const c = new THREE.IcosahedronGeometry(2.6 * s, 0);
        c.translate(x, 4.2 * s, z);
        crowns.push(c);
      }
      fences.push(wallBox(r.x0, r.z0, r.x1, r.z1, SIDE_H, 1.1, 2, 1));
    } else if (b.type === "yard") {
      put("yard", std({ color: "#3a3630", roughness: 0.95 }), flat(r.x0, r.z0, r.x1, r.z1, SIDE_H + 0.02, 6));
      fences.push(wallBox(r.x0, r.z0, r.x1, r.z1, SIDE_H, 2.4, 2, 1));
      // container stacks
      for (let x = r.x0 + 4; x < r.x1 - 7; x += 7.5)
        for (let z = r.z0 + 5; z < r.z1 - 14; z += 16) {
          if (rand() < 0.3) continue;
          const stack = 1 + Math.floor(rand() * 3);
          for (let k = 0; k < stack; k++) {
            const col = contColors[Math.floor(rand() * contColors.length)];
            if (!containers.has(col)) containers.set(col, []);
            containers.get(col).push(boxAt(2.5, 2.6, 12, x + 1.25, SIDE_H + 1.3 + k * 2.62, z + 6));
          }
        }
    } else if (b.type === "plaza") {
      // fountain + planters in the middle
      const cx = (b.x0 + b.x1) / 2;
      const cz = (b.z0 + b.z1) / 2;
      const f = new THREE.CylinderGeometry(5, 5.5, 0.9, 24);
      f.translate(cx, 0.45, cz);
      put("curb", curbMat, f);
      const w = new THREE.CylinderGeometry(4.4, 4.4, 0.2, 24);
      w.translate(cx, 0.8, cz);
      put("fountain", std({ color: "#2a6aa0", roughness: 0.1, metalness: 0.5, emissive: "#103050", emissiveIntensity: 0.6 }), w);
    }
  }
  // palms along coastal promenades / sidewalks
  if (theme === "coastal") {
    for (const b of city.blocks) {
      if (b.type === "water") continue;
      for (let x = b.x0 + 6; x < b.x1 - 4; x += 18) {
        for (const z of [b.z0 + 1.6, b.z1 - 1.6]) {
          if (rand() < 0.4) continue;
          palms.push([x, z]);
        }
      }
    }
  }
  if (trunks.length) put("trunk", std({ color: "#4a3424", roughness: 1 }), mergeGeometries(trunks));
  if (crowns.length) put("crown", std({ color: "#2f6a3a", roughness: 0.9, flatShading: true }), mergeGeometries(crowns));
  if (palms.length) {
    const pt = [];
    const pl = [];
    for (const [x, z] of palms.slice(0, Math.round(220 * dens))) {
      const t = new THREE.CylinderGeometry(0.22, 0.35, 8, 6);
      t.translate(x, SIDE_H + 4, z);
      pt.push(t);
      for (let k = 0; k < 6; k++) {
        const leaf = new THREE.BoxGeometry(0.5, 0.08, 4);
        leaf.translate(0, 0, 2);
        leaf.rotateX(0.35);
        leaf.rotateY((k / 6) * Math.PI * 2);
        leaf.translate(x, SIDE_H + 8, z);
        pl.push(leaf);
      }
    }
    put("trunk", std({ color: "#4a3424", roughness: 1 }), mergeGeometries(pt));
    put("palm", std({ color: "#2a7a40", roughness: 0.9 }), mergeGeometries(pl));
  }
  for (const [col, list] of containers) {
    const tex = containerTex(col);
    put(`cont-${col}`, std({ map: tex, roughness: 0.7, metalness: 0.4 }), mergeGeometries(list));
  }
  if (fences.length) put("fence", std({ color: "#5a5f68", roughness: 0.5, metalness: 0.6, transparent: true, opacity: 0.55 }), mergeGeometries(fences));

  // --- bridges, tunnels, highways ---------------------------------------------------------------
  const rails = [];
  const girders = [];
  const tunnelWalls = [];
  const tunnelLights = [];
  for (const e of city.edges) {
    if (e.kind === "bridge") {
      for (const side of [-1, 1]) {
        const a = edgePoint(city, e, 0, side * (e.w / 2 + 0.3));
        const b = edgePoint(city, e, e.len, side * (e.w / 2 + 0.3));
        const x0 = Math.min(a.x, b.x) - 0.15;
        const x1 = Math.max(a.x, b.x) + 0.15;
        const z0 = Math.min(a.z, b.z) - 0.15;
        const z1 = Math.max(a.z, b.z) + 0.15;
        rails.push(boxAt(x1 - x0, 0.12, z1 - z0, (x0 + x1) / 2, 1.15, (z0 + z1) / 2));
        rails.push(boxAt(x1 - x0, 0.9, z1 - z0, (x0 + x1) / 2, 0.55, (z0 + z1) / 2));
        // arch truss over the bridge
        const len = e.len;
        const steps = 10;
        for (let k = 0; k < steps; k++) {
          const t0 = (k / steps) * len;
          const t1 = ((k + 1) / steps) * len;
          const y0 = 2 + Math.sin((k / steps) * Math.PI) * 12;
          const y1 = 2 + Math.sin(((k + 1) / steps) * Math.PI) * 12;
          const p0 = edgePoint(city, e, t0, side * (e.w / 2 + 0.6));
          const p1 = edgePoint(city, e, t1, side * (e.w / 2 + 0.6));
          const L = Math.hypot(p1.x - p0.x, y1 - y0, p1.z - p0.z);
          const g = new THREE.BoxGeometry(0.5, 0.5, L);
          g.lookAt(new THREE.Vector3(p1.x - p0.x, y1 - y0, p1.z - p0.z));
          g.translate((p0.x + p1.x) / 2, (y0 + y1) / 2, (p0.z + p1.z) / 2);
          girders.push(g);
          if (k % 2 === 0) girders.push(boxAt(0.15, y0, 0.15, p0.x, y0 / 2, p0.z));
        }
      }
      girders.push(boxAt(e.axis === "x" ? e.len : e.w, 1.4, e.axis === "x" ? e.w : e.len, (city.nodes[e.a].x + city.nodes[e.b].x) / 2, -0.7, (city.nodes[e.a].z + city.nodes[e.b].z) / 2));
    } else if (e.kind === "tunnel") {
      const A = city.nodes[e.a];
      const Bn = city.nodes[e.b];
      const inset = 9;
      const t0 = inset;
      const t1 = e.len - inset;
      for (const side of [-1, 1]) {
        const a = edgePoint(city, e, t0, side * (e.w / 2 + 0.6));
        const b = edgePoint(city, e, t1, side * (e.w / 2 + 0.6));
        tunnelWalls.push(boxAt(Math.abs(b.x - a.x) + 1.2, 7, Math.abs(b.z - a.z) + 1.2, (a.x + b.x) / 2, 3.5, (a.z + b.z) / 2));
      }
      const c0 = edgePoint(city, e, t0, 0);
      const c1 = edgePoint(city, e, t1, 0);
      tunnelWalls.push(boxAt(Math.abs(c1.x - c0.x) + (e.axis === "x" ? 0 : e.w + 2.4), 1, Math.abs(c1.z - c0.z) + (e.axis === "z" ? 0 : e.w + 2.4), (c0.x + c1.x) / 2, 7.4, (c0.z + c1.z) / 2));
      for (let t = t0 + 4; t < t1; t += 8) {
        const p = edgePoint(city, e, t, 0);
        tunnelLights.push(boxAt(e.axis === "x" ? 2.5 : e.w * 0.7, 0.12, e.axis === "x" ? e.w * 0.7 : 2.5, p.x, 6.85, p.z));
      }
      void A;
      void Bn;
    }
  }
  if (rails.length) put("rail", std({ color: "#c8ccd4", roughness: 0.4, metalness: 0.7 }), mergeGeometries(rails));
  if (girders.length) put("girder", std({ color: theme === "coastal" ? "#c43a2a" : "#6a6f7a", roughness: 0.5, metalness: 0.6 }), mergeGeometries(girders));
  if (tunnelWalls.length) put("tunnel", std({ color: "#3a3d44", roughness: 0.85 }), mergeGeometries(tunnelWalls));
  if (tunnelLights.length) put("tunnelLight", basic({ color: "#ffe6b0", toneMapped: false }), mergeGeometries(tunnelLights));
  // elevated highways (Metro): visual decks high above the street
  const hw = [];
  const hwLights = [];
  for (const [axis, idx] of city.def.highways || []) {
    if (axis === "h") {
      const z = city.Z[idx];
      hw.push(boxAt(B.x1 - B.x0, 1.4, 16, (B.x0 + B.x1) / 2, 17, z));
      hwLights.push(boxAt(B.x1 - B.x0, 0.25, 0.3, (B.x0 + B.x1) / 2, 17.8, z + 8));
      hwLights.push(boxAt(B.x1 - B.x0, 0.25, 0.3, (B.x0 + B.x1) / 2, 17.8, z - 8));
      for (const x of city.X) for (const s of [-1, 1]) hw.push(boxAt(1.6, 16.3, 1.6, x + 10.5 * s, 8.15, z + 10 * s));
    } else {
      const x = city.X[idx];
      hw.push(boxAt(16, 1.4, B.z1 - B.z0, x, 21, (B.z0 + B.z1) / 2));
      hwLights.push(boxAt(0.3, 0.25, B.z1 - B.z0, x + 8, 21.8, (B.z0 + B.z1) / 2));
      hwLights.push(boxAt(0.3, 0.25, B.z1 - B.z0, x - 8, 21.8, (B.z0 + B.z1) / 2));
      for (const z of city.Z) for (const s of [-1, 1]) hw.push(boxAt(1.6, 20.3, 1.6, x + 10 * s, 10.15, z + 10.5 * s));
    }
  }
  if (hw.length) put("highway", std({ color: "#2a2438", roughness: 0.6, metalness: 0.5 }), mergeGeometries(hw));
  if (hwLights.length) put("hwLight", basic({ color: pal.neon[0], toneMapped: false }), mergeGeometries(hwLights));

  // --- street lamps (instanced) + light pools ------------------------------------------------------
  const lampPos = [];
  for (const e of city.edges) {
    if (e.kind === "drive" || e.kind === "tunnel") continue;
    const step = e.kind === "alley" ? 26 : 34;
    for (let t = 12, k = 0; t < e.len - 10; t += step, k++) {
      const side = k % 2 ? 1 : -1;
      const p = edgePoint(city, e, t, side * (e.w / 2 + 1.1));
      lampPos.push({ x: p.x, z: p.z, side, h: p.h });
    }
  }
  const nLamps = lampPos.length;
  const poleGeo = new THREE.CylinderGeometry(0.1, 0.14, 7.5, 6);
  poleGeo.translate(0, 3.75, 0);
  const headGeo = new THREE.BoxGeometry(0.5, 0.18, 1.2);
  const poleMat = new THREE.MeshStandardMaterial({ color: "#2a2d34", roughness: 0.5, metalness: 0.7 });
  const headMat = new THREE.MeshBasicMaterial({ color: pal.lamp, toneMapped: false });
  const poleI = new THREE.InstancedMesh(poleGeo, poleMat, nLamps);
  const headI = new THREE.InstancedMesh(headGeo, headMat, nLamps);
  const poolGeo = new THREE.PlaneGeometry(9, 9);
  poolGeo.rotateX(-Math.PI / 2);
  const poolMat = new THREE.MeshBasicMaterial({ map: softDot(), color: pal.lamp, transparent: true, opacity: wet ? 0.4 : 0.26, depthWrite: false, blending: THREE.AdditiveBlending });
  const poolI = new THREE.InstancedMesh(poolGeo, poolMat, nLamps);
  const M = new THREE.Matrix4();
  lampPos.forEach((l, i) => {
    M.makeTranslation(l.x, 0, l.z);
    poleI.setMatrixAt(i, M);
    // head leans over the road
    const lx = Math.cos(l.h) * -l.side;
    const lz = -Math.sin(l.h) * -l.side;
    M.makeRotationY(l.h);
    M.setPosition(l.x + lx * 1.0, 7.5, l.z + lz * 1.0);
    headI.setMatrixAt(i, M);
    M.makeTranslation(l.x + lx * 3, 0.04, l.z + lz * 3);
    poolI.setMatrixAt(i, M);
  });
  poolI.renderOrder = 2;
  group.add(poleI, headI, poolI);
  disposeList.push(poleGeo, headGeo, poleMat, headMat, poolGeo, poolMat);

  // --- traffic lights -----------------------------------------------------------------------------
  const tl = [];
  for (const n of city.nodes) {
    if (!n.light || !n.gi) continue;
    const [i, j] = n.gi;
    const hx = city.wx(i) / 2 + 1.2;
    const hz = city.wz(j) / 2 + 1.2;
    // two poles on opposite corners, each showing both axes
    for (const [sx, sz] of [
      [1, 1],
      [-1, -1],
    ])
      tl.push({ n, x: n.x + sx * hx, z: n.z + sz * hz });
  }
  const tlPole = new THREE.CylinderGeometry(0.12, 0.12, 5.2, 6);
  tlPole.translate(0, 2.6, 0);
  const tlPoleI = new THREE.InstancedMesh(tlPole, poleMat, Math.max(1, tl.length));
  const lampGeo = new THREE.SphereGeometry(0.32, 8, 6);
  const lampMatX = new THREE.MeshBasicMaterial({ color: "#ffffff", toneMapped: false });
  const tlLampI = new THREE.InstancedMesh(lampGeo, lampMatX, Math.max(1, tl.length * 2));
  tl.forEach((p, k) => {
    M.makeTranslation(p.x, 0, p.z);
    tlPoleI.setMatrixAt(k, M);
    M.makeTranslation(p.x + 0.4, 5.1, p.z);
    tlLampI.setMatrixAt(k * 2, M);
    M.makeTranslation(p.x, 5.1, p.z + 0.4);
    tlLampI.setMatrixAt(k * 2 + 1, M);
  });
  tlPoleI.count = tl.length;
  tlLampI.count = tl.length * 2;
  group.add(tlPoleI, tlLampI);
  disposeList.push(tlPole, lampGeo, lampMatX);
  const cGreen = new THREE.Color("#30ff7a");
  const cYellow = new THREE.Color("#ffc21a");
  const cRed = new THREE.Color("#ff2a2a");
  const colOf = (s) => (s === "green" ? cGreen : s === "yellow" ? cYellow : cRed);

  // --- merge static buckets -----------------------------------------------------------------------
  for (const [key, list] of buckets) {
    const geos = list.filter((g) => g && g.attributes && g.attributes.position && g.attributes.position.count);
    if (!geos.length) continue;
    const merged = mergeGeometries(geos.map((g) => (g.index ? g.toNonIndexed() : g)));
    geos.forEach((g) => g.dispose());
    const m = new THREE.Mesh(merged, mats.get(key));
    m.receiveShadow = key.startsWith("road") || key === "inter" || key === "side";
    m.castShadow = false;
    if (key === "crosswalk") m.renderOrder = 1;
    group.add(m);
    disposeList.push(merged);
  }
  for (const m of mats.values()) disposeList.push(m);

  // --- escape zone ---------------------------------------------------------------------------------
  const zone = city.zone;
  let zoneFx = null;
  if (zone) {
    const g = new THREE.Group();
    const r = zone.rect;
    const label = ZONE_LABEL[zone.kind] || "ESCAPE";
    const open = new THREE.MeshBasicMaterial({ color: "#2dff7a", toneMapped: false });
    const frameMat = new THREE.MeshStandardMaterial({ color: "#1a1d24", metalness: 0.6, roughness: 0.4 });
    // gate frame at the notch mouth
    const side = zone.side;
    const mouthZ = side === "N" ? zone.block.z0 : side === "S" ? zone.block.z1 : null;
    const mouthX = side === "W" ? zone.block.x0 : side === "E" ? zone.block.x1 : null;
    const across = side === "N" || side === "S";
    const W = 16;
    const H = 6;
    const cx = across ? zone.pos : mouthX;
    const cz = across ? mouthZ : zone.pos;
    const pillar = (dx, dz) => {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.9, H, 0.9), frameMat);
      p.position.set(cx + dx, H / 2, cz + dz);
      g.add(p);
      const s = new THREE.Mesh(new THREE.BoxGeometry(0.3, H - 0.6, 0.95), open);
      s.position.set(cx + dx, H / 2, cz + dz);
      g.add(s);
    };
    if (across) {
      pillar(-W / 2, 0);
      pillar(W / 2, 0);
    } else {
      pillar(0, -W / 2);
      pillar(0, W / 2);
    }
    const beamM = new THREE.Mesh(new THREE.BoxGeometry(across ? W + 1 : 1.2, 1.6, across ? 1.2 : W + 1), frameMat);
    beamM.position.set(cx, H + 0.6, cz);
    g.add(beamM);
    const signMat = new THREE.MeshBasicMaterial({ map: labelTex(label, { accent: "#2dff7a", bg: "#0a0d12", w: 512, h: 128, font: 76 }), toneMapped: false, side: THREE.DoubleSide });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(W - 1, 1.4), signMat);
    sign.position.set(cx, H + 0.6, cz);
    if (across) sign.position.z += side === "N" ? -0.65 : 0.65;
    else {
      sign.rotation.y = Math.PI / 2;
      sign.position.x += side === "W" ? -0.65 : 0.65;
    }
    g.add(sign);
    // the dark ramp down into the garage
    const pit = new THREE.Mesh(new THREE.BoxGeometry(r.x1 - r.x0, 0.2, r.z1 - r.z0), new THREE.MeshBasicMaterial({ color: "#020304" }));
    pit.position.set((r.x0 + r.x1) / 2, 0.03, (r.z0 + r.z1) / 2);
    g.add(pit);
    // beacon: a tall light column visible across the city
    const beamTexture = beamTex();
    const beaconMat = new THREE.MeshBasicMaterial({ map: beamTexture, color: "#2dff7a", transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
    const beacon = new THREE.Mesh(new THREE.CylinderGeometry(4, 6, 160, 16, 1, true), beaconMat);
    beacon.position.set(zone.x, 80, zone.z);
    g.add(beacon);
    const ring = new THREE.Mesh(new THREE.RingGeometry(5.5, 7, 32), new THREE.MeshBasicMaterial({ color: "#2dff7a", transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(zone.x, 0.08, zone.z);
    g.add(ring);
    group.add(g);
    zoneFx = { g, open, signMat, beaconMat, ring, frameMat };
  }

  // --- checkpoints (rings + beacons, built from the run) -----------------------------------------
  const cpGroup = new THREE.Group();
  group.add(cpGroup);
  let cpFx = [];
  const buildCheckpoints = (run) => {
    cpFx = run.checkpoints.map((cp, i) => {
      const g = new THREE.Group();
      const ring = new THREE.Mesh(new THREE.TorusGeometry(10, 0.35, 8, 48), new THREE.MeshBasicMaterial({ color: "#ffc21a", toneMapped: false }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(cp.x, 0.3, cp.z);
      const bm = new THREE.MeshBasicMaterial({ map: beamTex(), color: "#ffc21a", transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
      const b = new THREE.Mesh(new THREE.CylinderGeometry(3, 4.5, 120, 12, 1, true), bm);
      b.position.set(cp.x, 60, cp.z);
      const lm = new THREE.MeshBasicMaterial({ map: labelTex(`CHECKPOINT ${i + 1}`, { accent: "#ffc21a", w: 512, h: 128 }), transparent: true, side: THREE.DoubleSide, toneMapped: false });
      const lab = new THREE.Sprite(new THREE.SpriteMaterial({ map: lm.map, transparent: true, depthWrite: false }));
      lab.scale.set(14, 3.5, 1);
      lab.position.set(cp.x, 9, cp.z);
      lm.dispose();
      g.add(ring, b, lab);
      cpGroup.add(g);
      return { g, cp, ring, b };
    });
  };

  // --- nitro canisters --------------------------------------------------------------------------
  const canGeo = new THREE.CylinderGeometry(0.42, 0.42, 1.1, 14);
  const capGeo = new THREE.CylinderGeometry(0.45, 0.45, 0.16, 14);
  const nitroMat = new THREE.MeshStandardMaterial({ color: "#1f7bff", emissive: "#0a4bd6", emissiveIntensity: 1, metalness: 0.5, roughness: 0.3 });
  const capMat = new THREE.MeshStandardMaterial({ color: "#eef4ff", metalness: 0.9, roughness: 0.2 });
  const nGlow = new THREE.SpriteMaterial({ map: softDot(), color: "#5ac8ff", transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending });
  disposeList.push(canGeo, capGeo, nitroMat, capMat, nGlow);
  let nitroFx = [];
  const buildNitros = (run) => {
    nitroFx = run.nitros.map((nt) => {
      const g = new THREE.Group();
      g.position.set(nt.x, 1.3, nt.z);
      const inner = new THREE.Group();
      inner.rotation.z = 0.5;
      const c1 = new THREE.Mesh(capGeo, capMat);
      c1.position.y = 0.6;
      const c2 = new THREE.Mesh(capGeo, capMat);
      c2.position.y = -0.6;
      inner.add(new THREE.Mesh(canGeo, nitroMat), c1, c2);
      const glow = new THREE.Sprite(nGlow);
      glow.scale.setScalar(3.4);
      g.add(glow, inner);
      group.add(g);
      return { g, inner, nt };
    });
  };

  // --- roadblocks (live) ----------------------------------------------------------------------------
  const rbFx = new Map();
  const barrierMat = new THREE.MeshStandardMaterial({ map: hazardTex("#ff3030", "#f2f2f2"), roughness: 0.5 });
  const coneMat = new THREE.MeshStandardMaterial({ color: "#ff6a1a", roughness: 0.6, emissive: "#401000", emissiveIntensity: 0.4 });
  disposeList.push(barrierMat, coneMat);
  const policeDef = opts.policeDef;
  const buildRoadblock = (r) => {
    const g = new THREE.Group();
    g.position.set(r.x, 0, r.z);
    g.rotation.y = r.h;
    // local: +x = left of the road (lateral), +z along
    const span = r.hi - r.lo;
    const mid = (r.lo + r.hi) / 2;
    const cars = [];
    if (policeDef) {
      const n = span > 9 ? 2 : 1;
      for (let k = 0; k < n; k++) {
        const car = buildCar(policeDef, quality === "high" ? "medium" : "low", { police: true, glowTex: softDot(), decal: opts.decal });
        const lat = n === 1 ? mid : r.lo + (span * (k + 0.5)) / n;
        car.group.position.set(lat, 0, 0);
        car.group.rotation.y = Math.PI / 2 + (k ? 0.35 : -0.35);
        g.add(car.group);
        cars.push(car);
      }
    }
    for (const dz of [-2.4, 2.4]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(span, 1.0, 0.4), barrierMat);
      b.position.set(mid, 0.7, dz);
      g.add(b);
    }
    for (let k = 0; k < 4; k++) {
      const c = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.8, 10), coneMat);
      c.position.set(r.lo + (span * (k + 0.5)) / 4, 0.4, -4);
      g.add(c);
    }
    group.add(g);
    return { g, cars };
  };

  let lastRun = null;
  let flick = 0;
  function update(run, dt, t) {
    flick += dt;
    if (run !== lastRun) {
      lastRun = run;
      cpGroup.clear();
      for (const n of nitroFx) group.remove(n.g);
      if (run) {
        buildCheckpoints(run);
        buildNitros(run);
      }
    }
    if (waterTexture) {
      waterTexture.offset.x = t * 0.01;
      waterTexture.offset.y = t * 0.006;
    }
    // traffic lights
    if (tl.length) {
      tl.forEach((p, k) => {
        tlLampI.setColorAt(k * 2, colOf(lightFor(p.n, "x", run ? run.clock : t)));
        tlLampI.setColorAt(k * 2 + 1, colOf(lightFor(p.n, "z", run ? run.clock : t)));
      });
      if (tlLampI.instanceColor) tlLampI.instanceColor.needsUpdate = true;
    }
    const blinkOn = Math.sin(t * 3) > 0.6;
    for (const b of blinks) b.visible = blinkOn;
    if (!run) return;
    // zone: green when open, red while locked
    if (zoneFx) {
      const c = run.zoneOpen ? "#2dff7a" : "#ff3a3a";
      zoneFx.open.color.set(c);
      zoneFx.beaconMat.color.set(c);
      zoneFx.ring.material.color.set(c);
      zoneFx.ring.scale.setScalar(1 + Math.sin(t * 3) * 0.08);
      zoneFx.beaconMat.opacity = 0.4 + Math.sin(t * 2) * 0.12;
    }
    cpFx.forEach((c, i) => {
      const active = i === run.cpIndex;
      c.g.visible = !c.cp.done;
      c.b.visible = active;
      c.ring.material.color.set(active ? "#ffc21a" : "#806010");
      c.ring.rotation.z = t * 0.6;
    });
    nitroFx.forEach((n) => {
      const gone = run.clock - n.nt.taken < 18;
      n.g.visible = !gone;
      n.inner.rotation.y = t * 1.8;
      n.g.position.y = 1.3 + Math.sin(t * 2.4) * 0.18;
    });
    // roadblocks: add new, remove gone, flash lights
    const live = new Set(run.roadblocks.map((r) => r.id));
    for (const [id, fx] of rbFx) {
      if (!live.has(id)) {
        group.remove(fx.g);
        fx.cars.forEach((c) => c.dispose());
        rbFx.delete(id);
      }
    }
    for (const r of run.roadblocks) if (!rbFx.has(r.id)) rbFx.set(r.id, buildRoadblock(r));
    for (const fx of rbFx.values()) for (const c of fx.cars) c.update({ wheelSpin: 0, steer: 0, compress: 0, lean: 0, pitchA: 0, braking: true, nitro: false, boost: false, air: false, headlights: true, siren: flick }, dt);
  }

  return {
    group,
    update,
    dispose() {
      for (const fx of rbFx.values()) fx.cars.forEach((c) => c.dispose());
      group.traverse((o) => {
        if (o.isMesh && o.geometry && !disposeList.includes(o.geometry)) o.geometry.dispose();
      });
      for (const d of disposeList) d && d.dispose && d.dispose();
      if (zoneFx) {
        zoneFx.open.dispose();
        zoneFx.signMat.dispose();
        zoneFx.beaconMat.dispose();
        zoneFx.ring.material.dispose();
        zoneFx.frameMat.dispose();
      }
    },
  };
}

function shadeHex(hex, k) {
  const c = new THREE.Color(hex);
  if (k < 0) c.multiplyScalar(1 + k);
  else c.lerp(new THREE.Color("#ffffff"), k);
  return `#${c.getHexString()}`;
}
