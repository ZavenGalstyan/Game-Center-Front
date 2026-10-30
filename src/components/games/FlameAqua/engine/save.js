/**
 * localStorage persistence: highest unlocked level, best time and best gem
 * haul per level, and the sound setting. Reads are defensive — a corrupt or
 * missing save falls back to a fresh one.
 */
export const SAVE_KEY = "flame-aqua-twin-temple-save";
export const LEVEL_COUNT = 40;

const fresh = () => ({ v: 1, unlocked: 1, best: {}, gems: {}, sound: true });

export function loadProgress(store = globalThis.localStorage) {
  try {
    const raw = store?.getItem(SAVE_KEY);
    if (!raw) return fresh();
    const d = JSON.parse(raw);
    const p = fresh();
    if (Number.isFinite(d.unlocked)) p.unlocked = Math.max(1, Math.min(LEVEL_COUNT, Math.floor(d.unlocked)));
    for (let i = 1; i <= LEVEL_COUNT; i++) {
      const b = d.best?.[i];
      if (Number.isFinite(b) && b > 0) p.best[i] = Math.round(b * 100) / 100;
      const g = d.gems?.[i];
      if (Number.isFinite(g) && g >= 0) p.gems[i] = Math.floor(g);
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

/** progress after finishing level `id` in `time` seconds with `gems` collected */
export function recordWin(p, id, time, gems) {
  const n = { ...p, best: { ...p.best }, gems: { ...p.gems } };
  const t = Math.round(time * 100) / 100;
  if (!n.best[id] || t < n.best[id]) n.best[id] = t;
  n.gems[id] = Math.max(n.gems[id] || 0, gems);
  n.unlocked = Math.max(n.unlocked, Math.min(LEVEL_COUNT, id + 1));
  return n;
}

export const isUnlocked = (p, id) => id >= 1 && id <= p.unlocked;
export const isDone = (p, id) => !!p.best[id];

export function fmtTime(t) {
  if (!Number.isFinite(t)) return "--:--";
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s < 10 ? "0" : ""}${s.toFixed(1)}`;
}
