/**
 * Last Shelter — the 3D house (plain Three.js).
 *
 * A dollhouse cut-away of the Barlow home seen from an angled top-down
 * camera: the north and west walls stand full height with windows and
 * curtains, every other wall is cut to waist height so the rooms stay
 * readable. The yard, street and neighbouring houses frame it. During the
 * run the sky and windows slide from late-afternoon gold to siren red, a
 * green beam marks the shelter hatch, and the countdown shakes the camera
 * in its last ten seconds.
 *
 * createHouseWorld(host, opts) → { frame(dt, S, view), setQuality, resize,
 * project, dispose }. The React shell owns the rAF loop and the sim; this
 * module only draws what the sim says.
 */
import * as THREE from "three";
import { makeTextures, disposeTextures } from "./textures.js";
import { createKit } from "./models.js";
import { buildCharacter, animate } from "./characters.js";
import { bakeWorld, bakeLocal } from "./bake.js";
import { ROOMS, WALLS, FURNITURE, HATCH, WALL_T, WALL_HIGH, WALL_LOW, HOUSE_W, HOUSE_D, roomAt } from "../data/house.js";
import { ITEMS } from "../data/items.js";
import { FAMILY } from "../data/family.js";

const FLOOR_SCALE = { wood: 2.2, woodDark: 2.2, tile: 1.2, checker: 1.6, carpetBlue: 2, concrete: 4 };
const CX = HOUSE_W / 2;
const CZ = HOUSE_D / 2;

export function createHouseWorld(host, { quality = "medium" } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: quality !== "low", powerPreference: "high-performance" });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.className = "lsh-canvas";
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const sky = new THREE.Color("#f6c48c");
  scene.background = sky.clone();
  scene.fog = new THREE.Fog(sky.clone(), 38, 75);
  const camera = new THREE.PerspectiveCamera(36, 16 / 9, 0.5, 140);

  const T = makeTextures(renderer.capabilities.getMaxAnisotropy() > 4 ? 8 : 4);
  const kit = createKit(T);
  kit.blobMat = new THREE.MeshBasicMaterial({ map: T.blob, color: "#000000", transparent: true, opacity: 0.35, depthWrite: false });
  kit.extraTextures = [];
  kit.extraMaterials = [kit.blobMat];
  const owned = { geos: [], mats: [] };
  const own = (x, list = owned.geos) => (list.push(x), x);
  // one vertex-coloured material for every plain-coloured baked part
  const vcMat = own(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78 }), owned.mats);
  kit.vcMat = vcMat;
  kit.track = own;

  /* ---------------------------------------------------------------- lights */
  const hemi = new THREE.HemisphereLight("#ffe9cf", "#56603f", 1.15);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight("#ffd29a", 2.4);
  sun.position.set(CX - 10, 22, CZ + 12);
  sun.target.position.set(CX, 0, CZ);
  scene.add(sun, sun.target);
  sun.shadow.camera.left = -17;
  sun.shadow.camera.right = 17;
  sun.shadow.camera.top = 14;
  sun.shadow.camera.bottom = -14;
  sun.shadow.camera.near = 4;
  sun.shadow.camera.far = 50;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.02;
  const roomLights = [];
  for (const r of ROOMS) {
    if (r.id === "hall") continue;
    const l = new THREE.PointLight(r.id === "garage" ? "#e8f0ff" : "#ffcf8f", 9, 8.5, 1.7);
    l.position.set((r.x0 + r.x1) / 2, 2.4, (r.z0 + r.z1) / 2);
    scene.add(l);
    roomLights.push(l);
  }
  const siren = new THREE.PointLight("#ff2a1a", 0, 30, 1.2);
  siren.position.set(CX, 6, CZ + 2);
  scene.add(siren);
  const hatchLight = new THREE.PointLight("#5dff9a", 6, 6, 1.6);
  hatchLight.position.set(HATCH.x, 0.7, HATCH.z);
  scene.add(hatchLight);

  /* ---------------------------------------------------------------- ground + yard */
  const statics = new THREE.Group();
  scene.add(statics);
  const plane = (w, d, map, rep, color = "#ffffff", y = 0) => {
    const geo = own(new THREE.PlaneGeometry(w, d));
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * rep[0], uv.getY(i) * rep[1]);
    const m = own(new THREE.MeshStandardMaterial({ color, map, roughness: 0.92 }), owned.mats);
    const o = new THREE.Mesh(geo, m);
    o.rotation.x = -Math.PI / 2;
    o.position.y = y;
    o.receiveShadow = true;
    return o;
  };
  const grass = plane(110, 90, T.grass, [22, 18]);
  grass.position.set(CX, -0.02, CZ);
  statics.add(grass);
  const street = plane(110, 7, T.asphalt, [28, 2]);
  street.position.set(CX, -0.01, HOUSE_D + 9.5);
  statics.add(street);
  for (let x = -40; x < 70; x += 4) {
    const dash = plane(1.8, 0.16, null, [1, 1], "#f2e8cf", 0.0);
    dash.position.set(x, 0, HOUSE_D + 9.5);
    statics.add(dash);
  }
  const walk = plane(110, 2.2, T.paving, [50, 1]);
  walk.position.set(CX, 0, HOUSE_D + 4.9);
  statics.add(walk);
  const drive = plane(5.4, 3.8, T.paving, [2.5, 2]);
  drive.position.set(21, 0.005, HOUSE_D + 1.9);
  statics.add(drive);
  const path = plane(1.6, 3.8, T.paving, [1, 2]);
  path.position.set(5.9, 0.005, HOUSE_D + 1.9);
  statics.add(path);
  // house plinth so the floor sits slightly above the lawn
  kit.box(statics, HOUSE_W + 0.5, 0.1, HOUSE_D + 0.5, "#b8ab95", CX, -0.09, CZ, { r: 0.02 });

  /* ---------------------------------------------------------------- floors */
  for (const r of ROOMS) {
    const w = r.x1 - r.x0;
    const d = r.z1 - r.z0;
    const s = FLOOR_SCALE[r.floor] || 2;
    const f = plane(w, d, T[r.floor], [w / s, d / s], "#ffffff", 0.005);
    f.position.x = (r.x0 + r.x1) / 2;
    f.position.z = (r.z0 + r.z1) / 2;
    statics.add(f);
  }

  /* ---------------------------------------------------------------- walls */
  const windows = [];
  const wallMats = {};
  const wallMat = (key) => (wallMats[key] ||= own(new THREE.MeshStandardMaterial({ map: T[key] || null, color: T[key] ? "#ffffff" : key, roughness: 0.9 }), owned.mats));
  const capMat = own(new THREE.MeshStandardMaterial({ color: "#7a4e30", roughness: 0.6 }), owned.mats);
  const outerMat = own(new THREE.MeshStandardMaterial({ map: T.exterior, color: "#ffffff", roughness: 0.9 }), owned.mats);
  /** Box with UVs scaled to metres so wallpaper tiles evenly. */
  const wallGeo = (w, h, d) => {
    const geo = own(new THREE.BoxGeometry(w, h, d));
    const uv = geo.attributes.uv;
    const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
    for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      uv.setXY(i, (uv.getX(i) * dims[f][0]) / 1.6, (uv.getY(i) * dims[f][1]) / 1.6);
    }
    return geo;
  };
  const sideKey = (x, z) => {
    const r = roomAt(x, z);
    return r ? r.wall : null;
  };
  const addWall = (horiz, a, b, fixed, y0, y1, high) => {
    const len = b - a;
    if (len <= 0.01) return;
    const h = y1 - y0;
    const w = horiz ? len + WALL_T : WALL_T;
    const d = horiz ? WALL_T : len + WALL_T;
    const cx = horiz ? (a + b) / 2 : fixed;
    const cz = horiz ? fixed : (a + b) / 2;
    // faces: +x, -x, +y, -y, +z, -z
    const n = 0.35;
    const keyPX = horiz ? null : sideKey(cx + n, cz);
    const keyNX = horiz ? null : sideKey(cx - n, cz);
    const keyPZ = horiz ? sideKey(cx, cz + n) : null;
    const keyNZ = horiz ? sideKey(cx, cz - n) : null;
    const pick = (k) => (k ? wallMat(k) : outerMat);
    const mats = horiz ? [outerMat, outerMat, capMat, capMat, pick(keyPZ), pick(keyNZ)] : [pick(keyPX), pick(keyNX), capMat, capMat, outerMat, outerMat];
    const m = new THREE.Mesh(wallGeo(w, h, d), mats);
    m.position.set(cx, y0 + h / 2, cz);
    m.castShadow = true;
    m.receiveShadow = true;
    statics.add(m);
    // a wooden cap on the cut edge reads as "dollhouse" rather than "unfinished"
    if (y1 >= (high ? WALL_HIGH : WALL_LOW) - 0.01) {
      const cap = new THREE.Mesh(kit.rbox(w + 0.06, 0.06, d + 0.06, 0.02), capMat);
      cap.position.set(cx, y1 + 0.03, cz);
      cap.castShadow = true;
      statics.add(cap);
    }
    // skirting board on room faces
    if (y0 === 0) {
      const sk = new THREE.Mesh(kit.rbox(horiz ? len : WALL_T + 0.04, 0.12, horiz ? WALL_T + 0.04 : len, 0.01), kit.mat("#f2ead8"));
      sk.position.set(cx, 0.06, cz);
      sk.receiveShadow = true;
      statics.add(sk);
    }
  };
  for (const wl of WALLS) {
    const horiz = wl.a[1] === wl.b[1];
    const from = horiz ? wl.a[0] : wl.a[1];
    const to = horiz ? wl.b[0] : wl.b[1];
    const fixed = horiz ? wl.a[1] : wl.a[0];
    const high = !!wl.high;
    const H = high ? WALL_HIGH : WALL_LOW;
    const gaps = [...(wl.doors || []).map((d) => ({ s: d[0], e: d[1], door: true })), ...(wl.windows || []).map((d) => ({ s: d[0], e: d[1], win: true })), ...(wl.frontDoor ? [{ s: wl.frontDoor[0], e: wl.frontDoor[1], front: true }] : [])].sort((p, q) => p.s - q.s);
    let cur = from;
    for (const gp of gaps) {
      addWall(horiz, cur, gp.s, fixed, 0, H, high);
      if (gp.win) {
        addWall(horiz, gp.s, gp.e, fixed, 0, 0.95, high);
        addWall(horiz, gp.s, gp.e, fixed, 2.15, H, high);
        addWindow(horiz, gp.s, gp.e, fixed);
      } else if (gp.front) {
        addFrontDoor(horiz, gp.s, gp.e, fixed, H);
      } else if (gp.door) {
        addDoorLeaf(horiz, gp, fixed, H);
      }
      cur = gp.e;
    }
    addWall(horiz, cur, to, fixed, 0, H, high);
  }
  function addWindow(horiz, s, e, fixed) {
    const len = e - s;
    const mid = (s + e) / 2;
    const glassMat = own(new THREE.MeshStandardMaterial({ color: "#ffe2b0", emissive: "#ffb066", emissiveIntensity: 0.9, roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0.9 }), owned.mats);
    windows.push(glassMat);
    const glass = new THREE.Mesh(kit.rbox(horiz ? len : 0.04, 1.2, horiz ? 0.04 : len, 0.01), glassMat);
    glass.position.set(horiz ? mid : fixed, 1.55, horiz ? fixed : mid);
    statics.add(glass);
    const frame = kit.mat("#fbf7ee", { rough: 0.5 });
    const bars = [
      [len + 0.1, 0.07, 0, 0.95],
      [len + 0.1, 0.07, 0, 2.15],
      [0.07, 1.2, -len / 2, 1.55],
      [0.07, 1.2, len / 2, 1.55],
      [0.05, 1.2, 0, 1.55],
      [len, 0.05, 0, 1.55],
    ];
    for (const [bw, bh, off, y] of bars) {
      const m = new THREE.Mesh(kit.rbox(horiz ? bw : 0.12, bh, horiz ? 0.12 : bw, 0.01), frame);
      m.position.set(horiz ? mid + off : fixed, y, horiz ? fixed : mid + off);
      m.castShadow = true;
      statics.add(m);
    }
    // sill + curtains on the room side
    const inward = horiz ? [0, 0.16] : [0.16, 0];
    const sill = new THREE.Mesh(kit.rbox(horiz ? len + 0.3 : 0.22, 0.05, horiz ? 0.22 : len + 0.3, 0.01), frame);
    sill.position.set((horiz ? mid : fixed) + inward[0] * 0.6, 0.95, (horiz ? fixed : mid) + inward[1] * 0.6);
    statics.add(sill);
    const room = roomAt((horiz ? mid : fixed) + inward[0] * 3, (horiz ? fixed : mid) + inward[1] * 3);
    const curtain = kit.mat(room && room.id === "kids" ? "#f4a261" : room && room.id === "parents" ? "#b56576" : "#81b29a", { rough: 0.95 });
    for (const side of [-1, 1]) {
      const c = new THREE.Mesh(kit.rbox(horiz ? 0.32 : 0.1, 1.55, horiz ? 0.1 : 0.32, 0.04), curtain);
      c.position.set((horiz ? mid + side * (len / 2 + 0.08) : fixed) + inward[0], 1.45, (horiz ? fixed : mid + side * (len / 2 + 0.08)) + inward[1]);
      c.castShadow = true;
      statics.add(c);
    }
    const rod = new THREE.Mesh(kit.cyl(0.02, 0.02, len + 0.9, 8), kit.mat("#7a4e30"));
    rod.position.set((horiz ? mid : fixed) + inward[0], 2.25, (horiz ? fixed : mid) + inward[1]);
    rod.rotation.set(horiz ? 0 : Math.PI / 2, 0, horiz ? Math.PI / 2 : 0);
    statics.add(rod);
    // warm light shaft spilling in
    const shaftMat = own(new THREE.MeshBasicMaterial({ map: T.blob, color: "#ffcf8a", transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending }), owned.mats);
    windows.push(shaftMat);
    const shaft = new THREE.Mesh(kit.g("plane1", () => new THREE.PlaneGeometry(1, 1)), shaftMat);
    shaft.rotation.x = -Math.PI / 2;
    shaft.scale.set(horiz ? len * 1.3 : 2.6, horiz ? 2.6 : len * 1.3, 1);
    shaft.position.set((horiz ? mid : fixed) + inward[0] * 9, 0.02, (horiz ? fixed : mid) + inward[1] * 9);
    statics.add(shaft);
  }
  function addDoorLeaf(horiz, gp, fixed, H) {
    if (H < 1.5) {
      // posts for cut-away doorways
      for (const at of [gp.s, gp.e]) {
        const post = new THREE.Mesh(kit.rbox(horiz ? 0.08 : WALL_T + 0.06, H + 0.06, horiz ? WALL_T + 0.06 : 0.08, 0.02), capMat);
        post.position.set(horiz ? at : fixed, (H + 0.06) / 2, horiz ? fixed : at);
        statics.add(post);
      }
    }
  }
  function addFrontDoor(horiz, s, e, fixed, H) {
    const mid = (s + e) / 2;
    const door = new THREE.Mesh(kit.rbox(e - s, H, 0.08, 0.02), kit.mat("#3d5a80"));
    door.position.set(mid, H / 2, fixed);
    statics.add(door);
    const step = new THREE.Mesh(kit.rbox(e - s + 0.4, 0.08, 0.6, 0.02), kit.mat("#b8ab95"));
    step.position.set(mid, 0.04, fixed + 0.35);
    statics.add(step);
  }

  /* ---------------------------------------------------------------- furniture */
  for (const f of FURNITURE) {
    const grp = new THREE.Group();
    const rot = f.rot || 0;
    const odd = rot % 2 === 1;
    const W = odd ? f.d : f.w;
    const D = odd ? f.w : f.d;
    grp.position.set(f.x, 0, f.z);
    grp.rotation.y = rot * (Math.PI / 2);
    const build = kit.F[f.kind];
    if (build) build(grp, W, D, f, { x: f.x, rot });
    statics.add(grp);
  }

  /* ---------------------------------------------------------------- wall decor */
  const frames = [
    [2.0, 1.75, 0.12, "#f4a261"],
    [5.2, 1.6, 0.12, "#81b29a"],
    [9.0, 1.7, 0.12, "#3a86ff"],
    [11.9, 1.8, 0.12, "#e9c46a"],
    [17.2, 1.65, 0.12, "#e76f51"],
    [23.3, 1.75, 0.12, "#2a9d8f"],
  ];
  for (const [x, y, z, c] of frames) {
    kit.box(statics, 0.62, 0.5, 0.04, "#5c4033", x, y - 0.25, z, { r: 0.01 });
    const art = new THREE.Mesh(kit.rbox(0.5, 0.38, 0.02, 0.005), kit.mat(c, { rough: 0.6 }));
    art.position.set(x, y, z + 0.025);
    statics.add(art);
  }
  for (const [z, c] of [[2.2, "#e07a5f"], [15.0, "#6d597a"]]) {
    kit.box(statics, 0.04, 0.5, 0.62, "#5c4033", 0.12, 1.4, z, { r: 0.01 });
    const art = new THREE.Mesh(kit.rbox(0.02, 0.38, 0.5, 0.005), kit.mat(c));
    art.position.set(0.15, 1.65, z);
    statics.add(art);
  }
  // wall clock in the kitchen side of the hall — it ticks with the countdown
  const clock = new THREE.Group();
  clock.position.set(0.12, 1.95, 9.4);
  clock.rotation.y = Math.PI / 2;
  statics.add(clock);
  kit.mesh(kit.cyl(0.24, 0.24, 0.05, 28), kit.mat("#fdf6e3"), 0, 0, 0, clock).rotation.x = Math.PI / 2;
  kit.mesh(kit.g("clockRim", () => new THREE.TorusGeometry(0.24, 0.025, 8, 28)), kit.mat("#2b2d42"), 0, 0, 0.02, clock);
  const hand = new THREE.Mesh(kit.rbox(0.02, 0.2, 0.01, 0.004), kit.mat("#e63946"));
  hand.geometry = own(new THREE.BoxGeometry(0.02, 0.2, 0.01).translate(0, 0.09, 0));
  hand.position.z = 0.04;
  clock.add(hand);

  /* ---------------------------------------------------------------- the hatch */
  const hatch = new THREE.Group();
  hatch.position.set(HATCH.x, 0, HATCH.z);
  scene.add(hatch);
  const rim = new THREE.Mesh(own(new THREE.RingGeometry(0.62, 0.95, 40)), own(new THREE.MeshStandardMaterial({ map: T.hazard, roughness: 0.6 }), owned.mats));
  rim.rotation.x = -Math.PI / 2;
  rim.position.y = 0.02;
  rim.receiveShadow = true;
  hatch.add(rim);
  const pit = new THREE.Mesh(own(new THREE.CircleGeometry(0.62, 32)), own(new THREE.MeshBasicMaterial({ color: "#163b2a" }), owned.mats));
  pit.rotation.x = -Math.PI / 2;
  pit.position.y = 0.018;
  hatch.add(pit);
  const glowDisc = new THREE.Mesh(kit.g("plane1", () => new THREE.PlaneGeometry(1, 1)), own(new THREE.MeshBasicMaterial({ map: T.blob, color: "#6dffa8", transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending }), owned.mats));
  glowDisc.rotation.x = -Math.PI / 2;
  glowDisc.scale.set(1.3, 1.3, 1);
  glowDisc.position.y = 0.03;
  hatch.add(glowDisc);
  for (const sx of [-1, 1]) kit.box(hatch, 0.05, 0.5, 0.05, "#8d99ae", sx * 0.28, -0.1, -0.35, { metal: 0.6, r: 0.01 });
  const lid = new THREE.Group();
  lid.position.set(0, 0.06, -0.66);
  hatch.add(lid);
  const lidDisc = kit.mesh(kit.cyl(0.66, 0.66, 0.08, 32), kit.mat("#5b6670", { metal: 0.6, rough: 0.45 }), 0, 0, 0.66, lid);
  kit.mesh(kit.cyl(0.08, 0.08, 0.1, 12), kit.mat("#f2c230"), 0, 0.06, 0.66, lid);
  lidDisc.castShadow = true;
  lid.rotation.x = -1.75;
  const ringMarker = new THREE.Mesh(own(new THREE.RingGeometry(HATCH.r - 0.08, HATCH.r, 48)), own(new THREE.MeshBasicMaterial({ color: "#4dff91", transparent: true, opacity: 0.6, depthWrite: false }), owned.mats));
  ringMarker.rotation.x = -Math.PI / 2;
  ringMarker.position.y = 0.025;
  hatch.add(ringMarker);
  const beamMat = own(new THREE.MeshBasicMaterial({ color: "#4dff91", transparent: true, opacity: 0.13, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }), owned.mats);
  const beam = new THREE.Mesh(own(new THREE.CylinderGeometry(0.75, 0.95, 7, 28, 1, true)), beamMat);
  beam.position.y = 3.5;
  hatch.add(beam);
  const arrow = new THREE.Group();
  hatch.add(arrow);
  const arrowM = kit.mat("#4dff91", { emissive: "#2bff7a", ei: 0.9 });
  const cone = new THREE.Mesh(kit.g("arrowCone", () => new THREE.ConeGeometry(0.2, 0.32, 4)), arrowM);
  cone.rotation.x = Math.PI;
  arrow.add(cone);
  const stem = new THREE.Mesh(kit.rbox(0.1, 0.3, 0.1, 0.02), arrowM);
  stem.position.y = 0.3;
  arrow.add(stem);

  /* ---------------------------------------------------------------- outside dressing */
  const tree = (x, z, s = 1, tone = "#5a8f3c") => {
    const t = new THREE.Group();
    t.position.set(x, 0, z);
    t.scale.setScalar(s);
    kit.mesh(kit.cyl(0.18, 0.26, 2.2, 10), kit.mat("#6b4a2f"), 0, 1.1, 0, t);
    const m1 = kit.mat(tone, { rough: 0.85 });
    const m2 = kit.mat(kit.shadeOf(tone, 0.07), { rough: 0.85 });
    for (const [a, b, c, r] of [[0, 2.8, 0, 1.3], [0.8, 2.5, 0.3, 0.9], [-0.7, 2.6, -0.2, 1.0], [0.1, 3.5, -0.2, 0.9], [-0.3, 2.3, 0.7, 0.8]]) kit.mesh(kit.sph(r, 12), r > 1 ? m1 : m2, a, b, c, t);
    statics.add(t);
  };
  tree(-4, 3, 1.25);
  tree(-5, 13, 1.05, "#6a994e");
  tree(28.5, 2, 1.15, "#4f7f35");
  tree(29.5, 12.5, 0.95);
  tree(10, -5, 1.3, "#6a994e");
  tree(-9, 26, 1.1);
  tree(34, 27, 1.2, "#4f7f35");
  const bush = (x, z, s = 1) => kit.mesh(kit.sph(0.55 * s, 10), kit.mat("#4f7f35", { rough: 0.9 }), x, 0.35 * s, z, statics).scale.set(1.3, 0.8, 1);
  for (const [x, z] of [[1, 16.9], [3, 17], [8, 16.9], [10.5, 17], [13.5, 17], [16.5, 16.9], [-1, 8], [-1, 10.5]]) bush(x, z, 0.8 + ((x * 7) % 3) * 0.12);
  // back fence
  for (let x = -6; x <= 30; x += 1.5) kit.box(statics, 0.14, 1.1, 0.14, "#efe6d2", x, 0, -4, { r: 0.03 });
  for (const y of [0.35, 0.85]) kit.box(statics, 36, 0.08, 0.06, "#efe6d2", 12, y, -4, { r: 0.02 });
  // mailbox + street lamp
  kit.box(statics, 0.08, 1.0, 0.08, "#5c4033", 3.7, 0, 18.4, { r: 0.02 });
  kit.box(statics, 0.42, 0.28, 0.25, "#3a86ff", 3.7, 1.0, 18.4, { r: 0.08 });
  kit.mesh(kit.cyl(0.06, 0.08, 4.6, 10), kit.mat("#2b2d42"), 13, 2.3, 18.6, statics);
  kit.box(statics, 0.6, 0.12, 0.3, "#2b2d42", 13, 4.55, 18.4, { r: 0.04 });
  const lampGlow = kit.mesh(kit.sph(0.14, 10), kit.mat("#fff3c4", { emissive: "#ffd36e", ei: 1.4 }), 13, 4.45, 18.3, statics);
  lampGlow.castShadow = false;
  // the family car on the drive
  const car = new THREE.Group();
  car.position.set(21, 0, 18.4);
  statics.add(car);
  kit.box(car, 2.0, 0.6, 4.0, "#d1495b", 0, 0.3, 0, { r: 0.25, rough: 0.35 });
  kit.box(car, 1.75, 0.55, 2.1, "#d1495b", 0, 0.82, -0.25, { r: 0.22, rough: 0.35 });
  kit.box(car, 1.8, 0.42, 2.0, "#9ad1d4", 0, 0.88, -0.25, { r: 0.18, rough: 0.05, metal: 0.4 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const w = kit.mesh(kit.cyl(0.34, 0.34, 0.24, 16), kit.mat("#222", { rough: 0.6 }), sx * 0.95, 0.34, sz * 1.25, car);
    w.rotation.z = Math.PI / 2;
  }
  for (const sx of [-1, 1]) kit.mesh(kit.sph(0.12, 10), kit.mat("#fff7d6", { emissive: "#ffe9a8", ei: 0.8 }), sx * 0.65, 0.6, 2.0, car).scale.set(1, 0.7, 0.4);
  // neighbours' houses — simple shapes, dimly lit
  const neighbour = (x, z, col, roof) => {
    const h = new THREE.Group();
    h.position.set(x, 0, z);
    statics.add(h);
    kit.box(h, 9, 3.2, 8, col, 0, 0, 0, { r: 0.05 });
    const r = new THREE.Mesh(kit.g("roofPrism", () => new THREE.CylinderGeometry(0.01, 6.6, 2.6, 4, 1)), kit.mat(roof, { rough: 0.8 }));
    r.position.y = 4.5;
    r.rotation.y = Math.PI / 4;
    r.scale.set(1, 1, 0.85);
    r.castShadow = true;
    h.add(r);
    for (const wx of [-2.5, 2.5]) kit.box(h, 1.4, 1.1, 0.06, "#ffd59e", wx, 1.3, 4.02, { emissive: "#ffb347", ei: 0.7, r: 0.01 });
  };
  neighbour(-14, 7, "#c9d6df", "#52616b");
  neighbour(39, 7, "#f0d9b5", "#8c5e3c");
  neighbour(-12, 29, "#d8e2dc", "#6d6875");
  neighbour(36, 30, "#ffe5d9", "#9d8189");

  bakeWorld(statics, vcMat, own);

  /* ---------------------------------------------------------------- dynamic: characters, items, fx */
  const chars = {};
  for (const f of FAMILY) {
    const c = buildCharacter(kit, f.id);
    c.root.visible = false;
    scene.add(c.root);
    chars[f.id] = c;
  }
  const items = new Map(); // id → { grp, model, halo, kind, base }
  const haloGeo = kit.g("plane1", () => new THREE.PlaneGeometry(1, 1));
  const haloMats = {};
  const haloMat = (kind) =>
    (haloMats[kind] ||= own(new THREE.MeshBasicMaterial({ map: T.ring, color: ITEMS[kind].color, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending }), owned.mats));
  const targetRing = new THREE.Mesh(haloGeo, own(new THREE.MeshBasicMaterial({ map: T.ring, color: "#ffffff", transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending }), owned.mats));
  targetRing.rotation.x = -Math.PI / 2;
  targetRing.visible = false;
  scene.add(targetRing);
  let itemsSeed = null;
  const protos = {};
  const itemProto = (kind) => {
    if (protos[kind]) return protos[kind];
    const g = new THREE.Group();
    kit.I[kind](g);
    g.traverse((o) => {
      if (o.isMesh) o.castShadow = false;
    });
    bakeLocal(g, vcMat, new Set(), own);
    return (protos[kind] = g);
  };
  function buildItems(S) {
    for (const it of items.values()) scene.remove(it.grp);
    items.clear();
    for (const it of S.items) {
      const grp = new THREE.Group();
      grp.position.set(it.x, it.y, it.z);
      const model = itemProto(it.kind).clone(true);
      model.rotation.y = (it.id * 1.7) % 6.28;
      grp.add(model);
      const halo = new THREE.Mesh(haloGeo, haloMat(it.kind));
      halo.rotation.x = -Math.PI / 2;
      halo.position.y = 0.02;
      halo.scale.setScalar(0.75);
      grp.add(halo);
      scene.add(grp);
      items.set(it.id, { grp, model, halo, kind: it.kind, base: it.y });
    }
    itemsSeed = S.seed;
  }
  // flying pickups + sparkles + dust (pooled sprites)
  const flyers = [];
  const sparkMat = (color) => {
    const m = new THREE.SpriteMaterial({ map: T.blob, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    kit.extraMaterials.push(m);
    return m;
  };
  const sparks = [];
  for (let i = 0; i < 60; i++) {
    const s = new THREE.Sprite(sparkMat("#ffffff"));
    s.visible = false;
    scene.add(s);
    sparks.push({ s, life: 0, v: new THREE.Vector3() });
  }
  const dust = [];
  for (let i = 0; i < 24; i++) {
    const m = new THREE.SpriteMaterial({ map: T.blob, color: "#cdbfa6", transparent: true, depthWrite: false, opacity: 0.5 });
    kit.extraMaterials.push(m);
    const s = new THREE.Sprite(m);
    s.visible = false;
    scene.add(s);
    dust.push({ s, life: 0 });
  }
  let dustT = 0;
  const burst = (x, y, z, color, n = 14) => {
    let k = 0;
    for (const p of sparks) {
      if (p.life > 0) continue;
      p.life = 0.5 + Math.random() * 0.3;
      p.s.material.color.set(color);
      p.s.position.set(x, y + 0.2, z);
      const a = Math.random() * Math.PI * 2;
      p.v.set(Math.cos(a) * (1 + Math.random() * 2), 1.5 + Math.random() * 2.5, Math.sin(a) * (1 + Math.random() * 2));
      p.s.visible = true;
      if (++k >= n) break;
    }
  };

  /* ---------------------------------------------------------------- quality / sizing */
  let q = quality;
  function setQuality(next) {
    q = next;
    const dpr = Math.min(window.devicePixelRatio || 1, q === "high" ? 2 : q === "medium" ? 1.5 : 1);
    renderer.setPixelRatio(dpr);
    const sh = q !== "low";
    renderer.shadowMap.enabled = sh;
    sun.castShadow = sh;
    sun.shadow.mapSize.set(q === "high" ? 2048 : 1024, q === "high" ? 2048 : 1024);
    if (sun.shadow.map) {
      sun.shadow.map.dispose();
      sun.shadow.map = null;
    }
    for (const [i, l] of roomLights.entries()) l.visible = q !== "low" || i % 2 === 0;
    scene.traverse((o) => {
      if (o.material) {
        const ms = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of ms) m.needsUpdate = true;
      }
    });
    resize();
  }
  let vw = 1;
  let vh = 1;
  function resize() {
    const r = host.getBoundingClientRect();
    vw = Math.max(1, r.width);
    vh = Math.max(1, r.height);
    renderer.setSize(vw, vh, false);
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    camera.aspect = vw / vh;
    camera.updateProjectionMatrix();
  }
  setQuality(quality);

  /* ---------------------------------------------------------------- per frame */
  const camPos = new THREE.Vector3(CX, 16, CZ + 18);
  const camLook = new THREE.Vector3(CX, 0, CZ);
  const tmp = new THREE.Vector3();
  let time = 0;
  let shake = 0;
  let lastCarry = "";
  let runnerId = null;
  const savedAnim = {};
  const colA = new THREE.Color("#f6c48c");
  const colB = new THREE.Color("#ff7a45");
  const colC = new THREE.Color("#b8322a");
  const winA = new THREE.Color("#ffb066");
  const winB = new THREE.Color("#ff3b2f");

  function setCarry(ch, kinds) {
    const key = kinds.join(",");
    if (key === lastCarry) return;
    lastCarry = key;
    while (ch.carry.children.length) ch.carry.remove(ch.carry.children[0]);
    ch.carried = kinds.slice();
    let y = 0;
    kinds.forEach((k, i) => {
      const g = new THREE.Group();
      kit.I[k](g);
      g.scale.setScalar(0.62);
      g.position.set(((i % 2) - 0.5) * 0.12, y, 0);
      g.rotation.y = i * 0.7;
      y += k === "radio" || k === "toolkit" ? 0.2 : 0.15;
      ch.carry.add(g);
    });
  }

  /**
   * view: { mode: "menu" | "run", dt, events[], shakeOn }
   */
  function frame(dt, S, view = {}) {
    time += dt;
    const mode = view.mode || "menu";
    // ---- atmosphere: gold → orange → siren red over the minute
    const p = S && mode === "run" ? Math.min(1, S.t / S.limit) : 0;
    const sirenOn = S && mode === "run" && S.intro <= 0 && !S.ended ? 1 : mode === "menu" ? 0 : 0.6;
    const pulse = 0.5 + 0.5 * Math.sin(time * 5.2);
    const skyCol = p < 0.6 ? colA.clone().lerp(colB, p / 0.6) : colB.clone().lerp(colC, (p - 0.6) / 0.4);
    if (mode === "menu") skyCol.copy(colA).lerp(new THREE.Color("#e9a46f"), 0.5 + 0.5 * Math.sin(time * 0.1));
    scene.background.copy(skyCol);
    scene.fog.color.copy(skyCol);
    hemi.color.copy(new THREE.Color("#ffe9cf").lerp(new THREE.Color("#ffb3a0"), p * 0.8));
    hemi.intensity = 1.15 - p * 0.25;
    sun.color.copy(new THREE.Color("#ffd29a").lerp(new THREE.Color("#ff7a50"), p));
    sun.intensity = 2.4 - p * 0.6;
    siren.intensity = sirenOn * (p > 0.83 ? 70 : 38) * Math.pow(pulse, 3);
    for (const m of windows) {
      if (m.emissive) {
        m.emissive.copy(winA).lerp(winB, p * (0.5 + 0.5 * pulse * sirenOn));
        m.emissiveIntensity = 0.8 + sirenOn * pulse * 0.6 * p;
      } else m.color.copy(winA).lerp(winB, p * 0.8);
    }
    const flicker = S && mode === "run" && S.limit - S.t < 10 && !S.ended ? (Math.random() < 0.08 ? 0.35 : 1) : 1;
    for (const l of roomLights) l.intensity = 9 * flicker;
    hand.rotation.z = -((S && mode === "run" ? S.t : time) / 60) * Math.PI * 2;
    // ---- hatch marker
    const hp = 0.5 + 0.5 * Math.sin(time * 4);
    ringMarker.material.opacity = 0.35 + hp * 0.5;
    ringMarker.scale.setScalar(S && S.inHatch ? 1.04 : 0.96 + hp * 0.06);
    ringMarker.material.color.set(S && S.inHatch ? "#b8ffcf" : "#4dff91");
    beamMat.opacity = mode === "run" ? 0.1 + hp * 0.08 : 0.05;
    arrow.position.y = 3.1 + Math.sin(time * 3) * 0.22;
    arrow.rotation.y = time * 1.4;
    arrow.visible = mode === "run" && !(S && S.inHatch);
    hatchLight.intensity = 5 + hp * 3;
    glowDisc.material.opacity = 0.6 + hp * 0.35;
    // ---- items
    if (S && (itemsSeed !== S.seed || items.size !== S.items.length)) buildItems(S);
    if (!S && items.size) {
      for (const it of items.values()) scene.remove(it.grp);
      items.clear();
      itemsSeed = null;
    }
    if (S) {
      for (const it of S.items) {
        const v = items.get(it.id);
        if (!v) continue;
        if (it.taken) {
          if (v.grp.visible) v.grp.visible = false;
          continue;
        }
        v.grp.visible = true;
        v.model.position.y = 0.05 + Math.sin(time * 2.6 + it.id) * 0.04;
        v.model.rotation.y += dt * 0.6;
        v.halo.material.opacity = 0.55 + 0.3 * Math.sin(time * 3 + it.id);
      }
    }
    // ---- characters
    for (const c of Object.values(chars)) c.root.visible = false;
    if (S) {
      runnerId = S.runner;
      const pc = chars[S.runner];
      pc.root.visible = true;
      pc.root.position.set(S.P.x, 0, S.P.z);
      pc.root.rotation.y = S.P.yaw;
      setCarry(pc, S.carry);
      animate(pc, dt, time, S.ended === "failed" ? 0 : S.P.speed || 0, S.ended === "failed" ? "scared" : "walk");
      pc.bubble.visible = false;
      for (const f of S.family) {
        const c = chars[f.id];
        if (f.state === "saved") {
          const a = (savedAnim[f.id] ??= 0) + dt;
          savedAnim[f.id] = a;
          if (a < 0.6) {
            c.root.visible = true;
            c.root.position.set(HATCH.x, -a * 2.2, HATCH.z);
            c.root.scale.setScalar(Math.max(0.01, 1 - a * 1.4));
            animate(c, dt, time, 0, "help");
          }
          continue;
        }
        savedAnim[f.id] = 0;
        c.root.scale.setScalar(1);
        c.root.visible = true;
        c.root.position.set(f.x, 0, f.z);
        if (f.state === "waiting") {
          const dx = S.P.x - f.x;
          const dz = S.P.z - f.z;
          const near = Math.hypot(dx, dz) < 6;
          c.root.rotation.y = near ? Math.atan2(dx, dz) : f.yaw + Math.sin(time * 0.7 + f.x) * 0.6;
          c.bubble.visible = mode === "run";
          animate(c, dt, time, 0, mode === "run" ? "help" : "idle");
        } else {
          c.bubble.visible = false;
          c.root.rotation.y = f.yaw || 0;
          animate(c, dt, time, f.moving ? 3.8 : 0, "walk");
        }
      }
      // target highlight
      const tg = S.target;
      if (tg && mode === "run") {
        let x;
        let z;
        if (tg.type === "item") {
          const it = S.items.find((i) => i.id === tg.id);
          x = it.x;
          z = it.z;
        } else {
          const f = S.family.find((m) => m.id === tg.id);
          x = f.x;
          z = f.z;
        }
        targetRing.visible = true;
        targetRing.position.set(x, 0.03, z);
        const k = 1.1 + Math.sin(time * 8) * 0.1;
        targetRing.scale.set(k, k, 1);
        targetRing.material.color.set(tg.blocked ? "#ff5a5a" : "#ffffff");
      } else targetRing.visible = false;
      // dust puffs while running
      dustT -= dt;
      if ((S.P.speed || 0) > 1 && dustT <= 0) {
        dustT = 0.12;
        const d = dust.find((x) => x.life <= 0);
        if (d) {
          d.life = 0.6;
          d.s.position.set(S.P.x - Math.sin(S.P.yaw) * 0.3, 0.1, S.P.z - Math.cos(S.P.yaw) * 0.3);
          d.s.visible = true;
        }
      }
    } else {
      // menu: the family gathered in the living room, unaware
      const spots = { hollis: [3.8, 13.6, 2.6], june: [3.4, 10.6, 0.6], remy: [6.6, 12.2, -1.6], pip: [2.5, 12.4, 1.2] };
      for (const [id, [x, z, yaw]] of Object.entries(spots)) {
        const c = chars[id];
        c.root.visible = true;
        c.root.scale.setScalar(1);
        c.root.position.set(x, 0, z);
        c.root.rotation.y = yaw;
        c.bubble.visible = false;
        animate(c, dt, time, 0, "idle");
      }
      targetRing.visible = false;
    }
    // ---- events → fx
    for (const ev of view.events || []) {
      if (ev.type === "pickup") {
        const v = items.get(ev.id);
        burst(ev.x, ev.y, ev.z, ITEMS[ev.kind].color);
        if (v) {
          const fly = new THREE.Group();
          kit.I[ev.kind](fly);
          fly.position.set(ev.x, ev.y, ev.z);
          scene.add(fly);
          flyers.push({ o: fly, t: 0, from: new THREE.Vector3(ev.x, ev.y, ev.z) });
        }
      } else if (ev.type === "deposit" || ev.type === "saved") {
        burst(HATCH.x, 0.2, HATCH.z, "#4dff91", 20);
      } else if (ev.type === "rescue") {
        const f = S && S.family.find((m) => m.id === ev.id);
        if (f) burst(f.x, 1, f.z, "#ffd166", 16);
      } else if (ev.type === "end") {
        shake = ev.how === "failed" ? 1.2 : 0.8;
      }
    }
    for (let i = flyers.length - 1; i >= 0; i--) {
      const f = flyers[i];
      f.t += dt / 0.35;
      const pc = S && chars[S.runner];
      const to = pc ? tmp.set(S.P.x, 1.1, S.P.z) : f.from;
      f.o.position.lerpVectors(f.from, to, Math.min(1, f.t));
      f.o.position.y += Math.sin(Math.min(1, f.t) * Math.PI) * 0.8;
      f.o.scale.setScalar(Math.max(0.05, 1 - f.t * 0.6));
      if (f.t >= 1) {
        scene.remove(f.o);
        flyers.splice(i, 1);
      }
    }
    for (const sp of sparks) {
      if (sp.life <= 0) continue;
      sp.life -= dt;
      sp.v.y -= 9 * dt;
      sp.s.position.addScaledVector(sp.v, dt);
      const k = Math.max(0, sp.life) * 0.5;
      sp.s.scale.set(k, k, 1);
      sp.s.material.opacity = Math.min(1, sp.life * 2);
      if (sp.life <= 0) sp.s.visible = false;
    }
    for (const d of dust) {
      if (d.life <= 0) continue;
      d.life -= dt;
      d.s.position.y += dt * 0.5;
      const k = 0.25 + (0.6 - d.life) * 0.8;
      d.s.scale.set(k, k, 1);
      d.s.material.opacity = Math.max(0, d.life * 0.7);
      if (d.life <= 0) d.s.visible = false;
    }
    // ---- camera
    const portrait = vh > vw * 1.05;
    if (mode === "run" && S) {
      const tx = Math.min(HOUSE_W - 4, Math.max(4, S.P.x));
      const tz = Math.min(HOUSE_D - 2.5, Math.max(3, S.P.z));
      const dist = (portrait ? 1.45 : 1) * (view.zoom || 1);
      const want = tmp.set(tx, 12.5 * dist, tz + 9.2 * dist);
      const k = S.intro > 0 ? 1 - Math.exp(-dt * 2.2) : 1 - Math.exp(-dt * 6);
      camPos.lerp(want, k);
      camLook.lerp(new THREE.Vector3(tx, 0.4, tz - 0.6), k);
      if (S.limit - S.t < 10 && !S.ended && S.intro <= 0 && view.shakeOn !== false) shake = Math.max(shake, 0.1 + (1 - (S.limit - S.t) / 10) * 0.18);
    } else {
      const a = time * 0.06 + 0.4;
      const want = tmp.set(CX + Math.sin(a) * 6, portrait ? 30 : 21, CZ + 19 + Math.cos(a) * 3);
      camPos.lerp(want, 1 - Math.exp(-dt * 1.5));
      camLook.lerp(new THREE.Vector3(CX - 1, 0, CZ + 0.5), 1 - Math.exp(-dt * 1.5));
    }
    camera.position.copy(camPos);
    if (shake > 0 && view.shakeOn !== false) {
      camera.position.x += (Math.random() - 0.5) * shake * 0.5;
      camera.position.y += (Math.random() - 0.5) * shake * 0.3;
      camera.position.z += (Math.random() - 0.5) * shake * 0.5;
    }
    shake = Math.max(0, shake - dt * 1.6);
    camera.lookAt(camLook);
    renderer.render(scene, camera);
  }

  /** World point → CSS px inside the host, plus whether it's on screen. */
  function project(x, y, z) {
    tmp.set(x, y, z).project(camera);
    return { x: (tmp.x * 0.5 + 0.5) * vw, y: (-tmp.y * 0.5 + 0.5) * vh, on: tmp.z < 1 && Math.abs(tmp.x) <= 0.92 && Math.abs(tmp.y) <= 0.88, w: vw, h: vh };
  }

  function dispose() {
    const geos = new Set();
    const mats = new Set();
    scene.traverse((o) => {
      if (o.geometry) geos.add(o.geometry);
      if (o.material) for (const m of Array.isArray(o.material) ? o.material : [o.material]) mats.add(m);
    });
    for (const g of [...geos, ...owned.geos]) g.dispose();
    for (const m of [...mats, ...owned.mats, ...kit.extraMaterials]) m.dispose();
    for (const t of kit.extraTextures) t.dispose();
    kit.dispose();
    disposeTextures(T);
    sun.shadow.map?.dispose();
    renderer.dispose();
    renderer.forceContextLoss?.();
    renderer.domElement.remove();
  }

  return { frame, setQuality, resize, project, dispose, renderer, scene, statics, get runner() { return runnerId; } };
}
