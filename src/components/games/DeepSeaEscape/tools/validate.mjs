/**
 * Static level checks:  node src/components/games/DeepSeaEscape/tools/validate.mjs
 * row widths, entity cells, wall mounts, door frames, overlapping devices.
 */
import { LEVELS } from "../engine/levels.js";
import { createSim } from "../engine/sim.js";
import { DIRS } from "../engine/constants.js";

let bad = 0;
const err = (L, m) => {
  bad++;
  console.log(`L${L.id}: ${m}`);
};
const WALLY = new Set(["wall", "void", "pillar", "glass", "tube", "window"]);
for (const L of LEVELS) {
  const w = L.map[0].length;
  L.map.forEach((row, r) => row.length !== w && err(L, `row ${r} width ${row.length} != ${w}`));
  let s;
  try {
    s = createSim(L);
  } catch (e) {
    err(L, e.message);
    continue;
  }
  const kind = (c, r) => s.tileKind(c, r);
  const used = new Map();
  for (const e of [...L.ents, ...(L.deco || []).map(([k, c, r]) => ({ t: "deco", kind: k, at: [c, r], id: `deco:${k}` }))]) {
    const [c, r] = e.at;
    const k = kind(c, r);
    if (e.t === "enemy") {
      if (k !== "floor" || s.tileAt(c, r).h) err(L, `${e.id} enemy on ${k}`);
      continue;
    }
    if (WALLY.has(k)) err(L, `${e.id} (${e.t}) inside ${k} at ${c},${r}`);
    if (e.dir && e.t !== "emitter" ? true : e.t === "emitter" && e.dir) {
      if (e.dir) {
        const [dc, dr] = DIRS[e.dir];
        if (!WALLY.has(kind(c + dc, r + dr))) err(L, `${e.id} (${e.t}) mounted on ${e.dir} but ${kind(c + dc, r + dr)} at ${c + dc},${r + dr}`);
        const key = `${c},${r},${e.dir}`;
        if (used.has(key)) err(L, `${e.id} shares wall face with ${used.get(key)}`);
        used.set(key, e.id);
        continue;
      }
    }
    if (e.t === "door") {
      const ns = WALLY.has(kind(c, r - 1)) && WALLY.has(kind(c, r + 1));
      const ew = WALLY.has(kind(c - 1, r)) && WALLY.has(kind(c + 1, r));
      if (!ns && !ew) err(L, `${e.id} door at ${c},${r} not in a wall gap`);
    }
    if (e.t === "trig" || (e.t === "item" && e.from)) continue;
    const key = `${c},${r}`;
    if (used.has(key) && e.t !== "deco") err(L, `${e.id} overlaps ${used.get(key)} at ${key}`);
    else if (used.has(key) && e.t === "deco" && !["debris", "puddle", "papers", "cables"].includes(e.kind)) err(L, `${e.id} overlaps ${used.get(key)} at ${key}`);
    if (!["debris", "puddle", "papers", "cables"].includes(e.kind)) used.set(key, e.id);
    if (e.t === "item" && s.tileAt(c, r).h && kind(c, r) === "floor" && !["desk"].includes(s.tileAt(c, r).raised)) err(L, `${e.id} item on raised ${s.tileAt(c, r).raised}`);
  }
  // solid decorations must never cut a walkable region in two
  const reach = (withDeco) => {
    const seen = new Set();
    const [sc, sr] = s.playerCell();
    const q = [[sc, sr]];
    seen.add(`${sc},${sr}`);
    while (q.length) {
      const [c, r] = q.shift();
      for (const [dc, dr] of Object.values(DIRS)) {
        const nc = c + dc,
          nr = r + dr,
          k = `${nc},${nr}`;
        if (seen.has(k)) continue;
        const t = s.tileAt(nc, nr);
        if (!t || WALLY.has(t.t) || t.h > 0.65) continue;
        const blocker = s.ents.find((e) => e.c === nc && e.r === nr && !e.wall && e.t !== "door" && e.t !== "item" && e.t !== "trig" && e.t !== "plate" && !e.soft && (e.t !== "deco" || withDeco) && e.t !== "block");
        if (blocker) continue;
        seen.add(k);
        q.push([nc, nr]);
      }
    }
    return seen;
  };
  const all = reach(false),
    some = reach(true);
  const decoCells = new Set((L.deco || []).map(([, c, r]) => `${c},${r}`));
  for (const k of all) if (!some.has(k) && !decoCells.has(k)) {
    err(L, `decoration cuts off cell ${k}`);
    break;
  }
  // nothing solid may stand right in front of a door
  for (const d of L.ents.filter((e) => e.t === "door")) {
    const [c, r] = d.at;
    const ns = WALLY.has(kind(c, r - 1)) && WALLY.has(kind(c, r + 1));
    for (const [dc, dr] of ns ? [[-1, 0], [1, 0]] : [[0, -1], [0, 1]]) {
      const o = s.ents.find((e) => e.c === c + dc && e.r === r + dr && !e.wall && !e.soft && ["locker", "gen", "socket", "term", "prism", "receiver", "o2", "deco", "statue", "barrel", "node", "emitter"].includes(e.t));
      if (o) err(L, `${o.id} blocks door ${d.id}`);
    }
  }
  // pipe boards: the authored solution works and the starting layout doesn't
  for (const [id, b] of Object.entries(s.boards)) {
    const solved = { ...b, cells: b.cells.map((c) => ({ ...c, rot: "ILTX".includes(c.ch) ? Number(b.sol[c.y][c.x]) : c.rot })) };
    const outs = (bb) => bb.cells.filter((c) => c.ch === "E").every((c) => s.flowBoard(bb).has(c.y * bb.w + c.x));
    if (!outs(solved)) err(L, `board ${id} solution does not reach every outlet`);
    if (outs(b)) err(L, `board ${id} starts solved`);
    for (const c of b.cells) if ("SE".includes(c.ch) && Number(b.sol[c.y][c.x]) !== c.rot) err(L, `board ${id} fixed piece ${c.ch} at ${c.x},${c.y} differs between rot and sol`);
  }
  for (const [c, r] of L.windows || []) if (s.tileKind(c, r) !== "wall") err(L, `window ${c},${r} is not a wall`);
  // keypad/door/clue ids referenced by clue keys exist
  for (const e of L.ents) if (e.clue && !L.clues?.[e.clue]) err(L, `${e.id} clue ${e.clue} missing`);
  if (!L.map.some((row) => row.includes("X"))) err(L, "no exit");
}
console.log(bad ? `${bad} problem(s)` : `all ${LEVELS.length} levels pass static checks`);
process.exit(bad ? 1 : 0);
