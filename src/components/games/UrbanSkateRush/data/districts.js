/**
 * Urban Skate Rush — City district definitions
 *
 * Five distinct urban environments with unique themes and challenges.
 */

export const DISTRICTS = [
  {
    id: 1,
    name: "Downtown Streets",
    theme: "Bright modern city center",
    difficulty: "Beginner",
    color: "#4a90d9",
    music: { bpm: 90, key: 0, mood: "upbeat" },
    unlocked: true,
    features: [
      "Wide roads",
      "Sidewalks",
      "Small staircases",
      "Benches",
      "Beginner ramps",
      "Easy rails",
      "Open plazas",
    ],
    environment: {
      skyColor: 0x87ceeb,
      sunColor: 0xfff5e6,
      sunIntensity: 1.2,
      ambientIntensity: 0.5,
      fogColor: 0xc8dff0,
      fogNear: 50,
      fogFar: 200,
    },
  },
  {
    id: 2,
    name: "Industrial Zone",
    theme: "Factories and warehouses",
    difficulty: "Easy-Medium",
    color: "#7a7a7a",
    music: { bpm: 100, key: 2, mood: "gritty" },
    unlocked: false,
    features: [
      "Shipping containers",
      "Loading docks",
      "Metal rails",
      "Concrete ramps",
      "Narrow passages",
      "Industrial obstacles",
    ],
    environment: {
      skyColor: 0x9ca3af,
      sunColor: 0xffe4c4,
      sunIntensity: 0.9,
      ambientIntensity: 0.4,
      fogColor: 0xa0a0a0,
      fogNear: 40,
      fogFar: 150,
    },
  },
  {
    id: 3,
    name: "Beachside Boulevard",
    theme: "Sunny coastal city",
    difficulty: "Medium",
    color: "#00bcd4",
    music: { bpm: 105, key: 5, mood: "tropical" },
    unlocked: false,
    features: [
      "Palm trees",
      "Boardwalk",
      "Beach skate park",
      "Curved ramps",
      "Long grind rails",
      "Colorful shops",
    ],
    environment: {
      skyColor: 0x40c4ff,
      sunColor: 0xffeb3b,
      sunIntensity: 1.4,
      ambientIntensity: 0.6,
      fogColor: 0xe0f7fa,
      fogNear: 60,
      fogFar: 250,
    },
  },
  {
    id: 4,
    name: "Neon Downtown",
    theme: "Nighttime city with neon lights",
    difficulty: "Hard",
    color: "#e040fb",
    music: { bpm: 115, key: 7, mood: "electronic" },
    unlocked: false,
    features: [
      "Rooftop skate spots",
      "Neon signs",
      "Multi-level plazas",
      "Tight jumps",
      "Advanced rail sequences",
      "Traffic",
    ],
    environment: {
      skyColor: 0x0a0a1a,
      sunColor: 0x6366f1,
      sunIntensity: 0.3,
      ambientIntensity: 0.2,
      fogColor: 0x1a1a2e,
      fogNear: 20,
      fogFar: 120,
    },
  },
  {
    id: 5,
    name: "Mega Skate City",
    theme: "Massive futuristic skate district",
    difficulty: "Expert",
    color: "#ff6b35",
    music: { bpm: 125, key: 9, mood: "intense" },
    unlocked: false,
    features: [
      "Huge ramps",
      "Long staircases",
      "Complex rail networks",
      "Rooftop routes",
      "High-speed streets",
      "Mega jumps",
      "Championship skate park",
    ],
    environment: {
      skyColor: 0x1a1a2e,
      sunColor: 0xff6b35,
      sunIntensity: 0.8,
      ambientIntensity: 0.35,
      fogColor: 0x2a2a3e,
      fogNear: 30,
      fogFar: 180,
    },
  },
];

export function districtById(id) {
  return DISTRICTS.find((d) => d.id === id) || null;
}

export function getDistrictForMission(missionId) {
  // Missions 1-6: District 1
  // Missions 7-12: District 2
  // Missions 13-18: District 3
  // Missions 19-24: District 4
  // Missions 25-30: District 5
  return Math.ceil(missionId / 6);
}
