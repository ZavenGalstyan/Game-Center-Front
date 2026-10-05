/**
 * Castle Rush — the battle simulation (no Three.js, no React, runs in node).
 *
 * Timing: `frame(rawDt)` clamps the real frame time (tab switches, debugger
 * pauses and fullscreen transitions can't produce a giant step), multiplies
 * it by the game speed and runs FIXED 1/60 s steps from an accumulator. 2x is
 * exactly twice as many identical steps per real second, so movement, attack
 * timing, arrows, gold income and AI decisions all scale together.
 *
 * Lane model: X is the lane (player → +X, enemy → −X), Z is a small sideways
 * spread. No unit may advance past the FRONT-MOST enemy body, so the two
 * armies can never walk through each other; friendlies queue inside their
 * lane or step into a free neighbouring lane. No physics engine.
 *
 * Unit states (explicit, one per unit):
 *   SPAWNING   walking out of the gate (not yet fighting)
 *   MOVING     advancing / holding behind a friend
 *   ATTACKING  weapon travelling — impact (or arrow release) at `windup`
 *   RECOVERING after the impact until the attack cooldown ends
 *   DEFEATED   dying animation, then removed
 * The attack target is either an enemy unit id or the enemy castle; it is
 * re-validated (exists, alive, hostile, in range) at the impact moment, so a
 * swing at a unit that died mid-windup is cancelled instead of landing.
 *
 * Every transaction (deploy, treasury upgrade) is validated here for BOTH
 * sides — the AI goes through the exact same `deploy()` as the player.
 * Damage, kills and castle hits each go through one function and flip state
 * exactly once. The renderer reads units / projectiles / castles every frame
 * and drains `events` for effects and sound.
 */
import { UNITS, KILL_BOUNTY, unitDamage, castleDamage, towerDamage } from "../data/units.js";
import { FIELD, SIDES, DIR, other, ARMY_CAP, STEP, MAX_FRAME, MAX_STEPS, SPAWN_TIME, DYING_TIME, ENDING_TIME, TREASURY, TOWER, CASTLE_ARMOR } from "./constants.js";
import { AIController } from "./ai.js";

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const MELEE_SLACK = 0.3; // extra reach allowed at the impact moment
const LANE_SWITCH_AFTER = 0.35;

export const BASE_INCOME = 10;

function emptyRun() {
  return {
    time: 0,
    deployed: 0,
    deployedByType: { swordsman: 0, archer: 0, shield: 0, knight: 0 },
    kills: 0,
    losses: 0,
    goldEarned: 0,
    goldSpent: 0,
    maxArmy: 0,
    castleHits: 0,
  };
}

export class Engine {
  constructor() {
    this.cb = {};
    this.nextId = 1;
    this.speed = 1;
    this.paused = false;
    this.hidden = false;
    this.mode = "idle"; // idle | play | demo
    this.events = [];
    this.acc = 0;
    this.time = 0;
    this.battle = null;
    this._clear();
  }

  _clear() {
    this.units = [];
    this.unitById = new Map();
    this.projectiles = [];
    this.castles = {
      player: { side: "player", hp: 1, maxHp: 1, destroyed: false, hitT: 0, tower: { cd: 1, aim: 0, aimT: 0 } },
      enemy: { side: "enemy", hp: 1, maxHp: 1, destroyed: false, hitT: 0, tower: { cd: 1, aim: 0, aimT: 0 } },
    };
    this.eco = {
      player: { gold: 0, income: BASE_INCOME, treasury: 0, cooldowns: {} },
      enemy: { gold: 0, income: BASE_INCOME, treasury: 0, cooldowns: {} },
    };
    this.ai = { player: null, enemy: null };
    this.laneCursor = { player: 0, enemy: 0 };
    this.phase = "idle"; // playing | ending | won | lost
    this.winner = null;
    this.endT = 0;
    this.run = emptyRun();
    this.enemyRun = emptyRun();
    this.events.length = 0;
    this.acc = 0;
    this.time = 0;
    this._hudKey = "";
    this._hudT = 0;
  }

  /**
   * battle: entry of data/battles.js. opts.demo → both sides are AI and the
   * castles never fall (menu backdrop).
   */
  load(battle, opts = {}) {
    this._clear();
    this.battle = battle;
    this.loadId = (this.loadId || 0) + 1;
    this.mode = opts.demo ? "demo" : "play";
    this.paused = false;
    const pc = this.castles.player;
    const ec = this.castles.enemy;
    pc.maxHp = pc.hp = Math.max(1, battle.playerHp | 0);
    ec.maxHp = ec.hp = Math.max(1, battle.enemyHp | 0);
    this.eco.player.gold = battle.startGold;
    this.eco.enemy.gold = battle.enemyGold ?? battle.startGold;
    this.roster = { player: battle.playerUnits.slice(), enemy: battle.enemyUnits.slice() };
    this.upgrades = !!battle.upgrades;
    const seed = (battle.id || 1) * 7919 + (opts.seed || 0);
    this.ai.enemy = opts.noAi ? null : new AIController(this, "enemy", opts.demo ? { ...battle.ai, demo: true } : battle.ai, seed);
    if (opts.demo) this.ai.player = new AIController(this, "player", { ...battle.ai, demo: true }, seed * 3 + 1);
    this.phase = "playing";
    this._emitHud(true);
  }

  unload() {
    this._clear();
    this.mode = "idle";
    this.battle = null;
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
    return this.phase === "playing";
  }

  /* ------------------------------------------------------------ clock */
  frame(rawDt) {
    if (this.mode === "idle" || this.paused || this.hidden) return;
    const dt = clamp(Number.isFinite(rawDt) ? rawDt : 0, 0, MAX_FRAME);
    this.acc += dt * this.speed;
    let n = 0;
    while (this.acc >= STEP && n < MAX_STEPS) {
      this.step(STEP);
      this.acc -= STEP;
      n++;
    }
    if (n >= MAX_STEPS) this.acc = 0;
  }

  /** Advance the simulation by exactly `seconds` of game time (tests / sim). */
  simulate(seconds) {
    const steps = Math.round(seconds / STEP);
    for (let i = 0; i < steps; i++) this.step(STEP);
  }

  step(dt) {
    this.time += dt;
    const playing = this.phase === "playing";
    if (playing) {
      if (this.mode === "play") this.run.time += dt;
      for (const side of SIDES) {
        const e = this.eco[side];
        const inc = e.income * dt;
        e.gold += inc;
        if (side === "player") this.run.goldEarned += inc;
        else this.enemyRun.goldEarned += inc;
        for (const k in e.cooldowns) if (e.cooldowns[k] > 0) e.cooldowns[k] = Math.max(0, e.cooldowns[k] - dt);
      }
      if (this.ai.enemy) this.ai.enemy.tick(dt);
      if (this.ai.player) this.ai.player.tick(dt);
    }
    this._stepUnits(dt, playing);
    if (playing) for (const side of SIDES) this._stepTower(side, dt);
    this._stepProjectiles(dt);
    for (const side of SIDES) {
      const c = this.castles[side];
      if (c.hitT > 0) c.hitT = Math.max(0, c.hitT - dt);
    }
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

  /* ------------------------------------------------------------ economy */
  canDeploy(side, type) {
    if (this.phase !== "playing" || this.mode === "idle") return { ok: false, reason: "inactive" };
    const def = UNITS[type];
    if (!def || !this.roster[side].includes(type)) return { ok: false, reason: "locked" };
    const e = this.eco[side];
    if ((e.cooldowns[type] || 0) > 0) return { ok: false, reason: "cooldown" };
    if (this.armySize(side) >= ARMY_CAP) return { ok: false, reason: "cap" };
    if (e.gold + 1e-9 < def.cost) return { ok: false, reason: "gold" };
    return { ok: true };
  }

  /** The ONLY way a soldier enters the battle (player button and AI alike). */
  deploy(side, type) {
    const chk = this.canDeploy(side, type);
    if (!chk.ok) return chk;
    const def = UNITS[type];
    const e = this.eco[side];
    e.gold = Math.max(0, e.gold - def.cost);
    e.cooldowns[type] = def.deployCooldown;
    const run = side === "player" ? this.run : this.enemyRun;
    run.goldSpent += def.cost;
    run.deployed++;
    run.deployedByType[type]++;
    const u = this._spawn(side, type);
    run.maxArmy = Math.max(run.maxArmy, this.armySize(side));
    this.events.push({ type: "deploy", side, unit: type, id: u.id, cost: def.cost });
    this._emitHud(true);
    return { ok: true, id: u.id };
  }

  treasuryCost(side) {
    const lvl = this.eco[side].treasury;
    return lvl < TREASURY.costs.length ? TREASURY.costs[lvl] : null;
  }

  upgradeTreasury(side) {
    if (this.phase !== "playing" || !this.upgrades) return { ok: false, reason: "inactive" };
    const e = this.eco[side];
    const cost = this.treasuryCost(side);
    if (cost == null) return { ok: false, reason: "max" };
    if (e.gold + 1e-9 < cost) return { ok: false, reason: "gold" };
    e.gold = Math.max(0, e.gold - cost);
    e.treasury++;
    e.income = BASE_INCOME + e.treasury * TREASURY.perLevel;
    (side === "player" ? this.run : this.enemyRun).goldSpent += cost;
    this.events.push({ type: "treasury", side, level: e.treasury });
    this._emitHud(true);
    return { ok: true };
  }

  armySize(side) {
    let n = 0;
    for (const u of this.units) if (u.side === side && u.state !== "DEFEATED") n++;
    return n;
  }

  /* ------------------------------------------------------------ units */
  _spawn(side, type) {
    const def = UNITS[type];
    const dir = DIR[side];
    // pick the lane with the most room near the gate (round-robin on ties)
    const lanes = FIELD.lanes;
    let best = -1;
    let bestScore = -Infinity;
    const gx = -dir * FIELD.gateOuterX;
    for (let k = 0; k < lanes.length; k++) {
      const li = (this.laneCursor[side] + k) % lanes.length;
      let crowd = 0;
      for (const o of this.units) if (o.side === side && o.state !== "DEFEATED" && o.lane === li && Math.abs(o.x - gx) < 4) crowd++;
      const score = -crowd * 10 - k * 0.01 - (def.ranged ? 0 : 0);
      if (score > bestScore) {
        bestScore = score;
        best = li;
      }
    }
    this.laneCursor[side] = (best + 1) % lanes.length;
    const u = {
      id: this.nextId++,
      side,
      type,
      dir,
      x: -dir * FIELD.gateInnerX,
      z: lanes[best] * 0.35,
      lane: best,
      hp: def.maxHp,
      maxHp: def.maxHp,
      state: "SPAWNING",
      stateT: 0,
      moving: true,
      vx: 0,
      // attack: target is {kind:'unit', id} or {kind:'castle'}
      target: null,
      atkT: 0,
      struck: false,
      blockedT: 0,
      hurtT: 0,
      lastHitBy: 0,
      deadT: 0,
      walk: 0,
      facing: dir,
      bornAt: this.time,
    };
    this.units.push(u);
    this.unitById.set(u.id, u);
    return u;
  }

  isAlive(u) {
    return !!u && u.state !== "DEFEATED" && u.hp > 0 && this.unitById.get(u.id) === u;
  }

  /** gap between two bodies along the lane (negative = overlapping) */
  _gap(a, b) {
    return Math.abs(b.x - a.x) - (UNITS[a.type].radius + UNITS[b.type].radius);
  }

  /** distance from a unit's body to the enemy castle wall */
  _castleGap(u) {
    const wall = u.dir * FIELD.wallX; // enemy wall face
    return u.dir * (wall - u.x) - UNITS[u.type].radius;
  }

  /** closest living enemy ahead along the lane (the one blocking the route) */
  _frontEnemy(u) {
    let best = null;
    let bd = Infinity;
    for (const o of this.units) {
      if (o.side === u.side || o.state === "DEFEATED") continue;
      const d = u.dir * (o.x - u.x);
      if (d < bd) {
        bd = d;
        best = o;
      }
    }
    return best;
  }

  /** a valid target right now? (exists, alive, hostile, within reach) */
  _validTarget(u, slack = 0) {
    const def = UNITS[u.type];
    const t = u.target;
    if (!t) return false;
    if (t.kind === "castle") {
      const c = this.castles[other(u.side)];
      return !c.destroyed && this.phase === "playing" && this._castleGap(u) <= def.attackRange + slack + 0.05;
    }
    const o = this.unitById.get(t.id);
    if (!o || !this.isAlive(o) || o.side === u.side) return false;
    return this._gap(u, o) <= def.attackRange + slack;
  }

  /** choose what to hit: the enemy blocking the route if in reach, else the castle */
  _acquire(u) {
    const def = UNITS[u.type];
    const fe = this._frontEnemy(u);
    if (fe && this._gap(u, fe) <= def.attackRange) return { kind: "unit", id: fe.id };
    // nobody in reach; any enemy between us and the wall would be closer than
    // the wall itself, so the castle is fair game once the wall is in reach
    if (this.phase === "playing" && this._castleGap(u) <= def.attackRange + 0.05) return { kind: "castle" };
    return null;
  }

  _setState(u, s) {
    u.state = s;
    u.stateT = 0;
  }

  _stepUnits(dt, playing) {
    const units = this.units;
    // 1) state machines
    for (const u of units) {
      const def = UNITS[u.type];
      u.stateT += dt;
      if (u.hurtT > 0) u.hurtT = Math.max(0, u.hurtT - dt);
      u.moving = false;
      u.vx = 0;
      if (u.state === "DEFEATED") {
        u.deadT += dt;
        continue;
      }
      if (u.state === "SPAWNING") {
        this._advance(u, def.moveSpeed * 1.1, dt, true);
        if (u.stateT >= SPAWN_TIME || u.dir * u.x >= -FIELD.gateOuterX) this._setState(u, "MOVING");
        continue;
      }
      if (!playing) {
        // battle decided: the losing army stops, survivors stand and cheer
        if (u.state === "ATTACKING" || u.state === "RECOVERING") {
          u.target = null;
          this._setState(u, "MOVING");
        }
        continue;
      }
      if (u.state === "ATTACKING") {
        u.atkT += dt;
        // a target that died / left mid-windup cancels the swing (no ghost hits)
        if (!this._validTarget(u, MELEE_SLACK)) {
          u.target = null;
          this._setState(u, "MOVING");
          this.events.push({ type: "cancel", id: u.id });
          continue;
        }
        if (!u.struck && u.atkT >= def.windup) {
          u.struck = true;
          this._impact(u);
          this._setState(u, "RECOVERING");
        }
        continue;
      }
      if (u.state === "RECOVERING") {
        u.atkT += dt;
        const targetGone = !this._validTarget(u, MELEE_SLACK);
        const done = u.atkT >= def.attackCooldown || (targetGone && u.atkT >= def.windup + 0.28);
        if (!done) continue;
        u.target = targetGone ? null : u.target;
        // fall through to target selection with the same state machine
        this._setState(u, "MOVING");
      }
      // MOVING: look for something to hit, otherwise advance
      const tgt = this._acquire(u);
      if (tgt) {
        u.target = tgt;
        u.atkT = 0;
        u.struck = false;
        this._setState(u, "ATTACKING");
        const o = tgt.kind === "unit" ? this.unitById.get(tgt.id) : null;
        this.events.push({ type: "swing", id: u.id, unit: u.type, side: u.side, castle: tgt.kind === "castle", target: o ? o.id : 0 });
        continue;
      }
      u.target = null;
      this._advance(u, def.moveSpeed, dt, false);
    }

    // 2) sideways spacing between friends (soft, z only — never pushes along X)
    for (let i = 0; i < units.length; i++) {
      const a = units[i];
      if (a.state === "DEFEATED") continue;
      const ra = UNITS[a.type].radius;
      for (let j = i + 1; j < units.length; j++) {
        const b = units[j];
        if (b.side !== a.side || b.state === "DEFEATED") continue;
        const rs = (ra + UNITS[b.type].radius) * 0.95;
        const dx = Math.abs(a.x - b.x);
        if (dx >= rs) continue;
        const dz = b.z - a.z;
        const adz = Math.abs(dz);
        if (adz >= rs) continue;
        const push = Math.min((rs - adz) * 0.5, 1.6 * dt);
        const s = dz >= 0 ? 1 : -1;
        a.z = clamp(a.z - push * s, -FIELD.roadHalf, FIELD.roadHalf);
        b.z = clamp(b.z + push * s, -FIELD.roadHalf, FIELD.roadHalf);
      }
    }

    // 3) remove finished corpses
    if (units.some((u) => u.state === "DEFEATED" && u.deadT >= DYING_TIME)) {
      this.units = units.filter((u) => {
        if (u.state === "DEFEATED" && u.deadT >= DYING_TIME) {
          this.unitById.delete(u.id);
          return false;
        }
        return true;
      });
    }
  }

  /** move a unit forward without crossing enemies, friends in its lane or the wall */
  _advance(u, speed, dt, spawning) {
    const def = UNITS[u.type];
    const r = def.radius;
    let limit = u.dir * FIELD.wallX - u.dir * (r + 0.02); // own target wall
    // enemy bodies: never closer than touching (gap ≥ 0)
    const fe = this._frontEnemy(u);
    if (fe) {
      const stopGap = def.ranged ? def.attackRange * 0.92 : Math.max(0, def.attackRange * 0.75);
      const lim = fe.x - u.dir * (r + UNITS[fe.type].radius + stopGap);
      if (u.dir * lim < u.dir * limit) limit = lim;
    }
    // castle: ranged units stop at their range from the wall
    if (def.ranged && this.phase === "playing") {
      const lim = u.dir * FIELD.wallX - u.dir * (r + def.attackRange * 0.92);
      if (u.dir * lim < u.dir * limit) limit = lim;
    }
    // friends ahead in (roughly) the same lane
    let blockedByFriend = false;
    for (const o of this.units) {
      if (o === u || o.side !== u.side || o.state === "DEFEATED") continue;
      const ahead = u.dir * (o.x - u.x);
      if (ahead <= 0) continue;
      const rs = r + UNITS[o.type].radius;
      if (Math.abs(o.z - u.z) >= rs * 0.8) continue;
      if (ahead > rs + 1.2) continue;
      const lim = o.x - u.dir * rs;
      if (u.dir * lim < u.dir * limit) {
        limit = lim;
        blockedByFriend = true;
      }
    }
    const want = speed * dt;
    const room = u.dir * (limit - u.x);
    const mv = Math.max(0, Math.min(want, room));
    if (mv > 1e-5) {
      u.x += u.dir * mv;
      u.moving = true;
      u.vx = (u.dir * mv) / dt;
      u.walk += mv;
    }
    u.facing = u.dir;
    // drift toward the lane centre (or a free lane when stuck behind a friend)
    if (blockedByFriend && mv < want * 0.3) u.blockedT += dt;
    else u.blockedT = Math.max(0, u.blockedT - dt * 2);
    if (!spawning && u.blockedT > LANE_SWITCH_AFTER) {
      u.blockedT = 0;
      this._switchLane(u);
    }
    const lz = FIELD.lanes[u.lane];
    const dz = lz - u.z;
    const maxDz = 1.4 * dt;
    u.z += clamp(dz, -maxDz, maxDz);
  }

  _switchLane(u) {
    const r = UNITS[u.type].radius;
    let best = u.lane;
    let bestCrowd = Infinity;
    for (let li = 0; li < FIELD.lanes.length; li++) {
      if (li === u.lane) continue;
      const lz = FIELD.lanes[li];
      if (Math.abs(lz - FIELD.lanes[u.lane]) > 0.9) continue; // neighbours only
      let crowd = 0;
      for (const o of this.units) {
        if (o === u || o.side !== u.side || o.state === "DEFEATED") continue;
        const ahead = u.dir * (o.x - u.x);
        if (ahead > -0.4 && ahead < r + UNITS[o.type].radius + 0.8 && Math.abs(o.z - lz) < 0.7) crowd++;
      }
      if (crowd < bestCrowd) {
        bestCrowd = crowd;
        best = li;
      }
    }
    if (bestCrowd === 0) u.lane = best;
  }

  /** the impact moment of an attack: melee damage or arrow release */
  _impact(u) {
    const def = UNITS[u.type];
    const t = u.target;
    if (def.ranged) {
      this._fire(u, t);
      return;
    }
    if (t.kind === "castle") {
      this._hitCastle(other(u.side), castleDamage(u, CASTLE_ARMOR), u, "melee");
      return;
    }
    const o = this.unitById.get(t.id);
    this._hitUnit(o, unitDamage(u, o), u, "melee");
  }

  _fire(u, t) {
    const sx = u.x + u.dir * 0.35;
    const sy = 1.55 * UNITS[u.type].visualScale;
    let tx;
    let ty;
    let tz;
    if (t.kind === "castle") {
      tx = u.dir * (FIELD.wallX + 0.25);
      ty = 1.4 + ((u.id * 37) % 10) * 0.12;
      tz = clamp(u.z, -1.6, 1.6);
    } else {
      const o = this.unitById.get(t.id);
      tx = o.x;
      ty = 1.1 * UNITS[o.type].visualScale;
      tz = o.z;
    }
    const dist = Math.hypot(tx - sx, tz - u.z);
    const p = {
      id: this.nextId++,
      kind: "arrow",
      side: u.side,
      from: u.id,
      fromType: u.type,
      target: t.kind === "castle" ? { kind: "castle" } : { kind: "unit", id: t.id },
      sx,
      sy,
      sz: u.z,
      tx,
      ty,
      tz,
      x: sx,
      y: sy,
      z: u.z,
      px: sx,
      py: sy,
      pz: u.z,
      t: 0,
      dur: Math.max(0.12, dist / UNITS[u.type].projectileSpeed),
      arc: 0.35 + dist * 0.07,
      done: false,
      // damage is locked at release from the attacker's stats
      dmgUnit: t.kind === "unit" ? unitDamage(u, this.unitById.get(t.id)) : 0,
      dmgCastle: castleDamage(u, CASTLE_ARMOR),
    };
    this.projectiles.push(p);
    this.events.push({ type: "shoot", id: u.id, side: u.side, x: sx, z: u.z });
  }

  /**
   * The wall archer: picks the closest attacker within range of its wall,
   * draws for TOWER.windup (target re-validated at release) and looses one
   * arrow through the shared projectile code.
   */
  _stepTower(side, dt) {
    const c = this.castles[side];
    const tw = c.tower;
    if (c.destroyed) return;
    const wall = -DIR[side] * FIELD.wallX; // own wall face
    const inRange = (o) => o && this.isAlive(o) && o.side !== side && o.state !== "SPAWNING" && Math.abs(o.x - wall) <= TOWER.range + UNITS[o.type].radius;
    if (tw.aim) {
      tw.aimT += dt;
      const o = this.unitById.get(tw.aim);
      if (!inRange(o)) {
        tw.aim = 0;
        return;
      }
      if (tw.aimT >= TOWER.windup) {
        tw.aim = 0;
        tw.cd = TOWER.cooldown - TOWER.windup;
        const sx = wall + DIR[side] * -0.6;
        const sy = TOWER.height;
        const sz = o.z > 0 ? 1.2 : -1.2;
        const dist = Math.hypot(o.x - sx, o.z - sz, sy - 1);
        this.projectiles.push({
          id: this.nextId++,
          kind: "arrow",
          side,
          from: 0,
          fromType: "tower",
          target: { kind: "unit", id: o.id },
          sx,
          sy,
          sz,
          tx: o.x,
          ty: 1.1 * UNITS[o.type].visualScale,
          tz: o.z,
          x: sx,
          y: sy,
          z: sz,
          px: sx,
          py: sy,
          pz: sz,
          t: 0,
          dur: Math.max(0.15, dist / TOWER.projectileSpeed),
          arc: 0.3,
          done: false,
          dmgUnit: towerDamage(TOWER.damage, o),
          dmgCastle: 0,
        });
        this.events.push({ type: "shoot", id: 0, tower: true, side, x: sx, z: sz });
      }
      return;
    }
    if (tw.cd > 0) {
      tw.cd -= dt;
      return;
    }
    let best = null;
    let bd = Infinity;
    for (const o of this.units) {
      if (!inRange(o)) continue;
      const d = Math.abs(o.x - wall);
      if (d < bd) {
        bd = d;
        best = o;
      }
    }
    if (best) {
      tw.aim = best.id;
      tw.aimT = 0;
    }
  }

  _stepProjectiles(dt) {
    if (!this.projectiles.length) return;
    for (const p of this.projectiles) {
      if (p.done) continue;
      p.t += dt;
      // track a living target (no retarget); a dead one keeps its last spot
      if (p.target.kind === "unit") {
        const o = this.unitById.get(p.target.id);
        if (o && this.isAlive(o)) {
          p.tx = o.x;
          p.tz = o.z;
        } else p.target.lost = true;
      }
      const k = Math.min(1, p.t / p.dur);
      p.px = p.x;
      p.py = p.y;
      p.pz = p.z;
      p.x = p.sx + (p.tx - p.sx) * k;
      p.z = p.sz + (p.tz - p.sz) * k;
      p.y = p.sy + (p.ty - p.sy) * k + Math.sin(Math.PI * k) * p.arc;
      if (k >= 1) {
        p.done = true;
        if (p.target.kind === "castle") {
          if (this.phase === "playing") this._hitCastle(other(p.side), p.dmgCastle, null, "arrow", p);
          else this.events.push({ type: "fizzle", x: p.x, y: p.y, z: p.z });
        } else {
          const o = this.unitById.get(p.target.id);
          const by = p.fromType === "tower" ? { id: 0, side: p.side, type: "tower" } : this.unitById.get(p.from) || { id: p.from, side: p.side, type: p.fromType };
          if (!p.target.lost && o && this.isAlive(o)) this._hitUnit(o, p.dmgUnit, by, "arrow");
          else this.events.push({ type: "fizzle", x: p.x, y: p.y, z: p.z });
        }
      }
    }
    this.projectiles = this.projectiles.filter((p) => !p.done);
  }

  _hitUnit(o, dmg, by, kind) {
    if (!o || !this.isAlive(o)) return;
    const d = Number.isFinite(dmg) ? Math.max(0, dmg) : 0;
    o.hp = clamp(o.hp - d, 0, o.maxHp);
    o.hurtT = 0.22;
    o.lastHitBy = by ? by.id : 0;
    this.events.push({ type: "hit", id: o.id, unit: o.type, side: o.side, by: by ? by.type : null, kind, dmg: d, x: o.x, z: o.z, blocked: kind === "arrow" && UNITS[o.type].rangedResistance >= 0.5 });
    if (o.hp <= 0) this._kill(o, by);
  }

  /** exactly once per unit: state flip, bounty, stats, event */
  _kill(o, by) {
    if (o.state === "DEFEATED") return;
    this._setState(o, "DEFEATED");
    o.hp = 0;
    o.deadT = 0;
    o.target = null;
    const killer = other(o.side);
    const bounty = Math.floor(UNITS[o.type].cost * KILL_BOUNTY);
    if (this.phase === "playing") {
      this.eco[killer].gold += bounty;
      if (killer === "player") {
        this.run.kills++;
        this.run.goldEarned += bounty;
        this.enemyRun.losses++;
      } else {
        this.enemyRun.kills++;
        this.enemyRun.goldEarned += bounty;
        this.run.losses++;
      }
    }
    this.events.push({ type: "kill", id: o.id, unit: o.type, side: o.side, by: by ? by.type : null, bounty: this.phase === "playing" ? bounty : 0, x: o.x, z: o.z });
  }

  _hitCastle(side, dmg, by, kind, proj) {
    const c = this.castles[side];
    if (c.destroyed || this.phase !== "playing") return;
    const d = Number.isFinite(dmg) ? Math.max(0, dmg) : 0;
    if (this.mode === "demo") {
      this.events.push({ type: "castleHit", side, dmg: 0, kind, x: proj ? proj.x : by ? by.x : 0, y: proj ? proj.y : 1, z: proj ? proj.z : by ? by.z : 0 });
      c.hitT = 0.25;
      return;
    }
    c.hp = clamp(c.hp - d, 0, c.maxHp);
    c.hitT = 0.25;
    if (side === "enemy") this.run.castleHits++;
    this.events.push({ type: "castleHit", side, dmg: d, kind, x: proj ? proj.x : by ? by.x + by.dir * 0.6 : 0, y: proj ? proj.y : 1.2, z: proj ? proj.z : by ? by.z : 0 });
    if (c.hp <= 0) {
      c.destroyed = true;
      this.phase = "ending";
      this.winner = side === "enemy" ? "player" : "enemy";
      this.endT = 0;
      this.events.push({ type: "castleDestroyed", side });
      this._emitHud(true);
    }
  }

  _finish() {
    if (this.phase !== "ending") return;
    const won = this.winner === "player";
    this.phase = won ? "won" : "lost";
    const pc = this.castles.player;
    const hpFrac = pc.hp / pc.maxHp;
    const stars = won ? (hpFrac >= 0.8 ? 3 : hpFrac >= 0.5 ? 2 : 1) : 0;
    const summary = {
      result: won ? "won" : "lost",
      battleId: this.battle.id,
      stars,
      castleHp: Math.ceil(pc.hp),
      castleMax: pc.maxHp,
      enemyHp: Math.ceil(this.castles.enemy.hp),
      enemyMax: this.castles.enemy.maxHp,
      run: { ...this.run, deployedByType: { ...this.run.deployedByType } },
    };
    this.lastSummary = summary;
    this._emitHud(true);
    if (this.mode === "play" && this.cb.over) this.cb.over(summary);
  }

  /* ------------------------------------------------------------ HUD */
  hud() {
    const e = this.eco.player;
    const pc = this.castles.player;
    const ec = this.castles.enemy;
    const cds = {};
    for (const t of this.roster?.player || []) {
      const c = e.cooldowns[t] || 0;
      cds[t] = c > 0 ? Math.ceil((c / UNITS[t].deployCooldown) * 20) / 20 : 0;
    }
    return {
      gold: Math.floor(e.gold + 1e-6),
      income: e.income,
      treasury: e.treasury,
      treasuryCost: this.treasuryCost("player"),
      upgrades: this.upgrades,
      hp: Math.ceil(pc.hp),
      maxHp: pc.maxHp,
      enemyHp: Math.ceil(ec.hp),
      enemyMax: ec.maxHp,
      army: this.armySize("player"),
      enemyArmy: this.armySize("enemy"),
      cooldowns: cds,
      roster: this.roster?.player || [],
      phase: this.phase,
      time: Math.floor(this.run.time),
      speed: this.speed,
      paused: this.paused,
    };
  }

  _emitHud(force) {
    if (!this.cb.hud || this.mode !== "play") return;
    const h = this.hud();
    const key = JSON.stringify(h);
    if (!force && key === this._hudKey) return;
    this._hudKey = key;
    this.cb.hud(h);
  }
}
