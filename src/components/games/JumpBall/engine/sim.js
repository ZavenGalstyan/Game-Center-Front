/**
 * Jump Ball — deterministic headless simulation (no DOM, no canvas).
 *
 * The live game, the level validator (tools/validateLevels.mjs), the endless
 * generator test and the menu demo all drive THIS class with the same fixed
 * step (PHYS.DT), so "the validator could finish it" means exactly "the
 * player's physics can finish it".
 *
 * World is y-UP. A platform's data `y` is its TOP surface. Everything the
 * renderer needs is read from here; collision never looks at the DOM.
 *
 * Landing rule (the heart of the game), evaluated once per step:
 *   ball is FALLING (vy ≤ 0)
 *   AND its bottom moved from ≥ the platform top (previous step, platform's
 *       previous position) to ≤ the top (this step, platform's current position)
 *   AND at the crossing moment its footprint (±R·FOOT) overlaps the platform.
 * The highest crossed platform wins, the ball is snapped onto it and gets an
 * exact take-off velocity — so bounce height can never drift, and a fast fall
 * can never tunnel (the test is swept, not an overlap test).
 */
import { PHYS, perfectHalf } from "./constants.js";

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export const LANDABLE = new Set(["normal", "moving", "breaking", "spring", "vanish", "ice", "finish", "start"]);

/* ------------------------------------------------------------ platforms */

/** Offset of a moving platform at sim time t (sine — readable, never random). */
function moveOffset(m, t) {
  if (!m) return 0;
  return m.amp * Math.sin((TAU * t) / m.period + (m.phase || 0) * TAU);
}

export function platX(p, t) {
  return p.move && p.move.axis !== "y" ? p.x + moveOffset(p.move, t) : p.x;
}

export function platTop(p, t) {
  return p.move && p.move.axis === "y" ? p.y + moveOffset(p.move, t) : p.y;
}

/**
 * Vanishing platform cycle: on → warn (blinks, still solid) → off (ghost
 * outline, NOT solid) → back (fades in, NOT solid until fully back).
 * Returns { phase, k } where k is 0..1 progress through that phase.
 */
export function vanishState(p, t) {
  const c = p.cycle;
  const period = c.on + c.warn + c.off + c.back;
  let u = (t + (c.offset || 0)) % period;
  if (u < 0) u += period;
  if (u < c.on) return { phase: "on", k: u / c.on };
  u -= c.on;
  if (u < c.warn) return { phase: "warn", k: u / c.warn };
  u -= c.warn;
  if (u < c.off) return { phase: "off", k: u / c.off };
  u -= c.off;
  return { phase: "back", k: u / c.back };
}

export function platSolid(p, t) {
  if (p.broken) return false;
  if (p.type === "vanish") {
    const s = vanishState(p, t).phase;
    return s === "on" || s === "warn";
  }
  return true;
}

export const DEFAULT_CYCLE = { on: 2.2, warn: 0.9, off: 1.5, back: 0.5, offset: 0 };

/** Normalise one level/endless platform record into a runtime object. */
export function makePlatform(d, i) {
  const p = {
    id: d.id ?? `p${i}`,
    x: d.x,
    y: d.y,
    w: d.w,
    h: d.h ?? PHYS.PLATFORM_H,
    type: d.type || "normal",
    move: d.move ? { axis: d.move.axis || "x", amp: d.move.amp, period: d.move.period, phase: d.move.phase || 0 } : null,
    cycle: d.type === "vanish" ? { ...DEFAULT_CYCLE, ...(d.cycle || {}) } : null,
    broken: false,
    brokenAt: 0,
    hitAt: -10, // last landing time (visual response)
    seq: i,
    path: d.path, // endless main-path index (undefined for handcrafted levels)
  };
  return p;
}

/* ------------------------------------------------------------------ sim */

export class Sim {
  /**
   * level: { width, start: { x }, platforms: [...], stars: [{x,y}], endless? }
   * opts.ctrl: control-authority multiplier (validator margin testing only;
   *            the real game always uses 1).
   */
  constructor(level, opts = {}) {
    this.level = level;
    this.width = level.width || PHYS.WIDTH;
    this.ctrl = opts.ctrl ?? 1;
    this.platforms = level.platforms.map(makePlatform);
    this.stars = (level.stars || []).map((s, i) => ({ id: i, x: s.x, y: s.y, taken: false, takenAt: 0 }));
    const start = this.platforms.find((p) => p.type === "start") || this.platforms[0];
    this.t = 0;
    this.input = 0; // -1 | 0 | 1
    this.ball = {
      x: level.start?.x ?? platX(start, 0),
      y: platTop(start, 0) + PHYS.R,
      vx: 0,
      vy: PHYS.BOUNCE * 0.55, // a small first hop — the ball is "dropped" in
      px: 0,
      py: 0,
      ice: 0,
      spin: 0,
      state: "RISING",
      landedAt: -10,
      landType: null,
    };
    this.ball.px = this.ball.x;
    this.ball.py = this.ball.y;
    // the ball drops in with a small hop; steering unlocks on the first landing
    // so holding a direction from frame one can never carry it off the start pad
    this.introLock = true;
    this.status = "play"; // play | dead | finished
    this.deathCause = null;
    this.endAt = 0;
    this.anchor = platTop(start, 0); // top of the highest platform landed on
    this.lastPlat = start;
    this.events = [];
    this.stats = {
      bounces: 0,
      perfects: 0,
      streak: 0,
      bestStreak: 0,
      moving: 0,
      springs: 0,
      breaks: 0,
      stars: 0,
      height: 0,
    };
    this.pruneBelow = -Infinity;
  }

  /** Bottom of the camera's logical view (world y). Viewport-independent. */
  get camBottom() {
    const b = this.ball;
    const byAnchor = this.anchor - PHYS.CAM_ANCHOR;
    // a very high bounce may push the view up; never down
    const byBall = b.y + PHYS.R + PHYS.CAM_TOP_PAD - PHYS.VIEW_H;
    return Math.max(byAnchor, this._camFloor ?? -Infinity, byBall);
  }

  /** Fail line: the ball has left the bottom of the logical view entirely. */
  get failY() {
    return this.camBottom - PHYS.R - 8;
  }

  emit(type, data) {
    this.events.push({ type, t: this.t, ...data });
  }

  setInput(dir) {
    this.input = dir > 0 ? 1 : dir < 0 ? -1 : 0;
  }

  /** One fixed step of PHYS.DT. */
  step() {
    const dt = PHYS.DT;
    const b = this.ball;
    const t0 = this.t;
    const t1 = t0 + dt;
    this.t = t1;
    // the camera may only rise: latch its current value before moving
    this._camFloor = this.camBottom;

    b.px = b.x;
    b.py = b.y;

    /* ---- horizontal: acceleration / reversal braking / drag / cap ---- */
    const onIce = b.ice > 0;
    if (b.ice > 0) b.ice = Math.max(0, b.ice - dt);
    const dir = this.status === "play" && !this.introLock ? this.input : 0;
    const ctrl = this.ctrl * (onIce ? PHYS.ICE_ACCEL : 1);
    const drag = onIce ? PHYS.ICE_DRAG : PHYS.DRAG;
    const cap = PHYS.MAX_VX * this.ctrl;
    if (dir !== 0) {
      const against = b.vx * dir < 0;
      b.vx += dir * (PHYS.ACCEL * ctrl + (against ? PHYS.TURN * ctrl : 0)) * dt;
    } else if (b.vx !== 0) {
      const dv = drag * dt;
      b.vx = Math.abs(b.vx) <= dv ? 0 : b.vx - Math.sign(b.vx) * dv;
    }
    if (b.vx > cap) b.vx = cap;
    else if (b.vx < -cap) b.vx = -cap;

    /* ---- vertical: semi-implicit Euler ---- */
    if (b.rest) b.vy = 0;
    else {
      b.vy -= PHYS.G * dt;
      if (b.vy < -PHYS.MAX_FALL) b.vy = -PHYS.MAX_FALL;
    }
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.spin += (b.vx * dt) / PHYS.R;

    /* ---- hard side walls ---- */
    const minX = PHYS.R;
    const maxX = this.width - PHYS.R;
    if (b.x < minX) {
      b.x = minX;
      if (b.vx < 0) {
        if (b.vx < -150 && this.status === "play") this.emit("wall", { side: -1 });
        b.vx = 0;
      }
    } else if (b.x > maxX) {
      b.x = maxX;
      if (b.vx > 0) {
        if (b.vx > 150 && this.status === "play") this.emit("wall", { side: 1 });
        b.vx = 0;
      }
    }

    if (this.status === "dead") {
      b.state = "DEAD";
      return;
    }

    /* ---- swept one-way landing ---- */
    if (b.vy <= 0) {
      const R = PHYS.R;
      const foot = R * PHYS.FOOT;
      const prevBottom = b.py - R;
      const bottom = b.y - R;
      let best = null;
      let bestTop = -Infinity;
      let bestF = 0;
      for (const p of this.platforms) {
        if (!LANDABLE.has(p.type)) continue;
        if (this.status === "finished" && p.type !== "finish") continue;
        // both ends of the step must be solid — no landing on a platform that
        // only just blinked out or hasn't finished fading back in
        if (!platSolid(p, t0) || !platSolid(p, t1)) continue;
        const topPrev = platTop(p, t0);
        const topNow = platTop(p, t1);
        const relPrev = prevBottom - topPrev;
        const relNow = bottom - topNow;
        if (relPrev < -0.001 || relNow > 0 || relPrev <= relNow) continue;
        const f = clamp(relPrev / (relPrev - relNow), 0, 1);
        const bx = b.px + (b.x - b.px) * f;
        const px = platX(p, t0) + (platX(p, t1) - platX(p, t0)) * f;
        if (Math.abs(bx - px) > p.w / 2 + foot) continue;
        const top = topPrev + (topNow - topPrev) * f;
        if (top > bestTop) {
          bestTop = top;
          best = p;
          bestF = f;
        }
      }
      if (best) this.land(best, bestTop, bestF);
    }

    if (this.status === "finished") {
      b.state = "FINISHED";
      return;
    }

    /* ---- hazards (spikes): circle vs slightly-shrunk box ---- */
    for (const p of this.platforms) {
      if (p.type !== "spikes") continue;
      const px = platX(p, t1);
      const top = platTop(p, t1);
      const hw = p.w / 2 - 4;
      const x0 = px - hw;
      const x1 = px + hw;
      const y1 = top - 3;
      const y0 = top - p.h + 3;
      const cx = clamp(b.x, x0, x1);
      const cy = clamp(b.y, y0, y1);
      const dx = b.x - cx;
      const dy = b.y - cy;
      if (dx * dx + dy * dy < (PHYS.R - 2) * (PHYS.R - 2)) {
        this.die("spikes");
        return;
      }
    }

    /* ---- stars ---- */
    const sr = PHYS.R + PHYS.STAR_R;
    for (const s of this.stars) {
      if (s.taken) continue;
      const dx = b.x - s.x;
      const dy = b.y - s.y;
      if (dx * dx + dy * dy <= sr * sr) {
        s.taken = true;
        s.takenAt = this.t;
        this.stats.stars++;
        this.emit("star", { id: s.id, x: s.x, y: s.y, count: this.stats.stars });
      }
    }

    /* ---- fell out of the view ---- */
    if (b.y < this.failY) {
      this.die("fall");
      return;
    }

    b.state = b.vy > 0 ? (this.t - b.landedAt < 0.12 ? (b.landType === "spring" ? "SPRING_BOOST" : "BOUNCING") : "RISING") : "FALLING";
    if (b.y > this.stats.height + PHYS.R) this.stats.height = b.y - PHYS.R;
  }

  land(p, top, f) {
    const b = this.ball;
    const px = platX(p, this.t - PHYS.DT + PHYS.DT * f);
    const impact = -b.vy;
    b.y = top + PHYS.R;
    b.landTop = b.y;
    this.introLock = false;
    p.hitAt = this.t;
    b.landedAt = this.t;
    b.landType = p.type;

    if (this.status === "finished") {
      // settling bounces inside the goal
      if (impact > 260) {
        b.vy = impact * 0.42;
        this.emit("settle", { impact });
      } else {
        b.vy = 0;
        b.rest = true;
      }
      return;
    }

    const off = b.x - px;
    const perfect = p.type !== "finish" && Math.abs(off) <= perfectHalf(p.w);
    const st = this.stats;
    st.bounces++;
    if (perfect) {
      st.perfects++;
      st.streak++;
      if (st.streak > st.bestStreak) st.bestStreak = st.streak;
    } else st.streak = 0;
    if (p.move) st.moving++;

    if (p.type === "finish") {
      this.status = "finished";
      this.endAt = this.t;
      b.vy = 560;
      b.vx *= 0.3;
      b.ice = 0;
      this.anchor = Math.max(this.anchor, top);
      this.emit("finish", { x: b.x, y: top, platform: p.id });
      return;
    }

    if (p.type === "spring") {
      b.vy = PHYS.SPRING;
      st.springs++;
    } else b.vy = PHYS.BOUNCE;

    if (p.type === "ice") b.ice = PHYS.ICE_TIME;
    else b.ice = 0; // any other surface clears the ice effect

    if (p.type === "breaking") {
      // the bounce is already given — only now does the platform go
      p.broken = true;
      p.brokenAt = this.t;
      st.breaks++;
    }

    this.anchor = Math.max(this.anchor, top);
    this.lastPlat = p;
    this.emit("land", {
      platform: p.id,
      ptype: p.type,
      moving: !!p.move,
      perfect,
      streak: st.streak,
      x: b.x,
      y: top,
      impact,
      off,
    });
  }

  die(cause) {
    if (this.status !== "play") return;
    this.status = "dead";
    this.deathCause = cause;
    this.endAt = this.t;
    this.stats.streak = 0;
    if (cause === "spikes") {
      this.ball.vy = 520;
      this.ball.vx *= 0.3;
    }
    this.emit("death", { cause, x: this.ball.x, y: this.ball.y });
  }

  /* -------------------------------------------------- endless helpers */

  addPlatforms(list) {
    const base = this.platforms.length ? this.platforms[this.platforms.length - 1].seq + 1 : 0;
    list.forEach((d, i) => this.platforms.push(makePlatform(d, base + i)));
  }

  addStars(list) {
    let id = this.stars.length ? this.stars[this.stars.length - 1].id + 1 : 0;
    for (const s of list) this.stars.push({ id: id++, x: s.x, y: s.y, taken: false, takenAt: 0 });
  }

  /** Drop anything far below the camera (endless only — never reachable again). */
  prune(margin = 900) {
    const cut = this.camBottom - margin;
    if (this.platforms.length && this.platforms[0].y > cut) return;
    this.platforms = this.platforms.filter((p) => platTop(p, this.t) > cut && !(p.broken && this.t - p.brokenAt > 3));
    this.stars = this.stars.filter((s) => s.y > cut && !(s.taken && this.t - s.takenAt > 2));
  }

  /* ------------------------------------------------ snapshots (bot) */

  snapshot() {
    return {
      t: this.t,
      input: this.input,
      ball: { ...this.ball },
      introLock: this.introLock,
      status: this.status,
      deathCause: this.deathCause,
      endAt: this.endAt,
      anchor: this.anchor,
      camFloor: this._camFloor,
      lastPlat: this.lastPlat,
      plats: this.platforms.map((p) => [p.broken, p.brokenAt, p.hitAt]),
      stars: this.stars.map((s) => [s.taken, s.takenAt]),
      stats: { ...this.stats },
    };
  }

  restore(s) {
    this.t = s.t;
    this.input = s.input;
    this.ball = { ...s.ball };
    this.introLock = s.introLock;
    this.status = s.status;
    this.deathCause = s.deathCause;
    this.endAt = s.endAt;
    this.anchor = s.anchor;
    this._camFloor = s.camFloor;
    this.lastPlat = s.lastPlat;
    this.platforms.forEach((p, i) => {
      [p.broken, p.brokenAt, p.hitAt] = s.plats[i];
    });
    this.stars.forEach((st, i) => {
      [st.taken, st.takenAt] = s.stars[i];
    });
    this.stats = { ...s.stats };
    this.events.length = 0;
  }
}
