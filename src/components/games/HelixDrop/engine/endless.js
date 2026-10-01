/**
 * Helix Drop — Endless tower generator (deterministic per seed).
 *
 * Fairness rules (checked by tools/simTest.mjs, where a slow-turning bot
 * descends 600+ generated floors with the real Sim):
 *   • every layer has at least one gap ≥ MIN_GAP (never a closed ring)
 *   • danger coverage is capped (≤ 45% of a ring even at max difficulty)
 *   • LANDING ZONE: danger never sits within ±LAND° of the previous layer's
 *     gaps — the ball falls ~0.23 s from one floor to the next, which is too
 *     short to demand a big correction, so what's under a gap is always safe
 *     or another gap
 *   • moving layers only sway (never spin) and never exceed ±30°
 * Difficulty ramps with depth and every probability is capped.
 */
const MIN_GAP = 40;
const LAND = 60;

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const lerp = (a, b, k) => a + (b - a) * k;
const wrap = (d) => ((d % 360) + 360) % 360;
/** Angular distance between two angles in degrees. */
const adist = (a, b) => {
  const d = Math.abs(wrap(a) - wrap(b));
  return d > 180 ? 360 - d : d;
};

export class EndlessGen {
  constructor(seed = 1) {
    this.r = rng(seed);
    this.n = 0;
    this.prevGaps = [90]; // tower-local centres of the previous layer's gaps
    this.bottomY = 0;
  }

  initial() {
    // first ring: safe under the ball, a big gap one easy turn away
    this.n = 1;
    this.prevGaps = [180];
    this.bottomY = 0;
    return [{ id: "e0", off: 130, segs: [["gap", 100], ["safe", 260]] }];
  }

  diff() {
    return Math.min(1, this.n / 220);
  }

  next(count = 1) {
    const out = [];
    for (let c = 0; c < count; c++) out.push(this.layer());
    return out;
  }

  layer() {
    const r = this.r;
    const d = this.diff();
    const i = this.n++;
    // --- gaps (1, sometimes 2 later on), angular positions in tower-local degrees
    const gapW = Math.round(lerp(lerp(110, 70, d), lerp(80, MIN_GAP + 5, d), r()));
    const twoGaps = d > 0.3 && r() < 0.25;
    const g1 = wrap(this.prevGaps[0] + (r() < 0.5 ? -1 : 1) * lerp(70, 170, r()));
    const gaps = [g1];
    if (twoGaps) gaps.push(wrap(g1 + 180 + (r() - 0.5) * 40));
    // build a 360-entry type map, then compress
    const cells = new Array(360).fill("safe");
    for (const g of gaps) for (let k = -gapW / 2; k < gapW / 2; k++) cells[Math.round(wrap(g + k)) % 360] = "gap";
    // --- danger: a few blocks, capped coverage, never in a landing zone
    const maxDanger = Math.round(lerp(0, 160, d));
    let placed = 0;
    const blocks = d < 0.05 ? 0 : 1 + Math.floor(r() * (d > 0.5 ? 3 : 2));
    for (let b = 0; b < blocks && placed < maxDanger; b++) {
      const w = Math.round(lerp(30, 70, r()));
      const c0 = r() * 360;
      let okZone = true;
      for (let k = 0; k < w; k++) {
        const a = wrap(c0 + k);
        if (this.prevGaps.some((pg) => adist(a, pg) < LAND) || cells[Math.round(a) % 360] === "gap") okZone = false;
        if (gaps.some((g) => adist(a, g) < gapW / 2 + 8)) okZone = false;
      }
      if (!okZone) continue;
      for (let k = 0; k < w; k++) cells[Math.round(wrap(c0 + k)) % 360] = "danger";
      placed += w;
    }
    // --- breakables replace some safe on later floors (bounce normally, smashable)
    if (d > 0.15 && r() < 0.3) {
      const c0 = r() * 360;
      for (let k = 0; k < 60; k++) {
        const idx = Math.round(wrap(c0 + k)) % 360;
        if (cells[idx] === "safe") cells[idx] = "break";
      }
    }
    // compress into segments starting at a gap edge
    let start = cells.findIndex((t, k) => t !== cells[(k + 359) % 360]);
    if (start < 0) start = 0;
    const segs = [];
    for (let k = 0; k < 360; k++) {
      const t = cells[(start + k) % 360];
      if (segs.length && segs[segs.length - 1][0] === t) segs[segs.length - 1][1]++;
      else segs.push([t, 1]);
    }
    const layer = { id: `e${i}`, off: start, segs };
    if (d > 0.35 && r() < lerp(0, 0.25, d)) layer.move = { amp: Math.round(lerp(12, 30, r())), period: lerp(3.6, 2.6, r()), phase: r() };
    this.prevGaps = gaps;
    this.bottomY = -i * 2.8;
    return layer;
  }
}
