/**
 * Delivery Rush — Zone 2: SUNSET COAST.
 *
 * The district that breaks the grid. A curving coast boulevard runs the length
 * of the map as a polyline, every cross street ends on it, and the whole thing
 * is squeezed between the beach and a tight hotel quarter. Streets inland are
 * narrower than Central City, so the racing line matters more than top speed.
 *
 * The sea is the western world boundary — drive into it and you get fished out
 * at the nearest road rather than hitting an invisible wall.
 */

import { CityBuilder, SIDEWALK_W, ROAD_W } from "../cityBuilder.js";
import { halfWidths, cell, signalise } from "./grid.js";

const ZS = [-180, -108, -36, 36, 108, 180];
const XS = [-120, -40, 40, 128];
const MAIN_X = [2];

/** Centreline of the coast boulevard — a smooth bulge toward the sea. */
function coastX(z) {
  return -190 + 30 * Math.sin(((z + 180) / 360) * Math.PI);
}

const COAST_Z = [-180, -144, -108, -72, -36, 0, 36, 72, 108, 144, 180];

export function buildSunsetCoast(zone) {
  const b = new CityBuilder({ seed: zone.seed, zone: zone.id });
  const hwX = halfWidths(XS, MAIN_X);
  const hwZ = halfWidths(ZS, []);

  /* ------------------------------------------------------------- the sea */

  b.water(-460, -320, -258, 320);
  b.sand(-262, -300, -140, 300);

  /* ----------------------------------------------------------- the roads */

  b.polyRoad(COAST_Z.map((z) => [coastX(z), z]), "main");
  XS.forEach((x, i) => b.road(x, ZS[0], x, ZS[ZS.length - 1], MAIN_X.includes(i) ? "main" : "narrow"));
  ZS.forEach((z) => b.road(coastX(z), z, XS[XS.length - 1], z, "narrow"));

  const C = (i, j, pad = 0) => cell(XS, ZS, hwX, hwZ, i, j, pad);

  const hotels = {
    kinds: ["hotel", "apartment", "shop", "hotel"],
    heights: [4, 8],
    shops: 0.6,
    trees: 2.2,
    treeKind: "palm",
    widthRange: [8, 14],
  };
  const seaside = {
    kinds: ["shop", "townhouse", "cafe", "house", "apartment"],
    heights: [2, 4],
    shops: 0.75,
    trees: 2.8,
    treeKind: "palm",
    widthRange: [6, 11],
  };
  const inland = {
    kinds: ["apartment", "townhouse", "shop", "hotel"],
    heights: [3, 6],
    shops: 0.5,
    trees: 3.0,
    treeKind: "palm",
  };

  /* --------------------------------------------- the seafront hotel strip */

  for (let j = 0; j < ZS.length - 1; j++) {
    // the western limit follows the curve, so each strip block is inset to it
    const zMid = (ZS[j] + ZS[j + 1]) / 2;
    const westLimit =
      Math.max(coastX(ZS[j]), coastX(ZS[j + 1]), coastX(zMid)) + ROAD_W.main / 2 + SIDEWALK_W + 1.5;
    const rect = {
      x0: westLimit,
      x1: XS[0] - hwX[0] - SIDEWALK_W,
      z0: ZS[j] + hwZ[j] + SIDEWALK_W,
      z1: ZS[j + 1] - hwZ[j + 1] - SIDEWALK_W,
    };
    if (rect.x1 - rect.x0 < 16) continue;
    if (j === 2) {
      // a public slipway gap in the hotel wall — the beach shortcut
      b.block(rect.x0, rect.z0, rect.x1, rect.z0 + 22, seaside);
      b.lot(rect.x0 + 2, rect.z0 + 30, rect.x1 - 2, rect.z1, { cars: 0.35 });
    } else {
      b.block(rect.x0, rect.z0, rect.x1, rect.z1, j === 0 || j === 4 ? seaside : hotels);
    }
  }

  /* -------------------------------------------------------- inland blocks */

  for (let i = 0; i < XS.length - 1; i++) {
    for (let j = 0; j < ZS.length - 1; j++) {
      const c = C(i, j);
      if (c.x1 - c.x0 < 14 || c.z1 - c.z0 < 14) continue;
      if (i === 1 && j === 2) {
        b.park(c.x0, c.z0, c.x1, c.z1, { trees: 16, benches: 6, treeKind: "palm", path: true });
        continue;
      }
      if (i === 2 && j === 1) {
        b.block(c.x0, c.z0, c.x1, c.z0 + 26, inland);
        b.lot(c.x0 + 2, c.z0 + 34, c.x1 - 2, c.z1, { cars: 0.5 });
        continue;
      }
      b.block(c.x0, c.z0, c.x1, c.z1, i === 0 ? seaside : inland);
    }
  }

  /* ------------------------------------------------- boardwalk & seafront */

  b.plaza(-250, -190, -232, 190);
  for (let z = -186; z <= 186; z += 13) {
    b.prop("palm", -241, z, 0, { scale: 1.0 + ((z % 37) / 37) * 0.4 });
    if (((z + 186) / 13) % 3 === 0) b.prop("bench", -234, z, -Math.PI / 2);
    if (((z + 186) / 13) % 4 === 1) b.prop("bin", -247, z, Math.PI / 2);
  }
  for (let z = -170; z <= 170; z += 40) {
    b.prop("streetlight", -231, z, Math.PI / 2);
  }
  // two short piers reaching out over the water
  for (const pz of [-96, 84]) {
    b.plaza(-300, pz - 5, -250, pz + 5);
    for (let x = -296; x < -252; x += 11) {
      b.prop("streetlight", x, pz + 6.5, 0);
    }
  }
  // beach furniture
  for (let i = 0; i < 16; i++) {
    const z = -170 + i * 22;
    b.prop("terrace", -216 - (i % 3) * 9, z, 0);
  }

  // guardrail on the seaward shoulder of the boulevard
  for (let k = 0; k < COAST_Z.length - 1; k++) {
    const z0 = COAST_Z[k];
    const z1 = COAST_Z[k + 1];
    const x0 = coastX(z0) - ROAD_W.main / 2 - 1.4;
    const x1 = coastX(z1) - ROAD_W.main / 2 - 1.4;
    if (k % 2 === 0) b.barrier(x0, z0, x1, z1, "guardrail");
  }

  /* ------------------------------------------------------------- signals */

  signalise(b, XS[2], ZS[2], ROAD_W.main / 2, ROAD_W.narrow / 2);
  signalise(b, XS[2], ZS[3], ROAD_W.main / 2, ROAD_W.narrow / 2);
  signalise(b, XS[1], ZS[2], ROAD_W.narrow / 2, ROAD_W.narrow / 2);

  /* ----------------------------------------------------------- landmarks */

  const laneX = (i, side) => XS[i] + side * hwX[i] * 0.5;
  const laneZ = (j, side) => ZS[j] + side * hwZ[j] * 0.5;
  const coastLane = (z, side) => coastX(z) + side * (ROAD_W.main / 2) * 0.5;

  b.location("sunset-diner", "Sunset Diner", coastLane(-108, 1), -108 + 16, { kind: "food", yaw: Math.PI / 2 });
  b.location("bay-hotel", "Bay Hotel", coastLane(-36, 1), -20, { kind: "hotel", yaw: Math.PI / 2 });
  b.location("pier-kiosk", "Pier Kiosk", coastLane(72, 1), 66, { kind: "kiosk", yaw: Math.PI / 2 });
  b.location("palm-court", "Palm Court", laneX(0, 1), -60, { kind: "home", yaw: -Math.PI / 2 });
  b.location("harbor-supply", "Harbor Supply", laneX(1, -1), 96, { kind: "depot", yaw: Math.PI / 2 });
  b.location("marina-market", "Marina Market", 6, laneZ(1, 1), { kind: "market", yaw: Math.PI });
  b.location("coast-cafe", "Coast Cafe", -74, laneZ(3, -1), { kind: "cafe", yaw: 0 });
  b.location("dune-lofts", "Dune Lofts", laneX(3, -1), 40, { kind: "home", yaw: Math.PI / 2 });
  b.location("boardwalk-bar", "Boardwalk Bar", coastLane(108, 1), 118, { kind: "bar", yaw: Math.PI / 2 });
  b.location("hill-terrace", "Hill Terrace", 96, laneZ(4, -1), { kind: "home", yaw: 0 });
  b.location("south-market", "South Market", laneX(2, 1), -150, { kind: "market", yaw: -Math.PI / 2 });
  b.location("north-villas", "North Villas", laneX(1, 1), 150, { kind: "home", yaw: -Math.PI / 2 });

  b.setSpawn(coastLane(-36, 1), -36, 0);
  return b.finish();
}
