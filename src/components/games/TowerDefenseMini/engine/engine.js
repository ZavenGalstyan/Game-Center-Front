/**
 * Tower Defense Mini — the battle simulation (no Three.js, no React).
 *
 * Timing: `frame(rawDt)` clamps the real frame time (tab switches, debugger
 * pauses and fullscreen transitions can't produce a giant step), multiplies
 * it by the game speed and runs FIXED 1/60 s steps from an accumulator. 2x is
 * therefore exactly twice as many identical steps per real second — movement,
 * cooldowns, slows, projectile flight and spawn timing all scale together.
 *
 * Every transaction is validated here (spot empty? enough coins? max level?)
 * so a double click can never build twice, charge twice or refund twice.
 * Damage goes through ONE function; kills and leaks flip the enemy state
 * exactly once, so rewards and base damage can't be applied twice.
 *
 * The renderer reads `enemies / towers / projectiles` every frame and drains
 * `events` (shots, hits, kills…) for effects and sound. React only receives
 * a small HUD snapshot when one of its numbers changes.
 */
import { TOWERS, towerStats, towerInvestment, sellValue, MAX_LEVEL } from "../data/towers.js";
import { ENEMIES, ENEMY_CODES } from "../data/enemies.js";
import { buildPath, samplePath } from "./path.js";

export const STEP = 1 / 60;
const MAX_FRAME = 0.1;
const MAX_STEPS = 24;
const DYING_TIME = 0.75;
const VICTORY_DELAY = 1.4;
const GROUP_GAP = 1.4;
const TARGET_SLACK = 0.12;

/* -------------------------------------------------------------- waves */
/**
 * Compact wave syntax, groups separated by commas:
 *   "6R/1.2"        6 Raiders, 1.2 s apart
 *   "4S/0.6+3"      4 Scouts starting 3 s into the wave
 *   "1X+8@1"        a boss 8 s in, on road #1
 * A group without "+t" starts GROUP_GAP after the previous group's last spawn.
 */
export function parseWave(str) {
  const groups = [];
  let cursor = 0;
  for (const raw of String(str).split(",")) {
    const g = raw.trim();
    if (!g) continue;
    const m = /^(\d+)([A-Z])(?:\/([\d.]+))?(?:\+([\d.]+))?(?:@(\d))?$/.exec(g);
    if (!m) throw new Error(`Bad wave group "${g}"`);
    const count = +m[1];
    const type = ENEMY_CODES[m[2]];
    if (!type) throw new Error(`Unknown enemy code "${m[2]}"`);
    const gap = m[3] ? +m[3] : 1;
    const start = m[4] !== undefined ? +m[4] : groups.length ? cursor + GROUP_GAP : 0;
    const path = m[5] ? +m[5] : 0;
    groups.push({ type, count, gap, start, path });
    cursor = Math.max(cursor, start + gap * (count - 1));
  }
  const spawns = [];
  for (const g of groups) for (let i = 0; i < g.count; i++) spawns.push({ t: g.start + i * g.gap, type: g.type, path: g.path });
  spawns.sort((a, b) => a.t - b.t);
  const counts = {};
  for (const s of spawns) counts[s.type] = (counts[s.type] || 0) + 1;
  return { groups, spawns, counts, total: spawns.length, boss: spawns.some((s) => ENEMIES[s.type].boss) };
}

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const tmp = { x: 0, z: 0, tx: 1, tz: 0 };
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

function emptyRunStats() {
  return {
    kills: 0,
    killsByType: {},
    towersBuilt: 0,
    towerUse: { archer: 0, cannon: 0, frost: 0, mage: 0 },
    upgrades: 0,
    sold: 0,
    coinsEarned: 0,
    coinsSpent: 0,
    wavesCleared: 0,
    bosses: 0,
    leaks: 0,
    leaksByType: {},
    playMs: 0,
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
    this.realT = 0;
    this.time = 0;
    this.level = null;
    this._clearBattle();
  }

  _clearBattle() {
    this.enemies = [];
    this.enemyById = new Map();
    this.projectiles = [];
    this.towers = [];
    this.spots = [];
    this.paths = [];
    this.waves = [];
    this.phase = "idle"; // build | wave | ending | won | lost
    this.waveNo = 0; // waves started
    this.spawnIdx = 0;
    this.waveT = 0;
    this.endT = 0;
    this.coins = 0;
    this.lives = 0;
    this.maxLives = 0;
    this.acc = 0;
    this.run = emptyRunStats();
    this.summary = null;
    this._hudKey = "";
    this._demoT = 0;
    this.events.length = 0;
    this.version = (this.version || 0) + 1; // renderer rebuilds on change
  }

  /* ------------------------------------------------------------ setup */
  load(level, { demo = false } = {}) {
    this._clearBattle();
    this.level = level;
    this.mode = demo ? "demo" : "play";
    this.paths = level.paths.map((wps) => buildPath(wps));
    this.spots = level.spots.map(([x, z], i) => ({ i, x, z, tower: null }));
    this.waves = level.waves.map(parseWave);
    this.coins = demo ? 99999 : level.coins;
    this.lives = this.maxLives = level.lives;
    this.phase = "build";
    this.rand = rng(level.id * 7919 + 17);
    this.hpScale = level.hpScale || 1;
    this.paused = false;
    if (demo && level.demoTowers) for (const [spot, type, lv] of level.demoTowers) this._place(spot, type, lv, true);
    this.emitHud(true);
  }

  unload() {
    this._clearBattle();
    this.mode = "idle";
    this.level = null;
  }

  setSpeed(s) {
    this.speed = s === 2 ? 2 : 1;
    this.emitHud(true);
  }

  setPaused(p) {
    this.paused = !!p;
  }

  setHidden(h) {
    this.hidden = !!h;
  }

  get active() {
    return this.mode === "play" && (this.phase === "build" || this.phase === "wave" || this.phase === "ending");
  }

  /* ------------------------------------------------------------ actions */
  canAfford(n) {
    return this.coins >= n;
  }

  build(spotIdx, type) {
    if (!this.active) return { ok: false, reason: "inactive" };
    const spot = this.spots[spotIdx];
    if (!spot) return { ok: false, reason: "nospot" };
    if (spot.tower) return { ok: false, reason: "occupied" };
    const T = TOWERS[type];
    if (!T) return { ok: false, reason: "type" };
    const cost = T.levels[0].cost;
    if (this.coins < cost) return { ok: false, reason: "coins" };
    this.coins -= cost;
    this.run.coinsSpent += cost;
    const t = this._place(spotIdx, type, 1, false);
    this.run.towersBuilt++;
    this.run.towerUse[type]++;
    this.events.push({ type: "build", tower: t.id, kind: type, x: t.x, z: t.z });
    this.emitHud(true);
    return { ok: true, tower: t };
  }

  _place(spotIdx, type, level, demo) {
    const spot = this.spots[spotIdx];
    const t = {
      id: this.nextId++,
      type,
      level,
      spot: spotIdx,
      x: spot.x,
      z: spot.z,
      stats: towerStats(type, level),
      cd: 0.25,
      aim: Math.atan2(-spot.x, -spot.z),
      aimTarget: null,
      invested: demo ? 0 : towerInvestment(type, level),
      builtAt: this.realT,
      upgradedAt: -10,
      firedAt: -10,
      kills: 0,
    };
    spot.tower = t;
    this.towers.push(t);
    return t;
  }

  towerById(id) {
    return this.towers.find((t) => t.id === id) || null;
  }

  upgrade(towerId) {
    if (!this.active) return { ok: false, reason: "inactive" };
    const t = this.towerById(towerId);
    if (!t) return { ok: false, reason: "notower" };
    if (t.level >= MAX_LEVEL) return { ok: false, reason: "max" };
    const cost = TOWERS[t.type].levels[t.level].cost;
    if (this.coins < cost) return { ok: false, reason: "coins" };
    this.coins -= cost;
    this.run.coinsSpent += cost;
    this.run.upgrades++;
    t.level++;
    t.invested += cost;
    t.stats = towerStats(t.type, t.level);
    t.upgradedAt = this.realT;
    this.events.push({ type: "upgrade", tower: t.id, kind: t.type, level: t.level, x: t.x, z: t.z });
    this.emitHud(true);
    return { ok: true, tower: t };
  }

  sell(towerId) {
    if (!this.active) return { ok: false, reason: "inactive" };
    const idx = this.towers.findIndex((t) => t.id === towerId);
    if (idx < 0) return { ok: false, reason: "notower" };
    const t = this.towers[idx];
    const refund = sellValue(t.invested);
    this.towers.splice(idx, 1);
    if (this.spots[t.spot] && this.spots[t.spot].tower === t) this.spots[t.spot].tower = null;
    this.coins += refund;
    this.run.sold++;
    this.events.push({ type: "sell", tower: t.id, kind: t.type, refund, x: t.x, z: t.z });
    this.emitHud(true);
    return { ok: true, refund };
  }

  startWave() {
    if (this.mode === "idle" || this.phase !== "build" || this.waveNo >= this.waves.length) return false;
    this.waveNo++;
    this.phase = "wave";
    this.spawnIdx = 0;
    this.waveT = 0;
    const w = this.waves[this.waveNo - 1];
    this.events.push({ type: "waveStart", wave: this.waveNo, boss: w.boss });
    this.emitHud(true);
    return true;
  }

  /* ------------------------------------------------------------ queries */
  currentWave() {
    return this.waves[this.waveNo - 1] || null;
  }

  nextWave() {
    return this.waves[this.waveNo] || null;
  }

  remaining() {
    if (this.phase !== "wave") return 0;
    const w = this.currentWave();
    let active = 0;
    for (const e of this.enemies) if (e.state === "walk") active++;
    return (w ? w.spawns.length - this.spawnIdx : 0) + active;
  }

  hud() {
    const w = this.currentWave();
    const nw = this.nextWave();
    const rem = this.remaining();
    return {
      coins: this.coins,
      lives: this.lives,
      maxLives: this.maxLives,
      wave: this.waveNo,
      waves: this.waves.length,
      phase: this.phase,
      remaining: rem,
      waveTotal: w ? w.total + this._summonedThisWave() : 0,
      next: nw ? { counts: nw.counts, boss: nw.boss, total: nw.total } : null,
      speed: this.speed,
      towers: this.towers.length,
    };
  }

  _summonedThisWave() {
    return this._summons || 0;
  }

  emitHud(force) {
    if (!this.cb.hud) return;
    const h = this.hud();
    const key = `${h.coins}|${h.lives}|${h.wave}|${h.phase}|${h.remaining}|${h.speed}|${h.waveTotal}|${h.towers}`;
    if (!force && key === this._hudKey) return;
    this._hudKey = key;
    this.cb.hud(h);
  }

  /* ------------------------------------------------------------ loop */
  frame(rawDt) {
    const dt = clamp(Number.isFinite(rawDt) ? rawDt : 0, 0, MAX_FRAME);
    this.realT += dt;
    if (this.mode === "idle" || this.paused || this.hidden) return;
    if (this.mode === "play" && this.active) this.run.playMs += dt * 1000;
    this.acc += dt * this.speed;
    let n = 0;
    while (this.acc >= STEP && n < MAX_STEPS) {
      this.step(STEP);
      this.acc -= STEP;
      n++;
    }
    if (n >= MAX_STEPS) this.acc = 0;
    this.emitHud(false);
  }

  /** One fixed step. Public so headless tests can drive it directly. */
  step(h) {
    this.time += h;
    if (this.events.length > 4000) this.events.splice(0, this.events.length - 1000); // nobody draining (headless)
    const over = this.phase === "won" || this.phase === "lost";
    if (!over) {
      if (this.phase === "wave") this._spawn(h);
      this._moveEnemies(h);
      this._towers(h);
      this._projectiles(h);
    }
    this._dying(h);
    if (!over) this._checkWave(h);
    if (this.mode === "demo") this._demo(h);
  }

  _spawn(h) {
    const w = this.currentWave();
    if (!w) return;
    this.waveT += h;
    while (this.spawnIdx < w.spawns.length && w.spawns[this.spawnIdx].t <= this.waveT) {
      const s = w.spawns[this.spawnIdx++];
      this._spawnEnemy(s.type, Math.min(s.path, this.paths.length - 1), 0);
    }
  }

  _spawnEnemy(type, pathIdx, dist) {
    const def = ENEMIES[type];
    const hp = Math.round(def.hp * this.hpScale);
    const spread = def.boss ? 0 : type === "swarmer" ? 0.95 : 0.6;
    const e = {
      id: this.nextId++,
      type,
      def,
      boss: !!def.boss,
      hp,
      maxHp: hp,
      path: pathIdx,
      dist,
      lane: (this.rand() - 0.5) * spread,
      x: 0,
      z: 0,
      heading: 0,
      slow: 0,
      slowT: 0,
      state: "walk",
      t: 0,
      hitT: -10,
      bornAt: this.time,
      summonT: def.summon ? def.summon.every * 0.6 : 0,
      summoned: 0,
      wave: this.waveNo,
    };
    this._placeEnemy(e, true);
    this.enemies.push(e);
    this.enemyById.set(e.id, e);
    if (e.boss) this.events.push({ type: "bossEnter", id: e.id, kind: type });
    return e;
  }

  _placeEnemy(e, snap) {
    const p = this.paths[e.path];
    samplePath(p, e.dist, tmp);
    // lanes pinch to the centre at both ends so enemies come out of the gate and into the base
    const pinch = Math.min(1, e.dist / 2.5, (p.len - e.dist) / 2.5);
    const lane = e.lane * Math.max(0, pinch);
    e.x = tmp.x - tmp.tz * lane;
    e.z = tmp.z + tmp.tx * lane;
    const want = Math.atan2(tmp.tx, tmp.tz);
    if (snap) e.heading = want;
    else {
      let d = want - e.heading;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      e.heading += d * Math.min(1, STEP * 12);
    }
  }

  speedOf(e) {
    return e.def.speed * (1 - e.slow * (1 - e.def.slowResist));
  }

  _moveEnemies(h) {
    for (const e of this.enemies) {
      if (e.state !== "walk") continue;
      if (e.slowT > 0) {
        e.slowT -= h;
        if (e.slowT <= 0) {
          e.slowT = 0;
          e.slow = 0;
        }
      }
      e.dist += this.speedOf(e) * h;
      const p = this.paths[e.path];
      if (e.dist >= p.len) {
        this._escape(e);
        continue;
      }
      this._placeEnemy(e, false);
      const S = e.def.summon;
      if (S && this.mode !== "idle") {
        e.summonT -= h;
        if (e.summonT <= 0 && e.summoned < S.max && e.dist > 3) {
          e.summonT = S.every;
          for (let k = 0; k < S.count && e.summoned < S.max; k++) {
            e.summoned++;
            this._summons = (this._summons || 0) + 1;
            this._spawnEnemy(S.type, e.path, Math.max(0, e.dist - 0.7 - k * 0.45));
          }
          this.events.push({ type: "summon", x: e.x, z: e.z });
        }
      }
    }
  }

  _escape(e) {
    if (e.state !== "walk") return;
    e.state = "gone";
    this.enemyById.delete(e.id);
    this.run.leaks++;
    this.run.leaksByType[e.type] = (this.run.leaksByType[e.type] || 0) + 1;
    if (this.mode === "play") this.lives = Math.max(0, this.lives - e.def.lives);
    this.events.push({ type: "leak", id: e.id, kind: e.type, lives: e.def.lives, x: e.x, z: e.z });
    if (this.mode === "play" && this.lives <= 0) this._lose();
  }

  /** The single damage path. Returns damage dealt. */
  damage(e, raw, armorEff, towerType) {
    if (!e || e.state !== "walk") return 0;
    const armor = clamp(e.def.armor * (1 - clamp(armorEff, 0, 1)), 0, 0.95);
    let d = raw * (1 - armor);
    if (!Number.isFinite(d) || d < 0) d = 0;
    const before = e.hp;
    e.hp = clamp(e.hp - d, 0, e.maxHp);
    const dealt = before - e.hp;
    e.hitT = this.time;
    this.events.push({ type: "dmg", id: e.id, amount: dealt, armored: armor > 0.3, x: e.x, z: e.z, tower: towerType });
    if (e.hp <= 0) this._kill(e, towerType);
    return dealt;
  }

  _kill(e, towerType) {
    if (e.state !== "walk") return;
    e.state = "dead";
    e.t = 0;
    this.enemyById.delete(e.id);
    const reward = e.def.reward;
    if (this.mode === "play") {
      this.coins += reward;
      this.run.coinsEarned += reward;
      this.run.kills++;
      this.run.killsByType[e.type] = (this.run.killsByType[e.type] || 0) + 1;
      if (e.boss) this.run.bosses++;
    }
    this.events.push({ type: "kill", id: e.id, kind: e.type, reward, boss: e.boss, x: e.x, z: e.z, tower: towerType });
  }

  _dying(h) {
    let removed = false;
    for (const e of this.enemies) {
      if (e.state === "dead") {
        e.t += h;
        if (e.t >= DYING_TIME) {
          e.state = "gone";
          removed = true;
        }
      } else if (e.state === "gone") removed = true;
    }
    if (removed) this.enemies = this.enemies.filter((e) => e.state !== "gone");
  }

  /* ------------------------------------------------------------ towers */
  _findTarget(t) {
    const r = t.stats.range + TARGET_SLACK;
    let best = null;
    let bestRem = Infinity;
    for (const e of this.enemies) {
      if (e.state !== "walk") continue;
      const dx = e.x - t.x;
      const dz = e.z - t.z;
      if (dx * dx + dz * dz > r * r) continue;
      const rem = this.paths[e.path].len - e.dist; // FIRST = closest to the base
      if (rem < bestRem || (rem === bestRem && best && e.id < best.id)) {
        bestRem = rem;
        best = e;
      }
    }
    return best;
  }

  _towers(h) {
    for (const t of this.towers) {
      if (t.cd > 0) t.cd = Math.max(0, t.cd - h);
      const target = this._findTarget(t);
      t.aimTarget = target ? target.id : null;
      if (target) {
        const want = Math.atan2(target.x - t.x, target.z - t.z);
        let d = want - t.aim;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        t.aim += d * Math.min(1, h * 14);
      }
      if (t.cd > 0 || !target) continue;
      this._fire(t, target);
      t.cd = 1 / t.stats.attackSpeed;
      t.firedAt = this.realT;
    }
  }

  _fire(t, e) {
    const s = t.stats;
    const kind = TOWERS[t.type].projectile;
    const muzzleY = TOWERS[t.type].muzzle[t.level - 1];
    const fwd = TOWERS[t.type].muzzleFwd;
    const mx = t.x + Math.sin(t.aim) * fwd;
    const mz = t.z + Math.cos(t.aim) * fwd;
    const p = {
      id: this.nextId++,
      kind,
      towerId: t.id,
      towerType: t.type,
      targetId: e.id,
      x: mx,
      y: muzzleY,
      z: mz,
      sx: mx,
      sy: muzzleY,
      sz: mz,
      tx: e.x,
      ty: 0.45,
      tz: e.z,
      speed: s.projectileSpeed,
      dmg: s.damage,
      splash: s.splashRadius,
      slow: s.slowAmount,
      slowDur: s.slowDuration,
      armorEff: s.armorEffectiveness,
      level: t.level,
      t: 0,
      dur: 0,
      lift: 0,
      alive: true,
    };
    if (kind === "cannonball") {
      // lob at where the target WILL be; the splash forgives small errors
      const d0 = Math.hypot(e.x - mx, e.z - mz);
      p.dur = Math.max(0.35, d0 / s.projectileSpeed);
      const fut = this._predict(e, p.dur);
      p.tx = fut.x;
      p.tz = fut.z;
      p.ty = 0.1;
      p.arc = 0.9 + d0 * 0.22;
    }
    this.projectiles.push(p);
    this.events.push({ type: "shot", tower: t.id, kind: t.type, level: t.level, x: mx, z: mz, y: muzzleY, tx: e.x, tz: e.z });
  }

  _predict(e, T) {
    const p = this.paths[e.path];
    const d = Math.min(p.len, e.dist + this.speedOf(e) * T);
    samplePath(p, d, tmp);
    const pinch = Math.min(1, d / 2.5, (p.len - d) / 2.5);
    const lane = e.lane * Math.max(0, pinch);
    return { x: tmp.x - tmp.tz * lane, z: tmp.z + tmp.tx * lane };
  }

  /* ------------------------------------------------------------ projectiles */
  _projectiles(h) {
    let dead = false;
    for (const p of this.projectiles) {
      if (!p.alive) continue;
      p.t += h;
      if (p.kind === "cannonball") {
        const k = Math.min(1, p.t / p.dur);
        p.x = p.sx + (p.tx - p.sx) * k;
        p.z = p.sz + (p.tz - p.sz) * k;
        p.y = p.sy + (p.ty - p.sy) * k;
        p.lift = p.arc * 4 * k * (1 - k);
        if (k >= 1) {
          this._explode(p);
          p.alive = false;
          dead = true;
        }
        continue;
      }
      const e = this.enemyById.get(p.targetId);
      const live = e && e.state === "walk";
      if (live) {
        p.tx = e.x;
        p.tz = e.z;
        p.ty = e.def.aimY || 0.6;
      }
      const dx = p.tx - p.x;
      const dy = p.ty - p.y;
      const dz = p.tz - p.z;
      const dist = Math.hypot(dx, dy, dz);
      const stepLen = p.speed * h;
      const total = Math.hypot(p.tx - p.sx, p.tz - p.sz) || 1;
      if (dist <= stepLen + (live ? e.def.radius * 0.5 : 0.02)) {
        p.x = p.tx;
        p.y = p.ty;
        p.z = p.tz;
        p.alive = false;
        dead = true;
        if (live) this._hit(p, e);
        else this.events.push({ type: "fizzle", kind: p.kind, x: p.x, y: p.y, z: p.z });
        continue;
      }
      p.x += (dx / dist) * stepLen;
      p.y += (dy / dist) * stepLen;
      p.z += (dz / dist) * stepLen;
      if (p.kind === "arrow") {
        const prog = clamp(1 - Math.hypot(p.tx - p.x, p.tz - p.z) / total, 0, 1);
        p.lift = Math.min(0.9, total * 0.12) * 4 * prog * (1 - prog);
      }
    }
    if (dead) this.projectiles = this.projectiles.filter((p) => p.alive);
  }

  _hit(p, e) {
    this.events.push({ type: "hit", kind: p.kind, x: p.x, y: p.y, z: p.z, id: e.id, level: p.level });
    if (p.kind === "frost") {
      const victims = [e];
      if (p.splash > 0) {
        for (const o of this.enemies) {
          if (o === e || o.state !== "walk") continue;
          if (Math.hypot(o.x - e.x, o.z - e.z) <= p.splash + o.def.radius * 0.5) victims.push(o);
        }
      }
      for (const v of victims) {
        // chill never stacks: keep the strongest slow, refresh the longer timer
        v.slow = Math.max(v.slow, p.slow);
        v.slowT = Math.max(v.slowT, p.slowDur);
        this.damage(v, v === e ? p.dmg : p.dmg * 0.5, p.armorEff, p.towerType);
      }
      return;
    }
    this.damage(e, p.dmg, p.armorEff, p.towerType);
  }

  _explode(p) {
    this.events.push({ type: "boom", kind: p.kind, x: p.tx, y: 0.1, z: p.tz, r: p.splash, level: p.level });
    // collect first, then damage: every enemy is hit at most once per blast
    const victims = [];
    for (const e of this.enemies) {
      if (e.state !== "walk") continue;
      if (Math.hypot(e.x - p.tx, e.z - p.tz) <= p.splash + e.def.radius * 0.6) victims.push(e);
    }
    for (const v of victims) this.damage(v, p.dmg, p.armorEff, p.towerType);
  }

  /* ------------------------------------------------------------ waves */
  _checkWave(h) {
    if (this.phase === "ending") {
      this.endT += h;
      if (this.endT >= VICTORY_DELAY) this._win();
      return;
    }
    if (this.phase !== "wave") return;
    const w = this.currentWave();
    if (this.spawnIdx < w.spawns.length) return; // still spawning
    for (const e of this.enemies) if (e.state === "walk") return; // still fighting
    // wave fully resolved
    this.run.wavesCleared = Math.max(this.run.wavesCleared, this.waveNo);
    this._summons = 0;
    if (this.waveNo >= this.waves.length) {
      if (this.mode === "demo") {
        this.waveNo = 0;
        this.phase = "build";
        return;
      }
      this.phase = "ending";
      this.endT = 0;
      this.projectiles = [];
      return;
    }
    const bonus = this.mode === "play" ? (this.level.waveBonus ?? 8) + this.waveNo * 2 : 0;
    if (bonus > 0) {
      this.coins += bonus;
      this.run.coinsEarned += bonus;
    }
    this.phase = "build";
    this.events.push({ type: "waveClear", wave: this.waveNo, bonus });
  }

  _demo(h) {
    if (this.phase !== "build") return;
    this._demoT += h;
    if (this._demoT > 1.8) {
      this._demoT = 0;
      this.startWave();
    }
  }

  stars() {
    const r = this.lives / this.maxLives;
    return r >= 0.8 ? 3 : r >= 0.5 ? 2 : 1;
  }

  _win() {
    if (this.phase === "won" || this.phase === "lost" || this.lives <= 0) return;
    this.phase = "won";
    this._finish("won");
  }

  _lose() {
    if (this.phase === "won" || this.phase === "lost") return;
    this.phase = "lost";
    this.lives = 0;
    // stop the battle safely: no more spawns, shots in flight vanish
    this.projectiles = [];
    this.spawnIdx = this.currentWave() ? this.currentWave().spawns.length : 0;
    this._finish("lost");
  }

  _finish(result) {
    const towersStanding = this.towers.length;
    this.summary = {
      result,
      levelId: this.level.id,
      stars: result === "won" ? this.stars() : 0,
      lives: this.lives,
      maxLives: this.maxLives,
      coins: this.coins,
      wave: this.waveNo,
      waves: this.waves.length,
      towersStanding,
      run: { ...this.run, killsByType: { ...this.run.killsByType }, leaksByType: { ...this.run.leaksByType }, towerUse: { ...this.run.towerUse } },
    };
    this.events.push({ type: result === "won" ? "win" : "lose" });
    this.emitHud(true);
    if (this.cb.over) this.cb.over(this.summary);
  }
}
