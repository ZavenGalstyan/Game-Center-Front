/**
 * Desert Fortress — golden dunes around a walled fortress on a raised
 * plateau. Two military outposts face each other north/south; rocky mesas on
 * the flanks give elevated firing positions. Point-symmetric for fairness.
 */
import { makeMap, pathDistance } from "./build.js";
import { fbm, sfbm, ridge, smooth } from "../util.js";

const H = 105;
const P = Math.PI;

export default () =>
  makeMap({
    id: "desert",
    name: "Desert Fortress",
    theme: "desert",
    blurb: "Golden dunes, concrete bunkers and a hilltop fortress. Long sightlines reward patience.",
    H,
    seed: 4111,
    base(x, z) {
      const warp = fbm(x / 70, z / 70, 3, 2) * 1.6;
      const warp2 = fbm(-x / 70, -z / 70, 3, 2) * 1.6;
      // symmetric: average the field with its point reflection
      let h = (ridge(x / 46 + warp, z / 24 + warp * 0.6, 5, 3) + ridge(-x / 46 + warp2, -z / 24 + warp2 * 0.6, 5, 3)) * 1.75 + sfbm(x / 55, z / 55, 9, 3) * 1.3 + 0.4;
      const e = Math.max(Math.abs(x), Math.abs(z));
      if (e > H - 14) h += Math.pow((e - (H - 14)) / 26, 1.7) * 15;
      return h;
    },
    flats: [
      { x: 0, z: 0, r: 25, h: 5.2, fall: 17 },
      { x: 0, z: -86, hw: 32, hd: 13, h: 1.1, fall: 14 },
      { x: 0, z: 86, hw: 32, hd: 13, h: 1.1, fall: 14 },
      { x: -64, z: 4, r: 9, h: 8.2, fall: 22 },
      { x: 64, z: -4, r: 9, h: 8.2, fall: 22 },
      // lanes: soften dunes along the flank roads
      { x: -36, z: -48, hw: 6, hd: 30, rot: -0.45, add: -0.6, fall: 8, strength: 0.6 },
      { x: 36, z: 48, hw: 6, hd: 30, rot: -0.45, add: -0.6, fall: 8, strength: 0.6 },
    ],
    surface(x, z) {
      return Math.hypot(x, z) < 23 ? "concrete" : "sand";
    },
    paint(x, z, h, slope, paths) {
      const road = pathDistance(paths, x, z).d;
      const wRoad = 1 - smooth(Math.min(1, Math.max(0, (road + 1.5) / 3)));
      const wRock = smooth(Math.min(1, Math.max(0, (slope - 0.32) / 0.25)));
      const fort = Math.hypot(x, z);
      const pad = Math.max(1 - smooth(Math.min(1, Math.max(0, (fort - 21) / 3))), Math.abs(z) > 74 && Math.abs(x) < 30 ? 0.55 : 0);
      const ripple = fbm(x / 9, z / 9, 21, 2) * 0.5 + 0.5;
      return [wRoad, wRock, Math.max(pad, ripple * 0.25)];
    },
    sun: { az: 0.75, el: 0.62 },
    build(b) {
      const S = (f) => {
        f(1, 0);
        f(-1, P);
      };
      /* ---------- roads (paint + scatter keep-out) */
      S((s) => {
        b.path([[0, -86 * s], [0, -40 * s], [0, -24 * s]], 8, "road");
        b.path([[-18 * s, -84 * s], [-40 * s, -62 * s], [-58 * s, -30 * s], [-64 * s, 4 * s]], 7, "road");
        b.path([[20 * s, -80 * s], [42 * s, -50 * s], [38 * s, -24 * s], [24 * s, -10 * s]], 6, "road");
      });

      /* ---------- the fortress */
      const F = 20;
      b.wall("fortwall", [[-F, -F], [F, -F], [F, F], [-F, F], [-F, -F]], 1.8, 4.4, { gaps: [[[0.37, 0.63]], [[0.37, 0.63]], [[0.37, 0.63]], [[0.37, 0.63]]], y: 4.7 });
      for (const [x, z] of [[-F, -F], [F, -F], [F, F], [-F, F]]) b.cyl("tower", x, z, 3.3, 11, { y: 4.6 });
      b.box("bunker", 0, 0, 9.5, 7.5, 4.2, { y: 4.9 });
      b.decor("antenna", 2.8, 2.2, { y: 9.1, s: 1.2 });
      S((s, r) => {
        b.box("sandbags", -9 * s, 9 * s, 6.5, 1.4, 1.35, { rot: r + 0.2, y: 4.95 });
        b.box("sandbags", 10 * s, 8 * s, 1.4, 5.5, 1.35, { rot: r, y: 4.95 });
        b.box("crate", 12.5 * s, -11 * s, 2.2, 2.2, 2.2, { rot: r + 0.3, y: 5 });
        b.box("crate", 14.6 * s, -11.6 * s, 1.6, 1.6, 1.6, { rot: r + 0.9, y: 5 });
        b.cyl("barrel", -13 * s, -12.5 * s, 0.6, 1.3, { y: 5.05, solid: false });
        b.cyl("barrel", -12 * s, -13.6 * s, 0.6, 1.3, { y: 5.05, solid: false });
        b.decor("flagpole", -3.5 * s, 3.8 * s, { y: 9.1 });
      });

      /* ---------- outposts (bases) */
      S((s, r) => {
        const z = -86 * s;
        b.flag(s > 0 ? 0 : 1, 0, -90 * s);
        const team = s > 0 ? 0 : 1;
        for (let i = 0; i < 5; i++) b.spawn(team, (-24 + i * 12) * s, -80 * s, r);
        b.box("tent", -26 * s, z - 9 * s, 9, 6, 3.6, { rot: r });
        b.box("tent", 26 * s, z - 9 * s, 9, 6, 3.6, { rot: r });
        b.box("container", -40 * s, z + 2 * s, 2.6, 6.2, 2.6, { rot: r + 0.06, color: "#a24b2b" });
        b.box("container", -40 * s, z + 2 * s, 2.6, 6.2, 2.6, { rot: r + 0.06, color: "#3c6b8a", y: b.height(-40 * s, z + 2 * s) + 2.35, solid: false });
        b.box("container", 40 * s, z - 1 * s, 2.6, 6.2, 2.6, { rot: r - 0.04, color: "#c79a3a" });
        b.cyl("fueltank", 12 * s, z - 12 * s, 2.1, 3.6, { rot: r });
        b.cyl("fueltank", 17 * s, z - 12 * s, 2.1, 3.6, { rot: r });
        for (const x of [-14, -8, 8, 14]) b.box("barrier", x * s, z + 12 * s, 3.2, 0.9, 1.2, { rot: r + (x < 0 ? 0.12 : -0.12) });
        b.box("hesco", -33 * s, z + 13 * s, 6, 1.6, 1.8, { rot: r - 0.5 });
        b.box("hesco", 33 * s, z + 13 * s, 6, 1.6, 1.8, { rot: r + 0.5 });
        b.decor("radio", -33 * s, z - 6 * s, { s: 1 });
        b.decor("floodlight", -6 * s, z - 5 * s, {});
        b.decor("floodlight", 6 * s, z - 5 * s, {});
        b.decor("camonet", 26 * s, z - 2 * s, { rot: r });
        b.clear(0, z, 14);
      });

      /* ---------- mesas on the flanks */
      S((s) => {
        const mx = -64 * s;
        const mz = 4 * s;
        b.rock(mx - 9 * s, mz + 11 * s, 4.5, 8);
        b.rock(mx + 10 * s, mz + 9 * s, 3.5, 6);
        b.rock(mx - 12 * s, mz - 6 * s, 5.2, 9);
        b.rock(mx + 2 * s, mz + 15 * s, 3, 5);
        b.box("sandbags", mx + 5 * s, mz - 2 * s, 5, 1.3, 1.3, { rot: 0.9, y: b.height(mx + 5 * s, mz - 2 * s) - 0.2 });
      });

      /* ---------- bunkers and cover in the dunes */
      S((s, r) => {
        b.box("bunker", -30 * s, -48 * s, 8, 6, 3.4, { rot: r + 0.4 });
        b.box("bunker", 52 * s, -30 * s, 7, 5.5, 3.2, { rot: r - 0.3 });
        b.box("sandbags", -22 * s, -34 * s, 7, 1.4, 1.35, { rot: r + 0.15 });
        b.box("sandbags", 18 * s, -40 * s, 6, 1.4, 1.35, { rot: r - 0.4 });
        b.box("sandbags", 34 * s, -62 * s, 6.5, 1.4, 1.35, { rot: r + 1.1 });
        b.box("hesco", -50 * s, -70 * s, 7, 1.6, 2, { rot: r + 0.7 });
        b.box("hesco", 66 * s, -60 * s, 7, 1.6, 2, { rot: r - 0.8 });
        b.box("wreck", 26 * s, 16 * s, 3.4, 6.4, 2.2, { rot: r + 0.8, variant: "tank" });
        b.box("wreck", -44 * s, -22 * s, 2.6, 6.8, 2.6, { rot: r - 0.3, variant: "truck" });
        b.box("concrete", 78 * s, 26 * s, 1.4, 9, 3, { rot: r + 0.2 });
        b.box("concrete", -80 * s, -34 * s, 1.4, 8, 3, { rot: r - 0.3 });
        b.box("container", 74 * s, -38 * s, 2.6, 6.2, 2.6, { rot: r + 1.3, color: "#8a3a2a", tilt: 0.06 });
        b.cyl("watertower", -84 * s, 60 * s, 3, 3, { colR: 3 });
      });
      // rock formations
      S((s) => {
        for (const [x, z, r, h] of [
          [-34, 46, 4.5, 6],
          [-28, 52, 3.2, 4.5],
          [-41, 40, 3, 4],
          [70, 70, 6, 10],
          [62, 78, 4, 7],
          [80, 58, 4.5, 8],
          [-86, -6, 5.5, 9],
          [42, -10, 2.6, 3.5],
          [-8, 54, 3.4, 4],
          [88, -82, 6, 11],
        ])
          b.rock(x * s, z * s, r, h);
      });

      /* ---------- vegetation and small decor */
      b.scatterSym(7, { x0: -95, x1: 95, z0: -100, z1: -60 }, 2, (x, z, i, k) => {
        b.tree(x, z, 0.9 + k * 0.3, { kind: "palm" });
      });
      b.scatterSym(26, { x0: -100, x1: 100, z0: 0, z1: -100 }, 1.2, (x, z, i, k) => {
        b.decor(k < 0.5 ? "shrub" : "stones", x, z, { s: 0.7 + k * 0.8 });
      });
    },
  });
