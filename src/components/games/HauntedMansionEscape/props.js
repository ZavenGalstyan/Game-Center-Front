/**
 * Haunted Mansion Escape — procedural furniture. Each builder returns a Group
 * standing on its own origin (floor props at y = 0, wall props centred on the
 * given height) facing +z, i.e. into the room. State-driven bits (open lids,
 * placed objects, power lamps) register `ctx.onState`, animated bits
 * `ctx.onFrame`; scene.js owns both lists and disposes everything per room.
 */
import * as THREE from "three";
import { paintingCanvas, rugCanvas, textCanvas, signsCanvas, woodCanvas, SIGN_GLYPH } from "./art.js";
import { BOOKS_START, BOOK_COLORS, GALLERY_START, GALLERY, DINING_SEATS, ALTAR_SOCKETS } from "./data.js";

const BOOK_HEX = { red: "#8e1f22", blue: "#1f3f86", green: "#21603a", gold: "#b8892a", black: "#141216" };
const DINING_SOLUTION = { crown: "goblet", rose: "bell", moon: "teacup", star: "candlestick" };

function box(ctx, g, w, h, d, m, x = 0, y = 0, z = 0, cast = true) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), typeof m === "string" ? ctx.mat(m) : m);
  mesh.position.set(x, y, z);
  mesh.castShadow = cast;
  mesh.receiveShadow = true;
  g.add(mesh);
  return mesh;
}
function cyl(ctx, g, rt, rb, h, m, x = 0, y = 0, z = 0, seg = 16) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), typeof m === "string" ? ctx.mat(m) : m);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  g.add(mesh);
  return mesh;
}
function sph(ctx, g, r, m, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 18, 12), typeof m === "string" ? ctx.mat(m) : m);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  g.add(mesh);
  return mesh;
}
function plane(ctx, g, w, h, mat, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  mesh.position.set(x, y, z);
  mesh.receiveShadow = true;
  g.add(mesh);
  return mesh;
}
const texMat = (ctx, canvas, opts = {}) => ctx.mat("#ffffff", { map: ctx.T(canvas), roughness: 0.8, ...opts });
const WOOD = "#3b2416", DARKWOOD = "#24150c", BRASS = "brass", IRON = "iron";

function frame(ctx, g, w, h, color = BRASS, t = 0.08) {
  box(ctx, g, w + t * 2, t, 0.06, color, 0, h / 2 + t / 2, 0.02);
  box(ctx, g, w + t * 2, t, 0.06, color, 0, -h / 2 - t / 2, 0.02);
  box(ctx, g, t, h, 0.06, color, -w / 2 - t / 2, 0, 0.02);
  box(ctx, g, t, h, 0.06, color, w / 2 + t / 2, 0, 0.02);
}
function candle(ctx, g, x, y, z, h = 0.18) {
  cyl(ctx, g, 0.022, 0.025, h, ctx.mat("#efe6d0", { roughness: 0.5, emissive: "#3a2a10", emissiveIntensity: 0.4 }), x, y + h / 2, z, 10);
  ctx.flame(g, x, y + h + 0.03, z, 0.07);
}

export const PROPS = {
  door(ctx, o = {}) {
    const g = new THREE.Group();
    const w = o.w || 1.15, h = o.h || 2.35;
    const col = o.iron ? "#3a3836" : o.color || "#4a2c1a";
    box(ctx, g, w + 0.24, 0.16, 0.14, DARKWOOD, 0, h + 0.08, 0.02);
    box(ctx, g, 0.12, h, 0.14, DARKWOOD, -w / 2 - 0.06, h / 2, 0.02);
    box(ctx, g, 0.12, h, 0.14, DARKWOOD, w / 2 + 0.06, h / 2, 0.02);
    box(ctx, g, w, h, 0.02, "#050404", 0, h / 2, -0.03, false); // dark doorway behind the leaf
    const leaves = o.double ? [-1, 1] : [1];
    const pivots = leaves.map((side) => {
      const lw = w / leaves.length;
      const pivot = new THREE.Group();
      pivot.position.set(side === 1 && leaves.length === 1 ? -w / 2 : side * (w / 2), 0, 0);
      g.add(pivot);
      const dir = leaves.length === 1 ? 1 : -side;
      const leafMat = ctx.mat(col, { roughness: o.iron ? 0.5 : 0.75, metalness: o.iron ? 0.6 : 0 });
      box(ctx, pivot, lw - 0.02, h - 0.02, 0.07, leafMat, (dir * lw) / 2, h / 2, 0);
      for (const py of [h * 0.28, h * 0.68]) box(ctx, pivot, lw * 0.62, h * 0.3, 0.02, ctx.mat(col, { roughness: 0.6 }), (dir * lw) / 2, py, 0.045);
      sph(ctx, pivot, 0.035, BRASS, dir * (lw - 0.12), h * 0.47, 0.07);
      pivot.userData.dir = dir;
      return pivot;
    });
    if (o.bars) for (const py of [h * 0.35, h * 0.62]) box(ctx, g, w + 0.3, 0.07, 0.05, IRON, 0, py, 0.08);
    if (o.lockLamp) {
      const lamp = sph(ctx, g, 0.04, ctx.mat("#300", { emissive: "#ff2a1a", emissiveIntensity: 1.6 }), w / 2 + 0.3, 1.3, 0.05);
      box(ctx, g, 0.14, 0.22, 0.05, IRON, w / 2 + 0.3, 1.3, 0.0);
      ctx.onState((s) => lamp.material.emissive.set(s.f.power ? "#2aff6a" : "#ff2a1a"));
    }
    // opens once its lock flag is set; the scene supplies which flag
    let open = 0;
    ctx.onFrame((t, dt, s) => {
      const target = o.openFlag && s.f[o.openFlag] ? 1 : 0;
      open += (target - open) * Math.min(1, dt * 2.5);
      pivots.forEach((p) => (p.rotation.y = p.userData.dir * open * 1.2));
    });
    return g;
  },
  clock(ctx) {
    const g = new THREE.Group();
    const wood = ctx.mat("#3a1f12", { roughness: 0.55 });
    box(ctx, g, 0.7, 0.4, 0.45, wood, 0, 0.2, 0);
    box(ctx, g, 0.55, 1.35, 0.38, wood, 0, 1.07, 0);
    box(ctx, g, 0.72, 0.62, 0.46, wood, 0, 2.05, 0);
    box(ctx, g, 0.8, 0.1, 0.5, wood, 0, 2.41, 0);
    const face = new THREE.Mesh(new THREE.CircleGeometry(0.24, 40), texMat(ctx, clockFace(), { roughness: 0.4 }));
    face.position.set(0, 2.05, 0.235);
    g.add(face);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.245, 0.018, 8, 40), ctx.mat("#c9a24a", { metalness: 0.8, roughness: 0.3 }));
    ring.position.copy(face.position);
    g.add(ring);
    const hand = (len, wdt) => {
      const p = new THREE.Group();
      p.position.set(0, 2.05, 0.245);
      const m = new THREE.Mesh(new THREE.BoxGeometry(wdt, len, 0.008), ctx.mat("#111"));
      m.position.y = len / 2;
      p.add(m);
      g.add(p);
      return p;
    };
    const hourH = hand(0.13, 0.018), minH = hand(0.2, 0.012);
    // pendulum window + pendulum
    const door = new THREE.Group();
    door.position.set(-0.2, 0.75, 0.2);
    g.add(door);
    box(ctx, door, 0.4, 0.9, 0.03, ctx.mat("#2a160c", { roughness: 0.4 }), 0.2, 0.3, 0);
    plane(ctx, door, 0.28, 0.66, ctx.mat("#223", { transparent: true, opacity: 0.35, roughness: 0.1, metalness: 0.4 }), 0.2, 0.3, 0.017);
    const pend = new THREE.Group();
    pend.position.set(0, 1.5, 0.08);
    g.add(pend);
    box(ctx, pend, 0.015, 0.6, 0.01, BRASS, 0, -0.3, 0);
    const bob = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.02, 24), ctx.mat("#d4a94a", { metalness: 0.9, roughness: 0.25 }));
    bob.rotation.x = Math.PI / 2;
    bob.position.y = -0.62;
    pend.add(bob);
    let openA = 0;
    ctx.onFrame((t, dt, s) => {
      const solved = s.solved.clock;
      if (solved) {
        const now = new Date();
        hourH.rotation.z = -(((9 + 15 / 60) / 12) * Math.PI * 2) - (now.getSeconds() / 3600) * 0.0;
        minH.rotation.z = -((15 / 60) * Math.PI * 2);
        pend.rotation.z = Math.sin(t * Math.PI) * 0.18;
      } else {
        hourH.rotation.z = -((3 + 40 / 60) / 12) * Math.PI * 2;
        minH.rotation.z = -(40 / 60) * Math.PI * 2;
        pend.rotation.z = 0;
      }
      openA += ((solved ? 1 : 0) - openA) * Math.min(1, dt * 2);
      door.rotation.y = -openA * 1.6;
    });
    return g;
  },
  portrait(ctx, o = {}) {
    const g = new THREE.Group();
    const w = o.w || 1, h = o.h || 1.3;
    plane(ctx, g, w, h, texMat(ctx, paintingCanvas(o.subject || "landscape"), { roughness: 0.6 }), 0, 0, 0.03);
    frame(ctx, g, w, h, ctx.mat("#8a6a2a", { metalness: 0.7, roughness: 0.35 }), 0.1);
    return g;
  },
  sideTable(ctx) {
    const g = new THREE.Group();
    box(ctx, g, 1.0, 0.06, 0.5, WOOD, 0, 0.8, 0);
    box(ctx, g, 0.92, 0.14, 0.44, DARKWOOD, 0, 0.7, 0);
    for (const [x, z] of [[-0.42, -0.18], [0.42, -0.18], [-0.42, 0.18], [0.42, 0.18]]) cyl(ctx, g, 0.025, 0.018, 0.64, DARKWOOD, x, 0.32, z, 8);
    return g;
  },
  note(ctx) {
    const g = new THREE.Group();
    const m = plane(ctx, g, 0.22, 0.16, texMat(ctx, textCanvas(["The clock", "stopped…"], { w: 256, h: 180, bg: "#e6d8b4", color: "#3a2a1a", size: 34, font: "cursive" })), 0, 0.005, 0);
    m.rotation.x = -Math.PI / 2;
    m.rotation.z = 0.2;
    return g;
  },
  candle(ctx) {
    const g = new THREE.Group();
    cyl(ctx, g, 0.05, 0.07, 0.03, BRASS, 0, 0.015, 0, 12);
    candle(ctx, g, 0, 0.03, 0, 0.2);
    return g;
  },
  rug(ctx, o = {}) {
    const g = new THREE.Group();
    const m = plane(ctx, g, o.w || 3, o.d || 2, texMat(ctx, rugCanvas(o.color || "#5a1f22", (o.w * 10) | 0), { roughness: 1 }), 0, 0, 0);
    m.rotation.x = -Math.PI / 2;
    if (o.curled) {
      const curl = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.5, 12, 1, true, 0, Math.PI), ctx.mat(o.color || "#5a1f22", { side: THREE.DoubleSide, roughness: 1 }));
      curl.rotation.set(0, Math.PI / 4, Math.PI / 2);
      curl.position.set(o.w / 2 - 0.2, 0.06, o.d / 2 - 0.2);
      g.add(curl);
      const key = new THREE.Group();
      key.position.set(o.w / 2 - 0.35, 0.012, o.d / 2 - 0.35);
      box(ctx, key, 0.12, 0.01, 0.02, BRASS, 0, 0, 0);
      const bow = new THREE.Mesh(new THREE.TorusGeometry(0.025, 0.007, 6, 16), ctx.mat("#d9a441", { metalness: 0.8, roughness: 0.3 }));
      bow.rotation.x = Math.PI / 2;
      bow.position.x = -0.08;
      key.add(bow);
      g.add(key);
      ctx.onState((s) => (key.visible = !s.f.rugKey));
    }
    return g;
  },
  coatStand(ctx) {
    const g = new THREE.Group();
    cyl(ctx, g, 0.03, 0.04, 1.9, DARKWOOD, 0, 0.95, 0, 8);
    cyl(ctx, g, 0.2, 0.24, 0.05, DARKWOOD, 0, 0.03, 0, 12);
    const coat = cyl(ctx, g, 0.14, 0.26, 1.0, ctx.mat("#1b1a20", { roughness: 1 }), 0.05, 1.25, 0, 10);
    coat.rotation.z = 0.05;
    sph(ctx, g, 0.11, ctx.mat("#141216"), 0.04, 1.86, 0); // hat
    return g;
  },
  stairs(ctx) {
    const g = new THREE.Group();
    const wood = ctx.mat("#3a2414");
    for (let i = 0; i < 9; i++) box(ctx, g, 1.3, 0.2, 0.32, wood, 0, 0.1 + i * 0.2, -i * 0.32 + 1.2);
    for (let i = 0; i < 9; i++) cyl(ctx, g, 0.02, 0.02, 0.9, DARKWOOD, -0.62, 0.65 + i * 0.2, -i * 0.32 + 1.2, 6);
    const rail = box(ctx, g, 0.08, 0.08, 3.4, DARKWOOD, -0.62, 1.95, -0.1);
    rail.rotation.x = 0.56;
    return g;
  },
  window(ctx, o = {}) {
    const g = new THREE.Group();
    const w = o.round ? 0.9 : 1.1, h = o.round ? 0.9 : 1.6;
    const glass = ctx.mat("#0a1220", { emissive: o.moon ? "#4a6890" : "#22324a", emissiveIntensity: o.moon ? 0.9 : 0.5, roughness: 0.2 });
    if (o.round) {
      const c = new THREE.Mesh(new THREE.CircleGeometry(0.45, 32), glass);
      c.position.z = 0.02;
      g.add(c);
      const r = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.05, 8, 32), ctx.mat(DARKWOOD));
      r.position.z = 0.03;
      g.add(r);
      box(ctx, g, 0.9, 0.04, 0.04, DARKWOOD, 0, 0, 0.04);
      box(ctx, g, 0.04, 0.9, 0.04, DARKWOOD, 0, 0, 0.04);
      return g;
    }
    plane(ctx, g, w, h, glass, 0, 0, 0.02);
    frame(ctx, g, w, h, ctx.mat(DARKWOOD), 0.08);
    box(ctx, g, w, 0.04, 0.04, DARKWOOD, 0, 0.1, 0.04);
    box(ctx, g, 0.04, h, 0.04, DARKWOOD, 0, 0, 0.04);
    const curtain = ctx.mat("#4a1218", { roughness: 1, side: THREE.DoubleSide });
    for (const sx of [-1, 1]) {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.24, h + 0.6, 10, 1, true), curtain);
      c.scale.z = 0.35;
      c.position.set(sx * (w / 2 + 0.12), -0.15, 0.1);
      c.castShadow = true;
      g.add(c);
    }
    box(ctx, g, w + 0.8, 0.05, 0.05, BRASS, 0, h / 2 + 0.2, 0.12);
    return g;
  },
  sconce(ctx) {
    const g = new THREE.Group();
    box(ctx, g, 0.08, 0.2, 0.04, BRASS, 0, 0, 0.02);
    box(ctx, g, 0.04, 0.04, 0.16, BRASS, 0, -0.05, 0.1);
    candle(ctx, g, 0, -0.03, 0.18, 0.14);
    return g;
  },
  bookshelf(ctx, o = {}) {
    const g = new THREE.Group();
    const w = 2.1, h = o.short ? 2.2 : 3.1, d = 0.42;
    const wood = ctx.mat("#2e1a0e", { roughness: 0.7 });
    box(ctx, g, w, h, 0.04, wood, 0, h / 2, -d / 2 + 0.02);
    box(ctx, g, 0.06, h, d, wood, -w / 2, h / 2, 0);
    box(ctx, g, 0.06, h, d, wood, w / 2, h / 2, 0);
    const shelves = o.short ? 4 : 6;
    const sh = (h - 0.1) / shelves;
    for (let i = 0; i <= shelves; i++) box(ctx, g, w, 0.04, d, wood, 0, 0.05 + i * sh, 0);
    // books (instanced), skipping the puzzle slot
    let seed = o.seed || 1;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const inst = new THREE.InstancedMesh(geo, ctx.mat("#ffffff", { roughness: 0.8 }), 260);
    const m4 = new THREE.Matrix4(), col = new THREE.Color();
    let n = 0;
    const palette = ["#5a1a1a", "#1d2e4a", "#2a3a1e", "#4a3216", "#2b1b2e", "#6a5a3a", "#1a1a1a", "#3e2a1a"];
    for (let i = 0; i < shelves; i++) {
      if (o.puzzle && i === 2) continue;
      let x = -w / 2 + 0.06;
      while (x < w / 2 - 0.12 && n < 260) {
        const bw = 0.035 + rnd() * 0.05, bh = sh * (0.62 + rnd() * 0.3);
        if (rnd() < 0.07) {
          x += 0.1;
          continue;
        }
        m4.compose(new THREE.Vector3(x + bw / 2, 0.07 + i * sh + bh / 2, 0.02), new THREE.Quaternion(), new THREE.Vector3(bw, bh, 0.28 + rnd() * 0.06));
        inst.setMatrixAt(n, m4);
        inst.setColorAt(n, col.set(palette[(rnd() * palette.length) | 0]));
        n++;
        x += bw + 0.004;
      }
    }
    inst.count = n;
    inst.castShadow = true;
    inst.receiveShadow = true;
    g.add(inst);
    if (o.puzzle) {
      const y0 = 0.07 + 2 * sh;
      const books = {};
      BOOK_COLORS.forEach((c) => {
        const b = box(ctx, g, 0.16, sh * 0.86, 0.32, ctx.mat(BOOK_HEX[c], { roughness: 0.45, metalness: 0.1 }), 0, y0 + sh * 0.43, 0.02);
        for (const dy of [-0.3, 0.3]) box(ctx, b, 0.165, 0.02, 0.325, ctx.mat("#d8b04a", { metalness: 0.9, roughness: 0.3 }), 0, dy * sh * 0.86, 0, false);
        books[c] = b;
      });
      ctx.onState((s) => {
        const order = s.solved.books ? ["red", "blue", "green", "gold", "black"] : BOOKS_START;
        order.forEach((c, i) => (books[c].position.x = (i - 2) * 0.22));
      });
      const comp = box(ctx, g, 0.6, 0.2, 0.3, ctx.mat("#1a0f08"), 0, 0.12, 0.05);
      ctx.onFrame((t, dt, s) => (comp.position.z += ((s.solved.books ? 0.38 : 0.05) - comp.position.z) * Math.min(1, dt * 2)));
    }
    return g;
  },
  fireplace(ctx, o = {}) {
    const g = new THREE.Group();
    const stone = ctx.mat("#4a4440", { roughness: 0.85 });
    box(ctx, g, 1.9, 0.12, 0.5, stone, 0, 1.3, 0.05);
    box(ctx, g, 0.36, 1.3, 0.42, stone, -0.77, 0.65, 0);
    box(ctx, g, 0.36, 1.3, 0.42, stone, 0.77, 0.65, 0);
    box(ctx, g, 1.2, 0.3, 0.42, stone, 0, 1.1, 0);
    box(ctx, g, 1.2, 0.95, 0.3, ctx.mat("#0a0706", { roughness: 1 }), 0, 0.47, -0.06, false);
    box(ctx, g, 2.1, 0.05, 0.7, stone, 0, 0.02, 0.15);
    for (let i = 0; i < 3; i++) {
      const log = cyl(ctx, g, 0.06, 0.06, 0.7, "#2a1a10", (i - 1) * 0.12, 0.1 + (i === 1 ? 0.08 : 0), 0.0, 8);
      log.rotation.z = Math.PI / 2;
      log.rotation.y = (i - 1) * 0.3;
    }
    for (let i = 0; i < 5; i++) ctx.flame(g, (i - 2) * 0.13, 0.32 + (i % 2) * 0.06, 0.02, 0.28 + (i % 3) * 0.08);
    if (o.inscription) {
      const t = plane(ctx, g, 1.3, 0.2, ctx.mat("#ffffff", { map: ctx.T(textCanvas(["ASHCROFT HALL · MDCCCLXIV"], { w: 1024, h: 160, color: "#1a1410", size: 70 })), transparent: true }), 0, 1.1, 0.215);
      t.renderOrder = 1;
    }
    return g;
  },
  desk(ctx, o = {}) {
    const g = new THREE.Group();
    const wood = ctx.mat("#3a2212", { roughness: 0.5 });
    box(ctx, g, 1.7, 0.07, 0.85, wood, 0, 0.78, 0);
    box(ctx, g, 0.45, 0.74, 0.8, wood, -0.6, 0.37, 0);
    box(ctx, g, 0.45, 0.74, 0.8, wood, 0.6, 0.37, 0);
    for (const x of [-0.6, 0.6]) for (const y of [0.2, 0.45, 0.65]) sph(ctx, g, 0.02, BRASS, x, y, 0.41);
    box(ctx, g, 1.5, 0.01, 0.6, ctx.mat("#1d3a24", { roughness: 0.9 }), 0, 0.82, 0);
    if (o.lamp) {
      cyl(ctx, g, 0.06, 0.08, 0.04, BRASS, 0.55, 0.84, -0.2, 12);
      cyl(ctx, g, 0.012, 0.012, 0.3, BRASS, 0.55, 0.99, -0.2, 6);
      const shade = cyl(ctx, g, 0.06, 0.16, 0.1, ctx.mat("#1e5a32", { emissive: "#0e3a1a", emissiveIntensity: 0.6, roughness: 0.3 }), 0.55, 1.15, -0.12, 16);
      shade.rotation.x = 0.3;
    }
    if (o.book) {
      const b = box(ctx, g, 0.42, 0.04, 0.3, "#efe2c0", -0.15, 0.84, 0.05);
      b.rotation.y = 0.2;
      box(ctx, g, 0.44, 0.03, 0.32, "#5a1a14", -0.15, 0.815, 0.05).rotation.y = 0.2;
    }
    if (o.papers) for (let i = 0; i < 4; i++) box(ctx, g, 0.21, 0.004, 0.29, "#e8dcc0", -0.2 + i * 0.12, 0.825 + i * 0.002, 0.05 + (i % 2) * 0.08).rotation.y = (i - 1.5) * 0.25;
    return g;
  },
  armchair(ctx) {
    const g = new THREE.Group();
    const fab = ctx.mat("#4a1820", { roughness: 0.95 });
    box(ctx, g, 0.9, 0.42, 0.85, fab, 0, 0.32, 0);
    box(ctx, g, 0.9, 0.9, 0.2, fab, 0, 0.75, -0.35);
    box(ctx, g, 0.16, 0.3, 0.85, fab, -0.42, 0.6, 0);
    box(ctx, g, 0.16, 0.3, 0.85, fab, 0.42, 0.6, 0);
    for (const [x, z] of [[-0.38, -0.36], [0.38, -0.36], [-0.38, 0.36], [0.38, 0.36]]) cyl(ctx, g, 0.03, 0.02, 0.12, DARKWOOD, x, 0.06, z, 6);
    return g;
  },
  chair(ctx) {
    const g = new THREE.Group();
    const wood = ctx.mat("#3a2212");
    box(ctx, g, 0.5, 0.06, 0.5, wood, 0, 0.46, 0);
    box(ctx, g, 0.46, 0.05, 0.46, "#4a1820", 0, 0.5, 0);
    for (const [x, z] of [[-0.22, -0.22], [0.22, -0.22], [-0.22, 0.22], [0.22, 0.22]]) box(ctx, g, 0.04, 0.46, 0.04, wood, x, 0.23, z);
    box(ctx, g, 0.5, 0.6, 0.05, wood, 0, 0.8, -0.23);
    return g;
  },
  globe(ctx) {
    const g = new THREE.Group();
    cyl(ctx, g, 0.04, 0.25, 0.75, DARKWOOD, 0, 0.375, 0, 10);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.015, 6, 32), ctx.mat(BRASS));
    ring.position.y = 1.05;
    ring.rotation.y = 0.5;
    g.add(ring);
    const ball = sph(ctx, g, 0.27, ctx.mat("#b89a62", { roughness: 0.6 }), 0, 1.05, 0);
    ball.rotation.z = 0.4;
    ctx.onFrame((t) => (ball.rotation.y = t * 0.1));
    return g;
  },
  ladder(ctx) {
    const g = new THREE.Group();
    g.rotation.x = -0.18;
    box(ctx, g, 0.05, 3.0, 0.05, DARKWOOD, -0.22, 1.5, 0);
    box(ctx, g, 0.05, 3.0, 0.05, DARKWOOD, 0.22, 1.5, 0);
    for (let i = 0; i < 9; i++) box(ctx, g, 0.44, 0.04, 0.04, DARKWOOD, 0, 0.3 + i * 0.32, 0);
    return g;
  },
  diningTable(ctx) {
    const g = new THREE.Group();
    const wood = ctx.mat("#3a1e10", { roughness: 0.35 });
    box(ctx, g, 3.4, 0.08, 1.3, wood, 0, 0.78, 0);
    box(ctx, g, 3.2, 0.12, 1.1, DARKWOOD, 0, 0.68, 0);
    for (const [x, z] of [[-1.5, -0.5], [1.5, -0.5], [-1.5, 0.5], [1.5, 0.5]]) cyl(ctx, g, 0.05, 0.035, 0.7, DARKWOOD, x, 0.35, z, 8);
    box(ctx, g, 3.0, 0.005, 0.4, ctx.mat("#6a1a22", { roughness: 1 }), 0, 0.825, 0);
    // candelabra
    cyl(ctx, g, 0.08, 0.1, 0.04, "silver", -0.9, 0.84, 0, 12);
    cyl(ctx, g, 0.015, 0.015, 0.3, "silver", -0.9, 0.98, 0, 6);
    box(ctx, g, 0.36, 0.02, 0.02, "silver", -0.9, 1.1, 0);
    for (const dx of [-0.17, 0, 0.17]) candle(ctx, g, -0.9 + dx, 1.11, 0, 0.12);
    // four seats: two each side, carved signs on the backs
    const seats = { crown: [-0.6, -1], rose: [0.6, -1], moon: [-0.6, 1], star: [0.6, 1] };
    const placed = {};
    DINING_SEATS.forEach((sign) => {
      const [x, side] = seats[sign];
      const ch = PROPS.chair(ctx);
      ch.position.set(x, 0, side * 0.95);
      ch.rotation.y = side < 0 ? 0 : Math.PI;
      g.add(ch);
      const plate = plane(ctx, ch, 0.24, 0.24, ctx.mat("#ffffff", { map: ctx.T(signsCanvas([sign], { w: 128, h: 128, color: "#e6c068" })), transparent: true }), 0, 0.88, -0.2);
      plate.renderOrder = 1;
      const p = cyl(ctx, g, 0.13, 0.11, 0.015, ctx.mat("#ece6da", { roughness: 0.3 }), x, 0.83, side * 0.38, 20);
      placed[sign] = objectMesh(ctx, g, DINING_SOLUTION[sign], x, 0.84, side * 0.38);
      p.userData.sign = sign;
    });
    ctx.onState((s) => DINING_SEATS.forEach((k) => (placed[k].visible = Boolean(s.solved.dining))));
    return g;
  },
  tapestry(ctx) {
    const g = new THREE.Group();
    const [c, x] = [document.createElement("canvas"), null];
    c.width = 512;
    c.height = 640;
    const k = c.getContext("2d");
    k.fillStyle = "#4a1418";
    k.fillRect(0, 0, 512, 640);
    k.strokeStyle = "#c9a24a";
    k.lineWidth = 12;
    k.strokeRect(20, 20, 472, 600);
    k.fillStyle = "#c9a24a";
    k.font = "bold 46px Georgia, serif";
    k.textAlign = "center";
    k.fillText("ASHCROFT", 256, 90);
    k.beginPath();
    k.moveTo(256, 120);
    k.lineTo(370, 160);
    k.lineTo(350, 300);
    k.lineTo(256, 360);
    k.lineTo(162, 300);
    k.lineTo(142, 160);
    k.closePath();
    k.fill();
    k.fillStyle = "#4a1418";
    k.font = "110px serif";
    k.fillText("A", 256, 290);
    const names = [["crown", "Lord"], ["rose", "Lady"], ["moon", "Child"], ["star", "Guest"]];
    names.forEach(([s, n], i) => {
      const cx = 80 + i * 117;
      k.fillStyle = "#e6c068";
      k.font = "64px 'Segoe UI Symbol', serif";
      k.fillText(SIGN_GLYPH[s], cx, 470);
      k.font = "28px Georgia, serif";
      k.fillText(n, cx, 540);
    });
    void x;
    plane(ctx, g, 1.3, 1.62, ctx.mat("#ffffff", { map: ctx.T(c), roughness: 1, side: THREE.DoubleSide }), 0, 0, 0.04);
    box(ctx, g, 1.5, 0.05, 0.05, BRASS, 0, 0.84, 0.05);
    return g;
  },
  sideboard(ctx) {
    const g = new THREE.Group();
    const wood = ctx.mat("#3a2010", { roughness: 0.45 });
    box(ctx, g, 1.9, 0.9, 0.5, wood, 0, 0.47, 0);
    box(ctx, g, 2.0, 0.05, 0.55, DARKWOOD, 0, 0.94, 0);
    for (const x of [-0.6, 0, 0.6]) box(ctx, g, 0.55, 0.6, 0.02, DARKWOOD, x, 0.45, 0.26);
    box(ctx, g, 1.6, 0.9, 0.04, ctx.mat("#b8c4cc", { metalness: 0.9, roughness: 0.15 }), 0, 1.45, -0.22); // mirror back
    return g;
  },
  menuCard(ctx) {
    const g = new THREE.Group();
    const p = plane(ctx, g, 0.16, 0.22, texMat(ctx, textCanvas(["Menu", "13 · XI · 1887", "", "wine · bell", "milk · candle"], { w: 200, h: 280, bg: "#efe2c0", color: "#3a2412", size: 24, font: "Georgia, serif" })), 0, 0.11, 0);
    p.rotation.x = -0.25;
    return g;
  },
  teacup(ctx) {
    const g = new THREE.Group();
    objectMesh(ctx, g, "teacup", 0, 0, 0);
    return g;
  },
  bell(ctx) {
    const g = new THREE.Group();
    objectMesh(ctx, g, "bell", 0, 0, 0);
    return g;
  },
  cabinet(ctx) {
    const g = new THREE.Group();
    const wood = ctx.mat("#2e1a0c", { roughness: 0.5 });
    box(ctx, g, 1.2, 2.2, 0.06, wood, 0, 1.1, -0.2);
    box(ctx, g, 0.06, 2.2, 0.45, wood, -0.6, 1.1, 0);
    box(ctx, g, 0.06, 2.2, 0.45, wood, 0.6, 1.1, 0);
    box(ctx, g, 1.26, 0.08, 0.5, wood, 0, 2.22, 0);
    box(ctx, g, 1.2, 0.5, 0.45, wood, 0, 0.25, 0);
    for (const y of [0.9, 1.4, 1.9]) box(ctx, g, 1.14, 0.02, 0.4, ctx.mat("#9ab", { transparent: true, opacity: 0.4 }), 0, y, 0, false);
    const gl = plane(ctx, g, 1.14, 1.68, ctx.mat("#9fb4c4", { transparent: true, opacity: 0.16, roughness: 0.05, metalness: 0.5 }), 0, 1.36, 0.225);
    gl.castShadow = false;
    const goblet = objectMesh(ctx, g, "goblet", -0.2, 1.41, 0);
    ctx.onState((s) => (goblet.visible = !s.f.got_goblet));
    const dec = cyl(ctx, g, 0.03, 0.08, 0.22, ctx.mat("#6a2030", { transparent: true, opacity: 0.6, roughness: 0.1 }), 0.25, 1.52, 0, 12);
    dec.rotation.z = 1.4;
    return g;
  },
  bed(ctx) {
    const g = new THREE.Group();
    const wood = ctx.mat("#3a2012", { roughness: 0.5 });
    box(ctx, g, 1.6, 0.4, 2.1, wood, 0, 0.25, 0.3);
    box(ctx, g, 1.5, 0.22, 2.0, "#e4dccc", 0, 0.55, 0.3);
    box(ctx, g, 1.56, 0.12, 1.4, ctx.mat("#4a3a6a", { roughness: 1 }), 0, 0.68, 0.62);
    box(ctx, g, 0.5, 0.12, 0.3, "#efe9dd", -0.35, 0.72, -0.55);
    box(ctx, g, 0.5, 0.12, 0.3, "#efe9dd", 0.35, 0.72, -0.55);
    box(ctx, g, 1.6, 1.2, 0.08, wood, 0, 0.8, -0.75);
    for (const [x, z] of [[-0.78, -0.75], [0.78, -0.75], [-0.78, 1.35], [0.78, 1.35]]) cyl(ctx, g, 0.04, 0.04, 2.4, wood, x, 1.2, z, 8);
    box(ctx, g, 1.7, 0.08, 2.2, wood, 0, 2.4, 0.3);
    const cur = ctx.mat("#3a2a52", { roughness: 1, side: THREE.DoubleSide, transparent: true, opacity: 0.85 });
    for (const x of [-0.8, 0.8]) {
      const c = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 1.6), cur);
      c.position.set(x, 1.6, 0.3);
      c.rotation.y = Math.PI / 2;
      g.add(c);
    }
    return g;
  },
  vanity(ctx) {
    const g = new THREE.Group();
    const wood = ctx.mat("#4a2a1a", { roughness: 0.45 });
    box(ctx, g, 1.2, 0.75, 0.5, wood, 0, 0.38, 0);
    box(ctx, g, 1.0, 0.18, 0.02, DARKWOOD, 0, 0.6, 0.26);
    sph(ctx, g, 0.02, BRASS, 0, 0.6, 0.28);
    const mirror = new THREE.Mesh(new THREE.CircleGeometry(0.42, 40), ctx.mat("#c8d4dc", { metalness: 1, roughness: 0.08 }));
    mirror.scale.y = 1.3;
    mirror.position.set(0, 1.4, -0.18);
    g.add(mirror);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.43, 0.04, 8, 40), wood);
    ring.scale.y = 1.3;
    ring.position.copy(mirror.position);
    g.add(ring);
    const crack = box(ctx, g, 0.01, 1.0, 0.005, "#111", 0.05, 1.4, -0.17, false);
    crack.rotation.z = 0.35;
    candle(ctx, g, -0.45, 0.76, 0.05, 0.16);
    return g;
  },
  scrawl(ctx) {
    const g = new THREE.Group();
    const c = textCanvas(["MY SONG BOX SLEEPS ON", "MOON · ROSE · BIRD", "REMEMBER ME", "MY NAME OPENS THE LAST DOOR", "— CLARA"], { w: 1024, h: 512, color: "rgba(120,20,20,0.92)", size: 54, font: "'Courier New', monospace", mirror: true, scratch: true });
    plane(ctx, g, 1.8, 0.9, ctx.mat("#ffffff", { map: ctx.T(c), transparent: true, roughness: 1 }), 0, 0, 0.02);
    return g;
  },
  nightstand(ctx) {
    const g = new THREE.Group();
    box(ctx, g, 0.55, 0.58, 0.45, ctx.mat("#4a2a1a", { roughness: 0.5 }), 0, 0.29, 0);
    box(ctx, g, 0.45, 0.16, 0.02, DARKWOOD, 0, 0.42, 0.23);
    candle(ctx, g, 0.18, 0.58, 0.1, 0.14);
    return g;
  },
  musicBox(ctx) {
    const g = new THREE.Group();
    box(ctx, g, 0.3, 0.14, 0.2, ctx.mat("#6a2a3a", { roughness: 0.35 }), 0, 0.07, 0);
    box(ctx, g, 0.31, 0.015, 0.21, BRASS, 0, 0.14, 0);
    const lid = new THREE.Group();
    lid.position.set(0, 0.15, -0.1);
    g.add(lid);
    box(ctx, lid, 0.3, 0.05, 0.2, ctx.mat("#6a2a3a", { roughness: 0.35 }), 0, 0.025, 0.1);
    const dancer = cyl(ctx, g, 0.005, 0.03, 0.09, "#efe9dd", 0, 0.18, 0, 8);
    let a = 0;
    ctx.onFrame((t, dt, s) => {
      a += ((s.solved.musicbox ? 1 : 0) - a) * Math.min(1, dt * 2);
      lid.rotation.x = -a * 1.7;
      dancer.visible = a > 0.5;
      dancer.rotation.y = t * 2;
    });
    return g;
  },
  dollhouse(ctx) {
    const g = new THREE.Group();
    box(ctx, g, 0.9, 0.7, 0.5, ctx.mat("#7a5a6a"), 0, 0.35, 0);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(0.7, 0.4, 4), ctx.mat("#3a2a3a"));
    roof.position.y = 0.9;
    roof.rotation.y = Math.PI / 4;
    roof.scale.z = 0.6;
    g.add(roof);
    for (const x of [-0.22, 0.22]) for (const y of [0.22, 0.5]) plane(ctx, g, 0.14, 0.14, ctx.mat("#ffcf7a", { emissive: "#a06a20", emissiveIntensity: 0.6 }), x, y, 0.255);
    return g;
  },
  rockingChair(ctx) {
    const g = new THREE.Group();
    const ch = PROPS.chair(ctx);
    g.add(ch);
    for (const x of [-0.24, 0.24]) {
      const r = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.02, 6, 20, 1.2), ctx.mat(DARKWOOD));
      r.rotation.set(0, Math.PI / 2, -Math.PI / 2 - 0.6);
      r.position.set(x, 0.5, 0);
      g.add(r);
    }
    ctx.onFrame((t) => (ch.rotation.x = Math.sin(t * 1.3) * 0.04));
    return g;
  },
  safe(ctx) {
    const g = new THREE.Group();
    const steel = ctx.mat("#2a2c30", { metalness: 0.7, roughness: 0.4 });
    box(ctx, g, 0.9, 0.9, 0.3, steel, 0, 0, -0.1);
    frame(ctx, g, 0.78, 0.78, ctx.mat("#1a1a1c", { metalness: 0.6 }), 0.06);
    const door = new THREE.Group();
    door.position.set(-0.38, 0, 0.06);
    g.add(door);
    box(ctx, door, 0.76, 0.76, 0.08, ctx.mat("#3a3c42", { metalness: 0.75, roughness: 0.3 }), 0.38, 0, 0);
    const dial = cyl(ctx, door, 0.11, 0.11, 0.04, ctx.mat("#c9b06a", { metalness: 0.9, roughness: 0.25 }), 0.38, 0.08, 0.06, 28);
    dial.rotation.x = Math.PI / 2;
    box(ctx, door, 0.18, 0.03, 0.04, ctx.mat("#c9b06a", { metalness: 0.9 }), 0.38, -0.2, 0.06);
    const inside = new THREE.Group();
    g.add(inside);
    let a = 0;
    ctx.onFrame((t, dt, s) => {
      a += ((s.solved.safe ? 1 : 0) - a) * Math.min(1, dt * 1.8);
      door.rotation.y = -a * 1.9;
      dial.rotation.y = s.solved.safe ? 0 : Math.sin(t * 0.3) * 0.05;
    });
    return g;
  },
  bin(ctx) {
    const g = new THREE.Group();
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.13, 0.36, 14, 1, true), ctx.mat("#3a2a1a", { side: THREE.DoubleSide, roughness: 0.9 }));
    b.position.y = 0.18;
    b.castShadow = true;
    g.add(b);
    for (let i = 0; i < 3; i++) sph(ctx, g, 0.06, "#d8ccb0", (i - 1) * 0.06, 0.3 + (i % 2) * 0.03, (i % 2) * 0.04);
    return g;
  },
  map(ctx) {
    const g = new THREE.Group();
    const c = woodCanvas(5, "#b8975a");
    const x = c.getContext("2d");
    x.strokeStyle = "rgba(60,30,10,0.6)";
    x.lineWidth = 4;
    x.strokeRect(30, 30, 452, 452);
    x.font = "40px Georgia";
    x.fillStyle = "rgba(60,30,10,0.8)";
    x.fillText("Ashcroft Estate", 110, 90);
    plane(ctx, g, 1.3, 0.9, ctx.mat("#ffffff", { map: ctx.T(c), roughness: 1 }), 0, 0, 0.02);
    frame(ctx, g, 1.3, 0.9, ctx.mat(DARKWOOD), 0.06);
    return g;
  },
  piano(ctx) {
    const g = new THREE.Group();
    const black = ctx.mat("#0b0a0c", { roughness: 0.18, metalness: 0.3 });
    const shape = new THREE.Shape();
    shape.moveTo(-0.75, 0);
    shape.lineTo(0.75, 0);
    shape.lineTo(0.75, -0.9);
    shape.bezierCurveTo(0.75, -1.6, 0.2, -1.4, 0.0, -1.9);
    shape.bezierCurveTo(-0.3, -2.2, -0.75, -2.0, -0.75, -1.6);
    shape.lineTo(-0.75, 0);
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.32, bevelEnabled: false });
    geo.rotateX(Math.PI / 2);
    const body = new THREE.Mesh(geo, black);
    body.position.y = 1.0;
    body.castShadow = true;
    g.add(body);
    const lidGeo = new THREE.ShapeGeometry(shape);
    lidGeo.rotateX(Math.PI / 2);
    const lid = new THREE.Mesh(lidGeo, ctx.mat("#0b0a0c", { roughness: 0.18, metalness: 0.3, side: THREE.DoubleSide }));
    lid.position.set(0.75, 1.0, 0);
    lid.geometry.translate(-0.75, 0, 0);
    lid.rotation.z = 0.6;
    lid.castShadow = true;
    g.add(lid);
    for (const [x, z] of [[-0.65, -0.1], [0.65, -0.1], [0, -1.7]]) cyl(ctx, g, 0.05, 0.04, 0.68, black, x, 0.34, z, 10);
    box(ctx, g, 1.5, 0.08, 0.28, black, 0, 0.72, 0.14);
    box(ctx, g, 1.36, 0.03, 0.16, "#f0ebe0", 0, 0.775, 0.17);
    for (let i = 0; i < 26; i++) if (i % 7 !== 2 && i % 7 !== 6) box(ctx, g, 0.025, 0.03, 0.09, "#111", -0.66 + i * 0.052, 0.8, 0.13, false);
    box(ctx, g, 0.5, 0.25, 0.02, "#e8dcc0", 0, 0.98, 0.02).rotation.x = -0.2; // music
    // bench (opens when solved)
    box(ctx, g, 0.8, 0.42, 0.35, black, 0, 0.21, 0.75);
    const seat = new THREE.Group();
    seat.position.set(0, 0.45, 0.58);
    g.add(seat);
    box(ctx, seat, 0.82, 0.06, 0.37, ctx.mat("#2a0f14", { roughness: 0.9 }), 0, 0.03, 0.18);
    let a = 0;
    ctx.onFrame((t, dt, s) => {
      a += ((s.solved.piano ? 1 : 0) - a) * Math.min(1, dt * 2);
      seat.rotation.x = -a * 1.2;
    });
    return g;
  },
  metronome(ctx) {
    const g = new THREE.Group();
    box(ctx, g, 0.4, 0.8, 0.4, DARKWOOD, 0, 0.4, 0); // stand
    const m = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.32, 4), ctx.mat("#5a3420", { roughness: 0.4 }));
    m.position.y = 0.96;
    m.rotation.y = Math.PI / 4;
    g.add(m);
    const arm = new THREE.Group();
    arm.position.set(0, 0.84, 0.08);
    g.add(arm);
    box(ctx, arm, 0.008, 0.26, 0.008, BRASS, 0, 0.13, 0);
    ctx.onFrame((t) => (arm.rotation.z = Math.sin(t * 3.4) * 0.45));
    return g;
  },
  harp(ctx) {
    const g = new THREE.Group();
    const gold = ctx.mat("#b8892a", { metalness: 0.7, roughness: 0.35 });
    box(ctx, g, 0.4, 0.12, 0.3, gold, 0, 0.06, 0);
    const pillar = cyl(ctx, g, 0.04, 0.05, 1.7, gold, -0.25, 0.95, 0, 10);
    pillar.rotation.z = 0.05;
    const neck = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.04, 8, 20, Math.PI * 0.8), gold);
    neck.position.set(0.05, 1.55, 0);
    neck.rotation.z = 0.3;
    g.add(neck);
    for (let i = 0; i < 9; i++) cyl(ctx, g, 0.003, 0.003, 1.0 + i * 0.05, "#e8e0c0", -0.18 + i * 0.05, 0.75 + i * 0.03, 0, 4);
    return g;
  },
  cello(ctx) {
    const g = new THREE.Group();
    const wood = ctx.mat("#7a3a14", { roughness: 0.3 });
    sph(ctx, g, 0.24, wood, 0, 0.42, 0).scale.set(1, 1.3, 0.4);
    sph(ctx, g, 0.19, wood, 0, 0.85, 0).scale.set(1, 1.2, 0.4);
    box(ctx, g, 0.05, 0.6, 0.04, "#111", 0, 1.3, 0.04);
    g.rotation.z = 0.15;
    return g;
  },
  fuseBox(ctx) {
    const g = new THREE.Group();
    const steel = ctx.mat("#4a4c44", { metalness: 0.6, roughness: 0.55 });
    box(ctx, g, 0.8, 1.0, 0.22, steel, 0, 0, 0.0);
    for (let i = 0; i < 4; i++) {
      cyl(ctx, g, 0.04, 0.04, 0.05, "#2a2a2a", -0.24 + i * 0.16, 0.2, 0.13, 10).rotation.x = Math.PI / 2;
      if (i !== 2) cyl(ctx, g, 0.025, 0.025, 0.12, ctx.mat("#9fd3c7", { transparent: true, opacity: 0.7 }), -0.24 + i * 0.16, 0.2, 0.17, 8).rotation.z = Math.PI / 2;
    }
    const fuse3 = cyl(ctx, g, 0.025, 0.025, 0.12, ctx.mat("#9fd3c7", { transparent: true, opacity: 0.7, emissive: "#3affc0", emissiveIntensity: 0.6 }), 0.08, 0.2, 0.17, 8);
    fuse3.rotation.z = Math.PI / 2;
    const lever = new THREE.Group();
    lever.position.set(0.3, -0.2, 0.12);
    g.add(lever);
    box(ctx, lever, 0.04, 0.26, 0.04, "#8a1a1a", 0, 0.13, 0.03);
    const lamp = sph(ctx, g, 0.04, ctx.mat("#300", { emissive: "#ff2a1a", emissiveIntensity: 1.5 }), -0.25, -0.3, 0.12);
    plane(ctx, g, 0.5, 0.12, ctx.mat("#ffffff", { map: ctx.T(textCanvas(["DANGER · HOUSE LINE"], { w: 512, h: 120, bg: "#d8c24a", color: "#111", size: 56 })) }), -0.05, 0.4, 0.115);
    ctx.onState((s) => {
      fuse3.visible = Boolean(s.f.fuseIn);
      lever.rotation.x = s.f.power ? -2.4 : 0;
      lamp.material.emissive.set(s.f.power ? "#2aff6a" : "#ff2a1a");
    });
    return g;
  },
  generator(ctx) {
    const g = new THREE.Group();
    const green = ctx.mat("#2e4a36", { metalness: 0.5, roughness: 0.5 });
    box(ctx, g, 1.3, 0.2, 0.8, "#222", 0, 0.1, 0);
    const drum = cyl(ctx, g, 0.32, 0.32, 0.8, green, -0.1, 0.55, 0, 20);
    drum.rotation.z = Math.PI / 2;
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.05, 8, 24), ctx.mat("#555", { metalness: 0.8, roughness: 0.4 }));
    wheel.position.set(0.45, 0.6, 0);
    wheel.rotation.y = Math.PI / 2;
    g.add(wheel);
    box(ctx, wheel, 0.6, 0.04, 0.04, "#555", 0, 0, 0);
    ctx.onFrame((t, dt, s) => (wheel.rotation.x += dt * (s.f.power ? 8 : 0.6)));
    return g;
  },
  workbench(ctx) {
    const g = new THREE.Group();
    const wood = ctx.mat("#5a4028", { roughness: 0.9 });
    box(ctx, g, 2.0, 0.08, 0.7, wood, 0, 0.9, 0);
    for (const [x, z] of [[-0.9, -0.28], [0.9, -0.28], [-0.9, 0.28], [0.9, 0.28]]) box(ctx, g, 0.08, 0.9, 0.08, wood, x, 0.45, z);
    box(ctx, g, 1.9, 0.04, 0.6, wood, 0, 0.3, 0);
    cyl(ctx, g, 0.08, 0.08, 0.12, ctx.mat("#6a6a6a", { metalness: 0.6 }), 0.4, 1.0, 0.1, 14);
    box(ctx, g, 0.4, 0.04, 0.06, "#555", -0.3, 0.96, 0.15).rotation.y = 0.4;
    box(ctx, g, 0.3, 0.2, 0.2, "#7a2a1a", -0.6, 1.04, -0.1);
    const coil = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.03, 8, 20), ctx.mat("#a0602a", { metalness: 0.7 }));
    coil.rotation.x = Math.PI / 2;
    coil.position.set(0.75, 0.97, -0.1);
    g.add(coil);
    return g;
  },
  crates(ctx) {
    const g = new THREE.Group();
    const wood = ctx.mat("#6a4a2a", { roughness: 1 });
    box(ctx, g, 0.8, 0.8, 0.8, wood, 0, 0.4, 0).rotation.y = 0.2;
    box(ctx, g, 0.6, 0.6, 0.6, wood, 0.1, 1.1, 0.05).rotation.y = -0.3;
    box(ctx, g, 0.7, 0.7, 0.7, wood, 0.2, 0.35, 0.95).rotation.y = 0.5;
    return g;
  },
  wineRack(ctx) {
    const g = new THREE.Group();
    const wood = ctx.mat("#3a2414");
    box(ctx, g, 1.8, 2.2, 0.05, wood, 0, 1.1, -0.2);
    for (let i = 0; i <= 6; i++) box(ctx, g, 1.8, 0.03, 0.4, wood, 0, 0.1 + i * 0.33, 0);
    const geo = new THREE.CylinderGeometry(0.04, 0.04, 0.34, 8);
    geo.rotateX(Math.PI / 2);
    const inst = new THREE.InstancedMesh(geo, ctx.mat("#1a3020", { roughness: 0.2, metalness: 0.3 }), 60);
    const m = new THREE.Matrix4();
    let n = 0;
    for (let r = 0; r < 6; r++) for (let c = 0; c < 10; c++) if ((r * 7 + c * 3) % 5) inst.setMatrixAt(n++, m.makeTranslation(-0.8 + c * 0.18, 0.17 + r * 0.33, 0));
    inst.count = n;
    g.add(inst);
    return g;
  },
  pipes(ctx) {
    const g = new THREE.Group();
    const m = ctx.mat("#5a4a3a", { metalness: 0.6, roughness: 0.5 });
    for (const [y, r] of [[3.2, 0.08], [2.95, 0.05]]) {
      const p = cyl(ctx, g, r, r, 9, m, 0, y, 0.15, 10);
      p.rotation.z = Math.PI / 2;
    }
    cyl(ctx, g, 0.05, 0.05, 2.0, m, -2.4, 2.0, 0.15, 8);
    return g;
  },
  paintingWall(ctx) {
    const g = new THREE.Group();
    const frames = {};
    GALLERY.forEach((p) => {
      const f = new THREE.Group();
      plane(ctx, f, 1.05, 0.84, texMat(ctx, paintingCanvas(p.id), { roughness: 0.6 }), 0, 0, 0.03);
      frame(ctx, f, 1.05, 0.84, ctx.mat("#8a6a2a", { metalness: 0.7, roughness: 0.35 }), 0.08);
      g.add(f);
      frames[p.id] = f;
    });
    ctx.onState((s) => {
      const order = s.solved.gallery ? GALLERY.map((p) => p.id) : GALLERY_START;
      order.forEach((id, i) => {
        frames[id].position.x = (i - 2) * 1.5;
        frames[id].rotation.z = s.solved.gallery ? 0 : (((i * 37) % 7) - 3) * 0.02;
      });
    });
    return g;
  },
  plaque(ctx) {
    const g = new THREE.Group();
    plane(ctx, g, 0.7, 0.2, ctx.mat("#ffffff", { map: ctx.T(textCanvas(["Hang our story in the order it was lived."], { w: 1024, h: 280, bg: "#b8923a", color: "#2a1a08", size: 50, font: "Georgia, serif" })), metalness: 0.6, roughness: 0.35 }), 0, 0, 0.02);
    return g;
  },
  bust(ctx) {
    const g = new THREE.Group();
    const marble = ctx.mat("#d8d4cc", { roughness: 0.35 });
    box(ctx, g, 0.5, 1.1, 0.5, ctx.mat("#2a2420"), 0, 0.55, 0);
    sph(ctx, g, 0.2, marble, 0, 1.4, 0).scale.set(1.4, 0.6, 0.8);
    const head = sph(ctx, g, 0.15, marble, 0, 1.62, 0);
    head.scale.set(0.9, 1.15, 1);
    ctx.onFrame((t) => (head.rotation.y = Math.sin(t * 0.07) * 0.5));
    return g;
  },
  bench(ctx) {
    const g = new THREE.Group();
    box(ctx, g, 1.8, 0.1, 0.5, ctx.mat("#4a1820", { roughness: 0.9 }), 0, 0.45, 0);
    for (const x of [-0.8, 0.8]) box(ctx, g, 0.08, 0.4, 0.45, DARKWOOD, x, 0.2, 0);
    return g;
  },
  hatch(ctx) {
    const g = new THREE.Group();
    const m = plane(ctx, g, 1.0, 1.0, ctx.mat("#2a1a10"), 0, -0.01, 0);
    m.rotation.x = Math.PI / 2;
    for (const [w, d, x, z] of [[1.1, 0.06, 0, 0.52], [1.1, 0.06, 0, -0.52], [0.06, 1.1, 0.52, 0], [0.06, 1.1, -0.52, 0]]) box(ctx, g, w, 0.04, d, BRASS, x, -0.03, z, false);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.016, 6, 16), ctx.mat(BRASS));
    ring.position.set(0, -0.1, 0.3);
    g.add(ring);
    const ladder = new THREE.Group();
    g.add(ladder);
    box(ctx, ladder, 0.05, 3.6, 0.05, DARKWOOD, -0.25, -1.8, 0);
    box(ctx, ladder, 0.05, 3.6, 0.05, DARKWOOD, 0.25, -1.8, 0);
    for (let i = 0; i < 10; i++) box(ctx, ladder, 0.5, 0.04, 0.04, DARKWOOD, 0, -0.3 - i * 0.34, 0);
    ladder.rotation.x = 0.35;
    let a = 0;
    ctx.onFrame((t, dt, s) => {
      a += ((s.f.door_attic ? 1 : 0) - a) * Math.min(1, dt * 2);
      ladder.visible = a > 0.02;
      ladder.scale.y = Math.max(0.01, a);
      m.material.color.set(a > 0.5 ? "#050302" : "#2a1a10");
    });
    return g;
  },
  chest(ctx) {
    const g = new THREE.Group();
    const wood = ctx.mat("#4a2e18", { roughness: 0.8 });
    box(ctx, g, 1.1, 0.55, 0.6, wood, 0, 0.28, 0);
    for (const x of [-0.42, 0, 0.42]) box(ctx, g, 0.06, 0.57, 0.62, IRON, x, 0.28, 0);
    const lid = new THREE.Group();
    lid.position.set(0, 0.56, -0.3);
    g.add(lid);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 1.1, 16, 1, false, 0, Math.PI), wood);
    top.rotation.z = Math.PI / 2;
    top.position.z = 0.3;
    top.castShadow = true;
    lid.add(top);
    // three gear rings on the lock plate
    for (let i = 0; i < 3; i++) {
      const gear = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.018, 6, 12), ctx.mat("#b8892a", { metalness: 0.8, roughness: 0.3 }));
      gear.position.set(-0.16 + i * 0.16, 0.36, 0.31);
      g.add(gear);
      ctx.onFrame((t, dt, s) => (gear.rotation.z = s.solved.gears ? 0 : t * (i % 2 ? 0.2 : -0.2)));
    }
    let a = 0;
    ctx.onFrame((t, dt, s) => {
      a += ((s.solved.gears ? 1 : 0) - a) * Math.min(1, dt * 2);
      lid.rotation.x = -a * 1.4;
    });
    return g;
  },
  rockingHorse(ctx) {
    const g = new THREE.Group();
    const inner = new THREE.Group();
    g.add(inner);
    const wood = ctx.mat("#c8b8a0", { roughness: 0.6 });
    sph(ctx, inner, 0.3, wood, 0, 0.75, 0).scale.set(0.6, 0.6, 1.3);
    const neck = cyl(ctx, inner, 0.08, 0.12, 0.4, wood, 0, 1.0, 0.3, 8);
    neck.rotation.x = 0.5;
    sph(ctx, inner, 0.12, wood, 0, 1.2, 0.45).scale.set(0.8, 0.8, 1.5);
    for (const [x, z] of [[-0.12, -0.25], [0.12, -0.25], [-0.12, 0.25], [0.12, 0.25]]) cyl(ctx, inner, 0.03, 0.03, 0.5, wood, x, 0.4, z, 6);
    for (const x of [-0.14, 0.14]) {
      const r = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.025, 6, 20, 1.0), ctx.mat("#5a3a20"));
      r.rotation.set(0, Math.PI / 2, -Math.PI / 2 - 0.5);
      r.position.set(x, 1.05, 0);
      inner.add(r);
    }
    plane(ctx, inner, 0.22, 0.16, texMat(ctx, signsCanvas(["owl", "key", "moon"], { w: 384, h: 128, color: "#3a2a6a", bg: "#efe6d2" })), 0.2, 0.75, 0.0).rotation.y = Math.PI / 2;
    ctx.onFrame((t) => (inner.rotation.x = Math.sin(t * 0.9) * 0.05));
    return g;
  },
  sheeted(ctx) {
    const g = new THREE.Group();
    const cloth = ctx.mat("#cfc8b8", { roughness: 1 });
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.55, 2.0, 8), cloth);
    c.position.y = 1.0;
    c.scale.z = 0.4;
    c.castShadow = true;
    g.add(c);
    return g;
  },
  trunks(ctx) {
    const g = new THREE.Group();
    box(ctx, g, 0.9, 0.5, 0.5, "#3a2a20", 0, 0.25, 0);
    box(ctx, g, 0.7, 0.4, 0.45, "#5a2a20", 0.05, 0.7, 0).rotation.y = 0.2;
    sph(ctx, g, 0.18, "#cfc8b8", 0.9, 0.18, 0.3).scale.set(1.4, 0.8, 1);
    return g;
  },
  trapdoor(ctx) {
    const g = new THREE.Group();
    const m = plane(ctx, g, 1.1, 0.9, ctx.mat("#3a2616", { roughness: 0.9 }), 0, 0.005, 0);
    m.rotation.x = -Math.PI / 2;
    const hole = plane(ctx, g, 1.0, 0.8, ctx.mat("#020101"), 0, 0.003, 0);
    hole.rotation.x = -Math.PI / 2;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.015, 6, 16), ctx.mat(IRON));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(0, 0.02, 0.25);
    g.add(ring);
    ctx.onState((s) => {
      m.visible = !s.f.door_chamber;
      ring.visible = !s.f.door_chamber;
    });
    return g;
  },
  dressForm(ctx) {
    const g = new THREE.Group();
    cyl(ctx, g, 0.02, 0.02, 1.0, DARKWOOD, 0, 0.5, 0, 6);
    sph(ctx, g, 0.22, ctx.mat("#5a4a3a"), 0, 1.25, 0).scale.set(1, 1.5, 0.7);
    return g;
  },
  altar(ctx) {
    const g = new THREE.Group();
    const stone = ctx.mat("#3a3430", { roughness: 0.9 });
    box(ctx, g, 2.0, 0.9, 0.9, stone, 0, 0.45, 0);
    box(ctx, g, 2.2, 0.1, 1.0, stone, 0, 0.95, 0);
    const relicMesh = {};
    ALTAR_SOCKETS.forEach((sign, i) => {
      const x = -0.75 + i * 0.5;
      cyl(ctx, g, 0.11, 0.13, 0.05, "#1a1614", x, 1.03, 0.1, 16);
      plane(ctx, g, 0.22, 0.22, ctx.mat("#ffffff", { map: ctx.T(signsCanvas([sign], { w: 128, h: 128, color: "#e6c068" })), transparent: true, emissive: "#6a4a10", emissiveIntensity: 0.5 }), x, 0.65, 0.455);
      const relic = new THREE.Mesh(new THREE.OctahedronGeometry(0.06), ctx.mat("#e3d4a0", { emissive: "#8ab4ff", emissiveIntensity: 1.2, metalness: 0.6, roughness: 0.3 }));
      relic.position.set(x, 1.15, 0.1);
      g.add(relic);
      relicMesh[sign] = relic;
    });
    ctx.onFrame((t, dt, s) => ALTAR_SOCKETS.forEach((k, i) => {
      relicMesh[k].visible = Boolean(s.solved.altar);
      relicMesh[k].rotation.y = t + i;
      relicMesh[k].position.y = 1.15 + Math.sin(t * 2 + i) * 0.02;
    }));
    return g;
  },
  exitDoor(ctx) {
    const g = new THREE.Group();
    const stone = ctx.mat("#2a2420", { roughness: 0.9 });
    box(ctx, g, 2.6, 0.4, 0.3, stone, 0, 3.0, 0.05);
    box(ctx, g, 0.4, 3.0, 0.3, stone, -1.1, 1.5, 0.05);
    box(ctx, g, 0.4, 3.0, 0.3, stone, 1.1, 1.5, 0.05);
    const light = box(ctx, g, 1.8, 2.8, 0.02, ctx.mat("#000", { emissive: "#fff6e0", emissiveIntensity: 0 }), 0, 1.4, -0.04, false);
    const leaves = [-1, 1].map((side) => {
      const p = new THREE.Group();
      p.position.set(side * 0.9, 0, 0);
      g.add(p);
      box(ctx, p, 0.9, 2.8, 0.1, ctx.mat("#1a1210", { roughness: 0.7 }), -side * 0.45, 1.4, 0);
      for (const y of [0.5, 1.4, 2.3]) box(ctx, p, 0.9, 0.06, 0.03, IRON, -side * 0.45, y, 0.06);
      return p;
    });
    plane(ctx, g, 1.6, 0.25, ctx.mat("#ffffff", { map: ctx.T(textCanvas(["NAME THE ONE WHO NEVER LEFT"], { w: 1024, h: 160, color: "#d8b46a", size: 64 })), transparent: true, emissive: "#3a2a10" }), 0, 2.55, 0.08);
    const rings = [];
    for (let i = 0; i < 5; i++) {
      const r = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.025, 8, 20), ctx.mat("#b8892a", { metalness: 0.8, roughness: 0.3, emissive: "#000" }));
      r.position.set(-0.44 + i * 0.22, 1.5, 0.09);
      g.add(r);
      rings.push(r);
    }
    let a = 0;
    ctx.onFrame((t, dt, s) => {
      a += ((s.solved.exit ? 1 : 0) - a) * Math.min(1, dt * 0.8);
      leaves.forEach((p, i) => (p.rotation.y = (i ? -1 : 1) * a * 1.3));
      light.material.emissiveIntensity = a * 6;
      rings.forEach((r, i) => {
        r.material.emissive.set(s.f.altarLit ? "#5a7ab8" : "#000");
        r.rotation.z = s.f.altarLit && !s.solved.exit ? t * (i % 2 ? 1 : -1) * 0.6 : 0;
      });
    });
    return g;
  },
  candles(ctx) {
    const g = new THREE.Group();
    for (let i = 0; i < 6; i++) candle(ctx, g, Math.cos(i * 2.4) * 0.25, 0, Math.sin(i * 2.4) * 0.2, 0.2 + ((i * 7) % 5) * 0.12);
    return g;
  },
  sigil(ctx) {
    const g = new THREE.Group();
    const c = document.createElement("canvas");
    c.width = c.height = 512;
    const x = c.getContext("2d");
    x.strokeStyle = "rgba(200,40,30,0.9)";
    x.lineWidth = 6;
    x.beginPath();
    x.arc(256, 256, 230, 0, Math.PI * 2);
    x.arc(256, 256, 200, 0, Math.PI * 2);
    x.stroke();
    x.beginPath();
    for (let i = 0; i <= 5; i++) {
      const a = -Math.PI / 2 + ((i * 2) % 5) * ((Math.PI * 2) / 5);
      x[i ? "lineTo" : "moveTo"](256 + Math.cos(a) * 200, 256 + Math.sin(a) * 200);
    }
    x.stroke();
    const m = plane(ctx, g, 3.0, 3.0, ctx.mat("#ffffff", { map: ctx.T(c), transparent: true, emissive: "#ffffff", emissiveMap: ctx.T(c), emissiveIntensity: 0.4, depthWrite: false }), 0, 0, 0);
    m.rotation.x = -Math.PI / 2;
    ctx.onFrame((t, dt, s) => (m.material.emissiveIntensity = s.f.altarLit ? 1.4 + Math.sin(t * 3) * 0.3 : 0.3 + Math.sin(t) * 0.1));
    return g;
  },
  lectern(ctx) {
    const g = new THREE.Group();
    cyl(ctx, g, 0.06, 0.2, 1.0, DARKWOOD, 0, 0.5, 0, 8);
    const top = box(ctx, g, 0.6, 0.05, 0.45, DARKWOOD, 0, 1.08, 0);
    top.rotation.x = 0.35;
    const book = box(ctx, g, 0.5, 0.04, 0.36, "#e8dcc0", 0, 1.12, 0.01);
    book.rotation.x = 0.35;
    return g;
  },
  inscription(ctx) {
    const g = new THREE.Group();
    plane(ctx, g, 1.6, 0.8, ctx.mat("#ffffff", { map: ctx.T(textCanvas(["FOUR WERE BOUND", "RETURN WHAT WAS TAKEN", "EACH BENEATH THEIR SIGN"], { w: 1024, h: 512, color: "rgba(200,170,110,0.85)", size: 64 })), transparent: true }), 0, 0, 0.02);
    return g;
  },
};

/* small table objects shared by the dining room */
function objectMesh(ctx, g, kind, x, y, z) {
  const o = new THREE.Group();
  o.position.set(x, y, z);
  g.add(o);
  if (kind === "goblet") {
    const glass = ctx.mat("#c8dce8", { transparent: true, opacity: 0.55, roughness: 0.05, metalness: 0.3 });
    cyl(ctx, o, 0.04, 0.045, 0.01, glass, 0, 0.005, 0, 12);
    cyl(ctx, o, 0.008, 0.008, 0.08, glass, 0, 0.05, 0, 6);
    cyl(ctx, o, 0.05, 0.025, 0.09, glass, 0, 0.13, 0, 14);
  } else if (kind === "teacup") {
    cyl(ctx, o, 0.04, 0.03, 0.05, "#efe9dd", 0, 0.025, 0, 14);
    const h = new THREE.Mesh(new THREE.TorusGeometry(0.018, 0.005, 6, 12), ctx.mat("#efe9dd"));
    h.position.set(0.045, 0.028, 0);
    o.add(h);
    cyl(ctx, o, 0.06, 0.06, 0.006, "#efe9dd", 0, 0.003, 0, 16);
  } else if (kind === "bell") {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.06, 0.08, 16, 1, true), ctx.mat("#d8b04a", { metalness: 0.9, roughness: 0.25, side: THREE.DoubleSide }));
    b.position.y = 0.04;
    o.add(b);
    cyl(ctx, o, 0.008, 0.012, 0.08, DARKWOOD, 0, 0.12, 0, 6);
  } else if (kind === "candlestick") {
    cyl(ctx, o, 0.045, 0.055, 0.015, "silver", 0, 0.008, 0, 12);
    cyl(ctx, o, 0.012, 0.016, 0.16, "silver", 0, 0.09, 0, 8);
    candle(ctx, o, 0, 0.17, 0, 0.1);
  }
  return o;
}

function clockFace() {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const x = c.getContext("2d");
  x.fillStyle = "#ece2c8";
  x.beginPath();
  x.arc(128, 128, 128, 0, Math.PI * 2);
  x.fill();
  x.fillStyle = "#1a1410";
  x.font = "bold 28px Georgia, serif";
  x.textAlign = "center";
  x.textBaseline = "middle";
  const R = ["XII", "I", "II", "III", "IIII", "V", "VI", "VII", "VIII", "IX", "X", "XI"];
  R.forEach((t, i) => {
    const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
    x.fillText(t, 128 + Math.cos(a) * 98, 128 + Math.sin(a) * 98);
  });
  return c;
}
