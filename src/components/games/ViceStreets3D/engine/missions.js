/**
 * Vice Streets 3D — mission / activity runner.
 *
 * A run executes a definition's stages in order (see data/missions.js for
 * the stage vocabulary). Each stage type has:
 *   enter(run, st)        set-up (spawn things, start timers)
 *   step(run, st, dt)     returns true when the stage is complete
 *   marker(run, st)       where the HUD marker / GPS points to
 *   goal(run, st)         what a test bot should do next (tools/bot)
 * Mission-wide rules (overall timer, wrecked vehicles, damaged cargo, a hurt
 * passenger, being busted or wasted) fail the run; completing the last
 * stage wins it. The host applies rewards and unlocks from run.result.
 */
import { makeVehicle } from "./vehicle.js";
import { makePerson } from "./peds.js";
import { planRoute, followRoute } from "./nav.js";
import { randomLook, CAST } from "../data/people.js";
import { VEHICLE } from "../data/vehicles.js";
import { dist, headingOf, wrapA, clamp } from "./util.js";
import { LANE_OFF } from "./city.js";

const carOf = (sim) => (sim.player.mode === "car" ? sim.player.car : null);
const speedOf = (v) => (v ? Math.hypot(v.vx, v.vz) : 0);

export class Run {
  constructor(sim, def, opts = {}) {
    this.sim = sim;
    this.def = def;
    this.kind = def.activity ? "activity" : "mission";
    this.idx = -1;
    this.st = null;
    this.vehicles = {};
    this.npcs = {};
    this.t = 0;
    this.timeLeft = def.time || null;
    this.result = null;
    this.main = null; // key of the vehicle the player must use
    this.earned = 0;
    this.notes = [];
    this.opts = opts;
    this.stageT = 0;
  }
  get stages() {
    return this.def.stages;
  }
  get stage() {
    return this.stages[this.idx] || null;
  }
  start() {
    const d = this.def;
    if (d.clock != null) this.sim.clock = d.clock;
    if (d.unlockOnStart) this.sim.unlockDistrict(d.unlockOnStart);
    this.next();
  }
  next() {
    this.idx++;
    this.stageT = 0;
    if (this.idx >= this.stages.length) return this.win();
    const s = this.stage;
    this.st = { s };
    const H = STAGES[s.type];
    if (!H) throw new Error(`unknown stage type ${s.type}`);
    if (H.enter) H.enter(this, this.st);
    if (H.instant) return this.next();
    if (s.text) this.sim.emit({ type: "objective", text: s.text, hint: s.hint || "", idx: this.idx });
  }
  step(dt) {
    if (this.result) return;
    this.t += dt;
    this.stageT += dt;
    if (this.timeLeft != null) {
      this.timeLeft -= dt;
      if (this.timeLeft <= 0) return this.fail("Out of time");
    }
    if (this.checkFails()) return;
    const H = STAGES[this.stage.type];
    if (H.step(this, this.st, dt)) {
      this.sim.emit({ type: "stageDone", idx: this.idx });
      this.next();
    }
  }
  checkFails() {
    const f = this.def.fail || {};
    if (f.wrecked) {
      const v = this.vehicles[f.wrecked];
      if (v && (v.wrecked || v.hp <= 0)) return this.fail(`The ${VEHICLE[v.type].name} was wrecked`), true;
    }
    if (f.cargo && this.cargoKey) {
      const v = this.vehicles[this.cargoKey];
      if (v && this.cargoHp != null && (this.cargoHp - v.hp) / v.st.hp > f.cargo) return this.fail("The cargo was damaged"), true;
    }
    if (this.main) {
      const v = this.vehicles[this.main];
      // only once you have actually driven it
      if (v && this.sim.player.car === v) v.used = true;
      if (v && v.used && !v.wrecked && dist(v.x, v.z, this.sim.player.x, this.sim.player.z) > 260) return this.fail(`You abandoned the ${VEHICLE[v.type].name}`), true;
    }
    for (const n of Object.values(this.npcs)) {
      if (n.inCar && (n.inCar.wrecked || n.inCar.hp <= 0)) return this.fail(`${n.name || "Your passenger"} was hurt`), true;
    }
    return false;
  }
  win() {
    if (this.result) return;
    this.result = { win: true, kind: this.kind, id: this.def.id, title: this.def.title || this.def.name, earned: this.earned, t: this.t };
    this.sim.emit({ type: "runEnd", win: true });
  }
  fail(reason) {
    if (this.result) return;
    this.result = { win: false, kind: this.kind, id: this.def.id, title: this.def.title || this.def.name, reason, earned: this.earned, t: this.t };
    this.sim.emit({ type: "runEnd", win: false, reason });
  }
  /** E pressed: give the stage first refusal; true = consumed */
  interact() {
    if (!this.stage || this.result) return false;
    const H = STAGES[this.stage.type];
    return H.interact ? !!H.interact(this, this.st) : false;
  }
  marker() {
    if (!this.stage || this.result) return null;
    const H = STAGES[this.stage.type];
    // need to be in the mission vehicle first?
    if (this.needMain()) {
      const v = this.vehicles[this.main];
      return { x: v.x, z: v.z, kind: "vehicle", r: 3, label: `Get back in the ${VEHICLE[v.type].name}` };
    }
    return H.marker ? H.marker(this, this.st) : null;
  }
  /** the stage needs the player in the mission vehicle but they are not */
  needMain() {
    const s = this.stage;
    if (!this.main || !s || !STAGES[s.type].needsCar) return false;
    const v = this.vehicles[this.main];
    return v && !v.wrecked && carOf(this.sim) !== v;
  }
  goal() {
    if (!this.stage || this.result) return { act: "wait" };
    if (this.needMain()) return { act: "enter", vehicle: this.vehicles[this.main] };
    const H = STAGES[this.stage.type];
    return H.goal ? H.goal(this, this.st) : { act: "wait" };
  }
  timer() {
    const s = this.st;
    if (s && s.until != null) return Math.max(0, s.until - this.stageT);
    return this.timeLeft;
  }
  cleanup() {
    const sim = this.sim;
    for (const v of Object.values(this.vehicles)) {
      if (v === sim.player.car) {
        v.role = "parked";
        v.abandonOk = true;
        continue;
      }
      if (v.owner === "player") continue;
      sim.removeVehicle(v);
    }
    for (const n of Object.values(this.npcs)) sim.removeNpc(n);
    for (const r of this.racers || []) if (r !== sim.player.car) sim.removeVehicle(r);
    for (const r of this.rivals || []) sim.removeVehicle(r);
    this.vehicles = {};
    this.npcs = {};
  }
  resolve(ref) {
    if (typeof ref === "string" && this.vehicles[ref]) return this.vehicles[ref];
    if (typeof ref === "string" && this.npcs[ref]) return this.npcs[ref];
    return this.sim.resolve(ref);
  }
}

/* ------------------------------------------------------------------ helpers */
function inRange(sim, p, r, on) {
  const pl = sim.player;
  if (on === "foot" && pl.mode !== "foot") return false;
  if (on === "car" && pl.mode !== "car") return false;
  const q = pl.mode === "car" ? pl.car : pl;
  return dist(q.x, q.z, p.x, p.z) <= r;
}
function spawnVehicleAt(run, key, s) {
  const sim = run.sim;
  const p = run.resolve(s.at);
  let { x, z } = p;
  let h = s.h ?? p.h ?? 0;
  if (s.offset) {
    x += Math.sin(h) * s.offset;
    z += Math.cos(h) * s.offset;
  }
  // don't spawn on top of something: slide along the kerb
  for (let k = 0; k < 8 && sim.vehicles.some((v) => dist(v.x, v.z, x, z) < 6); k++) {
    x -= Math.sin(h) * 6.5;
    z -= Math.cos(h) * 6.5;
  }
  for (const v of [...sim.vehicles]) if (!v.driver && v.role === "parked" && v.owner !== "player" && dist(v.x, v.z, x, z) < 6) sim.removeVehicle(v);
  const v = makeVehicle(s.vehicle, x, z, h, { role: "mission", paint: s.paint, upgrades: s.upgrades });
  v.y = sim.city.surfaceAt(x, z);
  v.missionKey = key;
  sim.addVehicle(v);
  run.vehicles[key] = v;
  if (s.ai) {
    v.driver = "ai";
    v.ai = { speed: s.speed || 12 };
    if (s.route) {
      v.ai.loop = s.route.map((r) => run.resolve(r));
      v.ai.leg = 0;
    }
  }
  return v;
}
function npcFor(run, key, look, at) {
  const sim = run.sim;
  const p = run.resolve(at);
  const cast = CAST[key];
  const n = makePerson("npc", p.x, p.z, look || (cast ? cast.look : randomLook(sim.rand)), { name: cast ? cast.name : "Passenger", key });
  n.y = sim.city.surfaceAt(p.x, p.z);
  n.h = p.h ?? 0;
  n.mode = "idle";
  run.npcs[key] = n;
  sim.addNpc(n);
  return n;
}
/** AI car drives a route (loop of points) */
function driveLoop(run, v, dt, opts = {}) {
  const sim = run.sim;
  const ai = v.ai;
  if (!ai.route || ai.route.done) {
    const tgt = ai.loop[ai.leg % ai.loop.length];
    ai.route = planRoute(sim.city, v.x, v.z, v.h, tgt.x, tgt.z, { blocked: (e) => sim.edgeBlocked(e), exact: false, center: !!opts.center });
    ai.route.i = 0;
  }
  const r = followRoute(sim, v, ai.route, dt, { speed: ai.speed, lights: !!opts.lights, cornerSpeed: opts.cornerSpeed || 9, arriveR: 9, avoid: opts.avoid, overtake: true });
  if (r === "arrived") {
    ai.leg++;
    ai.route = null;
  }
}

/* ------------------------------------------------------------------ stages */
export const STAGES = {
  goto: {
    needsCar: false,
    enter(run, st) {
      st.p = run.resolve(st.s.to);
    },
    step(run, st) {
      const s = st.s;
      const p = run.resolve(s.to);
      st.p = p;
      if (!inRange(run.sim, p, s.r || 3, s.on)) return false;
      if (s.stop && speedOf(carOf(run.sim)) > 2.5) return false;
      return true;
    },
    marker: (run, st) => ({ x: st.p.x, z: st.p.z, r: st.s.r || 3, kind: st.s.on === "foot" ? "foot" : "drive" }),
    goal: (run, st) => (st.s.on === "car" ? { act: "drive", x: st.p.x, z: st.p.z, r: st.s.r || 3 } : { act: "walk", x: st.p.x, z: st.p.z, r: (st.s.r || 3) * 0.7, sprint: st.s.sprint }),
  },
  jump: {
    enter(run, st) {
      st.n = run.sim.stats.jumps;
    },
    step: (run, st) => run.sim.stats.jumps > st.n,
    marker: () => null,
    goal: () => ({ act: "jump" }),
  },
  spawn: {
    instant: true,
    enter(run, st) {
      spawnVehicleAt(run, st.s.key, st.s);
    },
  },
  spawnNpc: {
    instant: true,
    enter(run, st) {
      const s = st.s;
      npcFor(run, s.key, s.cast ? CAST[s.cast].look : s.look === "random" ? randomLook(run.sim.rand) : null, s.at);
      if (s.cast) run.npcs[s.key].name = CAST[s.cast].name;
    },
  },
  wanted: {
    instant: true,
    enter(run, st) {
      run.sim.police.setWanted(st.s.stars, "Mission");
      run.escapeStars = st.s.stars;
    },
  },
  clearWanted: {
    instant: true,
    enter(run) {
      run.sim.police.setWanted(0);
    },
  },
  clock: {
    instant: true,
    enter(run, st) {
      run.sim.clock = st.s.hour;
    },
  },
  unlock: {
    instant: true,
    enter(run, st) {
      run.sim.unlockDistrict(st.s.district);
    },
  },
  pay: {
    instant: true,
    enter(run, st) {
      run.earned += st.s.amount;
      run.sim.emit({ type: "paid", amount: st.s.amount, label: st.s.label });
    },
  },
  clearBay: {
    instant: true,
    enter(run, st) {
      const b = st.s.bay;
      // the bay and its neighbours are kept free so there's room to manoeuvre
      for (const v of [...run.sim.vehicles]) if (v !== run.sim.player.car && !v.driver && dist(v.x, v.z, b.x, b.z) < 10.5) run.sim.removeVehicle(v);
      for (const s of run.sim.parked.slots) if (dist(s.x, s.z, b.x, b.z) < 10.5) s.reserved = true;
    },
  },
  talk: {
    enter(run, st) {
      const s = st.s;
      if (s.remote) {
        st.started = true;
        run.sim.startDialog(s.lines, () => (st.done = true));
        return;
      }
      st.npc = run.npcs[s.npc] || npcFor(run, s.npc, null, s.at);
      st.npc.talkable = true;
    },
    step(run, st) {
      if (st.done && st.npc) st.npc.talkable = false;
      return !!st.done;
    },
    interact(run, st) {
      if (st.started || !st.npc) return false;
      const pl = run.sim.player;
      if (pl.mode !== "foot" || dist(pl.x, pl.z, st.npc.x, st.npc.z) > 2.8) return false;
      st.started = true;
      st.npc.anim.talk = 99;
      st.npc.h = headingOf(pl.x - st.npc.x, pl.z - st.npc.z);
      run.sim.startDialog(st.s.lines, () => {
        st.done = true;
        st.npc.anim.talk = 0;
      });
      return true;
    },
    marker: (run, st) => (st.npc && !st.started ? { x: st.npc.x, z: st.npc.z, r: 2.4, kind: "npc", label: "Talk (E)" } : null),
    goal: (run, st) => (st.started ? { act: "dialog" } : { act: "talk", x: st.npc.x, z: st.npc.z }),
  },
  enter: {
    enter(run, st) {
      const s = st.s;
      if (s.key) run.main = s.key;
      else run.main = null;
    },
    step(run, st) {
      const s = st.s;
      const car = carOf(run.sim);
      if (!car) return false;
      if (s.key) return car === run.vehicles[s.key];
      if (s.kind) return car.type === s.kind;
      return true;
    },
    marker(run, st) {
      const s = st.s;
      if (s.key) {
        const v = run.vehicles[s.key];
        return v ? { x: v.x, z: v.z, r: 3, kind: "vehicle", label: "Enter (E)" } : null;
      }
      const v = run.sim.nearestEnterable();
      return v ? { x: v.x, z: v.z, r: 3, kind: "vehicle", soft: true } : null;
    },
    goal(run, st) {
      const s = st.s;
      return { act: "enter", vehicle: s.key ? run.vehicles[s.key] : null, kind: s.kind };
    },
  },
  drive: {
    needsCar: true,
    enter(run, st) {
      const s = st.s;
      st.p = run.resolve(s.to);
      if (s.time) st.until = s.time;
      if (s.cargo && run.main) {
        if (run.cargoKey !== run.main) {
          run.cargoKey = run.main;
          run.cargoHp = run.vehicles[run.main].hp;
        }
      }
    },
    step(run, st) {
      const s = st.s;
      if (st.until != null && run.stageT > st.until) return run.fail("Too slow"), false;
      const car = carOf(run.sim);
      if (!car || run.needMain()) return false;
      st.p = run.resolve(s.to);
      return dist(car.x, car.z, st.p.x, st.p.z) <= (s.r || 7) && speedOf(car) < 3;
    },
    marker: (run, st) => ({ x: st.p.x, z: st.p.z, r: st.s.r || 7, kind: "drive", label: "Stop here" }),
    goal: (run, st) => ({ act: "drive", x: st.p.x, z: st.p.z, h: st.p.curb ? st.p.h : null, r: (st.s.r || 7) * 0.6, stop: true }),
  },
  checkpoints: {
    needsCar: true,
    enter(run, st) {
      st.pts = st.s.pts.map((r) => run.resolve(r));
      st.k = 0;
      if (st.s.time) st.until = st.s.time;
    },
    step(run, st) {
      if (st.until != null && run.stageT > st.until) return run.fail("You ran out of time"), false;
      const car = carOf(run.sim);
      if (!car || run.needMain()) return false;
      const p = st.pts[st.k];
      if (dist(car.x, car.z, p.x, p.z) <= (st.s.r || 9)) {
        st.k++;
        run.sim.emit({ type: "checkpoint", n: st.k, of: st.pts.length });
        if (st.k >= st.pts.length) return true;
      }
      return false;
    },
    marker(run, st) {
      const p = st.pts[st.k];
      const n = st.pts[st.k + 1];
      return { x: p.x, z: p.z, r: st.s.r || 9, kind: "check", next: n ? { x: n.x, z: n.z } : null, label: `${st.k + 1}/${st.pts.length}` };
    },
    goal: (run, st) => ({ act: "drive", x: st.pts[st.k].x, z: st.pts[st.k].z, r: (st.s.r || 9) * 0.5, through: true, next: st.pts[st.k + 1] }),
    progress: (run, st) => `${st.k}/${st.pts.length}`,
  },
  visit: {
    needsCar: true,
    enter(run, st) {
      st.pts = st.s.spots.map((r) => run.resolve(r));
      st.done = st.pts.map(() => false);
    },
    step(run, st) {
      const car = carOf(run.sim);
      if (!car) return false;
      st.pts.forEach((p, i) => {
        if (!st.done[i] && dist(car.x, car.z, p.x, p.z) <= (st.s.r || 7) && speedOf(car) < 3.5) {
          st.done[i] = true;
          run.sim.emit({ type: "checkpoint", n: st.done.filter(Boolean).length, of: st.pts.length });
        }
      });
      return st.done.every(Boolean);
    },
    marker(run, st) {
      const car = carOf(run.sim) || run.sim.player;
      let best = null;
      st.pts.forEach((p, i) => {
        if (!st.done[i] && (!best || dist(car.x, car.z, p.x, p.z) < dist(car.x, car.z, best.x, best.z))) best = p;
      });
      return best ? { x: best.x, z: best.z, r: st.s.r || 7, kind: "drive", multi: st.pts.filter((_, i) => !st.done[i]), label: "Stop here" } : null;
    },
    goal(run, st) {
      const m = this.marker(run, st);
      const p = st.pts.find((q) => q.x === m.x && q.z === m.z);
      return { act: "drive", x: m.x, z: m.z, h: p && p.curb ? p.h : null, r: (st.s.r || 7) * 0.5, stop: true };
    },
  },
  interact: {
    enter(run, st) {
      st.p = run.resolve(st.s.at);
    },
    step: (run, st) => !!st.done,
    interact(run, st) {
      const pl = run.sim.player;
      if (pl.mode !== "foot" || dist(pl.x, pl.z, st.p.x, st.p.z) > (st.s.r || 2.4)) return false;
      st.done = true;
      pl.anim.interact = 0.8;
      run.sim.emit({ type: "interacted", label: st.s.label });
      return true;
    },
    marker: (run, st) => ({ x: st.p.x, z: st.p.z, r: st.s.r || 2.4, kind: "foot", label: `${st.s.label || "Use"} (E)` }),
    goal: (run, st) => ({ act: "interact", x: st.p.x, z: st.p.z }),
  },
  collect: {
    enter(run, st) {
      st.items = st.s.items.map((it) => ({ ...it, p: run.resolve(it.at), done: false }));
    },
    step: (run, st) => st.items.every((i) => i.done),
    active(run, st) {
      return st.s.ordered ? st.items.filter((i) => !i.done).slice(0, 1) : st.items.filter((i) => !i.done);
    },
    interact(run, st) {
      const pl = run.sim.player;
      if (pl.mode !== "foot") return false;
      for (const it of STAGES.collect.active(run, st)) {
        if (dist(pl.x, pl.z, it.p.x, it.p.z) <= 2.6) {
          it.done = true;
          pl.anim.interact = 0.8;
          const left = st.items.filter((i) => !i.done).length;
          run.sim.emit({ type: "found", label: it.found ? "Found it!" : st.s.ordered ? "Nothing here…" : `${st.s.label || "Collected"} (${st.items.length - left}/${st.items.length})` });
          return true;
        }
      }
      return false;
    },
    marker(run, st) {
      const list = STAGES.collect.active(run, st);
      const from = run.sim.focus();
      const best = list.reduce((b, i) => (!b || dist(from.x, from.z, i.p.x, i.p.z) < dist(from.x, from.z, b.p.x, b.p.z) ? i : b), null);
      return best ? { x: best.p.x, z: best.p.z, r: 2.6, kind: "foot", multi: list.map((i) => i.p), label: `${st.s.label || "Use"} (E)` } : null;
    },
    goal(run, st) {
      const m = STAGES.collect.marker(run, st);
      return { act: "interact", x: m.x, z: m.z, far: !!st.s.drive };
    },
  },
  board: {
    needsCar: true,
    enter(run, st) {
      st.n = run.npcs[st.s.npc];
    },
    step(run, st, dt) {
      const n = st.n;
      const car = carOf(run.sim);
      if (n.inCar) return true;
      const close = car && dist(car.x, car.z, n.x, n.z) < 10 && speedOf(car) < 1.5;
      if (!close) {
        if (n.mode === "boarding") n.mode = "idle";
        if (car && dist(car.x, car.z, n.x, n.z) < 26 && run.sim.t % 1 < dt) n.anim.wave = 1.2;
        return false;
      }
      n.mode = "boarding";
      st.boardT = (st.boardT || 0) + dt;
      // walk to the passenger door (right side)
      const tx = car.x - Math.cos(car.h) * (car.st.wid / 2 + 0.5);
      const tz = car.z + Math.sin(car.h) * (car.st.wid / 2 + 0.5);
      const d = dist(n.x, n.z, tx, tz);
      // (squeezed by traffic: right beside the car is close enough after a moment)
      if (d < 0.5 || (st.boardT > 2.5 && dist(n.x, n.z, car.x, car.z) < car.st.len / 2 + 1.6)) {
        n.inCar = car;
        n.mode = "seated";
        run.sim.emit({ type: "board" });
        return true;
      }
      const sp = 2.6;
      n.x += ((tx - n.x) / d) * Math.min(d, sp * dt);
      n.z += ((tz - n.z) / d) * Math.min(d, sp * dt);
      n.h = headingOf(tx - n.x, tz - n.z);
      n.anim.speed = sp;
      n.y = run.sim.city.surfaceAt(n.x, n.z);
      return false;
    },
    marker: (run, st) => (st.n.inCar ? null : { x: st.n.x, z: st.n.z, r: 6, kind: "pickup", label: "Stop next to the passenger" }),
    goal: (run, st) => ({ act: "drive", x: st.n.x, z: st.n.z, r: 5, stop: true, hold: true }),
  },
  alight: {
    needsCar: true,
    enter(run, st) {
      st.n = run.npcs[st.s.npc];
      st.out = 0;
    },
    step(run, st, dt) {
      const n = st.n;
      const car = carOf(run.sim);
      if (n.inCar) {
        if (!car || speedOf(car) > 1.2) return false;
        n.inCar = null;
        n.x = car.x - Math.cos(car.h) * (car.st.wid / 2 + 0.6);
        n.z = car.z + Math.sin(car.h) * (car.st.wid / 2 + 0.6);
        n.h = car.h - Math.PI / 2;
        n.mode = "leaving";
        run.sim.emit({ type: "alight" });
        run.payFare = true;
      }
      st.out += dt;
      n.x += Math.sin(n.h) * 1.3 * dt;
      n.z += Math.cos(n.h) * 1.3 * dt;
      run.sim.pushPerson(n);
      n.y = run.sim.city.surfaceAt(n.x, n.z);
      n.anim.speed = 1.3;
      if (st.out > 1.6) {
        run.sim.removeNpc(n);
        delete run.npcs[st.s.npc];
        return true;
      }
      return false;
    },
    marker: () => null,
    goal: () => ({ act: "stopCar" }),
  },
  follow: {
    needsCar: false,
    enter(run, st) {
      const s = st.s;
      st.v = run.vehicles[s.key];
      st.dest = run.resolve(s.to);
      st.v.driver = "ai";
      st.lost = 0;
      st.close = 0;
      st.go = false;
    },
    step(run, st, dt) {
      const v = st.v;
      const sim = run.sim;
      const car = carOf(sim);
      const P = sim.focus();
      const d = dist(v.x, v.z, P.x, P.z);
      if (!st.go) {
        v.input.throttle = 0;
        v.input.brake = 1;
        if (car && d < 70) {
          st.go = true;
          sim.emit({ type: "objective", text: "Follow the black sedan — stay close, don't get too close", hint: "" });
        }
        return false;
      }
      if (!st.route) {
        st.route = planRoute(sim.city, v.x, v.z, v.h, st.dest.x, st.dest.z, { blocked: (e) => sim.edgeBlocked(e) });
        st.route.i = 0;
      }
      // the driver keeps a steady pace, easing off when the tail falls back
      const pace = d < 45 ? 12 : d < 75 ? 8 : 4;
      const r = followRoute(sim, v, st.route, dt, { speed: pace, lights: true, arriveR: 6 });
      if (r === "arrived") st.arrived = true;
      if (d > (st.s.maxDist || 110)) {
        st.lost += dt;
        if (st.lost > 10) return run.fail("You lost him"), false;
      } else st.lost = Math.max(0, st.lost - dt * 2);
      if (car && d < 7 && speedOf(car) > 2) {
        st.close += dt;
        if (st.close > 5) return run.fail("He spotted you tailing him"), false;
      } else st.close = Math.max(0, st.close - dt);
      return st.arrived && d < 45;
    },
    marker: (run, st) => ({ x: st.v.x, z: st.v.z, r: 4, kind: "target", label: st.lost > 0 ? "Losing him!" : "Follow" }),
    goal: (run, st) => (st.go ? { act: "follow", vehicle: st.v, keep: 22 } : { act: "drive", x: st.v.x, z: st.v.z, r: 30, stop: true }),
  },
  chase: {
    needsCar: false,
    enter(run, st) {
      st.v = run.vehicles[st.s.key];
      st.lost = 0;
      st.v.role = "mission";
      st.v.chaseTarget = true;
    },
    step(run, st, dt) {
      const v = st.v;
      const sim = run.sim;
      if (st.done) return true;
      if (v.stalled || v.wrecked || v.hp <= 0) {
        // the engine dies (the car is not destroyed: it can be driven home after)
        st.done = true;
        v.driver = null;
        v.stalled = true;
        v.ai = null;
        v.input.throttle = 0;
        v.input.brake = 1;
        sim.emit({ type: "targetStopped" });
        // the driver bails out and runs
        const run2 = makePerson("ped", v.x + Math.cos(v.h) * 1.8, v.z - Math.sin(v.h) * 1.8, CAST.dash.look);
        run2.mode = "flee";
        run2.fx = sim.player.x;
        run2.fz = sim.player.z;
        run2.timer = 8;
        run2.walk = sim.city.walks[0];
        sim.peds.list.push(run2);
        return true;
      }
      const P = sim.focus();
      const d = dist(v.x, v.z, P.x, P.z);
      // flee faster when the player is close
      v.ai.speed = (st.s.speed || run.defSpeed || 0) || (d < 40 ? 20 : 16);
      if (!carOf(sim)) {
        v.input.throttle = 0;
        v.input.brake = 1;
      } else driveLoop(run, v, dt, { cornerSpeed: 11, avoid: true });
      if (d > (st.s.loseDist || 200)) {
        st.lost += dt;
        if (st.lost > 10) return run.fail("The target got away"), false;
      } else st.lost = 0;
      return false;
    },
    marker: (run, st) => ({ x: st.v.x, z: st.v.z, r: 4, kind: "target", label: `Target ${Math.round((Math.max(0, st.v.hp) / st.v.st.hp) * 100)}%` }),
    goal: (run, st) => (carOf(run.sim) ? { act: "ram", vehicle: st.v } : { act: "enter" }),
    progress: (run, st) => Math.max(0, st.v.hp) / st.v.st.hp,
  },
  escape: {
    needsCar: false,
    enter(run, st) {
      const p = run.sim.police;
      if (p.wanted === 0) p.setWanted(st.s.stars || run.escapeStars || 2, "Mission");
      st.had = true;
    },
    step: (run) => run.sim.police.wanted === 0,
    marker: () => null,
    goal: () => ({ act: "escape" }),
  },
  race: {
    needsCar: true,
    enter(run, st) {
      const sim = run.sim;
      const s = st.s;
      st.pts = s.pts.map((r) => run.resolve(r));
      st.k = 0;
      st.count = 3.2;
      const car = carOf(sim);
      run.racers = [];
      // street racers bring cars in your class (side races), or the story's field
      const CLASS = { compact: ["compact", "compact", "compact"], sedan: ["sedan", "taxi", "compact"], taxi: ["taxi", "sedan", "compact"], van: ["van", "van", "van"], suv: ["suv", "suv", "van"], muscle: ["muscle", "muscle", "sedan"], sports: ["sports", "muscle", "muscle"], police: ["police", "muscle", "muscle"] };
      const types = (st.s.matchClass && car && (CLASS[car.type] || CLASS[VEHICLE[car.type]?.race])) || st.s.field || ["muscle", "sports", "sedan", "suv", "muscle"];
      const paints = ["#c4161c", "#14161c", "#8f3cff", "#28c7c2", "#ffe14d"];
      const base = car || sim.player;
      // line the grid up with the road you're on (not with however you parked)
      let h = car ? car.h : sim.player.h;
      const q = sim.city.roadQuery(base.x, base.z);
      if (q) {
        const eh = Math.atan2(q.edge.dx, q.edge.dz);
        h = Math.abs(wrapA(eh - h)) < Math.PI / 2 ? eh : wrapA(eh + Math.PI);
      }
      const fx = Math.sin(h);
      const fz = Math.cos(h);
      const rx = -fz;
      const rz = fx;
      for (let i = 0; i < s.racers; i++) {
        // starting grid: beside the player in the other lane, then rows behind
        const back = Math.ceil(i / 2) * 9;
        const lat = i % 2 === 0 ? -LANE_OFF * 2 : 0;
        const x = base.x - fx * back + rx * lat;
        const z = base.z - fz * back + rz * lat;
        const tune = s.tune ?? 1;
        const v = makeVehicle(types[i % types.length], x, z, h, { role: "racer", paint: paints[i % paints.length], upgrades: { engine: tune + (run.def.id >= 20 ? 1 : 0), handling: tune } });
        v.y = sim.city.surfaceAt(x, z);
        v.driver = "ai";
        v.ai = { k: 0, route: null };
        v.racer = i;
        sim.addVehicle(v);
        run.racers.push(v);
      }
      sim.freezeCar = true;
    },
    step(run, st, dt) {
      const sim = run.sim;
      const car = carOf(sim);
      if (st.count > 0) {
        const before = Math.ceil(st.count);
        st.count -= dt;
        if (Math.ceil(st.count) !== before) sim.emit({ type: "countdown", n: Math.max(0, Math.ceil(st.count)) });
        for (const r of run.racers) {
          r.input.throttle = 0;
          r.input.brake = 1;
        }
        if (st.count <= 0) sim.freezeCar = false;
        return false;
      }
      sim.freezeCar = false;
      // racers
      const lead = this.position(run, st);
      for (const r of run.racers) {
        const ai = r.ai;
        if (ai.k >= st.pts.length) {
          r.input.throttle = 0;
          r.input.brake = 1;
          continue;
        }
        const p = st.pts[ai.k];
        if (!ai.route) {
          ai.route = planRoute(sim.city, r.x, r.z, r.h, p.x, p.z, { blocked: (e) => sim.edgeBlocked(e), center: false, exact: true });
          ai.route.i = 0;
        }
        // rubber band: a little help when far behind, a little lift when far ahead
        const myD = st.k * 1000 - (car ? dist(car.x, car.z, st.pts[st.k]?.x ?? car.x, st.pts[st.k]?.z ?? car.z) : 0);
        const rD = ai.k * 1000 - dist(r.x, r.z, p.x, p.z);
        const gap = myD - rD;
        // rubber band: ease off when the player is behind (side races ease off more)
        const band = st.s.easy ? clamp(1 + gap / 500, 0.78, 1.06) : clamp(1 + gap / 900, 0.86, 1.08);
        const sp = r.st.top * (st.s.pace || 0.76) * band;
        followRoute(sim, r, ai.route, dt, { speed: sp, cornerSpeed: 9.5, arriveR: 1, overtake: true });
        if (dist(r.x, r.z, p.x, p.z) < (st.s.r || 11)) {
          ai.k++;
          ai.route = null;
          if (ai.k >= st.pts.length) {
            r.finished = (st.finishOrder = (st.finishOrder || 0) + 1);
            if (!st.playerDone && (st.s.place || 1) <= st.finishOrder) return run.fail("You lost the race"), false;
          }
        }
      }
      void lead;
      if (!car || run.needMain()) return false;
      const p = st.pts[st.k];
      if (dist(car.x, car.z, p.x, p.z) <= (st.s.r || 11)) {
        st.k++;
        sim.emit({ type: "checkpoint", n: st.k, of: st.pts.length });
        if (st.k >= st.pts.length) {
          st.playerDone = true;
          return true;
        }
      }
      return false;
    },
    position(run, st) {
      const car = carOf(run.sim) || run.sim.player;
      const score = (k, x, z) => k * 10000 - (k < st.pts.length ? dist(x, z, st.pts[k].x, st.pts[k].z) : 0);
      const me = score(st.k, car.x, car.z);
      let pos = 1;
      for (const r of run.racers) if (score(r.ai.k, r.x, r.z) > me) pos++;
      st.pos = pos;
      return pos;
    },
    marker(run, st) {
      const p = st.pts[Math.min(st.k, st.pts.length - 1)];
      const n = st.pts[st.k + 1];
      return { x: p.x, z: p.z, r: st.s.r || 11, kind: "check", next: n ? { x: n.x, z: n.z } : null, label: st.count > 0 ? "Get ready" : `Pos ${st.pos || 1}/${run.racers.length + 1}` };
    },
    goal: (run, st) => (st.count > 0 ? { act: "wait" } : { act: "drive", x: st.pts[st.k].x, z: st.pts[st.k].z, r: 5, through: true, race: true, next: st.pts[st.k + 1] }),
  },
  park: {
    needsCar: true,
    enter(run, st) {
      st.p = run.resolve(st.s.at);
      st.hold = 0;
      if (st.s.time) st.until = st.s.time;
      st.scrapes = run.sim.stats.scrapes;
    },
    step(run, st, dt) {
      const s = st.s;
      if (st.until != null && run.stageT > st.until) return run.fail("Out of time"), false;
      const car = carOf(run.sim);
      // the no-scrape rule is about the manoeuvre itself: near the bay
      const close = car && dist(car.x, car.z, st.p.x, st.p.z) < 14;
      if (!close) st.scrapes = run.sim.stats.scrapes;
      if (s.noScrape && close && run.sim.stats.scrapes > st.scrapes) return run.fail("You hit something"), false;
      if (!car) return false;
      const ok = parkedIn(car, st.p);
      st.ok = ok;
      if (ok && speedOf(car) < 0.6) st.hold += dt;
      else st.hold = 0;
      return st.hold > 0.8;
    },
    marker: (run, st) => ({ x: st.p.x, z: st.p.z, r: 3, kind: "park", h: st.p.h, rect: st.p.rect, label: st.ok ? "Hold still…" : "Park here" }),
    goal: (run, st) => ({ act: "park", x: st.p.x, z: st.p.z, h: st.p.h, via: st.p.via }),
  },
  rivals: {
    needsCar: true,
    enter(run, st) {
      const sim = run.sim;
      st.p = run.resolve(st.s.to);
      st.spawned = false;
      run.rivals = [];
    },
    step(run, st, dt) {
      const sim = run.sim;
      const car = carOf(sim);
      if (!st.spawned && car) {
        st.spawned = true;
        for (let i = 0; i < (st.s.count || 2); i++) {
          const x = car.x - Math.sin(car.h) * (45 + i * 12) - Math.cos(car.h) * (i % 2 ? 3 : -3);
          const z = car.z - Math.cos(car.h) * (45 + i * 12) + Math.sin(car.h) * (i % 2 ? 3 : -3);
          const q = sim.city.roadQuery(x, z);
          const v = makeVehicle(i % 2 ? "muscle" : "suv", q ? q.x : x, q ? q.z : z, car.h, { role: "rival", paint: "#111111", upgrades: { engine: 1, armor: 1 } });
          v.y = sim.city.surfaceAt(v.x, v.z);
          v.driver = "ai";
          v.ai = { route: null, replan: 0 };
          sim.addVehicle(v);
          run.rivals.push(v);
        }
        sim.emit({ type: "rivals" });
      }
      for (const v of run.rivals) {
        if (v.wrecked || !car) {
          v.input.throttle = 0;
          v.input.brake = 1;
          continue;
        }
        const d = dist(v.x, v.z, car.x, car.z);
        if (d < 45 && !sim.col.segBlocked(v.x, v.z, v.y + 1.4, car.x, car.z, car.y + 1.2)) {
          const want = headingOf(car.x + car.vx * 0.5 - v.x, car.z + car.vz * 0.5 - v.z);
          const err = wrapA(want - v.h);
          v.input.steer = clamp(-err * 2.4, -1, 1);
          v.input.throttle = 1;
          v.input.brake = 0;
          v.ai.route = null;
          if (Math.abs(v.vf) < 0.5) {
            v.ai.stuck = (v.ai.stuck || 0) + dt;
            if (v.ai.stuck > 1.5) v.ai.rev = 1;
          }
          // after a hit, back off and line up another run instead of bulldozing
          // the player along at walking pace
          if (d < 6.5 && speedOf(v) < 4) v.ai.pin = (v.ai.pin || 0) + dt;
          else v.ai.pin = 0;
          if (v.ai.pin > 1.2 && !(v.ai.rev > 0)) {
            v.ai.pin = 0;
            v.ai.rev = 1.3;
          }
          if (v.ai.rev > 0) {
            v.ai.rev -= dt;
            v.input.throttle = -1;
            v.input.steer = -v.input.steer;
            if (v.ai.rev <= 0) v.ai.stuck = 0;
          }
        } else {
          v.ai.replan -= dt;
          if (!v.ai.route || v.ai.replan <= 0) {
            v.ai.replan = 1.5;
            v.ai.route = planRoute(sim.city, v.x, v.z, v.h, car.x, car.z, { blocked: (e) => sim.edgeBlocked(e), center: true });
            v.ai.route.i = 0;
          }
          followRoute(sim, v, v.ai.route, dt, { speed: v.st.top * 0.8, cornerSpeed: 10, ignore: car, ram: true });
        }
      }
      if (!car) return false;
      const done = dist(car.x, car.z, st.p.x, st.p.z) <= (st.s.r || 8) && speedOf(car) < 3;
      if (done) for (const v of run.rivals) v.ai = null;
      return done;
    },
    marker: (run, st) => ({ x: st.p.x, z: st.p.z, r: st.s.r || 8, kind: "drive", label: "Stop here" }),
    goal: (run, st) => ({ act: "drive", x: st.p.x, z: st.p.z, h: st.p.curb ? st.p.h : null, r: 4, stop: true }),
  },
};

/** car inside a bay rect (or near the spot) and lined up with it (either way round) */
export function parkedIn(car, p) {
  const rect = p.rect;
  const fx = Math.sin(car.h);
  const fz = Math.cos(car.h);
  const half = car.st.len / 2 - 0.3;
  const ends = [
    [car.x + fx * half, car.z + fz * half],
    [car.x - fx * half, car.z - fz * half],
  ];
  const inside = rect
    ? ends.every(([x, z]) => x >= rect.x0 && x <= rect.x1 && z >= rect.z0 && z <= rect.z1)
    : dist(car.x, car.z, p.x, p.z) < 1.6;
  const dh = Math.abs(wrapA(car.h - (p.h || 0)));
  const aligned = dh < 0.3 || Math.abs(dh - Math.PI) < 0.3;
  return inside && aligned;
}
