/**
 * Shadow Arena — static game data: world constants, the six fighters, their
 * moves and the four arenas. All frame data is in 60 Hz sim frames; world
 * units are canvas pixels of the 960×540 view (x right, y = height above
 * the ground line).
 *
 * Move schema:
 *   kind      melee | projectile | dash | spin
 *   startup   frames before the hitbox appears
 *   active    frames the hitbox is live (a move hits at most once)
 *   recovery  frames after the active window before the fighter can act
 *   dmg       damage on a clean hit
 *   chip      fraction of dmg that still lands through a block (0 = none)
 *   stun      hit-stun frames on the defender (they get stun + INV_AFTER
 *             frames of invulnerability, so nothing can juggle-loop)
 *   bstun     block-stun frames
 *   knock     knock-back speed (px/frame) pushed away from the attacker
 *   box       hitbox relative to the attacker's feet: x0..x1 forward from the
 *             body centre (mirrored when facing left), y0..y1 above the feet
 *   cd        extra cooldown after the move ends (specials)
 */

export const FPS = 60;
export const DT = 1 / FPS;
export const VIEW_W = 960;
export const VIEW_H = 540;
export const GROUND = 470; // canvas y of the floor line
export const BOUND_L = 40; // arena walls (fighter bodies stay inside)
export const BOUND_R = 920;

export const GRAVITY = 0.62;
export const BACK_SPEED = 0.78; // walking away from the opponent is slower
export const FRICTION = 0.82; // knock-back decay per grounded frame
export const BUFFER = 8; // an attack/jump press waits this long for the fighter to be free
export const INV_AFTER = 6; // invulnerable frames after hit-stun ends
export const LAND_LAG = 4; // frames of recovery when an air attack lands
export const HITSTOP = 5; // freeze frames on a clean hit (3 on block)

export const ROUND_TIMES = [45, 60, 99];
export const ROUNDS_TO_WIN = 2;
export const MAX_ROUNDS = 5; // draws don't score, so a match ends after five rounds at most
export const INTRO_F = 110;
export const OUTRO_F = 170;

const PUNCH = { kind: "melee", startup: 5, active: 3, recovery: 10, dmg: 6, chip: 0, stun: 14, bstun: 9, knock: 3.2, box: { x0: 14, x1: 74, y0: 82, y1: 112 }, cd: 0 };
const KICK = { kind: "melee", startup: 8, active: 4, recovery: 14, dmg: 9, chip: 0, stun: 18, bstun: 11, knock: 5, box: { x0: 10, x1: 92, y0: 44, y1: 82 }, cd: 0 };

const mv = (base, over = {}) => ({ ...base, ...over, box: { ...base.box, ...(over.box || {}) } });

export const FIGHTERS = [
  {
    id: "flame",
    name: "Flame Warrior",
    short: "Flame",
    blurb: "A hot-headed brawler who hurls blazing fireballs across the arena.",
    special: "Fireball",
    specialHint: "Ranged projectile",
    hp: 100,
    speed: 3.3,
    jump: 13.6,
    w: 54,
    h: 128,
    scale: 1,
    stats: { power: 3, speed: 3, range: 5 },
    moves: {
      punch: mv(PUNCH),
      kick: mv(KICK),
      special: { kind: "projectile", fx: "fire", startup: 13, active: 1, recovery: 18, dmg: 11, chip: 0.25, stun: 22, bstun: 14, knock: 5, cd: 140, proj: { speed: 7, w: 34, h: 26, y: 88, life: 150, fx: "fire" } },
    },
    pal: { skin: "#e8b48a", hair: "#ff6a1f", hair2: "#ffd23f", top: "#c62828", top2: "#8e1b1b", pants: "#2b2b33", belt: "#ffc93c", glove: "#ff8f3a", boot: "#3b2a22", eye: "#2a1a10", accent: "#ff9f1c" },
    alt: { skin: "#d9a07a", hair: "#ffe14d", hair2: "#fff5b0", top: "#e0681c", top2: "#a3460e", pants: "#3a2416", belt: "#ff3b3b", glove: "#ffd166", boot: "#2a1a14", eye: "#2a1a10", accent: "#ffe14d" },
  },
  {
    id: "frost",
    name: "Frost Ninja",
    short: "Frost",
    blurb: "A silent ninja whose ice shards freeze rivals in their tracks.",
    special: "Ice Shard",
    specialHint: "Fast freezing projectile",
    hp: 100,
    speed: 3.5,
    jump: 13.8,
    w: 52,
    h: 126,
    scale: 0.98,
    stats: { power: 2, speed: 4, range: 5 },
    moves: {
      punch: mv(PUNCH, { startup: 4, dmg: 5 }),
      kick: mv(KICK, { dmg: 8 }),
      special: { kind: "projectile", fx: "ice", startup: 11, active: 1, recovery: 16, dmg: 8, chip: 0.25, stun: 40, bstun: 12, knock: 2, cd: 165, freeze: true, proj: { speed: 9.5, w: 36, h: 16, y: 92, life: 120, fx: "ice" } },
    },
    pal: { skin: "#f0c9a6", hair: "#1d2b53", hair2: "#9fd8ff", top: "#1f4e8c", top2: "#163764", pants: "#1a2440", belt: "#9fd8ff", glove: "#bfe8ff", boot: "#101828", eye: "#dff6ff", accent: "#7fd3ff" },
    alt: { skin: "#f0c9a6", hair: "#e9f4ff", hair2: "#5fb8ff", top: "#d8e6f5", top2: "#9eb4cc", pants: "#5c708a", belt: "#2f7ad8", glove: "#5fb8ff", boot: "#2c3a4d", eye: "#0f2a44", accent: "#2f9bff" },
  },
  {
    id: "thunder",
    name: "Thunder Monk",
    short: "Thunder",
    blurb: "A calm mountain monk who calls down lightning on anyone close.",
    special: "Thunder Strike",
    specialHint: "Long-reach lightning burst",
    hp: 100,
    speed: 3.1,
    jump: 13.2,
    w: 56,
    h: 128,
    scale: 1,
    stats: { power: 4, speed: 2, range: 4 },
    moves: {
      punch: mv(PUNCH, { dmg: 6 }),
      kick: mv(KICK, { dmg: 10, startup: 9 }),
      special: { kind: "melee", startup: 16, active: 6, recovery: 20, dmg: 14, chip: 0.25, stun: 26, bstun: 16, knock: 7, cd: 170, fx: "bolt", box: { x0: 40, x1: 200, y0: 0, y1: 150 } },
    },
    pal: { skin: "#c98d5c", hair: "#c98d5c", hair2: "#ffe066", top: "#f2a516", top2: "#c4720a", pants: "#f4ecd8", belt: "#7a2e0e", glove: "#7a2e0e", boot: "#5a3a1e", eye: "#1e140a", accent: "#ffe066" },
    alt: { skin: "#b07a4f", hair: "#b07a4f", hair2: "#c6f0ff", top: "#7b3fa0", top2: "#542a70", pants: "#ece4f4", belt: "#ffd23f", glove: "#ffd23f", boot: "#3a2a4a", eye: "#1e140a", accent: "#c6f0ff" },
  },
  {
    id: "shadow",
    name: "Shadow Assassin",
    short: "Shadow",
    blurb: "A hooded blur who closes any gap with a lightning-fast dash strike.",
    special: "Shadow Dash",
    specialHint: "Fast gap-closing dash",
    hp: 95,
    speed: 3.8,
    jump: 14.2,
    w: 50,
    h: 124,
    scale: 0.96,
    stats: { power: 3, speed: 5, range: 3 },
    moves: {
      punch: mv(PUNCH, { startup: 4, recovery: 9, dmg: 5 }),
      kick: mv(KICK, { startup: 7, dmg: 8 }),
      special: { kind: "dash", startup: 6, active: 14, recovery: 16, dmg: 11, chip: 0.25, stun: 20, bstun: 14, knock: 7, cd: 150, dashV: 15, fx: "shadow", box: { x0: 0, x1: 58, y0: 30, y1: 110 } },
    },
    pal: { skin: "#d8a982", hair: "#2a1838", hair2: "#ff3fb4", top: "#3a2352", top2: "#24143a", pants: "#1c1028", belt: "#ff3fb4", glove: "#2a1838", boot: "#120a1a", eye: "#ff4fd0", accent: "#ff3fb4" },
    alt: { skin: "#d8a982", hair: "#1c2a1c", hair2: "#59ff7a", top: "#24402a", top2: "#14281a", pants: "#101c12", belt: "#59ff7a", glove: "#1c2a1c", boot: "#0a120a", eye: "#7dff9a", accent: "#59ff7a" },
  },
  {
    id: "stone",
    name: "Stone Guardian",
    short: "Stone",
    blurb: "A walking mountain. Slow to swing, but every blow lands like a rockslide.",
    special: "Boulder Fist",
    specialHint: "Slow, crushing heavy punch",
    hp: 115,
    speed: 2.7,
    jump: 12.6,
    w: 64,
    h: 138,
    scale: 1.12,
    stats: { power: 5, speed: 1, range: 3 },
    moves: {
      punch: mv(PUNCH, { startup: 6, recovery: 12, dmg: 8, knock: 4, box: { x0: 16, x1: 82, y0: 88, y1: 120 } }),
      kick: mv(KICK, { startup: 10, recovery: 16, dmg: 11, knock: 6, box: { x0: 12, x1: 98, y0: 46, y1: 88 } }),
      special: { kind: "melee", startup: 20, active: 5, recovery: 24, dmg: 20, chip: 0.4, stun: 30, bstun: 20, knock: 13, cd: 200, fx: "rock", box: { x0: 20, x1: 108, y0: 60, y1: 124 } },
    },
    pal: { skin: "#8d8478", hair: "#6b6359", hair2: "#4f8a3a", top: "#7a7266", top2: "#5c554b", pants: "#4a443c", belt: "#4f8a3a", glove: "#a39a8c", boot: "#3a352f", eye: "#ffb347", accent: "#7ccf5a" },
    alt: { skin: "#9a7a5e", hair: "#6e4f38", hair2: "#d9822b", top: "#8a6448", top2: "#664833", pants: "#4a3526", belt: "#d9822b", glove: "#b8946f", boot: "#33251a", eye: "#ff5f3a", accent: "#ff9b4a" },
  },
  {
    id: "wind",
    name: "Wind Fighter",
    short: "Wind",
    blurb: "A nimble martial artist whose cyclone kick sweeps both sides at once.",
    special: "Cyclone Kick",
    specialHint: "Fast spinning kick, hits both sides",
    hp: 100,
    speed: 3.6,
    jump: 14.4,
    w: 52,
    h: 126,
    scale: 0.98,
    stats: { power: 3, speed: 4, range: 3 },
    moves: {
      punch: mv(PUNCH),
      kick: mv(KICK, { startup: 7, dmg: 9, box: { x0: 10, x1: 96 } }),
      special: { kind: "spin", startup: 7, active: 18, recovery: 14, dmg: 12, chip: 0.25, stun: 22, bstun: 14, knock: 8, cd: 160, dashV: 4.5, fx: "wind", box: { x0: -78, x1: 78, y0: 36, y1: 104 } },
    },
    pal: { skin: "#eec19a", hair: "#1b1b1b", hair2: "#ffffff", top: "#2e9e6a", top2: "#1f7350", pants: "#e8f0e4", belt: "#2e9e6a", glove: "#ffffff", boot: "#2b3a30", eye: "#1b1b1b", accent: "#a6f3c9" },
    alt: { skin: "#eec19a", hair: "#7a3b12", hair2: "#ffd6e8", top: "#d94f8a", top2: "#a33366", pants: "#fff0f6", belt: "#d94f8a", glove: "#ffd6e8", boot: "#4a2236", eye: "#2a1a10", accent: "#ffb3d1" },
  },
];

export const FIGHTER_BY_ID = Object.fromEntries(FIGHTERS.map((f) => [f.id, f]));

export const ARENAS = [
  { id: "temple", name: "Sunset Temple", blurb: "Stone steps beneath a burning sky", accent: "#ff9f43" },
  { id: "rooftop", name: "Neon Rooftop", blurb: "High above a sleepless city", accent: "#ff4fd0" },
  { id: "desert", name: "Desert Ruins", blurb: "Sand, sun and forgotten pillars", accent: "#ffd166" },
  { id: "cave", name: "Frozen Cave", blurb: "Glittering ice deep under the mountain", accent: "#7fd3ff" },
];

export const ARENA_BY_ID = Object.fromEntries(ARENAS.map((a) => [a.id, a]));

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
