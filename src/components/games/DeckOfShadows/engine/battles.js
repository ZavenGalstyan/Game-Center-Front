/**
 * The 20-battle campaign. Each battle picks an environment (render/
 * environments.js), a monster, stat multipliers and modifiers, and what the
 * first victory unlocks. Difficulty climbs through hpMul/dmgMul and modifiers.
 *
 * Modifiers (engine/combat.js):
 *   fog       you draw 1 card fewer each turn
 *   bloodmoon the monster starts with +2 Strength
 *   armored   the monster starts with 12 Block
 *   frenzy    the monster gains 1 Strength every turn (Dark Ritual 1)
 *   curse     your deck starts with 2 Dread
 *   hallowed  you heal 2 HP at the start of each turn
 *   ember     the monster starts with 3 Thorns
 */
export const ENVS = {
  graveyard: { name: "Haunted Graveyard" },
  forest: { name: "Dark Forest" },
  crypt: { name: "Ancient Crypt" },
  castle: { name: "Abandoned Castle" },
  dungeon: { name: "Underground Dungeon" },
  cathedral: { name: "Gothic Cathedral" },
  arena: { name: "Blood Moon Arena" },
  throne: { name: "Shadow Lord's Throne Room" },
};

export const MODS = {
  fog: { name: "Thick Fog", desc: "You draw 1 card fewer each turn." },
  bloodmoon: { name: "Blood Moon", desc: "The monster starts with 2 Strength." },
  armored: { name: "Armored", desc: "The monster starts with 12 Block." },
  frenzy: { name: "Frenzy", desc: "The monster gains 1 Strength every turn." },
  curse: { name: "Cursed Ground", desc: "Your deck starts with 2 Dread." },
  hallowed: { name: "Hallowed Ground", desc: "You heal 2 HP at the start of each turn." },
  ember: { name: "Ember Hide", desc: "The monster starts with 3 Thorns." },
};

export const BATTLES = [
  { id: 1, env: "graveyard", enemy: "skeleton", hpMul: 1.53, dmgMul: 1.53, mods: [], unlock: "wraith_step", xp: 40, shards: 30, tutorial: true, title: "The Restless Dead" },
  { id: 2, env: "graveyard", enemy: "ghoul", hpMul: 1.27, dmgMul: 1.27, mods: ["hallowed"], unlock: "hex_weakness", xp: 45, shards: 32, title: "Hunger Beneath the Stones" },
  { id: 3, env: "forest", enemy: "wolf", hpMul: 1.76, dmgMul: 1.73, mods: [], unlock: "cursed_mark", xp: 50, shards: 34, title: "Eyes Between the Trees" },
  { id: 4, env: "crypt", enemy: "skeleton", hpMul: 2.90, dmgMul: 2.23, mods: ["armored"], unlock: "bone_crusher", xp: 55, shards: 36, title: "The Ossuary Captain", elite: true },
  { id: 5, env: "crypt", enemy: "guardian", hpMul: 0.93, dmgMul: 0.95, mods: [], unlock: "grave_ward", xp: 90, shards: 60, title: "Warden of the Crypt" },
  { id: 6, env: "forest", enemy: "wolf", hpMul: 2.19, dmgMul: 1.83, mods: ["fog"], unlock: "silver_stake", xp: 60, shards: 38, title: "Alpha of the Pack", elite: true },
  { id: 7, env: "castle", enemy: "knight", hpMul: 1.60, dmgMul: 1.66, mods: [], unlock: "bone_armor", xp: 65, shards: 40, title: "The Oath That Would Not Die" },
  { id: 8, env: "graveyard", enemy: "ghoul", hpMul: 2.63, dmgMul: 2.09, mods: ["curse"], unlock: "purify", xp: 70, shards: 42, title: "The Gravedigger's Feast", elite: true },
  { id: 9, env: "dungeon", enemy: "witch", hpMul: 2.19, dmgMul: 2.39, mods: [], unlock: "soul_drain", xp: 75, shards: 45, title: "Blood in the Cells" },
  { id: 10, env: "cathedral", enemy: "reaper", hpMul: 1.16, dmgMul: 1.19, mods: [], unlock: "spectral_blades", xp: 130, shards: 80, title: "Harvest at the Altar" },
  { id: 11, env: "dungeon", enemy: "knight", hpMul: 2.01, dmgMul: 1.77, mods: ["armored"], unlock: "dark_pact", xp: 80, shards: 48, title: "The Jailer in Iron", elite: true },
  { id: 12, env: "cathedral", enemy: "witch", hpMul: 2.75, dmgMul: 2.34, mods: ["fog"], unlock: "rage_fallen", xp: 85, shards: 50, title: "Choir of Blood", elite: true },
  { id: 13, env: "castle", enemy: "skeleton", hpMul: 4.29, dmgMul: 2.80, mods: ["frenzy"], unlock: "hellfire", xp: 90, shards: 52, title: "The Bone Warlord", elite: true },
  { id: 14, env: "arena", enemy: "wolf", hpMul: 3.22, dmgMul: 2.29, mods: ["bloodmoon"], unlock: "eclipse", xp: 95, shards: 55, title: "Howl of the Blood Moon", elite: true },
  { id: 15, env: "arena", enemy: "demon", hpMul: 0.87, dmgMul: 0.89, mods: ["ember"], unlock: "executioner", xp: 170, shards: 100, title: "The Seal Breaks" },
  { id: 16, env: "crypt", enemy: "guardian", hpMul: 1.26, dmgMul: 1.16, mods: ["curse"], unlock: null, xp: 110, shards: 62, title: "The Guardian Reforged", elite: true },
  { id: 17, env: "cathedral", enemy: "reaper", hpMul: 1.21, dmgMul: 1.17, mods: ["fog"], unlock: "doom_ritual", xp: 120, shards: 66, title: "The Second Harvest", elite: true },
  { id: 18, env: "dungeon", enemy: "witch", hpMul: 3.54, dmgMul: 2.34, mods: ["frenzy"], unlock: null, xp: 125, shards: 70, title: "Mother of the Blood Coven", elite: true },
  { id: 19, env: "castle", enemy: "knight", hpMul: 2.84, dmgMul: 1.90, mods: ["armored", "bloodmoon"], unlock: null, xp: 130, shards: 75, title: "Champion of the Fallen King", elite: true },
  { id: 20, env: "throne", enemy: "lord", hpMul: 0.85, dmgMul: 0.86, mods: [], unlock: null, xp: 250, shards: 150, title: "The Final Hand", final: true },
];

export const BATTLE_BY_ID = Object.fromEntries(BATTLES.map((b) => [b.id, b]));
