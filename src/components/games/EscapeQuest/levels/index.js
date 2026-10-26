/** Escape Quest — all 50 levels in order (5 chapters × 10 rooms). */
import { ITEMS } from "../items.js";
import ch1 from "./ch1.js";
import ch2 from "./ch2.js";
import ch3 from "./ch3.js";
import ch4 from "./ch4.js";
import ch5 from "./ch5.js";

export const CHAPTERS = [
  { name: "Cozy House", color: "#f59a3a", icon: "key" },
  { name: "Museum of Wonders", color: "#3f8ef0", icon: "gem" },
  { name: "Pirate Island", color: "#47c06a", icon: "map" },
  { name: "Science & Space", color: "#3fd0e0", icon: "chip" },
  { name: "Wizard Castle", color: "#a364e8", icon: "wand" },
];

function normalize(L, i, chapter) {
  const items = L.items || {};
  const hotspots = L.hotspots.map((h) => ({
    ...h,
    v: h.v || 0,
    label: h.label || (h.take ? (items[h.take] || ITEMS[h.take] || { name: h.take }).name : h.id),
  }));
  const views = 1 + Math.max(0, ...hotspots.map((h) => h.v), ...(L.decor || []).map((d) => d.v || 0));
  return { ...L, id: i + 1, chapter, views, hotspots, decor: L.decor || [], combos: L.combos || [], items };
}

export const LEVELS = [ch1, ch2, ch3, ch4, ch5].flatMap((ch, c) => ch.map((L) => ({ L, c }))).map(({ L, c }, i) => normalize(L, i, c));
