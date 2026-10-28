/**
 * Last Hope — enemy and wildlife types.
 *
 * Speeds in m/s (player walks 3.6, sprints 6.2). `detect` is the sight radius
 * in metres (×1.35 while the player sprints, ×0.8 at night for the player's
 * benefit — the dead hunt by sound). `windup` is the telegraph: the attack
 * only lands if the player is still within `reach` when it ends.
 * `armor` scales incoming damage (0.5 = half); blunt weapons ignore half of it.
 * `size` picks the navigation grid class (0 small, 1 large).
 */
export const ZOMBIES = {
  walker: { name: "Slow Walker", hp: 42, roam: 0.7, chase: 2.5, detect: 9, reach: 1.35, windup: 0.62, dmg: 9, cd: 1.5, radius: 0.36, poise: 0.3, xp: 12, size: 0, armor: 1, drop: "walker" },
  runner: { name: "Fast Runner", hp: 32, roam: 1.0, chase: 5.0, detect: 13, reach: 1.25, windup: 0.42, dmg: 7, cd: 1.0, radius: 0.33, poise: 0.2, xp: 18, size: 0, armor: 1, drop: "runner" },
  armored: { name: "Armored Zombie", hp: 120, roam: 0.6, chase: 2.3, detect: 10, reach: 1.45, windup: 0.75, dmg: 15, cd: 1.7, radius: 0.42, poise: 0.75, xp: 40, size: 0, armor: 0.5, drop: "armored" },
  toxic: { name: "Toxic Zombie", hp: 58, roam: 0.6, chase: 2.2, detect: 12, reach: 1.3, windup: 0.6, dmg: 6, cd: 1.6, radius: 0.4, poise: 0.4, xp: 30, size: 0, armor: 1, poison: 6, spit: { range: 9, min: 3.2, windup: 0.95, cd: 4.2, dmg: 8, speed: 11 }, cloud: { r: 2.6, t: 6, dps: 4 }, drop: "toxic" },
  brute: { name: "Heavy Brute", hp: 650, roam: 0.6, chase: 2.6, detect: 14, reach: 2.1, windup: 1.05, dmg: 30, cd: 2.4, radius: 0.85, poise: 1.6, xp: 300, size: 1, armor: 0.75, boss: true, slam: { r: 3.4, windup: 1.25, dmg: 26, cd: 6 }, charge: { min: 5, max: 13, windup: 0.9, speed: 9.5, dmg: 24, cd: 7 }, drop: "brute" },
};
for (const [id, z] of Object.entries(ZOMBIES)) z.id = id;

/** Boss variants reuse the brute kit with their own numbers. */
export const BOSSES = {
  alpha: { type: "brute", name: "The Alpha Brute", hp: 650, dmgMul: 1, scale: 1.45, drop: "alpha" },
  warden: { type: "brute", name: "The Warden", hp: 1100, dmgMul: 1.25, scale: 1.65, drop: "warden" },
};

export const ANIMALS = {
  deer: { name: "Deer", hp: 30, speed: 1.1, flee: 7.5, scare: 9, radius: 0.5, xp: 10, drop: { raw_meat: [2, 3], cloth: [0, 1] } },
  rabbit: { name: "Rabbit", hp: 10, speed: 1.3, flee: 6.5, scare: 6, radius: 0.22, xp: 4, drop: { raw_meat: [1, 1] } },
};
