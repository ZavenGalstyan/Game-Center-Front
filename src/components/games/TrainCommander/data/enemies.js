/**
 * Train Commander — enemies and bosses (the Rustjaw raiders). Balance lives
 * here only.
 *
 * Coordinates are in the TRAIN FRAME (see engine/constants.js): the train is
 * still, the ground slides by at −trainSpeed. `speed` is an enemy's top speed
 * RELATIVE to the train, so a raider pacing beside a wagon is still in this
 * frame while its wheels (ground speed) spin at train speed.
 *
 * attack.kind
 *   melee   rides up beside a car and swings; damage lands at the impact frame
 *   ram     like melee but a heavy, slow lunge (vehicles)
 *   ranged  holds `hold` units off the train side and fires visible bolts;
 *           after ~15 s it presses in (`press` u/s, down to `minHold`) so a
 *           crew nobody can reach never stalls a route forever
 * target rule (deterministic):
 *   nearest  closest living car to the spawn point
 *   weakest  the car with the lowest HP fraction (ties → unarmed → nearest)
 *   loco     goes for the locomotive
 * threat: used by Lancer targeting (higher first).
 */
export const ENEMIES = {
  raider: {
    id: "raider",
    name: "Raider",
    blurb: "Scrap-bike rider with a hooked club. The backbone of every raid.",
    hp: 42,
    armor: 0,
    speed: 5.2,
    accel: 7,
    radius: 0.62,
    reward: 10,
    threat: 1,
    target: "nearest",
    attack: { kind: "melee", damage: 13, cooldown: 1.45, windup: 0.42, reach: 0.65 },
  },
  scout: {
    id: "scout",
    name: "Scout Rider",
    blurb: "Fast, fragile, and always heading for your weakest car.",
    hp: 26,
    armor: 0,
    speed: 9,
    accel: 12,
    radius: 0.55,
    reward: 7,
    threat: 1,
    target: "weakest",
    attack: { kind: "melee", damage: 8, cooldown: 0.95, windup: 0.3, reach: 0.6 },
  },
  armored: {
    id: "armored",
    name: "Armored Raider",
    blurb: "Plated trike and a heavy maul. Bullets ping off — bring a cannon.",
    hp: 115,
    armor: 4,
    speed: 3.5,
    accel: 4,
    radius: 0.8,
    reward: 19,
    threat: 2,
    target: "nearest",
    attack: { kind: "melee", damage: 22, cooldown: 1.75, windup: 0.6, reach: 0.7 },
  },
  ranged: {
    id: "ranged",
    name: "Bolt Gunner",
    blurb: "A sidecar crossbow crew. Keeps its distance and fires from range.",
    hp: 55,
    armor: 1,
    speed: 4.6,
    accel: 6,
    radius: 0.8,
    reward: 16,
    threat: 4,
    target: "nearest",
    attack: { kind: "ranged", damage: 11, cooldown: 2.2, windup: 0.5, hold: 10.5, minHold: 4, press: 0.22, range: 13, projectileSpeed: 18 },
  },
  vehicle: {
    id: "vehicle",
    name: "Raider Truck",
    blurb: "An armoured ram truck. Slow to stop, brutal when it connects.",
    hp: 320,
    armor: 4,
    speed: 4.1,
    accel: 3.5,
    radius: 1.45,
    reward: 48,
    threat: 3,
    target: "nearest",
    vehicle: true,
    attack: { kind: "ram", damage: 45, cooldown: 2.7, windup: 0.75, reach: 0.5 },
  },
};

export const ENEMY_IDS = ["raider", "scout", "armored", "ranged", "vehicle"];

/**
 * Bosses. Each has a unique model and a short ability list the engine runs on
 * its own timers (all game-time, all paused/sped up with the simulation).
 *   shell     telegraphed heavy shot at one car (red marker for `telegraph` s)
 *   summon    calls `count` escorts of `enemy`
 *   vent      after a shell volley its armour opens: takes `mult`× damage
 *   switch    at `at` HP fraction it crosses behind the train to the other side
 *   enrage    at `at` HP fraction ability timers run `rate`× faster
 */
export const BOSSES = {
  hauler: {
    id: "hauler",
    name: "Rustjaw Hauler",
    title: "MINI-BOSS",
    blurb: "A six-wheeled scrap hauler with a junk cannon and a ram plate.",
    hp: 950,
    armor: 4,
    speed: 4.4,
    accel: 3,
    radius: 2.0,
    reward: 120,
    threat: 5,
    hold: 6.5,
    abilities: [
      { type: "shell", every: 5.0, shots: 1, damage: 34, telegraph: 1.4, first: 3 },
      { type: "summon", every: 15, enemy: "raider", count: 2, first: 8 },
      { type: "enrage", at: 0.5, rate: 1.35 },
    ],
  },
  warwagon: {
    id: "warwagon",
    name: "Iron War Wagon",
    title: "BOSS",
    blurb: "A tracked fortress on wheels. Fires volleys, then vents its boilers.",
    hp: 2300,
    armor: 8,
    speed: 4,
    accel: 2.6,
    radius: 2.4,
    reward: 220,
    threat: 5,
    hold: 7,
    abilities: [
      { type: "shell", every: 7.0, shots: 3, damage: 30, telegraph: 1.3, first: 3.5 },
      { type: "vent", duration: 3.2, mult: 1.7 },
      { type: "switch", at: 0.5 },
    ],
  },
  walker: {
    id: "walker",
    name: "Siege Walker",
    title: "BOSS",
    blurb: "A four-legged mortar platform. Slow, but every slam hurts.",
    hp: 3000,
    armor: 7,
    speed: 3.2,
    accel: 2,
    radius: 2.4,
    reward: 260,
    threat: 5,
    hold: 9,
    abilities: [
      { type: "shell", every: 6.2, shots: 1, damage: 75, telegraph: 1.8, first: 4, splash: 1 },
      { type: "summon", every: 20, enemy: "armored", count: 1, first: 12 },
      { type: "enrage", at: 0.5, rate: 1.4 },
    ],
  },
  captain: {
    id: "captain",
    name: "Raider Captain",
    title: "BOSS",
    blurb: "The fastest rig in the wastes. Calls in scouts and keeps them coming.",
    hp: 2600,
    armor: 5,
    speed: 6.5,
    accel: 5,
    radius: 1.9,
    reward: 260,
    threat: 5,
    hold: 5.5,
    abilities: [
      { type: "summon", every: 11, enemy: "scout", count: 3, first: 3 },
      { type: "shell", every: 5.5, shots: 2, damage: 26, telegraph: 1.2, first: 6 },
      { type: "switch", at: 0.5 },
      { type: "enrage", at: 0.35, rate: 1.4 },
    ],
  },
  leviathan: {
    id: "leviathan",
    name: "Iron Leviathan",
    title: "FINAL BOSS",
    blurb: "The Rustjaw flagship — an armoured train on the parallel line.",
    hp: 6200,
    armor: 9,
    speed: 3.6,
    accel: 2,
    radius: 3.0,
    reward: 500,
    threat: 6,
    hold: 9.5,
    rail: true, // rides the parallel track on the far side (fixed z)
    abilities: [
      { type: "shell", every: 4.6, shots: 3, damage: 30, telegraph: 1.3, first: 3 },
      { type: "summon", every: 16, enemy: "raider", count: 3, first: 9 },
      { type: "vent", duration: 2.6, mult: 1.6 },
      { type: "enrage", at: 0.5, rate: 1.45 },
    ],
  },
};

/** damage after armour: flat reduction, but never below 25% of the hit */
export function armorDamage(dmg, armor) {
  if (!armor) return dmg;
  return Math.max(dmg * 0.25, dmg - armor);
}
