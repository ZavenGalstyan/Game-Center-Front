/**
 * The four playable heroes. Each has its own level, XP, skill points and
 * talents; spells, quests and inventory are shared by the party.
 *
 * Looks are original stylised takes on the characters' clothing silhouettes
 * (school robes, house colours, hair) built in code — no film likenesses.
 */
export const HEROES = {
  harry: {
    name: "Harry Potter",
    short: "Harry",
    house: "gryffindor",
    role: "Balanced duellist",
    blurb: "Quick on the draw and steady under pressure. His Disarming Charm hits harder and holds longer.",
    hp: 110,
    mana: 100,
    regen: 6,
    speed: 1,
    passive: { id: "disarmer", name: "Signature Disarm", desc: "Expelliarmus deals +30% damage and disarms for longer." },
    q: { id: "volley", name: "Stupefy Volley", desc: "Three stunning bolts in quick succession.", cost: 18, cd: 9, icon: "stun" },
    r: { id: "maxima", name: "Protego Maxima", desc: "A wide dome for 4s that reflects every spell that strikes it.", cost: 25, cd: 18, icon: "shield" },
    look: { body: "m", hair: "Hair_SimpleParted", hairColor: "#1b1410", glasses: "round", scar: true, trim: "#b3262c", trim2: "#d9a628", scarf: ["#8e1b22", "#d9a628"], robe: "#18161c", tunic: "#e8e2d4", hose: "#2b2b30", skinTint: "#f0d7c4" },
  },
  hermione: {
    name: "Hermione Granger",
    short: "Hermione",
    house: "gryffindor",
    role: "Spell control",
    blurb: "Knows the counter to everything. Cheaper spells, a deeper well of magic, and crowd-control that lifts whole groups.",
    hp: 95,
    mana: 125,
    regen: 8,
    speed: 1,
    passive: { id: "scholar", name: "Top of the Class", desc: "All spells cost 20% less magic." },
    q: { id: "liftwave", name: "Levioso Wave", desc: "Lift every foe in a cone in front of you for 3s.", cost: 22, cd: 12, icon: "lift" },
    r: { id: "gather", name: "Accio Gather", desc: "Drag every foe around you into a heap and stun them.", cost: 24, cd: 16, icon: "pull" },
    look: { body: "f", hair: "Hair_Long", hairColor: "#5a3a22", hairScale: 1.18, trim: "#b3262c", trim2: "#d9a628", scarf: ["#8e1b22", "#d9a628"], robe: "#1a181e", tunic: "#ece6da", hose: "#3a3a40", skinTint: "#f2dccb" },
  },
  ron: {
    name: "Ron Weasley",
    short: "Ron",
    house: "gryffindor",
    role: "Defensive support",
    blurb: "Tougher than he looks and impossible to rattle in a scrap. Big shields and a stunning ground-slam.",
    hp: 140,
    mana: 90,
    regen: 6,
    speed: 0.97,
    passive: { id: "stalwart", name: "Stalwart", desc: "+30% health; Protego lasts 50% longer." },
    q: { id: "slam", name: "Stunning Slam", desc: "Slam the ground: damages and stuns every foe within 5m.", cost: 18, cd: 10, icon: "nova" },
    r: { id: "totalum", name: "Protego Totalum", desc: "A 6s dome that blocks all spells and slowly heals anyone inside.", cost: 26, cd: 20, icon: "dome" },
    look: { body: "m", hair: "Hair_SimpleParted", hairColor: "#c4521c", scale: 1.06, trim: "#b3262c", trim2: "#d9a628", scarf: ["#7a1820", "#c99a2a"], robe: "#1c1a1e", tunic: "#d8c8a8", hose: "#3a3530", skinTint: "#f6dccb" },
  },
  draco: {
    name: "Draco Malfoy",
    short: "Draco",
    house: "slytherin",
    role: "Fast duellist",
    blurb: "Sharp, fast and slippery. Short cooldowns, critical hits, a shadow-step and a curse-breaking counter.",
    hp: 100,
    mana: 105,
    regen: 7,
    speed: 1.05,
    passive: { id: "swift", name: "Duelling Instinct", desc: "Spells recover 15% faster; 15% chance to land a critical hit." },
    q: { id: "shadowstep", name: "Shadow Step", desc: "Blink 7m, untouchable, leaving a stunning burst behind.", cost: 12, cd: 6, icon: "vanish" },
    r: { id: "counter", name: "Counter-Curse", desc: "For 1.2s, the next spell aimed at you rebounds doubled and stuns its caster.", cost: 15, cd: 12, icon: "counter" },
    look: { body: "m", hair: "Hair_SimpleParted", hairColor: "#e8e2c8", trim: "#1f6e3e", trim2: "#c0c6cc", scarf: ["#1a4e2e", "#b8bec4"], robe: "#141416", tunic: "#2a2a2e", hose: "#1e1e22", skinTint: "#f4e2d6" },
  },
};
export const HERO_IDS = ["harry", "hermione", "ron", "draco"];

/** Per-hero talents bought with skill points (each 3 ranks). */
export const TALENTS = {
  vitality: { name: "Vitality", desc: "+10% maximum health per rank.", max: 3, icon: "heart" },
  wellspring: { name: "Wellspring", desc: "+10% maximum magic per rank.", max: 3, icon: "drop" },
  focus: { name: "Focus", desc: "+20% magic regeneration per rank.", max: 3, icon: "star" },
  q: { name: "Signature I", desc: "Your Q spell: +25% effect, -10% cooldown per rank.", max: 3, icon: "q" },
  r: { name: "Signature II", desc: "Your R spell: +25% effect, -10% cooldown per rank.", max: 3, icon: "r" },
};
export const LEVEL_CAP = 12;
export const xpToNext = (L) => 120 + (L - 1) * 70;
