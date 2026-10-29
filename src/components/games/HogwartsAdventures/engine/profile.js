/**
 * The saved profile: everything that persists between sessions. Pure data +
 * pure functions (no Three.js, no DOM) so the node tests can drive it.
 */
import { HEROES, HERO_IDS, TALENTS, LEVEL_CAP, xpToNext } from "../data/heroes.js";
import { SPELLS, STARTING_SPELLS, maxRank, HOTBAR } from "../data/spells.js";
import { ITEMS } from "../data/items.js";

export const SAVE_VERSION = 1;

export function newHeroState() {
  return { level: 1, xp: 0, sp: 0, talents: { vitality: 0, wellspring: 0, focus: 0, q: 0, r: 0 }, equip: { wand: "wand_basic", robe: "robe_school", charm: null } };
}
export function newProfile(hero = "harry") {
  const heroes = {};
  for (const h of HERO_IDS) heroes[h] = newHeroState();
  const spells = {};
  for (const s of STARTING_SPELLS) spells[s] = 1;
  return {
    v: SAVE_VERSION,
    hero,
    heroes,
    spells,
    equipped: "expelliarmus",
    inv: { wand_basic: 1, robe_school: 1, wiggenweld: 2, invigoration: 1 },
    gold: 20,
    quests: {},
    flags: {},
    objs: {},
    discovered: {},
    checkpoint: "courtyard",
    pos: null,
    stats: { time: 0, kills: 0, casts: 0, deaths: 0, pages: 0, chests: 0 },
    created: Date.now(),
  };
}

/** Derived numbers for the active hero. */
export function heroStats(P, heroId = P.hero) {
  const H = HEROES[heroId];
  const S = P.heroes[heroId];
  const L = S.level;
  const mods = { hp: 0, mana: 0, dmg: 0, cdr: 0, regen: 0, armor: 0, shield: 0, leech: 0 };
  for (const slot of ["wand", "robe", "charm"]) {
    const it = S.equip[slot] && ITEMS[S.equip[slot]];
    if (!it?.mods) continue;
    for (const [k, v] of Object.entries(it.mods)) mods[k] += v;
  }
  const T = S.talents;
  const passive = H.passive.id;
  let maxHp = (H.hp + (L - 1) * 12) * (1 + T.vitality * 0.1) + mods.hp;
  if (passive === "stalwart") maxHp *= 1.3;
  let maxMana = (H.mana + (L - 1) * 6) * (1 + T.wellspring * 0.1) * (1 + mods.mana);
  const regen = H.regen * (1 + T.focus * 0.2 + mods.regen);
  const dmgMul = (1 + (L - 1) * 0.07) * (1 + mods.dmg);
  let cdMul = 1 - mods.cdr;
  if (passive === "swift") cdMul *= 0.85;
  return {
    maxHp: Math.round(maxHp),
    maxMana: Math.round(maxMana),
    regen,
    dmgMul,
    cdMul,
    costMul: passive === "scholar" ? 0.8 : 1,
    armor: mods.armor,
    shieldMul: (passive === "stalwart" ? 1.5 : 1) * (1 + mods.shield),
    crit: passive === "swift" ? 0.15 : 0,
    leech: mods.leech,
    speed: H.speed,
    qMul: 1 + T.q * 0.25,
    rMul: 1 + T.r * 0.25,
    qCd: H.q.cd * (1 - T.q * 0.1) * cdMul,
    rCd: H.r.cd * (1 - T.r * 0.1) * cdMul,
    passive,
  };
}

/** Grant XP: the active hero gets it all, the others half. Returns level-ups [{hero, level}]. */
export function grantXp(P, n) {
  const ups = [];
  for (const h of HERO_IDS) {
    const S = P.heroes[h];
    if (S.level >= LEVEL_CAP) continue;
    S.xp += Math.round(h === P.hero ? n : n * 0.5);
    while (S.level < LEVEL_CAP && S.xp >= xpToNext(S.level)) {
      S.xp -= xpToNext(S.level);
      S.level++;
      S.sp++;
      ups.push({ hero: h, level: S.level });
    }
    if (S.level >= LEVEL_CAP) S.xp = 0;
  }
  return ups;
}

export function learnSpell(P, id) {
  if (P.spells[id]) return false;
  P.spells[id] = 1;
  return true;
}
export const knows = (P, id) => !!P.spells[id];
export const hotbar = (P) => HOTBAR.filter((s) => P.spells[s]);

/** Spend a skill point on a talent of the active hero. */
export function buyTalent(P, key) {
  const S = P.heroes[P.hero];
  const T = TALENTS[key];
  if (!T) return { ok: false, msg: "Unknown talent." };
  if (S.sp <= 0) return { ok: false, msg: "No skill points — level up to earn more." };
  if (S.talents[key] >= T.max) return { ok: false, msg: `${T.name} is already at its highest rank.` };
  S.talents[key]++;
  S.sp--;
  return { ok: true, msg: `${T.name} → rank ${S.talents[key]}` };
}
/** Spend the active hero's skill point on a shared spell rank. */
export function upgradeSpell(P, id) {
  const S = P.heroes[P.hero];
  if (!P.spells[id]) return { ok: false, msg: "You don't know that spell yet." };
  if (P.spells[id] >= maxRank(id)) return { ok: false, msg: `${SPELLS[id].name} is already mastered.` };
  if (S.sp <= 0) return { ok: false, msg: "No skill points — level up to earn more." };
  P.spells[id]++;
  S.sp--;
  return { ok: true, msg: `${SPELLS[id].name} → rank ${P.spells[id]}` };
}

export function addItem(P, id, n = 1) {
  P.inv[id] = (P.inv[id] || 0) + n;
}
export function removeItem(P, id, n = 1) {
  if ((P.inv[id] || 0) < n) return false;
  P.inv[id] -= n;
  if (P.inv[id] <= 0) delete P.inv[id];
  return true;
}
export const count = (P, id) => P.inv[id] || 0;

export function equip(P, id) {
  const it = ITEMS[id];
  if (!it || it.kind !== "equip") return { ok: false, msg: "That can't be equipped." };
  if (!count(P, id)) return { ok: false, msg: "You don't have that." };
  // one physical item: take it off whoever wore it before
  for (const h of HERO_IDS) for (const s of Object.keys(P.heroes[h].equip)) if (P.heroes[h].equip[s] === id && h !== P.hero) P.heroes[h].equip[s] = s === "wand" ? "wand_basic" : s === "robe" ? "robe_school" : null;
  P.heroes[P.hero].equip[it.slot] = id;
  return { ok: true, msg: `Equipped ${it.name}.` };
}
export function buy(P, id) {
  const it = ITEMS[id];
  if (!it?.price) return { ok: false, msg: "Not for sale." };
  if (P.gold < it.price) return { ok: false, msg: "Not enough Galleons." };
  P.gold -= it.price;
  addItem(P, id, 1);
  return { ok: true, msg: `Bought ${it.name}.` };
}
