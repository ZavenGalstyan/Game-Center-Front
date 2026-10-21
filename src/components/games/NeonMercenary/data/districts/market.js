/**
 * District 1 — Neon Market. Crowded rainy streets, cyan / magenta neon.
 *
 *   NW  Red Fang hideout courtyard (gated; Razor's arena)
 *   W   Red Fang alleys (gang territory)
 *   N-S Neon Boulevard (vendors, The Switchboard bar, Doc Rhee's clinic)
 *   E-W Lantern Street
 *   NE  Lotus counting-house compound (stealth contract)
 *   SE  Relay plaza (comms relay platform)
 *   SW  Safehouse yard          S  Maglev transit station
 */
import { paint, room, stairs, prop, crate, container, barrier } from "../layout.js";

const plan = paint(32, 32, [
  // perimeter towers
  [0, 0, 7, 0, "8"], [8, 0, 15, 0, "9"], [16, 0, 23, 0, "7"], [24, 0, 31, 0, "9"],
  [0, 31, 10, 31, "7"], [11, 31, 20, 31, "9"], [21, 31, 31, 31, "8"],
  [0, 1, 0, 15, "9"], [0, 16, 0, 30, "8"], [31, 1, 31, 15, "8"], [31, 16, 31, 30, "9"],
  // Red Fang hideout walls (gate gap at row 6, cols 3–4)
  [7, 1, 7, 6, "W"], [1, 6, 2, 6, "W"], [5, 6, 6, 6, "W"],
  // western blocks / alleys
  [8, 1, 11, 4, "5"], [8, 6, 11, 8, "4"],
  [1, 8, 3, 9, "3"], [5, 9, 7, 11, "4"], [9, 10, 11, 12, "3"], [1, 11, 3, 12, "2"],
  // east side of the boulevard (The Switchboard = rows 7–13)
  [19, 1, 20, 5, "6"], [19, 7, 20, 13, "5"],
  // Lotus compound walls (entrance at row 6)
  [21, 1, 21, 5, "W"], [21, 7, 21, 12, "W"], [22, 12, 30, 12, "W"],
  // south-west
  [1, 18, 7, 22, "5"], [9, 18, 12, 21, "4"], [9, 23, 12, 30, "6"],
  // south-east
  [19, 18, 21, 21, "4"], [19, 23, 21, 30, "7"], [22, 30, 30, 30, "3"],
]);

const boxes = [
  // --- hideout gate (opened by contract 7)
  { x0: -52, x1: -44, z0: -39.4, z1: -37.6, y1: 4.6, kind: "gate", id: "hideoutGate" },
  // hideout courtyard cover
  crate(-55, -55, 1.4), crate(-41, -55, 1.4), prop("crate", -48, -50, 3, 1.2, 1.1), crate(-56, -45), crate(-40, -45),
  prop("barrier", -48, -43, 4, 0.6, 1.05), container(-50, -58.4, true, 2.6, 2),
  // --- alleys cover
  crate(-22, -26.5), crate(-19.5, -25.5, 1.0, 1.0), prop("dumpster", -38, -33.5, 2.6, 1.4, 1.35), crate(-46, -26), crate(-46, -16, 1.3),
  prop("dumpster", -54, -34, 2.6, 1.4, 1.35), crate(-58, -22, 1.2), prop("barrier", -30, -26, 0.6, 3, 1.05), crate(-30, -14), crate(-25, -10),
  prop("dumpster", -58, -9.5, 2.6, 1.4, 1.35), crate(-36, -10, 1.2),
  // jammer pedestal (Street Sweep)
  prop("jammer", -54, -22, 1, 1, 1.6, { id: "jammer", solid: true }),
  // --- boulevard stalls & cars (cover)
  prop("stall", -10.6, -30, 2.2, 4, 1.1), prop("stall", 10.6, -40, 2.2, 4, 1.1), prop("stall", -10.6, -48, 2.2, 4, 1.1), prop("stall", 10.6, -26, 2.2, 3, 1.1),
  prop("car", -4, -46, 2, 4.4, 1.4, { color: 1 }), prop("car", 5, -20, 2, 4.4, 1.4, { color: 0 }), prop("car", -5, 24, 2, 4.4, 1.4, { color: 2 }), prop("car", 4, 38, 2, 4.4, 1.4, { color: 1 }),
  prop("stall", -10.6, 30, 2.2, 4, 1.1), prop("stall", 10.6, 46, 2.2, 3.5, 1.1),
  // Noodle Nan's counter (Lantern St / boulevard corner)
  prop("counter", -18, -5.2, 6, 1, 1.05, { id: "nanCounter" }),
  // holo kiosks
  prop("kiosk", 0, -8.5, 1.4, 1.4, 2.4), prop("kiosk", 0, 8.5, 1.4, 1.4, 2.4),
  // Lantern street east
  prop("car", 34, -3, 4.4, 2, 1.4, { color: 2 }), crate(44, 5), crate(52, -5), prop("barrier", 26, 2, 0.6, 3, 1.05), prop("dumpster", 58, 5.5, 1.4, 2.6, 1.35),
  // west Lantern street
  prop("car", -40, 3, 4.4, 2, 1.4, { color: 0 }), crate(-56, 5), prop("barrier", -30, 4, 0.6, 3, 1.05),
  // --- Lotus compound: hall (west door into storage, partition door to the office)
  ...room(38, -54, 56, -26, { doors: { w: [[-36, -33]] } }),
  { x0: 38, x1: 56, z0: -40.2, z1: -39.8, y1: 4.2, kind: "iwall", partition: true, _skip: true },
  // compound yard cover
  crate(28, -50, 1.4), crate(30, -44), prop("crate", 30, -32, 3, 1.3, 1.15), container(28, -22, true, 2.6, 0), crate(34, -24), crate(35, -56), prop("crate", 33, -38, 1.3, 3, 1.15),
  // storage room crates + office desks
  crate(41, -29), crate(43.5, -29), prop("crate", 53, -31, 3, 1.4, 1.2), crate(48, -35), prop("desk", 42, -47, 3, 1.4, 0.95), prop("desk", 48, -50, 1.4, 3, 0.95),
  prop("terminal", 54.4, -51, 1, 1, 1.3, { id: "lotusTerminal" }),
  // --- relay plaza: platform + stairs + mast + fuse stack
  { x0: 46, x1: 54, z0: 32, z1: 40, y1: 2.4, kind: "platform" },
  ...stairs(41.8, 36, 3, 2.4, "x"),
  { x0: 51, x1: 53, z0: 37.5, z1: 39.5, y0: 2.4, y1: 10, kind: "mast" },
  prop("console", 49, 39.2, 1.6, 0.6, 3.5, { y0: 2.4, id: "relayConsole" }),
  prop("crate", 37, 50, 1.4, 1.4, 1.1), prop("crate", 35.3, 50, 1.6, 1.6, 2.2), prop("crate", 33.1, 50, 2.2, 2.2, 3.3),
  crate(30, 20), crate(40, 26), prop("barrier", 56, 22, 0.6, 3, 1.05), container(52, 50, true, 2.6, 1), crate(28, 40), prop("dumpster", 58.4, 30, 1.4, 2.6, 1.35),
  prop("dropbox", 57, 44, 1, 1, 1.2, { id: "deadDrop" }),
  // --- safehouse (door on the north wall)
  ...room(-58, 46, -46, 58, { h: 3.6, doors: { n: [[-54, -50]] } }),
  prop("bed", -56.4, 55.5, 2, 3, 0.6), prop("locker", -47, 56.6, 1.4, 0.6, 2.1, { id: "ammoLocker" }),
  prop("desk", -47.3, 50.5, 1.2, 2.4, 0.95, { id: "safeDesk" }),
  // safehouse yard
  prop("car", -40, 40, 2, 4.4, 1.4, { color: 0 }), crate(-34, 30), prop("barrier", -30, 47, 0.6, 3, 1.05),
  // --- transit station (raised platform, canopy pillars)
  { x0: -12, x1: 12, z0: 52, z1: 60, y1: 0.4, kind: "platform" },
  prop("pillar", -9, 55, 0.6, 0.6, 5), prop("pillar", 9, 55, 0.6, 0.6, 5),
  { x0: -12, x1: 12, z0: 52, z1: 60, y0: 5, y1: 5.4, kind: "canopy" },
  prop("gateTerm", 0, 58.6, 1.2, 0.8, 1.4, { id: "transitGate" }),
];

// the partition inside the Lotus hall has a door gap at x 47–49.5
const part = boxes.findIndex((b) => b._skip);
boxes.splice(part, 1, { x0: 38, x1: 47, z0: -40.2, z1: -39.8, y1: 4.2, kind: "iwall" }, { x0: 49.5, x1: 56, z0: -40.2, z1: -39.8, y1: 4.2, kind: "iwall" }, { x0: 47, x1: 49.5, z0: -40.2, z1: -39.8, y0: 3, y1: 4.2, kind: "iwall" });

export const MARKET = {
  id: "market",
  name: "Neon Market",
  tagline: "Rain, ramen and Red Fang turf",
  buildingStyle: "market",
  plan,
  boxes,
  spawn: { x: -52, z: 49.5, yaw: Math.PI },
  arrive: { x: 0, z: 49, yaw: Math.PI }, // from the maglev
  palette: { fog: "#140a24", fogDensity: 0.016, sky: "#07040f", hemiTop: "#3b2a6b", hemiBottom: "#08060d", key: "#8fb7ff", neon: ["#19f0ff", "#ff2bd6", "#a64dff", "#ffb02e", "#ff3b5c"], ground: "#15131c" },
  npcs: [
    { id: "juno", x: 10.2, z: -12.5, yaw: -Math.PI / 2 },
    { id: "kenji", x: 10.8, z: 14, yaw: -Math.PI / 2 },
    { id: "rhee", x: -10.8, z: 14, yaw: Math.PI / 2 },
    { id: "marta", x: 10.8, z: 33, yaw: -Math.PI / 2 },
    { id: "nan", x: -18, z: -6.5, yaw: 0 },
    { id: "pip", x: -30, z: -10.5, yaw: 0.4 },
  ],
  terminals: [{ id: "contracts", x: 10.6, z: -17, yaw: -Math.PI / 2, label: "Contract Terminal" }],
  stations: [
    { id: "transitGate", x: 0, z: 57.6, label: "Maglev Transit" },
    { id: "ammoLocker", x: -47, z: 55.6, label: "Ammo Locker" },
    { id: "bed", x: -56, z: 53.4, label: "Rest & Save" },
  ],
  points: {
    nanStall: [-18, -2],
    alley: [-46, -20],
    stash: [-22, -26],
    jammer: [-54, -22],
    drop: [57, 44],
    lotusGate: [18, -38],
    lotusTerminal: [53.6, -51],
    relay: [49, 37.6],
    fuseA: [58, 14.5],
    fuseC: [33.1, 50],
    hideoutGate: [-48, -34],
    hideout: [-48, -50],
    plaza: [40, 30],
    safehouse: [-52, 52],
  },
  // ambient gang patrols in the alleys (respawn when the district reloads)
  patrols: [
    { type: "gangFighter", route: [[-46, -34], [-46, -20], [-38, -14]] },
    { type: "gangGunner", route: [[-24, -34], [-36, -34]] },
    { type: "gangGunner", route: [[-56, -27], [-56, -16], [-50, -10]] },
    { type: "gangFighter", route: [[-30, -22], [-30, -12], [-20, -10]] },
  ],
  civilians: [
    [[-6, -54], [-6, -20], [-6, 20], [-6, 44]],
    [[6, 44], [6, 0], [6, -54]],
    [[-58, 2], [-20, 2], [20, -2], [56, -2]],
    [[56, 3], [14, 3], [-14, -3], [-56, -3]],
    [[-2, -30], [2, -8], [-2, 30]],
    [[30, 16], [54, 26], [40, 52], [28, 44]],
    [[8, -50], [8, -30], [8, -10]],
  ],
  // decorative signage seeds (render only)
  signs: 46,
};
