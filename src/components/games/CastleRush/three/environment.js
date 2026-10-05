/**
 * Castle Rush — the battlefield surroundings for each kingdom.
 *
 * Everything is procedural and built once per (kingdom, quality): sky dome,
 * ground with a soft-edged dirt road, hills, mountains, instanced props
 * (trees, rocks, flowers, fences, ruins…), drifting clouds, flags, a windmill
 * and light weather. The middle of the lane is kept clear so soldiers stay
 * readable; tall props live behind the road, only low ones in front of it.
 *
 * `update(t, dt)` animates the few moving bits (clouds, flags, windmill,
 * weather, crystal pulse). No per-frame allocation.
 */
import * as THREE from "three";
import { FIELD } from "../engine/constants.js";
import { paint, merge, T, box, cyl, cone, sph, ico, dodec, dome, rng, vcMat } from "./geo.js";
import { groundTexture, roadTexture, skyTexture, blobTexture } from "./textures.js";
import { waveCloth } from "./castle.js";

const ROAD_Z = 3.0; // visual half width of the road
const CLEAR = { x: FIELD.castleX + 5.5, z: 6.4 }; // castle footprint (abs x > wallX)
const SHOW = { x: 0, z: 9.2 }; // keep in sync with Scene.jsx SHOWCASE

/* ================================================================ props */
const P = {};
function prop(key, make) {
  if (!P[key]) P[key] = make();
  return P[key];
}

const oak = (leaf, leaf2, trunk = "#7a5232") =>
  merge([
    paint(T(cyl(0.16, 0.24, 1.5, 7), 0, 0.75, 0), trunk, 0.1, 1),
    paint(T(ico(1.0, 1), 0, 2.1, 0, 0.3, 0.2, 0, 1, 0.9, 1), leaf, 0.14, 2),
    paint(T(ico(0.72, 1), 0.55, 2.55, 0.2, 0.1, 0.5, 0), leaf2, 0.14, 3),
    paint(T(ico(0.66, 1), -0.5, 2.45, -0.25, 0.4, 0.1, 0), leaf, 0.14, 4),
    paint(T(ico(0.55, 1), 0.05, 2.95, -0.1), leaf2, 0.14, 5),
  ]);
const pine = (c1, c2, trunk = "#6a4528", snow = null) => {
  const l = [paint(T(cyl(0.12, 0.18, 0.8, 6), 0, 0.4, 0), trunk, 0.1, 1)];
  const tiers = [
    [1.1, 1.4, 1.2],
    [0.85, 1.2, 1.95],
    [0.6, 1.0, 2.6],
  ];
  tiers.forEach(([r, h, y], i) => {
    l.push(paint(T(cone(r, h, 8), 0, y, 0, 0, i * 0.4, 0), i % 2 ? c2 : c1, 0.12, 6 + i));
    if (snow) l.push(paint(T(cone(r * 0.62, h * 0.42, 8), 0, y + h * 0.3, 0, 0, i * 0.4, 0), snow, 0.04, 9 + i));
  });
  return merge(l);
};
const bush = (c1, c2) => merge([paint(T(ico(0.5, 1), 0, 0.32, 0, 0, 0, 0, 1.2, 0.8, 1), c1, 0.15, 1), paint(T(ico(0.36, 1), 0.38, 0.28, 0.1), c2, 0.15, 2), paint(T(ico(0.3, 1), -0.35, 0.24, -0.08), c1, 0.15, 3)]);
const rock = (c1, c2) => merge([paint(T(dodec(0.55), 0, 0.25, 0, 0.3, 0.5, 0.2, 1.3, 0.75, 1), c1, 0.18, 1), paint(T(dodec(0.32), 0.5, 0.15, 0.2, 0.6, 0.1, 0.4), c2, 0.18, 2)]);
const flowers = (cols) => {
  const l = [];
  const r = rng(77);
  for (let i = 0; i < 7; i++) {
    const x = (r() - 0.5) * 1.1;
    const z = (r() - 0.5) * 1.1;
    l.push(paint(T(cyl(0.012, 0.012, 0.28, 3), x, 0.14, z), "#4f8a36"));
    l.push(paint(T(ico(0.065, 0), x, 0.3, z), cols[i % cols.length]));
  }
  l.push(paint(T(ico(0.18, 0), 0, 0.06, 0, 0, 0, 0, 3, 0.4, 3), "#5aa83f", 0.1, 3));
  return merge(l);
};
const fence = (wood = "#8a6038") =>
  merge([
    paint(T(box(0.12, 0.85, 0.12), -1.0, 0.42, 0), wood, 0.12, 1),
    paint(T(box(0.12, 0.85, 0.12), 1.0, 0.42, 0), wood, 0.12, 2),
    paint(T(box(2.2, 0.1, 0.06), 0, 0.62, 0, 0, 0, 0.03), wood, 0.12, 3),
    paint(T(box(2.2, 0.1, 0.06), 0, 0.32, 0, 0, 0, -0.02), wood, 0.12, 4),
  ]);
const pillar = (c1, c2) =>
  merge([
    paint(T(box(0.8, 0.25, 0.8), 0, 0.12, 0), c2, 0.1, 1),
    paint(T(cyl(0.28, 0.3, 1.8, 8), 0, 1.15, 0), c1, 0.12, 2),
    paint(T(cyl(0.3, 0.28, 0.5, 8), 0, 2.25, 0, 0.25, 0, 0.3), c1, 0.12, 3),
    paint(T(dodec(0.3), 0.6, 0.18, 0.3, 0.4, 0.3, 0), c2, 0.15, 4),
  ]);
const ruinWall = (c1, c2) =>
  merge([
    paint(T(box(2.6, 1.6, 0.5), 0, 0.8, 0), c1, 0.15, 1),
    paint(T(box(1.2, 0.8, 0.5), -0.7, 2.0, 0), c1, 0.15, 2),
    paint(T(box(0.6, 0.4, 0.5), 0.5, 1.8, 0), c2, 0.15, 3),
    paint(T(dodec(0.35), 1.4, 0.2, 0.6), c2, 0.15, 4),
    paint(T(dodec(0.25), -1.2, 0.15, 0.5), c1, 0.15, 5),
  ]);
const house = (wall, roof, wood = "#6e4524") =>
  merge([
    paint(T(box(2.2, 1.6, 1.8), 0, 0.8, 0), wall, 0.08, 1),
    paint(T(new THREE.CylinderGeometry(0.01, 1.7, 1.2, 4, 1), 0, 2.2, 0, 0, Math.PI / 4, 0, 1.0, 1, 0.85), roof, 0.08, 2),
    paint(T(box(0.5, 0.9, 0.06), 0.3, 0.45, 0.91), wood),
    paint(T(box(0.4, 0.4, 0.06), -0.6, 1.0, 0.91), "#ffe6a8"),
    paint(T(box(0.3, 0.9, 0.3), 0.6, 2.5, -0.3), "#8a7a6a"),
  ]);
const hay = () => merge([paint(T(cyl(0.45, 0.45, 0.7, 10), 0, 0.45, 0, Math.PI / 2, 0, 0), "#e2c060", 0.1, 1), paint(T(cyl(0.46, 0.46, 0.08, 10), 0, 0.45, 0.2, Math.PI / 2, 0, 0), "#c9a540")]);
const palm = () => {
  const l = [];
  for (let i = 0; i < 6; i++) l.push(paint(T(cyl(0.14 - i * 0.01, 0.16 - i * 0.01, 0.6, 7), Math.sin(i * 0.4) * 0.12 * i, 0.3 + i * 0.55, 0, 0, 0, -0.06 * i), i % 2 ? "#a8794a" : "#8f653b", 0.08, i));
  const top = [0.7, 3.3];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    l.push(paint(T(box(1.6, 0.05, 0.36), top[0] + Math.cos(a) * 0.75, top[1] - 0.25, Math.sin(a) * 0.75, 0, -a, -0.45), i % 2 ? "#4f9a3a" : "#3f8a32", 0.1, 10 + i));
  }
  l.push(paint(T(sph(0.2, 6, 5), top[0], top[1] - 0.1, 0), "#6a4a2a"));
  return merge(l);
};
const cactus = () =>
  merge([
    paint(T(cyl(0.22, 0.25, 1.8, 8), 0, 0.9, 0), "#5f9a46", 0.1, 1),
    paint(T(cyl(0.13, 0.15, 0.7, 8), 0.4, 1.0, 0, 0, 0, 0), "#5f9a46", 0.1, 2),
    paint(T(cyl(0.13, 0.13, 0.35, 8), 0.24, 0.72, 0, 0, 0, Math.PI / 2), "#5f9a46", 0.1, 3),
    paint(T(cyl(0.12, 0.14, 0.55, 8), -0.36, 1.25, 0), "#5f9a46", 0.1, 4),
    paint(T(cyl(0.12, 0.12, 0.3, 8), -0.22, 1.0, 0, 0, 0, Math.PI / 2), "#5f9a46", 0.1, 5),
    paint(T(dome(0.22, 8, 4), 0, 1.8, 0), "#6aa850", 0.1, 6),
  ]);
const deadTree = () => {
  const c = "#4a3a36";
  return merge([
    paint(T(cyl(0.12, 0.22, 2.2, 6), 0, 1.1, 0, 0, 0, 0.05), c, 0.1, 1),
    paint(T(cyl(0.05, 0.09, 1.2, 5), 0.4, 2.1, 0, 0, 0, -0.8), c, 0.1, 2),
    paint(T(cyl(0.04, 0.08, 1.0, 5), -0.35, 2.3, 0.1, 0.2, 0, 0.75), c, 0.1, 3),
    paint(T(cyl(0.03, 0.05, 0.6, 5), 0.75, 2.6, 0, 0, 0, -0.2), c, 0.1, 4),
    paint(T(cyl(0.03, 0.05, 0.7, 5), 0.0, 2.6, -0.3, -0.6, 0, 0.1), c, 0.1, 5),
  ]);
};
const crystal = () => merge([paint(T(cone(0.22, 1.3, 5), 0, 0.6, 0, 0, 0, 0.12), "#ffffff"), paint(T(cone(0.16, 0.9, 5), 0.25, 0.4, 0.1, 0.2, 0, -0.35), "#ffffff"), paint(T(cone(0.13, 0.7, 5), -0.22, 0.32, -0.05, -0.2, 0, 0.45), "#ffffff")]);
const statue = (stone, stoneD, gold) =>
  merge([
    paint(T(box(1.0, 0.9, 1.0), 0, 0.45, 0), stoneD, 0.08, 1),
    paint(T(box(1.15, 0.12, 1.15), 0, 0.92, 0), stone, 0.08, 2),
    paint(T(cyl(0.22, 0.32, 1.1, 8), 0, 1.55, 0), stone, 0.06, 3),
    paint(T(sph(0.2, 8, 6), 0, 2.25, 0), stone, 0.06, 4),
    paint(T(box(0.12, 1.2, 0.12), 0.32, 1.95, 0, 0, 0, -0.15), stone, 0.06, 5),
    paint(T(cone(0.12, 0.3, 5), 0.42, 2.65, 0), gold),
    paint(T(box(0.5, 0.6, 0.1), -0.3, 1.5, 0.18, 0, 0, 0.1), stone, 0.06, 6),
  ]);
const hedge = () => merge([paint(T(box(2.0, 0.9, 0.8), 0, 0.45, 0), "#3f7a35", 0.12, 1), paint(T(ico(0.45, 1), -0.6, 1.05, 0, 0, 0, 0, 1, 1, 1), "#4a8a3c", 0.12, 2), paint(T(ico(0.45, 1), 0.6, 1.05, 0), "#4a8a3c", 0.12, 3)]);
const cliff = (c1, c2) =>
  merge([
    paint(T(box(4.0, 2.2, 3.0), 0, 1.1, 0, 0, 0.1, 0), c1, 0.12, 1),
    paint(T(box(3.2, 1.6, 2.4), 0.3, 2.9, -0.2, 0, -0.2, 0), c2, 0.12, 2),
    paint(T(box(2.2, 1.2, 1.8), -0.2, 4.2, 0.1, 0, 0.3, 0), c1, 0.12, 3),
    paint(T(box(0.6, 0.2, 2.6), 1.9, 2.2, 0), c2, 0.1, 4),
  ]);
const torchPost = () => merge([paint(T(cyl(0.06, 0.08, 1.6, 6), 0, 0.8, 0), "#3a2a22"), paint(T(cyl(0.14, 0.08, 0.2, 6), 0, 1.65, 0), "#2a2a2e")]);
const snowDrift = () => merge([paint(T(sph(0.9, 10, 6), 0, -0.2, 0, 0, 0, 0, 1.6, 0.45, 1), "#f4f8fb", 0.04, 1), paint(T(sph(0.6, 10, 6), 0.9, -0.1, 0.2, 0, 0, 0, 1.4, 0.45, 1), "#eaf1f6", 0.04, 2)]);

function themeProps(k) {
  const g = k.grass;
  switch (k.props) {
    case "desert":
      return {
        big: [{ geo: prop("palm", palm), n: 16, s: [0.9, 1.25] }, { geo: prop("cliffD", () => cliff("#c98a52", "#d9a066")), n: 7, s: [1.0, 1.6], far: true }],
        mid: [{ geo: prop("cactus", cactus), n: 14, s: [0.7, 1.1] }, { geo: prop("pillarD", () => pillar("#dcbf8c", "#b8945e")), n: 6, s: [0.8, 1.1] }, { geo: prop("ruinD", () => ruinWall("#d6b47e", "#b8945e")), n: 3, s: [0.8, 1.0] }],
        low: [{ geo: prop("rockD", () => rock("#c39058", "#a87848")), n: 26, s: [0.5, 1.2] }, { geo: prop("bushD", () => bush("#9aa04a", "#868c3e")), n: 16, s: [0.5, 0.8] }],
      };
    case "frozen":
      return {
        big: [{ geo: prop("pineS", () => pine("#2f6a4f", "#3a7a5a", "#5a3e28", "#f2f7fa")), n: 44, s: [0.9, 1.5] }],
        mid: [{ geo: prop("crystalI", crystal), n: 10, s: [0.7, 1.3], glow: "#9fe6ff" }, { geo: prop("ruinF", () => ruinWall("#a9b9c8", "#8a9cae")), n: 3, s: [0.8, 1.0] }],
        low: [{ geo: prop("rockF", () => rock("#9fb0c0", "#e9f0f5")), n: 26, s: [0.5, 1.2] }, { geo: prop("drift", snowDrift), n: 20, s: [0.6, 1.3] }],
      };
    case "shadow":
      return {
        big: [{ geo: prop("dead", deadTree), n: 30, s: [0.9, 1.4] }, { geo: prop("pineX", () => pine("#2a3a32", "#32443a", "#2a2220")), n: 18, s: [0.9, 1.3] }],
        mid: [{ geo: prop("crystalS", crystal), n: 16, s: [0.7, 1.5], glow: "#b46cff" }, { geo: prop("pillarS", () => pillar("#6e6a76", "#4c4856")), n: 6, s: [0.8, 1.1] }, { geo: prop("torchPost", torchPost), n: 6, s: [1, 1], flame: true }],
        low: [{ geo: prop("rockS", () => rock("#4a4652", "#3a3742")), n: 26, s: [0.5, 1.2] }, { geo: prop("bushS", () => bush("#3a4a36", "#2f3c2c")), n: 16, s: [0.5, 0.8] }],
      };
    case "royal":
      return {
        big: [{ geo: prop("oakR", () => oak("#5a9a3c", "#6aaa46")), n: 22, s: [0.9, 1.3] }, { geo: prop("pineR", () => pine("#3d7a40", "#4a8a48")), n: 12, s: [0.9, 1.3] }],
        mid: [{ geo: prop("statue", () => statue("#e2d6bf", "#b6a787", "#e8bf4f")), n: 6, s: [0.95, 1.15] }, { geo: prop("hedge", hedge), n: 12, s: [0.8, 1.1] }, { geo: prop("pillarR", () => pillar("#e8dcc4", "#c2b294")), n: 6, s: [0.9, 1.2] }],
        low: [{ geo: prop("rockR", () => rock("#b9ae98", "#9e927c")), n: 14, s: [0.5, 1.0] }, { geo: prop("flowersR", () => flowers(["#ffd34a", "#ff6a5a", "#ffffff", "#c86aff"])), n: 40, s: [0.8, 1.3] }],
      };
    default:
      return {
        big: [{ geo: prop("oak", () => oak("#4f9a3a", "#62b04a")), n: 30, s: [0.9, 1.35] }, { geo: prop("pine", () => pine("#2f7a3f", "#3a8a48")), n: 22, s: [0.9, 1.4] }],
        mid: [{ geo: prop("house", () => house("#efe0c4", "#b8543a")), n: 4, s: [0.9, 1.1], village: true }, { geo: prop("ruinG", () => ruinWall("#b9b2a4", "#8f877a")), n: 3, s: [0.8, 1.0] }, { geo: prop("hay", hay), n: 6, s: [0.8, 1.0] }],
        low: [
          { geo: prop("bush", () => bush(g[1], g[3])), n: 24, s: [0.5, 0.9] },
          { geo: prop("rock", () => rock("#9a958a", "#7f7a70")), n: 18, s: [0.4, 1.0] },
          { geo: prop("flowers", () => flowers(["#ffd34a", "#ff6a7a", "#ffffff", "#9a7aff"])), n: 46, s: [0.8, 1.3] },
        ],
      };
  }
}

/** pick a free spot in a band, avoiding the road and the castle footprints */
function spot(r, band) {
  for (let tries = 0; tries < 30; tries++) {
    const x = band.x0 + r() * (band.x1 - band.x0);
    const z = band.z0 + r() * (band.z1 - band.z0);
    if (Math.abs(z) < ROAD_Z + 0.6 && Math.abs(x) < FIELD.castleX + 6) continue;
    if (Math.abs(x) > FIELD.wallX - 0.8 && Math.abs(x) < CLEAR.x && Math.abs(z) < CLEAR.z) continue;
    if (Math.hypot(x - SHOW.x, z - SHOW.z) < 4.2) continue; // Army-screen dais
    return [x, z];
  }
  return null;
}

function instanced(geo, mat, transforms, castShadow) {
  const m = new THREE.InstancedMesh(geo, mat, Math.max(1, transforms.length));
  const o = new THREE.Object3D();
  transforms.forEach(([x, y, z, ry, s], i) => {
    o.position.set(x, y, z);
    o.rotation.set(0, ry, 0);
    o.scale.setScalar(s);
    o.updateMatrix();
    m.setMatrixAt(i, o.matrix);
  });
  m.count = transforms.length;
  m.castShadow = castShadow;
  m.receiveShadow = true;
  m.instanceMatrix.needsUpdate = true;
  m.computeBoundingSphere();
  return m;
}

/* ================================================================ build */
export function buildEnvironment(k, quality = "medium") {
  const group = new THREE.Group();
  const q = quality === "low" ? 0.45 : quality === "high" ? 1.15 : 0.8;
  const r = rng(k.id * 131 + 7);
  const anim = { clouds: [], flags: [], mills: [], crystals: [], flames: [], weather: null };
  const mat = vcMat("env");
  const groundMat = new THREE.MeshStandardMaterial({ vertexColors: true, map: groundTexture(), roughness: 1 });
  groundTexture().repeat.set(26, 20);

  /* sky */
  const sky = new THREE.Mesh(new THREE.SphereGeometry(320, 24, 12), new THREE.MeshBasicMaterial({ map: skyTexture(k.skyTop, k.sky, k.id), side: THREE.BackSide, fog: false, depthWrite: false }));
  sky.position.y = -20;
  group.add(sky);

  /* ground: flat battlefield, rolling outskirts */
  {
    const W = 300;
    const D = 240;
    const g = new THREE.PlaneGeometry(W, D, 120, 90);
    g.rotateX(-Math.PI / 2);
    const p = g.attributes.position;
    const col = new Float32Array(p.count * 3);
    const c = new THREE.Color();
    const cs = k.grass.map((h) => new THREE.Color(h));
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const z = p.getZ(i);
      const n = Math.sin(x * 0.11) * Math.cos(z * 0.13) + Math.sin(x * 0.031 + z * 0.047) * 0.8 + Math.sin(x * 0.27 - z * 0.19) * 0.25;
      // height: keep the battlefield flat, rise into hills behind and at the sides
      const back = Math.max(0, -z - 14) / 30;
      const side = Math.max(0, Math.abs(x) - 34) / 30;
      const front = Math.max(0, z - 22) / 20;
      const h = (back * back * 9 + side * side * 6 + front * 2) * (0.75 + 0.25 * (n + 1));
      p.setY(i, h - 0.02);
      const t = (n + 2) / 4;
      const a = cs[Math.floor(t * 3.99) % 4];
      c.copy(a).lerp(cs[(Math.floor(t * 3.99) + 1) % 4], (t * 4) % 1);
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
    }
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, groundMat);
    m.receiveShadow = true;
    group.add(m);
  }

  /* road: soft-edged dirt strip from gate to gate */
  {
    const len = FIELD.castleX * 2 + 2;
    const g = new THREE.PlaneGeometry(len, ROAD_Z * 2, 40, 1);
    g.rotateX(-Math.PI / 2);
    const t = roadTexture().clone();
    t.repeat.set(len / 10, 1);
    t.needsUpdate = true;
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: k.road, map: t, transparent: true, roughness: 1, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
    m.position.y = 0.012;
    m.receiveShadow = true;
    m.renderOrder = 0;
    group.add(m);
    // edge stones along the road
    const st = [];
    const sr = rng(5);
    for (let x = -FIELD.wallX + 0.6; x < FIELD.wallX - 0.6; x += 0.9 + sr() * 1.6) {
      for (const sz of [-1, 1]) {
        if (sr() < 0.35) continue;
        st.push(paint(T(dodec(0.12 + sr() * 0.1), x, 0.05, sz * (ROAD_Z - 0.15 + sr() * 0.4), sr() * 3, sr() * 3, 0, 1.3, 0.6, 1), k.roadEdge, 0.2, st.length));
      }
    }
    if (st.length) group.add(new THREE.Mesh(merge(st), mat));
  }

  /* far hills + mountains */
  {
    const hills = [];
    const hr = rng(k.id * 17);
    for (let i = 0; i < 16; i++) {
      const x = -140 + i * 19 + hr() * 8;
      const z = -48 - hr() * 30;
      const s = 14 + hr() * 14;
      hills.push(paint(T(sph(1, 12, 8), x, -s * 0.45, z, 0, 0, 0, s * 1.5, s * 0.75, s), i % 2 ? k.hill : k.hillFar, 0.08, i));
    }
    group.add(new THREE.Mesh(merge(hills), vcMat("hill", { fog: true })));
    const mts = [];
    for (let i = 0; i < 11; i++) {
      const x = -170 + i * 34 + hr() * 14;
      const z = -110 - hr() * 40;
      const h = 34 + hr() * 30;
      const rr = 22 + hr() * 12;
      mts.push(paint(T(cone(rr, h, 7), x, h / 2 - 4, z, 0, hr() * 3, 0), k.mountain, 0.1, i + 30));
      if (k.snowcap) mts.push(paint(T(cone(rr * 0.36, h * 0.36, 7), x, h - 4 - h * 0.18 + 0.4, z, 0, hr() * 3, 0), "#f2f6fa", 0.04, i + 60));
    }
    group.add(new THREE.Mesh(merge(mts), vcMat("mount")));
  }

  /* instanced props */
  const T3 = themeProps(k);
  const bands = {
    // behind the road (tall things allowed)
    back: { x0: -44, x1: 44, z0: -26, z1: -6.5 },
    backNear: { x0: -14, x1: 14, z0: -9, z1: -4.2 },
    // in front of the road (low things only, kept away from the lane)
    front: { x0: -30, x1: 30, z0: 5.6, z1: 14 },
    sides: { x0: -46, x1: 46, z0: -14, z1: 12 },
  };
  const addSet = (list, band, mult, shadow) => {
    for (const item of list) {
      const n = Math.max(1, Math.round(item.n * mult * q));
      const tr = [];
      for (let i = 0; i < n; i++) {
        const b = item.far ? { x0: -60, x1: 60, z0: -38, z1: -18 } : item.village ? { x0: i % 2 ? 20 : -34, x1: i % 2 ? 34 : -20, z0: -16, z1: -9 } : band;
        const s = spot(r, b);
        if (!s) continue;
        if (b === bands.sides && Math.abs(s[0]) < FIELD.castleX + 4) continue;
        const sc = item.s[0] + r() * (item.s[1] - item.s[0]);
        tr.push([s[0], 0, s[1], r() * Math.PI * 2, sc]);
      }
      if (!tr.length) continue;
      let m;
      if (item.glow) {
        const gm = new THREE.MeshStandardMaterial({ color: item.glow, emissive: item.glow, emissiveIntensity: 0.9, roughness: 0.3, flatShading: true, transparent: true, opacity: 0.92 });
        m = instanced(item.geo, gm, tr, false);
        anim.crystals.push(gm);
      } else m = instanced(item.geo, mat, tr, shadow);
      group.add(m);
      if (item.flame) {
        const fm = new THREE.MeshStandardMaterial({ color: "#c47cff", emissive: "#b46cff", emissiveIntensity: 2 });
        for (const [x, , z, , s] of tr) {
          const f = new THREE.Mesh(cone(0.12, 0.34, 6), fm);
          f.position.set(x, 1.95 * s, z);
          group.add(f);
          anim.flames.push(f);
        }
      }
    }
  };
  addSet(T3.big, bands.back, 1, quality !== "low");
  addSet(T3.big, bands.sides, 0.5, quality !== "low");
  addSet(T3.mid, bands.back, 1, quality !== "low");
  addSet(T3.low, bands.backNear, 0.45, false);
  addSet(T3.low, bands.front, 0.7, false);
  addSet(T3.low, bands.back, 0.5, false);

  /* fences + flags along the road edge (never on it) */
  {
    const fr = rng(k.id * 3 + 1);
    const fences = [];
    for (const zz of [-ROAD_Z - 1.4]) {
      for (let x = -11; x <= 11; x += 2.3) {
        if (fr() < 0.45) continue;
        fences.push([x, 0, zz, (fr() - 0.5) * 0.15, 1]);
      }
    }
    const fenceGeo = prop(`fence${k.props}`, () => fence(k.props === "frozen" ? "#7a5a3e" : k.props === "shadow" ? "#4a3a32" : "#8a6038"));
    if (fences.length) group.add(instanced(fenceGeo, mat, fences, quality !== "low"));
    // war banners on poles along the back edge: blue on our half, red on theirs
    for (const [x, side] of [
      [-9.5, "player"],
      [-4.5, "player"],
      [4.5, "enemy"],
      [9.5, "enemy"],
    ]) {
      const pole = new THREE.Mesh(paint(cyl(0.05, 0.06, 3.0, 6), "#5a3c22"), mat);
      pole.position.set(x, 1.5, -ROAD_Z - 2.3);
      pole.castShadow = true;
      const g = new THREE.PlaneGeometry(1.0, 0.62, 8, 2);
      g.translate(0.5, 0, 0);
      const cloth = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: side === "player" ? "#2f78e0" : "#d23a2c", side: THREE.DoubleSide, roughness: 0.9 }));
      cloth.position.set(x, 2.65, -ROAD_Z - 2.3);
      if (side === "enemy") cloth.rotation.y = Math.PI;
      cloth.userData.base = Float32Array.from(g.attributes.position.array);
      cloth.userData.flag = true;
      group.add(pole, cloth);
      anim.flags.push(cloth);
    }
  }

  /* windmill on a hill (green kingdom / royal) */
  if (k.props === "forest" || k.props === "royal") {
    const wm = new THREE.Group();
    wm.add(new THREE.Mesh(merge([paint(T(cyl(0.9, 1.4, 4.2, 8), 0, 2.1, 0), "#efe2c6", 0.06, 1), paint(T(cone(1.25, 1.4, 8), 0, 4.9, 0), "#a0442e", 0.06, 2), paint(T(box(0.6, 0.9, 0.1), 0, 0.45, 1.25), "#6e4524")]), mat));
    const blades = new THREE.Group();
    for (let i = 0; i < 4; i++) {
      const b = new THREE.Mesh(merge([paint(T(box(0.12, 2.6, 0.06), 0, 1.35, 0), "#6e4524"), paint(T(box(0.6, 2.0, 0.03), 0.34, 1.55, 0), "#f2ead8", 0.05, i)]), mat);
      b.rotation.z = (i / 4) * Math.PI * 2;
      blades.add(b);
    }
    blades.position.set(0, 4.3, 1.1);
    wm.add(blades);
    wm.position.set(29, 0, -19);
    wm.rotation.y = -0.5;
    wm.scale.setScalar(1.2);
    wm.traverse((o) => (o.castShadow = quality !== "low"));
    group.add(wm);
    anim.mills.push(blades);
  }

  /* clouds */
  {
    const cm = new THREE.MeshStandardMaterial({ color: k.clouds, roughness: 1, flatShading: true, transparent: true, opacity: 0.94, fog: false });
    const cr = rng(k.id * 29);
    const n = quality === "low" ? 5 : 9;
    for (let i = 0; i < n; i++) {
      const cg = new THREE.Group();
      const puffs = 4 + Math.floor(cr() * 3);
      for (let j = 0; j < puffs; j++) {
        const m = new THREE.Mesh(ico(1, 1), cm);
        m.scale.set(2.4 + cr() * 2, 1.4 + cr() * 1.0, 2 + cr() * 1.2);
        m.position.set(j * 2.4 - puffs * 1.2, cr() * 0.8, cr() * 1.2);
        cg.add(m);
      }
      cg.position.set(-120 + cr() * 240, 26 + cr() * 14, -40 - cr() * 50);
      cg.userData.speed = 0.6 + cr() * 0.8;
      group.add(cg);
      anim.clouds.push(cg);
    }
  }

  /* weather particles */
  if (quality !== "low") {
    const n = quality === "high" ? 520 : 300;
    const pos = new Float32Array(n * 3);
    const wr = rng(k.id * 5);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (wr() - 0.5) * 60;
      pos[i * 3 + 1] = wr() * 14;
      pos[i * 3 + 2] = -14 + wr() * 26;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const w = k.weather;
    const color = w === "snow" ? "#ffffff" : w === "sand" ? "#f2d9a6" : w === "embers" ? "#c58bff" : w === "motes" ? "#ffe9a8" : "#fff8c8";
    const size = w === "snow" ? 0.16 : w === "sand" ? 0.07 : 0.1;
    const pm = new THREE.PointsMaterial({ color, size, map: blobTexture(), transparent: true, opacity: w === "snow" ? 0.9 : 0.75, depthWrite: false, blending: w === "embers" || w === "motes" ? THREE.AdditiveBlending : THREE.NormalBlending });
    const pts = new THREE.Points(g, pm);
    group.add(pts);
    anim.weather = { pts, kind: w, n };
  }

  /* shadow kingdom ground fog */
  if (k.props === "shadow") {
    const fm = new THREE.MeshBasicMaterial({ map: blobTexture(), color: "#8a78b8", transparent: true, opacity: 0.18, depthWrite: false });
    for (let i = 0; i < 8; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(18, 5), fm);
      m.rotation.x = -Math.PI / 2;
      m.position.set(-36 + i * 10, 0.3, -7 - (i % 3) * 4);
      group.add(m);
    }
  }

  function update(t, dt) {
    for (const c of anim.clouds) {
      c.position.x += c.userData.speed * dt;
      if (c.position.x > 140) c.position.x = -140;
    }
    waveCloth(anim.flags, t);
    for (const m of anim.mills) m.rotation.z += dt * 0.6;
    for (const m of anim.crystals) m.emissiveIntensity = 0.75 + Math.sin(t * 2) * 0.25;
    for (let i = 0; i < anim.flames.length; i++) anim.flames[i].scale.y = 1 + Math.sin(t * 13 + i * 2) * 0.15;
    const w = anim.weather;
    if (w) {
      const p = w.pts.geometry.attributes.position;
      const fall = w.kind === "snow" ? 1.1 : w.kind === "embers" ? -0.5 : w.kind === "sand" ? 0.05 : -0.08;
      const drift = w.kind === "sand" ? 3.5 : w.kind === "snow" ? 0.5 : 0.3;
      for (let i = 0; i < w.n; i++) {
        let x = p.getX(i) + (drift + Math.sin(t + i) * 0.3) * dt;
        let y = p.getY(i) - fall * dt + Math.sin(t * 1.3 + i * 1.7) * 0.004;
        if (x > 30) x -= 60;
        if (y < 0) y += 14;
        if (y > 14) y -= 14;
        p.setX(i, x);
        p.setY(i, y);
      }
      p.needsUpdate = true;
    }
  }

  return { group, update };
}
