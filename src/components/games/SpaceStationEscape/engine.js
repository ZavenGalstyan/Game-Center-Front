/**
 * Space Station Escape — pure game engine. State is a plain JSON object so
 * it saves to localStorage as-is; every action returns a new state plus a
 * `result` the UI turns into messages, sounds and panels. Puzzle answers are
 * judged here (never in the UI), so tools/simTest.mjs can prove every sector.
 */
import { ITEMS, CLUES, ROOMS, ROOM_ORDER, HOTSPOTS, PUZZLES, STEPS, CIRCUIT, VALVES, GRID_SIZE, GRID_PRESSES, SYMBOLS, O2 } from "./data.js";

export const SAVE_VERSION = 1;

export function newState() {
  return { v: SAVE_VERSION, room: "command", inv: [], f: {}, solved: {}, clues: [], hints: {}, hintsUsed: 0, time: 0, o2: O2.start, depleted: 0, won: false };
}

const clone = (s) => JSON.parse(JSON.stringify(s));
export const has = (s, id) => s.inv.includes(id);
export const unlockedRooms = (s) => ROOM_ORDER.filter((r) => r === "command" || s.f["door_" + r]);

function addClue(s, id) {
  if (CLUES[id] && !s.clues.includes(id)) s.clues.push(id);
}
function apply(s, o) {
  const got = [];
  for (const id of o.take || []) s.inv = s.inv.filter((i) => i !== id);
  for (const id of o.give || []) {
    if (!s.inv.includes(id)) s.inv.push(id);
    got.push(id);
  }
  Object.assign(s.f, o.set || {});
  if (o.clue) addClue(s, o.clue);
  if (o.o2) s.o2 = Math.min(100, Math.max(s.o2, o.o2));
  return got;
}

/** Click a hotspot, optionally with an inventory item selected. */
export function interact(state, hotspotId, item = null) {
  const hs = HOTSPOTS[hotspotId];
  if (!hs || hs.room !== state.room || state.o2 <= 0) return { state, result: { ok: false, say: "" } };
  if (item && !has(state, item)) item = null;
  const o = hs.on(state, item) || {};
  if (item && !o.used) return { state, result: { ok: false, wrongItem: true, sfx: "denied", say: `The ${ITEMS[item].name} doesn't fit here.` } };
  const s = clone(state);
  const got = apply(s, o);
  let travel = null;
  if (o.travel && o.travel !== s.room) {
    s.room = o.travel;
    travel = o.travel;
  }
  return { state: s, result: { ok: true, say: o.say || "", got, puzzle: o.puzzle || null, travel, sfx: o.sfx || (got.length ? "pickup" : null) } };
}

export function travel(state, room) {
  if (!unlockedRooms(state).includes(room) || room === state.room || state.o2 <= 0) return { state, result: { ok: false } };
  return { state: { ...state, room }, result: { ok: true, travel: room } };
}

/** Use a consumable from the inventory on yourself (oxygen canisters). */
export function consume(state, item) {
  const it = ITEMS[item];
  if (!it || !it.o2 || !has(state, item)) return { state, result: { ok: false, sfx: "denied", say: "You can't use that on its own." } };
  if (state.o2 >= 100) return { state, result: { ok: false, sfx: "denied", say: "Your oxygen is already full." } };
  const s = clone(state);
  s.inv = s.inv.filter((i) => i !== item);
  s.o2 = Math.min(100, s.o2 + it.o2);
  return { state: s, result: { ok: true, sfx: "hiss", say: `You crack the canister. Oxygen +${it.o2}%.` } };
}

/* ------------------------------------------------------------- oxygen */
export const drainRate = (s) => (s.f.lifeSupport ? O2.drainRestored : O2.drain);
/** Advance oxygen by `sec` seconds of active play. */
export function tickO2(state, sec) {
  if (state.won || state.o2 <= 0) return state;
  return { ...state, o2: Math.max(0, state.o2 - drainRate(state) * sec) };
}
/** Retry after depletion: all progress is kept, the suit is refilled. */
export function retry(state) {
  return { ...state, o2: O2.start, depleted: state.depleted + 1 };
}

/* ------------------------------------------------------------ circuit */
export const rotMask = (m, r) => {
  for (let i = 0; i < (((r % 4) + 4) % 4); i++) m = ((m << 1) | (m >> 3)) & 15;
  return m;
};
const BASE = { straight: 5, corner: 3, tee: 7, cross: 15, empty: 0 };
const DIRS = [[1, -1, 0, 4], [2, 0, 1, 8], [4, 1, 0, 1], [8, 0, -1, 2]]; // bit, dr, dc, opposite
export function circuitFlow(rots) {
  const { rows, cols, tiles, inRow, outRows } = CIRCUIT;
  const mask = (r, c) => rotMask(BASE[tiles[r][c]], rots[r][c]);
  const lit = Array.from({ length: rows }, () => Array(cols).fill(false));
  const outs = outRows.map(() => false);
  if (!(mask(inRow, 0) & 8)) return { lit, outs, done: false };
  const q = [[inRow, 0]];
  lit[inRow][0] = true;
  while (q.length) {
    const [r, c] = q.shift();
    const m = mask(r, c);
    for (const [bit, dr, dc, opp] of DIRS) {
      if (!(m & bit)) continue;
      const nr = r + dr, nc = c + dc;
      if (nr < 0 || nc < 0 || nr >= rows || nc >= cols || lit[nr][nc]) continue;
      if (!(mask(nr, nc) & opp)) continue;
      lit[nr][nc] = true;
      q.push([nr, nc]);
    }
  }
  outRows.forEach((r, i) => (outs[i] = lit[r][cols - 1] && Boolean(mask(r, cols - 1) & 2)));
  return { lit, outs, done: outs.every(Boolean) };
}

/* ----------------------------------------------------- pressure + grid */
export const pressures = (v) => VALVES.weights.map((w) => w.reduce((a, k, j) => a + k * (v[j] || 0), 0));
export function gridPress(grid, r, c) {
  const g = grid.map((row) => [...row]);
  for (const [dr, dc] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const y = r + dr, x = c + dc;
    if (y >= 0 && x >= 0 && y < GRID_SIZE && x < GRID_SIZE) g[y][x] = !g[y][x];
  }
  return g;
}
export const GRID_START = GRID_PRESSES.reduce((g, [r, c]) => gridPress(g, r, c), Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(false)));
/** Applies a list of [r, c] presses to the start grid. */
export const gridAfter = (presses) => presses.reduce((g, [r, c]) => gridPress(g, r, c), GRID_START);

/* ------------------------------------------------------------- checks */
const same = (a, b) => Array.isArray(a) && a.length === b.length && a.every((x, i) => x === b[i]);
export const CHECKS = {
  terminal: (a) => String(a).trim().toUpperCase() === "ORBIT7",
  circuit: (a) => Array.isArray(a) && circuitFlow(a).done,
  symbols: (a) => same(a, ["◆", "▲", "●", "■"]) && a.every((x) => SYMBOLS.includes(x)),
  pressure: (a) => Array.isArray(a) && a.every((v) => Number.isInteger(v) && v >= 0 && v <= VALVES.max) && same(pressures(a), VALVES.targets),
  grid: (a) => Array.isArray(a) && a.every((p) => Array.isArray(p) && p.length === 2) && gridAfter(a).every((row) => row.every((on) => !on)),
  launch: (a) => String(a) === "2497",
};

export function puzzleReady(state, id) {
  const p = PUZZLES[id];
  if (!p || state.room !== p.room || state.solved[id] || state.o2 <= 0) return false;
  return !p.gate || Boolean(state.f[p.gate]);
}

export function solve(state, id, answer) {
  const p = PUZZLES[id];
  if (!puzzleReady(state, id)) return { state, result: { ok: false } };
  if (!CHECKS[id](answer)) return { state, result: { ok: false, sfx: "denied" } };
  const s = clone(state);
  s.solved[id] = 1;
  const got = apply(s, p.reward);
  if (id === "launch") s.won = true;
  return { state: s, result: { ok: true, say: p.reward.say, got, sfx: "solve" } };
}

/* -------------------------------------------------------------- hints */
export const currentStep = (s) => STEPS.find((st) => !st.done(s)) || null;
export function objective(s) {
  if (s.won) return "You escaped Helios Station.";
  const st = currentStep(s);
  if (!st) return "";
  return st.room === s.room ? st.obj : `Head to the ${ROOMS[st.room].name}.`;
}
export function takeHint(state) {
  const st = currentStep(state);
  if (!st) return { state, hint: null };
  if (st.room !== state.room) return { state, hint: { level: 0, text: `Your next task is in the ${ROOMS[st.room].name}. Open the map to travel there.` } };
  const s = clone(state);
  const prev = s.hints[st.id] || 0;
  const lvl = Math.min(prev + 1, st.hints.length);
  if (lvl > prev) s.hintsUsed++;
  s.hints[st.id] = lvl;
  return { state: s, hint: { level: lvl, max: st.hints.length, text: st.hints[lvl - 1], all: st.hints.slice(0, lvl) } };
}

/* ---------------------------------------------------------- save / load */
export const serialize = (s) => JSON.stringify(s);
export function deserialize(json) {
  try {
    const s = typeof json === "string" ? JSON.parse(json) : json;
    if (!s || s.v !== SAVE_VERSION || !ROOMS[s.room] || !Array.isArray(s.inv)) return null;
    const out = { ...newState(), ...s, f: { ...s.f }, solved: { ...s.solved }, hints: { ...s.hints } };
    out.inv = out.inv.filter((i) => ITEMS[i]);
    out.clues = (out.clues || []).filter((c) => CLUES[c]);
    out.o2 = Number.isFinite(out.o2) ? Math.max(0, Math.min(100, out.o2)) : O2.start;
    if (!unlockedRooms(out).includes(out.room)) out.room = "command";
    return out;
  } catch {
    return null;
  }
}
