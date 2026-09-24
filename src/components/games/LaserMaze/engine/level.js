/**
 * Laser Maze — level compiler.
 *
 * Levels are authored as small text maps (data/levels.js), one whitespace-
 * separated token per cell, so a layout is readable at a glance and every
 * level goes through exactly the same parser, tracer and solver.
 *
 *   .        empty floor
 *   #        wall
 *   / \      rotatable mirror (click to toggle)
 *   /! \!    fixed mirror
 *   >r ^b    laser source: direction (^ > v <) + color (r g b y p c w)
 *   Tr       target that needs exactly that color
 *   S/ S\    rotatable beam splitter (half passes, half reflects)
 *   S/! S\!  fixed splitter
 *   P        prism (red bends left, green straight, blue bends right)
 *   Fy       color filter (passes beam & filter, blocks if nothing is left)
 *   @1       portal; the two cells sharing a digit are linked
 *   *1       light switch (beam passes through and powers every gate 1)
 *   G1       gate 1 — solid until a beam crosses a switch 1
 *   o        empty rail slot for movable mirrors
 *   M/ M\    movable mirror (fixed angle) resting on a slot
 *   C1       crank for gear train 1 (click to advance one phase)
 *   g1:/\/   geared mirror: orientation per phase of gear train 1
 *   h1:10    shutter: per phase of gear train 1, 1 = open, 0 = closed
 *
 * The compiled level separates the static board from the mutable puzzle
 * state ({ rot, mov, crank }) so the tracer, solver, undo history and save
 * file all speak the same tiny state object.
 */
import { COLOR_FROM_CHAR, DIR_FROM_CHAR, ORIENTS } from "./constants.js";

function fail(id, msg) {
  throw new Error(`Laser Maze level ${id}: ${msg}`);
}

function parseColor(id, ch, where) {
  const c = COLOR_FROM_CHAR[ch];
  if (!c) fail(id, `bad color "${ch}" at ${where}`);
  return c;
}

export function compileLevel(def) {
  const { id } = def;
  const rows = def.map
    .split("\n")
    .map((r) => r.trim())
    .filter(Boolean)
    .map((r) => r.split(/\s+/));
  const h = rows.length;
  const w = rows[0].length;
  rows.forEach((r, y) => {
    if (r.length !== w) fail(id, `row ${y} has ${r.length} cells, expected ${w}`);
  });

  const grid = new Array(w * h).fill(null);
  const sources = [];
  const targets = [];
  const rotatables = [];
  const movables = [];
  const slots = [];
  const cranks = [];
  const geared = [];
  const shutters = [];
  const switches = [];
  const gates = [];
  const portalCells = {};
  const walls = [];
  const statics = []; // every non-empty, non-dynamic cell, for rendering

  const put = (x, y, cell) => {
    grid[y * w + x] = cell;
    statics.push({ x, y, ...cell });
  };

  rows.forEach((row, y) => {
    row.forEach((tok, x) => {
      const where = `(${x},${y})`;
      const t0 = tok[0];
      if (tok === ".") return;
      if (tok === "#") {
        walls.push({ x, y });
        grid[y * w + x] = { type: "wall" };
        return;
      }
      if (tok === "/" || tok === "\\") {
        rotatables.push({ id: `r${rotatables.length}`, x, y, kind: "mirror", init: ORIENTS.indexOf(tok) });
        return;
      }
      if (tok === "/!" || tok === "\\!") {
        put(x, y, { type: "mirror", o: tok[0], fixed: true });
        return;
      }
      if (DIR_FROM_CHAR[t0] !== undefined && tok.length === 2) {
        const src = { x, y, d: DIR_FROM_CHAR[t0], c: parseColor(id, tok[1], where) };
        sources.push(src);
        put(x, y, { type: "source", d: src.d, c: src.c });
        return;
      }
      if (t0 === "T") {
        const tg = { idx: targets.length, x, y, c: parseColor(id, tok[1], where) };
        targets.push(tg);
        put(x, y, { type: "target", idx: tg.idx, c: tg.c });
        return;
      }
      if (t0 === "S") {
        const o = tok[1];
        if (!ORIENTS.includes(o)) fail(id, `bad splitter ${tok} at ${where}`);
        if (tok[2] === "!") put(x, y, { type: "splitter", o, fixed: true });
        else rotatables.push({ id: `r${rotatables.length}`, x, y, kind: "splitter", init: ORIENTS.indexOf(o) });
        return;
      }
      if (tok === "P") {
        put(x, y, { type: "prism" });
        return;
      }
      if (t0 === "F") {
        put(x, y, { type: "filter", c: parseColor(id, tok[1], where) });
        return;
      }
      if (t0 === "@") {
        const k = tok.slice(1);
        (portalCells[k] ||= []).push({ x, y });
        put(x, y, { type: "portal", pair: k });
        return;
      }
      if (t0 === "*") {
        switches.push({ x, y, id: tok.slice(1) });
        put(x, y, { type: "switch", id: tok.slice(1) });
        return;
      }
      if (t0 === "G") {
        gates.push({ x, y, id: tok.slice(1) });
        put(x, y, { type: "gate", id: tok.slice(1) });
        return;
      }
      if (tok === "o") {
        slots.push({ x, y });
        put(x, y, { type: "slot" });
        return;
      }
      if (t0 === "M") {
        const o = tok[1];
        if (!ORIENTS.includes(o)) fail(id, `bad movable ${tok} at ${where}`);
        slots.push({ x, y });
        put(x, y, { type: "slot" });
        movables.push({ id: `m${movables.length}`, o, initSlot: slots.length - 1 });
        return;
      }
      if (t0 === "C") {
        cranks.push({ id: `c${cranks.length}`, group: tok.slice(1), x, y, phases: 0 });
        put(x, y, { type: "crank", group: tok.slice(1) });
        return;
      }
      if (t0 === "g") {
        const [g, pat] = tok.slice(1).split(":");
        const pattern = [...(pat || "")];
        if (!pattern.length || pattern.some((p) => !ORIENTS.includes(p))) fail(id, `bad geared mirror ${tok}`);
        geared.push({ x, y, group: g, pattern });
        return;
      }
      if (t0 === "h") {
        const [g, pat] = tok.slice(1).split(":");
        const pattern = [...(pat || "")].map((p) => p === "1");
        if (!pattern.length) fail(id, `bad shutter ${tok}`);
        shutters.push({ x, y, group: g, pattern });
        return;
      }
      fail(id, `unknown token "${tok}" at ${where}`);
    });
  });

  const portals = {};
  for (const [k, cells] of Object.entries(portalCells)) {
    if (cells.length !== 2) fail(id, `portal ${k} needs exactly 2 cells`);
    portals[`${cells[0].x},${cells[0].y}`] = cells[1];
    portals[`${cells[1].x},${cells[1].y}`] = cells[0];
  }

  // Each gear train's phase count is the pattern length of its parts.
  for (const c of cranks) {
    const lens = [...geared, ...shutters].filter((p) => p.group === c.group).map((p) => p.pattern.length);
    if (!lens.length) fail(id, `crank ${c.group} drives nothing`);
    if (lens.some((l) => l !== lens[0])) fail(id, `gear train ${c.group} has mismatched pattern lengths`);
    c.phases = lens[0];
  }
  for (const p of [...geared, ...shutters]) {
    if (!cranks.some((c) => c.group === p.group)) fail(id, `gear part at (${p.x},${p.y}) has no crank`);
  }
  for (const g of gates) {
    if (!switches.some((s) => s.id === g.id)) fail(id, `gate ${g.id} has no switch`);
  }
  if (!sources.length) fail(id, "no source");
  if (!targets.length) fail(id, "no target");

  return {
    id,
    name: def.name,
    tip: def.tip || null,
    w,
    h,
    grid,
    statics,
    walls,
    sources,
    targets,
    rotatables,
    movables,
    slots,
    cranks,
    geared,
    shutters,
    switches,
    gates,
    portals,
    mechanics: mechanicsOf({ rotatables, movables, cranks, switches, statics }),
  };
}

function mechanicsOf({ rotatables, movables, cranks, switches, statics }) {
  const set = new Set();
  if (rotatables.some((r) => r.kind === "mirror") || statics.some((s) => s.type === "mirror")) set.add("mirror");
  if (rotatables.some((r) => r.kind === "splitter") || statics.some((s) => s.type === "splitter")) set.add("splitter");
  for (const s of statics) {
    if (["prism", "filter", "portal"].includes(s.type)) set.add(s.type);
  }
  if (switches.length) set.add("switch");
  if (movables.length) set.add("movable");
  if (cranks.length) set.add("gears");
  return set;
}

/** The untouched starting puzzle state of a compiled level. */
export function initialState(level) {
  return {
    rot: level.rotatables.map((r) => r.init),
    mov: level.movables.map((m) => m.initSlot),
    crank: level.cranks.map(() => 0),
  };
}

export function stateKey(s) {
  return `${s.rot.join("")}|${s.mov.join(",")}|${s.crank.join(",")}`;
}

export function statesEqual(a, b) {
  return stateKey(a) === stateKey(b);
}

/** Validate a state loaded from storage against a level; null if it doesn't fit. */
export function sanitizeState(level, raw) {
  if (!raw || typeof raw !== "object") return null;
  const { rot, mov, crank } = raw;
  if (!Array.isArray(rot) || rot.length !== level.rotatables.length || rot.some((v) => v !== 0 && v !== 1)) return null;
  if (!Array.isArray(mov) || mov.length !== level.movables.length) return null;
  if (mov.some((v) => !Number.isInteger(v) || v < 0 || v >= level.slots.length)) return null;
  if (new Set(mov).size !== mov.length) return null;
  if (!Array.isArray(crank) || crank.length !== level.cranks.length) return null;
  if (crank.some((v, i) => !Number.isInteger(v) || v < 0 || v >= level.cranks[i].phases)) return null;
  return { rot: [...rot], mov: [...mov], crank: [...crank] };
}
