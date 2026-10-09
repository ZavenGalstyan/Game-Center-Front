/**
 * Arena 4 — Underground Lab (ceiling 6 m).
 *
 * A glass-walled containment chamber (22 × 22 m, four 4 m openings) around
 * the specimen core, a 5 m ring corridor, and research labs in the outer
 * band behind 4 m security doors. Glass is bullet-proof: it stops shots and
 * bodies, but you can see through it.
 */
import { wall, box, light, deco } from "../arenaKit.js";

const LW = (x0, z0, x1, z1) => wall(x0, z0, x1, z1, 6, 0.5, "lab");
const GL = (x0, z0, x1, z1) => ({ ...wall(x0, z0, x1, z1, 3.2, 0.25, "lab"), tag: "glass" });
const COOL = "#cfe6ff";
const TOX = "#7dff4a";

export const LAB = {
  id: "lab",
  name: "Underground Lab",
  floorSurface: "metal",
  baseFloor: "lab",
  bounds: { minX: -28, maxX: 28, minZ: -24, maxZ: 24 },
  ceiling: { h: 6, mat: "metal" },
  theme: {
    fog: "#0a0c12",
    fogNear: 10,
    fogFar: 48,
    hemiSky: "#a0b4e0",
    hemiGround: "#1a1e26",
    hemi: 0.5,
    moon: "#b8c8ff",
    moonInt: 0.3,
    moonDir: [-0.2, 1, 0.2],
    exposure: 1.1,
    ambience: "lab",
  },
  floors: [
    { x: 0, z: 0, w: 22, d: 22, mat: "labTile", tile: 3 },
    { x: 0, z: 0, w: 32, d: 32, mat: "lab", tile: 4 },
  ],
  solids: [
    // Containment chamber (glass, openings at the middle of each side).
    GL(-11, -11, -2, -11),
    GL(2, -11, 11, -11),
    GL(-11, 11, -2, 11),
    GL(2, 11, 11, 11),
    GL(-11, -11, -11, -2),
    GL(-11, 2, -11, 11),
    GL(11, -11, 11, -2),
    GL(11, 2, 11, 11),
    // Ring corridor outer walls with 4 m security doors.
    LW(-16, -16, -15, -16),
    LW(-11, -16, 11, -16),
    LW(15, -16, 16, -16),
    LW(-16, 16, -15, 16),
    LW(-11, 16, 11, 16),
    LW(15, 16, 16, 16),
    LW(-16, -16, -16, -2),
    LW(-16, 2, -16, 16),
    LW(16, -16, 16, -2),
    LW(16, 2, 16, 16),
    // Outer labs: dividing walls in the band.
    LW(-28, -8, -16, -8),
    LW(16, 8, 28, 8),
    LW(-4, -24, -4, -16),
    LW(4, 16, 4, 24),
    // Specimen core + tanks.
    box("machine", 0, 0, 3, 3, 3.2),
    box("tank", -5.5, -5.5, 2, 2, 3.4, 0, { color: TOX }),
    box("tank", 5.5, -5.5, 2, 2, 3.4, 0, { color: "#4ad8ff" }),
    box("tank", -5.5, 5.5, 2, 2, 3.4, 0, { color: "#4ad8ff" }),
    box("tank", 5.5, 5.5, 2, 2, 3.4, 0, { color: TOX }),
    box("console", -3.3, 0, 2, 0.8, 1.0, -Math.PI / 2),
    box("console", 3.3, 0, 2, 0.8, 1.0, Math.PI / 2),
    // Ring corridor props.
    box("barrel", -15.2, -6.5, 0.7, 0.7, 1.0, 0, { color: "#8a7a1a" }),
    box("barrel", 15.2, 6.5, 0.7, 0.7, 1.0, 0, { color: "#8a7a1a" }),
    box("server", -13.6, 7, 0.9, 1.6, 2.2),
    box("server", 13.6, -7, 0.9, 1.6, 2.2),
    // Outer labs.
    box("console", -22, -20, 3, 1, 1.0),
    box("server", -26.6, -14, 1, 1.8, 2.4),
    box("server", -26.6, -11.5, 1, 1.8, 2.4),
    box("tank", -21.5, -13.2, 2.2, 2.2, 3.8, 0, { color: TOX }),
    box("desk", 10, -20.5, 3, 1.2, 0.95),
    box("tank", 22, -20, 2, 2, 3.6, 0, { color: "#4ad8ff" }),
    box("console", 24, -12.5, 2.4, 0.9, 1.0, Math.PI / 2),
    box("server", 26.6, 12, 1, 1.8, 2.4),
    box("tank", 21, 18, 2.2, 2.2, 3.8, 0, { color: TOX }),
    box("desk", -10, 20.5, 3, 1.2, 0.95),
    box("console", -22, 20, 3, 1, 1.0, Math.PI),
    box("crate", -26.3, 4, 1.3, 1.3, 2.6),
    box("crate", 26.3, -3, 1.3, 1.3, 1.3),
  ],
  decor: [
    deco("pipe", 0, -15.2, 0, { y: 5.2, len: 31, r: 0.18 }),
    deco("pipe", 0, 15.2, 0, { y: 5.0, len: 31, r: 0.14 }),
    deco("barrels", -24, 2, 0, { n: 3 }),
    deco("barrels", 24, 3, 0, { n: 2 }),
    deco("puddle", -3, 8, 0, { s: 1.2 }),
    deco("puddle", 14, 0, 0, { s: 1.0 }),
    deco("stain", 4, -8, 0, { s: 1.3 }),
    deco("stain", -14, -4, 1, { s: 1.1 }),
    deco("papers", 8, 13, 0),
    deco("papers", -9, -13, 1),
    deco("bones", 12, -12, 0),
    deco("warnsign", -2.6, -10.6, 0, { text: "BIOHAZARD", color: "#7dff4a" }),
    deco("warnsign", 2.6, 10.6, Math.PI, { text: "LEVEL 4", color: "#ffcc00" }),
    deco("warnsign", -15.6, 2.6, Math.PI / 2, { text: "SECURITY", color: "#ff5a3a" }),
    deco("smoke", 0, 0, 0, { s: 0.7 }),
  ],
  lights: [
    light(0, 5.6, -7, COOL, 1.1, 12, 0, "tube"),
    light(0, 5.6, 7, COOL, 1.1, 12, 0.4, "tube"),
    light(-13.5, 5.6, 0, COOL, 1.0, 11, 0.8, "tube"),
    light(13.5, 5.6, 0, COOL, 1.0, 11, 0, "tube"),
    light(0, 3.4, 0, TOX, 1.3, 10, 0, "warning"),
    light(-13.5, 4, -13.5, "#ff3a20", 1.0, 9, 0, "warning"),
    light(13.5, 4, 13.5, "#ff3a20", 1.0, 9, 0, "warning"),
    light(-13.5, 4, 13.5, "#ff3a20", 0.9, 8, 0, "emergency"),
    light(13.5, 4, -13.5, "#ff3a20", 0.9, 8, 0, "emergency"),
    light(-21.5, 4.5, -13.2, TOX, 0.9, 9, 0.3, "tube"),
    light(21, 4.5, 18, TOX, 0.9, 9, 0.3, "tube"),
  ],
  spawns: {
    nw: { x: -20, z: -20 },
    ne: { x: 20, z: -16 },
    n: { x: 0, z: -20.5 },
    w: { x: -24, z: 0 },
    e: { x: 24, z: 0 },
    sw: { x: -20, z: 18 },
    se: { x: 14, z: 20.5 },
    s: { x: 0, z: 20.5 },
  },
  pickups: {
    p1: { x: -8.5, z: 0 },
    p2: { x: 8.5, z: 0 },
    p3: { x: 0, z: -13.5 },
    p4: { x: 0, z: 13.5 },
    p5: { x: -13.5, z: -10 },
    p6: { x: 13.5, z: 10 },
  },
  start: { x: 0, z: 7.5, yaw: 0 },
  bossSpawn: { x: 0, z: -20.5 },
};
