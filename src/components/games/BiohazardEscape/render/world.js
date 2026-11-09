/**
 * Biohazard Escape — Three.js renderer. A level's static shell (walls, floors,
 * ceilings) is merged into three meshes with baked corner shading; devices
 * and mutants are small groups updated from the simulation each frame.
 * Lighting: a dim hemisphere, the player's flashlight, a pool of six point
 * lights handed to the nearest lamps / alarms / glowing devices (so the
 * shader light count never changes) and one muzzle-flash light. The weapon is
 * drawn in a second pass with its own camera so it never clips into walls.
 * No shadow maps, no post-processing; everything is disposed on level change
 * and unmount.
 */
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { CELL, WALL_H, EYE, DIRS, DIR_YAW, OPPOSITE, ZONES, WEAPONS, WEAPON_ORDER, cellCenter } from "../engine/constants.js";
import { BEAM_Y, MOUNT } from "../engine/sim.js";
import { ITEMS } from "../engine/items.js";
import { COLORS } from "../engine/symbols.js";
import { wallTexture, floorTexture, ceilingTexture, stripeTexture, doorTexture, screenTexture, paperTexture, faceTexture, spriteTexture, splatTexture, acidTexture } from "./textures.js";
import { createKit, buildEnemy, buildWeapon, buildItem } from "./models.js";

const LIGHTS = 6;
const SOLID = new Set(["wall", "void", "pillar", "glass", "tube"]);
const KEY_COLOR = { cardRed: "#ff4a3a", cardBlue: "#3a8cff", cardGreen: "#4adf5a", cardYellow: "#ffd23a", cardOmega: "#ffffff" };

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
  renderer.toneMappingExposure = 1.0;
  renderer.autoClear = false;
  renderer.domElement.className = "bhz-canvas";
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(78, 16 / 9, 0.05, 90);
  camera.rotation.order = "YXZ";
  scene.add(camera);
  let pmrem = new THREE.PMREMGenerator(renderer);
  let envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envTex;
  scene.environmentIntensity = 0.22;
  scene.fog = new THREE.FogExp2(0x0b1213, 0.05);
  scene.background = new THREE.Color(0x050708);

  const hemi = new THREE.HemisphereLight(0xbfe6ff, 0x1a1414, 0.4);
  scene.add(hemi);
  const flashlight = new THREE.SpotLight(0xfff4e0, 26, 26, 0.52, 0.55, 1.4);
  flashlight.position.set(0.18, -0.12, 0.05);
  flashlight.target.position.set(0, -0.2, -5);
  camera.add(flashlight, flashlight.target);
  const pool = [];
  for (let i = 0; i < LIGHTS; i++) {
    const l = new THREE.PointLight(0xffffff, 0, 12, 1.6);
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
  wScene.add(new THREE.HemisphereLight(0xdde8ff, 0x202020, 1.1));
  const wDir = new THREE.DirectionalLight(0xffffff, 1.6);
  wDir.position.set(1, 2, 1);
  wScene.add(wDir);
  const wFlashLight = new THREE.PointLight(0xffc070, 0, 2, 1);
  wFlashLight.position.set(0.1, 0, -0.7);
  wScene.add(wFlashLight);
  wScene.environment = envTex;

  const kit = createKit();
  const sprites = { glow: spriteTexture("glow"), smoke: spriteTexture("smoke"), spark: spriteTexture("spark"), flash: spriteTexture("flash") };
  const spriteMat = (map, color, opacity = 1, additive = true) =>
    new THREE.SpriteMaterial({ map, color, transparent: true, opacity, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, fog: true });
  const markerMat = spriteMat(sprites.glow, 0x9affd0, 0.9);
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
    w.group.scale.setScalar(0.72);
    viewRoot.add(w.group);
    const fl = new THREE.Sprite(spriteMat(sprites.flash, id === "ion" ? 0x80f0ff : 0xffd090, 1));
    fl.scale.setScalar(id === "shotgun" ? 0.36 : 0.26);
    fl.position.copy(w.muzzle.position);
    fl.visible = false;
    w.group.add(fl);
    weapons[id] = { ...w, flash: fl };
  }

  /* ---------------------------------------------------- effect pools */
  const tracerMatY = new THREE.MeshBasicMaterial({ color: 0xffe0a0, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  const tracerMatC = new THREE.MeshBasicMaterial({ color: 0x80f6ff, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  const tracerGeo = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true);
  const tracers = [];
  for (let i = 0; i < 32; i++) {
    const my = tracerMatY.clone(),
      mc = tracerMatC.clone();
    const m = new THREE.Mesh(tracerGeo, my);
    m.visible = false;
    scene.add(m);
    tracers.push({ m, my, mc, life: 0, max: 0.06 });
  }
  const puffs = [];
  for (let i = 0; i < 70; i++) {
    const s = new THREE.Sprite(spriteMat(sprites.smoke, 0xffffff, 1, false));
    s.visible = false;
    scene.add(s);
    puffs.push({ s, life: 0, max: 1, v: new THREE.Vector3(), grow: 1, base: 0.2, alpha: 1 });
  }
  const sparks = [];
  for (let i = 0; i < 60; i++) {
    const s = new THREE.Sprite(spriteMat(sprites.spark, 0xffffff, 1));
    s.visible = false;
    scene.add(s);
    sparks.push({ s, life: 0, v: new THREE.Vector3() });
  }
  const globMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xa0ff40).multiplyScalar(1.5), toneMapped: false });
  const globs = [];
  for (let i = 0; i < 30; i++) {
    const m = new THREE.Mesh(kit.sphereLo, globMat);
    m.scale.setScalar(0.22);
    m.visible = false;
    scene.add(m);
    globs.push(m);
  }
  const beamCoreMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x9af6ff).multiplyScalar(2), toneMapped: false });
  const beamGlowMat = new THREE.MeshBasicMaterial({ color: 0x40c8ff, transparent: true, opacity: 0.3, depthWrite: false, blending: THREE.AdditiveBlending });
  const beamGeo = new THREE.CylinderGeometry(1, 1, 1, 10, 1, true);
  const beamPool = [];
  function beam(i) {
    if (!beamPool[i]) {
      const core = new THREE.Mesh(beamGeo, beamCoreMat);
      const glow = new THREE.Mesh(beamGeo, beamGlowMat);
      const spark = new THREE.Sprite(spriteMat(sprites.glow, 0x80e8ff, 0.9));
      scene.add(core, glow, spark);
      beamPool[i] = { core, glow, spark };
    }
    return beamPool[i];
  }

  // floating spores
  const DUST = 240;
  const dustGeo = new THREE.BufferGeometry();
  const dustPos = new Float32Array(DUST * 3);
  for (let i = 0; i < DUST * 3; i++) dustPos[i] = (Math.random() - 0.5) * 16;
  dustGeo.setAttribute("position", new THREE.BufferAttribute(dustPos, 3));
  const dustMat = new THREE.PointsMaterial({ size: 0.045, map: sprites.glow, transparent: true, opacity: 0.5, depthWrite: false, color: 0xc8ffd8, blending: THREE.AdditiveBlending });
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
  const UP = new THREE.Vector3(0, 1, 0);
  const vm = { kick: 0, swayX: 0, swayY: 0, cur: null, flashT: 0, lastShot: 0 };

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
    level = { L, zone, group, disposables, views: new Map(), enemyViews: new Map(), sources: [], lasers: [], gas: [], acid: null, lamps: null, exits: [], lightT: 0, sim, alarmT: 0, splats: {} };
    level.powered = () => !L.power || sim.sig(L.power);

    scene.fog.color.setHex(zone.fog);
    scene.fog.density = zone.fogDensity * (quality === "high" ? 1 : 0.8);
    scene.background.setHex(zone.fog).multiplyScalar(0.5);
    hemi.color.setHex(zone.ambient[0]);
    hemi.groundColor.setHex(zone.ambient[1]);
    level.hemiBase = zone.ambient[2];

    const wallMap = own(wallTexture(zone, L.id));
    const floorMap = own(floorTexture(zone, L.id));
    const ceilMap = own(ceilingTexture(zone));
    const stripe = own(stripeTexture());
    const wallMat = own(new THREE.MeshStandardMaterial({ map: wallMap, roughness: 0.6, metalness: 0.15, vertexColors: true, side: THREE.DoubleSide }));
    const floorMat = own(new THREE.MeshStandardMaterial({ map: floorMap, roughness: 0.85, metalness: 0.05, vertexColors: true, side: THREE.DoubleSide }));
    const ceilMat = own(new THREE.MeshStandardMaterial({ map: ceilMap, roughness: 0.9, vertexColors: true, side: THREE.DoubleSide }));
    const stripeMat = own(new THREE.MeshStandardMaterial({ map: stripe, roughness: 0.6 }));
    level.wallMat = wallMat;

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
      return [1, 0.8, 0.62, 0.5, 0.5][k];
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
        quad("floor", [x0, 0, z0, x1, 0, z0, x1, 0, z1, x0, 0, z1], [0, 1, 0], [x0 / 4, z0 / 4, x1 / 4, z0 / 4, x1 / 4, z1 / 4, x0 / 4, z1 / 4], cs);
        quad("ceil", [x0, WALL_H, z1, x1, WALL_H, z1, x1, WALL_H, z0, x0, WALL_H, z0], [0, -1, 0], [x0 / 4, z1 / 4, x1 / 4, z1 / 4, x1 / 4, z0 / 4, x0 / 4, z0 / 4], [0.7, 0.7, 0.7, 0.7]);
        if (solidAt(c, r)) continue;
        for (const [d, [dc, dr]] of Object.entries(DIRS)) {
          const nk = tileKind(c + dc, r + dr);
          if (!SOLID.has(nk) || nk === "pillar" || nk === "glass" || nk === "tube") continue;
          const pts = edge(c, r, d);
          const u0 = (pts[0] + pts[1]) / 2,
            u1 = u0 + 1;
          quad("wall", [pts[0], 0, pts[1], pts[2], 0, pts[3], pts[2], WALL_H, pts[3], pts[0], WALL_H, pts[1]], [-dc, 0, -dr], [u0, 0, u1, 0, u1, 1, u0, 1], [0.45, 0.45, 0.95, 0.95]);
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
    const concrete = own(new THREE.MeshStandardMaterial({ map: wallMap, color: 0x8a8f94, roughness: 0.7, metalness: 0.15 }));
    const crateMat = own(new THREE.MeshStandardMaterial({ color: 0x6a5a3a, roughness: 0.85 }));
    const crateMetal = own(new THREE.MeshStandardMaterial({ color: 0x3a4a5a, roughness: 0.5, metalness: 0.5 }));
    const liquidMat = own(new THREE.MeshStandardMaterial({ color: 0x40ff60, emissive: 0x30c040, emissiveIntensity: 0.9, transparent: true, opacity: 0.45, roughness: 0.1, depthWrite: false }));
    const acidMap = own(acidTexture());
    const acidMat = own(new THREE.MeshStandardMaterial({ map: acidMap, emissive: 0x4aff20, emissiveMap: acidMap, emissiveIntensity: 0.9, roughness: 0.15, transparent: true, opacity: 0.92 }));
    level.acid = acidMap;
    const laserMats = {
      red: own(new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff2020).multiplyScalar(2.2), toneMapped: false })),
      violet: own(new THREE.MeshBasicMaterial({ color: new THREE.Color(0xb050ff).multiplyScalar(2.2), toneMapped: false })),
    };
    const laserGlow = { red: own(spriteMat(sprites.glow, 0xff3030, 0.5)), violet: own(spriteMat(sprites.glow, 0xb060ff, 0.5)) };
    const gasMat = own(spriteMat(sprites.smoke, 0x7aff50, 0.3, false));
    const lampCells = [];
    for (const t of sim.tiles) {
      const [x, z] = cellCenter(t.c, t.r);
      if (t.t === "pillar") {
        const p = new THREE.Mesh(kit.box, concrete);
        p.scale.set(1.3, WALL_H, 1.3);
        p.position.set(x, WALL_H / 2, z);
        const band = new THREE.Mesh(kit.box, stripeMat);
        band.scale.set(1.32, 0.3, 1.32);
        band.position.set(x, 1.0, z);
        group.add(p, band);
      } else if (t.t === "glass") {
        const g = new THREE.Mesh(kit.box, kit.glass);
        const ns = solidAt(t.c, t.r - 1) || solidAt(t.c, t.r + 1);
        g.scale.set(ns ? 0.12 : CELL, WALL_H, ns ? CELL : 0.12);
        g.position.set(x, WALL_H / 2, z);
        const frame = new THREE.Mesh(kit.box, kit.darkMetal);
        frame.scale.set(ns ? 0.2 : CELL, 0.25, ns ? CELL : 0.2);
        frame.position.set(x, 0.12, z);
        const top = frame.clone();
        top.position.y = WALL_H - 0.12;
        group.add(g, frame, top);
      } else if (t.t === "tube") {
        const tg = new THREE.Group();
        const glass = new THREE.Mesh(kit.cyl, kit.glass);
        glass.scale.set(1.5, WALL_H - 0.8, 1.5);
        glass.position.y = WALL_H / 2;
        const liq = new THREE.Mesh(kit.cyl, liquidMat);
        liq.scale.set(1.4, WALL_H - 1.2, 1.4);
        liq.position.y = WALL_H / 2 - 0.15;
        const base = new THREE.Mesh(kit.cyl, kit.darkMetal);
        base.scale.set(1.7, 0.4, 1.7);
        base.position.y = 0.2;
        const cap = base.clone();
        cap.position.y = WALL_H - 0.2;
        const spec = buildEnemy(kit, hash(t.c, t.r) > 0.5 ? "runner" : "worker");
        own(spec.skin);
        spec.root.scale.setScalar(0.75);
        spec.root.position.y = 0.45;
        spec.root.rotation.y = hash(t.r, t.c) * 6;
        tg.add(glass, liq, base, cap, spec.root);
        tg.position.set(x, 0, z);
        group.add(tg);
        level.sources.push({ pos: new THREE.Vector3(x, 1.6, z), color: 0x50ff70, power: 4, on: () => true, flick: hash(t.c, t.r) * 9 });
      } else if (t.h && t.raised) {
        let o;
        if (t.raised === "barrier") {
          o = new THREE.Mesh(kit.box, stripeMat);
          o.scale.set(CELL * 0.98, t.h, CELL * 0.98);
          o.position.set(x, t.h / 2, z);
        } else if (t.raised === "table") {
          o = new THREE.Group();
          const top = new THREE.Mesh(kit.box, kit.white);
          top.scale.set(1.9, 0.08, 1.4);
          top.position.y = t.h - 0.04;
          const cab = new THREE.Mesh(kit.box, kit.plastic);
          cab.scale.set(1.8, t.h - 0.08, 1.3);
          cab.position.y = (t.h - 0.08) / 2;
          o.add(top, cab);
          o.position.set(x, 0, z);
        } else {
          o = new THREE.Group();
          const metal = hash(t.c * 3, t.r) > 0.5;
          const b = new THREE.Mesh(kit.box, metal ? crateMetal : crateMat);
          b.scale.set(1.8, t.h, 1.8);
          b.position.y = t.h / 2;
          const band = new THREE.Mesh(kit.box, kit.darkMetal);
          band.scale.set(1.84, 0.12, 1.84);
          band.position.y = t.h * 0.7;
          o.add(b, band);
          o.position.set(x, 0, z);
          o.rotation.y = (hash(t.c, t.r) - 0.5) * 0.3;
        }
        group.add(o);
      } else if (t.t === "acid") {
        const a = new THREE.Mesh(kit.plane, acidMat);
        a.rotation.x = -Math.PI / 2;
        a.scale.set(CELL, CELL, 1);
        a.position.set(x, 0.03, z);
        group.add(a);
        if (hash(t.c, t.r) > 0.6) level.sources.push({ pos: new THREE.Vector3(x, 0.4, z), color: 0x60ff30, power: 2.5, on: () => true, flick: 2 });
      } else if (t.t === "laser") {
        const color = t.color === "violet" ? "violet" : "red";
        const across = solidAt(t.c - 1, t.r) && solidAt(t.c + 1, t.r) ? "x" : solidAt(t.c, t.r - 1) && solidAt(t.c, t.r + 1) ? "z" : "x";
        const lg = new THREE.Group();
        for (let k = 0; k < 6; k++) {
          const b = new THREE.Mesh(kit.cylLo, laserMats[color]);
          b.scale.set(0.025, CELL, 0.025);
          if (across === "x") b.rotation.z = Math.PI / 2;
          else b.rotation.x = Math.PI / 2;
          b.position.y = 0.22 + k * 0.32;
          lg.add(b);
        }
        for (const s of [-1, 1]) {
          const post = new THREE.Mesh(kit.box, kit.darkMetal);
          post.scale.set(across === "x" ? 0.12 : 0.3, 2.1, across === "x" ? 0.3 : 0.12);
          post.position.set(across === "x" ? s * 0.96 : 0, 1.05, across === "z" ? s * 0.96 : 0);
          lg.add(post);
        }
        const gl = new THREE.Sprite(laserGlow[color]);
        gl.scale.set(2.4, 2.4, 1);
        gl.position.y = 1;
        lg.add(gl);
        lg.position.set(x, 0, z);
        group.add(lg);
        level.lasers.push({ t, g: lg, beams: lg.children.slice(0, 6), glow: gl });
        level.sources.push({ pos: new THREE.Vector3(x, 1, z), color: color === "violet" ? 0xb050ff : 0xff2020, power: 5, on: () => sim.laserOn(t), flick: 0 });
      } else if (t.t === "gas") {
        const ps = [];
        for (let k = 0; k < 3; k++) {
          const s = new THREE.Sprite(gasMat);
          s.scale.setScalar(1.6 + hash(t.c + k, t.r) * 1.2);
          s.position.set(x + (hash(t.c, t.r + k) - 0.5) * 1.2, 0.5 + k * 0.6, z + (hash(t.c + k, t.r * 2) - 0.5) * 1.2);
          group.add(s);
          ps.push({ s, base: s.position.clone(), ph: hash(t.c * 5, t.r + k) * 6 });
        }
        level.gas.push({ t, ps });
      } else if (t.t === "exit") {
        buildExit(t, x, z);
      }
      // ceiling lamps
      if ((t.t === "floor" || t.t === "exit" || t.t === "acid") && !t.h && hash(t.c * 7, t.r * 3) > 0.7) lampCells.push([x, z, t]);
    }
    // ceiling lamp panels: one instanced mesh
    const lampMat = own(new THREE.MeshBasicMaterial({ color: new THREE.Color(zone.lamp).multiplyScalar(1.1), toneMapped: false }));
    level.lampMat = lampMat;
    if (lampCells.length) {
      const lamps = new THREE.InstancedMesh(kit.box, lampMat, lampCells.length);
      const m4 = new THREE.Matrix4();
      lampCells.forEach(([x, z], i) => {
        m4.compose(new THREE.Vector3(x, WALL_H - 0.03, z), new THREE.Quaternion(), new THREE.Vector3(1.0, 0.05, 0.22));
        lamps.setMatrixAt(i, m4);
        level.sources.push({ pos: new THREE.Vector3(x, WALL_H - 0.4, z), color: zone.lamp, power: 5.5, on: () => level.powered(), flick: hash(x, z) * 10, lamp: true, bad: hash(z, x) > 0.85 });
      });
      group.add(lamps);
    }
    // alarm beacons (red) — always some, many while the power is out
    const beaconMat = own(new THREE.MeshBasicMaterial({ color: new THREE.Color(zone.alarm).multiplyScalar(1.8), toneMapped: false }));
    level.beaconMat = beaconMat;
    let nb = 0;
    for (const t of sim.tiles) {
      if (t.t !== "floor" || nb > 8) continue;
      for (const [d, [dc, dr]] of Object.entries(DIRS)) {
        if (tileKind(t.c + dc, t.r + dr) !== "wall" || hash(t.c * 11 + dc, t.r * 5 + dr) < 0.9) continue;
        if (sim.ents.some((e) => e.wall && e.c === t.c && e.r === t.r && e.dir === d)) continue;
        const b = new THREE.Mesh(kit.cylLo, beaconMat);
        b.scale.set(0.16, 0.12, 0.16);
        placeOnWall(b, t.c, t.r, d, WALL_H - 0.35);
        b.position.add(new THREE.Vector3(-dc * 0.1, 0, -dr * 0.1));
        group.add(b);
        level.sources.push({ pos: b.position.clone().add(new THREE.Vector3(-dc * 0.3, -0.2, -dr * 0.3)), color: zone.alarm, power: 6, on: () => true, alarm: true, flick: nb });
        nb++;
        break;
      }
    }
    // warning lamps (clues)
    for (const [c, r, d, colorKey] of L.lamps || []) {
      const lm = own(new THREE.MeshBasicMaterial({ color: new THREE.Color(COLORS[colorKey]).multiplyScalar(2), toneMapped: false }));
      const g = new THREE.Group();
      const cage = new THREE.Mesh(kit.box, kit.darkMetal);
      cage.scale.set(0.34, 0.34, 0.12);
      const bulb = new THREE.Mesh(kit.sphere, lm);
      bulb.scale.setScalar(0.24);
      bulb.position.z = -0.12;
      const gl = new THREE.Sprite(own(spriteMat(sprites.glow, COLORS[colorKey], 0.8)));
      gl.scale.setScalar(1.2);
      gl.position.z = -0.2;
      g.add(cage, bulb, gl);
      placeOnWall(g, c, r, d, 2.4);
      group.add(g);
      level.sources.push({ pos: g.position.clone().add(new THREE.Vector3(-DIRS[d][0] * 0.6, 0, -DIRS[d][1] * 0.6)), color: new THREE.Color(COLORS[colorKey]).getHex(), power: 5, on: () => true, steady: true });
    }

    // ---------------------------------------------------- devices
    const ctx = {
      own,
      wallMat,
      doorMats: {},
      faceMats: {},
      screen: (kind, tint, seed) => own(new THREE.MeshBasicMaterial({ map: own(screenTexture(kind, tint, seed)), toneMapped: false })),
      paper: (kind, seed) => own(new THREE.MeshStandardMaterial({ map: own(paperTexture(kind, seed)), roughness: 0.9 })),
      face(key) {
        return (this.faceMats[key] ??= own(new THREE.MeshBasicMaterial({ map: own(faceTexture(key, key)), toneMapped: false })));
      },
      door(key) {
        return (this.doorMats[key] ??= own(new THREE.MeshStandardMaterial({ map: own(doorTexture(KEY_COLOR[key] || "#c8ccd4", key === "secret" ? "#555" : "#f2c230")), roughness: 0.5, metalness: 0.4 })));
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

    /* ------------------------------------------------ exit lift */
    function buildExit(t, x, z) {
      let wallDir = "n";
      for (const d of ["n", "e", "s", "w"]) {
        const [dc, dr] = DIRS[d];
        if (!solidAt(t.c + dc, t.r + dr)) wallDir = OPPOSITE[d];
      }
      const g = new THREE.Group();
      const back = new THREE.Mesh(kit.box, kit.metal);
      back.scale.set(1.9, WALL_H, 0.1);
      back.position.set(0, WALL_H / 2, -0.95);
      const lightMat = own(new THREE.MeshBasicMaterial({ color: new THREE.Color(0x60ff90).multiplyScalar(1.4), toneMapped: false }));
      const strip = new THREE.Mesh(kit.box, lightMat);
      strip.scale.set(1.5, 0.06, 0.05);
      strip.position.set(0, WALL_H - 0.3, -0.88);
      const floorPad = new THREE.Mesh(kit.box, own(new THREE.MeshBasicMaterial({ color: new THREE.Color(0x30ff70).multiplyScalar(0.9), toneMapped: false, transparent: true, opacity: 0.4 })));
      floorPad.scale.set(1.6, 0.02, 1.6);
      floorPad.position.y = 0.02;
      const shaft = new THREE.Sprite(own(spriteMat(sprites.glow, 0x70ff9a, 0.35)));
      shaft.scale.set(2.2, 3.4, 1);
      shaft.position.set(0, 1.7, -0.2);
      g.add(back, strip, floorPad, shaft);
      g.position.set(x, 0, z);
      g.rotation.y = DIR_YAW[wallDir];
      group.add(g);
      level.sources.push({ pos: new THREE.Vector3(x, 2.2, z), color: 0x70ff9a, power: 9, on: () => true, steady: true });
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
    switch (e.t) {
      case "door": {
        const tA = sim.tileAt(e.c - 1, e.r),
          tB = sim.tileAt(e.c + 1, e.r);
        const spanX = tA && SOLID.has(tA.t) && tB && SOLID.has(tB.t);
        const mat = e.secret ? ctx.wallMat : ctx.door(e.key || (e.kind === "blast" ? "blast" : "plain"));
        const leaf = new THREE.Group();
        add(kit.box, mat, 2, WALL_H, 0.22, 0, WALL_H / 2, 0, leaf);
        g.add(leaf);
        if (!e.secret) {
          for (const s of [-1, 1]) add(kit.box, kit.darkMetal, 0.18, WALL_H, 0.5, s * 0.99, WALL_H / 2, 0);
          add(kit.box, kit.darkMetal, 2.1, 0.22, 0.5, 0, WALL_H - 0.11, 0);
        }
        const lightCol = new THREE.Color();
        const lampM = ctx.own(new THREE.MeshBasicMaterial({ color: 0xff3020, toneMapped: false }));
        if (!e.secret)
          for (const s of [-1, 1]) {
            add(kit.box, kit.darkMetal, 0.2, 0.3, 0.08, 0.75, 1.4, s * 0.3);
            add(kit.box, lampM, 0.1, 0.06, 0.02, 0.75, 1.5, s * 0.35);
          }
        g.rotation.y = spanX ? 0 : Math.PI / 2;
        g.position.set(x, 0, z);
        v.update = () => {
          leaf.position.y = e.open * (WALL_H - 0.15);
          const ok = e.open > 0 || (e.unlocked && !e.need) || (e.unlocked && e.need && e.need.every((k) => sim.sig(k)));
          lightCol.setHex(ok ? 0x30ff60 : e.key && !e.unlocked ? new THREE.Color(KEY_COLOR[e.key]).getHex() : 0xff3020).multiplyScalar(1.8);
          lampM.color.copy(lightCol);
        };
        break;
      }
      case "keypad": {
        mount(MOUNT.keypad.y);
        add(kit.box, kit.darkMetal, 0.36, 0.5, 0.06, 0, 0, -0.03);
        const scr = ctx.own(new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff3020).multiplyScalar(1.5), toneMapped: false }));
        add(kit.box, scr, 0.26, 0.08, 0.02, 0, 0.15, -0.065);
        for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) add(kit.box, kit.plastic, 0.06, 0.05, 0.02, -0.08 + j * 0.08, 0.04 - i * 0.07, -0.065);
        v.source = { color: 0xff3020, power: 1.2, on: () => true, y: MOUNT.keypad.y };
        v.update = () => {
          const ok = !!sim.keypads[e.id];
          const powered = !e.need || e.need.every((k) => sim.sig(k));
          scr.color.setHex(ok ? 0x30ff60 : powered ? 0xff3020 : 0x201010).multiplyScalar(1.5);
          v.source.color = ok ? 0x30ff60 : 0xff3020;
        };
        break;
      }
      case "panel": {
        mount(MOUNT.panel.y);
        add(kit.box, kit.darkMetal, 0.62, 0.62, 0.08, 0, 0, -0.04);
        const face = add(kit.plane, ctx.face(sim.locks[e.lock].symbols[e.cur]), 0.48, 0.48, 1, 0, 0, -0.085);
        face.rotation.y = Math.PI;
        const led = ctx.own(new THREE.MeshBasicMaterial({ color: 0xff3020, toneMapped: false }));
        add(kit.box, led, 0.06, 0.06, 0.02, 0, 0.36, -0.06);
        let shown = e.cur;
        v.update = () => {
          if (shown !== e.cur) {
            shown = e.cur;
            face.material = ctx.face(sim.locks[e.lock].symbols[e.cur]);
          }
          led.color.setHex(sim.locks[e.lock].solved ? 0x30ff60 : 0xff3020).multiplyScalar(1.6);
        };
        break;
      }
      case "switch": {
        if (e.hidden) {
          mount(MOUNT.hidden.y);
          const cover = new THREE.Group();
          add(kit.box, kit.darkMetal, 0.8, 0.6, 0.05, 0.4, 0, -0.03, cover);
          for (let i = 0; i < 5; i++) add(kit.box, kit.black, 0.6, 0.04, 0.02, 0.4, -0.2 + i * 0.1, -0.06, cover);
          cover.position.x = -0.4;
          g.add(cover);
          v.update = () => {
            cover.rotation.y = -e.anim * 1.4;
          };
        } else {
          mount(MOUNT.switch.y);
          add(kit.box, kit.yellow, 0.42, 0.6, 0.08, 0, 0, -0.04);
          add(kit.box, kit.darkMetal, 0.3, 0.46, 0.04, 0, 0, -0.09);
          const pivot = new THREE.Group();
          pivot.position.set(0, 0, -0.1);
          add(kit.box, kit.metal, 0.06, 0.32, 0.06, 0, 0.14, -0.04, pivot);
          add(kit.box, kit.red, 0.14, 0.08, 0.08, 0, 0.3, -0.04, pivot);
          g.add(pivot);
          const led = ctx.own(new THREE.MeshBasicMaterial({ color: 0xff3020, toneMapped: false }));
          add(kit.box, led, 0.05, 0.05, 0.02, 0.15, 0.24, -0.1);
          v.update = () => {
            pivot.rotation.x = 0.7 - e.anim * 1.4;
            const good = e.flip ? sim.sig(e.flip) : e.want === undefined ? e.on : e.on === e.want;
            led.color.setHex(e.on ? 0x30ff60 : 0xff3020).multiplyScalar(1.6);
            void good;
          };
        }
        break;
      }
      case "clue": {
        mount(MOUNT.clue.y);
        const k = e.kind || "note";
        if (k === "monitor") {
          add(kit.box, kit.darkMetal, 0.9, 0.62, 0.1, 0, 0, -0.05);
          const s = add(kit.plane, ctx.screen("graph", "#3aff9a", e.c * 7 + e.r), 0.8, 0.52, 1, 0, 0, -0.105);
          s.rotation.y = Math.PI;
          v.source = { color: 0x3aff9a, power: 1.6, on: () => true, y: MOUNT.clue.y };
        } else if (k === "log") {
          g.position.y -= 0.35;
          add(kit.box, kit.darkMetal, 0.36, 0.22, 0.12, 0, 0, -0.06);
          const led = add(kit.sphereLo, kit.glowRed, 0.05, 0.05, 0.05, 0.12, 0.06, -0.13);
          v.update = () => (led.visible = Math.sin(time * 6) > 0);
        } else {
          const w = k === "board" ? 1.3 : k === "poster" ? 0.7 : 0.45;
          const h = k === "board" ? 0.85 : k === "poster" ? 0.9 : 0.55;
          const p = add(kit.plane, ctx.paper(k, e.c * 3 + e.r), w, h, 1, 0, 0, -0.02);
          p.rotation.y = Math.PI;
        }
        break;
      }
      case "term": {
        const scrOk = ctx.screen("lines", "#3affc0", e.c + e.r * 9);
        const scrBad = ctx.screen("alarm", "#ff3020", 1);
        if (e.wall) {
          mount(MOUNT.term.y);
          add(kit.box, kit.plastic, 1.0, 0.7, 0.12, 0, 0, -0.06);
        } else {
          g.position.set(x, 0, z);
          add(kit.box, kit.plastic, 0.8, 1.0, 0.6, 0, 0.5, 0);
          g.position.y = 0.9;
        }
        const s = add(kit.plane, scrBad, 0.86, 0.56, 1, 0, 0.02, -0.125);
        s.rotation.y = Math.PI;
        add(kit.box, kit.darkMetal, 0.9, 0.06, 0.3, 0, -0.42, -0.18);
        v.source = { color: 0xff3020, power: 1.5, on: () => true, y: MOUNT.term.y };
        v.update = () => {
          const powered = !e.need || e.need.every((k) => sim.sig(k));
          s.material = e.fixed && powered ? scrOk : scrBad;
          s.visible = e.fixed ? powered || Math.sin(time * 9) > 0.6 : Math.sin(time * 3 + e.c) > -0.2;
          v.source.color = e.fixed && powered ? 0x3affc0 : 0xff3020;
        };
        break;
      }
      case "gen": {
        g.position.set(x, 0, z);
        add(kit.box, kit.darkMetal, 1.4, 1.3, 1.1, 0, 0.65, 0);
        add(kit.box, kit.yellow, 1.42, 0.12, 1.12, 0, 0.3, 0);
        const drum = add(kit.cyl, kit.metal, 0.9, 1.2, 0.9, 0, 0.75, 0);
        drum.rotation.z = Math.PI / 2;
        const fan = new THREE.Group();
        fan.position.set(0, 0.8, -0.58);
        for (let k = 0; k < 4; k++) {
          const b = add(kit.box, kit.metal, 0.08, 0.5, 0.02, 0, 0, 0, fan);
          b.rotation.z = (k * Math.PI) / 4;
        }
        g.add(fan);
        add(kit.torus, kit.darkMetal, 0.6, 0.6, 0.6, 0, 0.8, -0.57);
        const lampCol = COLORS[e.color] || "#ffb030";
        const lamp = ctx.own(new THREE.MeshBasicMaterial({ color: new THREE.Color(lampCol).multiplyScalar(0.4), toneMapped: false }));
        add(kit.sphere, lamp, 0.34, 0.34, 0.34, 0, 1.45, 0);
        add(kit.cylLo, kit.darkMetal, 0.4, 0.12, 0.4, 0, 1.33, 0);
        const fuseLed = ctx.own(new THREE.MeshBasicMaterial({ color: 0xff3020, toneMapped: false }));
        add(kit.box, fuseLed, 0.18, 0.1, 0.02, 0.45, 1.05, -0.56);
        v.source = { color: new THREE.Color(lampCol).getHex(), power: 3, on: () => true, y: 1.6 };
        v.update = (dt) => {
          fan.rotation.z += dt * (e.on ? 18 : 0);
          lamp.color.set(lampCol).multiplyScalar(e.on ? 2.2 : 0.5 + (Math.sin(time * 4) > 0 ? 0.3 : 0));
          fuseLed.color.setHex(e.filled ? 0x30ff60 : 0xff3020).multiplyScalar(1.6);
          v.source.power = e.on ? 5 : 1.4;
          g.position.x = x + (e.on ? Math.sin(time * 60) * 0.004 : 0);
        };
        break;
      }
      case "socket": {
        g.position.set(x, 0, z);
        add(kit.cyl, kit.darkMetal, 0.8, 1.0, 0.8, 0, 0.5, 0);
        add(kit.cyl, kit.glass, 0.7, 0.4, 0.7, 0, 1.2, 0);
        const slots = [];
        for (let k = 0; k < e.count; k++) {
          const m = ctx.own(new THREE.MeshBasicMaterial({ color: 0x302010, toneMapped: false }));
          const a = (k / e.count) * Math.PI * 2;
          slots.push(add(kit.cylLo, m, 0.1, 0.26, 0.1, Math.cos(a) * 0.18, 1.15, Math.sin(a) * 0.18));
        }
        v.source = { color: 0x9aff3a, power: 1, on: () => e.have > 0, y: 1.3 };
        v.update = () => slots.forEach((s, k) => s.material.color.setHex(k < e.have ? 0x9aff3a : 0x302010).multiplyScalar(k < e.have ? 1.8 : 1));
        break;
      }
      case "prism": {
        g.position.set(x, 0, z);
        add(kit.cyl, kit.darkMetal, 0.6, 1.0, 0.6, 0, 0.5, 0);
        add(kit.torus, kit.metal, 0.7, 0.7, 0.7, 0, BEAM_Y, 0).rotation.x = Math.PI / 2;
        const crystal = new THREE.Group();
        const cm = ctx.own(new THREE.MeshStandardMaterial({ color: 0xa0f0ff, emissive: 0x2090c0, emissiveIntensity: 0.6, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.85 }));
        add(kit.box, cm, 0.62, 0.5, 0.08, 0, 0, 0, crystal);
        crystal.position.y = BEAM_Y;
        g.add(crystal);
        v.update = () => {
          crystal.visible = !e.empty;
          // "/" (even) faces north-east, "\" (odd) faces north-west, seen on the map
          crystal.rotation.y = (e.rot % 2 === 0 ? Math.PI / 4 : -Math.PI / 4) + e.turn * (Math.PI / 2);
        };
        break;
      }
      case "receiver": {
        g.position.set(x, 0, z);
        add(kit.cyl, kit.darkMetal, 0.7, 1.7, 0.7, 0, 0.85, 0);
        const ring = ctx.own(new THREE.MeshBasicMaterial({ color: 0x103040, toneMapped: false }));
        add(kit.torus, ring, 0.8, 0.8, 0.8, 0, BEAM_Y, 0).rotation.x = Math.PI / 2;
        add(kit.sphere, ring, 0.38, 0.38, 0.38, 0, BEAM_Y, 0);
        v.source = { color: 0x60e0ff, power: 5, on: () => e.lit, y: BEAM_Y };
        v.update = () => ring.color.setHex(e.lit ? 0x80f0ff : 0x103040).multiplyScalar(e.lit ? 2 : 1);
        break;
      }
      case "emitter": {
        mount(BEAM_Y);
        add(kit.box, kit.darkMetal, 0.6, 0.6, 0.3, 0, 0, -0.15);
        const lens = ctx.own(new THREE.MeshBasicMaterial({ color: 0x102030, toneMapped: false }));
        add(kit.cylLo, lens, 0.26, 0.1, 0.26, 0, 0, -0.32).rotation.x = Math.PI / 2;
        v.update = () => lens.color.setHex(!e.need || e.need.every((k) => sim.sig(k)) ? 0x9af6ff : 0x102030).multiplyScalar(2);
        break;
      }
      case "node": {
        const isTube = e.kind === "tube";
        const m = ctx.own(new THREE.MeshBasicMaterial({ color: 0x8040c0, toneMapped: false }));
        if (e.wall) {
          mount(MOUNT.node.y);
          add(kit.box, kit.darkMetal, 0.6, 0.6, 0.2, 0, 0, -0.1);
          add(kit.octa, m, 0.36, 0.5, 0.36, 0, 0, -0.32);
        } else if (isTube) {
          g.position.set(x, 0, z);
          add(kit.cyl, kit.darkMetal, 0.9, 0.4, 0.9, 0, 0.2, 0);
          const tube = add(kit.cyl, kit.sac, 0.5, WALL_H - 0.4, 0.5, 0, WALL_H / 2, 0);
          add(kit.cyl, m, 0.2, WALL_H - 0.4, 0.2, 0, WALL_H / 2, 0);
          v.tube = tube;
        } else {
          g.position.set(x, 0, z);
          add(kit.cyl, kit.darkMetal, 0.7, 1.6, 0.7, 0, 0.8, 0);
          add(kit.octa, m, 0.5, 0.8, 0.5, 0, 1.95, 0);
          for (let k = 0; k < 3; k++) add(kit.torus, kit.metal, 0.75, 0.75, 0.75, 0, 0.5 + k * 0.4, 0).rotation.x = Math.PI / 2;
        }
        v.source = { color: 0xa060ff, power: 3, on: () => true, y: 1.8 };
        v.update = () => {
          const k = e.charged ? 0 : 1;
          m.color.setHex(e.charged ? (isTube ? 0x201008 : 0x60f0ff) : 0xa050ff).multiplyScalar(e.charged ? (isTube ? 1 : 2) : 1.2 + Math.sin(time * 4) * 0.4 * k);
          v.source.color = e.charged ? 0x60f0ff : 0xa060ff;
          v.source.power = isTube && e.charged ? 0 : 3;
          if (v.tube) v.tube.scale.y = e.charged ? 1.0 : WALL_H - 0.4 + Math.sin(time * 3) * 0.05;
        };
        break;
      }
      case "barrel": {
        g.position.set(x, 0, z);
        add(kit.cyl, kit.red, 0.72, 1.05, 0.72, 0, 0.53, 0);
        add(kit.cyl, kit.darkMetal, 0.74, 0.06, 0.74, 0, 0.3, 0);
        add(kit.cyl, kit.darkMetal, 0.74, 0.06, 0.74, 0, 0.8, 0);
        add(kit.box, kit.yellow, 0.3, 0.3, 0.02, 0, 0.6, -0.37);
        v.update = () => (g.visible = !e.gone);
        break;
      }
      case "item": {
        const def = ITEMS[e.item];
        const { group, own: om } = buildItem(kit, e.item, def);
        om.forEach((m) => ctx.own(m));
        g.add(group);
        const glow = new THREE.Sprite(ctx.own(spriteMat(sprites.glow, def.color, 0.55)));
        glow.scale.setScalar(0.9);
        g.add(glow);
        g.position.set(x, base, z);
        v.source = def.kind === "key" ? { color: new THREE.Color(def.color).getHex(), power: 1.2, on: () => !e.gone && !e.stashed, y: base + 0.8 } : null;
        v.update = () => {
          g.visible = !e.gone && !e.stashed;
          if (!g.visible) return;
          const [px, pz] = e.pos || cellCenter(e.c, e.r);
          const b = sim.tileAt(e.c, e.r)?.h || 0;
          g.position.set(px, b, pz);
          group.position.y = 0.55 + Math.sin(time * 2 + e.c) * 0.06;
          group.rotation.y = time * 1.2 + e.r;
          glow.position.y = group.position.y;
        };
        break;
      }
      case "locker": {
        const k = e.kind || "locker";
        g.position.set(x, 0, z);
        // face the open side
        let face = "s";
        for (const d of ["s", "n", "e", "w"]) if (!SOLID.has(sim.tileAt(e.c + DIRS[d][0], e.r + DIRS[d][1])?.t ?? "void")) face = d;
        for (const d of ["n", "s", "e", "w"]) if (SOLID.has(sim.tileAt(e.c - DIRS[d][0], e.r - DIRS[d][1])?.t ?? "void") && !SOLID.has(sim.tileAt(e.c + DIRS[d][0], e.r + DIRS[d][1])?.t ?? "void")) face = d;
        g.rotation.y = DIR_YAW[face];
        const door = new THREE.Group();
        if (k === "crate") {
          add(kit.box, kit.darkMetal, 1.0, 0.7, 0.8, 0, 0.35, 0);
          add(kit.box, kit.yellow, 1.02, 0.08, 0.82, 0, 0.5, 0);
          add(kit.box, kit.metal, 1.04, 0.08, 0.84, 0, 0.04, 0.42, door);
          door.position.set(0, 0.7, 0.42);
          door.children[0].position.set(0, 0.04, -0.42);
          g.add(door);
          v.update = () => (door.rotation.x = e.opened ? -1.2 : 0);
        } else if (k === "safe") {
          add(kit.box, kit.darkMetal, 0.8, 0.8, 0.7, 0, 0.9, 0);
          add(kit.box, kit.metal, 0.7, 0.7, 0.05, 0.35, 0, 0, door);
          add(kit.cylLo, kit.metal, 0.18, 0.06, 0.18, 0.5, 0, -0.04, door).rotation.x = Math.PI / 2;
          door.position.set(-0.35, 0.9, -0.36);
          g.add(door);
          v.update = () => (door.rotation.y = e.opened ? 1.6 : 0);
        } else {
          const bodyMat = k === "cabinet" ? kit.white : kit.metal;
          add(kit.box, bodyMat, 0.9, 2.0, 0.6, 0, 1.0, 0);
          add(kit.box, k === "cabinet" ? kit.white : kit.armorLight, 0.86, 1.9, 0.04, 0.43, 0, 0, door);
          if (k === "cabinet") {
            add(kit.box, kit.red, 0.3, 0.08, 0.02, 0.43, 0.3, -0.03, door);
            add(kit.box, kit.red, 0.08, 0.3, 0.02, 0.43, 0.3, -0.03, door);
          } else for (let i = 0; i < 3; i++) add(kit.box, kit.black, 0.4, 0.03, 0.02, 0.43, 0.7 - i * 0.06, -0.03, door);
          door.position.set(-0.43, 1.0, -0.31);
          g.add(door);
          v.update = () => (door.rotation.y += ((e.opened ? 1.7 : 0) - door.rotation.y) * 0.15);
        }
        if (e.key) {
          const led = ctx.own(new THREE.MeshBasicMaterial({ color: new THREE.Color(KEY_COLOR[e.key] || "#ffffff").multiplyScalar(1.6), toneMapped: false }));
          add(kit.box, led, 0.1, 0.1, 0.02, 0.3, 1.2, -0.32);
        }
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
    // decorations sit against the nearest wall
    let face = null;
    for (const d of ["n", "e", "s", "w"]) if (SOLID.has(sim.tileAt(e.c + DIRS[d][0], e.r + DIRS[d][1])?.t ?? "void")) face = d;
    const toWall = face ? DIR_YAW[OPPOSITE[face]] : hash(e.c, e.r) * 6.28;
    const splat = (kind) => {
      level.splats[kind] ??= ctx.own(new THREE.MeshStandardMaterial({ map: ctx.own(splatTexture(kind, e.c + e.r)), transparent: true, roughness: kind === "papers" ? 0.9 : 0.3, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
      const s = add(kit.plane, level.splats[kind], 1.6, 1.6, 1, 0, 0.012, 0);
      s.rotation.x = -Math.PI / 2;
      s.rotation.z = hash(e.r, e.c) * 6.28;
    };
    switch (e.kind) {
      case "blood":
      case "goo":
      case "papers":
        splat(e.kind);
        break;
      case "body": {
        splat("blood");
        const b = buildEnemy(kit, "worker");
        ctx.own(b.skin);
        b.root.rotation.set(-Math.PI / 2, 0, 0);
        b.root.position.y = 0.2;
        const holder = new THREE.Group();
        holder.add(b.root);
        holder.rotation.y = hash(e.c, e.r) * 6.28;
        g.add(holder);
        break;
      }
      case "desk":
        g.rotation.y = toWall;
        add(kit.box, kit.white, 1.6, 0.06, 0.8, 0, 0.78, 0.4);
        add(kit.box, kit.plastic, 0.5, 0.75, 0.7, -0.5, 0.38, 0.4);
        add(kit.box, kit.darkMetal, 0.5, 0.36, 0.06, 0.2, 1.05, 0.6);
        add(kit.box, ctx.screen("graph", "#5ab0ff", e.c), 0.44, 0.3, 0.01, 0.2, 1.05, 0.565);
        g.position.add(new THREE.Vector3(face ? DIRS[face][0] * 0.3 : 0, 0, face ? DIRS[face][1] * 0.3 : 0));
        break;
      case "bench":
        g.rotation.y = toWall;
        add(kit.box, kit.metal, 1.8, 0.06, 0.8, 0, 0.9, 0.5);
        add(kit.box, kit.darkMetal, 1.7, 0.86, 0.7, 0, 0.43, 0.5);
        for (let i = 0; i < 3; i++) add(kit.cylLo, kit.glass, 0.12, 0.28, 0.12, -0.5 + i * 0.4, 1.07, 0.4);
        add(kit.cylLo, kit.glowGreen, 0.08, 0.18, 0.08, -0.1, 1.03, 0.4);
        break;
      case "shelf":
        g.rotation.y = toWall;
        add(kit.box, kit.darkMetal, 1.6, 2.2, 0.5, 0, 1.1, 0.7);
        for (let i = 0; i < 4; i++) {
          add(kit.box, kit.metal, 1.6, 0.04, 0.5, 0, 0.3 + i * 0.55, 0.68);
          for (let j = 0; j < 4; j++) if (hash(e.c + i, e.r + j) > 0.4) add(kit.box, hash(i, j) > 0.5 ? kit.white : kit.plastic, 0.25, 0.3, 0.3, -0.55 + j * 0.37, 0.48 + i * 0.55, 0.66);
        }
        break;
      case "bed":
        g.rotation.y = toWall;
        add(kit.box, kit.metal, 0.9, 0.5, 1.9, 0, 0.25, 0.1);
        add(kit.box, kit.white, 0.86, 0.12, 1.86, 0, 0.56, 0.1);
        add(kit.box, kit.white, 0.6, 0.12, 0.35, 0, 0.66, 0.85);
        break;
      case "cart":
        add(kit.box, kit.metal, 0.8, 0.04, 0.5, 0, 0.9, 0);
        add(kit.box, kit.metal, 0.8, 0.04, 0.5, 0, 0.4, 0);
        for (const [a, b] of [
          [-0.36, -0.22],
          [0.36, -0.22],
          [-0.36, 0.22],
          [0.36, 0.22],
        ])
          add(kit.cylLo, kit.metal, 0.03, 0.9, 0.03, a, 0.45, b);
        add(kit.cylLo, kit.red, 0.12, 0.2, 0.12, 0.2, 1.02, 0);
        g.rotation.y = hash(e.c, e.r) * 3;
        break;
      case "servers": {
        g.rotation.y = toWall;
        add(kit.box, kit.darkMetal, 0.9, 2.3, 0.9, 0, 1.15, 0.5);
        const blink = [];
        for (let i = 0; i < 8; i++) {
          const m = i % 3 ? kit.glowGreen : kit.glowRed;
          blink.push(add(kit.box, m, 0.05, 0.03, 0.01, -0.3 + (i % 4) * 0.2, 0.6 + Math.floor(i / 4) * 0.9, 0.04));
        }
        level.views.set(`${e.id}:blink`, { obj: new THREE.Group(), e, update: () => blink.forEach((b, i) => (b.visible = Math.sin(time * (3 + i) + i * 2) > 0)) });
        break;
      }
      case "cryo":
        g.rotation.y = toWall;
        add(kit.capsule, kit.glass, 0.8, 1.0, 0.8, 0, 1.15, 0.4);
        add(kit.box, kit.darkMetal, 0.9, 0.3, 0.9, 0, 0.15, 0.4);
        add(kit.capsule, ctx.own(new THREE.MeshBasicMaterial({ color: 0x80d8ff, transparent: true, opacity: 0.25, depthWrite: false })), 0.7, 0.9, 0.7, 0, 1.15, 0.4);
        level.sources.push({ pos: new THREE.Vector3(x, 1.4, z), color: 0x80d8ff, power: 2.5, on: () => true, flick: 3 });
        break;
      case "pipes":
        g.rotation.y = toWall;
        for (let i = 0; i < 3; i++) add(kit.cyl, i === 1 ? kit.yellow : kit.metal, 0.16, WALL_H, 0.16, -0.4 + i * 0.4, WALL_H / 2, 0.85);
        break;
      case "crates":
        add(kit.box, kit.darkMetal, 0.9, 0.8, 0.9, -0.2, 0.4, 0.1);
        add(kit.box, kit.yellow, 0.7, 0.6, 0.7, 0.4, 0.3, -0.3);
        add(kit.box, kit.darkMetal, 0.6, 0.5, 0.6, -0.1, 1.05, 0.1);
        break;
      default:
        add(kit.box, kit.metal, 0.8, 0.8, 0.8, 0, 0.4, 0);
    }
  }

  /* ================================================================ enemies */
  function enemyView(en) {
    let ev = level.enemyViews.get(en.id);
    if (ev) return ev;
    const m = buildEnemy(kit, en.kind);
    level.group.add(m.root);
    ev = { ...m, en, fall: 0 };
    level.enemyViews.set(en.id, ev);
    return ev;
  }
  function updateEnemy(ev, en, dt, sim) {
    const { root, body, parts: P } = ev;
    if (en.state === "dormant") {
      root.visible = false;
      return;
    }
    root.visible = !(en.dead && en.deadT > 14);
    root.position.set(en.x, 0, en.z);
    root.rotation.y = en.yaw;
    const sp = Math.hypot(en.vx, en.vz);
    const ph = en.walk * (en.kind === "runner" ? 3.2 : en.def.boss ? 1.4 : 2.4);
    const sw = Math.min(1, sp / 1.5) * 0.7;
    if (en.emerge > 0) root.position.y = -en.emerge * en.def.h * 0.9;
    else root.position.y = 0;
    // hit flash
    ev.skin.emissive.setHex(en.hitT > 0 ? 0xff5030 : 0x000000);
    ev.skin.emissiveIntensity = en.hitT > 0 ? 1.4 : 0;
    if (en.dead) {
      ev.fall = Math.min(1, ev.fall + dt * 2.2);
      const k = 1 - (1 - ev.fall) ** 3;
      body.rotation.x = ev.baseRx + k * 1.35;
      body.position.y = ev.baseY * (1 - k * 0.7);
      if (P.legL) P.legL.rotation.x = k * 1.2;
      if (P.legR) P.legR.rotation.x = k * 1.0;
      if (P.armL) P.armL.rotation.x = -k * 2.4;
      if (P.armR) P.armR.rotation.x = -k * 2.0;
      if (P.shield) P.shield.visible = false;
      root.position.y = en.deadT > 9 ? -(en.deadT - 9) * 0.25 : 0;
      return;
    }
    ev.fall = 0;
    let lean = 0;
    let armRaise = 0;
    if (en.atk > 0) {
      const wind = en.kind === "runner" ? 0.28 : en.boss ? 0.55 : 0.42;
      const k = Math.min(1, en.atk / wind);
      armRaise = k < 0.8 ? k * 2.6 : 2.6 - (k - 0.8) * 10;
      lean = k * 0.25;
    }
    if (en.charge) lean = en.charge.t < 0.7 ? -0.2 : 0.5;
    if (en.stun > 0) lean = -0.3 + Math.sin(time * 12) * 0.05;
    body.rotation.x = ev.baseRx - lean;
    body.position.y = ev.baseY + Math.abs(Math.sin(ph)) * 0.05 * sw;
    body.rotation.z = Math.sin(ph) * 0.06 * sw + (en.hitT > 0 ? 0.12 : 0);
    if (P.legL) P.legL.rotation.x = Math.sin(ph) * sw;
    if (P.legR) P.legR.rotation.x = -Math.sin(ph) * sw;
    const reach = en.kind === "worker" ? 1.3 : en.kind === "runner" ? 0.4 : 0.2;
    if (P.armL) P.armL.rotation.x = -reach - armRaise - Math.sin(ph) * sw * 0.6 + Math.sin(time * 2 + en.x) * 0.05;
    if (P.armR) P.armR.rotation.x = -reach - armRaise * 0.9 + Math.sin(ph) * sw * 0.6 + Math.sin(time * 2.3 + en.z) * 0.05;
    if (P.armL2) P.armL2.rotation.x = -0.6 - armRaise * 0.6 + Math.sin(time * 3) * 0.3;
    if (P.armR2) P.armR2.rotation.x = -0.6 - armRaise * 0.6 - Math.sin(time * 3) * 0.3;
    if (P.head) P.head.rotation.y = Math.sin(time * 1.3 + en.x) * 0.25;
    if (P.sac) {
      const pulse = 1 + Math.sin(time * (en.spitT > 0 ? 18 : 3)) * (en.spitT > 0 ? 0.1 : 0.04);
      P.sac.scale.setScalar(pulse);
      P.sac.scale.multiply(new THREE.Vector3(en.kind === "hive" ? 1.6 : 0.95, en.kind === "hive" ? 1.4 : 0.85, en.kind === "hive" ? 1.5 : 0.9));
    }
    if (P.core) P.core.scale.setScalar(0.32 * 1.7 * (1 + Math.sin(time * 5) * 0.12));
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
  function spark(x, y, z, n = 5, speed = 3, color = 0xffd080) {
    for (let i = 0; i < n; i++) {
      const s = sparks.find((q) => q.life <= 0) || sparks[0];
      s.life = 0.25 + Math.random() * 0.2;
      s.s.material.color.setHex(color);
      s.s.position.set(x, y, z);
      s.v.set((Math.random() - 0.5) * speed, Math.random() * speed * 0.8, (Math.random() - 0.5) * speed);
      s.s.scale.setScalar(0.08 + Math.random() * 0.06);
      s.s.visible = true;
    }
  }
  function tracer(a, b, ion) {
    const t = tracers.find((q) => q.life <= 0) || tracers[0];
    tmpV.set(b[0] - a.x, b[1] - a.y, b[2] - a.z);
    const len = tmpV.length();
    if (len < 0.3) return;
    t.m.material = ion ? t.mc : t.my;
    t.m.quaternion.setFromUnitVectors(UP, tmpV.clone().normalize());
    t.m.position.set((a.x + b[0]) / 2, (a.y + b[1]) / 2, (a.z + b[2]) / 2);
    t.m.scale.set(ion ? 0.03 : 0.012, len, ion ? 0.03 : 0.012);
    t.m.visible = true;
    t.life = t.max = ion ? 0.18 : 0.05;
  }

  /** Simulation events the renderer reacts to (called by the UI per event). */
  function fx(e, sim) {
    if (!level) return;
    switch (e.type) {
      case "shot": {
        const w = weapons[e.weapon];
        vm.kick = Math.min(1.5, vm.kick + (e.weapon === "shotgun" ? 1.2 : e.weapon === "rifle" ? 0.45 : e.weapon === "ion" ? 0.9 : 0.7));
        vm.flashT = 0.05;
        w.flash.visible = true;
        w.flash.material.rotation = Math.random() * 6;
        muzzleLight.color.setHex(e.weapon === "ion" ? 0x60e0ff : 0xffc070);
        muzzleLight.intensity = e.weapon === "shotgun" ? 9 : 6;
        muzzleLight.position.copy(camera.position);
        // tracers start at the world-space muzzle (approximate: below-right of the eye)
        tmpV2.set(0.12, -0.1, -0.5).applyQuaternion(camera.quaternion).add(camera.position);
        e.to.forEach((p, i) => (e.weapon !== "shotgun" || i % 2 === 0) && tracer(tmpV2, p, e.weapon === "ion"));
        break;
      }
      case "impact":
        if (e.kind === "wall") {
          spark(e.x, e.y, e.z, 4, 2.5);
          puff(e.x, e.y, e.z, { color: 0x999999, size: 0.15, grow: 1.5, life: 0.6, alpha: 0.5 });
        } else if (e.kind === "armor") spark(e.x, e.y, e.z, 6, 3.5, 0xfff0c0);
        else puff(e.x, e.y, e.z, { color: 0x6a1010, size: 0.2, grow: 2.2, life: 0.5, alpha: 0.85, vy: -0.4 });
        break;
      case "kill":
        puff(e.x, 1, e.z, { color: 0x5a7a20, size: 0.5, grow: 3, life: 1.2, alpha: 0.7, vy: 0.2 });
        puff(e.x, 0.6, e.z, { color: 0x6a1010, size: 0.4, grow: 2.5, life: 1, alpha: 0.8, vy: -0.2 });
        if (e.boss) shake = Math.max(shake, 0.25);
        break;
      case "explode":
        fxLight.position.set(e.x, 1.2, e.z);
        fxLight.intensity = 40;
        fxLight.color.setHex(0xff8040);
        for (let i = 0; i < 6; i++) puff(e.x + (Math.random() - 0.5), 0.6 + Math.random(), e.z + (Math.random() - 0.5), { color: i < 3 ? 0xffa040 : 0x333333, size: 0.8, grow: 3, life: 1.2 + i * 0.1, alpha: 0.9, additive: i < 3, spread: 2 });
        spark(e.x, 0.8, e.z, 14, 8, 0xffb060);
        shake = Math.max(shake, 0.4);
        break;
      case "splash":
        puff(e.x, e.y, e.z, { color: 0x8aff30, size: 0.3, grow: 2, life: 0.5, alpha: 0.7, additive: true });
        break;
      case "nodeCharged":
        fxLight.position.set(...sim.entBox(sim.byId[e.id]).c);
        fxLight.intensity = 25;
        fxLight.color.setHex(0x60e0ff);
        spark(...sim.entBox(sim.byId[e.id]).c, 12, 5, 0x80f0ff);
        break;
      case "overload":
        spark(...sim.entBox(sim.byId[e.id]).c, 16, 6, 0x80c0ff);
        fxLight.position.set(...sim.entBox(sim.byId[e.id]).c);
        fxLight.intensity = 20;
        fxLight.color.setHex(0x80c0ff);
        break;
      case "hurt":
        shake = Math.max(shake, Math.min(0.2, e.amount / 120));
        break;
      case "crash":
        shake = Math.max(shake, 0.3);
        puff(e.x, 0.4, e.z, { color: 0x777777, size: 0.8, grow: 3, life: 1, spread: 2 });
        break;
      case "roar":
        shake = Math.max(shake, 0.12);
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
    const powered = level.powered();
    const dead = sim.state === "dead";
    const bobK = p.ground ? Math.min(1, p.speed / 4) : 0;
    shake = Math.max(0, shake - dt * 1.2);
    if (sim.escape && sim.state !== "complete") shake = Math.max(shake, 0.03);
    const sk = shake * shake * 0.6 + (sim.escape ? 0.015 : 0);
    camera.position.set(
      p.x + (Math.random() - 0.5) * sk,
      EYE + p.y + Math.sin(p.bob * 2) * 0.04 * bobK + (Math.random() - 0.5) * sk - (dead ? Math.min(1.2, sim.deadT * 1.4) : 0),
      p.z + (Math.random() - 0.5) * sk,
    );
    camera.rotation.set(p.pitch + p.kick, p.yaw, Math.sin(p.bob) * 0.006 * bobK + (dead ? Math.min(0.9, sim.deadT * 0.9) : 0));
    const fov = fovBase * (1 - 0.2 * p.aim);
    if (Math.abs(camera.fov - fov) > 0.01) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }

    // devices
    for (const v of level.views.values()) v.update(dt);
    // enemies
    for (const en of sim.enemies) updateEnemy(enemyView(en), en, dt, sim);

    // lasers & gas
    for (const lz of level.lasers) {
      const on = sim.laserOn(lz.t);
      lz.beams.forEach((b, i) => (b.visible = on && (Math.sin(time * 40 + i) > -0.95 || quality === "low")));
      lz.glow.visible = on;
    }
    for (const gz of level.gas) {
      const on = sim.gasOn(gz.t);
      for (const q of gz.ps) {
        q.s.visible = on;
        q.s.position.set(q.base.x + Math.sin(time * 0.4 + q.ph) * 0.3, q.base.y + Math.sin(time * 0.3 + q.ph) * 0.2, q.base.z + Math.cos(time * 0.35 + q.ph) * 0.3);
        q.s.material.rotation = time * 0.1 + q.ph;
      }
    }
    if (level.acid) level.acid.offset.set(time * 0.03, time * 0.02);

    // beams
    let bi = 0;
    for (const seg of sim.beams) {
      const [a, b, kind] = seg;
      tmpV.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      const len = tmpV.length();
      if (len < 1e-3) continue;
      const bm = beam(bi++);
      const q = new THREE.Quaternion().setFromUnitVectors(UP, tmpV.normalize());
      const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
      const f = 1 + Math.sin(time * 30 + bi) * 0.08;
      bm.core.position.set(...mid);
      bm.core.quaternion.copy(q);
      bm.core.scale.set(0.03, len, 0.03);
      bm.glow.position.set(...mid);
      bm.glow.quaternion.copy(q);
      bm.glow.scale.set(0.1 * f, len, 0.1 * f);
      bm.core.visible = bm.glow.visible = true;
      bm.spark.visible = kind !== "prism";
      bm.spark.position.set(...b);
      bm.spark.scale.setScalar(0.5 + Math.sin(time * 25 + bi) * 0.1);
    }
    for (let i = bi; i < beamPool.length; i++) beamPool[i].core.visible = beamPool[i].glow.visible = beamPool[i].spark.visible = false;

    // projectiles
    globs.forEach((g, i) => {
      const pr = sim.projectiles[i];
      g.visible = !!pr;
      if (pr) g.position.set(pr.x, pr.y, pr.z);
    });

    // focus marker
    if (sim.focus && sim.state === "play") {
      const bx = sim.entBox(sim.focus.ent);
      marker.visible = true;
      marker.position.set(bx.c[0], Math.min(bx.max[1] + 0.15, WALL_H - 0.3), bx.c[2]);
      marker.scale.setScalar(0.14 + Math.sin(time * 5) * 0.03);
      markerMat.color.setHex(sim.focus.locked ? 0xff7060 : 0x9affd0);
    } else marker.visible = false;

    // effects
    for (const t of tracers) {
      if (t.life <= 0) continue;
      t.life -= dt;
      t.m.material.opacity = Math.max(0, t.life / t.max) * 0.9;
      if (t.life <= 0) t.m.visible = false;
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
      s.v.y -= 9 * dt;
      s.s.position.addScaledVector(s.v, dt);
      if (s.life <= 0) s.s.visible = false;
    }
    muzzleLight.intensity = Math.max(0, muzzleLight.intensity - dt * 120);
    fxLight.intensity = Math.max(0, fxLight.intensity - dt * 60);

    // lights: nearest active sources
    level.lightT -= dt;
    if (level.lightT <= 0) {
      level.lightT = 0.2;
      const cands = [];
      for (const s of level.sources) if (s.on() && (!s.alarm || !powered || s.flick < 3)) cands.push(s);
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
      let fl = s.steady ? 1 : 0.9 + Math.sin(time * 7 + (s.flick || i)) * 0.06;
      if (s.lamp && s.bad) fl *= Math.sin(time * 23 + s.flick) > 0.7 || Math.sin(time * 3.1 + s.flick) > 0.95 ? 0.1 : 1;
      if (s.alarm) fl = 0.4 + 0.6 * Math.max(0, Math.sin(time * 4 + s.flick));
      l.intensity = s.power * fl;
    });
    // power state: ceiling lamps dark, alarm mood, while the power is out
    level.lampMat.color.set(level.zone.lamp).multiplyScalar(powered ? 1.1 + Math.sin(time * 50) * 0.04 : 0.05);
    const alarmPulse = 0.5 + 0.5 * Math.sin(time * 4);
    level.beaconMat.color.set(level.zone.alarm).multiplyScalar(0.6 + alarmPulse * 1.6);
    hemi.intensity = level.hemiBase * (powered ? 1 : 0.45);
    if (sim.escape && sim.state !== "complete") {
      hemi.color.setRGB(1, 0.35 + 0.25 * alarmPulse, 0.3);
      hemi.intensity = level.hemiBase * (0.8 + alarmPulse * 0.6);
    } else if (!powered) hemi.color.setRGB(1, 0.42 + 0.12 * alarmPulse, 0.38);
    else hemi.color.setHex(level.zone.ambient[0]);
    flashlight.intensity = dead ? 0 : powered ? 13 : 20;

    // exits glow
    for (const ex of level.exits) ex.shaft.material.opacity = 0.3 + Math.sin(time * 2) * 0.08;

    // spores drift around the camera
    if (quality === "high") {
      dust.visible = true;
      const a = dustGeo.attributes.position.array;
      for (let i = 0; i < DUST; i++) {
        const k = i * 3;
        const [ph, sp] = dustSeed[i];
        a[k] += Math.sin(time * 0.3 + ph) * dt * 0.08;
        a[k + 1] += (Math.sin(time * 0.2 + ph * 2) * 0.05 - 0.015 * sp) * dt;
        a[k + 2] += Math.cos(time * 0.25 + ph) * dt * 0.08;
        for (let j = 0; j < 3; j++) {
          const c = j === 1 ? 1.7 : j === 0 ? camera.position.x : camera.position.z;
          const half = j === 1 ? 1.7 : 7;
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
      wFlashLight.color.setHex(cur === "ion" ? 0x60e0ff : 0xffc070);
      const aim = p.aim;
      const def = WEAPONS[cur];
      const reloadK = p.reloadT > 0 ? Math.sin(Math.min(1, 1 - p.reloadT / (def.reload * sim.stats.reloadMul)) * Math.PI) : 0;
      const switchK = p.switchT > 0 ? p.switchT / 0.4 : 0;
      const sprint = p.sprint && p.speed > 3 ? 1 : 0;
      vm.swayX += (-0 - vm.swayX) * Math.min(1, dt * 8);
      const bobX = Math.cos(p.bob) * 0.012 * bobK * (1 - aim * 0.8);
      const bobY = Math.abs(Math.sin(p.bob)) * 0.012 * bobK * (1 - aim * 0.8);
      const gx = 0.17 * (1 - aim) + bobX;
      const gy = -0.17 + aim * 0.075 + bobY - reloadK * 0.16 - switchK * 0.32 - sprint * 0.05;
      const gz = -0.5 + vm.kick * 0.045 + aim * 0.08;
      w.group.position.set(gx, cur === "pistol" ? gy + 0.02 : gy, gz);
      w.group.rotation.set(vm.kick * 0.12 + reloadK * 0.6 - sprint * 0.4, aim > 0.5 ? 0 : 0.04 + sprint * 0.5, reloadK * 0.5);
      w.glow.forEach((m) => (m.visible = cur !== "ion" || p.mags.ion > 0));
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
    renderer.toneMappingExposure = q === "high" ? 1.0 : 1.1;
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
    [markerMat, tracerMatY, tracerMatC, beamCoreMat, beamGlowMat, dustMat, globMat].forEach((m) => m.dispose());
    tracers.forEach((t) => (t.my.dispose(), t.mc.dispose()));
    puffs.forEach((q) => q.s.material.dispose());
    sparks.forEach((q) => q.s.material.dispose());
    beamPool.forEach((b) => b.spark.material.dispose());
    Object.values(weapons).forEach((w) => w.flash.material.dispose());
    tracerGeo.dispose();
    beamGeo.dispose();
    dustGeo.dispose();
    envTex.dispose();
    pmrem.dispose();
    renderer.dispose();
    renderer.forceContextLoss?.();
    renderer.domElement.remove();
  }

  return { renderer, scene, camera, setLevel, render, resize, setFov, setQuality, fx, dispose, get quality() { return quality; } };
}
