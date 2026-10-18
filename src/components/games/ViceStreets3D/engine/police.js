/**
 * Vice Streets 3D — wanted level (0–5 ★) and the police.
 *
 * Crimes add stars directly (ramming a cruiser, stealing one, entering a
 * restricted yard, knocking people down) or add "heat" when an officer
 * witnesses them (reckless crashes, red lights, speeding past a patrol);
 * 100 heat = one more star. Mission scripts can also set a level.
 *
 * Response by level:
 *   1 ★  the nearest patrols come to investigate and try to stop you
 *   2 ★  cruisers give chase
 *   3 ★  more cruisers; some take routes to cut you off ahead
 *   4 ★  roadblocks at junctions ahead of you, tougher cruisers
 *   5 ★  everything, faster cruisers, more roadblocks
 *
 * Officers see you within ~80 m (60 m at night) with a clear line of sight.
 * While nobody sees you the stars flash and an evade timer runs (8 s + 4 s
 * per star; faster hidden in a garage, slower when a cruiser is searching
 * nearby). Police search your last known position; being spotted resets the
 * timer. Only a completed evade clears the level.
 *
 * Arrest: on foot, an officer that reaches you and holds on ~1 s; in a car,
 * being stopped next to a cruiser for 3 s.
 */
import { makeVehicle } from "./vehicle.js";
import { planRoute, followRoute } from "./nav.js";
import { makePerson } from "./peds.js";
import { extendWander } from "./traffic.js";
import { CAST } from "../data/people.js";
import { dist, clamp, headingOf, wrapA } from "./util.js";
import { zoneAt } from "./city.js";

export const UNITS = [2, 3, 3, 4, 5, 6];
export const evadeTime = (w) => 10 + 5 * w;
/** the fastest a cruiser will drive in pursuit, by wanted level (m/s) */
export const PURSUIT_SPEED = [25, 29, 32, 35, 39, 43];
/** roadblocks are set up from this many stars */
export const ROADBLOCK_STARS = 3;

export class Police {
  constructor(sim) {
    this.sim = sim;
    this.wanted = 0;
    this.heat = 0;
    this.seen = false;
    this.seenBy = null;
    this.last = null; // last seen position
    this.evadeT = 0;
    this.units = [];
    this.foot = [];
    this.roadblockT = 10;
    this.spawnT = 0;
    this.bustT = 0;
    this.knowT = 0;
    this.enabled = true;
    this.maxWanted = 5;
    this.patrols = 2;
  }
  get evadeMax() {
    return evadeTime(this.wanted);
  }
  setWanted(n, reason = "") {
    n = clamp(Math.round(n), 0, this.maxWanted);
    const old = this.wanted;
    if (n === old) return;
    this.wanted = n;
    this.evadeT = 0;
    if (n > old) {
      const P = this.sim.focus();
      this.last = { x: P.x, z: P.z, t: this.sim.t };
      this.knowT = 4;
      this.sim.emit({ type: "wanted", from: old, to: n, reason });
    } else if (n === 0) {
      this.sim.emit({ type: "wantedLost", from: old });
      for (const u of this.units) if (u.ai.state !== "roadblock") this.toPatrol(u);
    } else this.sim.emit({ type: "wanted", from: old, to: n, reason });
  }
  /** crimes: returns true when it changed anything */
  report(crime, x, z, impact = 10) {
    if (!this.enabled) return false;
    const witnessed = this.witnessAt(x, z);
    const before = this.wanted;
    switch (crime) {
      case "ramPolice":
        if (this.wanted === 0) this.setWanted(impact >= 7 ? 2 : 1, impact >= 7 ? "Rammed a police car" : "Hit a police car");
        else {
          this.rams = (this.rams || 0) + 1;
          if (this.rams % 2 === 0) this.setWanted(this.wanted + 1, "Ramming police");
        }
        break;
      case "stealPolice":
        this.setWanted(Math.max(this.wanted, 2), "Stole a police car");
        break;
      case "restricted":
        this.setWanted(Math.max(this.wanted, 2), "Restricted area");
        break;
      case "hitPed":
        if (witnessed || this.wanted > 0) this.setWanted(Math.max(this.wanted, 1) + (this.wanted >= 1 && witnessed ? 0 : 0), "Hit a pedestrian");
        else this.addHeat(55, x, z, true);
        break;
      case "carjack":
        if (witnessed) this.setWanted(Math.max(this.wanted, 1), "Carjacking");
        else this.addHeat(30, x, z, true);
        break;
      case "reckless":
        if (witnessed) this.addHeat(34, x, z);
        break;
      case "redLight":
        if (witnessed) this.addHeat(40, x, z);
        break;
      case "speeding":
        if (witnessed) this.addHeat(2, x, z);
        break;
      case "sidewalk":
        if (witnessed) this.addHeat(20, x, z);
        break;
      // violence against people: a seen assault is an instant star; unseen it
      // builds heat until a witness calls it in. Repeats escalate.
      case "assault":
        this.assaults = (this.assaults || 0) + 1;
        if (witnessed) this.setWanted(Math.max(this.wanted, 1), "Assault");
        else if (this.wanted > 0 && this.assaults % 5 === 0 && this.wanted < 3) this.setWanted(this.wanted + 1, "Repeated assaults");
        else this.addHeat(30, x, z, true);
        break;
      case "seriousAssault":
        this.assaults = (this.assaults || 0) + 2;
        if (witnessed) this.setWanted(Math.max(this.wanted, 1), "Assault");
        else this.addHeat(60, x, z, true);
        if (this.wanted > 0 && this.assaults >= 8 && this.wanted < 3) {
          this.assaults = 0;
          this.setWanted(this.wanted + 1, "Repeated assaults");
        }
        break;
      case "murder":
      case "vehicularKill":
        this.kills = (this.kills || 0) + 1;
        if (witnessed || this.wanted > 0) this.setWanted(Math.max(this.wanted + (this.wanted >= 2 && this.kills % 2 === 0 ? 1 : 0), 2), crime === "murder" ? "Murder" : "Vehicular manslaughter");
        else this.setWanted(Math.max(this.wanted, 1), "Body found");
        break;
      case "assaultCop":
        this.copHits = (this.copHits || 0) + 1;
        if (this.wanted < 2) this.setWanted(2, "Assaulting an officer");
        else if (this.copHits % 3 === 0) this.setWanted(this.wanted + 1, "Assaulting officers");
        break;
      case "copKilled":
        this.setWanted(Math.max(3, this.wanted + 1), "Officer down");
        break;
      case "assaultReported":
        // a bystander phoned it in
        if (this.wanted === 0) this.setWanted(1, "Witness called the police");
        else {
          const P = this.sim.focus();
          this.last = { x: P.x, z: P.z, t: this.sim.t };
          this.knowT = Math.max(this.knowT || 0, 3);
        }
        break;
      default:
    }
    return this.wanted !== before;
  }
  addHeat(h, x, z, civilian = false) {
    // traffic offences start a pursuit; during one they don't make it worse
    if (this.wanted > 0) return;
    this.heat += h;
    if (this.heat >= 100) {
      this.heat = 0;
      this.setWanted(Math.max(1, this.wanted + (this.wanted === 0 ? 1 : civilian ? 0 : 1)), civilian ? "Witnesses called the police" : "Reckless driving");
    }
  }
  /** can an officer see the point? */
  witnessAt(x, z) {
    const sim = this.sim;
    const range = sim.isNight() ? 55 : 75;
    for (const u of this.units) {
      if (u.wrecked || u.ai.state === "roadblock") continue;
      if (dist(u.x, u.z, x, z) < range && !sim.col.segBlocked(u.x, u.z, u.y + 1.6, x, z, sim.city.groundAt(x, z) + 1.2)) return u;
    }
    for (const c of this.foot) if (dist(c.x, c.z, x, z) < 40 && !sim.col.segBlocked(c.x, c.z, c.y + 1.6, x, z, sim.city.groundAt(x, z) + 1.2)) return c;
    return null;
  }

  spawnUnit(state, near) {
    const sim = this.sim;
    const P = sim.focus();
    const N = sim.city.nodes;
    let best = null;
    for (let tries = 0; tries < 30; tries++) {
      const n = sim.rand.pick(N);
      if (!sim.districtOpen(sim.city.districtAt(n.x, n.z))) continue;
      const d = dist(n.x, n.z, near ? near.x : P.x, near ? near.z : P.z);
      if (d < 85 || d > 175) continue;
      if (sim.vehicles.some((v) => dist(v.x, v.z, n.x, n.z) < 12)) continue;
      const hidden = sim.col.segBlocked(n.x, n.z, n.y + 1.5, P.x, P.z, P.y + 1.5);
      best = n;
      if (hidden) break;
    }
    if (!best) return null;
    const e = sim.city.edges[sim.rand.pick(best.edges)];
    const other = N[e.a === best.id ? e.b : e.a];
    const h = headingOf(other.x - best.x, other.z - best.z);
    const boost = this.wanted >= 4 ? { engine: this.wanted - 2, handling: 2, armor: 2 } : this.wanted >= 3 ? { engine: 1, handling: 1 } : {};
    const v = makeVehicle("police", best.x, best.z, h, { role: "police", upgrades: boost });
    v.y = best.y;
    v.driver = "ai";
    v.ai = { state, t: 0, route: null, replan: 0 };
    v.wander = { prev: best.id, cur: other.id };
    v.route = { pts: [{ x: v.x, z: v.z }], i: 0 };
    v.cruise = 12;
    v.lights = sim.isNight();
    if (state === "patrol") extendWander(sim, v);
    sim.addVehicle(v);
    this.units.push(v);
    return v;
  }
  toPatrol(u) {
    u.ai.state = "patrol";
    u.siren = false;
    u.ai.route = null;
    // rejoin the road network from where it is
    const q = this.sim.city.roadQuery(u.x, u.z) || { edge: this.sim.city.edges[0] };
    const e = q.edge;
    const fwdB = Math.sin(u.h) * e.dx + Math.cos(u.h) * e.dz > 0;
    u.wander = { prev: fwdB ? e.a : e.b, cur: fwdB ? e.b : e.a };
    u.route = { pts: [{ x: u.x, z: u.z }], i: 0 };
    extendWander(this.sim, u);
  }

  step(dt) {
    const sim = this.sim;
    const P = sim.focus();
    const pl = sim.player;
    // retire wrecked / far / surplus units
    const need = UNITS[this.wanted];
    for (let k = this.units.length - 1; k >= 0; k--) {
      const u = this.units[k];
      const d = dist(u.x, u.z, P.x, P.z);
      const surplus = this.units.length > need && (u.ai.state === "patrol" || u.ai.state === "roadblock") && d > 140;
      if (u.driver === "player" || !sim.vehicles.includes(u)) {
        this.units.splice(k, 1);
        continue;
      }
      if ((u.wrecked && d > 80) || d > 260 || surplus || (u.ai.state === "roadblock" && this.wanted < 4 && d > 90)) {
        sim.removeVehicle(u);
        this.units.splice(k, 1);
      }
    }
    if (!this.enabled) return;
    // top up
    this.spawnT -= dt;
    const live = this.units.filter((u) => !u.wrecked && u.ai.state !== "roadblock").length;
    if (this.spawnT <= 0 && live < need) {
      this.spawnT = this.wanted ? 2.2 : 6;
      this.spawnUnit(this.wanted ? (this.wanted >= 3 && live % 2 === 1 ? "intercept" : "pursue") : "patrol");
    }
    // existing patrols join the chase
    if (this.wanted > 0) for (const u of this.units) if (u.ai.state === "patrol" && !u.wrecked) u.ai.state = "pursue";

    // visibility
    const range = sim.isNight() ? 50 : 70;
    let seer = null;
    for (const u of this.units) {
      if (u.wrecked || u.driver !== "ai") continue;
      const d = dist(u.x, u.z, P.x, P.z);
      u.ai.sees = d < range && !sim.col.segBlocked(u.x, u.z, u.y + 1.6, P.x, P.z, P.y + 1.3);
      if (u.ai.sees && (!seer || d < dist(seer.x, seer.z, P.x, P.z))) seer = u;
    }
    for (const c of this.foot) {
      c.sees = dist(c.x, c.z, P.x, P.z) < 45 && !sim.col.segBlocked(c.x, c.z, c.y + 1.6, P.x, P.z, P.y + 1.3);
      if (c.sees && !seer) seer = c;
    }
    this.seen = !!seer && this.wanted > 0;
    this.seenBy = seer;
    if (this.wanted > 0) {
      if (seer) {
        this.last = { x: P.x, z: P.z, t: sim.t };
        this.evadeT = 0;
        this.knowT = 3;
      } else {
        this.knowT -= dt;
        if (this.knowT > 0) this.last = { x: P.x, z: P.z, t: sim.t };
        this.knowT = Math.min(this.knowT, 2);
        const hide = zoneAt(sim.city, P.x, P.z, "hideout") && (pl.mode === "foot" || Math.abs(pl.car?.vf || 0) < 1);
        const searching = this.units.some((u) => !u.wrecked && dist(u.x, u.z, P.x, P.z) < 45);
        const k = hide ? (sim.prog.garage.up.security ? 5 : 2.6) : searching ? 0.55 : 1;
        this.evadeT += dt * k;
        if (this.evadeT >= this.evadeMax) this.setWanted(0);
      }
    } else {
      this.heat = Math.max(0, this.heat - dt * 4);
    }
    // roadblocks at 4+ stars
    if (this.wanted >= ROADBLOCK_STARS && pl.mode === "car") {
      this.roadblockT -= dt;
      if (this.roadblockT <= 0) {
        this.roadblockT = this.wanted >= 5 ? 16 : 24;
        this.placeRoadblock();
      }
    }
    // drive
    for (const u of this.units) this.drive(u, dt);
    this.stepFoot(dt);
    // arrest in a vehicle: stopped, boxed in by a cruiser
    if (this.wanted > 0 && pl.mode === "car" && pl.car) {
      const slow = Math.hypot(pl.car.vx, pl.car.vz) < 2.2;
      const near = this.units.some((u) => !u.wrecked && u.ai.state !== "roadblock" && dist(u.x, u.z, pl.car.x, pl.car.z) < 8.5);
      if (slow && near) this.bustT += dt;
      else this.bustT = Math.max(0, this.bustT - dt * 1.2);
      if (this.bustT >= 3) {
        this.bustT = 0;
        sim.busted();
      }
    } else if (pl.mode !== "foot") this.bustT = 0;
  }

  drive(u, dt) {
    const sim = this.sim;
    const P = sim.focus();
    const ai = u.ai;
    if (u.wrecked || u.driver !== "ai") {
      u.siren = false;
      u.input.throttle = 0;
      u.input.brake = 1;
      return;
    }
    ai.t += dt;
    u.lights = sim.isNight() || this.wanted > 0;
    switch (ai.state) {
      case "patrol":
        u.siren = false;
        extendWander(sim, u);
        followRoute(sim, u, u.route, dt, { speed: 12, lights: true });
        return;
      case "roadblock":
        u.siren = true;
        u.input.throttle = 0;
        u.input.brake = 1;
        u.input.steer = 0;
        return;
      default:
    }
    u.siren = true;
    const d = dist(u.x, u.z, P.x, P.z);
    const pv = sim.player.mode === "car" && sim.player.car ? sim.player.car : { vx: 0, vz: 0 };
    // close and in sight: chase directly (predict a little ahead, ram)
    if ((ai.sees && d < 55) || d < 14) {
      const lead = clamp(d / 25, 0.2, 1.2);
      let tx = P.x + pv.vx * lead;
      let tz = P.z + pv.vz * lead;
      // 1–2 stars: tail the car and wait for it to stop; 3+: ram it
      const ps0 = Math.hypot(pv.vx, pv.vz);
      if (this.wanted <= 2 && sim.player.mode === "car" && ps0 > 3 && d < 22) {
        tx = P.x - (pv.vx / ps0) * 7;
        tz = P.z - (pv.vz / ps0) * 7;
      }
      const want = headingOf(tx - u.x, tz - u.z);
      const err = wrapA(want - u.h);
      const ps = Math.hypot(pv.vx, pv.vz);
      // catch up, then match speed and box the player in rather than ramming
      let sp = Math.min(PURSUIT_SPEED[this.wanted], Math.max(8, d < 14 ? ps + 1 : ps + 6));
      if (sim.player.mode === "foot") sp = d > 20 ? 14 : clamp(d - 6, 0, 8);
      if (Math.abs(err) > 1.6 && d < 20) {
        // facing away: back up and swing round
        u.input.throttle = -0.8;
        u.input.brake = 0;
        u.input.steer = clamp(err * 1.5, -1, 1);
        u.input.handbrake = false;
      } else {
        u.input.steer = clamp(-err * 2.4, -1, 1);
        const dv = sp - u.vf;
        u.input.throttle = dv > 0 ? clamp(dv / 4, 0.3, 1) : 0;
        u.input.brake = dv < -2 ? clamp(-dv / 6, 0.2, 1) : 0;
        u.input.handbrake = Math.abs(err) > 0.9 && u.vf > 12;
      }
      ai.route = null;
      // stuck against something: reverse a bit
      if (Math.abs(u.vf) < 0.5 && u.input.throttle > 0.3 && d > 9) {
        ai.stuck = (ai.stuck || 0) + dt;
        if (ai.stuck > 1.5) ai.rev = 1.1;
      } else ai.stuck = 0;
      if (ai.rev > 0) {
        ai.rev -= dt;
        u.input.throttle = -0.9;
        u.input.brake = 0;
        u.input.steer = -u.input.steer;
      }
      return;
    }
    // otherwise drive the road graph toward where they think you are
    ai.replan -= dt;
    const known = this.knowT > 0 || this.seen;
    let tx = known ? P.x : this.last ? this.last.x : P.x;
    let tz = known ? P.z : this.last ? this.last.z : P.z;
    if (ai.state === "intercept" && known && sim.player.mode === "car") {
      tx += pv.vx * 4;
      tz += pv.vz * 4;
    }
    if (!ai.route || ai.replan <= 0) {
      ai.replan = 1.6;
      ai.route = planRoute(sim.city, u.x, u.z, u.h, tx, tz, { blocked: (e) => sim.edgeBlocked(e), center: true });
      ai.route.i = 0;
    }
    const r = followRoute(sim, u, ai.route, dt, { speed: PURSUIT_SPEED[this.wanted], cornerSpeed: 10, arriveR: 8, ignore: sim.player.car, ram: true, overtake: true });
    if (r === "arrived" && !known) {
      // searched there: look around nearby
      const a = sim.rand() * Math.PI * 2;
      this.last = { x: this.last.x + Math.cos(a) * 60, z: this.last.z + Math.sin(a) * 60, t: sim.t };
      ai.route = null;
    }
  }

  placeRoadblock() {
    const sim = this.sim;
    const car = sim.player.car;
    const sp = Math.hypot(car.vx, car.vz);
    if (sp < 8) return;
    const hx = car.vx / sp;
    const hz = car.vz / sp;
    let best = null;
    for (const n of sim.city.nodes) {
      if (!n.grid) continue;
      const dx = n.x - car.x;
      const dz = n.z - car.z;
      const ahead = dx * hx + dz * hz;
      const side = Math.abs(dx * hz - dz * hx);
      if (ahead < 90 || ahead > 170 || side > 25) continue;
      if (sim.vehicles.some((v) => dist(v.x, v.z, n.x, n.z) < 10)) continue;
      if (!best || ahead < best.ahead) best = { n, ahead };
    }
    if (!best) return;
    const n = best.n;
    // block the arm the player will arrive on: two cruisers nose to nose across it
    const ax = Math.abs(hx) > Math.abs(hz) ? [Math.sign(hx), 0] : [0, Math.sign(hz)];
    const cx = n.x - ax[0] * 13;
    const cz = n.z - ax[1] * 13;
    for (const s of [-1, 1]) {
      const x = cx + -ax[1] * s * 2.6;
      const z = cz + ax[0] * s * 2.6;
      const v = makeVehicle("police", x, z, headingOf(-ax[1] * s, ax[0] * s), { role: "police" });
      v.y = n.y;
      v.driver = "ai";
      // parked across the road with the handbrake on: heavy, but it can be rammed aside
      v.siren = true;
      v.lights = true;
      v.ai = { state: "roadblock", t: 0 };
      sim.addVehicle(v);
      this.units.push(v);
    }
    sim.emit({ type: "roadblock", x: cx, z: cz });
  }

  /* --------------------------------------------------------------- officers on foot */
  stepFoot(dt) {
    const sim = this.sim;
    const pl = sim.player;
    // officers get out next to a player on foot
    if (this.wanted > 0 && pl.mode === "foot" && this.foot.length < Math.min(3, this.wanted + 1)) {
      for (const u of this.units) {
        if (u.wrecked || u.ai.state === "roadblock" || u.copOut) continue;
        if (Math.hypot(u.vx, u.vz) < 2 && dist(u.x, u.z, pl.x, pl.z) < 30) {
          u.copOut = true;
          const side = { x: u.x + Math.cos(u.h) * 1.6, z: u.z - Math.sin(u.h) * 1.6 };
          const c = makePerson("cop", side.x, side.z, (this.foot.length % 2 ? CAST.copF : CAST.cop).look, { car: u, mode: "chase" });
          c.y = sim.city.surfaceAt(c.x, c.z);
          c.h = headingOf(pl.x - c.x, pl.z - c.z);
          this.foot.push(c);
          sim.emit({ type: "copOut", x: c.x, z: c.z });
          break;
        }
      }
    }
    for (let k = this.foot.length - 1; k >= 0; k--) {
      const c = this.foot[k];
      const A = c.anim;
      // punched or run over: stagger / lie on the ground, then carry on
      if (sim.peds.stepHurt(c, dt)) continue;
      if (c.mode === "down") {
        c.timer -= dt;
        A.down = 1;
        c.vx *= Math.exp(-4 * dt);
        c.vz *= Math.exp(-4 * dt);
        c.x += c.vx * dt;
        c.z += c.vz * dt;
        sim.pushPerson(c);
        c.y = sim.city.surfaceAt(c.x, c.z);
        A.speed = 0;
        c.speed = 0;
        c.grab = 0;
        if (c.timer <= 0) sim.peds.recover(c);
        continue;
      }
      let tx;
      let tz;
      let sp = 0;
      const back = this.wanted === 0 || pl.mode !== "foot";
      if (back) {
        // walk back to the cruiser and get in
        if (!c.car || c.car.wrecked || !sim.vehicles.includes(c.car)) {
          this.foot.splice(k, 1);
          continue;
        }
        tx = c.car.x;
        tz = c.car.z;
        sp = 3.2;
        if (dist(c.x, c.z, tx, tz) < 2.4) {
          c.car.copOut = false;
          this.foot.splice(k, 1);
          continue;
        }
      } else {
        tx = pl.x;
        tz = pl.z;
        sp = 5.9;
      }
      const dx = tx - c.x;
      const dz = tz - c.z;
      const d = Math.hypot(dx, dz);
      if (!back && d < 1.3) {
        sp = 0;
        c.grab = (c.grab || 0) + dt;
        A.interact = 0.5;
        if (c.grab > 1.0) {
          c.grab = 0;
          sim.busted();
          return;
        }
      } else c.grab = Math.max(0, (c.grab || 0) - dt);
      if (sp > 0 && d > 0.1) {
        c.x += (dx / d) * sp * dt;
        c.z += (dz / d) * sp * dt;
        c.h = headingOf(dx, dz);
        sim.pushPerson(c);
      }
      c.y = sim.city.surfaceAt(c.x, c.z);
      A.speed = sp;
      c.speed = sp;
    }
  }
  clear() {
    for (const u of this.units) this.sim.removeVehicle(u);
    this.units = [];
    this.foot = [];
    this.wanted = 0;
    this.heat = 0;
    this.evadeT = 0;
    this.bustT = 0;
  }
}
