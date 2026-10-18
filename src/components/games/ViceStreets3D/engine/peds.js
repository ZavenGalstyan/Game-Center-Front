/**
 * Vice Streets 3D — pedestrians.
 *
 * A bounded crowd (≈24) lives around the player. People walk the sidewalk
 * loop of a block, wait at the corner for the walk signal and cross on the
 * crosswalk to the next block, stand by shop fronts, sit on benches, stroll
 * the beach promenade. They side-step cars that are about to hit them, flee
 * from crashes, reckless drivers and police chases, get knocked down when
 * hit, then get up, walk back to the sidewalk and carry on.
 *
 * Everyone has health. Punches and cars stagger, knock down or kill them
 * (damage()); after getting up a victim flees or (a few) fights back.
 * Witnesses to violence flee, cower, and one may phone the police. The dead
 * stop thinking, stay on the ground a while and are then cleaned up.
 *
 * People only ever move along their sidewalk line or crosswalks while calm;
 * when fleeing they move freely but are pushed out of buildings and cars.
 */
import { randomLook, PED_LINES } from "../data/people.js";
import { walkSignal, COLS, ROWS } from "./city.js";
import { clamp, dist, dampA, headingOf, segClosest, wrapA } from "./util.js";
import { MOVES, startMove, stepMove } from "./combat.js";

/**
 * How a pedestrian reacts to violence:
 *   passive    runs (most people)
 *   defensive  fights back once hit, unless badly hurt
 *   aggressive fights straight back, hits harder and more often, kicks
 *   brave      steps in to defend someone the player attacks nearby
 */
export const PERSONAS = [["passive", 0.55], ["defensive", 0.25], ["aggressive", 0.12], ["brave", 0.08]];
const FIGHT = {
  passive: { block: 0.15, dodge: 0.1, cool: [1.3, 1.9], moves: ["jab", "cross"], quit: 40 },
  defensive: { block: 0.5, dodge: 0.15, cool: [1.0, 1.6], moves: ["jab", "cross", "jab", "rhook"], quit: 35 },
  aggressive: { block: 0.25, dodge: 0.25, cool: [0.5, 0.95], moves: ["jab", "cross", "lhook", "rhook", "fkick", "finisher"], quit: 18 },
  brave: { block: 0.4, dodge: 0.15, cool: [0.8, 1.3], moves: ["jab", "cross", "lhook", "fkick"], quit: 30 },
};
/** at most this many pedestrians fight the player at once */
export const MAX_FIGHTERS = 3;

export const PEDS = { max: 24, near: 28, far: 115, despawn: 140 };
let PID = 1;

export function makePerson(kind, x, z, look, extra = {}) {
  return {
    id: PID++,
    kind,
    look,
    x,
    z,
    y: 0,
    h: 0,
    vx: 0,
    vz: 0,
    speed: 0,
    mode: "idle",
    t: 0,
    timer: 0,
    walkSpeed: 1.2,
    hp: kind === "cop" ? 140 : 100,
    maxHp: kind === "cop" ? 140 : 100,
    anim: { speed: 0, air: false, sit: false, down: 0, wave: 0, talk: 0, interact: 0, celebrate: 0, hurt: 0 },
    ...extra,
  };
}

/**
 * Where a person sits on a bench. The bench model (render/cityMesh.js) has its
 * seat facing local +z (backrest at −0.22), turned by `rot`; the seat top is
 * 0.50 m above the bench base. The pelvis goes 6 cm in front of the seat's
 * centre line, facing out of the bench; people walk up to a point 0.8 m in
 * front of it, turn round and sit down.
 */
export const SEAT_TOP = 0.5;
export function benchSeat(b) {
  const fx = Math.sin(b.rot || 0);
  const fz = Math.cos(b.rot || 0);
  return { x: b.x + fx * 0.06, z: b.z + fz * 0.06, y: b.y + SEAT_TOP, base: b.y, h: b.rot || 0, ax: b.x + fx * 0.8, az: b.z + fz * 0.8 };
}
export const BODY_TIME = 30; // seconds a body stays before it is cleaned up
/** corner k of block loop → the crossings available there */
const CROSS = {
  0: [["v", 0, -1, 3], ["h", -1, 0, 1]],
  1: [["v", 0, -1, 2], ["h", 1, 0, 0]],
  2: [["v", 0, 1, 1], ["h", 1, 0, 3]],
  3: [["v", 0, 1, 0], ["h", -1, 0, 2]],
};
/** the grid node a loop corner sits next to */
const CORNER_NODE = { 0: [0, 0], 1: [1, 0], 2: [1, 1], 3: [0, 1] };

export class Peds {
  constructor(sim) {
    this.sim = sim;
    this.list = [];
    this.spawnT = 0;
    this.max = PEDS.max;
    this.byBlock = new Map();
    for (const w of sim.city.walks) if (!w.line) this.byBlock.set(`${w.i},${w.j}`, w);
    this.benches = sim.city.props.filter((p) => p.type === "bench").map((b) => ({ ...b, taken: null }));
  }
  /** seat a person on a bench right away (spawned out of sight / tests) */
  seat(p, b) {
    const S = benchSeat(b);
    b.taken = p.id;
    p.bench = b;
    p.x = S.x;
    p.z = S.z;
    p.h = S.h;
    p.mode = "sit";
    p.timer = 20 + this.sim.rand() * 40;
    p.anim.sitK = 1;
    p.anim.sit = true;
  }
  /** a free bench in sight within r m of a walking person */
  freeBench(p, r = 26) {
    const sim = this.sim;
    let best = null;
    let bd = r;
    for (const b of this.benches) {
      if (b.taken) continue;
      const S = benchSeat(b);
      const d = dist(S.ax, S.az, p.x, p.z);
      if (d < bd && !sim.col.segBlocked(p.x, p.z, (p.y || 0) + 1, S.ax, S.az, b.y + 1) && dist(b.x, b.z, sim.player.x, sim.player.z) > 3) {
        bd = d;
        best = b;
      }
    }
    return best;
  }
  pickPersona() {
    let x = this.sim.rand();
    for (const [k, w] of PERSONAS) if ((x -= w) <= 0) return k;
    return "passive";
  }
  /** pedestrians currently fighting the player */
  fighters() {
    let n = 0;
    for (const p of this.list) if (p.mode === "fight" && !p.dead) n++;
    return n;
  }
  /** the attack token: only one fighter strikes at a time */
  tokenFree(p) {
    const T = this.token;
    return !T || T.p === p || T.p.dead || T.p.mode !== "fight" || this.sim.t > T.until;
  }
  releaseToken(p, after = 0) {
    if (this.token && this.token.p === p) this.token.until = Math.min(this.token.until, this.sim.t + after);
  }
  /** start (or keep) fighting the player */
  engage(p, why = "fightBack") {
    const sim = this.sim;
    if (p.bench) {
      p.bench.taken = null;
      p.bench = null;
    }
    p.cross = null;
    p.anim.sit = false;
    const was = p.mode === "fight";
    p.mode = "fight";
    p.timer = Math.max(p.timer || 0, 16 + sim.rand() * 8);
    p.fightS = p.fightS || { cool: p.persona === "aggressive" ? 0.25 : 0.6, blockT: 0, dodgeT: 0 };
    if (!was) sim.emit({ type: why, x: p.x, z: p.z, id: p.id });
  }
  /** stop fighting: walk off if fine, run if hurt or timid */
  disengage(p) {
    const sim = this.sim;
    p.atk = null;
    p.anim.punch = null;
    p.blocking = 0;
    p.fightS = null;
    this.releaseToken(p);
    const pl = sim.player;
    if (p.persona === "passive" || p.hp < 45 || pl.mode === "foot") this.scare(p, pl.x, pl.z, 6);
    else {
      p.mode = "return";
      p.timer = 0;
    }
  }
  /** the player started a strike: fighters in front may raise a guard or step back */
  incoming(a, M) {
    const sim = this.sim;
    for (const p of this.list) {
      if (p.mode !== "fight" || p.dead || p.atk || !p.fightS) continue;
      const dx = p.x - a.x;
      const dz = p.z - a.z;
      const d = Math.hypot(dx, dz);
      if (d > M.reach + M.r + 0.9 || (dx * Math.sin(a.h) + dz * Math.cos(a.h)) / (d || 1) < 0.3) continue;
      const P = FIGHT[p.persona] || FIGHT.defensive;
      const r = sim.rand();
      if (r < P.block) p.fightS.blockT = M.hitAt + M.active + 0.25;
      else if (r < P.block + P.dodge) {
        // step back and a little to the side, still facing the player
        const side = sim.rand() < 0.5 ? 1 : -1;
        const L = d || 1;
        p.fightS.dodgeT = 0.3;
        p.fightS.ddx = (dx / L) * 0.85 + (dz / L) * 0.5 * side;
        p.fightS.ddz = (dz / L) * 0.85 - (dx / L) * 0.5 * side;
      }
    }
  }
  loopOpen(w) {
    return this.sim.districtOpen(w.district);
  }
  spawn() {
    const sim = this.sim;
    const P = sim.focus();
    const walks = sim.city.walks.filter((w) => this.loopOpen(w));
    for (let tries = 0; tries < 16; tries++) {
      const w = sim.rand.pick(walks);
      let x;
      let z;
      let seg = 0;
      let u = 0;
      if (w.line) {
        u = sim.rand();
        x = w.pts[0].x;
        z = w.pts[0].z + (w.pts[1].z - w.pts[0].z) * u;
      } else {
        seg = sim.rand.int(0, 3);
        u = sim.rand();
        const a = w.pts[seg];
        const b = w.pts[(seg + 1) % 4];
        x = a.x + (b.x - a.x) * u;
        z = a.z + (b.z - a.z) * u;
      }
      const d = dist(x, z, P.x, P.z);
      if (d < PEDS.near || d > PEDS.far) continue;
      const p = makePerson("ped", x, z, randomLook(sim.rand, w.district), { walk: w, seg, dir: sim.rand() < 0.5 ? 1 : -1, walkSpeed: 1.05 + sim.rand() * 0.55, lane: (sim.rand() - 0.5) * 1.2, persona: this.pickPersona() });
      p.y = sim.city.surfaceAt(x, z);
      p.mode = "walk";
      // some people hang around instead: by a shop front or on a bench
      const r = sim.rand();
      if (r < 0.12) {
        const b = this.benches.find((q) => !q.taken && dist(q.x, q.z, x, z) < 60 && dist(q.x, q.z, P.x, P.z) > PEDS.near);
        if (b) {
          this.seat(p, b);
        }
      } else if (r < 0.24 && !w.line) {
        p.mode = "idle";
        p.timer = 6 + sim.rand() * 14;
        // face the shop fronts (the block side of the sidewalk)
        const cx = (w.pts[0].x + w.pts[2].x) / 2;
        const cz = (w.pts[0].z + w.pts[2].z) / 2;
        const a = w.pts[seg];
        const b = w.pts[(seg + 1) % 4];
        p.h = Math.abs(b.x - a.x) > Math.abs(b.z - a.z) ? headingOf(0, cz - z) : headingOf(cx - x, 0);
        p.talking = sim.rand() < 0.4;
      }
      return p;
    }
    return null;
  }
  remove(p) {
    if (p.bench) p.bench.taken = null;
    const k = this.list.indexOf(p);
    if (k >= 0) this.list.splice(k, 1);
  }
  step(dt) {
    const sim = this.sim;
    const P = sim.focus();
    for (let k = this.list.length - 1; k >= 0; k--) {
      const p = this.list[k];
      const d = dist(p.x, p.z, P.x, P.z);
      if (d > PEDS.despawn || (p.stuckT > 8 && d > 50) || (p.dead && p.deadT > BODY_TIME)) this.remove(p);
    }
    this.spawnT -= dt;
    if (this.spawnT <= 0 && this.list.length < this.max) {
      this.spawnT = 0.2;
      const p = this.spawn();
      if (p) this.list.push(p);
    }
    for (const p of this.list) {
      // far people think less often
      const far = dist(p.x, p.z, P.x, P.z) > 60;
      p.acc = (p.acc || 0) + dt;
      if (far && p.acc < 0.1) continue;
      const step = p.acc;
      p.acc = 0;
      this.update(p, step);
    }
  }

  /** something scary happened at (x, z): people within r run away */
  alarm(x, z, r, strength = 1) {
    for (const p of this.list) {
      if (p.mode === "down" || p.dead || p.mode === "stagger" || p.mode === "fight") continue;
      const d = dist(p.x, p.z, x, z);
      if (d < r && (p.mode !== "flee" || p.timer < 2)) this.scare(p, x, z, 3 + strength * 3);
    }
  }
  scare(p, x, z, time) {
    if (p.dead) return;
    p.anim.sitK = 0;
    if (p.bench) {
      p.bench.taken = null;
      p.bench = null;
    }
    p.mode = "flee";
    p.fx = x;
    p.fz = z;
    p.timer = time;
    if (this.sim.rand() < 0.3) this.sim.emit({ type: "scream", x: p.x, z: p.z });
  }
  knock(p, vx, vz, speed) {
    if (p.dead) return;
    if (p.bench) {
      p.bench.taken = null;
      p.bench = null;
    }
    p.atk = null;
    p.cross = null;
    p.anim.punch = null;
    p.anim.fight = 0;
    p.anim.cower = 0;
    p.anim.stagger = 0;
    p.anim.sit = false;
    p.mode = "down";
    p.timer = 2.6 + Math.min(2, speed / 10);
    const L = Math.hypot(vx, vz) || 1;
    p.vx = (vx / L) * Math.min(9, speed * 0.6);
    p.vz = (vz / L) * Math.min(9, speed * 0.6);
    p.h = headingOf(-vx, -vz);
    p.anim.down = 1;
  }

  /**
   * Hurt a person (pedestrian or officer). o: { fx, fz } unit push direction,
   * speed (m/s of the blow), heavy, knock (force a knock-down), kind, by.
   * Returns "stagger" | "down" | "dead".
   */
  damage(p, dmg, o = {}) {
    if (p.dead) return "dead";
    const sim = this.sim;
    if (p.hp == null) p.hp = p.maxHp = 100;
    p.hp -= dmg;
    p.hits = (p.hits || []).filter((t) => sim.t - t < 3);
    p.hits.push(sim.t);
    p.lastBy = o.by || "";
    const fx = o.fx || 0;
    const fz = o.fz || 0;
    p.lastHit = { x: p.x - fx * 3, z: p.z - fz * 3 };
    p.anim.hurt = 0.4;
    if (p.hp <= 0) {
      this.kill(p, fx, fz, o.speed || 3);
      return "dead";
    }
    // interrupted: a strike in progress is lost, a guard drops
    if (p.atk) {
      p.atk = null;
      p.anim.punch = null;
    }
    p.blocking = 0;
    this.releaseToken(p, 0.3);
    p.anim.hitSide = o.side || 0;
    p.anim.hitKind = o.kind || "";
    const reeling = p.mode === "stagger" && p.timer > 0.12;
    if (o.knock || dmg >= 30 || p.hits.length >= 4 || (o.knockback && reeling)) {
      const wasDown = p.mode === "down";
      this.knock(p, fx, fz, Math.max(3, o.speed || 4));
      if (wasDown) p.timer = Math.max(p.timer, 2);
      if (o.kind === "car") p.timer += 0.6;
      return "down";
    }
    if (p.mode !== "down") {
      if (p.bench) {
        p.bench.taken = null;
        p.bench = null;
      }
      p.atk = null;
      p.cross = null;
      p.anim.punch = null;
      p.anim.sit = false;
      // a short reel back; a knockback (power straight, kicks) shoves much further
      if (p.mode !== "stagger") p.prevMode = p.mode;
      p.mode = "stagger";
      p.timer = o.knockback ? 0.75 : o.heavy ? 0.55 : 0.42;
      const push = o.knockback ? Math.min(7, o.speed || 4) : Math.min(2.8, o.speed || 2.4);
      p.vx = fx * push;
      p.vz = fz * push;
      p.slide = o.knockback ? 3.4 : 6;
      p.anim.stagger = p.timer;
    }
    return "stagger";
  }
  /** dead: falls, slides to a stop, stops thinking; cleaned up after BODY_TIME */
  kill(p, fx, fz, speed) {
    const sim = this.sim;
    if (!fx && !fz) fz = 1;
    this.knock(p, fx, fz, Math.max(3, speed));
    p.dead = true;
    p.hp = 0;
    p.mode = "dead";
    p.deadT = 0;
    p.anim.dead = 1;
    p.anim.down = 1;
    sim.emit({ type: "pedDeath", x: p.x, z: p.z, y: p.y, cop: p.kind === "cop", id: p.id, player: p.lastBy === "player" });
    if (p.kind === "ped") sim.dropCash(p);
    // an officer's body joins the crowd list so it is drawn and cleaned up like any other
    if (p.kind === "cop") {
      const k = sim.police.foot.indexOf(p);
      if (k >= 0) sim.police.foot.splice(k, 1);
      if (p.car) p.car.copOut = false;
      if (!this.list.includes(p)) this.list.push(p);
    }
  }
  /** shared hurt-state stepping (also used for officers on foot): true while busy */
  stepHurt(p, dt) {
    const A = p.anim;
    if (p.mode === "dead") {
      p.deadT += dt;
      p.vx *= Math.exp(-5 * dt);
      p.vz *= Math.exp(-5 * dt);
      p.x += p.vx * dt;
      p.z += p.vz * dt;
      if (p.deadT < 3) this.sim.col.pushCircle(p, 0.3, p.y ?? 0, 1.7, 0.45);
      p.y = this.sim.city.surfaceAt(p.x, p.z);
      A.speed = 0;
      p.speed = 0;
      return true;
    }
    if (p.mode === "stagger") {
      p.timer -= dt;
      A.stagger = Math.max(0, p.timer);
      p.vx *= Math.exp(-(p.slide || 6) * dt);
      p.vz *= Math.exp(-(p.slide || 6) * dt);
      p.x += p.vx * dt;
      p.z += p.vz * dt;
      this.sim.pushPerson(p);
      p.y = this.sim.city.surfaceAt(p.x, p.z);
      A.speed = 0;
      p.speed = 0;
      if (p.timer <= 0) this.recover(p);
      return true;
    }
    return false;
  }
  /** back on their feet: run from the attacker, or (a few) fight back */
  recover(p) {
    const sim = this.sim;
    const A = p.anim;
    A.down = 0;
    A.stagger = 0;
    if (p.kind === "cop") {
      p.mode = "chase";
      return;
    }
    const pl = sim.player;
    const byPlayer = p.lastBy === "player";
    if (byPlayer && pl.mode === "foot" && dist(p.x, p.z, pl.x, pl.z) < 12 && (p.prevMode === "fight" || this.fighters() < MAX_FIGHTERS)) {
      const per = p.persona || "passive";
      const fights =
        per === "aggressive" ? p.hp >= 20 : per === "defensive" ? p.hp >= 45 && (p.prevMode === "fight" || sim.rand() < 0.8) : per === "brave" ? p.hp >= 40 : p.prevMode === "fight" && p.hp >= 60;
      if (fights) {
        this.engage(p);
        return;
      }
    }
    const from = byPlayer ? pl : p.lastHit || { x: p.x - p.vx, z: p.z - p.vz };
    this.scare(p, from.x, from.z, 6);
  }
  /**
   * Violence at (x, z): bystanders who can see it flee or cower; one of them
   * may phone the police (only for the player's crimes).
   */
  violence(x, z, level = 1, victim = null, byPlayer = false) {
    const sim = this.sim;
    const r = 14 + level * 8;
    let caller = null;
    for (const p of this.list) {
      if (p === victim || p.dead || p.mode === "down" || p.mode === "stagger" || p.mode === "fight" || p.mode === "call") continue;
      const d = dist(p.x, p.z, x, z);
      if (d > r) continue;
      if (sim.col.segBlocked(p.x, p.z, (p.y || 0) + 1.6, x, z, sim.city.groundAt(x, z) + 1.2)) continue;
      // brave people defend the victim; aggressive ones close by join in
      if (byPlayer && sim.player.mode === "foot" && ((p.persona === "brave" && d < 16 && p.hp >= 50) || (p.persona === "aggressive" && d < 8)) && this.fighters() < MAX_FIGHTERS) {
        this.engage(p, "defend");
        continue;
      }
      if (byPlayer && !caller && (this.callT ?? -99) < sim.t - 20 && d > 4 && sim.rand() < 0.5) {
        caller = p;
        continue;
      }
      if (d < 7 && sim.rand() < 0.3) {
        if (p.bench) {
          p.bench.taken = null;
          p.bench = null;
        }
        p.mode = "cower";
        p.timer = 1.6 + sim.rand() * 2;
        p.fx = x;
        p.fz = z;
        if (sim.rand() < 0.5) sim.emit({ type: "scream", x: p.x, z: p.z });
      } else this.scare(p, x, z, 4 + level * 2);
    }
    if (caller) {
      this.callT = sim.t;
      if (caller.bench) {
        caller.bench.taken = null;
        caller.bench = null;
      }
      caller.mode = "call";
      caller.timer = 3.5;
      caller.fx = x;
      caller.fz = z;
      sim.emit({ type: "callingPolice", x: caller.x, z: caller.z, id: caller.id });
    }
  }

  update(p, dt) {
    const sim = this.sim;
    if (this.stepHurt(p, dt)) return;
    const A = p.anim;
    A.wave = Math.max(0, A.wave - dt);
    A.talk = Math.max(0, A.talk - dt);
    p.timer -= dt;
    let mvx = 0;
    let mvz = 0;
    let sp = 0;
    if (p.mode !== "down" && p.mode !== "flee" && p.mode !== "talk" && p.mode !== "fight") this.watchTraffic(p);
    A.cower = p.mode === "cower" ? 1 : 0;
    A.fight = p.mode === "fight" ? 1 : 0;
    if (p.mode !== "fight") {
      A.punch = null;
      p.atk = null;
      p.blocking = 0;
    }
    switch (p.mode) {
      case "walk": {
        const tgt = this.walkTarget(p);
        if (!tgt) break;
        const dx = tgt.x - p.x;
        const dz = tgt.z - p.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.35) {
          this.reachCorner(p);
          break;
        }
        sp = p.walkSpeed;
        mvx = dx / d;
        mvz = dz / d;
        break;
      }
      case "wait": {
        const node = sim.city.nodes[p.cross.node];
        p.h = dampA(p.h, headingOf(p.cross.to.x - p.x, p.cross.to.z - p.z), 6, dt);
        if (walkSignal(node, p.cross.axis, sim.t) && !this.carComing(p.cross)) p.mode = "cross";
        else if (p.timer < -40) this.cancelCross(p);
        break;
      }
      case "cross": {
        const dx = p.cross.to.x - p.x;
        const dz = p.cross.to.z - p.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.4) {
          p.walk = p.cross.walk;
          p.seg = p.cross.corner;
          // continue along the new block, away from the road just crossed
          p.dir = p.cross.dir;
          p.cross = null;
          p.mode = "walk";
          p.seg = p.dir > 0 ? p.seg : (p.seg + 3) % 4;
          break;
        }
        sp = Math.max(p.walkSpeed, 1.45);
        mvx = dx / d;
        mvz = dz / d;
        break;
      }
      case "idle":
        if (p.talking) A.talk = 0.3;
        if (p.timer <= 0) p.mode = "walk";
        break;
      case "toBench": {
        // walk to the spot in front of the seat — round the end of the bench if
        // it is in the way (coming from behind it)
        const S = benchSeat(p.bench);
        let tx = S.ax;
        let tz = S.az;
        const fx = Math.sin(S.h);
        const fz = Math.cos(S.h);
        const v = (p.x - p.bench.x) * fx + (p.z - p.bench.z) * fz;
        if (v < 0.45) {
          const ux = fz;
          const uz = -fx;
          const u = (p.x - p.bench.x) * ux + (p.z - p.bench.z) * uz;
          const side = u >= 0 ? 1 : -1;
          if (Math.abs(u) < 1.45) {
            tx = p.bench.x + ux * side * 1.55 + fx * Math.max(v, -0.6);
            tz = p.bench.z + uz * side * 1.55 + fz * Math.max(v, -0.6);
          } else {
            tx = p.bench.x + ux * side * 1.55 + fx * 0.8;
            tz = p.bench.z + uz * side * 1.55 + fz * 0.8;
          }
        }
        const dx = tx - p.x;
        const dz = tz - p.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.3 && tx === S.ax) {
          p.mode = "sitDown";
          p.timer = 0.75;
          p.from = { x: p.x, z: p.z };
          break;
        }
        if (p.timer < -30 || (p.stuckT || 0) > 3) {
          p.bench.taken = null;
          p.bench = null;
          p.mode = "return";
          break;
        }
        sp = Math.min(p.walkSpeed, d * 2 + 0.4);
        mvx = dx / d;
        mvz = dz / d;
        break;
      }
      case "sitDown": {
        // turn round and lower onto the seat: back to the backrest, pelvis over the seat
        const S = benchSeat(p.bench);
        const k = clamp(1 - p.timer / 0.75, 0, 1);
        const e = k * k * (3 - 2 * k);
        p.x = p.from.x + (S.x - p.from.x) * e;
        p.z = p.from.z + (S.z - p.from.z) * e;
        p.h = dampA(p.h, S.h, 10, dt);
        A.sitK = e;
        if (p.timer <= 0) {
          p.x = S.x;
          p.z = S.z;
          p.h = S.h;
          A.sitK = 1;
          p.mode = "sit";
          p.timer = 15 + sim.rand() * 30;
        }
        break;
      }
      case "sit":
        A.sitK = 1;
        if (p.timer <= 0) {
          p.mode = "standUp";
          p.timer = 0.7;
        }
        break;
      case "standUp": {
        // lean forward, push up and step off the bench
        const S = benchSeat(p.bench);
        const k = clamp(1 - p.timer / 0.7, 0, 1);
        const e = k * k * (3 - 2 * k);
        A.sitK = 1 - e;
        p.x = S.x + (S.ax - S.x) * e * 0.75;
        p.z = S.z + (S.az - S.z) * e * 0.75;
        p.h = S.h;
        if (p.timer <= 0) {
          A.sitK = 0;
          p.bench.taken = null;
          p.bench = null;
          p.mode = "return";
        }
        break;
      }
      case "talk":
        A.talk = Math.max(A.talk, 0.2);
        p.h = dampA(p.h, headingOf(sim.player.x - p.x, sim.player.z - p.z), 6, dt);
        if (p.timer <= 0) p.mode = p.bench ? "sit" : "walk";
        break;
      case "cower":
        // crouch and cover up, then run
        p.h = dampA(p.h, headingOf(p.fx - p.x, p.fz - p.z), 6, dt);
        if (p.timer <= 0) this.scare(p, p.fx, p.fz, 6);
        break;
      case "call":
        // phone to the ear, turned away from the trouble; then report and leave
        A.talk = 0.3;
        A.interact = 0.3;
        p.h = dampA(p.h, headingOf(p.x - p.fx, p.z - p.fz), 6, dt);
        if (p.timer <= 0) {
          sim.police.report("assaultReported", p.fx, p.fz);
          this.scare(p, p.fx, p.fz, 6);
        }
        break;
      case "fight": {
        const pl = sim.player;
        const dx = pl.x - p.x;
        const dz = pl.z - p.z;
        const d = Math.hypot(dx, dz) || 1;
        const P = FIGHT[p.persona] || FIGHT.defensive;
        const S = p.fightS || (p.fightS = { cool: 0.6, blockT: 0, dodgeT: 0 });
        const face = () => (p.h = dampA(p.h, headingOf(dx, dz), 12, dt));
        if (p.atk) {
          // committed to the strike: turn only during the wind-up
          if (p.atk.t < MOVES[p.atk.id].hitAt * 0.7) face();
          if (stepMove(sim, p, dt, false)) {
            S.cool = P.cool[0] + sim.rand() * (P.cool[1] - P.cool[0]);
            this.releaseToken(p, 0.35);
          }
          break;
        }
        const quit = (pl.mode !== "foot" && pl.mode !== "down") || p.timer <= 0 || d > 14 || p.hp < P.quit || pl.hp <= 0 || pl.hidden;
        if (quit) {
          this.disengage(p);
          break;
        }
        if (S.blockT > 0) {
          // guard up, facing the attacker
          S.blockT -= dt;
          p.blocking = 1;
          face();
          break;
        }
        p.blocking = 0;
        if (S.dodgeT > 0) {
          S.dodgeT -= dt;
          sp = 3.2;
          mvx = S.ddx;
          mvz = S.ddz;
          face();
          break;
        }
        S.cool -= dt;
        face();
        // the one holding the token closes in; the others hold off at a distance
        const mine = this.tokenFree(p);
        const want = mine ? 1.05 : 2.3;
        if (d > want + 0.25) {
          sp = d > 5 ? 3.9 : mine ? 2.6 : 1.7;
          mvx = dx / d;
          mvz = dz / d;
        }
        // a player on the ground is left alone until they get up
        const facing = Math.cos(wrapA(headingOf(dx, dz) - p.h)) > 0.8;
        if (mine && S.cool <= 0 && d < 1.6 && facing && pl.mode === "foot") {
          let id = sim.rand.pick(P.moves);
          if (d > 1.3 && P.moves.includes("fkick")) id = "fkick";
          this.token = { p, until: sim.t + MOVES[id].dur + 0.4 };
          startMove(sim, p, id, false);
        }
        break;
      }
      case "dodge":
        sp = 4.2;
        mvx = p.dvx;
        mvz = p.dvz;
        if (p.timer <= 0) p.mode = p.panic ? "flee" : "return";
        if (p.panic) p.timer = 4;
        break;
      case "flee": {
        const dx = p.x - p.fx;
        const dz = p.z - p.fz;
        const d = Math.hypot(dx, dz) || 1;
        sp = 4.6 + (p.id % 5) * 0.25;
        mvx = dx / d;
        mvz = dz / d;
        // keep away from the middle of the road where possible
        const q = sim.city.roadQuery(p.x, p.z);
        if (q && q.d < q.edge.half) {
          const ox = p.x - q.x;
          const oz = p.z - q.z;
          const L = Math.hypot(ox, oz) || 1;
          mvx += (ox / L) * 0.8;
          mvz += (oz / L) * 0.8;
          const M = Math.hypot(mvx, mvz);
          mvx /= M;
          mvz /= M;
        }
        if (p.timer <= 0) p.mode = "return";
        break;
      }
      case "down":
        A.down = 1;
        p.vx *= Math.exp(-4 * dt);
        p.vz *= Math.exp(-4 * dt);
        p.x += p.vx * dt;
        p.z += p.vz * dt;
        if (p.timer <= 0) this.recover(p);
        break;
      case "return": {
        // walk back to the nearest point of the home sidewalk line
        const near = this.nearestOnWalk(p);
        const dx = near.x - p.x;
        const dz = near.z - p.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.5) {
          p.seg = near.seg;
          p.mode = "walk";
          break;
        }
        sp = p.walkSpeed * 1.1;
        mvx = dx / d;
        mvz = dz / d;
        break;
      }
      default:
    }
    A.block = p.blocking ? 1 : 0;
    A.dodge = p.fightS && p.fightS.dodgeT > 0 ? 1 : 0;
    if (p.mode === "down") {
      sim.pushPerson(p);
      p.y = sim.city.surfaceAt(p.x, p.z);
      return;
    }
    if (sp > 0) {
      p.x += mvx * sp * dt;
      p.z += mvz * sp * dt;
      // fighters keep facing their opponent while they move (step in, step back)
      if (p.mode !== "fight") p.h = dampA(p.h, headingOf(mvx, mvz), 8, dt);
      const ox = p.x;
      const oz = p.z;
      if (p.mode === "flee" || p.mode === "return" || p.mode === "dodge" || p.mode === "fight" || p.mode === "toBench") sim.pushPerson(p);
      const moved = Math.hypot(p.x - ox, p.z - oz);
      if (moved > sp * dt * 0.7) p.stuckT = (p.stuckT || 0) + dt;
      else p.stuckT = 0;
    }
    A.speed = sp;
    // only someone on (or getting on / off) a bench is seated; talking from a bench keeps the seat
    const onBench = p.bench && (p.mode === "sit" || p.mode === "sitDown" || p.mode === "standUp" || p.mode === "talk");
    if (!onBench) A.sitK = 0;
    A.sit = (A.sitK || 0) > 0.45;
    p.speed = sp;
    p.y = sim.city.surfaceAt(p.x, p.z);
  }

  walkTarget(p) {
    const w = p.walk;
    if (w.line) {
      const end = w.pts[p.dir > 0 ? 1 : 0];
      return { x: end.x + p.lane * 0.5, z: end.z };
    }
    const k = p.dir > 0 ? (p.seg + 1) % 4 : p.seg;
    const c = w.pts[k];
    // walk a little off the centre line so a crowd doesn't march in single file
    const cx = (w.pts[0].x + w.pts[2].x) / 2;
    const cz = (w.pts[0].z + w.pts[2].z) / 2;
    const ox = Math.sign(c.x - cx) * p.lane * 0.5;
    const oz = Math.sign(c.z - cz) * p.lane * 0.5;
    return { x: c.x + ox, z: c.z + oz, corner: k };
  }
  nearestOnWalk(p) {
    const w = p.walk;
    let best = null;
    const n = w.line ? 1 : 4;
    for (let s = 0; s < n; s++) {
      const a = w.pts[s];
      const b = w.pts[(s + 1) % w.pts.length];
      const c = segClosest(p.x, p.z, a.x, a.z, b.x, b.z);
      if (!best || c.d2 < best.d2) best = { ...c, seg: s };
    }
    return best;
  }
  reachCorner(p) {
    const sim = this.sim;
    const w = p.walk;
    if (w.line) {
      p.dir = -p.dir;
      if (sim.rand() < 0.3) {
        p.mode = "idle";
        p.timer = 3 + sim.rand() * 6;
      }
      return;
    }
    const corner = p.dir > 0 ? (p.seg + 1) % 4 : p.seg;
    // maybe take a rest on a nearby bench
    if (sim.rand() < 0.15) {
      const b = this.freeBench(p);
      if (b) {
        b.taken = p.id;
        p.bench = b;
        p.mode = "toBench";
        p.timer = 0;
        p.stuckT = 0;
        return;
      }
    }
    // maybe cross to the next block
    if (sim.rand() < 0.4) {
      const opts = CROSS[corner]
        .map(([kind, di, dj, to]) => ({ kind, w2: this.byBlock.get(`${w.i + di},${w.j + dj}`), to }))
        .filter((o) => o.w2 && this.loopOpen(o.w2));
      if (opts.length) {
        const o = sim.rand.pick(opts);
        const [ni, nj] = CORNER_NODE[corner];
        const node = sim.city.gridNode(w.i + ni, w.j + nj);
        const to = o.w2.pts[o.to];
        p.cross = { node: node.id, axis: o.kind === "v" ? "ew" : "ns", to, walk: o.w2, corner: o.to, dir: sim.rand() < 0.5 ? 1 : -1 };
        p.mode = "wait";
        p.timer = 0;
        return;
      }
    }
    // turn the corner
    p.seg = p.dir > 0 ? (p.seg + 1) % 4 : (p.seg + 3) % 4;
    if (sim.rand() < 0.08) {
      p.mode = "idle";
      p.timer = 2 + sim.rand() * 5;
    }
  }
  cancelCross(p) {
    p.cross = null;
    p.mode = "walk";
    p.dir = -p.dir;
  }
  /** a car about to drive through this crosswalk? */
  carComing(cr) {
    for (const v of this.sim.vehicles) {
      const sp = Math.hypot(v.vx, v.vz);
      if (sp < 2) continue;
      const d = dist(v.x, v.z, cr.to.x, cr.to.z);
      if (d < 26 && d / sp < 3) return true;
    }
    return false;
  }
  /** side-step a car that is about to hit; panic if it is fast */
  watchTraffic(p) {
    const sim = this.sim;
    p.watchT = (p.watchT || 0) - 1;
    if (p.watchT > 0) return;
    p.watchT = 3;
    for (const v of sim.vehicles) {
      const sp = Math.hypot(v.vx, v.vz);
      if (sp < 2.2) continue;
      const dx = p.x - v.x;
      const dz = p.z - v.z;
      if (dx * dx + dz * dz > 18 * 18) continue;
      // closest approach of the car's path
      const t = clamp((dx * v.vx + dz * v.vz) / (sp * sp), 0, 1.6);
      const cx = v.x + v.vx * t - p.x;
      const cz = v.z + v.vz * t - p.z;
      if (cx * cx + cz * cz < 2.6 * 2.6 && t > 0) {
        // jump away from the car's line
        const nx = -v.vz / sp;
        const nz = v.vx / sp;
        const side = nx * dx + nz * dz >= 0 ? 1 : -1;
        p.dvx = nx * side;
        p.dvz = nz * side;
        if (p.bench) {
          p.bench.taken = null;
          p.bench = null;
        }
        p.mode = "dodge";
        p.timer = 0.7;
        p.panic = sp > 10;
        p.fx = v.x;
        p.fz = v.z;
        if (p.panic && sim.rand() < 0.5) sim.emit({ type: "scream", x: p.x, z: p.z });
        return;
      }
    }
  }
  /** player chats with someone */
  talkTo(p) {
    p.mode = "talk";
    p.timer = 3.2;
    p.anim.talk = 3;
    return PED_LINES[(p.id * 7 + Math.floor(this.sim.t)) % PED_LINES.length];
  }
}
export { COLS, ROWS };
