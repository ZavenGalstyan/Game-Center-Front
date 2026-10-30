/**
 * Level builder — a "turtle" that lays a course one segment at a time.
 *
 * The cursor sits at the far edge (centre line) of the last platform, at its
 * top height, facing one of four directions (0 = +z, 1 = +x, 2 = −z, 3 = −x).
 * Every segment appends boxes / pickups / enemies / hazards relative to the
 * cursor and ALSO appends the waypoints the test bot follows, so each level
 * carries its own proof-of-completion route (tools/levelTest.mjs).
 *
 * Route steps: ["go",x,z] · ["jump",x,y,z,sprint] · ["waitm",mover,s] ·
 * ["ride",mover,s] · ["bounce",sx,sz,x,y,z] · ["hit",x,z] · ["boss"]
 */
const DIRS = [
  [0, 1],
  [1, 0],
  [0, -1],
  [-1, 0],
];
const FLOOR = -9; // bottom of "column" platforms (well below the kill plane)

export function buildLevel(meta, author) {
  const b = new Builder(meta);
  author(b);
  return b.finish();
}

class Builder {
  constructor(meta) {
    this.meta = meta;
    this.x = 0;
    this.y = 0;
    this.z = 0;
    this.d = 0;
    this.boxes = [];
    this.coinList = [];
    this.honey = [];
    this.chests = [];
    this.checkpoints = [];
    this.enemies = [];
    this.hazards = [];
    this.springs = [];
    this.decor = [];
    this.hints = [];
    this.route = [];
    this.friend = null;
    this.portal = null;
    this.boss = null;
    this.last = null; // last main-path platform box
    this.lastLen = 0;
    this.lastW = 0;
    this.afterMover = false;
    this.movers = 0;
    this.style = meta.style || "col";
  }

  /* ------------------------------------------------------------ geometry helpers */
  /** world point at forward f / lateral s (right +) from the cursor */
  at(f, s = 0) {
    const [fx, fz] = DIRS[this.d];
    const [rx, rz] = DIRS[(this.d + 1) % 4];
    return [this.x + fx * f + rx * s, this.z + fz * f + rz * s];
  }
  rect(f0, f1, s0, s1) {
    const [ax, az] = this.at(f0, s0);
    const [bx, bz] = this.at(f1, s1);
    return [Math.min(ax, bx), Math.max(ax, bx), Math.min(az, bz), Math.max(az, bz)];
  }
  addBox(f0, f1, s0, s1, top, opt = {}) {
    const [x0, x1, z0, z1] = this.rect(f0, f1, s0, s1);
    const thick = opt.thick ?? (this.style === "col" ? top - FLOOR : 0.9);
    const box = { x0, x1, z0, z1, y0: top - thick, y1: top, kind: opt.kind || "ground", surface: opt.surface || "", look: opt.look || "" };
    if (opt.m) box.m = opt.m;
    this.boxes.push(box);
    return box;
  }
  faceAngle() {
    const [fx, fz] = DIRS[this.d];
    return Math.atan2(fx, fz);
  }
  advanceTo(f, s, y) {
    const [x, z] = this.at(f, s);
    this.x = x;
    this.z = z;
    if (y !== undefined) this.y = y;
  }
  go(f, s = 0) {
    const [x, z] = this.at(f, s);
    this.route.push(["go", r2(x), r2(z)]);
  }

  /* ------------------------------------------------------------ course segments */
  start(len = 6, w = 5) {
    this.addBox(-2, len, -w / 2, w / 2, 0, { look: "start" });
    this.start0 = { x: 0, y: 0, z: 0, face: 0 };
    this.advanceTo(len, 0, 0);
    this.last = this.boxes[this.boxes.length - 1];
    this.lastLen = len + 2;
    this.lastW = w;
    return this;
  }

  /**
   * Platform after a gap. opts: gap, dy, side (lateral shift), w, surface,
   * kind ("crumble"), thick, sprint (route hint), look
   */
  pad(len, o = {}) {
    const gap = o.gap ?? 0;
    const dy = o.dy ?? 0;
    const side = o.side ?? 0;
    const w = o.w ?? 3.2;
    const top = this.y + dy;
    const jump = gap > 0.05 || dy > 0.3;
    if (jump) {
      if (!this.afterMover) this.go(-0.35, 0);
      const land = Math.min(1.3, len / 2);
      const [lx, lz] = this.at(gap + land, side);
      this.route.push(["jump", r2(lx), r2(top), r2(lz), !!o.sprint || gap > 3.2]);
      if (o.arc) this.arcCoins(o.arc, gap, dy, side);
    }
    this.afterMover = false;
    const box = this.addBox(gap, gap + len, side - w / 2, side + w / 2, top, o);
    this.advanceTo(gap + len, side, top);
    this.go(-0.5, 0);
    this.last = box;
    this.lastLen = len;
    this.lastW = w;
    return this;
  }
  gap(gap, len = 4, o = {}) {
    return this.pad(len, { ...o, gap });
  }

  /** a turn: a square landing (after an optional gap), then face left/right */
  turn(dir, o = {}) {
    const w = o.w ?? 4;
    const gap = o.gap ?? 0;
    const dy = o.dy ?? 0;
    this.pad(w, { ...o, gap, dy, w });
    // cursor is at the far edge; move to the square's centre and turn
    this.advanceTo(-w / 2, 0);
    this.d = (this.d + (dir === "L" ? 3 : 1)) % 4;
    this.advanceTo(w / 2, 0);
    this.route.pop();
    this.go(-w / 2 + 0.6, 0); // corner centre-ish
    this.go(-0.5, 0);
    this.lastLen = w;
    return this;
  }

  /** stairs of n blocks rising `rise` each */
  steps(n, rise = 0.9, run = 2.2, o = {}) {
    for (let i = 0; i < n; i++) this.pad(run, { ...o, dy: rise, gap: o.gap ?? 0 });
    return this;
  }

  /** n stepping stones (size×size) with gap, optional zig-zag sideways */
  stones(n, gap = 1.8, size = 1.8, o = {}) {
    for (let i = 0; i < n; i++) {
      const zig = o.zig ? (i % 2 ? -o.zig : o.zig) : 0;
      const dy = o.dys ? o.dys[i % o.dys.length] : 0;
      this.pad(size, { ...o, gap, w: size, side: zig, dy });
      if (o.coins !== false) this.coin(-size / 2, 0, 0.9);
    }
    return this;
  }

  /** chain of crumbling stones */
  crumbles(n, gap = 1.6, size = 2, o = {}) {
    return this.stones(n, gap, size, { ...o, kind: "crumble", thick: 0.6 });
  }

  /**
   * Moving platform carrying the bear across a gap.
   * travel: forward distance, side: lateral shift, dy: rise; period s.
   */
  mover(travel, o = {}) {
    const size = o.size ?? 2.4;
    const side = o.side ?? 0;
    const dy = o.dy ?? 0;
    const period = o.period ?? 5.5;
    const g0 = o.gap ?? 0.7;
    const top = this.y + (o.startDy ?? 0);
    const [ax, az] = this.at(g0 + size / 2, 0);
    const [bx, bz] = this.at(g0 + size / 2 + travel, side);
    const idx = this.boxes.length;
    const thick = 0.5;
    // back-to-back movers are phased so the next one waits where the last one arrives
    const prev = this.afterMover ? this.lastMover : null;
    const m = { ax, ay: top - thick / 2, az, bx, by: top + dy - thick / 2, bz, period: prev ? prev.period : period, ph: prev ? (prev.ph + 0.5) % 1 : 0 };
    this.lastMover = m;
    this.addBox(g0, g0 + size, -size / 2, size / 2, top, { thick, kind: "mover", m });
    if (!this.afterMover) this.go(-0.35, 0);
    this.route.push(["waitm", idx, 0]);
    this.route.push(["jump", r2(ax), r2(top), r2(az), false]);
    this.route.push(["ride", idx, 1]);
    this.movers++;
    // cursor → far edge of the mover at B
    this.advanceTo(g0 + size + travel, side, top + dy);
    this.afterMover = true;
    if (o.coins !== false) for (let k = 1; k <= 3; k++) this.coinAt(...this.at(-size / 2 - (travel * k) / 4, -side * (k / 4)), top + 1);
    if (this.movers === 1 && o.hint !== false) this.hint(-size - travel, 0, "Wait for the moving platform, then jump on!");
    return this;
  }
  elevator(rise, o = {}) {
    return this.mover(0.01, { ...o, dy: rise, period: o.period ?? 5 });
  }

  /** hidden side platform with a treasure chest (back by jumping or a spring) */
  secret(dir, o = {}) {
    const dist = o.dist ?? 2.4; // gap from the current pad's side
    const dy = o.dy ?? 0;
    const size = o.size ?? 3;
    const back = o.back ?? 0.5 * this.lastLen; // how far back along the pad
    const top = this.y + dy;
    const f = -Math.min(back, this.lastLen - 1);
    // take the other side if the requested one is already occupied (e.g. right after a turn)
    const clear = (sg) => {
      const [x0, x1, z0, z1] = this.rect(f - size / 2 - 1, f + size / 2 + 1, sg * (this.lastW / 2 + 0.3), sg * (this.lastW / 2 + dist + size + 1));
      return !this.boxes.some((b) => b !== this.last && b.x0 < x1 && b.x1 > x0 && b.z0 < z1 && b.z1 > z0);
    };
    const lb = this.last;
    if (this.hazards.some((h) => [h.x ?? h.x0, h.ax].some((hx) => hx !== undefined && hx >= lb.x0 && hx <= lb.x1) && [h.z ?? h.z0, h.az].some((hz) => hz !== undefined && hz >= lb.z0 && hz <= lb.z1)))
      throw new Error(`level ${this.meta.id}: secret next to a hazard pad`);
    let sgn = dir === "L" ? -1 : 1;
    if (!clear(sgn)) {
      if (!clear(-sgn)) throw new Error(`level ${this.meta.id}: no room for a secret`);
      sgn = -sgn;
    }
    const s0 = sgn * (this.lastW / 2 + dist);
    const s1 = sgn * (this.lastW / 2 + dist + size);
    this.addBox(f - size / 2, f + size / 2, Math.min(s0, s1), Math.max(s0, s1), top, { look: "secret", thick: o.thick ?? (this.style === "col" ? undefined : 0.9) });
    const cs = sgn * (this.lastW / 2 + dist + size / 2);
    const [cx, cz] = this.at(f, cs);
    const [ex, ez] = this.at(f, sgn * (this.lastW / 2 - 0.4));
    const [lx, lz] = this.at(f, sgn * (this.lastW / 2 + dist + 1));
    const [hx, hz] = this.at(f, sgn * (this.lastW / 2 - 0.9));
    this.chests.push({ x: r2(cx), y: top, z: r2(cz), face: this.faceAngle() });
    this.route.push(["go", r2(ex), r2(ez)]);
    this.route.push(["jump", r2(lx), r2(top), r2(lz), dist + Math.max(0, dy) > 2.8]);
    this.route.push(["go", r2(cx), r2(cz)]);
    if (dy < -1.3 || o.spring) {
      // near the main path (short return hop), beside the landing spot
      const [sx, sz] = this.at(f + Math.min(1.1, size / 2 - 0.4), sgn * (this.lastW / 2 + dist + 0.9));
      this.springs.push({ x: r2(sx), y: top, z: r2(sz) });
      this.route.push(["bounce", r2(sx), r2(sz), r2(hx), r2(this.y), r2(hz)]);
    } else {
      const [ox, oz] = this.at(f, sgn * (this.lastW / 2 + dist + 0.4));
      this.route.push(["go", r2(ox), r2(oz)]);
      this.route.push(["jump", r2(hx), r2(this.y), r2(hz), dist > 3.1]);
    }
    this.go(-0.5, 0);
    return this;
  }

  /* ------------------------------------------------------------ things on the last pad */
  coin(f, s, h = 0.9) {
    const [x, z] = this.at(f, s);
    this.coinList.push({ x: r2(x), y: r2(this.y + h), z: r2(z) });
    return this;
  }
  coinAt(x, z, y) {
    this.coinList.push({ x: r2(x), y: r2(y), z: r2(z) });
    return this;
  }
  /** n coins in a line along the last pad (lateral offset s) */
  coins(n, s = 0) {
    const L = this.lastLen;
    for (let i = 0; i < n; i++) this.coin(-L + 0.8 + ((L - 1.6) * (i + 0.5)) / n, s);
    return this;
  }
  /** coins over a jump arc (called by pad()) */
  arcCoins(n, gap, dy, side) {
    for (let i = 1; i <= n; i++) {
      const k = i / (n + 1);
      const [x, z] = this.at(gap * k, side * k);
      this.coinList.push({ x: r2(x), y: r2(this.y + dy * k + 1.2 + Math.sin(Math.PI * k) * 0.9), z: r2(z) });
    }
  }
  /** ring of coins on the last pad */
  ring(n = 6, r = 1.2) {
    const f = -this.lastLen / 2;
    for (let i = 0; i < n; i++) this.coin(f + Math.cos((i / n) * Math.PI * 2) * r, Math.sin((i / n) * Math.PI * 2) * r);
    return this;
  }
  honeyPot(f = -1, s = 0) {
    const [x, z] = this.at(f, s);
    this.honey.push({ x: r2(x), y: r2(this.y + 0.5), z: r2(z) });
    return this;
  }
  checkpoint(f = -1.2, s = 0) {
    const [x, z] = this.at(f, s);
    this.checkpoints.push({ x: r2(x), y: this.y, z: r2(z), face: this.faceAngle() });
    return this;
  }
  hint(f, s, text) {
    const [x, z] = this.at(f, s);
    this.hints.push({ x: r2(x), z: r2(z), r: 5, text });
    return this;
  }

  /** patrol walks along the last pad (or across it with across:true) */
  patrol(o = {}) {
    const L = this.lastLen, W = this.lastW;
    const f = o.f ?? -L / 2;
    let a, c;
    if (o.across) {
      a = this.at(f, -W / 2 + 0.6);
      c = this.at(f, W / 2 - 0.6);
    } else {
      a = this.at(-L + 0.9, o.s ?? 0);
      c = this.at(-0.9, o.s ?? 0);
    }
    const [x0, x1, z0, z1] = this.lastBounds();
    this.enemies.push({ type: "patrol", x: r2((a[0] + c[0]) / 2), y: this.y, z: r2((a[1] + c[1]) / 2), ax: r2(a[0]), az: r2(a[1]), bx: r2(c[0]), bz: r2(c[1]), bounds: [x0, x1, z0, z1], tough: !!o.tough || this.meta.world === 5 });
    return this;
  }
  chaser(o = {}) {
    const f = o.f ?? -this.lastLen / 2;
    const [x, z] = this.at(f, o.s ?? 0);
    this.enemies.push({ type: "chase", x: r2(x), y: this.y, z: r2(z), bounds: this.lastBounds(), tough: !!o.tough || this.meta.world === 5, aggro: o.aggro });
    return this;
  }
  lastBounds() {
    const b = this.last;
    return [r2(b.x0 + 0.5), r2(b.x1 - 0.5), r2(b.z0 + 0.5), r2(b.z1 - 0.5)];
  }

  /* hazards placed on the last pad (f measured back from the cursor) */
  spikes(f = -2, depth = 0.9, o = {}) {
    const W = o.w ?? this.lastW;
    const s = o.s ?? 0;
    const [x0, x1, z0, z1] = this.rect(f - depth / 2, f + depth / 2, s - W / 2 + 0.01, s + W / 2 - 0.01);
    this.hazards.push({ type: "spikes", x0, x1, z0, z1, y: this.y, period: o.period, on: o.on ?? 0.5, ph: o.ph ?? 0 });
    return this;
  }
  bar(o = {}) {
    const f = o.f ?? -this.lastLen / 2;
    const [x, z] = this.at(f, 0);
    this.hazards.push({ type: "bar", x: r2(x), y: this.y, z: r2(z), len: o.len ?? Math.min(this.lastW, this.lastLen) / 2 - 0.1, w: o.w ?? 1.6, ph: o.ph ?? 0 });
    return this;
  }
  saw(o = {}) {
    const f = o.f ?? -this.lastLen / 2;
    const W = this.lastW / 2 - 0.4;
    const a = o.along ? this.at(-this.lastLen + 0.8, 0) : this.at(f, -W);
    const c = o.along ? this.at(-0.8, 0) : this.at(f, W);
    this.hazards.push({ type: "saw", ax: r2(a[0]), az: r2(a[1]), bx: r2(c[0]), bz: r2(c[1]), y: this.y, r: 0.55, period: o.period ?? 3, ph: o.ph ?? 0 });
    return this;
  }
  fire(f = -2, o = {}) {
    const [x, z] = this.at(f, o.s ?? 0);
    this.hazards.push({ type: "fire", x: r2(x), y: this.y, z: r2(z), r: 0.55, period: o.period ?? 3, on: o.on ?? 0.4, ph: o.ph ?? 0 });
    return this;
  }
  drop(f = -2, o = {}) {
    const [x, z] = this.at(f, o.s ?? 0);
    this.hazards.push({ type: "drop", x: r2(x), y: this.y, z: r2(z), top: this.y + 7, r: 0.85, period: o.period ?? 3.2, ph: o.ph ?? 0 });
    return this;
  }
  spring(f = -1, s = 0) {
    const [x, z] = this.at(f, s);
    this.springs.push({ x: r2(x), y: this.y, z: r2(z) });
    return this;
  }
  /** wall boxes beside the last pad (caves / castle; blocks the camera too) */
  walls(h = 3, o = {}) {
    const L = this.lastLen, W = this.lastW;
    const sides = o.sides ?? [-1, 1];
    for (const sg of sides) {
      const s0 = sg * (W / 2), s1 = sg * (W / 2 + 0.8);
      const box = this.addBox(-L, 0, Math.min(s0, s1), Math.max(s0, s1), this.y + h, { look: "wall" });
      box.y0 = this.y - 0.2;
      if (this.style === "col") box.y0 = FLOOR;
    }
    return this;
  }
  deco(kind, f, s, k = 1) {
    const [x, z] = this.at(f, s);
    this.decor.push({ kind, x: r2(x), y: this.y, z: r2(z), k, r: this.d });
    return this;
  }

  /** caged animal friend on the last pad (two swipes free it, opens the portal) */
  rescue(name, kind, f = -this.lastLen / 2, s = 0) {
    const [x, z] = this.at(f, s);
    this.friend = { name, kind, x: r2(x), y: this.y, z: r2(z) };
    this.route.push(["hit", r2(x), r2(z)]);
    this.go(-0.5, 0);
    return this;
  }

  /** final pad with the exit portal */
  goal(len = 5, o = {}) {
    this.pad(len, { w: 4.5, ...o, look: "goal" });
    const [x, z] = this.at(-len / 2, 0);
    this.portal = { x: r2(x), y: this.y, z: r2(z), face: this.faceAngle() };
    this.route.pop();
    this.route.push(["go", r2(x), r2(z)]);
    return this;
  }

  /** boss arena: walled square, gate behind the entrance, portal at its centre */
  arena(hs = 10) {
    if (this.d !== 0) throw new Error("the boss arena must face +z");
    const top = this.y;
    const [cx, cz] = this.at(hs + 0.2, 0);
    const save = [this.x, this.z];
    // floor
    this.addBox(0, 2 * hs + 0.2, -hs, hs, top, { look: "arena" });
    // walls (entrance gap on the near side)
    const H = 2.8, T = 1;
    this.addBox(-T, 0, -hs - T, -1.6, top + H, { look: "wall" });
    this.addBox(-T, 0, 1.6, hs + T, top + H, { look: "wall" });
    this.addBox(2 * hs + 0.2, 2 * hs + 0.2 + T, -hs - T, hs + T, top + H, { look: "wall" });
    this.addBox(0, 2 * hs + 0.2, -hs - T, -hs, top + H, { look: "wall" });
    this.addBox(0, 2 * hs + 0.2, hs, hs + T, top + H, { look: "wall" });
    const gate = this.boxes.length;
    this.addBox(-T, 0, -1.6, 1.6, top + H, { kind: "gate", look: "gate" });
    this.boss = { cx: r2(cx), cz: r2(cz), y: top, hs: hs - 0.2, gate };
    this.x = save[0];
    this.z = save[1];
    const [ix, iz] = this.at(2.4, 0);
    this.checkpoints.push({ x: r2(ix), y: top, z: r2(iz), face: this.faceAngle() });
    this.route.push(["go", r2(ix), r2(iz)]);
    this.route.push(["boss"]);
    const [fx, fz] = this.at(2 * hs - 1.6, 0);
    this.friend = { name: "Queen Honeypaw", kind: "queen", x: r2(fx), y: top, z: r2(fz) };
    this.portal = { x: r2(cx), y: top, z: r2(cz), face: this.faceAngle() };
    this.route.push(["go", r2(cx), r2(cz)]);
    for (let i = 0; i < 4; i++) this.deco("torch", 2 + i * 5, -hs + 0.6), this.deco("torch", 2 + i * 5, hs - 0.6);
    return this;
  }

  finish() {
    const m = this.meta;
    if (!this.portal) throw new Error(`level ${m.id} has no goal`);
    const minTop = Math.min(...this.boxes.filter((b) => b.kind !== "gate").map((b) => b.y1));
    return {
      ...m,
      start: this.start0 || { x: 0, y: 0, z: 0, face: 0 },
      boxes: this.boxes.map((b) => ({ ...b, x0: r2(b.x0), x1: r2(b.x1), z0: r2(b.z0), z1: r2(b.z1), y0: r2(b.y0), y1: r2(b.y1) })),
      coins: this.coinList,
      honey: this.honey,
      chests: this.chests,
      checkpoints: this.checkpoints,
      enemies: this.enemies,
      hazards: this.hazards,
      springs: this.springs,
      decor: this.decor,
      hints: [...(m.hints || []), ...this.hints],
      friend: this.friend,
      portal: this.portal,
      boss: this.boss,
      route: this.route,
      killY: r2(minTop - 6),
    };
  }
}

function r2(v) {
  return Math.round(v * 100) / 100;
}
