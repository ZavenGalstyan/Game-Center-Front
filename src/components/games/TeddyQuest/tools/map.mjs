/**
 * ASCII top-down map of a level (1 char = 0.5 m) for layout debugging.
 *   node src/components/games/TeddyQuest/tools/map.mjs <id> [x0 x1 z0 z1]
 * Platforms show their height digit (floor(y1)), # walls, ~ movers (start),
 * c coins, $ chest, E enemy, P portal, F friend, ^ spring, ! hazard, S start.
 */
import { getLevel } from "../data/levels.js";

const id = Number(process.argv[2] || 1);
const L = getLevel(id);
const R = 0.5;
let [x0, x1, z0, z1] = process.argv.slice(3).map(Number);
if (x0 === undefined || Number.isNaN(x0)) {
  x0 = Math.min(...L.boxes.map((b) => b.x0)) - 1;
  x1 = Math.max(...L.boxes.map((b) => b.x1)) + 1;
  z0 = Math.min(...L.boxes.map((b) => b.z0)) - 1;
  z1 = Math.max(...L.boxes.map((b) => b.z1)) + 1;
}
const W = Math.ceil((x1 - x0) / R), H = Math.ceil((z1 - z0) / R);
const grid = Array.from({ length: H }, () => Array(W).fill(" "));
const put = (x, z, ch) => {
  const i = Math.floor((x - x0) / R), j = Math.floor((z - z0) / R);
  if (i >= 0 && i < W && j >= 0 && j < H) grid[j][i] = ch;
};
for (const b of L.boxes) {
  const ch = b.look === "wall" ? "#" : b.kind === "gate" ? "=" : b.m ? "~" : b.look === "secret" ? "s" : b.kind === "crumble" ? "x" : b.surface === "ice" ? "i" : b.surface === "sand" ? ":" : String(Math.max(0, Math.floor(b.y1)) % 10);
  for (let x = b.x0 + R / 2; x < b.x1; x += R) for (let z = b.z0 + R / 2; z < b.z1; z += R) put(x, z, ch);
}
for (const c of L.coins) put(c.x, c.z, "c");
for (const c of L.chests) put(c.x, c.z, "$");
for (const e of L.enemies) put(e.x, e.z, "E");
for (const s of L.springs) put(s.x, s.z, "^");
for (const h of L.hazards) put(h.x ?? (h.x0 + h.x1) / 2 ?? h.ax, h.z ?? (h.z0 + h.z1) / 2, "!");
for (const c of L.checkpoints) put(c.x, c.z, "K");
if (L.friend) put(L.friend.x, L.friend.z, "F");
put(L.portal.x, L.portal.z, "P");
put(L.start.x, L.start.z, "S");
console.log(`L${id} ${L.name}  x ${x0.toFixed(1)}..${x1.toFixed(1)}  z ${z0.toFixed(1)}..${z1.toFixed(1)} (z grows downward)`);
for (let j = 0; j < H; j++) console.log(`${(z0 + j * R).toFixed(1).padStart(6)} ${grid[j].join("")}`);
