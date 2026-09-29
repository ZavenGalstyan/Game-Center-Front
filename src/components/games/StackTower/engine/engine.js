/**
 * Stack Tower — engine. Owns the one requestAnimationFrame loop, all game
 * state and all canvas drawing. React never sees per-frame data: it gets
 * discrete callbacks (HUD changes, game over) and calls a handful of
 * commands (press, newRun, setMode, setTheme, setSettings, setPaused).
 *
 * Game state (play mode):
 *   playing  – a moving block exists and input is accepted
 *   placing  – a block just landed; input locked until the next spawns
 *   falling  – full miss; the lost block tumbles, then → over
 *   over     – result overlay is up (camera pulls back to show the tower)
 * Menu mode runs a lightweight auto-stacking demo on the same renderer.
 *
 * Logical geometry is the single source of truth; rendering only reads it.
 * Movement is an analytic function of accumulated time (stackMath.oscillate),
 * so it is identical at 30/60/144 Hz, and dt is clamped so a lag spike or tab
 * switch can never teleport the block.
 */
import {
  BASE_SIZE,
  BLOCK_H,
  resolvePlacement,
  oscillate,
  speedFor,
  entryFor,
} from "./stackMath.js";
import { drawBox, drawContactShadow, drawRing, drawTopGlow, project, K2, K3 } from "../render/blocks.js";
import { Background } from "../render/background.js";
import { blockColor, getTheme } from "../data/themes.js";

const SPAWN_DELAY = 0.2; // s between landing and the next block
const MISS_DELAY = 0.9; // s of tumbling before the result overlay
const GRAVITY = 42;
const MAX_DT = 1 / 20;
const BASE_CAP = 1.2;
const BASE_DEPTH = 80;
const DEMO_START = 14;

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Engine {
  constructor(canvas, callbacks = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.cb = callbacks;
    this.bg = new Background();
    this.theme = getTheme("skyline");
    this.settings = { graphics: "medium", particles: true, cameraMotion: true, reducedMotion: false };
    this.w = 1;
    this.h = 1;
    this.dpr = 1;
    this.cssW = 1;
    this.cssH = 1;
    this.time = 0;
    this.raf = 0;
    this.last = 0;
    this.paused = false;
    this.hidden = false;
    this.manual = false;
    this.destroyed = false;
    this.nextId = 1;
    this.mode = "menu";
    this.rnd = mulberry(20260929);
    this.resetWorld();
    this.buildDemo();
    this.frame = this.frame.bind(this);
  }

  /* ------------------------------------------------------------ lifecycle */

  start() {
    if (this.manual || this.raf || this.destroyed) return;
    this.last = 0;
    this.raf = requestAnimationFrame(this.frame);
  }

  stop() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  destroy() {
    this.destroyed = true;
    this.stop();
  }

  /** DEV test harness: drive frames by hand (hidden tabs get no rAF). */
  setManual(on) {
    this.manual = on;
    if (on) this.stop();
    else this.start();
  }

  advance(ms) {
    let left = ms / 1000;
    while (left > 1e-9) {
      const dt = Math.min(1 / 60, left);
      this.step(dt);
      left -= dt;
    }
    this.render();
  }

  frame(now) {
    this.raf = requestAnimationFrame(this.frame);
    // first frame after start / resume: no time has "passed" for the game
    const dt = this.last ? clamp((now - this.last) / 1000, 0, MAX_DT) : 0;
    this.last = now;
    this.step(dt);
    this.render();
  }

  resize(cssW, cssH, dprRaw) {
    const cap = this.settings.graphics === "high" ? 2 : this.settings.graphics === "low" ? 1 : 1.5;
    const dpr = Math.min(cap, Math.max(1, dprRaw || 1));
    const w = Math.max(1, Math.round(cssW * dpr));
    const h = Math.max(1, Math.round(cssH * dpr));
    this.cssW = cssW;
    this.cssH = cssH;
    this.dpr = dpr;
    if (w === this.w && h === this.h) return;
    this.w = w;
    this.h = h;
    this.canvas.width = w;
    this.canvas.height = h;
    if (this.manual) this.render();
  }

  setPaused(p) {
    this.paused = p;
    this.last = 0;
  }

  setHidden(h) {
    this.hidden = h;
    this.last = 0;
  }

  setTheme(id) {
    this.theme = getTheme(id);
    for (const b of this.blocks) b.hsl = this.colorFor(b.level);
    if (this.active) this.active.hsl = this.colorFor(this.blocks.length + 1);
    this.baseRgb = this.baseColor();
  }

  setSettings(s) {
    const prevGfx = this.settings.graphics;
    this.settings = { ...this.settings, ...s };
    if (prevGfx !== this.settings.graphics) {
      this.w = 0; // force a DPR-aware resize
      this.resize(this.cssW, this.cssH, window.devicePixelRatio || 1);
    }
  }

  get motion() {
    return this.settings.reducedMotion ? 0.3 : 1;
  }

  /* ---------------------------------------------------------------- world */

  colorFor(level) {
    return blockColor(this.theme, level);
  }

  baseColor() {
    return this.theme.base;
  }

  resetWorld() {
    this.blocks = [];
    this.active = null;
    this.pieces = [];
    this.fx = [];
    this.sparks = [];
    this.phase = "playing";
    this.phaseTimer = 0;
    this.streak = 0;
    this.run = { height: 0, perfects: 0, bestStreak: 0, cuts: 0, playMs: 0 };
    this.camY = 0;
    this.camTarget = 0;
    this.camOff = 0;
    this.camVel = 0;
    this.pulse = 0;
    this.zoom = 1;
    this.zoomTarget = 1;
    this.slow = 0;
    this.flash = 0;
    this.fade = 0;
    this.shift = this.mode === "menu" && this.w / this.h > 1.25 ? 0.2 : 0;
    this.overFired = false;
    this.baseRgb = this.baseColor();
  }

  top() {
    return this.blocks.length ? this.blocks[this.blocks.length - 1] : { x: 0, z: 0, w: BASE_SIZE, d: BASE_SIZE, level: 0 };
  }

  topY() {
    return this.blocks.length * BLOCK_H;
  }

  addBlock(fp, extra = {}) {
    const level = this.blocks.length + 1;
    const b = {
      id: this.nextId++,
      level,
      x: fp.x,
      z: fp.z,
      w: fp.w,
      d: fp.d,
      y: (level - 1) * BLOCK_H,
      h: BLOCK_H,
      axis: extra.axis || "x",
      hsl: this.colorFor(level),
      flash: 0,
    };
    this.blocks.push(b);
    return b;
  }

  spawn() {
    const n = this.blocks.length + 1;
    const { axis, sign } = entryFor(n);
    const t = this.top();
    const v = this.mode === "menu" ? 9 : speedFor(n);
    this.active = {
      axis,
      sign,
      center: axis === "x" ? t.x : t.z,
      x: t.x,
      z: t.z,
      w: t.w,
      d: t.d,
      t: 0,
      v,
      hsl: this.colorFor(n),
    };
    this.updateActive(0);
    if (this.mode === "menu") this.demoPlan();
  }

  updateActive(dt) {
    const a = this.active;
    if (!a) return;
    a.t += dt;
    const p = a.center + a.sign * oscillate(a.t, a.v);
    if (a.axis === "x") a.x = p;
    else a.z = p;
  }

  /** Velocity (signed, units/s) of the active block along its axis — used to
   *  keep a missed block moving the way it was going as it falls. */
  activeVelocity() {
    const a = this.active;
    const e = 1e-3;
    return (a.sign * (oscillate(a.t + e, a.v) - oscillate(a.t - e, a.v))) / (2 * e);
  }

  /* ----------------------------------------------------------------- runs */

  setMode(mode) {
    this.mode = mode;
    if (mode === "menu") this.buildDemo();
    else this.newRun();
  }

  newRun() {
    this.mode = "play";
    this.resetWorld();
    this.fade = 1;
    this.spawn();
    this.emitHud();
  }

  buildDemo() {
    this.resetWorld();
    this.mode = "menu";
    const rnd = mulberry(77);
    for (let i = 1; i <= DEMO_START; i++) {
      const { axis, sign } = entryFor(i);
      const t = this.top();
      const cur = { x: t.x, z: t.z, w: t.w, d: t.d };
      const perfect = rnd() < 0.45;
      const off = perfect ? 0 : sign * (0.25 + rnd() * 0.55) * (rnd() < 0.5 ? 1 : -1);
      cur[axis] += off;
      const r = resolvePlacement(t, cur, axis, 0);
      this.addBlock(r.placed, { axis });
    }
    this.camY = this.camTarget = this.cameraTargetFor();
    this.spawn();
  }

  demoPlan() {
    const r = this.rnd();
    this.demoOffset = r < 0.5 ? 0 : (this.rnd() - 0.5) * 1.4;
    this.demoPasses = 0;
    this.demoPrevSide = null;
  }

  /* ---------------------------------------------------------------- input */

  /** Place the moving block. Returns false when input is locked. */
  press() {
    if (this.mode !== "play" || this.phase !== "playing" || !this.active || this.paused) return false;
    this.place();
    return true;
  }

  place() {
    const a = this.active;
    const prev = this.top();
    const cur = { x: a.x, z: a.z, w: a.w, d: a.d };
    const res = resolvePlacement(prev, cur, a.axis, this.streak);
    const isMenu = this.mode === "menu";
    const sfx = isMenu ? null : this.cb.sound;

    if (res.kind === "miss") {
      const vel = this.activeVelocity();
      const piece = this.makePiece(cur, this.topY(), a.hsl, a.axis, Math.sign(vel) || a.sign, vel * 0.8);
      this.pieces.push(piece);
      this.active = null;
      if (isMenu) {
        this.phase = "placing";
        this.phaseTimer = SPAWN_DELAY;
        return;
      }
      this.phase = "falling";
      this.phaseTimer = MISS_DELAY;
      this.streak = 0;
      sfx?.("miss");
      this.emitHud();
      return;
    }

    const y = this.topY();
    const block = this.addBlock(res.placed, { axis: a.axis });
    this.active = null;
    this.phase = "placing";
    this.phaseTimer = SPAWN_DELAY;
    this.camTarget = this.cameraTargetFor();
    const cam = this.settings.cameraMotion && !this.settings.reducedMotion;
    if (cam) this.camVel += 3.2; // tiny settle: the scene dips then recovers

    if (res.kind === "perfect") {
      this.streak += 1;
      if (!isMenu) {
        this.run.perfects += 1;
        this.run.bestStreak = Math.max(this.run.bestStreak, this.streak);
      }
      const st = this.streak;
      block.flash = 1;
      this.fx.push({ type: "ring", blk: block, y: y + BLOCK_H, age: 0, life: 0.55, strong: st >= 2 });
      if (st >= 5) this.fx.push({ type: "ring", blk: block, y: y + BLOCK_H, age: -0.09, life: 0.6, strong: true });
      this.fx = this.fx.filter((f) => f.type !== "text"); // newest callout replaces the last
      this.fx.push({ type: "text", text: st >= 2 ? `PERFECT ×${st}` : "PERFECT!", blk: block, y: y + BLOCK_H, age: 0, life: 0.9, big: st >= 5 });
      if (this.settings.particles) this.spawnSparks(block, y + BLOCK_H, Math.min(6, 2 + st));
      if (cam) this.pulse = Math.min(0.02, 0.008 + st * 0.001);
      if (st > 0 && st % 10 === 0) {
        // premium accent: brief time emphasis + soft sky flash
        this.slow = this.settings.reducedMotion ? 0 : 0.32;
        this.flash = this.settings.reducedMotion ? 0.12 : 0.28;
      }
      sfx?.("perfect", { streak: st, recovered: res.recovered });
    } else {
      this.streak = 0;
      const prevSize = a.axis === "x" ? prev.w : prev.d;
      let cutSize = 0;
      for (const p of res.pieces) {
        const size = a.axis === "x" ? p.w : p.d;
        cutSize += size;
        this.pieces.push(this.makePiece(p, y, a.hsl, a.axis, p.side, 0));
      }
      if (!isMenu) this.run.cuts += res.pieces.length;
      sfx?.("cut", { frac: cutSize / prevSize, size: (a.axis === "x" ? res.placed.w : res.placed.d) / BASE_SIZE });
    }
    if (!isMenu) {
      this.run.height = this.blocks.length;
      this.emitHud();
    }
  }

  makePiece(fp, y, hsl, axis, side, along) {
    const rm = this.settings.reducedMotion ? 0.35 : 1;
    const size = axis === "x" ? fp.w : fp.d;
    const spin = (1.4 + 2.2 / (1 + size)) * rm * (0.85 + this.rnd() * 0.3);
    const out = side * (1.2 + this.rnd() * 0.8);
    const vx = axis === "x" ? out + along : 0;
    const vz = axis === "z" ? out + along : 0;
    return {
      x: fp.x,
      y,
      z: fp.z,
      w: fp.w,
      h: BLOCK_H,
      d: fp.d,
      hsl,
      vx,
      vy: 1.2,
      vz,
      rot: { axis: axis === "x" ? "z" : "x", a: 0 },
      spin: axis === "x" ? -side * spin : side * spin,
      age: 0,
      size: Math.min(1, (fp.w * fp.d) / (BASE_SIZE * BASE_SIZE) * 3),
      front: fp.x + fp.z > this.top().x + this.top().z,
      gone: false,
    };
  }

  spawnSparks(blk, y, n) {
    for (let i = 0; i < n; i++) {
      const u = this.rnd();
      // along the two front edges of the top face
      const onX = i % 2 === 0;
      const x = onX ? blk.x - blk.w / 2 + u * blk.w : blk.x + blk.w / 2;
      const z = onX ? blk.z + blk.d / 2 : blk.z - blk.d / 2 + u * blk.d;
      this.sparks.push({ x, y, z, vx: onX ? 0 : 1.5, vz: onX ? 1.5 : 0, vy: 3 + this.rnd() * 2, age: 0, life: 0.6 + this.rnd() * 0.25 });
    }
  }

  emitHud() {
    this.cb.hud?.({ height: this.blocks.length, streak: this.streak, phase: this.phase });
  }

  /* -------------------------------------------------------------- camera */

  cameraTargetFor() {
    return this.topY();
  }

  /* ------------------------------------------------------------ simulate */

  step(dtReal) {
    if (this.destroyed) return;
    const frozen = this.paused || (this.hidden && !this.manual);
    if (frozen) dtReal = 0;
    this.time += dtReal;
    let ts = 1;
    if (this.slow > 0) {
      this.slow -= dtReal;
      ts = 0.35;
    }
    const dt = dtReal * ts;

    if (this.mode === "play" && (this.phase === "playing" || this.phase === "placing")) this.run.playMs += dtReal * 1000;

    // active block
    if (this.active) {
      this.updateActive(dt);
      if (this.mode === "menu") this.demoTick();
    }

    // phase timers
    if (this.phase === "placing") {
      this.phaseTimer -= dt;
      if (this.phaseTimer <= 0) {
        if (this.mode === "menu" && this.blocks.length > 30) {
          this.buildDemo();
          this.fade = 0.8;
        } else {
          this.phase = "playing";
          this.spawn();
          if (this.mode === "play") this.emitHud();
        }
      }
    } else if (this.phase === "falling") {
      this.phaseTimer -= dt;
      if (this.phaseTimer <= 0 && !this.overFired) {
        this.overFired = true;
        this.phase = "over";
        const towerH = this.topY();
        // pull back to show the whole tower
        const visibleUnits = this.h / this.baseScale() / K3;
        this.zoomTarget = clamp((visibleUnits * 0.62) / (towerH * 1.0 + 10), 0.18, 1);
        this.camTarget = towerH * 0.5;
        this.emitHud();
        this.cb.gameOver?.({ ...this.run, height: this.blocks.length });
      }
    }

    // falling pieces
    for (const p of this.pieces) {
      p.age += dt;
      p.vy -= GRAVITY * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.rot.a += p.spin * dt;
    }
    const view = this.view();
    const before = this.pieces.length;
    this.pieces = this.pieces.filter((p) => {
      const [, sy] = project(view, p.x, p.y + 3, p.z);
      const off = sy > this.h + 40 * this.dpr || p.age > 5;
      if (off && this.mode === "play" && p.age < 5) this.cb.sound?.("fall", { size: p.size });
      return !off;
    });
    this.piecesRemoved = (this.piecesRemoved || 0) + (before - this.pieces.length);

    // block flashes, fx, sparks
    for (let i = Math.max(0, this.blocks.length - 3); i < this.blocks.length; i++) {
      const b = this.blocks[i];
      if (b.flash > 0) b.flash = Math.max(0, b.flash - dt / 0.35);
    }
    for (const f of this.fx) f.age += dt;
    this.fx = this.fx.filter((f) => f.age < f.life);
    for (const s of this.sparks) {
      s.age += dt;
      s.vy -= 9 * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.z += s.vz * dt;
    }
    this.sparks = this.sparks.filter((s) => s.age < s.life);

    // camera — exponential follow (~400 ms to settle), frame-rate independent
    const k = 1 - Math.exp(-dtReal / 0.13);
    this.camY += (this.camTarget - this.camY) * k;
    this.zoom += (this.zoomTarget - this.zoom) * (1 - Math.exp(-dtReal / 0.35));
    this.shift += ((this.shiftTarget ?? 0) - this.shift) * (1 - Math.exp(-dtReal / 0.3));
    // settle spring
    const stiff = 160;
    const damp = 18;
    this.camVel += (-stiff * this.camOff - damp * this.camVel) * dtReal;
    this.camOff += this.camVel * dtReal;
    if (Math.abs(this.camOff) < 1e-4 && Math.abs(this.camVel) < 1e-3) this.camOff = this.camVel = 0;
    this.pulse = Math.max(0, this.pulse - dtReal * 0.08);
    this.flash = Math.max(0, this.flash - dtReal * 1.2);
    this.fade = Math.max(0, this.fade - dtReal / 0.35);
  }

  /** Menu demo: place when the block passes its planned offset. */
  demoTick() {
    const a = this.active;
    const t = this.top();
    const pos = a.axis === "x" ? a.x : a.z;
    const target = (a.axis === "x" ? t.x : t.z) + this.demoOffset;
    const side = Math.sign(pos - target);
    if (this.demoPrevSide !== null && side !== this.demoPrevSide) {
      this.demoPasses += 1;
      if (this.demoPasses >= 1) {
        // snap exactly onto the planned spot so demo perfects are real perfects
        if (a.axis === "x") a.x = target;
        else a.z = target;
        this.place();
        return;
      }
    }
    this.demoPrevSide = side;
  }

  /* -------------------------------------------------------------- render */

  baseScale() {
    // world units across / down that must fit
    // travel reaches ±~14 screen units; the far turnaround may clip slightly on
    // very narrow portrait screens, which keeps the tower itself large
    return Math.min(this.w / 30, this.h / 27);
  }

  view() {
    const menu = this.mode === "menu";
    const wide = this.w / this.h > 1.25;
    let s = this.baseScale() * this.zoom * (1 + this.pulse) * (menu ? 0.9 : 1);
    const sway = menu && this.settings.cameraMotion && !this.settings.reducedMotion ? Math.sin(this.time * 0.25) * this.w * 0.008 : 0;
    // horizontal framing eases between menu (tower right of the title),
    // play (centred) and result (left of the result card)
    const shiftTarget = !wide ? 0 : menu ? 0.2 : this.phase === "over" ? -0.14 : 0;
    const cx = this.w / 2 + this.shift * this.w + sway;
    this.shiftTarget = shiftTarget;
    return { cx, cy: this.h * 0.47, s, camY: this.camY + this.camOff * 0.12, sway };
  }

  render() {
    const ctx = this.ctx;
    const { w, h } = this;
    if (w < 2 || h < 2) return;
    const q = this.settings.graphics;
    this.bg.build(this.theme, w, h, this.dpr, q);
    const view = this.view();
    const theme = this.theme;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.bg.draw(ctx, this.time, Math.max(0, view.camY), view.s, view.sway, this.motion, this.settings.particles);

    const opts = { tint: theme.tint, quality: q, edgeGlow: theme.edgeGlow, glow: 0.45 };

    // back pieces
    for (const p of this.pieces) if (!p.front) drawBox(ctx, view, p, opts);

    // base: heavy pedestal — a lighter cap slab over a deep column
    const baseTopScreen = project(view, 0, 0, 0)[1];
    if (baseTopScreen - BASE_SIZE * K2 * view.s < h) {
      drawBox(ctx, view, { x: 0, y: -BASE_DEPTH, z: 0, w: BASE_SIZE, h: BASE_DEPTH - BASE_CAP, d: BASE_SIZE, hsl: this.baseRgb }, { ...opts, edgeGlow: null });
      const cap = [this.baseRgb[0], this.baseRgb[1], Math.min(92, this.baseRgb[2] * 1.18)];
      drawBox(ctx, view, { x: 0, y: -BASE_CAP, z: 0, w: BASE_SIZE, h: BASE_CAP, d: BASE_SIZE, hsl: cap }, opts);
      const first = this.blocks[0] || this.active;
      if (first && q !== "low") drawContactShadow(ctx, view, { x: 0, z: 0, w: BASE_SIZE, d: BASE_SIZE }, first, 0, this.blocks[0] ? 1 : 0.6);
    }

    // tower — only what's on screen (walk down from the top until off-screen)
    let lo = this.blocks.length;
    const margin = (BASE_SIZE * K2 + 2) * view.s;
    while (lo > 0) {
      const b = this.blocks[lo - 1];
      const [, sy] = project(view, b.x, b.y + b.h, b.z);
      if (sy - margin > h) break;
      lo--;
    }
    for (let i = lo; i < this.blocks.length; i++) {
      const b = this.blocks[i];
      drawBox(ctx, view, b, { ...opts, flash: b.flash * 0.45 });
      if (q !== "low") {
        const above = this.blocks[i + 1] || (i === this.blocks.length - 1 ? this.active : null);
        if (above) drawContactShadow(ctx, view, b, above, b.y + b.h, this.blocks[i + 1] ? 1 : 0.6);
      }
      if (b.flash > 0) drawTopGlow(ctx, view, b, b.y + b.h, b.flash * 0.35);
    }

    // moving block
    if (this.active) {
      const a = this.active;
      drawBox(ctx, view, { x: a.x, y: this.topY(), z: a.z, w: a.w, h: BLOCK_H, d: a.d, hsl: a.hsl }, opts);
    }

    // perfect rings
    for (const f of this.fx) {
      if (f.type !== "ring" || f.age < 0) continue;
      const k = f.age / f.life;
      const a = (1 - k) * (f.strong ? 0.95 : 0.75);
      drawRing(ctx, view, f.blk, f.y, this.settings.reducedMotion ? k * 0.4 : k, "#ffffff", a, Math.max(1.5, view.s * (f.strong ? 0.12 : 0.08)));
    }

    // front pieces
    for (const p of this.pieces) if (p.front) drawBox(ctx, view, p, opts);

    // sparks
    for (const s of this.sparks) {
      const [sx, sy] = project(view, s.x, s.y, s.z);
      const a = 1 - s.age / s.life;
      const r = Math.max(1.5, view.s * 0.09) * (0.6 + a * 0.4);
      ctx.fillStyle = `rgba(255,255,255,${a})`;
      ctx.beginPath();
      ctx.moveTo(sx, sy - r * 1.6);
      ctx.lineTo(sx + r, sy);
      ctx.lineTo(sx, sy + r * 1.6);
      ctx.lineTo(sx - r, sy);
      ctx.closePath();
      ctx.fill();
    }

    // floating PERFECT text
    for (const f of this.fx) {
      if (f.type !== "text") continue;
      const k = f.age / f.life;
      const [sx, sy0] = project(view, f.blk.x, f.y, f.blk.z);
      const rise = (this.settings.reducedMotion ? 10 : 34) * this.dpr * (1 - (1 - k) * (1 - k));
      const sy = sy0 - (BASE_SIZE * K2 * view.s) * 0.2 - 44 * this.dpr - rise;
      const a = k < 0.15 ? k / 0.15 : k > 0.6 ? 1 - (k - 0.6) / 0.4 : 1;
      const size = Math.round((f.big ? 22 : 18) * this.dpr * Math.min(1.25, Math.max(0.8, this.h / (700 * this.dpr))));
      ctx.font = `800 ${size}px "Segoe UI", system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.globalAlpha = a;
      ctx.fillStyle = "rgba(0,0,0,0.25)";
      ctx.fillText(f.text, sx, sy + 2 * this.dpr);
      ctx.fillStyle = f.big ? "#fff3c4" : "#ffffff";
      ctx.fillText(f.text, sx, sy);
      ctx.globalAlpha = 1;
    }

    if (this.flash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${this.flash * 0.5})`;
      ctx.fillRect(0, 0, w, h);
    }
    if (this.fade > 0) {
      ctx.fillStyle = theme.sky[1];
      ctx.globalAlpha = this.fade;
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1;
    }
  }
}
