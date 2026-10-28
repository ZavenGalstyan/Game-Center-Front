/**
 * The saved profile (everything that persists) plus inventory, equipment,
 * derived stats, levelling and skills. Pure functions over the profile `P`;
 * `createInventory(G)` wraps them with events for the running game.
 */
import { HEROES, LEVEL_CAP, xpToNext } from "../data/heroes.js";
import { ITEMS, START_KIT, UPGRADES, UPGRADE_MULT, SHOPS, RARITY } from "../data/items.js";
import { countItem } from "./conditions.js";

export const SAVE_VERSION = 3;

export function newProfile(hero = "knight", body = null) {
  const H = HEROES[hero];
  const P = {
    v: SAVE_VERSION,
    hero,
    body: body || Object.keys(H.look)[0],
    level: 1,
    xp: 0,
    sp: 0,
    skills: {},
    gold: 30,
    inv: [],
    nextUid: 1,
    equip: { weapon: null, offhand: null, head: null, chest: null, hands: null, legs: null, trinket: null },
    quests: {},
    tracked: null,
    flags: {},
    rep: { wardens: 0, ember: 0, marches: 0 },
    discovered: {},
    world: { looted: {}, lit: {}, mined: {}, destroyed: {}, pulled: {}, cleared: {}, dead: {}, picked: {} },
    companion: null,
    pos: null,
    lastSafe: "thornwick",
    hour: 8.5,
    day: 1,
    stats: { kills: 0, deaths: 0, time: 0, quests: 0 },
    ended: null,
  };
  const kit = START_KIT[hero];
  for (const [slot, id] of Object.entries(kit.equip)) {
    const it = addItem(P, id, 1);
    P.equip[slot] = it.uid;
  }
  for (const [id, n] of kit.bag) addItem(P, id, n);
  return P;
}

export const itemDef = (id) => ITEMS[id];
export const byUid = (P, uid) => (uid == null ? null : P.inv.find((i) => i.uid === uid) || null);

/** Add to the bag (stacking where allowed). Returns the (last) item instance. */
export function addItem(P, id, n = 1) {
  const d = ITEMS[id];
  if (!d) return null;
  if (d.stack) {
    let it = P.inv.find((i) => i.id === id);
    if (!it) {
      it = { uid: P.nextUid++, id, n: 0 };
      P.inv.push(it);
    }
    it.n += n;
    return it;
  }
  let it = null;
  for (let k = 0; k < n; k++) {
    it = { uid: P.nextUid++, id, n: 1, up: 0 };
    P.inv.push(it);
  }
  return it;
}
export function removeItem(P, id, n = 1) {
  let left = n;
  for (let i = P.inv.length - 1; i >= 0 && left > 0; i--) {
    const it = P.inv[i];
    if (it.id !== id) continue;
    if (Object.values(P.equip).includes(it.uid)) continue;
    const take = Math.min(left, it.n || 1);
    it.n = (it.n || 1) - take;
    left -= take;
    if (it.n <= 0) P.inv.splice(i, 1);
  }
  return n - left;
}

export function canEquip(P, it) {
  const d = ITEMS[it.id];
  if (!d || !d.slot) return false;
  if (d.for && d.for !== P.hero) return false;
  return true;
}
export function equip(P, uid) {
  const it = byUid(P, uid);
  if (!it || !canEquip(P, it)) return { ok: false, msg: "Your class can't use that." };
  P.equip[ITEMS[it.id].slot] = uid;
  return { ok: true };
}
export function unequip(P, slot) {
  if (slot === "weapon") return { ok: false, msg: "You need a weapon." };
  P.equip[slot] = null;
  return { ok: true };
}

/** Effective stats of one item instance (rarity is baked into the item; upgrades boost weapon attack). */
export function itemStats(it) {
  const d = ITEMS[it.id];
  const s = { ...(d.stats || {}) };
  if (d.type === "weapon" && it.up) s.atk = Math.round(s.atk * (1 + it.up * UPGRADE_MULT));
  return s;
}

const sumSkill = (P, id) => P.skills[id] || 0;

/** Every number the simulation needs, from level + gear + skills. */
export function computeStats(P) {
  const H = HEROES[P.hero];
  const L = P.level - 1;
  const g = { atk: 0, armor: 0, hp: 0, st: 0, res: 0, crit: 0, fire: 0, speed: 0, resistFire: 0 };
  let weaponAtk = 0;
  let effect = null;
  for (const uid of Object.values(P.equip)) {
    const it = byUid(P, uid);
    if (!it) continue;
    const s = itemStats(it);
    for (const k of Object.keys(g)) if (s[k]) g[k] += s[k];
    if (ITEMS[it.id].type === "weapon") {
      weaponAtk = s.atk || 0;
      effect = ITEMS[it.id].effect || null;
    }
  }
  const sk = (id) => sumSkill(P, id);
  let maxHp = H.base.hp + H.growth.hp * L + g.hp;
  maxHp *= 1 + 0.1 * (sk("vigor") + sk("vitality")) + 0.08 * (sk("endurance") + sk("agility"));
  const maxSt = H.base.st + H.growth.st * L + g.st + 15 * (sk("endurance") + sk("agility"));
  const maxRes = H.resource.max + g.res + 20 * sk("deepWell");
  const atk = H.base.atk + H.growth.atk * L + g.atk - weaponAtk + weaponAtk; // weapon atk is part of g.atk
  let armor = H.base.armor + H.growth.armor * L + g.armor;
  armor *= 1 + 0.08 * sk("ironSkin");
  let dmgMult = 1 + 0.06 * sk("keenEdge") + 0.08 * sk("steadyAim") + 0.08 * sk("kindling") + 0.07 * sk("sharpened");
  const crit = H.base.crit + g.crit;
  const critMult = H.base.critMult + (sk("deathMark") ? 0.25 : 0);
  const speed = H.base.speed * (1 + g.speed + 0.06 * (sk("fleetFoot") + sk("lightStep")));
  return {
    maxHp: Math.round(maxHp),
    maxSt: Math.round(maxSt),
    maxRes: Math.round(maxRes),
    atk: Math.round(atk),
    armor: Math.round(armor),
    crit,
    critMult,
    speed,
    fire: g.fire,
    resistFire: Math.min(0.75, g.resistFire),
    dmgMult,
    effect,
    resRegen: H.resource.regen * (1 + 0.25 * sk("flow")),
  };
}

/* ------------------------------------------------------------ levels & skills */
export function addXp(P, n) {
  const ups = [];
  if (P.level >= LEVEL_CAP) return ups;
  P.xp += n;
  while (P.level < LEVEL_CAP && P.xp >= xpToNext(P.level)) {
    P.xp -= xpToNext(P.level);
    P.level++;
    P.sp++;
    ups.push(P.level);
  }
  if (P.level >= LEVEL_CAP) P.xp = 0;
  return ups;
}
export function skillState(P, node) {
  const rank = P.skills[node.id] || 0;
  const H = HEROES[P.hero];
  const reqOk = !node.req || (P.skills[node.req] || 0) >= 1;
  const levelOk = P.level >= (node.tier - 1) * 2 + 1;
  return { rank, max: node.ranks, reqOk, levelOk, canLearn: P.sp > 0 && rank < node.ranks && reqOk && levelOk, H };
}
export function learnSkill(P, id) {
  const node = HEROES[P.hero].tree.find((n) => n.id === id);
  if (!node) return { ok: false, msg: "Unknown skill." };
  const s = skillState(P, node);
  if (!s.reqOk) return { ok: false, msg: "Learn the skill before it first." };
  if (!s.levelOk) return { ok: false, msg: `Requires level ${(node.tier - 1) * 2 + 1}.` };
  if (s.rank >= node.ranks) return { ok: false, msg: "Already mastered." };
  if (P.sp <= 0) return { ok: false, msg: "No skill points." };
  P.sp--;
  P.skills[id] = s.rank + 1;
  return { ok: true, msg: `${node.name} ${P.skills[id] > 1 ? `rank ${P.skills[id]}` : "learned"}.` };
}
export function abilityUnlocked(P, slot) {
  if (slot !== "f") return true;
  const H = HEROES[P.hero];
  return H.tree.some((n) => n.unlocks === "f" && (P.skills[n.id] || 0) > 0);
}

/* ------------------------------------------------------------ trade & upgrades */
export function itemValue(it) {
  const d = ITEMS[it.id];
  return Math.round((d.value || 0) * (1 + (it.up || 0) * 0.25));
}
export function priceBuy(shopId, id) {
  return Math.max(1, Math.round((ITEMS[id].value || 1) * (SHOPS[shopId].buy || 1)));
}
export function priceSell(shopId, it) {
  return Math.max(1, Math.floor(itemValue(it) * (SHOPS[shopId].sell || 0.4)));
}
export function buy(P, shopId, id) {
  const cost = priceBuy(shopId, id);
  if (P.gold < cost) return { ok: false, msg: "Not enough gold." };
  P.gold -= cost;
  addItem(P, id, 1);
  return { ok: true, msg: `Bought ${ITEMS[id].name}.` };
}
export function sell(P, shopId, uid) {
  const it = byUid(P, uid);
  if (!it) return { ok: false };
  const d = ITEMS[it.id];
  if (d.type === "quest") return { ok: false, msg: "You can't sell that." };
  if (Object.values(P.equip).includes(uid)) return { ok: false, msg: "Unequip it first." };
  const price = priceSell(shopId, it);
  P.gold += price;
  if (d.stack && it.n > 1) it.n--;
  else P.inv.splice(P.inv.indexOf(it), 1);
  return { ok: true, msg: `Sold ${d.name} for ${price} gold.` };
}
export function upgradeCost(it) {
  const next = (it.up || 0) + 1;
  return UPGRADES[next] || null;
}
export function upgrade(P, uid) {
  const it = byUid(P, uid);
  if (!it || ITEMS[it.id].type !== "weapon") return { ok: false, msg: "Only weapons can be upgraded." };
  const c = upgradeCost(it);
  if (!c) return { ok: false, msg: "Already at its finest." };
  if (P.gold < c.gold) return { ok: false, msg: `Needs ${c.gold} gold.` };
  if (countItem(P, "m_iron") < c.iron) return { ok: false, msg: `Needs ${c.iron} Iron Scrap.` };
  if (countItem(P, "m_ember") < c.ember) return { ok: false, msg: `Needs ${c.ember} Ember Shard${c.ember > 1 ? "s" : ""}.` };
  P.gold -= c.gold;
  removeItem(P, "m_iron", c.iron);
  if (c.ember) removeItem(P, "m_ember", c.ember);
  it.up = (it.up || 0) + 1;
  return { ok: true, msg: `${ITEMS[it.id].name} is now +${it.up}.` };
}

/** Appearance from the hero's base look + equipped gear. */
export function playerLook(P) {
  const H = HEROES[P.hero];
  const base = H.look[P.body] || Object.values(H.look)[0];
  const look = { ...base, armor: { ...base.armor } };
  for (const slot of ["chest", "head", "hands", "legs"]) {
    const it = byUid(P, P.equip[slot]);
    if (!it) continue;
    const L = ITEMS[it.id].look || {};
    for (const [k, v] of Object.entries(L)) {
      if (k === "armor") Object.assign(look.armor, v);
      else look[k] = v;
    }
  }
  if (P.hero === "mage" && look.skirt == null) look.skirt = true;
  return look;
}
export function weaponView(P) {
  const w = byUid(P, P.equip.weapon);
  const o = byUid(P, P.equip.offhand);
  const wd = w && ITEMS[w.id];
  const od = o && ITEMS[o.id];
  return {
    weapon: wd ? wd.kind : null,
    rarity: wd ? wd.rarity : "common",
    shield: od && od.kind === "shield" ? od.shield : null,
    offhand: P.hero === "rogue" ? (wd ? wd.kind : "dagger") : null,
    glow: wd && (wd.rarity === "epic" || wd.rarity === "legendary") ? RARITY[wd.rarity].color : null,
  };
}

export function createInventory(G) {
  const P = () => G.P;
  return {
    give(id, n = 1, o = {}) {
      addItem(P(), id, n);
      G.emit({ type: "item", id, n, notify: o.notify !== false });
      G.quests.onInventory();
    },
    take(id, n = 1) {
      const k = removeItem(P(), id, n);
      if (k) G.emit({ type: "itemLost", id, n: k });
      G.quests.onInventory();
      return k;
    },
    count: (id) => countItem(P(), id),
    freeUpgrade(levels) {
      const it = byUid(P(), P().equip.weapon);
      if (!it) return;
      it.up = Math.min(5, (it.up || 0) + levels);
      G.refreshStats();
      G.emit({ type: "notice", text: `${ITEMS[it.id].name} upgraded to +${it.up}` });
    },
  };
}
