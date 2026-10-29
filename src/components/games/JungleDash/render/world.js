/**
 * Plain Three.js view of the simulation. createWorld(container) owns the
 * renderer; setGame(g) builds the level's meshes once (static ground is
 * merged per material), render(g, dt) syncs every moving thing from the sim
 * and draws one frame. Nothing here changes game state.
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { surfaceTex, crateTex, liquidTex, radialTex, disposeTextures } from "./textures.js";
import { createMascot, animateMascot } from "./mascot.js";
import { makeCrab, makeThorn, makePlant, makeBoss, makeCheckpoint, makePortal, makeProp } from "./models.js";
import { makeCamera, updateCamera } from "../engine/camera.js";

export const THEMES = {
  sunny: {
    sky: ["#3fa9f5", "#bfe9ff", "#e9fbff"], fog: "#c9eeff", fogNear: 40, fogFar: 130,
    hemi: ["#ffffff", "#6a8a3a", 0.85], sun: ["#fff1d0", 1.55], amb: 0.25,
    liquid: "water",
    palette: { grass: ["#6cc644", "#58a83a", "#8fe060"], dirt: ["#a8703f", "#8a5a30", "#c08850"], wood: ["#b07a40", "#7a5028", "#c8945a"], stone: ["#a8a498", "#86827a", "#c4c0b4"], trunk: "#8a6236", leaf: "#3faa3a", bush: "#4cb83e", rock: "#9a968a", flower: ["#ff5a8a", "#ffd23f", "#ffffff"] },
    props: ["palm", "palm", "palm", "bush", "bush", "rock", "tree"],
  },
  river: {
    sky: ["#58b6e8", "#c8f0ff", "#f0fff8"], fog: "#c6eef6", fogNear: 35, fogFar: 120,
    hemi: ["#ffffff", "#4a7a5a", 0.85], sun: ["#fff6e0", 1.45], amb: 0.25,
    liquid: "water",
    palette: { grass: ["#5cbc4a", "#48a03a", "#80d868"], dirt: ["#8a6a48", "#6e5236", "#a4825c"], wood: ["#a8743c", "#704a22", "#c48c50"], stone: ["#8aa0a0", "#6a8080", "#a8bcbc"], trunk: "#7a5a32", leaf: "#2f9a4a", bush: "#3fae4e", rock: "#7e8c88", flower: ["#ffffff", "#a8e0ff"] },
    props: ["palm", "tree", "reeds", "reeds", "rock", "bush"],
  },
  temple: {
    sky: ["#e6a24a", "#f6d79a", "#fff1d0"], fog: "#f0d6a0", fogNear: 30, fogFar: 105,
    hemi: ["#fff4e0", "#7a6040", 0.8], sun: ["#ffd9a0", 1.45], amb: 0.28,
    liquid: "abyss",
    palette: { grass: ["#d8b878", "#bc9a5c", "#ecd09a"], dirt: ["#c4a46a", "#a68650", "#dcc088"], sand: ["#d8b878", "#a08050", "#ecd09a"], wood: ["#9a6a3a", "#6a4222", "#b8844e"], stone: ["#b4a684", "#8a7e60", "#cfc29e"], trunk: "#6a5030", leaf: "#4f8a3a", bush: "#5a9a3e", rock: "#b0a07a" },
    props: ["pillar", "pillar", "head", "bush", "rock", "palm"],
  },
  volcano: {
    sky: ["#2a0e10", "#8a2a14", "#e0602a"], fog: "#6a2616", fogNear: 25, fogFar: 95,
    hemi: ["#ffb08a", "#3a1a12", 0.7], sun: ["#ffb070", 1.3], amb: 0.3,
    liquid: "lava",
    palette: { grass: ["#5a4a44", "#3e3230", "#74625a"], dirt: ["#3d3434", "#2a2222", "#544848"], basalt: ["#3d3434", "#2a2222", "#5a4a44"], wood: ["#6a4a30", "#3e2a1a", "#8a6440"], stone: ["#5a5050", "#3e3636", "#746868"], trunk: "#2a2020", leaf: "#5a3a2a", bush: "#4a3a2a", rock: "#4a3e3a" },
    props: ["spire", "spire", "deadtree", "rock", "rock"],
  },
  moon: {
    sky: ["#070a24", "#1a2058", "#3a3a7a"], fog: "#141a40", fogNear: 22, fogFar: 85,
    hemi: ["#9ab0ff", "#1a2030", 0.75], sun: ["#bcd0ff", 1.0], amb: 0.32,
    liquid: "night",
    palette: { grass: ["#2f6b6a", "#235454", "#3e8a86"], dirt: ["#3a3048", "#2a2236", "#4a3e5a"], moss: ["#2f6b6a", "#204a4a", "#46a49c"], wood: ["#5a4a6a", "#3a2e48", "#7a6890"], stone: ["#5a6078", "#40465a", "#7a809a"], trunk: "#2a2236", leaf: "#1f4a4e", bush: "#245a5a", rock: "#4a4e64", glow: "#7affd8" },
    props: ["pine", "pine", "mushroom", "mushroom", "rock", "bush"],
  },
  fortress: {
    sky: ["#3a4656", "#7a8a96", "#b8c0c0"], fog: "#8a969c", fogNear: 30, fogFar: 110,
    hemi: ["#e8eef0", "#4a4a3a", 0.85], sun: ["#fff0d8", 1.35], amb: 0.28,
    liquid: "swamp",
    palette: { grass: ["#6a9a4a", "#527a3a", "#86b860"], dirt: ["#6a6058", "#524a42", "#847a70"], fort: ["#9a968c", "#6e6a62", "#b8b4a8"], wood: ["#8a5a32", "#5a3a1e", "#a87444"], stone: ["#9a968c", "#6e6a62", "#b8b4a8"], trunk: "#5a4030", leaf: "#3a7a3a", bush: "#4a8a3a", rock: "#8a8478" },
    props: ["tower", "torch", "tree", "rock", "bush"],
  },
};

/* --------------------------------------------------------------- geometry helpers */
/** world-space UVs so tiled textures keep their scale on any box size */
function worldUV(geo, scale = 0.5) {
  const pos = geo.attributes.position, nor = geo.attributes.normal, uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const nx = Math.abs(nor.getX(i)), ny = Math.abs(nor.getY(i));
    if (ny > 0.5) uv.setXY(i, x * scale, z * scale);
    else if (nx > 0.5) uv.setXY(i, z * scale, y * scale);
    else uv.setXY(i, x * scale, y * scale);
  }
  uv.needsUpdate = true;
  return geo;
}
function boxGeo(b, inset = 0) {
  const w = b[3] - b[0] - inset * 2, h = b[4] - b[1], d = b[5] - b[2] - inset * 2;
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate((b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2);
  return worldUV(g);
}
function rngFor(seed) {
  let s = seed * 9301 + 49297;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}
function skyTexture(cols) {
  const c = document.createElement("canvas");
  c.width = 4;
  c.height = 256;
  const x = c.getContext("2d");
  const g = x.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, cols[0]);
  g.addColorStop(0.55, cols[1]);
  g.addColorStop(1, cols[2]);
  x.fillStyle = g;
  x.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** surface materials per solid kind: [top, side] */
function surfaceMats(theme, m) {
  const P = theme.palette;
  const T = (kind, pal) => new THREE.MeshLambertMaterial({ map: surfaceTex(kind, pal) });
  switch (m) {
    case "wood":
      return [T("wood", P.wood), T("wood", P.wood)];
    case "stone":
      return [T("brick", P.stone), T("brick", P.stone)];
    case "sand":
      return [T("sand", P.sand || P.stone), T("sand", P.sand || P.stone)];
    case "basalt":
      return [T("basalt", P.basalt || P.stone), T("basalt", P.dirt)];
    case "moss":
      return [T("moss", P.moss || P.grass), T("dirt", P.dirt)];
    case "fort":
      return [T("brick", P.fort || P.stone), T("brick", P.fort || P.stone)];
    default:
      return [T("grass", P.grass), T("dirt", P.dirt)];
  }
}
const HAS_LIP = new Set(["grass", "moss"]);

/* --------------------------------------------------------------- particles */
function makeParticles(scene, max = 320) {
  const geo = new THREE.TetrahedronGeometry(0.11, 0);
  const mat = new THREE.MeshBasicMaterial({ color: "#ffffff" });
  const mesh = new THREE.InstancedMesh(geo, mat, max);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  const col = new THREE.Color();
  for (let i = 0; i < max; i++) mesh.setColorAt(i, col.set("#ffffff"));
  scene.add(mesh);
  const P = [];
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), v = new THREE.Vector3();
  let next = 0;
  return {
    mesh,
    burst(x, y, z, n, color, { speed = 4, up = 4, life = 0.7, size = 1, grav = 14, spread = 1 } = {}) {
      for (let k = 0; k < n; k++) {
        const i = next;
        next = (next + 1) % max;
        const a = Math.random() * Math.PI * 2;
        const r = (0.4 + Math.random() * 0.6) * speed;
        P[i] = { x: x + (Math.random() - 0.5) * 0.3 * spread, y, z: z + (Math.random() - 0.5) * 0.3 * spread, vx: Math.cos(a) * r, vy: up * (0.5 + Math.random()), vz: Math.sin(a) * r, t: 0, life: life * (0.7 + Math.random() * 0.6), s: size * (0.6 + Math.random() * 0.8), rx: Math.random() * 6, grav };
        mesh.setColorAt(i, col.set(Array.isArray(color) ? color[k % color.length] : color));
      }
      mesh.instanceColor.needsUpdate = true;
    },
    update(dt) {
      for (let i = 0; i < max; i++) {
        const p = P[i];
        if (!p || p.t >= p.life) {
          m4.makeScale(0, 0, 0);
          mesh.setMatrixAt(i, m4);
          continue;
        }
        p.t += dt;
        p.vy -= p.grav * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        p.rx += dt * 8;
        const k = Math.max(0, 1 - p.t / p.life) * p.s;
        q.setFromEuler(e.set(p.rx, p.rx * 0.7, 0));
        m4.compose(v.set(p.x, p.y, p.z), q, s.set(k, k, k));
        mesh.setMatrixAt(i, m4);
      }
      mesh.instanceMatrix.needsUpdate = true;
    },
    clear() {
      P.length = 0;
    },
  };
}

/* --------------------------------------------------------------- the world */
export function createWorld(container, { preserve = false, lowPower = false } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: !lowPower, preserveDrawingBuffer: preserve, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, lowPower ? 1.25 : 1.6));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.className = "jd-canvas";
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, 16 / 9, 0.1, 260);
  const hemi = new THREE.HemisphereLight("#ffffff", "#556633", 0.85);
  scene.add(hemi);
  const amb = new THREE.AmbientLight("#ffffff", 0.25);
  scene.add(amb);
  const sun = new THREE.DirectionalLight("#fff1d0", 1.5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(lowPower ? 1024 : 2048, lowPower ? 1024 : 2048);
  const sc = sun.shadow.camera;
  sc.left = sc.bottom = -22;
  sc.right = sc.top = 22;
  sc.near = 1;
  sc.far = 70;
  sun.shadow.bias = -0.0008;
  sun.shadow.normalBias = 0.03;
  scene.add(sun);
  scene.add(sun.target);

  // player
  const mango = createMascot();
  scene.add(mango.root);
  const blobTex = radialTex("blob", [[0, "rgba(0,0,0,0.55)"], [0.6, "rgba(0,0,0,0.3)"], [1, "rgba(0,0,0,0)"]]);
  const blobMat = new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  const blobGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  blobGeo.userData.keep = true;
  const blob = new THREE.Mesh(blobGeo, blobMat);
  scene.add(blob);
  const particles = makeParticles(scene);

  let level = null; // per-level THREE.Group + bookkeeping
  let cam = null;
  let shake = 0;
  let tAcc = 0;
  let menuA = 0;
  let curTheme = null;
  let shadowsOn = true;

  function disposeLevel() {
    if (!level) return;
    scene.remove(level.group);
    level.group.traverse((o) => {
      if (o.isMesh || o.isInstancedMesh || o.isPoints) {
        if (o.geometry && !o.geometry.userData.keep) o.geometry.dispose();
        const ms = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of ms) {
          if (!m) continue;
          if (m.map?.userData.clone) m.map.dispose();
          m.dispose();
        }
      }
    });
    level = null;
  }

  function setGame(g) {
    disposeLevel();
    particles.clear();
    const L = g.level;
    const th = THEMES[L.theme] || THEMES.sunny;
    curTheme = th;
    const group = new THREE.Group();
    scene.add(group);
    const lv = { g, group, theme: th, movers: [], fallers: [], crates: [], enemies: [], hazards: [], checkpoints: [], props: [], shots: [], hearts: [], flames: [] };
    level = lv;
    const rnd = rngFor(L.id * 31 + 7);

    // sky + fog + lights
    scene.background?.dispose?.();
    scene.background = skyTexture(th.sky);
    scene.fog = new THREE.Fog(th.fog, th.fogNear, th.fogFar);
    hemi.color.set(th.hemi[0]);
    hemi.groundColor.set(th.hemi[1]);
    hemi.intensity = th.hemi[2];
    sun.color.set(th.sun[0]);
    sun.intensity = th.sun[1];
    amb.intensity = th.amb;

    // --- static ground: merged per material, grass lips on top
    const byMat = new Map();
    const add = (key, mat, geo) => {
      if (!byMat.has(key)) byMat.set(key, { mat, geos: [] });
      byMat.get(key).geos.push(geo);
    };
    const matCache = new Map();
    const mats = (m) => {
      if (!matCache.has(m)) matCache.set(m, surfaceMats(th, m));
      return matCache.get(m);
    };
    for (const s of g.statics) {
      const [top, side] = mats(s.m);
      const b = [s.x0, s.y0, s.z0, s.x1, s.y1, s.z1];
      if (HAS_LIP.has(s.m)) {
        add(s.m + "-side", side, boxGeo([b[0], b[1], b[2], b[3], b[4] - 0.2, b[5]]));
        add(s.m + "-top", top, boxGeo([b[0] - 0.06, b[4] - 0.24, b[2] - 0.06, b[3] + 0.06, b[4], b[5] + 0.06]));
      } else add(s.m + "-top", top, boxGeo(b));
    }
    for (const { mat, geos } of byMat.values()) {
      const merged = mergeGeometries(geos, false);
      geos.forEach((q) => q.dispose());
      const mesh = new THREE.Mesh(merged, mat);
      mesh.receiveShadow = true;
      mesh.castShadow = true;
      group.add(mesh);
    }
    // rope-bridge posts on narrow wooden strips
    const postM = new THREE.MeshLambertMaterial({ color: th.palette.wood[1] });
    const ropeM = new THREE.MeshLambertMaterial({ color: "#d8c08a" });
    for (const s of g.statics) {
      if (s.m !== "wood" || s.x1 - s.x0 > 3.2 || s.z1 - s.z0 < 4) continue;
      for (const side of [s.x0 - 0.08, s.x1 + 0.08]) {
        for (let z = s.z1 - 0.3; z >= s.z0 + 0.2; z -= 3) {
          const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.1, 6), postM);
          post.position.set(side, s.y1 + 0.45, z);
          post.castShadow = true;
          group.add(post);
        }
        const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, s.z1 - s.z0, 5), ropeM);
        rope.rotation.x = Math.PI / 2;
        rope.position.set(side, s.y1 + 0.85, (s.z0 + s.z1) / 2);
        group.add(rope);
      }
    }

    // --- movers + fallers
    for (const m of g.movers) {
      const [w, h, d] = m.def.size;
      const [top] = mats(m.m);
      const geo = worldUV(new THREE.BoxGeometry(w, h, d));
      const mesh = new THREE.Mesh(geo, top);
      mesh.castShadow = mesh.receiveShadow = true;
      group.add(mesh);
      lv.movers.push({ m, mesh, h });
    }
    const crackM = new THREE.MeshLambertMaterial({ map: crateTex("s") });
    for (const f of g.fallers) {
      const b = f.home;
      const geo = worldUV(new THREE.BoxGeometry(b[3] - b[0], b[4] - b[1], b[5] - b[2]));
      const mat = f.m === "crack" ? crackM : mats(f.m)[0];
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = mesh.receiveShadow = true;
      group.add(mesh);
      lv.fallers.push({ f, mesh });
    }

    // --- crates
    const crateGeo = new THREE.BoxGeometry(0.98, 0.98, 0.98);
    const crateMats = { n: new THREE.MeshLambertMaterial({ map: crateTex("n") }), b: new THREE.MeshLambertMaterial({ map: crateTex("b") }), h: new THREE.MeshLambertMaterial({ map: crateTex("h") }), s: new THREE.MeshLambertMaterial({ map: crateTex("s") }) };
    for (const c of g.crates) {
      const mesh = new THREE.Mesh(c.type === "s" ? new THREE.BoxGeometry(1, 1, 1) : crateGeo, crateMats[c.type]);
      mesh.castShadow = mesh.receiveShadow = true;
      group.add(mesh);
      lv.crates.push({ c, mesh });
    }

    // --- fruit (instanced)
    const fruitGeo = new THREE.SphereGeometry(0.24, 10, 8);
    fruitGeo.scale(1, 1.22, 1);
    const fruitMat = new THREE.MeshLambertMaterial({ color: "#ffc21a", emissive: "#ff9a00", emissiveIntensity: 0.35 });
    const leafGeo = new THREE.ConeGeometry(0.07, 0.22, 4);
    leafGeo.rotateZ(0.9);
    leafGeo.translate(0.07, 0.32, 0);
    const leafMat = new THREE.MeshLambertMaterial({ color: "#4cc23a" });
    const nF = Math.max(1, g.fruits.length);
    lv.fruitMesh = new THREE.InstancedMesh(fruitGeo, fruitMat, nF);
    lv.leafMesh = new THREE.InstancedMesh(leafGeo, leafMat, nF);
    lv.fruitMesh.castShadow = true;
    group.add(lv.fruitMesh, lv.leafMesh);

    // --- hearts
    const heartM = new THREE.MeshLambertMaterial({ color: "#ff3a5a", emissive: "#ff1a3a", emissiveIntensity: 0.4 });
    for (const h of g.hearts) {
      const grp = new THREE.Group();
      for (const s of [-1, 1]) {
        const b = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), heartM);
        b.position.set(0.12 * s, 0.08, 0);
        grp.add(b);
      }
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.34, 10), heartM);
      tip.rotation.z = Math.PI;
      tip.position.y = -0.12;
      grp.add(tip);
      grp.position.set(h.x, h.y, h.z);
      group.add(grp);
      lv.hearts.push({ h, grp });
    }

    // --- enemies
    for (const e of g.enemies) {
      const m = e.t === "crab" ? makeCrab() : e.t === "thorn" ? makeThorn() : makePlant(!!e.d.fire);
      m.group.traverse((o) => o.isMesh && (o.castShadow = true));
      group.add(m.group);
      const sh = new THREE.Mesh(blobGeo, blobMat.clone());
      group.add(sh);
      lv.enemies.push({ e, m, sh });
    }
    // shots
    const seedM = new THREE.MeshLambertMaterial({ color: "#7ad04a", emissive: "#3a8a1a", emissiveIntensity: 0.5 });
    const fireM = new THREE.MeshBasicMaterial({ color: "#ffb03a" });
    for (let i = 0; i < 12; i++) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), seedM);
      s.visible = false;
      group.add(s);
      lv.shots.push(s);
    }
    lv.seedM = seedM;
    lv.fireM = fireM;

    // --- hazards
    const metal = new THREE.MeshLambertMaterial({ color: "#c8ccd4" });
    const plate = new THREE.MeshLambertMaterial({ color: "#4a4440" });
    const spikeGeo = new THREE.ConeGeometry(0.16, 0.5, 6);
    for (const h of g.hazards) {
      const grp = new THREE.Group();
      group.add(grp);
      const rec = { h, grp };
      if (h.t === "spikes" || h.t === "tspikes") {
        const b = h.b;
        const base = new THREE.Mesh(new THREE.BoxGeometry(b[3] - b[0], 0.06, b[5] - b[2]), plate);
        base.position.set((b[0] + b[3]) / 2, b[1] + 0.03, (b[2] + b[5]) / 2);
        base.receiveShadow = true;
        group.add(base);
        const nx = Math.max(1, Math.round((b[3] - b[0]) / 0.42)), nz = Math.max(1, Math.round((b[5] - b[2]) / 0.42));
        const inst = new THREE.InstancedMesh(spikeGeo, metal, nx * nz);
        const m4 = new THREE.Matrix4();
        let k = 0;
        for (let i = 0; i < nx; i++)
          for (let j = 0; j < nz; j++) inst.setMatrixAt(k++, m4.makeTranslation(b[0] + ((i + 0.5) * (b[3] - b[0])) / nx, 0.25, b[2] + ((j + 0.5) * (b[5] - b[2])) / nz));
        inst.castShadow = true;
        grp.add(inst);
        grp.position.y = b[1];
        rec.base = b[1];
      } else if (h.t === "slider") {
        const [w, hh, d] = h.size;
        const along = w >= d ? "x" : "z";
        const len = Math.max(w, d), r = Math.min(hh, Math.min(w, d)) / 2;
        const log = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.75, r * 0.75, len, 10), new THREE.MeshLambertMaterial({ color: th.palette.trunk }));
        if (along === "x") log.rotation.z = Math.PI / 2;
        else log.rotation.x = Math.PI / 2;
        log.castShadow = true;
        const roll = new THREE.Group();
        roll.add(log);
        for (let i = 0; i < 6; i++)
          for (let a = 0; a < 6; a++) {
            const sp = new THREE.Mesh(spikeGeo, metal);
            const ang = (a / 6) * Math.PI * 2 + i * 0.5;
            const off = -len / 2 + ((i + 0.5) * len) / 6;
            const cy = Math.cos(ang) * r * 0.8, cz = Math.sin(ang) * r * 0.8;
            if (along === "x") {
              sp.position.set(off, cy, cz);
              sp.rotation.x = ang - Math.PI / 2;
            } else {
              sp.position.set(cy, cz, off);
              sp.rotation.z = -(ang - Math.PI / 2);
              sp.rotation.order = "ZXY";
              sp.lookAt(cy * 3, cz * 3, off);
              sp.rotateX(Math.PI / 2);
            }
            sp.scale.setScalar(0.8);
            roll.add(sp);
          }
        roll.position.y = hh / 2;
        grp.add(roll);
        rec.roll = roll;
        rec.along = along;
        rec.r = r;
      } else if (h.t === "jet") {
        const vent = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.65, 0.2, 10), new THREE.MeshLambertMaterial({ color: "#2a2222" }));
        vent.position.y = 0.1;
        grp.add(vent);
        const rimM = new THREE.MeshBasicMaterial({ color: "#ff6a1a" });
        const rim = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.06, 6, 14), rimM);
        rim.rotation.x = Math.PI / 2;
        rim.position.y = 0.21;
        grp.add(rim);
        const flameM = new THREE.MeshBasicMaterial({ color: "#ffb03a", transparent: true, opacity: 0.85, depthWrite: false });
        const flame = new THREE.Mesh(new THREE.ConeGeometry(0.62, 1, 10, 1, true), flameM);
        flame.rotation.x = Math.PI;
        grp.add(flame);
        const core = new THREE.Mesh(new THREE.ConeGeometry(0.3, 1, 8, 1, true), new THREE.MeshBasicMaterial({ color: "#fff2a0", transparent: true, opacity: 0.9, depthWrite: false }));
        core.rotation.x = Math.PI;
        grp.add(core);
        grp.position.set(h.p[0], h.p[1], h.p[2]);
        Object.assign(rec, { flame, core, rimM });
      } else if (h.t === "crusher") {
        const b = h.b;
        const tex = surfaceTex("brick", th.palette.stone);
        const block = new THREE.Mesh(new THREE.BoxGeometry(b[3] - b[0], b[4] - b[1], b[5] - b[2]), new THREE.MeshLambertMaterial({ map: tex, color: "#c8c0b0" }));
        block.castShadow = true;
        grp.add(block);
        // angry carved face
        const faceM = new THREE.MeshBasicMaterial({ color: "#3a2a1a" });
        for (const s of [-1, 1]) {
          const e = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.14, 0.05), faceM);
          e.position.set(0.35 * s, 0.15, (b[5] - b[2]) / 2 + 0.01);
          e.rotation.z = 0.35 * s;
          grp.add(e);
        }
        const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.12, 0.05), faceM);
        mouth.position.set(0, -0.3, (b[5] - b[2]) / 2 + 0.01);
        grp.add(mouth);
        for (const s of [-1, 1]) {
          const ch = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 12, 5), new THREE.MeshLambertMaterial({ color: "#555" }));
          ch.position.set(0.5 * s, (b[4] - b[1]) / 2 + 6, 0);
          grp.add(ch);
        }
        rec.size = [b[3] - b[0], b[4] - b[1], b[5] - b[2]];
      }
      lv.hazards.push(rec);
    }

    // --- kill volumes (lava pools / water inside the level)
    for (const k of g.kills) {
      const b = k.b;
      const tex = liquidTex(k.kind === "lava" ? "lava" : "water").clone();
      tex.needsUpdate = true;
      tex.userData.clone = true;
      tex.repeat.set((b[3] - b[0]) / 3, (b[5] - b[2]) / 3);
      const mat = k.kind === "lava" ? new THREE.MeshBasicMaterial({ map: tex }) : new THREE.MeshLambertMaterial({ map: tex, transparent: true, opacity: 0.9 });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(b[3] - b[0], b[5] - b[2]).rotateX(-Math.PI / 2), mat);
      mesh.position.set((b[0] + b[3]) / 2, b[4] - 0.15, (b[2] + b[5]) / 2);
      group.add(mesh);
      lv.flames.push({ tex });
    }

    // --- liquid plane far below / around everything
    const zs = g.statics.map((s) => s.z0), ze = g.statics.map((s) => s.z1);
    const zMin = Math.min(...zs) - 40, zMax = Math.max(...ze) + 40;
    const liquidKind = th.liquid;
    if (liquidKind !== "abyss") {
      const tex = liquidTex(liquidKind).clone();
      tex.needsUpdate = true;
      tex.userData.clone = true;
      tex.repeat.set(60, (zMax - zMin) / 4);
      const mat = liquidKind === "lava" ? new THREE.MeshBasicMaterial({ map: tex, color: "#ffffff" }) : new THREE.MeshLambertMaterial({ map: tex, color: "#ffffff" });
      const sea = new THREE.Mesh(new THREE.PlaneGeometry(240, zMax - zMin).rotateX(-Math.PI / 2), mat);
      sea.position.set(0, L.liquidY ?? L.killY + 0.4, (zMin + zMax) / 2);
      sea.receiveShadow = liquidKind !== "lava";
      group.add(sea);
      lv.sea = { tex, kind: liquidKind };
    } else {
      // temple: a hazy canyon floor far below
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(240, zMax - zMin).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: "#6a5034" }));
      floor.position.set(0, L.killY - 14, (zMin + zMax) / 2);
      group.add(floor);
    }

    // --- checkpoints, portal
    for (const c of g.checkpoints) {
      const m = makeCheckpoint();
      m.group.position.set(c.x + 0.9, c.y, c.z);
      m.group.traverse((o) => o.isMesh && (o.castShadow = true));
      group.add(m.group);
      lv.checkpoints.push({ c, m });
    }
    if (g.portal) {
      const m = makePortal();
      m.group.position.set(g.portal.x, g.portal.y, g.portal.z);
      group.add(m.group);
      lv.portal = m;
    }

    // --- boss + attack visuals
    if (g.boss) {
      const m = makeBoss();
      m.group.traverse((o) => o.isMesh && (o.castShadow = true));
      group.add(m.group);
      const ringM = new THREE.MeshBasicMaterial({ color: "#ff8a2a", transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide });
      const rings = [0, 1].map(() => {
        const r = new THREE.Mesh(new THREE.RingGeometry(0.85, 1.0, 48).rotateX(-Math.PI / 2), ringM);
        r.visible = false;
        group.add(r);
        return r;
      });
      const warnM = new THREE.MeshBasicMaterial({ color: "#ff2a2a", transparent: true, opacity: 0.4, depthWrite: false, side: THREE.DoubleSide });
      const targets = Array.from({ length: 6 }, () => {
        const r = new THREE.Mesh(new THREE.RingGeometry(1.15, 1.55, 28).rotateX(-Math.PI / 2), warnM);
        const dot = new THREE.Mesh(new THREE.CircleGeometry(1.15, 28).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: "#ff2a2a", transparent: true, opacity: 0.18, depthWrite: false }));
        r.add(dot);
        r.visible = false;
        group.add(r);
        return r;
      });
      const rockM = new THREE.MeshLambertMaterial({ color: "#7f8a7a", flatShading: true });
      const boulders = Array.from({ length: 6 }, () => {
        const b = new THREE.Mesh(new THREE.DodecahedronGeometry(0.75, 0), rockM);
        b.castShadow = true;
        b.visible = false;
        group.add(b);
        return b;
      });
      const lane = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1).rotateX(-Math.PI / 2).translate(0, 0, 0.5), warnM);
      lane.visible = false;
      group.add(lane);
      const slamWarn = new THREE.Mesh(new THREE.RingGeometry(2.0, 2.6, 36).rotateX(-Math.PI / 2), warnM);
      slamWarn.visible = false;
      group.add(slamWarn);
      lv.boss = { m, rings, targets, boulders, lane, slamWarn };
    }

    // --- scenery outside the play area
    scatterProps(lv, g, th, rnd);

    // shadow-casting decor needs this once
    renderer.shadowMap.needsUpdate = true;
    cam = makeCamera(g);
    shake = 0;
  }

  function scatterProps(lv, g, th, rnd) {
    const S = g.statics;
    const clear = (x, z, m) => !S.some((s) => x > s.x0 - m && x < s.x1 + m && z > s.z0 - m && z < s.z1 + m) && !g.movers.some((s) => {
      const p = s.def.path;
      const x0 = Math.min(p[0][0], p[1][0]) - s.def.size[0] / 2, x1 = Math.max(p[0][0], p[1][0]) + s.def.size[0] / 2;
      const z0 = Math.min(p[0][2], p[1][2]) - s.def.size[2] / 2, z1 = Math.max(p[0][2], p[1][2]) + s.def.size[2] / 2;
      return x > x0 - m && x < x1 + m && z > z0 - m && z < z1 + m;
    });
    const zTop = Math.max(...S.map((s) => s.z1)) + 8, zBot = Math.min(...S.map((s) => s.z0)) - 6;
    const islandM = surfaceMats(th, th.liquid === "lava" ? "basalt" : th.liquid === "abyss" ? "sand" : "grass");
    const L = g.level;
    const baseY = th.liquid === "abyss" ? L.killY - 14 : (L.liquidY ?? L.killY + 0.4);
    let count = 0;
    for (let z = zTop; z > zBot && count < 90; z -= 4.5) {
      for (const side of [-1, 1]) {
        const x = side * (8 + rnd() * 9);
        if (!clear(x, z, 3.2)) continue;
        const kind = th.props[Math.floor(rnd() * th.props.length)];
        // a little island / rock column for the prop to stand on
        const topY = th.liquid === "abyss" ? -0.5 - rnd() * 2 : -0.3 - rnd() * 1.2;
        const r = 1.6 + rnd() * 1.4;
        const col = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.15, topY - baseY + 1, 7), islandM[1]);
        col.position.set(x, (topY + baseY - 1) / 2, z);
        col.receiveShadow = true;
        lv.group.add(col);
        const cap = new THREE.Mesh(new THREE.CylinderGeometry(r + 0.08, r + 0.08, 0.25, 7), islandM[0]);
        cap.position.set(x, topY - 0.1, z);
        cap.receiveShadow = true;
        lv.group.add(cap);
        const p = makeProp(kind, rnd, th);
        p.position.set(x, topY, z);
        p.rotation.y = rnd() * 6.28;
        lv.group.add(p);
        lv.props.push({ o: p, x, z, y: topY, r: kind === "palm" || kind === "tree" || kind === "pine" || kind === "tower" ? 2.4 : 1.4 });
        lv.props.push({ o: col, x, z, y: topY - 1, r: r + 0.3 });
        lv.props.push({ o: cap, x, z, y: topY, r: r + 0.3 });
        if (p.userData.flame) lv.flames.push({ flame: p.userData.flame });
        count++;
      }
    }
    // small plants along platform edges (non-blocking, low)
    for (const s of S) {
      if (!HAS_LIP.has(s.m) || s.x1 - s.x0 < 4) continue;
      for (let z = s.z1 + 1.5; z < s.z0 - 1; z += 3 + rnd() * 3) {
        for (const x of [s.x0 + 0.35, s.x1 - 0.35]) {
          if (rnd() < 0.45) continue;
          if (g.crates.some((c) => Math.abs((c.x0 + c.x1) / 2 - x) < 1.2 && Math.abs((c.z0 + c.z1) / 2 - z) < 1.2)) continue;
          const kind = th.liquid === "lava" ? "rock" : th.props.includes("mushroom") ? "mushroom" : "bush";
          const p = makeProp(kind, rnd, th);
          p.scale.setScalar(kind === "mushroom" ? 0.5 : 0.55);
          p.position.set(x, s.y1, z);
          lv.group.add(p);
          lv.props.push({ o: p, x, z, y: s.y1, r: 0.8 });
        }
      }
    }
    // distant backdrop: big hills / cliffs / volcano
    const farM = new THREE.MeshLambertMaterial({ color: th.palette.rock, flatShading: true });
    for (let i = 0; i < 14; i++) {
      const side = i % 2 ? 1 : -1;
      const h = 12 + rnd() * 22;
      const m = new THREE.Mesh(new THREE.ConeGeometry(10 + rnd() * 10, h, 6), farM);
      m.position.set(side * (45 + rnd() * 30), baseY + h / 2 - 2, zTop - rnd() * (zTop - zBot + 40));
      lv.group.add(m);
    }
    if (g.level.theme === "volcano") {
      const v = new THREE.Mesh(new THREE.ConeGeometry(40, 46, 9, 1, true), farM);
      v.position.set(10, 8, zBot - 70);
      lv.group.add(v);
      const glow = new THREE.Mesh(new THREE.CircleGeometry(9, 16), new THREE.MeshBasicMaterial({ color: "#ff7a2a" }));
      glow.position.set(10, 30.5, zBot - 70);
      glow.rotation.x = -Math.PI / 2;
      lv.group.add(glow);
    }
    if (g.level.theme === "moon") {
      const moon = new THREE.Mesh(new THREE.CircleGeometry(9, 32), new THREE.MeshBasicMaterial({ color: "#fff6d8", fog: false }));
      moon.position.set(-30, 48, zBot - 90);
      lv.group.add(moon);
      const halo = new THREE.Mesh(new THREE.CircleGeometry(16, 32), new THREE.MeshBasicMaterial({ map: radialTex("halo", [[0, "rgba(255,246,216,0.6)"], [1, "rgba(255,246,216,0)"]]), transparent: true, depthWrite: false, fog: false }));
      halo.position.set(-30, 48, zBot - 91);
      lv.group.add(halo);
      // stars + fireflies
      const sv = [];
      for (let i = 0; i < 400; i++) sv.push((rnd() - 0.5) * 300, 25 + rnd() * 80, zBot - 100 + (rnd() - 0.5) * 60);
      const sg = new THREE.BufferGeometry();
      sg.setAttribute("position", new THREE.Float32BufferAttribute(sv, 3));
      lv.group.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: "#ffffff", size: 0.7, fog: false })));
      const fv = [];
      for (let i = 0; i < 120; i++) fv.push((rnd() - 0.5) * 24, 0.5 + rnd() * 4, zTop - rnd() * (zTop - zBot));
      const fg = new THREE.BufferGeometry();
      fg.setAttribute("position", new THREE.Float32BufferAttribute(fv, 3));
      const ff = new THREE.Points(fg, new THREE.PointsMaterial({ color: "#c8ff6a", size: 0.18, transparent: true, opacity: 0.9 }));
      lv.group.add(ff);
      lv.fireflies = ff;
    }
  }

  /* --------------------------------------------------------------- per-frame sync */
  const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), v3 = new THREE.Vector3(), s3 = new THREE.Vector3(), eul = new THREE.Euler();
  function sync(g, dt) {
    const lv = level;
    const t = g.t;
    // movers / fallers
    for (const r of lv.movers) {
      const m = r.m;
      r.mesh.position.set((m.x0 + m.x1) / 2, m.y1 - r.h / 2, (m.z0 + m.z1) / 2);
    }
    for (const r of lv.fallers) {
      const f = r.f;
      r.mesh.visible = f.on;
      const sh = f.state === "shake" ? Math.sin(tAcc * 60) * 0.06 : 0;
      r.mesh.position.set((f.x0 + f.x1) / 2 + sh, (f.y0 + f.y1) / 2, (f.z0 + f.z1) / 2);
    }
    // crates
    for (const r of lv.crates) {
      const c = r.c;
      r.mesh.visible = !c.broken;
      if (c.broken) continue;
      if (c.squash > 0) c.squash = Math.max(0, c.squash - dt * 5);
      const sq = Math.sin(c.squash * Math.PI) * 0.25;
      r.mesh.scale.set(1 + sq * 0.5, 1 - sq, 1 + sq * 0.5);
      r.mesh.position.set((c.x0 + c.x1) / 2, c.y0 + 0.5 * (1 - sq), (c.z0 + c.z1) / 2);
    }
    // fruit
    for (let i = 0; i < g.fruits.length; i++) {
      const f = g.fruits[i];
      if (f.got) m4.makeScale(0, 0, 0);
      else {
        q4.setFromEuler(eul.set(0, t * 2.2 + i * 0.7, 0.15));
        m4.compose(v3.set(f.x, f.y + Math.sin(t * 3 + i) * 0.08, f.z), q4, s3.set(1, 1, 1));
      }
      lv.fruitMesh.setMatrixAt(i, m4);
      lv.leafMesh.setMatrixAt(i, m4);
    }
    lv.fruitMesh.instanceMatrix.needsUpdate = true;
    lv.leafMesh.instanceMatrix.needsUpdate = true;
    for (const r of lv.hearts) {
      r.grp.visible = !r.h.got;
      r.grp.rotation.y = t * 2;
      r.grp.position.y = r.h.y + Math.sin(t * 3) * 0.1;
    }
    // enemies
    for (const r of lv.enemies) {
      const e = r.e;
      const grp = r.m.group;
      if (!e.alive) {
        const k = Math.max(0, 1 - e.deadT / 0.6);
        grp.visible = k > 0;
        r.sh.visible = false;
        if (!grp.visible) continue;
        grp.scale.setScalar(0.3 + 0.7 * k);
        grp.position.set(e.x, e.y + e.flyY, e.z);
        grp.rotation.x += dt * 14;
        continue;
      }
      grp.visible = true;
      grp.position.set(e.x, e.y, e.z);
      grp.rotation.y = e.yaw;
      grp.scale.setScalar(e.hitT > 0 ? 1 + Math.sin(e.hitT * 40) * 0.12 : 1);
      r.m.update(e, tAcc, dt);
      r.sh.visible = true;
      r.sh.position.set(e.x, e.y + 0.02, e.z);
      r.sh.scale.setScalar(e.def.r * 2.4);
    }
    // shots
    lv.shots.forEach((m) => (m.visible = false));
    let si = 0;
    for (const s of g.shots) {
      if (s.dead || si >= lv.shots.length) continue;
      const m = lv.shots[si++];
      m.visible = true;
      m.material = s.fire ? lv.fireM : lv.seedM;
      m.position.set(s.x, s.y, s.z);
      m.scale.setScalar(s.fire ? 1.1 + Math.sin(tAcc * 30) * 0.15 : 1);
    }
    // hazards
    for (const r of lv.hazards) {
      const h = r.h;
      if (h.t === "tspikes") {
        let y = -0.5;
        if (h.active) y = 0;
        else if (h.warn) y = -0.38 + Math.abs(Math.sin(tAcc * 30)) * 0.06;
        r.cur = (r.cur ?? -0.5) + (y - (r.cur ?? -0.5)) * Math.min(1, dt * (h.active ? 30 : 10));
        r.grp.position.y = r.base + r.cur;
      } else if (h.t === "slider") {
        r.grp.position.set(h.pos[0], h.pos[1], h.pos[2]);
        const prev = r.prev || h.pos[r.along === "x" ? 2 : 0];
        const cur = h.pos[r.along === "x" ? 2 : 0];
        r.prev = cur;
        // roll as it travels
        if (r.along === "x") r.roll.rotation.x -= (cur - prev) / Math.max(0.2, r.r);
        else r.roll.rotation.z += (cur - prev) / Math.max(0.2, r.r);
      } else if (h.t === "jet") {
        const H = h.h ?? 3;
        const on = h.active;
        const k = on ? 1 : h.warn ? 0.15 + Math.abs(Math.sin(tAcc * 25)) * 0.1 : 0.02;
        const fl = on ? 1 + Math.sin(tAcc * 40) * 0.08 : 1;
        r.flame.scale.set(fl, H * k, fl);
        r.flame.position.y = (H * k) / 2 + 0.2;
        r.core.scale.set(fl, H * k * 0.75, fl);
        r.core.position.y = (H * k * 0.75) / 2 + 0.2;
        r.flame.visible = r.core.visible = k > 0.03;
        r.rimM.color.set(h.warn || on ? "#ffd04a" : "#a8401a");
      } else if (h.t === "crusher") {
        const c = h.cur;
        r.grp.position.set((c[0] + c[3]) / 2 + (h.warn ? Math.sin(tAcc * 70) * 0.05 : 0), (c[1] + c[4]) / 2, (c[2] + c[5]) / 2);
      }
    }
    // liquids scroll
    if (lv.sea) {
      lv.sea.tex.offset.x = Math.sin(tAcc * 0.3) * 0.2;
      lv.sea.tex.offset.y = tAcc * (lv.sea.kind === "lava" ? 0.05 : 0.12);
    }
    for (const f of lv.flames) {
      if (f.tex) f.tex.offset.y = tAcc * 0.06;
      if (f.flame) f.flame.scale.y = 0.4 * (1 + Math.sin(tAcc * 18 + f.flame.id) * 0.2);
    }
    if (lv.fireflies) {
      lv.fireflies.material.opacity = 0.6 + Math.sin(tAcc * 2) * 0.3;
      lv.fireflies.position.y = Math.sin(tAcc * 0.7) * 0.3;
    }
    // checkpoints + portal
    for (const r of lv.checkpoints) r.m.update(r.c, dt);
    if (lv.portal) {
      lv.portal.update(g.portal, dt);
      lv.portal.group.visible = g.portal.open || !g.boss;
    }
    // boss
    if (lv.boss && g.boss) syncBoss(g, lv.boss, dt);
  }

  function syncBoss(g, V, dt) {
    const B = g.boss;
    V.m.group.position.set(B.x, B.y, B.z);
    V.m.group.rotation.y = B.yaw;
    V.m.update(B, dt);
    V.rings.forEach((r) => (r.visible = false));
    B.rings.forEach((r, i) => {
      if (i >= V.rings.length || r.delay > 0) return;
      const m = V.rings[i];
      m.visible = true;
      m.position.set(r.x, B.y + 0.08, r.z);
      m.scale.set(r.r, 1, r.r);
      m.material.opacity = 0.9 * Math.max(0.2, 1 - r.r / 16);
    });
    V.targets.forEach((m) => (m.visible = false));
    V.boulders.forEach((m) => (m.visible = false));
    B.boulders.forEach((b, i) => {
      if (i >= V.targets.length || b.done) return;
      const tm = V.targets[i];
      tm.visible = true;
      tm.position.set(b.tx, B.y + 0.06, b.tz);
      const k = b.t / b.T;
      tm.scale.setScalar(1.2 - k * 0.2 + Math.sin(tAcc * 20) * 0.04);
      const bm = V.boulders[i];
      bm.visible = true;
      bm.position.set(b.x, b.y, b.z);
      bm.rotation.set(tAcc * 5, tAcc * 3, 0);
    });
    V.lane.visible = B.state === "chargeTele";
    if (V.lane.visible) {
      const [ux, uz] = B.chargeDir;
      const A = B.arena;
      // lane length to the arena edge
      let L = 30;
      if (ux > 1e-3) L = Math.min(L, (A[2] - B.x) / ux);
      if (ux < -1e-3) L = Math.min(L, (A[0] - B.x) / ux);
      if (uz > 1e-3) L = Math.min(L, (A[3] - B.z) / uz);
      if (uz < -1e-3) L = Math.min(L, (A[1] - B.z) / uz);
      V.lane.position.set(B.x, B.y + 0.07, B.z);
      V.lane.rotation.y = Math.atan2(ux, uz);
      V.lane.scale.set(1, 1, Math.max(1, L));
      V.lane.material.opacity = 0.25 + Math.abs(Math.sin(tAcc * 10)) * 0.25;
    }
    V.slamWarn.visible = B.state === "slamTele";
    if (V.slamWarn.visible) {
      V.slamWarn.position.set(B.x, B.y + 0.07, B.z);
      V.slamWarn.scale.setScalar(1 + (B.st % 0.4) * 1.5);
    }
  }

  /* --------------------------------------------------------------- events → particles / shake */
  function onEvents(g, evs) {
    if (!level) return;
    const p = g.player;
    for (const e of evs) {
      switch (e.type) {
        case "crate":
          if (e.kind === "s") particles.burst(e.x, e.y, e.z, 16, ["#9c8e74", "#857760", "#c4b48c"], { speed: 5, up: 5, size: 1.6 });
          else particles.burst(e.x, e.y, e.z, 14, e.kind === "b" ? ["#3f9ad6", "#7cc3ef", "#1f5e8e"] : e.kind === "h" ? ["#e2577a", "#ffffff"] : ["#c98a3f", "#7a4a1c", "#e0a95f"], { speed: 5, up: 5, size: 1.5 });
          break;
        case "fruit":
          particles.burst(e.x, e.y + (e.fromCrate ? 0.5 : 0), e.z, e.fromCrate ? 8 : 5, ["#ffd23f", "#fff2a0", "#ffb01a"], { speed: 2.5, up: 4, life: 0.5, size: 0.9 });
          break;
        case "heart":
          particles.burst(e.x, e.y, e.z, 14, ["#ff3a5a", "#ffffff", "#ff8aa0"], { speed: 3, up: 5, life: 0.8 });
          break;
        case "spring":
          particles.burst(e.x, e.y, e.z, 8, ["#7cc3ef", "#ffffff"], { speed: 3, up: 2, life: 0.4 });
          break;
        case "enemyDie":
          particles.burst(e.x, e.y + 0.4, e.z, 16, e.t === "crab" ? ["#e2483a", "#ffffff", "#ffb08a"] : e.t === "thorn" ? ["#5b3f8f", "#d6c6ff", "#ffffff"] : ["#7ad04a", "#ffffff", "#2f7f2a"], { speed: 4.5, up: 5, size: 1.3 });
          break;
        case "enemyHit":
          particles.burst(e.x, e.y + 0.5, e.z, 8, ["#ffffff", "#ffe14a"], { speed: 3, up: 3 });
          break;
        case "hurt":
          particles.burst(e.x, e.y + 0.8, e.z, 10, ["#ff3a3a", "#ffffff"], { speed: 3, up: 4 });
          shake = Math.max(shake, 0.35);
          break;
        case "die":
          if (e.kind === "lava") particles.burst(e.x, e.y + 0.3, e.z, 20, ["#ff6a1a", "#ffd04a", "#3a2a2a"], { speed: 3, up: 6, life: 1 });
          else if (e.kind === "water") particles.burst(e.x, (g.level.liquidY ?? e.y) + 0.1, e.z, 20, ["#ffffff", "#bfe9ff", "#5ac8ff"], { speed: 3, up: 6, life: 1 });
          else if (e.kind === "ko") particles.burst(e.x, e.y + 0.6, e.z, 16, ["#ffe14a", "#ffffff"], { speed: 3, up: 5 });
          break;
        case "respawn":
          particles.burst(e.x, e.y + 0.2, e.z, 18, ["#7dffd0", "#ffffff"], { speed: 2.5, up: 5, life: 0.8, grav: 2 });
          if (cam) {
            cam.fx = p.x;
            cam.fy = p.y;
            cam.fz = p.z;
          }
          break;
        case "checkpoint":
          particles.burst(e.x + 0.9, e.y + 1, e.z, 22, ["#7dff9a", "#ffffff", "#ffe14a"], { speed: 3, up: 6, life: 1, grav: 6 });
          break;
        case "secret":
          particles.burst(e.x, e.y + 1, e.z, 26, ["#ffe14a", "#ffffff", "#ffb01a"], { speed: 4, up: 7, life: 1.1, grav: 5 });
          break;
        case "shotPop":
          particles.burst(e.x, e.y, e.z, 7, e.fire ? ["#ffb03a", "#ff5a1a"] : ["#7ad04a", "#ffffff"], { speed: 2.5, up: 2, life: 0.4 });
          break;
        case "land":
          if (e.hard) particles.burst(p.x, p.y + 0.05, p.z, 8, ["#e8e0c8", "#c8b890"], { speed: 2.5, up: 1.5, life: 0.4, grav: 6 });
          break;
        case "jet":
          particles.burst(e.x, (g.hazards[e.i].p?.[1] ?? 0) + 0.5, e.z, 10, ["#ffb03a", "#ffd04a", "#ff5a1a"], { speed: 1.5, up: 7, life: 0.7, grav: 2 });
          break;
        case "crush":
          particles.burst(e.x, g.hazards[e.i].cur[1] + 0.1, e.z, 12, ["#c8c0b0", "#8a7e60"], { speed: 4, up: 2, life: 0.5 });
          if (Math.hypot(e.x - p.x, e.z - p.z) < 10) shake = Math.max(shake, 0.25);
          break;
        case "bossSlam":
          particles.burst(e.x, g.boss.y + 0.2, e.z, 30, ["#c8b890", "#7f8a7a", "#ffffff"], { speed: 7, up: 3, life: 0.7, size: 1.5 });
          shake = Math.max(shake, 0.7);
          break;
        case "boulder":
          particles.burst(e.x, g.boss.y + 0.4, e.z, 16, ["#7f8a7a", "#c8b890"], { speed: 4, up: 4, life: 0.6, size: 1.3 });
          shake = Math.max(shake, 0.3);
          break;
        case "bossWall":
          particles.burst(e.x, g.boss.y + 2, e.z, 24, ["#c8c0b0", "#ffe14a"], { speed: 5, up: 4, size: 1.4 });
          shake = Math.max(shake, 0.8);
          break;
        case "bossHit":
          particles.burst(e.x, e.y + 1, e.z, 26, ["#6ff0ff", "#ffffff", "#29c8ff"], { speed: 6, up: 6, life: 0.9, size: 1.4 });
          shake = Math.max(shake, 0.5);
          break;
        case "bossWake":
          shake = Math.max(shake, 0.6);
          break;
        case "bossDefeated":
          particles.burst(e.x, g.boss.y + 1.5, e.z, 60, ["#4f9a3a", "#6fd04a", "#7f8a7a", "#ffe14a", "#6ff0ff"], { speed: 7, up: 9, life: 1.6, size: 1.8, grav: 8, spread: 4 });
          shake = Math.max(shake, 1);
          break;
        case "complete":
          particles.burst(p.x, p.y + 1.5, p.z, 40, ["#ffe14a", "#7dffd0", "#ff5a8a", "#ffffff"], { speed: 5, up: 8, life: 1.4, grav: 6 });
          break;
        default:
          break;
      }
    }
  }

  /* --------------------------------------------------------------- render */
  let lastW = 1, lastH = 1;
  function resize(w, h) {
    lastW = Math.max(1, w | 0);
    lastH = Math.max(1, h | 0);
    renderer.setSize(lastW, lastH, false);
    camera.aspect = lastW / lastH;
    // portrait phones: widen the view so the path ahead stays visible
    camera.fov = camera.aspect < 1 ? 68 : camera.aspect < 1.4 ? 60 : 55;
    camera.updateProjectionMatrix();
  }

  function render(g, dt, opts = {}) {
    if (!level || level.g !== g) setGame(g);
    tAcc += dt;
    const p = g.player;
    sync(g, dt);
    // player
    const R = mango.root;
    R.position.set(p.x, p.y, p.z);
    let yaw = p.yaw;
    if (opts.menu) yaw = 0;
    else if (g.status === "complete") yaw = 0; // face the camera to celebrate
    let d = yaw - R.rotation.y;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    R.rotation.y += d * Math.min(1, dt * (g.status === "complete" ? 6 : 20));
    const dying = g.status === "dying" || g.status === "gameover";
    R.visible = !(dying && p.deathKind !== "ko" && p.deathKind !== "fall") && !(p.invuln > 0 && g.status === "play" && Math.floor(tAcc * 14) % 2 === 0);
    if (dying && p.deathKind === "fall") R.visible = p.y > g.level.killY - 6;
    animateMascot(mango, opts.menu ? { anim: "idle", animT: tAcc, speed: 0, landT: 0 } : p, dt, { wave: opts.menu });
    // blob shadow
    const gy = g.groundBelow(p.x, p.z, p.y + 0.05, 0.1);
    blob.visible = Number.isFinite(gy) && R.visible && p.y - gy < 12;
    if (blob.visible) {
      const k = Math.max(0.35, 1 - (p.y - gy) / 6);
      blob.position.set(p.x, gy + 0.03, p.z);
      blob.scale.set(0.95 * k, 1, 0.95 * k);
      blob.material.opacity = k;
    }
    particles.update(dt);

    // camera
    if (opts.menu) {
      menuA += dt * 0.18;
      const r = 5.2;
      camera.position.set(p.x + Math.sin(menuA) * r, p.y + 2.2, p.z + Math.cos(menuA) * r);
      camera.lookAt(p.x, p.y + 0.9, p.z);
      R.rotation.y = menuA * 0.999;
    } else if (opts.victoryOrbit) {
      menuA += dt * 0.3;
      camera.position.set(p.x + Math.sin(menuA) * 6, p.y + 2.5, p.z + Math.cos(menuA) * 6);
      camera.lookAt(p.x, p.y + 1, p.z);
    } else if (g.status === "complete") {
      // glide in along the (clear) path behind for the celebration — Mango turns to face us
      camera.position.lerp(v3.set(p.x + 0.7, p.y + 1.7, p.z + 4.2), Math.min(1, dt * 2.5));
      camera.lookAt(p.x, p.y + 0.9, p.z);
    } else {
      updateCamera(cam, g, dt);
      shake = Math.max(0, shake - dt * 1.8);
      const sx = shake > 0 ? (Math.random() - 0.5) * shake * 0.35 : 0;
      const sy = shake > 0 ? (Math.random() - 0.5) * shake * 0.35 : 0;
      camera.position.set(cam.x + sx, cam.y + sy, cam.z);
      camera.lookAt(cam.lx, cam.ly, cam.lz);
    }
    // hide props right next to the camera (never see the inside of a tree)
    for (const pr of level.props) {
      const dx = camera.position.x - pr.x, dz = camera.position.z - pr.z;
      pr.o.visible = dx * dx + dz * dz > pr.r * pr.r || camera.position.y > pr.y + 7;
    }
    // sun follows the player so the shadow map stays sharp around them
    sun.position.set(p.x - 8, p.y + 30, p.z + 10);
    sun.target.position.set(p.x, p.y, p.z - 4);
    sun.castShadow = shadowsOn;
    renderer.render(scene, camera);
  }

  function project(x, y, z) {
    v3.set(x, y, z).project(camera);
    if (v3.z > 1) return null;
    return { x: (v3.x * 0.5 + 0.5) * lastW, y: (-v3.y * 0.5 + 0.5) * lastH };
  }

  function dispose() {
    disposeLevel();
    mango.root.traverse((o) => {
      if (o.isMesh) {
        o.geometry.dispose();
        o.material.dispose();
      }
    });
    blobGeo.dispose();
    blobMat.dispose();
    particles.mesh.geometry.dispose();
    particles.mesh.material.dispose();
    scene.background?.dispose?.();
    disposeTextures();
    renderer.dispose();
    renderer.domElement.remove();
  }

  return {
    renderer,
    scene,
    camera,
    get cam() {
      return cam;
    },
    get theme() {
      return curTheme;
    },
    mango,
    setGame,
    render,
    onEvents,
    resize,
    project,
    setShadows(on) {
      shadowsOn = !!on;
      renderer.shadowMap.enabled = shadowsOn;
      if (level) level.group.traverse((o) => o.material && (o.material.needsUpdate = true));
    },
    dispose,
  };
}
