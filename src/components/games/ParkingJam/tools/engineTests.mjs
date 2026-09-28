/**
 * Parking Jam — engine rule tests (Node, no framework):
 *   node src/components/games/ParkingJam/tools/engineTests.mjs
 * Tiny boards through the real compiler and the real rules: occupancy,
 * direction/path detection, blocking, walls, obstacles, undo, replay,
 * solver, hint.
 */
import { compileLevel, cellsOf } from "../engine/level.js";
import {
  initialState, buildOccupancy, pathCells, canExit, legalMoves, applyExit, undoExit,
  isSolved, solve, peel, bestHint, replay, EMPTY, OBSTACLE,
} from "../engine/logic.js";
import { validateLevel } from "../engine/validate.js";
import { getLevel } from "../data/index.js";

let pass = 0;
let fail = 0;
function check(name, cond) {
  if (cond) pass++;
  else {
    fail++;
    console.error("✗", name);
  }
}
const L = (map, extra = {}) => compileLevel({ name: "t", map, ...extra }, { id: 999 });
const idx = (lv, id) => lv.vehicles.find((v) => v.id === id).index;

/* ---------- compiler: geometry */
{
  const lv = L(`
    .. a^ ..
    .. a- ..
    b- b> ..
  `);
  const a = lv.vehicles[idx(lv, "a")];
  const b = lv.vehicles[idx(lv, "b")];
  check("a vertical", a.orientation === "vertical" && a.dir === "up" && a.row === 0 && a.col === 1 && a.length === 2);
  check("b horizontal", b.orientation === "horizontal" && b.dir === "right" && b.row === 2 && b.col === 0);
  check("cellsOf a", JSON.stringify(cellsOf(a)) === "[[0,1],[1,1]]");
  check("cellsOf b", JSON.stringify(cellsOf(b)) === "[[2,0],[2,1]]");
  const occ = buildOccupancy(lv, initialState(lv).present);
  check("occ a", occ[0 * 3 + 1] === a.index && occ[1 * 3 + 1] === a.index);
  check("occ b", occ[2 * 3 + 0] === b.index && occ[2 * 3 + 1] === b.index);
  check("occ empty", occ[0] === EMPTY && occ[2 * 3 + 2] === EMPTY);
  check("path a (at edge) empty", pathCells(lv, a).length === 0);
  check("path b", JSON.stringify(pathCells(lv, b)) === "[[2,2]]");
}

/* ---------- compiler rejects malformed vehicles */
const throws = (fn) => {
  try {
    fn();
    return false;
  } catch {
    return true;
  }
};
check("reject two arrows", throws(() => L(`a^ a^`)));
check("reject arrow wrong axis", throws(() => L(`a^ a-`)));
check("reject arrow on back end", throws(() => L(`a> a-`)));
check("reject L-shape", throws(() => L(`a- a>\n.. a-`)));
check("reject gap", throws(() => L(`a- .. a>`)));
check("reject single cell", throws(() => L(`a> ..`)));
check("reject ragged rows", throws(() => L(`.. ..\n..`)));
check("reject unknown type", throws(() => L(`a- a>`, { types: "a:rocket" })));

/* ---------- each direction's path and blocking */
{
  const lv = L(`
    .. .. u^ .. ..
    .. .. u- .. ..
    l< l- .. r- r>
    .. .. d- .. ..
    .. .. dv .. ..
  `);
  const s = initialState(lv);
  for (const id of ["u", "l", "r", "d"]) check(`free ${id}`, canExit(lv, s.present, idx(lv, id)).ok);
}
{
  const lv = L(`
    .. .. .. ..
    a- a> b^ ..
    .. .. b- ..
  `);
  const s = initialState(lv);
  const r = canExit(lv, s.present, idx(lv, "a"));
  check("a blocked by b", !r.ok && r.reason === "vehicle" && r.blocker === idx(lv, "b"));
  check("blockedAt is first cell", JSON.stringify(r.blockedAt) === "[1,2]");
  check("b free", canExit(lv, s.present, idx(lv, "b")).ok);
  check("illegal apply returns null", applyExit(lv, s, idx(lv, "a")) === null);
  const s1 = applyExit(lv, s, idx(lv, "b"));
  check("b exits", s1 && !s1.present[idx(lv, "b")]);
  check("b cells freed", buildOccupancy(lv, s1.present)[1 * 4 + 2] === EMPTY);
  check("a now free", canExit(lv, s1.present, idx(lv, "a")).ok);
  check("original state untouched", s.present.every(Boolean));
  const s2 = applyExit(lv, s1, idx(lv, "a"));
  check("solved", isSolved(s2));
  check("second exit illegal", applyExit(lv, s2, idx(lv, "a")) === null);
  check("gone reason", canExit(lv, s2.present, idx(lv, "a")).reason === "gone");
}

/* ---------- far blocker (not adjacent) still blocks */
{
  const lv = L(`a- a> .. .. b^\n.. .. .. .. b-`);
  const r = canExit(lv, initialState(lv).present, idx(lv, "a"));
  check("far blocker", !r.ok && r.blocker === idx(lv, "b"));
}

/* ---------- obstacles and walls */
{
  const lv = L(`a- a> ## ..`);
  const r = canExit(lv, initialState(lv).present, 0);
  check("pillar blocks", !r.ok && r.reason === "obstacle");
  check("pillar in occupancy", buildOccupancy(lv, [true])[2] === OBSTACLE);
  check("validator flags pillar deadlock", !validateLevel(lv).ok);
}
{
  const lv = L(`a- a> ..\n.. .. ..`, { closed: "right:0" });
  check("closed edge blocks", canExit(lv, [true], 0).reason === "wall");
  check("validator flags closed exit", !validateLevel(lv).ok);
  const lv2 = L(`a- a> ..\n.. .. ..`, { closed: "right:1" });
  check("other span open", canExit(lv2, [true], 0).ok);
}

/* ---------- cycle is unsolvable */
{
  // a→ hits b, b↓ hits d, d← hits c, c↑ hits a
  const cyc = L(`
    a- a> b-
    c^ .. bv
    c- d< d-
  `);
  check("cycle stuck", !peel(cyc).solvable);
  check("dfs agrees on cycle", !solve(cyc).solvable);
  check("validator rejects cycle", !validateLevel(cyc).ok);
}

/* ---------- undo */
{
  const lv = L(`a- a> b^\n.. .. b-`);
  let s = initialState(lv);
  s = applyExit(lv, s, idx(lv, "b"));
  const u = undoExit(s);
  check("undo restores b", u.restored === idx(lv, "b") && u.present.every(Boolean) && u.history.length === 0);
  check("undo occupancy", buildOccupancy(lv, u.present)[2] === idx(lv, "b"));
  check("undo on fresh is null", undoExit(initialState(lv)) === null);
  // torture: move undo move undo move move undo
  let t = initialState(lv);
  t = applyExit(lv, t, idx(lv, "b"));
  t = undoExit(t);
  t = applyExit(lv, t, idx(lv, "b"));
  t = undoExit(t);
  t = applyExit(lv, t, idx(lv, "b"));
  t = applyExit(lv, t, idx(lv, "a"));
  t = undoExit(t);
  check("torture: only a back", t.present[idx(lv, "a")] && !t.present[idx(lv, "b")] && t.history.length === 1);
}

/* ---------- replay (resume) */
{
  const lv = L(`a- a> b^\n.. .. b-`);
  check("replay legal", replay(lv, [idx(lv, "b"), idx(lv, "a")]) && isSolved(replay(lv, [idx(lv, "b"), idx(lv, "a")])));
  check("replay illegal order", replay(lv, [idx(lv, "a")]) === null);
  check("replay garbage", replay(lv, ["x"]) === null && replay(lv, null) === null && replay(lv, [7]) === null);
}

/* ---------- hint */
{
  // a and b are both free; c waits on a, nobody waits on b → hint a
  const lv = L(`
    .. a^ .. b^
    .. a- .. b-
    c- c> .. ..
  `);
  const pres = initialState(lv).present;
  const h = bestHint(lv, pres);
  check("hint picks the unlocking car", h === idx(lv, "a"));
  check("hint is legal", canExit(lv, pres, h).ok);
  const after = applyExit(lv, initialState(lv), idx(lv, "a")).present;
  check("hint skips removed/blocked", [idx(lv, "b"), idx(lv, "c")].includes(bestHint(lv, after)));
}

/* ---------- Level 1 exactly as the design asks: A → B → C */
{
  const lv = getLevel(1);
  const v = validateLevel(lv);
  check("level 1 valid", v.ok);
  check("level 1 three cars", lv.vehicles.length === 3);
  const s = initialState(lv);
  const legal = legalMoves(lv, s.present).map((i) => lv.vehicles[i].id);
  check("level 1 only A free", legal.length === 1 && legal[0] === "a");
  const rb = canExit(lv, s.present, idx(lv, "b"));
  const rc = canExit(lv, s.present, idx(lv, "c"));
  check("B blocked by A", !rb.ok && rb.blocker === idx(lv, "a"));
  check("C blocked by B", !rc.ok && rc.blocker === idx(lv, "b"));
  const s1 = applyExit(lv, s, idx(lv, "a"));
  check("after A only B free", JSON.stringify(legalMoves(lv, s1.present).map((i) => lv.vehicles[i].id)) === '["b"]');
  const s2 = applyExit(lv, s1, idx(lv, "b"));
  check("after B only C free", JSON.stringify(legalMoves(lv, s2.present).map((i) => lv.vehicles[i].id)) === '["c"]');
  check("A→B→C solves", isSolved(applyExit(lv, s2, idx(lv, "c"))));
  check("solver finds A,B,C", v.result.solution.join("") === "abc");
}

/* ---------- every level: hint-driven playthrough + undo round-trips */
{
  const { TOTAL_LEVELS } = await import("../data/index.js");
  let hintOk = true;
  let undoOk = true;
  for (let id = 1; id <= TOTAL_LEVELS; id++) {
    const lv = getLevel(id);
    let s = initialState(lv);
    let guard = 0;
    while (!isSolved(s) && guard++ < 200) {
      const h = bestHint(lv, s.present);
      if (h == null || !s.present[h] || !canExit(lv, s.present, h).ok) {
        hintOk = false;
        console.error(`level ${id}: bad hint ${h}`);
        break;
      }
      const next = applyExit(lv, s, h);
      // undo must restore exactly the previous board, then redo the same move
      const u = undoExit(next);
      if (!u || u.restored !== h || u.present.join() !== s.present.join() || u.history.join() !== s.history.join()) undoOk = false;
      s = next;
    }
    if (!isSolved(s)) {
      hintOk = false;
      console.error(`level ${id}: hints did not clear the lot`);
    }
    if (s.history.length !== lv.vehicles.length) hintOk = false;
  }
  check("hints alone clear all 100 levels, never pointing at a blocked or missing car", hintOk);
  check("undo exactly reverses every move on every level", undoOk);
}

/* ---------- save system: corrupt / hostile / idempotent */
{
  const store = new Map();
  globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  const P = await import("../utils/progress.js");
  store.set("parking-jam-progress", "{not json");
  const d = P.loadProgress();
  check("corrupt save → defaults", d.unlockedLevel === 1 && d.completedLevels.length === 0 && d.selectedVehicleSkin === "classic");
  store.set("parking-jam-progress", JSON.stringify({
    unlockedLevel: "lots", completedLevels: [1, 2, "x", 500, 2, -3], starsByLevel: { 1: 3, 2: 7, 3: 2 },
    selectedVehicleSkin: "golden", unlockedSkins: ["golden"], settings: { graphics: "ultra", sound: "yes" },
    statistics: { carsCleared: -10, hintsUsed: 4.7 }, current: { levelId: 50, order: [1] },
  }));
  const h = P.loadProgress();
  check("hostile: only valid completed ids", JSON.stringify(h.completedLevels) === "[1,2]");
  check("hostile: unlock derived from completions", h.unlockedLevel === 3);
  check("hostile: bad stars dropped", h.starsByLevel[1] === 3 && !h.starsByLevel[2] && !h.starsByLevel[3]);
  check("hostile: skins can't be invented", !h.unlockedSkins.includes("golden") && h.selectedVehicleSkin === "classic");
  check("hostile: settings sanitised", h.settings.graphics === "medium" && h.settings.sound === true);
  check("hostile: stats sanitised", h.statistics.carsCleared === 0 && h.statistics.hintsUsed === 4);
  check("hostile: resume beyond unlock dropped", h.current === null);

  let q = P.defaultProgress();
  const r1 = P.applyComplete(q, 1, { stars: 2, mistakes: 3, timeMs: 9000, hints: 1 });
  const r2 = P.applyComplete(r1.progress, 1, { stars: 2, mistakes: 3, timeMs: 9000, hints: 1 });
  check("completion idempotent", JSON.stringify(r1.progress) === JSON.stringify(r2.progress) && r2.newSkins.length === 0);
  const r3 = P.applyComplete(r2.progress, 1, { stars: 1, mistakes: 9, timeMs: 99000, hints: 4 });
  check("stars and best never go down", r3.progress.starsByLevel[1] === 2 && r3.progress.bestResults[1].mistakes === 3);
  check("next level unlocks", r1.progress.unlockedLevel === 2 && q.unlockedLevel === 1);
  let many = P.defaultProgress();
  const got = [];
  for (let id = 1; id <= 10; id++) {
    const r = P.applyComplete(many, id, { stars: 3, mistakes: 0, timeMs: 1, hints: 0 });
    many = r.progress;
    got.push(...r.newSkins);
  }
  check("milestone skins unlock exactly once", JSON.stringify(got) === '["city","sunny"]');
  check("world 2 unlocks at level 20 only", !P.isWorldUnlocked(many, 2));
  const lv1 = getLevel(1);
  check("stars: 3 with no hints and ≤1 blocked", P.starsFor(lv1, 1, 0) === 3 && P.starsFor(lv1, 0, 1) === 2 && P.starsFor(lv1, 4, 0) === 1);
  P.saveProgress(many);
  check("save round-trips", P.loadProgress().completedLevels.length === 10);
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
