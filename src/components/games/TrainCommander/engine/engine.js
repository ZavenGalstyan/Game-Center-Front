/**
 * Train Commander — the journey simulation (no Three.js, no React; runs in
 * node for tools/simTest.mjs).
 *
 * Timing: `frame(rawDt)` clamps the real frame time (tab switch, debugger,
 * fullscreen transition can never produce a giant step), multiplies it by the
 * game speed and runs FIXED 1/60 s steps from an accumulator. 2x = twice as
 * many identical steps per real second, so the train, enemies, projectiles,
 * cooldowns, repair, spawn timers and route progress all scale together.
 *
 * Authoritative state lives here and only here: distance/speed, cars (HP,
 * modules), Scrap, enemies, projectiles, telegraphs, schedule, phase. The
 * renderer reads it every frame; React gets a throttled `hud()` snapshot.
 * One-shot things (fire, impact, kill, build…) are pushed to `events`, which
 * the renderer drains for effects and sound.
 *
 * Every transaction (build, upgrade, sell, emergency repair, continue) is
 * validated and applied synchronously in one call — a second rapid click
 * sees the already-updated state, so it can never double-charge.
 * Damage, kills, disable/restore, victory and defeat each go through one
 * function and flip state exactly once.
 *
 * See constants.js for the reference frame.
 */
import { MODULES, stat, invested, EMERGENCY, REACTIVATE_AT } from "../data/modules.js";
import { ENEMIES, BOSSES, armorDamage } from "../data/enemies.js";
import {
  STEP,
  MAX_FRAME,
  MAX_STEPS,
  HALF_W,
  MOUNT_Y,
  RAIL_Y,
  TILE,
  LOCO_HP,
  WAGON_HP,
  SPAWN_Z,
  AHEAD_X,
  WARN_TIME,
  MAX_ENEMIES,
  DYING_TIME,
  DYING_TIME_VEHICLE,
  ENDING_TIME,
  ACCEL,
  BRAKE_DIST,
  CHECKPOINT_TIME,
  CHECKPOINT_HOLD,
  FEATURE_LOOKAHEAD,
  BOSS_RAIL_Z,
  layoutTrain,
  trainFront,
  trainRear,
} from "./constants.js";

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const TURN = { gunner: 10, cannon: 3.6, lancer: 5.5 };
const AIM_TOL = 0.14;
const SLOTS = [0, -1.35, 1.35, -2.5, 2.5, -0.7, 0.7];

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const angDiff = (a, b) => {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
};

export function emptyRun() {
  return {
    time: 0,
    distance: 0,
    kills: 0,
    killsByType: {},
    vehicles: 0,
    bosses: 0,
    scrapEarned: 0,
    scrapSpent: 0,
    built: 0,
    builtByType: { gunner: 0, cannon: 0, lancer: 0, repair: 0 },
    upgrades: 0,
    repairs: 0,
    repairedHp: 0,
    wagonsLost: 0,
  };
}

export class Engine {
  constructor() {
    this.cb = {};
    this.speed = 1;
    this.paused = false;
    this.hidden = false;
    this.mode = "idle"; // idle | demo | play | showcase
    this.events = [];
    this.loadId = 0;
    this._clear();
  }

  _clear() {
    this.nextId = 1;
    this.cars = [];
    this.enemies = [];
    this.enemyById = new Map();
    this.projectiles = [];
    this.markers = [];
    this.schedule = [];
    this.features = [];
    this.stations = [];
    this.scrap = 0;
    this.d = 0;
    this.v = 0;
    this.cruise = 9;
    this.stopAt = null;
    this.travel = "cruise"; // cruise | braking | stopped
    this.phase = "idle"; // playing | ending | won | lost
    this.result = null;
    this.endT = 0;
    this.time = 0;
    this.acc = 0;
    this.evIdx = 0;
    this.timeline = [];
    this.checkpoint = null; // { name, t, ev }
    this.final = null; // { triggered, bossId, resolved, ev }
    this.destination = null;
    this.emergencyCd = 0;
    this.modules = [];
    this.run = emptyRun();
    this.events.length = 0;
    this.rand = rng(1);
    this.boss = null;
    this.groupPts = new Map();
    this._hudT = 0;
    this._hudKey = "";
  }

  /* =========================================================== loading */
  /**
   * route: an entry of data/routes.js. opts.demo → menu backdrop (endless,
   * no enemies). opts.showcase → Train screen (stopped, sample modules).
   */
  load(route, opts = {}) {
    this._clear();
    this.loadId++;
    this.route = route;
    this.mode = opts.demo ? "demo" : opts.showcase ? "showcase" : "play";
    this.paused = false;
    this.rand = rng((route?.id || 1) * 7919 + 101);
    const wagons = route?.wagons ?? 3;
    this.cars = layoutTrain(wagons).map((c) => ({
      ...c,
      hp: c.kind === "loco" ? LOCO_HP : WAGON_HP,
      maxHp: c.kind === "loco" ? LOCO_HP : WAGON_HP,
      module: null,
      disabled: false,
      hitT: 0,
      repairing: -1, // index of the car this wagon's repair crane is welding
      healedT: 0,
    }));
    this.cruise = route?.speed ?? 9;
    this.v = this.mode === "showcase" ? 0 : this.cruise;
    this.travel = this.mode === "showcase" ? "stopped" : "cruise";
    this.modules = (route?.modules || ["gunner"]).slice();
    this.scrap = route?.startScrap ?? 0;
    if (this.mode === "play") {
      this.timeline = route.events.map((e) => ({ ...e, groups: e.groups ? e.groups.map((g) => ({ ...g })) : undefined }));
      this.stations = route.events.filter((e) => e.type === "checkpoint").map((e) => ({ at: e.at, name: e.name, kind: "checkpoint" }));
      this.final = { triggered: false, resolved: false, bossId: null };
    }
    if (opts.modules) {
      opts.modules.forEach((m, i) => {
        const car = this.cars[i + 1];
        if (car && m) car.module = this._newModule(m.type || m, m.level || 1, car);
      });
    }
    this.phase = "playing";
    this._emitHud(true);
  }

  unload() {
    this._clear();
    this.mode = "idle";
    this.route = null;
  }

  setSpeed(s) {
    this.speed = s === 2 ? 2 : 1;
    this._emitHud(true);
  }
  setPaused(p) {
    this.paused = !!p;
    this._emitHud(true);
  }
  setHidden(h) {
    this.hidden = !!h;
  }
  get active() {
    return this.phase === "playing" && this.mode === "play";
  }
  get train() {
    return { front: trainFront(this.cars), rear: trainRear(this.cars) };
  }

  /* ============================================================= clock */
  frame(rawDt) {
    if (this.mode === "idle" || this.paused || this.hidden) return;
    const dt = clamp(Number.isFinite(rawDt) ? rawDt : 0, 0, MAX_FRAME);
    this.acc += dt * (this.mode === "play" ? this.speed : 1);
    let n = 0;
    while (this.acc >= STEP && n < MAX_STEPS) {
      this.step(STEP);
      this.acc -= STEP;
      n++;
    }
    if (n >= MAX_STEPS) this.acc = 0;
  }

  /** Advance by exactly `seconds` of game time (tests / sim). */
  simulate(seconds) {
    const steps = Math.round(seconds / STEP);
    for (let i = 0; i < steps; i++) this.step(STEP);
  }

  step(dt) {
    this.time += dt;
    const playing = this.phase === "playing";
    const play = this.mode === "play";
    if (play && playing) this.run.time += dt;
    this._stepTrain(dt, playing);
    if (play && playing) {
      this._stepTimeline(dt);
      this._stepSchedule(dt);
      if (this.emergencyCd > 0) this.emergencyCd = Math.max(0, this.emergencyCd - dt);
    }
    this._stepModules(dt, playing && play);
    this._stepEnemies(dt, playing && play);
    this._stepProjectiles(dt);
    this._stepMarkers(dt);
    for (const c of this.cars) {
      if (c.hitT > 0) c.hitT = Math.max(0, c.hitT - dt);
      if (c.healedT > 0) c.healedT = Math.max(0, c.healedT - dt);
    }
    if (play && playing) this._checkFinal();
    if (this.phase === "ending") {
      this.endT += dt;
      if (this.endT >= ENDING_TIME) this._finish();
    }
    this._hudT += dt;
    if (this._hudT >= 0.1) {
      this._hudT = 0;
      this._emitHud(false);
    }
  }

  /* ============================================================= train */
  _stepTrain(dt, playing) {
    if (this.mode === "showcase") {
      this.v = 0;
      return;
    }
    const want = this.phase === "lost" || (this.phase === "ending" && this.result === "lost") ? 0 : this.cruise;
    let v = this.v;
    if (this.stopAt != null) {
      const left = this.stopAt - this.d;
      const b = (this.cruise * this.cruise) / (2 * BRAKE_DIST);
      const allowed = Math.sqrt(2 * b * Math.max(0, left));
      v = Math.min(v + ACCEL * dt, this.cruise, allowed);
      if (left <= 0.04 || (left < 0.6 && v < 0.35)) {
        v = 0;
        this.d = this.stopAt;
        if (this.travel !== "stopped") {
          this.travel = "stopped";
          this._arrived();
        }
      } else this.travel = "braking";
    } else {
      if (want < v) v = Math.max(want, v - ACCEL * 1.6 * dt);
      else v = Math.min(want, v + ACCEL * dt);
      this.travel = "cruise";
    }
    this.v = v;
    this.d += v * dt;
    if (this.mode === "play" && playing) this.run.distance += v * dt;
  }

  _arrived() {
    if (this.mode !== "play") return;
    if (this.destination && this.stopAt === this.destination.at) {
      this.events.push({ type: "arrive", name: this.route.to });
      this._end("won");
      return;
    }
    const cp = this.checkpoint;
    if (cp && !cp.arrived) {
      cp.arrived = true;
      cp.t = CHECKPOINT_TIME;
      if (cp.ev.bonus) this._gain(cp.ev.bonus, "checkpoint");
      let unlocked = null;
      if (cp.ev.unlock && !this.modules.includes(cp.ev.unlock)) {
        this.modules.push(cp.ev.unlock);
        unlocked = cp.ev.unlock;
      }
      this.events.push({ type: "checkpoint", name: cp.ev.name, bonus: cp.ev.bonus || 0, unlock: unlocked });
      this._emitHud(true);
    }
  }

  /** player CONTINUE at a checkpoint (field must be clear) */
  depart() {
    const cp = this.checkpoint;
    if (!this.active || !cp || !cp.arrived) return { ok: false, reason: "none" };
    if (this._liveEnemies() > 0 || this.schedule.length) return { ok: false, reason: "threat" };
    this._leaveCheckpoint();
    return { ok: true };
  }

  _leaveCheckpoint() {
    this.checkpoint = null;
    this.stopAt = null;
    this.travel = "cruise";
    this.events.push({ type: "depart" });
    this._emitHud(true);
  }

  /* ========================================================== timeline */
  _blockedBy() {
    // spawns are suppressed while a committed bridge/tunnel is near the train
    const { front, rear } = this.train;
    for (const f of this.features) {
      const s = f.start - this.d;
      const e = f.end - this.d;
      if (s < front + 70 && e > rear - 30) return f;
    }
    return null;
  }

  _stepTimeline() {
    // set pieces: commit once calm, snapped to scenery tiles
    for (const ev of this.timeline) {
      if ((ev.type !== "bridge" && ev.type !== "tunnel") || ev.done) continue;
      if (ev.at - this.d > FEATURE_LOOKAHEAD) continue;
      const calm = this._liveEnemies() === 0 && this.schedule.length === 0 && !(this.final && this.final.triggered && !this.final.resolved);
      const nextStop = this.stations.find((s) => s.at > this.d - 20);
      const start = Math.ceil(ev.at / TILE) * TILE;
      const end = start + Math.ceil(ev.len / TILE) * TILE;
      const clashStop = (nextStop && nextStop.at > start - 90 && nextStop.at < end + 120) || (this.destination && this.destination.at < end + 160);
      const clashFeature = this.features.find((f) => start < f.end + TILE * 2 && end > f.start - TILE * 2);
      // ≥160 ahead: beyond the streamed scenery, so a tile never visibly swaps
      if (!calm || clashStop || clashFeature || this.stopAt != null || start - this.d < 160) {
        ev.at = Math.max(ev.at, this.d) + TILE; // defer
        if (clashStop && nextStop) ev.at = Math.max(ev.at, nextStop.at + 90);
        if (clashFeature) ev.at = Math.max(ev.at, clashFeature.end + TILE * 2);
        continue;
      }
      ev.done = true;
      this.features.push({ id: this.nextId++, kind: ev.type, start, end });
    }
    this.features = this.features.filter((f) => f.end - this.d > -260);

    // waves / checkpoints / final — strictly in order
    while (this.evIdx < this.timeline.length) {
      const ev = this.timeline[this.evIdx];
      if (ev.type === "bridge" || ev.type === "tunnel") {
        this.evIdx++;
        continue;
      }
      if (this.d < ev.at - (ev.type === "checkpoint" ? BRAKE_DIST + 2 : 0)) break;
      if (ev.type === "wave" || ev.type === "final") {
        if (this._blockedBy() || this.stopAt != null) break;
      }
      if (ev.type === "checkpoint") {
        // the train brakes into the station; arrival is handled in _arrived
        this.checkpoint = { ev, arrived: false, t: CHECKPOINT_TIME };
        this.stopAt = ev.at;
        this.events.push({ type: "approach", name: ev.name });
        this.evIdx++;
        break;
      }
      this.evIdx++;
      if (ev.type === "wave") {
        this._queueGroups(ev.groups, 0);
        this.events.push({ type: "wave", name: ev.name, intro: ev.intro || null });
      } else if (ev.type === "final") {
        this.final.triggered = true;
        this.final.ev = ev;
        if (ev.boss) {
          this.final.bossId = ev.boss;
          // bosses open on the far (left) side: fully in view, never covering the train
          const side = -1;
          this.schedule.push({ t: WARN_TIME + 1.4, boss: ev.boss, side, warned: false, bossWarn: true });
          this.events.push({ type: "bossWarn", boss: ev.boss, side });
        } else this.events.push({ type: "wave", name: ev.name || "Final assault", final: true });
        this._queueGroups(ev.groups, ev.boss ? 2 : 0);
      }
    }

    // checkpoint countdown runs with a clear field; a station is never a
    // trap — after CHECKPOINT_HOLD s stopped the train pulls out regardless
    const cp = this.checkpoint;
    if (cp && cp.arrived) {
      cp.stopped = (cp.stopped || 0) + STEP;
      if (this._liveEnemies() === 0 && this.schedule.length === 0) cp.t -= STEP;
      else if (cp.stopped > CHECKPOINT_HOLD) cp.t = Math.min(cp.t, 5) - STEP;
      if (cp.t <= 0) this._leaveCheckpoint();
    }
  }

  _queueGroups(groups, extraDelay) {
    let gi = 0;
    for (const g of groups || []) {
      gi++;
      for (let k = 0; k < g.count; k++) {
        this.schedule.push({ t: WARN_TIME + extraDelay + g.delay + k * g.interval, enemy: g.enemy, side: g.side, pos: g.pos, group: `${this.loadId}-${this.nextId}-${gi}`, first: k === 0, warned: false });
      }
    }
    this.nextId++;
    this.schedule.sort((a, b) => a.t - b.t);
  }

  _stepSchedule(dt) {
    if (!this.schedule.length) return;
    const blocked = !!this._blockedBy();
    for (const s of this.schedule) {
      if (blocked && !s.boss) continue;
      s.t -= dt;
      if (!s.warned && s.t <= WARN_TIME) {
        s.warned = true;
        if (s.first || s.boss) {
          const p = this._spawnPoint(s.side, s.pos, s.boss);
          if (s.group) this.groupPts.set(s.group, p);
          this.events.push({ type: "warn", side: s.side, x: p.x, z: p.z, enemy: s.enemy || s.boss, boss: !!s.boss, group: s.group });
        }
      }
    }
    while (this.schedule.length && this.schedule[0].t <= 0) {
      if (this._liveEnemies() >= MAX_ENEMIES && !this.schedule[0].boss) break;
      const s = this.schedule.shift();
      if (s.boss) this._spawnBoss(s.boss, s.side);
      else {
        // the whole group arrives where its warning marker was shown
        const gp = this.groupPts.get(s.group);
        const at = gp ? { x: gp.x + (this.rand() - 0.5) * 3, z: gp.z + Math.sign(gp.z) * this.rand() * 2 } : null;
        this._spawnEnemy(s.enemy, s.side, s.pos, at);
      }
    }
  }

  _spawnPoint(side, pos, boss) {
    const { front, rear } = this.train;
    const r = this.rand;
    let x;
    if (pos === "front") x = front - 3;
    else if (pos === "rear") x = rear + 3;
    else x = (front + rear) / 2;
    x += (r() - 0.5) * 4;
    if (boss) {
      if (BOSSES[boss]?.rail) return { x: rear - 34, z: BOSS_RAIL_Z };
      return { x: rear - 30, z: (side === "left" ? -1 : 1) * 7 };
    }
    if (side === "left") return { x, z: -SPAWN_Z - r() * 2 };
    if (side === "right") return { x, z: SPAWN_Z + r() * 2 };
    const zs = (r() < 0.5 ? -1 : 1) * (5 + r() * 4);
    if (side === "ahead") return { x: front + AHEAD_X + r() * 6, z: zs };
    return { x: rear - AHEAD_X - r() * 6, z: zs };
  }

  /* ============================================================ enemies */
  _liveEnemies() {
    let n = 0;
    for (const e of this.enemies) if (e.state !== "DYING") n++;
    return n;
  }

  _spawnEnemy(type, side, pos, at) {
    const def = ENEMIES[type];
    if (!def) return null;
    const p = at || this._spawnPoint(side, pos);
    const hp = Math.round(def.hp * (this.route?.hpScale || 1));
    const e = {
      id: this.nextId++,
      type,
      boss: false,
      def,
      x: p.x,
      z: p.z,
      vx: 0,
      vz: 0,
      side: p.z >= 0 ? 1 : -1,
      hp,
      maxHp: hp,
      armor: def.armor,
      radius: def.radius,
      state: "APPROACH",
      target: -1,
      slot: 0,
      cd: 0.6 + this.rand() * 0.6,
      atkT: -1,
      struck: false,
      hitT: 0,
      deadT: 0,
      rewarded: false,
      gvx: this.v,
      gvz: 0,
      facing: 0,
      wheel: 0,
      bornT: this.time,
    };
    this.enemies.push(e);
    this.enemyById.set(e.id, e);
    this._pickTarget(e);
    this.events.push({ type: "spawn", id: e.id, enemy: type, x: e.x, z: e.z });
    return e;
  }

  _spawnBoss(id, side) {
    const def = BOSSES[id];
    const p = this._spawnPoint(side > 0 ? "right" : "left", "rear", id);
    const hp = Math.round(def.hp * (1 + ((this.route?.hpScale || 1) - 1) * 0.6));
    const b = {
      id: this.nextId++,
      type: id,
      boss: true,
      def,
      x: p.x,
      z: p.z,
      vx: 0,
      vz: 0,
      side: def.rail ? -1 : side,
      hp,
      maxHp: hp,
      armor: def.armor,
      radius: def.radius,
      state: "APPROACH",
      target: -1,
      slot: 0,
      cd: 0,
      atkT: -1,
      hitT: 0,
      deadT: 0,
      rewarded: false,
      gvx: this.v,
      gvz: 0,
      facing: 0,
      wheel: 0,
      bornT: this.time,
      ab: def.abilities.map((a) => ({ ...a, t: a.first ?? a.every ?? 0, done: false })),
      rate: 1,
      ventT: 0,
      switching: 0, // 0 none, 1 heading behind the train, 2 coming up the other side
      shellIdx: 0,
      phase2: false,
    };
    this.enemies.push(b);
    this.enemyById.set(b.id, b);
    this.boss = b;
    this.final.bossId = id;
    this.run.bossSeen = id;
    this.events.push({ type: "bossSpawn", id: b.id, boss: id, x: b.x, z: b.z });
    this._emitHud(true);
    return b;
  }

  /** deterministic target rules (see data/enemies.js) */
  _pickTarget(e) {
    const cars = this.cars;
    let best = -1;
    const rule = e.boss ? "nearest" : e.def.target;
    if (rule === "loco" && cars[0].hp > 0) best = 0;
    else if (rule === "weakest") {
      let bf = Infinity;
      for (const c of cars) {
        if (c.hp <= 0) continue;
        const f = c.hp / c.maxHp + (c.module && c.module.type !== "repair" ? 0.05 : 0) + Math.abs(c.x - e.x) * 0.002;
        if (f < bf) {
          bf = f;
          best = c.index;
        }
      }
    }
    if (best < 0) {
      let bd = Infinity;
      for (const c of cars) {
        if (c.hp <= 0) continue;
        const d = Math.abs(c.x - e.x) + c.index * 1e-3;
        if (d < bd) {
          bd = d;
          best = c.index;
        }
      }
    }
    e.target = best;
    // slot: spread attackers sharing a car side
    if (best >= 0) {
      const used = new Set();
      for (const o of this.enemies) if (o !== e && o.state !== "DYING" && o.target === best && o.side === e.side && !o.boss) used.add(o.slot);
      let s = 0;
      while (used.has(s) && s < SLOTS.length - 1) s++;
      e.slot = s;
    }
  }

  /** where an enemy wants to be (train frame) */
  _slotPos(e, out) {
    const car = this.cars[e.target];
    if (e.boss) {
      const def = e.def;
      const { front, rear } = this.train;
      const mid = (front + rear) / 2;
      if (def.rail) {
        out.x = mid + Math.sin(this.time * 0.18) * Math.max(2, (front - rear) * 0.25);
        out.z = BOSS_RAIL_Z;
        return out;
      }
      if (e.switching === 1 || e.switching === 2) {
        // cross BEHIND the train: first to our side of the track, then over
        out.x = rear - 10;
        out.z = (e.switching === 1 ? e.side : -e.side) * 3;
        return out;
      }
      out.x = mid + Math.sin(this.time * 0.22 + e.id) * Math.max(2, (front - rear) * 0.3);
      out.z = e.side * (HALF_W + def.hold);
      return out;
    }
    if (!car) {
      out.x = e.x;
      out.z = e.z;
      return out;
    }
    const a = e.def.attack;
    const half = car.len / 2 - 0.6;
    if (a.kind === "ranged") {
      out.x = car.x + clamp(SLOTS[e.slot] * 1.4, -half, half);
      const age = this.time - e.bornT;
      out.z = e.side * (HALF_W + Math.max(a.minHold, a.hold - Math.max(0, age - 15) * a.press));
    } else {
      out.x = car.x + clamp(SLOTS[e.slot], -half, half);
      out.z = e.side * (HALF_W + e.radius + 0.12);
    }
    return out;
  }

  _stepEnemies(dt, live) {
    const tgt = { x: 0, z: 0 };
    const { front, rear } = this.train;
    for (const e of this.enemies) {
      if (e.hitT > 0) e.hitT = Math.max(0, e.hitT - dt);
      if (e.state === "DYING") {
        // a wreck stops on the ground → slides back with the scenery
        e.deadT += dt;
        e.vx += (-this.v - e.vx) * Math.min(1, dt * 2.2);
        e.vz *= 1 - Math.min(1, dt * 3);
        e.x += e.vx * dt;
        e.z += e.vz * dt;
        e.gvx = e.vx + this.v;
        e.gvz = e.vz;
        continue;
      }
      if (!live) {
        // battle over: hold position relative to the train, no attacks
        e.atkT = -1;
        if (this.result === "won") {
          e.vx += (-this.v - 3 - e.vx) * Math.min(1, dt * 1.5);
          e.vz += (e.side * 4 - e.vz) * Math.min(1, dt * 1.5);
        } else {
          e.vx *= 1 - Math.min(1, dt * 2);
          e.vz *= 1 - Math.min(1, dt * 2);
        }
        e.x += e.vx * dt;
        e.z += e.vz * dt;
        e.gvx = e.vx + this.v;
        e.gvz = e.vz;
        continue;
      }
      // re-target if our car went down
      if (!e.boss && (e.target < 0 || !this.cars[e.target] || this.cars[e.target].hp <= 0)) {
        this._pickTarget(e);
        if (e.state === "ATTACK") e.state = "APPROACH";
        e.atkT = -1;
      }
      if (e.boss) this._stepBoss(e, dt);
      this._slotPos(e, tgt);
      const dx = tgt.x - e.x;
      const dz = tgt.z - e.z;
      const dist = Math.hypot(dx, dz);
      const def = e.def;
      const maxV = def.speed * (e.boss && e.rate > 1 ? 1.15 : 1);
      const want = Math.min(maxV, dist * 2.2);
      let wx = dist > 1e-4 ? (dx / dist) * want : 0;
      let wz = dist > 1e-4 ? (dz / dist) * want : 0;
      // steer around the train ends instead of through it
      if (!def.rail && Math.abs(e.z) < HALF_W + e.radius + 0.4 && (e.x > front || e.x < rear) && Math.sign(tgt.z) !== Math.sign(e.z || 1)) {
        wz = Math.sign(tgt.z) * maxV * 0.2;
      }
      const ax = clamp(wx - e.vx, -def.accel * dt, def.accel * dt);
      const az = clamp(wz - e.vz, -def.accel * dt, def.accel * dt);
      e.vx += ax;
      e.vz += az;
      e.x += e.vx * dt;
      e.z += e.vz * dt;
      // never inside the train body
      if (!def.rail && e.x < front + e.radius && e.x > rear - e.radius) {
        const minZ = HALF_W + e.radius;
        if (Math.abs(e.z) < minZ) {
          e.z = (e.z >= 0 ? 1 : -1) * minZ;
          if (e.vz * e.z < 0) e.vz = 0;
        }
      }
      e.gvx = e.vx + this.v;
      e.gvz = e.vz;
      if (!e.boss) e.side = e.z >= 0 ? 1 : -1;

      if (e.boss) continue;
      // attack cycle
      const a = def.attack;
      const near = dist < (a.kind === "ranged" ? 1.4 : 0.55);
      if (e.state === "APPROACH" && near) e.state = "ATTACK";
      else if (e.state === "ATTACK" && dist > (a.kind === "ranged" ? 3 : 1.3) && e.atkT < 0) e.state = "APPROACH";
      if (e.cd > 0) e.cd = Math.max(0, e.cd - dt);
      if (e.state === "ATTACK" && e.atkT < 0 && e.cd <= 0) {
        e.atkT = 0;
        e.struck = false;
        this.events.push({ type: "enemySwing", id: e.id, enemy: e.type, kind: a.kind, car: e.target });
      }
      if (e.atkT >= 0) {
        e.atkT += dt;
        if (!e.struck && e.atkT >= a.windup) {
          e.struck = true;
          this._enemyImpact(e);
        }
        if (e.atkT >= a.windup + 0.35) {
          e.atkT = -1;
          e.cd = Math.max(0.1, a.cooldown - a.windup - 0.35);
        }
      }
    }
    // separation (cheap O(n²), n ≤ ~46)
    const list = this.enemies;
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (a.state === "DYING" || a.def.rail) continue;
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        if (b.state === "DYING" || b.def.rail) continue;
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const min = a.radius + b.radius;
        const d2 = dx * dx + dz * dz;
        if (d2 < min * min && d2 > 1e-8) {
          const d = Math.sqrt(d2);
          const push = (min - d) * 0.5;
          const ux = dx / d;
          const uz = dz / d;
          const wa = a.boss ? 0.1 : b.boss ? 0.9 : 0.5;
          a.x -= ux * push * 2 * wa;
          a.z -= uz * push * 2 * wa;
          b.x += ux * push * 2 * (1 - wa);
          b.z += uz * push * 2 * (1 - wa);
        }
      }
    }
    // remove finished wrecks
    if (list.some((e) => e.state === "DYING" && e.deadT >= (e.def.vehicle || e.boss ? DYING_TIME_VEHICLE : DYING_TIME))) {
      this.enemies = list.filter((e) => {
        const keep = !(e.state === "DYING" && e.deadT >= (e.def.vehicle || e.boss ? DYING_TIME_VEHICLE : DYING_TIME));
        if (!keep) this.enemyById.delete(e.id);
        return keep;
      });
    }
  }

  /** the impact frame of a melee/ram swing, or the release of a ranged bolt */
  _enemyImpact(e) {
    if (e.state === "DYING" || e.hp <= 0) return;
    const car = this.cars[e.target];
    if (!car || car.hp <= 0) return;
    const a = e.def.attack;
    if (a.kind === "ranged") {
      const tx = car.x + clamp(e.x - car.x, -car.len / 2 + 0.4, car.len / 2 - 0.4);
      const tz = e.side * HALF_W;
      this._launch({ kind: "ebolt", owner: e.id, car: car.index, x: e.x, y: 1.25, z: e.z, tx, ty: 1.3, tz, speed: a.projectileSpeed, damage: a.damage });
      this.events.push({ type: "enemyShoot", id: e.id, x: e.x, z: e.z });
      return;
    }
    // melee/ram: valid only if really beside the car at the impact moment
    const gapZ = Math.abs(e.z) - HALF_W - e.radius;
    const gapX = Math.abs(e.x - car.x) - car.len / 2;
    if (gapZ > a.reach + 0.35 || gapX > 0.6) return;
    this._damageCar(car, a.damage, e.type, e.x, e.z);
  }

  _stepBoss(b, dt) {
    const frac = b.hp / b.maxHp;
    if (b.ventT > 0) b.ventT = Math.max(0, b.ventT - dt);
    // approach until in position before using abilities
    if (b.state === "APPROACH") {
      const tgt = this._slotPos(b, { x: 0, z: 0 });
      if (Math.hypot(tgt.x - b.x, tgt.z - b.z) < 2.5) {
        b.state = "ENGAGE";
        this.events.push({ type: "bossEngage", id: b.id });
      }
      return;
    }
    if (b.switching === 1 || b.switching === 2) {
      const t = this._slotPos(b, { x: 0, z: 0 });
      if (Math.hypot(t.x - b.x, t.z - b.z) < 1.6) {
        if (b.switching === 1) b.switching = 2;
        else {
          b.side = -b.side;
          b.switching = 3;
        }
      }
      return;
    }
    if (b.switching === 3) {
      const t = this._slotPos(b, { x: 0, z: 0 });
      if (Math.hypot(t.x - b.x, t.z - b.z) < 2.5) b.switching = 0;
      return;
    }
    for (const a of b.ab) {
      if (a.type === "enrage") {
        if (!a.done && frac <= a.at) {
          a.done = true;
          b.rate = a.rate;
          b.phase2 = true;
          this.events.push({ type: "bossEnrage", id: b.id, boss: b.type });
        }
        continue;
      }
      if (a.type === "switch") {
        if (!a.done && frac <= a.at) {
          a.done = true;
          b.switching = 1;
          this.events.push({ type: "bossSwitch", id: b.id, boss: b.type });
        }
        continue;
      }
      if (a.type === "vent") continue;
      a.t -= dt * b.rate;
      if (a.t > 0) continue;
      a.t = a.every;
      if (a.type === "shell") this._bossShell(b, a);
      else if (a.type === "summon") {
        let n = 0;
        for (let k = 0; k < a.count; k++) {
          if (this._liveEnemies() >= MAX_ENEMIES) break;
          const e = this._spawnEnemy(a.enemy, null, null, { x: b.x - 2 - k * 1.6, z: b.z + (b.z > 0 ? 1.5 : -1.5) * (k % 2 ? 1 : 0.4) });
          if (e) {
            e.vx = 2;
            n++;
          }
        }
        if (n) this.events.push({ type: "bossSummon", id: b.id, count: n, x: b.x, z: b.z });
      }
    }
  }

  _bossShell(b, a) {
    // target: the living car nearest the boss, then its neighbours for volleys
    let base = -1;
    let bd = Infinity;
    for (const c of this.cars) {
      if (c.hp <= 0) continue;
      const d = Math.abs(c.x - b.x);
      if (d < bd) {
        bd = d;
        base = c.index;
      }
    }
    if (base < 0) return;
    const order = [0, 1, -1, 2, -2];
    let fired = 0;
    for (let i = 0; i < order.length && fired < a.shots; i++) {
      const c = this.cars[base + order[(i + b.shellIdx) % order.length]];
      if (!c || c.hp <= 0) continue;
      const tz = (b.z >= 0 ? 1 : -1) * 0.4;
      const flight = a.telegraph;
      const mk = { id: this.nextId++, car: c.index, x: c.x, z: tz, t: 0, tmax: flight + fired * 0.25, boss: true };
      this.markers.push(mk);
      this._launch({ kind: "bshell", owner: b.id, car: c.index, x: b.x, y: 2.6, z: b.z, tx: c.x, ty: 1.6, tz, flight: mk.tmax, damage: a.damage, splash: a.splash || 0, marker: mk.id });
      fired++;
    }
    b.shellIdx++;
    this.events.push({ type: "bossFire", id: b.id, boss: b.type, x: b.x, z: b.z, shots: fired });
    const vent = b.ab.find((x) => x.type === "vent");
    if (vent) {
      b.ventT = vent.duration + a.telegraph;
      b.ventMult = vent.mult;
      this.events.push({ type: "bossVent", id: b.id });
    }
  }

  _stepMarkers(dt) {
    if (!this.markers.length) return;
    for (const m of this.markers) m.t += dt;
    this.markers = this.markers.filter((m) => m.t < m.tmax + 0.05);
  }

  /* ============================================================ modules */
  _newModule(type, level, car) {
    return { type, level, cd: 0.5, yaw: car && car.index % 2 ? -Math.PI / 2 : Math.PI / 2, pitch: 0, target: -1, fireT: 0, recoil: 0, builtT: this.time };
  }

  _stepModules(dt, live) {
    for (const car of this.cars) {
      const m = car.module;
      if (!m) continue;
      if (m.recoil > 0) m.recoil = Math.max(0, m.recoil - dt * 4);
      car.repairing = -1;
      if (!live && this.mode !== "showcase" && this.mode !== "demo") continue;
      if (car.disabled) continue;
      if (m.type === "repair") {
        if (live) this._stepRepair(car, m, dt);
        continue;
      }
      if (!live) {
        // showcase/demo: slow idle sweep
        m.yaw += Math.sin(this.time * 0.6 + car.index) * dt * 0.4;
        continue;
      }
      if (m.cd > 0) m.cd = Math.max(0, m.cd - dt);
      const range = stat(m.type, "range", m.level);
      const t = this._acquire(car, m, range);
      m.target = t ? t.id : -1;
      if (!t) continue;
      // aim (turret yaw: rotation.y for a model facing +X)
      let ax = t.x;
      let az = t.z;
      if (m.type === "cannon") {
        const p = this._lead(car, t, MODULES.cannon.projectileSpeed);
        ax = p.x;
        az = p.z;
      }
      const want = Math.atan2(-(az - 0), ax - car.x);
      const d = angDiff(m.yaw, want);
      const turn = TURN[m.type] * dt;
      m.yaw += clamp(d, -turn, turn);
      if (Math.abs(d) > AIM_TOL || m.cd > 0) continue;
      this._fire(car, m, t, ax, az);
    }
  }

  _inRange(car, e, range) {
    if (e.state === "DYING" || e.hp <= 0) return false;
    const d = Math.hypot(e.x - car.x, e.z) - e.radius * 0.6;
    if (d > range) return false;
    return true;
  }

  _acquire(car, m, range) {
    const rule = MODULES[m.type].targetPriority;
    let best = null;
    let bs = -Infinity;
    for (const e of this.enemies) {
      if (!this._inRange(car, e, range)) continue;
      const dist = Math.hypot(e.x - car.x, e.z);
      let s;
      if (rule === "nearest") s = -dist;
      else if (rule === "threat") s = (e.def.threat || 1) * 100 - Math.abs(e.z) * 2 - dist * 0.1;
      else {
        // cluster: enemies inside splash of this one, then armour, then near
        const r = stat("cannon", "splashRadius", m.level);
        let n = 0;
        for (const o of this.enemies) if (o.state !== "DYING" && Math.hypot(o.x - e.x, o.z - e.z) <= r) n++;
        s = n * 100 + (e.armor || 0) * 8 + (e.boss ? 50 : 0) - dist;
      }
      s -= e.id * 1e-6; // deterministic ties
      if (s > bs) {
        bs = s;
        best = e;
      }
    }
    return best;
  }

  /** where a shell should land to meet the target */
  _lead(car, e, speed) {
    let px = e.x;
    let pz = e.z;
    for (let i = 0; i < 2; i++) {
      const dist = Math.hypot(px - car.x, pz);
      const t = dist / speed + 0.05;
      px = e.x + e.vx * t;
      pz = e.z + e.vz * t;
    }
    return { x: px, z: pz };
  }

  _fire(car, m, t, ax, az) {
    const def = MODULES[m.type];
    m.cd = 1 / stat(m.type, "attackSpeed", m.level);
    m.recoil = 1;
    m.fireT = this.time;
    const level = m.level;
    const mx = car.x + Math.cos(m.yaw) * 0.9;
    const mz = -Math.sin(m.yaw) * 0.9;
    const my = RAIL_Y + MOUNT_Y + (m.type === "cannon" ? 0.4 : 0.62);
    const dmg = stat(m.type, "damage", level);
    if (m.type === "cannon") {
      const dist = Math.hypot(ax - mx, az - mz);
      const flight = Math.max(0.35, dist / def.projectileSpeed);
      this._launch({ kind: "shell", owner: car.index, x: mx, y: my, z: mz, tx: ax, ty: 0.3, tz: az, flight, damage: dmg, splash: stat("cannon", "splashRadius", level), level });
    } else {
      this._launch({ kind: m.type === "gunner" ? "tracer" : "bolt", owner: car.index, target: t.id, x: mx, y: my, z: mz, speed: def.projectileSpeed, damage: dmg, level });
    }
    this.events.push({ type: "fire", car: car.index, module: m.type, level, x: mx, y: my, z: mz, yaw: m.yaw });
  }

  _stepRepair(car, m, dt) {
    const reach = stat("repair", "reach", m.level);
    let best = null;
    let bf = 1;
    for (let k = -reach; k <= reach; k++) {
      const c = this.cars[car.index + k];
      if (!c || c.hp >= c.maxHp) continue;
      const f = c.hp / c.maxHp - Math.abs(k) * 1e-4;
      if (f < bf) {
        bf = f;
        best = c;
      }
    }
    if (!best) return;
    car.repairing = best.index;
    const amount = Math.min(best.maxHp - best.hp, stat("repair", "repairRate", m.level) * dt);
    if (amount <= 0) return;
    this._heal(best, amount, "module");
  }

  _heal(c, amount, how) {
    const before = c.hp;
    c.hp = clamp(c.hp + amount, 0, c.maxHp);
    const got = c.hp - before;
    if (got <= 0) return 0;
    c.healedT = 0.3;
    if (this.mode === "play") this.run.repairedHp += got;
    if (c.disabled && c.hp >= c.maxHp * REACTIVATE_AT) {
      c.disabled = false;
      this.events.push({ type: "carRestored", car: c.index });
      this._emitHud(true);
    }
    return got;
  }

  /* ======================================================== projectiles */
  _launch(p) {
    p.id = this.nextId++;
    p.t = 0;
    p.px = p.x;
    p.py = p.y;
    p.pz = p.z;
    p.sx = p.x;
    p.sy = p.y;
    p.sz = p.z;
    p.done = false;
    if (p.kind === "shell" || p.kind === "bshell") {
      const dist = Math.hypot(p.tx - p.x, p.tz - p.z);
      p.arc = Math.max(1.2, dist * (p.kind === "bshell" ? 0.32 : 0.2));
    }
    if (p.kind === "tracer" || p.kind === "bolt") {
      const e = this.enemyById.get(p.target);
      p.lx = e ? e.x : p.x;
      p.lz = e ? e.z : p.z;
    }
    this.projectiles.push(p);
    return p;
  }

  _stepProjectiles(dt) {
    if (!this.projectiles.length) return;
    for (const p of this.projectiles) {
      if (p.done) continue;
      p.px = p.x;
      p.py = p.y;
      p.pz = p.z;
      p.t += dt;
      if (p.kind === "tracer" || p.kind === "bolt") {
        // homing at a stable enemy id; a dead/removed target → fly on to its
        // last known spot and fizzle there (no damage)
        const e = this.enemyById.get(p.target);
        const alive = e && e.state !== "DYING" && e.hp > 0;
        if (alive) {
          p.lx = e.x;
          p.lz = e.z;
        }
        const ty = alive ? (e.def.vehicle ? 1.1 : e.boss ? 1.8 : 0.95) : 0.6;
        const dx = p.lx - p.x;
        const dy = ty - p.y;
        const dz = p.lz - p.z;
        const dist = Math.hypot(dx, dy, dz);
        const stepLen = p.speed * dt;
        if (dist <= stepLen + (alive ? e.radius * 0.5 : 0.05)) {
          p.x = p.lx;
          p.y = ty;
          p.z = p.lz;
          p.done = true;
          if (alive && this.phase === "playing") {
            const dealt = this._damageEnemy(e, p.damage, p.kind === "tracer" ? "gunner" : "lancer");
            this.events.push({ type: "impact", kind: p.kind, x: p.x, y: p.y, z: p.z, enemy: e.id, dmg: dealt, armored: (e.armor || 0) >= 4 });
          } else this.events.push({ type: "fizzle", kind: p.kind, x: p.x, y: p.y, z: p.z });
        } else {
          p.x += (dx / dist) * stepLen;
          p.y += (dy / dist) * stepLen;
          p.z += (dz / dist) * stepLen;
        }
        if (p.t > 3) p.done = true;
        continue;
      }
      if (p.kind === "ebolt") {
        const dx = p.tx - p.x;
        const dy = p.ty - p.y;
        const dz = p.tz - p.z;
        const dist = Math.hypot(dx, dy, dz);
        const s = p.speed * dt;
        if (dist <= s) {
          p.x = p.tx;
          p.y = p.ty;
          p.z = p.tz;
          p.done = true;
          const car = this.cars[p.car];
          if (car && car.hp > 0 && this.phase === "playing") this._damageCar(car, p.damage, "ranged", p.x, p.z);
          this.events.push({ type: "eimpact", x: p.x, y: p.y, z: p.z, car: p.car });
        } else {
          p.x += (dx / dist) * s;
          p.y += (dy / dist) * s;
          p.z += (dz / dist) * s;
        }
        if (p.t > 4) p.done = true;
        continue;
      }
      // ballistic shells (player cannon / boss): parametric arc to an aim point
      const k = Math.min(1, p.t / p.flight);
      p.x = p.sx + (p.tx - p.sx) * k;
      p.z = p.sz + (p.tz - p.sz) * k;
      p.y = p.sy + (p.ty - p.sy) * k + p.arc * 4 * k * (1 - k);
      if (k >= 1) {
        p.done = true;
        if (p.kind === "shell") this._explode(p);
        else this._bossImpact(p);
      }
    }
    this.projectiles = this.projectiles.filter((p) => !p.done);
  }

  /** cannon splash: every living enemy inside the radius is hit ONCE */
  _explode(p) {
    const hits = [];
    if (this.phase === "playing") {
      for (const e of this.enemies) {
        if (e.state === "DYING" || e.hp <= 0) continue;
        const d = Math.hypot(e.x - p.x, e.z - p.z) - e.radius * 0.5;
        if (d > p.splash) continue;
        const fall = d <= p.splash * 0.5 ? 1 : 1 - 0.4 * ((d - p.splash * 0.5) / (p.splash * 0.5));
        hits.push([e, p.damage * fall]);
      }
      for (const [e, dmg] of hits) this._damageEnemy(e, dmg, "cannon");
    }
    this.events.push({ type: "explode", x: p.x, y: 0.2, z: p.z, r: p.splash, hits: hits.length, level: p.level });
  }

  _bossImpact(p) {
    const car = this.cars[p.car];
    if (car && car.hp > 0 && this.phase === "playing") {
      this._damageCar(car, p.damage, "boss", p.tx, p.tz);
      if (p.splash) {
        for (const k of [-1, 1]) {
          const n = this.cars[p.car + k];
          if (n && n.hp > 0) this._damageCar(n, p.damage * 0.4, "boss", n.x, p.tz);
        }
      }
    }
    this.events.push({ type: "bossImpact", x: p.tx, y: 1.4, z: p.tz, car: p.car, splash: !!p.splash });
  }

  /* ============================================================= damage */
  _damageEnemy(e, raw, by) {
    if (!e || e.state === "DYING" || e.hp <= 0 || this.phase !== "playing") return 0;
    let dmg = armorDamage(raw, e.armor || 0);
    if (e.boss && e.ventT > 0) dmg *= e.ventMult || 1;
    const before = e.hp;
    e.hp = clamp(e.hp - dmg, 0, e.maxHp);
    e.hitT = 0.12;
    const dealt = before - e.hp;
    if (e.hp <= 0) this._kill(e, by);
    return dealt;
  }

  _kill(e, by) {
    if (e.state === "DYING") return;
    e.state = "DYING";
    e.deadT = 0;
    e.atkT = -1;
    e.target = -1;
    if (!e.rewarded) {
      e.rewarded = true;
      const reward = Math.round(e.def.reward * (this.route?.rewardScale || 1));
      this._gain(reward, "kill");
      const r = this.run;
      r.kills++;
      r.killsByType[e.type] = (r.killsByType[e.type] || 0) + 1;
      if (e.def.vehicle) r.vehicles++;
      if (e.boss) {
        r.bosses++;
        r.vehicles++;
      }
      this.events.push({ type: "kill", id: e.id, enemy: e.type, boss: e.boss, vehicle: !!(e.def.vehicle || e.boss), x: e.x, z: e.z, reward, by });
    }
    if (e.boss) {
      // telegraphed shells already in the air still land; nothing new fires
      this._emitHud(true);
    }
  }

  _damageCar(car, raw, by, x, z) {
    if (!car || car.hp <= 0 || this.phase !== "playing") return 0;
    const before = car.hp;
    car.hp = clamp(car.hp - raw, 0, car.maxHp);
    car.hitT = 0.25;
    const dealt = before - car.hp;
    this.events.push({ type: "carHit", car: car.index, dmg: dealt, by, x: x ?? car.x, z: z ?? 0 });
    if (car.hp <= 0) {
      if (car.kind === "loco") {
        this.events.push({ type: "locoDestroyed" });
        this._end("lost");
      } else if (!car.disabled) {
        car.disabled = true;
        this.run.wagonsLost++;
        this.events.push({ type: "carDisabled", car: car.index });
      }
    }
    this._emitHud(true);
    return dealt;
  }

  _gain(n, why) {
    if (n <= 0) return;
    this.scrap += n;
    if (this.mode === "play") this.run.scrapEarned += n;
    this.events.push({ type: "scrap", amount: n, why });
  }

  /* ========================================================== the end */
  _checkFinal() {
    const f = this.final;
    if (!f || !f.triggered || f.resolved) return;
    const bossAlive = this.boss && this.boss.state !== "DYING";
    const pendingBoss = this.schedule.some((s) => s.boss);
    if (bossAlive || pendingBoss || this.schedule.length || this._liveEnemies() > 0) return;
    f.resolved = true;
    const at = Math.max(this.route.length, this.d + BRAKE_DIST + 120);
    this.destination = { at, name: this.route.to };
    this.stations.push({ at, name: this.route.to, kind: "destination" });
    this.stopAt = at;
    this.events.push({ type: "finalResolved", boss: f.bossId });
    this._emitHud(true);
  }

  _end(result) {
    if (this.phase !== "playing") return;
    this.phase = "ending";
    this.result = result;
    this.endT = 0;
    this.schedule.length = 0;
    this.markers.length = 0;
    if (result === "lost") {
      this.stopAt = null;
      for (const c of this.cars) if (c.module) c.module.target = -1;
    }
    this.events.push({ type: result === "won" ? "victory" : "defeat" });
    this._emitHud(true);
  }

  _finish() {
    if (this.phase !== "ending") return;
    this.phase = this.result;
    const loco = this.cars[0];
    const frac = loco.hp / loco.maxHp;
    const stars = this.result === "won" ? (frac > 0.8 ? 3 : frac > 0.5 ? 2 : 1) : 0;
    const summary = {
      result: this.result,
      routeId: this.route.id,
      stars,
      locoHp: Math.round(loco.hp),
      locoMax: loco.maxHp,
      wagonsTotal: this.cars.length - 1,
      wagonsSurviving: this.cars.filter((c) => c.kind === "wagon" && !c.disabled).length,
      run: { ...this.run, killsByType: { ...this.run.killsByType }, builtByType: { ...this.run.builtByType } },
    };
    this.summary = summary;
    this._emitHud(true);
    if (this.cb.over) this.cb.over(summary);
  }

  /* ======================================================== player API */
  canAct() {
    return this.mode === "play" && this.phase === "playing";
  }

  buildModule(index, type) {
    if (!this.canAct()) return { ok: false, reason: "inactive" };
    const car = this.cars[index];
    if (!car || car.kind !== "wagon") return { ok: false, reason: "car" };
    if (car.module) return { ok: false, reason: "occupied" };
    const def = MODULES[type];
    if (!def || !this.modules.includes(type)) return { ok: false, reason: "locked" };
    if (this.scrap + 1e-9 < def.cost) return { ok: false, reason: "scrap" };
    this.scrap = Math.max(0, this.scrap - def.cost);
    car.module = this._newModule(type, 1, car);
    this.run.scrapSpent += def.cost;
    this.run.built++;
    this.run.builtByType[type]++;
    this.events.push({ type: "build", car: index, module: type });
    this._emitHud(true);
    return { ok: true };
  }

  upgradeModule(index) {
    if (!this.canAct()) return { ok: false, reason: "inactive" };
    const car = this.cars[index];
    const m = car && car.module;
    if (!m) return { ok: false, reason: "empty" };
    const def = MODULES[m.type];
    if (m.level >= def.maxLevel) return { ok: false, reason: "max" };
    const cost = def.upgradeCost[m.level - 1];
    if (this.scrap + 1e-9 < cost) return { ok: false, reason: "scrap" };
    this.scrap = Math.max(0, this.scrap - cost);
    m.level++;
    this.run.scrapSpent += cost;
    this.run.upgrades++;
    this.events.push({ type: "upgrade", car: index, module: m.type, level: m.level });
    this._emitHud(true);
    return { ok: true, level: m.level };
  }

  /** remove a module for half of what was put into it */
  sellModule(index) {
    if (!this.canAct()) return { ok: false, reason: "inactive" };
    const car = this.cars[index];
    const m = car && car.module;
    if (!m) return { ok: false, reason: "empty" };
    const refund = Math.floor(invested(m.type, m.level) * 0.5);
    car.module = null;
    car.repairing = -1;
    this._gain(refund, "salvage");
    this.run.scrapEarned -= refund; // salvage is not "earned" for statistics
    this.events.push({ type: "sell", car: index, module: m.type, refund });
    this._emitHud(true);
    return { ok: true, refund };
  }

  emergencyRepair(index) {
    if (!this.canAct()) return { ok: false, reason: "inactive" };
    const car = this.cars[index];
    if (!car) return { ok: false, reason: "car" };
    if (car.hp >= car.maxHp - 0.5) return { ok: false, reason: "full" };
    if (this.emergencyCd > 0) return { ok: false, reason: "cooldown" };
    if (this.scrap + 1e-9 < EMERGENCY.cost) return { ok: false, reason: "scrap" };
    this.scrap = Math.max(0, this.scrap - EMERGENCY.cost);
    this.run.scrapSpent += EMERGENCY.cost;
    this.emergencyCd = EMERGENCY.cooldown;
    this.run.repairs++;
    this._heal(car, car.maxHp * EMERGENCY.share, "emergency");
    this.events.push({ type: "emergency", car: index });
    this._emitHud(true);
    return { ok: true };
  }

  /* =============================================================== hud */
  progress() {
    if (this.mode !== "play" || !this.route) return 0;
    if (this.destination) return clamp(this.d / this.destination.at, 0, 1);
    return clamp(this.d / this.route.length, 0, this.final && this.final.triggered ? 0.97 : 0.985);
  }

  hud() {
    const loco = this.cars[0];
    const cp = this.checkpoint;
    const b = this.boss;
    return {
      scrap: Math.floor(this.scrap + 1e-6),
      loco: loco ? { hp: Math.ceil(loco.hp), max: loco.maxHp } : { hp: 0, max: 1 },
      cars: this.cars.map((c) => ({
        index: c.index,
        kind: c.kind,
        hp: Math.ceil(c.hp),
        max: c.maxHp,
        disabled: c.disabled,
        module: c.module ? { type: c.module.type, level: c.module.level } : null,
      })),
      progress: this.progress(),
      d: this.d,
      length: this.destination ? this.destination.at : this.route?.length || 1,
      speed: this.speed,
      paused: this.paused,
      phase: this.phase,
      travel: this.travel,
      modules: this.modules.slice(),
      checkpoint: cp ? { name: cp.ev.name, arrived: cp.arrived, t: Math.ceil(cp.t), clear: this._liveEnemies() === 0 && this.schedule.length === 0 } : null,
      final: this.final ? { triggered: this.final.triggered, resolved: this.final.resolved } : null,
      boss: b ? { type: b.type, hp: Math.ceil(b.hp), max: b.maxHp, dead: b.state === "DYING", vent: b.ventT > 0 } : null,
      enemies: this._liveEnemies(),
      incoming: this.schedule.length,
      emergencyCd: Math.ceil(this.emergencyCd),
      kmh: Math.round(this.v * 9),
    };
  }

  _emitHud(force) {
    if (!this.cb.hud || this.mode === "idle") return;
    const h = this.hud();
    const key = `${h.scrap}|${h.loco.hp}|${h.cars.map((c) => `${c.hp}${c.disabled ? "x" : ""}${c.module ? c.module.type + c.module.level : ""}`).join(",")}|${Math.round(h.progress * 400)}|${h.speed}|${h.paused}|${h.phase}|${h.travel}|${h.modules.join()}|${h.checkpoint ? `${h.checkpoint.arrived}${h.checkpoint.t}${h.checkpoint.clear}` : ""}|${h.boss ? `${h.boss.hp}${h.boss.dead}${h.boss.vent}` : ""}|${h.enemies}|${h.incoming}|${h.emergencyCd}|${h.final ? h.final.triggered + "" + h.final.resolved : ""}`;
    if (!force && key === this._hudKey) return;
    this._hudKey = key;
    this.cb.hud(h);
  }
}
