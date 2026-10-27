/**
 * Iron Arena — map registry. Maps are built lazily (once) because building
 * samples the height functions and scatters props.
 */
import desert from "./desert.js";
import neon from "./neon.js";
import forest from "./forest.js";
import snow from "./snow.js";
import harbor from "./harbor.js";

export const MAP_LIST = [
  { id: "desert", name: "Desert Fortress", theme: "desert", make: desert, tag: "Open dunes · hilltop fortress" },
  { id: "neon", name: "Neon City", theme: "neon", make: neon, tag: "Night city · elevated highway" },
  { id: "forest", name: "Forest Battlefield", theme: "forest", make: forest, tag: "River crossings · tree cover" },
  { id: "snow", name: "Snow Base", theme: "snow", make: snow, tag: "Ice · hangar · ridge tunnels" },
  { id: "harbor", name: "Industrial Harbor", theme: "harbor", make: harbor, tag: "Container maze · cranes" },
];
export const MAP_IDS = MAP_LIST.map((m) => m.id);
const cache = new Map();
export function getMap(id) {
  const meta = MAP_LIST.find((m) => m.id === id) || MAP_LIST[0];
  if (!cache.has(meta.id)) cache.set(meta.id, meta.make());
  return cache.get(meta.id);
}
