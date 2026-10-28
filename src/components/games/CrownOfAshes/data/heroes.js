/**
 * The four playable heroes: base stats and growth, their resource, attack
 * sets (timings drive both the simulation and the animation scrub), the
 * three hotbar abilities and a 12-node skill tree each (3 branches × 4).
 *
 * Move fields: dur (s), hit (s into the move when damage applies), mult
 * (× attack power), arc (radians, centred on facing), range (m), st
 * (stamina cost), lunge (m moved forward during the move), stagger
 * (poise damage), clip / clipLen (animation and the part of it to play).
 */

export const LEVEL_CAP = 15;
export const xpToNext = (L) => Math.round(110 + (L - 1) * 70 + (L - 1) ** 2 * 9);

const MELEE_LIGHT_KNIGHT = [
  { dur: 0.56, hit: 0.24, mult: 1.0, arc: 2.0, range: 2.5, st: 12, lunge: 0.7, stagger: 18, clip: "SlashA", clipLen: 0.43 },
  { dur: 0.6, hit: 0.27, mult: 1.08, arc: 2.1, range: 2.5, st: 12, lunge: 0.7, stagger: 18, clip: "SlashB", clipLen: 0.53 },
  { dur: 0.95, hit: 0.5, mult: 1.6, arc: 2.5, range: 2.7, st: 18, lunge: 1.1, stagger: 40, clip: "SlashC", clipLen: 1.1, finisher: true },
];
const MELEE_LIGHT_ROGUE = [
  { dur: 0.36, hit: 0.15, mult: 0.72, arc: 1.6, range: 2.0, st: 7, lunge: 0.6, stagger: 10, clip: "SlashA", clipLen: 0.43 },
  { dur: 0.38, hit: 0.16, mult: 0.76, arc: 1.6, range: 2.0, st: 7, lunge: 0.6, stagger: 10, clip: "SlashB", clipLen: 0.53 },
  { dur: 0.4, hit: 0.18, mult: 0.8, arc: 1.4, range: 2.0, st: 7, lunge: 0.5, stagger: 12, clip: "LJab", clipLen: 0.7 },
  { dur: 0.55, hit: 0.24, mult: 1.15, arc: 1.8, range: 2.1, st: 9, lunge: 0.9, stagger: 24, clip: "Hook", clipLen: 0.47, finisher: true },
];

export const HEROES = {
  knight: {
    id: "knight",
    name: "Northern Knight",
    tag: "Sword & shield · defender",
    blurb: "A sworn blade of the north. Holds the line with a heater shield, punishes with heavy steel and refuses to fall.",
    strengths: ["Highest health and armour", "Shield block + perfect parry", "Stuns and crowd control"],
    weaknesses: ["Short reach, no ranged attack", "Slowest dodge", "Builds Resolve by fighting"],
    weapon: "sword",
    shield: true,
    resource: { id: "resolve", name: "Resolve", max: 100, regen: -1.5, start: 30, color: "#e8b04a" },
    base: { hp: 160, st: 110, atk: 15, armor: 28, crit: 0.05, critMult: 1.6, speed: 1.0 },
    growth: { hp: 15, st: 2, atk: 1.7, armor: 2.6 },
    look: {
      m: { body: "m", hair: "Hair_SimpleParted", beard: true, hairColor: "#3a2414", tunic: "#2b4a7a", hose: "#34363c", gambeson: "#2b4a7a", garments: ["gambeson", "hose"], trim: "#c9a050", armor: { chest: "plate", shoulders: "plate", arms: "gauntlets", legs: "greaves", head: "nasal" }, cape: "#1f3560" },
      f: { body: "f", hair: "Hair_Buns", hairColor: "#c8a060", tunic: "#2b4a7a", hose: "#34363c", gambeson: "#2b4a7a", garments: ["gambeson", "hose"], trim: "#c9a050", armor: { chest: "plate", shoulders: "plate", arms: "gauntlets", legs: "greaves" }, cape: "#1f3560" },
    },
    moves: {
      light: MELEE_LIGHT_KNIGHT,
      heavy: { dur: 1.15, hit: 0.62, mult: 2.5, arc: 2.4, range: 2.8, st: 26, lunge: 1.4, stagger: 70, clip: "BladeHeavy", clipLen: 1.4, charge: 0.4 },
      block: { kind: "shield", reduce: 0.85, arc: 2.4, stPer: 0.55, parry: 0.22 },
      dodge: { st: 22, dur: 0.62, dist: 4.6, iframes: 0.38 },
    },
    abilities: { q: "shieldBash", r: "warCry", f: "whirlwind" },
    tree: [
      { id: "ironSkin", branch: "Bulwark", name: "Iron Skin", desc: "+8% armour per rank.", ranks: 3, tier: 1 },
      { id: "steadfast", branch: "Bulwark", name: "Steadfast", desc: "Blocking costs 20% less stamina per rank.", ranks: 2, tier: 2, req: "ironSkin" },
      { id: "shieldWall", branch: "Bulwark", name: "Shield Wall", desc: "Parry window +0.1 s; a perfect parry restores 15 Resolve.", ranks: 1, tier: 3, req: "steadfast" },
      { id: "unbreakable", branch: "Bulwark", name: "Unbreakable", desc: "Once per battle, a killing blow leaves you at 1 HP and heals 25% over 3 s.", ranks: 1, tier: 4, req: "shieldWall" },
      { id: "keenEdge", branch: "Blademaster", name: "Keen Edge", desc: "+6% melee damage per rank.", ranks: 3, tier: 1 },
      { id: "momentum", branch: "Blademaster", name: "Momentum", desc: "The third combo strike deals +25% and always staggers.", ranks: 1, tier: 2, req: "keenEdge" },
      { id: "whirlwind", branch: "Blademaster", name: "Whirlwind", desc: "Unlocks Whirlwind (F): a spinning double cleave around you.", ranks: 1, tier: 3, req: "momentum", unlocks: "f" },
      { id: "executioner", branch: "Blademaster", name: "Executioner", desc: "+40% damage to enemies below 30% health.", ranks: 1, tier: 4, req: "whirlwind" },
      { id: "vigor", branch: "Warden", name: "Vigor", desc: "+10% maximum health per rank.", ranks: 3, tier: 1 },
      { id: "rally", branch: "Warden", name: "Rallying Cry", desc: "War Cry also heals you for 20% of maximum health.", ranks: 1, tier: 2, req: "vigor" },
      { id: "bashMastery", branch: "Warden", name: "Bash Mastery", desc: "Shield Bash cooldown −30% and stuns 1 s longer.", ranks: 1, tier: 3, req: "rally" },
      { id: "secondWind", branch: "Warden", name: "Second Wind", desc: "Regenerate 2% health per second outside combat.", ranks: 1, tier: 4, req: "bashMastery" },
    ],
  },
  archer: {
    id: "archer",
    name: "Royal Archer",
    tag: "Longbow · precision & traps",
    blurb: "A ranger of the royal forests. Draws a heavy longbow, lays snares and rains arrows on anything that comes close.",
    strengths: ["Long-range charged shots", "Traps and area volleys", "Fast and agile"],
    weaknesses: ["Low health", "No shield — must dodge", "Weak at point-blank"],
    weapon: "bow",
    resource: { id: "focus", name: "Focus", max: 100, regen: 11, start: 100, color: "#7fd06a" },
    base: { hp: 115, st: 115, atk: 16, armor: 14, crit: 0.12, critMult: 1.8, speed: 1.06 },
    growth: { hp: 10, st: 3, atk: 1.9, armor: 1.4 },
    look: {
      f: { body: "f", hair: "Hair_Long", hairColor: "#7a3a1a", tunic: "#3f5a2a", hose: "#4a3a2a", garments: ["tunic", "hose"], trim: "#b89a50", armor: { chest: "leather", shoulders: "leather", arms: "bracers", legs: "leather" }, cape: "#2e4420", quiver: true },
      m: { body: "m", hair: "Hair_Buzzed", beard: true, hairColor: "#5a3a1a", tunic: "#3f5a2a", hose: "#4a3a2a", garments: ["tunic", "hose"], trim: "#b89a50", armor: { chest: "leather", shoulders: "leather", arms: "bracers", legs: "leather", head: "hood" }, hood: "#2e4420", cape: "#2e4420", quiver: true },
    },
    moves: {
      shot: { st: 5, draw: 0.95, minDraw: 0.12, tapMult: 0.95, fullMult: 2.3, speedTap: 52, speedFull: 85, cooldown: 0.32 },
      block: null,
      dodge: { st: 15, dur: 0.5, dist: 5.2, iframes: 0.36 },
    },
    abilities: { q: "snare", r: "volley", f: "piercing" },
    tree: [
      { id: "steadyAim", branch: "Marksman", name: "Steady Aim", desc: "+8% bow damage per rank.", ranks: 3, tier: 1 },
      { id: "quickDraw", branch: "Marksman", name: "Quick Draw", desc: "Draw 20% faster per rank.", ranks: 2, tier: 2, req: "steadyAim" },
      { id: "piercing", branch: "Marksman", name: "Piercing Shot", desc: "Unlocks Piercing Shot (F): a full-power arrow that passes through foes.", ranks: 1, tier: 3, req: "quickDraw", unlocks: "f" },
      { id: "headhunter", branch: "Marksman", name: "Headhunter", desc: "Fully drawn shots gain +20% critical chance.", ranks: 1, tier: 4, req: "piercing" },
      { id: "barbed", branch: "Trapper", name: "Barbed Snare", desc: "Snare damage +60% and roots 1 s longer.", ranks: 1, tier: 1 },
      { id: "twinTraps", branch: "Trapper", name: "Twin Traps", desc: "Keep two snares armed at once; Snare cooldown −25%.", ranks: 1, tier: 2, req: "barbed" },
      { id: "volleyPlus", branch: "Trapper", name: "Arrow Storm", desc: "Volley radius +30% and two extra waves.", ranks: 1, tier: 3, req: "twinTraps" },
      { id: "huntersMark", branch: "Trapper", name: "Hunter's Mark", desc: "Enemies you hit take +15% damage for 6 s.", ranks: 1, tier: 4, req: "volleyPlus" },
      { id: "fleetFoot", branch: "Ranger", name: "Fleet Foot", desc: "+6% movement speed per rank.", ranks: 2, tier: 1 },
      { id: "evasion", branch: "Ranger", name: "Evasion", desc: "Dodging costs 25% less and grants +0.1 s invulnerability.", ranks: 1, tier: 2, req: "fleetFoot" },
      { id: "endurance", branch: "Ranger", name: "Endurance", desc: "+15 stamina and +8% health per rank.", ranks: 2, tier: 3, req: "evasion" },
      { id: "survivalist", branch: "Ranger", name: "Survivalist", desc: "Potions are 40% more effective.", ranks: 1, tier: 4, req: "endurance" },
    ],
  },
  mage: {
    id: "mage",
    name: "Flame Mage",
    tag: "Staff · elemental fire",
    blurb: "A scholar of the Ember arts. Hurls firebolts and fireballs, shields with a ward of living flame and calls down meteors.",
    strengths: ["Area damage and burning", "Long range", "Mana ward absorbs hits"],
    weaknesses: ["Lowest health and armour", "Mana-hungry", "Slow to start fights"],
    weapon: "staff",
    resource: { id: "mana", name: "Mana", max: 120, regen: 7, start: 120, color: "#5aa0ff" },
    base: { hp: 100, st: 95, atk: 17, armor: 10, crit: 0.08, critMult: 1.7, speed: 1.0 },
    growth: { hp: 9, st: 2, atk: 2.1, armor: 1.2 },
    look: {
      m: { body: "m", hair: "Hair_Long", beard: true, hairColor: "#1a1410", tunic: "#6a1c1c", robe: "#6a1c1c", trim: "#e0a040", garments: ["tunic"], skirt: true, runes: true, armor: { head: "circlet", arms: "bracers" }, cape: "#3a0e0e" },
      f: { body: "f", hair: "Hair_Long", hairColor: "#e8e0d0", tunic: "#6a1c1c", robe: "#6a1c1c", trim: "#e0a040", garments: ["tunic"], skirt: true, runes: true, armor: { head: "circlet", arms: "bracers" }, cape: "#3a0e0e" },
    },
    moves: {
      bolt: { cost: 7, mult: 1.0, speed: 34, splash: 1.2, cooldown: 0.42 },
      fireball: { cost: 24, mult: 2.4, speed: 26, splash: 3.6, charge: 0.65 },
      block: { kind: "ward", reduce: 0.8, arc: 3.2, manaPer: 0.7 },
      dodge: { st: 20, dur: 0.55, dist: 4.4, iframes: 0.34 },
    },
    abilities: { q: "nova", r: "meteor", f: "blink" },
    tree: [
      { id: "kindling", branch: "Pyromancy", name: "Kindling", desc: "+8% fire damage per rank.", ranks: 3, tier: 1 },
      { id: "combustion", branch: "Pyromancy", name: "Combustion", desc: "Burning deals double damage.", ranks: 1, tier: 2, req: "kindling" },
      { id: "meteorPlus", branch: "Pyromancy", name: "Starfall", desc: "Meteor radius +30% and damage +25%.", ranks: 1, tier: 3, req: "combustion" },
      { id: "inferno", branch: "Pyromancy", name: "Inferno", desc: "Fireballs leave burning ground for 3 s.", ranks: 1, tier: 4, req: "meteorPlus" },
      { id: "deepWell", branch: "Arcana", name: "Deep Well", desc: "+20 maximum mana per rank.", ranks: 3, tier: 1 },
      { id: "flow", branch: "Arcana", name: "Flow", desc: "+25% mana regeneration per rank.", ranks: 2, tier: 2, req: "deepWell" },
      { id: "blink", branch: "Arcana", name: "Blink", desc: "Unlocks Blink (F): teleport 8 m, untouchable for a moment.", ranks: 1, tier: 3, req: "flow", unlocks: "f" },
      { id: "overcharge", branch: "Arcana", name: "Overcharge", desc: "Charged Fireballs cost 40% less mana.", ranks: 1, tier: 4, req: "blink" },
      { id: "wardcraft", branch: "Wardcraft", name: "Ember Ward", desc: "Your ward absorbs damage 20% more efficiently per rank.", ranks: 2, tier: 1 },
      { id: "vitality", branch: "Wardcraft", name: "Vitality", desc: "+10% maximum health per rank.", ranks: 3, tier: 2, req: "wardcraft" },
      { id: "novaPlus", branch: "Wardcraft", name: "Scorching Nova", desc: "Flame Nova also stuns for 1 s.", ranks: 1, tier: 3, req: "vitality" },
      { id: "phoenix", branch: "Wardcraft", name: "Phoenix", desc: "Once per battle, rise from a killing blow with 40% health.", ranks: 1, tier: 4, req: "novaPlus" },
    ],
  },
  rogue: {
    id: "rogue",
    name: "Shadow Rogue",
    tag: "Twin daggers · stealth & evasion",
    blurb: "A knife from the Free Marches' shadows. Strikes fast from behind, vanishes into smoke and is never where the blow lands.",
    strengths: ["Fastest attacks and dodges", "Massive backstab and stealth damage", "Teleport and vanish"],
    weaknesses: ["Light armour", "Short reach", "Parry instead of a true block"],
    weapon: "dagger",
    offhand: "dagger",
    resource: { id: "energy", name: "Energy", max: 100, regen: 16, start: 100, color: "#c070ff" },
    base: { hp: 115, st: 135, atk: 14, armor: 15, crit: 0.15, critMult: 1.9, speed: 1.1 },
    growth: { hp: 11, st: 4, atk: 1.6, armor: 1.5 },
    look: {
      f: { body: "f", hair: "Hair_Buns", hairColor: "#141014", tunic: "#2a2630", hose: "#1e1c22", gambeson: "#2a2630", garments: ["gambeson", "hose"], trim: "#7a5aa0", armor: { chest: "leather", shoulders: "leather", arms: "bracers", legs: "leather", head: "hood" }, hood: "#1c1a22", leather: "#2a2020" },
      m: { body: "m", hair: "Hair_Buzzed", hairColor: "#141014", tunic: "#2a2630", hose: "#1e1c22", gambeson: "#2a2630", garments: ["gambeson", "hose"], trim: "#7a5aa0", armor: { chest: "leather", shoulders: "leather", arms: "bracers", legs: "leather", head: "hood" }, hood: "#1c1a22", leather: "#2a2020" },
    },
    moves: {
      light: MELEE_LIGHT_ROGUE,
      heavy: { dur: 0.75, hit: 0.32, mult: 2.1, arc: 1.2, range: 2.4, st: 20, lunge: 3.6, stagger: 40, clip: "BladeDash", clipLen: 1.0, charge: 0.35, bleed: true },
      block: { kind: "parry", reduce: 0.5, arc: 2.2, stPer: 0.5, parry: 0.28 },
      dodge: { st: 12, dur: 0.48, dist: 5.6, iframes: 0.4 },
    },
    abilities: { q: "shadowstep", r: "vanish", f: "fan" },
    tree: [
      { id: "sharpened", branch: "Assassin", name: "Sharpened", desc: "+7% damage per rank.", ranks: 3, tier: 1 },
      { id: "backstab", branch: "Assassin", name: "Backstab", desc: "Attacks from behind deal an extra ×1 damage.", ranks: 1, tier: 2, req: "sharpened" },
      { id: "fan", branch: "Assassin", name: "Fan of Knives", desc: "Unlocks Fan of Knives (F): five thrown blades in a cone.", ranks: 1, tier: 3, req: "backstab", unlocks: "f" },
      { id: "deathMark", branch: "Assassin", name: "Death Mark", desc: "Critical hits deal +25% damage.", ranks: 1, tier: 4, req: "fan" },
      { id: "lightStep", branch: "Shadow", name: "Light Step", desc: "+6% movement speed per rank.", ranks: 2, tier: 1 },
      { id: "vanishPlus", branch: "Shadow", name: "Long Shadow", desc: "Vanish lasts 3 s longer.", ranks: 1, tier: 2, req: "lightStep" },
      { id: "stepPlus", branch: "Shadow", name: "Quick Shadow", desc: "Shadowstep cooldown −35%.", ranks: 1, tier: 3, req: "vanishPlus" },
      { id: "ambush", branch: "Shadow", name: "Ambush", desc: "Attacks from stealth also stun for 2 s.", ranks: 1, tier: 4, req: "stepPlus" },
      { id: "riposte", branch: "Duelist", name: "Riposte", desc: "Parry window +0.1 s; a perfect parry makes your next hit critical.", ranks: 1, tier: 1 },
      { id: "agility", branch: "Duelist", name: "Agility", desc: "+15 stamina and +8% health per rank.", ranks: 2, tier: 2, req: "riposte" },
      { id: "bleed", branch: "Duelist", name: "Serrated", desc: "Lunges make enemies bleed for 40% extra damage over 4 s.", ranks: 1, tier: 3, req: "agility" },
      { id: "slippery", branch: "Duelist", name: "Slippery", desc: "Dodging costs 30% less and grants +0.1 s invulnerability.", ranks: 1, tier: 4, req: "bleed" },
    ],
  },
};

/**
 * Abilities. cost = resource; cd = seconds; the simulation (engine/player.js)
 * implements each `kind`.
 */
export const ABILITIES = {
  shieldBash: { name: "Shield Bash", key: "Q", cost: 22, cd: 7, kind: "bash", desc: "Charge 4 m behind your shield, stunning the first foe for 2 s.", dur: 0.6, clip: "ShieldBash", clipLen: 0.83, icon: "bash" },
  warCry: { name: "War Cry", key: "R", cost: 40, cd: 22, kind: "warcry", desc: "+30% damage and −30% damage taken for 8 s; nearby foes falter.", dur: 0.8, clip: "Cast", clipLen: 0.5, icon: "cry" },
  whirlwind: { name: "Whirlwind", key: "F", cost: 50, cd: 12, kind: "whirl", desc: "Spin through everything around you twice.", dur: 1.0, clip: "SlashC", clipLen: 1.4, icon: "whirl" },
  snare: { name: "Snare Trap", key: "Q", cost: 25, cd: 9, kind: "trap", desc: "Arm a snare at your feet that roots and wounds the first foe to step in.", dur: 0.5, clip: "Interact", clipLen: 0.9, icon: "trap" },
  volley: { name: "Volley", key: "R", cost: 45, cd: 16, kind: "volley", desc: "Arrows rain on the aim point for 2 s.", dur: 0.6, clip: "Throw", clipLen: 0.9, icon: "volley" },
  piercing: { name: "Piercing Shot", key: "F", cost: 35, cd: 10, kind: "pierce", desc: "Loose a full-power arrow that passes through every foe in line.", dur: 0.55, clip: "Shoot", clipLen: 0.6, icon: "pierce" },
  nova: { name: "Flame Nova", key: "Q", cost: 30, cd: 8, kind: "nova", desc: "A ring of fire bursts from you, burning and throwing back foes within 5 m.", dur: 0.6, clip: "Cast", clipLen: 0.5, icon: "nova" },
  meteor: { name: "Meteor", key: "R", cost: 55, cd: 18, kind: "meteor", desc: "Call a meteor onto the aim point after a heartbeat.", dur: 0.8, clip: "Cast", clipLen: 0.5, icon: "meteor" },
  blink: { name: "Blink", key: "F", cost: 20, cd: 5, kind: "blink", desc: "Teleport 8 m in the direction you move.", dur: 0.2, clip: null, icon: "blink" },
  shadowstep: { name: "Shadowstep", key: "Q", cost: 30, cd: 8, kind: "step", desc: "Appear behind the nearest foe ahead of you; your next hit is critical.", dur: 0.25, clip: null, icon: "step" },
  vanish: { name: "Vanish", key: "R", cost: 45, cd: 20, kind: "vanish", desc: "Melt into shadow for 6 s. Foes lose you; your first strike deals triple damage.", dur: 0.3, clip: "Consume", clipLen: 0.6, icon: "vanish" },
  fan: { name: "Fan of Knives", key: "F", cost: 35, cd: 9, kind: "fan", desc: "Throw five blades in a cone.", dur: 0.45, clip: "Throw", clipLen: 0.8, icon: "fan" },
};
