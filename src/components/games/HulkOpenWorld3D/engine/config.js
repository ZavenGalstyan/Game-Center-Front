/**
 * Hulk: Open World 3D — gameplay tuning. Every number the sim uses lives
 * here so balance passes never touch logic. Units: metres, seconds, HP.
 */
export const STEP = 1 / 60;
export const GRAVITY = 34;

export const HERO = {
  radius: 0.95,
  height: 3.4,
  pivot: 2.9, // camera / aim pivot above the feet
  walk: 4.2,
  run: 10,
  sprint: 19,
  accel: 46,
  airAccel: 14,
  turnRate: 11,
  stepUp: 1.25,
  jumpV: 14,
  leapMinV: 19, // super leap vertical speed at the smallest charge …
  leapMaxV: 40, // … and at full charge
  leapMinH: 9, // horizontal launch speed at smallest / full charge
  leapMaxH: 27,
  leapCharge: 1.15, // seconds of holding Space for a full charge
  leapThreshold: 0.2, // hold shorter than this = a normal jump
  maxHp: 500,
  regenDelay: 6,
  regen: 14, // HP / s once out of combat
  rageMax: 100,
  rageDuration: 11,
  rageDamage: 1.55, // damage multiplier while raging
  rageResist: 0.45, // incoming damage multiplier while raging
  rageSpeed: 1.12,
  rageOnHit: 0.09, // rage gained per point of damage dealt
  rageOnHurt: 0.16, // per point of damage taken
  landShockFall: 11, // metres of fall before a landing makes a shockwave
};

/** attacks: windup → active window → recovery (seconds); reach/radius in metres */
export const ATTACKS = {
  jab1: { dmg: 32, windup: 0.11, active: 0.1, recover: 0.2, reach: 2.6, radius: 1.6, knock: 7, lift: 3, rage: 1, chain: 0.42 },
  jab2: { dmg: 36, windup: 0.1, active: 0.1, recover: 0.22, reach: 2.7, radius: 1.6, knock: 8, lift: 3, rage: 1, chain: 0.45 },
  jab3: { dmg: 58, windup: 0.18, active: 0.12, recover: 0.36, reach: 2.9, radius: 1.9, knock: 17, lift: 7, rage: 1.2 },
  heavy: { dmg: 85, windup: 0.32, active: 0.12, recover: 0.42, reach: 3.0, radius: 2.0, knock: 22, lift: 8, rage: 1.2 },
  ragePunch: { dmg: 240, windup: 0.18, active: 0.14, recover: 0.55, reach: 3.4, radius: 2.4, knock: 36, lift: 10, rage: 0.6, charge: 0.75, cd: 7 },
  smash: { dmg: 95, windup: 0.42, recover: 0.5, radius: 9, knock: 16, lift: 12, cd: 6 },
  clap: { dmg: 80, windup: 0.36, recover: 0.45, range: 24, cone: 0.62, knock: 30, lift: 6, cd: 9 },
  dive: { dmg: 70, radius: 7, knock: 14, lift: 10 }, // airborne attack: slam down
  landing: { dmgMin: 40, dmgMax: 150, rMin: 5, rMax: 12, knock: 14, lift: 9 },
  body: { dmg: 40 }, // sprinting into props
};

/** grabbable / destructible props (half extents) */
export const PROPS = {
  car: { hx: 1.0, hy: 0.78, hz: 2.3, hp: 140, grab: true, weight: 1, explode: true, score: 60, solid: true },
  van: { hx: 1.15, hy: 1.15, hz: 2.6, hp: 180, grab: true, weight: 1.25, explode: true, score: 80, solid: true },
  taxi: { hx: 1.0, hy: 0.78, hz: 2.3, hp: 140, grab: true, weight: 1, explode: true, score: 60, solid: true },
  barrel: { hx: 0.45, hy: 0.62, hz: 0.45, hp: 25, grab: true, weight: 0.3, explode: true, score: 20, solid: true },
  crate: { hx: 0.8, hy: 0.8, hz: 0.8, hp: 35, grab: true, weight: 0.4, score: 15, solid: true },
  mcrate: { hx: 1.1, hy: 0.65, hz: 0.75, hp: 50, grab: true, weight: 0.5, score: 20, solid: true },
  concrete: { hx: 1.5, hy: 0.55, hz: 0.45, hp: 90, grab: true, weight: 0.8, score: 20, solid: true },
  bench: { hx: 1.0, hy: 0.45, hz: 0.38, hp: 20, grab: true, weight: 0.3, score: 10, solid: true },
  bin: { hx: 0.35, hy: 0.5, hz: 0.35, hp: 10, grab: true, weight: 0.15, score: 5, solid: false },
  hydrant: { hx: 0.25, hy: 0.45, hz: 0.25, hp: 15, score: 10, solid: false },
  lamp: { hx: 0.2, hy: 3.2, hz: 0.2, hp: 25, score: 10, solid: false },
  light: { hx: 0.25, hy: 3, hz: 0.25, hp: 35, score: 10, solid: false }, // traffic light
  fence: { hx: 2.0, hy: 0.6, hz: 0.07, hp: 20, score: 5, solid: true },
  barricade: { hx: 2.6, hy: 0.75, hz: 0.45, hp: 110, score: 40, solid: true },
  sandbag: { hx: 1.6, hy: 0.55, hz: 0.55, hp: 60, score: 15, solid: true },
  wallSec: { hx: 5, hy: 3, hz: 0.6, hp: 300, score: 80, solid: true },
  generator: { hx: 1.4, hy: 1.1, hz: 1.0, hp: 220, explode: true, score: 120, solid: true },
  fuelTank: { hx: 2.2, hy: 2.6, hz: 2.2, hp: 320, explode: true, score: 150, solid: true },
  reactor: { hx: 2.4, hy: 3.2, hz: 2.4, hp: 900, explode: true, score: 300, solid: true },
  debris: { hx: 2.2, hy: 1.1, hz: 1.6, hp: 120, score: 30, solid: true },
  shieldGen: { hx: 1.3, hy: 1.8, hz: 1.3, hp: 380, explode: true, score: 150, solid: true },
  target: { hx: 1.4, hy: 1.4, hz: 0.3, hp: 1, score: 25, solid: true },
};

/** thrown-object speeds per weight class and impact damage */
export const THROW = { speedLight: 44, speedHeavy: 32, dmgPerWeight: 150, minDmg: 40, splash: 3.2, explodeDmg: 140, explodeR: 6.5 };

export const ENEMY = {
  soldier: { hp: 70, r: 0.45, h: 1.8, speed: 5.6, range: 38, minRange: 9, view: 60, fire: "bullet", burst: 4, burstGap: 0.12, cd: 1.9, windup: 0.35, xp: 12, armor: 0, score: 10, mass: 1 },
  heavy: { hp: 180, r: 0.55, h: 2.0, speed: 3.8, range: 48, minRange: 12, view: 64, fire: "rocket", burst: 1, burstGap: 0, cd: 3.6, windup: 0.9, xp: 30, armor: 0.1, score: 25, mass: 1.6 },
  robot: { hp: 220, r: 0.6, h: 2.3, speed: 6.4, range: 26, minRange: 0, view: 55, fire: "blast", burst: 2, burstGap: 0.3, cd: 2.2, windup: 0.6, melee: 26, meleeRange: 2.8, xp: 35, armor: 0.15, score: 30, mass: 2.2 },
  heavyRobot: { hp: 700, r: 1.2, h: 4.2, speed: 2.8, range: 34, minRange: 0, view: 60, fire: "blast3", burst: 3, burstGap: 0.18, cd: 3.4, windup: 0.9, melee: 55, meleeRange: 4.4, xp: 110, armor: 0.4, score: 90, mass: 6 },
  apc: { hp: 900, r: 2.0, h: 2.6, speed: 7.5, range: 62, minRange: 10, view: 75, fire: "shell", burst: 1, burstGap: 0, cd: 3.2, windup: 1.0, xp: 130, armor: 0.35, score: 120, mass: 12, vehicle: true },
  turret: { hp: 260, r: 1.1, h: 2.2, speed: 0, range: 55, minRange: 0, view: 70, fire: "bullet", burst: 6, burstGap: 0.09, cd: 1.9, windup: 0.5, xp: 40, armor: 0.25, score: 40, mass: 99, fixed: true },
};

export const PROJ = {
  bullet: { speed: 95, dmg: 5, r: 0.25, life: 1.4, spread: 0.05 },
  rocket: { speed: 30, dmg: 34, r: 0.45, life: 3.5, splash: 4.5, spread: 0.02 },
  blast: { speed: 38, dmg: 15, r: 0.55, life: 2, spread: 0.02 },
  blast3: { speed: 34, dmg: 22, r: 0.7, life: 2.4, spread: 0.08 },
  shell: { speed: 48, dmg: 40, r: 0.4, life: 3, splash: 5, spread: 0.02 },
  missile: { speed: 24, dmg: 38, r: 0.6, life: 6, splash: 5.5 }, // boss lobbed missile (aimed at a marked spot)
  laser: { speed: 140, dmg: 9, r: 0.3, life: 1, spread: 0.0 },
  flame: { speed: 24, dmg: 5, r: 1.2, life: 0.75, spread: 0.12 },
  orb: { speed: 20, dmg: 30, r: 1.0, life: 5, splash: 4 },
};

/** XP needed to go from level L to L+1 */
export const xpForLevel = (L) => 120 + (L - 1) * 70;
export const MAX_LEVEL = 30;

/** per-difficulty multipliers */
export const DIFF = {
  easy: { dmgIn: 0.6, enemyHp: 0.85, aim: 1.35 },
  normal: { dmgIn: 1, enemyHp: 1, aim: 1 },
  hard: { dmgIn: 1.4, enemyHp: 1.2, aim: 0.75 },
};
