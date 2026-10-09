/**
 * Arena 1 — Abandoned City. A ruined main street running north–south
 * (−Z is north), shopfronts on both sides, three alleys and a side street,
 * a wrecked bus across the north end and a barricade line to the south.
 *
 *          N  (bus, spawns behind it)
 *   ┌──────┐   ║   ┌──────┐
 *   │  W1  │   ║   │  E1  │
 *   ├alley─┘   ║   └─alley┤
 *   │  W2  │ street │  E2  │
 *   ├alley─┐   ║   ┌side st┤
 *   │  W3  │   ║   │  E3  │
 *   └──────┘ barricade └──┘
 *          S
 */
import { car, building, barrier, pole, dumpster, light, deco, box } from "../arenaKit.js";

const LAMP = "#ffc884";

export const CITY = {
  id: "city",
  name: "Abandoned City",
  floorSurface: "concrete",
  bounds: { minX: -24, maxX: 24, minZ: -36, maxZ: 36 },
  theme: {
    sky: "#1a2030",
    fog: "#1b2130",
    fogNear: 14,
    fogFar: 62,
    hemiSky: "#5d6f95",
    hemiGround: "#2a241e",
    hemi: 0.55,
    moon: "#9fb4e0",
    moonInt: 0.75,
    moonDir: [-0.45, 1, 0.35],
    exposure: 1.05,
    ambience: "city",
  },
  floors: [
    { x: 0, z: 0, w: 12, d: 72, mat: "asphalt", lanes: true },
    { x: -7.5, z: 0, w: 3, d: 72, mat: "sidewalk" },
    { x: 7.5, z: 0, w: 3, d: 72, mat: "sidewalk" },
    { x: -16.5, z: -12, w: 15, d: 4, mat: "concrete" },
    { x: -16.5, z: 10, w: 15, d: 4, mat: "concrete" },
    { x: 16.5, z: -19.5, w: 15, d: 5, mat: "concrete" },
    { x: 16.5, z: 6.5, w: 15, d: 5, mat: "asphalt" },
  ],
  ceiling: null,
  solids: [
    // West row
    building(-24, -36, -9, -14, 15, "brick", { color: "#5b3b30", sign: "HOTEL" }),
    building(-24, -10, -9, 8, 10, "shop", { color: "#6d675c", sign: "PHARMACY", signColor: "#3fd17a" }),
    building(-24, 12, -9, 36, 18, "office", { color: "#4f5560" }),
    // East row
    building(9, -36, 24, -22, 16, "office", { color: "#545a63" }),
    building(9, -17, 24, 4, 12, "shop", { color: "#5e4a3c", sign: "DINER", signColor: "#ff4d5e" }),
    building(9, 9, 24, 36, 9, "brick", { color: "#6a4234", sign: "HARDWARE", signColor: "#ffb547" }),
    // North: wrecked bus across the street
    car(1, -27, 1.45, "#c9a227", "bus"),
    car(7.2, -33.2, 0.15, "#3a4a5c", "sedan"),
    // Abandoned cars in the street
    car(-3.5, 12, 0.32, "#7a2622", "sedan"),
    car(3.8, 2, -0.22, "#3d5a73", "hatch"),
    car(-2.2, -8, 1.25, "#d8d2c4", "police"),
    car(4.1, -16, 0.1, "#2f3b2f", "van"),
    car(-4.3, -20, -0.42, "#d6a019", "taxi"),
    car(4.9, 21.5, 0.04, "#4a4f57", "sedan"),
    car(-4.9, 17.5, -0.05, "#6d2f5d", "hatch"),
    // Cover
    barrier(-0.6, 6.5, 0.25, 3),
    barrier(1.6, -3.5, -0.1, 3),
    // South barricade (gap on the west sidewalk)
    barrier(-1.5, 30, 0, 3),
    barrier(1.5, 30, 0, 3),
    car(6.3, 30.6, 1.5, "#3b3530", "truck", { burnt: true }),
    // Street furniture
    pole(-7.6, -24),
    pole(7.6, -12),
    pole(-7.6, 0),
    pole(7.6, 12),
    pole(-7.6, 24),
    pole(7.6, -30),
    box("hydrant", 6.9, -4.5, 0.4, 0.4, 0.8),
    box("busstop", -7.8, -4.6, 1.4, 3.2, 2.6),
    box("planter", 7.6, 26, 1.2, 1.2, 0.8),
    box("planter", -7.6, -16, 1.2, 1.2, 0.8),
    // Alleys
    dumpster(16, -21.35, 0),
    box("crate", 19.6, 8.4, 1.2, 1.2, 1.2),
  ],
  decor: [
    deco("rubble", -6.2, -9, 0.4, { s: 1.4 }),
    deco("rubble", 6.6, 9, 1.2, { s: 1.1 }),
    deco("rubble", -8.2, -27, 0, { s: 1.6 }),
    deco("tire", -1.2, 15.5, 0.3),
    deco("tire", 2.4, -11, 1.1),
    deco("trash", -8.4, 4.5, 0),
    deco("trash", 8.3, -7, 0.8),
    deco("trash", -8.2, 19, 2),
    deco("trash", -20, -11.5, 0.5),
    deco("trash", -15, -13.2, 1.1),
    deco("trash", -14, 11.3, 0.2),
    deco("tire", -17.5, 10.8, 0.6),
    deco("trash", 20, 5.5, 1.3),
    deco("papers", 0.5, 10, 0),
    deco("papers", -2, -14, 1),
    deco("papers", 3, 25, 2),
    deco("papers", -1, -24, 0.4),
    deco("fire", 2.8, 24.5, 0),
    deco("fire", -6.8, -12.8, 0),
    deco("smoke", 4.1, -16, 0, { s: 1.4 }),
    deco("smoke", 6.3, 30.6, 0, { s: 1.8 }),
    deco("smoke", 1, -27, 0, { s: 1.2 }),
    deco("stain", -1.5, 4, 0.3, { s: 1.6 }),
    deco("stain", 2.5, -19, 1.2, { s: 1.2 }),
    deco("cone", 0.4, 27.6, 0),
    deco("cone", -2.3, 28.4, 0),
    deco("manhole", 0.6, -12, 0),
    deco("manhole", -1.2, 18, 0),
  ],
  lights: [
    light(-6.6, 5.6, 0, LAMP, 1.4, 16, 0.0, "street"),
    light(6.6, 5.6, 12, LAMP, 1.3, 16, 0.6, "street"),
    light(-6.6, 5.6, 24, LAMP, 1.4, 16, 0.0, "street"),
    light(6.6, 5.6, -12, LAMP, 1.2, 16, 0.35, "street"),
    light(-6.6, 5.6, -24, LAMP, 1.2, 16, 0.0, "street"),
    light(6.6, 5.6, -30, LAMP, 0.9, 14, 0.8, "street"),
    light(2.8, 0.8, 24.5, "#ff8a3a", 1.6, 9, 0.25, "fire"),
    light(-6.8, 0.8, -12.8, "#ff8a3a", 1.4, 8, 0.25, "fire"),
    light(-2.2, 1.7, -8, "#ff2f2f", 1.0, 7, 1, "siren"),
  ],
  spawns: {
    n1: { x: -7, z: -34 },
    n2: { x: 4, z: -34 },
    aw: { x: -22, z: -12 },
    ae1: { x: 22, z: -19.5 },
    ae2: { x: 22, z: 6.5 },
    aw2: { x: -22, z: 10 },
    s1: { x: -7.5, z: 34 },
  },
  pickups: {
    p1: { x: 5.6, z: 24.2 },
    p2: { x: -7.6, z: 2.5 },
    p3: { x: 7.4, z: -8 },
    p4: { x: -7.4, z: -20 },
    p5: { x: 0, z: 10 },
    p6: { x: -16, z: 9.6 },
  },
  start: { x: 0, z: 13, yaw: 0 },
  bossSpawn: { x: -2, z: -33 },
};
