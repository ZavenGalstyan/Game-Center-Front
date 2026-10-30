/**
 * localStorage persistence: highest unlocked level, best score and best star
 * count per level, and the sound setting. Reads are defensive — a corrupt or
 * missing save falls back to a fresh one.
 */
export const SAVE_KEY = "feather-fury-island-siege-save";
export const LEVEL_COUNT = 50;

const fresh = () => ({ v: 1, unlocked: 1, best: {}, stars: {}, sound: true });

export function loadProgress(store = globalThis.localStorage) {
  try {
    const raw = store?.getItem(SAVE_KEY);
    if (!raw) return fresh();
    const d = JSON.parse(raw);
    const p = fresh();
    if (Number.isFinite(d.unlocked)) p.unlocked = Math.max(1, Math.min(LEVEL_COUNT, Math.floor(d.unlocked)));
    for (let i = 1; i <= LEVEL_COUNT; i++) {
      const b = d.best?.[i];
      if (Number.isFinite(b) && b >= 0) p.best[i] = Math.floor(b);
      const s = d.stars?.[i];
      if (Number.isFinite(s) && s >= 1) p.stars[i] = Math.min(3, Math.floor(s));
    }
    p.sound = d.sound !== false;
    return p;
  } catch {
    return fresh();
  }
}

export function saveProgress(p, store = globalThis.localStorage) {
  try {
    store?.setItem(SAVE_KEY, JSON.stringify(p));
  } catch {
    /* storage full / blocked — progress just isn't kept this session */
  }
}

/** progress after winning level `id` with `score` points and `stars` stars */
export function recordWin(p, id, score, stars) {
  const n = { ...p, best: { ...p.best }, stars: { ...p.stars } };
  n.best[id] = Math.max(n.best[id] || 0, Math.floor(score));
  n.stars[id] = Math.max(n.stars[id] || 0, stars);
  n.unlocked = Math.max(n.unlocked, Math.min(LEVEL_COUNT, id + 1));
  return n;
}

export const isUnlocked = (p, id) => id >= 1 && id <= p.unlocked;
export const isDone = (p, id) => !!p.stars[id];
export const totalStars = (p) => Object.values(p.stars).reduce((s, n) => s + n, 0);
