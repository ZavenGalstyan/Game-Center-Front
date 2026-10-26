/**
 * Metro Rush — missions, daily challenges and upgrades.
 *
 * Missions come in sets of three (12 sets, 36 missions). Finishing a whole
 * set raises the permanent score multiplier by 1 and pays a bonus.
 *   scope 'run'   — reach the target within a single run
 *   scope 'total' — accumulate across runs (counted from when the set starts)
 *   stat names are the keys of run.stats (engine/run.js), plus 'runs'
 */
const M = (id, text, stat, target, scope, reward) => ({ id, text, stat, target, scope, reward });

export const MISSION_SETS = [
  [M("m1", "Collect 100 coins in one run", "coins", 100, "run", 120), M("m2", "Jump 15 times", "jumps", 15, "total", 100), M("m3", "Run 500 m in one run", "dist", 500, "run", 120)],
  [M("m4", "Slide under 10 barriers", "overheadsSlid", 10, "total", 140), M("m5", "Dodge 3 moving trains", "trainsDodged", 3, "total", 160), M("m6", "Use 2 power-ups", "powerups", 2, "total", 140)],
  [M("m7", "Reach a score of 5,000", "score", 5000, "run", 180), M("m8", "Ride 150 m on train roofs", "roofDist", 150, "total", 160), M("m9", "Collect 600 coins in total", "coins", 600, "total", 180)],
  [M("m10", "Jump over 25 barriers", "barriersJumped", 25, "total", 200), M("m11", "Run 1,500 m in one run", "dist", 1500, "run", 220), M("m12", "Pick up 3 Coin Magnets", "magnets", 3, "total", 200)],
  [M("m13", "Change lanes 120 times", "lanes", 120, "total", 220), M("m14", "Pass 20 parked trains", "trainsPassed", 20, "total", 240), M("m15", "Collect 300 coins in one run", "coins", 300, "run", 260)],
  [M("m16", "Ride 3 hoverboards", "boards", 3, "total", 260), M("m17", "Reach a score of 15,000", "score", 15000, "run", 300), M("m18", "Climb 10 ramps onto trains", "ramps", 10, "total", 260)],
  [M("m19", "Dodge 12 moving trains", "trainsDodged", 12, "total", 320), M("m20", "Smash 15 obstacles with power-ups", "smashed", 15, "total", 320), M("m21", "Play 10 runs", "runs", 10, "total", 280)],
  [M("m22", "Run 3,000 m in one run", "dist", 3000, "run", 380), M("m23", "Slide 60 times", "slides", 60, "total", 320), M("m24", "Use 3 Rocket Dashes", "boosts", 3, "total", 360)],
  [M("m25", "Collect 3,000 coins in total", "coins", 3000, "total", 420), M("m26", "Ride 800 m on train roofs", "roofDist", 800, "total", 400), M("m27", "Get 25 close calls", "closeCalls", 25, "total", 400)],
  [M("m28", "Reach a score of 40,000", "score", 40000, "run", 500), M("m29", "Pick up 6 Score ×2 boosts", "mults", 6, "total", 440), M("m30", "Jump 40 times in one run", "jumps", 40, "run", 460)],
  [M("m31", "Run 5,000 m in one run", "dist", 5000, "run", 600), M("m32", "Collect 700 coins in one run", "coins", 700, "run", 600), M("m33", "Use 5 Bubble Shields", "shields", 5, "total", 520)],
  [M("m34", "Reach a score of 100,000", "score", 100000, "run", 900), M("m35", "Dodge 40 moving trains", "trainsDodged", 40, "total", 800), M("m36", "Run 30,000 m in total", "dist", 30000, "total", 900)],
];
export const ALL_MISSIONS = MISSION_SETS.flat();
export const SET_BONUS = (i) => 250 + i * 100;
export const MAX_MULT = 1 + MISSION_SETS.length;

/** daily challenge templates — three are picked from the date */
export const DAILY_POOL = [
  { id: "d_coins", text: "Collect {n} coins today", stat: "coins", base: 350, step: 50, reward: 250 },
  { id: "d_dist", text: "Run {n} m today", stat: "dist", base: 2500, step: 500, reward: 250 },
  { id: "d_jump", text: "Jump {n} times today", stat: "jumps", base: 40, step: 10, reward: 200 },
  { id: "d_slide", text: "Slide {n} times today", stat: "slides", base: 30, step: 10, reward: 200 },
  { id: "d_power", text: "Use {n} power-ups today", stat: "powerups", base: 4, step: 1, reward: 250 },
  { id: "d_dodge", text: "Dodge {n} moving trains today", stat: "trainsDodged", base: 6, step: 2, reward: 300 },
  { id: "d_roof", text: "Ride {n} m on train roofs today", stat: "roofDist", base: 300, step: 100, reward: 300 },
  { id: "d_runs", text: "Play {n} runs today", stat: "runs", base: 3, step: 1, reward: 200 },
  { id: "d_ramps", text: "Climb {n} ramps today", stat: "ramps", base: 6, step: 2, reward: 250 },
  { id: "d_close", text: "Get {n} close calls today", stat: "closeCalls", base: 8, step: 2, reward: 250 },
];
export const DAILY_BONUS = 500;

/** power-up upgrades: each level adds 15 % duration */
export const UPGRADES = [
  { id: "magnet", name: "Coin Magnet", icon: "magnet", blurb: "Pulls nearby coins to you." },
  { id: "mult", name: "Score ×2", icon: "mult", blurb: "Doubles every point you earn." },
  { id: "shield", name: "Bubble Shield", icon: "shield", blurb: "Smash straight through obstacles." },
  { id: "boost", name: "Rocket Dash", icon: "boost", blurb: "Blast ahead through a clear lane." },
  { id: "board", name: "Hoverboard", icon: "board", blurb: "Longer rides before it fades." },
];
export const UPGRADE_MAX = 5;
export const upgradeCost = (lvl) => [400, 900, 1700, 3000, 5000][lvl] ?? Infinity;
export const upgradeMul = (lvl) => 1 + 0.15 * (lvl || 0);

export const POWER_LABEL = { magnet: "Coin Magnet", mult: "Score ×2", shield: "Bubble Shield", board: "Hoverboard", boost: "Rocket Dash" };
