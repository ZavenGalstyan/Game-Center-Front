/**
 * The fifteen tournament stages of the trail west.
 *
 * Every stage is a freezeout: everyone buys in with the same stack of
 * (fictional) chips, the blinds rise every `handsPerLevel` hands and the
 * table plays until one player holds every chip. If the sun goes down first
 * (`sundown` hands), the biggest stack takes the title. Lose all your chips
 * and the stage is lost — retry as often as you like.
 *
 * diff = AI difficulty of the shared Hold'em AI (easy | medium | hard).
 * env  = how the saloon looks: sky (day | sunset | night), walls, floor,
 *        felt colour, decor tags read by render/saloon.js.
 * map  = position on the frontier map (0..100 × 0..62), east → west;
 *        a third value of 1 puts the town's label below its marker.
 */

/** Blind ladder for a stage: level k = base × LADDER[k] (rounded to 5s). */
const LADDER = [1, 1.5, 2, 3, 4, 6, 8, 12, 16, 24, 32, 48, 64, 96];
export function blindLevels(baseBB) {
  return LADDER.map((m) => {
    const bb = Math.max(2, Math.round((baseBB * m) / 10) * 10);
    return { sb: Math.floor(bb / 2), bb };
  });
}

export const STAGES = [
  {
    id: 1, town: "Dusty Creek", saloon: "Rookie Saloon", rivals: ["tate", "holloway"], diff: "easy",
    stack: 1000, bb: 20, handsPerLevel: 10, sundown: 45, purse: 500,
    story: "You ride into Dusty Creek with an empty canteen and a deck of cards in your saddlebag. The Rookie Saloon runs a friendly game for newcomers. Every legend starts somewhere.",
    goal: "Win every chip at the table.",
    env: { sky: "day", walls: "raw_plank_wall", floor: "old_wood_floor", felt: 0x1f5a34, size: "small", decor: ["barrels", "crates"] },
    map: [93, 42, 1],
  },
  {
    id: 2, town: "Red Rock", saloon: "Frontier Table", rivals: ["holloway", "prowse", "donovan"], diff: "easy",
    stack: 1000, bb: 20, handsPerLevel: 10, sundown: 50, purse: 750,
    story: "Word travels fast on the frontier. In Red Rock, beneath the crimson cliffs, a drifting gambler named Lucky Cal has heard about the newcomer from Dusty Creek.",
    goal: "Outlast three opponents at the Frontier Table.",
    env: { sky: "day", walls: "wood_plank_wall", floor: "old_wood_floor", felt: 0x1d5634, size: "small", decor: ["barrels", "piano", "clock"] },
    map: [86, 24],
  },
  {
    id: 3, town: "Silver Gulch", saloon: "Miners' Saloon", rivals: ["prowse", "tate", "kessler"], diff: "easy",
    stack: 1200, bb: 20, handsPerLevel: 9, sundown: 50, purse: 1000,
    story: "Silver Gulch never sleeps. Miners spend the week's dust at the Miners' Saloon, and tonight a hard-faced stranger called Dutch is sitting in.",
    goal: "Bust the miners — and keep an eye on Dutch Kessler.",
    env: { sky: "night", walls: "wood_plank_wall", floor: "old_wood_floor", felt: 0x1b4f4a, size: "small", decor: ["crates", "lanterns", "mining"] },
    map: [79, 46, 1],
  },
  {
    id: 4, town: "Cactus Valley", saloon: "Desert Outpost", rivals: ["alvarez", "holloway"], diff: "medium",
    stack: 1200, bb: 20, handsPerLevel: 9, sundown: 50, purse: 1250,
    story: "A sun-baked adobe outpost at the edge of the desert. The water is warm, the whiskey warmer, and Diego Alvarez never folds a hand he likes.",
    goal: "Win the heads-up showdown at the Desert Outpost.",
    env: { sky: "day", walls: "clay_plaster", floor: "old_wood_floor", felt: 0x2a5a30, size: "small", adobe: true, decor: ["barrels", "desert"] },
    map: [72, 28],
  },
  {
    id: 5, town: "Lone Star", saloon: "Sheriff's Table", rivals: ["reed", "morrow", "varga"], diff: "medium",
    stack: 1500, bb: 30, handsPerLevel: 9, sundown: 55, purse: 1500,
    story: "Sheriff Amos Reed runs the only honest game in Lone Star — and he plays it himself. A wanted man called Rattlesnake has the nerve to sit at the lawman's table.",
    goal: "Beat the law and the outlaw at the Sheriff's Table.",
    env: { sky: "sunset", walls: "wood_plank_wall", floor: "wood_floor_worn", felt: 0x1e5634, size: "medium", decor: ["wanted", "clock", "barrels"] },
    map: [64, 48, 1],
  },
  {
    id: 6, town: "Gold Rush", saloon: "Prospectors' Hall", rivals: ["prowse", "donovan", "kessler"], diff: "medium",
    stack: 1500, bb: 30, handsPerLevel: 8, sundown: 55, purse: 2000,
    story: "Gold fever has filled the Prospectors' Hall with fortune-seekers and gold dust. Lucky Cal is back, and Dutch Kessler wants a rematch.",
    goal: "Claim the Prospectors' Hall jackpot.",
    env: { sky: "night", walls: "raw_plank_wall", floor: "old_wood_floor", felt: 0x174a2c, size: "medium", decor: ["lanterns", "mining", "piano", "crates"] },
    map: [57, 20],
  },
  {
    id: 7, town: "Broken Spur", saloon: "Outlaw Saloon", rivals: ["malone", "varga", "alvarez"], diff: "medium",
    stack: 1500, bb: 30, handsPerLevel: 8, sundown: 55, purse: 2500,
    story: "No lawman rides into Broken Spur. The Outlaw Saloon belongs to Black Jack Malone, and nobody leaves his table with more than he allows.",
    goal: "Take Black Jack's table from him.",
    env: { sky: "night", walls: "wood_plank_wall", floor: "old_wood_floor", felt: 0x5a1a18, size: "small", dark: true, decor: ["wanted", "barrels", "crates"] },
    map: [50, 40, 1],
  },
  {
    id: 8, town: "Sunset Ridge", saloon: "High Stakes Table", rivals: ["donovan", "grey", "morrow"], diff: "medium",
    stack: 2000, bb: 40, handsPerLevel: 8, sundown: 60, purse: 3000,
    story: "High on Sunset Ridge, the stakes climb with the altitude. Doc Thaddeus Grey treats poker as arithmetic — and rarely gets his sums wrong.",
    goal: "Survive the High Stakes Table.",
    env: { sky: "sunset", walls: "wooden_panels", floor: "wood_floor_worn", felt: 0x4a1622, size: "medium", fancy: true, decor: ["piano", "clock", "paintings"] },
    map: [43, 14],
  },
  {
    id: 9, town: "Iron Creek", saloon: "Railroad Town", rivals: ["kessler", "vance", "cutter"], diff: "hard",
    stack: 2000, bb: 40, handsPerLevel: 8, sundown: 60, purse: 3500,
    story: "The railroad brought money to Iron Creek, and money brought Cornelius Vance. A U.S. Marshal is in town hunting Dutch Kessler — and all three want your seat.",
    goal: "Outplay the baron, the marshal and the robber.",
    env: { sky: "day", walls: "raw_plank_wall", floor: "wood_floor_worn", felt: 0x1e5032, size: "medium", decor: ["railroad", "crates", "clock", "lanterns"] },
    map: [36, 32],
  },
  {
    id: 10, town: "Blackwater", saloon: "Veteran Gamblers", rivals: ["whitlock", "grey", "delaney"], diff: "hard",
    stack: 2000, bb: 40, handsPerLevel: 7, sundown: 60, purse: 4000,
    story: "In the river town of Blackwater the old guard still plays. Ezra Whitlock has sat at these tables for forty years, and the Queen of Spades has never lost to him.",
    goal: "Beat the veterans at their own game.",
    env: { sky: "night", walls: "wooden_panels", floor: "wood_floor_worn", felt: 0x16374e, size: "medium", fancy: true, decor: ["paintings", "clock", "piano"] },
    map: [30, 50, 1],
  },
  {
    id: 11, town: "Copper Canyon", saloon: "Desert Tournament", rivals: ["alvarez", "varga", "cutter"], diff: "hard",
    stack: 2500, bb: 50, handsPerLevel: 7, sundown: 60, purse: 5000,
    story: "Every gambler between the rivers comes to the Copper Canyon Desert Tournament. The heat is brutal, the players are worse, and the marshal is still watching.",
    goal: "Win the Desert Tournament.",
    env: { sky: "sunset", walls: "clay_plaster", floor: "wood_floor_worn", felt: 0x2c4f2a, size: "medium", adobe: true, decor: ["desert", "barrels", "lanterns"] },
    map: [24, 22],
  },
  {
    id: 12, town: "Deadwood Crossing", saloon: "Outlaw Challenge", rivals: ["malone", "kessler", "varga"], diff: "hard",
    stack: 2500, bb: 50, handsPerLevel: 7, sundown: 60, purse: 6000,
    story: "The outlaws have heard you are heading for the championship. At Deadwood Crossing they mean to stop you — one hand at a time.",
    goal: "Survive the Outlaw Challenge.",
    env: { sky: "night", walls: "wood_plank_wall", floor: "old_wood_floor", felt: 0x55191a, size: "small", dark: true, decor: ["wanted", "crates", "barrels"] },
    map: [19, 42, 1],
  },
  {
    id: 13, town: "Golden Mesa", saloon: "Elite Saloon", rivals: ["delaney", "vance", "grey"], diff: "hard",
    stack: 3000, bb: 60, handsPerLevel: 7, sundown: 65, purse: 7500,
    story: "Crystal glasses, a polished bar and a velvet table: the Elite Saloon of Golden Mesa admits only the best. Tonight that includes you.",
    goal: "Earn your place among the elite.",
    env: { sky: "sunset", walls: "wooden_panels", floor: "wood_floor_worn", felt: 0x4a1424, size: "large", fancy: true, chandelier: true, decor: ["paintings", "clock", "piano", "candles"] },
    map: [14, 12],
  },
  {
    id: 14, town: "Frontier Crown", saloon: "Championship Qualifier", rivals: ["whitlock", "delaney", "cutter"], diff: "hard",
    stack: 3000, bb: 60, handsPerLevel: 6, sundown: 65, purse: 9000,
    story: "One seat at the Grand Final remains. Old Ezra, the Queen of Spades and Marshal Cutter all want it. Only the winner of the Frontier Crown qualifier rides on.",
    goal: "Win the last seat at the Grand Final.",
    env: { sky: "night", walls: "wooden_panels", floor: "wood_floor_worn", felt: 0x1a4a32, size: "large", fancy: true, chandelier: true, decor: ["paintings", "clock", "candles"] },
    map: [10, 30, 1],
  },
  {
    id: 15, town: "Last Sunset", saloon: "Wild West Grand Final", rivals: ["blackwood", "whitlock", "malone"], diff: "hard",
    stack: 4000, bb: 80, handsPerLevel: 6, sundown: 70, purse: 15000,
    story: "At the end of the trail, where the sun sinks into the desert, Colonel Augustus Blackwood waits at the most famous table in the West. Win here and every saloon from Dusty Creek to the ocean will know your name.",
    goal: "Defeat the Colonel and become Grand Champion.",
    env: { sky: "sunset", walls: "wooden_panels", floor: "wood_floor_worn", felt: 0x0f4a34, size: "large", fancy: true, chandelier: true, finale: true, decor: ["paintings", "clock", "piano", "candles"] },
    map: [7, 52, 1],
  },
];
export const STAGE_COUNT = STAGES.length;
export const stageById = (id) => STAGES.find((s) => s.id === id) || null;

/** Titles earned along the trail (by stages completed). */
export const TITLES = [
  { at: 0, title: "Unknown Traveler" },
  { at: 3, title: "Card Slinger" },
  { at: 6, title: "Saloon Regular" },
  { at: 9, title: "High Roller" },
  { at: 12, title: "Frontier Legend" },
  { at: 15, title: "Grand Champion of the West" },
];
export function titleFor(completed) {
  let t = TITLES[0].title;
  for (const x of TITLES) if (completed >= x.at) t = x.title;
  return t;
}
/** A milestone reached by completing stage `id` (shown on the stage-complete screen). */
export function milestoneAt(id) {
  return TITLES.find((x) => x.at === id && x.at > 0) || null;
}
