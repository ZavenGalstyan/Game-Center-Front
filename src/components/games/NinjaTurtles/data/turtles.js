/**
 * The four playable turtles, their moves, and the enemy roster.
 *
 * Every turtle shares the same move set (3-hit light combo, heavy attack,
 * jump, shell-roll dodge, one special) but differs in reach, power, speed and
 * how the weapon is swung (`anims` picks the pose for each combo hit).
 *
 * r = body radius for collisions, h = model height (camera / hit height).
 * `atk` scales attack durations (Michelangelo < 1 = faster combos).
 */
export const TURTLES = {
  leo: {
    id: "leo",
    name: "Leonardo",
    title: "The Leader",
    weapon: "Twin katanas",
    blurb: "Balanced and disciplined — good reach, good speed, good power.",
    mask: "#1f6fe0",
    skin: "#5fa83e",
    hp: 120,
    speed: 6.1,
    jump: 7.8,
    r: 0.5,
    h: 1.7,
    atk: 0.95,
    light: { dmg: 13, range: 2.15, arc: 2.0 },
    heavy: { dmg: 25, range: 2.4, arc: 2.6 },
    anims: { light: ["slashR", "slashL", "cross"], heavy: "cleave" },
    special: { id: "cyclone", name: "Blade Cyclone", desc: "Spin with both katanas, cutting everything around you three times.", cd: 6, dmg: 13, radius: 3.4, ticks: 3 },
  },
  raph: {
    id: "raph",
    name: "Raphael",
    title: "The Muscle",
    weapon: "Twin sai",
    blurb: "Short reach, heavy hits. Gets right in the enemy's face.",
    mask: "#d8262a",
    skin: "#4e8f36",
    hp: 140,
    speed: 5.8,
    jump: 7.4,
    r: 0.54,
    h: 1.7,
    atk: 1.0,
    light: { dmg: 16, range: 1.85, arc: 1.8 },
    heavy: { dmg: 30, range: 2.0, arc: 2.0 },
    anims: { light: ["stabR", "stabL", "upper"], heavy: "doubleStab" },
    special: { id: "quake", name: "Shell Quake", desc: "Leap up and slam the ground — knocks back everyone nearby.", cd: 6, dmg: 34, radius: 3.8 },
  },
  don: {
    id: "don",
    name: "Donatello",
    title: "The Brains",
    weapon: "Bo staff",
    blurb: "The longest reach of the four. Keeps foes at a distance.",
    mask: "#7b3fc4",
    skin: "#6aa64a",
    hp: 110,
    speed: 5.9,
    jump: 8.0,
    r: 0.5,
    h: 1.78,
    atk: 1.08,
    light: { dmg: 12, range: 2.9, arc: 1.9 },
    heavy: { dmg: 23, range: 3.2, arc: 6.3 },
    anims: { light: ["thrust", "sweepR", "smash"], heavy: "spinSweep" },
    special: { id: "shockwave", name: "Bo Shockwave", desc: "Slam the staff down and send a shockwave far ahead of you.", cd: 6, dmg: 30, range: 7, arc: 1.3 },
  },
  mikey: {
    id: "mikey",
    name: "Michelangelo",
    title: "The Party Dude",
    weapon: "Nunchaku",
    blurb: "Fastest combos and fastest feet. Lighter hits, many of them.",
    mask: "#f07d14",
    skin: "#78bc48",
    hp: 105,
    speed: 6.7,
    jump: 8.4,
    r: 0.48,
    h: 1.62,
    atk: 0.78,
    light: { dmg: 11, range: 2.0, arc: 2.1 },
    heavy: { dmg: 21, range: 2.2, arc: 2.4 },
    anims: { light: ["chuckR", "chuckL", "chuckBoth"], heavy: "chuckSpin" },
    special: { id: "tornado", name: "Nunchaku Tornado", desc: "Spin-dash forward in a whirl of nunchaku, hitting everyone in your path.", cd: 5, dmg: 30, dist: 7 },
  },
};

export const TURTLE_ORDER = ["leo", "raph", "don", "mikey"];

/** Attack timing (seconds, before the turtle's `atk` scale). */
export const MOVES = {
  light: { dur: 0.36, hitT: 0.14 },
  finisher: { dur: 0.5, hitT: 0.2 },
  heavy: { dur: 0.62, hitT: 0.3, cd: 0.9 },
};
export const SPECIAL_DUR = { cyclone: 0.9, quake: 0.95, shockwave: 0.75, tornado: 0.62 };
export const DODGE = { dur: 0.42, speed: 10.5, iframes: 0.36, cd: 0.55 };
export const COMBO_WINDOW = 0.75;

/**
 * Enemies. `armor`: light non-finisher hits don't interrupt their attacks.
 * windup = telegraph time (red ring) before the strike lands.
 */
export const ENEMIES = {
  foot: { name: "Foot Soldier", hp: 50, speed: 4.0, r: 0.48, h: 1.8, dmg: 9, range: 1.8, windup: 0.5, cd: [1.1, 1.8], aggro: 9.5, armor: false },
  elite: { name: "Foot Elite", hp: 115, speed: 3.6, r: 0.58, h: 2.05, dmg: 15, range: 2.4, windup: 0.7, cd: [1.4, 2.2], aggro: 10.5, armor: true },
  shredder: { name: "Shredder", hp: 720, speed: 5.0, r: 0.72, h: 2.3, dmg: 13, range: 2.4, windup: 0.55, cd: [0.9, 1.5], aggro: 99, armor: true },
};

/** Difficulty: damage the player takes and enemy health. Hard unlocks after Shredder. */
export const DIFFICULTY = {
  easy: { name: "Easy", dmgTaken: 0.6, enemyHp: 0.8 },
  normal: { name: "Normal", dmgTaken: 1, enemyHp: 1 },
  hard: { name: "Hard", dmgTaken: 1.4, enemyHp: 1.25 },
};
