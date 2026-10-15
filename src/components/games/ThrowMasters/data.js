/**
 * Throw Masters — static game data: weapons, fighters, arenas, weapon skins,
 * AI difficulty presets and the 30-battle tournament. Pure data, no DOM, so
 * the headless tests in tools/ can import it.
 *
 * World units: the arena is W × H (1600 × 900, y grows downwards). Speeds are
 * world units / second, gravity is world units / second².
 */

export const W = 1600;
export const H = 900;
export const GRAVITY = 1000;
export const BASE_GROUND = 760;
/** Global fighter size (art and hitboxes scale together). */
export const FIGHTER_SCALE = 1.18;

/**
 * Weapon mechanics. `speed` is the launch speed at 100 % power, `grav` scales
 * gravity, `drag` is linear air drag per second, `spin` rad/s (0 = the weapon
 * points along its velocity), `r` the collision radius, `head` the headshot
 * multiplier, `kb` knockback impulse, `preview` how long (s) the aim preview
 * may run before the character's precision stat scales it.
 */
export const WEAPONS = {
  axe: {
    id: "axe", name: "Throwing Axe", speed: 1240, grav: 1, drag: 0.02, spin: 13, r: 17,
    dmg: 25, head: 1.5, kb: 160, preview: 0.26, sticks: true,
    blurb: "Medium speed, heavy chop. Spins end over end.",
  },
  arrow: {
    id: "arrow", name: "Hunter Arrow", speed: 1480, grav: 0.72, drag: 0.03, spin: 0, r: 7,
    dmg: 17, head: 1.7, kb: 70, preview: 0.4, sticks: true,
    blurb: "Fast, flat and accurate — light damage.",
  },
  knives: {
    id: "knives", name: "Twin Knives", speed: 1420, grav: 0.85, drag: 0.02, spin: 22, r: 8,
    dmg: 10, head: 1.6, kb: 45, preview: 0.3, sticks: true, count: 3, spread: 2.6,
    blurb: "Three light knives in a tight fan.",
  },
  hammer: {
    id: "hammer", name: "War Hammer", speed: 1330, grav: 1.32, drag: 0.01, spin: 8, r: 21,
    dmg: 34, head: 1.4, kb: 330, preview: 0.22, sticks: false,
    blurb: "Slow and heavy. Huge damage and knockback.",
  },
  fireball: {
    id: "fireball", name: "Fireball", speed: 1220, grav: 0.78, drag: 0.04, spin: 0, r: 18,
    dmg: 19, head: 1.4, kb: 120, preview: 0.26, burst: { r: 85, dmg: 9 },
    blurb: "Leaves a fire trail and bursts on impact.",
  },
  shuriken: {
    id: "shuriken", name: "Shuriken", speed: 1500, grav: 0.66, drag: 0.03, spin: 32, r: 12,
    dmg: 15, head: 1.6, kb: 60, preview: 0.3, sticks: true, ricochet: 1,
    blurb: "Very fast. Ricochets once off ground or walls.",
  },
  spear: {
    id: "spear", name: "Viking Spear", speed: 1320, grav: 0.92, drag: 0.015, spin: 0, r: 8,
    dmg: 24, head: 2, kb: 150, preview: 0.36, sticks: true, long: 58,
    blurb: "Long, precise flight. Brutal headshot bonus.",
  },
  crystal: {
    id: "crystal", name: "Magic Crystal", speed: 1160, grav: 0.6, drag: 0.05, spin: 5, r: 14,
    dmg: 16, head: 1.5, kb: 90, preview: 0.3, burst: { r: 90, dmg: 10 }, heal: 6,
    blurb: "Floaty glowing shot. Shatters in a burst, heals you on hit.",
  },
  bomb: {
    id: "bomb", name: "Cartoon Bomb", speed: 1150, grav: 1.1, drag: 0.02, spin: 4, r: 18,
    dmg: 0, head: 1, kb: 0, preview: 0.24, fuse: 2.3, bounce: 0.45,
    blast: { r: 150, dmg: 38, kb: 380 },
    blurb: "Bounces, then explodes after 2.3 s. Blast hurts everyone near it.",
  },
  boomerang: {
    id: "boomerang", name: "Boomerang", speed: 1480, grav: 0.5, drag: 0, spin: 20, r: 16,
    dmg: 18, head: 1.5, kb: 110, preview: 0.32, ret: 400, life: 6,
    blurb: "Hooks back in flight — lob it high and it returns to you.",
  },
};

/**
 * Fighters. `build` scales the body (and its hitbox), `power` scales launch
 * speed, `prec` scales the aim-preview length. `look` drives the procedural
 * artwork in render.js.
 */
export const CHARACTERS = [
  {
    id: "axel", name: "Axel", title: "The Woodsman", weapon: "axe", price: 0,
    hp: 105, power: 1, prec: 1, build: 1.04,
    look: { skin: "#f1c27d", hair: "#b5452a", hairStyle: "spiky", shirt: "#d6453d", shirt2: "#9b2a26", pants: "#3b4a6b", shoe: "#3a2a1e", accent: "#f2d16b", beard: "#b5452a", extra: "plaid" },
  },
  {
    id: "robin", name: "Robin", title: "Forest Archer", weapon: "arrow", price: 0,
    hp: 95, power: 1.02, prec: 1.35, build: 0.98,
    look: { skin: "#ffd7b0", hair: "#e3a83b", hairStyle: "short", shirt: "#3f9a4a", shirt2: "#2a6b35", pants: "#6b4b2e", shoe: "#4a3220", accent: "#c9a14a", hat: "hood", hatColor: "#2f7d3b" },
  },
  {
    id: "kira", name: "Kira", title: "Blade Dancer", weapon: "knives", price: 350,
    hp: 95, power: 1.02, prec: 1.15, build: 0.96,
    look: { skin: "#f5cfa8", hair: "#2b1f3a", hairStyle: "ponytail", shirt: "#7b4bd6", shirt2: "#4f2d9a", pants: "#2a2440", shoe: "#1c1828", accent: "#ff6fb1", extra: "scarf" },
  },
  {
    id: "bruno", name: "Bruno", title: "Iron Smasher", weapon: "hammer", price: 450,
    hp: 125, power: 1, prec: 0.85, build: 1.14,
    look: { skin: "#c98d5e", hair: "#3a2a20", hairStyle: "bald", shirt: "#c46a2c", shirt2: "#8a4318", pants: "#4a4a52", shoe: "#2a2a30", accent: "#9aa3ad", beard: "#3a2a20", extra: "straps" },
  },
  {
    id: "blaze", name: "Blaze", title: "Flame Caster", weapon: "fireball", price: 550,
    hp: 100, power: 1, prec: 1, build: 1,
    look: { skin: "#f0b98c", hair: "#ff7a1a", hairStyle: "flame", shirt: "#e8432f", shirt2: "#a4231a", pants: "#2c2c34", shoe: "#1d1d22", accent: "#ffcc33", extra: "belt" },
  },
  {
    id: "kai", name: "Ninja Kai", title: "Silent Star", weapon: "shuriken", price: 650,
    hp: 95, power: 1.04, prec: 1.1, build: 0.97,
    look: { skin: "#e8b98e", hair: "#1a1a22", hairStyle: "short", shirt: "#283046", shirt2: "#161b2a", pants: "#283046", shoe: "#12151f", accent: "#e23a3a", hat: "ninja", hatColor: "#1f2536" },
  },
  {
    id: "rex", name: "Viking Rex", title: "Northern Storm", weapon: "spear", price: 750,
    hp: 115, power: 1.02, prec: 1.2, build: 1.1,
    look: { skin: "#f3c9a0", hair: "#e9c46a", hairStyle: "long", shirt: "#4b6b8a", shirt2: "#33495f", pants: "#5a4632", shoe: "#3a2a1e", accent: "#c0c6cc", beard: "#e9c46a", hat: "viking", hatColor: "#a9b2bb" },
  },
  {
    id: "luna", name: "Luna", title: "Moon Mage", weapon: "crystal", price: 850,
    hp: 100, power: 0.98, prec: 1.25, build: 0.97,
    look: { skin: "#fbe0cc", hair: "#cfd8ff", hairStyle: "long", shirt: "#5b3fb8", shirt2: "#3b2783", pants: "#3b2783", shoe: "#2a1d5c", accent: "#7ef0ff", hat: "witch", hatColor: "#3b2783", extra: "cape" },
  },
  {
    id: "boom", name: "Captain Boom", title: "Powder Pirate", weapon: "bomb", price: 1000,
    hp: 110, power: 1, prec: 1, build: 1.08,
    look: { skin: "#e9b48a", hair: "#2b1d16", hairStyle: "short", shirt: "#b8262f", shirt2: "#7a1219", pants: "#f1e7d0", shoe: "#2b1d16", accent: "#f2c14e", beard: "#2b1d16", hat: "pirate", hatColor: "#1d1a22", extra: "coat" },
  },
  {
    id: "shadow", name: "Shadow", title: "The Returner", weapon: "boomerang", price: 1200,
    hp: 100, power: 1.03, prec: 1.15, build: 1,
    look: { skin: "#d9a982", hair: "#1b1b24", hairStyle: "short", shirt: "#2c2f3a", shirt2: "#1a1c24", pants: "#22242d", shoe: "#111217", accent: "#40e0b0", hat: "hoodmask", hatColor: "#23252f", extra: "cape" },
  },
];

export const CHAR_BY_ID = Object.fromEntries(CHARACTERS.map((c) => [c.id, c]));
export const STARTER_CHARS = ["axel", "robin"];

/** Weapon skins: cosmetic palettes applied to any fighter's weapon and trail. */
export const SKINS = [
  { id: "classic", name: "Classic", price: 0, metal: null, glow: null },
  { id: "frost", name: "Frost", price: 200, metal: "#bfeaff", accent: "#5fb8ff", glow: "#9fe3ff" },
  { id: "golden", name: "Golden", price: 350, metal: "#ffd75e", accent: "#c8901e", glow: "#ffe48a" },
  { id: "neon", name: "Neon", price: 500, metal: "#ff4fd8", accent: "#5cfff1", glow: "#ff7ae6" },
  { id: "lava", name: "Lava", price: 650, metal: "#ff6a2b", accent: "#3a1a10", glow: "#ffb347" },
];
export const SKIN_BY_ID = Object.fromEntries(SKINS.map((s) => [s.id, s]));

/**
 * AI presets. `skill` (0..1) drives aim noise, starting bias and how fast
 * the AI corrects after a miss (see ai.js).
 */
export const DIFFICULTY = {
  easy: { id: "easy", label: "Easy", skill: 0.12, reward: 40 },
  medium: { id: "medium", label: "Medium", skill: 0.5, reward: 70 },
  hard: { id: "hard", label: "Hard", skill: 0.86, reward: 110 },
};

export const ARENAS = [
  { id: "meadow", name: "Sunny Meadow" },
  { id: "canyon", name: "Desert Canyon" },
  { id: "snow", name: "Snowy Mountain" },
  { id: "island", name: "Pirate Island" },
  { id: "city", name: "Night City" },
];
export const ARENA_BY_ID = Object.fromEntries(ARENAS.map((a) => [a.id, a]));

/* ------------------------------------------------------------------ layouts */

/**
 * A battlefield layout: fighter distance, plateau heights under each fighter,
 * an optional mid feature and obstacles (rects / circles, world units).
 */
export function makeLayout({ dist = 950, hL = 0, hR = 0, mid = 0, obstacles = [], wind = 0 } = {}) {
  const xL = Math.round(W / 2 - dist / 2);
  const xR = Math.round(W / 2 + dist / 2);
  const g = BASE_GROUND;
  const pts = [[-800, g - hL], [xL + 90, g - hL], [xL + 170, g], [W / 2 - 170, g]];
  if (mid) pts.push([W / 2 - 80, g - mid], [W / 2 + 80, g - mid]);
  pts.push([W / 2 + 170, g], [xR - 170, g], [xR - 90, g - hR], [W + 800, g - hR]);
  // keep x strictly increasing even for very close fighters
  for (let i = 1; i < pts.length; i++) if (pts[i][0] <= pts[i - 1][0]) pts[i][0] = pts[i - 1][0] + 1;
  return { xL, xR, ground: pts, obstacles, wind };
}

/** Obstacle presets keyed by name, placed relative to the arena centre. */
function obs(kind, ...args) {
  const c = W / 2;
  const g = BASE_GROUND;
  switch (kind) {
    case "wall": { const [h, w = 56, dx = 0] = args; return { type: "rect", x: c + dx - w / 2, y: g - h, w, h, style: "wall" }; }
    case "tower": { const [h, dx = 0] = args; return { type: "rect", x: c + dx - 40, y: g - h, w: 80, h, style: "tower" }; }
    case "float": { const [y, w = 200, dx = 0] = args; return { type: "rect", x: c + dx - w / 2, y: g - y, w, h: 30, style: "float" }; }
    case "rock": { const [r, dx = 0, lift = 0] = args; return { type: "circle", x: c + dx, y: g - r * 0.7 - lift, r, style: "rock" }; }
    case "crate": { const [dx, s = 70, lift = 0] = args; return { type: "rect", x: c + dx - s / 2, y: g - s - lift, w: s, h: s, style: "crate" }; }
    case "orb": { const [y, r = 34, dx = 0] = args; return { type: "circle", x: c + dx, y: g - y, r, style: "orb" }; }
    default: return null;
  }
}

/**
 * The 30 tournament battles: 6 per arena, opponents cycle through the roster,
 * AI skill, distance, terrain, obstacles and wind ramp up. Every sixth battle
 * is an arena champion with extra health.
 */
const T_LAYOUTS = [
  // Sunny Meadow
  { dist: 820 },
  { dist: 900, mid: 40 },
  { dist: 960, obstacles: [["crate", 0, 80]] },
  { dist: 1000, hR: 40, obstacles: [["rock", 52, -20]] },
  { dist: 1040, mid: 70, obstacles: [["crate", -40, 70], ["crate", 40, 70]] },
  { dist: 1080, hR: 80, obstacles: [["wall", 170]] },
  // Desert Canyon
  { dist: 900, hL: 40, obstacles: [["tower", 160]] },
  { dist: 980, obstacles: [["rock", 60, -60], ["rock", 46, 70]], wind: 40 },
  { dist: 1020, hR: 110, obstacles: [["wall", 200, 60]] },
  { dist: 1060, mid: 90, obstacles: [["float", 330, 220]], wind: -60 },
  { dist: 1100, hL: 70, hR: 70, obstacles: [["tower", 240]], wind: 50 },
  { dist: 1140, hR: 120, obstacles: [["tower", 200, -40], ["float", 380, 180, 60]], wind: -80 },
  // Snowy Mountain
  { dist: 940, mid: 120, wind: 60 },
  { dist: 1000, hL: 90, obstacles: [["wall", 230, 60, 80]], wind: -70 },
  { dist: 1060, obstacles: [["orb", 300, 40], ["wall", 150, 60, -60]], wind: 80 },
  { dist: 1100, hR: 140, mid: 60, obstacles: [["crate", 60, 90, 60]], wind: -90 },
  { dist: 1140, hL: 60, obstacles: [["tower", 280]], wind: 100 },
  { dist: 1180, hR: 100, obstacles: [["float", 300, 240, -20], ["wall", 200]], wind: -110 },
  // Pirate Island
  { dist: 980, obstacles: [["crate", -60, 80], ["crate", -60, 70, 80]], wind: 70 },
  { dist: 1040, hR: 80, obstacles: [["tower", 260, 30]], wind: -100 },
  { dist: 1080, hL: 120, obstacles: [["orb", 340, 46, -30], ["rock", 50, 90]], wind: 110 },
  { dist: 1120, mid: 140, obstacles: [["float", 420, 200]], wind: -120 },
  { dist: 1160, hR: 150, obstacles: [["wall", 300, 70, -50]], wind: 130 },
  { dist: 1200, hL: 80, hR: 80, obstacles: [["tower", 300], ["float", 450, 160]], wind: -140 },
  // Night City
  { dist: 1040, hL: 60, hR: 120, obstacles: [["tower", 280, -60]], wind: 110 },
  { dist: 1100, obstacles: [["wall", 320, 70], ["orb", 450, 40, 140]], wind: -130 },
  { dist: 1140, hR: 160, mid: 80, obstacles: [["crate", 120, 80, 80]], wind: 140 },
  { dist: 1180, hL: 140, obstacles: [["tower", 340, 40], ["float", 470, 180, -40]], wind: -150 },
  { dist: 1220, hR: 120, obstacles: [["wall", 360, 60, -80], ["orb", 300, 40, 120]], wind: 160 },
  { dist: 1240, hL: 100, hR: 160, obstacles: [["tower", 380], ["float", 520, 200]], wind: -170 },
];

const OPPONENT_ORDER = ["axel", "robin", "kira", "bruno", "blaze", "kai", "rex", "luna", "boom", "shadow"];

export const TOURNAMENT = T_LAYOUTS.map((l, i) => {
  const arena = ARENAS[Math.floor(i / 6)].id;
  const boss = i % 6 === 5;
  const skill = Math.min(0.95, 0.06 + i * 0.03 + (boss ? 0.04 : 0));
  return {
    index: i,
    arena,
    boss,
    opponent: OPPONENT_ORDER[(i * 3 + Math.floor(i / 6)) % OPPONENT_ORDER.length],
    skill: Math.round(skill * 100) / 100,
    hpMul: boss ? 1.3 : 1 + Math.floor(i / 6) * 0.05,
    reward: 50 + i * 8 + (boss ? 60 : 0),
    layout: { ...l, obstacles: (l.obstacles || []).map((o) => obs(...o)).filter(Boolean) },
  };
});

/** Classic-duel layouts: picked at random, mild obstacles only. */
export const DUEL_LAYOUTS = [
  { dist: 900 },
  { dist: 980, mid: 50 },
  { dist: 1040, hR: 60, obstacles: [obs("crate", 0, 80)] },
  { dist: 1000, hL: 60, obstacles: [obs("rock", 50)] },
  { dist: 1080, obstacles: [obs("wall", 160)] },
];

export const TUTORIAL_LAYOUT = { dist: 860 };

export const TARGET_THROWS = 10;
