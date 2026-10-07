/**
 * Dungeon Knight — enemy archetypes. Each one exists for a gameplay reason:
 *
 *   slime          telegraph training: long wind-up, a hop, a long recovery
 *   skeleton       basic melee: direct slash
 *   shieldSkel     positioning: frontal shield blocks light slashes; heavy breaks it, flanks work
 *   bat            tracking: hovers, weaves, swoops in a line
 *   spider         dodge timing: side-steps, then a fast leap
 *   mage           distance pressure: keeps away and casts blockable orbs
 *   darkKnight     block pressure: armoured, two-hit combo, heavy recovery after
 *   golem          slow, huge, telegraphed ground slams (area)
 *   …and five bosses, each 3–4 attacks with phase changes.
 *
 * Attack shapes (all strictly front/area based — enemies never read input):
 *   arc      melee sector: range + half-angle, from the attacker's facing
 *   hop      body lunge toward where the player WAS at the end of the wind-up
 *   charge   long straight dash, contact damage
 *   slam     circle at `offset` metres in front, radius r
 *   ring     expanding ring around the attacker (dodge through it)
 *   orb      projectiles (count, spread, speed); blockable
 *   swoop    flying dash (bat)
 * Times: tele (telegraph / wind-up) → act (hit window) → rec (recovery).
 * `dmg` is a multiplier of the enemy's base damage.
 */
const A = (o) => ({ dmg: 1, blockable: true, weight: 1, cd: 0, minPhase: 0, maxPhase: 9, lunge: 0, ...o });

export const ENEMIES = {
  slime: {
    id: "slime", name: "Dungeon Slime", family: "slime", hp: 34, dmg: 10, speed: 2.1, radius: 0.5, height: 0.92,
    poise: 1, xp: 12, gold: 4, mass: 0.8, notice: 9, armored: false, flying: false,
    attacks: [A({ id: "hop", kind: "hop", tele: 0.72, act: 0.34, rec: 0.95, range: 3.4, minRange: 0, speed: 7.5, contact: 0.62 })],
    keep: 1.6,
  },
  skeleton: {
    id: "skeleton", name: "Skeleton Warrior", family: "skeleton", hp: 50, dmg: 14, speed: 2.7, radius: 0.38, height: 1.75,
    poise: 2, xp: 20, gold: 7, mass: 1, notice: 11, armored: false, flying: false, sound: "bone",
    attacks: [
      A({ id: "slash", kind: "arc", tele: 0.52, act: 0.14, rec: 0.68, range: 1.9, reach: 2.05, arc: 1.0, lunge: 1.1 }),
      A({ id: "thrust", kind: "arc", tele: 0.62, act: 0.12, rec: 0.75, range: 2.3, reach: 2.45, arc: 0.4, lunge: 1.8, dmg: 1.2, weight: 0.5, cd: 2.5 }),
    ],
    keep: 1.7,
  },
  shieldSkel: {
    id: "shieldSkel", name: "Shield Skeleton", family: "skeleton", hp: 62, dmg: 13, speed: 2.3, radius: 0.42, height: 1.75,
    poise: 3, xp: 26, gold: 9, mass: 1.2, notice: 11, armored: false, flying: false, sound: "bone", shield: true,
    attacks: [
      A({ id: "bash", kind: "arc", tele: 0.55, act: 0.13, rec: 0.75, range: 1.6, reach: 1.75, arc: 0.8, lunge: 1.4, dmg: 0.9 }),
      A({ id: "slash", kind: "arc", tele: 0.6, act: 0.14, rec: 0.85, range: 1.9, reach: 2.0, arc: 1.0, lunge: 0.9, dmg: 1.0 }),
    ],
    keep: 1.6,
  },
  bat: {
    id: "bat", name: "Dungeon Bat", family: "bat", hp: 22, dmg: 8, speed: 4.4, radius: 0.36, height: 0.5, hover: 1.35,
    poise: 1, xp: 10, gold: 3, mass: 0.3, notice: 12, armored: false, flying: true,
    attacks: [A({ id: "swoop", kind: "swoop", tele: 0.55, act: 0.42, rec: 0.7, range: 4.2, minRange: 1.2, speed: 9, contact: 0.55 })],
    keep: 3.2,
  },
  spider: {
    id: "spider", name: "Cave Spider", family: "spider", hp: 40, dmg: 12, speed: 4.2, radius: 0.55, height: 0.7,
    poise: 1, xp: 16, gold: 6, mass: 0.7, notice: 11, armored: false, flying: false,
    attacks: [A({ id: "leap", kind: "hop", tele: 0.42, act: 0.3, rec: 0.8, range: 4.4, minRange: 1.5, speed: 11, contact: 0.65 })],
    keep: 3.4, strafe: true,
  },
  mage: {
    id: "mage", name: "Dungeon Mage", family: "mage", hp: 38, dmg: 11, speed: 2.6, radius: 0.4, height: 1.8,
    poise: 1, xp: 22, gold: 10, mass: 0.9, notice: 14, armored: false, flying: false,
    attacks: [A({ id: "orb", kind: "orb", tele: 0.9, act: 0.1, rec: 0.9, range: 11, minRange: 2.5, count: 1, spread: 0, speed: 7, orbR: 0.28, cd: 1.6 })],
    keep: 7, ranged: true,
  },
  darkKnight: {
    id: "darkKnight", name: "Dark Knight", family: "knight", hp: 120, dmg: 18, speed: 2.2, radius: 0.45, height: 1.95,
    poise: 5, xp: 45, gold: 18, mass: 1.6, notice: 12, armored: true, flying: false, sound: "armor",
    attacks: [
      A({ id: "combo", kind: "arc", tele: 0.6, act: 0.14, rec: 0.32, range: 2.1, reach: 2.25, arc: 1.05, lunge: 1.2, chain: "combo2" }),
      A({ id: "combo2", kind: "arc", tele: 0.32, act: 0.14, rec: 1.15, range: 99, reach: 2.25, arc: 1.05, lunge: 1.0, dmg: 1.1, weight: 0 }),
      A({ id: "overhead", kind: "slam", tele: 0.85, act: 0.12, rec: 1.2, range: 2.2, offset: 1.6, r: 1.0, dmg: 1.5, weight: 0.6, cd: 3 }),
    ],
    keep: 1.9,
  },
  golem: {
    id: "golem", name: "Stone Golem", family: "golem", hp: 170, dmg: 24, speed: 1.6, radius: 0.85, height: 2.6,
    poise: 8, xp: 55, gold: 22, mass: 3, notice: 10, armored: true, flying: false, sound: "stone",
    attacks: [
      A({ id: "slam", kind: "slam", tele: 1.05, act: 0.12, rec: 1.25, range: 2.8, offset: 1.7, r: 1.45, dmg: 1 }),
      A({ id: "sweep", kind: "arc", tele: 0.95, act: 0.18, rec: 1.1, range: 2.6, reach: 2.9, arc: 1.4, lunge: 0.4, dmg: 0.85, weight: 0.7 }),
    ],
    keep: 2.4,
  },

  /* ------------------------------------------------------------- bosses */
  cellarGuardian: {
    id: "cellarGuardian", name: "Cellar Guardian", family: "knight", boss: true, hp: 440, dmg: 20, speed: 2.25, radius: 0.75, height: 2.75,
    poise: 9, xp: 160, gold: 90, mass: 6, notice: 30, armored: true, flying: false, sound: "armor", scale: 1.42,
    attacks: [
      A({ id: "heavySlash", name: "Heavy Slash", kind: "arc", tele: 0.82, act: 0.16, rec: 1.0, range: 2.8, reach: 3.1, arc: 1.15, lunge: 1.6, dmg: 1.15 }),
      A({ id: "shieldBash", name: "Shield Bash", kind: "charge", tele: 0.7, act: 0.38, rec: 1.0, range: 6, minRange: 2.2, speed: 10, contact: 1.0, dmg: 0.9, weight: 0.7, cd: 2 }),
      A({ id: "overhead", name: "Overhead Strike", kind: "slam", tele: 1.0, act: 0.12, rec: 1.45, range: 3.0, offset: 2.0, r: 1.35, dmg: 1.5, weight: 0.8, cd: 2.5 }),
      A({ id: "combo", name: "Fury Combo", kind: "arc", tele: 0.6, act: 0.15, rec: 0.25, range: 2.8, reach: 3.0, arc: 1.1, lunge: 1.4, minPhase: 1, chain: "combo2", weight: 1.3 }),
      A({ id: "combo2", kind: "arc", tele: 0.36, act: 0.15, rec: 0.25, range: 99, reach: 3.0, arc: 1.1, lunge: 1.4, weight: 0, chain: "combo3" }),
      A({ id: "combo3", kind: "slam", tele: 0.55, act: 0.12, rec: 1.6, range: 99, offset: 1.9, r: 1.3, dmg: 1.3, weight: 0 }),
    ],
    phases: [0.5], keep: 2.6,
  },
  cryptWarden: {
    id: "cryptWarden", name: "Crypt Warden", family: "warden", boss: true, hp: 760, dmg: 24, speed: 2.4, radius: 0.75, height: 2.9,
    poise: 9, xp: 230, gold: 130, mass: 6, notice: 30, armored: false, flying: false, sound: "bone", scale: 1.5,
    attacks: [
      A({ id: "reap", name: "Reaping Sweep", kind: "arc", tele: 0.8, act: 0.2, rec: 1.0, range: 3.1, reach: 3.4, arc: 1.6, lunge: 0.8 }),
      A({ id: "spirits", name: "Grave Spirits", kind: "orb", tele: 0.9, act: 0.1, rec: 1.0, range: 14, minRange: 3, count: 3, spread: 0.42, speed: 6.5, orbR: 0.32, dmg: 0.8, cd: 2 }),
      A({ id: "roots", name: "Root Burst", kind: "slam", tele: 1.0, act: 0.14, rec: 1.3, range: 12, offset: 0, r: 1.6, target: true, dmg: 1.2, weight: 0.8, cd: 3 }),
      A({ id: "ring", name: "Moss Nova", kind: "ring", tele: 0.95, act: 0.9, rec: 1.2, range: 4.5, speed: 6, width: 0.6, max: 7.5, dmg: 1.0, minPhase: 1, cd: 3 }),
    ],
    phases: [0.5], keep: 3,
  },
  frostKeeper: {
    id: "frostKeeper", name: "Frost Keeper", family: "frost", boss: true, hp: 980, dmg: 27, speed: 2.5, radius: 0.75, height: 2.85,
    poise: 10, xp: 300, gold: 170, mass: 6, notice: 30, armored: true, flying: false, sound: "armor", scale: 1.45,
    attacks: [
      A({ id: "glacier", name: "Glacier Cleave", kind: "arc", tele: 0.75, act: 0.16, rec: 0.95, range: 2.9, reach: 3.2, arc: 1.2, lunge: 1.5 }),
      A({ id: "shards", name: "Ice Shards", kind: "orb", tele: 0.8, act: 0.1, rec: 0.9, range: 14, minRange: 3, count: 5, spread: 0.3, speed: 9, orbR: 0.25, dmg: 0.7, cd: 1.5 }),
      A({ id: "lunge", name: "Frozen Lunge", kind: "charge", tele: 0.7, act: 0.42, rec: 1.0, range: 8, minRange: 2.5, speed: 12, contact: 1.0, dmg: 1.0, cd: 2 }),
      A({ id: "nova", name: "Frost Nova", kind: "ring", tele: 1.0, act: 1.0, rec: 1.3, range: 5, speed: 6.5, width: 0.65, max: 8, dmg: 1.1, minPhase: 1, cd: 2.5 }),
    ],
    phases: [0.5], keep: 2.8,
  },
  infernalJailer: {
    id: "infernalJailer", name: "Infernal Jailer", family: "jailer", boss: true, hp: 1250, dmg: 30, speed: 2.4, radius: 0.85, height: 3.0,
    poise: 11, xp: 380, gold: 220, mass: 7, notice: 30, armored: true, flying: false, sound: "armor", scale: 1.55,
    attacks: [
      A({ id: "chain", name: "Chain Lash", kind: "arc", tele: 0.8, act: 0.16, rec: 1.0, range: 4.6, reach: 4.8, arc: 0.32, lunge: 0, dmg: 1.0 }),
      A({ id: "flameSlam", name: "Flame Slam", kind: "slam", tele: 1.0, act: 0.12, rec: 1.3, range: 3.2, offset: 2.0, r: 1.6, dmg: 1.35, cd: 2 }),
      A({ id: "charge", name: "Jailer's Charge", kind: "charge", tele: 0.75, act: 0.5, rec: 1.2, range: 10, minRange: 3, speed: 11, contact: 1.1, dmg: 1.1, cd: 2.5 }),
      A({ id: "embers", name: "Ember Volley", kind: "orb", tele: 0.8, act: 0.1, rec: 0.9, range: 14, minRange: 3, count: 4, spread: 0.36, speed: 8, orbR: 0.3, dmg: 0.75, minPhase: 1, cd: 2 }),
    ],
    phases: [0.5], keep: 3,
  },
  shadowKing: {
    id: "shadowKing", name: "Shadow King", family: "king", boss: true, hp: 1600, dmg: 33, speed: 2.7, radius: 0.75, height: 3.05,
    poise: 12, xp: 520, gold: 320, mass: 7, notice: 30, armored: true, flying: false, sound: "armor", scale: 1.55,
    attacks: [
      A({ id: "cleave", name: "Royal Cleave", kind: "arc", tele: 0.7, act: 0.16, rec: 0.9, range: 2.9, reach: 3.2, arc: 1.2, lunge: 1.6, chain: "cleave2", weight: 1.2 }),
      A({ id: "cleave2", kind: "arc", tele: 0.42, act: 0.16, rec: 1.0, range: 99, reach: 3.2, arc: 1.2, lunge: 1.6, weight: 0 }),
      A({ id: "orbs", name: "Shadow Orbs", kind: "orb", tele: 0.85, act: 0.1, rec: 0.9, range: 14, minRange: 3, count: 3, spread: 0.5, speed: 7.5, orbR: 0.32, dmg: 0.8, cd: 1.5 }),
      A({ id: "blink", name: "Shadow Step", kind: "charge", tele: 0.6, act: 0.36, rec: 0.9, range: 10, minRange: 3, speed: 15, contact: 1.0, dmg: 1.0, cd: 2 }),
      A({ id: "eclipse", name: "Eclipse", kind: "ring", tele: 1.0, act: 1.0, rec: 1.2, range: 5, speed: 6.5, width: 0.7, max: 8.5, dmg: 1.2, minPhase: 1, cd: 2.5 }),
      A({ id: "crown", name: "Crown Fall", kind: "slam", tele: 0.95, act: 0.12, rec: 1.4, range: 12, offset: 0, r: 1.7, target: true, dmg: 1.3, minPhase: 1, cd: 3 }),
    ],
    phases: [0.5], keep: 2.8,
  },
};

/** Elite = a tougher, faster, better-paying version of an archetype (gold crown + aura). */
export function enemyDef(type, tier = 0, elite = false) {
  const base = ENEMIES[type];
  if (!base) throw new Error(`unknown enemy ${type}`);
  const hpMul = 1 + 0.5 * tier;
  const dmgMul = 1 + 0.27 * tier;
  const d = {
    ...base,
    type,
    elite,
    hp: Math.round(base.hp * (base.boss ? 1 : hpMul) * (elite ? 2.0 : 1)),
    dmg: Math.round(base.dmg * (base.boss ? 1 : dmgMul) * (elite ? 1.2 : 1)),
    poise: base.poise + (elite ? 2 : 0),
    xp: Math.round(base.xp * (1 + 0.6 * tier) * (elite ? 3 : 1)),
    gold: Math.round(base.gold * (1 + 0.5 * tier) * (elite ? 3 : 1)),
    tempo: elite ? 0.9 : 1, // < 1 = slightly faster telegraphs
    scale: (base.scale || 1) * (elite ? 1.18 : 1),
    radius: base.radius * (elite ? 1.15 : 1),
    height: base.height * (elite ? 1.15 : 1),
  };
  if (elite) d.name = `Elite ${base.name}`;
  return d;
}

/** Statistic bucket for a defeated enemy. */
export const statFamily = (type) => (type === "slime" ? "slimes" : type === "skeleton" || type === "shieldSkel" ? "skeletons" : null);
