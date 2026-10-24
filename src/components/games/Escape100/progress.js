/**
 * Escape 100 — saved progress (`escape100-progress`). Pure functions, so the
 * rules are tested headlessly (tools/progressTest.mjs). Anything malformed in
 * the stored JSON is dropped and replaced with defaults.
 */
export const SAVE_KEY = "escape100-progress";
export const COUNT = 100;
export const SETTINGS = { quality: "medium", master: 0.8, sfx: 0.9, amb: 0.5, muted: false, sens: 1 };

const num = (v, lo, hi, d) => (typeof v === "number" && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d);

export function normalize(raw) {
  const p = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const done = {};
  if (p.done && typeof p.done === "object")
    for (const [k, v] of Object.entries(p.done)) {
      const i = +k;
      if (Number.isInteger(i) && i >= 1 && i <= COUNT && v && typeof v === "object") done[i] = { hints: num(v.hints, 0, 99, 0) | 0, moves: num(v.moves, 0, 1e5, 0) | 0, time: num(v.time, 0, 1e6, 0) };
    }
  // the unlock is derived from rooms actually escaped (a stored number alone can't skip ahead)
  let unlocked = 1;
  for (const k of Object.keys(done)) unlocked = Math.max(unlocked, +k + 1);
  unlocked = Math.min(COUNT, unlocked);
  const current = Number.isInteger(p.current) && p.current >= 1 && p.current <= unlocked ? p.current : nextOpen({ done, unlocked });
  const s = p.settings && typeof p.settings === "object" ? p.settings : {};
  const settings = {
    quality: ["low", "medium", "high"].includes(s.quality) ? s.quality : SETTINGS.quality,
    master: num(s.master, 0, 1, SETTINGS.master),
    sfx: num(s.sfx, 0, 1, SETTINGS.sfx),
    amb: num(s.amb, 0, 1, SETTINGS.amb),
    muted: typeof s.muted === "boolean" ? s.muted : SETTINGS.muted,
    sens: num(s.sens, 0.4, 2, SETTINGS.sens),
  };
  return { v: 1, unlocked, current, done, settings, finished: !!p.finished && !!done[COUNT] };
}

export function nextOpen(p) {
  for (let i = 1; i <= p.unlocked; i++) if (!p.done[i]) return i;
  return Math.min(p.unlocked, COUNT);
}

export function recordEscape(p, id, stats) {
  const prev = p.done[id];
  const better = !prev || stats.hints < prev.hints || (stats.hints === prev.hints && stats.time < prev.time);
  const done = { ...p.done, [id]: better ? { hints: stats.hints | 0, moves: stats.moves | 0, time: stats.time } : prev };
  const unlocked = Math.min(COUNT, Math.max(p.unlocked, id + 1));
  return normalize({ ...p, done, unlocked, current: id === COUNT ? id : Math.min(COUNT, id + 1), finished: p.finished || id === COUNT });
}

export const completedCount = (p) => Object.keys(p.done).length;
