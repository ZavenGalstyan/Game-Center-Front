/**
 * Static level checks:  node src/components/games/BiohazardEscape/tools/validate.mjs
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
const WALLY = new Set(["wall", "void", "pillar", "glass", "tube"]);
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
    else if (used.has(key) && e.t === "deco" && !["blood", "papers", "goo", "body"].includes(e.kind)) err(L, `${e.id} overlaps ${used.get(key)} at ${key}`);
    if (!["blood", "papers", "goo", "body"].includes(e.kind)) used.set(key, e.id);
    if (e.t === "item" && s.tileAt(c, r).h && kind(c, r) === "floor" && !["table"].includes(s.tileAt(c, r).raised)) err(L, `${e.id} item on raised ${s.tileAt(c, r).raised}`);
  }
  // keypad/door/clue ids referenced by clue keys exist
  for (const e of L.ents) if (e.clue && !L.clues?.[e.clue]) err(L, `${e.id} clue ${e.clue} missing`);
  if (!L.map.some((row) => row.includes("X"))) err(L, "no exit");
}
console.log(bad ? `${bad} problem(s)` : `all ${LEVELS.length} levels pass static checks`);
process.exit(bad ? 1 : 0);
