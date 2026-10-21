/**
 * Neon Mercenary — the gameplay simulation (pure JS, no Three.js; runs in node
 * for tests and bots). The React shell steps it at a fixed 60 Hz and reads its
 * state; the renderer mirrors it. Communication outward is through `events`
 * (drained every frame by the shell: audio, FX, UI notifications).
 *
 * Owns: the current district (compiled map), the player + weapon state,
 * enemies, bosses, NPCs, civilians, projectiles, hazards, pickups, mission
 * objects, interactions, cyberware abilities, damage, loot, death / respawn.
 * The persistent profile (engine/profile.js) is mutated in place.
 */
import { compileMap, raycast, lineOfSight, nearestWalkable, collideCircle, setGate } from "./map.js";
import { rng, clamp, dist, wrapAngle, yawOf, rayCylinder } from "./math.js";
import { cameraRig } from "./camera.js";
import { createPlayer, stepPlayer, PLAYER_H, CROUCH_H, PLAYER_R } from "./player.js";
import { createEnemy, updateEnemy, hearNoise, setAlert, killEnemy, MAX_TOKENS } from "./ai.js";
import { createBoss, updateBoss, bossDamageMult, bossDefeated, BOSSES } from "./bosses.js";
import { createMissions } from "./missions.js";
import { derive, weaponByUid, weaponStats, magSize, addXp, addCredits, addAmmo, addStack, takeStack, addWeapon } from "./profile.js";
import { WEAPONS, AMMO } from "../data/weapons.js";
import { STACKS } from "../data/items.js";
import { CYBERWARE } from "../data/cyberware.js";
import { NPCS } from "../data/npcs.js";
import { DISTRICTS } from "../data/districts/index.js";

const mapCache = new Map();
export function getMap(id) {
  if (!mapCache.has(id)) mapCache.set(id, compileMap(DISTRICTS[id]));
  const M = mapCache.get(id);
  // dynamic boxes back to their authored state
  for (const b of M.boxes) if (b.kind === "gate" && !b.solid) setGate(M, b.id, false);
  return M;
}

const DECOY_DEF = {
  name: "Holo-Decoy", faction: "boss", hp: 30, armor: 0, speed: 2.5, run: 4.5,
  weapon: { kind: "bolt", dmg: 6, rate: 1.2, burst: 2, burstGap: 1.4, spread: 0.06, range: 40, boltSpeed: 26 },
  detect: 60, fov: 360, reaction: 0.3, aggression: 0.6, retreatAt: 0, cover: false, flank: true,
  xp: 0, credits: [0, 0], drops: {}, look: { body: "f", hair: "Hair_Buns", hairColor: "#dfe8ff", suit: "#0d1220", trim: "#9fe7ff", gear: "specter", visor: true, weapon: "heavyPistol", holo: true },
};

export class Game {
  constructor(profile, { seed = 1, test = false, district = null, arrival = "spawn" } = {}) {
    this.P = profile;
    this.rand = rng(seed);
    this.test = test;
    this.events = [];
    this.time = 0;
    this.camYaw = 0;
    this.camPitch = 0.05;
    this.aimT = 0;
    this.aiming = false;
    this.bloom = 0;
    this.buffs = { reflex: 0, shield: 0, shieldHp: 0, neural: 0, stim: 0, stimBoost: 0 };
    this.cds = { ability: 0, biomon: 0, unbreak: 0, heal: 0, locker: 0 };
    this.lockMove = 0;
    this.slowT = 0;
    this.cinematic = null;
    this.dialogue = null;
    this.hack = null;
    this.paused = false;
    this.lastHurtT = -99;
    this.combatT = -99;
    this.refreshStats();
    this.missions = createMissions(this);
    this.loadDistrict(district || profile.district || "market", arrival);
  }

  /* ============================================================ setup */
  refreshStats() {
    const prev = this.D;
    this.D = derive(this.P);
    const p = this.player;
    if (p && prev) {
      // keep current fractions sensible after equipment changes
      p.hp = Math.min(this.D.maxHp, p.hp + Math.max(0, this.D.maxHp - prev.maxHp));
      p.armor = Math.min(this.D.armorCap, p.armor);
      p.stamina = Math.min(this.D.maxStamina, p.stamina);
      p.energy = Math.min(this.D.maxEnergy, p.energy);
    }
    this.syncWeapon();
  }

  loadDistrict(id, arrival = "spawn") {
    const def = DISTRICTS[id];
    this.districtId = id;
    this.def = def;
    this.map = getMap(id);
    for (const c of this.map.cover) c.taken = null;
    this.P.district = id;
    let sp = arrival === "arrive" ? def.arrive : arrival === "spawn" ? def.spawn : arrival;
    if (arrival === "saved" && this.P.pos && this.P.pos.district === id) sp = this.P.pos;
    if (!sp || !Number.isFinite(sp.x)) sp = def.spawn;
    const hp = this.player?.hp;
    const keep = this.player && !this.player.dead;
    this.player = createPlayer(sp.x, sp.z, sp.yaw ?? 0, this.D);
    if (keep) this.player.hp = Math.max(1, Math.min(hp, this.D.maxHp));
    this.camYaw = sp.yaw ?? 0;
    this.camPitch = 0.02;
    this.enemies = [];
    this.bolts = [];
    this.hazards = [];
    this.pickups = [];
    this.objects = {};
    this.tokens = 0;
    this.boss = null;
    this.npcs = (def.npcs || []).map((n) => ({ ...n, def: NPCS[n.id], home: { x: n.x, z: n.z, yaw: n.yaw }, talkT: 0, anim: NPCS[n.id]?.anim || "Idle", hidden: false }));
    this.civilians = (def.civilians || []).map((route, i) => ({ id: i, route, i: 1, x: route[0][0], y: 0, z: route[0][1], yaw: 0, speed: 1.2 + this.rand() * 0.5, flee: 0, look: i }));
    for (const g of def.patrols || []) this.spawnEnemy(g.type, g.route[0][0], g.route[0][1], { route: g.route.length > 1 ? g.route : null, ambient: true });
    this.syncWeapon();
    this.missions.onDistrict(id);
    this.emit({ type: "district", id });
  }

  /* ============================================================ events */
  emit(ev) {
    ev.t = this.time;
    this.events.push(ev);
    if (this.events.length > 400) this.events.splice(0, this.events.length - 400);
  }
  drain() {
    const e = this.events;
    this.events = [];
    return e;
  }
  say(who, text, ms = 3800) {
    this.emit({ type: "say", who, text, ms });
  }

  /* ============================================================ spawning */
  spawnEnemy(type, x, z, opts = {}) {
    const e = createEnemy(this, type, x, z, opts);
    if (opts.ambient) e.ambient = true;
    this.enemies.push(e);
    return e;
  }
  spawnDecoy(boss, x, z) {
    const n = nearestWalkable(this.map, x, z, 4) || { x, z };
    const e = createEnemy(this, "eliteGuard", n.x, n.z, { tag: "decoy", alert: true, noLoot: true });
    e.def = DECOY_DEF;
    e.name = DECOY_DEF.name;
    e.hp = e.maxHp = 30;
    e.shield = e.maxShield = 0;
    e.look = DECOY_DEF.look;
    e.decoy = true;
    e.faction = "boss";
    this.enemies.push(e);
    this.emit({ type: "spawnFx", x: n.x, y: 1, z: n.z, color: "#9fe7ff" });
    return e;
  }
  spawnBoss(id, x, z, arena) {
    const e = createBoss(this, id, x, z, arena);
    this.enemies.push(e);
    this.boss = e;
    this.emit({ type: "bossIntro", boss: id, name: BOSSES[id].name, title: BOSSES[id].title, text: BOSSES[id].intro });
    return e;
  }
  clearMissionEntities() {
    this.enemies = this.enemies.filter((e) => !e.mission && e.tag !== "boss" && e.tag !== "bossAdd" && e.tag !== "vexDrone" && e.tag !== "decoy");
    this.tokens = this.enemies.filter((e) => e.token).length;
    this.boss = null;
    this.hazards = [];
    this.bolts = [];
    this.objects = {};
    this.pickups = this.pickups.filter((p) => !p.mission);
  }

  /* ============================================================ weapons */
  get wpnUid() {
    return this.P.equip[this.P.activeSlot];
  }
  syncWeapon() {
    const P = this.P;
    if (!P.equip[P.activeSlot]) P.activeSlot = "w1";
    const w = weaponByUid(P, P.equip[P.activeSlot]);
    const prevUid = this.wpn?.uid;
    if (!this.wpn) this.wpn = { fireT: 0, reloadT: 0, switchT: 0, combo: 0, comboT: 0, swingT: 0, swingHit: true, held: false };
    this.wpn.uid = w?.uid ?? null;
    this.wpn.def = w ? WEAPONS[w.id] : null;
    this.wpn.inst = w;
    this.wpn.stats = w ? weaponStats(w, this.D, this.buffMods()) : null;
    if (prevUid !== this.wpn.uid) {
      this.wpn.reloadT = 0;
      this.wpn.switchT = prevUid === undefined ? 0 : 0.32;
    }
  }
  buffMods() {
    return { neural: this.buffs.neural > 0, stim: this.buffs.stimBoost > 0 ? this.D.stimBoost : 0 };
  }
  get mag() {
    return this.P.mags[this.wpn.uid] ?? 0;
  }
  reserve(ammo) {
    if (!ammo) return 0;
    if (AMMO[ammo].unlimited) return Infinity;
    return this.P.ammo[ammo] || 0;
  }
  switchTo(slot) {
    const P = this.P;
    if (!P.equip[slot] || P.activeSlot === slot) return;
    P.activeSlot = slot;
    this.syncWeapon();
    this.emit({ type: "switch", slot });
  }
  cycleWeapon(dir) {
    const order = ["w1", "w2", "melee"].filter((s) => this.P.equip[s]);
    const i = order.indexOf(this.P.activeSlot);
    this.switchTo(order[(i + dir + order.length) % order.length]);
  }
  startReload() {
    const W = this.wpn;
    const S = W.stats;
    if (!S || S.melee || W.reloadT > 0) return false;
    if (this.mag >= S.mag) return false;
    if (this.reserve(S.ammo) <= 0) {
      this.emit({ type: "noAmmo" });
      return false;
    }
    W.reloadT = S.reload;
    W.reloadTotal = S.reload;
    this.emit({ type: "reload", weapon: W.def.type, dur: S.reload });
    return true;
  }
  finishReload() {
    const S = this.wpn.stats;
    const need = S.mag - this.mag;
    const res = this.reserve(S.ammo);
    const take = Math.min(need, res);
    if (!AMMO[S.ammo].unlimited) this.P.ammo[S.ammo] = res - take;
    this.P.mags[this.wpn.uid] = this.mag + take;
    this.emit({ type: "reloaded" });
  }

  /** Camera ray → the world point under the crosshair. */
  aimPoint() {
    const c = cameraRig(this.map, this.player, this.camYaw, this.camPitch, this.aimT, this._cam || (this._cam = {}));
    const maxT = 160;
    let best = maxT;
    const hit = raycast(this.map, c.x, c.y, c.z, c.fx, c.fy, c.fz, maxT);
    if (hit) best = hit.t;
    let target = null;
    for (const e of this.enemies) {
      if (e.state === "dead") continue;
      const t = this.hitEnemyRay(e, c.x, c.y, c.z, c.fx, c.fy, c.fz, best);
      if (t >= 0 && t < best) {
        // ignore things between the camera and the player
        const along = (e.x - c.x) * c.fx + (e.z - c.z) * c.fz;
        if (along < c.d - 0.2) continue;
        best = t;
        target = e;
      }
    }
    // never aim at a point behind the player's shoulder
    best = Math.max(best, c.d + 1.2);
    return { x: c.x + c.fx * best, y: c.y + c.fy * best, z: c.z + c.fz * best, target, cam: c, dist: best };
  }
  muzzle() {
    const p = this.player;
    const y = this.camYaw;
    const h = PLAYER_H + (CROUCH_H - PLAYER_H) * p.crouchT;
    return { x: p.x + Math.sin(y) * 0.45 - Math.cos(y) * 0.24, y: p.y + h * 0.78, z: p.z + Math.cos(y) * 0.45 + Math.sin(y) * 0.24 };
  }
  hitEnemyRay(e, ox, oy, oz, dx, dy, dz, maxT) {
    if (e.flyer) {
      // sphere
      const fx = ox - e.x;
      const fy = oy - e.y;
      const fz = oz - e.z;
      const b = fx * dx + fy * dy + fz * dz;
      const c = fx * fx + fy * fy + fz * fz - e.r * e.r;
      const disc = b * b - c;
      if (disc < 0) return -1;
      const t = -b - Math.sqrt(disc);
      return t >= 0 && t <= maxT ? t : -1;
    }
    const h = e.crouch ? e.h * 0.62 : e.h;
    return rayCylinder(ox, oy, oz, dx, dy, dz, e.x, e.z, e.r, e.y, e.y + h, maxT);
  }

  playerFire() {
    const W = this.wpn;
    const S = W.stats;
    const p = this.player;
    if (this.mag <= 0) {
      if (!this.startReload()) this.emit({ type: "dryFire" });
      return;
    }
    this.P.mags[W.uid] = this.mag - 1;
    W.fireT = S.interval;
    p.faceT = 0.9;
    this.combatT = this.time;
    const aim = this.aimPoint();
    const m = this.muzzle();
    let dx = aim.x - m.x;
    let dy = aim.y - m.y;
    let dz = aim.z - m.z;
    const L = Math.hypot(dx, dy, dz) || 1;
    dx /= L;
    dy /= L;
    dz /= L;
    // spread: hip vs aimed, movement, crouch, air, sustained-fire bloom
    let spread = S.spread * (this.aimT > 0.5 ? 0.42 : 1) * (1 + Math.min(1.2, p.speed / 5)) * (p.crouchT > 0.5 ? 0.78 : 1) * (p.onGround ? 1 : 1.8) * (1 + this.bloom);
    if (S.pellets > 1) spread = S.spread * (this.aimT > 0.5 ? 0.8 : 1);
    this.bloom = Math.min(1.5, this.bloom + 0.12 * (S.recoil / 1.5));
    const aimedBonus = this.aimT > 0.5 ? this.D.aimDmg : 0;
    this.P.stats.shots++;
    let anyHit = false;
    for (let k = 0; k < S.pellets; k++) {
      // random direction inside the cone
      const a = this.rand() * Math.PI * 2;
      const r = Math.sqrt(this.rand()) * spread;
      // basis perpendicular to d
      const ux = -dz;
      const uz = dx;
      const ul = Math.hypot(ux, uz) || 1;
      const vx = (dy * uz) / ul;
      const vy = (dz * ux - dx * uz) / ul;
      const vz = (-dy * ux) / ul;
      let bx = dx + (ux / ul) * Math.cos(a) * r + vx * Math.sin(a) * r;
      let by = dy + vy * Math.sin(a) * r;
      let bz = dz + (uz / ul) * Math.cos(a) * r + vz * Math.sin(a) * r;
      const bl = Math.hypot(bx, by, bz);
      bx /= bl;
      by /= bl;
      bz /= bl;
      if (this.traceShot(m, bx, by, bz, S, aimedBonus)) anyHit = true;
    }
    if (anyHit) this.P.stats.hits++;
    // recoil kick
    const kick = (S.recoil * Math.PI) / 180;
    this.recoil = (this.recoil || 0) + kick * (this.aimT > 0.5 ? 0.55 : 0.8);
    this.camYaw += (this.rand() - 0.5) * kick * 0.35;
    this.emit({ type: "fire", weapon: W.def.type, sound: W.def.sound, x: m.x, y: m.y, z: m.z });
    hearNoise(this, p.x, p.z, W.def.type === "energy" ? 26 : 34, true);
    for (const c of this.civilians) if (dist(c.x, c.z, p.x, p.z) < 30) c.flee = 6;
  }

  /** One bullet: static geometry, enemies (pierce), destructible orbs. */
  traceShot(m, dx, dy, dz, S, aimedBonus) {
    const range = S.range * 1.6;
    const wall = raycast(this.map, m.x, m.y, m.z, dx, dy, dz, range);
    let maxT = wall ? wall.t : range;
    // shootable orbs
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i];
      if (!b.hp) continue;
      const fx = m.x - b.x;
      const fy = m.y - b.y;
      const fz = m.z - b.z;
      const bb = fx * dx + fy * dy + fz * dz;
      const cc = fx * fx + fy * fy + fz * fz - (b.size + 0.25) ** 2;
      if (bb * bb - cc >= 0 && -bb > 0 && -bb < maxT) {
        this.bolts.splice(i, 1);
        this.emit({ type: "impact", x: b.x, y: b.y, z: b.z, kind: "orb" });
        maxT = -bb;
        return true;
      }
    }
    const hits = [];
    for (const e of this.enemies) {
      if (e.state === "dead") continue;
      const t = this.hitEnemyRay(e, m.x, m.y, m.z, dx, dy, dz, maxT);
      if (t >= 0) hits.push([t, e]);
    }
    hits.sort((a, b) => a[0] - b[0]);
    let pierce = S.pierce;
    let endT = maxT;
    let hitAny = false;
    for (const [t, e] of hits) {
      if (pierce <= 0) break;
      const hy = m.y + dy * t;
      const head = !e.flyer && hy > e.y + e.h * (e.crouch ? 0.5 : 0.82);
      const falloff = 1 - 0.45 * clamp((t - S.range * 0.5) / (S.range * 0.5), 0, 1);
      let dmg = S.dmg * falloff * (1 + aimedBonus);
      const crit = head || this.rand() < S.crit;
      if (crit) dmg *= head ? S.critMult * 0.9 + 0.1 : S.critMult;
      this.damageEnemy(e, dmg, { crit, head, dx, dz, robotMult: S.vsRobot, energy: S.type === "energy", x: m.x + dx * t, y: hy, z: m.z + dz * t });
      hitAny = true;
      pierce--;
      endT = t;
    }
    if (pierce > 0 || !hitAny) endT = maxT;
    const ex = m.x + dx * endT;
    const ey = m.y + dy * endT;
    const ez = m.z + dz * endT;
    this.emit({ type: "tracer", x0: m.x, y0: m.y, z0: m.z, x1: ex, y1: ey, z1: ez, weapon: S.type });
    if (!hitAny && wall) this.emit({ type: "impact", x: ex, y: ey, z: ez, nx: wall.nx, ny: wall.ny, nz: wall.nz, kind: "wall" });
    return hitAny;
  }

  damageEnemy(e, dmg, info = {}) {
    if (e.state === "dead") return 0;
    if (e.boss) {
      const m = bossDamageMult(e, info.dx || 0, info.dz || 0);
      if (m === 0) {
        this.emit({ type: "immune", x: info.x ?? e.x, y: info.y ?? e.y + 1.5, z: info.z ?? e.z });
        return 0;
      }
      dmg *= m;
      if (e.boss.cloak) e.boss.revealT = 0.6;
    }
    if (e.robot) dmg *= info.robotMult || 1;
    if (info.melee && e.boss) dmg *= 0.8;
    // shields absorb first (energy weapons ×1.5 against them)
    if (e.shield > 0) {
      const sd = dmg * (info.energy ? 1.5 : 1);
      const absorbed = Math.min(e.shield, sd);
      e.shield -= absorbed;
      e.shieldDelay = 3.5;
      dmg -= absorbed / (info.energy ? 1.5 : 1);
      if (e.shield <= 0) this.emit({ type: "shieldBreak", id: e.id, x: e.x, y: e.y + 1.2, z: e.z });
    }
    if (!e.boss) dmg *= 1 - (e.def.armor || 0) * (info.energy ? 0.5 : 1);
    dmg = Math.max(0, dmg);
    e.hp -= dmg;
    e.lastHitT = this.time;
    if (!e.boss && !e.def.heavy) e.hitT = info.stagger ? 0.6 : 0.16;
    if (info.stagger && e.boss == null) e.vx = e.vz = 0;
    this.emit({ type: "dmg", x: info.x ?? e.x, y: info.y ?? e.y + e.h, z: info.z ?? e.z, amount: Math.round(dmg), crit: !!info.crit, head: !!info.head, id: e.id });
    if (e.robot && this.D.stun > 0 && !e.boss && this.rand() < this.D.stun) {
      e.stunT = 1.5;
      this.emit({ type: "stun", id: e.id, x: e.x, y: e.y + 1, z: e.z });
    }
    if (e.hp <= 0) {
      if (e.boss) this.onBossDown(e);
      else this.onEnemyDown(e, info);
    } else if (!e.boss) {
      setAlert(this, e, this.player.x, this.player.z);
      for (const o of this.enemies) if (o !== e && o.state !== "dead" && o.faction === e.faction && o.state !== "combat" && dist(o.x, o.z, e.x, e.z) < 16) setAlert(this, o, this.player.x, this.player.z);
    }
    return dmg;
  }

  onEnemyDown(e, info = {}) {
    killEnemy(this, e);
    const d = e.def;
    this.P.stats.kills++;
    if (info.crit) this.P.stats.crits++;
    const xp = d.xp || 0;
    if (xp) this.gainXp(xp);
    this.emit({ type: "kill", id: e.id, x: e.x, y: e.y + 1, z: e.z, robot: e.robot, flyer: e.flyer, name: e.name, xp, takedown: !!info.takedown });
    if (!e.noLoot) this.dropLoot(e);
    if (e.dropsQuest) this.spawnPickup({ kind: "stack", item: e.dropsQuest, amount: 1, x: e.x, z: e.z, mission: true, big: true });
    this.missions.onKill(e);
  }

  onBossDown(e) {
    const B = BOSSES[e.boss.id];
    bossDefeated(this, e);
    this.boss = null;
    this.P.story.bosses[e.boss.id] = true;
    this.P.story.flags[B.flag] = true;
    this.P.stats.kills++;
    this.gainXp(B.xp);
    addCredits(this.P, B.credits);
    const r = B.reward;
    let item = null;
    if (r.weapon && !this.P.weapons.some((w) => w.id === r.weapon[0])) {
      item = addWeapon(this.P, r.weapon[0], r.weapon[1], 0);
    }
    for (const [id, n] of Object.entries(r.stacks || {})) addStack(this.P, id, n);
    this.P.sp += 1; // bosses grant a bonus skill point
    this.emit({ type: "bossDown", boss: e.boss.id, name: B.name, xp: B.xp, credits: B.credits, item: item ? WEAPONS[item.id].name : null, stacks: r.stacks, x: e.x, y: e.y + 1, z: e.z });
    this.missions.onBossDown(e.boss.id);
  }

  gainXp(n) {
    const lv = addXp(this.P, n);
    if (lv > 0) {
      this.refreshStats();
      this.player.hp = this.D.maxHp;
      this.player.armor = this.D.armorCap;
      this.emit({ type: "levelUp", level: this.P.level, sp: this.P.sp });
    }
    this.emit({ type: "xp", amount: Math.round(n) });
  }

  dropLoot(e) {
    const d = e.def;
    const [c0, c1] = d.credits || [0, 0];
    const cr = Math.round(c0 + (c1 - c0) * this.rand());
    if (cr > 0) this.spawnPickup({ kind: "credits", amount: cr, x: e.x, z: e.z });
    for (const [id, ch] of Object.entries(d.drops || {})) {
      if (this.rand() > ch) continue;
      if (id === "ammo") {
        // ammo for something the player actually carries (never wasted on the pistol)
        const types = ["w1", "w2"].map((s) => weaponByUid(this.P, this.P.equip[s])).filter(Boolean).map((w) => WEAPONS[w.id].ammo).filter((a) => a && !AMMO[a].unlimited);
        if (!types.length) continue;
        const a = types[Math.floor(this.rand() * types.length)];
        const amt = { light: 24, heavy: 6, shell: 6, rifle: 22, cell: 12 }[a];
        this.spawnPickup({ kind: "ammo", item: a, amount: amt, x: e.x + 0.4, z: e.z });
      } else this.spawnPickup({ kind: "stack", item: id, amount: 1, x: e.x - 0.4, z: e.z + 0.3 });
    }
  }
  spawnPickup(p) {
    p.id = (this._pid = (this._pid || 0) + 1);
    p.y = p.y || 0;
    p.t = 0;
    p.vx = (this.rand() - 0.5) * 2;
    p.vz = (this.rand() - 0.5) * 2;
    const n = nearestWalkable(this.map, p.x, p.z, 3);
    if (n && !p.exact) {
      p.x = n.x + (p.x - Math.round(p.x)) * 0.3;
      p.z = n.z + (p.z - Math.round(p.z)) * 0.3;
    }
    this.pickups.push(p);
    return p;
  }

  /* ============================================================ melee */
  /** Unaware enemy within reach, seen from behind → instant silent takedown. */
  tryTakedown() {
    const p = this.player;
    for (const e of this.enemies) {
      if (e.state === "dead" || e.boss || e.robot || e.flyer || e.state === "combat" || e.state === "retreat") continue;
      if (dist(e.x, e.z, p.x, p.z) > 2.0 || Math.abs(e.y - p.y) > 1) continue;
      const behind = Math.abs(wrapAngle(yawOf(p.x - e.x, p.z - e.z) - e.yaw)) > 1.9;
      if (!behind) continue;
      this.damageEnemy(e, e.hp + 1, { takedown: true, x: e.x, y: e.y + 1.4, z: e.z, melee: true });
      this.emit({ type: "takedown", id: e.id });
      this.emit({ type: "melee", combo: 0, blade: false });
      this.wpn.swingT = 0.5;
      this.wpn.swingHit = true;
      this.wpn.swingBlade = false;
      this.wpn.combo = 1;
      p.faceT = 0.6;
      p.yaw = yawOf(e.x - p.x, e.z - p.z);
      return true;
    }
    return false;
  }
  playerMelee(heavy = false) {
    const W = this.wpn;
    const blade = W.def?.melee ? W : null;
    const p = this.player;
    const now = this.time;
    if (W.swingT <= 0 && this.tryTakedown()) return;
    if (W.swingT > 0) {
      W.queued = true;
      return;
    }
    W.combo = now - W.comboT < 0.85 ? (W.combo + 1) % 3 : 0;
    W.comboT = now;
    const speed = 1 + (this.P.skills.brawler || 0) * 0.12;
    W.swingT = (blade ? [0.42, 0.46, 0.62][W.combo] : 0.48) / speed;
    W.swingHit = false;
    W.swingAt = W.swingT - 0.15 / speed;
    W.swingBlade = !!blade;
    p.faceT = 0.8;
    this.emit({ type: "melee", combo: W.combo, blade: !!blade });
  }
  meleeStrike() {
    const W = this.wpn;
    const p = this.player;
    const blade = W.swingBlade;
    const S = blade ? W.stats : null;
    const reach = blade ? S.reach : 1.9;
    const arc = blade ? S.arc : 1.4;
    const base = blade ? S.dmg * (W.combo === 2 ? 1.5 : 1) : 20 * this.D.meleeMult;
    const yaw = this.camYaw;
    let hit = 0;
    for (const e of this.enemies) {
      if (e.state === "dead") continue;
      const d = dist(e.x, e.z, p.x, p.z);
      if (d > reach + e.r) continue;
      if (Math.abs(e.y + (e.flyer ? 0 : 1) - (p.y + 1)) > 2.2) continue;
      const ang = Math.abs(wrapAngle(yawOf(e.x - p.x, e.z - p.z) - yaw));
      if (ang > arc / 2 + 0.25) continue;
      if (!lineOfSight(this.map, p.x, p.y + 1.2, p.z, e.x, e.y + 1, e.z)) continue;
      // silent takedown: unaware enemy, struck from behind
      const behind = Math.abs(wrapAngle(yawOf(p.x - e.x, p.z - e.z) - e.yaw)) > 1.9;
      if (!e.boss && !e.robot && e.state !== "combat" && e.state !== "retreat" && behind) {
        this.damageEnemy(e, e.hp + 1, { takedown: true, x: e.x, y: e.y + 1.4, z: e.z, melee: true });
        this.emit({ type: "takedown", id: e.id });
        hit++;
        continue;
      }
      const crit = this.rand() < this.D.crit;
      this.damageEnemy(e, base * (crit ? this.D.critMult : 1), { crit, melee: true, stagger: W.combo === 2 || !blade, dx: Math.sin(yaw), dz: Math.cos(yaw), x: e.x, y: e.y + (e.flyer ? 0 : 1.3), z: e.z, robotMult: 1 });
      hit++;
    }
    // melee also destroys orbs
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i];
      if (b.hp && dist(b.x, b.z, p.x, p.z) < reach + 0.5) {
        this.bolts.splice(i, 1);
        this.emit({ type: "impact", x: b.x, y: b.y, z: b.z, kind: "orb" });
      }
    }
    this.missions.onMelee?.(p, reach, yaw);
    this.emit({ type: hit ? "meleeHit" : "meleeMiss", blade });
    if (hit) hearNoise(this, p.x, p.z, 8, true);
  }

  /* ============================================================ enemy attacks */
  enemyShoot(e, w) {
    const p = this.player;
    const ex = e.x + Math.sin(e.yaw) * 0.45;
    const ez = e.z + Math.cos(e.yaw) * 0.45;
    const ey = e.flyer ? e.y - 0.1 : e.y + (e.crouch ? 1.0 : e.h * 0.82);
    const ph = PLAYER_H + (CROUCH_H - PLAYER_H) * p.crouchT;
    let tx = p.x;
    let ty = p.y + ph * 0.6;
    let tz = p.z;
    // harder to hit a fast-moving / rolling / crouched player
    const mv = Math.hypot(p.vx, p.vz);
    let spread = w.spread * (1 + mv * 0.13) * (p.dodgeT > 0 ? 2.5 : 1) * (p.crouchT > 0.5 ? 0.9 : 1);
    const d = Math.hypot(tx - ex, ty - ey, tz - ez);
    spread *= 1 + Math.max(0, d - 15) / 30;
    if (w.kind === "bolt") {
      // lead the target a little
      const t = d / (w.boltSpeed || 30);
      tx += p.vx * t * 0.5;
      tz += p.vz * t * 0.5;
    }
    let dx = tx - ex;
    let dy = ty - ey;
    let dz = tz - ez;
    const L = Math.hypot(dx, dy, dz) || 1;
    dx /= L;
    dy /= L;
    dz /= L;
    const pellets = w.pellets || 1;
    for (let k = 0; k < pellets; k++) {
      const sx = dx + (this.rand() - 0.5) * 2 * spread;
      const sy = dy + (this.rand() - 0.5) * 1.2 * spread;
      const sz = dz + (this.rand() - 0.5) * 2 * spread;
      const sl = Math.hypot(sx, sy, sz);
      if (w.kind === "bolt") this.fireBolt(ex, ey, ez, sx / sl, sy / sl, sz / sl, w.boltSpeed || 30, w.dmg * (this.dmgScale || 1), { color: w.energy ? "#7b8cff" : "#ff3b5c", owner: e.id });
      else this.enemyHitscan(e, ex, ey, ez, sx / sl, sy / sl, sz / sl, w.dmg * (this.dmgScale || 1), w.range * 1.4);
    }
    this.emit({ type: "enemyFire", id: e.id, x: ex, y: ey, z: ez, kind: w.kind, robot: e.robot, flyer: e.flyer });
  }
  enemyHitscan(e, ox, oy, oz, dx, dy, dz, dmg, range) {
    const p = this.player;
    const wall = raycast(this.map, ox, oy, oz, dx, dy, dz, range);
    const maxT = wall ? wall.t : range;
    const ph = PLAYER_H + (CROUCH_H - PLAYER_H) * p.crouchT;
    const t = p.dead ? -1 : rayCylinder(ox, oy, oz, dx, dy, dz, p.x, p.z, PLAYER_R + 0.05, p.y, p.y + ph, maxT);
    const end = t >= 0 ? t : maxT;
    this.emit({ type: "etracer", x0: ox, y0: oy, z0: oz, x1: ox + dx * end, y1: oy + dy * end, z1: oz + dz * end });
    if (t >= 0) this.damagePlayer(dmg, e, "bullet");
    else if (wall && this.rand() < 0.3) this.emit({ type: "impact", x: ox + dx * end, y: oy + dy * end, z: oz + dz * end, nx: wall.nx, ny: wall.ny, nz: wall.nz, kind: "wall", small: true });
    else if (dist(ox + dx * end, oz + dz * end, p.x, p.z) < 6 || this.nearMiss(ox, oz, dx, dz)) this.emit({ type: "whizz" });
  }
  nearMiss(ox, oz, dx, dz) {
    const p = this.player;
    const t = (p.x - ox) * dx + (p.z - oz) * dz;
    if (t < 0) return false;
    const px = ox + dx * t - p.x;
    const pz = oz + dz * t - p.z;
    return px * px + pz * pz < 2.5;
  }
  bossHitscan(e, s, dmg, range) {
    this.enemyHitscan(e, s.m.x, s.m.y, s.m.z, s.dx, s.dy, s.dz, dmg, range);
    this.emit({ type: "enemyFire", id: e.id, x: s.m.x, y: s.m.y, z: s.m.z, kind: "hitscan", boss: true });
  }
  fireBolt(x, y, z, dx, dy, dz, speed, dmg, opts = {}) {
    this.bolts.push({ x, y, z, vx: dx * speed, vy: dy * speed, vz: dz * speed, speed, dmg, life: opts.life ?? 3, owner: opts.owner, color: opts.color || "#ff3b5c", size: opts.size || 0.14, homing: opts.homing || 0, hp: opts.hp || 0, id: (this._bid = (this._bid || 0) + 1) });
  }

  /* ============================================================ player damage */
  damagePlayer(amount, src = null, kind = "bullet", opts = {}) {
    const p = this.player;
    if (p.dead || this.cinematic || this.godMode) return 0;
    if (p.iframes > 0 || p.dodgeT > 0.12) {
      this.emit({ type: "dodged" });
      return 0;
    }
    let d = amount * (1 - this.D.dr) * (this.difficultyMult || 1);
    // energy shield cyberware
    if (this.buffs.shield > 0 && this.buffs.shieldHp > 0) {
      const a = Math.min(this.buffs.shieldHp, d);
      this.buffs.shieldHp -= a;
      d -= a;
      this.emit({ type: "shieldHit" });
      if (this.buffs.shieldHp <= 0) this.buffs.shield = 0;
      if (d <= 0) return 0;
    }
    // armour plating soaks 70% while it lasts
    if (p.armor > 0) {
      const soak = Math.min(p.armor, d * 0.7);
      p.armor -= soak;
      d -= soak;
    }
    p.hp -= d;
    this.lastHurtT = this.time;
    this.combatT = this.time;
    if (opts.knock) {
      p.vx += opts.knock[0];
      p.vz += opts.knock[1];
    }
    const dir = src ? yawOf(src.x - p.x, src.z - p.z) : null;
    this.emit({ type: "hurt", amount: Math.round(amount), dir, kind });
    if (p.hp <= this.D.maxHp * 0.3 && this.D.biomon && this.cds.biomon <= 0 && p.hp > 0) {
      p.hp = Math.min(this.D.maxHp, p.hp + this.D.biomon);
      this.cds.biomon = 60;
      this.emit({ type: "biomon" });
    }
    if (p.hp <= 0) {
      if (this.D.unbreakable && this.cds.unbreak <= 0) {
        p.hp = 1;
        p.iframes = 2;
        this.cds.unbreak = 90;
        this.emit({ type: "unbreakable" });
      } else this.playerDie(kind);
    }
    return d;
  }
  playerDie(cause) {
    const p = this.player;
    if (p.dead) return;
    p.dead = true;
    p.hp = 0;
    p.deathT = 0;
    this.P.stats.deaths++;
    this.emit({ type: "death", cause });
    this.missions.onPlayerDeath();
  }
  /** Back on your feet: mission checkpoint, or the district's safe spot. */
  respawn() {
    const lost = Math.min(250, Math.round(this.P.credits * 0.05));
    addCredits(this.P, -lost);
    const at = this.missions.retryPoint() || this.def.spawn;
    for (const e of this.enemies) {
      if (e.state === "combat" || e.state === "suspicious" || e.state === "search") {
        e.state = e.route ? "patrol" : "return";
        e.aware = 0;
        e.lastKnown = null;
        e.token = false;
      }
    }
    this.tokens = 0;
    this.player = createPlayer(at.x, at.z, at.yaw ?? 0, this.D);
    this.camYaw = at.yaw ?? 0;
    this.camPitch = 0.02;
    this.bolts = [];
    this.hazards = [];
    this.buffs = { reflex: 0, shield: 0, shieldHp: 0, neural: 0, stim: 0, stimBoost: 0 };
    // refill the active weapon so the retry starts fair
    this.missions.onRespawn();
    this.emit({ type: "respawn", lost });
  }

  /* ============================================================ abilities / items */
  useAbility() {
    const id = this.P.cyber.equipped.os;
    const p = this.player;
    if (!id) {
      this.emit({ type: "notice", text: "No active cyberware installed (visit Doc Rhee)." });
      return false;
    }
    const c = CYBERWARE[id];
    if (this.cds.ability > 0) {
      this.emit({ type: "notice", text: `${c.name} recharging (${Math.ceil(this.cds.ability)} s)` });
      return false;
    }
    if (p.energy < c.energy) {
      this.emit({ type: "notice", text: "Not enough cyber energy." });
      return false;
    }
    p.energy -= c.energy;
    this.cds.ability = c.cd * (1 - this.D.cdr);
    this.cds.abilityMax = this.cds.ability;
    const B = this.buffs;
    if (c.effect === "speed") B.reflex = c.dur;
    if (c.effect === "shield") {
      B.shield = c.dur;
      B.shieldHp = c.absorb + 10 * this.D.hack;
    }
    if (c.effect === "neural") B.neural = c.dur;
    if (c.effect === "emp") {
      let n = 0;
      for (const e of this.enemies) {
        if (e.state === "dead") continue;
        if (dist(e.x, e.z, p.x, p.z) > c.radius) continue;
        if (e.robot || e.boss?.id === "vex") {
          if (!e.boss) e.stunT = c.dur;
          this.damageEnemy(e, 45, { robotMult: 1, energy: true, x: e.x, y: e.y + 1, z: e.z });
          n++;
        }
        if (e.shield > 0) {
          e.shield = 0;
          e.shieldDelay = 5;
          this.emit({ type: "shieldBreak", id: e.id, x: e.x, y: e.y + 1.2, z: e.z });
        }
      }
      // EMP also fries hostile projectiles
      this.bolts = this.bolts.filter((b) => dist(b.x, b.z, p.x, p.z) > c.radius);
      this.emit({ type: "emp", x: p.x, y: p.y + 1, z: p.z, r: c.radius, n });
    }
    if (this.D.stimBoost > 0) B.stimBoost = 6;
    this.emit({ type: "ability", id, effect: c.effect });
    this.syncWeapon();
    return true;
  }
  useItem(id) {
    const s = STACKS[id];
    const p = this.player;
    if (!s || s.cat !== "consumable" || p.dead) return { ok: false, msg: "Can't use that." };
    if (this.cds.heal > 0) return { ok: false, msg: "Busy." };
    if (s.heal && p.hp >= this.D.maxHp && !(s.armor && p.armor < this.D.armorCap)) return { ok: false, msg: "Health is full." };
    if (s.energy && p.energy >= this.D.maxEnergy) return { ok: false, msg: "Energy is full." };
    if (!takeStack(this.P, id, 1)) return { ok: false, msg: "None left." };
    if (s.heal) p.hp = Math.min(this.D.maxHp, p.hp + s.heal * this.D.heal);
    if (s.armor) p.armor = this.D.armorCap;
    if (s.energy) p.energy = Math.min(this.D.maxEnergy, p.energy + s.energy);
    if (s.stim) {
      this.buffs.stim = s.stim;
      p.stamina = this.D.maxStamina;
    }
    this.cds.heal = 0.9;
    this.emit({ type: "useItem", id });
    return { ok: true, msg: `${s.name} used.` };
  }
  quickHeal() {
    const id = ["medkit", "trauma"].find((k) => this.P.stacks[k] > 0);
    if (!id) {
      this.emit({ type: "notice", text: "No MedKits — buy some from Noodle Nan." });
      return;
    }
    const r = this.useItem(id);
    if (!r.ok) this.emit({ type: "notice", text: r.msg });
  }

  /* ============================================================ interactions */
  interactables() {
    const out = [];
    const st = this.missions;
    for (const n of this.npcs) if (!n.hidden) out.push({ kind: "npc", id: n.id, x: n.x, z: n.z, y: 0, r: 2.3, label: st.npcLabel(n.id) || (n.def.shop ? `Trade with ${n.def.name}` : `Talk to ${n.def.name}`) });
    for (const t of this.def.terminals || []) out.push({ kind: "terminal", id: t.id, x: t.x, z: t.z, y: 0, r: 2.2, label: t.label });
    for (const s of this.def.stations || []) out.push({ kind: "station", id: s.id, x: s.x, z: s.z, y: s.y || 0, r: 2.2, label: s.label });
    for (const o of Object.values(this.objects)) if (o.active && o.interact) out.push({ kind: "object", id: o.id, x: o.x, z: o.z, y: o.y || 0, r: o.r || 2, label: o.label, hold: o.hold, obj: o });
    for (const d of this.def.doors || []) {
      const open = st.doorOpen(d);
      out.push({ kind: "door", id: d.id, x: d.at[0], z: d.at[1], y: 0, r: 2.2, label: open ? d.label : `${d.label} — locked`, door: d, locked: !open });
    }
    return out;
  }
  updateFocus() {
    const p = this.player;
    let best = null;
    let bs = Infinity;
    if (p.dead) {
      this.focus = null;
      return;
    }
    for (const it of this.interactables()) {
      const d = dist(p.x, p.z, it.x, it.z);
      if (d > it.r || Math.abs(p.y - it.y) > 1.8) continue;
      const ang = Math.abs(wrapAngle(yawOf(it.x - p.x, it.z - p.z) - this.camYaw));
      const s = d + ang * 0.8;
      if (s < bs) {
        bs = s;
        best = it;
      }
    }
    this.focus = best;
  }
  interact(pressed, held, dt) {
    const f = this.focus;
    const p = this.player;
    if (!f) {
      this.holdT = 0;
      this.holdId = null;
      return;
    }
    if (f.hold) {
      if (held) {
        if (this.holdId !== f.id) {
          this.holdId = f.id;
          this.holdT = f.obj.progress || 0;
        }
        const rate = f.obj.hack ? 1 + 0.25 * (this.D.hack - 1) : 1;
        this.holdT += dt * rate;
        f.obj.progress = this.holdT;
        this.lockMove = 0.1;
        this.interacting = true;
        if (this.holdT >= f.hold) {
          this.holdT = 0;
          this.holdId = null;
          f.obj.progress = 0;
          this.missions.onObject(f.obj);
        }
      } else {
        this.holdId = null;
        this.interacting = false;
      }
      return;
    }
    if (!pressed) return;
    if (f.kind === "object") this.missions.onObject(f.obj);
    else if (f.kind === "door") {
      if (f.locked) this.emit({ type: "notice", text: "Locked. Not yet." });
      else this.useDoor(f.door);
    }
    else if (f.kind === "npc") {
      const n = this.npcs.find((x) => x.id === f.id);
      n.talkT = 4;
      if (!this.missions.onTalk(f.id)) {
        if (n.def.shop) this.emit({ type: "ui", open: "shop", shop: n.def.shop, npc: f.id });
        else this.emit({ type: "ui", open: "talk", npc: f.id });
      }
    } else if (f.kind === "terminal") this.emit({ type: "ui", open: "contracts" });
    else if (f.kind === "station") {
      if (f.id === "transitGate") this.emit({ type: "ui", open: "transit" });
      else if (f.id === "bed") this.emit({ type: "ui", open: "rest" });
      else if (f.id === "ammoLocker") this.useLocker();
      else if (f.id === "tunnelHatch" || f.id === "tunnelExit" || f.id.startsWith("door:")) this.missions.onStation(f.id);
      else this.missions.onStation(f.id);
    }
    p.faceT = 0.3;
  }
  useDoor(d) {
    const p = this.player;
    const to = d.to;
    const n = nearestWalkable(this.map, to.x, to.z, 3) || to;
    p.x = n.x;
    p.z = n.z;
    p.y = 0;
    p.vx = p.vy = p.vz = 0;
    p.safe = { x: p.x, z: p.z, y: 0 };
    this.camYaw = to.yaw ?? this.camYaw;
    this.camPitch = 0;
    this.bolts = [];
    this.emit({ type: "teleport", door: d.id });
    this.missions.onDoor(d);
  }
  useLocker() {
    if (this.cds.locker > 0) {
      this.emit({ type: "notice", text: `Locker restocking — ${Math.ceil(this.cds.locker)} s` });
      return;
    }
    let got = 0;
    for (const w of this.P.weapons) {
      const a = WEAPONS[w.id].ammo;
      if (!a || AMMO[a].unlimited) continue;
      got += addAmmo(this.P, a, Math.round(magSize(w) * 1.5));
    }
    addStack(this.P, "medkit", this.P.stacks.medkit ? 0 : 1);
    this.cds.locker = 180;
    this.emit({ type: "notice", text: got ? `Ammo locker: +${got} rounds restocked.` : "Ammo locker: you're fully stocked." });
    this.emit({ type: "pickup", kind: "ammo" });
  }
  /** Rest at the safehouse bed: full heal, cooldowns reset (the shell saves). */
  rest() {
    const p = this.player;
    p.hp = this.D.maxHp;
    p.armor = this.D.armorCap;
    p.energy = this.D.maxEnergy;
    p.stamina = this.D.maxStamina;
    this.cds.ability = 0;
    this.emit({ type: "rested" });
  }

  /* ============================================================ main step */
  step(dt, inp) {
    if (this.paused) return;
    this.time += dt;
    this.P.stats.time += dt;
    this.pathBudget = 4;
    const p = this.player;
    const D = this.D;
    const W = this.wpn;
    const B = this.buffs;
    const frozen = !!(this.cinematic || this.dialogue || this.hack);

    // ------------------------------------------------ look (recoil recovers)
    if (!frozen) {
      this.camYaw += inp.dYaw || 0;
      this.camPitch = clamp(this.camPitch + (inp.dPitch || 0), -0.95, 0.8);
    }
    if (this.recoil) {
      const up = Math.min(this.recoil, dt * 9 * Math.max(0.05, this.recoil));
      const k = Math.min(this.recoil, this.recoil * dt * 14);
      this.camPitch = clamp(this.camPitch + k, -0.95, 0.8);
      this.recoil -= k + up * 0;
      if (this.recoil < 1e-4) this.recoil = 0;
    }
    this.bloom = Math.max(0, this.bloom - dt * 2.2);
    const canAct = !frozen && !p.dead;
    const melee = !!W.def?.melee;
    this.aiming = canAct && !!inp.aim && !melee && p.dodgeT <= 0 && !p.sprinting;
    this.aimT = clamp(this.aimT + (this.aiming ? dt * 7 : -dt * 6), 0, 1);

    // ------------------------------------------------ movement
    this.lockMove = Math.max(0, this.lockMove - dt);
    this.slowT = Math.max(0, this.slowT - dt);
    stepPlayer(this, p, frozen ? { mx: 0, mz: 0, yaw: this.camYaw } : { mx: inp.mx || 0, mz: inp.mz || 0, yaw: this.camYaw, sprint: inp.sprint, jump: inp.jump, ctrl: inp.ctrl, crouchKey: inp.crouchKey }, dt);
    if (p.dead) p.deathT = (p.deathT || 0) + dt;

    // ------------------------------------------------ regen + buffs + cooldowns
    for (const k of ["reflex", "shield", "neural", "stim", "stimBoost"]) {
      if (B[k] > 0) {
        B[k] -= dt;
        if (B[k] <= 0) {
          B[k] = 0;
          if (k === "neural" || k === "stimBoost") this.syncWeapon();
          if (k === "shield") B.shieldHp = 0;
        }
      }
    }
    for (const k of ["ability", "biomon", "unbreak", "heal", "locker"]) this.cds[k] = Math.max(0, this.cds[k] - dt);
    if (!p.dead) {
      const since = this.time - this.lastHurtT;
      if (since > D.armorDelay && p.armor < D.armorCap) p.armor = Math.min(D.armorCap, p.armor + D.armorCap * 0.12 * D.armorRegen * dt);
      if (since > 8 && this.time - this.combatT > 8 && p.hp < D.maxHp * D.regenCap) p.hp = Math.min(D.maxHp * D.regenCap, p.hp + 1.5 * D.heal * dt);
      p.energy = Math.min(D.maxEnergy, p.energy + D.energyRegen * dt);
    }

    // ------------------------------------------------ weapon
    W.fireT = Math.max(0, W.fireT - dt);
    W.switchT = Math.max(0, W.switchT - dt);
    if (canAct) {
      if (inp.slot) this.switchTo(inp.slot);
      if (inp.cycle) this.cycleWeapon(inp.cycle);
      if (inp.reload) this.startReload();
      if (inp.ability) this.useAbility();
      if (inp.heal) this.quickHeal();
    }
    if (W.reloadT > 0) {
      W.reloadT -= dt;
      if (W.reloadT <= 0) {
        W.reloadT = 0;
        this.finishReload();
      }
    }
    if (W.swingT > 0) {
      W.swingT -= dt;
      if (!W.swingHit && W.swingT <= W.swingAt) {
        W.swingHit = true;
        this.meleeStrike();
      }
      if (W.swingT <= 0 && W.queued) {
        W.queued = false;
        this.playerMelee();
      }
    }
    const busy = W.switchT > 0 || p.dodgeT > 0 || this.interacting || this.cds.heal > 0.5;
    if (canAct && !busy && W.stats) {
      if (melee) {
        if (inp.firePressed || (inp.fire && W.swingT <= 0)) this.playerMelee();
      } else if (W.reloadT <= 0 && W.fireT <= 0 && (W.stats.auto ? inp.fire : inp.firePressed || (inp.fire && W.bufferedT > this.time))) {
        if (!p.sprinting || true) this.playerFire();
      }
      if (inp.firePressed && !melee && W.fireT > 0) W.bufferedT = this.time + 0.12;
      if (inp.melee && !melee && W.swingT <= 0) {
        // quick melee with the blade if equipped, else a strike
        W.reloadT = 0;
        const bladeUid = this.P.equip.melee;
        if (bladeUid) {
          const prevSlot = this.P.activeSlot;
          this.P.activeSlot = "melee";
          this.syncWeapon();
          this.wpn.switchT = 0;
          this.playerMelee();
          this.wpn.returnTo = prevSlot;
        } else this.playerMelee();
      } else if (inp.melee && melee) this.playerMelee();
    }
    if (this.wpn.returnTo && this.wpn.swingT <= 0 && !inp.melee) {
      const back = this.wpn.returnTo;
      this.wpn.returnTo = null;
      this.P.activeSlot = back;
      this.syncWeapon();
      this.wpn.switchT = 0.15;
    }
    // auto reload on empty when the trigger is released
    if (canAct && W.stats && !melee && this.mag <= 0 && W.reloadT <= 0 && !inp.fire && this.reserve(W.stats.ammo) > 0) this.startReload();

    // ------------------------------------------------ interaction
    this.interacting = false;
    this.updateFocus();
    if (canAct) this.interact(inp.interactPressed, inp.interact, dt);

    // ------------------------------------------------ world (frozen during dialogue, hacking, cinematics)
    if (frozen) {
      this.updateNpcs(dt);
      return;
    }
    for (const e of this.enemies) {
      if (e.boss) updateBoss(this, e, dt);
      else updateEnemy(this, e, dt);
    }
    // cull long-dead enemies
    if (this.enemies.length > 0 && (this._cullT = (this._cullT || 0) + dt) > 2) {
      this._cullT = 0;
      this.enemies = this.enemies.filter((e) => e.state !== "dead" || e.deadT < 14);
    }
    this.tokens = clamp(this.tokens, 0, MAX_TOKENS);
    this.updateBolts(dt);
    this.updateHazards(dt);
    this.updatePickups(dt);
    this.updateNpcs(dt);
    this.missions.update(dt);
  }

  updateBolts(dt) {
    const p = this.player;
    const ph = PLAYER_H + (CROUCH_H - PLAYER_H) * p.crouchT;
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i];
      b.life -= dt;
      if (b.homing && !p.dead) {
        const tx = p.x - b.x;
        const ty = p.y + 1.1 - b.y;
        const tz = p.z - b.z;
        const tl = Math.hypot(tx, ty, tz) || 1;
        const k = Math.min(1, b.homing * dt);
        b.vx += ((tx / tl) * b.speed - b.vx) * k;
        b.vy += ((ty / tl) * b.speed - b.vy) * k;
        b.vz += ((tz / tl) * b.speed - b.vz) * k;
      }
      const sl = Math.hypot(b.vx, b.vy, b.vz) * dt;
      const wall = raycast(this.map, b.x, b.y, b.z, b.vx / (sl / dt), b.vy / (sl / dt), b.vz / (sl / dt), sl);
      const nx = b.x + b.vx * dt;
      const ny = b.y + b.vy * dt;
      const nz = b.z + b.vz * dt;
      // player hit (closest point of the segment to the player axis)
      let hit = false;
      if (!p.dead) {
        const sx = nx - b.x;
        const sz = nz - b.z;
        const L2 = sx * sx + sz * sz || 1e-9;
        const t = clamp(((p.x - b.x) * sx + (p.z - b.z) * sz) / L2, 0, 1);
        const cx = b.x + sx * t;
        const cz = b.z + sz * t;
        const cy = b.y + (ny - b.y) * t;
        if ((cx - p.x) ** 2 + (cz - p.z) ** 2 < (PLAYER_R + b.size) ** 2 && cy > p.y - 0.1 && cy < p.y + ph + 0.1) hit = true;
      }
      if (hit) {
        const dealt = this.damagePlayer(b.dmg, this.enemies.find((e) => e.id === b.owner) || { x: b.x - b.vx, z: b.z - b.vz }, "bolt");
        if (dealt || !(p.iframes > 0 || p.dodgeT > 0.12)) {
          this.bolts.splice(i, 1);
          this.emit({ type: "impact", x: nx, y: ny, z: nz, kind: "boltHit", color: b.color });
          continue;
        }
      }
      if (wall || b.life <= 0 || ny < -0.5) {
        this.bolts.splice(i, 1);
        if (wall) this.emit({ type: "impact", x: wall.x, y: wall.y, z: wall.z, nx: wall.nx, ny: wall.ny, nz: wall.nz, kind: "bolt", color: b.color });
        continue;
      }
      b.x = nx;
      b.y = ny;
      b.z = nz;
    }
  }

  updateHazards(dt) {
    const p = this.player;
    const grounded = p.onGround || p.y < 0.5;
    for (let i = this.hazards.length - 1; i >= 0; i--) {
      const h = this.hazards[i];
      h.t += dt;
      const owner = h.from ? this.enemies.find((e) => e.id === h.from && e.state !== "dead") : null;
      if ((h.from && !owner) || h.t > h.warn + h.life) {
        this.hazards.splice(i, 1);
        continue;
      }
      if (h.kind === "laser" && owner) {
        // track the player until the lock, then fire along the locked line
        const m = { x: owner.x, y: owner.y + owner.h * 0.85, z: owner.z };
        if (h.t < h.warn - h.lock || !h.dir) {
          const tx = p.x - m.x;
          const ty = p.y + 1.15 - m.y;
          const tz = p.z - m.z;
          const tl = Math.hypot(tx, ty, tz) || 1;
          const want = { x: tx / tl, y: ty / tl, z: tz / tl };
          if (!h.dir) h.dir = want;
          else {
            const k = Math.min(1, dt * 5);
            h.dir = { x: h.dir.x + (want.x - h.dir.x) * k, y: h.dir.y + (want.y - h.dir.y) * k, z: h.dir.z + (want.z - h.dir.z) * k };
            const l = Math.hypot(h.dir.x, h.dir.y, h.dir.z);
            h.dir.x /= l;
            h.dir.y /= l;
            h.dir.z /= l;
          }
        }
        h.ox = m.x;
        h.oy = m.y;
        h.oz = m.z;
        const wall = raycast(this.map, m.x, m.y, m.z, h.dir.x, h.dir.y, h.dir.z, 80);
        h.len = wall ? wall.t : 80;
        if (h.t >= h.warn && !h.done) {
          h.done = true;
          const ph = PLAYER_H + (CROUCH_H - PLAYER_H) * p.crouchT;
          const t = rayCylinder(m.x, m.y, m.z, h.dir.x, h.dir.y, h.dir.z, p.x, p.z, PLAYER_R + 0.05, p.y, p.y + ph, h.len);
          this.emit({ type: "laserFire", x0: m.x, y0: m.y, z0: m.z, x1: m.x + h.dir.x * h.len, y1: m.y + h.dir.y * h.len, z1: m.z + h.dir.z * h.len, color: h.color });
          if (t >= 0) this.damagePlayer(h.dmg, owner, "laser");
        }
        continue;
      }
      if (h.kind === "aimline" && owner) {
        h.ox = owner.x;
        h.oz = owner.z;
        h.oy = owner.y + 1.3;
        h.tx = p.x;
        h.ty = p.y + 1.1;
        h.tz = p.z;
        continue;
      }
      if (h.t < h.warn) continue;
      const inside = this.inHazard(h, p);
      if (h.kind === "beam") {
        if (owner) {
          h.x = owner.x;
          h.z = owner.z;
        }
        h.cur = h.ang + h.sweep * clamp((h.t - h.warn) / h.life, 0, 1);
        const ph = PLAYER_H + (CROUCH_H - PLAYER_H) * p.crouchT;
        const dx = p.x - h.x;
        const dz = p.z - h.z;
        const along = dx * Math.sin(h.cur) + dz * Math.cos(h.cur);
        const perp = Math.abs(dx * Math.cos(h.cur) - dz * Math.sin(h.cur));
        if (along > 0 && along < h.len && perp < 0.7 && p.y + ph > h.height && p.y < h.height + 0.3 && (h.hitT ?? -9) < this.time - 0.6) {
          h.hitT = this.time;
          this.damagePlayer(h.dmg, owner, "beam");
        }
        continue;
      }
      if (h.dps) {
        if (inside && (!h.ground || grounded)) {
          this.damagePlayer(h.dps * dt, null, "hazard");
          this.slowT = 0.2;
        }
      } else if (h.dmg && !h.done) {
        h.done = true;
        if (inside && (!h.ground || grounded)) this.damagePlayer(h.dmg, owner || null, "blast");
      }
    }
  }
  inHazard(h, p) {
    if (h.kind === "circle" || h.kind === "pool") return dist(p.x, p.z, h.x, h.z) < h.r + PLAYER_R * 0.5;
    if (h.kind === "ring") {
      const d = dist(p.x, p.z, h.x, h.z);
      return d > h.r0 && d < h.r;
    }
    if (h.kind === "panel" || h.kind === "zone") return p.x > h.x0 && p.x < h.x1 && p.z > h.z0 && p.z < h.z1;
    if (h.kind === "line") {
      const dx = p.x - h.x;
      const dz = p.z - h.z;
      const along = dx * Math.sin(h.ang) + dz * Math.cos(h.ang);
      const perp = Math.abs(dx * Math.cos(h.ang) - dz * Math.sin(h.ang));
      return along > 0 && along < h.len && perp < h.width / 2;
    }
    return false;
  }

  updatePickups(dt) {
    const p = this.player;
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const k = this.pickups[i];
      k.t += dt;
      if (k.t < 0.4) {
        k.x += k.vx * dt;
        k.z += k.vz * dt;
      }
      const d = dist(k.x, k.z, p.x, p.z);
      if (p.dead || k.t < 0.35) continue;
      if (d < 4 && k.kind !== "stack") {
        // magnet
        k.x += (p.x - k.x) * Math.min(1, dt * 6);
        k.z += (p.z - k.z) * Math.min(1, dt * 6);
      }
      if (d < 1.3 && Math.abs(k.y - p.y) < 2) {
        let ok = true;
        if (k.kind === "credits") {
          addCredits(this.P, k.amount);
          this.emit({ type: "pickup", kind: "credits", amount: k.amount });
        } else if (k.kind === "ammo") {
          const got = addAmmo(this.P, k.item, k.amount);
          if (got <= 0) ok = false;
          else this.emit({ type: "pickup", kind: "ammo", amount: got, item: AMMO[k.item].name });
        } else if (k.kind === "stack") {
          const got = addStack(this.P, k.item, k.amount);
          if (got <= 0) ok = !!STACKS[k.item] && STACKS[k.item].cat === "quest";
          else this.emit({ type: "pickup", kind: STACKS[k.item].cat, amount: got, item: STACKS[k.item].name, quest: STACKS[k.item].cat === "quest" });
          if (got > 0) this.missions.onPickup(k.item);
        }
        if (ok) this.pickups.splice(i, 1);
      } else if (k.t > 120 && !k.mission) this.pickups.splice(i, 1);
    }
  }

  updateNpcs(dt) {
    const p = this.player;
    for (const n of this.npcs) {
      const d = dist(n.x, n.z, p.x, p.z);
      n.talkT = Math.max(0, n.talkT - dt);
      const target = d < 5 && !p.dead ? yawOf(p.x - n.x, p.z - n.z) : n.home.yaw;
      const dy = wrapAngle(target - n.yaw);
      n.yaw += clamp(dy, -dt * 3, dt * 3);
    }
    const shots = this.time - this.combatT < 4;
    for (const c of this.civilians) {
      c.flee = Math.max(0, c.flee - dt);
      const wp = c.route[c.i % c.route.length];
      let tx = wp[0];
      let tz = wp[1];
      let sp = c.speed;
      if (c.flee > 0 && shots) {
        sp = 4.2;
        const ax = c.x - p.x;
        const az = c.z - p.z;
        const l = Math.hypot(ax, az) || 1;
        // run along the route, away from the player
        if ((tx - c.x) * ax + (tz - c.z) * az < 0) {
          c.i = (c.i + c.route.length - 1) % c.route.length;
        }
        tx = c.route[c.i % c.route.length][0] + (ax / l) * 0.01;
        tz = c.route[c.i % c.route.length][1];
      }
      const dx = tx - c.x;
      const dz = tz - c.z;
      const dd = Math.hypot(dx, dz);
      if (dd < 0.8) c.i = (c.i + 1) % c.route.length;
      else {
        c.x += (dx / dd) * sp * dt;
        c.z += (dz / dd) * sp * dt;
        c.yaw += clamp(wrapAngle(yawOf(dx, dz) - c.yaw), -dt * 4, dt * 4);
      }
      // stay out of walls; skip a waypoint we can't reach
      const before = c.x + c.z;
      collideCircle(this.map, c, 0.35, 1.7);
      c.stuck = Math.abs(before - (c.x + c.z)) > 1e-3 && dd > 0.8 ? (c.stuck || 0) + dt : 0;
      if (c.stuck > 2.5) {
        c.i = (c.i + 1) % c.route.length;
        c.stuck = 0;
      }
      // step around the player
      const px = c.x - p.x;
      const pz = c.z - p.z;
      const pd = Math.hypot(px, pz);
      if (pd < 0.9 && pd > 1e-3) {
        c.x += (px / pd) * (0.9 - pd);
        c.z += (pz / pd) * (0.9 - pd);
      }
      c.speedNow = sp;
    }
  }

  /** Snapshot of the player's position for the save file. */
  snapshotPos() {
    const p = this.player;
    const inCity = p.x > this.map.origin[0] && p.x < this.map.origin[0] + this.map.cityW && p.z > this.map.origin[1] && p.z < this.map.origin[1] + this.map.cityD;
    if (p.dead || !p.onGround || this.missions.active || !inCity || this.time - this.combatT < 5) return null;
    return { district: this.districtId, x: p.x, z: p.z, yaw: this.camYaw };
  }
}
