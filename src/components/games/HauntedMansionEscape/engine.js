/**
 * Haunted Mansion Escape — pure game engine. State is a plain JSON object so
 * it saves to localStorage as-is; every action returns a new state plus a
 * `result` the UI turns into messages, sounds and modals. Puzzle answers are
 * judged here (never in the UI), so tools/simTest.mjs can prove every room.
 */
import { ITEMS, RECIPES, CLUES, ROOMS, ROOM_ORDER, HOTSPOTS, PUZZLES, STEPS, CIRCUIT, BOOK_COLORS, LULLABY, GALLERY, GEAR_SYMBOLS, GEAR_TARGET, GEAR_LINKS, DINING_SEATS, ALTAR_SOCKETS } from "./data.js";

export const SAVE_VERSION = 1;

export function newState() {
  return { v: SAVE_VERSION, room: "hall", inv: [], f: {}, solved: {}, clues: [], hints: {}, hintsUsed: 0, time: 0, won: false, log: [] };
}

const clone = (s) => JSON.parse(JSON.stringify(s));
export const has = (s, id) => s.inv.includes(id);
export const unlockedRooms = (s) => ROOM_ORDER.filter((r) => r === "hall" || s.f["door_" + r]);

/** Applies an outcome object (from a hotspot or puzzle reward) to a cloned state. */
function apply(s, o) {
  const got = [];
  for (const id of o.take || []) s.inv = s.inv.filter((i) => i !== id);
  for (const id of o.give || []) {
    if (!s.inv.includes(id)) s.inv.push(id);
    got.push(id);
    if (ITEMS[id].clue) addClue(s, ITEMS[id].clue);
  }
  Object.assign(s.f, o.set || {});
  if (o.clue) addClue(s, o.clue);
  if (o.say) s.log = [...s.log.slice(-19), o.say];
  return got;
}
function addClue(s, id) {
  if (CLUES[id] && !s.clues.includes(id)) s.clues.push(id);
}

/**
 * Click a hotspot, optionally with an inventory item selected.
 * result: { ok, say, got[], puzzle, travel, sfx, wrongItem }
 */
export function interact(state, hotspotId, item = null) {
  const hs = HOTSPOTS[hotspotId];
  if (!hs || hs.room !== state.room) return { state, result: { ok: false, say: "" } };
  if (item && !has(state, item)) item = null;
  const o = hs.on(state, item) || {};
  if (item && !o.used) {
    return { state, result: { ok: false, wrongItem: true, sfx: "wrong", say: `The ${ITEMS[item].name} doesn't help here.` } };
  }
  const s = clone(state);
  const got = apply(s, o);
  let travel = null;
  if (o.travel && o.travel !== s.room) {
    s.room = o.travel;
    travel = o.travel;
  }
  return { state: s, result: { ok: true, say: o.say || "", got, puzzle: o.puzzle || null, travel, sfx: o.sfx || (got.length ? "pickup" : null) } };
}

/** Travel via the map to an already-unlocked room. */
export function travel(state, room) {
  if (!unlockedRooms(state).includes(room) || room === state.room) return { state, result: { ok: false } };
  return { state: { ...state, room }, result: { ok: true, travel: room } };
}

export function combine(state, a, b) {
  const r = RECIPES.find((x) => (x.a === a && x.b === b) || (x.a === b && x.b === a));
  if (!r || !has(state, a) || !has(state, b)) return { state, result: { ok: false, sfx: "wrong", say: "Those don't go together." } };
  const s = clone(state);
  s.inv = s.inv.filter((i) => i !== a && i !== b);
  s.inv.push(r.make);
  s.f.mended = 1;
  if (ITEMS[r.make].clue) addClue(s, ITEMS[r.make].clue);
  return { state: s, result: { ok: true, say: r.say, got: [r.make], sfx: "pickup" } };
}

/* ------------------------------------------------------------ circuit */
export const rotMask = (m, r) => {
  for (let i = 0; i < (((r % 4) + 4) % 4); i++) m = ((m << 1) | (m >> 3)) & 15;
  return m;
};
const BASE = { straight: 5, corner: 3, tee: 7, cross: 15, empty: 0 };
const DIRS = [[1, -1, 0, 4], [2, 0, 1, 8], [4, 1, 0, 1], [8, 0, -1, 2]]; // bit, dr, dc, opposite
/** Cells reached by power from the dynamo, and whether it reaches the house line. */
export function circuitFlow(rots) {
  const { rows, cols, tiles, inRow, outRow } = CIRCUIT;
  const mask = (r, c) => rotMask(BASE[tiles[r][c]], rots[r][c]);
  const lit = Array.from({ length: rows }, () => Array(cols).fill(false));
  if (!(mask(inRow, 0) & 8)) return { lit, done: false };
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
  return { lit, done: lit[outRow][cols - 1] && Boolean(mask(outRow, cols - 1) & 2) };
}

/* ------------------------------------------------------------- checks */
const same = (a, b) => Array.isArray(a) && a.length === b.length && a.every((x, i) => x === b[i]);
export const gearsAfter = (start, presses) => {
  const r = [...start];
  presses.forEach((lever) => GEAR_LINKS[lever].forEach((i) => (r[i] = (r[i] + 1) % GEAR_SYMBOLS.length)));
  return r;
};
export const CHECKS = {
  clock: (a) => a && a.h % 12 === 9 && a.m === 15,
  books: (a) => same(a, ["red", "blue", "green", "gold", "black"]) && BOOK_COLORS.every((c) => a.includes(c)),
  dining: (a) => a && a.crown === "goblet" && a.rose === "bell" && a.moon === "teacup" && a.star === "candlestick" && DINING_SEATS.every((k) => a[k]),
  musicbox: (a) => same(a, ["moon", "rose", "bird"]),
  safe: (a) => String(a) === "1864",
  piano: (a) => Array.isArray(a) && same(a.slice(-LULLABY.length), LULLABY),
  circuit: (a) => Array.isArray(a) && circuitFlow(a).done,
  gallery: (a) => same(a, GALLERY.map((p) => p.id)),
  gears: (a) => same(a, GEAR_TARGET),
  altar: (a) => a && a.crown === "signetRing" && a.rose === "roseBrooch" && a.moon === "locket" && a.star === "compass" && ALTAR_SOCKETS.every((k) => a[k]),
  exit: (a) => String(a).toUpperCase() === "CLARA",
};

/** Can this puzzle be attempted now? (room, not already solved, items in hand) */
export function puzzleReady(state, id) {
  const p = PUZZLES[id];
  if (!p || p.reveal || state.room !== p.room || state.solved[id]) return false;
  if (p.gate && !state.f[p.gate]) return false;
  return !p.needs || p.needs.every((i) => has(state, i));
}

export function solve(state, id, answer) {
  const p = PUZZLES[id];
  if (!puzzleReady(state, id) || p.reveal) return { state, result: { ok: false } };
  if (!CHECKS[id](answer)) return { state, result: { ok: false, sfx: "wrong" } };
  const s = clone(state);
  s.solved[id] = 1;
  const got = apply(s, p.reward);
  if (id === "exit") s.won = true;
  return { state: s, result: { ok: true, say: p.reward.say, got, sfx: "solve" } };
}

/* -------------------------------------------------------------- hints */
export const currentStep = (s) => STEPS.find((st) => !st.done(s)) || null;
export function objective(s) {
  if (s.won) return "You escaped Ashcroft Hall.";
  const st = currentStep(s);
  if (!st) return "";
  return st.room === s.room ? st.obj : `Head to the ${ROOMS[st.room].name}.`;
}
/** Reveals the next hint level for the current step (or a "go to" hint when elsewhere). */
export function takeHint(state) {
  const st = currentStep(state);
  if (!st) return { state, hint: null };
  if (st.room !== state.room) {
    return { state, hint: { level: 0, text: `Your next task is in the ${ROOMS[st.room].name}. Open the map to travel there.` } };
  }
  const s = clone(state);
  const lvl = Math.min((s.hints[st.id] || 0) + 1, st.hints.length);
  if (lvl > (s.hints[st.id] || 0)) s.hintsUsed++;
  s.hints[st.id] = lvl;
  return { state: s, hint: { level: lvl, max: st.hints.length, text: st.hints[lvl - 1], all: st.hints.slice(0, lvl) } };
}

/* ---------------------------------------------------------- save / load */
export function serialize(s) {
  return JSON.stringify(s);
}
export function deserialize(json) {
  try {
    const s = typeof json === "string" ? JSON.parse(json) : json;
    if (!s || s.v !== SAVE_VERSION || !ROOMS[s.room] || !Array.isArray(s.inv)) return null;
    const base = newState();
    const out = { ...base, ...s, f: { ...s.f }, solved: { ...s.solved }, hints: { ...s.hints } };
    out.inv = out.inv.filter((i) => ITEMS[i]);
    out.clues = (out.clues || []).filter((c) => CLUES[c]);
    if (!unlockedRooms(out).includes(out.room)) out.room = "hall";
    return out;
  } catch {
    return null;
  }
}
