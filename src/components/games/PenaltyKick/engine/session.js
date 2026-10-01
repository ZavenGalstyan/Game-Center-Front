/**
 * Penalty Kick — a play SESSION (headless, fixed-step, deterministic per seed).
 *
 * Modes:
 *   career     shootout vs a career rival (player shoots, then keeps, alternating)
 *   practice   the player shoots against a medium keeper, unlimited
 *   targets    10 shots at an empty goal with a target ring per shot
 *   keeper     the player keeps goal against 10 AI takers
 *   demo       AI vs AI loop for the main-menu background
 *
 * Phases: INTRO → (AIM | READY) → KICK → RESULT → … → OVER
 *   AIM     player's kick: waits for shoot(input); nothing moves
 *   READY   player keeps: a short beat, then the rival's run-up starts
 *   KICK    one Penalty runs; the result locks inside it (exactly once)
 *   RESULT  a beat to show the outcome, then the next kick (or OVER)
 */
import { PK } from "./constants.js";
import { Penalty } from "./penalty.js";
import { AIShooter } from "./aiShooter.js";
import { rng } from "./keeperAI.js";
import { newShootout, record, nextKicker, goals } from "./shootout.js";
import { keeperFor, takerFor } from "../data/career.js";

// the player's keeper: a little more reach than an average rival (it has to
// guess from the run-up, the AI reads the flight)
export const PLAYER_KEEPER = { reach: 1.12, diveTime: 0.38, catch: 0.45 };
const INTRO_T = 1.4;
const READY_T = 1.1;
const RESULT_T = 1.5;

export const TARGET_SHOTS = 10;
export const KEEPER_SHOTS = 10;

export class Session {
  /**
   * cfg: { mode, match (career def), seed, tier (practice/keeper), onEvent }
   */
  constructor(cfg) {
    this.cfg = cfg;
    this.mode = cfg.mode;
    this.seed = cfg.seed || 1;
    this.r = rng(this.seed * 7919 + 11);
    this.t = 0;
    this.phase = "INTRO";
    this.phaseT = 0;
    this.pen = null;
    this.role = null; // "shoot" | "keep" | "watch"
    this.kickNo = 0;
    this.so = this.mode === "career" ? newShootout() : null;
    this.log = []; // per kick: { who, result, why, input, lineP, … }
    this.target = null;
    this.stats = {
      shots: 0, goals: 0, missed: 0, savedByKeeper: 0, // player's kicks
      faced: 0, saves: 0, catches: 0, conceded: 0, // player's keeping
      woodwork: 0, topCorners: 0, overpowered: 0, curled: 0,
      targetsHit: 0, targetPoints: 0,
      streak: 0, bestStreak: 0,
    };
    this.over = false;
    this.winner = null;
    this.events = [];
    this.nextTurn();
    this.phase = "INTRO";
  }

  emit(type, data = {}) {
    this.events.push({ type, ...data });
  }

  /* ------------------------------------------------------------ turn setup */
  whoKicks() {
    if (this.mode === "career") return nextKicker(this.so);
    if (this.mode === "practice" || this.mode === "targets") return "player";
    if (this.mode === "keeper") return "rival";
    return this.kickNo % 2 ? "rival" : "player"; // demo alternates the view
  }

  nextTurn() {
    const who = this.whoKicks();
    this.kicker = who;
    this.role = this.mode === "demo" ? "watch" : who === "player" ? "shoot" : "keep";
    this.pen = null;
    this.phaseT = 0;
    if (this.mode === "targets") this.target = this.makeTarget();
    if (this.role === "shoot") {
      this.phase = "AIM";
      this.pen = this.makePenalty(null); // idle penalty: shows the keeper waiting
    } else {
      this.phase = "READY";
      // built now (so the taker and keeper can be drawn waiting), ticked after READY
      this.pen = this.makePenalty(null, this.makeTaker());
    }
    this.emit("turn", { who, role: this.role, kickNo: this.kickNo });
  }

  makeTarget() {
    const n = this.kickNo;
    const side = this.r() < 0.5 ? -1 : 1;
    const x = side * (0.6 + this.r() * 2.55);
    const y = 0.35 + this.r() * 1.75;
    const radius = Math.max(0.42, 0.72 - n * 0.03);
    return { x, y, r: radius };
  }

  rivalKeeper() {
    const cfg = this.cfg;
    if (this.mode === "career") return cfg.match.keeper.stats;
    if (this.mode === "demo") return keeperFor(0.4, "steady");
    return keeperFor(cfg.tier ?? 0.35, "steady");
  }

  makeTaker() {
    const cfg = this.cfg;
    const seed = this.seed * 131 + this.kickNo * 17 + 3;
    // pressure: sudden death or a kick the rival must score
    let pressure = 0;
    if (this.so) {
      if (this.so.suddenDeath) pressure = 1;
      else {
        const pg = goals(this.so.player);
        const rg = goals(this.so.rival);
        const left = 5 - this.so.rival.length - 1;
        if (pg > rg + left) pressure = 0.8;
      }
    }
    if (this.mode === "career") {
      const takers = cfg.match.takers;
      const tk = takers[this.so.rival.length % takers.length];
      this.takerInfo = { name: tk.name, type: tk.type };
      return new AIShooter(tk.stats, seed, pressure);
    }
    const tier = this.mode === "demo" ? 0.5 : cfg.tier ?? 0.3;
    const types = ["placer", "power", "curler", "cool", "nervy"];
    const type = types[this.kickNo % types.length];
    this.takerInfo = { name: null, type };
    return new AIShooter(takerFor(tier, type), seed, pressure);
  }

  makePenalty(shot, taker = null) {
    const seed = this.seed * 977 + this.kickNo * 61 + 5;
    if (this.mode === "targets") return new Penalty({ shot, noKeeper: true, keeperAI: null });
    if (this.role === "keep") return new Penalty({ aiShooter: taker, keeperStats: PLAYER_KEEPER, keeperAI: null, seed });
    if (this.role === "watch") {
      // demo: an AI taker vs an AI keeper
      const ks = this.rivalKeeper();
      return new Penalty({ aiShooter: taker, keeperStats: ks, keeperAI: ks, seed });
    }
    const ks = this.rivalKeeper();
    // the player's run-up gives nothing away: fixed approach, neutral hips
    return new Penalty({ shot, keeperStats: ks, keeperAI: ks, seed, approach: 26, lean: 0 });
  }

  /* ------------------------------------------------------------ inputs */
  /** The player's kick. input = { aimX, aimY, power, curve } */
  shoot(input) {
    if (this.phase !== "AIM" || this.role !== "shoot") return false;
    const shot = {
      aimX: Math.max(-6, Math.min(6, input.aimX)),
      aimY: Math.max(0.12, Math.min(4, input.aimY)),
      power: Math.max(0, Math.min(1, input.power)),
      curve: Math.max(-1, Math.min(1, input.curve || 0)),
    };
    this.pen = this.makePenalty(shot);
    this.phase = "KICK";
    this.phaseT = 0;
    this.emit("runup", { who: "player" });
    return true;
  }

  /** The player's dive (keeper role). hx/hy in goal-plane metres. */
  dive(hx, hy) {
    if (this.role !== "keep" || !this.pen || this.phase !== "KICK") return null;
    return this.pen.playerDive(hx, hy);
  }

  /* ------------------------------------------------------------ stepping */
  /** Advance one fixed step (PK.DT). */
  tick() {
    const dt = PK.DT;
    this.t += dt;
    this.phaseT += dt;
    if (this.phase === "INTRO") {
      if (this.phaseT >= INTRO_T) {
        this.phase = this.role === "shoot" ? "AIM" : "READY";
        this.phaseT = 0;
      }
      return;
    }
    if (this.phase === "OVER") {
      if (this.pen) this.pen.tick();
      return;
    }
    if (this.phase === "AIM") {
      return; // the waiting keeper's idle sway is purely time-based
    }
    if (this.phase === "READY") {
      if (this.phaseT >= READY_T) {
        this.phase = "KICK";
        this.phaseT = 0;
        this.emit("runup", { who: "rival" });
      }
      return;
    }
    // KICK / RESULT: the penalty itself keeps running (ball, net, keeper fall)
    const ev = this.pen.tick();
    for (const e of ev) this.emit("pen", { e });
    if (this.phase === "KICK" && this.pen.result) {
      this.phase = "RESULT";
      this.phaseT = 0;
      this.onResult();
    } else if (this.phase === "RESULT" && this.phaseT >= RESULT_T && this.pen.t >= 1.9) {
      if (this.over) {
        this.phase = "OVER";
        this.emit("over", { winner: this.winner });
      } else {
        this.kickNo++;
        this.nextTurn();
      }
    }
  }

  onResult() {
    const p = this.pen;
    const res = p.result;
    const S = this.stats;
    const entry = { who: this.kicker, role: this.role, result: res, why: p.resultWhy, input: p.input, lineP: p.lineP, taker: this.takerInfo || null, dive: p.keeper.dive ? p.keeper.dive.label : null, caught: p.caught };
    if (this.role === "shoot") {
      S.shots++;
      if (res === "GOAL") {
        S.goals++;
        S.streak++;
        S.bestStreak = Math.max(S.bestStreak, S.streak);
        if (p.lineP && p.lineP[1] > 1.75 && Math.abs(p.lineP[0]) > 2.6) S.topCorners++;
      } else {
        S.streak = 0;
        if (res === "SAVED") S.savedByKeeper++;
        else S.missed++;
      }
      if (p.woodwork) S.woodwork++;
      if (p.input.power > PK.OVERPOWER) S.overpowered++;
      if (Math.abs(p.input.curve) > 0.35) S.curled++;
    } else if (this.role === "keep") {
      S.faced++;
      if (res === "SAVED") {
        S.saves++;
        if (p.caught) S.catches++;
      }
      if (res === "GOAL") S.conceded++;
    }
    if (this.mode === "targets" && this.target) {
      const lp = p.lineP;
      let pts = 0;
      if (lp && res === "GOAL") {
        const d = Math.hypot(lp[0] - this.target.x, lp[1] - this.target.y);
        if (d <= this.target.r) pts = 100 + Math.round(100 * (1 - d / this.target.r));
      }
      entry.points = pts;
      if (pts) {
        S.targetsHit++;
        S.targetPoints += pts;
      }
    }
    this.log.push(entry);
    // shootout / session end
    if (this.so) {
      this.so = record(this.so, this.kicker, res === "GOAL" ? "goal" : res === "SAVED" ? "saved" : "missed");
      if (this.so.over) {
        this.over = true;
        this.winner = this.so.winner;
      }
    } else if (this.mode === "targets" && this.log.length >= TARGET_SHOTS) this.over = true;
    else if (this.mode === "keeper" && this.log.length >= KEEPER_SHOTS) this.over = true;
    this.emit("result", entry);
  }

  /** Drain events produced since the last call. */
  drain() {
    const e = this.events;
    this.events = [];
    return e;
  }
}
