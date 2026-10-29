/**
 * The six playable heroes. Stats are deliberately close together — each hero
 * differs mostly by feel (speed, reach, jump) and by their one special move.
 *
 * r = body radius for collisions, h = model height (camera target / hit
 * height), cam = camera distance multiplier (tiny Mantis gets a closer cam).
 */
export const HEROES = {
  po: {
    id: "po",
    name: "Po",
    title: "The Dragon Warrior",
    blurb: "Big belly, big heart. Tough and hits hard.",
    hp: 140,
    speed: 5.4,
    jump: 7.4,
    r: 0.62,
    h: 1.85,
    cam: 1,
    punch: { dmg: 14, range: 1.8, arc: 1.9 },
    kick: { dmg: 20, range: 2.0, arc: 1.6 },
    special: { id: "belly", name: "Belly Bounce", desc: "Leap and slam down — knocks back everyone nearby.", cd: 6, dmg: 32, radius: 3.8 },
    color: "#f2f2ee",
    accent: "#2a2a2a",
  },
  tigress: {
    id: "tigress",
    name: "Tigress",
    title: "Master of Tiger Style",
    blurb: "Fast, fierce and precise.",
    hp: 110,
    speed: 6.5,
    jump: 8,
    r: 0.5,
    h: 1.8,
    cam: 1,
    punch: { dmg: 16, range: 1.8, arc: 1.6 },
    kick: { dmg: 22, range: 2.1, arc: 1.5 },
    special: { id: "dash", name: "Tiger Claw Dash", desc: "Dash forward, raking every foe in your path.", cd: 5, dmg: 34, dist: 7 },
    color: "#e8862a",
    accent: "#b3261e",
  },
  monkey: {
    id: "monkey",
    name: "Monkey",
    title: "Master of Monkey Style",
    blurb: "Agile prankster with a spinning whirl.",
    hp: 100,
    speed: 6.7,
    jump: 8.6,
    r: 0.48,
    h: 1.45,
    cam: 0.92,
    punch: { dmg: 13, range: 1.8, arc: 1.8 },
    kick: { dmg: 19, range: 2.0, arc: 1.6 },
    special: { id: "whirl", name: "Monkey Whirlwind", desc: "Spin in place, striking all around three times.", cd: 6, dmg: 13, radius: 3.2, ticks: 3 },
    color: "#8a5a32",
    accent: "#e8c890",
  },
  crane: {
    id: "crane",
    name: "Crane",
    title: "Master of Crane Style",
    blurb: "Long reach, high jumps and a gentle glide.",
    hp: 95,
    speed: 6.1,
    jump: 9.4,
    glide: true,
    r: 0.48,
    h: 1.95,
    cam: 1.02,
    punch: { dmg: 13, range: 2.1, arc: 1.8 },
    kick: { dmg: 19, range: 2.3, arc: 1.5 },
    special: { id: "gust", name: "Wing Gust", desc: "A blast of wind that hurls enemies away in front of you.", cd: 6, dmg: 28, range: 6.5, arc: 1.4 },
    color: "#f4f4f0",
    accent: "#2b6cb0",
  },
  mantis: {
    id: "mantis",
    name: "Mantis",
    title: "Master of Mantis Style",
    blurb: "Tiny, lightning-fast, stuns with pressure points.",
    hp: 85,
    speed: 7.1,
    jump: 8.2,
    r: 0.42,
    h: 0.9,
    cam: 0.78,
    punch: { dmg: 15, range: 1.6, arc: 1.9 },
    kick: { dmg: 18, range: 1.8, arc: 1.7 },
    special: { id: "pressure", name: "Pressure Point Flurry", desc: "A blur of strikes that stuns everything in front of you.", cd: 5, dmg: 30, range: 3, arc: 2.2, stun: 2.5 },
    color: "#6cc04a",
    accent: "#2f6b22",
  },
  viper: {
    id: "viper",
    name: "Viper",
    title: "Master of Viper Style",
    blurb: "Graceful whip strikes that stun a whole circle.",
    hp: 100,
    speed: 6.3,
    jump: 7.6,
    r: 0.5,
    h: 1.15,
    cam: 0.88,
    punch: { dmg: 14, range: 1.9, arc: 1.7 },
    kick: { dmg: 20, range: 2.2, arc: 2.2 },
    special: { id: "ribbon", name: "Ribbon Spin", desc: "Coil and lash out in a full circle, stunning foes.", cd: 6, dmg: 26, radius: 3.6, stun: 1.4 },
    color: "#5fae3c",
    accent: "#e05a8a",
  },
};

export const HERO_ORDER = ["po", "tigress", "monkey", "crane", "mantis", "viper"];

/** Heroes available from the start; the rest are mission rewards. */
export const STARTING_HEROES = ["po", "tigress", "monkey"];

/** Attack timing (seconds): total duration and the moment the hit lands. */
export const MOVES = {
  punch: { dur: 0.36, hitT: 0.13 },
  kick: { dur: 0.52, hitT: 0.22 },
  special: { dur: 0.8, hitT: 0.36 },
};

export const ENEMIES = {
  wolf: { name: "Wolf Bandit", hp: 52, speed: 4.1, r: 0.5, h: 1.85, dmg: 10, range: 1.75, windup: 0.5, cd: [1.1, 1.8], aggro: 9 },
  tailung: { name: "Tai Lung", hp: 560, speed: 5.4, r: 0.75, h: 2.35, dmg: 14, range: 2.3, windup: 0.55, cd: [0.9, 1.5], aggro: 99 },
};
