/**
 * Shadow Runner — progress + settings in localStorage (`shadow-runner-progress`).
 * Every read/write is guarded: private windows / blocked storage just mean
 * nothing is remembered.
 */
const KEY = "shadow-runner-progress";

export const DEFAULT_SETTINGS = { music: true, sfx: true, effects: true, shake: true, touch: "auto" };

export function loadProgress() {
  const base = { v: 1, unlocked: 1, levels: {}, settings: { ...DEFAULT_SETTINGS }, last: 1 };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return base;
    const d = JSON.parse(raw);
    return {
      ...base,
      unlocked: Math.max(1, Math.min(40, Number(d.unlocked) || 1)),
      levels: d.levels && typeof d.levels === "object" ? d.levels : {},
      settings: { ...DEFAULT_SETTINGS, ...(d.settings || {}) },
      last: Number(d.last) || 1,
    };
  } catch {
    return base;
  }
}

export function saveProgress(p) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* storage blocked */
  }
}

/** Merge a finished run; returns { progress, record } where record says what improved. */
export function recordRun(progress, L, { time, coins, stars }) {
  const prev = progress.levels[L.id] || { stars: 0, best: null, coins: 0 };
  const next = {
    stars: Math.max(prev.stars || 0, stars),
    best: prev.best == null ? time : Math.min(prev.best, time),
    coins: Math.max(prev.coins || 0, coins),
  };
  const out = {
    ...progress,
    unlocked: Math.min(40, Math.max(progress.unlocked, L.id + 1)),
    levels: { ...progress.levels, [L.id]: next },
    last: Math.min(40, L.id + 1),
  };
  return { progress: out, record: { newBest: prev.best == null || time < prev.best, prevBest: prev.best, prevStars: prev.stars || 0 } };
}

export function totals(progress) {
  let stars = 0;
  let coins = 0;
  for (const k of Object.keys(progress.levels)) {
    stars += progress.levels[k].stars || 0;
    coins += progress.levels[k].coins || 0;
  }
  return { stars, coins };
}
