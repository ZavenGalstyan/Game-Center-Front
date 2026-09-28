/**
 * Parking Jam — level compiler. Pure data, no React, runs in Node too.
 *
 * Levels are authored as small text maps, one 2-character token per cell:
 *
 *   ..            empty parking space
 *   a^ av a< a>   FRONT cell of vehicle `a`, facing up / down / left / right
 *   a-            any other cell of vehicle `a`
 *   ##            concrete pillar            %%  planter
 *   ==            safety barrier             **  bollards
 *
 * A vehicle is every cell carrying its letter (a–z, A–Z). It must be one
 * straight contiguous line with exactly one arrow, on an end cell, pointing
 * outward along the line. The compiled level is the single source of truth
 * for both the logic and the renderer.
 *
 * Optional per-level fields:
 *   types:  "a:taxi c:bus"          vehicle type overrides (else picked by length)
 *   closed: "top:0-2 left:*"        edge spans with no road access (fence/wall)
 *   tip:    short contextual hint shown in the HUD
 */

export const DIRS = {
  up: { dr: -1, dc: 0, edge: "top", angle: 0 },
  right: { dr: 0, dc: 1, edge: "right", angle: 90 },
  down: { dr: 1, dc: 0, edge: "bottom", angle: 180 },
  left: { dr: 0, dc: -1, edge: "left", angle: 270 },
};
const ARROWS = { "^": "up", v: "down", "<": "left", ">": "right" };
export const OBSTACLE_TOKENS = { "##": "pillar", "%%": "planter", "==": "barrier", "**": "bollard" };
export const EDGES = ["top", "right", "bottom", "left"];

/** Vehicle classes. `length` is in grid cells — visuals never change it. */
export const VEHICLE_TYPES = {
  compact: { length: 2, label: "Compact" },
  sedan: { length: 2, label: "Sedan" },
  hatch: { length: 2, label: "Hatchback" },
  coupe: { length: 2, label: "Sports Coupe" },
  suv: { length: 2, label: "SUV" },
  pickup: { length: 2, label: "Pickup" },
  taxi: { length: 2, label: "Taxi" },
  van: { length: 3, label: "Van" },
  minibus: { length: 3, label: "Mini Bus" },
  limo: { length: 3, label: "Limousine" },
  bus: { length: 4, label: "Bus" },
  shuttle: { length: 4, label: "Shuttle Bus" },
};

export const COLORS = ["blue", "red", "green", "yellow", "orange", "white", "black", "purple", "teal", "silver"];

/** Small deterministic PRNG so a level always compiles identically. */
export function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

function parseSpans(str, rows, cols) {
  const closed = { top: [], right: [], bottom: [], left: [] };
  if (!str) return closed;
  for (const part of str.trim().split(/\s+/)) {
    const [edge, span] = part.split(":");
    if (!closed[edge]) throw new Error(`bad closed edge "${part}"`);
    const len = edge === "top" || edge === "bottom" ? cols : rows;
    if (span === "*") closed[edge].push([0, len - 1]);
    else {
      const [a, b = a] = span.split("-").map(Number);
      if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b >= len || a > b) {
        throw new Error(`bad closed span "${part}"`);
      }
      closed[edge].push([a, b]);
    }
  }
  return closed;
}

/**
 * Compile an authored level definition. Throws on malformed maps; semantic
 * problems (overlaps can't happen here, but closed exits, cycles...) are left
 * to validate.js so the validator can report them all at once.
 */
export function compileLevel(def, { id = def.id ?? 0, world = def.world ?? 1, typePool = null } = {}) {
  const lines = def.map
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const grid = lines.map((l) => l.split(/\s+/));
  const rows = grid.length;
  const cols = grid[0].length;
  const byLetter = new Map();
  const obstacles = [];

  grid.forEach((row, r) => {
    if (row.length !== cols) throw new Error(`level ${id}: row ${r} has ${row.length} cells, expected ${cols}`);
    row.forEach((tok, c) => {
      if (tok.length !== 2) throw new Error(`level ${id}: bad token "${tok}" at ${r},${c}`);
      if (tok === "..") return;
      if (OBSTACLE_TOKENS[tok]) {
        obstacles.push({ id: `o${obstacles.length}`, type: OBSTACLE_TOKENS[tok], row: r, col: c, w: 1, h: 1 });
        return;
      }
      const letter = tok[0];
      const mark = tok[1];
      if (!/[a-zA-Z]/.test(letter) || !(mark === "-" || ARROWS[mark])) {
        throw new Error(`level ${id}: bad token "${tok}" at ${r},${c}`);
      }
      if (!byLetter.has(letter)) byLetter.set(letter, { cells: [], fronts: [] });
      const entry = byLetter.get(letter);
      entry.cells.push([r, c]);
      if (ARROWS[mark]) entry.fronts.push({ r, c, dir: ARROWS[mark] });
    });
  });

  const typeOverrides = {};
  if (def.types) {
    for (const part of def.types.trim().split(/\s+/)) {
      const [k, t] = part.split(":");
      if (!VEHICLE_TYPES[t]) throw new Error(`level ${id}: unknown vehicle type "${t}"`);
      typeOverrides[k] = t;
    }
  }

  const rand = rng(id * 7919 + 17);
  const vehicles = [];
  let taxis = 0;
  // Letters in first-seen order (row-major) — deterministic ids and colors.
  for (const [letter, { cells, fronts }] of byLetter) {
    if (fronts.length !== 1) throw new Error(`level ${id}: vehicle "${letter}" needs exactly one arrow (has ${fronts.length})`);
    const rowsSet = new Set(cells.map(([r]) => r));
    const colsSet = new Set(cells.map(([, c]) => c));
    const orientation = rowsSet.size === 1 ? "horizontal" : colsSet.size === 1 ? "vertical" : null;
    if (!orientation || cells.length < 2) throw new Error(`level ${id}: vehicle "${letter}" is not a straight line of 2+ cells`);
    const minR = Math.min(...rowsSet);
    const minC = Math.min(...colsSet);
    const length = cells.length;
    // contiguity
    const span = orientation === "horizontal" ? Math.max(...colsSet) - minC + 1 : Math.max(...rowsSet) - minR + 1;
    if (span !== length) throw new Error(`level ${id}: vehicle "${letter}" has a gap`);
    const f = fronts[0];
    const dir = f.dir;
    const okDir = orientation === "horizontal" ? dir === "left" || dir === "right" : dir === "up" || dir === "down";
    if (!okDir) throw new Error(`level ${id}: vehicle "${letter}" faces ${dir} but is ${orientation}`);
    const frontExpected =
      dir === "up" ? [minR, minC] :
      dir === "down" ? [minR + length - 1, minC] :
      dir === "left" ? [minR, minC] : [minR, minC + length - 1];
    if (frontExpected[0] !== f.r || frontExpected[1] !== f.c) {
      throw new Error(`level ${id}: vehicle "${letter}" arrow must sit on its front end cell`);
    }
    let type = typeOverrides[letter];
    if (!type) {
      const pool = (typePool && typePool[length]) || Object.keys(VEHICLE_TYPES).filter((t) => VEHICLE_TYPES[t].length === length);
      type = pool[Math.floor(rand() * pool.length)];
      // taxis are always yellow — keep them a rare accent so lots stay colourful
      if (type === "taxi" && taxis >= 1 + Math.floor(byLetter.size / 12)) type = pool.find((t) => t !== "taxi") || "sedan";
    }
    if (type === "taxi") taxis++;
    vehicles.push({ id: letter, index: vehicles.length, type, row: minR, col: minC, length, orientation, dir, color: null });
  }

  assignColors(vehicles, rows, cols, rand);

  return {
    id,
    world,
    name: def.name || `Level ${id}`,
    rows,
    cols,
    vehicles,
    obstacles,
    closed: parseSpans(def.closed, rows, cols),
    tip: def.tip || null,
    stars: def.stars || null,
  };
}

/** Distinct neighbours: greedy colouring over vehicles that touch. */
function assignColors(vehicles, rows, cols, rand) {
  const owner = new Array(rows * cols).fill(-1);
  for (const v of vehicles) for (const [r, c] of cellsOf(v)) owner[r * cols + c] = v.index;
  const offset = Math.floor(rand() * COLORS.length);
  for (const v of vehicles) {
    if (v.type === "taxi") {
      v.color = "yellow";
      continue;
    }
    const near = new Set();
    for (const [r, c] of cellsOf(v)) {
      for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
        const rr = r + dr;
        const cc = c + dc;
        if (rr < 0 || cc < 0 || rr >= rows || cc >= cols) continue;
        const o = owner[rr * cols + cc];
        if (o >= 0 && o !== v.index && vehicles[o].color) near.add(vehicles[o].color);
      }
    }
    let pick = null;
    for (let k = 0; k < COLORS.length; k++) {
      const col = COLORS[(offset + v.index * 3 + k) % COLORS.length];
      if (!near.has(col)) {
        pick = col;
        break;
      }
    }
    v.color = pick || COLORS[(offset + v.index) % COLORS.length];
  }
}

/** Every grid cell a vehicle covers, as [row, col]. */
export function cellsOf(v) {
  const out = [];
  for (let i = 0; i < v.length; i++) {
    out.push(v.orientation === "horizontal" ? [v.row, v.col + i] : [v.row + i, v.col]);
  }
  return out;
}

/** The cell the vehicle's nose is on. */
export function frontOf(v) {
  if (v.dir === "up" || v.dir === "left") return [v.row, v.col];
  if (v.dir === "down") return [v.row + v.length - 1, v.col];
  return [v.row, v.col + v.length - 1];
}
