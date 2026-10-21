/**
 * Persistent character profile (what the save file stores) and every pure
 * rule that reads or changes it: derived stats, XP / levels, skills,
 * inventory, equipment, cyberware, shops, upgrades.
 *
 * Every mutator returns { ok, msg } and leaves the profile unchanged when it
 * refuses, so the UI can never create invalid states (duplicate items, a
 * weapon in two slots, an empty primary slot, negative credits…).
 */
import { WEAPONS, RARITY, RARITY_MULT, MAX_UPGRADE, AMMO, upgradeCost } from "../data/weapons.js";
import { ARMOR, STACKS, AMMO_PACKS } from "../data/items.js";
import { CYBERWARE } from "../data/cyberware.js";
import { SKILLS, LEVEL_CAP, xpToNext } from "../data/skills.js";

export const SAVE_VERSION = 3;
const ok = (msg = "") => ({ ok: true, msg });
const no = (msg) => ({ ok: false, msg });

export function newProfile({ body = "m", skin = "light", hair = null, accent = "#19f0ff", name = "Kade" } = {}) {
  const P = {
    v: SAVE_VERSION,
    name,
    look: { body, skin, hair: hair || (body === "f" ? "Hair_Long" : "Hair_SimpleParted"), accent },
    level: 1,
    xp: 0,
    credits: 350,
    sp: 0,
    skills: {},
    weapons: [],
    armors: [],
    cyber: { owned: [], equipped: { os: null, ocular: null, skeleton: null, nervous: null } },
    stacks: { medkit: 2, scrap: 2 },
    ammo: { light: 0, heavy: 0, shell: 0, rifle: 0, cell: 0 },
    mags: {},
    equip: { w1: null, w2: null, melee: null, head: null, body: null },
    activeSlot: "w1",
    district: "market",
    story: { flags: {}, done: [], active: null, bosses: {}, seen: {} },
    unlocked: { market: true, industrial: false, corporate: false },
    stats: { kills: 0, deaths: 0, time: 0, shots: 0, hits: 0, crits: 0 },
    uidSeq: 1,
    ending: null,
  };
  const w = addWeapon(P, "pistol", "common", 0);
  P.equip.w1 = w.uid;
  const j = addArmor(P, "jacket");
  P.equip.body = j.uid;
  return P;
}

/* ------------------------------------------------------------ derived stats */
const skillRank = (P, id) => P.skills[id] || 0;
const sumFx = (P, key) => {
  let s = 0;
  for (const [id, r] of Object.entries(P.skills)) {
    const fx = SKILLS[id]?.fx;
    if (fx && fx[key]) s += fx[key] * r;
  }
  return s;
};
const cyberPassive = (P, key) => {
  let s = 0;
  for (const id of Object.values(P.cyber.equipped)) {
    const p = id && CYBERWARE[id]?.passive;
    if (p && p[key]) s += p[key];
  }
  return s;
};
const armorBonus = (P, key) => {
  let s = 0;
  for (const slot of ["head", "body"]) {
    const a = armorByUid(P, P.equip[slot]);
    const b = a && ARMOR[a.id].bonus;
    if (b && b[key]) s += b[key];
  }
  return s;
};

export function derive(P) {
  const L = P.level;
  const armorRaw = ["head", "body"].reduce((s, k) => s + (ARMOR[armorByUid(P, P.equip[k])?.id]?.armor || 0), 0) + cyberPassive(P, "armor");
  const maxHp = Math.round((100 + 4 * (L - 1) + sumFx(P, "hp") + armorBonus(P, "hp")) * (1 + cyberPassive(P, "hpMult")));
  const armorCap = Math.round(armorRaw * 1.6 * (1 + sumFx(P, "armorMult")));
  const maxStamina = Math.round((100 + (L - 1) + sumFx(P, "stamina") + armorBonus(P, "stamina")) * (1 + cyberPassive(P, "staminaMult")));
  const maxEnergy = Math.round(100 + 2 * (L - 1) + sumFx(P, "energy") + armorBonus(P, "energy"));
  const hack = 1 + Math.floor(L / 10) + sumFx(P, "hack");
  const accuracy = 1 - Math.min(0.7, sumFx(P, "accuracy") + cyberPassive(P, "accuracy") + armorBonus(P, "accuracy"));
  return {
    maxHp,
    armorCap,
    armorRating: armorRaw,
    maxStamina,
    staRegen: 26 * (1 + sumFx(P, "staRegen") + cyberPassive(P, "staRegen")),
    maxEnergy,
    energyRegen: 4 * (1 + sumFx(P, "energyRegen")),
    dmgMult: 1 + 0.01 * (L - 1) + sumFx(P, "dmg"),
    meleeMult: 1 + sumFx(P, "melee") + cyberPassive(P, "melee"),
    spreadMult: accuracy,
    reloadMult: 1 / (1 + sumFx(P, "reload") + cyberPassive(P, "reload")),
    crit: 0.05 + sumFx(P, "crit") + cyberPassive(P, "crit") + armorBonus(P, "crit"),
    critMult: 2 + sumFx(P, "critMult"),
    aimDmg: sumFx(P, "aimDmg"),
    dr: Math.min(0.4, sumFx(P, "dr") + armorBonus(P, "dr")),
    heal: 1 + sumFx(P, "heal"),
    regenCap: 0.4 + sumFx(P, "regenCap"),
    armorDelay: skillRank(P, "adrenal") ? 3 : 5,
    armorRegen: 1 + sumFx(P, "armorRegen"),
    hack,
    dash: 1 + sumFx(P, "dash"),
    vsRobot: 1 + sumFx(P, "vsRobot"),
    stun: sumFx(P, "stun"),
    stimBoost: sumFx(P, "stimBoost"),
    cdr: sumFx(P, "cdr"),
    stealth: sumFx(P, "stealth"),
    unbreakable: skillRank(P, "unbreakable") > 0,
    scanner: cyberPassive(P, "scanner"),
    biomon: cyberPassive(P, "biomon"),
  };
}

/** Character-sheet attributes for the UI. */
export function attributes(P) {
  const d = derive(P);
  return [
    { id: "health", label: "Health", value: d.maxHp },
    { id: "armor", label: "Armor", value: d.armorCap, note: `${Math.round((d.dr) * 100)}% damage reduction` },
    { id: "damage", label: "Damage", value: `${Math.round(d.dmgMult * 100)}%`, note: `melee ${Math.round(d.meleeMult * 100)}%` },
    { id: "accuracy", label: "Accuracy", value: `${Math.round((2 - d.spreadMult) * 100 - 100)}%`, note: "spread reduction" },
    { id: "crit", label: "Critical Chance", value: `${Math.round(d.crit * 100)}%`, note: `×${d.critMult.toFixed(1)} damage` },
    { id: "stamina", label: "Stamina", value: d.maxStamina },
    { id: "hack", label: "Hacking Power", value: d.hack },
    { id: "energy", label: "Cyber Energy", value: d.maxEnergy },
  ];
}

/* ------------------------------------------------------------ xp / levels */
export function addXp(P, n) {
  let gained = 0;
  if (P.level >= LEVEL_CAP) return 0;
  P.xp += Math.max(0, Math.round(n));
  while (P.level < LEVEL_CAP && P.xp >= xpToNext(P.level)) {
    P.xp -= xpToNext(P.level);
    P.level++;
    P.sp++;
    gained++;
  }
  if (P.level >= LEVEL_CAP) P.xp = 0;
  return gained;
}
export const addCredits = (P, n) => {
  P.credits = Math.max(0, Math.round(P.credits + n));
};

/* ------------------------------------------------------------ skills */
export function canLearn(P, id) {
  const s = SKILLS[id];
  if (!s) return no("Unknown skill.");
  const r = skillRank(P, id);
  if (r >= s.ranks) return no("Already at max rank.");
  if (P.level < s.level) return no(`Requires level ${s.level}.`);
  for (const [k, v] of Object.entries(s.req || {})) if (skillRank(P, k) < v) return no(`Requires ${SKILLS[k].name} ${v > 1 ? `rank ${v}` : ""}`.trim() + ".");
  if (P.sp < 1) return no("No skill points available.");
  return ok();
}
export function learnSkill(P, id) {
  const c = canLearn(P, id);
  if (!c.ok) return c;
  P.skills[id] = skillRank(P, id) + 1;
  P.sp--;
  return ok(`${SKILLS[id].name} → rank ${P.skills[id]}`);
}

/* ------------------------------------------------------------ inventory */
export const weaponByUid = (P, uid) => (uid == null ? null : P.weapons.find((w) => w.uid === uid) || null);
export const armorByUid = (P, uid) => (uid == null ? null : P.armors.find((a) => a.uid === uid) || null);
export const wdef = (w) => WEAPONS[w.id];

export function addWeapon(P, id, rarity = "common", level = 0) {
  const def = WEAPONS[id];
  if (!def) return null;
  const w = { uid: P.uidSeq++, id, rarity: RARITY.includes(rarity) ? rarity : "common", level: Math.max(0, Math.min(MAX_UPGRADE, level | 0)) };
  P.weapons.push(w);
  P.mags[w.uid] = def.melee ? 0 : magSize(w);
  return w;
}
export function addArmor(P, id) {
  if (!ARMOR[id]) return null;
  const a = { uid: P.uidSeq++, id };
  P.armors.push(a);
  return a;
}
export function addStack(P, id, n = 1) {
  const s = STACKS[id];
  if (!s) return 0;
  const cur = P.stacks[id] || 0;
  const cap = s.max ?? 99;
  const add = Math.max(0, Math.min(n, cap - cur));
  if (add > 0) P.stacks[id] = cur + add;
  return add;
}
export function takeStack(P, id, n = 1) {
  const cur = P.stacks[id] || 0;
  if (cur < n) return false;
  if (cur - n <= 0) delete P.stacks[id];
  else P.stacks[id] = cur - n;
  return true;
}
export function addAmmo(P, type, n) {
  if (!AMMO[type] || AMMO[type].unlimited) return 0;
  const cur = P.ammo[type] || 0;
  const add = Math.max(0, Math.min(n, AMMO[type].max - cur));
  P.ammo[type] = cur + add;
  return add;
}

/* ------------------------------------------------------------ weapon stats */
export function magSize(w) {
  const d = WEAPONS[w.id];
  if (d.melee) return 0;
  const r = RARITY.indexOf(w.rarity);
  return Math.round(d.mag * (1 + r * 0.06));
}
export function weaponStats(w, D = null, buffs = null) {
  const d = WEAPONS[w.id];
  const rm = RARITY_MULT[w.rarity] || 1;
  const lv = 1 + w.level * 0.07;
  const melee = !!d.melee;
  let dmg = d.dmg * rm * lv * (D ? (melee ? D.meleeMult * (1 + 0.01 * 0) : D.dmgMult) : 1);
  if (melee && D) dmg *= 1 + (D.dmgMult - 1) * 0.5;
  let rpm = d.rpm * (1 + w.level * 0.02);
  if (buffs?.neural) {
    dmg *= 1.3;
    rpm *= 1.25;
  }
  if (buffs?.stim) dmg *= 1 + buffs.stim;
  const spread = d.spread * (1 - w.level * 0.05) * (D ? D.spreadMult : 1);
  const reload = d.reload * (1 - w.level * 0.04) * (D ? D.reloadMult : 1) * (buffs?.neural ? 0.5 : 1);
  return {
    name: d.name,
    type: d.type,
    melee,
    dmg,
    pellets: d.pellets || 1,
    rpm,
    interval: 60 / rpm,
    auto: d.auto,
    mag: magSize(w),
    reload,
    spread: (spread * Math.PI) / 180,
    range: d.range,
    recoil: d.recoil,
    ammo: d.ammo,
    pierce: d.pierce || 1,
    vsRobot: (d.vsRobot || 1) * (D ? D.vsRobot : 1),
    crit: (D ? D.crit : 0.05) + (d.critBonus || 0),
    critMult: D ? D.critMult : 2,
    reach: d.reach || 0,
    arc: ((d.arc || 0) * Math.PI) / 180,
    rarity: w.rarity,
    level: w.level,
  };
}

/* ------------------------------------------------------------ equipment */
const RANGED_SLOTS = ["w1", "w2"];
export function equipWeapon(P, uid, slot) {
  const w = weaponByUid(P, uid);
  if (!w) return no("Item not found.");
  const d = WEAPONS[w.id];
  if (slot === "melee" ? !d.melee : d.melee || !RANGED_SLOTS.includes(slot)) return no(d.melee ? "Melee weapons go in the melee slot." : "Ranged weapons go in a ranged slot.");
  const prev = P.equip[slot];
  // already equipped elsewhere → swap the two slots
  for (const s of ["w1", "w2", "melee"]) if (s !== slot && P.equip[s] === uid) P.equip[s] = prev;
  P.equip[slot] = uid;
  if (!P.equip.w1) {
    P.equip.w1 = P.equip.w2;
    P.equip.w2 = null;
  }
  if (!P.equip[P.activeSlot]) P.activeSlot = "w1";
  return ok(`${d.name} equipped.`);
}
export function unequipWeapon(P, slot) {
  if (slot === "w1" && !P.equip.w2) return no("You must keep one ranged weapon equipped.");
  if (slot === "w1") {
    P.equip.w1 = P.equip.w2;
    P.equip.w2 = null;
  } else P.equip[slot] = null;
  if (!P.equip[P.activeSlot]) P.activeSlot = "w1";
  return ok("Unequipped.");
}
export function equipArmor(P, uid) {
  const a = armorByUid(P, uid);
  if (!a) return no("Item not found.");
  P.equip[ARMOR[a.id].slot] = uid;
  return ok(`${ARMOR[a.id].name} equipped.`);
}
export function unequipArmor(P, slot) {
  P.equip[slot] = null;
  return ok("Unequipped.");
}
export function equipCyber(P, id) {
  const c = CYBERWARE[id];
  if (!c || !P.cyber.owned.includes(id)) return no("Not installed.");
  P.cyber.equipped[c.slot] = id;
  return ok(`${c.name} online.`);
}
export function unequipCyber(P, slot) {
  if (!(slot in P.cyber.equipped)) return no("Unknown slot.");
  P.cyber.equipped[slot] = null;
  return ok("Cyberware offline.");
}
export const isEquipped = (P, uid) => Object.values(P.equip).includes(uid);

/* ------------------------------------------------------------ economy */
export function weaponValue(w) {
  const d = WEAPONS[w.id];
  return Math.round(d.price * RARITY_MULT[w.rarity] * (1 + w.level * 0.35));
}
export const sellPrice = {
  weapon: (w) => Math.round(weaponValue(w) * 0.35),
  armor: (a) => Math.round(ARMOR[a.id].price * 0.35),
  stack: (id) => STACKS[id]?.sell || 0,
};

export function sellWeapon(P, uid) {
  const w = weaponByUid(P, uid);
  if (!w) return no("Item not found.");
  if (isEquipped(P, uid)) return no("Unequip it first.");
  const v = sellPrice.weapon(w);
  P.weapons = P.weapons.filter((x) => x.uid !== uid);
  delete P.mags[uid];
  addCredits(P, v);
  return ok(`Sold for ${v} ¢.`);
}
export function sellArmor(P, uid) {
  const a = armorByUid(P, uid);
  if (!a) return no("Item not found.");
  if (isEquipped(P, uid)) return no("Unequip it first.");
  const v = sellPrice.armor(a);
  P.armors = P.armors.filter((x) => x.uid !== uid);
  addCredits(P, v);
  return ok(`Sold for ${v} ¢.`);
}
export function sellStack(P, id, n = 1) {
  const s = STACKS[id];
  if (!s || s.cat === "quest") return no("Quest items can't be sold.");
  if (!takeStack(P, id, n)) return no("Not enough.");
  addCredits(P, s.sell * n);
  return ok(`Sold for ${s.sell * n} ¢.`);
}

/** Shop stock entry → price / availability / purchase. */
export function stockPrice(entry) {
  if (entry.kind === "weapon") return Math.round(WEAPONS[entry.id].price * RARITY_MULT[entry.rarity || "common"] * (entry.rarity === "common" || !entry.rarity ? 1 : 1.25));
  if (entry.kind === "armor") return ARMOR[entry.id].price;
  if (entry.kind === "stack") return STACKS[entry.id].price;
  if (entry.kind === "ammo") return AMMO_PACKS[entry.id].price;
  if (entry.kind === "cyber") return CYBERWARE[entry.id].cost;
  return 0;
}
export function canBuy(P, entry) {
  const price = stockPrice(entry);
  if (entry.kind === "cyber") {
    const c = CYBERWARE[entry.id];
    if (P.cyber.owned.includes(entry.id)) return no("Already installed.");
    if (P.level < (c.req?.level || 1)) return no(`Requires level ${c.req.level}.`);
    if (c.req?.flag && !P.story.flags[c.req.flag]) return no("Not yet available.");
    for (const [m, n] of Object.entries(c.mats || {})) if ((P.stacks[m] || 0) < n) return no(`Needs ${n}× ${STACKS[m].name}.`);
  }
  if (entry.kind === "stack") {
    const s = STACKS[entry.id];
    if ((P.stacks[entry.id] || 0) >= (s.max ?? 99)) return no("You can't carry more.");
  }
  if (entry.kind === "ammo") {
    const a = AMMO_PACKS[entry.id];
    if ((P.ammo[a.ammo] || 0) >= AMMO[a.ammo].max) return no("Ammo pouch full.");
  }
  if (entry.kind === "weapon" && WEAPONS[entry.id].unique && P.weapons.some((w) => w.id === entry.id)) return no("You already own it.");
  if (P.credits < price) return no("Not enough credits.");
  return ok();
}
export function buy(P, entry) {
  const c = canBuy(P, entry);
  if (!c.ok) return c;
  const price = stockPrice(entry);
  P.credits -= price;
  if (entry.kind === "weapon") addWeapon(P, entry.id, entry.rarity || "common", 0);
  else if (entry.kind === "armor") addArmor(P, entry.id);
  else if (entry.kind === "stack") addStack(P, entry.id, 1);
  else if (entry.kind === "ammo") {
    const a = AMMO_PACKS[entry.id];
    addAmmo(P, a.ammo, a.qty);
  } else if (entry.kind === "cyber") {
    const cw = CYBERWARE[entry.id];
    for (const [m, n] of Object.entries(cw.mats || {})) takeStack(P, m, n);
    P.cyber.owned.push(entry.id);
    if (!P.cyber.equipped[cw.slot]) P.cyber.equipped[cw.slot] = entry.id;
  }
  return ok("Purchased.");
}

export function canUpgrade(P, uid) {
  const w = weaponByUid(P, uid);
  if (!w) return no("Item not found.");
  if (w.level >= MAX_UPGRADE) return no("Fully upgraded.");
  const cost = upgradeCost(WEAPONS[w.id], w.rarity, w.level);
  if (P.credits < cost.credits) return no("Not enough credits.");
  for (const [m, n] of Object.entries(cost.mats)) if ((P.stacks[m] || 0) < n) return no(`Needs ${n}× ${STACKS[m].name}.`);
  return { ok: true, msg: "", cost };
}
export function upgradeWeapon(P, uid) {
  const c = canUpgrade(P, uid);
  if (!c.ok) return c;
  const w = weaponByUid(P, uid);
  P.credits -= c.cost.credits;
  for (const [m, n] of Object.entries(c.cost.mats)) takeStack(P, m, n);
  w.level++;
  return ok(`${WEAPONS[w.id].name} upgraded to Mk ${w.level + 1}.`);
}

/* ------------------------------------------------------------ sorting */
const RANK = (r) => RARITY.indexOf(r);
export function sortedInventory(P, cat, by = "rarity") {
  let list = [];
  if (cat === "weapons") list = P.weapons.map((w) => ({ kind: "weapon", ref: w, uid: w.uid, name: WEAPONS[w.id].name, rarity: w.rarity, value: weaponValue(w), type: WEAPONS[w.id].type }));
  else if (cat === "armor") list = P.armors.map((a) => ({ kind: "armor", ref: a, uid: a.uid, name: ARMOR[a.id].name, rarity: ARMOR[a.id].rarity, value: ARMOR[a.id].price, type: ARMOR[a.id].slot }));
  else if (cat === "cyberware") list = P.cyber.owned.map((id) => ({ kind: "cyber", id, name: CYBERWARE[id].name, rarity: CYBERWARE[id].rarity, value: CYBERWARE[id].cost, type: CYBERWARE[id].slot }));
  else
    list = Object.entries(P.stacks)
      .filter(([id]) => STACKS[id] && STACKS[id].cat === cat)
      .map(([id, q]) => ({ kind: "stack", id, qty: q, name: STACKS[id].name, rarity: STACKS[id].rarity, value: STACKS[id].price || 0, type: STACKS[id].cat }));
  const cmp = {
    rarity: (a, b) => RANK(b.rarity) - RANK(a.rarity) || a.name.localeCompare(b.name),
    name: (a, b) => a.name.localeCompare(b.name),
    value: (a, b) => b.value - a.value,
    type: (a, b) => String(a.type).localeCompare(String(b.type)) || RANK(b.rarity) - RANK(a.rarity),
  }[by];
  return list.sort(cmp || undefined);
}

/* ------------------------------------------------------------ validation */
/** Repair any inconsistency (used after loading a save). Returns the profile. */
export function sanitize(P) {
  const seen = new Set();
  P.weapons = (P.weapons || []).filter((w) => w && WEAPONS[w.id] && !seen.has(w.uid) && seen.add(w.uid));
  P.armors = (P.armors || []).filter((a) => a && ARMOR[a.id] && !seen.has(a.uid) && seen.add(a.uid));
  let maxUid = 0;
  for (const x of [...P.weapons, ...P.armors]) {
    x.uid = x.uid | 0;
    maxUid = Math.max(maxUid, x.uid);
    if ("level" in x) x.level = Math.max(0, Math.min(MAX_UPGRADE, x.level | 0));
    if ("rarity" in x && !RARITY.includes(x.rarity)) x.rarity = "common";
  }
  P.uidSeq = Math.max(P.uidSeq | 0, maxUid + 1);
  P.equip = { w1: null, w2: null, melee: null, head: null, body: null, ...(P.equip || {}) };
  const used = new Set();
  for (const s of ["w1", "w2", "melee"]) {
    const w = weaponByUid(P, P.equip[s]);
    const okSlot = w && (s === "melee" ? WEAPONS[w.id].melee : !WEAPONS[w.id].melee) && !used.has(w.uid);
    if (!okSlot) P.equip[s] = null;
    else used.add(w.uid);
  }
  for (const s of ["head", "body"]) {
    const a = armorByUid(P, P.equip[s]);
    if (!a || ARMOR[a.id].slot !== s) P.equip[s] = null;
  }
  if (!P.equip.w1) {
    P.equip.w1 = P.equip.w2;
    P.equip.w2 = null;
  }
  if (!P.equip.w1) {
    // never leave the player unarmed: re-issue the standard pistol
    let pistol = P.weapons.find((w) => !WEAPONS[w.id].melee);
    if (!pistol) pistol = addWeapon(P, "pistol", "common", 0);
    P.equip.w1 = pistol.uid;
  }
  if (!["w1", "w2", "melee"].includes(P.activeSlot) || !P.equip[P.activeSlot]) P.activeSlot = "w1";
  P.mags = P.mags || {};
  for (const w of P.weapons) {
    const m = magSize(w);
    const cur = P.mags[w.uid];
    P.mags[w.uid] = WEAPONS[w.id].melee ? 0 : Number.isFinite(cur) ? Math.max(0, Math.min(m, cur | 0)) : m;
  }
  for (const k of Object.keys(P.mags)) if (!weaponByUid(P, +k)) delete P.mags[k];
  P.ammo = { light: 0, heavy: 0, shell: 0, rifle: 0, cell: 0, ...(P.ammo || {}) };
  for (const k of Object.keys(P.ammo)) {
    if (!AMMO[k] || AMMO[k].unlimited) delete P.ammo[k];
    else P.ammo[k] = Math.max(0, Math.min(AMMO[k].max, P.ammo[k] | 0));
  }
  P.stacks = Object.fromEntries(Object.entries(P.stacks || {}).filter(([id, q]) => STACKS[id] && q > 0).map(([id, q]) => [id, Math.min(STACKS[id].max ?? 99, q | 0)]));
  P.cyber = P.cyber || { owned: [], equipped: {} };
  P.cyber.owned = [...new Set((P.cyber.owned || []).filter((id) => CYBERWARE[id]))];
  const eq = { os: null, ocular: null, skeleton: null, nervous: null };
  for (const [slot, id] of Object.entries(P.cyber.equipped || {})) if (slot in eq && id && P.cyber.owned.includes(id) && CYBERWARE[id].slot === slot) eq[slot] = id;
  P.cyber.equipped = eq;
  P.skills = Object.fromEntries(Object.entries(P.skills || {}).filter(([id, r]) => SKILLS[id] && r > 0).map(([id, r]) => [id, Math.min(SKILLS[id].ranks, r | 0)]));
  P.level = Math.max(1, Math.min(LEVEL_CAP, P.level | 0));
  P.xp = Math.max(0, P.xp | 0);
  P.sp = Math.max(0, P.sp | 0);
  P.credits = Math.max(0, Math.round(+P.credits || 0));
  return P;
}
