/**
 * Arena Gladiator — the five arenas. Gameplay-relevant data (radius, pillar
 * colliders, floor material for footsteps) plus the visual theme the shared
 * arena builder (three/Arena.jsx) dresses the place with.
 */
export const ARENAS = [
  {
    id: "dust_pit",
    name: "THE DUST PIT",
    tier: 1,
    fights: [1, 5],
    blurb: "A provincial training pit. Sand, splinters and a crowd that came for blood money.",
    radius: 8.6,
    pillars: [],
    floor: "sand",
    wallH: 2.4,
    theme: {
      sky: ["#8fb8d8", "#e9d6ae"], sun: "#fff1d0", sunI: 2.6, sunPos: [14, 22, 8], amb: "#b9a383", ambI: 0.75,
      fog: "#d9c49a", fogNear: 30, fogFar: 90, sand: "#c8a46a", sandDark: "#a07d48", stone: "#9a8b76",
      wood: "#6d4c2e", banner: "#9b2f22", banner2: "#d8b04a", crowd: 180, tiers: 3, torches: false, night: false,
      dust: 1, columns: 0, statues: 0, fireBowls: 0,
    },
    unlockAfter: null,
  },
  {
    id: "iron_courtyard",
    name: "IRON COURTYARD",
    tier: 2,
    fights: [6, 10],
    blurb: "A fortress yard of grey stone and iron gates. Soldiers and nobles fill the walls.",
    radius: 9.4,
    pillars: [],
    floor: "stone",
    wallH: 3.2,
    theme: {
      sky: ["#7f95ab", "#cfd6dc"], sun: "#f4f2ea", sunI: 2.2, sunPos: [-12, 20, 10], amb: "#8e97a3", ambI: 0.8,
      fog: "#a9b3bd", fogNear: 30, fogFar: 95, sand: "#8d877c", sandDark: "#6d675e", stone: "#7b7d80",
      wood: "#4b3a2c", banner: "#2f4d7a", banner2: "#b9b9b9", crowd: 320, tiers: 4, torches: true, night: false,
      dust: 0.5, columns: 0, statues: 0, fireBowls: 0,
    },
    unlockAfter: 5,
  },
  {
    id: "sun_temple",
    name: "SUN TEMPLE",
    tier: 3,
    fights: [11, 15],
    blurb: "Golden stone and tall columns under a merciless sun. Use the pillars — so will they.",
    radius: 10,
    pillars: [
      { x: 6.4, z: 0, r: 0.5 },
      { x: -6.4, z: 0, r: 0.5 },
      { x: 0, z: 6.4, r: 0.5 },
      { x: 0, z: -6.4, r: 0.5 },
    ],
    floor: "stone",
    wallH: 3.0,
    theme: {
      sky: ["#5aa0de", "#f6e7b8"], sun: "#fff4d6", sunI: 3.1, sunPos: [6, 26, -12], amb: "#d7b777", ambI: 0.7,
      fog: "#f0dcae", fogNear: 35, fogFar: 110, sand: "#d7b574", sandDark: "#b8904f", stone: "#d8b878",
      wood: "#7a5230", banner: "#c7361f", banner2: "#f0c24a", crowd: 420, tiers: 4, torches: false, night: false,
      dust: 0.8, columns: 16, statues: 2, fireBowls: 0,
    },
    unlockAfter: 10,
  },
  {
    id: "night_colosseum",
    name: "NIGHT COLOSSEUM",
    tier: 4,
    fights: [16, 20],
    blurb: "Moonlight, fire bowls and ten thousand voices. Nobody leaves this sand quietly.",
    radius: 10.8,
    pillars: [],
    floor: "sand",
    wallH: 3.4,
    theme: {
      sky: ["#070b1a", "#1c2340"], sun: "#9fb4ff", sunI: 0.9, sunPos: [-10, 24, -14], amb: "#3a4266", ambI: 0.55,
      fog: "#10142a", fogNear: 25, fogFar: 80, sand: "#9b7f58", sandDark: "#6b5539", stone: "#6c6259",
      wood: "#3d2a1c", banner: "#6b1f2a", banner2: "#c9a24a", crowd: 560, tiers: 5, torches: true, night: true,
      dust: 0.5, columns: 0, statues: 0, fireBowls: 8,
    },
    unlockAfter: 15,
  },
  {
    id: "legends",
    name: "ARENA OF LEGENDS",
    tier: 5,
    fights: [21, 25],
    blurb: "The grand championship bowl. Statues of old champions watch who joins them.",
    radius: 11.4,
    pillars: [],
    floor: "sand",
    wallH: 3.6,
    theme: {
      sky: ["#e38b4f", "#f7d7a0"], sun: "#ffd9a0", sunI: 2.5, sunPos: [-16, 12, 10], amb: "#c49274", ambI: 0.7,
      fog: "#e8b886", fogNear: 40, fogFar: 130, sand: "#d2ad72", sandDark: "#a88252", stone: "#c9b89a",
      wood: "#6a4526", banner: "#6d1c7a", banner2: "#e8c35a", crowd: 700, tiers: 6, torches: true, night: false,
      dust: 0.9, columns: 24, statues: 6, fireBowls: 4,
    },
    unlockAfter: 20,
  },
];

export const TRAINING_ARENA = {
  id: "training",
  name: "TRAINING YARD",
  tier: 0,
  blurb: "",
  radius: 8,
  pillars: [],
  floor: "sand",
  wallH: 2.2,
  theme: { ...ARENAS[0].theme, crowd: 0, tiers: 1, banner: "#3d5a2a", dust: 0.6 },
};

export const arenaById = (id) => ARENAS.find((a) => a.id === id) || (id === "training" ? TRAINING_ARENA : ARENAS[0]);
