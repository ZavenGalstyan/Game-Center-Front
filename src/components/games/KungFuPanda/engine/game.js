/**
 * The whole simulation for one mission: hero movement + combat, wolf bandit
 * AI, Tai Lung, items, the mission tracker and win/lose. Framework-free and
 * deterministic for a given seed + input stream (tools/simTest.mjs drives it
 * headless with a bot through real inputs).
 *
 * step(dt, input) advances the world and fills `events` for render/audio/UI.
 * input: { mx, mz (-1..1, camera-relative), dYaw, dPitch, jump, dodge,
 *          punch, kick, special, interact } — the last six are edge presses.
 */
import { HEROES, ENEMIES, MOVES } from "../data/heroes.js";
import { LEVELS } from "../data/levels.js";
import { MISSION_BY_ID, SHIFU_LINES } from "../data/missions.js";
import { buildColliders, resolveActor, buildNav, navDir, cameraClear } from "./world.js";

const GRAV = 24;
const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const angDiff = (a, b) => {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
};
const turnTo = (a, b, max) => a + clamp(angDiff(a, b), -max, max);

function mulberry(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const EMPTY_INPUT = { mx: 0, mz: 0, dYaw: 0, dPitch: 0, jump: false, dodge: false, punch: false, kick: false, special: false, interact: false };
export const PITCH_MIN = -0.12;
export const PITCH_MAX = 1.05;
const CAM_DIST = 6.2;
const DODGE = { dur: 0.4, speed: 10.5, iframes: 0.36, cd: 0.5 };
const HURT_T = 0.36;
const SPECIAL_DUR = { belly: 0.95, dash: 0.62, whirl: 0.86, gust: 0.75, pressure: 0.7, ribbon: 0.8 };

export class Game {
  constructor({ missionId, heroId, seed = 1 }) {
    this.mission = MISSION_BY_ID[missionId];
    if (!this.mission) throw new Error(`unknown mission ${missionId}`);
    this.level = LEVELS[this.mission.level];
    this.hero = HEROES[heroId] || HEROES.po;
    this.col = buildColliders(this.level);
    this.nav = buildNav(this.col);
    this.rand = mulberry(seed);
    this.t = 0;
    this.status = "play"; // play | won | lost
    this.endT = 0;
    this.events = [];
    this.nextId = 1;
    this.prompt = null;
    this.talk = null;
    const s = this.level.spawn;
    const H = this.hero;
    this.player = {
      id: 0, kind: "hero", heroId: H.id, x: s.x, z: s.z, y: 0, vy: 0, vx: 0, vz: 0, kx: 0, kz: 0,
      facing: s.yaw, r: H.r, h: H.h, hp: H.hp, maxHp: H.hp, state: "move", st: 0, speed: 0,
      grounded: true, iframes: 0, flash: 0, combo: 0, queued: null, specialCd: 0, dodgeCd: 0,
      hitDone: 0, dir: { x: 0, z: 1 }, hitSet: null, y0: 0, dead: false,
    };
    this.cam = { yaw: s.yaw, pitch: 0.3, dist: CAM_DIST * H.cam };
    this.enemies = [];
    this.boss = null;
    this.dummies = this.level.dummies.map((d) => ({ ...d, id: this.nextId++, kind: "dummy", r: 0.42, h: 1.7, wob: 0, wobX: 0, wobZ: 0 }));
    this.npcs = this.level.npcs.map((n) => ({ ...n, r: 0.4, h: 0.9 }));
    this.items = this.level.items.map((it, i) => ({ ...it, id: i, taken: false }));
    this.steps = this.mission.steps;
    this.stepI = 0;
    this.counts = this.steps.map(() => 0);
    this.spawned = 0;
    this.spawnT = 0;
    this.cleared = false;
    this.stats = { kills: 0, damageTaken: 0, hits: 0 };
    if (this.mission.id === "valley") for (let i = 0; i < this.mission.maxAlive; i++) this.spawnWolf();
    if (this.level.guards) for (const g of this.level.guards) this.addEnemy("wolf", g.x, g.z, { guard: true, home: { x: g.x, z: g.z } });
    if (this.level.boss) {
      const b = this.level.boss;
      this.boss = this.addEnemy("tailung", b.x, b.z, { facing: b.facing });
      Object.assign(this.boss, { state: "intro", phase: 1, poise: 110, staggerCd: 0, pounceCd: 4, target: { x: 0, z: 0 }, from: { x: 0, z: 0 }, hitDone: 0 });
    }
  }

  /* ============================================================ helpers */
  emit(type, data = {}) {
    this.events.push({ type, ...data });
  }
  get cur() {
    return this.steps[this.stepI] || null;
  }
  bump(id, amount = 1) {
    if (this.cleared || this.status !== "play") return;
    const st = this.cur;
    if (!st || st.id !== id) return;
    this.counts[this.stepI] = Math.min(st.need, this.counts[this.stepI] + amount);
    if (this.counts[this.stepI] >= st.need) {
      this.emit("step", { id, text: st.text });
      this.stepI++;
      if (this.stepI >= this.steps.length) {
        this.cleared = true;
        this.endT = this.mission.id === "arena" ? 3.4 : 1.8;
        this.emit("cleared");
      }
    }
  }
  addEnemy(type, x, z, extra = {}) {
    const D = ENEMIES[type];
    const e = {
      id: this.nextId++, kind: type, x, z, y: 0, vx: 0, vz: 0, kx: 0, kz: 0, facing: extra.facing ?? Math.atan2(this.player.x - x, this.player.z - z),
      r: D.r, h: D.h, hp: D.hp, maxHp: D.hp, state: "chase", st: 0, cd: 0.6 + this.rand() * 0.8, stunT: 0, flash: 0, dead: false,
      token: false, hitDone: 0, strafe: this.rand() < 0.5 ? 1 : -1, speed: 0, alert: !extra.guard, ...extra,
    };
    if (extra.guard) e.state = "idle";
    this.enemies.push(e);
    this.emit("spawn", { id: e.id, kind: type });
    return e;
  }
  spawnWolf() {
    const P = this.player;
    const pts = this.level.enemySpawns.filter((p) => Math.hypot(p.x - P.x, p.z - P.z) >= 10 && !this.enemies.some((e) => !e.dead && Math.hypot(e.x - p.x, e.z - p.z) < 2));
    const pool = pts.length ? pts : this.level.enemySpawns;
    const p = pool[Math.floor(this.rand() * pool.length)];
    this.spawned++;
    return this.addEnemy("wolf", p.x, p.z);
  }
  aliveEnemies() {
    return this.enemies.filter((e) => !e.dead);
  }
  /** Nearest live target in front of the player (soft lock-on for attacks). */
  softTarget(maxD = 4.2, arc = 2.2) {
    const P = this.player;
    let best = null, bs = Infinity;
    for (const t of [...this.aliveEnemies(), ...this.dummies]) {
      const dx = t.x - P.x, dz = t.z - P.z;
      const d = Math.hypot(dx, dz) - t.r;
      if (d > maxD) continue;
      const a = Math.abs(angDiff(P.facing, Math.atan2(dx, dz)));
      if (a > arc / 2 && d > 1.2) continue;
      const score = d + a * 1.2;
      if (score < bs) {
        bs = score;
        best = t;
      }
    }
    return best;
  }

  /* ============================================================ step */
  step(dt, input = EMPTY_INPUT) {
    this.events = [];
    if (this.status !== "play") return this.events;
    dt = Math.min(dt, 1 / 30);
    this.t += dt;
    const inp = { ...EMPTY_INPUT, ...input };

    // camera
    const look = Math.abs(inp.dYaw) + Math.abs(inp.dPitch);
    this.cam.yaw += inp.dYaw;
    this.cam.pitch = clamp(this.cam.pitch + inp.dPitch, PITCH_MIN, PITCH_MAX);
    if (look) this.bump("look", look);

    this.updatePlayer(dt, inp);
    for (const e of this.enemies) {
      if (e.kind === "tailung") this.updateBoss(e, dt);
      else this.updateWolf(e, dt);
    }
    this.separate();
    for (const d of this.dummies) {
      d.wob = Math.max(0, d.wob - dt * 2.2);
    }
    this.enemies = this.enemies.filter((e) => {
      if (e.dead && e.st > 2.6) {
        this.emit("despawn", { id: e.id });
        return false;
      }
      return true;
    });
    this.updateInteract(inp);
    this.updateMission(dt);
    this.updateCamera();
    return this.events;
  }

  /* ============================================================ player */
  updatePlayer(dt, inp) {
    const P = this.player;
    const H = this.hero;
    P.st += dt;
    P.iframes = Math.max(0, P.iframes - dt);
    P.flash = Math.max(0, P.flash - dt);
    P.specialCd = Math.max(0, P.specialCd - dt);
    P.dodgeCd = Math.max(0, P.dodgeCd - dt);

    // camera-relative intent
    const sy = Math.sin(this.cam.yaw), cy = Math.cos(this.cam.yaw);
    let wx = sy * inp.mz - cy * inp.mx;
    let wz = cy * inp.mz + sy * inp.mx;
    const mag = Math.min(1, Math.hypot(wx, wz));
    if (mag > 0.01) {
      const l = Math.hypot(wx, wz);
      wx /= l;
      wz /= l;
    }

    if (P.state === "ko") {
      P.vx *= Math.exp(-6 * dt);
      P.vz *= Math.exp(-6 * dt);
      this.integrate(P, dt, true);
      if (P.st > 2 && this.status === "play") {
        this.status = "lost";
        this.emit("gameover");
      }
      return;
    }

    const busy = P.state !== "move";
    const inAttack = P.state === "punch" || P.state === "kick";
    const attackLate = inAttack && P.st >= MOVES[P.state].dur * 0.55;
    const free = !busy || attackLate;
    const locked = this.cleared;

    // ---- start actions
    if (!locked) {
      if (inp.dodge && P.dodgeCd <= 0 && (free || (inAttack && P.st >= MOVES[P.state].hitT)) && P.state !== "hit") {
        P.state = "dodge";
        P.st = 0;
        P.dir = mag > 0.1 ? { x: wx, z: wz } : { x: Math.sin(P.facing), z: Math.cos(P.facing) };
        P.facing = Math.atan2(P.dir.x, P.dir.z);
        P.iframes = Math.max(P.iframes, DODGE.iframes);
        P.dodgeCd = DODGE.cd;
        P.queued = null;
        this.emit("dodge");
        this.bump("dodge");
      } else if (inp.special && P.specialCd <= 0 && free) {
        this.startAttack("special");
      } else if (inp.kick) {
        if (free) this.startAttack("kick");
        else if (inAttack) P.queued = "kick";
      } else if (inp.punch) {
        if (free) this.startAttack("punch");
        else if (inAttack) P.queued = "punch";
      }
      if (inp.jump && P.grounded && (P.state === "move" || inAttack)) {
        P.vy = H.jump;
        P.grounded = false;
        this.emit("jump");
        this.bump("jump");
      }
    }

    // ---- state behaviour
    let wantVx = 0, wantVz = 0, accel = 14;
    switch (P.state) {
      case "move": {
        const sp = H.speed * (locked ? 0.5 : 1) * mag;
        wantVx = wx * sp;
        wantVz = wz * sp;
        if (mag > 0.1) P.facing = turnTo(P.facing, Math.atan2(wx, wz), 13 * dt);
        if (!P.grounded) accel = 6;
        break;
      }
      case "punch":
      case "kick": {
        const M = MOVES[P.state];
        const dur = P.state === "punch" && P.combo === 3 ? M.dur * 1.45 : M.dur;
        accel = 18;
        if (P.st < M.hitT) {
          const t = P.lockT;
          if (t && !t.dead) {
            P.facing = turnTo(P.facing, Math.atan2(t.x - P.x, t.z - P.z), 20 * dt);
            const gap = Math.hypot(t.x - P.x, t.z - P.z) - t.r - P.r;
            if (gap > 0.7) {
              wantVx = Math.sin(P.facing) * 5;
              wantVz = Math.cos(P.facing) * 5;
            }
          }
        } else if (P.hitDone === 0) {
          P.hitDone = 1;
          const A = H[P.state];
          const fin = P.state === "punch" && P.combo === 3;
          this.attack(P, { range: A.range, arc: A.arc, dmg: Math.round(A.dmg * (fin ? 1.5 : 1)), kb: P.state === "kick" || fin ? 7 : 3.2, stun: P.state === "kick" ? 0.5 : 0.36, move: P.state });
        }
        if (P.st >= dur) {
          const q = P.queued;
          P.queued = null;
          P.state = "move";
          P.st = 0;
          if (q) this.startAttack(q);
        }
        break;
      }
      case "special":
        accel = 20;
        ({ wantVx, wantVz } = this.updateSpecial(P, dt));
        break;
      case "dodge": {
        const k = 1 - (P.st / DODGE.dur) * 0.55;
        wantVx = P.dir.x * DODGE.speed * k;
        wantVz = P.dir.z * DODGE.speed * k;
        accel = 40;
        if (P.st >= DODGE.dur) {
          P.state = "move";
          P.st = 0;
        }
        break;
      }
      case "hit":
        accel = 8;
        if (P.st >= HURT_T) {
          P.state = "move";
          P.st = 0;
        }
        break;
      default:
        P.state = "move";
    }
    const a = 1 - Math.exp(-accel * dt);
    P.vx += (wantVx - P.vx) * a;
    P.vz += (wantVz - P.vz) * a;
    if (P.state === "move" && this.cur?.id === "move" && P.grounded) this.bump("move", Math.hypot(P.vx, P.vz) * dt);
    this.integrate(P, dt, P.state !== "special" || this.hero.special.id !== "belly");
    P.speed = Math.hypot(P.vx, P.vz);
    if (!Number.isFinite(P.x + P.z + P.y + P.vx + P.vz + P.vy)) this.resetPlayerPos();
  }

  integrate(A, dt, gravity) {
    if (gravity) {
      if (!A.grounded || A.y > 0) {
        const g = A === this.player && this.hero.glide && A.vy < 0 ? GRAV * 0.38 : GRAV;
        A.vy -= g * dt;
        A.y += A.vy * dt;
        if (A.y <= 0) {
          A.y = 0;
          if (!A.grounded && A === this.player) this.emit("land");
          A.vy = 0;
          A.grounded = true;
        } else A.grounded = false;
      }
    }
    A.kx *= Math.exp(-7 * dt);
    A.kz *= Math.exp(-7 * dt);
    A.x += (A.vx + A.kx) * dt;
    A.z += (A.vz + A.kz) * dt;
    resolveActor(this.col, A);
  }

  resetPlayerPos() {
    const P = this.player, s = this.level.spawn;
    Object.assign(P, { x: s.x, z: s.z, y: 0, vx: 0, vz: 0, vy: 0, kx: 0, kz: 0, grounded: true, state: "move", st: 0 });
    this.emit("reset");
  }

  startAttack(kind) {
    const P = this.player;
    P.state = kind;
    P.st = 0;
    P.hitDone = 0;
    P.hitSet = null;
    P.lockT = this.softTarget();
    if (P.lockT) P.facing = turnTo(P.facing, Math.atan2(P.lockT.x - P.x, P.lockT.z - P.z), 1.2);
    if (kind === "punch") {
      P.combo = P.combo >= 3 || this.t - (P.lastPunch || 0) > 0.75 ? 1 : P.combo + 1;
      P.lastPunch = this.t;
    }
    if (kind === "special") {
      P.specialCd = this.hero.special.cd;
      P.y0 = P.y;
      P.specialUsedOnDummy = false;
      P.dir = { x: Math.sin(P.facing), z: Math.cos(P.facing) };
      if (this.hero.special.id === "dash") P.iframes = Math.max(P.iframes, 0.5);
      if (this.hero.special.id === "belly") {
        P.grounded = false;
        P.vy = 0;
      }
    }
    this.emit("swing", { move: kind, hero: this.hero.id, combo: P.combo });
  }

  updateSpecial(P, dt) {
    const S = this.hero.special;
    const dur = SPECIAL_DUR[S.id];
    const st = P.st;
    let wantVx = 0, wantVz = 0;
    const once = (flag, fn) => {
      if (!(P.hitDone & flag)) {
        P.hitDone |= flag;
        fn();
      }
    };
    switch (S.id) {
      case "belly": {
        const up = 0.62;
        if (st < up) {
          const p = st / up;
          P.y = P.y0 * (1 - p) + 2.6 * Math.sin(p * Math.PI) * (p < 0.5 ? 1 : 1 - (p - 0.5) * 0.2);
          if (P.lockT && !P.lockT.dead) {
            const dx = P.lockT.x - P.x, dz = P.lockT.z - P.z;
            if (Math.hypot(dx, dz) > 1.2) {
              wantVx = (dx / Math.hypot(dx, dz)) * 3;
              wantVz = (dz / Math.hypot(dx, dz)) * 3;
            }
          }
        } else {
          P.y = 0;
          P.grounded = true;
          once(1, () => {
            this.attack(P, { radius: S.radius, dmg: S.dmg, kb: 10, stun: 0.9, move: "special" });
            this.emit("shock", { x: P.x, z: P.z, r: S.radius, color: "#fff2c0" });
          });
        }
        break;
      }
      case "dash": {
        if (st > 0.08 && st < 0.08 + 0.32) {
          const sp = S.dist / 0.32;
          wantVx = P.dir.x * sp;
          wantVz = P.dir.z * sp;
          // hit everyone the dash passes through, once each
          P.hitSet = P.hitSet || new Set();
          this.attack(P, { radius: 1.5, dmg: S.dmg, kb: 6, stun: 0.7, move: "special", once: P.hitSet });
        }
        break;
      }
      case "whirl":
        [0.18, 0.4, 0.62].forEach((t, i) => {
          if (st >= t) once(1 << i, () => this.attack(P, { radius: S.radius, dmg: S.dmg, kb: i === 2 ? 7 : 2.5, stun: 0.45, move: "special" }));
        });
        if (st >= 0.18) once(8, () => this.emit("shock", { x: P.x, z: P.z, r: S.radius, color: "#ffd27a" }));
        break;
      case "gust":
        if (st >= 0.32)
          once(1, () => {
            this.attack(P, { range: S.range, arc: S.arc, dmg: S.dmg, kb: 13, stun: 0.8, move: "special" });
            this.emit("gust", { x: P.x, z: P.z, facing: P.facing, range: S.range });
          });
        break;
      case "pressure":
        if (st >= 0.3)
          once(1, () => {
            this.attack(P, { range: S.range, arc: S.arc, dmg: S.dmg, kb: 1.5, stun: S.stun, move: "special" });
            this.emit("shock", { x: P.x + Math.sin(P.facing) * 1.4, z: P.z + Math.cos(P.facing) * 1.4, r: 1.8, color: "#b8ff8a" });
          });
        break;
      case "ribbon":
        if (st >= 0.34)
          once(1, () => {
            this.attack(P, { radius: S.radius, dmg: S.dmg, kb: 5, stun: S.stun, move: "special" });
            this.emit("shock", { x: P.x, z: P.z, r: S.radius, color: "#ff9cc4" });
          });
        break;
      default:
        break;
    }
    if (st >= dur) {
      P.state = "move";
      P.st = 0;
      P.y = Math.max(0, P.y);
      if (S.id === "belly") {
        P.y = 0;
        P.grounded = true;
      }
    }
    return { wantVx, wantVz };
  }

  /* ============================================================ combat */
  /**
   * Resolve one attack from `A`. Either a cone (range + arc around A.facing)
   * or a circle (radius). Player attacks hit enemies + dummies; enemy attacks
   * hit the player. Returns the number of targets hit.
   */
  attack(A, o) {
    const fromPlayer = A === this.player;
    const targets = fromPlayer ? [...this.enemies.filter((e) => !e.dead), ...this.dummies] : [this.player];
    let n = 0;
    for (const T of targets) {
      if (o.once && o.once.has(T.id)) continue;
      const dx = T.x - A.x, dz = T.z - A.z;
      const d = Math.hypot(dx, dz);
      if (Math.abs((T.y || 0) - (A.y || 0)) > 1.9) continue;
      if (o.radius != null) {
        if (d > o.radius + T.r) continue;
      } else {
        if (d > o.range + T.r) continue;
        if (d > T.r + 0.45 && Math.abs(angDiff(A.facing, Math.atan2(dx, dz))) > o.arc / 2) continue;
      }
      const ux = d > 1e-4 ? dx / d : Math.sin(A.facing), uz = d > 1e-4 ? dz / d : Math.cos(A.facing);
      if (this.damage(T, o.dmg, ux, uz, o.kb, o.stun, A, o.move)) {
        n++;
        if (o.once) o.once.add(T.id);
      }
    }
    if (fromPlayer && o.move === "special" && n > 0 && this.dummies.length && !A.specialUsedOnDummy) {
      if (this.dummies.some((d) => d.wob > 0.95)) {
        A.specialUsedOnDummy = true;
        this.bump("special");
      }
    }
    return n;
  }

  damage(T, dmg, ux, uz, kb, stun, from, move) {
    if (T.kind === "dummy") {
      T.wob = 1;
      T.wobX = ux;
      T.wobZ = uz;
      this.emit("hit", { x: T.x, y: 1.1, z: T.z, dmg: 0, target: T.id, dummy: true, move });
      if (move === "punch") this.bump("punch");
      if (move === "kick") this.bump("kick");
      return true;
    }
    if (T === this.player) {
      if (T.iframes > 0 || T.dead || this.cleared) return false;
      T.hp = Math.max(0, T.hp - dmg);
      this.stats.damageTaken += dmg;
      T.flash = 0.25;
      T.iframes = 0.6;
      T.kx = ux * kb;
      T.kz = uz * kb;
      this.emit("hurt", { x: T.x, y: T.y + T.h * 0.6, z: T.z, dmg });
      if (T.hp <= 0) {
        T.dead = true;
        T.state = "ko";
        T.st = 0;
        this.emit("ko", { id: 0 });
      } else if (T.state !== "special" || this.hero.special.id !== "belly") {
        T.state = "hit";
        T.st = 0;
        T.queued = null;
      }
      return true;
    }
    // enemies
    if (T.dead) return false;
    if (T.kind === "tailung" && (T.state === "intro" || T.state === "roar")) {
      this.emit("block", { x: T.x, y: 1.6, z: T.z });
      return false;
    }
    T.hp = Math.max(0, T.hp - dmg);
    T.flash = 0.18;
    T.alert = true;
    this.stats.hits++;
    this.emit("hit", { x: T.x, y: T.h * 0.62, z: T.z, dmg, target: T.id, move });
    const boss = T.kind === "tailung";
    T.kx = ux * kb * (boss ? 0.35 : 1);
    T.kz = uz * kb * (boss ? 0.35 : 1);
    if (T.hp <= 0) {
      T.dead = true;
      T.state = "ko";
      T.st = 0;
      T.token = false;
      T.y = 0;
      this.stats.kills++;
      this.emit("ko", { id: T.id, kind: T.kind, x: T.x, z: T.z });
      if (boss) this.bump("boss");
      else this.bump("kills");
      return true;
    }
    if (boss) {
      T.poise -= dmg;
      if (T.phase === 1 && T.hp <= T.maxHp / 2) {
        T.phase = 2;
        T.state = "roar";
        T.st = 0;
        T.y = 0;
        this.emit("phase2");
      } else if (T.poise <= 0 && T.state !== "leap" && T.staggerCd <= 0) {
        T.poise = 110;
        T.staggerCd = 4;
        T.state = "stagger";
        T.st = 0;
        T.y = 0;
      }
    } else {
      // wolves can't be stun-locked: a short immunity follows every stagger,
      // and light punches don't interrupt a wind-up (kicks/specials do)
      const armored = T.stunImm > 0 || (T.state === "windup" && move === "punch" && from.combo !== 3);
      if (!armored || (stun || 0) >= 0.7) {
        T.state = "hurt";
        T.st = 0;
        T.stunT = Math.max(0.32, stun || 0.32);
        T.token = false;
      }
    }
    return true;
  }

  /* ============================================================ wolves */
  updateWolf(e, dt) {
    const P = this.player;
    const D = ENEMIES.wolf;
    e.st += dt;
    e.flash = Math.max(0, e.flash - dt);
    e.cd = Math.max(0, e.cd - dt);
    e.stunImm = Math.max(0, (e.stunImm || 0) - dt);
    if (e.dead) {
      e.vx = e.vz = 0;
      this.integrate(e, dt, false);
      return;
    }
    const dx = P.x - e.x, dz = P.z - e.z;
    const dist = Math.hypot(dx, dz);
    const toP = Math.atan2(dx, dz);
    let wantX = 0, wantZ = 0, sp = 0;
    const calm = this.cleared || P.dead;
    if (calm && e.state !== "hurt") {
      e.state = "idle";
      e.token = false;
    }
    switch (e.state) {
      case "idle": {
        if (!calm && (e.alert || dist < D.aggro)) {
          e.alert = true;
          e.state = "chase";
          e.st = 0;
          this.emit("growl", { id: e.id });
          break;
        }
        const home = e.home || { x: e.x, z: e.z };
        // slow wander around home
        const a = this.t * 0.4 + e.id;
        const gx = home.x + Math.cos(a) * 2, gz = home.z + Math.sin(a) * 2;
        const dir = navDir(this.nav, e.x, e.z, gx, gz);
        if (dir && Math.hypot(gx - e.x, gz - e.z) > 0.5) {
          wantX = dir.x;
          wantZ = dir.z;
          sp = 1.3;
        }
        break;
      }
      case "chase": {
        if (e.home && dist > 16 && Math.hypot(e.x - e.home.x, e.z - e.home.z) > 14) {
          e.state = "idle";
          e.alert = false;
          break;
        }
        const attackers = this.enemies.filter((o) => o.token && !o.dead).length;
        if (dist <= D.range + P.r && e.cd <= 0 && attackers < 2 && P.y < 1.5) {
          e.state = "windup";
          e.st = 0;
          e.token = true;
          this.emit("windup", { id: e.id });
          break;
        }
        if (dist > D.range + P.r - 0.25) {
          const dir = navDir(this.nav, e.x, e.z, P.x, P.z);
          if (dir) {
            wantX = dir.x;
            wantZ = dir.z;
            sp = D.speed;
          }
        } else {
          // hold close and circle a little while waiting for a turn
          wantX = Math.cos(toP) * e.strafe;
          wantZ = -Math.sin(toP) * e.strafe;
          sp = 1.1;
          if (dist < 1.1) {
            wantX -= dx / dist;
            wantZ -= dz / dist;
          }
        }
        e.facing = turnTo(e.facing, toP, 8 * dt);
        break;
      }
      case "windup":
        if (e.st < D.windup * 0.7) e.facing = turnTo(e.facing, toP, 6 * dt);
        if (e.st >= D.windup) {
          e.state = "strike";
          e.st = 0;
          e.hitDone = 0;
        }
        break;
      case "strike":
        if (e.st < 0.12) {
          wantX = Math.sin(e.facing);
          wantZ = Math.cos(e.facing);
          sp = 3.5;
        }
        if (e.st >= 0.1 && !e.hitDone) {
          e.hitDone = 1;
          this.emit("swing", { move: "claw", enemy: e.id });
          this.attack(e, { range: D.range, arc: 1.5, dmg: D.dmg, kb: 4.5, move: "claw" });
        }
        if (e.st >= 0.32) {
          e.state = "recover";
          e.st = 0;
        }
        break;
      case "recover":
        if (e.st >= 0.5) {
          e.state = "chase";
          e.st = 0;
          e.token = false;
          e.cd = D.cd[0] + this.rand() * (D.cd[1] - D.cd[0]);
          if (this.rand() < 0.4) e.strafe *= -1;
        }
        break;
      case "hurt":
        if (e.st >= e.stunT) {
          e.stunImm = 1;
          e.state = calm ? "idle" : "chase";
          e.st = 0;
          e.cd = Math.max(e.cd, 0.35);
        }
        break;
      default:
        e.state = "chase";
    }
    const a = 1 - Math.exp(-10 * dt);
    e.vx += (wantX * sp - e.vx) * a;
    e.vz += (wantZ * sp - e.vz) * a;
    if (sp > 0.5 && e.state !== "chase") e.facing = turnTo(e.facing, Math.atan2(wantX, wantZ), 8 * dt);
    this.integrate(e, dt, false);
    e.speed = Math.hypot(e.vx, e.vz);
    if (!Number.isFinite(e.x + e.z)) {
      e.dead = true;
      e.st = 99;
    }
  }

  /* ============================================================ Tai Lung */
  updateBoss(b, dt) {
    const P = this.player;
    const D = ENEMIES.tailung;
    b.st += dt;
    b.flash = Math.max(0, b.flash - dt);
    b.cd = Math.max(0, b.cd - dt);
    b.pounceCd = Math.max(0, b.pounceCd - dt);
    b.staggerCd = Math.max(0, b.staggerCd - dt);
    if (b.dead) {
      b.vx = b.vz = 0;
      b.y = Math.max(0, b.y - dt * 4);
      this.integrate(b, dt, false);
      b.st = Math.min(b.st, 2); // stays down; never despawns
      return;
    }
    const p2 = b.phase === 2;
    const dx = P.x - b.x, dz = P.z - b.z;
    const dist = Math.hypot(dx, dz);
    const toP = Math.atan2(dx, dz);
    let wantX = 0, wantZ = 0, sp = 0;
    const calm = P.dead || this.cleared;
    switch (b.state) {
      case "intro":
        b.facing = turnTo(b.facing, toP, 3 * dt);
        if (b.st > 0.25 && !b.hitDone) {
          b.hitDone = 1;
          this.emit("roar", { id: b.id });
        }
        if (b.st >= 2.4) {
          b.state = "chase";
          b.st = 0;
          b.cd = 0.6;
        }
        break;
      case "chase": {
        if (calm) break;
        b.facing = turnTo(b.facing, toP, 7 * dt);
        if (b.pounceCd <= 0 && (dist > 5 || this.rand() < 0.012)) {
          b.state = "crouch";
          b.st = 0;
          b.target = { x: P.x, z: P.z };
          this.emit("pounceWarn", { id: b.id });
          break;
        }
        if (dist <= D.range + P.r && b.cd <= 0 && P.y < 1.6) {
          b.state = "windup";
          b.st = 0;
          this.emit("windup", { id: b.id });
          break;
        }
        if (dist > D.range + P.r - 0.3) {
          const dir = navDir(this.nav, b.x, b.z, P.x, P.z);
          if (dir) {
            wantX = dir.x;
            wantZ = dir.z;
            sp = D.speed * (p2 ? 1.15 : 1);
          }
        }
        break;
      }
      case "windup": {
        const w = p2 ? 0.45 : D.windup;
        if (b.st < w * 0.75) b.facing = turnTo(b.facing, toP, 6 * dt);
        if (b.st >= w) {
          b.state = "strike";
          b.st = 0;
          b.hitDone = 0;
        }
        break;
      }
      case "strike":
        // two claw swipes
        if (b.st < 0.5) {
          wantX = Math.sin(b.facing);
          wantZ = Math.cos(b.facing);
          sp = 2.4;
        }
        if (b.st >= 0.08 && !(b.hitDone & 1)) {
          b.hitDone |= 1;
          this.emit("swing", { move: "claw", enemy: b.id });
          this.attack(b, { range: D.range, arc: 1.7, dmg: D.dmg, kb: 5, move: "claw" });
        }
        if (b.st >= 0.4 && !(b.hitDone & 2)) {
          b.hitDone |= 2;
          this.emit("swing", { move: "claw", enemy: b.id });
          this.attack(b, { range: D.range, arc: 1.7, dmg: D.dmg, kb: 6, move: "claw" });
        }
        if (b.st >= 0.72) {
          b.state = "recover";
          b.st = 0;
        }
        break;
      case "recover":
        if (b.st >= (p2 ? 0.45 : 0.6)) {
          b.state = "chase";
          b.st = 0;
          b.cd = (D.cd[0] + this.rand() * (D.cd[1] - D.cd[0])) * (p2 ? 0.7 : 1);
        }
        break;
      case "crouch":
        // the landing ring follows the player during the crouch, then locks
        b.facing = turnTo(b.facing, toP, 6 * dt);
        b.target.x += (P.x - b.target.x) * Math.min(1, dt * 6);
        b.target.z += (P.z - b.target.z) * Math.min(1, dt * 6);
        if (b.st >= 0.8) {
          const R = this.level.bounds.r - 1.6;
          const tl = Math.hypot(b.target.x, b.target.z);
          if (tl > R) {
            b.target.x *= R / tl;
            b.target.z *= R / tl;
          }
          b.from = { x: b.x, z: b.z };
          b.state = "leap";
          b.st = 0;
          this.emit("leap", { id: b.id });
        }
        break;
      case "leap": {
        const T = 0.75;
        const p = Math.min(1, b.st / T);
        b.x = b.from.x + (b.target.x - b.from.x) * p;
        b.z = b.from.z + (b.target.z - b.from.z) * p;
        b.y = 4 * 3.4 * p * (1 - p);
        b.facing = Math.atan2(b.target.x - b.from.x, b.target.z - b.from.z) || b.facing;
        if (p >= 1) {
          b.y = 0;
          b.state = "land";
          b.st = 0;
          this.emit("shock", { x: b.x, z: b.z, r: 3.3, color: "#c8d8ff", heavy: true });
          this.attack(b, { radius: 3.3, dmg: 24, kb: 10, move: "pounce" });
        }
        break;
      }
      case "land":
        if (b.st >= 1.1) {
          b.state = "chase";
          b.st = 0;
          b.pounceCd = p2 ? 6 : 8.5;
          b.cd = 0.4;
        }
        break;
      case "stagger":
        if (b.st >= 0.7) {
          b.state = "chase";
          b.st = 0;
          b.cd = Math.max(b.cd, 0.3);
        }
        break;
      case "roar":
        if (b.st > 0.2 && !(b.hitDone & 4)) {
          b.hitDone |= 4;
          this.emit("roar", { id: b.id });
          if (dist < 5 && !P.dead) {
            P.kx = (dx / (dist || 1)) * 9;
            P.kz = (dz / (dist || 1)) * 9;
          }
        }
        if (b.st >= 1.4) {
          b.state = "chase";
          b.st = 0;
          b.hitDone = 0;
          b.pounceCd = Math.min(b.pounceCd, 2);
        }
        break;
      default:
        b.state = "chase";
    }
    if (b.state !== "leap") {
      const a = 1 - Math.exp(-9 * dt);
      b.vx += (wantX * sp - b.vx) * a;
      b.vz += (wantZ * sp - b.vz) * a;
      this.integrate(b, dt, false);
    } else {
      b.vx = b.vz = 0;
      resolveActor(this.col, b);
    }
    b.speed = Math.hypot(b.vx, b.vz);
  }

  /* ============================================================ crowd */
  separate() {
    const P = this.player;
    const list = [P, ...this.enemies.filter((e) => !e.dead && e.state !== "leap")];
    for (let i = 0; i < list.length; i++)
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j];
        if (Math.abs((a.y || 0) - (b.y || 0)) > 1.4) continue;
        const dx = b.x - a.x, dz = b.z - a.z;
        const min = a.r + b.r;
        const d2 = dx * dx + dz * dz;
        if (d2 >= min * min) continue;
        const d = Math.sqrt(d2) || 1e-3;
        const push = min - d;
        let wa = 0.5;
        if (a === P) wa = b.kind === "tailung" ? 0.75 : 0.3;
        const ux = d2 > 1e-8 ? dx / d : 1, uz = d2 > 1e-8 ? dz / d : 0;
        a.x -= ux * push * wa;
        a.z -= uz * push * wa;
        b.x += ux * push * (1 - wa);
        b.z += uz * push * (1 - wa);
        resolveActor(this.col, a);
        resolveActor(this.col, b);
      }
    for (const d of this.dummies) {
      // dummies are rooted: only the actor moves
      for (const a of list) {
        const dx = a.x - d.x, dz = a.z - d.z;
        const min = a.r + d.r;
        const dd = Math.hypot(dx, dz);
        if (dd < min && dd > 1e-4) {
          a.x = d.x + (dx / dd) * min;
          a.z = d.z + (dz / dd) * min;
        }
      }
    }
    for (const n of this.npcs) {
      const dx = P.x - n.x, dz = P.z - n.z;
      const min = P.r + n.r;
      const dd = Math.hypot(dx, dz);
      if (dd < min && dd > 1e-4) {
        P.x = n.x + (dx / dd) * min;
        P.z = n.z + (dz / dd) * min;
      }
    }
  }

  /* ============================================================ interact */
  updateInteract(inp) {
    const P = this.player;
    let best = null, bd = 2.1;
    for (const n of this.npcs) {
      const d = Math.hypot(n.x - P.x, n.z - P.z);
      if (d < bd + 0.4) {
        bd = d;
        best = { kind: "npc", ref: n, text: "Talk to Master Shifu" };
      }
    }
    for (const it of this.items) {
      if (it.taken) continue;
      const d = Math.hypot(it.x - P.x, it.z - P.z);
      if (d < bd) {
        bd = d;
        best = { kind: it.kind, ref: it, text: it.kind === "scroll" ? "Pick up the scroll" : "Eat dumplings (+40 HP)" };
      }
    }
    this.prompt = P.dead || this.cleared ? null : best;
    if (!inp.interact || !this.prompt) return;
    const it = this.prompt.ref;
    if (this.prompt.kind === "npc") {
      if (this.cur?.id === "shifu") {
        this.talk = { who: "Master Shifu", text: SHIFU_LINES.done };
        this.bump("shifu");
      } else {
        const L = SHIFU_LINES.idle;
        this.talk = { who: "Master Shifu", text: L[Math.floor(this.t) % L.length] };
      }
      this.emit("talk", this.talk);
    } else if (this.prompt.kind === "scroll") {
      it.taken = true;
      this.emit("scroll", { x: it.x, z: it.z, id: it.id });
      this.bump("scrolls");
    } else if (this.prompt.kind === "dumpling") {
      if (P.hp >= P.maxHp) {
        this.emit("full");
        return;
      }
      it.taken = true;
      P.hp = Math.min(P.maxHp, P.hp + 40);
      this.emit("heal", { x: it.x, z: it.z, amount: 40, id: it.id });
    }
  }

  /* ============================================================ mission */
  updateMission(dt) {
    const M = this.mission;
    if (M.id === "valley" && !this.cleared) {
      const alive = this.aliveEnemies().length;
      if (this.spawned < M.totalEnemies && alive < M.maxAlive) {
        this.spawnT += dt;
        if (this.spawnT >= 1.4) {
          this.spawnT = 0;
          this.spawnWolf();
        }
      } else this.spawnT = 0;
    }
    if (this.cleared && this.status === "play" && !this.player.dead) {
      this.endT -= dt;
      if (this.endT <= 0) {
        this.status = "won";
        this.emit("complete", { mission: M.id });
      }
    }
  }

  /** Where nearest objective is (for the compass), or null. */
  objectiveTarget() {
    const P = this.player;
    const st = this.cur;
    if (!st) return null;
    let pts = [];
    if (st.id === "scrolls") pts = this.items.filter((i) => i.kind === "scroll" && !i.taken);
    else if (st.id === "shifu") pts = this.npcs;
    else if (["punch", "kick", "special"].includes(st.id)) pts = this.dummies;
    else if (st.id === "kills" || st.id === "boss") pts = this.aliveEnemies();
    let best = null, bd = Infinity;
    for (const p of pts) {
      const d = Math.hypot(p.x - P.x, p.z - P.z);
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    return best ? { x: best.x, z: best.z, d: bd } : null;
  }

  /* ============================================================ camera */
  updateCamera() {
    const P = this.player;
    const c = this.cam;
    const ty = P.y + Math.max(0.9, this.hero.h * 0.82);
    const fx = Math.sin(c.yaw) * Math.cos(c.pitch);
    const fy = -Math.sin(c.pitch);
    const fz = Math.cos(c.yaw) * Math.cos(c.pitch);
    const want = CAM_DIST * this.hero.cam;
    c.target = { x: P.x, y: ty, z: P.z };
    c.dist = cameraClear(this.col, P.x, ty, P.z, fx, fy, fz, want);
    c.fwd = { x: fx, y: fy, z: fz };
  }
}
