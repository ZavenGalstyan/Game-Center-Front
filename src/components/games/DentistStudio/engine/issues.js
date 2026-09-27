/**
 * Dentist Studio — deterministic starting state for a patient.
 *
 * A level's `issues` block is a compact recipe; this expands it into the
 * per-tooth cell layers (plaque, buildup, stains, cavity…), food-bit
 * entities, floss gaps and braces, all from the level seed. Same seed →
 * same mouth, every time (Restart, reload, and the BEFORE image).
 *
 *   plaque:  { amount 0..1, where, density 0..1 }
 *   hard:    { count }            thick plaque spots (scaler)
 *   tartar:  { count }            hard tartar (scaler, slower, chips off)
 *   stains:  { count, stubborn }  surface discolouration
 *   debris:  { count, hidden }    food bits (hidden ones need the mirror)
 *   floss:   { count, optional }  gaps with plaque between teeth
 *   cavities:{ count } | [{ tooth }]
 *   braces:  "upper" | "lower" | "both"
 *   hiddenPlaque: n               back teeth whose plaque only shows under the mirror
 */
import { mulberry32, fbm, smoothstep, pickN } from "./rng.js";

const DEBRIS_KINDS = ["crumb", "seed", "herb", "flake"];

function teethWhere(teeth, where) {
  switch (where) {
    case "front":
      return teeth.filter((t) => t.g.index <= 2);
    case "back":
      return teeth.filter((t) => t.g.index >= 3);
    case "upper":
      return teeth.filter((t) => t.g.jaw === "upper");
    case "lower":
      return teeth.filter((t) => t.g.jaw === "lower");
    case "lowerFront":
      return teeth.filter((t) => t.g.jaw === "lower" && t.g.index <= 2);
    default:
      return teeth;
  }
}

/** Paint a soft round blob into layer `key` of tooth `t` (world centre, world radius). */
function blob(t, key, cx, cy, r, peak, seed, { noise = 0.5, onlyZero = false, mark = null } = {}) {
  const g = t.g;
  const cells = [];
  const r2 = r * r;
  for (let k = 0; k < g.n; k++) {
    if (!g.valid[k] || t.L.X[k]) continue;
    const dx = g.cellX[k] - cx;
    const dy = g.cellY[k] - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 >= r2) continue;
    const n = fbm(g.cellX[k] * 0.09, g.cellY[k] * 0.09, seed);
    const fall = 1 - d2 / r2;
    const v = fall ** 0.55 * (1 - noise + noise * 1.6 * n);
    if (v < 0.18) continue;
    const val = Math.min(255, Math.round(v * peak));
    if (onlyZero && t.L[key][k]) continue;
    if (val > t.L[key][k]) t.L[key][k] = val;
    if (mark) t.L[mark[0]][k] = mark[1];
    cells.push(k);
  }
  return cells;
}

/** World position of a tooth-local (u,v) spot: u −1..1 across, v 0 gum .. 1 edge. */
function spot(t, u, v) {
  const g = t.g;
  return [g.x + u * (g.w / 2) * g.sx, g.yGum + g.dir * v * g.h * g.sy];
}

export function generateIssues(S, level) {
  const I = level.issues || {};
  const seed = level.seed || level.id * 7919;
  const rand = mulberry32(seed);
  const teeth = S.teeth;

  // static grain (texture for buildup rendering)
  for (const t of teeth) {
    const g = t.g;
    for (let k = 0; k < g.n; k++) t.L.G[k] = Math.round(fbm(g.cellX[k] * 0.35, g.cellY[k] * 0.35, 77) * 255);
  }

  /* ---- braces first: brackets block the cells they sit on */
  S.brackets = [];
  if (I.braces) {
    const jaws = I.braces === "both" ? ["upper", "lower"] : [I.braces];
    for (const t of teeth) {
      const g = t.g;
      if (!jaws.includes(g.jaw) || g.index > 4) continue;
      const [bx, by] = spot(t, 0, 0.5);
      const half = Math.max(7, g.w * g.sx * 0.19);
      S.brackets.push({ tooth: t.id, x: bx, y: by, half, jaw: g.jaw });
      for (let k = 0; k < g.n; k++) {
        if (!g.valid[k]) continue;
        const dx = Math.abs(g.cellX[k] - bx);
        const dy = Math.abs(g.cellY[k] - by);
        if (dx < half && dy < half) t.L.X[k] = 1;
        else if (dx < half * 2.05 && dy < half * 2.05) {
          t.L.Z[k] = 2;
          const n = fbm(g.cellX[k] * 0.12, g.cellY[k] * 0.12, seed + 5);
          if (n > 0.36) t.L.P[k] = Math.min(255, Math.round(140 + n * 150));
        }
      }
    }
  }

  /* ---- soft plaque */
  if (I.plaque) {
    const { amount = 0.5, where = "all", density = 0.85 } = I.plaque;
    for (const t of teethWhere(teeth, where)) {
      if (rand() > density) continue;
      const amt = amount * (0.6 + rand() * 0.65);
      const g = t.g;
      for (let k = 0; k < g.n; k++) {
        if (!g.valid[k] || t.L.X[k] || t.L.Z[k]) continue;
        const v = g.cellV[k];
        const u = Math.abs(g.cellU[k]);
        const gum = smoothstep(0.46, 0.02, v);
        const edge = smoothstep(0.58, 0.98, u) * 0.85;
        const base = Math.max(gum, edge);
        const n = fbm(g.cellX[k] * 0.045, g.cellY[k] * 0.045, seed + 11);
        const val = base * amt * 1.9 * (0.3 + n * 1.15);
        if (val < 0.24) continue;
        t.L.P[k] = Math.min(255, Math.round(val * 255));
      }
    }
  }

  /* ---- thick buildup / tartar spots (scaler) */
  S.blobs = [];
  const buildSpots = (count, kind) => {
    if (!count) return;
    const pool = kind === "tartar" ? teeth.filter((t) => t.g.index <= 3) : teeth.filter((t) => t.g.index <= 4);
    // prefer lower front teeth for tartar, spread otherwise
    const weighted = kind === "tartar" ? [...pool.filter((t) => t.g.jaw === "lower"), ...pool] : pool;
    const chosen = pickN(rand, [...new Set(weighted)], count);
    for (const t of chosen) {
      const u = (rand() < 0.5 ? -1 : 1) * (0.2 + rand() * 0.4);
      const v = 0.1 + rand() * 0.16;
      const [cx, cy] = spot(t, u, v);
      const r = (kind === "tartar" ? 11 : 10) + rand() * 4;
      const cells = blob(t, "T", cx, cy, r * t.g.p, 255, seed + S.blobs.length * 31, { noise: 0.35, mark: ["K", kind === "tartar" ? 1 : 0] });
      if (cells.length) {
        let total = 0;
        for (const k of cells) total += t.L.T[k];
        S.blobs.push({ tooth: t.id, cells, total, x: cx, y: cy, kind, broken: false });
      }
    }
  };
  buildSpots(I.hard?.count || 0, "plaque");
  buildSpots(I.tartar?.count || 0, "tartar");

  /* ---- stains (front & side surfaces) */
  if (I.stains?.count) {
    const pool = teeth.filter((t) => t.g.index <= 3);
    const chosen = pickN(rand, pool, I.stains.count);
    S.stainCount = chosen.length;
    for (const t of chosen) {
      const u = (rand() - 0.5) * 0.7;
      const v = 0.35 + rand() * 0.3;
      const [cx, cy] = spot(t, u, v);
      const r = (13 + rand() * 7) * t.g.p;
      blob(t, "S", cx, cy, r, I.stains.stubborn ? 235 : 205, seed + 900 + t.g.index, { noise: 0.7, mark: ["SH", I.stains.stubborn ? 1 : 0] });
    }
  }

  /* ---- cavities */
  S.cavities = [];
  // never on a tooth wearing a bracket — the spot must stay reachable
  const braced = new Set(S.brackets.map((b) => b.tooth));
  const cavList = Array.isArray(I.cavities)
    ? I.cavities
    : I.cavities
      ? pickN(rand, teeth.filter((t) => t.g.index >= 2 && t.g.index <= 4 && !braced.has(t.id)), I.cavities).map((t) => ({ tooth: t.id }))
      : [];
  for (const c of cavList) {
    const t = S.byId.get(c.tooth);
    if (!t || braced.has(t.id)) continue;
    const u = c.u ?? (rand() - 0.5) * 0.3;
    const v = c.v ?? 0.52 + rand() * 0.1;
    const [cx, cy] = spot(t, u, v);
    const r = (c.r ?? 11) * t.g.p * Math.min(1, t.g.w / 62);
    const cells = blob(t, "C", cx, cy, r, 250, seed + 3000 + t.g.index, { noise: 0.25, mark: ["CV", 1] });
    // the cavity area is clean of other issues — keep it readable
    for (const k of cells) {
      t.L.P[k] = 0;
      t.L.S[k] = 0;
      t.L.T[k] = 0;
    }
    S.cavities.push({ tooth: t.id, x: cx, y: cy, r });
  }

  /* ---- floss gaps */
  if (I.floss?.count) {
    const candidates = S.gaps.filter((gp) => {
      const a = S.byId.get(gp.a).g;
      const b = S.byId.get(gp.b).g;
      return a.index <= 4 && b.index <= 4;
    });
    const total = Math.min(candidates.length, I.floss.count + (I.floss.optional || 0));
    const chosen = pickN(rand, candidates, total);
    chosen.forEach((gp, i) => {
      gp.listed = true;
      gp.required = i < I.floss.count;
      gp.cells = [];
      for (const [tid, sgn] of [[gp.a, 1], [gp.b, -1]]) {
        const t = S.byId.get(tid);
        const g = t.g;
        for (let k = 0; k < g.n; k++) {
          if (!g.valid[k] || t.L.X[k]) continue;
          if (g.cellU[k] * sgn < 0.6 || g.cellV[k] > 0.86) continue;
          const n = fbm(g.cellX[k] * 0.1, g.cellY[k] * 0.1, seed + 40 + i);
          t.L.Z[k] = 1;
          const val = Math.round(120 + 135 * Math.min(1, n * 1.3));
          t.L.P[k] = val;
          gp.cells.push([t, k, val]);
        }
      }
    });
  }

  /* ---- food bits */
  S.debris = [];
  if (I.debris) {
    const visible = I.debris.count || 0;
    const hidden = I.debris.hidden || 0;
    const frontGaps = S.gaps.filter((gp) => {
      const a = S.byId.get(gp.a).g;
      return a.index <= 3 && S.byId.get(gp.b).g.index <= 3;
    });
    const gapPicks = pickN(rand, frontGaps, visible);
    for (let i = 0; i < visible; i++) {
      const gp = gapPicks[i % Math.max(1, gapPicks.length)];
      let x;
      let y;
      let gapId = null;
      let tooth;
      if (gp && i < gapPicks.length) {
        x = gp.x + (rand() - 0.5) * 3;
        y = gp.yMin + (gp.yMax - gp.yMin) * (0.3 + rand() * 0.45);
        gapId = gp.id;
        tooth = gp.a;
      } else {
        const t = teeth[Math.floor(rand() * teeth.length)];
        [x, y] = spot(t, (rand() - 0.5) * 0.8, 0.5 + rand() * 0.35);
        tooth = t.id;
      }
      S.debris.push(makeBit(S.debris.length, x, y, rand, { tooth, gap: gapId, hidden: false }));
    }
    const back = teeth.filter((t) => t.g.index >= 4);
    for (const t of pickN(rand, back, hidden)) {
      const [x, y] = spot(t, (rand() - 0.5) * 0.7, 0.35 + rand() * 0.35);
      S.debris.push(makeBit(S.debris.length, x, y, rand, { tooth: t.id, gap: null, hidden: true }));
    }
  }

  /* ---- plaque hidden until the mirror finds it */
  if (I.hiddenPlaque) {
    const back = teeth.filter((t) => t.g.index >= 3 && t.sumOf("P") > 0);
    for (const t of pickN(rand, back.length ? back : teeth.filter((t) => t.g.index >= 3), I.hiddenPlaque)) t.hidden = true;
  }

  /* ---- everything starts a little dull — polishing brings the shine */
  for (const t of teeth) {
    const g = t.g;
    for (let k = 0; k < g.n; k++) if (g.valid[k] && !t.L.X[k]) t.L.D[k] = 255;
  }
}

function makeBit(id, x, y, rand, { tooth, gap, hidden }) {
  return {
    id,
    x,
    y,
    kind: DEBRIS_KINDS[Math.floor(rand() * DEBRIS_KINDS.length)],
    size: 6.5 + rand() * 3,
    rot: rand() * Math.PI * 2,
    tooth,
    gap,
    hidden,
    optional: hidden,
    revealed: !hidden,
    removed: false,
    grabbed: false,
  };
}

