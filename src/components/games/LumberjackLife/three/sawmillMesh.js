/**
 * Lumberjack Life — the sawmill yard. A visible processing facility, not a
 * sell button: log deck → conveyor → saw housing with a spinning blade →
 * roller output → timber racks, under a shed roof next to the workshop.
 *
 * Moving parts are driven by the engine's mill state every frame: belt
 * texture scroll (beltPhase), roller spin, blade spin-up/down (sawSpin),
 * housing vibration while cutting, sawdust spray, planks on the output belt,
 * and the plank stacks in the racks (one instance per plank in storage).
 *
 * Upgrades are visible: conveyor (powered rollers + motor + paint), saw
 * (bigger blade, more teeth, extra guard), intake (longer deck with extra
 * stakes), storage (more racks). Business growth adds a tool shed, garage,
 * office cabin and flags as the career progresses.
 */
import * as THREE from "three";
import { MILL } from "../data/regions.js";
import { MILL_LAYOUT, storageTotal } from "../engine/mill.js";
import { speciesById } from "../data/species.js";
import { boardsTexture, roofTexture, beltTexture, hazardTexture, signTexture, notesTexture, metalTexture, plankTexture } from "./textures.js";

const std = (color, rough = 0.8, metal = 0, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...extra });

export function buildSawmill(region, world, { shadows = true, upgrades = {}, buildings = {} } = {}) {
  const group = new THREE.Group();
  const baseY = world.terrain.heightAt(MILL.x, MILL.z);
  group.position.set(MILL.x, baseY, MILL.z);
  const disp = [];
  const C = region.mill;
  const mats = {
    wall: std("#ffffff", 0.85, 0, { map: boardsTexture(C.wall, true) }),
    wallH: std("#ffffff", 0.85, 0, { map: boardsTexture(C.wall, false) }),
    trim: std(C.trim, 0.7),
    roof: std("#ffffff", 0.65, 0.2, { map: roofTexture(C.roof), side: THREE.DoubleSide }),
    beam: std("#6b4a2e", 0.85),
    darkWood: std("#4a3322", 0.9),
    steel: std("#7d858c", 0.45, 0.7, { map: metalTexture("#7d858c") }),
    paint: std(upgrades.conveyor >= 2 ? "#2f6db3" : "#d9a12b", 0.55, 0.3),
    hazard: std("#ffffff", 0.6, 0.2, { map: hazardTexture() }),
    rubber: std("#222", 0.9),
    snow: std("#f4f8fb", 0.7),
    glass: std("#9fc4d8", 0.15, 0.3, { transparent: true, opacity: 0.75 }),
    paper: std("#ffffff", 0.9, 0, { map: notesTexture() }),
    concrete: std("#9a958b", 0.95),
    red: std("#a8322a", 0.6),
  };
  const beltTex = beltTexture().clone();
  beltTex.needsUpdate = true;
  beltTex.repeat.set(1, 6);
  const belt = std("#ffffff", 0.8, 0, { map: beltTex });
  disp.push(...Object.values(mats), belt, beltTex);
  const box = (w, h, d, mat, x, y, z, { cast = true, parent = group, rx = 0, ry = 0, rz = 0 } = {}) => {
    const g = new THREE.BoxGeometry(w, h, d);
    disp.push(g);
    const m = new THREE.Mesh(g, mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    m.castShadow = cast && shadows;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  };
  const cyl = (r0, r1, h, mat, x, y, z, { seg = 12, rx = 0, rz = 0, parent = group, cast = true } = {}) => {
    const g = new THREE.CylinderGeometry(r0, r1, h, seg);
    disp.push(g);
    const m = new THREE.Mesh(g, mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, 0, rz);
    m.castShadow = cast && shadows;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  };
  /** gabled roof over [x0,x1]×[z0,z1], ridge along x, eaves at `y` */
  const roof = (x0, x1, z0, z1, y, rise, mat = mats.roof, snow = C.snow) => {
    const w = x1 - x0 + 0.5;
    const half = (z1 - z0) / 2 + 0.35;
    const slope = Math.hypot(half, rise);
    const ang = Math.atan2(rise, half);
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    for (const s of [-1, 1]) {
      box(w, 0.06, slope, mat, cx, y + rise / 2, cz + (s * half) / 2, { rx: s * ang });
      if (snow) box(w * 0.98, 0.07, slope * 0.95, mats.snow, cx, y + rise / 2 + 0.06, cz + (s * half) / 2, { rx: s * ang, cast: false });
    }
    box(w, 0.08, 0.12, mats.trim, cx, y + rise + 0.02, cz, { cast: false });
  };

  /* ---------------- yard ground plate + machine platform */
  box(12.2, 0.12, 2.2, mats.concrete, -0.9, 0.05, -0.1, { cast: false });
  box(11.6, 0.55, 1.3, mats.darkWood, -0.9, 0.3, -0.07);
  for (let x = -6.5; x <= 4.6; x += 1.2) {
    box(0.12, 0.6, 0.12, mats.beam, x, 0.3, 0.62);
    box(0.12, 0.6, 0.12, mats.beam, x, 0.3, -0.74);
  }

  /* ---------------- log deck (inclined rails toward the conveyor) */
  const deck = new THREE.Group();
  group.add(deck);
  const deckLen = 3.9 + (upgrades.intake || 0) * 0.0;
  for (const x of [-6.1, -4.2, -2.3]) {
    const rail = box(0.14, 0.12, deckLen, mats.steel, x, MILL_LAYOUT.deckY - 0.06, 0.6 + deckLen / 2, { parent: deck, rx: -0.03 });
    rail.castShadow = shadows;
    for (const z of [1.0, 2.6, 4.1]) box(0.12, MILL_LAYOUT.deckY, 0.12, mats.beam, x, MILL_LAYOUT.deckY / 2 - 0.03, z, { parent: deck });
  }
  // end stakes; more (and taller) with the intake upgrade
  const stakes = 2 + (upgrades.intake || 0);
  for (let i = 0; i < stakes; i++) {
    const x = -6.3 + (i / Math.max(1, stakes - 1)) * 4.2;
    box(0.1, 0.9 + (upgrades.intake || 0) * 0.35, 0.1, mats.paint, x, 0.75, 4.3, { parent: deck });
  }

  /* ---------------- conveyor (belt + rollers) */
  const beltLen = 5.9;
  const beltMesh = box(beltLen, 0.04, 0.72, belt, -3.65, MILL_LAYOUT.beltY - 0.02, 0, { cast: false });
  beltMesh.material.map.rotation = Math.PI / 2;
  box(beltLen, 0.16, 0.08, mats.paint, -3.65, MILL_LAYOUT.beltY - 0.08, 0.42);
  box(beltLen, 0.16, 0.08, mats.paint, -3.65, MILL_LAYOUT.beltY - 0.08, -0.42);
  const rollers = [];
  for (let x = 1.1; x <= 4.6; x += 0.32) {
    const r = cyl(0.06, 0.06, 0.74, mats.steel, x, MILL_LAYOUT.beltY - 0.04, 0, { rx: Math.PI / 2, seg: 10 });
    rollers.push(r);
  }
  box(3.7, 0.16, 0.08, mats.paint, 2.85, MILL_LAYOUT.beltY - 0.1, 0.42);
  box(3.7, 0.16, 0.08, mats.paint, 2.85, MILL_LAYOUT.beltY - 0.1, -0.42);
  if ((upgrades.conveyor || 0) >= 1) {
    // powered drive: motor box + chain guard
    box(0.5, 0.4, 0.4, mats.steel, -5.8, 0.55, -0.95);
    cyl(0.14, 0.14, 0.45, mats.paint, -5.8, 0.6, -1.2, { rx: Math.PI / 2 });
  }
  if ((upgrades.conveyor || 0) >= 3) box(0.5, 0.4, 0.4, mats.steel, 3.6, 0.55, -0.95);

  /* ---------------- saw housing + blade */
  const housing = new THREE.Group();
  group.add(housing);
  box(1.6, 0.62, 1.7, mats.steel, 0, 0.86, 0, { parent: housing });
  box(1.62, 0.2, 1.72, mats.hazard, 0, 0.62, 0, { parent: housing });
  box(1.2, 0.08, 1.3, mats.paint, 0, 1.2, 0, { parent: housing });
  // motor on the far side
  cyl(0.24, 0.24, 0.6, mats.paint, 0, 0.95, -1.15, { rx: Math.PI / 2, parent: housing });
  cyl(0.1, 0.1, 0.12, mats.steel, 0, 0.95, -1.5, { rx: Math.PI / 2, parent: housing });
  const sawLvl = upgrades.saw || 0;
  const bladeR = 0.5 + sawLvl * 0.06;
  const teeth = 24 + sawLvl * 8;
  const shape = new THREE.Shape();
  for (let i = 0; i <= teeth; i++) {
    const a = (i / teeth) * Math.PI * 2;
    const a2 = ((i + 0.55) / teeth) * Math.PI * 2;
    if (i === 0) shape.moveTo(Math.cos(a) * bladeR, Math.sin(a) * bladeR);
    else shape.lineTo(Math.cos(a) * bladeR, Math.sin(a) * bladeR);
    if (i < teeth) shape.lineTo(Math.cos(a2) * bladeR * 0.93, Math.sin(a2) * bladeR * 0.93);
  }
  const hole = new THREE.Path();
  hole.absarc(0, 0, 0.06, 0, Math.PI * 2, true);
  shape.holes.push(hole);
  const bladeGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.012, bevelEnabled: false, curveSegments: 4 });
  bladeGeo.translate(0, 0, -0.006);
  disp.push(bladeGeo);
  const bladeMat = std(sawLvl >= 2 ? "#d8dde2" : "#b9bec4", 0.25, 0.95, { map: metalTexture("#b9bec4") });
  disp.push(bladeMat);
  const blade = new THREE.Mesh(bladeGeo, bladeMat);
  blade.position.set(0, MILL_LAYOUT.beltY + 0.36, 0);
  blade.castShadow = shadows;
  housing.add(blade);
  // blade guard (half ring over the top)
  const guardG = new THREE.TorusGeometry(bladeR + 0.06, 0.05, 6, 20, Math.PI);
  disp.push(guardG);
  const guard = new THREE.Mesh(guardG, sawLvl >= 1 ? mats.red : mats.paint);
  guard.position.copy(blade.position);
  guard.castShadow = shadows;
  housing.add(guard);
  if (sawLvl >= 3) {
    const g2 = guard.clone();
    g2.scale.setScalar(1.12);
    housing.add(g2);
  }
  // sawdust chute + pile
  box(0.35, 0.35, 0.6, mats.steel, 0.4, 0.6, -1.0, { rz: 0.3 });
  const pileG = new THREE.ConeGeometry(0.9, 0.5, 14);
  disp.push(pileG);
  const pileMat = std("#d9b57e", 1);
  disp.push(pileMat);
  const pile = new THREE.Mesh(pileG, pileMat);
  pile.position.set(0.9, 0.2, -1.7);
  pile.scale.set(1, 1, 0.7);
  pile.receiveShadow = true;
  group.add(pile);

  /* ---------------- shed over the saw */
  for (const [x, z] of MILL_LAYOUT.posts) cyl(0.11, 0.13, 3.1, mats.beam, x, 1.55, z, { seg: 8 });
  box(3.8, 0.16, 0.16, mats.beam, 0, 3.08, 1.9);
  box(3.8, 0.16, 0.16, mats.beam, 0, 3.08, -1.85);
  roof(-2.2, 2.2, -2.4, 2.4, 3.1, 0.9);
  // hanging lamp
  cyl(0.01, 0.01, 0.6, mats.darkWood, 0, 3.4, 0);
  const lampG = new THREE.ConeGeometry(0.22, 0.18, 12, 1, true);
  disp.push(lampG);
  const lamp = new THREE.Mesh(lampG, mats.paint);
  lamp.position.set(0, 3.05, 0);
  group.add(lamp);

  /* ---------------- timber racks (+ more with storage / yard growth) */
  const rackXs = [5.9, 7.4, 8.9];
  const rackCount = 1 + Math.min(2, upgrades.storage || 0);
  for (let i = 0; i < 3; i++) {
    if (i >= rackCount) break;
    const x = rackXs[i];
    for (const z of [-2.1, -0.4, 1.2]) for (const dx of [-0.6, 0.6]) box(0.1, 1.8, 0.1, mats.beam, x + dx, 0.9, z);
    for (const y of [0.12, 1.75]) box(1.32, 0.08, 3.5, mats.beam, x, y, -0.45);
  }
  if (buildings.yard) {
    // extra open-air stacking area on sleepers
    for (let i = 0; i < 4; i++) box(3.6, 0.12, 0.18, mats.darkWood, 7.4, 0.07, 2.2 + i * 0.5, { cast: false });
    for (let i = 0; i < 3; i++) cyl(0.26, 0.26, 3.2, mats.beam, 7.4, 0.4 + (i === 2 ? 0.42 : 0), 2.6 + (i === 2 ? 0.25 : i * 0.5), { rz: Math.PI / 2, seg: 10 });
  }
  const plankMat = std("#ffffff", 0.75, 0, { map: plankTexture(speciesById("birch").wood) });
  disp.push(plankMat);
  const plankGeo = new THREE.BoxGeometry(0.24, 0.045, 1.55);
  disp.push(plankGeo);
  const MAXP = 330;
  const planks = new THREE.InstancedMesh(plankGeo, plankMat, MAXP);
  planks.castShadow = shadows;
  planks.receiveShadow = true;
  planks.count = 0;
  group.add(planks);
  // output-belt bundle (current job)
  const bundle = new THREE.InstancedMesh(plankGeo, plankMat, 8);
  bundle.castShadow = shadows;
  bundle.count = 0;
  group.add(bundle);

  /* ---------------- workshop */
  const ws = new THREE.Group();
  group.add(ws);
  const wx0 = -7.6;
  const wx1 = -0.4;
  const wz0 = -8.0;
  const wz1 = -3.0;
  const wh = 2.7;
  box(wx1 - wx0, wh, 0.12, mats.wall, (wx0 + wx1) / 2, wh / 2, wz1, { parent: ws });
  box(wx1 - wx0, wh, 0.12, mats.wall, (wx0 + wx1) / 2, wh / 2, wz0, { parent: ws });
  box(0.12, wh, wz1 - wz0, mats.wallH, wx0, wh / 2, (wz0 + wz1) / 2, { parent: ws });
  box(0.12, wh, wz1 - wz0, mats.wallH, wx1, wh / 2, (wz0 + wz1) / 2, { parent: ws });
  // gable ends
  for (const x of [wx0, wx1]) {
    const tri = new THREE.Shape();
    tri.moveTo(wz0 - (wz0 + wz1) / 2, 0);
    tri.lineTo(wz1 - (wz0 + wz1) / 2, 0);
    tri.lineTo(0, 1.2);
    tri.closePath();
    const tg = new THREE.ShapeGeometry(tri);
    disp.push(tg);
    const t = new THREE.Mesh(tg, mats.wall);
    t.rotation.y = Math.PI / 2;
    t.position.set(x, wh, (wz0 + wz1) / 2);
    t.material = mats.wall;
    ws.add(t);
    const t2 = t.clone();
    t2.rotation.y = -Math.PI / 2;
    ws.add(t2);
  }
  roof(wx0, wx1, wz0, wz1, wh, 1.2);
  // door, windows, trim
  box(1.1, 2.0, 0.08, mats.darkWood, -3.0, 1.0, wz1 + 0.06, { parent: ws });
  box(0.08, 0.08, 0.06, mats.steel, -2.6, 1.0, wz1 + 0.12, { parent: ws });
  for (const x of [-6.0, -1.4]) {
    box(1.0, 0.8, 0.06, mats.glass, x, 1.55, wz1 + 0.05, { parent: ws, cast: false });
    box(1.15, 0.1, 0.1, mats.trim, x, 1.12, wz1 + 0.08, { parent: ws });
    box(1.15, 0.1, 0.1, mats.trim, x, 1.98, wz1 + 0.08, { parent: ws });
    box(0.06, 0.8, 0.08, mats.trim, x, 1.55, wz1 + 0.08, { parent: ws });
  }
  // sign
  const signMat = std("#ffffff", 0.7, 0, { map: signTexture("SAWMILL", { bg: "#4a3322" }) });
  disp.push(signMat);
  box(2.4, 0.6, 0.08, signMat, -3.0, 2.45, wz1 + 0.12, { parent: ws });
  // chimney
  box(0.45, 1.6, 0.45, mats.concrete, -6.6, 3.3, -6.6, { parent: ws });
  // props: barrels, crates, a chopping block with an axe
  for (const [x, z] of [[-0.1, -2.6], [0.45, -2.75]]) cyl(0.28, 0.28, 0.85, mats.red, x - 7.9, 0.43, z + 0.2, { seg: 14 });
  box(0.7, 0.6, 0.7, mats.beam, -8.2, 0.3, -1.6);
  box(0.6, 0.5, 0.6, mats.beam, -8.15, 0.85, -1.6, { ry: 0.4 });
  cyl(0.35, 0.38, 0.6, mats.beam, 3.6, 0.3, -3.4, { seg: 14 });

  /* ---------------- order board */
  const ob = new THREE.Group();
  ob.position.set(MILL_LAYOUT.board.x, 0, MILL_LAYOUT.board.z);
  group.add(ob);
  cyl(0.08, 0.1, 2.2, mats.beam, -0.6, 1.1, 0, { parent: ob, seg: 8 });
  cyl(0.08, 0.1, 2.2, mats.beam, 0.6, 1.1, 0, { parent: ob, seg: 8 });
  box(1.5, 1.05, 0.07, mats.paper, 0, 1.45, 0.02, { parent: ob, ry: Math.PI });
  box(1.6, 0.1, 0.25, mats.roof, 0, 2.05, 0.0, { parent: ob });
  const obSign = std("#ffffff", 0.7, 0, { map: signTexture("ORDERS", { bg: "#6b3524", w: 256, h: 64, font: "bold 34px Georgia, serif" }) });
  disp.push(obSign);
  box(0.9, 0.24, 0.05, obSign, 0, 2.28, 0.0, { parent: ob, ry: Math.PI });
  ob.rotation.y = Math.PI; // board faces the yard (+Z)
  const boardGlow = new THREE.Mesh(new THREE.RingGeometry(0.75, 0.95, 32), new THREE.MeshBasicMaterial({ color: "#ffd257", transparent: true, opacity: 0.0, depthWrite: false }));
  disp.push(boardGlow.geometry, boardGlow.material);
  boardGlow.rotation.x = -Math.PI / 2;
  boardGlow.position.set(MILL_LAYOUT.board.x, 0.06, MILL_LAYOUT.board.z - 0.1 + 0.9);
  group.add(boardGlow);

  /* ---------------- timber buyer stall */
  const bs = new THREE.Group();
  group.add(bs);
  box(2.9, 0.9, 1.4, mats.beam, 10.9, 0.45, 7.0, { parent: bs });
  for (const [x, z] of [[9.5, 6.3], [12.3, 6.3], [9.5, 7.7], [12.3, 7.7]]) cyl(0.07, 0.07, 2.4, mats.beam, x, 1.2, z, { parent: bs, seg: 8 });
  box(3.3, 0.08, 1.9, std("#2f6d4a", 0.8), 10.9, 2.42, 7.0, { parent: bs, rx: -0.12 });
  const buySign = std("#ffffff", 0.7, 0, { map: signTexture("TIMBER BUYER", { bg: "#2f5d4a" }) });
  disp.push(buySign);
  box(2.4, 0.42, 0.06, buySign, 10.9, 1.75, 6.25, { parent: bs });
  for (let i = 0; i < 6; i++) box(0.24, 0.045, 1.2, plankMat, 10.1 + (i % 3) * 0.28, 0.93 + Math.floor(i / 3) * 0.05, 7.0, { parent: bs });

  /* ---------------- fences + entrance sign */
  for (let i = 0; i < 7; i++) {
    const x = -16 + i * 2.2;
    box(0.1, 0.9, 0.1, mats.beam, x, 0.45, -11.2);
    box(2.2, 0.08, 0.06, mats.beam, x + 1.1, 0.7, -11.2);
    box(2.2, 0.08, 0.06, mats.beam, x + 1.1, 0.35, -11.2);
  }
  const ent = std("#ffffff", 0.7, 0, { map: signTexture(region.name.toUpperCase(), { bg: "#3b5a33", w: 768, h: 128, font: "bold 58px Georgia, serif" }) });
  disp.push(ent);
  const entG = new THREE.Group();
  entG.position.set(6.2, 0, 9.4);
  entG.rotation.y = -0.5;
  group.add(entG);
  cyl(0.09, 0.1, 2.6, mats.beam, -1.3, 1.3, 0, { parent: entG, seg: 8 });
  cyl(0.09, 0.1, 2.6, mats.beam, 1.3, 1.3, 0, { parent: entG, seg: 8 });
  box(2.9, 0.5, 0.07, ent, 0, 2.2, 0.03, { parent: entG });
  box(2.9, 0.5, 0.07, ent, 0, 2.2, -0.03, { parent: entG, ry: Math.PI });

  /* ---------------- business growth */
  if (buildings.toolShed) {
    const g = new THREE.Group();
    g.position.set(-13.5, 0, -5.3);
    group.add(g);
    box(4.2, 2.2, 0.1, mats.wall, 0, 1.1, -1.9, { parent: g });
    box(0.1, 2.2, 3.8, mats.wallH, -2.1, 1.1, 0, { parent: g });
    box(0.1, 2.2, 3.8, mats.wallH, 2.1, 1.1, 0, { parent: g });
    box(4.4, 0.08, 4.2, mats.roof, 0, 2.3, 0.05, { parent: g, rx: 0.12 });
    // tool rack with axes on the back wall
    box(3.2, 0.1, 0.1, mats.darkWood, 0, 1.5, -1.8, { parent: g });
    for (let i = 0; i < 4; i++) {
      box(0.04, 0.75, 0.04, mats.beam, -1.2 + i * 0.8, 1.1, -1.76, { parent: g, rz: 0.15 });
      box(0.2, 0.14, 0.03, mats.steel, -1.15 + i * 0.8, 1.45, -1.74, { parent: g });
    }
    box(1.6, 0.85, 0.7, mats.beam, 0.9, 0.42, -1.3, { parent: g });
  }
  if (buildings.garage) {
    const g = new THREE.Group();
    g.position.set(15, 0, -6.75);
    group.add(g);
    box(7.6, 3.0, 0.12, mats.wall, 0, 1.5, -2.7, { parent: g });
    box(0.12, 3.0, 5.4, mats.wallH, -3.8, 1.5, 0, { parent: g });
    box(0.12, 3.0, 5.4, mats.wallH, 3.8, 1.5, 0, { parent: g });
    roof(-3.8, 3.8, -2.7, 2.7, 3.0, 1.0, mats.roof);
    for (let i = 0; i < 3; i++) cyl(0.3, 0.3, 0.9, mats.red, -3 + i * 0.7, 0.45, -2.2, { parent: g });
  }
  if (buildings.office) {
    const g = new THREE.Group();
    g.position.set(-14, 0, 8.5);
    group.add(g);
    box(5, 2.6, 0.12, mats.wallH, 0, 1.3, -2, { parent: g });
    box(5, 2.6, 0.12, mats.wallH, 0, 1.3, 2, { parent: g });
    box(0.12, 2.6, 4, mats.wallH, -2.5, 1.3, 0, { parent: g });
    box(0.12, 2.6, 4, mats.wallH, 2.5, 1.3, 0, { parent: g });
    roof(-2.5, 2.5, -2, 2, 2.6, 1.1);
    box(1.0, 0.7, 0.06, mats.glass, -1.0, 1.5, 2.05, { parent: g, cast: false });
    box(0.9, 1.9, 0.06, mats.darkWood, 1.0, 0.95, 2.05, { parent: g });
    box(5.4, 0.12, 1.4, mats.beam, 0, 0.12, 2.8, { parent: g });
    const of = std("#ffffff", 0.7, 0, { map: signTexture("OFFICE", { bg: "#4a3322", w: 256, h: 64, font: "bold 34px Georgia, serif" }) });
    disp.push(of);
    box(1.2, 0.3, 0.05, of, 0, 2.35, 2.1, { parent: g });
  }
  const flags = [];
  if (buildings.flags) {
    for (const [x, z, c] of [[-4, 8.5, "#c7362a"], [-2.2, 8.5, "#2f6d4a"], [-0.4, 8.5, "#d9a12b"]]) {
      cyl(0.04, 0.05, 5, mats.steel, x, 2.5, z, { seg: 6 });
      const fg = new THREE.PlaneGeometry(1.2, 0.7, 6, 1);
      fg.translate(0.6, 0, 0);
      disp.push(fg);
      const fm = std(c, 0.8, 0, { side: THREE.DoubleSide });
      disp.push(fm);
      const f = new THREE.Mesh(fg, fm);
      f.position.set(x, 4.55, z);
      group.add(f);
      flags.push(f);
    }
  }

  /* ---------------- per-frame */
  const _o = new THREE.Object3D();
  const _c = new THREE.Color();
  let lastStorage = "";
  const housingBase = housing.position.clone();
  let sprayT = 0;

  function layoutStorage(mill) {
    const key = JSON.stringify(mill.storage);
    if (key === lastStorage) return;
    lastStorage = key;
    let n = 0;
    const kinds = Object.keys(mill.storage).filter((k) => mill.storage[k] > 0);
    let bay = 0;
    for (const k of kinds) {
      const count = mill.storage[k];
      _c.set(speciesById(k).wood.fresh).multiplyScalar(1.0);
      for (let i = 0; i < count && n < MAXP; i++) {
        const per = 6 * 14; // 6 wide × 14 high per bay
        const b = bay + Math.floor(i / per);
        const j = i % per;
        const col = j % 6;
        const row = Math.floor(j / 6);
        const rack = Math.floor(b / 2) % rackCount;
        const half = b % 2;
        _o.position.set(rackXs[rack] - 0.42 + col * 0.0 + (col % 2) * 0.0 + col * 0.165, 0.2 + row * 0.052 + (row % 2) * 0.002, half ? -1.25 : 0.35);
        _o.rotation.set(0, 0, 0);
        _o.scale.set(0.62, 1, 1);
        _o.updateMatrix();
        planks.setMatrixAt(n, _o.matrix);
        planks.setColorAt(n, _c);
        n++;
      }
      bay += Math.max(1, Math.ceil(count / (6 * 14)));
    }
    planks.count = n;
    planks.instanceMatrix.needsUpdate = true;
    if (planks.instanceColor) planks.instanceColor.needsUpdate = true;
  }

  return {
    group,
    baseY,
    update(dt, world, time, fx, ctx) {
      const mill = world.mill;
      beltTex.offset.y = -mill.beltPhase * 0.55;
      for (const r of rollers) r.rotation.y = 0;
      for (let i = 0; i < rollers.length; i++) rollers[i].rotation.set(Math.PI / 2, mill.outPhase * 6, 0);
      blade.rotation.z -= dt * mill.sawSpin * 38;
      const cutting = mill.cur && mill.cur.phase === "cut";
      if (cutting && !ctx.reducedMotion) {
        housing.position.set(housingBase.x + Math.sin(time * 90) * 0.006, housingBase.y + Math.sin(time * 77) * 0.004, housingBase.z);
      } else housing.position.copy(housingBase);
      if (cutting && fx) {
        sprayT -= dt;
        if (sprayT <= 0) {
          sprayT = 0.04;
          const sp = speciesById(mill.cur.species);
          fx.millSpray(MILL.x + 0.3, baseY + MILL_LAYOUT.beltY + 0.2, MILL.z - 0.5, 0.2, -1, sp.wood.fresh);
          if (Math.random() < 0.5) fx.millSpray(MILL.x + 0.5, baseY + MILL_LAYOUT.beltY + 0.4, MILL.z + 0.4, 0.4, 0.6, sp.wood.fresh);
        }
      }
      // output bundle travelling to the racks
      const c = mill.cur;
      if (c && (c.phase === "cut" || c.phase === "out")) {
        const sp = speciesById(c.species);
        _c.set(sp.wood.fresh);
        const k = c.phase === "cut" ? Math.min(1, c.t / c.dur) : 1;
        const travel = c.phase === "out" ? Math.min(1, c.t / c.dur) : 0;
        const n = Math.min(8, c.planks);
        const len = c.len * (c.phase === "cut" ? k : 1);
        for (let i = 0; i < n; i++) {
          const x = 0.85 + len / 2 + travel * (MILL_LAYOUT.outEndX - 0.85 - c.len / 2 + 0.3);
          _o.position.set(x, MILL_LAYOUT.beltY + 0.05 + Math.floor(i / 3) * 0.05, -0.27 + (i % 3) * 0.27);
          _o.rotation.set(0, Math.PI / 2, 0);
          _o.scale.set(1, 1, Math.max(0.02, len / 1.55));
          _o.updateMatrix();
          bundle.setMatrixAt(i, _o.matrix);
          bundle.setColorAt(i, _c);
        }
        bundle.count = n;
        bundle.instanceMatrix.needsUpdate = true;
        if (bundle.instanceColor) bundle.instanceColor.needsUpdate = true;
      } else bundle.count = 0;
      layoutStorage(mill);
      // the order board glows when the order is ready
      boardGlow.material.opacity = world.orderPrompt && world.orderPrompt.ready ? 0.35 + Math.sin(time * 4) * 0.2 : 0;
      for (let i = 0; i < flags.length; i++) {
        const f = flags[i];
        const p = f.geometry.attributes.position;
        for (let v = 0; v < p.count; v++) {
          const x = p.getX(v);
          p.setZ(v, Math.sin(time * 4 + x * 3 + i) * 0.08 * x);
        }
        p.needsUpdate = true;
      }
    },
    /** world pose of a log on the deck / on the line, plus visible length fraction */
    logPose(world, log, out) {
      const mill = world.mill;
      const c = mill.cur;
      if (c && c.logId === log.id) {
        const k = Math.min(1, c.t / c.dur);
        const sm = k * k * (3 - 2 * k);
        let lx = MILL_LAYOUT.deckX;
        let lz = 0;
        let ly = MILL_LAYOUT.beltY + log.r;
        let vis = 1;
        const feedStart = MILL_LAYOUT.deckX;
        const feedEnd = MILL_LAYOUT.feedEndX - log.len / 2;
        if (c.phase === "roll") {
          lz = (MILL_LAYOUT.deckZ0 + 0.0) * (1 - sm);
          ly = MILL_LAYOUT.deckY + log.r + (MILL_LAYOUT.beltY - MILL_LAYOUT.deckY) * sm;
        } else if (c.phase === "feed") {
          lx = feedStart + (feedEnd - feedStart) * sm;
        } else if (c.phase === "cut") {
          // the log disappears into the blade from the front
          vis = Math.max(0.02, 1 - k);
          lx = feedEnd + (log.len * (1 - vis)) / 2 + (log.len * (1 - vis)) / 2;
          lx = MILL_LAYOUT.feedEndX - (log.len * vis) / 2;
        }
        out.x = MILL.x + lx;
        out.y = baseY + ly;
        out.z = MILL.z + lz;
        out.yaw = Math.PI / 2;
        out.pitch = 0;
        out.roll = c.phase === "roll" ? -sm * 2.5 : 0;
        out.vis = vis;
        return out;
      }
      const qi = mill.queue.indexOf(log.id);
      const i = qi < 0 ? 0 : qi;
      const per = MILL_LAYOUT.deckPerRow;
      let row = 0;
      let n = per;
      let idx = i;
      while (idx >= n && n > 1) {
        idx -= n;
        row++;
        n--;
      }
      const width = (per - 1) * MILL_LAYOUT.deckSpacing;
      const lz = MILL_LAYOUT.deckZ0 + idx * MILL_LAYOUT.deckSpacing + row * MILL_LAYOUT.deckSpacing * 0.5 + 0.05;
      out.x = MILL.x + MILL_LAYOUT.deckX;
      out.y = baseY + MILL_LAYOUT.deckY + log.r + row * 0.44 + (lz - MILL_LAYOUT.deckZ0) * 0.03;
      out.z = MILL.z + Math.min(lz, MILL_LAYOUT.deckZ0 + width + 0.2);
      out.yaw = Math.PI / 2;
      out.pitch = 0;
      out.roll = 0;
      out.vis = 1;
      return out;
    },
    dispose() {
      group.removeFromParent();
      disp.forEach((d) => d.dispose());
      planks.dispose();
      bundle.dispose();
    },
  };
}
