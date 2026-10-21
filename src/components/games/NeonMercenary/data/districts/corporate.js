/**
 * District 3 — Corporate District. Cold blue light, glass, holograms.
 *
 *   N   Halcyon Tower (lobby → executive floor → roof)
 *   W   Halcyon Annex offices (Corporate Espionage)
 *   E   Research labs (Final Transmission)
 *   C   Concord Plaza (defector meeting, holo fountain)
 *   S   Maglev station
 *   Interior levels east (x > 78) and west (x < −78) of the city.
 */
import { paint, room, prop, crate, barrier, carve } from "../layout.js";

const plan = paint(32, 32, [
  [0, 0, 9, 0, "9"], [10, 0, 21, 0, "9"], [22, 0, 31, 0, "8"],
  [0, 31, 10, 31, "8"], [11, 31, 20, 31, "9"], [21, 31, 31, 31, "8"],
  [0, 1, 0, 30, "9"], [31, 1, 31, 30, "9"],
  // Halcyon Tower (huge) + flanking blocks
  [12, 1, 19, 8, "9"], [9, 1, 10, 6, "6"], [21, 1, 22, 6, "6"],
  // west annex block outer walls (interior built with room()) and east labs
  [1, 12, 7, 12, "W"], [24, 12, 30, 12, "W"],
  // south blocks
  [1, 20, 6, 26, "7"], [25, 20, 30, 26, "7"], [9, 22, 11, 27, "5"], [20, 22, 22, 27, "5"],
  [1, 28, 4, 30, "4"], [27, 28, 30, 30, "4"],
]);

/* --------------------------------------------------------- interiors */
// tower lobby (x 80–120, z −30–10)
const lobby = [
  ...room(80, -30, 120, 10, { h: 7, doors: { s: [[98, 102]], n: [[97, 103]] } }),
  prop("desk", 100, -6, 8, 1.4, 1.05), prop("desk", 88, -16, 1.4, 5, 1.05), prop("desk", 112, -16, 1.4, 5, 1.05),
  prop("planter", 86, 4, 2, 2, 1.1), prop("planter", 114, 4, 2, 2, 1.1), prop("planter", 86, -24, 2, 2, 1.1), prop("planter", 114, -24, 2, 2, 1.1),
  prop("pillar", 92, -10, 1.2, 1.2, 7), prop("pillar", 108, -10, 1.2, 1.2, 7), prop("pillar", 92, -22, 1.2, 1.2, 7), prop("pillar", 108, -22, 1.2, 1.2, 7),
  prop("terminal", 83.2, -10, 0.8, 1.2, 1.4, { id: "lock1" }), prop("terminal", 116.8, -10, 0.8, 1.2, 1.4, { id: "lock2" }), prop("terminal", 100, -27, 1.2, 0.8, 1.4, { id: "lock3" }),
  { x0: 97, x1: 103, z0: -31.6, z1: -29.8, y1: 7, kind: "gate", id: "lobbyElevator" },
];
// executive floor (x 80–120, z 20–56)
const exec = [
  ...room(80, 20, 120, 56, { h: 4.6, doors: {} }),
  ...room(80, 40, 96, 56, { h: 4.6, ceiling: false, doors: { e: [[46, 50]] } }),
  ...room(104, 40, 120, 56, { h: 4.6, ceiling: false, doors: { w: [[46, 50]] } }),
  { x0: 88, x1: 112, z0: 31.8, z1: 32.2, y1: 4.6, kind: "glass" },
  prop("desk", 100, 50, 6, 1.6, 1.05), prop("terminal", 100, 53.4, 1.2, 0.8, 1.4, { id: "execTerm" }),
  prop("desk", 88, 46, 3, 1.4, 1.05), prop("desk", 112, 46, 3, 1.4, 1.05), prop("planter", 84, 24, 2, 2, 1.1), prop("planter", 116, 24, 2, 2, 1.1),
  prop("desk", 90, 28, 1.4, 3, 1.05), prop("desk", 110, 28, 1.4, 3, 1.05), crate(100, 36, 1.4),
];
// roof (x 80–124, z 66–110) — open sky, AC units for cover
const roof = [
  { x0: 79, x1: 80, z0: 66, z1: 110, y1: 1.8, kind: "parapet" }, { x0: 124, x1: 125, z0: 66, z1: 110, y1: 1.8, kind: "parapet" },
  { x0: 79, x1: 125, z0: 65, z1: 66, y1: 1.8, kind: "parapet" }, { x0: 79, x1: 125, z0: 110, z1: 111, y1: 1.8, kind: "parapet" },
  prop("acunit", 90, 80, 3, 2, 1.3), prop("acunit", 112, 80, 3, 2, 1.3), prop("acunit", 90, 98, 2, 3, 1.3), prop("acunit", 114, 98, 2, 3, 1.3),
  prop("acunit", 102, 90, 3, 3, 1.3), prop("antenna", 120, 106, 1.5, 1.5, 9), prop("helipad", 100, 104, 10, 6, 0.2),
  prop("pillar", 96, 70, 2, 2, 3.2), prop("pillar", 108, 70, 2, 2, 3.2),
];
// data centre (x −124 … −80, z −30 … 62)
const dcOpen = [
  { x0: -106, z0: -30, x1: -98, z1: 2 },
  { x0: -122, z0: 0, x1: -82, z1: 22 },
  { x0: -106, z0: 20, x1: -98, z1: 28 },
  { x0: -124, z0: 26, x1: -80, z1: 62, ceil: 10 },
];
const datacenter = [
  ...carve({ x0: -128, z0: -34, x1: -76, z1: 66 }, dcOpen, { h: 4.4 }),
  ...[-118, -112, -88, -82].flatMap((x) => [prop("rack", x, 6, 1.2, 4, 2.4), prop("rack", x, 15, 1.2, 4, 2.4)]),
  prop("rack", -102, -14, 1.2, 4, 1.3), crate(-100, -4),
  prop("core", -102, 52, 5, 5, 8),
  prop("pillar", -114, 34, 1.6, 1.6, 10), prop("pillar", -90, 34, 1.6, 1.6, 10), prop("pillar", -114, 46, 1.6, 1.6, 10), prop("pillar", -90, 46, 1.6, 1.6, 10),
  prop("crate", -102, 36, 3, 1.3, 1.15),
];
// labs (x 30 … 58, z −58 … −20) built inside the east block courtyard
const labs = [
  ...room(30, -58, 58, -22, { h: 4.4, doors: { w: [[-36, -32]] } }),
  { x0: 30, x1: 44, z0: -40.2, z1: -39.8, y1: 4.4, kind: "glass" }, { x0: 47, x1: 58, z0: -40.2, z1: -39.8, y1: 4.4, kind: "glass" },
  { x0: 44, x1: 44.4, z0: -58, z1: -46, y1: 4.4, kind: "iwall" },
  prop("labtable", 36, -28, 4, 1.6, 1.05), prop("labtable", 50, -28, 4, 1.6, 1.05), prop("cryopod", 54, -34, 1.6, 1.6, 2.4), prop("cryopod", 56.4, -34, 1.6, 1.6, 2.4),
  prop("terminal", 33, -52, 1, 1, 1.4, { id: "arch1" }), prop("terminal", 52, -55.6, 1.2, 0.8, 1.4, { id: "arch2" }), prop("terminal", 56, -44, 0.8, 1.2, 1.4, { id: "arch3" }),
  prop("uplink", 38, -48, 1.6, 1.6, 2.2, { id: "uplink" }), prop("labtable", 50, -48, 1.6, 4, 1.05), crate(36, -44),
];
// annex offices (x −58 … −30, z −56 … −20)
const annex = [
  ...room(-58, -56, -30, -20, { h: 4.4, doors: { e: [[-36, -32]] } }),
  { x0: -58, x1: -46, z0: -38.2, z1: -37.8, y1: 4.4, kind: "iwall" }, { x0: -43, x1: -30, z0: -38.2, z1: -37.8, y1: 4.4, kind: "iwall" },
  { x0: -44.2, x1: -43.8, z0: -56, z1: -45, y1: 4.4, kind: "iwall" },
  prop("desk", -52, -28, 3, 1.4, 1.05), prop("desk", -40, -28, 3, 1.4, 1.05), prop("desk", -36, -46, 1.4, 3, 1.05), prop("desk", -52, -48, 3, 1.4, 1.05),
  prop("terminal", -55.4, -24, 0.8, 1.2, 1.4, { id: "off1" }), prop("terminal", -55.4, -52, 0.8, 1.2, 1.4, { id: "off2" }), prop("terminal", -33, -53.6, 1.2, 0.8, 1.4, { id: "off3" }),
  prop("planter", -34, -24, 1.6, 1.6, 1.1), crate(-48, -42),
];

const boxes = [
  // plaza: holo fountain + planters + benches
  prop("fountain", 0, 0, 7, 7, 1.0), prop("planter", -16, -8, 3, 1.4, 1.1), prop("planter", 16, -8, 3, 1.4, 1.1), prop("planter", -16, 10, 3, 1.4, 1.1), prop("planter", 16, 10, 3, 1.4, 1.1),
  prop("bench", -8, 14, 3, 0.8, 0.6), prop("bench", 8, 14, 3, 0.8, 0.6), prop("holo", -24, -20, 1.4, 1.4, 4), prop("holo", 24, -20, 1.4, 1.4, 4),
  // surveillance nodes (destroyed in Ghost Network)
  prop("node", -44, 0, 1.4, 1.4, 2.6, { id: "node1" }), prop("node", 44, -4, 1.4, 1.4, 2.6, { id: "node2" }), prop("node", 32, 40, 1.4, 1.4, 2.6, { id: "node3" }), prop("node", -32, 40, 1.4, 1.4, 2.6, { id: "node4" }),
  barrier(-40, 4, true, 4), barrier(40, 0, true, 4), crate(33.5, 34), crate(-33.5, 34), prop("car", -30, 30, 2, 4.4, 1.4, { color: 3 }), prop("car", 30, 22, 2, 4.4, 1.4, { color: 4 }),
  prop("car", -50, -6, 4.4, 2, 1.4, { color: 4 }), prop("car", 54, 8, 4.4, 2, 1.4, { color: 3 }), barrier(-34, 47, true, 3), barrier(34, 47, true, 3),
  // tower entrance canopy
  { x0: -10, x1: 10, z0: -28, z1: -22, y0: 6, y1: 6.4, kind: "canopy" }, prop("pillar", -9, -23, 0.6, 0.6, 6), prop("pillar", 9, -23, 0.6, 0.6, 6),
  prop("barrierPost", -5, -24, 0.5, 0.5, 1.0), prop("barrierPost", 5, -24, 0.5, 0.5, 1.0),
  // service elevator to the data centre
  prop("elevator", -24, 18, 3, 3, 3.4, { id: "dcElevator" }),
  ...annex,
  ...labs,
  // station
  { x0: -12, x1: 12, z0: 52, z1: 60, y1: 0.4, kind: "platform" },
  prop("pillar", -9, 55, 0.6, 0.6, 5), prop("pillar", 9, 55, 0.6, 0.6, 5),
  { x0: -12, x1: 12, z0: 52, z1: 60, y0: 5, y1: 5.4, kind: "canopy" },
  prop("gateTerm", 0, 58.6, 1.2, 0.8, 1.4, { id: "transitGate" }), prop("kiosk", 10.4, 47, 1.6, 2.6, 2.2),
  ...lobby,
  ...exec,
  ...roof,
  ...datacenter,
];

export const CORPORATE = {
  id: "corporate",
  name: "Corporate District",
  tagline: "Glass towers, holograms and the people who own the city",
  buildingStyle: "corporate",
  plan,
  boxes,
  areas: [
    { x0: 80, z0: -30, x1: 120, z1: 10, floor: "marble" },
    { x0: 80, z0: 20, x1: 120, z1: 56, floor: "office" },
    { x0: 79, z0: 65, x1: 125, z1: 111, floor: "roof", sky: true },
    { x0: -128, z0: -34, x1: -76, z1: 66, floor: "server" },
  ],
  spawn: { x: 0, z: 47.5, yaw: Math.PI },
  arrive: { x: 0, z: 47.5, yaw: Math.PI },
  palette: { fog: "#081424", fogDensity: 0.014, sky: "#030812", hemiTop: "#2a4a7a", hemiBottom: "#05080d", key: "#a8c8ff", neon: ["#19f0ff", "#7b8cff", "#ffffff", "#ff2bd6", "#4dc8ff"], ground: "#10141c" },
  npcs: [
    { id: "vale", x: 8.8, z: 47, yaw: -Math.PI / 2 },
    { id: "lena", x: -8, z: 22, yaw: 0.6 },
  ],
  terminals: [{ id: "contracts", x: -8.6, z: 47.5, yaw: Math.PI / 2, label: "Contract Terminal" }],
  stations: [{ id: "transitGate", x: 0, z: 57.6, label: "Maglev Transit" }],
  doors: [
    { id: "towerDoor", at: [0, -26.4], to: { x: 100, z: 6.5, yaw: Math.PI }, label: "Enter Halcyon Tower", flag: "towerOpen" },
    { id: "lobbyExit", at: [100, 8.6], to: { x: 0, z: -24, yaw: 0 }, label: "Exit to Concord Plaza" },
    { id: "lobbyLift", at: [100, -28.4], to: { x: 100, z: 23, yaw: 0 }, label: "Ride the executive elevator", flag: "liftOpen" },
    { id: "execDown", at: [100, 21.4], to: { x: 100, z: -26, yaw: Math.PI }, label: "Elevator down to the lobby" },
    { id: "execUp", at: [96, 21.4], to: { x: 102, z: 68.5, yaw: 0 }, label: "Roof access", flag: "roofOpen" },
    { id: "roofDown", at: [102, 66.8], to: { x: 98, z: 23, yaw: 0 }, label: "Back inside" },
    { id: "dcElevator", at: [-24, 20.4], to: { x: -102, z: -27, yaw: 0 }, label: "Service elevator: Data Centre", flag: "dcOpen" },
    { id: "dcUp", at: [-102, -29], to: { x: -24, z: 21.6, yaw: 0 }, label: "Service elevator: Plaza" },
  ],
  points: {
    plaza: [0, 8], lena: [-8, 22],
    annexDoor: [-28, -34], off1: [-54.4, -24], off2: [-54.4, -52], off3: [-33, -52.4],
    node1: [-44, 1.6], node2: [44, -2.4], node3: [32, 41.6], node4: [-32, 41.6],
    towerDoor: [0, -25], lobby: [100, -10], lock1: [84.4, -10], lock2: [115.6, -10], lock3: [100, -25.8], lift: [100, -27],
    exec: [100, 38], execTerm: [100, 52.2], roof: [102, 84],
    labsDoor: [26, -34], arch1: [34.2, -52], arch2: [52, -54.4], arch3: [54.8, -44], uplink: [38, -46.4],
    dcLift: [-24, 21], dc: [-102, 10], core: [-102, 44],
  },
  arenas: {
    roof: { x0: 81, z0: 67, x1: 123, z1: 109 },
    core: { x0: -122, z0: 28, x1: -82, z1: 60 },
  },
  patrols: [
    { type: "corpSoldier", route: [[-20, -14], [20, -14]] },
    { type: "drone", route: [[-30, 30], [30, 30], [30, -10], [-30, -10]] },
    { type: "corpSoldier", route: [[34, 12], [58, 12], [58, 8], [34, 8]] },
  ],
  civilians: [
    [[-20, 16], [20, 16], [20, -12], [-20, -12]],
    [[-6, 44], [-6, 20], [-26, 4], [-6, -16]],
    [[6, -16], [26, 4], [6, 20], [6, 44]],
    [[-58, 14], [-30, 14], [-30, 46], [-30, 14]],
    [[58, 14], [32, 14], [32, 50], [32, 14]],
  ],
  signs: 34,
};
