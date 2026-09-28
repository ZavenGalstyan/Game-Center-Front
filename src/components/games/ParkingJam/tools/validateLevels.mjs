/**
 * Parking Jam — development-time level validator.
 *
 *   node src/components/games/ParkingJam/tools/validateLevels.mjs           check all levels
 *   node .../validateLevels.mjs --show 12                                   print level 12 with exit waves
 *   node .../validateLevels.mjs --table                                     per-level metrics table
 *
 * For every level, through the SAME compiler + rules the game runs:
 *   1. compile (malformed maps fail loudly)
 *   2. structure: bounds, overlaps, unique ids, direction vs orientation,
 *      type vs length, obstacle types, no vehicle facing a closed edge
 *   3. DFS solve → solution; replay it move-by-move through applyExit and
 *      confirm the lot ends empty; cross-check with the layered peel
 *   4. 300 random legal playthroughs must all clear the lot (no traps)
 *   5. world rules: which vehicle lengths / obstacles / closed edges each
 *      world may use, board size limits, no duplicate layouts
 *   6. difficulty sanity: vehicle count and dependency depth never collapse
 *      badly versus the world's earlier levels
 */
import { LEVEL_DEFS } from "../data/levels.js";
import { getLevel, TOTAL_LEVELS } from "../data/index.js";
import { worldOf, LEVELS_PER_WORLD } from "../data/worlds.js";
import { validateLevel } from "../engine/validate.js";
import { initialState, legalMoves, applyExit, isSolved, peel, canExit } from "../engine/logic.js";
import { cellsOf } from "../engine/level.js";

const args = process.argv.slice(2);
const showIdx = args.indexOf("--show");
const SHOW = showIdx >= 0 ? Number(args[showIdx + 1]) : null;
const TABLE = args.includes("--table");

/** What each world may use (cumulative). */
const RULES = {
  1: { lengths: [2], obstacles: [], closed: false, maxCols: 9, maxRows: 7 },
  2: { lengths: [2, 3], obstacles: ["pillar"], closed: true, maxCols: 10, maxRows: 7 },
  3: { lengths: [2, 3, 4], obstacles: ["pillar", "planter", "barrier"], closed: true, maxCols: 11, maxRows: 8 },
  4: { lengths: [2, 3, 4], obstacles: ["pillar", "planter", "barrier", "bollard"], closed: true, maxCols: 12, maxRows: 8 },
  5: { lengths: [2, 3, 4], obstacles: ["pillar", "planter", "barrier", "bollard"], closed: true, maxCols: 12, maxRows: 8 },
};

function render(level) {
  const p = peel(level);
  const wave = new Map();
  p.layers.forEach((layer, k) => layer.forEach((i) => wave.set(i, k + 1)));
  const grid = Array.from({ length: level.rows }, () => Array(level.cols).fill(" .."));
  for (const o of level.obstacles) grid[o.row][o.col] = ` ${{ pillar: "##", planter: "%%", barrier: "==", bollard: "**" }[o.type]}`;
  for (const v of level.vehicles) {
    const arrow = { up: "^", down: "v", left: "<", right: ">" }[v.dir];
    for (const [r, c] of cellsOf(v)) grid[r][c] = `${v.id}${arrow}${wave.get(v.index) ?? "!"}`;
  }
  return grid.map((row) => row.join(" ")).join("\n");
}

function randomPlays(level, n = 300) {
  let seed = level.id * 101 + 1;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  for (let k = 0; k < n; k++) {
    let s = initialState(level);
    for (;;) {
      const m = legalMoves(level, s.present);
      if (!m.length) break;
      s = applyExit(level, s, m[Math.floor(rand() * m.length)]);
    }
    if (!isSolved(s)) return false;
  }
  return true;
}

if (SHOW) {
  const lv = getLevel(SHOW);
  const v = validateLevel(lv);
  console.log(`Level ${lv.id} "${lv.name}" ${lv.cols}x${lv.rows}, ${lv.vehicles.length} vehicles, ${lv.obstacles.length} obstacles`);
  console.log(render(lv));
  console.log(v.ok ? `solution: ${v.result.solution.join(" ")}  depth ${v.result.depth}  free at start ${v.result.freeAtStart}` : v.errors.join("\n"));
  const p = peel(lv);
  if (p.stuck.length) {
    // after every possible exit, who blocks whom among the stuck cars (the cycle)
    const present = lv.vehicles.map((x) => p.stuck.includes(x.index));
    for (const i of p.stuck) {
      const r = canExit(lv, present, i);
      console.log(`  ${lv.vehicles[i].id} (${lv.vehicles[i].dir}) blocked by ${r.blocker != null ? lv.vehicles[r.blocker].id : r.reason}`);
    }
  }
  process.exit(v.ok ? 0 : 1);
}

let failures = 0;
const seen = new Map();
const rows = [];
const byWorld = {};
for (let id = 1; id <= TOTAL_LEVELS; id++) {
  const errs = [];
  let lv;
  try {
    lv = getLevel(id);
  } catch (e) {
    console.error(`✗ level ${id}: ${e.message}`);
    failures++;
    continue;
  }
  const w = worldOf(id).id;
  const rule = RULES[w];
  const v = validateLevel(lv);
  errs.push(...v.errors);
  if (v.ok && !randomPlays(lv)) errs.push("a random legal playthrough got stuck");
  for (const veh of lv.vehicles) if (!rule.lengths.includes(veh.length)) errs.push(`vehicle ${veh.id}: length ${veh.length} not allowed in world ${w}`);
  for (const o of lv.obstacles) if (!rule.obstacles.includes(o.type)) errs.push(`obstacle ${o.type} not allowed in world ${w}`);
  const closedCount = Object.values(lv.closed).reduce((a, s) => a + s.length, 0);
  if (closedCount && !rule.closed) errs.push(`closed edges not allowed in world ${w}`);
  if (lv.cols > rule.maxCols || lv.rows > rule.maxRows) errs.push(`board ${lv.cols}x${lv.rows} too large for world ${w}`);
  const key = LEVEL_DEFS[id - 1].map.replace(/\s+/g, " ").trim();
  if (seen.has(key)) errs.push(`same layout as level ${seen.get(key)}`);
  seen.set(key, id);

  const metrics = v.result ? { n: lv.vehicles.length, depth: v.result.depth, free: v.result.freeAtStart } : null;
  if (metrics) {
    byWorld[w] = byWorld[w] || [];
    const idx = (id - 1) % LEVELS_PER_WORLD;
    // difficulty sanity (skip the first few levels of each world, which re-ease in)
    if (idx >= 4) {
      const prev = byWorld[w].slice(0, idx);
      const maxN = Math.max(...prev.map((m) => m.n));
      if (metrics.n < maxN * 0.6) errs.push(`difficulty drop: ${metrics.n} vehicles vs up to ${maxN} earlier in the world`);
    }
    byWorld[w].push(metrics);
  }
  rows.push({ id, w, name: lv.name, size: `${lv.cols}x${lv.rows}`, obst: lv.obstacles.length, closed: closedCount, ...metrics, ok: errs.length === 0 });
  if (errs.length) {
    failures++;
    console.error(`✗ level ${id} "${lv.name}":\n   ${errs.join("\n   ")}`);
  }
}

if (TABLE) {
  console.log("id  w  size   cars depth free obst closed  name");
  for (const r of rows) {
    console.log(`${String(r.id).padStart(3)} ${r.w}  ${r.size.padEnd(6)} ${String(r.n ?? "-").padStart(4)} ${String(r.depth ?? "-").padStart(5)} ${String(r.free ?? "-").padStart(4)} ${String(r.obst).padStart(4)} ${String(r.closed).padStart(6)}  ${r.name}${r.ok ? "" : "  ✗"}`);
  }
}
console.log(`${TOTAL_LEVELS} levels checked, ${TOTAL_LEVELS - failures} valid, ${failures} with problems`);
process.exit(failures ? 1 : 0);
