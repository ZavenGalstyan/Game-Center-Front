/**
 * Delivery Rush — district registry + layout cache.
 *
 * Layouts are deterministic and fairly expensive to generate (a few thousand
 * placement decisions), so each one is built at most once per page load and
 * kept here. Mission data, the mini-map, the traffic system and the baker all
 * read the same cached object.
 */

import { buildCentralCity } from "./layouts/centralCity.js";
import { buildSunsetCoast } from "./layouts/sunsetCoast.js";
import { buildIndustrialRun } from "./layouts/industrialRun.js";
import { buildFrostCity } from "./layouts/frostCity.js";
import { buildMidnightMetro } from "./layouts/midnightMetro.js";
import { getZone } from "../data/zones.js";

const BUILDERS = {
  "central-city": buildCentralCity,
  "sunset-coast": buildSunsetCoast,
  "industrial-run": buildIndustrialRun,
  "frost-city": buildFrostCity,
  "midnight-metro": buildMidnightMetro,
};

const cache = new Map();

export function getLayout(zoneId) {
  let l = cache.get(zoneId);
  if (l) return l;
  const zone = getZone(zoneId);
  const build = BUILDERS[zone.id] || buildCentralCity;
  l = build(zone);
  l.locationMap = Object.fromEntries(l.locations.map((p) => [p.id, p]));
  cache.set(zone.id, l);
  return l;
}

export function getLocation(zoneId, id) {
  return getLayout(zoneId).locationMap[id] || null;
}

export function zoneLocations(zoneId) {
  return getLayout(zoneId).locations;
}
