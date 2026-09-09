/**
 * Delivery Rush — the five delivery districts.
 *
 * A zone is pure data: an unlock cost in stars, a weather/time-of-day preset
 * and a full colour palette. world/ reads the palette to tint every material in
 * the city, so the same building/prop kit produces five genuinely different
 * looking places rather than one city with a recoloured sky.
 *
 * `surface` values are multipliers applied by systems/vehiclePhysics.js:
 * grip < 1 means longer slides, brake < 1 means longer stopping distances.
 */

export const ZONES = [
  {
    id: "central-city",
    name: "Central City",
    subtitle: "Bright modern downtown",
    order: 1,
    starsRequired: 0,
    seed: 20260101,
    weather: "clear",
    timeOfDay: "day",
    difficulty: "Easy",
    blurb:
      "Wide boulevards, cafe terraces and a green square in the middle. Learn the grid here.",
    surface: { grip: 1, brake: 1 },
    trafficBias: 1,
    palette: {
      skyTop: "#2f7fd8", skyMid: "#8ec6ef", skyBottom: "#dff0fb",
      sun: "#fff4dd", sunIntensity: 2.05, sunPos: [90, 120, 60],
      hemiSky: "#bfe0ff", hemiGround: "#5d6b56", hemiIntensity: 0.95,
      ambient: 0.34,
      fog: "#cfe4f2", fogNear: 130, fogFar: 470,
      ground: "#6f8f5a", groundAlt: "#7d9a64",
      asphalt: "#4a4e55", asphaltAlt: "#54585f",
      marking: "#e8e6dc", curb: "#b9b8b2", sidewalk: "#9d9d99", sidewalkAlt: "#8f9091",
      buildings: ["#d8cfc0", "#c9a98d", "#b8bec6", "#d6b9a4", "#a9b3ae", "#cdc2b4", "#bfa998"],
      roofs: ["#5a5f66", "#6c5c53", "#4e5a5e"],
      trim: "#efe9df",
      window: "#2b3b49", windowEmissive: "#0a0f14", windowGlow: 0.0,
      trees: ["#3f7a3a", "#4c8c42", "#356b34", "#5a9a4a"],
      trunk: "#6b513a",
      signs: ["#e0533e", "#e8a13a", "#2f8fd0", "#43a674", "#8a5fc4"],
      water: "#2f6f9e",
      accent: "#ffd166",
    },
  },
  {
    id: "sunset-coast",
    name: "Sunset Coast",
    subtitle: "Boardwalk & palm-lined promenade",
    order: 2,
    starsRequired: 15,
    seed: 20260202,
    weather: "clear",
    timeOfDay: "sunset",
    difficulty: "Normal",
    blurb:
      "A curving coast road, narrow hotel streets and low sun in your eyes. Cutting the corners pays.",
    surface: { grip: 0.98, brake: 1 },
    trafficBias: 0.95,
    palette: {
      skyTop: "#2b3f7a", skyMid: "#e2734a", skyBottom: "#ffcf8e",
      sun: "#ffb066", sunIntensity: 1.9, sunPos: [-150, 42, -70],
      hemiSky: "#ffcf9e", hemiGround: "#6a4f43", hemiIntensity: 0.85,
      ambient: 0.4,
      fog: "#f0b183", fogNear: 110, fogFar: 430,
      ground: "#c9b483", groundAlt: "#d6c294",
      asphalt: "#54504e", asphaltAlt: "#5e5956",
      marking: "#f2e9d6", curb: "#d6cdbb", sidewalk: "#c4b8a2", sidewalkAlt: "#b7ab96",
      buildings: ["#f2e2cf", "#efd0b4", "#e8b9a2", "#dcc9b6", "#f5ddc2", "#e2c5ae", "#cfd8d4"],
      roofs: ["#b8563f", "#a24b39", "#c46a4a"],
      trim: "#fff6e8",
      window: "#3a3546", windowEmissive: "#4a2a18", windowGlow: 0.25,
      trees: ["#4f8f4e", "#5da05a", "#3f7a44"],
      trunk: "#7a6244",
      signs: ["#ff7a4d", "#ffc24d", "#4dc2d6", "#ff5f8a", "#7ad67a"],
      water: "#1f6f97",
      accent: "#ff8f4d",
    },
  },
  {
    id: "industrial-run",
    name: "Industrial Run",
    subtitle: "Docks, depots and container yards",
    order: 3,
    starsRequired: 35,
    seed: 20260303,
    weather: "rain",
    timeOfDay: "overcast",
    difficulty: "Hard",
    blurb:
      "Heavy trucks, wet asphalt and long service roads. The warehouse passages are the fast way through.",
    surface: { grip: 0.9, brake: 0.9 },
    trafficBias: 1.15,
    palette: {
      skyTop: "#4c5866", skyMid: "#6d7a87", skyBottom: "#96a2ac",
      sun: "#c9d3dc", sunIntensity: 1.05, sunPos: [70, 130, -90],
      hemiSky: "#9aa8b6", hemiGround: "#4b504f", hemiIntensity: 1.0,
      ambient: 0.5,
      fog: "#8b98a4", fogNear: 80, fogFar: 340,
      ground: "#6d7161", groundAlt: "#787c6c",
      asphalt: "#3c4046", asphaltAlt: "#44484f",
      marking: "#d9d6c9", curb: "#9a9b98", sidewalk: "#83868a", sidewalkAlt: "#767a7e",
      buildings: ["#8e9298", "#a3a099", "#7f8a90", "#9c8e80", "#8a9a99", "#94918b", "#6f7a80"],
      roofs: ["#54595e", "#4a4f54", "#5f5348"],
      trim: "#c9ccd0",
      window: "#2a3339", windowEmissive: "#26343a", windowGlow: 0.18,
      trees: ["#4c6b41", "#3f5c38"],
      trunk: "#5c4e3d",
      signs: ["#e8a33a", "#d9503c", "#3f8fbf", "#5fa872"],
      water: "#3b5563",
      accent: "#f0a63a",
    },
  },
  {
    id: "frost-city",
    name: "Frost City",
    subtitle: "Snowbound old town",
    order: 4,
    starsRequired: 60,
    seed: 20260404,
    weather: "snow",
    timeOfDay: "cold",
    difficulty: "Hard",
    blurb:
      "Packed snow on every corner. Brake early, turn early — the grip you expect is not there.",
    surface: { grip: 0.72, brake: 0.68 },
    trafficBias: 0.9,
    palette: {
      skyTop: "#7d93b0", skyMid: "#b3c4d6", skyBottom: "#e2ebf2",
      sun: "#e8f0fb", sunIntensity: 1.35, sunPos: [-80, 110, 90],
      hemiSky: "#dfe9f4", hemiGround: "#8d97a3", hemiIntensity: 1.15,
      ambient: 0.55,
      fog: "#d5e2ee", fogNear: 70, fogFar: 320,
      ground: "#e6edf4", groundAlt: "#dbe4ee",
      asphalt: "#5a5f66", asphaltAlt: "#6b7078",
      marking: "#e4e8ec", curb: "#c8d2dc", sidewalk: "#dde6ef", sidewalkAlt: "#d0dae5",
      buildings: ["#b7c2cf", "#c8b8ac", "#a9b6c4", "#d0c4b8", "#9fb0bf", "#c2c8ce", "#b0a89f"],
      roofs: ["#e8f0f7", "#dde7f0", "#cfdae6"],
      trim: "#f2f6fa",
      window: "#33404d", windowEmissive: "#5a4326", windowGlow: 0.5,
      trees: ["#2f5a45", "#39684f", "#28503c"],
      trunk: "#4f4034",
      signs: ["#d9503c", "#3f8fbf", "#e8a33a", "#5fa872"],
      water: "#5b7f9c",
      accent: "#7ec8f0",
    },
  },
  {
    id: "midnight-metro",
    name: "Midnight Metro",
    subtitle: "Neon downtown after dark",
    order: 5,
    starsRequired: 90,
    seed: 20260505,
    weather: "rain",
    timeOfDay: "night",
    difficulty: "Expert",
    blurb:
      "Wet neon, dense traffic and no daylight to help you. Everything you learned, at speed.",
    surface: { grip: 0.86, brake: 0.88 },
    trafficBias: 1.3,
    palette: {
      skyTop: "#070b1c", skyMid: "#121b38", skyBottom: "#22304f",
      sun: "#8fa6d8", sunIntensity: 0.42, sunPos: [-60, 90, -110],
      hemiSky: "#3a4a78", hemiGround: "#141a26", hemiIntensity: 0.75,
      ambient: 0.5,
      fog: "#101a30", fogNear: 55, fogFar: 300,
      ground: "#1c2430", groundAlt: "#232c3a",
      asphalt: "#22262e", asphaltAlt: "#2a2f38",
      marking: "#c9cdd6", curb: "#4d525c", sidewalk: "#363b45", sidewalkAlt: "#2f343d",
      buildings: ["#2b3448", "#333a52", "#26304a", "#3a3550", "#2f3a4e", "#242d40", "#38405a"],
      roofs: ["#1c2333", "#222a3c"],
      trim: "#48577a",
      window: "#1a2233", windowEmissive: "#ffcf7a", windowGlow: 1.0,
      trees: ["#254433", "#1e3a2c"],
      trunk: "#33291f",
      signs: ["#ff3d7f", "#3df0ff", "#ffd23d", "#a05cff", "#3dff9e"],
      water: "#101c30",
      accent: "#3df0ff",
    },
  },
];

export const ZONE_MAP = Object.fromEntries(ZONES.map((z) => [z.id, z]));

export function getZone(id) {
  return ZONE_MAP[id] || ZONES[0];
}

/** Weather presets shared by the scene + physics. */
export const WEATHER = {
  clear: { rain: 0, snow: 0, wetness: 0, grip: 1, brake: 1 },
  rain: { rain: 1, snow: 0, wetness: 0.85, grip: 0.94, brake: 0.94 },
  snow: { rain: 0, snow: 1, wetness: 0.25, grip: 0.9, brake: 0.88 },
};

export function getWeather(id) {
  return WEATHER[id] || WEATHER.clear;
}
