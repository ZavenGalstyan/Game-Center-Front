/**
 * Shadow Runner — all 40 levels, 10 per district. Par times come from the
 * validator (tools/validateLevels.mjs --write).
 */
import d1 from "./d1.js";
import d2 from "./d2.js";
import d3 from "./d3.js";
import d4 from "./d4.js";
import PAR from "./par.js";

export const DISTRICTS = [
  { id: 0, name: "Harbor Rooftops", short: "Harbor", blurb: "Warehouse roofs at dusk. Learn to run.", accent: "#ff9a4d" },
  { id: 1, name: "Neon Market", short: "Neon", blurb: "Lasers, springs and the double jump.", accent: "#ff3ea5" },
  { id: 2, name: "Ironworks", short: "Ironworks", blurb: "Moving gantries and roofs that give way.", accent: "#ffb547" },
  { id: 3, name: "Skyline Spire", short: "Skyline", blurb: "A storm over the towers. The final escape.", accent: "#6fd3ff" },
];

export const LEVELS = [...d1, ...d2, ...d3, ...d4];
for (const L of LEVELS) if (PAR[L.id]) L.par = PAR[L.id];

export const levelById = (id) => LEVELS.find((L) => L.id === id) || null;
