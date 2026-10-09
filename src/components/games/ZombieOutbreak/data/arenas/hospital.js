/**
 * Arena 3 — Ruined Hospital (ceiling 5 m).
 *
 *   z −24 ┌ room A ┬ room B ┬ room C ┬ room D ┐
 *         │        │        │        │        │   (doors onto the corridor)
 *   z −14 ├──────── north corridor ───────────┤
 *   z  −9 │ west   ├──── LOBBY ────┤  east    │
 *         │ ward   │  (reception)  │  waiting │
 *   z   9 ├────────┼───── ER ──────┼──────────┤
 *         │ stair  │  ambulance    │  stair   │
 *   z  24 └ store ─┴───────────────┴─ store ──┘
 *        x −30    −12             12        30
 */
import { wall, box, light, deco, car } from "../arenaKit.js";

const TUBE = "#e8f4ff";
const P = "#b8b29e"; // plaster
const W = (x0, z0, x1, z1, extra) => wall(x0, z0, x1, z1, 5, 0.4, "plaster", { color: P, band: "#4d6b66", ...extra });

export const HOSPITAL = {
  id: "hospital",
  name: "Ruined Hospital",
  floorSurface: "concrete",
  baseFloor: "tile",
  bounds: { minX: -30, maxX: 30, minZ: -24, maxZ: 24 },
  ceiling: { h: 5, mat: "concrete", color: "#5a5852" },
  theme: {
    fog: "#0e1312",
    fogNear: 10,
    fogFar: 46,
    hemiSky: "#9fb8b0",
    hemiGround: "#2a2a26",
    hemi: 0.5,
    moon: "#c0d8d0",
    moonInt: 0.3,
    moonDir: [0.2, 1, 0.3],
    exposure: 1.1,
    ambience: "hospital",
  },
  floors: [
    { x: 0, z: 0, w: 24, d: 18, mat: "tile", tile: 4 },
    { x: 0, z: -11.5, w: 60, d: 5, mat: "tileGreen", tile: 3 },
    { x: -21, z: 0, w: 18, d: 18, mat: "tileGreen", tile: 3 },
    { x: 21, z: 0, w: 18, d: 18, mat: "tile", tile: 4 },
    { x: 0, z: 16.5, w: 24, d: 15, mat: "concrete" },
  ],
  solids: [
    // Lobby.
    W(-12, -9, -2, -9),
    W(2, -9, 12, -9),
    W(-12, 9, -3, 9),
    W(3, 9, 12, 9),
    W(-12, -9, -12, -2),
    W(-12, 2, -12, 9),
    W(12, -9, 12, -2),
    W(12, 2, 12, 9),
    // North corridor: north side with four room doors.
    W(-30, -14, -21.8, -14),
    W(-18.2, -14, -7.8, -14),
    W(-4.2, -14, 6.2, -14),
    W(9.8, -14, 19.2, -14),
    W(22.8, -14, 30, -14),
    // Room dividers.
    W(-13, -24, -13, -14),
    W(1, -24, 1, -14),
    W(15, -24, 15, -14),
    // Ward / waiting south of the corridor (door gaps near x = ±20.7).
    W(-30, -9, -22.6, -9),
    W(-18.8, -9, -12, -9),
    W(12, -9, 18.8, -9),
    W(22.6, -9, 30, -9),
    // South: ward / waiting walls, ER sides with stair-store doors.
    W(-30, 9, -12, 9),
    W(12, 9, 30, 9),
    W(-12, 9, -12, 15.2),
    W(-12, 19, -12, 24),
    W(12, 9, 12, 15.2),
    W(12, 19, 12, 24),
    // Lobby furniture.
    box("counter", 0, -4.6, 6, 1.2, 1.15),
    box("pillar", -6.5, 4, 0.7, 0.7, 5, 0, { color: "#8a8478" }),
    box("pillar", 6.5, 4, 0.7, 0.7, 5, 0, { color: "#8a8478" }),
    // West ward beds.
    box("bed", -26.4, -6.6, 1.0, 2.1, 0.9),
    box("bed", -23, -6.6, 1.0, 2.1, 0.9),
    box("bed", -16, -6.6, 1.0, 2.1, 0.9),
    box("bed", -26.4, 6.6, 1.0, 2.1, 0.9),
    box("bed", -23, 6.6, 1.0, 2.1, 0.9),
    box("bed", -19, 6.6, 1.0, 2.1, 0.9),
    box("bed", -15, 6.6, 1.0, 2.1, 0.9),
    box("cabinet", -29.4, 0, 0.6, 2.4, 1.8, 0, { color: "#7a8288" }),
    // East waiting wing.
    box("desk", 21, 2, 3, 1.2, 0.95),
    box("vending", 29.3, -5, 0.9, 1.2, 2.0, 0, { color: "#3a5a8a" }),
    box("vending", 29.3, -3.5, 0.9, 1.2, 2.0, 0, { color: "#8a2a2a" }),
    box("pillar", 21, -3, 0.7, 0.7, 5, 0, { color: "#8a8478" }),
    // North rooms.
    box("bed", -26, -21, 2.1, 1.0, 0.9),
    box("bed", -18, -21, 2.1, 1.0, 0.9),
    box("desk", -8, -20, 2.4, 1.1, 0.95),
    box("locker", -11.6, -18, 0.6, 2.4, 2.1),
    box("bed", 5, -21.5, 2.1, 1.0, 0.9),
    box("bed", 11, -21.5, 2.1, 1.0, 0.9),
    box("machine", 22, -20, 2.4, 2, 2.2),
    box("locker", 28.6, -18, 0.6, 3, 2.1),
    // ER.
    car(0, 19.5, Math.PI / 2 - 0.1, "#e8e6e0", "van"),
    box("counter", -8, 23.2, 3, 1, 1.1),
    // Stair stores.
    box("crate", -26, 20, 1.3, 1.3, 2.6),
    box("crate", -18, 21.5, 1.3, 1.3, 1.3),
    box("locker", -29.4, 13, 0.6, 3, 2.1),
    box("crate", 24, 21, 1.3, 1.3, 2.6),
    box("locker", 29.4, 14, 0.6, 3, 2.1),
  ],
  decor: [
    deco("chairs", -5, 6.6, 0, { n: 5, color: "#3b5a6e" }),
    deco("chairs", 5, 6.6, 0, { n: 5, color: "#3b5a6e" }),
    deco("chairs", 21, -6.4, 0, { n: 6, color: "#6e4a3b" }),
    deco("chairs", 21, 6.4, Math.PI, { n: 6, color: "#6e4a3b" }),
    deco("curtain", -25, -4.2, 0, { len: 2.6 }),
    deco("curtain", -18, 4.2, 0, { len: 2.6 }),
    deco("gurney", 6, 14, 0.4),
    deco("gurney", -5, 21, -0.3),
    deco("gurney", -3, -11.2, Math.PI / 2 + 0.2),
    deco("cart", 18, -11, 0),
    deco("cart", -26, -11.5, 0.5),
    deco("cart", 9, -19, 1),
    deco("papers", 0, -2, 0),
    deco("papers", -20, 0, 1),
    deco("papers", 20, -12, 2),
    deco("stain", 3, 1, 0, { s: 1.4 }),
    deco("stain", -22, -11, 1, { s: 1.2 }),
    deco("stain", 0, 15, 0.4, { s: 1.6 }),
    deco("bones", -10, -12, 0),
    deco("rubble", 25, 12, 0, { s: 1 }),
    deco("rubble", -27, 16, 1, { s: 1.1 }),
    deco("trash", 10, -11.6, 0),
    deco("warnsign", -12.4, 17.4, Math.PI / 2, { text: "STAIRS", color: "#3fd17a" }),
    deco("warnsign", 12.4, 17.4, -Math.PI / 2, { text: "STAIRS", color: "#3fd17a" }),
    deco("warnsign", 0, -8.6, 0, { text: "WARD A-D", color: "#e8e8e8" }),
  ],
  lights: [
    light(0, 4.8, 0, TUBE, 1.3, 13, 0.25, "tube"),
    light(0, 4.8, -11.5, TUBE, 1.1, 12, 0.9, "tube"),
    light(-18, 4.8, -11.5, TUBE, 1.0, 12, 0, "tube"),
    light(18, 4.8, -11.5, TUBE, 1.0, 12, 0.6, "tube"),
    light(-21, 4.8, 0, TUBE, 1.0, 12, 0.8, "tube"),
    light(21, 4.8, 0, TUBE, 1.1, 12, 0, "tube"),
    light(0, 4.8, 16, TUBE, 1.0, 12, 0.5, "tube"),
    light(-11.6, 3.6, -11.5, "#ff2a1a", 1.0, 8, 0, "emergency"),
    light(11.6, 3.6, -11.5, "#ff2a1a", 1.0, 8, 0, "emergency"),
    light(0, 3.8, 23.4, "#ff2a1a", 1.1, 9, 0, "emergency"),
    light(-21, 3.8, 17, "#ff2a1a", 0.8, 8, 0, "emergency"),
    light(21, 3.8, 17, "#ff2a1a", 0.8, 8, 0, "emergency"),
  ],
  spawns: {
    ra: { x: -21, z: -19 },
    rb: { x: -6, z: -22 },
    rc: { x: 8, z: -18 },
    rd: { x: 25, z: -22 },
    ww: { x: -27.5, z: 0 },
    ee: { x: 26, z: 2 },
    sw: { x: -22, z: 17 },
    se: { x: 22, z: 17 },
    er: { x: -8, z: 21.5 },
  },
  pickups: {
    p1: { x: -3.5, z: -6.8 },
    p2: { x: 3.5, z: 2 },
    p3: { x: -20, z: -2.5 },
    p4: { x: 18, z: 4 },
    p5: { x: 0, z: -11.5 },
    p6: { x: 7, z: 12 },
  },
  start: { x: 0, z: 3, yaw: 0 },
  bossSpawn: { x: 6, z: 14 },
};
