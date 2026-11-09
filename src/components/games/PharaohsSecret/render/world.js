/**
 * Pharaoh's Secret — Three.js renderer. A level's static shell (walls,
 * floors, pits, ceilings) is merged into a handful of meshes with baked
 * corner shading; devices are small groups updated from the simulation every
 * frame. Lighting is a dim hemisphere, a warm lantern on the player and a
 * pool of five flickering point lights handed to the nearest torches,
 * braziers and glowing devices — so the shader light count never changes.
 * No shadow maps, no post-processing; everything is disposed on level change
 * and unmount.
 */
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { CELL, WALL_H, EYE, DIRS, DIR_YAW, OPPOSITE, ZONES, cellCenter } from "../engine/constants.js";
import { BEAM_Y, MOUNT } from "../engine/sim.js";
import { ITEMS } from "../engine/items.js";
import { wallTextures, floorTextures, ceilingTexture, glyphTexture, panelTexture, doorTexture, spriteTexture } from "./textures.js";
import { createKit, buildStatue, buildContainer, openContainer, buildItem, buildGoldPile, buildObelisk, buildTorch } from "./props.js";

const LIGHTS = 5;
const SOLID = new Set(["wall", "void", "pillar"]);
const BEAM_COL = new THREE.Color(0xffd27a);

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
  renderer.toneMappingExposure = 1.15;
  renderer.domElement.className = "phs-canvas";
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.05, 90);
  camera.rotation.order = "YXZ";
  scene.add(camera);
  let pmrem = new THREE.PMREMGenerator(renderer);
  let envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envTex;
  scene.fog = new THREE.FogExp2(0x1c120a, 0.05);
  scene.background = new THREE.Color(0x070504);

  const hemi = new THREE.HemisphereLight(0xffd9a0, 0x2a1a0c, 0.5);
  scene.add(hemi);
  const lantern = new THREE.PointLight(0xffb070, 5, 11, 1.6);
  lantern.position.set(0.25, -0.15, 0.1);
  camera.add(lantern);
  const pool = [];
  for (let i = 0; i < LIGHTS; i++) {
    const l = new THREE.PointLight(0xffa040, 0, 11, 1.5);
    scene.add(l);
    pool.push(l);
  }

  const kit = createKit();
  const sprites = { flame: spriteTexture("flame"), glow: spriteTexture("glow"), dust: spriteTexture("dust") };
  const spriteMat = (map, color, opacity = 1) =>
    new THREE.SpriteMaterial({ map, color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, fog: true });
  const flameMat = spriteMat(sprites.flame, 0xffffff);
  const glowMat = spriteMat(sprites.glow, 0xffa040, 0.55);
  const markerMat = spriteMat(sprites.glow, 0xffe08a, 0.9);
  const marker = new THREE.Sprite(markerMat);
  marker.scale.setScalar(0.18);
  marker.visible = false;
  scene.add(marker);

  // beams
  const beamCoreMat = new THREE.MeshBasicMaterial({ color: BEAM_COL.clone().multiplyScalar(2.2), toneMapped: false });
  const beamGlowMat = new THREE.MeshBasicMaterial({ color: 0xffb040, transparent: true, opacity: 0.32, depthWrite: false, blending: THREE.AdditiveBlending });
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

  // dust
  const DUST = 260;
  const dustGeo = new THREE.BufferGeometry();
  const dustPos = new Float32Array(DUST * 3);
  for (let i = 0; i < DUST * 3; i++) dustPos[i] = (Math.random() - 0.5) * 16;
  dustGeo.setAttribute("position", new THREE.BufferAttribute(dustPos, 3));
  const dustMat = new THREE.PointsMaterial({ size: 0.05, map: sprites.dust, transparent: true, opacity: 0.55, depthWrite: false, color: 0xffe2b0, blending: THREE.AdditiveBlending });
  const dust = new THREE.Points(dustGeo, dustMat);
  dust.frustumCulled = false;
  scene.add(dust);
  const dustSeed = Array.from({ length: DUST }, () => [Math.random() * 6.28, 0.2 + Math.random() * 0.5]);

  // falling debris (escape)
  const debris = [];
  for (let i = 0; i < 26; i++) {
    const m = new THREE.Mesh(kit.rockGeo, kit.rock);
    m.visible = false;
    scene.add(m);
    debris.push({ m, v: 0, life: 0 });
  }

  let level = null; // per-level state
  let quality = "high";
  let time = 0;
  const tmpV = new THREE.Vector3();
  const UP = new THREE.Vector3(0, 1, 0);

  /* ================================================================ level build */
  function clearLevel() {
    if (!level) return;
    scene.remove(level.group);
    level.group.traverse((o) => {
      if (o.userData.own) o.userData.own.forEach((x) => x.dispose());
      if (o.userData.ownGeo) o.userData.ownGeo.forEach((x) => x.dispose());
    });
    level.disposables.forEach((d) => d.dispose());
    level = null;
  }

  function setLevel(L, sim) {
    clearLevel();
    const zone = ZONES[L.zone] || ZONES[0];
    const group = new THREE.Group();
    scene.add(group);
    const disposables = [];
    const own = (x) => (disposables.push(x), x);
    level = { L, zone, group, disposables, views: new Map(), tiles: [], sources: [], exits: [], lightT: 0, sim };

    scene.fog.color.setHex(zone.fog);
    scene.fog.density = zone.fogDensity;
    scene.background.setHex(zone.fog).multiplyScalar(0.6);
    hemi.color.setHex(zone.ambient[0]);
    hemi.groundColor.setHex(zone.ambient[1]);
    hemi.intensity = zone.ambient[2];
    level.hemiBase = zone.ambient[2];
    lantern.color.setHex(zone.id === 3 ? 0xc8ffe8 : 0xffb070);

    const wt = wallTextures(zone, L.id);
    const ft = floorTextures(zone, L.id);
    own(wt.map);
    own(wt.bump);
    own(ft.map);
    own(ft.bump);
    const ceilTex = own(ceilingTexture(zone));
    const hi = quality === "high";
    const wallMat = own(new THREE.MeshStandardMaterial({ map: wt.map, bumpMap: hi ? wt.bump : null, bumpScale: 2.2, roughness: 0.92, vertexColors: true }));
    const floorMat = own(new THREE.MeshStandardMaterial({ map: ft.map, bumpMap: hi ? ft.bump : null, bumpScale: 1.6, roughness: 0.9, vertexColors: true }));
    const ceilMat = own(new THREE.MeshStandardMaterial({ map: ceilTex, roughness: 1, vertexColors: true }));
    const pitMat = own(new THREE.MeshStandardMaterial({ map: wt.map, roughness: 1, vertexColors: true }));
    const slabMat = own(new THREE.MeshStandardMaterial({ map: ft.map, bumpMap: hi ? ft.bump : null, bumpScale: 1.6, roughness: 0.9 }));
    level.wallMat = wallMat;

    const tileKind = (c, r) => {
      const t = sim.tileAt(c, r);
      return t ? t.t : "void";
    };
    const solidAt = (c, r) => SOLID.has(tileKind(c, r));
    const holeAt = (c, r) => ["pit", "trap", "crumble", "bridge"].includes(tileKind(c, r));

    // ---------------------------------------------------- merged shell
    const buckets = { wall: [], floor: [], ceil: [], pit: [] };
    const quad = (bucket, p, n, uv, col) => buckets[bucket].push({ p, n, uv, col });
    const cornerShade = (x, z) => {
      // vertex at grid corner (x,z in cells): darker the more solid cells touch it
      let k = 0;
      for (const [dc, dr] of [
        [-1, -1],
        [0, -1],
        [-1, 0],
        [0, 0],
      ])
        if (solidAt(x + dc, z + dr)) k++;
      return [1, 0.78, 0.6, 0.5, 0.5][k];
    };
    for (let r = 0; r < sim.H; r++) {
      for (let c = 0; c < sim.W; c++) {
        if (solidAt(c, r)) continue;
        const x0 = c * CELL,
          z0 = r * CELL,
          x1 = x0 + CELL,
          z1 = z0 + CELL;
        const hole = holeAt(c, r);
        if (!hole) {
          const cs = [cornerShade(c, r), cornerShade(c + 1, r), cornerShade(c + 1, r + 1), cornerShade(c, r + 1)];
          quad(
            "floor",
            [x0, 0, z0, x1, 0, z0, x1, 0, z1, x0, 0, z1],
            [0, 1, 0],
            [x0 / 4, z0 / 4, x1 / 4, z0 / 4, x1 / 4, z1 / 4, x0 / 4, z1 / 4],
            cs,
          );
        } else {
          // pit shaft: bottom + walls down where the neighbour is not a hole
          const D = -7;
          quad("pit", [x0, D, z0, x1, D, z0, x1, D, z1, x0, D, z1], [0, 1, 0], [0, 0, 0.5, 0, 0.5, 0.5, 0, 0.5], [0.05, 0.05, 0.05, 0.05]);
          for (const [d, [dc, dr]] of Object.entries(DIRS)) {
            if (holeAt(c + dc, r + dr)) continue;
            const pts = edge(c, r, d);
            quad("pit", [pts[0], 0, pts[1], pts[2], 0, pts[3], pts[2], D, pts[3], pts[0], D, pts[1]], [-dc, 0, -dr], [0, 0, 0.5, 0, 0.5, 0.8, 0, 0.8], [0.6, 0.6, 0.04, 0.04]);
          }
        }
        // ceiling
        quad("ceil", [x0, WALL_H, z1, x1, WALL_H, z1, x1, WALL_H, z0, x0, WALL_H, z0], [0, -1, 0], [x0 / 4, z1 / 4, x1 / 4, z1 / 4, x1 / 4, z0 / 4, x0 / 4, z0 / 4], [0.7, 0.7, 0.7, 0.7]);
        // walls
        for (const [d, [dc, dr]] of Object.entries(DIRS)) {
          if (!solidAt(c + dc, r + dr) || tileKind(c + dc, r + dr) === "pillar") continue;
          const pts = edge(c, r, d);
          const u0 = (pts[0] + pts[1]) / 4,
            u1 = u0 + CELL / 4;
          const vt = WALL_H / 4.4;
          quad(
            "wall",
            [pts[0], 0, pts[1], pts[2], 0, pts[3], pts[2], WALL_H, pts[3], pts[0], WALL_H, pts[1]],
            [-dc, 0, -dr],
            [u0, 0, u1, 0, u1, vt, u0, vt],
            [0.42, 0.42, 0.95, 0.95],
          );
        }
      }
    }
    /** Edge of cell (c,r) on side d, ordered so the quad faces into the cell. */
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
    const mats = { wall: wallMat, floor: floorMat, ceil: ceilMat, pit: pitMat };
    for (const [k, qs] of Object.entries(buckets)) {
      if (!qs.length) continue;
      const pos = [],
        nor = [],
        uv = [],
        col = [],
        idx = [];
      qs.forEach((q, i) => {
        pos.push(...q.p);
        for (let v = 0; v < 4; v++) nor.push(...q.n);
        uv.push(...q.uv);
        q.col.forEach((s) => col.push(s, s, s));
        const b = i * 4;
        idx.push(b, b + 2, b + 1, b, b + 3, b + 2);
      });
      const geo = own(new THREE.BufferGeometry());
      geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
      geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
      geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
      geo.setIndex(idx);
      // faces were wound for a −y-facing floor; flip winding where needed via side
      const mesh = new THREE.Mesh(geo, mats[k]);
      mats[k].side = THREE.DoubleSide;
      group.add(mesh);
    }

    // ---------------------------------------------------- pillars
    const pillarGeo = own(new THREE.CylinderGeometry(0.62, 0.7, WALL_H, 16));
    const capGeo = own(new THREE.CylinderGeometry(0.95, 0.6, 0.6, 16));
    const pillarTex = own(glyphTexture("djed", "block", zone));
    pillarTex.wrapS = pillarTex.wrapT = THREE.RepeatWrapping;
    pillarTex.repeat.set(3, 2);
    const pillarMat = own(new THREE.MeshStandardMaterial({ map: pillarTex, roughness: 0.9 }));
    for (const t of sim.tiles) {
      if (t.t !== "pillar") continue;
      const [x, z] = cellCenter(t.c, t.r);
      const p = new THREE.Mesh(pillarGeo, pillarMat);
      p.position.set(x, WALL_H / 2, z);
      const cap = new THREE.Mesh(capGeo, kit.goldDark);
      cap.position.set(x, WALL_H - 0.3, z);
      const base = new THREE.Mesh(kit.box, kit.stoneDark);
      base.scale.set(1.6, 0.3, 1.6);
      base.position.set(x, 0.15, z);
      group.add(p, cap, base);
    }

    // ---------------------------------------------------- tiles with state
    const spikeGeo = own(makeSpikeGeo());
    const grateMat = own(new THREE.MeshStandardMaterial({ color: 0x2a221a, roughness: 0.8, metalness: 0.3 }));
    const safeTex = L.safeGlyph ? own(glyphTexture(L.safeGlyph, "floor", zone)) : null;
    const trapTex = {};
    const decalMat = (tx) => own(new THREE.MeshStandardMaterial({ map: tx, transparent: true, opacity: 0.95, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2 }));
    const safeMat = safeTex ? decalMat(safeTex) : null;
    for (const t of sim.tiles) {
      const [x, z] = cellCenter(t.c, t.r);
      if (t.t === "spikes") {
        const grate = new THREE.Mesh(kit.box, grateMat);
        grate.scale.set(1.9, 0.04, 1.9);
        grate.position.set(x, 0.02, z);
        const sp = new THREE.Mesh(spikeGeo, kit.steel);
        sp.position.set(x, -0.9, z);
        group.add(grate, sp);
        level.tiles.push({ t, kind: "spikes", sp });
      } else if (t.t === "trap" || t.t === "crumble" || t.t === "bridge") {
        const slab = new THREE.Mesh(kit.box, slabMat);
        slab.scale.set(t.t === "bridge" ? 1.98 : 1.94, 0.4, t.t === "bridge" ? 1.98 : 1.94);
        slab.position.set(x, -0.2, z);
        const g = new THREE.Group();
        g.add(slab);
        if (t.t === "trap") {
          const ids = L.trapGlyphs || ["ankh", "eye", "scarab"];
          const id = ids[Math.floor(hash(t.c, t.r) * ids.length)];
          trapTex[id] ??= decalMat(own(glyphTexture(id, "floor", zone)));
          const d = new THREE.Mesh(kit.plane, trapTex[id]);
          d.rotation.x = -Math.PI / 2;
          d.scale.setScalar(1.5);
          d.position.set(x, 0.011, z);
          g.add(d);
        }
        if (t.t === "crumble") {
          const cr = new THREE.Mesh(kit.plane, own(new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25, depthWrite: false })));
          cr.rotation.x = -Math.PI / 2;
          cr.scale.setScalar(1.7);
          cr.position.set(x, 0.012, z);
          g.add(cr);
        }
        group.add(g);
        level.tiles.push({ t, kind: t.t, g, fall: 0 });
      } else if (t.safe && safeMat) {
        const d = new THREE.Mesh(kit.plane, safeMat);
        d.rotation.x = -Math.PI / 2;
        d.scale.setScalar(1.5);
        d.position.set(x, 0.011, z);
        group.add(d);
      } else if (t.t === "exit") {
        buildExit(t, x, z);
      }
    }

    // ---------------------------------------------------- devices
    const glyphMats = {};
    const glyphMat = (id, style) => (glyphMats[`${id}:${style}`] ??= own(new THREE.MeshStandardMaterial({ map: own(glyphTexture(id, style, zone)), roughness: 0.6, metalness: style === "dial" ? 0.3 : 0 })));
    const doorMat = own(new THREE.MeshStandardMaterial({ map: own(doorTexture(zone, false)), roughness: 0.85 }));
    const goldDoorMat = own(new THREE.MeshStandardMaterial({ map: own(doorTexture(zone, true)), roughness: 0.35, metalness: 0.85 }));
    const mountedCells = new Set();
    for (const e of sim.ents) {
      if (e.wall) mountedCells.add(`${e.c},${e.r},${e.dir}`);
      const v = buildEnt(e, { glyphMat, doorMat, goldDoorMat, wallMat, own });
      if (v) {
        group.add(v.obj);
        level.views.set(e.id, v);
      }
    }

    // ---------------------------------------------------- torches
    const torchSpots = L.torches || autoTorches(sim, mountedCells);
    for (const [c, r, d] of torchSpots) {
      const tg = buildTorch(kit);
      placeOnWall(tg, c, r, d, 2.35);
      const fl = new THREE.Sprite(flameMat);
      fl.scale.set(0.34, 0.5, 1);
      fl.position.set(0, 0.48, -0.42);
      const gl = new THREE.Sprite(glowMat);
      gl.scale.setScalar(1.6);
      gl.position.copy(fl.position);
      tg.add(fl, gl);
      group.add(tg);
      const p = new THREE.Vector3();
      fl.getWorldPosition(p);
      tg.updateMatrixWorld(true);
      fl.getWorldPosition(p);
      level.sources.push({ pos: p.clone(), color: zone.torch, power: 9, on: () => true, flick: hash(c, r) * 10, flame: fl });
    }

    // ---------------------------------------------------- decorations
    const obeliskMat = own(new THREE.MeshStandardMaterial({ map: own(glyphTexture("eye", "block", zone)), roughness: 0.85 }));
    (L.deco || []).forEach(([kind, c, r], i) => {
      const [x, z] = cellCenter(c, r);
      let o;
      if (kind === "gold") o = buildGoldPile(kit, i + L.id * 7);
      else if (kind === "obelisk") o = buildObelisk(kit, obeliskMat);
      else if (kind === "pharaoh" || kind === "anubis") o = buildStatue(kit, kind, 1.25);
      else if (kind === "sarcophagusDeco") o = buildContainer(kit, "sarcophagus");
      else if (kind === "jars") {
        o = new THREE.Group();
        for (let k = 0; k < 3; k++) {
          const j = buildContainer(kit, "jar");
          j.position.set((k - 1) * 0.5, 0, (k % 2) * 0.3);
          j.scale.setScalar(0.8);
          o.add(j);
        }
      }
      if (!o) return;
      o.position.set(x, 0, z);
      if (kind === "pharaoh") o.rotation.y = DIR_YAW.s;
      group.add(o);
    });

    // ---------------------------------------------------- sun shafts (open-ceiling zone)
    if (zone.ceiling === "open") {
      const shaftMat = own(new THREE.MeshBasicMaterial({ map: sprites.glow, color: 0xffd890, transparent: true, opacity: 0.12, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
      let n = 0;
      for (const t of sim.tiles) {
        if (t.t !== "floor" || hash(t.c * 3, t.r * 5) > 0.12 || n > 6) continue;
        n++;
        const [x, z] = cellCenter(t.c, t.r);
        for (let k = 0; k < 2; k++) {
          const s = new THREE.Mesh(kit.plane, shaftMat);
          s.scale.set(1.4, WALL_H * 1.2, 1);
          s.position.set(x + 0.4, WALL_H / 2, z + 0.2);
          s.rotation.set(0, k * Math.PI / 2 + 0.4, 0.22);
          group.add(s);
        }
      }
    }

    // ---------------------------------------------------- helpers in scope
    function buildExit(t, x, z) {
      // the exit faces away from its only open neighbour
      let wallDir = "n";
      for (const d of ["n", "e", "s", "w"]) {
        const [dc, dr] = DIRS[d];
        if (!solidAt(t.c + dc, t.r + dr) && !holeAt(t.c + dc, t.r + dr)) wallDir = OPPOSITE[d];
      }
      const g = new THREE.Group();
      const lightMat = own(new THREE.MeshBasicMaterial({ map: sprites.glow, color: 0xfff0c8, transparent: true, opacity: 0.95, depthWrite: false, toneMapped: false }));
      const glow = new THREE.Mesh(kit.plane, lightMat);
      glow.scale.set(2.6, 3.6, 1);
      glow.position.set(0, 1.7, -0.98);
      glow.rotation.y = Math.PI;
      const core = new THREE.Mesh(kit.plane, own(new THREE.MeshBasicMaterial({ color: 0xfff6e0, toneMapped: false })));
      core.scale.set(1.5, 2.6, 1);
      core.position.set(0, 1.3, -0.99);
      core.rotation.y = Math.PI;
      g.add(glow, core);
      for (let k = 0; k < 3; k++) {
        const st = new THREE.Mesh(kit.box, kit.stone);
        st.scale.set(1.5, 0.18 * (k + 1), 0.4);
        st.position.set(0, 0.09 * (k + 1), -0.4 - k * 0.2);
        g.add(st);
      }
      const shaft = new THREE.Sprite(own(spriteMat(sprites.glow, 0xfff0c0, 0.35)));
      shaft.scale.set(3, 4, 1);
      shaft.position.set(0, 1.8, -0.4);
      g.add(shaft);
      g.position.set(x, 0, z);
      g.rotation.y = DIR_YAW[wallDir] + 0;
      // group −z must point at the wall: rotate so forward = wallDir
      group.add(g);
      const p = new THREE.Vector3(x + DIRS[wallDir][0] * 0.6, 1.8, z + DIRS[wallDir][1] * 0.6);
      level.sources.push({ pos: p, color: 0xfff0d0, power: 14, on: () => true, flick: 0, steady: true });
      level.exits.push(g);
    }
    return level;
  }

  function makeSpikeGeo() {
    const geos = [];
    const base = new THREE.ConeGeometry(0.075, 0.85, 6);
    base.translate(0, 0.42, 0);
    for (let i = 0; i < 4; i++)
      for (let j = 0; j < 4; j++) {
        const g = base.clone();
        g.translate(-0.66 + i * 0.44, 0, -0.66 + j * 0.44);
        geos.push(g);
      }
    const pos = [],
      nor = [],
      idx = [];
    let off = 0;
    for (const g of geos) {
      const gi = g.index ? g.index.array : null;
      pos.push(...g.attributes.position.array);
      nor.push(...g.attributes.normal.array);
      if (gi) for (const k of gi) idx.push(k + off);
      off += g.attributes.position.count;
      g.dispose();
    }
    base.dispose();
    const out = new THREE.BufferGeometry();
    out.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    out.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
    out.setIndex(idx);
    return out;
  }

  function autoTorches(sim, mounted) {
    const out = [];
    for (const t of sim.tiles) {
      if (t.t !== "floor" && t.t !== "spikes") continue;
      for (const [d, [dc, dr]] of Object.entries(DIRS)) {
        const n = sim.tileAt(t.c + dc, t.r + dr);
        if (!n || n.t !== "wall") continue;
        if (mounted.has(`${t.c},${t.r},${d}`)) continue;
        if (hash(t.c * 7 + dr, t.r * 13 + dc) < 0.82) continue;
        if (out.some(([c, r]) => Math.abs(c - t.c) + Math.abs(r - t.r) < 3)) continue;
        out.push([t.c, t.r, d]);
      }
    }
    return out.slice(0, 16);
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
    const v = { obj: g, e, update: null };
    switch (e.t) {
      case "door": {
        const tAt = (dc, dr) => level.sim.tileAt(e.c + dc, e.r + dr);
        const spanX = tAt(-1, 0) && SOLID.has(tAt(-1, 0).t) && tAt(1, 0) && SOLID.has(tAt(1, 0).t);
        const mat = e.secret ? ctx.wallMat : e.kind === "gold" ? ctx.goldDoorMat : ctx.doorMat;
        const slab = new THREE.Mesh(kit.box, mat);
        slab.scale.set(CELL, WALL_H, e.secret ? CELL * 0.98 : 0.5);
        if (e.secret) slab.scale.set(CELL * 0.999, WALL_H, CELL * 0.999);
        slab.position.y = WALL_H / 2;
        const inner = new THREE.Group();
        inner.add(slab);
        if (!e.secret) {
          const lintel = new THREE.Mesh(kit.box, kit.goldDark);
          lintel.scale.set(CELL, 0.18, 0.6);
          lintel.position.y = WALL_H - 0.09;
          g.add(lintel);
        }
        g.add(inner);
        g.position.set(x, 0, z);
        if (!spanX) g.rotation.y = Math.PI / 2;
        v.update = () => {
          inner.position.y = -e.open * (WALL_H + 0.05);
          inner.visible = e.open < 0.995;
          if (e.open > 0 && e.open < 1) inner.position.x = Math.sin(time * 60) * 0.012;
        };
        break;
      }
      case "dial": {
        const lock = level.sim.locks[e.lock];
        const disc = new THREE.Mesh(kit.disc, [kit.goldDark, ctx.glyphMat(lock.symbols[e.cur], "dial"), kit.goldDark]);
        disc.scale.set(0.38, 0.12, 0.38);
        disc.rotation.x = Math.PI / 2;
        disc.position.z = -0.08;
        const ring = new THREE.Mesh(kit.torus, kit.gold);
        ring.scale.set(0.42, 0.42, 0.3);
        ring.position.z = -0.08;
        const spin = new THREE.Group();
        spin.add(disc);
        g.add(spin, ring);
        placeOnWall(g, e.c, e.r, e.dir, MOUNT.dial.y);
        let shown = e.cur,
          sp = 0;
        v.update = (dt) => {
          if (e.cur !== shown) {
            shown = e.cur;
            disc.material[1] = ctx.glyphMat(lock.symbols[e.cur], "dial");
            sp = 1;
          }
          sp = Math.max(0, sp - dt * 3.5);
          spin.rotation.z = sp * sp * Math.PI * 2;
          ring.material = lock.solved ? kit.gold : kit.goldDark;
          disc.material[0] = lock.solved ? kit.gold : kit.goldDark;
        };
        v.glow = () => (lock.solved ? 1 : 0);
        break;
      }
      case "clue": {
        const L = level.L;
        const clue = L.clues?.[e.clue] || {};
        const tx = ctx.own(panelTexture(e.kind === "painting" ? "painting" : "inscription", clue.glyphs, level.zone, L.id * 10 + e.c));
        const mat = ctx.own(new THREE.MeshStandardMaterial({ map: tx, roughness: 0.85 }));
        if (e.wall) {
          const p = new THREE.Mesh(kit.plane, mat);
          p.scale.set(MOUNT.clue.w * 2, MOUNT.clue.h * 2, 1);
          p.position.z = -0.045;
          p.rotation.y = Math.PI;
          const frame = new THREE.Mesh(kit.box, e.kind === "painting" ? kit.goldDark : kit.stoneDark);
          frame.scale.set(MOUNT.clue.w * 2 + 0.12, MOUNT.clue.h * 2 + 0.12, 0.05);
          frame.position.z = -0.01;
          g.add(frame, p);
          placeOnWall(g, e.c, e.r, e.dir, MOUNT.clue.y);
        } else {
          const st = new THREE.Mesh(kit.box, kit.stone);
          st.scale.set(0.95, 1.9, 0.32);
          st.position.y = 0.95;
          const top = new THREE.Mesh(kit.cyl, kit.stone);
          top.scale.set(0.475, 0.32, 0.475);
          top.rotation.x = Math.PI / 2;
          top.position.y = 1.9;
          for (const s of [-1, 1]) {
            const face = new THREE.Mesh(kit.plane, mat);
            face.scale.set(0.82, 0.7, 1);
            face.position.set(0, 1.35, s * 0.165);
            if (s < 0) face.rotation.y = Math.PI;
            g.add(face);
          }
          g.add(st, top);
          g.position.set(x, 0, z);
        }
        break;
      }
      case "statue": {
        const s = buildStatue(kit, e.kind);
        g.add(s);
        g.position.set(x, 0, z);
        let yaw = DIR_YAW[e.face];
        g.rotation.y = yaw;
        v.update = (dt) => {
          const want = DIR_YAW[e.face];
          let d = ((want - yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
          yaw += d * Math.min(1, dt * 7);
          if (Math.abs(d) < 1e-3) yaw = want;
          g.rotation.y = yaw;
          s.position.x = Math.abs(d) > 0.02 ? Math.sin(time * 70) * 0.01 : 0;
        };
        break;
      }
      case "block": {
        const m = new THREE.Mesh(kit.box, ctx.glyphMat(e.kind === "jar" ? "lotus" : "scarab", "block"));
        m.scale.set(1.8, 1.7, 1.8);
        m.position.y = 0.85;
        g.add(m);
        v.update = () => {
          const b = level.sim.entBox(e);
          g.position.set(b.c[0], 0, b.c[2]);
          g.visible = !e.gone || e.slide < 1;
          if (e.filling) g.position.y = -e.slide * 0.6 - (e.gone ? 10 : 0);
        };
        break;
      }
      case "plate": {
        const p = new THREE.Mesh(kit.box, ctx.glyphMat("feather", "plate"));
        p.scale.set(1.6, 0.12, 1.6);
        const rim = new THREE.Mesh(kit.box, kit.goldDark);
        rim.scale.set(1.7, 0.06, 1.7);
        rim.position.y = 0.01;
        g.add(rim, p);
        g.position.set(x, 0, z);
        let k = 0;
        v.update = (dt) => {
          const on = e.pressed || e.latched;
          k += ((on ? 1 : 0) - k) * Math.min(1, dt * 10);
          p.position.y = 0.06 - k * 0.05;
          rim.material = on ? kit.gold : kit.goldDark;
        };
        v.glow = () => (e.pressed || e.latched ? 0.6 : 0);
        break;
      }
      case "lever": {
        if (e.hidden) {
          const tex = ctx.glyphMat("cobra", "block");
          const brick = new THREE.Mesh(kit.box, [ctx.wallMat, ctx.wallMat, ctx.wallMat, ctx.wallMat, ctx.wallMat, tex]);
          brick.scale.set(0.66, 0.44, 0.12);
          brick.position.z = -0.05;
          brick.rotation.y = Math.PI;
          g.add(brick);
          placeOnWall(g, e.c, e.r, e.dir, MOUNT.hidden.y);
          v.update = () => (brick.position.z = e.on ? 0.02 : -0.05);
        } else {
          const plate = new THREE.Mesh(kit.box, kit.stoneDark);
          plate.scale.set(0.42, 0.62, 0.08);
          plate.position.z = -0.04;
          const pivot = new THREE.Group();
          pivot.position.z = -0.1;
          const handle = new THREE.Mesh(kit.cyl, kit.bronze);
          handle.scale.set(0.035, 0.55, 0.035);
          handle.position.y = 0.27;
          const knob = new THREE.Mesh(kit.sphere, kit.gold);
          knob.scale.setScalar(0.07);
          knob.position.y = 0.56;
          pivot.add(handle, knob);
          g.add(plate, pivot);
          placeOnWall(g, e.c, e.r, e.dir, MOUNT.lever.y);
          let a = e.on ? 1 : 0;
          v.update = (dt) => {
            a += ((e.on ? 1 : 0) - a) * Math.min(1, dt * 9);
            pivot.rotation.x = -0.7 + a * 1.4 + Math.PI;
          };
        }
        break;
      }
      case "socket": {
        const it = ITEMS[e.item];
        const w = e.kind === "altar" ? 1.0 : 0.7;
        const ped = new THREE.Mesh(kit.box, ctx.glyphMat(it.glyph || "ankh", "pedestal"));
        ped.scale.set(w, 1.0, 0.7);
        ped.position.y = 0.5;
        const top = new THREE.Mesh(kit.box, kit.goldDark);
        top.scale.set(w + 0.1, 0.08, 0.8);
        top.position.y = 1.04;
        g.add(ped, top);
        const item = buildItem(kit, e.item, it.color);
        item.position.y = 1.4;
        item.visible = false;
        g.add(item);
        g.position.set(x, 0, z);
        v.update = () => {
          item.visible = !!e.filled;
          item.rotation.y = time * 0.8;
          top.material = e.filled ? kit.gold : kit.goldDark;
        };
        v.source = { power: 3.5, color: 0xffd080, on: () => !!e.filled, y: 1.5 };
        break;
      }
      case "item": {
        const it = ITEMS[e.item];
        const plinth = new THREE.Mesh(kit.cyl8, kit.stoneDark);
        plinth.scale.set(0.24, 0.62, 0.24);
        plinth.position.y = 0.31;
        const mesh = buildItem(kit, e.item, it.color);
        const gl = new THREE.Sprite(ctx.own(spriteMat(sprites.glow, it.color, 0.45)));
        gl.scale.setScalar(0.9);
        g.add(plinth, mesh, gl);
        g.position.set(x, 0, z);
        v.update = () => {
          mesh.visible = gl.visible = !e.gone;
          mesh.position.y = 1.0 + Math.sin(time * 2 + x) * 0.05;
          gl.position.y = mesh.position.y;
          mesh.rotation.y = time * 1.2;
        };
        if (e.item === "heart") v.source = { power: 6, color: 0xff3040, on: () => !e.gone, y: 1.1 };
        break;
      }
      case "chest": {
        const kind = e.kind || "chest";
        const c = buildContainer(kit, kind);
        g.add(c);
        g.position.set(x, 0, z);
        let k = 0;
        v.update = (dt) => {
          k += ((e.opened ? 1 : 0) - k) * Math.min(1, dt * 5);
          openContainer(c, kind, k);
        };
        break;
      }
      case "brazier": {
        const leg = new THREE.Mesh(kit.box, e.glyph ? ctx.glyphMat(e.glyph, "pedestal") : kit.stoneDark);
        leg.scale.set(0.5, 0.75, 0.5);
        leg.position.y = 0.375;
        const bowl = new THREE.Mesh(kit.bowl, kit.bronze);
        bowl.position.y = 0.75;
        bowl.scale.setScalar(1.1);
        const coals = new THREE.Mesh(kit.cyl, kit.black);
        coals.scale.set(0.38, 0.05, 0.38);
        coals.position.y = 1.05;
        const fl = new THREE.Sprite(flameMat);
        fl.scale.set(0.8, 1.1, 1);
        fl.position.y = 1.5;
        const fl2 = new THREE.Sprite(flameMat);
        fl2.scale.set(0.5, 0.8, 1);
        fl2.position.set(0.12, 1.4, 0.05);
        const gl = new THREE.Sprite(glowMat);
        gl.scale.setScalar(2.6);
        gl.position.y = 1.4;
        g.add(leg, bowl, coals, fl, fl2, gl);
        g.position.set(x, 0, z);
        v.update = () => {
          fl.visible = fl2.visible = gl.visible = !!e.lit;
          if (e.lit) {
            fl.scale.set(0.8 + Math.sin(time * 13 + x) * 0.06, 1.1 + Math.sin(time * 17) * 0.1, 1);
            fl2.scale.y = 0.8 + Math.sin(time * 11 + 2) * 0.1;
          }
        };
        v.source = { power: 10, color: 0xff9a40, on: () => !!e.lit, y: 1.6 };
        break;
      }
      case "sconce": {
        const tg = buildTorch(kit);
        const fl = new THREE.Sprite(flameMat);
        fl.scale.set(0.34, 0.5, 1);
        fl.position.set(0, 0.48, -0.42);
        const gl = new THREE.Sprite(glowMat);
        gl.scale.setScalar(1.6);
        gl.position.copy(fl.position);
        const stick = tg.children.slice(1);
        tg.add(fl, gl);
        g.add(tg);
        placeOnWall(g, e.c, e.r, e.dir, MOUNT.sconce.y);
        v.update = () => {
          fl.visible = gl.visible = !e.taken;
          stick.forEach((s) => (s.visible = !e.taken));
        };
        g.updateMatrixWorld(true);
        const p = new THREE.Vector3();
        fl.getWorldPosition(p);
        v.source = { power: 9, color: 0xffa040, on: () => !e.taken, at: p };
        break;
      }
      case "mirror": {
        const base = new THREE.Mesh(kit.cyl, kit.stoneDark);
        base.scale.set(0.5, 0.2, 0.5);
        base.position.y = 0.1;
        const spin = new THREE.Group();
        for (const s of [-1, 1]) {
          const post = new THREE.Mesh(kit.box, kit.bronze);
          post.scale.set(0.08, 1.75, 0.08);
          post.position.set(s * 0.56, 0.95, 0);
          spin.add(post);
        }
        const bar = new THREE.Mesh(kit.box, kit.bronze);
        bar.scale.set(1.2, 0.08, 0.08);
        bar.position.y = 1.82;
        const disc = new THREE.Mesh(kit.disc, kit.mirror);
        disc.scale.set(0.5, 0.04, 0.5);
        disc.rotation.x = Math.PI / 2;
        disc.position.y = BEAM_Y;
        const back = new THREE.Mesh(kit.ring, kit.gold);
        back.scale.set(0.52, 0.52, 0.52);
        back.position.y = BEAM_Y;
        spin.add(bar, disc, back);
        g.add(base, spin);
        g.position.set(x, 0, z);
        let ang = Math.PI / 4 + e.rot * (Math.PI / 2);
        v.update = (dt) => {
          disc.visible = back.visible = !e.empty;
          const want = Math.PI / 4 + e.rot * (Math.PI / 2);
          let d = ((want - ang + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
          ang += d * Math.min(1, dt * 8);
          spin.rotation.y = ang;
        };
        break;
      }
      case "receiver": {
        const ped = new THREE.Mesh(kit.cyl8, kit.stoneDark);
        ped.scale.set(0.35, 0.9, 0.35);
        ped.position.y = 0.45;
        const horns = new THREE.Mesh(kit.torus, kit.goldDark);
        horns.scale.set(0.42, 0.42, 0.42);
        horns.position.y = BEAM_Y;
        const mat = ctx.own(new THREE.MeshStandardMaterial({ color: 0xe8b84a, metalness: 1, roughness: 0.25, emissive: 0xffa020, emissiveIntensity: 0 }));
        const orb = new THREE.Mesh(kit.sphere, mat);
        orb.scale.setScalar(0.3);
        orb.position.y = BEAM_Y;
        const gl = new THREE.Sprite(ctx.own(spriteMat(sprites.glow, 0xffd070, 0.9)));
        gl.scale.setScalar(2.4);
        gl.position.y = BEAM_Y;
        g.add(ped, horns, orb, gl);
        g.position.set(x, 0, z);
        let k = 0;
        v.update = (dt) => {
          k += ((e.lit ? 1 : 0) - k) * Math.min(1, dt * 6);
          mat.emissiveIntensity = k * 2.2;
          gl.visible = k > 0.05;
          gl.material.opacity = k * 0.9;
          horns.rotation.y = time * 0.4;
        };
        v.source = { power: 7, color: 0xffd070, on: () => !!e.lit, y: BEAM_Y };
        break;
      }
      case "sun": {
        const winMat = ctx.own(new THREE.MeshBasicMaterial({ map: ctx.own(glyphTexture("sun", "dial", level.zone)), color: 0xffffff, toneMapped: false }));
        const win = new THREE.Mesh(kit.plane, winMat);
        win.scale.set(1.0, 1.0, 1);
        win.position.z = -0.02;
        win.rotation.y = Math.PI;
        const glow = new THREE.Sprite(ctx.own(spriteMat(sprites.glow, 0xffe0a0, 0.9)));
        glow.scale.setScalar(2.2);
        glow.position.z = -0.2;
        const shutter = new THREE.Mesh(kit.box, kit.stoneDark);
        shutter.scale.set(1.2, 1.2, 0.12);
        shutter.position.z = -0.08;
        g.add(win, glow, shutter);
        placeOnWall(g, e.c, e.r, e.dir, BEAM_Y);
        const allOn = () => !e.need || e.need.every((k) => level.sim.sigs[k]);
        let k = allOn() ? 1 : 0;
        v.update = (dt) => {
          k += ((allOn() ? 1 : 0) - k) * Math.min(1, dt * 2);
          shutter.position.y = k * 1.3;
          shutter.visible = k < 0.98;
          glow.material.opacity = 0.9 * k;
        };
        g.updateMatrixWorld(true);
        const p = new THREE.Vector3();
        glow.getWorldPosition(p);
        v.source = { power: 8, color: 0xffe0a0, on: allOn, at: p };
        break;
      }
      case "mover": {
        if (e.kind === "boulder") {
          const geo = new THREE.IcosahedronGeometry(1, 2);
          const pa = geo.attributes.position;
          for (let i = 0; i < pa.count; i++) {
            tmpV.fromBufferAttribute(pa, i);
            const n = 1 + (hash(Math.round(tmpV.x * 9), Math.round(tmpV.y * 9 + tmpV.z * 5)) - 0.5) * 0.18;
            tmpV.multiplyScalar(n);
            pa.setXYZ(i, tmpV.x, tmpV.y, tmpV.z);
          }
          geo.computeVertexNormals();
          const ball = new THREE.Mesh(geo, kit.rock);
          ball.userData.ownGeo = [geo];
          ball.scale.setScalar(0.95);
          ball.position.y = 0.95;
          g.add(ball);
          let lx = e.pos[0],
            lz = e.pos[1];
          v.update = () => {
            g.position.set(e.pos[0], 0, e.pos[1]);
            const dx = e.pos[0] - lx,
              dz = e.pos[1] - lz;
            ball.rotation.z -= dx / 0.95;
            ball.rotation.x += dz / 0.95;
            lx = e.pos[0];
            lz = e.pos[1];
          };
        } else {
          const blade = new THREE.Mesh(kit.disc, kit.steel);
          blade.scale.set(0.8, 0.05, 0.8);
          const spin = new THREE.Group();
          spin.add(blade);
          for (let k = 0; k < 8; k++) {
            const tooth = new THREE.Mesh(kit.cone4, kit.steel);
            tooth.scale.set(0.12, 0.25, 0.04);
            const a = (k / 8) * Math.PI * 2;
            tooth.position.set(Math.cos(a) * 0.86, 0, Math.sin(a) * 0.86);
            tooth.rotation.set(0, -a, -Math.PI / 2);
            spin.add(tooth);
          }
          spin.position.y = 0.95;
          const [fx, fz] = cellCenter(...e.from),
            [tx, tz] = cellCenter(...e.to);
          const alongX = Math.abs(tx - fx) > Math.abs(tz - fz);
          // the disc stands upright in the plane of its travel
          spin.rotation.set(Math.PI / 2, 0, 0);
          if (!alongX) spin.rotation.set(Math.PI / 2, 0, Math.PI / 2);
          const holder = new THREE.Group();
          holder.add(spin);
          g.add(holder);
          // floor slot along the track
          const slot = new THREE.Mesh(kit.box, kit.black);
          const len = Math.hypot(tx - fx, tz - fz) + 1.8;
          slot.scale.set(alongX ? len : 0.14, 0.02, alongX ? 0.14 : len);
          slot.position.set((fx + tx) / 2, 0.012, (fz + tz) / 2);
          level.group.add(slot);
          v.update = (dt) => {
            g.position.set(e.pos[0], 0, e.pos[1]);
            if (!e.stopped) spin.rotateY(dt * 14);
          };
        }
        break;
      }
      default:
        return null;
    }
    v.update ||= () => {};
    return v;
  }

  /* ================================================================ frame */
  function render(sim, dt, view = {}) {
    time += dt;
    if (!level || !sim) {
      renderer.render(scene, camera);
      return;
    }
    level.sim = sim;
    const p = sim.player;
    const bobK = Math.min(1, p.speed / 4);
    let shake = view.shake || 0;
    if (sim.escape && sim.state !== "complete") shake = Math.max(shake, 0.035 + (sim.escape.left < 10 ? 0.03 : 0));
    camera.position.set(
      p.x + (Math.random() - 0.5) * shake,
      EYE + p.y + Math.sin(p.bob * 2) * 0.045 * bobK + (view.dip || 0) + (Math.random() - 0.5) * shake,
      p.z + (Math.random() - 0.5) * shake,
    );
    camera.rotation.set(p.pitch, p.yaw, Math.sin(p.bob) * 0.006 * bobK);

    // devices
    for (const v of level.views.values()) v.update(dt);

    // tiles
    for (const tv of level.tiles) {
      const t = tv.t;
      if (tv.kind === "spikes") {
        const k = sim.spikeLevel(t);
        const w = sim.spikeWarn(t);
        tv.sp.position.y = -0.88 + k * 0.88 + (w > 0 ? Math.sin(time * 60) * 0.02 * w + w * 0.08 : 0);
      } else if (tv.kind === "bridge") {
        const on = sim.tileKind(t.c, t.r) === "floor";
        tv.fall += ((on ? 1 : 0) - tv.fall) * Math.min(1, dt * 4);
        tv.g.position.y = -(1 - tv.fall) * 1.2;
        tv.g.visible = tv.fall > 0.02;
      } else {
        if (t.collapsed) {
          tv.fall += dt;
          tv.g.position.y = -tv.fall * tv.fall * 9;
          tv.g.rotation.z = tv.fall * 0.6 * (hash(t.c, t.r) - 0.5);
          tv.g.visible = tv.fall < 1.3;
        } else {
          tv.fall = 0;
          tv.g.visible = true;
          tv.g.rotation.z = 0;
          tv.g.position.y = t.ct > 0 ? Math.sin(time * 70) * 0.025 - 0.02 : 0;
        }
      }
    }

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
      bm.glow.scale.set(0.11 * f, len, 0.11 * f);
      bm.core.visible = bm.glow.visible = true;
      bm.spark.visible = kind !== "mirror";
      bm.spark.position.set(...b);
      bm.spark.scale.setScalar(0.6 + Math.sin(time * 25 + bi) * 0.1);
    }
    for (let i = bi; i < beamPool.length; i++) beamPool[i].core.visible = beamPool[i].glow.visible = beamPool[i].spark.visible = false;

    // focus marker
    if (sim.focus && sim.state === "play") {
      const bx = sim.entBox(sim.focus.ent);
      marker.visible = true;
      marker.position.set(bx.c[0], Math.min(bx.max[1] + 0.18, WALL_H - 0.3), bx.c[2]);
      if (sim.focus.ent.wall) marker.position.set(bx.c[0], bx.max[1] + 0.12, bx.c[2]);
      marker.scale.setScalar(0.16 + Math.sin(time * 5) * 0.03);
      markerMat.color.setHex(sim.focus.locked ? 0xff8060 : 0xffe08a);
    } else marker.visible = false;

    // lights: nearest active sources
    level.lightT -= dt;
    if (level.lightT <= 0) {
      level.lightT = 0.2;
      const cands = [];
      for (const s of level.sources) if (s.on()) cands.push(s);
      for (const v of level.views.values()) {
        if (!v.source || !v.source.on()) continue;
        const src = v.source;
        src.pos ||= src.at || new THREE.Vector3(v.obj.position.x, src.y ?? 1.5, v.obj.position.z);
        if (v.e.t === "item" || v.e.t === "socket") src.pos.set(v.obj.position.x, src.y ?? 1.5, v.obj.position.z);
        cands.push(src);
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
      const fl = s.steady ? 1 : 0.86 + Math.sin(time * 9 + (s.flick || i)) * 0.07 + Math.sin(time * 23 + i) * 0.05;
      l.intensity = s.power * fl;
    });
    lantern.intensity = 4.5 + Math.sin(time * 7) * 0.2;

    // curse escape: red pulse + debris
    if (sim.escape && sim.state !== "complete") {
      const pulse = 0.5 + 0.5 * Math.sin(time * 4);
      hemi.color.setRGB(1, 0.45 + 0.2 * pulse, 0.35);
      hemi.intensity = level.hemiBase * (0.8 + pulse * 0.4);
      for (const d of debris) {
        if (d.life <= 0 && Math.random() < dt * 3) {
          d.life = 1;
          d.m.visible = true;
          d.m.position.set(p.x + (Math.random() - 0.5) * 8, WALL_H - 0.1, p.z + (Math.random() - 0.5) * 8);
          d.m.scale.setScalar(0.05 + Math.random() * 0.12);
          d.v = 0;
        }
        if (d.life > 0) {
          d.v += dt * 12;
          d.m.position.y -= d.v * dt;
          d.m.rotation.x += dt * 3;
          if (d.m.position.y < 0.05) {
            d.life = 0;
            d.m.visible = false;
          }
        }
      }
    } else if (level) {
      for (const d of debris) d.m.visible = false;
    }

    // dust drifts around the camera
    if (quality === "high") {
      dust.visible = true;
      const a = dustGeo.attributes.position.array;
      for (let i = 0; i < DUST; i++) {
        const k = i * 3;
        const [ph, sp] = dustSeed[i];
        a[k] += Math.sin(time * 0.3 + ph) * dt * 0.08;
        a[k + 1] += (Math.sin(time * 0.2 + ph * 2) * 0.05 - 0.02 * sp) * dt;
        a[k + 2] += Math.cos(time * 0.25 + ph) * dt * 0.08;
        // wrap into a 14 m box around the camera
        for (let j = 0; j < 3; j++) {
          const c = j === 1 ? 2 : j === 0 ? camera.position.x : camera.position.z;
          const half = j === 1 ? 2.2 : 7;
          if (a[k + j] < c - half) a[k + j] += half * 2;
          else if (a[k + j] > c + half) a[k + j] -= half * 2;
        }
      }
      dustGeo.attributes.position.needsUpdate = true;
    } else dust.visible = false;

    for (const ex of level.exits) ex.children.forEach((c, i) => c.isSprite && (c.material.opacity = 0.3 + Math.sin(time * 1.5 + i) * 0.06));

    renderer.render(scene, camera);
  }

  function resize(w, h) {
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  function setFov(f) {
    camera.fov = f;
    camera.updateProjectionMatrix();
  }
  function setQuality(q) {
    quality = q;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q === "high" ? 1.5 : 1));
  }

  const onRestore = () => {
    envTex.dispose();
    pmrem.dispose();
    pmrem = new THREE.PMREMGenerator(renderer);
    envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;
  };
  renderer.domElement.addEventListener("webglcontextrestored", onRestore);

  function dispose() {
    renderer.domElement.removeEventListener("webglcontextrestored", onRestore);
    clearLevel();
    kit.dispose();
    Object.values(sprites).forEach((t) => t.dispose());
    [flameMat, glowMat, markerMat, beamCoreMat, beamGlowMat, dustMat].forEach((m) => m.dispose());
    beamPool.forEach((b) => b.spark.material.dispose());
    beamGeo.dispose();
    dustGeo.dispose();
    envTex.dispose();
    pmrem.dispose();
    renderer.dispose();
    renderer.forceContextLoss?.();
    renderer.domElement.remove();
  }

  return { renderer, scene, camera, setLevel, render, resize, setFov, setQuality, dispose, get quality() { return quality; } };
}
