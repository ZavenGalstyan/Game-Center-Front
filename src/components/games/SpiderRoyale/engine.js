/**
 * Spider Royale rules engine — pure functions over plain JSON state.
 *
 * Cards are integer ids 0..103 into `state.deck` ({ s: suit, r: rank 1..13 }).
 * Each tableau column is an id array (bottom → top); `down[c]` counts the
 * face-down cards at the bottom of column c (they are always contiguous).
 * Arrays are never mutated in place, so Undo snapshots can share them.
 */
export const SUITS = ["S", "H", "C", "D"];
export const RANKS = ["", "A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
export const DIFFICULTIES = {
  easy: { label: "Easy", suits: 1, time: 10 * 60 },
  medium: { label: "Medium", suits: 2, time: 20 * 60 },
  hard: { label: "Hard", suits: 4, time: 30 * 60 },
};
export const MODES = { classic: { label: "Classic" }, timed: { label: "Timed Challenge" } };
export const RUN_BONUS_MS = 30000; // Timed Challenge: +30 s per completed sequence
const HISTORY_CAP = 400;

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 104 cards: 8 full King→Ace suits drawn from the first `suits` suits. */
export function makeDeck(suits) {
  const deck = [];
  for (let k = 0; k < 8; k++) for (let r = 1; r <= 13; r++) deck.push({ s: SUITS[k % suits], r });
  return deck;
}

export function newGame({ difficulty = "medium", mode = "classic", seed } = {}) {
  seed = seed ?? Math.floor(Math.random() * 2 ** 31);
  const deck = makeDeck(DIFFICULTIES[difficulty].suits);
  const order = deck.map((_, i) => i);
  const rand = rng(seed);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const cols = Array.from({ length: 10 }, () => []);
  for (let i = 0; i < 54; i++) cols[i % 10].push(order[i]); // 6,6,6,6,5,5,5,5,5,5
  return {
    v: 1, seed, difficulty, mode, deck, cols,
    down: cols.map((c) => c.length - 1),
    stock: order.slice(54),
    done: [], moves: 0, score: 500, bonus: 0, history: [],
    elapsed: 0, since: null, paused: false, won: false, lost: false, timeBonus: 0,
    last: null,
  };
}

const rank = (s, id) => s.deck[id].r;
const suit = (s, id) => s.deck[id].s;
const top = (s, c) => s.cols[c][s.cols[c].length - 1];

/** Can the cards from index i to the top of column c move as one unit? */
export function movable(s, c, i) {
  const col = s.cols[c];
  if (i < s.down[c] || i >= col.length) return false;
  for (let j = i + 1; j < col.length; j++) {
    if (suit(s, col[j]) !== suit(s, col[j - 1]) || rank(s, col[j]) !== rank(s, col[j - 1]) - 1) return false;
  }
  return true;
}

/** Lowest index of the movable run on top of column c (or -1 when empty). */
export function runStart(s, c) {
  const col = s.cols[c];
  if (!col.length) return -1;
  let i = col.length - 1;
  while (i > s.down[c] && suit(s, col[i - 1]) === suit(s, col[i]) && rank(s, col[i - 1]) === rank(s, col[i]) + 1) i--;
  return i;
}

export function canDrop(s, c, i, to) {
  if (to === c || !movable(s, c, i)) return false;
  return !s.cols[to].length || rank(s, top(s, to)) === rank(s, s.cols[c][i]) + 1;
}

export function targets(s, c, i) {
  return s.cols.map((_, to) => to).filter((to) => canDrop(s, c, i, to));
}

/** Why dealing is blocked, or null when the stock can be dealt. */
export function dealBlock(s) {
  if (!s.stock.length) return "The stock is empty.";
  if (s.cols.some((c) => !c.length)) return "Fill every empty column before dealing.";
  return null;
}

const snap = (s) => ({ cols: s.cols, down: s.down, stock: s.stock, done: s.done, score: s.score, bonus: s.bonus });
const pushHistory = (s) => [...s.history, snap(s)].slice(-HISTORY_CAP);

/** Remove completed K→A same-suit runs from `which` columns and flip exposed cards. */
function settle(s, cols, down, which) {
  cols = cols.slice();
  down = down.slice();
  const done = s.done.slice();
  const removed = [];
  const flipped = [];
  for (const c of which) {
    let col = cols[c];
    const n = col.length;
    if (n >= 13 && n - 13 >= down[c] && rank(s, col[n - 1]) === 1) {
      const run = col.slice(n - 13);
      if (run.every((id, k) => rank(s, id) === 13 - k && suit(s, id) === suit(s, run[0]))) {
        col = col.slice(0, n - 13);
        cols[c] = col;
        done.push(suit(s, run[0]));
        removed.push({ col: c, ids: run, base: n - 13 });
      }
    }
    if (col.length && down[c] >= col.length) {
      down[c] = col.length - 1;
      flipped.push(col[col.length - 1]);
    }
  }
  return { cols, down, done, removed, flipped };
}

function finish(s, next, kind, extra = {}) {
  const runs = next.done.length - s.done.length;
  const out = {
    ...s, ...next, history: pushHistory(s), moves: s.moves + 1,
    score: s.score - 1 + 100 * Math.max(0, runs),
    bonus: s.bonus + (s.mode === "timed" ? RUN_BONUS_MS * Math.max(0, runs) : 0),
    last: { kind, ...extra, removed: next.removed, flipped: next.flipped },
  };
  delete out.removed;
  delete out.flipped;
  if (out.done.length === 8) out.won = true;
  return out;
}

export function move(s, c, i, to) {
  if (s.won || s.lost || !canDrop(s, c, i, to)) return null;
  const cols = s.cols.slice();
  const run = cols[c].slice(i);
  cols[c] = cols[c].slice(0, i);
  cols[to] = [...cols[to], ...run];
  return finish(s, settle(s, cols, s.down, [to, c]), "move", { ids: run, from: c, to });
}

export function deal(s) {
  if (s.won || s.lost || dealBlock(s)) return null;
  const dealt = s.stock.slice(0, 10);
  const cols = s.cols.map((col, c) => [...col, dealt[c]]);
  const next = settle({ ...s, stock: s.stock.slice(10) }, cols, s.down, cols.map((_, c) => c));
  return finish(s, { ...next, stock: s.stock.slice(10) }, "deal", { ids: dealt });
}

/** Restores the board exactly as before the last action; costs one move / point. */
export function undo(s) {
  if (!s.history.length || s.won || s.lost) return null;
  const prev = s.history[s.history.length - 1];
  return { ...s, ...prev, score: prev.score - 1, history: s.history.slice(0, -1), moves: s.moves + 1, last: { kind: "undo" } };
}

/** Every legal move: { from, i, to }. */
export function allMoves(s) {
  const out = [];
  s.cols.forEach((col, c) => {
    const start = runStart(s, c);
    if (start < 0) return;
    for (let i = col.length - 1; i >= start; i--) for (const to of targets(s, c, i)) out.push({ from: c, i, to });
  });
  return out;
}

/**
 * Hint candidates, best first. Legal moves only; moves that change nothing
 * (a run already resting on its own suit, a whole column into an empty one)
 * are left out. Ends with a deal suggestion when the stock can be dealt.
 */
export function hints(s) {
  const scored = [];
  for (const m of allMoves(s)) {
    const col = s.cols[m.from];
    const id = col[m.i];
    const below = m.i - 1;
    const empties = !s.cols[m.to].length;
    const reveals = m.i === s.down[m.from] && s.down[m.from] > 0;
    if (empties && m.i === 0) continue;
    const restsOnSuit = below >= s.down[m.from] && below >= 0 && rank(s, col[below]) === rank(s, id) + 1;
    const sameSuit = !empties && suit(s, top(s, m.to)) === suit(s, id);
    if (restsOnSuit && (suit(s, col[below]) === suit(s, id) || !sameSuit)) continue;
    let score = (sameSuit ? 30 : 10) + (reveals ? 20 : 0) + (m.i === 0 ? 15 : 0) - (empties ? 25 : 0);
    if (m.i !== runStart(s, m.from) && !sameSuit) score -= 8; // splitting a run for a mixed-suit landing
    scored.push({ ...m, score: score + (s.cols[m.to].length ? s.cols[m.to].length / 100 : 0) });
  }
  scored.sort((a, b) => b.score - a.score);
  if (!dealBlock(s)) scored.push({ deal: true });
  return scored;
}

export const stuck = (s) => !s.won && !s.lost && !s.stock.length && allMoves(s).length === 0;

// ---- clock ----
export const timeOf = (s, now = Date.now()) => s.elapsed + (s.since != null ? now - s.since : 0);
export const limitOf = (s) => DIFFICULTIES[s.difficulty].time * 1000 + s.bonus;
export const remainingOf = (s, now) => Math.max(0, limitOf(s) - timeOf(s, now));
export const start = (s, now = Date.now()) => (s.since == null && !s.paused && !s.won && !s.lost ? { ...s, since: now } : s);
export const pause = (s, now = Date.now()) => (s.won || s.lost ? s : { ...s, paused: true, elapsed: timeOf(s, now), since: null });
export const resume = (s) => ({ ...s, paused: false });
export function stop(s, now = Date.now()) {
  const elapsed = timeOf(s, now);
  if (s.mode === "timed" && s.won) {
    const left = Math.max(0, limitOf(s) - elapsed);
    const timeBonus = Math.floor(left / 1000) * 2;
    return { ...s, elapsed, since: null, timeBonus, score: s.score + timeBonus };
  }
  return { ...s, elapsed, since: null };
}
export const expire = (s, now = Date.now()) => ({ ...s, elapsed: Math.min(timeOf(s, now), limitOf(s)), since: null, lost: true });

export function formatTime(ms) {
  const t = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
}

/** Sanity-checks a saved game before restoring it. */
export function validSave(s) {
  try {
    if (s?.v !== 1 || !DIFFICULTIES[s.difficulty] || !MODES[s.mode] || s.won || s.lost) return false;
    if (s.cols.length !== 10 || s.down.length !== 10 || s.deck.length !== 104) return false;
    const ids = [...s.cols.flat(), ...s.stock];
    return ids.length === 104 - 13 * s.done.length && new Set(ids).size === ids.length && s.cols.every((c, i) => s.down[i] <= Math.max(0, c.length - 1));
  } catch {
    return false;
  }
}
