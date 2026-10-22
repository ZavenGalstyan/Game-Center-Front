/**
 * Test bot: steers g.player toward the nearest collectible using a BFS
 * distance-to-goal field. With `careful`, tiles near dangerous enemies are
 * treated as walls and frightened enemies become goals. Works headless and in
 * the browser (`__mm.bot()`).
 */
import { DIRS, open, setWant } from "../engine.js";

const LIST = Object.values(DIRS);

export function botStep(g, { careful = false, bonus = false } = {}) {
  if (g.phase !== "play") return;
  const m = g.m, pl = g.player, W = m.w;
  const idx = (x, y) => y * W + ((x + W) % W);
  const danger = new Set();
  if (careful)
    for (const e of g.enemies) {
      if (e.mode !== "out" && e.mode !== "leave") continue;
      const x0 = Math.round(e.tx + (e.dir ? e.dir[0] * e.p : 0)), y0 = Math.round(e.ty + (e.dir ? e.dir[1] * e.p : 0));
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (Math.abs(dx) + Math.abs(dy) <= 2) danger.add(idx(x0 + dx, y0 + dy));
    }
  // multi-source BFS from every goal
  const D = new Int16Array(W * m.h).fill(9999);
  const q = [];
  const goal = (i) => m.dots[i] || (bonus && g.bonus && i === idx(g.bonus.x, g.bonus.y));
  for (let i = 0; i < W * m.h; i++) if (goal(i) && !danger.has(i)) (D[i] = 0), q.push(i);
  if (careful) for (const e of g.enemies) if (e.mode === "fright") (D[idx(e.tx, e.ty)] = 0), q.push(idx(e.tx, e.ty));
  for (let k = 0; k < q.length; k++) {
    const x = q[k] % W, y = (q[k] / W) | 0;
    for (const [dx, dy] of LIST) {
      const ni = idx(x + dx, y + dy);
      if (!open(m, x + dx, y + dy) || D[ni] <= D[q[k]] + 1 || danger.has(ni)) continue;
      D[ni] = D[q[k]] + 1;
      q.push(ni);
    }
  }
  const best = (x, y, not) => LIST.filter(([dx, dy]) => open(m, x + dx, y + dy) && !(not && dx === -not[0] && dy === -not[1])).reduce((a, d) => (!a || D[idx(x + d[0], y + d[1])] < D[idx(x + a[0], y + a[1])] ? d : a), null);
  if (!pl.dir || pl.p === 0) return best(pl.tx, pl.ty) && setDir(g, best(pl.tx, pl.ty));
  const ax = pl.tx + pl.dir[0], ay = pl.ty + pl.dir[1];
  if (D[idx(pl.tx, pl.ty)] < D[idx(ax, ay)]) {
    // turn back, and buffer the best exit of the tile we return to
    const back = best(pl.tx, pl.ty);
    setDir(g, [-pl.dir[0], -pl.dir[1]]);
    pl.want = back;
    return;
  }
  const d = best(ax, ay, pl.dir); // buffered turn for the next centre (never a reversal)
  if (d) pl.want = d;
}

function setDir(g, d) {
  const w = g.player.want;
  if (!w || w[0] !== d[0] || w[1] !== d[1]) setWant(g, d);
}
