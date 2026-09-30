/**
 * Helix Drop — engine glue between the headless Sim and the 3D view.
 *
 * There is exactly ONE loop: R3F's frame loop calls engine.tick(dt) from a
 * single useFrame. tick() runs Sim.step() on a fixed 1/120 s accumulator
 * (frame delta clamped, step count capped → no teleporting after a stall,
 * identical physics at 60/120/144 Hz), applies Smash hit-stop, turns sim
 * events into sound/FX requests and eases the camera toward sim.focus.
 * Render components only READ from here; the tower mesh group uses
 * rotation.y = engine.sim.rot directly (one rotation source of truth).
 */
import { PHYS } from "./constants.js";
import { Sim, classify } from "./sim.js";
import { Bot } from "./bot.js";
import { EndlessGen } from "./endless.js";
import { getWorld, WORLDS } from "../data/worlds.js";

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

const HIT_STOP = 0.045; // s frozen on a smash impact
const DEATH_DELAY = 0.75;
const FINISH_DELAY = 1.25;

/* The menu tower: a short loop the bot drops through forever. */
const DEMO = {
  layers: [
    { off: 120, segs: [["gap", 90], ["safe", 270]] },
    { off: 260, segs: [["gap", 80], ["safe", 220], ["danger", 60]] },
    { off: 40, segs: [["gap", 90], ["safe", 270]] },
    { off: 50, segs: [["gap", 90], ["safe", 270]] },
    { off: 60, segs: [["gap", 90], ["safe", 270]] },
    { off: 200, segs: [["gap", 80], ["safe", 280]] },
    { off: 330, segs: [["gap", 90], ["safe", 200], ["danger", 70]] },
    { off: 100, segs: [["gap", 90], ["safe", 270]] },
    { finish: true, segs: [["safe", 360]] },
  ],
};

export class Engine {
  constructor(cb = {}) {
    this.cb = cb;
    this.settings = { sens: "medium", shake: true, reducedMotion: false, particles: true, graphics: "medium" };
    this.paused = false;
    this.hidden = false;
    this.acc = 0;
    this.time = 0;
    this.fx = []; // spawn requests consumed by the particle / debris layers
    this.layerVersion = 0; // bumps when the tower's layer list changes (rebuild meshes)
    this.showMenu();
  }

  /* ------------------------------------------------------------ modes */

  reset(sim, world, mode) {
    this.sim = sim;
    this.world = world;
    this.mode = mode;
    this.acc = 0;
    this.hitStop = 0;
    this.shake = 0;
    this.endTimer = 0;
    this.endFired = false;
    this.fx.length = 0;
    this.camY = sim.focus;
    this.hudKey = "";
    this.layerVersion++;
    this.dragging = false;
  }

  showMenu(worldId = 1) {
    this.level = null;
    this.bot = new Bot({ mode: "drop", react: 0.25 });
    this.reset(new Sim(DEMO), getWorld(worldId), "menu");
    this.demoLoop = 0;
  }

  loadLevel(level) {
    this.level = level;
    this.bot = null;
    this.reset(new Sim(level), getWorld(level.world), "level");
    this.emitHud(true);
  }

  loadEndless(seed) {
    this.level = null;
    this.bot = null;
    this.gen = new EndlessGen(seed);
    const sim = new Sim({ layers: this.gen.initial() });
    this.reset(sim, getWorld(1), "endless");
    this.feedEndless();
    this.emitHud(true);
  }

  feedEndless() {
    const sim = this.sim;
    let added = false;
    while (this.gen.bottomY > sim.focus - 40) {
      sim.addLayers(this.gen.next(4));
      added = true;
    }
    const before = sim.layers.length;
    sim.prune(14);
    if (added || sim.layers.length !== before) this.layerVersion++;
  }

  /** World shown at the current depth (endless cycles through all five). */
  currentWorld() {
    if (this.mode !== "endless") return this.world;
    const depth = Math.max(0, -this.sim.focus) / PHYS.FLOOR_SPACING;
    return WORLDS[Math.floor(depth / 40) % WORLDS.length];
  }

  /* ------------------------------------------------------------ input */

  dragPx(dx) {
    if (this.mode === "menu" || this.paused || !this.sim) return;
    const k = PHYS.SENS[this.settings.sens] ?? PHYS.SENS.medium;
    this.sim.dragBy(dx * k);
  }

  setKey(dir) {
    if (this.mode === "menu" || !this.sim) return;
    this.sim.setKey(dir);
  }

  settle() {
    this.sim?.settle();
  }

  setPaused(p) {
    this.paused = p;
    if (p) this.settle();
  }

  setHidden(h) {
    this.hidden = h;
    if (h) this.settle();
  }

  setSettings(s) {
    this.settings = { ...this.settings, ...s };
  }

  /* ------------------------------------------------------------ loop */

  tick(rawDt) {
    const dt = clamp(rawDt, 0, PHYS.MAX_FRAME);
    this.time += dt;
    if (this.hidden || this.paused) return;
    const sim = this.sim;

    if (this.hitStop > 0) {
      this.hitStop -= dt;
    } else {
      this.acc += dt;
      let n = 0;
      while (this.acc >= PHYS.DT && n < PHYS.MAX_STEPS) {
        if (this.mode === "menu") this.bot.drive(sim);
        sim.step();
        if (sim.events.length) this.handle(sim.events);
        sim.events.length = 0;
        this.acc -= PHYS.DT;
        n++;
        if (this.hitStop > 0) {
          this.acc = 0;
          break;
        }
      }
      if (n === PHYS.MAX_STEPS) this.acc = 0;
    }

    if (this.mode === "endless") this.feedEndless();
    if (this.mode === "menu" && sim.status !== "play") {
      this.endTimer += dt;
      if (this.endTimer > 1.4) this.showMenu(this.world.id);
    }

    // camera eases toward the sim's focus (which itself only moves down)
    const k = 1 - Math.exp(-dt * (this.settings.reducedMotion ? 12 : 7));
    this.camY += (sim.focus - this.camY) * k;
    this.shake = Math.max(0, this.shake - dt * 4);

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

  handle(events) {
    const menu = this.mode === "menu";
    const sound = (n, d) => !menu && this.cb.sound?.(n, d);
    const world = this.currentWorld();
    for (const e of events) {
      if (e.type === "bounce") {
        this.fx.push({ kind: "splash", layer: e.layer, phi: e.phi, color: world.safe[e.layer % 2], t: this.time });
        sound("bounce", { kind: e.kind });
      } else if (e.type === "pass") {
        this.fx.push({ kind: "pass", layer: e.layer, streak: e.streak, t: this.time });
        sound("pass", { streak: e.streak });
      } else if (e.type === "smashOn") {
        sound("smashOn");
      } else if (e.type === "smash") {
        this.hitStop = HIT_STOP;
        if (this.settings.shake && !this.settings.reducedMotion) this.shake = 1;
        this.fx.push({ kind: "smash", layer: e.layer, t: this.time });
        this.layerVersion++;
        sound("smash");
      } else if (e.type === "death") {
        if (this.settings.shake && !this.settings.reducedMotion) this.shake = 0.7;
        this.fx.push({ kind: "death", layer: e.layer, t: this.time });
        sound("death");
      } else if (e.type === "finish") {
        this.fx.push({ kind: "finish", layer: e.layer, t: this.time });
        sound("finish");
      }
    }
  }

  result() {
    const s = this.sim;
    return {
      mode: this.mode,
      levelId: this.level?.id ?? null,
      finished: s.status === "finished",
      time: s.status === "finished" ? s.endAt : s.t,
      maxStreak: s.stats.maxStreak,
      smashes: s.stats.smashes,
      destroyed: s.stats.destroyed,
      bounces: s.stats.bounces,
      drops: s.stats.drops,
      floors: s.stats.floors,
      depth: s.stats.floors,
      failed: s.status === "dead",
      progress: s.progress,
      playMs: Math.round(s.t * 1000),
    };
  }

  emitHud(force) {
    const s = this.sim;
    const tenth = Math.floor(s.t * 10);
    const key = `${tenth}|${s.passedCount}|${s.ball.streak}|${s.ball.smash}|${s.status}`;
    if (!force && key === this.hudKey) return;
    this.hudKey = key;
    this.cb.hud?.({
      time: s.status === "finished" ? s.endAt : s.t,
      progress: s.progress,
      floors: s.stats.floors,
      streak: s.ball.streak,
      smash: s.ball.smash,
      status: s.status,
      mode: this.mode,
    });
  }

  /** Nearest solid surface under the ball right now (for the blob shadow). */
  shadowY() {
    const s = this.sim;
    const bottom = s.ball.y - PHYS.BALL_R;
    for (const L of s.layers) {
      if (L.y > bottom + 1e-6 || L.destroyed) continue;
      if (classify(L, s.phi(), s.t) !== "gap") return L.y;
    }
    return null;
  }
}
