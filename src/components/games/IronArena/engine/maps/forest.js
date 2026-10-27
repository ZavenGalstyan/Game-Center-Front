/**
 * Forest Battlefield — green rolling hills split by a shallow river
 * (wadeable, but slow) with two wooden bridges. Dirt roads, an abandoned
 * farmstead and a ruined chapel, stone walls and dense pine stands for cover.
 * Point-symmetric.
 */
import { makeMap, pathDistance } from "./build.js";
import { fbm, sfbm, smooth } from "../util.js";

const H = 105;
const P = Math.PI;
const WATER = -0.55;
// river centre line z(x) — odd function so the map stays point-symmetric
const riverZ = (x) => 9 * Math.sin(x / 26);
const BRIDGES = [-46, 46];

function riverCarve(x, z) {
  const d = Math.abs(z - riverZ(x));
  const half = 8;
  if (d > half + 7) return 0;
  return (1 - smooth(Math.min(1, Math.max(0, (d - half * 0.55) / (half * 0.45 + 7))))) * 2.6;
}

export default () =>
  makeMap({
    id: "forest",
    name: "Forest Battlefield",
    theme: "forest",
    blurb: "Rolling green hills, a shallow river and wooden bridges. Fight from the tree lines.",
    H,
    seed: 5507,
    water: { level: WATER, slow: 0.5 },
    base(x, z) {
      const k = 1 - smooth(Math.min(1, Math.abs(z - riverZ(x)) / 30));
      // symmetric noise (f(p) + f(-p)) keeps the terrain point-symmetric
      let h = (fbm(x / 48, z / 48, 2, 4) + fbm(-x / 48, -z / 48, 2, 4)) * 2.9 * (1 - 0.65 * k) + sfbm(x / 13, z / 13, 7, 2) * 0.35 + 1.0;
      // symmetric hills
      for (const s of [1, -1]) {
        h += 4.4 * Math.exp(-(((x - 8 * s) / 18) ** 2) - ((z + 44 * s) / 12) ** 2);
        h += 3.2 * Math.exp(-(((x + 66 * s) / 15) ** 2) - ((z + 52 * s) / 14) ** 2);
      }
      h -= riverCarve(x, z);
      const e = Math.max(Math.abs(x), Math.abs(z));
      if (e > H - 12) h += Math.pow((e - (H - 12)) / 22, 1.6) * 13;
      return h;
    },
    flats: [
      { x: 0, z: -87, hw: 32, hd: 12, h: 1.6, fall: 14 },
      { x: 0, z: 87, hw: 32, hd: 12, h: 1.6, fall: 14 },
      // bridge approaches
      { x: -46, z: riverZ(-46) - 14, hw: 5, hd: 6, h: 1.3, fall: 8 },
      { x: -46, z: riverZ(-46) + 14, hw: 5, hd: 6, h: 1.3, fall: 8 },
      { x: 46, z: riverZ(46) - 14, hw: 5, hd: 6, h: 1.3, fall: 8 },
      { x: 46, z: riverZ(46) + 14, hw: 5, hd: 6, h: 1.3, fall: 8 },
      // farmstead + chapel pads
      { x: -58, z: 40, hw: 14, hd: 11, h: 2.6, fall: 10 },
      { x: 58, z: -40, hw: 14, hd: 11, h: 2.6, fall: 10 },
    ],
    surface(x, z, h) {
      if (h < WATER + 0.3) return "mud";
      return "grass";
    },
    paint(x, z, h, slope, paths) {
      const road = pathDistance(paths, x, z).d;
      const wRoad = 1 - smooth(Math.min(1, Math.max(0, (road + 1.2) / 2.6)));
      const bank = 1 - smooth(Math.min(1, Math.max(0, (h - WATER - 0.05) / 0.45)));
      const wRock = Math.max(smooth(Math.min(1, Math.max(0, (slope - 0.38) / 0.25))), bank * 0.6);
      const meadow = smooth(Math.min(1, Math.max(0, fbm(x / 22, z / 22, 41, 3) * 1.6 + 0.2)));
      return [wRoad, wRock, meadow];
    },
    sun: { az: 1.1, el: 0.7 },
    build(b) {
      const S = (f) => {
        f(1, 0);
        f(-1, P);
      };
      const gy = (x, z) => b.height(x, z);
      /* ---------- roads */
      S((s) => {
        b.path([[0, -86 * s], [-20 * s, -60 * s], [-38 * s, -36 * s], [-46 * s, (riverZ(-46) - 14) * s], [-46 * s, (riverZ(-46) - 4) * s]], 6.5, "road");
        b.path([[14 * s, -84 * s], [34 * s, -62 * s], [46 * s, (riverZ(46) - 14) * s], [46 * s, (riverZ(46) - 4) * s]], 6, "road");
        b.path([[-46 * s, (riverZ(-46) + 12) * s], [-52 * s, 30 * s]], 5, "road");
      });

      /* ---------- wooden bridges (each bridge appears once; positions are symmetric) */
      for (const bx of BRIDGES) {
        const rz = riverZ(bx);
        const top = 1.35;
        b.deck("woodbridge", bx, rz, 8, 22, top, top, { rails: true, surface: "wood", thick: 0.6 });
        for (const dz of [-5, 0, 5]) for (const dx of [-3.3, 3.3]) b.cyl("post", bx + dx, rz + dz, 0.32, top - WATER + 1.4, { y: WATER - 1.4, solid: false });
      }

      /* ---------- bases */
      S((s, r) => {
        const team = s > 0 ? 0 : 1;
        b.flag(team, 0, -90 * s);
        for (let i = 0; i < 5; i++) b.spawn(team, (-24 + i * 12) * s, -81 * s, r);
        b.box("cabin", -28 * s, -94 * s, 9, 6, 4.2, { rot: r });
        b.box("logpile", 24 * s, -94 * s, 6, 2.4, 1.6, { rot: r + 0.1 });
        b.box("sandbags", -12 * s, -73 * s, 6, 1.4, 1.35, { rot: r + 0.2 });
        b.box("sandbags", 12 * s, -73 * s, 6, 1.4, 1.35, { rot: r - 0.2 });
        b.box("crate", 34 * s, -86 * s, 2.2, 2.2, 2.2, { rot: r + 0.4 });
        b.decor("camonet", -28 * s, -84 * s, { rot: r });
        b.decor("radio", 30 * s, -80 * s, {});
        b.clear(0, -84 * s, 14);
      });

      /* ---------- farmstead / chapel ruins on their pads */
      S((s, r) => {
        const fx = -58 * s;
        const fz = 40 * s;
        const y = gy(fx, fz) - 0.3;
        b.wall("ruin", [[fx - 9 * s, fz - 6 * s], [fx + 9 * s, fz - 6 * s], [fx + 9 * s, fz + 6 * s], [fx - 9 * s, fz + 6 * s], [fx - 9 * s, fz - 6 * s]], 1, 3.6, { y, gaps: [[[0.35, 0.65]], [[0.2, 0.55]], [[0.5, 1]], [[0.4, 0.7]]] });
        b.box("barn", fx + 2 * s, fz + 18 * s, 14, 9, 6.5, { rot: r + 0.05 });
        b.cyl("silo", fx - 14 * s, fz + 16 * s, 2.6, 9, {});
        b.cyl("haybale", fx + 14 * s, fz - 2 * s, 1.1, 1.6, { rot: r, lying: true });
        b.cyl("haybale", fx + 15 * s, fz + 1 * s, 1.1, 1.6, { rot: r, lying: true });
        b.decor("cart", fx - 3 * s, fz - 11 * s, {});
      });

      /* ---------- stone walls, logs, rocks */
      S((s, r) => {
        b.wall("stonewall", [[-20 * s, -30 * s], [-6 * s, -26 * s], [6 * s, -28 * s]], 1.1, 1.4, { gaps: [[], []] });
        b.wall("stonewall", [[22 * s, -58 * s], [40 * s, -50 * s]], 1.1, 1.4, {});
        b.wall("stonewall", [[-78 * s, -20 * s], [-70 * s, -4 * s]], 1.1, 1.4, {});
        b.box("log", 18 * s, -22 * s, 1.1, 9, 1.0, { rot: r + 0.9 });
        b.box("log", -32 * s, -64 * s, 1.1, 8, 1.0, { rot: r - 0.4 });
        b.box("log", 70 * s, -14 * s, 1.1, 9, 1.0, { rot: r + 0.2 });
        b.rock(-14 * s, -48 * s, 2.6, 3);
        b.rock(30 * s, -30 * s, 3.2, 3.6);
        b.rock(80 * s, -64 * s, 4.5, 6);
        b.rock(-86 * s, -48 * s, 4, 5);
        b.rock(4 * s, -16 * s, 2.2, 2.5);
        b.box("wreck", -24 * s, -18 * s, 3.4, 6.4, 2.2, { rot: r + 2.1, variant: "tank" });
        b.box("watchtower", 84 * s, -84 * s, 4, 4, 9, { rot: r });
      });

      /* ---------- pine stands (cover clusters) + undergrowth */
      const stands = [
        [-34, -50, 11, 12],
        [64, -72, 13, 12],
        [-74, -76, 12, 10],
        [10, -60, 7, 6],
        [-86, 10, 10, 9],
        [24, -10, 7, 6],
        [-62, -14, 9, 8],
        [86, -30, 9, 9],
      ];
      for (const [x, z, r, n] of stands)
        b.scatterSym(n, { x, z, r }, 1.6, (tx, tz, i, k) => {
          if (gy(tx, tz) < WATER + 0.5) return false;
          b.tree(tx, tz, 0.85 + k * 0.5, { kind: k < 0.7 ? "pine" : "oak" });
        });
      b.scatterSym(14, { x0: -100, x1: 100, z0: -14, z1: -100 }, 1.8, (tx, tz, i, k) => {
        if (gy(tx, tz) < WATER + 0.6) return false;
        b.tree(tx, tz, 0.8 + k * 0.6, { kind: k < 0.6 ? "pine" : "oak" });
      });
      S((s) => {
        b.scatter(60, { x0: -100, x1: 100, z0: 0, z1: -100 * s }, 0.6, (tx, tz) => {
          b.decor(b.R() < 0.55 ? "bush" : b.R() < 0.6 ? "fern" : "stones", tx, tz, { s: 0.6 + b.R() * 0.8 });
        });
        b.scatter(14, { x0: -100, x1: 100, z0: -2 * s, z1: -20 * s }, 0.8, (tx, tz) => {
          const h = gy(tx, tz);
          if (h > WATER + 0.4 || h < WATER - 0.8) return false;
          b.decor("reeds", tx, tz, { s: 0.8 + b.R() * 0.5 });
        });
      });
      // forest outside the boundary (render only)
      for (let i = 0; i < 140; i++) {
        const a = b.R() * P * 2;
        const R0 = H + 4 + b.R() * 45;
        const x = Math.max(-H - 50, Math.min(H + 50, Math.cos(a) * R0 * 1.25));
        const z = Math.max(-H - 50, Math.min(H + 50, Math.sin(a) * R0 * 1.25));
        if (Math.max(Math.abs(x), Math.abs(z)) < H + 3) continue;
        b.decor("pine", x, z, { s: 1 + b.R() * 0.6, far: true });
      }
    },
  });

export { riverZ };
