/**
 * Neon City — a futuristic downtown at night. Two avenues run between the
 * team plazas, an elevated highway crosses the whole map east–west (ramps at
 * both ends, an underpass below), and a central plaza with a holo monument
 * is the main brawl zone. Point-symmetric.
 */
import { makeMap, pathDistance } from "./build.js";
import { fbm, sfbm, smooth } from "../util.js";

const H = 100;
const P = Math.PI;
const BRIDGE_Y = 6.2;

// building blocks [x0, x1, z0, z1] in the south half (mirrored for north)
const BLOCKS = [
  [-64, -36, -70, -53],
  [36, 64, -70, -53],
  [-64, -36, -37, -14],
  [36, 64, -37, -14],
  [-100, -82, -100, -14],
  [82, 100, -100, -14],
  [-100, -64, -100, -96],
  [-22, -10, -70, -54],
  [10, 22, -70, -54],
];

export default () =>
  makeMap({
    id: "neon",
    name: "Neon City",
    theme: "neon",
    blurb: "Glowing towers, rain-slick avenues and an elevated highway over the plaza. Tight urban brawls.",
    H,
    seed: 7321,
    base(x, z) {
      return sfbm(x / 30, z / 30, 3, 2) * 0.05;
    },
    flats: [],
    surface(x, z) {
      return "asphalt";
    },
    paint(x, z, h, slope, paths) {
      // L1 = sidewalk/plaza tiles, L2 = road markings band, L3 = puddles
      const road = pathDistance(paths, x, z, "road");
      const plaza = pathDistance(paths, x, z, "plaza").d < 0 ? 1 : 0;
      const side = road.d > -1.2 && road.d < 0.8 ? 0 : road.d >= 0.8 ? 1 : 0;
      const mark = road.d < -road.width / 2 + 0.35 ? 1 : 0; // centre line
      const puddle = smooth(Math.max(0, Math.min(1, (fbm(x / 7, z / 7, 31, 3) - 0.18) * 4)));
      return [Math.max(side, plaza), mark, puddle * (1 - plaza) * 0.9];
    },
    sun: { az: -0.6, el: 0.55 },
    build(b) {
      const S = (f) => {
        f(1, 0);
        f(-1, P);
      };
      /* ---------- streets (paint) */
      b.path([[-28, -100], [-28, 100]], 16, "road");
      b.path([[28, -100], [28, 100]], 16, "road");
      b.path([[-73, -100], [-73, 100]], 14, "road");
      b.path([[73, -100], [73, 100]], 14, "road");
      b.path([[-100, 0], [100, 0]], 20, "road");
      b.path([[-100, -45], [100, -45]], 14, "road");
      b.path([[-100, 45], [100, 45]], 14, "road");
      b.path([[-100, -84], [100, -84]], 20, "road");
      b.path([[-100, 84], [100, 84]], 20, "road");
      b.path([[0, -30], [0, 30]], 34, "plaza");

      /* ---------- elevated highway: deck from x=-52..52, ramps down to ±84 */
      b.deck("highway", 0, 0, 12, 104, BRIDGE_Y, BRIDGE_Y, { rot: P / 2, rails: true, surface: "asphalt", thick: 0.9 });
      b.deck("highway", -68, 0, 12, 32, 0.05, BRIDGE_Y, { rot: P / 2, rails: true, surface: "asphalt", thick: 0.9, ramp: true });
      b.deck("highway", 68, 0, 12, 32, BRIDGE_Y, 0.05, { rot: P / 2, rails: true, surface: "asphalt", thick: 0.9, ramp: true });
      for (let x = -45; x <= 45; x += 15) if (Math.abs(x) > 2) b.cyl("pillar", x, 0, 1.1, BRIDGE_Y - 0.9, { y: 0 });
      b.cyl("pillar", -56, 0, 1.0, BRIDGE_Y - 1.4, { y: 0 });
      b.cyl("pillar", 56, 0, 1.0, BRIDGE_Y - 1.4, { y: 0 });

      /* ---------- city blocks */
      S((s, r) => {
        let n = 0;
        for (const [x0, x1, z0, z1] of BLOCKS) {
          const w = x1 - x0;
          const d = z1 - z0;
          const cx = ((x0 + x1) / 2) * s;
          const cz = ((z0 + z1) / 2) * s;
          // split long blocks with an alley
          if (d > 40) {
            const a = (d - 8) / 2;
            b.box("tower", cx, (z0 + a / 2) * s, w, a, 24 + ((n * 7) % 30), { y: 0, rot: r, seed: n * 13 + (s > 0 ? 1 : 2) });
            b.box("tower", cx, (z1 - a / 2) * s, w, a, 30 + ((n * 11) % 26), { y: 0, rot: r, seed: n * 17 + (s > 0 ? 3 : 4) });
          } else b.box("tower", cx, cz, w, d, 18 + ((n * 9) % 36), { y: 0, rot: r, seed: n * 7 + (s > 0 ? 5 : 6), sign: n % 2 === 0 });
          n++;
        }
      });
      // outer skyline (outside the arena, render only)
      for (let i = 0; i < 26; i++) {
        const a = (i / 26) * P * 2;
        const R0 = 128 + (i % 3) * 14;
        b.box("tower", Math.cos(a) * R0, Math.sin(a) * R0, 18 + (i % 4) * 4, 18 + ((i * 3) % 5) * 3, 40 + ((i * 13) % 50), { y: 0, rot: a, solid: false, clear: false, seed: 100 + i, far: true });
      }

      /* ---------- team plazas */
      S((s, r) => {
        const team = s > 0 ? 0 : 1;
        b.flag(team, 0, -88 * s);
        for (let i = 0; i < 5; i++) b.spawn(team, (-26 + i * 13) * s, -80 * s, r);
        b.box("barrier", -14 * s, -72 * s, 3.4, 0.9, 1.15, { rot: r + 0.2, glow: true });
        b.box("barrier", 14 * s, -72 * s, 3.4, 0.9, 1.15, { rot: r - 0.2, glow: true });
        b.box("kiosk", -44 * s, -88 * s, 4, 3, 3.2, { rot: r, y: 0 });
        b.box("kiosk", 44 * s, -88 * s, 4, 3, 3.2, { rot: r, y: 0 });
        b.decor("holo", 0, -96 * s, { s: 1.2, rot: r, team });
        b.clear(0, -84 * s, 12);
      });

      /* ---------- central plaza: monument, planters, low cover */
      b.cyl("monument", 0, 0, 3.2, BRIDGE_Y - 1, { y: 0 });
      S((s, r) => {
        b.box("planter", -11 * s, -16 * s, 7, 2.2, 1.1, { rot: r, y: 0 });
        b.box("planter", 11 * s, -16 * s, 7, 2.2, 1.1, { rot: r, y: 0 });
        b.box("planter", -15 * s, 9 * s, 2.2, 6, 1.1, { rot: r, y: 0 });
        b.box("kiosk", 12 * s, 25 * s, 4.5, 3, 3.2, { rot: r + 0.3, y: 0 });
        b.box("busstop", -8 * s, -38 * s, 6, 2, 2.8, { rot: r, y: 0 });
        b.box("car", -23 * s, -24 * s, 2.1, 4.6, 1.5, { rot: r + 0.12, y: 0, seed: 1 });
        b.box("car", -33 * s, -58 * s, 2.1, 4.6, 1.5, { rot: r - 0.05, y: 0, seed: 2 });
        b.box("car", 33 * s, -30 * s, 2.1, 4.6, 1.5, { rot: r + P + 0.2, y: 0, seed: 3 });
        b.box("car", 70 * s, -60 * s, 2.1, 4.6, 1.5, { rot: r + 0.04, y: 0, seed: 4 });
        b.box("car", -76 * s, -30 * s, 2.1, 4.6, 1.5, { rot: r + P - 0.1, y: 0, seed: 5 });
        b.box("car", 20 * s, -46 * s, 4.6, 2.1, 1.5, { rot: r + 0.1, y: 0, seed: 6 });
        b.box("truck", 75 * s, -20 * s, 2.6, 8, 3.2, { rot: r + 0.05, y: 0 });
        b.box("barrier", 28 * s, -8 * s, 3.4, 0.9, 1.15, { rot: r + P / 2, glow: true });
        b.box("barrier", -28 * s, -40 * s, 3.4, 0.9, 1.15, { rot: r + 0.3, glow: true });
        b.box("barrier", 50 * s, -45 * s, 3.4, 0.9, 1.15, { rot: r - 0.2, glow: true });
        b.box("barrier", -54 * s, -45 * s, 3.4, 0.9, 1.15, { rot: r + 0.2, glow: true });
      });
      // street lamps
      S((s, r) => {
        for (let z = -92; z <= -8; z += 18) {
          b.cyl("lamp", -19 * s, z * s, 0.22, 7, { y: 0, rot: r - P / 2 });
          b.cyl("lamp", 19 * s, (z + 9) * s, 0.22, 7, { y: 0, rot: r + P / 2 });
        }
        for (let x = -60; x <= 60; x += 30) b.cyl("lamp", x * s, -54 * s, 0.22, 7, { y: 0, rot: r });
      });
      // a few real lights (bloom does the rest)
      b.light(0, 5, -16, "#ff3ad8", 40, 30);
      b.light(0, 5, 16, "#3ad8ff", 40, 30);
      b.light(-28, 7, -60, "#ffb03a", 30, 28);
      b.light(28, 7, 60, "#ffb03a", 30, 28);
    },
  });
