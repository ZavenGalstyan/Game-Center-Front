/**
 * Tomb Raiders: Pharaoh's Revenge — Three.js renderer. A level's static shell
 * (walls, floors, ceilings) is merged into three meshes with baked corner
 * shading and procedural sandstone bump maps; mechanisms and guardians are
 * small groups updated from the simulation each frame. Lighting: a hemisphere
 * tinted per region, the player's torch glow, a pool of six point lights
 * handed to the nearest wall torches / braziers / glowing devices (so the
 * shader light count never changes) and two flash lights for weapon fire and
 * blasts. The weapon is drawn in a second pass with its own camera so it never
 * clips into walls. No shadow maps, no post-processing; everything is
 * disposed on level change and unmount.
 */
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { CELL, WALL_H, EYE, DIRS, DIR_YAW, OPPOSITE, ZONES, WEAPONS, WEAPON_ORDER, cellCenter } from "../engine/constants.js";
import { BEAM_Y, MOUNT } from "../engine/sim.js";
import { ITEMS, COLORS } from "../engine/items.js";
import { wallTextures, floorTextures, ceilingTexture, glyphTexture, panelTexture, doorTexture, spriteTexture, gemTexture, papyrusTexture, sandTexture, blockTexture } from "./textures.js";
import { createKit, buildEnemy, buildWeapon, buildItem, buildStatue, buildContainer, openContainer, buildGoldPile, buildObelisk, glyphGeometry } from "./models.js";

const LIGHTS = 6;
const SOLID = new Set(["wall", "void", "pillar", "glass", "tube"]);
const KEY_COLOR = { bronzeKey: "#d08a4a", silverKey: "#d8dde6", goldKey: "#ffd04a", scarabSeal: "#3ad8b0", royalSeal: "#ff7a3a" };
const BOLT = {
  bow: { color: 0xffe2b0, size: 0.06 },
  scarab: { color: 0x7affa0, size: 0.16 },
  sun: { color: 0xffa030, size: 0.42 },
  scepter: { color: 0xa080ff, size: 0.2 },
};

function hash(a, b) {
  let h = (a * 374761393 + b * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function createWorld(container, opts = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance", preserveDrawingBuffer: !!opts.preserve });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.autoClear = false;
  renderer.domElement.className = "trp-canvas";
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(78, 16 / 9, 0.05, 90);
  camera.rotation.order = "YXZ";
  scene.add(camera);
  let pmrem = new THREE.PMREMGenerator(renderer);
  let envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envTex;
  scene.environmentIntensity = 0.25;
  scene.fog = new THREE.FogExp2(0x1e140a, 0.045);
  scene.background = new THREE.Color(0x0a0604);

  const hemi = new THREE.HemisphereLight(0xffd9a0, 0x2a1a0c, 0.5);
  scene.add(hemi);
  // the explorer's own torch glow: a warm, soft spot that follows the view
  const handLight = new THREE.SpotLight(0xffc890, 14, 22, 0.75, 0.75, 1.4);
  handLight.position.set(0.25, -0.1, 0.1);
  handLight.target.position.set(0, -0.3, -5);
  camera.add(handLight, handLight.target);
  const pool = [];
  for (let i = 0; i < LIGHTS; i++) {
    const l = new THREE.PointLight(0xffffff, 0, 13, 1.6);
    scene.add(l);
    pool.push(l);
  }
  const muzzleLight = new THREE.PointLight(0xffc070, 0, 9, 1.8);
  scene.add(muzzleLight);
  const fxLight = new THREE.PointLight(0xff8040, 0, 14, 1.6);
  scene.add(fxLight);

  /* ---------------------------------------------------- weapon pass */
  const wScene = new THREE.Scene();
  const wCamera = new THREE.PerspectiveCamera(62, 16 / 9, 0.01, 5);
  wScene.add(new THREE.HemisphereLight(0xffe8c8, 0x302010, 1.1));
  const wDir = new THREE.DirectionalLight(0xffe0b0, 1.5);
  wDir.position.set(1, 2, 1);
  wScene.add(wDir);
  const wFlashLight = new THREE.PointLight(0xffc070, 0, 2, 1);
  wFlashLight.position.set(0.1, 0, -0.7);
  wScene.add(wFlashLight);
  wScene.environment = envTex;

  const kit = createKit();
  const sprites = { glow: spriteTexture("glow"), smoke: spriteTexture("smoke"), spark: spriteTexture("spark"), flash: spriteTexture("flash"), flame: spriteTexture("flame"), dust: spriteTexture("dust"), ring: spriteTexture("ring") };
  const spriteMat = (map, color, opacity = 1, additive = true) =>
    new THREE.SpriteMaterial({ map, color, transparent: true, opacity, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, fog: true });
  const markerMat = spriteMat(sprites.glow, 0xffe0a0, 0.9);
  const marker = new THREE.Sprite(markerMat);
  marker.scale.setScalar(0.16);
  marker.visible = false;
  scene.add(marker);

  const weapons = {};
  const viewRoot = new THREE.Group();
  wScene.add(viewRoot);
  for (const id of WEAPON_ORDER) {
    const w = buildWeapon(kit, id);
    w.group.visible = false;
    w.group.scale.setScalar({ bow: 1.0, scarab: 0.6, sun: 0.9, scepter: 0.9 }[id]);
    viewRoot.add(w.group);
    const fl = new THREE.Sprite(spriteMat(sprites.flash, BOLT[id].color, 1));
    fl.scale.setScalar(id === "sun" ? 0.4 : id === "bow" ? 0.12 : 0.24);
    fl.position.copy(w.muzzle.position);
    fl.visible = false;
    w.group.add(fl);
    weapons[id] = { ...w, flash: fl };
  }

  /* ---------------------------------------------------- effect pools */
  const tracerGeo = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true);
  const beamTracerMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xb090ff).multiplyScalar(1.6), transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  const tracers = [];
  for (let i = 0; i < 8; i++) {
    const mt = beamTracerMat.clone();
    const m = new THREE.Mesh(tracerGeo, mt);
    m.visible = false;
    scene.add(m);
    tracers.push({ m, life: 0, max: 0.2 });
  }
  // travelling magic bolts / arrows
  const arrowMat = new THREE.MeshStandardMaterial({ color: 0xb08a4a, roughness: 0.7 });
  const bolts = [];
  for (let i = 0; i < 40; i++) {
    const s = new THREE.Sprite(spriteMat(sprites.glow, 0xffffff, 1));
    s.visible = false;
    scene.add(s);
    const arrow = new THREE.Group();
    const shaft = new THREE.Mesh(kit.cylLo, arrowMat);
    shaft.scale.set(0.015, 0.7, 0.015);
    shaft.rotation.x = Math.PI / 2;
    const tip = new THREE.Mesh(kit.cone4, kit.bronze);
    tip.scale.set(0.04, 0.1, 0.04);
    tip.rotation.x = -Math.PI / 2;
    tip.position.z = -0.38;
    arrow.add(shaft, tip);
    arrow.visible = false;
    scene.add(arrow);
    bolts.push({ s, arrow, life: 0, t: 0, dur: 0.1, a: new THREE.Vector3(), b: new THREE.Vector3(), kind: "bow", trailT: 0 });
  }
  const puffs = [];
  for (let i = 0; i < 80; i++) {
    const s = new THREE.Sprite(spriteMat(sprites.smoke, 0xffffff, 1, false));
    s.visible = false;
    scene.add(s);
    puffs.push({ s, life: 0, max: 1, v: new THREE.Vector3(), grow: 1, base: 0.2, alpha: 1 });
  }
  const sparks = [];
  for (let i = 0; i < 80; i++) {
    const s = new THREE.Sprite(spriteMat(sprites.spark, 0xffffff, 1));
    s.visible = false;
    scene.add(s);
    sparks.push({ s, life: 0, v: new THREE.Vector3(), g: 9 });
  }
  const rings = [];
  for (let i = 0; i < 6; i++) {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 48), new THREE.MeshBasicMaterial({ color: 0xffc040, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false }));
    m.rotation.x = -Math.PI / 2;
    m.visible = false;
    scene.add(m);
    rings.push({ m, life: 0, max: 0.6, r: 6 });
  }
  const fireballMat = spriteMat(sprites.glow, 0xff7a20, 1);
  const fireballs = [];
  for (let i = 0; i < 30; i++) {
    const s = new THREE.Sprite(fireballMat);
    s.scale.setScalar(0.55);
    s.visible = false;
    scene.add(s);
    const core = new THREE.Mesh(kit.sphereLo, kit.glowOrange);
    core.scale.setScalar(0.16);
    core.visible = false;
    scene.add(core);
    fireballs.push({ s, core });
  }
  const beamCoreMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfff0b0).multiplyScalar(2), toneMapped: false });
  const beamGlowMat = new THREE.MeshBasicMaterial({ color: 0xffc040, transparent: true, opacity: 0.32, depthWrite: false, blending: THREE.AdditiveBlending });
  const beamGeo = new THREE.CylinderGeometry(1, 1, 1, 10, 1, true);
  const beamPool = [];
  function beam(i) {
    if (!beamPool[i]) {
      const core = new THREE.Mesh(beamGeo, beamCoreMat);
      const glow = new THREE.Mesh(beamGeo, beamGlowMat);
      const spark = new THREE.Sprite(spriteMat(sprites.glow, 0xffd070, 0.9));
      scene.add(core, glow, spark);
      beamPool[i] = { core, glow, spark };
    }
    return beamPool[i];
  }

  // golden dust motes drifting around the camera
  const DUST = 260;
  const dustGeo = new THREE.BufferGeometry();
  const dustPos = new Float32Array(DUST * 3);
  for (let i = 0; i < DUST * 3; i++) dustPos[i] = (Math.random() - 0.5) * 16;
  dustGeo.setAttribute("position", new THREE.BufferAttribute(dustPos, 3));
  const dustMat = new THREE.PointsMaterial({ size: 0.04, map: sprites.dust, transparent: true, opacity: 0.55, depthWrite: false, color: 0xffd9a0, blending: THREE.AdditiveBlending });
  const dust = new THREE.Points(dustGeo, dustMat);
  dust.frustumCulled = false;
  scene.add(dust);
  const dustSeed = Array.from({ length: DUST }, () => [Math.random() * 6.28, 0.2 + Math.random() * 0.5]);

  let level = null;
  let quality = "high";
  let time = 0;
  let shake = 0;
  let fovBase = 78;
  const tmpV = new THREE.Vector3();
  const tmpV2 = new THREE.Vector3();
  const tmpQ = new THREE.Quaternion();
  const UP = new THREE.Vector3(0, 1, 0);
  const vm = { kick: 0, cur: null, flashT: 0 };

  /* ================================================================ level build */
  function clearLevel() {
    if (!level) return;
    scene.remove(level.group);
    level.disposables.forEach((d) => d.dispose());
    for (const ev of level.enemyViews.values()) ev.skin.dispose();
    level = null;
  }

  function setLevel(L, sim) {
    clearLevel();
    const zone = ZONES[L.zone] || ZONES[0];
    const group = new THREE.Group();
    scene.add(group);
    const disposables = [];
    const own = (x) => (disposables.push(x), x);
    level = { L, zone, group, disposables, views: new Map(), enemyViews: new Map(), sources: [], lasers: [], gas: [], spikes: [], flames: [], exits: [], lightT: 0, sim, splats: {} };

    scene.fog.color.setHex(zone.fog);
    scene.fog.density = zone.fogDensity * (quality === "high" ? 1 : 0.85);
    scene.background.setHex(zone.fog).multiplyScalar(0.5);
    hemi.color.setHex(zone.ambient[0]);
    hemi.groundColor.setHex(zone.ambient[1]);
    level.hemiBase = zone.ambient[2];

    const wt = wallTextures(zone, L.id);
    const ft = floorTextures(zone, L.id);
    [wt.map, wt.bump, ft.map, ft.bump].forEach(own);
    const ceilMap = own(ceilingTexture(zone));
    const hi = quality === "high";
    const wallMat = own(new THREE.MeshStandardMaterial({ map: wt.map, bumpMap: hi ? wt.bump : null, bumpScale: 2.2, roughness: 0.88, metalness: 0.02, vertexColors: true, side: THREE.DoubleSide }));
    const floorMat = own(new THREE.MeshStandardMaterial({ map: ft.map, bumpMap: hi ? ft.bump : null, bumpScale: 1.6, roughness: 0.92, metalness: 0.02, vertexColors: true, side: THREE.DoubleSide }));
    const ceilMat = own(new THREE.MeshStandardMaterial({ map: ceilMap, roughness: 0.95, vertexColors: true, side: THREE.DoubleSide }));
    level.wallMat = wallMat;
    const stoneMat = own(new THREE.MeshStandardMaterial({ map: wt.map, color: 0xd8d0c0, roughness: 0.9 }));

    const tileKind = (c, r) => sim.tileAt(c, r)?.t ?? "void";
    const solidAt = (c, r) => SOLID.has(tileKind(c, r));

    // ---------------------------------------------------- merged shell
    const buckets = { wall: [], floor: [], ceil: [] };
    const quad = (bucket, p, n, uv, cs) => buckets[bucket].push({ p, n, uv, cs });
    const cornerShade = (x, z) => {
      let k = 0;
      for (const [dc, dr] of [
        [-1, -1],
        [0, -1],
        [-1, 0],
        [0, 0],
      ])
        if (solidAt(x + dc, z + dr)) k++;
      return [1, 0.82, 0.64, 0.5, 0.5][k];
    };
    function edge(c, r, d) {
      const x0 = c * CELL,
        z0 = r * CELL,
        x1 = x0 + CELL,
        z1 = z0 + CELL;
      if (d === "n") return [x1, z0, x0, z0];
      if (d === "s") return [x0, z1, x1, z1];
      if (d === "e") return [x1, z1, x1, z0];
      return [x0, z0, x0, z1];
    }
    for (let r = 0; r < sim.H; r++) {
      for (let c = 0; c < sim.W; c++) {
        const t = sim.tileAt(c, r);
        if (solidAt(c, r) && t.t !== "glass" && t.t !== "tube") continue;
        if (t.t === "void") continue;
        const x0 = c * CELL,
          z0 = r * CELL,
          x1 = x0 + CELL,
          z1 = z0 + CELL;
        const cs = [cornerShade(c, r), cornerShade(c + 1, r), cornerShade(c + 1, r + 1), cornerShade(c, r + 1)];
        if (t.t !== "spikes") quad("floor", [x0, 0, z0, x1, 0, z0, x1, 0, z1, x0, 0, z1], [0, 1, 0], [x0 / 4, z0 / 4, x1 / 4, z0 / 4, x1 / 4, z1 / 4, x0 / 4, z1 / 4], cs);
        quad("ceil", [x0, WALL_H, z1, x1, WALL_H, z1, x1, WALL_H, z0, x0, WALL_H, z0], [0, -1, 0], [x0 / 4, z1 / 4, x1 / 4, z1 / 4, x1 / 4, z0 / 4, x0 / 4, z0 / 4], [0.7, 0.7, 0.7, 0.7]);
        if (solidAt(c, r)) continue;
        for (const [d, [dc, dr]] of Object.entries(DIRS)) {
          const nk = tileKind(c + dc, r + dr);
          if (!SOLID.has(nk) || nk === "pillar" || nk === "glass" || nk === "tube") continue;
          const pts = edge(c, r, d);
          const u0 = ((dc ? r : c) % 2) * 0.5,
            u1 = u0 + 0.5;
          quad("wall", [pts[0], 0, pts[1], pts[2], 0, pts[3], pts[2], WALL_H, pts[3], pts[0], WALL_H, pts[1]], [-dc, 0, -dr], [u0, 0, u1, 0, u1, 0.86, u0, 0.86], [0.5, 0.5, 0.98, 0.98]);
        }
      }
    }
    const mats = { wall: wallMat, floor: floorMat, ceil: ceilMat };
    for (const [k, qs] of Object.entries(buckets)) {
      if (!qs.length) continue;
      const pos = [],
        nor = [],
        uv = [],
        colr = [],
        idx = [];
      qs.forEach((q, i) => {
        pos.push(...q.p);
        for (let v = 0; v < 4; v++) nor.push(...q.n);
        uv.push(...q.uv);
        q.cs.forEach((s) => colr.push(s, s, s));
        const b = i * 4;
        idx.push(b, b + 2, b + 1, b, b + 3, b + 2);
      });
      const geo = own(new THREE.BufferGeometry());
      geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
      geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
      geo.setAttribute("color", new THREE.Float32BufferAttribute(colr, 3));
      geo.setIndex(idx);
      group.add(new THREE.Mesh(geo, mats[k]));
    }

    // ---------------------------------------------------- special tiles
    const flameMats = {
      orange: own(spriteMat(sprites.flame, 0xffa040, 0.95)),
      blue: own(spriteMat(sprites.flame, 0x60a0ff, 0.95)),
    };
    const miasmaMat = own(spriteMat(sprites.smoke, 0x8aff70, 0.32, false));
    const miasmaMat2 = own(spriteMat(sprites.smoke, 0xa070ff, 0.22, false));
    const spikeMat = kit.bronze;
    for (const t of sim.tiles) {
      const [x, z] = cellCenter(t.c, t.r);
      if (t.t === "pillar") {
        const p = new THREE.Group();
        const shaft = new THREE.Mesh(kit.cyl, stoneMat);
        shaft.scale.set(1.1, WALL_H - 0.6, 1.1);
        shaft.position.y = WALL_H / 2;
        const base = new THREE.Mesh(kit.cyl, kit.stoneDark);
        base.scale.set(1.4, 0.3, 1.4);
        base.position.y = 0.15;
        const cap = new THREE.Mesh(kit.cone, kit.stone);
        cap.scale.set(1.5, 0.5, 1.5);
        cap.rotation.x = Math.PI;
        cap.position.y = WALL_H - 0.3;
        const band = new THREE.Mesh(kit.cyl, kit.gold);
        band.scale.set(1.14, 0.1, 1.14);
        band.position.y = 1.3;
        const band2 = band.clone();
        band2.position.y = 2.6;
        p.add(shaft, base, cap, band, band2);
        p.position.set(x, 0, z);
        group.add(p);
      } else if (t.t === "glass") {
        const g = new THREE.Group();
        const ns = solidAt(t.c, t.r - 1) || solidAt(t.c, t.r + 1);
        for (let k = 0; k < 7; k++) {
          const b = new THREE.Mesh(kit.cylLo, kit.bronze);
          b.scale.set(0.06, WALL_H, 0.06);
          b.position.set(ns ? 0 : -0.9 + k * 0.3, WALL_H / 2, ns ? -0.9 + k * 0.3 : 0);
          g.add(b);
        }
        g.position.set(x, 0, z);
        group.add(g);
      } else if (t.t === "tube") {
        const st = buildStatue(kit, hash(t.c, t.r) > 0.5 ? "pharaoh" : "anubis", 1.25);
        st.position.set(x, 0, z);
        let face = "s";
        for (const d of ["n", "e", "s", "w"]) if (!solidAt(t.c + DIRS[d][0], t.r + DIRS[d][1])) face = d;
        st.rotation.y = DIR_YAW[face];
        group.add(st);
      } else if (t.h && t.raised) {
        let o;
        if (t.raised === "ledge") {
          o = new THREE.Mesh(kit.box, stoneMat);
          o.scale.set(CELL * 0.98, t.h, CELL * 0.98);
          o.position.set(x, t.h / 2, z);
        } else if (t.raised === "altar") {
          o = new THREE.Group();
          const top = new THREE.Mesh(kit.box, kit.alabaster);
          top.scale.set(1.6, 0.12, 1.2);
          top.position.y = t.h - 0.06;
          const blk = new THREE.Mesh(kit.box, stoneMat);
          blk.scale.set(1.4, t.h - 0.12, 1.0);
          blk.position.y = (t.h - 0.12) / 2;
          const trim = new THREE.Mesh(kit.box, kit.gold);
          trim.scale.set(1.62, 0.04, 1.22);
          trim.position.y = t.h - 0.13;
          o.add(top, blk, trim);
          o.position.set(x, 0, z);
        } else {
          o = new THREE.Group();
          for (let k = 0; k < 6; k++) {
            const rk = new THREE.Mesh(kit.rock, stoneMat);
            const s = 0.6 + hash(t.c + k, t.r) * 0.7;
            rk.scale.set(s * 1.4, s, s * 1.2);
            rk.position.set((hash(t.c, t.r + k) - 0.5) * 1.1, s * 0.4 + (k > 3 ? 0.4 : 0), (hash(t.c * 3 + k, t.r) - 0.5) * 1.1);
            rk.rotation.set(hash(k, t.c), hash(t.r, k) * 3, 0);
            o.add(rk);
          }
          o.position.set(x, 0, z);
        }
        group.add(o);
      } else if (t.t === "spikes") {
        const pit = new THREE.Mesh(kit.box, kit.stoneDark);
        pit.scale.set(CELL, 0.02, CELL);
        pit.position.set(x, -0.01, z);
        group.add(pit);
        const N = 25;
        const inst = new THREE.InstancedMesh(kit.cone4, spikeMat, N);
        const m4 = new THREE.Matrix4();
        for (let i = 0; i < N; i++) {
          const ix = (i % 5) - 2,
            iz = Math.floor(i / 5) - 2;
          m4.compose(new THREE.Vector3(ix * 0.36 + (hash(i, t.c) - 0.5) * 0.08, 0.22, iz * 0.36 + (hash(t.r, i) - 0.5) * 0.08), new THREE.Quaternion(), new THREE.Vector3(0.12, 0.5, 0.12));
          inst.setMatrixAt(i, m4);
        }
        const holder = new THREE.Group();
        holder.add(inst);
        holder.position.set(x, 0, z);
        group.add(holder);
        level.spikes.push({ t, holder, k: 1 });
      } else if (t.t === "laser") {
        const color = t.color === "blue" ? "blue" : "orange";
        const across = solidAt(t.c - 1, t.r) && solidAt(t.c + 1, t.r) ? "x" : solidAt(t.c, t.r - 1) && solidAt(t.c, t.r + 1) ? "z" : "x";
        const lg = new THREE.Group();
        const jets = [];
        for (const s of [-1, 1]) {
          const nozzle = new THREE.Mesh(kit.box, kit.bronze);
          nozzle.scale.set(across === "x" ? 0.14 : 0.3, 0.5, across === "x" ? 0.3 : 0.14);
          nozzle.position.set(across === "x" ? s * 0.92 : 0, 0.25, across === "z" ? s * 0.92 : 0);
          const mouth = new THREE.Mesh(kit.sphereLo, color === "blue" ? kit.glowCyan : kit.glowOrange);
          mouth.scale.setScalar(0.12);
          mouth.position.set(across === "x" ? s * 0.84 : 0, 0.45, across === "z" ? s * 0.84 : 0);
          lg.add(nozzle, mouth);
        }
        for (let k = 0; k < 7; k++) {
          const f = new THREE.Sprite(flameMats[color]);
          const off = -0.75 + k * 0.25;
          f.position.set(across === "x" ? off : (hash(k, t.c) - 0.5) * 0.3, 0.6 + (k % 3) * 0.4, across === "z" ? off : (hash(t.r, k) - 0.5) * 0.3);
          f.scale.set(0.7, 1.2, 1);
          lg.add(f);
          jets.push({ f, ph: hash(k, t.r) * 6, base: f.position.y });
        }
        lg.position.set(x, 0, z);
        group.add(lg);
        level.lasers.push({ t, jets });
        level.sources.push({ pos: new THREE.Vector3(x, 1, z), color: color === "blue" ? 0x5090ff : 0xff8030, power: 6, on: () => sim.laserOn(t), flick: hash(t.c, t.r) * 9 });
      } else if (t.t === "gas") {
        const ps = [];
        for (let k = 0; k < 4; k++) {
          const s = new THREE.Sprite(k % 2 ? miasmaMat2 : miasmaMat);
          s.scale.setScalar(1.5 + hash(t.c + k, t.r) * 1.2);
          s.position.set(x + (hash(t.c, t.r + k) - 0.5) * 1.2, 0.4 + k * 0.5, z + (hash(t.c + k, t.r * 2) - 0.5) * 1.2);
          group.add(s);
          ps.push({ s, base: s.position.clone(), ph: hash(t.c * 5, t.r + k) * 6 });
        }
        level.gas.push({ t, ps });
      } else if (t.t === "exit") {
        buildExit(t, x, z);
      }
    }
    // sand drifts in corners
    const sandMat = own(new THREE.MeshStandardMaterial({ map: own(sandTexture(L.id)), transparent: true, roughness: 1, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
    for (const t of sim.tiles) {
      if (t.t !== "floor" || t.h || hash(t.c * 5, t.r * 11) < 0.82) continue;
      const s = new THREE.Mesh(kit.plane, sandMat);
      s.rotation.x = -Math.PI / 2;
      s.rotation.z = hash(t.r, t.c) * 6;
      s.scale.setScalar(1.6 + hash(t.c, t.r) * 0.8);
      const [x, z] = cellCenter(t.c, t.r);
      s.position.set(x, 0.01, z);
      group.add(s);
    }
    // wall torches (bronze sconce + flame + pooled light)
    const torchCells = [];
    for (const t of sim.tiles) {
      if (t.t !== "floor" && t.t !== "exit") continue;
      for (const [d, [dc, dr]] of Object.entries(DIRS)) {
        if (tileKind(t.c + dc, t.r + dr) !== "wall" || hash(t.c * 7 + dc * 3, t.r * 5 + dr) < 0.86) continue;
        if (sim.ents.some((e) => e.wall && e.c === t.c && e.r === t.r && e.dir === d)) continue;
        if ((L.lamps || []).some(([c, r, dd]) => c === t.c && r === t.r && dd === d)) continue;
        torchCells.push([t.c, t.r, d]);
        break;
      }
    }
    const torchFlame = own(spriteMat(sprites.flame, zone.torch, 1));
    for (const [c, r, d] of torchCells) {
      const g = new THREE.Group();
      const plate = new THREE.Mesh(kit.box, kit.bronze);
      plate.scale.set(0.16, 0.3, 0.06);
      plate.position.z = -0.03;
      const arm = new THREE.Mesh(kit.box, kit.bronze);
      arm.scale.set(0.06, 0.06, 0.32);
      arm.position.set(0, -0.06, -0.18);
      const cup = new THREE.Mesh(kit.cyl, kit.bronze);
      cup.scale.set(0.16, 0.14, 0.16);
      cup.position.set(0, 0.02, -0.32);
      const f = new THREE.Sprite(torchFlame);
      f.position.set(0, 0.26, -0.32);
      f.scale.set(0.34, 0.5, 1);
      g.add(plate, arm, cup, f);
      placeOnWall(g, c, r, d, 2.25);
      group.add(g);
      level.flames.push({ f, ph: hash(c, r) * 9, sy: 0.5 });
      const [dc, dr] = DIRS[d];
      level.sources.push({ pos: g.position.clone().add(new THREE.Vector3(-dc * 0.5, 0.2, -dr * 0.5)), color: zone.torch, power: 7, on: () => true, flick: hash(r, c) * 10, torch: true });
    }
    // eternal coloured flames (clues)
    for (const [c, r, d, colorKey] of L.lamps || []) {
      const col = COLORS[colorKey];
      const g = new THREE.Group();
      const bowl = new THREE.Mesh(kit.bowl, kit.gold);
      bowl.scale.set(0.7, 0.5, 0.7);
      bowl.position.set(0, 0, -0.32);
      const arm = new THREE.Mesh(kit.box, kit.gold);
      arm.scale.set(0.08, 0.08, 0.34);
      arm.position.set(0, -0.04, -0.17);
      const f = new THREE.Sprite(own(spriteMat(sprites.flame, col, 1)));
      f.position.set(0, 0.42, -0.32);
      f.scale.set(0.6, 0.85, 1);
      const gl = new THREE.Sprite(own(spriteMat(sprites.glow, col, 0.6)));
      gl.scale.setScalar(1.4);
      gl.position.set(0, 0.35, -0.32);
      g.add(bowl, arm, f, gl);
      placeOnWall(g, c, r, d, 2.1);
      group.add(g);
      level.flames.push({ f, ph: c * 3 + r, sy: 0.85 });
      level.sources.push({ pos: g.position.clone().add(new THREE.Vector3(-DIRS[d][0] * 0.6, 0.3, -DIRS[d][1] * 0.6)), color: new THREE.Color(col).getHex(), power: 6, on: () => true, steady: true });
    }

    // ---------------------------------------------------- devices
    const ctx = {
      own,
      wallMat,
      stoneMat,
      glyphMats: {},
      gemMats: {},
      doorMats: {},
      glyph(id) {
        return (this.glyphMats[id] ??= own(new THREE.MeshStandardMaterial({ map: own(glyphTexture(id, "pedestal", zone)), roughness: 0.7 })));
      },
      gem(key) {
        return (this.gemMats[key] ??= own(new THREE.MeshStandardMaterial({ map: own(gemTexture(COLORS[key], zone)), roughness: 0.4, emissive: new THREE.Color(COLORS[key]), emissiveIntensity: 0.25, emissiveMap: null })));
      },
      door(key) {
        return (this.doorMats[key] ??= own(new THREE.MeshStandardMaterial({ map: own(doorTexture(zone, key === "gold")), roughness: 0.8, metalness: key === "gold" ? 0.4 : 0.05 })));
      },
    };
    for (const e of sim.ents) {
      const v = buildEnt(e, ctx);
      if (v) {
        group.add(v.obj);
        level.views.set(e.id, v);
      }
    }
    return level;

    /* ------------------------------------------------ exit stairway */
    function buildExit(t, x, z) {
      let wallDir = "n";
      for (const d of ["n", "e", "s", "w"]) {
        const [dc, dr] = DIRS[d];
        if (!solidAt(t.c + dc, t.r + dr)) wallDir = OPPOSITE[d];
      }
      const g = new THREE.Group();
      // steps descending into golden light
      for (let k = 0; k < 5; k++) {
        const st = new THREE.Mesh(kit.box, kit.stone);
        st.scale.set(1.8, 0.12, 0.36);
        st.position.set(0, -0.06 - k * 0.12, -0.8 + k * 0.32);
        g.add(st);
      }
      const hole = new THREE.Mesh(kit.box, kit.dark);
      hole.scale.set(1.84, 0.02, 1.84);
      hole.position.y = -0.7;
      const frameMat = kit.gold;
      for (const s of [-1, 1]) {
        const post = new THREE.Mesh(kit.box, stoneMat);
        post.scale.set(0.24, WALL_H, 0.24);
        post.position.set(s * 0.95, WALL_H / 2, -0.95);
        g.add(post);
      }
      const lintel = new THREE.Mesh(kit.box, frameMat);
      lintel.scale.set(2.1, 0.22, 0.3);
      lintel.position.set(0, WALL_H - 0.4, -0.95);
      const sun = new THREE.Mesh(glyphGeometry("sun"), kit.glowGold);
      sun.scale.setScalar(0.42);
      sun.position.set(0, WALL_H - 0.85, -0.92);
      const shaft = new THREE.Sprite(own(spriteMat(sprites.glow, 0xffd070, 0.4)));
      shaft.scale.set(2.2, 3.2, 1);
      shaft.position.set(0, 1.0, 0);
      g.add(hole, lintel, sun, shaft);
      g.position.set(x, 0, z);
      g.rotation.y = DIR_YAW[wallDir];
      group.add(g);
      level.sources.push({ pos: new THREE.Vector3(x, 1.5, z), color: 0xffd080, power: 9, on: () => true, steady: true });
      level.exits.push({ g, shaft });
    }
  }

  /** Put a wall-mounted object on face `d` of cell (c,r); its −z points into the room. */
  function placeOnWall(obj, c, r, d, y) {
    const [x, z] = cellCenter(c, r);
    const [dx, dz] = DIRS[d];
    obj.position.set(x + dx * (CELL / 2), y, z + dz * (CELL / 2));
    obj.rotation.y = DIR_YAW[OPPOSITE[d]];
  }

  /* ================================================================ device views */
  function buildEnt(e, ctx) {
    const [x, z] = cellCenter(e.c, e.r);
    const g = new THREE.Group();
    const v = { obj: g, e, update: null, source: null };
    const sim = level.sim;
    const base = sim.tileAt(e.c, e.r)?.h || 0;
    const add = (geo, mat, sx, sy, sz, px = 0, py = 0, pz = 0, parent = g) => {
      const o = new THREE.Mesh(geo, mat);
      o.scale.set(sx, sy, sz);
      o.position.set(px, py, pz);
      parent.add(o);
      return o;
    };
    const glowMat = (c, k = 1.6) => ctx.own(new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(k), toneMapped: false }));
    const mount = (y) => (placeOnWall(g, e.c, e.r, e.dir, y), g);
    const facingOpen = () => {
      let face = "s";
      for (const d of ["s", "n", "e", "w"]) if (!SOLID.has(sim.tileAt(e.c + DIRS[d][0], e.r + DIRS[d][1])?.t ?? "void")) face = d;
      for (const d of ["n", "s", "e", "w"]) if (SOLID.has(sim.tileAt(e.c - DIRS[d][0], e.r - DIRS[d][1])?.t ?? "void") && !SOLID.has(sim.tileAt(e.c + DIRS[d][0], e.r + DIRS[d][1])?.t ?? "void")) face = d;
      return face;
    };
    switch (e.t) {
      case "door": {
        const tA = sim.tileAt(e.c - 1, e.r),
          tB = sim.tileAt(e.c + 1, e.r);
        const spanX = tA && SOLID.has(tA.t) && tB && SOLID.has(tB.t);
        const mat = e.secret ? ctx.wallMat : ctx.door(e.key === "goldKey" || e.kind === "blast" ? "gold" : "stone");
        const leaf = new THREE.Group();
        const slab = add(kit.box, mat, 2, WALL_H, 0.3, 0, WALL_H / 2, 0, leaf);
        if (e.secret) {
          // the wall material's UVs make a convincing seam
          slab.scale.z = 0.4;
        }
        g.add(leaf);
        let gem = null;
        if (!e.secret) {
          for (const s of [-1, 1]) add(kit.box, ctx.stoneMat, 0.26, WALL_H, 0.6, s * 1.0, WALL_H / 2, 0);
          add(kit.box, kit.gold, 2.2, 0.24, 0.62, 0, WALL_H - 0.12, 0);
          const gc = e.key ? KEY_COLOR[e.key] : "#ff4020";
          gem = ctx.own(new THREE.MeshBasicMaterial({ color: new THREE.Color(gc).multiplyScalar(1.6), toneMapped: false }));
          for (const s of [-1, 1]) add(kit.octa, gem, 0.16, 0.22, 0.16, 0, WALL_H - 0.12, s * 0.32);
        }
        g.rotation.y = spanX ? 0 : Math.PI / 2;
        g.position.set(x, 0, z);
        const col = new THREE.Color();
        v.update = () => {
          leaf.position.y = e.open * (WALL_H - 0.12);
          if (gem) {
            const ok = e.open > 0 || (e.unlocked && (!e.need || e.need.every((k) => sim.sig(k))));
            col.set(ok ? "#60ff90" : e.key && !e.unlocked ? KEY_COLOR[e.key] : "#ff5020").multiplyScalar(1.6);
            gem.color.copy(col);
          }
        };
        break;
      }
      case "keypad": {
        // cartouche: a gilded oval frame with a rope band and four blank sign slots
        mount(MOUNT.keypad.y);
        add(kit.box, ctx.stoneMat, 0.62, 0.9, 0.08, 0, 0, -0.04);
        const ring = add(kit.torus, kit.gold, 0.5, 0.82, 0.5, 0, 0, -0.09);
        void ring;
        add(kit.box, kit.gold, 0.5, 0.05, 0.05, 0, -0.44, -0.09);
        const slots = [];
        for (let i = 0; i < 4; i++) slots.push(add(kit.box, kit.stoneDark, 0.18, 0.12, 0.02, 0, 0.27 - i * 0.18, -0.09));
        const lit = ctx.own(new THREE.MeshBasicMaterial({ color: 0x302010, toneMapped: false }));
        const eye = add(kit.sphereLo, lit, 0.08, 0.08, 0.04, 0, 0.49, -0.09);
        void eye;
        v.source = { color: 0xffc040, power: 1.4, on: () => !!sim.keypads[e.id], y: MOUNT.keypad.y };
        v.update = () => {
          const ok = !!sim.keypads[e.id];
          const powered = !e.need || e.need.every((k) => sim.sig(k));
          lit.color.setHex(ok ? 0x60ff90 : powered ? 0xffb030 : 0x201008).multiplyScalar(ok ? 1.8 : 1.2 + Math.sin(time * 3) * 0.3);
          slots.forEach((s) => (s.material = ok ? kit.glowGold : kit.stoneDark));
        };
        break;
      }
      case "panel": {
        mount(MOUNT.panel.y);
        add(kit.box, ctx.stoneMat, 0.72, 0.78, 0.1, 0, -0.02, -0.05);
        add(kit.box, kit.gold, 0.76, 0.06, 0.12, 0, 0.36, -0.06);
        const lock = sim.locks[e.lock];
        const faceMat = (sym) => (e.kind === "color" ? ctx.gem(sym) : ctx.glyph(sym));
        const pivot = new THREE.Group();
        pivot.position.set(0, -0.04, -0.12);
        const face = add(kit.box, faceMat(lock.symbols[e.cur]), 0.56, 0.56, 0.04, 0, 0, 0, pivot);
        g.add(pivot);
        const led = ctx.own(new THREE.MeshBasicMaterial({ color: 0x402010, toneMapped: false }));
        add(kit.sphereLo, led, 0.07, 0.07, 0.04, 0, 0.44, -0.1);
        let shown = e.cur;
        v.update = () => {
          if (shown !== e.cur && e.turn < 0.5) {
            shown = e.cur;
            face.material = faceMat(lock.symbols[e.cur]);
          }
          pivot.rotation.y = Math.sin(e.turn * Math.PI) * 1.4;
          led.color.setHex(lock.solved ? 0x60ff90 : 0xff7020).multiplyScalar(lock.solved ? 1.8 : 0.6);
        };
        break;
      }
      case "statue": {
        g.position.set(x, 0, z);
        const lock = sim.locks[e.lock];
        const st = buildStatue(kit, e.kind || "anubis", 0.95);
        g.add(st);
        const ring = add(kit.ring, kit.gold, 1.5, 1.5, 3, 0, 0.05, 0);
        ring.rotation.x = Math.PI / 2;
        const target = () => DIR_YAW[lock.symbols[e.cur]];
        let yaw = target();
        st.rotation.y = yaw;
        v.source = { color: 0x60ff90, power: 2.5, on: () => lock.solved, y: 2.4 };
        v.update = (dt) => {
          let d = target() - yaw;
          d = Math.atan2(Math.sin(d), Math.cos(d));
          yaw += d * Math.min(1, dt * 6);
          st.rotation.y = yaw;
          ring.material = lock.solved ? kit.glowGreen : kit.gold;
        };
        break;
      }
      case "block": {
        const mat = (level.blockMat ??= ctx.own(new THREE.MeshStandardMaterial({ map: ctx.own(blockTexture(level.zone, level.L.id)), roughness: 0.9 })));
        add(kit.box, mat, 1.84, 1.7, 1.84, 0, 0.85, 0);
        add(kit.box, kit.stoneDark, 1.9, 0.12, 1.9, 0, 0.06, 0);
        v.update = () => {
          const [tx, tz] = cellCenter(e.c, e.r);
          const [fx, fz] = cellCenter(...e.from);
          const k = e.slide;
          const s = k * k * (3 - 2 * k);
          g.position.set(tx + (fx - tx) * s, 0, tz + (fz - tz) * s);
        };
        v.update();
        break;
      }
      case "plate": {
        g.position.set(x, 0, z);
        add(kit.box, kit.stoneDark, 1.5, 0.04, 1.5, 0, 0.02, 0);
        const top = add(kit.box, kit.bronze, 1.3, 0.1, 1.3, 0, 0.07, 0);
        const sym = add(kit.plane, ctx.glyph(e.heavy ? "djed" : "feather"), 0.9, 0.9, 1, 0, 0.125, 0);
        sym.rotation.x = -Math.PI / 2;
        const lit = ctx.own(new THREE.MeshBasicMaterial({ color: 0x302010, toneMapped: false }));
        const rim = add(kit.ring, lit, 1.6, 1.6, 2, 0, 0.05, 0);
        rim.rotation.x = Math.PI / 2;
        v.update = () => {
          top.position.y = 0.07 - e.anim * 0.06;
          sym.position.y = 0.125 - e.anim * 0.06;
          lit.color.setHex(e.pressed ? 0x60ff90 : 0x7a5020).multiplyScalar(e.pressed ? 1.6 : 1);
        };
        break;
      }
      case "switch": {
        if (e.hidden) {
          // a loose brick that sinks into the wall
          mount(MOUNT.hidden.y);
          const brick = add(kit.box, ctx.stoneMat, 0.62, 0.3, 0.16, 0, 0, -0.06);
          v.update = () => {
            brick.position.z = -0.06 + e.anim * 0.12;
          };
        } else {
          mount(MOUNT.switch.y);
          add(kit.box, ctx.stoneMat, 0.46, 0.66, 0.1, 0, 0, -0.05);
          add(kit.box, kit.bronze, 0.32, 0.5, 0.04, 0, 0, -0.11);
          const pivot = new THREE.Group();
          pivot.position.set(0, 0, -0.14);
          add(kit.cylLo, e.reset ? kit.lapis : kit.wood, 0.06, 0.42, 0.06, 0, 0.18, -0.04, pivot);
          add(kit.sphere, e.reset ? kit.glowCyan : kit.gold, 0.13, 0.13, 0.13, 0, 0.4, -0.04, pivot);
          g.add(pivot);
          const led = ctx.own(new THREE.MeshBasicMaterial({ color: 0x402010, toneMapped: false }));
          add(kit.octa, led, 0.07, 0.09, 0.04, 0, 0.28, -0.14);
          v.update = () => {
            pivot.rotation.x = 0.75 - e.anim * 1.5;
            led.color.setHex(e.reset ? 0x40c0ff : e.on ? 0x60ff90 : 0xff6020).multiplyScalar(1.4);
          };
        }
        break;
      }
      case "clue": {
        mount(MOUNT.clue.y);
        const k = e.kind || "scroll";
        if (k === "scroll") {
          const p = add(kit.plane, (level.papyrus ??= ctx.own(new THREE.MeshStandardMaterial({ map: ctx.own(papyrusTexture(level.L.id)), roughness: 0.95 }))), 0.62, 0.82, 1, 0, 0, -0.03);
          p.rotation.y = Math.PI;
          for (const s of [-1, 1]) add(kit.cyl, kit.wood, 0.05, 0.7, 0.05, 0, s * 0.42, -0.05).rotation.z = Math.PI / 2;
        } else {
          const kind = k === "mural" ? "painting" : "inscription";
          const w = k === "mural" ? 1.5 : 0.95;
          const h = k === "mural" ? 1.1 : 0.85;
          const tex = ctx.own(panelTexture(kind, null, level.zone, e.c * 3 + e.r));
          const p = add(kit.plane, ctx.own(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 })), w, h, 1, 0, 0, -0.03);
          p.rotation.y = Math.PI;
          add(kit.box, kit.gold, w + 0.06, 0.05, 0.05, 0, h / 2 + 0.02, -0.03);
          add(kit.box, kit.gold, w + 0.06, 0.05, 0.05, 0, -h / 2 - 0.02, -0.03);
        }
        break;
      }
      case "term": {
        // ancient mechanism: a stone housing with a bronze wheel (or a sun dial / scales)
        const dial = /dial|scales|inscription/i.test(e.label || "");
        mount(MOUNT.term.y);
        add(kit.box, ctx.stoneMat, 1.0, 0.9, 0.14, 0, 0, -0.07);
        add(kit.box, kit.gold, 1.04, 0.06, 0.16, 0, 0.46, -0.07);
        const wheel = new THREE.Group();
        wheel.position.set(0, 0, -0.17);
        if (dial) {
          const disc = add(kit.disc, kit.gold, 0.66, 0.04, 0.66, 0, 0, 0, wheel);
          disc.rotation.x = Math.PI / 2;
          const gn = add(kit.cone4, kit.bronze, 0.08, 0.3, 0.04, 0, 0.12, -0.04, wheel);
          void gn;
        } else {
          const disc = add(kit.cyl, kit.bronze, 0.52, 0.06, 0.52, 0, 0, 0, wheel);
          disc.rotation.x = Math.PI / 2;
          for (let k = 0; k < 8; k++) {
            const a = (k / 8) * Math.PI * 2;
            add(kit.box, kit.bronze, 0.08, 0.08, 0.06, Math.cos(a) * 0.29, Math.sin(a) * 0.29, 0, wheel).rotation.z = a;
          }
          add(kit.box, kit.wood, 0.05, 0.5, 0.05, 0, 0, -0.05, wheel);
        }
        g.add(wheel);
        const jam = ctx.own(new THREE.MeshBasicMaterial({ color: 0xff4020, toneMapped: false }));
        const jamMark = add(kit.octa, jam, 0.1, 0.12, 0.05, 0.38, 0.3, -0.16);
        const glowM = ctx.own(new THREE.MeshBasicMaterial({ color: 0x302010, toneMapped: false }));
        add(kit.sphereLo, glowM, 0.12, 0.12, 0.05, 0, 0, -0.22);
        v.source = { color: 0xffc040, power: 1.8, on: () => e.fixed && (!e.need || e.need.every((k) => sim.sig(k))), y: MOUNT.term.y };
        v.update = (dt) => {
          const powered = e.fixed && (!e.need || e.need.every((k) => sim.sig(k)));
          if (powered && (e.done || !e.sig)) wheel.rotation.z += dt * (dial ? 0.3 : 1.5);
          jamMark.visible = !e.fixed;
          glowM.color.setHex(powered ? (e.done ? 0x60ff90 : 0xffb030) : 0x201008).multiplyScalar(powered ? 1.6 + Math.sin(time * 3) * 0.3 : 1);
        };
        break;
      }
      case "gen": {
        // brazier: bronze bowl on a stone pedestal
        g.position.set(x, 0, z);
        add(kit.cyl, ctx.stoneMat, 0.6, 0.7, 0.6, 0, 0.35, 0);
        add(kit.cyl, kit.gold, 0.66, 0.06, 0.66, 0, 0.72, 0);
        add(kit.bowl, kit.bronze, 1.5, 0.9, 1.5, 0, 0.74, 0);
        const flameCol = COLORS[e.color] || "#ffa040";
        const oilM = ctx.own(new THREE.MeshStandardMaterial({ color: 0x1a120a, roughness: 0.3 }));
        const oil = add(kit.disc, oilM, 1.1, 0.02, 1.1, 0, 0.96, 0);
        const fl = new THREE.Sprite(ctx.own(spriteMat(sprites.flame, flameCol, 1)));
        fl.position.set(0, 1.45, 0);
        fl.scale.set(0.9, 1.2, 1);
        g.add(fl);
        const fl2 = new THREE.Sprite(ctx.own(spriteMat(sprites.flame, flameCol, 0.8)));
        fl2.position.set(0.1, 1.35, 0.05);
        fl2.scale.set(0.6, 0.9, 1);
        g.add(fl2);
        const gem = ctx.own(new THREE.MeshBasicMaterial({ color: new THREE.Color(flameCol).multiplyScalar(0.6), toneMapped: false }));
        add(kit.octa, gem, 0.14, 0.18, 0.1, 0, 0.42, -0.3);
        v.source = { color: new THREE.Color(flameCol).getHex(), power: 8, on: () => e.on, y: 1.6 };
        v.update = () => {
          fl.visible = fl2.visible = e.on;
          oil.visible = e.filled;
          fl.scale.set(0.9 + Math.sin(time * 9 + x) * 0.08, 1.2 + Math.sin(time * 13 + z) * 0.12, 1);
          fl2.scale.set(0.6 + Math.sin(time * 11 + z) * 0.06, 0.9 + Math.sin(time * 7 + x) * 0.1, 1);
          gem.color.set(flameCol).multiplyScalar(e.on ? 2 : e.filled ? 0.8 + Math.sin(time * 3) * 0.3 : 0.3);
        };
        break;
      }
      case "socket": {
        g.position.set(x, 0, z);
        const slots = [];
        if (e.item === "gear") {
          add(kit.box, ctx.stoneMat, 0.9, 1.0, 0.9, 0, 0.5, 0);
          for (let k = 0; k < e.count; k++) {
            const gear = new THREE.Group();
            const d = add(kit.cyl, kit.bronze, 0.5, 0.06, 0.5, 0, 0, 0, gear);
            d.rotation.x = Math.PI / 2;
            for (let t = 0; t < 8; t++) {
              const a = (t / 8) * Math.PI * 2;
              add(kit.box, kit.bronze, 0.07, 0.07, 0.06, Math.cos(a) * 0.28, Math.sin(a) * 0.28, 0, gear).rotation.z = a;
            }
            gear.position.set((k - (e.count - 1) / 2) * 0.32, 1.18 + (k % 2) * 0.12, -0.42);
            g.add(gear);
            slots.push(gear);
          }
          v.update = (dt) =>
            slots.forEach((s, k) => {
              s.visible = k < e.have;
              s.rotation.z += dt * (e.filled ? (k % 2 ? -1.2 : 1.2) : 0);
            });
        } else {
          add(kit.box, ctx.stoneMat, 1.0, 0.9, 0.8, 0, 0.45, 0);
          add(kit.box, kit.alabaster, 1.08, 0.08, 0.88, 0, 0.94, 0);
          add(kit.box, kit.gold, 1.1, 0.04, 0.9, 0, 0.88, 0);
          for (let k = 0; k < e.count; k++) {
            const it = buildItem(kit, e.item, ITEMS[e.item]);
            it.own.forEach((m) => ctx.own(m));
            it.group.scale.setScalar(e.item === "idol" ? 1.3 : 0.9);
            it.group.position.set((k - (e.count - 1) / 2) * 0.32, 1.2, 0);
            g.add(it.group);
            slots.push(it.group);
          }
          v.update = () => slots.forEach((s, k) => (s.visible = k < e.have));
        }
        v.source = { color: 0xffc040, power: 2, on: () => e.filled, y: 1.3 };
        break;
      }
      case "prism": {
        // bronze mirror on a turning stand
        g.position.set(x, 0, z);
        add(kit.cyl, ctx.stoneMat, 0.6, 0.6, 0.6, 0, 0.3, 0);
        add(kit.cyl, kit.bronze, 0.1, BEAM_Y - 0.5, 0.1, 0, 0.6 + (BEAM_Y - 0.6) / 2, 0);
        const head = new THREE.Group();
        head.position.y = BEAM_Y;
        const disc = add(kit.disc, kit.mirror, 0.9, 0.05, 0.9, 0, 0, 0, head);
        disc.rotation.x = Math.PI / 2;
        add(kit.torus, kit.gold, 0.92, 0.92, 0.92, 0, 0, 0, head);
        g.add(head);
        v.update = () => {
          head.visible = !e.empty;
          // "/" (even) faces north-east, "\" (odd) faces north-west, seen on the map
          head.rotation.y = (e.rot % 2 === 0 ? -Math.PI / 4 : Math.PI / 4) + e.turn * (Math.PI / 2);
        };
        break;
      }
      case "receiver": {
        // golden sun disc held between a pair of horns on a column
        g.position.set(x, 0, z);
        add(kit.cyl, ctx.stoneMat, 0.6, BEAM_Y - 0.2, 0.6, 0, (BEAM_Y - 0.2) / 2, 0);
        const discM = ctx.own(new THREE.MeshStandardMaterial({ color: 0xc89030, metalness: 1, roughness: 0.3, emissive: 0x000000 }));
        const disc = add(kit.sphere, discM, 0.75, 0.75, 0.75, 0, BEAM_Y + 0.15, 0);
        for (const s of [-1, 1]) {
          const h = add(kit.torus, kit.gold, 0.9, 0.9, 0.9, s * 0.05, BEAM_Y + 0.2, 0);
          h.scale.set(0.5, 0.9, 0.5);
          h.rotation.z = s * 0.5;
        }
        const halo = new THREE.Sprite(ctx.own(spriteMat(sprites.glow, 0xffc040, 0.8)));
        halo.scale.setScalar(2.4);
        halo.position.y = BEAM_Y + 0.15;
        g.add(halo);
        void disc;
        v.source = { color: 0xffc040, power: 7, on: () => e.lit, y: BEAM_Y + 0.2 };
        v.update = () => {
          discM.emissive.setHex(e.lit ? 0xffa020 : 0x000000);
          discM.emissiveIntensity = e.lit ? 1.4 + Math.sin(time * 4) * 0.2 : 0;
          halo.visible = e.lit;
        };
        break;
      }
      case "emitter": {
        // a sun shaft: a carved opening in the wall pouring light (or a stone shutter)
        mount(BEAM_Y);
        add(kit.box, kit.gold, 0.9, 0.1, 0.2, 0, 0.42, -0.08);
        add(kit.box, kit.gold, 0.9, 0.1, 0.2, 0, -0.42, -0.08);
        const light = add(kit.box, glowMat(0xfff0c0, 1.8), 0.7, 0.7, 0.02, 0, 0, -0.01);
        const shutter = add(kit.box, ctx.stoneMat, 0.8, 0.8, 0.1, 0, 0, -0.08);
        const halo = new THREE.Sprite(ctx.own(spriteMat(sprites.glow, 0xffd070, 0.7)));
        halo.scale.setScalar(1.8);
        halo.position.z = -0.2;
        g.add(halo);
        v.source = { color: 0xffe0a0, power: 6, on: () => !e.need || e.need.every((k) => sim.sig(k)), y: BEAM_Y };
        v.update = () => {
          const on = !e.need || e.need.every((k) => sim.sig(k));
          shutter.visible = !on;
          light.visible = halo.visible = on;
        };
        break;
      }
      case "node": {
        const by = e.by || "scepter";
        const col = by === "sun" ? 0xff9a30 : 0xa070ff;
        const m = ctx.own(new THREE.MeshBasicMaterial({ color: col, toneMapped: false }));
        if (e.wall) {
          mount(MOUNT.node.y);
          add(kit.box, ctx.stoneMat, 0.62, 0.62, 0.2, 0, 0, -0.1);
          add(kit.torus, kit.gold, 0.6, 0.6, 0.6, 0, 0, -0.2);
          if (by === "scepter") {
            const ankh = new THREE.Mesh(glyphGeometry("ankh"), m);
            ankh.scale.setScalar(0.5);
            ankh.position.z = -0.3;
            g.add(ankh);
          } else add(kit.octa, m, 0.36, 0.52, 0.36, 0, 0, -0.32);
        } else {
          g.position.set(x, 0, z);
          add(kit.cyl, ctx.stoneMat, 0.7, 1.6, 0.7, 0, 0.8, 0);
          add(kit.octa, m, 0.5, 0.8, 0.5, 0, 1.95, 0);
        }
        v.source = { color: col, power: 3, on: () => true, y: 1.8 };
        v.update = () => {
          m.color.setHex(e.charged ? 0xffffff : col).multiplyScalar(e.charged ? 1.6 : 1.1 + Math.sin(time * 4) * 0.4);
          v.source.color = e.charged ? 0xfff0d0 : col;
          v.source.power = e.charged ? 5 : 2.5;
        };
        break;
      }
      case "barrel": {
        // oil jar: bursts into flame when struck
        g.position.set(x, 0, z);
        add(kit.urn, kit.clay, 0.9, 1.0, 0.9, 0, 0, 0);
        add(kit.cyl, kit.red, 0.62, 0.08, 0.62, 0, 0.55, 0);
        add(kit.sphereLo, kit.glowOrange, 0.12, 0.12, 0.12, 0, 1.0, 0);
        v.update = () => (g.visible = !e.gone);
        break;
      }
      case "item": {
        const def = ITEMS[e.item];
        const { group, own: om } = buildItem(kit, e.item, def);
        om.forEach((m) => ctx.own(m));
        (group.userData.ownGeo || []).forEach((gg) => ctx.own(gg));
        g.add(group);
        const glow = new THREE.Sprite(ctx.own(spriteMat(sprites.glow, def.color, def.kind === "relic" ? 0.9 : 0.55)));
        glow.scale.setScalar(def.kind === "relic" ? 1.5 : 0.9);
        g.add(glow);
        g.position.set(x, base, z);
        v.source = def.kind === "key" || def.kind === "relic" || def.kind === "weapon" ? { color: new THREE.Color(def.color).getHex(), power: def.kind === "relic" ? 3 : 1.4, on: () => !e.gone && !e.stashed, y: base + 0.8 } : null;
        v.update = () => {
          g.visible = !e.gone && !e.stashed;
          if (!g.visible) return;
          const [px, pz] = e.pos || cellCenter(e.c, e.r);
          const b = sim.tileAt(e.c, e.r)?.h || 0;
          g.position.set(px, b, pz);
          group.position.y = 0.6 + Math.sin(time * 2 + e.c) * 0.06;
          group.rotation.y = time * 1.2 + e.r;
          glow.position.y = group.position.y;
        };
        break;
      }
      case "locker": {
        const k = e.kind || "urn";
        g.position.set(x, 0, z);
        g.rotation.y = DIR_YAW[facingOpen()];
        const box = buildContainer(kit, k);
        g.add(box);
        let open = 0;
        if (e.key) {
          const led = ctx.own(new THREE.MeshBasicMaterial({ color: new THREE.Color(KEY_COLOR[e.key] || "#ffffff").multiplyScalar(1.6), toneMapped: false }));
          add(kit.octa, led, 0.12, 0.16, 0.08, 0, k === "vault" ? 0.75 : 0.5, -0.5);
        }
        v.update = (dt) => {
          open += ((e.opened ? 1 : 0) - open) * Math.min(1, dt * 4);
          openContainer(box, k, open);
        };
        break;
      }
      case "deco":
        buildDeco(e, g, add, ctx, x, z);
        break;
      default:
        return null;
    }
    v.update ||= () => {};
    return v;
  }

  function buildDeco(e, g, add, ctx, x, z) {
    g.position.set(x, 0, z);
    const sim = level.sim;
    let face = null;
    for (const d of ["n", "e", "s", "w"]) if (SOLID.has(sim.tileAt(e.c + DIRS[d][0], e.r + DIRS[d][1])?.t ?? "void")) face = d;
    const toWall = face ? DIR_YAW[OPPOSITE[face]] : hash(e.c, e.r) * 6.28;
    const nudge = (k) => face && g.position.add(new THREE.Vector3(DIRS[face][0] * k, 0, DIRS[face][1] * k));
    switch (e.kind) {
      case "bones": {
        for (let i = 0; i < 6; i++) {
          const b = add(kit.cylLo, kit.bone, 0.05, 0.4 + hash(i, e.c) * 0.3, 0.05, (hash(e.r, i) - 0.5) * 1.2, 0.04, (hash(i * 3, e.c) - 0.5) * 1.2);
          b.rotation.set(Math.PI / 2, hash(i, e.r) * 6, 0);
        }
        add(kit.sphere, kit.bone, 0.24, 0.26, 0.26, (hash(e.c, 9) - 0.5) * 0.8, 0.12, (hash(9, e.r) - 0.5) * 0.8);
        break;
      }
      case "sand": {
        const s = add(kit.plane, (level.splats.sand ??= ctx.own(new THREE.MeshStandardMaterial({ map: ctx.own(sandTexture(e.c + e.r)), transparent: true, roughness: 1, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }))), 2.2, 2.2, 1, 0, 0.012, 0);
        s.rotation.x = -Math.PI / 2;
        s.rotation.z = hash(e.r, e.c) * 6.28;
        break;
      }
      case "coins":
        for (let i = 0; i < 12; i++) add(kit.coin, kit.gold, 1, 1, 1, (hash(i, e.c) - 0.5) * 1.2, 0.01, (hash(e.r, i) - 0.5) * 1.2);
        break;
      case "rug": {
        const r = add(kit.box, kit.stripes, 1.4, 0.02, 1.8, 0, 0.01, 0);
        r.rotation.y = toWall;
        break;
      }
      case "jars":
        g.rotation.y = toWall;
        nudge(0.35);
        for (let i = 0; i < 4; i++) {
          const j = add(i % 2 ? kit.urn : kit.jar, i % 2 ? kit.clay : kit.alabaster, 1, 1, 1, -0.5 + i * 0.34, 0, 0.1 + (i % 2) * 0.25);
          j.scale.setScalar(0.8 + hash(i, e.r) * 0.4);
        }
        break;
      case "statue": {
        const st = buildStatue(kit, hash(e.c, e.r) > 0.66 ? "falcon" : hash(e.r, e.c) > 0.5 ? "anubis" : "pharaoh", 0.85);
        st.rotation.y = toWall;
        g.add(st);
        nudge(0.25);
        break;
      }
      case "obelisk": {
        const ob = buildObelisk(kit, ctx.stoneMat);
        (ob.userData.ownGeo || []).forEach((gg) => ctx.own(gg));
        g.add(ob);
        break;
      }
      case "gold": {
        const pile = buildGoldPile(kit, e.c * 7 + e.r);
        pile.rotation.y = hash(e.c, e.r) * 6;
        g.add(pile);
        break;
      }
      default:
        add(kit.box, ctx.stoneMat, 0.8, 0.8, 0.8, 0, 0.4, 0);
    }
  }

  /* ================================================================ enemies */
  function enemyView(en) {
    let ev = level.enemyViews.get(en.id);
    if (ev) return ev;
    const m = buildEnemy(kit, en.kind);
    level.group.add(m.root);
    ev = { ...m, en, fall: 0, emissive: m.skin.emissive.clone() };
    level.enemyViews.set(en.id, ev);
    return ev;
  }
  function updateEnemy(ev, en, dt, sim) {
    const { root, body, parts: P } = ev;
    if (en.state === "dormant") {
      root.visible = false;
      return;
    }
    root.visible = !(en.dead && en.deadT > 10);
    root.position.set(en.x, 0, en.z);
    root.rotation.y = en.yaw;
    const sp = Math.hypot(en.vx, en.vz);
    const ph = en.walk * (en.kind === "swarm" ? 3.2 : en.def.boss ? 1.4 : 2.4);
    const sw = Math.min(1, sp / 1.5) * 0.7;
    if (en.emerge > 0) root.position.y = -en.emerge * en.def.h * 0.9;
    else root.position.y = en.kind === "pharaoh" ? 0.25 + Math.sin(time * 1.5) * 0.12 : 0;
    // hit flash / burning tint
    if (en.hitT > 0) {
      ev.skin.emissive.setHex(0xff9040);
      ev.skin.emissiveIntensity = 0.3;
    } else if (en.burn > 0) {
      ev.skin.emissive.setHex(0xff5010);
      ev.skin.emissiveIntensity = 0.5 + Math.sin(time * 20) * 0.2;
    } else {
      ev.skin.emissive.setHex(0x000000);
      ev.skin.emissiveIntensity = 0;
    }
    if (P.orbit) {
      P.orbit.rotation.y += dt * (en.dead ? 0 : 6);
      P.orbit.children.forEach((b, i) => (b.position.y = Math.sin(time * 8 + i) * 0.15 - (en.dead ? 0.4 : 0)));
    }
    if (en.dead) {
      ev.fall = Math.min(1, ev.fall + dt * 2.2);
      const k = 1 - (1 - ev.fall) ** 3;
      if (en.kind === "swarm") {
        body.scale.setScalar(Math.max(0.01, 1 - k));
        return;
      }
      body.rotation.x = ev.baseRx + k * 1.35;
      body.position.y = ev.baseY * (1 - k * 0.7);
      if (P.legL) P.legL.rotation.x = k * 1.2;
      if (P.legR) P.legR.rotation.x = k * 1.0;
      if (P.armL) P.armL.rotation.x = -k * 2.4;
      if (P.armR) P.armR.rotation.x = -k * 2.0;
      if (P.shield) P.shield.visible = false;
      root.position.y = en.deadT > 6 ? -(en.deadT - 6) * 0.3 : 0;
      return;
    }
    ev.fall = 0;
    body.scale.setScalar(1);
    let lean = 0;
    let armRaise = 0;
    if (en.atk > 0) {
      const wind = en.kind === "swarm" ? 0.28 : en.boss ? 0.55 : 0.42;
      const k = Math.min(1, en.atk / wind);
      armRaise = k < 0.8 ? k * 2.6 : 2.6 - (k - 0.8) * 10;
      lean = k * 0.25;
    }
    if (en.spitT > 0) armRaise = 2.2;
    if (en.charge) lean = en.charge.t < 0.7 ? -0.2 : 0.5;
    if (en.stun > 0) lean = -0.3 + Math.sin(time * 12) * 0.05;
    body.rotation.x = ev.baseRx - lean;
    body.position.y = ev.baseY + Math.abs(Math.sin(ph)) * 0.05 * sw;
    body.rotation.z = Math.sin(ph) * 0.06 * sw + (en.hitT > 0 ? 0.12 : 0);
    if (P.legL) P.legL.rotation.x = Math.sin(ph) * sw;
    if (P.legR) P.legR.rotation.x = -Math.sin(ph) * sw;
    if (P.legs) P.legs.forEach((l, i) => (l.rotation.x = Math.sin(time * 6 + i * 1.7) * 0.4 * (0.3 + sw)));
    const reach = en.kind === "skeleton" ? 0.9 : 0.2;
    if (P.armL) P.armL.rotation.x = -reach - armRaise * (P.fire ? 0.9 : 1) - Math.sin(ph) * sw * 0.6 + Math.sin(time * 2 + en.x) * 0.05;
    if (P.armR) P.armR.rotation.x = -reach - armRaise * (P.fire ? 0.4 : 0.9) + Math.sin(ph) * sw * 0.6 + Math.sin(time * 2.3 + en.z) * 0.05;
    if (P.head) P.head.rotation.y = Math.sin(time * 1.3 + en.x) * 0.25;
    if (P.sac) P.sac.scale.set(0.8, 0.5, 0.9).multiplyScalar(1 + Math.sin(time * (en.spitT > 0 ? 18 : 3)) * (en.spitT > 0 ? 0.12 : 0.05));
    if (P.core) P.core.rotation.y += dt * 2;
    if (P.shield) {
      const sh = sim.isShielded(en);
      P.shield.visible = sh;
      if (sh) {
        P.shield.rotation.y = time * 0.6;
        kit.shield.opacity = 0.14 + Math.sin(time * 6) * 0.05;
      }
    }
  }

  /* ================================================================ effects */
  function puff(x, y, z, { color = 0xffffff, size = 0.4, grow = 2, life = 0.8, vy = 0.3, spread = 0.4, alpha = 0.6, additive = false } = {}) {
    const p = puffs.find((q) => q.life <= 0) || puffs[0];
    p.life = p.max = life;
    p.base = size;
    p.grow = grow;
    p.alpha = alpha;
    p.s.material.color.setHex(color);
    p.s.material.blending = additive ? THREE.AdditiveBlending : THREE.NormalBlending;
    p.s.position.set(x, y, z);
    p.v.set((Math.random() - 0.5) * spread, vy + Math.random() * 0.2, (Math.random() - 0.5) * spread);
    p.s.visible = true;
  }
  function spark(x, y, z, n = 5, speed = 3, color = 0xffd080, grav = 9) {
    for (let i = 0; i < n; i++) {
      const s = sparks.find((q) => q.life <= 0) || sparks[0];
      s.life = 0.3 + Math.random() * 0.25;
      s.g = grav;
      s.s.material.color.setHex(color);
      s.s.position.set(x, y, z);
      s.v.set((Math.random() - 0.5) * speed, Math.random() * speed * 0.8, (Math.random() - 0.5) * speed);
      s.s.scale.setScalar(0.08 + Math.random() * 0.07);
      s.s.visible = true;
    }
  }
  function ring(x, z, r, color = 0xffc040, life = 0.6) {
    const q = rings.find((k) => k.life <= 0) || rings[0];
    q.life = q.max = life;
    q.r = r;
    q.m.material.color.setHex(color);
    q.m.position.set(x, 0.15, z);
    q.m.visible = true;
  }
  function bolt(a, b, kind) {
    const q = bolts.find((k) => k.life <= 0) || bolts[0];
    q.kind = kind;
    q.a.copy(a);
    q.b.set(b[0], b[1], b[2]);
    const len = q.a.distanceTo(q.b);
    q.dur = Math.max(0.03, len / WEAPONS[kind].speed);
    q.life = q.dur;
    q.t = 0;
    if (kind === "bow") {
      q.arrow.visible = true;
      q.s.visible = false;
      tmpV.subVectors(q.b, q.a).normalize();
      q.arrow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), tmpV);
    } else {
      q.s.visible = true;
      q.arrow.visible = false;
      q.s.material.color.setHex(BOLT[kind].color);
      q.s.scale.setScalar(BOLT[kind].size * (kind === "sun" ? 2 : 2.4));
    }
  }
  function beamTracer(a, b) {
    const t = tracers.find((q) => q.life <= 0) || tracers[0];
    tmpV.set(b[0] - a.x, b[1] - a.y, b[2] - a.z);
    const len = tmpV.length();
    if (len < 0.3) return;
    t.m.quaternion.setFromUnitVectors(UP, tmpV.clone().normalize());
    t.m.position.set((a.x + b[0]) / 2, (a.y + b[1]) / 2, (a.z + b[2]) / 2);
    t.m.scale.set(0.035, len, 0.035);
    t.m.visible = true;
    t.life = t.max = 0.22;
  }

  /** Simulation events the renderer reacts to (called by the UI per event). */
  function fx(e, sim) {
    if (!level) return;
    switch (e.type) {
      case "shot": {
        const w = weapons[e.weapon];
        vm.kick = Math.min(1.5, vm.kick + (e.weapon === "sun" ? 1.0 : e.weapon === "scarab" ? 0.35 : e.weapon === "scepter" ? 0.8 : 0.6));
        vm.flashT = 0.06;
        w.flash.visible = true;
        w.flash.material.rotation = Math.random() * 6;
        muzzleLight.color.setHex(BOLT[e.weapon].color);
        muzzleLight.intensity = e.weapon === "bow" ? 0 : e.weapon === "sun" ? 9 : 5;
        muzzleLight.position.copy(camera.position);
        tmpV2.set(0.12, -0.1, -0.5).applyQuaternion(camera.quaternion).add(camera.position);
        for (const p of e.to) {
          bolt(tmpV2, p, e.weapon);
          if (e.weapon === "scepter") beamTracer(tmpV2, p);
        }
        break;
      }
      case "impact": {
        const col = e.weapon ? BOLT[e.weapon].color : 0xffd080;
        if (e.kind === "wall") {
          spark(e.x, e.y, e.z, e.weapon === "bow" ? 3 : 6, 2.5, col);
          puff(e.x, e.y, e.z, { color: 0xc8a070, size: 0.18, grow: 1.6, life: 0.7, alpha: 0.5 });
        } else if (e.kind === "stone") spark(e.x, e.y, e.z, 7, 3.5, 0xfff0c0);
        else {
          spark(e.x, e.y, e.z, 5, 2.5, col);
          puff(e.x, e.y, e.z, { color: 0xb8a888, size: 0.2, grow: 2, life: 0.5, alpha: 0.7, vy: -0.2 });
        }
        break;
      }
      case "burst":
        fxLight.position.set(e.x, e.y + 0.3, e.z);
        fxLight.intensity = 30;
        fxLight.color.setHex(0xff9030);
        for (let i = 0; i < 5; i++) puff(e.x + (Math.random() - 0.5) * 0.6, e.y + Math.random() * 0.4, e.z + (Math.random() - 0.5) * 0.6, { color: i < 3 ? 0xffa040 : 0x553322, size: 0.5, grow: 2.6, life: 0.7 + i * 0.08, alpha: 0.9, additive: i < 3, spread: 1.6 });
        spark(e.x, e.y, e.z, 12, 6, 0xffb060);
        ring(e.x, e.z, e.r, 0xff9030, 0.45);
        shake = Math.max(shake, 0.12);
        break;
      case "ability":
        fxLight.position.set(e.x, 1.4, e.z);
        fxLight.intensity = 50;
        fxLight.color.setHex(0xffc040);
        ring(e.x, e.z, 6, 0xffd060, 0.7);
        ring(e.x, e.z, 4, 0xff8020, 0.5);
        for (let i = 0; i < 18; i++) {
          const a = (i / 18) * Math.PI * 2;
          puff(e.x + Math.cos(a) * 1.5, 0.6, e.z + Math.sin(a) * 1.5, { color: 0xffb040, size: 0.6, grow: 2.4, life: 0.6, alpha: 0.8, additive: true, spread: 0.2 });
        }
        shake = Math.max(shake, 0.18);
        break;
      case "kill":
        puff(e.x, 1, e.z, { color: e.kind === "swarm" ? 0x203a2a : 0xc8b090, size: 0.6, grow: 3, life: 1.3, alpha: 0.7, vy: 0.2 });
        spark(e.x, 1.2, e.z, 10, 3, e.kind === "swarm" ? 0x7affa0 : 0x80e0ff, 2);
        if (e.boss) {
          shake = Math.max(shake, 0.35);
          fxLight.position.set(e.x, 2, e.z);
          fxLight.intensity = 60;
          fxLight.color.setHex(0xffd070);
          ring(e.x, e.z, 8, 0xffd060, 1.2);
        }
        break;
      case "explode":
        fxLight.position.set(e.x, 1.2, e.z);
        fxLight.intensity = 40;
        fxLight.color.setHex(0xff8040);
        for (let i = 0; i < 7; i++) puff(e.x + (Math.random() - 0.5), 0.6 + Math.random(), e.z + (Math.random() - 0.5), { color: i < 4 ? 0xffa040 : 0x333333, size: 0.8, grow: 3, life: 1.2 + i * 0.1, alpha: 0.9, additive: i < 4, spread: 2 });
        spark(e.x, 0.8, e.z, 16, 8, 0xffb060);
        shake = Math.max(shake, 0.4);
        break;
      case "splash":
        puff(e.x, e.y, e.z, { color: 0xff7020, size: 0.35, grow: 2, life: 0.5, alpha: 0.8, additive: true });
        spark(e.x, e.y, e.z, 5, 2.5, 0xff9040);
        break;
      case "nodeCharged": {
        const c = sim.entBox(sim.byId[e.id]).c;
        fxLight.position.set(...c);
        fxLight.intensity = 25;
        fxLight.color.setHex(e.by === "sun" ? 0xffa040 : 0xb090ff);
        spark(...c, 14, 5, e.by === "sun" ? 0xffc060 : 0xc0a0ff);
        break;
      }
      case "overload": {
        const c = sim.entBox(sim.byId[e.id]).c;
        for (let i = 0; i < 4; i++) puff(c[0], c[1] + 0.4, c[2], { color: 0x403028, size: 0.5, grow: 2.5, life: 1.2, alpha: 0.8, spread: 0.8, vy: 0.8 });
        break;
      }
      case "genOn": {
        const c = sim.entBox(sim.byId[e.id]).c;
        spark(c[0], 1.3, c[2], 12, 3, 0xffb050, 3);
        break;
      }
      case "push":
        shake = Math.max(shake, 0.05);
        break;
      case "doorOpen":
        shake = Math.max(shake, 0.06);
        break;
      case "hurt":
        shake = Math.max(shake, Math.min(0.2, e.amount / 120));
        break;
      case "crash":
        shake = Math.max(shake, 0.3);
        puff(e.x, 0.4, e.z, { color: 0xb09070, size: 0.8, grow: 3, life: 1, spread: 2 });
        break;
      case "roar":
        shake = Math.max(shake, 0.12);
        break;
      case "wake": {
        const en = sim.enemyById[e.id] || sim.enemies.find((q) => q.id === e.id);
        if (en) puff(en.x, 0.3, en.z, { color: 0xc8a070, size: 0.8, grow: 2.5, life: 1.2, spread: 1.4, alpha: 0.7 });
        break;
      }
      case "relic":
        fxLight.position.copy(camera.position);
        fxLight.intensity = 30;
        fxLight.color.setHex(0xffd070);
        break;
      default:
        break;
    }
  }

  /* ================================================================ frame */
  function render(sim, dt, view = {}) {
    time += dt;
    renderer.clear();
    if (!level || !sim) {
      renderer.render(scene, camera);
      return;
    }
    level.sim = sim;
    const p = sim.player;
    const dead = sim.state === "dead";
    const bobK = p.ground ? Math.min(1, p.speed / 4) : 0;
    shake = Math.max(0, shake - dt * 1.2);
    const escaping = sim.escape && sim.state !== "complete";
    if (escaping) shake = Math.max(shake, 0.05);
    const sk = shake * shake * 0.6 + (escaping ? 0.02 : 0);
    camera.position.set(
      p.x + (Math.random() - 0.5) * sk,
      EYE + p.y + Math.sin(p.bob * 2) * 0.04 * bobK + (Math.random() - 0.5) * sk - (dead ? Math.min(1.2, sim.deadT * 1.4) : 0),
      p.z + (Math.random() - 0.5) * sk,
    );
    camera.rotation.set(p.pitch + p.kick, p.yaw, Math.sin(p.bob) * 0.006 * bobK + (dead ? Math.min(0.9, sim.deadT * 0.9) : 0));
    const fov = fovBase * (1 - (p.cur === "bow" ? 0.3 : 0.18) * p.aim);
    if (Math.abs(camera.fov - fov) > 0.01) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }

    for (const v of level.views.values()) v.update(dt);
    for (const en of sim.enemies) updateEnemy(enemyView(en), en, dt, sim);

    // traps
    for (const lz of level.lasers) {
      const on = sim.laserOn(lz.t);
      for (const j of lz.jets) {
        j.f.visible = on;
        if (on) {
          j.f.position.y = j.base + Math.sin(time * 14 + j.ph) * 0.08;
          j.f.scale.set(0.6 + Math.sin(time * 17 + j.ph) * 0.12, 1.1 + Math.sin(time * 11 + j.ph) * 0.2, 1);
        }
      }
    }
    for (const sp of level.spikes) {
      const want = sim.spikesOn(sp.t) ? 1 : 0;
      sp.k += (want - sp.k) * Math.min(1, dt * 14);
      sp.holder.position.y = -0.48 * (1 - sp.k);
    }
    for (const gz of level.gas) {
      const on = sim.gasOn(gz.t);
      for (const q of gz.ps) {
        q.s.visible = on;
        q.s.position.set(q.base.x + Math.sin(time * 0.4 + q.ph) * 0.3, q.base.y + Math.sin(time * 0.3 + q.ph) * 0.2, q.base.z + Math.cos(time * 0.35 + q.ph) * 0.3);
        q.s.material.rotation = time * 0.1 + q.ph;
      }
    }
    for (const f of level.flames) {
      f.f.scale.set(f.sy * 0.7 + Math.sin(time * 9 + f.ph) * 0.04, f.sy + Math.sin(time * 13 + f.ph) * 0.06, 1);
    }

    // sunlight beams
    let bi = 0;
    for (const seg of sim.beams) {
      const [a, b, kind] = seg;
      tmpV.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      const len = tmpV.length();
      if (len < 1e-3) continue;
      const bm = beam(bi++);
      tmpQ.setFromUnitVectors(UP, tmpV.normalize());
      const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
      const f = 1 + Math.sin(time * 6 + bi) * 0.08;
      bm.core.position.set(...mid);
      bm.core.quaternion.copy(tmpQ);
      bm.core.scale.set(0.04, len, 0.04);
      bm.glow.position.set(...mid);
      bm.glow.quaternion.copy(tmpQ);
      bm.glow.scale.set(0.16 * f, len, 0.16 * f);
      bm.core.visible = bm.glow.visible = true;
      bm.spark.visible = kind !== "prism";
      bm.spark.position.set(...b);
      bm.spark.scale.setScalar(0.6 + Math.sin(time * 12 + bi) * 0.1);
    }
    for (let i = bi; i < beamPool.length; i++) beamPool[i].core.visible = beamPool[i].glow.visible = beamPool[i].spark.visible = false;

    // cursed fireballs
    fireballs.forEach((fb, i) => {
      const pr = sim.projectiles[i];
      fb.s.visible = fb.core.visible = !!pr;
      if (pr) {
        fb.s.position.set(pr.x, pr.y, pr.z);
        fb.core.position.set(pr.x, pr.y, pr.z);
        fb.s.material.rotation = time * 4;
        if (quality === "high" && Math.random() < dt * 30) puff(pr.x, pr.y, pr.z, { color: 0xff6010, size: 0.18, grow: 1.5, life: 0.3, alpha: 0.6, additive: true, vy: 0, spread: 0.1 });
      }
    });

    // focus marker
    if (sim.focus && sim.state === "play") {
      const bx = sim.entBox(sim.focus.ent);
      marker.visible = true;
      marker.position.set(bx.c[0], Math.min(bx.max[1] + 0.15, WALL_H - 0.3), bx.c[2]);
      marker.scale.setScalar(0.14 + Math.sin(time * 5) * 0.03);
      markerMat.color.setHex(sim.focus.locked ? 0xff7060 : 0xffe0a0);
    } else marker.visible = false;

    // effects
    for (const q of bolts) {
      if (q.life <= 0) continue;
      q.life -= dt;
      q.t = Math.min(1, 1 - q.life / q.dur);
      tmpV.lerpVectors(q.a, q.b, q.t);
      if (q.kind === "bow") q.arrow.position.copy(tmpV);
      else {
        q.s.position.copy(tmpV);
        q.s.material.rotation = time * 8;
        q.trailT -= dt;
        if (quality === "high" && q.trailT <= 0) {
          q.trailT = q.kind === "sun" ? 0.015 : 0.03;
          puff(tmpV.x, tmpV.y, tmpV.z, { color: BOLT[q.kind].color, size: BOLT[q.kind].size * 0.9, grow: 1.2, life: 0.25, alpha: 0.6, additive: true, vy: 0, spread: 0.05 });
        }
      }
      if (q.life <= 0) {
        q.s.visible = false;
        q.arrow.visible = false;
      }
    }
    for (const t of tracers) {
      if (t.life <= 0) continue;
      t.life -= dt;
      t.m.material.opacity = Math.max(0, t.life / t.max) * 0.9;
      if (t.life <= 0) t.m.visible = false;
    }
    for (const q of rings) {
      if (q.life <= 0) continue;
      q.life -= dt;
      const k = 1 - q.life / q.max;
      q.m.scale.setScalar(0.3 + k * q.r);
      q.m.material.opacity = 0.85 * (1 - k);
      if (q.life <= 0) q.m.visible = false;
    }
    for (const q of puffs) {
      if (q.life <= 0) continue;
      q.life -= dt;
      const k = 1 - q.life / q.max;
      q.s.position.addScaledVector(q.v, dt);
      q.s.scale.setScalar(q.base * (1 + k * q.grow));
      q.s.material.opacity = q.alpha * (1 - k);
      if (q.life <= 0) q.s.visible = false;
    }
    for (const s of sparks) {
      if (s.life <= 0) continue;
      s.life -= dt;
      s.v.y -= s.g * dt;
      s.s.position.addScaledVector(s.v, dt);
      if (s.life <= 0) s.s.visible = false;
    }
    // falling debris while the tomb collapses
    if (escaping && Math.random() < dt * 6) {
      puff(p.x + (Math.random() - 0.5) * 8, WALL_H - 0.2, p.z + (Math.random() - 0.5) * 8, { color: 0xc8a070, size: 0.5, grow: 2, life: 1.4, alpha: 0.6, vy: -1.6, spread: 0.3 });
    }
    muzzleLight.intensity = Math.max(0, muzzleLight.intensity - dt * 120);
    fxLight.intensity = Math.max(0, fxLight.intensity - dt * 60);

    // lights: nearest active sources
    level.lightT -= dt;
    if (level.lightT <= 0) {
      level.lightT = 0.2;
      const cands = [];
      for (const s of level.sources) if (s.on()) cands.push(s);
      for (const v of level.views.values()) {
        if (!v.source || !v.source.on()) continue;
        v.source.pos ||= new THREE.Vector3();
        v.source.pos.set(v.obj.position.x, v.source.y ?? 1.5, v.obj.position.z);
        if (v.e.wall) {
          const [dx, dz] = DIRS[v.e.dir];
          v.source.pos.x -= dx * 0.5;
          v.source.pos.z -= dz * 0.5;
        }
        cands.push(v.source);
      }
      cands.sort((a, b) => a.pos.distanceToSquared(camera.position) - b.pos.distanceToSquared(camera.position));
      level.active = cands.slice(0, LIGHTS);
    }
    pool.forEach((l, i) => {
      const s = level.active?.[i];
      if (!s) {
        l.intensity = 0;
        return;
      }
      l.position.copy(s.pos);
      l.color.setHex(s.color);
      const fl = s.steady ? 1 : s.torch ? 0.85 + Math.sin(time * 9 + (s.flick || i)) * 0.08 + Math.sin(time * 23 + s.flick) * 0.05 : 0.92 + Math.sin(time * 7 + (s.flick || i)) * 0.06;
      l.intensity = s.power * fl;
    });
    if (escaping) {
      const pulse = 0.5 + 0.5 * Math.sin(time * 3);
      hemi.color.setRGB(1, 0.55 + 0.15 * pulse, 0.4);
      hemi.intensity = level.hemiBase * (0.9 + pulse * 0.3);
    } else {
      hemi.color.setHex(level.zone.ambient[0]);
      hemi.intensity = level.hemiBase;
    }
    handLight.intensity = dead ? 0 : 12;

    for (const ex of level.exits) ex.shaft.material.opacity = 0.32 + Math.sin(time * 2) * 0.08;

    // golden dust drifting in the torchlight
    if (quality === "high") {
      dust.visible = true;
      const a = dustGeo.attributes.position.array;
      for (let i = 0; i < DUST; i++) {
        const k = i * 3;
        const [ph, sp] = dustSeed[i];
        a[k] += Math.sin(time * 0.3 + ph) * dt * 0.08;
        a[k + 1] += (Math.sin(time * 0.2 + ph * 2) * 0.05 - 0.02 * sp) * dt;
        a[k + 2] += Math.cos(time * 0.25 + ph) * dt * 0.08;
        for (let j = 0; j < 3; j++) {
          const c = j === 1 ? 1.8 : j === 0 ? camera.position.x : camera.position.z;
          const half = j === 1 ? 1.8 : 7;
          if (a[k + j] < c - half) a[k + j] += half * 2;
          else if (a[k + j] > c + half) a[k + j] -= half * 2;
        }
      }
      dustGeo.attributes.position.needsUpdate = true;
    } else dust.visible = false;

    renderer.render(scene, camera);

    // weapon pass
    const cur = p.cur;
    if (vm.cur !== cur) {
      for (const id of WEAPON_ORDER) weapons[id].group.visible = id === cur;
      vm.cur = cur;
    }
    if (cur && !dead && sim.state !== "complete" && !view.hideWeapon) {
      const w = weapons[cur];
      vm.kick = Math.max(0, vm.kick - dt * 7);
      vm.flashT -= dt;
      if (vm.flashT <= 0) w.flash.visible = false;
      wFlashLight.intensity = vm.flashT > 0 ? 3 : 0;
      wFlashLight.color.setHex(BOLT[cur].color);
      const aim = p.aim;
      const def = WEAPONS[cur];
      const reloadK = p.reloadT > 0 ? Math.sin(Math.min(1, 1 - p.reloadT / (def.reload * sim.stats.reloadMul)) * Math.PI) : 0;
      const switchK = p.switchT > 0 ? p.switchT / 0.4 : 0;
      const sprint = p.sprint && p.speed > 3 ? 1 : 0;
      const bobX = Math.cos(p.bob) * 0.012 * bobK * (1 - aim * 0.8);
      const bobY = Math.abs(Math.sin(p.bob)) * 0.012 * bobK * (1 - aim * 0.8);
      const gx = (cur === "scarab" ? 0.15 : 0.17) * (1 - aim * 0.85) + bobX;
      const gy = -0.17 + aim * 0.06 + bobY - reloadK * 0.14 - switchK * 0.32 - sprint * 0.05;
      const gz = -0.45 + vm.kick * 0.04 + aim * 0.06;
      w.group.position.set(gx, gy, gz);
      w.group.rotation.set(vm.kick * 0.1 + reloadK * 0.5 - sprint * 0.4, aim > 0.5 ? 0 : 0.05 + sprint * 0.5, reloadK * 0.4 + (cur === "bow" ? aim * 0.25 : 0));
      const charged = !WEAPONS[cur].ammo || p.mags[cur] > 0;
      w.glow.forEach((m) => {
        m.visible = charged;
        m.rotation.y = time * 2;
      });
      wCamera.aspect = camera.aspect;
      wCamera.updateProjectionMatrix();
      renderer.clearDepth();
      renderer.render(wScene, wCamera);
    }
  }

  function resize(w, h) {
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  function setFov(f) {
    fovBase = f;
    camera.fov = f;
    camera.updateProjectionMatrix();
  }
  function setQuality(q) {
    quality = q;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q === "high" ? 1.5 : 0.85));
    renderer.toneMappingExposure = q === "high" ? 1.05 : 1.12;
  }

  const onRestore = () => {
    envTex.dispose();
    pmrem.dispose();
    pmrem = new THREE.PMREMGenerator(renderer);
    envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;
    wScene.environment = envTex;
  };
  renderer.domElement.addEventListener("webglcontextrestored", onRestore);

  function dispose() {
    renderer.domElement.removeEventListener("webglcontextrestored", onRestore);
    clearLevel();
    kit.dispose();
    Object.values(sprites).forEach((t) => t.dispose());
    [markerMat, beamTracerMat, beamCoreMat, beamGlowMat, dustMat, fireballMat, arrowMat].forEach((m) => m.dispose());
    tracers.forEach((t) => t.m.material.dispose());
    bolts.forEach((b) => b.s.material.dispose());
    puffs.forEach((q) => q.s.material.dispose());
    sparks.forEach((q) => q.s.material.dispose());
    rings.forEach((q) => (q.m.geometry.dispose(), q.m.material.dispose()));
    beamPool.forEach((b) => b.spark.material.dispose());
    Object.values(weapons).forEach((w) => {
      w.flash.material.dispose();
      (w.group.userData.ownGeo || []).forEach((g) => g.dispose());
    });
    tracerGeo.dispose();
    beamGeo.dispose();
    dustGeo.dispose();
    envTex.dispose();
    pmrem.dispose();
    renderer.dispose();
    renderer.forceContextLoss?.();
    renderer.domElement.remove();
  }

  return {
    renderer,
    scene,
    camera,
    setLevel,
    render,
    resize,
    setFov,
    setQuality,
    fx,
    dispose,
    get quality() {
      return quality;
    },
  };
}
