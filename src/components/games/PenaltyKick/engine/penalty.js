/**
 * Penalty Kick — ONE penalty, headless and deterministic.
 *
 * Owns the single authoritative ball, the goalkeeper body and the kick
 * timeline, and advances them together on the fixed PK.DT step:
 *
 *   RUNUP   the taker runs in; ball sits on the spot. A player keeper (or a
 *           gambling AI keeper) may leave early — the AI taker can see that.
 *   FLIGHT  launched on the exact contact step (T_CONTACT is a whole number of
 *           steps). Ball ⇄ woodwork ⇄ keeper colliders ⇄ net ⇄ grass.
 *   DONE    result locked — the ball keeps moving physically for the replay
 *           but nothing can change the result any more.
 *
 * Result rules (exactly one per penalty):
 *   GOAL    the whole ball crosses the line inside the frame (goalLine event)
 *   SAVED   the keeper caught it, or touched it and it never went in
 *   MISSED  wide / over / off the woodwork and out, untouched by the keeper
 * A shot off the post that rebounds INTO the goal is a goal; a parry that
 * spins over the line is a goal — only the line decides.
 */
import { PK, clamp, lerp } from "./constants.js";
import { makeBall, stepBall, v3 } from "./physics.js";
import { SPOT, solveShot } from "./shot.js";
import { Keeper } from "./keeper.js";
import { KeeperAI } from "./keeperAI.js";
import { KickTimeline, T_CONTACT, T_END } from "./kicker.js";

export const CONTACT_STEP = Math.round(T_CONTACT / PK.DT);

export class Penalty {
  /**
   * opts:
   *   shot        {aimX, aimY, power, curve}  — player taker (locked at run-up start)
   *   aiShooter   AIShooter instance           — AI taker (chooses at contact)
   *   keeperStats {reach, diveTime, catch}     — the goalkeeper body
   *   keeperAI    {…KEEPER_DEFAULT} | null     — null = the player keeps goal
   *   seed        per-penalty seed for the AI keeper
   *   noKeeper    true = empty goal (target shooting); the keeper is absent
   *   approach, lean  — run-up tells (AI taker supplies its own)
   */
  constructor(opts = {}) {
    this.opts = opts;
    this.ball = makeBall(SPOT);
    this.prevP = [...SPOT];
    this.keeper = new Keeper(opts.keeperStats || {});
    this.catchSkill = (opts.keeperStats && opts.keeperStats.catch) ?? 0.4;
    this.ai = opts.keeperAI ? new KeeperAI(opts.keeperAI, opts.seed || 1) : null;
    const tells = opts.aiShooter ? { approach: opts.aiShooter.approach, lean: opts.aiShooter.lean } : { approach: opts.approach ?? 28, lean: opts.lean ?? 0 };
    this.kick = new KickTimeline(tells);
    this.step = 0;
    this.t = 0;
    this.phase = "RUNUP";
    this.contactT = null;
    this.input = null; // the input that was actually struck
    this.launch = null;
    this.touched = false; // keeper touched the ball
    this.woodwork = 0;
    this.caught = false;
    this.lineP = null; // where the ball first crossed the goal-line plane
    this.result = null;
    this.resultT = null;
    this.events = [];
    this.lastContactStep = { keeper: -99, post: -99, bar: -99, net: -99, ground: -99 };
  }

  /** Player goalkeeper input: dive toward (hx, hy) now. One dive per penalty. */
  playerDive(hx, hy) {
    if (this.ai || this.result || this.keeper.dive) return null;
    return this.keeper.diveTo(hx, hy, this.t);
  }

  /** Player goalkeeper small shuffle before the kick. */
  playerStep(x) {
    if (!this.ai) this.keeper.stepTo(x);
  }

  /** Advance one fixed step. Returns this step's events. */
  tick() {
    const ev = [];
    this.step++;
    this.t = this.step * PK.DT;
    const t = this.t;
    this.prevP = [...this.ball.p];

    // ---- strike: on the exact contact step ----
    if (this.phase === "RUNUP" && this.step >= CONTACT_STEP) {
      const k = this.keeper.dive;
      // what a taker can SEE: a keeper already moving at least 0.1 s before contact
      const committed = k && t - k.t0 >= 0.1 ? { side: k.dir[0] } : null;
      this.input = this.opts.aiShooter ? this.opts.aiShooter.strike(committed) : { ...this.opts.shot };
      const sol = solveShot(this.input);
      this.launch = sol;
      this.ball.v = [...sol.v0];
      this.ball.w = [...sol.w];
      this.ball.moving = true;
      this.phase = "FLIGHT";
      this.contactT = t;
      const d = v3.norm(sol.v0);
      this.kick.dir = d;
      ev.push({ type: "kick", t, speed: sol.speed, power: this.input.power });
    }

    // ---- keeper body language: tension builds over the run-up; head tracks the ball
    this.keeper.tension = this.phase === "RUNUP" ? clamp(t / T_CONTACT, 0, 1) : 1;
    this.keeper.look = this.ball.p;
    // ---- keeper: brain (AI) sees only the observation, never the input ----
    this.keeper.update(t, PK.DT);
    if (this.ai && !this.result) {
      this.ai.think(
        {
          t,
          runUp: this.phase === "RUNUP" ? t / T_CONTACT : null,
          contactT: this.contactT,
          ball: this.contactT == null ? null : { p: [...this.ball.p], v: [...this.ball.v], w: [...this.ball.w] },
        },
        this.keeper,
      );
    }
    if (this.keeper.dive && this.keeper.dive.t0 === t) ev.push({ type: "dive", t, label: this.keeper.dive.label });

    // ---- ball ----
    if (this.caught) {
      const p = this.keeper.pose(t);
      this.ball.p = [(p.hL[0] + p.hR[0]) / 2, Math.max(PK.BALL_R, (p.hL[1] + p.hR[1]) / 2), (p.hL[2] + p.hR[2]) / 2 + 0.06];
    } else if (this.ball.moving) {
      const cols = this.opts.noKeeper ? [] : this.keeper.colliders(t, PK.DT);
      const out = stepBall(this.ball, cols, { stopWhenSlow: true });
      for (const e of out) this.onBallEvent(e, ev);
    }

    // ---- settle shots that never reach the line ----
    if (!this.result && this.contactT != null) {
      const b = this.ball;
      const away = b.v[2] > 0.3 && b.p[2] > 1.0; // coming back out toward the spot
      const dead = !b.moving || v3.len(b.v) < 0.4;
      if ((this.touched || this.woodwork) && (away || dead)) this.lock(this.touched ? "SAVED" : "MISSED", ev, this.touched ? "keeper" : "woodwork");
      else if (dead) this.lock(this.touched ? "SAVED" : "MISSED", ev, "stopped");
      else if (t - this.contactT > PK.RESOLVE_TIMEOUT) this.lock(this.touched ? "SAVED" : "MISSED", ev, "timeout");
    }
    this.events = ev;
    return ev;
  }

  onBallEvent(e, ev) {
    const s = this.step;
    if (e.type === "contact" && (e.kind === "hand" || e.kind === "body")) {
      this.touched = true;
      const first = s - this.lastContactStep.keeper > 12;
      this.lastContactStep.keeper = s;
      // CATCH: a glove contact on a shot slow enough to hold, with both gloves on it
      if (!this.result && e.kind === "hand" && e.speed < lerp(9, 20, clamp(this.catchSkill, 0, 1))) {
        const p = this.keeper.pose(this.t);
        const gap = Math.hypot(p.hL[0] - p.hR[0], p.hL[1] - p.hR[1]);
        const dBall = Math.min(v3.len(v3.sub(this.ball.p, p.hL)), v3.len(v3.sub(this.ball.p, p.hR)));
        if (gap < 0.45 && dBall < 0.26 && this.ball.p[2] > -PK.BALL_R) {
          this.caught = true;
          this.ball.moving = false;
          this.ball.v = [0, 0, 0];
          this.ball.w = [0, 0, 0];
          this.keeper.catchBall(this.t);
          ev.push({ type: "catch", speed: e.speed, p: e.p });
          this.lock("SAVED", ev, "catch");
          return;
        }
      }
      // PARRY: the glove pushes the ball away from the body's centre line
      if (e.kind === "hand" && first) {
        const pel = this.keeper.pose(this.t).pelvis;
        const side = Math.sign(this.ball.p[0] - pel[0]) || 1;
        this.ball.v = [this.ball.v[0] + side * Math.min(4, e.speed * 0.18), this.ball.v[1] + Math.min(2.5, e.speed * 0.06), this.ball.v[2]];
      }
      if (first) ev.push({ type: e.kind === "hand" ? "glove" : "body", speed: e.speed, p: e.p, id: e.id });
      return;
    }
    if (e.type === "contact") {
      this.woodwork++;
      const key = e.kind === "bar" ? "bar" : "post";
      if (s - this.lastContactStep[key] > 6) ev.push({ type: e.kind === "bar" ? "bar" : "post", id: e.id, speed: e.speed, p: e.p });
      this.lastContactStep[key] = s;
      return;
    }
    if (e.type === "goalLine") {
      if (!this.lineP) this.lineP = e.p;
      if (!this.result) this.lock("GOAL", ev, this.touched ? "past-keeper" : this.woodwork ? "in-off-woodwork" : "clean");
      return;
    }
    if (e.type === "outLine") {
      if (!this.lineP) this.lineP = e.p;
      if (!this.result) this.lock(this.touched ? "SAVED" : "MISSED", ev, e.p[1] > PK.GOAL_H ? "over" : "wide");
      return;
    }
    if (e.type === "net") {
      if (s - this.lastContactStep.net > 8) ev.push({ type: "net", speed: e.speed, p: e.p, n: e.n });
      this.lastContactStep.net = s;
      return;
    }
    if (e.type === "ground") {
      if (s - this.lastContactStep.ground > 8 && e.speed > 1.2) ev.push({ type: "bounce", speed: e.speed, p: e.p });
      this.lastContactStep.ground = s;
    }
  }

  lock(result, ev, why) {
    if (this.result) return; // exactly one result per penalty
    this.result = result;
    this.resultWhy = why;
    this.resultT = this.t;
    ev.push({ type: "result", result, why, t: this.t });
  }

  /** Is the presentation over (result + a moment to watch the ball)? */
  finished(hold = 1.4) {
    return this.result != null && this.t - this.resultT >= hold && this.t >= T_END;
  }

  /** Run to a result (tests / instant sim). Optional per-step callback. */
  runToResult(maxT = 8, cb) {
    while (!this.result && this.t < maxT) {
      const ev = this.tick();
      if (cb) cb(this, ev);
    }
    return this.result;
  }
}
