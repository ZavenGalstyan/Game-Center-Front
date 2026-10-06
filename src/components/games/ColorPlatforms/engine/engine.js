/**
 * Color Platforms — engine. Owns the ONE requestAnimationFrame loop, the Sim,
 * the camera, particles and all canvas drawing. React only receives discrete
 * callbacks (hud / sound / hint / banner / complete) and calls a handful of
 * commands (loadLevel, restart, showMenu, setMove, pressJump, setColor …).
 *
 * Time: a fixed-step accumulator runs Sim.step() at PHYS.DT (1/120 s). The
 * real frame delta is clamped (PHYS.MAX_FRAME) and the step count capped, so
 * a tab restore or lag spike can never teleport the player, jump a moving
 * platform or add seconds to the timer. Rendering interpolates the player
 * and platforms between the last two sim states.
 *
 * Graphics settings only change drawing (pixel ratio, particles, clouds) —
 * never the simulation.
 */
import { PHYS, BLUE, RED, YELLOW, PLAYER_COLORS } from "./constants.js";
import { Sim } from "./sim.js";
import { Background } from "../render/background.js";
import { SpriteCache } from "../render/sprites.js";
import { Particles } from "../render/particles.js";
import { drawPlayer, drawShadow, drawBounce, drawSpikes, drawSaw, drawPortal, drawCheckpoint, drawTrack } from "../render/actors.js";
import { PLAT, SYMBOL_NAME, hexRgb, rgbStr, mix, rrect, WHITE } from "../render/palette.js";
import { getCosmetic } from "../data/cosmetics.js";

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

const MENU_PLATS = [
  { x: 0, y: 40, w: 110, color: BLUE },
  { x: 155, y: -30, w: 110, color: RED },
  { x: 310, y: 20, w: 110, color: YELLOW },
];

export class Engine {
  constructor(canvas, cb = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.cb = cb;
    this.bg = new Background();
    this.sprites = new SpriteCache();
    this.fx = new Particles();
    this.settings = { graphics: "medium", particles: "normal", shake: "low", assist: true, reducedMotion: false };
    this.cos = getCosmetic("classic");
    this.cssW = 1;
    this.cssH = 1;
    this.dpr = 1;
    this.dprRaw = 1;
    this.raf = 0;
    this.last = 0;
    this.acc = 0;
    this.time = 0;
    this.paused = false;
    this.hidden = false;
    this.manual = false;
    this.destroyed = false;
    this.mode = "menu";
    this.sim = null;
    this.level = null;
    this.input = { left: false, right: false, jump: false };
    this.driver = null;
    this.hintsOn = false;
    this.touchLayout = false;
    this.frame = this.frame.bind(this);
    this.pv = this.freshVisual(BLUE);
    this.cam = { x: 0, y: 0, shake: 0, sx: 0, sy: 0 };
    this.menu = { i: 0, t: 0, chapter: 1 };
    this.showMenu(1);
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
    this.fx.clear();
    this.sprites.clear();
  }

  /** DEV harness: drive frames by hand (hidden tabs get no rAF). */
  setManual(on) {
    this.manual = on;
    if (on) this.stop();
    else this.start();
  }

  advance(ms, hz = 60) {
    let left = ms / 1000;
    while (left > 1e-9) {
      const dt = Math.min(1 / hz, left);
      this.tick(dt);
      left -= dt;
    }
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
    this.dprRaw = dprRaw || 1;
    const cap = this.settings.graphics === "high" ? 2 : this.settings.graphics === "low" ? 1 : 1.5;
    const dpr = Math.min(cap, Math.max(1, this.dprRaw));
    this.cssW = Math.max(1, cssW);
    this.cssH = Math.max(1, cssH);
    this.dpr = dpr;
    const w = Math.max(1, Math.round(this.cssW * dpr));
    const h = Math.max(1, Math.round(this.cssH * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.bg.resize(this.cssW, this.cssH, dpr, this.settings.graphics);
    this.vignette = null;
    if (this.mode === "play") this.snapCamera();
    if (this.manual) this.render();
  }

  /** World → screen scale: keeps ~560 world px of height in view. */
  get scale() {
    if (this.mode === "menu") return Math.min(this.cssH / 400, (this.cssW * 0.42) / 420);
    return Math.min(this.cssH / 500, this.cssW / 760);
  }

  setSettings(s) {
    const prevG = this.settings.graphics;
    const prevA = this.settings.assist;
    this.settings = { ...this.settings, ...s };
    this.fx.scale = this.settings.particles === "low" ? 0.4 : this.settings.graphics === "low" ? 0.6 : 1;
    if (prevG !== this.settings.graphics) this.resize(this.cssW, this.cssH, this.dprRaw);
    if (prevA !== this.settings.assist) this.sprites.clear();
  }

  setCosmetic(id) {
    this.cos = getCosmetic(id);
    this.pv.rgb = hexRgb(this.cos.palette[this.sim ? this.sim.p.color : this.pv.color] || this.cos.palette[BLUE]);
  }

  setPaused(p) {
    this.paused = p;
    this.last = 0;
    if (p) this.clearInput();
  }

  setHidden(h) {
    this.hidden = h;
    this.last = 0;
    if (h) this.clearInput();
  }

  /* ------------------------------------------------------------ input */

  clearInput() {
    this.input.left = false;
    this.input.right = false;
    this.input.jump = false;
  }

  setMove(left, right) {
    this.input.left = left;
    this.input.right = right;
    if ((left || right) && this.sim) this.flags.moved = true;
  }

  setJumpHeld(h) {
    this.input.jump = h;
  }

  pressJump() {
    if (this.mode !== "play" || !this.sim || this.paused) return;
    this.input.jump = true;
    this.sim.pressJump();
  }

  /** Instant gameplay switch; visuals animate toward it. */
  setColor(c) {
    if (this.mode !== "play" || !this.sim || this.paused) return false;
    return this.sim.setColor(c);
  }

  cycleColor(d) {
    if (!this.sim) return;
    const i = PLAYER_COLORS.indexOf(this.sim.p.color);
    this.setColor(PLAYER_COLORS[(i + d + 3) % 3]);
  }

  /* ------------------------------------------------------------ modes */

  freshVisual(color) {
    return {
      color,
      rgb: hexRgb(this.cos ? this.cos.palette[color] : "#3d8bff"),
      land: 0,
      jump: 0,
      switchT: 9,
      look: 0,
      lookY: 0,
      foot: 0,
      pop: 1,
      trail: [],
      trailT: 0,
      rx: 0,
      ry: 0,
      prevX: 0,
      prevY: 0,
      respawnFx: 0,
    };
  }

  showMenu(chapter = 1) {
    this.mode = "menu";
    this.sim = null;
    this.level = null;
    this.paused = false;
    this.completeSent = false;
    this.menu = { i: 0, t: 0, chapter };
    this.bg.setChapter(chapter);
    this.fx.clear();
    this.pv = this.freshVisual(BLUE);
    this.clearInput();
  }

  setMenuChapter(ch) {
    this.menu.chapter = ch;
    if (this.mode === "menu") this.bg.setChapter(ch);
  }

  loadLevel(level) {
    this.mode = "play";
    this.level = level;
    this.sim = new Sim(level);
    this.bg.setChapter(level.chapter);
    this.begin();
  }

  /** Restart the current level: fresh Sim state, progression untouched. */
  restart() {
    if (!this.sim) return;
    this.sim.reset();
    this.begin();
  }

  begin() {
    this.driver = null;
    this.acc = 0;
    this.paused = false;
    this.completeSent = false;
    this.fx.clear();
    this.clearInput();
    this.flags = { moved: false, jumped: false };
    this.starPop = this.level.stars.map(() => -1);
    this.cpPulse = 0;
    this.hint = -2;
    this.hudLast = null;
    this.hudT = 0;
    this.finishT = 0;
    this.pv = this.freshVisual(this.sim.p.color);
    this.pv.prevX = this.sim.p.x;
    this.pv.prevY = this.sim.p.y;
    this.pv.pop = 0;
    this.snapCamera();
    this.pushHud(true);
    this.updateHint();
  }

  attemptSummary() {
    const s = this.sim;
    if (!s) return null;
    return {
      levelId: this.level.id,
      time: s.time,
      stars: s.starsGot.slice(),
      falls: s.stats.falls,
      finished: s.finished,
      stats: { ...s.stats },
    };
  }

  /* ------------------------------------------------------------ update */

  tick(rawDt) {
    if (this.destroyed) return;
    const dt = clamp(rawDt, 0, PHYS.MAX_FRAME);
    this.time += dt;
    if (this.mode === "menu") {
      this.updateMenu(dt);
      this.fx.update(dt);
      return;
    }
    const s = this.sim;
    if (!s) return;
    if (!this.paused) {
      this.acc += dt;
      let n = 0;
      while (this.acc >= PHYS.DT && n < PHYS.MAX_STEPS) {
        this.pv.prevX = s.p.x;
        this.pv.prevY = s.p.y;
        if (this.driver) {
          // DEV harness: the route bot plays through the real loop
          this.driver.decide();
          s.step(this.driver.input);
          this.driver.after();
        } else s.step(this.input);
        this.handleEvents();
        this.acc -= PHYS.DT;
        n++;
      }
      if (n >= PHYS.MAX_STEPS) this.acc = 0;
      if (s.status === "finished") {
        this.finishT += dt;
        if (!this.completeSent && this.finishT >= PHYS.FINISH_DELAY) {
          this.completeSent = true;
          this.cb.complete?.(this.attemptSummary());
        }
      }
      this.updateVisual(dt);
      this.fx.update(dt);
      if (!this.completeSent) this.updateCamera(dt, false);
      this.pushHud(false, dt);
      this.updateHint();
    }
  }

  handleEvents() {
    const s = this.sim;
    if (!s.events.length) return;
    const pv = this.pv;
    const p = s.p;
    for (const e of s.events) {
      switch (e.type) {
        case "jump":
          this.flags.jumped = true;
          pv.jump = 1;
          this.dust(p.x, p.y, 5, 90);
          this.cb.sound?.("jump");
          break;
        case "land": {
          const imp = clamp((e.b || 0) / PHYS.MAX_FALL, 0, 1);
          pv.land = 0.4 + imp * 0.6;
          if (imp > 0.25) this.dust(p.x, p.y, 3 + Math.round(imp * 5), 70 + imp * 80);
          this.cb.sound?.("land", { impact: imp });
          break;
        }
        case "switch": {
          pv.switchT = 0;
          pv.color = e.a;
          const col = this.cos.palette[e.a];
          this.fx.burst(4, p.x, p.y - 15, { speed: 110, life: 0.32, size: 2.6, color: col, drag: 5, min: 2 });
          this.cb.sound?.("switch", { color: e.a });
          break;
        }
        case "wrong": {
          const pl = s.plats[e.a];
          const col = PLAT[pl.def.color].body;
          this.fx.burst(5, clamp(p.x, pl.x, pl.x + pl.def.w), pl.y, { speed: 90, life: 0.4, size: 2.2, color: col, spread: Math.PI, angle: -Math.PI / 2, g: 300, min: 2 });
          this.cb.sound?.("wrong");
          break;
        }
        case "star": {
          const st = this.level.stars[e.a];
          this.starPop[e.a] = this.time;
          this.fx.burst(10, st.x, st.y, { speed: 170, life: 0.55, size: 3, color: "#ffe27a", kind: 2, drag: 4, min: 4 });
          this.fx.spawn(st.x, st.y, 0, 0, 0.4, 30, "#fff1b0", 1);
          this.cb.sound?.("star", { n: s.starCount() });
          break;
        }
        case "checkpoint": {
          this.cpPulse = 1;
          const c = this.level.checkpoint;
          this.fx.burst(10, c.x, c.y - 40, { speed: 130, life: 0.6, size: 2.6, color: "#7dffe0", kind: 2, drag: 3, min: 4 });
          this.cb.sound?.("checkpoint");
          this.cb.banner?.("CHECKPOINT");
          break;
        }
        case "bounce": {
          pv.jump = 1.3;
          const pl = s.plats[e.a];
          this.fx.burst(7, p.x, pl.y, { speed: 160, life: 0.4, size: 2.4, color: "#9ffff0", spread: Math.PI * 0.9, angle: -Math.PI / 2, drag: 4, min: 3 });
          this.cb.sound?.("bounce");
          break;
        }
        case "fadeArm":
          this.cb.sound?.("fadeWarn");
          break;
        case "fadeGone": {
          const pl = s.plats[e.a];
          const col = PLAT[pl.def.color].top;
          for (let i = 0; i < Math.round(8 * this.fx.scale) + 2; i++) {
            const fx = pl.x + ((i + 0.5) / 10) * pl.def.w;
            this.fx.spawn(fx, pl.y + 6, Math.sin(i * 7.3) * 40, -30 - (i % 3) * 25, 0.6, 3, col, 0, 500, 1);
          }
          this.cb.sound?.("fadeGone");
          break;
        }
        case "fadeBack":
          break;
        case "die": {
          const d = e.b;
          const col = this.cos.palette[d.color];
          if (e.a !== "fall") {
            this.fx.burst(12, d.x, d.y - 15, { speed: 200, life: 0.55, size: 3.2, color: col, drag: 3, g: 200, min: 5 });
            this.kick(6);
          }
          this.cb.sound?.(e.a === "fall" ? "fall" : "hurt");
          break;
        }
        case "respawn":
          pv.pop = 0;
          pv.respawnFx = 1;
          pv.color = s.p.color;
          pv.rgb = hexRgb(this.cos.palette[s.p.color]);
          pv.trail.length = 0;
          pv.prevX = s.p.x;
          pv.prevY = s.p.y;
          this.snapCamera();
          this.cb.sound?.("respawn");
          break;
        case "finish": {
          const f = this.level.finish;
          const cols = [this.cos.palette[BLUE], this.cos.palette[RED], this.cos.palette[YELLOW], "#ffffff"];
          for (let k = 0; k < 4; k++) this.fx.burst(7, f.x, f.y - 50, { speed: 240, life: 0.9, size: 3, color: cols[k], kind: k === 3 ? 2 : 0, g: 220, drag: 1.5, min: 3 });
          this.cb.sound?.("finish");
          break;
        }
        default:
          break;
      }
    }
    s.events.length = 0;
  }

  dust(x, y, n, speed) {
    this.fx.burst(n, x, y - 2, { speed, life: 0.35, size: 3, color: "rgba(255,255,255,0.7)", spread: Math.PI * 0.7, angle: -Math.PI / 2, drag: 6, g: -20, min: 1, jitter: 6 });
  }

  kick(px) {
    if (this.settings.shake === "off" || this.settings.reducedMotion) return;
    this.cam.shake = Math.max(this.cam.shake, Math.min(px, 4));
  }

  updateVisual(dt) {
    const s = this.sim;
    const p = s.p;
    const pv = this.pv;
    const target = hexRgb(this.cos.palette[p.color]);
    const k = 1 - Math.exp(-dt / 0.035); // ~110 ms to settle
    mix(pv.rgb, target, k, pv.rgb);
    pv.color = p.color;
    pv.switchT += dt;
    pv.land = Math.max(0, pv.land - dt * 6);
    pv.jump = Math.max(0, pv.jump - dt * 5);
    pv.pop = Math.min(1, pv.pop + dt * 4.5);
    pv.respawnFx = Math.max(0, pv.respawnFx - dt / PHYS.RESPAWN_IN);
    const lookT = clamp(p.vx / PHYS.RUN, -1, 1) * 0.9 + p.face * 0.25;
    pv.look += (clamp(lookT, -1, 1) - pv.look) * Math.min(1, dt * 10);
    pv.lookY += (clamp(p.vy / 700, -1, 1) - pv.lookY) * Math.min(1, dt * 10);
    if (p.grounded) pv.foot += dt * Math.abs(p.vx) * 0.055;
    this.cpPulse = Math.max(0, this.cpPulse - dt * 1.4);
    if (this.cam.shake > 0) this.cam.shake = Math.max(0, this.cam.shake - dt * 22);

    // cosmetic trail
    const moving = Math.abs(p.vx) > 40 || !p.grounded;
    if (s.status === "play" && this.cos.trail !== "none") {
      if (this.cos.trail === "neon") {
        pv.trail.push(p.x, p.y - 14);
        if (pv.trail.length > 28) pv.trail.splice(0, 2);
        if (!moving && pv.trail.length > 4) pv.trail.splice(0, 2);
      } else if (moving) {
        pv.trailT -= dt;
        if (pv.trailT <= 0 && this.fx.scale > 0.3) {
          pv.trailT = 0.06;
          const c = rgbStr(pv.rgb);
          const t = this.cos.trail;
          if (t === "dots") this.fx.spawn(p.x - p.face * 8, p.y - 12, 0, -10, 0.45, 2.6, c, 0);
          else if (t === "hearts") this.fx.spawn(p.x - p.face * 8, p.y - 20, -p.face * 10, -30, 0.6, 3.4, "#ff7fb0", 3);
          else if (t === "bubbles") this.fx.spawn(p.x - p.face * 8, p.y - 14, -p.face * 8, -40, 0.7, 2.8, "rgba(200,240,255,0.9)", 4);
          else if (t === "embers") this.fx.spawn(p.x - p.face * 8, p.y - 10, -p.face * 14, -50, 0.5, 2, Math.random() < 0.5 ? "#ffb347" : "#ff6a3d", 0);
        }
      }
    } else if (this.cos.trail === "neon") pv.trail.length = 0;
  }

  /* ------------------------------------------------------------ camera */

  camTarget() {
    const s = this.sim;
    const p = s.p;
    const sc = this.scale;
    const visW = this.cssW / sc;
    const visH = this.cssH / sc;
    return { visW, visH, fx: p.x + visW * 0.1, fy: p.y - visH * (this.touchLayout ? -0.04 : 0.02) };
  }

  clampCam() {
    const { visW, visH } = this.camTarget();
    const B = this.level.bounds;
    const loX = B.minX + visW / 2;
    const hiX = B.maxX - visW / 2;
    this.cam.x = loX > hiX ? (B.minX + B.maxX) / 2 : clamp(this.cam.x, loX, hiX);
    const loY = B.minY + visH / 2;
    const hiY = B.maxY + visH * 0.5 - visH * 0.27;
    this.cam.y = loY > hiY ? hiY : clamp(this.cam.y, loY, hiY);
  }

  snapCamera() {
    if (!this.sim) return;
    const t = this.camTarget();
    this.cam.x = t.fx;
    this.cam.y = t.fy;
    this.clampCam();
  }

  updateCamera(dt) {
    const t = this.camTarget();
    const dzX = t.visW * 0.06;
    const dzY = t.visH * 0.1;
    let tx = this.cam.x;
    let ty = this.cam.y;
    if (t.fx > tx + dzX) tx = t.fx - dzX;
    else if (t.fx < tx - dzX) tx = t.fx + dzX;
    if (t.fy > ty + dzY) ty = t.fy - dzY;
    else if (t.fy < ty - dzY) ty = t.fy + dzY;
    const kx = 1 - Math.exp(-dt * 7);
    const ky = 1 - Math.exp(-dt * (this.sim.status === "respawn" ? 0 : 5));
    this.cam.x += (tx - this.cam.x) * kx;
    this.cam.y += (ty - this.cam.y) * ky;
    this.clampCam();
  }

  /* ------------------------------------------------------------ HUD + hints */

  pushHud(force, dt = 0) {
    const s = this.sim;
    if (!s) return;
    this.hudT += dt;
    const h = this.hudLast;
    const changed = !h || h.stars !== s.starCount() || h.falls !== s.stats.falls || h.color !== s.p.color || h.status !== s.status;
    if (!force && !changed && this.hudT < 0.05) return;
    this.hudT = 0;
    const next = { time: s.time, stars: s.starCount(), starsGot: s.starsGot.slice(), falls: s.stats.falls, color: s.p.color, status: s.status };
    if (!force && h && !changed && Math.floor(h.time * 100) === Math.floor(next.time * 100)) return;
    this.hudLast = next;
    this.cb.hud?.(next);
  }

  updateHint() {
    let idx = -1;
    if (this.hintsOn && this.sim && this.sim.status !== "finished") {
      const p = this.sim.p;
      const hints = this.level.hints;
      for (let i = 0; i < hints.length; i++) {
        const h = hints[i];
        if (p.x < h.x0 || p.x > h.x1) continue;
        const u = h.until || "";
        let done = false;
        if (u === "move") done = this.flags.moved;
        else if (u === "jump") done = this.flags.jumped;
        else if (u.startsWith("color:")) done = p.color === u.slice(6);
        else if (u.startsWith("x:")) done = p.x > Number(u.slice(2));
        if (!done) {
          idx = i;
          break;
        }
      }
    }
    if (idx !== this.hint) {
      this.hint = idx;
      this.cb.hint?.(idx);
    }
  }

  /* ------------------------------------------------------------ menu demo */

  updateMenu(dt) {
    const m = this.menu;
    const pv = this.pv;
    const JUMP = 0.72;
    const REST = 0.62;
    m.t += dt * (this.settings.reducedMotion ? 0.7 : 1);
    if (m.t >= JUMP + REST) {
      m.t -= JUMP + REST;
      m.i = (m.i + 1) % 3;
    }
    const a = MENU_PLATS[m.i];
    const b = MENU_PLATS[(m.i + 1) % 3];
    let x;
    let y;
    let air = false;
    if (m.t < REST) {
      x = a.x + a.w / 2;
      y = a.y;
      if (pv.color !== a.color) pv.color = a.color;
    } else {
      const u = (m.t - REST) / JUMP;
      x = a.x + a.w / 2 + (b.x - a.x) * u;
      const peak = Math.min(a.y, b.y) - 120;
      y = (1 - u) * (1 - u) * a.y + 2 * (1 - u) * u * peak + u * u * b.y;
      air = true;
      if (u > 0.38 && pv.color !== b.color) {
        pv.color = b.color;
        pv.switchT = 0;
        this.fx.burst(4, x, y - 15, { speed: 100, life: 0.3, size: 2.5, color: this.cos.palette[b.color], drag: 5, min: 2 });
      }
      if (u > 0.985 && !pv.landed) {
        pv.land = 0.8;
        pv.landed = true;
        this.dust(x, y, 4, 80);
      }
    }
    if (!air) pv.landed = false;
    if (air && m.t - REST < 0.05) pv.jump = 1;
    pv.menuVy = air ? (y - (pv.ry || y)) / Math.max(dt, 1e-3) : 0;
    pv.menuAir = air;
    pv.rx = x;
    pv.ry = y;
    mix(pv.rgb, hexRgb(this.cos.palette[pv.color]), 1 - Math.exp(-dt / 0.035), pv.rgb);
    pv.switchT += dt;
    pv.land = Math.max(0, pv.land - dt * 6);
    pv.jump = Math.max(0, pv.jump - dt * 5);
    pv.look += ((b.x > a.x ? 0.8 : -0.8) - pv.look) * Math.min(1, dt * 6);
  }

  /* ------------------------------------------------------------ render */

  render() {
    const ctx = this.ctx;
    const { dpr, cssW, cssH } = this;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const sc = this.scale;
    this.sprites.setScale(sc * dpr);
    const reduced = this.settings.reducedMotion;

    if (this.mode === "menu") {
      this.bg.draw(ctx, this.time * 30, 0, 0, this.time, reduced);
      // scene sits right of centre, under the title column
      const ox = cssW * 0.75 - 210 * sc;
      const oy = cssH * 0.62;
      ctx.setTransform(dpr * sc, 0, 0, dpr * sc, dpr * ox, dpr * oy);
      for (const [i, mp] of MENU_PLATS.entries()) {
        const bob = reduced ? 0 : Math.sin(this.time * 1.4 + i * 1.9) * 3;
        this.blitPlatform(mp.color, mp.x, mp.y + bob, mp.w, PHYS.PLAT_H, "normal", 1);
      }
      const pv = this.pv;
      drawShadow(ctx, pv.rx, this.menuGround(pv.rx, pv.ry), Math.max(0, this.menuGround(pv.rx, pv.ry) - pv.ry), 1);
      this.drawMascot(ctx, pv.rx, pv.ry, pv.menuAir, pv.menuVy || 0, 0, 1, false);
      this.fx.draw(ctx);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.drawVignette(ctx);
      return;
    }

    const s = this.sim;
    if (!s) return;
    const alpha = this.paused ? 1 : clamp(this.acc / PHYS.DT, 0, 1);
    let shx = 0;
    let shy = 0;
    if (this.cam.shake > 0) {
      shx = Math.sin(this.time * 91) * this.cam.shake;
      shy = Math.cos(this.time * 77) * this.cam.shake * 0.6;
    }
    this.bg.draw(ctx, this.cam.x * sc, this.cam.y * sc, this.level.spawn.y * sc, this.time, reduced);
    const ox = cssW / 2 - this.cam.x * sc + shx;
    const oy = cssH / 2 - this.cam.y * sc + shy;
    ctx.setTransform(dpr * sc, 0, 0, dpr * sc, dpr * ox, dpr * oy);

    // culling window (world)
    const visW = cssW / sc;
    const vx0 = this.cam.x - visW / 2 - 120;
    const vx1 = this.cam.x + visW / 2 + 120;

    // tracks
    for (const pl of s.plats) {
      const m = pl.def.move;
      if (!m) continue;
      const cx = pl.def.x + pl.def.w / 2;
      const cy = pl.def.y + pl.def.h / 2;
      if (Math.max(cx, cx + m.dx) < vx0 || Math.min(cx, cx + m.dx) > vx1) continue;
      drawTrack(ctx, cx, cy, cx + m.dx, cy + m.dy);
    }

    // platforms
    for (const pl of s.plats) {
      const d = pl.def;
      const x = pl.px + (pl.x - pl.px) * alpha;
      const y = pl.py + (pl.y - pl.py) * alpha;
      if (x + d.w < vx0 || x > vx1) continue;
      if (d.type === "bounce") {
        drawBounce(ctx, x, y, d.w, d.h, pl.squash, this.time);
        continue;
      }
      let a = 1;
      if (pl.fade === 1) {
        const left = d.fade.stay - pl.fadeT;
        if (left < 0.5) a = 0.55 + 0.45 * Math.abs(Math.cos(left * 22));
      } else if (pl.fade === 2) {
        a = pl.fadeT < 0.18 ? 1 - pl.fadeT / 0.18 : 0;
        if (a <= 0) {
          if (d.fade.back > 0) this.ghost(x, y, d);
          continue;
        }
      }
      const variant = d.fade ? "fade" : d.move ? "move" : "normal";
      const jx = pl.flash > 0 ? Math.sin(pl.flash * 90) * 2 : 0;
      this.blitPlatform(d.color, x + jx, y, d.w, d.h, variant, a);
      if (pl.flash > 0) {
        ctx.globalAlpha = (pl.flash / 0.28) * 0.6;
        ctx.fillStyle = "#ffffff";
        rrect(ctx, x + jx, y, d.w, d.h, Math.min(10, d.h / 2));
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      if (pl.fade === 1) {
        // countdown bar on the side band
        const k = clamp(1 - pl.fadeT / d.fade.stay, 0, 1);
        ctx.fillStyle = "rgba(255,255,255,0.85)";
        rrect(ctx, x + 6, y + d.h - 5, (d.w - 12) * k, 2.4, 1.2);
        ctx.fill();
      }
    }

    // hazards
    for (const h of s.hz) {
      const d = h.def;
      if (d.kind === "spikes") {
        if (h.x + d.w < vx0 || h.x > vx1) continue;
        drawSpikes(ctx, h.x, h.y, d.w);
      } else {
        if (h.x < vx0 || h.x > vx1) continue;
        if (d.move) drawTrack(ctx, d.x, d.y, d.x + d.move.dx, d.y + d.move.dy);
        drawSaw(ctx, h.x, h.y, d.r, reduced ? 0 : this.time);
      }
    }

    // checkpoint + finish
    const L = this.level;
    if (L.checkpoint) drawCheckpoint(ctx, L.checkpoint.x, L.checkpoint.y, s.checkpointHit, reduced ? 0 : this.time, this.cpPulse);
    drawPortal(ctx, L.finish.x, L.finish.y, this.time, L.id === 50, reduced);

    // stars
    const star = this.sprites.star();
    for (let i = 0; i < L.stars.length; i++) {
      const st = L.stars[i];
      let sc2 = 1;
      let a = 1;
      if (s.starsGot[i]) {
        const t = this.starPop[i] < 0 ? 9 : this.time - this.starPop[i];
        if (t > 0.3) continue;
        sc2 = 1 + t * 2.5;
        a = 1 - t / 0.3;
      }
      const bob = reduced ? 0 : Math.sin(this.time * 2.4 + i * 1.7) * 3;
      const rot = reduced ? 0 : Math.sin(this.time * 1.6 + i) * 0.25;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.translate(st.x, st.y + bob);
      ctx.rotate(rot);
      ctx.scale(sc2, sc2);
      ctx.drawImage(star.img, star.ox, star.oy, star.w, star.h);
      ctx.restore();
    }

    // player
    const p = s.p;
    const px = this.pv.prevX + (p.x - this.pv.prevX) * alpha;
    const py = this.pv.prevY + (p.y - this.pv.prevY) * alpha;
    let pa = 1;
    if (s.status === "respawn") pa = p.placed ? 0 : Math.max(0, 1 - s.statusT / 0.12);
    if (pa > 0) {
      const gy = this.groundBelow(px, py);
      if (gy !== null) drawShadow(ctx, px, gy, gy - py, pa);
      if (this.cos.trail === "neon") this.drawNeon(ctx);
      this.drawMascot(ctx, px, py, !p.grounded, p.vy, p.vx, pa, s.status === "finished");
    }

    this.fx.draw(ctx);

    // screen-space overlays
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.drawVignette(ctx);
    let fade = 0;
    if (s.status === "respawn") fade = clamp(s.statusT / PHYS.RESPAWN_OUT, 0, 1) * 0.55;
    else if (this.pv.respawnFx > 0) fade = this.pv.respawnFx * 0.55;
    if (fade > 0) {
      ctx.fillStyle = `rgba(6,8,24,${fade})`;
      ctx.fillRect(0, 0, cssW, cssH);
    }
  }

  blitPlatform(color, x, y, w, h, variant, a) {
    const spr = this.sprites.platform(color, w, h, variant, this.settings.assist);
    const ctx = this.ctx;
    if (a < 1) ctx.globalAlpha = a;
    ctx.drawImage(spr.img, x + spr.ox, y + spr.oy, spr.w, spr.h);
    if (a < 1) ctx.globalAlpha = 1;
  }

  ghost(x, y, d) {
    const ctx = this.ctx;
    ctx.save();
    ctx.setLineDash([5, 6]);
    ctx.strokeStyle = "rgba(255,255,255,0.22)";
    ctx.lineWidth = 1.5;
    rrect(ctx, x + 1, y + 1, d.w - 2, d.h - 2, Math.min(10, d.h / 2));
    ctx.stroke();
    ctx.restore();
  }

  drawMascot(ctx, x, y, air, vy, vx, alpha, victory) {
    const pv = this.pv;
    const reduced = this.settings.reducedMotion;
    let sy = 1;
    if (air) sy += clamp(-vy / 3200, -0.1, 0.14);
    sy += pv.jump * 0.1 - pv.land * 0.22;
    if (!air && Math.abs(vx) > 30) sy += Math.sin(pv.foot * 2) * 0.035;
    let tilt = clamp(vx / PHYS.RUN, -1, 1) * 0.08;
    let yOff = 0;
    if (victory) {
      const t = this.finishT;
      yOff = -Math.abs(Math.sin(t * 7)) * 10;
      tilt = Math.sin(t * 7) * 0.12;
    }
    if (reduced) {
      sy = 1 + (sy - 1) * 0.4;
      tilt *= 0.4;
    }
    const sx = 1 - (sy - 1) * 0.85;
    const pop = pv.pop < 1 ? 0.55 + 0.45 * (1 - (1 - pv.pop) ** 3) + Math.sin(pv.pop * Math.PI) * 0.12 : 1;
    const blinkPh = this.time % 3.6;
    const blink = blinkPh > 3.48 ? Math.abs(blinkPh - 3.54) / 0.06 : 1;

    // switch pulse
    if (pv.switchT < 0.2) {
      const k = pv.switchT / 0.2;
      ctx.strokeStyle = rgbStr(mix(pv.rgb, WHITE, 0.3), 1 - k);
      ctx.lineWidth = 3 * (1 - k) + 0.5;
      ctx.beginPath();
      ctx.arc(x, y - 15 + yOff, 16 + k * 24, 0, TAU);
      ctx.stroke();
    }
    if (this.settings.graphics !== "low") {
      const glow = this.sprites.glow(this.cos.palette[pv.color]);
      ctx.globalAlpha = alpha * (pv.switchT < 0.2 ? 1 : 0.55);
      ctx.drawImage(glow.img, x + glow.ox * 0.7, y - 15 + yOff + glow.oy * 0.7, glow.w * 0.7, glow.h * 0.7);
      ctx.globalAlpha = 1;
    }
    drawPlayer(ctx, {
      x,
      y: y + yOff,
      rgb: pv.rgb,
      sx: sx * pop,
      sy: sy * pop,
      tilt,
      look: pv.look,
      lookY: pv.lookY,
      blink,
      mood: victory ? "happy" : air && vy > 520 ? "fall" : "idle",
      foot: pv.foot,
      run: !air && Math.abs(vx) > 30,
      alpha,
      sym: this.settings.assist ? SYMBOL_NAME[pv.color] : null,
      cos: this.cos,
      time: this.time,
    });
  }

  drawNeon(ctx) {
    const t = this.pv.trail;
    if (t.length < 6) return;
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (let i = 2; i < t.length; i += 2) {
      const k = i / t.length;
      ctx.strokeStyle = rgbStr(this.pv.rgb, k * 0.6);
      ctx.lineWidth = 2 + k * 7;
      ctx.beginPath();
      ctx.moveTo(t[i - 2], t[i - 1]);
      ctx.lineTo(t[i], t[i + 1]);
      ctx.stroke();
    }
    ctx.restore();
  }

  groundBelow(x, y) {
    let best = null;
    for (const pl of this.sim.plats) {
      if (pl.fade === 2) continue;
      if (x < pl.x || x > pl.x + pl.def.w) continue;
      if (pl.y < y - 1) continue;
      if (best === null || pl.y < best) best = pl.y;
    }
    return best;
  }

  menuGround(x, y) {
    let best = y;
    let found = false;
    for (const mp of MENU_PLATS) {
      if (x < mp.x || x > mp.x + mp.w || mp.y < y - 1) continue;
      if (!found || mp.y < best) best = mp.y;
      found = true;
    }
    return found ? best : y + 400;
  }

  drawVignette(ctx) {
    const { cssW: w, cssH: h } = this;
    if (!this.vignette || this.vignette.w !== w || this.vignette.h !== h) {
      const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75);
      g.addColorStop(0, "rgba(0,0,0,0)");
      g.addColorStop(1, "rgba(4,6,20,0.38)");
      this.vignette = { w, h, g };
    }
    ctx.fillStyle = this.vignette.g;
    ctx.fillRect(0, 0, w, h);
  }
}

