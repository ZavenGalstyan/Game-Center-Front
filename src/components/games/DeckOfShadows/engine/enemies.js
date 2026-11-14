/**
 * Monster definitions: stats, move sets and AI hints. `model` picks the 3D
 * creature (render/monsters.js). Moves drive both the mechanics and the
 * animation/effect choice (`anim`, `fx`).
 *
 * Move fields: dmg, hits, block, str, weak, vuln, bleed (on the player),
 * heal, drain (heal unblocked damage), dread (shuffle Dread curses into the
 * player's discard), ritual, regen, thorns, cleanse (self).
 * AI: `w` weight, `max` = most times in a row, `hpBelow` = only below that
 * fraction of max HP, `every` = forced every N turns (counted from 1),
 * `first` = opening move.
 */
export const ENEMIES = {
  skeleton: {
    name: "Cursed Skeleton",
    model: "skeleton",
    hp: 40,
    undead: true,
    lore: "A soldier's bones, bound to its rusted blade by a grave-curse.",
    moves: [
      { id: "slash", name: "Rusted Slash", dmg: 7, w: 3, max: 2, anim: "slash", fx: "slash" },
      { id: "rattle", name: "Bone Rattle", block: 6, str: 1, w: 2, max: 1, anim: "buff", fx: "dust" },
      { id: "thrust", name: "Twin Thrust", dmg: 4, hits: 2, w: 2, max: 1, anim: "slash2", fx: "slash" },
    ],
  },
  ghoul: {
    name: "Grave Ghoul",
    model: "ghoul",
    hp: 48,
    undead: true,
    lore: "It digs where the fresh graves are. It is always hungry.",
    moves: [
      { id: "rend", name: "Rend", dmg: 4, hits: 2, bleed: 2, w: 3, max: 2, anim: "claw", fx: "claw" },
      { id: "lunge", name: "Gnawing Lunge", dmg: 11, w: 2, max: 1, anim: "heavy", fx: "claw" },
      { id: "devour", name: "Devour Carrion", heal: 8, str: 1, w: 2, max: 1, hpBelow: 0.75, anim: "feed", fx: "blood" },
    ],
  },
  wolf: {
    name: "Shadow Wolf",
    model: "wolf",
    hp: 44,
    lore: "Born of the dark between the trees. Its eyes are the only light it carries.",
    moves: [
      { id: "bite", name: "Savage Bite", dmg: 8, vuln: 1, w: 3, max: 2, anim: "bite", fx: "claw" },
      { id: "howl", name: "Moon Howl", str: 2, block: 4, w: 1, max: 1, anim: "howl", fx: "howl" },
      { id: "pounce", name: "Pounce", dmg: 13, w: 2, max: 1, anim: "pounce", fx: "claw" },
    ],
  },
  knight: {
    name: "Haunted Knight",
    model: "knight",
    hp: 72,
    undead: true,
    lore: "Its oath outlived its flesh. The armour still marches.",
    moves: [
      { id: "cleave", name: "Grave Cleave", dmg: 12, w: 3, max: 2, anim: "heavy", fx: "slash" },
      { id: "wall", name: "Shield Wall", block: 14, w: 2, max: 1, anim: "block", fx: "shield" },
      { id: "crush", name: "Crushing Blow", dmg: 17, weak: 1, w: 1, max: 1, anim: "heavy2", fx: "quake" },
    ],
  },
  witch: {
    name: "Blood Witch",
    model: "witch",
    hp: 64,
    lore: "She bargained her heart for power, and drinks from others to keep it beating.",
    moves: [
      { id: "bolt", name: "Blood Bolt", dmg: 10, w: 3, max: 2, anim: "cast", fx: "bolt" },
      { id: "hex", name: "Withering Hex", weak: 2, vuln: 1, w: 2, max: 1, anim: "cast2", fx: "hex" },
      { id: "drain", name: "Crimson Siphon", dmg: 8, drain: 1, w: 2, max: 1, hpBelow: 0.8, anim: "cast", fx: "drain" },
      { id: "curse", name: "Curse of Dread", dread: 2, block: 6, w: 1, max: 1, anim: "cast2", fx: "hex" },
    ],
  },
  guardian: {
    name: "Crypt Guardian",
    model: "guardian",
    hp: 150,
    boss: true,
    lore: "Carved to guard the dead forever, it has never once been asked to stop.",
    moves: [
      { id: "slam", name: "Tomb Slam", dmg: 15, w: 3, max: 2, anim: "heavy", fx: "quake", first: true },
      { id: "skin", name: "Stone Skin", block: 18, thorns: 2, w: 2, max: 1, anim: "block", fx: "shield" },
      { id: "quake", name: "Runic Quake", dmg: 7, hits: 2, weak: 1, w: 2, max: 1, anim: "heavy2", fx: "quake" },
    ],
    phase2: {
      at: 0.5,
      text: "The Crypt Guardian's runes blaze awake!",
      gain: { str: 3, block: 15 },
      moves: [
        { id: "slam", name: "Tomb Slam", dmg: 16, w: 3, max: 2, anim: "heavy", fx: "quake" },
        { id: "quake", name: "Runic Quake", dmg: 7, hits: 3, weak: 1, w: 2, max: 1, anim: "heavy2", fx: "quake" },
        { id: "seal", name: "Seal of the Dead", block: 14, dread: 1, w: 1, max: 1, anim: "block", fx: "hex" },
      ],
    },
  },
  reaper: {
    name: "Soul Reaper",
    model: "reaper",
    hp: 175,
    boss: true,
    undead: true,
    lore: "It harvests what the grave refuses. Its scythe has never missed a season.",
    moves: [
      { id: "reap", name: "Reaping Arc", dmg: 16, w: 3, max: 2, anim: "heavy", fx: "scythe", first: true },
      { id: "harvest", name: "Soul Harvest", dmg: 10, drain: 1, w: 2, max: 1, anim: "slash", fx: "drain" },
      { id: "mark", name: "Mark of Death", vuln: 2, dread: 1, w: 1, max: 1, anim: "cast", fx: "hex" },
      { id: "storm", name: "Scythe Storm", dmg: 5, hits: 3, w: 2, max: 1, anim: "slash2", fx: "scythe" },
    ],
    phase2: {
      at: 0.5,
      text: "The Soul Reaper drinks the souls it has gathered!",
      gain: { str: 2, regen: 4 },
      moves: [
        { id: "reap", name: "Reaping Arc", dmg: 17, w: 3, max: 2, anim: "heavy", fx: "scythe" },
        { id: "storm", name: "Scythe Storm", dmg: 6, hits: 3, w: 2, max: 1, anim: "slash2", fx: "scythe" },
        { id: "harvest", name: "Soul Harvest", dmg: 12, drain: 1, w: 2, max: 1, anim: "slash", fx: "drain" },
      ],
    },
  },
  demon: {
    name: "Ancient Demon",
    model: "demon",
    hp: 230,
    boss: true,
    lore: "Older than the cathedral built to seal it. The seal has cracked.",
    moves: [
      { id: "hellfire", name: "Hellfire Torrent", dmg: 19, w: 3, max: 2, anim: "cast", fx: "fire", first: true },
      { id: "rake", name: "Infernal Rake", dmg: 7, hits: 3, bleed: 2, w: 2, max: 1, anim: "claw", fx: "claw" },
      { id: "rage", name: "Ancient Rage", str: 3, block: 12, w: 1, max: 1, anim: "roar", fx: "roar" },
      { id: "brand", name: "Brimstone Brand", dmg: 10, weak: 2, w: 2, max: 1, anim: "heavy", fx: "fire" },
    ],
    phase2: {
      at: 0.45,
      text: "The Ancient Demon spreads its wings — the arena burns!",
      gain: { str: 2, ritual: 1 },
      moves: [
        { id: "hellfire", name: "Hellfire Torrent", dmg: 20, w: 3, max: 2, anim: "cast", fx: "fire" },
        { id: "rake", name: "Infernal Rake", dmg: 7, hits: 3, bleed: 3, w: 2, max: 1, anim: "claw", fx: "claw" },
        { id: "wings", name: "Wing Tempest", block: 16, weak: 1, w: 1, max: 1, anim: "roar", fx: "roar" },
      ],
    },
  },
  lord: {
    name: "Final Shadow Lord",
    model: "lord",
    hp: 320,
    boss: true,
    lore: "The one who dealt the first card of shadows. Every monster you slew answered to him.",
    moves: [
      { id: "edge", name: "Edge of Night", dmg: 18, w: 3, max: 2, anim: "heavy", fx: "shadow", first: true },
      { id: "eclipse", name: "Total Eclipse", weak: 2, vuln: 2, block: 12, w: 1, max: 1, anim: "cast", fx: "hex" },
      { id: "volley", name: "Shadow Volley", dmg: 6, hits: 3, w: 2, max: 1, anim: "cast2", fx: "bolt" },
      { id: "decree", name: "Decree of Dread", dread: 2, str: 2, w: 1, max: 1, anim: "roar", fx: "roar" },
    ],
    phase2: {
      at: 0.6,
      text: "The Shadow Lord draws the darkness into his blade!",
      gain: { str: 2, block: 20 },
      moves: [
        { id: "edge", name: "Edge of Night", dmg: 20, w: 3, max: 2, anim: "heavy", fx: "shadow" },
        { id: "volley", name: "Shadow Volley", dmg: 7, hits: 3, w: 2, max: 1, anim: "cast2", fx: "bolt" },
        { id: "drain", name: "Abyssal Siphon", dmg: 12, drain: 1, w: 2, max: 1, anim: "slash", fx: "drain" },
      ],
    },
    phase3: {
      at: 0.25,
      text: "The Shadow Lord abandons his crown — only fury remains!",
      gain: { str: 3, ritual: 1, cleanse: true },
      moves: [
        { id: "edge", name: "Edge of Night", dmg: 21, w: 3, max: 1, anim: "heavy", fx: "shadow" },
        { id: "oblivion", name: "Oblivion", dmg: 9, hits: 3, w: 2, max: 1, anim: "heavy2", fx: "doom" },
        { id: "drain", name: "Abyssal Siphon", dmg: 13, drain: 1, w: 1, max: 1, anim: "slash", fx: "drain" },
      ],
    },
  },
};
