/**
 * Shadow Runner — level builder. Levels are authored as a left-to-right walk
 * with a cursor: each *structure* (roof / plat / crumble / mover) is placed at
 * the cursor and becomes the "current" surface; *items* (vault, wall, bar,
 * laser, spring, coins, cp, finish…) are placed relative to the current
 * surface's left edge (`at`) and top. `compile()` turns that into flat
 * collider / hazard lists plus an x-bucket broadphase the sim queries.
 */
import { PHYS } from "./constants.js";

const BUCKET = 256;

export class Builder {
  constructor(meta) {
    this.meta = meta;
    this.x = 0;
    this.y = meta.startY ?? 400;
    this.cur = null;
    this.solids = [];
    this.roofs = [];
    this.crumbles = [];
    this.movers = [];
    this.lasers = [];
    this.springs = [];
    this.coinList = [];
    this.checkpoints = [];
    this.hints = [];
    this.goal = null;
    this.start = null;
  }

  // ---------------------------------------------------------- structures
  _surface(w, dy, kind) {
    this.y += dy;
    this.cur = { x: this.x, y: this.y, w, kind };
    this.x += w;
    return this.cur;
  }
  /** A building: solid from its roof down past the death plane. */
  roof(w, dy = 0, style = 0) {
    const c = this._surface(w, dy, "roof");
    const r = { x: c.x, y: c.y, w, h: 0, kind: "roof", style };
    this.solids.push(r);
    this.roofs.push(r);
    if (!this.start) this.start = { x: c.x + 60, y: c.y };
    return this;
  }
  gap(w) {
    this.x += w;
    return this;
  }
  /** Floating static platform (scaffold / catwalk / billboard top). */
  plat(w, dy = 0, thick = 18) {
    const c = this._surface(w, dy, "plat");
    this.solids.push({ x: c.x, y: c.y, w, h: thick, kind: "plat" });
    return this;
  }
  /** Rotten roof section that gives way `delay`s after you step on it. */
  crumble(w, dy = 0, delay = 0.45, thick = 22) {
    const c = this._surface(w, dy, "crumble");
    this.crumbles.push({ x: c.x, y: c.y, w, h: thick, kind: "crumble", delay, ci: this.crumbles.length });
    return this;
  }
  /** Moving platform; base position at the cursor, sways ax/ay around it. */
  mover(w, dy = 0, { ax = 0, ay = 0, period = 2.6, phase = 0 } = {}) {
    const c = this._surface(w, dy, "mover");
    this.movers.push({ x0: c.x, y0: c.y, x: c.x, y: c.y, w, h: 18, ax, ay, period, phase, dx: 0, dy: 0, kind: "mover" });
    return this;
  }

  // ---------------------------------------------------------- items (relative to current surface)
  _ax(at) {
    return this.cur.x + at;
  }
  vault(at, h = 36, w = 44) {
    this.solids.push({ x: this._ax(at), y: this.cur.y - h, w, h, kind: "vault" });
    return this;
  }
  /** Block standing on the roof, `h` tall (≤ MANTLE_H climbable, taller = wall). */
  wall(at, h, w = 46) {
    this.solids.push({ x: this._ax(at), y: this.cur.y - h, w, h, kind: "wall" });
    return this;
  }
  /** Overhead duct / billboard: leaves `clear` units under it (slide gap is 26). */
  bar(at, w = 70, clear = 36, tall = 240) {
    this.solids.push({ x: this._ax(at), y: this.cur.y - clear - tall, w, h: tall, kind: "bar" });
    return this;
  }
  /** Generic solid, top `above` units over the surface. */
  block(at, above, w, h, kind = "block") {
    this.solids.push({ x: this._ax(at), y: this.cur.y - above, w, h, kind });
    return this;
  }
  /** Floating ledge `above` the current surface (does not move the cursor). */
  ledge(at, above, w = 100, thick = 18) {
    this.solids.push({ x: this._ax(at), y: this.cur.y - above, w, h: thick, kind: "plat" });
    return this;
  }
  /** Laser box; y0 = height of its TOP edge above the surface. */
  laser(at, y0, h, opt = {}) {
    this.lasers.push({ x: this._ax(at), y: this.cur.y - y0, w: opt.w ?? 8, h, on: opt.on || 0, off: opt.off || 0, phase: opt.phase || 0, mx: opt.mx || 0, my: opt.my || 0, mperiod: opt.mperiod || 2, mphase: opt.mphase || 0, vertical: (opt.w ?? 8) < h });
    return this;
  }
  /** Floor post laser: jump over it. */
  post(at, h = 52, opt) {
    return this.laser(at, h, h, opt);
  }
  /** Hanging laser curtain: slide under it. */
  curtain(at, clear = 34, tall = 300, opt) {
    return this.laser(at, clear + tall, tall, opt);
  }
  /** Horizontal tripwire beam `y0` above the surface spanning w. */
  beam(at, y0, w, opt = {}) {
    return this.laser(at, y0, 6, { ...opt, w });
  }
  spring(at, w = 40) {
    this.springs.push({ x: this._ax(at), y: this.cur.y, w });
    return this;
  }
  coins(at, n, gap = 34, above = 28) {
    for (let i = 0; i < n; i++) this.coinList.push({ x: this._ax(at) + i * gap, y: this.cur.y - above });
    return this;
  }
  /** Coins along a full-jump arc taken off at `at` (top speed of this level). */
  arc(at, n, spacing = 0.09, t0 = 0.12, apexScale = 1) {
    const v = this.meta.run ?? PHYS.RUN;
    const x0 = this._ax(at) + PHYS.W / 2;
    const feet = this.cur.y;
    for (let i = 0; i < n; i++) {
      const t = t0 + i * spacing;
      const y = feet - (PHYS.JUMP_V * apexScale * t - 0.5 * PHYS.G * t * t) - 30;
      this.coinList.push({ x: x0 + v * t, y });
    }
    return this;
  }
  /** One coin at an absolute offset (above = height over the surface). */
  coin(at, above) {
    this.coinList.push({ x: this._ax(at), y: this.cur.y - above });
    return this;
  }
  cp(at) {
    this.checkpoints.push({ x: this._ax(at), y: this.cur.y });
    return this;
  }
  hint(at, text) {
    this.hints.push({ x: this._ax(at), text });
    return this;
  }
  finish(at) {
    this.goal = { x: this._ax(at), y: this.cur.y };
    return this;
  }

  // ---------------------------------------------------------- compile
  compile() {
    const m = this.meta;
    if (!this.goal) throw new Error(`level ${m.id}: no finish`);
    let maxTop = -Infinity;
    for (const r of this.solids) if (r.kind === "roof" || r.kind === "plat") maxTop = Math.max(maxTop, r.y);
    for (const c of this.crumbles) maxTop = Math.max(maxTop, c.y);
    for (const v of this.movers) maxTop = Math.max(maxTop, v.y0 + Math.abs(v.ay));
    const deathY = maxTop + 300;
    for (const r of this.roofs) r.h = deathY + 600 - r.y;

    const colliders = [...this.solids, ...this.crumbles, ...this.movers];
    const width = this.x + 2000;
    const buckets = Array.from({ length: Math.ceil(width / BUCKET) + 1 }, () => []);
    for (const c of colliders) {
      const x0 = c.kind === "mover" ? c.x0 - Math.abs(c.ax) : c.x;
      const x1 = (c.kind === "mover" ? c.x0 + Math.abs(c.ax) : c.x) + c.w;
      for (let i = Math.max(0, Math.floor(x0 / BUCKET)); i <= Math.min(buckets.length - 1, Math.floor(x1 / BUCKET)); i++) buckets[i].push(c);
    }
    this.checkpoints.sort((a, b) => a.x - b.x);
    return {
      id: m.id,
      name: m.name,
      district: m.district,
      run: m.run ?? PHYS.RUN,
      airJumps: m.airJumps ?? 0,
      chase: m.chase === false ? null : { ratio: m.chase?.ratio ?? 0.9, lead: m.chase?.lead ?? 320 },
      weather: m.weather,
      intro: m.intro || "",
      start: this.start,
      solids: this.solids,
      roofs: this.roofs,
      crumbles: this.crumbles,
      movers: this.movers,
      lasers: this.lasers,
      springs: this.springs,
      coins: this.coinList,
      checkpoints: this.checkpoints,
      hints: this.hints,
      finish: this.goal,
      deathY,
      length: this.goal.x,
      buckets,
      bucketSize: BUCKET,
      par: m.par ?? 999,
    };
  }
}

export function level(meta, fn) {
  const b = new Builder(meta);
  fn(b);
  return b.compile();
}
