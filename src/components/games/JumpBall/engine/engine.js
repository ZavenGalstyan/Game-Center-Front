/**
 * Jump Ball — engine. Owns the ONE requestAnimationFrame loop, the Sim, the
 * camera, particles and all canvas drawing. React only receives discrete
 * callbacks (hud / sound / complete / failed / endless) and calls a handful
 * of commands (loadLevel, loadEndless, showMenu, setInput, setPaused …).
 *
 * Time: a fixed-step accumulator runs Sim.step() at PHYS.DT (1/120 s). The
 * real frame delta is clamped (PHYS.MAX_FRAME) and the step count is capped
 * (PHYS.MAX_STEPS), so a lag spike, debugger pause or tab restore can never
 * teleport the ball — and the physics is identical at 30/60/120/144 Hz.
 * Rendering interpolates between the last two sim states.
 *
 * Gameplay coordinates (the Sim) are the only source of truth; this file
 * only reads them.
 */
import { PHYS } from "./constants.js";
import { Sim, platX, platTop, vanishState, LANDABLE } from "./sim.js";
import { steer } from "./bot.js";
import { EndlessGen } from "./endless.js";
import { drawBall, drawBallShadow } from "../render/ball.js";
import { drawPlatform, drawTrack, drawStar, drawGoalAura } from "../render/platforms.js";
import { Background } from "../render/background.js";
import { getWorld, WORLDS } from "../data/worlds.js";
import { getSkin } from "../data/skins.js";

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

const DEATH_DELAY = 0.7; // s of fall/fade before the fail panel
const FINISH_DELAY = 1.15; // s of celebration before the result panel

/* Menu demo: a tiny loop of platforms the bot bounces across forever. */
const DEMO = {
  width: 600,
  platforms: [
    { id: "d0", type: "start", x: 150, y: 0, w: 170 },
    { id: "d1", type: "normal", x: 330, y: 120, w: 150 },
    { id: "d2", type: "spring", x: 500, y: 20, w: 110 },
    { id: "d3", type: "normal", x: 330, y: 330, w: 140 },
  ],
  stars: [],
};
const DEMO_ROUTE = ["d1", "d2", "d3", "d0"];

export class Engine {
  constructor(canvas, cb = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.cb = cb;
    this.bg = new Background();
    this.settings = { graphics: "medium", particles: true, cameraMotion: true, reducedMotion: false, controlHelp: true };
    this.skin = getSkin("classic");
    this.cssW = 1;
    this.cssH = 1;
    this.dpr = 1;
    this.raf = 0;
    this.last = 0;
    this.acc = 0;
    this.time = 0; // real (render) clock for ambient animation
    this.paused = false;
    this.hidden = false;
    this.manual = false;
    this.destroyed = false;
    this.fx = [];
    this.texts = [];
    this.shake = 0;
    this.frame = this.frame.bind(this);
    this.showMenu();
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

  /** DEV harness: drive frames by hand (background tabs get no rAF). */
  setManual(on) {
    this.manual = on;
    if (on) this.stop();
    else this.start();
  }

  /** DEV harness: advance `ms` of real time in frames of `hz`. */
  advance(ms, hz = 60) {
    // the harness runs in background tabs, which report "hidden"
    const hidden = this.hidden;
    this.hidden = false;
    let left = ms / 1000;
    while (left > 1e-9) {
      const dt = Math.min(1 / hz, left);
      this.tick(dt);
      left -= dt;
    }
    this.hidden = hidden;
    this.render();
  }

  frame(now) {
    this.raf = requestAnimationFrame(this.frame);
    const dt = this.last ? (now - this.last) / 1000 : 0;
    this.last = now;
    this.tick(dt);
    this.render();
  }

  resize(cssW, cssH, dprRaw) {
    const cap = this.settings.graphics === "high" ? 2 : this.settings.graphics === "low" ? 1 : 1.5;
    const dpr = Math.min(cap, Math.max(1, dprRaw || 1));
    this.cssW = Math.max(1, cssW);
    this.cssH = Math.max(1, cssH);
    const w = Math.max(1, Math.round(this.cssW * dpr));
    const h = Math.max(1, Math.round(this.cssH * dpr));
    this.dpr = dpr;
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    if (this.manual) this.render();
  }

  setPaused(p) {
    this.paused = p;
    this.last = 0;
    if (p) this.setInput(0);
  }

  setHidden(h) {
    this.hidden = h;
    this.last = 0;
    if (h) this.setInput(0);
  }

  setSettings(s) {
    const prev = this.settings.graphics;
    this.settings = { ...this.settings, ...s };
    if (prev !== this.settings.graphics) this.resize(this.cssW, this.cssH, window.devicePixelRatio || 1);
  }

  setSkin(id) {
    this.skin = getSkin(id);
  }

  get q() {
    return this.settings.graphics;
  }

  get motion() {
    return this.settings.reducedMotion ? 0.25 : 1;
  }

  /* ------------------------------------------------------------ modes */

  reset(sim, world) {
    this.sim = sim;
    this.world = world;
    this.acc = 0;
    this.fx.length = 0;
    this.texts.length = 0;
    this.shake = 0;
    this.endFired = false;
    this.endTimer = 0;
    this.input = 0;
    this.camY = sim.camBottom;
    this.hudKey = "";
    this.introT = 0;
    this.breakSounds = new Set();
    this.maxAlt = 1;
  }

  showMenu() {
    this.mode = "menu";
    this.demo = true;
    const sim = new Sim(DEMO);
    this.demoIdx = 0;
    this.reset(sim, getWorld(1));
  }

  /** Menu screens: paint a world backdrop, optionally without the demo ball. */
  setBackdrop(worldId, demo = true) {
    if (this.mode !== "menu") return;
    this.world = getWorld(worldId);
    this.demo = demo;
  }

  /** level: a data record from data/levels.js */
  loadLevel(level) {
    this.mode = "level";
    this.level = level;
    this.reset(new Sim(level), getWorld(level.world));
    this.maxAlt = Math.max(1, ...level.platforms.map((p) => p.y));
    this.emitHud(true);
  }

  loadEndless(seed) {
    this.mode = "endless";
    this.level = null;
    this.gen = new EndlessGen(seed);
    const first = this.gen.initial();
    const sim = new Sim({ width: PHYS.WIDTH, platforms: first.platforms, stars: first.stars, endless: true });
    this.reset(sim, getWorld(1));
    this.maxAlt = 2500;
    this.feedEndless();
    this.emitHud(true);
  }

  feedEndless() {
    const sim = this.sim;
    while (this.gen.topY < sim.camBottom + PHYS.VIEW_H * 2.2) {
      const chunk = this.gen.next();
      sim.addPlatforms(chunk.platforms);
      sim.addStars(chunk.stars);
    }
    sim.prune(900);
  }

  /* ------------------------------------------------------------ input */

  setInput(dir) {
    this.input = dir;
    if (this.sim && this.mode !== "menu") this.sim.setInput(this.sim.status === "play" ? dir : 0);
  }

  /* ------------------------------------------------------------ tick */

  tick(rawDt) {
    const dt = clamp(rawDt, 0, PHYS.MAX_FRAME);
    this.time += dt;
    if (this.hidden || this.paused) return;
    const sim = this.sim;

    this.acc += dt;
    let n = 0;
    while (this.acc >= PHYS.DT && n < PHYS.MAX_STEPS) {
      if (this.mode === "menu") this.demoStep();
      else sim.setInput(sim.status === "play" ? this.input : 0);
      sim.step();
      if (sim.events.length) this.handleEvents(sim.events);
      sim.events.length = 0;
      this.acc -= PHYS.DT;
      n++;
    }
    if (n === PHYS.MAX_STEPS) this.acc = 0;

    if (this.mode === "endless") this.feedEndless();

    // camera: ease toward the sim's camera (which only ever rises)
    const target = this.mode === "menu" ? -90 : sim.camBottom;
    const rate = this.settings.cameraMotion && !this.settings.reducedMotion ? 6.5 : 14;
    if (target > this.camY) this.camY += (target - this.camY) * (1 - Math.exp(-rate * dt));
    else if (this.mode === "menu") this.camY = target;

    // particles
    const g = 900;
    for (const p of this.fx) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.grav) p.vy -= g * p.grav * dt;
      if (p.drag) {
        p.vx *= 1 - p.drag * dt;
        p.vy *= 1 - p.drag * dt;
      }
      p.rot = (p.rot || 0) + (p.spin || 0) * dt;
    }
    if (this.fx.length) this.fx = this.fx.filter((p) => p.life > 0);
    for (const t of this.texts) t.life -= dt;
    if (this.texts.length) this.texts = this.texts.filter((t) => t.life > 0);
    this.shake = Math.max(0, this.shake - dt * 3);

    // breaking-platform fall sound once the halves actually drop
    for (const p of sim.platforms) {
      if (p.broken && !this.breakSounds.has(p.id) && sim.t - p.brokenAt > 0.16) {
        this.breakSounds.add(p.id);
        if (this.mode !== "menu") this.cb.sound?.("breakFall");
      }
    }

    // end-of-attempt timers
    if (this.mode !== "menu" && sim.status !== "play" && !this.endFired) {
      this.endTimer += dt;
      if (sim.status === "dead" && this.endTimer >= DEATH_DELAY) {
        this.endFired = true;
        this.cb.failed?.(this.result());
      } else if (sim.status === "finished" && this.endTimer >= FINISH_DELAY) {
        this.endFired = true;
        this.cb.complete?.(this.result());
      }
    }
    if (this.mode !== "menu") this.emitHud(false);
  }

  demoStep() {
    const sim = this.sim;
    if (sim.status !== "play") {
      this.showMenu();
      return;
    }
    const id = DEMO_ROUTE[this.demoIdx % DEMO_ROUTE.length];
    const plat = sim.platforms.find((p) => p.id === id);
    sim.setInput(steer(sim, { plat, offset: 0 }));
    // keep the demo from ever drifting the camera
    sim.anchor = 0;
    sim._camFloor = -200;
  }

  result() {
    const s = this.sim;
    return {
      mode: this.mode,
      levelId: this.level?.id ?? null,
      time: s.status === "finished" ? s.endAt : s.t,
      stars: s.stats.stars,
      perfects: s.stats.perfects,
      bestStreak: s.stats.bestStreak,
      bounces: s.stats.bounces,
      moving: s.stats.moving,
      springs: s.stats.springs,
      breaks: s.stats.breaks,
      height: Math.floor(s.stats.height / 10),
      cause: s.deathCause,
      finished: s.status === "finished",
      playMs: Math.round(s.t * 1000),
    };
  }

  emitHud(force) {
    const s = this.sim;
    const tenth = Math.floor(s.t * 10);
    const height = Math.floor(s.stats.height / 10);
    const key = `${tenth}|${s.stats.stars}|${s.stats.streak}|${height}|${s.status}`;
    if (!force && key === this.hudKey) return;
    this.hudKey = key;
    this.cb.hud?.({
      time: s.status === "finished" ? s.endAt : s.t,
      stars: s.stats.stars,
      totalStars: s.stars.length,
      streak: s.stats.streak,
      height,
      status: s.status,
      mode: this.mode,
    });
  }

  /* ------------------------------------------------------------ events → fx */

  burst(x, y, n, o) {
    if (!this.settings.particles && !o.essential) return;
    const cap = this.q === "low" ? 90 : this.q === "high" ? 320 : 200;
    const mult = this.q === "low" ? 0.5 : this.q === "high" ? 1.4 : 1;
    const count = Math.max(1, Math.round(n * mult));
    for (let i = 0; i < count && this.fx.length < cap; i++) {
      const a = (o.a0 ?? 0) + (o.spread ?? TAU) * (o.spread ? Math.random() - 0.5 : Math.random());
      const sp = (o.speed ?? 120) * (0.4 + Math.random() * 0.8);
      this.fx.push({
        x: x + (o.jx ? (Math.random() - 0.5) * o.jx : 0),
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: (o.life ?? 0.5) * (0.7 + Math.random() * 0.5),
        max: o.life ?? 0.5,
        size: (o.size ?? 4) * (0.6 + Math.random() * 0.7),
        color: o.color ?? "#fff",
        kind: o.kind ?? "dot",
        grav: o.grav ?? 0,
        drag: o.drag ?? 2,
        spin: (Math.random() - 0.5) * 10,
        toHud: o.toHud,
      });
    }
  }

  handleEvents(events) {
    const menu = this.mode === "menu";
    const sound = (n, d) => !menu && this.cb.sound?.(n, d);
    for (const e of events) {
      if (menu && e.type === "land" && e.platform === DEMO_ROUTE[this.demoIdx % DEMO_ROUTE.length]) this.demoIdx++;
      if (e.type === "land") {
        const w = this.world;
        const up = Math.PI / 2;
        this.burst(e.x, e.y, e.perfect ? 7 : 5, { a0: up, spread: 2.2, speed: 110, life: 0.42, size: 4, color: w.dust, grav: 0.35, jx: 18 });
        if (e.ptype === "spring") {
          this.burst(e.x, e.y + 6, 10, { a0: up, spread: 1.1, speed: 320, life: 0.5, size: 3.5, color: "#ffe36b", grav: 0.5, kind: "spark" });
          if (!menu && this.settings.cameraMotion) this.shake = Math.max(this.shake, 0.5);
          sound("spring");
        } else if (e.ptype === "breaking") {
          this.burst(e.x, e.y - 8, 8, { a0: -up, spread: 2.6, speed: 90, life: 0.7, size: 4, color: "#b67a3c", grav: 1, kind: "shard" });
          sound("crack");
          sound("bounce", { impact: e.impact });
        } else if (e.ptype === "ice") {
          this.burst(e.x, e.y, 6, { a0: up, spread: 2.8, speed: 140, life: 0.5, size: 2.6, color: "#e8f8ff", grav: 0.2, kind: "spark" });
          sound("ice");
          sound("bounce", { impact: e.impact });
        } else sound("bounce", { impact: e.impact });
        if (e.perfect && !menu) {
          this.burst(e.x, e.y + 10, 4, { a0: up, spread: 1.6, speed: 150, life: 0.55, size: 3, color: "#fff3b0", kind: "spark", essential: true });
          this.fx.push({ x: e.x, y: e.y, vx: 0, vy: 0, life: 0.35, max: 0.35, size: 10, kind: "ring", color: "#fff6c8" });
          this.texts.push({ x: e.x, y: e.y + PHYS.R * 2.8, text: e.streak > 1 ? `PERFECT ×${e.streak}` : "PERFECT", life: 0.8, max: 0.8 });
          sound("perfect", { streak: e.streak });
        }
      } else if (e.type === "star") {
        this.burst(e.x, e.y, 10, { speed: 160, life: 0.5, size: 3.4, color: "#ffe27a", kind: "spark", essential: true });
        this.fx.push({ x: e.x, y: e.y, vx: 0, vy: 0, life: 0.4, max: 0.4, size: 14, kind: "ring", color: "#ffe27a" });
        // tiny trail toward the HUD star counter
        for (let i = 0; i < 5; i++) this.fx.push({ x: e.x, y: e.y, vx: 0, vy: 0, life: 0.45 + i * 0.05, max: 0.45 + i * 0.05, size: 3.2, kind: "hud", color: "#ffe27a", delay: i * 0.03 });
        sound("star", { count: e.count });
      } else if (e.type === "finish") {
        this.burst(e.x, e.y + 40, 40, { a0: Math.PI / 2, spread: 1.6, speed: 420, life: 1.3, size: 5, color: null, kind: "confetti", grav: 0.9, drag: 1.2, essential: true });
        this.fx.push({ x: e.x, y: e.y, vx: 0, vy: 0, life: 0.6, max: 0.6, size: 24, kind: "ring", color: "#ffe9a0" });
        sound("finish");
      } else if (e.type === "death") {
        if (e.cause === "spikes") {
          this.burst(e.x, e.y, 16, { speed: 240, life: 0.6, size: 4, color: this.skin.base, grav: 0.8, essential: true });
          if (this.settings.cameraMotion) this.shake = 0.8;
        }
        sound("fail", { cause: e.cause });
      } else if (e.type === "wall") {
        sound("wall");
      }
    }
  }

  /* ------------------------------------------------------------ render */

  view() {
    const W = this.cssW;
    const H = this.cssH;
    // portrait phones: spend the width on the playfield (bigger ball), keep a sliver of wall
    const margin = W < H ? 16 : 70;
    const s = this.mode === "menu" ? Math.min(H / 700, W / (PHYS.WIDTH + margin)) : Math.min(H / PHYS.VIEW_H, W / (PHYS.WIDTH + margin));
    const colW = PHYS.WIDTH * s;
    let offX = (W - colW) / 2;
    if (this.mode === "menu") offX = W > H * 1.2 ? W * 0.72 - colW / 2 : offX;
    const a = this.paused ? 1 : clamp(this.acc / PHYS.DT, 0, 1);
    const shake = this.shake > 0 && !this.settings.reducedMotion ? this.shake * this.shake * 5 : 0;
    return { W, H, s, offX, a, colW, sx: shake ? (Math.random() - 0.5) * shake : 0, sy: shake ? (Math.random() - 0.5) * shake : 0 };
  }

  render() {
    const ctx = this.ctx;
    const sim = this.sim;
    if (!sim) return;
    const v = this.view();
    const { W, H, s, offX } = v;
    const q = this.q;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    // endless cycles the five worlds as you climb
    let world = this.world;
    if (this.mode === "endless") world = WORLDS[Math.min(WORLDS.length - 1, Math.floor(Math.max(0, sim.anchor) / 3000))];
    this.drawWorld = world;

    const camY = this.camY;
    const alt = this.mode === "endless" ? ((Math.max(0, camY) % 3000) / 3000) : camY / this.maxAlt;
    // clouds step back during play so platforms stay the heroes
    this.bg.draw(ctx, world.key, W, H, Math.max(0, camY + 140), s, this.time, q, alt, this.motion, this.mode === "menu" ? 1 : 0.62);

    if (this.mode === "menu" && !this.demo) {
      this.cb.frame?.();
      return;
    }

    ctx.save();
    ctx.translate(v.sx, v.sy);
    const X = (x) => offX + x * s;
    const Y = (y) => H - (y - camY) * s;

    // playfield column: darken outside, soft glowing rails at the hard walls
    if (this.mode !== "menu") {
      ctx.fillStyle = "rgba(10,15,40,0.16)";
      ctx.fillRect(0, 0, offX, H);
      ctx.fillRect(offX + v.colW, 0, W - offX - v.colW, H);
      for (const x of [offX, offX + v.colW]) {
        const g = ctx.createLinearGradient(x - 10, 0, x + 10, 0);
        g.addColorStop(0, "rgba(255,255,255,0)");
        g.addColorStop(0.5, "rgba(255,255,255,0.13)");
        g.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = g;
        ctx.fillRect(x - 10, 0, 20, H);
      }
    }

    const tR = sim.t - PHYS.DT + v.a * PHYS.DT; // interpolated sim time
    const top = camY + H / s + 60;
    const bottom = camY - 80;
    const vis = [];
    for (const p of sim.platforms) {
      const pt = platTop(p, tR);
      const range = p.move && p.move.axis === "y" ? p.move.amp : 0;
      if (pt - range > top || pt + range + (p.broken ? 400 : 40) < bottom) continue;
      vis.push(p);
    }

    // movement tracks
    for (const p of vis) {
      if (!p.move || p.broken) continue;
      if (p.move.axis === "y") {
        const x = X(p.x);
        const y0 = Y(p.y - p.move.amp) + p.h * s * 0.5;
        const y1 = Y(p.y + p.move.amp) + p.h * s * 0.5;
        ctx.save();
        ctx.strokeStyle = "rgba(255,255,255,0.3)";
        ctx.setLineDash([Math.max(2, s * 4), Math.max(3, s * 7)]);
        ctx.lineWidth = Math.max(1, s * 2);
        ctx.beginPath();
        ctx.moveTo(x, y0);
        ctx.lineTo(x, y1);
        ctx.stroke();
        ctx.restore();
      } else {
        drawTrack(ctx, X(p.x - p.move.amp), X(p.x + p.move.amp), Y(p.y) + p.h * s * 0.5, s);
      }
    }

    // goal aura behind everything on the pad
    for (const p of vis) {
      if (p.type !== "finish") continue;
      const px = platX(p, tR);
      drawGoalAura(ctx, { x: X(px - p.w / 2), y: Y(platTop(p, tR)), w: p.w * s, h: p.h * s, s }, this.time, q);
    }

    // platforms
    for (const p of vis) {
      const px = platX(p, tR);
      const pt = platTop(p, tR);
      const hitAge = sim.t - p.hitAt;
      const dip = hitAge >= 0 && hitAge < 0.18 && !this.settings.reducedMotion ? Math.sin((hitAge / 0.18) * Math.PI) * s * (p.type === "spring" ? 0 : 3.5) : 0;
      let comp = 0;
      if (p.type === "spring" && hitAge >= 0 && hitAge < 0.3) {
        comp = hitAge < 0.06 ? hitAge / 0.06 : Math.max(0, Math.cos(((hitAge - 0.06) / 0.24) * Math.PI * 1.5) * (1 - (hitAge - 0.06) / 0.24));
      }
      drawPlatform(
        ctx,
        p,
        { x: X(px - p.w / 2), y: Y(pt), w: p.w * s, h: p.h * s, s },
        {
          t: this.time,
          world,
          q,
          dip,
          comp,
          vis: p.type === "vanish" ? vanishState(p, tR) : null,
          breakK: p.broken ? clamp((sim.t - p.brokenAt) / 0.9, 0, 1) : 0,
          seed: p.seq * 1.37 + p.x * 0.01,
        }
      );
    }

    // stars
    for (const st of sim.stars) {
      const age = st.taken ? sim.t - st.takenAt : 0;
      if (st.taken && age > 0.3) continue;
      if (st.y < bottom || st.y > top) continue;
      drawStar(ctx, X(st.x), Y(st.y), PHYS.STAR_R * s * 0.95, this.time, st.taken ? age / 0.3 : 0);
    }

    this.drawBallLayer(ctx, v, X, Y, tR, world);
    this.drawFx(ctx, v, X, Y);
    ctx.restore();

    // control hint on the first bounces of Level 1 / any level with help on
    this.cb.frame?.();
  }

  drawBallLayer(ctx, v, X, Y, tR, world) {
    const sim = this.sim;
    const b = sim.ball;
    const { s, a } = v;
    const R = PHYS.R;
    const bx = b.px + (b.x - b.px) * a;
    let by = b.py + (b.y - b.py) * a;
    const q = this.q;

    // contact shadow on the platform directly below
    let best = null;
    let bestTop = -Infinity;
    for (const p of sim.platforms) {
      if (!LANDABLE.has(p.type) || p.broken) continue;
      if (p.type === "vanish") {
        const ph = vanishState(p, tR).phase;
        if (ph === "off" || ph === "back") continue;
      }
      const pt = platTop(p, tR);
      if (pt > by - R + 2) continue;
      if (Math.abs(bx - platX(p, tR)) > p.w / 2 + R * 0.3) continue;
      if (pt > bestTop) {
        bestTop = pt;
        best = p;
      }
    }

    // squash / stretch (visual only; physics already bounced)
    const age = sim.t - b.landedAt + (a - 1) * PHYS.DT;
    const spring = b.landType === "spring";
    const amt = spring ? 0.24 : 0.16;
    let sy = 1;
    const HOLD = 0.05; // contact hold (ms-scale) so the squash reads on the surface
    const REC = 0.14;
    let alive = sim.status !== "dead";
    if (alive && age >= 0 && age < HOLD) {
      const k = Math.sin((age / HOLD) * Math.PI * 0.5);
      sy = 1 - amt * k;
      // keep the drawn ball on the contact point while it squashes
      const lift = by - (b.landTop ?? by);
      by = by - lift * (1 - Math.pow(age / HOLD, 1.6));
    } else if (alive && age >= HOLD && age < HOLD + REC) {
      // release: snap from squash into a launch stretch as it leaves the
      // surface, then settle back to round
      const u = (age - HOLD) / REC;
      const st = spring ? 0.16 : 0.09;
      if (u < 0.3) {
        const k = u / 0.3;
        sy = 1 - amt + (amt + st) * (1 - (1 - k) * (1 - k));
      } else sy = 1 + st * (1 - (u - 0.3) / 0.7);
    } else {
      const vy = b.vy;
      sy = 1 + clamp(Math.abs(vy) / PHYS.MAX_FALL, 0, 1) * (vy < 0 ? 0.09 : 0.05);
    }
    if (this.settings.reducedMotion) sy = 1 + (sy - 1) * 0.4;
    const sx = 1 / Math.sqrt(sy);

    if (best && sim.status !== "dead") {
      const d = by - R - bestTop;
      const k = clamp(1 - d / 380, 0, 1) * (age >= 0 && age < HOLD ? 1.15 : 1);
      const px = platX(best, tR);
      const cx = clamp(bx, px - best.w / 2 + 6, px + best.w / 2 - 6);
      drawBallShadow(ctx, X(cx), Y(bestTop) + 1.5 * s, R * s * sx, k);
    }

    let alpha = 1;
    if (sim.status === "dead") {
      const t = sim.t - sim.endAt;
      alpha = sim.deathCause === "spikes" ? Math.max(0, 1 - t / 0.25) : Math.max(0, 1 - t / (DEATH_DELAY * 0.9));
    }
    const glow = sim.status === "finished" ? 0.6 + 0.4 * Math.sin(this.time * 6) : b.state === "SPRING_BOOST" ? 0.5 : 0;
    drawBall(ctx, {
      x: X(bx),
      y: Y(by),
      r: R * s,
      rot: b.spin,
      sx,
      sy,
      skin: this.skin,
      rim: world.rim,
      alpha,
      glow,
      quality: q,
    });
  }

  drawFx(ctx, v, X, Y) {
    const { s, W } = v;
    const confetti = ["#ff5d73", "#ffd76a", "#4df0ff", "#7cf08a", "#b98cff"];
    for (const p of this.fx) {
      const k = clamp(p.life / p.max, 0, 1);
      if (p.kind === "hud") {
        // fly from the star to the HUD counter (top-right, screen space)
        if (p.delay && p.max - p.life < p.delay) continue;
        const u = 1 - k;
        const sx0 = X(p.x);
        const sy0 = Y(p.y);
        const tx = W - 70;
        const ty = 26;
        const e = u * u * (3 - 2 * u);
        ctx.globalAlpha = Math.min(1, k * 2);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(sx0 + (tx - sx0) * e, sy0 + (ty - sy0) * e - Math.sin(u * Math.PI) * 40, p.size * s * (0.6 + k * 0.6), 0, TAU);
        ctx.fill();
        continue;
      }
      const x = X(p.x);
      const y = Y(p.y);
      if (p.kind === "ring") {
        ctx.globalAlpha = k * 0.9;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = Math.max(1.5, s * 3 * k);
        ctx.beginPath();
        ctx.ellipse(x, y, p.size * s * (1 + (1 - k) * 3.2), p.size * s * (1 + (1 - k) * 3.2) * 0.4, 0, 0, TAU);
        ctx.stroke();
      } else if (p.kind === "confetti") {
        ctx.globalAlpha = Math.min(1, k * 2);
        if (!p.color) p.color = confetti[Math.floor(Math.random() * confetti.length)];
        ctx.fillStyle = p.color;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(p.rot);
        ctx.fillRect(-p.size * s, -p.size * s * 0.4, p.size * s * 2, p.size * s * 0.8);
        ctx.restore();
      } else if (p.kind === "spark") {
        ctx.globalAlpha = k;
        ctx.fillStyle = p.color;
        const r = p.size * s * (0.4 + k * 0.8);
        ctx.beginPath();
        ctx.moveTo(x, y - r * 2);
        ctx.lineTo(x + r * 0.5, y);
        ctx.lineTo(x, y + r * 2);
        ctx.lineTo(x - r * 0.5, y);
        ctx.closePath();
        ctx.moveTo(x - r * 2, y);
        ctx.lineTo(x, y + r * 0.5);
        ctx.lineTo(x + r * 2, y);
        ctx.lineTo(x, y - r * 0.5);
        ctx.fill();
      } else if (p.kind === "shard") {
        ctx.globalAlpha = k;
        ctx.fillStyle = p.color;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(p.rot);
        ctx.fillRect(-p.size * s * 0.8, -p.size * s * 0.5, p.size * s * 1.6, p.size * s);
        ctx.restore();
      } else {
        ctx.globalAlpha = k * 0.85;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(x, y, p.size * s * (0.5 + k * 0.7), 0, TAU);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    // PERFECT texts
    for (const t of this.texts) {
      const k = clamp(t.life / t.max, 0, 1);
      const u = 1 - k;
      const size = Math.max(11, 17 * s + 4) * (u < 0.15 ? 0.8 + (u / 0.15) * 0.25 : 1.05);
      ctx.globalAlpha = Math.min(1, k * 2.2);
      ctx.font = `900 ${size.toFixed(1)}px "Segoe UI", system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const x = X(t.x);
      const y = Y(t.y + u * 40);
      ctx.lineWidth = Math.max(2, size * 0.18);
      ctx.strokeStyle = "rgba(90,50,0,0.45)";
      ctx.strokeText(t.text, x, y);
      const g = ctx.createLinearGradient(0, y - size / 2, 0, y + size / 2);
      g.addColorStop(0, "#fffbe0");
      g.addColorStop(1, "#ffc94a");
      ctx.fillStyle = g;
      ctx.fillText(t.text, x, y);
    }
    ctx.globalAlpha = 1;
  }
}
