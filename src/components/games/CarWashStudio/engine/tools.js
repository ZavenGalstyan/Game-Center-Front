/**
 * Car Wash Studio — tool catalogue + the brush engine.
 *
 * A stroke is a capsule: the segment from the previous pointer position to
 * the current one, swept by the tool radius. Every mask pixel inside the
 * capsule (and inside the region under the pointer) gets an effect amount E:
 *
 *   spray tools   (hose, foam, pressure, sprays, vacuum)  E = rate · dt · f
 *                 where f is the fraction of this frame the moving nozzle
 *                 spent over that pixel → holding still keeps spraying, a
 *                 fast sweep lays down a thinner coat, and there are never
 *                 dotted gaps however fast the pointer moves.
 *   contact tools (sponge, brushes, cloth, towel, polisher)  E = k · travel/r
 *                 → scrubbing needs motion; one pass over the center ≈ 2k.
 *
 * Radii are in SCREEN pixels; the caller converts them into view units, so
 * zooming into the wheel view gives precise small strokes automatically.
 */
import { smoothstep } from "./rng.js";

export const TOOLS = {
  hose: { id: "hose", name: "Hose", radius: 40, mode: "spray", rate: 3.0, sound: "hose", kind: "water" },
  foam: { id: "foam", name: "Foam Cannon", radius: 48, mode: "spray", rate: 6.5, sound: "foam", kind: "foam" },
  sponge: { id: "sponge", name: "Sponge", radius: 34, mode: "contact", k: 0.24, sound: "sponge", kind: "sponge" },
  pressure: { id: "pressure", name: "Pressure Washer", radius: 16, mode: "spray", rate: 7.5, sound: "pressure", kind: "jet" },
  wheelCleaner: { id: "wheelCleaner", name: "Wheel Cleaner", radius: 30, mode: "spray", rate: 5, sound: "spray", kind: "mist" },
  wheelBrush: { id: "wheelBrush", name: "Wheel Brush", radius: 26, mode: "contact", k: 0.26, sound: "brush", kind: "brush" },
  spray: { id: "spray", name: "Spray Bottle", radius: 36, mode: "spray", rate: 5, sound: "spray", kind: "mist" },
  cloth: { id: "cloth", name: "Microfiber Cloth", radius: 34, mode: "contact", k: 0.3, sound: "cloth", kind: "cloth" },
  towel: { id: "towel", name: "Drying Towel", radius: 46, mode: "contact", k: 0.36, sound: "towel", kind: "towel" },
  polisher: { id: "polisher", name: "Polisher", radius: 36, mode: "contact", k: 0.2, sound: "polisher", kind: "polisher" },
  vacuum: { id: "vacuum", name: "Vacuum", radius: 26, mode: "spray", rate: 3.2, sound: "vacuum", kind: "vacuum" },
  detailBrush: { id: "detailBrush", name: "Detail Brush", radius: 16, mode: "contact", k: 0.32, sound: "brush", kind: "brush" },
  tireShine: { id: "tireShine", name: "Tire Shine", radius: 22, mode: "contact", k: 0.36, sound: "cloth", kind: "applicator" },
  hand: { id: "hand", name: "Pick Up", radius: 30, mode: "pick", sound: null, kind: "hand" },
};

export const TOOL_ORDER = ["hose", "foam", "sponge", "pressure", "wheelCleaner", "wheelBrush", "tireShine", "spray", "cloth", "towel", "polisher", "hand", "vacuum", "detailBrush"];

const INTERIOR = new Set(["dash", "fabric", "leather", "carpet", "vent", "iglass"]);
export const isInteriorMat = (m) => INTERIOR.has(m);

// Layers are bytes. Stochastic rounding keeps tiny per-frame amounts (a slow
// sweep, a gentle tool) from being truncated to zero forever: 0.3 per frame
// lands as "1" about 30% of the time, which averages out exactly.
let lcg = 12345;
const rnd = () => (lcg = (lcg * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const sub = (arr, i, v) => {
  const n = arr[i] - v;
  arr[i] = n > 0 ? n - rnd() + 1 : 0;
};
const add = (arr, i, v) => {
  const n = arr[i] + v;
  arr[i] = n < 255 ? n + rnd() : 255;
};

/**
 * Apply one tool to one pixel. Returns a small code when the tool could not
 * do its job here (used for gentle feedback), else 0.
 *   1 needs foam · 2 needs drying · 3 needs washing · 4 needs cleaner
 *   5 wrong surface · 6 needs water rinse first
 */
function applyPixel(s, i, tool, E, mat, ctx) {
  const e = E * 255;
  switch (tool) {
    case "hose": {
      if (isInteriorMat(mat)) return 5;
      add(s.R, i, e * 1.2);
      add(s.W, i, e * 1.4);
      sub(s.D, i, e * 1.3);
      sub(s.ML, i, e * 0.9);
      sub(s.F, i, e * 0.22);
      sub(s.FD, i, e * (mat === "wheel" ? 1.4 : 0.8));
      sub(s.C, i, e * 0.9);
      if (mat === "wheel") sub(s.G, i, e * 0.05);
      return 0;
    }
    case "pressure": {
      if (isInteriorMat(mat)) return 5;
      add(s.R, i, e * 1.4);
      add(s.W, i, e * 1.8);
      sub(s.F, i, e * 2.3);
      sub(s.FD, i, e * 2.3);
      sub(s.D, i, e * 2.2);
      sub(s.ML, i, e * 2.0);
      sub(s.C, i, e * 1.6);
      if (mat !== "trim") {
        const k = ctx.pwStuck;
        sub(s.MS, i, e * k);
        sub(s.G, i, e * (mat === "wheel" ? 0.14 : k * 0.9));
        sub(s.S, i, e * k * 0.6);
      }
      return 0;
    }
    case "foam": {
      if (isInteriorMat(mat)) return 5;
      add(s.F, i, e);
      add(s.W, i, e * 0.2);
      return 0;
    }
    case "sponge": {
      if (isInteriorMat(mat) || mat === "wheel") return 5;
      const stuck = s.MS[i] + s.G[i] + (mat === "trim" ? 0 : s.S[i]) + s.ML[i] + s.D[i];
      if (s.F[i] < 40) return stuck > 30 ? 1 : 0;
      let budget = e * 0.95;
      let moved = 0;
      for (const L of mat === "trim" ? ["D", "ML", "MS", "G"] : ["D", "ML", "MS", "G", "S"]) {
        if (budget <= 0) break;
        const take = Math.min(s[L][i], budget);
        s[L][i] -= take;
        budget -= take;
        moved += take;
      }
      if (moved > 0) add(s.FD, i, moved * 0.85);
      sub(s.F, i, e * 0.05);
      return 0;
    }
    case "wheelCleaner": {
      if (mat !== "wheel") return 5;
      add(s.C, i, e);
      return 0;
    }
    case "wheelBrush": {
      if (mat !== "wheel") return 5;
      const boost = s.C[i] > 30 ? 1 : 0.3;
      let budget = e * boost;
      let moved = 0;
      for (const L of ["D", "ML", "MS", "G"]) {
        if (budget <= 0) break;
        const take = Math.min(s[L][i], budget);
        s[L][i] -= take;
        budget -= take;
        moved += take;
      }
      if (moved > 0) add(s.FD, i, moved * 0.8);
      sub(s.C, i, e * 0.12);
      return boost < 1 && moved > 0 ? 4 : 0;
    }
    case "spray": {
      if (mat === "paint" || mat === "wheel" || mat === "carpet") return 5;
      add(s.C, i, e);
      return 0;
    }
    case "cloth": {
      if (mat === "glass" || mat === "iglass") {
        const hasC = s.C[i] > 25;
        const before = s.SM[i];
        sub(s.SM, i, e * (hasC ? 1.15 : 0.25));
        sub(s.C, i, e * 0.9);
        sub(s.D, i, e * 0.7);
        sub(s.F, i, e * 0.5);
        sub(s.FD, i, e * 0.5);
        sub(s.W, i, e * 0.45);
        return !hasC && before > 40 ? 4 : 0;
      }
      if (mat === "dash" || mat === "leather" || mat === "vent") {
        const hasC = s.C[i] > 25;
        sub(s.D, i, e * (mat === "vent" ? 0.35 : 1.1));
        const before = s.S[i];
        sub(s.S, i, e * (hasC ? 1.0 : 0.2));
        sub(s.C, i, e * 0.9);
        return !hasC && before > 40 ? 4 : 0;
      }
      if (mat === "trim") {
        sub(s.G, i, e * 0.5);
        sub(s.D, i, e * 0.8);
        return 0;
      }
      return 5;
    }
    case "towel": {
      if (isInteriorMat(mat)) return 5;
      sub(s.W, i, e * 1.25);
      return 0;
    }
    case "polisher": {
      if (mat !== "paint") return 5;
      if (s.W[i] > 60) return 2;
      if (s.D[i] + s.ML[i] + s.MS[i] + s.G[i] + s.S[i] + s.F[i] + s.FD[i] > 70) return 3;
      add(s.P, i, e * ctx.polishRate);
      return 0;
    }
    case "vacuum": {
      if (mat !== "carpet" && mat !== "fabric") return 5;
      sub(s.D, i, e * 1.3);
      return 0;
    }
    case "detailBrush": {
      if (mat === "trim") {
        sub(s.S, i, e * 0.85);
        sub(s.G, i, e * 0.85);
        sub(s.D, i, e);
        return 0;
      }
      if (mat === "vent") {
        sub(s.D, i, e * 1.2);
        return 0;
      }
      if (mat === "fabric" || mat === "carpet") {
        const hasC = s.C[i] > 25;
        sub(s.S, i, e * (hasC ? 0.9 : 0.25));
        sub(s.D, i, e * 0.4);
        sub(s.C, i, e * 0.5);
        return !hasC && s.S[i] > 40 ? 4 : 0;
      }
      if (mat === "dash") {
        sub(s.D, i, e * 0.6);
        return 0;
      }
      return 5;
    }
    case "tireShine": {
      if (mat !== "wheel" || !s.ring || !s.ring[i]) return 5;
      if (s.D[i] + s.ML[i] + s.MS[i] + s.G[i] + s.FD[i] > 80) return 3;
      add(s.TS, i, e);
      return 0;
    }
    default:
      return 0;
  }
}

/**
 * Sweep one tool along a segment over one region of a surface.
 * Returns the dominant feedback code (see applyPixel) or 0, and whether any
 * pixel changed.
 */
export function strokeRegion(surf, region, tool, x0, y0, x1, y1, r, dt, ctx) {
  const def = TOOLS[tool];
  const box = region.box;
  if (Math.max(x0, x1) + r < box.x0 || Math.min(x0, x1) - r > box.x1 || Math.max(y0, y1) + r < box.y0 || Math.min(y0, y1) - r > box.y1) return null;
  const mask = surf.regionMasks.get(region);
  const m = region.aff;
  const w = surf.w;
  const h = surf.h;
  let ua = (Math.min(x0, x1) - r - m.e) / m.a - 0.5;
  let ub = (Math.max(x0, x1) + r - m.e) / m.a - 0.5;
  if (ua > ub) [ua, ub] = [ub, ua];
  let va = (Math.min(y0, y1) - r - m.f) / m.d - 0.5;
  let vb = (Math.max(y0, y1) + r - m.f) / m.d - 0.5;
  if (va > vb) [va, vb] = [vb, va];
  const u0 = Math.max(0, Math.floor(ua));
  const u1 = Math.min(w - 1, Math.ceil(ub));
  const v0 = Math.max(0, Math.floor(va));
  const v1 = Math.min(h - 1, Math.ceil(vb));
  if (u0 > u1 || v0 > v1) return null;

  const dx = x1 - x0;
  const dy = y1 - y0;
  const L2 = dx * dx + dy * dy;
  const L = Math.sqrt(L2);
  const r2 = r * r;
  const spray = def.mode === "spray";
  const mat = surf.material;
  let changed = false;
  const codes = [0, 0, 0, 0, 0, 0, 0];
  let cx0 = w;
  let cy0 = h;
  let cx1 = 0;
  let cy1 = 0;

  for (let v = v0; v <= v1; v++) {
    const py = m.d * (v + 0.5) + m.f;
    const row = v * w;
    for (let u = u0; u <= u1; u++) {
      const i = row + u;
      if (!mask[i]) continue;
      const px = m.a * (u + 0.5) + m.e;
      let frac;
      let dist;
      if (L < 1e-6) {
        const ex = px - x0;
        const ey = py - y0;
        const d2 = ex * ex + ey * ey;
        if (d2 >= r2) continue;
        dist = Math.sqrt(d2);
        frac = spray ? 1 : 0;
      } else {
        const tc = ((px - x0) * dx + (py - y0) * dy) / L2;
        const perp = Math.abs((px - x0) * dy - (py - y0) * dx) / L;
        if (perp >= r) continue;
        const half = Math.sqrt(r2 - perp * perp) / L;
        const t0 = Math.max(0, tc - half);
        const t1 = Math.min(1, tc + half);
        if (t1 <= t0) continue;
        const tcl = tc < 0 ? 0 : tc > 1 ? 1 : tc;
        const qx = x0 + dx * tcl - px;
        const qy = y0 + dy * tcl - py;
        dist = Math.sqrt(qx * qx + qy * qy);
        frac = spray ? t1 - t0 : ((t1 - t0) * L) / r;
      }
      if (frac <= 0) continue;
      const fall = 1 - smoothstep(0.55, 1, dist / r);
      const E = spray ? def.rate * ctx.rateMul * dt * frac * fall : def.k * ctx.rateMul * frac * fall;
      if (E <= 0) continue;
      const code = applyPixel(surf, i, tool, E, mat, ctx);
      if (code) codes[code] += E;
      else {
        changed = true;
        if (u < cx0) cx0 = u;
        if (u > cx1) cx1 = u;
        if (v < cy0) cy0 = v;
        if (v > cy1) cy1 = v;
      }
    }
  }
  if (changed) surf.markDirty(cx0, cy0, cx1 + 1, cy1 + 1);
  let code = 0;
  let best = 0;
  for (let c = 1; c < codes.length; c++) if (codes[c] > best) (best = codes[c]), (code = c);
  return { changed, code, codeAmount: best };
}
