/**
 * Sky Combat 3D — the simulation. Headless (Three.js maths only, no
 * rendering), stepped with a fixed-ish dt by the component, the bot and the
 * Node tests alike.
 *
 * Conventions: metres, seconds, Y up. Aircraft nose = local −Z, right wing =
 * local +X, canopy = local +Y (same as a Three.js camera), so a model built
 * nose-forward along −Z can take `quat` directly.
 *
 * Output for the outside world:
 *   sim.events — UI/audio things that happened this step (drained by the caller)
 *   sim.fx     — one-shot visual effects for the renderer (drained by it)
 *   sim.result — set once the mission is decided ({win, reason, …})
 */
import * as THREE from "three";
import { AIR, GROUND, missionById, jetStats } from "./data.js";
import { heightField, WORLD_RADIUS, CEILING, PADS } from "./terrain.js";

const UP = new THREE.Vector3(0, 1, 0);
const AX = new THREE.Vector3(1, 0, 0);
const AY = new THREE.Vector3(0, 1, 0);
const AZ = new THREE.Vector3(0, 0, 1);
const G = 9.81;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const sstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

// scratch objects (never escape a function)
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _d = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _qi = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const _q3 = new THREE.Quaternion();
const _I = new THREE.Quaternion();
const _D = new THREE.Vector3();

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Rotate unit vector `dir` toward unit vector `to` by at most `maxAng` radians (in place). */
export function turnToward(dir, to, maxAng) {
  const dot = clamp(dir.dot(to), -1, 1);
  const ang = Math.acos(dot);
  if (ang < 1e-6) return dir;
  _q3.setFromUnitVectors(dir, to);
  if (ang > maxAng) _q.copy(_I).slerp(_q3, maxAng / ang);
  else _q.copy(_q3);
  return dir.applyQuaternion(_q).normalize();
}

/** Quaternion for a nose direction + bank angle (positive = right wing down). */
export function orient(out, dir, bank) {
  _m.lookAt(_a.set(0, 0, 0), dir, Math.abs(dir.y) > 0.999 ? AZ : UP);
  out.setFromRotationMatrix(_m);
  _q2.setFromAxisAngle(AZ, -bank);
  return out.multiply(_q2);
}

/**
 * Mouse-aim autopilot: stick inputs (pitch/roll/yaw in −1..1) that bring the
 * nose of an aircraft with orientation `quat` onto world direction `aim`.
 * Used for the player's assisted steering and by the test bot.
 */
export function autopilot(quat, aim, out = {}, dt = 1 / 60) {
  _qi.copy(quat).invert();
  _a.copy(aim).applyQuaternion(_qi);
  const fwd = -_a.z;
  const up = _a.y;
  const right = _a.x;
  const ang = Math.acos(clamp(fwd, -1, 1));
  _b.copy(UP).applyQuaternion(_qi);
  const bank = -Math.atan2(_b.x, _b.y); // + = right wing down
  const errUp = Math.atan2(up, Math.max(fwd, 0.02));
  const errRight = Math.atan2(right, Math.max(fwd, 0.02));
  // world-frame heading error decides how much bank a turn needs
  _c.set(0, 0, -1).applyQuaternion(quat);
  let hErr = Math.atan2(aim.x, -aim.z) - Math.atan2(_c.x, -_c.z);
  while (hErr > Math.PI) hErr -= Math.PI * 2;
  while (hErr < -Math.PI) hErr += Math.PI * 2;
  const big = sstep(0.3, 0.6, ang);
  // integral terms so the nose can hold a sustained turn on a moving lead point
  const decay = big > 0.5 ? 0.92 : 1;
  out.iP = clamp(((out.iP || 0) + errUp * dt * 2.5) * decay, -0.5, 0.5);
  out.iB = clamp(((out.iB || 0) + hErr * dt * 2.5) * decay, -0.8, 0.8);
  // small errors: bank follows the heading error, pitch + rudder fine-tune
  const wantBank = clamp(hErr * 5 + out.iB, -1.35, 1.35);
  const rollS = clamp((wantBank - bank) * 2.2, -1, 1);
  const pitchS = clamp(errUp * 7 + out.iP, -1, 1);
  const yawS = clamp(errRight * 6, -1, 1);
  // large errors: roll the target into the lift plane, then pull
  // (a target moderately below the nose: push over instead of rolling inverted)
  const push = up < 0 && fwd > 0.55;
  const rollErr = push ? -Math.atan2(right, -up) : Math.atan2(right, up);
  const rollB = clamp(rollErr * (push ? 1.6 : 2.6), -1, 1);
  const pitchB = push ? clamp(errUp * 4, -1, 0) : fwd < 0.2 ? 1 : clamp(errUp * 4, -0.2, 1) * (Math.abs(rollErr) > 1.2 ? 0.4 : 1);
  out.roll = rollS * (1 - big) + rollB * big;
  out.pitch = pitchS * (1 - big) + pitchB * big;
  out.yaw = yawS * (1 - big);
  out.err = ang;
  return out;
}

/* ================================================================== Sim */
export class Sim {
  /**
   * @param {object} o
   *   mission: mission id (1..15) · jet: jet id · up: upgrade levels
   *   seed · god (tests: player can't die)
   */
  constructor({ mission = 1, jet = "falcon", up = {}, seed = 1, god = false } = {}) {
    this.def = missionById(mission);
    this.world = this.def.world;
    this.hf = heightField(this.world);
    this.rand = rng(seed);
    this.stats = jetStats(jet, up, this.def.loadout);
    this.jetId = jet;
    this.god = god;
    this.t = 0;
    this.steps = 0;
    this.nid = 0;
    this.events = [];
    this.fx = [];
    this.air = [];
    this.ground = [];
    this.bullets = [];
    for (let i = 0; i < 420; i++) this.bullets.push({ on: false, pos: new THREE.Vector3(), prev: new THREE.Vector3(), vel: new THREE.Vector3(), life: 0, side: "", dmg: 0, by: null, tracer: false });
    this.bi = 0;
    this.missiles = [];
    this.bombs = [];
    this.flares = [];
    this.torps = [];
    this.result = null;
    this.endT = 0;
    this.stageIdx = -1;
    this.stage = null;
    this.tagCount = {}; // tag → spawned
    this.tagDead = {}; // tag → destroyed
    this.enemyAirDown = 0;
    this.kills = 0;
    this.shotsFired = 0;
    this.shotsHit = 0;
    this.detect = 0; // radar-ceiling detection meter (0..1)
    this.weather = this.def.weather || null;
    this.player = this.makePlayer();
    this.air.push(this.player);
    this.nextStage();
  }

  /* ------------------------------------------------------------ helpers */
  ground_(x, z) {
    return this.hf.ground(x, z);
  }
  emit(type, data = {}) {
    this.events.push({ type, ...data });
  }
  fxPush(type, pos, s = 1, extra = null) {
    if (this.fx.length > 600) this.fx.shift();
    this.fx.push({ type, x: pos.x, y: pos.y, z: pos.z, s, ...extra });
  }
  radio(who, text) {
    this.emit("radio", { who, text });
  }

  makePlayer() {
    const S = this.stats;
    const st = this.def.start;
    const pos = new THREE.Vector3(...st.at);
    pos.y = Math.max(pos.y, this.ground_(pos.x, pos.z) + 300);
    const dir = new THREE.Vector3(...st.heading).normalize();
    const quat = orient(new THREE.Quaternion(), dir, 0);
    return {
      id: ++this.nid, cat: "air", side: "player", kind: this.jetId, name: S.name, def: { radius: 7.5 },
      pos, dir, vel: dir.clone().multiplyScalar(190), quat, speed: 190, bank: 0,
      hp: S.hp, maxHp: S.hp, alive: true, radius: 7.5, tag: "player",
      throttle: 0.62, rate: { p: 0, r: 0, y: 0 }, stalled: false, ab: false,
      ammo: { gun: S.gunAmmo, missiles: S.missiles, bombs: S.bombs, flares: S.flares },
      cd: { gun: 0, missile: 0, bomb: 0, flare: 0, lock: 0 }, gunSide: 1, firing: false,
      lock: { target: null, t: 0, locked: false, manual: false },
      rwr: "none", threats: [], lockedBy: 0, hitT: -9, outT: 0, rearmT: 0, ccip: null,
      flareQueue: 0, flareT: 0, flareActive: 0, dead: false, deadT: 0, wreck: false, spin: 0,
      warn: { stall: false, pullUp: false, boundary: false, ceiling: false },
    };
  }

  makeAir(kind, side, pos, dir, o = {}) {
    const def = AIR[kind];
    const a = {
      id: ++this.nid, cat: "air", kind, def, side, name: def.name,
      pos: pos.clone(), dir: dir.clone().normalize(), vel: new THREE.Vector3(), quat: new THREE.Quaternion(),
      speed: def.speed * 0.9, bank: 0, hp: def.hp, maxHp: def.hp, alive: true, radius: def.radius, tag: o.tag || null,
      missiles: def.missiles || 0, flares: def.flares || 0, torps: def.role === "torpedo" ? 1 : 0,
      gunCd: 0, burst: 0, burstT: this.rand() * 2, hitT: -9, wreck: false, wreckT: 0, spin: 0, by: null,
      ai: {
        state: o.patrol ? "patrol" : def.role === "path" || def.role === "gunship" || def.role === "bomber" ? "path" : def.role === "torpedo" ? "run" : "pursue",
        t: 0, patrol: o.patrol || null, pi: 0, path: o.path || null, targetTag: o.targetTag || null,
        lockT: 0, missileCd: 5 + this.rand() * 6, evade: new THREE.Vector3(), flareCd: 0, retreated: false,
        react: 0.5 + this.rand() * 0.9, target: null, retarget: 0, rocketCd: 2, phase: 0, arrived: false, egressT: 0,
        jink: this.rand() * 6.28,
      },
    };
    a.vel.copy(a.dir).multiplyScalar(a.speed);
    orient(a.quat, a.dir, 0);
    this.air.push(a);
    if (a.tag) this.tagCount[a.tag] = (this.tagCount[a.tag] || 0) + 1;
    return a;
  }

  makeGround(kind, x, z, o = {}) {
    const def = GROUND[kind];
    const gy = def.naval ? 0 : this.hf.height(x, z);
    const g = {
      id: ++this.nid, cat: "ground", kind, def, side: def.friend ? "friend" : "enemy", name: def.name,
      pos: new THREE.Vector3(x, Math.max(0, gy), z), base: Math.max(0, gy), yaw: o.yaw ?? this.rand() * 6.28,
      hp: def.hp, maxHp: def.hp, alive: true, radius: def.radius, tag: o.tag || null,
      path: o.path || null, pi: 0, speed: o.speed || (def.naval ? 14 : 6), vel: new THREE.Vector3(),
      w: { cd: 1 + this.rand() * 2, burst: 0, burstT: this.rand() * 2, lockT: 0, samCd: 4 + this.rand() * 4 },
      hitT: -9, deadT: 0,
    };
    this.ground.push(g);
    this._maxG = undefined;
    if (g.tag) this.tagCount[g.tag] = (this.tagCount[g.tag] || 0) + 1;
    return g;
  }

  /** Spawn a list of mission spawn specs (see data.js). */
  spawn(list) {
    for (const s of list || []) {
      const n = s.count || 1;
      for (let i = 0; i < n; i++) {
        const ox = n > 1 ? (s.line ? (i - (n - 1) / 2) * s.line[0] * (s.spread || 200) : (this.rand() - 0.5) * 2 * (s.spread || 200)) : 0;
        const oz = n > 1 ? (s.line ? (i - (n - 1) / 2) * s.line[1] * (s.spread || 200) : (this.rand() - 0.5) * 2 * (s.spread || 200)) : 0;
        const offPath = (p) => (p ? p.map((q) => (q.length === 3 ? [q[0] + ox, q[1], q[2] + oz] : [q[0] + ox, q[1] + oz])) : null);
        if (s.air) {
          let pos;
          let dir;
          if (s.ring) {
            const pl = this.player;
            const ang = this.rand() * Math.PI * 2;
            pos = new THREE.Vector3(pl.pos.x + Math.cos(ang) * s.ring, 0, pl.pos.z + Math.sin(ang) * s.ring);
            pos.y = Math.max(pl.pos.y + (this.rand() - 0.5) * 500, this.ground_(pos.x, pos.z) + 350);
            dir = _a.copy(pl.pos).sub(pos).normalize().clone();
          } else {
            pos = new THREE.Vector3(s.at[0] + ox, s.at[1] + (n > 1 ? (this.rand() - 0.5) * 120 : 0), s.at[2] + oz);
            pos.y = Math.max(pos.y, this.ground_(pos.x, pos.z) + (s.scramble ? 25 : 250));
            const tgt = s.path ? new THREE.Vector3(s.path[0][0], s.path[0][1], s.path[0][2]) : s.patrol ? new THREE.Vector3(s.patrol[0][0], pos.y, s.patrol[0][1]) : this.player.pos;
            dir = tgt.clone().sub(pos);
            dir.y = s.scramble ? dir.length() * 0.18 : 0;
            dir.normalize();
          }
          const a = this.makeAir(s.air, s.side || "enemy", pos, dir, { tag: s.tag, patrol: s.patrol, path: offPath(s.path), targetTag: s.targetTag });
          if (s.scramble) a.speed = 110;
          if (s.keep) a.keep = true;
        } else if (s.ground) {
          const g = this.makeGround(s.ground, s.at[0] + ox, s.at[1] + oz, { tag: s.tag, yaw: s.yaw, path: offPath(s.path), speed: s.speed });
          if (g.path && !s.path.length) g.path = null;
        }
      }
    }
  }

  /* ------------------------------------------------------------ mission flow */
  nextStage() {
    this.stageIdx++;
    const def = this.def.stages[this.stageIdx];
    if (!def) {
      this.finish(true, "Mission complete");
      return;
    }
    this.stage = { def, t: 0, wave: 0, keepSpawned: 0, keepCd: 0, cp: 0, startDown: this.enemyAirDown, startTag: { ...this.tagDead } };
    for (const [who, text] of def.say || []) this.radio(who, text);
    this.spawn(def.spawn);
    if (this.stageIdx > 0) this.emit("stage", { index: this.stageIdx, label: def.label });
  }

  /** Objective progress for the HUD: {label, done, need, kind}. */
  objective() {
    const s = this.stage;
    if (!s) return null;
    const d = s.def;
    switch (d.type) {
      case "destroy":
        return { label: d.label, done: Math.min(d.count, this.tagDead[d.tag] || 0), need: d.count, kind: "count" };
      case "kills":
        return { label: d.label, done: Math.min(d.count, this.enemyAirDown - s.startDown), need: d.count, kind: "count" };
      case "survive":
        return { label: d.label, done: Math.min(d.time, s.t), need: d.time, kind: "time" };
      case "checkpoints":
        return { label: d.label, done: s.cp, need: d.points.length, kind: "count" };
      case "escort": {
        const f = this.air.find((a) => a.alive && a.tag === d.tag);
        const dist = f ? Math.hypot(f.pos.x - d.dest[0], f.pos.z - d.dest[1]) : 0;
        return { label: d.label, done: 0, need: 0, kind: "dist", dist };
      }
      case "reach":
        return { label: d.label, done: 0, need: 0, kind: "dist", dist: this.player.pos.distanceTo(_a.set(...d.at)) };
      default:
        return { label: d.label, done: 0, need: 0 };
    }
  }

  /** Marker positions for the HUD/radar: [{x,y,z,kind,ent?}]. */
  markers() {
    const s = this.stage;
    const out = [];
    if (!s || this.result) return out;
    const d = s.def;
    if (d.type === "destroy") {
      for (const e of this.air) if (e.alive && e.tag === d.tag) out.push({ x: e.pos.x, y: e.pos.y, z: e.pos.z, kind: "target", ent: e });
      for (const e of this.ground) if (e.alive && e.tag === d.tag) out.push({ x: e.pos.x, y: e.pos.y + e.radius, z: e.pos.z, kind: "target", ent: e });
    } else if (d.type === "reach") out.push({ x: d.at[0], y: d.at[1], z: d.at[2], kind: "waypoint" });
    else if (d.type === "checkpoints") {
      const p = d.points[s.cp];
      if (p) out.push({ x: p[0], y: p[1], z: p[2], kind: "gate", r: d.r, n: s.cp + 1 });
      const q = d.points[s.cp + 1];
      if (q) out.push({ x: q[0], y: q[1], z: q[2], kind: "gate-next", r: d.r });
    } else if (d.type === "escort") {
      const y = this.ground_(d.dest[0], d.dest[1]) + 80;
      out.push({ x: d.dest[0], y, z: d.dest[1], kind: "waypoint" });
    }
    for (const f of this.def.fails || []) {
      if (f.type !== "protect") continue;
      for (const e of this.air) if (e.alive && e.tag === f.tag) out.push({ x: e.pos.x, y: e.pos.y, z: e.pos.z, kind: "friend", ent: e });
      for (const e of this.ground) if (e.alive && e.tag === f.tag) out.push({ x: e.pos.x, y: e.pos.y + 20, z: e.pos.z, kind: "friend", ent: e });
    }
    return out;
  }

  stepMission(dt) {
    const s = this.stage;
    if (!s || this.result) return;
    const d = s.def;
    s.t += dt;
    // timed waves
    while (d.waves && s.wave < d.waves.length && s.t >= d.waves[s.wave].t) {
      const w = d.waves[s.wave++];
      for (const [who, text] of w.say || []) this.radio(who, text);
      this.spawn(w.spawn);
      this.emit("wave");
    }
    // keep N enemies around
    if (d.keep && s.keepSpawned < d.keep.total) {
      s.keepCd -= dt;
      const alive = this.air.filter((a) => a.alive && a.side === "enemy").length;
      if (alive < d.keep.active && s.keepCd <= 0) {
        const kind = d.keep.kinds[s.keepSpawned % d.keep.kinds.length];
        this.spawn([{ air: kind, ring: d.keep.ring, keep: true }]);
        s.keepSpawned++;
        s.keepCd = 2.2;
      }
    }
    // goal
    const p = this.player;
    let done = false;
    switch (d.type) {
      case "destroy":
        done = (this.tagDead[d.tag] || 0) >= d.count;
        break;
      case "kills":
        done = this.enemyAirDown - s.startDown >= d.count;
        break;
      case "survive":
        done = s.t >= d.time;
        break;
      case "reach":
        done = p.alive && p.pos.distanceTo(_a.set(...d.at)) < d.r;
        break;
      case "checkpoints": {
        const q = d.points[s.cp];
        if (q && p.alive && p.pos.distanceTo(_a.set(q[0], q[1], q[2])) < d.r) {
          s.cp++;
          this.emit("gate", { n: s.cp, of: d.points.length });
        }
        done = s.cp >= d.points.length;
        if (d.ceiling && !done) {
          const over = p.pos.y > d.ceiling;
          this.detect = clamp(this.detect + (over ? dt / 3.5 : -dt / 6), 0, 1);
          if (over && !s.warned) {
            s.warned = true;
            this.emit("detectWarn");
          }
          if (!over) s.warned = false;
          if (this.detect >= 1) this.finish(false, "Detected by enemy radar");
        } else this.detect = Math.max(0, this.detect - dt);
        break;
      }
      case "escort": {
        const fr = this.air.filter((a) => a.alive && a.tag === d.tag);
        done = fr.length > 0 && fr.every((a) => Math.hypot(a.pos.x - d.dest[0], a.pos.z - d.dest[1]) < d.r);
        break;
      }
      default:
    }
    // mission-level failures
    for (const f of this.def.fails || []) {
      if (f.type === "protect" && (this.tagCount[f.tag] || 0) > 0) {
        const alive = this.air.filter((a) => a.alive && a.tag === f.tag).length + this.ground.filter((g) => g.alive && g.tag === f.tag).length;
        if (alive < f.min) return this.finish(false, f.tag === "convoy" ? "Too many freighters were sunk" : "The aircraft you were protecting was destroyed");
      } else if (f.type === "leak") {
        for (const a of this.air) if (a.alive && a.tag === f.tag && Math.hypot(a.pos.x - f.dest[0], a.pos.z - f.dest[1]) < f.r) return this.finish(false, "A bomber reached its target");
      }
    }
    if (done && !this.result) {
      this.emit("objective", { label: d.label });
      this.nextStage();
    }
  }

  finish(win, reason) {
    if (this.result) return;
    this.result = { win, reason, time: this.t, kills: this.kills, accuracy: this.shotsFired ? this.shotsHit / this.shotsFired : 0, hp: this.player.hp, maxHp: this.player.maxHp };
    this.endT = 0;
    this.emit(win ? "complete" : "failed", { reason });
  }

  /* ------------------------------------------------------------ main step */
  /**
   * @param {object} inp player input: pitch, roll, yaw (−1..1), thrUp, thrDown,
   *   aim (unit Vector3 | null), assist, fire, missile, bomb, flare, lock (edge-triggered booleans)
   */
  step(inp, dt) {
    dt = Math.min(dt, 0.05);
    this.t += dt;
    if (this.result) this.endT += dt;
    this.stepPlayer(inp || {}, dt);
    this.assignTokens(dt);
    for (const a of this.air) if (a !== this.player) this.stepAI(a, dt);
    for (const g of this.ground) this.stepGround(g, dt);
    this.stepBullets(dt);
    this.stepMissiles(dt);
    this.stepBombs(dt);
    this.stepFlares(dt);
    this.stepTorps(dt);
    this.stepCollisions(dt);
    this.stepMission(dt);
    this.updateThreats();
    // forget long-dead entities
    if (++this.steps % 60 === 0) {
      this.air = this.air.filter((a) => a.alive || a.wreck || a === this.player);
      this.missiles = this.missiles.filter((m) => m.on);
      this.bombs = this.bombs.filter((b) => b.on);
      this.flares = this.flares.filter((f) => f.on);
      this.torps = this.torps.filter((t) => t.on);
    }
  }

  /**
   * Fairness: only the nearest few enemies chasing the player may shoot their
   * guns at it at any moment; the rest press in without firing.
   */
  assignTokens(dt) {
    this.tokenT = (this.tokenT || 0) - dt;
    if (this.tokenT > 0) return;
    this.tokenT = 0.5;
    const p = this.player;
    const list = [];
    for (const a of this.air) {
      if (a === p || !a.alive || a.side !== "enemy") continue;
      a.token = false;
      if (a.ai.target === p) list.push(a);
    }
    list.sort((a, b) => a.pos.distanceToSquared(p.pos) - b.pos.distanceToSquared(p.pos));
    const n = 2;
    for (let i = 0; i < Math.min(n, list.length); i++) list[i].token = true;
  }

  /* ------------------------------------------------------------ player */
  stepPlayer(inp, dt) {
    const p = this.player;
    const S = this.stats;
    if (!p.alive) {
      this.stepWreck(p, dt);
      return;
    }
    for (const k in p.cd) p.cd[k] = Math.max(0, p.cd[k] - dt);
    // throttle
    if (inp.thrUp) p.throttle = Math.min(1, p.throttle + 0.55 * dt);
    if (inp.thrDown) p.throttle = Math.max(0, p.throttle - 0.55 * dt);
    if (inp.throttle != null) p.throttle = clamp(inp.throttle, 0, 1);
    // stick: keyboard wins per axis, the mouse-aim autopilot fills the rest
    let pitch = inp.pitch || 0;
    let roll = inp.roll || 0;
    let yaw = inp.yaw || 0;
    if (inp.aim && inp.assist !== false) {
      const ap = autopilot(p.quat, inp.aim, this._ap || (this._ap = {}), dt);
      if (!pitch) pitch = ap.pitch;
      if (!roll) roll = ap.roll;
      if (!yaw) yaw = ap.yaw;
    }
    if (inp.stick) {
      pitch = clamp(pitch + inp.stick.pitch, -1, 1);
      roll = clamp(roll + inp.stick.roll, -1, 1);
    }
    const stall = S.stallSpeed;
    const auth = clamp((p.speed - stall * 0.55) / (stall * 0.7), 0.22, 1) * (p.speed > S.maxSpeed * 1.05 ? 0.85 : 1);
    const k1 = 1 - Math.exp(-dt * 6);
    p.rate.p += (pitch * S.pitchRate * auth - p.rate.p) * k1;
    p.rate.r += (roll * S.rollRate * auth - p.rate.r) * (1 - Math.exp(-dt * 8));
    p.rate.y += (yaw * S.yawRate * auth - p.rate.y) * (1 - Math.exp(-dt * 4));
    const q = p.quat;
    q.multiply(_q.setFromAxisAngle(AX, p.rate.p * dt));
    q.multiply(_q.setFromAxisAngle(AY, -p.rate.y * dt));
    q.multiply(_q.setFromAxisAngle(AZ, -p.rate.r * dt));
    // banking turns: lift pulls the heading round toward the low wing
    const right = _a.set(1, 0, 0).applyQuaternion(q);
    const fwd0 = _b.set(0, 0, -1).applyQuaternion(q);
    const bankSin = -right.y;
    const horiz = Math.sqrt(Math.max(0, 1 - fwd0.y * fwd0.y));
    q.premultiply(_q.setFromAxisAngle(UP, -bankSin * 0.34 * auth * horiz * dt));
    // stall: the nose falls through toward the ground
    p.stalled = p.speed < stall;
    if (p.stalled) {
      const fwd = _b.set(0, 0, -1).applyQuaternion(q);
      const axis = _c.crossVectors(fwd, _d.set(0, -1, 0));
      const s = axis.length();
      if (s > 1e-4) {
        axis.multiplyScalar(1 / s);
        q.premultiply(_q.setFromAxisAngle(axis, Math.min(1.3, 0.5 + (stall - p.speed) * 0.03) * dt));
      }
    }
    q.normalize();
    const fwd = p.dir.set(0, 0, -1).applyQuaternion(q);
    // speed: thrust/drag toward the throttle setting, gravity along the flight path
    const target = S.minSpeed + p.throttle * (S.maxSpeed - S.minSpeed);
    p.ab = p.throttle > 0.88;
    p.speed += (target - p.speed) * 0.2 * S.accel * dt;
    p.speed -= G * fwd.y * 1.15 * dt;
    p.speed -= Math.abs(p.rate.p) * 2 * dt; // hard pulls bleed energy
    // thin air above the ceiling
    p.warn.ceiling = p.pos.y > CEILING;
    if (p.warn.ceiling) {
      p.speed -= (p.pos.y - CEILING) * 0.05 * dt + 8 * dt;
      if (fwd.y > 0) q.premultiply(_q.setFromAxisAngle(_c.crossVectors(fwd, UP).normalize(), -0.4 * dt));
    }
    p.speed = clamp(p.speed, 25, S.maxSpeed * 1.3);
    p.vel.copy(fwd).multiplyScalar(p.speed);
    if (p.stalled) p.vel.y -= (stall - p.speed) * 0.8 + 6;
    p.pos.addScaledVector(p.vel, dt);
    // bank angle for HUD
    p.bank = Math.atan2(bankSin, _c.set(0, 1, 0).applyQuaternion(q).y);
    // ground
    const gh = this.ground_(p.pos.x, p.pos.z);
    const agl = p.pos.y - gh;
    p.agl = agl;
    if (agl < 2.5) {
      p.pos.y = gh + 2.5;
      if (this.god) {
        p.quat.premultiply(_q.setFromAxisAngle(_c.crossVectors(fwd, UP).normalize(), 0.6));
      } else {
        this.damage(p, 999, { kind: "crash", side: "env" });
        this.fxPush(gh <= 0.5 ? "splash" : "groundExplosion", p.pos, 2.2);
        return;
      }
    }
    // pull-up warning: will we hit the ground within ~4 s?
    const look = _c.copy(p.pos).addScaledVector(p.vel, 3.2);
    p.warn.pullUp = fwd.y < -0.05 && (look.y < this.ground_(look.x, look.z) + 30 || agl + p.vel.y * 4 < 0);
    p.warn.stall = p.stalled || p.speed < stall * 1.12;
    // boundary
    const r = Math.hypot(p.pos.x, p.pos.z);
    p.warn.boundary = r > WORLD_RADIUS;
    if (p.warn.boundary) {
      p.outT += dt;
      if (p.outT > 12 && !this.result) this.finish(false, "Left the combat zone");
    } else p.outT = Math.max(0, p.outT - dt * 2);
    // rearm / repair over home base
    const hb = PADS[this.world].homeBase;
    if (Math.hypot(p.pos.x - hb.x, p.pos.z - hb.z) < hb.r && agl < 400 && p.speed < 210) {
      p.rearmT += dt;
      if (p.rearmT >= 3) {
        p.rearmT = 0;
        p.ammo.gun = S.gunAmmo;
        p.ammo.missiles = S.missiles;
        p.ammo.bombs = S.bombs;
        p.ammo.flares = S.flares;
        p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.5);
        this.emit("rearm");
      }
    } else p.rearmT = 0;
    // damage visuals
    if (p.hp < p.maxHp * 0.5 && this.rand() < dt * 3) this.fxPush("sparks", p.pos, 0.6);

    this.playerWeapons(inp, dt);
  }

  playerWeapons(inp, dt) {
    const p = this.player;
    const S = this.stats;
    if (this.result) return;
    // gun
    p.firing = !!inp.fire && p.ammo.gun > 0;
    if (p.firing && p.cd.gun <= 0) {
      p.cd.gun += 1 / S.gunRate;
      p.ammo.gun--;
      p.gunSide = -p.gunSide;
      const muzzle = _a.copy(p.pos).addScaledVector(p.dir, 9);
      muzzle.addScaledVector(_b.set(1, 0, 0).applyQuaternion(p.quat), p.gunSide * 1.2);
      const spread = 0.0035;
      // gun assist: near the lead point of the selected air target the rounds converge on it
      const gd = this.gunLead(p.lock.target);
      const aimDir = gd && Math.acos(clamp(gd.dot(p.dir), -1, 1)) < 0.06 ? gd : p.dir;
      _c.copy(aimDir).add(_d.set((this.rand() - 0.5) * spread, (this.rand() - 0.5) * spread, (this.rand() - 0.5) * spread)).normalize();
      this.fireBullet(muzzle, _c, 1050, p.speed, "player", S.gunDamage, p, 1.1);
      this.shotsFired++;
      if (p.ammo.gun === 0) this.emit("empty", { weapon: "gun" });
    }
    if (!p.firing) p.cd.gun = Math.max(p.cd.gun, 0);
    // target selection + lock
    this.updateLock(inp, dt);
    // missile
    if (inp.missile) {
      if (p.ammo.missiles <= 0) this.emit("empty", { weapon: "missile" });
      else if (p.cd.missile <= 0) {
        p.cd.missile = 0.7;
        p.ammo.missiles--;
        const tgt = p.lock.locked ? p.lock.target : null;
        const side = (p.ammo.missiles % 2 ? 1 : -1) * 2.6;
        const pos = _a.copy(p.pos).addScaledVector(_b.set(1, 0, 0).applyQuaternion(p.quat), side).addScaledVector(_c.set(0, -1, 0).applyQuaternion(p.quat), 1);
        this.launchMissile(pos, p.dir, p.speed, "player", tgt, { dmg: S.missileDamage, turn: 3.0, gimbal: 1.25, max: 560, prox: 15, life: 9, by: p });
        this.emit("missile", { locked: !!tgt });
      }
    }
    // bomb
    if (inp.bomb) {
      if (p.ammo.bombs <= 0) this.emit("empty", { weapon: "bomb" });
      else if (p.cd.bomb <= 0) {
        p.cd.bomb = 0.45;
        p.ammo.bombs--;
        const pos = _a.copy(p.pos).addScaledVector(_b.set(0, -1, 0).applyQuaternion(p.quat), 1.6);
        this.bombs.push({ on: true, pos: pos.clone(), vel: p.vel.clone().addScaledVector(_c.set(0, -1, 0).applyQuaternion(p.quat), 4), life: 40, quat: p.quat.clone(), by: p });
        this.emit("bomb");
      }
    }
    // flares
    if (inp.flare) {
      if (p.ammo.flares <= 0) this.emit("empty", { weapon: "flare" });
      else if (p.cd.flare <= 0) {
        p.cd.flare = 1.4;
        p.ammo.flares--;
        p.flareQueue = 4;
        p.flareT = 0;
        p.flareActive = 2.6;
        this.decoy(p, 0.78);
        this.emit("flare");
      }
    }
    if (p.flareQueue > 0) {
      p.flareT -= dt;
      if (p.flareT <= 0) {
        p.flareT = 0.1;
        p.flareQueue--;
        this.dropFlare(p);
      }
    }
    p.flareActive = Math.max(0, p.flareActive - dt);
    // bomb impact prediction (CCIP)
    p.ccip = null;
    if (p.ammo.bombs > 0 && p.dir.y < 0.25 && p.agl < 3500) p.ccip = this.predictBomb(p.pos, p.vel);
  }

  /** Unit direction to the gun lead point of an air target, or null. */
  gunLead(T) {
    const p = this.player;
    if (!T || !T.alive || T.cat !== "air") return null;
    const dist = T.pos.distanceTo(p.pos);
    if (dist > 1000) return null;
    const t = dist / (1050 + p.speed);
    return (this._lead || (this._lead = new THREE.Vector3())).copy(T.pos).addScaledVector(T.vel, t).sub(p.pos).normalize();
  }

  predictBomb(pos, vel) {
    const x = _a.copy(pos);
    const v = _b.copy(vel);
    for (let i = 0; i < 400; i++) {
      v.y -= G * 1.6 * 0.05;
      v.multiplyScalar(1 - 0.02 * 0.05);
      x.addScaledVector(v, 0.05);
      const gh = this.ground_(x.x, x.z);
      if (x.y <= gh) return { x: x.x, y: gh, z: x.z, t: i * 0.05 };
    }
    return null;
  }

  /** Enemy (or ground) entities the player can shoot at. */
  hostiles() {
    const out = [];
    for (const a of this.air) if (a.alive && a.side === "enemy") out.push(a);
    for (const g of this.ground) if (g.alive && g.side === "enemy") out.push(g);
    return out;
  }

  /** Best target near the aim direction (radians cone), preferring objectives. */
  pickTarget(aim, cone, exclude = null) {
    const p = this.player;
    let best = null;
    let bestScore = Infinity;
    const objTag = this.stage?.def.type === "destroy" ? this.stage.def.tag : null;
    for (const e of this.hostiles()) {
      if (e === exclude) continue;
      _a.copy(e.pos).sub(p.pos);
      const dist = _a.length();
      if (dist > (e.cat === "air" ? 6500 : 5000)) continue;
      const ang = Math.acos(clamp(_a.dot(aim) / dist, -1, 1));
      if (ang > cone) continue;
      const score = ang * 2.5 + dist / 6000 - (e.tag && e.tag === objTag ? 0.15 : 0);
      if (score < bestScore) {
        bestScore = score;
        best = e;
      }
    }
    return best;
  }

  updateLock(inp, dt) {
    const p = this.player;
    const L = p.lock;
    const S = this.stats;
    if (L.target && !L.target.alive) {
      L.target = null;
      L.manual = false;
      L.t = 0;
      if (L.locked) this.emit("lockLost");
      L.locked = false;
    }
    if (inp.lock) {
      const aim = inp.aim || p.dir;
      let t = this.pickTarget(aim, 0.6, null);
      if (t && t === L.target) t = this.pickTarget(aim, 1.2, L.target) || t; // press again → next target
      if (t) {
        if (t !== L.target) {
          L.t = 0;
          L.locked = false;
        }
        L.target = t;
        L.manual = true;
        this.emit("target", { name: t.name });
      } else this.emit("noTarget");
    }
    if (!L.target || (!L.manual && p.cd.lock <= 0)) {
      p.cd.lock = 0.5;
      const t = this.pickTarget(p.dir, 0.22, null);
      if (t && t !== L.target) {
        L.target = t;
        L.t = 0;
        L.locked = false;
      }
    }
    const T = L.target;
    if (!T) return;
    _a.copy(T.pos).sub(p.pos);
    const dist = _a.length();
    L.dist = dist;
    const ang = Math.acos(clamp(_a.dot(p.dir) / dist, -1, 1));
    L.ang = ang;
    const inCone = ang < 0.42 && dist < (T.cat === "air" ? 3800 : 3400) && dist > 120;
    const was = L.locked;
    if (inCone) L.t = Math.min(S.lockTime, L.t + dt);
    else L.t = Math.max(0, L.t - dt * 1.5);
    L.locked = L.t >= S.lockTime;
    if (L.locked && !was) this.emit("locked");
    if (!L.locked && was) this.emit("lockLost");
    if (!inCone && dist > 7000) {
      L.target = null;
      L.manual = false;
    }
  }

  /* ------------------------------------------------------------ projectiles */
  fireBullet(pos, dir, speed, inherit, side, dmg, by, life = 1.2) {
    const b = this.bullets[this.bi];
    this.bi = (this.bi + 1) % this.bullets.length;
    b.on = true;
    b.pos.copy(pos);
    b.prev.copy(pos);
    b.vel.copy(dir).multiplyScalar(speed + inherit);
    b.life = life;
    b.side = side;
    b.dmg = dmg;
    b.by = by;
    b.tracer = (this.bi & 1) === 0 || side !== "player";
  }

  stepBullets(dt) {
    const air = this.air;
    const ground = this.ground;
    for (const b of this.bullets) {
      if (!b.on) continue;
      b.life -= dt;
      if (b.life <= 0) {
        b.on = false;
        continue;
      }
      b.prev.copy(b.pos);
      b.vel.y -= G * 0.25 * dt;
      b.pos.addScaledVector(b.vel, dt);
      const friendly = b.side === "player" || b.side === "friend";
      // aircraft
      let hit = null;
      for (const a of air) {
        if (!a.alive) continue;
        const aFriendly = a.side === "player" || a.side === "friend";
        if (aFriendly === friendly) continue;
        if (segHit(b.prev, b.pos, a.pos, a.radius)) {
          hit = a;
          break;
        }
      }
      if (!hit && b.pos.y < 900 + this.maxGround()) {
        for (const g of ground) {
          if (!g.alive) continue;
          const gF = g.side === "friend";
          if (gF === friendly) continue;
          if (segHit(b.prev, b.pos, _a.set(g.pos.x, g.pos.y + g.radius * 0.35, g.pos.z), g.radius)) {
            hit = g;
            break;
          }
        }
      }
      if (hit) {
        b.on = false;
        if (b.by === this.player) this.shotsHit++;
        this.damage(hit, b.dmg, { kind: "gun", side: b.side, by: b.by });
        this.fxPush("impact", b.pos, hit === this.player ? 0.5 : 1);
        continue;
      }
      if (b.pos.y < 1700) {
        const gh = this.ground_(b.pos.x, b.pos.z);
        if (b.pos.y <= gh) {
          b.on = false;
          this.fxPush(gh <= 0.5 ? "bulletSplash" : "dust", _a.set(b.pos.x, gh, b.pos.z), 1);
        }
      }
    }
  }

  maxGround() {
    return this._maxG ?? (this._maxG = Math.max(0, ...this.ground.map((g) => g.pos.y)));
  }

  launchMissile(pos, dir, inherit, side, target, o) {
    const m = {
      on: true, side, pos: pos.clone(), dir: dir.clone().normalize(), speed: inherit + 30, max: o.max, turn: o.turn, gimbal: o.gimbal,
      target, life: o.life || 9, dmg: o.dmg, prox: o.prox || 12, by: o.by, age: 0, decoyed: false, armed: 0.35,
      maxAcc: o.maxAcc || (side === "enemy" ? 300 : 700), // lateral m/s² — what makes enemy missiles dodgeable
    };
    // flares already in the air spoil a fresh launch
    if (target && target.flareActive > 0 && this.rand() < 0.5) this.decoyMissile(m, target);
    this.missiles.push(m);
    this.fxPush("launch", m.pos, 1);
    return m;
  }

  /** Release flares from `who`: every missile chasing it may be decoyed. */
  decoy(who, chance) {
    for (const m of this.missiles) {
      if (!m.on || m.target !== who) continue;
      if (m.pos.distanceTo(who.pos) > 3200) continue;
      if (this.rand() < chance) this.decoyMissile(m, who);
    }
  }
  decoyMissile(m, who) {
    const f = this.dropFlare(who);
    m.target = f;
    m.decoyed = true;
    if (who === this.player) this.emit("decoyed");
  }
  dropFlare(who) {
    const f = {
      on: true, cat: "flare", alive: true, pos: who.pos.clone().addScaledVector(who.dir, -6), vel: who.vel.clone().multiplyScalar(0.35).add(_a.set((this.rand() - 0.5) * 30, -12 - this.rand() * 10, (this.rand() - 0.5) * 30)),
      life: 2.8,
    };
    this.flares.push(f);
    return f;
  }

  stepMissiles(dt) {
    for (const m of this.missiles) {
      if (!m.on) continue;
      m.age += dt;
      m.life -= dt;
      m.speed = Math.min(m.max, m.speed + 260 * dt);
      const T = m.target;
      if (T && (T.alive === false || (T.cat === "flare" && !T.on))) m.target = null;
      if (m.target && m.age > 0.15) {
        const tp = m.target.pos;
        const tv = m.target.vel || _d.set(0, 0, 0);
        _a.copy(tp).sub(m.pos);
        const dist = _a.length();
        // gimbal limit: a target that slips too far off the seeker's axis is lost
        const los = Math.acos(clamp(_a.dot(m.dir) / dist, -1, 1));
        if (los > m.gimbal) {
          m.target = null;
          if (T === this.player && !m.told) {
            m.told = true;
            this.emit("missileEvaded");
          }
        } else {
          const tgo = clamp(dist / Math.max(80, m.speed), 0, 4);
          _b.copy(tp).addScaledVector(tv, tgo * 0.85).sub(m.pos).normalize();
          turnToward(m.dir, _b, Math.min(m.turn, m.maxAcc / m.speed) * dt);
          const hitR = m.prox + (m.target.radius || 4) * 0.6;
          if (dist < hitR + m.speed * dt * 0.5) {
            this.explodeMissile(m, m.target);
            continue;
          }
        }
      }
      m.pos.addScaledVector(m.dir, m.speed * dt);
      // proximity against any opposing aircraft when unguided
      if (!m.target && m.age > m.armed) {
        const friendly = m.side !== "enemy";
        for (const a of this.air) {
          if (!a.alive || (a.side !== "enemy") === friendly) continue;
          if (a.pos.distanceToSquared(m.pos) < (m.prox * 0.7 + a.radius) ** 2) {
            this.explodeMissile(m, a);
            break;
          }
        }
        if (!m.on) continue;
      }
      const gh = this.ground_(m.pos.x, m.pos.z);
      if (m.pos.y <= gh) {
        m.pos.y = gh;
        this.explodeMissile(m, null);
        continue;
      }
      if (m.life <= 0) {
        m.on = false;
        this.fxPush("airburst", m.pos, 0.6);
        if ((T === this.player || m.decoyed) && m.side === "enemy" && !m.told) this.emit("missileEvaded");
      }
    }
  }

  explodeMissile(m, target) {
    m.on = false;
    const fl = target && target.cat === "flare";
    if (target && !fl) this.damage(target, m.dmg, { kind: "missile", side: m.side, by: m.by });
    else this.splash(m.pos, 28, m.dmg * 0.5, m.side, m.by, "missile");
    const gh = this.ground_(m.pos.x, m.pos.z);
    const low = m.pos.y - gh < 15;
    this.fxPush(low ? (gh <= 0.5 ? "splash" : "groundExplosion") : "explosion", m.pos, fl ? 0.6 : 1.1);
    if (fl && m.side === "enemy" && !m.told) {
      m.told = true;
      this.emit("missileEvaded");
    }
  }

  splash(pos, r, dmg, side, by, kind) {
    const friendly = side !== "enemy";
    for (const g of this.ground) {
      if (!g.alive || (g.side === "friend") === friendly) continue;
      const d = Math.hypot(g.pos.x - pos.x, g.pos.z - pos.z) - g.radius * 0.6;
      if (d < r && Math.abs(g.pos.y - pos.y) < r + g.radius) this.damage(g, dmg * (1 - 0.65 * clamp(d / r, 0, 1)), { kind, side, by });
    }
    for (const a of this.air) {
      if (!a.alive) continue;
      const aF = a.side !== "enemy";
      if (aF === friendly) continue;
      const d = a.pos.distanceTo(pos);
      if (d < r) this.damage(a, dmg * 0.6 * (1 - d / r), { kind, side, by });
    }
  }

  stepBombs(dt) {
    for (const b of this.bombs) {
      if (!b.on) continue;
      b.life -= dt;
      b.vel.y -= G * 1.6 * dt;
      b.vel.multiplyScalar(1 - 0.02 * dt);
      b.pos.addScaledVector(b.vel, dt);
      const gh = this.ground_(b.pos.x, b.pos.z);
      // direct hit on a tall target (hangar, ship superstructure)
      let direct = null;
      for (const g of this.ground) {
        if (!g.alive || g.side === "friend") continue;
        if (Math.hypot(g.pos.x - b.pos.x, g.pos.z - b.pos.z) < g.radius * 0.8 && b.pos.y < g.pos.y + g.radius * 0.7) {
          direct = g;
          break;
        }
      }
      if (b.pos.y <= gh || direct || b.life <= 0) {
        b.on = false;
        b.pos.y = Math.max(b.pos.y, gh);
        if (direct) this.damage(direct, 110, { kind: "bomb", side: "player", by: b.by });
        this.splash(b.pos, 58, 150, "player", b.by, "bomb");
        this.fxPush(gh <= 0.5 && !direct ? "bigSplash" : "bombExplosion", b.pos, 1.6);
        this.emit("bombHit", { x: b.pos.x, y: b.pos.y, z: b.pos.z });
      }
    }
  }

  stepFlares(dt) {
    for (const f of this.flares) {
      if (!f.on) continue;
      f.life -= dt;
      f.vel.y -= G * 0.6 * dt;
      f.vel.multiplyScalar(1 - 0.6 * dt);
      f.pos.addScaledVector(f.vel, dt);
      if (f.life <= 0) {
        f.on = false;
        f.alive = false;
      }
    }
  }

  stepTorps(dt) {
    for (const t of this.torps) {
      if (!t.on) continue;
      t.life -= dt;
      t.pos.addScaledVector(t.dir, t.speed * dt);
      const T = t.target;
      if (T && T.alive) {
        _a.copy(T.pos).sub(t.pos);
        _a.y = 0;
        const dist = _a.length();
        if (dist < T.radius * 0.9) {
          t.on = false;
          this.damage(T, 95, { kind: "torpedo", side: "enemy" });
          this.fxPush("bigSplash", t.pos, 1.8);
          this.fxPush("groundExplosion", _b.copy(T.pos).setY(4), 1.3);
          this.emit("torpedoHit", { name: T.name });
          continue;
        }
        turnToward(t.dir, _a.normalize(), 0.12 * dt);
        t.dir.y = 0;
        t.dir.normalize();
      }
      if (t.life <= 0 || this.hf.height(t.pos.x, t.pos.z) > -2) t.on = false;
    }
  }

  /* ------------------------------------------------------------ damage */
  damage(e, amount, src) {
    if (!e.alive) return;
    if (e.cat === "ground" && src.kind === "gun") amount *= e.def.armor;
    if (e === this.player) {
      if (this.god && src.kind !== "crash") amount *= 0.0;
      if (this.result?.win) return;
      e.hitT = this.t;
      this.emit("hit", { kind: src.kind, amount });
    } else e.hitT = this.t;
    e.hp -= amount;
    if (e.hp <= 0) this.kill(e, src);
  }

  kill(e, src) {
    e.alive = false;
    e.hp = 0;
    e.by = src.by || null;
    if (e.tag) this.tagDead[e.tag] = (this.tagDead[e.tag] || 0) + 1;
    if (e.cat === "air") {
      e.wreck = true;
      e.wreckT = 0;
      e.spin = (this.rand() - 0.5) * 6;
      this.fxPush("explosion", e.pos, e.def.role === "bomber" || e.kind === "cargo" ? 2 : 1.4);
      if (e.side === "enemy") this.enemyAirDown++;
    } else {
      e.deadT = this.t;
      this.fxPush(e.def.naval ? "shipExplosion" : e.kind === "fuel" ? "fuelExplosion" : "groundExplosion", _a.copy(e.pos).setY(e.pos.y + e.radius * 0.3), e.radius > 30 ? 2.4 : 1.5);
    }
    if (e === this.player) {
      e.dead = true;
      e.deadT = 0;
      this.emit("destroyed", { reason: src.kind });
      this.finish(false, src.kind === "crash" ? "Your aircraft crashed" : "Your aircraft was destroyed");
      return;
    }
    const byPlayer = src.by === this.player;
    if (byPlayer && e.side === "enemy") this.kills++;
    this.emit("kill", { name: e.name, cat: e.cat, side: e.side, byPlayer, tag: e.tag, boss: !!e.def.boss });
    if (this.player.lock.target === e) this.player.lock.target = null;
  }

  stepWreck(a, dt) {
    if (!a.wreck) return;
    a.wreckT += dt;
    a.speed = Math.max(60, a.speed - 20 * dt);
    a.dir.y = Math.max(-0.95, a.dir.y - 0.5 * dt);
    a.dir.normalize();
    a.vel.copy(a.dir).multiplyScalar(a.speed);
    a.pos.addScaledVector(a.vel, dt);
    a.quat.multiply(_q.setFromAxisAngle(AZ, a.spin * dt));
    const gh = this.ground_(a.pos.x, a.pos.z);
    if (a.pos.y <= gh + 2 || a.wreckT > 9) {
      a.wreck = false;
      a.pos.y = Math.max(a.pos.y, gh);
      this.fxPush(gh <= 0.5 ? "bigSplash" : "groundExplosion", a.pos, 1.3);
    }
  }

  /* ------------------------------------------------------------ AI */
  pickAITarget(a) {
    const ai = a.ai;
    const friendly = a.side !== "enemy";
    if (ai.targetTag) {
      let best = null;
      let bd = Infinity;
      for (const e of this.air) if (e.alive && e.tag === ai.targetTag) {
        const dd = e.pos.distanceToSquared(a.pos);
        if (dd < bd) { bd = dd; best = e; }
      }
      for (const e of this.ground) if (e.alive && e.tag === ai.targetTag) {
        const dd = e.pos.distanceToSquared(a.pos);
        if (dd < bd) { bd = dd; best = e; }
      }
      // a player chewing on our tail gets our attention
      const p = this.player;
      if (p.alive && a.def.aggr > 0 && p.pos.distanceTo(a.pos) < 700 && a.hitT > this.t - 3) return p;
      if (best) return best;
    }
    let best = null;
    let bd = Infinity;
    for (const e of this.air) {
      if (!e.alive || e === a) continue;
      if ((e.side !== "enemy") === friendly) continue;
      let dd = e.pos.distanceTo(a.pos);
      if (e === this.player) dd *= 0.7;
      if (e.def?.role === "path" || e.def?.role === "gunship") dd *= 0.9;
      if (dd < bd) { bd = dd; best = e; }
    }
    return best;
  }

  stepAI(a, dt) {
    if (!a.alive) {
      this.stepWreck(a, dt);
      return;
    }
    const def = a.def;
    const ai = a.ai;
    ai.t -= dt;
    ai.missileCd -= dt;
    ai.flareCd -= dt;
    a.gunCd -= dt;
    ai.retarget -= dt;
    if (ai.retarget <= 0 || (ai.target && !ai.target.alive)) {
      ai.retarget = 1.5;
      ai.target = def.role === "path" || def.role === "bomber" ? null : this.pickAITarget(a);
    }
    const T = ai.target;
    const D = _D.copy(a.dir); // desired direction (own vector: helpers below use the scratch ones)
    let sp = def.speed;
    let dist = Infinity;
    if (T) {
      _a.copy(T.pos).sub(a.pos);
      dist = _a.length();
    }
    const role = def.role || "fighter";
    if (role === "path" || role === "gunship" || role === "bomber") this.aiPath(a, D, dt);
    else if (role === "torpedo") sp = this.aiTorpedo(a, D, dt);
    else sp = this.aiFighter(a, T, dist, D, dt);
    // ---- avoidance: terrain, boundary, neighbours
    const minAgl = role === "torpedo" && ai.state === "run" ? 40 : role === "path" || role === "gunship" ? 160 : 130;
    const gh = this.ground_(a.pos.x, a.pos.z);
    _a.copy(a.pos).addScaledVector(a.dir, a.speed * 2.5);
    const ghA = this.ground_(_a.x, _a.z);
    _b.copy(a.pos).addScaledVector(a.dir, a.speed * 5);
    const ghB = this.ground_(_b.x, _b.z);
    const danger = Math.max(gh + minAgl - a.pos.y, ghA + minAgl - _a.y, (ghB + minAgl * 0.6 - _b.y) * 0.6);
    if (danger > 0) {
      D.y = Math.max(D.y, clamp(0.2 + danger / 150, 0.2, 0.9));
      D.normalize();
    }
    const r = Math.hypot(a.pos.x, a.pos.z);
    if (r > WORLD_RADIUS * 0.9) {
      _a.set(-a.pos.x, 0, -a.pos.z).normalize();
      D.lerp(_a, clamp((r - WORLD_RADIUS * 0.9) / 1200, 0, 0.8)).normalize();
    }
    if (a.pos.y > CEILING - 400 && D.y > 0) {
      D.y *= 0.2;
      D.normalize();
    }
    for (const o of this.air) {
      if (o === a || !o.alive) continue;
      const dd = o.pos.distanceToSquared(a.pos);
      if (dd < 110 * 110 && dd > 1) {
        _a.copy(a.pos).sub(o.pos).normalize();
        D.addScaledVector(_a, o.side === a.side ? 0.5 : 0.25).normalize();
      }
    }
    // ---- fly
    _d.copy(a.dir);
    const turnMul = a.hp < a.maxHp * 0.35 ? 0.8 : 1;
    turnToward(a.dir, D, (def.turn || 0.8) * turnMul * dt);
    a.speed += (sp - a.speed) * 0.7 * dt;
    a.speed -= G * a.dir.y * 0.4 * dt;
    a.vel.copy(a.dir).multiplyScalar(a.speed);
    a.pos.addScaledVector(a.vel, dt);
    // bank into the turn
    const acc = _a.copy(a.dir).sub(_d).multiplyScalar(a.speed / Math.max(dt, 1e-4));
    const rightV = _b.crossVectors(a.dir, UP);
    if (rightV.lengthSq() > 1e-6) rightV.normalize();
    const lat = acc.dot(rightV);
    const bankT = clamp(Math.atan2(lat, G + acc.dot(UP)), -1.35, 1.35);
    a.bank += (bankT - a.bank) * (1 - Math.exp(-dt * 3.5));
    orient(a.quat, a.dir, a.bank);
    // hard ground contact
    if (a.pos.y < this.ground_(a.pos.x, a.pos.z) + 2) this.damage(a, 9999, { kind: "crash", side: "env" });
  }

  aiPath(a, D, dt) {
    const ai = a.ai;
    const path = ai.path;
    if (!path || !path.length) return;
    const wp = path[Math.min(ai.pi, path.length - 1)];
    const wy = wp.length === 3 ? wp[1] : a.pos.y;
    const wx = wp[0];
    const wz = wp.length === 3 ? wp[2] : wp[1];
    if (ai.pi < path.length) {
      _a.set(wx, wy, wz).sub(a.pos);
      const hd = Math.hypot(_a.x, _a.z);
      D.copy(_a).normalize();
      if (hd < 260) {
        ai.pi++;
        if (ai.pi >= path.length) ai.arrived = true;
      }
    } else {
      // orbit the last waypoint
      const cx = wx;
      const cz = wz;
      const ang = Math.atan2(a.pos.z - cz, a.pos.x - cx) + 0.5;
      _a.set(cx + Math.cos(ang) * 700, wy, cz + Math.sin(ang) * 700).sub(a.pos).normalize();
      D.copy(_a);
    }
    // gunships rocket the strike area once there
    if (a.def.role === "gunship" && ai.arrived) {
      ai.rocketCd -= dt;
      if (ai.rocketCd <= 0) {
        ai.rocketCd = 3.2 + this.rand() * 1.5;
        let best = null;
        let bd = 2600;
        for (const g of this.ground) {
          if (!g.alive || g.side !== "enemy") continue;
          const dd = g.pos.distanceTo(a.pos);
          if (dd < bd) { bd = dd; best = g; }
        }
        if (best) {
          _b.copy(best.pos).sub(a.pos).normalize();
          this.launchMissile(a.pos, _b, a.speed, "friend", best, { dmg: 32, turn: 2.4, gimbal: 2.5, max: 380, prox: 10, life: 8, by: a });
        }
      }
    }
    // bomber tail gunner
    if (a.def.role === "bomber") {
      const p = this.player;
      if (p.alive) {
        _a.copy(p.pos).sub(a.pos);
        const dist = _a.length();
        if (dist < 650 && _a.dot(a.dir) / dist < -0.2) {
          a.burstT -= dt;
          if (a.burstT < 0 && a.gunCd <= 0) {
            a.gunCd = 1 / 5;
            if (a.burstT < -0.9) a.burstT = 1.4 + this.rand() * 1.4;
            this.aimedShot(a, p, 800, 0.05, a.def.gunDmg * 0.6);
          }
        }
      }
    }
  }

  aiTorpedo(a, D, dt) {
    const ai = a.ai;
    let T = ai.target;
    if (!T || !T.alive) T = ai.target = this.pickAITarget(a);
    if (!T) return a.def.speed;
    _a.copy(T.pos).sub(a.pos);
    const hd = Math.hypot(_a.x, _a.z);
    if (ai.state === "run") {
      const alt = hd > 2200 ? 220 : 55;
      _a.y = alt - a.pos.y;
      D.copy(_a).normalize();
      if (hd < 950 && a.torps > 0 && Math.abs(a.pos.y - alt) < 60) {
        a.torps--;
        const lead = _b.copy(T.pos).addScaledVector(T.vel || _d.set(0, 0, 0), hd / 48);
        const dir = lead.sub(a.pos).setY(0).normalize().clone();
        this.torps.push({ on: true, pos: new THREE.Vector3(a.pos.x, 0, a.pos.z), dir, speed: 48, life: 40, target: T });
        this.emit("torpedo", { x: a.pos.x, z: a.pos.z });
        this.fxPush("bigSplash", _b.set(a.pos.x, 0, a.pos.z), 0.6);
        ai.state = "egress";
        ai.t = 9;
        ai.evade.set(-_a.x, 0, -_a.z).normalize().addScaledVector(UP, 0.35).normalize();
        if (Math.abs(ai.evade.x) < 0.01) ai.evade.x = 1;
      }
    } else if (ai.state === "egress") {
      D.copy(ai.evade);
      if (ai.t <= 0) {
        if (a.torps > 0) ai.state = "run";
        else {
          a.torps = 1; // reload in flight: arcade
          ai.state = "run";
        }
      }
    }
    return a.def.speed;
  }

  aimedShot(a, T, bulletSpeed, spread, dmg) {
    _a.copy(T.pos).sub(a.pos);
    const dist = _a.length();
    const t = dist / (bulletSpeed + a.speed * 0.5);
    _b.copy(T.pos).addScaledVector(T.vel || _d.set(0, 0, 0), t).sub(a.pos).normalize();
    _b.x += (this.rand() - 0.5) * spread * 2;
    _b.y += (this.rand() - 0.5) * spread * 2;
    _b.z += (this.rand() - 0.5) * spread * 2;
    _b.normalize();
    const muzzle = _c.copy(a.pos).addScaledVector(_b, a.radius + 2);
    this.fireBullet(muzzle, _b, bulletSpeed, a.cat === "air" ? a.speed * 0.3 : 0, a.side, dmg, a, 1.6);
  }

  aiFighter(a, T, dist, D, dt) {
    const def = a.def;
    const ai = a.ai;
    const p = this.player;
    let sp = def.speed;
    // patrol until something comes close
    if (ai.state === "patrol") {
      const wp = ai.patrol[ai.pi % ai.patrol.length];
      _a.set(wp[0], a.pos.y, wp[1]).sub(a.pos);
      _a.y = 0;
      if (_a.length() < 350) ai.pi++;
      D.copy(_a.normalize());
      D.y = Math.sin(this.t * 0.4 + a.id) * 0.06;
      D.normalize();
      sp = def.speed * 0.7;
      if (T && (dist < 3000 + def.aggr * 1500 || a.hitT > this.t - 1)) {
        ai.state = "detect";
        ai.t = ai.react;
      }
      return sp;
    }
    if (!T) {
      // nobody left: loiter
      D.set(Math.cos(this.t * 0.2 + a.id), 0, Math.sin(this.t * 0.2 + a.id));
      return def.speed * 0.7;
    }
    if (ai.state === "detect") {
      _a.copy(T.pos).sub(a.pos).normalize();
      D.lerp(_a, 0.5).normalize();
      if (ai.t <= 0) {
        ai.state = "pursue";
        if (a.side === "enemy" && this.rand() < 0.5) this.emit("spotted", { name: a.name });
      }
      return sp;
    }
    // threat checks → evade
    if (ai.state !== "evade" && ai.state !== "retreat") {
      let threatened = false;
      for (const m of this.missiles) {
        if (m.on && m.target === a && m.pos.distanceTo(a.pos) < 1900) {
          threatened = true;
          if (a.flares > 0 && ai.flareCd <= 0 && m.pos.distanceTo(a.pos) < 1100 && this.rand() < 0.35 + def.aggr * 0.4) {
            a.flares--;
            ai.flareCd = 3;
            this.dropFlare(a);
            this.dropFlare(a);
            this.decoy(a, 0.5 + def.acc * 0.25);
            this.fxPush("flareBurst", a.pos, 1);
          }
        }
      }
      if (!threatened && a.hitT > this.t - 0.25 && this.rand() < 0.3) threatened = true;
      if (!threatened && p.alive && T === p && dist < 800) {
        _a.copy(a.pos).sub(p.pos).normalize();
        const behind = _a.dot(p.dir) > 0.95 && _a.dot(a.dir) > 0.3;
        // a tail chase triggers a break now and then, not constantly — the player must get shots
        if (behind && this.t > (ai.tailCd || 0) && this.rand() < dt * (0.12 + def.aggr * 0.3)) {
          threatened = true;
          ai.tailCd = this.t + 5 + this.rand() * 3;
        }
      }
      if (threatened) {
        ai.state = "evade";
        ai.t = 1.8 + this.rand() * 2.2;
        const s = this.rand() < 0.5 ? 1 : -1;
        ai.evade.crossVectors(a.dir, UP).normalize().multiplyScalar(s).addScaledVector(UP, this.rand() * 0.9 - 0.45).addScaledVector(a.dir, 0.15).normalize();
      }
    }
    switch (ai.state) {
      case "evade": {
        D.copy(ai.evade);
        sp = def.speed;
        if (ai.t < 0.8 && !ai.reversed && this.rand() < dt * 1.2) {
          ai.reversed = true;
          ai.evade.x = -ai.evade.x;
          ai.evade.z = -ai.evade.z;
        }
        if (ai.t <= 0) {
          ai.reversed = false;
          if (a.hp < a.maxHp * 0.3 && def.aggr < 0.8 && !ai.retreated) {
            ai.state = "retreat";
            ai.retreated = true;
            ai.t = 6;
            this.emit("retreat", { name: a.name });
          } else ai.state = "pursue";
        }
        break;
      }
      case "retreat": {
        _a.copy(a.pos).sub(T.pos).setY(0).normalize();
        D.copy(_a).addScaledVector(UP, 0.15).normalize();
        sp = def.speed * 1.1;
        if (ai.t <= 0) ai.state = "pursue";
        break;
      }
      default: {
        // pursue / attack: chase a lead point, jink a little so nobody flies straight
        const lead = clamp(dist / 900, 0, 1.6);
        _a.copy(T.pos).addScaledVector(T.vel || _d.set(0, 0, 0), lead).sub(a.pos).normalize();
        D.copy(_a);
        ai.jink += dt * (0.6 + def.aggr * 0.5);
        if (dist > 900) {
          _b.crossVectors(a.dir, UP).normalize();
          D.addScaledVector(_b, Math.sin(ai.jink) * 0.18).addScaledVector(UP, Math.cos(ai.jink * 0.7) * 0.08).normalize();
        }
        ai.state = dist < 1300 ? "attack" : "pursue";
        if (dist < 160 && _a.dot(a.dir) > 0.7) {
          // overshoot: extend away
          ai.state = "evade";
          ai.t = 1.4;
          ai.evade.copy(a.dir).addScaledVector(UP, 0.25).normalize();
        }
        sp = def.speed * (dist > 2500 ? 1.05 : 1);
        if (T.cat === "air" && dist < 900) sp = Math.max(def.speed * 0.8, Math.min(def.speed * 1.05, (T.speed || def.speed) + (dist - 300) * 0.2));
        this.aiWeapons(a, T, dist, dt);
      }
    }
    // bosses get angrier
    if (def.boss) this.aceLogic(a);
    return sp;
  }

  aiWeapons(a, T, dist, dt) {
    const def = a.def;
    const ai = a.ai;
    // guns
    _a.copy(T.pos).addScaledVector(T.vel || _d.set(0, 0, 0), dist / 1100).sub(a.pos).normalize();
    const off = Math.acos(clamp(_a.dot(a.dir), -1, 1));
    const cone = 0.06 + (1 - (def.acc || 0.4)) * 0.08;
    a.burstT -= dt;
    if (a.burstT < -0.8) a.burstT = 1.1 + this.rand() * (2 - (def.aggr || 0.5));
    const mayShoot = T !== this.player || a.token || a.def.boss;
    if (mayShoot && dist < 800 && off < cone && a.burstT < 0 && a.gunCd <= 0) {
      a.gunCd = 1 / 10;
      const spread = (1 - (def.acc || 0.4)) * 0.045 + 0.01;
      this.aimedShot(a, T, 950, spread, def.gunDmg || 3);
    }
    // missiles: lock for a while (the target's RWR hears it), then launch
    if (a.missiles > 0 && ai.missileCd <= 0 && T.cat === "air") {
      if (dist > 550 && dist < 3000 && off < 0.5) ai.lockT += dt;
      else ai.lockT = Math.max(0, ai.lockT - dt);
      const need = def.boss ? 1.3 : 2.0;
      const spaced = T !== this.player || this.t > (this.nextEnemyMissile || 0);
      if (ai.lockT >= need && spaced) {
        if (T === this.player) this.nextEnemyMissile = this.t + (this.def.id >= 10 ? 4 : 6);
        ai.lockT = 0;
        a.missiles--;
        ai.missileCd = (def.boss ? 7 : 11) + this.rand() * 6 * (1.3 - def.aggr);
        const elite = def.look === "elite" || def.boss;
        this.launchMissile(a.pos, a.dir, a.speed, a.side, T, { dmg: elite ? 38 : 32, turn: elite ? 1.85 : 1.65, gimbal: 0.95, max: 400, prox: 9, life: 9, by: a });
        if (T === this.player) this.emit("missileLaunch", { name: a.name });
      }
    } else ai.lockT = Math.max(0, ai.lockT - dt);
  }

  aceLogic(a) {
    const ai = a.ai;
    const f = a.hp / a.maxHp;
    if (ai.phase === 0 && f < 0.66) {
      ai.phase = 1;
      this.radio("RED SCYTHE", "You draw blood. My wingmen — now!");
      this.spawn([{ air: "elite", ring: 2400, count: 2 }]);
    } else if (ai.phase === 1 && f < 0.33) {
      ai.phase = 2;
      this.radio("RED SCYTHE", "Enough games. No more mercy!");
      this.spawn([{ air: "interceptor", ring: 2400, count: 2 }]);
      a.def = { ...a.def, turn: a.def.turn * 1.1, acc: 0.85 };
    }
  }

  /* ------------------------------------------------------------ ground units */
  stepGround(g, dt) {
    if (!g.alive) return;
    const def = g.def;
    // movement
    if (g.path && g.path.length) {
      const wp = g.path[g.pi % g.path.length];
      _a.set(wp[0] - g.pos.x, 0, wp[1] - g.pos.z);
      const d = _a.length();
      if (d < 60) {
        if (g.path.length === 1) g.path = null;
        else g.pi++;
      } else {
        const want = Math.atan2(_a.x, _a.z);
        let dy = want - g.yaw;
        while (dy > Math.PI) dy -= Math.PI * 2;
        while (dy < -Math.PI) dy += Math.PI * 2;
        g.yaw += clamp(dy, -0.25 * dt, 0.25 * dt);
        g.vel.set(Math.sin(g.yaw), 0, Math.cos(g.yaw)).multiplyScalar(g.speed);
        g.pos.addScaledVector(g.vel, dt);
        if (!def.naval) g.pos.y = Math.max(0, this.hf.height(g.pos.x, g.pos.z));
      }
    } else g.vel.set(0, 0, 0);
    const w = g.w;
    w.cd -= dt;
    w.samCd -= dt;
    // flak gun
    if (def.weapon === "aa") {
      const T = this.groundTarget(g, 1700);
      if (T) {
        w.burstT -= dt;
        if (w.burstT < -1.4) w.burstT = 1 + this.rand() * 1.5;
        if (w.burstT < 0 && w.cd <= 0) {
          w.cd = 1 / 7;
          _b.copy(g.pos).setY(g.pos.y + g.radius * 0.6);
          const fake = { pos: _b, cat: "ground", speed: 0, side: g.side, radius: 2 };
          this.aimedShotFrom(fake, T, 800, 0.026, def.naval && g.side === "friend" ? 6 : 1.6, g);
        }
      }
    }
    // SAM launcher (or warship missiles)
    if (def.weapon === "sam" || def.sam) {
      const p = this.player;
      const ok = p.alive && g.side === "enemy" && p.pos.distanceTo(g.pos) < 4200 && p.agl > 70 && !this.result;
      const busy = this.missiles.some((m) => m.on && m.by === g);
      if (ok && w.samCd <= 0 && !busy) {
        w.lockT += dt;
        if (w.lockT > 2.6 && this.t > (this.nextGroundMissile || 0) && this.t > (this.nextEnemyMissile || 0) - 2) {
          this.nextGroundMissile = this.t + 7;
          w.lockT = 0;
          w.samCd = 10 + this.rand() * 4;
          _a.copy(p.pos).sub(g.pos).normalize();
          _a.y = Math.max(_a.y, 0.5);
          _a.normalize();
          this.launchMissile(_b.copy(g.pos).setY(g.pos.y + 6), _a, 60, "enemy", p, { dmg: 25, turn: 1.55, gimbal: 1.0, max: 380, prox: 9, life: 11, by: g });
          this.emit("missileLaunch", { name: g.name });
        }
      } else w.lockT = Math.max(0, w.lockT - dt * 2);
    }
  }

  groundTarget(g, range) {
    const friendly = g.side === "friend";
    let best = null;
    let bd = range;
    for (const a of this.air) {
      if (!a.alive) continue;
      if ((a.side !== "enemy") === friendly) continue;
      const d = a.pos.distanceTo(g.pos);
      if (d < bd) {
        bd = d;
        best = a;
      }
    }
    return best;
  }

  aimedShotFrom(src, T, speed, spread, dmg, by) {
    _a.copy(T.pos).sub(src.pos);
    const t = _a.length() / speed;
    _c.copy(T.pos).addScaledVector(T.vel, t).sub(src.pos).normalize();
    _c.x += (this.rand() - 0.5) * spread * 2;
    _c.y += (this.rand() - 0.5) * spread * 2;
    _c.z += (this.rand() - 0.5) * spread * 2;
    _c.normalize();
    this.fireBullet(_d.copy(src.pos).addScaledVector(_c, 4), _c, speed, 0, src.side, dmg, by, 2.4);
  }

  /* ------------------------------------------------------------ collisions + threats */
  stepCollisions() {
    const p = this.player;
    if (!p.alive) return;
    for (const a of this.air) {
      if (a === p || !a.alive) continue;
      const r = (a.radius + p.radius) * 0.62;
      if (a.pos.distanceToSquared(p.pos) < r * r) {
        this.damage(p, 40, { kind: "collision", side: "env" });
        this.damage(a, a.side === "enemy" ? 9999 : 60, { kind: "collision", side: "player", by: p });
        this.fxPush("explosion", a.pos, 1);
      }
    }
    // tall ground structures
    for (const g of this.ground) {
      if (!g.alive || g.def.naval) continue;
      if (Math.hypot(g.pos.x - p.pos.x, g.pos.z - p.pos.z) < g.radius * 0.8 && p.pos.y < g.pos.y + g.radius * 0.9) {
        this.damage(p, 999, { kind: "crash", side: "env" });
        return;
      }
    }
  }

  updateThreats() {
    const p = this.player;
    p.threats.length = 0;
    let lockedBy = 0;
    for (const m of this.missiles) {
      if (!m.on || m.target !== p) continue;
      p.threats.push(m);
    }
    for (const a of this.air) if (a.alive && a.side === "enemy" && a.ai.target === p && a.ai.lockT > 0.25) lockedBy++;
    for (const g of this.ground) if (g.alive && g.side === "enemy" && g.w.lockT > 0.3) lockedBy++;
    p.lockedBy = lockedBy;
    const prev = p.rwr;
    p.rwr = p.threats.length ? "missile" : lockedBy ? "lock" : "none";
    if (p.rwr !== prev) this.emit("rwr", { level: p.rwr });
  }

  /* ------------------------------------------------------------ queries */
  homeBase() {
    return PADS[this.world].homeBase;
  }

  /** Things worth showing on radar within `range` of the player. */
  radarContacts(range = 5000) {
    const p = this.player;
    const out = [];
    const tgt = p.lock.target;
    const markTag = this.stage?.def.type === "destroy" ? this.stage.def.tag : null;
    for (const a of this.air) {
      if (a === p || !a.alive) continue;
      const dx = a.pos.x - p.pos.x;
      const dz = a.pos.z - p.pos.z;
      if (dx * dx + dz * dz > range * range) continue;
      out.push({ dx, dz, dy: a.pos.y - p.pos.y, kind: a.side === "enemy" ? "air" : "friend", sel: a === tgt, obj: !!markTag && a.tag === markTag, boss: !!a.def.boss, heading: Math.atan2(a.dir.x, -a.dir.z) });
    }
    for (const g of this.ground) {
      if (!g.alive) continue;
      const dx = g.pos.x - p.pos.x;
      const dz = g.pos.z - p.pos.z;
      if (dx * dx + dz * dz > range * range) continue;
      out.push({ dx, dz, dy: 0, kind: g.side === "friend" ? "friendGround" : "ground", sel: g === tgt, obj: !!markTag && g.tag === markTag });
    }
    for (const m of this.missiles) {
      if (!m.on) continue;
      const dx = m.pos.x - p.pos.x;
      const dz = m.pos.z - p.pos.z;
      if (dx * dx + dz * dz > range * range) continue;
      out.push({ dx, dz, dy: 0, kind: m.target === p ? "threat" : "missile" });
    }
    return out;
  }

  enemyCount() {
    let n = 0;
    for (const a of this.air) if (a.alive && a.side === "enemy") n++;
    return n;
  }
}

/** Does segment p0→p1 pass within r of c? */
function segHit(p0, p1, c, r) {
  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;
  const dz = p1.z - p0.z;
  const fx = p0.x - c.x;
  const fy = p0.y - c.y;
  const fz = p0.z - c.z;
  // quick reject
  const mx = (p0.x + p1.x) * 0.5 - c.x;
  const my = (p0.y + p1.y) * 0.5 - c.y;
  const mz = (p0.z + p1.z) * 0.5 - c.z;
  const half = Math.abs(dx) + Math.abs(dy) + Math.abs(dz);
  if (Math.abs(mx) > half + r || Math.abs(my) > half + r || Math.abs(mz) > half + r) return false;
  const L = dx * dx + dy * dy + dz * dz;
  let t = L > 0 ? -(fx * dx + fy * dy + fz * dz) / L : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const px = fx + dx * t;
  const py = fy + dy * t;
  const pz = fz + dz * t;
  return px * px + py * py + pz * pz < r * r;
}
