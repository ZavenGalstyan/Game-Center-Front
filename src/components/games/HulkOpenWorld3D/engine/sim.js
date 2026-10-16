/**
 * Hulk: Open World 3D — the simulation hub (framework-free, Node-testable).
 *
 *   const sim = new Sim({ mode: "mission"|"free", mission, stats, difficulty, seed })
 *   sim.step(input, 1/60)       fixed step; drain sim.events after every step
 *   sim.fx                      effect requests (the renderer drains them)
 *   sim.result                  set when a mission ends (win / fail)
 *
 * Owns the hero, enemies, bosses, projectiles, props, traffic, civilians
 * and the active scenario (mission or activity). All damage goes through
 * the helpers here so rage, XP, kill counts and mission counters stay in
 * one place.
 */
import { getCity, PITCH, N } from "./city.js";
import { Collision } from "./collide.js";
import { getNav } from "./nav.js";
import { HERO, DIFF, PROPS } from "./config.js";
import { rng, clamp } from "./util.js";
import { makeHero, stepHero, hurtHero, grabCandidate, rageMul } from "./hero.js";
import { makeProps, makeProp, damageProp, explode, removeProp, updateProps, propBox } from "./props.js";
import { makeEnemy, updateEnemies, hitEnemy } from "./enemies.js";
import { makeProjectile, updateProjectiles } from "./projectiles.js";
import { makeBoss, updateBosses, damageBossImpl } from "./bosses.js";
import { updateTraffic, updateCivilians } from "./ambient.js";
import { startScenario, updateScenario, scenarioInfo, resolveAt } from "./missions.js";
import { MISSIONS, ACTIVITIES } from "../data/missions.js";

export class Sim {
  constructor(o = {}) {
    this.mode = o.mode || "free";
    this.city = getCity();
    this.col = new Collision(this.city);
    this.nav = getNav(this.city);
    this.rand = rng(o.seed || 12345);
    this.diff = DIFF[o.difficulty] || DIFF.normal;
    this.t = 0;
    this.dtStep = 1 / 60;
    this.hitStop = 0;
    this.events = [];
    this.fx = [];
    this.shakes = [];
    this.enemies = [];
    this.bosses = [];
    this.projectiles = [];
    this.civilians = [];
    this.traffic = [];
    this.activeProps = new Set();
    this.nextId = 1;
    this.navBudget = 0;
    this.stats = { kills: 0, destroyed: 0, destruction: 0, damageDealt: 0, damageTaken: 0, bossKills: 0 };
    this.counters = { smashHits: 0 };
    this.dmgBy = {};
    this.runXp = 0;
    this.result = null;
    this.scenario = null;
    this.noise = null;
    this.ambientOn = o.ambient !== false;
    this.discovered = new Set(o.discovered || []);
    this.activityBest = o.activityBest || {};
    this.props = makeProps(this, this.city.props);
    this.propsVersion = 1;

    // hero spawn
    const st = o.stats;
    let spawn;
    if (this.mode === "mission") {
      this.def = MISSIONS.find((m) => m.id === o.mission);
      spawn = resolveAt(this, this.def.start, { r: 4 });
    } else if (o.spawn && Number.isFinite(o.spawn.x)) {
      spawn = this.safeSpot(o.spawn.x, o.spawn.z, 6);
    } else spawn = this.safeSpot(this.city.sites.start.x, this.city.sites.start.z, 6);
    this.hero = makeHero(st, spawn.x, spawn.y || 0, spawn.z, Math.PI);
    if (this.mode === "mission") {
      // face the first objective
      startScenario(this, "mission", o.mission);
      const info = scenarioInfo(this);
      const m = info && info.markers && info.markers[0];
      const tgt = m || (this.enemies[0] ? this.enemies[0] : this.bosses[0]);
      if (tgt) this.hero.heading = Math.atan2(tgt.x - this.hero.x, tgt.z - this.hero.z);
    }
    this.encT = 8;
    this.respawnT = 0;
    this.endT = 0;
    this.landT = 0;
    this.activityPrompt = null;
    this.squads = [];
  }

  /* ================================================================ step */
  step(inp, dt) {
    this.events.length = 0;
    this.dtStep = dt;
    let dw = dt;
    if (this.hitStop > 0) {
      this.hitStop -= dt;
      dw = dt * 0.12;
    }
    this.t += dw;
    this.navBudget = 5;
    const h = this.hero;
    inp = inp || {};

    // free roam: activity rings intercept E
    this.activityPrompt = null;
    if (this.mode === "free" && (!this.scenario || this.scenario.done) && h.alive && h.grounded && !h.carry) {
      for (const a of ACTIVITIES) {
        const p = this.activitySpot(a);
        if (Math.hypot(h.x - p.x, h.z - p.z) < 6) {
          this.activityPrompt = a;
          if (inp.grab) {
            inp = { ...inp, grab: false };
            this.startActivity(a.id);
          }
          break;
        }
      }
    }

    stepHero(this, h, inp, dw);
    updateEnemies(this, dw);
    this.separateHero();
    updateBosses(this, dw);
    updateProjectiles(this, dw);
    updateProps(this, dw);
    updateTraffic(this, dw);
    updateCivilians(this, dw);
    updateScenario(this, dw);
    if (this.noise) {
      this.noise.t -= dw;
      if (this.noise.t <= 0) this.noise = null;
    }
    if (this.mode === "free") this.freeRoam(dw);
    this.checkEnd(dw);
    // cleanup
    if (this.enemies.length > 30) this.enemies = this.enemies.filter((e) => !e.dead || e.deadT < 6);
    if (this.fx.length > 500) this.fx.splice(0, this.fx.length - 500);
    if (this.shakes.length > 20) this.shakes.splice(0, this.shakes.length - 20);
  }

  checkEnd(dt) {
    const h = this.hero;
    if (this.result) return;
    const sc = this.scenario;
    if (this.mode === "mission") {
      if (!h.alive) {
        this.endT += dt;
        if (this.endT > 2.6) this.finish(false, "You were defeated");
      } else if (sc && sc.failed) {
        this.endT += dt;
        if (this.endT > 1.4) this.finish(false, sc.failed);
      } else if (sc && sc.done) {
        this.endT += dt;
        if (this.endT > 1.6) this.finish(true);
      }
    } else if (!h.alive) {
      this.respawnT += dt;
      if (this.respawnT > 3.5) {
        const s = this.safeSpot(h.x + 30, h.z + 30, 10);
        Object.assign(h, { x: s.x, y: s.y || 0, z: s.z, vx: 0, vy: 0, vz: 0, alive: true, hp: h.maxHp, act: null, rage: 0, raging: false, deadT: 0 });
        h.anim.mode = "idle";
        this.respawnT = 0;
        for (const e of this.enemies) if (!e.dead && Math.hypot(e.x - h.x, e.z - h.z) < 80) this.despawnEnemy(e);
        if (this.scenario && !this.scenario.done) this.scenario.done = true;
        this.events.push({ type: "respawn" });
      }
    }
  }

  finish(win, reason = "") {
    const sc = this.scenario;
    const def = this.def;
    const xpMission = win ? def.xp : 0;
    const bossXp = this.bosses.filter((b) => b.dead).reduce((a, b) => a + b.def.xp, 0);
    this.result = {
      win,
      reason,
      mission: def.id,
      title: def.title,
      time: this.t,
      kills: this.stats.kills,
      destruction: Math.round(this.stats.destruction),
      destroyed: this.stats.destroyed,
      combatXp: Math.round(this.runXp),
      missionXp: xpMission,
      bossXp: win ? bossXp : 0,
      xp: Math.round(this.runXp) + xpMission + (win ? bossXp : 0),
      boss: def.boss ? def.steps[def.steps.length - 1].boss : null,
      lost: sc ? sc.lost : 0,
    };
    this.events.push({ type: win ? "missionComplete" : "missionFailed", reason });
  }

  /** bodies don't overlap: the hero shoulders smaller units aside and is pushed off bosses / vehicles */
  separateHero() {
    const h = this.hero;
    if (!h.alive) return;
    const R = HERO.radius;
    for (const e of this.enemies) {
      if (e.dead || e.sleep) continue;
      if (Math.abs(e.y - h.y) > Math.max(2.5, e.def.h)) continue;
      const dx = e.x - h.x;
      const dz = e.z - h.z;
      const r = R + e.def.r;
      const d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      const d = Math.sqrt(d2) || 0.01;
      const pen = r - d;
      const nx = d > 0.01 ? dx / d : 1;
      const nz = d > 0.01 ? dz / d : 0;
      const w = e.fixed || e.def.mass >= 6 ? 0 : e.def.mass <= 1.6 ? 0.85 : 0.5;
      e.x += nx * pen * w;
      e.z += nz * pen * w;
      if (w > 0) this.col.pushOut(e, e.def.r, e.def.h, 0.5, false);
      h.x -= nx * pen * (1 - w);
      h.z -= nz * pen * (1 - w);
    }
    for (const b of this.bosses) {
      if (b.dead && b.deadT > 3) continue;
      if (h.y - b.y > b.def.h * 0.9) continue;
      const dx = h.x - b.x;
      const dz = h.z - b.z;
      const r = R + b.def.r;
      const d = Math.hypot(dx, dz);
      if (d >= r) continue;
      const nx = d > 0.01 ? dx / d : Math.sin(b.heading + Math.PI);
      const nz = d > 0.01 ? dz / d : Math.cos(b.heading + Math.PI);
      h.x += nx * (r - d);
      h.z += nz * (r - d);
      const vn = h.vx * nx + h.vz * nz;
      if (vn < 0) {
        h.vx -= vn * nx;
        h.vz -= vn * nz;
      }
    }
    this.col.pushOut(h, R, HERO.height, HERO.stepUp);
  }

  /* ================================================================ free roam */
  activitySpot(a) {
    if (!a._p) a._p = resolveAt(this, a.site, { r: 3 });
    return a._p;
  }
  startActivity(id) {
    for (const e of this.enemies) if (!e.dead && Math.hypot(e.x - this.hero.x, e.z - this.hero.z) < 120) this.despawnEnemy(e);
    startScenario(this, "activity", id);
    this.events.push({ type: "activity", id });
  }
  freeRoam(dt) {
    const h = this.hero;
    // landmarks
    this.landT -= dt;
    if (this.landT <= 0) {
      this.landT = 0.5;
      for (const l of this.city.landmarks) {
        if (this.discovered.has(l.id)) continue;
        if (Math.hypot(h.x - l.x, h.z - l.z) < l.r) {
          this.discovered.add(l.id);
          this.gainXp(60);
          this.events.push({ type: "landmark", landmark: l });
        }
      }
      // squads cleared → bonus
      for (const s of this.squads) {
        if (!s.cleared && s.units.every((e) => e.dead)) {
          s.cleared = true;
          if (s.units.some((e) => e.lastHitBy)) {
            this.gainXp(40);
            this.events.push({ type: "encounterClear", name: s.name });
          }
        }
      }
      this.squads = this.squads.filter((s) => !s.cleared || false);
      // despawn far roaming units
      for (const e of this.enemies) if (!e.dead && e.tag === "roam" && Math.hypot(e.x - h.x, e.z - h.z) > 280) this.despawnEnemy(e);
    }
    // finished activity: clear it after the results toast
    const sc = this.scenario;
    if (sc && sc.done) {
      sc.after = (sc.after || 0) + dt;
      if (sc.after > 0.1 && !sc.reported) {
        sc.reported = true;
        if (sc.kind === "activity") {
          const prev = this.activityBest[sc.def.id] || 0;
          if (sc.success || sc.score > prev) this.activityBest[sc.def.id] = Math.max(prev, sc.score || 0);
          if (sc.success) this.gainXp(sc.def.xp);
        }
      }
      if (sc.after > 3) this.scenario = null;
    }
    if (this.scenario) return;
    // roaming encounters
    this.encT -= dt;
    if (this.encT <= 0) {
      this.encT = 20 + this.rand() * 20;
      const awake = this.enemies.filter((e) => !e.dead && Math.hypot(e.x - h.x, e.z - h.z) < 160).length;
      if (awake < 7 && h.alive) this.spawnSquad();
    }
  }
  spawnSquad() {
    const h = this.hero;
    for (let k = 0; k < 10; k++) {
      const a = this.rand() * Math.PI * 2;
      const r = 70 + this.rand() * 45;
      const x = clamp(h.x + Math.sin(a) * r, 10, this.city.size - 10);
      const z = clamp(h.z + Math.cos(a) * r, 10, this.city.size - 10);
      if (this.city.water(x, z)) continue;
      const s = this.safeSpot(x, z, 6);
      if (Math.hypot(s.x - h.x, s.z - h.z) < 50) continue;
      const d = this.city.district(s.x, s.z);
      const lvl = this.hero.st.level || 1;
      const R = this.rand;
      let comp;
      let name;
      if (d === "industrial") (comp = [["robot", 2], ["soldier", R() < 0.5 ? 2 : 0]]), (name = "Robot patrol");
      else if (d === "military") (comp = [["soldier", 3], ["heavy", 1], ["apc", R() < 0.3 ? 1 : 0]]), (name = "Military patrol");
      else if (d === "outskirts") (comp = [["soldier", 3], ["apc", R() < 0.3 ? 1 : 0]]), (name = "Road patrol");
      else (comp = [["soldier", 3 + (R() < 0.4 ? 1 : 0)], ["heavy", R() < 0.3 ? 1 : 0]]), (name = "Army squad");
      if (lvl >= 10 && R() < 0.2) comp.push(["heavyRobot", 1]);
      const units = [];
      const patrol = [[s.x + 14, s.z], [s.x, s.z + 14], [s.x - 14, s.z], [s.x, s.z - 14]];
      for (const [type, n] of comp) {
        for (let i = 0; i < n; i++) {
          const p = this.safeSpot(s.x + (i - 1) * 3, s.z + (units.length % 2) * 3, 4, type === "apc" || type === "heavyRobot");
          units.push(this.spawnEnemy(type, p.x, p.z, { tag: "roam", patrol: type === "apc" ? null : patrol, hpMul: 1 + (lvl - 1) * 0.02 }));
        }
      }
      this.squads.push({ units, name, cleared: false });
      this.events.push({ type: "encounter", name, x: s.x, z: s.z });
      return;
    }
  }

  /* ================================================================ queries */
  enemiesNear(x, z, r) {
    const out = [];
    for (const e of this.enemies) {
      if (e.dead) continue;
      if (Math.abs(e.x - x) > r + 2 || Math.abs(e.z - z) > r + 2) continue;
      out.push(e);
    }
    return out;
  }
  /** a walkable ground spot near (x, z): the point itself if free, else the nearest free nav cell */
  safeSpot(x, z, rad = 4, big = false) {
    const nav = this.nav;
    const grid = big ? nav.big : nav.walk;
    const c = nav.cellOf(x, z);
    let px = x;
    let pz = z;
    if (nav.blocked(grid, c[0], c[1]) || !this.pointFree(x, z, big ? 2 : 0.9)) {
      const f = nav.nearestFree(grid, x, z, Math.ceil(rad + 4));
      if (f) [px, pz] = nav.centre(f[0], f[1]);
    }
    const g = this.col.groundAt(px, pz, 2, 1.2, 0.5, false);
    return { x: px, y: g.y, z: pz };
  }
  pointFree(x, z, r) {
    const list = this.col.boxesIn(x - r, z - r, x + r, z + r);
    const gy = this.city.terrainH(x, z);
    for (const b of list) {
      if (b.ramp || b.y1 <= gy + 1.2 || b.y0 > gy + 3) continue;
      if (x + r > b.x0 && x - r < b.x1 && z + r > b.z0 && z - r < b.z1) return false;
    }
    return true;
  }
  interactPrompt() {
    const h = this.hero;
    if (this.activityPrompt) return { kind: "activity", text: `Press E — ${this.activityPrompt.name}` };
    if (!h.alive) return null;
    if (h.carry) return { kind: "throw", text: "Click to THROW · E to drop" };
    const p = grabCandidate(this, h);
    if (p) return { kind: "grab", text: `Press E — lift ${PROP_NAME[p.type] || p.type}` };
    return null;
  }

  /* ================================================================ spawning */
  spawnEnemy(type, x, z, o = {}) {
    const e = makeEnemy(this, type, x, z, o);
    this.enemies.push(e);
    return e;
  }
  despawnEnemy(e) {
    e.dead = true;
    e.deadT = 99;
    e.hp = 0;
    e.removed = true;
  }
  spawnBoss(kind, x, z, o = {}) {
    const b = makeBoss(this, kind, x, z, o);
    this.bosses.push(b);
    this.events.push({ type: "bossIntro", boss: b });
    return b;
  }
  spawnProp(type, x, z, o = {}) {
    if (o.clear) {
      const d = PROPS[type];
      const r = Math.max(d.hx, d.hz) + 0.8;
      for (const p of this.col.propsIn(x - r, z - r, x + r, z + r)) if (!p.tag && p.mode === "static" && !p.drive) removeProp(this, p);
    }
    let rec = null;
    if (o.pooled) rec = this.props.find((p) => p.pooled && p.mode === "gone");
    const src = { id: rec ? rec.id : this.props.length, type, x, z, rot: o.rot || 0, tag: o.tag, color: o.color, red: o.red, military: o.military };
    const p = makeProp(this, src);
    p.pooled = !!o.pooled;
    if (rec) this.props[rec.id] = p;
    else {
      this.props.push(p);
      this.propsVersion++;
    }
    p.ver = (rec ? rec.ver : 0) + 1;
    return p;
  }
  spawnProjectile(kind, x, y, z, dx, dy, dz, o = {}) {
    const p = makeProjectile(kind, x, y, z, dx, dy, dz, o);
    this.projectiles.push(p);
    if (p.hostile) this.noise = { x, z, r: 30, t: 2 };
    return p;
  }

  /* ================================================================ damage */
  damageEnemy(e, dmg, o = {}) {
    if (e.dead) return;
    let d = dmg;
    const h = this.hero;
    if (o.byPlayer) {
      if (h.raging) d *= rageMul(h);
      if (!h.raging) h.rage = Math.min(h.st.rageMax, h.rage + d * HERO.rageOnHit * (h.st.rageGain || 1));
      this.stats.damageDealt += d;
      if (o.kind === "smash") this.counters.smashHits++;
    }
    const died = hitEnemy(this, e, d, o);
    this.events.push({ type: "enemyHit", enemy: e, dmg: d, kind: o.kind, byPlayer: !!o.byPlayer });
    this.fx.push({ type: "hit", x: e.x, y: e.y + e.def.h * 0.6, z: e.z, robot: e.type.includes("obot") || e.def.vehicle || e.type === "turret", n: o.melee ? 8 : 4 });
    if (died) this.enemyKilled(e);
  }
  enemyKilled(e) {
    if (e.counted) return;
    e.counted = true;
    this.stats.kills++;
    this.gainXp(e.def.xp);
    this.events.push({ type: "kill", enemy: e });
    if (e.def.vehicle || e.type === "turret" || e.type === "heavyRobot") {
      explode(this, e.x, e.y + 1.5, e.z, e.def.vehicle ? 8 : 6, 90, { byPlayer: true, big: true });
    }
  }
  damageBoss(b, dmg, o = {}) {
    let d = dmg;
    const h = this.hero;
    if (o.byPlayer && h.raging) d *= rageMul(h);
    const real = damageBossImpl(this, b, d, o);
    if (real > 0 && o.byPlayer) {
      if (!h.raging) h.rage = Math.min(h.st.rageMax, h.rage + real * HERO.rageOnHit * 0.6 * (h.st.rageGain || 1));
      this.stats.damageDealt += real;
    }
    if (b.dead && !b.counted) {
      b.counted = true;
      this.stats.bossKills++;
    }
    return real;
  }
  damageHero(dmg, o = {}) {
    const h = this.hero;
    if (!h.alive) return;
    const real = hurtHero(this, h, dmg * this.diff.dmgIn, o);
    this.stats.damageTaken += real;
    const k = o.kind || "?";
    this.dmgBy[k] = (this.dmgBy[k] || 0) + real;
    const ang = o.x != null ? Math.atan2(o.x - h.x, o.z - h.z) : null;
    this.events.push({ type: "heroHit", dmg: real, ang, kind: o.kind });
  }
  hurtCivilian(c, dmg, x, z) {
    if (c.dead) return;
    c.hp -= dmg;
    if (!c.critical && c.state !== "flee") {
      c.state = "flee";
      c.stT = 0;
      const a = Math.atan2(c.x - x, c.z - z);
      c.flee = [Math.sin(a), Math.cos(a)];
    }
    if (c.hp <= 0) {
      c.dead = true;
      c.deadT = 0;
      if (c.critical) {
        if (this.scenario) this.scenario.lost++;
        this.events.push({ type: "civLost", civ: c });
      }
    }
  }
  damagePropBy(p, dmg, o) {
    return damageProp(this, p, dmg, o);
  }
  explodeAt(x, y, z, r, dmg, o) {
    explode(this, x, y, z, r, dmg, o);
  }
  /** a boss impact crushing nearby props */
  explodeProps(x, z, r, dmg) {
    for (const p of this.col.propsIn(x - r, z - r, x + r, z + r)) {
      if (p.mode !== "static" || p.tag) continue;
      if (Math.hypot(p.x - x, p.z - z) < r) damageProp(this, p, dmg, { byPlayer: false, dx: p.x - x, dz: p.z - z });
    }
  }
  shake(x, z, amp, range = 60) {
    this.shakes.push({ x, z, amp, range, t: this.t });
    this.noise = { x, z, r: Math.min(60, range * 0.6), t: 3 };
  }
  gainXp(n) {
    this.runXp += n;
    this.events.push({ type: "xp", n });
  }
  setStats(st) {
    const h = this.hero;
    const f = h.hp / h.maxHp;
    h.st = st;
    h.maxHp = st.maxHp;
    h.hp = Math.min(st.maxHp, Math.max(h.hp, f * st.maxHp));
  }

  /* ================================================================ HUD helpers */
  objective() {
    return scenarioInfo(this);
  }
  bossBar() {
    const b = this.bosses.find((x) => !x.dead || x.deadT < 3);
    return b || null;
  }
  propRemove(p) {
    removeProp(this, p);
  }
  refreshProp(p) {
    propBox(p);
    this.col.moveProp(p);
  }
  districtAt(x, z) {
    return this.city.district(x, z);
  }
  gridInfo() {
    return { PITCH, N };
  }
}

export const PROP_NAME = { car: "car", van: "van", taxi: "taxi", barrel: "barrel", crate: "crate", mcrate: "ammo crate", concrete: "concrete block", bench: "bench", bin: "trash bin" };
