/**
 * Web Hero: City Defender — tuning constants (shared by the controller, the
 * bot and the headless tests). Units: metres, seconds.
 *
 * Heading convention (three.js rotation.y on +Z-facing models):
 *   forward(h) = (sin h, 0, cos h)    right(h) = (-cos h, 0, sin h)
 */
export const STEP = 1 / 120;
export const MAX_STEPS = 12;
export const GRAVITY = 26;

export const H = {
  radius: 0.4,
  height: 1.8,
  stepUp: 0.55,

  walk: 5.5,
  run: 10.5,
  sprint: 16,
  accel: 38,
  airAccel: 14,
  friction: 30,
  turnRate: 14,

  jumpV: 10.5,
  doubleV: 9.5,
  jumpCut: 4.5,
  coyote: 0.12,
  buffer: 0.15,
  maxFall: 42,

  climbSpeed: 5.2,
  climbSideSpeed: 4.2,
  wallJumpOut: 9,
  wallJumpUp: 9,
  wallRunSpeed: 15,
  wallRunTime: 1.6,
  wallRunMin: 8.5,
  ledgeReach: 1.3,

  // web swing
  webRange: 74,
  swingGravity: 30,
  swingPump: 9,
  swingSteer: 7,
  swingMax: 44,
  swingMinLen: 7,
  releaseBoost: 3.5,
  releaseUp: 5,

  // dodge
  dodgeSpeed: 15,
  dodgeTime: 0.32,
  dodgeIframes: 0.36,
  dodgeCd: 0.45,
  perfectWindow: 0.28,
  counterWindow: 1.1,

  // health
  maxHp: 100,
  hitIframes: 0.75,
  knockdownTime: 1.2,
};

/** melee moves: dmg, reach, arc (rad), windup / active / recover (s), knock, launch, energy */
export const MOVES = {
  punch1: { dmg: 9, reach: 2.2, arc: 1.3, wind: 0.06, act: 0.09, rec: 0.16, knock: 1.5, energy: 4, anim: "punchR" },
  punch2: { dmg: 10, reach: 2.2, arc: 1.3, wind: 0.06, act: 0.09, rec: 0.18, knock: 1.8, energy: 4, anim: "punchL" },
  kick3: { dmg: 18, reach: 2.6, arc: 1.6, wind: 0.1, act: 0.12, rec: 0.32, knock: 7, energy: 8, anim: "roundKick", finisher: true },
  kick: { dmg: 13, reach: 2.5, arc: 1.4, wind: 0.1, act: 0.11, rec: 0.26, knock: 3, energy: 5, anim: "frontKick" },
  launcher: { dmg: 14, reach: 2.5, arc: 1.4, wind: 0.12, act: 0.12, rec: 0.3, knock: 1, launch: 11, energy: 7, anim: "launchKick" },
  heavyPunch: { dmg: 24, reach: 2.4, arc: 1.2, wind: 0.16, act: 0.12, rec: 0.36, knock: 9, energy: 9, anim: "heavyPunch", breaksGuard: true },
  aerial: { dmg: 16, reach: 2.6, arc: 1.8, wind: 0.07, act: 0.12, rec: 0.22, knock: 4, spike: -14, energy: 7, anim: "aerialStrike" },
  counter: { dmg: 30, reach: 2.8, arc: 2.2, wind: 0.05, act: 0.14, rec: 0.3, knock: 8, energy: 12, anim: "counter", breaksGuard: true },
  pullPunch: { dmg: 12, reach: 2.3, arc: 1.4, wind: 0.05, act: 0.09, rec: 0.16, knock: 1.5, energy: 5, anim: "punchR" },
  pullKick: { dmg: 20, reach: 2.6, arc: 1.6, wind: 0.08, act: 0.12, rec: 0.3, knock: 8, energy: 9, anim: "roundKick" },
  finisher: { dmg: 999, reach: 2.8, arc: 2.4, wind: 0.2, act: 0.15, rec: 0.55, knock: 6, energy: 10, anim: "finisher" },
};

/** web abilities (key, cooldown s) */
export const ABILITIES = {
  shot: { key: "RMB", cd: 0.45, name: "Web Shot" },
  trap: { key: "1", cd: 6, name: "Web Trap" },
  pull: { key: "2", cd: 4, name: "Web Pull" },
  strike: { key: "3", cd: 5, name: "Web Strike" },
  shield: { key: "4", cd: 9, name: "Web Shield" },
  burst: { key: "5", cd: 12, name: "Web Burst" },
};
export const ABILITY_IDS = ["trap", "pull", "strike", "shield", "burst"];

export const ENERGY_MAX = 100;

/** upgrades: id → { name, max level, cost per level (xp), what it does } */
export const UPGRADES = {
  punch: { name: "Stronger Punches", max: 3, cost: [300, 700, 1300], desc: "+15% melee damage per level" },
  swing: { name: "Faster Swinging", max: 3, cost: [300, 700, 1300], desc: "+8% swing speed per level" },
  range: { name: "Longer Web Range", max: 3, cost: [250, 600, 1100], desc: "+8 m web reach per level" },
  dodge: { name: "Improved Dodge", max: 2, cost: [400, 1000], desc: "Longer perfect-dodge window" },
  health: { name: "More Health", max: 3, cost: [350, 800, 1400], desc: "+20 max health per level" },
  cooldown: { name: "Faster Cooldowns", max: 3, cost: [400, 900, 1500], desc: "-12% ability cooldowns per level" },
  air: { name: "Better Air Control", max: 2, cost: [300, 800], desc: "+30% air steering per level" },
};
export const UPGRADE_IDS = Object.keys(UPGRADES);

/** web abilities unlock as the campaign advances (available from mission N) */
export const ABILITY_UNLOCK = { trap: 2, pull: 3, strike: 4, shield: 7, burst: 10 };
