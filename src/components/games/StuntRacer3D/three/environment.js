/**
 * Stunt Racer 3D — the world around the track.
 *
 *   buildSky(world)          dome (gradient + sun glow), sun disc, high
 *                            clouds, two rings of distant mountains — all of
 *                            it follows the camera and ignores fog
 *   buildScenery(T, world)   what the elevated track floats over, per theme:
 *     sky           a sea of clouds far below + drifting cloud puffs
 *     desert        sand floor, layered mesas, rock arches, canyon walls
 *     ocean         animated sea, palm islands, cliffs with waterfalls
 *     neon          night city: instanced skyscrapers with lit windows,
 *                   neon signs, rooftop beacons, a star field
 *     extreme       sunset cloud sea, giant floating rock islands
 *   envMap(world, gl)        a tiny PMREM of the sky so paint and glass
 *                            reflect the world
 * Tall scenery is kept clear of the track corridor so it never blocks the
 * road or the camera.
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { mulberry32, fbm } from "../engine/util.js";
import { cloudTex, cloudSeaTex, sandTex, rockTex, windowsTex, waterTex, fallTex, softDot, labelTex } from "./textures.js";

export function sunDir(world) {
  const [x, y, z] = world.sky.sunPos;
  return new THREE.Vector3(x, y, z).normalize();
}

function skyMaterial(world) {
  const sky = world.sky;
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: new THREE.Color(sky.top) },
      horizon: { value: new THREE.Color(sky.horizon) },
      sun: { value: new THREE.Color(sky.sunDisc || sky.sun) },
      sunDir: { value: sunDir(world) },
      night: { value: sky.night ? 1 : 0 },
    },
    vertexShader: "varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
    fragmentShader: `
      uniform vec3 top; uniform vec3 horizon; uniform vec3 sun; uniform vec3 sunDir; uniform float night; varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float h = max(d.y, 0.0);
        vec3 c = mix(horizon, top, pow(h, 0.5));
        float s = max(dot(d, sunDir), 0.0);
        c += sun * (pow(s, 8.0) * 0.35 + pow(s, 64.0) * 0.5 + smoothstep(0.9993, 0.9996, s) * 1.5) * (1.0 - night * 0.6);
        if (d.y < 0.0) c = mix(horizon, horizon * 0.85, min(1.0, -d.y * 3.0));
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
  });
}

/** Sky dome, sun, high clouds and mountain rings (follows the camera). */
export function buildSky(world, seed = 1) {
  const g = new THREE.Group();
  const sky = world.sky;
  const mats = [];
  const geos = [];
  const domeGeo = new THREE.SphereGeometry(3000, 32, 16);
  const domeMat = skyMaterial(world);
  geos.push(domeGeo);
  mats.push(domeMat);
  const dome = new THREE.Mesh(domeGeo, domeMat);
  dome.renderOrder = -10;
  g.add(dome);
  // high clouds ring
  const cm = new THREE.SpriteMaterial({ map: cloudTex(3), color: world.theme === "extreme" ? "#ffd2c0" : world.theme === "desert" ? "#ffe2c8" : world.theme === "neon" ? "#3a2a6a" : "#ffffff", transparent: true, opacity: world.theme === "neon" ? 0.5 : 0.9, depthWrite: false, fog: false });
  mats.push(cm);
  const rand = mulberry32(seed * 13 + 1);
  for (let k = 0; k < 18; k++) {
    const a = rand() * Math.PI * 2;
    const r = 1500 + rand() * 800;
    const sp = new THREE.Sprite(cm);
    sp.position.set(Math.sin(a) * r, 180 + rand() * 380, Math.cos(a) * r);
    sp.scale.set(520 + rand() * 380, 170 + rand() * 120, 1);
    g.add(sp);
  }
  // stars at night
  if (sky.night) {
    const n = 900;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = rand() * Math.PI * 2;
      const e = 0.08 + rand() * 1.4;
      pos[i * 3] = Math.cos(a) * Math.cos(e) * 2600;
      pos[i * 3 + 1] = Math.sin(e) * 2600;
      pos[i * 3 + 2] = Math.sin(a) * Math.cos(e) * 2600;
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const smat = new THREE.PointsMaterial({ color: "#ffffff", size: 3, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.8 });
    geos.push(sg);
    mats.push(smat);
    g.add(new THREE.Points(sg, smat));
  }
  // mountain rings (aerial perspective baked in)
  const hz = new THREE.Color(sky.horizon);
  [
    [2300, 560, 0.55, world.mountains[1]],
    [1800, 380, 0.32, world.mountains[0]],
  ].forEach(([R, Hm, haze, col], ri) => {
    const seg = 180;
    const pos = [];
    const colr = [];
    const idx = [];
    const c = new THREE.Color(col).lerp(hz, haze);
    const top = c.clone().lerp(new THREE.Color(world.theme === "desert" || world.theme === "neon" ? col : "#f4f7fb"), world.theme === "desert" || world.theme === "neon" ? 0 : 0.35);
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      const n = fbm(Math.cos(a) * 4 + ri * 9, Math.sin(a) * 4, seed + ri * 5, 5);
      const ridgeN = Math.pow(Math.abs(n * 2 - 1), 0.7);
      const h = world.theme === "desert" ? 60 + Math.round(ridgeN * 3) / 3 * Hm * 0.7 : 30 + ridgeN * Hm;
      const x = Math.sin(a) * R;
      const z = Math.cos(a) * R;
      pos.push(x, -200, z, x, h, z);
      colr.push(c.r, c.g, c.b);
      const cap = ridgeN > 0.75 ? 1 : 0;
      const t2 = cap ? top : c;
      colr.push(t2.r, t2.g, t2.b);
      if (i > 0) {
        const b = (i - 1) * 2;
        idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(colr, 3));
    geo.setIndex(idx);
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, side: THREE.DoubleSide, depthWrite: false });
    geos.push(geo);
    mats.push(mat);
    const m = new THREE.Mesh(geo, mat);
    m.renderOrder = -9 + ri;
    g.add(m);
  });
  // sun glow sprite
  const sunMat = new THREE.SpriteMaterial({ map: softDot(), color: sky.sunDisc || sky.sun, transparent: true, opacity: sky.night ? 0.35 : 0.8, depthWrite: false, fog: false, blending: THREE.AdditiveBlending });
  mats.push(sunMat);
  const sunSp = new THREE.Sprite(sunMat);
  sunSp.position.copy(sunDir(world)).multiplyScalar(2700);
  sunSp.scale.setScalar(sky.night ? 260 : 520);
  g.add(sunSp);
  return {
    group: g,
    follow(cam) {
      g.position.set(cam.position.x, cam.position.y * 0.5, cam.position.z);
    },
    dispose() {
      geos.forEach((x) => x.dispose());
      mats.forEach((x) => x.dispose());
    },
  };
}

/** XZ bounds + a corridor test (distance from the track centreline). */
function trackInfo(T) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const p of T.samples) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z);
    maxZ = Math.max(maxZ, p.z);
  }
  const pts = T.samples.filter((_, i) => i % 4 === 0);
  const near = (x, z) => {
    let best = Infinity;
    let y = 0;
    for (const p of pts) {
      const d = (p.x - x) * (p.x - x) + (p.z - z) * (p.z - z);
      if (d < best) {
        best = d;
        y = p.y;
      }
    }
    return { d: Math.sqrt(best), y };
  };
  return { minX, maxX, minZ, maxZ, cx: (minX + maxX) / 2, cz: (minZ + maxZ) / 2, rad: Math.hypot(maxX - minX, maxZ - minZ) / 2, near };
}

/** Ground level each theme puts its scenery on. */
export function groundLevel(T, world) {
  if (world.theme === "sky" || world.theme === "extreme") return T.minY - 75;
  return Math.min(0, T.minY - 55);
}

export function buildScenery(T, world, quality = "medium", seed = 1) {
  const group = new THREE.Group();
  const geos = [];
  const mats = [];
  const updaters = [];
  const info = trackInfo(T);
  const rand = mulberry32(seed * 7 + 3);
  const gy = groundLevel(T, world);
  const dens = quality === "low" ? 0.55 : quality === "high" ? 1.4 : 1;
  const keepG = (x) => (geos.push(x), x);
  const keepM = (x) => (mats.push(x), x);
  const spread = Math.max(700, info.rad + 500);
  const randAround = (minD = 40) => {
    for (let k = 0; k < 30; k++) {
      const a = rand() * Math.PI * 2;
      const r = Math.sqrt(rand()) * spread;
      const x = info.cx + Math.sin(a) * r;
      const z = info.cz + Math.cos(a) * r;
      const n = info.near(x, z);
      if (n.d > minD) return { x, z, d: n.d, ty: n.y };
    }
    return null;
  };

  const cloudSea = (tint, y, opacity = 1) => {
    const tex = cloudSeaTex(tint).clone();
    tex.needsUpdate = true;
    tex.repeat.set(10, 10);
    const m = keepM(new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity, depthWrite: false, fog: true, color: tint }));
    const geo = keepG(new THREE.PlaneGeometry(8000, 8000));
    const mesh = new THREE.Mesh(geo, m);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(info.cx, y, info.cz);
    group.add(mesh);
    // solid base under the layer so nothing shows through
    const base = new THREE.Mesh(keepG(new THREE.PlaneGeometry(8000, 8000)), keepM(new THREE.MeshBasicMaterial({ color: tint, fog: true })));
    base.rotation.x = -Math.PI / 2;
    base.position.set(info.cx, y - 25, info.cz);
    group.add(base);
    updaters.push((t) => {
      tex.offset.x = t * 0.004;
      tex.offset.y = t * 0.0025;
    });
    disposeTex.push(tex);
  };
  const disposeTex = [];
  const puffs = (count, yLo, yHi, color, scale = 1) => {
    const mats2 = [1, 2, 4].map((sd) => keepM(new THREE.SpriteMaterial({ map: cloudTex(sd), color, transparent: true, opacity: 0.92, depthWrite: false })));
    for (let i = 0; i < count * dens; i++) {
      const p = randAround(30);
      if (!p) continue;
      const sp = new THREE.Sprite(mats2[i % 3]);
      const y = yLo + rand() * (yHi - yLo);
      // keep puffs at road level away from the road itself
      if (Math.abs(y - p.ty) < 18 && p.d < 70) continue;
      sp.position.set(p.x, y, p.z);
      const s = (60 + rand() * 120) * scale;
      sp.scale.set(s, s * 0.5, 1);
      group.add(sp);
    }
  };

  if (world.theme === "sky" || world.theme === "extreme") {
    const tint = world.theme === "extreme" ? "#ffc2a8" : "#ffffff";
    cloudSea(tint, gy, 1);
    puffs(70, gy + 5, T.maxY + 60, world.theme === "extreme" ? "#ffd8c8" : "#ffffff", 1);
    if (world.theme === "extreme") {
      // giant floating rock islands
      const rock = keepM(new THREE.MeshStandardMaterial({ color: "#7a5a6a", roughness: 0.95, flatShading: true }));
      const grass = keepM(new THREE.MeshStandardMaterial({ color: "#7aa86a", roughness: 0.9, flatShading: true }));
      for (let i = 0; i < 16 * dens; i++) {
        const p = randAround(90);
        if (!p) continue;
        const r = 20 + rand() * 45;
        const under = keepG(islandRock(r, r * (1.4 + rand() * 0.8)));
        jitter(under, rand, r * 0.15);
        const top = keepG(new THREE.CylinderGeometry(r * 1.02, r, r * 0.25, 7, 1));
        jitter(top, rand, r * 0.08);
        const y = gy + 60 + rand() * (T.maxY - gy + 80);
        const u = new THREE.Mesh(under, rock);
        u.position.set(p.x, y - r * 0.9, p.z);
        const tp = new THREE.Mesh(top, grass);
        tp.position.set(p.x, y + r * 0.12, p.z);
        group.add(u, tp);
        updaters.push((t) => {
          const b = Math.sin(t * 0.3 + i) * 1.2;
          u.position.y = y - r * 0.9 + b;
          tp.position.y = y + r * 0.12 + b;
        });
      }
    } else {
      // a few distant floating islands with waterfalls of cloud
      const rock = keepM(new THREE.MeshStandardMaterial({ color: "#9aa4b8", roughness: 0.95, flatShading: true }));
      const grass = keepM(new THREE.MeshStandardMaterial({ color: "#8fd06a", roughness: 0.9, flatShading: true }));
      for (let i = 0; i < 8 * dens; i++) {
        const p = randAround(160);
        if (!p) continue;
        const r = 18 + rand() * 30;
        const under = keepG(islandRock(r, r * 1.8));
        jitter(under, rand, r * 0.15);
        const top = keepG(new THREE.CylinderGeometry(r * 1.02, r, r * 0.22, 7, 1));
        const y = T.minY - 20 + rand() * 80;
        const u = new THREE.Mesh(under, rock);
        u.position.set(p.x, y - r, p.z);
        const tp = new THREE.Mesh(top, grass);
        tp.position.set(p.x, y, p.z);
        group.add(u, tp);
      }
    }
  }

  if (world.theme === "desert") {
    const sand = sandTex().clone();
    sand.needsUpdate = true;
    sand.repeat.set(60, 60);
    disposeTex.push(sand);
    const ground = new THREE.Mesh(keepG(new THREE.PlaneGeometry(9000, 9000)), keepM(new THREE.MeshStandardMaterial({ map: sand, roughness: 1, color: "#f0c090" })));
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(info.cx, gy, info.cz);
    ground.receiveShadow = false;
    group.add(ground);
    const rt = rockTex().clone();
    rt.needsUpdate = true;
    rt.repeat.set(3, 2);
    disposeTex.push(rt);
    const rockM = keepM(new THREE.MeshStandardMaterial({ map: rt, roughness: 0.95, flatShading: true }));
    const capM = keepM(new THREE.MeshStandardMaterial({ color: "#c97a48", roughness: 0.95, flatShading: true }));
    for (let i = 0; i < 46 * dens; i++) {
      const p = randAround(45);
      if (!p) continue;
      const r = 14 + rand() * 50;
      // tall mesas only well away from the road; near ones stay under it
      const maxH = p.d > 140 ? 40 + rand() * 120 : Math.max(12, p.ty - gy - 22) * (0.4 + rand() * 0.6);
      const geo = keepG(new THREE.CylinderGeometry(r * (0.8 + rand() * 0.2), r * (1.05 + rand() * 0.25), maxH, 8 + Math.floor(rand() * 4), 3));
      jitter(geo, rand, r * 0.12, true);
      const m = new THREE.Mesh(geo, rockM);
      m.position.set(p.x, gy + maxH / 2, p.z);
      group.add(m);
      const cap = new THREE.Mesh(keepG(new THREE.CylinderGeometry(r * 0.82, r * 0.82, 2, 8)), capM);
      cap.position.set(p.x, gy + maxH + 0.5, p.z);
      group.add(cap);
    }
    // rock arches
    for (let i = 0; i < 7 * dens; i++) {
      const p = randAround(80);
      if (!p) continue;
      const R = 25 + rand() * 30;
      const geo = keepG(new THREE.TorusGeometry(R, 5 + rand() * 4, 6, 14, Math.PI));
      jitter(geo, rand, 1.6);
      const m = new THREE.Mesh(geo, rockM);
      m.position.set(p.x, gy, p.z);
      m.rotation.y = rand() * Math.PI;
      if (p.d < 120 && gy + R + 9 > p.ty - 10) m.scale.setScalar(Math.max(0.3, (p.ty - 20 - gy) / (R + 9)));
      group.add(m);
    }
  }

  if (world.theme === "ocean") {
    const wt = waterTex().clone();
    wt.needsUpdate = true;
    wt.repeat.set(140, 140);
    disposeTex.push(wt);
    const sea = new THREE.Mesh(keepG(new THREE.PlaneGeometry(9000, 9000)), keepM(new THREE.MeshStandardMaterial({ map: wt, color: "#7fe6f2", roughness: 0.25, metalness: 0.35 })));
    sea.rotation.x = -Math.PI / 2;
    sea.position.set(info.cx, gy, info.cz);
    group.add(sea);
    updaters.push((t) => {
      wt.offset.x = t * 0.01;
      wt.offset.y = Math.sin(t * 0.2) * 0.02;
    });
    const sandM = keepM(new THREE.MeshStandardMaterial({ color: "#f4dca0", roughness: 1, flatShading: true }));
    const green = keepM(new THREE.MeshStandardMaterial({ color: "#3fae5a", roughness: 0.95, flatShading: true }));
    const cliff = keepM(new THREE.MeshStandardMaterial({ color: "#8a8f86", roughness: 0.95, flatShading: true }));
    const trunk = keepM(new THREE.MeshStandardMaterial({ color: "#8a6a48", roughness: 1 }));
    const leaf = keepM(new THREE.MeshStandardMaterial({ color: "#2f9a4a", roughness: 0.9, flatShading: true, side: THREE.DoubleSide }));
    const fall = fallTex().clone();
    fall.needsUpdate = true;
    disposeTex.push(fall);
    const fallM = keepM(new THREE.MeshBasicMaterial({ map: fall, transparent: true, opacity: 0.85, side: THREE.DoubleSide }));
    for (let i = 0; i < 26 * dens; i++) {
      const p = randAround(50);
      if (!p) continue;
      const r = 18 + rand() * 50;
      const tall = p.d > 120 && rand() < 0.4;
      const h = tall ? 50 + rand() * 90 : 8 + rand() * 18;
      const beach = new THREE.Mesh(keepG(new THREE.CylinderGeometry(r * 1.1, r * 1.3, 3, 10)), sandM);
      beach.position.set(p.x, gy + 0.5, p.z);
      group.add(beach);
      const hill = keepG(tall ? new THREE.CylinderGeometry(r * 0.55, r * 0.8, h, 8, 3) : new THREE.ConeGeometry(r * 0.9, h, 9, 2));
      jitter(hill, rand, r * 0.08, true);
      const m = new THREE.Mesh(hill, tall ? cliff : green);
      m.position.set(p.x, gy + h / 2 + 1, p.z);
      group.add(m);
      if (tall) {
        const top = new THREE.Mesh(keepG(new THREE.CylinderGeometry(r * 0.58, r * 0.56, 3, 8)), green);
        top.position.set(p.x, gy + h + 2, p.z);
        group.add(top);
        // waterfall down the cliff face
        const wf = new THREE.Mesh(keepG(new THREE.PlaneGeometry(r * 0.35, h)), fallM);
        const a = rand() * Math.PI * 2;
        wf.position.set(p.x + Math.sin(a) * (r * 0.62), gy + h / 2 + 1, p.z + Math.cos(a) * (r * 0.62));
        wf.rotation.y = a;
        group.add(wf);
      }
      // palms
      for (let k = 0; k < 3; k++) {
        const a = rand() * Math.PI * 2;
        const px = p.x + Math.sin(a) * r * 0.9;
        const pz = p.z + Math.cos(a) * r * 0.9;
        const tr = new THREE.Mesh(keepG(new THREE.CylinderGeometry(0.4, 0.6, 9, 6)), trunk);
        tr.position.set(px, gy + 5, pz);
        tr.rotation.z = (rand() - 0.5) * 0.4;
        group.add(tr);
        const crown = new THREE.Mesh(keepG(new THREE.ConeGeometry(4.5, 2.2, 7)), leaf);
        crown.position.set(px, gy + 9.8, pz);
        group.add(crown);
      }
    }
    updaters.push((t) => {
      fall.offset.y = t * 0.8;
    });
  }

  if (world.theme === "neon") {
    const ground = new THREE.Mesh(keepG(new THREE.PlaneGeometry(9000, 9000)), keepM(new THREE.MeshStandardMaterial({ color: "#0b0914", roughness: 0.6, metalness: 0.4 })));
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(info.cx, gy, info.cz);
    group.add(ground);
    // glowing street grid
    const gridM = keepM(new THREE.MeshBasicMaterial({ color: "#3a1a7a" }));
    const gridGeos = [];
    for (let k = -30; k <= 30; k++) {
      const a = new THREE.BoxGeometry(5000, 0.2, 1.2);
      a.translate(info.cx, gy + 0.1, info.cz + k * 90);
      const b = new THREE.BoxGeometry(1.2, 0.2, 5000);
      b.translate(info.cx + k * 90, gy + 0.1, info.cz);
      gridGeos.push(a, b);
    }
    group.add(new THREE.Mesh(keepG(mergeGeometries(gridGeos)), gridM));
    gridGeos.forEach((x) => x.dispose());
    // instanced skyscrapers, two window textures
    const towers = [];
    for (let i = 0; i < 260 * dens; i++) {
      const p = randAround(22);
      if (!p) continue;
      const w = 14 + rand() * 26;
      const d = 14 + rand() * 26;
      let h = 30 + Math.pow(rand(), 1.6) * 220;
      if (p.d < 40) h = Math.min(h, p.ty - gy - 14);
      if (h < 8) continue;
      towers.push({ x: p.x, z: p.z, w, d, h, k: i % 2 });
    }
    const boxGeo = keepG(new THREE.BoxGeometry(1, 1, 1));
    boxGeo.translate(0, 0.5, 0);
    for (const k of [0, 1]) {
      const list = towers.filter((t) => t.k === k);
      const tex = windowsTex(true, k + 1).clone();
      tex.needsUpdate = true;
      tex.repeat.set(3, 8);
      disposeTex.push(tex);
      const m = keepM(new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: "#ffffff", emissiveIntensity: 0.9, roughness: 0.5, metalness: 0.3, color: "#5a5a7a" }));
      const inst = new THREE.InstancedMesh(boxGeo, m, Math.max(1, list.length));
      const mtx = new THREE.Matrix4();
      list.forEach((t, i) => {
        mtx.compose(new THREE.Vector3(t.x, gy, t.z), new THREE.Quaternion(), new THREE.Vector3(t.w, t.h, t.d));
        inst.setMatrixAt(i, mtx);
      });
      inst.count = list.length;
      group.add(inst);
    }
    // rooftop beacons + neon signs on a few towers
    const beaconM = keepM(new THREE.MeshBasicMaterial({ color: "#ff2f5a" }));
    const signs = ["NEON", "TURBO", "NIGHT", "24/7", "STUNT", "ARCADE", "SKY"];
    towers
      .filter((t) => t.h > 90)
      .slice(0, 40)
      .forEach((t, i) => {
        const b = new THREE.Mesh(keepG(new THREE.SphereGeometry(1.2, 8, 6)), beaconM);
        b.position.set(t.x, gy + t.h + 1.5, t.z);
        group.add(b);
        if (i % 3 === 0) {
          const col = ["#ff2fd0", "#2ff3ff", "#ffd23a"][(i / 3) % 3];
          const sm = keepM(new THREE.MeshBasicMaterial({ map: labelTex(signs[i % signs.length], { bg: "#05040c", fg: col, accent: col, w: 512, h: 160, font: 90 }), toneMapped: false, side: THREE.DoubleSide }));
          const s = new THREE.Mesh(keepG(new THREE.PlaneGeometry(t.w * 0.9, t.w * 0.28)), sm);
          s.position.set(t.x, gy + t.h * 0.75, t.z + t.d / 2 + 0.3);
          group.add(s);
        }
      });
    updaters.push((t) => {
      beaconM.color.setHSL(0.97, 1, 0.35 + 0.25 * (Math.sin(t * 3) > 0 ? 1 : 0));
    });
  }

  return {
    group,
    groundY: gy,
    update(t) {
      for (const u of updaters) u(t);
    },
    dispose() {
      geos.forEach((x) => x.dispose());
      mats.forEach((x) => x.dispose());
      disposeTex.forEach((x) => x.dispose());
    },
  };
}

function jitter(geo, rand, amt, keepTopFlat = false) {
  const p = geo.attributes.position;
  const seen = new Map();
  let maxY = -Infinity;
  for (let i = 0; i < p.count; i++) maxY = Math.max(maxY, p.getY(i));
  for (let i = 0; i < p.count; i++) {
    const key = `${p.getX(i).toFixed(2)},${p.getY(i).toFixed(2)},${p.getZ(i).toFixed(2)}`;
    let d = seen.get(key);
    if (!d) {
      d = [(rand() - 0.5) * amt, (rand() - 0.5) * amt, (rand() - 0.5) * amt];
      seen.set(key, d);
    }
    const top = keepTopFlat && Math.abs(p.getY(i) - maxY) < 1e-3;
    p.setXYZ(i, p.getX(i) + d[0], p.getY(i) + (top ? 0 : d[1]), p.getZ(i) + d[2]);
  }
  p.needsUpdate = true;
  geo.computeVertexNormals();
}

/** Rounded rocky underside of a floating island (apex down, top at +h/2). */
function islandRock(r, h) {
  const pts = [];
  const n = 9;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    // bulging bowl that narrows to a rounded tip
    pts.push(new THREE.Vector2(Math.max(0.01, r * Math.sin((1 - t) * Math.PI * 0.5) ** 0.7 * (1 - 0.15 * t)), h / 2 - t * h));
  }
  const g = new THREE.LatheGeometry(pts.reverse(), 12);
  return g;
}

/** A small PMREM of the world's sky so paint, chrome and glass reflect it. */
export function envMap(world, gl) {
  const scene = new THREE.Scene();
  const domeMat = skyMaterial(world);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), domeMat);
  scene.add(dome);
  const ground = new THREE.Mesh(new THREE.CircleGeometry(48, 24), new THREE.MeshBasicMaterial({ color: world.theme === "desert" ? "#c08050" : world.theme === "ocean" ? "#2a90b0" : world.theme === "neon" ? "#120a22" : "#d8e4f0" }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -6;
  scene.add(ground);
  const pm = new THREE.PMREMGenerator(gl);
  const rt = pm.fromScene(scene, 0.02);
  pm.dispose();
  dome.geometry.dispose();
  domeMat.dispose();
  ground.geometry.dispose();
  ground.material.dispose();
  return rt;
}
