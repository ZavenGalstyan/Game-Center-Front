/**
 * localStorage persistence: highest unlocked level, best score and stars per
 * level, and settings. Every read is defensive — a corrupt or missing save
 * falls back to a fresh one.
 */
export const SAVE_KEY = "jungle-dash-island-adventure-save";
export const LEVEL_COUNT = 6;
export const DEFAULT_SETTINGS = { sound: true, touch: "auto", shadows: true };

const fresh = () => ({ v: 1, unlocked: 1, best: {}, stars: {}, beaten: false, settings: { ...DEFAULT_SETTINGS } });

export function loadProgress(store = globalThis.localStorage) {
  try {
    const raw = store?.getItem(SAVE_KEY);
    if (!raw) return fresh();
    const d = JSON.parse(raw);
    const p = fresh();
    if (Number.isFinite(d.unlocked)) p.unlocked = Math.max(1, Math.min(LEVEL_COUNT, Math.floor(d.unlocked)));
    for (let i = 1; i <= LEVEL_COUNT; i++) {
      const b = d.best?.[i];
      if (Number.isFinite(b) && b >= 0) p.best[i] = Math.round(b);
      const s = d.stars?.[i];
      if (Number.isFinite(s) && s > 0) p.stars[i] = Math.max(1, Math.min(3, Math.round(s)));
    }
    p.beaten = !!d.beaten;
    const s = d.settings;
    if (s && typeof s === "object") {
      p.settings.sound = s.sound !== false;
      p.settings.shadows = s.shadows !== false;
      if (["auto", "on", "off"].includes(s.touch)) p.settings.touch = s.touch;
    }
    return p;
  } catch {
    return fresh();
  }
}

export function saveProgress(p, store = globalThis.localStorage) {
  try {
    store?.setItem(SAVE_KEY, JSON.stringify(p));
  } catch {
    /* storage full / blocked — progress just isn't kept */
  }
}

/** new progress after finishing a level with `result` ({level, score, stars}) */
export function recordResult(p, r) {
  const n = { ...p, best: { ...p.best }, stars: { ...p.stars } };
  if (!n.best[r.level] || r.score > n.best[r.level]) n.best[r.level] = r.score;
  n.stars[r.level] = Math.max(n.stars[r.level] || 0, r.stars);
  n.unlocked = Math.max(n.unlocked, Math.min(LEVEL_COUNT, r.level + 1));
  if (r.level === LEVEL_COUNT) n.beaten = true;
  return n;
}

export const levelUnlocked = (p, id) => id >= 1 && id <= p.unlocked;
export const isNewBest = (p, r) => !p.best[r.level] || r.score > p.best[r.level];

export function resetProgress(store = globalThis.localStorage) {
  try {
    store?.removeItem(SAVE_KEY);
  } catch {
    /* ignore */
  }
  return fresh();
}
