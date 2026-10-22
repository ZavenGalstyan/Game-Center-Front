/**
 * Neon Circuit session logic (pure, no React): saved progress, Time
 * Challenge runs and a pausable clock. Tested by tools/sessionTest.mjs.
 */
import * as E from "./engine.js";
import { LEVELS } from "./levels.js";

export const SAVE_KEY = "neon-circuit-progress";
export const TIERS = [
  { id: "easy", name: "Easy" },
  { id: "medium", name: "Medium" },
  { id: "hard", name: "Hard" },
];
/** Time Challenge: solve every circuit before the clock runs out. specs = [grid, min optimum, max optimum]. */
export const CHALLENGES = {
  easy: { name: "Spark", time: 90, specs: [[3, 2, 4], [3, 3, 5], [4, 3, 5], [4, 4, 6], [3, 4, 6]] },
  medium: { name: "Surge", time: 150, specs: [[4, 4, 6], [5, 5, 7], [4, 5, 7], [5, 6, 8], [5, 7, 9]] },
  hard: { name: "Overload", time: 240, specs: [[5, 7, 9], [5, 8, 10], [5, 9, 11], [5, 10, 12], [5, 10, 13]] },
};
export const HINT_PENALTY = 10000;

export const DEFAULT = { unlocked: 0, stars: {}, best: {}, time: {}, ch: {}, preview: true, fx: true };
export function normalize(raw) {
  const p = { ...DEFAULT, ...(raw && typeof raw === "object" ? raw : {}) };
  for (const k of ["stars", "best", "time", "ch"]) if (!p[k] || typeof p[k] !== "object") p[k] = {};
  p.unlocked = Math.min(LEVELS.length - 1, Math.max(0, p.unlocked | 0));
  return p;
}

export const levelPuzzle = (i) => ({ n: LEVELS[i][0], board: LEVELS[i][1], opt: LEVELS[i][2], tier: LEVELS[i][3] });
export const nextUnsolved = (p) => {
  for (let i = 0; i <= p.unlocked; i++) if (!p.stars[i]) return i;
  return p.unlocked;
};

/** Record a Classic win. Returns { prog, result }. */
export function recordLevel(p, lvl, moves, ms) {
  ms = Math.round(ms);
  const { opt } = levelPuzzle(lvl);
  const st = E.stars(moves, opt);
  const best = Math.min(p.best[lvl] ?? Infinity, moves);
  const time = Math.min(p.time[lvl] ?? Infinity, ms);
  return {
    prog: {
      ...p,
      unlocked: Math.max(p.unlocked, Math.min(LEVELS.length - 1, lvl + 1)),
      stars: { ...p.stars, [lvl]: Math.max(p.stars[lvl] ?? 0, st) },
      best: { ...p.best, [lvl]: best },
      time: { ...p.time, [lvl]: time },
    },
    result: { moves, opt, stars: st, ms, best, bestTime: time, newBest: moves < (p.best[lvl] ?? Infinity), newTime: ms < (p.time[lvl] ?? Infinity), last: lvl === LEVELS.length - 1 },
  };
}

/** A fresh Time Challenge run: one generated, GF(2)-verified puzzle per spec. */
export function makeRun(tier, rand = Math.random) {
  return CHALLENGES[tier].specs.map(([n, lo, hi]) => E.generate(n, lo, hi, rand) ?? E.generate(n, 2, hi, rand));
}
export const timeLeft = (tier, elapsed) => Math.max(0, CHALLENGES[tier].time * 1000 - elapsed);
export const challengeStars = (left, tier) => {
  const f = left / (CHALLENGES[tier].time * 1000);
  return f >= 0.5 ? 3 : f >= 0.25 ? 2 : 1;
};
/** Record a completed challenge (elapsed includes hint penalties). */
export function recordChallenge(p, tier, elapsed) {
  elapsed = Math.round(elapsed);
  const left = timeLeft(tier, elapsed), st = challengeStars(left, tier), prev = p.ch[tier];
  const better = !prev || elapsed < prev.ms;
  return {
    prog: { ...p, ch: { ...p.ch, [tier]: { ms: better ? elapsed : prev.ms, stars: Math.max(prev?.stars ?? 0, st), wins: (prev?.wins ?? 0) + 1 } } },
    result: { ms: elapsed, left, stars: st, best: better ? elapsed : prev.ms, newTime: better },
  };
}

/** Pausable stopwatch; `now` is injected so it can be tested. */
export function createClock() {
  let acc = 0, since = null;
  return {
    start(now) { if (since == null) since = now; },
    stop(now) { if (since != null) (acc += now - since), (since = null); },
    add(ms) { acc += ms; },
    /** Back to 0; a running clock keeps running from `now`. */
    reset(now) { acc = 0; if (since != null) since = now; },
    running: () => since != null,
    elapsed: (now) => acc + (since == null ? 0 : now - since),
  };
}

export const fmt = (ms) => {
  const s = Math.max(0, Math.ceil(ms / 1000 - 1e-9));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
export const fmtExact = (ms) => {
  const s = Math.max(0, ms) / 1000;
  return s < 60 ? `${s.toFixed(1)}s` : `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, "0")}`;
};
