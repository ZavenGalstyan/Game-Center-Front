/**
 * Web Hero — renders one district's generated city (engine/city.js).
 *
 * Draw-call budget: every building face of one skin is merged into ONE mesh
 * with world-scaled UVs (facade tiles repeat by metres, so a 100 m tower and
 * a 20 m shop share a texture without stretching) and a per-vertex tint;
 * roofs and cornices are one mesh each; every repeated prop (street lights,
 * traffic lights, trees, cars, containers, roof units, tanks, benches,
 * pedestrians, moving traffic) is an InstancedMesh.
 *
 * update(t, dt, hero) animates traffic (cars brake for the hero), walking
 * pedestrians, blinking antenna beacons and water.
 */
import * as THREE from "three";
import { facade, roof as roofTex, ground as groundTex, billboard, neon, containerTex, waterNormal, TILE_W, TILE_H, SKIN_IDS } from "./textures.js";
import { PITCH } from "../engine/city.js";

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _e = new THREE.Euler();
const _c = new THREE.Color();

/** append the 4 side faces (+ optional top) of an AABB to arrays with metre UVs */
function pushBox(A, b, { top = false, sides = true, tint = 1, uOff = 0, vOff = 0 } = {}) {
  const { x0, x1, y0, y1, z0, z1 } = b;
  const quad = (p0, p1, p2, p3, n, uv) => {
    const base = A.pos.length / 3;
    for (const p of [p0, p1, p2, p3]) A.pos.push(p[0], p[1], p[2]);
    for (let i = 0; i < 4; i++) A.nor.push(n[0], n[1], n[2]);
    for (const u of uv) A.uv.push(u[0], u[1]);
    for (let i = 0; i < 4; i++) A.col.push(tint, tint, tint);
    A.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  const V = (y) => (y + vOff) / TILE_H;
  if (sides) {
    // +Z face (south)
    quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], [[(x0 + uOff) / TILE_W, V(y0)], [(x1 + uOff) / TILE_W, V(y0)], [(x1 + uOff) / TILE_W, V(y1)], [(x0 + uOff) / TILE_W, V(y1)]]);
    // -Z face
    quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], [[(-x1 + uOff) / TILE_W, V(y0)], [(-x0 + uOff) / TILE_W, V(y0)], [(-x0 + uOff) / TILE_W, V(y1)], [(-x1 + uOff) / TILE_W, V(y1)]]);
    // +X face
    quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], [[(-z1 + uOff) / TILE_W, V(y0)], [(-z0 + uOff) / TILE_W, V(y0)], [(-z0 + uOff) / TILE_W, V(y1)], [(-z1 + uOff) / TILE_W, V(y1)]]);
    // -X face
    quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], [[(z0 + uOff) / TILE_W, V(y0)], [(z1 + uOff) / TILE_W, V(y0)], [(z1 + uOff) / TILE_W, V(y1)], [(z0 + uOff) / TILE_W, V(y1)]]);
  }
  if (top) quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0], [[x0 / 8, z1 / 8], [x1 / 8, z1 / 8], [x1 / 8, z0 / 8], [x0 / 8, z0 / 8]]);
}
function newArrays() {
  return { pos: [], nor: [], uv: [], col: [], idx: [] };
}
function toGeo(A) {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(A.pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(A.nor, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(A.uv, 2));
  g.setAttribute("color", new THREE.Float32BufferAttribute(A.col, 3));
  g.setIndex(A.idx);
  g.computeBoundingSphere();
  return g;
}

export function buildCityMesh(C, D, { shadows, envMap, quality, arena = null }) {
  const group = new THREE.Group();
  const disposables = [];
  const own = (x) => (disposables.push(x), x);
  const night = D.time === "night" || D.time === "storm";
  const dusk = D.time === "dusk";
  const winGlow = night ? 1.25 : dusk ? 0.45 : 0;

  /* ---------------- buildings: one merged mesh per skin */
  const bySkin = new Map();
  const roofA = newArrays();
  const corA = newArrays();
  const glassy = new Set(["glass", "glassB", "dark", "darkB"]);
  for (const b of C.buildings) {
    if (b.lighthouse) continue;
    const skin = SKIN_IDS.includes(b.skin) ? b.skin : "concrete";
    if (!bySkin.has(skin)) bySkin.set(skin, newArrays());
    const tint = 0.82 + b.tint * 0.3;
    // offset UVs per building so neighbours don't line up identically
    pushBox(bySkin.get(skin), b, { tint, uOff: Math.floor(b.tint * 4) * 4, vOff: Math.floor(b.tint * 3) * 3.5 });
    pushBox(roofA, b, { sides: false, top: true, tint: 0.9 + b.tint * 0.15 });
    // cornice: a slab just under the roof line, slightly proud of the facade
    const o = b.y1 - b.y0 > 30 ? 0.45 : 0.3;
    pushBox(corA, { x0: b.x0 - o, x1: b.x1 + o, z0: b.z0 - o, z1: b.z1 + o, y0: b.y1 - 0.55, y1: b.y1 }, { top: false, tint: 0.95 });
    // a ground-floor storefront band on tall street-facing buildings
    if (b.y0 < 0.5 && b.y1 > 14) pushBox(corA, { x0: b.x0 - 0.25, x1: b.x1 + 0.25, z0: b.z0 - 0.25, z1: b.z1 + 0.25, y0: 3.6, y1: 4.2 }, { tint: 0.75 });
  }
  for (const [skin, A] of bySkin) {
    const T = facade(skin);
    const mat = own(
      new THREE.MeshStandardMaterial({
        map: T.map,
        vertexColors: true,
        roughness: glassy.has(skin) ? 0.22 : 0.85,
        metalness: glassy.has(skin) ? 0.55 : 0.05,
        envMap: glassy.has(skin) ? envMap : null,
        envMapIntensity: glassy.has(skin) ? 1.0 : 0,
        emissive: winGlow ? "#ffffff" : "#000000",
        emissiveMap: winGlow ? T.emissive : null,
        emissiveIntensity: winGlow,
      }),
    );
    const m = new THREE.Mesh(own(toGeo(A)), mat);
    m.castShadow = shadows;
    m.receiveShadow = shadows;
    group.add(m);
  }
  {
    const rt = roofTex();
    const m = new THREE.Mesh(own(toGeo(roofA)), own(new THREE.MeshStandardMaterial({ map: rt, vertexColors: true, roughness: 0.95, color: night ? "#8a8a96" : "#d8d4cc" })));
    m.receiveShadow = shadows;
    group.add(m);
    const cm = new THREE.Mesh(own(toGeo(corA)), own(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.2, color: night ? "#4a4c58" : "#d7d2c8" })));
    cm.castShadow = shadows;
    cm.receiveShadow = shadows;
    group.add(cm);
  }

  /* ---------------- lighthouse */
  for (const b of C.buildings) {
    if (!b.lighthouse) continue;
    const h = b.y1 - b.y0;
    const cx = (b.x0 + b.x1) / 2;
    const cz = (b.z0 + b.z1) / 2;
    const lt = own(stripeTex());
    const tower = new THREE.Mesh(own(new THREE.CylinderGeometry(2.4, 3.2, h, 20)), own(new THREE.MeshStandardMaterial({ map: lt, roughness: 0.6 })));
    tower.position.set(cx, b.y0 + h / 2, cz);
    tower.castShadow = shadows;
    group.add(tower);
    const lamp = new THREE.Mesh(own(new THREE.CylinderGeometry(1.6, 1.6, 2.4, 12)), own(new THREE.MeshStandardMaterial({ color: "#fff6c8", emissive: "#ffe27a", emissiveIntensity: 1.6 })));
    lamp.position.set(cx, b.y1 + 1.2, cz);
    group.add(lamp);
    const cap = new THREE.Mesh(own(new THREE.ConeGeometry(2.2, 2, 12)), own(new THREE.MeshStandardMaterial({ color: "#b22222", roughness: 0.5 })));
    cap.position.set(cx, b.y1 + 3.4, cz);
    group.add(cap);
  }

  /* ---------------- ground + water */
  const G = groundTex(C, D);
  const groundM = new THREE.Mesh(own(new THREE.PlaneGeometry(G.ext * 2, G.ext * 2)), own(new THREE.MeshStandardMaterial({ map: G.map, roughness: night ? 0.45 : 0.92, metalness: night ? 0.15 : 0, envMap: night ? envMap : null, envMapIntensity: night ? 0.6 : 0 })));
  groundM.rotation.x = -Math.PI / 2;
  groundM.receiveShadow = shadows;
  if (C.water) {
    // clip the land plane at the shoreline: draw it as a strip
    const w = C.water.x0 + G.ext;
    groundM.geometry.dispose();
    groundM.geometry = own(new THREE.PlaneGeometry(w, G.ext * 2));
    groundM.position.x = -G.ext + w / 2;
    const uv = groundM.geometry.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * (w / (G.ext * 2)));
  }
  group.add(groundM);
  // land beyond the street plan
  const far = new THREE.Mesh(own(new THREE.PlaneGeometry(4000, 4000)), own(new THREE.MeshStandardMaterial({ color: night ? "#1c1e24" : D.key === "industrial" ? "#5d5a54" : "#4f535a", roughness: 1 })));
  far.rotation.x = -Math.PI / 2;
  far.position.y = -0.05;
  if (!C.water) group.add(far);

  let water = null;
  if (C.water) {
    const wn = waterNormal();
    wn.repeat.set(60, 60);
    water = new THREE.Mesh(own(new THREE.PlaneGeometry(4000, 4000)), own(new THREE.MeshStandardMaterial({ color: "#1d6f8f", roughness: 0.12, metalness: 0.35, normalMap: wn, normalScale: new THREE.Vector2(0.6, 0.6), envMap, envMapIntensity: 1.1, transparent: true, opacity: 0.94 })));
    water.rotation.x = -Math.PI / 2;
    water.position.y = C.water.y + 1.2;
    group.add(water);
    // sea wall along the shore
    const sw = new THREE.Mesh(own(new THREE.BoxGeometry(1.2, 4.6, C.half * 2 + 100)), own(new THREE.MeshStandardMaterial({ color: "#8d8a80", roughness: 0.9 })));
    sw.position.set(C.water.x0 - 0.6, -2.3, 0);
    group.add(sw);
  }

  /* ---------------- generic instancing helper */
  const inst = (geo, mat, list, place, opts = {}) => {
    if (!list.length) return null;
    const im = new THREE.InstancedMesh(own(geo), own(mat), list.length);
    list.forEach((it, i) => {
      place(it, i);
      im.setMatrixAt(i, _m);
      if (opts.color) im.setColorAt(i, opts.color(it, i));
    });
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.castShadow = !!(opts.cast && shadows);
    im.receiveShadow = !!(opts.receive && shadows);
    group.add(im);
    return im;
  };
  const M = (x, y, z, ry = 0, sx = 1, sy = 1, sz = 1, rx = 0, rz = 0) => {
    _e.set(rx, ry, rz);
    _q.setFromEuler(_e);
    _m.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
  };
  // a boss arena keeps its floor clear of (collision-less) decorative props
  const outside = (x, z, pad = 1.5) => !arena || Math.hypot(x - arena.x, z - arena.z) > arena.r + pad;
  const P = {
    ...C.props,
    trees: C.props.trees.filter((t) => outside(t.x, t.z)),
    benches: C.props.benches.filter((b) => outside(b.x, b.z)),
    fountains: C.props.fountains.filter((f) => outside(f.x, f.z, f.big ? 6 : 3.5)),
    billboards: C.props.billboards.filter((b) => outside(b.x, b.z)),
  };
  if (arena) {
    const ring = new THREE.Mesh(own(new THREE.RingGeometry(arena.r - 0.5, arena.r, 72)), own(new THREE.MeshBasicMaterial({ color: "#ff4a3a", transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide })));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(arena.x, (arena.y || 0) + 0.05, arena.z);
    group.add(ring);
    const disc = new THREE.Mesh(own(new THREE.CircleGeometry(arena.r - 0.5, 72)), own(new THREE.MeshStandardMaterial({ color: night ? "#2a2a34" : "#8a8478", roughness: 0.8, metalness: 0.1, transparent: true, opacity: 0.55, depthWrite: false })));
    disc.rotation.x = -Math.PI / 2;
    disc.position.set(arena.x, (arena.y || 0) + 0.03, arena.z);
    disc.receiveShadow = shadows;
    group.add(disc);
  }
  const metalDark = () => new THREE.MeshStandardMaterial({ color: night ? "#2c2f38" : "#3c414a", roughness: 0.5, metalness: 0.6 });

  // distant skyline: a ring of fogged towers beyond the playable streets so the
  // horizon reads as a city, never as an empty field
  {
    const R = mulberry(C.key.length * 7 + 3);
    const towers = [];
    const tall = { downtown: [30, 150], industrial: [15, 60], coastal: [20, 90], neon: [40, 190], fortress: [30, 120] }[C.key] || [30, 120];
    for (let ring = 0; ring < 3; ring++) {
      const r0 = C.half + 70 + ring * 120;
      const n = 70 + ring * 30;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + R() * 0.05;
        const rr = r0 + R() * 90;
        const x = Math.cos(a) * rr;
        const z = Math.sin(a) * rr;
        if (C.water && x > C.water.x0 - 30) continue;
        const w = 14 + R() * 26;
        towers.push({ x, z, w, d: 14 + R() * 26, h: tall[0] + Math.pow(R(), 1.6) * (tall[1] - tall[0]), tint: R() });
      }
    }
    const skyMat = own(new THREE.MeshStandardMaterial({ color: night ? "#20243a" : D.key === "industrial" ? "#7d7266" : "#7f8ea3", roughness: 0.6, metalness: 0.2, emissive: night ? "#ffcf80" : "#000000", emissiveIntensity: night ? 0.05 : 0 }));
    inst(new THREE.BoxGeometry(1, 1, 1), skyMat, towers, (t) => M(t.x, t.h / 2, t.z, t.tint * 3, t.w, t.h, t.d), { color: (t) => _c.setHSL(0.6, 0.08, (night ? 0.12 : 0.45) + t.tint * 0.15) });
  }


  // street lights: pole + arm + head (emissive at night)
  inst(new THREE.CylinderGeometry(0.09, 0.13, 7, 6), metalDark(), P.lights, (l) => M(l.x, 3.5, l.z), { cast: true });
  inst(new THREE.BoxGeometry(0.1, 0.1, 1.8), metalDark(), P.lights, (l) => M(l.x + Math.cos(l.r) * 0.0, 6.9, l.z, l.r + Math.PI / 2, 1, 1, 1));
  inst(new THREE.BoxGeometry(0.5, 0.18, 0.8), new THREE.MeshStandardMaterial({ color: "#fff4d6", emissive: "#ffe0a0", emissiveIntensity: night ? 2.2 : dusk ? 0.8 : 0.05 }), P.lights, (l) => M(l.x + Math.sin(l.r + Math.PI / 2) * 0.8, 6.8, l.z + Math.cos(l.r + Math.PI / 2) * 0.8, l.r));
  // fake light pools on the pavement at night
  if (night || dusk) {
    inst(new THREE.CircleGeometry(3.2, 18), new THREE.MeshBasicMaterial({ color: "#ffcf80", transparent: true, opacity: night ? 0.16 : 0.07, depthWrite: false, blending: THREE.AdditiveBlending }), P.lights, (l) => M(l.x + Math.sin(l.r + Math.PI / 2) * 0.8, 0.03, l.z + Math.cos(l.r + Math.PI / 2) * 0.8, 0, 1, 1, 1, -Math.PI / 2));
  }
  // traffic lights
  inst(new THREE.CylinderGeometry(0.08, 0.1, 4.2, 6), metalDark(), P.tlights, (l) => M(l.x, 2.1, l.z));
  inst(new THREE.BoxGeometry(0.35, 1.0, 0.3), new THREE.MeshStandardMaterial({ color: "#1d1f24", roughness: 0.6 }), P.tlights, (l) => M(l.x, 4.2, l.z, l.r));
  const tlLamp = inst(new THREE.SphereGeometry(0.09, 8, 6), new THREE.MeshBasicMaterial({ color: "#ffffff" }), P.tlights, (l) => M(l.x + Math.sin(l.r) * 0.16, 4.35, l.z + Math.cos(l.r) * 0.16, l.r), { color: () => _c.set("#3dff6e") });

  // trees: trunk + two crowns
  inst(new THREE.CylinderGeometry(0.16, 0.24, 2.6, 6), new THREE.MeshStandardMaterial({ color: "#6b4a2e", roughness: 0.9 }), P.trees, (t) => M(t.x, 1.3 * t.s, t.z, 0, t.s, t.s, t.s), { cast: true });
  const leaf = new THREE.MeshStandardMaterial({ color: night ? "#1f4a2a" : "#3f8f3a", roughness: 0.85, flatShading: true, vertexColors: false });
  inst(new THREE.IcosahedronGeometry(1.7, 0), leaf, P.trees, (t) => M(t.x, 3.4 * t.s, t.z, t.s * 3, t.s, t.s * 0.95, t.s), { cast: true, color: (t) => _c.setHSL(0.27 + (t.s - 1) * 0.1, 0.5, night ? 0.25 : 0.42) });
  inst(new THREE.IcosahedronGeometry(1.2, 0), leaf.clone(), P.trees, (t) => M(t.x + 0.5, 4.5 * t.s, t.z - 0.3, t.s, t.s, t.s, t.s), { cast: true, color: (t) => _c.setHSL(0.25 + (t.s - 1) * 0.1, 0.55, night ? 0.28 : 0.48) });
  // benches
  inst(new THREE.BoxGeometry(1.8, 0.12, 0.55), new THREE.MeshStandardMaterial({ color: "#8a5a35", roughness: 0.8 }), P.benches, (b) => M(b.x, 0.48, b.z, b.r));
  inst(new THREE.BoxGeometry(1.8, 0.5, 0.08), new THREE.MeshStandardMaterial({ color: "#8a5a35", roughness: 0.8 }), P.benches, (b) => M(b.x - Math.sin(b.r) * 0.25, 0.75, b.z - Math.cos(b.r) * 0.25, b.r));

  // parked cars (colliders): body + cabin + wheels
  const carCol = (c) => _c.setHSL(c.tint, 0.65, 0.42 + (c.tint > 0.5 ? 0.08 : 0));
  const carPaint = new THREE.MeshPhysicalMaterial({ roughness: 0.25, metalness: 0.5, clearcoat: 1, clearcoatRoughness: 0.15, envMap, envMapIntensity: 0.8 });
  inst(new THREE.BoxGeometry(1.9, 0.75, 4.3), carPaint, P.cars, (c) => M((c.x0 + c.x1) / 2, 0.62, (c.z0 + c.z1) / 2), { cast: true, color: carCol });
  inst(new THREE.BoxGeometry(1.7, 0.6, 2.2), new THREE.MeshStandardMaterial({ color: "#1b2532", roughness: 0.1, metalness: 0.6, envMap, envMapIntensity: 1 }), P.cars, (c) => M((c.x0 + c.x1) / 2, 1.27, (c.z0 + c.z1) / 2 - 0.2), { cast: true });
  const wheels = [];
  for (const c of P.cars) for (const [dx, dz] of [[-0.9, -1.4], [0.9, -1.4], [-0.9, 1.4], [0.9, 1.4]]) wheels.push({ x: (c.x0 + c.x1) / 2 + dx, z: (c.z0 + c.z1) / 2 + dz });
  inst(new THREE.CylinderGeometry(0.36, 0.36, 0.26, 12), new THREE.MeshStandardMaterial({ color: "#111", roughness: 0.8 }), wheels, (w) => M(w.x, 0.36, w.z, 0, 1, 1, 1, 0, Math.PI / 2));

  // containers
  const ct = containerTex();
  inst(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ map: ct, roughness: 0.6, metalness: 0.4 }), P.containers, (c) => M((c.x0 + c.x1) / 2, (c.y0 + c.y1) / 2, (c.z0 + c.z1) / 2, 0, c.x1 - c.x0, c.y1 - c.y0, c.z1 - c.z0), { cast: true, receive: true, color: (c) => _c.setHSL([0.0, 0.08, 0.58, 0.33, 0.12][Math.floor(c.tint * 5)], 0.65, 0.42) });
  // rooftop AC units + fans
  inst(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: "#b4b8bd", roughness: 0.5, metalness: 0.5 }), P.roofUnits, (u) => M((u.x0 + u.x1) / 2, (u.y0 + u.y1) / 2, (u.z0 + u.z1) / 2, 0, u.x1 - u.x0, u.y1 - u.y0, u.z1 - u.z0), { cast: true });
  const fans = inst(new THREE.CylinderGeometry(0.55, 0.55, 0.08, 12), new THREE.MeshStandardMaterial({ color: "#3a3f46", roughness: 0.5 }), P.roofUnits, (u) => M((u.x0 + u.x1) / 2, u.y1 + 0.04, (u.z0 + u.z1) / 2));
  void fans;
  // water tanks / chimneys
  const tanks = P.tanks.filter((t) => t.kind === "tank");
  const chims = P.tanks.filter((t) => t.kind === "chimney");
  inst(new THREE.CylinderGeometry(1.5, 1.5, 3, 14), new THREE.MeshStandardMaterial({ color: "#7a5b3e", roughness: 0.85 }), tanks, (t) => M((t.x0 + t.x1) / 2, t.y0 + 3.3, (t.z0 + t.z1) / 2), { cast: true });
  inst(new THREE.ConeGeometry(1.65, 0.9, 14), new THREE.MeshStandardMaterial({ color: "#5a4330", roughness: 0.85 }), tanks, (t) => M((t.x0 + t.x1) / 2, t.y0 + 5.25, (t.z0 + t.z1) / 2), { cast: true });
  const legs = [];
  for (const t of tanks) for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) legs.push({ x: (t.x0 + t.x1) / 2 + dx, z: (t.z0 + t.z1) / 2 + dz, y: t.y0 });
  inst(new THREE.CylinderGeometry(0.08, 0.08, 1.8, 5), metalDark(), legs, (l) => M(l.x, l.y + 0.9, l.z));
  inst(new THREE.CylinderGeometry(1.4, 1.9, 1, 14), new THREE.MeshStandardMaterial({ color: "#8c4a35", roughness: 0.9 }), chims, (t) => M((t.x0 + t.x1) / 2, (t.y0 + t.y1) / 2, (t.z0 + t.z1) / 2, 0, 1, t.y1 - t.y0, 1), { cast: true });
  inst(new THREE.CylinderGeometry(1.5, 1.5, 1.2, 14), new THREE.MeshStandardMaterial({ color: "#e8e2d8", roughness: 0.6 }), chims, (t) => M((t.x0 + t.x1) / 2, t.y1 - 3, (t.z0 + t.z1) / 2));

  // antennas (+ red beacons)
  inst(new THREE.CylinderGeometry(0.05, 0.12, 1, 5), metalDark(), P.antennas, (a) => M(a.x, a.y + a.h / 2, a.z, 0, 1, a.h, 1));
  const beacons = inst(new THREE.SphereGeometry(0.22, 8, 6), new THREE.MeshBasicMaterial({ color: "#ff2020" }), P.antennas, (a) => M(a.x, a.y + a.h + 0.1, a.z));

  // cranes
  if (P.cranes.length) {
    const yel = own(new THREE.MeshStandardMaterial({ color: "#f2b81f", roughness: 0.55, metalness: 0.35 }));
    for (const cr of P.cranes) {
      for (const b of [cr.l1, cr.l2, cr.beam]) {
        const m = new THREE.Mesh(own(new THREE.BoxGeometry(b.x1 - b.x0, b.y1 - b.y0, b.z1 - b.z0)), yel);
        m.position.set((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, (b.z0 + b.z1) / 2);
        m.castShadow = shadows;
        group.add(m);
      }
      // trolley + hook cable
      const tx = (cr.beam.x0 + cr.beam.x1) / 2 + 4;
      const tz = (cr.beam.z0 + cr.beam.z1) / 2;
      const trol = new THREE.Mesh(own(new THREE.BoxGeometry(3, 1.4, 3.6)), yel);
      trol.position.set(tx, cr.beam.y0 - 0.5, tz);
      group.add(trol);
      const cab = new THREE.Mesh(own(new THREE.CylinderGeometry(0.05, 0.05, 14, 4)), own(new THREE.MeshStandardMaterial({ color: "#222" })));
      cab.position.set(tx, cr.beam.y0 - 8, tz);
      group.add(cab);
    }
  }
  // piers / island
  for (const pr of P.piers) {
    if (pr.virtual) continue;
    const isl = pr.kind === "island";
    const m = new THREE.Mesh(own(new THREE.BoxGeometry(pr.x1 - pr.x0, pr.y1 - pr.y0, pr.z1 - pr.z0)), own(new THREE.MeshStandardMaterial({ color: isl ? "#c9b98a" : "#7a5a3a", roughness: 0.95 })));
    m.position.set((pr.x0 + pr.x1) / 2, (pr.y0 + pr.y1) / 2, (pr.z0 + pr.z1) / 2);
    m.receiveShadow = shadows;
    group.add(m);
    if (!isl) {
      const posts = [];
      for (let x = pr.x0 + 2; x < pr.x1; x += 6) for (const z of [pr.z0 + 0.4, pr.z1 - 0.4]) posts.push({ x, z });
      inst(new THREE.CylinderGeometry(0.25, 0.25, 5, 6), new THREE.MeshStandardMaterial({ color: "#4a3522", roughness: 1 }), posts, (q) => M(q.x, -2.5, q.z));
    }
  }
  // bridges: deck + towers + cables
  for (const br of P.bridges) {
    const d = br.deck;
    const dm = new THREE.Mesh(own(new THREE.BoxGeometry(d.x1 - d.x0, d.y1 - d.y0, d.z1 - d.z0)), own(new THREE.MeshStandardMaterial({ color: "#6d7078", roughness: 0.7 })));
    dm.position.set((d.x0 + d.x1) / 2, (d.y0 + d.y1) / 2, (d.z0 + d.z1) / 2);
    dm.castShadow = shadows;
    dm.receiveShadow = shadows;
    group.add(dm);
    const red = own(new THREE.MeshStandardMaterial({ color: "#c0392b", roughness: 0.5, metalness: 0.4 }));
    for (const tw of br.towers) {
      const m = new THREE.Mesh(own(new THREE.BoxGeometry(tw.x1 - tw.x0, tw.y1 - tw.y0, tw.z1 - tw.z0)), red);
      m.position.set((tw.x0 + tw.x1) / 2, (tw.y0 + tw.y1) / 2, (tw.z0 + tw.z1) / 2);
      m.castShadow = shadows;
      group.add(m);
    }
    // suspension cables between tower tops and the deck ends
    const pts = [];
    const tops = br.towers.filter((_, i) => i % 2 === 0).map((tw) => (tw.x0 + tw.x1) / 2);
    for (const zSide of [d.z0 - 0.9, d.z1 + 0.9]) {
      const xs = [d.x0, ...tops, d.x1];
      for (let i = 0; i < xs.length - 1; i++) {
        const a = xs[i];
        const b = xs[i + 1];
        const ya = i === 0 ? d.y1 + 1 : 45;
        const yb = i === xs.length - 2 ? d.y1 + 1 : 45;
        for (let k = 0; k < 12; k++) {
          const u0 = k / 12;
          const u1 = (k + 1) / 12;
          const sag = (u) => (i > 0 && i < xs.length - 2 ? Math.sin(u * Math.PI) * 16 : 0);
          pts.push(a + (b - a) * u0, ya + (yb - ya) * u0 - sag(u0), zSide, a + (b - a) * u1, ya + (yb - ya) * u1 - sag(u1), zSide);
        }
      }
    }
    const lg = own(new THREE.BufferGeometry());
    lg.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    group.add(new THREE.LineSegments(lg, own(new THREE.LineBasicMaterial({ color: "#d8d8d8" }))));
  }
  // bridge stairs
  inst(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: night ? "#4a4c56" : "#9a9890", roughness: 0.85 }), P.stairs || [], (b) => M((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, (b.z0 + b.z1) / 2, 0, b.x1 - b.x0, b.y1 - b.y0, b.z1 - b.z0), { cast: true, receive: true });
  // fortress walls
  for (const w of P.walls) {
    const m = new THREE.Mesh(own(new THREE.BoxGeometry(w.x1 - w.x0, w.y1 - w.y0, w.z1 - w.z0)), own(new THREE.MeshStandardMaterial({ map: facade("armor").map, color: "#9aa0ae", roughness: 0.6, metalness: 0.5 })));
    m.position.set((w.x0 + w.x1) / 2, (w.y0 + w.y1) / 2, (w.z0 + w.z1) / 2);
    m.castShadow = shadows;
    m.receiveShadow = shadows;
    group.add(m);
  }
  // fountains
  for (const f of P.fountains) {
    const r = f.big ? 6 : 3.5;
    const basin = new THREE.Mesh(own(new THREE.CylinderGeometry(r, r + 0.3, 0.7, 28, 1, true)), own(new THREE.MeshStandardMaterial({ color: "#d8d2c4", roughness: 0.7, side: THREE.DoubleSide })));
    basin.position.set(f.x, 0.35, f.z);
    group.add(basin);
    const wat = new THREE.Mesh(own(new THREE.CircleGeometry(r - 0.1, 28)), own(new THREE.MeshStandardMaterial({ color: "#3aa0c8", roughness: 0.1, metalness: 0.3, envMap, transparent: true, opacity: 0.85 })));
    wat.rotation.x = -Math.PI / 2;
    wat.position.set(f.x, 0.55, f.z);
    group.add(wat);
    const col = new THREE.Mesh(own(new THREE.CylinderGeometry(0.5, 0.8, 2.4, 12)), own(new THREE.MeshStandardMaterial({ color: "#e8e2d6", roughness: 0.6 })));
    col.position.set(f.x, 1.2, f.z);
    group.add(col);
  }
  // billboards (on poles) — fictional ads
  const bbBack = own(new THREE.MeshStandardMaterial({ color: "#2a2d34", roughness: 0.7, metalness: 0.4 }));
  P.billboards.forEach((b, i) => {
    // ad on the front face, a plain steel back (never mirrored text)
    const panel = new THREE.Mesh(own(new THREE.PlaneGeometry(b.w, b.h)), own(new THREE.MeshStandardMaterial({ map: billboard(i + C.key.length), emissive: "#ffffff", emissiveMap: billboard(i + C.key.length), emissiveIntensity: night ? 0.9 : 0.15, roughness: 0.6 })));
    panel.position.set(b.x, 5 + b.h / 2, b.z);
    panel.rotation.y = b.r;
    group.add(panel);
    const back = new THREE.Mesh(own(new THREE.BoxGeometry(b.w + 0.3, b.h + 0.3, 0.25)), bbBack);
    back.position.set(b.x - Math.sin(b.r) * 0.14, 5 + b.h / 2, b.z - Math.cos(b.r) * 0.14);
    back.rotation.y = b.r;
    back.castShadow = shadows;
    group.add(back);
    const pole = new THREE.Mesh(own(new THREE.CylinderGeometry(0.18, 0.22, 5, 8)), own(metalDark()));
    pole.position.set(b.x, 2.5, b.z);
    group.add(pole);
  });
  // neon signs on facades
  P.signs.forEach((sg, i) => {
    const t = neon(i, sg.hue);
    const vertical = i % 3 !== 0;
    const w = vertical ? Math.min(sg.w, 3.5) : sg.w;
    const h = vertical ? sg.h : Math.min(sg.h, w * 0.32);
    const m = new THREE.Mesh(own(new THREE.PlaneGeometry(w, h)), own(new THREE.MeshBasicMaterial({ map: t, toneMapped: false })));
    m.position.set(sg.x + (sg.side === "w" ? -0.05 : 0), sg.y, sg.z + (sg.side === "s" ? 0.05 : 0));
    m.rotation.y = sg.side === "w" ? -Math.PI / 2 : 0;
    group.add(m);
  });

  /* ---------------- moving traffic + pedestrians */
  const N = C.N;
  const lanes = [];
  for (let i = 1; i < N; i++) {
    const s = -C.half + i * PITCH;
    if (C.water && s > C.water.x0 - 4) continue;
    lanes.push({ ax: "z", c: s + 2.2, dir: 1 }, { ax: "z", c: s - 2.2, dir: -1 });
    lanes.push({ ax: "x", c: s + 2.2, dir: -1 }, { ax: "x", c: s - 2.2, dir: 1 });
  }
  const R = mulberry(C.key.length * 99);
  const cars = [];
  const nCars = quality === "low" ? 14 : 26;
  for (let i = 0; i < nCars && lanes.length; i++) {
    const L = lanes[Math.floor(R() * lanes.length)];
    cars.push({ L, u: (R() - 0.5) * C.half * 2, sp: 9 + R() * 6, v: 0, tint: R(), kind: R() < 0.15 ? "bus" : R() < 0.3 ? "taxi" : "car" });
  }
  const trafficBody = new THREE.InstancedMesh(own(new THREE.BoxGeometry(1.9, 0.8, 4.4)), own(new THREE.MeshPhysicalMaterial({ roughness: 0.25, metalness: 0.5, clearcoat: 1, envMap, envMapIntensity: 0.8 })), Math.max(1, cars.length));
  const trafficCab = new THREE.InstancedMesh(own(new THREE.BoxGeometry(1.7, 0.6, 2.2)), own(new THREE.MeshStandardMaterial({ color: "#16202c", roughness: 0.1, metalness: 0.6, envMap })), Math.max(1, cars.length));
  const trafficLight = new THREE.InstancedMesh(own(new THREE.BoxGeometry(1.6, 0.18, 0.06)), own(new THREE.MeshBasicMaterial({ color: night ? "#fff2c0" : "#e8e8e8", toneMapped: false })), Math.max(1, cars.length));
  trafficBody.castShadow = shadows;
  cars.forEach((c, i) => trafficBody.setColorAt(i, c.kind === "taxi" ? _c.set("#f2c218") : c.kind === "bus" ? _c.set("#2f7fd0") : _c.setHSL(c.tint, 0.6, 0.45)));
  if (trafficBody.instanceColor) trafficBody.instanceColor.needsUpdate = true;
  group.add(trafficBody, trafficCab, trafficLight);

  const peds = P.pedestrians;
  const pedBody = new THREE.InstancedMesh(own(new THREE.CapsuleGeometry(0.22, 0.9, 3, 8)), own(new THREE.MeshStandardMaterial({ roughness: 0.8 })), Math.max(1, peds.length));
  const pedHead = new THREE.InstancedMesh(own(new THREE.SphereGeometry(0.15, 10, 8)), own(new THREE.MeshStandardMaterial({ color: "#d9a882", roughness: 0.7 })), Math.max(1, peds.length));
  peds.forEach((p, i) => pedBody.setColorAt(i, _c.setHSL(p.tint, 0.45, 0.45)));
  if (pedBody.instanceColor) pedBody.instanceColor.needsUpdate = true;
  pedBody.castShadow = shadows;
  group.add(pedBody, pedHead);

  const half = C.half + 30;
  function update(t, dt, hero) {
    // traffic: drive along the lane, wrap around, brake for the hero on the street
    cars.forEach((c, i) => {
      const L = c.L;
      let want = c.sp;
      const cx = L.ax === "z" ? L.c : c.u;
      const cz = L.ax === "z" ? c.u : L.c;
      if (hero && hero.y < 2.5) {
        const ahead = (L.ax === "z" ? hero.z - cz : hero.x - cx) * L.dir;
        const side = Math.abs(L.ax === "z" ? hero.x - cx : hero.z - cz);
        if (side < 2.2 && ahead > 0 && ahead < 10) want = 0;
      }
      c.v += (want - c.v) * Math.min(1, dt * (want < c.v ? 4 : 1));
      c.u += L.dir * c.v * dt;
      if (c.u > half) c.u = -half;
      if (c.u < -half) c.u = half;
      const ry = L.ax === "z" ? (L.dir > 0 ? 0 : Math.PI) : L.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      const len = c.kind === "bus" ? 2.4 : 1;
      M(cx, 0.65 * (c.kind === "bus" ? 1.8 : 1), cz, ry, 1.05, c.kind === "bus" ? 2.6 : 1, len);
      trafficBody.setMatrixAt(i, _m);
      M(cx, c.kind === "bus" ? 2.2 : 1.3, cz, ry, 1, c.kind === "bus" ? 1.4 : 1, c.kind === "bus" ? 4.4 : 1);
      trafficCab.setMatrixAt(i, _m);
      const fx = Math.sin(ry);
      const fz = Math.cos(ry);
      M(cx + fx * 2.22 * len, 0.75, cz + fz * 2.22 * len, ry);
      trafficLight.setMatrixAt(i, _m);
    });
    trafficBody.instanceMatrix.needsUpdate = true;
    trafficCab.instanceMatrix.needsUpdate = true;
    trafficLight.instanceMatrix.needsUpdate = true;
    // pedestrians walk loops around their block on the sidewalk
    peds.forEach((p, i) => {
      const b = p.block;
      const w = b.x1 - b.x0 + 3;
      const d = b.z1 - b.z0 + 3;
      const per = 2 * (w + d);
      p.u = (p.u + (p.speed * dt) / per) % 1;
      let s = p.u * per;
      let x;
      let z;
      let ry;
      if (s < w) (x = b.x0 - 1.5 + s), (z = b.z0 - 1.5), (ry = Math.PI / 2);
      else if ((s -= w) < d) (x = b.x1 + 1.5), (z = b.z0 - 1.5 + s), (ry = 0);
      else if ((s -= d) < w) (x = b.x1 + 1.5 - s), (z = b.z1 + 1.5), (ry = -Math.PI / 2);
      else (s -= w), (x = b.x0 - 1.5), (z = b.z1 + 1.5 - s), (ry = Math.PI);
      const bob = Math.abs(Math.sin(t * 7 + i)) * 0.05;
      // scatter from the hero's fights
      M(x, 0.68 + bob, z, ry, 1, 1, 1, 0, Math.sin(t * 7 + i) * 0.05);
      pedBody.setMatrixAt(i, _m);
      M(x, 1.42 + bob, z, ry);
      pedHead.setMatrixAt(i, _m);
    });
    pedBody.instanceMatrix.needsUpdate = true;
    pedHead.instanceMatrix.needsUpdate = true;
    // beacons blink, traffic lights cycle
    if (beacons) beacons.visible = Math.sin(t * 3) > 0;
    if (tlLamp) {
      const ph = (t / 7) % 1;
      tlLamp.material.color.set(ph < 0.45 ? "#3dff6e" : ph < 0.55 ? "#ffcf3a" : "#ff3b3b");
    }
    if (water) {
      water.material.normalMap.offset.set(t * 0.004, t * 0.003);
    }
  }

  function dispose() {
    for (const d of disposables) d.dispose && d.dispose();
    group.traverse((o) => {
      if (o.isInstancedMesh) o.dispose();
    });
  }
  return { group, update, dispose };
}

function stripeTex() {
  const c = document.createElement("canvas");
  c.width = 32;
  c.height = 256;
  const g = c.getContext("2d");
  for (let i = 0; i < 8; i++) {
    g.fillStyle = i % 2 ? "#c0392b" : "#f6f2ea";
    g.fillRect(0, i * 32, 32, 32);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function mulberry(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
