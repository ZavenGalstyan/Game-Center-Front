/**
 * Archery Master 3D — pure level-run rules: shots, objectives, failure,
 * stars and saved progress. Immutable updates so React can hold a run.
 */
import { LEVEL_COUNT } from "./levels.js";

export function newRun(level) {
  return { arrowsLeft: level.arrows, shots: [], score: 0, gold: 0, perfects: 0, hit: level.targets.map(() => 0), over: false, passed: false };
}

/** Record one resolved shot (`impact` from stepArrow). */
export function recordShot(run, level, impact) {
  const onTarget = impact.kind === "target";
  const score = onTarget ? impact.score : 0;
  const hit = run.hit.slice();
  if (onTarget) hit[impact.index]++;
  const next = {
    ...run,
    arrowsLeft: run.arrowsLeft - 1,
    shots: [...run.shots, { kind: impact.kind, score, index: onTarget ? impact.index : -1, perfect: !!impact.perfect }],
    score: run.score + score,
    gold: run.gold + (score >= 9 ? 1 : 0),
    perfects: run.perfects + (onTarget && impact.perfect ? 1 : 0),
    hit,
  };
  const st = status(next, level);
  if (next.arrowsLeft <= 0 || st.impossible) {
    next.over = true;
    next.passed = st.met;
  }
  return next;
}

/** Per-condition progress, whether everything is met, and whether it can still be. */
export function status(run, level) {
  const o = level.objective;
  const left = run.arrowsLeft;
  const parts = [];
  if (o.all) {
    const done = run.hit.filter((h) => h > 0).length;
    parts.push({ key: "all", done, need: level.targets.length, ok: done >= level.targets.length, possible: level.targets.length - done <= left });
  }
  if (o.score) parts.push({ key: "score", done: run.score, need: o.score, ok: run.score >= o.score, possible: run.score + left * 10 >= o.score });
  if (o.gold) parts.push({ key: "gold", done: run.gold, need: o.gold, ok: run.gold >= o.gold, possible: run.gold + left >= o.gold });
  const met = parts.every((p) => p.ok);
  // all conditions together: arrows can serve several at once, so only flag
  // a single unreachable condition as impossible
  const impossible = !met && parts.some((p) => !p.possible);
  return { parts, met, impossible };
}

export function starsFor(run, level) {
  if (!run.passed) return 0;
  const [two, three] = level.stars;
  return run.score >= three ? 3 : run.score >= two ? 2 : 1;
}

/* ---------------------------------------------------------------- progress */
export const STORE_KEY = "archery-master-3d-progress";
export const DEFAULT_PROGRESS = { unlocked: 1, stars: {}, best: {}, champion: false, last: 1 };

export function loadProgress(storage) {
  try {
    const raw = JSON.parse(storage.getItem(STORE_KEY) || "null");
    if (!raw || typeof raw !== "object") return { ...DEFAULT_PROGRESS };
    const unlocked = Math.max(1, Math.min(LEVEL_COUNT, Number(raw.unlocked) || 1));
    return {
      unlocked,
      stars: raw.stars && typeof raw.stars === "object" ? raw.stars : {},
      best: raw.best && typeof raw.best === "object" ? raw.best : {},
      champion: !!raw.champion,
      last: Math.max(1, Math.min(unlocked, Number(raw.last) || 1)),
    };
  } catch {
    return { ...DEFAULT_PROGRESS };
  }
}

export function saveProgress(storage, p) {
  try {
    storage.setItem(STORE_KEY, JSON.stringify(p));
  } catch {
    /* storage blocked — progress just won't persist */
  }
}

/** Fold a finished run into saved progress. Stars and best score only ever improve. */
export function applyResult(p, level, run) {
  const stars = starsFor(run, level);
  const id = level.id;
  const prevStars = p.stars[id] || 0;
  const prevBest = p.best[id] || 0;
  const next = {
    ...p,
    stars: { ...p.stars, [id]: Math.max(prevStars, stars) },
    best: run.passed ? { ...p.best, [id]: Math.max(prevBest, run.score) } : p.best,
    last: id,
  };
  if (run.passed && id < LEVEL_COUNT) next.unlocked = Math.max(p.unlocked, id + 1);
  if (run.passed && id === LEVEL_COUNT) next.champion = true;
  if (!next.stars[id]) delete next.stars[id];
  return { progress: next, stars, newBest: run.passed && run.score > prevBest, improved: stars > prevStars, firstClear: run.passed && prevStars === 0 };
}

export const totalStars = (p) => Object.values(p.stars).reduce((a, b) => a + (b || 0), 0);
export const worldStars = (p, w) => {
  let s = 0;
  for (let id = w * 10 + 1; id <= w * 10 + 10; id++) s += p.stars[id] || 0;
  return s;
};
