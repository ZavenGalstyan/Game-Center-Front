/**
 * Arena 5 — Military Base. An abandoned compound in a storm: a hangar
 * opening onto the apron (north), two watchtowers, bunkers, parked
 * vehicles, sandbag positions and floodlights. The perimeter fence has
 * gates where the horde breaks through.
 */
import { car, box, sandbags, barrier, container, light, deco, wall } from "../arenaKit.js";

const FLOOD = "#f4f0dc";
const fence = (x0, z0, x1, z1) => ({ ...wall(x0, z0, x1, z1, 3.2, 0.15, "metal"), tag: "fence", blocksShots: false });
const tower = (x, z) => [
  box("towerleg", x - 1.3, z - 1.3, 0.3, 0.3, 6),
  box("towerleg", x + 1.3, z - 1.3, 0.3, 0.3, 6),
  box("towerleg", x - 1.3, z + 1.3, 0.3, 0.3, 6),
  box("towerleg", x + 1.3, z + 1.3, 0.3, 0.3, 6),
  box("deck", x, z, 3.6, 3.6, 0.3, 0, { y0: 6, blocksMove: false, color: "#4b3a28" }),
  box("deck", x, z, 3.8, 3.8, 0.2, 0, { y0: 8.4, blocksMove: false, color: "#3a3226" }),
];

export const MILITARY = {
  id: "military",
  name: "Military Base",
  floorSurface: "dirt",
  baseFloor: "dirt",
  bounds: { minX: -34, maxX: 34, minZ: -30, maxZ: 30 },
  ceiling: null,
  theme: {
    fog: "#151a20",
    fogNear: 12,
    fogFar: 56,
    hemiSky: "#6a7a90",
    hemiGround: "#2a2620",
    hemi: 0.55,
    moon: "#b0c0d8",
    moonInt: 0.65,
    moonDir: [0.4, 1, 0.5],
    exposure: 1.05,
    ambience: "military",
  },
  floors: [
    { x: 0, z: -21, w: 28, d: 14, mat: "tarmac", stripes: true },
    { x: 0, z: 2, w: 10, d: 56, mat: "tarmac" },
    { x: 0, z: -9, w: 40, d: 10, mat: "tarmac" },
  ],
  solids: [
    // Hangar.
    box("hangarwall", -14, -21, 0.6, 14, 10, 0, { color: "#4a5048", tag: "wall", style: "metal" }),
    box("hangarwall", 14, -21, 0.6, 14, 10, 0, { color: "#4a5048", tag: "wall", style: "metal" }),
    box("hangarwall", -11, -14, 6, 0.6, 10, 0, { color: "#4a5048", tag: "wall", style: "metal" }),
    box("hangarwall", 11, -14, 6, 0.6, 10, 0, { color: "#4a5048", tag: "wall", style: "metal" }),
    box("roof", 0, -21, 28.6, 14.6, 0.5, 0, { y0: 10, blocksMove: false, color: "#3a3e3a" }),
    car(-4, -23, 0.1, "#4c5338", "truck"),
    box("crate", 7, -25, 1.4, 1.4, 2.8),
    box("crate", 9, -25.6, 1.4, 1.4, 1.4),
    box("machine", 9, -19, 2.6, 2, 2.4),
    // Watchtowers.
    ...tower(-27, 20),
    ...tower(27, 20),
    // Bunkers.
    box("bunker", -22, -2, 6, 4, 2.6),
    box("bunker", 23, -6, 5, 4, 2.6),
    // Vehicles.
    car(-9, 7, 0.35, "#4c5338", "truck"),
    car(7, -4, -0.3, "#4c5338", "jeep"),
    car(17, 12, 1.2, "#3f4630", "jeep"),
    car(-19, 15, 1.45, "#4c5338", "truck", { burnt: true }),
    car(5, 21, 0.2, "#3f4630", "jeep"),
    // Sandbag positions.
    sandbags(0, 11, 0, 4),
    sandbags(-2.3, 12.8, Math.PI / 2, 3),
    sandbags(13, -1, 0.3, 4),
    sandbags(-12, -6, -0.2, 4),
    sandbags(-27, 8, 0, 3),
    sandbags(26, 2, Math.PI / 2, 4),
    barrier(0, 26.5, 0, 3),
    barrier(-8, 25.5, 0.2, 3),
    barrier(9, 25, -0.2, 3),
    // Containers + fuel.
    container(25, -20, 0.05, "#4c5338", true, 1),
    container(-26, -19, -0.05, "#5a3a22", false, 2),
    box("barrel", 18, -12, 0.7, 0.7, 1.0, 0, { color: "#4c5338" }),
    box("barrel", 18.8, -12.5, 0.7, 0.7, 1.0, 0, { color: "#4c5338" }),
    // Perimeter fence with gates (gaps).
    fence(-34, 29.6, -16, 29.6),
    fence(-9, 29.6, 9, 29.6),
    fence(16, 29.6, 34, 29.6),
    fence(-33.6, -30, -33.6, -14),
    fence(-33.6, -8, -33.6, 30),
    fence(33.6, -30, 33.6, -2),
    fence(33.6, 4, 33.6, 30),
  ],
  decor: [
    deco("tent", -21, 24, 0, { len: 4 }),
    deco("tent", -14, 25, 0.1, { len: 4 }),
    deco("barrels", 20, 24, 0, { n: 4 }),
    deco("barrels", -30, -6, 0, { n: 3 }),
    deco("barrels", 11, -27, 0, { n: 3 }),
    deco("rubble", 4, 4, 0, { s: 1.3 }),
    deco("rubble", -14, 2, 1, { s: 1.1 }),
    deco("tire", 11, 8, 0),
    deco("tire", -6, -11, 1),
    deco("stain", -3, 3, 0, { s: 1.5 }),
    deco("stain", 10, 15, 1, { s: 1.2 }),
    deco("puddle", 2, -5, 0, { s: 1.6 }),
    deco("puddle", -11, 18, 0, { s: 1.3 }),
    deco("puddle", 16, 3, 0, { s: 1.1 }),
    deco("warnsign", -2.5, -13.6, 0, { text: "HANGAR 2", color: "#ffcc00" }),
    deco("warnsign", 0, 28.6, 0, { text: "RESTRICTED", color: "#ff5a3a" }),
    deco("smoke", -19, 15, 0, { s: 1.5 }),
    deco("smoke", 25, -20, 0, { s: 1 }),
    deco("fire", -16, 13, 0),
    deco("bones", 8, 9, 0),
  ],
  lights: [
    light(-30, 9, -26, FLOOD, 1.6, 26, 0, "flood"),
    light(30, 9, -26, FLOOD, 1.6, 26, 0.4, "flood"),
    light(-30, 9, 26, FLOOD, 1.4, 24, 0, "flood"),
    light(30, 9, 26, FLOOD, 1.4, 24, 0.6, "flood"),
    light(0, 8.6, -20, "#ffe2a8", 1.3, 18, 0.3, "hang"),
    light(-27, 7, 20, "#ffd27a", 0.9, 12, 0, "warning"),
    light(27, 7, 20, "#ffd27a", 0.9, 12, 0, "warning"),
    light(-16, 0.8, 13, "#ff8a3a", 1.4, 9, 0.25, "fire"),
    light(-22, 2.3, 0.2, "#ff3a20", 0.8, 8, 0, "emergency"),
  ],
  spawns: {
    hangar: { x: 0, z: -27 },
    nw: { x: -30, z: -26 },
    ne: { x: 30, z: -26 },
    w1: { x: -32.5, z: -11 },
    e1: { x: 32.5, z: 1 },
    s1: { x: -12.5, z: 28.5 },
    s2: { x: 12.5, z: 28.5 },
    sw: { x: -31, z: 27 },
  },
  pickups: {
    p1: { x: -4, z: 15 },
    p2: { x: 5, z: 9 },
    p3: { x: -18, z: -2 },
    p4: { x: 19, z: -6 },
    p5: { x: 0, z: -9 },
    p6: { x: 21, z: 16 },
  },
  start: { x: 0, z: 15, yaw: 0 },
  bossSpawn: { x: 0, z: -24 },
};
