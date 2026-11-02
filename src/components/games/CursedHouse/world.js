/**
 * The Cursed House — Three.js renderer. Builds the house from the same data
 * the simulation collides with (sim.js LAYOUT + data.js), merges everything
 * static into a few batched meshes, and draws a game state each frame:
 * camera (head bob, hiding views, the capture scare), flashlight with subtle
 * flicker, doors / drawers / wardrobe doors, keys, and the widow's rig.
 * Holds no game logic.
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { LAYOUT } from "./sim.js";
import { LEVEL, FLOORS, HIDES, KEY_SPOTS, WINDOWS, WALL_T, DOOR_H, START } from "./data.js";
import { makeMaterials, BUILD, buildDoor, buildKey, buildWidow, mesh } from "./models.js";
import { blob } from "./textures.js";

const FOG = 0x050505;
const FACE_ROT = { s: 0, n: Math.PI, e: Math.PI / 2, w: -Math.PI / 2, nw: (-3 * Math.PI) / 4 };
const ease = (t) => t * t * (3 - 2 * t);

/** Box geometry in world space with world-aligned UVs. */
function worldBox(x0, y0, z0, x1, y1, z1, { su = 2, sv = 2, base = 0, sf = 2 } = {}) {
  const geo = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
  geo.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  const p = geo.attributes.position, n = geo.attributes.normal, uv = geo.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const nx = Math.abs(n.getX(i)), ny = Math.abs(n.getY(i));
    if (ny > 0.5) uv.setXY(i, x / sf, z / sf);
    else if (nx > 0.5) uv.setXY(i, z / su, (y - base) / sv);
    else uv.setXY(i, x / su, (y - base) / sv);
  }
  return geo;
}

export function createWorld(container) {
  const preserve = !!container.dataset.preserve;
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance", preserveDrawingBuffer: preserve });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.className = "ch-canvas";
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(FOG);
  scene.fog = new THREE.FogExp2(FOG, 0.085);
  const camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.04, 60);
  camera.rotation.order = "YXZ";
  scene.add(camera);

  const disposables = [];
  const track = (o) => {
    disposables.push(o);
    return o;
  };
  const M = makeMaterials(track);

  /* ---------------------------------------------------------------- static batching */
  const batches = new Map();
  const addStatic = (geo, mat) => {
    if (!batches.has(mat)) batches.set(mat, []);
    batches.get(mat).push(geo.index ? geo.toNonIndexed() : geo);
  };
  const absorb = (group) => {
    // move every non-dynamic mesh of a placed group into the static batches
    group.updateMatrixWorld(true);
    const take = [];
    group.traverse((o) => {
      if (!o.isMesh) return;
      for (let p = o; p && p !== group.parent; p = p.parent) if (p.userData.dynamic) return;
      take.push(o);
    });
    for (const o of take) {
      const g = o.geometry.clone().applyMatrix4(o.matrixWorld);
      o.geometry.dispose();
      addStatic(g, o.material);
      o.parent.remove(o);
    }
  };

  /* ---------------------------------------------------------------- walls, lintels, rails */
  const wallMat = (lv) => (lv === "B" ? M.stone : lv === "U" ? M.wallU : M.wallG);
  for (const b of LAYOUT.boxes) {
    if (b.kind === "wall" || b.kind === "stair" || b.kind === "lintel") {
      const base = LEVEL[b.lv] ?? 0;
      const mat = wallMat(b.lv);
      addStatic(worldBox(b.x0, b.y0, b.z0, b.x1, b.y1, b.z1, mat === M.stone ? { su: 2, sv: 2, base } : { su: 2.5, sv: 3, base }), mat);
    } else if (b.kind === "rail") {
      // low porch rail (the collider is taller and invisible)
      addStatic(worldBox(b.x0 + 0.03, b.y0 + 0.9, b.z0 + 0.03, b.x1 - 0.03, b.y0 + 0.98, b.z1 - 0.03), M.porch);
      const along = b.x1 - b.x0 > b.z1 - b.z0;
      const L = along ? b.x1 - b.x0 : b.z1 - b.z0;
      for (let s = 0.1; s < L; s += 0.25) {
        const x = along ? b.x0 + s : (b.x0 + b.x1) / 2, z = along ? (b.z0 + b.z1) / 2 : b.z0 + s;
        addStatic(worldBox(x - 0.02, b.y0, z - 0.02, x + 0.02, b.y0 + 0.92, z + 0.02), M.porch);
      }
    }
  }

  /* ---------------------------------------------------------------- floors, ceilings, stairs */
  const floorMat = (f) => (f.s === "tile" ? (f.room === "kitchen" ? M.kitchenTile : M.bathTile) : f.s === "stone" ? M.concrete : f.s === "porch" ? M.porch : M.planks);
  for (const f of FLOORS) {
    const [x0, z0, x1, z1] = f.r;
    if (f.ramp) {
      // solid steps (the simulation walks a smooth ramp through them)
      const n = 15;
      const zlen = z1 - z0;
      for (let k = 0; k < n; k++) {
        const za = z0 + (zlen * k) / n, zb = z0 + (zlen * (k + 1)) / n;
        const yc = f.ya + ((f.yb - f.ya) * (k + 0.5)) / n;
        const yTop = yc + Math.abs(f.yb - f.ya) / n / 2 - 0.02;
        const yBot = Math.min(f.ya, f.yb) - 0.15;
        addStatic(worldBox(x0 + 0.08, yBot, za, x1 - 0.08, yTop, zb, { su: 1, sv: 1, sf: 1 }), M.woodDark);
        addStatic(worldBox(x0 + 0.08, yTop, za - 0.01, x1 - 0.08, yTop + 0.025, zb + 0.01, { sf: 2 }), M.planks);
      }
      // handrail along the wall
      const hx = f.room === "stairs" ? x1 - 0.12 : x0 + 0.12;
      const g = new THREE.CylinderGeometry(0.025, 0.025, Math.hypot(zlen, f.yb - f.ya), 6);
      g.rotateX(Math.atan2(zlen, f.yb - f.ya)); // cylinder axis (0,1,0) → along (0, rise, run)
      g.translate(hx, (f.ya + f.yb) / 2 + 0.9, (z0 + z1) / 2);
      addStatic(g, M.woodDark);
      continue;
    }
    if (f.room === "porch") {
      addStatic(worldBox(x0, f.y - 0.2, z0, x1, f.y - 0.002, z1), M.porch);
      continue;
    }
    addStatic(worldBox(x0, f.y - 0.16, z0, x1, f.y - 0.004, z1, { su: 2, sv: 2, sf: 2 }), M.plaster);
    const top = new THREE.PlaneGeometry(x1 - x0, z1 - z0);
    top.rotateX(-Math.PI / 2);
    top.translate((x0 + x1) / 2, f.y, (z0 + z1) / 2);
    const uv = top.attributes.uv, p = top.attributes.position;
    const s = f.s === "tile" ? 1 : 2;
    for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / s, p.getZ(i) / s);
    addStatic(top, floorMat(f));
  }
  addStatic(worldBox(0, 6, 0, 12, 6.2, 12, { sf: 2 }), M.plaster);
  // outside: ground, porch steps, a few dead trees in the fog
  addStatic(worldBox(-20, -0.5, 12.05, 32, -0.05, 45, { sf: 4 }), M.ground);
  addStatic(worldBox(7.2, -0.25, 14.5, 9.4, -0.05, 15.3), M.porch);
  for (const [x, z, h] of [[3, 19, 7], [14, 21, 8], [9.5, 25, 6], [-1, 24, 9], [18, 16, 6]]) {
    const tg = new THREE.CylinderGeometry(0.12, 0.25, h, 6);
    tg.translate(x, h / 2 - 0.1, z);
    addStatic(tg, M.woodDark);
    for (let i = 0; i < 4; i++) {
      const bg = new THREE.CylinderGeometry(0.03, 0.07, h * 0.4, 5);
      bg.translate(0, h * 0.2, 0);
      bg.rotateZ((i % 2 ? 1 : -1) * (0.6 + i * 0.1));
      bg.rotateY(i * 1.7);
      bg.translate(x, h * (0.45 + i * 0.12), z);
      addStatic(bg, M.woodDark);
    }
  }
  for (const x of [6.6, 10.0]) addStatic(worldBox(x - 0.06, 0, 14.4, x + 0.06, 2.6, 14.52), M.porch); // porch posts
  addStatic(worldBox(6.4, 2.6, 12.05, 10.2, 2.72, 14.7), M.porch); // porch roof

  /* ---------------------------------------------------------------- door frames */
  for (const id in LAYOUT.doors) {
    const d = LAYOUT.doors[id];
    const T = WALL_T / 2 + 0.025;
    const lo = d.c - d.w / 2, hi = d.c + d.w / 2;
    const jamb = (a0, a1) =>
      d.axis === "x" ? worldBox(a0, d.y0, d.fixed - T, a1, d.y0 + DOOR_H, d.fixed + T) : worldBox(d.fixed - T, d.y0, a0, d.fixed + T, d.y0 + DOOR_H, a1);
    addStatic(jamb(lo - 0.08, lo), M.woodDark);
    addStatic(jamb(hi, hi + 0.08), M.woodDark);
    addStatic(d.axis === "x" ? worldBox(lo - 0.08, d.y0 + DOOR_H, d.fixed - T, hi + 0.08, d.y0 + DOOR_H + 0.1, d.fixed + T) : worldBox(d.fixed - T, d.y0 + DOOR_H, lo - 0.08, d.fixed + T, d.y0 + DOOR_H + 0.1, hi + 0.08), M.woodDark);
  }

  /* ---------------------------------------------------------------- windows */
  for (const [lv, axis, fixed, c, w] of WINDOWS) {
    const base = LEVEL[lv];
    const y0 = lv === "B" ? base + 2.15 : base + 0.95, y1 = lv === "B" ? base + 2.65 : base + 2.25;
    const inward = fixed < 6 ? 1 : -1;
    const g = new THREE.Group();
    // local frame: x along the wall, +z into the room
    const glass = mesh(new THREE.PlaneGeometry(w, y1 - y0), M.window, 0, (y0 + y1) / 2, 0.005);
    g.add(glass);
    const fr = (ww, hh, x, y) => g.add(mesh(new THREE.BoxGeometry(ww, hh, 0.07), M.woodDark, x, y, 0.03));
    fr(w + 0.12, 0.06, 0, y0 - 0.03);
    fr(w + 0.12, 0.06, 0, y1 + 0.03);
    fr(0.06, y1 - y0, -w / 2 - 0.03, (y0 + y1) / 2);
    fr(0.06, y1 - y0, w / 2 + 0.03, (y0 + y1) / 2);
    fr(0.035, y1 - y0, 0, (y0 + y1) / 2);
    fr(w, 0.035, 0, (y0 + y1) / 2 + 0.1);
    g.add(mesh(new THREE.BoxGeometry(w + 0.2, 0.04, 0.14), M.woodDark, 0, y0 - 0.06, 0.06));
    if (lv !== "B") {
      for (const s of [-1, 1]) {
        const cur = mesh(new THREE.BoxGeometry(0.28, y1 - y0 + 0.45, 0.02), M.curtain, s * (w / 2 + 0.06), (y0 + y1) / 2 + 0.1, 0.09);
        cur.rotation.z = s * 0.03;
        g.add(cur);
      }
    }
    if (axis === "z") {
      g.position.set(fixed + inward * (WALL_T / 2 + 0.002), 0, c);
      g.rotation.y = inward > 0 ? Math.PI / 2 : -Math.PI / 2;
    } else {
      g.position.set(c, 0, fixed + inward * (WALL_T / 2 + 0.002));
      g.rotation.y = inward > 0 ? 0 : Math.PI;
    }
    scene.add(g);
    absorb(g);
    scene.remove(g);
  }

  /* ---------------------------------------------------------------- wall decor */
  const decor = new THREE.Group();
  scene.add(decor);
  const frame = (x, y, z, ry, w, h, mat) => {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.rotation.y = ry;
    g.add(mesh(new THREE.BoxGeometry(w + 0.1, h + 0.1, 0.04), M.woodDark, 0, 0, 0.02));
    g.add(mesh(new THREE.PlaneGeometry(w, h), mat, 0, 0, 0.045));
    decor.add(g);
  };
  const H2 = WALL_T / 2;
  frame(6 + H2, 1.75, 7.3, Math.PI / 2, 0.55, 0.7, M.portraits[1]); // hall, west wall
  frame(10.6 - H2, 1.8, 8.4, -Math.PI / 2, 0.5, 0.62, M.portraits[2]); // hall, stair wall
  frame(3.0, 2.15, 12 - H2, Math.PI, 0.6, 0.76, M.portraits[0]); // living, over the fireplace
  frame(8.3, 4.65, H2, 0, 0.5, 0.62, M.portraits[0]); // upstairs landing
  frame(H2, 4.7, 9.1, Math.PI / 2, 0.45, 0.56, M.portraits[1]); // bedroom over the bed
  // tile wainscot in the kitchen and bathroom (split around door gaps)
  const tilePanels = (rect, lv, mat, h) => {
    const base = LEVEL[lv];
    const [x0, z0, x1, z1] = rect;
    const sides = [["x", z0 + H2 + 0.004, x0, x1], ["x", z1 - H2 - 0.004, x0, x1], ["z", x0 + H2 + 0.004, z0, z1], ["z", x1 - H2 - 0.004, z0, z1]];
    for (const [axis, fixed, a, b] of sides) {
      const gaps = Object.values(LAYOUT.doors)
        .filter((d) => d.y0 === base && d.axis === axis && Math.abs(d.fixed - fixed) < 0.2)
        .map((d) => [d.c - d.w / 2 - 0.08, d.c + d.w / 2 + 0.08])
        .filter(([g0, g1]) => g1 > a && g0 < b) // only openings on this room's side
        .sort((p, q) => p[0] - q[0]);
      let s = a + H2;
      const segs = [];
      for (const [g0, g1] of gaps) {
        if (g0 > s) segs.push([s, Math.min(g0, b - H2)]);
        s = Math.max(s, g1);
      }
      if (b - H2 > s) segs.push([s, b - H2]);
      for (const [p, q] of segs) {
        const geo = axis === "x" ? worldBox(p, base, fixed - 0.004, q, base + h, fixed + 0.004, { su: 1, sv: 1, base }) : worldBox(fixed - 0.004, base, p, fixed + 0.004, base + h, q, { su: 1, sv: 1, base });
        addStatic(geo, mat);
      }
    }
  };
  tilePanels([1.4, 0, 6, 5.2], "G", M.kitchenTile, 1.25);
  tilePanels([0, 0, 6, 5.2], "U", M.bathTile, 1.4);
  // stains and cobwebs
  for (const [x, y, z, s] of [[8.6, 0, 8.2, 1.4], [3.4, -3, 9.7, 1.8], [1.9, -3, 7.2, 1.0], [4.5, 3, 2.2, 0.9], [7.3, 3, 6.8, 1.1], [3.0, 0, 3.0, 0.8]]) {
    const p = mesh(new THREE.PlaneGeometry(s, s), M.stain, x, y + 0.006, z);
    p.rotation.x = -Math.PI / 2;
    p.rotation.z = x * 3.1;
    decor.add(p);
  }
  for (const [x, y, z, ry] of [[0.1, -0.35, 11.9, Math.PI], [5.9, -0.35, 5.3, 0], [10.5, 5.7, 11.9, Math.PI], [6.1, 5.7, 4.1, Math.PI / 2], [0.1, 5.7, 0.1, 0], [11.9, 2.75, 0.1, -Math.PI / 2], [0.1, 2.75, 11.9, Math.PI / 2]]) {
    const w = mesh(new THREE.PlaneGeometry(0.6, 0.6), M.web, x, y, z);
    w.rotation.set(0, ry + Math.PI / 4, Math.PI / 4);
    decor.add(w);
  }
  // basement bulb on a cord
  const bulbPos = new THREE.Vector3(3.0, -0.75, 8.6);
  decor.add(mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.6, 4), M.black, bulbPos.x, bulbPos.y + 0.36, bulbPos.z));
  decor.add(mesh(new THREE.SphereGeometry(0.05, 8, 8), M.bulb, bulbPos.x, bulbPos.y, bulbPos.z));
  absorb(decor);

  /* ---------------------------------------------------------------- furniture */
  const furnObjs = [];
  for (const f of LAYOUT.furn) {
    const ns = f.face === "n" || f.face === "s" || f.face === "nw";
    const W = ns ? f.r[2] - f.r[0] : f.r[3] - f.r[1];
    const D = ns ? f.r[3] - f.r[1] : f.r[2] - f.r[0];
    const g = BUILD[f.kind](W, D, f.h, M);
    g.position.set((f.r[0] + f.r[2]) / 2, f.y0, (f.r[1] + f.r[3]) / 2);
    g.rotation.y = FACE_ROT[f.face] ?? 0;
    scene.add(g);
    g.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    absorb(g);
    furnObjs.push({ f, g });
  }
  const byContainer = (id) => furnObjs.find((o) => o.f.container === id)?.g;
  const byHide = (id) => furnObjs.find((o) => o.f.hide === id)?.g;
  const pendulum = furnObjs.find((o) => o.f.kind === "clock")?.g.userData.pendulum;
  const rocker = furnObjs.find((o) => o.f.kind === "rocker")?.g.userData.rocker;

  /* ---------------------------------------------------------------- merge the statics */
  const statics = [];
  for (const [mat, geos] of batches) {
    const merged = mergeGeometries(geos, false);
    geos.forEach((g) => g.dispose());
    if (!merged) continue;
    const m = new THREE.Mesh(merged, mat);
    m.castShadow = !mat.transparent && mat !== M.window && mat !== M.ground;
    m.receiveShadow = !mat.transparent;
    m.matrixAutoUpdate = false;
    scene.add(m);
    statics.push(m);
  }

  /* ---------------------------------------------------------------- doors */
  const doorObjs = {};
  for (const id in LAYOUT.doors) {
    const d = LAYOUT.doors[id];
    const o = buildDoor(d, M);
    const hingeAt = d.c + d.hinge * (d.w / 2 - 0.02);
    if (d.axis === "x") o.g.position.set(hingeAt, d.y0, d.fixed);
    else {
      o.g.position.set(d.fixed, d.y0, hingeAt);
      o.g.rotation.y = -Math.PI / 2;
    }
    const sLocal = d.axis === "x" ? d.swing : -d.swing;
    o.openAngle = -sLocal * -d.hinge * (Math.PI / 2) * 0.94;
    o.g.traverse((m) => {
      if (m.isMesh) {
        m.castShadow = true;
        m.receiveShadow = true;
      }
    });
    scene.add(o.g);
    doorObjs[id] = o;
  }

  /* ---------------------------------------------------------------- keys */
  const glowTex = track(blob("255,220,150", 0.2));
  const keyObjs = {};
  KEY_SPOTS.forEach((s, i) => {
    const k = buildKey(M, [0xb08a3e, 0x8f8f92, 0xc9c9cf][s.group]);
    k.position.set(s.pos[0], LEVEL[s.l] + s.pos[1] + 0.008, s.pos[2]);
    k.rotation.y = i * 1.3;
    const spr = new THREE.Sprite(track(new THREE.SpriteMaterial({ map: glowTex, color: 0xffd9a0, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.5 })));
    spr.scale.set(0.16, 0.16, 1);
    spr.position.copy(k.position);
    spr.position.y += 0.02;
    scene.add(k, spr);
    keyObjs[s.id] = { k, spr };
  });

  /* ---------------------------------------------------------------- the widow */
  const W = buildWidow(M);
  scene.add(W.root);
  const lantern = new THREE.PointLight(0xffa04a, 3.2, 6, 1.6);
  lantern.position.set(0, -0.15, 0);
  W.lantern.add(lantern);

  /* ---------------------------------------------------------------- lights */
  const hemi = new THREE.HemisphereLight(0x3a4458, 0x120e0a, 0.55);
  scene.add(hemi);
  const flash = new THREE.SpotLight(0xffe7c8, 34, 20, 0.5, 0.55, 1.5);
  flash.position.set(0.12, -0.1, 0.05);
  flash.castShadow = true;
  flash.shadow.mapSize.set(1024, 1024);
  flash.shadow.camera.near = 0.15;
  flash.shadow.camera.far = 20;
  flash.shadow.bias = -0.0004;
  flash.shadow.normalBias = 0.03;
  camera.add(flash);
  const flashTarget = new THREE.Object3D();
  scene.add(flashTarget);
  flash.target = flashTarget;
  const fill = new THREE.PointLight(0x8a96b8, 0.35, 4.5, 1.6);
  camera.add(fill);
  const lamps = [
    { l: new THREE.PointLight(0xff9a4a, 2.2, 7, 1.6), p: [6.3, 1.12, 5.8], base: 2.2 }, // hall console candle
    { l: new THREE.PointLight(0xff9a4a, 1.8, 6, 1.6), p: [0.3, 3.82, 7.6], base: 1.8 }, // bedroom candle
    { l: new THREE.PointLight(0xdfe3a8, 3.2, 9, 1.5), p: [bulbPos.x, bulbPos.y - 0.08, bulbPos.z], base: 3.2, bulb: true }, // basement bulb
    { l: new THREE.PointLight(0xff5a1a, 1.8, 5, 1.7), p: [3.0, 0.35, 11.3], base: 1.8 }, // embers
    { l: new THREE.PointLight(0x7f95c0, 1.6, 8, 1.4), p: [8.3, 1.6, 13.4], base: 1.6 }, // moonlight on the porch
  ];
  for (const L of lamps) {
    L.l.position.set(...L.p);
    scene.add(L.l);
  }

  /* ---------------------------------------------------------------- dust */
  const DUST = 260;
  const dustPos = new Float32Array(DUST * 3);
  for (let i = 0; i < DUST; i++) {
    dustPos[i * 3] = START.x + (Math.random() - 0.5) * 8;
    dustPos[i * 3 + 1] = 3 + Math.random() * 3;
    dustPos[i * 3 + 2] = START.z + (Math.random() - 0.5) * 8;
  }
  const dustGeo = track(new THREE.BufferGeometry());
  dustGeo.setAttribute("position", new THREE.BufferAttribute(dustPos, 3));
  const dust = new THREE.Points(dustGeo, track(new THREE.PointsMaterial({ color: 0xbfb6a0, size: 0.012, transparent: true, opacity: 0.45, depthWrite: false })));
  dust.frustumCulled = false;
  scene.add(dust);

  /* ---------------------------------------------------------------- per-frame */
  let t = 0, bob = 0, camY = null, flickT = 8, flickD = 0, prevHidden = null, wardrobePulse = {}, enemyYaw = 0, twitch = 0, twitchT = 2;
  const tmpV = new THREE.Vector3();
  const look = new THREE.Vector3();

  function poseWidow(E, dt, mode) {
    W.root.position.set(E.x, E.y, E.z);
    enemyYaw += Math.atan2(Math.sin(E.yaw - enemyYaw), Math.cos(E.yaw - enemyYaw)) * Math.min(1, dt * 10);
    W.root.rotation.y = enemyYaw + Math.PI; // model faces +z; yaw 0 looks -z
    const moving = E.speed > 0.2;
    const ph = E.walk;
    const amp = moving ? Math.min(1, E.speed / 2.5) : 0;
    const chase = mode === "chase" || mode === "pull";
    W.legs[0].rotation.x = Math.sin(ph) * 0.5 * amp;
    W.legs[1].rotation.x = -Math.sin(ph) * 0.5 * amp;
    W.hips.position.y = 0.86 + Math.abs(Math.cos(ph)) * 0.04 * amp;
    W.hips.rotation.z = Math.sin(ph) * 0.05 * amp;
    W.skirt.rotation.y = Math.sin(ph) * 0.08 * amp;
    W.spine.rotation.x = chase ? 0.62 : mode === "alert" ? 0.2 : 0.38 + Math.sin(t * 1.3) * 0.02;
    // arms: the lantern arm swings low; the free arm reaches when she hunts you
    const reach = E.reach ?? 0;
    W.arms[0].sh.rotation.x = -Math.sin(ph) * 0.35 * amp - 0.35;
    W.arms[0].el.rotation.x = -0.5;
    W.arms[1].sh.rotation.x = Math.sin(ph) * 0.35 * amp * (1 - reach) - reach * 1.5;
    W.arms[1].sh.rotation.z = -0.1 - reach * 0.15;
    W.arms[1].el.rotation.x = -0.3 - reach * 0.2;
    W.lantern.rotation.x = -W.arms[0].sh.rotation.x - W.arms[0].el.rotation.x;
    // the head: slow searching turns and the odd sudden twitch
    twitchT -= dt;
    if (twitchT <= 0) {
      twitchT = 1.5 + Math.random() * 4;
      twitch = (Math.random() - 0.5) * 0.8;
    }
    twitch *= Math.pow(0.02, dt);
    const searching = mode === "search" || mode === "investigate";
    W.head.rotation.y = searching ? Math.sin(t * 1.7) * 0.7 : twitch * 0.5;
    W.head.rotation.z = mode === "alert" ? 0.45 : twitch * 0.6;
    W.head.rotation.x = chase ? -0.45 : -0.2;
    const eyeGlow = chase || mode === "alert" || mode === "caught" ? 1 : 0.45;
    W.eyeMat.color.setRGB(0.91 * eyeGlow + 0.1, 0.86 * eyeGlow + 0.08, 0.63 * eyeGlow);
  }

  function render(g, dt, opts = {}) {
    t += dt;
    const P = g?.player;
    const E = g?.enemy;

    /* ---------- camera */
    if (!g) {
      // menu: drifting in the hall, looking up the stairs at her
      camera.position.set(8.4 + Math.sin(t * 0.13) * 0.25, 1.55 + Math.sin(t * 0.4) * 0.02, 10.6);
      camera.lookAt(11.0 + Math.sin(t * 0.1) * 0.2, 2.6, 4.6);
      flash.intensity = 0;
    } else if (g.state === "caught" || (g.state === "over" && g.caughtFrom)) {
      const head = tmpV.set(E.x, E.y + 1.42, E.z);
      const eyeY = P.y + Math.max(1.2, P.eyeH);
      camera.position.set(P.x + (Math.random() - 0.5) * 0.02, eyeY + (Math.random() - 0.5) * 0.02, P.z);
      const k = Math.min(1, (g.stateT || 0) / 0.25);
      const fwd = look.set(-Math.sin(g.caughtFrom.yaw), Math.sin(g.caughtFrom.pitch), -Math.cos(g.caughtFrom.yaw)).normalize();
      const to = head.clone().sub(camera.position).normalize();
      fwd.lerp(to, ease(k)).normalize();
      camera.lookAt(camera.position.clone().add(fwd));
      camY = eyeY;
    } else if (P.hidden) {
      const h = HIDES[P.hidden];
      camera.position.set(h.cam[0], LEVEL[h.l] + h.cam[1] + Math.sin(t * 1.6) * 0.006, h.cam[2]);
      camera.rotation.set(P.pitch, P.yaw, 0);
      camY = camera.position.y;
    } else {
      const target = P.y + P.eyeH;
      if (camY === null || Math.abs(camY - target) > 1.2) camY = target;
      camY += (target - camY) * Math.min(1, dt * 16);
      const sp = P.speed || 0;
      bob += dt * sp * (P.sprinting ? 2.6 : 2.9);
      const a = sp > 0.3 ? (P.sprinting ? 0.05 : P.crouch ? 0.018 : 0.032) : 0;
      camera.position.set(P.x, camY + Math.abs(Math.sin(bob)) * a - a * 0.5, P.z);
      camera.rotation.set(P.pitch + Math.sin(bob * 2) * a * 0.1, P.yaw, Math.sin(bob) * a * 0.25);
    }

    /* ---------- flashlight: subtle, irregular flicker (never strobing) */
    if (g) {
      flickT -= dt;
      const near = E && !E.disabled ? Math.max(0, 1 - E.dist / 7) : 0;
      if (flickT <= 0) {
        flickD = 0.35 + near * 0.3;
        flickT = (near > 0.3 ? 6 : 16) + Math.random() * 18;
      }
      let k = 1;
      if (flickD > 0) {
        flickD -= dt;
        k = 0.7 + 0.3 * (0.5 + 0.5 * Math.sin(t * 37)) * (0.6 + 0.4 * Math.sin(t * 11.3));
        k = Math.max(0.55 - near * 0.15, k);
      }
      const on = P.light && !P.hidden && g.state !== "respawn"; // cupped while hiding
      flash.intensity = on ? 34 * k : 0;
      flash.castShadow = on;
      fill.intensity = on ? 0.35 : 0.5;
      hemi.intensity = on ? 0.55 : 0.8;
      camera.getWorldDirection(look);
      flashTarget.position.copy(camera.position).addScaledVector(look, 6);
    }

    /* ---------- lamps */
    for (const L of lamps) {
      const f = L.bulb ? (Math.sin(t * 0.7) > 0.96 ? 0.3 + Math.random() * 0.5 : 1) : 0.85 + 0.1 * Math.sin(t * 9 + L.p[0]) + 0.05 * Math.sin(t * 23 + L.p[2]);
      L.l.intensity = L.base * f;
    }
    if (pendulum) pendulum.rotation.z = Math.sin(t * Math.PI) * 0.18;
    if (rocker) rocker.rotation.x = Math.sin(t * 0.9) * (0.04 + 0.05 * Math.max(0, Math.sin(t * 0.05)));

    /* ---------- doors, containers, wardrobes */
    const doors = g ? g.doors : null;
    for (const id in doorObjs) {
      const o = doorObjs[id];
      const a = doors ? doors[id].anim : LAYOUT.doors[id].open0 ? 1 : 0;
      o.panel.rotation.y = o.openAngle * ease(a);
      if (o.locks.length) o.locks.forEach((l, i) => l.material.color.setHex(g && g.keys.length > i ? 0xb08a3e : 0x24221f));
    }
    const cAnim = (id) => (g ? g.containers[id].anim : 0);
    const fr = byContainer("fridge");
    if (fr) fr.userData.door.rotation.y = ease(cAnim("fridge")) * 1.75;
    const tb = byContainer("toolbox");
    if (tb) tb.userData.lid.rotation.x = -ease(cAnim("toolbox")) * 1.7;
    const dr = byContainer("dresser");
    if (dr) dr.userData.drawer.position.z = ease(cAnim("dresser")) * 0.4;
    const hid = P?.hidden || null;
    if (hid !== prevHidden) {
      if (hid) wardrobePulse[hid] = 0.5;
      if (prevHidden) wardrobePulse[prevHidden] = 0.5;
      prevHidden = hid;
    }
    for (const id in HIDES) {
      if (HIDES[id].kind !== "wardrobe") continue;
      const wg = byHide(id);
      if (!wg) continue;
      wardrobePulse[id] = Math.max(0, (wardrobePulse[id] || 0) - dt);
      const open = wardrobePulse[id] > 0 ? Math.sin((wardrobePulse[id] / 0.5) * Math.PI) * 1.1 : 0;
      for (const d of wg.userData.wardrobeDoors) d.g.rotation.y = d.s * open;
    }

    /* ---------- keys */
    for (const s of KEY_SPOTS) {
      const o = keyObjs[s.id];
      let vis = !!g && g.keySpots.includes(s) && !g.keys.includes(s.id);
      if (vis && s.inside) vis = cAnim(s.inside) > 0.85;
      o.k.visible = vis;
      o.spr.visible = vis;
      if (vis) o.spr.material.opacity = 0.35 + 0.25 * Math.sin(t * 2.4 + s.pos[0]);
    }

    /* ---------- the widow */
    if (!g) {
      W.root.visible = true;
      poseWidow({ x: 11.25, y: 3, z: 3.75, yaw: Math.PI, speed: 0, walk: 0, reach: 0 }, dt, "patrol");
      lantern.intensity = 3.2;
    } else if (E.disabled) W.root.visible = false;
    else {
      W.root.visible = g.state !== "respawn";
      poseWidow(E, dt, E.mode);
      if (g.state === "caught") {
        W.arms[0].sh.rotation.x = -1.2;
        W.arms[1].sh.rotation.x = -1.6;
        W.spine.rotation.x = 0.25;
        W.head.rotation.set(-0.1, 0, Math.sin(t * 30) * 0.05);
      }
      lantern.intensity = 3.2 * (0.85 + 0.15 * Math.sin(t * 13) * Math.sin(t * 5.3));
    }

    /* ---------- dust drifts around the viewer */
    const cx = camera.position.x, cyy = camera.position.y, cz = camera.position.z;
    for (let i = 0; i < DUST; i++) {
      let x = dustPos[i * 3] + Math.sin(t * 0.3 + i) * dt * 0.05, y = dustPos[i * 3 + 1] - dt * 0.012, z = dustPos[i * 3 + 2] + Math.cos(t * 0.27 + i * 1.7) * dt * 0.05;
      if (x - cx > 4) x -= 8;
      else if (x - cx < -4) x += 8;
      if (z - cz > 4) z -= 8;
      else if (z - cz < -4) z += 8;
      if (y - cyy > 2) y -= 4;
      else if (y - cyy < -2) y += 4;
      dustPos[i * 3] = x;
      dustPos[i * 3 + 1] = y;
      dustPos[i * 3 + 2] = z;
    }
    dustGeo.attributes.position.needsUpdate = true;

    if (!opts.skip) renderer.render(scene, camera);
  }

  function resize(w, h) {
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  camera.position.set(8.4, 1.55, 10.6);

  function dispose() {
    const mats = new Set(), geos = new Set();
    scene.traverse((o) => {
      if (o.geometry) geos.add(o.geometry);
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => mats.add(m));
    });
    geos.forEach((g) => g.dispose());
    mats.forEach((m) => m.dispose());
    disposables.forEach((d) => d.dispose?.());
    renderer.dispose();
    renderer.domElement.remove();
  }

  return { renderer, scene, camera, render, resize, dispose, M, W, statics };
}
