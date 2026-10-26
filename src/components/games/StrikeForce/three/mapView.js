/**
 * Strike Force — builds the visual map from map data (engine/maps/*).
 * Colliders are decorated by kind (containers get frames and doors, walls
 * get trims, vehicles become full models …), props add the dressing.
 * Everything static is merged by the batcher; only animated things (water,
 * gantry trolley lights, weather) stay separate.
 */
import * as THREE from "three";
import { boxMinMax, boxFaceUV, createBatcher, extrude, paint, place, projectUV, paintGradient } from "./geo.js";
import { vehicleParts } from "./vehicles.js";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { canvasTexture, radialTexture } from "./textures.js";
import { hash2 } from "../engine/maps/build.js";
import { install as installProps } from "./mapProps.js";

const darker = (hex, k = 0.7) => "#" + new THREE.Color(hex || "#888888").multiplyScalar(k).getHexString();

export function buildMapView(map, lib, { quality = "medium", theme = {} } = {}) {
  const group = new THREE.Group();
  group.name = "map";
  const B = createBatcher({ chunk: 24 });
  const lowQ = quality === "low";
  const hiQ = quality === "high";
  const night = !!theme.night;
  const animated = [];
  const lightSpots = []; // candidate positions for real point lights
  const glowSprites = [];
  const M = (id, style = "office") => (typeof id === "string" ? lib.get(id, id === "facade" ? `${style}|${night ? "night" : ""}` : "") : id);
  const add = (g, m, o = {}) => {
    if (o.glow) {
      B.add(g, lib.glow(o.glow, o.gi ?? 2.2), { shadow: false, receive: false });
      return;
    }
    B.add(g, M(m), { color: o.c, shadow: o.shadow, receive: o.receive, jitter: o.jitter });
  };
  const addParts = (parts, x, y, z, ry = 0, s = 1) => {
    for (const p of parts) {
      place(p.g, x, y, z, 0, ry, 0, s);
      if (p.glow) add(p.g, null, { glow: p.glow, gi: p.gi });
      else add(p.g, p.m, { c: p.c, shadow: p.shadow });
    }
  };
  const rotY = (rot) => [0, -Math.PI / 2, Math.PI, Math.PI / 2][rot & 3];
  const aoBoxes = [];

  /* ------------------------------------------------------------ ground */
  const { minX, maxX, minZ, maxZ } = map.bounds;
  const outerPad = 160;
  {
    const base = new THREE.PlaneGeometry(maxX - minX + outerPad * 2, maxZ - minZ + outerPad * 2, 1, 1);
    base.rotateX(-Math.PI / 2);
    base.translate((minX + maxX) / 2, 0, (minZ + maxZ) / 2);
    projectUV(base, lib.def(theme.outer || theme.base || "concrete").scale || 4);
    const mesh = new THREE.Mesh(paint(base, "#ffffff"), M(theme.outer || theme.base || "concrete"));
    mesh.receiveShadow = true;
    mesh.name = "groundBase";
    if (map.groundClip) mesh.visible = false;
    group.add(mesh);
  }
  map.ground.forEach((p, i) => {
    const g = new THREE.PlaneGeometry(p.x1 - p.x0, p.z1 - p.z0);
    g.rotateX(-Math.PI / 2);
    g.translate((p.x0 + p.x1) / 2, 0.004 + i * 0.0015, (p.z0 + p.z1) / 2);
    projectUV(g, lib.def(p.m).scale || 4);
    B.add(g, M(p.m), { shadow: false, color: p.c });
    if (p.lines) roadLines(p);
  });

  function roadLines(p) {
    const y = 0.02;
    const white = lib.plain("#d8d6cf", { rough: 0.7 });
    if (p.lines === "x") {
      const zc = (p.z0 + p.z1) / 2;
      for (let x = p.x0 + 1; x < p.x1 - 2; x += 6) B.add(boxMinMax(x, y - 0.01, zc - 0.08, x + 3, y, zc + 0.08), white, { shadow: false });
      for (const z of [p.z0 + 0.35, p.z1 - 0.35]) B.add(boxMinMax(p.x0, y - 0.01, z - 0.06, p.x1, y, z + 0.06), white, { shadow: false });
    } else if (p.lines === "z") {
      const xc = (p.x0 + p.x1) / 2;
      for (let z = p.z0 + 1; z < p.z1 - 2; z += 6) B.add(boxMinMax(xc - 0.08, y - 0.01, z, xc + 0.08, y, z + 3), white, { shadow: false });
      for (const x of [p.x0 + 0.35, p.x1 - 0.35]) B.add(boxMinMax(x - 0.06, y - 0.01, p.z0, x + 0.06, y, p.z1), white, { shadow: false });
    }
  }

  /* ------------------------------------------------------------ kinds */
  const KIND = {
    block(b) {
      add(boxMinMax(b.x0, b.y0, b.z0, b.x1, b.y1, b.z1, lib.def(b.m).scale || 2), b.m, { c: b.c });
      if (b.y0 < 0.05) aoBoxes.push(b);
    },
    step(b) {
      add(boxMinMax(b.x0, b.y0, b.z0, b.x1, b.y1, b.z1, lib.def(b.m).scale || 2), b.m, { c: b.c });
      add(boxMinMax(b.x0 - 0.01, b.y1 - 0.04, b.z0 - 0.01, b.x1 + 0.01, b.y1 + 0.005, b.z1 + 0.01), "steel", { c: "#d8b23a" });
    },
    wall(b) {
      const s = lib.def(b.m).scale || 3;
      add(boxMinMax(b.x0, b.y0, b.z0, b.x1, b.y1, b.z1, s), b.m, { c: b.c });
      // base skirting + cap
      if (b.y0 < 0.05 && b.y1 > 1.5 && b.s !== "warehouse") {
        const ax = b.x1 - b.x0 > b.z1 - b.z0;
        const pad = 0.025;
        add(boxMinMax(b.x0 - (ax ? 0 : pad), 0, b.z0 - (ax ? pad : 0), b.x1 + (ax ? 0 : pad), 0.28, b.z1 + (ax ? pad : 0), 2), "concreteDark");
      }
      if (b.y0 < 0.05) aoBoxes.push(b);
    },
    roof(b) {
      add(boxMinMax(b.x0, b.y0, b.z0, b.x1, b.y1, b.z1, 3), b.m, { c: b.c });
      if (b.s === "tower" || b.s === "shed") return;
      // parapet
      const t = 0.16;
      const h = b.y1 + 0.45;
      const m = b.m === "metalRoof" ? "steel" : "concreteDark";
      add(boxMinMax(b.x0, b.y1, b.z0, b.x1, h, b.z0 + t, 2), m);
      add(boxMinMax(b.x0, b.y1, b.z1 - t, b.x1, h, b.z1, 2), m);
      add(boxMinMax(b.x0, b.y1, b.z0 + t, b.x0 + t, h, b.z1 - t, 2), m);
      add(boxMinMax(b.x1 - t, b.y1, b.z0 + t, b.x1, h, b.z1 - t, 2), m);
      // rooftop clutter
      const w = b.x1 - b.x0;
      const d = b.z1 - b.z0;
      if (w > 5 && d > 4) {
        const hx = b.x0 + w * (0.25 + hash2(b.x0, b.z0) * 0.3);
        const hz = b.z0 + d * 0.35;
        add(boxMinMax(hx, b.y1, hz, hx + 1.2, b.y1 + 0.8, hz + 0.9, 1.5), "paintedMetal", { c: "#b5b9bb" });
        add(place(new THREE.CylinderGeometry(0.3, 0.3, 0.05, 16), hx + 0.6, b.y1 + 0.83, hz + 0.45), "darkMetal");
        if (w > 9) add(place(new THREE.CylinderGeometry(0.12, 0.12, 1.4, 8), b.x1 - 1.2, b.y1 + 0.7, b.z1 - 1.2), "steel");
      }
    },
    facade(b) {
      const w = b.x1 - b.x0;
      const d = b.z1 - b.z0;
      const h = b.y1 - b.y0;
      if (b.s === "warehouse") {
        add(boxMinMax(b.x0, 0, b.z0, b.x1, h, b.z1, 4), "corrugatedWall", { c: b.c });
        // gable roof edge + gutters
        add(boxMinMax(b.x0 - 0.2, h, b.z0 - 0.2, b.x1 + 0.2, h + 0.25, b.z1 + 0.2, 3), "metalRoof");
        // big doors on the long faces
        const faceZ = b.z1;
        for (let x = b.x0 + 3.5; x < b.x1 - 3; x += 7.5) {
          add(boxMinMax(x, 0, faceZ, x + 4.2, 4.6, faceZ + 0.06, 2), "corrugated", { c: "#c9ccce" });
          add(boxMinMax(x - 0.2, 4.6, faceZ, x + 4.4, 5.0, faceZ + 0.25, 2), "steel");
          add(boxMinMax(x - 0.15, 0, faceZ, x, 4.6, faceZ + 0.12, 2), "steel", { c: "#d0a12c" });
          add(boxMinMax(x + 4.2, 0, faceZ, x + 4.35, 4.6, faceZ + 0.12, 2), "steel", { c: "#d0a12c" });
          lightSpots.push({ x: x + 2.1, y: 5.3, z: faceZ + 0.6, color: "#ffd9a0", wall: true });
          lamp(x + 2.1, 5.25, faceZ + 0.35, 0, true);
        }
        add(boxMinMax(b.x0 + 0.5, h * 0.72, faceZ, b.x1 - 0.5, h * 0.72 + 0.6, faceZ + 0.05, 2), "glass");
        signBoard(b, faceZ + 0.08, h);
      } else {
        const g = new THREE.BoxGeometry(w, h, d);
        g.translate((b.x0 + b.x1) / 2, h / 2, (b.z0 + b.z1) / 2);
        facadeUV(g, (b.bay || 3) * 4, (b.floor || 3.2) * 4);
        B.add(g, M("facade", b.s), { color: b.c || "#ffffff" });
        add(boxMinMax(b.x0 - 0.12, 0, b.z0 - 0.12, b.x1 + 0.12, 1.1, b.z1 + 0.12, 2), "concreteDark");
        KIND.roof({ ...b, y0: h, y1: h + 0.2, m: "concrete" });
      }
      aoBoxes.push(b);
    },
    container(b) {
      const ax = b.rot % 2 === 0;
      const c = b.c || "#a6402e";
      const fr = darker(c, 0.62);
      const L = ax ? b.x1 - b.x0 : b.z1 - b.z0;
      const W = ax ? b.z1 - b.z0 : b.x1 - b.x0;
      const H = b.y1 - b.y0;
      const loc = (a0, a1, w0, w1, y0, y1, m, col, s = 2.6) => {
        const cxm = (b.x0 + b.x1) / 2;
        const czm = (b.z0 + b.z1) / 2;
        if (ax) add(boxMinMax(cxm + a0, b.y0 + y0, czm + w0, cxm + a1, b.y0 + y1, czm + w1, s), m, { c: col });
        else add(boxMinMax(cxm + w0, b.y0 + y0, czm + a0, cxm + w1, b.y0 + y1, czm + a1, s), m, { c: col });
      };
      const hl = L / 2;
      const hw = W / 2;
      loc(-hl + 0.1, hl - 0.1, -hw + 0.04, hw - 0.04, 0.12, H - 0.12, "corrugated", c);
      // frame: corner posts, rails
      for (const a of [-hl, hl - 0.16]) for (const w of [-hw, hw - 0.16]) loc(a, a + 0.16, w, w + 0.16, 0, H, "paintedMetal", fr, 1);
      for (const w of [-hw, hw - 0.12]) {
        loc(-hl, hl, w, w + 0.12, 0, 0.14, "paintedMetal", fr, 1);
        loc(-hl, hl, w, w + 0.12, H - 0.14, H, "paintedMetal", fr, 1);
      }
      for (const a of [-hl, hl - 0.12]) {
        loc(a, a + 0.12, -hw, hw, 0, 0.14, "paintedMetal", fr, 1);
        loc(a, a + 0.12, -hw, hw, H - 0.14, H, "paintedMetal", fr, 1);
      }
      // doors on one end: lock rods + seam
      const end = hash2(b.x0, b.z0) > 0.5 ? 1 : -1;
      const ea = end > 0 ? hl - 0.1 : -hl + 0.06;
      loc(ea, ea + 0.04, -hw + 0.12, hw - 0.12, 0.14, H - 0.14, "paintedMetal", darker(c, 0.85), 1);
      for (const w of [-0.8, -0.4, 0.4, 0.8]) {
        const cxm = (b.x0 + b.x1) / 2 + (ax ? ea + (end > 0 ? 0.07 : -0.03) : w * hw);
        const czm = (b.z0 + b.z1) / 2 + (ax ? w * hw : ea + (end > 0 ? 0.07 : -0.03));
        add(place(new THREE.CylinderGeometry(0.025, 0.025, H - 0.3, 6), cxm, b.y0 + H / 2, czm), "steel");
      }
      loc(ea, ea + 0.06, -0.015, 0.015, 0.14, H - 0.14, "darkMetal", null, 1);
      if (b.y0 < 0.05) aoBoxes.push(b);
    },
    crate(b) {
      const m = b.m === "crateMetal" ? "crateMetal" : "crateWood";
      if (m === "crateWood") add(boxFaceUV(b.x0, b.y0, b.z0, b.x1, b.y1, b.z1), m, { c: b.c || "#ffffff" });
      else {
        add(boxMinMax(b.x0 + 0.03, b.y0, b.z0 + 0.03, b.x1 - 0.03, b.y1 - 0.03, b.z1 - 0.03, 1.3), m, { c: b.c });
        // ribs + lid
        add(boxMinMax(b.x0, b.y1 - 0.08, b.z0, b.x1, b.y1, b.z1, 1), "darkMetal");
        add(boxMinMax(b.x0, b.y0, b.z0, b.x1, b.y0 + 0.08, b.z1, 1), "darkMetal");
        for (const t of [0.25, 0.75]) {
          const x = b.x0 + (b.x1 - b.x0) * t;
          add(boxMinMax(x - 0.04, b.y0, b.z0 - 0.015, x + 0.04, b.y1, b.z1 + 0.015, 1), "darkMetal");
        }
      }
      if (b.y0 < 0.05) aoBoxes.push(b);
    },
    pallet(b) {
      const ax = b.x1 - b.x0 >= b.z1 - b.z0;
      const L0 = ax ? b.x0 : b.z0;
      const L1 = ax ? b.x1 : b.z1;
      const n = 7;
      for (let k = 0; k < n; k++) {
        const t0 = L0 + ((L1 - L0) * k) / n + 0.02;
        const t1 = t0 + (L1 - L0) / n - 0.06;
        if (ax) add(boxMinMax(t0, b.y1 - 0.04, b.z0, t1, b.y1, b.z1, 1), "wood");
        else add(boxMinMax(b.x0, b.y1 - 0.04, t0, b.x1, b.y1, t1, 1), "wood");
      }
      for (const t of [0.08, 0.5, 0.92]) {
        if (ax) {
          const z = b.z0 + (b.z1 - b.z0) * t;
          add(boxMinMax(b.x0, b.y0, z - 0.06, b.x1, b.y1 - 0.04, z + 0.06, 1), "woodDark");
        } else {
          const x = b.x0 + (b.x1 - b.x0) * t;
          add(boxMinMax(x - 0.06, b.y0, b.z0, x + 0.06, b.y1 - 0.04, b.z1, 1), "woodDark");
        }
      }
    },
    barrier(b) {
      const ax = b.x1 - b.x0 >= b.z1 - b.z0;
      const L = ax ? b.x1 - b.x0 : b.z1 - b.z0;
      const W = ax ? b.z1 - b.z0 : b.x1 - b.x0;
      const H = b.y1 - b.y0;
      const hw = W / 2;
      const g = extrude(
        [
          [-hw, 0],
          [hw, 0],
          [hw, 0.08],
          [hw * 0.36, 0.3],
          [hw * 0.3, H],
          [-hw * 0.3, H],
          [-hw * 0.36, 0.3],
          [-hw, 0.08],
        ],
        L - 0.04,
      );
      // profile is in x/y, extruded along z → rotate so length runs along the box
      if (ax) g.rotateY(Math.PI / 2);
      g.translate((b.x0 + b.x1) / 2, b.y0, (b.z0 + b.z1) / 2);
      projectUV(g, 2);
      add(g, b.m || "concrete", { c: b.c });
      // hazard stripe band
      if (b.m !== "concreteDark") {
        const s = ax ? boxMinMax(b.x0 + 0.1, H - 0.18, b.z0 + hw * 0.66, b.x1 - 0.1, H - 0.08, b.z1 - hw * 0.66) : boxMinMax(b.x0 + hw * 0.66, H - 0.18, b.z0 + 0.1, b.x1 - hw * 0.66, H - 0.08, b.z1 - 0.1);
        add(s, "paintedMetal", { c: "#c9a227" });
      }
      aoBoxes.push(b);
    },
    sandbag(b) {
      const ax = b.x1 - b.x0 >= b.z1 - b.z0;
      const L = ax ? b.x1 - b.x0 : b.z1 - b.z0;
      const W = ax ? b.z1 - b.z0 : b.x1 - b.x0;
      const H = b.y1 - b.y0;
      const rows = Math.max(3, Math.round(H / 0.19));
      const bagL = 0.58;
      const n = Math.max(1, Math.round(L / bagL));
      const step = L / n;
      const geos = [];
      for (let r = 0; r < rows; r++) {
        const off = r % 2 ? step / 2 : 0;
        const shrink = (r / rows) * W * 0.18;
        for (let k = 0; k < n + (r % 2 ? -1 : 0); k++) {
          const a = -L / 2 + off + step * (k + 0.5);
          for (const wv of W > 0.7 ? [-W / 4 + shrink / 2, W / 4 - shrink / 2] : [0]) {
            const g = new THREE.SphereGeometry(0.5, lowQ ? 6 : 8, lowQ ? 4 : 5);
            const sx = step * 1.04;
            const sy = (H / rows) * 1.3;
            const sz = W > 0.7 ? W / 2 - shrink / 2 + 0.04 : W;
            const j = hash2(a + r, wv) * 0.12;
            if (ax) place(g, (b.x0 + b.x1) / 2 + a, b.y0 + (H / rows) * (r + 0.5), (b.z0 + b.z1) / 2 + wv, 0, j, 0, sx, sy, sz);
            else place(g, (b.x0 + b.x1) / 2 + wv, b.y0 + (H / rows) * (r + 0.5), (b.z0 + b.z1) / 2 + a, 0, j + Math.PI / 2, 0, sx, sy, sz);
            projectUV(g, 0.9);
            geos.push(g);
          }
        }
      }
      for (const g of geos) add(g, "sandbag", { jitter: 0.12 });
      aoBoxes.push(b);
    },
    hesco(b) {
      add(boxFaceUV(b.x0, b.y0, b.z0, b.x1, b.y1 - 0.05, b.z1), "hesco");
      add(boxMinMax(b.x0 + 0.05, b.y1 - 0.08, b.z0 + 0.05, b.x1 - 0.05, b.y1, b.z1 - 0.05, 3), "sand");
      aoBoxes.push(b);
    },
    vehicle(b) {
      const parts = vehicleParts(b.s, b.wreck ? "#5a4636" : b.c);
      if (b.wreck)
        for (const p of parts) {
          if (p.m === "glass") p.m = "darkMetal";
          if (p.glow) {
            p.glow = null;
            p.m = "darkMetal";
          }
          if (p.m === "vehicle") p.m = "paintedMetal";
        }
      addParts(parts, (b.x0 + b.x1) / 2, b.y0, (b.z0 + b.z1) / 2, rotY(b.rot));
      aoBoxes.push({ ...b, pad: 0.45 });
    },
    barrel(b) {
      const cx = (b.x0 + b.x1) / 2;
      const cz = (b.z0 + b.z1) / 2;
      const r = (b.x1 - b.x0) / 2;
      const h = b.y1 - b.y0;
      const g = new THREE.CylinderGeometry(r * 0.97, r * 0.97, h - 0.02, lowQ ? 10 : 16);
      place(g, cx, b.y0 + h / 2, cz);
      projectUV(g, 1);
      add(g, "barrel", { c: b.c });
      for (const t of [0.2, 0.5, 0.8]) add(place(new THREE.TorusGeometry(r, 0.018, 4, lowQ ? 10 : 16), cx, b.y0 + h * t, cz, Math.PI / 2, 0, 0), "barrel", { c: darker(b.c, 0.8) });
      add(place(new THREE.CylinderGeometry(r * 0.95, r * 0.95, 0.02, 16), cx, b.y1 - 0.01, cz), "darkMetal");
      add(place(new THREE.CylinderGeometry(0.04, 0.04, 0.03, 8), cx + r * 0.5, b.y1, cz), "steel");
    },
    tank(b) {
      const cx = (b.x0 + b.x1) / 2;
      const cz = (b.z0 + b.z1) / 2;
      const r = (b.x1 - b.x0) / 2;
      const h = b.y1 - b.y0;
      const seg = lowQ ? 16 : 28;
      const body = new THREE.CylinderGeometry(r, r, h * 0.86, seg, 1);
      place(body, cx, b.y0 + h * 0.43, cz);
      projectUV(body, 2);
      add(body, "paintedMetal", { c: b.c });
      const dome = new THREE.SphereGeometry(r, seg, 6, 0, Math.PI * 2, 0, Math.PI / 2);
      place(dome, cx, b.y0 + h * 0.86, cz, 0, 0, 0, 1, 0.14 * (h / r) * 0.9, 1);
      add(dome, "paintedMetal", { c: b.c });
      for (const t of [0.25, 0.55]) add(place(new THREE.TorusGeometry(r + 0.02, 0.04, 4, seg), cx, b.y0 + h * t, cz, Math.PI / 2, 0, 0), "steel");
      // ladder + cage + railing
      ladderGeo(cx + r + 0.12, cz, 0, b.y0 + h * 0.98, "x");
      add(place(new THREE.TorusGeometry(r * 0.9, 0.03, 4, seg), cx, b.y0 + h + 0.25, cz, Math.PI / 2, 0, 0), "steel", { c: "#d0a12c" });
      add(place(new THREE.CylinderGeometry(0.25, 0.25, 0.4, 10), cx - r * 0.3, b.y0 + h * 0.93, cz), "steel");
      // pipes to ground
      add(place(new THREE.CylinderGeometry(0.12, 0.12, 2.5, 8), cx - r - 1.2, 0.5, cz, 0, 0, Math.PI / 2), "steel", { c: "#a4a8ab" });
      add(boxMinMax(cx - r - 2.6, 0, cz - 0.3, cx - r - 2.2, 0.9, cz + 0.3, 1), "paintedMetal", { c: "#c23b2a" });
      aoBoxes.push({ ...b, pad: 0.6 });
    },
    htank(b) {
      const ax = b.rot % 2 === 0;
      const cx = (b.x0 + b.x1) / 2;
      const cz = (b.z0 + b.z1) / 2;
      const L = ax ? b.x1 - b.x0 : b.z1 - b.z0;
      const r = (ax ? b.z1 - b.z0 : b.x1 - b.x0) / 2;
      const g = new THREE.CapsuleGeometry(r, L - r * 2, 6, lowQ ? 12 : 20);
      place(g, cx, b.y0 + r + 0.3, cz, ax ? 0 : Math.PI / 2, 0, ax ? Math.PI / 2 : 0);
      projectUV(g, 2);
      add(g, "paintedMetal", { c: b.c });
      for (const t of [-0.3, 0.3]) {
        const a = t * L;
        const s = ax ? boxMinMax(cx + a - 0.2, 0, cz - r * 0.8, cx + a + 0.2, r * 0.9, cz + r * 0.8, 1) : boxMinMax(cx - r * 0.8, 0, cz + a - 0.2, cx + r * 0.8, r * 0.9, cz + a + 0.2, 1);
        add(s, "concreteDark");
      }
      aoBoxes.push(b);
    },
    rock(b) {
      const cx = (b.x0 + b.x1) / 2;
      const cz = (b.z0 + b.z1) / 2;
      const w = b.x1 - b.x0;
      const d = b.z1 - b.z0;
      const h = b.y1 - b.y0;
      const g = new THREE.IcosahedronGeometry(1, lowQ ? 1 : 2);
      const p = g.attributes.position;
      const seed = b.seed || 0.5;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i);
        const y = p.getY(i);
        const z = p.getZ(i);
        const n = 1 + 0.18 * Math.sin(x * 4.1 + seed * 30) * Math.cos(z * 3.7 + seed * 11) + 0.1 * Math.sin(y * 7 + seed * 5);
        p.setXYZ(i, x * n, Math.max(-0.35, y) * n, z * n);
      }
      g.computeVertexNormals();
      place(g, cx, b.y0 + h * 0.42, cz, 0, seed * 6, 0, w * 0.56, h * 0.62, d * 0.56);
      projectUV(g, 2.5);
      add(g, b.m || "rock", { c: b.c });
      if (theme.snowCaps) {
        const cap = new THREE.IcosahedronGeometry(1, 1);
        place(cap, cx, b.y0 + h * 0.75, cz, 0, seed * 6, 0, w * 0.46, h * 0.28, d * 0.46);
        projectUV(cap, 3);
        add(cap, "snow");
      }
    },
    fence(b) {
      const ax = b.x1 - b.x0 >= b.z1 - b.z0;
      const L = ax ? b.x1 - b.x0 : b.z1 - b.z0;
      const H = b.y1 - b.y0;
      const cxm = (b.x0 + b.x1) / 2;
      const czm = (b.z0 + b.z1) / 2;
      const mesh = new THREE.PlaneGeometry(L, H - 0.15);
      if (!ax) mesh.rotateY(Math.PI / 2);
      mesh.translate(cxm, (H - 0.15) / 2 + 0.05, czm);
      // UV in metres
      const uv = mesh.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * L) / 1.2, (uv.getY(i) * (H - 0.15)) / 1.2);
      B.add(mesh, M("chainlink"), { shadow: !lowQ });
      const posts = Math.ceil(L / 2.8);
      for (let k = 0; k <= posts; k++) {
        const t = -L / 2 + (L * k) / posts;
        const x = ax ? cxm + t : cxm;
        const z = ax ? czm : czm + t;
        add(place(new THREE.CylinderGeometry(0.04, 0.04, H, 6), x, H / 2, z), "steel");
      }
      const top = new THREE.CylinderGeometry(0.025, 0.025, L, 6);
      if (ax) place(top, cxm, H - 0.05, czm, 0, 0, Math.PI / 2);
      else place(top, cxm, H - 0.05, czm, Math.PI / 2, 0, 0);
      add(top, "steel");
      if (b.s === "razor") {
        const coil = new THREE.TorusGeometry(0.22, 0.012, 3, 8);
        for (let t = -L / 2; t < L / 2; t += 0.35) add(place(coil.clone(), ax ? cxm + t : cxm, H + 0.18, ax ? czm : czm + t, 0, ax ? 0 : Math.PI / 2, 0.3), "steel");
        coil.dispose();
      }
    },
    rail(b) {
      const ax = b.x1 - b.x0 >= b.z1 - b.z0;
      const L = ax ? b.x1 - b.x0 : b.z1 - b.z0;
      const cxm = (b.x0 + b.x1) / 2;
      const czm = (b.z0 + b.z1) / 2;
      const mat = b.m === "wood" ? "woodDark" : "steel";
      const n = Math.max(1, Math.ceil(L / 1.2));
      for (let k = 0; k <= n; k++) {
        const t = -L / 2 + (L * k) / n;
        add(boxMinMax((ax ? cxm + t : cxm) - 0.05, b.y0, (ax ? czm : czm + t) - 0.05, (ax ? cxm + t : cxm) + 0.05, b.y1, (ax ? czm : czm + t) + 0.05, 1), mat);
      }
      for (const y of [b.y1 - 0.06, b.y0 + (b.y1 - b.y0) * 0.5]) add(boxMinMax(b.x0, y, b.z0 + (ax ? 0.02 : 0), b.x1, y + 0.06, b.z1 - (ax ? 0.02 : 0), 1), mat);
      if (b.m === "wood") add(boxMinMax(b.x0, b.y0, b.z0, b.x1, b.y0 + 0.55, b.z1, 1.5), "wood");
    },
    post(b) {
      add(boxMinMax(b.x0, b.y0, b.z0, b.x1, b.y1, b.z1, 1.5), b.m === "wood" ? "woodDark" : b.m);
    },
    platform(b) {
      add(boxMinMax(b.x0, b.y0, b.z0, b.x1, b.y1, b.z1, 1.5), b.m === "wood" ? "wood" : b.m);
    },
    rack(b) {
      const levels = 3;
      for (let k = 0; k <= levels; k++) {
        const y = b.y0 + ((b.y1 - b.y0) * k) / levels;
        add(boxMinMax(b.x0, y, b.z0, b.x1, y + 0.06, b.z1, 1), "rackMetal");
      }
      for (const x of [b.x0, b.x1 - 0.08]) for (const z of [b.z0, b.z1 - 0.08]) add(boxMinMax(x, b.y0, z, x + 0.08, b.y1, z + 0.08, 1), "rackMetal", { c: "#d38a24" });
      // stock on shelves
      for (let k = 0; k < levels; k++) {
        const y = b.y0 + ((b.y1 - b.y0) * k) / levels + 0.06;
        for (let x = b.x0 + 0.2; x < b.x1 - 0.6; x += 0.75 + hash2(x, k) * 0.3) {
          const hh = 0.35 + hash2(k, x) * 0.3;
          add(boxFaceUV(x, y, b.z0 + 0.1, x + 0.6, y + hh, b.z1 - 0.1), "crateWood", { c: hash2(x, y) > 0.5 ? "#d9c7a5" : "#b49a76" });
        }
      }
    },
    desk(b) {
      add(boxMinMax(b.x0, b.y1 - 0.05, b.z0, b.x1, b.y1, b.z1, 1), "woodDark");
      for (const x of [b.x0 + 0.05, b.x1 - 0.1]) for (const z of [b.z0 + 0.05, b.z1 - 0.1]) add(boxMinMax(x, b.y0, z, x + 0.05, b.y1 - 0.05, z + 0.05, 1), "darkMetal");
      add(boxMinMax(b.x0 + 0.4, b.y1, b.z0 + 0.2, b.x0 + 0.85, b.y1 + 0.32, b.z0 + 0.26, 1), "darkMetal");
      add(boxMinMax(b.x0 + 0.42, b.y1 + 0.04, b.z0 + 0.262, b.x0 + 0.83, b.y1 + 0.3, b.z0 + 0.266, 1), null, { glow: "#4fa6d8", gi: 1.1 });
    },
    bollard(b) {
      const cx = (b.x0 + b.x1) / 2;
      const cz = (b.z0 + b.z1) / 2;
      add(place(new THREE.CylinderGeometry(0.16, 0.2, b.y1 - b.y0, 12), cx, (b.y1 - b.y0) / 2, cz), "paintedMetal", { c: b.c || "#2b2f33" });
      add(place(new THREE.CylinderGeometry(0.26, 0.2, 0.1, 12), cx, b.y1 - 0.05, cz), "paintedMetal", { c: b.c || "#2b2f33" });
    },
    craneFoot(b) {
      add(boxMinMax(b.x0, b.y0 + 0.4, b.z0, b.x1, b.y1, b.z1, 1), "paintedMetal", { c: b.c });
      for (const dz of [0.25, 0.75]) {
        const z = b.z0 + (b.z1 - b.z0) * dz;
        add(place(new THREE.CylinderGeometry(0.28, 0.28, b.x1 - b.x0 + 0.05, 12), (b.x0 + b.x1) / 2, 0.28, z, 0, 0, Math.PI / 2), "darkMetal");
      }
    },
    trunk() {},
    invisible() {},
    craneLeg() {},
  };

  function facadeUV(g, bay, floor) {
    const p = g.attributes.position;
    const n = g.attributes.normal;
    const uv = g.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      const ay = Math.abs(n.getY(i));
      if (ay > 0.5) {
        uv.setXY(i, p.getX(i) / 8, p.getZ(i) / 8);
        continue;
      }
      const horiz = Math.abs(n.getX(i)) > 0.5 ? p.getZ(i) : p.getX(i);
      uv.setXY(i, horiz / bay, p.getY(i) / floor);
    }
  }

  function signBoard(b, z, h) {
    const names = ["PORTLINE LOGISTICS", "BAYSIDE FREIGHT", "NORTHWIND CARGO", "TIDEWATER SUPPLY", "KESTREL MARINE"];
    const name = names[Math.floor(hash2(b.x0, b.z0) * names.length)];
    const tex = canvasTexture(
      512,
      96,
      (g, w, hh) => {
        g.fillStyle = "#1d2c3a";
        g.fillRect(0, 0, w, hh);
        g.fillStyle = "#e9edf0";
        g.font = "bold 54px Arial, sans-serif";
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillText(name, w / 2, hh / 2 + 2);
        g.fillStyle = "#e2a12c";
        g.fillRect(0, hh - 10, w, 10);
      },
      "sign|" + name,
    );
    const mat = lib.track(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, emissive: night ? "#ffffff" : "#000000", emissiveMap: night ? tex : null, emissiveIntensity: 0.6 }));
    const w = Math.min(12, (b.x1 - b.x0) * 0.5);
    const g = new THREE.PlaneGeometry(w, w * (96 / 512));
    g.translate((b.x0 + b.x1) / 2, h * 0.86, z + 0.02);
    B.add(g, mat, { shadow: false });
  }

  function ladderGeo(x, z, y0, y1, axis = "x", face = 1) {
    const w = 0.42;
    for (const s of [-1, 1]) {
      const g = boxMinMax(-0.03, y0, -0.03, 0.03, y1 + 0.9, 0.03);
      g.translate(axis === "x" ? x : x + s * w * 0.5, 0, axis === "x" ? z + s * w * 0.5 : z);
      add(g, "steel", { c: "#9ea3a7" });
    }
    for (let y = y0 + 0.3; y < y1 + 0.05; y += 0.3) {
      const g = axis === "x" ? boxMinMax(x - 0.02, y, z - w / 2, x + 0.02, y + 0.035, z + w / 2) : boxMinMax(x - w / 2, y, z - 0.02, x + w / 2, y + 0.035, z + 0.02);
      add(g, "steel", { c: "#9ea3a7" });
    }
    void face;
  }

  function lamp(x, y, z, ry = 0, wall = false) {
    if (wall) {
      add(place(boxMinMax(-0.25, -0.08, -0.12, 0.25, 0.08, 0.2), x, y, z), "darkMetal");
      add(place(boxMinMax(-0.2, -0.1, -0.08, 0.2, -0.08, 0.16), x, y, z), null, { glow: "#ffe2b0", gi: 2.6 });
      glowSprites.push({ x, y: y - 0.2, z, s: 1.6, color: "#ffcf8a", o: night ? 0.55 : 0.18 });
      return;
    }
    void ry;
  }

  /* ------------------------------------------------------------ props */
  const PROP = {
    lamp(p) {
      const h = p.h || 7;
      add(place(new THREE.CylinderGeometry(0.07, 0.11, h, 10), p.x, h / 2, p.z), "steel", { c: "#6d7377" });
      add(place(new THREE.CylinderGeometry(0.2, 0.25, 0.4, 10), p.x, 0.2, p.z), "concreteDark");
      const dir = p.dir ?? (hash2(p.x, p.z) > 0.5 ? 1 : -1);
      for (const s of p.double ? [-1, 1] : [dir]) {
        const arm = boxMinMax(0, h - 0.08, -0.04, 1.4 * s, h, 0.04);
        arm.translate(p.x, 0, p.z);
        add(arm, "steel", { c: "#6d7377" });
        const head = boxMinMax(-0.32, -0.1, -0.16, 0.32, 0.06, 0.16);
        head.translate(p.x + 1.45 * s, h - 0.06, p.z);
        add(head, "darkMetal");
        add(place(boxMinMax(-0.28, -0.115, -0.13, 0.28, -0.1, 0.13), p.x + 1.45 * s, h - 0.06, p.z), null, { glow: p.color || "#ffe7c0", gi: 3 });
        lightSpots.push({ x: p.x + 1.45 * s, y: h - 0.4, z: p.z, color: p.color || "#ffd9a0", lamp: true });
        glowSprites.push({ x: p.x + 1.45 * s, y: h - 0.2, z: p.z, s: night ? 2.1 : 1.4, color: p.color || "#ffd9a0", o: night ? 0.45 : 0.18 });
      }
    },
    doorway(p) {
      const t = p.th + 0.06;
      const m = p.s === "warehouse" ? "steel" : "woodDark";
      const c = p.s === "warehouse" ? "#c9a227" : undefined;
      const fw = 0.08;
      const half = p.w / 2;
      const seg = (a0, a1, y0, y1) => {
        if (p.alongX) add(boxMinMax(p.x + a0, y0, p.z - t / 2, p.x + a1, y1, p.z + t / 2, 1), m, { c });
        else add(boxMinMax(p.x - t / 2, y0, p.z + a0, p.x + t / 2, y1, p.z + a1, 1), m, { c });
      };
      seg(-half - fw, -half, 0, p.y1 + fw);
      seg(half, half + fw, 0, p.y1 + fw);
      seg(-half - fw, half + fw, p.y1, p.y1 + fw);
      if (p.s === "warehouse" && p.w > 3) {
        // rolled-up shutter housing
        if (p.alongX) add(boxMinMax(p.x - half - 0.1, p.y1, p.z - t / 2 - 0.25, p.x + half + 0.1, p.y1 + 0.5, p.z + t / 2 + 0.25, 1), "steel");
        else add(boxMinMax(p.x - t / 2 - 0.25, p.y1, p.z - half - 0.1, p.x + t / 2 + 0.25, p.y1 + 0.5, p.z + half + 0.1, 1), "steel");
        // hazard stripes on the jambs
        seg(-half - 0.22, -half - fw, 0, 1.2);
        seg(half + fw, half + 0.22, 0, 1.2);
      }
    },
    window(p) {
      const t = p.th + 0.04;
      const fw = 0.06;
      const half = p.w / 2;
      const seg = (a0, a1, y0, y1, m = "darkMetal") => {
        if (p.alongX) add(boxMinMax(p.x + a0, y0, p.z - t / 2, p.x + a1, y1, p.z + t / 2, 1), m);
        else add(boxMinMax(p.x - t / 2, y0, p.z + a0, p.x + t / 2, y1, p.z + a1, 1), m);
      };
      seg(-half - fw, -half, p.y0, p.y1);
      seg(half, half + fw, p.y0, p.y1);
      seg(-half - fw, half + fw, p.y1, p.y1 + fw);
      // sill
      if (p.alongX) add(boxMinMax(p.x - half - 0.1, p.y0 - 0.06, p.z - t / 2 - 0.08, p.x + half + 0.1, p.y0, p.z + t / 2 + 0.08, 1), "concreteDark");
      else add(boxMinMax(p.x - t / 2 - 0.08, p.y0 - 0.06, p.z - half - 0.1, p.x + t / 2 + 0.08, p.y0, p.z + half + 0.1, 1), "concreteDark");
      // mullion for wide windows
      if (p.w > 1.8) seg(-0.03, 0.03, p.y0, p.y1);
      if (p.glass) {
        const g = p.alongX ? boxMinMax(p.x - half, p.y0, p.z - 0.01, p.x + half, p.y1, p.z + 0.01) : boxMinMax(p.x - 0.01, p.y0, p.z - half, p.x + 0.01, p.y1, p.z + half);
        B.add(g, glassMat, { shadow: false, receive: false });
      }
    },
    interior(p) {
      const g = new THREE.PlaneGeometry(p.w - 0.62, p.d - 0.62);
      g.rotateX(-Math.PI / 2);
      g.translate(p.x, 0.012, p.z);
      projectUV(g, lib.def(p.floor).scale || 2);
      B.add(g, M(p.floor), { shadow: false });
      if (p.light) {
        const n = p.w > 14 ? 3 : p.w > 8 ? 2 : 1;
        for (let k = 0; k < n; k++) {
          const x = p.x - p.w / 2 + (p.w * (k + 0.5)) / n;
          add(boxMinMax(x - 0.6, p.h - 0.08, p.z - 0.15, x + 0.6, p.h, p.z + 0.15), "darkMetal");
          add(boxMinMax(x - 0.55, p.h - 0.09, p.z - 0.11, x + 0.55, p.h - 0.08, p.z + 0.11), null, { glow: "#e8f2ff", gi: 2.4 });
          lightSpots.push({ x, y: p.h - 0.4, z: p.z, color: "#e4eeff", interior: true, r: Math.max(p.w, p.d) * 0.75 });
        }
      }
    },
    ladder(p) {
      const axis = p.face === "e" || p.face === "w" ? "x" : "z";
      ladderGeo(p.x, p.z, 0, p.top, axis === "x" ? "x" : "z");
    },
    towerFrame(p) {
      const { x, z, s, h, y } = p;
      const leg = 0.13;
      // diagonal bracing on each face
      for (const [ax, sgn] of [
        ["x", -1],
        ["x", 1],
        ["z", -1],
        ["z", 1],
      ]) {
        const L = Math.hypot(2 * s - leg * 2, h * 0.9);
        const ang = Math.atan2(h * 0.9, 2 * s - leg * 2);
        for (const flip of [1, -1]) {
          const g = new THREE.BoxGeometry(L, 0.08, 0.08);
          if (ax === "x") place(g, x, h * 0.48, z + sgn * (s - leg), 0, 0, ang * flip);
          else place(g, x + sgn * (s - leg), h * 0.48, z, ang * flip, Math.PI / 2, 0);
          if (ax === "z") {
            g.dispose();
            const g2 = new THREE.BoxGeometry(0.08, 0.08, L);
            place(g2, x + sgn * (s - leg), h * 0.48, z, ang * flip, 0, 0);
            add(g2, "woodDark");
          } else add(g, "woodDark");
        }
      }
      // roof posts
      for (const [lx, lz] of [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ])
        add(boxMinMax(x + lx * (s - 0.1) - 0.06, y, z + lz * (s - 0.1) - 0.06, x + lx * (s - 0.1) + 0.06, y + 2.3, z + lz * (s - 0.1) + 0.06, 1), "woodDark");
      lightSpots.push({ x, y: y + 2.0, z, color: "#ffd59a", tower: true });
      add(boxMinMax(x - 0.15, y + 2.15, z - 0.15, x + 0.15, y + 2.3, z + 0.15), null, { glow: "#ffe2b0", gi: 2 });
    },
    rails(p) {
      for (const z of [p.z0, p.z1])
        for (const dz of [-0.36, 0.36]) {
          add(boxMinMax(p.x0, 0.0, z + dz - 0.04, p.x1, 0.06, z + dz + 0.04, 2), "steel");
        }
    },
    gantry(p) {
      const { x, z, w, d, h } = p;
      const yel = "#d8a428";
      const xs = [x - w / 2 + 0.5, x + w / 2 - 0.5];
      const zs = [z - d / 2 + 0.5, z + d / 2 - 0.5];
      for (const lx of xs) for (const lz of zs) add(boxMinMax(lx - 0.4, 1.2, lz - 0.4, lx + 0.4, h, lz + 0.4, 2), "paintedMetal", { c: yel });
      // top girders along z, cross beams along x
      for (const lx of xs) add(boxMinMax(lx - 0.5, h, z - d / 2, lx + 0.5, h + 1.4, z + d / 2, 2), "paintedMetal", { c: yel });
      for (const lz of zs) add(boxMinMax(x - w / 2, h - 1.2, lz - 0.45, x + w / 2, h, lz + 0.45, 2), "paintedMetal", { c: yel });
      // diagonal braces (visual)
      for (const lx of xs)
        for (const lz of zs) {
          const g = new THREE.BoxGeometry(0.25, 7, 0.25);
          place(g, lx, 7, lz + (lz < z ? 1.8 : -1.8), (lz < z ? -1 : 1) * 0.5, 0, 0);
          add(g, "paintedMetal", { c: yel });
        }
      // trolley + spreader + hanging container
      const tz = z + d * 0.12;
      add(boxMinMax(x - w / 2 + 0.3, h + 1.4, tz - 1.6, x + w / 2 - 0.3, h + 2.6, tz + 1.6, 2), "paintedMetal", { c: "#cfd2d4" });
      add(boxMinMax(x + w / 2 - 3.2, h + 2.6, tz - 1.2, x + w / 2 - 0.6, h + 4.4, tz + 1.2, 2), "paintedMetal", { c: "#cfd2d4" });
      add(boxMinMax(x + w / 2 - 3.15, h + 3.0, tz - 1.21, x + w / 2 - 0.65, h + 4.0, tz + 1.21), "glass");
      for (const dx of [-2, 2]) for (const dz of [-0.6, 0.6]) add(place(new THREE.CylinderGeometry(0.025, 0.025, 4.5, 4), x + dx, h - 1.0, tz + dz), "darkMetal");
      add(boxMinMax(x - 3.1, h - 3.6, tz - 1.25, x + 3.1, h - 3.3, tz + 1.25, 1), "paintedMetal", { c: yel });
      KIND.container({ x0: x - 3.03, x1: x + 3.03, z0: tz - 1.22, z1: tz + 1.22, y0: h - 6.2, y1: h - 3.61, rot: 0, c: "#2e6f9e" });
      // warning beacon
      add(place(new THREE.SphereGeometry(0.18, 8, 6), x + w / 2 - 0.5, h + 1.6, z - d / 2 + 0.4), null, { glow: "#ff3b1f", gi: 2.5 });
      glowSprites.push({ x: x + w / 2 - 0.5, y: h + 1.6, z: z - d / 2 + 0.4, s: 2.4, color: "#ff4a2a", o: 0.75, blink: 1.2 });
    },
    quayCrane(p) {
      const { x, z, w, d } = p;
      const red = "#b8402c";
      const H = 22;
      for (const lx of [x - w / 2, x + w / 2]) for (const lz of [z - d / 2, z + d / 2]) add(boxMinMax(lx - 0.45, 1.4, lz - 0.45, lx + 0.45, H, lz + 0.45, 2), "paintedMetal", { c: red });
      for (const lx of [x - w / 2, x + w / 2]) add(boxMinMax(lx - 0.5, 12, z - d / 2, lx + 0.5, 13, z + d / 2, 2), "paintedMetal", { c: "#e6e8ea" });
      // boom over the water (along +z)
      for (const lx of [x - w / 2 + 0.5, x + w / 2 - 0.5]) add(boxMinMax(lx - 0.45, H, z - d / 2 - 14, lx + 0.45, H + 1.6, z + d / 2 + 32, 2), "paintedMetal", { c: red });
      add(boxMinMax(x - w / 2, H + 1.6, z - d / 2 - 2, x + w / 2, H + 7, z - d / 2 + 2, 2), "paintedMetal", { c: "#e6e8ea" });
      add(boxMinMax(x - w / 2 + 0.2, H + 3.2, z - d / 2 - 2.01, x + w / 2 - 0.2, H + 5, z - d / 2 - 1.99), "glass");
      for (const lx of [x - w / 2 + 0.5, x + w / 2 - 0.5]) {
        const L = Math.hypot(10, 30);
        const g = new THREE.BoxGeometry(0.15, 0.15, L);
        place(g, lx, H + 6.5, z + d / 2 + 12, Math.atan2(10, 30) * 0.95, 0, 0);
        add(g, "steel");
      }
      add(boxMinMax(x - w / 2, H + 7, z - d / 2 - 0.5, x + w / 2, H + 12, z - d / 2 + 0.5, 2), "paintedMetal", { c: red });
      glowSprites.push({ x: x, y: H + 12.3, z: z - d / 2, s: 2.6, color: "#ff3a2a", o: 0.8, blink: 1.6 });
      add(place(new THREE.SphereGeometry(0.2, 8, 6), x, H + 12.2, z - d / 2), null, { glow: "#ff3b1f", gi: 2.5 });
    },
    ship(p) {
      const { x, z, len } = p;
      const half = len / 2;
      const hull = extrude(
        [
          [-half, -6],
          [half - 8, -6],
          [half, 1],
          [half + 1, 5],
          [-half, 5],
        ],
        17,
        0.2,
      );
      hull.rotateX(-Math.PI / 2).rotateX(Math.PI / 2);
      hull.translate(x, -2.2, z);
      projectUV(hull, 6);
      paintGradient(hull, "#7a2a22", "#20384e", -2.2 - 1, -2.2 + 1.4);
      B.add(hull, M("paintedMetal"));
      // deck
      add(boxMinMax(x - half, 2.7, z - 8.3, x + half - 2, 2.9, z + 8.3, 4), "paintedMetal", { c: "#5c6366" });
      // containers on deck
      const cols = ["#a6402e", "#2e6f9e", "#3f7a4b", "#c9822b", "#6d4a8c", "#c9b03a", "#4c6f73", "#8a2f2f"];
      for (let bx = x - half + 6; bx < x + half - 24; bx += 6.4)
        for (let row = -3; row <= 3; row++) {
          const stack = 1 + Math.floor(hash2(bx, row) * 3);
          for (let s = 0; s < stack; s++) {
            const c = cols[Math.floor(hash2(bx + s, row * 3) * cols.length)];
            const cz = z + row * 2.45;
            add(boxMinMax(bx - 3.0, 2.9 + s * 2.6, cz - 1.2, bx + 3.0, 2.9 + (s + 1) * 2.6 - 0.04, cz + 1.2, 2.6), "corrugated", { c });
          }
        }
      // bridge superstructure
      const sx = x + half - 18;
      add(boxMinMax(sx - 5, 2.9, z - 7, sx + 5, 14, z + 7, 3), "paintedMetal", { c: "#e8e9e6" });
      for (let y = 5; y < 14; y += 2.6) add(boxMinMax(sx - 5.02, y, z - 6.6, sx - 4.98, y + 1, z + 6.6), "glass");
      add(boxMinMax(sx - 6, 14, z - 8.5, sx + 4, 14.4, z + 8.5, 3), "paintedMetal", { c: "#e8e9e6" });
      add(place(new THREE.CylinderGeometry(0.15, 0.2, 9, 8), sx, 18.5, z), "steel");
      add(boxMinMax(sx + 1.5, 14.4, z - 1.5, sx + 4, 19, z + 1.5, 2), "paintedMetal", { c: "#b8402c" });
      glowSprites.push({ x: sx, y: 23, z, s: 1.8, color: "#ff4a3a", o: 0.9, blink: 2 });
    },
    lighthouse(p) {
      add(place(new THREE.CylinderGeometry(1.4, 2.4, 22, 16), p.x, 11, p.z), "plasterWhite");
      for (let y = 3; y < 22; y += 6) add(place(new THREE.CylinderGeometry(1.85 - y * 0.02, 1.95 - y * 0.02, 2.4, 16), p.x, y, p.z), "paintedMetal", { c: "#b8402c" });
      add(place(new THREE.CylinderGeometry(1.2, 1.2, 2, 12), p.x, 23, p.z), "glass");
      add(place(new THREE.ConeGeometry(1.5, 1.6, 12), p.x, 24.8, p.z), "paintedMetal", { c: "#2b2f33" });
      glowSprites.push({ x: p.x, y: 23, z: p.z, s: 8, color: "#fff2c4", o: 0.85 });
    },
    water() {},
    tree(p) {
      treeList.push(p);
    },
  };
  const treeList = [];
  const glassMat = lib.track(new THREE.MeshStandardMaterial({ color: "#a9c6d6", roughness: 0.04, metalness: 0.3, transparent: true, opacity: night ? 0.18 : 0.22, depthWrite: false, envMapIntensity: 1.6, vertexColors: true }));
  installProps({ add, B, lib, M, KIND, PROP, glowSprites, lightSpots, theme, quality, group, animated, bounds: map.bounds, aoBoxes });

  for (const b of map.boxes) {
    if (b.hidden) continue;
    const f = KIND[b.k] || KIND.block;
    f(b);
  }
  for (const p of map.props) (PROP[p.t] || (() => {}))(p);
  if (map.extraView) map.extraView({ add, B, lib, M, PROP, KIND, glowSprites, lightSpots, treeList, quality, theme });

  /* ------------------------------------------------------------ contact AO under objects */
  {
    const tex = canvasTexture(
      64,
      64,
      (g, w, h) => {
        const grd = g.createLinearGradient(0, 0, w, 0);
        void grd;
        const img = g.createImageData(w, h);
        for (let y = 0; y < h; y++)
          for (let x = 0; x < w; x++) {
            const dx = Math.min(x, w - 1 - x) / (w * 0.5);
            const dy = Math.min(y, h - 1 - y) / (h * 0.5);
            const a = Math.min(1, Math.min(dx, dy) * 2.2) ** 1.6;
            const i = (y * w + x) * 4;
            img.data[i] = img.data[i + 1] = img.data[i + 2] = 0;
            img.data[i + 3] = a * 255;
          }
        g.putImageData(img, 0, 0);
      },
      "aoRect",
    );
    const aoMat = lib.track(new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: lowQ ? 0.55 : 0.42, depthWrite: false, color: "#ffffff", vertexColors: true, polygonOffset: true, polygonOffsetFactor: -2 }));
    for (const b of aoBoxes) {
      const pad = b.pad ?? 0.55;
      const g = new THREE.PlaneGeometry(b.x1 - b.x0 + pad * 2, b.z1 - b.z0 + pad * 2);
      g.rotateX(-Math.PI / 2);
      g.translate((b.x0 + b.x1) / 2, 0.03, (b.z0 + b.z1) / 2);
      B.add(g, aoMat, { shadow: false, receive: false });
    }
  }

  const meshes = B.build(group);

  /* ------------------------------------------------------------ trees (instanced) */
  if (treeList.length) buildTrees(group, lib, treeList, quality, theme, animated);

  /* ------------------------------------------------------------ glow sprites */
  const spriteGroup = new THREE.Group();
  const glowTex = radialTexture([
    [0, "rgba(255,255,255,1)"],
    [0.25, "rgba(255,255,255,0.45)"],
    [1, "rgba(255,255,255,0)"],
  ]);
  for (const s of glowSprites) {
    const m = lib.track(new THREE.SpriteMaterial({ map: glowTex, color: s.color, transparent: true, opacity: s.o, blending: THREE.AdditiveBlending, depthWrite: false, fog: true }));
    const sp = new THREE.Sprite(m);
    sp.position.set(s.x, s.y, s.z);
    sp.scale.setScalar(s.s);
    if (s.blink) animated.push((t) => (m.opacity = s.o * (Math.sin(t * Math.PI * 2 * (1 / s.blink)) > 0 ? 1 : 0.08)));
    if (s.flicker) {
      const ph = Math.random() * 10;
      animated.push((t) => {
        const f = 0.75 + Math.sin(t * 13 + ph) * 0.12 + Math.sin(t * 29 + ph * 2) * 0.08;
        m.opacity = s.o * f;
        sp.scale.setScalar(s.s * (0.92 + f * 0.1));
      });
    }
    spriteGroup.add(sp);
  }
  group.add(spriteGroup);

  /* ------------------------------------------------------------ water */
  const waterProp = map.props.find((p) => p.t === "water");
  if (waterProp) buildWater(group, lib, map, waterProp, quality, animated);

  return {
    group,
    meshes,
    lightSpots,
    update(t, dt) {
      for (const f of animated) f(t, dt);
    },
    stats: () => ({ meshes: meshes.length, trees: treeList.length }),
  };
}

/* ====================================================================== water */
function buildWater(group, lib, map, p, quality, animated) {
  const { minX, maxX, maxZ } = map.bounds;
  const n = quality === "low" ? 128 : 256;
  // normal map from layered sines (tileable)
  const tex = (() => {
    const c = document.createElement("canvas");
    c.width = c.height = n;
    const g = c.getContext("2d");
    const img = g.createImageData(n, n);
    const H = new Float32Array(n * n);
    const waves = [
      [3, 1, 0.5],
      [1, 4, 0.35],
      [5, -2, 0.25],
      [-7, 3, 0.15],
      [9, 7, 0.1],
      [-12, -5, 0.07],
    ];
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        let h = 0;
        for (const [kx, ky, a] of waves) h += Math.sin(((x * kx + y * ky) / n) * Math.PI * 2 + kx) * a;
        H[y * n + x] = h;
      }
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        const l = H[y * n + ((x - 1 + n) % n)];
        const r = H[y * n + ((x + 1) % n)];
        const u = H[((y - 1 + n) % n) * n + x];
        const d = H[((y + 1) % n) * n + x];
        let nx = (l - r) * 2.2;
        let ny = (d - u) * 2.2;
        const nz = 1;
        const L = Math.hypot(nx, ny, nz);
        const i = (y * n + x) * 4;
        img.data[i] = ((nx / L) * 0.5 + 0.5) * 255;
        img.data[i + 1] = ((ny / L) * 0.5 + 0.5) * 255;
        img.data[i + 2] = ((nz / L) * 0.5 + 0.5) * 255;
        img.data[i + 3] = 255;
      }
    g.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(40, 18);
    return t;
  })();
  const mat = lib.track(new THREE.MeshStandardMaterial({ color: "#16313b", roughness: 0.08, metalness: 0.25, normalMap: tex, normalScale: new THREE.Vector2(0.6, 0.6), envMapIntensity: 1.25 }));
  lib.track(tex);
  const geo = new THREE.PlaneGeometry(maxX - minX + 600, 360);
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set((minX + maxX) / 2, p.y ?? -2.2, maxZ + 180);
  mesh.receiveShadow = quality !== "low";
  group.add(mesh);
  // quay wall face
  const wall = new THREE.Mesh(projectUV(new THREE.BoxGeometry(maxX - minX + 320, 4, 1).translate((minX + maxX) / 2, -2, maxZ + 0.5), 3), lib.get("concreteDark"));
  paint(wall.geometry, "#ffffff");
  wall.receiveShadow = true;
  group.add(wall);
  // tyre fenders
  const tyre = new THREE.TorusGeometry(0.38, 0.14, 8, 14);
  const fenders = new THREE.InstancedMesh(tyre, lib.get("rubber"), 24);
  const m4 = new THREE.Matrix4();
  let k = 0;
  for (let x = minX + 3; x < maxX && k < 24; x += 4.5, k++) {
    m4.makeTranslation(x, -0.7, maxZ + 1.12);
    fenders.setMatrixAt(k, m4);
  }
  fenders.count = k;
  group.add(fenders);
  animated.push((t) => {
    tex.offset.set(t * 0.006, t * 0.011);
  });
}

/* ====================================================================== trees */
export function buildTrees(group, lib, list, quality, theme, animated) {
  const byType = {};
  for (const t of list) (byType[t.type] ||= []).push(t);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const v = new THREE.Vector3();
  const e = new THREE.Euler();
  const lowQ = quality === "low";
  const leafMat = (color) => lib.plain(color, { rough: 0.85, flat: false, vc: true });
  const barkMat = lib.get("bark");
  const inst = (geo, mat, items, fn, shadow = true) => {
    const im = new THREE.InstancedMesh(geo, mat, items.length);
    items.forEach((it, i) => {
      fn(it, m4);
      im.setMatrixAt(i, m4);
    });
    im.castShadow = shadow && !lowQ;
    im.receiveShadow = true;
    im.computeBoundingSphere();
    group.add(im);
    return im;
  };
  const compose = (x, y, z, ry, sx, sy = sx, sz = sx, rx = 0, rz = 0) => {
    e.set(rx, ry, rz);
    q.setFromEuler(e);
    v.set(x, y, z);
    s.set(sx, sy, sz);
    return m4.compose(v, q, s);
  };
  const jitterColors = (geo, base, spread = 0.18, dark = 0.55) => {
    const p = geo.attributes.position;
    const col = new Float32Array(p.count * 3);
    const c = new THREE.Color(base);
    let ymin = Infinity;
    let ymax = -Infinity;
    for (let i = 0; i < p.count; i++) {
      ymin = Math.min(ymin, p.getY(i));
      ymax = Math.max(ymax, p.getY(i));
    }
    for (let i = 0; i < p.count; i++) {
      const t = (p.getY(i) - ymin) / (ymax - ymin || 1);
      const k = dark + (1 - dark) * t + (Math.sin(i * 12.9898) * 0.5) * spread;
      col[i * 3] = c.r * k;
      col[i * 3 + 1] = c.g * k;
      col[i * 3 + 2] = c.b * k;
    }
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    return geo;
  };
  const noisy = (g0, amt, seed = 1) => {
    g0.deleteAttribute("normal");
    g0.deleteAttribute("uv");
    const geo = mergeVertices(g0);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const y = p.getY(i);
      const z = p.getZ(i);
      const n = 1 + amt * (Math.sin(x * 5.3 + seed) * Math.cos(z * 4.7 + seed * 2) + Math.sin(y * 6.1 + seed * 3) * 0.5);
      p.setXYZ(i, x * n, y, z * n);
    }
    geo.computeVertexNormals();
    return geo;
  };

  if (byType.pine) {
    const items = byType.pine;
    const trunk = new THREE.CylinderGeometry(0.13, 0.26, 1, 7);
    trunk.translate(0, 0.5, 0);
    inst(projectUV(trunk, 1.2), barkMat, items, (t) => compose(t.x, 0, t.z, t.rot, t.sc, 3.2 * t.sc, t.sc));
    const tiers = lowQ ? 3 : 4;
    const pc = theme.snowCaps ? "#3f5a48" : "#2f4a2c";
    for (let k = 0; k < tiers; k++) {
      const r = 2.3 - k * 0.48;
      const h = 2.6 - k * 0.3;
      const cone = noisy(new THREE.ConeGeometry(r, h, lowQ ? 7 : 10, 2), 0.12, k * 3 + 1);
      cone.translate(0, 2.0 + k * 1.35 + h / 2, 0);
      jitterColors(cone, pc, 0.25, 0.5);
      inst(cone, leafMat("#ffffff"), items, (t) => compose(t.x, 0, t.z, t.rot + k, t.sc, t.sc, t.sc));
      if (theme.snowCaps) {
        const cap = new THREE.ConeGeometry(r * 0.8, h * 0.38, lowQ ? 7 : 10, 1);
        cap.translate(0, 2.0 + k * 1.35 + h * 0.88, 0);
        jitterColors(cap, "#eef3f7", 0.06, 0.85);
        inst(cap, leafMat("#ffffff"), items, (t) => compose(t.x, 0, t.z, t.rot + k, t.sc, t.sc, t.sc), false);
      }
    }
  }
  if (byType.oak || byType.birch) {
    const items = [...(byType.oak || []), ...(byType.birch || [])];
    const trunk = new THREE.CylinderGeometry(0.16, 0.3, 1, 7);
    trunk.translate(0, 0.5, 0);
    inst(projectUV(trunk, 1.2), barkMat, items, (t) => compose(t.x, 0, t.z, t.rot, t.sc, 3.6 * t.sc, t.sc));
    const blobs = [
      [0, 4.6, 0, 2.1],
      [1.2, 4.1, 0.4, 1.5],
      [-1.0, 4.3, -0.6, 1.6],
      [0.2, 5.6, -0.3, 1.5],
      [-0.4, 4.0, 1.1, 1.3],
    ];
    blobs.forEach(([bx, by, bz, br], k) => {
      if (lowQ && k > 2) return;
      const g = noisy(new THREE.IcosahedronGeometry(br, lowQ ? 1 : 2), 0.14, k + 4);
      g.translate(bx, by, bz);
      jitterColors(g, k % 2 ? "#41592b" : "#4d6630", 0.3, 0.42);
      inst(g, leafMat("#ffffff"), items, (t) => compose(t.x, 0, t.z, t.rot, t.sc, t.sc, t.sc));
    });
    // branches
    const br = new THREE.CylinderGeometry(0.05, 0.1, 2, 5);
    br.translate(0, 1, 0);
    inst(br, barkMat, items, (t) => compose(t.x, 3.0 * t.sc, t.z, t.rot, t.sc, t.sc, t.sc, 0.8, 0));
  }
  if (byType.palm) {
    const items = byType.palm;
    const seg = 6;
    // curved trunk from stacked segments
    for (let k = 0; k < seg; k++) {
      const g = new THREE.CylinderGeometry(0.17 - k * 0.012, 0.2 - k * 0.012, 1.15, 7);
      g.translate(0, 0.55, 0);
      projectUV(g, 0.8);
      inst(g, lib.get("bark"), items, (t) => compose(t.x + Math.sin(t.rot) * k * k * 0.03, k * 1.1 * t.sc, t.z + Math.cos(t.rot) * k * k * 0.03, t.rot, t.sc, t.sc, t.sc, 0.02 * k, 0));
    }
    const frond = new THREE.PlaneGeometry(0.9, 3.4, 1, 6);
    const fp = frond.attributes.position;
    for (let i = 0; i < fp.count; i++) {
      const y = fp.getY(i) + 1.7;
      fp.setXYZ(i, fp.getX(i) * (1 - y / 4.2), y, -(y * y) * 0.12);
    }
    frond.computeVertexNormals();
    jitterColors(frond, "#5f7f2e", 0.2, 0.6);
    const fronds = lowQ ? 6 : 9;
    for (let f = 0; f < fronds; f++) {
      const im = inst(frond, lib.plain("#ffffff", { rough: 0.8, vc: true, side: THREE.DoubleSide }), items, (t) => {
        const tx = t.x + Math.sin(t.rot) * 25 * 0.03;
        const tz = t.z + Math.cos(t.rot) * 25 * 0.03;
        return compose(tx, 6.4 * t.sc, tz, t.rot + (f / fronds) * Math.PI * 2, t.sc, t.sc, t.sc, -0.5 - (f % 3) * 0.25, 0);
      });
      void im;
    }
  }
  if (byType.dead) {
    const items = byType.dead;
    const trunk = new THREE.CylinderGeometry(0.1, 0.24, 1, 6);
    trunk.translate(0, 0.5, 0);
    inst(trunk, barkMat, items, (t) => compose(t.x, 0, t.z, t.rot, t.sc, 4 * t.sc, t.sc));
    for (let k = 0; k < 4; k++) {
      const br = new THREE.CylinderGeometry(0.03, 0.08, 1.8, 5);
      br.translate(0, 0.9, 0);
      inst(br, barkMat, items, (t) => compose(t.x, (2 + k * 0.5) * t.sc, t.z, t.rot + k * 1.7, t.sc, t.sc, t.sc, 0.9, 0));
    }
  }
  if (byType.bush) {
    const items = byType.bush;
    const g = noisy(new THREE.IcosahedronGeometry(0.8, 1), 0.2, 9);
    g.scale(1, 0.7, 1);
    g.translate(0, 0.45, 0);
    jitterColors(g, theme.snowCaps ? "#4a5e4e" : "#46622d", 0.3, 0.45);
    inst(g, leafMat("#ffffff"), items, (t) => compose(t.x, 0, t.z, t.rot, t.sc, t.sc, t.sc));
  }
  void animated;
}
