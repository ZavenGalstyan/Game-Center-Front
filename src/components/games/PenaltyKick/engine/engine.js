/**
 * Penalty Kick — engine glue between the headless Session and the 3D view.
 *
 * ONE driver: the R3F useFrame in three/Scene.jsx calls frame(dt). The
 * accumulator steps the Session on the fixed PK.DT (capped per frame, so a
 * background-tab stall can never fast-forward a penalty), then the renderer
 * reads interpolated state (ball between its last two physics positions,
 * figures posed at the matching sub-step time). React only receives
 * throttled HUD snapshots and discrete events.
 */
import { PK, clamp, lerp } from "./constants.js";
import { Session } from "./session.js";
import { T_CONTACT, T_END } from "./kicker.js";
import { KZ } from "./keeper.js";

const CHARGE_TIME = 1.15; // s from 0 to full power while holding

export class Engine {
  constructor() {
    this.cb = {};
    this.acc = 0;
    this.paused = false;
    this.hidden = false;
    this.settings = { cameraMotion: true, reducedMotion: false, aimSens: "medium" };
    this.aim = { x: 1.6, y: 1.1 };
    this.curve = 0;
    this.charge = null; // { t } while the shoot control is held
    this.shake = 0;
    this.flash = null; // { kind, t } for result presentation
    this.demoSeed = 1;
    this.lastHud = "";
    this.venue = null;
    this.wallT = 0;
    this.excite = 0;
    this.fx = null; // set by the 3D scene: (kind, data) → particles
    this.netFx = null; // set by the 3D scene: net impact → net ripple
    this.project = null; // set by the camera rig: (ndcX, ndcY, planeZ) → [x, y] | null
    this.showMenu();
  }

  /* ------------------------------------------------------------ sessions */
  showMenu() {
    this.mode = "menu";
    // hero scene: taker behind the ball, keeper on the line, ball on the spot.
    // No match physics runs behind the menus — only idle animation.
    this.session = new Session({ mode: "demo", seed: this.demoSeed++ });
    this.session.phase = "HERO";
    this.charge = null;
    this.paused = false;
    this.acc = 0;
  }

  start(cfg) {
    this.mode = "play";
    this.session = new Session(cfg);
    this.charge = null;
    this.curve = 0;
    this.aim = { x: 1.6, y: 1.1 };
    this.paused = false;
    this.acc = 0;
    this.flash = null;
    this.startWall = performance.now();
    this.emitHud(true);
  }

  setPaused(p) {
    this.paused = p;
    if (p) this.charge = null;
  }
  setHidden(h) {
    this.hidden = h;
    if (h) this.charge = null;
  }
  setSettings(s) {
    this.settings = s;
  }

  /* ------------------------------------------------------------ inputs */
  setAim(x, y) {
    this.aim = { x: clamp(x, -5.2, 5.2), y: clamp(y, 0.12, 3.6) };
  }
  nudgeAim(dx, dy) {
    this.setAim(this.aim.x + dx, this.aim.y + dy);
  }
  setCurve(c) {
    this.curve = clamp(Math.round(c * 20) / 20, -1, 1);
  }
  canShoot() {
    const s = this.session;
    return this.mode === "play" && !this.paused && s.role === "shoot" && s.phase === "AIM";
  }
  beginCharge() {
    if (!this.canShoot() || this.charge) return false;
    this.charge = { t: 0 };
    return true;
  }
  cancelCharge() {
    this.charge = null;
  }
  power() {
    if (!this.charge) return 0;
    // eased fill: quick through the middle, slower into the overpower zone
    const k = clamp(this.charge.t / CHARGE_TIME, 0, 1);
    return 1 - (1 - k) * (1 - k) * 0.35 - (1 - k) * 0.65;
  }
  releaseCharge() {
    if (!this.charge) return false;
    const power = clamp(this.power(), 0, 1);
    this.charge = null;
    if (!this.canShoot()) return false;
    const ok = this.session.shoot({ aimX: this.aim.x, aimY: this.aim.y, power, curve: this.curve });
    if (ok) this.cb.sound?.("runup");
    return ok;
  }
  /** Keeper dive toward a goal-plane point (hx, hy). */
  dive(hx, hy) {
    if (this.mode !== "play" || this.paused) return null;
    const d = this.session.dive(hx, hy);
    if (d) this.cb.sound?.("dive");
    return d;
  }
  keeperX() {
    return this.session.pen ? this.session.pen.keeper.x : 0;
  }

  /* ------------------------------------------------------------ loop */
  frame(dt) {
    this.wallT += dt;
    if (this.hidden || (this.paused && this.mode === "play")) return;
    const d = Math.min(dt, PK.MAX_FRAME);
    if (this.charge) {
      this.charge.t += d;
      if (!this.canShoot()) this.charge = null;
    }
    if (this.mode === "menu") {
      this.acc = 0;
      return;
    }
    this.acc += d;
    let n = 0;
    while (this.acc >= PK.DT && n < PK.MAX_STEPS) {
      this.session.tick();
      this.acc -= PK.DT;
      n++;
      for (const e of this.session.drain()) this.onEvent(e);
    }
    if (n >= PK.MAX_STEPS) this.acc = 0;
    this.shake = Math.max(0, this.shake - d * 2.5);
    this.excite = Math.max(0, this.excite - d * 0.45);
    this.emitHud();
  }

  alpha() {
    return clamp(this.acc / PK.DT, 0, 1);
  }

  onEvent(e) {
    const menu = this.mode === "menu";
    const snd = (name, data) => !menu && this.cb.sound?.(name, data);
    if (e.type === "pen") {
      const x = e.e;
      if (x.type === "kick") snd("kick", { power: x.power });
      else if (x.type === "post" || x.type === "bar") {
        snd(x.type, { speed: x.speed });
        if (this.settings.cameraMotion && !this.settings.reducedMotion) this.shake = Math.min(1, 0.25 + x.speed / 40);
      } else if (x.type === "net") {
        snd("net", { speed: x.speed });
        this.netFx?.(x);
      } else if (x.type === "glove") snd("glove", { speed: x.speed });
      else if (x.type === "catch") snd("catch");
      else if (x.type === "body") snd("body", { speed: x.speed });
      else if (x.type === "bounce") snd("bounce", { speed: x.speed });
      else if (x.type === "dive" && this.session.role !== "keep") snd("dive");
      if (x.type === "kick" || x.type === "bounce") this.fx?.(x.type, x);
      if (x.type === "post" || x.type === "bar") this.excite = Math.max(this.excite, 0.55);
    } else if (e.type === "result") {
      this.flash = { kind: e.result, t: this.wallT, entry: e };
      // the home crowd is the player's: it roars for your goals and your saves
      const good = (e.role === "shoot" && e.result === "GOAL") || (e.role === "keep" && e.result !== "GOAL");
      this.excite = menu ? 0.5 : good ? 1 : 0.25;
      snd("result", e);
      if (!menu) this.cb.result?.(e);
    } else if (e.type === "turn") {
      if (!menu) this.cb.turn?.(e);
    } else if (e.type === "runup") {
      snd("tension");
    } else if (e.type === "over") {
      if (!menu) this.cb.over?.(this.summary(true));
      if (e.winner === "player") this.fx?.("confetti", {});
    }
  }

  /** Session summary for storage (finished = reached OVER). */
  summary(finished) {
    const s = this.session;
    const so = s.so;
    const score = so ? [so.player.filter((r) => r === "goal").length, so.rival.filter((r) => r === "goal").length] : [0, 0];
    return {
      mode: s.mode,
      matchId: s.cfg.match?.id ?? null,
      winner: s.winner,
      suddenDeath: !!so?.suddenDeath,
      score,
      playerMissed: so ? so.player.filter((r) => r !== "goal").length : 0,
      stats: { ...s.stats },
      log: s.log.slice(),
      playMs: this.startWall ? performance.now() - this.startWall : 0,
      finished,
    };
  }

  hud() {
    const s = this.session;
    return {
      phase: s.phase,
      role: s.role,
      kickNo: s.kickNo,
      so: s.so,
      target: s.target,
      log: s.log,
      stats: s.stats,
      taker: s.takerInfo || null,
      over: s.phase === "OVER",
      charging: !!this.charge,
    };
  }

  emitHud(force = false) {
    if (this.mode !== "play" || !this.cb.hud) return;
    const s = this.session;
    const key = `${s.phase}|${s.role}|${s.kickNo}|${s.log.length}|${!!this.charge}`;
    if (!force && key === this.lastHud) return;
    this.lastHud = key;
    this.cb.hud(this.hud());
  }

  /* ------------------------------------------------------------ render state */
  /** Penalty-local render time (interpolated sub-step). */
  penT() {
    const s = this.session;
    const p = s.pen;
    if (!p) return 0;
    if (s.phase === "KICK" || s.phase === "RESULT" || s.phase === "OVER") return Math.max(0, p.t - (1 - this.alpha()) * PK.DT);
    return 0;
  }

  ballPos(out) {
    const p = this.session.pen;
    if (!p) return null;
    const a = this.alpha();
    const b = p.ball.p;
    const q = p.prevP || b;
    const moving = p.ball.moving || p.caught;
    out[0] = moving ? q[0] + (b[0] - q[0]) * a : b[0];
    out[1] = moving ? q[1] + (b[1] - q[1]) * a : b[1];
    out[2] = moving ? q[2] + (b[2] - q[2]) * a : b[2];
    return out;
  }

  /** Keeper render time: idle sway runs on wall time until the penalty starts. */
  keeperPose() {
    const s = this.session;
    const p = s.pen;
    if (!p) return null;
    const running = s.phase === "KICK" || s.phase === "RESULT" || s.phase === "OVER";
    return p.keeper.pose(running ? this.penT() : this.wallT);
  }

  kickerPose() {
    const p = this.session.pen;
    if (!p) return null;
    const t = Math.min(this.penT(), T_END);
    return p.kick.pose(t);
  }

  /** What the camera should do this frame. */
  cameraGoal() {
    const s = this.session;
    const p = s.pen;
    const t = this.penT();
    const motion = this.settings.cameraMotion && !this.settings.reducedMotion;
    if (this.mode === "menu") {
      // behind-left of the taker, aimed left of the action so the penalty
      // (taker, ball, keeper, goal) fills the RIGHT side next to the menu
      const a = motion ? this.wallT * 0.18 : 0;
      // (yawed ~22° left: taker ≈ +10°, ball ≈ +20°, goal ≈ +21° of a ±30° view — nothing overlaps)
      return { pos: [0.3 + Math.sin(a) * 0.3, 2.4 + Math.sin(a * 0.7) * 0.1, 21.5], look: [-5.7, 1.1, 5], fov: 36 };
    }
    if (s.role === "keep") {
      // behind the net, far enough back to frame both posts (the net fades in this view)
      const pos = [0, 2.9, -5.0]; // high enough that the sight line to the taker clears the net's rear top rod (y 1.9)
      const look = [0, 0.95, 9];
      if (motion && p && p.contactT != null && t > T_CONTACT) {
        const b = p.ball.p;
        look[0] = b[0] * 0.15;
      }
      return { pos, look, fov: 50 };
    }
    // shooter view: behind the spot at head height, a step right of the taker
    // (a right-footer runs in from the left) so the body doesn't hide the goal
    const pos = [2.0, 2.2, 18.4];
    const look = [0, 1.05, 3];
    let speed = 4.5;
    if (p && p.contactT != null && t > T_CONTACT) {
      // after contact: rise and dolly in so the sight line to the ball passes
      // OVER the taker's head (from head height the body covers one side of the
      // goal). Always on — it is a readability move, not decoration.
      const k = clamp((t - T_CONTACT) / 0.28, 0, 1);
      const e = k * k * (3 - 2 * k);
      pos[0] = lerp(2.0, 1.2, e);
      pos[1] = lerp(2.2, 3.1, e);
      pos[2] = lerp(18.4, 16.2, e);
      speed = 14;
      if (motion) {
        const bp = p.ball.p;
        look[0] = bp[0] * 0.25 * e;
        look[1] = lerp(1.05, 0.9 + (bp[1] - 1) * 0.2, e);
        look[2] = lerp(3, 1, e);
      } else {
        look[1] = lerp(1.05, 0.9, e);
        look[2] = lerp(3, 1, e);
      }
    } else if (motion && s.phase === "AIM") {
      look[0] = this.aim.x * 0.08;
    }
    return { pos, look, fov: 31, speed };
  }

  goalPlaneZ() {
    return 0;
  }
  keeperPlaneZ() {
    return KZ;
  }
}
