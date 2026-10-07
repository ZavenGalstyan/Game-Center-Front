/**
 * Dungeon Knight — builds one room's meshes from the engine's room geometry
 * (the same boxes the knight collides with) and the dungeon theme: tiled
 * stone floor, ashlar walls with plinth and cornice, a dark ceiling, arched
 * doorways with swinging oak doors and lit room-type symbols, torches,
 * pillars, crates, barrels, tombs, cells, the shrine and the chest — then
 * dresses it with theme decoration (moss, roots, ice, lava cracks, banners …).
 *
 * Returns { group, update(W, time, dt), dispose(), torches, chest, doors }.
 * Graphics quality only changes decoration density and light count.
 */
import * as THREE from "three";
import { mat, steel, glow, lathe, ellipsoid, rbox, addMesh, group, geo } from "./materials.js";
import { floorTexture, wallTexture, woodTexture, glowTexture, flameTexture, patchTexture, crackTexture, symbolTexture } from "./textures.js";
import { WALL_T, WALL_H, DOOR_W, DOOR_H, ALCOVE } from "../data/layouts.js";
import { barrelSpots, BARREL_R } from "../engine/room.js";
import { rng } from "../engine/math.js";

/** Box with UVs in world metres (texture covers `tile` m) — walls never stretch. */
function worldBox(w, h, d, tile = 3) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  const n = g.attributes.normal;
  for (let i = 0; i < uv.count; i++) {
    const ax = Math.abs(n.getX(i));
    const ay = Math.abs(n.getY(i));
    let su;
    let sv;
    if (ax > 0.5) {
      su = d;
      sv = h;
    } else if (ay > 0.5) {
      su = w;
      sv = d;
    } else {
      su = w;
      sv = h;
    }
    uv.setXY(i, (uv.getX(i) * su) / tile, (uv.getY(i) * sv) / tile);
  }
  return g;
}

export function buildRoomMeshes(W, theme, quality, opts = {}) {
  const shadows = opts.shadows !== false;
  const G = W.geo;
  const root = new THREE.Group();
  const own = []; // per-room geometries/materials to dispose
  const ownG = (g) => {
    own.push(g);
    return g;
  };
  const ownM = (m) => {
    own.push(m);
    return m;
  };
  const r = rng(((W.dungeon.id * 31 + W.stepIndex * 7 + (W.room.layout.length || 1)) >>> 0) + 1);
  const deco = quality === "low" ? 0.45 : quality === "high" ? 1.3 : 1;
  const T = theme;

  /* ---------------------------------------------------------------- materials */
  const floorMap = floorTexture();
  const wallMap = wallTexture();
  const floorM = ownM(new THREE.MeshStandardMaterial({ color: T.floor, map: floorMap, roughness: 0.92, metalness: 0.02 }));
  const wallM = mat(T.wall, 0.9, 0.0, { map: wallMap });
  const trimM = mat(T.trim, 0.85, 0.0, { map: wallMap });
  const woodM = mat(T.wood, 0.85, 0.0, { map: woodTexture() });
  const ironM = steel(T.metal, 0.6);
  const darkM = mat("#060506", 1, 0);

  /* ---------------------------------------------------------------- floor + ceiling */
  const fw = G.w + WALL_T * 2;
  const fd = G.d + (WALL_T + ALCOVE + 0.5) * 2;
  const floorG = ownG(new THREE.PlaneGeometry(fw, fd));
  floorG.rotateX(-Math.PI / 2);
  const fuv = floorG.attributes.uv;
  for (let i = 0; i < fuv.count; i++) fuv.setXY(i, (fuv.getX(i) * fw) / 2.6, (fuv.getY(i) * fd) / 2.6);
  const floor = addMesh(root, floorG, floorM, null, null, null, false);
  floor.receiveShadow = shadows;
  const ceilG = ownG(new THREE.PlaneGeometry(fw, fd));
  ceilG.rotateX(Math.PI / 2);
  addMesh(root, ceilG, mat(T.ceiling, 1, 0), [0, WALL_H, 0], null, null, false);

  /* ---------------------------------------------------------------- walls */
  for (const b of G.C.boxes) {
    if (b.tag !== "wall" && b.tag !== "alcove") continue;
    const w = b.x1 - b.x0;
    const d = b.z1 - b.z0;
    const h = b.y1 - b.y0;
    const m = addMesh(root, ownG(worldBox(w, h, d, 2.8)), wallM, [(b.x0 + b.x1) / 2, h / 2, (b.z0 + b.z1) / 2], null, null, shadows);
    m.receiveShadow = shadows;
    if (b.tag === "wall") {
      // plinth + cornice trims along the inner faces
      addMesh(root, ownG(worldBox(w + 0.12, 0.42, d + 0.12, 2.8)), trimM, [(b.x0 + b.x1) / 2, 0.21, (b.z0 + b.z1) / 2], null, null, false).receiveShadow = shadows;
      addMesh(root, ownG(worldBox(w + 0.2, 0.28, d + 0.2, 2.8)), trimM, [(b.x0 + b.x1) / 2, WALL_H - 0.3, (b.z0 + b.z1) / 2], null, null, false);
    }
  }
  // the doorway alcoves end in darkness (the passage continues)
  for (const d of G.doors) {
    const north = d.kind === "exit";
    const zb = north ? G.hz + WALL_T + ALCOVE : -G.hz - WALL_T - ALCOVE;
    const pass = new THREE.Mesh(geo("passage", () => new THREE.PlaneGeometry(DOOR_W, DOOR_H + 0.4)), darkM);
    pass.position.set(d.x, (DOOR_H + 0.4) / 2, zb + (north ? -0.02 : 0.02));
    pass.rotation.y = north ? Math.PI : 0;
    root.add(pass);
  }

  /* ---------------------------------------------------------------- doorways */
  const archShape = geo("archShape", () => {
    const s = new THREE.Shape();
    const ow = DOOR_W / 2 + 0.42;
    const iw = DOOR_W / 2;
    s.moveTo(-ow, 0);
    s.lineTo(-ow, DOOR_H - 0.4);
    s.absarc(0, DOOR_H - 0.4, ow, Math.PI, 0, true);
    s.lineTo(ow, 0);
    s.lineTo(iw, 0);
    s.lineTo(iw, DOOR_H - 0.4);
    s.absarc(0, DOOR_H - 0.4, iw, 0, Math.PI, false);
    s.lineTo(-iw, 0);
    const g = new THREE.ExtrudeGeometry(s, { depth: WALL_T + 0.24, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.05, bevelSegments: 1, curveSegments: 14 });
    g.translate(0, 0, -(WALL_T + 0.24) / 2);
    return g;
  });
  const lintelShape = geo("lintel", () => {
    // fills the wall above the arch up to the cornice
    const s = new THREE.Shape();
    const iw = DOOR_W / 2;
    s.moveTo(-iw, DOOR_H - 0.4);
    s.absarc(0, DOOR_H - 0.4, iw, Math.PI, 0, true);
    s.lineTo(iw, WALL_H);
    s.lineTo(-iw, WALL_H);
    s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: WALL_T, bevelEnabled: false, curveSegments: 14 });
    g.translate(0, 0, -WALL_T / 2);
    return g;
  });
  const doorViews = [];
  const leafG = geo("doorLeaf", () => {
    const g = rbox(DOOR_W / 2 - 0.04, DOOR_H - 0.12, 0.12, 0.02);
    g.translate((DOOR_W / 2 - 0.04) / 2, (DOOR_H - 0.12) / 2, 0);
    return g;
  });
  for (const d of G.doors) {
    const north = d.kind === "exit";
    const zw = north ? G.hz + WALL_T / 2 : -G.hz - WALL_T / 2;
    const arch = addMesh(root, archShape, trimM, [d.x, 0, zw], null, null, shadows);
    arch.receiveShadow = shadows;
    addMesh(root, lintelShape, wallM, [d.x, 0, zw], null, null, false);
    // keystone
    addMesh(root, geo("keystone", () => rbox(0.34, 0.5, WALL_T + 0.34, 0.03)), trimM, [d.x, DOOR_H + 0.62, zw], null, null, false);
    // two leaves hinged at the jambs, swinging out into the alcove
    const leaves = [];
    for (const s of [-1, 1]) {
      const hinge = group(root, [d.x + s * (DOOR_W / 2 - 0.02), 0.02, north ? G.hz + 0.27 : -G.hz - 0.27]);
      const leaf = addMesh(hinge, leafG, woodM, null, [0, s > 0 ? Math.PI : 0, 0], null, shadows);
      for (const y of [0.45, DOOR_H - 0.7]) addMesh(leaf, geo("band", () => new THREE.BoxGeometry(DOOR_W / 2 - 0.08, 0.09, 0.15)), ironM, [(DOOR_W / 2 - 0.04) / 2, y, 0], null, null, false);
      addMesh(leaf, geo("ring", () => new THREE.TorusGeometry(0.07, 0.014, 6, 14)), ironM, [DOOR_W / 2 - 0.22, 1.2, 0.08], null, null, false);
      leaves.push({ hinge, s });
    }
    let symbol = null;
    let symLight = null;
    if (north) {
      const exitInfo = W.exits[d.index];
      const kind = exitInfo ? exitInfo.type : "exit";
      // stone plaque + glowing symbol above the arch
      addMesh(root, geo("plaque", () => rbox(0.9, 0.9, 0.12, 0.03)), mat("#1b171a", 0.9), [d.x, DOOR_H + 1.38, G.hz - 0.08], null, null, false);
      const sm = ownM(new THREE.MeshBasicMaterial({ map: symbolTexture(kind), transparent: true, depthWrite: false, color: "#ffffff", opacity: 0.55 }));
      symbol = addMesh(root, geo("symbolPlane", () => new THREE.PlaneGeometry(0.8, 0.8)), sm, [d.x, DOOR_H + 1.38, G.hz - 0.15], [0, Math.PI, 0], null, false);
      symLight = { kind };
    }
    doorViews.push({ d, leaves, symbol, symLight });
  }

  /* ---------------------------------------------------------------- obstacles */
  const pillarG = geo("pillar", () => lathe([[0.62, 0], [0.62, 0.3], [0.5, 0.42], [0.46, 0.5], [0.44, 4.2], [0.5, 4.4], [0.62, 4.6], [0.62, 5.2]], 18));
  const crateG = geo("crate", () => rbox(1, 1, 1, 0.04));
  const barrelG = geo("barrel", () => lathe([[0.0, 0.0], [0.3, 0.0], [0.34, 0.12], [BARREL_R + 0.02, 0.5], [0.34, 0.88], [0.3, 1.0], [0.0, 1.0]], 16));
  const hoopG = geo("hoop", () => new THREE.TorusGeometry(BARREL_R + 0.01, 0.02, 4, 18));
  let fountainWater = null;
  let fountainLight = null;
  for (const o of G.props) {
    switch (o.k) {
      case "pillar": {
        const m = addMesh(root, pillarG, wallM, [o.x, 0, o.z], null, [o.r / 0.46, 1, o.r / 0.46], shadows);
        m.receiveShadow = shadows;
        break;
      }
      case "column": {
        const m = addMesh(root, ownG(worldBox(o.s, WALL_H, o.s, 2.8)), wallM, [o.x, WALL_H / 2, o.z], null, null, shadows);
        m.receiveShadow = shadows;
        addMesh(root, ownG(worldBox(o.s + 0.24, 0.5, o.s + 0.24, 2.8)), trimM, [o.x, 0.25, o.z], null, null, false);
        addMesh(root, ownG(worldBox(o.s + 0.3, 0.36, o.s + 0.3, 2.8)), trimM, [o.x, 3.6, o.z], null, null, false);
        break;
      }
      case "crates": {
        const levels = o.h > 1.15 ? 2 : 1;
        const lh = o.h / levels;
        for (let l = 0; l < levels; l++) {
          const shrink = l ? 0.86 : 1;
          const c = addMesh(root, crateG, woodM, [o.x + (l ? (r() - 0.5) * 0.15 : 0), lh * (l + 0.5), o.z + (l ? (r() - 0.5) * 0.15 : 0)], [0, l ? (r() - 0.5) * 0.5 : 0, 0], [o.w * shrink, lh, o.d * shrink], shadows);
          c.receiveShadow = shadows;
          // corner irons
          addMesh(c, geo("crateEdge", () => new THREE.BoxGeometry(1.02, 0.08, 1.02)), ironM, [0, 0.42, 0], null, null, false);
          addMesh(c, geo("crateEdge", () => new THREE.BoxGeometry(1.02, 0.08, 1.02)), ironM, [0, -0.42, 0], null, null, false);
        }
        break;
      }
      case "barrels": {
        for (const [x, z] of barrelSpots(o)) {
          const b = addMesh(root, barrelG, woodM, [x, 0, z], [0, r() * 6, 0], null, shadows);
          for (const y of [0.18, 0.82]) addMesh(b, hoopG, ironM, [0, y, 0], [Math.PI / 2, 0, 0], null, false);
        }
        break;
      }
      case "tomb": {
        addMesh(root, ownG(worldBox(o.w, 0.7, o.d, 2)), trimM, [o.x, 0.35, o.z], null, null, shadows);
        addMesh(root, ownG(worldBox(o.w + 0.12, 0.16, o.d + 0.12, 2)), wallM, [o.x, 0.78, o.z], null, null, shadows);
        // the carved effigy on the lid
        addMesh(root, geo("effigy", () => ellipsoid(0.2, 0.08, 0.7, 12, 8)), wallM, [o.x, 0.9, o.z], null, null, false);
        addMesh(root, geo("effigyHead", () => ellipsoid(0.11, 0.09, 0.12, 10, 8)), wallM, [o.x, 0.92, o.z - (o.d / 2 - 0.35)], null, null, false);
        break;
      }
      case "fountain": {
        addMesh(root, geo("basin", () => lathe([[0.0, 0.0], [1.15, 0.0], [1.18, 0.12], [1.12, 0.62], [1.2, 0.72], [1.05, 0.8], [0.98, 0.5], [0.0, 0.5]], 32)), trimM, [o.x, 0, o.z], null, null, shadows).receiveShadow = shadows;
        addMesh(root, geo("basinPost", () => lathe([[0.22, 0.4], [0.16, 0.8], [0.18, 1.3], [0.42, 1.5], [0.46, 1.6], [0.0, 1.62]], 18)), wallM, [o.x, 0, o.z], null, null, shadows);
        const wm = ownM(new THREE.MeshStandardMaterial({ color: "#3fd8a0", roughness: 0.1, metalness: 0.1, emissive: "#2fd08f", emissiveIntensity: 0.9, transparent: true, opacity: 0.85 }));
        fountainWater = addMesh(root, geo("water", () => {
          const g = new THREE.CircleGeometry(1.0, 32);
          g.rotateX(-Math.PI / 2);
          return g;
        }), wm, [o.x, 0.66, o.z], null, null, false);
        const bowl = ownM(new THREE.MeshStandardMaterial({ color: "#3fd8a0", emissive: "#2fd08f", emissiveIntensity: 1.2, transparent: true, opacity: 0.9 }));
        addMesh(root, geo("bowlWater", () => {
          const g = new THREE.CircleGeometry(0.4, 24);
          g.rotateX(-Math.PI / 2);
          return g;
        }), bowl, [o.x, 1.58, o.z], null, null, false);
        fountainWater.userData.bowl = bowl;
        fountainLight = new THREE.PointLight("#5fffc0", 6, 7, 1.6);
        fountainLight.position.set(o.x, 1.7, o.z);
        root.add(fountainLight);
        break;
      }
      case "statue": {
        addMesh(root, ownG(worldBox(1.1, 0.7, 1.1, 2)), trimM, [o.x, 0.35, o.z], null, null, shadows);
        const st = group(root, [o.x, 0.7, o.z]);
        st.rotation.y = o.x < 0 ? Math.PI * 0.15 : -Math.PI * 0.15;
        addMesh(st, geo("statueRobe", () => lathe([[0.38, 0], [0.34, 0.6], [0.26, 1.3], [0.3, 1.6], [0.22, 1.8], [0.0, 1.85]], 16)), wallM, null, null, null, shadows);
        addMesh(st, geo("statueHead", () => ellipsoid(0.15, 0.18, 0.16, 12, 10)), wallM, [0, 2.0, 0.02], null, null, false);
        addMesh(st, geo("statueSword", () => new THREE.BoxGeometry(0.08, 1.3, 0.03)), wallM, [0, 0.95, 0.38], null, null, false);
        addMesh(st, geo("statueGuard", () => new THREE.BoxGeometry(0.4, 0.06, 0.06)), wallM, [0, 1.62, 0.38], null, null, false);
        addMesh(st, geo("statueHands", () => ellipsoid(0.16, 0.08, 0.1, 10, 6)), wallM, [0, 1.72, 0.36], null, null, false);
        break;
      }
      case "cells": {
        const x0 = o.side < 0 ? -G.hx : G.hx - 1.25;
        const face = o.side < 0 ? x0 + 1.25 : x0;
        const z0 = -G.hz + 2.4;
        const z1 = G.hz - 2.4;
        const n = Math.floor((z1 - z0) / 0.16);
        const barG = geo("bar", () => new THREE.CylinderGeometry(0.025, 0.025, 3.1, 6));
        const bars = new THREE.InstancedMesh(barG, ironM, n);
        const m4 = new THREE.Matrix4();
        for (let i = 0; i < n; i++) {
          m4.makeTranslation(face, 1.55, z0 + 0.08 + i * 0.16);
          bars.setMatrixAt(i, m4);
        }
        bars.castShadow = shadows;
        root.add(bars);
        own.push({ dispose: () => bars.dispose() });
        for (const y of [0.25, 1.6, 3.0]) addMesh(root, ownG(new THREE.BoxGeometry(0.08, 0.08, z1 - z0)), ironM, [face, y, (z0 + z1) / 2], null, null, false);
        // cell dividers and back
        const cells = Math.max(2, Math.round((z1 - z0) / 2.6));
        for (let i = 0; i <= cells; i++) {
          const z = z0 + ((z1 - z0) * i) / cells;
          addMesh(root, ownG(worldBox(1.25, 3.2, 0.25, 2.8)), wallM, [x0 + 0.625, 1.6, z], null, null, false);
        }
        addMesh(root, ownG(worldBox(1.25, 0.3, z1 - z0 + 0.25, 2.8)), trimM, [x0 + 0.625, 3.35, (z0 + z1) / 2], null, null, false);
        // straw in the cells
        for (let i = 0; i < cells; i++) {
          const z = z0 + ((z1 - z0) * (i + 0.5)) / cells;
          const straw = addMesh(root, geo("straw", () => {
            const g = new THREE.CircleGeometry(0.5, 10);
            g.rotateX(-Math.PI / 2);
            return g;
          }), mat("#a88a4a", 1, 0, { map: patchTexture(), transparent: true, depthWrite: false }), [x0 + 0.62, 0.02, z + (r() - 0.5) * 0.6], null, [1.1, 1, 1.3], false);
          straw.rotation.y = r() * 3;
        }
        break;
      }
      default:
        break;
    }
  }

  /* ---------------------------------------------------------------- chest */
  let chest = null;
  if (W.chest) {
    chest = buildChest(W.chest.kind);
    chest.root.position.set(W.chest.x, 0, W.chest.z);
    chest.root.rotation.y = W.chest.yaw || 0;
    root.add(chest.root);
  }

  /* ---------------------------------------------------------------- torches */
  const torches = [];
  const flameMat = ownM(new THREE.SpriteMaterial({ map: flameTexture(), color: T.flame, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  const haloMat = ownM(new THREE.SpriteMaterial({ map: glowTexture(), color: T.flame, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending }));
  const spots = [];
  const wallX = G.hx - 0.02;
  const wallZ = G.hz - 0.02;
  // side walls: every ~4.5 m (not where cells are)
  const hasCells = G.props.some((p) => p.k === "cells");
  const nSide = Math.max(1, Math.round(G.d / 4.8));
  for (let i = 0; i < nSide; i++) {
    const z = -G.hz + (G.d * (i + 0.5)) / nSide;
    if (hasCells && Math.abs(z) < G.hz - 2.4) continue;
    spots.push([-wallX, z, Math.PI / 2], [wallX, z, -Math.PI / 2]);
  }
  // beside every doorway
  for (const d of G.doors) {
    const north = d.kind === "exit";
    for (const s of [-1, 1]) spots.push([d.x + s * (DOOR_W / 2 + 0.8), north ? wallZ : -wallZ, north ? Math.PI : 0]);
  }
  const lightCap = quality === "high" ? 8 : quality === "medium" ? 5 : 2;
  // the lights go to the torches nearest the room centre line first (most useful)
  const ranked = spots.map((s, i) => ({ s, i, d: Math.abs(s[1]) * 0.6 + Math.abs(s[0]) * 0.2 + (i % 3) * 0.01 }));
  ranked.sort((a, b) => a.d - b.d);
  const lit = new Set(ranked.slice(0, lightCap).map((x) => x.i));
  spots.forEach(([x, z, yaw], i) => {
    const t = group(root, [x, 2.55, z]);
    t.rotation.y = yaw;
    addMesh(t, geo("sconce", () => new THREE.BoxGeometry(0.12, 0.3, 0.12)), ironM, [0, -0.1, 0.06], null, null, false);
    addMesh(t, geo("torchStick", () => new THREE.CylinderGeometry(0.035, 0.025, 0.5, 6)), woodM, [0, 0.08, 0.22], [0.5, 0, 0], null, false);
    addMesh(t, geo("torchCup", () => new THREE.CylinderGeometry(0.07, 0.045, 0.1, 8)), ironM, [0, 0.3, 0.33], [0.5, 0, 0], null, false);
    const flame = new THREE.Sprite(flameMat);
    flame.scale.set(0.32, 0.5, 1);
    flame.position.set(0, 0.52, 0.37);
    t.add(flame);
    const halo = new THREE.Sprite(haloMat);
    halo.scale.set(1.6, 1.6, 1);
    halo.position.set(0, 0.5, 0.37);
    t.add(halo);
    let light = null;
    if (lit.has(i)) {
      light = new THREE.PointLight(T.torch, T.torchI, 11, 1.7);
      light.position.set(0, 0.55, 0.55);
      t.add(light);
    }
    torches.push({ flame, halo, light, seed: r() * 10 });
  });

  /* ---------------------------------------------------------------- decoration */
  const D = T.decor;
  const patchM = (c, o = 0.55) => mat(c, 1, 0, { map: patchTexture(), transparent: true, opacity: o, depthWrite: false });
  const patchG = geo("patch", () => {
    const g = new THREE.PlaneGeometry(1, 1);
    g.rotateX(-Math.PI / 2);
    return g;
  });
  const freeSpot = (margin = 0.8, tries = 12) => {
    for (let k = 0; k < tries; k++) {
      const x = (r() * 2 - 1) * (G.hx - margin);
      const z = (r() * 2 - 1) * (G.hz - margin);
      let ok = true;
      for (const b of G.C.boxes) if (b.on && x > b.x0 - 0.5 && x < b.x1 + 0.5 && z > b.z0 - 0.5 && z < b.z1 + 0.5) ok = false;
      for (const c of G.C.cyls) if ((x - c.x) ** 2 + (z - c.z) ** 2 < (c.r + 0.6) ** 2) ok = false;
      if (W.chest && (x - W.chest.x) ** 2 + (z - W.chest.z) ** 2 < 2) ok = false;
      if (ok) return [x, z];
    }
    return null;
  };
  const edgeSpot = () => {
    // along a wall, away from doors
    for (let k = 0; k < 10; k++) {
      const side = Math.floor(r() * 4);
      let x;
      let z;
      if (side < 2) {
        x = (side ? 1 : -1) * (G.hx - 0.35 - r() * 0.4);
        z = (r() * 2 - 1) * (G.hz - 0.6);
      } else {
        z = (side === 2 ? 1 : -1) * (G.hz - 0.35 - r() * 0.4);
        x = (r() * 2 - 1) * (G.hx - 0.6);
        if (G.doors.some((d) => Math.abs(d.x - x) < DOOR_W) ) continue;
      }
      return [x, z];
    }
    return null;
  };
  // floor patches (moss / frost / ash / grime)
  const patchColor = D.moss ? "#4f7a32" : D.frost ? "#e8f6ff" : D.lava ? "#1a1210" : D.fogFloor ? "#2a2440" : "#3a3028";
  const nPatch = Math.round((6 + (D.moss || D.frost || 0) * 8) * deco);
  for (let i = 0; i < nPatch; i++) {
    const sp = edgeSpot() || freeSpot();
    if (!sp) continue;
    const s = 0.8 + r() * 1.8;
    const m = addMesh(root, patchG, patchM(patchColor, 0.4 + r() * 0.3), [sp[0], 0.012 + i * 0.0004, sp[1]], [0, r() * 6, 0], [s, 1, s * (0.6 + r() * 0.6)], false);
    m.renderOrder = 1;
  }
  // rubble (instanced)
  const nRub = Math.round(26 * (D.rubble || 0.5) * deco);
  if (nRub) {
    const rubG = geo("rubble", () => new THREE.DodecahedronGeometry(0.1, 0));
    const rub = new THREE.InstancedMesh(rubG, mat(T.trim, 0.95, 0, { flat: true }), nRub);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    for (let i = 0; i < nRub; i++) {
      const sp = edgeSpot() || [0, G.hz - 0.4];
      const s = 0.5 + r() * 1.6;
      e.set(r() * 3, r() * 3, r() * 3);
      q.setFromEuler(e);
      m4.compose(new THREE.Vector3(sp[0], 0.05 * s, sp[1]), q, new THREE.Vector3(s, s * 0.7, s));
      rub.setMatrixAt(i, m4);
    }
    rub.castShadow = false;
    rub.receiveShadow = shadows;
    root.add(rub);
    own.push({ dispose: () => rub.dispose() });
  }
  // bones
  if (D.bones) {
    const nb = Math.round(5 * D.bones * deco);
    for (let i = 0; i < nb; i++) {
      const sp = edgeSpot();
      if (!sp) continue;
      const b = group(root, [sp[0], 0.04, sp[1]]);
      b.rotation.y = r() * 6;
      addMesh(b, geo("boneLong", () => new THREE.CylinderGeometry(0.025, 0.025, 0.42, 6)), mat("#d8d0b8", 0.8), [0, 0, 0], [Math.PI / 2, 0, 0.3], null, false);
      addMesh(b, geo("boneEnd", () => new THREE.SphereGeometry(0.04, 6, 5)), mat("#d8d0b8", 0.8), [0.06, 0, 0.2], null, null, false);
      if (r() < 0.4) addMesh(b, geo("skullDeco", () => ellipsoid(0.1, 0.09, 0.11, 10, 8)), mat("#d8d0b8", 0.8), [0.2, 0.05, -0.1], null, null, false);
    }
  }
  // hanging chains
  if (D.chains) {
    const linkG = geo("chainLink", () => new THREE.TorusGeometry(0.05, 0.014, 4, 10));
    const nc = Math.round(4 * deco);
    for (let i = 0; i < nc; i++) {
      const sp = freeSpot(1.6);
      if (!sp) continue;
      const len = 6 + Math.floor(r() * 8);
      for (let k = 0; k < len; k++) addMesh(root, linkG, ironM, [sp[0], WALL_H - 0.1 - k * 0.085, sp[1]], [0, k % 2 ? Math.PI / 2 : 0, Math.PI / 2], null, false);
      if (r() < 0.5) addMesh(root, geo("shackle", () => new THREE.TorusGeometry(0.1, 0.022, 5, 14)), ironM, [sp[0], WALL_H - 0.1 - len * 0.085 - 0.08, sp[1]], [0, 0, 0], null, false);
    }
  }
  // ceiling beams
  if (D.beams) {
    const n = Math.max(2, Math.round(G.d / 3.5));
    for (let i = 0; i < n; i++) addMesh(root, ownG(new THREE.BoxGeometry(G.w + WALL_T * 2, 0.36, 0.42)), woodM, [0, WALL_H - 0.6, -G.hz + (G.d * (i + 0.5)) / n], null, null, false);
  }
  // roots creeping down the walls (crypt)
  if (D.roots) {
    const rootM = mat("#4a3a26", 0.95);
    const nr = Math.round(8 * deco);
    for (let i = 0; i < nr; i++) {
      const sp = edgeSpot();
      if (!sp) continue;
      const pts = [];
      let x = sp[0];
      let z = sp[1];
      for (let k = 0; k < 6; k++) {
        pts.push(new THREE.Vector3(x, WALL_H - k * 0.9, z));
        x += (r() - 0.5) * 0.4;
        z += (r() - 0.5) * 0.4;
      }
      pts.push(new THREE.Vector3(x + (r() - 0.5), 0.05, z + (r() - 0.5)));
      const tube = ownG(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 20, 0.05 + r() * 0.05, 5));
      addMesh(root, tube, rootM, null, null, null, false);
    }
  }
  // puddles (crypt)
  if (D.puddles) {
    const pm = ownM(new THREE.MeshStandardMaterial({ color: "#16201a", roughness: 0.05, metalness: 0.6, transparent: true, opacity: 0.75 }));
    for (let i = 0; i < Math.round(4 * deco); i++) {
      const sp = freeSpot(1.2);
      if (!sp) continue;
      const pd = addMesh(root, geo("puddle2", () => {
        const g = new THREE.CircleGeometry(0.7, 20);
        g.rotateX(-Math.PI / 2);
        return g;
      }), pm, [sp[0], 0.014, sp[1]], [0, r() * 6, 0], [1 + r(), 1, 0.6 + r() * 0.6], false);
      pd.receiveShadow = shadows;
    }
  }
  // ice crystals + icicles (frozen)
  if (D.crystals) {
    const cm = mat("#cdeeff", 0.12, 0.1, { emissive: "#5fc8ff", emissiveIntensity: 0.35, transparent: true, opacity: 0.85 });
    for (let i = 0; i < Math.round(7 * deco); i++) {
      const sp = edgeSpot();
      if (!sp) continue;
      const cl = group(root, [sp[0], 0, sp[1]]);
      for (let k = 0; k < 4; k++) {
        const h = 0.4 + r() * 1.1;
        addMesh(cl, geo("iceShard", () => new THREE.OctahedronGeometry(0.2, 0)), cm, [(r() - 0.5) * 0.5, h * 0.4, (r() - 0.5) * 0.5], [(r() - 0.5) * 0.6, r() * 3, (r() - 0.5) * 0.6], [0.5 + r() * 0.4, h * 2, 0.5 + r() * 0.4], false);
      }
    }
  }
  if (D.icicles) {
    const im = mat("#dff4ff", 0.1, 0.1, { transparent: true, opacity: 0.8 });
    for (let i = 0; i < Math.round(30 * deco); i++) {
      const sp = edgeSpot();
      if (!sp) continue;
      const len = 0.2 + r() * 0.6;
      addMesh(root, geo("icicle", () => new THREE.ConeGeometry(0.05, 1, 5)), im, [sp[0], WALL_H - 0.45 - len / 2, sp[1]], [Math.PI, 0, 0], [1, len, 1], false);
    }
  }
  // lava cracks + ember glow (ember)
  let lava = null;
  if (D.lava) {
    const lm = ownM(new THREE.MeshBasicMaterial({ map: crackTexture(), color: "#ff6a1a", transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    const lg = ownG(new THREE.PlaneGeometry(G.w, G.d));
    lg.rotateX(-Math.PI / 2);
    const luv = lg.attributes.uv;
    for (let i = 0; i < luv.count; i++) luv.setXY(i, (luv.getX(i) * G.w) / 9, (luv.getY(i) * G.d) / 9);
    lava = addMesh(root, lg, lm, [0, 0.016, 0], null, null, false);
    lava.renderOrder = 1;
  }
  // banners (shadow keep)
  if (D.banners) {
    const bm = mat("#3a2266", 0.85, 0, { side: THREE.DoubleSide });
    const em = mat("#c9a45a", 0.5, 0.6, { side: THREE.DoubleSide });
    const nB = Math.max(2, Math.round(G.d / 5));
    for (let i = 0; i < nB; i++) {
      const z = -G.hz + (G.d * (i + 0.5)) / nB;
      for (const s of [-1, 1]) {
        if (hasCells) continue;
        const b = group(root, [s * (G.hx - 0.06), 3.0, z + 1.2]);
        b.rotation.y = -s * Math.PI / 2;
        addMesh(b, geo("banner", () => {
          const g = new THREE.PlaneGeometry(0.9, 2.2, 1, 6);
          const p = g.attributes.position;
          for (let k = 0; k < p.count; k++) if (p.getY(k) < -1.0) p.setY(k, p.getY(k) - (Math.abs(p.getX(k)) < 0.01 ? 0 : 0.0) + (p.getX(k) === 0 ? -0.25 : 0));
          return g;
        }), bm, [0, 0, 0.03], null, null, false);
        addMesh(b, geo("bannerSigil", () => new THREE.CircleGeometry(0.22, 5)), em, [0, 0.3, 0.04], null, null, false);
        addMesh(b, geo("bannerRod", () => new THREE.CylinderGeometry(0.03, 0.03, 1.1, 6)), steel("#c9a45a", 0.4), [0, 1.12, 0.05], [0, 0, Math.PI / 2], null, false);
      }
    }
  }
  // moonlight beams (shadow keep)
  const beams = [];
  if (D.moonbeams) {
    const mb = ownM(new THREE.MeshBasicMaterial({ color: "#9fb0ff", transparent: true, opacity: 0.07, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    for (let i = 0; i < 3; i++) {
      const sp = freeSpot(2);
      if (!sp) continue;
      const beam = addMesh(root, geo("moonbeam", () => {
        const g = new THREE.CylinderGeometry(0.6, 1.4, WALL_H, 16, 1, true);
        return g;
      }), mb, [sp[0], WALL_H / 2, sp[1]], [0.18, 0, 0.1], null, false);
      beams.push(beam);
      const pool = addMesh(root, patchG, ownM(new THREE.MeshBasicMaterial({ map: glowTexture(), color: "#7f8fff", transparent: true, opacity: 0.25, depthWrite: false, blending: THREE.AdditiveBlending })), [sp[0] + 0.45, 0.02, sp[1] - 0.25], null, [3, 1, 3], false);
      pool.renderOrder = 1;
    }
  }
  // cobwebs in the upper corners
  if (D.cobweb) {
    const wm = mat("#d8d4cc", 1, 0, { transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false });
    for (const [x, z, yaw] of [[-G.hx, -G.hz, Math.PI / 4], [G.hx, -G.hz, -Math.PI / 4], [-G.hx, G.hz, Math.PI * 0.75], [G.hx, G.hz, -Math.PI * 0.75]]) {
      const web = addMesh(root, geo("web", () => {
        const g = new THREE.CircleGeometry(1.1, 8, 0, Math.PI / 2);
        return g;
      }), wm, [x, WALL_H - 0.4, z], null, null, false);
      web.rotation.set(0, yaw + Math.PI, Math.PI * 0.75);
    }
  }

  /* ---------------------------------------------------------------- dust motes */
  let motes = null;
  if (quality !== "low") {
    const n = quality === "high" ? 160 : 90;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (r() * 2 - 1) * G.hx;
      pos[i * 3 + 1] = 0.3 + r() * 3.5;
      pos[i * 3 + 2] = (r() * 2 - 1) * G.hz;
    }
    const mg = ownG(new THREE.BufferGeometry());
    mg.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const pm = ownM(new THREE.PointsMaterial({ color: D.ash ? "#ff9a5a" : D.frost ? "#e8f8ff" : T.flame, size: D.ash ? 0.05 : 0.03, map: glowTexture(), transparent: true, opacity: D.ash ? 0.8 : 0.5, depthWrite: false, blending: THREE.AdditiveBlending }));
    motes = new THREE.Points(mg, pm);
    motes.userData.base = pos.slice();
    root.add(motes);
  }

  /* ---------------------------------------------------------------- update */
  function update(Wd, time, dt) {
    for (const t of torches) {
      const f = 0.85 + Math.sin(time * 11 + t.seed) * 0.06 + Math.sin(time * 23.7 + t.seed * 3) * 0.05 + Math.sin(time * 5.3 + t.seed) * 0.04;
      t.flame.scale.set(0.3 * f, 0.5 * (0.9 + (f - 0.85) * 2), 1);
      t.halo.material.opacity = 0.3;
      if (t.light) t.light.intensity = T.torchI * f;
    }
    for (const dv of doorViews) {
      const k = dv.d.openK;
      const ang = k * 1.45;
      // exits swing out into their alcove; the entry swings into the room
      // (the knight starts in its alcove) and shuts behind him
      for (const L of dv.leaves) L.hinge.rotation.y = L.s * ang;
      if (dv.symbol) dv.symbol.material.opacity = 0.35 + k * 0.65 + (k > 0.9 ? Math.sin(time * 3) * 0.08 : 0);
    }
    if (chest) chest.update(Wd.chest, time, dt);
    if (fountainWater) {
      const used = Wd.shrine && Wd.shrine.used;
      fountainWater.material.emissiveIntensity += ((used ? 0.08 : 0.9 + Math.sin(time * 2) * 0.15) - fountainWater.material.emissiveIntensity) * (1 - Math.exp(-3 * dt));
      fountainWater.userData.bowl.emissiveIntensity = fountainWater.material.emissiveIntensity * 1.3;
      if (fountainLight) fountainLight.intensity = used ? 0.6 : 6 + Math.sin(time * 2) * 0.8;
      fountainWater.material.color.set(used ? "#2a4a44" : "#3fd8a0");
    }
    if (lava) lava.material.opacity = 0.75 + Math.sin(time * 1.3) * 0.2;
    for (const b of beams) b.material.opacity = 0.06 + Math.sin(time * 0.7) * 0.015;
    if (motes) {
      const p = motes.geometry.attributes.position;
      const base = motes.userData.base;
      for (let i = 0; i < p.count; i++) {
        const k = i * 3;
        p.array[k] = base[k] + Math.sin(time * 0.3 + i) * 0.3;
        p.array[k + 1] = D.ash ? ((base[k + 1] + time * 0.35 + i * 0.1) % 4.2) + 0.2 : base[k + 1] + Math.sin(time * 0.4 + i * 1.7) * 0.25;
        p.array[k + 2] = base[k + 2] + Math.cos(time * 0.25 + i) * 0.3;
      }
      p.needsUpdate = true;
    }
  }

  function dispose() {
    root.removeFromParent();
    if (chest) chest.dispose();
    for (const o of own) o.dispose();
    root.traverse((o) => {
      if (o.isLight && o.dispose) o.dispose();
    });
  }

  return { group: root, update, dispose, torches, chest, doors: doorViews };
}

/* ================================================================== chest */
export function buildChest(kind) {
  const root = new THREE.Group();
  const lift = group(root);
  const fancy = kind === "elite" || kind === "boss";
  const wood = mat(fancy ? "#5a2f2a" : "#7a5232", 0.8, 0, { map: woodTexture() });
  const metal = steel(fancy ? "#d9b45a" : "#8f8a80", 0.35);
  addMesh(lift, geo("chestBase", () => rbox(1.0, 0.5, 0.66, 0.03)), wood, [0, 0.25, 0]);
  for (const x of [-0.42, 0.42]) addMesh(lift, geo("chestBand", () => new THREE.BoxGeometry(0.08, 0.52, 0.7)), metal, [x, 0.25, 0], null, null, false);
  addMesh(lift, geo("chestLock", () => rbox(0.14, 0.16, 0.06, 0.01)), metal, [0, 0.42, 0.34], null, null, false);
  const lid = group(lift, [0, 0.5, -0.33]);
  addMesh(lid, geo("chestLid", () => {
    const g = new THREE.CylinderGeometry(0.33, 0.33, 1.0, 16, 1, false, 0, Math.PI);
    g.rotateZ(Math.PI / 2);
    g.rotateX(Math.PI / 2);
    g.translate(0, 0, 0.33);
    return g;
  }), wood, null, null, null, true);
  for (const x of [-0.42, 0.42]) addMesh(lid, geo("lidBand", () => {
    const g = new THREE.TorusGeometry(0.335, 0.035, 4, 12, Math.PI);
    g.rotateY(Math.PI / 2);
    g.translate(0, 0, 0.33);
    return g;
  }), metal, [x, 0, 0], null, null, false);
  // the treasure glow inside
  const glowM = new THREE.MeshBasicMaterial({ map: glowTexture(), color: "#ffcf5a", transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  const shine = addMesh(lift, geo("chestShine", () => new THREE.PlaneGeometry(1.6, 1.6)), glowM, [0, 0.55, 0], [-Math.PI / 2, 0, 0], null, false);
  const gold = addMesh(lift, geo("chestGold", () => {
    const g = new THREE.CylinderGeometry(0.42, 0.44, 0.08, 16);
    g.scale(1, 1, 0.66);
    return g;
  }), glow("#ffc94a", 1.1), [0, 0.46, 0], null, null, false);
  gold.visible = false;
  const light = new THREE.PointLight("#ffc95a", 0, 5, 1.8);
  light.position.set(0, 1.0, 0.2);
  lift.add(light);
  let openT = 0;
  return {
    root,
    update(c, time, dt) {
      if (!c) return;
      root.visible = c.state !== "hidden";
      // rising out of the floor when it appears
      const rise = c.state === "closed" ? Math.min(1, c.t) : 1;
      lift.position.y = -(1 - rise) * 0.8;
      lift.rotation.y = (1 - rise) * 1.2;
      const opening = c.state === "opening" || c.state === "open";
      if (opening) openT = Math.min(1, openT + dt / 0.55);
      lid.rotation.x = -openT * 1.9;
      gold.visible = openT > 0.2;
      glowM.opacity = openT * (0.75 + Math.sin(time * 3) * 0.1);
      light.intensity = openT * (5 + Math.sin(time * 4) * 0.8) + (c.state === "closed" && rise >= 1 ? 1.5 + Math.sin(time * 3) * 0.6 : 0);
    },
    dispose() {
      glowM.dispose();
      light.dispose();
    },
  };
}
