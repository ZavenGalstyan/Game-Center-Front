/**
 * The running game: owns the profile, the static world, every live actor
 * and the fixed-step simulation. The React shell feeds input and drains
 * events; the renderer reads state. Framework-free (runs in node tests).
 */
import { getWorld } from "./world.js";
import { rng, clamp } from "./math.js";
import { computeStats, createInventory, addXp as profAddXp, byUid, itemDef } from "./profile.js";
import { createQuests, resolveMarker } from "./quests.js";
import { createDialogue } from "./dialogue.js";
import { check, applyEffects as applyFx } from "./conditions.js";
import { createPlayer, stepPlayer, drinkPotion, integrate } from "./player.js";
import { createEnemy, stepEnemy, createAlly, stepAlly, stepNpc, createWild, stepWild } from "./ai.js";
import { createDragon, stepDragon, ballistaHit, resolveDragonFate } from "./dragon.js";
import { stepProjectiles, stepZones, spawnProjectile, applyDamage } from "./combat.js";
import { cameraRig } from "./camera.js";
import { LOCATIONS, REGIONS, INTERIORS, WORLD } from "../data/worldmap.js";
import { NPCS, GUARDS, VILLAGERS, BARKS, WILDLIFE, LOOKS } from "../data/npcs.js";
import { SPAWNS, SIEGE_ALLIES } from "../data/spawns.js";
import { LOOT, CHEST_LOOT, ITEMS } from "../data/items.js";
import { ICELL } from "../data/interiors.js";
import { HEROES } from "../data/heroes.js";

const CLUE_TEXT = {
  clue_cart: "An overturned courier's cart, its royal-blue paint scorched. The satchel straps were cut, not torn.",
  clue_cloak: "A torn Warden tabard snagged on a branch — the kind a royal courier wears. Boot prints lead off the road.",
  clue_arrows: "Red-fletched arrows in a birch trunk: Red Hand arrows. The trail of boots bends north-west into the deep wood.",
};

export class Game {
  constructor(P, opts = {}) {
    this.P = P;
    this.opts = opts;
    this.W = getWorld();
    this.rand = rng((opts.seed ?? 1234) >>> 0);
    this.nextId = 1;
    this.events = [];
    this.uiQueue = [];
    this.time = 0;
    this.hour = P.hour ?? 8.5;
    this.paused = false;
    this.dialogue = null;
    this.enemies = [];
    this.allies = [];
    this.npcs = [];
    this.wildlife = [];
    this.objects = [];
    this.projectiles = [];
    this.zones = [];
    this.drops = [];
    this.groups = new Map();
    this.ballistaCd = {};
    this.noise = { x: 0, z: 0 };
    this.noiseT = 0;
    this.weather = { kind: null, amt: 0, storm: 0, rainT: 0, raining: false };
    this.region = null;
    this.focus = null;
    this.camYaw = 0;
    this.camPitch = -0.18;
    this.camera = null;
    this.stats = computeStats(P);
    this.inv = createInventory(this);
    this.quests = createQuests(this);
    this.dlg = createDialogue(this);
    this.timers = { spawn: 0, discover: 0, npcs: 0, place: 0 };
    this.applyGates();
    // where do we start?
    let at;
    if (opts.arrival === "saved" && P.pos) at = { ...P.pos };
    else if (opts.arrival === "start") at = { x: -84, y: 0, z: 137, yaw: Math.PI / 2 + 0.08, interior: null };
    else at = this.safeSpawn(P.lastSafe);
    if (!at.interior) at.y = this.ground(at.x, at.z, 1e9);
    this.player = createPlayer(this, at);
    this.camYaw = at.yaw ?? 0;
    // world population
    this.refreshNpcs(true);
    this.syncCompanion();
    for (const w of WILDLIFE) for (let k = 0; k < w.n; k++) this.wildlife.push(createWild(this, w.kind, w.x + (this.rand() - 0.5) * 14, w.z + (this.rand() - 0.5) * 14));
    if (!P.world.dead.dragon && P.flags.dragonFate !== "freed") this.dragon = createDragon(this);
    else this.dragon = null;
    if (this.dragon && P.flags.dragonDown && !P.flags.dragonFate) {
      this.dragon.down = true;
      this.dragon.state = "down";
      this.dragon.hp = 1;
    }
    this.buildObjects();
    if (P.quests.q_thornwick == null && opts.arrival === "start") this.quests.start("q_thornwick");
    this.quests.recheckAll();
    this.updateSpawns(true);
    this.camera = cameraRig(this, {});
  }

  /* ================================================================ events */
  emit(e) {
    this.events.push(e);
  }
  drain() {
    const e = this.events;
    this.events = [];
    return e;
  }
  emitTele(o) {
    this.emit({ type: "telegraph", color: o.frost ? "#7fd8ff" : "#ff4a1a", ...o });
  }
  shake(v) {
    this.emit({ type: "shake", v });
  }
  hitstop(t) {
    this.emit({ type: "hitstop", t });
  }

  itemRarity(id) {
    return ITEMS[id]?.rarity;
  }

  /* ================================================================ helpers */
  ground(x, z, feet = 1e9) {
    return this.W.col.ground(x, z, feet);
  }
  walkable(x, z) {
    return this.W.nav.walkable(x, z);
  }
  settle(a) {
    const pos = { x: a.x, z: a.z };
    this.W.col.resolve(pos, a.r || 0.4, a.y, a.h || 1.8);
    a.x = pos.x;
    a.z = pos.z;
    a.y = this.ground(a.x, a.z, a.y + 2);
    a.vy = 0;
    a.onGround = true;
  }
  isNight() {
    return this.hour < 5.5 || this.hour > 20.5;
  }
  inCombat() {
    const p = this.player;
    if (this.dragon && !this.dragon.down && ["roar", "ground", "attack", "fly", "takeoff", "dive", "crash"].includes(this.dragon.state) && Math.hypot(this.dragon.x - p.x, this.dragon.z - p.z) < 70) return true;
    for (const e of this.enemies) if (!e.dead && e.target === p && e.state !== "return" && Math.hypot(e.x - p.x, e.z - p.z) < 30) return true;
    return false;
  }
  makeNoise(x, z) {
    this.noise.x = x;
    this.noise.z = z;
    this.noiseT = 0.4;
  }
  separate(a, pos) {
    const lists = [this.enemies, this.allies, this.npcs];
    for (const L of lists)
      for (const o of L) {
        if (o === a || o.dead || o.interior !== a.interior || o.downed) continue;
        const dx = pos.x - o.x;
        const dz = pos.z - o.z;
        const m = (a.r || 0.4) + (o.r || 0.4);
        const d2 = dx * dx + dz * dz;
        if (d2 < m * m && d2 > 1e-6) {
          const d = Math.sqrt(d2);
          const push = (m - d) * (a === this.player ? 0.5 : 0.35);
          pos.x += (dx / d) * push;
          pos.z += (dz / d) * push;
        }
      }
    if (a !== this.player && !this.player.dead && this.player.interior === a.interior) {
      const p = this.player;
      const dx = pos.x - p.x;
      const dz = pos.z - p.z;
      const m = (a.r || 0.4) + p.r;
      const d2 = dx * dx + dz * dz;
      if (d2 < m * m && d2 > 1e-6) {
        const d = Math.sqrt(d2);
        pos.x += (dx / d) * (m - d) * 0.5;
        pos.z += (dz / d) * (m - d) * 0.5;
      }
    }
    // the dragon's bulk
    const D = this.dragon;
    if (D && !D.flying() && D.state !== "gone" && !a.interior) {
      for (const v of D.hitboxes()) {
        if (v.part === "head") continue;
        const dx = pos.x - v.x;
        const dz = pos.z - v.z;
        const m = v.r * 0.9 + (a.r || 0.4);
        const d = Math.hypot(dx, dz);
        if (d < m && d > 1e-4) {
          pos.x = v.x + (dx / d) * m;
          pos.z = v.z + (dz / d) * m;
        }
      }
    }
  }
  heal(a, n, silent = false) {
    const max = a === this.player ? this.stats.maxHp : a.maxHp;
    const before = a.hp;
    a.hp = Math.min(max, a.hp + n);
    if (!silent && a.hp > before) this.emit({ type: "heal", n: Math.round(a.hp - before), x: a.x, y: a.y + 2, z: a.z });
  }
  healFull() {
    const p = this.player;
    p.hp = this.stats.maxHp;
    p.st = this.stats.maxSt;
    if (HEROES[this.P.hero].resource.id !== "resolve") p.res = this.stats.maxRes;
    p.status = {};
  }
  refreshStats() {
    const old = this.stats.maxHp;
    this.stats = computeStats(this.P);
    const p = this.player;
    if (p) {
      if (this.stats.maxHp > old) p.hp += this.stats.maxHp - old;
      p.hp = Math.min(p.hp, this.stats.maxHp);
      p.st = Math.min(p.st, this.stats.maxSt);
      p.res = Math.min(p.res, this.stats.maxRes);
    }
    this.emit({ type: "gear" });
  }
  addXp(n, src = null) {
    if (n <= 0) return;
    const ups = profAddXp(this.P, n);
    this.emit({ type: "xp", n, x: src?.x, y: src ? src.y + 2.4 : 0, z: src?.z });
    for (const L of ups) {
      this.refreshStats();
      this.healFull();
      this.emit({ type: "levelUp", level: L });
    }
  }
  addGold(n) {
    this.P.gold = Math.max(0, this.P.gold + n);
    if (n) this.emit({ type: "gold", n });
  }
  addRep(f, n) {
    this.P.rep[f] = clamp((this.P.rep[f] || 0) + n, -100, 100);
    this.emit({ type: "rep", faction: f, n });
  }
  setFlag(k, v) {
    this.P.flags[k] = v;
    this.quests.onFlag(k);
    this.timers.npcs = 0;
    this.emit({ type: "flag", k, v });
  }
  applyEffects(e) {
    return applyFx(this, e);
  }
  drinkPotion(which) {
    const id = which === 2 ? "p_tonic" : this.inv.count("p_greater") && this.player.hp < this.stats.maxHp * 0.4 ? "p_greater" : this.inv.count("p_heal") ? "p_heal" : "p_greater";
    drinkPotion(this, id);
  }
  useItem(uid) {
    const it = byUid(this.P, uid);
    if (!it) return { ok: false };
    const d = itemDef(it.id);
    if (d.type === "potion") {
      if (this.player.action) return { ok: false, msg: "Not while busy." };
      drinkPotion(this, it.id);
      return { ok: true, msg: `Drank ${d.name}.` };
    }
    return { ok: false, msg: "You can't use that here." };
  }
  setCompanion(id) {
    this.P.companion = id;
    this.syncCompanion();
    this.timers.npcs = 0;
    if (id) this.emit({ type: "notice", text: `${id === "wren" ? "Wren" : "Garrick"} joins you.`, kind: "good" });
  }
  syncCompanion() {
    const want = this.P.companion;
    const cur = this.allies.find((a) => a.companion);
    if (cur && cur.companion !== want) this.allies = this.allies.filter((a) => a !== cur);
    if (want && (!cur || cur.companion !== want)) {
      const p = this.player;
      const npc = want === "wren" ? NPCS.wren : NPCS.garrickNpc;
      const lvl = this.P.level;
      const a = createAlly(this, { name: want === "wren" ? "Wren" : "Garrick", companion: want, x: p.x - Math.sin(p.yaw) * 2, z: p.z - Math.cos(p.yaw) * 2, hp: 180 + lvl * 22, dmg: (want === "wren" ? 9 : 11) + lvl * 1.6, armor: 20 + lvl * 2, ranged: want === "wren", look: npc.look, weapon: npc.weapon, interior: p.interior });
      this.allies.push(a);
    }
  }
  safeSpawn(locId) {
    const L = LOCATIONS.find((l) => l.id === locId) || LOCATIONS[0];
    const [x, z] = L.spawn || [L.x, L.z];
    return { x, z, y: 0, yaw: Math.atan2(L.x - x, L.z - z) + Math.PI, interior: null };
  }
  entDone(id) {
    const w = this.P.world;
    return !!(w.looted[id] || w.lit[id] || w.mined[id] || w.destroyed[id] || w.pulled[id] || w.picked[id] || w.used?.[id]);
  }
  markUsed(id) {
    this.P.world.used = this.P.world.used || {};
    this.P.world.used[id] = true;
    this.quests.onInteract(id);
  }
  /** State flags for the renderer's animated props. */
  entState(id) {
    const w = this.P.world;
    switch (id) {
      case "wintergate":
        return { open: !this.W.col.gateOn("wintergate") };
      case "ashgate":
        return { open: !this.W.col.gateOn("ashgate") };
      case "seal":
        return { open: !this.W.col.gateOn("seal") };
      case "altar_heart":
        return { taken: !!w.used?.altar_heart };
      case "cage":
        return { open: !!w.used?.cage };
      case "ashlever":
        return { pulled: !!w.pulled.ashlever };
      case "grate":
        return { open: !!w.used?.grate };
      case "trapdoor":
        return { open: !!w.used?.tunnel_ladder };
      default:
        if (id.startsWith("c_")) return { looted: !!w.looted[id] };
        if (id.startsWith("shrine")) return { lit: !!w.lit[id] };
        if (id.startsWith("cbrazier")) return { lit: !!w.lit[id] };
        if (id.startsWith("ore")) return { mined: !!w.mined[id] };
        if (id.startsWith("anchor")) return { destroyed: !!w.destroyed[id] };
        if (id.startsWith("ballista")) return { cooldown: (this.ballistaCd[id] || 0) > 0, aimYaw: this.ballistaAim?.[id] };
        return null;
    }
  }
  applyGates() {
    const w = this.P.world;
    const col = this.W.col;
    col.setGate("wintergate", false);
    col.setGate("ashgate", !w.pulled.ashlever);
    col.setGate("seal", !(w.lit.cbrazier1 && w.lit.cbrazier2 && w.lit.cbrazier3));
  }

  /* ================================================================ population */
  refreshNpcs(force = false) {
    const P = this.P;
    const want = [];
    for (const [id, d] of Object.entries(NPCS)) {
      if (d.when && !check(P, d.when, this)) continue;
      if (P.companion && ((id === "wren" && P.companion === "wren") || (id === "garrickNpc" && P.companion === "garrick"))) continue;
      if (d.captive && P.world.used?.[d.captive] && P.quests.q_thornwick?.state === "done") continue;
      let place = { x: d.x, z: d.z, yaw: d.yaw, idle: d.idle, name: d.name };
      for (const m of d.moves || []) if (check(P, m.when, this)) place = { ...place, ...m };
      want.push({ id, d, place });
    }
    const keep = [];
    for (const n of this.npcs) {
      const w = want.find((x) => x.id === n.npc && n.npc);
      if (!n.npc) {
        // villagers / guards: keep if still wanted
        if (!n.when || check(P, n.when, this)) keep.push(n);
        continue;
      }
      if (!w) continue;
      if (Math.hypot(n.homeX - w.place.x, n.homeZ - w.place.z) > 1 && !n.talking) {
        n.x = n.homeX = w.place.x;
        n.z = n.homeZ = w.place.z;
        n.homeYaw = w.place.yaw;
        n.yaw = w.place.yaw;
        n.idle = w.place.idle;
        n.name = w.place.name || n.name;
        n.y = this.ground(n.x, n.z, 1e9);
      }
      n.idle = n.captive && P.world.used?.[n.captive] ? "Idle" : w.place.idle;
      keep.push(n);
    }
    for (const w of want) {
      if (keep.some((n) => n.npc === w.id)) continue;
      keep.push(this.makeNpc({ npc: w.id, name: w.place.name || w.d.name, title: w.d.title, x: w.place.x, z: w.place.z, yaw: w.place.yaw, idle: w.place.idle, look: w.d.look, weapon: w.d.weapon, captive: w.d.captive, shop: w.d.shop }));
    }
    if (force || !this.npcs.some((n) => n.villager)) {
      if (check(P, { qd: "q_thornwick" }, this) && !keep.some((n) => n.villager)) VILLAGERS.forEach((v, i) => keep.push(this.makeNpc({ villager: true, name: "Villager", x: v.path[0][0], z: v.path[0][1], yaw: 0, idle: "Idle", look: v.look, path: v.path, faction: "villager", id: `v${i}` })));
      if (!keep.some((n) => n.guard)) GUARDS.forEach((g, i) => keep.push(this.makeNpc({ guard: true, name: g.faction === "wardens" ? "Warden" : g.faction === "ember" ? "Ember Guard" : "Militia", x: g.x, z: g.z, yaw: g.yaw, idle: "Idle", look: g.look, weapon: g.weapon, path: g.patrol || null, faction: g.faction, when: g.when, id: `g${i}` })));
    }
    // guards with conditions appear later
    for (const [i, g] of GUARDS.entries()) if (g.when && check(P, g.when, this) && !keep.some((n) => n.id === `g${i}`)) keep.push(this.makeNpc({ guard: true, name: g.faction === "wardens" ? "Warden" : "Militia", x: g.x, z: g.z, yaw: g.yaw, idle: "Idle", look: g.look, weapon: g.weapon, path: g.patrol || null, faction: g.faction, when: g.when, id: `g${i}` }));
    this.npcs = keep.filter((n) => !n.guard || !n.when || check(P, n.when, this));
  }
  makeNpc(o) {
    return {
      kind: "npc",
      team: "neutral",
      id: o.id || o.npc,
      npc: o.npc || null,
      name: o.name,
      title: o.title || "",
      x: o.x,
      y: this.ground(o.x, o.z, 1e9),
      z: o.z,
      yaw: o.yaw || 0,
      homeX: o.x,
      homeZ: o.z,
      homeYaw: o.yaw || 0,
      vx: 0,
      vz: 0,
      vy: 0,
      r: 0.4,
      h: 1.8,
      onGround: true,
      airT: 0,
      interior: null,
      idle: o.idle || "Idle",
      look: o.look,
      weapon: o.weapon || null,
      captive: o.captive || null,
      shop: o.shop || null,
      villager: !!o.villager,
      guard: !!o.guard,
      faction: o.faction || null,
      path: o.path ? o.path.map((p) => [p[0], p[1]]) : null,
      pi: 0,
      waitT: this.rand() * 3,
      when: o.when || null,
      t: 0,
      talking: false,
    };
  }

  buildObjects() {
    this.objects = [];
    for (const o of this.W.interact) {
      if (o.kind !== "anchor" || this.P.world.destroyed[o.id]) continue;
      const ob = { kind: "object", id: o.id, name: "Ashen Anchor", team: "hostile", x: o.x, y: o.y, z: o.z, yaw: 0, r: 1.2, h: 5, hp: 420, maxHp: 420, armor: 20, mat: "stone", status: null, interior: null, dead: false, hitFlash: 0, weakTo: null };
      ob.die = () => {
        ob.dead = true;
        this.P.world.destroyed[ob.id] = true;
        this.emit({ type: "anchorBreak", x: ob.x, y: ob.y + 2, z: ob.z, id: ob.id });
        this.shake(0.8);
        this.quests.onInteract(ob.id);
        this.addXp(60, ob);
      };
      this.objects.push(ob);
    }
  }

  spawnEnemy(type, x, z, o = {}) {
    const e = createEnemy(this, type, x, z, o);
    this.enemies.push(e);
    return e;
  }
  spawnGroupFor(tag) {
    const g = SPAWNS.find((s) => s.tag === tag || (Array.isArray(s.members) && s.members.some((m) => m[3]?.tag === tag || m[0] === tag)));
    if (!g || !Array.isArray(g.members)) return null;
    const m = g.members.find((x) => x[3]?.tag === tag || x[0] === tag) || g.members[0];
    return { x: m[1], z: m[2], interior: g.interior || null };
  }
  groupMembers(g) {
    if (Array.isArray(g.members)) return g.members;
    const I = this.W.interiors[g.interior];
    if (g.members === "cryptBoss") return [["hollowWarden", I.boss.x, I.boss.z, { tag: "hollowWarden", yaw: 0 }]];
    return I.undead.map((u) => ["undead", u.x, u.z, {}]);
  }
  updateSpawns(force = false) {
    const P = this.P;
    const p = this.player;
    for (const g of SPAWNS) {
      let st = this.groups.get(g.id);
      if (!st) this.groups.set(g.id, (st = { alive: [], clearedAt: P.world.cleared[g.id] ?? null }));
      if (g.once && P.world.cleared[g.id]) continue;
      const anyAlive = st.alive.some((e) => !e.dead);
      const members = this.groupMembers(g);
      const cx = members[0][1];
      const cz = members[0][2];
      const inside = g.interior || null;
      const near = inside ? p.interior === inside : !p.interior && Math.hypot(p.x - cx, p.z - cz) < (g.range || 120);
      const ok = (!g.when || check(P, g.when, this)) && (!g.night || this.isNight());
      if (anyAlive) {
        // despawn idle far groups to save work (they come back intact)
        const far = inside ? p.interior !== inside : Math.hypot(p.x - cx, p.z - cz) > (g.range || 120) + 80;
        if ((far && st.alive.every((e) => e.dead || !e.target)) || !ok) {
          for (const e of st.alive) if (!e.dead) e.despawn = true;
          st.alive = [];
          st.parked = true;
        }
        continue;
      }
      if (!near || !ok) continue;
      if (st.clearedAt != null && !g.once) {
        if (P.stats.time - st.clearedAt < (g.respawn || 600)) continue;
      }
      // spawn (skipping uniques already dead)
      st.alive = [];
      for (const [type, x, z, o = {}] of members) {
        if (P.world.dead[type]) continue;
        const e = this.spawnEnemy(type, x, z, { ...o, tag: o.tag || g.tag || null, group: g.id, interior: inside });
        e.home.guard = !!o.guard;
        st.alive.push(e);
      }
      st.clearedAt = null;
      st.parked = false;
      if (!st.alive.length) {
        P.world.cleared[g.id] = P.stats.time;
        continue;
      }
      void force;
    }
    this.enemies = this.enemies.filter((e) => !e.despawn && !(e.dead && e.deadT > 8));
  }
  groupMemberDied(e) {
    const st = this.groups.get(e.group);
    if (!st) return;
    if (st.alive.every((m) => m.dead)) {
      st.clearedAt = this.P.stats.time;
      this.P.world.cleared[e.group] = this.P.stats.time;
    }
  }

  /* ================================================================ loot */
  dropLoot(e, forced = null) {
    const P = this.P;
    const items = [];
    let gold = 0;
    if (forced) items.push([forced, 1]);
    else {
      const T = LOOT[e.def.loot];
      if (!T) return;
      gold = Math.round(T.gold[0] + this.rand() * (T.gold[1] - T.gold[0]));
      for (let r = 0; r < (T.rolls || 1); r++)
        for (const [ch, what] of T.drops)
          if (this.rand() < ch / (T.rolls || 1)) {
            const id = typeof what === "string" ? what : this.classWeapon(what.classWeapon);
            if (id) items.push([id, 1]);
          }
      if (e.type === "greyfang") items.push(["q_pelt", 1]);
      if (e.type === "voss") items.push(["w_ashenblade", 1]);
    }
    if (!gold && !items.length) return;
    const d = { id: this.nextId++, x: e.x, y: e.y, z: e.z, gold, items, t: 0, interior: e.interior || null };
    this.drops.push(d);
    this.emit({ type: "drop", x: d.x, y: d.y, z: d.z, rare: items.some(([id]) => ["rare", "epic", "legendary"].includes(ITEMS[id]?.rarity)) });
    void P;
  }
  classWeapon(rarity) {
    const list = Object.values(ITEMS).filter((i) => i.type === "weapon" && i.for === this.P.hero && i.rarity === rarity);
    return list.length ? list[Math.floor(this.rand() * list.length)].id : null;
  }
  collectDrop(d) {
    if (d.gold) this.addGold(d.gold);
    for (const [id, n] of d.items) this.inv.give(id, n, { notify: true });
    d.taken = true;
    this.emit({ type: "loot", gold: d.gold, items: d.items });
  }
  openChest(id, table) {
    const P = this.P;
    if (P.world.looted[id]) return;
    P.world.looted[id] = true;
    const spec = CHEST_LOOT[id] || { table: table || "chest", fixed: [] };
    const T = LOOT[spec.table];
    const gold = Math.round(T.gold[0] + this.rand() * (T.gold[1] - T.gold[0]));
    const items = [];
    for (const [iid, n, cls] of spec.fixed) if (!cls || cls === P.hero) items.push([iid, n]);
    for (let r = 0; r < T.rolls; r++)
      for (const [ch, what] of T.drops)
        if (this.rand() < ch / T.rolls) {
          const iid = typeof what === "string" ? what : this.classWeapon(what.classWeapon);
          if (iid) items.push([iid, 1]);
        }
    this.addGold(gold);
    for (const [iid, n] of items) this.inv.give(iid, n, { notify: true });
    this.emit({ type: "chest", id, gold, items });
    this.markUsed(id);
  }

  /* ================================================================ interaction */
  computeFocus() {
    const p = this.player;
    if (p.dead || this.dialogue) return null;
    let best = null;
    let bs = Infinity;
    const consider = (o, label, verb, dist, extra = {}) => {
      const dx = o.x - p.x;
      const dz = o.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d > dist) return;
      if (Math.abs((o.y ?? p.y) - p.y) > 2.6) return;
      const ang = Math.abs(Math.atan2(Math.sin(Math.atan2(dx, dz) - p.yaw), Math.cos(Math.atan2(dx, dz) - p.yaw)));
      const s = d + ang * 1.2;
      if (s < bs) {
        bs = s;
        best = { label, verb, x: o.x, y: o.y, z: o.z, ...extra };
      }
    };
    for (const n of this.npcs) {
      if (n.interior !== p.interior) continue;
      if (n.captive) {
        if (!this.P.world.used?.[n.captive]) consider(n, n.name, "Free", 2.6, { kind: "captive", ref: n });
        else consider(n, n.name, "Talk", 2.6, { kind: "bark", ref: n });
        continue;
      }
      // the caged courier is reached through the cage itself
      if (n.npc === "tobias" && !this.P.flags.tobiasFree) continue;
      consider(n, n.name, "Talk", 3, { kind: n.npc ? "npc" : "bark", ref: n });
    }
    for (const a of this.allies) if (a.companion && a.interior === p.interior && !a.downed) consider(a, a.name, "Talk", 2.4, { kind: "companion", ref: a });
    for (const e of this.enemies) if (e.state === "yield" && !this.P.flags.garrickFate) consider(e, e.name, "Speak to", 3.5, { kind: "yield", ref: e });
    for (const o of this.W.interact) {
      if ((o.interior || null) !== p.interior) continue;
      const done = this.entDone(o.id);
      const k = o.kind;
      if (k === "chest" && !done) consider(o, "Chest", "Open", 2.2, { kind: "chest", ref: o });
      else if (k === "shrine" && !done) consider(o, "Ember Shrine", "Light", 2.6, { kind: "shrine", ref: o });
      else if (k === "oreNode" && !done) consider(o, "Frostiron Vein", "Mine", 2.4, { kind: "ore", ref: o });
      else if (k === "clue" && !done && check(this.P, { qa: "q_road" }, this)) consider(o, { clue_cart: "Overturned cart", clue_cloak: "Torn cloth", clue_arrows: "Arrows in a tree" }[o.id], "Inspect", 2.6, { kind: "clue", ref: o });
      else if (k === "pickup" && !done) consider(o, ITEMS[o.e.item].name, "Take", 2.2, { kind: "pickup", ref: o });
      else if (k === "cage" && !done) consider(o, "Cage", this.P.flags.garrickFate || this.P.hero === "rogue" ? "Open" : "Locked", 2.8, { kind: "cage", ref: o });
      else if (k === "lever" && !done) consider(o, "Gate lever", "Pull", 2.4, { kind: "lever", ref: o });
      else if (k === "grate") consider(o, "Smugglers' grate", done ? "Enter" : "Unlock", 2.8, { kind: "grate", ref: o });
      else if (k === "trapdoor" && this.P.world.used?.tunnel_ladder) consider(o, "Trapdoor", "Descend", 2.2, { kind: "trapdoor", ref: o });
      else if (k === "cryptHut") consider({ x: o.x + Math.sin(o.rot) * 3.2, y: o.y, z: o.z + Math.cos(o.rot) * 3.2 }, "Crypt door", "Enter", 2.8, { kind: "crypt", ref: o });
      else if (k === "exitDoor") consider(o, "Stairs up", "Leave", 2.8, { kind: "exit", ref: o });
      else if (k === "ladder") consider(o, "Ladder", "Climb", 2.4, { kind: "ladder", ref: o });
      else if (k === "puzzleBrazier" && !done) consider(o, "Ancestral brazier", "Light", 2.4, { kind: "brazier", ref: o });
      else if (k === "heartAltar" && !done && this.P.world.dead.hollowWarden) consider(o, "The Heartstone", "Take", 2.6, { kind: "altar", ref: o });
      else if (k === "ballista") consider(o, "Ballista", (this.ballistaCd[o.id] || 0) > 0 ? "Reloading" : "Fire", 2.6, { kind: "ballista", ref: o });
      else if (k === "campfire" && (o.id === "lodgefire")) consider(o, "Campfire", "Rest", 2.4, { kind: "rest", ref: o });
    }
    for (const d of this.drops) if (!d.taken && d.interior === p.interior) consider(d, d.gold && !d.items.length ? `${d.gold} gold` : "Loot", "Take", 1.8, { kind: "drop", ref: d });
    if (this.dragon?.down && !this.P.flags.dragonFate && !p.interior) {
      const h = this.dragon.head();
      consider({ x: h.x, y: this.dragon.y, z: h.z }, "Vaelith", "Approach", 7, { kind: "dragon" });
    }
    return best;
  }

  interact(f = this.focus) {
    if (!f || this.player.dead) return;
    const P = this.P;
    const p = this.player;
    const o = f.ref;
    const short = (t = 0.6) => {
      p.action = { type: "interact", t: 0, dur: t };
      p.vx = p.vz = 0;
    };
    switch (f.kind) {
      case "npc":
        if (!this.dlg.open(o.npc, o)) this.bark(o);
        break;
      case "bark":
        this.bark(o);
        break;
      case "companion":
        this.dlg.open(o.companion === "wren" ? "wren" : "garrickNpc", o, { name: o.name });
        break;
      case "yield":
        this.dlg.open("garrick", o, { name: o.name });
        break;
      case "captive":
        short(0.8);
        this.markUsed(o.captive);
        o.idle = "Idle";
        this.emit({ type: "freed", x: o.x, y: o.y, z: o.z, name: o.name });
        this.emit({ type: "say", who: o.name, text: ["Bless you! I'll run for the elder.", "Oh thank the old flame — thank you!", "Free! They'll pay for this."][o.captive.slice(-1) % 3] });
        this.addXp(20, o);
        break;
      case "chest":
        short(0.7);
        this.openChest(o.id, o.e?.loot);
        break;
      case "shrine":
        short(0.9);
        P.world.lit[o.id] = true;
        if (!P.quests.s_shrines) this.quests.start("s_shrines");
        this.markUsed(o.id);
        this.addXp(35, o);
        this.emit({ type: "shrineLit", id: o.id, x: o.x, y: o.y + 2, z: o.z, n: Object.keys(P.world.lit).filter((k) => k.startsWith("shrine")).length });
        break;
      case "ore":
        short(1.4);
        P.world.mined[o.id] = true;
        this.markUsed(o.id);
        this.inv.give("q_ore", 1, { notify: true });
        this.inv.give("m_iron", 1, { notify: true });
        this.emit({ type: "mine", x: o.x, y: o.y, z: o.z });
        break;
      case "clue":
        short(1.0);
        this.markUsed(o.id);
        this.emit({ type: "clue", text: CLUE_TEXT[o.id] });
        this.addXp(15, o);
        break;
      case "pickup":
        short(0.6);
        P.world.picked[o.id] = true;
        this.markUsed(o.id);
        this.inv.give(o.e.item, 1, { notify: true });
        break;
      case "cage":
        if (!P.flags.garrickFate && P.hero !== "rogue") {
          this.emit({ type: "notice", text: "Locked. Garrick Fenn carries the key.", kind: "warn" });
          break;
        }
        short(0.9);
        this.markUsed("cage");
        this.setFlag("tobiasFree", true);
        if (P.hero === "rogue" && !P.flags.garrickFate) this.emit({ type: "notice", text: "You pick the cage lock.", kind: "good" });
        this.emit({ type: "unlock", x: o.x, y: o.y, z: o.z });
        break;
      case "lever":
        short(0.8);
        P.world.pulled.ashlever = true;
        this.W.col.setGate("ashgate", false);
        this.setFlag("ashGateOpen", true);
        this.markUsed("ashlever");
        this.emit({ type: "gateOpen", id: "ashgate", x: o.x, y: o.y, z: o.z });
        this.spawnVanguard();
        break;
      case "grate":
        if (!this.entDone("grate")) {
          if (!this.inv.count("q_key") && P.hero !== "rogue") {
            this.emit({ type: "notice", text: "A rusted grate, locked fast. Someone in Thornwick might have the key.", kind: "warn" });
            break;
          }
          if (!this.inv.count("q_key")) this.emit({ type: "notice", text: "You work the old lock open.", kind: "good" });
          this.markUsed("grate");
          this.emit({ type: "unlock", x: o.x, y: o.y, z: o.z });
        }
        this.enterInterior("tunnel", "arrive");
        break;
      case "trapdoor":
        this.enterInterior("tunnel", "ladder");
        break;
      case "ladder":
        this.markUsed("tunnel_ladder");
        this.leaveInterior("trapdoor");
        break;
      case "crypt":
        this.enterInterior("crypt", "arrive");
        break;
      case "exit":
        this.leaveInterior(o.interior === "crypt" ? "cryptdoor" : "grate");
        break;
      case "brazier": {
        short(0.8);
        P.world.lit[o.id] = true;
        this.markUsed(o.id);
        this.emit({ type: "brazierLit", id: o.id, x: o.x, y: 1.4, z: o.z });
        if (P.world.lit.cbrazier1 && P.world.lit.cbrazier2 && P.world.lit.cbrazier3) {
          this.W.col.setGate("seal", false);
          this.emit({ type: "sealOpen" });
          this.shake(0.6);
        }
        break;
      }
      case "altar":
        short(1.0);
        this.markUsed("altar_heart");
        this.inv.give("q_heartstone", 1, { notify: true });
        this.emit({ type: "heartstone", x: o.x, y: 1.9, z: o.z });
        break;
      case "ballista":
        this.fireBallista(o);
        break;
      case "rest":
        if (this.inCombat()) return this.emit({ type: "notice", text: "You can't rest with enemies nearby.", kind: "warn" });
        this.rest();
        break;
      case "drop":
        this.collectDrop(o);
        break;
      case "dragon":
        this.dragonFate();
        break;
    }
  }
  bark(n) {
    const pool = n.villager ? BARKS.villager : BARKS[n.faction] || BARKS.villager;
    const line = n.captive ? "Thank you, truly." : pool[Math.floor(this.rand() * pool.length)];
    this.emit({ type: "say", who: n.name, text: line });
  }
  forceDialogue(npc, ent) {
    this.player.action = null;
    this.dlg.open(npc, ent, { name: ent?.name });
    if (npc === "garrick") this.garrickEnt = ent;
  }
  dragonFate() {
    const D = this.dragon;
    if (!D) return;
    this.dlg.open("dragon", null, {
      name: "Vaelith",
      title: "The Ashen Wyrm",
      onEnd: () => {
        const fate = this.P.flags.dragonFate;
        if (fate) resolveDragonFate(this, D, fate);
        this.emit({ type: "dragonFate", fate });
      },
    });
  }
  fireBallista(o) {
    if ((this.ballistaCd[o.id] || 0) > 0) return this.emit({ type: "notice", text: "The ballista is still being cranked.", kind: "warn" });
    const D = this.dragon;
    this.ballistaCd[o.id] = 10;
    this.ballistaAim = this.ballistaAim || {};
    const p = this.player;
    p.action = { type: "interact", t: 0, dur: 0.5 };
    // aim at the dragon if she's around, else along the barrel
    let tx;
    let ty;
    let tz;
    if (D && !D.down && D.state !== "dormant") {
      const lead = 0.5;
      tx = D.x + (D.vx || 0) * lead;
      tz = D.z + (D.vz || 0) * lead;
      ty = D.y + D.alt + 2.5;
    } else {
      tx = o.x + Math.sin(o.rot) * 40;
      tz = o.z + Math.cos(o.rot) * 40;
      ty = o.y + 6;
    }
    const sx = o.x;
    const sy = o.y + 1.2;
    const sz = o.z;
    const L = Math.hypot(tx - sx, ty - sy, tz - sz);
    this.ballistaAim[o.id] = Math.atan2(tx - sx, tz - sz);
    this.emit({ type: "ballista", x: sx, y: sy, z: sz, tx, ty, tz });
    const b = spawnProjectile(this, { kind: "ballista", x: sx, y: sy, z: sz, dx: (tx - sx) / L, dy: (ty - sy) / L, dz: (tz - sz) / L, speed: 80, team: "player", dmg: 90, src: p, r: 0.4, life: 2, stagger: 0 });
    b.ballista = true;
    // a bolt that reaches her while she flies brings her down
    if (D && D.flying() && !D.down) {
      const t = L / 80;
      this.pendingBallista = { t, D };
    }
  }
  spawnVanguard() {
    if (this.allies.some((a) => a.vanguard)) return;
    for (let k = 0; k < 3; k++) {
      const a = createAlly(this, { name: "Warden", x: 250 - k * 2, z: 16 + k * 3, hp: 260, dmg: 16, armor: 30, look: LOOKS.wardenGuard, weapon: "sword", anchor: { x: 285, z: 22 } });
      a.vanguard = true;
      this.allies.push(a);
    }
    this.emit({ type: "say", who: "Sergeant Rook", text: "The gate's open! Wardens — with me!" });
  }
  spawnSiegeAllies() {
    if (this.allies.some((a) => a.siege)) return;
    const choice = this.P.flags.crownChoice || "wardens";
    const S = SIEGE_ALLIES[choice];
    for (let k = 0; k < S.n; k++) {
      const a = createAlly(this, { name: S.name, x: -10 + k * 4, z: -250, hp: 300, dmg: 18, armor: 30, look: LOOKS[S.look], weapon: S.weapon, anchor: { x: (k - S.n / 2) * 6, z: -285 } });
      a.siege = true;
      this.allies.push(a);
    }
  }

  /* ================================================================ places */
  enterInterior(id, at) {
    const I = this.W.interiors[id];
    const p = this.player;
    const spot = at === "ladder" ? I.ladder : I.arrive;
    p.interior = id;
    p.x = spot.x;
    p.z = spot.z + (at === "ladder" ? ICELL * 0.6 : -0.5);
    p.y = 0;
    p.vx = p.vz = p.vy = 0;
    p.yaw = Math.PI;
    this.camYaw = Math.PI;
    this.camPitch = -0.15;
    this.projectiles = [];
    this.zones = [];
    for (const a of this.allies) if (a.companion) {
      a.interior = id;
      a.x = p.x + 1;
      a.z = p.z + 1.5;
      a.y = 0;
    }
    this.emit({ type: "teleport", interior: id, name: INTERIORS[id].name });
    this.quests.onPlace({ x: p.x, z: p.z, interior: id });
    this.updateSpawns(true);
    this.save();
  }
  leaveInterior(doorId) {
    const o = this.W.byId.get(doorId);
    const p = this.player;
    p.interior = null;
    const out = doorId === "trapdoor" ? { x: o.x + 1.6, z: o.z } : { x: o.x + Math.sin(o.rot) * 4.5, z: o.z + Math.cos(o.rot) * 4.5 };
    p.x = out.x;
    p.z = out.z;
    p.y = this.ground(p.x, p.z, 1e9);
    p.vx = p.vz = p.vy = 0;
    p.yaw = o.rot || 0;
    this.camYaw = p.yaw;
    this.projectiles = [];
    this.zones = [];
    for (const a of this.allies) if (a.companion) {
      a.interior = null;
      a.x = p.x - 1.5;
      a.z = p.z - 1.5;
      this.settle(a);
    }
    this.emit({ type: "teleport", interior: null });
    this.quests.onPlace({ x: p.x, z: p.z, interior: null });
    this.save();
  }
  canTravel() {
    if (this.inCombat()) return { ok: false, msg: "You can't travel while enemies are hunting you." };
    if (this.player.interior) return { ok: false, msg: "Leave this place first." };
    if (this.dialogue) return { ok: false, msg: "Finish your conversation first." };
    return { ok: true };
  }
  travel(locId) {
    const c = this.canTravel();
    if (!c.ok) return c;
    const L = LOCATIONS.find((l) => l.id === locId);
    if (!L || !L.safe || !this.P.discovered[locId]) return { ok: false, msg: "You haven't found a safe camp there." };
    const at = this.safeSpawn(locId);
    const p = this.player;
    p.x = at.x;
    p.z = at.z;
    p.y = this.ground(p.x, p.z, 1e9);
    p.yaw = at.yaw;
    p.vx = p.vz = p.vy = 0;
    this.camYaw = at.yaw;
    this.hour = (this.hour + 1.5) % 24;
    this.projectiles = [];
    this.zones = [];
    for (const a of this.allies) if (a.companion) {
      a.x = p.x - 2;
      a.z = p.z - 2;
      this.settle(a);
    }
    this.P.lastSafe = locId;
    this.emit({ type: "teleport", travel: true, name: L.name });
    this.updateSpawns(true);
    this.save();
    return { ok: true };
  }
  rest() {
    const wasNight = this.isNight();
    if (wasNight) {
      this.hour = 7;
      this.P.day++;
    } else this.hour = (this.hour + 3) % 24;
    this.healFull();
    for (const k of ["q", "r", "f"]) this.player.cds[k] = 0;
    this.emit({ type: "rested", night: wasNight });
    this.save();
  }
  discover(L) {
    const P = this.P;
    if (P.discovered[L.id]) return;
    P.discovered[L.id] = true;
    this.addXp(25);
    this.emit({ type: "discover", id: L.id, name: L.name, safe: !!L.safe });
    if (L.safe) P.lastSafe = L.id;
  }

  /* ================================================================ life & death */
  onPlayerDeath() {
    this.P.stats.deaths++;
    this.emit({ type: "playerDeath" });
  }
  respawn(penalty = true) {
    const P = this.P;
    const p = this.player;
    let lost = 0;
    if (penalty) {
      lost = Math.min(150, Math.floor(P.gold * 0.1));
      P.gold -= lost;
    }
    // inside an interior you wake at its entrance
    let at;
    if (p.interior) {
      const I = this.W.interiors[p.interior];
      at = { x: I.arrive.x, z: I.arrive.z - 0.5, y: 0, yaw: Math.PI, interior: p.interior };
    } else if (P.checkpoint && P.quests[P.checkpoint.quest]?.state === "active") at = { x: P.checkpoint.x, z: P.checkpoint.z, y: 0, yaw: P.checkpoint.yaw || 0, interior: null };
    else at = this.safeSpawn(P.lastSafe);
    p.x = at.x;
    p.z = at.z;
    p.interior = at.interior || null;
    p.y = p.interior ? 0 : this.ground(p.x, p.z, 1e9);
    p.yaw = at.yaw;
    this.camYaw = at.yaw;
    p.vx = p.vz = p.vy = 0;
    p.kx = p.kz = 0;
    p.dead = false;
    p.action = null;
    p.status = {};
    p.iframes = 2;
    this.healFull();
    this.projectiles = [];
    this.zones = [];
    for (const e of this.enemies) {
      if (e.dead) continue;
      e.target = null;
      e.aware = 0;
      e.state = "return";
      e.t = 0;
      e.hp = e.maxHp;
      e.atk = null;
      e.tokenHeld = false;
    }
    const D = this.dragon;
    if (D && !D.down && D.state !== "dormant") {
      D.state = "dormant";
      D.alt = 0;
      D.breath = null;
      D.atk = null;
      D.hp = Math.max(D.hp, D.maxHp * (D.phase === 3 ? 0.3 : D.phase === 2 ? 0.65 : 1));
      D.x = 310;
      D.z = -336;
      D.y = this.ground(D.x, D.z, 1e9);
      D.stunT = 0;
    }
    for (const a of this.allies) {
      if (a.companion) {
        a.x = p.x - 1.5;
        a.z = p.z - 1.5;
        a.interior = p.interior;
        this.settle(a);
      }
      a.downed = false;
      a.hp = a.maxHp;
    }
    this.emit({ type: "respawn", lost });
    this.save();
    return lost;
  }
  onEnding() {
    const F = this.P.flags;
    this.P.ended = { crown: F.crownChoice || "wardens", dragon: F.dragonFate || "slain", garrick: F.garrickFate || "executed", locket: F.locketDone || null, companion: this.P.companion, day: this.P.day };
    this.emit({ type: "ending", ending: this.P.ended });
  }
  save() {
    this.emit({ type: "save" });
  }
  snapshotPos() {
    const p = this.player;
    if (p.dead) return null;
    return { x: p.x, y: p.y, z: p.z, yaw: p.yaw, interior: p.interior || null };
  }

  /* ================================================================ step */
  step(dt, inp) {
    if (this.paused) return;
    const P = this.P;
    const p = this.player;
    this.time += dt;
    P.stats.time += dt;
    this.hour = (this.hour + (dt / 60) * (this.opts.dayScale || 1)) % 24;
    if (this.hour < (this.lastHour ?? this.hour)) P.day++;
    this.lastHour = this.hour;
    P.hour = this.hour;
    this.noiseT = Math.max(0, this.noiseT - dt);
    for (const k of Object.keys(this.ballistaCd)) this.ballistaCd[k] = Math.max(0, this.ballistaCd[k] - dt);
    // camera look
    this.camYaw -= inp.dYaw || 0;
    this.camPitch = clamp(this.camPitch + (inp.dPitch || 0), -1.15, 0.7);
    // talking freezes you (the world keeps going a little)
    const busy = !!this.dialogue;
    const pin = busy ? { mx: 0, mz: 0, attack: {} } : inp;
    if (!busy && inp.interact && this.focus) this.interact(this.focus);
    stepPlayer(this, pin, dt);
    if (pin.attack?.pressed || this.player.action?.type === "cast") this.makeNoise(p.x, p.z);
    this.camera = cameraRig(this, this.camera || {});
    // world population
    this.timers.spawn -= dt;
    if (this.timers.spawn <= 0) {
      this.timers.spawn = 0.5;
      this.updateSpawns();
    }
    this.timers.npcs -= dt;
    if (this.timers.npcs <= 0) {
      this.timers.npcs = 2;
      this.refreshNpcs();
    }
    // actors (only near ones think)
    for (const e of this.enemies) {
      const d = Math.hypot(e.x - p.x, e.z - p.z);
      if (e.interior !== p.interior) continue;
      if (d > 170 && !e.target) continue;
      stepEnemy(this, e, dt);
    }
    for (const a of this.allies) stepAlly(this, a, dt);
    for (const n of this.npcs) if (Math.hypot(n.x - p.x, n.z - p.z) < 110 && n.interior === p.interior) stepNpc(this, n, dt);
    for (const w of this.wildlife) if (Math.hypot(w.x - p.x, w.z - p.z) < 150 && !p.interior) stepWild(this, w, dt);
    if (this.dragon) stepDragon(this, this.dragon, dt);
    if (this.pendingBallista) {
      this.pendingBallista.t -= dt;
      if (this.pendingBallista.t <= 0) {
        const D = this.pendingBallista.D;
        this.pendingBallista = null;
        if (ballistaHit(this, D)) this.emit({ type: "notice", text: "Direct hit! Vaelith falls from the sky!", kind: "good" });
      }
    }
    stepProjectiles(this, dt);
    stepZones(this, dt);
    for (const o of this.objects) o.hitFlash = Math.max(0, (o.hitFlash || 0) - dt);
    this.objects = this.objects.filter((o) => !o.dead);
    // loot: walk over gold, E for items
    for (const d of this.drops) {
      d.t += dt;
      if (!d.taken && d.interior === p.interior && Math.hypot(d.x - p.x, d.z - p.z) < 1.8 && Math.abs(d.y - p.y) < 2.5 && !p.dead) this.collectDrop(d);
    }
    if (this.drops.length > 30 || this.drops.some((d) => d.taken)) this.drops = this.drops.filter((d) => !d.taken && d.t < 240);
    // dragon's fate & siege bookkeeping
    if (this.dragon?.down && !P.flags.dragonFate && !this.dialogue && Math.hypot(this.dragon.x - p.x, this.dragon.z - p.z) < 16 && this.dragon.t > 2.5 && !this.fateAsked) {
      this.fateAsked = true;
      this.dragonFate();
    }
    if (P.quests.q_throne?.state === "active" && P.quests.q_throne.stage >= 1 && !p.interior && Math.hypot(p.x, p.z + 290) < 90) {
      this.spawnSiegeAllies();
      if (P.flags.dragonFate === "freed") this.dragonAssist(dt);
    }
    // garrick's fate resolves when the talk ends
    if (this.garrickEnt && P.flags.garrickFate && !this.dialogue) {
      const g = this.garrickEnt;
      this.garrickEnt = null;
      if (P.flags.garrickFate === "executed") {
        g.state = "dead";
        g.dead = true;
        g.deadT = 0;
        P.world.dead.garrick = true;
        this.emit({ type: "death", id: g.id, x: g.x, y: g.y, z: g.z, name: g.name });
        this.addXp(120, g);
      } else {
        g.state = "flee";
        g.surrender = true;
        g.t = 0;
        g.yieldGone = true;
        P.world.dead.garrick = true;
      }
      this.dropLoot({ ...g, def: { loot: "boss" }, type: "garrick" });
    }
    // places
    this.timers.discover -= dt;
    if (this.timers.discover <= 0) {
      this.timers.discover = 0.5;
      if (!p.interior) {
        for (const L of LOCATIONS) if (!P.discovered[L.id] && Math.hypot(p.x - L.x, p.z - L.z) < L.r) this.discover(L);
        let reg = null;
        let rd = Infinity;
        for (const R of REGIONS) {
          const d = Math.hypot(p.x - R.x, p.z - R.z) / R.r;
          if (d < 1 && d < rd) {
            rd = d;
            reg = R;
          }
        }
        if (reg?.id !== this.region?.id) {
          this.region = reg;
          this.emit({ type: "region", id: reg?.id, name: reg?.name, music: reg?.music });
        }
      } else if (this.region?.id !== p.interior) {
        this.region = { id: p.interior, name: INTERIORS[p.interior].name, music: "dungeon" };
        this.emit({ type: "region", id: p.interior, name: INTERIORS[p.interior].name, music: "dungeon" });
      }
      this.quests.onPlace({ x: p.x, z: p.z, interior: p.interior });
      this.updateWeather(0.5);
      this.updateCheckpoint();
    }
    this.focus = this.computeFocus();
  }

  /** Boss approaches register a checkpoint so a fall doesn't mean the long walk back. */
  updateCheckpoint() {
    const P = this.P;
    const p = this.player;
    if (p.interior || p.dead) return;
    const CPS = [
      { quest: "q_dragon", x: 314, z: -296, yaw: Math.PI, near: [310, -320, 60], name: "the Sanctum steps" },
      { quest: "q_anchors", x: 306, z: -60, yaw: Math.PI, near: [315, -150, 120], name: "the Cinderpeak path" },
      { quest: "q_grate", x: 284, z: 44, yaw: Math.PI, near: [300, 20, 40], name: "the Ashfall courtyard" },
      { quest: "q_throne", x: 0, z: -236, yaw: Math.PI, near: [0, -280, 60], name: "the Wintermere gate" },
    ];
    for (const c of CPS) {
      if (P.quests[c.quest]?.state !== "active") continue;
      if (Math.hypot(p.x - c.near[0], p.z - c.near[1]) > c.near[2]) continue;
      if (P.checkpoint?.quest === c.quest && P.checkpoint.x === c.x) return;
      P.checkpoint = { quest: c.quest, x: c.x, z: c.z, yaw: c.yaw, name: c.name };
      this.emit({ type: "checkpoint", name: c.name });
      return;
    }
  }

  dragonAssist(dt) {
    this.assistT = (this.assistT ?? 6) - dt;
    if (this.assistT > 0) return;
    this.assistT = 11;
    const foes = this.enemies.filter((e) => !e.dead && !e.boss && Math.hypot(e.x, e.z + 290) < 60);
    if (!foes.length) return;
    const t = foes[Math.floor(this.rand() * foes.length)];
    this.emit({ type: "dragonAssist", x: t.x, z: t.z });
    for (let k = 0; k < 4; k++) {
      const x = t.x + (this.rand() - 0.5) * 8;
      const z = t.z + (this.rand() - 0.5) * 8;
      this.zones.push({ id: this.nextId++, kind: "firerain", x, z, y: this.ground(x, z), r: 3.5, delay: 1 + k * 0.2, dur: 0.05, tick: 0.01, once: true, dmg: 60, team: "player", src: this.player, fire: true, knock: 4, t: 0, acc: 0, hitOnce: new Set(), interior: null });
      this.emitTele({ shape: "circle", x, z, y: this.ground(x, z), r: 3.5, dur: 1 + k * 0.2, color: "#ffb040" });
    }
  }

  updateWeather(dt) {
    const p = this.player;
    const W = this.weather;
    const T = this.W.T;
    if (p.interior) {
      W.kind = null;
      W.amt = 0;
      return;
    }
    const snow = T.mask("snow", p.x, p.z);
    const ash = T.mask("ash", p.x, p.z);
    W.rainT -= dt;
    if (W.rainT <= 0) {
      W.raining = !W.raining && this.rand() < 0.35;
      W.rainT = W.raining ? 90 + this.rand() * 120 : 180 + this.rand() * 240;
    }
    if (snow > 0.4) {
      W.kind = "snow";
      W.amt = 0.35 + snow * 0.5;
    } else if (ash > 0.4) {
      W.kind = "ash";
      W.amt = 0.3 + ash * 0.5;
    } else if (W.raining) {
      W.kind = "rain";
      W.amt = 0.8;
    } else {
      W.kind = null;
      W.amt = 0;
    }
    const wantStorm = W.kind === "rain" ? 0.7 : W.kind === "snow" ? 0.3 : 0;
    W.storm += (wantStorm - W.storm) * Math.min(1, dt * 0.15);
  }
}

/** Objective markers for the HUD (all active quests, the tracked one first). */
export function questMarkers(G) {
  const P = G.P;
  const list = [];
  for (const id of G.quests.active()) {
    const m = G.quests.marker(id);
    if (m) for (const x of m) list.push({ ...x, quest: id, tracked: id === P.tracked });
  }
  return list;
}

export { resolveMarker, integrate, applyDamage, WORLD };
