/**
 * Escape Quest — level validator. Run from the repo root:
 *   node src/components/games/EscapeQuest/tools/simTest.mjs [levelId]
 *
 * For every level it checks:
 *  1. data integrity — unique ids, every referenced hotspot / item / prop kind exists,
 *     puzzle configs are well-formed and not already solved at the start;
 *  2. the scripted solution escapes, every step does something, every step's
 *     hotspot is visible when it is needed, and the hint system points at it;
 *  3. clue-before-use — each puzzle's clue sources were seen (or are painted in
 *     plain sight) before the puzzle is solved;
 *  4. no softlocks — 400 random players (random taps, wrong items, wrong
 *     answers, random combines, correct solves at random moments) can always
 *     still finish by doing the remaining solution steps;
 *  5. counting clues (`countOf`) match the room's actual props.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LEVELS } from "../levels/index.js";
import { ITEMS } from "../items.js";
import { GLYPHS } from "../glyphNames.js";
import { newState, clone, tap, solve, combine, runStep, stepDone, parseStep, hintFor, visible, puzzleSolution, checkPuzzle, lightsStart, hotspot, itemDef } from "../engine.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const propSrc = ["props.jsx", "props2.jsx"].map((f) => fs.readFileSync(path.join(here, "..", f), "utf8")).join("\n");
const KINDS = new Set([...propSrc.matchAll(/^ {2}(\w+)\(\{/gm)].map((m) => m[1]));
KINDS.add("item");
KINDS.add("none");
const COLORS = new Set(["red", "orange", "yellow", "green", "blue", "purple", "pink", "cyan", "white", "black", "brown"]);

let fails = 0;
const only = process.argv[2] ? Number(process.argv[2]) : null;
const fail = (L, msg) => {
  fails++;
  console.log(`  ✗ L${L.id} ${L.name}: ${msg}`);
};

let seed = 12345;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const pickOne = (a) => a[Math.floor(rnd() * a.length)];

function itemExists(L, id) {
  return !!((L.items && L.items[id]) || ITEMS[id]);
}

function checkData(L) {
  const ids = new Set();
  for (const h of L.hotspots) {
    if (ids.has(h.id)) fail(L, `duplicate hotspot id ${h.id}`);
    ids.add(h.id);
    if (!KINDS.has(h.k)) fail(L, `hotspot ${h.id} unknown prop kind ${h.k}`);
    if (h.v >= L.views) fail(L, `hotspot ${h.id} view ${h.v} out of range`);
    if (h.x < 0 || h.y < 0 || h.x + h.w > 1000 || h.y + h.h > 560) fail(L, `hotspot ${h.id} outside the scene`);
    if (h.w < 24 || h.h < 18) fail(L, `hotspot ${h.id} too small to tap (${h.w}×${h.h})`);
    for (const r of [...(h.reveals || []), ...(h.removes || [])]) if (!L.hotspots.some((o) => o.id === r)) fail(L, `${h.id} references missing hotspot ${r}`);
    for (const it of [...(h.gives || []), ...(h.take ? [h.take] : []), ...(h.lock && h.lock.item ? [h.lock.item] : []), ...((h.lock && h.lock.items) || [])]) if (!itemExists(L, it)) fail(L, `${h.id} references missing item ${it}`);
    const P = h.lock && h.lock.puzzle;
    if (P) checkPuzzleData(L, h, P);
  }
  for (const d of L.decor) if (!KINDS.has(d.k)) fail(L, `decor unknown kind ${d.k}`);
  for (const c of L.combos) for (const it of [c.a, c.b, c.out]) if (!itemExists(L, it)) fail(L, `combo references missing item ${it}`);
  for (const step of L.solution) {
    const st = parseStep(step);
    if (st.kind === "combine") continue;
    if (!hotspot(L, st.id)) fail(L, `solution step ${step}: no hotspot ${st.id}`);
  }
  if (!L.hotspots.some((h) => h.exit)) fail(L, "no exit");
}

function checkPuzzleData(L, h, P) {
  const bad = (m) => fail(L, `puzzle ${h.id} (${P.type}): ${m}`);
  for (const c of P.clueFrom || []) {
    if (c.startsWith("item:")) {
      if (!itemExists(L, c.slice(5))) bad(`clueFrom missing item ${c}`);
    } else if (!hotspot(L, c)) bad(`clueFrom missing hotspot ${c}`);
  }
  switch (P.type) {
    case "keypad":
      if (!/^\d{1,6}$/.test(P.answer)) bad(`keypad answer ${P.answer}`);
      break;
    case "word":
      if (!/^[A-Z]{2,7}$/.test(P.answer)) bad(`word answer ${P.answer}`);
      break;
    case "colors":
      if (!P.palette || !P.answer.every((c) => P.palette.includes(c))) bad("answer not in palette");
      break;
    case "arrows":
      if (!P.answer.every((a) => "UDLR".includes(a))) bad("bad arrows");
      break;
    case "dials": {
      const sets = P.wheels || P.answer.map(() => P.symbols);
      if (!sets || sets.length !== P.answer.length) bad("wheel count");
      else P.answer.forEach((a, i) => !sets[i].includes(a) && bad(`answer ${a} not on wheel ${i}`));
      (P.symbols || []).concat(...(P.wheels || [])).forEach((g) => !GLYPHS.includes(g) && !/^[\w-]{1,3}$/.test(g) && bad(`unknown symbol ${g}`));
      break;
    }
    case "order": {
      const ids = P.pieces.map((p) => p.id);
      if ([...ids].sort().join() !== [...P.answer].sort().join()) bad("answer is not a permutation of pieces");
      if (ids.join() === P.answer.join()) bad("already in order at start");
      break;
    }
    case "pattern":
      if (!P.rows || !P.cols || P.answer.some((i) => i < 0 || i >= P.rows * P.cols)) bad("cells out of range");
      break;
    case "lights":
      if (lightsStart(P).every(Boolean)) bad("already solved at start");
      break;
    case "rotate":
      if (P.start.every((r) => r % 4 === 0)) bad("already solved at start");
      if (![4, 9].includes(P.start.length)) bad("rotate needs 4 or 9 tiles");
      break;
    default:
      bad("unknown type");
  }
  if (!checkPuzzle(P, puzzleSolution(P))) bad("own solution rejected");
  if (P.countOf) {
    const counts = P.countOf.map((k) => [...L.decor, ...L.hotspots].filter((d) => d.k === k || d.count === k).length);
    if (counts.join("") !== String(P.answer)) bad(`countOf ${P.countOf} = ${counts.join("")} but answer ${P.answer}`);
  }
}

/** Is the hotspot's clue available to a player right now? */
function clueAvailable(L, s, ref) {
  if (ref.startsWith("item:")) return !!s.seen[ref] || s.got[ref.slice(5)];
  const h = hotspot(L, ref);
  if (!visible(L, s, h)) return false;
  if (h.clue) return !!s.seen[h.id];
  return true;
}

function checkSolution(L) {
  const s = newState(L);
  L.solution.forEach((step, i) => {
    const st = parseStep(step);
    if (stepDone(L, s, st)) fail(L, `step ${i} ${step} is already done before it runs`);
    const hint = hintFor(L, s);
    if (!hint) fail(L, `no hint before step ${step}`);
    else if (st.kind === "combine" ? !hint.items : hint.id !== st.id) fail(L, `hint points at ${hint.id || hint.items} instead of ${step}`);
    if (st.kind !== "combine" && !visible(L, s, hotspot(L, st.id))) fail(L, `step ${step}: hotspot not visible yet`);
    if (st.kind === "solve") {
      const P = hotspot(L, st.id).lock.puzzle;
      for (const c of P.clueFrom || []) if (!clueAvailable(L, s, c)) fail(L, `step ${step}: clue ${c} not seen before solving`);
      if (!P.clueFrom && !["lights", "rotate", "order"].includes(P.type)) fail(L, `puzzle ${st.id} has no clueFrom`);
    }
    if (st.kind === "use" && !s.inv.includes(st.item)) fail(L, `step ${step}: item not in inventory`);
    if (st.kind === "combine" && (!s.inv.includes(st.a) || !s.inv.includes(st.b))) fail(L, `step ${step}: items not in inventory`);
    const ev = runStep(L, s, step);
    if (!ev.ok && !ev.escaped) fail(L, `step ${step} failed: ${ev.msgs.join(" | ")}`);
    if (!stepDone(L, s, st)) fail(L, `step ${step} did not complete`);
  });
  if (!s.escaped) fail(L, "solution does not escape");
  return s;
}

function randomAction(L, s) {
  const vis = L.hotspots.filter((h) => visible(L, s, h) && !h.exit);
  const r = rnd();
  if (r < 0.35 && vis.length) return tap(L, s, pickOne(vis).id);
  if (r < 0.65 && vis.length && s.inv.length) return tap(L, s, pickOne(vis).id, pickOne(s.inv));
  if (r < 0.75 && s.inv.length > 1) return combine(L, s, pickOne(s.inv), pickOne(s.inv));
  const puz = vis.filter((h) => h.lock && h.lock.puzzle && !s.opened[h.id]);
  if (puz.length) {
    const h = pickOne(puz);
    return solve(L, s, h.id, rnd() < 0.3 ? puzzleSolution(h.lock.puzzle) : ["nope"]);
  }
  return null;
}

function finishFrom(L, s) {
  for (const step of L.solution) {
    if (stepDone(L, s, step)) continue;
    const st = parseStep(step);
    if (st.kind === "use" && !s.inv.includes(st.item)) return `needs ${st.item} for ${step} but it is gone`;
    if (st.kind === "combine" && (!s.inv.includes(st.a) || !s.inv.includes(st.b))) return `cannot ${step}`;
    if (st.kind !== "combine" && !visible(L, s, hotspot(L, st.id))) return `${st.id} not visible for ${step}`;
    runStep(L, s, step);
    if (!stepDone(L, s, step)) return `${step} did not complete`;
  }
  return s.escaped ? null : "did not escape";
}

function fuzz(L, runs = 400) {
  for (let r = 0; r < runs; r++) {
    const s = newState(L);
    const n = 5 + Math.floor(rnd() * 70);
    for (let i = 0; i < n && !s.escaped; i++) randomAction(L, s);
    const err = finishFrom(L, clone(s));
    if (err) {
      fail(L, `softlock after random play (run ${r}): ${err}`);
      return;
    }
  }
}

const rows = [];
for (const L of LEVELS) {
  if (only && L.id !== only) continue;
  checkData(L);
  checkSolution(L);
  fuzz(L);
  const puzzles = L.hotspots.filter((h) => h.lock && h.lock.puzzle).map((h) => h.lock.puzzle.type);
  rows.push(`L${String(L.id).padStart(2)} ${L.name.padEnd(28)} views:${L.views} steps:${String(L.solution.length).padStart(2)} puzzles:${puzzles.join(",") || "-"}`);
}
console.log(rows.join("\n"));
console.log(fails ? `\n${fails} problem(s) found` : `\nAll ${rows.length} level(s) pass.`);
process.exit(fails ? 1 : 0);
