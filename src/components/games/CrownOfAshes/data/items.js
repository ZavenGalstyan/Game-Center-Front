/**
 * Items, rarities, loot tables and merchants.
 *
 * Equipment slots: weapon · offhand · head · chest · hands · legs · trinket.
 * Weapons and off-hands are class-bound (`for`); armour fits anyone.
 * `look` patches the wearer's appearance (render/characters.js), so gear
 * you equip shows on your hero. Stats: atk, armor, hp, st, res (class
 * resource max), crit (+chance), fire (+fire damage), speed (+move),
 * resistFire (−fire damage taken).
 */

export const RARITY = {
  common: { name: "Common", color: "#c8c4bc", mult: 1 },
  uncommon: { name: "Uncommon", color: "#6fd06a", mult: 1.15 },
  rare: { name: "Rare", color: "#5aa8ff", mult: 1.3 },
  epic: { name: "Epic", color: "#c07aff", mult: 1.5 },
  legendary: { name: "Legendary", color: "#ffa83a", mult: 1.75 },
};

export const SLOTS = ["weapon", "offhand", "head", "chest", "hands", "legs", "trinket"];
export const SLOT_NAMES = { weapon: "Weapon", offhand: "Off-hand", head: "Head", chest: "Chest", hands: "Hands", legs: "Legs", trinket: "Trinket" };

const W = (id, name, cls, kind, rarity, atk, value, desc, extra = {}) => ({ id, name, type: "weapon", slot: "weapon", for: cls, kind, rarity, stats: { atk, ...(extra.stats || {}) }, value, desc, ...extra });
const A = (id, name, slot, rarity, stats, value, desc, look = {}, extra = {}) => ({ id, name, type: "armor", slot, rarity, stats, value, desc, look, ...extra });

export const ITEMS = Object.fromEntries(
  [
    /* ---------------------------------------------------- swords (knight) */
    W("w_rustsword", "Rusted Longsword", "knight", "sword", "common", 4, 8, "Pitted, notched and still sharper than nothing."),
    W("w_longsword", "Warden Longsword", "knight", "sword", "common", 6, 30, "Standard issue of the Northern Wardens: balanced, plain, dependable."),
    W("w_steelblade", "Steel Arming Sword", "knight", "sword", "uncommon", 10, 120, "A smith's honest work — a fuller, a good edge, a leather grip."),
    W("w_frostbrand", "Frostbrand", "knight", "runeblade", "rare", 16, 380, "Quenched in Frostfang snowmelt. Its runes slow whatever it bites.", { stats: { atk: 16 }, effect: "frost" }),
    W("w_ashenblade", "Voss' Ashen Blade", "knight", "flamesword", "rare", 18, 420, "Taken from the captain of Ashfall. It is still warm.", { effect: "burn" }),
    W("w_runeblade", "Runeblade of Wintermere", "knight", "runeblade", "epic", 24, 900, "Carried by the first Wardens. The runes wake when the crown is near.", { stats: { atk: 24, crit: 0.04 } }),
    W("w_dragonfang", "Dragonfang", "knight", "greatsword", "legendary", 32, 2000, "A blade ground from a dragon's tooth. Fire follows its edge.", { effect: "burn", stats: { atk: 32, fire: 0.1 } }),
    /* ---------------------------------------------------- bows (archer) */
    W("w_huntbow", "Hunting Bow", "archer", "bow", "common", 6, 30, "Ash limbs, waxed string. Good for deer and bandits alike."),
    W("w_yewbow", "Yew Longbow", "archer", "bow", "uncommon", 10, 130, "A tall self-bow of northern yew. Draws heavy, flies true."),
    W("w_wrenbow", "Wren's Longbow", "archer", "bow", "rare", 15, 360, "The hunter's own bow, given in thanks. Fletched with grey owl feathers.", { stats: { atk: 15, crit: 0.05 } }),
    W("w_ashbow", "Ashwood Recurve", "archer", "bow", "rare", 17, 420, "A recurve from the burnt groves of Ashfall. Light, fast, cruel."),
    W("w_galebow", "Galewing", "archer", "bow", "epic", 24, 920, "Bound with Warden steel. Arrows from it whistle like a winter wind.", { stats: { atk: 24, crit: 0.06 } }),
    W("w_dragonbow", "Dragonbone Bow", "archer", "bow", "legendary", 32, 2000, "Strung with a dragon's sinew. Its arrows ignite in flight.", { effect: "burn", stats: { atk: 32, fire: 0.1 } }),
    /* ---------------------------------------------------- staves (mage) */
    W("w_oakstaff", "Oak Staff", "mage", "staff", "common", 6, 30, "An apprentice's staff capped with a dull ember stone.", { stats: { atk: 6, res: 0 } }),
    W("w_emberstaff", "Ember Staff", "mage", "staff", "uncommon", 10, 130, "The cap-stone glows like a coal you can hold.", { stats: { atk: 10, res: 10 } }),
    W("w_pyrestaff", "Pyre Rod", "mage", "staff", "rare", 16, 400, "A rod of black iron that hums before every spell.", { stats: { atk: 16, res: 15, fire: 0.05 } }),
    W("w_scepter", "Seraphine's Scepter", "mage", "staff", "epic", 24, 950, "Lent by the Ember Court. Its flame never quite goes out.", { stats: { atk: 24, res: 25, fire: 0.08 } }),
    W("w_pactstaff", "Staff of the Old Pact", "mage", "staff", "legendary", 32, 2000, "Carved from the first king's peace-tree; the dragon's ember sleeps in it.", { stats: { atk: 32, res: 30, fire: 0.12 } }),
    /* ---------------------------------------------------- daggers (rogue) */
    W("w_daggers", "Twin Daggers", "rogue", "dagger", "common", 5, 28, "A matched pair. Quick in, quicker out."),
    W("w_kris", "Marsh Kris", "rogue", "dagger", "uncommon", 9, 120, "Wavy blades from the southern fens."),
    W("w_fangs", "Wolf Fangs", "rogue", "dagger", "rare", 14, 380, "Hooked knives that open long wounds.", { effect: "bleed", stats: { atk: 14, crit: 0.04 } }),
    W("w_nightfall", "Nightfall Blades", "rogue", "dagger", "epic", 22, 920, "Black steel that drinks the light around it.", { stats: { atk: 22, crit: 0.08 } }),
    W("w_dragonclaw", "Dragonclaw Knives", "rogue", "dagger", "legendary", 30, 2000, "Claws worked into hilts. They cut through mail like silk.", { effect: "burn", stats: { atk: 30, crit: 0.08 } }),
    /* ---------------------------------------------------- off-hands */
    { id: "s_buckler", name: "Wooden Heater", type: "offhand", slot: "offhand", for: "knight", kind: "shield", rarity: "common", stats: { armor: 5 }, value: 20, desc: "Planks and rawhide. It will stop a few blows.", shield: { shape: "heater", sigil: "marches", color: "#5a4a32" } },
    { id: "s_warden", name: "Warden Heater", type: "offhand", slot: "offhand", for: "knight", kind: "shield", rarity: "uncommon", stats: { armor: 9 }, value: 90, desc: "Painted with the Snow Tower of the Wardens.", shield: { shape: "heater", sigil: "wardens", color: "#2b4a7a" } },
    { id: "s_kite", name: "Steel Kite Shield", type: "offhand", slot: "offhand", for: "knight", kind: "shield", rarity: "rare", stats: { armor: 15, hp: 15 }, value: 340, desc: "Tall enough to hide behind. Wardens swear by it.", shield: { shape: "kite", sigil: "wardens", color: "#22344e" } },
    { id: "s_aegis", name: "Aegis of Wintermere", type: "offhand", slot: "offhand", for: "knight", kind: "shield", rarity: "epic", stats: { armor: 24, hp: 30, resistFire: 0.15 }, value: 900, desc: "The castle's oldest shield, frost-white and unbroken.", shield: { shape: "kite", sigil: "wardens", color: "#d8e0ea" } },
    { id: "o_quiver", name: "Leather Quiver", type: "offhand", slot: "offhand", for: "archer", kind: "quiver", rarity: "common", stats: { crit: 0.02 }, value: 20, desc: "Thirty arrows and a strap that never quite fits." },
    { id: "o_greyquiver", name: "Greyfang Quiver", type: "offhand", slot: "offhand", for: "archer", kind: "quiver", rarity: "rare", stats: { crit: 0.07, atk: 3 }, value: 320, desc: "Trimmed with the great wolf's fur. Hunters' luck rides with it." },
    { id: "o_tome", name: "Apprentice Grimoire", type: "offhand", slot: "offhand", for: "mage", kind: "tome", rarity: "common", stats: { res: 10 }, value: 25, desc: "Dog-eared notes on the first flame-words." },
    { id: "o_codex", name: "Ember Codex", type: "offhand", slot: "offhand", for: "mage", kind: "tome", rarity: "rare", stats: { res: 30, fire: 0.08 }, value: 380, desc: "A Court codex bound in salamander hide." },
    { id: "o_smoke", name: "Smoke Pouch", type: "offhand", slot: "offhand", for: "rogue", kind: "pouch", rarity: "common", stats: { res: 10 }, value: 25, desc: "Black powder for exits that need to be quick." },
    { id: "o_poison", name: "Nightshade Kit", type: "offhand", slot: "offhand", for: "rogue", kind: "pouch", rarity: "rare", stats: { res: 20, crit: 0.05 }, value: 340, desc: "Vials, needles and a very steady hand." },
    /* ---------------------------------------------------- head */
    A("h_hood", "Traveler's Hood", "head", "common", { armor: 2 }, 12, "Keeps the rain out of your eyes.", { armor: { head: "hood" }, hood: "#4a4032" }),
    A("h_nasal", "Nasal Helm", "head", "uncommon", { armor: 6 }, 70, "A conical helm with a nose guard.", { armor: { head: "nasal" } }),
    A("h_great", "Warden Greathelm", "head", "rare", { armor: 10, hp: 20 }, 300, "A flat-topped helm with a narrow sight.", { armor: { head: "great" } }),
    A("h_circlet", "Ember Circlet", "head", "rare", { armor: 3, res: 15, fire: 0.04 }, 300, "A band of red gold worn by Court magisters.", { armor: { head: "circlet" } }),
    A("h_shadowhood", "Shadow Cowl", "head", "rare", { armor: 4, crit: 0.05 }, 300, "Your face is a rumour under it.", { armor: { head: "hood" }, hood: "#16141a" }),
    /* ---------------------------------------------------- chest */
    A("c_tunic", "Linen Tunic", "chest", "common", { armor: 3 }, 10, "Clean, at least.", { garments: ["tunic", "hose"], armor: { chest: null } }),
    A("c_leather", "Leather Jerkin", "chest", "common", { armor: 6 }, 40, "Boiled leather over wool.", { armor: { chest: "leather" } }),
    A("c_gambeson", "Quilted Gambeson", "chest", "uncommon", { armor: 9, hp: 10 }, 110, "Layers of linen that turn a blade surprisingly well.", { garments: ["gambeson", "hose"], armor: { chest: null } }),
    A("c_mail", "Chain Hauberk", "chest", "uncommon", { armor: 13 }, 160, "Riveted rings to the knee.", { garments: ["gambeson", "hose"], gambeson: "#8a8e96", armor: { chest: null } }),
    A("c_plate", "Warden Plate", "chest", "rare", { armor: 20, hp: 15 }, 420, "Breastplate, backplate and tassets of northern steel.", { armor: { chest: "plate", shoulders: "plate" } }),
    A("c_robe", "Ember Robe", "chest", "rare", { armor: 8, res: 30, fire: 0.1 }, 400, "Red silk sewn with fire-runes.", { skirt: true, garments: ["tunic"], robe: "#6a1c1c", tunic: "#6a1c1c", runes: true, armor: { chest: null } }),
    A("c_shadow", "Shadowweave Leathers", "chest", "rare", { armor: 11, crit: 0.06, speed: 0.04 }, 400, "Soft as a whisper, dark as a cellar.", { armor: { chest: "leather", shoulders: "leather" }, tunic: "#1c1a22", leather: "#1a1418" }),
    A("c_ranger", "Ranger's Brigandine", "chest", "rare", { armor: 13, st: 15 }, 400, "Green-dyed leather over small steel plates.", { armor: { chest: "leather", shoulders: "leather" }, tunic: "#2e4a26" }),
    A("c_winter", "Winterforged Plate", "chest", "epic", { armor: 28, hp: 40, resistFire: 0.1 }, 1100, "Forged in the Hold for the champion of the Wardens.", { armor: { chest: "ornate", shoulders: "plate" }, cape: "#1f3560", tunic: "#2b4a7a" }),
    A("c_pyresilk", "Pyre-silk Regalia", "chest", "epic", { armor: 14, res: 40, fire: 0.15, hp: 20 }, 1100, "Woven by the Ember Court; it smoulders without burning.", { skirt: true, garments: ["tunic"], robe: "#8a1c1c", tunic: "#8a1c1c", runes: true, trim: "#ffb040", cape: "#5a0e0e", armor: { chest: null } }),
    A("c_freeblade", "Freeblade's Brigandine", "chest", "epic", { armor: 20, st: 20, crit: 0.05, speed: 0.04 }, 1100, "The colours of the Free Marches over riveted plates.", { armor: { chest: "leather", shoulders: "fur" }, tunic: "#3f6a3a", cape: "#2a4a26" }),
    A("c_dragonscale", "Dragonscale Mail", "chest", "legendary", { armor: 32, hp: 50, resistFire: 0.3 }, 2400, "Scales from the last dragon of Cinderpeak.", { armor: { chest: "dark", shoulders: "spiked" }, tunic: "#3a1010", darkMetal: "#4a1a14", cape: "#2a0a0a" }),
    /* ---------------------------------------------------- hands / legs */
    A("g_wraps", "Leather Wraps", "hands", "common", { armor: 1 }, 6, "Better than blisters.", { armor: { arms: null } }),
    A("g_bracers", "Hardened Bracers", "hands", "uncommon", { armor: 4 }, 60, "Leather vambraces stiffened with wax.", { armor: { arms: "bracers" } }),
    A("g_gauntlets", "Steel Gauntlets", "hands", "rare", { armor: 7, atk: 2 }, 260, "Articulated fingers, flared cuffs.", { armor: { arms: "gauntlets" } }),
    A("l_boots", "Traveler's Boots", "legs", "common", { armor: 2 }, 10, "Broken in on a hundred roads.", { armor: { legs: null } }),
    A("l_leather", "Leather Leggings", "legs", "uncommon", { armor: 4, speed: 0.02 }, 60, "Padded knees, quiet soles.", { armor: { legs: "leather" } }),
    A("l_greaves", "Iron Greaves", "legs", "uncommon", { armor: 7 }, 90, "Shin plates and knee cops.", { armor: { legs: "greaves" } }),
    A("l_strider", "Striders", "legs", "rare", { armor: 5, speed: 0.06, st: 10 }, 280, "Made for the long road between battles.", { armor: { legs: "leather" } }),
    /* ---------------------------------------------------- trinkets */
    { id: "t_coin", name: "Lucky Silver", type: "trinket", slot: "trinket", rarity: "common", stats: { crit: 0.02 }, value: 20, desc: "A coin with two heads. Somebody lost a bet." },
    { id: "t_wolftooth", name: "Wolftooth Charm", type: "trinket", slot: "trinket", rarity: "uncommon", stats: { atk: 3 }, value: 90, desc: "Hunters wear these for courage." },
    { id: "t_talisman", name: "Ember Talisman", type: "trinket", slot: "trinket", rarity: "rare", stats: { res: 15, resistFire: 0.15, fire: 0.05 }, value: 400, desc: "Warm from six old shrines. It remembers the pact." },
    { id: "t_signet", name: "Red Hand Signet", type: "trinket", slot: "trinket", rarity: "uncommon", stats: { atk: 2, crit: 0.02 }, value: 140, desc: "Garrick Fenn's ring. Bandits still flinch at it." },
    { id: "t_dragonheart", name: "Dragonheart Amulet", type: "trinket", slot: "trinket", rarity: "legendary", stats: { hp: 60, atk: 6, resistFire: 0.25 }, value: 2500, desc: "The ember of Vaelith's heart, cooled in silver." },
    { id: "t_feather", name: "Vaelith's Ember Feather", type: "trinket", slot: "trinket", rarity: "legendary", stats: { atk: 5, res: 25, resistFire: 0.4, hp: 30 }, value: 2500, desc: "A gift from a dragon set free. It burns without heat." },
    /* ---------------------------------------------------- consumables */
    { id: "p_heal", name: "Healing Draught", type: "potion", rarity: "common", stack: true, value: 25, heal: 0.45, desc: "Restores 45% health over a moment." },
    { id: "p_greater", name: "Greater Healing", type: "potion", rarity: "uncommon", stack: true, value: 70, heal: 0.8, desc: "Restores 80% health." },
    { id: "p_tonic", name: "Ember Tonic", type: "potion", rarity: "common", stack: true, value: 30, restore: 0.6, desc: "Restores 60% stamina and your class resource." },
    /* ---------------------------------------------------- materials */
    { id: "m_iron", name: "Iron Scrap", type: "material", rarity: "common", stack: true, value: 6, desc: "Used by smiths to upgrade weapons." },
    { id: "m_ember", name: "Ember Shard", type: "material", rarity: "rare", stack: true, value: 60, desc: "A splinter of old dragonfire. Smiths need it for the finest work." },
    { id: "m_hide", name: "Wolf Pelt", type: "material", rarity: "common", stack: true, value: 12, desc: "Thick grey fur. Sells well." },
    /* ---------------------------------------------------- quest items */
    { id: "q_testament", name: "The King's Testament", type: "quest", rarity: "epic", value: 0, desc: "Sealed with King Aldric's wax. Tobias carried it from the Hold." },
    { id: "q_key", name: "Rusted Grate Key", type: "quest", rarity: "uncommon", value: 0, desc: "Brannoc's key to the smugglers' grate under Ashfall." },
    { id: "q_pelt", name: "Greyfang's Pelt", type: "quest", rarity: "rare", value: 0, desc: "The silver-grey pelt of the Elderwood alpha." },
    { id: "q_ore", name: "Frostiron Ore", type: "quest", rarity: "uncommon", stack: true, value: 0, desc: "Blue-veined ore from the Frostfang Mines." },
    { id: "q_locket", name: "Silver Locket", type: "quest", rarity: "uncommon", value: 0, desc: "A locket with a painted portrait inside. Elsie's." },
    { id: "q_heartstone", name: "The Heartstone", type: "quest", rarity: "legendary", value: 0, desc: "The ember heart of the Crown of Ashes. It beats, faintly, in your hand." },
  ].map((i) => [i.id, i])
);

/** Starting kits. */
export const START_KIT = {
  knight: { equip: { weapon: "w_longsword", offhand: "s_warden", chest: "c_gambeson", hands: "g_wraps", legs: "l_boots" }, bag: [["p_heal", 3], ["p_tonic", 1]] },
  archer: { equip: { weapon: "w_huntbow", offhand: "o_quiver", chest: "c_leather", hands: "g_wraps", legs: "l_boots" }, bag: [["p_heal", 3], ["p_tonic", 1]] },
  mage: { equip: { weapon: "w_oakstaff", offhand: "o_tome", chest: "c_tunic", hands: "g_wraps", legs: "l_boots" }, bag: [["p_heal", 3], ["p_tonic", 2]] },
  rogue: { equip: { weapon: "w_daggers", offhand: "o_smoke", chest: "c_leather", hands: "g_wraps", legs: "l_boots" }, bag: [["p_heal", 3], ["p_tonic", 1]] },
};

/** Weapon upgrades: +1…+5, each +12% weapon attack. */
export const UPGRADES = [
  null,
  { gold: 60, iron: 2, ember: 0 },
  { gold: 120, iron: 3, ember: 0 },
  { gold: 220, iron: 4, ember: 1 },
  { gold: 360, iron: 5, ember: 2 },
  { gold: 520, iron: 6, ember: 3 },
];
export const UPGRADE_MULT = 0.12;

/**
 * Loot tables: gold [min,max], then weighted drops. `class: true` picks the
 * player's own class weapon of that rarity.
 */
export const LOOT = {
  bandit: { gold: [4, 14], rolls: 1, drops: [[0.25, "p_heal"], [0.25, "m_iron"], [0.06, "c_leather"], [0.05, "h_hood"], [0.03, { classWeapon: "uncommon" }], [0.04, "t_coin"]] },
  archerBandit: { gold: [4, 12], rolls: 1, drops: [[0.25, "p_heal"], [0.2, "m_iron"], [0.05, "l_leather"], [0.03, { classWeapon: "uncommon" }]] },
  wolf: { gold: [0, 2], rolls: 1, drops: [[0.6, "m_hide"], [0.05, "t_wolftooth"]] },
  corrupted: { gold: [10, 24], rolls: 1, drops: [[0.3, "p_heal"], [0.35, "m_iron"], [0.08, "m_ember"], [0.06, "l_greaves"], [0.05, "h_nasal"], [0.05, "c_mail"], [0.05, { classWeapon: "rare" }]] },
  elite: { gold: [30, 60], rolls: 2, drops: [[0.5, "m_iron"], [0.25, "m_ember"], [0.2, "p_greater"], [0.12, "g_gauntlets"], [0.1, "h_great"], [0.1, "c_plate"], [0.12, { classWeapon: "rare" }]] },
  undead: { gold: [6, 18], rolls: 1, drops: [[0.3, "m_iron"], [0.12, "m_ember"], [0.2, "p_tonic"], [0.06, "t_coin"]] },
  boss: { gold: [120, 200], rolls: 3, drops: [[1, "m_ember"], [0.7, "p_greater"], [0.6, { classWeapon: "epic" }], [0.5, "m_iron"]] },
  // chests
  chest: { gold: [20, 60], rolls: 2, drops: [[0.5, "p_heal"], [0.4, "m_iron"], [0.2, "p_tonic"], [0.12, "m_ember"], [0.1, { classWeapon: "uncommon" }], [0.08, "l_strider"], [0.06, "g_bracers"]] },
  chestRich: { gold: [60, 140], rolls: 3, drops: [[0.6, "p_greater"], [0.5, "m_ember"], [0.4, { classWeapon: "rare" }], [0.25, "h_shadowhood"], [0.25, "c_ranger"], [0.2, "g_gauntlets"]] },
};
/** Specific chests that always hold something memorable. */
export const CHEST_LOOT = {
  c_lodge: { table: "chest", fixed: [["p_heal", 2]] },
  c_den: { table: "chest", fixed: [["m_hide", 3], ["t_wolftooth", 1]] },
  c_garrick: { table: "chestRich", fixed: [["t_signet", 1]] },
  c_tower: { table: "chest", fixed: [["l_strider", 1]] },
  c_castle: { table: "chestRich", fixed: [["s_kite", 1, "knight"], ["w_yewbow", 1, "archer"], ["w_emberstaff", 1, "mage"], ["w_kris", 1, "rogue"]] },
  c_mines: { table: "chest", fixed: [["m_ember", 1]] },
  c_stones: { table: "chest", fixed: [["h_circlet", 1]] },
  c_keep: { table: "chestRich", fixed: [["m_ember", 2]] },
  c_hoard: { table: "chestRich", fixed: [["m_ember", 3], ["p_greater", 2]] },
  c_south: { table: "chest", fixed: [["c_shadow", 1]] },
  c_east: { table: "chest", fixed: [["o_codex", 1, "mage"], ["o_greyquiver", 1, "archer"], ["o_poison", 1, "rogue"], ["s_kite", 1, "knight"]] },
  c_falls: { table: "chest", fixed: [["p_greater", 1]] },
  c_crypt1: { table: "chestRich", fixed: [] },
  c_crypt2: { table: "chestRich", fixed: [["h_great", 1]] },
  c_crypt3: { table: "chestRich", fixed: [] },
  c_crypt4: { table: "chestRich", fixed: [["p_greater", 1]] },
  c_tunnel1: { table: "chest", fixed: [["p_heal", 2]] },
};

/** Merchants: what they stock (restocks each visit) and the markup. */
export const SHOPS = {
  trader: { name: "Odo's Wares", keeper: "odo", stock: ["p_heal", "p_heal", "p_tonic", "h_hood", "c_tunic", "c_leather", "g_bracers", "l_leather", "t_coin", "m_iron"], buy: 1, sell: 0.4 },
  smith: { name: "Ironhand Forge", keeper: "doran", stock: ["w_steelblade", "w_yewbow", "w_emberstaff", "w_kris", "s_buckler", "c_gambeson", "c_mail", "h_nasal", "l_greaves", "m_iron"], buy: 1, sell: 0.4, upgrades: true },
  quartermaster: { name: "Wintermere Armoury", keeper: "hale", stock: ["p_heal", "p_greater", "c_plate", "h_great", "g_gauntlets", "s_kite", "w_frostbrand", "w_galebow", "l_strider", "c_ranger"], buy: 1.05, sell: 0.4, upgrades: true },
  arcanist: { name: "Magister Ilyra's Curios", keeper: "ilyra", stock: ["p_tonic", "p_tonic", "p_greater", "w_pyrestaff", "o_codex", "c_robe", "h_circlet", "t_talisman", "w_ashbow", "m_ember"], buy: 1.1, sell: 0.45 },
  fence: { name: "Pell's Back Room", keeper: "pell", stock: ["p_heal", "w_fangs", "c_shadow", "h_shadowhood", "o_poison", "l_strider", "o_greyquiver"], buy: 1.15, sell: 0.5 },
};
