/**
 * Everything outside the castle walls:
 *   the grounds (grass, dirt paths, trees, rocks, flowers, grass tufts),
 *   Hagrid's hut and pumpkin patch, the Forbidden Forest (dense oaks and
 *   pines, bramble edge, glowing toadstools, webs, the camp, the shrine),
 *   the practice pitch (striped lawn, hoops, house stands, the lift tower),
 *   the lake and the mountains, and the Duelling Ruins — a broken stone
 *   disc floating in a storm, far from everything.
 */
import * as THREE from "three";
import { forestTrees, FOREST, FOREST_PATH, FOREST_ROCKS, TENTS, GROUND_TREES, PITCH, STANDS, HOOPS, TOWER, ARENA, ARENA_PILLARS } from "../data/layout.js";
import { surface, bannerTex } from "./textures.js";
import { boxGeo, planeGeo, meshOf, instances, at, tint } from "./geom.js";
import { rng, fbm, segDist } from "../engine/math.js";

export function buildOutdoors(scene, quality) {
  const group = new THREE.Group();
  group.name = "outdoors";
  scene.add(group);
  const mats = [];
  const geos = [];
  const M = (o) => {
    const m = new THREE.MeshStandardMaterial(o);
    mats.push(m);
    return m;
  };
  const S = (k) => surface(k);
  const add = (m) => m && group.add(m);
  const r = rng(77);
  const lights = [];

  /* ============================================================ ground */
  const grass = M({ ...S("grass"), color: "#e8f0d8", roughness: 1 });
  const groundG = planeGeo(-176, 176, 21, 232, 0, 5);
  add(meshOf([groundG], grass, { cast: false }));
  // forest floor overlay
  const forestM = M({ ...S("forest"), color: "#ffffff", roughness: 1, polygonOffset: true, polygonOffsetFactor: -1 });
  add(meshOf([planeGeo(FOREST.x0, FOREST.x1 + 2, FOREST.z0 - 2, FOREST.z1, 0.01, 4)], forestM, { cast: false }));
  // dirt paths (ribbons)
  const pathM = M({ ...S("path"), color: "#ffffff", roughness: 1, polygonOffset: true, polygonOffsetFactor: -2 });
  const paths = [
    [[0, 20], [0, 34], [2, 46], [-10, 56], [-28, 64], [-40, 72]],
    [[2, 46], [22, 62], [46, 78], [70, 92], [90, 100]],
    [[-40, 72], [-58, 78], [-72, 82], [-81, 86], [-81, 92]],
    ...[FOREST_PATH.map(([x, z]) => [x, z])],
  ];
  const ribbons = [];
  for (const pts of paths) {
    const w = pts === paths[3] ? 2.6 : 3.2;
    const pos = [];
    const uv = [];
    let acc = 0;
    for (let i = 0; i < pts.length; i++) {
      const [x, z] = pts[i];
      const [nx, nz] = pts[Math.min(pts.length - 1, i + 1)];
      const [px, pz] = pts[Math.max(0, i - 1)];
      let dx = nx - px;
      let dz = nz - pz;
      const L = Math.hypot(dx, dz) || 1;
      dx /= L;
      dz /= L;
      if (i > 0) acc += Math.hypot(x - pts[i - 1][0], z - pts[i - 1][1]);
      pos.push([x - dz * w, 0.02, z + dx * w], [x + dz * w, 0.02, z - dx * w]);
      uv.push([0, acc / 4], [w / 2, acc / 4]);
    }
    const P = [];
    const U = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pos[i * 2];
      const b = pos[i * 2 + 1];
      const c = pos[i * 2 + 3];
      const d = pos[i * 2 + 2];
      P.push(...a, ...b, ...c, ...a, ...c, ...d);
      U.push(...uv[i * 2], ...uv[i * 2 + 1], ...uv[i * 2 + 3], ...uv[i * 2], ...uv[i * 2 + 3], ...uv[i * 2 + 2]);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(U, 2));
    g.computeVertexNormals();
    // flip any downward normals (ribbon winding)
    const n = g.attributes.normal;
    for (let i = 0; i < n.count; i++) if (n.getY(i) < 0) n.setXYZ(i, 0, 1, 0);
    ribbons.push(g);
  }
  add(meshOf(ribbons, pathM, { cast: false }));

  // rolling hills + mountains beyond the walkable grounds
  const hillM = M({ ...S("grass"), color: "#b8c8a0", roughness: 1 });
  {
    const W = 900;
    const N = quality === "low" ? 90 : 150;
    const g = new THREE.PlaneGeometry(W, W, N, N);
    g.rotateX(-Math.PI / 2);
    const p = g.attributes.position;
    const col = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const z = p.getZ(i) + 60;
      p.setZ(i, z);
      // inside the playable rectangle stay flat (and below the grounds)
      const dx = Math.max(0, Math.abs(x) - 178);
      const dzS = Math.max(0, z - 234);
      const dzN = Math.max(0, -110 - z);
      const out = Math.max(dx, dzS, dzN);
      const lake = x > 176 && z > 40 && z < 260 ? 1 : 0;
      let h = -2;
      if (out > 0 && !lake) h = Math.min(1, out / 40) * (8 + fbm(x * 0.01, z * 0.01, 4, 3) * 18) + Math.max(0, out - 120) * 0.45 + Math.max(0, fbm(x * 0.004, z * 0.004, 3, 9)) * Math.max(0, out - 60) * 0.7;
      if (lake) h = -3;
      if (x > -168 && x < -60 && z > -104 && z < 16) h = -40; // under the hidden complex (its pits look down into the dark)
      p.setY(i, h);
      const snow = Math.min(1, Math.max(0, (h - 70) / 30));
      const rock = Math.min(1, Math.max(0, (h - 28) / 30));
      col[i * 3] = 0.55 + rock * 0.1 + snow * 0.4;
      col[i * 3 + 1] = 0.62 - rock * 0.08 + snow * 0.35;
      col[i * 3 + 2] = 0.42 + rock * 0.12 + snow * 0.5;
    }
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    g.computeVertexNormals();
    hillM.vertexColors = true;
    const hills = new THREE.Mesh(g, hillM);
    hills.receiveShadow = true;
    group.add(hills);
  }
  // the lake (east)
  const waterU = { uTime: { value: 0 } };
  const lakeMat = M({ color: "#2a4a5a", roughness: 0.05, metalness: 0.3, transparent: true, opacity: 0.92 });
  lakeMat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = waterU.uTime;
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vW;").replace("#include <worldpos_vertex>", "#include <worldpos_vertex>\nvW = (modelMatrix * vec4(transformed,1.0)).xyz;");
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform float uTime; varying vec3 vW;")
      .replace("#include <normal_fragment_maps>", "#include <normal_fragment_maps>\n normal = normalize(normal + vec3(sin(vW.x*0.35+uTime*0.9)*0.06 + sin(vW.z*0.8+uTime*1.3)*0.04, 0.0, cos(vW.z*0.3+uTime*0.7)*0.06));");
  };
  {
    const lake = new THREE.Mesh(new THREE.PlaneGeometry(420, 260), lakeMat);
    lake.rotation.x = -Math.PI / 2;
    lake.position.set(390, -0.6, 150);
    group.add(lake);
  }

  /* ============================================================ trees */
  // stylised trees: tapered trunks + clustered leafy blobs (vertex-coloured)
  const bark = M({ ...S("bark"), color: "#c8b8a8", roughness: 1 });
  const leaves = M({ color: "#ffffff", roughness: 0.95, vertexColors: true, flatShading: false });
  const trunkGeo = new THREE.CylinderGeometry(0.28, 0.5, 1, 8, 1);
  trunkGeo.translate(0, 0.5, 0);
  const blob = new THREE.IcosahedronGeometry(1, 1);
  {
    const p = blob.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const f = 1 + Math.sin(i * 7.31) * 0.12;
      p.setXYZ(i, p.getX(i) * f, p.getY(i) * f * 0.82, p.getZ(i) * f);
    }
    blob.computeVertexNormals();
  }
  const pineGeo = new THREE.ConeGeometry(1, 1, 9);
  geos.push(trunkGeo, blob, pineGeo);
  const trunks = [];
  const crownG = [];
  const pineG = [];
  const addTree = (x, z, s, kind, rot, dark = false) => {
    if (kind === "pine") {
      trunks.push({ x, y: 0, z, sx: s * 0.7, sy: s * 4, sz: s * 0.7, ry: rot });
      for (let k = 0; k < 4; k++) {
        const g = pineGeo.clone();
        g.scale(s * (2.6 - k * 0.5), s * 3.2, s * (2.6 - k * 0.5));
        g.translate(x, s * (3.4 + k * 2.1), z);
        tint(g, dark ? ["#1a2e1e", "#1e3424", "#22382a", "#26402e"][k] : ["#2a4a2a", "#30522e", "#365a32", "#3c6236"][k]);
        pineG.push(g);
      }
    } else {
      trunks.push({ x, y: 0, z, sx: s, sy: s * 5.2, sz: s, ry: rot });
      const n = 5;
      for (let k = 0; k < n; k++) {
        const a = rot + (k / n) * Math.PI * 2;
        const rr2 = k === 0 ? 0 : s * 1.5;
        const g = blob.clone();
        const bs = s * (k === 0 ? 2.6 : 2.0) * (0.9 + ((k * 37) % 10) / 40);
        g.scale(bs, bs, bs);
        g.translate(x + Math.cos(a) * rr2, s * (k === 0 ? 6.6 : 5.6 + (k % 2) * 0.8), z + Math.sin(a) * rr2);
        const base = dark ? (k % 2 ? "#1c2a18" : "#22301c") : k % 2 ? "#3e5e24" : "#4a6a2a";
        tint(g, base);
        // darker underside
        const c = g.attributes.color;
        const p = g.attributes.position;
        const cy = s * 5.8;
        for (let i = 0; i < c.count; i++) {
          const f = 0.65 + Math.min(0.5, Math.max(0, (p.getY(i) - cy) / (bs * 2) + 0.35));
          c.setXYZ(i, c.getX(i) * f, c.getY(i) * f, c.getZ(i) * f);
        }
        crownG.push(g);
      }
    }
  };
  for (const t of forestTrees()) addTree(t.x, t.z, t.s, t.kind, t.rot, true);
  // the bramble edge: a wall of trees along the thicket
  for (let x = -174; x < -58; x += 3.2) if (x < -86 || x > -76) addTree(x + r.range(-0.6, 0.6), 92 + r.range(-0.8, 0.8), r.range(0.9, 1.3), r() < 0.5 ? "oak" : "pine", r() * 6, true);
  for (let z = 95; z < 230; z += 3.4) addTree(-58.5 + r.range(-0.6, 0.6), z, r.range(0.9, 1.3), r() < 0.5 ? "oak" : "pine", r() * 6, true);
  for (const [x, z] of GROUND_TREES) addTree(x, z, r.range(1.0, 1.35), r() < 0.7 ? "oak" : "pine", r() * 6);
  // courtyard trees
  for (const [x, z] of [[-14, -14], [14, -14], [-14, 14], [14, 14]]) addTree(x, z, 0.85, "oak", r() * 6);
  // a ring of trees at the edge of the world
  for (let i = 0; i < 70; i++) {
    const side = i % 3;
    const x = side === 0 ? r.range(-176, 176) : side === 1 ? r.range(-200, -178) : r.range(178, 196);
    const z = side === 0 ? r.range(234, 260) : r.range(30, 250);
    if (side === 2 && z > 40) continue; // lake shore stays open
    addTree(x, z, r.range(1, 1.5), r() < 0.5 ? "oak" : "pine", r() * 6);
  }
  group.add(instances(trunkGeo, bark, trunks));
  add(meshOf(crownG, leaves));
  add(meshOf(pineG, leaves));

  // bushes, rocks, toadstools, flowers, grass tufts
  const rockM = M({ ...S("bark"), color: "#8a8a84", roughness: 0.95 });
  const rockGeo = new THREE.DodecahedronGeometry(1, 0);
  geos.push(rockGeo);
  const rocks = FOREST_ROCKS.map(([x, z, s]) => ({ x, y: s * 0.3, z, sx: s, sy: s * 0.8, sz: s * 1.1, ry: x }));
  for (let i = 0; i < 40; i++) {
    const x = r.range(-170, 170);
    const z = r.range(30, 228);
    if (x > FOREST.x0 && x < FOREST.x1 && z > FOREST.z0) continue;
    if (Math.hypot(x - PITCH.x, z - PITCH.z) < 50 || Math.hypot(x + 45, z - 72) < 14) continue;
    rocks.push({ x, y: 0.1, z, s: r.range(0.3, 0.8), ry: r() * 6 });
  }
  group.add(instances(rockGeo, rockM, rocks));
  const shroomCap = new THREE.SphereGeometry(0.16, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  const shroomStem = new THREE.CylinderGeometry(0.04, 0.05, 0.18, 6);
  shroomStem.translate(0, 0.09, 0);
  shroomCap.translate(0, 0.17, 0);
  geos.push(shroomCap, shroomStem);
  const shrooms = [];
  for (let i = 0; i < 160; i++) {
    const x = r.range(FOREST.x0 + 3, FOREST.x1 - 3);
    const z = r.range(FOREST.z0 + 4, FOREST.z1 - 3);
    shrooms.push({ x, y: 0, z, s: r.range(0.6, 1.5) });
  }
  const capM = M({ color: "#3a8a8a", emissive: "#40ffd8", emissiveIntensity: 0.9, roughness: 0.5 });
  group.add(instances(shroomCap, capM, shrooms, { cast: false }));
  group.add(instances(shroomStem, M({ color: "#d8d0b8", roughness: 0.8 }), shrooms, { cast: false }));
  // grass tufts in the grounds (crossed blades)
  if (quality !== "low") {
    const tuft = new THREE.BufferGeometry();
    const P = [];
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      const ox = Math.cos(a) * 0.09;
      const oz = Math.sin(a) * 0.09;
      const tx = Math.cos(a) * 0.05;
      const tz = Math.sin(a) * 0.05;
      // a thin leaning blade
      P.push(ox - tz * 0.5, 0, oz + tx * 0.5, ox + tz * 0.5, 0, oz - tx * 0.5, ox * 2.2, 0.32 + (k % 2) * 0.12, oz * 2.2);
    }
    tuft.setAttribute("position", new THREE.Float32BufferAttribute(P, 3));
    tuft.computeVertexNormals();
    const nrm = tuft.attributes.normal;
    for (let i = 0; i < nrm.count; i++) nrm.setXYZ(i, 0, 1, 0);
    geos.push(tuft);
    const tufts = [];
    const N = quality === "high" ? 5200 : 2600;
    for (let i = 0; i < N * 3 && tufts.length < N; i++) {
      const x = r.range(-170, 170);
      const z = r.range(29, 228);
      if (x > FOREST.x0 - 1 && x < FOREST.x1 + 1 && z > FOREST.z0 - 2) continue;
      if (Math.hypot(x + 45, z - 70) < 6) continue;
      if (((x - PITCH.x) / PITCH.rx) ** 2 + ((z - PITCH.z) / PITCH.rz) ** 2 < 1.05) continue;
      let onPath = false;
      for (const pts of paths.slice(0, 3)) for (let k = 0; k < pts.length - 1 && !onPath; k++) if (segDist(x, z, pts[k][0], pts[k][1], pts[k + 1][0], pts[k + 1][1]) < 3.6) onPath = true;
      if (onPath) continue;
      tufts.push({ x, y: 0, z, s: r.range(0.7, 1.25), ry: r() * 6, c: r() < 0.08 ? (r() < 0.5 ? "#e8d860" : "#d890c8") : r() < 0.5 ? "#6a8a34" : "#7a9a3c" });
    }
    group.add(instances(tuft, M({ color: "#ffffff", roughness: 1, side: THREE.DoubleSide }), tufts, { cast: false, color: true }));
  }

  /* ============================================================ Hagrid's hut */
  {
    const stoneM = M({ ...S("castle"), color: "#b8a890", roughness: 1 });
    const thatch = M({ ...S("bark"), color: "#c8a060", roughness: 1 });
    const hut = [];
    const wall = new THREE.CylinderGeometry(4.5, 4.7, 4.2, 20, 1, true);
    const uv = wall.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 7, uv.getY(i) * 1.2);
    wall.translate(-45, 2.1, 70);
    hut.push(wall);
    hut.push(boxGeo(-46.6, -45.4, 5, 8.2, 66.5, 67.7, 2)); // chimney
    add(meshOf(hut, stoneM));
    const roof = new THREE.ConeGeometry(5.6, 4.4, 20, 1, true);
    roof.translate(-45, 6.2, 70);
    add(meshOf([roof], thatch));
    // door + windows
    add(meshOf([boxGeo(-46.1, -43.9, 0, 2.8, 74.55, 74.75, 1.2)], M({ ...S("darkWood"), color: "#ffffff" })));
    const wm = M({ color: "#ffb860", emissive: "#ff9a40", emissiveIntensity: 1.4 });
    add(meshOf([boxGeo(-41.2, -40.0, 1.6, 2.6, 72.6, 72.8, 1), boxGeo(-50.0, -48.8, 1.6, 2.6, 72.6, 72.8, 1)], wm, { cast: false }));
    // pumpkins
    const pg = new THREE.SphereGeometry(0.7, 14, 10);
    const pp = pg.attributes.position;
    for (let i = 0; i < pp.count; i++) {
      const a = Math.atan2(pp.getZ(i), pp.getX(i));
      const f = 1 + Math.cos(a * 8) * 0.06;
      pp.setXYZ(i, pp.getX(i) * f, pp.getY(i) * 0.72, pp.getZ(i) * f);
    }
    pg.computeVertexNormals();
    geos.push(pg);
    group.add(instances(pg, M({ color: "#e0761e", roughness: 0.6 }), [[-37, 74, 1], [-36, 77, 0.8], [-38.5, 79, 1.1], [-35, 80.5, 0.9]].map(([x, z, s]) => ({ x, y: 0.45 * s, z, s, ry: x }))));
    // fence
    const fence = [];
    for (let i = 0; i < 14; i++) {
      const a = 0.3 + (i / 13) * 1.9;
      const x = -45 + Math.cos(a) * 12;
      const z = 70 + Math.sin(a) * 12;
      fence.push(boxGeo(x - 0.08, x + 0.08, 0, 1.1, z - 0.08, z + 0.08, 1));
    }
    add(meshOf(fence, M({ ...S("wood"), color: "#8a7058" })));
    lights.push({ x: -40.5, y: 2.2, z: 74.8, s: 1.2, c: [1, 0.7, 0.35] });
  }

  /* ============================================================ forest dressing */
  {
    // tents, logs, crates at the camp
    const cloth = M({ color: "#3a3428", roughness: 1, side: THREE.DoubleSide });
    const tg = [];
    for (const [x, z, ry] of TENTS) {
      const t = new THREE.ConeGeometry(2.1, 2.6, 4, 1, true);
      t.rotateY(Math.PI / 4 + ry);
      t.translate(x, 1.3, z);
      tg.push(t);
    }
    add(meshOf(tg, cloth));
    const logs = [];
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const g = new THREE.CylinderGeometry(0.2, 0.22, 2.2, 8);
      g.rotateZ(Math.PI / 2);
      g.rotateY(a);
      g.translate(-102 + Math.cos(a) * 2.6, 0.22, 196 + Math.sin(a) * 2.6);
      logs.push(g);
    }
    add(meshOf(logs, bark));
    // the shrine: a ring of standing stones around the capstone
    const ring = [];
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const g = new THREE.BoxGeometry(0.8, 2.6 + (i % 2) * 0.8, 0.6);
      g.rotateY(-a);
      g.translate(-150 + Math.cos(a) * 4.2, 1.3, 205 + Math.sin(a) * 4.2);
      ring.push(g);
    }
    add(meshOf(ring, M({ ...S("hidden"), color: "#c8c8b8" })));
    add(meshOf([new THREE.CylinderGeometry(1.1, 1.25, 0.9, 12).translate(-150, 0.45, 205)], M({ ...S("hidden"), color: "#a8a898" })));
    // big spider webs between trees near the hollow
    const webM = M({ color: "#e8e8e0", transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false, roughness: 1 });
    const webs = [];
    for (const [x, z, ry] of [[-118, 153, 0.4], [-132, 161, 1.9], [-127, 172, 2.6], [-112, 168, 0.9], [-121, 149, 1.2]]) {
      const g = new THREE.CircleGeometry(2.4, 10);
      g.rotateY(ry);
      g.translate(x, 3.2, z);
      webs.push(g);
    }
    add(meshOf(webs, webM, { cast: false, receive: false }));
  }

  /* ============================================================ practice pitch */
  {
    const cvs = document.createElement("canvas");
    cvs.width = 512;
    cvs.height = 320;
    const g = cvs.getContext("2d");
    for (let i = 0; i < 16; i++) {
      g.fillStyle = i % 2 ? "#4a7a2c" : "#558a32";
      g.fillRect((i * 512) / 16, 0, 512 / 16 + 1, 320);
    }
    g.strokeStyle = "rgba(240,240,230,0.85)";
    g.lineWidth = 4;
    g.beginPath();
    g.ellipse(256, 160, 248, 152, 0, 0, Math.PI * 2);
    g.stroke();
    g.beginPath();
    g.arc(256, 160, 34, 0, Math.PI * 2);
    g.moveTo(256, 8);
    g.lineTo(256, 312);
    g.stroke();
    for (const x of [40, 472]) {
      g.beginPath();
      g.ellipse(x, 160, 34, 60, 0, 0, Math.PI * 2);
      g.stroke();
    }
    const tex = new THREE.CanvasTexture(cvs);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    const field = new THREE.CircleGeometry(1, 64);
    field.rotateX(-Math.PI / 2);
    field.scale(PITCH.rx + 2, 1, PITCH.rz + 2);
    const uvA = field.attributes.uv;
    const pA = field.attributes.position;
    for (let i = 0; i < uvA.count; i++) uvA.setXY(i, pA.getX(i) / ((PITCH.rx + 2) * 2) + 0.5, -pA.getZ(i) / ((PITCH.rz + 2) * 2) + 0.5);
    field.translate(PITCH.x, 0.015, PITCH.z);
    add(meshOf([field], M({ map: tex, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -3 }), { cast: false }));
    // hoops
    const goldM = M({ color: "#d8b25a", roughness: 0.3, metalness: 0.9 });
    const hoopG = [];
    for (const [x, z, h] of HOOPS) {
      hoopG.push(new THREE.CylinderGeometry(0.16, 0.2, h - 1, 10).translate(x, (h - 1) / 2, z));
      const ring = new THREE.TorusGeometry(1.1, 0.1, 8, 28);
      ring.rotateY(Math.PI / 2);
      ring.translate(x, h, z);
      hoopG.push(ring);
    }
    add(meshOf(hoopG, goldM));
    // stands: timber towers with house cloth and pointed roofs
    const houses = ["gryffindor", "slytherin", "ravenclaw", "hufflepuff"];
    const standWood = M({ ...S("wood"), color: "#a88868" });
    const sw = [];
    STANDS.forEach(([x, z], i) => {
      for (const [dx, dz] of [[-2.6, -2.6], [2.6, -2.6], [-2.6, 2.6], [2.6, 2.6]]) sw.push(boxGeo(x + dx - 0.2, x + dx + 0.2, 0, 10, z + dz - 0.2, z + dz + 0.2, 2));
      sw.push(boxGeo(x - 3, x + 3, 9.6, 10, z - 3, z + 3, 2), boxGeo(x - 3, x + 3, 5, 5.3, z - 3, z + 3, 2));
      const cloth = new THREE.Mesh(new THREE.CylinderGeometry(3.15, 3.15, 4.4, 4, 1, true), M({ map: bannerTex(houses[i]), roughness: 0.9, side: THREE.DoubleSide }));
      cloth.rotation.y = Math.PI / 4;
      cloth.position.set(x, 2.8, z);
      group.add(cloth);
      const roofM = M({ color: ["#8e1b22", "#1a4e2e", "#1e3a7a", "#c09a18"][i], roughness: 0.8 });
      const rf = new THREE.Mesh(new THREE.ConeGeometry(4.4, 4, 4), roofM);
      rf.rotation.y = Math.PI / 4;
      rf.position.set(x, 12, z);
      rf.castShadow = true;
      group.add(rf);
    });
    add(meshOf(sw, standWood));
    // the practice tower
    const tw = [];
    const drum = new THREE.CylinderGeometry(TOWER.r, TOWER.r + 0.3, TOWER.top - 0.4, 18);
    const du = drum.attributes.uv;
    for (let i = 0; i < du.count; i++) du.setXY(i, du.getX(i) * 6, du.getY(i) * 2);
    drum.translate(TOWER.x, (TOWER.top - 0.4) / 2, TOWER.z);
    tw.push(drum);
    add(meshOf(tw, M({ ...S("castle"), color: "#c8c0b0" })));
    add(meshOf([boxGeo(93.5, 106, TOWER.top - 0.4, TOWER.top, 87, 97, 2)], standWood));
    const rails = [boxGeo(93.5, 106, TOWER.top, TOWER.top + 1.1, 86.6, 87, 1), boxGeo(93.5, 106, TOWER.top, TOWER.top + 1.1, 97, 97.4, 1), boxGeo(106, 106.4, TOWER.top, TOWER.top + 1.1, 86.6, 97.4, 1), boxGeo(93.1, 93.5, TOWER.top, TOWER.top + 1.1, 86.6, 89.6, 1), boxGeo(93.1, 93.5, TOWER.top, TOWER.top + 1.1, 94.4, 97.4, 1)];
    add(meshOf(rails, standWood));
    // lift guide posts
    add(meshOf([boxGeo(89.2, 89.5, 0, TOWER.top + 2, 89.7, 90, 1), boxGeo(89.2, 89.5, 0, TOWER.top + 2, 94, 94.3, 1)], M({ color: "#3a3a3e", metalness: 0.7, roughness: 0.4 })));
    for (const [x, z] of [[96, 98], [104, 98]]) add(meshOf([new THREE.CylinderGeometry(0.4, 0.25, 1.2, 10).translate(x, 0.6, z)], M({ color: "#2a2a2e", metalness: 0.7, roughness: 0.4 })));
  }

  /* ============================================================ the Duelling Ruins */
  const arena = new THREE.Group();
  {
    const ar = M({ ...S("arena"), color: "#ffffff", roughness: 0.9 });
    const disc = new THREE.CylinderGeometry(ARENA.r + 1.5, ARENA.r + 1.5, 1.2, 64);
    const du = disc.attributes.uv;
    const dp = disc.attributes.position;
    for (let i = 0; i < du.count; i++) du.setXY(i, dp.getX(i) / 6, dp.getZ(i) / 6);
    disc.translate(ARENA.x, -0.6, ARENA.z);
    const under = new THREE.ConeGeometry(ARENA.r + 1.4, 34, 28, 6);
    const up = under.attributes.position;
    for (let i = 0; i < up.count; i++) {
      const y = up.getY(i);
      const f = 1 + Math.sin(i * 1.7) * 0.08 * (1 - y / 17);
      up.setXYZ(i, up.getX(i) * f, y, up.getZ(i) * f);
    }
    under.computeVertexNormals();
    under.rotateX(Math.PI);
    under.translate(ARENA.x, -18.2, ARENA.z);
    const rockA = M({ ...S("hidden"), color: "#8a8494", roughness: 1 });
    arena.add(meshOf([disc], ar));
    arena.add(meshOf([under], rockA));
    // broken pillars + fallen drums
    const pil = [];
    ARENA_PILLARS.forEach(([x, z], i) => {
      const h = i % 3 === 0 ? 4.5 : 9;
      pil.push(new THREE.CylinderGeometry(1.0, 1.15, h, 14).translate(x, h / 2, z));
      if (h > 5) pil.push(boxGeo(x - 1.4, x + 1.4, h, h + 0.6, z - 1.4, z + 1.4, 2));
    });
    for (const [x, z, a] of [[-12, -406, 0.4], [14, -430, 1.3], [8, -404, 2.2]]) {
      const g = new THREE.CylinderGeometry(1, 1, 3.2, 14);
      g.rotateZ(Math.PI / 2);
      g.rotateY(a);
      g.translate(x, 0.9, z);
      pil.push(g);
    }
    arena.add(meshOf(pil, M({ ...S("castle"), color: "#9a96a2", roughness: 0.95 })));
    // rune ring inlaid in the floor
    const runeM = M({ color: "#123a22", emissive: "#2aff7a", emissiveIntensity: 0.35, roughness: 0.6, transparent: true, opacity: 0.7 });
    const ring = new THREE.RingGeometry(9.4, 10, 64);
    ring.rotateX(-Math.PI / 2);
    ring.translate(ARENA.x, 0.02, ARENA.z);
    const ring2 = new THREE.RingGeometry(16, 16.3, 64);
    ring2.rotateX(-Math.PI / 2);
    ring2.translate(ARENA.x, 0.02, ARENA.z);
    arena.add(meshOf([ring, ring2], runeM, { cast: false }));
    // floating rocks
    const fr = [];
    for (let i = 0; i < 18; i++) {
      const a = r() * Math.PI * 2;
      const d = 70 + r() * 70;
      fr.push({ x: ARENA.x + Math.cos(a) * d, y: -14 + r() * 30, z: ARENA.z + Math.sin(a) * d, s: 2 + r() * 5, ry: r() * 6, rx: r() });
    }
    arena.add(instances(rockGeo, rockA, fr));
  }
  group.add(arena);

  return {
    group,
    lights,
    update(dt, t) {
      waterU.uTime.value = t;
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
