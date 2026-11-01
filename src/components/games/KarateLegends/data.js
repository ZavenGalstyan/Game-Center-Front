/**
 * Karate Legends data: AI styles, the opponent roster, arenas, the 40-battle
 * ladder and the upgrade tracks. Everything here is plain data so the engine,
 * the UI and tools/simTest.mjs all read the same tables.
 */

/** Reusable AI profiles. Numbers are 0..1 chances/biases unless noted; the
 *  per-battle `skill` scales reaction time and block/aggression on top. */
export const STYLES = {
  balanced: { label: "Balanced", aggression: 0.55, block: 0.45, kickBias: 0.35, range: 86, jump: 0.07, retreat: 0.25, combo: 0.5, special: 0.5, think: 0.28, speed: 1, hp: 1, dmg: 1, kbResist: 0 },
  aggressive: { label: "Aggressive", aggression: 0.85, block: 0.2, kickBias: 0.4, range: 72, jump: 0.1, retreat: 0.08, combo: 0.75, special: 0.7, think: 0.23, speed: 1.05, hp: 0.95, dmg: 1.05, kbResist: 0 },
  defensive: { label: "Defensive", aggression: 0.35, block: 0.72, kickBias: 0.5, range: 104, jump: 0.03, retreat: 0.42, combo: 0.4, special: 0.4, think: 0.27, speed: 0.95, hp: 1.1, dmg: 0.95, kbResist: 0.15 },
  fast: { label: "Fast", aggression: 0.65, block: 0.38, kickBias: 0.3, range: 80, jump: 0.18, retreat: 0.32, combo: 0.7, special: 0.5, think: 0.19, speed: 1.3, hp: 0.85, dmg: 0.85, kbResist: 0 },
  heavy: { label: "Heavy", aggression: 0.55, block: 0.32, kickBias: 0.6, range: 96, jump: 0.02, retreat: 0.1, combo: 0.3, special: 0.5, think: 0.34, speed: 0.78, hp: 1.3, dmg: 1.3, kbResist: 0.5 },
  boss: { label: "Boss", aggression: 0.7, block: 0.5, kickBias: 0.45, range: 86, jump: 0.09, retreat: 0.25, combo: 0.65, special: 0.75, think: 0.22, speed: 1.08, hp: 1.15, dmg: 1.05, kbResist: 0.3 },
};

/** Look of a fighter: gi, belt, skin, hair, headband. */
export const PLAYER_LOOK = { name: "Kenji", gi: "#f4f1ea", trim: "#d9d2c3", belt: "#1c1c1c", skin: "#f1c27d", hair: "#2b1d14", band: "#e63946", hairStyle: "spiky" };

export const OPPONENTS = {
  milo: { name: "Milo", style: "balanced", gi: "#7fb7e8", trim: "#5a93c6", belt: "#f6d32d", skin: "#ffd9b3", hair: "#a0522d", band: null, hairStyle: "short" },
  rina: { name: "Rina", style: "fast", gi: "#ffb3c7", trim: "#e88aa5", belt: "#ff8c1a", skin: "#f5cba7", hair: "#1b1b1b", band: "#ffffff", hairStyle: "pony" },
  bruno: { name: "Bruno", style: "heavy", gi: "#8d6e63", trim: "#6d4c41", belt: "#2e7d32", skin: "#c68642", hair: "#1b1b1b", band: null, hairStyle: "bald" },
  tess: { name: "Tess", style: "defensive", gi: "#a5d6a7", trim: "#7cb87f", belt: "#1565c0", skin: "#ffe0bd", hair: "#d4a017", band: "#1565c0", hairStyle: "bun" },
  ozzy: { name: "Ozzy", style: "aggressive", gi: "#ff8a50", trim: "#e0652a", belt: "#6a1b9a", skin: "#e0ac69", hair: "#ff3d00", band: null, hairStyle: "mohawk" },
  sensei: { name: "Sensei Goro", style: "boss", gi: "#37474f", trim: "#263238", belt: "#c62828", skin: "#e8b88a", hair: "#cfd8dc", band: "#c62828", hairStyle: "topknot", boss: true },
  vex: { name: "Vex", style: "fast", gi: "#4dd0e1", trim: "#26a8b8", belt: "#212121", skin: "#8d5524", hair: "#111111", band: "#ffeb3b", hairStyle: "spiky" },
  dana: { name: "Dana", style: "aggressive", gi: "#ef5350", trim: "#c62828", belt: "#212121", skin: "#ffdbac", hair: "#5d4037", band: null, hairStyle: "pony" },
  hugo: { name: "Hugo", style: "heavy", gi: "#546e7a", trim: "#37474f", belt: "#ff6f00", skin: "#f1c27d", hair: "#3e2723", band: "#ff6f00", hairStyle: "short" },
  ling: { name: "Ling", style: "defensive", gi: "#fff59d", trim: "#e6d96a", belt: "#4e342e", skin: "#f3d2a2", hair: "#111111", band: null, hairStyle: "bun" },
  rex: { name: "Rex Steel", style: "boss", gi: "#212121", trim: "#000000", belt: "#ffd600", skin: "#d39b6a", hair: "#9e9e9e", band: "#ffd600", hairStyle: "mohawk", boss: true },
  aiko: { name: "Aiko", style: "balanced", gi: "#ce93d8", trim: "#a96bb5", belt: "#1b5e20", skin: "#ffe0bd", hair: "#4a148c", band: "#ffffff", hairStyle: "pony" },
  tor: { name: "Tor", style: "heavy", gi: "#a1887f", trim: "#7b5e55", belt: "#0d47a1", skin: "#e0ac69", hair: "#e65100", band: null, hairStyle: "bald" },
  kai: { name: "Kai", style: "fast", gi: "#80cbc4", trim: "#4f9d95", belt: "#bf360c", skin: "#c68642", hair: "#212121", band: "#bf360c", hairStyle: "spiky" },
  monk: { name: "Brother Sol", style: "defensive", gi: "#ffb74d", trim: "#e09530", belt: "#5d4037", skin: "#e8b88a", hair: "#e8b88a", band: null, hairStyle: "bald" },
  yama: { name: "Master Yama", style: "boss", gi: "#f5f5f5", trim: "#bdbdbd", belt: "#212121", skin: "#f1c27d", hair: "#eeeeee", band: "#1a237e", hairStyle: "topknot", boss: true },
  zane: { name: "Zane", style: "aggressive", gi: "#3949ab", trim: "#283593", belt: "#ffeb3b", skin: "#ffdbac", hair: "#ffeb3b", band: null, hairStyle: "mohawk" },
  nova: { name: "Nova", style: "balanced", gi: "#26c6da", trim: "#00acc1", belt: "#880e4f", skin: "#8d5524", hair: "#f8bbd0", band: "#880e4f", hairStyle: "pony" },
  grim: { name: "Grimm", style: "heavy", gi: "#424242", trim: "#212121", belt: "#b71c1c", skin: "#d1a17a", hair: "#212121", band: "#b71c1c", hairStyle: "short" },
  ryu: { name: "Shiro", style: "fast", gi: "#e0e0e0", trim: "#9e9e9e", belt: "#4a148c", skin: "#f3d2a2", hair: "#fafafa", band: "#4a148c", hairStyle: "spiky" },
  dragon: { name: "The Crimson Dragon", style: "boss", gi: "#b71c1c", trim: "#7f0000", belt: "#ffd700", skin: "#e0ac69", hair: "#1b1b1b", band: "#ffd700", hairStyle: "topknot", boss: true },
};

export const ARENAS = [
  { id: "dojo", name: "Dojo" },
  { id: "rooftop", name: "City Rooftop" },
  { id: "temple", name: "Mountain Temple" },
  { id: "grand", name: "Grand Arena" },
];

export const TOURNAMENTS = [
  { id: 0, name: "Beginner Dojo", arena: 0, color: "#e9a23b", blurb: "Learn the basics against local students." },
  { id: 1, name: "City Championship", arena: 1, color: "#3d8bfd", blurb: "Rooftop bouts against the city's best." },
  { id: 2, name: "Mountain Masters", arena: 2, color: "#3fa34d", blurb: "Ancient styles high above the clouds." },
  { id: 3, name: "Grand Tournament", arena: 3, color: "#d63a3a", blurb: "Only one fighter becomes the Legend." },
];

// Nine regular opponents per tournament, then the boss in slot 10.
const LADDER = [
  ["milo", "rina", "bruno", "tess", "ozzy", "milo", "rina", "tess", "bruno", "sensei"],
  ["vex", "dana", "hugo", "ling", "aiko", "ozzy", "vex", "hugo", "dana", "rex"],
  ["kai", "tor", "monk", "aiko", "ling", "kai", "tor", "dana", "monk", "yama"],
  ["zane", "nova", "grim", "ryu", "kai", "zane", "grim", "nova", "ryu", "dragon"],
];

/** The 40 battles, ids 1..40. `level` 0..1 drives stat scaling and AI skill. */
export const BATTLES = LADDER.flatMap((row, t) =>
  row.map((opp, k) => {
    const id = t * 10 + k + 1;
    const level = (id - 1) / 39;
    const boss = k === 9;
    return {
      id,
      tournament: t,
      index: k + 1,
      boss,
      opponent: opp,
      arena: TOURNAMENTS[t].arena,
      roundsToWin: boss ? 2 : 1,
      skill: Math.min(0.95, 0.22 + 0.62 * level + (boss ? 0.04 : 0)),
      hpMul: 0.8 + 0.55 * level,
      dmgMul: 0.75 + 0.5 * level,
      reward: Math.round((30 + 6 * id) * (boss ? 2.5 : 1)),
    };
  }),
);

export const PLAYER_BASE = { hp: 100, speed: 1 };

/** Simple capped upgrades: level 0..MAX, cost = COSTS[level]. */
export const UPGRADE_MAX = 5;
export const UPGRADE_COSTS = [60, 120, 200, 300, 450];
export const UPGRADES = [
  { id: "hp", name: "Health", desc: "+12 max health per level", per: 12 },
  { id: "atk", name: "Attack", desc: "+8% damage per level", per: 0.08 },
  { id: "energy", name: "Special Energy", desc: "+15% energy gain per level", per: 0.15 },
];

/** Player combat stats from upgrade levels. */
export function playerStats(upgrades = {}) {
  return {
    maxHp: PLAYER_BASE.hp + UPGRADES[0].per * (upgrades.hp || 0),
    dmgMul: 1 + UPGRADES[1].per * (upgrades.atk || 0),
    energyMul: 1 + UPGRADES[2].per * (upgrades.energy || 0),
    speed: 1,
    kbResist: 0,
  };
}

/** Opponent combat stats for a battle. */
export function opponentStats(battle) {
  const style = STYLES[OPPONENTS[battle.opponent].style];
  return {
    maxHp: Math.round(100 * style.hp * battle.hpMul),
    dmgMul: style.dmg * battle.dmgMul,
    energyMul: 0.85,
    speed: style.speed,
    kbResist: style.kbResist,
  };
}
