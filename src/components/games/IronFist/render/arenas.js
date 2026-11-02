/**
 * The four arenas, built procedurally (no model files): PBR materials with
 * canvas textures, instanced crowds / skylines, emissive neon, additive light
 * beams and a few ambient particle systems. Each arena also describes its
 * lighting mood; world.js owns the shared light rig and applies it.
 *
 * The fight happens on the X axis at z = 0 (|x| ≤ 4.3); the camera sits at
 * +Z, so scenery lives mostly at z < −3 and to the sides.
 */
import * as THREE from "three";
import { stoneTiles, concrete, brick, darkWood, windows, softDot, smoke as smokeTex, emblem, gradient, fbm } from "./textures.js";

export const ARENAS = [
  { id: "temple", name: "Dragon Temple", sub: "Mountain courtyard at dusk", color: "#ff9a5a" },
  { id: "rooftop", name: "Skyline Rooftop", sub: "Neon city at night", color: "#ff3cc8" },
  { id: "underground", name: "The Pit", sub: "Underground fight club", color: "#ff2a3a" },
  { id: "grand", name: "Grand Arena", sub: "World Masters main stage", color: "#ffbb55" },
];
export const ARENA_BY_ID = Object.fromEntries(ARENAS.map((a) => [a.id, a]));

/* ---------------------------------------------------------------- helpers */
function kit(group, disposables) {
  const std = (o) => {
    const m = new THREE.MeshStandardMaterial(o);
    disposables.push(m);
    return m;
  };
  const phys = (o) => {
    const m = new THREE.MeshPhysicalMaterial(o);
    disposables.push(m);
    return m;
  };
  const basic = (o) => {
    const m = new THREE.MeshBasicMaterial(o);
    disposables.push(m);
    return m;
  };
  const mesh = (geo, mat, p = [0, 0, 0], r = [0, 0, 0], { cast = true, recv = true, parent = group } = {}) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(...p);
    m.rotation.set(...r);
    m.castShadow = cast;
    m.receiveShadow = recv;
    parent.add(m);
    disposables.push(geo);
    return m;
  };
  const box = (w, h, d, mat, p, r, o) => mesh(new THREE.BoxGeometry(w, h, d), mat, p, r, o);
  const cyl = (r0, r1, h, mat, p, r, o, seg = 24) => mesh(new THREE.CylinderGeometry(r0, r1, h, seg), mat, p, r, o);
  return { std, phys, basic, mesh, box, cyl };
}

function skyDome(group, disposables, stops, key) {
  const g = new THREE.SphereGeometry(140, 32, 16);
  const m = new THREE.MeshBasicMaterial({ map: gradient(key, stops), side: THREE.BackSide, fog: false, depthWrite: false });
  // map v (0 top → 1 bottom) onto the sphere's latitude
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, 0.5, uv.getY(i));
  const s = new THREE.Mesh(g, m);
  s.renderOrder = -10;
  group.add(s);
  disposables.push(g, m);
  return s;
}

/** Floor plane with tiled PBR set. */
function floor(K, set, { w = 34, d = 20, rep = [6, 3.5], color = 0xffffff, rough = 1, z = -4, metal = 0, clearcoat = 0 } = {}) {
  for (const t of [set.map, set.roughnessMap, set.normalMap]) t?.repeat.set(rep[0], rep[1]);
  const mat = (clearcoat ? K.phys : K.std)({ map: set.map, roughnessMap: set.roughnessMap, normalMap: set.normalMap, normalScale: new THREE.Vector2(0.6, 0.6), color, roughness: rough, metalness: metal, ...(clearcoat ? { clearcoat, clearcoatRoughness: 0.25 } : {}) });
  const geo = new THREE.PlaneGeometry(w, d);
  geo.rotateX(-Math.PI / 2);
  K.mesh(geo, mat, [0, 0, z + d / 2 - 6], [0, 0, 0], { cast: false });
  return mat;
}

/** Ridge-line silhouette (mountains / skyline backdrops). */
function ridge(K, color, z, height, seed, { w = 220, base = -2, rough = 1, fogged = true } = {}) {
  const sh = new THREE.Shape();
  sh.moveTo(-w / 2, base);
  for (let i = 0; i <= 80; i++) {
    const x = -w / 2 + (i / 80) * w;
    const y = base + height * (0.25 + fbm(i / 12, seed, seed, 4) * 1.1);
    sh.lineTo(x, y);
  }
  sh.lineTo(w / 2, base);
  const geo = new THREE.ShapeGeometry(sh);
  const mat = K.basic({ color, fog: fogged });
  void rough;
  return K.mesh(geo, mat, [0, 0, z], [0, 0, 0], { cast: false, recv: false });
}

/** Additive light-beam cone (fake volumetric). */
function beam(K, color, p, r, len = 8, radius = 1.4, opacity = 0.16) {
  const geo = new THREE.ConeGeometry(radius, len, 32, 1, true);
  geo.translate(0, -len / 2, 0);
  // fade along the cone with vertex alpha via a gradient texture on V
  const mat = K.basic({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, map: gradient("beamFade", [[0, "#ffffff"], [1, "#000000"]]) });
  const m = K.mesh(geo, mat, p, r, { cast: false, recv: false });
  m.renderOrder = 5;
  return m;
}

/** Simple ambient particle system (petals, rain, embers, dust). */
function ambient(group, disposables, { count, area, color, size, opacity = 0.8, blending = THREE.NormalBlending, tex = softDot() }) {
  const pos = new Float32Array(count * 3);
  const vel = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (Math.random() - 0.5) * area[0];
    pos[i * 3 + 1] = Math.random() * area[1];
    pos[i * 3 + 2] = area[2] + (Math.random() - 0.5) * area[3];
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  const mat = new THREE.PointsMaterial({ color, size, map: tex, transparent: true, opacity, depthWrite: false, blending, sizeAttenuation: true });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  group.add(pts);
  disposables.push(geo, mat);
  return { pts, pos, vel, count, area };
}

/** Instanced crowd of simple stylised spectators (capsule body + head). */
function crowd(K, group, disposables, spots, { palette, scale = 1 } = {}) {
  const bodyGeo = new THREE.CapsuleGeometry(0.2 * scale, 0.55 * scale, 4, 10);
  bodyGeo.translate(0, 0.5 * scale, 0);
  const headGeo = new THREE.SphereGeometry(0.13 * scale, 12, 8);
  headGeo.translate(0, 1.08 * scale, 0);
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.8, metalness: 0 });
  const hmat = new THREE.MeshStandardMaterial({ roughness: 0.7, color: "#b98b6e" });
  disposables.push(bodyGeo, headGeo, mat, hmat);
  const n = spots.length;
  const bodies = new THREE.InstancedMesh(bodyGeo, mat, n);
  const heads = new THREE.InstancedMesh(headGeo, hmat, n);
  const c = new THREE.Color();
  const skins = ["#f0c8a8", "#c89878", "#8a5a3a", "#5a3a28", "#e8b898"];
  spots.forEach((s, i) => {
    c.set(palette[Math.floor(Math.random() * palette.length)]).lerp(new THREE.Color("#3a3a40"), 0.55).multiplyScalar(0.05 + Math.random() * 0.08);
    bodies.setColorAt(i, c);
    c.set(skins[Math.floor(Math.random() * skins.length)]).multiplyScalar(0.16);
    heads.setColorAt(i, c);
  });
  bodies.castShadow = false;
  bodies.receiveShadow = true;
  group.add(bodies, heads);
  const phase = spots.map(() => Math.random() * 6.28);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const v = new THREE.Vector3();
  const sc = new THREE.Vector3(1, 1, 1);
  const size = spots.map(() => [1.2 + Math.random() * 0.15, 0.88 + Math.random() * 0.24]);
  function pose(t, hype = 0) {
    spots.forEach((s, i) => {
      sc.set(size[i][0], size[i][1], 0.78);
      const bob = Math.max(0, Math.sin(t * (3 + hype * 4) + phase[i])) * (0.04 + hype * 0.18);
      q.setFromAxisAngle(up, s.yaw ?? 0);
      v.set(s.x, s.y + bob, s.z);
      m4.compose(v, q, sc);
      bodies.setMatrixAt(i, m4);
      heads.setMatrixAt(i, m4);
    });
    bodies.instanceMatrix.needsUpdate = heads.instanceMatrix.needsUpdate = true;
  }
  pose(0);
  return { pose };
}

/* ================================================================ TEMPLE */
function buildTemple(group, D) {
  const K = kit(group, D);
  skyDome(group, D, [[0, "#1d1a3e"], [0.35, "#5a3a78"], [0.5, "#d0607a"], [0.56, "#f8a65c"], [0.62, "#f6c27a"], [1, "#3a2a2a"]], "skyTemple");
  const sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: softDot(), color: "#ffd9a0", fog: false, depthWrite: false, transparent: true, blending: THREE.AdditiveBlending }));
  sun.position.set(-22, 8, -100);
  sun.scale.setScalar(26);
  group.add(sun);
  D.push(sun.material);
  ridge(K, "#7d4a62", -95, 22, 3, { base: -4 });
  ridge(K, "#5a3854", -70, 16, 7, { base: -4 });
  ridge(K, "#3b2740", -48, 10, 11, { base: -4 });
  // courtyard
  const stone = stoneTiles("templeStone", { base: [168, 150, 126], tiles: 4, mortar: [78, 66, 56] });
  floor(K, stone, { rep: [7, 4], rough: 0.95 });
  const stoneM = K.std({ map: stone.map, roughnessMap: stone.roughnessMap, normalMap: stone.normalMap, color: "#d8c8b2", roughness: 0.95 });
  // steps up to the temple
  for (let i = 0; i < 4; i++) K.box(16 - i * 0.6, 0.22, 0.6, stoneM, [0, 0.11 + i * 0.22, -4.4 - i * 0.6]);
  K.box(18, 0.9, 6, stoneM, [0, 0.45, -9.6]);
  // temple hall: lacquered pillars, beams, double roof
  const red = K.phys({ color: "#8e1a1a", roughness: 0.35, clearcoat: 0.7, clearcoatRoughness: 0.2 });
  const gold = K.std({ color: "#c9a14a", roughness: 0.3, metalness: 1 });
  const wood = K.std({ map: darkWood(), color: "#7a4a30", roughness: 0.7 });
  const roofM = K.std({ color: "#25242c", roughness: 0.55, metalness: 0.2 });
  for (let i = 0; i < 8; i++) {
    const x = -7 + i * 2;
    K.cyl(0.2, 0.22, 3.6, red, [x, 2.7, -8.2]);
    K.cyl(0.28, 0.28, 0.16, gold, [x, 4.52, -8.2]);
    K.cyl(0.3, 0.32, 0.2, stoneM, [x, 0.98, -8.2]);
  }
  K.box(15.6, 0.35, 0.4, red, [0, 4.75, -8.2]);
  K.box(15.6, 0.12, 0.42, gold, [0, 4.98, -8.2]);
  K.box(15, 3.6, 0.2, wood, [0, 2.7, -10.6]);
  // shoji glow behind the pillars
  const paper = K.std({ color: "#ffd9a0", emissive: "#ffb060", emissiveIntensity: 0.55, roughness: 0.9 });
  for (let i = 0; i < 7; i++) K.box(1.5, 2.4, 0.05, paper, [-6 + i * 2, 2.5, -10.45], [0, 0, 0], { cast: false });
  const roof = (y, w, d, h) => {
    const sh = new THREE.Shape();
    sh.moveTo(-d / 2 - 0.9, 0);
    sh.quadraticCurveTo(-d / 2 + 0.2, 0.1, -d * 0.12, h);
    sh.lineTo(d * 0.12, h);
    sh.quadraticCurveTo(d / 2 - 0.2, 0.1, d / 2 + 0.9, 0);
    sh.lineTo(d / 2 + 0.9, -0.18);
    sh.lineTo(-d / 2 - 0.9, -0.18);
    const g = new THREE.ExtrudeGeometry(sh, { depth: w, bevelEnabled: false });
    g.translate(0, 0, -w / 2);
    g.rotateY(Math.PI / 2);
    K.mesh(g, roofM, [0, y, -9.4]);
    K.box(w * 0.98, 0.14, 0.2, gold, [0, y + h + 0.04, -9.4]);
  };
  roof(5.1, 17, 5.2, 1.4);
  roof(6.9, 11, 3.6, 1.1);
  K.box(11, 1.1, 2.8, red, [0, 6.35, -9.4]);
  // torii-style gate pillars framing the fight + hanging lanterns
  for (const k of [-1, 1]) {
    K.cyl(0.26, 0.3, 5.2, red, [k * 7.4, 2.6, -2.6]);
    K.cyl(0.36, 0.38, 0.3, stoneM, [k * 7.4, 0.15, -2.6]);
  }
  K.box(16.5, 0.38, 0.5, red, [0, 5.0, -2.6]);
  K.box(17.4, 0.26, 0.6, roofM, [0, 5.35, -2.6]);
  K.box(15.6, 0.2, 0.32, red, [0, 4.3, -2.6]);
  const lanternM = K.std({ color: "#ff5a2a", emissive: "#ff6a2a", emissiveIntensity: 1.6, roughness: 0.6 });
  for (const k of [-1, 1]) {
    const l = K.mesh(new THREE.SphereGeometry(0.32, 20, 14), lanternM, [k * 4.6, 3.6, -2.6], [0, 0, 0], { cast: false });
    l.scale.set(1, 1.25, 1);
    K.cyl(0.005, 0.005, 0.5, gold, [k * 4.6, 4.05, -2.6]);
  }
  // stone lanterns (tōrō) with warm light
  const lights = [];
  for (const k of [-1, 1]) {
    const x = k * 5.8;
    K.cyl(0.32, 0.38, 0.3, stoneM, [x, 0.15, -3.6]);
    K.cyl(0.12, 0.14, 1.0, stoneM, [x, 0.8, -3.6]);
    K.box(0.62, 0.12, 0.62, stoneM, [x, 1.36, -3.6]);
    K.box(0.42, 0.42, 0.42, K.std({ color: "#ffd090", emissive: "#ffa040", emissiveIntensity: 1.8 }), [x, 1.63, -3.6], [0, 0, 0], { cast: false });
    K.mesh(new THREE.ConeGeometry(0.55, 0.42, 4), stoneM, [x, 2.05, -3.6], [0, Math.PI / 4, 0]);
    const L = new THREE.PointLight("#ffaa55", 6, 7, 1.8);
    L.position.set(x, 1.7, -3.2);
    group.add(L);
    lights.push(L);
  }
  // cherry trees
  const bark = K.std({ color: "#3a2620", roughness: 0.9 });
  const bloom = K.std({ color: "#f7b7cf", roughness: 0.8, flatShading: true });
  for (const [x, z, s] of [
    [-10, -5, 1.2],
    [10.5, -5.5, 1.3],
    [-13, -9, 1],
    [13.5, -10, 1.1],
  ]) {
    K.cyl(0.14 * s, 0.24 * s, 3 * s, bark, [x, 1.5 * s, z], [0, 0, x > 0 ? -0.15 : 0.15]);
    for (let i = 0; i < 6; i++) {
      const b = K.mesh(new THREE.IcosahedronGeometry(0.9 * s, 1), bloom, [x + Math.cos(i * 1.1) * 1.1 * s, 3.2 * s + Math.sin(i * 2.3) * 0.5, z + Math.sin(i * 1.1) * 0.8], [i, i * 2, 0]);
      b.scale.set(1, 0.75, 1);
    }
  }
  const petals = ambient(group, D, { count: 260, area: [26, 9, -1, 12], color: "#ffc4dc", size: 0.07, opacity: 0.95 });
  return {
    mood: {
      exposure: 1.0,
      env: 0.42,
      fog: ["#9a5a70", 16, 95],
      hemi: ["#a090e0", "#5a3a2a", 0.75],
      key: ["#ffcf9e", 3.0, [-6, 9, 7]],
      fill: ["#7a8cff", 0.55, [7, 4, 6]],
      rim: ["#ff9a5a", 2.2, [6, 5, -7]],
      bloom: 0.35,
    },
    update(t, dt) {
      for (let i = 0; i < petals.count; i++) {
        const p = petals.pos;
        p[i * 3] += (Math.sin(t * 0.7 + i) * 0.4 + 0.5) * dt;
        p[i * 3 + 1] -= (0.35 + (i % 5) * 0.06) * dt;
        p[i * 3 + 2] += Math.cos(t * 0.5 + i * 3) * 0.2 * dt;
        if (p[i * 3 + 1] < 0) {
          p[i * 3 + 1] = 9;
          p[i * 3] = (Math.random() - 0.5) * 26;
        }
        if (p[i * 3] > 13) p[i * 3] = -13;
      }
      petals.pts.geometry.attributes.position.needsUpdate = true;
      lights.forEach((L, i) => (L.intensity = 5.5 + Math.sin(t * 9 + i * 2) * 0.5 + Math.sin(t * 23 + i) * 0.3));
    },
  };
}

/* ================================================================ ROOFTOP */
function buildRooftop(group, D) {
  const K = kit(group, D);
  skyDome(group, D, [[0, "#03040b"], [0.38, "#0b1030"], [0.5, "#2a1f52"], [0.55, "#5a2a6a"], [0.6, "#1a1030"], [1, "#05040a"]], "skyRoof");
  const moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: softDot(), color: "#cfd8ff", fog: false, depthWrite: false, transparent: true }));
  moon.position.set(30, 40, -110);
  moon.scale.setScalar(12);
  group.add(moon);
  D.push(moon.material);
  // skyline: instanced towers with lit windows
  const win = windows();
  win.repeat.set(2, 6);
  const towerM = K.std({ color: "#0b0e18", roughness: 0.6, metalness: 0.4, emissive: "#ffffff", emissiveMap: win, emissiveIntensity: 1.1 });
  const towerG = new THREE.BoxGeometry(1, 1, 1);
  towerG.translate(0, 0.5, 0);
  D.push(towerG);
  const n = 140;
  const towers = new THREE.InstancedMesh(towerG, towerM, n);
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < n; i++) {
    const ring = i % 3;
    const z = -26 - ring * 18 - Math.random() * 10;
    const x = (Math.random() - 0.5) * (90 + ring * 50);
    const w = 4 + Math.random() * 7;
    const h = 30 + Math.random() * (ring === 0 ? 34 : 70);
    m4.compose(new THREE.Vector3(x, -42, z), new THREE.Quaternion(), new THREE.Vector3(w, h, w * (0.7 + Math.random() * 0.6)));
    towers.setMatrixAt(i, m4);
  }
  group.add(towers);
  ridge(K, "#07070f", -120, 18, 5, { base: -10 });
  // neon billboards (original signage)
  const sign = (key, text, color, w, h, p, r = [0, 0, 0]) => {
    const t = emblem(key, (g, W, H) => {
      g.fillStyle = "rgba(0,0,0,0)";
      g.clearRect(0, 0, W, H);
      g.strokeStyle = color;
      g.lineWidth = 10;
      g.shadowColor = color;
      g.shadowBlur = 30;
      g.strokeRect(14, 14, W - 28, H - 28);
      g.font = `900 ${Math.floor(H * 0.42)}px Impact, Arial Black, sans-serif`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillStyle = "#ffffff";
      g.fillText(text, W / 2, H / 2 + 4);
    }, 1024, 320);
    const m = K.basic({ map: t, color: new THREE.Color(color).multiplyScalar(1.6), transparent: true, toneMapped: false, depthWrite: false });
    const s = K.mesh(new THREE.PlaneGeometry(w, h), m, p, r, { cast: false, recv: false });
    return s;
  };
  sign("signA", "NEON DRAGON", "#ff3cc8", 14, 4.4, [-15, 9, -30], [0, 0.25, 0]);
  sign("signB", "PULSE 24H", "#30e8ff", 11, 3.4, [17, 12, -36], [0, -0.3, 0]);
  sign("signC", "IRON FIST", "#ffd23c", 8, 2.5, [3, 16, -48]);
  // roof surface with a painted helipad
  const conc = concrete("roofConc", {
    base: [92, 96, 104],
    paint: (g, S) => {
      g.strokeStyle = "rgba(240,200,40,0.85)";
      g.lineWidth = 18;
      g.beginPath();
      g.arc(S / 2, S / 2, S * 0.36, 0, Math.PI * 2);
      g.stroke();
      g.fillStyle = "rgba(240,240,240,0.8)";
      g.font = `900 ${S * 0.42}px Arial Black, sans-serif`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText("H", S / 2, S / 2 + S * 0.02);
    },
  });
  const pad = K.std({ map: conc.map, roughnessMap: conc.roughnessMap, normalMap: conc.normalMap, roughness: 0.85, color: "#ffffff" });
  conc.map.repeat.set(1, 1);
  const g0 = new THREE.PlaneGeometry(9, 9);
  g0.rotateX(-Math.PI / 2);
  K.mesh(g0, pad, [0, 0.006, -1.2], [0, 0, 0], { cast: false });
  const plain = concrete("roofConc2", { base: [70, 74, 82] });
  floor(K, plain, { rep: [8, 5], rough: 0.7, color: "#c8ccd8" });
  // parapet, railings, rooftop clutter
  const wallM = K.std({ map: plain.map, color: "#9aa0ac", roughness: 0.9 });
  K.box(26, 1.1, 0.4, wallM, [0, 0.55, -6.2]);
  for (const k of [-1, 1]) K.box(0.4, 1.1, 10, wallM, [k * 12.5, 0.55, -2]);
  const steel = K.std({ color: "#5a606c", roughness: 0.35, metalness: 0.9 });
  for (let i = -12; i <= 12; i += 1.5) K.cyl(0.03, 0.03, 1.0, steel, [i, 1.6, -6.2], [0, 0, 0], { cast: false }, 8);
  K.box(25, 0.05, 0.05, steel, [0, 2.1, -6.2]);
  const acM = K.std({ color: "#8a8f99", roughness: 0.5, metalness: 0.6 });
  for (const [x, z] of [
    [-8.5, -4.6],
    [-6.6, -4.8],
    [8.2, -4.4],
  ]) {
    K.box(1.4, 1.1, 1.0, acM, [x, 0.55, z]);
    K.cyl(0.38, 0.38, 0.06, K.std({ color: "#222", metalness: 0.8, roughness: 0.4 }), [x, 1.13, z]);
  }
  // water tower
  const tankM = K.std({ map: darkWood(), color: "#6a4a3a", roughness: 0.8 });
  K.cyl(1.3, 1.3, 2.4, tankM, [10.5, 4.3, -8]);
  K.mesh(new THREE.ConeGeometry(1.45, 0.9, 24), K.std({ color: "#3a3a40", roughness: 0.6 }), [10.5, 5.95, -8]);
  for (const [dx, dz] of [
    [-0.9, -0.9],
    [0.9, -0.9],
    [-0.9, 0.9],
    [0.9, 0.9],
  ])
    K.cyl(0.06, 0.06, 3.1, steel, [10.5 + dx, 1.55, -8 + dz], [0, 0, 0], {}, 8);
  // antenna with a blinking light
  K.cyl(0.04, 0.06, 6, steel, [-10, 3, -7.5], [0, 0, 0], {}, 8);
  const blink = K.basic({ color: "#ff2030", toneMapped: false });
  K.mesh(new THREE.SphereGeometry(0.09, 12, 8), blink, [-10, 6.05, -7.5], [0, 0, 0], { cast: false });
  // neon strip lights along the parapet
  const neonM = K.basic({ color: new THREE.Color("#ff3cc8").multiplyScalar(2), toneMapped: false });
  const neonC = K.basic({ color: new THREE.Color("#30e8ff").multiplyScalar(2), toneMapped: false });
  K.box(10, 0.05, 0.05, neonM, [-6.5, 1.12, -5.98], [0, 0, 0], { cast: false });
  K.box(10, 0.05, 0.05, neonC, [6.5, 1.12, -5.98], [0, 0, 0], { cast: false });
  const pink = new THREE.PointLight("#ff3cc8", 7, 9, 1.6);
  pink.position.set(-6, 1.6, -5.4);
  const cyan = new THREE.PointLight("#30e8ff", 7, 9, 1.6);
  cyan.position.set(6, 1.6, -5.4);
  group.add(pink, cyan);
  // drizzle
  const rain = ambient(group, D, { count: 700, area: [28, 12, -1, 14], color: "#9fb4ff", size: 0.035, opacity: 0.55, blending: THREE.AdditiveBlending });
  return {
    mood: {
      exposure: 1.05,
      env: 0.38,
      fog: ["#140f26", 22, 110],
      hemi: ["#3040a0", "#160c1a", 0.6],
      key: ["#b8c8ff", 2.4, [5, 9, 7]],
      fill: ["#ff5ad0", 0.6, [-7, 3, 5]],
      rim: ["#ff3cc8", 2.6, [-5, 5, -7]],
      bloom: 0.55,
    },
    update(t, dt) {
      const p = rain.pos;
      for (let i = 0; i < rain.count; i++) {
        p[i * 3 + 1] -= 9 * dt;
        p[i * 3] -= 1.2 * dt;
        if (p[i * 3 + 1] < 0) {
          p[i * 3 + 1] = 12;
          p[i * 3] = (Math.random() - 0.5) * 28;
        }
      }
      rain.pts.geometry.attributes.position.needsUpdate = true;
      blink.color.setRGB(Math.sin(t * 3) > 0.6 ? 2 : 0.15, 0.05, 0.08);
      pink.intensity = 7 + Math.sin(t * 13) * (Math.sin(t * 0.7) > 0.95 ? 6 : 0.4);
    },
  };
}

/* ================================================================ UNDERGROUND */
function buildUnderground(group, D) {
  const K = kit(group, D);
  const conc = concrete("pitFloor", {
    base: [60, 60, 64],
    paint: (g, S) => {
      g.strokeStyle = "rgba(200,30,40,0.75)";
      g.lineWidth = 14;
      g.beginPath();
      g.arc(S / 2, S / 2, S * 0.42, 0, Math.PI * 2);
      g.stroke();
      g.lineWidth = 4;
      g.beginPath();
      g.arc(S / 2, S / 2, S * 0.38, 0, Math.PI * 2);
      g.stroke();
      g.fillStyle = "rgba(200,30,40,0.5)";
      g.font = `900 ${S * 0.16}px Impact, Arial Black, sans-serif`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText("THE PIT", S / 2, S / 2);
    },
  });
  const ringFloor = K.std({ map: conc.map, roughnessMap: conc.roughnessMap, normalMap: conc.normalMap, roughness: 0.75, color: "#ffffff" });
  const g0 = new THREE.PlaneGeometry(10, 10);
  g0.rotateX(-Math.PI / 2);
  K.mesh(g0, ringFloor, [0, 0.005, -0.8], [0, 0, 0], { cast: false });
  const plain = concrete("pitFloor2", { base: [44, 44, 48] });
  floor(K, plain, { rep: [8, 5], rough: 0.6, color: "#a8a8b0" });
  // walls & ceiling
  const br = brick();
  br.repeat.set(8, 3);
  const wallM = K.std({ map: br, color: "#8a7a78", roughness: 0.92 });
  K.box(34, 9, 0.5, wallM, [0, 4.5, -8.5], [0, 0, 0], { cast: false });
  for (const k of [-1, 1]) K.box(0.5, 9, 14, wallM, [k * 15, 4.5, -2], [0, 0, 0], { cast: false });
  const ceilM = K.std({ color: "#121216", roughness: 0.9 });
  K.box(34, 0.4, 16, ceilM, [0, 8.2, -2], [0, 0, 0], { cast: false });
  const pipeM = K.std({ color: "#4a3a30", roughness: 0.5, metalness: 0.8 });
  for (const z of [-6, -3, 0]) K.cyl(0.14, 0.14, 30, pipeM, [0, 7.6, z], [0, 0, Math.PI / 2], { cast: false }, 12);
  // chain-link cage behind the fighters
  const fence = emblem(
    "fence",
    (g, W, H) => {
      g.clearRect(0, 0, W, H);
      g.strokeStyle = "rgba(190,195,205,1)";
      g.lineWidth = 3;
      const s = 32;
      for (let i = -H; i < W + H; i += s) {
        g.beginPath();
        g.moveTo(i, 0);
        g.lineTo(i + H, H);
        g.stroke();
        g.beginPath();
        g.moveTo(i + H, 0);
        g.lineTo(i, H);
        g.stroke();
      }
    },
    256,
    256
  );
  fence.repeat.set(26, 5);
  const fenceM = K.std({ map: fence, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide, metalness: 0.8, roughness: 0.4, color: "#c8ccd4" });
  K.mesh(new THREE.PlaneGeometry(22, 3.6), fenceM, [0, 1.8, -3.6], [0, 0, 0], { cast: true, recv: false });
  const post = K.std({ color: "#2a2c32", roughness: 0.4, metalness: 0.9 });
  for (let x = -11; x <= 11; x += 2.75) K.cyl(0.06, 0.06, 3.8, post, [x, 1.9, -3.6], [0, 0, 0], {}, 10);
  K.cyl(0.05, 0.05, 22, post, [0, 3.62, -3.6], [0, 0, Math.PI / 2], {}, 8);
  // neon tubes on the back wall
  const red = K.basic({ color: new THREE.Color("#ff2a3a").multiplyScalar(2.2), toneMapped: false });
  const blue = K.basic({ color: new THREE.Color("#2a6aff").multiplyScalar(2.2), toneMapped: false });
  for (let i = 0; i < 5; i++) K.cyl(0.035, 0.035, 5, i % 2 ? blue : red, [-12 + i * 6, 5.4 + (i % 2) * 0.6, -8.2], [0, 0, Math.PI / 2], { cast: false }, 8);
  const signT = emblem(
    "pitSign",
    (g, W, H) => {
      g.clearRect(0, 0, W, H);
      g.font = `900 ${H * 0.62}px Impact, Arial Black, sans-serif`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.shadowColor = "#ff2a3a";
      g.shadowBlur = 40;
      g.fillStyle = "#ffffff";
      g.fillText("NO RULES", W / 2, H / 2);
    },
    1024,
    256
  );
  K.mesh(new THREE.PlaneGeometry(8, 2), K.basic({ map: signT, color: new THREE.Color("#ff3a4a").multiplyScalar(1.8), transparent: true, toneMapped: false, depthWrite: false }), [0, 3.4, -8.2], [0, 0, 0], { cast: false, recv: false });
  // hanging industrial lamps + light cones
  const shade = K.std({ color: "#1a1a1e", roughness: 0.5, metalness: 0.8, side: THREE.DoubleSide });
  const bulb = K.basic({ color: new THREE.Color("#fff0d0").multiplyScalar(2), toneMapped: false });
  for (const x of [-3.5, 0, 3.5]) {
    K.cyl(0.01, 0.01, 2.6, post, [x, 6.7, -0.6], [0, 0, 0], { cast: false }, 6);
    K.mesh(new THREE.ConeGeometry(0.45, 0.35, 24, 1, true), shade, [x, 5.3, -0.6], [0, 0, 0], { cast: false });
    K.mesh(new THREE.SphereGeometry(0.1, 12, 8), bulb, [x, 5.18, -0.6], [0, 0, 0], { cast: false });
    beam(K, "#ffe2b0", [x, 5.15, -0.6], [0, 0, 0], 5.2, 1.6, 0.075);
  }
  // crowd behind the cage and on the sides
  const spots = [];
  for (let i = 0; i < 46; i++) spots.push({ x: -10 + (i % 23) * 0.9 + Math.random() * 0.3, y: 0, z: -4.4 - Math.floor(i / 23) * 0.9 - Math.random() * 0.2, yaw: (Math.random() - 0.5) * 0.4 });
  for (let i = 0; i < 16; i++) spots.push({ x: (i < 8 ? -1 : 1) * (8.5 + (i % 2) * 0.9), y: 0, z: -2.6 + (i % 8) * 0.55, yaw: i < 8 ? Math.PI / 2 - 0.4 : -Math.PI / 2 + 0.4 });
  const fans = crowd(K, group, D, spots, { palette: ["#3a3a46", "#5a2020", "#22324a", "#4a4030", "#2a2a2a", "#603050"] });
  const neonR = new THREE.PointLight("#ff2a3a", 9, 12, 1.5);
  neonR.position.set(-6, 5, -7);
  const neonB = new THREE.PointLight("#2a6aff", 9, 12, 1.5);
  neonB.position.set(6, 5, -7);
  group.add(neonR, neonB);
  // haze
  const haze = [];
  for (let i = 0; i < 6; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex(), color: "#8a8090", transparent: true, opacity: 0.06, depthWrite: false }));
    s.position.set(-8 + i * 3.2, 2.4 + (i % 2), -4.8);
    s.scale.setScalar(7);
    group.add(s);
    haze.push(s);
    D.push(s.material);
  }
  let hype = 0;
  return {
    mood: {
      exposure: 1.08,
      env: 0.3,
      fog: ["#120c12", 12, 34],
      hemi: ["#4a3050", "#0a0808", 0.45],
      key: ["#ffe8c8", 3.2, [1, 9, 4]],
      fill: ["#3a6aff", 0.5, [7, 3, 6]],
      rim: ["#ff2a3a", 2.8, [-4, 5, -6]],
      bloom: 0.6,
    },
    hype(v) {
      hype = Math.max(hype, v);
    },
    update(t, dt) {
      hype = Math.max(0, hype - dt * 0.5);
      if (Math.floor(t * 12) !== Math.floor((t - dt) * 12)) fans.pose(t, hype);
      haze.forEach((s, i) => (s.material.rotation = t * 0.03 * (i % 2 ? 1 : -1)));
      neonR.intensity = 9 + (Math.sin(t * 37) > 0.97 ? -6 : 0);
    },
  };
}

/* ================================================================ GRAND ARENA */
function buildGrand(group, D) {
  const K = kit(group, D);
  skyDome(group, D, [[0, "#020308"], [0.45, "#070a18"], [0.55, "#121630"], [1, "#030308"]], "skyGrand");
  // octagonal stage with a polished emblem floor
  const crest = emblem(
    "crest",
    (g, W) => {
      const c = W / 2;
      const gr = g.createRadialGradient(c, c, 0, c, c, c);
      gr.addColorStop(0, "#1c1c28");
      gr.addColorStop(1, "#0c0c14");
      g.fillStyle = gr;
      g.fillRect(0, 0, W, W);
      g.strokeStyle = "#c9a14a";
      g.lineWidth = 10;
      g.beginPath();
      g.arc(c, c, W * 0.33, 0, Math.PI * 2);
      g.stroke();
      g.lineWidth = 3;
      g.beginPath();
      g.arc(c, c, W * 0.3, 0, Math.PI * 2);
      g.stroke();
      // stylised fist-and-wings crest (original)
      g.fillStyle = "#c9a14a";
      g.save();
      g.translate(c, c);
      for (const k of [-1, 1]) {
        for (let i = 0; i < 5; i++) {
          g.beginPath();
          g.ellipse(k * (W * 0.1 + i * W * 0.032), -W * 0.02 - i * W * 0.018, W * 0.07, W * 0.016, k * (0.5 + i * 0.12), 0, Math.PI * 2);
          g.fill();
        }
      }
      g.fillRect(-W * 0.045, -W * 0.09, W * 0.09, W * 0.13);
      g.beginPath();
      g.arc(0, -W * 0.09, W * 0.045, Math.PI, 0);
      g.fill();
      g.font = `900 ${W * 0.07}px Impact, Arial Black, sans-serif`;
      g.textAlign = "center";
      g.fillText("IRON FIST", 0, W * 0.16);
      g.font = `700 ${W * 0.03}px Arial, sans-serif`;
      g.fillText("WORLD MASTERS", 0, W * 0.21);
      g.restore();
      // panel seams
      g.strokeStyle = "rgba(255,255,255,0.05)";
      g.lineWidth = 2;
      for (let i = 0; i < W; i += W / 8) {
        g.beginPath();
        g.moveTo(i, 0);
        g.lineTo(i, W);
        g.stroke();
      }
    },
    1024,
    1024
  );
  const stageTop = K.phys({ map: crest, roughness: 0.32, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.12, color: "#ffffff" });
  const sideM = K.std({ color: "#121218", roughness: 0.5, metalness: 0.5 });
  const oct = new THREE.CylinderGeometry(7, 7.3, 0.7, 8, 1, false);
  // material groups: 0 side, 1 top, 2 bottom
  const top = K.mesh(oct, [sideM, stageTop, sideM], [0, -0.35, -0.8], [0, Math.PI / 8, 0], { cast: false });
  // top-face UVs: planar
  const uv = oct.attributes.uv;
  const p = oct.attributes.position;
  for (let i = 0; i < uv.count; i++) if (Math.abs(p.getY(i) - 0.35) < 1e-3) uv.setXY(i, p.getX(i) / 14 + 0.5, p.getZ(i) / 14 + 0.5);
  void top;
  const goldGlow = K.basic({ color: new THREE.Color("#ffbb55").multiplyScalar(1.8), toneMapped: false });
  const edge = new THREE.TorusGeometry(7.05, 0.035, 6, 8);
  edge.rotateX(Math.PI / 2);
  K.mesh(edge, goldGlow, [0, 0.01, -0.8], [0, Math.PI / 8, 0], { cast: false });
  // arena floor & stands
  const floorM = K.std({ color: "#08080c", roughness: 0.6, metalness: 0.3 });
  const fg = new THREE.PlaneGeometry(80, 60);
  fg.rotateX(-Math.PI / 2);
  K.mesh(fg, floorM, [0, -0.7, -10], [0, 0, 0], { cast: false });
  const standM = K.std({ color: "#15151d", roughness: 0.8 });
  const spots = [];
  const pal = ["#d04040", "#3a6ad0", "#e0c040", "#f0f0f0", "#40a060", "#a040c0", "#202028", "#e07030"];
  for (let tier = 0; tier < 7; tier++) {
    const z = -11 - tier * 1.3;
    const y = -0.7 + tier * 0.9;
    K.box(46, 0.9, 1.3, standM, [0, y + 0.45 - 0.9, z], [0, 0, 0], { cast: false });
    for (let i = 0; i < 42; i++) spots.push({ x: -21 + i * 1.02 + (Math.random() - 0.5) * 0.3, y, z: z + 0.1, yaw: 0 });
  }
  for (const k of [-1, 1])
    for (let tier = 0; tier < 6; tier++) {
      const x = k * (12 + tier * 1.3);
      K.box(1.3, 0.9, 20, standM, [x, -0.7 + tier * 0.9 - 0.45, -2], [0, 0, 0], { cast: false });
      for (let i = 0; i < 16; i++) spots.push({ x, y: -0.7 + tier * 0.9, z: -10 + i * 1.05, yaw: k > 0 ? -Math.PI / 2 : Math.PI / 2 });
    }
  const fans = crowd(K, group, D, spots, { palette: pal, scale: 0.95 });
  // camera flashes in the crowd
  const flashes = ambient(group, D, { count: 60, area: [44, 7, -14, 8], color: "#ffffff", size: 0.35, opacity: 0, blending: THREE.AdditiveBlending });
  // giant screens
  const screenT = emblem(
    "screen",
    (g, W, H) => {
      const gr = g.createLinearGradient(0, 0, W, H);
      gr.addColorStop(0, "#1a2a6a");
      gr.addColorStop(1, "#6a1a4a");
      g.fillStyle = gr;
      g.fillRect(0, 0, W, H);
      g.fillStyle = "#ffffff";
      g.font = `900 ${H * 0.3}px Impact, Arial Black, sans-serif`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText("WORLD MASTERS", W / 2, H * 0.42);
      g.font = `700 ${H * 0.12}px Arial, sans-serif`;
      g.fillStyle = "#ffd36a";
      g.fillText("IRON FIST · ARENA CHAMPIONS", W / 2, H * 0.72);
    },
    1024,
    512
  );
  const screenM = K.basic({ map: screenT, toneMapped: false, color: new THREE.Color(1.3, 1.3, 1.3) });
  const frameM = K.std({ color: "#1a1a20", metalness: 0.8, roughness: 0.4 });
  for (const k of [-1, 1]) {
    K.box(8.4, 4.4, 0.3, frameM, [k * 10, 7.5, -13], [0, -k * 0.25, 0], { cast: false });
    K.mesh(new THREE.PlaneGeometry(8, 4), screenM, [k * 10 + Math.sin(-k * 0.25) * 0.16, 7.5, -12.84], [0, -k * 0.25, 0], { cast: false, recv: false });
  }
  // overhead truss + sweeping spotlight beams
  const truss = K.std({ color: "#2a2a30", metalness: 0.9, roughness: 0.35 });
  K.box(24, 0.3, 0.3, truss, [0, 9, -1], [0, 0, 0], { cast: false });
  K.box(24, 0.3, 0.3, truss, [0, 9, -5], [0, 0, 0], { cast: false });
  const beams = [];
  const beamCols = ["#ffd9a0", "#6aa0ff", "#ff6ad0", "#ffd9a0"];
  for (let i = 0; i < 4; i++) {
    const b = beam(K, beamCols[i], [-7.5 + i * 5, 8.9, -3], [0, 0, 0], 11, 2.0, 0.07);
    beams.push(b);
  }
  // braziers at the stage corners
  const bowl = K.std({ color: "#3a2a1a", metalness: 0.9, roughness: 0.3 });
  const fireSpots = [];
  for (const [x, z] of [
    [-6.4, -3.6],
    [6.4, -3.6],
  ]) {
    K.cyl(0.08, 0.12, 1.4, bowl, [x, 0.7, z], [0, 0, 0], {}, 10);
    K.mesh(new THREE.SphereGeometry(0.42, 20, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), bowl, [x, 1.55, z]);
    fireSpots.push([x, 1.55, z]);
  }
  const fire = ambient(group, D, { count: 160, area: [0.1, 0.1, 0, 0.1], color: "#ff8a2a", size: 0.16, opacity: 0.9, blending: THREE.AdditiveBlending });
  const fireLife = new Float32Array(fire.count).map(() => Math.random());
  const fl = fireSpots.map(([x, y, z]) => {
    const L = new THREE.PointLight("#ff8a3a", 6, 7, 1.8);
    L.position.set(x, y + 0.6, z + 0.3);
    group.add(L);
    return L;
  });
  let hype = 0;
  return {
    mood: {
      exposure: 1.0,
      env: 0.5,
      fog: ["#07080f", 26, 90],
      hemi: ["#5868b0", "#140a0a", 0.55],
      key: ["#fff0dc", 3.2, [-3, 10, 7]],
      fill: ["#6a8cff", 0.6, [8, 4, 6]],
      rim: ["#ffbb55", 2.4, [4, 6, -7]],
      bloom: 0.5,
    },
    hype(v) {
      hype = Math.max(hype, v);
    },
    update(t, dt) {
      hype = Math.max(0, hype - dt * 0.4);
      if (Math.floor(t * 12) !== Math.floor((t - dt) * 12)) fans.pose(t, 0.25 + hype);
      beams.forEach((b, i) => {
        b.rotation.z = Math.sin(t * 0.4 + i * 1.7) * 0.45;
        b.rotation.x = Math.cos(t * 0.33 + i) * 0.25;
      });
      // fire
      const p = fire.pos;
      for (let i = 0; i < fire.count; i++) {
        fireLife[i] -= dt * 1.6;
        const s = fireSpots[i % fireSpots.length];
        if (fireLife[i] <= 0) {
          fireLife[i] = 1;
          p[i * 3] = s[0] + (Math.random() - 0.5) * 0.4;
          p[i * 3 + 1] = s[1] + 0.05;
          p[i * 3 + 2] = s[2] + (Math.random() - 0.5) * 0.4;
        } else {
          p[i * 3 + 1] += dt * (1.2 + fireLife[i]);
          p[i * 3] += (s[0] - p[i * 3]) * dt * 2;
        }
      }
      fire.pts.geometry.attributes.position.needsUpdate = true;
      fl.forEach((L, i) => (L.intensity = 5 + Math.sin(t * 17 + i) * 0.8 + Math.sin(t * 41 + i * 3) * 0.5));
      // camera flashes
      flashes.pts.material.opacity = 0.9;
      const fp = flashes.pos;
      for (let i = 0; i < flashes.count; i++) if (Math.random() < 0.004 + hype * 0.02) fp[i * 3 + 1] = Math.random() * 6 - 0.2;
      else fp[i * 3 + 1] = -50;
      flashes.pts.geometry.attributes.position.needsUpdate = true;
    },
  };
}

const BUILDERS = { temple: buildTemple, rooftop: buildRooftop, underground: buildUnderground, grand: buildGrand };

export function buildArena(id) {
  const group = new THREE.Group();
  group.name = `arena-${id}`;
  const disposables = [];
  const a = (BUILDERS[id] || buildTemple)(group, disposables);
  return {
    id,
    group,
    mood: a.mood,
    update: a.update,
    hype: a.hype || (() => {}),
    dispose() {
      for (const d of disposables) d.dispose?.();
      group.traverse((o) => {
        if (o.isInstancedMesh) o.dispose();
      });
    },
  };
}
