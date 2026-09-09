/**
 * Delivery Rush — the 50-mission career.
 *
 * Ten runs per district, authored as a compact table: type, which landmark to
 * collect from, where it goes, and how busy the streets should be. No mission
 * is a React component and none of them script the route — pickup and drop-off
 * are fixed, everything between them is the player's problem.
 *
 * Time limits are *derived*, not hand-typed. Each one comes from the real
 * street distance of the run (measured on the district's own road grid) scaled
 * by the mission type and how far into the career it is. That keeps mission 3
 * of Central City generous and mission 50 of Midnight Metro brutal without
 * anyone having to re-tune 50 magic numbers when a landmark moves.
 */

import { ZONES } from "./zones.js";
import { getLayout } from "../world/districts.js";

export const MISSION_TYPES = {
  standard: {
    id: "standard",
    label: "Standard Delivery",
    short: "Standard",
    req: 1.0,
    payMul: 1.0,
    blurb: "Get it there in one piece.",
  },
  express: {
    id: "express",
    label: "Express Delivery",
    short: "Express",
    req: 1.36,
    payMul: 1.5,
    blurb: "Tight clock, better money.",
  },
  fragile: {
    id: "fragile",
    label: "Fragile Delivery",
    short: "Fragile",
    req: 0.92,
    payMul: 1.35,
    fragile: true,
    blurb: "Every impact damages the package.",
  },
  multi: {
    id: "multi",
    label: "Multi-Stop Delivery",
    short: "Multi-stop",
    req: 1.05,
    payMul: 1.7,
    blurb: "Several drops, one clock.",
  },
  long: {
    id: "long",
    label: "Long Distance",
    short: "Long haul",
    req: 1.06,
    payMul: 1.4,
    blurb: "Right across the district.",
  },
};

/** [type, pickup, dropoff, traffic, ...intermediate stops] */
const TABLE = {
  "central-city": [
    ["standard", "park-kiosk", "city-cafe", "low"],
    ["standard", "city-cafe", "fresh-mart", "medium"],
    ["standard", "fresh-mart", "corner-bar", "low"],
    ["standard", "urban-shop", "civic-plaza", "medium"],
    ["express", "quick-bites", "north-court", "medium"],
    ["standard", "civic-plaza", "central-tower", "high"],
    ["fragile", "daily-bread", "metro-apartments", "medium"],
    ["long", "west-depot", "corner-bar", "medium"],
    ["express", "central-tower", "west-depot", "high"],
    ["multi", "fresh-mart", "metro-apartments", "high", "civic-plaza", "quick-bites"],
  ],
  "sunset-coast": [
    ["standard", "bay-hotel", "coast-cafe", "low"],
    ["standard", "marina-market", "palm-court", "medium"],
    ["express", "sunset-diner", "pier-kiosk", "medium"],
    ["standard", "south-market", "north-villas", "low"],
    ["fragile", "coast-cafe", "hill-terrace", "medium"],
    ["standard", "harbor-supply", "boardwalk-bar", "high"],
    ["express", "dune-lofts", "sunset-diner", "high"],
    ["long", "north-villas", "south-market", "medium"],
    ["multi", "pier-kiosk", "dune-lofts", "medium", "bay-hotel", "marina-market"],
    ["express", "boardwalk-bar", "palm-court", "high"],
  ],
  "industrial-run": [
    ["standard", "fuel-point", "canteen", "medium"],
    ["standard", "rapid-parts", "works-office", "medium"],
    ["long", "dock-gate", "far-dock", "high"],
    ["express", "cold-store", "foundry", "medium"],
    ["fragile", "north-yard", "east-depot", "high"],
    ["standard", "west-works", "south-gate", "medium"],
    ["express", "foundry", "north-yard", "high"],
    ["multi", "dock-gate", "cold-store", "medium", "fuel-point", "works-office"],
    ["fragile", "canteen", "far-dock", "high"],
    ["express", "south-gate", "dock-gate", "high"],
  ],
  "frost-city": [
    ["standard", "frost-bakery", "old-square", "low"],
    ["standard", "winter-market", "pine-lodge", "medium"],
    ["fragile", "station-cafe", "north-chapel", "medium"],
    ["express", "old-square", "east-terrace", "medium"],
    ["standard", "ice-house", "west-yard", "medium"],
    ["long", "south-store", "clock-tower", "high"],
    ["fragile", "hill-cottages", "frost-bakery", "medium"],
    ["express", "north-chapel", "south-store", "high"],
    ["multi", "pine-lodge", "ice-house", "high", "winter-market", "old-square"],
    ["express", "clock-tower", "hill-cottages", "high"],
  ],
  "midnight-metro": [
    ["standard", "night-owl", "neon-arcade", "medium"],
    ["express", "metro-tower", "east-lofts", "high"],
    ["fragile", "west-noodle", "river-hotel", "high"],
    ["standard", "south-station", "north-lofts", "high"],
    ["long", "dock-street", "high-court", "high"],
    ["express", "central-garage", "late-market", "high"],
    ["multi", "neon-arcade", "central-garage", "high", "night-owl", "metro-tower"],
    ["fragile", "late-market", "dock-street", "high"],
    ["express", "river-hotel", "south-station", "high"],
    ["multi", "south-station", "night-owl", "high", "west-noodle", "high-court", "east-lofts"],
  ],
};

/**
 * How hard the district pushes. These scale the *average speed the run
 * demands*, so a bigger number means a tighter clock: Central City asks for
 * well under the City Runner's cruising pace, Midnight Metro asks for a line
 * you have to have practised.
 */
const ZONE_REQ = {
  "central-city": 0.92,
  "sunset-coast": 1.0,
  "industrial-run": 1.05,
  "frost-city": 1.05,
  "midnight-metro": 1.18,
};

/** Comfortable average street speed, m/s, for a mid-tier vehicle. */
const BASE_REQ = 7.5;
/** Getting rolling, then slowing into the pickup zone. */
const OVERHEAD = 10;
const PER_STOP = 6;

/** Streets are not straight lines, so distance is measured L-shaped. */
function streetDistance(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.z - b.z);
}

function buildMissions() {
  const out = [];
  let id = 0;
  for (const zone of ZONES) {
    const rows = TABLE[zone.id] || [];
    const layout = getLayout(zone.id);
    const at = (locId) => layout.locationMap[locId];

    rows.forEach((row, i) => {
      id += 1;
      const [type, pickupId, dropoffId, traffic, ...stops] = row;
      const t = MISSION_TYPES[type];
      const pickup = at(pickupId);
      const dropoff = at(dropoffId);
      if (!pickup || !dropoff) {
        throw new Error(`Delivery Rush: mission ${id} references a missing location in ${zone.id}`);
      }

      // spawn -> pickup -> every stop -> drop-off, on the street grid
      const chain = [layout.spawn, pickup, ...stops.map(at), dropoff];
      let distance = 0;
      for (let k = 0; k < chain.length - 1; k++) distance += streetDistance(chain[k], chain[k + 1]);

      // the average speed this run demands, tightening across the district
      const req = BASE_REQ * t.req * ZONE_REQ[zone.id] * (1 + i * 0.015);
      const seconds = distance / req + OVERHEAD + stops.length * PER_STOP;
      const timeLimit = Math.max(30, Math.round(seconds / 5) * 5);

      const reward = Math.round(
        (70 + distance * 0.16 + zone.order * 22 + i * 6) * t.payMul,
      );

      out.push({
        id,
        zone: zone.id,
        zoneName: zone.name,
        index: i + 1,
        type,
        typeLabel: t.label,
        typeShort: t.short,
        blurb: t.blurb,
        fragile: Boolean(t.fragile),
        pickupId,
        dropoffId,
        stopIds: stops,
        pickupName: pickup.name,
        dropoffName: dropoff.name,
        stopNames: stops.map((s) => at(s).name),
        timeLimit,
        reward: Math.round(reward / 5) * 5,
        trafficLevel: traffic,
        distance: Math.round(distance),
      });
    });
  }
  return out;
}

let _missions = null;

export function getMissions() {
  if (!_missions) _missions = buildMissions();
  return _missions;
}

export function getMission(id) {
  return getMissions().find((m) => m.id === Number(id)) || null;
}

export function missionsForZone(zoneId) {
  return getMissions().filter((m) => m.zone === zoneId);
}

export const TOTAL_MISSIONS = 50;
