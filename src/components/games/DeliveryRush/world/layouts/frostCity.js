/**
 * Delivery Rush — Zone 4: FROST CITY.
 *
 * A tight old-town grid under snow. Short blocks, narrow streets and pitched
 * roofs everywhere, which makes it the most claustrophobic district to drive:
 * with the grip this district hands you, every junction has to be set up two
 * streets early.
 *
 * A frozen park sits in the middle. Its path is the only straight line here.
 */

import { CityBuilder, ROAD_W } from "../cityBuilder.js";
import { gridRoads, halfWidths, cell, splitCellZ, signalise } from "./grid.js";

const XS = [-158, -92, -28, 36, 100, 168];
const ZS = [-150, -86, -22, 42, 106, 172];
const MAIN_X = [2];
const MAIN_Z = [2];

export function buildFrostCity(zone) {
  const b = new CityBuilder({ seed: zone.seed, zone: zone.id });
  const hwX = halfWidths(XS, MAIN_X, "narrow");
  const hwZ = halfWidths(ZS, MAIN_Z, "narrow");

  gridRoads(b, XS, ZS, { mainX: MAIN_X, mainZ: MAIN_Z, type: "narrow" });
  const C = (i, j, pad = 0) => cell(XS, ZS, hwX, hwZ, i, j, pad);

  const oldTown = {
    kinds: ["townhouse", "townhouse", "apartment", "house"],
    heights: [2, 4],
    shops: 0.42,
    trees: 2.2,
    treeKind: "pine",
    widthRange: [6, 10.5],
    minDepth: 8,
    maxDepth: 12,
  };
  const centre = {
    kinds: ["apartment", "townhouse", "shop", "hotel"],
    heights: [3, 6],
    shops: 0.68,
    trees: 1.8,
    treeKind: "pine",
    widthRange: [7, 12],
  };
  const outskirts = {
    kinds: ["house", "townhouse", "house"],
    heights: [1, 2],
    shops: 0.15,
    trees: 3.4,
    treeKind: "pine",
    widthRange: [6, 10],
    minDepth: 7,
    maxDepth: 11,
  };

  for (let i = 0; i < XS.length - 1; i++) {
    for (let j = 0; j < ZS.length - 1; j++) {
      const c = C(i, j);
      if (c.x1 - c.x0 < 12 || c.z1 - c.z0 < 12) continue;

      // frozen park in the middle of town
      if (i === 2 && j === 2) {
        b.park(c.x0, c.z0, c.x1, c.z1, { trees: 18, benches: 6, pond: true, treeKind: "pine" });
        continue;
      }
      if (i === 1 && j === 3) {
        b.lot(c.x0, c.z0, c.x1, c.z1, { cars: 0.45 });
        continue;
      }
      // a couple of blocks split by a back lane
      if ((i === 3 && j === 1) || (i === 1 && j === 1)) {
        const [n, s] = splitCellZ(b, c);
        b.block(n.x0, n.z0, n.x1, n.z1, centre);
        b.block(s.x0, s.z0, s.x1, s.z1, oldTown);
        continue;
      }
      const edge = i === 0 || i === XS.length - 2 || j === 0 || j === ZS.length - 2;
      const core = Math.abs(i - 2) <= 1 && Math.abs(j - 2) <= 1;
      b.block(c.x0, c.z0, c.x1, c.z1, core ? centre : edge ? outskirts : oldTown);
    }
  }

  /* ------------------------------------------------------------ snow work */

  // ploughed banks and grit piles along the outer ring
  for (let i = 0; i < 26; i++) {
    const t = i / 26;
    b.prop("mound", -170 + t * 340, i % 2 ? -166 : 188, i * 0.4, { scale: 1.2, snow: true });
  }
  for (let i = 0; i < 18; i++) {
    b.prop("pine", -176, -150 + i * 20, 0, { scale: 1.3 });
    b.prop("pine", 186, -150 + i * 20, 0, { scale: 1.3 });
  }

  b.building("gas-station", XS[4] + 22, ZS[1] - 24, Math.PI / 2, { w: 30, d: 24 });

  signalise(b, XS[2], ZS[2], ROAD_W.main / 2, ROAD_W.main / 2);
  signalise(b, XS[2], ZS[1], ROAD_W.main / 2, ROAD_W.narrow / 2);
  signalise(b, XS[3], ZS[2], ROAD_W.narrow / 2, ROAD_W.main / 2);

  /* ----------------------------------------------------------- landmarks */

  const laneX = (i, side) => XS[i] + side * hwX[i] * 0.5;
  const laneZ = (j, side) => ZS[j] + side * hwZ[j] * 0.5;

  b.location("frost-bakery", "Frost Bakery", -60, laneZ(1, 1), { kind: "bakery", yaw: Math.PI });
  b.location("old-square", "Old Square", laneX(2, 1), -56, { kind: "civic", yaw: -Math.PI / 2 });
  b.location("pine-lodge", "Pine Lodge", laneX(0, 1), 74, { kind: "hotel", yaw: -Math.PI / 2 });
  b.location("north-chapel", "North Chapel", 8, laneZ(4, -1), { kind: "civic", yaw: 0 });
  b.location("winter-market", "Winter Market", laneX(3, -1), 12, { kind: "market", yaw: Math.PI / 2 });
  b.location("ice-house", "Ice House", 132, laneZ(1, -1), { kind: "depot", yaw: 0 });
  b.location("hill-cottages", "Hill Cottages", laneX(4, -1), -104, { kind: "home", yaw: Math.PI / 2 });
  b.location("station-cafe", "Station Cafe", -122, laneZ(3, 1), { kind: "cafe", yaw: Math.PI });
  b.location("east-terrace", "East Terrace", laneX(4, 1), 138, { kind: "home", yaw: -Math.PI / 2 });
  b.location("south-store", "South Store", 70, laneZ(0, 1), { kind: "market", yaw: Math.PI });
  b.location("west-yard", "West Yard", laneX(1, -1), -120, { kind: "depot", yaw: Math.PI / 2 });
  b.location("clock-tower", "Clock Tower", laneX(2, -1), 130, { kind: "civic", yaw: Math.PI / 2 });

  b.setSpawn(laneX(2, 1), -100, 0);
  return b.finish();
}
