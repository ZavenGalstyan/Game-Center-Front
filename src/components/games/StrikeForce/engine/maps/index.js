/**
 * Strike Force — map catalogue. Builders are pure (no Three.js) and cached:
 * the same object feeds collision, navigation and the renderer.
 */
import { buildHarbor } from "./harbor.js";
import { buildDesert } from "./desert.js";
import { buildNeon } from "./neon.js";
import { buildForest } from "./forest.js";
import { buildSnow } from "./snow.js";

export const MAPS = [
  { id: "harbor", name: "Harbor Strike", blurb: "Industrial port at dusk — container lanes, gantry cranes and an open warehouse.", time: "Dusk", build: buildHarbor, accent: "#ff9a4a" },
  { id: "desert", name: "Desert Outpost", blurb: "Sun-baked forward base: HESCO walls, watchtowers, a village ruin and a motor pool.", time: "Midday", build: buildDesert, accent: "#e9c27a" },
  { id: "neon", name: "Neon District", blurb: "Rain-slick downtown at night — neon storefronts, a parking garage and a stalled bus.", time: "Night · Rain", build: buildNeon, accent: "#ff3fa8" },
  { id: "forest", name: "Forest Compound", blurb: "Woodland outpost: log cabins, a concrete bunker compound and a sawmill among the pines.", time: "Morning", build: buildForest, accent: "#7fcf6a" },
  { id: "snow", name: "Snowfall Station", blurb: "Arctic research station: indoor corridors, a radar dome and a vehicle bay under the peaks.", time: "Overcast · Snow", build: buildSnow, accent: "#8fd4ff" },
];

const cache = new Map();
export function getMap(id) {
  if (!cache.has(id)) {
    const def = MAPS.find((m) => m.id === id) || MAPS[0];
    cache.set(id, def.build());
  }
  return cache.get(id);
}
export const mapMeta = (id) => MAPS.find((m) => m.id === id) || MAPS[0];
