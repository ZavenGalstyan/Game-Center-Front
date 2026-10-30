/**
 * The whole simulation for one mission: turtle movement + combat, Foot Clan
 * AI (patrol → detect → approach → attack), the Shredder, the hostage, pizza
 * pickups, the mission tracker and win/lose. Framework-free and
 * deterministic for a given seed + input stream (tools/simTest.mjs drives it
 * headless with a bot through real inputs).
 *
 * step(dt, input) advances the world and fills `events` for render/audio/UI.
 * input: { mx, mz (-1..1, camera-relative), dYaw, dPitch, jump, dodge,
 *          light, heavy, special, interact } — the last six are edge presses.
 */
import { TURTLES, ENEMIES, MOVES, SPECIAL_DUR, DODGE, COMBO_WINDOW, DIFFICULTY } from "../data/turtles.js";
import { LEVELS } from "../data/levels.js";
import { MISSION_BY_ID, SPLINTER_LINES, CIVILIAN_LINES } from "../data/missions.js";
import { buildColliders, resolveActor, buildNav, navDir, cameraClear, clampBounds, blockedAt } from "./world.js";

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

export const EMPTY_INPUT = { mx: 0, mz: 0, dYaw: 0, dPitch: 0, jump: false, dodge: false, light: false, heavy: false, special: false, interact: false };
export const PITCH_MIN = -0.12;
export const PITCH_MAX = 1.05;
const CAM_DIST = 6;
const HURT_T = 0.36;
const RUSH = { aim: 0.95, aimP2: 0.75, dur: 0.42, len: 10, tired: 1.15, dmg: 22, width: 1.1 };

export class Game {
  constructor({ missionId, heroId, seed = 1, difficulty = "normal" }) {
    this.mission = MISSION_BY_ID[missionId];
    if (!this.mission) throw new Error(`unknown mission ${missionId}`);
    this.level = LEVELS[this.mission.level];
    this.hero = TURTLES[heroId] || TURTLES.leo;
    this.diff = DIFFICULTY[difficulty] || DIFFICULTY.normal;
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
      id: 0, kind: "turtle", heroId: H.id, x: s.x, z: s.z, y: 0, vy: 0, vx: 0, vz: 0, kx: 0, kz: 0,
      facing: s.yaw, r: H.r, h: H.h, hp: H.hp, maxHp: H.hp, state: "move", st: 0, speed: 0,
      grounded: true, iframes: 0, flash: 0, combo: 0, lastLight: -9, queued: null, specialCd: 0, heavyCd: 0, dodgeCd: 0,
      hitDone: 0, dir: { x: 0, z: 1 }, hitSet: null, y0: 0, dead: false, lockT: null,
    };
    this.cam = { yaw: s.yaw, pitch: 0.3, dist: CAM_DIST };
    this.enemies = [];
    this.boss = null;
    this.civ = null;
    this.dummies = this.level.dummies.map((d) => ({ ...d, id: this.nextId++, kind: "dummy", r: 0.42, h: 1.7, wob: 0, wobX: 0, wobZ: 0 }));
    this.npcs = this.level.npcs.map((n) => ({ ...n, r: 0.45, h: 1.2 }));
    this.items = this.level.items.map((it, i) => ({ ...it, id: i, taken: false }));
    this.steps = this.mission.steps;
    this.stepI = 0;
    this.counts = this.steps.map(() => 0);
    this.queue = [...(this.mission.waves || [])];
    this.spawnT = 0;
    this.cleared = false;
    this.ambushed = false;
    this.stats = { kills: 0, damageTaken: 0, hits: 0, bestCombo: 0 };
    for (let i = 0; i < (this.mission.startAlive || 0) && this.queue.length; i++) this.spawnWave(false);
    if (this.mission.id === "rescue") {
      const c = this.level.civilian;
      this.civ = { x: c.x, z: c.z, y: 0, facing: c.facing, r: 0.4, h: 1.7, state: "tied", speed: 0, vx: 0, vz: 0, kx: 0, kz: 0, st: 0 };
      for (const g of this.level.guards) this.addEnemy(g.kind, g.x, g.z, { guard: true, patrol: [{ x: g.x, z: g.z }, { x: g.px, z: g.pz }] });
    }
    if (this.level.boss && this.mission.id === "boss") {
      const b = this.level.boss;
      this.boss = this.addEnemy("shredder", b.x, b.z, { facing: b.facing, alert: true });
      Object.assign(this.boss, { state: "intro", phase: 1, poise: 120, staggerCd: 0, rushCd: 5, lane: null, hitDone: 0 });
    }
  }

  /* ============================================================ helpers */
  emit(type, data = {}) {
    this.events.push({ type, ...data });
  }
  get cur() {
    return this.steps[this.stepI] || null;
  }
  advanceStep() {
    const st = this.cur;
    this.emit("step", { id: st.id, text: st.text });
    this.stepI++;
    if (this.stepI >= this.steps.length) {
      this.cleared = true;
      this.endT = this.mission.id === "boss" ? 3.4 : 1.8;
      this.emit("cleared");
    }
  }
  bump(id, amount = 1) {
    if (this.cleared || this.status !== "play") return;
    const st = this.cur;
    if (!st || st.id !== id) return;
    this.counts[this.stepI] = Math.min(st.need, this.counts[this.stepI] + amount);
    if (this.counts[this.stepI] >= st.need) this.advanceStep();
  }
  addEnemy(type, x, z, extra = {}) {
    const D = ENEMIES[type];
    const hp = Math.round(D.hp * this.diff.enemyHp);
    const e = {
      id: this.nextId++, kind: type, x, z, y: 0, vx: 0, vz: 0, kx: 0, kz: 0, facing: extra.facing ?? Math.atan2(this.player.x - x, this.player.z - z),
      r: D.r, h: D.h, hp, maxHp: hp, state: "patrol", st: 0, cd: 0.6 + this.rand() * 0.8, stunT: 0, stunImm: 0, flash: 0, dead: false,
      token: false, hitDone: 0, strafe: this.rand() < 0.5 ? 1 : -1, speed: 0, alert: false, patrol: null, pi: 1, wait: 0, ...extra,
    };
    if (!e.patrol) e.patrol = [{ x, z }, { x, z }];
    if (e.alert) e.state = "chase";
    this.enemies.push(e);
    this.emit("spawn", { id: e.id, kind: type });
    return e;
  }
  /** Spawn the next queued wave enemy at a free spawn point away from the player. */
  spawnWave(alert) {
    const kind = this.queue.shift();
    if (!kind) return null;
    const P = this.player;
    const sp = this.level.enemySpawns;
    const free = sp.filter((p) => Math.hypot(p.x - P.x, p.z - P.z) >= 10 && !this.enemies.some((e) => !e.dead && Math.hypot(e.x - p.x, e.z - p.z) < 2.5));
    const pool = free.length ? free : sp.filter((p) => !this.enemies.some((e) => !e.dead && Math.hypot(e.x - p.x, e.z - p.z) < 1.2));
    const p = (pool.length ? pool : sp)[Math.floor(this.rand() * (pool.length || sp.length))];
    return this.addEnemy(kind, p.x, p.z, { alert, patrol: [{ x: p.x, z: p.z }, { x: p.px, z: p.pz }] });
  }
  aliveEnemies() {
    return this.enemies.filter((e) => !e.dead);
  }
  alertAround(e) {
    if (e.alert) return;
    e.alert = true;
    if (e.state === "patrol") {
      e.state = "chase";
      e.st = 0;
    }
    this.emit("alert", { id: e.id, x: e.x, z: e.z, h: e.h });
    for (const o of this.enemies) if (!o.dead && !o.alert && Math.hypot(o.x - e.x, o.z - e.z) < 8) this.alertAround(o);
  }
  /** Nearest live target in front of the player (soft lock-on for attacks). */
  softTarget(maxD = 4.4, arc = 2.3) {
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
  /** Attack duration / hit time for the player's current attack. */
  moveTiming(P) {
    const k = this.hero.atk;
    if (P.state === "heavy") return { dur: MOVES.heavy.dur * k, hitT: MOVES.heavy.hitT * k };
    const M = P.combo === 3 ? MOVES.finisher : MOVES.light;
    return { dur: M.dur * k, hitT: M.hitT * k };
  }

  /* ============================================================ step */
  step(dt, input = EMPTY_INPUT) {
    this.events = [];
    if (this.status !== "play") return this.events;
    dt = Math.min(dt, 1 / 30);
    this.t += dt;
    const inp = { ...EMPTY_INPUT, ...input };

    const look = Math.abs(inp.dYaw) + Math.abs(inp.dPitch);
    this.cam.yaw += inp.dYaw;
    this.cam.pitch = clamp(this.cam.pitch + inp.dPitch, PITCH_MIN, PITCH_MAX);
    if (look) this.bump("look", look);

    this.updatePlayer(dt, inp);
    for (const e of this.enemies) {
      if (e.kind === "shredder") this.updateBoss(e, dt);
      else this.updateFoot(e, dt);
    }
    this.separate();
    for (const d of this.dummies) d.wob = Math.max(0, d.wob - dt * 2.2);
    this.enemies = this.enemies.filter((e) => {
      if (e.dead && e.kind !== "shredder" && e.st > 2.6) {
        this.emit("despawn", { id: e.id });
        return false;
      }
      return true;
    });
    if (this.civ) this.updateCivilian(dt);
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
    P.heavyCd = Math.max(0, P.heavyCd - dt);
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

    const inAttack = P.state === "light" || P.state === "heavy";
    const tm = inAttack ? this.moveTiming(P) : null;
    const attackLate = inAttack && P.st >= tm.dur * 0.6;
    const free = P.state === "move" || attackLate;
    const locked = this.cleared;

    // ---- start actions
    if (!locked) {
      if (inp.dodge && P.dodgeCd <= 0 && (free || (inAttack && P.st >= tm.hitT)) && P.state !== "hit") {
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
      } else if (inp.heavy) {
        if (P.heavyCd <= 0) {
          if (free) this.startAttack("heavy");
          else if (inAttack) P.queued = "heavy";
        }
      } else if (inp.light) {
        if (free) this.startAttack("light");
        else if (inAttack) P.queued = "light";
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
      case "light":
      case "heavy": {
        const tm = this.moveTiming(P); // the attack may have started this frame
        accel = 18;
        if (P.st < tm.hitT) {
          const t = P.lockT;
          if (t && !t.dead) {
            P.facing = turnTo(P.facing, Math.atan2(t.x - P.x, t.z - P.z), 20 * dt);
            const reach = P.state === "heavy" ? H.heavy.range : H.light.range;
            const gap = Math.hypot(t.x - P.x, t.z - P.z) - t.r - P.r;
            if (gap > reach * 0.55) {
              wantVx = Math.sin(P.facing) * 5;
              wantVz = Math.cos(P.facing) * 5;
            }
          }
        } else if (P.hitDone === 0) {
          P.hitDone = 1;
          if (P.state === "heavy") {
            const A = H.heavy;
            this.attack(P, { range: A.range, arc: A.arc, dmg: A.dmg, kb: 8, stun: 0.6, move: "heavy" });
          } else {
            const A = H.light;
            const fin = P.combo === 3;
            this.attack(P, { range: A.range, arc: A.arc, dmg: Math.round(A.dmg * (fin ? 1.5 : 1)), kb: fin ? 7 : 3, stun: fin ? 0.55 : 0.34, move: fin ? "finisher" : "light", combo: P.combo });
          }
        }
        if (P.st >= tm.dur) {
          const q = P.queued;
          P.queued = null;
          P.state = "move";
          P.st = 0;
          if (q === "heavy" && P.heavyCd <= 0) this.startAttack("heavy");
          else if (q === "light") this.startAttack("light");
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
    this.integrate(P, dt, P.state !== "special" || this.hero.special.id !== "quake");
    P.speed = Math.hypot(P.vx, P.vz);
    if (!Number.isFinite(P.x + P.z + P.y + P.vx + P.vz + P.vy)) this.resetPlayerPos();
  }

  integrate(A, dt, gravity) {
    if (gravity && (!A.grounded || A.y > 0)) {
      A.vy -= GRAV * dt;
      A.y += A.vy * dt;
      if (A.y <= 0) {
        A.y = 0;
        if (!A.grounded && A === this.player) this.emit("land");
        A.vy = 0;
        A.grounded = true;
      } else A.grounded = false;
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
    P.lockT = this.softTarget(kind === "light" ? Math.max(3.4, this.hero.light.range + 1.4) : 4.6);
    if (P.lockT) P.facing = turnTo(P.facing, Math.atan2(P.lockT.x - P.x, P.lockT.z - P.z), 1.2);
    if (kind === "light") {
      P.combo = P.combo >= 3 || this.t - P.lastLight > COMBO_WINDOW ? 1 : P.combo + 1;
      P.lastLight = this.t;
    }
    if (kind === "heavy") P.heavyCd = MOVES.heavy.cd;
    if (kind === "special") {
      P.specialCd = this.hero.special.cd;
      P.y0 = P.y;
      P.specialOnDummy = false;
      P.dir = { x: Math.sin(P.facing), z: Math.cos(P.facing) };
      if (this.hero.special.id === "tornado") P.iframes = Math.max(P.iframes, 0.5);
      if (this.hero.special.id === "quake") {
        P.grounded = false;
        P.vy = 0;
      }
    }
    this.emit("swing", { move: kind, hero: this.hero.id, combo: P.combo });
  }

  updateSpecial(P) {
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
      case "cyclone":
        [0.2, 0.42, 0.64].forEach((t, i) => {
          if (st >= t) once(1 << i, () => this.attack(P, { radius: S.radius, dmg: S.dmg, kb: i === 2 ? 8 : 2.5, stun: 0.45, move: "special" }));
        });
        if (st >= 0.2) once(8, () => this.emit("shock", { x: P.x, z: P.z, r: S.radius, color: "#8ec8ff" }));
        break;
      case "quake": {
        const up = 0.6;
        if (st < up) {
          const p = st / up;
          P.y = P.y0 * (1 - p) + 2.4 * Math.sin(p * Math.PI) * (p < 0.5 ? 1 : 1 - (p - 0.5) * 0.2);
          const t = P.lockT;
          if (t && !t.dead) {
            const dx = t.x - P.x, dz = t.z - P.z;
            const d = Math.hypot(dx, dz);
            if (d > 1.2) {
              wantVx = (dx / d) * 3;
              wantVz = (dz / d) * 3;
            }
          }
        } else {
          P.y = 0;
          P.grounded = true;
          once(1, () => {
            this.attack(P, { radius: S.radius, dmg: S.dmg, kb: 11, stun: 0.9, move: "special" });
            this.emit("shock", { x: P.x, z: P.z, r: S.radius, color: "#ff8a6a", heavy: true });
          });
        }
        break;
      }
      case "shockwave":
        if (st >= 0.34)
          once(1, () => {
            this.attack(P, { range: S.range, arc: S.arc, dmg: S.dmg, kb: 12, stun: 0.8, move: "special" });
            this.emit("wave", { x: P.x, z: P.z, facing: P.facing, range: S.range });
          });
        break;
      case "tornado":
        if (st > 0.08 && st < 0.08 + 0.34) {
          const sp = S.dist / 0.34;
          wantVx = P.dir.x * sp;
          wantVz = P.dir.z * sp;
          P.hitSet = P.hitSet || new Set();
          this.attack(P, { radius: 1.6, dmg: S.dmg, kb: 6, stun: 0.7, move: "special", once: P.hitSet });
        }
        break;
      default:
        break;
    }
    if (st >= dur) {
      P.state = "move";
      P.st = 0;
      P.y = Math.max(0, P.y);
      if (S.id === "quake") {
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
      if (this.damage(T, o.dmg, ux, uz, o.kb, o.stun, A, o.move, o.combo)) {
        n++;
        if (o.once) o.once.add(T.id);
      }
    }
    if (fromPlayer && n > 0) {
      if (o.move === "finisher") this.stats.bestCombo = 3;
      if (o.move === "special" && this.dummies.length && !A.specialOnDummy && this.dummies.some((d) => d.wob > 0.95)) {
        A.specialOnDummy = true;
        this.bump("special");
      }
    }
    return n;
  }

  damage(T, dmg, ux, uz, kb, stun, from, move, combo) {
    if (T.kind === "dummy") {
      T.wob = 1;
      T.wobX = ux;
      T.wobZ = uz;
      this.emit("hit", { x: T.x, y: 1.1, z: T.z, dmg: 0, target: T.id, dummy: true, move, combo });
      if (move === "light" || move === "finisher") this.bump("light");
      if (move === "finisher") this.bump("combo");
      if (move === "heavy") this.bump("heavy");
      return true;
    }
    if (T === this.player) {
      if (T.iframes > 0 || T.dead || this.cleared) return false;
      const d = Math.max(1, Math.round(dmg * this.diff.dmgTaken));
      T.hp = Math.max(0, T.hp - d);
      this.stats.damageTaken += d;
      T.flash = 0.25;
      T.iframes = 0.6;
      T.kx = ux * kb;
      T.kz = uz * kb;
      this.emit("hurt", { x: T.x, y: T.y + T.h * 0.6, z: T.z, dmg: d });
      if (T.hp <= 0) {
        T.dead = true;
        T.state = "ko";
        T.st = 0;
        T.queued = null;
        this.emit("ko", { id: 0 });
      } else if (T.state !== "special" || this.hero.special.id !== "quake") {
        T.state = "hit";
        T.st = 0;
        T.queued = null;
      }
      return true;
    }
    // enemies
    if (T.dead) return false;
    if (T.kind === "shredder" && (T.state === "intro" || T.state === "roar")) {
      this.emit("block", { x: T.x, y: 1.7, z: T.z });
      return false;
    }
    T.hp = Math.max(0, T.hp - dmg);
    T.flash = 0.18;
    this.alertAround(T);
    this.stats.hits++;
    this.emit("hit", { x: T.x, y: T.h * 0.62, z: T.z, dmg, target: T.id, move, combo });
    const boss = T.kind === "shredder";
    const heavyBody = boss ? 0.35 : T.kind === "elite" ? 0.6 : 1;
    T.kx = ux * kb * heavyBody;
    T.kz = uz * kb * heavyBody;
    if (T.hp <= 0) {
      T.dead = true;
      T.state = "ko";
      T.st = 0;
      T.token = false;
      T.y = 0;
      this.stats.kills++;
      this.emit("ko", { id: T.id, kind: T.kind, x: T.x, z: T.z });
      if (boss) this.bump("boss");
      else if (!T.guard && !T.ambush) this.bump("kills");
      return true;
    }
    const big = move === "heavy" || move === "finisher" || move === "special";
    if (boss) {
      T.poise -= dmg * (big ? 1.3 : 1);
      if (T.phase === 1 && T.hp <= T.maxHp / 2) {
        T.phase = 2;
        T.state = "roar";
        T.st = 0;
        T.hitDone = 0;
        T.lane = null;
        this.emit("phase2");
      } else if (T.poise <= 0 && T.state !== "rush" && T.staggerCd <= 0) {
        T.poise = 120;
        T.staggerCd = 4;
        T.state = "stagger";
        T.st = 0;
        T.lane = null;
      }
      return true;
    }
    // Foot: no stun-lock (short immunity after each stagger); elites shrug
    // off light hits entirely, soldiers only keep a wind-up through them
    const armor = ENEMIES[T.kind].armor;
    const resist = T.stunImm > 0 || (armor && !big) || (T.state === "windup" && move === "light");
    if (!resist || (stun || 0) >= 0.7) {
      T.state = "hurt";
      T.st = 0;
      T.stunT = Math.max(0.32, stun || 0.32) * (T.kind === "elite" ? 0.8 : 1);
      T.token = false;
    }
    return true;
  }

  /* ============================================================ Foot Clan */
  updateFoot(e, dt) {
    const P = this.player;
    const D = ENEMIES[e.kind];
    e.st += dt;
    e.flash = Math.max(0, e.flash - dt);
    e.cd = Math.max(0, e.cd - dt);
    e.stunImm = Math.max(0, e.stunImm - dt);
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
    if (calm && e.state !== "hurt" && e.state !== "patrol") {
      e.state = "patrol";
      e.st = 0;
      e.token = false;
    }
    switch (e.state) {
      case "patrol": {
        // detect: close, or in front within aggro range
        if (!calm && (e.alert || dist < 3.5 || (dist < D.aggro && Math.abs(angDiff(e.facing, toP)) < 1.1))) {
          this.alertAround(e);
          e.state = "chase";
          e.st = 0;
          break;
        }
        const goal = e.patrol[e.pi];
        if (e.wait > 0) {
          e.wait -= dt;
          break;
        }
        const gd = Math.hypot(goal.x - e.x, goal.z - e.z);
        if (gd < 0.4) {
          e.pi = 1 - e.pi;
          e.wait = 1 + this.rand() * 0.8;
          break;
        }
        const dir = navDir(this.nav, e.x, e.z, goal.x, goal.z);
        if (dir) {
          wantX = dir.x;
          wantZ = dir.z;
          sp = 1.6;
        }
        break;
      }
      case "chase": {
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
          this.emit("swing", { move: "slash", enemy: e.id });
          this.attack(e, { range: D.range, arc: e.kind === "elite" ? 1.9 : 1.5, dmg: D.dmg, kb: e.kind === "elite" ? 7 : 4.5, move: "slash" });
        }
        if (e.st >= 0.34) {
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
          e.state = calm ? "patrol" : "chase";
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

  /* ============================================================ Shredder */
  updateBoss(b, dt) {
    const P = this.player;
    const D = ENEMIES.shredder;
    b.st += dt;
    b.flash = Math.max(0, b.flash - dt);
    b.cd = Math.max(0, b.cd - dt);
    b.rushCd = Math.max(0, b.rushCd - dt);
    b.staggerCd = Math.max(0, b.staggerCd - dt);
    if (b.dead) {
      b.vx = b.vz = 0;
      b.lane = null;
      this.integrate(b, dt, false);
      b.st = Math.min(b.st, 3); // stays down; never despawns
      return;
    }
    const p2 = b.phase === 2;
    const dx = P.x - b.x, dz = P.z - b.z;
    const dist = Math.hypot(dx, dz);
    const toP = Math.atan2(dx, dz);
    let wantX = 0, wantZ = 0, sp = 0;
    const calm = P.dead || this.cleared;
    if (calm && !["intro", "chase", "stagger"].includes(b.state)) {
      b.state = "chase";
      b.st = 0;
      b.lane = null;
    }
    switch (b.state) {
      case "intro":
        b.facing = turnTo(b.facing, toP, 3 * dt);
        if (b.st > 0.3 && !b.hitDone) {
          b.hitDone = 1;
          this.emit("taunt", { id: b.id });
        }
        if (b.st >= 2.3) {
          b.state = "chase";
          b.st = 0;
          b.cd = 0.6;
        }
        break;
      case "chase": {
        if (calm) break;
        b.facing = turnTo(b.facing, toP, 7 * dt);
        if (b.rushCd <= 0 && (dist > 5 || this.rand() < 0.01)) {
          b.state = "aim";
          b.st = 0;
          b.lane = this.laneFrom(b, b.facing);
          this.emit("rushWarn", { id: b.id });
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
        const w = p2 ? 0.42 : D.windup;
        if (b.st < w * 0.75) b.facing = turnTo(b.facing, toP, 6 * dt);
        if (b.st >= w) {
          b.state = "strike";
          b.st = 0;
          b.hitDone = 0;
        }
        break;
      }
      case "strike":
        // two gauntlet slashes
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
      case "aim": {
        // Blade Rush telegraph: the red lane tracks the player, then locks
        const aimT = p2 ? RUSH.aimP2 : RUSH.aim;
        if (b.st < aimT * 0.6) {
          b.facing = turnTo(b.facing, toP, 4.5 * dt);
          b.lane = this.laneFrom(b, b.facing);
        }
        if (b.st >= aimT) {
          b.state = "rush";
          b.st = 0;
          b.hitDone = 0;
          b.lane.locked = true;
          this.emit("rush", { id: b.id });
        }
        break;
      }
      case "rush": {
        const L = b.lane;
        const k = Math.min(1, b.st / RUSH.dur);
        const tx = L.x0 + (L.x1 - L.x0) * k, tz = L.z0 + (L.z1 - L.z0) * k;
        const ox = b.x, oz = b.z;
        b.x = tx;
        b.z = tz;
        resolveActor(this.col, b);
        if (!b.hitDone && !P.dead && P.y < 1.5) {
          // anywhere along the path swept this frame
          const sx = b.x - ox, sz = b.z - oz;
          const l2 = sx * sx + sz * sz || 1e-6;
          const u = clamp(((P.x - ox) * sx + (P.z - oz) * sz) / l2, 0, 1);
          const off = Math.hypot(P.x - (ox + sx * u), P.z - (oz + sz * u));
          if (off < RUSH.width + P.r) {
            b.hitDone = 1;
            const fx = Math.sin(b.facing), fz = Math.cos(b.facing);
            this.damage(P, RUSH.dmg, fx, fz, 11, 0, b, "rush");
          }
        }
        if (k >= 1) {
          b.state = "tired";
          b.st = 0;
          b.lane = null;
          b.rushCd = p2 ? 5 : 7.5;
          this.emit("shock", { x: b.x, z: b.z, r: 2, color: "#c9a0ff" });
        }
        b.vx = b.vz = 0;
        b.speed = RUSH.len / RUSH.dur;
        return;
      }
      case "tired":
        if (b.st >= RUSH.tired) {
          b.state = "chase";
          b.st = 0;
          b.cd = 0.4;
        }
        break;
      case "stagger":
        if (b.st >= 0.75) {
          b.state = "chase";
          b.st = 0;
          b.cd = Math.max(b.cd, 0.3);
        }
        break;
      case "roar":
        if (b.st > 0.2 && !(b.hitDone & 4)) {
          b.hitDone |= 4;
          this.emit("taunt", { id: b.id, big: true });
          if (dist < 5 && !P.dead) {
            P.kx = (dx / (dist || 1)) * 9;
            P.kz = (dz / (dist || 1)) * 9;
          }
        }
        if (b.st >= 1.4) {
          b.state = "chase";
          b.st = 0;
          b.hitDone = 0;
          b.rushCd = Math.min(b.rushCd, 2);
        }
        break;
      default:
        b.state = "chase";
    }
    const a = 1 - Math.exp(-9 * dt);
    b.vx += (wantX * sp - b.vx) * a;
    b.vz += (wantZ * sp - b.vz) * a;
    this.integrate(b, dt, false);
    b.speed = Math.hypot(b.vx, b.vz);
    if (!Number.isFinite(b.x + b.z)) {
      b.x = this.level.boss.x;
      b.z = this.level.boss.z;
    }
  }

  /** The straight dash lane from the boss along `facing`, kept inside the arena. */
  laneFrom(b, facing) {
    const fx = Math.sin(facing), fz = Math.cos(facing);
    let len = RUSH.len;
    const end = { x: b.x + fx * len, z: b.z + fz * len };
    clampBounds(this.col.bounds, end, b.r + 0.6);
    len = Math.max(2, Math.hypot(end.x - b.x, end.z - b.z));
    // stop short of pillars so the dash never grinds into one
    for (let s = 0.5; s <= len; s += 0.25)
      if (blockedAt(this.col, b.x + fx * s, b.z + fz * s, b.r * 0.9)) {
        len = Math.max(2, s - 0.5);
        break;
      }
    return { x0: b.x, z0: b.z, x1: b.x + fx * len, z1: b.z + fz * len, len, facing, width: RUSH.width, locked: false };
  }

  /* ============================================================ crowd */
  separate() {
    const P = this.player;
    const list = [P, ...this.enemies.filter((e) => !e.dead && e.state !== "rush")];
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
        if (a === P) wa = b.kind === "shredder" ? 0.75 : 0.3;
        const ux = d2 > 1e-8 ? dx / d : 1, uz = d2 > 1e-8 ? dz / d : 0;
        a.x -= ux * push * wa;
        a.z -= uz * push * wa;
        b.x += ux * push * (1 - wa);
        b.z += uz * push * (1 - wa);
        resolveActor(this.col, a);
        resolveActor(this.col, b);
      }
    // rooted things: dummies, Splinter, the tied-up civilian — only actors move
    const rooted = [...this.dummies, ...this.npcs];
    if (this.civ && this.civ.state !== "follow") rooted.push(this.civ);
    for (const d of rooted) {
      for (const a of list) {
        const dx = a.x - d.x, dz = a.z - d.z;
        const min = a.r + d.r;
        const dd = Math.hypot(dx, dz);
        if (dd < min && dd > 1e-4) {
          a.x = d.x + (dx / dd) * min;
          a.z = d.z + (dz / dd) * min;
          resolveActor(this.col, a);
        }
      }
    }
  }

  /* ============================================================ hostage */
  updateCivilian(dt) {
    const C = this.civ;
    const P = this.player;
    C.st += dt;
    if (C.state !== "follow") {
      C.speed = 0;
      return;
    }
    const d = Math.hypot(P.x - C.x, P.z - C.z);
    if (d > 14) {
      // fell far behind (e.g. blocked by a crowd): catch up next to the player
      C.x = P.x - Math.sin(P.facing) * 1.6;
      C.z = P.z - Math.cos(P.facing) * 1.6;
      resolveActor(this.col, C);
      this.emit("civCatchUp");
    }
    let wantX = 0, wantZ = 0, sp = 0;
    if (d > 2.2) {
      const dir = navDir(this.nav, C.x, C.z, P.x, P.z);
      if (dir) {
        wantX = dir.x;
        wantZ = dir.z;
        sp = d > 5 ? 6.2 : 4.6;
      }
    }
    const a = 1 - Math.exp(-8 * dt);
    C.vx += (wantX * sp - C.vx) * a;
    C.vz += (wantZ * sp - C.vz) * a;
    C.x += C.vx * dt;
    C.z += C.vz * dt;
    resolveActor(this.col, C);
    // don't walk through the turtle
    const ddx = C.x - P.x, ddz = C.z - P.z;
    const dd = Math.hypot(ddx, ddz);
    if (dd < C.r + P.r && dd > 1e-4) {
      C.x = P.x + (ddx / dd) * (C.r + P.r);
      C.z = P.z + (ddz / dd) * (C.r + P.r);
      resolveActor(this.col, C);
    }
    C.speed = Math.hypot(C.vx, C.vz);
    if (C.speed > 0.3) C.facing = turnTo(C.facing, Math.atan2(C.vx, C.vz), 10 * dt);
    if (!Number.isFinite(C.x + C.z)) {
      C.x = P.x;
      C.z = P.z;
    }
  }

  /* ============================================================ interact */
  updateInteract(inp) {
    const P = this.player;
    let best = null, bd = 2.2;
    for (const n of this.npcs) {
      const d = Math.hypot(n.x - P.x, n.z - P.z);
      if (d < bd + 0.4) {
        bd = d;
        best = { kind: "npc", ref: n, text: "Talk to Master Splinter" };
      }
    }
    for (const it of this.items) {
      if (it.taken) continue;
      const d = Math.hypot(it.x - P.x, it.z - P.z);
      if (d < bd) {
        bd = d;
        best = { kind: it.kind, ref: it, text: "Eat pizza (+40 HP)" };
      }
    }
    const C = this.civ;
    if (C && C.state === "tied" && Math.hypot(C.x - P.x, C.z - P.z) < 2.4) {
      const ready = this.cur?.id === "free";
      best = { kind: "civ", ref: C, text: ready ? "Free the civilian" : "Defeat the guards first!", disabled: !ready };
    }
    this.prompt = P.dead || this.cleared ? null : best;
    if (!inp.interact || !this.prompt || this.prompt.disabled) return;
    const it = this.prompt.ref;
    if (this.prompt.kind === "npc") {
      if (this.cur?.id === "splinter") {
        this.talk = { who: "Master Splinter", text: SPLINTER_LINES.done };
        this.bump("splinter");
      } else {
        const L = SPLINTER_LINES.idle;
        this.talk = { who: "Master Splinter", text: L[Math.floor(this.t) % L.length] };
      }
      this.emit("talk", this.talk);
    } else if (this.prompt.kind === "civ") {
      C.state = "follow";
      C.st = 0;
      this.talk = { who: "Civilian", text: CIVILIAN_LINES.freed };
      this.emit("talk", this.talk);
      this.emit("freed", { x: C.x, z: C.z });
      this.bump("free");
      if (!this.ambushed) {
        this.ambushed = true;
        for (const p of this.level.ambush) this.addEnemy("foot", p.x, p.z, { alert: true, ambush: true });
        this.emit("ambush");
      }
    } else if (this.prompt.kind === "pizza") {
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
    const P = this.player;
    if (M.waves && !this.cleared) {
      const alive = this.aliveEnemies().length;
      if (this.queue.length && alive < M.maxAlive) {
        this.spawnT += dt;
        if (this.spawnT >= 1.4) {
          this.spawnT = 0;
          this.spawnWave(alive === 0 || this.rand() < 0.5);
        }
      } else this.spawnT = 0;
    }
    if (M.id === "rescue" && !this.cleared && this.status === "play") {
      const C = this.civ;
      const st = this.cur;
      if (st?.id === "find" && Math.hypot(C.x - P.x, C.z - P.z) < 7.5) this.bump("find");
      if (this.cur?.id === "guards") {
        const dead = this.enemies.filter((e) => e.guard && e.dead).length + (this.level.guards.length - this.enemies.filter((e) => e.guard).length);
        this.counts[this.stepI] = Math.min(this.cur.need, dead);
        if (dead >= this.cur.need) this.advanceStep();
      }
      if (this.cur?.id === "escort") {
        const S = this.level.safe;
        if (Math.hypot(C.x - S.x, C.z - S.z) < S.r) {
          C.state = "safe";
          C.vx = C.vz = 0;
          this.talk = { who: "Civilian", text: CIVILIAN_LINES.safe };
          this.emit("talk", this.talk);
          this.bump("escort");
        }
      }
    }
    if (this.cleared && this.status === "play" && !P.dead) {
      this.endT -= dt;
      if (this.endT <= 0) {
        this.status = "won";
        this.emit("complete", { mission: M.id });
      }
    }
  }

  /** Where the current objective is (for the compass), or null. */
  objectiveTarget() {
    const P = this.player;
    const st = this.cur;
    if (!st) return null;
    let pts = [];
    if (st.id === "splinter") pts = this.npcs;
    else if (["light", "combo", "heavy", "special"].includes(st.id)) pts = this.dummies;
    else if (st.id === "kills" || st.id === "boss") pts = this.aliveEnemies();
    else if (st.id === "find" || st.id === "free") pts = [this.civ];
    else if (st.id === "guards") pts = this.aliveEnemies().filter((e) => e.guard);
    else if (st.id === "escort") pts = [this.level.safe];
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
    const ty = P.y + this.hero.h * 0.85;
    const fx = Math.sin(c.yaw) * Math.cos(c.pitch);
    const fy = -Math.sin(c.pitch);
    const fz = Math.cos(c.yaw) * Math.cos(c.pitch);
    c.target = { x: P.x, y: ty, z: P.z };
    c.dist = cameraClear(this.col, P.x, ty, P.z, fx, fy, fz, CAM_DIST);
    c.fwd = { x: fx, y: fy, z: fz };
  }
}
