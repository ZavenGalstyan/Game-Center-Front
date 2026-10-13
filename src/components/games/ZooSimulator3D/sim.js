/**
 * Zoo Simulator 3D — the whole game state and rules, with no Three.js.
 *
 * `Zoo` owns money, enclosures, animals (needs + wandering AI), visitors
 * (waypoint walkers), staff NPCs, missions, daily tasks, the first-person
 * player (movement + collision) and every hands-on interaction. The renderer
 * (world.js) only reads it; the React host drives `update()`/`stepPlayer()`
 * and drains `events` for sounds, toasts and HUD refreshes.
 */
import {
  SAVE_VERSION, START_MONEY, DAY_LENGTH, PLAYER_R, WALK, SPRINT, SHOES_SPRINT, BOUNDS, FOREST_BLOCK,
  ZONES, ZONE_IDS, HEDGES, PATHS, PLAZAS, FOUNTAIN, POND, SPECIES, ENCLOSURES, ENC_BY_ID, gatePoints, feedSpot,
  BUILDINGS, STORAGE, TAPS, BENCHES, NODES, EDGES, TICKET_PRICES, PRICE_DEMAND, PRICE_MOOD, FOOD_COST,
  SUPPLY_COST, SUPPLY_MAX, UPGRADES, STAFF, MISSIONS, DAILY_POOL, ANIMAL_NAMES, rng, inRect, zoneAt, scenery,
} from "./data.js";

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const fin = (v, d, a = -Infinity, b = Infinity) => (typeof v === "number" && Number.isFinite(v) ? clamp(v, a, b) : d);
const angLerp = (a, b, t) => {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
};
export const money = (n) => "$" + Math.round(n).toLocaleString("en-US");
/** "Rabbits" → "Rabbits'", "Deer" → "Deer's". */
const poss = (w) => (w.endsWith("s") ? w + "'" : w + "'s");

/** Pick sphere (centre height, radius) per species, for crosshair targeting. */
const PICK = { rabbit: [0.25, 0.45], deer: [1.0, 0.85], zebra: [1.1, 0.95], giraffe: [2.3, 1.4], lion: [0.8, 0.95], elephant: [1.8, 1.9] };
const HUNGER_RATE = 1 / 600;
const THIRST_RATE = 1 / 520;
const NEED_AT = 0.65; // animals look for food/water below this
const MAX_DIRT = 6;

const STAT_KEYS = ["fed", "watered", "cleaned", "pensCleaned", "earned", "animalsBought", "built", "hired", "visitors", "zones", "troughFills"];

/* ------------------------------------------------------------------ graph */
const ADJ = {};
for (const k of Object.keys(NODES)) ADJ[k] = [];
for (const [a, b] of EDGES) {
  ADJ[a].push(b);
  ADJ[b].push(a);
}

const SCENERY = scenery();

export class Zoo {
  constructor(save = null, { seed } = {}) {
    this.R = rng(seed ?? (Date.now() % 1e9));
    this.events = [];
    this.time = 0;
    this.layoutVersion = 0;
    this.visitors = [];
    this.npcs = {};
    this.vid = 1;
    this.aid = 1;
    this.spawnT = 2;
    this.checkT = 0;
    if (save) this.load(save);
    else this.fresh();
    this.rebuildColliders();
    for (const role of Object.keys(STAFF)) if (this.staff[role]) this.spawnNpc(role);
  }

  /* ================================================================ setup */
  fresh() {
    this.money = START_MONEY;
    this.day = 1;
    this.dayT = 0;
    this.ticketPrice = 12;
    this.zones = { main: true, savanna: false, valley: false };
    this.upgrades = {};
    this.staff = { keeper: false, cleaner: false, ticket: false };
    this.stats = Object.fromEntries(STAT_KEYS.map((k) => [k, 0]));
    this.enc = {};
    this.animals = [];
    for (const e of ENCLOSURES) {
      this.enc[e.id] = { built: !!e.starter, trough: 0, basin: 0.15, dirt: [], dirtT: 0 };
      if (e.starter) {
        for (let i = 0; i < SPECIES[e.id].start; i++) {
          const a = this.addAnimal(e.id);
          a.hunger = 0.5 + this.R() * 0.1;
          a.thirst = 0.55 + this.R() * 0.1;
          a.happy = 0.62;
        }
      }
    }
    // some droppings to sweep on day one
    for (let i = 0; i < 3; i++) this.addDirt("rabbit");
    for (let i = 0; i < 2; i++) this.addDirt("deer");
    this.mission = 0;
    this.missionBase = { ...this.stats };
    this.today = this.blankDay();
    this.sat = this.estimateSatisfaction();
    this.satN = 0;
    this.player = { x: 0, z: 31, yaw: 0, pitch: -0.05, vx: 0, vz: 0, tool: 0, food: 0, water: 0, supplies: 4, walk: 0, moving: 0, flashlight: false };
    this.newDaily();
  }

  blankDay() {
    return { tickets: 0, tips: 0, shop: 0, snacks: 0, rewards: 0, wages: 0, spent: 0, visitors: 0 };
  }

  get foodCap() { return this.upgrades.bucket ? 12 : 6; }
  get waterCap() { return this.upgrades.jug ? 8 : 4; }
  get maxVisitors() {
    return 14 + (this.zones.savanna ? 8 : 0) + (this.zones.valley ? 8 : 0) + (this.staff.ticket ? 6 : 0);
  }
  get facilities() {
    const u = this.upgrades;
    return Math.min(1, 0.45 + (u.benches ? 0.15 : 0) + (u.flowers ? 0.15 : 0) + (u.kiosk ? 0.15 : 0) + (u.souvenirs ? 0.1 : 0));
  }
  encOpen(id) {
    return this.enc[id].built && this.zones[ENC_BY_ID[id].zone];
  }
  animalsIn(id) {
    return this.animals.filter((a) => a.enc === id);
  }

  emit(type, data = {}) {
    this.events.push({ type, ...data });
  }

  addAnimal(encId, at = null) {
    const def = ENC_BY_ID[encId];
    const sp = SPECIES[encId];
    const used = new Set(this.animals.map((a) => a.name));
    const pool = ANIMAL_NAMES.filter((n) => !used.has(n));
    const name = pool.length ? pool[Math.floor(this.R() * pool.length)] : ANIMAL_NAMES[Math.floor(this.R() * ANIMAL_NAMES.length)];
    const p = at || this.randomIn(def, sp.r);
    const a = {
      id: this.aid++, enc: encId, species: encId, name,
      x: p.x, z: p.z, rot: this.R() * Math.PI * 2,
      hunger: 0.9, thirst: 0.9, happy: 0.75,
      state: "idle", timer: 1 + this.R() * 3, tx: p.x, tz: p.z, spd: 0,
      move: 0, phase: this.R() * 10, head: 0, headT: 0, lie: 0, look: 0,
      reactCd: 0, soundT: 10 + this.R() * 30,
      // every pride gets a maned male first
      male: encId === "lion" ? !this.animals.some((q) => q.enc === "lion" && q.male) || this.R() < 0.3 : this.R() < 0.5,
    };
    this.animals.push(a);
    return a;
  }

  randomIn(def, r) {
    const m = r + 0.7;
    const q = def.rect;
    return { x: q.x0 + m + this.R() * (q.x1 - q.x0 - 2 * m), z: q.z0 + m + this.R() * (q.z1 - q.z0 - 2 * m) };
  }

  addDirt(encId, near = null) {
    const e = this.enc[encId];
    if (e.dirt.length >= MAX_DIRT) return;
    const def = ENC_BY_ID[encId];
    let p = near ? { x: near.x + (this.R() - 0.5) * 3, z: near.z + (this.R() - 0.5) * 3 } : this.randomIn(def, 0.6);
    const q = def.rect;
    p = { x: clamp(p.x, q.x0 + 1.2, q.x1 - 1.2), z: clamp(p.z, q.z0 + 1.2, q.z1 - 1.2) };
    e.dirt.push({ id: this.vid++, x: p.x, z: p.z, s: 0.8 + this.R() * 0.4 });
  }

  /* ================================================================ save */
  serialize() {
    const p = this.player;
    return {
      v: SAVE_VERSION,
      savedAt: Date.now(),
      money: Math.round(this.money),
      day: this.day,
      dayT: this.dayT,
      ticketPrice: this.ticketPrice,
      zones: { ...this.zones },
      upgrades: { ...this.upgrades },
      staff: { ...this.staff },
      stats: { ...this.stats },
      mission: this.mission,
      missionBase: { ...this.missionBase },
      daily: { tasks: this.daily.tasks.map((t) => ({ ...t })), base: { ...this.daily.base } },
      today: { ...this.today },
      sat: this.sat,
      satN: this.satN,
      enc: Object.fromEntries(Object.entries(this.enc).map(([k, e]) => [k, {
        built: e.built, trough: +e.trough.toFixed(3), basin: +e.basin.toFixed(3), dirtT: +e.dirtT.toFixed(3),
        dirt: e.dirt.map((d) => [+d.x.toFixed(2), +d.z.toFixed(2)]),
      }])),
      animals: this.animals.map((a) => ({ s: a.species, n: a.name, x: +a.x.toFixed(2), z: +a.z.toFixed(2), h: +a.hunger.toFixed(3), t: +a.thirst.toFixed(3), hp: +a.happy.toFixed(3), m: a.male ? 1 : 0 })),
      player: { x: +p.x.toFixed(2), z: +p.z.toFixed(2), yaw: +p.yaw.toFixed(3), pitch: +p.pitch.toFixed(3), tool: p.tool, food: p.food, water: p.water, supplies: p.supplies },
    };
  }

  /** Throws on data that isn't a usable save; clamps everything else. */
  load(s) {
    if (!s || typeof s !== "object" || s.v !== SAVE_VERSION || !Number.isFinite(s.money)) throw new Error("bad save");
    this.money = fin(s.money, START_MONEY, -1e6, 1e9);
    this.day = Math.floor(fin(s.day, 1, 1, 1e5));
    this.dayT = fin(s.dayT, 0, 0, DAY_LENGTH);
    this.ticketPrice = TICKET_PRICES.includes(s.ticketPrice) ? s.ticketPrice : 12;
    this.zones = { main: true, savanna: !!s.zones?.savanna, valley: !!s.zones?.valley };
    this.upgrades = {};
    for (const k of Object.keys(UPGRADES)) if (s.upgrades?.[k]) this.upgrades[k] = true;
    this.staff = {};
    for (const k of Object.keys(STAFF)) this.staff[k] = !!s.staff?.[k];
    this.stats = Object.fromEntries(STAT_KEYS.map((k) => [k, fin(s.stats?.[k], 0, 0, 1e9)]));
    this.mission = Math.floor(fin(s.mission, 0, 0, MISSIONS.length));
    this.missionBase = Object.fromEntries(STAT_KEYS.map((k) => [k, fin(s.missionBase?.[k], this.stats[k], 0, 1e9)]));
    this.enc = {};
    for (const e of ENCLOSURES) {
      const r = s.enc?.[e.id] || {};
      const dirt = Array.isArray(r.dirt) ? r.dirt.slice(0, MAX_DIRT) : [];
      this.enc[e.id] = {
        built: !!r.built || !!e.starter,
        trough: fin(r.trough, 0.5, 0, 1),
        basin: fin(r.basin, 0.5, 0, 1),
        dirtT: fin(r.dirtT, 0, 0, 1),
        dirt: [],
      };
      for (const d of dirt) {
        if (!Array.isArray(d)) continue;
        const q = e.rect;
        this.enc[e.id].dirt.push({ id: this.vid++, x: fin(d[0], (q.x0 + q.x1) / 2, q.x0 + 1, q.x1 - 1), z: fin(d[1], (q.z0 + q.z1) / 2, q.z0 + 1, q.z1 - 1), s: 0.8 + this.R() * 0.4 });
      }
    }
    this.animals = [];
    for (const r of Array.isArray(s.animals) ? s.animals : []) {
      if (!r || !SPECIES[r.s] || !this.enc[r.s].built) continue;
      if (this.animalsIn(r.s).length >= SPECIES[r.s].max) continue;
      const def = ENC_BY_ID[r.s];
      const m = SPECIES[r.s].r + 0.7;
      const a = this.addAnimal(r.s, { x: fin(r.x, (def.rect.x0 + def.rect.x1) / 2, def.rect.x0 + m, def.rect.x1 - m), z: fin(r.z, (def.rect.z0 + def.rect.z1) / 2, def.rect.z0 + m, def.rect.z1 - m) });
      if (typeof r.n === "string" && r.n.length < 24) a.name = r.n;
      a.hunger = fin(r.h, 0.8, 0, 1);
      a.thirst = fin(r.t, 0.8, 0, 1);
      a.happy = fin(r.hp, 0.7, 0, 1);
      a.male = !!r.m;
    }
    // a built enclosure must never be empty after a load
    for (const e of ENCLOSURES) if (this.enc[e.id].built && !this.animalsIn(e.id).length) this.addAnimal(e.id);
    const tasks = Array.isArray(s.daily?.tasks) ? s.daily.tasks : [];
    this.daily = {
      tasks: tasks.filter((t) => t && DAILY_POOL.some((p) => p.type === t.type)).slice(0, 3).map((t) => ({
        type: t.type, goal: Math.floor(fin(t.goal, 5, 1, 999)), reward: Math.floor(fin(t.reward, 80, 0, 1000)), done: !!t.done,
      })),
      base: Object.fromEntries(STAT_KEYS.map((k) => [k, fin(s.daily?.base?.[k], this.stats[k], 0, 1e9)])),
    };
    const td = this.blankDay();
    for (const k of Object.keys(td)) td[k] = fin(s.today?.[k], 0, 0, 1e9);
    this.today = td;
    this.sat = fin(s.sat, 0.6, 0, 1);
    this.satN = Math.floor(fin(s.satN, 0, 0, 1e9));
    const p = s.player || {};
    this.player = {
      x: fin(p.x, 0, BOUNDS.x0 + 1, BOUNDS.x1 - 1), z: fin(p.z, 31, BOUNDS.z0 + 1, BOUNDS.z1 - 1),
      yaw: fin(p.yaw, 0), pitch: fin(p.pitch, 0, -1.4, 1.4), vx: 0, vz: 0,
      tool: [0, 1, 2].includes(p.tool) ? p.tool : 0,
      food: Math.floor(fin(p.food, 0, 0, 12)), water: Math.floor(fin(p.water, 0, 0, 8)), supplies: Math.floor(fin(p.supplies, 4, 0, SUPPLY_MAX)),
      walk: 0, moving: 0, flashlight: false,
    };
    this.player.food = Math.min(this.player.food, this.foodCap);
    this.player.water = Math.min(this.player.water, this.waterCap);
    // never resume inside a wall or a locked zone
    if (!this.zones[zoneAt(this.player.x, this.player.z)]) Object.assign(this.player, { x: 0, z: 31 });
  }

  /* ================================================================ colliders */
  rebuildColliders() {
    const rects = [];
    const circles = [];
    const T = 0.16;
    for (const e of ENCLOSURES) {
      if (!this.enc[e.id].built) continue;
      const r = e.rect;
      const g = e.gate;
      const gap = 1.0;
      const wall = (side, a0, a1) => {
        const segs = g.side === side ? [[a0, g.at - gap], [g.at + gap, a1]] : [[a0, a1]];
        for (const [s0, s1] of segs) {
          if (s1 <= s0) continue;
          if (side === "E") rects.push({ x0: r.x1 - T, x1: r.x1 + T, z0: s0, z1: s1 });
          if (side === "W") rects.push({ x0: r.x0 - T, x1: r.x0 + T, z0: s0, z1: s1 });
          if (side === "N") rects.push({ x0: s0, x1: s1, z0: r.z0 - T, z1: r.z0 + T });
          if (side === "S") rects.push({ x0: s0, x1: s1, z0: r.z1 - T, z1: r.z1 + T });
        }
      };
      wall("E", r.z0, r.z1);
      wall("W", r.z0, r.z1);
      wall("N", r.x0, r.x1);
      wall("S", r.x0, r.x1);
      // gate posts
      const gp = gatePoints(e);
      const along = g.side === "E" || g.side === "W" ? [0, 1] : [1, 0];
      for (const sgn of [-1, 1]) circles.push({ x: gp.center.x + along[0] * sgn * (gap + 0.05), z: gp.center.z + along[1] * sgn * (gap + 0.05), r: 0.18 });
    }
    for (const b of BUILDINGS) if (!b.upgrade || this.upgrades[b.upgrade]) rects.push(b.rect);
    for (const h of HEDGES) rects.push(h);
    for (const [id, z] of Object.entries(ZONES)) if (z.barrier && !this.zones[id]) rects.push(z.barrier);
    rects.push(FOREST_BLOCK);
    for (const b of BENCHES) {
      if (b.extra && !this.upgrades.benches) continue;
      const c = Math.abs(Math.cos(b.yaw));
      const s = Math.abs(Math.sin(b.yaw));
      const hw = 0.8 * c + 0.3 * s;
      const hd = 0.8 * s + 0.3 * c;
      rects.push({ x0: b.x - hw, x1: b.x + hw, z0: b.z - hd, z1: b.z + hd });
    }
    circles.push({ x: FOUNTAIN.x, z: FOUNTAIN.z, r: FOUNTAIN.r });
    circles.push({ x: POND.x, z: POND.z, r: POND.r - 0.4 });
    for (const t of TAPS) circles.push({ x: t.x, z: t.z, r: 0.35 });
    circles.push({ x: STORAGE.food.x, z: STORAGE.food.z, r: 0.7 }, { x: STORAGE.supplies.x, z: STORAGE.supplies.z, r: 0.55 });
    for (const t of SCENERY.trees) circles.push({ x: t.x, z: t.z, r: t.kind === 3 ? 0.35 : 0.45 * t.s });
    for (const e of ENCLOSURES) circles.push({ x: e.sign.x, z: e.sign.z, r: 0.22 });
    for (const z of Object.values(ZONES)) if (z.sign) circles.push({ x: z.sign.x, z: z.sign.z, r: 0.25 });
    // gate arch pillars
    circles.push({ x: -4.2, z: 37.4, r: 0.7 }, { x: 4.2, z: 37.4, r: 0.7 });
    this.colliders = { rects, circles };
    this.layoutVersion++;
  }

  /** Push a circle (x,z,r) out of every collider; returns the corrected point. */
  collide(x, z, r) {
    for (let iter = 0; iter < 3; iter++) {
      let moved = false;
      for (const q of this.colliders.rects) {
        if (x < q.x0 - r || x > q.x1 + r || z < q.z0 - r || z > q.z1 + r) continue;
        const cx = clamp(x, q.x0, q.x1);
        const cz = clamp(z, q.z0, q.z1);
        const dx = x - cx;
        const dz = z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        if (d2 > 1e-9) {
          const d = Math.sqrt(d2);
          x = cx + (dx / d) * r;
          z = cz + (dz / d) * r;
        } else {
          // centre inside the box: leave along the shortest axis
          const l = x - q.x0;
          const rr = q.x1 - x;
          const t = z - q.z0;
          const b = q.z1 - z;
          const m = Math.min(l, rr, t, b);
          if (m === l) x = q.x0 - r;
          else if (m === rr) x = q.x1 + r;
          else if (m === t) z = q.z0 - r;
          else z = q.z1 + r;
        }
        moved = true;
      }
      for (const c of this.colliders.circles) {
        const dx = x - c.x;
        const dz = z - c.z;
        const rr = r + c.r;
        const d2 = dx * dx + dz * dz;
        if (d2 >= rr * rr) continue;
        const d = Math.sqrt(d2) || 1e-4;
        x = c.x + (dx / d) * rr;
        z = c.z + (dz / d) * rr;
        moved = true;
      }
      // big animals are solid too
      for (const a of this.animals) {
        const ar = SPECIES[a.species].r;
        if (ar < 0.55) continue;
        const dx = x - a.x;
        const dz = z - a.z;
        const rr = r + ar * 0.85;
        const d2 = dx * dx + dz * dz;
        if (d2 >= rr * rr) continue;
        const d = Math.sqrt(d2) || 1e-4;
        x = a.x + (dx / d) * rr;
        z = a.z + (dz / d) * rr;
        moved = true;
      }
      x = clamp(x, BOUNDS.x0 + r, BOUNDS.x1 - r);
      z = clamp(z, BOUNDS.z0 + r, BOUNDS.z1 - r);
      if (!moved) break;
    }
    return { x, z };
  }

  /* ================================================================ player */
  /**
   * input: { f, b, l, r (0/1), sprint (bool) }. Mouse look is applied by the
   * host straight onto player.yaw/pitch.
   */
  stepPlayer(inp, dt) {
    const p = this.player;
    let mx = (inp.r ? 1 : 0) - (inp.l ? 1 : 0);
    let mz = (inp.f ? 1 : 0) - (inp.b ? 1 : 0);
    const len = Math.hypot(mx, mz);
    if (len > 0) {
      mx /= len;
      mz /= len;
    }
    const sin = Math.sin(p.yaw);
    const cos = Math.cos(p.yaw);
    // forward = (-sin, -cos), right = (cos, -sin)
    const sprinting = !!inp.sprint && mz > 0;
    const speed = sprinting ? (this.upgrades.shoes ? SHOES_SPRINT : SPRINT) : WALK;
    const tvx = (-sin * mz + cos * mx) * speed;
    const tvz = (-cos * mz - sin * mx) * speed;
    const k = Math.min(1, dt * (len ? 10 : 14));
    p.vx += (tvx - p.vx) * k;
    p.vz += (tvz - p.vz) * k;
    const sp = Math.hypot(p.vx, p.vz);
    const steps = Math.max(1, Math.ceil((sp * dt) / 0.25));
    const ox = p.x;
    const oz = p.z;
    for (let i = 0; i < steps; i++) {
      const c = this.collide(p.x + (p.vx * dt) / steps, p.z + (p.vz * dt) / steps, PLAYER_R);
      p.x = c.x;
      p.z = c.z;
    }
    const moved = Math.hypot(p.x - ox, p.z - oz);
    // blocked → bleed off velocity so we don't "stick" against walls
    if (dt > 0 && moved < sp * dt * 0.3) {
      p.vx *= 0.5;
      p.vz *= 0.5;
    }
    p.moving = dt > 0 ? moved / dt : 0;
    p.sprinting = sprinting && p.moving > WALK + 0.5;
    p.walk += moved;
    const stride = p.sprinting ? 2.4 : 1.8;
    if (p.walk > stride) {
      p.walk -= stride;
      this.emit("step", { surface: this.onPath(p.x, p.z) ? "path" : "grass", sprint: p.sprinting });
    }
  }

  onPath(x, z) {
    return PATHS.some((q) => inRect(q, x, z)) || PLAZAS.some((c) => (x - c.x) ** 2 + (z - c.z) ** 2 < c.r * c.r);
  }

  encAt(x, z) {
    for (const e of ENCLOSURES) if (this.enc[e.id].built && inRect(e.rect, x, z, -0.1)) return e.id;
    return null;
  }

  /* ================================================================ interactions */
  /** Every interactable right now: { key, kind, x, y, z, r, range, ...ref }. */
  interactables() {
    const L = [];
    const add = (o) => L.push({ range: 4, y: 1, ...o, r: (o.r ?? 0.7) * 1.25 });
    add({ key: "food", kind: "food", ...STORAGE.food, y: 0.7, r: 0.9 });
    TAPS.forEach((t, i) => this.zones[t.zone] && add({ key: "tap" + i, kind: "tap", x: t.x, z: t.z, y: 0.9, r: 0.55 }));
    for (const b of BUILDINGS) {
      if (b.kind === "kiosk" || b.kind === "barn") continue;
      add({ key: b.id, kind: b.kind, x: b.door.x, z: b.door.z, y: 1.3, r: 1.3, range: 3.6 });
    }
    for (const e of ENCLOSURES) {
      const st = this.enc[e.id];
      const open = this.zones[e.zone];
      if (!open) continue;
      if (!st.built) {
        add({ key: "plot:" + e.id, kind: "plot", enc: e.id, x: e.sign.x, z: e.sign.z, y: 1.3, r: 0.9, range: 3.8 });
        continue;
      }
      add({ key: "sign:" + e.id, kind: "sign", enc: e.id, x: e.sign.x, z: e.sign.z, y: 1.3, r: 0.8, range: 3.6 });
      add({ key: "trough:" + e.id, kind: "trough", enc: e.id, x: e.trough.x, z: e.trough.z, y: 0.45, r: 0.75 });
      add({ key: "basin:" + e.id, kind: "basin", enc: e.id, x: e.basin.x, z: e.basin.z, y: 0.4, r: 0.75 });
      for (const d of st.dirt) add({ key: "dirt:" + d.id, kind: "dirt", enc: e.id, dirt: d, x: d.x, z: d.z, y: 0.12, r: 0.6, range: 3.0 });
    }
    for (const a of this.animals) {
      if (!this.zones[ENC_BY_ID[a.enc].zone]) continue;
      const [h, r] = PICK[a.species];
      add({ key: "animal:" + a.id, kind: "animal", animal: a, x: a.x, z: a.z, y: h * (1 - a.lie * 0.45), r, range: 8 });
    }
    for (const [id, z] of Object.entries(ZONES)) {
      if (!z.barrier || this.zones[id]) continue;
      const b = z.barrier;
      add({ key: "zone:" + id, kind: "zone", zone: id, x: (b.x0 + b.x1) / 2, z: (b.z0 + b.z1) / 2, y: 1, r: 2.4, range: 4.2 });
      add({ key: "zonesign:" + id, kind: "zone", zone: id, x: z.sign.x, z: z.sign.z, y: 1.4, r: 1, range: 3.8 });
    }
    return L;
  }

  /**
   * Where the current objective wants the player to go next, for the world
   * beacon + compass marker: { x, y, z, label } or null.
   */
  guide() {
    const m = MISSIONS[this.mission];
    if (!m) return null;
    const p = this.player;
    const near = (list) => {
      let best = null;
      let bd = Infinity;
      for (const q of list) {
        const d = Math.hypot(q.x - p.x, q.z - p.z);
        if (d < bd) {
          bd = d;
          best = q;
        }
      }
      return best;
    };
    const open = ENCLOSURES.filter((e) => this.encOpen(e.id));
    const sign = (e, label) => ({ x: e.sign.x, z: e.sign.z, y: 1.6, label });
    const plotFor = (id) => sign(ENC_BY_ID[id], `Build the ${SPECIES[id].name} habitat`);
    switch (m.id) {
      case "feed3": {
        if (!p.food) return { ...STORAGE.food, y: 1.2, label: "Storage Barn — free food" };
        const hungry = this.animals.filter((a) => this.zones[ENC_BY_ID[a.enc].zone] && a.hunger < 0.85);
        const t = near([
          ...open.filter((e) => this.enc[e.id].trough < 0.97).map((e) => ({ x: e.trough.x, z: e.trough.z, y: 0.9, label: `${poss(SPECIES[e.id].plural)} feeding trough` })),
          ...hungry.map((a) => ({ x: a.x, z: a.z, y: 1.5, label: `Feed ${a.name}` })),
        ]);
        return t;
      }
      case "water2": {
        if (!p.water) return near(TAPS.filter((t) => this.zones[t.zone]).map((t) => ({ x: t.x, z: t.z, y: 1.3, label: "Water tap" })));
        return near(open.filter((e) => this.enc[e.id].basin < 0.97).map((e) => ({ x: e.basin.x, z: e.basin.z, y: 0.9, label: `${poss(SPECIES[e.id].plural)} water station` })));
      }
      case "clean1": {
        const piles = [];
        for (const e of open) for (const d of this.enc[e.id].dirt) piles.push({ x: d.x, z: d.z, y: 0.6, label: `Droppings in the ${SPECIES[e.id].name.toLowerCase()} habitat` });
        return near(piles);
      }
      case "buyAnimal":
        return near(open.map((e) => sign(e, `${SPECIES[e.id].plural} sign — buy an animal`)));
      case "build1": {
        const plot = ENCLOSURES.filter((e) => this.zones[e.zone] && !this.enc[e.id].built).sort((a, b) => a.buildCost - b.buildCost)[0];
        return plot ? plotFor(plot.id) : null;
      }
      case "sat80": {
        const b = BUILDINGS.find((q) => q.id === "shop");
        return { x: b.door.x, z: b.door.z, y: 2.2, label: "Gift Shop — facility upgrades" };
      }
      case "hire1": {
        const b = BUILDINGS.find((q) => q.id === "office");
        return { x: b.door.x, z: b.door.z, y: 2.2, label: "Staff Office" };
      }
      case "lion":
        if (!this.zones.savanna) return { ...ZONES.savanna.sign, y: 1.8, label: "Open the Savanna Plains" };
        return plotFor("lion");
      case "valley":
        return { ...ZONES.valley.sign, y: 1.8, label: "Open Elephant Valley" };
      default:
        return null;
    }
  }

  /** Crosshair target from the eye position + unit look direction. */
  pick(eye, dir) {
    const p = this.player;
    let best = null;
    let bestT = Infinity;
    for (const it of this.interactables()) {
      const hd = Math.hypot(it.x - p.x, it.z - p.z);
      if (hd > it.range + it.r) continue;
      const vx = it.x - eye.x;
      const vy = it.y - eye.y;
      const vz = it.z - eye.z;
      const t = vx * dir.x + vy * dir.y + vz * dir.z;
      if (t < 0) continue;
      const d2 = vx * vx + vy * vy + vz * vz - t * t;
      if (d2 > it.r * it.r) continue;
      if (t < bestT) {
        bestT = t;
        best = it;
      }
    }
    return best;
  }

  /** Prompt for a target: { text, ok, sub? }. */
  describe(it) {
    const p = this.player;
    const e = it.enc ? this.enc[it.enc] : null;
    const sp = it.enc ? SPECIES[it.enc] : null;
    switch (it.kind) {
      case "food": {
        const need = this.foodCap - p.food;
        if (!need) return { text: "Feed bucket is full", ok: false };
        return { text: "Grab animal food", sub: "free", ok: true };
      }
      case "supplies":
        if (p.supplies >= SUPPLY_MAX) return { text: "Cleaning supplies are full", ok: false };
        return this.money < SUPPLY_COST ? { text: `Need ${money(SUPPLY_COST)} for supplies`, ok: false } : { text: "Restock cleaning supplies", sub: `−${money(SUPPLY_COST)}`, ok: true };
      case "tap":
        return p.water >= this.waterCap ? { text: "Water jug is full", ok: false } : { text: "Fill water jug", sub: "free", ok: true };
      case "trough":
        if (e.trough > 0.97) return { text: `${poss(sp.plural)} trough is full`, ok: false };
        if (!p.food) return { text: "No food — collect some at the Storage Barn", ok: false };
        return { text: `Fill the ${poss(sp.plural.toLowerCase())} feeding trough`, sub: `${Math.round(e.trough * 100)}% full`, ok: true };
      case "basin":
        if (e.basin > 0.97) return { text: `${poss(sp.plural)} water is full`, ok: false };
        if (!p.water) return { text: "Jug is empty — fill it at a water tap", ok: false };
        return { text: `Refill the ${poss(sp.plural.toLowerCase())} water station`, sub: `${Math.round(e.basin * 100)}% full`, ok: true };
      case "dirt":
        return { text: "Sweep up the mess", ok: true };
      case "animal": {
        const a = it.animal;
        if (this.canHandFeed(a)) return { text: `Feed ${a.name} the ${SPECIES[a.species].name}`, sub: "hungry", ok: true };
        return { text: `Check on ${a.name} the ${SPECIES[a.species].name}`, sub: moodWord(a), ok: true };
      }
      case "sign":
        return { text: `${sp.plural} habitat`, sub: "info & animals", ok: true };
      case "plot":
        return { text: `Build ${sp.name} habitat`, sub: money(ENC_BY_ID[it.enc].buildCost), ok: true };
      case "zone":
        return { text: `Unlock ${ZONES[it.zone].name}`, sub: money(ZONES[it.zone].cost), ok: true };
      case "shop":
        return { text: "Gift Shop", sub: "upgrades", ok: true };
      case "office":
        return { text: "Staff Office", sub: "hire workers", ok: true };
      case "booth":
        return { text: "Ticket Booth", sub: "income & prices", ok: true };
      default:
        return { text: "", ok: false };
    }
  }

  /** Performs a hands-on action, or returns { panel } for the host to open. */
  interact(it) {
    if (!it) return null;
    const p = this.player;
    const e = it.enc ? this.enc[it.enc] : null;
    const d = this.describe(it);
    switch (it.kind) {
      case "food": {
        if (!d.ok) return this.fail(d.text);
        p.food = this.foodCap;
        p.tool = 0;
        this.emit("collect", { item: "food", msg: `Food bucket filled (${p.food})` });
        return { done: true };
      }
      case "supplies":
        if (!d.ok) return this.fail(d.text);
        this.spend(SUPPLY_COST, "supplies");
        p.supplies = SUPPLY_MAX;
        p.tool = 2;
        this.emit("collect", { item: "supplies", msg: "Cleaning supplies restocked" });
        return { done: true };
      case "tap":
        if (!d.ok) return this.fail(d.text);
        p.water = this.waterCap;
        p.tool = 1;
        this.emit("tap", { msg: "Water jug filled" });
        return { done: true };
      case "trough": {
        if (!d.ok) return this.fail(d.text);
        e.trough = 1;
        p.food -= 1;
        p.tool = 0;
        this.stats.troughFills++;
        this.emit("feed", { x: it.x, z: it.z, msg: `Trough filled (${Math.round(e.trough * 100)}%)` });
        return { done: true, use: true };
      }
      case "basin":
        if (!d.ok) return this.fail(d.text);
        e.basin = 1;
        p.water--;
        p.tool = 1;
        this.stats.watered++;
        this.emit("water", { x: it.x, z: it.z, msg: "Water station refilled" });
        return { done: true, use: true };
      case "dirt": {
        if (!d.ok) return this.fail(d.text);
        const radius = this.upgrades.broom ? 2.5 : 0.01;
        const before = e.dirt.length;
        e.dirt = e.dirt.filter((q) => q !== it.dirt && Math.hypot(q.x - it.dirt.x, q.z - it.dirt.z) > radius);
        const n = before - e.dirt.length;
        p.tool = 2;
        this.stats.cleaned += n;
        if (!e.dirt.length) {
          this.stats.pensCleaned++;
          this.emit("clean", { x: it.x, z: it.z, n, msg: `${SPECIES[it.enc].plural} habitat is spotless!` });
        } else this.emit("clean", { x: it.x, z: it.z, n });
        return { done: true, use: true };
      }
      case "animal":
        if (this.canHandFeed(it.animal)) {
          this.handFeed(it.animal.id);
          return { done: true, use: true };
        }
        return { panel: { type: "animal", id: it.animal.id } };
      case "sign":
        return { panel: { type: "enclosure", id: it.enc } };
      case "plot":
        return { panel: { type: "build", id: it.enc } };
      case "zone":
        return { panel: { type: "expand", id: it.zone } };
      case "shop":
      case "office":
      case "booth":
        return { panel: { type: it.kind } };
      default:
        return null;
    }
  }

  fail(msg) {
    this.emit("deny", { msg });
    return { done: false };
  }

  spend(cost) {
    if (!(this.money >= cost)) {
      this.emit("error", { msg: `Not enough money — you need ${money(cost)}` });
      return false;
    }
    this.money -= cost;
    this.today.spent += cost;
    return true;
  }

  earn(amount, kind, at = null) {
    if (amount <= 0) return;
    this.money += amount;
    if (kind !== "rewards") this.stats.earned += amount;
    this.today[kind] = (this.today[kind] || 0) + amount;
    this.emit("cash", { amount, kind, x: at?.x, z: at?.z });
  }

  /* ---------------------------------------------------------- panel actions */
  canHandFeed(a) {
    const p = this.player;
    return p.food > 0 && a.hunger < 0.85 && Math.hypot(a.x - p.x, a.z - p.z) <= 4.5 + SPECIES[a.species].r;
  }

  handFeed(animalId) {
    const a = this.animals.find((q) => q.id === animalId);
    const p = this.player;
    if (!a) return false;
    if (!p.food) return this.fail("Your bucket is empty — collect food at the Storage Barn").done;
    if (Math.hypot(a.x - p.x, a.z - p.z) > 4 + SPECIES[a.species].r) return this.fail(`Get closer to ${a.name} to hand-feed`).done;
    if (a.hunger > 0.95) return this.fail(`${a.name} isn't hungry right now`).done;
    p.food--;
    p.tool = 0;
    a.hunger = Math.min(1, a.hunger + 0.45);
    a.happy = Math.min(1, a.happy + 0.06);
    a.state = "eat";
    a.timer = 2.5;
    this.stats.fed++;
    this.emit("feed", { x: a.x, z: a.z, msg: `You fed ${a.name}!`, hand: true });
    this.emit("animal", { species: a.species, x: a.x, z: a.z });
    return true;
  }

  build(encId) {
    const def = ENC_BY_ID[encId];
    const st = this.enc[encId];
    if (!def || st.built || !this.zones[def.zone]) return false;
    if (!this.spend(def.buildCost)) return false;
    st.built = true;
    st.trough = 0.5;
    st.basin = 0.6;
    st.dirt = [];
    for (let i = 0; i < SPECIES[encId].start; i++) this.addAnimal(encId);
    this.stats.built++;
    this.rebuildColliders();
    this.emit("purchase", { msg: `${SPECIES[encId].name} habitat built! ${SPECIES[encId].start} ${SPECIES[encId].start > 1 ? SPECIES[encId].plural.toLowerCase() : SPECIES[encId].name.toLowerCase()} arrived.`, big: true });
    this.emit("animal", { species: encId, x: def.sign.x, z: def.sign.z });
    return true;
  }

  buyAnimal(encId) {
    if (!this.encOpen(encId)) return false;
    const sp = SPECIES[encId];
    if (this.animalsIn(encId).length >= sp.max) return this.fail("This habitat is at full capacity").done;
    if (!this.spend(sp.animalCost)) return false;
    const gp = gatePoints(ENC_BY_ID[encId]);
    const a = this.addAnimal(encId, { x: gp.inside.x - gp.normal.x * (sp.r + 0.5), z: gp.inside.z - gp.normal.z * (sp.r + 0.5) });
    a.happy = 0.7;
    this.stats.animalsBought++;
    this.emit("purchase", { msg: `Welcome, ${a.name} the ${sp.name}!` });
    this.emit("animal", { species: encId, x: a.x, z: a.z });
    return true;
  }

  unlockZone(id) {
    const z = ZONES[id];
    if (!z || this.zones[id]) return false;
    if (!this.spend(z.cost)) return false;
    this.zones[id] = true;
    this.stats.zones++;
    this.rebuildColliders();
    this.emit("purchase", { msg: `${z.name} is open!`, big: true });
    return true;
  }

  buyUpgrade(id) {
    const u = UPGRADES[id];
    if (!u || this.upgrades[id]) return false;
    if (!this.spend(u.cost)) return false;
    this.upgrades[id] = true;
    const p = this.player;
    if (id === "bucket" || id === "jug") {
      p.food = Math.min(p.food, this.foodCap);
      p.water = Math.min(p.water, this.waterCap);
    }
    this.rebuildColliders();
    this.emit("purchase", { msg: `${u.name} purchased` });
    return true;
  }

  hire(role) {
    const s = STAFF[role];
    if (!s || this.staff[role]) return false;
    if (!this.spend(s.hire)) return false;
    this.staff[role] = true;
    this.stats.hired++;
    this.spawnNpc(role);
    this.emit("purchase", { msg: `${s.name} hired (${money(s.wage)}/day)` });
    return true;
  }

  fire(role) {
    if (!this.staff[role]) return false;
    this.staff[role] = false;
    delete this.npcs[role];
    this.emit("info", { msg: `${STAFF[role].name} dismissed` });
    return true;
  }

  setTicketPrice(price) {
    if (!TICKET_PRICES.includes(price)) return;
    this.ticketPrice = price;
  }

  /* ================================================================ update */
  update(dt) {
    this.time += dt;
    this.dayT += dt;
    if (this.dayT >= DAY_LENGTH) {
      this.dayT -= DAY_LENGTH;
      this.endDay();
    }
    const enc = this.enc;
    for (const e of ENCLOSURES) {
      const st = enc[e.id];
      if (!st.built) continue;
      const list = this.animalsIn(e.id);
      st.dirtT += (dt * list.length * SPECIES[e.id].mess * 0.5) / 60;
      if (st.dirtT >= 1) {
        st.dirtT -= 1;
        this.addDirt(e.id, list[Math.floor(this.R() * list.length)]);
      }
    }
    for (const a of this.animals) this.updateAnimal(a, dt);
    this.updateVisitors(dt);
    for (const n of Object.values(this.npcs)) this.updateNpc(n, dt);
    this.checkT -= dt;
    if (this.checkT <= 0) {
      this.checkT = 0.5;
      this.checkMissions();
      this.checkDaily();
    }
  }

  cleanOf(id) {
    return 1 - this.enc[id].dirt.length / MAX_DIRT;
  }

  updateAnimal(a, dt) {
    const sp = SPECIES[a.species];
    const def = ENC_BY_ID[a.enc];
    const st = this.enc[a.enc];
    const count = this.animalsIn(a.enc).length;
    a.hunger = Math.max(0, a.hunger - dt * HUNGER_RATE);
    a.thirst = Math.max(0, a.thirst - dt * THIRST_RATE);
    const clean = this.cleanOf(a.enc);
    const social = a.species === "lion" || a.species === "elephant" ? 1 : Math.min(1, count / 2);
    let target = 0.36 * Math.min(1, a.hunger / 0.8) + 0.3 * Math.min(1, a.thirst / 0.8) + 0.24 * clean + 0.1 * social;
    if (a.state === "rest") target += 0.03;
    a.happy = clamp(a.happy + (target - a.happy) * Math.min(1, dt * 0.05), 0, 1);
    a.reactCd -= dt;

    // ambient calls
    a.soundT -= dt;
    if (a.soundT <= 0) {
      a.soundT = 18 + this.R() * 35;
      this.emit("animal", { species: a.species, x: a.x, z: a.z, ambient: true });
    }

    // react to the keeper (player)
    const p = this.player;
    const pd = Math.hypot(p.x - a.x, p.z - a.z);
    const inside = inRect(def.rect, p.x, p.z);
    if (a.reactCd <= 0 && pd < sp.react && a.state !== "eat" && a.state !== "drink") {
      a.reactCd = 3 + this.R() * 2;
      if (sp.prey && (inside || pd < sp.react * 0.55)) {
        const dx = (a.x - p.x) / (pd || 1);
        const dz = (a.z - p.z) / (pd || 1);
        const q = def.rect;
        const m = sp.r + 0.7;
        a.tx = clamp(a.x + dx * (3 + this.R() * 2) + (this.R() - 0.5) * 2, q.x0 + m, q.x1 - m);
        a.tz = clamp(a.z + dz * (3 + this.R() * 2) + (this.R() - 0.5) * 2, q.z0 + m, q.z1 - m);
        a.state = "flee";
        a.timer = 4;
        a.lie = Math.min(a.lie, 0.5);
      } else if (a.state !== "flee") {
        a.state = "look";
        a.timer = 1.6 + this.R();
        if (!sp.prey && inside) this.emit("animal", { species: a.species, x: a.x, z: a.z, alarm: true });
      }
    }

    let speed = 0;
    let headTarget = 0;
    let lieTarget = 0;
    a.timer -= dt;
    const goTo = (run) => {
      const dx = a.tx - a.x;
      const dz = a.tz - a.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.12) return true;
      speed = Math.min(sp.speed * (run ? 1.7 : 0.55), d / Math.max(dt, 1e-3));
      a.x += (dx / d) * speed * dt;
      a.z += (dz / d) * speed * dt;
      a.rot = angLerp(a.rot, Math.atan2(dx, dz), Math.min(1, dt * 6));
      return false;
    };
    switch (a.state) {
      case "walk":
        if (goTo(false) || a.timer < -12) this.think(a);
        break;
      case "flee":
        if (goTo(true) || a.timer <= 0) {
          a.state = "idle";
          a.timer = 1 + this.R() * 2;
        }
        break;
      case "toEat":
      case "toDrink":
        if (goTo(false)) {
          const eat = a.state === "toEat";
          a.state = eat ? "eat" : "drink";
          a.timer = 3.5;
          const tgt = eat ? def.trough : def.basin;
          a.rot = Math.atan2(tgt.x - a.x, tgt.z - a.z);
        } else if (a.timer < -20) this.think(a);
        break;
      case "eat":
      case "drink": {
        headTarget = 1;
        if (a.timer <= 0) {
          if (a.state === "eat") {
            if (st.trough >= sp.eat * 0.5) {
              st.trough = Math.max(0, st.trough - sp.eat);
              if (a.hunger < 0.9) {
                a.hunger = 1;
                this.stats.fed++;
                this.emit("eat", { name: a.name, species: a.species, x: a.x, z: a.z });
              }
            }
          } else if (st.basin >= sp.drink * 0.5) {
            st.basin = Math.max(0, st.basin - sp.drink);
            a.thirst = 1;
          }
          this.think(a);
        }
        break;
      }
      case "rest":
        lieTarget = 1;
        if (a.timer <= 0) this.think(a);
        break;
      case "look": {
        const want = Math.atan2(p.x - a.x, p.z - a.z);
        a.rot = angLerp(a.rot, want, Math.min(1, dt * 4));
        if (a.timer <= 0) this.think(a);
        break;
      }
      default: // idle (sometimes grazing)
        if (a.graze) headTarget = 0.85;
        if (a.timer <= 0) this.think(a);
    }
    // keep inside the habitat
    const m = sp.r + 0.5;
    a.x = clamp(a.x, def.rect.x0 + m, def.rect.x1 - m);
    a.z = clamp(a.z, def.rect.z0 + m, def.rect.z1 - m);
    // animation channels (renderer reads these)
    a.spd = speed;
    a.move = speed / sp.speed;
    a.phase += dt * (2 + speed * (a.species === "rabbit" ? 5 : 2.6));
    a.head += (headTarget - a.head) * Math.min(1, dt * 4);
    a.lie += (lieTarget - a.lie) * Math.min(1, dt * 2);
  }

  think(a) {
    const sp = SPECIES[a.species];
    const def = ENC_BY_ID[a.enc];
    const st = this.enc[a.enc];
    a.graze = false;
    if (a.hunger < NEED_AT && st.trough >= sp.eat * 0.5) {
      const s = feedSpot(def, def.trough, sp.r);
      a.tx = s.x + (this.R() - 0.5) * 0.8;
      a.tz = s.z + (this.R() - 0.5) * 0.8;
      a.state = "toEat";
      a.timer = 0;
      return;
    }
    if (a.thirst < NEED_AT && st.basin >= sp.drink * 0.5) {
      const s = feedSpot(def, def.basin, sp.r);
      a.tx = s.x + (this.R() - 0.5) * 0.8;
      a.tz = s.z + (this.R() - 0.5) * 0.8;
      a.state = "toDrink";
      a.timer = 0;
      return;
    }
    const r = this.R();
    const restP = a.species === "lion" ? 0.4 : 0.14;
    if (r < restP && a.happy > 0.35) {
      a.state = "rest";
      a.timer = 7 + this.R() * 9;
    } else if (r < restP + 0.45) {
      const t = this.randomIn(def, sp.r);
      a.tx = t.x;
      a.tz = t.z;
      a.state = "walk";
      a.timer = 0;
    } else {
      a.state = "idle";
      a.timer = 2 + this.R() * 4;
      a.graze = sp.prey && this.R() < 0.6;
    }
  }

  /* ---------------------------------------------------------- visitors */
  attraction() {
    let att = 0;
    for (const e of ENCLOSURES) {
      if (!this.encOpen(e.id)) continue;
      const list = this.animalsIn(e.id);
      if (!list.length) continue;
      const happy = list.reduce((s, a) => s + a.happy, 0) / list.length;
      att += SPECIES[e.id].weight * Math.sqrt(list.length) * (0.5 + 0.5 * happy);
    }
    return att;
  }

  spawnInterval() {
    const demand = (0.85 + 0.15 * this.attraction()) * PRICE_DEMAND[this.ticketPrice] * (this.staff.ticket ? 1.3 : 1) * (0.7 + 0.6 * this.sat);
    return clamp(8 / demand, 1.6, 20);
  }

  encScore(id) {
    const list = this.animalsIn(id);
    if (!list.length) return 0.3;
    const happy = list.reduce((s, a) => s + a.happy, 0) / list.length;
    return 0.6 * happy + 0.25 * this.cleanOf(id) + 0.15 * Math.min(1, 0.4 + list.length / SPECIES[id].max);
  }

  variety() {
    return Math.min(1, ENCLOSURES.filter((e) => this.encOpen(e.id)).length / 4);
  }

  /** Overall satisfaction a visitor with average scores would leave with. */
  combine(avgScore) {
    return clamp(0.62 * avgScore + 0.2 * this.facilities + 0.18 * this.variety() + PRICE_MOOD[this.ticketPrice], 0, 1);
  }

  estimateSatisfaction() {
    const open = ENCLOSURES.filter((e) => this.encOpen(e.id));
    if (!open.length) return 0.4;
    return this.combine(open.reduce((s, e) => s + this.encScore(e.id), 0) / open.length);
  }

  nearestNode(x, z, zone) {
    let best = null;
    let bd = Infinity;
    for (const [k, n] of Object.entries(NODES)) {
      if (zone && n.zone !== zone && !(zone === "savanna" && k === "sg") && !(zone === "valley" && k === "vg")) continue;
      if (k === "gateOut") continue;
      const d = (n.x - x) ** 2 + (n.z - z) ** 2;
      if (d < bd) {
        bd = d;
        best = k;
      }
    }
    return best;
  }

  route(from, to) {
    if (from === to) return [from];
    const prev = { [from]: null };
    const q = [from];
    while (q.length) {
      const c = q.shift();
      for (const n of ADJ[c]) {
        if (n in prev || !this.zones[NODES[n].zone]) continue;
        prev[n] = c;
        if (n === to) {
          const out = [n];
          let k = c;
          while (k) {
            out.unshift(k);
            k = prev[k];
          }
          return out;
        }
        q.push(n);
      }
    }
    return [from];
  }

  updateVisitors(dt) {
    this.spawnT -= dt;
    if (this.spawnT <= 0) {
      this.spawnT = this.spawnInterval() * (0.7 + this.R() * 0.6);
      if (this.visitors.length < this.maxVisitors) this.spawnVisitor();
    }
    for (let i = this.visitors.length - 1; i >= 0; i--) {
      const v = this.visitors[i];
      if (this.stepWalker(v, dt)) continue;
      // arrived somewhere / waiting
      if (v.state === "watch" || v.state === "shopping") {
        v.timer -= dt;
        if (v.look) v.rot = angLerp(v.rot, Math.atan2(v.look.x - v.x, v.look.z - v.z), Math.min(1, dt * 3));
        if (v.timer > 0) continue;
        if (v.state === "watch") {
          v.scores.push(this.encScore(v.target));
        } else if (this.R() < 0.25 + 0.55 * this.visitorMood(v)) {
          const amt = Math.round((5 + this.R() * 9) * (this.upgrades.souvenirs ? 1.6 : 1));
          this.earn(amt, "shop", NODES.shop);
        }
        v.state = "walk";
      }
      if (v.state === "walk" && !v.path.length) {
        if (v.leaving) {
          this.visitorLeaves(v);
          this.visitors.splice(i, 1);
          continue;
        }
        this.nextGoal(v);
      }
    }
  }

  visitorMood(v) {
    if (!v.scores.length) return this.sat;
    return this.combine(v.scores.reduce((s, x) => s + x, 0) / v.scores.length);
  }

  spawnVisitor() {
    const R = this.R;
    const open = ENCLOSURES.filter((e) => this.encOpen(e.id)).map((e) => e.id);
    for (let i = open.length - 1; i > 0; i--) {
      const j = Math.floor(R() * (i + 1));
      [open[i], open[j]] = [open[j], open[i]];
    }
    const plan = open.slice(0, Math.min(open.length, 2 + Math.floor(R() * 3)));
    if (R() < 0.45) plan.push("shop");
    const kid = R() < 0.22;
    const v = {
      id: this.vid++, x: NODES.gateOut.x + (R() - 0.5) * 2, z: NODES.gateOut.z, rot: Math.PI,
      ox: (R() - 0.5) * 2.2, oz: (R() - 0.5) * 2.2, speed: (kid ? 1.6 : 1.35) + R() * 0.45, node: "gateOut",
      path: [], plan, scores: [], state: "walk", timer: 0, target: null, look: null, leaving: false,
      phase: R() * 6, move: 0, kid, seed: Math.floor(R() * 1e6),
    };
    this.visitors.push(v);
    this.today.visitors++;
    this.stats.visitors++;
    this.earn(this.ticketPrice + (this.staff.ticket ? 2 : 0), "tickets", NODES.gate);
    this.nextGoal(v);
  }

  nextGoal(v) {
    const goal = v.plan.shift();
    if (!goal) {
      v.leaving = true;
      this.walkTo(v, "gateOut", null);
      return;
    }
    if (goal === "shop") {
      this.walkTo(v, "shop", { x: -9.0 + (this.R() - 0.5) * 0.4, z: 32 + (this.R() - 0.5) * 2.4 });
      v.state = "walk";
      v.after = "shopping";
      v.look = { x: -12, z: 32 };
      return;
    }
    const def = ENC_BY_ID[goal];
    if (!this.encOpen(goal)) return this.nextGoal(v);
    const seg = def.views[Math.floor(this.R() * def.views.length)];
    const t = this.R();
    const spot = { x: seg[0] + (seg[2] - seg[0]) * t, z: seg[1] + (seg[3] - seg[1]) * t };
    const node = this.nearestNode(spot.x, spot.z, def.zone);
    v.target = goal;
    const r = def.rect;
    v.look = { x: clamp(spot.x, r.x0 + 2, r.x1 - 2), z: clamp(spot.z, r.z0 + 2, r.z1 - 2) };
    this.walkTo(v, node, spot);
    v.after = "watch";
  }

  walkTo(w, node, spot) {
    const nodes = this.route(w.node, node);
    w.path = nodes.map((k) => ({ x: NODES[k].x + (w.ox || 0), z: NODES[k].z + (w.oz || 0) }));
    if (spot) w.path.push(spot);
    w.node = node;
  }

  /** Moves a walker along its path. Returns true while still walking. */
  stepWalker(w, dt) {
    if (!w.path.length) {
      w.move = 0;
      return false;
    }
    const t = w.path[0];
    const dx = t.x - w.x;
    const dz = t.z - w.z;
    const d = Math.hypot(dx, dz);
    const step = w.speed * dt;
    if (d <= step) {
      w.x = t.x;
      w.z = t.z;
      w.path.shift();
      if (!w.path.length) {
        w.move = 0;
        if (w.after) {
          w.state = w.after;
          w.timer = w.after === "watch" ? 4 + this.R() * 4 : 2.5 + this.R() * 2;
          w.after = null;
        }
        return w.state === "walk" && false;
      }
      return true;
    }
    w.x += (dx / d) * step;
    w.z += (dz / d) * step;
    w.rot = angLerp(w.rot, Math.atan2(dx, dz), Math.min(1, dt * 8));
    w.move = 1;
    w.phase += dt * w.speed * 5.2;
    return true;
  }

  visitorLeaves(v) {
    const s = this.visitorMood(v);
    this.sat = this.satN === 0 ? s : this.sat * 0.85 + s * 0.15;
    this.satN++;
    const tip = Math.round(14 * s * s);
    if (tip > 0) this.earn(tip, "tips", NODES.gate);
    if (this.upgrades.kiosk) this.earn(Math.round(4 * (0.5 + s)), "snacks", NODES.gate);
  }

  /* ---------------------------------------------------------- staff */
  spawnNpc(role) {
    const home = role === "keeper" ? { x: 7.4, z: -12, node: "z1" } : role === "cleaner" ? { x: 3.2, z: 1.2, node: "pN" } : { x: 6.1, z: 35.2, node: "gate" };
    this.npcs[role] = {
      role, x: home.x, z: home.z, rot: role === "ticket" ? 0 : -Math.PI / 2, home, node: home.node,
      speed: 2.3, path: [], steps: [], timer: 2, move: 0, phase: 0, act: 0, state: "idle",
    };
  }

  updateNpc(n, dt) {
    n.act = Math.max(0, n.act - dt);
    if (n.role === "ticket") {
      n.phase += dt;
      n.wave = this.visitors.some((v) => Math.hypot(v.x - n.x, v.z - n.z) < 5) ? 1 : 0;
      return;
    }
    if (this.stepWalker(n, dt)) return;
    if (n.steps.length) {
      const s = n.steps[0];
      if (s.pts) {
        n.path = s.pts.map((q) => ({ ...q }));
        n.steps.shift();
        return;
      }
      if (s.wait != null) {
        n.act = 0.5;
        s.wait -= dt;
        if (s.face) n.rot = angLerp(n.rot, Math.atan2(s.face.x - n.x, s.face.z - n.z), Math.min(1, dt * 6));
        if (s.wait > 0) return;
        s.fn?.();
        n.steps.shift();
      }
      return;
    }
    n.timer -= dt;
    if (n.timer > 0) return;
    n.timer = 3;
    if (n.role === "keeper") this.planKeeper(n);
    else this.planCleaner(n);
  }

  serviceRoute(n, def, inner) {
    const gp = gatePoints(def);
    const node = this.nearestNode(gp.outside.x, gp.outside.z, def.zone);
    const nodes = this.route(n.node, node).map((k) => ({ x: NODES[k].x, z: NODES[k].z }));
    n.node = node;
    return [
      { pts: [...nodes, gp.outside, gp.inside, ...inner.slice(0, 1)] },
    ];
  }

  planKeeper(n) {
    let best = null;
    let low = 0.55;
    for (const e of ENCLOSURES) {
      if (!this.encOpen(e.id)) continue;
      const st = this.enc[e.id];
      const v = Math.min(st.trough, st.basin);
      if (v < low) {
        low = v;
        best = e;
      }
    }
    if (!best) return;
    const st = this.enc[best.id];
    const t = feedSpot(best, best.trough, 0.25);
    const b = feedSpot(best, best.basin, 0.25);
    const gp = gatePoints(best);
    n.steps = [
      ...this.serviceRoute(n, best, [t]),
      { wait: 1.6, face: best.trough, fn: () => { st.trough = 1; this.emit("staff", { role: "keeper", x: t.x, z: t.z }); } },
      { pts: [b] },
      { wait: 1.4, face: best.basin, fn: () => { st.basin = 1; } },
      { pts: [gp.inside, gp.outside, { x: NODES[n.node].x, z: NODES[n.node].z }] },
    ];
  }

  planCleaner(n) {
    let best = null;
    let most = 0;
    for (const e of ENCLOSURES) {
      if (!this.encOpen(e.id)) continue;
      const c = this.enc[e.id].dirt.length;
      if (c > most) {
        most = c;
        best = e;
      }
    }
    if (!best) return;
    const st = this.enc[best.id];
    const gp = gatePoints(best);
    const piles = st.dirt.slice(0, 3);
    n.steps = [...this.serviceRoute(n, best, [])];
    for (const d of piles) {
      n.steps.push({ pts: [{ x: d.x - 0.7, z: d.z }] });
      n.steps.push({ wait: 1.5, face: d, fn: () => { st.dirt = st.dirt.filter((q) => q !== d); this.emit("staff", { role: "cleaner", x: d.x, z: d.z }); } });
    }
    n.steps.push({ pts: [gp.inside, gp.outside, { x: NODES[n.node].x, z: NODES[n.node].z }] });
  }

  /* ---------------------------------------------------------- days, missions */
  endDay() {
    const report = { day: this.day, ...this.today, wages: 0, quit: [] };
    for (const [role, s] of Object.entries(STAFF)) {
      if (!this.staff[role]) continue;
      // staff never quit — if money is short they simply work for free that day
      if (this.money >= s.wage) {
        this.money -= s.wage;
        report.wages += s.wage;
      }
    }
    report.income = report.tickets + report.tips + report.shop + report.snacks;
    this.day++;
    this.today = this.blankDay();
    this.newDaily();
    this.emit("day", report);
  }

  newDaily() {
    const pool = [...DAILY_POOL];
    const tasks = [];
    while (tasks.length < 3 && pool.length) {
      const t = pool.splice(Math.floor(this.R() * pool.length), 1)[0];
      const goal = Math.round(t.min + this.R() * (t.max - t.min) + (t.type === "visitors" ? Math.min(20, this.day * 2) : 0));
      tasks.push({ type: t.type, goal, reward: t.reward + Math.min(150, (this.day - 1) * 15), done: false });
    }
    this.daily = { tasks, base: { ...this.stats } };
  }

  dailyProgress(t) {
    return Math.min(t.goal, this.stats[t.type] - (this.daily.base[t.type] || 0));
  }

  checkDaily() {
    for (const t of this.daily.tasks) {
      if (t.done || this.dailyProgress(t) < t.goal) continue;
      t.done = true;
      this.earn(t.reward, "rewards");
      this.emit("daily", { msg: `Daily task done: ${DAILY_POOL.find((p) => p.type === t.type).text(t.goal)}`, reward: t.reward });
    }
  }

  missionProgress(i = this.mission) {
    const m = MISSIONS[i];
    if (!m) return null;
    let cur;
    if (m.stat === "sat") cur = this.satN >= 5 ? Math.round(this.sat * 100) : Math.min(79, Math.round(this.sat * 100));
    else if (m.stat === "lion") cur = this.enc.lion.built ? 1 : 0;
    else if (m.stat === "valley") cur = this.zones.valley ? 1 : 0;
    else cur = this.stats[m.stat] - (m.delta ? this.missionBase[m.stat] || 0 : 0);
    return { cur: Math.min(cur, m.goal), goal: m.goal, done: cur >= m.goal };
  }

  checkMissions() {
    let guard = 0;
    while (this.mission < MISSIONS.length && guard++ < MISSIONS.length) {
      const pr = this.missionProgress();
      if (!pr.done) break;
      const m = MISSIONS[this.mission];
      this.earn(m.reward, "rewards");
      this.mission++;
      this.missionBase = { ...this.stats };
      this.emit("mission", { msg: m.text, reward: m.reward, index: this.mission, all: this.mission >= MISSIONS.length });
    }
  }
}

export function moodWord(a) {
  if (a.hunger < 0.3) return "hungry";
  if (a.thirst < 0.3) return "thirsty";
  if (a.state === "rest") return "resting";
  if (a.state === "eat") return "eating";
  if (a.state === "drink") return "drinking";
  if (a.happy > 0.8) return "very happy";
  if (a.happy > 0.6) return "content";
  return "unhappy";
}

/** Reads + validates a save from localStorage; null if absent/corrupt. */
export function readSave(storage, key) {
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const s = JSON.parse(raw);
    new Zoo(s, { seed: 1 }); // throws on unusable data
    return s;
  } catch {
    return null;
  }
}
