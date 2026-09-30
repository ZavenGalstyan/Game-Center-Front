/**
 * Jump Ball — Endless Mode generator.
 *
 * Builds one guaranteed MAIN PATH upward. Every path transition is sized from
 * the actual physics constants (reach()) with a safety margin, so no gap can
 * exceed what the ball can do. Rules that keep it fair:
 *   - vertical gap ≤ 72% of apex (≤ 70% of spring apex after a spring)
 *   - horizontal gap ≤ MARGIN × max air travel for that gap, and for movers
 *     the WHOLE travel range must fit inside that limit
 *   - a mover is never preceded by a breaking platform, and a vanisher only
 *     ever follows a plain normal platform (you can always bounce in place
 *     to wait for it, with a normal-length bounce to judge the timing)
 *   - optional side platforms stay well clear of the path columns and never
 *     appear right after a spring (the long fall must land on the path)
 *   - no hazards are generated (no random deaths)
 * Difficulty ramps with height and every probability is capped.
 * Deterministic for a given seed. Validated by tools/simTest.mjs, which runs
 * the steering bot up 600+ generated platforms with the real Sim.
 */
import { PHYS } from "./constants.js";

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
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/**
 * Max horizontal air travel (units) for a jump that lands dy above take-off,
 * starting from rest horizontally, at full control. Analytic from PHYS.
 */
export function reach(dy, launch = PHYS.BOUNCE) {
  const G = PHYS.G;
  const apex = (launch * launch) / (2 * G);
  if (dy > apex) return 0;
  const T = launch / G + Math.sqrt((2 * (apex - dy)) / G);
  const tAcc = PHYS.MAX_VX / PHYS.ACCEL;
  if (T <= tAcc) return 0.5 * PHYS.ACCEL * T * T;
  return 0.5 * PHYS.MAX_VX * tAcc + PHYS.MAX_VX * (T - tAcc);
}

const MARGIN = 0.62;

export class EndlessGen {
  constructor(seed = 1) {
    this.r = rng(seed);
    this.topY = 0;
    this.last = null;
    this.n = 0;
    this.sinceStar = 0;
  }

  initial() {
    const start = { id: "e0", type: "start", x: 300, y: 0, w: 260, path: 0 };
    this.last = start;
    this.topY = 0;
    this.n = 1;
    return { platforms: [start], stars: [] };
  }

  /** Difficulty 0..1 from height (full at 16 000 units ≈ 1600 m). */
  diff(y) {
    return clamp(y / 16000, 0, 1);
  }

  next() {
    const r = this.r;
    const prev = this.last;
    const d = this.diff(prev.y);
    const plats = [];
    const stars = [];

    // ---- choose the type (capped probabilities) ----
    const canWaitOnPrev = prev.type !== "breaking" && prev.type !== "vanish";
    const roll = r();
    let type = "normal";
    const pMove = lerp(0.06, 0.26, d);
    const pBreak = lerp(0.04, 0.16, d);
    const pSpring = 0.07;
    const pIce = prev.y > 2500 ? lerp(0.0, 0.1, d) : 0;
    const pVanish = prev.y > 4500 ? lerp(0.0, 0.12, d) : 0;
    let acc = 0;
    if (roll < (acc += pMove) && canWaitOnPrev) type = "moving";
    else if (roll < (acc += pBreak)) type = "breaking";
    else if (roll < (acc += pSpring) && prev.type !== "spring") type = "spring";
    else if (roll < (acc += pIce)) type = "ice";
    else if (roll < (acc += pVanish) && (prev.type === "normal" || prev.type === "start")) type = "vanish";
    // rhythm: never two specials that punish in a row
    if ((type === "breaking" || type === "vanish") && (prev.type === "breaking" || prev.type === "vanish")) type = "normal";

    // ---- vertical gap ----
    const apex = prev.type === "spring" ? (PHYS.SPRING * PHYS.SPRING) / (2 * PHYS.G) : (PHYS.BOUNCE * PHYS.BOUNCE) / (2 * PHYS.G);
    const maxDy = apex * (prev.type === "spring" ? 0.7 : 0.72);
    let dy = prev.type === "spring" ? lerp(260, 340, r()) : lerp(lerp(105, 150, d), lerp(150, 180, d), r());
    dy = Math.min(dy, maxDy);

    // ---- width ----
    let w = Math.round(lerp(lerp(190, 120, d), lerp(150, 95, d), r()));
    if (type === "spring") w = Math.round(lerp(95, 120, r()));
    if (type === "moving") w = Math.round(lerp(120, 100, d));

    // ---- horizontal placement within reach ----
    const launch = prev.type === "spring" ? PHYS.SPRING : PHYS.BOUNCE;
    let lim = reach(dy, launch) * MARGIN;
    // after a breaking platform you can't reposition: budget from its far edge
    if (!canWaitOnPrev) lim -= prev.w / 2;
    let amp = 0;
    if (type === "moving") {
      amp = Math.round(clamp(lerp(50, 110, d) * (0.7 + 0.3 * r()), 40, lim * 0.6));
      lim -= amp;
    }
    lim = Math.max(40, lim);
    const minX = 70 + amp + w / 2 - 50;
    const maxX = PHYS.WIDTH - minX;
    let dx = (r() * 2 - 1) * lim;
    // prefer to cross the column instead of hugging a wall
    if (Math.abs(dx) < lim * 0.25) dx = Math.sign(dx || 1) * lim * (0.25 + 0.3 * r());
    let x = prev.x + dx;
    if (x < minX || x > maxX) x = prev.x - dx;
    x = clamp(x, Math.max(minX, prev.x - lim), Math.min(maxX, prev.x + lim));
    x = clamp(x, minX, maxX);

    const y = Math.round(prev.y + dy);
    const p = { id: `e${this.n}`, type, x: Math.round(x), y, w, path: this.n };
    if (type === "moving") p.move = { axis: "x", amp, period: lerp(3.6, 2.6, d) + r() * 0.6, phase: r() };
    if (type === "vanish") p.cycle = { on: lerp(2.6, 1.9, d), warn: 0.9, off: 1.3, back: 0.5, offset: r() * 3 };
    plats.push(p);

    // ---- optional side platform (never required) ----
    if (r() < 0.22 && type !== "moving" && prev.type !== "spring" && type !== "spring") {
      const sx = p.x < 300 ? p.x + lerp(190, 240, r()) : p.x - lerp(190, 240, r());
      if (sx > 90 && sx < PHYS.WIDTH - 90 && Math.abs(sx - prev.x) >= 190 + (prev.move ? prev.move.amp : 0)) plats.push({ id: `e${this.n}s`, type: "normal", x: Math.round(sx), y: y + Math.round(lerp(-30, 40, r())), w: 100 });
    }

    // ---- stars: above the path platform, within the natural bounce ----
    this.sinceStar++;
    if (this.sinceStar >= 5 && r() < 0.5) {
      this.sinceStar = 0;
      stars.push({ x: clamp(p.x + (r() - 0.5) * 80, 60, PHYS.WIDTH - 60), y: y + 150 });
    }

    this.last = p;
    this.topY = y;
    this.n++;
    return { platforms: plats, stars };
  }
}
