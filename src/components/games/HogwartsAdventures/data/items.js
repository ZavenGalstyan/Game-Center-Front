/**
 * Items: potions (consumable), equipment (wand / robe / charm — each hero
 * equips their own from the shared trunk), key items and collectibles.
 * All names and effects are original to this game.
 */
export const ITEMS = {
  // potions
  wiggenweld: { name: "Wiggenweld Potion", kind: "potion", icon: "potion", color: "#5fd08a", desc: "Restores 50% of your health.", price: 30 },
  invigoration: { name: "Invigoration Draught", kind: "potion", icon: "potion", color: "#5aa8ff", desc: "Restores all of your magic.", price: 25 },
  edurus: { name: "Edurus Potion", kind: "potion", icon: "potion", color: "#c9a24a", desc: "Take 35% less damage for 25 seconds.", price: 45 },
  // wands
  wand_basic: { name: "Student's Wand", kind: "equip", slot: "wand", icon: "wand", desc: "Holly and phoenix feather. Reliable.", mods: {} },
  wand_yew: { name: "Yew Duelling Wand", kind: "equip", slot: "wand", icon: "wand", rarity: "rare", desc: "+15% spell damage.", mods: { dmg: 0.15 } },
  wand_vine: { name: "Vinewood Wand", kind: "equip", slot: "wand", icon: "wand", rarity: "rare", desc: "Spells recover 15% faster.", mods: { cdr: 0.15 } },
  wand_ash: { name: "Ancient Ash Wand", kind: "equip", slot: "wand", icon: "wand", rarity: "epic", desc: "+20% spell damage, +10% magic.", mods: { dmg: 0.2, mana: 0.1 } },
  // robes
  robe_school: { name: "School Robes", kind: "equip", slot: "robe", icon: "robe", desc: "Standard issue.", mods: {} },
  robe_lined: { name: "Silk-Lined Robes", kind: "equip", slot: "robe", icon: "robe", rarity: "rare", desc: "+20 maximum health.", mods: { hp: 20 } },
  robe_dragon: { name: "Dragonhide Duelling Robes", kind: "equip", slot: "robe", icon: "robe", rarity: "epic", desc: "+35 maximum health, take 10% less damage.", mods: { hp: 35, armor: 0.1 } },
  // charms
  charm_moon: { name: "Moonstone Charm", kind: "equip", slot: "charm", icon: "charm", rarity: "rare", desc: "+35% magic regeneration.", mods: { regen: 0.35 } },
  charm_feather: { name: "Phoenix-Feather Charm", kind: "equip", slot: "charm", icon: "charm", rarity: "epic", desc: "Defeating a foe restores 6% health.", mods: { leech: 0.06 } },
  charm_aegis: { name: "Aegis Shard", kind: "equip", slot: "charm", icon: "charm", rarity: "legendary", desc: "+25 maximum health, +15% magic, Protego lasts 30% longer.", mods: { hp: 25, mana: 0.15, shield: 0.3 } },
  // key items
  founders_book: { name: "Wards of the Founders", kind: "key", icon: "book", desc: "A heavy, very old book about the protective wards beneath the castle." },
  dark_mask: { name: "Silver Mask", kind: "key", icon: "mask", desc: "Dropped at the camp in the forest. Cold to the touch." },
  sigil_lion: { name: "Founders' Sigil — Courage", kind: "key", icon: "sigil", color: "#d9a628", desc: "One of three keys to the Ancient Door." },
  sigil_eagle: { name: "Founders' Sigil — Wit", kind: "key", icon: "sigil", color: "#4a7ad9", desc: "One of three keys to the Ancient Door." },
  sigil_badger: { name: "Founders' Sigil — Loyalty", kind: "key", icon: "sigil", color: "#e0c040", desc: "One of three keys to the Ancient Door." },
  aegis_stone: { name: "The Aegis Stone", kind: "key", icon: "gem", desc: "The heart of the castle's oldest ward. It hums against your palm." },
  // collectibles
  page: { name: "Founders' Page", kind: "collect", icon: "page", desc: "A loose page of castle lore. Collect them all." },
};
export const EQUIP_SLOTS = ["wand", "robe", "charm"];
export const RARITY_COLOR = { common: "#c9c2b0", rare: "#62a8ff", epic: "#c27dff", legendary: "#ffb340" };
/** Snape's potion cabinet. */
export const SHOP = ["wiggenweld", "invigoration", "edurus"];
