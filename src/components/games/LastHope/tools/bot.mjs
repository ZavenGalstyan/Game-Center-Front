/**
 * Last Hope — a scripted survivor for the headless suite.
 *
 * It plays with the same intents the keyboard produces (move vector, aim,
 * attack, interact) — no teleports, no free items. It follows the objective
 * tracker: gathers, crafts (building stations when needed), builds, travels
 * through exits, hunts, fights, loots, heals, and reports any objective it
 * could not finish within its time budget.
 */
import { ITEMS } from "../data/items.js";
import { RECIPES } from "../data/recipes.js";
import { PIECES, GRID } from "../data/structures.js";
import { getMap } from "../data/locations/index.js";
import { NODES } from "../engine/nodes.js";
import * as Inv from "../engine/inventory.js";
import { createGame, tick, EMPTY_INTENT, craft, travel, respawn, recipeState, openInv, afterTransfer, findInteract, doInteract } from "../engine/game.js";
import { place, checkPlace, upgrade } from "../engine/building.js";
import { CONTAINER_DIMS } from "../engine/layout.js";
import { equipSlot, useSlot, dropSlot } from "../engine/items.js";
import { tracked } from "../engine/missions.js";

const DT = 1 / 20;

/** Which location to go to for an item / a zombie type. */
const ITEM_LOC = { wood: "camp", stone: "camp", fiber: "camp", berries: "camp", mushroom: "forest", raw_meat: "forest", metal: "industrial", cloth: "suburb", parts: "industrial", chemicals: "industrial", dirty_water: "camp" };
const TYPE_LOC = { walker: "forest", runner: "suburb", armored: "industrial", toxic: "industrial" };

export async function runBot(seed = 7, { log = false, maxMinutes = 420 } = {}) {
  const G = createGame({ seed, difficulty: "normal" });
  const B = new Bot(G, log);
  const failures = [];
  const maxT = maxMinutes * 60;
  let lastDone = 0;
  let stuckSince = 0;
  while (G.t < maxT && G.done.length < 41) {
    const I = B.think();
    tick(G, I, DT);
    B.afterTick();
    if (arguments[1]?.trace) arguments[1].trace(G, B);
    if (G.done.length !== lastDone) {
      lastDone = G.done.length;
      stuckSince = G.t;
      if (log) console.log(`  [${(G.t / 60).toFixed(1)} min, day ${G.day}, L${G.P.level}] ✓ ${G.done[G.done.length - 1]} ${tracked(G)[0] ? "→ next: " + tracked(G)[0].title : ""}`);
    }
    if (G.t - stuckSince > 50 * 60) {
      failures.push(`no progress for 50 min on "${tracked(G)[0]?.title}" (task: ${B.taskName})`);
      break;
    }
  }
  return { G, done: G.done, minutes: G.t / 60, deaths: G.stats.deaths, failures };
}

/**
 * A bot bound to an existing game (used by the browser soak test, where the
 * real shell runs tick + render and the bot only supplies intents).
 * keepEvents leaves G.events for the UI / audio to consume.
 */
export function createBot(G, { keepEvents = true } = {}) {
  const B = new Bot(G, false);
  B.keepEvents = keepEvents;
  return B;
}

class Bot {
  constructor(G, log) {
    this.G = G;
    this.log = log;
    this.path = null;
    this.pathT = 0;
    this.goal = null;
    this.stuck = 0;
    this.lastPos = { x: 0, z: 0 };
    this.taskName = "";
    this.wallLine = 0;
    this.interactCd = 0;
    this.say = (...a) => log && console.log("     ·", ...a);
  }

  /* ------------------------------------------------------------ helpers */
  get P() {
    return this.G.P;
  }
  have(id) {
    return Inv.count(this.G.inv, id) + (this.G.equip.hand?.id === id ? 1 : 0);
  }
  dist(x, z) {
    return Math.hypot(x - this.P.x, z - this.P.z);
  }
  moveTo(x, z, tol = 1.2) {
    const G = this.G;
    const P = this.P;
    const d = this.dist(x, z);
    if (d < tol) {
      this.path = null;
      return null;
    }
    const goalChanged = !this.goal || Math.hypot(this.goal.x - x, this.goal.z - z) > 1;
    this.pathT -= DT;
    if (goalChanged || !this.path || this.pathT <= 0 || this.stuck > 1.5) {
      this.goal = { x, z };
      let tgt = [x, z];
      if (G.R.nav.isBlocked(0, x, z)) tgt = this.approachPoint(x, z) || tgt;
      this.path = G.R.nav.path(0, P.x, P.z, tgt[0], tgt[1], 40000) || [[x, z]];
      this.pathI = 0;
      this.pathT = 4;
      if (this.stuck > 1.5) {
        this.stuck = 0;
        this.jiggle = 0.6;
      }
    }
    if (this.jiggle > 0) {
      this.jiggle -= DT;
      // step toward the most open nearby direction
      if (!this.jdir) {
        let best = null;
        let bs = -1;
        for (let k = 0; k < 16; k++) {
          const a = (k / 16) * 6.283;
          let free = 0;
          for (let r = 0.5; r <= 2; r += 0.5) if (!G.R.nav.isBlocked(0, P.x + Math.cos(a) * r, P.z + Math.sin(a) * r)) free++;
          const toward = Math.cos(a) * (x - P.x) + Math.sin(a) * (z - P.z) > 0 ? 0.5 : 0;
          if (free + toward > bs) {
            bs = free + toward;
            best = a;
          }
        }
        this.jdir = best;
      }
      return { ...EMPTY_INTENT, mx: Math.cos(this.jdir), mz: Math.sin(this.jdir) };
    }
    this.jdir = null;
    let wp = this.path[this.pathI];
    while (wp && Math.hypot(wp[0] - P.x, wp[1] - P.z) < 0.5 && this.pathI < this.path.length - 1) wp = this.path[++this.pathI];
    if (!wp) wp = [x, z];
    const dx = wp[0] - P.x;
    const dz = wp[1] - P.z;
    const l = Math.hypot(dx, dz) || 1;
    return { ...EMPTY_INTENT, mx: dx / l, mz: dz / l, sprint: d > 12 && P.stam > 40 };
  }
  /** A reachable free cell near (x,z) with clear sight to it (same side of any wall). */
  approachPoint(x, z) {
    const G = this.G;
    const cands = [];
    for (let r = 0.5; r <= 3; r += 0.5)
      for (let a = 0; a < 24; a++) {
        const px = x + Math.cos((a / 24) * 6.283) * r;
        const pz = z + Math.sin((a / 24) * 6.283) * r;
        if (G.R.nav.isBlocked(0, px, pz)) continue;
        const k = 0.6 / r;
        if (G.R.col.raycast(px, pz, x + (px - x) * k, z + (pz - z) * k, true) < 0.999) continue;
        cands.push([r * 3 + Math.hypot(px - this.P.x, pz - this.P.z) * 0.05, px, pz]);
      }
    cands.sort((p, q) => p[0] - q[0]);
    for (const [, px, pz] of cands.slice(0, 10)) if (G.R.nav.path(0, this.P.x, this.P.z, px, pz, 30000)) return [px, pz];
    return cands[0] ? [cands[0][1], cands[0][2]] : null;
  }
  afterTick() {
    const P = this.P;
    const moved = Math.hypot(P.x - this.lastPos.x, P.z - this.lastPos.z);
    if (P.moving && moved < 0.02) this.stuck += DT;
    else this.stuck = Math.max(0, this.stuck - DT);
    this.lastPos = { x: P.x, z: P.z };
    this.interactCd -= DT;
    if (!this.keepEvents) this.G.events.length = 0;
  }
  interact() {
    if (this.interactCd > 0) return EMPTY_INTENT;
    this.interactCd = 0.25;
    return { ...EMPTY_INTENT, interact: true };
  }

  /* ------------------------------------------------------------ main brain */
  think() {
    const G = this.G;
    const P = this.P;
    if (P.dead) {
      if (P.deadT > 1) {
        respawn(G);
        this.say("died → respawn");
        this.path = null;
      }
      return EMPTY_INTENT;
    }
    if (G.open && G.open.kind !== "container" && G.open.kind !== "bag") G.open = null;
    const s = this.survive();
    if (s) return s;
    const f = this.fight();
    if (f) return f;
    this.manageInventory();
    return this.work();
  }

  survive() {
    const G = this.G;
    const P = this.P;
    if (P.act) return null;
    const use = (ids) => {
      for (const id of ids) {
        const i = G.inv.slots.findIndex((s) => s && s.id === id);
        if (i >= 0) {
          useSlot(G, i);
          return true;
        }
      }
      return false;
    };
    if (P.hp < P.maxHp * 0.5 && use(P.hp < P.maxHp * 0.3 ? ["medkit", "painkillers", "bandage"] : ["bandage", "painkillers", "medkit"])) return EMPTY_INTENT;
    if (P.poison > 0 && P.hp < 60 && use(["antidote", "medkit"])) return EMPTY_INTENT;
    if (P.food < 40 && use(["cooked_meat", "canned_food", "energy_bar", "mushroom", "berries"])) return EMPTY_INTENT;
    if (P.water < 40 && use(["water_bottle", "soda"])) return EMPTY_INTENT;
    if (P.water < 18 && use(["dirty_water", "berries"])) return EMPTY_INTENT;
    if (P.food < 15 && use(["raw_meat"])) return EMPTY_INTENT;
    return null;
  }

  bestWeapon() {
    const G = this.G;
    let best = null;
    let bs = G.equip.hand && ITEMS[G.equip.hand.id].w ? this.score(G.equip.hand.id) : 0;
    G.inv.slots.forEach((s, i) => {
      if (!s || !ITEMS[s.id].w) return;
      const sc = this.score(s.id);
      if (sc > bs) {
        bs = sc;
        best = i;
      }
    });
    return best;
  }
  score(id) {
    const w = ITEMS[id]?.w;
    if (!w) return 0;
    if (w.ammo && Inv.count(this.G.inv, w.ammo) < 1) return 0;
    return (w.dmg / w.cd) * (w.kind === "melee" ? 1 : 1.15);
  }

  fight() {
    const G = this.G;
    const P = this.P;
    let tgt = null;
    let td = 1e9;
    for (const z of G.R.zombies) {
      if (z.state === "dead") continue;
      const d = this.dist(z.x, z.z);
      const engaged = z.state !== "idle" && z.state !== "roam" && z.state !== "return";
      const wantKill = this.hunt && (this.hunt === z.t || this.hunt === "any" || (this.hunt === "boss" && z.boss));
      const lim = engaged ? 12 : wantKill ? 40 : 3;
      if (!engaged && d > 3 && G.R.col.raycast(this.P.x, this.P.z, z.x, z.z, true) < 0.999) continue;
      if (d < lim && d < td) {
        td = d;
        tgt = z;
      }
    }
    if (!tgt) return null;
    // hurt with nothing to heal: break off toward the exit
    const heals = ["bandage", "medkit", "painkillers"].some((id) => Inv.count(G.inv, id) > 0);
    const engagedN = G.R.zombies.filter((z) => z.state !== "dead" && (z.state === "chase" || z.state === "windup") && this.dist(z.x, z.z) < 8).length;
    if ((P.hp < P.maxHp * 0.35 && !heals) || (engagedN >= 4 && P.hp < P.maxHp * 0.7)) {
      const ex = G.R.map.exits.find((e) => !e.to) || G.R.map.exits[0];
      if (this.dist(ex.x, ex.z) < ex.r * 0.7 && !(tgt.boss)) {
        travel(G, "camp");
        this.path = null;
        return EMPTY_INTENT;
      }
      const mv = this.moveTo(ex.x, ex.z, ex.r * 0.6);
      if (mv) return { ...mv, sprint: P.stam > 5 };
    }
    // brutes: don't fight bosses unless we came for them
    if (tgt.boss && this.hunt !== "boss" && !(this.mustBoss && this.mustBoss === tgt.boss)) {
      const away = this.moveTo(P.x - (tgt.x - P.x) * 3, P.z - (tgt.z - P.z) * 3, 0.5);
      return away ? { ...away, sprint: true } : null;
    }
    const wi = this.bestWeapon();
    if (wi != null && !P.act) {
      equipSlot(G, wi);
      return EMPTY_INTENT;
    }
    const w = G.equip.hand ? ITEMS[G.equip.hand.id].w : { kind: "melee", range: 1.45 };
    const range = w.kind === "melee" ? w.range + tgt.r - 0.15 : Math.min(18, w.range - 2);
    const dx = tgt.x - P.x;
    const dz = tgt.z - P.z;
    const d = Math.hypot(dx, dz);
    const telegraph = tgt.state === "windup" || tgt.state === "slamWind" || tgt.state === "chargeWind";
    const I = { ...EMPTY_INTENT, aim: { x: tgt.x, z: tgt.z } };
    if (telegraph && d < (tgt.def.slam?.r || tgt.def.reach) + 1.2 && w.kind === "melee") {
      // back off from the telegraph
      I.mx = -dx / d;
      I.mz = -dz / d;
      I.sprint = true;
      return I;
    }
    if (tgt.state === "charge") {
      I.mx = dz / d;
      I.mz = -dx / d;
      I.sprint = true;
      return I;
    }
    if (d > range) {
      if (w.kind !== "melee" && d < w.range - 1 && G.R.col.raycast(P.x, P.z, tgt.x, tgt.z, true) >= 0.999) {
        I.attack = true;
        return I;
      }
      const mv = this.moveTo(tgt.x, tgt.z, range * 0.9);
      return mv ? { ...mv, aim: I.aim } : I;
    }
    I.attack = true;
    if (w.kind !== "melee" && d < 3.5) {
      I.mx = -dx / d;
      I.mz = -dz / d;
    }
    return I;
  }

  manageInventory() {
    const G = this.G;
    const free = G.inv.slots.filter((s) => !s).length;
    if (free > 2) return;
    // wear armor instead of carrying it
    for (let i = 0; i < G.inv.slots.length; i++) {
      const s = G.inv.slots[i];
      if (s && ITEMS[s.id].cat === "armor" && !G.equip[ITEMS[s.id].slot]) return void equipSlot(G, i);
    }
    // drop whatever is furthest over its cap
    const CAP = { wood: 40, stone: 30, fiber: 16, cloth: 12, bandage: 8, painkillers: 6, rope: 6, metal: 30, parts: 12, chemicals: 6, berries: 8, mushroom: 4, soda: 3, canned_food: 6, energy_bar: 4, empty_bottle: 4, dirty_water: 4, water_bottle: 5, raw_meat: 4, cooked_meat: 6, arrow: 30, pistol_ammo: 60 };
    let worst = -1;
    let ws = 0;
    G.inv.slots.forEach((s, i) => {
      if (!s) return;
      const it = ITEMS[s.id];
      const have = Inv.count(G.inv, s.id);
      let over = have - (CAP[s.id] ?? 99);
      if (it.cat === "armor" || (it.w && this.score(s.id) < this.score(G.equip.hand?.id || "x") && it.cat === "weapon")) over = 50;
      if (it.cat === "key") over = -99;
      if (over > ws) {
        ws = over;
        worst = i;
      }
    });
    if (worst >= 0) dropSlot(G, worst);
  }

  /* ------------------------------------------------------------ objectives */
  work() {
    const G = this.G;
    this.hunt = null;
    if (G.loc === "camp" && G.locs.camp.cont.camp_start == null) {
      const c = getMap("camp").containers.find((q) => q.id === "camp_start");
      return this.openAndTake(c);
    }
    this.mustBoss = null;
    // wear any armor we carry into empty slots
    G.inv.slots.forEach((s, i) => {
      if (s && ITEMS[s.id].cat === "armor" && ITEMS[s.id].slot !== "pack" && !G.equip[ITEMS[s.id].slot]) equipSlot(G, i);
      if (s && ITEMS[s.id].slot === "pack" && (!G.equip.pack || ITEMS[s.id].slots > ITEMS[G.equip.pack.id].slots)) equipSlot(G, i);
    });
    // keep a usable weapon
    const bestScore = Math.max(this.score(G.equip.hand?.id || "x"), ...G.inv.slots.map((q) => (q ? this.score(q.id) : 0)));
    if (bestScore < 40 && G.P.level >= 5 && G.loc === "camp" && recipeState(G, RECIPES.find((r) => r.id === "machete")).ok) craft(G, "machete");
    else if (bestScore < 20 && G.P.level >= 2) {
      const r = this.ensureCrafted("wooden_spear", 1);
      if (r) return r;
    }
    if (this.have("pistol") && Inv.count(G.inv, "pistol_ammo") < 16 && G.loc === "camp" && recipeState(G, RECIPES.find((r) => r.id === "pistol_ammo")).ok) craft(G, "pistol_ammo");
    // keep a healing reserve
    if (Inv.count(G.inv, "bandage") < 2 && Inv.count(G.inv, "cloth") >= 2) craft(G, "bandage");
    // drink-water chain when thirsty and nothing to drink
    if (this.P.water < 45 && !this.have("water_bottle") && !this.have("soda")) {
      const r = this.ensureCrafted("water_bottle", 1);
      if (r) return r;
    }
    if (this.P.food < 45 && !["cooked_meat", "canned_food", "energy_bar", "berries", "mushroom"].some((id) => this.have(id))) {
      const r = this.gather("berries", Inv.count(G.inv, "berries") + 4);
      if (r) return r;
    }
    for (const m of tracked(G)) {
      const r = this.doMission(m);
      if (r) {
        this.taskName = m.title;
        return r;
      }
    }
    // nothing doable: grind XP with wood
    this.taskName = "grind";
    return this.gather("wood", Inv.count(G.inv, "wood") + 10) || EMPTY_INTENT;
  }

  doMission(m) {
    const G = this.G;
    const c = m.cond;
    switch (c.k) {
      case "gather":
        return this.gather(c.item, Inv.count(G.inv, c.item) + (c.n - (G.stats.gathered[c.item] || 0)));
      case "craft": {
        const want = Inv.count(G.inv, c.item) + (c.n - (G.stats.crafted[c.item] || 0));
        return this.craftItem(c.item, want);
      }
      case "build":
        return this.build(c.piece, c.n - (G.stats.built[c.piece] || 0));
      case "upgrade":
        return this.upgradePiece(c.piece, c.tier);
      case "eat": {
        const i = G.inv.slots.findIndex((s) => s && ITEMS[s.id].cat === "food" && !["raw_meat", "dirty_water"].includes(s.id));
        if (i >= 0 && !this.P.act) {
          useSlot(G, i);
          return EMPTY_INTENT;
        }
        return this.gather("berries", Inv.count(G.inv, "berries") + 2);
      }
      case "visit":
        return this.goTo(c.loc);
      case "kill":
        return this.killType(c.type);
      case "loot":
        return this.lootIn(c.loc);
      case "have":
        return this.getUnique(c.item);
      case "flag":
        return this.flagTask(c.name);
      case "boss":
        return this.bossTask(c.id);
      case "level":
        return this.gather("wood", Inv.count(G.inv, "wood") + 10);
    }
    return null;
  }

  /* ------------------------------------------------------------ travel */
  goTo(loc) {
    const G = this.G;
    if (G.loc === loc) return null;
    if (!G.unlocked.includes(loc)) return null;
    // bunker: through the hatch in the yard
    const map = G.R.map;
    const ex = map.exits.find((e) => (loc === "bunker" ? e.to === "bunker" : !e.to)) || map.exits.find((e) => !e.to);
    if (loc === "bunker" && G.loc !== "industrial") return this.goTo("industrial");
    const mv = this.moveTo(ex.x, ex.z, ex.r * 0.6);
    if (mv) return mv;
    if (ex.to) return this.interact();
    // at the trailhead: the world map would open; pick the destination
    this.say(`travel ${G.loc} → ${loc}`);
    travel(G, loc);
    this.path = null;
    return EMPTY_INTENT;
  }

  /* ------------------------------------------------------------ gathering */
  gather(item, want) {
    const G = this.G;
    if (Inv.count(G.inv, item) >= want) return null;
    if (item === "dirty_water") return this.fillWater(want);
    if (item === "raw_meat") return this.huntAnimal();
    if (item === "cloth" || item === "chemicals") return this.scavenge(item, want);
    if (item === "parts" || item === "metal") {
      if (G.loc !== "industrial" && G.unlocked.includes("industrial")) return this.goTo("industrial");
      if (G.loc !== "industrial" && G.unlocked.includes("suburb") && G.loc !== "suburb") return this.goTo("suburb");
    }
    const bonusOf = (n) => (n.def.bonus || []).find(([id]) => id === item)?.[1] || 0;
    const nodes = G.R.nodes.filter((n) => n.alive && (n.def.item === item || (n.def.give && n.def.give[item]) || bonusOf(n) >= 0.2));
    // need a tool for scrap-type nodes?
    const usable = nodes.filter((n) => !n.def.min || this.toolPower(n.def.kind) >= n.def.min);
    if (!usable.length && (item === "parts" || item === "metal")) {
      const r = this.lootIn(G.loc, true);
      if (r) return r;
    }
    if (!usable.length) {
      const loc = ITEM_LOC[item] || "forest";
      if (G.loc !== loc && G.unlocked.includes(loc)) return this.goTo(loc);
      if (G.loc !== "forest" && item !== "metal" && item !== "parts") return this.goTo("forest");
      // wait for regrowth: wander
      return this.moveTo(G.R.map.entry.x, G.R.map.entry.z, 2) || EMPTY_INTENT;
    }
    // tools first for trees / rocks
    if ((item === "wood" || item === "stone") && !this.have(item === "wood" ? "stone_axe" : "stone_pickaxe") && !this.have(item === "wood" ? "iron_axe" : "iron_pickaxe")) {
      const tool = item === "wood" ? "stone_axe" : "stone_pickaxe";
      if (recipeState(G, RECIPES.find((r) => r.out === tool)).ok) craft(G, tool);
    }
    // nearest by path-ish distance; prefer pick nodes early
    let best = null;
    let bs = 1e9;
    for (const n of usable) {
      const s = this.dist(n.x, n.z) * (n.def.pick ? 0.7 : 1);
      if (s < bs) {
        bs = s;
        best = n;
      }
    }
    if (bs > 60 && G.loc === "camp" && ITEM_LOC[item] !== "camp") return this.goTo("forest");
    return this.workNode(best);
  }
  toolPower(kind) {
    const G = this.G;
    let p = 0;
    const consider = (id) => (p = Math.max(p, ITEMS[id]?.w?.gather?.[kind] || 0));
    if (G.equip.hand) consider(G.equip.hand.id);
    for (const s of G.inv.slots) if (s) consider(s.id);
    return p;
  }
  workNode(n) {
    const G = this.G;
    const reach = (n.solidR || 0) + (n.def.pick ? 1.1 : 1.2);
    const mv = this.moveTo(n.x, n.z, reach);
    if (mv) return mv;
    // face it and interact
    const it = findInteract(G);
    if (it && it.id === n.id) return this.interact();
    const dx = n.x - this.P.x;
    const dz = n.z - this.P.z;
    const l = Math.hypot(dx, dz) || 1;
    return { ...EMPTY_INTENT, mx: (dx / l) * 0.3, mz: (dz / l) * 0.3 };
  }
  fillWater(want) {
    const G = this.G;
    if (Inv.count(G.inv, "dirty_water") >= want) return null;
    if (!this.have("empty_bottle")) {
      // bottles come from drinking or containers
      return this.scavenge("empty_bottle", 1);
    }
    const src = G.R.map.sources[0];
    if (!src) return this.goTo(G.unlocked.includes("forest") && G.loc !== "forest" ? "forest" : "camp");
    // approach the shore point nearest to us
    const a = Math.atan2(this.P.z - src.z, this.P.x - src.x);
    const sx = src.x + Math.cos(a) * (src.r - 1.2);
    const sz = src.z + Math.sin(a) * (src.r - 1.2);
    const mv = this.moveTo(sx, sz, 0.8);
    if (mv) return mv;
    return this.interact();
  }
  huntAnimal() {
    const G = this.G;
    if (G.loc !== "forest") return this.goTo("forest");
    const a = G.R.animals.filter((q) => !q.dead).sort((p, q) => this.dist(p.x, p.z) - this.dist(q.x, q.z))[0];
    // collect meat drops first
    const p = G.R.pickups.find((q) => q.items.some((i) => i.id === "raw_meat" && i.n > 0));
    if (p) return this.moveTo(p.x, p.z, 0.4) || EMPTY_INTENT;
    if (!a) {
      const sp = G.R.map.animals[Math.floor(G.t / 40) % G.R.map.animals.length];
      return this.moveTo(sp.x, sp.z, 3) || EMPTY_INTENT;
    }
    const d = this.dist(a.x, a.z);
    const bow = this.have("bow") && this.have("arrow");
    if (bow && G.equip.hand?.id !== "bow") {
      const i = G.inv.slots.findIndex((s) => s && s.id === "bow");
      if (i >= 0) equipSlot(G, i);
    }
    const w = G.equip.hand ? ITEMS[G.equip.hand.id].w : { kind: "melee", range: 1.45 };
    if (w.kind !== "melee" && d < 16 && G.R.col.raycast(this.P.x, this.P.z, a.x, a.z, true) >= 0.999) return { ...EMPTY_INTENT, aim: { x: a.x, z: a.z }, attack: true };
    if (d < w.range + a.r) return { ...EMPTY_INTENT, aim: { x: a.x, z: a.z }, attack: true };
    // sneak up (walking doesn't count as sprint)
    const mv = this.moveTo(a.x, a.z, 0.8);
    return mv ? { ...mv, sprint: false, aim: { x: a.x, z: a.z }, attack: d < 2.2 } : EMPTY_INTENT;
  }
  /** Search containers for an item. */
  scavenge(item, want) {
    const G = this.G;
    if (Inv.count(G.inv, item) >= want) return null;
    const order = item === "chemicals" ? ["industrial", "suburb"] : item === "empty_bottle" ? ["camp", "forest", "suburb"] : ["suburb", "forest", "industrial", "camp"];
    // first location in the list that still has unopened containers
    const fresh = (l) => getMap(l).containers.some((c) => (G.locs[l]?.cont || {})[c.id] == null);
    const loc = order.find((l) => G.unlocked.includes(l) && fresh(l)) || order.find((l) => G.unlocked.includes(l)) || "forest";
    if (G.loc !== loc) return this.goTo(loc);
    return this.lootIn(G.loc, true) || this.gather("wood", Inv.count(G.inv, "wood") + 4);
  }

  /* ------------------------------------------------------------ crafting */
  craftItem(item, want) {
    const G = this.G;
    if (Inv.count(G.inv, item) + (G.equip.hand?.id === item ? 1 : 0) >= want && want > 0 && (G.stats.crafted[item] || 0) > 0) return null;
    return this.ensureCrafted(item, want, true);
  }
  ensureCrafted(item, want, force = false) {
    const G = this.G;
    if (!force && this.have(item) >= want) return null;
    const recipes = RECIPES.filter((r) => r.out === item);
    const r = recipes.find((q) => recipeState(G, q).ok) || recipes.find((q) => G.P.level >= q.level && (!q.unlock || G.flags[q.unlock])) || recipes[0];
    if (!r) return null;
    if (G.P.level < r.level) return this.gather("wood", Inv.count(G.inv, "wood") + 10);
    if (r.unlock && !G.flags[r.unlock]) return null;
    // inputs
    for (const [id, n] of Object.entries(r.cost)) {
      if (Inv.count(G.inv, id) >= n) continue;
      if (RECIPES.some((q) => q.out === id) && !["water_bottle"].includes(id) && !NODES_ITEMS.has(id)) return this.ensureCrafted(id, n);
      return this.gather(id, n);
    }
    // station
    if (r.station) {
      const st = this.station(r.station);
      if (st) return st;
    }
    const res = craft(G, r.id);
    if (!res.ok) {
      this.say(`craft ${r.id} failed: ${res.reason}`);
      if (res.reason === "Inventory full") this.manageInventory();
      return EMPTY_INTENT;
    }
    return EMPTY_INTENT;
  }
  /** Walk to (or build) a station of the given kind in camp. */
  station(kind) {
    const G = this.G;
    if (G.loc !== "camp") return this.goTo("camp");
    const piece = kind === "campfire" ? "campfire" : "workbench";
    let s = G.structures.find((q) => q.kind === piece && (kind !== "workbench2" || q.tier >= 1));
    if (!s) {
      if (kind === "workbench2") return this.upgradePiece("workbench", 1);
      return this.build(piece, 1);
    }
    const mv = this.moveTo(s.x, s.z, 2.4);
    return mv;
  }

  /* ------------------------------------------------------------ building */
  build(piece, n) {
    const G = this.G;
    if (n <= 0) return null;
    const cost = PIECES[piece].tiers[0].cost;
    for (const [id, k] of Object.entries(cost)) {
      if (Inv.count(G.inv, id) >= k) continue;
      if (id === "rope") return this.ensureCrafted("rope", k);
      return this.gather(id, k);
    }
    if (G.loc !== "camp") return this.goTo("camp");
    // walk near the build area, then find a valid spot
    const mv = this.moveTo(0, 6, 3);
    if (mv) return mv;
    const spots = [];
    if (PIECES[piece].place === "edge") {
      // walls/doors: a palisade line along z = -16 … building west → east
      for (let i = -8; i < 8; i++) spots.push([i * GRID + 1, -16, 0]);
      for (let i = -8; i < 8; i++) spots.push([i * GRID + 1, 16, 0]);
    } else for (let r = 1; r < 9; r++) for (let a = 0; a < 16; a++) spots.push([Math.cos((a / 16) * 6.28) * r * GRID, 4 + Math.sin((a / 16) * 6.28) * r * GRID, 0]);
    for (const [x, z, rot] of spots) {
      const c = checkPlace(G, piece, x, z, rot);
      if (!c.ok) continue;
      // keep out of the way of the stash path
      if (place(G, piece, x, z, rot)) {
        this.say(`built ${piece} at ${c.x.toFixed(0)},${c.z.toFixed(0)}`);
        return EMPTY_INTENT;
      }
    }
    this.say(`no spot for ${piece}`);
    return this.moveTo(this.P.x + 4, this.P.z, 1) || EMPTY_INTENT;
  }
  upgradePiece(piece, tier) {
    const G = this.G;
    let s = G.structures.find((q) => q.kind === piece);
    if (!s) return this.build(piece, 1);
    if (s.tier >= tier) return null;
    const next = PIECES[piece].tiers[s.tier + 1];
    if (next.level && G.P.level > 0 && G.P.level < next.level) return this.gather("wood", Inv.count(G.inv, "wood") + 10);
    for (const [id, k] of Object.entries(next.cost)) {
      if (Inv.count(G.inv, id) >= k) continue;
      if (id === "rope") return this.ensureCrafted("rope", k);
      return this.gather(id, k);
    }
    if (G.loc !== "camp") return this.goTo("camp");
    const mv = this.moveTo(s.x, s.z, 3);
    if (mv) return mv;
    upgrade(G, s.id);
    return EMPTY_INTENT;
  }

  /* ------------------------------------------------------------ fighting & looting */
  killType(type) {
    const G = this.G;
    this.hunt = type;
    // be armed
    if (!G.equip.hand || !ITEMS[G.equip.hand.id].w || ITEMS[G.equip.hand.id].cat === "tool") {
      const wi = this.bestWeapon();
      if (wi != null) equipSlot(G, wi);
      else if (!this.have("wooden_spear") && G.P.level >= 2) return this.ensureCrafted("wooden_spear", 1);
    }
    const here = G.R.zombies.filter((z) => z.t === type && z.state !== "dead" && !z.boss);
    if (!here.length) {
      const loc = TYPE_LOC[type];
      const alt = type === "armored" || type === "toxic" ? (G.unlocked.includes("industrial") ? "industrial" : "suburb") : loc;
      const want = G.unlocked.includes(alt) ? alt : loc;
      if (G.loc !== want && G.unlocked.includes(want)) return this.goTo(want);
      // wander between this type's spawn points
      const sps = G.R.map.spawns.filter((s) => s.t === type);
      const sp = sps[Math.floor(G.t / 45) % Math.max(1, sps.length)] || G.R.map.spawns[0];
      return this.moveTo(sp.x, sp.z, 3) || EMPTY_INTENT;
    }
    const z = here.sort((a, b) => this.dist(a.x, a.z) - this.dist(b.x, b.z))[0];
    return this.moveTo(z.x, z.z, 2) || EMPTY_INTENT;
  }
  lootIn(loc, any = false) {
    const G = this.G;
    if (G.loc !== loc) return this.goTo(loc);
    const ls = G.locs[loc];
    const fresh = G.R.map.containers.filter((c) => ls.cont[c.id] == null && this.reachableContainer(c));
    if (!fresh.length) return any ? null : this.gather("wood", Inv.count(G.inv, "wood") + 4);
    const c = fresh.sort((a, b) => this.dist(a.x, a.z) - this.dist(b.x, b.z))[0];
    return this.openAndTake(c);
  }
  reachableContainer(c) {
    const G = this.G;
    const d = G.R.doors.find((q) => !q.open && Math.hypot(q.x - c.x, q.z - c.z) < 14);
    if (d && G.loc === "bunker") {
      // behind a locked door?
      const room = G.R.map.rooms?.find((r) => c.x > r.x0 && c.x < r.x1 && c.z > r.z0 && c.z < r.z1);
      if (room && (room.name === "Armory" || room.name === "Containment Hall")) return false;
    }
    return true;
  }
  openAndTake(c) {
    const G = this.G;
    if (this.cTarget !== c.id) {
      this.cTarget = c.id;
      this.cT = 0;
    }
    if (this.dist(c.x, c.z) < 6) this.cT += DT;
    if (this.cT > 40 && !c.contents) {
      // can't get it: mark it searched and move on
      G.locs[G.loc].cont[c.id] = G.locs[G.loc].cont[c.id] || [];
      this.say(`gave up on container ${c.id} (${c.t})`);
      return EMPTY_INTENT;
    }
    const dm = CONTAINER_DIMS[c.t] || [0.5, 0.5];
    const it0 = findInteract(G);
    if (!(it0 && it0.kind === "container" && it0.id === c.id)) {
      const mv = this.moveTo(c.x, c.z, Math.max(dm[0], dm[1]) * 0.8 + 0.9);
      if (mv) return mv;
    }
    const it = findInteract(G);
    if (!it || it.kind !== "container" || it.id !== c.id) {
      const dx = c.x - this.P.x;
      const dz = c.z - this.P.z;
      const l = Math.hypot(dx, dz) || 1;
      this.nudge = (this.nudge || 0) + DT;
      if (this.nudge > 3) {
        // can't get it: mark it looted to move on
        G.locs[G.loc].cont[c.id] = G.locs[G.loc].cont[c.id] || [];
        this.nudge = 0;
        this.say(`skip container ${c.id}`);
      }
      return { ...EMPTY_INTENT, mx: (dx / l) * 0.4, mz: (dz / l) * 0.4 };
    }
    this.nudge = 0;
    G.interact = it;
    doInteract(G);
    const inv = openInv(G);
    if (inv) Inv.takeAll(inv, G.inv);
    afterTransfer(G);
    G.open = null;
    return EMPTY_INTENT;
  }
  getUnique(item) {
    const G = this.G;
    if (this.have(item) || G.flags[`got_${item}`]) return null;
    const where = { survivor_map: ["suburb", "ranger_desk"], bunker_card: ["industrial", "security_safe"], security_card: ["bunker", "officer_locker"] }[item];
    if (!where) return null;
    const [loc, cid] = where;
    if (G.loc !== loc) return this.goTo(loc);
    if (item === "bunker_card") {
      this.mustBoss = "alpha";
      this.hunt = "boss";
      const prep = this.prepareForBoss();
      if (prep) return prep;
    }
    const c = getMap(loc).containers.find((q) => q.id === cid);
    return this.openAndTake(c);
  }
  prepareForBoss() {
    const G = this.G;
    // bring healing
    if (Inv.count(G.inv, "bandage") + Inv.count(G.inv, "medkit") + Inv.count(G.inv, "painkillers") < 4) {
      if (Inv.count(G.inv, "cloth") >= 2) {
        craft(G, "bandage");
        return EMPTY_INTENT;
      }
      return this.scavenge("cloth", 2);
    }
    return null;
  }
  flagTask(name) {
    const G = this.G;
    if (name === "raid_survived") {
      if (G.loc !== "camp") return this.goTo("camp");
      this.hunt = "any";
      // wait near the fire for nightfall
      const fire = G.structures.find((s) => s.kind === "campfire");
      if (G.day < 2 || !(G.clock >= 20 || G.clock < 5.5)) return this.gather("wood", Inv.count(G.inv, "wood") + 6);
      return this.moveTo(fire ? fire.x + 1.5 : 0, fire ? fire.z : 4, 1.5) || EMPTY_INTENT;
    }
    if (name === "door_armory_door") {
      if (!this.have("security_card")) return this.getUnique("security_card");
      if (G.loc !== "bunker") return this.goTo("bunker");
      const d = G.R.doors.find((q) => q.id === "armory_door");
      const mv = this.moveTo(d.x, d.z - 1.4, 0.9);
      if (mv) return mv;
      return this.interact();
    }
    if (name === "power") {
      if (G.loc !== "bunker") return this.goTo("bunker");
      const s = G.R.switches[0];
      const mv = this.moveTo(s.x, s.z + 1.2, 1);
      if (mv) return mv;
      return this.interact();
    }
    return null;
  }
  bossTask(id) {
    const G = this.G;
    if (id === "warden") {
      if (G.loc !== "bunker") return this.goTo("bunker");
      // gear up from the armory first
      if (G.locs.bunker.cont.armory_rack == null && G.R.doors.find((q) => q.id === "armory_door")?.open) {
        const rack = getMap("bunker").containers.find((q) => q.id === "armory_rack");
        return this.openAndTake(rack);
      }
      this.hunt = "boss";
      this.mustBoss = "warden";
      const prep = this.prepareForBoss();
      if (prep) return prep;
      const d = G.R.doors.find((q) => q.id === "blast_door");
      if (!d.open) {
        const mv = this.moveTo(d.x, d.z - 1.5, 1);
        if (mv) return mv;
        return this.interact();
      }
      const b = G.R.zombies.find((z) => z.boss === "warden" && z.state !== "dead");
      if (b) return this.moveTo(b.x, b.z, 2) || EMPTY_INTENT;
    }
    return null;
  }
}

const NODES_ITEMS = new Set(Object.values(NODES).flatMap((n) => [n.item, ...Object.keys(n.give || {})]).filter(Boolean));
void GRID;
