/**
 * Headless validation of every Escape 100 level (same engine as the game):
 *   node src/components/games/Escape100/tools/levelTest.mjs [ids…] [--verbose]
 *  1. schema: unique ids, known kinds, every referenced object/item exists,
 *     3 hints per stage, a reference solution;
 *  2. the exit is locked at the start and the door refuses to open;
 *  3. the reference solution plays through the reducer and wins on its last step;
 *  4. every mechanical step is necessary (dropping it means no escape);
 *  5. clues: every keypad/buttons/wires lists its clues, they exist and the
 *     solution reads them before solving it; literal codes appear in a clue;
 *  6. hints advance through every stage, in order, as the solution progresses;
 *  7. restart restores an identical initial state; random play never throws.
 */
import { LEVELS } from "../levels/index.js";
import * as E from "../engine.js";
import { THEMES } from "../themes.js";

const args = process.argv.slice(2);
const verbose = args.includes("--verbose");
const ids = args.filter((a) => /^\d+$/.test(a)).map(Number);
const list = ids.length ? LEVELS.filter((L) => ids.includes(L.id)) : LEVELS;

const KINDS = new Set(["door", "container", "pickup", "keypad", "switch", "dial", "buttons", "slot", "movable", "clue", "wires", "mirrors", "timed", "machine", "prop"]);
let fails = 0, checks = 0;

/* approximate footprints (w × h, metres) — mirrors the builders in props.js */
const CONT_W = { deskDrawer: [0.5, 0.16], drawer: [0.6, 0.3], wallCabinet: [0.7, 0.6], medicine: [0.55, 0.65], footlocker: [0.9, 0.45], chest: [0.85, 0.5], toolbox: [0.6, 0.28], case: [0.55, 0.15], bin: [0.45, 0.6], basket: [0.55, 0.55], washer: [0.7, 0.9], altar: [1.4, 1.0], wallSafe: [0.5, 0.5], safe: [0.6, 0.75], coat: [0.6, 1.0], locker: [0.55, 1.9], crate: [0.8, 0.6], cabinet: [0.9, 0.9], fridge: [0.7, 1.7], box: [0.35, 0.22], coffer: [0.5, 0.3], urn: [0.5, 0.75], clock: [0.6, 2.0], piano: [1.4, 1.1], sarcophagus: [1.9, 0.75], vent: [0.6, 0.4], console: [0.8, 0.9], panelBox: [0.55, 0.55] };
const CLUE_W = { carving: [0.7, 0.55], sign: [0.7, 0.5], poster: [0.6, 0.8], note: [0.32, 0.26], stainedGlass: [0.9, 1.1], calendar: [0.45, 0.55], plaque: [0.5, 0.3], monitor: [0.5, 0.5], screen: [0.9, 0.55], chalkboard: [1.2, 0.8], book: [0.45, 0.32], mirror: [0.7, 0.95], painting: [0.8, 0.62], holo: [0.7, 0.5], tag: [0.18, 0.12] };
const MOV_W = { brick: [0.4, 0.2], painting: [0.85, 1.05], poster: [0.85, 1.05], crate: [0.85, 0.8], vent: [0.55, 0.4], plank: [0.9, 0.25], books: [0.35, 0.25], curtain: [1.2, 1.8], panel: [0.55, 0.55] };
function footprint(o) {
  // returns [w, h, centred] — centred: y is the centre (wall-mounted) instead of the base
  switch (o.kind) {
    case "door": return [1.5, 2.45, false];
    case "container": return [...(CONT_W[o.style] || [0.9, 0.9]), false];
    case "keypad": return [0.3, 0.4, true];
    case "switch": return o.style === "toggle" ? [0.14, 0.2, true] : [0.2, 0.5, true];
    case "dial": return o.style === "disc" ? [0.58, 0.58, true] : o.style === "valve" ? [0.5, 0.5, true] : [0.25, 0.32, true];
    case "buttons": return [o.buttons.length * (o.style === "bells" ? 0.42 : 0.2) + 0.15, o.style === "bells" ? 0.8 : 0.4, true];
    case "slot": return o.style === "fusebox" ? [0.44, 0.55, true] : o.style === "cardReader" ? [0.16, 0.26, true] : [0.34, 0.34, true];
    case "movable": return [...(MOV_W[o.style] || [0.55, 0.55]), true];
    case "clue": return [...(CLUE_W[o.style] || [0.7, 0.5]), true];
    case "wires": return [0.62, 0.12 + Math.max(o.left.length, o.right.length) * 0.1, true];
    case "timed": return [0.3, 0.3, true];
    case "machine": return o.style === "generator" ? [1.1, 0.8, false] : o.style === "deadMonitor" ? [0.5, 0.5, false] : [1.1, 0.8, false];
    case "pickup": return [0.2, 0.15, true];
    default: return [0.5, 0.5, false];
  }
}
const ok = (c, L, msg) => {
  checks++;
  if (!c) (fails++, console.log(`  ✗ L${L.id} ${L.name}: ${msg}`));
};

/** collect object ids / items referenced from a condition */
function refs(c, out = { obj: new Set(), items: new Set() }) {
  if (!c) return out;
  if (Array.isArray(c)) return c.forEach((x) => refs(x, out)), out;
  for (const k of ["all", "any"]) if (c[k]) c[k].forEach((x) => refs(x, out));
  if (c.not) refs(c.not, out);
  for (const k of ["open", "solved", "moved", "taken", "unlocked", "active"]) if (c[k]) out.obj.add(c[k]);
  if (c.has) out.items.add(c.has);
  if (c.got) out.items.add(c.got);
  for (const k of ["on", "dial", "placed"]) if (c[k]) for (const [id, v] of Object.entries(c[k])) (out.obj.add(id), typeof v === "string" && out.items.add(v));
  if (c.sum) c.sum.slots.forEach((id) => out.obj.add(id));
  if (c.balance) c.balance.flat().forEach((id) => out.obj.add(id));
  return out;
}
const contentText = (ct) => (ct ? [ct.title, ct.big, ...(ct.lines ?? []), ct.footer, ...(ct.grid ?? []).flat()].filter((x) => x != null).join(" ") : "");

function run(L, sol) {
  let s = E.initState(L);
  const trace = [];
  for (const [i, a] of sol.entries()) {
    const r = E.act(L, s, a);
    trace.push({ a, ok: r.ok, fx: r.fx, stage: E.hintStage(L, r.state) });
    if (!r.ok) return { s: r.state, okAll: false, failAt: i, fx: r.fx, trace };
    s = r.state;
  }
  return { s, okAll: true, trace };
}

const isMechanical = (a, L) => !(a.a === "inspect" || a.a === "wait" || (a.a === "click" && ["clue", "keypad", "wires", "buttons", "mirrors"].includes(E.objDef(L, a.id)?.kind)));

for (const L of list) {
  const t0 = performance.now();
  const objIds = new Set(L.objects.map((o) => o.id).filter(Boolean));
  // 1. schema
  ok(L.objects.filter((o) => o.id).length === objIds.size, L, "duplicate object ids");
  ok(THEMES[Math.floor((L.id - 1) / 10)], L, "no theme");
  ok(L.name && L.objective && L.solution?.length && L.hints?.length, L, "missing name/objective/solution/hints");
  for (const o of L.objects) {
    ok(KINDS.has(o.kind), L, `unknown kind ${o.kind}`);
    ok(o.at && (o.at.w ? "NESW".includes(o.at.w) : Number.isFinite(o.at.x) && Number.isFinite(o.at.z)), L, `bad placement for ${o.id || o.style}`);
    if (o.kind === "pickup") ok(L.items[o.item], L, `pickup ${o.id} unknown item ${o.item}`);
    if (o.kind === "container") for (const it of o.contents ?? []) ok(L.items[it], L, `container ${o.id} unknown item ${it}`);
    if (o.lock?.item) ok(L.items[o.lock.item], L, `${o.id} lock item ${o.lock.item}`);
    if (o.kind === "slot") for (const it of [].concat(o.accepts)) ok(it === "*" || L.items[it], L, `slot ${o.id} accepts unknown ${it}`);
    if (o.kind === "dial") ok(o.faces?.length >= 2, L, `dial ${o.id} faces`);
    if (o.kind === "buttons") ok(o.answer.every((b) => o.buttons.some((x) => x.id === b)), L, `buttons ${o.id} answer refs`);
    for (const c of [o.showIf, o.lock?.cond, o.needs?.cond, o.active]) {
      const r = refs(c);
      for (const id of r.obj) ok(objIds.has(id), L, `${o.id}: condition references unknown object ${id}`);
      for (const it of r.items) ok(L.items[it], L, `${o.id}: condition references unknown item ${it}`);
    }
  }
  for (const r of [...(L.rules ?? []).map((r) => r.when), L.exit.cond, ...L.hints.map((h) => h.until)]) {
    const rr = refs(r);
    for (const id of rr.obj) ok(objIds.has(id), L, `condition references unknown object ${id}`);
    for (const it of rr.items) ok(L.items[it], L, `condition references unknown item ${it}`);
  }
  if (L.exit.item) ok(L.items[L.exit.item], L, `exit item ${L.exit.item}`);
  for (const rc of L.recipes ?? []) ok(L.items[rc.a] && L.items[rc.b] && L.items[rc.out], L, "recipe items");
  for (const h of L.hints) ok(h.h?.length === 3 && h.h.every((x) => typeof x === "string" && x.length > 1), L, "each hint stage needs 3 hints");

  // 1b. layout: floor objects keep clear of the camera ring; wall objects don't overlap
  for (const o of L.objects) {
    if (o.at.w || ["prop", "pickup"].includes(o.kind) || o.at.y > 0.5) continue;
    ok(Math.hypot(o.at.x, o.at.z) >= 1.4, L, `floor object ${o.id} at (${o.at.x}, ${o.at.z}) is too close to the camera (room centre)`);
  }
  // nothing may stand in the exit door's approach corridor
  {
    const d = L.room.door, len = "NS".includes(d.w) ? L.room.d : L.room.w;
    for (const o of L.objects) {
      if (o.at.w || o.kind === "pickup" || o.at.y > 0.5) continue;
      if (["plate", "scale", "floor"].includes(o.style)) continue; // flat: you can see and walk over them
      // door-relative coordinates: u along the door wall, v = distance from it
      const u = { N: o.at.x, S: -o.at.x, E: o.at.z, W: -o.at.z }[d.w];
      const v = { N: o.at.z + L.room.d / 2, S: L.room.d / 2 - o.at.z, E: L.room.w / 2 - o.at.x, W: o.at.x + L.room.w / 2 }[d.w];
      ok(!(Math.abs(u - (d.x ?? 0)) < 1.1 && v < Math.min(2.8, len - 1)), L, `${o.id || o.style} blocks the way to the exit door`);
    }
  }
  const wallObjs = L.objects.filter((o) => o.at.w && o.kind !== "prop" && o.kind !== "pickup" && !(o.at.off > 0.3));
  for (let i = 0; i < wallObjs.length; i++)
    for (let j = i + 1; j < wallObjs.length; j++) {
      const a = wallObjs[i], b = wallObjs[j];
      if (a.at.w !== b.at.w) continue;
      // things revealed in place of another (showIf) may share the spot
      if (a.showIf || b.showIf) continue;
      const [aw, ah, ac] = footprint(a), [bw, bh, bc] = footprint(b);
      const ay0 = ac ? a.at.y - ah / 2 : a.at.y, by0 = bc ? b.at.y - bh / 2 : b.at.y;
      const ox = Math.min(a.at.x + aw / 2, b.at.x + bw / 2) - Math.max(a.at.x - aw / 2, b.at.x - bw / 2);
      const oy = Math.min(ay0 + ah, by0 + bh) - Math.max(ay0, by0);
      ok(!(ox > 0.02 && oy > 0.02), L, `wall objects ${a.id} and ${b.id} overlap on wall ${a.at.w} (${ox.toFixed(2)} × ${oy.toFixed(2)} m)`);
    }
  // wall objects must fit on their wall
  for (const o of L.objects.filter((o) => o.at.w && o.kind !== "prop")) {
    const len = "NS".includes(o.at.w) ? L.room.w : L.room.d;
    ok(Math.abs(o.at.x) + footprint(o)[0] / 2 <= len / 2 + 0.01, L, `${o.id} sticks out past the end of wall ${o.at.w}`);
  }

  // 2. locked at start
  const s0 = E.initState(L);
  ok(s0.obj.door.locked && !E.act(L, s0, { a: "click", id: "door" }).ok, L, "door must start locked");

  // 3. solution
  const res = run(L, L.solution);
  ok(res.okAll, L, `solution step ${res.failAt} failed: ${JSON.stringify(L.solution[res.failAt])} → ${res.fx?.find((f) => f.type === "msg")?.text}`);
  ok(res.s.won, L, "solution does not win");
  ok(res.okAll && res.trace.slice(0, -1).every((t) => !t.fx.some((f) => f.type === "win")), L, "won before the last step");

  // 4. necessity of mechanical steps
  if (res.okAll)
    for (const [i, a] of L.solution.entries()) {
      if (!isMechanical(a, L) || i === L.solution.length - 1) continue;
      const r = run(L, L.solution.filter((_, k) => k !== i));
      ok(!r.s.won, L, `step ${i} ${JSON.stringify(a)} is unnecessary`);
    }

  // 5. clues
  const readBefore = (id, untilIdx) =>
    L.solution.slice(0, untilIdx).some((a) => (id.startsWith("item:") ? a.a === "inspect" && a.item === id.slice(5) : a.a === "click" && a.id === id));
  for (const o of L.objects.filter((o) => ["keypad", "buttons", "wires"].includes(o.kind))) {
    ok(o.clues?.length, L, `${o.id} lists no clues`);
    const idx = L.solution.findIndex((a) => a.id === o.id && ["code", "press", "wire"].includes(a.a));
    for (const c of o.clues ?? []) {
      const exists = c.startsWith("item:") ? L.items[c.slice(5)] : objIds.has(c);
      ok(exists, L, `${o.id} clue ${c} does not exist`);
      ok(idx < 0 || readBefore(c, idx), L, `${o.id} clue ${c} is not read before solving`);
    }
    if (o.kind === "keypad" && o.literal !== false && /^\d+$/.test(o.code)) {
      const texts = (o.clues ?? []).map((c) => contentText(c.startsWith("item:") ? L.items[c.slice(5)]?.content : E.objDef(L, c)?.content)).join(" ").replace(/\s+/g, "");
      const reversed = o.code.split("").reverse().join("");
      ok(texts.includes(o.code) || texts.includes(reversed) || o.derived, L, `keypad ${o.id} code ${o.code} is not literally in its clues (mark derived:true if computed)`);
    }
  }

  // 6. hints
  if (res.okAll) {
    const stages = [E.hintStage(L, s0), ...res.trace.map((t) => t.stage)];
    ok(stages.every((v, i) => i === 0 || v >= stages[i - 1]), L, `hint stages go backwards: ${stages.join(",")}`);
    ok(new Set(stages).size === L.hints.length, L, `not every hint stage is reached (${[...new Set(stages)].join(",")} of ${L.hints.length})`);
  }

  // 6b. mirror boards: brute-force every orientation — solvable, unsolved at start,
  //     and the reference solution uses a minimal number of turns
  for (const o of L.objects.filter((o) => o.kind === "mirrors")) {
    const free = o.cells.map((c, i) => i).filter((i) => !o.cells[i].block && !o.cells[i].fixed);
    let best = Infinity;
    for (let mask = 0; mask < 1 << free.length; mask++) {
      const cells = o.cells.map((c) => ({ ...c }));
      let turns = 0;
      free.forEach((ci, b) => {
        if (mask & (1 << b)) (cells[ci].m = cells[ci].m === "/" ? "\\" : "/"), turns++;
      });
      if (E.traceBeam(o, cells).hit >= 0) best = Math.min(best, turns);
    }
    ok(E.traceBeam(o, o.cells).hit < 0, L, `${o.id} is solved at the start`);
    ok(best < Infinity, L, `${o.id} has no solution`);
    const used = L.solution.filter((a) => a.a === "rotate" && a.id === o.id).length;
    ok(used === best, L, `${o.id} reference uses ${used} turns, minimum is ${best}`);
  }

  // 7. restart + fuzz
  ok(JSON.stringify(E.initState(L)) === JSON.stringify(E.initState(L)), L, "restart not deterministic");
  let seed = L.id * 977, s = E.initState(L);
  const rnd = (n) => ((seed = (seed * 16807) % 2147483647) % n);
  const interact = L.objects.filter((o) => o.id);
  try {
    for (let k = 0; k < 400; k++) {
      const o = interact[rnd(interact.length)];
      const items = Object.keys(L.items);
      const opts = [
        { a: "click", id: o.id },
        s.inv.length ? { a: "use", item: s.inv[rnd(s.inv.length)], id: o.id } : { a: "click", id: o.id },
        o.kind === "keypad" ? { a: "code", id: o.id, v: String(rnd(10000)).padStart(o.code.length, "0") } : { a: "click", id: o.id },
        o.kind === "buttons" ? { a: "press", id: o.id, b: o.buttons[rnd(o.buttons.length)].id } : { a: "click", id: o.id },
        o.kind === "container" && s.obj[o.id].open && s.obj[o.id].contents.length ? { a: "take", id: o.id, item: s.obj[o.id].contents[0] } : { a: "click", id: o.id },
        s.inv.length > 1 ? { a: "combine", x: s.inv[0], y: s.inv[1] } : { a: "inspect", item: items[0] },
        o.kind === "mirrors" ? { a: "rotate", id: o.id, cell: rnd(o.cells.length) } : { a: "click", id: o.id },
      ];
      const a = opts[rnd(opts.length)];
      if (a.a === "click" && o.id === "door") continue;
      const r = E.act(L, s, a);
      s = r.state;
      E.tick(L, s, 0.5);
    }
    ok(true, L, "");
  } catch (e) {
    ok(false, L, `random play threw: ${e.message}`);
  }
  if (verbose) console.log(`L${String(L.id).padStart(3)} ${L.name.padEnd(26)} steps=${L.solution.length} stages=${L.hints.length} ${(performance.now() - t0).toFixed(0)}ms`);
}
console.log(fails ? `\n${fails} problem(s) in ${checks} checks` : `\nall ${list.length} level(s) valid — ${checks} checks passed`);
process.exit(fails ? 1 : 0);
