/**
 * The workshop interior. The bench top sits at y = 0 (the doll stands on
 * the turntable at the origin); the room is built around it:
 *   back wall  — window, display shelves, pegboard tool organizer
 *   left       — sewing station, painting station
 *   right      — hair styling station, cleaning sink, storage cabinet
 *   front      — customer counter, door and waiting area (seen in the
 *                customer scene when the camera turns around)
 * Everything visibly follows the save's upgrades: three workshop stages
 * (beginner → studio → boutique) plus bench, lighting, sewing, painting,
 * hair, shelves, waiting area, storage and decorations. Restored dolls from
 * the gallery stand on the display shelves.
 */
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { revolve, profile, tube, V3 } from "./geo.js";
import { mat } from "./materials.js";
import { floorTex, wallTex, woodTex, rugTex, marbleTex, matTex, pegTex, paintingTex, windowViewTex, booksTex, fabricTex } from "./textures.js";
import { buildDoll } from "./dollModel.js";
import { applySnapshot } from "../engine/session.js";

export const FLOOR_Y = -2.6;
const CEIL = 6.2;
const ROOM = { x0: -9, x1: 9, z0: -5.2, z1: 9 };

export function buildWorkshop(up = {}, gallery = [], { quality = "high" } = {}) {
  const g = new THREE.Group();
  g.name = "workshop";
  const stage = up.stage || 0;
  const disposables = [];
  const M = (c, o) => {
    const m = mat(c, o);
    disposables.push(m);
    return m;
  };
  const add = (geo, m, x = 0, y = 0, z = 0, ry = 0, parent = g) => {
    const o = new THREE.Mesh(geo, m);
    o.position.set(x, y, z);
    o.rotation.y = ry;
    o.castShadow = true;
    o.receiveShadow = true;
    parent.add(o);
    return o;
  };
  const rbox = (w, h, d, r = 0.04) => new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2, h / 2, d / 2));
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);

  const woodL = woodTex("light");
  const woodM = woodTex("mid");
  const woodD = woodTex("dark");
  const pine = M("#e7c79c", { map: woodL, roughness: 0.6 });
  const walnut = M("#9a6a45", { map: woodD, roughness: 0.45 });
  const oak = M("#c99a6a", { map: woodM, roughness: 0.55 });
  const white = M("#f6f0e8", { roughness: 0.6 });
  const brass = new THREE.MeshStandardMaterial({ color: "#d8b46a", metalness: 1, roughness: 0.28 });
  const steel = new THREE.MeshStandardMaterial({ color: "#c8c6c2", metalness: 1, roughness: 0.3 });
  disposables.push(brass, steel);

  /* ------------------------------------------------------------ shell */
  const W = ROOM.x1 - ROOM.x0;
  const D = ROOM.z1 - ROOM.z0;
  const H = CEIL - FLOOR_Y;
  const floorMat = M("#ffffff", { map: floorTex(stage + 1), roughness: stage === 2 ? 0.35 : 0.7 });
  const floor = add(new THREE.PlaneGeometry(W, D), floorMat, 0, FLOOR_Y, (ROOM.z0 + ROOM.z1) / 2);
  floor.rotation.x = -Math.PI / 2;
  floor.castShadow = false;
  const wallMat = M("#ffffff", { map: wallTex(stage + 1), roughness: 0.9 });
  const back = add(new THREE.PlaneGeometry(W, H), wallMat, 0, FLOOR_Y + H / 2, ROOM.z0);
  back.castShadow = false;
  const left = add(new THREE.PlaneGeometry(D, H), wallMat, ROOM.x0, FLOOR_Y + H / 2, (ROOM.z0 + ROOM.z1) / 2, Math.PI / 2);
  left.castShadow = false;
  const right = add(new THREE.PlaneGeometry(D, H), wallMat, ROOM.x1, FLOOR_Y + H / 2, (ROOM.z0 + ROOM.z1) / 2, -Math.PI / 2);
  right.castShadow = false;
  const front = add(new THREE.PlaneGeometry(W, H), wallMat, 0, FLOOR_Y + H / 2, ROOM.z1, Math.PI);
  front.castShadow = false;
  const ceil = add(new THREE.PlaneGeometry(W, D), M(stage === 2 ? "#f7efe6" : "#fbf6ef", { roughness: 1 }), 0, CEIL, (ROOM.z0 + ROOM.z1) / 2);
  ceil.rotation.x = Math.PI / 2;
  ceil.castShadow = false;
  // skirting + (boutique) wainscoting with gold trim
  const skirt = stage === 2 ? M("#f3ece4") : stage === 1 ? M("#fdf8f2") : oak;
  for (const [x, z, w, ry] of [[0, ROOM.z0 + 0.03, W, 0], [ROOM.x0 + 0.03, (ROOM.z0 + ROOM.z1) / 2, D, Math.PI / 2], [ROOM.x1 - 0.03, (ROOM.z0 + ROOM.z1) / 2, D, -Math.PI / 2], [0, ROOM.z1 - 0.03, W, Math.PI]]) {
    add(box(w, stage === 2 ? 2.4 : 0.35, 0.06), skirt, x, FLOOR_Y + (stage === 2 ? 1.2 : 0.175), z, ry);
    if (stage === 2) add(box(w, 0.07, 0.1), brass, x, FLOOR_Y + 2.42, z, ry);
    if (stage >= 1) add(box(w, 0.16, 0.12), stage === 2 ? white : skirt, x, CEIL - 0.08, z, ry);
  }
  if (stage >= 1) {
    const rug = add(new THREE.PlaneGeometry(stage === 2 ? 9 : 7, stage === 2 ? 6 : 4.6), M("#ffffff", { map: rugTex(stage + 1), roughness: 0.95 }), 0, FLOOR_Y + 0.01, 1.2);
    rug.rotation.x = -Math.PI / 2;
    rug.castShadow = false;
  }

  /* ------------------------------------------------------------ window */
  const winW = stage === 0 ? 3.2 : stage === 1 ? 4.6 : 5.4;
  const winH = stage === 0 ? 2.6 : 3.4;
  const winY = FLOOR_Y + 4.3;
  const view = add(new THREE.PlaneGeometry(winW, winH), new THREE.MeshBasicMaterial({ map: windowViewTex(), toneMapped: false }), 0, winY, ROOM.z0 + 0.02);
  view.castShadow = false;
  view.material.color.setScalar(stage === 2 ? 1.05 : 1);
  disposables.push(view.material);
  const frameM = stage === 2 ? white : M("#fbf6ee");
  const fw = 0.14;
  for (const [x, y, w, h] of [[0, winY + winH / 2, winW + fw * 2, fw], [0, winY - winH / 2, winW + fw * 2, fw], [-winW / 2, winY, fw, winH], [winW / 2, winY, fw, winH], [0, winY, 0.06, winH], [0, winY + winH * 0.1, winW, 0.06]]) add(box(w, h, 0.12), frameM, x, y, ROOM.z0 + 0.08);
  add(box(winW + 0.5, 0.12, 0.45), frameM, 0, winY - winH / 2 - 0.08, ROOM.z0 + 0.2);
  // curtains
  const curtainMat = stage === 2 ? M("#7d3f6e", { map: fabricTex("velvet"), roughness: 0.75 }) : stage === 1 ? M("#f6c6cf", { map: fabricTex("cotton"), roughness: 0.85 }) : M("#f4ead2", { map: fabricTex("cotton") });
  for (const s of [-1, 1]) {
    const cw = stage === 0 ? 0.7 : 1.1;
    const cur = revolve(profile([[0.3, 0], [0.32, 1]], 2).map((r) => ({ r: r.r, y: r.y * (winH + 1.0) })), { segs: 24, a0: 0, a1: Math.PI, rFn: (a, ring, t, r) => r * (1 + 0.25 * Math.sin(a * 9)) });
    const c = add(cur, curtainMat, s * (winW / 2 + cw * 0.35), winY - winH / 2 - 0.7, ROOM.z0 + 0.3);
    c.scale.set(cw, 1, 0.5);
    c.rotation.y = Math.PI;
    c.material.side = THREE.DoubleSide;
  }
  add(new THREE.CylinderGeometry(0.04, 0.04, winW + 3, 10), brass, 0, winY + winH / 2 + 0.35, ROOM.z0 + 0.3).rotation.z = Math.PI / 2;

  /* ------------------------------------------------------------- bench */
  const benchT = up.bench || 0;
  const bench = new THREE.Group();
  g.add(bench);
  const topM = benchT === 2 ? walnut : benchT === 1 ? oak : pine;
  add(rbox(4.4, 0.16, 2.2, 0.05), topM, 0, -0.08, -0.05, 0, bench);
  const legH = -FLOOR_Y - 0.16;
  if (benchT === 0) {
    for (const [x, z] of [[-2, -1], [2, -1], [-2, 0.9], [2, 0.9]]) add(box(0.14, legH, 0.14), pine, x, -0.16 - legH / 2, z, 0, bench);
    add(box(4.0, 0.08, 0.08), pine, 0, FLOOR_Y + 0.5, -1, 0, bench);
  } else {
    // drawer pedestals
    for (const s of [-1, 1]) {
      add(rbox(1.3, legH, 1.9, 0.04), topM, s * 1.45, -0.16 - legH / 2, -0.05, 0, bench);
      for (let k = 0; k < 3; k++) {
        add(rbox(1.18, legH / 3 - 0.08, 0.04, 0.02), benchT === 2 ? M("#b07e55", { map: woodD }) : M("#d8b088", { map: woodM }), s * 1.45, -0.16 - legH / 6 - (k * legH) / 3, 0.92, 0, bench);
        add(new THREE.SphereGeometry(0.05, 10, 8), brass, s * 1.45, -0.16 - legH / 6 - (k * legH) / 3, 0.96, 0, bench);
      }
    }
    add(box(1.4, 0.1, 1.8), topM, 0, -0.5, -0.05, 0, bench);
  }
  // cutting mat + turntable
  const cm = add(new THREE.PlaneGeometry(2.0, 1.4), M("#ffffff", { map: matTex(), roughness: 0.8 }), 0, 0.003, 0.1, 0, bench);
  cm.rotation.x = -Math.PI / 2;
  cm.castShadow = false;
  const turn = new THREE.Group();
  turn.name = "turntable";
  bench.add(turn);
  add(new THREE.CylinderGeometry(0.42, 0.45, 0.06, 48), benchT === 2 ? walnut : M("#f2ece4", { roughness: 0.4 }), 0, 0.03, 0, 0, turn);
  if (benchT === 2) {
    const ring = add(new THREE.TorusGeometry(0.44, 0.012, 8, 64), new THREE.MeshStandardMaterial({ color: "#fff2d6", emissive: "#ffd99a", emissiveIntensity: 1.6 }), 0, 0.045, 0, 0, turn);
    ring.rotation.x = Math.PI / 2;
  }
  // tool caddy + spools + jar of brushes (bench dressing — the real tools live in the HUD)
  const caddy = new THREE.Group();
  caddy.position.set(-1.55, 0, -0.55);
  bench.add(caddy);
  add(rbox(0.7, 0.28, 0.4, 0.04), oak, 0, 0.14, 0, 0, caddy);
  const jar = add(revolve(profile([[0.12, 0], [0.13, 0.05], [0.12, 0.34], [0.13, 0.36]], 2), { segs: 24, capBottom: true }), new THREE.MeshPhysicalMaterial({ color: "#dfeef0", roughness: 0.1, transparent: true, opacity: 0.5 }), 0.75, 0, 0.15, 0, caddy);
  disposables.push(jar.material);
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2;
    const h = add(new THREE.CylinderGeometry(0.012, 0.016, 0.5, 6), M(["#c7384b", "#3a4f86", "#e8b86a", "#5e8a5a", "#7d3f6e"][k]), 0.75 + Math.cos(a) * 0.04, 0.3, 0.15 + Math.sin(a) * 0.04, 0, caddy);
    h.rotation.set(Math.sin(a) * 0.15, 0, Math.cos(a) * 0.15);
    add(new THREE.ConeGeometry(0.022, 0.07, 8), M("#d9b88a", { roughness: 1 }), h.position.x + Math.cos(a) * 0.04, 0.585, h.position.z + Math.sin(a) * 0.04, 0, caddy);
  }
  for (let k = 0; k < 4; k++) {
    const sp = add(new THREE.CylinderGeometry(0.06, 0.06, 0.1, 16), M(["#f39ac0", "#8ec5ec", "#f5dc8c", "#9fdcc0"][k]), -0.2 + k * 0.14, 0.33, 0.05, 0, caddy);
    add(new THREE.CylinderGeometry(0.075, 0.075, 0.015, 16), oak, sp.position.x, 0.28, 0.05, 0, caddy);
    add(new THREE.CylinderGeometry(0.075, 0.075, 0.015, 16), oak, sp.position.x, 0.385, 0.05, 0, caddy);
  }
  // parts tray (removed parts drop here)
  const tray = new THREE.Group();
  tray.position.set(1.45, 0, 0.35);
  tray.name = "tray";
  bench.add(tray);
  add(rbox(0.8, 0.08, 0.55, 0.03), M("#e9e4dc", { roughness: 0.4 }), 0, 0.04, 0, 0.1, tray);
  add(rbox(0.72, 0.05, 0.47, 0.02), M("#b9c9c4", { roughness: 0.9 }), 0, 0.07, 0, 0.1, tray);
  // magnifier lamp (lighting tier ≥ 1) or simple desk lamp
  const lampGroup = new THREE.Group();
  lampGroup.position.set(1.7, 0, -0.75);
  bench.add(lampGroup);
  add(new THREE.CylinderGeometry(0.2, 0.24, 0.06, 24), steel, 0, 0.03, 0, 0, lampGroup);
  const arm1 = add(new THREE.CylinderGeometry(0.025, 0.025, 1.1, 8), steel, -0.15, 0.55, 0.1, 0, lampGroup);
  arm1.rotation.z = 0.35;
  const arm2 = add(new THREE.CylinderGeometry(0.022, 0.022, 0.9, 8), steel, -0.55, 1.15, 0.25, 0, lampGroup);
  arm2.rotation.z = 1.25;
  arm2.rotation.x = -0.3;
  const headM = new THREE.MeshStandardMaterial({ color: (up.lighting || 0) >= 1 ? "#f2ece6" : "#e98aa6", roughness: 0.4 });
  disposables.push(headM);
  if ((up.lighting || 0) >= 1) {
    const ringL = add(new THREE.TorusGeometry(0.26, 0.05, 10, 32), headM, -0.95, 1.25, 0.35, 0, lampGroup);
    ringL.rotation.x = Math.PI / 2 - 0.5;
    const lens = add(new THREE.CircleGeometry(0.24, 32), new THREE.MeshPhysicalMaterial({ color: "#eaf6ff", roughness: 0.02, transparent: true, opacity: 0.25, clearcoat: 1 }), -0.95, 1.25, 0.35, 0, lampGroup);
    lens.rotation.x = -Math.PI / 2 - 0.5;
    disposables.push(lens.material);
  } else {
    const shade = add(new THREE.ConeGeometry(0.22, 0.3, 24, 1, true), headM, -0.95, 1.25, 0.35, 0, lampGroup);
    shade.rotation.z = 0.5;
    shade.material.side = THREE.DoubleSide;
  }
  add(new THREE.SphereGeometry(0.08, 12, 10), new THREE.MeshStandardMaterial({ color: "#fff7e0", emissive: "#ffe2a8", emissiveIntensity: 2 }), -0.95, 1.2, 0.35, 0, lampGroup);

  /* ------------------------------------------------------ back wall dressing */
  // pegboard tool organizer behind the bench (left of window)
  const pegX = -winW / 2 - 2.1;
  if (stage >= 1 || (up.tools || 0) >= 1) {
    add(box(2.6, 2.0, 0.06), M("#ffffff", { map: pegTex(), roughness: 0.8 }), pegX, FLOOR_Y + 4.0, ROOM.z0 + 0.06);
    const tools = [["#c7384b", 0.5], ["#3a4f86", 0.7], ["#e8b86a", 0.4], ["#5e8a5a", 0.6], ["#7d3f6e", 0.5], ["#c8c6c2", 0.8]];
    tools.forEach(([c, h], k) => {
      const x = pegX - 1.0 + k * 0.4;
      add(new THREE.CylinderGeometry(0.04, 0.05, h, 8), M(c), x, FLOOR_Y + 4.3 - h / 2, ROOM.z0 + 0.15);
      add(new THREE.BoxGeometry(0.1, 0.18, 0.04), steel, x, FLOOR_Y + 4.4 + 0.02, ROOM.z0 + 0.13);
    });
    // scissors
    for (const s of [-1, 1]) add(new THREE.TorusGeometry(0.08, 0.02, 6, 16), M("#e98aa6"), pegX + 0.3 + s * 0.09, FLOOR_Y + 3.3, ROOM.z0 + 0.13);
    add(box(0.05, 0.5, 0.02), steel, pegX + 0.3, FLOOR_Y + 3.65, ROOM.z0 + 0.13);
  } else {
    // a single small tool rack
    add(box(1.4, 0.12, 0.3), pine, pegX, FLOOR_Y + 4.0, ROOM.z0 + 0.18);
    for (let k = 0; k < 4; k++) add(new THREE.CylinderGeometry(0.04, 0.04, 0.4, 8), M(["#c7384b", "#3a4f86", "#e8b86a", "#5e8a5a"][k]), pegX - 0.5 + k * 0.33, FLOOR_Y + 3.82, ROOM.z0 + 0.18);
  }
  // display shelves (right of window) — restored dolls go here
  const shelfT = up.shelves || 0;
  const shelfX = winW / 2 + 2.3;
  const shelves = new THREE.Group();
  g.add(shelves);
  const nShelves = shelfT === 0 ? 1 : 3;
  const shelfY0 = FLOOR_Y + 3.1;
  const slots = [];
  for (let k = 0; k < nShelves; k++) {
    const y = shelfY0 + k * 1.25;
    add(rbox(3.0, 0.1, 0.7, 0.03), shelfT === 2 ? white : oak, shelfX, y, ROOM.z0 + 0.4, 0, shelves);
    for (let i = 0; i < 3; i++) slots.push(V3(shelfX - 1.0 + i * 1.0, y + 0.05, ROOM.z0 + 0.42));
    if (k === 0) add(new THREE.PlaneGeometry(2.6, 0.5), M("#ffffff", { map: booksTex() }), shelfX - 0.1, y + 0.3, ROOM.z0 + 0.06, 0, shelves);
  }
  if (shelfT === 2) {
    // glass display cabinet front + frame
    const glass = add(box(3.1, nShelves * 1.25 + 0.3, 0.04), new THREE.MeshPhysicalMaterial({ color: "#ffffff", roughness: 0.05, transparent: true, opacity: 0.12, clearcoat: 1 }), shelfX, shelfY0 + (nShelves * 1.25) / 2 - 0.2, ROOM.z0 + 0.78, 0, shelves);
    glass.castShadow = false;
    disposables.push(glass.material);
    for (const s of [-1, 1]) add(box(0.08, nShelves * 1.25 + 0.4, 0.8), white, shelfX + s * 1.55, shelfY0 + (nShelves * 1.25) / 2 - 0.2, ROOM.z0 + 0.4, 0, shelves);
    for (const x of [shelfX - 1.0, shelfX + 1.0]) {
      const pl = new THREE.PointLight("#ffe6c0", 1.2, 3.5, 2);
      pl.position.set(x, shelfY0 + 2.9, ROOM.z0 + 0.6);
      shelves.add(pl);
    }
  }
  // gallery dolls on display (most recent first), else a few house dolls
  const shown = gallery.slice(-Math.min(slots.length, shelfT === 0 ? 2 : 9)).reverse();
  const display = [];
  const fallback = [
    { spec: { type: "teddy", look: {}, damage: [], seed: 4 } },
    { spec: { type: "porcelain", look: { hairStyle: "bun", dressColor: "rose" }, damage: [], seed: 5 } },
  ];
  const list = shown.length ? shown : fallback;
  list.forEach((entry, k) => {
    const slot = slots[k % slots.length];
    if (!slot || k >= slots.length) return;
    try {
      const d = buildDoll({ ...entry.spec, damage: [] });
      if (entry.snap) applySnapshot(d, { look: entry.snap.look, hair: null, grime: null, tasks: [] });
      d.root.scale.setScalar(0.85);
      d.root.position.copy(slot);
      d.root.rotation.y = (k % 3 - 1) * 0.25;
      d.root.traverse((o) => {
        if (o.isMesh) {
          o.castShadow = quality === "high";
          o.receiveShadow = false;
        }
      });
      shelves.add(d.root);
      display.push(d);
    } catch {
      // a corrupt gallery entry just leaves the slot empty
    }
  });

  // wall frames + clock (decor tier)
  const decor = up.decor || 0;
  const frames = decor === 0 ? [[pegX, FLOOR_Y + 6.0, 0]] : [[pegX - 0.8, FLOOR_Y + 6.0, 0], [pegX + 0.8, FLOOR_Y + 6.1, 1], [ROOM.x0 + 0.05, FLOOR_Y + 4.6, 2]];
  frames.forEach(([x, y, i], k) => {
    const onLeft = x === ROOM.x0 + 0.05;
    const fr = new THREE.Group();
    fr.position.set(onLeft ? ROOM.x0 + 0.06 : x, y, onLeft ? -1.5 : ROOM.z0 + 0.06);
    fr.rotation.y = onLeft ? Math.PI / 2 : 0;
    g.add(fr);
    add(box(1.2, 0.95, 0.06), stage === 2 ? brass : walnut, 0, 0, 0, 0, fr);
    add(new THREE.PlaneGeometry(1.0, 0.75), M("#ffffff", { map: paintingTex(i + k), roughness: 0.9 }), 0, 0, 0.035, 0, fr);
  });
  // clock
  const clock = new THREE.Group();
  clock.position.set(winW / 2 + 0.95, FLOOR_Y + 6.2, ROOM.z0 + 0.06);
  g.add(clock);
  add(new THREE.CylinderGeometry(0.42, 0.42, 0.08, 32), stage === 2 ? brass : M("#c97b84"), 0, 0, 0, 0, clock).rotation.x = Math.PI / 2;
  add(new THREE.CircleGeometry(0.36, 32), white, 0, 0, 0.045, 0, clock);
  const hands = [add(box(0.03, 0.26, 0.01), M("#2c2830"), 0, 0.1, 0.055, 0, clock), add(box(0.03, 0.18, 0.01), M("#2c2830"), 0.06, 0.04, 0.055, 0, clock)];
  hands[1].rotation.z = -1.2;

  /* ------------------------------------------------------- left: sewing + painting */
  const sewT = up.sewing || 0;
  const sew = new THREE.Group();
  sew.position.set(-6.4, 0, -2.2);
  sew.rotation.y = Math.PI / 2.6;
  g.add(sew);
  add(rbox(2.6, 0.12, 1.4, 0.04), oak, 0, -0.65, 0, 0, sew);
  for (const [x, z] of [[-1.15, -0.55], [1.15, -0.55], [-1.15, 0.55], [1.15, 0.55]]) add(box(0.1, -FLOOR_Y - 0.71, 0.1), oak, x, (-0.71 + FLOOR_Y) / 2, z, 0, sew);
  if (sewT === 0) {
    // basket of fabric + pincushion
    add(revolve(profile([[0.35, 0], [0.42, 0.3]], 2), { segs: 24, capBottom: true }), M("#c9a46a", { map: fabricTex("knit") }), -0.4, -0.59, 0, 0, sew).material.side = THREE.DoubleSide;
    for (let k = 0; k < 3; k++) add(new THREE.SphereGeometry(0.18, 12, 10), M(["#f39ac0", "#8ec5ec", "#f5dc8c"][k]), -0.5 + k * 0.12, -0.35, (k - 1) * 0.1, 0, sew).scale.set(1.3, 0.6, 1);
    add(new THREE.SphereGeometry(0.15, 14, 10), M("#c7384b"), 0.6, -0.5, 0, 0, sew).scale.set(1, 0.7, 1);
  } else {
    const machCol = sewT === 2 ? "#f4f6f8" : "#2b2a2e";
    const mm = M(machCol, { roughness: 0.35, metalness: sewT === 2 ? 0.1 : 0.3 });
    add(rbox(1.3, 0.25, 0.55, 0.06), mm, 0, -0.46, 0, 0, sew);
    add(rbox(0.3, 0.8, 0.5, 0.08), mm, 0.5, -0.05, 0, 0, sew);
    add(rbox(1.1, 0.28, 0.48, 0.1), mm, 0.05, 0.38, 0, 0, sew);
    add(new THREE.CylinderGeometry(0.03, 0.03, 0.35, 8), steel, -0.4, 0.1, 0, 0, sew);
    add(new THREE.CylinderGeometry(0.16, 0.16, 0.1, 20), brass, 0.68, 0.3, 0.0, 0, sew).rotation.x = Math.PI / 2;
    if (sewT === 1) for (let k = 0; k < 3; k++) add(new THREE.TorusGeometry(0.05, 0.012, 6, 12), brass, -0.2 + k * 0.2, 0.38, 0.25, 0, sew);
    if (sewT === 2) add(new THREE.PlaneGeometry(0.3, 0.12), new THREE.MeshStandardMaterial({ color: "#7fd2ff", emissive: "#5ec8ff", emissiveIntensity: 1.2 }), 0.25, 0.38, 0.245, 0, sew);
    add(new THREE.CylinderGeometry(0.07, 0.07, 0.12, 16), M("#e98aa6"), 0.2, 0.6, 0, 0, sew);
  }
  // dress form (studio+)
  if (stage >= 1) {
    const form = new THREE.Group();
    form.position.set(-7.3, FLOOR_Y, 0.8);
    g.add(form);
    add(new THREE.CylinderGeometry(0.04, 0.04, 2.6, 8), walnut, 0, 1.3, 0, 0, form);
    add(revolve(profile([[0.05, 0], [0.55, 0.25], [0.42, 0.75], [0.5, 1.25], [0.25, 1.55], [0.08, 1.6]], 4), { segs: 32, squash: 0.75 }), M("#e9d6c8", { map: fabricTex("cotton") }), 0, 2.4, 0, 0, form);
    add(revolve(profile([[0.8, 0], [0.6, 0.6], [0.52, 1.0]], 3), { segs: 40, squash: 0.85, rFn: (a, ring, t, r) => r * (1 + 0.05 * Math.sin(a * 12) * (1 - t)) }), M(stage === 2 ? "#c3a8e6" : "#f6b3c9", { map: fabricTex("cotton"), side: THREE.DoubleSide }), 0, 1.8, 0, 0, form);
  }
  // painting station
  const paintT = up.painting || 0;
  const paint = new THREE.Group();
  paint.position.set(-6.8, FLOOR_Y, 4.4);
  paint.rotation.y = Math.PI / 2;
  g.add(paint);
  add(rbox(1.8, 0.1, 0.9, 0.03), pine, 0, 2.4, 0, 0, paint);
  for (const [x, z] of [[-0.8, -0.35], [0.8, -0.35], [-0.8, 0.35], [0.8, 0.35]]) add(box(0.08, 2.4, 0.08), pine, x, 1.2, z, 0, paint);
  const jarCols = paintT >= 1 ? ["#d4566e", "#ee7c6b", "#f08f9a", "#6a4632", "#8a4a7a", "#6fa8e8", "#c98a4a", "#9e3b5b"] : ["#d4566e", "#f08f9a", "#6a4632", "#3a3236"];
  jarCols.forEach((c, k) => {
    const x = -0.7 + (k % 4) * 0.45;
    const z = k < 4 ? -0.15 : 0.2;
    add(new THREE.CylinderGeometry(0.11, 0.11, 0.2, 14), new THREE.MeshPhysicalMaterial({ color: "#f5f5f5", roughness: 0.1, transparent: true, opacity: 0.6 }), x, 2.55, z, 0, paint);
    add(new THREE.CylinderGeometry(0.1, 0.1, 0.13, 14), M(c, { roughness: 0.3 }), x, 2.52, z, 0, paint);
  });
  if (paintT >= 2 || stage >= 1) {
    // easel with a canvas
    const easel = new THREE.Group();
    easel.position.set(0.3, 0, -1.1);
    paint.add(easel);
    for (const s of [-1, 1]) add(box(0.07, 3.6, 0.07), walnut, s * 0.5, 1.8, 0, s * 0.0, easel).rotation.z = s * -0.12;
    add(box(0.07, 3.4, 0.07), walnut, 0, 1.6, -0.45, 0, easel).rotation.x = 0.25;
    add(box(1.4, 1.0, 0.05), M("#ffffff", { map: paintingTex(4), roughness: 0.9 }), 0, 2.6, 0.06, 0, easel);
    add(box(1.4, 0.07, 0.2), walnut, 0, 2.05, 0.08, 0, easel);
  }

  /* -------------------------------------------- right: hair, sink, storage */
  const hairT = up.hair || 0;
  const hair = new THREE.Group();
  hair.position.set(6.5, FLOOR_Y, -2.0);
  hair.rotation.y = -Math.PI / 2.6;
  g.add(hair);
  add(rbox(2.2, 0.12, 1.0, 0.04), stage === 2 ? white : oak, 0, 2.5, 0, 0, hair);
  add(rbox(2.0, 2.4, 0.9, 0.04), stage === 2 ? white : oak, 0, 1.2, 0, 0, hair);
  if (hairT >= 1) {
    // vanity mirror with bulbs
    const mirror = add(new THREE.PlaneGeometry(1.6, 1.8), new THREE.MeshStandardMaterial({ color: "#dfe9f0", metalness: 1, roughness: 0.05 }), 0, 3.7, -0.42, 0, hair);
    disposables.push(mirror.material);
    add(box(1.8, 2.0, 0.06), stage === 2 ? brass : white, 0, 3.7, -0.47, 0, hair);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      add(new THREE.SphereGeometry(0.07, 10, 8), new THREE.MeshStandardMaterial({ color: "#fff8e6", emissive: "#ffe6b0", emissiveIntensity: 1.4 }), Math.cos(a) * 0.9, 3.7 + Math.sin(a) * 1.0, -0.4, 0, hair);
    }
  }
  // mannequin head with a wig
  add(new THREE.CylinderGeometry(0.08, 0.14, 0.4, 12), white, -0.55, 2.76, 0.1, 0, hair);
  add(new THREE.SphereGeometry(0.26, 20, 16), M("#efe2d6"), -0.55, 3.15, 0.1, 0, hair);
  add(new THREE.SphereGeometry(0.29, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.6), M("#c4502d", { roughness: 0.6 }), -0.55, 3.18, 0.07, 0, hair);
  // combs & bottles
  for (let k = 0; k < 3; k++) add(new THREE.CylinderGeometry(0.07, 0.08, 0.3, 12), M(["#f39ac0", "#9fdcc0", "#c3a8e6"][k], { roughness: 0.25 }), 0.2 + k * 0.22, 2.71, 0.15, 0, hair);
  if (hairT >= 2) {
    // salon chair
    const chair = new THREE.Group();
    chair.position.set(0, 0, 1.4);
    hair.add(chair);
    add(new THREE.CylinderGeometry(0.4, 0.5, 0.1, 24), steel, 0, 0.05, 0, 0, chair);
    add(new THREE.CylinderGeometry(0.07, 0.07, 1.0, 12), steel, 0, 0.6, 0, 0, chair);
    add(rbox(1.0, 0.25, 1.0, 0.12), M("#e98aa6", { roughness: 0.5 }), 0, 1.2, 0, 0, chair);
    add(rbox(1.0, 1.1, 0.22, 0.1), M("#e98aa6", { roughness: 0.5 }), 0, 1.8, -0.42, 0, chair);
  }
  // cleaning sink
  const sink = new THREE.Group();
  sink.position.set(7.4, FLOOR_Y, 1.8);
  sink.rotation.y = -Math.PI / 2;
  g.add(sink);
  add(rbox(1.8, 2.4, 1.0, 0.05), stage === 2 ? M("#e8e0f0") : M("#cfe3e0"), 0, 1.2, 0, 0, sink);
  add(rbox(1.9, 0.1, 1.05, 0.03), stage === 2 ? M("#ffffff", { map: marbleTex(), roughness: 0.25 }) : M("#f4f1ec"), 0, 2.45, 0, 0, sink);
  const basin = add(revolve(profile([[0.42, 0.12], [0.4, 0.02], [0.2, -0.22], [0.001, -0.24]], 3), { segs: 32, squash: 0.7, flip: true }), M("#ffffff", { roughness: 0.15 }), -0.2, 2.42, 0.05, 0, sink);
  basin.material.side = THREE.DoubleSide;
  const tap = tube([V3(-0.2, 2.5, -0.38), V3(-0.2, 2.95, -0.38), V3(-0.2, 3.0, -0.2), V3(-0.2, 2.82, -0.05)], 0.035, { radial: 10, tubular: 16 });
  add(tap, steel, 0, 0, 0, 0, sink);
  for (let k = 0; k < 3; k++) add(new THREE.CylinderGeometry(0.08, 0.09, 0.36, 12), M(["#8ec5ec", "#f5dc8c", "#f39ac0"][k], { roughness: 0.2 }), 0.45 + k * 0.17, 2.68, -0.25, 0, sink);
  add(rbox(0.3, 0.12, 0.2, 0.04), M("#f5dc8c", { roughness: 0.9 }), 0.55, 2.56, 0.2, 0, sink);
  // storage cabinet
  const stT = up.storage || 0;
  const cab = new THREE.Group();
  cab.position.set(7.2, FLOOR_Y, -4.3);
  cab.rotation.y = -Math.PI / 4;
  g.add(cab);
  if (stT === 0) {
    for (let k = 0; k < 2; k++) add(rbox(1.0, 0.6, 0.7, 0.04), M(["#f6c6cf", "#cfe3e0"][k]), 0, 0.3 + k * 0.62, 0, 0, cab);
  } else {
    const h = stT === 2 ? 5.0 : 3.4;
    add(rbox(1.8, h, 1.0, 0.04), stT === 2 ? white : oak, 0, h / 2, 0, 0, cab);
    const rows = stT === 2 ? 8 : 5;
    for (let k = 0; k < rows; k++) for (let c = 0; c < 3; c++) {
      add(rbox(0.5, h / rows - 0.1, 0.04, 0.02), M(["#f6c6cf", "#cfe3e0", "#f5dc8c", "#c3a8e6"][(k + c) % 4]), -0.55 + c * 0.55, (k + 0.5) * (h / rows), 0.51, 0, cab);
      add(new THREE.SphereGeometry(0.035, 8, 6), brass, -0.55 + c * 0.55, (k + 0.5) * (h / rows), 0.55, 0, cab);
    }
  }

  /* ------------------------------------------- front: counter, door, waiting */
  const counter = new THREE.Group();
  counter.position.set(0, FLOOR_Y, 6.2);
  g.add(counter);
  const counterTop = stage === 2 ? M("#ffffff", { map: marbleTex(), roughness: 0.2 }) : stage === 1 ? oak : pine;
  add(rbox(5.0, 2.5, 1.1, 0.05), stage === 2 ? M("#7d3f6e", { roughness: 0.6 }) : stage === 1 ? M("#f6c6cf", { roughness: 0.7 }) : pine, 0, 1.25, 0, 0, counter);
  add(rbox(5.3, 0.12, 1.3, 0.04), counterTop, 0, 2.56, 0, 0, counter);
  if (stage >= 1) for (let k = -2; k <= 2; k++) add(box(0.7, 1.6, 0.04), stage === 2 ? brass : white, k * 0.95, 1.2, -0.56, 0, counter);
  // register + bell + order book
  add(rbox(0.8, 0.5, 0.6, 0.06), M("#c97b84", { roughness: 0.4 }), -1.6, 2.87, 0, 0, counter);
  add(rbox(0.7, 0.18, 0.3, 0.04), M("#2c2830"), -1.6, 3.2, -0.12, 0, counter).rotation.x = -0.4;
  const bell = add(new THREE.SphereGeometry(0.16, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), brass, 0.9, 2.62, 0.1, 0, counter);
  void bell;
  add(new THREE.CylinderGeometry(0.2, 0.2, 0.03, 20), walnut, 0.9, 2.63, 0.1, 0, counter);
  add(rbox(0.7, 0.06, 0.5, 0.02), M("#f4ead2"), 1.8, 2.65, 0.05, 0.2, counter);
  // door with a window
  const door = new THREE.Group();
  door.position.set(5.6, FLOOR_Y, ROOM.z1 - 0.06);
  g.add(door);
  add(box(2.2, 4.8, 0.12), stage === 2 ? M("#3a4f86") : M("#9fdcc0"), 0, 2.4, 0, 0, door);
  add(new THREE.PlaneGeometry(1.4, 1.6), new THREE.MeshBasicMaterial({ map: windowViewTex(), toneMapped: false }), 0, 3.4, -0.07, Math.PI, door);
  add(new THREE.SphereGeometry(0.08, 10, 8), brass, -0.8, 2.3, -0.1, 0, door);
  // waiting area
  const waitT = up.waiting || 0;
  const wait = new THREE.Group();
  wait.position.set(-5.5, FLOOR_Y, 6.6);
  g.add(wait);
  if (waitT === 0) {
    add(new THREE.CylinderGeometry(0.45, 0.45, 0.12, 20), oak, 0, 1.4, 0, 0, wait);
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2;
      add(new THREE.CylinderGeometry(0.04, 0.05, 1.4, 8), oak, Math.cos(a) * 0.32, 0.7, Math.sin(a) * 0.32, 0, wait);
    }
  } else {
    const fabric = M(waitT === 2 ? "#c3a8e6" : "#9fdcc0", { map: fabricTex("velvet"), roughness: 0.8 });
    const w = waitT === 2 ? 3.2 : 1.4;
    add(rbox(w, 0.6, 1.2, 0.18), fabric, 0, 0.9, 0, Math.PI, wait);
    add(rbox(w, 1.1, 0.3, 0.14), fabric, 0, 1.6, 0.5, Math.PI, wait);
    for (const s of [-1, 1]) add(rbox(0.3, 0.8, 1.2, 0.12), fabric, s * (w / 2 + 0.05), 1.1, 0, 0, wait);
    for (const [x, z] of [[-w / 2 + 0.1, -0.5], [w / 2 - 0.1, -0.5], [-w / 2 + 0.1, 0.5], [w / 2 - 0.1, 0.5]]) add(new THREE.CylinderGeometry(0.05, 0.04, 0.6, 8), walnut, x, 0.3, z, 0, wait);
    // coffee table + teacup
    add(new THREE.CylinderGeometry(0.6, 0.6, 0.08, 28), stage === 2 ? M("#ffffff", { map: marbleTex() }) : oak, 0, 1.1, -1.4, 0, wait);
    add(new THREE.CylinderGeometry(0.06, 0.08, 1.05, 10), walnut, 0, 0.55, -1.4, 0, wait);
    add(new THREE.CylinderGeometry(0.1, 0.07, 0.12, 14), white, 0.15, 1.2, -1.4, 0, wait);
  }

  /* ------------------------------------------------------------- plants */
  const plantSpots = [[-8.2, -4.4, 1.2], [8.3, 4.6, 1.0]];
  if (decor >= 1) plantSpots.push([-8.2, 7.8, 1.1], [3.0, 7.9, 0.9], [-winW / 2 - 0.5, -4.6, 0.7]);
  if (decor >= 2) plantSpots.push([8.2, -0.6, 1.1], [-3.2, 7.9, 0.9]);
  plantSpots.forEach(([x, z, s], k) => g.add(plant(x, z, s, k, M, decor)));
  // a small plant on the window sill
  g.add(plant(winW / 2 - 0.5, ROOM.z0 + 0.25, 0.35, 9, M, 1, winY - winH / 2 - 0.02));

  // bunting + fairy lights (decor tier 2)
  if (decor >= 2) {
    const cols = ["#f39ac0", "#9fdcc0", "#f5dc8c", "#8ec5ec", "#c3a8e6"];
    for (let k = 0; k < 18; k++) {
      const t = k / 17;
      const x = -8.5 + t * 17;
      const y = CEIL - 0.6 - Math.sin(t * Math.PI) * 0.7;
      const flag = add(new THREE.ConeGeometry(0.22, 0.45, 3), M(cols[k % cols.length], { side: THREE.DoubleSide }), x, y - 0.2, ROOM.z0 + 0.5);
      flag.rotation.set(Math.PI, 0, 0);
      flag.scale.z = 0.1;
    }
    for (let k = 0; k < 26; k++) {
      const t = k / 25;
      add(new THREE.SphereGeometry(0.045, 8, 6), new THREE.MeshStandardMaterial({ color: "#fff3cc", emissive: "#ffd98a", emissiveIntensity: 2 }), -winW / 2 - 0.3 + t * (winW + 0.6), winY + winH / 2 + 0.2 - Math.sin(t * Math.PI * 3) * 0.12, ROOM.z0 + 0.35);
    }
  }

  /* --------------------------------------------------------- light fixtures */
  const fixtures = [];
  const lightT = up.lighting || 0;
  if (stage === 2) {
    // chandelier
    const ch = new THREE.Group();
    ch.position.set(0, CEIL - 1.4, 1.0);
    g.add(ch);
    add(new THREE.CylinderGeometry(0.02, 0.02, 1.2, 6), brass, 0, 0.8, 0, 0, ch);
    add(new THREE.TorusGeometry(0.8, 0.04, 8, 40), brass, 0, 0, 0, 0, ch).rotation.x = Math.PI / 2;
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      add(new THREE.CylinderGeometry(0.04, 0.04, 0.22, 8), white, Math.cos(a) * 0.8, 0.12, Math.sin(a) * 0.8, 0, ch);
      add(new THREE.SphereGeometry(0.07, 10, 8), new THREE.MeshStandardMaterial({ color: "#fff5d6", emissive: "#ffd99a", emissiveIntensity: 2.4 }), Math.cos(a) * 0.8, 0.3, Math.sin(a) * 0.8, 0, ch);
      for (let d = 0; d < 2; d++) add(new THREE.OctahedronGeometry(0.06), new THREE.MeshPhysicalMaterial({ color: "#ffffff", roughness: 0, clearcoat: 1, transparent: true, opacity: 0.7 }), Math.cos(a + 0.2) * 0.75, -0.15 - d * 0.15, Math.sin(a + 0.2) * 0.75, 0, ch);
    }
    fixtures.push(V3(0, CEIL - 1.4, 1.0));
  } else {
    const n = stage === 0 ? 1 : 3;
    for (let k = 0; k < n; k++) {
      const x = n === 1 ? 0 : (k - 1) * 1.8;
      const p = new THREE.Group();
      p.position.set(x, CEIL, 0.1);
      g.add(p);
      add(new THREE.CylinderGeometry(0.012, 0.012, 2.2, 6), M("#2c2830"), 0, -1.1, 0, 0, p);
      const shade = add(revolve(profile([[0.05, 0.5], [0.22, 0.42], [0.55, 0.05], [0.6, 0]], 3), { segs: 32, flip: false }), M(stage === 1 ? "#9fdcc0" : "#f4ead2", { side: THREE.DoubleSide, roughness: 0.5 }), 0, -2.75, 0, 0, p);
      void shade;
      add(new THREE.SphereGeometry(0.12, 12, 10), new THREE.MeshStandardMaterial({ color: "#fff7e0", emissive: "#ffdd99", emissiveIntensity: 2.2 }), 0, -2.65, 0, 0, p);
      fixtures.push(V3(x, CEIL - 2.6, 0.1));
    }
  }
  if (lightT >= 2) {
    // studio softboxes either side of the bench
    for (const s of [-1, 1]) {
      const sb = new THREE.Group();
      sb.position.set(s * 4.6, FLOOR_Y, 0.4);
      sb.lookAt(0, FLOOR_Y, 0);
      g.add(sb);
      add(new THREE.CylinderGeometry(0.03, 0.03, 4.4, 8), M("#2c2830"), 0, 2.2, 0, 0, sb);
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * Math.PI * 2;
        const legM = add(new THREE.CylinderGeometry(0.025, 0.025, 1.1, 6), M("#2c2830"), Math.cos(a) * 0.35, 0.4, Math.sin(a) * 0.35, 0, sb);
        legM.rotation.set(Math.sin(a) * 0.6, 0, -Math.cos(a) * 0.6);
      }
      const box2 = add(rbox(1.0, 1.0, 0.4, 0.05), M("#2c2830"), 0, 4.6, 0.1, 0, sb);
      box2.rotation.x = 0.3;
      const diff = add(new THREE.PlaneGeometry(0.9, 0.9), new THREE.MeshStandardMaterial({ color: "#ffffff", emissive: "#fff3e0", emissiveIntensity: 1.5 }), 0, 4.55, 0.31, 0, sb);
      diff.rotation.x = 0.3;
    }
  }

  g.traverse((o) => {
    if (o.isMesh && quality !== "high") o.castShadow = false;
  });

  return {
    group: g,
    turntable: turn,
    tray,
    fixtures,
    display,
    clockHands: hands,
    windowPos: V3(0, winY, ROOM.z0),
    counterPos: V3(0, FLOOR_Y + 2.6, 6.2),
    dispose() {
      for (const d of display) d.dispose();
      g.traverse((o) => {
        if (o.isMesh) {
          o.geometry.dispose();
          if (o.material && !o.material.map?.userData?.shared) o.material.dispose?.();
        }
      });
      for (const m of disposables) m.dispose();
    },
  };
}

/** A potted plant (leaves fan out on stems). */
function plant(x, z, s, seed, M, decor, y = FLOOR_Y) {
  const grp = new THREE.Group();
  grp.position.set(x, y, z);
  grp.scale.setScalar(s);
  const potC = ["#e9a27a", "#f4ead2", "#9fdcc0", "#c97b84"][seed % 4];
  const pot = new THREE.Mesh(revolve(profile([[0.42, 0], [0.5, 0.7], [0.56, 0.78], [0.55, 0.84]], 2), { segs: 24, capBottom: true }), M(potC, { roughness: 0.6 }));
  pot.castShadow = pot.receiveShadow = true;
  grp.add(pot);
  const soil = new THREE.Mesh(new THREE.CircleGeometry(0.5, 20), M("#5a3f2c"));
  soil.rotation.x = -Math.PI / 2;
  soil.position.y = 0.76;
  grp.add(soil);
  const leafM = M(["#6faa6a", "#5e9a62", "#7fbf78"][seed % 3], { roughness: 0.55, side: THREE.DoubleSide });
  const n = 9 + (seed % 4);
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + seed;
    const h = 0.9 + ((k * 37) % 10) / 10;
    const out = 0.35 + ((k * 13) % 7) / 14;
    const stem = tube([V3(0, 0.76, 0), V3(Math.cos(a) * out * 0.4, 0.76 + h * 0.6, Math.sin(a) * out * 0.4), V3(Math.cos(a) * out, 0.76 + h, Math.sin(a) * out)], (t) => 0.03 * (1 - t * 0.6), { radial: 5, tubular: 8 });
    const sm = new THREE.Mesh(stem, leafM);
    grp.add(sm);
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), leafM);
    leaf.scale.set(1, 0.18, 0.55);
    leaf.position.set(Math.cos(a) * out * 1.15, 0.76 + h + 0.02, Math.sin(a) * out * 1.15);
    leaf.rotation.set(0.3, -a, -0.5);
    leaf.castShadow = true;
    grp.add(leaf);
  }
  if (decor >= 2 && seed % 2 === 0) {
    for (let k = 0; k < 5; k++) {
      const f = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), M(["#f39ac0", "#fff3b0", "#ffffff"][k % 3]));
      const a = k * 1.3;
      f.position.set(Math.cos(a) * 0.4, 1.9 + (k % 2) * 0.2, Math.sin(a) * 0.4);
      grp.add(f);
    }
  }
  return grp;
}
