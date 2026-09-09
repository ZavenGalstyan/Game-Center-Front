/**
 * Delivery Rush — Zone 3: INDUSTRIAL RUN.
 *
 * Big blocks, long sight lines, wet asphalt. The grid is coarse — four huge
 * cells of depots and container yards — so the fast route is rarely the road:
 * the service lanes cutting between the warehouses and the open yards you can
 * drive straight across are where the time is.
 *
 * Yards are fenced, which makes their entrances real decision points instead
 * of open ground.
 */

import { CityBuilder, SIDEWALK_W, ROAD_W } from "../cityBuilder.js";
import { gridRoads, halfWidths, cell, signalise } from "./grid.js";

const XS = [-206, -66, 74, 214];
const ZS = [-176, -58, 60, 178];
const MAIN_X = [1];
const MAIN_Z = [1];

export function buildIndustrialRun(zone) {
  const b = new CityBuilder({ seed: zone.seed, zone: zone.id });
  const hwX = halfWidths(XS, MAIN_X);
  const hwZ = halfWidths(ZS, MAIN_Z);

  gridRoads(b, XS, ZS, { mainX: MAIN_X, mainZ: MAIN_Z, type: "service" });
  const C = (i, j, pad = 0) => cell(XS, ZS, hwX, hwZ, i, j, pad);

  // service lanes cutting each big cell into quarters — the shortcut network
  const lanes = [
    [XS[0] + 70, ZS[0] - 6, XS[0] + 70, ZS[3] + 6],
    [XS[1] + 70, ZS[0] - 6, XS[1] + 70, ZS[3] + 6],
    [XS[2] + 70, ZS[0] - 6, XS[2] + 70, ZS[3] + 6],
    [XS[0] - 6, ZS[0] + 59, XS[3] + 6, ZS[0] + 59],
    [XS[0] - 6, ZS[1] + 59, XS[3] + 6, ZS[1] + 59],
    [XS[0] - 6, ZS[2] + 59, XS[3] + 6, ZS[2] + 59],
  ];
  for (const [ax, az, bx, bz] of lanes) b.road(ax, az, bx, bz, "alley");

  const depot = {
    kinds: ["warehouse", "warehouse", "factory"],
    heights: [1, 3],
    shops: 0,
    trees: 0.5,
    lamps: 1.4,
    widthRange: [16, 30],
    minDepth: 14,
    maxDepth: 22,
  };
  const works = {
    kinds: ["warehouse", "office", "factory", "parking-structure"],
    heights: [2, 4],
    shops: 0.15,
    trees: 0.9,
    lamps: 1.6,
    widthRange: [13, 24],
    minDepth: 12,
    maxDepth: 20,
  };

  /** Quarter a big cell around its two service lanes. */
  const quarters = (i, j) => {
    const c = C(i, j);
    const mx = XS[i] + 70;
    const mz = ZS[j] + 59;
    const h = ROAD_W.alley / 2 + SIDEWALK_W;
    return [
      { x0: c.x0, z0: c.z0, x1: mx - h, z1: mz - h },
      { x0: mx + h, z0: c.z0, x1: c.x1, z1: mz - h },
      { x0: c.x0, z0: mz + h, x1: mx - h, z1: c.z1 },
      { x0: mx + h, z0: mz + h, x1: c.x1, z1: c.z1 },
    ];
  };

  /* -------------------------------------------------------- container yard */

  const yard = (r, rows = 3) => {
    b.lot(r.x0, r.z0, r.x1, r.z1, { cars: 0 });
    const cols = Math.floor((r.x1 - r.x0 - 8) / 8);
    for (let row = 0; row < rows; row++) {
      const z = r.z0 + 9 + row * ((r.z1 - r.z0 - 14) / Math.max(1, rows - 1 || 1));
      for (let cIdx = 0; cIdx < cols; cIdx++) {
        if ((row * 7 + cIdx * 3) % 5 === 0) continue; // leave driving gaps
        b.prop("container", r.x0 + 8 + cIdx * 8, z, 0);
      }
    }
    // perimeter fence with one wide gate on each long side
    const gate = (r.x0 + r.x1) / 2;
    b.barrier(r.x0, r.z0, gate - 9, r.z0, "fence");
    b.barrier(gate + 9, r.z0, r.x1, r.z0, "fence");
    b.barrier(r.x0, r.z1, gate - 9, r.z1, "fence");
    b.barrier(gate + 9, r.z1, r.x1, r.z1, "fence");
    b.barrier(r.x0, r.z0, r.x0, r.z1, "fence");
    b.barrier(r.x1, r.z0, r.x1, r.z1, "fence");
    for (let z = r.z0 + 12; z < r.z1; z += 34) {
      b.prop("streetlight", r.x0 + 3, z, Math.PI / 2);
      b.prop("streetlight", r.x1 - 3, z, -Math.PI / 2);
    }
  };

  /* ------------------------------------------------------------ the cells */

  for (let i = 0; i < XS.length - 1; i++) {
    for (let j = 0; j < ZS.length - 1; j++) {
      const q = quarters(i, j);
      q.forEach((r, k) => {
        if (r.x1 - r.x0 < 18 || r.z1 - r.z0 < 18) return;
        const pick = (i * 3 + j * 5 + k) % 6;
        if (pick === 0) yard(r, 3);
        else if (pick === 3) b.lot(r.x0, r.z0, r.x1, r.z1, { cars: 0.6 });
        else b.block(r.x0, r.z0, r.x1, r.z1, pick === 4 ? works : depot);
      });
    }
  }

  /* -------------------------------------------------------- yard clutter */

  for (let i = 0; i < 34; i++) {
    const x = -190 + ((i * 53) % 380);
    const z = -160 + ((i * 91) % 320);
    b.prop("crate", x, z, (i % 4) * 0.7, { scale: 0.9 + (i % 3) * 0.3 });
  }
  for (let i = 0; i < 10; i++) {
    b.prop("mound", -180 + i * 41, -168 + ((i * 67) % 330), i * 0.6, { scale: 1.1 });
  }

  b.building("gas-station", XS[1] + 34, ZS[1] - 30, Math.PI / 2, { w: 32, d: 26 });

  signalise(b, XS[1], ZS[1], ROAD_W.main / 2, ROAD_W.main / 2);
  signalise(b, XS[2], ZS[1], ROAD_W.service / 2, ROAD_W.main / 2);
  signalise(b, XS[1], ZS[2], ROAD_W.main / 2, ROAD_W.service / 2);

  /* ----------------------------------------------------------- landmarks */

  const laneX = (i, side) => XS[i] + side * hwX[i] * 0.5;
  const laneZ = (j, side) => ZS[j] + side * hwZ[j] * 0.5;

  b.location("dock-gate", "Dock Gate", laneX(0, 1), -120, { kind: "depot", yaw: -Math.PI / 2 });
  b.location("rapid-parts", "Rapid Parts", -140, laneZ(1, 1), { kind: "depot", yaw: Math.PI });
  b.location("north-yard", "North Yard", laneX(1, -1), 128, { kind: "depot", yaw: Math.PI / 2 });
  b.location("foundry", "The Foundry", 30, laneZ(0, 1), { kind: "depot", yaw: Math.PI });
  b.location("cold-store", "Cold Store", laneX(2, 1), 20, { kind: "depot", yaw: -Math.PI / 2 });
  b.location("east-depot", "East Depot", laneX(3, -1), -104, { kind: "depot", yaw: Math.PI / 2 });
  b.location("works-office", "Works Office", -30, laneZ(2, -1), { kind: "office", yaw: 0 });
  b.location("fuel-point", "Fuel Point", laneX(1, 1), -34, { kind: "shop", yaw: -Math.PI / 2 });
  b.location("south-gate", "South Gate", 150, laneZ(0, -1), { kind: "depot", yaw: 0 });
  b.location("canteen", "The Canteen", laneX(2, -1), 132, { kind: "food", yaw: Math.PI / 2 });
  b.location("west-works", "West Works", -170, laneZ(2, 1), { kind: "depot", yaw: Math.PI });
  b.location("far-dock", "Far Dock", 170, laneZ(3, -1), { kind: "depot", yaw: 0 });

  b.setSpawn(laneX(1, 1), -100, 0);
  return b.finish();
}
