/**
 * Helix Drop — design aid: suggest the smallest ring rotations ("nudges") that
 * restore a fair drop window between consecutive rings (same rule as the
 * validator) and a safe start on ring 0. Prints a TUNE table to paste into
 * data/levels.js; it never edits files itself.
 *   node src/components/games/HelixDrop/tools/nudge.mjs
 */
import { LEVELS } from "../data/levels.js";

const typeAt = (l, deg) => {
  let a = ((deg - (l.off || 0)) % 360 + 360) % 360;
  for (const [t, d] of l.segs) {
    if (a < d) return t;
    a -= d;
  }
  return l.segs[l.segs.length - 1][0];
};
/** Follow a drop at angle d down through aligned gaps: it must land clear of danger. */
function chainClear(L, j, d, pad) {
  for (let n = j; n < L.length; n++) {
    const N = L[n];
    if (N.finish) return true;
    if (N.move?.spin) return true; // spinning rings are proven by the bot
    const p = pad + (N.move?.amp || 0) + (n - j) * 6; // faster fall deeper in the chain: widen
    for (let k = -p; k <= p; k += 2) if (typeAt(N, d + k) === "danger") return false;
    if (typeAt(N, d) !== "gap") return true; // lands here, clear
  }
  return true;
}
let CUR = [];
function hasWindow(K, N) {
  if (!K || !N || N.finish || K.move?.spin || N.move?.spin) return true;
  const pad = 14 + (K.move?.amp || 0) + (N.move?.amp || 0);
  for (let d = 0; d < 360; d++) {
    if (![-10, -5, 0, 5, 10].every((k) => typeAt(K, d + k) === "gap")) continue;
    if (chainClear(CUR, CUR.indexOf(N), d, pad)) return true;
  }
  return false;
}
const safeStart = (L0) => [-14, -7, 0, 7, 14].every((k) => ["safe", "break"].includes(typeAt(L0, 90 + k)));

const tune = {};
for (const T of LEVELS) {
  const L = T.layers.map((l) => ({ ...l }));
  CUR = L;
  for (let i = 0; i < L.length - 1; i++) {
    const ok = (l) => (i === 0 ? safeStart(l) : hasWindow(L[i - 1], l)) && (i === 0 || true);
    if (ok(L[i]) && (i > 0 || hasWindow(L[i], L[i + 1]) || true)) continue;
    const base = L[i].off || 0;
    let chosen = null;
    for (let step = 5; step <= 180 && chosen === null; step += 5) {
      for (const s of [step, -step]) {
        const c = { ...L[i], off: (base + s + 360) % 360 };
        const keep = L[i];
        L[i] = c;
        const good = ok(c) && hasWindow(c, L[i + 1]);
        L[i] = keep;
        if (!good) continue;
        chosen = c.off;
        break;
      }
    }
    if (chosen === null) {
      for (let step = 5; step <= 180 && chosen === null; step += 5)
        for (const s of [step, -step]) {
          const c = { ...L[i], off: (base + s + 360) % 360 };
          const keep = L[i];
          L[i] = c;
          const good = ok(c);
          L[i] = keep;
          if (good) {
            chosen = c.off;
            break;
          }
        }
    }
    if (chosen === null) console.log(`// cannot fix ${L[i].id}`);
    else {
      L[i].off = chosen;
      tune[L[i].id] = chosen;
    }
  }
}
console.log(JSON.stringify(tune));
console.log(`// ${Object.keys(tune).length} nudges`);
