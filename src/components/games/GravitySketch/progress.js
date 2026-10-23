/**
 * Gravity Sketch progress — unlocked levels, best stars/shapes per level and
 * small settings, saved under `gravity-sketch-progress`. Pure functions so the
 * rules can be tested headlessly (tools/progressTest.mjs).
 */
export const SAVE_KEY = "gravity-sketch-progress";

export function normalize(raw, count) {
  const p = raw && typeof raw === "object" ? raw : {};
  const best = {};
  if (p.best && typeof p.best === "object") {
    for (const [k, v] of Object.entries(p.best)) {
      const i = +k;
      if (Number.isInteger(i) && i >= 0 && i < count && v && typeof v === "object") {
        const stars = Math.max(1, Math.min(3, v.stars | 0));
        const shapes = Math.max(1, v.shapes | 0);
        best[i] = { stars, shapes };
      }
    }
  }
  let unlocked = Number.isInteger(p.unlocked) ? p.unlocked : 0;
  // every solved level unlocks the next one
  for (const k of Object.keys(best)) unlocked = Math.max(unlocked, +k + 1);
  unlocked = Math.max(0, Math.min(count - 1, unlocked));
  return { v: 1, unlocked, best, tutorial: !!p.tutorial, sound: p.sound !== false };
}

/** Records a win; returns { prog, newBest } */
export function recordWin(prog, i, stars, shapes, count) {
  const old = prog.best[i];
  const newBest = !old || stars > old.stars || (stars === old.stars && shapes < old.shapes);
  const best = { ...prog.best, [i]: newBest ? { stars, shapes } : old };
  return { prog: normalize({ ...prog, best, unlocked: Math.max(prog.unlocked, i + 1) }, count), newBest, first: !old };
}

export const totalStars = (prog) => Object.values(prog.best).reduce((s, b) => s + b.stars, 0);
export const nextLevel = (prog, count) => {
  for (let i = 0; i <= prog.unlocked && i < count; i++) if (!prog.best[i]) return i;
  return Math.min(prog.unlocked, count - 1);
};
