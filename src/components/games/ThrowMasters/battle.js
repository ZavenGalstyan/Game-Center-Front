/**
 * Throw Masters — one battle: fighters, turns, projectiles, damage, effects
 * and the AI controller. No DOM: the component calls update(dt) from its rAF
 * loop and render.js reads the state. Anything React needs (HUD values, turn
 * changes, results) goes out through `onEvent(type, data)`.
 *
 * Modes: duel / tournament / local (two fighters, alternating turns),
 * target (one fighter, ten throws at targets), demo (AI vs AI, menu backdrop).
 */
import { W, H, WEAPONS, CHAR_BY_ID, SKIN_BY_ID, TARGET_THROWS, FIGHTER_SCALE } from "./data.js";
import { STEP, groundY, launch, stepProjectile, distToFighter, fighterBox, previewPath } from "./physics.js";
import { createAIMemory, planShot, learn } from "./ai.js";

export const MAX_DRAG = 230; // world units of drag for 100 % power
const MIN_DRAG = 20; // shorter drags cancel the throw (no accidental shots)

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export class Battle {
  constructor(cfg) {
    this.cfg = cfg;
    this.mode = cfg.mode;
    this.arena = cfg.arena;
    this.onEvent = cfg.onEvent || (() => {});
    this.rand = cfg.rand || Math.random;
    this.settings = cfg.settings || { aim: "pull", preview: true };
    const L = cfg.layout;
    this.layout = L;
    this.world = {
      ground: L.ground,
      obstacles: L.obstacles || [],
      wind: L.wind || 0,
      fighters: [],
      targets: null,
    };
    this.fighters = cfg.players.map((p, i) => this.makeFighter(p, i, i === 0 ? L.xL : L.xR));
    this.world.fighters = this.fighters;
    this.projectiles = [];
    this.particles = [];
    this.texts = [];
    this.decor = [];
    this.rings = [];
    this.time = 0;
    this.acc = 0;
    this.turn = 0;
    this.turnNo = 1;
    this.phase = "intro";
    this.phaseT = 0;
    this.aim = null;
    this.ai = null;
    this.winner = -1;
    this.overSent = false;
    this.turnHit = false;
    this.shake = 0;
    this.flash = 0;
    this.cam = { x: W / 2, y: H / 2, zoom: 1 };
    this.stats = this.fighters.map(() => ({ throws: 0, hits: 0, dmg: 0, heads: 0 }));
    if (this.mode === "target") {
      this.throwsLeft = TARGET_THROWS;
      this.score = 0;
      this.streak = 0;
      this.targetSeq = 0;
      this.world.targets = [];
      for (let i = 0; i < 3; i++) this.spawnTarget(i);
    }
  }

  makeFighter(p, side, x) {
    const c = CHAR_BY_ID[p.charId];
    const hp = Math.round(c.hp * (p.hpMul || 1));
    return {
      side,
      char: c,
      charId: c.id,
      weapon: c.weapon,
      name: p.name || c.name,
      human: !!p.human,
      skin: SKIN_BY_ID[p.skin || "classic"] || SKIN_BY_ID.classic,
      x,
      y: groundY(this.layout.ground, x),
      homeX: x,
      dir: side === 0 ? 1 : -1,
      k: c.build * FIGHTER_SCALE,
      power: c.power,
      prec: c.prec,
      hp,
      maxHp: hp,
      dead: false,
      vx: 0,
      anim: "idle",
      animT: 0,
      aimAngle: 35,
      aimPower: 0,
      flash: 0,
      hurtT: 0,
      blink: 1 + Math.random() * 3,
      holding: true,
      mem: p.human ? null : createAIMemory(p.skill ?? 0.5, this.rand),
    };
  }

  emit(type, data) {
    if (this.mode !== "demo" || type === "over") this.onEvent(type, data);
  }

  get current() {
    return this.fighters[this.turn];
  }

  /** Target Challenge: place target slot i somewhere fresh on the right side. */
  spawnTarget(slot) {
    const r = this.rand;
    const seq = this.targetSeq++;
    const kind = seq < 2 ? "board" : r() < 0.4 ? "balloon" : r() < 0.6 ? "board" : "high";
    const x = 820 + slot * 230 + (r() - 0.5) * 140;
    const gy = groundY(this.world.ground, x);
    let t;
    if (kind === "board") t = { kind, x, y: gy - 90 - r() * 90, r: 40, by: 0 };
    else if (kind === "high") t = { kind, x, y: 240 + r() * 180, r: 36, by: 0 };
    else t = { kind, x, y: 300 + r() * 220, r: 30, by: 0, bob: r() * 6 };
    t.baseY = t.y;
    t.alive = true;
    t.slot = slot;
    t.id = seq;
    t.pop = 0;
    this.world.targets[slot] = t;
  }

  /* ---------------------------------------------------------------- input */

  canAim() {
    const f = this.current;
    return this.phase === "aim" && f && f.human && !f.dead;
  }

  pointerDown(wx, wy) {
    if (!this.canAim()) return false;
    this.aim = { sx: wx, sy: wy, x: wx, y: wy, valid: false };
    this.current.anim = "aim";
    this.current.animT = 0;
    return true;
  }

  pointerMove(wx, wy) {
    if (!this.aim) return;
    this.aim.x = wx;
    this.aim.y = wy;
    const f = this.current;
    let dx = wx - this.aim.sx;
    let dy = wy - this.aim.sy;
    const len = Math.hypot(dx, dy);
    if (this.settings.aim === "pull") {
      dx = -dx;
      dy = -dy;
    }
    this.aim.valid = len >= MIN_DRAG;
    if (!this.aim.valid) {
      f.aimPower = 0;
      return;
    }
    let ang = (Math.atan2(-dy, dx * f.dir) * 180) / Math.PI;
    if (ang < -100) ang = 85; // dragged backwards and down → straight lob
    f.aimAngle = clamp(ang, -30, 85);
    f.aimPower = clamp(len / MAX_DRAG, 0, 1);
  }

  pointerUp() {
    if (!this.aim) return null;
    const f = this.current;
    const valid = this.aim.valid && f.aimPower > 0.02;
    this.aim = null;
    if (!valid || !this.canAim()) {
      f.anim = "idle";
      f.aimPower = 0;
      return null;
    }
    this.throw(f, f.aimAngle, f.aimPower);
    return true;
  }

  cancelAim() {
    if (!this.aim) return;
    this.aim = null;
    this.current.anim = "idle";
    this.current.aimPower = 0;
  }

  /** Aim preview points for the current human aim (empty when disabled). */
  preview() {
    const f = this.current;
    if (!this.aim || !this.aim.valid || !this.settings.preview) return null;
    const w = WEAPONS[f.weapon];
    return previewPath(this.world, f, f.weapon, f.aimAngle, f.aimPower, w.preview * f.prec);
  }

  /* ---------------------------------------------------------------- throws */

  throw(f, angle, power) {
    const shots = launch(f, f.weapon, angle, power, { skin: f.skin, trail: [] });
    this.projectiles.push(...shots);
    f.anim = "throw";
    f.animT = 0;
    f.aimAngle = angle;
    f.aimPower = power;
    f.holding = false;
    this.stats[f.side].throws++;
    this.turnHit = false;
    this.phase = "flight";
    this.phaseT = 0;
    this.emit("throw", { side: f.side, weapon: f.weapon, angle, power });
  }

  /* ---------------------------------------------------------------- update */

  update(dt) {
    dt = Math.min(dt, 0.05);
    this.time += dt;
    this.phaseT += dt;

    // fixed-step projectile physics
    this.acc += dt;
    let steps = 0;
    while (this.acc >= STEP && steps < 12) {
      this.acc -= STEP;
      steps++;
      this.stepTargets(STEP);
      for (const p of this.projectiles) {
        if (!p.alive) continue;
        const ev = stepProjectile(this.world, p, STEP);
        if (ev) this.handle(p, ev);
      }
    }
    if (steps >= 12) this.acc = 0;
    for (const p of this.projectiles) {
      if (!p.alive) continue;
      p.trail.push(p.x, p.y);
      if (p.trail.length > 28) p.trail.splice(0, 2);
      if (p.id === "fireball" && this.rand() < 0.9) this.spawn("fire", p.x, p.y, 1);
      if (p.id === "crystal" && this.rand() < 0.5) this.spawn("glint", p.x, p.y, 1, p.skin?.glow || "#9ff3ff");
      if (p.id === "bomb" && this.rand() < 0.6) this.spawn("spark", p.x + Math.cos(p.rot - 1.2) * 20, p.y + Math.sin(p.rot - 1.2) * 20, 1, "#ffd35a");
    }
    this.projectiles = this.projectiles.filter((p) => p.alive);

    this.updateFighters(dt);
    this.updateFx(dt);
    this.updateCamera(dt);
    this.updatePhase(dt);
  }

  stepTargets(dt) {
    const ts = this.world.targets;
    if (!ts) return;
    for (const t of ts) {
      if (!t) continue;
      if (t.kind === "balloon") t.y = t.baseY + Math.sin(this.time * 1.3 + t.bob) * 46;
      else if (t.kind === "high") t.x += Math.sin(this.time * 0.9 + t.id) * 50 * dt;
      if (!t.alive) t.pop += dt;
    }
  }

  updatePhase(dt) {
    const f = this.current;
    switch (this.phase) {
      case "intro":
        if (this.phaseT > 1.3) this.startTurn();
        break;
      case "aim":
        if (!f.human) this.runAI(dt);
        break;
      case "flight":
        if (!this.projectiles.length) {
          this.phase = "resolve";
          this.phaseT = 0;
          if (this.turnHit) this.stats[this.turn].hits++;
          if (f.mem) learn(f.mem, this.turnHit, this.rand);
          if (!this.turnHit) {
            if (this.mode === "target") this.streak = 0;
            this.emit("miss", { side: this.turn });
          }
        } else if (this.phaseT > 9) {
          for (const p of this.projectiles) p.alive = false;
        }
        break;
      case "resolve":
        if (this.phaseT > 0.85) this.endTurn();
        break;
      case "over":
        if (this.phaseT > 2.4 && !this.overSent) {
          this.overSent = true;
          this.phase = "done";
          this.emit("over", this.result());
        }
        break;
      default:
        break;
    }
  }

  startTurn() {
    this.phase = "aim";
    this.phaseT = 0;
    this.ai = null;
    const f = this.current;
    f.holding = true;
    f.anim = "idle";
    f.aimPower = 0;
    // weapons left in fighters fall out at turn change
    this.decor = this.decor.filter((d) => d.on == null);
    this.emit("turn", { side: this.turn, turnNo: this.turnNo, human: f.human });
  }

  endTurn() {
    const dead = this.fighters.filter((f) => f.dead);
    if (this.mode === "target") {
      this.throwsLeft--;
      this.emit("hud", this.hud());
      if (this.throwsLeft <= 0) return this.finish(0);
    } else if (dead.length) {
      const alive = this.fighters.filter((f) => !f.dead);
      return this.finish(alive.length ? alive[0].side : -1);
    } else {
      this.turn = 1 - this.turn;
      this.turnNo++;
    }
    this.current.holding = true;
    this.startTurn();
  }

  finish(winner) {
    this.winner = winner;
    this.phase = "over";
    this.phaseT = 0;
    this.decor = this.decor.filter((d) => d.on == null);
    for (const f of this.fighters) {
      if (f.dead) continue;
      f.anim = this.mode === "target" || f.side === winner ? "win" : "lose";
      f.animT = 0;
    }
    if (winner >= 0) {
      const wf = this.fighters[winner];
      for (let i = 0; i < 40; i++) this.spawn("confetti", wf.x + (this.rand() - 0.5) * 160, wf.y - 260 - this.rand() * 80, 1);
    }
    this.emit("finish", { winner });
  }

  result() {
    const s = this.stats[0];
    return {
      mode: this.mode,
      winner: this.winner,
      stats: this.stats,
      turns: this.turnNo,
      score: this.score || 0,
      accuracy: s.throws ? s.hits / s.throws : 0,
      hp: this.fighters.map((f) => f.hp),
    };
  }

  hud() {
    return {
      hp: this.fighters.map((f) => f.hp),
      maxHp: this.fighters.map((f) => f.maxHp),
      turn: this.turn,
      turnNo: this.turnNo,
      phase: this.phase,
      throwsLeft: this.throwsLeft,
      score: this.score,
      streak: this.streak,
    };
  }

  /* ---------------------------------------------------------------- AI */

  runAI(dt) {
    const f = this.current;
    if (!this.ai) {
      this.ai = { t: 0, plan: null, think: 0.45 + this.rand() * 0.45, from: { a: f.aimAngle, p: 0 } };
    }
    const ai = this.ai;
    ai.t += dt;
    if (!ai.plan && ai.t > ai.think) {
      const target = this.fighters[1 - this.turn];
      ai.plan = planShot(this.world, f, target, f.weapon, f.mem, this.rand);
      ai.t0 = ai.t;
      f.anim = "aim";
      f.animT = 0;
    }
    if (ai.plan) {
      const k = clamp((ai.t - ai.t0) / 0.85, 0, 1);
      const e = k * k * (3 - 2 * k);
      f.aimAngle = ai.from.a + (ai.plan.angle - ai.from.a) * e;
      f.aimPower = ai.plan.power * e;
      if (ai.t - ai.t0 > 1.05) this.throw(f, ai.plan.angle, ai.plan.power);
    }
  }

  /* ---------------------------------------------------------------- impacts */

  handle(p, ev) {
    const w = p.w;
    const owner = this.fighters.find((f) => f.side === p.owner);
    switch (ev.type) {
      case "fighter": {
        const f = this.fighters[ev.side];
        const mult = ev.zone === "head" ? w.head : ev.zone === "legs" ? 0.75 : 1;
        const dmg = Math.round(w.dmg * mult);
        this.damage(f, dmg, { zone: ev.zone, kb: w.kb * Math.sign(p.vx || f.x - p.x), owner: p.owner, x: ev.x, y: ev.y, weapon: p.id });
        if (w.sticks || p.id === "boomerang") this.stick(p, f, ev);
        if (w.burst) this.burst(p, ev.x, ev.y, f.side);
        if (w.heal && owner && !owner.dead) {
          owner.hp = Math.min(owner.maxHp, owner.hp + w.heal);
          this.text(owner.x, owner.y - 170 * owner.k, `+${w.heal}`, "#7dffb2", 30);
          this.emit("hp", this.hud());
        }
        break;
      }
      case "ground":
      case "obstacle": {
        if (w.burst) this.burst(p, ev.x, ev.y, -1);
        else {
          this.spawn(ev.type === "ground" ? "dust" : "chip", ev.x, ev.y, p.id === "hammer" ? 16 : 8, this.dustColor());
          if (w.sticks || p.id === "hammer" || p.id === "boomerang") this.addDecor(p, ev);
          if (p.id === "hammer") this.shake = Math.max(this.shake, 7);
        }
        this.emit("impact", { kind: ev.type, weapon: p.id, burst: !!w.burst, stuck: !!w.sticks });
        break;
      }
      case "bounce":
        if (Math.hypot(p.vx, p.vy) > 140) {
          this.spawn("dust", ev.x, ev.y, 4, this.dustColor());
          this.emit("bounce", { weapon: p.id });
        }
        return;
      case "ricochet":
        this.spawn("spark", ev.x, ev.y, 10, "#fff2a8");
        this.emit("ricochet", {});
        return;
      case "explode":
        this.explode(p, ev.x, ev.y);
        break;
      case "caught":
        if (owner) this.text(owner.x, owner.y - 170 * owner.k, "CAUGHT!", "#bff", 24);
        this.emit("catch", {});
        break;
      case "target":
        this.hitTarget(ev.target, ev.d, ev.x, ev.y, p);
        if (w.burst) this.burst(p, ev.x, ev.y, -1);
        break;
      case "out":
      default:
        break;
    }
    p.alive = false;
  }

  dustColor() {
    return { meadow: "#9c7a4a", canyon: "#d79a5c", snow: "#f2f8ff", island: "#e9d29a", city: "#8a8fa0" }[this.arena] || "#aaa";
  }

  damage(f, dmg, { zone, kb = 0, owner, x, y, weapon, blast = false }) {
    if (f.dead || dmg <= 0 || this.phase === "over" || this.phase === "done") return;
    const real = Math.min(dmg, f.hp);
    f.hp -= real;
    f.flash = 0.18;
    f.anim = f.hp <= 0 ? "lose" : "hit";
    f.animT = 0;
    f.vx += (kb / (f.k * f.k)) * 0.9;
    if (owner != null && owner !== f.side) {
      this.stats[owner].dmg += real;
      if (zone === "head") this.stats[owner].heads++;
      this.turnHit = true;
    }
    if (f.hp <= 0) f.dead = true;
    const head = zone === "head";
    this.text(x, y - 20, head ? `${dmg}` : `${dmg}`, head ? "#ffdf3d" : "#ffffff", head ? 46 : 36, head ? "HEADSHOT!" : null);
    this.spawn("star", x, y, head ? 12 : 7, head ? "#ffe066" : "#fff");
    this.spawn("spark", x, y, 8, "#ffb04a");
    this.shake = Math.max(this.shake, head ? 12 : 8);
    this.flash = Math.max(this.flash, head ? 0.25 : 0);
    this.emit("hit", { side: f.side, dmg, zone, weapon, blast, dead: f.dead });
    this.emit("hp", this.hud());
  }

  burst(p, x, y, directSide) {
    const b = p.w.burst;
    const color = p.id === "fireball" ? "#ff8a2a" : p.skin?.glow || "#8ff3ff";
    this.spawn(p.id === "fireball" ? "fire" : "shard", x, y, 22, color);
    this.rings.push({ x, y, r: 10, max: b.r, t: 0, color });
    for (const f of this.fighters) {
      if (f.side === directSide || f.dead) continue;
      const d = distToFighter(f, x, y);
      if (d < b.r) this.damage(f, Math.round(b.dmg * (1 - d / b.r) + 2), { zone: "body", kb: Math.sign(f.x - x) * 80, owner: p.owner, x: f.x, y: f.y - 90 * f.k, weapon: p.id, blast: true });
    }
    if (this.world.targets) {
      for (const t of this.world.targets) {
        if (t && t.alive && Math.hypot(t.x - x, t.y - y) < b.r + t.r) this.hitTarget(t, t.r, t.x, t.y, p, true);
      }
    }
    this.emit("burst", { weapon: p.id });
  }

  explode(p, x, y) {
    const b = p.w.blast;
    this.spawn("fire", x, y, 34, "#ffa63d");
    this.spawn("smoke", x, y, 18, "#5a5560");
    this.spawn("spark", x, y, 20, "#ffe27a");
    this.rings.push({ x, y, r: 20, max: b.r, t: 0, color: "#ffd17a" });
    this.shake = Math.max(this.shake, 16);
    this.flash = Math.max(this.flash, 0.3);
    for (const f of this.fighters) {
      if (f.dead) continue;
      const d = distToFighter(f, x, y);
      if (d >= b.r) continue;
      const dmg = Math.round(b.dmg * Math.pow(1 - d / b.r, 0.8));
      const b2 = fighterBox(f);
      this.damage(f, dmg, { zone: "body", kb: Math.sign(f.x - x || f.dir * -1) * b.kb * (1 - d / b.r), owner: p.owner, x: b2.cx, y: b2.cy, weapon: "bomb", blast: true });
    }
    if (this.world.targets) {
      for (const t of this.world.targets) {
        if (t && t.alive && Math.hypot(t.x - x, t.y - y) < b.r + t.r) this.hitTarget(t, t.r, t.x, t.y, p, true);
      }
    }
    this.emit("explode", {});
  }

  hitTarget(t, d, x, y, p, splash = false) {
    if (!t.alive) return;
    t.alive = false;
    t.pop = 0;
    let pts;
    let label = null;
    if (splash) pts = 30;
    else if (t.kind === "balloon") pts = 50;
    else if (d < 10) {
      pts = 100;
      label = "BULLSEYE!";
    } else if (d < t.r * 0.55) pts = 60;
    else pts = 30;
    if (t.kind === "high" && !splash) pts += 20;
    this.streak++;
    const total = Math.round(pts * (1 + Math.min(this.streak - 1, 4) * 0.25));
    this.score += total;
    this.turnHit = true;
    this.text(x, y - 30, `+${total}`, label ? "#ffdf3d" : "#ffffff", label ? 46 : 36, label || (this.streak > 1 ? `STREAK x${this.streak}` : null));
    this.spawn(t.kind === "balloon" ? "confetti" : "chip", x, y, 16, t.kind === "balloon" ? null : "#c98a4b");
    this.spawn("star", x, y, 8, "#ffe066");
    this.emit("target", { pts: total, bullseye: !!label, kind: t.kind });
    this.emit("hud", this.hud());
    const slot = t.slot;
    // the slot refills after the throw resolves
    this.pendingRespawn = this.pendingRespawn || [];
    this.pendingRespawn.push(slot);
    if (p && p.w.sticks && t.kind !== "balloon") this.addDecor(p, { x, y }, t);
  }

  stick(p, f, ev) {
    this.decor.push({ id: p.id, skin: p.skin, on: f.side, ox: ev.x - f.x, oy: ev.y - f.y, rot: p.w.spin ? p.rot : Math.atan2(p.vy, p.vx), t: 0, life: 4 });
  }

  addDecor(p, ev, onTarget = null) {
    const rot = p.w.spin && p.id !== "hammer" && p.id !== "boomerang" ? Math.atan2(p.vy, p.vx) + (p.id === "axe" ? 0.6 : 0) : p.id === "hammer" || p.id === "boomerang" ? (p.dir > 0 ? 0.25 : Math.PI - 0.25) : Math.atan2(p.vy, p.vx);
    const lying = p.id === "hammer" || p.id === "boomerang";
    this.decor.push({ id: p.id, skin: p.skin, x: ev.x, y: lying ? ev.y - 10 : ev.y, rot, t: 0, life: onTarget ? 1.2 : 14, on: null });
    if (this.decor.length > 26) this.decor.shift();
  }

  /* ---------------------------------------------------------------- fighters / fx */

  updateFighters(dt) {
    for (const f of this.fighters) {
      f.animT += dt;
      f.flash = Math.max(0, f.flash - dt);
      if (f.anim === "hit" && f.animT > 0.55) f.anim = this.phase === "aim" && this.current === f && this.aim ? "aim" : "idle";
      if (f.anim === "throw" && f.animT > 0.6) f.anim = "idle";
      f.blink -= dt;
      if (f.blink < -0.12) f.blink = 2 + Math.random() * 3;
      if (Math.abs(f.vx) > 1) {
        f.x += f.vx * dt;
        f.vx *= Math.exp(-5 * dt);
        const lo = f.side === 0 ? 70 : W / 2 + 140;
        const hi = f.side === 0 ? W / 2 - 140 : W - 70;
        f.x = clamp(f.x, lo, hi);
        f.y = groundY(this.world.ground, f.x);
      }
    }
  }

  updateFx(dt) {
    for (const q of this.particles) {
      q.t += dt;
      q.vy += (q.g ?? 600) * dt;
      q.vx *= Math.exp(-(q.drag ?? 1.5) * dt);
      q.vy *= Math.exp(-(q.drag ?? 1.5) * dt);
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      q.rot += q.vr * dt;
    }
    this.particles = this.particles.filter((q) => q.t < q.life);
    for (const t of this.texts) {
      t.t += dt;
      t.y -= 46 * dt;
    }
    this.texts = this.texts.filter((t) => t.t < 1.3);
    for (const r of this.rings) r.t += dt;
    this.rings = this.rings.filter((r) => r.t < 0.45);
    for (const d of this.decor) d.t += dt;
    this.decor = this.decor.filter((d) => d.t < d.life);
    this.shake = Math.max(0, this.shake - dt * 40);
    this.flash = Math.max(0, this.flash - dt);
    if (this.pendingRespawn && this.phase === "resolve" && this.phaseT > 0.5) {
      for (const s of this.pendingRespawn) this.spawnTarget(s);
      this.pendingRespawn = null;
    }
  }

  updateCamera(dt) {
    let tx = W / 2;
    let ty = H / 2;
    let tz = 1;
    const p = this.projectiles[Math.floor(this.projectiles.length / 2)];
    if (p && this.mode !== "demo") {
      tz = 1.07;
      tx = W / 2 + clamp((p.x - W / 2) * 0.22, -110, 110);
      ty = H / 2 + clamp((p.y - H / 2) * 0.12, -50, 30);
    }
    const k = 1 - Math.exp(-2.6 * dt);
    this.cam.x += (tx - this.cam.x) * k;
    this.cam.y += (ty - this.cam.y) * k;
    this.cam.zoom += (tz - this.cam.zoom) * k;
  }

  spawn(kind, x, y, n, color) {
    const r = this.rand;
    for (let i = 0; i < n; i++) {
      if (this.particles.length > 700) return;
      const a = r() * Math.PI * 2;
      let s = 80 + r() * 260;
      const q = { kind, x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, t: 0, life: 0.5 + r() * 0.5, size: 3 + r() * 4, color, rot: r() * 6, vr: (r() - 0.5) * 12, g: 600, drag: 1.5 };
      switch (kind) {
        case "dust":
          q.vy = -Math.abs(q.vy) * 0.6;
          q.size = 6 + r() * 10;
          q.g = 120;
          q.drag = 3;
          q.life = 0.6 + r() * 0.5;
          break;
        case "smoke":
          q.vy = -40 - r() * 120;
          q.vx *= 0.4;
          q.size = 18 + r() * 22;
          q.g = -40;
          q.drag = 2;
          q.life = 1 + r() * 0.8;
          break;
        case "fire":
          s = n === 1 ? 30 : s;
          q.vx = Math.cos(a) * s * (n === 1 ? 1 : 1.1);
          q.vy = Math.sin(a) * s - (n === 1 ? 30 : 60);
          q.size = n === 1 ? 7 + r() * 7 : 10 + r() * 16;
          q.g = -120;
          q.drag = 3;
          q.life = n === 1 ? 0.35 + r() * 0.25 : 0.5 + r() * 0.4;
          break;
        case "glint":
          q.vx *= 0.15;
          q.vy *= 0.15;
          q.g = 0;
          q.life = 0.5;
          q.size = 2 + r() * 3;
          break;
        case "star":
          q.size = 6 + r() * 6;
          q.g = 400;
          break;
        case "confetti":
          q.vy = -200 - r() * 260;
          q.vx = (r() - 0.5) * 300;
          q.g = 380;
          q.drag = 1.8;
          q.life = 1.6 + r() * 1;
          q.size = 5 + r() * 5;
          q.color = color || `hsl(${Math.floor(r() * 360)},90%,62%)`;
          break;
        case "shard":
          q.size = 4 + r() * 6;
          break;
        default:
          break;
      }
      this.particles.push(q);
    }
  }

  text(x, y, text, color, size, sub = null) {
    this.texts.push({ x, y, text, color, size, sub, t: 0 });
  }
}
