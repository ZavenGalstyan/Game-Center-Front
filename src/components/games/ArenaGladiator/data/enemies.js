/**
 * Arena Gladiator — the 25 opponents, 5 per arena. Pure data on top of the
 * shared fighter + AI: no opponent has its own component or code path.
 *
 *   tempo     startup multiplier (1.6 = very readable wind-ups, 1.0 = player speed)
 *   reaction  AI perception delay in seconds (see engine/ai.js)
 *   look      appearance for the shared gladiator model (three/gladiator.js)
 *
 * All names and designs are original.
 */
const L = (o) => ({
  skin: "#b98563", hair: "short", hairColor: "#2a1d15", beard: false, helmet: "none", crest: null,
  cloth: "#8c2f23", leather: "#6b4a2e", metal: "#a9a39a", accent: "#d2a64a", ...o,
});

const ai = (o) => ({
  reaction: 0.45, aggression: 0.45, blockRate: 0.35, parryRate: 0.0, dodgeRate: 0.08, counterRate: 0.3, kickRate: 0.1,
  distance: 2.35, strafe: 0.5, turn: 7, patience: 1.8, guardUp: 0, combos: [["L"], ["L", "L"], ["H"]], ...o,
});

export const ENEMIES = [
  /* ------------------------------------------------------------ THE DUST PIT */
  {
    id: "cassian", n: 1, arena: "dust_pit", first: "Cassian", nickname: "The Jackal", last: "Varro",
    style: "SWORDSMAN", blurb: "A pit regular with a cheap sword and cheaper tricks. Telegraphs everything.",
    weapon: "sword_shield", armor: "light", hp: 70, damageMul: 0.75, tempo: 1.75, moveMul: 0.92, recoveryMul: 1.25,
    ai: ai({ reaction: 0.55, aggression: 0.34, blockRate: 0.3, dodgeRate: 0.04, counterRate: 0.2, kickRate: 0, turn: 5.5, patience: 2.2, combos: [["L"], ["L"], ["L", "L"], ["H"]] }),
    look: L({ skin: "#c48d63", hair: "shaggy", hairColor: "#3b2616", beard: true, helmet: "none", cloth: "#7a4a2a", leather: "#5e4128" }),
  },
  {
    id: "doran", n: 2, arena: "dust_pit", first: "Doran", nickname: "The Ox", last: "Mallek",
    style: "HEAVY WARRIOR", blurb: "Slow, huge, and swings an axe like a door. Don't block it — step aside.",
    weapon: "axe", armor: "heavy", hp: 95, damageMul: 0.7, tempo: 1.55, moveMul: 0.85, recoveryMul: 1.3,
    ai: ai({ reaction: 0.55, aggression: 0.4, blockRate: 0.3, dodgeRate: 0.0, counterRate: 0.25, kickRate: 0.05, distance: 2.2, strafe: 0.35, turn: 4.8, patience: 2.3, combos: [["L"], ["H"], ["L", "H"]] }),
    look: L({ skin: "#9c6a48", hair: "bald", beard: true, hairColor: "#1d140e", helmet: "cap", cloth: "#4d4a3a", leather: "#4a3322", metal: "#8f8a80", build: 1.08, bulk: 1.15 }),
  },
  {
    id: "lysa", n: 3, arena: "dust_pit", first: "Lysa", nickname: "Quickstep", last: "Venn",
    style: "DUAL BLADE", blurb: "Two little blades and never where you swing. Wait for her to over-commit.",
    weapon: "dual", armor: "light", hp: 72, damageMul: 0.8, tempo: 1.55, moveMul: 1.02, recoveryMul: 1.2,
    ai: ai({ reaction: 0.5, aggression: 0.55, blockRate: 0.2, dodgeRate: 0.26, counterRate: 0.3, kickRate: 0, distance: 2.5, strafe: 0.75, turn: 6.5, patience: 1.6, combos: [["L", "L"], ["L", "L", "L"], ["H"]] }),
    look: L({ skin: "#d7a27c", hair: "braid", hairColor: "#6b2f17", helmet: "none", cloth: "#2f5f5a", leather: "#5a3d27", accent: "#c9d3d8" }),
  },
  {
    id: "tavian", n: 4, arena: "dust_pit", first: "Tavian", nickname: "The Wall", last: "Orsk",
    style: "SHIELD GUARD", blurb: "Hides behind his shield and waits. Kick it down (F) or hammer it with heavies.",
    weapon: "sword_shield", armor: "heavy", hp: 85, damageMul: 0.75, tempo: 1.55, moveMul: 0.9, recoveryMul: 1.2,
    ai: ai({ reaction: 0.5, aggression: 0.3, blockRate: 0.75, dodgeRate: 0.0, counterRate: 0.35, kickRate: 0.05, distance: 2.1, strafe: 0.35, turn: 6, patience: 2.4, guardUp: 0.7, combos: [["L"], ["L", "L"]] }),
    look: L({ skin: "#b27b58", hair: "short", hairColor: "#1f1a16", helmet: "brim", cloth: "#6e2a2a", leather: "#4a3322" }),
  },
  {
    id: "gaius", n: 5, arena: "dust_pit", first: "Gaius", nickname: "Red Sand", last: "Marro", champion: true,
    style: "PIT CHAMPION", blurb: "Champion of the Dust Pit. Balanced, patient, and he has started to parry.",
    weapon: "sword_shield", armor: "balanced", hp: 100, damageMul: 0.85, tempo: 1.4, moveMul: 0.96, recoveryMul: 1.1,
    ai: ai({ reaction: 0.42, aggression: 0.5, blockRate: 0.45, parryRate: 0.1, dodgeRate: 0.08, counterRate: 0.45, kickRate: 0.2, turn: 7, patience: 1.7, combos: [["L", "L"], ["L", "H"], ["H"], ["L", "L", "L"]] }),
    look: L({ skin: "#a8714d", hair: "short", hairColor: "#140f0c", beard: true, helmet: "crest", crest: "#b32a1f", cloth: "#8e1f1a", accent: "#d9ad4b" }),
  },

  /* ------------------------------------------------------------ IRON COURTYARD */
  {
    id: "vesna", n: 6, arena: "iron_courtyard", first: "Vesna", nickname: "Long Reach", last: "Harrow",
    style: "SPEARMAN", blurb: "Keeps you at the tip of her spear. Close the distance and she struggles.",
    weapon: "spear", armor: "balanced", hp: 100, damageMul: 0.9, tempo: 1.4, moveMul: 0.96,
    ai: ai({ reaction: 0.4, aggression: 0.5, blockRate: 0.4, parryRate: 0.05, dodgeRate: 0.15, counterRate: 0.4, distance: 2.9, strafe: 0.55, turn: 7.5, patience: 1.6, combos: [["L"], ["L", "L"], ["H"]] }),
    look: L({ skin: "#e0b08c", hair: "bun", hairColor: "#2c1a10", helmet: "cap", cloth: "#2d4a6a", leather: "#4d3a2a", metal: "#9aa3ab" }),
  },
  {
    id: "rurik", n: 7, arena: "iron_courtyard", first: "Rurik", nickname: "Ironhide", last: "Voss",
    style: "SHIELD GUARD", blurb: "Iron scale and a heavy shield. He will make you pay for every blocked swing.",
    weapon: "sword_shield", armor: "heavy", hp: 115, damageMul: 0.9, tempo: 1.35, moveMul: 0.9,
    ai: ai({ reaction: 0.4, aggression: 0.38, blockRate: 0.75, parryRate: 0.08, dodgeRate: 0, counterRate: 0.55, kickRate: 0.15, distance: 2.2, strafe: 0.35, turn: 7, patience: 2.0, guardUp: 0.75, combos: [["L"], ["L", "L"], ["H"]] }),
    look: L({ skin: "#c39070", hair: "bald", beard: true, hairColor: "#6b4a2a", helmet: "full", cloth: "#39424d", leather: "#3b2a1e", metal: "#8e949a", bulk: 1.12 }),
  },
  {
    id: "mira", n: 8, arena: "iron_courtyard", first: "Mira", nickname: "Twin Fang", last: "Sol",
    style: "DUAL BLADE", blurb: "Fast chains of cuts. Block the first, parry the second, punish the third.",
    weapon: "dual", armor: "light", hp: 95, damageMul: 0.95, tempo: 1.3, moveMul: 1.04,
    ai: ai({ reaction: 0.38, aggression: 0.62, blockRate: 0.25, parryRate: 0.05, dodgeRate: 0.3, counterRate: 0.45, kickRate: 0.05, distance: 2.4, strafe: 0.8, turn: 8.5, patience: 1.3, combos: [["L", "L", "L"], ["L", "L"], ["L", "H"]] }),
    look: L({ skin: "#8d5a3b", hair: "long", hairColor: "#0f0b09", helmet: "none", cloth: "#5a2a5e", leather: "#3a2718", accent: "#d8d0c0" }),
  },
  {
    id: "brannoc", n: 9, arena: "iron_courtyard", first: "Brannoc", nickname: "Splitter", last: "Hale",
    style: "AXE FIGHTER", blurb: "Every swing is a heavy. Dodge, then make him regret his stamina bar.",
    weapon: "axe", armor: "balanced", hp: 115, damageMul: 0.95, tempo: 1.35, moveMul: 0.93,
    ai: ai({ reaction: 0.4, aggression: 0.52, blockRate: 0.35, parryRate: 0.03, dodgeRate: 0.05, counterRate: 0.4, kickRate: 0.2, distance: 2.3, strafe: 0.45, turn: 6.5, patience: 1.8, combos: [["H"], ["L", "H"], ["L", "L"]] }),
    look: L({ skin: "#d19a78", hair: "mohawk", hairColor: "#8c3b1c", beard: true, helmet: "none", cloth: "#5c3b1e", leather: "#3a2718", bulk: 1.1 }),
  },
  {
    id: "severin", n: 10, arena: "iron_courtyard", first: "Severin", nickname: "The Iron Warden", last: "Kael", champion: true,
    style: "COURTYARD CHAMPION", blurb: "Keeper of the Courtyard. Parries often, punishes everything.",
    weapon: "sword", armor: "balanced", hp: 125, damageMul: 1.0, tempo: 1.25, moveMul: 1.0,
    ai: ai({ reaction: 0.34, aggression: 0.55, blockRate: 0.5, parryRate: 0.18, dodgeRate: 0.12, counterRate: 0.6, kickRate: 0.2, distance: 2.4, strafe: 0.6, turn: 8.5, patience: 1.4, combos: [["L", "L"], ["L", "L", "L"], ["L", "H"], ["H"]] }),
    look: L({ skin: "#b88464", hair: "short", hairColor: "#4a4a4a", beard: true, helmet: "crest", crest: "#2f4d7a", cloth: "#2a3d5c", metal: "#b8bcc2", accent: "#c0c6cc" }),
  },

  /* ------------------------------------------------------------ SUN TEMPLE */
  {
    id: "tamsin", n: 11, arena: "sun_temple", first: "Tamsin", nickname: "Sunspear", last: "Aru",
    style: "SPEARMAN", blurb: "Uses the columns to keep her distance. Force her into the open.",
    weapon: "spear", armor: "light", hp: 115, damageMul: 1.0, tempo: 1.25, moveMul: 1.02,
    ai: ai({ reaction: 0.34, aggression: 0.5, blockRate: 0.4, parryRate: 0.12, dodgeRate: 0.22, counterRate: 0.5, distance: 3.0, strafe: 0.7, turn: 8.5, patience: 1.4, combos: [["L", "L"], ["L"], ["H"], ["L", "H"]] }),
    look: L({ skin: "#7a4a30", hair: "braid", hairColor: "#0e0a08", helmet: "cap", cloth: "#b8862d", leather: "#6b4a2a", metal: "#d6b56a", accent: "#e8c35a" }),
  },
  {
    id: "okon", n: 12, arena: "sun_temple", first: "Okon", nickname: "Bronze Bull", last: "Idris",
    style: "HEAVY WARRIOR", blurb: "Charges in with heavy chops and shrugs off light cuts.",
    weapon: "axe", armor: "heavy", hp: 140, damageMul: 1.0, tempo: 1.3, moveMul: 0.92,
    ai: ai({ reaction: 0.36, aggression: 0.6, blockRate: 0.4, parryRate: 0.06, dodgeRate: 0.02, counterRate: 0.45, kickRate: 0.25, distance: 2.2, strafe: 0.4, turn: 7, patience: 1.5, combos: [["H"], ["L", "H"], ["L", "L", "H"]] }),
    look: L({ skin: "#6b412a", hair: "bald", beard: false, helmet: "brim", cloth: "#8a5a1e", leather: "#4a3322", metal: "#c49a55", build: 1.06, bulk: 1.18 }),
  },
  {
    id: "selene", n: 13, arena: "sun_temple", first: "Selene", nickname: "Mirage", last: "Doros",
    style: "DUAL BLADE", blurb: "Dodges on reaction. Bait the dodge, then strike where she lands.",
    weapon: "dual", armor: "light", hp: 110, damageMul: 1.05, tempo: 1.2, moveMul: 1.06,
    ai: ai({ reaction: 0.3, aggression: 0.6, blockRate: 0.25, parryRate: 0.1, dodgeRate: 0.4, counterRate: 0.55, kickRate: 0.1, distance: 2.5, strafe: 0.85, turn: 9.5, patience: 1.2, combos: [["L", "L", "L"], ["L", "L", "H"], ["L", "L"]] }),
    look: L({ skin: "#e6b995", hair: "long", hairColor: "#d9b068", helmet: "none", cloth: "#c96b2c", leather: "#5a3d27", accent: "#f2e1b0" }),
  },
  {
    id: "hadrik", n: 14, arena: "sun_temple", first: "Hadrik", nickname: "Temple Gate", last: "Vane",
    style: "SHIELD GUARD", blurb: "A walking gate. Parries light attacks — mix kicks and heavies.",
    weapon: "sword_shield", armor: "heavy", hp: 145, damageMul: 1.0, tempo: 1.25, moveMul: 0.92,
    ai: ai({ reaction: 0.32, aggression: 0.42, blockRate: 0.7, parryRate: 0.22, dodgeRate: 0, counterRate: 0.6, kickRate: 0.2, distance: 2.2, strafe: 0.4, turn: 8, patience: 1.7, guardUp: 0.7, combos: [["L", "L"], ["L", "H"], ["K", "H"]] }),
    look: L({ skin: "#a06d4b", hair: "short", hairColor: "#1b1410", beard: true, helmet: "full", cloth: "#9b6a22", metal: "#caa35c", accent: "#f0c24a", bulk: 1.1 }),
  },
  {
    id: "amara", n: 15, arena: "sun_temple", first: "Amara", nickname: "Sun's Chosen", last: "Keth", champion: true,
    style: "TEMPLE CHAMPION", blurb: "The temple's champion reads you as well as you read her.",
    weapon: "sword_shield", armor: "balanced", hp: 150, damageMul: 1.1, tempo: 1.15, moveMul: 1.02,
    ai: ai({ reaction: 0.28, aggression: 0.58, blockRate: 0.5, parryRate: 0.28, dodgeRate: 0.15, counterRate: 0.7, kickRate: 0.25, distance: 2.35, strafe: 0.65, turn: 9.5, patience: 1.2, combos: [["L", "L", "L"], ["L", "L", "H"], ["K", "H"], ["H"]] }),
    look: L({ skin: "#8a5436", hair: "bun", hairColor: "#140c08", helmet: "crest", crest: "#f0c24a", cloth: "#b5301f", metal: "#d9b86a", accent: "#f0c24a" }),
  },

  /* ------------------------------------------------------------ NIGHT COLOSSEUM */
  {
    id: "corvin", n: 16, arena: "night_colosseum", first: "Corvin", nickname: "Nightcrow", last: "Ashe",
    style: "SWORDSMAN", blurb: "Fast sword, faster feet. Fights best in the dark between the fire bowls.",
    weapon: "sword", armor: "light", hp: 140, damageMul: 1.1, tempo: 1.15, moveMul: 1.06,
    ai: ai({ reaction: 0.28, aggression: 0.62, blockRate: 0.45, parryRate: 0.25, dodgeRate: 0.3, counterRate: 0.65, kickRate: 0.15, distance: 2.4, strafe: 0.8, turn: 10, patience: 1.1, combos: [["L", "L", "L"], ["L", "L", "H"], ["L", "H"]] }),
    look: L({ skin: "#d6a684", hair: "long", hairColor: "#0b0908", helmet: "none", cloth: "#1f1f2a", leather: "#2a1e16", metal: "#7d8088", accent: "#8a8fa0" }),
  },
  {
    id: "yrsa", n: 17, arena: "night_colosseum", first: "Yrsa", nickname: "Wolfspear", last: "Brandt",
    style: "SPEARMAN", blurb: "Lunging spear thrusts from outside your reach. Parry the lunge.",
    weapon: "spear", armor: "balanced", hp: 150, damageMul: 1.1, tempo: 1.15, moveMul: 1.02,
    ai: ai({ reaction: 0.27, aggression: 0.58, blockRate: 0.45, parryRate: 0.25, dodgeRate: 0.25, counterRate: 0.65, distance: 3.0, strafe: 0.7, turn: 9.5, patience: 1.2, combos: [["L", "L"], ["H"], ["L", "H"], ["L", "L", "L"]] }),
    look: L({ skin: "#f0c8a8", hair: "braid", hairColor: "#b8b0a2", helmet: "cap", cloth: "#4b5a3a", leather: "#3a2718", metal: "#8f969c" }),
  },
  {
    id: "garruk", n: 18, arena: "night_colosseum", first: "Garruk", nickname: "Grave Axe", last: "Thorne",
    style: "AXE FIGHTER", blurb: "Relentless heavy pressure. Your stamina bar is his real target.",
    weapon: "axe", armor: "heavy", hp: 170, damageMul: 1.15, tempo: 1.2, moveMul: 0.95,
    ai: ai({ reaction: 0.3, aggression: 0.7, blockRate: 0.45, parryRate: 0.12, dodgeRate: 0.05, counterRate: 0.6, kickRate: 0.3, distance: 2.2, strafe: 0.5, turn: 8.5, patience: 1.1, combos: [["H"], ["L", "H"], ["K", "H"], ["L", "L", "H"]] }),
    look: L({ skin: "#8a5d44", hair: "shaggy", hairColor: "#2a211a", beard: true, helmet: "full", cloth: "#3a1f1f", leather: "#2a1e16", metal: "#6d6f73", bulk: 1.2, build: 1.05 }),
  },
  {
    id: "nyx", n: 19, arena: "night_colosseum", first: "Nyx", nickname: "Moonblade", last: "Varela",
    style: "DUAL BLADE", blurb: "Blinding chains and perfect dodges. Patience is your only shield.",
    weapon: "dual", armor: "light", hp: 150, damageMul: 1.15, tempo: 1.1, moveMul: 1.08,
    ai: ai({ reaction: 0.25, aggression: 0.68, blockRate: 0.35, parryRate: 0.25, dodgeRate: 0.4, counterRate: 0.7, kickRate: 0.15, distance: 2.5, strafe: 0.9, turn: 11, patience: 1.0, combos: [["L", "L", "L"], ["L", "L", "H"], ["K", "L", "L"]] }),
    look: L({ skin: "#5e3a26", hair: "mohawk", hairColor: "#dcdcdc", helmet: "none", cloth: "#2a2a4a", leather: "#1f1712", accent: "#b9c4ff" }),
  },
  {
    id: "valerius", n: 20, arena: "night_colosseum", first: "Valerius", nickname: "The Ember King", last: "Dray", champion: true,
    style: "COLOSSEUM CHAMPION", blurb: "Undefeated under the moon. Parries, counters and never panics.",
    weapon: "sword_shield", armor: "heavy", hp: 180, damageMul: 1.2, tempo: 1.1, moveMul: 1.0,
    ai: ai({ reaction: 0.24, aggression: 0.6, blockRate: 0.55, parryRate: 0.35, dodgeRate: 0.12, counterRate: 0.75, kickRate: 0.3, distance: 2.35, strafe: 0.65, turn: 10.5, patience: 1.1, guardUp: 0.3, combos: [["L", "L", "L"], ["L", "L", "H"], ["K", "H"], ["L", "H"]] }),
    look: L({ skin: "#c28c68", hair: "short", hairColor: "#3a1a0e", beard: true, helmet: "crest", crest: "#e0582a", cloth: "#5a1414", metal: "#b08d57", accent: "#ff9a3c" }),
  },

  /* ------------------------------------------------------------ ARENA OF LEGENDS */
  {
    id: "isolde", n: 21, arena: "legends", first: "Isolde", nickname: "The Silver Thorn", last: "Marek",
    style: "SWORDSMAN", blurb: "A duelist's duelist. Every exchange is a question — answer it right.",
    weapon: "sword", armor: "balanced", hp: 170, damageMul: 1.2, tempo: 1.05, moveMul: 1.05,
    ai: ai({ reaction: 0.23, aggression: 0.62, blockRate: 0.5, parryRate: 0.35, dodgeRate: 0.25, counterRate: 0.75, kickRate: 0.2, distance: 2.4, strafe: 0.8, turn: 11, patience: 1.0, combos: [["L", "L", "L"], ["L", "L", "H"], ["L", "H"], ["K", "L"]] }),
    look: L({ skin: "#f0c9a6", hair: "long", hairColor: "#e0dcd2", helmet: "none", cloth: "#d9d9e0", leather: "#4a3a2e", metal: "#dfe3e8", accent: "#bfc8d6" }),
  },
  {
    id: "tor", n: 22, arena: "legends", first: "Tor", nickname: "Mountain", last: "Galdr",
    style: "HEAVY WARRIOR", blurb: "The biggest man you have ever fought. His guard breaks guards.",
    weapon: "axe", armor: "heavy", hp: 200, damageMul: 1.25, tempo: 1.12, moveMul: 0.95,
    ai: ai({ reaction: 0.26, aggression: 0.66, blockRate: 0.5, parryRate: 0.2, dodgeRate: 0.05, counterRate: 0.7, kickRate: 0.35, distance: 2.25, strafe: 0.5, turn: 9, patience: 1.1, combos: [["H"], ["L", "H"], ["K", "H"], ["L", "L", "H"]] }),
    look: L({ skin: "#e3b692", hair: "shaggy", hairColor: "#b8662a", beard: true, helmet: "brim", cloth: "#3d4a2a", metal: "#7b7e82", build: 1.1, bulk: 1.25 }),
  },
  {
    id: "zahra", n: 23, arena: "legends", first: "Zahra", nickname: "Desert Wind", last: "Emeri",
    style: "SPEARMAN", blurb: "A spear that seems to be everywhere at once. Parry, step in, punish.",
    weapon: "spear", armor: "light", hp: 175, damageMul: 1.2, tempo: 1.05, moveMul: 1.08,
    ai: ai({ reaction: 0.22, aggression: 0.62, blockRate: 0.45, parryRate: 0.35, dodgeRate: 0.35, counterRate: 0.75, kickRate: 0.15, distance: 3.0, strafe: 0.85, turn: 11, patience: 1.0, combos: [["L", "L", "L"], ["L", "H"], ["H"], ["L", "L", "H"]] }),
    look: L({ skin: "#9a6242", hair: "bun", hairColor: "#140c08", helmet: "cap", cloth: "#d8b16a", leather: "#6b4a2a", metal: "#d6b56a", accent: "#2f8a8a" }),
  },
  {
    id: "kestrel", n: 24, arena: "legends", first: "Kestrel", nickname: "Twin Storm", last: "Aldane",
    style: "DUAL BLADE", blurb: "The fastest hands in the empire. Only perfect defence survives.",
    weapon: "dual", armor: "balanced", hp: 175, damageMul: 1.25, tempo: 1.02, moveMul: 1.1,
    ai: ai({ reaction: 0.21, aggression: 0.72, blockRate: 0.4, parryRate: 0.35, dodgeRate: 0.4, counterRate: 0.8, kickRate: 0.2, distance: 2.5, strafe: 0.9, turn: 12, patience: 0.9, combos: [["L", "L", "L"], ["L", "L", "H"], ["K", "L", "L"], ["L", "H"]] }),
    look: L({ skin: "#c99672", hair: "mohawk", hairColor: "#141414", beard: true, helmet: "none", cloth: "#1f4a4a", leather: "#2a1e16", accent: "#5fd0c0" }),
  },
  {
    id: "aurelian", n: 25, arena: "legends", first: "Aurelian", nickname: "The Unbroken", last: "Sol", champion: true, final: true,
    style: "GRAND CHAMPION", blurb: "Twenty years undefeated. Everything you have learned — all of it, at once.",
    weapon: "sword_shield", armor: "heavy", hp: 220, damageMul: 1.3, tempo: 1.0, moveMul: 1.04,
    ai: ai({ reaction: 0.2, aggression: 0.66, blockRate: 0.55, parryRate: 0.42, dodgeRate: 0.2, counterRate: 0.85, kickRate: 0.35, distance: 2.35, strafe: 0.75, turn: 12, patience: 0.95, guardUp: 0.25, combos: [["L", "L", "L"], ["L", "L", "H"], ["K", "H"], ["L", "H"], ["H"]] }),
    look: L({ skin: "#b27b58", hair: "short", hairColor: "#d8d4cc", beard: true, helmet: "crest", crest: "#f3d27a", cloth: "#f0ead8", leather: "#5a3d27", metal: "#e0c27a", accent: "#f3d27a", build: 1.03 }),
  },
];

export const enemyById = (id) => ENEMIES.find((e) => e.id === id) || null;
export const displayName = (e) => `${e.first.toUpperCase()} "${e.nickname.toUpperCase()}" ${e.last.toUpperCase()}`;

/** Training sparring partner — readable, defensive, never lethal. */
export const SPARRING = {
  id: "sparring", n: 0, arena: "training", first: "Old", nickname: "Rudis", last: "Doctore",
  style: "TRAINER", blurb: "", weapon: "sword_shield", armor: "balanced", hp: 9999, damageMul: 0.35, tempo: 1.7, moveMul: 0.85, recoveryMul: 1.3,
  ai: ai({ reaction: 0.5, aggression: 0.45, blockRate: 0.45, parryRate: 0.0, dodgeRate: 0.1, counterRate: 0.1, kickRate: 0, turn: 5, patience: 2.0, combos: [["L"], ["L", "L"], ["H"]] }),
  look: L({ skin: "#a87a5a", hair: "bald", beard: true, hairColor: "#9a948c", helmet: "none", cloth: "#3d5a2a", leather: "#4a3322" }),
};
