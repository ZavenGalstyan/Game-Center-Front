/**
 * Last Hope — damage, death, drops and XP. Shared by the zombie AI, the
 * player's combat, hazards and structures.
 */
import { ITEMS } from "../data/items.js";
import { LOOT } from "../data/loot.js";
import { ZOMBIES, BOSSES, ANIMALS } from "../data/zombies.js";
import { weighted, rint } from "./util.js";

export function emit(G, e) {
  G.events.push(e);
}

/** Roll a loot table into [{id, n}] (merged). */
export function rollTable(rng, tableId) {
  const T = LOOT[tableId];
  if (!T) return [];
  const rolls = rint(rng, T.rolls[0], T.rolls[1]);
  const out = new Map();
  const list = T.items.map((e) => [e, e[1]]);
  for (let r = 0; r < rolls; r++) {
    const [[id, , mn, mx]] = weighted(rng, list);
    const n = rint(rng, mn, mx);
    out.set(id, (out.get(id) || 0) + n);
  }
  return [...out].map(([id, n]) => ({ id, n: (ITEMS[id]?.stack || 1) > 1 ? n : 1 }));
}

/** XP needed to go from `level` to level+1. */
export const xpFor = (level) => Math.round(70 * Math.pow(level, 1.38));
export const maxHpFor = (level) => Math.min(160, 100 + (level - 1) * 4);

export function giveXp(G, n) {
  const P = G.P;
  P.xp += Math.round(n);
  while (P.xp >= xpFor(P.level)) {
    P.xp -= xpFor(P.level);
    P.level++;
    P.maxHp = maxHpFor(P.level);
    P.hp = Math.min(P.maxHp, P.hp + 25);
    emit(G, { t: "level", level: P.level });
  }
}

/** Ground pickup (zombie / animal drops, dropped items). */
export function dropItems(G, x, z, items) {
  const list = items.filter((i) => i && i.n > 0);
  if (!list.length) return null;
  const p = { id: G.R.nextId++, x: x + (G.rng() - 0.5) * 0.6, z: z + (G.rng() - 0.5) * 0.6, items: list, t: 0, life: 300 };
  G.R.pickups.push(p);
  return p;
}

/** Total armor soak from equipment. */
export function armorDef(G) {
  let d = 0;
  for (const k of ["head", "body", "legs", "feet"]) {
    const it = G.equip[k];
    if (it && (it.d == null || it.d > 0)) d += ITEMS[it.id]?.def || 0;
  }
  return d;
}

/** Hurt the player. src: {x, z} for knockback, kind for the HUD. */
export function hurtPlayer(G, amount, src = null, o = {}) {
  const P = G.P;
  if (P.dead || G.god) return 0;
  if (P.iframes > 0 && !o.ignoreIframes) return 0;
  const def = o.pierce ? 0 : armorDef(G);
  let dmg = amount * G.diff.zdmg * (60 / (60 + def));
  dmg = Math.max(1, Math.round(dmg));
  P.hp -= dmg;
  P.hurtT = 0.35;
  P.lastHurt = G.t;
  if (o.poison) P.poison = Math.max(P.poison, o.poison);
  // wear a random worn armor piece
  const worn = ["head", "body", "legs", "feet"].filter((k) => G.equip[k] && G.equip[k].d > 0);
  if (worn.length && !o.dot) {
    const k = worn[Math.floor(G.rng() * worn.length)];
    G.equip[k].d -= 1;
    if (G.equip[k].d <= 0) {
      emit(G, { t: "broke", id: G.equip[k].id });
      G.equip[k] = null;
      G.invVersion++;
    }
  }
  if (src && !o.dot) {
    const dx = P.x - src.x;
    const dz = P.z - src.z;
    const l = Math.hypot(dx, dz) || 1;
    const kb = o.knock ?? 0.35;
    P.kx += (dx / l) * kb * 8;
    P.kz += (dz / l) * kb * 8;
  }
  if (!o.dot) emit(G, { t: "phit", amount: dmg, x: P.x, z: P.z, kind: o.kind || "melee" });
  if (P.hp <= 0) {
    P.hp = 0;
    P.dead = true;
    P.deadT = 0;
    emit(G, { t: "death", cause: o.cause || "zombie" });
  }
  return dmg;
}

/**
 * Damage a zombie. o: {blunt, stagger (0..1+), crit, src {x,z}, kind}.
 * Returns the damage dealt.
 */
export function damageZombie(G, z, amount, o = {}) {
  if (z.state === "dead") return 0;
  const def = z.def;
  const arm = def.armor;
  const mult = o.blunt ? 1 - (1 - arm) * 0.5 : arm;
  let dmg = amount * mult * (o.crit ? 1.6 : 1);
  dmg = Math.max(1, Math.round(dmg));
  z.hp -= dmg;
  z.flash = 1;
  z.lastHit = G.t;
  emit(G, { t: "zhit", id: z.id, amount: dmg, crit: !!o.crit, x: z.x, z: z.z, kind: o.kind || "melee", armored: arm < 1 });
  // anything that hurts it makes it aware
  if (z.state === "idle" || z.state === "roam" || z.state === "return" || z.state === "search") {
    z.state = "chase";
    z.st = 0;
    z.lost = 0;
    z.lastSeen = { x: G.P.x, z: G.P.z };
  }
  if (o.src) {
    const dx = z.x - o.src.x;
    const dz = z.z - o.src.z;
    const l = Math.hypot(dx, dz) || 1;
    const k = (o.stagger || 0.2) * (def.boss ? 0.15 : 1) * 0.55;
    z.kx += (dx / l) * k * 6;
    z.kz += (dz / l) * k * 6;
  }
  if (z.hp <= 0) {
    killZombie(G, z, o);
    return dmg;
  }
  // stagger interrupts telegraphs (bosses only on heavy hits during a stun)
  const poise = def.poise * (z.boss ? 1.6 : 1);
  if ((o.stagger || 0) * (0.65 + G.rng() * 0.7) > poise && z.state !== "charge") {
    z.state = "hurt";
    z.st = def.boss ? 0.35 : 0.42;
    emit(G, { t: "zstagger", id: z.id });
  }
  return dmg;
}

export function killZombie(G, z, o = {}) {
  z.state = "dead";
  z.st = 0;
  z.hp = 0;
  const S = G.stats;
  S.kills[z.t] = (S.kills[z.t] || 0) + 1;
  S.kills.any = (S.kills.any || 0) + 1;
  emit(G, { t: "zdie", id: z.id, type: z.t, x: z.x, z: z.z, boss: z.boss });
  const bossDef = z.boss ? BOSSES[z.boss] : null;
  giveXp(G, bossDef ? (z.boss === "warden" ? 600 : 300) : ZOMBIES[z.t].xp);
  // drops
  const items = rollTable(G.rng, z.def.drop);
  if (z.night === false && G.rng() < 0.08) items.push({ id: "bandage", n: 1 });
  dropItems(G, z.x, z.z, items);
  if (z.t === "toxic") G.R.clouds.push({ x: z.x, z: z.z, r: z.def.cloud.r, t: z.def.cloud.t, life: z.def.cloud.t, dps: z.def.cloud.dps });
  if (z.boss) {
    G.locs[G.loc].bossDead = true;
    G.flags[`boss_${z.boss}`] = true;
    emit(G, { t: "bossDown", id: z.boss, name: bossDef?.name });
  }
  if (z.raid && G.R.raid) G.R.raid.left--;
  void o;
}

export function damageAnimal(G, a, amount, o = {}) {
  if (a.dead) return 0;
  const dmg = Math.max(1, Math.round(amount * (o.crit ? 1.6 : 1)));
  a.hp -= dmg;
  a.flee = 6;
  a.flash = 1;
  emit(G, { t: "ahit", id: a.id, amount: dmg, x: a.x, z: a.z, crit: !!o.crit });
  if (a.hp <= 0) {
    a.dead = true;
    a.st = 0;
    const def = ANIMALS[a.t];
    const items = Object.entries(def.drop).map(([id, [mn, mx]]) => ({ id, n: rint(G.rng, mn, mx) }));
    dropItems(G, a.x, a.z, items);
    giveXp(G, def.xp);
    emit(G, { t: "adie", id: a.id, type: a.t, x: a.x, z: a.z });
  }
  return dmg;
}
