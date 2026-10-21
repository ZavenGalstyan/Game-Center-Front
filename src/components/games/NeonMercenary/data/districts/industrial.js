/**
 * District 2 — Industrial Sector. Orange sodium light, smoke, heavy machinery.
 *
 *   NW  Kessler Foundry floor (rogue assembly machines)
 *   N   Restricted R&D annex behind a security checkpoint
 *   NE  Container yard (Lost Shipment)
 *   SW  Chemical works / toxic channel (Toxic Route)
 *   SE  Warehouses + loading docks (clues, hidden hatch)
 *   S   Maglev station
 *   Underground (z > 68): maintenance tunnel → Ironjaw's foundry arena
 */
import { paint, room, prop, crate, container, barrier, carve } from "../layout.js";

const plan = paint(32, 32, [
  [0, 0, 9, 0, "7"], [10, 0, 21, 0, "8"], [22, 0, 31, 0, "6"],
  [0, 31, 10, 31, "6"], [11, 31, 20, 31, "8"], [21, 31, 31, 31, "7"],
  [0, 1, 0, 30, "7"], [31, 1, 31, 30, "6"],
  // foundry floor walls (gate at row 10, cols 4–5)
  [1, 10, 3, 10, "W"], [6, 10, 9, 10, "W"], [10, 1, 10, 10, "W"],
  // restricted annex (checkpoint gap at row 11, cols 15–16)
  [11, 1, 11, 11, "W"], [20, 1, 20, 11, "W"], [12, 11, 14, 11, "W"], [17, 11, 19, 11, "W"],
  [13, 2, 18, 5, "4"],
  // chemical works: two blocks leave the toxic corridor (cols 5–6)
  [1, 18, 4, 18, "W"], [7, 18, 11, 18, "W"], [12, 18, 12, 30, "W"],
  [1, 19, 4, 26, "3"], [7, 19, 11, 26, "3"],
  // south-east warehouses
  [19, 18, 21, 22, "5"], [19, 24, 21, 30, "6"], [22, 30, 30, 30, "4"],
  // south-west of the main road
  [13, 18, 13, 26, "2"],
]);

/* --------------------------------------------------------- underground */
const tunnelOpen = [
  { x0: -3, z0: 69, x1: 3, z1: 101 },
  { x0: -18, z0: 99, x1: 3, z1: 106 },
  { x0: -18, z0: 104, x1: -11, z1: 123 },
  { x0: -22, z0: 121, x1: 22, z1: 156, ceil: 12 },
];
const tunnel = carve({ x0: -26, z0: 66, x1: 26, z1: 160 }, tunnelOpen, { h: 4.2 });

const boxes = [
  // --- foundry floor: four assembly machines + conveyors
  prop("machine", -52, -52, 6, 5, 3.8, { id: "mach1" }), prop("machine", -32, -52, 6, 5, 3.8, { id: "mach2" }),
  prop("machine", -52, -36, 6, 5, 3.8, { id: "mach3" }), prop("machine", -32, -36, 6, 5, 3.8, { id: "mach4" }),
  prop("conveyor", -42, -44, 18, 1.6, 1.0), prop("crate", -58, -44, 1.4, 1.4, 1.2), crate(-26, -44), crate(-44, -28), prop("crate", -36, -28, 3, 1.3, 1.15),
  prop("pipe", -42, -58.6, 30, 1, 2.2),
  // --- restricted annex: checkpoint gate, booth, barriers, terminal plinth
  { x0: -4, x1: 4, z0: -18.9, z1: -17.1, y1: 4.6, kind: "gate", id: "restrictedGate" },
  prop("booth", 7.5, -13, 3, 3, 3), barrier(-8, -13, true, 4), barrier(0, -10, true, 4), barrier(10, -9, false, 3),
  prop("terminal", 0, -34.6, 1.2, 0.8, 1.4, { id: "protTerm" }), prop("pillar", -3, -35, 0.8, 0.8, 4.5), prop("pillar", 3, -35, 0.8, 0.8, 4.5),
  crate(-10, -30), crate(10, -30), prop("crate", -6, -24, 3, 1.3, 1.15), prop("crate", 7, -24, 1.3, 3, 1.15), container(-10, -38, false, 2.6, 1), crate(12, -44, 1.4),
  // --- container yard (rows of containers, some stacked)
  ...[-56, -48, -40, -32].flatMap((z, i) => [container(26, z, true, 2.6, i), container(34, z, true, i % 2 ? 5.2 : 2.6, i + 1), container(46, z, true, 2.6, i + 2), container(54, z, true, i % 2 ? 2.6 : 5.2, i)]),
  prop("container", 40, -50, 6, 2.4, 2.6, { id: "hd0447", color: 3 }),
  prop("terminal", 22.8, -24, 0.8, 1.2, 1.4, { id: "man1" }), prop("terminal", 40, -27.2, 1.2, 0.8, 1.4, { id: "man2" }), prop("terminal", 58.6, -44, 0.8, 1.2, 1.4, { id: "man3" }),
  crate(30, -24), crate(50, -24, 1.4), prop("crane", 40, -60, 30, 1.6, 9, { y0: 7 }),
  // --- main road clutter
  prop("truck", -34, -6, 8, 2.6, 3, { color: 1 }), prop("truck", 30, 4, 8, 2.6, 3, { color: 0 }), barrier(-8, 2, true, 4), crate(16, -6), crate(-50, 2), prop("crate", 52, -8, 3, 1.3, 1.15),
  prop("pipe", 0, 17, 22, 1.2, 1.4), crate(-22, -6, 1.3),
  // --- chemical works: valves, vents, pump house
  prop("valve", -42.6, 14.5, 0.8, 1, 1.3, { id: "valve1" }), prop("valve", -37.4, 29, 0.8, 1, 1.3, { id: "valve2" }), prop("valve", -30, 50.5, 1, 0.8, 1.3, { id: "valve3" }),
  ...room(-60, 46, -50, 58, { h: 3.8, doors: { e: [[50, 54]] } }),
  prop("console", -57, 52, 1, 2, 1.3, { id: "pumpCtl" }),
  crate(-28, 46), prop("tank", -22, 54, 3, 3, 4), prop("tank", -46, 57, 2.6, 2.6, 3.6), crate(-36, 58),
  // --- south-east warehouses
  crate(30, 14), prop("crate", 34, 14, 3, 1.3, 1.2), container(44, 18, true, 2.6, 2), container(56, 24, false, 2.6, 0), crate(28, 30), prop("crate", 40, 34, 1.3, 3, 1.2),
  container(30, 44, true, 2.6, 1), crate(46, 44), crate(48, 30, 1.4), prop("forklift", 36, 24, 1.6, 3, 2),
  prop("hatch", 54, 50, 2, 2, 0.15, { id: "hatch", solid: false }),
  // --- station
  { x0: -12, x1: 12, z0: 52, z1: 60, y1: 0.4, kind: "platform" },
  prop("pillar", -9, 55, 0.6, 0.6, 5), prop("pillar", 9, 55, 0.6, 0.6, 5),
  { x0: -12, x1: 12, z0: 52, z1: 60, y0: 5, y1: 5.4, kind: "canopy" },
  prop("gateTerm", 0, 58.6, 1.2, 0.8, 1.4, { id: "transitGate" }), prop("kiosk", -10.4, 47, 1.6, 2.6, 2.2),
  // --- underground: tunnel + foundry arena
  ...tunnel,
  prop("pillar", -12, 132, 2, 2, 12), prop("pillar", 12, 132, 2, 2, 12), prop("pillar", -12, 146, 2, 2, 12), prop("pillar", 12, 146, 2, 2, 12),
  crate(-1, 84), crate(1.5, 92), prop("crate", -14, 112, 1.3, 1.3, 1.15), prop("pipe", -8, 103.4, 10, 1, 1.2),
  prop("crate", -6, 127, 3, 1.3, 1.15), prop("crate", 6, 151, 3, 1.3, 1.15),
];

export const INDUSTRIAL = {
  id: "industrial",
  name: "Industrial Sector",
  tagline: "Smoke, steel and machines that think for themselves",
  buildingStyle: "industrial",
  plan,
  boxes,
  areas: [{ x0: -26, z0: 66, x1: 26, z1: 160, floor: "tunnel" }],
  spawn: { x: 0, z: 47.5, yaw: Math.PI },
  arrive: { x: 0, z: 47.5, yaw: Math.PI },
  palette: { fog: "#1e1208", fogDensity: 0.018, sky: "#0d0703", hemiTop: "#6b4424", hemiBottom: "#0b0805", key: "#ffb36b", neon: ["#ff8a1f", "#ffb02e", "#ff3b1f", "#19f0ff", "#ffd36b"], ground: "#191512" },
  npcs: [
    { id: "ozzy", x: -8.8, z: 47, yaw: Math.PI / 2 },
  ],
  terminals: [{ id: "contracts", x: 8.6, z: 47.5, yaw: -Math.PI / 2, label: "Contract Terminal" }],
  stations: [
    { id: "transitGate", x: 0, z: 57.6, label: "Maglev Transit" },
  ],
  doors: [
    { id: "tunnelHatch", at: [54, 50], to: { x: 0, z: 73, yaw: 0 }, label: "Open maintenance hatch", flag: "hatchFound" },
    { id: "tunnelExit", at: [0, 70.6], to: { x: 54, z: 47.6, yaw: Math.PI }, label: "Climb to the surface" },
  ],
  points: {
    foundryGate: [-44, -18],
    mach1: [-52, -48.8], mach2: [-32, -48.8], mach3: [-52, -32.8], mach4: [-32, -32.8],
    containerYard: [40, -36], hd0447: [40, -47.6],
    man1: [23.8, -24], man2: [40, -26.2], man3: [57.6, -44],
    checkpoint: [0, -12], protTerm: [0, -33.4], annex: [0, -28],
    road: [0, -4],
    toxicGate: [-40, 10], valve1: [-41.6, 14.5], valve2: [-38.4, 29], valve3: [-30, 49.5], pumpCtl: [-55.8, 52],
    dock: [32, 16], tracks: [-30, -10], log: [48, 38], hatch: [54, 50],
    tunnel: [0, 80], foundry: [0, 140],
  },
  patrols: [
    { type: "secBot", route: [[-50, -2], [-20, -2], [-20, 6], [-50, 6]] },
    { type: "drone", route: [[30, 20], [50, 40], [30, 50]] },
    { type: "secBot", route: [[44, -8], [58, -8], [58, 6], [44, 6]] },
  ],
  civilians: [
    [[-6, 44], [-6, 20], [-6, -6], [-40, -6]],
    [[6, -6], [6, 30], [6, 44]],
    [[20, -2], [56, -2], [56, 4], [20, 4]],
  ],
  signs: 26,
};
