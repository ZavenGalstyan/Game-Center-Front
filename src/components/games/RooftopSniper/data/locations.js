/**
 * Rooftop Sniper — the 6 locations (10 missions each). Purely presentational
 * + range/atmosphere metadata; mission content itself lives in data/missions.js.
 * Same shape as Bomb Squad's data/operations.js.
 */
export const LOCATIONS = [
  {
    id: "downtown",
    index: 0,
    name: "DOWNTOWN",
    tagline: "Learn the scope",
    range: [1, 10],
    sky: ["#8fc7ef", "#e8f4ff"],
    fog: "#cfe8fb",
    fogNear: 60,
    fogFar: 220,
    sun: { color: "#fff6e0", intensity: 1.6, position: [40, 60, 20] },
    ambient: { color: "#bcd8f0", intensity: 0.55 },
    accent: "#5ad1e8",
    weather: "clear",
  },
  {
    id: "industrial",
    index: 1,
    name: "INDUSTRIAL DISTRICT",
    tagline: "Cover and machinery",
    range: [11, 20],
    sky: ["#7c8a8f", "#c3ccc9"],
    fog: "#b7bdb8",
    fogNear: 45,
    fogFar: 190,
    sun: { color: "#f2e2c8", intensity: 1.2, position: [30, 45, -10] },
    ambient: { color: "#a9b0a6", intensity: 0.5 },
    accent: "#e8a33d",
    weather: "cloudy",
  },
  {
    id: "desert",
    index: 2,
    name: "DESERT CITY",
    tagline: "Long range, wind",
    range: [21, 30],
    sky: ["#f2b463", "#ffe6bd"],
    fog: "#f3d19a",
    fogNear: 70,
    fogFar: 260,
    sun: { color: "#fff0d0", intensity: 2, position: [60, 50, 30] },
    ambient: { color: "#f0c98a", intensity: 0.6 },
    accent: "#e8763d",
    weather: "clear",
  },
  {
    id: "snow",
    index: 3,
    name: "SNOW DISTRICT",
    tagline: "Fog and wind",
    range: [31, 40],
    sky: ["#aebfce", "#e7eef5"],
    fog: "#dbe4ec",
    fogNear: 35,
    fogFar: 160,
    sun: { color: "#eaf2ff", intensity: 1, position: [20, 40, -20] },
    ambient: { color: "#c9d6e2", intensity: 0.65 },
    accent: "#7ec8f2",
    weather: "snow",
  },
  {
    id: "neon",
    index: 4,
    name: "NEON CITY",
    tagline: "Night, rain, drones",
    range: [41, 50],
    sky: ["#0c1024", "#241b3a"],
    fog: "#160f26",
    fogNear: 30,
    fogFar: 150,
    sun: { color: "#5a6bff", intensity: 0.35, position: [10, 40, -30] },
    ambient: { color: "#2b2050", intensity: 0.55 },
    accent: "#ff3df0",
    weather: "rain",
  },
  {
    id: "security-zone",
    index: 5,
    name: "HIGH SECURITY ZONE",
    tagline: "Everything, at once",
    range: [51, 60],
    sky: ["#141821", "#2c3648"],
    fog: "#1c2330",
    fogNear: 40,
    fogFar: 210,
    sun: { color: "#dceeff", intensity: 1.1, position: [-30, 55, 25] },
    ambient: { color: "#33415a", intensity: 0.5 },
    accent: "#ff5c6c",
    weather: "cloudy",
  },
];

export function locationForMission(id) {
  return LOCATIONS.find((l) => id >= l.range[0] && id <= l.range[1]) || LOCATIONS[0];
}

export function getLocation(id) {
  return LOCATIONS.find((l) => l.id === id) || LOCATIONS[0];
}

export function localIndex(id) {
  const loc = locationForMission(id);
  return id - loc.range[0]; // 0..9 within the location
}
