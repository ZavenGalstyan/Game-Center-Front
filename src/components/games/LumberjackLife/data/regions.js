/**
 * Lumberjack Life — the five regions. Each one differs in species mix, tree
 * scale, terrain shape, ground cover, weather particles, light, fog, roads,
 * sawmill dressing, orders and timber value — not just a background colour.
 *
 * Layout (shared frame): the sawmill pad sits at (0, -10) facing +Z, the
 * player spawns in front of it, dirt roads lead out to each forest stand.
 * `stands` are where the harvestable trees grow; `deco` decides how dense the
 * non-interactive scatter (bushes, rocks, flowers, grass) is.
 */
export const REGIONS = [
  {
    id: "greenwood",
    name: "Greenwood Valley",
    tagline: "Bright beginner forest — birch, maple and young pine.",
    unlock: { price: 0, orders: 0 },
    species: [["birch", 5], ["maple", 3], ["pine", 2]],
    treeScale: 1,
    weather: "pollen",
    terrain: { seed: 11, amp: 2.4, freq: 0.035, hill: 16, rough: 0.35 },
    ground: { grass: ["#6f9d3f", "#86b04a", "#5d8a35", "#9cbf5a"], dirt: "#9a7650", dirt2: "#7f5f3e", rock: "#8f8d86", cover: null },
    deco: { grass: 1, flowers: 1, bushes: 1, rocks: 0.8, branches: 1, ferns: 0.6, leafLitter: 0 },
    light: {
      skyTop: "#5d9be0", skyHorizon: "#cfe3f0", fog: "#c9dcd8", fogNear: 45, fogFar: 175,
      sun: "#fff1d6", sunIntensity: 2.6, sunElev: 0.82, sunAzim: 0.75, hemiSky: "#bcd8f2", hemiGround: "#5a6b3a", hemi: 0.75,
    },
    mill: { roof: "#8d3b2a", wall: "#9c7a55", trim: "#e9dcc2", snow: false },
    mountains: "#7f9cb0",
    stands: [
      { x: -22, z: 14, r: 13, n: 12 },
      { x: 21, z: 17, r: 12, n: 11 },
      { x: -4, z: 34, r: 12, n: 10 },
      { x: 33, z: -10, r: 9, n: 6 },
      { x: -33, z: -12, r: 8, n: 5 },
    ],
    roads: [[[0, -2], [-10, 6], [-20, 12]], [[0, -2], [11, 8], [20, 15]], [[0, -2], [-2, 16], [-4, 30]], [[6, -6], [20, -8], [31, -9]]],
    orders: [
      {
        id: "gw-1", name: "First Delivery", client: "Hilda's Fence Co.", reward: 150, unlocks: ["vehicle:hand-cart"],
        objectives: [{ type: "CUT_TREE", n: 2 }, { type: "PROCESS_LOGS", n: 3 }, { type: "DELIVER", n: 6 }],
      },
      {
        id: "gw-2", name: "Fence Posts", client: "Hilda's Fence Co.", reward: 220,
        objectives: [{ type: "CUT_TREE", n: 3, species: "birch" }, { type: "DELIVER", n: 10 }],
      },
      {
        id: "gw-3", name: "Maple Workshop", client: "Valley Joinery", reward: 330,
        objectives: [{ type: "PRODUCE_PLANKS", n: 12, species: "maple" }, { type: "DELIVER", n: 12, species: "maple" }],
      },
      {
        id: "gw-4", name: "Cabin Repairs", client: "Old Tom", reward: 430,
        objectives: [{ type: "COLLECT_LOGS", n: 8 }, { type: "DELIVER", n: 16 }],
      },
      {
        id: "gw-5", name: "Valley Festival", client: "Greenwood Council", reward: 620,
        objectives: [{ type: "CUT_TREE", n: 6 }, { type: "DELIVER", n: 24 }],
      },
    ],
  },
  {
    id: "pine-mountain",
    name: "Pine Mountain",
    tagline: "Steep slopes, rocky roads and tall conifers.",
    unlock: { price: 1500, orders: 4 },
    species: [["pine", 4], ["fir", 4], ["spruce", 3]],
    treeScale: 1.15,
    weather: "mist",
    terrain: { seed: 23, amp: 5.2, freq: 0.04, hill: 34, rough: 0.6 },
    ground: { grass: ["#5d7f45", "#6e8d4c", "#4f6e3c", "#7c9455"], dirt: "#8a7a68", dirt2: "#6b5e50", rock: "#7d7f80", cover: "needles" },
    deco: { grass: 0.7, flowers: 0.3, bushes: 0.6, rocks: 2.2, branches: 1, ferns: 1, leafLitter: 0 },
    light: {
      skyTop: "#4f86c6", skyHorizon: "#d6e3ea", fog: "#c4d2d8", fogNear: 35, fogFar: 150,
      sun: "#fff4e2", sunIntensity: 2.4, sunElev: 0.7, sunAzim: 1.2, hemiSky: "#c3d6ea", hemiGround: "#4a5640", hemi: 0.75,
    },
    mill: { roof: "#4c5a63", wall: "#7d6650", trim: "#d8d2c4", snow: false },
    mountains: "#6c8396",
    stands: [
      { x: -24, z: 12, r: 13, n: 12 },
      { x: 22, z: 20, r: 13, n: 12 },
      { x: 0, z: 36, r: 12, n: 10 },
      { x: -30, z: -16, r: 9, n: 6 },
      { x: 32, z: -12, r: 9, n: 6 },
    ],
    roads: [[[0, -2], [-12, 5], [-22, 10]], [[0, -2], [12, 10], [21, 18]], [[0, -2], [1, 18], [0, 32]], [[-6, -6], [-18, -12], [-28, -15]], [[6, -6], [20, -10], [30, -12]]],
    orders: [
      { id: "pm-1", name: "Mountain Welcome", client: "Summit Lodge", reward: 520, objectives: [{ type: "CUT_TREE", n: 3, species: "pine" }, { type: "DELIVER", n: 12, species: "pine" }] },
      { id: "pm-2", name: "Fir for the Lodge", client: "Summit Lodge", reward: 720, objectives: [{ type: "PRODUCE_PLANKS", n: 18, species: "fir" }, { type: "DELIVER", n: 18, species: "fir" }] },
      { id: "pm-3", name: "Spruce Beams", client: "Ridge Builders", reward: 940, objectives: [{ type: "CUT_TREE", n: 3, species: "spruce" }, { type: "DELIVER", n: 18, species: "spruce" }] },
      { id: "pm-4", name: "Ski Hut", client: "Ridge Builders", reward: 1150, objectives: [{ type: "COLLECT_LOGS", n: 12 }, { type: "DELIVER", n: 30 }] },
      { id: "pm-5", name: "Summit Bridge", client: "Mountain Rail", reward: 1600, objectives: [{ type: "CUT_TREE", n: 8 }, { type: "DELIVER", n: 40 }] },
    ],
  },
  {
    id: "autumn-woods",
    name: "Autumn Woods",
    tagline: "Warm hardwood forest — oak, maple and beech.",
    unlock: { price: 4200, orders: 8 },
    species: [["oak", 4], ["maple", 3], ["beech", 3]],
    leafTint: { maple: ["#d2582a", "#e57a2e", "#b8421f"], beech: ["#d89a35", "#e9b54a", "#c27f27"], oak: ["#b0702b", "#c98a37", "#8f5a22"] },
    treeScale: 1.05,
    weather: "leaves",
    terrain: { seed: 37, amp: 3.0, freq: 0.045, hill: 20, rough: 0.45 },
    ground: { grass: ["#a9a64e", "#bba957", "#9a9646", "#cdb05c"], dirt: "#a57a52", dirt2: "#8a6240", rock: "#9a938a", cover: "leaves" },
    deco: { grass: 0.8, flowers: 0.2, bushes: 1.2, rocks: 1, branches: 1.4, ferns: 0.6, leafLitter: 1.6 },
    light: {
      skyTop: "#6f97c9", skyHorizon: "#f1d9b5", fog: "#e2cdae", fogNear: 35, fogFar: 150,
      sun: "#ffdfaa", sunIntensity: 2.9, sunElev: 0.64, sunAzim: 0.55, hemiSky: "#f6e2c4", hemiGround: "#8a6a44", hemi: 1.0,
    },
    mill: { roof: "#6b3524", wall: "#8c6a48", trim: "#efd9b6", snow: false },
    mountains: "#a08a7a",
    stands: [
      { x: -20, z: 14, r: 13, n: 12 },
      { x: 22, z: 15, r: 12, n: 11 },
      { x: -2, z: 34, r: 13, n: 11 },
      { x: -32, z: -10, r: 9, n: 6 },
      { x: 32, z: -6, r: 9, n: 6 },
    ],
    roads: [[[0, -2], [-10, 7], [-18, 12]], [[0, -2], [12, 8], [20, 13]], [[0, -2], [-1, 16], [-2, 30]], [[-6, -6], [-20, -9], [-30, -10]], [[6, -6], [20, -6], [30, -6]]],
    orders: [
      { id: "aw-1", name: "Harvest Barn", client: "Ambergate Farm", reward: 1150, objectives: [{ type: "CUT_TREE", n: 3, species: "maple" }, { type: "DELIVER", n: 20, species: "maple" }] },
      { id: "aw-2", name: "Oak Furniture", client: "Hearth & Grain", reward: 1850, objectives: [{ type: "CUT_TREE", n: 3, species: "oak" }, { type: "DELIVER", n: 24, species: "oak" }] },
      { id: "aw-3", name: "Beech Flooring", client: "Hearth & Grain", reward: 1950, objectives: [{ type: "PRODUCE_PLANKS", n: 28, species: "beech" }, { type: "DELIVER", n: 28, species: "beech" }] },
      { id: "aw-4", name: "Cider Mill", client: "Ambergate Farm", reward: 2300, objectives: [{ type: "COLLECT_LOGS", n: 14 }, { type: "DELIVER", n: 40 }] },
      { id: "aw-5", name: "Autumn Fair", client: "Woods Guild", reward: 3100, objectives: [{ type: "CUT_TREE", n: 10 }, { type: "DELIVER", n: 60 }] },
    ],
  },
  {
    id: "snowy-timberland",
    name: "Snowy Timberland",
    tagline: "Cold, quiet and heavy — spruce, pine and frostwood.",
    unlock: { price: 9000, orders: 12 },
    species: [["spruce", 4], ["pine", 3], ["frostwood", 3]],
    leafTint: { pine: ["#2c5c45", "#3a6c50", "#264e3b"] },
    snowy: true,
    treeScale: 1.1,
    weather: "snow",
    terrain: { seed: 53, amp: 3.8, freq: 0.038, hill: 28, rough: 0.5 },
    ground: { grass: ["#e9eef2", "#dfe6ec", "#f4f7f9", "#d3dde4"], dirt: "#9c9590", dirt2: "#7c7570", rock: "#7f8890", cover: "snow" },
    deco: { grass: 0.25, flowers: 0, bushes: 0.6, rocks: 1.4, branches: 0.8, ferns: 0, leafLitter: 0 },
    light: {
      skyTop: "#8eaacb", skyHorizon: "#e6edf2", fog: "#dbe4ea", fogNear: 25, fogFar: 120,
      sun: "#f1f5ff", sunIntensity: 1.9, sunElev: 0.45, sunAzim: 1.0, hemiSky: "#dce8f4", hemiGround: "#9aa6b0", hemi: 0.95,
    },
    mill: { roof: "#4f3c34", wall: "#6e5644", trim: "#e8edf0", snow: true },
    mountains: "#a9bccb",
    stands: [
      { x: -22, z: 14, r: 13, n: 11 },
      { x: 22, z: 18, r: 13, n: 11 },
      { x: 0, z: 35, r: 12, n: 10 },
      { x: -32, z: -12, r: 9, n: 6 },
      { x: 33, z: -10, r: 9, n: 6 },
    ],
    roads: [[[0, -2], [-12, 7], [-21, 12]], [[0, -2], [12, 10], [21, 16]], [[0, -2], [0, 18], [0, 31]], [[-6, -6], [-20, -11], [-30, -12]], [[6, -6], [21, -9], [31, -10]]],
    orders: [
      { id: "st-1", name: "Winter Cabin", client: "Frostbay Outfitters", reward: 2500, objectives: [{ type: "CUT_TREE", n: 4, species: "spruce" }, { type: "DELIVER", n: 24, species: "spruce" }] },
      { id: "st-2", name: "Frostwood Sample", client: "Aurora Instruments", reward: 3100, objectives: [{ type: "CUT_TREE", n: 2, species: "frostwood" }, { type: "DELIVER", n: 16, species: "frostwood" }] },
      { id: "st-3", name: "Sled Workshop", client: "Frostbay Outfitters", reward: 2700, objectives: [{ type: "PRODUCE_PLANKS", n: 30, species: "pine" }, { type: "DELIVER", n: 30, species: "pine" }] },
      { id: "st-4", name: "Ice Lodge", client: "Northpass Resort", reward: 4300, objectives: [{ type: "COLLECT_LOGS", n: 18 }, { type: "DELIVER", n: 50 }] },
      { id: "st-5", name: "Northern Lights Hall", client: "Aurora Instruments", reward: 6200, objectives: [{ type: "CUT_TREE", n: 4, species: "frostwood" }, { type: "DELIVER", n: 40, species: "frostwood" }] },
    ],
  },
  {
    id: "golden-forest",
    name: "Golden Forest",
    tagline: "Ancient giants and the rarest timber in the land.",
    unlock: { price: 20000, orders: 16 },
    species: [["goldenwood", 4], ["oak", 3], ["beech", 3]],
    leafTint: { oak: ["#c9a23c", "#d8b552", "#a8852d"], beech: ["#d6b445", "#e6c75b", "#b9962f"] },
    treeScale: 1.25,
    weather: "gold",
    terrain: { seed: 71, amp: 3.2, freq: 0.03, hill: 24, rough: 0.4 },
    ground: { grass: ["#97a646", "#a9b552", "#879a3c", "#bcc160"], dirt: "#a3805a", dirt2: "#86653f", rock: "#9a8f7c", cover: "gold" },
    deco: { grass: 1, flowers: 1.2, bushes: 0.9, rocks: 0.8, branches: 0.8, ferns: 0.8, leafLitter: 0.8 },
    light: {
      skyTop: "#6c8fd0", skyHorizon: "#f6dfae", fog: "#efd9a8", fogNear: 40, fogFar: 170,
      sun: "#ffe0a0", sunIntensity: 2.8, sunElev: 0.62, sunAzim: 0.4, hemiSky: "#f8e2b6", hemiGround: "#8a7444", hemi: 0.95,
    },
    mill: { roof: "#2f4d3a", wall: "#a07b4f", trim: "#f3e0b0", snow: false },
    mountains: "#b49c84",
    stands: [
      { x: -24, z: 15, r: 14, n: 10 },
      { x: 24, z: 18, r: 14, n: 10 },
      { x: 0, z: 37, r: 13, n: 9 },
      { x: -33, z: -12, r: 9, n: 5 },
      { x: 34, z: -10, r: 9, n: 5 },
    ],
    roads: [[[0, -2], [-12, 7], [-22, 13]], [[0, -2], [13, 9], [22, 16]], [[0, -2], [0, 18], [0, 33]], [[-6, -6], [-20, -10], [-31, -12]], [[6, -6], [21, -9], [32, -10]]],
    orders: [
      { id: "gf-1", name: "Golden Commission", client: "The Crown Workshop", reward: 5200, objectives: [{ type: "CUT_TREE", n: 1, species: "goldenwood" }, { type: "DELIVER", n: 30, species: "goldenwood" }] },
      { id: "gf-2", name: "Royal Hall", client: "The Crown Workshop", reward: 5400, objectives: [{ type: "CUT_TREE", n: 4, species: "oak" }, { type: "DELIVER", n: 40, species: "oak" }] },
      { id: "gf-3", name: "Grand Staircase", client: "Highcourt Estate", reward: 9200, objectives: [{ type: "PRODUCE_PLANKS", n: 60, species: "goldenwood" }, { type: "DELIVER", n: 60, species: "goldenwood" }] },
      { id: "gf-4", name: "Timber Empire", client: "Highcourt Estate", reward: 12500, objectives: [{ type: "COLLECT_LOGS", n: 30 }, { type: "DELIVER", n: 120 }] },
      { id: "gf-5", name: "Legend of the Forest", client: "Woods Guild", reward: 26000, objectives: [{ type: "CUT_TREE", n: 8, species: "goldenwood" }, { type: "DELIVER", n: 150, species: "goldenwood" }] },
    ],
  },
];

export const regionById = (id) => REGIONS.find((r) => r.id === id) || REGIONS[0];

/** leaf colours for a species in a region (autumn/snow tints) */
export function leafColors(region, species) {
  return (region.leafTint && region.leafTint[species.id]) || species.leaves;
}

/** sawmill frame (shared by engine + renderer) */
export const MILL = { x: 0, z: -10, yaw: 0 };
export const SPAWN = { x: 1.5, z: 1.5, yaw: Math.PI };
export const PLAY_RADIUS = 52;
