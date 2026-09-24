/**
 * Laser Maze — development-time level validator.
 *
 *   node src/components/games/LaserMaze/tools/validateLevels.mjs          check
 *   node src/components/games/LaserMaze/tools/validateLevels.mjs --write  check + regenerate data/solutions.js
 *   node .../validateLevels.mjs --show 12                                 print level 12 solved
 *
 * For every level, using the SAME engine the game runs:
 *   1. compile the map (parser errors fail loudly)
 *   2. confirm the starting board is NOT already solved
 *   3. exhaustive BFS over every reachable puzzle state → proven shortest
 *      solution (par) — the search space of every level is small enough to
 *      finish, so no par is ever guessed
 *   4. replay that solution move-by-move through applyMove + traceBeams and
 *      confirm it ends solved
 *   5. census: how many reachable states solve the level (tightness)
 *   6. per-world mechanic rules (e.g. no splitters or portals in World 1)
 *   7. no two levels share a layout
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { LEVEL_DEFS } from "../data/levels.js";
import { compileLevel, initialState } from "../engine/level.js";
import { traceBeams } from "../engine/trace.js";
import { solve, applyMove, census } from "../engine/moves.js";

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const WRITE = args.includes("--write");
const showIdx = args.indexOf("--show");
const SHOW = showIdx >= 0 ? Number(args[showIdx + 1]) : null;

/** Mechanics each world may use (cumulative, World 10 may use all). */
const ALLOWED = {
  1: ["mirror"],
  2: ["mirror", "splitter"],
  3: ["mirror", "splitter"],
  4: ["mirror", "splitter", "switch"],
  5: ["mirror", "splitter", "switch", "prism"],
  6: ["mirror", "splitter", "switch", "prism", "movable"],
  7: ["mirror", "splitter", "switch", "prism", "movable", "filter"],
  8: ["mirror", "splitter", "switch", "prism", "movable", "filter", "portal"],
  9: ["mirror", "splitter", "switch", "prism", "movable", "filter", "portal", "gears"],
  10: ["mirror", "splitter", "switch", "prism", "movable", "filter", "portal", "gears"],
};
/** Mechanic each world is about — must appear in most of its levels. */
const FEATURED = { 4: "switch", 5: "prism", 6: "movable", 7: "filter", 8: "portal", 9: "gears" };

function render(level, state) {
  const tr = traceBeams(level, state);
  const lit = new Set();
  for (const s of tr.segments) {
    // mark cells a beam passes through
    const x = Math.floor((s.x1 + s.x2) / 2);
    const y = Math.floor((s.y1 + s.y2) / 2);
    lit.add(`${Math.floor(s.x2 - 0.01 * Math.sign(s.x2 - s.x1))},${Math.floor(s.y2 - 0.01 * Math.sign(s.y2 - s.y1))}`);
    lit.add(`${x},${y}`);
  }
  const lines = [];
  for (let y = 0; y < level.h; y++) {
    let line = "";
    for (let x = 0; x < level.w; x++) {
      const c = tr.cells[y * level.w + x];
      let ch = lit.has(`${x},${y}`) ? " * " : " . ";
      if (c) {
        const t = c.type;
        const map = {
          wall: "###", source: " S ", target: " T ", mirror: ` ${c.o} `, splitter: `s${c.o} `,
          prism: " P ", filter: " F ", portal: " @ ", switch: " * ", gate: tr.gatesOpen.has(c.id) ? " _ " : " G ",
          slot: " o ", crank: " C ", shutter: c.open ? " - " : " H ",
        };
        ch = map[t] || " ? ";
        if (t === "target") ch = tr.targetLit[c.idx] ? "[T]" : " T ";
      }
      line += ch;
    }
    lines.push(line);
  }
  return lines.join("\n");
}

const seenLayouts = new Map();
const solutions = {};
let failures = 0;
const rows = [];

for (const def of LEVEL_DEFS) {
  const problems = [];
  let level;
  try {
    level = compileLevel(def);
  } catch (e) {
    console.error(`✗ ${def.id}: ${e.message}`);
    failures++;
    continue;
  }
  const world = Math.ceil(def.id / 10);
  const start = initialState(level);

  if (traceBeams(level, start).solved) problems.push("starts already solved");

  const res = solve(level, start, { maxStates: 400000 });
  if (!res) problems.push("NO SOLUTION found (exhaustive)");

  let par = null;
  if (res) {
    par = res.solution.length;
    // replay through the real engine
    let s = start;
    for (const mv of res.solution) s = applyMove(level, s, mv);
    if (!traceBeams(level, s).solved) problems.push("replayed solution does not solve");
    solutions[def.id] = { par, solution: res.solution };
  }

  const cen = census(level, start);
  for (const m of level.mechanics) {
    if (!ALLOWED[world].includes(m)) problems.push(`mechanic "${m}" not allowed in world ${world}`);
  }
  if (FEATURED[world] && !level.mechanics.has(FEATURED[world]) && def.id % 10 !== 0 && def.id % 10 > 1) {
    // soft rule, reported but not fatal
    console.warn(`  note ${def.id}: does not use featured mechanic "${FEATURED[world]}"`);
  }

  const layout = def.map.replace(/\s+/g, " ").trim();
  if (seenLayouts.has(layout)) problems.push(`same layout as level ${seenLayouts.get(layout)}`);
  seenLayouts.set(layout, def.id);

  if (def.id !== LEVEL_DEFS.indexOf(def) + 1) problems.push("ids must be 1..N in order");

  rows.push({
    id: def.id,
    name: def.name,
    size: `${level.w}x${level.h}`,
    par,
    states: cen.total + (cen.complete ? "" : "+"),
    goals: cen.goals,
    mech: [...level.mechanics].join(","),
    ok: problems.length ? "✗ " + problems.join("; ") : "✓",
  });
  if (problems.length) failures++;

  if (SHOW === def.id) {
    console.log(`\nLevel ${def.id} "${def.name}" — start:\n${render(level, start)}`);
    if (res) {
      let s = start;
      for (const mv of res.solution) s = applyMove(level, s, mv);
      console.log(`solution (${par}): ${JSON.stringify(res.solution)}\n${render(level, s)}\n`);
    }
  }
}

console.table(rows);
console.log(`${LEVEL_DEFS.length} levels, ${failures} with problems`);

if (WRITE && failures === 0) {
  const out =
    "/**\n * Laser Maze — GENERATED by tools/validateLevels.mjs --write. Do not edit.\n" +
    " * par = proven shortest move count (exhaustive BFS through the real engine);\n" +
    " * solution = one shortest move sequence from the starting board.\n */\n" +
    `export const SOLUTIONS = ${JSON.stringify(solutions)};\n`;
  writeFileSync(join(here, "../data/solutions.js"), out);
  console.log("wrote data/solutions.js");
} else if (WRITE) {
  console.log("NOT writing solutions — fix problems first");
}
process.exit(failures ? 1 : 0);
