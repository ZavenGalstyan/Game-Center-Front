/**
 * Blade Rush — target visual materials. Every target renders through one
 * procedural renderer per material family (game/targetRender.js); these
 * entries only supply the palette + a few per-target knobs, so 100 stages
 * never need 100 bespoke drawings.
 */
export const TARGETS = {
  // ---------------------------------------------------------- Timber Yard
  oak: { id: "oak", name: "Oak Disc", material: "wood", base: ["#9a6a3c", "#6b4023"], ring: "#563318", rim: "#3c2512", grain: "#c98a52" },
  birchSlice: { id: "birchSlice", name: "Birch Slice", material: "wood", base: ["#d8c19a", "#a9885c"], ring: "#8a6a42", rim: "#5c4428", grain: "#f0e2c4" },
  cedarShield: { id: "cedarShield", name: "Cedar Shield", material: "wood", base: ["#a9704a", "#7a4a28"], ring: "#5c3818", rim: "#3a230e", grain: "#d89a5c", banded: true },
  ancientOak: { id: "ancientOak", name: "Ancient Oak", material: "wood", base: ["#7a5230", "#4a2e16"], ring: "#3a2210", rim: "#241407", grain: "#a97840", isBoss: true, scale: 1.14 },
  timberColossus: { id: "timberColossus", name: "Timber Colossus", material: "wood", base: ["#6b4526", "#3a2412"], ring: "#2a1808", rim: "#180e04", grain: "#9c6c3a", isBoss: true, scale: 1.24 },

  // ----------------------------------------------------------- Iron Forge
  ironShield: { id: "ironShield", name: "Iron Shield", material: "metal", base: ["#b8bfcb", "#5c6472"], ring: "#3a4048", rim: "#22262c", grain: "#e4e9f0", riveted: true },
  gearDisc: { id: "gearDisc", name: "Gear Disc", material: "metal", base: ["#a8b0bd", "#4a505c"], ring: "#32363e", rim: "#1c1e22", grain: "#d8dee6", geared: true },
  forgedCore: { id: "forgedCore", name: "Forged Core", material: "metal", base: ["#c4854a", "#6a3c1c"], ring: "#3e230e", rim: "#231206", grain: "#ffb066", hot: true },
  moltenSentinel: { id: "moltenSentinel", name: "Molten Sentinel", material: "metal", base: ["#d88a3c", "#5c2a10"], ring: "#3a1908", rim: "#200c02", grain: "#ffc478", hot: true, isBoss: true, scale: 1.16 },
  anvilKing: { id: "anvilKing", name: "The Anvil King", material: "metal", base: ["#8a95a6", "#333a44"], ring: "#1c2028", rim: "#0e1014", grain: "#e8edf4", riveted: true, isBoss: true, scale: 1.26 },

  // ---------------------------------------------------------- Frozen Core
  iceDisc: { id: "iceDisc", name: "Ice Disc", material: "ice", base: ["#d4f2fb", "#6fb8d4"], ring: "#4a90ac", rim: "#2c5e70", grain: "#f0fcff" },
  frostCrystal: { id: "frostCrystal", name: "Frost Crystal", material: "ice", base: ["#e4f8ff", "#8ecfe8"], ring: "#5aa4c0", rim: "#336880", grain: "#ffffff", faceted: true },
  glacierShield: { id: "glacierShield", name: "Glacier Shield", material: "ice", base: ["#c4ecfb", "#5aa0c0"], ring: "#3a748e", rim: "#204a5c", grain: "#eafcff", banded: true },
  frostbiteWarden: { id: "frostbiteWarden", name: "Frostbite Warden", material: "ice", base: ["#b8e6fb", "#3c7a9c"], ring: "#255870", rim: "#123342", grain: "#e0f8ff", isBoss: true, scale: 1.16 },
  glacierMonarch: { id: "glacierMonarch", name: "Glacier Monarch", material: "ice", base: ["#9cd8f2", "#2c6484"], ring: "#184258", rim: "#0a232f", grain: "#d0f2ff", isBoss: true, scale: 1.26 },

  // ------------------------------------------------------ Ancient Temple
  stoneMedallion: { id: "stoneMedallion", name: "Stone Medallion", material: "stone", base: ["#9c8f78", "#5c5344"], ring: "#3c362b", rim: "#221f19", grain: "#c8bda0", glow: "#4bd0a0" },
  runeDisc: { id: "runeDisc", name: "Rune Disc", material: "stone", base: ["#8a7d68", "#4a4234"], ring: "#2e2a20", rim: "#18150f", grain: "#b8ac8e", glow: "#6ad0f0", runed: true },
  templeShield: { id: "templeShield", name: "Temple Shield", material: "stone", base: ["#a89464", "#5c4e2e"], ring: "#3a3018", rim: "#201a0c", grain: "#e0c888", glow: "#d9a53c", gilded: true },
  stoneGuardian: { id: "stoneGuardian", name: "Stone Guardian", material: "stone", base: ["#867a63", "#443c2e"], ring: "#2a2418", rim: "#16130c", grain: "#b0a482", glow: "#4bd0a0", isBoss: true, scale: 1.16 },
  templeColossus: { id: "templeColossus", name: "Temple Colossus", material: "stone", base: ["#786a4e", "#38311f"], ring: "#241f13", rim: "#120f09", grain: "#a4966e", glow: "#d9a53c", gilded: true, isBoss: true, scale: 1.28 },

  // -------------------------------------------------------- Void Arena
  energyCore: { id: "energyCore", name: "Energy Core", material: "crystal", base: ["#3a2560", "#160a2c"], ring: "#5a2fa0", rim: "#22103e", grain: "#c084fc", glow: "#00e5ff" },
  obsidianDisc: { id: "obsidianDisc", name: "Obsidian Disc", material: "crystal", base: ["#241a38", "#0c0716"], ring: "#3c2a5c", rim: "#150c24", grain: "#5c3f8a", glow: "#ff2bd6" },
  voidShield: { id: "voidShield", name: "Void Shield", material: "crystal", base: ["#2c1850", "#0e0620"], ring: "#4a2a80", rim: "#180a2c", grain: "#a866ec", glow: "#8a5cff", faceted: true },
  voidSentinel: { id: "voidSentinel", name: "Void Sentinel", material: "crystal", base: ["#341f5c", "#100826"], ring: "#5c2fa0", rim: "#1c0e34", grain: "#c084fc", glow: "#ff2bd6", isBoss: true, scale: 1.18 },
  voidHeart: { id: "voidHeart", name: "Void Heart", material: "crystal", base: ["#40225c", "#120830"], ring: "#6a2fc0", rim: "#1e0e3c", grain: "#e0aaff", glow: "#00e5ff", faceted: true, isBoss: true, scale: 1.34 },
};

export const targetById = (id) => TARGETS[id] || TARGETS.oak;

export const PARTICLE_COLORS = {
  wood: ["#c98a52", "#8a5a34", "#e0b078"],
  metal: ["#ffe8a8", "#ffb84d", "#fff4d6"],
  ice: ["#dff8ff", "#a8e8f8", "#ffffff"],
  stone: ["#d8c8a0", "#a89468", "#f0e4c4"],
  crystal: ["#e0aaff", "#00e5ff", "#ff2bd6"],
};
