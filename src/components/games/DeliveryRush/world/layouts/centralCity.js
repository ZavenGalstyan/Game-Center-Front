/**
 * Delivery Rush — Zone 1: CENTRAL CITY.
 *
 * The teaching district. A legible 4x4 grid with two boulevards crossing at
 * the origin, a park in the middle you can cut across on foot-path level, and
 * three service alleys that shave real seconds off the diagonal runs. Blocks
 * get denser and taller toward the crossing so the skyline has a centre.
 *
 * Landmarks are placed by hand (never randomly) because missions address them
 * by id and a moving Fresh Mart would be a bug, not variety.
 */

import { CityBuilder, SIDEWALK_W } from "../cityBuilder.js";
import { gridRoads, halfWidths, cell, splitCellX, splitCellZ, signalise } from "./grid.js";

const XS = [-186, -96, 0, 96, 186];
const ZS = [-166, -84, 0, 84, 166];
const MAIN_X = [2];
const MAIN_Z = [2];

export function buildCentralCity(zone) {
  const b = new CityBuilder({ seed: zone.seed, zone: zone.id });
  const hwX = halfWidths(XS, MAIN_X);
  const hwZ = halfWidths(ZS, MAIN_Z);

  gridRoads(b, XS, ZS, { mainX: MAIN_X, mainZ: MAIN_Z });
  const C = (i, j, pad = 0) => cell(XS, ZS, hwX, hwZ, i, j, pad);

  const downtown = {
    kinds: ["office", "office", "apartment", "shop", "tower"],
    heights: [6, 11],
    shops: 0.62,
    trees: 1.9,
    maxDepth: 16,
  };
  const midtown = {
    kinds: ["apartment", "shop", "office", "hotel"],
    heights: [4, 7],
    shops: 0.55,
    trees: 2.6,
  };
  const residential = {
    kinds: ["townhouse", "apartment", "townhouse", "house"],
    heights: [2, 4],
    shops: 0.2,
    trees: 3.4,
    widthRange: [6.5, 11],
  };

  /* ------------------------------------------------------------ north row */

  b.block(...R(C(0, 0)), residential);
  b.block(...R(C(1, 0)), midtown);
  b.block(...R(C(2, 0)), midtown);
  b.block(...R(C(3, 0)), residential);

  /* ----------------------------------------------- second row + the park */

  // west block cut by a north-south alley: the first shortcut players find
  {
    const [w, e] = splitCellX(b, C(0, 1));
    b.block(...R(w), { ...residential, trees: 2.4 });
    b.block(...R(e), { ...midtown, shops: 0.7 });
  }
  // CENTRAL GREEN — a lawn you can cross, with a paved path straight through
  b.park(...R(C(1, 1)), { trees: 26, benches: 8, pond: true, path: true });
  b.block(...R(C(2, 1)), downtown);
  {
    // parking lot behind a row of apartments
    const c = C(3, 1);
    b.block(c.x0, c.z0, c.x1, c.z0 + 34, midtown);
    b.lot(c.x0 + 2, c.z0 + 40, c.x1 - 2, c.z1, { cars: 0.55 });
  }

  /* ------------------------------------------------ third row + downtown */

  b.block(...R(C(0, 2)), residential);
  b.block(...R(C(1, 2)), downtown);
  {
    // civic plaza + filling station on the busiest corner in the district
    const c = C(2, 2);
    b.plaza(c.x0, c.z0, c.x0 + 40, c.z1);
    b.building("gas-station", c.x0 + 66, c.z0 + 22, Math.PI, { w: 34, d: 26 });
    b.block(c.x0 + 46, c.z0 + 40, c.x1, c.z1, { ...midtown, fill: "perimeter" });
    for (let i = 0; i < 5; i++) {
      b.prop("tree", c.x0 + 8 + i * 7.5, c.z0 + 8, 0, { scale: 1.15 });
      b.prop("bench", c.x0 + 8 + i * 7.5, c.z0 + 16, 0);
    }
    b.prop("kiosk", c.x0 + 22, c.z1 - 10, Math.PI);
  }
  b.block(...R(C(3, 2)), midtown);

  /* ------------------------------------------------------------ south row */

  b.block(...R(C(0, 3)), residential);
  {
    const [n, s] = splitCellZ(b, C(1, 3));
    b.block(...R(n), { ...midtown, shops: 0.75 });
    b.block(...R(s), residential);
  }
  b.block(...R(C(2, 3)), midtown);
  b.block(...R(C(3, 3)), residential);

  /* --------------------------------------------------------- street works */

  // signal the two boulevard junctions
  signalise(b, XS[2], ZS[2], 8.5, 8.5);
  signalise(b, XS[2], ZS[1], 8.5, 5.5);
  signalise(b, XS[2], ZS[3], 8.5, 5.5);
  signalise(b, XS[1], ZS[2], 5.5, 8.5);
  signalise(b, XS[3], ZS[2], 5.5, 8.5);

  // bus stops along the main boulevards
  b.prop("bus-stop", XS[2] + 11.5, -52, -Math.PI / 2);
  b.prop("bus-stop", XS[2] - 11.5, 48, Math.PI / 2);
  b.prop("bus-stop", -60, ZS[2] + 11.5, Math.PI);
  b.prop("bus-stop", 62, ZS[2] - 11.5, 0);

  // cafe terraces facing the green
  for (let i = 0; i < 4; i++) {
    b.prop("terrace", -66 + i * 9, ZS[1] + 9.5, 0);
  }

  /* ----------------------------------------------------------- landmarks */

  const laneX = (i, side) => XS[i] + side * hwX[i] * 0.5;
  const laneZ = (j, side) => ZS[j] + side * hwZ[j] * 0.5;

  b.location("city-cafe", "City Cafe", -66, laneZ(1, 1), { kind: "cafe", yaw: Math.PI });
  b.location("fresh-mart", "Fresh Mart", laneX(1, 1), -122, { kind: "market", yaw: -Math.PI / 2 });
  b.location("metro-apartments", "Metro Apartments", 62, laneZ(3, -1), { kind: "home", yaw: 0 });
  b.location("quick-bites", "Quick Bites", laneX(2, 1), 44, { kind: "food", yaw: -Math.PI / 2 });
  b.location("central-tower", "Central Tower", laneX(3, -1), -40, { kind: "office", yaw: Math.PI / 2 });
  b.location("urban-shop", "Urban Shop", -134, laneZ(2, -1), { kind: "shop", yaw: 0 });
  b.location("park-kiosk", "Green Kiosk", -46, laneZ(1, -1), { kind: "kiosk", yaw: 0 });
  b.location("north-court", "North Court", laneX(1, -1), -46, { kind: "home", yaw: Math.PI / 2 });
  b.location("civic-plaza", "Civic Plaza", 34, laneZ(2, 1), { kind: "civic", yaw: Math.PI });
  b.location("daily-bread", "Daily Bread", laneX(3, 1), 108, { kind: "bakery", yaw: -Math.PI / 2 });
  b.location("corner-bar", "The Corner Bar", 128, laneZ(3, 1), { kind: "bar", yaw: Math.PI });
  b.location("west-depot", "West Depot", laneX(0, 1), 60, { kind: "depot", yaw: -Math.PI / 2 });

  b.setSpawn(laneX(2, 1), -30, 0);
  return b.finish();
}

/** Spread a rect into the (x0, z0, x1, z1) argument order block() expects. */
function R(c) {
  return [c.x0, c.z0, c.x1, c.z1];
}
