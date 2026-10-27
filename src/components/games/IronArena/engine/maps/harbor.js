/**
 * Industrial Harbor — a concrete dock peninsula between two basins. Container
 * yards form lanes, gantry cranes straddle the quays, a raised loading
 * platform (ramps at both ends) gives the high ground, and piers jut out
 * over the water. Point-symmetric.
 */
import { makeMap, pathDistance } from "./build.js";
import { fbm, sfbm, smooth } from "../util.js";

const H = 105;
const P = Math.PI;
const DOCK = 1.6;
const QUAY = 76; // |x| of the quay edge
const PLAT = DOCK + 3.2;

export default () =>
  makeMap({
    id: "harbor",
    name: "Industrial Harbor",
    theme: "harbor",
    blurb: "Container mazes, giant cranes and a raised loading platform on a busy coastal dock.",
    H,
    seed: 3141,
    water: { level: 0, slow: 0.4, sea: true },
    base(x, z) {
      const ax = Math.abs(x);
      if (ax < QUAY - 0.5) return DOCK + sfbm(x / 20, z / 20, 5, 2) * 0.04;
      if (ax < QUAY + 0.5) return DOCK - (ax - QUAY + 0.5) * 7.6;
      return -6 + sfbm(x / 30, z / 30, 3, 2) * 0.8;
    },
    flats: [],
    surface(x, z) {
      return Math.abs(x) < QUAY ? "concrete" : "water";
    },
    paint(x, z, h, slope, paths) {
      // L1 = asphalt lanes, L2 = painted yard lines / hazard, L3 = stains
      const road = pathDistance(paths, x, z, "road");
      const wRoad = 1 - smooth(Math.min(1, Math.max(0, (road.d + 0.5) / 1.5)));
      const line = road.d > -0.6 && road.d < -0.2 ? 1 : 0;
      const quay = Math.abs(x) > QUAY - 2.2 && Math.abs(x) < QUAY ? 1 : 0;
      const stain = smooth(Math.max(0, Math.min(1, (fbm(x / 11, z / 11, 13, 3) - 0.1) * 3)));
      return [wRoad, Math.max(line, quay), stain * 0.8];
    },
    sun: { az: -1.9, el: 0.5 },
    build(b) {
      const S = (f) => {
        f(1, 0);
        f(-1, P);
      };
      const Y = DOCK - 0.05;
      /* ---------- lanes */
      b.path([[0, -100], [0, 100]], 12, "road");
      b.path([[-60, -100], [-60, 100]], 9, "road");
      b.path([[60, -100], [60, 100]], 9, "road");
      b.path([[-QUAY, -62], [QUAY, -62]], 9, "road");
      b.path([[-QUAY, 62], [QUAY, 62]], 9, "road");
      b.path([[-QUAY, 0], [QUAY, 0]], 10, "road");

      /* ---------- quay walls (block tanks from the sea) with pier gaps */
      S((s, r) => {
        // east quay for s=1 has a pier at z = -30 (gap -36..-24)
        b.box("quay", QUAY * s + 0.6 * s, (-108 + -36) / 2 * s, 1.2, 72, 10.5, { y: -6, rot: r, invisible: true });
        b.box("quay", QUAY * s + 0.6 * s, (-24 + 108) / 2 * s, 1.2, 132, 10.5, { y: -6, rot: r, invisible: true });
        b.deck("pier", (QUAY + 10) * s, -30 * s, 12, 24, DOCK, DOCK, { rot: r + P / 2, rails: true, surface: "wood", thick: 0.8 });
        b.box("quay", (QUAY + 22.6) * s, -30 * s, 1.2, 12, 10.5, { y: -6, rot: r, invisible: true });
        for (let i = 0; i < 4; i++) for (const dz of [-5, 5]) b.cyl("post", (QUAY + 3 + i * 6) * s, (-30 + dz) * s, 0.4, DOCK + 6, { y: -6, solid: false });
        for (let z = -96; z <= 96; z += 12) if (Math.abs(z + 30 * s) > 8) b.decor("bollard", (QUAY - 1.2) * s, z * s, { y: Y });
      });

      /* ---------- raised loading platform in the middle (runs along x) */
      b.deck("platform", 0, 0, 16, 26, PLAT, PLAT, { rot: P / 2, thick: 3.6, surface: "concrete", rails: false, edge: true });
      b.deck("platform", -21, 0, 10, 16, DOCK + 0.02, PLAT, { rot: P / 2, thick: 3.6, surface: "concrete", ramp: true, rails: true });
      b.deck("platform", 21, 0, 10, 16, PLAT, DOCK + 0.02, { rot: P / 2, thick: 3.6, surface: "concrete", ramp: true, rails: true });
      S((s, r) => {
        b.box("crate", -8 * s, 5.4 * s, 2.2, 2.2, 2.2, { y: PLAT, rot: r + 0.3 });
        b.box("barrier", 6 * s, -5.6 * s, 3.2, 0.9, 1.2, { y: PLAT, rot: r });
      });

      /* ---------- container yards */
      const COLS = ["#b5342a", "#2b6fa8", "#d39a2c", "#3e8a4f", "#7a3d8a", "#c4572a", "#4a5560", "#e2e2dc", "#1f7f86"];
      let ci = 0;
      const stackRow = (x0, z0, n, heights, rot, long = true, gap = 0.25) => {
        const c = Math.cos(rot);
        const s = Math.sin(rot);
        for (let i = 0; i < n; i++) {
          const off = (i - (n - 1) / 2) * (2.6 + gap);
          const x = x0 + off * c;
          const z = z0 - off * s;
          const hgt = heights[i % heights.length];
          const L = long ? 12.2 : 6.1;
          for (let k = 0; k < hgt; k++) b.box("container", x, z, 2.5, L, 2.6, { rot: rot + (k % 2 ? 0.015 : -0.01), y: Y + k * 2.6, color: COLS[ci++ % COLS.length], solid: k === 0, long, clear: k === 0 });
          // one tall collider for the whole stack
          if (hgt > 1) b.box("stack", x, z, 2.5, L, 2.6 * hgt, { rot, y: Y, invisible: true, clear: false });
        }
      };
      S((s, r) => {
        stackRow(-42 * s, -42 * s, 5, [2, 1, 3, 2, 1], r);
        stackRow(-22 * s, -44 * s, 3, [1, 2, 1], r, false);
        stackRow(38 * s, -40 * s, 4, [3, 2, 2, 1], r + P / 2);
        stackRow(40 * s, -18 * s, 3, [1, 2, 1], r + P / 2, false);
        stackRow(-38 * s, -18 * s, 4, [1, 1, 2, 1], r + P / 2);
        stackRow(36 * s, -74 * s, 2, [1, 1], r + 0.1, false);
        stackRow(-44 * s, -80 * s, 3, [2, 1, 1], r);
        stackRow(26 * s, -28 * s, 2, [1, 2], r, false);
      });

      /* ---------- gantry cranes straddling the quays */
      S((s, r) => {
        const cx = (QUAY - 8) * s;
        const cz = -48 * s;
        for (const lx of [-6.5, 6.5])
          for (const lz of [-7, 7]) b.box("craneleg", cx + lx * s, cz + lz * s, 1.4, 1.4, 22, { rot: r, y: Y, clear: false });
        b.decor("crane", cx, cz, { y: Y, rot: r, w: 13, l: 14 });
        // yard crane over the container row
        for (const lx of [-9.5, 9.5]) for (const lz of [-8, 8]) b.box("craneleg", -42 * s + lx * s, -42 * s + lz * s, 1, 1, 15, { rot: r, y: Y, clear: false, small: true });
        b.decor("yardcrane", -42 * s, -42 * s, { y: Y, rot: r, w: 19, l: 16 });
      });

      /* ---------- warehouses, tanks, rail */
      S((s, r) => {
        b.box("warehouse", -30 * s, -98 * s, 30, 10, 10, { rot: r, y: Y });
        b.box("warehouse", 62 * s, -84 * s, 16, 24, 9, { rot: r, y: Y });
        b.cyl("oiltank", -66 * s, -62 * s, 5, 9, { y: Y });
        b.cyl("oiltank", -66 * s, -48 * s, 4, 7.5, { y: Y });
        b.decor("rails", -54 * s, -30 * s, { y: Y, rot: r, l: 140 });
        b.box("traincar", -54 * s, -18 * s, 3, 14, 3.6, { rot: r, y: Y + 0.2 });
        b.box("forklift", 8 * s, -48 * s, 1.6, 3, 2.2, { rot: r + 0.9, y: Y });
        b.box("truck", 52 * s, -6 * s, 2.6, 8, 3.2, { rot: r + 0.2, y: Y });
        b.box("barrier", -10 * s, -62 * s, 3.2, 0.9, 1.2, { rot: r + 0.2, y: Y });
        b.box("barrier", 12 * s, -58 * s, 3.2, 0.9, 1.2, { rot: r - 0.3, y: Y });
        b.box("crate", 30 * s, -66 * s, 2.2, 2.2, 2.2, { rot: r + 0.5, y: Y });
        b.box("crate", -20 * s, -24 * s, 2.2, 2.2, 2.2, { rot: r + 0.2, y: Y });
        b.decor("lamp", 0, -40 * s, { y: Y });
        b.decor("lamp", -60 * s, -10 * s, { y: Y });
      });

      /* ---------- bases */
      S((s, r) => {
        const team = s > 0 ? 0 : 1;
        b.flag(team, 0, -88 * s);
        for (let i = 0; i < 5; i++) b.spawn(team, (-24 + i * 12) * s, -80 * s, r);
        b.box("hesco", -12 * s, -71 * s, 6, 1.6, 1.9, { rot: r + 0.2, y: Y });
        b.box("hesco", 12 * s, -71 * s, 6, 1.6, 1.9, { rot: r - 0.2, y: Y });
        b.decor("floodlight", -8 * s, -95 * s, { y: Y });
        b.decor("floodlight", 8 * s, -95 * s, { y: Y });
        b.clear(0, -84 * s, 12);
      });

      /* ---------- out at sea (render only) */
      S((s, r) => {
        b.decor("ship", 122 * s, 20 * s, { y: 0, rot: r, far: true });
        b.decor("buoy", 92 * s, 60 * s, { y: 0, far: true });
        b.decor("buoy", 96 * s, -70 * s, { y: 0, far: true });
      });
    },
  });
