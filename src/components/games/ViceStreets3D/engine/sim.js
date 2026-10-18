/**
 * Vice Streets 3D — the simulation (framework-free, fixed step, Node-testable).
 *
 * Owns the world state and steps every system in order:
 *   clock → player (on foot / entering / driving / exiting) → AI controllers
 *   (traffic, police, mission cars) → vehicle physics → car↔car and
 *   car↔person contacts (damage, knock-downs, crimes) → pedestrians →
 *   mission/activity run → bookkeeping (wanted triggers, landmarks, wasted).
 *
 * The host (React component or test) passes an input frame each step and
 * reads `events` afterwards for audio/UI. `prog` is the live save object:
 * the sim mutates money/xp/rep/discoveries through progress.js helpers and
 * sets `dirty` so the host knows to persist it.
 */
import { getCity, zoneAt, CURB, lightState, LANE_OFF, BREAKABLE } from "./city.js";
import { Collision } from "./collide.js";
import { makeVehicle, stepVehicle, collideVehicles, crashDamage, bodyCircles, setUpgrades } from "./vehicle.js";
import { Traffic } from "./traffic.js";
import { Peds, makePerson } from "./peds.js";
import { Police } from "./police.js";
import { Run } from "./missions.js";
import { buildActivity } from "./activities.js";
import { addMoney, addXp, carById, levelOf } from "./progress.js";
import { VEHICLE, pickVehicle } from "../data/vehicles.js";
import { CAST, playerLook, randomLook } from "../data/people.js";
import { rng, clamp, dist, headingOf, dampA, damp, wrapA } from "./util.js";
import { MOVES, CHAIN, chooseMove, startMove, stepMove } from "./combat.js";

export const STEP = 1 / 60;
/** where a story mission begins: { x, z, h, car } (lane-offset for grid-node starts) */
export function missionSpawn(city, def) {
  const s = def.start;
  const at = typeof s.at === "string" ? city.places[s.at] : Array.isArray(s.at) && s.at[0] === "n" ? city.gridNode(s.at[1], s.at[2]) : { x: s.at[0], z: s.at[1] };
  const h = s.h ?? at.h ?? 0;
  let x = at.x;
  let z = at.z;
  if (s.lane) {
    x += -Math.cos(h) * LANE_OFF;
    z += Math.sin(h) * LANE_OFF;
  }
  return { x, z, h, car: s.car };
}
export const PLAYER = { r: 0.32, walk: 2.9, sprint: 6.9, jump: 5.1, gravity: 15, maxHp: 100 };
/**
 * Jumping out of a moving car (E above `min` m/s): the player leaves through
 * the driver's door with the car's momentum plus a push outward, tumbles
 * through the air, lands and rolls (angle grows with distance / `rollR`),
 * slows with `friction`, then rolls up onto their feet — or, from a fast
 * bail, ends up lying on their back for a moment and sits up. The car keeps
 * rolling and coasts to a stop.
 */
export const BAIL = { min: 3, out: 2.6, up: 1.9, keep: 0.85, friction: 6.5, rollR: 0.55, ghost: 0.9, lie: 16 };
/** landing damage for a bail at horizontal speed sp (m/s) */
export function bailDamage(sp) {
  if (sp < 4) return 0;
  if (sp < 10) return (sp - 4) * 2.2;
  if (sp < 20) return 13.2 + (sp - 10) * 3;
  return Math.min(85, 43.2 + (sp - 20) * 2.2);
}
const CALM = new Set(["walk", "idle", "sit", "wait", "cross", "return", "talk"]);
export const CLOCK_RATE = 24 / (18 * 60); // game hours per real second (a day lasts 18 min)
const SEAT = { side: 0.36, fwd: -0.15, up: 0.28 };

export class Sim {
  constructor(opts = {}) {
    this.city = getCity();
    this.col = new Collision(this.city);
    this.rand = rng(opts.seed || 12345);
    this.prog = opts.prog;
    this.mode = opts.mode || "free";
    this.t = 0;
    this.clock = opts.clock ?? this.prog.clock ?? 9;
    this.vehicles = [];
    this.npcs = [];
    this.events = [];
    this.stats = { jumps: 0, scrapes: 0, crashes: 0, driven: 0 };
    this.dialog = null;
    this.prompt = null;
    this.run = null;
    this.offers = [];
    this.freezeCar = false;
    this.dirty = false;
    this.ending = null;
    this.timeScale = 1;
    this.crimeCool = {};
    this.restrictedIn = false;
    this.redSeen = new Map();
    this.broken = new Map(); // knocked-down street furniture → time
    this.pickups = []; // cash dropped by defeated pedestrians
    this.pickupId = 1;
    for (const d of ["docks", "hills"]) this.col.setGates(d, !this.districtOpen(d));
    const pl = (this.player = {
      x: 0,
      z: 0,
      y: 0,
      vy: 0,
      vx: 0,
      vz: 0,
      h: 0,
      speed: 0,
      grounded: true,
      mode: "foot",
      car: null,
      hp: PLAYER.maxHp,
      sprint: false,
      look: playerLook(this.prog.outfit),
      outfit: this.prog.outfit,
      trans: null,
      cool: 0,
      downT: 0,
      anim: { speed: 0, air: false, sit: false, down: 0, interact: 0, celebrate: 0, hurt: 0, enter: 0, land: 0 },
    });
    this.traffic = new Traffic(this);
    this.peds = new Peds(this);
    this.police = new Police(this);
    this.parked = { slots: this.city.parking.map((p, i) => ({ ...p, i, v: null })), t: 0 };
    // spawn
    const sp = opts.spawn || { x: 281, z: -85, h: -Math.PI / 2, foot: true };
    pl.x = sp.x;
    pl.z = sp.z;
    pl.h = sp.h || 0;
    pl.y = this.city.surfaceAt(pl.x, pl.z);
    if (opts.ambient) {
      this.ambient = true;
      pl.hidden = true;
    }
    this.spawnServices();
    this.fillParked(true);
    if (!this.ambient) {
      let own = this.prog.garage.active ? this.spawnOwned(sp.car === "own" ? { x: sp.x, z: sp.z, h: sp.h } : null) : null;
      if (!own && sp.car === "own") {
        // no car of your own yet: a loaner for the mission
        own = makeVehicle("compact", sp.x, sp.z, sp.h || 0, { role: "parked", paint: "#9aa3ad" });
        own.y = this.city.surfaceAt(sp.x, sp.z);
        this.addVehicle(own);
      }
      if (own && sp.car === "own") this.putInCar(own);
    }
  }

  /* ================================================================ basics */
  emit(e) {
    this.events.push(e);
  }
  focus() {
    const pl = this.player;
    if (pl.mode === "car" && pl.car) return { x: pl.car.x, z: pl.car.z, y: pl.car.y + 1.2 };
    return { x: pl.x, z: pl.z, y: pl.y + 1 };
  }
  districtOpen(d) {
    return this.prog.districts.includes(d);
  }
  unlockDistrict(d) {
    if (!this.prog.districts.includes(d)) {
      this.prog.districts.push(d);
      this.dirty = true;
      this.emit({ type: "district", district: d });
    }
    this.col.setGates(d, false);
  }
  edgeBlocked(e) {
    return !!e.gate && !this.districtOpen(e.gate);
  }
  isNight() {
    return this.clock < 6.4 || this.clock > 19.3;
  }
  addVehicle(v) {
    if (!this.vehicles.includes(v)) this.vehicles.push(v);
  }
  removeVehicle(v) {
    if (v === this.player.car) return;
    const k = this.vehicles.indexOf(v);
    if (k >= 0) this.vehicles.splice(k, 1);
    v.removed = true;
    for (const s of this.parked.slots) if (s.v === v) s.v = null;
  }
  addNpc(n) {
    this.npcs.push(n);
  }
  removeNpc(n) {
    const k = this.npcs.indexOf(n);
    if (k >= 0) this.npcs.splice(k, 1);
  }
  /** place id | ["n", i, j] | [x, z] | {x, z} → {x, z, h} */
  resolve(ref) {
    if (!ref) return null;
    if (typeof ref === "string") {
      const p = this.city.places[ref];
      if (!p) throw new Error(`unknown place ${ref}`);
      return p;
    }
    if (Array.isArray(ref)) {
      if (ref[0] === "n") return this.city.gridNode(ref[1], ref[2]);
      return { x: ref[0], z: ref[1], h: 0 };
    }
    return ref;
  }

  /* ================================================================ owned + parked cars */
  ownedRecord(v) {
    return v && v.garageId ? carById(this.prog, v.garageId) : null;
  }
  /** spawn the active garage car next to the player (or at `at`) */
  spawnOwned(at) {
    const rec = carById(this.prog, this.prog.garage.active);
    if (!rec) return null;
    for (const v of [...this.vehicles]) if (v.garageId === rec.gid) this.removeVehicle(v);
    let spot = at;
    if (!spot) spot = this.freeKerbNear(this.player.x, this.player.z, 8, 70);
    if (!spot) spot = { ...this.city.places.garageSpawn };
    const v = makeVehicle(rec.type, spot.x, spot.z, spot.h || 0, { owner: "player", garageId: rec.gid, paint: rec.paint || VEHICLE[rec.type].paint, upgrades: rec.up, role: "owned" });
    v.hp = rec.hp * v.st.hp;
    if (v.hp <= 0) v.hp = v.st.hp * 0.2;
    v.y = this.city.surfaceAt(v.x, v.z);
    // clear anything parked right there
    for (const o of [...this.vehicles]) if (o.role === "parked" && dist(o.x, o.z, v.x, v.z) < 6) this.removeVehicle(o);
    this.addVehicle(v);
    return v;
  }
  /** a free kerb spot (lane shoulder) near a point */
  freeKerbNear(x, z, dmin, dmax) {
    const c = this.city;
    let best = null;
    for (const s of this.parked.slots) {
      if (s.lot !== "street") continue;
      const d = dist(s.x, s.z, x, z);
      if (d < dmin || d > dmax) continue;
      if (!this.districtOpen(s.district || c.districtAt(s.x, s.z))) continue;
      if (this.vehicles.some((v) => dist(v.x, v.z, s.x, s.z) < 6 && v !== s.v)) continue;
      if (!best || d < best.d) best = { x: s.x, z: s.z, h: s.h, d, slot: s };
    }
    if (best && best.slot.v) {
      this.removeVehicle(best.slot.v);
      best.slot.v = null;
    }
    return best;
  }
  syncOwned() {
    for (const v of this.vehicles) {
      const rec = this.ownedRecord(v);
      if (rec) rec.hp = clamp(v.hp / v.st.hp, 0, 1);
    }
  }
  /** a garage change (repair / paint / upgrade) applies to the car in the world */
  refreshOwned() {
    for (const v of this.vehicles) {
      const rec = this.ownedRecord(v);
      if (!rec) continue;
      setUpgrades(v, rec.up);
      v.hp = rec.hp * v.st.hp;
      v.paint = rec.paint || VEHICLE[rec.type].paint;
      v.wrecked = v.hp <= 0;
    }
  }
  fillParked(initial = false) {
    const P = this.focus();
    for (const s of this.parked.slots) {
      const d = dist(s.x, s.z, P.x, P.z);
      if (s.v && (s.v.removed || s.v.driver || s.v.role !== "parked" || dist(s.v.x, s.v.z, s.x, s.z) > 3)) s.v = null;
      if (s.v && d > 190) {
        this.removeVehicle(s.v);
        s.v = null;
        continue;
      }
      if (s.v || s.reserved || s.owned || d > 150 || (!initial && d < 70)) continue;
      if (!this.districtOpen(s.district || this.city.districtAt(s.x, s.z))) continue;
      if (this.rand() < (s.lot === "street" ? 0.45 : 0.3) && !s.kind && !s.display && !s.police) continue;
      if (this.vehicles.some((v) => dist(v.x, v.z, s.x, s.z) < 5.5)) continue;
      let type = s.kind || (s.police ? "police" : pickVehicle(this.rand, s.district || this.city.districtAt(s.x, s.z)));
      if (s.display) type = ["supercar", "gt", "spyder", "sports", "retro", "muscle", "luxsuv", "track"][(s.i * 7) % 8];
      const v = makeVehicle(type, s.x, s.z, s.h, { role: "parked", locked: s.display || (!s.kind && !s.police && this.rand() < 0.35) });
      if (type === "taxi" || type === "police") v.paint = VEHICLE[type].paint;
      else v.paint = this.rand.pick(["#e9e4da", "#2b2f36", "#9aa3ad", "#b8202a", "#2f55d4", "#5ec8e5", "#f3f1ea", "#1f8a5b", "#ff7b29", "#ff6fa8", "#c6ccd4", "#ffe14d"]);
      v.y = this.city.surfaceAt(v.x, v.z);
      v.slot = s;
      s.v = v;
      this.addVehicle(v);
    }
  }

  /* ================================================================ services & NPCs */
  spawnServices() {
    this.services = [];
    const svc = (id, cast, place, kind, label) => {
      const p = this.city.places[place];
      const n = makePerson("npc", p.x, p.z, CAST[cast].look, { name: CAST[cast].name, service: id });
      n.y = this.city.surfaceAt(n.x, n.z);
      n.h = p.h || 0;
      n.mode = "idle";
      n.anim.talk = 0;
      this.services.push({ id, kind, npc: n, place: p, label });
      this.addNpc(n);
    };
    if (this.ambient) return;
    svc("garage", "ramon", "garage", "garage", "Garage");
    svc("cafe", "rosa", "cafe", "cafe", "Café");
    svc("clothes", "clerk", "clothes", "clothes", "Clothes");
    svc("dealer", "sales", "dealer", "dealer", "Dealership");
  }
  /** a mission NPC replaces the service NPC of the same character while it runs */
  hideServiceFor(castKey, hide) {
    const map = { ramon: "garage", rosa: "cafe" };
    const s = this.services?.find((q) => q.id === map[castKey]);
    if (s) s.npc.hidden = hide;
  }

  /* ================================================================ runs */
  startMission(def) {
    this.endRun();
    this.run = new Run(this, def);
    this.mode = "mission";
    if (def.allowRestricted) this.allowRestricted = true;
    for (const st of def.stages) if (st.type === "talk" && st.npc) this.hideServiceFor(st.npc, true);
    this.run.start();
    return this.run;
  }
  startActivity(id) {
    this.endRun();
    const def = buildActivity(this, id);
    this.run = new Run(this, def);
    this.mode = "activity";
    this.run.start();
    return this.run;
  }
  endRun() {
    if (!this.run) return;
    this.run.cleanup();
    for (const s of this.services || []) s.npc.hidden = false;
    this.run = null;
    this.mode = "free";
    this.allowRestricted = false;
    this.freezeCar = false;
  }

  /* ================================================================ dialog */
  startDialog(lines, onDone) {
    this.dialog = { lines, i: 0, onDone };
    this.emit({ type: "dialog" });
  }
  advanceDialog() {
    const d = this.dialog;
    if (!d) return;
    d.i++;
    if (d.i >= d.lines.length) {
      this.dialog = null;
      d.onDone && d.onDone();
      this.emit({ type: "dialogEnd" });
    }
  }

  /* ================================================================ queries */
  /** free distance to the nearest thing ahead of a car (cars, people, the player) */
  gapAhead(v, range, ignore, ignoreRole = null) {
    const fx = Math.sin(v.h);
    const fz = Math.cos(v.h);
    const half = v.st.len / 2;
    let best = Infinity;
    let cur = null;
    this.blocker = null;
    const test = (x, z, len, wid) => {
      const dx = x - v.x;
      const dz = z - v.z;
      const a = dx * fx + dz * fz;
      if (a <= 0 || a > range + half + len) return;
      const l = Math.abs(dx * -fz + dz * fx);
      if (l > v.st.wid / 2 + wid / 2 + 0.2) return;
      const g = a - half - len / 2;
      if (g < best) {
        best = g;
        this.blocker = cur;
      }
    };
    for (const o of this.vehicles) {
      if (o === v || o === ignore || (ignoreRole && o.role === ignoreRole)) continue;
      if (Math.abs(o.x - v.x) > range + 6 || Math.abs(o.z - v.z) > range + 6) continue;
      // cars crossing at right angles count with their width
      const along = Math.abs(Math.sin(o.h) * fx + Math.cos(o.h) * fz);
      cur = o;
      test(o.x, o.z, along > 0.5 ? o.st.len : o.st.wid, along > 0.5 ? o.st.wid : o.st.len);
    }
    cur = null;
    for (const p of this.peds.list) if (p.mode !== "sit" && !(p.dead && p.deadT > 4) && Math.abs(p.x - v.x) < range && Math.abs(p.z - v.z) < range) test(p.x, p.z, 0.6, 0.8);
    for (const p of this.npcs) if (!p.inCar && !p.hidden) test(p.x, p.z, 0.6, 0.8);
    for (const p of this.police.foot) test(p.x, p.z, 0.6, 0.8);
    if (this.player.mode !== "car" && !this.player.hidden) test(this.player.x, this.player.z, 0.6, 0.8);
    return best;
  }
  /** push a person out of buildings and parked/slow cars */
  pushPerson(p, r = 0.3) {
    this.col.pushCircle(p, r, p.y ?? 0, 1.7, 0.45);
    for (const v of this.vehicles) {
      if (Math.abs(v.x - p.x) > 4 || Math.abs(v.z - p.z) > 4) continue;
      for (const c of bodyCircles(v, this._pc || (this._pc = []))) {
        const dx = p.x - c.x;
        const dz = p.z - c.z;
        const rr = c.r + r;
        const d2 = dx * dx + dz * dz;
        if (d2 < rr * rr) {
          const d = Math.sqrt(d2) || 1e-3;
          p.x += (dx / d) * (rr - d);
          p.z += (dz / d) * (rr - d);
        }
      }
    }
  }
  /** the vehicle a player on foot would get into now */
  enterCandidate() {
    const pl = this.player;
    let best = null;
    for (const v of this.vehicles) {
      if (Math.abs(v.x - pl.x) > 6 || Math.abs(v.z - pl.z) > 6) continue;
      const door = this.doorPoint(v, 1);
      const d = Math.min(dist(pl.x, pl.z, door.x, door.z), dist(pl.x, pl.z, v.x, v.z) - v.st.wid * 0.3);
      if (d < 2.9 && (!best || d < best.d)) best = { v, d };
    }
    return best ? best.v : null;
  }
  nearestEnterable() {
    const P = this.focus();
    let best = null;
    for (const v of this.vehicles) {
      if (v.wrecked || v.locked || v.driver || v.chaseTarget) continue;
      const d = dist(v.x, v.z, P.x, P.z);
      if (d < 80 && (!best || d < best.d)) best = { v, d };
    }
    return best ? best.v : null;
  }
  /** door (side = 1 driver/left, -1 passenger/right) standing point */
  doorPoint(v, side = 1) {
    const lx = Math.cos(v.h) * side;
    const lz = -Math.sin(v.h) * side;
    const o = v.st.wid / 2 + 0.55;
    return { x: v.x + lx * o + Math.sin(v.h) * 0.25, z: v.z + lz * o + Math.cos(v.h) * 0.25 };
  }
  seatPoint(v) {
    const lx = Math.cos(v.h);
    const lz = -Math.sin(v.h);
    return { x: v.x + lx * SEAT.side + Math.sin(v.h) * SEAT.fwd, z: v.z + lz * SEAT.side + Math.cos(v.h) * SEAT.fwd, y: v.y + SEAT.up };
  }

  /* ================================================================ step */
  /**
   * Remember every moving thing's transform before a physics step. The renderer
   * draws between this and the stepped state (alpha = leftover time / STEP), so
   * motion is smooth at any frame rate instead of freezing / double-stepping.
   */
  snapshot() {
    for (const v of this.vehicles) {
      const p = v._prev || (v._prev = {});
      p.x = v.x;
      p.y = v.y;
      p.z = v.z;
      p.h = v.h;
      p.wheelRot = v.wheelRot;
      p.bounce = v.bounce;
      p.pitch = v.pitch;
      p.roll = v.roll;
      p.steer = v.wheelSteer;
      p.slope = v.slope || 0;
    }
    const keep = (o) => {
      const p = o._prev || (o._prev = {});
      p.x = o.x;
      p.y = o.y;
      p.z = o.z;
      p.h = o.h;
    };
    keep(this.player);
    this.player._prev.a = this.player.bail ? this.player.bail.a : 0;
    for (const o of this.peds.list) keep(o);
    for (const o of this.npcs) keep(o);
    for (const o of this.police.foot) keep(o);
  }
  step(dt, input = {}) {
    this.snapshot();
    this.events.length = 0;
    dt *= this.timeScale;
    this.t += dt;
    this.clock = (this.clock + dt * CLOCK_RATE) % 24;
    const pl = this.player;
    if (this.ending) return this.stepEnding(dt);
    // dialog freezes the player
    const frozen = !!this.dialog;
    if (frozen && (input.interact || input.jump)) this.advanceDialog();
    pl.cool = Math.max(0, pl.cool - dt);
    const inp = frozen ? {} : input;
    // interaction (E) and context (F)
    if (!frozen && input.interact && pl.cool <= 0) this.onInteract();
    if (!frozen && input.action && pl.cool <= 0) this.onAction();
    this.updatePrompt();
    switch (pl.mode) {
      case "foot":
        this.stepFoot(dt, inp);
        break;
      case "enter":
      case "exit":
        this.stepTransition(dt);
        break;
      case "car":
        this.stepDriving(dt, inp);
        break;
      case "bail":
        this.stepBail(dt);
        break;
      case "down":
        pl.downT -= dt;
        pl.anim.down = 1;
        pl.atk = null;
        pl.anim.punch = null;
        pl.vx *= Math.exp(-5 * dt);
        pl.vz *= Math.exp(-5 * dt);
        pl.x += pl.vx * dt;
        pl.z += pl.vz * dt;
        this.col.pushCircle(pl, PLAYER.r, pl.y, 1.75, 0.45);
        pl.y = Math.max(this.city.surfaceAt(pl.x, pl.z), this.col.supportAt(pl.x, pl.z, PLAYER.r, pl.y));
        if (pl.downT <= 0) {
          pl.anim.down = 0;
          pl.mode = "foot";
        }
        break;
      default:
    }
    pl.anim.interact = Math.max(0, pl.anim.interact - dt);
    pl.anim.hurt = Math.max(0, pl.anim.hurt - dt);
    pl.anim.stagger = Math.max(0, (pl.anim.stagger || 0) - dt);
    pl.anim.celebrate = Math.max(0, pl.anim.celebrate - dt);
    pl.anim.land = Math.max(0, pl.anim.land - dt);
    // AI
    if (!this.ambient || true) this.traffic.step(dt);
    if (!this.ambient) this.police.step(dt);
    this.stepPickups(dt);
    // physics for every car near the action
    const F = this.focus();
    for (const v of this.vehicles) {
      if (v.driver === "ai" && !v.wander && !v.ai) {
        v.input.throttle = 0;
        v.input.brake = 1;
      }
      if (!v.driver) {
        v.input.throttle = 0;
        v.input.steer = 0;
        if (v.coast) {
          // bailed out of: rolls on with its momentum, slowing gently
          v.input.brake = 0.06;
          v.input.handbrake = false;
          if (Math.hypot(v.vx, v.vz) < 0.4) v.coast = false;
        } else {
          v.input.brake = 0.6;
          v.input.handbrake = true;
        }
      }
      if (v.fixed) {
        v.vx = 0;
        v.vz = 0;
        continue;
      }
      const d = dist(v.x, v.z, F.x, F.z);
      // far cars sleep, except the ones a run depends on (racers, rivals, targets, pursuers)
      if (d > 280 && v.driver !== "player" && !(v.role === "racer" || v.role === "rival" || v.role === "mission" || (v.role === "police" && this.police.wanted > 0))) continue;
      const moving = Math.abs(v.vx) + Math.abs(v.vz) > 0.02 || v.input.throttle !== 0 || v.driver;
      if (!moving) continue;
      const hit = stepVehicle(v, dt, this);
      if (hit && hit.impact > 1.5) this.onStaticHit(v, hit);
    }
    this.contacts(dt);
    if (this.run) this.stepRunVehicles(dt);
    this.peds.step(dt);
    if (this.run) {
      this.run.step(dt);
    }
    this.parked.t -= dt;
    if (this.parked.t <= 0) {
      this.parked.t = 1.5;
      this.fillParked();
      this.restoreProps();
    }
    this.bookkeeping(dt);
  }

  /* ---------------------------------------------------------------- on foot */
  stepFoot(dt, inp) {
    const pl = this.player;
    const mx = inp.mx || 0;
    const mz = inp.mz || 0;
    const m = Math.min(1, Math.hypot(mx, mz));
    this.stepMelee(dt, inp);
    pl.sprint = !!inp.sprint && m > 0.1 && !pl.atk;
    // feet stay planted through a strike; a hit rocks you back for a moment
    const target = pl.atk ? 0 : m * (pl.hitStun > 0 ? 0.3 : pl.sprint ? PLAYER.sprint : PLAYER.walk);
    const k = pl.grounded ? 12 : 2.5;
    const tx = m > 0.01 ? (mx / Math.hypot(mx, mz)) * target : 0;
    const tz = m > 0.01 ? (mz / Math.hypot(mx, mz)) * target : 0;
    pl.vx = damp(pl.vx, tx, k, dt);
    pl.vz = damp(pl.vz, tz, k, dt);
    const sp = Math.hypot(pl.vx, pl.vz);
    if (m > 0.05 && sp > 0.2 && !pl.atk) pl.h = dampA(pl.h, headingOf(pl.vx, pl.vz), 11, dt);
    if (inp.jump && pl.grounded) {
      pl.vy = PLAYER.jump;
      pl.grounded = false;
      this.stats.jumps++;
      this.emit({ type: "jump" });
    }
    pl.vy -= PLAYER.gravity * dt;
    const ox = pl.x;
    const oz = pl.z;
    pl.x += pl.vx * dt;
    pl.z += pl.vz * dt;
    pl.y += pl.vy * dt;
    this.col.pushCircle(pl, PLAYER.r, pl.y, 1.75, 0.45);
    this.pushPerson(pl, PLAYER.r);
    // people are solid too: step round story characters, shopkeepers and passers-by
    for (const list of [this.npcs, this.peds.list, this.police.foot]) {
      for (const p of list) {
        if (p.hidden || p.inCar || p.mode === "down" || p.dead) continue;
        const dx = pl.x - p.x;
        const dz = pl.z - p.z;
        const d2 = dx * dx + dz * dz;
        const rr = PLAYER.r + 0.3;
        if (d2 < rr * rr && d2 > 1e-6) {
          const d = Math.sqrt(d2);
          pl.x += (dx / d) * (rr - d);
          pl.z += (dz / d) * (rr - d);
        }
      }
    }
    // keep the measured velocity honest after being pushed (no sliding through walls)
    if (dt > 0) {
      const ax = (pl.x - ox) / dt;
      const az = (pl.z - oz) / dt;
      if (Math.hypot(ax, az) < sp * 0.5) {
        pl.vx = ax;
        pl.vz = az;
      }
    }
    const g = Math.max(this.city.surfaceAt(pl.x, pl.z), this.col.supportAt(pl.x, pl.z, PLAYER.r, pl.y));
    if (pl.y <= g + (pl.grounded ? 0.18 : 0)) {
      if (!pl.grounded && pl.vy < -2) {
        pl.anim.land = 0.25;
        this.emit({ type: "land", impact: -pl.vy });
      }
      pl.y = g;
      pl.vy = 0;
      pl.grounded = true;
    } else pl.grounded = false;
    pl.speed = Math.hypot(pl.vx, pl.vz);
    pl.anim.speed = pl.speed;
    pl.anim.air = !pl.grounded;
    pl.anim.sit = false;
    if (pl.grounded && pl.speed > 0.5) {
      this.stepAcc = (this.stepAcc || 0) + pl.speed * dt;
      const stride = pl.sprint ? 1.5 : 0.75;
      if (this.stepAcc > stride) {
        this.stepAcc = 0;
        this.emit({ type: "step", run: pl.sprint });
      }
    }
  }

  /* ---------------------------------------------------------------- melee */
  /**
   * LMB light (jab → cross → hook → hook), RMB heavy (straight / uppercut /
   * heavy hook by combo), Q kick (front / side, finishing kick after two
   * punches), Shift+LMB a power straight. Moves and hitboxes: engine/combat.js.
   */
  stepMelee(dt, inp) {
    const pl = this.player;
    pl.atkCool = Math.max(0, (pl.atkCool || 0) - dt);
    pl.hitStun = Math.max(0, (pl.hitStun || 0) - dt);
    // a press during a swing is remembered briefly so combos chain naturally
    const want = inp.kick ? "kick" : inp.heavy ? "heavy" : inp.punch ? (inp.sprint ? "power" : "light") : null;
    if (want) pl.atkBuf = { want, t: this.t };
    if (pl.atkBuf && this.t - pl.atkBuf.t > 0.4) pl.atkBuf = null;
    if (!pl.atk && pl.grounded && pl.atkCool <= 0 && pl.hitStun <= 0 && pl.atkBuf && !this.dialog) {
      if (this.t - (pl.chainT ?? -9) > CHAIN) pl.chain = [];
      const id = chooseMove(pl.chain || [], pl.atkBuf.want);
      pl.atkBuf = null;
      // soft lock-on: turn to the nearest person in front within reach
      const tg = this.lockTarget(2.6, 1.35);
      if (tg) pl.h = headingOf(tg.x - pl.x, tg.z - pl.z);
      pl.lock = tg;
      startMove(this, pl, id, true);
      (pl.chain || (pl.chain = [])).push(id);
      if (pl.chain.length > 6) pl.chain.shift();
    }
    if (pl.atk) {
      const id = pl.atk.id;
      // keep facing a locked target through the wind-up
      const L = pl.lock;
      if (L && !L.dead && pl.atk.t < MOVES[id].hitAt) pl.h = dampA(pl.h, headingOf(L.x - pl.x, L.z - pl.z), 14, dt);
      if (stepMove(this, pl, dt, true)) {
        pl.chainT = this.t;
        pl.atkCool = MOVES[id].cool;
      }
    } else pl.anim.punch = null;
  }
  /** nearest person within range and ±cone of the player's facing (and in sight) */
  lockTarget(range, cone) {
    const pl = this.player;
    let best = null;
    let bd = 1e9;
    const consider = (p) => {
      if (p.dead || p.hidden || p.inCar) return;
      const dx = p.x - pl.x;
      const dz = p.z - pl.z;
      const d = Math.hypot(dx, dz);
      if (d > range || d < 1e-3 || Math.abs((p.y || 0) - pl.y) > 1) return;
      if (Math.abs(wrapA(headingOf(dx, dz) - pl.h)) > cone) return;
      if (this.col.segBlocked(pl.x, pl.z, pl.y + 1.25, p.x, p.z, (p.y || 0) + 1.25)) return;
      // prefer people fighting the player
      const score = d - (p.mode === "fight" ? 0.8 : 0);
      if (score < bd) {
        bd = score;
        best = p;
      }
    };
    for (const p of this.peds.list) consider(p);
    for (const p of this.police.foot) consider(p);
    return best;
  }

  /* ---------------------------------------------------------------- enter / exit */
  onInteract() {
    const pl = this.player;
    if (this.ambient) return;
    // the mission stage gets first say (talk, pick up, hand over …)
    if (this.run && this.run.interact()) {
      pl.cool = 0.4;
      return;
    }
    if (pl.mode === "foot") {
      // cash on the ground
      const pk = this.nearPickup();
      if (pk) {
        pl.cool = 0.3;
        this.collectCash(pk);
        return;
      }
      // service NPCs (shops, garage) — E talks to them
      const s = this.nearService();
      if (s) {
        pl.cool = 0.4;
        s.npc.h = headingOf(pl.x - s.npc.x, pl.z - s.npc.z);
        this.emit({ type: "service", id: s.id });
        return;
      }
      const v = this.enterCandidate();
      if (v) {
        this.tryEnter(v);
        return;
      }
      // chat with a pedestrian
      const p = this.peds.list.find((q) => CALM.has(q.mode) && dist(q.x, q.z, pl.x, pl.z) < 2.2);
      if (p) {
        pl.cool = 0.5;
        this.emit({ type: "say", who: "Pedestrian", text: this.peds.talkTo(p), id: p.id });
      }
    } else if (pl.mode === "car") {
      pl.cool = 0.3;
      if (Math.hypot(pl.car.vx, pl.car.vz) > BAIL.min) this.bailOut();
      else this.tryExit();
    }
  }
  onAction() {
    const pl = this.player;
    if (this.ambient) return;
    const o = this.nearOffer();
    if (o) {
      pl.cool = 0.4;
      this.emit({ type: "offer", offer: o });
      return;
    }
    if (pl.mode === "car" && this.inGarageBay()) {
      pl.cool = 0.4;
      this.emit({ type: "service", id: "garage" });
      return;
    }
    if (pl.mode === "car" && pl.car) {
      pl.car.lightsManual = !pl.car.lightsManual;
      pl.cool = 0.25;
    }
  }
  nearService() {
    const pl = this.player;
    if (!this.services) return null;
    return this.services.find((s) => !s.npc.hidden && dist(s.npc.x, s.npc.z, pl.x, pl.z) < 2.6) || null;
  }
  nearOffer() {
    if (this.run) return null;
    const F = this.focus();
    const r = this.player.mode === "car" ? 9 : 3.5;
    return this.offers.find((o) => dist(o.x, o.z, F.x, F.z) < r) || null;
  }
  inGarageBay() {
    const pl = this.player;
    if (!pl.car) return false;
    const zn = zoneAt(this.city, pl.car.x, pl.car.z, "hideout");
    return !!zn && Math.hypot(pl.car.vx, pl.car.vz) < 2;
  }
  tryEnter(v) {
    const pl = this.player;
    pl.cool = 0.5;
    if (v.wrecked) return this.emit({ type: "toast", text: "This car is wrecked", kind: "warn" });
    if (v.chaseTarget && !v.stalled) return this.emit({ type: "toast", text: "It's still moving!", kind: "warn" });
    if (v.locked) {
      this.emit({ type: "locked", x: v.x, z: v.z });
      return this.emit({ type: "toast", text: "Locked", kind: "warn" });
    }
    if (v.role === "police" && v.driver === "ai" && !v.copOut) return this.emit({ type: "toast", text: "There's an officer inside", kind: "warn" });
    if ((v.role === "racer" || v.role === "rival") && v.driver === "ai") return this.emit({ type: "toast", text: "Occupied", kind: "warn" });
    if (v.driver === "ai" && v.role === "mission" && !v.stalled) return this.emit({ type: "toast", text: "Occupied", kind: "warn" });
    if (v.driver === "ai" && Math.hypot(v.vx, v.vz) > 4) return this.emit({ type: "toast", text: "Too fast to get in", kind: "warn" });
    // carjack: the driver gets out and runs
    if (v.driver === "ai" && v.role === "traffic") {
      const door = this.doorPoint(v, 1);
      const p = makePerson("ped", door.x + Math.cos(v.h) * 0.6, door.z - Math.sin(v.h) * 0.6, randomLook(this.rand));
      p.walk = this.city.walks[0];
      this.peds.scare(p, pl.x, pl.z, 6);
      this.peds.list.push(p);
      this.police.report("carjack", v.x, v.z);
      this.emit({ type: "carjack" });
    }
    if (v.role === "police" && v.owner !== "player" && !(this.run && v.missionKey)) {
      this.police.report("stealPolice", v.x, v.z);
      for (const c of this.police.foot) if (c.car === v) c.car = null;
    }
    v.driver = "player-pending";
    const door = this.doorPoint(v, 1);
    pl.mode = "enter";
    pl.trans = { v, t: 0, phase: "walk", door, from: { x: pl.x, z: pl.z } };
    pl.vx = pl.vz = 0;
    this.emit({ type: "enterStart", v });
  }
  putInCar(v) {
    const pl = this.player;
    pl.mode = "car";
    pl.car = v;
    pl.trans = null;
    v.driver = "player";
    v.locked = false;
    if (v.stalled && v.hp <= 0) v.hp = v.st.hp * 0.25;
    v.stalled = false;
    if (v.role === "traffic" || v.role === "parked") v.role = "player";
    v.wander = null;
    if (v.slot) {
      v.slot.v = null;
      v.slot = null;
    }
    const s = this.seatPoint(v);
    pl.x = s.x;
    pl.z = s.z;
    pl.y = s.y;
    pl.h = v.h;
    pl.anim.sit = true;
    pl.anim.speed = 0;
    pl.wantExit = false;
    this.emit({ type: "entered", v });
  }
  tryExit() {
    const pl = this.player;
    const v = pl.car;
    // driver side first, then passenger side, behind, in front
    const fx = Math.sin(v.h);
    const fz = Math.cos(v.h);
    const lx = Math.cos(v.h);
    const lz = -Math.sin(v.h);
    const o = v.st.wid / 2 + 0.6;
    const cands = [
      { x: v.x + lx * o, z: v.z + lz * o },
      { x: v.x - lx * o, z: v.z - lz * o },
      { x: v.x - fx * (v.st.len / 2 + 0.7), z: v.z - fz * (v.st.len / 2 + 0.7) },
      { x: v.x + fx * (v.st.len / 2 + 0.7), z: v.z + fz * (v.st.len / 2 + 0.7) },
    ];
    for (const c of cands) {
      const y = this.city.surfaceAt(c.x, c.z);
      const p = { x: c.x, z: c.z };
      this.col.pushCircle(p, PLAYER.r + 0.05, y, 1.7, 0.45);
      if (Math.hypot(p.x - c.x, p.z - c.z) > 0.05) continue;
      if (this.vehicles.some((o2) => o2 !== v && bodyCircles(o2, []).some((q) => dist(q.x, q.z, c.x, c.z) < q.r + PLAYER.r + 0.1))) continue;
      pl.mode = "exit";
      pl.trans = { v, t: 0, spot: { x: c.x, z: c.z, y }, seat: this.seatPoint(v) };
      v.driver = null;
      v.input.throttle = 0;
      v.input.brake = 1;
      pl.wantExit = false;
      pl.cool = 0.6;
      this.emit({ type: "exitStart", v });
      return true;
    }
    this.emit({ type: "toast", text: "No room to get out here", kind: "warn" });
    return false;
  }
  stepTransition(dt) {
    const pl = this.player;
    const T = pl.trans;
    const v = T.v;
    T.t += dt;
    pl.anim.speed = 0;
    if (pl.mode === "enter") {
      if (v.removed || v.wrecked) {
        pl.mode = "foot";
        pl.trans = null;
        v.driver = null;
        return;
      }
      if (T.phase === "walk") {
        T.door = this.doorPoint(v, 1);
        const dx = T.door.x - pl.x;
        const dz = T.door.z - pl.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.25 || T.t > 1.4) {
          T.phase = "in";
          T.t = 0;
          T.from = { x: pl.x, z: pl.z, y: pl.y, h: pl.h };
          this.emit({ type: "door", x: v.x, z: v.z });
        } else {
          const sp = Math.min(3.4, d / dt);
          pl.x += (dx / d) * sp * dt;
          pl.z += (dz / d) * sp * dt;
          pl.h = dampA(pl.h, headingOf(dx, dz), 12, dt);
          pl.anim.speed = 3;
          pl.y = this.city.surfaceAt(pl.x, pl.z);
          this.col.pushCircle(pl, PLAYER.r, pl.y, 1.7, 0.45);
        }
      } else {
        // turn to face along the car and slide into the seat
        const k = clamp(T.t / 0.6, 0, 1);
        const s = this.seatPoint(v);
        pl.x = T.from.x + (s.x - T.from.x) * k;
        pl.z = T.from.z + (s.z - T.from.z) * k;
        pl.y = T.from.y + (s.y - T.from.y) * k;
        pl.h = T.from.h + wrapA(v.h - T.from.h) * Math.min(1, k * 1.6);
        pl.anim.enter = k;
        pl.anim.sit = k > 0.45;
        if (k >= 1) this.putInCar(v);
      }
    } else {
      const k = clamp(T.t / 0.55, 0, 1);
      pl.x = T.seat.x + (T.spot.x - T.seat.x) * k;
      pl.z = T.seat.z + (T.spot.z - T.seat.z) * k;
      pl.y = T.seat.y + (T.spot.y - T.seat.y) * k;
      pl.anim.sit = k < 0.5;
      pl.anim.enter = 1 - k;
      if (k >= 1) {
        pl.mode = "foot";
        pl.car = null;
        pl.trans = null;
        pl.grounded = true;
        pl.vy = 0;
        pl.vx = pl.vz = 0;
        pl.h = headingOf(T.spot.x - v.x, T.spot.z - v.z);
        if (v.role === "player") {
          v.role = "parked";
          v.abandoned = true;
        }
        this.emit({ type: "exited", v });
      }
    }
  }

  /* ---------------------------------------------------------------- bail out */
  /** jump out of the moving car through the driver's door (passenger side if that is blocked) */
  bailOut() {
    const pl = this.player;
    const v = pl.car;
    const sp = Math.hypot(v.vx, v.vz);
    const fx = Math.sin(v.h);
    const fz = Math.cos(v.h);
    const lx = Math.cos(v.h); // driver side (left)
    const lz = -Math.sin(v.h);
    const o = v.st.wid / 2 + 0.42;
    const free = (side) => {
      const x = v.x + lx * o * side;
      const z = v.z + lz * o * side;
      const q = { x, z };
      this.col.pushCircle(q, PLAYER.r, v.y, 1.2, 0.45);
      return Math.hypot(q.x - x, q.z - z) < 0.05 && !this.col.segBlocked(v.x, v.z, v.y + 0.8, x + lx * side * 0.8, z + lz * side * 0.8, v.y + 0.8);
    };
    const side = free(1) ? 1 : free(-1) ? -1 : 1;
    const seat = this.seatPoint(v);
    pl.mode = "bail";
    pl.car = null;
    pl.trans = null;
    pl.atk = null;
    pl.anim.punch = null;
    pl.wantExit = false;
    pl.x = seat.x;
    pl.z = seat.z;
    pl.y = seat.y;
    pl.h = v.h;
    // the car's momentum, a shove away from the door and a little hop
    pl.vx = v.vx * BAIL.keep + lx * side * BAIL.out;
    pl.vz = v.vz * BAIL.keep + lz * side * BAIL.out;
    pl.vy = BAIL.up + Math.min(1.2, sp * 0.03);
    pl.grounded = false;
    pl.bail = { phase: "out", t: 0, t0: this.t, a: 0, v0: sp, car: v, side, out: { x: v.x + lx * o * side - fx * 0.1, z: v.z + lz * o * side - fz * 0.1 }, dmg: 0, wallT: -9 };
    pl.cool = 0.8;
    v.driver = null;
    v.coast = true;
    v.input.throttle = 0;
    v.input.brake = 0;
    v.input.handbrake = false;
    if (v.role === "player") {
      v.role = "parked";
      v.abandoned = true;
    }
    this.emit({ type: "bail", v, speed: sp, x: pl.x, z: pl.z });
    this.emit({ type: "exited", v, bail: true });
  }
  /** keep the tumbling body out of walls and cars (but not the car it just left) */
  bailCollide(B) {
    const pl = this.player;
    const ox = pl.x;
    const oz = pl.z;
    this.col.pushCircle(pl, PLAYER.r, pl.y, 0.9, 0.3);
    for (const v of this.vehicles) {
      if (v === B.car && this.t - B.t0 < BAIL.ghost) continue;
      if (Math.abs(v.x - pl.x) > 4 || Math.abs(v.z - pl.z) > 4 || pl.y > v.y + v.st.hgt) continue;
      for (const c of bodyCircles(v, this._pc || (this._pc = []))) {
        const dx = pl.x - c.x;
        const dz = pl.z - c.z;
        const rr = c.r + PLAYER.r;
        const d2 = dx * dx + dz * dz;
        if (d2 < rr * rr) {
          const d = Math.sqrt(d2) || 1e-3;
          pl.x += (dx / d) * (rr - d);
          pl.z += (dz / d) * (rr - d);
        }
      }
    }
    // pushed back: lose the velocity going into the obstacle (a little bounce)
    const px = pl.x - ox;
    const pz = pl.z - oz;
    const pd = Math.hypot(px, pz);
    if (pd > 1e-4) {
      const nx = px / pd;
      const nz = pz / pd;
      const vn = pl.vx * nx + pl.vz * nz;
      if (vn < 0) {
        pl.vx -= nx * vn * 1.25;
        pl.vz -= nz * vn * 1.25;
        if (-vn > 6 && this.t - B.wallT > 0.5) {
          B.wallT = this.t;
          this.hurtPlayer((-vn - 6) * 2, "bail");
          this.emit({ type: "bailHit", x: pl.x, z: pl.z, impact: -vn });
        }
      }
    }
  }
  stepBail(dt) {
    const pl = this.player;
    const B = pl.bail;
    const A = pl.anim;
    B.t += dt;
    A.speed = 0;
    A.sit = false;
    if (B.phase === "out") {
      // out of the seat and through the door (0.16 s), carried along by the car
      const k = Math.min(1, B.t / 0.16);
      const c = B.car;
      const sx = this.seatPoint(c);
      const lx = Math.cos(c.h) * B.side;
      const lz = -Math.sin(c.h) * B.side;
      const o = (c.st.wid / 2 + 0.42 - 0.36) * k;
      pl.x = sx.x + lx * o;
      pl.z = sx.z + lz * o;
      pl.y = sx.y + 0.15 * k;
      if (k >= 1) {
        B.phase = "air";
        B.t = 0;
      }
      return;
    }
    const sp0 = Math.hypot(pl.vx, pl.vz);
    const n = Math.max(1, Math.ceil((sp0 * dt) / 0.2));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      const g = Math.max(this.city.surfaceAt(pl.x, pl.z), this.col.supportAt(pl.x, pl.z, PLAYER.r, pl.y));
      if (B.phase === "air") {
        pl.vy -= PLAYER.gravity * h;
        pl.x += pl.vx * h;
        pl.z += pl.vz * h;
        pl.y += pl.vy * h;
        B.a = Math.min(1.1, B.a + 1.6 * h);
        this.bailCollide(B);
        const g2 = Math.max(this.city.surfaceAt(pl.x, pl.z), this.col.supportAt(pl.x, pl.z, PLAYER.r, pl.y));
        if (pl.y <= g2) {
          pl.y = g2;
          const sp = Math.hypot(pl.vx, pl.vz);
          // landing: the harder the bail, the more it hurts (once)
          B.dmg = bailDamage(sp);
          if (B.dmg > 0) this.hurtPlayer(B.dmg, "bail");
          this.emit({ type: "bailLand", x: pl.x, z: pl.z, speed: sp, dmg: B.dmg });
          pl.vy = 0;
          B.t = 0;
          B.phase = sp < 3.5 ? "stumble" : "roll";
          B.lie = B.v0 >= BAIL.lie;
          // a body tumbles a couple of times at most, then slides
          B.rollEnd = (Math.floor(B.a / (Math.PI * 2)) + (B.lie ? Math.min(3, 1 + Math.floor(sp / 10)) : 4)) * Math.PI * 2;
        }
        continue;
      }
      // on the ground: rolling / sliding friction
      const sp = Math.hypot(pl.vx, pl.vz);
      const fr = B.phase === "stumble" ? 9 : B.phase === "lie" || B.phase === "slide" ? 9 : BAIL.friction;
      const ns = Math.max(0, sp - fr * h);
      if (sp > 1e-4) {
        pl.vx *= ns / sp;
        pl.vz *= ns / sp;
      }
      pl.x += pl.vx * h;
      pl.z += pl.vz * h;
      pl.y = g;
      this.bailCollide(B);
      pl.y = Math.max(this.city.surfaceAt(pl.x, pl.z), this.col.supportAt(pl.x, pl.z, PLAYER.r, pl.y));
      const TAU = Math.PI * 2;
      if (B.phase === "roll") {
        B.a += (Math.max(ns, 2.5) / BAIL.rollR) * h;
        if (ns >= 2.2 && B.a >= B.rollEnd - Math.PI / 2) {
          // out of tumbles but still fast: flat on the back, sliding to a stop
          B.a = B.rollEnd - Math.PI / 2;
          B.lie = true;
          B.phase = "slide";
        } else if (ns < 2.2) {
          // finish the roll: onto the feet, or (fast bail) onto the back
          const base = Math.floor(B.a / TAU) * TAU;
          B.target = B.lie ? (B.a - base < 1.5 * Math.PI ? base + 1.5 * Math.PI : base + 3.5 * Math.PI) : base + TAU;
          B.phase = "settle";
        }
      } else if (B.phase === "settle") {
        B.a = Math.min(B.target, B.a + Math.max(4.5, ns / BAIL.rollR) * h);
        if (B.a >= B.target - 1e-6) {
          B.t = 0;
          B.phase = B.lie ? "lie" : "up";
        }
      } else if (B.phase === "slide") {
        if (ns < 0.6) {
          B.phase = "lie";
          B.t = 0;
        }
      } else if (B.phase === "lie") {
        if (B.t > 0.9) {
          B.phase = "rise";
          B.t = 0;
          B.from = B.a;
        }
      } else if (B.phase === "rise") {
        // sit up and stand (the last quarter turn)
        B.a = B.from + (Math.PI / 2) * Math.min(1, B.t / 0.9);
        if (B.t >= 0.9) {
          B.phase = "up";
          B.t = 0;
        }
      }
    }
    A.air = B.phase === "air";
    if ((B.phase === "up" && B.t >= 0.3) || (B.phase === "stumble" && B.t >= 0.45 && Math.hypot(pl.vx, pl.vz) < 0.5)) {
      pl.mode = "foot";
      pl.bail = null;
      pl.grounded = true;
      pl.vx = pl.vz = pl.vy = 0;
      A.air = false;
      A.stagger = B.phase === "stumble" ? 0.3 : 0;
      this.emit({ type: "bailDone" });
    }
  }

  /* ---------------------------------------------------------------- driving */
  stepDriving(dt, inp) {
    const pl = this.player;
    const v = pl.car;
    if (!v || v.removed) {
      pl.mode = "foot";
      pl.car = null;
      return;
    }
    const I = v.input;
    const fwd = inp.throttle > 0 ? inp.throttle : 0;
    const back = inp.throttle < 0 ? -inp.throttle : 0;
    I.steer = clamp(inp.steer || 0, -1, 1);
    I.handbrake = !!inp.handbrake;
    if (back > 0 && v.vf > 0.8) {
      I.throttle = 0;
      I.brake = back;
    } else if (back > 0) {
      I.throttle = -back;
      I.brake = 0;
    } else {
      I.throttle = fwd;
      I.brake = 0;
    }
    if (pl.wantExit) {
      I.throttle = 0;
      I.brake = 1;
      if (Math.hypot(v.vx, v.vz) < 1.5) this.tryExit();
    }
    if (this.freezeCar) {
      I.throttle = 0;
      I.brake = 1;
    }
    if (inp.horn) {
      v.horn = 0.3;
      if (!this.hornT || this.t - this.hornT > 0.35) {
        this.hornT = this.t;
        this.emit({ type: "horn" });
        // people in front step aside
        for (const p of this.peds.list) {
          const dx = p.x - v.x;
          const dz = p.z - v.z;
          if (dx * dx + dz * dz < 14 * 14 && dx * Math.sin(v.h) + dz * Math.cos(v.h) > 0 && p.mode !== "down" && p.mode !== "stagger" && p.mode !== "fight") this.peds.scare(p, v.x, v.z, 2);
        }
      }
    } else v.horn = Math.max(0, v.horn - dt);
    v.lights = this.isNight() !== !!v.lightsManual;
    // the driver sits in the seat
    const s = this.seatPoint(v);
    pl.x = s.x;
    pl.z = s.z;
    pl.y = s.y;
    pl.h = v.h;
    pl.anim.sit = true;
    pl.anim.speed = 0;
    pl.anim.steer = v.steer;
    this.stats.driven += Math.hypot(v.vx, v.vz) * dt;
  }

  /* ---------------------------------------------------------------- run-owned AI cars */
  stepRunVehicles() {
    // follow/chase/race/rival cars are driven inside their stage handlers;
    // mission cars without a current job just hold still
    for (const v of Object.values(this.run.vehicles)) {
      if (v.driver === "ai" && !v.ai && !v.wander) {
        v.input.throttle = 0;
        v.input.brake = 1;
      }
    }
  }

  /* ---------------------------------------------------------------- damage + crimes */
  damageVehicle(v, dmg, src = "") {
    if (dmg <= 0 || v.wrecked) return;
    v.hp -= dmg;
    if (v.hp > 0) return;
    if (v.chaseTarget) {
      v.hp = 0;
      v.stalled = true;
      return;
    }
    v.hp = 0;
    v.wrecked = true;
    v.siren = false;
    this.emit({ type: "wrecked", x: v.x, z: v.z, v, src });
    this.peds.alarm(v.x, v.z, 28, 1);
    const pl = this.player;
    if (pl.car === v && pl.mode === "car") {
      this.hurtPlayer(25, "wreck");
      if (pl.hp > 0) {
        if (!this.tryExit()) {
          // nowhere to step out: climb out over the bonnet
          pl.mode = "foot";
          pl.car = null;
          v.driver = null;
          pl.x = v.x + Math.sin(v.h) * (v.st.len / 2 + 1);
          pl.z = v.z + Math.cos(v.h) * (v.st.len / 2 + 1);
          this.col.pushCircle(pl, PLAYER.r, pl.y, 1.7, 0.45);
        }
      }
    }
  }
  hurtPlayer(n, why = "") {
    const pl = this.player;
    if (n <= 0 || pl.hp <= 0 || this.ending) return;
    pl.hp = Math.max(0, pl.hp - n);
    pl.anim.hurt = 0.4;
    this.emit({ type: "hurt", n, why });
    if (pl.hp <= 0) this.wasted();
  }
  onStaticHit(v, hit) {
    const dmg = crashDamage(v, hit.impact);
    this.damageVehicle(v, dmg, "wall");
    if (v.driver === "player") {
      if (hit.impact > 2.5) this.stats.scrapes++;
      if (hit.impact > 4) this.stats.crashes++;
      if (hit.impact > 14) this.hurtPlayer((hit.impact - 14) * 0.9, "crash");
      this.emit({ type: "crash", impact: hit.impact, x: hit.x, z: hit.z, player: true });
      if (hit.impact > 9) this.peds.alarm(hit.x, hit.z, 18, 0.6);
    } else if (hit.impact > 5) this.emit({ type: "crash", impact: hit.impact, x: hit.x, z: hit.z });
  }
  contacts(dt) {
    const V = this.vehicles;
    const pl = this.player;
    const pc = pl.mode === "car" ? pl.car : null;
    for (let i = 0; i < V.length; i++) {
      const a = V[i];
      for (let j = i + 1; j < V.length; j++) {
        const b = V[j];
        if (Math.abs(a.x - b.x) > 7 || Math.abs(a.z - b.z) > 7) continue;
        const c = collideVehicles(a, b);
        if (!c || c.impact < 1) continue;
        const pair = a.hitCool > 0 && b.hitCool > 0;
        a.hitCool = 0.25;
        b.hitCool = 0.25;
        if (pair && c.impact < 4) continue;
        // cruisers shove rather than total you: police contacts hurt the other car less
        const ka = b.role === "police" && a !== b ? 0.55 : 1;
        const kb = a.role === "police" ? 0.55 : 1;
        this.damageVehicle(a, crashDamage(a, c.impact) * ka, "car");
        this.damageVehicle(b, crashDamage(b, c.impact) * kb, "car");
        const mine = a === pc || b === pc;
        const other = a === pc ? b : a;
        this.emit({ type: "crash", impact: c.impact, x: c.x, z: c.z, player: mine });
        if (mine) {
          if (c.impact > 2.5) this.stats.scrapes++;
          if (c.impact > 16) this.hurtPlayer((c.impact - 16) * 0.8, "crash");
          // who hit whom: the car closing in along the contact normal is at fault
          const me = a === pc ? a : b;
          const nx = (other.x - me.x) / (Math.hypot(other.x - me.x, other.z - me.z) || 1);
          const nz = (other.z - me.z) / (Math.hypot(other.x - me.x, other.z - me.z) || 1);
          const mine2 = me.vx * nx + me.vz * nz;
          const theirs = -(other.vx * nx + other.vz * nz);
          const myFault = mine2 > 2 && mine2 >= theirs * 0.8;
          if (other.role === "police" && c.impact > 2.5 && myFault && this.crimeOk("ramPolice", 2)) this.police.report("ramPolice", other.x, other.z, c.impact);
          else if ((other.role === "traffic" || other.role === "parked") && c.impact > 5 && myFault && this.crimeOk("reckless", 1.5)) this.police.report("reckless", other.x, other.z);
          if (other.role === "traffic") other.panic = 6;
          if (c.impact > 8) this.peds.alarm(c.x, c.z, 20, 0.7);
        }
      }
    }
    // cars vs people: real contact, outcome from the closing speed along the
    // contact normal; one hit per car per person per second; nobody passes through
    const people = [];
    for (const p of this.peds.list) people.push(p);
    for (const p of this.npcs) if (!p.inCar && !p.hidden) people.push(p);
    for (const p of this.police.foot) people.push(p);
    const circ = this._pc || (this._pc = []);
    for (const v of V) {
      const sp = Math.hypot(v.vx, v.vz);
      for (const p of people) {
        if (Math.abs(p.x - v.x) > 4 || Math.abs(p.z - v.z) > 4) continue;
        for (const c of bodyCircles(v, circ)) {
          const d = dist(c.x, c.z, p.x, p.z);
          if (d > c.r + 0.32) continue;
          const nx = (p.x - c.x) / (d || 1);
          const nz = (p.z - c.z) / (d || 1);
          const closing = v.vx * nx + v.vz * nz;
          const key = v.id;
          // still touching the same car = the same hit; a body being pushed along
          // is only hurt again once it is run over properly (fast) after a gap
          const cool = p.carHit && p.carHit.id === key && this.t - p.carHit.t < 1;
          if (cool) p.carHit.t = this.t;
          // someone already on the ground is only hurt again if driven over fast
          const lying = p.mode === "down" && closing < 9;
          if (closing > 2.2 && sp > 2.2 && !cool && !lying && !p.dead && (p.kind === "ped" || p.kind === "cop")) {
            p.carHit = { id: key, t: this.t };
            this.carHitsPerson(v, p, Math.max(closing, sp * 0.6), v === pc);
          } else if (p.kind === "npc" && sp > 3 && !cool) {
            // story characters just stumble aside
            p.carHit = { id: key, t: this.t };
            p.x += nx * 1.2;
            p.z += nz * 1.2;
          }
          this.pushPerson(p);
          break;
        }
      }
      // the player on foot
      const ghost = pl.mode === "bail" && v === pl.bail.car && this.t - pl.bail.t0 < BAIL.ghost;
      if (pl.mode !== "car" && !pl.hidden && !ghost && Math.abs(pl.x - v.x) < 4 && Math.abs(pl.z - v.z) < 4) {
        for (const c of bodyCircles(v, circ)) {
          if (dist(c.x, c.z, pl.x, pl.z) > c.r + PLAYER.r) continue;
          const cool = pl.carHit && pl.carHit.id === v.id && this.t - pl.carHit.t < 1;
          if (sp > 4.5 && pl.mode === "foot" && !cool) {
            pl.carHit = { id: v.id, t: this.t };
            this.hurtPlayer((sp - 4) * 3.2, "car");
            pl.mode = "down";
            pl.downT = 1.4;
            pl.anim.down = 1;
            pl.atk = null;
            pl.vx = v.vx * 0.5;
            pl.vz = v.vz * 0.5;
            pl.h = headingOf(-v.vx, -v.vz);
            pl.x += (v.vx / sp) * 1.5;
            pl.z += (v.vz / sp) * 1.5;
            this.col.pushCircle(pl, PLAYER.r, pl.y, 1.7, 0.45);
            this.emit({ type: "playerHit", speed: sp });
          }
          this.pushPerson(pl, PLAYER.r);
          break;
        }
      }
    }
    void dt;
  }
  /**
   * A car strikes a pedestrian at `impact` m/s: < 4 a shove and a stumble,
   * 4–10 knocked down, ≥ 10 severe and often fatal; the body is thrown along
   * the car's motion and the car loses a little speed.
   */
  carHitsPerson(v, p, impact, byPlayer) {
    const sp = Math.hypot(v.vx, v.vz) || 1;
    const dmg = impact < 4 ? 3 + impact : impact < 10 ? (impact - 2) * 5.5 : (impact - 3) * 7.5;
    // thrown along the car's path and off to the side they were standing on
    // (a slow bump mostly shoves them aside, out of the way)
    const fx = v.vx / sp;
    const fz = v.vz / sp;
    const side = (p.x - v.x) * fz - (p.z - v.z) * fx >= 0 ? 1 : -1;
    const lat = impact < 4 ? 1.4 : impact < 10 ? 0.7 : 0.35;
    let dx = fx + fz * side * lat;
    let dz = fz - fx * side * lat;
    const L = Math.hypot(dx, dz) || 1;
    dx /= L;
    dz /= L;
    const out = this.peds.damage(p, dmg, { kind: "car", fx: dx, fz: dz, speed: Math.max(impact, sp * 0.8), knock: impact >= 4, by: byPlayer ? "player" : "car" });
    const k = Math.min(0.08, 75 / v.st.mass) * Math.min(1, impact / 10);
    v.vx *= 1 - k;
    v.vz *= 1 - k;
    this.emit({ type: "pedHit", x: p.x, z: p.z, y: p.y, speed: impact, killed: out === "dead", player: byPlayer });
    this.peds.violence(p.x, p.z, impact >= 10 ? 2 : 1, p, byPlayer);
    if (byPlayer) {
      if (p.kind === "cop") this.police.report(out === "dead" ? "copKilled" : "assaultCop", p.x, p.z);
      else this.police.report(out === "dead" ? "murder" : impact >= 4 ? "hitPed" : "reckless", p.x, p.z);
    }
    return out;
  }
  /** lightweight street furniture hit by a car (see city.js BREAKABLE) */
  breakProp(v, s, impact, dx, dz) {
    const p = s.prop;
    const B = BREAKABLE[p.type];
    if (!B || this.broken.has(p)) return false;
    if (impact < B.at) {
      if (impact > 1.2 && (p._wob ?? -9) < this.t - 0.6) {
        p._wob = this.t;
        this.emit({ type: "propWobble", prop: p, k: Math.min(1, impact / B.at), dx, dz, x: p.x, z: p.z, player: v.driver === "player" });
      }
      return false;
    }
    // knocked down: its collider goes with it, the car carries on a bit slower
    this.col.remove(s);
    this.broken.set(p, this.t);
    const loss = B.loss * clamp(1500 / v.st.mass, 0.6, 1.6) * clamp(impact / 12, 0.5, 1.2);
    v.vx *= 1 - loss;
    v.vz *= 1 - loss;
    this.damageVehicle(v, B.dmg * clamp(impact / 10, 0.3, 1.5), "prop");
    this.emit({ type: "propBreak", prop: p, dx, dz, speed: impact, x: p.x, z: p.z, player: v.driver === "player" });
    if (impact > 8) this.peds.alarm(p.x, p.z, 12, 0.5);
    return true;
  }
  /* ---------------------------------------------------------------- cash pickups */
  /**
   * A defeated pedestrian may drop a little cash ($5–35, fictional money):
   * it pops out, lands on the ground beside the body (pushed out of any
   * solid) and waits to be collected with E. Each pickup can be collected
   * once; pickups are not saved, so reloading can't duplicate them.
   */
  dropCash(p) {
    if (this.ambient || this.rand() > 0.7) return null;
    const a = this.rand() * Math.PI * 2;
    const q = { x: p.x + Math.cos(a) * 0.6, z: p.z + Math.sin(a) * 0.6 };
    const y0 = this.city.surfaceAt(q.x, q.z);
    this.col.pushCircle(q, 0.3, y0, 0.5, 0.45);
    const pk = { id: this.pickupId++, x: q.x, z: q.z, y: this.city.surfaceAt(q.x, q.z), from: { x: p.x, z: p.z, y: (p.y || 0) + 1 }, amount: 5 + Math.floor(this.rand() * 31), t: this.t, taken: false };
    this.pickups.push(pk);
    this.emit({ type: "cashDrop", id: pk.id, x: pk.x, z: pk.z, amount: pk.amount });
    return pk;
  }
  nearPickup(r = 1.5) {
    const pl = this.player;
    let best = null;
    let bd = r;
    for (const pk of this.pickups) {
      if (pk.taken || this.t - pk.t < 0.5) continue;
      const d = dist(pk.x, pk.z, pl.x, pl.z);
      if (d < bd && Math.abs(pk.y - pl.y) < 1.2) {
        bd = d;
        best = pk;
      }
    }
    return best;
  }
  collectCash(pk) {
    if (!pk || pk.taken) return false;
    pk.taken = true;
    const k = this.pickups.indexOf(pk);
    if (k >= 0) this.pickups.splice(k, 1);
    addMoney(this.prog, pk.amount);
    this.emit({ type: "cash", amount: pk.amount, x: pk.x, z: pk.z });
    return true;
  }
  stepPickups() {
    if (!this.pickups.length) return;
    const F = this.focus();
    for (let k = this.pickups.length - 1; k >= 0; k--) {
      const pk = this.pickups[k];
      if (this.t - pk.t > 120 || dist(pk.x, pk.z, F.x, F.z) > 220) this.pickups.splice(k, 1);
    }
  }
  /** knocked-down furniture comes back once nobody is looking */
  restoreProps(force = false) {
    const F = this.focus();
    for (const [p, t] of this.broken) {
      if (!force && (this.t - t < 60 || Math.hypot(p.x - F.x, p.z - F.z) < 130)) continue;
      this.col.insert(p.solid);
      this.broken.delete(p);
      this.emit({ type: "propRestore", prop: p });
    }
  }
  crimeOk(kind, cool) {
    if ((this.crimeCool[kind] || -99) > this.t - cool) return false;
    this.crimeCool[kind] = this.t;
    return true;
  }

  /* ---------------------------------------------------------------- bookkeeping */
  bookkeeping(dt) {
    const pl = this.player;
    const F = this.focus();
    if (this.ambient) return;
    // restricted zones
    const rz = zoneAt(this.city, F.x, F.z, "restricted");
    if (rz && !this.restrictedIn && !this.allowRestricted) this.police.report("restricted", F.x, F.z);
    this.restrictedIn = !!rz;
    // reckless driving rules witnessed by police
    const car = pl.mode === "car" ? pl.car : null;
    if (car) {
      const sp = Math.hypot(car.vx, car.vz);
      if (sp > 7 && !this.city.onRoad(car.x, car.z) && this.peds.list.some((p) => dist(p.x, p.z, car.x, car.z) < 10) && this.crimeOk("sidewalk", 2)) this.police.report("sidewalk", car.x, car.z);
      if (sp > 31 && this.crimeOk("speeding", 0.5)) this.police.report("speeding", car.x, car.z);
      // red lights: crossing a stop line (10.3 m from the junction centre) while it is red
      const nd = this.nodeD || (this.nodeD = new Map());
      for (const n of this.city.lightsAt) {
        if (Math.abs(n.x - car.x) > 16 || Math.abs(n.z - car.z) > 16) {
          nd.delete(n.id);
          continue;
        }
        const d = Math.hypot(n.x - car.x, n.z - car.z);
        const prev = nd.get(n.id) ?? 99;
        nd.set(n.id, d);
        if (prev <= 10.3 || d > 10.3) continue;
        const toward = (n.x - car.x) * car.vx + (n.z - car.z) * car.vz > 0;
        const axis = Math.abs(car.vx) > Math.abs(car.vz) ? "ew" : "ns";
        if (toward && sp > 5 && lightState(n, axis, this.t) === "red" && (this.redSeen.get(n.id) || -99) < this.t - 8) {
          this.redSeen.set(n.id, this.t);
          this.police.report("redLight", car.x, car.z);
          this.emit({ type: "redLight" });
        }
      }
    }
    // health regenerates slowly up to 60
    if (pl.hp > 0 && pl.hp < 60) pl.hp = Math.min(60, pl.hp + dt * 0.8);
    // landmarks
    for (const l of this.city.landmarks) {
      if (this.prog.discovered.includes(l.id)) continue;
      if (!this.districtOpen(this.city.districtAt(l.x, l.z))) continue;
      if (dist(F.x, F.z, l.x, l.z) < l.r) {
        this.prog.discovered.push(l.id);
        addMoney(this.prog, 100);
        const lv = addXp(this.prog, 75);
        this.dirty = true;
        this.emit({ type: "landmark", landmark: l, levelUp: lv });
      }
    }
  }

  /* ---------------------------------------------------------------- busted / wasted */
  busted() {
    if (this.ending) return;
    this.ending = { kind: "busted", t: 0 };
    this.prog.stats.busted++;
    const fine = Math.min(this.prog.money, Math.max(100, Math.round(this.prog.money * 0.08)));
    this.ending.penalty = fine;
    this.emit({ type: "busted", penalty: fine });
    if (this.run) this.run.fail("Busted");
  }
  wasted() {
    if (this.ending) return;
    this.ending = { kind: "wasted", t: 0 };
    this.prog.stats.wasted++;
    const fee = Math.min(this.prog.money, Math.max(100, Math.round(this.prog.money * 0.06)));
    this.ending.penalty = fee;
    this.emit({ type: "wasted", penalty: fee });
    if (this.run) this.run.fail("Wasted");
  }
  stepEnding(dt) {
    this.prompt = null;
    const E = this.ending;
    E.t += dt;
    const pl = this.player;
    pl.anim.down = E.kind === "wasted" ? 1 : 0;
    if (E.kind === "busted") pl.anim.surrender = 1;
    for (const v of this.vehicles) if (v.driver !== "player") {
      v.input.throttle = 0;
      v.input.brake = 1;
      stepVehicle(v, dt, this);
    }
    if (pl.car) {
      pl.car.input.throttle = 0;
      pl.car.input.brake = 1;
      stepVehicle(pl.car, dt, this);
    }
    this.peds.step(dt);
  }
  /** after the busted / wasted screen: pay up and wake at the station / hospital */
  respawn() {
    const E = this.ending;
    if (!E) return;
    addMoney(this.prog, -E.penalty);
    this.dirty = true;
    this.police.clear();
    const pl = this.player;
    if (pl.car) {
      const v = pl.car;
      v.driver = null;
      pl.car = null;
      if (v.garageId) {
        // your own car gets towed back to the garage
        const rec = this.ownedRecord(v);
        if (rec) rec.hp = clamp(v.hp / v.st.hp, 0.2, 1);
        this.removeVehicle(v);
      }
    }
    const at = this.city.places[E.kind === "busted" ? "police" : "hospital"];
    pl.mode = "foot";
    pl.x = at.x;
    pl.z = at.z + 1.5;
    pl.y = this.city.surfaceAt(pl.x, pl.z);
    pl.h = at.h || 0;
    pl.hp = E.kind === "wasted" ? PLAYER.maxHp : Math.max(pl.hp, 60);
    pl.vx = pl.vz = pl.vy = 0;
    pl.anim.down = 0;
    pl.anim.surrender = 0;
    this.ending = null;
    this.clock = (this.clock + 6) % 24;
    this.emit({ type: "respawned", where: E.kind === "busted" ? "Downtown Police Station" : "St. Marisol Hospital" });
  }

  /* ---------------------------------------------------------------- prompt */
  updatePrompt() {
    const pl = this.player;
    let p = null;
    if (this.dialog || this.ambient || this.ending) {
      this.prompt = null;
      return;
    }
    // cash right at your feet beats everything else
    const pk0 = pl.mode === "foot" ? this.nearPickup() : null;
    const o = pk0 ? null : this.nearOffer();
    if (pk0) p = { key: "E", text: `Collect $${pk0.amount}` };
    else if (o) p = { key: "F", text: o.label };
    else if (pl.mode === "foot") {
      const st = this.run?.stage;
      const mk = this.run?.marker();
      if (st && mk && ["talk", "interact", "collect"].includes(st.type) && dist(mk.x, mk.z, pl.x, pl.z) < 2.8) p = { key: "E", text: mk.label || "Interact" };
      if (!p) {
        const pk = this.nearPickup();
        if (pk) p = { key: "E", text: `Collect $${pk.amount}` };
      }
      if (!p) {
        const s = this.nearService();
        if (s) p = { key: "E", text: { garage: "Talk to Tío Ramón (garage)", cafe: "Rosa's Café — eat ($15)", clothes: "Browse clothes", dealer: "Browse vehicles" }[s.id] };
      }
      if (!p) {
        const v = this.enterCandidate();
        if (v) p = { key: "E", text: v.locked ? `${VEHICLE[v.type].name} (locked)` : v.wrecked ? "Wrecked" : `Enter ${VEHICLE[v.type].name}`, warn: v.locked || v.wrecked };
      }
      if (!p && this.peds.list.some((q) => CALM.has(q.mode) && dist(q.x, q.z, pl.x, pl.z) < 2.2)) p = { key: "E", text: "Talk" };
    } else if (pl.mode === "car") {
      if (this.inGarageBay()) p = { key: "F", text: "Open garage" };
      else if (Math.hypot(pl.car.vx, pl.car.vz) <= BAIL.min) p = { key: "E", text: "Exit vehicle", soft: true };
    }
    this.prompt = p;
  }
}
export { levelOf };
