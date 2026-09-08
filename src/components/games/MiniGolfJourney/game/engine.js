/**
 * Mini Golf Journey — the golf engine.
 *
 * Deterministic, framerate-independent ball simulation for every one of the 50
 * levels. No React, no Canvas — GolfCanvas.jsx drives `update(dt)` from a
 * requestAnimationFrame loop and `renderer.js` reads the state out.
 *
 * Logical field: 320 × 180 units. Physics is expressed entirely in those
 * units, never in screen pixels, so fullscreen / mobile just change the render
 * scale — the game plays identically.
 *
 *   status:  'aim'    ball at rest, waiting for a shot
 *            'rolling' ball in motion
 *            'water'   just splashed — GolfCanvas resets & re-arms
 *            'sunk'    holed out
 */

import {
  PLAY_BOUNDS,
  BALL_RADIUS,
  CUP_RADIUS,
  TERRAIN,
} from "../data/obstacles.js";
import { resolve, closestOnSegment } from "./collision.js";

const MAX_SHOT_SPEED = 470; // units / s at full power
const MIN_POWER = 0.06;
const STOP_SPEED = 3.6;
const STOP_SPEED_ICE = 1.7;
const SINK_SPEED = 82; // ball rims out above this
const TAU = Math.PI * 2;

const WATER_FRICTION = 6;

function rectHit(px, py, r) {
  return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
}
function circHit(px, py, c) {
  return Math.hypot(px - c.cx, py - c.cy) <= c.r;
}
function hazardHit(px, py, h) {
  return h.shape === "circle" ? circHit(px, py, h) : rectHit(px, py, h);
}

export class GolfEngine {
  constructor(level, onEvent) {
    this.level = level;
    this.onEvent = onEvent || (() => {});
    this.buildStatic();
    this.reset();
  }

  buildStatic() {
    const b = PLAY_BOUNDS;
    const rail = 3.4;
    this.walls = [
      { kind: "capsule", x1: b.x, y1: b.y - rail, x2: b.x + b.w, y2: b.y - rail, r: rail },
      { kind: "capsule", x1: b.x, y1: b.y + b.h + rail, x2: b.x + b.w, y2: b.y + b.h + rail, r: rail },
      { kind: "capsule", x1: b.x - rail, y1: b.y, x2: b.x - rail, y2: b.y + b.h, r: rail },
      { kind: "capsule", x1: b.x + b.w + rail, y1: b.y, x2: b.x + b.w + rail, y2: b.y + b.h, r: rail },
    ];
    for (const w of this.level.walls) {
      this.walls.push({
        kind: "capsule",
        x1: w.x1,
        y1: w.y1,
        x2: w.x2,
        y2: w.y2,
        r: (w.t || 5) / 2,
      });
    }
    for (const o of this.level.obstacles) {
      if (o.type === "box") {
        this.walls.push({ kind: "rect", x: o.x, y: o.y, w: o.w, h: o.h });
      }
    }
    this.conveyors = this.level.obstacles.filter((o) => o.type === "conveyor");
    this.movers = this.level.obstacles.filter(
      (o) => o.type === "spinner" || o.type === "gate",
    );
    this.portals = this.level.portals || [];
  }

  reset() {
    this.t = 0;
    this.status = "aim";
    this.strokes = 0;
    this.penalties = 0;
    this.portalCd = 0;
    this.sinkAnim = 0;
    this.ball = {
      x: this.level.start.x,
      y: this.level.start.y,
      vx: 0,
      vy: 0,
      r: BALL_RADIUS,
    };
    this.safe = { x: this.ball.x, y: this.ball.y };
    this._track = { x: this.ball.x, y: this.ball.y, t: 0 };
    this.lastEventAt = { wall: -1, sand: -1 };
  }

  get moving() {
    return this.status === "rolling";
  }
  get done() {
    return this.status === "sunk";
  }
  get shotCount() {
    return this.strokes + this.penalties;
  }

  /** dir is a unit-ish vector FROM the ball TOWARD the target; power 0..1 */
  shoot(dirX, dirY, power) {
    if (this.status !== "aim") return false;
    const l = Math.hypot(dirX, dirY) || 1;
    const p = Math.max(MIN_POWER, Math.min(1, power));
    const speed = MAX_SHOT_SPEED * p;
    this.ball.vx = (dirX / l) * speed;
    this.ball.vy = (dirY / l) * speed;
    this.safe = { x: this.ball.x, y: this.ball.y };
    this._track = { x: this.ball.x, y: this.ball.y, t: this.t };
    this.strokes += 1;
    this.status = "rolling";
    this.onEvent("putt", { power: p });
    return true;
  }

  // ---- dynamic colliders for the current time ----
  moverColliders(time) {
    const out = [];
    for (const m of this.movers) {
      if (m.type === "spinner") {
        const a = m.phase + m.speed * time;
        const hx = Math.cos(a) * (m.len / 2);
        const hy = Math.sin(a) * (m.len / 2);
        out.push({
          kind: "capsule",
          x1: m.x + hx,
          y1: m.y + hy,
          x2: m.x - hx,
          y2: m.y - hy,
          r: (m.w || 5) / 2,
          omega: m.speed,
          ox: m.x,
          oy: m.y,
        });
      } else {
        // gate
        const w = TAU / m.period;
        const s = Math.sin(w * time + m.phase);
        const off = (m.travel / 2) * s;
        const vel = (m.travel / 2) * w * Math.cos(w * time + m.phase);
        if (m.axis === "x") {
          out.push({
            kind: "capsule",
            x1: m.x - m.len / 2 + off,
            y1: m.y,
            x2: m.x + m.len / 2 + off,
            y2: m.y,
            r: (m.w || 5) / 2,
            vx: vel,
            vy: 0,
          });
        } else {
          out.push({
            kind: "capsule",
            x1: m.x,
            y1: m.y - m.len / 2 + off,
            x2: m.x,
            y2: m.y + m.len / 2 + off,
            r: (m.w || 5) / 2,
            vx: 0,
            vy: vel,
          });
        }
      }
    }
    return out;
  }

  terrainAt(px, py) {
    for (const h of this.level.hazards) {
      if (hazardHit(px, py, h)) return h.kind;
    }
    return "grass";
  }

  inConveyor(px, py) {
    for (const c of this.conveyors) {
      if (rectHit(px, py, c)) return c;
    }
    return null;
  }

  update(dt) {
    dt = Math.min(dt, 1 / 30);
    this.t += dt;
    if (this.portalCd > 0) this.portalCd = Math.max(0, this.portalCd - dt);

    if (this.status === "sunk") {
      this.sinkAnim = Math.min(1, this.sinkAnim + dt * 4);
      return;
    }

    if (this.status === "aim") {
      // a moving gate / bar can still shove a resting ball
      const movers = this.moverColliders(this.t);
      let shoved = false;
      for (const c of movers) {
        const hit = resolve(this.ball, c);
        if (hit && hit.impact > 6) shoved = true;
      }
      if (shoved) this.status = "rolling";
      this.clampToField();
      return;
    }

    // ---- rolling ----
    const b = this.ball;
    const speed = Math.hypot(b.vx, b.vy);
    const steps = Math.max(1, Math.min(12, Math.ceil((speed * dt) / 1.8)));
    const h = dt / steps;

    for (let i = 0; i < steps; i++) {
      b.x += b.vx * h;
      b.y += b.vy * h;

      const terr = this.terrainAt(b.x, b.y);

      if (terr === "water") {
        this.splash();
        return;
      }

      // friction from the surface underfoot
      const k = terr === "water" ? WATER_FRICTION : (TERRAIN[terr] || TERRAIN.grass).friction;
      const f = Math.exp(-k * h);
      b.vx *= f;
      b.vy *= f;

      // conveyor: accelerate the ball toward a target belt speed along the
      // belt direction (never runaway — terminal speed ≈ conv.force).
      const conv = this.inConveyor(b.x, b.y);
      if (conv) {
        const cl = Math.hypot(conv.dx, conv.dy) || 1;
        const nx = conv.dx / cl;
        const ny = conv.dy / cl;
        const along = b.vx * nx + b.vy * ny;
        const pull = (conv.force - along) * Math.min(1, 6 * h);
        b.vx += nx * pull;
        b.vy += ny * pull;
      }

      // collisions — static + moving, twice for corners
      const movers = this.moverColliders(this.t - dt + (i + 1) * h);
      for (let pass = 0; pass < 2; pass++) {
        for (const c of this.walls) this.emitHit(resolve(b, c), "wall");
        for (const c of movers) this.emitHit(resolve(b, c), "wall");
      }

      this.handlePortals();

      if (this.checkCup()) return;
    }

    this.clampToField();

    const sp = Math.hypot(b.vx, b.vy);
    const onConv = !!this.inConveyor(b.x, b.y);
    const onIce = this.terrainAt(b.x, b.y) === "ice";
    const stopAt = onIce ? STOP_SPEED_ICE : STOP_SPEED;
    if (sp < stopAt && !onConv) {
      this.settle();
      return;
    }

    // safety net: a ball that has barely moved for a while (jammed against a
    // wall by a conveyor, wedged in a corner, portal ping-pong) is forced to
    // rest so a shot is never lost.
    const moved = Math.hypot(b.x - this._track.x, b.y - this._track.y);
    if (moved > 2.5) {
      this._track = { x: b.x, y: b.y, t: this.t };
    } else if (this.t - this._track.t > 2.4) {
      this.settle();
    }
  }

  settle() {
    this.ball.vx = 0;
    this.ball.vy = 0;
    this.status = "aim";
    this._track = { x: this.ball.x, y: this.ball.y, t: this.t };
    this.onEvent("stop", {});
  }

  emitHit(hit, type) {
    if (!hit) return;
    if (hit.impact < 12) return;
    const now = this.t;
    if (now - (this.lastEventAt[type] || -1) < 0.08) return;
    this.lastEventAt[type] = now;
    this.onEvent(type, { x: hit.x, y: hit.y, nx: hit.nx, ny: hit.ny, impact: hit.impact });
  }

  handlePortals() {
    if (this.portalCd > 0) return;
    const b = this.ball;
    for (const p of this.portals) {
      const toA = Math.hypot(b.x - p.ax, b.y - p.ay);
      const toB = Math.hypot(b.x - p.bx, b.y - p.by);
      let out = null;
      if (toA < p.r) out = { x: p.bx, y: p.by };
      else if (toB < p.r) out = { x: p.ax, y: p.ay };
      if (out) {
        const sp = Math.hypot(b.vx, b.vy) || 1;
        const nx = b.vx / sp;
        const ny = b.vy / sp;
        b.x = out.x + nx * (p.r + b.r + 2);
        b.y = out.y + ny * (p.r + b.r + 2);
        b.vx *= 0.98;
        b.vy *= 0.98;
        this.portalCd = 0.4;
        this.onEvent("portal", { x: out.x, y: out.y, hue: p.hue });
        return;
      }
    }
  }

  checkCup() {
    const b = this.ball;
    const hx = this.level.hole.x;
    const hy = this.level.hole.y;
    const d = Math.hypot(b.x - hx, b.y - hy);
    const capture = CUP_RADIUS + b.r * 0.5;
    if (d > capture + 6) return false;
    const sp = Math.hypot(b.vx, b.vy);
    if (d < capture && (sp <= SINK_SPEED || d < b.r * 0.7)) {
      b.x = hx;
      b.y = hy;
      b.vx = 0;
      b.vy = 0;
      this.status = "sunk";
      this.sinkAnim = 0;
      this.onEvent("cup", { holeInOne: this.strokes === 1 && this.penalties === 0 });
      return true;
    }
    if (d < capture + 4 && sp > SINK_SPEED) {
      // rim it — a small pull toward centre so a firm putt curls the lip
      const ax = (hx - b.x) / (d || 1);
      const ay = (hy - b.y) / (d || 1);
      b.vx += ax * sp * 0.05;
      b.vy += ay * sp * 0.05;
    }
    return false;
  }

  splash() {
    this.penalties += 1;
    this.ball.x = this.safe.x;
    this.ball.y = this.safe.y;
    this.ball.vx = 0;
    this.ball.vy = 0;
    this.status = "aim";
    this.onEvent("water", { x: this.ball.x, y: this.ball.y });
  }

  clampToField() {
    const b = this.ball;
    const bd = PLAY_BOUNDS;
    b.x = Math.max(bd.x + b.r, Math.min(bd.x + bd.w - b.r, b.x));
    b.y = Math.max(bd.y + b.r, Math.min(bd.y + bd.h - b.r, b.y));
  }
}

export { closestOnSegment };
