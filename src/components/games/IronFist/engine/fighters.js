/**
 * The six original fighters. `stats` feed the simulation; `look` is read only
 * by render/fighterRig.js (body, skin, costume layers, gear, palette).
 *
 *   hp      max health          speed   walk / dash multiplier
 *   power   damage multiplier   weight  knockback taken multiplier
 *   tempo   attack timing multiplier (< 1 = faster startup & recovery)
 *   jump    jump height multiplier
 *
 * Costume layers (see fighterRig.js):
 *   paint   shader-painted bodysuit regions on the skin: top / sleeves / legs / hands / feet / hood
 *   shells  skinned cloth shells cut from the body mesh: gi, jacket, pants, shorts, tank
 *   gear    rigid pieces parented to bones: belts, headbands, masks, pads, gauntlets…
 */
export const FIGHTERS = [
  {
    id: "ryuzen",
    name: "Ryuzen",
    title: "The Balanced Fist",
    style: "Karate · Balanced",
    blurb: "A disciplined temple-trained martial artist. Even speed and power, and a long-range Dragon Wave.",
    color: "#e8eef7",
    accent: "#3d8bff",
    stats: { hp: 1000, speed: 1.0, power: 1.0, weight: 1.0, tempo: 1.0, jump: 1.0 },
    special: "dragonWave",
    specialName: "Dragon Wave",
    rating: { power: 3, speed: 3, defense: 3, range: 4 },
    look: {
      body: "m",
      skin: "light",
      skinTint: "#f3ddc8",
      hair: "Hair_SimpleParted",
      hairColor: "#141210",
      shells: [
        { kind: "gi", color: "#d6d8da", trim: "#c4c8ce" },
        { kind: "giPants", color: "#d2d4d6" },
      ],
      paint: { hands: "#e6dccd", handsTo: 0.08, feet: null },
      gear: [
        { g: "belt", color: "#141414" },
        { g: "headband", color: "#c81e2a", tails: true },
        { g: "wraps", color: "#efe7d8" },
      ],
      glow: "#59a8ff",
    },
    alt: { shells: [{ kind: "gi", color: "#202634", trim: "#3a4256" }, { kind: "giPants", color: "#1d2230" }], gear: [{ g: "belt", color: "#b8202a" }, { g: "headband", color: "#f2f2f2", tails: true }, { g: "wraps", color: "#2a2f3a" }] },
  },
  {
    id: "blaze",
    name: "Blaze",
    title: "Inferno Kickboxer",
    style: "Kickboxing · Aggressive",
    blurb: "Hot-headed street kickboxer. Hits hard and fast, closes distance with a burning spin kick.",
    color: "#ff5a1f",
    accent: "#ffb21f",
    stats: { hp: 960, speed: 1.06, power: 1.1, weight: 1.0, tempo: 0.96, jump: 1.0 },
    special: "infernoKick",
    specialName: "Inferno Spin Kick",
    rating: { power: 4, speed: 4, defense: 2, range: 3 },
    look: {
      body: "m",
      skin: "light",
      skinTint: "#e6b896",
      hair: "Hair_Buzzed",
      hairColor: "#c4321a",
      beard: false,
      shells: [{ kind: "shorts", color: "#b3121c", trim: "#ffb21f", pattern: "flame" }],
      paint: { feet: null },
      gear: [
        { g: "gloves", color: "#c0141e", trim: "#f2f2f2" },
        { g: "shinGuards", color: "#1a1a1a", trim: "#ff6a1f" },
        { g: "chain", color: "#d9b25a" },
      ],
      glow: "#ff6a1f",
    },
    alt: { shells: [{ kind: "shorts", color: "#1b4fc8", trim: "#ffffff", pattern: "flame" }], gear: [{ g: "gloves", color: "#1b4fc8", trim: "#f2f2f2" }, { g: "shinGuards", color: "#f2f2f2", trim: "#1b4fc8" }, { g: "chain", color: "#c9c9d2" }] },
  },
  {
    id: "titan",
    name: "Titan",
    title: "The Mountain",
    style: "Wrestling · Power",
    blurb: "A colossal powerhouse. Slow but devastating; his Earthquake Slam shrugs off a hit while it charges.",
    color: "#c9a14a",
    accent: "#7a4e1f",
    stats: { hp: 1160, speed: 0.84, power: 1.2, weight: 0.62, tempo: 1.1, jump: 0.86 },
    special: "quakeSlam",
    specialName: "Earthquake Slam",
    rating: { power: 5, speed: 1, defense: 5, range: 3 },
    look: {
      body: "m",
      skin: "dark",
      skinTint: "#d9c2b0",
      hair: "Hair_Buzzed",
      hairColor: "#0c0b0a",
      beard: true,
      scale: 1.1,
      girth: 1.24,
      shells: [
        { kind: "tank", color: "#22262b", trim: "#c9a14a" },
        { kind: "pants", color: "#4a4136", trim: "#2a241d" },
      ],
      paint: { feet: "#1b1714", feetTo: 0.2 },
      gear: [
        { g: "champBelt", color: "#c9a14a" },
        { g: "kneePads", color: "#1a1a1a" },
        { g: "gloves", color: "#2a2016", trim: "#c9a14a", mma: true },
        { g: "boots", color: "#1b1714" },
      ],
      glow: "#ffb84a",
    },
    alt: { shells: [{ kind: "tank", color: "#6b1414", trim: "#e0e0e0" }, { kind: "pants", color: "#1d1d22", trim: "#101014" }], gear: [{ g: "champBelt", color: "#d8d8de" }, { g: "kneePads", color: "#6b1414" }, { g: "gloves", color: "#101014", trim: "#d8d8de", mma: true }, { g: "boots", color: "#101014" }] },
  },
  {
    id: "kira",
    name: "Kira",
    title: "Lightning Lotus",
    style: "Wushu · Speed",
    blurb: "The fastest fighter in the circuit. Light hits, lightning reflexes and a blinding dash strike.",
    color: "#c53cff",
    accent: "#3cf0ff",
    stats: { hp: 900, speed: 1.24, power: 0.9, weight: 1.15, tempo: 0.86, jump: 1.12 },
    special: "lightningRush",
    specialName: "Lightning Rush",
    rating: { power: 2, speed: 5, defense: 2, range: 3 },
    look: {
      body: "f",
      skin: "light",
      skinTint: "#f6dccb",
      hair: "Hair_Buns",
      hairColor: "#1b1020",
      scale: 0.97,
      shells: [
        { kind: "crop", color: "#6a1fb0", trim: "#3cf0ff" },
        { kind: "leggings", color: "#1d1428", trim: "#c53cff" },
      ],
      paint: { feet: "#f2f2f6", feetTo: 0.12 },
      gear: [
        { g: "armGuards", color: "#c53cff", trim: "#3cf0ff" },
        { g: "sash", color: "#3cf0ff" },
      ],
      glow: "#3cf0ff",
    },
    alt: { shells: [{ kind: "crop", color: "#f2f2f2", trim: "#ff3c8a" }, { kind: "leggings", color: "#2a2a32", trim: "#ff3c8a" }], gear: [{ g: "armGuards", color: "#ff3c8a", trim: "#ffffff" }, { g: "sash", color: "#ff3c8a" }] },
  },
  {
    id: "shadow",
    name: "Shadow",
    title: "The Masked Ninja",
    style: "Ninjutsu · Tricky",
    blurb: "A silent assassin. Vanishes and reappears behind you with Shadow Step.",
    color: "#7b5cff",
    accent: "#ff2a4a",
    stats: { hp: 940, speed: 1.12, power: 0.98, weight: 1.05, tempo: 0.93, jump: 1.08 },
    special: "shadowStep",
    specialName: "Shadow Step",
    rating: { power: 3, speed: 4, defense: 3, range: 2 },
    look: {
      body: "m",
      skin: "light",
      skinTint: "#e9cdb7",
      hair: null,
      shells: [
        { kind: "jacket", color: "#15151d", trim: "#2a2a3a" },
        { kind: "pants", color: "#121219", trim: "#1d1d28" },
      ],
      paint: { hood: "#121219", hands: "#16161e", handsTo: 0.0, feet: "#0e0e14", feetTo: 0.16 },
      gear: [
        { g: "ninjaMask", color: "#0f0f15", eyes: "#ff2a4a" },
        { g: "scarf", color: "#8a1222" },
        { g: "belt", color: "#2c2c3c" },
        { g: "armGuards", color: "#24242f", trim: "#7b5cff" },
      ],
      glow: "#7b5cff",
    },
    alt: { shells: [{ kind: "jacket", color: "#e8e6e0", trim: "#c8c4bc" }, { kind: "pants", color: "#dedad2", trim: "#c8c4bc" }], paint: { hood: "#e2ded6", hands: "#d8d4cc", handsTo: 0.0, feet: "#cfcbc2", feetTo: 0.16 }, gear: [{ g: "ninjaMask", color: "#e8e6e0", eyes: "#2ad8ff" }, { g: "scarf", color: "#1f6fd1" }, { g: "belt", color: "#9a958c" }, { g: "armGuards", color: "#c8c4bc", trim: "#2ad8ff" }] },
  },
  {
    id: "storm",
    name: "Storm",
    title: "Thunder Champion",
    style: "Capoeira · Electric",
    blurb: "Reigning world champion. Calls lightning down on wherever her rival stands.",
    color: "#2ab8ff",
    accent: "#ffe14a",
    stats: { hp: 1000, speed: 1.04, power: 1.05, weight: 0.95, tempo: 0.97, jump: 1.05 },
    special: "thunderStrike",
    specialName: "Thunder Strike",
    rating: { power: 4, speed: 3, defense: 3, range: 5 },
    look: {
      body: "f",
      skin: "dark",
      skinTint: "#e3c6b2",
      hair: "Hair_BuzzedFemale",
      hairColor: "#eef3ff",
      shells: [
        { kind: "suitTop", color: "#0f2a4a", trim: "#2ab8ff", pattern: "bolt" },
        { kind: "leggings", color: "#0c1f38", trim: "#2ab8ff", pattern: "bolt" },
      ],
      paint: { feet: "#0c1f38", feetTo: 0.14 },
      gear: [
        { g: "shoulderPads", color: "#d9b44a", trim: "#2ab8ff" },
        { g: "gauntlets", color: "#1a2a40", trim: "#2ab8ff", glow: true },
        { g: "belt", color: "#d9b44a" },
      ],
      glow: "#4ad0ff",
    },
    alt: { shells: [{ kind: "suitTop", color: "#3a0f2a", trim: "#ffe14a", pattern: "bolt" }, { kind: "leggings", color: "#2a0c1f", trim: "#ffe14a", pattern: "bolt" }], paint: { feet: "#2a0c1f", feetTo: 0.14 }, gear: [{ g: "shoulderPads", color: "#c8c8d2", trim: "#ffe14a" }, { g: "gauntlets", color: "#2a1020", trim: "#ffe14a", glow: true }, { g: "belt", color: "#c8c8d2" }] },
  },
];

export const FIGHTER_BY_ID = Object.fromEntries(FIGHTERS.map((f) => [f.id, f]));

/** Fighter look with the alternate palette merged in (mirror matches). */
export function lookFor(fighter, alt = false) {
  if (!alt || !fighter.alt) return fighter.look;
  return { ...fighter.look, ...fighter.alt, paint: { ...fighter.look.paint, ...(fighter.alt.paint || {}) } };
}
