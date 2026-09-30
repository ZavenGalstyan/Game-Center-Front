/**
 * Helix Drop — deterministic headless simulation (no DOM, no Three.js).
 *
 * The live game, the level validator, the endless generator test and the menu
 * demo all drive THIS class with the same fixed step (PHYS.DT). Rendering only
 * reads `rot`, the ball and the layers — the tower mesh group uses exactly
 * `rotation.y = sim.rot`, so visual and collision rotation can never differ.
 *
 * Angular model: a point at tower-local angle φ appears at world angle φ − rot.
 * The ball sits at world angle BALL_ANGLE, so the tower-local angle under it is
 *   φ = norm(BALL_ANGLE + rot)            (and, per layer, minus its own offset)
 *
 * Collision (once per step, only while falling): the ball bottom sweeps from
 * its previous to its current height. EVERY layer top crossed in that sweep is
 * processed top-down, each with the tower rotation and layer offset at the
 * exact crossing moment:
 *   gap     → passed (drop streak +1; SMASH arms at PHYS.SMASH_STREAK)
 *   smash   → any solid layer is destroyed, the ball keeps falling
 *   safe / breakable → land + bounce (stop processing)
 *   danger  → fail (stop processing)
 *   finish  → level complete
 */
import { PHYS, BALL_ANG, TAU, norm, layerY } from "./constants.js";

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const SOLID = new Set(["safe", "break", "danger", "finish"]);

/**
 * Build a runtime layer from authored data:
 *   { off: degrees, segs: [[type, degrees], ...] (must sum to 360),
 *     move?: { amp: deg, period: s, phase?: 0..1 } | { spin: deg/s }, finish? }
 */
export function makeLayer(d, i) {
  const sectors = [];
  let a = 0;
  for (const [type, len] of d.segs) {
    const l = (len * Math.PI) / 180;
    sectors.push({ type, a0: a, a1: a + l });
    a += l;
  }
  // absorb float error so the partition closes exactly at 2π
  sectors[sectors.length - 1].a1 = TAU;
  let move = null;
  if (d.move?.spin) move = { spin: (d.move.spin * Math.PI) / 180 };
  else if (d.move?.amp) move = { amp: (d.move.amp * Math.PI) / 180, period: d.move.period, phase: d.move.phase || 0 };
  return {
    idx: i,
    id: d.id ?? `l${i}`,
    y: d.y ?? layerY(i),
    off: ((d.off || 0) * Math.PI) / 180,
    sectors,
    move,
    finish: !!d.finish,
    destroyed: false,
    destroyedAt: 0,
    passed: false,
    hitAt: -10,
  };
}

/** A layer's own rotation offset at sim time t (radians, tower-local). */
export function layerOffset(L, t) {
  if (!L.move) return L.off;
  if (L.move.spin) return L.off + L.move.spin * t;
  return L.off + L.move.amp * Math.sin((TAU * t) / L.move.period + L.move.phase * TAU);
}

/** Index of the sector containing layer-relative angle u ∈ [0, 2π). */
export function sectorIndex(L, u) {
  const s = L.sectors;
  for (let i = 0; i < s.length; i++) if (u >= s[i].a0 && u < s[i].a1) return i;
  return s.length - 1;
}

/**
 * What the ball meets at tower-local angle φ on layer L at time t.
 * Edge forgiveness (a fraction of the ball's angular radius) always favours the
 * player: a ball just past a safe edge over a gap still lands; a ball just
 * inside a danger edge next to safe/gap is treated as its neighbour. Invisible
 * danger never extends beyond the visible danger sector.
 */
export function classify(L, phi, t) {
  if (L.finish) return "finish";
  const u = norm(phi - layerOffset(L, t));
  const s = L.sectors;
  const i = sectorIndex(L, u);
  const cur = s[i];
  const prev = s[(i - 1 + s.length) % s.length];
  const next = s[(i + 1) % s.length];
  const m = PHYS.EDGE * BALL_ANG;
  const dStart = u - cur.a0;
  const dEnd = cur.a1 - u;
  const friendly = (x) => x.type === "safe" || x.type === "break";
  if (cur.type === "gap") {
    if (dStart < m && friendly(prev)) return prev.type;
    if (dEnd < m && friendly(next)) return next.type;
    return "gap";
  }
  if (cur.type === "danger") {
    if (dStart < m && prev.type !== "danger") return prev.type;
    if (dEnd < m && next.type !== "danger") return next.type;
    return "danger";
  }
  return cur.type;
}

export class Sim {
  /**
   * level: { layers: [layerDef...] } — the last layer should be `finish: true`
   * (endless towers have none). opts.rotCap scales the rotation speed cap
   * (validator margin only; the real game always uses 1).
   */
  constructor(level, opts = {}) {
    this.level = level;
    this.rotCap = PHYS.ROT_MAX_SPEED * (opts.rotCap ?? 1);
    this.layers = level.layers.map(makeLayer);
    this.t = 0;
    this.rot = 0;
    this.target = 0;
    this.keyDir = 0;
    this.prevRot = 0;
    const top0 = this.layers[0].y;
    this.ball = {
      y: top0 + PHYS.BALL_R + 1.4,
      vy: 0,
      py: top0 + PHYS.BALL_R + 1.4,
      state: "FALLING",
      landedAt: -10,
      landY: top0,
      streak: 0,
      smash: false,
      smashAt: -10,
    };
    this.status = "play"; // play | dead | finished
    this.cause = null;
    this.endAt = 0;
    this.focus = this.ball.y; // camera focus height (only ever moves down)
    this.lastLayer = -1; // index of the layer last landed on
    this.events = [];
    this.stats = { bounces: 0, drops: 0, floors: 0, maxStreak: 0, smashes: 0, destroyed: 0 };
    this.total = this.layers.filter((l) => !l.finish).length;
    this.passedCount = 0;
  }

  emit(type, data) {
    this.events.push({ type, t: this.t, ...data });
  }

  /** Tower-local angle currently under the ball. */
  phi(rot = this.rot) {
    return norm(PHYS.BALL_ANGLE + rot);
  }

  /** Drag input: add a rotation delta (radians) to the target. */
  dragBy(d) {
    if (this.status !== "play") return;
    this.target += d;
  }

  setKey(dir) {
    this.keyDir = dir > 0 ? 1 : dir < 0 ? -1 : 0;
  }

  /** Stop following any pending drag (pause / blur / screen change). */
  settle() {
    this.target = this.rot;
    this.keyDir = 0;
  }

  get progress() {
    return this.total ? clamp(this.passedCount / this.total, 0, 1) : 0;
  }

  step() {
    const dt = PHYS.DT;
    const t0 = this.t;
    const t1 = t0 + dt;
    this.t = t1;
    const b = this.ball;

    /* ---- tower rotation: follow the target at a capped speed ---- */
    this.prevRot = this.rot;
    if (this.status === "play") {
      if (this.keyDir) this.target += this.keyDir * PHYS.KEY_SPEED * dt;
      const d = this.target - this.rot;
      const cap = this.rotCap * dt;
      this.rot += d > cap ? cap : d < -cap ? -cap : d;
      // keep both values small forever (no precision creep after 1000s of turns)
      if (this.rot > 64 * TAU || this.rot < -64 * TAU) {
        const k = Math.trunc(this.rot / TAU) * TAU;
        this.rot -= k;
        this.prevRot -= k;
        this.target -= k;
      }
    } else this.target = this.rot;

    /* ---- vertical motion ---- */
    b.py = b.y;
    if (this.status === "finished" && b.rest) return;
    b.vy -= PHYS.G * dt;
    if (b.vy < -PHYS.MAX_FALL) b.vy = -PHYS.MAX_FALL;
    b.y += b.vy * dt;

    if (this.status === "dead") {
      // the ball pops off the danger slab and rests on it (no sinking through)
      if (b.y < b.landY + PHYS.BALL_R) {
        b.y = b.landY + PHYS.BALL_R;
        b.vy = 0;
      }
      return;
    }

    /* ---- swept, multi-layer, one-way collision ---- */
    if (b.vy <= 0) {
      const R = PHYS.BALL_R;
      const top0 = b.py - R; // previous bottom
      const top1 = b.y - R; // current bottom
      for (const L of this.layers) {
        if (L.y > top0 + 1e-9 || L.y < top1) continue; // not crossed this step (layers are ordered top-down)
        if (L.destroyed) {
          this._hit = null; // nothing is hit: the floor is already gone
          this.pass(L);
          continue;
        }
        const f = top0 === top1 ? 1 : clamp((top0 - L.y) / (top0 - top1), 0, 1);
        const tc = t0 + dt * f;
        const rc = this.prevRot + (this.rot - this.prevRot) * f;
        const kind = classify(L, this.phi(rc), tc);
        this._hit = { f, phi: this.phi(rc), tc };
        if (this.status === "finished") {
          if (L.finish) this.settleOnFinish(L);
          break;
        }
        if (kind === "gap") {
          this.pass(L);
          continue;
        }
        if (kind === "finish") {
          this.finishAt(L);
          break;
        }
        if (b.smash) {
          this.smashLayer(L);
          continue; // keeps falling — lower layers in this sweep are still processed in order
        }
        if (kind === "danger") {
          this.die(L);
          break;
        }
        this.land(L, kind);
        break;
      }
    }

    // camera focus: small dead zone, only ever moves down
    if (b.y < this.focus - 0.6) this.focus = b.y + 0.6;

    b.state =
      this.status === "finished"
        ? "FINISHED"
        : b.smash
          ? "SMASHING"
          : b.vy > 0
            ? "BOUNCING"
            : b.streak > 0
              ? "DROPPING"
              : "FALLING";
  }

  pass(L) {
    if (L.passed) return;
    L.passed = true;
    const b = this.ball;
    if (!L.finish) this.passedCount++;
    this.stats.floors++;
    b.streak++;
    if (b.streak === 1) this.stats.drops++;
    if (b.streak > this.stats.maxStreak) this.stats.maxStreak = b.streak;
    this.emit("pass", { layer: L.idx, streak: b.streak, ...this._hit });
    if (!b.smash && b.streak >= PHYS.SMASH_STREAK) {
      b.smash = true;
      b.smashAt = this.t;
      this.emit("smashOn", { layer: L.idx });
    }
  }

  land(L, kind) {
    const b = this.ball;
    b.y = L.y + PHYS.BALL_R;
    b.vy = PHYS.BOUNCE;
    b.landedAt = this.t;
    b.landY = L.y;
    b.streak = 0;
    L.hitAt = this.t;
    this.lastLayer = L.idx;
    this.stats.bounces++;
    this.emit("bounce", { layer: L.idx, kind, ...this._hit });
  }

  smashLayer(L) {
    const b = this.ball;
    L.destroyed = true;
    L.destroyedAt = this.t;
    L.hitAt = this.t;
    this.stats.smashes++;
    this.stats.destroyed++;
    // Smash is spent on this crash; the crashed floor counts as passed
    b.smash = false;
    b.streak = 0;
    b.vy = Math.max(b.vy, -PHYS.SMASH_EXIT);
    L.passed = false;
    this.pass(L);
    b.streak = 0;
    this.emit("smash", { layer: L.idx, ...this._hit });
  }

  die(L) {
    const b = this.ball;
    this.status = "dead";
    this.cause = "danger";
    this.endAt = this.t;
    b.y = L.y + PHYS.BALL_R;
    b.landY = L.y;
    b.vy = 3.2; // small pop-up reaction
    b.smash = false;
    L.hitAt = this.t;
    this.emit("death", { layer: L.idx, ...this._hit });
  }

  finishAt(L) {
    const b = this.ball;
    this.status = "finished";
    this.endAt = this.t;
    b.smash = false;
    b.streak = 0;
    L.hitAt = this.t;
    this.passedCount = this.total;
    this.settleOnFinish(L);
    this.emit("finish", { layer: L.idx });
  }

  settleOnFinish(L) {
    const b = this.ball;
    const impact = -b.vy;
    b.y = L.y + PHYS.BALL_R;
    if (impact > 2) b.vy = impact * 0.45;
    else {
      b.vy = 0;
      b.rest = true;
    }
  }

  /* -------------------------------------------------- endless helpers */

  addLayers(defs) {
    const base = this.layers.length ? this.layers[this.layers.length - 1].idx + 1 : 0;
    defs.forEach((d, i) => this.layers.push(makeLayer(d, base + i)));
  }

  /** Drop layers far above the camera (endless only). */
  prune(keepAbove = 12) {
    const cut = this.focus + keepAbove;
    if (this.layers.length && this.layers[0].y < cut) return;
    this.layers = this.layers.filter((L) => L.y < cut);
  }

  /* ------------------------------------------------ snapshots (bot) */

  snapshot() {
    return {
      t: this.t,
      rot: this.rot,
      target: this.target,
      prevRot: this.prevRot,
      ball: { ...this.ball },
      status: this.status,
      cause: this.cause,
      endAt: this.endAt,
      focus: this.focus,
      lastLayer: this.lastLayer,
      passedCount: this.passedCount,
      layers: this.layers.map((L) => [L.destroyed, L.destroyedAt, L.passed, L.hitAt]),
      stats: { ...this.stats },
    };
  }

  restore(s) {
    Object.assign(this, {
      t: s.t,
      rot: s.rot,
      target: s.target,
      prevRot: s.prevRot,
      status: s.status,
      cause: s.cause,
      endAt: s.endAt,
      focus: s.focus,
      lastLayer: s.lastLayer,
      passedCount: s.passedCount,
    });
    this.ball = { ...s.ball };
    this.layers.forEach((L, i) => {
      [L.destroyed, L.destroyedAt, L.passed, L.hitAt] = s.layers[i];
    });
    this.stats = { ...s.stats };
    this.events.length = 0;
  }
}

export { SOLID };
