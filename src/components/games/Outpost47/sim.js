/**
 * Outpost 47 — the game simulation. No Three.js, no DOM: runs in Node.
 *
 * Owns the player (first-person capsule: gravity, jump, crouch, sprint,
 * circle-vs-box collision with step-up), doors, temperature, flashlight
 * battery, inventory, documents, puzzle judging, chapter/objective progress,
 * interaction raycasting and the save format. The React shell feeds it input
 * and drains `events`; world.js reads it to draw.
 */
import {
  ITEMS, DOCS, DOORS, PUZZLES, CHAPTERS, INTERACT, ENV, ZONE_OUTDOOR, ZONE_DEEP, ZONE_EVENTS, PORTALS,
  SPAWN, DRIFT, UX, terrain, BOUNDS, DOOR_H,
} from "./data.js";
import { buildLayout, doorBox, roomAt } from "./layout.js";

export const LAYOUT = buildLayout();
const R = 0.32; // player radius
const STAND_H = 1.8, CROUCH_H = 1.15, EYE_STAND = 1.65, EYE_CROUCH = 1.0;
const STEP = 0.4, GRAV = 18, JUMP_V = 5.4;
const REACH = 2.7;
const CELL = 4;
const WALK = 3.4, SPRINT = 5.8, CROUCH_SPD = 1.7;

/* ------------------------------------------------------------ static grid */
const GRID = new Map();
const WALL_LIST = [];
for (const c of LAYOUT.colliders) {
  if (c.kind === "wall") WALL_LIST.push(c);
  for (let ix = Math.floor(c.x1 / CELL); ix <= Math.floor(c.x2 / CELL); ix++) {
    for (let iz = Math.floor(c.z1 / CELL); iz <= Math.floor(c.z2 / CELL); iz++) {
      const k = ix * 100003 + iz;
      let a = GRID.get(k);
      if (!a) GRID.set(k, (a = []));
      a.push(c);
    }
  }
}
function near(x, z, rad, out) {
  out.length = 0;
  const seen = near.seen || (near.seen = new Set());
  seen.clear();
  for (let ix = Math.floor((x - rad) / CELL); ix <= Math.floor((x + rad) / CELL); ix++) {
    for (let iz = Math.floor((z - rad) / CELL); iz <= Math.floor((z + rad) / CELL); iz++) {
      const a = GRID.get(ix * 100003 + iz);
      if (!a) continue;
      for (const c of a) {
        if (!seen.has(c)) {
          seen.add(c);
          out.push(c);
        }
      }
    }
  }
  return out;
}
const DOOR_BOXES = Object.fromEntries(Object.values(LAYOUT.doors).map((d) => [d.id, doorBox(d)]));
const DRIFT_BOX = { ...DRIFT, y1: -2, kind: "drift" };

function rayBox(o, d, b, y1 = b.y1, y2 = b.y2) {
  let tmin = 0, tmax = Infinity;
  const lo = [b.x1, y1, b.z1], hi = [b.x2, y2, b.z2];
  for (let a = 0; a < 3; a++) {
    if (Math.abs(d[a]) < 1e-9) {
      if (o[a] < lo[a] || o[a] > hi[a]) return Infinity;
    } else {
      let t1 = (lo[a] - o[a]) / d[a], t2 = (hi[a] - o[a]) / d[a];
      if (t1 > t2) [t1, t2] = [t2, t1];
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return Infinity;
    }
  }
  return tmin;
}
function raySphere(o, d, c, r) {
  const ox = o[0] - c[0], oy = o[1] - c[1], oz = o[2] - c[2];
  const b = ox * d[0] + oy * d[1] + oz * d[2];
  const cc = ox * ox + oy * oy + oz * oz - r * r;
  const disc = b * b - cc;
  if (disc < 0) return Infinity;
  const t = -b - Math.sqrt(disc);
  if (t < 0) return cc < 0 ? 0 : Infinity;
  return t;
}
const val = (v, g) => (typeof v === "function" ? v(g) : v);

/* ================================================================ Game */
export class Game {
  constructor(save) {
    this.reset();
    if (save) this.load(save);
    this.refreshZone(true);
  }

  reset() {
    this.player = { x: SPAWN.x, y: 0, z: SPAWN.z, yaw: SPAWN.yaw, pitch: 0, vx: 0, vz: 0, vy: 0, ground: true, crouch: 0, sprinting: false, moving: 0, bob: 0 };
    this.f = {};
    this.inv = ["flashlight"];
    this.docs = ["pilot"];
    this.solved = {};
    this.doorsOpen = {};
    this.doorAnim = {};
    this.temp = 100;
    this.battery = 100;
    this.flashlight = false;
    this.time = 0;
    this.seed = Math.floor(Math.random() * 1000);
    this.checkpoint = { x: SPAWN.x, y: 0, z: SPAWN.z, yaw: SPAWN.yaw };
    this.events = [];
    this.objDone = {};
    this.chapter = 0;
    this.transition = null;
    this.zone = ZONE_OUTDOOR;
    this.env = ENV.outdoor;
    this.timers = [];
    this.stepDist = 0;
    this.cpTimer = 0;
    this.objTimer = 0;
    this.ambTimer = 25;
    this.hintsUsed = 0;
    this.dirty = true;
    this.started = false;
  }

  /* ---------------------------------------------------------- tiny API used by data.js */
  has(id) {
    return this.inv.includes(id);
  }
  count(id) {
    return this.inv.filter((i) => i === id).length;
  }
  give(id) {
    if (!ITEMS[id]) return;
    if (!ITEMS[id].stack && this.has(id)) return;
    this.inv.push(id);
    this.events.push({ type: "item", id });
    this.dirty = true;
  }
  take(id) {
    const i = this.inv.indexOf(id);
    if (i >= 0) this.inv.splice(i, 1);
    this.dirty = true;
  }
  set(k, v = 1) {
    this.f[k] = v;
    this.dirty = true;
  }
  open(id) {
    if (this.doorsOpen[id]) return;
    this.doorsOpen[id] = true;
    this.f["door_" + id] = 1;
    const d = LAYOUT.doors[id];
    this.events.push({ type: "door", id, heavy: !!d?.heavy, ice: d?.style === "ice" });
    this.dirty = true;
  }
  toast(text, kind = "info") {
    this.events.push({ type: "toast", text, kind });
  }
  say(who, text, ms) {
    this.events.push({ type: "say", who, text, ms });
  }
  sfx(name) {
    this.events.push({ type: "sfx", name });
  }
  addDoc(id) {
    if (!this.docs.includes(id)) {
      this.docs.push(id);
      this.events.push({ type: "doc", id });
      this.dirty = true;
    }
  }
  read(id) {
    this.addDoc(id);
    return { type: "doc", id };
  }
  puzzle(id) {
    return { type: "puzzle", id };
  }
  panel(p) {
    return p;
  }
  later(sec, fn) {
    this.timers.push({ t: sec, fn });
  }
  portal(key) {
    const p = PORTALS[key];
    this.transition = { kind: "portal", key, t: 0, dur: 1.3, label: p.label, done: false };
    this.sfx(key.startsWith("lift") ? "lift" : "wind");
    return null;
  }

  /* ---------------------------------------------------------- story actions */
  installParts() {
    const parts = ["relay", "coil", "fuse"].filter((p) => this.has(p));
    if (!parts.length) {
      const left = ["relay", "coil", "fuse"].filter((p) => !this.f["inst_" + p]).map((p) => ITEMS[p].name);
      this.toast(`The housing is open. Missing: ${left.join(", ")}.`, "warn");
      return;
    }
    for (const p of parts) {
      this.take(p);
      this.set("inst_" + p);
    }
    this.sfx("clunk");
    if (this.f.inst_relay && this.f.inst_coil && this.f.inst_fuse) {
      this.set("repaired");
      this.toast("GEN-1 reassembled. Now route the distribution panel and run the start procedure.", "good");
    } else {
      const left = ["relay", "coil", "fuse"].filter((p) => !this.f["inst_" + p]).map((p) => ITEMS[p].name);
      this.toast(`Installed. Still missing: ${left.join(", ")}.`, "info");
    }
  }
  powerOn() {
    this.set("power");
    this.events.push({ type: "power" });
    this.later(3.2, () => this.say("PA", "Main power restored. Heating: OFFLINE. Sublevel cryogenics: on reserve battery — 31 percent.", 6000));
  }
  heatOn() {
    this.set("heat");
    this.sfx("boiler");
    this.later(2, () => this.say("PA", "Heating loop pressurised. Station temperature rising.", 4200));
  }
  towerOn() {
    this.set("towerPower");
    this.sfx("power");
    this.later(1.5, () => this.say("Radio", "…kssh… Outpost 47, this is Halvorsen Operations. We see your tower. Hold position. A recovery team is being dispatched.", 6500));
  }
  melt() {
    this.set("iceMelt");
    this.sfx("steam");
    this.open("d_icewall");
  }
  dig() {
    this.set("caveOpen");
    this.sfx("dig");
    this.toast("You dig out a rusted steel door set into the rock.", "good");
  }
  lockdownOff() {
    this.set("lockdownOff");
    this.open("d_lab");
    this.later(1.2, () => this.say("PA", "Lockdown lifted. Director authorisation accepted. Experimental systems: OFFLINE.", 5000));
  }
  commsOn() {
    this.set("comms");
    this.later(1.2, () => this.say("Kestrel", "Outpost 47, Station Kestrel. Weak but readable. We hear you. Evacuation control should accept your authorisation now.", 6500));
  }
  launch() {
    this.set("launch");
    this.open("d_hangar");
    this.later(1, () => this.say("PA", "Bay door opening. Clamps released. Vehicle ready.", 4200));
  }
  end(kind) {
    if (this.f.ending) return;
    this.set("ending", kind);
    this.ended = kind;
    this.events.push({ type: "ending", kind });
  }

  /* ---------------------------------------------------------- inventory */
  useItem(id) {
    if (id === "battery" && this.has("battery")) {
      if (this.battery > 97) {
        this.toast("Flashlight is already fully charged.");
        return false;
      }
      this.take("battery");
      this.battery = 100;
      this.sfx("click");
      this.toast("Flashlight recharged.", "good");
      return true;
    }
    this.toast("Look at an object and press E — items are used automatically where they fit.");
    return false;
  }
  toggleFlashlight() {
    this.flashlight = !this.flashlight;
    this.sfx("click");
    return this.flashlight;
  }
  get lightStrength() {
    return !this.flashlight ? 0 : this.battery > 0 ? (this.battery < 12 ? 0.55 + this.battery / 26 : 1) : 0.28;
  }

  /* ---------------------------------------------------------- puzzles */
  puzzleView(id) {
    const p = PUZZLES[id];
    const extra = {};
    if (p.type === "challenge") extra.challenge = p.words[this.seed % p.words.length][0];
    if (p.type === "gears") extra.owned = ["gear_s", "gear_m", "gear_l"].filter((g) => this.has(g));
    return { id, ...p, ...extra, solved: !!this.solved[id] };
  }
  solve(id, answer) {
    const p = PUZZLES[id];
    if (!p || this.solved[id]) return !!p;
    const ok = !!p.check(answer, this, p);
    if (ok) {
      this.solved[id] = true;
      this.dirty = true;
      this.sfx("success");
      p.onSolve?.(this);
      this.events.push({ type: "solved", id });
    } else {
      this.sfx("fail");
    }
    return ok;
  }
  hint() {
    const ch = CHAPTERS[Math.min(this.chapter, CHAPTERS.length - 1)];
    const o = ch.objectives.find((x) => !x.done(this));
    this.hintsUsed++;
    return o ? o.hint : "Everything here is done.";
  }

  /* ---------------------------------------------------------- objectives */
  objectiveView() {
    const idx = Math.min(this.chapter, CHAPTERS.length - 1);
    const ch = CHAPTERS[idx];
    const list = ch.objectives.map((o) => ({ id: o.id, text: val(o.text, this), done: !!o.done(this) }));
    const cur = list.find((o) => !o.done);
    return { n: ch.n, title: ch.title, list, current: cur ? cur.text : null };
  }
  checkObjectives() {
    for (let i = 0; i < CHAPTERS.length; i++) {
      const ch = CHAPTERS[i];
      for (const o of ch.objectives) {
        const k = ch.n + ":" + o.id;
        if (!this.objDone[k] && o.done(this)) {
          this.objDone[k] = 1;
          this.dirty = true;
          if (i === this.chapter) this.events.push({ type: "objective", text: val(o.text, this) });
        }
      }
    }
    while (this.chapter < CHAPTERS.length && CHAPTERS[this.chapter].objectives.every((o) => o.done(this))) {
      const done = CHAPTERS[this.chapter];
      this.chapter++;
      this.dirty = true;
      if (this.chapter < CHAPTERS.length) {
        this.events.push({ type: "chapter", n: CHAPTERS[this.chapter].n, title: CHAPTERS[this.chapter].title, intro: CHAPTERS[this.chapter].intro, prev: done.title });
        this.checkpointHere();
      }
    }
  }

  /* ---------------------------------------------------------- world queries */
  doorOpen(id) {
    return !!this.doorsOpen[id];
  }
  solidDoors(out) {
    for (const id in DOOR_BOXES) {
      if (!this.doorsOpen[id] || (this.doorAnim[id] ?? 0) < 0.8) out.push(DOOR_BOXES[id]);
    }
    if (!this.f.caveOpen) out.push(DRIFT_BOX);
    return out;
  }
  colliders(x, z, rad) {
    const out = near(x, z, rad, this._near || (this._near = []));
    const res = this._res || (this._res = []);
    res.length = 0;
    for (const c of out) res.push(c);
    return this.solidDoors(res);
  }
  floorAt(x, z) {
    return x > UX - 100 ? 0 : terrain(x, z) * (roomAt(x, z) ? 0 : 1);
  }
  groundAt(x, z, feet) {
    let g = this.floorAt(x, z);
    for (const c of this.colliders(x, z, R + 0.1)) {
      if (c.y2 > feet + STEP || c.y2 <= g) continue;
      if (x + R * 0.7 > c.x1 && x - R * 0.7 < c.x2 && z + R * 0.7 > c.z1 && z - R * 0.7 < c.z2) g = c.y2;
    }
    return g;
  }
  /** Would a standing player at (x, z, feet y) overlap anything? */
  blocked(x, z, y = this.floorAt(x, z), h = STAND_H) {
    for (const c of this.colliders(x, z, R + 0.2)) {
      if (c.y2 <= y + STEP || c.y1 >= y + h) continue;
      const cx = Math.max(c.x1, Math.min(x, c.x2)), cz = Math.max(c.z1, Math.min(z, c.z2));
      if ((cx - x) ** 2 + (cz - z) ** 2 < R * R - 1e-6) return true;
    }
    return false;
  }
  resolve(p, h) {
    for (let it = 0; it < 3; it++) {
      let moved = false;
      for (const c of this.colliders(p.x, p.z, R + 0.2)) {
        if (c.y2 <= p.y + STEP || c.y1 >= p.y + h) continue;
        const cx = Math.max(c.x1, Math.min(p.x, c.x2)), cz = Math.max(c.z1, Math.min(p.z, c.z2));
        let dx = p.x - cx, dz = p.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= R * R) continue;
        if (d2 < 1e-10) {
          // centre inside the box: push out along the shallowest axis
          const pen = [p.x - c.x1, c.x2 - p.x, p.z - c.z1, c.z2 - p.z];
          const m = Math.min(...pen);
          if (m === pen[0]) p.x = c.x1 - R;
          else if (m === pen[1]) p.x = c.x2 + R;
          else if (m === pen[2]) p.z = c.z1 - R;
          else p.z = c.z2 + R;
        } else {
          const d = Math.sqrt(d2);
          dx /= d;
          dz /= d;
          p.x = cx + dx * R;
          p.z = cz + dz * R;
          const vn = p.vx * dx + p.vz * dz;
          if (vn < 0) {
            p.vx -= vn * dx;
            p.vz -= vn * dz;
          }
        }
        moved = true;
      }
      if (!moved) break;
    }
  }
  eye() {
    const p = this.player;
    return [p.x, p.y + EYE_STAND + (EYE_CROUCH - EYE_STAND) * p.crouch, p.z];
  }
  viewDir() {
    const p = this.player;
    const cp = Math.cos(p.pitch);
    return [-Math.sin(p.yaw) * cp, Math.sin(p.pitch), -Math.cos(p.yaw) * cp];
  }

  /* ---------------------------------------------------------- interaction */
  visible(it) {
    if (it.pickup && this.f["took_" + it.id]) return false;
    if (it.ok && it.ok(this) === false) return false;
    return true;
  }
  /** Raycast from the eye: nearest interactable or closed door, unless a wall is in front. */
  target(o = this.eye(), d = this.viewDir()) {
    let best = null, bt = REACH;
    for (const it of INTERACT) {
      const dx = it.pos[0] - o[0], dz = it.pos[2] - o[2];
      if (dx * dx + dz * dz > 16) continue;
      if (!this.visible(it)) continue;
      const t = raySphere(o, d, it.pos, it.r);
      if (t < bt) {
        bt = t;
        best = { kind: "it", it };
      }
    }
    for (const id in DOOR_BOXES) {
      if (this.doorsOpen[id]) continue;
      const b = DOOR_BOXES[id];
      if (Math.abs(b.x1 - o[0]) > 6 || Math.abs(b.z1 - o[2]) > 6) continue;
      const t = rayBox(o, d, b);
      if (t < bt) {
        bt = t;
        best = { kind: "door", id };
      }
    }
    if (!best) return null;
    // occlusion by walls
    for (const c of near(o[0], o[2], REACH + 0.5, this._occ || (this._occ = []))) {
      if (c.kind !== "wall") continue;
      if (rayBox(o, d, c) < bt - 0.02) return null;
    }
    best.t = bt;
    best.key = best.kind === "it" ? best.it.id : best.id;
    return best;
  }
  describe(tg) {
    if (!tg) return null;
    if (tg.kind === "door") return this.describeDoor(tg.id);
    const it = tg.it;
    const label = val(it.label, this);
    let ok = it.ok ? it.ok(this) : true;
    let verb = it.verb !== undefined ? val(it.verb, this) : it.pickup ? "Take" : it.doc ? "Read" : it.puzzle ? "Use" : "Interact";
    if (it.puzzle && this.solved[it.puzzle] && !it.on) {
      ok = typeof ok === "string" ? ok : "Done";
    }
    if (verb === null && ok === true) ok = "Done";
    const sub = it.sub ? val(it.sub, this) : "";
    return { verb: ok === true ? verb : null, text: label, sub: ok === true ? sub : ok, ok: ok === true };
  }
  describeDoor(id) {
    const d = LAYOUT.doors[id];
    const p = this.player;
    if (d.insideX !== undefined && p.x > d.insideX) return { verb: null, text: d.name, sub: "Locked from the inside", ok: false };
    if (d.power && !this.f.power) return { verb: null, text: d.name, sub: "No power to the lock", ok: false };
    if (d.lock === "card") {
      return this.has(d.item) ? { verb: "Swipe", text: d.name, sub: ITEMS[d.item].name, ok: true } : { verb: null, text: d.name, sub: d.deny, ok: false };
    }
    if (d.lock === "puzzle") {
      if (d.puzzle === "p_gears") {
        const n = ["gear_s", "gear_m", "gear_l"].filter((g) => this.has(g)).length;
        if (n < 3) return { verb: null, text: d.name, sub: `Override gear train empty — gears found ${n}/3`, ok: false };
        return { verb: "Fit gears", text: d.name, sub: "", ok: true };
      }
      return { verb: "Enter code", text: d.name, sub: "Keypad", ok: true };
    }
    if (d.lock === "flag") return { verb: null, text: d.name, sub: d.deny, ok: false };
    return { verb: "Open", text: d.name, sub: "", ok: true };
  }
  interact(tg = this.target()) {
    if (!tg || this.transition) return null;
    const desc = this.describe(tg);
    if (!desc || !desc.ok) {
      if (desc) this.sfx("deny");
      return null;
    }
    if (tg.kind === "door") {
      const d = LAYOUT.doors[tg.id];
      if (d.lock === "puzzle") return this.puzzle(d.puzzle);
      this.open(tg.id);
      return null;
    }
    const it = tg.it;
    let res = null;
    if (it.pickup) {
      this.set("took_" + it.id);
      this.give(it.pickup);
      this.sfx("pickup");
    } else if (it.doc) {
      res = this.read(it.doc);
    } else if (it.puzzle) {
      res = this.puzzle(it.puzzle);
    }
    if (it.on) res = it.on(this) || res;
    if (it.after) it.after(this);
    this.dirty = true;
    return res;
  }

  /* ---------------------------------------------------------- zones & checkpoints */
  refreshZone(silent = false) {
    const p = this.player;
    const r = roomAt(p.x, p.z);
    const z = r || (p.x > UX - 100 ? ZONE_DEEP : ZONE_OUTDOOR);
    if (z.id !== this.zone.id) {
      this.zone = z;
      if (!silent) this.enterZone(z);
    }
    this.env = ENV[z.env];
  }
  enterZone(z) {
    const first = !this.f["seen_" + z.id];
    if (first) this.set("seen_" + z.id);
    this.events.push({ type: "zone", id: z.id, name: z.name, first });
    if (first && ZONE_EVENTS[z.id]) {
      const e = ZONE_EVENTS[z.id];
      if (e.sfx) this.sfx(e.sfx);
      if (e.say) this.later(0.8, () => this.say(e.say[0], e.say[1]));
    }
    if (z.id === "shed" || z.id === "hut" || z.id === "checkpoint") this.set("sheltered");
  }
  checkpointHere(force = false) {
    const p = this.player;
    if (!force && (this.env.cold > 0 || !p.ground || this.transition)) return;
    if (this.blocked(p.x, p.z, p.y)) return;
    this.checkpoint = { x: p.x, y: p.y, z: p.z, yaw: p.yaw };
  }
  teleport(t) {
    const p = this.player;
    p.x = t.x;
    p.z = t.z;
    p.y = this.floorAt(t.x, t.z);
    p.yaw = t.yaw ?? p.yaw;
    p.pitch = 0;
    p.vx = p.vz = p.vy = 0;
    this.refreshZone();
  }

  /* ---------------------------------------------------------- the step */
  step(dt, input = {}) {
    dt = Math.min(dt, 0.05);
    this.time += dt;
    this.started = true;
    const p = this.player;

    // scheduled story beats
    for (let i = this.timers.length - 1; i >= 0; i--) {
      const tm = this.timers[i];
      tm.t -= dt;
      if (tm.t <= 0) {
        this.timers.splice(i, 1);
        tm.fn();
      }
    }
    // door animation
    for (const id in this.doorsOpen) {
      const a = this.doorAnim[id] ?? 0;
      if (a < 1) this.doorAnim[id] = Math.min(1, a + dt / (LAYOUT.doors[id]?.heavy ? 1.6 : 0.9));
    }

    // transitions (portal fade / collapse) freeze the player
    if (this.transition) {
      const tr = this.transition;
      tr.t += dt;
      if (!tr.done && tr.t >= tr.dur * 0.5) {
        tr.done = true;
        if (tr.kind === "portal") {
          this.teleport(PORTALS[tr.key].to);
          this.checkpointHere(); // never checkpoints into the cold
        } else if (tr.kind === "collapse") {
          this.teleport(this.checkpoint);
          this.temp = 70;
          this.events.push({ type: "respawn" });
        }
      }
      if (tr.t >= tr.dur) this.transition = null;
      p.vx = p.vz = 0;
      return;
    }

    // ---- movement
    const fwd = input.fwd || 0, str = input.strafe || 0;
    const wantCrouch = !!input.crouch;
    let tc = wantCrouch ? 1 : 0;
    if (!wantCrouch && p.crouch > 0.05 && this.blocked(p.x, p.z, p.y + 0.01, STAND_H)) tc = 1; // no standing up into things
    p.crouch += (tc - p.crouch) * Math.min(1, dt * 10);
    const h = STAND_H + (CROUCH_H - STAND_H) * p.crouch;
    let dx = -Math.sin(p.yaw) * fwd + Math.cos(p.yaw) * str;
    let dz = -Math.cos(p.yaw) * fwd - Math.sin(p.yaw) * str;
    const len = Math.hypot(dx, dz);
    if (len > 1) {
      dx /= len;
      dz /= len;
    }
    p.sprinting = !!input.sprint && fwd > 0 && p.crouch < 0.3;
    const spd = p.crouch > 0.5 ? CROUCH_SPD : p.sprinting ? SPRINT : WALK;
    const acc = p.ground ? 14 : 3;
    const k = 1 - Math.exp(-acc * dt);
    p.vx += (dx * spd - p.vx) * k;
    p.vz += (dz * spd - p.vz) * k;
    if (input.jump && p.ground && p.crouch < 0.3) {
      p.vy = JUMP_V;
      p.ground = false;
      this.sfx("jump");
    }
    // horizontal with substeps
    const mv = Math.hypot(p.vx, p.vz) * dt;
    const n = Math.max(1, Math.ceil(mv / 0.15));
    const ox = p.x, oz = p.z;
    for (let i = 0; i < n; i++) {
      p.x += (p.vx * dt) / n;
      p.z += (p.vz * dt) / n;
      this.resolve(p, h);
    }
    // vertical
    p.vy -= GRAV * dt;
    p.y += p.vy * dt;
    const g = this.groundAt(p.x, p.z, p.y);
    if (p.y <= g + (p.ground && p.vy <= 0 ? STEP : 0)) {
      if (!p.ground && p.vy < -6) this.sfx("land");
      p.y = g;
      p.vy = 0;
      p.ground = true;
    } else {
      p.ground = false;
    }
    const moved = Math.hypot(p.x - ox, p.z - oz);
    p.moving = moved / dt;
    if (p.ground) {
      this.stepDist += moved;
      p.bob += moved * (p.sprinting ? 2.1 : 2.6);
      const stride = p.sprinting ? 2.4 : p.crouch > 0.5 ? 1.2 : 1.7;
      if (this.stepDist > stride) {
        this.stepDist = 0;
        this.events.push({ type: "step", surface: this.zone.env === "outdoor" ? "snow" : this.zone.env === "cave" ? "ice" : "metal", sprint: p.sprinting, crouch: p.crouch > 0.5 });
      }
    }

    // ---- zone, survival
    this.refreshZone();
    const env = this.env;
    if (env.cold > 0) this.temp -= env.cold * dt;
    else {
      const warm = env.warmFlag ? (this.f[env.warmFlag] ? env.warm : 0) : env.warm || 0;
      if (warm) this.temp = Math.min(100, this.temp + warm * dt);
    }
    if (this.zone.id === "outdoor" && p.z < 32 && Math.abs(p.x) < 26) {
      if (!this.f.reached) this.set("reached");
    }
    if (this.temp <= 0) {
      this.temp = 0;
      this.transition = { kind: "collapse", t: 0, dur: 3.2, done: false };
      this.events.push({ type: "collapse" });
      return;
    }
    if (this.flashlight && this.battery > 0) {
      this.battery = Math.max(0, this.battery - dt * (100 / 480));
      if (this.battery <= 0 && this.has("battery")) {
        this.take("battery");
        this.battery = 100;
        this.toast("Flashlight battery swapped automatically.", "info");
        this.sfx("click");
      } else if (this.battery <= 0) this.toast("Flashlight battery dead — the light is weak. Find a battery pack.", "warn");
    }

    // ---- bookkeeping
    this.cpTimer -= dt;
    if (this.cpTimer <= 0) {
      this.cpTimer = 1;
      this.checkpointHere();
    }
    this.objTimer -= dt;
    if (this.objTimer <= 0) {
      this.objTimer = 0.25;
      this.checkObjectives();
    }
    this.ambTimer -= dt;
    if (this.ambTimer <= 0) {
      this.ambTimer = 30 + Math.random() * 45;
      this.events.push({ type: "ambient", env: this.zone.env, zone: this.zone.id });
    }
  }

  /* ---------------------------------------------------------- save / load */
  serialize() {
    const p = this.player;
    const safe = this.env.cold === 0 && !this.transition ? { x: p.x, y: p.y, z: p.z, yaw: p.yaw } : this.checkpoint;
    return {
      v: 1, f: { ...this.f }, inv: [...this.inv], docs: [...this.docs], solved: { ...this.solved }, doors: Object.keys(this.doorsOpen),
      temp: Math.round(Math.max(this.temp, 40)), battery: Math.round(this.battery), fl: this.flashlight, pos: safe, cp: this.checkpoint,
      time: Math.round(this.time), seed: this.seed, obj: { ...this.objDone }, ch: this.chapter, hints: this.hintsUsed,
      savedAt: Date.now(),
    };
  }
  load(s) {
    if (!s || s.v !== 1 || typeof s.f !== "object") return;
    const okPos = (q) => q && [q.x, q.z].every(Number.isFinite) && this.inBounds(q.x, q.z) && !this.blocked(q.x, q.z);
    this.f = { ...s.f };
    this.inv = Array.isArray(s.inv) ? s.inv.filter((i) => ITEMS[i]) : ["flashlight"];
    if (!this.inv.includes("flashlight")) this.inv.unshift("flashlight");
    this.docs = Array.isArray(s.docs) ? s.docs.filter((d) => DOCS[d]) : ["pilot"];
    this.solved = Object.fromEntries(Object.entries(s.solved || {}).filter(([k]) => PUZZLES[k]));
    this.doorsOpen = {};
    for (const id of s.doors || []) if (LAYOUT.doors[id]) this.doorsOpen[id] = true;
    // doors a story flag implies (repairs older saves)
    const implied = { iceMelt: "d_icewall", lockdownOff: "d_lab", analyzed: "d_containment", truth: "d_evac", launch: "d_hangar" };
    for (const [fl, id] of Object.entries(implied)) if (this.f[fl]) this.doorsOpen[id] = true;
    for (const id in this.doorsOpen) {
      this.doorAnim[id] = 1;
      this.f["door_" + id] = 1;
    }
    this.temp = Number.isFinite(s.temp) ? Math.max(40, Math.min(100, s.temp)) : 100;
    this.battery = Number.isFinite(s.battery) ? Math.max(0, Math.min(100, s.battery)) : 100;
    this.flashlight = !!s.fl;
    this.time = s.time || 0;
    this.seed = Number.isFinite(s.seed) ? s.seed : this.seed;
    this.objDone = s.obj || {};
    this.hintsUsed = s.hints || 0;
    this.chapter = 0;
    while (this.chapter < CHAPTERS.length && CHAPTERS[this.chapter].objectives.every((o) => o.done(this))) this.chapter++;
    const ch = CHAPTERS[Math.min(this.chapter, CHAPTERS.length - 1)];
    this.checkpoint = okPos(s.cp) ? { ...s.cp } : { ...ch.spawn, y: 0 };
    const pos = okPos(s.pos) ? s.pos : this.checkpoint;
    this.teleport(pos);
    this.player.yaw = pos.yaw || 0;
    this.ended = this.f.ending || null;
    this.dirty = false;
  }
  inBounds(x, z) {
    if (x > UX - 100) return !!roomAt(x, z);
    return x > BOUNDS.x1 && x < BOUNDS.x2 && z > BOUNDS.z1 && z < BOUNDS.z2;
  }
}

export function readSave(storage, key) {
  try {
    const s = JSON.parse(storage.getItem(key) || "null");
    return s && s.v === 1 && !s.f?.ending ? s : null;
  } catch {
    return null;
  }
}

export { DOOR_H };
