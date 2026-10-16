/**
 * Wild Kingdom 3D — the simulation. Pure logic (no Three.js): the player
 * animal's movement / flight, survival meters, combat, special abilities,
 * territories, family, objectives, XP, the day/night clock and weather.
 * Wildlife and companion behaviour lives in ai.js and runs on the same Sim.
 *
 * The React component feeds `step(input, dt)` with a per-frame input object;
 * the renderer reads `player`, `ents`, `fx` and the clock/weather; UI reacts
 * to `events`. Headless tests drive exactly the same code.
 *
 * Conventions: yaw 0 faces +Z, forward = (sin yaw, cos yaw). Camera-relative
 * movement uses the camera yaw from the input.
 */
import { getTerrain, getScatter, getColliders, biomeAt, biomeWeights, caveAt, HALF, WATER, LANDMARKS, CAVES, clamp } from "./terrain.js";
import { SPECIES, WILD, TERRITORIES, MISSIONS, UPGRADES, MAX_RANK, MAX_LEVEL, BERRY_FOOD, NAMES, xpToNext, pointsForLevel, upgradeCost } from "./data.js";
import { updateEntities, spawnTick, makeEntity, isThreat, syncFamily, placeFamilyNear } from "./ai.js";

export const DAY_LEN = 600; // real seconds per in-game day
export const SLEEP_TIME_SCALE = 12; // the clock runs this much faster while resting
const G = 22;
const TAU = Math.PI * 2;
export const wrapA = (a) => {
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
};
export const angTo = (from, to) => wrapA(to - from);
export function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 0 = midnight, 0.25 = sunrise, 0.5 = noon, 0.75 = sunset. */
export const isNightTime = (t) => t < 0.22 || t > 0.79;
export function daylight(t) {
  return clamp(Math.sin((t - 0.25) * TAU) * 1.6 + 0.35, 0, 1);
}

const WEATHERS = ["clear", "rain", "fog", "storm"];
const WEATHER_P = { clear: 0.46, rain: 0.22, fog: 0.17, storm: 0.15 };

export class Sim {
  /**
   * @param {object} o
   *  species, save (whole validated save; this animal's record is mutated in place),
   *  seed, fresh (true = ignore stored position/meters: Restart / new session)
   */
  constructor({ species, save, seed = 1, fresh = false }) {
    this.species = species;
    this.def = SPECIES[species];
    this.save = save;
    this.A = save.animals[species];
    this.terrain = getTerrain();
    this.scatter = getScatter(this.terrain);
    this.colliders = getColliders(this.terrain);
    this.rng = mulberry32(seed);
    this.t = 0;
    this.time = save.world.time;
    this.day = save.world.day;
    this.weather = { cur: save.world.weather, prev: save.world.weather, blend: 1, timer: 90 + this.rng() * 120, rain: 0, fog: 0, storm: 0, wind: 0.3, flashT: 0, nextBolt: 8 };
    this.applyWeatherLevels(1);
    this.ents = [];
    this.nextId = 1;
    this.events = [];
    this.fx = [];
    this.berries = new Map(); // scatter index → seconds until regrown
    this.berryIdx = [];
    this.scatter.forEach((it, i) => {
      if (it.t === "berry") this.berryIdx.push(i);
    });
    this.terr = null; // territory the player is in
    this.rivals = new Map(); // territory id → rival entity
    this.intruder = null;
    this.intruderTimer = 150;
    this.recruit = null;
    this.recruitTimer = 25;
    this.spawnTimer = 0;
    this.slowTimer = 0;
    this.patrolDay = {}; // territory id → day last patrol bonus
    this.mstate = { holdT: 0, holdKind: null };
    this.target = null;
    this.prompt = null;
    this.paused = false;
    this.recalc();
    this.spawnPlayer(fresh);
    syncFamily(this, true);
    for (let i = 0; i < 14; i++) spawnTick(this, 1, true);
  }

  rand() {
    return this.rng();
  }
  emit(type, data = {}) {
    this.events.push({ ...data, type });
  }
  addFx(type, x, y, z, o = {}) {
    this.fx.push({ type, x, y, z, ...o });
  }

  /* ---------------------------------------------------------------- derived stats */
  recalc() {
    const A = this.A;
    const d = this.def;
    const up = A.up;
    const lv = A.level - 1;
    const perk = (id) => A.perks.includes(id);
    const k = {
      maxHp: d.base.hp * (1 + 0.1 * up.health) * (1 + 0.02 * lv),
      dmgMul: (1 + 0.08 * up.attack) * (1 + 0.02 * lv),
      speedMul: 1 + 0.03 * up.speed,
      maxStamina: d.base.stamina * (1 + 0.1 * up.stamina),
      stRegen: d.base.regen * (1 + 0.06 * up.stamina),
      detectMul: (1 - 0.06 * up.hunting) * (perk("shadowPelt") ? 0.75 : 1),
      foodMul: 1 + 0.08 * up.hunting,
      preyDmgMul: 1 + 0.05 * up.hunting,
      cdMul: 1 - 0.06 * up.special,
      eff: 1 + 0.1 * up.special,
      taken: perk("thickMane") ? 0.85 : perk("thickHide") ? 0.8 : 1,
      sprintCost: d.base.sprintCost * (perk("tireless") ? 0.7 : 1),
      jumpMul: perk("lightFeet") ? 1.15 : 1,
      stalkMul: perk("silentPaws") ? 1.4 : 1,
      power: d.power * (1 + 0.04 * lv),
    };
    this.k = k;
    const p = this.player;
    if (p) {
      const hpF = p.hp / p.maxHp;
      const stF = p.stamina / p.maxStamina;
      p.maxHp = k.maxHp;
      p.hp = hpF * k.maxHp;
      p.maxStamina = k.maxStamina;
      p.stamina = stF * k.maxStamina;
    }
    return k;
  }
  hasPerk(id) {
    return this.A.perks.includes(id);
  }

  /* ---------------------------------------------------------------- spawn / respawn */
  spawnPoint() {
    // nearest owned territory to the home, else the species home
    const owned = this.A.owned.map((id) => TERRITORIES.find((t) => t.id === id)).filter(Boolean);
    const h = this.def.home;
    if (owned.length) {
      owned.sort((a, b) => Math.hypot(a.x - h.x, a.z - h.z) - Math.hypot(b.x - h.x, b.z - h.z));
      return { x: owned[0].x + 6, z: owned[0].z + 6 };
    }
    return { x: h.x, z: h.z };
  }
  findDry(x, z) {
    const T = this.terrain;
    for (let r = 0; r < 60; r += 3) {
      for (let a = 0; a < 8; a++) {
        const xx = x + Math.cos(a * 0.785) * r;
        const zz = z + Math.sin(a * 0.785) * r;
        if (T.height(xx, zz) > 0.5 && T.normal(xx, zz).y > 0.82 && !this.blocked(xx, zz, 1.2)) return { x: xx, z: zz };
      }
    }
    return { x, z };
  }
  /** A flat, open spot near (x, z) with nothing within `r` metres (menu previews). */
  findClearing(x, z, r = 9) {
    const T = this.terrain;
    for (let d = 0; d < 160; d += 6) {
      for (let a = 0; a < 12; a++) {
        const xx = x + Math.cos(a * 0.524) * d;
        const zz = z + Math.sin(a * 0.524) * d;
        if (T.height(xx, zz) > 0.8 && T.normal(xx, zz).y > 0.9 && !this.blocked(xx, zz, r)) return { x: xx, z: zz };
      }
    }
    return this.findDry(x, z);
  }
  blocked(x, z, r) {
    let hit = false;
    this.colliders.query(x, z, r + 3, (c) => {
      if ((c.x - x) ** 2 + (c.z - z) ** 2 < (c.r + r) ** 2) hit = true;
    });
    return hit;
  }
  spawnPlayer(fresh) {
    const A = this.A;
    let pos = !fresh && A.pos ? { x: A.pos.x, z: A.pos.z } : this.spawnPoint();
    pos = this.findDry(pos.x, pos.z);
    const k = this.k;
    const m = !fresh && A.meters ? A.meters : null;
    const y = this.terrain.height(pos.x, pos.z);
    this.player = {
      x: pos.x,
      y,
      z: pos.z,
      vy: 0,
      yaw: !fresh && A.pos ? A.pos.yaw : 0,
      speed: 0,
      mode: "ground", // ground | swim | air
      onGround: true,
      hp: (m ? m.hp : 1) * k.maxHp,
      maxHp: k.maxHp,
      hunger: m ? m.hunger : 85,
      thirst: m ? m.thirst : 85,
      stamina: (m ? m.stamina : 1) * k.maxStamina,
      maxStamina: k.maxStamina,
      exhausted: false,
      sprinting: false,
      stalking: false,
      sleeping: false,
      sleepT: 0,
      eating: null,
      drinking: false,
      attack: null,
      cd: { primary: 0, secondary: 0, special: 0 },
      buff: { howl: 0, dash: 0, ambush: 0, roar: 0 },
      dead: false,
      deathT: 0,
      hurtT: 0,
      invulnT: 1.5,
      combatT: 99,
      lastHit: null,
      lastHitT: 99,
      enc: null,
      stealth: 1,
      vis: 1,
      carry: null,
      fallV: 0,
      flight: { pitch: 0, bank: 0, flap: 0, flapping: false, dive: null, takeoff: 0, glide: 0 },
      anim: { phase: 0, spd: 0, turn: 0, atk: 0, atkKind: null, hurt: 0, lie: 0, head: 0, eat: 0, howl: 0, jump: 0 },
      biome: biomeAt(pos.x, pos.z),
      inCave: null,
      inWater: false,
    };
    if (this.species === "eagle") this.player.flight.perched = true;
  }

  respawn() {
    const p = this.player;
    const A = this.A;
    const sp = this.findDry(...Object.values(this.spawnPoint()));
    const keepStats = { hunger: 60, thirst: 60 };
    A.xp = Math.max(0, A.xp - xpToNext(A.level) * 0.1);
    Object.assign(p, {
      x: sp.x,
      z: sp.z,
      y: this.terrain.height(sp.x, sp.z),
      vy: 0,
      speed: 0,
      mode: "ground",
      onGround: true,
      hp: this.k.maxHp * 0.7,
      stamina: this.k.maxStamina,
      exhausted: false,
      dead: false,
      sleeping: false,
      eating: null,
      drinking: false,
      attack: null,
      invulnT: 4,
      combatT: 99,
      enc: null,
      carry: null,
      ...keepStats,
    });
    p.flight.dive = null;
    p.flight.perched = true;
    p.anim.lie = 0;
    // hostiles lose interest
    for (const e of this.ents) if (e.target === "player") e.target = null;
    placeFamilyNear(this);
    this.emit("respawn");
  }

  /* ---------------------------------------------------------------- the clock & weather */
  isNight() {
    return isNightTime(this.time);
  }
  applyWeatherLevels(b) {
    const W = this.weather;
    const lv = (w) => ({ clear: [0, 0, 0, 0.25], rain: [1, 0.25, 0, 0.55], fog: [0, 1, 0, 0.15], storm: [1, 0.45, 1, 1] })[w];
    const a = lv(W.prev);
    const c = lv(W.cur);
    W.rain = a[0] + (c[0] - a[0]) * b;
    W.fog = a[1] + (c[1] - a[1]) * b;
    W.storm = a[2] + (c[2] - a[2]) * b;
    W.wind = a[3] + (c[3] - a[3]) * b;
  }
  setWeather(w) {
    const W = this.weather;
    if (!WEATHERS.includes(w) || w === W.cur) return;
    W.prev = W.cur;
    W.cur = w;
    W.blend = 0;
    W.timer = 120 + this.rand() * 200;
    this.emit("weather", { weather: w });
  }
  stepClock(dt) {
    const p = this.player;
    const scale = p.sleeping ? SLEEP_TIME_SCALE : 1;
    const before = this.time;
    this.time += (dt * scale) / DAY_LEN;
    if (this.time >= 1) {
      this.time -= 1;
      this.day++;
      if (!p.dead) {
        this.bump("days");
        this.addXp(60, "Survived another day");
      }
      this.emit("newDay", { day: this.day });
      // nest upkeep
      if (this.A.nest) this.A.nest.cond = Math.max(0, this.A.nest.cond - 50);
    }
    if (before < 0.25 && this.time >= 0.25) this.emit("dawn");
    if (before < 0.79 && this.time >= 0.79) this.emit("dusk");
    // weather
    const W = this.weather;
    W.timer -= dt * (p.sleeping ? 4 : 1);
    if (W.timer <= 0) {
      let r = this.rand();
      let pick = "clear";
      for (const w of WEATHERS) {
        r -= WEATHER_P[w];
        if (r <= 0) {
          pick = w;
          break;
        }
      }
      if (pick === W.cur) W.timer = 80 + this.rand() * 120;
      else this.setWeather(pick);
    }
    if (W.blend < 1) {
      W.blend = Math.min(1, W.blend + dt / 18);
      this.applyWeatherLevels(W.blend);
    }
    W.flashT = Math.max(0, W.flashT - dt);
    if (W.storm > 0.6) {
      W.nextBolt -= dt;
      if (W.nextBolt <= 0) {
        W.nextBolt = 5 + this.rand() * 12;
        W.flashT = 0.35;
        const a = this.rand() * TAU;
        const d = 120 + this.rand() * 300;
        this.emit("thunder", { dist: d });
        this.addFx("bolt", p.x + Math.cos(a) * d, 0, p.z + Math.sin(a) * d);
      }
    }
  }

  /* ---------------------------------------------------------------- progression */
  bump(key, n = 1) {
    const s = this.A.stats;
    s[key] = (s[key] || 0) + n;
  }
  setMax(key, v) {
    const s = this.A.stats;
    if (!(s[key] >= v)) s[key] = v;
  }
  addXp(n, why = "") {
    const A = this.A;
    if (n <= 0) return;
    n = Math.round(n);
    if (A.level >= MAX_LEVEL) {
      this.emit("xp", { n, why });
      return;
    }
    A.xp += n;
    this.emit("xp", { n, why });
    while (A.level < MAX_LEVEL && A.xp >= xpToNext(A.level)) {
      A.xp -= xpToNext(A.level);
      A.level++;
      A.sp += pointsForLevel(A.level);
      const perk = this.def.perks.find((pk) => pk.lvl === A.level);
      if (perk && !A.perks.includes(perk.id)) A.perks.push(perk.id);
      this.recalc();
      const p = this.player;
      p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.3);
      this.emit("levelUp", { level: A.level, sp: A.sp, perk: perk ? perk.name : null });
      this.addFx("levelup", p.x, p.y, p.z);
    }
    if (A.level >= MAX_LEVEL) A.xp = 0;
    this.setMax("level", A.level);
  }
  buyUpgrade(id) {
    const A = this.A;
    if (!UPGRADES.find((u) => u.id === id)) return false;
    const r = A.up[id];
    if (r >= MAX_RANK) return false;
    const c = upgradeCost(r);
    if (A.sp < c) return false;
    A.sp -= c;
    A.up[id] = r + 1;
    this.bump("upgrades");
    this.recalc();
    this.emit("upgrade", { id, rank: r + 1 });
    return true;
  }
  missionProgress(m) {
    const s = this.A.stats;
    if (m.stat === "level") return Math.min(m.need, this.A.level);
    return Math.min(m.need, s[m.stat] || 0);
  }
  checkMissions() {
    const A = this.A;
    for (const m of MISSIONS[this.species]) {
      if (A.missions.includes(m.id)) continue;
      if (this.missionProgress(m) >= m.need) {
        A.missions.push(m.id);
        this.emit("mission", { id: m.id, title: m.title, xp: m.xp });
        this.addXp(m.xp, `Objective: ${m.title}`);
      }
    }
  }
  /** The first unfinished objective (the HUD's current objective). */
  objective() {
    const list = MISSIONS[this.species];
    const m = list.find((x) => !this.A.missions.includes(x.id));
    if (!m) return null;
    return { ...m, have: this.missionProgress(m), index: list.indexOf(m) + 1, total: list.length, loc: this.missionLocation(m) };
  }
  /** World position an objective points at (for the compass & map), if any. */
  missionLocation(m) {
    const p = this.player;
    const st = m.stat;
    if (st.startsWith("landmark:")) {
      const L = LANDMARKS.find((l) => l.id === st.slice(9));
      return L ? { x: L.x, z: L.z, label: L.name } : null;
    }
    if (st.startsWith("biome:")) {
      const b = st.slice(6);
      const spots = { forest: [-420, 100], meadow: [-110, 250], mountain: [0, -480], savanna: [420, 250], grass: [60, -60] };
      const s = spots[b];
      return s ? { x: s[0], z: s[1], label: b } : null;
    }
    if (st === "drink") {
      let best = null;
      let bd = Infinity;
      for (let a = 0; a < 24; a++) {
        for (const r of [20, 60, 120, 200, 320]) {
          const x = p.x + Math.cos((a / 24) * TAU) * r;
          const z = p.z + Math.sin((a / 24) * TAU) * r;
          if (this.terrain.height(x, z) < -0.4 && r < bd) {
            bd = r;
            best = { x, z, label: "Water" };
          }
        }
      }
      return best;
    }
    if (st === "cave" || st === "caveSleep") {
      const c = [...CAVES].sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0];
      return { x: c.x, z: c.z, label: c.name };
    }
    if (st === "territoryClaimed" || st === "killRival" || st === "territoryFound") {
      const cand = TERRITORIES.filter((t) => t.species.includes(this.species) && !this.A.owned.includes(t.id) && (st !== "territoryFound" || !this.A.found.includes(t.id)));
      cand.sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z));
      return cand[0] ? { x: cand[0].x, z: cand[0].z, label: cand[0].name } : null;
    }
    if ((st === "companions" || st === "mate") && this.recruit && !this.recruit.dead) return { x: this.recruit.x, z: this.recruit.z, label: "♥" };
    if (st === "cubs" || st === "nestFed") {
      const t = TERRITORIES.find((x) => this.A.owned.includes(x.id));
      return t ? { x: t.x, z: t.z, label: t.name } : null;
    }
    return null;
  }

  /* ---------------------------------------------------------------- territories */
  territoryAt(x, z) {
    for (const t of TERRITORIES) if ((x - t.x) ** 2 + (z - t.z) ** 2 < t.r * t.r) return t;
    return null;
  }
  ownedAt(x, z) {
    const t = this.territoryAt(x, z);
    return t && this.A.owned.includes(t.id) ? t : null;
  }
  canClaim(t) {
    return !!t && t.species.includes(this.species) && !this.A.owned.includes(t.id) && this.A.rivalsBeaten.includes(t.id);
  }
  claim(t) {
    const A = this.A;
    if (A.owned.includes(t.id)) return;
    A.owned.push(t.id);
    if (!A.found.includes(t.id)) A.found.push(t.id);
    this.bump("territoryClaimed");
    if (this.species === "eagle" && !A.nest) A.nest = { t: t.id, cond: 100 };
    this.emit("claim", { id: t.id, name: t.name });
    this.addXp(150 + 50 * t.tier, `Claimed ${t.name}`);
    this.addFx("claim", t.x, this.terrain.surface(t.x, t.z), t.z);
  }
  loseTerritory(t) {
    const A = this.A;
    A.owned = A.owned.filter((id) => id !== t.id);
    A.rivalsBeaten = A.rivalsBeaten.filter((id) => id !== t.id);
    if (A.nest && A.nest.t === t.id) A.nest = null;
    this.emit("territoryLost", { name: t.name });
  }
  stepTerritory(dt) {
    const p = this.player;
    const A = this.A;
    const t = this.territoryAt(p.x, p.z);
    if (t !== this.terr) {
      this.terr = t;
      if (t) {
        const owned = A.owned.includes(t.id);
        this.emit("enterTerritory", { id: t.id, name: t.name, owned, claimable: t.species.includes(this.species) });
        if (!A.found.includes(t.id)) {
          A.found.push(t.id);
          this.bump("territoryFound");
          this.addXp(30, `Discovered ${t.name}`);
        }
        if (owned && this.patrolDay[t.id] !== this.day) {
          this.patrolDay[t.id] = this.day;
          this.addXp(25 + 10 * t.tier, `Patrolled ${t.name}`);
        }
      }
    }
    // rival alphas guard unclaimed territories you could claim
    for (const T of TERRITORIES) {
      const d = Math.hypot(p.x - T.x, p.z - T.z);
      const want = T.species.includes(this.species) && !A.owned.includes(T.id) && !A.rivalsBeaten.includes(T.id) && d < T.r + 140;
      const r = this.rivals.get(T.id);
      if (want && (!r || r.gone)) {
        const pos = this.findDry(T.x + 8, T.z - 6);
        const e = makeEntity(this, this.species, pos.x, pos.z, { role: "rival", terr: T.id, tier: T.tier });
        this.ents.push(e);
        this.rivals.set(T.id, e);
      } else if (!want && r && !r.dead && d > T.r + 220) {
        r.gone = true;
        this.rivals.delete(T.id);
      }
    }
    // intruders in owned territory
    if (t && A.owned.includes(t.id) && !p.sleeping && !p.dead) {
      this.intruderTimer -= dt;
      if (this.intruderTimer <= 0 && !this.intruder) {
        this.intruderTimer = 150 + this.rand() * 150;
        const types = { forest: ["wolf", "bear", "tiger"], meadow: ["wolf", "fox"], grass: ["wolf", "fox"], savanna: ["lion"], mountain: ["wolf", "bear", "eagle"] }[t.biome] || ["wolf"];
        let ty = types[Math.floor(this.rand() * types.length)];
        if (this.species === "eagle") ty = "eagle";
        if (this.species === "fox" && (ty === "bear" || ty === "tiger" || ty === "lion")) ty = "fox";
        const a = this.rand() * TAU;
        const pos = this.findDry(t.x + Math.cos(a) * t.r * 0.95, t.z + Math.sin(a) * t.r * 0.95);
        const e = makeEntity(this, ty, pos.x, pos.z, { role: "intruder", terr: t.id, tier: t.tier });
        this.ents.push(e);
        this.intruder = e;
        this.emit("intruder", { name: WILD[ty].name, terr: t.name });
      }
    }
    if (this.intruder) {
      const e = this.intruder;
      if (e.dead || e.gone) {
        if (e.dead && e.killedBy === "player-side") {
          this.bump("defendTerritory");
          this.addXp(80, "Defended your territory");
        }
        this.intruder = null;
      } else {
        const T = TERRITORIES.find((x) => x.id === e.terr);
        if (Math.hypot(e.x - T.x, e.z - T.z) < 8) {
          e.occupy = (e.occupy || 0) + dt;
          if (e.occupy > 45 && A.owned.includes(T.id)) {
            this.loseTerritory(T);
            e.role = "wild";
            this.intruder = null;
          }
        }
        if (e.fleeing && Math.hypot(e.x - T.x, e.z - T.z) > T.r + 25) {
          // driven off
          this.bump("defendTerritory");
          this.addXp(60, "Drove off an intruder");
          e.role = "wild";
          this.intruder = null;
        }
      }
    }
  }

  /* ---------------------------------------------------------------- damage */
  /** Apply damage to the player (from an entity or the environment). */
  hurtPlayer(amount, src = null, o = {}) {
    const p = this.player;
    if (p.dead || p.invulnT > 0) return 0;
    let dmg = amount * this.k.taken;
    if (src && src.weakT > 0) dmg *= 0.6;
    p.hp -= dmg;
    p.hurtT = 0.35;
    p.anim.hurt = 1;
    if (p.sleeping) this.wake();
    p.eating = null;
    p.drinking = false;
    if (src) {
      p.combatT = 0;
      if (src.def && (src.def.kind === "predator" || src.def.kind === "neutral")) {
        if (!p.enc) p.enc = { t: 0 };
        p.enc.t = 0;
      }
      if (o.knock) {
        const dx = p.x - src.x;
        const dz = p.z - src.z;
        const d = Math.hypot(dx, dz) || 1;
        p.kx = (dx / d) * o.knock;
        p.kz = (dz / d) * o.knock;
      }
    }
    this.emit("hurt", { dmg, src: src ? src.type : o.cause || "env" });
    this.addFx("blood", p.x, p.y + this.def.size.h * 0.6, p.z);
    if (p.hp <= 0) this.die(o.cause || (src ? `Killed by ${src.name}` : "Died"));
    return dmg;
  }
  die(cause) {
    const p = this.player;
    if (p.dead) return;
    p.hp = 0;
    p.dead = true;
    p.deathT = 0;
    p.sleeping = false;
    p.attack = null;
    p.flight.dive = null;
    this.A.deaths++;
    this.emit("death", { cause });
  }
  wake() {
    const p = this.player;
    if (!p.sleeping) return;
    p.sleeping = false;
    this.emit("wake");
  }

  /** Damage an entity. src: "player" or an entity. Returns true if it died. */
  hurtEnt(e, dmg, src, o = {}) {
    if (e.dead) return false;
    e.hp -= dmg;
    e.hurtT = 0.35;
    e.anim.hurt = 1;
    e.sleeping = false;
    if (o.stun) e.stun = Math.max(e.stun || 0, o.stun);
    const sx = src === "player" ? this.player.x : src.x;
    const sz = src === "player" ? this.player.z : src.z;
    if (o.knock) {
      const dx = e.x - sx;
      const dz = e.z - sz;
      const d = Math.hypot(dx, dz) || 1;
      const m = Math.max(0.35, Math.min(1.6, 60 / (e.def.mass + 20)));
      e.kx = (dx / d) * o.knock * m;
      e.kz = (dz / d) * o.knock * m;
      if (e.flying) e.vy = (e.vy || 0) - 2;
    }
    this.addFx("blood", e.x, e.y + e.h * 0.6, e.z, { s: e.def.size === "small" ? 0.5 : 1 });
    e.lastAttacker = src;
    e.alert = 2;
    if (e.hp <= 0) {
      this.killEnt(e, src, o);
      return true;
    }
    // reactions
    if (e.role === "companion") return false;
    if (src === "player" || (src && src.role === "companion")) {
      const k = e.def.kind;
      if (k === "prey") {
        e.state = "flee";
        e.fleeFrom = src === "player" ? "player" : src;
        e.stateT = 8;
        if (e.def.kick && src === "player") e.kickReady = true;
      } else if (e.role === "rival" || e.role === "intruder" || (e.power || 0) >= this.k.power * 0.6) {
        e.target = src === "player" ? "player" : src;
        e.state = "fight";
        e.stateT = 20;
      } else {
        e.state = "flee";
        e.fleeFrom = src === "player" ? "player" : src;
        e.stateT = 8;
      }
    }
    return false;
  }
  killEnt(e, src, o = {}) {
    e.dead = true;
    e.hp = 0;
    e.deathT = 0;
    e.state = "dead";
    e.killedBy = src === "player" || (src && src.role === "companion") ? "player-side" : "wild";
    const def = e.def;
    const p = this.player;
    if (def.kind === "prey") {
      e.meat = def.meat * (e.scale || 1);
      e.maxMeat = e.meat;
    } else e.meat = 0;
    if (e.role === "companion") {
      this.emit("familyLost", { name: e.name });
      const A = this.A;
      A.family = A.family.filter((f) => f.id !== e.famId);
      return;
    }
    if (e.killedBy !== "player-side") return;
    const night = this.isNight();
    if (def.kind === "prey") {
      this.bump("killPrey");
      this.bump(`kill:${e.type}`);
      if (night) this.bump("nightKills");
      if (this.weather.rain > 0.5) this.bump("rainKills");
      if (o.stealth) this.bump("stealthKills");
      if (o.dash) this.bump("dashKills");
      if (o.dive) this.bump("diveKills");
      let xp = def.xp;
      this.addXp(xp, `${def.name} hunted`);
      // eagles carry small kills
      if (this.species === "eagle" && src === "player" && def.size === "small" && !p.carry && p.mode === "air") {
        p.carry = { type: e.type, meat: e.meat };
        e.gone = true;
        this.emit("carry", { name: def.name });
      }
    } else {
      this.bump("killPredator");
      this.bump(`kill:${e.type}`);
      if (night) this.bump("nightKills");
      let xp = def.xp * (e.role === "rival" ? 2 + e.tier * 0.5 : 1);
      if (e.role === "rival") {
        this.bump("killRival");
        if (!this.A.rivalsBeaten.includes(e.terr)) this.A.rivalsBeaten.push(e.terr);
        const T = TERRITORIES.find((t) => t.id === e.terr);
        this.emit("rivalDown", { name: e.name, terr: T.name, how: this.def.claim.text });
      }
      if (e.harmedFamily) this.bump("defendFamily");
      this.addXp(xp, `${e.name} defeated`);
    }
    // the encounter ends well
    if (p.enc && !this.ents.some((x) => !x.dead && x.target === "player" && x !== e)) {
      this.bump("survivePredator");
      p.enc = null;
    }
  }

  /* ---------------------------------------------------------------- player combat */
  attackDef(kind) {
    const d = this.def;
    if (kind === "heavy") {
      const a = d.attacks.primary;
      const unst = this.hasPerk("unstoppable");
      return { ...a, name: "Heavy Strike", dmg: a.dmg * 2.4 * this.k.eff, range: 2.3, arc: 1.6, cd: 0, cost: 0, windup: 0.45, dur: 0.95, knock: 12, lunge: 3, stun: unst ? 2.2 : 1.2, multi: true, heavy: true };
    }
    return d.attacks[kind];
  }
  startAttack(kind) {
    const p = this.player;
    if (p.dead || p.attack || p.sleeping) return false;
    if (p.eating || p.drinking) {
      p.eating = null;
      p.drinking = false;
    }
    if (this.species === "eagle" && p.flight.dive) return false;
    const a = this.attackDef(kind);
    let mult = 1;
    if (kind !== "heavy") {
      if (p.cd[kind] > 0) return false;
      if (p.stamina < a.cost) {
        // a tired animal can still snap with its primary attack — weaker and slower
        if (kind !== "primary") {
          this.emit("tired");
          return false;
        }
        mult = 0.7;
        p.cd[kind] = a.cd * 1.5;
        p.stamina = 0;
      } else {
        p.stamina -= a.cost;
        p.cd[kind] = a.cd;
      }
    }
    const fx = {};
    if (p.buff.ambush > 0) {
      fx.ambush = true;
      p.buff.ambush = 0;
    }
    if (p.buff.dash > 0) fx.dash = true;
    p.attack = { kind, def: a, t: 0, done: false, mult, fx };
    p.anim.atkKind = kind;
    if (a.leap && p.onGround) {
      p.vy = a.leap;
      p.onGround = false;
    }
    this.emit("attack", { kind, name: a.name });
    return true;
  }
  /** Resolve an attack's hit frame: distance, facing arc and height. */
  resolveHit(at) {
    const p = this.player;
    const a = at.def;
    const fx = Math.sin(p.yaw);
    const fz = Math.cos(p.yaw);
    const reach = this.def.size.r + a.range + (at.fx.ambush ? 0.8 : 0);
    const hits = [];
    for (const e of this.ents) {
      if (e.dead || e.gone || e.role === "companion" || e.role === "home") continue;
      const dx = e.x - p.x;
      const dz = e.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d > reach + e.r) continue;
      const dy = e.y + e.h * 0.5 - (p.y + this.def.size.h * 0.5);
      if (Math.abs(dy) > 1.6 + e.h * 0.5 + (p.mode === "air" ? 0.8 : 0)) continue;
      const ang = Math.abs(angTo(p.yaw, Math.atan2(dx, dz)));
      if (d > e.r + 0.4 && ang > a.arc) continue;
      hits.push({ e, d });
    }
    if (!hits.length) {
      this.emit("whiff");
      return 0;
    }
    hits.sort((x, y) => x.d - y.d);
    const list = a.multi ? hits : [hits[0]];
    let n = 0;
    for (const { e } of list) {
      const unaware = e.alert < 1 && e.target !== "player" && e.state !== "flee" && e.state !== "fight";
      let dmg = a.dmg * this.k.dmgMul * at.mult * (0.9 + this.rand() * 0.2);
      if (p.buff.howl > 0) dmg *= 1.15;
      if (this.hasPerk("packTactics")) {
        const near = this.ents.filter((c) => c.role === "companion" && !c.dead && !c.cub && Math.hypot(c.x - p.x, c.z - p.z) < 15).length;
        dmg *= 1 + 0.12 * Math.min(3, near);
      }
      const prey = e.def.kind === "prey";
      if (prey) dmg *= this.k.preyDmgMul;
      if (prey && e.def.size === "small" && this.hasPerk("swiftKill")) dmg *= 1.5;
      let stealth = false;
      if (at.fx.ambush) {
        dmg *= (unaware ? 3.4 : 2.6) * this.k.eff;
        stealth = true;
        if (prey && this.hasPerk("killingBite") && e.hp < e.maxHp * 0.5) dmg = e.hp + 1;
      } else if (this.species === "tiger" && unaware) {
        dmg *= 1.5;
        stealth = true;
      }
      if (at.fx.dash) dmg *= 1.3;
      if (p.mode === "swim") dmg *= 0.7;
      const died = this.hurtEnt(e, dmg, "player", { knock: a.knock, stun: a.stun, stealth, dash: !!at.fx.dash });
      if (a.heavy) this.bump("heavyKnock");
      this.emit("hit", { dmg, kind: at.kind, died, name: e.def.name, big: dmg > 30 });
      if (!died) {
        p.lastHit = e;
        p.lastHitT = 0;
      }
      n++;
    }
    p.combatT = 0;
    return n;
  }

  /* ---------------------------------------------------------------- specials */
  useSpecial() {
    const p = this.player;
    const S = this.def.special;
    if (p.dead || p.sleeping) return false;
    if (p.cd.special > 0) {
      this.emit("cooldown");
      return false;
    }
    let cost = S.cost * (S.id === "heavy" && this.hasPerk("unstoppable") ? 0.7 : 1);
    if (p.stamina < cost) {
      this.emit("tired");
      return false;
    }
    if (S.id === "dive" && (p.mode !== "air" || this.agl() < 5)) {
      this.emit("needAir");
      return false;
    }
    if (S.id === "heavy" && p.attack) return false;
    p.stamina -= cost;
    p.cd.special = S.cd * this.k.cdMul;
    p.eating = null;
    p.drinking = false;
    const eff = this.k.eff;
    const T = this.terr;
    this.bump("special");
    this.emit("special", { id: S.id });
    switch (S.id) {
      case "howl": {
        p.buff.howl = S.dur * eff;
        p.anim.howl = 1.6;
        let n = 0;
        for (const e of this.ents) {
          if (e.dead) continue;
          const d = Math.hypot(e.x - p.x, e.z - p.z);
          if (e.role === "companion" && d < S.radius * eff) {
            e.buffT = S.dur * eff;
            if (this.hasPerk("alphaHowl")) e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.25);
            n++;
          } else if (e.def.kind === "prey" && d < 30) {
            e.alert = 2;
          }
        }
        if (this.hasPerk("alphaHowl")) p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.25);
        if (n) this.bump("howlBuffed", n);
        this.addFx("ring", p.x, p.y + 0.5, p.z, { r: S.radius * eff, color: 0x9fd8ff });
        if (T && this.canClaim(T) && this.def.claim.how === "howl") this.claim(T);
        break;
      }
      case "roar": {
        p.anim.howl = 1.4;
        const R = S.radius * eff * (this.hasPerk("kingsRoar") ? 1.4 : 1);
        let n = 0;
        for (const e of this.ents) {
          if (e.dead || e.role === "companion") continue;
          const d = Math.hypot(e.x - p.x, e.z - p.z);
          if (d > R) continue;
          if (e.def.kind === "prey") {
            e.stun = Math.max(e.stun || 0, 1.6);
            e.state = "flee";
            e.fleeFrom = "player";
            e.stateT = 6;
            n++;
          } else if ((e.power || 1) < this.k.power * 1.15) {
            e.fearT = S.dur * eff;
            e.weakT = S.dur * eff;
            e.state = "flee";
            e.fleeFrom = "player";
            e.stateT = S.dur * eff;
            if (e.target === "player") e.target = null;
            if (this.hasPerk("kingsRoar")) e.stun = Math.max(e.stun || 0, 1.5);
            n++;
          }
        }
        if (n) this.bump("roarFlee", n);
        this.addFx("ring", p.x, p.y + 0.6, p.z, { r: R, color: 0xffc46a });
        if (T && this.canClaim(T) && this.def.claim.how === "roar") this.claim(T);
        break;
      }
      case "ambush":
        p.buff.ambush = S.dur * eff;
        p.stalking = true;
        this.addFx("ambush", p.x, p.y, p.z);
        break;
      case "heavy": {
        const a = this.attackDef("heavy");
        p.attack = { kind: "heavy", def: a, t: 0, done: false, mult: 1, fx: {} };
        p.anim.atkKind = "heavy";
        break;
      }
      case "dash":
        p.buff.dash = S.dur * eff;
        this.addFx("dash", p.x, p.y, p.z);
        if (this.hasPerk("trickster")) for (const e of this.ents) if (e.target === "player" && e.role !== "rival") e.target = null;
        break;
      case "dive": {
        const fl = p.flight;
        fl.dive = { t: 0, hit: false };
        fl.pitch = Math.min(fl.pitch, -0.5);
        this.addFx("dive", p.x, p.y, p.z);
        break;
      }
      default:
    }
    return true;
  }

  /* ---------------------------------------------------------------- interaction */
  agl() {
    const p = this.player;
    return p.y - this.terrain.surface(p.x, p.z);
  }
  findInteract() {
    const p = this.player;
    const A = this.A;
    const fam = this.def.family;
    const hx = p.x + Math.sin(p.yaw) * (this.def.size.len * 0.5);
    const hz = p.z + Math.cos(p.yaw) * (this.def.size.len * 0.5);
    const grounded = p.mode !== "air";
    // recruit / mate
    const r = this.recruit;
    if (r && !r.dead && !r.gone && Math.hypot(r.x - p.x, r.z - p.z) < 4.5 + this.def.size.r && (grounded || this.species === "eagle")) {
      return { kind: "recruit", e: r, text: fam.mate && !this.hasMate() ? `Court ${r.name} as your mate` : `Invite ${r.name} to your ${fam.label.toLowerCase()}` };
    }
    // territory marker (claim / nest repair)
    const T = this.terr;
    if (T && grounded && Math.hypot(T.x - p.x, T.z - p.z) < 5 + this.def.size.r) {
      if (this.canClaim(T) && (this.def.claim.how === "mark" || this.def.claim.how === "nest")) return { kind: "claim", t: T, hold: 2.5, text: this.def.claim.text.replace(" (hold E)", "") + " — hold E" };
      if (A.nest && A.nest.t === T.id && A.nest.cond < 95) return { kind: "nest", t: T, hold: 1.5, text: `Repair the nest (${Math.round(A.nest.cond)}%) — hold E` };
    }
    if (!grounded) return null;
    // carried prey (eagle)
    if (p.carry) return { kind: "eatCarry", text: `Eat the ${WILD[p.carry.type].name.toLowerCase()} you carry` };
    // carcass
    let best = null;
    let bd = Infinity;
    for (const e of this.ents) {
      if (!e.dead || !(e.meat > 0) || e.gone) continue;
      const d = Math.hypot(e.x - hx, e.z - hz) - e.r;
      if (d < 1.6 + this.def.size.r * 0.5 && d < bd && Math.abs(e.y - p.y) < 2.5) {
        bd = d;
        best = e;
      }
    }
    if (best) {
      const ok = this.def.diet.includes(best.def.size);
      return { kind: "eat", e: best, ok, text: ok ? `Eat ${best.def.name.toLowerCase()} (${Math.ceil(best.meat)} food)` : `A ${this.def.name.toLowerCase()} doesn't eat ${best.def.name.toLowerCase()}` };
    }
    // berries
    if (this.def.diet.includes("berry")) {
      for (const i of this.berryIdx) {
        const b = this.scatter[i];
        if (Math.abs(b.x - p.x) > 4 || Math.abs(b.z - p.z) > 4) continue;
        if (Math.hypot(b.x - hx, b.z - hz) < 1.5 + b.s && !this.berries.has(i)) return { kind: "berry", i, text: "Eat berries" };
      }
    }
    // water
    if (this.terrain.waterNear(hx, hz, 1.6) || p.mode === "swim") return { kind: "drink", text: "Drink" };
    return null;
  }
  hasMate() {
    return this.A.family.some((f) => f.role === "mate");
  }
  familyRoom() {
    const fam = this.def.family;
    const F = this.A.family;
    if (fam.kind === "pack" || fam.kind === "pride") {
      const cap = Math.min(fam.adultsMax, fam.adultsBase + Math.floor(this.A.level / 7));
      return F.filter((f) => f.role === "adult").length < cap;
    }
    return fam.mate && !F.some((f) => f.role === "mate");
  }
  interact(held, edge, dt) {
    const p = this.player;
    const it = this.findInteract();
    this.prompt = it;
    const ms = this.mstate;
    if (!it || !held || (it.hold == null && !edge)) {
      if (!held) {
        ms.holdT = 0;
        ms.holdKind = null;
      }
      if (!edge) return;
    }
    if (!it) return;
    if (it.hold != null) {
      if (!held) return;
      if (ms.holdKind !== it.kind) {
        ms.holdKind = it.kind;
        ms.holdT = 0;
      }
      ms.holdT += dt;
      p.anim.eat = 1;
      if (ms.holdT >= it.hold) {
        ms.holdT = 0;
        ms.holdKind = null;
        if (it.kind === "claim") {
          this.claim(it.t);
        } else if (it.kind === "nest") {
          const n = this.A.nest;
          n.cond = Math.min(100, n.cond + 40);
          p.stamina = Math.max(0, p.stamina - 10);
          this.bump("nestFed");
          this.emit("nestRepair", { cond: n.cond });
        }
      }
      return;
    }
    if (!edge) return;
    switch (it.kind) {
      case "recruit": {
        const e = it.e;
        const fam = this.def.family;
        if (fam.mate && !this.hasMate()) {
          if (this.A.level < 3) return this.emit("note", { text: "Reach level 3 before seeking a mate." });
          this.addFamily(e, "mate");
          this.setMax("mate", 1);
        } else if (this.familyRoom()) {
          this.addFamily(e, "adult");
        } else return this.emit("note", { text: `Your ${fam.label.toLowerCase()} is full — level up to lead more.` });
        this.recruit = null;
        break;
      }
      case "eatCarry": {
        const c = p.carry;
        p.carry = null;
        this.feed(c.meat, null);
        this.emit("eat", { name: WILD[c.type].name, amount: c.meat });
        break;
      }
      case "eat":
        if (!it.ok) return this.emit("note", { text: it.text });
        if (p.hunger >= 99) return this.emit("note", { text: "You're not hungry." });
        p.eating = it.e;
        p.drinking = false;
        this.emit("eatStart", { name: it.e.def.name });
        break;
      case "berry": {
        if (p.hunger >= 99) return this.emit("note", { text: "You're not hungry." });
        this.berries.set(it.i, 200);
        const f = this.hasPerk("forager") ? 1.5 : 1;
        this.feed(BERRY_FOOD * f, null);
        if (this.hasPerk("forager")) p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.05);
        this.bump("berries");
        this.emit("berries", { i: it.i });
        p.anim.eat = 1.2;
        break;
      }
      case "drink":
        if (p.thirst >= 99) return this.emit("note", { text: "You're not thirsty." });
        p.drinking = true;
        p.eating = null;
        this.bump("drink");
        this.emit("drinkStart");
        break;
      default:
    }
  }
  addFamily(e, role) {
    const A = this.A;
    const id = `f${Date.now() % 1e7}${Math.floor(this.rand() * 1000)}`;
    A.family.push({ id, role, name: e.name, growth: 1, hp: e.hp / e.maxHp, home: false });
    e.role = "companion";
    e.famId = id;
    e.famRole = role;
    e.target = null;
    e.state = "follow";
    e.marker = false;
    this.emit("joined", { name: e.name, role });
    this.addFx("heart", e.x, e.y + e.h + 0.6, e.z);
    this.addXp(role === "mate" ? 80 : 60, role === "mate" ? `${e.name} became your mate` : `${e.name} joined you`);
    this.updateCompanionStat();
  }
  updateCompanionStat() {
    const n = this.A.family.filter((f) => f.role !== "cub").length;
    this.setMax("companions", n);
  }
  /** Hunger gain from food; grows cubs/chicks nearby. */
  feed(amount, carcass) {
    const p = this.player;
    const add = amount * this.k.foodMul;
    const before = p.hunger;
    p.hunger = Math.min(100, p.hunger + add);
    const got = p.hunger - before;
    this.bump("eat", Math.max(0, got));
    // cubs that are close share the meal and grow
    const A = this.A;
    const nest = A.nest ? TERRITORIES.find((t) => t.id === A.nest.t) : null;
    for (const f of A.family) {
      if (f.role !== "cub") continue;
      let near = false;
      if (this.species === "eagle") near = nest && Math.hypot(nest.x - p.x, nest.z - p.z) < 28 && A.nest.cond > 20;
      else {
        const e = this.ents.find((x) => x.famId === f.id && !x.dead);
        near = !!e && Math.hypot(e.x - p.x, e.z - p.z) < 20;
      }
      if (!near) continue;
      f.growth = Math.min(1, f.growth + Math.max(got, amount * 0.5) / 160);
      if (f.growth >= 1) {
        f.role = "adult";
        this.bump("cubsRaised");
        this.emit("grownUp", { name: f.name });
        this.addXp(150, `${f.name} grew up`);
        const e = this.ents.find((x) => x.famId === f.id);
        if (e) {
          e.gone = true;
        }
        this.updateCompanionStat();
      }
    }
    return got;
  }
  tryBirth() {
    const A = this.A;
    const fam = this.def.family;
    if (!fam.cubs) return;
    const T = this.ownedAt(this.player.x, this.player.z);
    if (!T) return;
    if (this.species === "eagle" && (!A.nest || A.nest.t !== T.id)) return;
    if (A.level < 4) return;
    if (fam.mate && !A.family.some((f) => f.role === "mate" && !f.home)) return;
    const kids = A.family.filter((f) => f.role === "cub" || (f.role === "adult" && f.born)).length;
    if (kids >= fam.cubsMax) return;
    if (this.day - A.lastBirth < 1) return;
    A.lastBirth = this.day;
    const names = NAMES[this.species];
    const name = names[(A.family.length + 3) % names.length] + (this.species === "eagle" ? " (chick)" : " Jr.");
    A.family.push({ id: `c${Date.now() % 1e7}${Math.floor(this.rand() * 1000)}`, role: "cub", name, growth: 0, hp: 1, home: false, born: true });
    this.bump("cubs");
    this.emit("birth", { name });
    this.addXp(100, this.species === "eagle" ? "A chick hatched" : "Cubs were born");
    syncFamily(this, true);
  }

  /* ---------------------------------------------------------------- player step */
  stepPlayer(inp, dt) {
    const p = this.player;
    const d = this.def;
    const k = this.k;
    const T = this.terrain;
    p.invulnT = Math.max(0, p.invulnT - dt);
    p.hurtT = Math.max(0, p.hurtT - dt);
    p.combatT += dt;
    p.lastHitT += dt;
    for (const c in p.cd) p.cd[c] = Math.max(0, p.cd[c] - dt);
    for (const b in p.buff) p.buff[b] = Math.max(0, p.buff[b] - dt);
    if (p.dead) {
      p.deathT += dt;
      p.speed *= 0.9;
      if (p.mode === "air") {
        p.vy -= G * dt;
        p.y += p.vy * dt;
        const g = T.surface(p.x, p.z);
        if (p.y < g) {
          p.y = g;
          p.mode = "ground";
        }
      }
      return;
    }
    // ---- rest / sleep toggle
    if (inp.rest) {
      if (p.sleeping) this.wake();
      else if (p.mode === "air") this.emit("note", { text: "Land first to rest." });
      else if (p.mode === "swim") this.emit("note", { text: "You can't rest in the water." });
      else if (p.combatT < 5) this.emit("note", { text: "Too dangerous to rest right now." });
      else {
        p.sleeping = true;
        p.sleepT = 0;
        p.eating = null;
        p.drinking = false;
        this.bump("sleep");
        if (p.inCave) this.bump("caveSleep");
        this.emit("sleep");
      }
    }
    const moving = Math.abs(inp.mx || 0) + Math.abs(inp.mz || 0) > 0.1;
    if (p.sleeping) {
      p.sleepT += dt;
      if ((moving || inp.jump || inp.atk1 || inp.atk2) && p.sleepT > 0.6) this.wake();
      // births happen during a long rest in your own territory
      if (p.sleepT > 6 && !p.birthTried) {
        p.birthTried = true;
        this.tryBirth();
      }
    } else p.birthTried = false;
    if (inp.stalk && this.species !== "eagle") p.stalking = !p.stalking;
    // ---- actions
    if (!p.sleeping) {
      if (inp.special) this.useSpecial();
      if (inp.atk1) this.startAttack("primary");
      else if (inp.atk2) this.startAttack("secondary");
      this.interact(!!inp.interactHeld, !!inp.interact, dt);
    } else this.prompt = null;
    // ---- eating / drinking channels
    if (p.eating) {
      const e = p.eating;
      if (!e || e.gone || !(e.meat > 0) || moving || p.hunger >= 100) {
        if (p.eating && p.hunger >= 100) this.emit("note", { text: "Full." });
        p.eating = null;
      } else {
        const bite = Math.min(e.meat, 14 * dt);
        e.meat -= bite;
        this.feed(bite, e);
        if (Math.floor(p.anim.phase * 2) !== Math.floor((p.anim.phase + dt) * 2)) this.emit("chew");
        if (e.meat <= 0) {
          e.meat = 0;
          p.eating = null;
          this.emit("note", { text: "Nothing left." });
        }
      }
    }
    if (p.drinking) {
      if (moving || p.thirst >= 100) p.drinking = false;
      else {
        p.thirst = Math.min(100, p.thirst + 22 * dt);
        if (Math.floor(p.anim.phase * 3) !== Math.floor((p.anim.phase + dt) * 3)) this.emit("lap");
      }
    }
    // ---- movement
    if (this.species === "eagle" && p.mode === "air") this.stepFlight(inp, dt);
    else this.stepGround(inp, dt, moving);
    // ---- attack timeline
    const at = p.attack;
    if (at) {
      at.t += dt;
      const a = at.def;
      if (!at.done && a.lunge && at.t < a.windup && p.mode !== "air") p.speed = Math.max(p.speed, a.lunge * (at.fx.ambush ? 1.4 : 1));
      if (!at.done && at.t >= a.windup) {
        at.done = true;
        this.resolveHit(at);
      }
      if (at.t >= a.dur) p.attack = null;
    }
    // ---- meters
    this.stepMeters(inp, dt, moving);
  }

  stepGround(inp, dt, moving) {
    const p = this.player;
    const d = this.def;
    const k = this.k;
    const T = this.terrain;
    const busy = p.sleeping || p.eating || p.drinking || (p.attack && p.attack.def.heavy && p.attack.t < p.attack.def.windup + 0.2);
    let tx = 0;
    let tz = 0;
    if (moving && !busy) {
      const a = inp.camYaw || 0;
      const fx = Math.sin(a);
      const fz = Math.cos(a);
      const rx = -Math.cos(a);
      const rz = Math.sin(a);
      tx = fx * (inp.mz || 0) + rx * (inp.mx || 0);
      tz = fz * (inp.mz || 0) + rz * (inp.mx || 0);
      const l = Math.hypot(tx, tz);
      tx /= l;
      tz /= l;
    }
    // eagle on the ground: Space takes off
    if (this.species === "eagle") {
      if ((inp.jump || inp.up) && !p.sleeping && p.stamina > 6) {
        p.mode = "air";
        p.flight.perched = false;
        p.flight.takeoff = 0.8;
        p.flight.pitch = 0.45;
        p.speed = Math.max(p.speed, 7);
        p.vy = 0;
        p.y += 0.5;
        p.eating = null;
        p.drinking = false;
        p.stamina -= 6;
        this.emit("takeoff");
        return;
      }
    }
    const swim = p.mode === "swim";
    // breaking into a sprint ends a stalk
    if (inp.sprint && moving && p.stalking && !p.exhausted && p.buff.ambush <= 0) p.stalking = false;
    const sprintOk = inp.sprint && !p.exhausted && p.stamina > 1 && !swim && !p.stalking;
    p.sprinting = sprintOk && moving && !busy && p.speed > d.move.run * 0.5;
    let target = 0;
    if (tx || tz) {
      const want = Math.atan2(tx, tz);
      const diff = angTo(p.yaw, want);
      const tr = d.move.turn * (p.sprinting ? 0.75 : 1) * (p.onGround ? 1 : 0.35);
      p.yaw = wrapA(p.yaw + clamp(diff, -tr * dt, tr * dt));
      p.anim.turn += (clamp(diff, -1, 1) - p.anim.turn) * Math.min(1, dt * 8);
      let base = p.stalking ? d.move.stalk * k.stalkMul : p.sprinting ? d.move.sprint : d.move.run;
      if (swim) base = d.move.swim;
      if (this.species === "eagle") base = p.sprinting ? d.move.sprint : d.move.run;
      target = base * k.speedMul * (Math.abs(diff) > 1.7 ? 0.25 : 1 - Math.abs(diff) * 0.2);
      if (p.buff.dash > 0) target *= 1.85;
      if (p.buff.howl > 0) target *= 1.08;
      if (p.hunger < 12 || p.thirst < 12) target *= 0.85;
      if (p.exhausted && !swim) target *= 0.88;
    } else p.anim.turn *= 1 - Math.min(1, dt * 6);
    if (busy) target = 0;
    const acc = d.move.accel * (target < p.speed ? 1.6 : 1) * (p.onGround || swim ? 1 : 0.2);
    p.speed += clamp(target - p.speed, -acc * dt, acc * dt);
    // jump
    if (inp.jump && p.onGround && !swim && !busy && p.stamina > 4) {
      p.vy = d.move.jump * k.jumpMul;
      p.onGround = false;
      p.stamina -= 5;
      p.anim.jump = 1;
      this.emit("jump");
    }
    // horizontal step
    let vx = Math.sin(p.yaw) * p.speed;
    let vz = Math.cos(p.yaw) * p.speed;
    if (p.kx || p.kz) {
      vx += p.kx;
      vz += p.kz;
      p.kx *= Math.pow(0.02, dt);
      p.kz *= Math.pow(0.02, dt);
      if (Math.abs(p.kx) + Math.abs(p.kz) < 0.1) p.kx = p.kz = 0;
    }
    let nx = p.x + vx * dt;
    let nz = p.z + vz * dt;
    // slope limit: can't walk up cliffs
    const h0 = T.height(p.x, p.z);
    const h1 = T.height(nx, nz);
    if (h1 > h0 + 0.02 && h1 > WATER) {
      const nrm = T.normal(nx, nz);
      if (nrm.y < d.move.climb) {
        // slide along the contour instead
        const gx = -nrm.x;
        const gz = -nrm.z;
        const gl = Math.hypot(gx, gz) || 1;
        const dot = (vx * gx + vz * gz) / gl;
        if (dot > 0) {
          vx -= (gx / gl) * dot;
          vz -= (gz / gl) * dot;
          nx = p.x + vx * dt;
          nz = p.z + vz * dt;
          if (T.normal(nx, nz).y < d.move.climb && T.height(nx, nz) > h0 + 0.02) {
            nx = p.x;
            nz = p.z;
          }
          p.speed *= Math.pow(0.2, dt);
        }
      }
    }
    // static colliders
    const r = d.size.r;
    this.colliders.query(nx, nz, r + 3, (c) => {
      const dx = nx - c.x;
      const dz = nz - c.z;
      const dd = Math.hypot(dx, dz);
      const min = c.r + r;
      if (dd < min && dd > 1e-4) {
        nx = c.x + (dx / dd) * min;
        nz = c.z + (dz / dd) * min;
      }
    });
    // animals
    for (const e of this.ents) {
      if (e.dead || e.gone || e.flying || e.role === "home") continue;
      const dx = nx - e.x;
      const dz = nz - e.z;
      const min = r * 0.8 + e.r * 0.8;
      const dd = dx * dx + dz * dz;
      if (dd < min * min && dd > 1e-6) {
        const l = Math.sqrt(dd);
        const push = (min - l) * (e.def.mass > 100 ? 0.8 : 0.5);
        nx += (dx / l) * push;
        nz += (dz / l) * push;
      }
    }
    nx = clamp(nx, -HALF + 8, HALF - 8);
    nz = clamp(nz, -HALF + 8, HALF - 8);
    const moved = Math.hypot(nx - p.x, nz - p.z);
    p.x = nx;
    p.z = nz;
    // vertical
    const g = T.height(p.x, p.z);
    const depth = WATER - g;
    const swimDepth = d.size.h * 0.7;
    if (!p.onGround) {
      p.vy -= G * dt;
      p.y += p.vy * dt;
      p.fallV = Math.min(p.fallV, p.vy);
      const floor = depth > swimDepth ? WATER - d.size.h * 0.55 : g;
      if (p.y <= floor) {
        p.y = floor;
        const impact = -p.fallV;
        p.onGround = true;
        p.vy = 0;
        p.fallV = 0;
        if (depth <= swimDepth) {
          this.emit("land", { impact });
          if (impact > 15 && !this.hasPerk("lightFeet")) this.hurtPlayer((impact - 15) * 5.5 * (d.size.r > 0.7 ? 1.2 : 1), null, { cause: "A bad fall" });
        } else this.emit("splash");
      }
    } else {
      if (depth > swimDepth) {
        if (p.mode !== "swim") {
          p.mode = "swim";
          this.emit("splash");
        }
        p.y += (WATER - d.size.h * 0.55 - p.y) * Math.min(1, dt * 6);
      } else {
        if (p.mode === "swim") p.mode = "ground";
        // walking off a ledge
        if (p.y - g > 0.9 && p.speed > 2) {
          p.onGround = false;
          p.vy = 0;
          p.fallV = 0;
        } else p.y = g;
      }
    }
    if (p.mode === "swim") this.bump("swim", moved);
    else this.bump("dist", moved);
    // animation channels
    p.anim.spd = p.speed;
    const stride = d.size.len * (p.sprinting ? 1.9 : 1.25);
    p.anim.phase += (moved / Math.max(0.3, stride)) * Math.PI;
    if (moved < 0.001) p.anim.phase += dt * 0.6;
    p.anim.jump = Math.max(0, p.anim.jump - dt * 2);
  }

  stepFlight(inp, dt) {
    const p = this.player;
    const d = this.def;
    const m = d.move;
    const k = this.k;
    const fl = p.flight;
    const T = this.terrain;
    fl.takeoff = Math.max(0, fl.takeoff - dt);
    // steering: the eagle turns toward the camera yaw (A/D rotate the camera via the component)
    const want = inp.camYaw || 0;
    const diff = angTo(p.yaw, want);
    const yr = m.yawRate * (fl.dive ? 0.6 : 1);
    const turn = clamp(diff, -yr * dt, yr * dt);
    p.yaw = wrapA(p.yaw + turn);
    fl.bank += (clamp(-diff * 1.4, -1.1, 1.1) - fl.bank) * Math.min(1, dt * 4);
    // pitch target from the camera pitch (+ Space / Ctrl)
    let pt = clamp(-((inp.camPitch || 0.25) - 0.25) * 1.25, -0.85, 0.7);
    if (inp.up) pt = Math.max(pt, 0.55);
    if (inp.down) pt = Math.min(pt, -0.55);
    let flap = false;
    let tgt = null;
    const fast = inp.sprint && !p.exhausted && p.stamina > 1;
    if (fl.dive) {
      const dv = fl.dive;
      dv.t += dt;
      pt = Math.min(-0.55, pt - 0.2);
      // talons find the prey you aim at: lock onto the best animal inside a narrow cone
      if (!dv.lock || dv.lock.dead || dv.lock.gone) {
        dv.lock = null;
        let best = 0.42;
        const cfx = Math.sin(want);
        const cfz = Math.cos(want);
        for (const e of this.ents) {
          if (e.dead || e.gone || e.role === "companion" || e.role === "home") continue;
          const ex = e.x - p.x;
          const ez = e.z - p.z;
          const h = Math.hypot(ex, ez);
          if (h > 60 || h < 0.5) continue;
          const yawErr = Math.acos(Math.max(-1, Math.min(1, (ex * cfx + ez * cfz) / h)));
          const pitchTo = -Math.atan2(p.y - (e.y + e.h * 0.5), h);
          const err = yawErr + Math.abs(pitchTo - pt) * 0.5;
          if (err < best) {
            best = err;
            dv.lock = e;
          }
        }
      }
      if (dv.lock) {
        const e = dv.lock;
        const h = Math.hypot(e.x - p.x, e.z - p.z);
        const yawTo = Math.atan2(e.x - p.x, e.z - p.z);
        p.yaw = wrapA(p.yaw + clamp(angTo(p.yaw, yawTo), -2.2 * dt, 2.2 * dt));
        pt = clamp(-Math.atan2(p.y - (e.y + e.h * 0.5), Math.max(0.5, h)), -1.45, -0.1);
        fl.pitch += (pt - fl.pitch) * Math.min(1, dt * 6);
      } else fl.pitch += (pt - fl.pitch) * Math.min(1, dt * 3);
      p.speed = Math.min(52, p.speed + 38 * dt);
      // hit test along the path
      const fx = Math.sin(p.yaw) * Math.cos(fl.pitch);
      const fy = Math.sin(fl.pitch);
      const fz = Math.cos(p.yaw) * Math.cos(fl.pitch);
      for (const e of this.ents) {
        if (e.dead || e.gone || e.role === "companion" || e.role === "home") continue;
        const ex = e.x - p.x;
        const ey = e.y + e.h * 0.5 - p.y;
        const ez = e.z - p.z;
        const along = ex * fx + ey * fy + ez * fz;
        if (along < -1 || along > p.speed * dt + 2) continue;
        const px = ex - fx * along;
        const py = ey - fy * along;
        const pz = ez - fz * along;
        if (Math.hypot(px, py, pz) < e.r + 1.3) {
          const dmg = d.attacks.primary.dmg * 3 * k.dmgMul * k.eff * (this.hasPerk("skyLord") ? 1.5 : 1) * (e.def.kind === "prey" ? k.preyDmgMul : 1);
          const died = this.hurtEnt(e, dmg, "player", { knock: 6, stun: 1, dive: true });
          this.emit("hit", { dmg, kind: "dive", died, name: e.def.name, big: true });
          if (!died) {
            p.lastHit = e;
            p.lastHitT = 0;
          }
          dv.hit = true;
          break;
        }
      }
      const agl = p.y - T.surface(p.x, p.z);
      if (dv.hit || agl < (dv.lock ? 0.7 : 3) || dv.t > 4 || inp.up) {
        fl.dive = null;
        fl.pitch = 0.35;
        p.speed *= dv.hit ? 0.45 : 0.7;
        this.emit("pullUp");
      }
    } else {
      fl.pitch += (pt - fl.pitch) * Math.min(1, dt * 2.2);
      if (inp.mz > 0.1) tgt = fast ? m.fast : m.cruise;
      else if (inp.mz < -0.1) tgt = m.slow;
      else if (fast) tgt = m.fast;
      if (tgt != null) {
        const a = tgt > p.speed ? 7 : 9;
        p.speed += clamp(tgt - p.speed, -a * dt, a * dt);
        flap = tgt > p.speed - 0.5 || tgt >= m.cruise;
      }
      if (inp.up) flap = true;
      // gravity trades speed and height
      p.speed -= Math.sin(fl.pitch) * 9.8 * 0.55 * dt;
      p.speed *= 1 - 0.015 * dt;
      p.speed = clamp(p.speed, 3, 34);
    }
    p.speed = Math.max(3, p.speed) * 1;
    const sp = p.speed * k.speedMul;
    let vy = Math.sin(fl.pitch) * sp;
    if (!fl.dive) {
      if (!flap) vy -= 1.1; // glide sink
      if (p.speed < 7 && !flap) vy -= (7 - p.speed) * 1.2; // stall
      if (inp.up) vy += m.climbRate * 0.6;
      if (fl.takeoff > 0) vy += 4 * fl.takeoff;
      if (this.weather.storm > 0.5) {
        vy += Math.sin(this.t * 1.7) * 1.2 * this.weather.storm;
        p.yaw += Math.sin(this.t * 0.9) * 0.06 * dt * this.weather.storm;
      }
    }
    const h = Math.cos(fl.pitch) * sp;
    let nx = p.x + Math.sin(p.yaw) * h * dt;
    let nz = p.z + Math.cos(p.yaw) * h * dt;
    nx = clamp(nx, -HALF + 10, HALF - 10);
    nz = clamp(nz, -HALF + 10, HALF - 10);
    const moved = Math.hypot(nx - p.x, nz - p.z);
    p.x = nx;
    p.z = nz;
    p.y = Math.min(330, p.y + vy * dt);
    fl.flapping = flap;
    fl.flap += dt * (flap ? 9 : 0);
    // stamina
    if (flap) p.stamina -= (fast ? d.base.sprintCost : inp.up ? 7 : 3.5) * dt;
    p.sprinting = fast && flap;
    if (p.stamina <= 0) {
      p.stamina = 0;
      p.exhausted = true;
    }
    // distance stats
    this.bump("flyDist", moved);
    this.bump("dist", moved);
    if (!flap && !fl.dive && p.speed > 7) this.bump("glide", moved);
    if (this.weather.storm > 0.6) this.bump("stormFly", moved);
    const g = T.surface(p.x, p.z);
    const agl = p.y - g;
    this.setMax("altitude", Math.floor(agl));
    // landing / crash
    if (agl < 0.35 && fl.takeoff > 0.3) p.y = g + 0.35;
    else if (agl < 0.35) {
      const gw = T.height(p.x, p.z);
      if (gw < WATER - 0.2) {
        // skim over water
        p.y = WATER + 0.35;
        if (fl.pitch < 0) fl.pitch = 0.1;
        if (p.speed < 6) p.speed = 6;
      } else {
        const impact = p.speed;
        p.y = g;
        p.mode = "ground";
        p.onGround = true;
        p.vy = 0;
        fl.dive = null;
        fl.pitch = 0;
        fl.perched = true;
        if (impact > 19 && fl.pitch < -0.2) this.hurtPlayer((impact - 19) * 2.2, null, { cause: "Crashed into the ground" });
        p.speed = Math.min(p.speed, 2);
        this.emit("land", { impact: impact * 0.4 });
      }
    }
    p.anim.spd = p.speed;
    p.anim.phase += dt * (flap ? 9 : 1);
  }

  stepMeters(inp, dt, moving) {
    const p = this.player;
    const d = this.def;
    const k = this.k;
    const sleepK = p.sleeping ? 0.5 : 1;
    const sprintK = p.sprinting ? 1.6 : 1;
    p.hunger = Math.max(0, p.hunger - d.base.hunger * dt * sleepK * sprintK);
    p.thirst = Math.max(0, p.thirst - d.base.thirst * dt * sleepK * sprintK * (this.weather.rain > 0.5 ? 0.6 : 1) * (p.biome === "savanna" && daylight(this.time) > 0.6 ? 1.25 : 1));
    if (p.hunger <= 0) {
      p.hp -= 1.1 * dt;
      p.combatT = Math.min(p.combatT, 7);
    }
    if (p.thirst <= 0) {
      p.hp -= 1.5 * dt;
      p.combatT = Math.min(p.combatT, 7);
    }
    if (p.hp <= 0 && !p.dead) {
      this.die(p.hunger <= 0 ? "Starved" : "Died of thirst");
      return;
    }
    // stamina
    if (p.mode !== "air") {
      if (p.sprinting) {
        p.stamina -= k.sprintCost * dt;
        if (p.stamina <= 0) {
          p.stamina = 0;
          p.exhausted = true;
          this.emit("tired");
        }
      } else if (p.mode === "swim") {
        p.stamina -= (this.species === "tiger" || this.species === "bear" ? 0.8 : 2) * dt;
        if (p.stamina <= 0) {
          p.stamina = 0;
          p.hp -= 4 * dt; // drowning
          if (p.hp <= 0) this.die("Drowned");
        }
      } else if (!p.attack) {
        let r = k.stRegen * (p.sleeping ? 2.2 : moving ? 0.6 : 1);
        if (p.hunger < 15 || p.thirst < 15) r *= 0.5;
        p.stamina += r * dt;
      }
    } else if (!p.flight.flapping && !p.flight.dive) {
      p.stamina += k.stRegen * 0.4 * (this.hasPerk("thermal") ? 2 : 1) * dt;
    }
    p.stamina = clamp(p.stamina, 0, p.maxStamina);
    if (p.exhausted && p.stamina > p.maxStamina * 0.25) p.exhausted = false;
    // health regeneration
    if (p.hunger > 25 && p.thirst > 25 && p.combatT > 6 && p.hp < p.maxHp) {
      let r = p.maxHp * 0.006;
      if (p.sleeping) {
        r *= 4;
        if (this.ownedAt(p.x, p.z) || p.inCave) r *= 2.5;
      }
      p.hp = Math.min(p.maxHp, p.hp + r * dt);
    }
  }

  /** Stealth: multiplier on how far animals notice the player. */
  computeStealth() {
    const p = this.player;
    const w = this.weather;
    let m = this.k.detectMul;
    if (p.sprinting) m *= 1.35;
    else if (p.stalking) m *= 0.5;
    else if (p.speed < 0.5) m *= 0.75;
    const bw = biomeWeights(p.x, p.z, {});
    if (bw.forest > 0.5 || bw.savanna > 0.6 || bw.meadow > 0.5) m *= 0.85;
    if (this.isNight()) m *= 0.75;
    m *= 1 - 0.35 * w.fog;
    m *= 1 - 0.2 * w.rain;
    if (p.buff.ambush > 0) m *= 0.35;
    if (p.buff.dash > 0) m *= 0.25;
    if (p.mode === "swim") m *= 0.8;
    if (p.sleeping) m *= 0.6;
    p.stealth = m;
    p.vis = m;
    return m;
  }

  /* ---------------------------------------------------------------- the frame */
  step(inp, dt) {
    dt = Math.min(dt, 0.05);
    this.t += dt;
    const p = this.player;
    this.stepClock(dt);
    this.computeStealth();
    this.stepPlayer(inp || {}, dt);
    updateEntities(this, dt);
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = 0.8;
      spawnTick(this, 0.8);
    }
    // berries regrow
    if (this.berries.size) {
      for (const [i, t] of this.berries) {
        const n = t - dt * (p.sleeping ? SLEEP_TIME_SCALE : 1);
        if (n <= 0) {
          this.berries.delete(i);
          this.emit("berries", { i });
        } else this.berries.set(i, n);
      }
    }
    // slower bookkeeping
    this.slowTimer -= dt;
    if (this.slowTimer <= 0) {
      this.slowTimer = 0.25;
      this.slowStep(0.25);
    }
    // encounter survival: no predator has hit you for a while
    if (p.enc && !p.dead) {
      p.enc.t += dt;
      if (p.enc.t > 15 && !this.ents.some((e) => !e.dead && e.target === "player" && Math.hypot(e.x - p.x, e.z - p.z) < 40)) {
        this.bump("survivePredator");
        p.enc = null;
        this.emit("note", { text: "You escaped the predator." });
      }
    }
    // target under the reticle: nearest animal ahead
    this.target = this.pickTarget();
    this.A.playTime += dt;
  }
  slowStep() {
    const p = this.player;
    const A = this.A;
    // biome & landmarks
    const b = biomeAt(p.x, p.z);
    if (b !== p.biome) {
      p.biome = b;
      this.emit("biome", { biome: b });
    }
    if (!A.stats.biomesSeen.includes(b)) {
      A.stats.biomesSeen.push(b);
      A.stats[`biome:${b}`] = 1;
      A.stats.biomes = A.stats.biomesSeen.length;
      if (A.stats.biomesSeen.length > 1) this.addXp(30, `Explored the ${b === "grass" ? "grassland" : b}`);
    }
    for (const L of LANDMARKS) {
      if (A.stats.landmarksSeen.includes(L.id)) continue;
      const r = this.species === "eagle" ? 70 : L.id === "peak" ? 80 : 45;
      if ((p.x - L.x) ** 2 + (p.z - L.z) ** 2 < r * r) {
        A.stats.landmarksSeen.push(L.id);
        A.stats[`landmark:${L.id}`] = 1;
        A.stats.landmarks = A.stats.landmarksSeen.length;
        this.addXp(40, `Found ${L.name}`);
        this.emit("landmark", { name: L.name });
      }
    }
    const cave = caveAt(p.x, p.z);
    if (cave && !p.inCave) {
      this.bump("cave");
      this.emit("note", { text: `${cave.name} — a sheltered place to rest.` });
    }
    p.inCave = cave;
    p.inWater = p.mode === "swim";
    this.stepTerritory(0.25);
    syncFamily(this, false);
    this.checkMissions();
  }
  pickTarget() {
    const p = this.player;
    let best = null;
    let bs = Infinity;
    for (const e of this.ents) {
      if (e.dead || e.gone || e.role === "companion" || e.role === "home") continue;
      const dx = e.x - p.x;
      const dz = e.z - p.z;
      const d = Math.hypot(dx, dz, (e.y - p.y) * 0.8);
      if (d > 30) continue;
      const ang = Math.abs(angTo(p.yaw, Math.atan2(dx, dz)));
      if (ang > 0.9) continue;
      const s = d + ang * 10;
      if (s < bs) {
        bs = s;
        best = e;
      }
    }
    return best;
  }

  /** Copy the live state into the save record (position, meters, family hp, clock). */
  exportState() {
    const p = this.player;
    const A = this.A;
    if (!p.dead) {
      A.pos = { x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2), yaw: +p.yaw.toFixed(3) };
      A.meters = { hp: clamp(p.hp / p.maxHp, 0.05, 1), hunger: p.hunger, thirst: p.thirst, stamina: clamp(p.stamina / p.maxStamina, 0, 1) };
    }
    for (const f of A.family) {
      const e = this.ents.find((x) => x.famId === f.id && !x.dead);
      if (e) f.hp = clamp(e.hp / e.maxHp, 0, 1);
    }
    this.save.world = { time: this.time, day: this.day, weather: this.weather.cur };
    this.save.selected = this.species;
  }
}

export { isThreat };
