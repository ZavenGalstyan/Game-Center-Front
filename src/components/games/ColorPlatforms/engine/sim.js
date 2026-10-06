/**
 * Color Platforms — the authoritative, deterministic simulation.
 *
 * No DOM, no canvas, no randomness: the same inputs at the same fixed step
 * always give the same result, so the headless tests and the route bot
 * (tools/, engine/bot.js) exercise exactly the code players run.
 *
 * Collision model (deliberately simple):
 *  - Every platform is a one-way top surface. Sides and undersides never
 *    collide, so a wrong color can never "kill" by touching it.
 *  - Landing = the feet cross a platform top from above this step (swept
 *    against the platform's previous AND current top, so fast falls and
 *    moving platforms cannot tunnel) + horizontal overlap + canStandOn().
 *  - A crossed platform of the wrong color is passed through: it flashes once
 *    and the player keeps falling.
 *  - Standing is re-validated every step. Switching to a color that no longer
 *    matches the platform underfoot drops the player at once.
 *
 * Player state: status (play | respawn | finished) + grounded/ground index.
 * The active color is separate and changes instantly (setColor).
 */
import { PHYS, canStandOn, PLAYER_COLORS } from "./constants.js";
import { moveOffset } from "../data/levelFormat.js";

const tmp = { x: 0, y: 0 };
const crossed = []; // scratch list reused by the landing check

export class Sim {
  constructor(level) {
    this.level = level;
    // static platform data is shared; this holds the dynamic part
    this.plats = level.platforms.map((p) => ({
      def: p,
      x: p.x,
      y: p.y,
      px: p.x,
      py: p.y,
      vx: 0,
      vy: 0,
      fade: 0, // 0 solid · 1 armed (counting down) · 2 gone
      fadeT: 0,
      flash: 0, // wrong-color flash (render)
      squash: 0, // bounce compression (render)
      cool: 0, // wrong-color feedback cooldown
    }));
    this.hz = level.hazards.map((h) => ({ def: h, x: h.x, y: h.y }));
    this.events = [];
    this.reset();
  }

  /** Fresh attempt: player at spawn, everything restored, stats zeroed. */
  reset() {
    const L = this.level;
    this.t = 0; // platform clock (never stops while the level is loaded)
    this.time = 0; // attempt timer (stops at the finish)
    this.status = "play";
    this.statusT = 0;
    this.respawnPoint = { x: L.spawn.x, y: L.spawn.y };
    this.checkpointHit = false;
    this.starsGot = L.stars.map(() => false);
    this.finished = false;
    this.p = {
      x: L.spawn.x,
      y: L.spawn.y,
      vx: 0,
      vy: 0,
      grounded: false,
      ground: -1,
      coyote: 0,
      buffer: 0,
      launch: false, // rising from a bounce (no jump-cut)
      color: L.startColor,
      face: 1,
      landImpact: 0,
      placed: true,
    };
    this.bounceSeq = 0;
    this.lastBounce = -1;
    this.stats = { jumps: 0, switches: 0, BLUE: 0, RED: 0, YELLOW: 0, falls: 0, checkpoints: 0, moving: 0, fades: 0, bounces: 0 };
    for (const s of this.plats) {
      s.fade = 0;
      s.fadeT = 0;
      s.flash = 0;
      s.squash = 0;
      s.cool = 0;
    }
    this.placePlatforms(0, true);
    this.snapToGround();
    this.events.length = 0;
  }

  /** Copy for bot lookahead — static data shared, dynamic state duplicated. */
  clone() {
    const c = Object.create(Sim.prototype);
    c.level = this.level;
    c.plats = this.plats.map((s) => ({ ...s }));
    c.hz = this.hz.map((h) => ({ ...h }));
    c.events = [];
    c.t = this.t;
    c.time = this.time;
    c.status = this.status;
    c.statusT = this.statusT;
    c.respawnPoint = { ...this.respawnPoint };
    c.checkpointHit = this.checkpointHit;
    c.starsGot = this.starsGot.slice();
    c.finished = this.finished;
    c.p = { ...this.p };
    c.bounceSeq = this.bounceSeq;
    c.lastBounce = this.lastBounce;
    c.stats = { ...this.stats };
    return c;
  }

  emit(type, a, b) {
    this.events.push({ type, a, b });
  }

  /* ------------------------------------------------------------ input */

  /** Instant: gameplay color changes now; visuals catch up on their own. */
  setColor(color) {
    if (!PLAYER_COLORS.includes(color) || this.status === "finished") return false;
    if (color === this.p.color) return false;
    this.p.color = color;
    this.stats.switches += 1;
    this.stats[color] += 1;
    this.emit("switch", color);
    return true;
  }

  /** Register a jump press (edge). Buffered for PHYS.BUFFER seconds. */
  pressJump() {
    if (this.status !== "play") return;
    this.p.buffer = PHYS.BUFFER;
  }

  /* ------------------------------------------------------------ world */

  placePlatforms(dt, instant = false) {
    for (const s of this.plats) {
      const d = s.def;
      s.px = s.x;
      s.py = s.y;
      if (d.move) {
        moveOffset(d.move, this.t, tmp);
        s.x = d.x + tmp.x;
        s.y = d.y + tmp.y;
      }
      if (instant) {
        s.px = s.x;
        s.py = s.y;
        s.vx = 0;
        s.vy = 0;
      } else if (dt > 0) {
        s.vx = (s.x - s.px) / dt;
        s.vy = (s.y - s.py) / dt;
      }
    }
    for (const h of this.hz) {
      if (!h.def.move) continue;
      moveOffset(h.def.move, this.t, tmp);
      h.x = h.def.x + tmp.x;
      h.y = h.def.y + tmp.y;
    }
  }

  solid(s) {
    return s.fade !== 2;
  }

  overlapsX(s, x) {
    return x + PHYS.FOOT > s.x && x - PHYS.FOOT < s.x + s.def.w;
  }

  /** Can platform s hold the player right now? (the only support rule) */
  supports(s) {
    return this.solid(s) && s.def.type === "normal" && this.overlapsX(s, this.p.x) && canStandOn(s.def, this.p.color);
  }

  /** A standable platform whose top is at the feet (adjacent / handover). */
  findSupport(tol = 1.5) {
    const p = this.p;
    let best = -1;
    for (let i = 0; i < this.plats.length; i++) {
      const s = this.plats[i];
      if (Math.abs(s.y - p.y) <= tol && this.supports(s)) {
        if (best < 0 || Math.abs(s.y - p.y) < Math.abs(this.plats[best].y - p.y)) best = i;
      }
    }
    return best;
  }

  snapToGround() {
    const p = this.p;
    const i = this.findSupport(2);
    if (i >= 0) {
      p.grounded = true;
      p.ground = i;
      p.y = this.plats[i].y;
    } else {
      p.grounded = false;
      p.ground = -1;
    }
  }

  /* ------------------------------------------------------------ step */

  step(inp) {
    const dt = PHYS.DT;
    this.t += dt;
    this.placePlatforms(dt);
    for (const s of this.plats) {
      if (s.flash > 0) s.flash = Math.max(0, s.flash - dt);
      if (s.squash > 0) s.squash = Math.max(0, s.squash - dt * 4);
      if (s.cool > 0) s.cool -= dt;
      const f = s.def.fade;
      if (!f || s.fade === 0) continue;
      s.fadeT += dt;
      if (s.fade === 1 && s.fadeT >= f.stay) {
        s.fade = 2;
        s.fadeT = 0;
        this.emit("fadeGone", s.def.id);
      } else if (s.fade === 2 && f.back > 0 && s.fadeT >= f.back) {
        s.fade = 0;
        s.fadeT = 0;
        this.emit("fadeBack", s.def.id);
      }
    }

    this.statusT += dt;
    if (this.status === "finished") return;
    this.time += dt;

    if (this.status === "respawn") {
      if (this.statusT >= PHYS.RESPAWN_OUT && !this.p.placed) this.teleport();
      if (this.statusT >= PHYS.RESPAWN_OUT + 0.02) {
        this.status = "play";
        this.statusT = 0;
      }
      return;
    }

    const p = this.p;
    const dir = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
    if (dir) p.face = dir;

    /* ride + support */
    if (p.grounded) {
      const g = this.plats[p.ground];
      p.x += g.x - g.px;
      p.y = g.y;
      if (!this.supports(g)) {
        const colorLost = this.solid(g) && this.overlapsX(g, p.x) && !canStandOn(g.def, p.color);
        const alt = this.findSupport();
        if (alt >= 0) {
          p.ground = alt;
          p.y = this.plats[alt].y;
        } else {
          this.leaveGround(g, colorLost ? 0 : PHYS.COYOTE);
          if (colorLost && g.cool <= 0) {
            g.flash = 0.28;
            g.cool = 0.4;
            this.emit("wrong", g.def.id, "switch");
          }
        }
      }
    }

    /* horizontal */
    const target = dir * PHYS.RUN;
    let a;
    if (p.grounded) a = dir === 0 ? PHYS.DECEL : Math.sign(p.vx) === -dir && p.vx !== 0 ? PHYS.TURN : PHYS.ACCEL;
    else if (dir !== 0 && Math.sign(p.vx) === dir && Math.abs(p.vx) > PHYS.RUN) a = PHYS.AIR_DECEL;
    else a = dir === 0 ? PHYS.AIR_DECEL : PHYS.AIR_ACCEL;
    if (p.vx < target) p.vx = Math.min(target, p.vx + a * dt);
    else if (p.vx > target) p.vx = Math.max(target, p.vx - a * dt);
    p.x += p.vx * dt;

    /* walking off an edge */
    if (p.grounded && !this.supports(this.plats[p.ground])) {
      const alt = this.findSupport();
      if (alt >= 0) {
        p.ground = alt;
        p.y = this.plats[alt].y;
      } else this.leaveGround(this.plats[p.ground], PHYS.COYOTE);
    }

    /* jump (buffer + coyote) */
    if (p.buffer > 0 && (p.grounded || p.coyote > 0)) {
      if (p.grounded) {
        const g = this.plats[p.ground];
        if (g.def.move) p.vx += g.vx;
      }
      p.vy = -PHYS.JUMP_V;
      p.grounded = false;
      p.ground = -1;
      p.coyote = 0;
      p.buffer = 0;
      p.launch = false;
      this.stats.jumps += 1;
      this.emit("jump");
    }
    if (p.coyote > 0) p.coyote -= dt;
    if (p.buffer > 0) p.buffer -= dt;

    /* vertical */
    if (!p.grounded) {
      let g = PHYS.GRAVITY;
      if (p.vy < 0) {
        if (!inp.jump && !p.launch) g *= PHYS.CUT_MULT;
      } else {
        g *= PHYS.FALL_MULT;
        p.launch = false;
      }
      p.vy = Math.min(PHYS.MAX_FALL, p.vy + g * dt);
      const prevFeet = p.y;
      p.y += p.vy * dt;
      if (p.vy >= 0) this.land(prevFeet);
    }

    this.checkWorld();
  }

  leaveGround(g, coyote) {
    const p = this.p;
    if (g.def.move) {
      p.vx += g.vx;
      p.vy = Math.max(0, g.vy);
    } else p.vy = 0;
    p.grounded = false;
    p.ground = -1;
    p.coyote = coyote;
  }

  land(prevFeet) {
    const p = this.p;
    crossed.length = 0;
    for (let i = 0; i < this.plats.length; i++) {
      const s = this.plats[i];
      if (!this.solid(s) || !this.overlapsX(s, p.x)) continue;
      // swept: above the old top before, at/below the new top now
      if (prevFeet <= s.py + 0.5 && p.y >= s.y) crossed.push(i);
    }
    if (!crossed.length) return;
    if (crossed.length > 1) crossed.sort((i, j) => this.plats[i].py - this.plats[j].py);
    for (const i of crossed) {
      const s = this.plats[i];
      if (s.def.type === "bounce") {
        p.y = s.y;
        p.vy = -PHYS.BOUNCE_V;
        p.launch = true;
        p.coyote = 0;
        s.squash = 1;
        this.bounceSeq += 1;
        this.lastBounce = s.def.id;
        this.stats.bounces += 1;
        this.emit("bounce", s.def.id);
        return;
      }
      if (canStandOn(s.def, p.color)) {
        p.landImpact = p.vy;
        p.y = s.y;
        p.vy = 0;
        p.grounded = true;
        p.ground = i;
        p.launch = false;
        if (s.def.move) this.stats.moving += 1;
        if (s.def.fade && s.fade === 0) {
          s.fade = 1;
          s.fadeT = 0;
          this.stats.fades += 1;
          this.emit("fadeArm", s.def.id);
        }
        this.emit("land", s.def.id, p.landImpact);
        return;
      }
      // wrong color: pass through with feedback (once per pass)
      if (s.cool <= 0) {
        s.flash = 0.28;
        s.cool = 0.5;
        this.emit("wrong", s.def.id, "land");
      }
    }
  }

  checkWorld() {
    const p = this.p;
    const L = this.level;
    const hw = PHYS.W / 2 - 3;
    const top = p.y - PHYS.H + 4;

    for (const h of this.hz) {
      const d = h.def;
      if (d.kind === "spikes") {
        if (p.x + hw > h.x + 3 && p.x - hw < h.x + d.w - 3 && p.y > h.y - 13 && top < h.y) return this.die("spikes");
      } else {
        const cx = Math.max(p.x - hw, Math.min(h.x, p.x + hw));
        const cy = Math.max(top, Math.min(h.y, p.y - 2));
        const dx = h.x - cx;
        const dy = h.y - cy;
        if (dx * dx + dy * dy < (d.r - 3) * (d.r - 3)) return this.die("saw");
      }
    }
    if (p.y > L.bounds.killY) return this.die("fall");

    const cy = p.y - PHYS.H / 2;
    for (let i = 0; i < L.stars.length; i++) {
      if (this.starsGot[i]) continue;
      const s = L.stars[i];
      const dx = Math.abs(s.x - p.x);
      const dy = Math.abs(s.y - cy);
      if (dx < PHYS.STAR_R + PHYS.W / 2 - 2 && dy < PHYS.STAR_R + PHYS.H / 2 - 2) {
        this.starsGot[i] = true;
        this.emit("star", i);
      }
    }

    const c = L.checkpoint;
    if (c && !this.checkpointHit && Math.abs(p.x - c.x) < 26 && p.y > c.y - 70 && p.y <= c.y + 2) {
      this.checkpointHit = true;
      this.respawnPoint = { x: c.x, y: c.y };
      this.stats.checkpoints += 1;
      this.emit("checkpoint");
    }

    const f = L.finish;
    if (!this.finished && Math.abs(p.x - f.x) < 24 && p.y > f.y - 96 && p.y <= f.y + 4) {
      this.finished = true;
      this.status = "finished";
      this.statusT = 0;
      p.vx = 0;
      p.buffer = 0;
      this.emit("finish");
    }
  }

  die(cause) {
    if (this.status !== "play") return;
    const p = this.p;
    this.status = "respawn";
    this.statusT = 0;
    this.stats.falls += 1;
    p.placed = false;
    p.buffer = 0;
    p.coyote = 0;
    this.emit("die", cause, { x: p.x, y: p.y, color: p.color });
  }

  /** Respawn: latest checkpoint (or spawn), level start color, fades restored. */
  teleport() {
    const p = this.p;
    const r = this.respawnPoint;
    p.x = r.x;
    p.y = r.y;
    p.vx = 0;
    p.vy = 0;
    p.launch = false;
    p.placed = true;
    p.color = this.level.startColor;
    for (const s of this.plats) {
      if (s.def.fade) {
        s.fade = 0;
        s.fadeT = 0;
      }
    }
    this.snapToGround();
    this.emit("respawn");
  }

  /** Engine-facing helpers */
  starCount() {
    let n = 0;
    for (const g of this.starsGot) if (g) n++;
    return n;
  }
}
