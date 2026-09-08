/**
 * Mini Golf Journey — the five worlds.
 *
 * Each world is pure data: a name, a difficulty band, the default terrain its
 * courses are cut from, a palette the Canvas renderer reads for every surface,
 * and the decoration + mechanic vocabulary it introduces. Ten levels each
 * (see levels.js) → 50 in total. Nothing here is React; the one golf engine
 * renders any world by swapping this palette.
 */

export const WORLDS = [
  {
    id: 1,
    slug: "green-valley",
    name: "Green Valley",
    tag: "Classic mini-golf park",
    difficulty: "Easy",
    levelRange: [1, 10],
    terrain: "grass",
    mechanics: ["Bank shots", "Angled walls", "Gentle obstacles"],
    decor: ["tree", "bush", "flower", "rock"],
    blurb:
      "Bright fairways under a blue sky. Learn to aim, judge power and read a bank shot.",
    palette: {
      skyTop: "#7ec8f0",
      skyBot: "#cfeef3",
      backdrop: ["#8fd3f4", "#bfe7f7", "#d9f0e4"],
      hills: ["#6fb85f", "#5aa64e"],
      edgeBand: "#255a34",
      ground: "#3f9d4f",
      groundHi: "#57bd63",
      groundLo: "#2d7d3e",
      fairway: "#57b862",
      fairwayHi: "#6fce7a",
      rough: "#2f7a3f",
      apron: "#4aa956",
      wallTop: "#efe7d2",
      wallSide: "#c3b492",
      wallLine: "#8a7a55",
      accent: "#f4c744",
      cup: "#20160c",
      flag: "#e8442f",
    },
  },
  {
    id: 2,
    slug: "sunset-beach",
    name: "Sunset Beach",
    tag: "Tropical beach mini-golf",
    difficulty: "Easy → Medium",
    levelRange: [11, 20],
    terrain: "grass",
    mechanics: ["Sand traps", "Water hazards", "Narrow bridges"],
    decor: ["palm", "beachRock", "shell", "umbrella"],
    blurb:
      "Warm light over the lagoon. Sand slows you down, water costs a stroke, bridges keep you honest.",
    palette: {
      backdrop: ["#ffd9a0", "#ffb27a", "#ff9e8f"],
      hills: ["#e79a5c", "#d9814a"],
      edgeBand: "#7a4a33",
      ground: "#4faa5b",
      groundHi: "#69c46f",
      groundLo: "#3c8a49",
      fairway: "#5fbb68",
      fairwayHi: "#78d07d",
      rough: "#3f8a49",
      apron: "#8fae5f",
      sand: "#f2d9a6",
      sandHi: "#fbe9c4",
      water: "#3aa0d6",
      wallTop: "#d8a878",
      wallSide: "#a9764c",
      wallLine: "#7c5433",
      accent: "#ff8a4c",
      cup: "#1c130a",
      flag: "#ff6b3d",
    },
  },
  {
    id: 3,
    slug: "frozen-peaks",
    name: "Frozen Peaks",
    tag: "Snow & ice",
    difficulty: "Medium",
    levelRange: [21, 30],
    terrain: "grass",
    mechanics: ["Low-friction ice", "Snow slowdown", "Slippery banks"],
    decor: ["pine", "snowRock", "snowman", "icicle"],
    blurb:
      "Thin air and long slides. Ice barely holds you; deep snow grabs the ball. Learn how far it really rolls.",
    palette: {
      backdrop: ["#bfe0f2", "#d6ecf7", "#eef6fb"],
      hills: ["#dbe8f2", "#c2d6e6"],
      edgeBand: "#3d5a72",
      ground: "#7fae8f",
      groundHi: "#9bc6a6",
      groundLo: "#5f8d70",
      fairway: "#86bd96",
      fairwayHi: "#a3d3af",
      rough: "#5c8a6c",
      apron: "#cfe4dd",
      ice: "#bfe6f2",
      iceHi: "#e6f7fb",
      snow: "#eef4f8",
      snowHi: "#ffffff",
      wallTop: "#e8f1f6",
      wallSide: "#a9c2d1",
      wallLine: "#7893a5",
      accent: "#5cc4e6",
      cup: "#16202a",
      flag: "#2f7fd4",
    },
  },
  {
    id: 4,
    slug: "ancient-ruins",
    name: "Ancient Ruins",
    tag: "Temple & jungle ruins",
    difficulty: "Medium → Hard",
    levelRange: [31, 40],
    terrain: "grass",
    mechanics: ["Sliding gates", "Rotating bars", "Trick banks"],
    decor: ["jungle", "pillar", "vineRock", "brazier"],
    blurb:
      "Moss-covered stone and warm shafts of light. Time the gates, read the spinners, find the shortcut.",
    palette: {
      backdrop: ["#c7b98a", "#a7b070", "#7f9a5c"],
      hills: ["#6f8a4c", "#5a7540"],
      edgeBand: "#3a3320",
      ground: "#5c9a4f",
      groundHi: "#77b563",
      groundLo: "#437a3c",
      fairway: "#66a854",
      fairwayHi: "#82c46b",
      rough: "#3e6d38",
      apron: "#8a9152",
      wallTop: "#b9ac86",
      wallSide: "#8a7c58",
      wallLine: "#5f5238",
      accent: "#e0a94a",
      cup: "#181208",
      flag: "#d9a441",
    },
  },
  {
    id: 5,
    slug: "neon-city",
    name: "Neon City",
    tag: "Futuristic night course",
    difficulty: "Hard",
    levelRange: [41, 50],
    terrain: "grass",
    mechanics: ["Conveyors", "Portals", "Moving barriers"],
    decor: ["tower", "sign", "hover", "cityLamp"],
    blurb:
      "A rooftop course under the city glow. Conveyors carry the ball, portals bend the line, barriers keep the tempo. Level 50 is the championship.",
    palette: {
      backdrop: ["#141326", "#241a3d", "#3a2350"],
      hills: ["#241a3d", "#1a1530"],
      edgeBand: "#0c0b16",
      ground: "#20263a",
      groundHi: "#2b344d",
      groundLo: "#171c2c",
      fairway: "#26304a",
      fairwayHi: "#33405f",
      rough: "#161b2b",
      apron: "#2a2350",
      wallTop: "#3a4670",
      wallSide: "#232c49",
      wallLine: "#6ee7ff",
      accent: "#6ee7ff",
      accent2: "#b98cff",
      cup: "#05060a",
      flag: "#6ee7ff",
    },
  },
];

export function getWorld(id) {
  return WORLDS.find((w) => w.id === Number(id)) || WORLDS[0];
}

export function worldForLevel(levelNumber) {
  return WORLDS.find(
    (w) => levelNumber >= w.levelRange[0] && levelNumber <= w.levelRange[1],
  );
}

export const TOTAL_LEVELS = 50;
export const LEVELS_PER_WORLD = 10;
