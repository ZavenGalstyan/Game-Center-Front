/**
 * Snow Base — a frozen industrial outpost between snowy mountains. A drive-
 * through hangar and a fuel-tank farm hold the centre, rocky ridges with
 * covered tunnels guard both flanks, frozen ponds make tanks slide.
 * Point-symmetric.
 */
import { makeMap, pathDistance } from "./build.js";
import { fbm, sfbm, smooth } from "../util.js";

const H = 105;
const P = Math.PI;
// ice ponds (centre, radius) — mirrored
const PONDS = [
  [-52, 34, 13],
  [52, -34, 13],
];
const RIDGE_X = 72; // east ridge centre (west ridge mirrored at -72)

function ridgeH(x, z) {
  // an elongated ridge along x near (±72, ∓8)
  let h = 0;
  for (const s of [1, -1]) {
    const dx = (x - RIDGE_X * s) / 13;
    const dz = (z + 8 * s) / 22;
    const r = dx * dx + dz * dz;
    h += r < 4 ? 15 * Math.exp(-r * 1.4) : 0;
  }
  return h;
}

export default () =>
  makeMap({
    id: "snow",
    name: "Snow Base",
    theme: "snow",
    blurb: "A frozen industrial base. Slippery ice, a drive-through hangar and tunnels under the ridges.",
    H,
    seed: 9904,
    base(x, z) {
      let h = (fbm(x / 40, z / 40, 4, 4) + fbm(-x / 40, -z / 40, 4, 4)) * 2.0 + sfbm(x / 9, z / 9, 8, 2) * 0.25 + 1.2;
      h += ridgeH(x, z);
      for (const [px, pz, r] of PONDS) {
        const d = Math.hypot(x - px, z - pz);
        if (d < r + 8) h -= (1 - smooth(Math.min(1, Math.max(0, (d - r * 0.6) / (r * 0.4 + 8))))) * 1.6;
      }
      const e = Math.max(Math.abs(x), Math.abs(z));
      if (e > H - 12) h += Math.pow((e - (H - 12)) / 20, 1.5) * 20;
      return h;
    },
    flats: [
      { x: 0, z: 0, hw: 30, hd: 22, h: 1.4, fall: 16 },
      { x: 0, z: -87, hw: 32, hd: 12, h: 1.2, fall: 14 },
      { x: 0, z: 87, hw: 32, hd: 12, h: 1.2, fall: 14 },
      // tunnel cuts through both ridges (run north–south)
      { x: RIDGE_X, z: -8, hw: 6.5, hd: 30, h: 1.3, fall: 2.5 },
      { x: -RIDGE_X, z: 8, hw: 6.5, hd: 30, h: 1.3, fall: 2.5 },
      { x: -30, z: -50, hw: 10, hd: 8, h: 2.0, fall: 9 },
      { x: 30, z: 50, hw: 10, hd: 8, h: 2.0, fall: 9 },
    ],
    surface(x, z) {
      for (const [px, pz, r] of PONDS) if (Math.hypot(x - px, z - pz) < r) return "ice";
      if (Math.abs(x) < 28 && Math.abs(z) < 20) return "concrete";
      return "snow";
    },
    paint(x, z, h, slope, paths) {
      // L1 = packed snow / tyre tracks, L2 = rock, L3 = ice
      const road = pathDistance(paths, x, z).d;
      const wRoad = Math.max(1 - smooth(Math.min(1, Math.max(0, (road + 1) / 3))), Math.abs(x) < 29 && Math.abs(z) < 21 ? 0.9 : 0);
      const wRock = smooth(Math.min(1, Math.max(0, (slope - 0.42) / 0.22)));
      let ice = 0;
      for (const [px, pz, r] of PONDS) ice = Math.max(ice, 1 - smooth(Math.min(1, Math.max(0, (Math.hypot(x - px, z - pz) - r + 1.5) / 3))));
      return [wRoad, wRock, ice];
    },
    sun: { az: 2.3, el: 0.42 },
    build(b) {
      const S = (f) => {
        f(1, 0);
        f(-1, P);
      };
      /* ---------- roads */
      S((s) => {
        b.path([[0, -86 * s], [0, -40 * s], [-12 * s, -22 * s]], 8, "road");
        b.path([[18 * s, -82 * s], [50 * s, -66 * s], [RIDGE_X * s, -40 * s], [RIDGE_X * s, 24 * s]], 7, "road");
        b.path([[-20 * s, -84 * s], [-30 * s, -50 * s], [-26 * s, -24 * s]], 6, "road");
      });

      /* ---------- central facility: hangar (open both ends), control block, fuel farm */
      const hy = 1.1;
      const HW = 11; // half width
      const HL = 14; // half length (along z)
      const HH = 9; // wall height
      b.box("hangarwall", -HW, 0, 1.2, HL * 2, HH, { y: hy });
      b.box("hangarwall", HW, 0, 1.2, HL * 2, HH, { y: hy });
      b.box("hangarroof", 0, 0, HW * 2 + 2, HL * 2 + 1, 1.2, { y: hy + HH, solid: true, clear: true });
      b.decor("hangarframe", 0, 0, { y: hy, w: HW * 2, l: HL * 2, h: HH, rot: 0 });
      S((s, r) => {
        b.box("crate", -6 * s, 8 * s, 2.4, 2.4, 2.4, { rot: r + 0.2, y: hy });
        b.box("crate", -6.5 * s, 10.6 * s, 2, 2, 2, { rot: r + 0.6, y: hy });
        b.box("control", -22 * s, 12 * s, 8, 7, 5.5, { rot: r, y: hy - 0.2 });
        b.decor("radar", -22 * s, 12 * s, { y: hy + 5.3, s: 1 });
        b.cyl("fueltank", 22 * s, 12 * s, 3.4, 7, { y: hy - 0.1 });
        b.cyl("fueltank", 22 * s, 4 * s, 3.4, 7, { y: hy - 0.1 });
        b.cyl("fueltank", 15 * s, 16 * s, 2.4, 5, { y: hy - 0.1 });
        // elevated pipe line on supports (tanks drive under it)
        for (const pz of [-28, -20]) b.box("pipesupport", 14 * s, pz * s, 0.8, 0.8, 4.3, { rot: r });
        b.box("pipe", 14 * s, -24 * s, 1.1, 14, 1.1, { rot: r, y: b.height(14 * s, -24 * s) + 3.6, solid: false });
        b.box("barrier", -8 * s, -26 * s, 3.2, 0.9, 1.2, { rot: r + 0.15 });
        b.box("barrier", 6 * s, -30 * s, 3.2, 0.9, 1.2, { rot: r - 0.25 });
        b.box("container", -34 * s, 10 * s, 2.6, 6.2, 2.6, { rot: r + 0.3, color: "#2f6f9a" });
        b.box("container", 32 * s, -18 * s, 6.2, 2.6, 2.6, { rot: r + 0.1, color: "#a33a2a" });
      });

      /* ---------- ridge tunnels: walls + roof inside the cut */
      S((s, r) => {
        const tx = RIDGE_X * s;
        const tz = -8 * s;
        const L = 26;
        b.box("tunnelwall", tx - 5.6, tz, 1.4, L, 6, { rot: r, y: 1.0 });
        b.box("tunnelwall", tx + 5.6, tz, 1.4, L, 6, { rot: r, y: 1.0 });
        b.box("tunnelroof", tx, tz, 13, L, 1.6, { rot: r, y: 7.0 });
        b.decor("tunnelmouth", tx, tz - (L / 2) * s, { rot: r + P, y: 1.0 });
        b.decor("tunnelmouth", tx, tz + (L / 2) * s, { rot: r, y: 1.0 });
        b.light(tx, 5.2, tz, "#9fd8ff", 22, 18);
      });

      /* ---------- bases */
      S((s, r) => {
        const team = s > 0 ? 0 : 1;
        b.flag(team, 0, -90 * s);
        for (let i = 0; i < 5; i++) b.spawn(team, (-24 + i * 12) * s, -80 * s, r);
        b.box("prefab", -28 * s, -95 * s, 10, 5, 3.4, { rot: r });
        b.box("prefab", 28 * s, -95 * s, 10, 5, 3.4, { rot: r });
        b.box("hesco", -14 * s, -72 * s, 6, 1.6, 1.9, { rot: r + 0.25 });
        b.box("hesco", 14 * s, -72 * s, 6, 1.6, 1.9, { rot: r - 0.25 });
        b.cyl("fueltank", 40 * s, -88 * s, 2.2, 4, {});
        b.decor("floodlight", -8 * s, -94 * s, {});
        b.decor("floodlight", 8 * s, -94 * s, {});
        b.clear(0, -84 * s, 14);
      });

      /* ---------- mid-field cover */
      S((s, r) => {
        b.box("bunker", -37 * s, -55 * s, 8, 6, 3.4, { rot: r + 0.2 });
        b.box("concrete", 44 * s, -46 * s, 1.4, 9, 3, { rot: r + 0.6 });
        b.box("concrete", -8 * s, -58 * s, 9, 1.4, 3, { rot: r + 0.1 });
        b.box("wreck", 10 * s, -44 * s, 2.6, 6.8, 2.6, { rot: r + 0.9, variant: "truck" });
        b.box("container", -60 * s, -64 * s, 2.6, 6.2, 2.6, { rot: r - 0.5, color: "#c9a23a" });
        b.box("container", -86 * s, 40 * s, 2.6, 6.2, 2.6, { rot: r + 0.2, color: "#4a6a3a" });
        b.rock(-74 * s, -46 * s, 4, 5);
        b.rock(-40 * s, -80 * s, 3.4, 4);
        b.rock(86 * s, -66 * s, 4.6, 6);
        b.rock(56 * s, 26 * s, 3, 3.5);
        b.rock(-16 * s, -40 * s, 2.4, 2.6);
        b.decor("pylon", -46 * s, -24 * s, { s: 1 });
      });
      // snowy pines on the slopes
      b.scatterSym(30, { x0: -100, x1: 100, z0: -6, z1: -100 }, 1.8, (x, z, i, k) => {
        if (Math.abs(x) < 34 && Math.abs(z) < 26) return false;
        for (const [px, pz, r] of PONDS) if (Math.hypot(x - px, z - pz) < r + 3) return false;
        if (b.height(x, z) > 7) return false;
        b.tree(x, z, 0.8 + k * 0.6, { kind: "snowpine" });
      });
      b.scatterSym(26, { x0: -100, x1: 100, z0: 0, z1: -100 }, 1, (x, z, i, k) => {
        b.decor(k < 0.6 ? "snowrock" : "snowbush", x, z, { s: 0.6 + k });
      });
      for (let i = 0; i < 120; i++) {
        const a = b.R() * P * 2;
        const R0 = H + 6 + b.R() * 40;
        const x = Math.cos(a) * R0 * 1.2;
        const z = Math.sin(a) * R0 * 1.2;
        if (Math.max(Math.abs(x), Math.abs(z)) < H + 4) continue;
        b.decor("snowpine", x, z, { s: 1.1 + b.R() * 0.7, far: true });
      }
    },
  });

export { PONDS };
