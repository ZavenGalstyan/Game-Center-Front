/**
 * Delivery Rush — Zone 5: MIDNIGHT METRO.
 *
 * The final district: a dense night downtown of towers, car parks and neon,
 * on wet asphalt. The grid is the tightest in the game and almost every block
 * is split by a back lane, so the map rewards players who have learned to
 * commit to a line — and punishes anyone still reading the mini-map.
 *
 * Lighting here is almost entirely emissive: lit windows, signage and lamp
 * pools, with a single dim moon-ish directional light. No point lights.
 */

import { CityBuilder, ROAD_W } from "../cityBuilder.js";
import { gridRoads, halfWidths, cell, splitCellX, splitCellZ, signalise } from "./grid.js";

const XS = [-176, -106, -38, 30, 98, 172];
const ZS = [-166, -98, -30, 38, 106, 174];
const MAIN_X = [1, 4];
const MAIN_Z = [2];

export function buildMidnightMetro(zone) {
  const b = new CityBuilder({ seed: zone.seed, zone: zone.id });
  const hwX = halfWidths(XS, MAIN_X, "narrow");
  const hwZ = halfWidths(ZS, MAIN_Z, "narrow");

  gridRoads(b, XS, ZS, { mainX: MAIN_X, mainZ: MAIN_Z, type: "narrow" });
  const C = (i, j, pad = 0) => cell(XS, ZS, hwX, hwZ, i, j, pad);

  const highrise = {
    kinds: ["tower", "office", "office", "apartment"],
    heights: [8, 14],
    shops: 0.8,
    trees: 1.2,
    lamps: 2.6,
    widthRange: [11, 19],
    minDepth: 10,
    maxDepth: 16,
  };
  const strip = {
    kinds: ["shop", "office", "apartment", "hotel"],
    heights: [4, 8],
    shops: 0.9,
    trees: 1.6,
    lamps: 2.4,
    widthRange: [7, 12],
  };
  const backstreet = {
    kinds: ["apartment", "shop", "townhouse", "office"],
    heights: [3, 7],
    shops: 0.6,
    trees: 2.0,
    lamps: 2.2,
  };

  for (let i = 0; i < XS.length - 1; i++) {
    for (let j = 0; j < ZS.length - 1; j++) {
      const c = C(i, j);
      if (c.x1 - c.x0 < 12 || c.z1 - c.z0 < 12) continue;

      if (i === 2 && j === 2) {
        // a multi-storey car park you can cut the corner around
        b.building("parking-structure", (c.x0 + c.x1) / 2, (c.z0 + c.z1) / 2, 0, {
          w: Math.min(c.x1 - c.x0, 34),
          d: Math.min(c.z1 - c.z0, 30),
          storeys: 5,
        });
        b.lot(c.x0, c.z1 - 16, c.x1, c.z1, { cars: 0.5 });
        continue;
      }
      if (i === 1 && j === 1) {
        b.park(c.x0, c.z0, c.x1, c.z1, { trees: 12, benches: 4, path: true });
        continue;
      }

      const core = Math.abs(i - 2) <= 1 && Math.abs(j - 2) <= 1;
      const style = core ? highrise : j === 2 || i === 1 ? strip : backstreet;

      // most blocks are cut by a lane; alternate the axis so the alleys form
      // a usable network rather than a set of dead ends
      if ((i + j) % 2 === 0 && c.x1 - c.x0 > 48) {
        const [w, e] = splitCellX(b, c);
        b.block(w.x0, w.z0, w.x1, w.z1, style);
        b.block(e.x0, e.z0, e.x1, e.z1, style);
      } else if ((i + j) % 2 === 1 && c.z1 - c.z0 > 48) {
        const [n, s] = splitCellZ(b, c);
        b.block(n.x0, n.z0, n.x1, n.z1, style);
        b.block(s.x0, s.z0, s.x1, s.z1, style);
      } else {
        b.block(c.x0, c.z0, c.x1, c.z1, style);
      }
    }
  }

  /* ------------------------------------------------------------ nightlife */

  for (let i = 0; i < 10; i++) {
    b.prop("kiosk", -150 + i * 34, ZS[2] + 13, Math.PI);
  }
  for (let i = 0; i < 8; i++) {
    b.prop("terrace", -120 + i * 30, ZS[2] - 13, 0);
  }
  for (let z = -160; z < 175; z += 24) {
    b.prop("streetlight", XS[1] + 11.5, z, -Math.PI / 2);
    b.prop("streetlight", XS[4] - 11.5, z, Math.PI / 2);
  }

  b.building("gas-station", XS[0] + 26, ZS[3] + 26, Math.PI / 2, { w: 30, d: 24 });

  signalise(b, XS[1], ZS[2], ROAD_W.main / 2, ROAD_W.main / 2);
  signalise(b, XS[4], ZS[2], ROAD_W.main / 2, ROAD_W.main / 2);
  signalise(b, XS[2], ZS[2], ROAD_W.narrow / 2, ROAD_W.main / 2);
  signalise(b, XS[3], ZS[2], ROAD_W.narrow / 2, ROAD_W.main / 2);
  signalise(b, XS[1], ZS[1], ROAD_W.main / 2, ROAD_W.narrow / 2);
  signalise(b, XS[4], ZS[3], ROAD_W.main / 2, ROAD_W.narrow / 2);

  /* ----------------------------------------------------------- landmarks */

  const laneX = (i, side) => XS[i] + side * hwX[i] * 0.5;
  const laneZ = (j, side) => ZS[j] + side * hwZ[j] * 0.5;

  b.location("night-owl", "Night Owl", -70, laneZ(2, 1), { kind: "bar", yaw: Math.PI });
  b.location("metro-tower", "Metro Tower", laneX(3, -1), -60, { kind: "office", yaw: Math.PI / 2 });
  b.location("neon-arcade", "Neon Arcade", 62, laneZ(2, -1), { kind: "shop", yaw: 0 });
  b.location("east-lofts", "East Lofts", laneX(4, 1), 70, { kind: "home", yaw: -Math.PI / 2 });
  b.location("late-market", "Late Market", laneX(1, -1), 128, { kind: "market", yaw: Math.PI / 2 });
  b.location("dock-street", "Dock Street", -140, laneZ(4, -1), { kind: "depot", yaw: 0 });
  b.location("central-garage", "Central Garage", laneX(2, 1), 6, { kind: "depot", yaw: -Math.PI / 2 });
  b.location("river-hotel", "River Hotel", 130, laneZ(1, 1), { kind: "hotel", yaw: Math.PI });
  b.location("south-station", "South Station", laneX(1, 1), -140, { kind: "civic", yaw: -Math.PI / 2 });
  b.location("west-noodle", "Golden Noodle", -152, laneZ(3, 1), { kind: "food", yaw: Math.PI });
  b.location("high-court", "High Court", 20, laneZ(4, 1), { kind: "civic", yaw: Math.PI });
  b.location("north-lofts", "North Lofts", laneX(3, 1), 150, { kind: "home", yaw: -Math.PI / 2 });

  b.setSpawn(laneX(1, 1), -120, 0);
  return b.finish();
}
