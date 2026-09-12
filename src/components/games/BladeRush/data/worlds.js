/**
 * Blade Rush — the five worlds. Pure data: palette + tagline + the target
 * pool the stage generator draws from. `range` is GLOBAL stage numbers
 * (1-indexed, inclusive), 20 stages each, 100 total.
 */
export const WORLDS = [
  {
    id: "timber-yard",
    index: 0,
    name: "Timber Yard",
    tagline: "Learn the throw",
    range: [1, 20],
    difficulty: "Easy",
    material: "wood",
    bg: ["#1c140c", "#100b07"],
    accent: "#d89a5c",
    accent2: "#8a5a34",
    targets: ["oak", "birchSlice", "cedarShield"],
    miniBoss: "ancientOak", // world-local stage 10
    worldBoss: "timberColossus", // world-local stage 20
  },
  {
    id: "iron-forge",
    index: 1,
    name: "Iron Forge",
    tagline: "Sparks and speed",
    range: [21, 40],
    difficulty: "Medium",
    material: "metal",
    bg: ["#1a1310", "#0e0a08"],
    accent: "#ff8a3d",
    accent2: "#8a95a6",
    targets: ["ironShield", "gearDisc", "forgedCore"],
    miniBoss: "moltenSentinel",
    worldBoss: "anvilKing",
  },
  {
    id: "frozen-core",
    index: 2,
    name: "Frozen Core",
    tagline: "Cold, sharp timing",
    range: [41, 60],
    difficulty: "Medium-Hard",
    material: "ice",
    bg: ["#0c1620", "#070d14"],
    accent: "#5be0ff",
    accent2: "#2c5e70",
    targets: ["iceDisc", "frostCrystal", "glacierShield"],
    miniBoss: "frostbiteWarden",
    worldBoss: "glacierMonarch",
  },
  {
    id: "ancient-temple",
    index: 3,
    name: "Ancient Temple",
    tagline: "Ruins of precision",
    range: [61, 80],
    difficulty: "Hard",
    material: "stone",
    bg: ["#161208", "#0c0a05"],
    accent: "#d9a53c",
    accent2: "#4bd0a0",
    targets: ["stoneMedallion", "runeDisc", "templeShield"],
    miniBoss: "stoneGuardian",
    worldBoss: "templeColossus",
  },
  {
    id: "void-arena",
    index: 4,
    name: "Void Arena",
    tagline: "Master every pattern",
    range: [81, 100],
    difficulty: "Master",
    material: "crystal",
    bg: ["#120a1e", "#0a0512"],
    accent: "#ff2bd6",
    accent2: "#00e5ff",
    targets: ["energyCore", "obsidianDisc", "voidShield"],
    miniBoss: "voidSentinel",
    worldBoss: "voidHeart",
  },
];

export const WORLD_BY_ID = Object.fromEntries(WORLDS.map((w) => [w.id, w]));
export const getWorld = (id) => WORLD_BY_ID[id] || WORLDS[0];
export const worldForStage = (stageId) =>
  WORLDS.find((w) => stageId >= w.range[0] && stageId <= w.range[1]) || WORLDS[0];
