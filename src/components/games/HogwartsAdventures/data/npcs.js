/**
 * Non-player characters: where they stand (which can depend on the story),
 * how they look and how they idle. Conversations live in data/dialogue.js.
 */
export const NPCS = {
  dumbledore: {
    name: "Professor Dumbledore",
    title: "Headmaster",
    at: () => ({ x: 0, z: -57.4, yaw: 0 }),
    idle: "FoldArms",
    look: { body: "m", hair: "Hair_Long", hairColor: "#d8d8d4", beard: "long", beardColor: "#e2e2de", hat: "wizard", hatColor: "#4b2a6e", robe: "#4b2a6e", tunic: "#6b4a8e", hose: "#3a2a4e", trim: "#d8b25a", trim2: "#e8d8a8", glasses: "half", skinTint: "#ecd6c6", scale: 1.04, cloak: "#3a1f58" },
  },
  snape: {
    name: "Professor Snape",
    title: "Potions Master",
    at: () => ({ x: 44, z: 7.6, yaw: 0 }),
    idle: "FoldArms",
    look: { body: "m", hair: "Hair_Long", hairColor: "#0e0c0c", robe: "#0c0b0e", tunic: "#121115", hose: "#0e0e10", trim: "#2a2a30", trim2: "#3a3a40", skinTint: "#e6d8cc", scale: 1.03, cloak: "#08080a" },
  },
  flitwick: {
    name: "Professor Flitwick",
    title: "Charms Master",
    at: () => ({ x: 44, z: -22.4, yaw: 0 }),
    idle: "Talk",
    look: { body: "m", hair: "Hair_SimpleParted", hairColor: "#ececec", beard: "short", beardColor: "#ececec", robe: "#2a3a6e", tunic: "#3a4a7e", hose: "#2a2a3a", trim: "#c0a050", trim2: "#e0d0a0", scale: 0.62, girth: 1.15, skinTint: "#f0d8c8" },
  },
  hagrid: {
    name: "Hagrid",
    title: "Keeper of Keys and Grounds",
    at: () => ({ x: -45, z: 77.6, yaw: 0.6 }),
    idle: "Idle",
    talkRange: 5,
    look: { body: "m", hair: "Hair_Long", hairColor: "#2a1a10", beard: "bushy", beardColor: "#2a1a10", robe: "#5a3e26", tunic: "#6a4a2e", hose: "#3a2a1a", trim: "#3a2618", trim2: "#4a3220", coat: true, scale: 1.55, girth: 1.45, skinTint: "#e8c8b0" },
  },
  pince: {
    name: "Madam Pince",
    title: "Librarian",
    at: () => ({ x: -31.2, z: -8, yaw: Math.PI / 2 }),
    idle: "FoldArms",
    talkRange: 4.8,
    look: { body: "f", hair: "Hair_Buns", hairColor: "#4a4a48", robe: "#2a2422", tunic: "#3a3230", hose: "#2a2a2a", trim: "#6a5a4a", trim2: "#8a7a6a", skinTint: "#e8d6ca" },
  },
  neville: {
    name: "Neville Longbottom",
    title: "Gryffindor",
    at: (G) => (G.questState("defend") === "active" ? { x: 100, z: 117, yaw: 0 } : { x: 9, z: 9, yaw: -2.2 }),
    idle: "Idle",
    look: { body: "m", hair: "Hair_SimpleParted", hairColor: "#4a3420", robe: "#1a181c", tunic: "#e0dace", hose: "#2a2a30", trim: "#b3262c", trim2: "#d9a628", scarf: ["#8e1b22", "#d9a628"], skinTint: "#f2dccb", girth: 1.08 },
    hp: 120,
  },
  luna: {
    name: "Luna Lovegood",
    title: "Ravenclaw",
    at: () => ({ x: -10, z: -8, yaw: 2.4 }),
    idle: "Idle",
    wander: { x0: -16, x1: -6, z0: -14, z1: -4 },
    look: { body: "f", hair: "Hair_Long", hairColor: "#e8dca0", robe: "#1a1a22", tunic: "#e8e4dc", hose: "#2a2a3a", trim: "#2a4a9e", trim2: "#b08a50", scarf: ["#1e3a7a", "#a88a5a"], skinTint: "#f4e4d8" },
  },
  ginny: {
    name: "Ginny Weasley",
    title: "Gryffindor",
    at: () => ({ x: 88, z: 106, yaw: 0.8 }),
    idle: "Idle",
    look: { body: "f", hair: "Hair_Long", hairColor: "#b8401a", robe: "#1a181c", tunic: "#e0dace", hose: "#2a2a30", trim: "#b3262c", trim2: "#d9a628", scarf: ["#8e1b22", "#d9a628"], skinTint: "#f6dccb" },
  },
  student1: { name: "Hufflepuff Student", title: "Student", at: () => ({ x: 12, z: -10, yaw: -1 }), idle: "Talk", wander: { x0: 6, x1: 16, z0: -15, z1: -5 }, look: { body: "f", hair: "Hair_Buns", hairColor: "#6a4a2a", robe: "#1a1a1c", trim: "#d8b020", trim2: "#3a3a3a", scarf: ["#d8b020", "#2a2a2a"], tunic: "#e0dace", hose: "#2a2a30" } },
  student2: { name: "Ravenclaw Student", title: "Student", at: () => ({ x: -12, z: 12, yaw: 2.2 }), idle: "Idle", wander: { x0: -16, x1: -6, z0: 6, z1: 16 }, look: { body: "m", hair: "Hair_Buzzed", hairColor: "#2a1a10", robe: "#1a1a22", trim: "#2a4a9e", trim2: "#b08a50", scarf: ["#1e3a7a", "#a88a5a"], tunic: "#e0dace", hose: "#2a2a30", skin: "dark" } },
  student3: { name: "Slytherin Student", title: "Student", at: () => ({ x: -6, z: -36, yaw: 1.6 }), idle: "Talk", look: { body: "m", hair: "Hair_SimpleParted", hairColor: "#1a1410", robe: "#141416", trim: "#1f6e3e", trim2: "#c0c6cc", scarf: ["#1a4e2e", "#b8bec4"], tunic: "#2a2a2e", hose: "#1e1e22" } },
  student4: { name: "Gryffindor Student", title: "Student", at: () => ({ x: -38, z: 2, yaw: -1.4 }), idle: "Idle", wander: { x0: -48, x1: -30, z0: -3, z1: 3 }, look: { body: "f", hair: "Hair_BuzzedFemale", hairColor: "#1a1008", robe: "#1a181c", trim: "#b3262c", trim2: "#d9a628", scarf: ["#8e1b22", "#d9a628"], tunic: "#e0dace", hose: "#2a2a30", skin: "dark" } },
};
/** Companions (the three heroes you are not playing) gather by the fountain. */
export const COMPANION_SPOTS = [
  { x: -5.2, z: 2.6, yaw: 2.3 },
  { x: 5.2, z: 2.6, yaw: -2.3 },
  { x: -2.4, z: 5.6, yaw: 2.9 },
];
