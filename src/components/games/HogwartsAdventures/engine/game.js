/**
 * The simulation. Framework-free (runs in node for the tests); the shell
 * steps it at ≤ 1/60 s and drains its event queue each frame for audio,
 * effects and UI.
 *
 *   new Game(profile, { arrival: "new" | "saved" })
 *   step(dt, input) · drain() · interact() · switchHero(id) · respawn()
 */
import { createCollision } from "./collide.js";
import { createNav } from "./nav.js";
import { createObjects } from "./objects.js";
import { createQuests } from "./quests.js";
import { createDialogue } from "./dialogue.js";
import { cameraRig } from "./camera.js";
import { newPlayer, updatePlayer } from "./player.js";
import { makeEnemy, updateEnemy } from "./ai.js";
import { createBoss } from "./boss.js";
import { stepProjectiles, stepZones, hurtPlayer as hurtPlayerC, heal } from "./combat.js";
import { heroStats, grantXp as grantXpP, addItem, removeItem, count as countP, learnSpell } from "./profile.js";
import { rng } from "./math.js";
import { REGIONS, CHECKPOINTS, PITS, ARENA, ROOFS } from "../data/layout.js";
import { GROUPS, ENEMIES } from "../data/enemies.js";
import { NPCS, COMPANION_SPOTS } from "../data/npcs.js";
import { HEROES, HERO_IDS } from "../data/heroes.js";
import { SPELLS } from "../data/spells.js";
import { ITEMS } from "../data/items.js";
import { talkTo } from "../data/dialogue.js";

const REGION_CHECKPOINT = { courtyard: "courtyard", greathall: "greathall", library: "library", restricted: "library", corridor: "corridor", chasm: "corridor", mirrorhall: "mirrorhall", shaft: "mirrorhall", antechamber: "antechamber", vault: "antechamber", hagrid: "hagrid", forest: "hagrid", pitch: "pitch", arena: "arena" };
const CEILING = { gh: 15.5, west: 11.5, east: 11.5, hidden: 6.6 };
const DISCOVER = new Set(["courtyard", "greathall", "library", "restricted", "classrooms", "charms", "duelling", "corridor", "mirrorhall", "antechamber", "vault", "grounds", "hagrid", "forest", "pitch", "arena"]);

export class Game {
  constructor(profile, opts = {}) {
    this.P = profile;
    this.opts = opts;
    this.rand = rng(opts.seed || 12345);
    this.uid = 0;
    this.events = [];
    this.time = 0;
    this.timers = [];
    this.col = createCollision();
    this.nav = createNav(this.col);
    this.enemies = [];
    this.projectiles = [];
    this.zones = [];
    this.npcs = [];
    this.chain = { n: 0, t: 0 };
    this.dialogue = null;
    this.cinematic = 0;
    this.camYaw = Math.PI;
    this.camPitch = -0.12;
    this.zoom = 1;
    this.protect = null;
    this.boss = null;
    this.bossActive = false;
    this.focus = null;
    this.region = null;
    this.regionSet = new Set();
    this.checkT = 0;
    this.forestT = 0;
    this.victory = false;
    this.refreshStats();
    this.objects = createObjects(this);
    this.quests = createQuests(this);
    this.dlg = createDialogue(this);
    // where do we start?
    let at = CHECKPOINTS.courtyard;
    const arena = this.P.flags.arena && this.questState("finale") === "active";
    if (opts.arrival === "saved" && this.P.pos && !arena) at = this.P.pos;
    else if (opts.arrival !== "new" && this.P.checkpoint && CHECKPOINTS[this.P.checkpoint] && !arena) at = CHECKPOINTS[this.P.checkpoint];
    if (arena) at = CHECKPOINTS.arena;
    this.player = newPlayer(this, at);
    this.camYaw = at.yaw ?? Math.PI;
    if (this.P.pos?.lumos) this.player.lumos = false;
    this.spawnGroup("dummies");
    this.buildNpcs();
    if (!this.P.quests.meet) this.quests.start("meet");
    else this.quests.resume();
    if (arena) this.enterArena(true);
    this.updateRegions(true);
    this.cam = cameraRig(this);
  }

  /* ------------------------------------------------------------ events */
  emit(ev) {
    this.events.push(ev);
  }
  drain() {
    const e = this.events;
    this.events = [];
    return e;
  }
  later(t, fn) {
    this.timers.push({ t, fn });
  }

  /* ------------------------------------------------------------ state helpers */
  questState(id) {
    return this.quests ? this.quests.state(id) : this.P.quests[id]?.state || "none";
  }
  questStage(id) {
    return this.P.quests[id]?.stage ?? -1;
  }
  flag(f) {
    return !!this.P.flags[f];
  }
  setFlag(f, v = true, quiet = false) {
    if (!!this.P.flags[f] === !!v) return;
    this.P.flags[f] = v;
    if (!quiet) this.quests?.onFlag(f);
    else this.later(0, () => this.quests.onFlag(f));
  }
  objOpen(id) {
    const o = this.objects.byId[id];
    return !!(o && (o.st.open || o.st.unlocked || o.st.repaired || o.st.burned));
  }
  hasItem(id) {
    return countP(this.P, id) > 0;
  }
  count(id) {
    return countP(this.P, id);
  }
  give(id, n = 1, quiet = false) {
    addItem(this.P, id, n);
    this.emit({ type: "item", id, n, quiet });
    this.quests?.onInventory();
  }
  take(id, n = 1) {
    removeItem(this.P, id, n);
    this.quests?.onInventory();
  }
  addGold(n, quiet = false) {
    this.P.gold += n;
    this.emit({ type: "gold", n, quiet });
  }
  grantXp(n) {
    const before = this.stats.maxHp;
    const ups = grantXpP(this.P, n);
    this.emit({ type: "xp", n });
    for (const u of ups) {
      if (u.hero === this.P.hero) {
        this.refreshStats();
        const p = this.player;
        if (p) {
          p.hp = Math.min(this.stats.maxHp, p.hp + (this.stats.maxHp - before) + this.stats.maxHp * 0.25);
          p.mana = this.stats.maxMana;
        }
        this.emit({ type: "levelUp", hero: u.hero, level: u.level, x: p?.x, y: p?.y, z: p?.z });
      } else this.emit({ type: "allyLevel", hero: u.hero, level: u.level });
    }
  }
  learn(id, quiet = false) {
    if (learnSpell(this.P, id) && !quiet) this.emit({ type: "learn", id, name: SPELLS[id].name });
  }
  refreshStats() {
    const old = this.stats;
    this.stats = heroStats(this.P);
    const p = this.player;
    if (p && old) {
      p.hp = Math.min(this.stats.maxHp, p.hp * (old.maxHp ? this.stats.maxHp / old.maxHp : 1));
      p.mana = Math.min(this.stats.maxMana, p.mana);
    }
  }
  inCombat() {
    const p = this.player;
    return this.enemies.some((e) => !e.dead && e.aggro && e.def.ai !== "dummy" && Math.hypot(e.x - p.x, e.z - p.z) < 32);
  }
  alertNear(e) {
    if (!e.group) return false;
    return this.enemies.some((o) => o !== e && !o.dead && o.aggro && o.group === e.group && Math.hypot(o.x - e.x, o.z - e.z) < 16);
  }
  nearPit(x, z) {
    for (const p of PITS) if (x > p.x0 - 1.2 && x < p.x1 + 1.2 && z > p.z0 - 1.2 && z < p.z1 + 1.2) return true;
    return false;
  }
  inRegion(id) {
    return this.regionSet.has(id);
  }
  hurtPlayer(n, o) {
    return hurtPlayerC(this, n, o);
  }

  /* ------------------------------------------------------------ enemies */
  spawnUnits(units, group) {
    for (const [type, x, z] of units) {
      const e = makeEnemy(this, type, x, z, group);
      if (type === "voldemort") {
        e.bossCtl = createBoss(this, e);
        this.boss = e.bossCtl;
      }
      if (this.flag("arena") || group === "bossAdds") e.aggro = true;
      this.enemies.push(e);
      this.emit({ type: "spawn", id: e.id, etype: type, x, z });
    }
  }
  spawnGroup(name, max = Infinity) {
    const G = GROUPS[name];
    if (!G || max <= 0) return;
    if (this.enemies.some((e) => e.group === name && !e.dead)) return;
    if (name === "duel") {
      // your partner is Draco — unless you are Draco
      const u = G.units.slice(0, Math.min(max, G.units.length));
      this.spawnUnits(u, name);
      const e = this.enemies[this.enemies.length - 1];
      e.partner = this.P.hero === "draco" ? "harry" : "draco";
      e.name = HEROES[e.partner].name;
      e.aggro = false;
      e.yaw = -Math.PI / 2;
      return;
    }
    this.spawnUnits(G.units.slice(0, Math.min(max, G.units.length)), name);
  }
  killEnemy(e) {
    if (e.bossCtl) {
      e.hp = 1;
      return;
    }
    e.dead = true;
    e.hp = 0;
    e.deadT = 0;
    e.wind = null;
    this.P.stats.kills++;
    const xp = e.def.xp;
    if (xp) this.grantXp(xp);
    if (e.def.ai !== "dummy" && !e.def.boss && e.group !== "duel") {
      const gold = 4 + Math.floor(this.rand() * 10);
      this.addGold(gold, true);
      if (this.rand() < 0.12) this.give(this.rand() < 0.6 ? "wiggenweld" : "invigoration", 1);
    }
    if (this.stats.leech) heal(this, this.stats.maxHp * this.stats.leech);
    this.emit({ type: "death", id: e.id, etype: e.type, name: e.name || e.def.name, boss: !!e.def.boss, x: e.x, y: e.y, z: e.z });
    this.quests.onKill(e);
  }
  enemyYield(e) {
    if (e.dead) return;
    e.dead = true;
    e.yielded = true;
    e.deadT = 0;
    this.emit({ type: "yield", id: e.id, name: e.name || e.def.name, x: e.x, y: e.y, z: e.z });
    this.quests.onKill(e);
  }
  bossDefeated(e) {
    e.deadT = 0;
    this.bossActive = false;
    for (const o of this.enemies) if (!o.dead && o !== e) Object.assign(o, { dead: true, deadT: 0 });
    this.projectiles.length = 0;
    this.zones.length = 0;
    this.P.stats.kills++;
    this.grantXp(e.def.xp);
    this.emit({ type: "bossDefeated", x: e.x, y: e.y, z: e.z });
    this.quests.onKill(e);
  }

  /* ------------------------------------------------------------ protect */
  setProtect(npcId) {
    if (!npcId) {
      if (this.protect) this.protect.protected = false;
      this.protect = null;
      return;
    }
    const n = this.npcs.find((x) => x.id === npcId);
    if (!n) return;
    n.maxHp = NPCS[npcId].hp || 100;
    n.hp = n.maxHp;
    n.down = false;
    n.protected = true;
    this.protect = n;
  }
  hurtAlly(a, n) {
    if (a.down || !a.protected) return;
    a.hp -= n;
    a.hitT = 0.3;
    this.emit({ type: "allyHurt", id: a.id, n, x: a.x, y: a.y + 2, z: a.z });
    if (a.hp <= 0) {
      a.hp = 0;
      a.down = true;
      this.emit({ type: "protectFail", name: a.def.name });
      // reset the encounter
      this.later(2.2, () => {
        for (const e of this.enemies) if (!e.dead && (e.group === "pitchWave1" || e.group === "pitchWave2")) Object.assign(e, { dead: true, deadT: 99, silent: true });
        this.projectiles.length = 0;
        this.zones.length = 0;
        a.down = false;
        a.hp = a.maxHp;
        this.quests.restartStage("defend", 1);
        this.emit({ type: "notice", text: "Neville is back on his feet. Try again — stay close to him!", kind: "warn" });
      });
    }
  }

  /* ------------------------------------------------------------ npcs */
  buildNpcs() {
    this.npcs = [];
    for (const [id, def] of Object.entries(NPCS)) {
      const at = def.at(this);
      this.npcs.push({ id, def, x: at.x, z: at.z, y: this.col.ground(at.x, at.z, 3), yaw: at.yaw, homeYaw: at.yaw, anim: def.idle, talkRange: def.talkRange || 3.3, wanderTo: null, wanderT: 2 + this.rand() * 4, speed: 0, hp: def.hp || 0, maxHp: def.hp || 0 });
    }
    this.placeCompanions();
  }
  placeCompanions() {
    this.npcs = this.npcs.filter((n) => !n.companion);
    const others = HERO_IDS.filter((h) => h !== this.P.hero);
    others.forEach((h, i) => {
      const s = COMPANION_SPOTS[i];
      this.npcs.push({ id: `companion:${h}`, hero: h, companion: true, def: { name: HEROES[h].name, title: "Your friend", look: HEROES[h].look, idle: "Idle" }, x: s.x, z: s.z, y: 0, yaw: s.yaw, homeYaw: s.yaw, anim: "Idle", talkRange: 3.2, speed: 0 });
    });
    this.emit({ type: "npcsChanged" });
  }
  updateNpcs(dt) {
    const p = this.player;
    this.npcT = (this.npcT || 0) - dt;
    const relocate = this.npcT <= 0;
    if (relocate) this.npcT = 0.5;
    for (const n of this.npcs) {
      if (n.companion) {
        n.hidden = this.flag("arena");
      } else if (relocate) {
        const at = n.def.at(this);
        if (Math.hypot(at.x - (n.homeX ?? at.x), at.z - (n.homeZ ?? at.z)) > 1 || n.homeX == null) {
          if (n.homeX != null) {
            n.x = at.x;
            n.z = at.z;
            n.y = this.col.ground(n.x, n.z, 3);
          }
          n.homeX = at.x;
          n.homeZ = at.z;
          n.homeYaw = at.yaw;
          n.yaw = at.yaw;
        }
        n.hidden = this.flag("arena");
      }
      const near = Math.hypot(p.x - n.x, p.z - n.z) < 4.5 && !p.dead;
      if (n.protected) {
        n.anim = n.down ? "down" : this.inCombat() ? "cower" : "Idle";
        continue;
      }
      if (near || this.dialogue?.npc === n.id) {
        n.yaw = approachYaw(n.yaw, Math.atan2(p.x - n.x, p.z - n.z), dt * 4);
        n.speed = 0;
        n.anim = this.dialogue?.npc === n.id ? "Talk" : n.def.idle || "Idle";
        continue;
      }
      const W = n.def.wander;
      if (W) {
        n.wanderT -= dt;
        if (n.wanderT <= 0) {
          n.wanderT = 4 + this.rand() * 6;
          n.wanderTo = this.rand() < 0.4 ? null : { x: W.x0 + this.rand() * (W.x1 - W.x0), z: W.z0 + this.rand() * (W.z1 - W.z0) };
        }
        if (n.wanderTo) {
          const dx = n.wanderTo.x - n.x;
          const dz = n.wanderTo.z - n.z;
          const d = Math.hypot(dx, dz);
          if (d < 0.3) n.wanderTo = null;
          else {
            n.x += (dx / d) * 1.2 * dt;
            n.z += (dz / d) * 1.2 * dt;
            this.col.resolve(n, 0.35);
            n.yaw = approachYaw(n.yaw, Math.atan2(dx, dz), dt * 5);
            n.speed = 1.2;
            n.anim = "Walk";
            continue;
          }
        }
      }
      n.speed = 0;
      n.anim = n.def.idle || "Idle";
      if (!W) n.yaw = approachYaw(n.yaw, n.homeYaw, dt * 2);
    }
  }

  /* ------------------------------------------------------------ interaction */
  computeFocus() {
    const p = this.player;
    if (p.dead || this.dialogue) return (this.focus = null);
    let best = null;
    let bs = Infinity;
    const fx = Math.sin(p.yaw);
    const fz = Math.cos(p.yaw);
    const consider = (kind, ref, x, z, r, verb, label, extra) => {
      const dx = x - p.x;
      const dz = z - p.z;
      const d = Math.hypot(dx, dz);
      if (d > r) return;
      const facing = d > 0.3 ? (dx * fx + dz * fz) / d : 1;
      const s = d * (1.4 - facing * 0.5);
      if (s < bs) {
        bs = s;
        best = { kind, ref, verb, label, x, z, ...extra };
      }
    };
    for (const n of this.npcs) {
      if (n.hidden || (n.protected && this.inCombat())) continue;
      if (Math.abs(n.y - p.y) > 2) continue;
      consider("npc", n, n.x, n.z, n.talkRange, "Talk to", n.def.name);
    }
    for (const o of this.objects.list) {
      if (o.gone) continue;
      const pr = this.objects.prompt(o);
      if (!pr) continue;
      if (Math.abs((o.type === "mirror" ? 0 : o.y) - p.y) > 2.2) continue;
      const r = o.def.r || (o.type === "ancient" || o.type === "mirror" ? 3.6 : o.type === "portkey" || o.type === "pedestal" ? 2.6 : 2.3);
      consider("obj", o, o.x, o.z, r, pr.verb, pr.label, { deny: pr.deny });
    }
    this.focus = best;
    return best;
  }
  interact() {
    const f = this.focus;
    if (!f) return;
    if (f.kind === "npc") this.talk(f.ref);
    else this.objects.use(f.ref);
  }
  talk(n) {
    if (n.companion) this.dlg.open(n.id, talkTo(n.hero, this, { companion: true, name: HEROES[n.hero].short }));
    else this.dlg.open(n.id, talkTo(n.id, this));
  }
  startDialogue(id, nodes) {
    this.dlg.open(id, nodes);
  }
  dialogueAction(a) {
    if (a.give) this.give(a.give[0], a.give[1]);
    if (a.gold) this.addGold(a.gold);
    if (a.flag) this.setFlag(a.flag);
    if (a.heal) {
      if (this.inCombat()) this.emit({ type: "deny", text: "Not while enemies are near." });
      else {
        this.player.hp = this.stats.maxHp;
        this.player.mana = this.stats.maxMana;
        this.emit({ type: "rested" });
      }
    }
    if (a.shop) this.emit({ type: "openShop" });
    if (a.switchTo) this.switchHero(a.switchTo);
    if (a.portkey) this.enterArena();
  }

  /* ------------------------------------------------------------ heroes */
  switchHero(id) {
    if (!HEROES[id] || id === this.P.hero) return false;
    if (this.inCombat()) {
      this.emit({ type: "deny", text: "You can't switch heroes mid-fight." });
      return false;
    }
    const p = this.player;
    const hpF = p.hp / this.stats.maxHp;
    const prev = this.P.hero;
    this.P.hero = id;
    this.refreshStats();
    p.hp = Math.max(1, this.stats.maxHp * Math.max(0.5, hpF));
    p.mana = this.stats.maxMana;
    p.cds = {};
    p.lumos = false;
    this.placeCompanions();
    this.emit({ type: "heroSwitched", hero: id, prev });
    return true;
  }

  /* ------------------------------------------------------------ arena */
  enterArena(resume = false) {
    this.P.flags.arena = true;
    const c = CHECKPOINTS.arena;
    const p = this.player;
    p.x = c.x;
    p.z = c.z;
    p.y = 0;
    p.vy = 0;
    p.lumos = false;
    this.camYaw = c.yaw;
    this.camPitch = -0.05;
    this.col.setRing({ x: ARENA.x, z: ARENA.z, r: ARENA.r });
    for (const e of this.enemies) if (!e.dead) Object.assign(e, { dead: true, deadT: 99, silent: true });
    this.projectiles.length = 0;
    this.zones.length = 0;
    this.P.checkpoint = "arena";
    this.spawnUnits([["voldemort", ARENA.x, ARENA.z - 16]], "boss");
    this.cinematic = resume ? 2 : 7.5;
    if (resume && this.boss) {
      this.boss.e.state = "intro";
      this.boss.t = 5;
    }
    this.emit({ type: "teleport", name: "The Duelling Ruins", portkey: !resume });
    this.emit({ type: "bossIntro", resume });
    if (!resume) {
      this.later(1.2, () => this.emit({ type: "bossLine", text: "So. The castle sends its children to do its fighting." }));
      this.later(3.8, () => this.emit({ type: "bossLine", text: "Give me the stone, and perhaps I will let you watch your school fall." }));
      this.later(6.2, () => this.emit({ type: "bossLine", text: "No? Then let us duel — properly, this time." }));
    }
  }
  leaveArena() {
    this.P.flags.arena = false;
    this.col.setRing(null);
    this.bossActive = false;
    for (const e of this.enemies) if (!e.dead) Object.assign(e, { dead: true, deadT: 99, silent: true });
    this.boss = null;
    this.obelisks = [];
    const c = CHECKPOINTS.greathall;
    Object.assign(this.player, { x: c.x, z: c.z, y: 0, vy: 0 });
    this.camYaw = c.yaw;
    this.P.checkpoint = "greathall";
    this.emit({ type: "teleport", name: "Hogwarts" });
  }

  /* ------------------------------------------------------------ death */
  playerDie() {
    const p = this.player;
    if (p.dead) return;
    p.dead = true;
    p.lumos = false;
    this.P.stats.deaths++;
    this.emit({ type: "playerDeath" });
  }
  respawn() {
    const p = this.player;
    const arena = this.flag("arena");
    const c = CHECKPOINTS[arena ? "arena" : this.P.checkpoint] || CHECKPOINTS.courtyard;
    Object.assign(p, { x: c.x, z: c.z, y: this.col.ground(c.x, c.z, 20), vy: 0, dead: false, hp: this.stats.maxHp, mana: this.stats.maxMana, stunT: 0, slowT: 0, knock: null, shieldT: 0, dodgeT: 0, cds: {}, buffs: { edurus: 0 }, safe: { x: c.x, z: c.z, y: 0 } });
    this.camYaw = c.yaw;
    this.projectiles.length = 0;
    this.zones.length = 0;
    for (const e of this.enemies) {
      if (e.dead) continue;
      if (e.group === "bossAdds") {
        Object.assign(e, { dead: true, deadT: 99, silent: true });
        continue;
      }
      if (e.bossCtl) continue;
      e.aggro = false;
      e.hp = e.maxHp;
      e.x = e.home.x;
      e.z = e.home.z;
      e.wind = null;
      e.stunT = e.liftT = e.liftH = 0;
    }
    if (arena && this.boss) {
      this.boss.reset();
      this.cinematic = 1.5;
    }
    if (this.protect) {
      for (const e of this.enemies) if (!e.dead && (e.group === "pitchWave1" || e.group === "pitchWave2")) Object.assign(e, { dead: true, deadT: 99, silent: true });
      this.protect.hp = this.protect.maxHp;
      this.protect.down = false;
      this.quests.restartStage("defend", 1);
    }
    this.emit({ type: "respawn", name: c.name });
  }

  /* ------------------------------------------------------------ regions */
  updateRegions(initial = false) {
    const p = this.player;
    const set = new Set();
    let primary = null;
    for (const r of REGIONS) {
      let inside;
      if (r.box) inside = p.x >= r.box[0] && p.x <= r.box[1] && p.z >= r.box[2] && p.z <= r.box[3];
      else inside = Math.hypot(p.x - r.circle[0], p.z - r.circle[1]) <= r.circle[2];
      if (inside) {
        set.add(r.id);
        if (!primary) primary = r;
      }
    }
    const fresh = [...set].filter((id) => !this.regionSet.has(id));
    this.regionSet = set;
    if (primary !== this.region) {
      this.region = primary;
      if (primary) {
        this.emit({ type: "region", id: primary.id, name: primary.name, music: primary.music, atmos: primary.atmos, initial });
        const cp = REGION_CHECKPOINT[primary.id];
        if (cp && cp !== this.P.checkpoint && !(cp === "arena") && !this.flag("arena")) {
          this.P.checkpoint = cp;
          if (!initial) this.emit({ type: "checkpoint", name: CHECKPOINTS[cp].name });
        }
      }
    }
    const roof = primary?.roof;
    this.ceiling = roof ? CEILING[roof] : null;
    this.indoorTight = roof === "hidden";
    this.roofId = roof || null;
    void ROOFS;
    for (const id of fresh) {
      if (DISCOVER.has(id) && !this.P.discovered[id]) {
        this.P.discovered[id] = true;
        if (!initial) this.emit({ type: "discover", id, name: REGIONS.find((r) => r.id === id).name });
      }
      this.quests?.onRegion(id);
    }
  }

  /* ------------------------------------------------------------ main step */
  step(dt, inp) {
    this.time += dt;
    this.P.stats.time += dt;
    // deferred actions
    for (let i = 0; i < this.timers.length; i++) {
      const t = this.timers[i];
      t.t -= dt;
      if (t.t <= 0) {
        this.timers.splice(i--, 1);
        t.fn();
      }
    }
    this.col.updatePlatforms(this.time);
    if (this.cinematic > 0) this.cinematic = Math.max(0, this.cinematic - dt);
    const lockInput = this.dialogue || this.cinematic > 0 || this.victory;
    updatePlayer(this, dt, lockInput ? NO_INPUT_WITH_LOOK(inp, !!this.cinematic) : inp);
    this.objects.update(dt);
    this.bossActive = false;
    for (const e of this.enemies) {
      if (e.bossCtl) e.bossCtl.update(dt);
      else updateEnemy(this, e, dt);
    }
    stepProjectiles(this, dt);
    stepZones(this, dt);
    this.updateNpcs(dt);
    this.updateRegions();
    this.computeFocus();
    if (this.chain.t > 0) this.chain.t = Math.max(0, this.chain.t - dt);
    else this.chain.n = 0;
    // tidy the dead
    this.enemies = this.enemies.filter((e) => !(e.dead && e.deadT > (e.silent ? 0 : 6) && !e.bossCtl) && !(e.bossCtl && e.dead && e.deadT > 30));
    for (const e of this.enemies) if (e.dead && e.bossCtl) e.deadT += dt;
    // forest spiders: present once the web is gone, back again after a while
    if (this.objOpen("web") && this.inRegion("forest")) {
      this.forestT -= dt;
      if (this.forestT <= 0 && !this.enemies.some((e) => e.group === "forestSpiders")) {
        this.spawnGroup("forestSpiders");
        this.forestT = GROUPS.forestSpiders.respawn;
      }
    }
    this.checkT -= dt;
    if (this.checkT <= 0) {
      this.checkT = 0.5;
      this.quests.check();
    }
    this.cam = cameraRig(this, this.cam || {});
  }

  /* ------------------------------------------------------------ save */
  snapshot() {
    const p = this.player;
    if (this.flag("arena")) return null;
    if (p.dead) return null;
    return { x: p.safe.x, y: p.safe.y, z: p.safe.z, yaw: this.camYaw };
  }
  /** Quest onComplete hook: victory screen after the final duel. */
  onQuestDone(id) {
    if (id === "finale") {
      this.victory = true;
      this.setFlag("victory", true, true);
      this.emit({ type: "victory" });
    }
  }
}

function approachYaw(a, b, step) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return Math.abs(d) <= step ? b : a + Math.sign(d) * step;
}
function NO_INPUT_WITH_LOOK(inp, cine) {
  return { mx: 0, mz: 0, dYaw: cine ? 0 : inp.dYaw, dPitch: cine ? 0 : inp.dPitch, sprint: false, dodge: false, cast: { down: false, pressed: false }, aim: false, interact: false, shield: false, q: false, r: false, potion: 0, lumos: false, slot: null, cycle: 0 };
}
export const NO_INPUT = NO_INPUT_WITH_LOOK({ dYaw: 0, dPitch: 0 }, true);
export { ENEMIES, ITEMS };
