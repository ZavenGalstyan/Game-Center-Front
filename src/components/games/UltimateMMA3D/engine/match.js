/**
 * A fight: two fighters, a referee, rounds, judges.
 *
 * Step it at SIM_DT (fixed timestep — callers accumulate real time). Each step
 * the controllers' intents are applied (player keys and AI decisions go
 * through the SAME semantic interface, see `blankButtons`), actions advance,
 * hits / grappling resolve, the referee rules, and events are appended to
 * `events` for the renderer, audio and HUD to consume.
 *
 * Phases: intro → ready → fight → roundEnd → rest → ready … → stopped | decision → ended
 */
import { SIM_DT, MIN_SEP, SHOOT_RANGE, makeRng, clamp, wrapAngle } from "./constants.js";
import { MOVES, COMBOS } from "./moves.js";
import { createFighter, effectiveAttrs, stepMovement, clampToCage, separate, stepStamina, canAct, dist, staMax } from "./fighter.js";
import { startAttack, startDodge, stepAction } from "./combat.js";
import * as GR from "./grapple.js";
import { scoreRound, decide } from "./scoring.js";

export const blankButtons = () => ({ mx: 0, mz: 0, guard: false, low: false, fwd: false, dodge: null, btn: null, struggle: false, attack: null, action: null });

const emptyStats = () => ({ landedSig: 0, thrownSig: 0, dmg: 0, headDmg: 0, td: 0, tdAtt: 0, ctrl: 0, kd: 0, subAtt: 0, subProg: 0, advance: 0, aggr: 0 });

export class Match {
  /**
   * cfg = { fighters: [{data, upgrades?, name?}, …], ai: [bool, bool],
   *         rounds, roundTime, title, seed, training: null | {...} }
   */
  constructor(cfg) {
    this.cfg = { rounds: 3, roundTime: 120, restTime: 30, ...cfg };
    this.rng = makeRng(cfg.seed ?? (Math.random() * 1e9) | 0);
    this.f = cfg.fighters.map((c, i) => createFighter(c.data, { side: i, attrs: effectiveAttrs(c.data.attrs, c.upgrades), name: c.name }));
    this.buttons = [blankButtons(), blankButtons()];
    this.time = 0;
    this.round = 1;
    this.clock = this.cfg.roundTime;
    this.phase = "intro";
    this.phaseT = 0;
    this.events = [];
    this.eventBase = 0; // index of events[0] in the global stream
    this.stats = [[emptyStats(), emptyStats()]];
    this.totals = [emptyStats(), emptyStats()];
    this.cards = []; // per round: { judges: [[a,b],[a,b],[a,b]] }
    this.clinch = null;
    this.ground = null;
    this.sub = null;
    this.transition = null;
    this.result = null;
    this.hitstop = 0;
    this.slowmo = 1;
    this.resetPositions();
  }

  /* ---------------------------------------------------------- events / stats */
  emit(e) {
    e.t = this.time;
    this.events.push(e);
    if (this.events.length > 400) {
      const cut = this.events.length - 300;
      this.events.splice(0, cut);
      this.eventBase += cut;
    }
  }
  /** Events after a cursor (global index); returns [events, newCursor]. */
  eventsSince(cursor) {
    const start = Math.max(0, cursor - this.eventBase);
    return [this.events.slice(start), this.eventBase + this.events.length];
  }
  stat(f, key, v = 1, zone) {
    const s = this.stats[this.round - 1][f.side];
    const T = this.totals[f.side];
    if (key === "landedSig") {
      s.landedSig++;
      s.thrownSig++;
      s.dmg += v;
      T.landedSig++;
      T.thrownSig++;
      T.dmg += v;
      if (zone === "head") {
        s.headDmg += v;
        T.headDmg += v;
      }
      return;
    }
    if (key === "subProg") {
      s.subProg = Math.max(s.subProg, v);
      T.subProg = Math.max(T.subProg, v);
      return;
    }
    s[key] += v;
    T[key] += v;
  }
  noteCombo(f) {
    const chain = f.combo.chain;
    let best = null;
    for (const c of COMBOS) {
      if (!c.seq.length || c.seq.length > chain.length) continue;
      const tail = chain.slice(-c.seq.length);
      const norm = (x) => (x === "jab2" ? "jab" : x);
      if (tail.every((x, i) => norm(x) === norm(c.seq[i]) || x === c.seq[i])) if (!best || c.seq.length > best.seq.length) best = c;
    }
    if (best) {
      f.act.comboName = best.id;
      this.emit({ type: "combo", side: f.side, name: best.name, id: best.id, signature: !!f.data.combos?.includes(best.id) });
    }
  }

  /* ---------------------------------------------------------- flow control */
  resetPositions() {
    const [a, b] = this.f;
    a.pos = { x: -1.7, z: 0 };
    b.pos = { x: 1.7, z: 0 };
    a.yaw = Math.PI / 2;
    b.yaw = -Math.PI / 2;
    for (const f of this.f) {
      f.vel = { x: 0, z: 0 };
      f.act = { type: "idle", t: 0 };
      f.guard = null;
      f.combo = { chain: [], t: 9 };
      f.kdRound = 0;
    }
    this.clinch = this.ground = this.sub = this.transition = null;
  }
  /** Intro finished (UI) → round 1 starts. */
  begin() {
    if (this.phase === "intro") this.setPhase("ready");
  }
  setPhase(p) {
    this.phase = p;
    this.phaseT = 0;
    if (p === "ready") this.emit({ type: "roundStart", round: this.round });
    if (p === "fight") this.emit({ type: "bell", round: this.round, start: true });
  }
  /** Rest finished (UI or timeout) → next round. */
  nextRound() {
    if (this.phase !== "rest") return;
    this.round++;
    this.clock = this.cfg.roundTime;
    this.stats.push([emptyStats(), emptyStats()]);
    this.resetPositions();
    this.setPhase("ready");
  }
  setButtons(side, b) {
    this.buttons[side] = b;
  }

  /* ---------------------------------------------------------- finishing */
  knockdown(att, def, move, zone) {
    def.knockdowns++;
    def.kdRound++;
    this.stat(att, "kd");
    if (this.clinch) this.clinch = null;
    const dur = clamp(2.2 + def.daze / 60 + (100 - def.hp.head) / 80, 2.4, 4.6);
    def.act = { type: "down", t: 0, dur, zone };
    def.vel.x *= 0.3;
    def.vel.z *= 0.3;
    att.act = att.act.type === "attack" ? att.act : { type: "idle", t: 0 };
    this.slowmo = 0.35;
    this.slowT = 0.6;
    this.emit({ type: "knockdown", side: def.side, by: att.side, zone, move: move?.id, count: def.kdRound });
    if (this.cfg.training) return;
    if (def.kdRound >= 3) this.knockout(att, def, "TKO", move, "Three knockdowns in the round");
  }
  knockout(att, def, method, move, detail) {
    if (this.result) return;
    if (this.cfg.training) {
      // training dummy never "dies": reset its health
      def.hp = { head: 100, body: 100, legs: 100 };
      def.daze = 0;
      def.act = { type: "down", t: 0, dur: 2.4 };
      this.ground = this.sub = this.clinch = null;
      this.emit({ type: "knockdown", side: def.side, by: att.side, training: true });
      return;
    }
    const lying = !!this.ground;
    this.ground = this.sub = this.clinch = this.transition = null;
    def.act = { type: "ko", t: 0, lying, method };
    att.act = { type: "idle", t: 0 };
    this.finish({ winner: att.side, method, detail: detail || (method === "KO" ? `Knockout${move ? " — " + move.name : ""}` : "Technical knockout") });
  }
  submission(att, def, type) {
    if (this.cfg.training) {
      this.emit({ type: "tap", side: def.side, by: att.side, sub: type, training: true });
      GR.endSub(this, false);
      return;
    }
    this.emit({ type: "tap", side: def.side, by: att.side, sub: type });
    def.act = { type: "tapped", t: 0, sub: type };
    att.act = { type: "subWin", t: 0, sub: type };
    this.finish({ winner: att.side, method: "SUB", detail: { armbar: "Armbar", guillotine: "Guillotine Choke", rnc: "Rear-Naked Choke" }[type] });
  }
  finish(r) {
    if (this.result) return;
    const elapsed = this.cfg.roundTime - this.clock;
    this.result = { ...r, round: this.round, time: elapsed, cards: null };
    // the round in which the fight ended still gets scored (for the scorecard display)
    this.setPhase("stopped");
    this.emit({ type: "finish", ...this.result });
  }

  /* ---------------------------------------------------------- main step */
  step(dt = SIM_DT) {
    // global hit-stop / slow motion for impact feel (deterministic)
    if (this.hitstop > 0) {
      this.hitstop -= dt;
      dt *= 0.2;
    }
    if (this.slowT > 0) {
      this.slowT -= dt;
      dt *= this.slowmo;
    }
    this.time += dt;
    this.phaseT += dt;
    switch (this.phase) {
      case "intro":
        return;
      case "ready":
        this.idleStep(dt);
        if (this.phaseT > 1.6) this.setPhase("fight");
        return;
      case "fight":
        this.fightStep(dt);
        return;
      case "roundEnd":
        this.idleStep(dt);
        if (this.phaseT > 2.4) this.endRound();
        return;
      case "rest":
        if (this.phaseT > this.cfg.restTime) this.nextRound();
        return;
      case "stopped":
        this.idleStep(dt, true);
        if (this.phaseT > 4) this.setPhase("ended");
        return;
      case "ended":
        if (this.result) this.idleStep(dt, true); // celebration continues behind the result screen
        return;
      default:
        return;
    }
  }

  /** Fighters breathe / finish their current action but take no input. */
  /**
   * Fighters finish their current action but take no fight input. After a
   * finish (`celebrate`) the loser stays down and the WINNER keeps walking
   * freely under his controller's movement buttons (celebration lap).
   */
  idleStep(dt, celebrate = false) {
    const winner = celebrate && this.result ? this.result.winner : -1;
    for (const f of this.f) {
      const o = this.f[1 - f.side];
      if (f.act.type === "ko" || f.act.type === "tapped") {
        f.act.t += dt;
        continue;
      }
      if (f.act.type === "subWin") {
        // let go of the hold and get up after a moment
        f.act.t += dt;
        if (f.act.t > 1.4) {
          f.act = { type: "getup", t: 0, dur: 1.1, from: this.ground && this.ground.top === f.side ? "top" : "ground" };
          this.ground = null;
        }
        continue;
      }
      if (f.act.type === "down" || f.act.type === "getup") {
        f.act.t += dt;
        if (f.act.t >= f.act.dur) f.act = f.act.type === "down" ? { type: "getup", t: 0, dur: 1.5 } : { type: "idle", t: 0 };
        continue;
      }
      if (this.ground || this.clinch || this.sub) {
        if (celebrate && this.result && f.side !== winner) continue; // loser stays where he lies
        this.ground = this.clinch = this.sub = this.transition = null;
        f.act = { type: "getup", t: 0, dur: 1.0 };
        continue;
      }
      if (f.act.type === "attack" || f.act.type === "dodge" || f.act.type === "hit" || f.act.type === "blockHit") stepAction(this, f, o, dt);
      else if (f.act.type !== "idle" && f.act.type !== "move" && f.act.type !== "block") {
        f.act.t = (f.act.t || 0) + dt;
        if (f.act.t > (f.act.dur || 0.5)) f.act = { type: "idle", t: 0 };
      }
      if (f.side === winner) {
        // free roam in a fixed frame (the fight line at the finish = what the camera shows),
        // facing where he walks
        if (this.roamYaw === undefined) this.roamYaw = f.yaw;
        const B = this.buttons[f.side];
        const mobile = f.act.type === "idle" || f.act.type === "move";
        const fx = Math.sin(this.roamYaw);
        const fz = Math.cos(this.roamYaw);
        const sp = mobile ? 1.3 : 0;
        const tx = (fx * B.mz + fz * B.mx) * sp;
        const tz = (fz * B.mz - fx * B.mx) * sp;
        const acc = 10 * dt;
        f.vel.x += clamp(tx - f.vel.x, -acc, acc);
        f.vel.z += clamp(tz - f.vel.z, -acc, acc);
        f.pos.x += f.vel.x * dt;
        f.pos.z += f.vel.z * dt;
        const v = Math.hypot(f.vel.x, f.vel.z);
        if (mobile) f.act.type = v > 0.15 ? "move" : "idle";
        if (v > 0.3) {
          let d = Math.atan2(f.vel.x, f.vel.z) - f.yaw;
          while (d > Math.PI) d -= Math.PI * 2;
          while (d < -Math.PI) d += Math.PI * 2;
          f.yaw = wrapAngle(f.yaw + clamp(d, -7 * dt, 7 * dt));
        }
      } else {
        f.intent = { mx: 0, mz: 0, guard: null };
        if (!celebrate) stepMovement(f, o, dt);
        else {
          f.vel.x *= 0.9;
          f.vel.z *= 0.9;
          f.pos.x += f.vel.x * dt;
          f.pos.z += f.vel.z * dt;
        }
      }
      clampToCage(f);
      stepStamina(f, dt);
    }
    if (!this.ground && !this.sub) separate(this.f[0], this.f[1], MIN_SEP);
  }

  fightStep(dt) {
    const [a, b] = this.f;
    this.clock -= dt;
    // ---- intents
    for (const f of this.f) this.applyButtons(f, this.f[1 - f.side], this.buttons[f.side], dt);
    // ---- grappling states
    if (this.transition) this.stepTransition(dt);
    else if (this.sub) GR.stepSub(this, dt);
    else if (this.ground) GR.stepGround(this, dt);
    else if (this.clinch) {
      for (const f of this.f) if (f.act.type === "attack" || f.act.type === "hit" || f.act.type === "blockHit" || f.act.type === "rocked") stepAction(this, f, this.f[1 - f.side], dt);
      if (this.clinch) GR.stepClinch(this, dt);
      for (const f of this.f) stepStamina(f, dt);
    }
    // ---- standing
    if (!this.ground && !this.clinch && !this.sub && !this.transition) {
      for (const f of this.f) {
        const o = this.f[1 - f.side];
        this.stepStanding(f, o, dt);
      }
      separate(a, b, MIN_SEP);
      for (const f of this.f) clampToCage(f);
    } else if (this.ground || this.sub) {
      for (const f of this.f) stepStamina(f, dt);
    }
    // consume one-shot buttons
    for (const bt of this.buttons) {
      bt.btn = null;
      bt.dodge = null;
      bt.struggle = false;
      bt.attack = null;
      bt.action = null;
    }
    // aggression stat: closing distance while not getting hit
    for (const f of this.f) {
      const o = this.f[1 - f.side];
      const toward = (o.pos.x - f.pos.x) * f.vel.x + (o.pos.z - f.pos.z) * f.vel.z;
      if (toward > 0.3 && !this.ground) this.stat(f, "aggr", dt);
    }
    if (this.result) return;
    if (this.clock <= 0 && !this.cfg.training) {
      this.clock = 0;
      this.emit({ type: "bell", round: this.round, end: true });
      this.setPhase("roundEnd");
    }
  }

  stepStanding(f, o, dt) {
    const t = f.act.type;
    if (t === "down") {
      f.act.t += dt;
      f.vel.x *= 0.92;
      f.vel.z *= 0.92;
      if (f.act.t >= f.act.dur) f.act = { type: "getup", t: 0, dur: 1.5 };
      stepStamina(f, dt);
      return;
    }
    if (t === "getup") {
      f.act.t += dt;
      if (f.act.t >= f.act.dur) {
        f.act = { type: "idle", t: 0 };
        f.daze = Math.min(f.daze, 45);
      }
      stepStamina(f, dt);
      stepMovement(f, o, dt, { locked: true });
      return;
    }
    if (t === "shoot") {
      GR.stepShoot(this, f, o, dt);
      stepStamina(f, dt);
      return;
    }
    if (t === "clinchEnter") {
      f.act.t += dt;
      if (f.act.t >= f.act.dur) GR.resolveClinchEnter(this, f, o);
      stepStamina(f, dt);
      stepMovement(f, o, dt, { locked: true });
      return;
    }
    if (t === "sprawl" || t === "stuffed") {
      f.act.t += dt;
      if (t === "sprawl" && f.act.headlock && f.act.t < f.act.headlock && (this.buttons[f.side].btn === "grab" || this.buttons[f.side].action === "guillotine") && o.act.type === "stuffed") {
        GR.headlockGuillotine(this, f, o);
        return;
      }
      if (f.act.t >= f.act.dur) f.act = { type: "idle", t: 0 };
      stepStamina(f, dt);
      stepMovement(f, o, dt, { locked: true });
      return;
    }
    stepAction(this, f, o, dt);
    stepMovement(f, o, dt);
    stepStamina(f, dt);
  }

  stepTransition(dt) {
    const tr = this.transition;
    tr.t += dt;
    const top = this.f[tr.top];
    const bot = this.f[tr.bottom];
    top.act.t = tr.t;
    bot.act.t = tr.t;
    if (tr.t >= tr.dur) {
      this.transition = null;
      GR.enterGround(this, top, bot, tr.pos, { x: tr.from[1].x - Math.sin(tr.dir) * 0.15, z: tr.from[1].z - Math.cos(tr.dir) * 0.15 }, tr.dir);
    } else {
      // attacker drives through: interpolate toward the final layout position
      const k = tr.t / tr.dur;
      const L = { guard: 0.32, half: 0.26, side: 0.3 }[tr.pos] ?? 0.3;
      const tx = tr.from[1].x + Math.sin(tr.dir) * L;
      const tz = tr.from[1].z + Math.cos(tr.dir) * L;
      top.pos.x = tr.from[0].x + (tx - tr.from[0].x) * k;
      top.pos.z = tr.from[0].z + (tz - tr.from[0].z) * k;
    }
    for (const f of this.f) stepStamina(f, dt);
  }

  /* ---------------------------------------------------------- input mapping */
  /** Interpret semantic buttons in the current context (standing / clinch / ground / sub). */
  applyButtons(f, o, B, dt) {
    f.intent = { mx: B.mx, mz: B.mz, guard: B.guard ? (B.low ? "body" : "high") : null, dodge: null, attack: null, action: null, struggle: false };
    const t = f.act.type;
    // ---- submission struggle: any strike/grab button (or explicit struggle) is a tap
    if (this.sub) {
      if (B.struggle || B.btn) f.intent.struggle = true;
      return;
    }
    if (this.transition) return;
    // ---- ground
    if (this.ground) {
      const isTop = this.ground.top === f.side;
      if (B.action) f.intent.action = B.action;
      else if (B.btn === "grab") f.intent.action = "sub";
      else if (B.btn === "upper") f.intent.action = "sub2";
      else if (B.btn === "grapple") f.intent.action = isTop ? "advance" : "escape";
      else if (B.dodge) f.intent.action = "standup";
      else if (B.btn || B.attack) f.intent.attack = "gstrike";
      f.intent.guard = B.guard ? "high" : null;
      return;
    }
    // ---- clinch
    if (this.clinch) {
      if (B.action) f.intent.action = B.action;
      else if (B.btn === "grab") f.intent.action = "td";
      else if (B.btn === "grapple") f.intent.action = "pummel";
      else if (B.dodge) f.intent.action = "break";
      f.intent.guard = B.guard ? "high" : null;
      let atk = B.attack;
      if (!atk && B.btn) atk = { jab: "shortPunch", cross: "shortPunch", hookL: "elbow", hookR: "elbow", upper: "knee", kick: "knee", teep: "knee" }[B.btn] || null;
      if (atk && MOVES[atk]?.clinch && (t === "clinch" || t === "attack")) {
        if (startAttack(this, f, atk)) this.clinch.lastStrike = 0;
      }
      return;
    }
    // ---- standing
    const d = dist(f, o);
    if (t === "down" || t === "getup" || t === "ko") return;
    // guard is a held state
    if (canAct(f)) {
      f.guard = f.intent.guard;
      if (f.guard && f.act.type !== "block") f.act = { type: "block", t: 0 };
      if (!f.guard && f.act.type === "block") f.act = { type: "idle", t: 0 };
    } else if (f.act.type === "blockHit") f.guard = f.intent.guard || f.guard;
    // sprawl reflex: dodge/grab while being shot on
    if ((B.dodge || B.btn === "grab" || B.action === "sprawl") && o.act.type === "shoot" && d < 2.6 && (canAct(f) || f.act.type === "attack")) {
      if (f.act.type === "attack" && MOVES[f.act.move].startup > f.act.t) f.act = { type: "idle", t: 0 };
      if (canAct(f)) GR.startSprawl(this, f);
      return;
    }
    if (B.dodge) {
      startDodge(this, f, B.dodge);
      return;
    }
    // grab / grapple context
    const grab = B.action || (B.btn === "grab" ? "grab" : B.btn === "grapple" ? "grapple" : null);
    if (grab) {
      if ((o.act.type === "down" || (o.act.type === "getup" && o.act.t < 0.4)) && d < 2.3 && canAct(f)) {
        // pounce on a downed opponent
        GR.enterGround(this, f, o, "side", { ...o.pos }, o.yaw);
        this.emit({ type: "pounce", side: f.side });
        return;
      }
      if (!canAct(f)) return;
      if (grab === "clinch" || (grab !== "shoot" && d <= 1.05)) GR.tryClinch(this, f, o);
      else if ((grab === "shoot" || grab === "grab") && d >= SHOOT_RANGE[0] && d <= SHOOT_RANGE[1]) GR.tryShoot(this, f, o);
      return;
    }
    // strikes (buffered so combos feel responsive)
    let atk = B.attack;
    if (!atk && B.btn) {
      const prev = f.act.type === "attack" ? f.act.move : f.combo.t < 0.6 ? f.combo.chain[f.combo.chain.length - 1] : null;
      switch (B.btn) {
        case "jab":
          atk = B.low ? "bodyJab" : prev === "jab" ? "jab2" : "jab";
          break;
        case "cross":
          atk = B.low ? "bodyCross" : "cross";
          break;
        case "hookL":
          atk = B.low ? "bodyHook" : "hookL";
          break;
        case "hookR":
          atk = "hookR";
          break;
        case "upper":
          atk = "uppercut";
          break;
        case "kick":
          atk = B.fwd ? "kickHead" : B.low ? "kickLow" : "kickBody";
          break;
        case "teep":
          atk = "kickFront";
          break;
        default:
          break;
      }
    }
    if (atk) {
      f.buffered = atk;
      f.bufferT = 0.22;
    }
    if (f.buffered) {
      if (startAttack(this, f, f.buffered)) f.buffered = null;
      else {
        f.bufferT -= dt;
        if (f.bufferT <= 0) f.buffered = null;
      }
    }
  }

  /* ---------------------------------------------------------- rounds */
  endRound() {
    const card = scoreRound(this.stats[this.round - 1], this.rng);
    this.cards.push(card);
    this.emit({ type: "roundScored", round: this.round, card });
    if (this.round >= this.cfg.rounds) {
      const d = decide(this.cards);
      this.result = { winner: d.winner, method: d.winner < 0 ? "DRAW" : "DEC", detail: d.label, round: this.round, time: this.cfg.roundTime, cards: d };
      this.setPhase("decision");
      this.emit({ type: "finish", ...this.result });
      this.phase = "ended";
      return;
    }
    // corner recovery between rounds
    for (const f of this.f) {
      f.sta = Math.max(f.sta, staMax(f) * 0.9);
      f.hp.head = Math.min(100, f.hp.head + 5);
      f.hp.body = Math.min(100, f.hp.body + 6);
      f.hp.legs = Math.min(100, f.hp.legs + 8);
      f.daze = 0;
    }
    this.setPhase("rest");
  }
}

export { SIM_DT, wrapAngle };
