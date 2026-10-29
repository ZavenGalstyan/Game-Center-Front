/**
 * Hogwarts — the castle, built from data/layout.js:
 *
 *   walls (merged, world-UV ashlar) with cornices, buttresses, crenellations
 *   gothic windows of leaded glass (lit from within) · gabled slate roofs
 *   towers with conical roofs and gilt finials · the gatehouse arch
 *   courtyard: flagstones, a tiered fountain, cloister arcades, lanterns
 *   Great Hall: house tables set with gold plate, the dais and staff table,
 *     banners, hearths, hundreds of floating candles, an enchanted night-sky
 *     ceiling
 *   Library: towering book-lined shelves, ladders, reading tables, chandeliers
 *   Classrooms: desks, blackboard, Flitwick's book-stack podium, the
 *     duelling strip, Snape's potion cabinet
 *   Hidden complex: dark stone, cobwebs, the chasm, the shaft, the vault
 *
 * Returns { group, update(dt, t, ctx), candles, dispose }.
 */
import * as THREE from "three";
import { LAYOUT, TOWERS, ROOFS, GH_TABLES, SHELVES, DESKS, ARCADE, PITS, HEIGHTS, T as WT } from "../data/layout.js";
import { surface, bookTex, bannerTex, glassTex, glowTex } from "./textures.js";
import { boxGeo, planeGeo, meshOf, instances, archGeo, windowGeo, gableRoof, at, merge } from "./geom.js";

export function buildCastle(scene, quality) {
  const group = new THREE.Group();
  group.name = "castle";
  scene.add(group);
  const mats = [];
  const geos = [];
  const M = (o) => {
    const m = new THREE.MeshStandardMaterial(o);
    mats.push(m);
    return m;
  };
  const S = (k) => surface(k);
  const stone = M({ ...S("castle"), color: "#d8d0c0", roughness: 0.92, metalness: 0 });
  const stoneTrim = M({ ...S("castle"), color: "#bdb4a2", roughness: 0.85 });
  const hiddenStone = M({ ...S("hidden"), color: "#a8a8b0", roughness: 0.95 });
  const slate = M({ ...S("slate"), color: "#a8b4c8", roughness: 0.78, metalness: 0.05, side: THREE.DoubleSide });
  const flag = M({ ...S("flag"), color: "#d0c8b8", roughness: 0.9 });
  const hallFloor = M({ ...S("hallFloor"), color: "#ffffff", roughness: 0.42, metalness: 0.05 });
  const woodFloor = M({ ...S("wood"), color: "#f0d0a8", roughness: 0.6 });
  const wood = M({ ...S("wood"), color: "#a07850", roughness: 0.6 });
  const darkWood = M({ ...S("darkWood"), color: "#ffffff", roughness: 0.7 });
  const plaster = M({ ...S("plaster"), color: "#b8a890", roughness: 0.95, side: THREE.DoubleSide });
  const carpet = M({ ...S("carpet"), color: "#ffffff", roughness: 1 });
  const gold = M({ color: "#d8b25a", roughness: 0.28, metalness: 1 });
  const iron = M({ color: "#2a2a2e", roughness: 0.5, metalness: 0.8 });
  const books = M({ map: bookTex(), roughness: 0.85 });
  const glassWarm = M({ map: glassTex("warm"), emissive: "#ffffff", emissiveMap: glassTex("warm"), emissiveIntensity: 0.9, roughness: 0.3, side: THREE.DoubleSide });
  const glassCold = M({ map: glassTex("cold"), emissive: "#ffffff", emissiveMap: glassTex("cold"), emissiveIntensity: 0.75, roughness: 0.3, side: THREE.DoubleSide });
  const black = M({ color: "#020203", roughness: 1 });
  const add = (m) => m && group.add(m);
  const lights = []; // emissive glow points (candles, lanterns) for the glow sprite pass

  /* ============================================================ walls */
  const wallList = { castle: [], hidden: [] };
  for (const b of LAYOUT.boxes) {
    if (b.kind !== "wall" || b.invisible) continue;
    wallList[b.mat === "hidden" ? "hidden" : "castle"].push(boxGeo(b.x0, b.x1, b.y0, b.y1, b.z0, b.z1, 4));
  }
  add(meshOf(wallList.castle, stone));
  add(meshOf(wallList.hidden, hiddenStone, { cast: false }));

  // cornices + crenellations on exposed wall tops (no roof over them)
  const trimG = [];
  const merlonG = [];
  for (const b of LAYOUT.boxes) {
    if (b.kind !== "wall" || b.invisible || b.lintel || b.mat !== "castle" || b.room || b.fill) continue;
    const alongX = b.x1 - b.x0 > b.z1 - b.z0;
    trimG.push(boxGeo(b.x0 - (alongX ? 0 : 0.25), b.x1 + (alongX ? 0 : 0.25), b.y1 - 0.5, b.y1, b.z0 - (alongX ? 0.25 : 0), b.z1 + (alongX ? 0.25 : 0), 2));
    const L = alongX ? b.x1 - b.x0 : b.z1 - b.z0;
    const n = Math.floor(L / 1.6);
    for (let i = 0; i < n; i++) {
      const c = (alongX ? b.x0 : b.z0) + (i + 0.5) * (L / n);
      if (alongX) merlonG.push(boxGeo(c - 0.42, c + 0.42, b.y1, b.y1 + 1.0, b.z0, b.z1, 2));
      else merlonG.push(boxGeo(b.x0, b.x1, b.y1, b.y1 + 1.0, c - 0.42, c + 0.42, 2));
    }
  }
  add(meshOf(trimG, stoneTrim));
  add(meshOf(merlonG, stone));

  // buttresses + string courses on the courtyard faces and the outer facade
  const butG = [];
  const courseG = [];
  const faceRuns = [
    // [axis, fixed, from, to, side(+1 = face toward +axis), height]
    ["x", -21, -26, 26, 1, HEIGHTS.castle],
    ["x", 21, -26, 26, -1, HEIGHTS.castle],
    ["z", -21, -14, 14, 1, HEIGHTS.greathall],
    ["z", 26, -66, -21, 1, HEIGHTS.castle],
    ["z", 26, 21, 66, 1, HEIGHTS.castle],
    ["z", 21, -21, 21, 1, HEIGHTS.castle],
    ["x", -14, -64, -21, -1, HEIGHTS.greathall],
    ["x", 14, -64, -21, 1, HEIGHTS.greathall],
  ];
  for (const [axis, fixed, a, b, side, h] of faceRuns) {
    const f = fixed + side * (WT / 2);
    for (let v = a + 3; v < b - 2; v += 6.5) {
      if (Math.abs(v) < 5 && (fixed === -21 || fixed === 21) && axis === "x") continue; // courtyard doors
      if (Math.abs(v) < 6 && axis === "z" && (fixed === -21 || fixed === 21)) continue;
      const d = 0.55;
      if (axis === "x") butG.push(boxGeo(Math.min(f, f + side * d), Math.max(f, f + side * d), 0, h * 0.72, v - 0.45, v + 0.45, 2));
      else butG.push(boxGeo(v - 0.45, v + 0.45, 0, h * 0.72, Math.min(f, f + side * d), Math.max(f, f + side * d), 2));
    }
    for (const yy of [0.6, h * 0.42]) {
      if (axis === "x") courseG.push(boxGeo(Math.min(f, f + side * 0.18), Math.max(f, f + side * 0.18), yy, yy + 0.32, a, b, 2));
      else courseG.push(boxGeo(a, b, yy, yy + 0.32, Math.min(f, f + side * 0.18), Math.max(f, f + side * 0.18), 2));
    }
  }
  add(meshOf(butG, stoneTrim));
  add(meshOf(courseG, stoneTrim, { cast: false }));

  /* ============================================================ windows */
  const winWarm = [];
  const winCold = [];
  const frameG = [];
  const addWindow = (x, y, z, ry, w, h, cold = false, both = true) => {
    const spring = h * 0.62;
    const pane = windowGeo(w, h, spring);
    const off = WT / 2 + 0.03;
    for (const s of both ? [1, -1] : [1]) {
      const g = pane.clone();
      if (s < 0) g.rotateY(Math.PI);
      g.rotateY(ry);
      const nx = Math.sin(ry) * off * s;
      const nz = Math.cos(ry) * off * s;
      g.translate(x + nx, y, z + nz);
      (cold && s > 0 ? winCold : winWarm).push(g);
    }
    const fr = archGeo(w, h, spring, 0.22, WT + 0.24);
    fr.rotateY(ry);
    fr.translate(x, y, z);
    frameG.push(fr);
    pane.dispose();
  };
  // Great Hall: tall lancets down both long sides + a great window behind the dais
  for (let z = -58; z <= -27; z += 6.2) {
    addWindow(-14, 4.5, z, Math.PI / 2, 2.2, 8.5, false);
    addWindow(14, 4.5, z, -Math.PI / 2, 2.2, 8.5, false);
  }
  addWindow(0, 6, -64, 0, 6, 9.5, false);
  // wings: courtyard faces and the outer facades
  for (const z of [-20, -13, 13, 20]) {
    addWindow(-21, 4, z, -Math.PI / 2, 1.5, 4.2);
    addWindow(21, 4, z, Math.PI / 2, 1.5, 4.2);
  }
  for (const x of [-60, -50, -40, -30, 30, 40, 50, 60]) {
    addWindow(x, 4, 26, 0, 1.6, 4.6);
    addWindow(x, 4, -26, Math.PI, 1.6, 4.6);
  }
  for (const z of [-20, -10, 10, 20]) addWindow(66, 4, z, Math.PI / 2, 1.6, 4.6);
  // gatehouse face
  for (const x of [-14, -9, 9, 14]) addWindow(x, 5.5, 21, 0, 1.2, 3.4);
  add(meshOf(winWarm, glassWarm, { cast: false, receive: false }));
  add(meshOf(winCold, glassCold, { cast: false, receive: false }));
  add(meshOf(frameG, stoneTrim, { cast: false }));

  // doorways: arches over the openings, wooden doors swung open
  const archG = [];
  const doors = [
    [0, -21, 0, 6, 6.6],
    [-21, 0, Math.PI / 2, 6, 5.4],
    [21, 0, Math.PI / 2, 6, 5.4],
    [0, 21, 0, 8, 6.6],
  ];
  for (const [x, z, ry, w, h] of doors) {
    const g = archGeo(w, h, h * 0.6, 0.55, WT + 0.6);
    g.rotateY(ry);
    g.translate(x, 0, z);
    archG.push(g);
  }
  add(meshOf(archG, stoneTrim));

  // portcullis raised in the gatehouse
  {
    const bars = [];
    for (let x = -3.6; x <= 3.6; x += 0.6) bars.push(boxGeo(x - 0.05, x + 0.05, 4.4, 6.4, 20.9, 21.05, 1));
    for (let y = 4.6; y <= 6.3; y += 0.5) bars.push(boxGeo(-3.8, 3.8, y - 0.04, y + 0.04, 20.88, 21.08, 1));
    add(meshOf(bars, iron, { cast: false }));
  }

  /* ============================================================ roofs + ceilings */
  const slopeG = [];
  const gableG = [];
  const ridgeDeco = [];
  const roofDef = [
    [ROOFS.gh, 9, "z"],
    [ROOFS.west, 9.5, "x"],
    [ROOFS.east, 9.5, "x"],
  ];
  for (const [R, rise, axis] of roofDef) {
    const r = gableRoof(R.x0 - WT / 2, R.x1 + WT / 2, R.z0 - WT / 2, R.z1 + WT / 2, R.y, rise, 0.9, axis);
    slopeG.push(...r.slopes);
    gableG.push(...r.gables);
    // ridge cap + little spires
    if (axis === "z") {
      ridgeDeco.push(boxGeo((R.x0 + R.x1) / 2 - 0.25, (R.x0 + R.x1) / 2 + 0.25, R.y + rise - 0.1, R.y + rise + 0.3, R.z0 - 1, R.z1 + 1, 2));
    } else ridgeDeco.push(boxGeo(R.x0 - 1, R.x1 + 1, R.y + rise - 0.1, R.y + rise + 0.3, (R.z0 + R.z1) / 2 - 0.25, (R.z0 + R.z1) / 2 + 0.25, 2));
  }
  add(meshOf(slopeG, slate));
  add(meshOf(gableG, stone));
  add(meshOf(ridgeDeco, iron, { cast: false }));
  // chimneys
  const chim = [];
  for (const [x, z, y] of [[-40, 14, 17], [-30, -18, 17], [46, 16, 17], [56, -14, 17]]) chim.push(boxGeo(x - 0.7, x + 0.7, y - 6, y + 2.2, z - 0.7, z + 0.7, 2));
  add(meshOf(chim, stone));

  // interior ceilings: timber in the wings, low stone in the hidden rooms
  const ceilW = [];
  for (const R of [ROOFS.west, ROOFS.east]) ceilW.push(planeGeo(R.x0, R.x1, R.z0, R.z1, R.y - 0.15, 3, true));
  add(meshOf(ceilW, darkWood, { cast: false }));
  const beams = [];
  for (const R of [ROOFS.west, ROOFS.east]) for (let x = R.x0 + 3; x < R.x1; x += 4.5) beams.push(boxGeo(x - 0.22, x + 0.22, R.y - 0.75, R.y - 0.15, R.z0, R.z1, 2));
  add(meshOf(beams, darkWood, { cast: false }));
  const hiddenRooms = [
    [-78, -66, -3, 3],
    [-96, -78, -10, 10],
    [-91, -83, -40, -10],
    [-100, -74, -62, -40],
    [-132, -100, -56, -46],
    [-156, -132, -64, -38],
    [-160, -128, -96, -64],
  ];
  add(meshOf(hiddenRooms.map(([a, b, c, d]) => planeGeo(a, b, c, d, HEIGHTS.hidden - 0.05, 4, true)), hiddenStone, { cast: false }));
  // hidden floors (pits cut out)
  const hfl = [];
  for (const [a, b, c, d] of hiddenRooms) {
    const pit = PITS.find((p) => p.x0 >= a - 0.1 && p.x1 <= b + 0.1 && p.z0 >= c - 0.1 && p.z1 <= d + 0.1);
    if (!pit) hfl.push(planeGeo(a, b, c, d, 0.005, 3));
    else {
      if (pit.z0 > c) hfl.push(planeGeo(a, b, c, pit.z0, 0.005, 3));
      if (pit.z1 < d) hfl.push(planeGeo(a, b, pit.z1, d, 0.005, 3));
      if (pit.x0 > a) hfl.push(planeGeo(a, pit.x0, pit.z0, pit.z1, 0.005, 3));
      if (pit.x1 < b) hfl.push(planeGeo(pit.x1, b, pit.z0, pit.z1, 0.005, 3));
    }
  }
  const hiddenFloor = M({ ...S("flag"), color: "#6a6a72", roughness: 0.95 });
  add(meshOf(hfl, hiddenFloor, { cast: false }));
  // pits: sheer walls into blackness
  const pitG = [];
  for (const p of PITS) {
    pitG.push(boxGeo(p.x0, p.x1, -24, 0, p.z0, p.z0 + 0.01, 3, { pz: true, nz: false, px: false, nx: false, top: false, bottom: false }));
    pitG.push(boxGeo(p.x0, p.x1, -24, 0, p.z1 - 0.01, p.z1, 3, { pz: false, nz: true, px: false, nx: false, top: false, bottom: false }));
    pitG.push(boxGeo(p.x0, p.x0 + 0.01, -24, 0, p.z0, p.z1, 3, { px: true, nx: false, pz: false, nz: false, top: false, bottom: false }));
    pitG.push(boxGeo(p.x1 - 0.01, p.x1, -24, 0, p.z0, p.z1, 3, { nx: true, px: false, pz: false, nz: false, top: false, bottom: false }));
    pitG.push(planeGeo(p.x0, p.x1, p.z0, p.z1, -24, 4));
  }
  const pitMat = M({ ...S("hidden"), color: "#3a3a42", roughness: 1, side: THREE.DoubleSide });
  add(meshOf(pitG, pitMat, { cast: false }));
  void black;

  /* ============================================================ towers */
  const towerBody = [];
  const towerRoof = [];
  const towerCren = [];
  const finials = [];
  const slits = [];
  for (const t of TOWERS) {
    const body = new THREE.CylinderGeometry(t.r, t.r * 1.06, t.h, 24, 1, true);
    // world-ish UVs around the drum
    const uv = body.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * ((t.r * Math.PI * 2) / 4), (uv.getY(i) * t.h) / 4);
    body.translate(t.x, t.h / 2, t.z);
    towerBody.push(body);
    // corbelled parapet
    const ring = new THREE.CylinderGeometry(t.r + 0.45, t.r + 0.2, 0.8, 24, 1, true);
    ring.translate(t.x, t.h - 0.4, t.z);
    towerBody.push(ring);
    const n = Math.max(8, Math.round(t.r * 4));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const m = new THREE.BoxGeometry(0.7, 0.8, 0.5);
      m.rotateY(-a);
      m.translate(t.x + Math.cos(a) * (t.r + 0.2), t.h + 0.4, t.z + Math.sin(a) * (t.r + 0.2));
      towerCren.push(m);
    }
    const cone = new THREE.ConeGeometry(t.r + 0.6, t.roof, 24, 1, true);
    const cu = cone.attributes.uv;
    for (let i = 0; i < cu.count; i++) cu.setXY(i, cu.getX(i) * 6, cu.getY(i) * 4);
    cone.translate(t.x, t.h + 0.3 + t.roof / 2, t.z);
    towerRoof.push(cone);
    const fin = new THREE.ConeGeometry(0.12, 1.6, 6);
    fin.translate(t.x, t.h + 0.3 + t.roof + 0.7, t.z);
    finials.push(fin);
    const ball = new THREE.SphereGeometry(0.2, 8, 6);
    ball.translate(t.x, t.h + 0.3 + t.roof + 0.05, t.z);
    finials.push(ball);
    // arrow-slit windows glowing
    for (let k = 0; k < 3; k++)
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + k * 0.6 + 0.4;
        const w = windowGeo(0.5, 1.4, 0.9);
        w.rotateY(Math.PI / 2 - a);
        w.translate(t.x + Math.cos(a) * (t.r + 0.03), t.h * (0.35 + k * 0.2), t.z + Math.sin(a) * (t.r + 0.03));
        slits.push(w);
      }
  }
  add(meshOf(towerBody, stone));
  add(meshOf(towerCren, stone));
  add(meshOf(towerRoof, slate));
  add(meshOf(finials, gold, { cast: false }));
  add(meshOf(slits, glassWarm, { cast: false, receive: false }));

  /* ============================================================ courtyard */
  add(meshOf([planeGeo(-21, 21, -21, 21, 0.004, 3)], flag, { cast: false }));
  // grass beds under the trees
  const bed = M({ ...S("grass"), color: "#d8e8c8", roughness: 1 });
  const beds = [];
  for (const [x, z] of [[-14, -14], [14, -14], [-14, 14], [14, 14]]) {
    const g = new THREE.CircleGeometry(2.6, 24);
    g.rotateX(-Math.PI / 2);
    g.translate(x, 0.02, z);
    beds.push(g);
    const rim = new THREE.TorusGeometry(2.6, 0.14, 6, 28);
    rim.rotateX(Math.PI / 2);
    rim.translate(x, 0.1, z);
    beds.push(rim);
  }
  add(meshOf(beds.filter((g, i) => i % 2 === 0), bed, { cast: false }));
  add(meshOf(beds.filter((g, i) => i % 2 === 1), stoneTrim, { cast: false }));
  // fountain: tiered basins on a column
  const fountain = new THREE.Group();
  {
    const prof = (pts) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), 36);
    const basin = prof([[0, 0.05], [3.0, 0.05], [3.3, 0.15], [3.3, 0.95], [3.05, 1.0], [2.9, 0.4], [0, 0.4]]);
    const column = prof([[0, 0], [0.55, 0], [0.45, 0.5], [0.35, 2.3], [0.5, 2.4], [0, 2.4]]);
    const mid = prof([[0, 2.2], [1.4, 2.25], [1.55, 2.55], [1.4, 2.6], [1.25, 2.4], [0, 2.4]]);
    const top = prof([[0, 3.2], [0.7, 3.25], [0.8, 3.45], [0.7, 3.5], [0.6, 3.35], [0, 3.35]]);
    const stem = prof([[0, 2.4], [0.2, 2.4], [0.16, 3.25], [0, 3.25]]);
    fountain.add(meshOf([basin, column, mid, top, stem], stoneTrim));
    const waterMat = M({ color: "#4a7a96", roughness: 0.08, metalness: 0.2, transparent: true, opacity: 0.85 });
    const w1 = new THREE.CircleGeometry(2.95, 36);
    w1.rotateX(-Math.PI / 2);
    w1.translate(0, 0.82, 0);
    const w2 = new THREE.CircleGeometry(1.35, 24);
    w2.rotateX(-Math.PI / 2);
    w2.translate(0, 2.5, 0);
    const water = meshOf([w1, w2], waterMat, { cast: false });
    fountain.add(water);
    fountain.userData.water = waterMat;
  }
  group.add(fountain);
  // cloister arcades: columns, arches and a lean-to roof against the walls
  const colGeo = new THREE.CylinderGeometry(0.32, 0.36, 4.4, 12);
  colGeo.translate(0, 2.4, 0);
  const capGeo = new THREE.BoxGeometry(0.95, 0.4, 0.95);
  capGeo.translate(0, 4.8, 0);
  const baseGeo = new THREE.BoxGeometry(0.9, 0.3, 0.9);
  baseGeo.translate(0, 0.15, 0);
  const arcCols = [];
  for (const [x, z] of ARCADE) arcCols.push(at(colGeo, x, 0, z), at(capGeo, x, 0, z), at(baseGeo, x, 0, z));
  add(meshOf(arcCols, stoneTrim));
  const arcG = [];
  const arcRoof = [];
  const sides = [
    ["z", -18, -1],
    ["z", 18, 1],
    ["x", -18, -1],
    ["x", 18, 1],
  ];
  for (const [axis, fixed, out] of sides) {
    const pts = [-16, -11, -6, 6, 11, 16];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      if (b - a > 6) continue;
      const w = b - a - 0.8;
      const g = archGeo(w, 4.75, 3.4, 0.25, 0.6);
      const c = (a + b) / 2;
      if (axis === "z") g.translate(c, 0, fixed);
      else {
        g.rotateY(Math.PI / 2);
        g.translate(fixed, 0, c);
      }
      arcG.push(g);
    }
    // frieze over the arcade
    if (axis === "z") arcG.push(boxGeo(-16.5, 16.5, 5.0, 5.6, fixed - 0.4, fixed + 0.4, 2));
    else arcG.push(boxGeo(fixed - 0.4, fixed + 0.4, 5.0, 5.6, -16.5, 16.5, 2));
    // lean-to roof from the wall down to the frieze
    const wallF = fixed + out * 2.4;
    const yW = 7.4;
    const yC = 5.6;
    const L = -17;
    const R = 17;
    const g = new THREE.BufferGeometry();
    let P;
    if (axis === "z") P = [L, yC, fixed - out * 0.6, R, yC, fixed - out * 0.6, R, yW, wallF, L, yC, fixed - out * 0.6, R, yW, wallF, L, yW, wallF];
    else P = [fixed - out * 0.6, yC, L, fixed - out * 0.6, yC, R, wallF, yW, R, fixed - out * 0.6, yC, L, wallF, yW, R, wallF, yW, L];
    g.setAttribute("position", new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, 11, 0, 11, 1.2, 0, 0, 11, 1.2, 0, 1.2], 2));
    g.computeVertexNormals();
    arcRoof.push(g);
  }
  add(meshOf(arcG, stoneTrim));
  add(meshOf(arcRoof, slate));
  // benches
  const benchG = [];
  for (const [x, z, ry] of [[-9, -15.5, 0], [9, -15.5, 0], [-9, 15.5, 0], [9, 15.5, 0]]) {
    const b = boxGeo(-1.3, 1.3, 0.42, 0.52, -0.3, 0.3, 1);
    const l1 = boxGeo(-1.15, -0.95, 0, 0.42, -0.25, 0.25, 1);
    const l2 = boxGeo(0.95, 1.15, 0, 0.42, -0.25, 0.25, 1);
    for (const p of [b, l1, l2]) {
      p.rotateY(ry);
      p.translate(x, 0, z);
      benchG.push(p);
    }
  }
  add(meshOf(benchG, darkWood));

  /* ============================================================ Great Hall */
  add(meshOf([planeGeo(-14, 14, -64, -21, 0.006, 3)], hallFloor, { cast: false }));
  // red runner down the central aisle
  add(meshOf([planeGeo(-1.4, 1.4, -56, -21.5, 0.02, 2.8)], carpet, { cast: false }));
  const tableG = [];
  const benchesG = [];
  const plates = [];
  const goblets = [];
  for (const x of GH_TABLES) {
    tableG.push(boxGeo(x - 0.6, x + 0.6, 0.72, 0.8, -51.5, -27.5, 2));
    for (const z of [-51, -45, -39, -33, -28]) tableG.push(boxGeo(x - 0.45, x + 0.45, 0, 0.72, z - 0.12, z + 0.12, 1));
    for (const s of [-1, 1]) {
      benchesG.push(boxGeo(x + s * 1.0 - 0.22, x + s * 1.0 + 0.22, 0.42, 0.5, -51.5, -27.5, 2));
      for (const z of [-51, -39, -28]) benchesG.push(boxGeo(x + s * 1.0 - 0.15, x + s * 1.0 + 0.15, 0, 0.42, z - 0.1, z + 0.1, 1));
    }
    for (let z = -50.5; z <= -28.5; z += 1.1)
      for (const s of [-1, 1]) {
        plates.push({ x: x + s * 0.38, y: 0.81, z });
        if ((z * 10) % 3 < 1.5) goblets.push({ x: x + s * 0.18, y: 0.8, z: z + 0.3 });
      }
  }
  add(meshOf(tableG, wood));
  add(meshOf(benchesG, darkWood));
  const plateGeo = new THREE.CylinderGeometry(0.15, 0.12, 0.02, 14);
  const gobGeo = new THREE.LatheGeometry([[0, 0], [0.05, 0], [0.012, 0.02], [0.012, 0.1], [0.05, 0.14], [0.055, 0.22], [0, 0.18]].map(([r, y]) => new THREE.Vector2(r, y)), 10);
  geos.push(plateGeo, gobGeo);
  group.add(instances(plateGeo, gold, plates, { cast: false }));
  group.add(instances(gobGeo, gold, goblets, { cast: false }));
  // dais, staff table, chairs, the headmaster's chair and the owl lectern
  add(meshOf([boxGeo(-13.4, 13.4, 0, 0.3, -57, -56, 2), boxGeo(-13.4, 13.4, 0, 0.6, -63.4, -57, 2)], stoneTrim));
  add(meshOf([boxGeo(-9, 9, 1.32, 1.4, -60.6, -59.4, 2), boxGeo(-9, 9, 0.6, 1.32, -60.5, -60.3, 2)], wood));
  const chairs = [];
  for (let x = -8; x <= 8; x += 1.6) {
    if (Math.abs(x) < 0.5) continue;
    chairs.push(boxGeo(x - 0.3, x + 0.3, 1.05, 1.12, -61.4, -60.8, 1), boxGeo(x - 0.3, x + 0.3, 1.05, 2.3, -61.5, -61.4, 1));
  }
  chairs.push(boxGeo(-0.55, 0.55, 1.1, 1.2, -61.6, -60.8, 1), boxGeo(-0.6, 0.6, 1.1, 3.4, -61.8, -61.6, 1));
  add(meshOf(chairs, darkWood));
  add(meshOf([boxGeo(-0.65, 0.65, 3.3, 3.6, -61.85, -61.55, 1)], gold, { cast: false }));
  // banners: four houses along the sides, the school banner behind the dais
  const bannerG = new THREE.PlaneGeometry(2.4, 6);
  geos.push(bannerG);
  const bannerSpots = [
    ["gryffindor", -13.3, -30, Math.PI / 2],
    ["hufflepuff", -13.3, -46, Math.PI / 2],
    ["ravenclaw", 13.3, -30, -Math.PI / 2],
    ["slytherin", 13.3, -46, -Math.PI / 2],
    ["gryffindor", -13.3, -38, Math.PI / 2],
    ["slytherin", 13.3, -38, -Math.PI / 2],
  ];
  for (const [h, x, z, ry] of bannerSpots) {
    const m = new THREE.Mesh(bannerG, M({ map: bannerTex(h), roughness: 0.9, side: THREE.DoubleSide }));
    m.position.set(x, 10.5, z);
    m.rotation.y = ry;
    group.add(m);
  }
  {
    const big = new THREE.Mesh(new THREE.PlaneGeometry(4, 9), M({ map: bannerTex("hogwarts"), roughness: 0.9, side: THREE.DoubleSide }));
    big.position.set(-8.5, 9, -63.3);
    group.add(big);
    const big2 = big.clone();
    big2.position.x = 8.5;
    group.add(big2);
  }
  // hearths
  const hearth = [];
  for (const s of [-1, 1]) {
    const x = s * 13.4;
    hearth.push(boxGeo(x - s * 1.2 - 0.6, x - s * 1.2 + 0.6, 0, 3.4, -42.2, -41.6, 2), boxGeo(x - s * 1.2 - 0.6, x - s * 1.2 + 0.6, 0, 3.4, -38.4, -37.8, 2));
    hearth.push(boxGeo(Math.min(x, x - s * 1.8), Math.max(x, x - s * 1.8), 3.0, 3.6, -42.4, -37.6, 2));
  }
  add(meshOf(hearth, stoneTrim));
  // enchanted ceiling (a night sky that drifts)
  const skyU = { uTime: { value: 0 } };
  const ceilMat = new THREE.ShaderMaterial({
    uniforms: skyU,
    side: THREE.DoubleSide,
    vertexShader: `varying vec2 vP; void main(){ vP = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform float uTime; varying vec2 vP;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
      float n(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
      void main(){
        vec2 p = vP * 0.08;
        vec3 col = mix(vec3(0.02,0.03,0.09), vec3(0.06,0.08,0.2), smoothstep(-1.0, 1.0, sin(vP.y*0.05)));
        float c = n(p * 1.3 + vec2(uTime*0.02, 0.0)) * 0.6 + n(p*3.1 - vec2(uTime*0.03, uTime*0.01)) * 0.4;
        col = mix(col, vec3(0.25,0.28,0.4), smoothstep(0.55, 0.85, c) * 0.55);
        vec2 sp = vP * 1.4; vec2 cell = floor(sp); vec2 fr = fract(sp) - 0.5;
        float s = h(cell);
        float star = smoothstep(0.08, 0.0, length(fr - (vec2(h(cell+1.3), h(cell+2.7)) - 0.5) * 0.7)) * step(0.93, s);
        star *= 0.6 + 0.4 * sin(uTime * (1.0 + s * 3.0) + s * 40.0);
        col += vec3(1.0,0.95,0.85) * star * (1.0 - smoothstep(0.5, 0.85, c));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  mats.push(ceilMat);
  const ceil = new THREE.Mesh(planeGeo(-14, 14, -64, -21, HEIGHTS.greathall - 0.3, 4, true), ceilMat);
  group.add(ceil);
  // floating candles
  const candleGeo = new THREE.CylinderGeometry(0.035, 0.04, 0.32, 8);
  geos.push(candleGeo);
  const candleMat = M({ color: "#f4ead2", roughness: 0.6, emissive: "#3a2a10", emissiveIntensity: 0.4 });
  const nC = quality === "low" ? 120 : 240;
  const candles = [];
  let seed = 9;
  const rr = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < nC; i++) candles.push({ x: -12.5 + rr() * 25, y: 6.5 + rr() * 6, z: -62 + rr() * 39, ph: rr() * 6.28 });
  const candleIM = new THREE.InstancedMesh(candleGeo, candleMat, nC);
  candleIM.castShadow = false;
  group.add(candleIM);
  for (const c of candles) lights.push({ x: c.x, y: c.y + 0.22, z: c.z, s: 0.55, c: [1, 0.78, 0.4], bob: c });

  /* ============================================================ Library */
  add(meshOf([planeGeo(-66, -21, -26, 26, 0.006, 2.5)], woodFloor, { cast: false }));
  add(meshOf([planeGeo(-56, -22, -1.6, 1.6, 0.02, 3.2)], carpet, { cast: false }));
  const shelfWood = [];
  const shelfBooks = [];
  for (const s of SHELVES) {
    shelfWood.push(boxGeo(s.x0, s.x1, s.h - 0.15, s.h, s.z0, s.z1, 2), boxGeo(s.x0, s.x0 + 0.12, 0, s.h, s.z0, s.z1, 2), boxGeo(s.x1 - 0.12, s.x1, 0, s.h, s.z0, s.z1, 2));
    // book faces on both long sides (UV: 4 shelves of the texture per face height)
    const L = s.x1 - s.x0 - 0.24;
    for (const side of [0, 1]) {
      const g = new THREE.PlaneGeometry(L, s.h - 0.2);
      const uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (L / 2.2), uv.getY(i));
      if (side) g.rotateY(Math.PI);
      g.translate((s.x0 + s.x1) / 2, (s.h - 0.2) / 2 + 0.05, side ? s.z0 - 0.005 : s.z1 + 0.005);
      shelfBooks.push(g);
    }
    shelfWood.push(boxGeo(s.x0 + 0.1, s.x1 - 0.1, 0.05, s.h - 0.1, s.z0 + 0.1, s.z1 - 0.1, 2, { top: false, bottom: false }));
  }
  add(meshOf(shelfWood, darkWood));
  add(meshOf(shelfBooks, books, { cast: false }));
  // ladders
  const lad = [];
  for (const [x, z] of [[-48, -13.1], [-36, 8.9], [-50, 20.9], [-62, 8.2]]) {
    for (const s of [-0.28, 0.28]) {
      const r = boxGeo(x + s - 0.04, x + s + 0.04, 0, 4.3, z - 0.04, z + 0.04, 1);
      lad.push(r);
    }
    for (let y = 0.35; y < 4.2; y += 0.4) lad.push(boxGeo(x - 0.28, x + 0.28, y - 0.025, y + 0.025, z - 0.03, z + 0.03, 1));
  }
  add(meshOf(lad, wood, { cast: false }));
  // reading tables, Pince's desk, stacks of books
  const libT = [];
  for (const z of [10, 16]) libT.push(boxGeo(-29, -25, 0.78, 0.86, z - 1, z + 1, 2), boxGeo(-28.8, -28.6, 0, 0.78, z - 0.8, z - 0.6, 1), boxGeo(-25.4, -25.2, 0, 0.78, z + 0.6, z + 0.8, 1), boxGeo(-28.8, -28.6, 0, 0.78, z + 0.6, z + 0.8, 1), boxGeo(-25.4, -25.2, 0, 0.78, z - 0.8, z - 0.6, 1));
  libT.push(boxGeo(-30, -28, 0, 1.05, -9.6, -6.4, 2));
  add(meshOf(libT, wood));
  const stackG = new THREE.BoxGeometry(0.32, 0.07, 0.24);
  geos.push(stackG);
  const stacks = [];
  for (let i = 0; i < 26; i++) {
    const bx = [-29.5, -26, -27, -28.4, -25.6][i % 5];
    const bz = [-8.8, 9.5, 15.6, -7.2, 16.4][i % 5];
    stacks.push({ x: bx + (i % 3) * 0.02, y: (bx === -29.5 || bx === -28.4 ? 1.09 : 0.9) + Math.floor(i / 5) * 0.07, z: bz, ry: i * 0.6, c: ["#6a1a18", "#1d3a5e", "#2c4a24", "#5a3a1a", "#3a2050"][i % 5] });
  }
  group.add(instances(stackG, M({ color: "#ffffff", roughness: 0.8 }), stacks, { cast: false, color: true }));
  for (const [x, z] of [[-27, 10], [-27, 16], [-29, -8]]) lights.push({ x, y: 1.15, z, s: 0.6, c: [1, 0.8, 0.45] });
  // chandeliers
  const chand = [];
  for (const [x, z] of [[-30, 0], [-45, 0], [-38, -16], [-38, 16], [-61, 0]]) {
    const ring = new THREE.TorusGeometry(1.1, 0.05, 6, 24);
    ring.rotateX(Math.PI / 2);
    ring.translate(x, 8, z);
    chand.push(ring, boxGeo(x - 0.02, x + 0.02, 8, 11.8, z - 0.02, z + 0.02, 1));
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      lights.push({ x: x + Math.cos(a) * 1.1, y: 8.25, z: z + Math.sin(a) * 1.1, s: 0.5, c: [1, 0.78, 0.4] });
    }
  }
  add(meshOf(chand, iron, { cast: false }));

  /* ============================================================ Classrooms */
  add(meshOf([planeGeo(21, 66, -26, 26, 0.006, 2.5)], woodFloor, { cast: false }));
  add(meshOf([planeGeo(21.5, 65.5, -1.6, 1.6, 0.02, 3.2)], carpet, { cast: false }));
  const deskG = [];
  for (const [x, z] of DESKS) {
    deskG.push(boxGeo(x - 1.6, x + 1.6, 0.78, 0.86, z - 0.6, z + 0.6, 2));
    for (const sx of [-1.4, 1.4]) deskG.push(boxGeo(x + sx - 0.06, x + sx + 0.06, 0, 0.78, z - 0.5, z + 0.5, 1));
    deskG.push(boxGeo(x - 1.5, x + 1.5, 0.42, 0.48, z + 0.85, z + 1.25, 1));
  }
  add(meshOf(deskG, wood));
  // blackboard + Flitwick's podium of books
  add(meshOf([boxGeo(36, 52, 1.4, 4.4, -25.38, -25.3, 2)], M({ color: "#1e2a24", roughness: 0.95 }), { cast: false }));
  add(meshOf([boxGeo(35.8, 52.2, 1.3, 1.42, -25.4, -25.1, 2), boxGeo(35.8, 52.2, 4.4, 4.5, -25.4, -25.2, 2)], wood, { cast: false }));
  const pod = [];
  for (let i = 0; i < 9; i++) pod.push({ x: 41 + (i % 3) * 2, y: 0.12 + Math.floor(i / 3) * 0.32, z: -24.7, sx: 6.5, sy: 4.6, sz: 5.5, ry: (i % 2) * 0.08, c: ["#6a1a18", "#1d3a5e", "#5a3a1a"][i % 3] });
  group.add(instances(stackG, M({ color: "#ffffff", roughness: 0.8 }), pod, { color: true }));
  // high shelf for the cushion
  add(meshOf([boxGeo(56.5, 61.5, 2.85, 2.95, -25.4, -24.6, 2)], darkWood, { cast: false }));
  // duelling strip
  add(meshOf([planeGeo(30, 58, 12.6, 15.4, 0.025, 2.8)], M({ ...S("carpet"), color: "#6a7aa8", roughness: 1 }), { cast: false }));
  for (const [h, x] of [["gryffindor", 33], ["slytherin", 55]]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(2, 5), M({ map: bannerTex(h), roughness: 0.9, side: THREE.DoubleSide }));
    m.position.set(x, 7, 25.3);
    m.rotation.y = Math.PI;
    group.add(m);
  }
  // Snape's cabinet + bottles
  add(meshOf([boxGeo(62.5, 65.4, 0, 2.6, 8, 12, 2)], darkWood));
  const bottleGeo = new THREE.CylinderGeometry(0.06, 0.08, 0.26, 8);
  geos.push(bottleGeo);
  const bottles = [];
  for (let i = 0; i < 24; i++) bottles.push({ x: 62.4, y: 0.6 + Math.floor(i / 8) * 0.7, z: 8.4 + (i % 8) * 0.45, c: ["#5fd08a", "#5aa8ff", "#c9a24a", "#c84a8a"][i % 4] });
  const bottleMat = M({ color: "#ffffff", emissive: "#203020", roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.85 });
  group.add(instances(bottleGeo, bottleMat, bottles, { cast: false, color: true }));

  /* ============================================================ hidden complex details */
  // cobwebs in the corners (thin translucent fans)
  const webMat = M({ color: "#d8d8d0", transparent: true, opacity: 0.18, side: THREE.DoubleSide, roughness: 1, depthWrite: false });
  const webG = [];
  for (const [x, z, ry] of [[-77.2, -2.6, 0], [-95.2, 9.2, 2], [-82.4, -39.2, 1], [-99.2, -61.2, 0.8], [-155.2, -63.2, 0.5], [-159.2, -95.2, 0.9], [-128.8, -95.2, 2.3]]) {
    const g = new THREE.CircleGeometry(1.6, 6, 0, Math.PI / 2);
    g.rotateY(ry);
    g.translate(x, HEIGHTS.hidden - 0.2, z);
    g.rotateX(0);
    webG.push(g);
  }
  add(meshOf(webG, webMat, { cast: false, receive: false }));
  // pillars in the antechamber + vault
  const pil = [];
  for (const [x, z, r, h] of [[-150, -44, 0.7, HEIGHTS.hidden], [-138, -44, 0.7, HEIGHTS.hidden], [-150, -58, 0.7, HEIGHTS.hidden], [-138, -58, 0.7, HEIGHTS.hidden], [-152, -90, 0.8, HEIGHTS.hidden], [-136, -90, 0.8, HEIGHTS.hidden], [-152, -70, 0.8, HEIGHTS.hidden], [-136, -70, 0.8, HEIGHTS.hidden]]) {
    const c = new THREE.CylinderGeometry(r, r * 1.1, h, 12);
    c.translate(x, h / 2, z);
    pil.push(c, boxGeo(x - r - 0.2, x + r + 0.2, 0, 0.4, z - r - 0.2, z + r + 0.2, 2), boxGeo(x - r - 0.2, x + r + 0.2, h - 0.5, h, z - r - 0.2, z + r + 0.2, 2));
  }
  add(meshOf(pil, hiddenStone));
  // vault treasure piles
  const coinGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.02, 8);
  geos.push(coinGeo);
  const coins = [];
  for (let i = 0; i < 260; i++) {
    const pile = [[-156, -86], [-132, -86], [-156, -74], [-133, -74]][i % 4];
    const a = rr() * 6.28;
    const d = Math.sqrt(rr()) * 1.4;
    coins.push({ x: pile[0] + Math.cos(a) * d, y: 0.02 + (1.4 - d) * 0.35 * rr(), z: pile[1] + Math.sin(a) * d, rx: rr() * 0.6, rz: rr() * 0.6 });
  }
  group.add(instances(coinGeo, gold, coins, { cast: false }));
  // pedestal
  add(meshOf([new THREE.CylinderGeometry(0.9, 1.1, 1.2, 16).translate(-144, 0.6, -80), new THREE.CylinderGeometry(1.1, 1.1, 0.12, 16).translate(-144, 1.2, -80)], stoneTrim));
  // braziers' stands + mirror frame
  const braz = [];
  for (const [x, z] of [[-96.5, -58.5], [-77.5, -58.5], [-96.5, -43.5], [-77.5, -43.5]]) {
    braz.push(new THREE.CylinderGeometry(0.18, 0.3, 1.0, 10).translate(x, 0.5, z));
    braz.push(new THREE.CylinderGeometry(0.55, 0.3, 0.35, 14, 1, true).translate(x, 1.15, z));
  }
  add(meshOf(braz, iron));
  add(meshOf([boxGeo(-88.6, -85.4, 0, 0.35, -61.4, -60.8, 1), boxGeo(-88.6, -88.2, 0.35, 4.6, -61.4, -60.8, 1), boxGeo(-85.8, -85.4, 0.35, 4.6, -61.4, -60.8, 1), boxGeo(-88.6, -85.4, 4.2, 4.6, -61.4, -60.8, 1)], gold));

  /* ============================================================ update */
  const dummy = new THREE.Object3D();
  return {
    group,
    lights,
    fountain,
    update(dt, t, ctx) {
      skyU.uTime.value = t;
      // candles only when someone can see them
      if (ctx.nearHall) {
        candles.forEach((c, i) => {
          dummy.position.set(c.x, c.y + Math.sin(t * 0.9 + c.ph) * 0.12, c.z);
          dummy.updateMatrix();
          candleIM.setMatrixAt(i, dummy.matrix);
          c.by = dummy.position.y;
        });
        candleIM.instanceMatrix.needsUpdate = true;
      }
    },
    dispose() {
      group.traverse((o) => {
        if (o.isMesh && o.geometry) o.geometry.dispose();
      });
      mats.forEach((m) => m.dispose());
      geos.forEach((g) => g.dispose());
      scene.remove(group);
    },
  };
}
export { glowTex, merge };
