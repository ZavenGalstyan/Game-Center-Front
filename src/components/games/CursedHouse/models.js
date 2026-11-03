/**
 * The Cursed House — low-poly models built from primitives (all original).
 *
 * Furniture builders take (W, D, H, M) — width across the front, depth,
 * height, material set — and return a THREE.Group whose origin is the floor
 * at the centre of the footprint with the FRONT facing local +z. Parts that
 * animate are tagged userData.dynamic (world.js keeps them live and merges
 * everything else into static batches).
 */
import * as THREE from "three";
import * as T from "./textures.js";

export function makeMaterials(track) {
  const std = (o) => track(new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0, ...o }));
  const t = (x) => track(x);
  const M = {
    wallG: std({ map: t(T.wallpaper("#3f2b27", "#1d1210", "#2c1e15")) }),
    wallU: std({ map: t(T.wallpaper("#3a3d30", "#1c2016", "#2a2018")) }),
    stone: std({ map: t(T.stoneWall()) }),
    planks: std({ map: t(T.planks()) }),
    porch: std({ map: t(T.planks([60, 58, 54])) }),
    kitchenTile: std({ map: t(T.tiles("#bdb6a0", "#25221f", 4)), roughness: 0.6 }),
    bathTile: std({ map: t(T.tiles("#8fa293", "#c9c3ae", 6, "#2d2a26")), roughness: 0.5 }),
    concrete: std({ map: t(T.concrete()) }),
    plaster: std({ map: t(T.plaster()) }),
    wood: std({ map: t(T.woodGrain()) }),
    woodDark: std({ map: t(T.woodGrain([34, 23, 16])) }),
    woodLight: std({ map: t(T.woodGrain([92, 70, 48])) }),
    painted: std({ map: t(T.paintedWood()) }),
    paintedGreen: std({ map: t(T.paintedWood("#4d5a4a")) }),
    fridge: std({ map: t(T.paintedWood("#b9b19a")), roughness: 0.55 }),
    velvet: std({ map: t(T.fabric()) }),
    velvetGreen: std({ map: t(T.fabric([34, 48, 38])) }),
    cloth: std({ map: t(T.cloth()) }),
    brick: std({ map: t(T.brick()) }),
    porcelain: std({ color: 0xc9c4b4, roughness: 0.35 }),
    iron: std({ color: 0x24221f, roughness: 0.6, metalness: 0.3 }),
    rust: std({ color: 0x5a3324, roughness: 0.8, metalness: 0.2 }),
    brass: std({ color: 0xb08a3e, roughness: 0.4, metalness: 0.45, emissive: 0x2a1d06 }),
    chrome: std({ color: 0x8a8a86, roughness: 0.35, metalness: 0.5 }),
    black: std({ color: 0x0c0b0a }),
    glass: std({ color: 0x0d1012, roughness: 0.1, metalness: 0.2 }),
    paper: std({ color: 0x8a8068 }),
    cardboard: std({ color: 0x5c4630 }),
    redBox: std({ color: 0x5a1f18, roughness: 0.7, metalness: 0.15 }),
    window: t(new THREE.MeshBasicMaterial({ map: t(T.windowGlass()), color: 0x8090a8 })),
    clockFace: std({ map: t(T.clockFace()), roughness: 0.6 }),
    portraits: [0, 1, 2].map((k) => std({ map: t(T.portrait(k)), roughness: 0.7 })),
    ember: t(new THREE.MeshBasicMaterial({ color: 0xff5a1e })),
    candle: std({ color: 0xd8cfb0, roughness: 0.8 }),
    flame: t(new THREE.MeshBasicMaterial({ color: 0xffd08a })),
    bulb: t(new THREE.MeshBasicMaterial({ color: 0xf2f0c8 })),
    curtain: std({ map: t(T.fabric([52, 14, 18])) }),
    ground: std({ color: 0x15140f }),
    stain: t(new THREE.MeshBasicMaterial({ map: t(T.stain()), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 })),
    web: t(new THREE.MeshBasicMaterial({ map: t(T.cobweb()), transparent: true, depthWrite: false, side: THREE.DoubleSide, opacity: 0.55 })),
    // the widow
    skin: std({ color: 0x857f70, roughness: 0.9 }),
    face: std({ map: t(T.widowFace()), color: 0xb4ab9a, roughness: 0.9 }),
    dress: std({ map: t(T.dressFabric()) }),
    shawl: std({ map: t(T.fabric([70, 66, 58])) }),
    hair: std({ color: 0x8f8a80, roughness: 1 }),
    stocking: std({ color: 0x1a1817 }),
    eye: t(new THREE.MeshBasicMaterial({ color: 0xe8dca0 })),
    lanternGlass: t(new THREE.MeshBasicMaterial({ color: 0xffb35a })),
  };
  return M;
}

/* ------------------------------------------------------------------ helpers */
export function mesh(geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  return m;
}
/** box by size at centre (x, y, z) */
export function bx(g, w, h, d, mat, x, y, z, ry = 0) {
  const m = mesh(new THREE.BoxGeometry(w, h, d), mat, x, y, z);
  if (ry) m.rotation.y = ry;
  g.add(m);
  return m;
}
/** box from y0 upward */
const bu = (g, w, h, d, mat, x, y0, z) => bx(g, w, h, d, mat, x, y0 + h / 2, z);
function cy(g, rt, rb, h, mat, x, y, z, seg = 10) {
  const m = mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat, x, y, z);
  g.add(m);
  return m;
}
function lathe(points, seg = 14) {
  return new THREE.LatheGeometry(points.map(([r, y]) => new THREE.Vector2(r, y)), seg);
}
const dyn = (o) => {
  o.userData.dynamic = true;
  return o;
};
function legs4(g, W, D, h, t, mat, inset = 0.04) {
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) bu(g, t, h, t, mat, sx * (W / 2 - inset - t / 2), 0, sz * (D / 2 - inset - t / 2));
}
function candleOn(g, x, y, z, M) {
  cy(g, 0.022, 0.024, 0.14, M.candle, x, y + 0.07, z, 8);
  const f = mesh(new THREE.SphereGeometry(0.014, 6, 6), M.flame, x, y + 0.16, z);
  f.scale.y = 1.8;
  g.add(f);
  return f;
}

/* ------------------------------------------------------------------ furniture */
export const BUILD = {
  console(W, D, H, M) {
    const g = new THREE.Group();
    bu(g, W, 0.05, D, M.woodDark, 0, H - 0.05, 0);
    legs4(g, W, D, H - 0.05, 0.05, M.woodDark);
    bu(g, W - 0.12, 0.14, D - 0.06, M.wood, 0, H - 0.21, 0);
    bu(g, 0.12, 0.012, 0.012, M.brass, 0, H - 0.14, D / 2 - 0.02);
    // a vase of dead flowers
    cy(g, 0.05, 0.07, 0.24, M.porcelain, 0, H + 0.12, -0.25, 10);
    for (let i = 0; i < 4; i++) {
      const s = cy(g, 0.004, 0.004, 0.3, M.woodDark, 0.01 * i - 0.015, H + 0.36, -0.25 + 0.01 * i);
      s.rotation.z = (i - 1.5) * 0.25;
    }
    g.userData.candle = candleOn(g, 0, H, 0.35, M);
    return g;
  },
  clock(W, D, H, M) {
    const g = new THREE.Group();
    bu(g, W, 0.25, D, M.woodDark, 0, 0, 0);
    bu(g, W - 0.08, H - 0.75, D - 0.06, M.wood, 0, 0.25, 0);
    bu(g, W + 0.04, 0.5, D + 0.02, M.woodDark, 0, H - 0.5, 0);
    bu(g, W + 0.08, 0.05, D + 0.06, M.woodDark, 0, H - 0.05, 0);
    const face = mesh(new THREE.CircleGeometry(0.17, 20), M.clockFace, 0, H - 0.26, D / 2 + 0.012);
    g.add(face);
    bu(g, 0.22, 0.6, 0.01, M.glass, 0, 0.75, D / 2 - 0.02);
    const pend = dyn(new THREE.Group());
    pend.position.set(0, 1.4, D / 2 - 0.05);
    cy(pend, 0.004, 0.004, 0.45, M.brass, 0, -0.22, 0, 6);
    const bob = cy(pend, 0.06, 0.06, 0.01, M.brass, 0, -0.46, 0, 16);
    bob.rotation.x = Math.PI / 2;
    g.add(pend);
    g.userData.pendulum = pend;
    return g;
  },
  coatrack(W, D, H, M) {
    const g = new THREE.Group();
    cy(g, 0.02, 0.025, H, M.woodDark, 0, H / 2, 0, 8);
    for (let i = 0; i < 4; i++) {
      const f = bx(g, 0.03, 0.03, 0.34, M.woodDark, 0, 0.03, 0, (i * Math.PI) / 2);
      f.rotation.y = (i * Math.PI) / 2 + 0.4;
    }
    const coat = mesh(lathe([[0.17, 0], [0.19, 0.4], [0.16, 0.8], [0.06, 1.0], [0.02, 1.04]]), M.shawl, 0.05, H - 1.12, 0.05);
    coat.scale.z = 0.6;
    g.add(coat);
    const hat = cy(g, 0.12, 0.12, 0.015, M.black, -0.04, H - 0.06, 0, 14);
    hat.rotation.z = 0.2;
    cy(g, 0.07, 0.08, 0.1, M.black, -0.04, H, 0, 12);
    return g;
  },
  counter(W, D, H, M) {
    const g = new THREE.Group();
    bu(g, W, H - 0.05, D - 0.04, M.paintedGreen, 0, 0, -0.02);
    bu(g, W + 0.02, 0.05, D, M.woodLight, 0, H - 0.05, 0);
    for (let i = 0; i < 3; i++) {
      const x = -W / 2 + (W / 3) * (i + 0.5);
      bu(g, W / 3 - 0.06, H - 0.25, 0.012, M.painted, x, 0.1, D / 2 - 0.035);
      bu(g, 0.08, 0.015, 0.02, M.chrome, x, H - 0.3, D / 2 - 0.02);
    }
    // sink
    bu(g, 0.5, 0.02, 0.36, M.black, -0.45, H - 0.015, 0.02);
    cy(g, 0.012, 0.012, 0.22, M.chrome, -0.45, H + 0.1, -0.22, 6);
    bx(g, 0.02, 0.02, 0.12, M.chrome, -0.45, H + 0.2, -0.17);
    // tiles on the wall behind
    bu(g, W, 0.6, 0.02, M.kitchenTile, 0, H, -D / 2 + 0.01);
    // jars + a knife block
    cy(g, 0.05, 0.05, 0.16, M.glass, 0.5, H + 0.08, -0.15, 8);
    cy(g, 0.045, 0.045, 0.12, M.paper, 0.64, H + 0.06, -0.18, 8);
    bu(g, 0.12, 0.2, 0.1, M.woodDark, 0.85, H, -0.15);
    return g;
  },
  stove(W, D, H, M) {
    const g = new THREE.Group();
    bu(g, W, H - 0.08, D - 0.04, M.iron, 0, 0.08, -0.02);
    legs4(g, W, D, 0.08, 0.04, M.iron);
    bu(g, W + 0.02, 0.03, D, M.black, 0, H - 0.03, 0);
    bu(g, W - 0.16, 0.36, 0.015, M.black, 0, 0.2, D / 2 - 0.03);
    bu(g, 0.4, 0.02, 0.03, M.chrome, 0, 0.6, D / 2 - 0.01);
    for (const x of [-0.17, 0.17]) cy(g, 0.09, 0.09, 0.01, M.rust, x, H + 0.005, 0.05, 14);
    cy(g, 0.12, 0.1, 0.16, M.iron, -0.17, H + 0.09, 0.05, 14); // pot
    bu(g, W, 0.6, 0.02, M.kitchenTile, 0, H, -D / 2 + 0.01);
    return g;
  },
  fridge(W, D, H, M) {
    // old rounded fridge; the door hinges on its right edge (local +x)
    const g = new THREE.Group();
    bu(g, W, H - 0.06, D - 0.06, M.fridge, 0, 0.06, -0.03);
    bu(g, W - 0.04, 0.06, D - 0.1, M.black, 0, 0, -0.05);
    // dark interior + shelves visible when open
    bu(g, W - 0.08, H - 0.2, 0.02, M.black, 0, 0.12, D / 2 - 0.07);
    bu(g, W - 0.1, 0.015, D - 0.12, M.chrome, 0, 0.95, -0.02);
    bu(g, W - 0.1, 0.015, D - 0.12, M.chrome, 0, 1.35, -0.02);
    cy(g, 0.04, 0.04, 0.16, M.glass, -0.12, 1.04, -0.05, 8);
    cy(g, 0.05, 0.05, 0.1, M.rust, 0.14, 1.41, -0.05, 8);
    const door = dyn(new THREE.Group());
    door.position.set(W / 2, 0, D / 2 - 0.06);
    bu(door, W, H - 0.1, 0.07, M.fridge, -W / 2, 0.08, 0.035);
    bu(door, 0.03, 0.26, 0.04, M.chrome, -W + 0.08, 1.1, 0.09);
    g.add(door);
    g.userData.door = door; // opens by rotating +y (towards +x side)
    return g;
  },
  table(W, D, H, M) {
    const g = new THREE.Group();
    const tw = W - 0.5, td = D - 0.4;
    bu(g, tw, 0.05, td, M.wood, 0, H - 0.05, 0);
    legs4(g, tw, td, H - 0.05, 0.06, M.woodDark, 0.06);
    const chair = (x, z, ry) => {
      const c = new THREE.Group();
      c.position.set(x, 0, z);
      c.rotation.y = ry;
      bu(c, 0.42, 0.04, 0.4, M.woodDark, 0, 0.45, 0);
      legs4(c, 0.42, 0.4, 0.45, 0.035, M.woodDark, 0.02);
      bu(c, 0.42, 0.5, 0.035, M.woodDark, 0, 0.49, -0.18);
      g.add(c);
      return c;
    };
    chair(-tw / 2 - 0.08, 0, Math.PI / 2);
    chair(tw / 2 + 0.08, 0.1, -Math.PI / 2 - 0.3);
    chair(0, -td / 2 - 0.12, 0);
    chair(0.1, td / 2 + 0.12, Math.PI + 0.2);
    // plates, a cup knocked over
    cy(g, 0.11, 0.1, 0.015, M.porcelain, -0.3, H + 0.008, 0, 14);
    cy(g, 0.11, 0.1, 0.015, M.porcelain, 0.3, H + 0.008, 0.1, 14);
    const cup = cy(g, 0.035, 0.03, 0.08, M.porcelain, 0.05, H + 0.035, -0.2, 8);
    cup.rotation.z = Math.PI / 2;
    candleOn(g, 0, H, 0.05, M);
    return g;
  },
  sofa(W, D, H, M) {
    const g = new THREE.Group();
    bu(g, W, 0.42, D, M.velvet, 0, 0.06, 0);
    bu(g, W - 0.3, 0.12, D - 0.25, M.velvet, 0, 0.48, 0.08);
    bu(g, W, H - 0.06, 0.22, M.velvet, 0, 0.06, -D / 2 + 0.11);
    for (const s of [-1, 1]) bu(g, 0.16, 0.66, D, M.velvet, s * (W / 2 - 0.08), 0.06, 0);
    legs4(g, W, D, 0.06, 0.05, M.woodDark, 0.03);
    const cush = bx(g, 0.4, 0.34, 0.12, M.velvetGreen, -W / 4, 0.74, -D / 2 + 0.3);
    cush.rotation.x = -0.3;
    // a sheet half pulled over it
    bu(g, W * 0.45, 0.02, D + 0.04, M.cloth, W * 0.22, 0.6, 0);
    return g;
  },
  coffeetable(W, D, H, M) {
    const g = new THREE.Group();
    bu(g, W, 0.04, D, M.woodDark, 0, H - 0.04, 0);
    legs4(g, W, D, H - 0.04, 0.04, M.woodDark);
    bu(g, 0.18, 0.04, 0.25, M.redBox, 0.1, H, 0.15); // a book
    cy(g, 0.04, 0.035, 0.07, M.porcelain, -0.15, H + 0.035, -0.2, 10);
    return g;
  },
  fireplace(W, D, H, M) {
    const g = new THREE.Group();
    bu(g, 0.3, H - 0.12, D, M.brick, -W / 2 + 0.15, 0, 0);
    bu(g, 0.3, H - 0.12, D, M.brick, W / 2 - 0.15, 0, 0);
    bu(g, W, 0.42, D, M.brick, 0, H - 0.54, 0);
    bu(g, W - 0.6, H - 0.54, 0.05, M.black, 0, 0, -D / 2 + 0.03);
    bu(g, W + 0.16, 0.08, D + 0.1, M.woodDark, 0, H - 0.12, 0.05); // mantel
    bu(g, W - 0.6, 0.02, D - 0.1, M.black, 0, 0, 0);
    // grate + embers
    bu(g, W - 0.8, 0.06, 0.25, M.iron, 0, 0.04, 0);
    for (let i = 0; i < 6; i++) {
      const e = mesh(new THREE.BoxGeometry(0.1, 0.04, 0.06), M.ember, -0.3 + i * 0.12, 0.11, -0.05 + (i % 2) * 0.08);
      e.rotation.y = i * 0.7;
      g.add(e);
    }
    candleOn(g, -W / 2 + 0.2, H - 0.04, 0.08, M);
    candleOn(g, W / 2 - 0.25, H - 0.04, 0.04, M);
    return g;
  },
  armchair(W, D, H, M) {
    const g = new THREE.Group();
    bu(g, W, 0.4, D, M.velvetGreen, 0, 0.06, 0);
    bu(g, W, H + 0.15, 0.18, M.velvetGreen, 0, 0.06, -D / 2 + 0.09);
    for (const s of [-1, 1]) bu(g, 0.14, 0.62, D, M.velvetGreen, s * (W / 2 - 0.07), 0.06, 0);
    legs4(g, W, D, 0.06, 0.05, M.woodDark, 0.03);
    bu(g, 0.3, 0.02, 0.3, M.cloth, 0, 0.47, 0.05); // doily
    return g;
  },
  wardrobe(W, D, H, M) {
    // hollow so you can hide inside; slatted doors you can peek through
    const g = new THREE.Group();
    const t = 0.04;
    bu(g, W, t, D, M.woodDark, 0, 0.08, 0);
    bu(g, W + 0.06, 0.08, D + 0.04, M.woodDark, 0, H - 0.08, 0);
    bu(g, W, t, D, M.woodDark, 0, H - 0.12, 0);
    for (const s of [-1, 1]) bu(g, t, H - 0.08, D, M.wood, s * (W / 2 - t / 2), 0.08, 0);
    bu(g, W, H - 0.08, t, M.wood, 0, 0.08, -D / 2 + t / 2);
    legs4(g, W, D, 0.08, 0.06, M.woodDark, 0);
    // a coat hanging on each side inside
    for (const s of [-1, 1]) {
      const coat = mesh(lathe([[0.12, 0], [0.14, 0.5], [0.12, 0.9], [0.03, 1.05]]), M.shawl, s * (W / 2 - 0.13), H - 1.3, -0.04);
      coat.scale.z = 0.5;
      g.add(coat);
    }
    const doors = [];
    for (const s of [-1, 1]) {
      const d = dyn(new THREE.Group());
      d.position.set(s * (W / 2), 0.12, D / 2 - 0.01);
      const dw = W / 2 - 0.005;
      const ox = -s * dw / 2;
      bu(d, dw, 0.08, 0.03, M.wood, ox, 0, 0);
      bu(d, dw, 0.08, 0.03, M.wood, ox, H - 0.32, 0);
      bu(d, 0.06, H - 0.24, 0.03, M.wood, ox - (s * dw) / 2 + s * 0.03, 0, 0);
      bu(d, 0.06, H - 0.24, 0.03, M.wood, ox + (s * dw) / 2 - s * 0.03, 0, 0);
      for (let y = 0.12; y < H - 0.36; y += 0.075) {
        const sl = bu(d, dw - 0.1, 0.045, 0.012, M.wood, ox, y, 0);
        sl.rotation.x = -0.5;
      }
      bu(d, 0.02, 0.1, 0.03, M.brass, ox + (s * dw) / 2 - s * 0.06 - 0.01 * s, (H - 0.3) / 2, 0.03);
      g.add(d);
      doors.push({ g: d, s });
    }
    g.userData.wardrobeDoors = doors;
    return g;
  },
  bookshelf(W, D, H, M) {
    const g = new THREE.Group();
    for (const s of [-1, 1]) bu(g, 0.03, H, D, M.woodDark, s * (W / 2 - 0.015), 0, 0);
    bu(g, W, H, 0.02, M.woodDark, 0, 0, -D / 2 + 0.01);
    const cols = [M.redBox, M.velvetGreen, M.paper, M.woodLight, M.cardboard, M.velvet];
    let k = 0;
    for (let i = 0; i < 5; i++) {
      const y = 0.05 + i * (H / 5);
      bu(g, W, 0.03, D, M.woodDark, 0, y, 0);
      let x = -W / 2 + 0.05;
      while (x < W / 2 - 0.12) {
        const bw = 0.03 + ((k * 7) % 5) * 0.01, bh = 0.2 + ((k * 13) % 7) * 0.02;
        if ((k * 11) % 9 === 0) {
          x += 0.08;
          k++;
          continue;
        }
        const b = bu(g, bw, bh, D - 0.08, cols[k % cols.length], x + bw / 2, y + 0.03, 0.02);
        if ((k * 5) % 13 === 0) b.rotation.z = 0.25;
        x += bw + 0.004;
        k++;
      }
    }
    return g;
  },
  boiler(W, D, H, M) {
    const g = new THREE.Group();
    cy(g, 0.5, 0.5, 1.7, M.rust, 0, 1.15, 0, 16);
    cy(g, 0.52, 0.52, 0.06, M.iron, 0, 0.32, 0, 16);
    cy(g, 0.52, 0.52, 0.06, M.iron, 0, 1.98, 0, 16);
    for (const a of [0.5, 2.6, 4.2]) bu(g, 0.06, 0.32, 0.06, M.iron, Math.cos(a) * 0.38, 0, Math.sin(a) * 0.38);
    cy(g, 0.06, 0.06, 1.2, M.iron, 0.2, 2.6, -0.2, 8);
    cy(g, 0.05, 0.05, 1.3, M.rust, -0.3, 2.5, 0.25, 8);
    const gauge = cy(g, 0.07, 0.07, 0.03, M.porcelain, 0, 1.4, 0.51, 14);
    gauge.rotation.x = Math.PI / 2;
    const v = cy(g, 0.08, 0.08, 0.03, M.redBox, 0.36, 0.9, 0.38, 10);
    v.rotation.x = Math.PI / 2;
    return g;
  },
  shelves(W, D, H, M) {
    const g = new THREE.Group();
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) bu(g, 0.03, H, 0.03, M.iron, sx * (W / 2 - 0.02), 0, sz * (D / 2 - 0.02));
    for (let i = 0; i < 4; i++) {
      const y = 0.08 + i * 0.6;
      bu(g, W, 0.02, D, M.woodLight, 0, y, 0);
      for (let k = 0; k < 6; k++) {
        const x = -W / 2 + 0.2 + k * (W / 6.2);
        if ((i * 7 + k * 3) % 5 === 0) continue;
        if ((i + k) % 2) cy(g, 0.05, 0.05, 0.16, (i + k) % 3 ? M.glass : M.rust, x, y + 0.1, ((k % 3) - 1) * 0.08, 8);
        else bu(g, 0.18, 0.16, 0.22, M.cardboard, x, y + 0.02, 0);
      }
    }
    return g;
  },
  workbench(W, D, H, M) {
    const g = new THREE.Group();
    bu(g, W, 0.06, D, M.woodLight, 0, H - 0.06, 0);
    legs4(g, W, D, H - 0.06, 0.07, M.woodDark);
    bu(g, W - 0.1, 0.03, D - 0.1, M.woodDark, 0, 0.18, 0);
    bu(g, 0.12, 0.1, 0.16, M.iron, W / 2 - 0.15, H, 0.15); // vise
    bu(g, W, 0.9, 0.02, M.woodDark, 0, H + 0.2, -D / 2 + 0.01); // pegboard
    for (let i = 0; i < 6; i++) {
      const tool = bx(g, 0.03, 0.3 + (i % 3) * 0.06, 0.02, i % 2 ? M.iron : M.woodDark, -W / 2 + 0.25 + i * 0.3, H + 0.65, -D / 2 + 0.03);
      tool.rotation.z = (i % 3) * 0.2 - 0.2;
    }
    return g;
  },
  toolbox(W, D, H, M) {
    const g = new THREE.Group();
    bu(g, W, H - 0.04, D, M.redBox, 0, 0, 0);
    bu(g, W - 0.04, 0.005, D - 0.04, M.black, 0, H - 0.05, 0);
    const lid = dyn(new THREE.Group());
    lid.position.set(0, H - 0.04, -D / 2);
    bu(lid, W, 0.05, D, M.redBox, 0, 0, D / 2);
    bu(lid, 0.16, 0.02, 0.02, M.chrome, 0, 0.05, D / 2);
    g.add(lid);
    g.userData.lid = lid;
    return g;
  },
  cot(W, D, H, M) {
    const g = new THREE.Group();
    // iron frame, thin mattress, a dirty sheet hanging on the open side
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) bu(g, 0.04, sz < 0 ? 0.75 : H, 0.04, M.iron, sx * (W / 2 - 0.03), 0, sz * (D / 2 - 0.03));
    bu(g, W, 0.04, D, M.iron, 0, 0.36, 0);
    bu(g, W - 0.06, 0.1, D - 0.06, M.cloth, 0, 0.4, 0);
    bu(g, W - 0.1, 0.08, 0.3, M.cloth, 0, 0.5, -D / 2 + 0.25);
    bx(g, W + 0.02, 0.18, 0.01, M.cloth, 0, 0.36, D / 2 + 0.01);
    bu(g, W, 0.05, 0.04, M.iron, 0, 0.7, -D / 2 + 0.03);
    return g;
  },
  pillar(W, D, H, M) {
    const g = new THREE.Group();
    bu(g, W, H, D, M.brick, 0, 0, 0);
    return g;
  },
  barrels(W, D, H, M) {
    const g = new THREE.Group();
    for (const [x, z] of [[-0.12, -0.12], [0.16, 0.18]]) {
      cy(g, 0.22, 0.2, H * 0.92, M.wood, x, (H * 0.92) / 2, z, 12);
      for (const y of [0.15, H * 0.46, H * 0.8]) cy(g, 0.225, 0.225, 0.03, M.iron, x, y, z, 12);
    }
    return g;
  },
  sidetable(W, D, H, M) {
    const g = new THREE.Group();
    bu(g, W, 0.04, D, M.woodDark, 0, H - 0.04, 0);
    legs4(g, W, D, H - 0.04, 0.04, M.woodDark);
    bu(g, 0.16, 0.2, 0.02, M.woodDark, 0.25, H, -0.08); // photo frame
    bu(g, 0.12, 0.14, 0.005, M.portraits[2], 0.25, H + 0.03, -0.068);
    cy(g, 0.05, 0.06, 0.22, M.glass, -0.25, H + 0.11, 0, 10);
    return g;
  },
  bathtub(W, D, H, M) {
    const g = new THREE.Group();
    const t = 0.06;
    bu(g, W, 0.05, D, M.porcelain, 0, 0.12, 0);
    for (const s of [-1, 1]) {
      bu(g, W, H - 0.12, t, M.porcelain, 0, 0.12, s * (D / 2 - t / 2));
      bu(g, t, H - 0.12, D, M.porcelain, s * (W / 2 - t / 2), 0.12, 0);
    }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) cy(g, 0.03, 0.02, 0.12, M.brass, sx * (W / 2 - 0.1), 0.06, sz * (D / 2 - 0.1), 6);
    bu(g, W - 2 * t, 0.01, D - 2 * t, M.stain, 0, 0.18, 0);
    cy(g, 0.015, 0.015, 0.4, M.chrome, -W / 2 + 0.12, H + 0.2, -D / 2 + 0.05, 6);
    return g;
  },
  toilet(W, D, H, M) {
    const g = new THREE.Group();
    cy(g, 0.12, 0.15, 0.38, M.porcelain, 0, 0.19, 0.05, 12);
    const bowl = cy(g, 0.2, 0.16, 0.08, M.porcelain, 0, 0.42, 0.06, 14);
    bowl.scale.z = 1.25;
    bu(g, W - 0.12, 0.38, 0.18, M.porcelain, 0, 0.42, -D / 2 + 0.1);
    return g;
  },
  sink(W, D, H, M) {
    const g = new THREE.Group();
    cy(g, 0.07, 0.1, H - 0.12, M.porcelain, 0, (H - 0.12) / 2, 0, 10);
    bu(g, W, 0.14, D - 0.1, M.porcelain, 0, H - 0.14, 0);
    bu(g, W - 0.12, 0.02, D - 0.24, M.black, 0, H - 0.01, 0.03);
    cy(g, 0.012, 0.012, 0.16, M.chrome, 0, H + 0.08, -D / 2 + 0.1, 6);
    // cracked mirror above
    bu(g, W + 0.06, 0.7, 0.03, M.woodDark, 0, H + 0.45, -D / 2 + 0.03);
    bu(g, W - 0.04, 0.6, 0.01, M.glass, 0, H + 0.5, -D / 2 + 0.05);
    return g;
  },
  cabinet(W, D, H, M) {
    const g = new THREE.Group();
    bu(g, W, H, D, M.painted, 0, 0, 0);
    bu(g, W - 0.08, H / 2 - 0.08, 0.01, M.painted, 0, H / 2 + 0.04, D / 2 + 0.005);
    bu(g, W - 0.08, H / 2 - 0.12, 0.01, M.painted, 0, 0.06, D / 2 + 0.005);
    bu(g, 0.02, 0.1, 0.02, M.brass, W / 2 - 0.08, H / 2 + 0.12, D / 2 + 0.02);
    return g;
  },
  bed(W, D, H, M) {
    // a high old bed with space underneath; sheet drapes over the front edge
    const g = new THREE.Group();
    for (const sx of [-1, 1]) {
      bu(g, 0.08, 1.25, 0.08, M.woodDark, sx * (W / 2 - 0.04), 0, -D / 2 + 0.04); // headboard posts
      bu(g, 0.08, 0.75, 0.08, M.woodDark, sx * (W / 2 - 0.04), 0, D / 2 - 0.04);
    }
    bu(g, W - 0.08, 0.8, 0.05, M.woodDark, 0, 0.4, -D / 2 + 0.04);
    bu(g, W - 0.08, 0.3, 0.05, M.woodDark, 0, 0.4, D / 2 - 0.04);
    for (const sx of [-1, 1]) bu(g, 0.05, 0.12, D, M.woodDark, sx * (W / 2 - 0.04), 0.38, 0);
    bu(g, W - 0.14, 0.18, D - 0.14, M.cloth, 0, 0.47, 0);
    bu(g, W - 0.1, 0.03, D * 0.7, M.cloth, 0, 0.65, D * 0.12);
    bu(g, 0.55, 0.12, 0.32, M.cloth, -W / 4, 0.66, -D / 2 + 0.28);
    bu(g, 0.55, 0.12, 0.32, M.cloth, W / 4, 0.66, -D / 2 + 0.28);
    // overhangs down the sides (leaving a dark slit to look out of)
    for (const sx of [-1, 1]) bu(g, 0.015, 0.36, D * 0.66, M.cloth, sx * (W / 2 + 0.02), 0.32, D * 0.12);
    return g;
  },
  nightstand(W, D, H, M) {
    const g = new THREE.Group();
    bu(g, W, H, D, M.wood, 0, 0, 0);
    bu(g, W - 0.06, 0.16, 0.01, M.woodDark, 0, H - 0.22, D / 2 + 0.005);
    g.userData.candle = candleOn(g, 0.05, H, 0, M);
    cy(g, 0.06, 0.06, 0.02, M.brass, 0.05, H + 0.01, 0, 12);
    return g;
  },
  dresser(W, D, H, M) {
    const g = new THREE.Group();
    bu(g, W, H - 0.04, D, M.wood, 0, 0, -0.01);
    bu(g, W + 0.04, 0.04, D + 0.02, M.woodDark, 0, H - 0.04, 0);
    for (let i = 0; i < 2; i++) {
      bu(g, W - 0.08, 0.26, 0.015, M.woodDark, 0, 0.08 + i * 0.3, D / 2);
      for (const s of [-0.4, 0.4]) bu(g, 0.08, 0.02, 0.03, M.brass, s * W * 0.5, 0.2 + i * 0.3, D / 2 + 0.015);
    }
    // the top drawer slides out (local +z) — the key lies inside it
    const drawer = dyn(new THREE.Group());
    drawer.position.set(0, 0.68, 0);
    bu(drawer, W - 0.08, 0.24, 0.015, M.woodDark, 0, 0, D / 2);
    bu(drawer, W - 0.12, 0.012, D - 0.06, M.woodLight, 0, 0.02, 0.0);
    for (const s of [-1, 1]) bu(drawer, 0.012, 0.16, D - 0.06, M.woodLight, s * (W / 2 - 0.07), 0.02, 0);
    bu(drawer, W - 0.12, 0.16, 0.012, M.woodLight, 0, 0.02, -D / 2 + 0.04);
    for (const s of [-0.4, 0.4]) bu(drawer, 0.08, 0.02, 0.03, M.brass, s * W * 0.5, 0.12, D / 2 + 0.015);
    g.add(drawer);
    g.userData.drawer = drawer;
    // mirror on top
    bu(g, W * 0.6, 0.7, 0.03, M.woodDark, 0, H, -D / 2 + 0.04);
    bu(g, W * 0.6 - 0.08, 0.6, 0.01, M.glass, 0, H + 0.05, -D / 2 + 0.06);
    return g;
  },
  rocker(W, D, H, M) {
    const g = new THREE.Group();
    const r = dyn(new THREE.Group());
    for (const s of [-1, 1]) {
      const runner = bx(r, 0.03, 0.04, D, M.woodDark, s * (W / 2 - 0.08), 0.03, 0);
      runner.rotation.x = 0;
      bu(r, 0.03, 0.42, 0.03, M.woodDark, s * (W / 2 - 0.08), 0.03, D / 2 - 0.15);
      bu(r, 0.03, H - 0.03, 0.03, M.woodDark, s * (W / 2 - 0.08), 0.03, -D / 2 + 0.15);
    }
    bu(r, W - 0.12, 0.04, D - 0.25, M.woodDark, 0, 0.45, 0);
    for (let i = 0; i < 5; i++) bu(r, 0.03, H - 0.5, 0.02, M.woodDark, -0.16 + i * 0.08, 0.49, -D / 2 + 0.15);
    bu(r, W - 0.12, 0.06, 0.04, M.woodDark, 0, H - 0.05, -D / 2 + 0.15);
    bu(r, W - 0.2, 0.03, 0.3, M.cloth, 0, 0.49, 0.02); // a shawl left on it
    g.add(r);
    g.userData.rocker = r;
    return g;
  },
  crates(W, D, H, M) {
    const g = new THREE.Group();
    bu(g, W, H * 0.55, D, M.woodLight, 0, 0, 0);
    bu(g, W * 0.7, H * 0.45, D * 0.7, M.woodLight, -W * 0.1, H * 0.55, 0.05);
    for (const y of [0.15, H * 0.4]) bu(g, W + 0.01, 0.04, D + 0.01, M.woodDark, 0, y, 0);
    return g;
  },
  cratestack(W, D, H, M) {
    const g = new THREE.Group();
    bu(g, W, H * 0.5, D, M.woodLight, 0, 0, 0);
    bu(g, W * 0.8, H * 0.5, D * 0.85, M.cardboard, 0.05, H * 0.5, 0);
    bu(g, W + 0.01, 0.04, D + 0.01, M.woodDark, 0, H * 0.25, 0);
    return g;
  },
  trunk(W, D, H, M) {
    const g = new THREE.Group();
    bu(g, W, H * 0.7, D, M.woodDark, 0, 0, 0);
    const lid = mesh(new THREE.CylinderGeometry(D / 2, D / 2, W, 12, 1, false, 0, Math.PI), M.woodDark, 0, H * 0.7, 0);
    lid.rotation.z = Math.PI / 2;
    lid.scale.set(0.5, 1, 1);
    g.add(lid);
    for (const s of [-0.3, 0.3]) bu(g, 0.04, H * 0.72, D + 0.01, M.brass, s * W, 0, 0);
    return g;
  },
  mannequin(W, D, H, M) {
    const g = new THREE.Group();
    cy(g, 0.18, 0.2, 0.04, M.woodDark, 0, 0.02, 0, 12);
    cy(g, 0.015, 0.015, 0.9, M.iron, 0, 0.47, 0, 6);
    const torso = mesh(lathe([[0.02, 0], [0.17, 0.08], [0.15, 0.3], [0.13, 0.45], [0.19, 0.6], [0.12, 0.72], [0.04, 0.78]]), M.cloth, 0, 0.88, 0);
    torso.scale.z = 0.75;
    g.add(torso);
    const drape = mesh(lathe([[0.26, 0], [0.2, 0.3], [0.16, 0.5], [0.05, 0.62]]), M.dress, 0, 0.58, 0);
    drape.scale.z = 0.8;
    g.add(drape);
    return g;
  },
  draped(W, D, H, M) {
    const g = new THREE.Group();
    bu(g, W, H * 0.9, D, M.cloth, 0, 0, 0);
    const top = mesh(new THREE.SphereGeometry(0.5, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), M.cloth, 0, H * 0.9, 0);
    top.scale.set(W, H * 0.25, D);
    g.add(top);
    return g;
  },
  boxes(W, D, H, M) {
    const g = new THREE.Group();
    bu(g, W, H * 0.55, D, M.cardboard, 0, 0, 0);
    bu(g, W * 0.7, H * 0.45, D * 0.7, M.cardboard, 0.05, H * 0.55, -0.05, 0.3);
    return g;
  },
};

/* ------------------------------------------------------------------ doors */
export function buildDoor(d, M) {
  // pivot at the hinge; panel extends along local +x (or -x) from it
  const g = new THREE.Group();
  const front = d.id === "front";
  const w = d.w - 0.04, h = 2.23;
  const dir = -d.hinge; // panel extends away from the hinge
  const panel = new THREE.Group();
  g.add(panel);
  const mat = front ? M.woodDark : M.wood;
  bu(panel, w, h, 0.05, mat, (dir * w) / 2, 0.01, 0);
  // raised panels
  for (const [py, ph] of front ? [[0.15, 0.85], [1.15, 0.5]] : [[0.15, 0.85], [1.15, 0.85]]) {
    bu(panel, w - 0.22, ph, 0.07, mat, (dir * w) / 2, py, 0);
  }
  if (front) {
    // a small barred window
    bu(panel, w - 0.4, 0.38, 0.08, M.window, (dir * w) / 2, 1.75, 0);
    for (let i = 0; i < 3; i++) bu(panel, 0.02, 0.4, 0.09, M.iron, (dir * w) / 2 + (i - 1) * 0.12, 1.74, 0);
  }
  // knob on both sides
  for (const s of [-1, 1]) {
    const k = mesh(new THREE.SphereGeometry(0.035, 10, 8), M.brass, dir * (w - 0.08), 1.0, s * 0.06);
    panel.add(k);
  }
  const locks = [];
  if (front) {
    for (let i = 0; i < 3; i++) {
      const l = bu(panel, 0.08, 0.1, 0.03, M.iron.clone(), dir * (w - 0.1), 0.65 + i * 0.32, -0.05);
      locks.push(l);
    }
  }
  return { g, panel, locks };
}

/* ------------------------------------------------------------------ key */
export function buildKey(M, tint = 0xb08a3e) {
  const g = new THREE.Group();
  const mat = M.brass.clone();
  mat.color.setHex(tint);
  const ring = mesh(new THREE.TorusGeometry(0.03, 0.009, 6, 14), mat, -0.06, 0, 0);
  ring.rotation.x = Math.PI / 2;
  g.add(ring);
  const shaft = mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.11, 6), mat, 0.02, 0, 0);
  shaft.rotation.z = Math.PI / 2;
  g.add(shaft);
  bx(g, 0.012, 0.006, 0.03, mat, 0.06, 0, 0.012);
  bx(g, 0.012, 0.006, 0.022, mat, 0.04, 0, 0.01);
  g.userData.mat = mat;
  return g;
}

/* ------------------------------------------------------------------ the widow */
export function buildWidow(M) {
  const root = new THREE.Group();
  const hips = new THREE.Group();
  hips.position.y = 0.86;
  root.add(hips);
  // skirt (bottom → top)
  const skirt = mesh(lathe([[0.36, -0.58], [0.33, -0.4], [0.27, -0.1], [0.2, 0.05], [0.17, 0.1]], 16), M.dress, 0, 0, 0);
  hips.add(skirt);
  // legs
  const legs = [];
  for (const s of [-1, 1]) {
    const l = new THREE.Group();
    l.position.set(s * 0.09, 0, 0);
    cy(l, 0.045, 0.035, 0.8, M.stocking, 0, -0.42, 0, 8);
    bx(l, 0.09, 0.07, 0.22, M.black, 0, -0.83, 0.05);
    hips.add(l);
    legs.push(l);
  }
  // hunched torso
  const spine = new THREE.Group();
  spine.position.y = 0.08;
  spine.rotation.x = 0.38;
  hips.add(spine);
  const torso = mesh(lathe([[0.16, 0], [0.18, 0.15], [0.2, 0.35], [0.17, 0.5], [0.08, 0.56]], 14), M.dress, 0, 0, 0);
  torso.scale.z = 0.8;
  spine.add(torso);
  const shawl = mesh(lathe([[0.25, 0.28], [0.24, 0.4], [0.19, 0.5], [0.09, 0.57]], 14), M.shawl, 0, 0, -0.01);
  shawl.scale.z = 0.85;
  spine.add(shawl);
  cy(spine, 0.045, 0.05, 0.12, M.skin, 0, 0.6, 0.02, 8);
  // head
  const head = new THREE.Group();
  head.position.set(0, 0.68, 0.05);
  spine.add(head);
  const skull = mesh(new THREE.SphereGeometry(0.115, 20, 16), M.face, 0, 0, 0);
  skull.scale.set(0.9, 1.12, 0.95);
  head.add(skull);
  const nose = mesh(new THREE.ConeGeometry(0.018, 0.07, 6), M.skin, 0, -0.01, 0.115);
  nose.rotation.x = Math.PI / 2 + 0.3;
  head.add(nose);
  const eyes = [];
  for (const s of [-1, 1]) {
    const e = mesh(new THREE.SphereGeometry(0.009, 6, 6), M.eye, s * 0.032, 0.025, 0.098);
    head.add(e);
    eyes.push(e);
  }
  const hairCap = mesh(new THREE.SphereGeometry(0.125, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.42), M.hair, 0, 0.012, -0.012);
  hairCap.scale.set(0.95, 1.1, 1.0);
  head.add(hairCap);
  const bun = mesh(new THREE.SphereGeometry(0.06, 10, 8), M.hair, 0, 0.09, -0.09);
  head.add(bun);
  for (let i = 0; i < 7; i++) {
    const a = -1.2 + (i / 6) * 2.4;
    const strand = bx(head, 0.008, 0.2 + (i % 3) * 0.06, 0.008, M.hair, Math.sin(a) * 0.11, -0.08 - (i % 3) * 0.03, Math.cos(a) * -0.04);
    strand.rotation.z = Math.sin(a) * 0.15;
  }
  // arms
  const arms = [];
  for (const s of [-1, 1]) {
    const sh = new THREE.Group();
    sh.position.set(s * 0.21, 0.46, 0.02);
    spine.add(sh);
    cy(sh, 0.05, 0.045, 0.32, M.dress, 0, -0.16, 0, 8);
    const el = new THREE.Group();
    el.position.y = -0.32;
    sh.add(el);
    cy(el, 0.032, 0.025, 0.3, M.skin, 0, -0.15, 0, 8);
    const hand = new THREE.Group();
    hand.position.y = -0.31;
    el.add(hand);
    bx(hand, 0.06, 0.07, 0.025, M.skin, 0, -0.03, 0);
    for (let f = 0; f < 4; f++) {
      const fg = bx(hand, 0.011, 0.11, 0.011, M.skin, -0.022 + f * 0.015, -0.12, 0.004);
      fg.rotation.x = 0.15;
    }
    arms.push({ sh, el, hand });
  }
  // lantern in the left hand
  const lantern = new THREE.Group();
  lantern.position.set(0, -0.2, 0.02);
  arms[0].hand.add(lantern);
  cy(lantern, 0.004, 0.004, 0.12, M.iron, 0, 0.0, 0, 4);
  bu(lantern, 0.1, 0.012, 0.1, M.iron, 0, -0.07, 0);
  bu(lantern, 0.1, 0.012, 0.1, M.iron, 0, -0.22, 0);
  const glow = mesh(new THREE.BoxGeometry(0.08, 0.14, 0.08), M.lanternGlass, 0, -0.145, 0);
  lantern.add(glow);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) bu(lantern, 0.01, 0.15, 0.01, M.iron, sx * 0.045, -0.22, sz * 0.045);
  root.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  glow.castShadow = false;
  return { root, hips, spine, head, legs, arms, lantern, glow, skirt, eyes, eyeMat: M.eye };
}
