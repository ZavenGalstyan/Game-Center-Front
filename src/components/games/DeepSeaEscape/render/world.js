/**
 * Deep Sea Escape: Abyss Facility — Three.js renderer. A level's static shell
 * (hull walls, deck plates, ceiling panels) is merged into three meshes with
 * baked corner shading and procedural bump maps; ocean windows, water
 * surfaces, containment fields, devices and mutants are small groups updated
 * from the simulation each frame. Lighting: a hemisphere tinted per sector,
 * the diver's helmet lamp, a pool of six point lights handed to the nearest
 * ceiling lamps / beacons / glowing devices (so the shader light count never
 * changes) and two flash lights for weapon fire and blasts. Underwater the
 * fog thickens and turns the water's colour, and bubbles rise. The weapon is
 * drawn in a second pass with its own camera so it never clips into walls. No
 * shadow maps, no post-processing; everything is disposed on level change
 * and unmount.
 */
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { CELL, WALL_H, EYE, DIRS, DIR_YAW, OPPOSITE, ZONES, WEAPONS, WEAPON_ORDER, cellCenter } from "../engine/constants.js";
import { BEAM_Y, MOUNT } from "../engine/sim.js";
import { ITEMS, COLORS } from "../engine/items.js";
import { wallTextures, floorTextures, ceilingTexture, doorTexture, screenTexture, gaugeTexture, keypadTexture, signTexture, oceanTexture, causticTexture, fieldTexture, crateTexture, spriteTexture, splatTexture } from "./textures.js";
import { createKit, buildEnemy, buildWeapon, buildItem, buildDish, buildTank, buildContainer, openContainer, buildConsole } from "./models.js";

const LIGHTS = 6;
const SOLID = new Set(["wall", "void", "pillar", "glass", "tube", "window"]);
const KEY_COLOR = { blueCard: "#3a9aff", redCard: "#ff4a4a", blackCard: "#e0e0f0" };
const BOLT = {
  pistol: { color: 0xffe0a0, size: 0.05 },
  harpoon: { color: 0xd8e8f0, size: 0.06 },
  pulse: { color: 0x5ad8ff, size: 0.14 },
  cannon: { color: 0xb07aff, size: 0.36 },
};
const SPIT = { drone: 0xff4030, warden: 0xff4030, spitter: 0x9aff3a, stalker: 0x3affc0, specimen: 0xff5a8a, leviathan: 0xb07aff };

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
  renderer.domElement.className = "dse-canvas";
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(78, 16 / 9, 0.05, 90);
  camera.rotation.order = "YXZ";
  scene.add(camera);
  let pmrem = new THREE.PMREMGenerator(renderer);
  let envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envTex;
  scene.environmentIntensity = 0.35;
  scene.fog = new THREE.FogExp2(0x0a1418, 0.05);
  scene.background = new THREE.Color(0x05090c);

  const hemi = new THREE.HemisphereLight(0xc8dcff, 0x1a1210, 0.42);
  scene.add(hemi);
  // the diver's helmet lamp: a cool spot that follows the view
  const handLight = new THREE.SpotLight(0xdff0ff, 16, 24, 0.7, 0.7, 1.4);
  handLight.position.set(0.2, 0.05, 0.1);
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
  wScene.add(new THREE.HemisphereLight(0xe0f0ff, 0x203040, 1.1));
  const wDir = new THREE.DirectionalLight(0xe8f4ff, 1.5);
  wDir.position.set(1, 2, 1);
  wScene.add(wDir);
  const wFlashLight = new THREE.PointLight(0xffc070, 0, 2, 1);
  wFlashLight.position.set(0.1, 0, -0.7);
  wScene.add(wFlashLight);
  wScene.environment = envTex;

  const kit = createKit();
  const sprites = { glow: spriteTexture("glow"), smoke: spriteTexture("smoke"), spark: spriteTexture("spark"), flash: spriteTexture("flash"), flame: spriteTexture("flame"), dust: spriteTexture("dust"), ring: spriteTexture("ring"), bubble: spriteTexture("bubble"), fish: spriteTexture("fish") };
  const spriteMat = (map, color, opacity = 1, additive = true) =>
    new THREE.SpriteMaterial({ map, color, transparent: true, opacity, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, fog: true });
  const markerMat = spriteMat(sprites.glow, 0xbff0ff, 0.9);
  const marker = new THREE.Sprite(markerMat);
  marker.scale.setScalar(0.16);
  marker.visible = false;
  scene.add(marker);
  const caustic = causticTexture(9);
  const fieldTex = fieldTexture();

  const weapons = {};
  const viewRoot = new THREE.Group();
  wScene.add(viewRoot);
  for (const id of WEAPON_ORDER) {
    const w = buildWeapon(kit, id);
    w.group.visible = false;
    w.group.scale.setScalar({ pistol: 0.9, harpoon: 0.72, pulse: 0.66, cannon: 0.72 }[id]);
    viewRoot.add(w.group);
    const fl = new THREE.Sprite(spriteMat(sprites.flash, BOLT[id].color, 1));
    fl.scale.setScalar(id === "cannon" ? 0.4 : id === "harpoon" ? 0.1 : 0.22);
    fl.position.copy(w.muzzle.position);
    fl.visible = false;
    w.group.add(fl);
    weapons[id] = { ...w, flash: fl };
  }

  /* ---------------------------------------------------- effect pools */
  const tracerGeo = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true);
  const beamTracerMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xb090ff).multiplyScalar(1.6), transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  const tracers = [];
  for (let i = 0; i < 10; i++) {
    const m = new THREE.Mesh(tracerGeo, beamTracerMat.clone());
    m.visible = false;
    scene.add(m);
    tracers.push({ m, life: 0, max: 0.2 });
  }
  // travelling shots: glow sprites, harpoons as meshes
  const bolts = [];
  for (let i = 0; i < 40; i++) {
    const s = new THREE.Sprite(spriteMat(sprites.glow, 0xffffff, 1));
    s.visible = false;
    scene.add(s);
    const harp = new THREE.Group();
    const shaft = new THREE.Mesh(kit.cylLo, kit.chrome);
    shaft.scale.set(0.02, 0.8, 0.02);
    shaft.rotation.x = Math.PI / 2;
    const tip = new THREE.Mesh(kit.cone4, kit.chrome);
    tip.scale.set(0.05, 0.12, 0.05);
    tip.rotation.x = -Math.PI / 2;
    tip.position.z = -0.44;
    harp.add(shaft, tip);
    harp.visible = false;
    scene.add(harp);
    bolts.push({ s, harp, life: 0, t: 0, dur: 0.1, a: new THREE.Vector3(), b: new THREE.Vector3(), kind: "pistol", trailT: 0 });
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
  const bubbleMat = spriteMat(sprites.bubble, 0xdff8ff, 0.75, false);
  const bubbles = [];
  for (let i = 0; i < 90; i++) {
    const s = new THREE.Sprite(bubbleMat);
    s.visible = false;
    scene.add(s);
    bubbles.push({ s, life: 0, v: new THREE.Vector3(), top: WALL_H, wob: Math.random() * 6 });
  }
  const rings = [];
  for (let i = 0; i < 6; i++) {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 48), new THREE.MeshBasicMaterial({ color: 0x60d0ff, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false }));
    m.rotation.x = -Math.PI / 2;
    m.visible = false;
    scene.add(m);
    rings.push({ m, life: 0, max: 0.6, r: 6 });
  }
  const globs = [];
  for (let i = 0; i < 30; i++) {
    const s = new THREE.Sprite(spriteMat(sprites.glow, 0xffffff, 1));
    s.scale.setScalar(0.5);
    s.visible = false;
    scene.add(s);
    const core = new THREE.Mesh(kit.sphereLo, kit.glowWhite);
    core.scale.setScalar(0.12);
    core.visible = false;
    scene.add(core);
    globs.push({ s, core });
  }
  const beamCoreMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff4040).multiplyScalar(2), toneMapped: false });
  const beamGlowMat = new THREE.MeshBasicMaterial({ color: 0xff3020, transparent: true, opacity: 0.32, depthWrite: false, blending: THREE.AdditiveBlending });
  const beamGeo = new THREE.CylinderGeometry(1, 1, 1, 10, 1, true);
  const beamPool = [];
  function beam(i) {
    if (!beamPool[i]) {
      const core = new THREE.Mesh(beamGeo, beamCoreMat);
      const glow = new THREE.Mesh(beamGeo, beamGlowMat);
      const spark = new THREE.Sprite(spriteMat(sprites.glow, 0xff6050, 0.9));
      scene.add(core, glow, spark);
      beamPool[i] = { core, glow, spark };
    }
    return beamPool[i];
  }

  // marine snow / dust motes drifting around the camera
  const DUST = 300;
  const dustGeo = new THREE.BufferGeometry();
  const dustPos = new Float32Array(DUST * 3);
  for (let i = 0; i < DUST * 3; i++) dustPos[i] = (Math.random() - 0.5) * 16;
  dustGeo.setAttribute("position", new THREE.BufferAttribute(dustPos, 3));
  const dustMat = new THREE.PointsMaterial({ size: 0.04, map: sprites.dust, transparent: true, opacity: 0.5, depthWrite: false, color: 0xcfefff, blending: THREE.AdditiveBlending });
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
  const fogDry = new THREE.Color();
  const fogWet = new THREE.Color();

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
    level = { L, zone, group, disposables, views: new Map(), enemyViews: new Map(), sources: [], lasers: [], gas: [], spikes: [], flames: [], exits: [], waters: [], fields: [], oceans: [], fish: [], beacons: [], lightT: 0, sim, mats: {} };

    fogDry.setHex(zone.fog);
    fogWet.setHex(zone.water).multiplyScalar(0.55);
    scene.fog.color.copy(fogDry);
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
    const wallMat = own(new THREE.MeshStandardMaterial({ map: wt.map, bumpMap: hi ? wt.bump : null, bumpScale: 1.6, roughness: 0.55, metalness: 0.45, vertexColors: true, side: THREE.DoubleSide }));
    const floorMat = own(new THREE.MeshStandardMaterial({ map: ft.map, bumpMap: hi ? ft.bump : null, bumpScale: 1.2, roughness: 0.6, metalness: 0.5, vertexColors: true, side: THREE.DoubleSide }));
    const ceilMat = own(new THREE.MeshStandardMaterial({ map: ceilMap, roughness: 0.7, metalness: 0.4, vertexColors: true, side: THREE.DoubleSide }));
    level.wallMat = wallMat;
    const plateMat = own(new THREE.MeshStandardMaterial({ map: wt.map, color: 0xc8d0d8, roughness: 0.5, metalness: 0.5 }));
    const trimMat = own(new THREE.MeshStandardMaterial({ color: new THREE.Color(`rgb(${zone.trim.join(",")})`), roughness: 0.4, metalness: 0.4 }));
    const accentGlow = own(new THREE.MeshBasicMaterial({ color: new THREE.Color(zone.light).multiplyScalar(1.5), toneMapped: false }));
    level.mats = { plateMat, trimMat, accentGlow };

    const tileKind = (c, r) => sim.tileAt(c, r)?.t ?? "void";
    const solidAt = (c, r) => SOLID.has(tileKind(c, r));
    const windowSet = new Set((L.windows || []).map(([c, r]) => `${c},${r}`));
    for (const t of sim.tiles) if (t.t === "window") windowSet.add(`${t.c},${t.r}`);
    const isWindow = (c, r) => windowSet.has(`${c},${r}`);

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
      return [1, 0.84, 0.68, 0.55, 0.55][k];
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
    const windowFaces = [];
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
          if (isWindow(c + dc, r + dr)) {
            windowFaces.push({ c, r, d, pts });
            // keep a lower and upper strip of hull around the window
            quad("wall", [pts[0], 0, pts[1], pts[2], 0, pts[3], pts[2], 0.7, pts[3], pts[0], 0.7, pts[1]], [-dc, 0, -dr], [0, 0.86, 0.5, 0.86, 0.5, 0.72, 0, 0.72], [0.5, 0.5, 0.6, 0.6]);
            quad("wall", [pts[0], 3.1, pts[1], pts[2], 3.1, pts[3], pts[2], WALL_H, pts[3], pts[0], WALL_H, pts[1]], [-dc, 0, -dr], [0, 0.14, 0.5, 0.14, 0.5, 0, 0, 0], [0.9, 0.9, 0.98, 0.98]);
            continue;
          }
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

    // ---------------------------------------------------- ocean windows
    const oceanMap = own(oceanTexture(zone, L.id));
    const oceanMat = own(new THREE.MeshBasicMaterial({ map: oceanMap, fog: false }));
    const fishMat = own(spriteMat(sprites.fish, 0x000000, 0.85, false));
    const fishMatGlow = own(spriteMat(sprites.glow, 0x6af0ff, 0.6));
    for (const wf of windowFaces) {
      const { c, r, d } = wf;
      const g = new THREE.Group();
      placeOnWall(g, c, r, d, 0);
      // the view: ocean plane pushed back into the wall cell, glass in front, a heavy frame
      const ocean = new THREE.Mesh(kit.plane, oceanMat);
      ocean.scale.set(CELL, 2.4, 1);
      ocean.position.set(0, 1.9, 1.6);
      ocean.rotation.y = Math.PI;
      const glass = new THREE.Mesh(kit.plane, kit.glass);
      glass.scale.set(CELL - 0.1, 2.4, 1);
      glass.position.set(0, 1.9, 0.02);
      glass.rotation.y = Math.PI;
      g.add(ocean, glass);
      // tunnel sides so the recess reads as thick glass in a hull
      for (const s of [-1, 1]) {
        const side = new THREE.Mesh(kit.box, plateMat);
        side.scale.set(0.12, 2.4, 1.6);
        side.position.set(s * (CELL / 2 - 0.06), 1.9, 0.8);
        g.add(side);
      }
      for (const y of [0.7, 3.1]) {
        const bar = new THREE.Mesh(kit.box, trimMat);
        bar.scale.set(CELL, 0.12, 0.2);
        bar.position.set(0, y, -0.04);
        g.add(bar);
      }
      const mid = new THREE.Mesh(kit.box, kit.steelDark);
      mid.scale.set(0.08, 2.4, 0.1);
      mid.position.set(0, 1.9, -0.02);
      g.add(mid);
      group.add(g);
      level.oceans.push(ocean);
      // fish swimming past (silhouettes and a glowing jelly now and then)
      const [dx, dz] = DIRS[d];
      for (let k = 0; k < 2; k++) {
        const glowy = hash(c * 3 + k, r) > 0.75;
        const f = new THREE.Sprite(glowy ? fishMatGlow : fishMat);
        const sc = 0.3 + hash(c + k, r * 3) * 0.6;
        f.scale.set(sc * (glowy ? 0.6 : 1.4), sc * 0.6, 1);
        group.add(f);
        const [cx, cz] = cellCenter(c, r);
        level.fish.push({ f, base: new THREE.Vector3(cx + dx * (CELL / 2 + 0.6 + hash(k, c) * 0.9), 1.2 + hash(r, k * 7) * 1.6, cz + dz * (CELL / 2 + 0.6 + hash(k, c) * 0.9)), along: dx ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0), ph: hash(c, r + k) * 30, sp: 0.15 + hash(k, r) * 0.25 });
      }
      const [wx, wz] = cellCenter(c, r);
      level.sources.push({ pos: new THREE.Vector3(wx - dx * 0.4, 2, wz - dz * 0.4), color: zone.water, power: 3, on: () => true, steady: true });
    }

    // ---------------------------------------------------- water
    const waterMat = own(
      new THREE.MeshStandardMaterial({ color: new THREE.Color(zone.water).multiplyScalar(1.3), roughness: 0.08, metalness: 0.3, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide, emissive: new THREE.Color(zone.water), emissiveMap: caustic, emissiveIntensity: 0.5 }),
    );
    level.waterMat = waterMat;
    const fieldMat = own(new THREE.MeshBasicMaterial({ color: new THREE.Color(0x60d8ff), map: fieldTex, transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, toneMapped: false }));
    const fieldTint = own(new THREE.MeshBasicMaterial({ color: new THREE.Color(zone.water).multiplyScalar(0.8), transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide }));
    level.fieldMat = fieldMat;
    const wetTiles = sim.tiles.filter((t) => t.wl0 > 0 && !SOLID.has(t.t));
    for (const t of wetTiles) {
      const [x, z] = cellCenter(t.c, t.r);
      const surf = new THREE.Mesh(kit.plane, waterMat);
      surf.rotation.x = -Math.PI / 2;
      surf.scale.set(CELL, CELL, 1);
      surf.position.set(x, Math.min(t.wl, WALL_H - 0.03), z);
      group.add(surf);
      level.waters.push({ t, surf });
      // containment fields on the edges toward drier cells
      for (const [dc, dr] of Object.values(DIRS)) {
        const n = sim.tileAt(t.c + dc, t.r + dr);
        if (!n || SOLID.has(n.t)) continue;
        if (n.wl0 >= t.wl0) continue;
        const fg = new THREE.Group();
        const pane = new THREE.Mesh(kit.plane, fieldMat);
        const tint = new THREE.Mesh(kit.plane, fieldTint);
        fg.add(tint, pane);
        fg.position.set(x + dc * (CELL / 2), 0, z + dr * (CELL / 2));
        fg.rotation.y = dc ? Math.PI / 2 : 0;
        group.add(fg);
        level.fields.push({ t, n, fg, pane, tint });
      }
      // a few drifting bubbles in deep water
      if (t.wl0 > 1.2 && hash(t.c, t.r * 3) > 0.6) level.flames.push({ bubbleSrc: true, x, z, t, ph: hash(t.r, t.c) * 5 });
    }

    // ---------------------------------------------------- special tiles
    const steamMat = own(spriteMat(sprites.flame, 0xe8f4ff, 0.5, false));
    const toxicMat = own(spriteMat(sprites.smoke, 0x8aff70, 0.32, false));
    const toxicMat2 = own(spriteMat(sprites.smoke, 0x40c0a0, 0.22, false));
    const laserMat = own(new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff2a20).multiplyScalar(2), toneMapped: false }));
    const laserGlow = own(new THREE.MeshBasicMaterial({ color: 0xff2010, transparent: true, opacity: 0.3, depthWrite: false, blending: THREE.AdditiveBlending }));
    for (const t of sim.tiles) {
      const [x, z] = cellCenter(t.c, t.r);
      if (t.t === "pillar") {
        const p = new THREE.Group();
        const shaft = new THREE.Mesh(kit.box, plateMat);
        shaft.scale.set(1.0, WALL_H, 1.0);
        shaft.position.y = WALL_H / 2;
        p.add(shaft);
        for (const y of [0.15, WALL_H - 0.2]) {
          const b = new THREE.Mesh(kit.box, kit.steelDark);
          b.scale.set(1.25, 0.3, 1.25);
          b.position.y = y;
          p.add(b);
        }
        const stripe = new THREE.Mesh(kit.box, trimMat);
        stripe.scale.set(1.04, 0.14, 1.04);
        stripe.position.y = 1.3;
        p.add(stripe);
        for (let k = 0; k < 3; k++) {
          const pipe = new THREE.Mesh(kit.cyl, kit.steel);
          pipe.scale.set(0.12, WALL_H, 0.12);
          pipe.position.set(0.58, WALL_H / 2, -0.3 + k * 0.3);
          p.add(pipe);
        }
        const lamp = new THREE.Mesh(kit.box, accentGlow);
        lamp.scale.set(0.5, 0.08, 1.02);
        lamp.position.y = 2.4;
        p.add(lamp);
        p.position.set(x, 0, z);
        group.add(p);
      } else if (t.t === "glass") {
        const g = new THREE.Group();
        const ns = solidAt(t.c, t.r - 1) || solidAt(t.c, t.r + 1);
        const pane = new THREE.Mesh(kit.box, kit.glass);
        pane.scale.set(ns ? 0.06 : CELL, WALL_H, ns ? CELL : 0.06);
        pane.position.y = WALL_H / 2;
        g.add(pane);
        for (const s of [-1, 1]) {
          const post = new THREE.Mesh(kit.box, kit.steelDark);
          post.scale.set(0.12, WALL_H, 0.12);
          post.position.set(ns ? 0 : s * 0.94, WALL_H / 2, ns ? s * 0.94 : 0);
          g.add(post);
        }
        const rail = new THREE.Mesh(kit.box, kit.steelDark);
        rail.scale.set(ns ? 0.12 : CELL, 0.12, ns ? CELL : 0.12);
        rail.position.y = 1.0;
        g.add(rail);
        g.position.set(x, 0, z);
        group.add(g);
      } else if (t.t === "tube") {
        const liquid = own(kit.liquid.clone());
        liquid.color.setHex([0x2ad0a0, 0x7a5aff, 0xff5a8a][Math.floor(hash(t.c, t.r) * 3)]);
        liquid.emissive.copy(liquid.color).multiplyScalar(0.3);
        const tank = buildTank(kit, liquid, t.c + t.r);
        tank.position.set(x, 0, z);
        group.add(tank);
        level.sources.push({ pos: new THREE.Vector3(x, 1.8, z), color: liquid.color.getHex(), power: 3, on: () => true, steady: true });
      } else if (t.h && t.raised) {
        let o;
        if (t.raised === "ledge") {
          o = new THREE.Group();
          const top = new THREE.Mesh(kit.box, plateMat);
          top.scale.set(CELL * 0.98, t.h, CELL * 0.98);
          top.position.y = t.h / 2;
          const edgeStripe = new THREE.Mesh(kit.box, kit.yellow);
          edgeStripe.scale.set(CELL * 0.99, 0.05, CELL * 0.99);
          edgeStripe.position.y = t.h - 0.02;
          o.add(top, edgeStripe);
          o.position.set(x, 0, z);
        } else if (t.raised === "desk") {
          o = new THREE.Group();
          const top = new THREE.Mesh(kit.box, kit.white);
          top.scale.set(1.7, 0.08, 1.2);
          top.position.y = t.h - 0.04;
          const base = new THREE.Mesh(kit.box, kit.steelDark);
          base.scale.set(1.5, t.h - 0.08, 1.0);
          base.position.y = (t.h - 0.08) / 2;
          o.add(top, base);
          o.position.set(x, 0, z);
        } else {
          // collapsed ceiling panels and girders
          o = new THREE.Group();
          for (let k = 0; k < 5; k++) {
            const pl = new THREE.Mesh(kit.box, k % 2 ? plateMat : kit.steelDark);
            pl.scale.set(1.4 + hash(k, t.c) * 0.5, 0.1, 0.9 + hash(t.r, k) * 0.4);
            pl.position.set((hash(t.c, t.r + k) - 0.5) * 0.6, 0.2 + k * 0.2, (hash(t.c * 3 + k, t.r) - 0.5) * 0.6);
            pl.rotation.set(hash(k, t.c) - 0.5, hash(t.r, k) * 3, hash(k * 3, t.r) - 0.5);
            o.add(pl);
          }
          const girder = new THREE.Mesh(kit.box, kit.gunmetal);
          girder.scale.set(0.2, 0.25, 2.2);
          girder.position.set(0, 0.7, 0);
          girder.rotation.set(0.4, hash(t.c, t.r) * 3, 0);
          o.add(girder);
          o.position.set(x, 0, z);
        }
        group.add(o);
      } else if (t.t === "spikes") {
        // exposed live cables over a grate: they spark while energised
        const pit = new THREE.Mesh(kit.box, kit.steelDark);
        pit.scale.set(CELL, 0.02, CELL);
        pit.position.set(x, 0.01, z);
        group.add(pit);
        const holder = new THREE.Group();
        for (let k = 0; k < 4; k++) {
          const cable = new THREE.Mesh(kit.cylLo, kit.rubber);
          cable.scale.set(0.06, CELL * 0.95, 0.06);
          cable.rotation.z = Math.PI / 2;
          cable.rotation.y = (k - 1.5) * 0.4;
          cable.position.set(0, 0.06, (k - 1.5) * 0.4);
          holder.add(cable);
        }
        const arc = new THREE.Sprite(own(spriteMat(sprites.spark, 0x9ad8ff, 1)));
        arc.scale.setScalar(1.2);
        arc.position.y = 0.2;
        holder.add(arc);
        holder.position.set(x, 0, z);
        group.add(holder);
        level.spikes.push({ t, holder, arc });
        level.sources.push({ pos: new THREE.Vector3(x, 0.5, z), color: 0x80c0ff, power: 4, on: () => sim.spikesOn(t), flick: hash(t.c, t.r) * 9 });
      } else if (t.t === "laser") {
        const steam = t.color === "steam";
        const across = solidAt(t.c - 1, t.r) && solidAt(t.c + 1, t.r) ? "x" : solidAt(t.c, t.r - 1) && solidAt(t.c, t.r + 1) ? "z" : "x";
        const lg = new THREE.Group();
        const jets = [];
        for (const s of [-1, 1]) {
          const post = new THREE.Mesh(kit.box, kit.steelDark);
          post.scale.set(across === "x" ? 0.14 : 0.3, steam ? 0.4 : WALL_H - 0.4, across === "x" ? 0.3 : 0.14);
          post.position.set(across === "x" ? s * 0.92 : 0, steam ? 0.2 : (WALL_H - 0.4) / 2, across === "z" ? s * 0.92 : 0);
          lg.add(post);
        }
        if (steam) {
          for (let k = 0; k < 6; k++) {
            const f = new THREE.Sprite(steamMat);
            const off = -0.7 + k * 0.28;
            f.position.set(across === "x" ? off : (hash(k, t.c) - 0.5) * 0.3, 0.7 + (k % 3) * 0.5, across === "z" ? off : (hash(t.r, k) - 0.5) * 0.3);
            f.scale.set(0.8, 1.4, 1);
            lg.add(f);
            jets.push({ f, ph: hash(k, t.r) * 6, base: f.position.y });
          }
        } else {
          for (let k = 0; k < 5; k++) {
            const y = 0.35 + k * 0.55;
            const core = new THREE.Mesh(kit.cylLo, laserMat);
            core.scale.set(0.02, CELL * 0.9, 0.02);
            core.rotation.z = Math.PI / 2;
            if (across === "z") core.rotation.set(Math.PI / 2, 0, 0);
            core.position.y = y;
            const glow = new THREE.Mesh(kit.cylLo, laserGlow);
            glow.scale.set(0.08, CELL * 0.9, 0.08);
            glow.rotation.copy(core.rotation);
            glow.position.y = y;
            lg.add(core, glow);
            jets.push({ f: core, glow, laser: true });
          }
        }
        lg.position.set(x, 0, z);
        group.add(lg);
        level.lasers.push({ t, jets, steam });
        level.sources.push({ pos: new THREE.Vector3(x, 1.2, z), color: steam ? 0xc8e0ff : 0xff3020, power: steam ? 3 : 5, on: () => sim.laserOn(t), flick: hash(t.c, t.r) * 9 });
      } else if (t.t === "gas") {
        const ps = [];
        for (let k = 0; k < 4; k++) {
          const s = new THREE.Sprite(k % 2 ? toxicMat2 : toxicMat);
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
    // puddles and grime decals
    const puddleMat = own(new THREE.MeshStandardMaterial({ map: own(splatTexture("30,70,80", L.id)), transparent: true, roughness: 0.05, metalness: 0.4, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
    for (const t of sim.tiles) {
      if (t.t !== "floor" || t.h || t.wl0 || hash(t.c * 5, t.r * 11) < 0.84) continue;
      const s = new THREE.Mesh(kit.plane, puddleMat);
      s.rotation.x = -Math.PI / 2;
      s.rotation.z = hash(t.r, t.c) * 6;
      s.scale.setScalar(1.4 + hash(t.c, t.r) * 0.8);
      const [x, z] = cellCenter(t.c, t.r);
      s.position.set(x, 0.01, z);
      group.add(s);
    }
    // ceiling lamps (and red emergency beacons in damaged sectors)
    const lampMat = own(new THREE.MeshBasicMaterial({ color: new THREE.Color(zone.lamp).multiplyScalar(1.4), toneMapped: false }));
    const beaconMat = own(new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff3020).multiplyScalar(1.8), toneMapped: false }));
    for (const t of sim.tiles) {
      if (t.t !== "floor" && t.t !== "exit") continue;
      if (hash(t.c * 7, t.r * 5) < 0.82 || t.wl0 >= WALL_H - 0.1) continue;
      const [x, z] = cellCenter(t.c, t.r);
      const lamp = new THREE.Mesh(kit.box, lampMat);
      lamp.scale.set(1.2, 0.06, 0.3);
      lamp.position.set(x, WALL_H - 0.04, z);
      lamp.rotation.y = hash(t.c, t.r) > 0.5 ? Math.PI / 2 : 0;
      const housing = new THREE.Mesh(kit.box, kit.steelDark);
      housing.scale.set(1.3, 0.08, 0.4);
      housing.position.set(x, WALL_H - 0.01, z);
      housing.rotation.y = lamp.rotation.y;
      group.add(housing, lamp);
      const flick = hash(t.r, t.c) > 0.8 && zone.emergency;
      level.sources.push({ pos: new THREE.Vector3(x, WALL_H - 0.5, z), color: zone.lamp, power: 7, on: () => true, flick: hash(t.r, t.c) * 10, broken: flick, lamp });
    }
    if (zone.emergency || L.escape) {
      for (const t of sim.tiles) {
        if (t.t !== "floor" || hash(t.c * 13, t.r * 3) < 0.9) continue;
        for (const [d, [dc, dr]] of Object.entries(DIRS)) {
          if (tileKind(t.c + dc, t.r + dr) !== "wall" || isWindow(t.c + dc, t.r + dr)) continue;
          if (sim.ents.some((e) => e.wall && e.c === t.c && e.r === t.r && e.dir === d)) continue;
          const g = new THREE.Group();
          const base = new THREE.Mesh(kit.cyl, kit.steelDark);
          base.scale.set(0.16, 0.06, 0.16);
          base.rotation.x = Math.PI / 2;
          base.position.z = -0.03;
          const dome = new THREE.Mesh(kit.sphere, beaconMat);
          dome.scale.set(0.14, 0.14, 0.1);
          dome.position.z = -0.08;
          g.add(base, dome);
          placeOnWall(g, t.c, t.r, d, 2.9);
          group.add(g);
          level.sources.push({ pos: g.position.clone().add(new THREE.Vector3(-dc * 0.4, 0, -dr * 0.4)), color: 0xff2a10, power: 6, on: () => true, beacon: true, flick: hash(t.c, t.r) * 6 });
          break;
        }
      }
    }

    // ---------------------------------------------------- devices
    const ctx = {
      own,
      wallMat,
      plateMat,
      trimMat,
      screens: {},
      doorMats: {},
      screen(kind, tint, seed) {
        const k = `${kind}:${tint}:${seed}`;
        return (this.screens[k] ??= own(new THREE.MeshBasicMaterial({ map: own(screenTexture(kind, tint, seed)), toneMapped: false })));
      },
      door(kind) {
        return (this.doorMats[kind] ??= own(new THREE.MeshStandardMaterial({ map: own(doorTexture(zone, kind)), roughness: 0.45, metalness: 0.6 })));
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

    /* ------------------------------------------------ exit: lift / escape hatch / submarine */
    function buildExit(t, x, z) {
      let wallDir = "n";
      for (const d of ["n", "e", "s", "w"]) {
        const [dc, dr] = DIRS[d];
        if (!solidAt(t.c + dc, t.r + dr)) wallDir = OPPOSITE[d];
      }
      const g = new THREE.Group();
      const ringMat = own(new THREE.MeshBasicMaterial({ color: new THREE.Color(0x5affb0).multiplyScalar(1.6), toneMapped: false }));
      const pad = new THREE.Mesh(kit.disc, kit.steelDark);
      pad.scale.set(1.8, 0.06, 1.8);
      pad.position.y = 0.03;
      const ring = new THREE.Mesh(kit.ring, ringMat);
      ring.scale.set(1.7, 1.7, 3);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.07;
      g.add(pad, ring);
      if (L.escape) {
        // the escape submarine's docking hatch with the sub's hull above
        const hull = new THREE.Mesh(kit.capsule, kit.yellow);
        hull.scale.set(1.4, 1.2, 1.4);
        hull.rotation.z = Math.PI / 2;
        hull.position.set(0, 2.9, 0.6);
        const port = new THREE.Mesh(kit.sphere, kit.glowCyan);
        port.scale.set(0.3, 0.3, 0.1);
        port.position.set(0, 2.9, -0.15);
        const hatch = new THREE.Mesh(kit.cyl, kit.steel);
        hatch.scale.set(0.9, 0.9, 0.9);
        hatch.position.y = 2.25;
        g.add(hull, port, hatch);
      } else {
        // lift frame with a light column
        for (const s of [-1, 1]) {
          const post = new THREE.Mesh(kit.box, kit.steelDark);
          post.scale.set(0.2, WALL_H, 0.2);
          post.position.set(s * 0.9, WALL_H / 2, -0.9);
          g.add(post);
        }
        const top = new THREE.Mesh(kit.box, trimMat);
        top.scale.set(2.0, 0.25, 0.3);
        top.position.set(0, WALL_H - 0.3, -0.9);
        g.add(top);
      }
      const shaft = new THREE.Sprite(own(spriteMat(sprites.glow, 0x7affc0, 0.35)));
      shaft.scale.set(2.2, 3.4, 1);
      shaft.position.set(0, 1.2, 0);
      g.add(shaft);
      g.position.set(x, 0, z);
      g.rotation.y = DIR_YAW[wallDir];
      group.add(g);
      level.sources.push({ pos: new THREE.Vector3(x, 1.5, z), color: 0x7affc0, power: 8, on: () => true, steady: true });
      level.exits.push({ g, shaft, ring });
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
    const powered = () => !e.need || e.need.every((k) => sim.sig(k));
    const facingOpen = () => {
      let face = "s";
      for (const d of ["s", "n", "e", "w"]) if (!SOLID.has(sim.tileAt(e.c + DIRS[d][0], e.r + DIRS[d][1])?.t ?? "void")) face = d;
      for (const d of ["n", "s", "e", "w"]) if (SOLID.has(sim.tileAt(e.c - DIRS[d][0], e.r - DIRS[d][1])?.t ?? "void") && !SOLID.has(sim.tileAt(e.c + DIRS[d][0], e.r + DIRS[d][1])?.t ?? "void")) face = d;
      return face;
    };
    const led = (px, py, pz, s = 0.06) => {
      const m = ctx.own(new THREE.MeshBasicMaterial({ color: 0x402010, toneMapped: false }));
      add(kit.sphereLo, m, s, s, s * 0.6, px, py, pz);
      return m;
    };
    switch (e.t) {
      case "door": {
        const tA = sim.tileAt(e.c - 1, e.r),
          tB = sim.tileAt(e.c + 1, e.r);
        const spanX = tA && SOLID.has(tA.t) && tB && SOLID.has(tB.t);
        const mat = e.secret ? ctx.wallMat : ctx.door(e.key ? "security" : e.kind === "blast" ? "blast" : "hatch");
        const leaf = new THREE.Group();
        add(kit.box, mat, 2, WALL_H, e.secret ? 0.4 : 0.3, 0, WALL_H / 2, 0, leaf);
        g.add(leaf);
        let lamp = null;
        if (!e.secret) {
          for (const s of [-1, 1]) add(kit.box, kit.steelDark, 0.26, WALL_H, 0.6, s * 1.0, WALL_H / 2, 0);
          add(kit.box, ctx.trimMat, 2.2, 0.24, 0.62, 0, WALL_H - 0.12, 0);
          const gc = e.key ? KEY_COLOR[e.key] : "#ff4020";
          lamp = ctx.own(new THREE.MeshBasicMaterial({ color: new THREE.Color(gc).multiplyScalar(1.6), toneMapped: false }));
          for (const s of [-1, 1]) add(kit.box, lamp, 0.3, 0.1, 0.05, 0, WALL_H - 0.12, s * 0.32);
          if (e.key) for (const s of [-1, 1]) add(kit.box, lamp, 0.08, 0.6, 0.04, 0.75, 1.5, s * 0.17, leaf);
        }
        g.rotation.y = spanX ? 0 : Math.PI / 2;
        g.position.set(x, 0, z);
        const col = new THREE.Color();
        v.update = () => {
          leaf.position.y = e.open * (WALL_H - 0.12);
          if (lamp) {
            const ok = e.open > 0 || (e.unlocked && powered());
            col.set(ok ? "#60ff90" : e.key && !e.unlocked ? KEY_COLOR[e.key] : "#ff3020").multiplyScalar(ok ? 1.6 : 1.2 + Math.sin(time * 4) * 0.3);
            lamp.color.copy(col);
          }
        };
        break;
      }
      case "keypad": {
        mount(MOUNT.keypad.y);
        add(kit.box, kit.steelDark, 0.5, 0.7, 0.08, 0, 0, -0.04);
        const faceM = (level.keypadMat ??= ctx.own(new THREE.MeshBasicMaterial({ map: ctx.own(keypadTexture()), toneMapped: false })));
        const face = add(kit.plane, faceM, 0.42, 0.62, 1, 0, 0, -0.085);
        face.rotation.y = Math.PI;
        const lit = led(0, 0.38, -0.09, 0.07);
        v.source = { color: 0x40ffd0, power: 1.4, on: () => !!sim.keypads[e.id] || powered(), y: MOUNT.keypad.y };
        v.update = () => {
          const ok = !!sim.keypads[e.id];
          lit.color.setHex(ok ? 0x60ff90 : powered() ? 0xff4020 : 0x101010).multiplyScalar(ok ? 1.8 : 1.2 + Math.sin(time * 3) * 0.3);
          face.visible = powered() || ok;
        };
        break;
      }
      case "pipes": {
        // pipe junction board: a wall cabinet with a screen and pipe stubs
        mount(MOUNT.pipes.y);
        add(kit.box, kit.steelDark, 1.1, 0.9, 0.12, 0, 0, -0.06);
        const scr = add(kit.plane, ctx.screen("map", "#40d8ff", e.c + e.r), 0.9, 0.6, 1, 0, 0.05, -0.125);
        scr.rotation.y = Math.PI;
        for (const s of [-1, 1]) add(kit.cyl, kit.steel, 0.12, 1.6, 0.12, s * 0.62, 0.3, -0.05);
        const lit = led(0.42, -0.36, -0.13);
        v.source = { color: 0x40d8ff, power: 1.6, on: () => powered(), y: MOUNT.pipes.y };
        v.update = () => {
          const b = sim.boards[e.board];
          scr.visible = powered();
          lit.color.setHex(b?.solved ? 0x60ff90 : powered() ? 0xffb020 : 0x201008).multiplyScalar(1.6);
        };
        break;
      }
      case "panel": {
        // pressure gauge (or a colour selector)
        mount(MOUNT.panel.y);
        add(kit.box, kit.steelDark, 0.72, 0.78, 0.1, 0, -0.02, -0.05);
        add(kit.box, ctx.trimMat, 0.76, 0.06, 0.12, 0, 0.36, -0.06);
        const lock = sim.locks[e.lock];
        const faceMat = (sym) => {
          level.gaugeMats ??= {};
          if (e.kind === "color") return (level.gaugeMats[`c:${sym}`] ??= glowMat(COLORS[sym] || "#ffffff", 1.2));
          return (level.gaugeMats[sym] ??= ctx.own(new THREE.MeshBasicMaterial({ map: ctx.own(gaugeTexture(Number(sym))), toneMapped: false })));
        };
        const pivot = new THREE.Group();
        pivot.position.set(0, -0.04, -0.12);
        const face = add(kit.plane, faceMat(lock.symbols[e.cur]), 0.56, 0.56, 1, 0, 0, 0, pivot);
        face.rotation.y = Math.PI;
        g.add(pivot);
        const ld = led(0, 0.44, -0.1, 0.07);
        let shown = e.cur;
        v.update = () => {
          if (shown !== e.cur && e.turn < 0.5) {
            shown = e.cur;
            face.material = faceMat(lock.symbols[e.cur]);
          }
          pivot.rotation.z = Math.sin(e.turn * Math.PI) * 0.6;
          face.visible = powered();
          ld.color.setHex(lock.solved ? 0x60ff90 : 0xff7020).multiplyScalar(lock.solved ? 1.8 : 0.8);
        };
        break;
      }
      case "statue": {
        // antenna dish
        g.position.set(x, 0, z);
        const lock = sim.locks[e.lock];
        const dish = buildDish(kit);
        g.add(dish.group);
        const target = () => DIR_YAW[lock.symbols[e.cur]];
        let yaw = target();
        dish.head.rotation.y = yaw;
        v.source = { color: 0x60ff90, power: 2.5, on: () => lock.solved, y: 2.2 };
        v.update = (dt) => {
          let d = target() - yaw;
          d = Math.atan2(Math.sin(d), Math.cos(d));
          yaw += d * Math.min(1, dt * 6);
          dish.head.rotation.y = yaw;
          dish.tip.material = lock.solved ? kit.glowGreen : kit.glowRed;
        };
        break;
      }
      case "block": {
        const mat = (level.crateMat ??= ctx.own(new THREE.MeshStandardMaterial({ map: ctx.own(crateTexture(level.L.id, "#5a6a74")), roughness: 0.55, metalness: 0.4 })));
        add(kit.box, mat, 1.8, 1.7, 1.8, 0, 0.85, 0);
        add(kit.box, kit.steelDark, 1.86, 0.1, 1.86, 0, 0.05, 0);
        add(kit.box, kit.steelDark, 1.86, 0.1, 1.86, 0, 1.68, 0);
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
        add(kit.box, kit.steelDark, 1.6, 0.04, 1.6, 0, 0.02, 0);
        const top = add(kit.box, kit.yellow, 1.3, 0.1, 1.3, 0, 0.07, 0);
        const lit = ctx.own(new THREE.MeshBasicMaterial({ color: 0x302010, toneMapped: false }));
        const rim = add(kit.ring, lit, 1.6, 1.6, 2, 0, 0.05, 0);
        rim.rotation.x = Math.PI / 2;
        for (let i = 0; i < 4; i++) add(kit.box, kit.rubber, 0.9, 0.11, 0.08, 0, 0.075, -0.45 + i * 0.3, top);
        v.update = () => {
          top.position.y = 0.07 - e.anim * 0.06;
          lit.color.setHex(e.pressed ? 0x60ff90 : 0xff8020).multiplyScalar(e.pressed ? 1.6 : 1);
        };
        break;
      }
      case "switch": {
        if (e.hidden) {
          // a loose maintenance panel that swings open
          mount(MOUNT.hidden.y);
          const pv = new THREE.Group();
          pv.position.set(-0.32, 0, -0.03);
          add(kit.box, ctx.plateMat, 0.62, 0.32, 0.04, 0.31, 0, 0, pv);
          g.add(pv);
          add(kit.box, kit.dark, 0.56, 0.26, 0.02, 0, 0, -0.005);
          v.update = () => {
            pv.rotation.y = -e.anim * 1.6;
          };
        } else {
          mount(MOUNT.switch.y);
          add(kit.box, kit.steelDark, 0.46, 0.66, 0.1, 0, 0, -0.05);
          add(kit.box, e.reset ? kit.yellow : kit.gunmetal, 0.32, 0.5, 0.04, 0, 0, -0.11);
          const pivot = new THREE.Group();
          pivot.position.set(0, 0, -0.14);
          add(kit.cylLo, kit.steel, 0.05, 0.42, 0.05, 0, 0.18, -0.04, pivot);
          add(kit.sphere, e.reset ? kit.yellow : kit.red, 0.13, 0.13, 0.13, 0, 0.4, -0.04, pivot);
          g.add(pivot);
          const ld = led(0, 0.28, -0.14, 0.07);
          v.update = () => {
            pivot.rotation.x = 0.75 - e.anim * 1.5;
            ld.color.setHex(e.reset ? 0x40c0ff : e.on ? 0x60ff90 : powered() ? 0xff6020 : 0x201008).multiplyScalar(1.4);
          };
        }
        break;
      }
      case "clue": {
        mount(MOUNT.clue.y);
        const k = e.kind || "note";
        const signKind = k === "sign" ? ["water", "bolt", "bio"][(e.c + e.r) % 3] : k;
        const w = k === "board" || k === "diagram" ? 1.3 : k === "sign" ? 0.8 : 0.7;
        const h = k === "board" || k === "diagram" ? 0.98 : 0.6;
        const tex = ctx.own(signTexture(signKind, e.c * 3 + e.r));
        const p = add(kit.plane, ctx.own(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.15 })), w, h, 1, 0, 0, -0.03);
        p.rotation.y = Math.PI;
        add(kit.box, kit.steelDark, w + 0.06, h + 0.06, 0.03, 0, 0, -0.015);
        break;
      }
      case "term": {
        // a wall terminal: screen, keyboard shelf; a damaged one sparks
        mount(MOUNT.term.y);
        add(kit.box, kit.steelDark, 1.0, 0.82, 0.14, 0, 0.04, -0.07);
        const kinds = ["lines", "graph", "wave", "bars"];
        const scr = add(kit.plane, ctx.screen(kinds[(e.c + e.r) % 4], e.need ? "#ffb040" : "#3affd0", e.c * 7 + e.r), 0.84, 0.6, 1, 0, 0.08, -0.145);
        scr.rotation.y = Math.PI;
        const shelf = add(kit.box, kit.gunmetal, 0.9, 0.05, 0.3, 0, -0.38, -0.2);
        shelf.rotation.x = 0.2;
        const ld = led(0.42, -0.3, -0.15);
        const spark = new THREE.Sprite(ctx.own(spriteMat(sprites.spark, 0xffd080, 1)));
        spark.scale.setScalar(0.5);
        spark.position.set(0.3, 0.2, -0.2);
        g.add(spark);
        v.source = { color: 0x40ffd0, power: 1.8, on: () => e.fixed && powered(), y: MOUNT.term.y };
        v.update = () => {
          const on = e.fixed && powered();
          scr.visible = on;
          spark.visible = !e.fixed && Math.sin(time * 23 + x) > 0.6;
          ld.color.setHex(on ? (e.done || !e.sig ? 0x60ff90 : 0xffb030) : 0x301008).multiplyScalar(on ? 1.6 : 1);
        };
        break;
      }
      case "gen": {
        g.position.set(x, 0, z);
        const color = COLORS[e.color] || "#ffb040";
        if (e.kind === "valve") {
          // a pipe riser with a big valve wheel in its colour
          add(kit.cyl, kit.steelDark, 0.5, 0.2, 0.5, 0, 0.1, 0);
          add(kit.cyl, kit.steel, 0.3, 1.2, 0.3, 0, 0.7, 0);
          add(kit.cyl, kit.steel, 0.3, 2.6, 0.3, 0, 2.5, 0).rotation.z = 0;
          const wheelM = ctx.own(new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.4 }));
          const wheel = new THREE.Group();
          wheel.position.y = 1.15;
          add(kit.torus, wheelM, 0.75, 0.75, 1.2, 0, 0, 0, wheel).rotation.x = Math.PI / 2;
          for (let k = 0; k < 3; k++) add(kit.box, wheelM, 0.7, 0.05, 0.05, 0, 0, 0, wheel).rotation.y = (k * Math.PI) / 3;
          g.add(wheel);
          const ld = led(0, 0.45, -0.26, 0.09);
          const steam = new THREE.Sprite(ctx.own(spriteMat(sprites.smoke, 0xffffff, 0.5, false)));
          steam.scale.setScalar(0.9);
          steam.position.y = 1.6;
          g.add(steam);
          let spin = 0;
          v.update = (dt) => {
            spin += ((e.on ? 1 : 0) - spin) * Math.min(1, dt * 3);
            wheel.rotation.y = spin * Math.PI * 1.5;
            steam.visible = e.on && Math.sin(time * 3 + x) > -0.2;
            steam.position.y = 1.6 + ((time * 0.8) % 1) * 0.6;
            ld.color.set(color).multiplyScalar(e.on ? 2 : 0.4 + Math.sin(time * 3) * 0.2);
          };
          v.source = { color: new THREE.Color(color).getHex(), power: 3, on: () => e.on, y: 1.4 };
        } else {
          // generator: a ribbed casing with a cell slot and a spinning turbine window
          add(kit.box, kit.steelDark, 1.2, 1.2, 0.9, 0, 0.6, 0);
          for (let k = 0; k < 5; k++) add(kit.box, kit.gunmetal, 1.22, 0.04, 0.92, 0, 0.2 + k * 0.22, 0);
          add(kit.box, kit.yellow, 1.24, 0.08, 0.94, 0, 1.22, 0);
          const cell = add(kit.box, kit.glowGreen, 0.2, 0.3, 0.1, 0.35, 0.8, -0.46);
          const fan = new THREE.Group();
          fan.position.set(-0.2, 0.7, -0.46);
          add(kit.ring, kit.steel, 0.5, 0.5, 1, 0, 0, 0, fan);
          for (let k = 0; k < 4; k++) add(kit.box, kit.steel, 0.4, 0.06, 0.01, 0, 0, 0, fan).rotation.z = (k * Math.PI) / 4;
          g.add(fan);
          const ld = led(0.35, 1.05, -0.46);
          v.update = (dt) => {
            cell.visible = e.filled;
            fan.rotation.z += dt * (e.on ? 14 : 0);
            ld.color.setHex(e.on ? 0x60ff90 : e.filled ? 0xffb030 : 0xff3020).multiplyScalar(1.4 + Math.sin(time * 4) * 0.2);
          };
          v.source = { color: 0x80ffc0, power: 4, on: () => e.on, y: 1.4 };
        }
        break;
      }
      case "o2": {
        // oxygen station: tall white cabinet with tanks and a cyan gauge ring
        g.position.set(x, 0, z);
        g.rotation.y = DIR_YAW[facingOpen()];
        add(kit.box, kit.white, 0.9, 1.9, 0.6, 0, 0.95, 0.05);
        for (const s of [-1, 1]) add(kit.capsule, kit.chrome, 0.16, 0.5, 0.16, s * 0.22, 0.9, -0.25);
        add(kit.box, kit.yellow, 0.92, 0.08, 0.62, 0, 1.6, 0.05);
        const ringM = ctx.own(new THREE.MeshBasicMaterial({ color: new THREE.Color(0x40e0ff).multiplyScalar(1.6), toneMapped: false }));
        add(kit.ring, ringM, 0.36, 0.36, 1, 0, 1.4, -0.26);
        add(kit.cylLo, kit.rubber, 0.04, 0.6, 0.04, 0.3, 1.1, -0.32).rotation.z = 0.5;
        v.source = { color: 0x40e0ff, power: 3, on: () => powered(), y: 1.4 };
        v.update = () => ringM.color.setHex(powered() ? 0x40e0ff : 0x102028).multiplyScalar(powered() ? 1.4 + Math.sin(time * 3) * 0.3 : 1);
        break;
      }
      case "socket": {
        const done = ctx.own(new THREE.MeshBasicMaterial({ color: 0x402010, toneMapped: false }));
        const slots = [];
        if (e.wall) {
          mount(MOUNT.socket.y);
          add(kit.box, kit.steelDark, 0.9, 0.9, 0.16, 0, 0, -0.08);
          add(kit.box, kit.yellow, 0.92, 0.06, 0.17, 0, 0.42, -0.08);
          for (let k = 0; k < e.count; k++) {
            const it = buildItem(kit, e.item, ITEMS[e.item]);
            it.own.forEach((m) => ctx.own(m));
            it.group.scale.setScalar(0.8);
            it.group.position.set((k - (e.count - 1) / 2) * 0.26, -0.05, -0.2);
            g.add(it.group);
            slots.push(it.group);
            add(kit.box, kit.dark, 0.2, 0.3, 0.02, (k - (e.count - 1) / 2) * 0.26, -0.05, -0.165);
          }
          add(kit.box, done, 0.7, 0.06, 0.02, 0, 0.3, -0.17);
        } else {
          g.position.set(x, 0, z);
          add(kit.box, kit.steelDark, 1.0, 0.9, 0.8, 0, 0.45, 0);
          add(kit.box, kit.yellow, 1.04, 0.06, 0.84, 0, 0.92, 0);
          for (let k = 0; k < e.count; k++) {
            const it = buildItem(kit, e.item, ITEMS[e.item]);
            it.own.forEach((m) => ctx.own(m));
            it.group.position.set((k - (e.count - 1) / 2) * 0.3, 1.1, 0);
            g.add(it.group);
            slots.push(it.group);
          }
          add(kit.box, done, 0.7, 0.06, 0.02, 0, 0.7, -0.41);
        }
        v.update = () => {
          slots.forEach((s, k) => (s.visible = k < e.have));
          done.color.setHex(e.filled ? 0x60ff90 : 0xff6020).multiplyScalar(1.5);
        };
        v.source = { color: 0x60ff90, power: 2, on: () => e.filled, y: 1.3 };
        break;
      }
      case "prism": {
        // beam reflector on a turning post
        g.position.set(x, 0, z);
        add(kit.cyl, kit.steelDark, 0.6, 0.3, 0.6, 0, 0.15, 0);
        add(kit.cyl, kit.steel, 0.1, BEAM_Y - 0.3, 0.1, 0, 0.3 + (BEAM_Y - 0.3) / 2, 0);
        const head = new THREE.Group();
        head.position.y = BEAM_Y;
        add(kit.box, kit.chrome, 0.8, 0.5, 0.04, 0, 0, 0, head);
        add(kit.box, kit.gunmetal, 0.86, 0.56, 0.02, 0, 0, 0.03, head);
        g.add(head);
        v.update = () => {
          head.visible = !e.empty;
          head.rotation.y = (e.rot % 2 === 0 ? -Math.PI / 4 : Math.PI / 4) + e.turn * (Math.PI / 2);
        };
        break;
      }
      case "receiver": {
        g.position.set(x, 0, z);
        add(kit.cyl, kit.steelDark, 0.6, BEAM_Y - 0.2, 0.6, 0, (BEAM_Y - 0.2) / 2, 0);
        const coreM = ctx.own(new THREE.MeshStandardMaterial({ color: 0x404850, metalness: 0.9, roughness: 0.3, emissive: 0x000000 }));
        add(kit.sphere, coreM, 0.6, 0.6, 0.6, 0, BEAM_Y + 0.1, 0);
        add(kit.torus, kit.chrome, 0.85, 0.85, 0.85, 0, BEAM_Y + 0.1, 0);
        add(kit.torus, kit.chrome, 0.85, 0.85, 0.85, 0, BEAM_Y + 0.1, 0).rotation.x = Math.PI / 2;
        const halo = new THREE.Sprite(ctx.own(spriteMat(sprites.glow, 0xff6040, 0.8)));
        halo.scale.setScalar(2.2);
        halo.position.y = BEAM_Y + 0.1;
        g.add(halo);
        v.source = { color: 0xff5030, power: 6, on: () => e.lit, y: BEAM_Y + 0.2 };
        v.update = () => {
          coreM.emissive.setHex(e.lit ? 0xff4020 : 0x000000);
          coreM.emissiveIntensity = e.lit ? 1.4 + Math.sin(time * 4) * 0.2 : 0;
          halo.visible = e.lit;
        };
        break;
      }
      case "emitter": {
        mount(BEAM_Y);
        add(kit.box, kit.steelDark, 0.7, 0.7, 0.3, 0, 0, -0.15);
        add(kit.cyl, kit.gunmetal, 0.3, 0.3, 0.3, 0, 0, -0.35).rotation.x = Math.PI / 2;
        const lens = add(kit.sphereLo, glowMat(0xff4030, 1.8), 0.2, 0.2, 0.1, 0, 0, -0.5);
        v.source = { color: 0xff4030, power: 3, on: () => powered(), y: BEAM_Y };
        v.update = () => (lens.visible = powered());
        break;
      }
      case "node": {
        const by = e.by || "pulse";
        const col = by === "cannon" ? 0xa070ff : 0x40c8ff;
        const m = ctx.own(new THREE.MeshBasicMaterial({ color: col, toneMapped: false }));
        if (e.wall) {
          mount(MOUNT.node.y);
          add(kit.box, kit.steelDark, 0.62, 0.8, 0.2, 0, 0, -0.1);
          add(kit.cyl, kit.glass, 0.34, 0.6, 0.34, 0, 0, -0.32);
          add(kit.cyl, m, 0.18, 0.5, 0.18, 0, 0, -0.32);
          for (const s of [-1, 1]) add(kit.box, kit.yellow, 0.4, 0.06, 0.06, 0, s * 0.34, -0.32);
        } else {
          g.position.set(x, 0, z);
          add(kit.cyl, kit.steelDark, 0.7, 1.4, 0.7, 0, 0.7, 0);
          add(kit.octa, m, 0.5, 0.8, 0.5, 0, 1.8, 0);
        }
        v.source = { color: col, power: 3, on: () => true, y: 1.8 };
        v.update = () => {
          m.color.setHex(e.charged ? 0xffffff : col).multiplyScalar(e.charged ? 1.6 : 0.6 + Math.sin(time * 4) * 0.3);
          v.source.color = e.charged ? 0xe0f0ff : col;
          v.source.power = e.charged ? 5 : 2;
        };
        break;
      }
      case "barrel": {
        g.position.set(x, 0, z);
        add(kit.capsule, kit.red, 0.5, 0.45, 0.5, 0, 0.55, 0);
        add(kit.cyl, kit.yellow, 0.52, 0.1, 0.52, 0, 0.6, 0);
        add(kit.cyl, kit.steel, 0.12, 0.1, 0.12, 0, 1.08, 0);
        v.update = () => (g.visible = !e.gone);
        break;
      }
      case "item": {
        const def = ITEMS[e.item];
        const { group, own: om } = buildItem(kit, e.item, def);
        om.forEach((m) => ctx.own(m));
        g.add(group);
        const glow = new THREE.Sprite(ctx.own(spriteMat(sprites.glow, def.color, def.kind === "relic" ? 0.9 : 0.5)));
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
        const k = e.kind || "locker";
        g.position.set(x, 0, z);
        g.rotation.y = DIR_YAW[facingOpen()];
        const crateMat = k === "crate" ? (level.supplyMat ??= ctx.own(new THREE.MeshStandardMaterial({ map: ctx.own(crateTexture(7, "#3a6a5a")), roughness: 0.6, metalness: 0.3 }))) : null;
        const box = buildContainer(kit, k, crateMat);
        g.add(box);
        let open = 0;
        let ld = null;
        if (e.key || e.need) {
          ld = ctx.own(new THREE.MeshBasicMaterial({ color: new THREE.Color(KEY_COLOR[e.key] || "#ff4020").multiplyScalar(1.6), toneMapped: false }));
          add(kit.box, ld, 0.12, 0.08, 0.04, 0.3, k === "crate" ? 0.6 : 1.1, -0.42);
        }
        v.update = (dt) => {
          open += ((e.opened ? 1 : 0) - open) * Math.min(1, dt * 4);
          openContainer(box, k, open);
          if (ld && e.need) ld.color.setHex(powered() ? 0x60ff90 : 0xff4020).multiplyScalar(1.6);
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
      case "debris": {
        for (let i = 0; i < 6; i++) {
          const b = add(kit.box, i % 2 ? ctx.plateMat : kit.steelDark, 0.3 + hash(i, e.c) * 0.4, 0.04, 0.2 + hash(e.r, i) * 0.3, (hash(e.r, i) - 0.5) * 1.3, 0.03, (hash(i * 3, e.c) - 0.5) * 1.3);
          b.rotation.set(hash(i, e.r) * 0.3, hash(i, e.r) * 6, 0);
        }
        break;
      }
      case "puddle": {
        const s = add(kit.plane, (level.puddle ??= ctx.own(new THREE.MeshStandardMaterial({ map: ctx.own(splatTexture("30,70,80", e.c + e.r)), transparent: true, roughness: 0.05, metalness: 0.4, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }))), 2.0, 2.0, 1, 0, 0.012, 0);
        s.rotation.x = -Math.PI / 2;
        s.rotation.z = hash(e.r, e.c) * 6.28;
        break;
      }
      case "papers":
        for (let i = 0; i < 7; i++) {
          const p = add(kit.box, kit.white, 0.21, 0.004, 0.3, (hash(i, e.c) - 0.5) * 1.2, 0.01 + i * 0.002, (hash(e.r, i) - 0.5) * 1.2);
          p.rotation.y = hash(i, e.r) * 6;
        }
        break;
      case "cables":
        for (let i = 0; i < 3; i++) {
          const cb = add(kit.cylLo, kit.rubber, 0.05, 1.8, 0.05, (i - 1) * 0.25, 0.03, 0);
          cb.rotation.set(Math.PI / 2, hash(i, e.c) * 1.5, 0);
        }
        break;
      case "crates":
        g.rotation.y = toWall;
        nudge(0.3);
        {
          const mat = (level.decoCrate ??= ctx.own(new THREE.MeshStandardMaterial({ map: ctx.own(crateTexture(e.c + e.r, "#6a5a3a")), roughness: 0.6, metalness: 0.3 })));
          add(kit.box, mat, 0.8, 0.8, 0.8, -0.3, 0.4, 0);
          add(kit.box, mat, 0.7, 0.7, 0.7, 0.45, 0.35, 0.1).rotation.y = 0.3;
          add(kit.box, mat, 0.6, 0.6, 0.6, -0.2, 1.1, 0.05).rotation.y = -0.2;
        }
        break;
      case "console": {
        g.rotation.y = toWall;
        nudge(0.35);
        g.add(buildConsole(kit, ctx.screen(["graph", "bars", "wave", "map"][(e.c + e.r) % 4], "#3affd0", e.c * 5 + e.r)));
        level.sources.push({ pos: g.position.clone().setY(1.4), color: 0x40ffd0, power: 1.5, on: () => true });
        break;
      }
      case "rack": {
        g.rotation.y = toWall;
        nudge(0.4);
        add(kit.box, kit.gunmetal, 0.9, 2.1, 0.7, 0, 1.05, 0);
        for (let i = 0; i < 7; i++) {
          add(kit.box, kit.steelDark, 0.8, 0.2, 0.02, 0, 0.3 + i * 0.25, -0.36);
          add(kit.box, i % 3 ? kit.glowGreen : kit.glowCyan, 0.03, 0.03, 0.01, 0.3, 0.3 + i * 0.25, -0.375);
        }
        break;
      }
      case "tankjar": {
        const liquid = (level.jarLiquid ??= ctx.own(kit.liquid.clone()));
        const t = buildTank(kit, liquid, e.c + e.r);
        t.scale.setScalar(0.55);
        g.add(t);
        break;
      }
      case "bed":
        g.rotation.y = toWall;
        add(kit.box, kit.steel, 0.9, 0.5, 1.8, 0, 0.25, 0);
        add(kit.box, kit.white, 0.86, 0.12, 1.7, 0, 0.56, 0);
        add(kit.box, kit.white, 0.6, 0.12, 0.35, 0, 0.66, -0.65);
        break;
      case "plant": {
        add(kit.cyl, kit.steelDark, 0.7, 0.5, 0.7, 0, 0.25, 0);
        for (let i = 0; i < 9; i++) {
          const l = add(kit.capsule, kit.glowGreen, 0.06, 0.4 + hash(i, e.c) * 0.4, 0.06, (hash(i, e.r) - 0.5) * 0.4, 0.8, (hash(e.c, i) - 0.5) * 0.4);
          l.rotation.set((hash(i, e.c) - 0.5) * 1.2, 0, (hash(e.r, i) - 0.5) * 1.2);
        }
        break;
      }
      case "pipework":
        g.rotation.y = toWall;
        nudge(0.55);
        for (let i = 0; i < 3; i++) add(kit.cyl, i === 1 ? kit.yellow : kit.steel, 0.22, WALL_H, 0.22, (i - 1) * 0.3, WALL_H / 2, 0);
        add(kit.torus, kit.red, 0.4, 0.4, 0.6, -0.3, 1.2, -0.15).rotation.x = Math.PI / 2;
        break;
      case "cart":
        add(kit.box, kit.yellow, 1.2, 0.3, 0.8, 0, 0.45, 0);
        for (const s of [-1, 1]) for (const t of [-1, 1]) add(kit.cyl, kit.rubber, 0.2, 0.08, 0.2, s * 0.45, 0.1, t * 0.3).rotation.z = Math.PI / 2;
        add(kit.box, kit.steel, 0.05, 0.7, 0.8, -0.6, 0.8, 0);
        break;
      default:
        add(kit.box, ctx.plateMat, 0.8, 0.8, 0.8, 0, 0.4, 0);
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
    root.visible = !(en.dead && en.deadT > 10);
    root.position.set(en.x, en.y || 0, en.z);
    root.rotation.y = en.yaw;
    const sp = Math.hypot(en.vx, en.vz);
    const ph = en.walk * (en.kind === "crawler" ? 3.2 : en.def.boss ? 1.4 : 2.4);
    const sw = Math.min(1, sp / 1.5) * 0.7;
    if (en.emerge > 0) root.position.y = (en.y || 0) - en.emerge * en.def.h * 0.9;
    // hit flash / stun tint
    if (en.hitT > 0) {
      ev.skin.emissive.setHex(0xffa060);
      ev.skin.emissiveIntensity = 0.3;
    } else if (en.stun > 0) {
      ev.skin.emissive.setHex(0x40a0ff);
      ev.skin.emissiveIntensity = 0.35 + Math.sin(time * 30) * 0.15;
    } else {
      ev.skin.emissive.setHex(0x000000);
      ev.skin.emissiveIntensity = 0;
    }
    if (P.rotors) P.rotors.forEach((r, i) => (r.rotation.y += dt * (en.dead ? 0 : 30) * (i ? 1 : -1)));
    if (P.tail) {
      const k = en.dead ? 0 : 1;
      P.tail.forEach((s, i) => {
        if (en.kind === "specimen") s.rotation.x = Math.sin(time * 2 + i) * 0.4 * k;
        else s.rotation.y = Math.sin(time * (sp > 0.5 ? 7 : 3) - i * 0.8) * 0.28 * k;
      });
    }
    if (P.jaw) P.jaw.rotation.x = en.atk > 0 ? 0.4 : Math.max(0, Math.sin(time * 2) * 0.1);
    if (en.dead) {
      ev.fall = Math.min(1, ev.fall + dt * 2.2);
      const k = 1 - (1 - ev.fall) ** 3;
      if (en.def.move === "air") {
        root.position.y = Math.max(0, (en.y || 0) * (1 - k));
        body.rotation.z = k * 1.2;
        return;
      }
      if (en.kind === "crawler" || en.kind === "matriarch") {
        body.rotation.z = k * Math.PI;
        body.position.y = ev.baseY * (1 - k * 0.5);
        return;
      }
      if (en.kind === "eel") {
        body.rotation.z = k * Math.PI;
        root.position.y = (en.y || 0) + k * 0.6;
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
    body.rotation.z = 0;
    let lean = 0;
    let armRaise = 0;
    if (en.atk > 0) {
      const wind = en.boss ? 0.55 : 0.42;
      const k = Math.min(1, en.atk / wind);
      armRaise = k < 0.8 ? k * 2.6 : 2.6 - (k - 0.8) * 10;
      lean = k * 0.25;
    }
    if (en.spitT > 0) armRaise = 2.2;
    if (en.charge) lean = en.charge.t < 0.7 ? -0.2 : 0.5;
    if (en.stun > 0) lean = -0.3 + Math.sin(time * 12) * 0.05;
    body.rotation.x = ev.baseRx - lean;
    body.position.y = ev.baseY + Math.abs(Math.sin(ph)) * 0.05 * sw + (en.def.move === "air" ? Math.sin(time * 3 + en.x) * 0.05 : 0);
    if (en.def.move !== "air" && !P.tail) body.rotation.z = Math.sin(ph) * 0.06 * sw + (en.hitT > 0 ? 0.12 : 0);
    if (P.legL) P.legL.rotation.x = Math.sin(ph) * sw;
    if (P.legR) P.legR.rotation.x = -Math.sin(ph) * sw;
    if (P.legs) P.legs.forEach((l, i) => (l.rotation.x = Math.sin(time * 9 + i * 1.7) * 0.35 * (0.3 + sw)));
    const crab = en.kind === "crawler" || en.kind === "matriarch";
    const reach = en.kind === "researcher" ? 0.9 : crab ? 1.2 : 0.2;
    if (P.armL) P.armL.rotation.x = -reach - armRaise * (P.fire ? 0.9 : 1) * (crab ? 0.4 : 1) - Math.sin(ph) * sw * 0.6 + Math.sin(time * 2 + en.x) * 0.05;
    if (P.armR) P.armR.rotation.x = -reach - armRaise * (P.fire ? 0.4 : 0.9) * (crab ? 0.4 : 1) + Math.sin(ph) * sw * 0.6 + Math.sin(time * 2.3 + en.z) * 0.05;
    if (P.head && !P.tail) P.head.rotation.y = Math.sin(time * 1.3 + en.x) * 0.25;
    if (P.sac) P.sac.scale.set(0.8, 0.5, 0.9).multiplyScalar((en.kind === "matriarch" ? 1.35 : 1) * (1 + Math.sin(time * (en.spitT > 0 ? 18 : 3)) * (en.spitT > 0 ? 0.12 : 0.05)));
    if (P.core) P.core.scale.setScalar((P.core.userData.s ??= P.core.scale.x) * (1 + Math.sin(time * 5) * 0.15));
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
  /** Bubbles rising from (x, y, z) inside a water cell, popping at its surface. */
  function bubble(x, y, z, n = 3, spread = 0.2, size = 1) {
    const t = level?.sim?.tileAt(Math.floor(x / CELL), Math.floor(z / CELL));
    const top = t && t.wl > 0.5 ? Math.min(t.wl, WALL_H - 0.05) : 0;
    if (y >= top - 0.05) return;
    for (let i = 0; i < n; i++) {
      const b = bubbles.find((q) => q.life <= 0) || bubbles[0];
      b.life = 3;
      b.top = top;
      b.s.position.set(x + (Math.random() - 0.5) * spread, y + (Math.random() - 0.5) * spread, z + (Math.random() - 0.5) * spread);
      b.v.set(0, 0.6 + Math.random() * 0.6, 0);
      b.s.scale.setScalar((0.03 + Math.random() * 0.06) * size);
      b.s.visible = true;
    }
  }
  function ring(x, z, r, color = 0x60d0ff, life = 0.6, y = 0.15) {
    const q = rings.find((k) => k.life <= 0) || rings[0];
    q.life = q.max = life;
    q.r = r;
    q.m.material.color.setHex(color);
    q.m.position.set(x, y, z);
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
    if (kind === "harpoon") {
      q.harp.visible = true;
      q.s.visible = false;
      tmpV.subVectors(q.b, q.a).normalize();
      q.harp.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), tmpV);
    } else {
      q.s.visible = true;
      q.harp.visible = false;
      q.s.material.color.setHex(BOLT[kind].color);
      q.s.scale.setScalar(BOLT[kind].size * (kind === "cannon" ? 2 : 2.4));
    }
  }
  function beamTracer(a, b, color, width = 0.035) {
    const t = tracers.find((q) => q.life <= 0) || tracers[0];
    tmpV.set(b[0] - a.x, b[1] - a.y, b[2] - a.z);
    const len = tmpV.length();
    if (len < 0.3) return;
    t.m.quaternion.setFromUnitVectors(UP, tmpV.clone().normalize());
    t.m.position.set((a.x + b[0]) / 2, (a.y + b[1]) / 2, (a.z + b[2]) / 2);
    t.m.scale.set(width, len, width);
    t.m.material.color.setHex(color).multiplyScalar(1.6);
    t.m.visible = true;
    t.life = t.max = 0.22;
  }

  /** Simulation events the renderer reacts to (called by the UI per event). */
  function fx(e, sim) {
    if (!level) return;
    switch (e.type) {
      case "shot": {
        const w = weapons[e.weapon];
        vm.kick = Math.min(1.5, vm.kick + (e.weapon === "cannon" ? 1.0 : e.weapon === "pulse" ? 0.3 : e.weapon === "harpoon" ? 0.9 : 0.6));
        vm.flashT = 0.06;
        w.flash.visible = true;
        w.flash.material.rotation = Math.random() * 6;
        muzzleLight.color.setHex(BOLT[e.weapon].color);
        muzzleLight.intensity = e.weapon === "harpoon" ? 1 : e.weapon === "cannon" ? 9 : 5;
        muzzleLight.position.copy(camera.position);
        tmpV2.set(0.12, -0.1, -0.5).applyQuaternion(camera.quaternion).add(camera.position);
        for (const p of e.to) {
          bolt(tmpV2, p, e.weapon);
          if (e.weapon === "cannon") beamTracer(tmpV2, p, 0xb07aff, 0.05);
          if (e.weapon === "pulse") beamTracer(tmpV2, p, 0x5ad8ff, 0.012);
        }
        if (e.under) bubble(tmpV2.x, tmpV2.y, tmpV2.z, e.weapon === "pulse" ? 1 : 4, 0.1);
        break;
      }
      case "impact": {
        const col = e.weapon ? BOLT[e.weapon].color : 0xffd080;
        if (e.kind === "wall") {
          spark(e.x, e.y, e.z, e.weapon === "harpoon" ? 3 : 6, 2.5, col);
          puff(e.x, e.y, e.z, { color: 0x8a9aa0, size: 0.16, grow: 1.6, life: 0.6, alpha: 0.45 });
          if (e.under) bubble(e.x, e.y, e.z, 4, 0.2);
        } else if (e.kind === "armor" || e.kind === "metal") spark(e.x, e.y, e.z, 8, 3.5, e.kind === "metal" ? 0x9ad8ff : 0xfff0c0);
        else {
          spark(e.x, e.y, e.z, 4, 2.5, 0x6aff9a);
          puff(e.x, e.y, e.z, { color: 0x5a8a50, size: 0.2, grow: 2, life: 0.5, alpha: 0.7, vy: -0.2 });
          bubble(e.x, e.y, e.z, 3, 0.2);
        }
        break;
      }
      case "burst":
        fxLight.position.set(e.x, e.y + 0.3, e.z);
        fxLight.intensity = 30;
        fxLight.color.setHex(0xb07aff);
        for (let i = 0; i < 5; i++) puff(e.x + (Math.random() - 0.5) * 0.6, e.y + Math.random() * 0.4, e.z + (Math.random() - 0.5) * 0.6, { color: i < 3 ? 0xa070ff : 0x302040, size: 0.5, grow: 2.6, life: 0.7 + i * 0.08, alpha: 0.9, additive: i < 3, spread: 1.6 });
        spark(e.x, e.y, e.z, 12, 6, 0xc0a0ff);
        ring(e.x, e.z, e.r, 0xa070ff, 0.45, e.y);
        bubble(e.x, e.y, e.z, 8, 0.6);
        shake = Math.max(shake, 0.12);
        break;
      case "ability":
        fxLight.position.set(e.x, 1.4, e.z);
        fxLight.intensity = 50;
        fxLight.color.setHex(0x60c8ff);
        ring(e.x, e.z, 6, 0x80e0ff, 0.7, (sim?.player?.y || 0) + 0.6);
        ring(e.x, e.z, 4, 0x3a8aff, 0.5, (sim?.player?.y || 0) + 1.0);
        for (let i = 0; i < 18; i++) {
          const a = (i / 18) * Math.PI * 2;
          spark(e.x + Math.cos(a) * 2, (sim?.player?.y || 0) + 1, e.z + Math.sin(a) * 2, 1, 6, 0x9ad8ff, 0);
        }
        shake = Math.max(shake, 0.18);
        break;
      case "kill":
        puff(e.x, 1, e.z, { color: e.kind === "drone" || e.kind === "warden" ? 0x303030 : 0x3a5a40, size: 0.6, grow: 3, life: 1.3, alpha: 0.7, vy: 0.2 });
        spark(e.x, 1.2, e.z, 10, 3, e.kind === "drone" ? 0xffa040 : 0x6aff9a, 2);
        if (e.boss) {
          shake = Math.max(shake, 0.35);
          fxLight.position.set(e.x, 2, e.z);
          fxLight.intensity = 60;
          fxLight.color.setHex(0xffd070);
          ring(e.x, e.z, 8, 0x7affc0, 1.2);
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
      case "splash": {
        const col = 0x9aff3a;
        puff(e.x, e.y, e.z, { color: col, size: 0.3, grow: 2, life: 0.5, alpha: 0.7, additive: true });
        spark(e.x, e.y, e.z, 4, 2.5, col);
        break;
      }
      case "nodeCharged": {
        const c = sim.entBox(sim.byId[e.id]).c;
        fxLight.position.set(...c);
        fxLight.intensity = 25;
        fxLight.color.setHex(e.by === "cannon" ? 0xb07aff : 0x60d0ff);
        spark(...c, 14, 5, e.by === "cannon" ? 0xc0a0ff : 0x9ae0ff);
        break;
      }
      case "overload": {
        const c = sim.entBox(sim.byId[e.id]).c;
        for (let i = 0; i < 4; i++) puff(c[0], c[1] + 0.6, c[2], { color: 0xe8f4ff, size: 0.5, grow: 2.5, life: 1.2, alpha: 0.7, spread: 0.8, vy: 1.2 });
        break;
      }
      case "genOn": {
        const c = sim.entBox(sim.byId[e.id]).c;
        spark(c[0], 1.3, c[2], 10, 3, 0x9affc0, 3);
        break;
      }
      case "drain":
        shake = Math.max(shake, 0.08);
        break;
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
        puff(e.x, 0.4, e.z, { color: 0x708088, size: 0.8, grow: 3, life: 1, spread: 2 });
        break;
      case "roar":
        shake = Math.max(shake, 0.12);
        break;
      case "wake": {
        const en = sim.enemyById[e.id] || sim.enemies.find((q) => q.id === e.id);
        if (en) puff(en.x, 0.3, en.z, { color: 0x5a7a80, size: 0.8, grow: 2.5, life: 1.2, spread: 1.4, alpha: 0.6 });
        break;
      }
      case "relic":
        fxLight.position.copy(camera.position);
        fxLight.intensity = 30;
        fxLight.color.setHex(0x9af0ff);
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
    const bobK = p.ground ? Math.min(1, p.speed / 4) : p.swim ? 0.5 : 0;
    shake = Math.max(0, shake - dt * 1.2);
    const escaping = sim.escape && sim.state !== "complete";
    if (escaping) shake = Math.max(shake, 0.05);
    const sk = shake * shake * 0.6 + (escaping ? 0.02 : 0);
    const swimBob = p.swim ? Math.sin(time * 1.6) * 0.03 : 0;
    camera.position.set(
      p.x + (Math.random() - 0.5) * sk,
      EYE + p.y + (p.swim ? swimBob : Math.sin(p.bob * 2) * 0.04 * bobK) + (Math.random() - 0.5) * sk - (dead ? Math.min(1.2, sim.deadT * 1.4) : 0),
      p.z + (Math.random() - 0.5) * sk,
    );
    camera.rotation.set(p.pitch + p.kick, p.yaw, (p.swim ? Math.sin(time * 0.9) * 0.02 : Math.sin(p.bob) * 0.006 * bobK) + (dead ? Math.min(0.9, sim.deadT * 0.9) : 0));
    const fov = fovBase * (1 - (p.cur === "harpoon" ? 0.3 : 0.18) * p.aim);
    if (Math.abs(camera.fov - fov) > 0.01) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }

    // underwater: is the camera below the water surface of its cell?
    const ct = sim.tileAt(Math.floor(camera.position.x / CELL), Math.floor(camera.position.z / CELL));
    const underCam = !!ct && ct.wl > 0 && camera.position.y < ct.wl;
    level.underCam = underCam;
    scene.fog.color.lerp(underCam ? fogWet : fogDry, Math.min(1, dt * 8));
    const wantDensity = (underCam ? 0.11 : level.zone.fogDensity) * (quality === "high" ? 1 : 0.85);
    scene.fog.density += (wantDensity - scene.fog.density) * Math.min(1, dt * 6);
    scene.background.copy(scene.fog.color).multiplyScalar(0.6);

    for (const v of level.views.values()) v.update(dt);
    for (const en of sim.enemies) updateEnemy(enemyView(en), en, dt, sim);

    // water surfaces + containment fields follow the live water level
    caustic.offset.set(time * 0.02, time * 0.015);
    level.waterMat.emissiveIntensity = 0.4 + Math.sin(time * 1.3) * 0.1;
    for (const w of level.waters) {
      const h = Math.min(w.t.wl, WALL_H - 0.03);
      w.surf.visible = w.t.wl > 0.02;
      w.surf.position.y = Math.max(0.02, h) + Math.sin(time * 1.5 + w.t.c) * 0.01;
    }
    level.fieldMat.opacity = 0.22 + Math.sin(time * 3) * 0.08;
    fieldTex.offset.y = time * 0.05;
    for (const f of level.fields) {
      const top = Math.min(f.t.wl, WALL_H);
      const bot = Math.min(top, f.n.wl);
      const hgt = top - bot;
      f.fg.visible = hgt > 0.05;
      if (!f.fg.visible) continue;
      f.pane.scale.set(CELL, hgt, 1);
      f.pane.position.y = bot + hgt / 2;
      f.tint.scale.set(CELL, hgt, 1);
      f.tint.position.y = bot + hgt / 2;
    }
    for (const o of level.oceans) o.material.map.offset.x = time * 0.004;
    for (const f of level.fish) {
      const k = Math.sin(time * f.sp * 0.5 + f.ph);
      f.f.position.copy(f.base).addScaledVector(f.along, k * 0.8);
      f.f.material.rotation = 0;
      f.f.scale.x = Math.abs(f.f.scale.x) * (Math.cos(time * f.sp * 0.5 + f.ph) > 0 ? 1 : -1);
    }

    // hazards
    for (const lz of level.lasers) {
      const on = sim.laserOn(lz.t);
      for (const j of lz.jets) {
        j.f.visible = on;
        if (j.glow) j.glow.visible = on;
        if (on && !j.laser) {
          j.f.position.y = j.base + Math.sin(time * 14 + j.ph) * 0.08;
          j.f.scale.set(0.7 + Math.sin(time * 17 + j.ph) * 0.12, 1.3 + Math.sin(time * 11 + j.ph) * 0.2, 1);
        }
      }
    }
    for (const sp of level.spikes) {
      const on = sim.spikesOn(sp.t);
      sp.arc.visible = on && Math.sin(time * 37 + sp.t.c) > -0.3;
      if (sp.arc.visible) {
        sp.arc.position.set((Math.random() - 0.5) * 1.2, 0.1 + Math.random() * 0.3, (Math.random() - 0.5) * 1.2);
        sp.arc.material.rotation = Math.random() * 6;
      }
    }
    for (const gz of level.gas) {
      const on = sim.gasOn(gz.t);
      for (const q of gz.ps) {
        q.s.visible = on;
        q.s.position.set(q.base.x + Math.sin(time * 0.4 + q.ph) * 0.3, q.base.y + Math.sin(time * 0.3 + q.ph) * 0.2, q.base.z + Math.cos(time * 0.35 + q.ph) * 0.3);
        q.s.material.rotation = time * 0.1 + q.ph;
      }
    }
    // ambient bubbles in deep water and the diver's breath
    if (quality === "high") {
      for (const f of level.flames) if (f.bubbleSrc && f.t.wl > 1.2 && Math.random() < dt * 0.8) bubble(f.x + (Math.random() - 0.5) * 1.4, 0.1, f.z + (Math.random() - 0.5) * 1.4, 1, 0.1);
    }
    if (p.under && !dead && Math.random() < dt * (p.speed > 2 ? 3 : 1.4)) {
      tmpV.set((Math.random() - 0.5) * 0.5, -0.15, -0.9).applyQuaternion(camera.quaternion).add(camera.position);
      bubble(tmpV.x, tmpV.y, tmpV.z, 2 + Math.floor(Math.random() * 2), 0.12, 0.6);
    }

    // laser beams
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
      bm.core.scale.set(0.025, len, 0.025);
      bm.glow.position.set(...mid);
      bm.glow.quaternion.copy(tmpQ);
      bm.glow.scale.set(0.1 * f, len, 0.1 * f);
      bm.core.visible = bm.glow.visible = true;
      bm.spark.visible = kind !== "prism";
      bm.spark.position.set(...b);
      bm.spark.scale.setScalar(0.5 + Math.sin(time * 12 + bi) * 0.1);
    }
    for (let i = bi; i < beamPool.length; i++) beamPool[i].core.visible = beamPool[i].glow.visible = beamPool[i].spark.visible = false;

    // enemy projectiles (acid globs, drone bolts)
    globs.forEach((fb, i) => {
      const pr = sim.projectiles[i];
      fb.s.visible = fb.core.visible = !!pr;
      if (pr) {
        const kind = (sim.enemyById[pr.from] || sim.enemies.find((q) => q.id === pr.from))?.kind;
        const col = SPIT[kind] ?? 0x9aff3a;
        if (fb.col !== col) {
          fb.col = col;
          fb.s.material.color.setHex(col);
        }
        fb.s.position.set(pr.x, pr.y, pr.z);
        fb.core.position.set(pr.x, pr.y, pr.z);
        fb.s.material.rotation = time * 4;
      }
    });

    // focus marker
    if (sim.focus && sim.state === "play") {
      const bx = sim.entBox(sim.focus.ent);
      marker.visible = true;
      marker.position.set(bx.c[0], Math.min(bx.max[1] + 0.15, WALL_H - 0.3), bx.c[2]);
      marker.scale.setScalar(0.14 + Math.sin(time * 5) * 0.03);
      markerMat.color.setHex(sim.focus.locked ? 0xff7060 : 0xbff0ff);
    } else marker.visible = false;

    // effects
    for (const q of bolts) {
      if (q.life <= 0) continue;
      q.life -= dt;
      q.t = Math.min(1, 1 - q.life / q.dur);
      tmpV.lerpVectors(q.a, q.b, q.t);
      if (q.kind === "harpoon") {
        q.harp.position.copy(tmpV);
        q.trailT -= dt;
        if (q.trailT <= 0) {
          q.trailT = 0.03;
          bubble(tmpV.x, tmpV.y, tmpV.z, 1, 0.05);
        }
      } else {
        q.s.position.copy(tmpV);
        q.s.material.rotation = time * 8;
        q.trailT -= dt;
        if (quality === "high" && q.trailT <= 0 && q.kind !== "pistol") {
          q.trailT = q.kind === "cannon" ? 0.015 : 0.03;
          puff(tmpV.x, tmpV.y, tmpV.z, { color: BOLT[q.kind].color, size: BOLT[q.kind].size * 0.9, grow: 1.2, life: 0.25, alpha: 0.6, additive: true, vy: 0, spread: 0.05 });
        }
      }
      if (q.life <= 0) {
        q.s.visible = false;
        q.harp.visible = false;
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
    for (const b of bubbles) {
      if (b.life <= 0) continue;
      b.life -= dt;
      b.s.position.y += b.v.y * dt;
      b.s.position.x += Math.sin(time * 6 + b.wob) * dt * 0.15;
      if (b.s.position.y >= b.top || b.life <= 0) {
        b.life = 0;
        b.s.visible = false;
      }
    }
    // falling debris and sparks while the facility implodes
    if (escaping && Math.random() < dt * 6) {
      puff(p.x + (Math.random() - 0.5) * 8, WALL_H - 0.2, p.z + (Math.random() - 0.5) * 8, { color: 0x8a9aa0, size: 0.5, grow: 2, life: 1.4, alpha: 0.6, vy: -1.6, spread: 0.3 });
      if (Math.random() < 0.3) spark(p.x + (Math.random() - 0.5) * 6, WALL_H - 0.3, p.z + (Math.random() - 0.5) * 6, 6, 2, 0xffc060);
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
      let fl = s.steady ? 1 : 0.94 + Math.sin(time * 7 + (s.flick || i)) * 0.04;
      if (s.beacon) fl = 0.25 + Math.max(0, Math.sin(time * 4 + s.flick)) * 1.1;
      if (s.broken) fl *= Math.sin(time * 13 + s.flick) > 0.85 || Math.sin(time * 2.1 + s.flick) > 0.9 ? 0.15 : 1;
      l.intensity = s.power * fl;
    });
    if (escaping) {
      const pulse = 0.5 + 0.5 * Math.sin(time * 3);
      hemi.color.setRGB(1, 0.45 + 0.15 * pulse, 0.35);
      hemi.intensity = level.hemiBase * (0.9 + pulse * 0.3);
    } else {
      hemi.color.setHex(level.zone.ambient[0]);
      hemi.intensity = level.hemiBase * (underCam ? 1.15 : 1);
    }
    handLight.intensity = dead ? 0 : underCam ? 18 : 14;

    for (const ex of level.exits) {
      ex.shaft.material.opacity = 0.3 + Math.sin(time * 2) * 0.08;
      ex.ring.rotation.z = time * 0.6;
    }

    // marine snow / dust drifting in the lamplight
    if (quality === "high") {
      dust.visible = true;
      dustMat.opacity = underCam ? 0.8 : 0.4;
      dustMat.color.setHex(underCam ? 0xcff4ff : 0xd8e0e8);
      const a = dustGeo.attributes.position.array;
      for (let i = 0; i < DUST; i++) {
        const k = i * 3;
        const [ph, sp] = dustSeed[i];
        a[k] += Math.sin(time * 0.3 + ph) * dt * 0.08;
        a[k + 1] += (Math.sin(time * 0.2 + ph * 2) * 0.05 - 0.03 * sp) * dt;
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
      const reloadK = p.reloadT > 0 ? Math.sin(Math.min(1, 1 - p.reloadT / (def.reload * sim.stats.reloadMul * (sim.stats.mod?.[cur]?.reload ?? 1))) * Math.PI) : 0;
      const switchK = p.switchT > 0 ? p.switchT / 0.4 : 0;
      const sprint = p.sprint && p.speed > 3 && !p.swim ? 1 : 0;
      const bobX = Math.cos(p.bob) * 0.012 * bobK * (1 - aim * 0.8);
      const bobY = Math.abs(Math.sin(p.bob)) * 0.012 * bobK * (1 - aim * 0.8) + (p.swim ? Math.sin(time * 1.6) * 0.006 : 0);
      const gx = 0.16 * (1 - aim * 0.9) + bobX;
      const gy = -0.17 + aim * 0.07 + bobY - reloadK * 0.14 - switchK * 0.32 - sprint * 0.05;
      const gz = -0.42 + vm.kick * 0.04 + aim * 0.06;
      w.group.position.set(gx, gy, gz);
      w.group.rotation.set(vm.kick * 0.1 + reloadK * 0.5 - sprint * 0.4, aim > 0.5 ? 0 : 0.05 + sprint * 0.5, reloadK * 0.4);
      const charged = !WEAPONS[cur].ammo || p.mags[cur] > 0;
      w.glow.forEach((m) => (m.visible = charged));
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
    caustic.dispose();
    fieldTex.dispose();
    [markerMat, beamTracerMat, beamCoreMat, beamGlowMat, dustMat, bubbleMat].forEach((m) => m.dispose());
    tracers.forEach((t) => t.m.material.dispose());
    bolts.forEach((b) => b.s.material.dispose());
    puffs.forEach((q) => q.s.material.dispose());
    sparks.forEach((q) => q.s.material.dispose());
    globs.forEach((q) => q.s.material.dispose());
    rings.forEach((q) => (q.m.geometry.dispose(), q.m.material.dispose()));
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
    isUnderwater: () => !!level?.underCam,
    get quality() {
      return quality;
    },
  };
}

